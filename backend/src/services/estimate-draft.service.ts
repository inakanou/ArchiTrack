/**
 * @fileoverview 見積明細の一括保存サービス（差分適用）
 *
 * 編集画面が保持するツリー全体を受領し、DB の現状と突き合わせて
 * 追加・削除・更新を単一トランザクションで確定する。
 *
 * 設計上の要点（design.md「Backend / estimate-draft.service」）:
 * - トランザクション開始前に全件検証を行い、検証NG時は書き込みを一切発生させない（42.4）
 * - 既存項目は**IDを維持して更新**する。`ExecutionBudgetItem.estimateItemId`
 *   （`onDelete: SetNull`）の参照を切らないため、削除＋再作成は行わない（42.9）
 * - 子孫の削除は `EstimateItem.parentId` の `onDelete: Cascade` に委ね、個別削除は行わない
 * - 新規項目の親子関係は一時ID（`tempId`）から生成IDへの対応表で解決する
 *
 * Requirements (estimate-creation):
 * - 29.4: 自動計算された親項目の金額をデータベースに反映し、再読み込み後も同じ金額を表示する
 * - 34.1: 追加された項目をデータベースに登録する
 * - 34.2: 削除された項目をデータベースから削除する
 * - 34.3: 編集された最新の内容をデータベースに反映する
 * - 34.4: 追加・削除・更新の全ての変更タイプを正しく処理する
 * - 34.5: 変更後の並び順と階層をデータベースに反映する
 * - 34.6: 転記・案分・利益率適用等の結果を反映し、再読み込み後も反映後の内容を表示する
 * - 42.1: 追加・削除・更新・並び順の変更・階層の変更を1回の保存操作でまとめて確定する
 * - 42.2: 保存成功時に保存後の最新の明細内容を返す
 * - 42.3: 一部に失敗した場合は変更をすべて破棄して保存前の状態を保つ
 * - 42.4: 入力内容に不備がある場合は保存を開始しない
 * - 42.5: 保存開始後に他のユーザーが更新していた場合は保存を中止する（409）
 * - 42.6: 明細の並び順を画面に表示されている順序どおりに確定する
 * - 42.7: 保存成功時に未保存の変更がない状態へ戻せる（最新状態を返す）
 * - 42.9: 既存の見積項目と実行予算項目からの参照関係を維持する
 * - 54.8: 帳票用入力項目の変更を保存操作で確定する
 *
 * Task 52.4: 明細の差分適用と親子関係の解決
 * Task 52.5: 楽観ロックと並び順の再採番および最新状態の返却
 *
 * 本タスクの対象外（後続タスクが担当する）:
 * - 一括UPDATE化によるN+1解消 → 52.6
 *
 * 設計は `quantity-table.service.ts` の `saveDraft` を参照元とするが、
 * 数量表への波及を避けるためコードは共有せず見積書用に独立実装する。
 *
 * @module services/estimate-draft
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import {
  EstimateNotFoundError,
  EstimateDraftValidationError,
  EstimateConflictError,
} from '../errors/estimateError.js';
import type {
  SaveEstimateDraftInput,
  SaveEstimateItemNodeInput,
  SaveEstimateLineInput,
  SaveEstimateReportFieldsInput,
} from '../schemas/estimate.schema.js';

/**
 * Prismaトランザクションクライアント型
 */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * 見積明細一括保存サービス依存関係
 */
export interface EstimateDraftServiceDependencies {
  prisma: PrismaClient;
}

/**
 * 差分適用の検証メッセージ（42.4）
 *
 * 検証NGは 422 として呼び出し元へ返るため、利用者に提示できる日本語とする。
 */
export const ESTIMATE_DRAFT_VALIDATION_MESSAGES = {
  ITEM_NOT_IN_ESTIMATE: '指定された見積項目はこの見積書に存在しません',
} as const;

/**
 * 差分適用の結果
 */
export interface SaveEstimateDraftDiffResult {
  /** 新規作成した見積項目のID（ペイロードの走査順） */
  readonly createdItemIds: readonly string[];
  /** 更新した既存見積項目のID（IDは維持される） */
  readonly updatedItemIds: readonly string[];
  /** 削除した見積項目のID（連鎖削除される子孫を含む） */
  readonly deletedItemIds: readonly string[];
  /** 一時IDから生成IDへの対応表（親子関係の解決に用いた写像） */
  readonly tempIdMap: Readonly<Record<string, string>>;
}

