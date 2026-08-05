/**
 * @fileoverview EstimateDraftService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
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
 * Task 52.6: 明細更新の一括化とN+1クエリの解消
 * Task 52.7: 一括保存処理の単体テスト（42.3, 42.4, 42.5, 42.6, 42.9 の受入観点を網羅）
 * Task 57.6: トランザクションの制限時間の明示と、超過（P2028）時の応答（42.1, 42.3）
 *
 * @module __tests__/unit/services/estimate-draft.service.test
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  EstimateDraftService,
  ESTIMATE_SAVE_TRANSACTION_OPTIONS,
} from '../../../services/estimate-draft.service.js';
import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import {
  EstimateNotFoundError,
  EstimateDraftValidationError,
  EstimateConflictError,
  EstimateSaveTimeoutError,
} from '../../../errors/estimateError.js';
import {
  SAVE_ESTIMATE_MAX_ITEMS,
  type SaveEstimateDraftInput,
  type SaveEstimateItemNodeInput,
  type SaveEstimateLineInput,
} from '../../../schemas/estimate.schema.js';

/** 書き込み系モック（トランザクションクライアント側） */
type MockTxClient = {
  estimate: {
    updateMany: Mock;
    findUnique: Mock;
  };
  estimateItem: {
    create: Mock;
    createMany: Mock;
    update: Mock;
    updateMany: Mock;
    deleteMany: Mock;
    findMany: Mock;
  };
  estimateItemLine: {
    upsert: Mock;
    deleteMany: Mock;
  };
  $executeRaw: Mock;
};

/** 読み取り系＋トランザクション起点のモック */
type MockPrismaClient = Omit<MockTxClient, 'estimate'> & {
  estimate: { findUnique: Mock };
  estimateItem: MockTxClient['estimateItem'];
  $transaction: Mock;
};

/**
 * 見積項目の一括UPDATE文のパラメータ構成（サービス実装と対で維持する）
 *
 * `UPDATE "estimate_items" ... FROM (VALUES ...)` は
 * 1行あたり `id / parentId / itemType / displayOrder` の4パラメータを取り、
 * 末尾に `estimateId` を1つ持つ。
 */
const BULK_ITEM_UPDATE_PARAMS_PER_ROW = 4;
const BULK_ITEM_UPDATE_TRAILING_PARAMS = 1;

/**
 * 明細行の一括UPSERT文のパラメータ構成（サービス実装と対で維持する）
 *
 * `INSERT INTO "estimate_item_lines" ... ON CONFLICT DO UPDATE` は1行あたり
 * `id / estimateItemId / lineType / name / specification / unit /
 *  quantity / unitPrice / amount / remarks / sourceVendorName` の11パラメータを取る。
 */
const BULK_LINE_UPSERT_PARAMS_PER_ROW = 11;

/** 一括UPDATE文の VALUES 行数（＝更新対象件数）を求める */
function countBulkUpdateRows(query: Prisma.Sql): number {
  if (!isBulkItemUpdate(query)) {
    return 0;
  }
  return (query.values.length - BULK_ITEM_UPDATE_TRAILING_PARAMS) / BULK_ITEM_UPDATE_PARAMS_PER_ROW;
}

/** 見積項目の一括UPDATE文か */
function isBulkItemUpdate(query: Prisma.Sql): boolean {
  return query.text.trimStart().startsWith('UPDATE "estimate_items"');
}

/** 明細行の一括UPSERT文か */
function isBulkLineUpsert(query: Prisma.Sql): boolean {
  return query.text.trimStart().startsWith('INSERT INTO "estimate_item_lines"');
}

/** 一括UPDATE文のパラメータから、確定される親子・種別・並び順を復元する */
interface BulkItemUpdateRow {
  id: unknown;
  parentId: unknown;
  itemType: unknown;
  displayOrder: unknown;
}

/** 一括UPSERT文のパラメータから、確定される明細行の内容を復元する */
interface BulkLineUpsertRow {
  estimateItemId: unknown;
  lineType: unknown;
  name: unknown;
  specification: unknown;
  unit: unknown;
  quantity: unknown;
  unitPrice: unknown;
  amount: unknown;
  remarks: unknown;
  sourceVendorName: unknown;
}

const ESTIMATE_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ITEM_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ITEM_D = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ITEM_E = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const FOREIGN_ITEM = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** DB上の `Estimate.updatedAt`（楽観ロックの基準時刻） */
const CURRENT_UPDATED_AT = new Date('2026-07-31T00:00:00.000Z');

/** 明細行ペイロードを組み立てる（全キー必須のワイヤ契約に合わせる） */
function buildLine(overrides: Partial<SaveEstimateLineInput> = {}): SaveEstimateLineInput {
  return {
    lineType: 'ESTIMATE',
    name: '基礎工事',
    specification: 'RC造',
    unit: '式',
    quantity: '1.0000',
    unitPrice: '100000.00',
    amount: '100000.00',
    remarks: '備考',
    sourceVendorName: null,
    ...overrides,
  };
}

/** 見積項目ノードペイロードを組み立てる */
function buildNode(overrides: Partial<SaveEstimateItemNodeInput> = {}): SaveEstimateItemNodeInput {
  return {
    id: null,
    tempId: null,
    itemType: 'STANDARD',
    lines: [buildLine()],
    children: [],
    ...overrides,
  };
}

/** 一括保存入力を組み立てる */
function buildInput(
  items: SaveEstimateItemNodeInput[],
  overrides: Partial<SaveEstimateDraftInput> = {}
): SaveEstimateDraftInput {
  return {
    expectedUpdatedAt: CURRENT_UPDATED_AT.toISOString(),
    reportFields: {
      submissionDate: null,
      validityPeriod: null,
      separateWorks: [],
    },
    items,
    ...overrides,
  };
}

/** 保存後に読み直される見積項目行（Prismaの返却形の最小構成） */
function buildSavedRow(
  overrides: Partial<{
    id: string;
    estimateId: string;
    parentId: string | null;
    displayOrder: number;
    itemType: SaveEstimateItemNodeInput['itemType'];
    lines: unknown[];
  }> = {}
): Record<string, unknown> {
  return {
    id: ITEM_A,
    estimateId: ESTIMATE_ID,
    parentId: null,
    displayOrder: 0,
    itemType: 'STANDARD',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-31T01:00:00.000Z'),
    lines: [
      {
        id: 'line-1',
        estimateItemId: overrides.id ?? ITEM_A,
        lineType: 'ESTIMATE',
        name: '基礎工事',
        specification: 'RC造',
        unit: '式',
        quantity: '1.0000',
        unitPrice: '100000.00',
        amount: '100000.00',
        remarks: '備考',
        sourceReceivedQuotationLineItemId: null,
        sourceVendorName: null,
      },
    ],
    ...overrides,
  };
}

