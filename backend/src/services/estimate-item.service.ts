/**
 * @fileoverview 見積項目サービス
 *
 * 見積項目の参照・個別作成（諸経費行／値引き行）・受領見積書転記を担当します。
 *
 * 明細の削除・複写・並び替え・階層移動・一括更新は一括保存
 * （`EstimateDraftService.saveDraft` ＝ `PUT /api/estimates/:id/save`）へ統合したため、
 * 本サービスからは撤去済み（REQ-42.1、Task 53.12）。
 *
 * Requirements (estimate-creation):
 * - REQ-1.2: 見積項目行を「見積金額行」「実行金額行」「業者金額行」の3行1セットで構成する
 * - REQ-1.6: 各見積項目行に名称・規格・単位・数量・単価・備考の入力フィールドを提供する
 * - REQ-2.1: 見積項目に親子関係を設定可能とする
 * - REQ-2.2: その項目を親項目の子として階層表示する
 * - REQ-2.4: 複数階層のネスト（例：建築工事 > 直接仮設工事 > 遣り方）をサポートする
 * - REQ-4.1: 指定した見積項目行の業者金額行に受領見積書の内容を転記する
 * - REQ-4.2: 見積項目行を指定せずに受領見積書の行を選択した場合、新規見積項目行を作成しその業者金額行に転記する
 * - REQ-4.3: 受領見積書から名称・規格・単位・数量・単価を転記対象とする
 * - REQ-12.1: 新規の3行1セット（見積・実行・業者金額行）を作成する
 *
 * Task 2.2: EstimateItemServiceの実装
 * Task 2.3: 受領見積書転記機能の実装
 * Task 53.12: 明細操作系の撤去（一括保存へ統合）
 *
 * @module services/estimate-item
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import {
  EstimateNotFoundError,
  EstimateItemNotFoundError,
  EstimateItemNotBelongToEstimateError,
  ReceivedQuotationLineItemNotFoundError,
} from '../errors/estimateError.js';
import { ReceivedQuotationNotFoundError } from '../errors/receivedQuotationError.js';
import Decimal from 'decimal.js';

/**
 * 見積項目サービス依存関係
 */
export interface EstimateItemServiceDependencies {
  prisma: PrismaClient;
}

/**
 * 見積項目行入力
 */
export interface CreateLineInput {
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR';
  name?: string | null;
  specification?: string | null;
  unit?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  remarks?: string | null;
}

/**
 * 見積項目種別（永続化された値。Prisma enum `EstimateItemType` と同一集合）
 *
 * - STANDARD: 通常項目（見積・実行・業者の3行1セット）
 * - DISCOUNT: 値引き行（見積金額行のみ。実行・業者行を持たない、REQ-41.3）
 * - NOTE: 注記行（名称のみ。金額集計の対象外、REQ-55.1/55.2）
 *
 * NOTE 行は一括保存（`PUT /api/estimates/:id/save`）から生成されるため、
 * `GET /api/estimates/:id/items` の返却値にも現れる。集合から NOTE を落とすと
 * 返却値の型が実際の値を偽ることになるため含める。
 */
export type EstimateItemTypeValue = 'STANDARD' | 'DISCOUNT' | 'NOTE';

/**
 * 個別作成で指定できる見積項目種別
 *
 * NOTE 行の生成経路は一括保存のみで、本サービスの `createItem`
 * （諸経費行・値引き行の追加で使用）からは作れない。
 */
export type CreatableEstimateItemTypeValue = Exclude<EstimateItemTypeValue, 'NOTE'>;

/**
 * 値引きプリセット行（REQ-41.2）
 *
 * 値引き行追加時の見積金額行（ESTIMATE）の初期値。
 * 名称＝値引き、規格＝空文字、単位＝式、数量＝1。
 * 単価は手入力前提（REQ-41.4）かつ負数を許容（REQ-41.5）するため含めない。
 */
export const DISCOUNT_PRESET_LINE = {
  name: '値引き',
  specification: '',
  unit: '式',
  quantity: 1,
} as const;

/**
 * 見積項目作成入力
 */
export interface CreateItemInput {
  parentId?: string | null;
  displayOrder: number;
  /** 項目種別（省略時 STANDARD）。DISCOUNT の場合は見積金額行のみ生成（REQ-41.3） */
  itemType?: CreatableEstimateItemTypeValue;
  lines: CreateLineInput[];
}

/**
 * 見積項目行情報
 */
export interface EstimateItemLineInfo {
  id: string;
  estimateItemId: string;
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR';
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  remarks: string | null;
  sourceReceivedQuotationLineItemId: string | null;
  sourceVendorName: string | null;
}

/**
 * 見積項目情報（行を含む）
 */