/**
 * 保存後の帳票用入力項目（54.1〜54.3, 54.8）
 */
export interface SavedEstimateReportFields {
  /** 提出日（未入力は null） */
  readonly submissionDate: Date | null;
  /** 有効期限（未入力は null） */
  readonly validityPeriod: string | null;
  /** 別途工事（入力順を保持） */
  readonly separateWorks: readonly string[];
}

/**
 * 保存後の見積書サマリ
 *
 * `updatedAt` は次回保存の楽観ロック基準時刻として呼び出し元がそのまま用いる（42.5）。
 */
export interface SavedEstimateSummary {
  readonly id: string;
  readonly updatedAt: Date;
  readonly reportFields: SavedEstimateReportFields;
}

/**
 * 保存後の明細行
 *
 * `GET /api/estimates/:id/items`（`EstimateItemService.getHierarchy`）の返却形に合わせる。
 * 呼び出し元が保存後に追加取得を行わずに済むよう、同じ形で返す（42.2）。
 */
export interface SavedEstimateItemLine {
  readonly id: string;
  readonly estimateItemId: string;
  readonly lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR';
  readonly name: string | null;
  readonly specification: string | null;
  readonly unit: string | null;
  readonly quantity: number | null;
  readonly unitPrice: number | null;
  readonly amount: number | null;
  readonly remarks: string | null;
  readonly sourceReceivedQuotationLineItemId: string | null;
  readonly sourceVendorName: string | null;
}

/**
 * 保存後の見積項目（階層構造）
 */
export interface SavedEstimateItemNode {
  readonly id: string;
  readonly estimateId: string;
  readonly parentId: string | null;
  readonly displayOrder: number;
  readonly itemType: SaveEstimateItemNodeInput['itemType'];
  readonly lines: readonly SavedEstimateItemLine[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly children: readonly SavedEstimateItemNode[];
}

/**
 * 一括保存の結果
 *
 * 保存後の最新状態（見積書サマリ＋明細ツリー）を含むため、呼び出し元は
 * 追加の取得を必要としない（42.2, 42.7）。
 */
export interface SaveEstimateDraftResult extends SaveEstimateDraftDiffResult {
  /** 保存後の見積書サマリ */
  readonly estimate: SavedEstimateSummary;
  /** 保存後の明細ツリー（ルート項目の配列） */
  readonly items: readonly SavedEstimateItemNode[];
}

/** 保存後の最新状態（DBから読み直した結果） */
interface SavedEstimateState {
  readonly estimate: SavedEstimateSummary;
  readonly items: readonly SavedEstimateItemNode[];
}

/** DB上の既存見積項目（差分計算に必要な最小限） */
interface ExistingItemRow {
  readonly id: string;
  readonly parentId: string | null;
}

/**
 * 保存後に読み直した見積項目の行（Prismaの返却形）
 *
 * 数量・単価・金額は Prisma の `Decimal` として返るため `unknown` で受け、
 * 呼び出し元へ返す際に数値へ変換する。
 */
interface SavedItemRow {
  readonly id: string;
  readonly estimateId: string;
  readonly parentId: string | null;
  readonly displayOrder: number;
  readonly itemType: SaveEstimateItemNodeInput['itemType'];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lines: readonly {
    readonly id: string;
    readonly estimateItemId: string;
    readonly lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR';
    readonly name: string | null;
    readonly specification: string | null;
    readonly unit: string | null;
    readonly quantity: unknown;
    readonly unitPrice: unknown;
    readonly amount: unknown;
    readonly remarks: string | null;
    readonly sourceReceivedQuotationLineItemId: string | null;
    readonly sourceVendorName: string | null;
  }[];
}

/** 深さ優先走査の作業単位（親は解決済み） */
interface TraversalFrame {
  readonly node: SaveEstimateItemNodeInput;
  readonly siblingIndex: number;
  readonly parentId: string | null;
  readonly parentTempId: string | null;
}

/**
 * 見積明細一括保存サービス
 */
export class EstimateDraftService {
  private readonly prisma: PrismaClient;