describe('EstimateDraftService', () => {
  let service: EstimateDraftService;
  let mockPrisma: MockPrismaClient;
  let mockTx: MockTxClient;

  beforeEach(() => {
    mockTx = {
      estimate: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({
          id: ESTIMATE_ID,
          updatedAt: new Date('2026-07-31T01:00:00.000Z'),
          submissionDate: null,
          validityPeriod: null,
          separateWorks: [],
        }),
      },
      estimateItem: {
        // 一括化後は個別 create を発行しない。呼ばれたらテストで検出できるようモックを残す
        create: vi.fn(),
        createMany: vi.fn(async (args: { data: unknown[] }) => ({ count: args.data.length })),
        update: vi.fn().mockResolvedValue(undefined),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      estimateItemLine: {
        upsert: vi.fn().mockResolvedValue(undefined),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      // 実DBの代わりに「VALUES 句の行数＝更新件数」を返す。
      // 一括UPDATEの件数照合（並行削除の検出）を素通りさせないための最小限の模擬。
      $executeRaw: vi.fn(async (query: Prisma.Sql) => countBulkUpdateRows(query)),
    };

    mockPrisma = {
      estimate: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: ESTIMATE_ID, deletedAt: null, updatedAt: CURRENT_UPDATED_AT }),
      },
      estimateItem: {
        findMany: vi.fn().mockResolvedValue([]),
        // 書き込みはトランザクションクライアント側で行われる想定。
        // prisma 直下が呼ばれた場合はテストで検出できるようモックを分ける
        create: vi.fn(),
        createMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      estimateItemLine: {
        upsert: vi.fn(),
        deleteMany: vi.fn(),
      },
      $executeRaw: vi.fn(),
      $transaction: vi.fn(async (callback: (tx: MockTxClient) => Promise<unknown>) =>
        callback(mockTx)
      ),
    };

    service = new EstimateDraftService({
      prisma: mockPrisma as unknown as PrismaClient,
    });
  });

  /**
   * データを変更しうるモックを**すべて**列挙する（42.4, 42.5）
   *
   * 「データが一切変更されていない」は、特定の経路だけを個別に確認しても示せない。
   * トランザクションクライアント・prisma 直下の双方について、モック定義に存在する
   * 書き込み系メソッドを漏れなく並べ、どれか1つでも呼ばれたら検出できるようにする。
   * 読み取り専用の `findUnique` / `findMany` は対象外。
   */
  function listWriteChannels(): [string, Mock][] {
    return [
      ['tx.estimate.updateMany', mockTx.estimate.updateMany],
      ['tx.estimateItem.create', mockTx.estimateItem.create],
      ['tx.estimateItem.createMany', mockTx.estimateItem.createMany],
      ['tx.estimateItem.update', mockTx.estimateItem.update],
      ['tx.estimateItem.updateMany', mockTx.estimateItem.updateMany],
      ['tx.estimateItem.deleteMany', mockTx.estimateItem.deleteMany],
      ['tx.estimateItemLine.upsert', mockTx.estimateItemLine.upsert],
      ['tx.estimateItemLine.deleteMany', mockTx.estimateItemLine.deleteMany],
      ['tx.$executeRaw', mockTx.$executeRaw],
      ['prisma.estimateItem.create', mockPrisma.estimateItem.create],
      ['prisma.estimateItem.createMany', mockPrisma.estimateItem.createMany],
      ['prisma.estimateItem.update', mockPrisma.estimateItem.update],
      ['prisma.estimateItem.updateMany', mockPrisma.estimateItem.updateMany],
      ['prisma.estimateItem.deleteMany', mockPrisma.estimateItem.deleteMany],
      ['prisma.estimateItemLine.upsert', mockPrisma.estimateItemLine.upsert],
      ['prisma.estimateItemLine.deleteMany', mockPrisma.estimateItemLine.deleteMany],
      ['prisma.$executeRaw', mockPrisma.$executeRaw],
    ];
  }

  /** 実際に呼ばれた書き込み口の名前（失敗時にどの経路が漏れたか分かるようにする） */
  function calledWriteChannels(): string[] {
    return listWriteChannels()
      .filter(([, mock]) => mock.mock.calls.length > 0)
      .map(([name]) => name);
  }

  /** 書き込みが1件も発生していないことを確認する（トランザクションも開始されない） */
  function expectNoWrites(): void {
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(calledWriteChannels()).toEqual([]);
  }

  /** 発行された `$executeRaw` のうち、述語に合致する文をすべて発行順に返す */
  function collectStatements(predicate: (query: Prisma.Sql) => boolean): Prisma.Sql[] {
    return mockTx.$executeRaw.mock.calls
      .map((args) => args[0] as Prisma.Sql)
      .filter((query) => predicate(query));
  }

  /**
   * 発行された一括UPDATE文のパラメータから、確定される項目の状態を復元する
   *
   * バインドパラメータ上限で文が分割された場合も**全文を発行順に連結**して返す。
   * 先頭の1文だけを見ると、2文目以降の内容が誤っていても検出できない。
   */
  function readBulkItemUpdateRows(): BulkItemUpdateRow[] {
    return collectStatements(isBulkItemUpdate).flatMap(({ values }) => {
      const rowCount =
        (values.length - BULK_ITEM_UPDATE_TRAILING_PARAMS) / BULK_ITEM_UPDATE_PARAMS_PER_ROW;

      return Array.from({ length: rowCount }, (_, index) => {
        const offset = index * BULK_ITEM_UPDATE_PARAMS_PER_ROW;
        return {
          id: values[offset],
          parentId: values[offset + 1],
          itemType: values[offset + 2],
          displayOrder: values[offset + 3],
        };
      });
    });
  }

  /**
   * 発行された一括UPSERT文のパラメータから、確定される明細行の内容を復元する
   *
   * {@link readBulkItemUpdateRows} と同様、分割された全文を発行順に連結して返す。
   */
  function readBulkLineUpsertRows(): BulkLineUpsertRow[] {
    return collectStatements(isBulkLineUpsert).flatMap(({ values }) => {
      const rowCount = values.length / BULK_LINE_UPSERT_PARAMS_PER_ROW;

      return Array.from({ length: rowCount }, (_, index) => {
        // 先頭の id（アプリ採番のUUID）は照合対象にしないため読み飛ばす
        const offset = index * BULK_LINE_UPSERT_PARAMS_PER_ROW + 1;
        return {
          estimateItemId: values[offset],
          lineType: values[offset + 1],
          name: values[offset + 2],
          specification: values[offset + 3],
          unit: values[offset + 4],
          quantity: values[offset + 5],
          unitPrice: values[offset + 6],
          amount: values[offset + 7],
          remarks: values[offset + 8],
          sourceVendorName: values[offset + 9],
        };
      });
    });
  }

  describe('saveDraft: 保存前検証（42.4）', () => {
    it('見積書が存在しない場合は書き込みを一切行わずに 404 相当のエラーを投げる', async () => {
      mockPrisma.estimate.findUnique.mockResolvedValue(null);

      await expect(service.saveDraft(ESTIMATE_ID, buildInput([buildNode()]))).rejects.toThrow(
        EstimateNotFoundError
      );

      expectNoWrites();
    });

    it('論理削除済みの見積書は存在しないものとして扱う', async () => {
      mockPrisma.estimate.findUnique.mockResolvedValue({
        id: ESTIMATE_ID,
        deletedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await expect(service.saveDraft(ESTIMATE_ID, buildInput([]))).rejects.toThrow(
        EstimateNotFoundError
      );

      expectNoWrites();
    });

    it('他の見積書の項目IDが含まれる場合はトランザクションを開始せずに検証エラーとする', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      const input = buildInput([buildNode({ id: ITEM_A }), buildNode({ id: FOREIGN_ITEM })]);

      await expect(service.saveDraft(ESTIMATE_ID, input)).rejects.toThrow(
        EstimateDraftValidationError
      );

      expectNoWrites();
    });

    it('検証エラーには不備のあった項目が含まれる', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([]);

      const input = buildInput([buildNode({ id: FOREIGN_ITEM })]);

      await expect(service.saveDraft(ESTIMATE_ID, input)).rejects.toMatchObject({
        statusCode: 422,
        issues: [expect.objectContaining({ path: `items.${FOREIGN_ITEM}` })],
      });
    });

    it('検証NGと楽観ロック競合が同時に成立する場合も検証NG（422）で中断し、データを変更しない', async () => {
      // 基準時刻もずれている（=競合）が、design.md の保存フローでは全件検証が先に走る
      mockPrisma.estimate.findUnique.mockResolvedValue({
        id: ESTIMATE_ID,
        deletedAt: null,
        updatedAt: new Date('2026-07-31T09:00:00.000Z'),
      });
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      const input = buildInput([buildNode({ id: ITEM_A }), buildNode({ id: FOREIGN_ITEM })]);

      await expect(service.saveDraft(ESTIMATE_ID, input)).rejects.toMatchObject({
        statusCode: 422,
        issues: [expect.objectContaining({ path: `items.${FOREIGN_ITEM}` })],
      });

      expectNoWrites();
    });

    it('新規サブツリーに混ざった他見積書の項目IDも検証で弾き、データを変更しない', async () => {
      // 子孫に紛れた不正IDを見落とすと、トランザクション内で他見積書の行を書き換える
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      const input = buildInput([
        buildNode({
          id: ITEM_A,
          children: [
            buildNode({ tempId: 'tmp-child', children: [buildNode({ id: FOREIGN_ITEM })] }),
          ],
        }),
      ]);

      await expect(service.saveDraft(ESTIMATE_ID, input)).rejects.toMatchObject({
        statusCode: 422,
        issues: [expect.objectContaining({ path: `items.${FOREIGN_ITEM}` })],
      });

      expectNoWrites();
    });
  });

  describe('saveDraft: 削除の差分適用（34.2）', () => {
    it('ペイロードに含まれない既存項目を削除し、子孫は連鎖削除に委ねる', async () => {
      // DB: A(ルート) - B(Aの子) / C(ルート)。ペイロードは C のみ
      mockPrisma.estimateItem.findMany.mockResolvedValue([
        { id: ITEM_A, parentId: null },
        { id: ITEM_B, parentId: ITEM_A },
        { id: ITEM_C, parentId: null },
      ]);

      const result = await service.saveDraft(ESTIMATE_ID, buildInput([buildNode({ id: ITEM_C })]));

      // 削除は「削除対象の根」のみ。子孫 B は onDelete: Cascade に委ねる
      expect(mockTx.estimateItem.deleteMany).toHaveBeenCalledTimes(1);
      expect(mockTx.estimateItem.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [ITEM_A] } },
      });
      expect(result.deletedItemIds).toEqual(expect.arrayContaining([ITEM_A, ITEM_B]));
    });

    it('削除対象が無い場合は削除を発行しない', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      await service.saveDraft(ESTIMATE_ID, buildInput([buildNode({ id: ITEM_A })]));

      expect(mockTx.estimateItem.deleteMany).not.toHaveBeenCalled();
    });

    it('削除される親から別の親へ移動した既存項目は、削除前に切り離して連鎖削除から守る', async () => {
      // DB: A(ルート) - B(Aの子)。ペイロードは B のみ（A は削除、B はルートへ移動）
      mockPrisma.estimateItem.findMany.mockResolvedValue([
        { id: ITEM_A, parentId: null },
        { id: ITEM_B, parentId: ITEM_A },
      ]);

      await service.saveDraft(ESTIMATE_ID, buildInput([buildNode({ id: ITEM_B })]));

      expect(mockTx.estimateItem.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [ITEM_B] } },
        data: { parentId: null },
      });
      // 切り離しは削除より前に発行される
      const detachOrder = mockTx.estimateItem.updateMany.mock.invocationCallOrder[0]!;
      const deleteOrder = mockTx.estimateItem.deleteMany.mock.invocationCallOrder[0]!;
      expect(detachOrder).toBeLessThan(deleteOrder);
      // B は削除されない
      expect(mockTx.estimateItem.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [ITEM_A] } },
      });
    });

    it('切り離しで生じた一過性の parentId=null は同一トランザクション内で最終値へ戻る', async () => {
      // DB: A(ルート) - B(Aの子) / C(ルート)。ペイロードは C とその子 B（A は削除）
      mockPrisma.estimateItem.findMany.mockResolvedValue([
        { id: ITEM_A, parentId: null },
        { id: ITEM_B, parentId: ITEM_A },
        { id: ITEM_C, parentId: null },
      ]);

      await service.saveDraft(
        ESTIMATE_ID,
        buildInput([buildNode({ id: ITEM_C, children: [buildNode({ id: ITEM_B })] })])
      );

      // 切り離しでいったん null にした B は、一括UPDATEで新しい親 C へ張り替えられる
      expect(mockTx.estimateItem.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [ITEM_B] } },
        data: { parentId: null },
      });
      expect(readBulkItemUpdateRows()).toContainEqual(
        expect.objectContaining({ id: ITEM_B, parentId: ITEM_C })
      );
    });
  });

  /**
   * @requirement estimate-creation/REQ-34.3 見積項目の内容を編集して保存した場合に変更が保存され再読み込み後も反映される
   * @requirement estimate-creation/REQ-42.9 保存処理において既存の見積項目とその実行予算項目からの参照関係を維持する
   */
  describe('saveDraft: 既存項目の更新（34.3, 42.9）', () => {
    it('既存項目はIDを維持して更新し、削除＋再作成を行わない', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      const input = buildInput([
        buildNode({
          id: ITEM_A,
          lines: [buildLine({ name: '更新後の名称', unitPrice: '250000.00' })],
        }),
      ]);

      const result = await service.saveDraft(ESTIMATE_ID, input);

      // 削除＋再作成を行わない（既存IDのまま一括UPDATEの対象になる）
      expect(mockTx.estimateItem.create).not.toHaveBeenCalled();
      expect(mockTx.estimateItem.createMany).not.toHaveBeenCalled();
      expect(mockTx.estimateItem.deleteMany).not.toHaveBeenCalled();
      expect(readBulkItemUpdateRows()).toEqual([
        { id: ITEM_A, parentId: null, itemType: 'STANDARD', displayOrder: 0 },
      ]);
      expect(result.updatedItemIds).toEqual([ITEM_A]);
    });

    it('同一リクエストで兄弟が削除されても、存続する既存項目はIDを維持したまま更新される', async () => {
      // DB: A(ルート) - B(Aの子) / C(ルート)。ペイロードは C のみ（A と B は消える）
      mockPrisma.estimateItem.findMany.mockResolvedValue([
        { id: ITEM_A, parentId: null },
        { id: ITEM_B, parentId: ITEM_A },
        { id: ITEM_C, parentId: null },
      ]);

      const result = await service.saveDraft(
        ESTIMATE_ID,
        buildInput([buildNode({ id: ITEM_C, lines: [buildLine({ name: '存続する項目' })] })])
      );

      // 削除されるのはペイロードに含まれない A のみ（B は連鎖削除に委ねる）
      expect(mockTx.estimateItem.deleteMany).toHaveBeenCalledTimes(1);
      expect(mockTx.estimateItem.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [ITEM_A] } },
      });
      expect(result.deletedItemIds).toEqual(expect.arrayContaining([ITEM_A, ITEM_B]));
      expect(result.deletedItemIds).not.toContain(ITEM_C);

      // 存続項目は削除＋再作成されず既存IDのまま更新される（実行予算からの参照が切れない・42.9）
      expect(mockTx.estimateItem.create).not.toHaveBeenCalled();
      expect(mockTx.estimateItem.createMany).not.toHaveBeenCalled();
      expect(result.createdItemIds).toEqual([]);
      expect(result.updatedItemIds).toEqual([ITEM_C]);
      expect(readBulkItemUpdateRows()).toEqual([
        { id: ITEM_C, parentId: null, itemType: 'STANDARD', displayOrder: 0 },
      ]);
      // 明細行も存続項目のIDに紐づけて更新される
      expect(readBulkLineUpsertRows()).toEqual([
        expect.objectContaining({ estimateItemId: ITEM_C, name: '存続する項目' }),
      ]);
    });

    it('既存項目の明細行は行タイプを鍵に一括UPSERTし、内容を反映する', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      const input = buildInput([
        buildNode({
          id: ITEM_A,
          lines: [buildLine({ name: '更新後の名称', amount: '250000.00' })],
        }),
      ]);

      await service.saveDraft(ESTIMATE_ID, input);

      expect(readBulkLineUpsertRows()).toEqual([
        expect.objectContaining({
          estimateItemId: ITEM_A,
          lineType: 'ESTIMATE',
          name: '更新後の名称',
          amount: '250000.00',
        }),
      ]);

      // 競合キーは @@unique([estimateItemId, lineType])。既存行はIDを維持して更新する
      const upsertStatement = mockTx.$executeRaw.mock.calls.find((args) =>
        isBulkLineUpsert(args[0] as Prisma.Sql)
      )![0] as Prisma.Sql;
      expect(upsertStatement.text).toContain('ON CONFLICT ("estimateItemId", "lineType")');
      expect(upsertStatement.text).toContain('DO UPDATE SET');
      // 転記元の参照は保存ペイロードに含まれないため更新対象から外す
      expect(upsertStatement.text).not.toContain('sourceReceivedQuotationLineItemId');
    });

    it('ペイロードから消えた行タイプの明細行を行タイプ単位でまとめて削除する', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      const input = buildInput([
        buildNode({ id: ITEM_A, lines: [buildLine({ lineType: 'ESTIMATE' })] }),
      ]);

      await service.saveDraft(ESTIMATE_ID, input);

      expect(mockTx.estimateItemLine.deleteMany).toHaveBeenCalledWith({
        where: { estimateItemId: { in: [ITEM_A] }, lineType: 'EXECUTION' },
      });
      expect(mockTx.estimateItemLine.deleteMany).toHaveBeenCalledWith({
        where: { estimateItemId: { in: [ITEM_A] }, lineType: 'VENDOR' },
      });
      // ペイロードに残る行タイプは削除しない
      expect(mockTx.estimateItemLine.deleteMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ lineType: 'ESTIMATE' }) })
      );
    });

    it('既存項目の階層移動は parentId の一括UPDATEで反映する', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([
        { id: ITEM_A, parentId: null },
        { id: ITEM_B, parentId: null },
      ]);

      const input = buildInput([buildNode({ id: ITEM_A, children: [buildNode({ id: ITEM_B })] })]);

      await service.saveDraft(ESTIMATE_ID, input);

      expect(readBulkItemUpdateRows()).toContainEqual(
        expect.objectContaining({ id: ITEM_B, parentId: ITEM_A })
      );
    });
  });

  /**
   * @requirement estimate-creation/REQ-34.1 見積項目を追加して保存した場合に追加が保存され再読み込み後も反映される
   */
  describe('saveDraft: 新規項目と親子関係の解決（34.1, 42.1）', () => {
    it('多階層の新規サブツリーを一時IDから生成IDへの対応表で解決する', async () => {
      const input = buildInput([
        buildNode({
          tempId: 'tmp-root',
          children: [
            buildNode({
              tempId: 'tmp-child',
              children: [buildNode({ tempId: 'tmp-grandchild' })],
            }),
          ],
        }),
      ]);

      const result = await service.saveDraft(ESTIMATE_ID, input);

      // 個別 create は発行せず、1回の createMany でまとめて登録する
      expect(mockTx.estimateItem.create).not.toHaveBeenCalled();
      expect(mockTx.estimateItem.createMany).toHaveBeenCalledTimes(1);

      const createRows = mockTx.estimateItem.createMany.mock.calls[0]![0].data as {
        id: string;
        estimateId: string;
        parentId: null;
      }[];
      expect(createRows).toHaveLength(3);
      // INSERT 時点では親を張らず、後続の一括UPDATEで確定する
      expect(createRows.every((row) => row.parentId === null)).toBe(true);
      expect(createRows.every((row) => row.estimateId === ESTIMATE_ID)).toBe(true);

      const [rootId, childId, grandchildId] = createRows.map((row) => row.id);
      expect(result.tempIdMap).toEqual({
        'tmp-root': rootId,
        'tmp-child': childId,
        'tmp-grandchild': grandchildId,
      });
      expect(result.createdItemIds).toEqual([rootId, childId, grandchildId]);

      // 多階層の親子関係は一時IDから採番IDへの対応表で解決される
      expect(readBulkItemUpdateRows()).toEqual([
        expect.objectContaining({ id: rootId, parentId: null }),
        expect.objectContaining({ id: childId, parentId: rootId }),
        expect.objectContaining({ id: grandchildId, parentId: childId }),
      ]);
    });

    it('新規項目を既存項目の子として作成する場合は既存IDを親に用いる', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      const input = buildInput([
        buildNode({ id: ITEM_A, children: [buildNode({ tempId: 'tmp-new' })] }),
      ]);

      const result = await service.saveDraft(ESTIMATE_ID, input);

      expect(readBulkItemUpdateRows()).toContainEqual(
        expect.objectContaining({ id: result.createdItemIds[0], parentId: ITEM_A })
      );
    });

    it('既存項目を新規項目の子へ移動する場合も一時IDから生成IDを解決して親に用いる', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([
        { id: ITEM_A, parentId: null },
        { id: ITEM_B, parentId: null },
      ]);

      // 新規の親項目を先頭に挿し、既存 B をその子へ移す（階層下げ相当）
      const input = buildInput([
        buildNode({ tempId: 'tmp-parent', children: [buildNode({ id: ITEM_B })] }),
        buildNode({ id: ITEM_A }),
      ]);

      const result = await service.saveDraft(ESTIMATE_ID, input);

      expect(result.createdItemIds).toHaveLength(1);
      const newParentId = result.createdItemIds[0]!;
      expect(result.tempIdMap).toEqual({ 'tmp-parent': newParentId });
      // 既存 B はIDを維持したまま新規項目の子になる（削除＋再作成しない・42.9）
      expect(result.updatedItemIds).toEqual([ITEM_B, ITEM_A]);
      expect(result.deletedItemIds).toEqual([]);
      expect(mockTx.estimateItem.deleteMany).not.toHaveBeenCalled();
      expect(readBulkItemUpdateRows()).toEqual([
        { id: newParentId, parentId: null, itemType: 'STANDARD', displayOrder: 0 },
        { id: ITEM_B, parentId: newParentId, itemType: 'STANDARD', displayOrder: 0 },
        { id: ITEM_A, parentId: null, itemType: 'STANDARD', displayOrder: 1 },
      ]);
    });

    it('新規項目の明細行も一括UPSERTでまとめて登録する', async () => {
      const input = buildInput([
        buildNode({
          tempId: 'tmp-new',
          lines: [
            buildLine({ lineType: 'ESTIMATE' }),
            buildLine({ lineType: 'EXECUTION', name: '実行' }),
          ],
        }),
      ]);

      const result = await service.saveDraft(ESTIMATE_ID, input);
      const createdId = result.createdItemIds[0];

      expect(readBulkLineUpsertRows()).toEqual([
        expect.objectContaining({
          estimateItemId: createdId,
          lineType: 'ESTIMATE',
          name: '基礎工事',
        }),
        expect.objectContaining({
          estimateItemId: createdId,
          lineType: 'EXECUTION',
          name: '実行',
        }),
      ]);
    });
  });

  describe('saveDraft: 注記行の正規化（design.md「NOTE 項目は name 以外は NULL とする」）', () => {
    it('新規の注記行は名称以外を NULL に正規化して作成する', async () => {
      const input = buildInput([
        buildNode({
          tempId: 'tmp-note',
          itemType: 'NOTE',
          lines: [buildLine({ name: '※別途工事あり' })],
        }),
      ]);

      const result = await service.saveDraft(ESTIMATE_ID, input);

      const createRows = mockTx.estimateItem.createMany.mock.calls[0]![0].data as {
        itemType: string;
      }[];
      expect(createRows[0]!.itemType).toBe('NOTE');
      expect(readBulkLineUpsertRows()).toEqual([
        {
          estimateItemId: result.createdItemIds[0],
          lineType: 'ESTIMATE',
          name: '※別途工事あり',
          specification: null,
          unit: null,
          quantity: null,
          unitPrice: null,
          amount: null,
          remarks: null,
          sourceVendorName: null,
        },
      ]);
    });

    it('既存項目を注記行へ変更した場合も名称以外を NULL に正規化する', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      const input = buildInput([
        buildNode({
          id: ITEM_A,
          itemType: 'NOTE',
          lines: [buildLine({ name: '※注記' })],
        }),
      ]);

      await service.saveDraft(ESTIMATE_ID, input);

      expect(readBulkLineUpsertRows()).toEqual([
        {
          estimateItemId: ITEM_A,
          lineType: 'ESTIMATE',
          name: '※注記',
          specification: null,
          unit: null,
          quantity: null,
          unitPrice: null,
          amount: null,
          remarks: null,
          sourceVendorName: null,
        },
      ]);
      expect(readBulkItemUpdateRows()).toEqual([
        expect.objectContaining({ id: ITEM_A, itemType: 'NOTE' }),
      ]);
    });

    it('通常項目の明細行は入力値をそのまま保持する', async () => {
      const input = buildInput([buildNode({ tempId: 'tmp-standard' })]);

      await service.saveDraft(ESTIMATE_ID, input);

      expect(readBulkLineUpsertRows()[0]).toMatchObject({
        specification: 'RC造',
        unit: '式',
        quantity: '1.0000',
        unitPrice: '100000.00',
        amount: '100000.00',
        remarks: '備考',
      });
    });
  });

  describe('saveDraft: 単一トランザクション（42.1, 42.3）', () => {
    it('追加・削除・更新をすべて単一のトランザクションで実行する', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([
        { id: ITEM_A, parentId: null },
        { id: ITEM_C, parentId: null },
      ]);

      const input = buildInput([
        buildNode({ id: ITEM_A, children: [buildNode({ tempId: 'tmp-new' })] }),
      ]);

      const result = await service.saveDraft(ESTIMATE_ID, input);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      // 書き込みはトランザクションクライアント経由のみ
      expect(mockPrisma.estimateItem.create).not.toHaveBeenCalled();
      expect(mockPrisma.estimateItem.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.estimateItem.update).not.toHaveBeenCalled();
      expect(mockPrisma.estimateItem.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.estimateItemLine.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();

      expect(result.createdItemIds).toHaveLength(1);
      expect(result.updatedItemIds).toEqual([ITEM_A]);
      expect(result.deletedItemIds).toEqual([ITEM_C]);
    });

    it('途中で失敗した場合はエラーを伝播し、以降の書き込みを行わない（全ロールバック）', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);
      const failure = new Error('DB書き込み失敗');
      mockTx.estimateItem.createMany.mockRejectedValue(failure);

      const input = buildInput([
        buildNode({ id: ITEM_A }),
        buildNode({ tempId: 'tmp-after-failure' }),
      ]);

      await expect(service.saveDraft(ESTIMATE_ID, input)).rejects.toThrow('DB書き込み失敗');

      // 失敗以降の書き込みは発行されない（ロールバックは $transaction に委ねる）
      expect(mockTx.$executeRaw).not.toHaveBeenCalled();
      expect(mockTx.estimateItemLine.deleteMany).not.toHaveBeenCalled();
    });

    it('事前検証の通過後に他トランザクションが項目を削除した場合は中断して巻き戻す（42.3）', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);
      // 一括UPDATEの更新件数が対象件数に満たない＝対象行が消えている
      mockTx.$executeRaw.mockResolvedValue(0);

      const input = buildInput([buildNode({ id: ITEM_A })]);

      await expect(service.saveDraft(ESTIMATE_ID, input)).rejects.toThrow(
        /一括更新で対象件数が一致しませんでした/
      );
    });
  });

  describe('saveDraft: 楽観ロック（42.5）', () => {
    it('基準時刻が現在の値と一致しない場合は競合エラーとし、書き込みを一切行わない', async () => {
      mockPrisma.estimate.findUnique.mockResolvedValue({
        id: ESTIMATE_ID,
        deletedAt: null,
        updatedAt: new Date('2026-07-31T09:00:00.000Z'),
      });

      const input = buildInput([buildNode({ tempId: 'tmp-new' })]);

      await expect(service.saveDraft(ESTIMATE_ID, input)).rejects.toThrow(EstimateConflictError);

      expectNoWrites();
    });

    it('競合エラーには基準時刻と実際の更新日時が含まれる', async () => {
      const actualUpdatedAt = new Date('2026-07-31T09:00:00.000Z');
      mockPrisma.estimate.findUnique.mockResolvedValue({
        id: ESTIMATE_ID,
        deletedAt: null,
        updatedAt: actualUpdatedAt,
      });

      await expect(service.saveDraft(ESTIMATE_ID, buildInput([]))).rejects.toMatchObject({
        statusCode: 409,
        details: {
          expectedUpdatedAt: CURRENT_UPDATED_AT.toISOString(),
          actualUpdatedAt: actualUpdatedAt.toISOString(),
        },
      });
    });

    it('基準時刻が一致する場合は基準時刻を条件に含めた更新で保存を確定する', async () => {
      await service.saveDraft(ESTIMATE_ID, buildInput([buildNode({ tempId: 'tmp-new' })]));

      expect(mockTx.estimate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ESTIMATE_ID, updatedAt: CURRENT_UPDATED_AT },
        })
      );
    });

    it('事前照合の通過後に他トランザクションが更新していた場合も競合として中断する', async () => {
      // 条件付きUPDATEが0件＝基準時刻が変わっている
      mockTx.estimate.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      const input = buildInput([buildNode({ id: ITEM_A }), buildNode({ tempId: 'tmp-new' })]);

      await expect(service.saveDraft(ESTIMATE_ID, input)).rejects.toThrow(EstimateConflictError);

      // 明細への書き込みは発行されない（トランザクションは巻き戻る）
      expect(mockTx.estimateItem.create).not.toHaveBeenCalled();
      expect(mockTx.estimateItem.createMany).not.toHaveBeenCalled();
      expect(mockTx.estimateItem.update).not.toHaveBeenCalled();
      expect(mockTx.estimateItem.deleteMany).not.toHaveBeenCalled();
      expect(mockTx.estimateItemLine.upsert).not.toHaveBeenCalled();
      expect(mockTx.$executeRaw).not.toHaveBeenCalled();
      // 発行された書き込みは競合検出を兼ねた条件付きUPDATEだけ（他の経路も一切使わない）
      expect(calledWriteChannels()).toEqual(['tx.estimate.updateMany']);
    });
  });

  describe('saveDraft: 並び順の再採番（34.5, 42.6）', () => {
    it('既存項目・新規項目を問わず受領配列順で0起点の連番に再採番する', async () => {
      // DB上の displayOrder は陳腐化している想定（C=7, A=3）
      mockPrisma.estimateItem.findMany.mockResolvedValue([
        { id: ITEM_A, parentId: null },
        { id: ITEM_C, parentId: null },
      ]);

      const input = buildInput([
        buildNode({ id: ITEM_C }),
        buildNode({ tempId: 'tmp-middle' }),
        buildNode({ id: ITEM_A }),
      ]);

      const result = await service.saveDraft(ESTIMATE_ID, input);

      // 新規・既存を同じ一括UPDATEで確定するため、採番が衝突しない
      expect(readBulkItemUpdateRows()).toEqual([
        expect.objectContaining({ id: ITEM_C, displayOrder: 0 }),
        expect.objectContaining({ id: result.createdItemIds[0], displayOrder: 1 }),
        expect.objectContaining({ id: ITEM_A, displayOrder: 2 }),
      ]);
    });

    it('子の並び順は兄弟スコープごとに0起点の連番になる', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([
        { id: ITEM_A, parentId: null },
        { id: ITEM_B, parentId: ITEM_A },
        { id: ITEM_C, parentId: ITEM_A },
      ]);

      const input = buildInput([
        buildNode({
          id: ITEM_A,
          children: [buildNode({ id: ITEM_C }), buildNode({ id: ITEM_B })],
        }),
      ]);

      await service.saveDraft(ESTIMATE_ID, input);

      // ルートスコープは0起点、子スコープも親をまたいで通し番号にしない
      expect(readBulkItemUpdateRows()).toEqual([
        { id: ITEM_A, parentId: null, itemType: 'STANDARD', displayOrder: 0 },
        { id: ITEM_C, parentId: ITEM_A, itemType: 'STANDARD', displayOrder: 0 },
        { id: ITEM_B, parentId: ITEM_A, itemType: 'STANDARD', displayOrder: 1 },
      ]);
    });

    it('別の親へ移動した項目は移動先スコープで再採番され、元スコープの残りも詰め直される', async () => {
      // DB: A(ルート)[C, D] / B(ルート)[E]
      mockPrisma.estimateItem.findMany.mockResolvedValue([
        { id: ITEM_A, parentId: null },
        { id: ITEM_B, parentId: null },
        { id: ITEM_C, parentId: ITEM_A },
        { id: ITEM_D, parentId: ITEM_A },
        { id: ITEM_E, parentId: ITEM_B },
      ]);

      // C を A の先頭から B の末尾へ移動する
      const input = buildInput([
        buildNode({ id: ITEM_A, children: [buildNode({ id: ITEM_D })] }),
        buildNode({
          id: ITEM_B,
          children: [buildNode({ id: ITEM_E }), buildNode({ id: ITEM_C })],
        }),
      ]);

      await service.saveDraft(ESTIMATE_ID, input);

      // 事前順（A → D → B → E → C）で、各兄弟スコープが0起点の連番になる
      expect(readBulkItemUpdateRows()).toEqual([
        { id: ITEM_A, parentId: null, itemType: 'STANDARD', displayOrder: 0 },
        // 兄弟 C が抜けた分、D は 1 番目から 0 へ詰め直される
        { id: ITEM_D, parentId: ITEM_A, itemType: 'STANDARD', displayOrder: 0 },
        { id: ITEM_B, parentId: null, itemType: 'STANDARD', displayOrder: 1 },
        { id: ITEM_E, parentId: ITEM_B, itemType: 'STANDARD', displayOrder: 0 },
        // 移動した C は移動先スコープの末尾として 1 を得る
        { id: ITEM_C, parentId: ITEM_B, itemType: 'STANDARD', displayOrder: 1 },
      ]);
      // 階層移動は親子の張り替えのみで、削除＋再作成を伴わない（42.9）
      expect(mockTx.estimateItem.deleteMany).not.toHaveBeenCalled();
      expect(mockTx.estimateItem.createMany).not.toHaveBeenCalled();
    });
  });

  describe('saveDraft: 帳票用入力項目の保存（54.8）', () => {
    it('提出日・有効期限・別途工事を見積書に保存する', async () => {
      const input = buildInput([], {
        reportFields: {
          submissionDate: '2026-08-01',
          validityPeriod: '提出日より1ヶ月間',
          separateWorks: ['電気工事', '給排水工事'],
        },
      });

      await service.saveDraft(ESTIMATE_ID, input);

      expect(mockTx.estimate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            submissionDate: new Date('2026-08-01'),
            validityPeriod: '提出日より1ヶ月間',
            separateWorks: ['電気工事', '給排水工事'],
          },
        })
      );
    });

    it('未入力の帳票用入力項目は null と空配列として保存する', async () => {
      await service.saveDraft(ESTIMATE_ID, buildInput([]));

      expect(mockTx.estimate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            submissionDate: null,
            validityPeriod: null,
            separateWorks: [],
          },
        })
      );
    });

    it('保存した帳票用入力項目を保存後の状態として返す（54.8, 42.2）', async () => {
      mockTx.estimate.findUnique.mockResolvedValue({
        id: ESTIMATE_ID,
        updatedAt: new Date('2026-07-31T01:00:00.000Z'),
        submissionDate: new Date('2026-08-01T00:00:00.000Z'),
        validityPeriod: '提出日より1ヶ月間',
        separateWorks: ['電気工事'],
      });

      const result = await service.saveDraft(ESTIMATE_ID, buildInput([]));

      expect(result.estimate.reportFields).toEqual({
        submissionDate: new Date('2026-08-01T00:00:00.000Z'),
        validityPeriod: '提出日より1ヶ月間',
        separateWorks: ['電気工事'],
      });
    });
  });

  describe('saveDraft: 最新状態の返却（42.2, 42.7, 34.6, 29.4）', () => {
    it('保存後の明細を階層ツリーとして返し、呼び出し元の追加取得を不要にする', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([
        { id: ITEM_A, parentId: null },
        { id: ITEM_B, parentId: ITEM_A },
      ]);
      mockTx.estimateItem.findMany.mockResolvedValue([
        buildSavedRow({ id: ITEM_B, parentId: ITEM_A, displayOrder: 0 }),
        buildSavedRow({ id: ITEM_A, parentId: null, displayOrder: 0 }),
      ]);

      const result = await service.saveDraft(
        ESTIMATE_ID,
        buildInput([buildNode({ id: ITEM_A, children: [buildNode({ id: ITEM_B })] })])
      );

      // 保存後の読み直しは同一トランザクション内で行う
      expect(mockTx.estimateItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { estimateId: ESTIMATE_ID } })
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe(ITEM_A);
      expect(result.items[0]!.children).toHaveLength(1);
      expect(result.items[0]!.children[0]!.id).toBe(ITEM_B);
      expect(result.items[0]!.children[0]!.parentId).toBe(ITEM_A);
    });

    /**
     * @requirement estimate-creation/REQ-29.4 保存操作を行った場合に自動計算された親項目の金額を保存する
     */
    it('親項目の集計金額を保存し、返却ツリーにも同じ金額が含まれる（29.4）', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([
        { id: ITEM_A, parentId: null },
        { id: ITEM_B, parentId: ITEM_A },
      ]);
      mockTx.estimateItem.findMany.mockResolvedValue([
        buildSavedRow({
          id: ITEM_A,
          parentId: null,
          lines: [
            {
              id: 'line-a',
              estimateItemId: ITEM_A,
              lineType: 'ESTIMATE',
              name: '親項目',
              specification: null,
              unit: null,
              quantity: '1.0000',
              unitPrice: '300000.00',
              amount: '300000.00',
              remarks: null,
              sourceReceivedQuotationLineItemId: null,
              sourceVendorName: null,
            },
          ],
        }),
      ]);

      // 親は子の合計（100000 + 200000）をクライアントが算出して送る
      const input = buildInput([
        buildNode({
          id: ITEM_A,
          lines: [buildLine({ name: '親項目', unitPrice: '300000.00', amount: '300000.00' })],
          children: [buildNode({ id: ITEM_B, lines: [buildLine({ amount: '200000.00' })] })],
        }),
      ]);

      const result = await service.saveDraft(ESTIMATE_ID, input);

      // 集計金額がそのまま永続化される
      expect(readBulkLineUpsertRows()).toContainEqual(
        expect.objectContaining({
          estimateItemId: ITEM_A,
          lineType: 'ESTIMATE',
          amount: '300000.00',
        })
      );
      // 保存後の状態にも同じ金額が現れる
      expect(result.items[0]!.lines[0]!.amount).toBe(300000);
    });

    it('保存後の更新日時を返し、次回保存の基準時刻として使えるようにする', async () => {
      const result = await service.saveDraft(ESTIMATE_ID, buildInput([]));

      expect(result.estimate.id).toBe(ESTIMATE_ID);
      expect(result.estimate.updatedAt).toEqual(new Date('2026-07-31T01:00:00.000Z'));
      expect(result.estimate.updatedAt.getTime()).not.toBe(CURRENT_UPDATED_AT.getTime());
    });

    it('明細行の数量・単価・金額は数値として返す', async () => {
      mockTx.estimateItem.findMany.mockResolvedValue([buildSavedRow()]);

      const result = await service.saveDraft(ESTIMATE_ID, buildInput([]));

      expect(result.items[0]!.lines[0]).toMatchObject({
        quantity: 1,
        unitPrice: 100000,
        amount: 100000,
        lineType: 'ESTIMATE',
      });
    });
  });

  describe('saveDraft: 発行クエリ数の上限（42.1, design.md「Performance & Scalability」「クエリ削減」）', () => {
    /**
     * トランザクション内で発行されるクエリ数の上限
     *
     * 内訳（すべて明細件数に依存しない定数）:
     * 1. `estimate.updateMany`（楽観ロック＋帳票用入力項目）
     * 2. `estimateItem.updateMany`（削除前の切り離し）
     * 3. `estimateItem.deleteMany`（削除対象の根）
     * 4. `estimateItem.createMany`（新規項目の一括INSERT）
     * 5. `$executeRaw`（見積項目の VALUES 一括UPDATE）
     * 6-8. `estimateItemLine.deleteMany`（行タイプごと・最大3回）
     * 9. `$executeRaw`（明細行の一括 INSERT ... ON CONFLICT）
     * 10. `estimate.findUnique`（保存後の読み直し）
     * 11. `estimateItem.findMany`（保存後の読み直し）
     */
    const MAX_TRANSACTION_QUERIES = 12;

    /** トランザクションクライアントに対して発行された呼び出し回数の合計 */
    function countTransactionQueries(): number {
      const mocks: Mock[] = [
        mockTx.estimate.updateMany,
        mockTx.estimate.findUnique,
        mockTx.estimateItem.create,
        mockTx.estimateItem.createMany,
        mockTx.estimateItem.update,
        mockTx.estimateItem.updateMany,
        mockTx.estimateItem.deleteMany,
        mockTx.estimateItem.findMany,
        mockTx.estimateItemLine.upsert,
        mockTx.estimateItemLine.deleteMany,
        mockTx.$executeRaw,
      ];
      return mocks.reduce((total, mock) => total + mock.mock.calls.length, 0);
    }

    /** 既存項目のDB行（`{ id, parentId }` のみ）を n 件生成する */
    function buildExistingRows(count: number): { id: string; parentId: string | null }[] {
      return Array.from({ length: count }, (_, index) => ({
        id: `existing-${index}`,
        parentId: null,
      }));
    }

    /** `existing-{i}` を parentId で連結した n 段の鎖を生成する */
    function buildExistingChain(depth: number): { id: string; parentId: string | null }[] {
      return Array.from({ length: depth }, (_, index) => ({
        id: `existing-${index}`,
        parentId: index === 0 ? null : `existing-${index - 1}`,
      }));
    }

    it('新規明細100件の保存で発行されるクエリ数が件数に比例しない', async () => {
      const buildNewItems = (count: number): SaveEstimateItemNodeInput[] =>
        Array.from({ length: count }, (_, index) => buildNode({ tempId: `tmp-${index}` }));

      await service.saveDraft(ESTIMATE_ID, buildInput(buildNewItems(10)));
      const queriesFor10 = countTransactionQueries();

      vi.clearAllMocks();
      await service.saveDraft(ESTIMATE_ID, buildInput(buildNewItems(100)));
      const queriesFor100 = countTransactionQueries();

      expect(queriesFor100).toBeLessThanOrEqual(MAX_TRANSACTION_QUERIES);
      expect(queriesFor100).toBe(queriesFor10);
    });

    it('既存明細100件の更新で発行されるクエリ数が件数に比例しない', async () => {
      const buildExistingItems = (count: number): SaveEstimateItemNodeInput[] =>
        Array.from({ length: count }, (_, index) => buildNode({ id: `existing-${index}` }));

      mockPrisma.estimateItem.findMany.mockResolvedValue(buildExistingRows(10));
      await service.saveDraft(ESTIMATE_ID, buildInput(buildExistingItems(10)));
      const queriesFor10 = countTransactionQueries();

      vi.clearAllMocks();
      mockPrisma.estimateItem.findMany.mockResolvedValue(buildExistingRows(100));
      await service.saveDraft(ESTIMATE_ID, buildInput(buildExistingItems(100)));
      const queriesFor100 = countTransactionQueries();

      expect(queriesFor100).toBeLessThanOrEqual(MAX_TRANSACTION_QUERIES);
      expect(queriesFor100).toBe(queriesFor10);
    });

    it('100段の階層をまとめて削除しても子孫の特定に深さ分の問い合わせを行わない', async () => {
      // 100段の鎖をすべて削除する（ペイロードは空）。
      // 子孫の特定は事前読み込み済みの1件のクエリ結果に対する単一走査で完結する
      mockPrisma.estimateItem.findMany.mockResolvedValue(buildExistingChain(100));

      const result = await service.saveDraft(ESTIMATE_ID, buildInput([]));

      expect(countTransactionQueries()).toBeLessThanOrEqual(MAX_TRANSACTION_QUERIES);
      // 削除は根1件のみ。子孫99件は onDelete: Cascade に委ねる
      expect(mockTx.estimateItem.deleteMany).toHaveBeenCalledTimes(1);
      expect(mockTx.estimateItem.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['existing-0'] } },
      });
      expect(result.deletedItemIds).toHaveLength(100);
    });

    it('バインドパラメータ上限に達する規模でも文の分割数は定数にとどまる', async () => {
      // 1000項目×3行＝3000行。1文あたり11パラメータのため2文に分割される
      const items = Array.from({ length: 1000 }, (_, index) =>
        buildNode({
          tempId: `tmp-${index}`,
          lines: [
            buildLine({ lineType: 'ESTIMATE' }),
            buildLine({ lineType: 'EXECUTION' }),
            buildLine({ lineType: 'VENDOR' }),
          ],
        })
      );

      await service.saveDraft(ESTIMATE_ID, buildInput(items));

      const lineStatements = mockTx.$executeRaw.mock.calls
        .map((args) => args[0] as Prisma.Sql)
        .filter(isBulkLineUpsert);

      expect(lineStatements).toHaveLength(2);
      // PostgreSQL の1文あたりバインドパラメータ上限（65535）を超えない
      for (const statement of lineStatements) {
        expect(statement.values.length).toBeLessThanOrEqual(30000);
      }
      expect(countTransactionQueries()).toBeLessThanOrEqual(MAX_TRANSACTION_QUERIES);
    });

    it('分割された2文目の明細行も対象項目と内容を保ったまま発行される', async () => {
      // 1000項目×3行＝3000行。1文あたり最大2727行（30000÷11）のため2文に分かれ、
      // 末尾の行は2文目に載る。分割で行が落ちたり項目を取り違えたりしないことを確かめる
      const items = Array.from({ length: 1000 }, (_, index) =>
        buildNode({
          tempId: `tmp-${index}`,
          lines: [
            buildLine({ lineType: 'ESTIMATE', name: `estimate-${index}` }),
            buildLine({ lineType: 'EXECUTION', name: `execution-${index}` }),
            buildLine({ lineType: 'VENDOR', name: `vendor-${index}` }),
          ],
        })
      );

      const result = await service.saveDraft(ESTIMATE_ID, buildInput(items));

      const upsertRows = readBulkLineUpsertRows();
      expect(upsertRows).toHaveLength(3000);
      // 1文目の先頭
      expect(upsertRows[0]).toMatchObject({
        estimateItemId: result.createdItemIds[0],
        lineType: 'ESTIMATE',
        name: 'estimate-0',
      });
      // 2文目に載る末尾（1文目の上限2727行を超える位置）
      expect(upsertRows[2999]).toMatchObject({
        estimateItemId: result.createdItemIds[999],
        lineType: 'VENDOR',
        name: 'vendor-999',
      });
      // 分割の境目（2文目の先頭＝通し2727行目）も対応する項目に紐づく
      expect(upsertRows[2727]).toMatchObject({
        estimateItemId: result.createdItemIds[909],
        lineType: 'ESTIMATE',
        name: 'estimate-909',
      });
    });

    it('一括UPDATEはパラメータ化され、値をSQL文字列へ埋め込まない', async () => {
      mockPrisma.estimateItem.findMany.mockResolvedValue([{ id: ITEM_A, parentId: null }]);

      await service.saveDraft(ESTIMATE_ID, buildInput([buildNode({ id: ITEM_A })]));

      const updateCall = mockTx.$executeRaw.mock.calls.find((call) =>
        (call[0] as Prisma.Sql).text.trimStart().startsWith('UPDATE "estimate_items"')
      );
      expect(updateCall).toBeDefined();

      const statement = updateCall![0] as Prisma.Sql;
      expect(statement.values).toContain(ITEM_A);
      expect(statement.values).toContain(ESTIMATE_ID);
      // 値はプレースホルダ経由で渡す（SQL文字列に生の値が現れない）
      expect(statement.text).not.toContain(ITEM_A);
      expect(statement.text).not.toContain(ESTIMATE_ID);
      expect(statement.text).toContain('$1');
    });
  });

  // ==========================================
  // トランザクションの制限時間（42.1, 42.3 / Task 57.6）
  // ==========================================
  describe('トランザクションの制限時間と超過時の応答（42.1, 42.3）', () => {
    /**
     * ここで期待値をリテラルで書くのは意図的（`ESTIMATE_SAVE_TRANSACTION_OPTIONS` を
     * そのまま突き合わせると定数を書き換えてもテストが緑のままになり、実測で確定した
     * 値を固定できないため）。値を変えるときは 57.6 の実測をやり直すこと。
     */
    const EXPECTED_TIMEOUT_MS = 15000;
    const EXPECTED_MAX_WAIT_MS = 5000;

    it('$transaction に実測で確定した timeout と maxWait を明示して渡す', async () => {
      await service.saveDraft(ESTIMATE_ID, buildInput([buildNode({ tempId: 'tmp-1' })]));

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      const options = mockPrisma.$transaction.mock.calls[0]![1] as unknown;
      expect(options).toEqual({ timeout: EXPECTED_TIMEOUT_MS, maxWait: EXPECTED_MAX_WAIT_MS });
    });

    it('公開定数は実測で確定した値そのものである（暫定値を残さない）', () => {
      expect(ESTIMATE_SAVE_TRANSACTION_OPTIONS).toEqual({
        timeout: EXPECTED_TIMEOUT_MS,
        maxWait: EXPECTED_MAX_WAIT_MS,
      });
    });

    it('制限時間超過（P2028）は原因と「保存されていないこと」が分かるエラーへ変換される', async () => {
      mockPrisma.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError(
          'Transaction API error: A query cannot be executed on an expired transaction.',
          { code: 'P2028', clientVersion: '7.8.0' }
        )
      );

      const error = await service
        .saveDraft(ESTIMATE_ID, buildInput([buildNode({ tempId: 'tmp-1' })]))
        .then(
          () => null,
          (e: unknown) => e
        );

      expect(error).toBeInstanceOf(EstimateSaveTimeoutError);
      const timeoutError = error as EstimateSaveTimeoutError;
      expect(timeoutError.statusCode).toBe(500);
      expect(timeoutError.code).toBe('ESTIMATE_SAVE_TIMEOUT');
      // 原因（時間内に完了しなかったこと）と結果（保存されていないこと）の双方を伝える
      expect(timeoutError.message).toContain('制限時間');
      expect(timeoutError.message).toContain('保存されていません');
      expect(timeoutError.details).toEqual({
        timeoutMs: EXPECTED_TIMEOUT_MS,
        maxItems: SAVE_ESTIMATE_MAX_ITEMS,
      });
    });

    it('P2028 以外の Prisma エラーは握り潰さずそのまま伝播する', async () => {
      const foreignKeyError = new Prisma.PrismaClientKnownRequestError('FK violation', {
        code: 'P2003',
        clientVersion: '7.8.0',
      });
      mockPrisma.$transaction.mockRejectedValueOnce(foreignKeyError);

      await expect(
        service.saveDraft(ESTIMATE_ID, buildInput([buildNode({ tempId: 'tmp-1' })]))
      ).rejects.toBe(foreignKeyError);
    });
  });
});