export interface EstimateItemWithLines {
  id: string;
  estimateId: string;
  parentId: string | null;
  displayOrder: number;
  /** 項目種別（STANDARD=通常項目/DISCOUNT=値引き行/NOTE=注記行） */
  itemType: EstimateItemTypeValue;
  lines: EstimateItemLineInfo[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 見積項目階層情報
 */
export interface EstimateItemHierarchy extends EstimateItemWithLines {
  children: EstimateItemHierarchy[];
}

/**
 * 受領見積書転記入力
 */
export interface TransferQuotationParams {
  estimateId: string;
  receivedQuotationId: string;
  lineItemIds: string[];
  targetEstimateItemId?: string;
}

/**
 * Prismaトランザクションクライアント型
 */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * 見積項目サービス
 *
 * 見積項目の参照・個別作成（諸経費行／値引き行）・受領見積書転記を担当します。
 */
export class EstimateItemService {
  private readonly prisma: PrismaClient;

  constructor(deps: EstimateItemServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * 金額を計算する（数量×単価）
   */
  private calculateAmount(quantity: number | null, unitPrice: number | null): number | null {
    if (quantity === null || unitPrice === null) {
      return null;
    }
    const q = new Decimal(quantity);
    const p = new Decimal(unitPrice);
    return q.mul(p).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  }

  /**
   * 見積項目を作成する（3行1セット）
   *
   * Requirements: REQ-1.2, REQ-12.1, REQ-2.1
   *
   * @param estimateId - 見積書ID
   * @param input - 作成入力
   * @returns 作成された見積項目情報
   * @throws EstimateNotFoundError 見積書が存在しない場合
   * @throws EstimateItemNotFoundError 親項目が存在しない場合
   */
  async createItem(estimateId: string, input: CreateItemInput): Promise<EstimateItemWithLines> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 見積書の存在確認
      const estimate = await tx.estimate.findUnique({
        where: { id: estimateId },
        select: { id: true, deletedAt: true },
      });

      if (!estimate || estimate.deletedAt !== null) {
        throw new EstimateNotFoundError(estimateId);
      }

      // 2. 親項目の存在確認（指定された場合）
      if (input.parentId) {
        const parentItem = await tx.estimateItem.findUnique({
          where: { id: input.parentId },
          select: { id: true, estimateId: true },
        });

        if (!parentItem) {
          throw new EstimateItemNotFoundError(input.parentId);
        }

        if (parentItem.estimateId !== estimateId) {
          throw new EstimateItemNotBelongToEstimateError(input.parentId, estimateId);
        }
      }

      // 3. 見積項目を作成（種別に応じた行データを含む）
      //    - STANDARD: 見積・実行・業者の3行1セット（REQ-1.2）
      //    - DISCOUNT: 見積金額行のみ（実行・業者行を生成しない、REQ-41.3）
      const itemType: CreatableEstimateItemTypeValue = input.itemType ?? 'STANDARD';
      const linesData = this.prepareLinesToCreate(input.lines, itemType);

      const createdItem = await tx.estimateItem.create({
        data: {
          estimateId,
          parentId: input.parentId ?? null,
          displayOrder: input.displayOrder,
          itemType,
          lines: {
            create: linesData,
          },
        },
        include: {
          lines: {
            orderBy: { lineType: 'asc' },
          },
        },
      });

      return this.toEstimateItemWithLines(createdItem);
    });
  }

  /**
   * 行データを作成用に準備する
   *
   * - STANDARD: ESTIMATE/EXECUTION/VENDOR の3行を生成（REQ-1.2）
   * - DISCOUNT: ESTIMATE 行のみを生成（実行・業者行を作らない、REQ-41.3）
   *
   * 単価は省略可能（手入力前提）かつ負数を許容する。負の単価は
   * calculateAmount により負の金額として計算される（符号保持、REQ-41.5/41.6）。
   */
  private prepareLinesToCreate(
    lines: CreateLineInput[],
    itemType: CreatableEstimateItemTypeValue = 'STANDARD'
  ): Array<{
    lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR';
    name: string | null;
    specification: string | null;
    unit: string | null;
    quantity: number | null;
    unitPrice: number | null;
    amount: number | null;
    remarks: string | null;
  }> {
    const lineTypes: Array<'ESTIMATE' | 'EXECUTION' | 'VENDOR'> =
      itemType === 'DISCOUNT' ? ['ESTIMATE'] : ['ESTIMATE', 'EXECUTION', 'VENDOR'];
    const result: Array<{
      lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR';
      name: string | null;
      specification: string | null;
      unit: string | null;
      quantity: number | null;
      unitPrice: number | null;
      amount: number | null;
      remarks: string | null;
    }> = [];

    for (const lineType of lineTypes) {
      const inputLine = lines.find((l) => l.lineType === lineType);
      const quantity = inputLine?.quantity ?? null;
      const unitPrice = inputLine?.unitPrice ?? null;

      result.push({
        lineType,
        name: inputLine?.name ?? null,
        specification: inputLine?.specification ?? null,
        unit: inputLine?.unit ?? null,
        quantity,
        unitPrice,
        amount: this.calculateAmount(quantity, unitPrice),
        remarks: inputLine?.remarks ?? null,
      });
    }

    return result;
  }