  constructor(deps: EstimateDraftServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * 明細ツリーの差分を適用する
   *
   * 手順:
   * 1. トランザクション開始前の全件検証（読み取りのみ・書き込みゼロ）
   * 2. 楽観ロックの照合（不一致なら書き込みゼロで 409、42.5）
   * 3. トランザクション内で「帳票用入力項目の更新 → 切り離し → 削除 → 追加/更新」を実行
   * 4. 保存後の最新状態を同一トランザクション内で読み直して返す（42.2, 42.7）
   *
   * @param estimateId - 見積書ID
   * @param input - 一括保存入力（{@link SaveEstimateDraftInput} で検証済みの形）
   * @returns 適用した差分と保存後の最新状態
   * @throws EstimateNotFoundError 見積書が存在しない、または論理削除済みの場合（404）
   * @throws EstimateDraftValidationError 検証NGの場合（422・書き込みゼロ）
   * @throws EstimateConflictError 楽観ロック競合の場合（409・データ変更なし）
   */
  async saveDraft(
    estimateId: string,
    input: SaveEstimateDraftInput
  ): Promise<SaveEstimateDraftResult> {
    // ===== 1. トランザクション開始前の全件検証（42.4） =====
    // ここでの問い合わせは読み取りのみ。検証NGなら書き込みは一切発生しない。
    const estimate = await this.prisma.estimate.findUnique({
      where: { id: estimateId },
      select: { id: true, deletedAt: true, updatedAt: true },
    });

    if (!estimate || estimate.deletedAt !== null) {
      throw new EstimateNotFoundError(estimateId);
    }

    const existingItems: ExistingItemRow[] = await this.prisma.estimateItem.findMany({
      where: { estimateId },
      select: { id: true, parentId: true },
    });

    const frames = this.flattenPayload(input.items);
    this.validatePayloadItemOwnership(frames, existingItems);

    // ===== 2. 楽観ロックの照合（42.5） =====
    // design.md「保存フロー（42.1〜42.9）」の順序に従い、検証（422）の後・
    // トランザクション開始の前に照合する。競合時は書き込みが一切発生しない。
    const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
    if (estimate.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new EstimateConflictError({
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
        actualUpdatedAt: estimate.updatedAt.toISOString(),
      });
    }

    // ===== 3. 差分適用（単一トランザクション、42.1, 42.3） =====
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      await this.applyEstimateUpdate(tx, estimateId, input.reportFields, expectedUpdatedAt);

      const deletedItemIds = await this.applyDeletions(tx, frames, existingItems);
      const { createdItemIds, updatedItemIds, tempIdMap } = await this.applyUpserts(
        tx,
        estimateId,
        frames
      );

      // ===== 4. 保存後の最新状態を返す（42.2, 42.7, 34.6, 29.4） =====
      const saved = await this.loadSavedState(tx, estimateId);

      return {
        createdItemIds,
        updatedItemIds,
        deletedItemIds,
        tempIdMap,
        estimate: saved.estimate,
        items: saved.items,
      };
    });
  }

  /**
   * 帳票用入力項目を保存し、楽観ロックを確定させる（54.8, 42.5）
   *
   * `where` に基準時刻を含めた条件付きUPDATEとすることで、事前照合を通過した後に
   * 他トランザクションがコミットした場合も検出できる（PostgreSQL の既定分離レベルは
   * READ COMMITTED のため、事前照合だけでは同時保存を取りこぼす）。
   * 更新件数が0なら競合として例外を投げ、トランザクション全体を巻き戻す。
   *
   * `Estimate.updatedAt` は Prisma の `@updatedAt` により本UPDATEで更新される
   * （design.md「estimate-draft.service」Postconditions）。
   */
  private async applyEstimateUpdate(
    tx: PrismaTransactionClient,
    estimateId: string,
    reportFields: SaveEstimateReportFieldsInput,
    expectedUpdatedAt: Date
  ): Promise<void> {
    const result = await tx.estimate.updateMany({
      where: { id: estimateId, updatedAt: expectedUpdatedAt },
      data: {
        submissionDate:
          reportFields.submissionDate === null ? null : new Date(reportFields.submissionDate),
        validityPeriod: reportFields.validityPeriod,
        separateWorks: reportFields.separateWorks,
      },
    });

    if (result.count === 0) {
      throw new EstimateConflictError({
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      });
    }
  }

  /**
   * 保存後の最新状態を読み直す（42.2, 42.7）
   *
   * 同一トランザクション内で読むため、直前の書き込みを反映した一貫した断面になる。
   * 明細は `GET /api/estimates/:id/items` と同じ並び（親スコープごとの `displayOrder` 昇順）
   * ・同じ形の階層構造で返し、呼び出し元が追加取得を必要としないようにする。
   */
  private async loadSavedState(
    tx: PrismaTransactionClient,
    estimateId: string
  ): Promise<SavedEstimateState> {
    const estimate = await tx.estimate.findUnique({
      where: { id: estimateId },
      select: {
        id: true,
        updatedAt: true,
        submissionDate: true,
        validityPeriod: true,
        separateWorks: true,
      },
    });

    if (!estimate) {
      // 同一トランザクション内で更新済みのため到達しない
      throw new EstimateNotFoundError(estimateId);
    }

    const rows = await tx.estimateItem.findMany({
      where: { estimateId },
      include: {
        lines: {
          orderBy: { lineType: 'asc' },
        },
      },
      orderBy: [{ parentId: 'asc' }, { displayOrder: 'asc' }],
    });

    return {
      estimate: {
        id: estimate.id,
        updatedAt: estimate.updatedAt,
        reportFields: {
          submissionDate: estimate.submissionDate,
          validityPeriod: estimate.validityPeriod,
          separateWorks: estimate.separateWorks,
        },
      },
      items: this.buildSavedItemTree(rows),
    };
  }

  /**
   * 平坦な見積項目配列から階層ツリーを組み立てる
   *
   * 入力は親スコープごとに `displayOrder` 昇順で並んでいるため、
   * 出現順に押し込むだけで各スコープの並び順が保たれる。
   */
  private buildSavedItemTree(rows: readonly SavedItemRow[]): SavedEstimateItemNode[] {
    const nodeMap = new Map<
      string,
      SavedEstimateItemNode & { children: SavedEstimateItemNode[] }
    >();
    const roots: SavedEstimateItemNode[] = [];

    for (const row of rows) {
      nodeMap.set(row.id, {
        id: row.id,
        estimateId: row.estimateId,
        parentId: row.parentId,
        displayOrder: row.displayOrder,
        itemType: row.itemType,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lines: row.lines.map((line) => ({
          id: line.id,
          estimateItemId: line.estimateItemId,
          lineType: line.lineType,
          name: line.name,
          specification: line.specification,
          unit: line.unit,
          quantity: line.quantity === null ? null : Number(line.quantity),
          unitPrice: line.unitPrice === null ? null : Number(line.unitPrice),
          amount: line.amount === null ? null : Number(line.amount),
          remarks: line.remarks,
          sourceReceivedQuotationLineItemId: line.sourceReceivedQuotationLineItemId,
          sourceVendorName: line.sourceVendorName,
        })),
        children: [],
      });
    }

    for (const row of rows) {
      const node = nodeMap.get(row.id)!;
      if (row.parentId === null) {
        roots.push(node);
        continue;
      }
      // 親が見つからない孤児は 42.4 の検証で弾かれるため通常は発生しない
      nodeMap.get(row.parentId)?.children.push(node);
    }

    return roots;
  }