  /**
   * 見積項目を階層構造で取得する
   *
   * Requirements: REQ-2.2, REQ-2.4
   *
   * @param estimateId - 見積書ID
   * @returns 階層構造の見積項目一覧
   */
  async getHierarchy(estimateId: string): Promise<EstimateItemHierarchy[]> {
    // 単一クエリで全項目を取得（N+1回避）
    const items = await this.prisma.estimateItem.findMany({
      where: { estimateId },
      include: {
        lines: {
          orderBy: { lineType: 'asc' },
        },
      },
      orderBy: [{ parentId: 'asc' }, { displayOrder: 'asc' }],
    });

    // クライアントサイドで階層構造を構築
    return this.buildHierarchyTree(items);
  }

  /**
   * フラットな配列から階層構造を構築
   */
  private buildHierarchyTree(
    items: Array<{
      id: string;
      estimateId: string;
      parentId: string | null;
      displayOrder: number;
      itemType?: string;
      createdAt: Date;
      updatedAt: Date;
      lines: Array<{
        id: string;
        estimateItemId: string;
        lineType: string;
        name: string | null;
        specification: string | null;
        unit: string | null;
        quantity: unknown;
        unitPrice: unknown;
        amount: unknown;
        remarks: string | null;
        sourceReceivedQuotationLineItemId: string | null;
        sourceVendorName: string | null;
      }>;
    }>
  ): EstimateItemHierarchy[] {
    const itemMap = new Map<string, EstimateItemHierarchy>();
    const roots: EstimateItemHierarchy[] = [];

    // 1パス目: マップ作成
    items.forEach((item) => {
      const itemWithLines = this.toEstimateItemWithLines(item);
      itemMap.set(item.id, { ...itemWithLines, children: [] });
    });

    // 2パス目: 親子関係構築
    items.forEach((item) => {
      const node = itemMap.get(item.id)!;
      if (item.parentId) {
        const parent = itemMap.get(item.parentId);
        parent?.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  /**
   * 受領見積書から見積項目に転記する
   *
   * Requirements: REQ-4.1, REQ-4.2, REQ-4.3
   *
   * @param params - 転記パラメータ
   * @returns 転記された見積項目一覧
   * @throws EstimateNotFoundError 見積書が存在しない場合
   * @throws ReceivedQuotationNotFoundError 受領見積書が存在しない場合
   * @throws EstimateItemNotFoundError 転記先の見積項目が存在しない場合
   */
  async transferFromQuotation(params: TransferQuotationParams): Promise<EstimateItemWithLines[]> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 見積書の存在確認
      const estimate = await tx.estimate.findUnique({
        where: { id: params.estimateId },
        select: { id: true, deletedAt: true },
      });

      if (!estimate || estimate.deletedAt !== null) {
        throw new EstimateNotFoundError(params.estimateId);
      }

      // 2. 受領見積書の存在確認（業者名取得のため関連を含む）
      const receivedQuotation = await tx.receivedQuotation.findUnique({
        where: { id: params.receivedQuotationId },
        select: {
          id: true,
          name: true,
          deletedAt: true,
          estimateRequest: {
            select: {
              tradingPartner: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!receivedQuotation || receivedQuotation.deletedAt !== null) {
        throw new ReceivedQuotationNotFoundError(params.receivedQuotationId);
      }

      const vendorName = receivedQuotation.estimateRequest.tradingPartner.name;

      // 3. 転記元の明細行を取得
      const lineItems = await tx.receivedQuotationLineItem.findMany({
        where: {
          id: { in: params.lineItemIds },
          receivedQuotationId: params.receivedQuotationId,
        },
        orderBy: { sortOrder: 'asc' },
      });

      if (lineItems.length === 0) {
        throw new ReceivedQuotationLineItemNotFoundError(params.lineItemIds.join(', '));
      }

      const results: EstimateItemWithLines[] = [];

      // 4. 転記先の見積項目が指定されている場合
      if (params.targetEstimateItemId) {
        const targetItem = await tx.estimateItem.findUnique({
          where: { id: params.targetEstimateItemId },
          select: { id: true, estimateId: true },
        });

        if (!targetItem) {
          throw new EstimateItemNotFoundError(params.targetEstimateItemId);
        }

        if (targetItem.estimateId !== params.estimateId) {
          throw new EstimateItemNotBelongToEstimateError(
            params.targetEstimateItemId,
            params.estimateId
          );
        }

        // 業者金額行を更新（最初の明細行の内容で更新）
        const firstLineItem = lineItems[0]!;
        await tx.estimateItemLine.update({
          where: {
            estimateItemId_lineType: {
              estimateItemId: params.targetEstimateItemId,
              lineType: 'VENDOR',
            },
          },
          data: {
            name: firstLineItem.name,
            specification: firstLineItem.specification,
            unit: firstLineItem.unit,
            quantity: firstLineItem.quantity,
            unitPrice: firstLineItem.unitPrice,
            amount: firstLineItem.amount,
            sourceReceivedQuotationLineItemId: firstLineItem.id,
            sourceVendorName: vendorName,
          },
        });

        // 更新された見積項目を取得
        const updatedItem = await tx.estimateItem.findUnique({
          where: { id: params.targetEstimateItemId },
          include: {
            lines: {
              orderBy: { lineType: 'asc' },
            },
          },
        });

        if (updatedItem) {
          results.push(this.toEstimateItemWithLines(updatedItem));
        }
      } else {
        // 5. 転記先未指定の場合、各明細行に対して新規項目を作成
        const currentMaxOrder = await tx.estimateItem.count({
          where: { estimateId: params.estimateId, parentId: null },
        });

        for (let i = 0; i < lineItems.length; i++) {
          const lineItem = lineItems[i]!;
          const quantity = lineItem.quantity !== null ? Number(lineItem.quantity) : null;
          const unitPrice = lineItem.unitPrice !== null ? Number(lineItem.unitPrice) : null;

          const newItem = await tx.estimateItem.create({
            data: {
              estimateId: params.estimateId,
              parentId: null,
              displayOrder: currentMaxOrder + i,
              lines: {
                create: [
                  {
                    lineType: 'ESTIMATE',
                    name: null,
                    specification: null,
                    unit: null,
                    quantity: null,
                    unitPrice: null,
                    amount: null,
                    remarks: null,
                  },
                  {
                    lineType: 'EXECUTION',
                    name: null,
                    specification: null,
                    unit: null,
                    quantity: null,
                    unitPrice: null,
                    amount: null,
                    remarks: null,
                  },
                  {
                    lineType: 'VENDOR',
                    name: lineItem.name,
                    specification: lineItem.specification,
                    unit: lineItem.unit,
                    quantity,
                    unitPrice,
                    amount: this.calculateAmount(quantity, unitPrice),
                    remarks: lineItem.remarks,
                    sourceReceivedQuotationLineItemId: lineItem.id,
                    sourceVendorName: vendorName,
                  },
                ],
              },
            },
            include: {
              lines: {
                orderBy: { lineType: 'asc' },
              },
            },
          });

          results.push(this.toEstimateItemWithLines(newItem));
        }
      }

      return results;
    });
  }

  /**
   * データベースの結果をEstimateItemWithLinesに変換
   */
  private toEstimateItemWithLines(item: {
    id: string;
    estimateId: string;
    parentId: string | null;
    displayOrder: number;
    itemType?: string;
    createdAt: Date;
    updatedAt: Date;
    lines: Array<{
      id: string;
      estimateItemId: string;
      lineType: string;
      name: string | null;
      specification: string | null;
      unit: string | null;
      quantity: unknown;
      unitPrice: unknown;
      amount: unknown;
      remarks: string | null;
      sourceReceivedQuotationLineItemId?: string | null;
      sourceVendorName?: string | null;
    }>;
  }): EstimateItemWithLines {
    return {
      id: item.id,
      estimateId: item.estimateId,
      parentId: item.parentId,
      displayOrder: item.displayOrder,
      itemType: (item.itemType as EstimateItemTypeValue | undefined) ?? 'STANDARD',
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      lines: item.lines.map((line) => ({
        id: line.id,
        estimateItemId: line.estimateItemId,
        lineType: line.lineType as 'ESTIMATE' | 'EXECUTION' | 'VENDOR',
        name: line.name,
        specification: line.specification,
        unit: line.unit,
        quantity: line.quantity !== null ? Number(line.quantity) : null,
        unitPrice: line.unitPrice !== null ? Number(line.unitPrice) : null,
        amount: line.amount !== null ? Number(line.amount) : null,
        remarks: line.remarks,
        sourceReceivedQuotationLineItemId: line.sourceReceivedQuotationLineItemId ?? null,
        sourceVendorName: line.sourceVendorName ?? null,
      })),
    };
  }
}