  /**
   * ペイロードのツリーを深さ優先の事前順（親→子）で平坦化する
   *
   * 事前順で走査することで、新規項目を作成する時点で親の生成IDが必ず確定している。
   * 再帰ではなく明示的なスタックとし、深い階層でもコールスタックを消費しない。
   */
  private flattenPayload(items: readonly SaveEstimateItemNodeInput[]): TraversalFrame[] {
    const ordered: TraversalFrame[] = [];
    // 末尾から積むことで配列順どおりに取り出せる
    const stack: TraversalFrame[] = items
      .map((node, index) => ({
        node,
        siblingIndex: index,
        parentId: null,
        parentTempId: null,
      }))
      .reverse();

    for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
      ordered.push(frame);
      const { node } = frame;
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push({
          node: node.children[index]!,
          siblingIndex: index,
          parentId: node.id,
          parentTempId: node.tempId,
        });
      }
    }

    return ordered;
  }

  /**
   * ペイロードの既存IDがすべてこの見積書のものかを検証する（42.4, 42.8）
   *
   * 他の見積書の項目IDや削除済みIDが混ざると、差分適用時に他見積書のデータを
   * 書き換える、あるいは親を解決できない項目を生む。書き込み前に弾く。
   */
  private validatePayloadItemOwnership(
    frames: readonly TraversalFrame[],
    existingItems: readonly ExistingItemRow[]
  ): void {
    const existingIds = new Set(existingItems.map((item) => item.id));
    const issues: { path: string; message: string }[] = [];

    for (const frame of frames) {
      const { id } = frame.node;
      if (id !== null && !existingIds.has(id)) {
        issues.push({
          path: `items.${id}`,
          message: ESTIMATE_DRAFT_VALIDATION_MESSAGES.ITEM_NOT_IN_ESTIMATE,
        });
      }
    }

    if (issues.length > 0) {
      throw new EstimateDraftValidationError(issues);
    }
  }

  /**
   * ペイロードに存在しない既存項目を削除する（34.2）
   *
   * - 子孫は `EstimateItem.parentId` の `onDelete: Cascade` に委ね、個別削除しない。
   *   このため削除は「削除対象の根」に限定して発行する
   * - 削除対象を親に持つ**存続項目**（＝別の親へ移動した項目）は、連鎖削除に
   *   巻き込まれないよう先に親から切り離す。切り離さずに削除すると、
   *   移動した項目が消えたうえで直後の更新が失敗しトランザクション全体が巻き戻る
   *
   * @returns 削除された項目のID（連鎖削除される子孫を含む）
   */
  private async applyDeletions(
    tx: PrismaTransactionClient,
    frames: readonly TraversalFrame[],
    existingItems: readonly ExistingItemRow[]
  ): Promise<string[]> {
    const payloadItemIds = new Set(
      frames.map((frame) => frame.node.id).filter((id): id is string => id !== null)
    );
    const doomedIds = new Set(
      existingItems.map((item) => item.id).filter((id) => !payloadItemIds.has(id))
    );

    if (doomedIds.size === 0) {
      return [];
    }

    // 削除対象を親に持つ存続項目を先に切り離す（連鎖削除の巻き込み回避）
    const detachIds = existingItems
      .filter(
        (item) => !doomedIds.has(item.id) && item.parentId !== null && doomedIds.has(item.parentId)
      )
      .map((item) => item.id);

    if (detachIds.length > 0) {
      await tx.estimateItem.updateMany({
        where: { id: { in: detachIds } },
        data: { parentId: null },
      });
    }

    // 削除対象の根＝親が削除対象でないもの。子孫は連鎖削除に委ねる
    const deletionRootIds = existingItems
      .filter(
        (item) =>
          doomedIds.has(item.id) && (item.parentId === null || !doomedIds.has(item.parentId))
      )
      .map((item) => item.id);

    await tx.estimateItem.deleteMany({
      where: { id: { in: deletionRootIds } },
    });

    return [...doomedIds];
  }

  /**
   * 新規項目の作成と既存項目の更新を行う（34.1, 34.3, 34.4, 42.9）
   *
   * 事前順の走査で親から処理するため、子を処理する時点で親の生成IDが確定している。
   * 既存項目はIDを維持したまま UPDATE し、削除＋再作成は行わない（42.9）。
   */
  private async applyUpserts(
    tx: PrismaTransactionClient,
    estimateId: string,
    frames: readonly TraversalFrame[]
  ): Promise<{
    createdItemIds: string[];
    updatedItemIds: string[];
    tempIdMap: Record<string, string>;
  }> {
    const createdItemIds: string[] = [];
    const updatedItemIds: string[] = [];
    // 一時IDから生成IDへの対応表。子の親解決に用いる
    const tempIdMap: Record<string, string> = {};

    for (const frame of frames) {
      const { node } = frame;
      const parentId = this.resolveParentId(frame, tempIdMap);

      if (node.id === null) {
        // 新規項目。displayOrder は受領配列順の兄弟内位置（0起点連番）とする（42.6）
        const created = await tx.estimateItem.create({
          data: {
            estimateId,
            parentId,
            itemType: node.itemType,
            displayOrder: frame.siblingIndex,
            lines: {
              create: node.lines.map((line) => this.buildLinePersistData(line, node.itemType)),
            },
          },
          select: { id: true },
        });

        createdItemIds.push(created.id);
        if (node.tempId !== null) {
          tempIdMap[node.tempId] = created.id;
        }
        continue;
      }

      // 既存項目。IDを維持して更新し、実行予算項目からの参照を切らない（42.9）
      // displayOrder は新規・既存を問わず受領配列順で再採番する。既存項目を
      // 据え置くと、新規項目に振った0起点の連番と衝突する（34.5, 42.6）
      await tx.estimateItem.update({
        where: { id: node.id },
        data: {
          parentId,
          itemType: node.itemType,
          displayOrder: frame.siblingIndex,
        },
      });
      await this.applyLineDiff(tx, node.id, node);
      updatedItemIds.push(node.id);
    }

    return { createdItemIds, updatedItemIds, tempIdMap };
  }

  /**
   * 走査中のノードの親IDを解決する
   *
   * 親が既存項目ならそのID、新規項目なら一時IDから生成IDを引く。
   */
  private resolveParentId(
    frame: TraversalFrame,
    tempIdMap: Readonly<Record<string, string>>
  ): string | null {
    if (frame.parentId !== null) {
      return frame.parentId;
    }
    if (frame.parentTempId !== null) {
      const resolved = tempIdMap[frame.parentTempId];
      if (resolved === undefined) {
        // 事前順走査では親が必ず先に作成されるため到達しない。
        // 到達した場合は親を失った項目を作るより、全体を巻き戻す方が安全
        throw new EstimateDraftValidationError([
          {
            path: `items.${frame.parentTempId}`,
            message: ESTIMATE_DRAFT_VALIDATION_MESSAGES.ITEM_NOT_IN_ESTIMATE,
          },
        ]);
      }
      return resolved;
    }
    return null;
  }

  /**
   * 既存項目の明細行を差分適用する（34.3）
   *
   * `EstimateItemLine` は `estimateItemId + lineType` が一意のため、行タイプを鍵に
   * 突き合わせる。ペイロードから消えた行タイプは削除し、残る行は upsert する。
   */
  private async applyLineDiff(
    tx: PrismaTransactionClient,
    itemId: string,
    node: SaveEstimateItemNodeInput
  ): Promise<void> {
    const payloadLineTypes = node.lines.map((line) => line.lineType);

    await tx.estimateItemLine.deleteMany({
      where: {
        estimateItemId: itemId,
        lineType: { notIn: payloadLineTypes },
      },
    });

    for (const line of node.lines) {
      const data = this.buildLinePersistData(line, node.itemType);
      await tx.estimateItemLine.upsert({
        where: {
          estimateItemId_lineType: {
            estimateItemId: itemId,
            lineType: line.lineType,
          },
        },
        create: {
          estimateItemId: itemId,
          ...data,
        },
        update: data,
      });
    }
  }

  /**
   * 明細行の永続化データを組み立てる
   *
   * 数量・単価・金額は精度欠落を避けるため10進数文字列のまま Prisma へ渡す。
   *
   * 注記行（`NOTE`）は design.md「保存ペイロードとDB状態の対応」直前の
   * 「`NOTE` 項目は `name` 以外は NULL とする」に従い、名称以外を NULL へ正規化する（55.1）。
   * スキーマ（52.3）は「子を持たない」「見積金額行1件のみ」までしか担保しないため、
   * 正規化は書き込み側である本サービスの責務となる。
   */
  private buildLinePersistData(
    line: SaveEstimateLineInput,
    itemType: SaveEstimateItemNodeInput['itemType']
  ): {
    lineType: SaveEstimateLineInput['lineType'];
    name: string | null;
    specification: string | null;
    unit: string | null;
    quantity: string | null;
    unitPrice: string | null;
    amount: string | null;
    remarks: string | null;
    sourceVendorName: string | null;
  } {
    const isNote = itemType === 'NOTE';

    return {
      lineType: line.lineType,
      name: line.name,
      specification: isNote ? null : line.specification,
      unit: isNote ? null : line.unit,
      quantity: isNote ? null : line.quantity,
      unitPrice: isNote ? null : line.unitPrice,
      amount: isNote ? null : line.amount,
      remarks: isNote ? null : line.remarks,
      sourceVendorName: isNote ? null : line.sourceVendorName,
    };
  }
}
