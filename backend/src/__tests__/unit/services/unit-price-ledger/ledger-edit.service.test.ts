/**
 * @fileoverview 台帳の画面からの修正と削除（LedgerEditService）の単体試験（unit-price-ledger タスク2.6・2.7）
 *
 * Prisma のトランザクションをモックし、次を確かめる。
 * - 修正（5.1）：見積の有無（404）・案件の受領見積書の拒否（409 READ_ONLY）・楽観的排他制御（5.6）・
 *   読取の確認の遷移（5.4・46.6〜46.8）・明細行の置き換えと金額の算出（45.12）・業者名と取引先の決め直し・
 *   金額を入れない監査ログ（5.7）
 * - 削除（5.5）：論理削除・404・409 READ_ONLY・排他の不一致・監査ログ
 * - 印の更新（5.2・5.3）：参考の印と理由・分類キーの重ね合わせ、保存済みの印との照合（46.5）、
 *   見積に無い明細行の拒否、読取の確認を戻さないこと、監査ログに理由の値を入れないこと
 *
 * 実 DB での振る舞いは `__tests__/integration/unit-price-ledger-edit.integration.test.ts` が確かめる。
 *
 * @module tests/unit/services/unit-price-ledger/ledger-edit.service
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { IAuditLogService, CreateAuditLogInput } from '../../../../types/audit-log.types.js';
import { ReceivedQuotationNotFoundError } from '../../../../errors/receivedQuotationError.js';
import { ValidationError } from '../../../../errors/apiError.js';
import {
  LedgerConflictError,
  LedgerProjectQuotationReadOnlyError,
} from '../../../../errors/unitPriceLedgerError.js';
import {
  LINE_ITEM_VALIDATION_MESSAGES,
  RECEIVED_QUOTATION_FIELD_LIMITS,
  RECEIVED_QUOTATION_VALIDATION_MESSAGES,
  createReceivedQuotationSchema,
  type LineItemInput,
} from '../../../../schemas/received-quotation.schema.js';
import {
  UNIT_PRICE_LEDGER_VALIDATION_MESSAGES,
  type LedgerMarksUpdateInput,
  type LedgerQuotationUpdateInput,
} from '../../../../schemas/unit-price-ledger.schema.js';

/** 詳細の読み出し（LedgerQueryService.findById）。修正の後に返す詳細をテストごとに決める */
const findByIdMock = vi.fn();

vi.mock(
  '../../../../services/unit-price-ledger/ledger-query.service.js',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../../services/unit-price-ledger/ledger-query.service.js')
      >();
    return {
      ...actual,
      LedgerQueryService: vi.fn().mockImplementation(function () {
        return { findById: findByIdMock };
      }),
    };
  }
);

// モックの後に読み込む
const { LedgerEditService } =
  await import('../../../../services/unit-price-ledger/ledger-edit.service.js');
const { LEDGER_BASE_WHERE } =
  await import('../../../../services/unit-price-ledger/ledger-query.service.js');

const ACTOR_ID = 'user-actor-001';
const QUOTATION_ID = '11111111-1111-4111-8111-111111111111';
const LINE_A = '22222222-2222-4222-8222-222222222222';
const LINE_B = '33333333-3333-4333-8333-333333333333';
const UPDATED_AT = new Date('2026-04-01T00:00:00.000Z');
const NEWER_UPDATED_AT = new Date('2026-04-01T00:05:00.000Z');

/** トランザクションの中のクライアント */
const createTx = () => ({
  receivedQuotation: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  receivedQuotationLineItem: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  },
  tradingPartner: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
});
type MockTx = ReturnType<typeof createTx>;

/** 受領見積書の保存の行（台帳の対象。案件の無い見積） */
const quotationRow = (overrides: Record<string, unknown> = {}) => ({
  id: QUOTATION_ID,
  estimateRequestId: null,
  projectId: null,
  name: '台帳の見積',
  submittedAt: new Date('2026-03-01T00:00:00.000Z'),
  fileName: null,
  vendorName: '山田工務店',
  tradingPartnerId: null,
  quoteNumber: 'Q-001',
  overallConditions: '全体の条件',
  siteLocation: 'A市',
  constructionKind: 'RENOVATION',
  useType: '事務所',
  constructionPrice: '1234567.00',
  workConditions: null,
  distanceKm: '12.5',
  adoption: 'UNKNOWN',
  confirmedAmount: '1000000.00',
  quoteDiscriminator: 'RECEIVED',
  ledgerCardId: 'card-001',
  ledgerProjectName: '旧案件名',
  ledgerSourcePath: '/secret/path/original.pdf',
  readingStatus: 'UNCONFIRMED',
  readingConfirmedById: null,
  readingConfirmedAt: null,
  deletedAt: null,
  updatedAt: UPDATED_AT,
  ...overrides,
});

/** 明細行の保存の行（Decimal は文字列で返る想定） */
const storedLine = (overrides: Record<string, unknown> = {}) => ({
  id: LINE_A,
  receivedQuotationId: QUOTATION_ID,
  sortOrder: 0,
  customCategory: null,
  workType: '内装',
  name: '石膏ボード張り',
  specification: 't12.5',
  unit: 'm2',
  quantity: '10.0000',
  unitPrice: '1500.00',
  amount: '15000.00',
  remarks: null,
  category: 'DIRECT',
  condition: null,
  conversionQuantity: null,
  conversionUnit: null,
  conversionUnitPrice: null,
  conversionBasis: null,
  classificationKey: null,
  quantityRowKey: null,
  isReference: false,
  referenceReason: null,
  ...overrides,
});

/** 明細行の入力（storedLine と同じ中身） */
const lineInput = (overrides: Partial<LineItemInput> = {}): LineItemInput =>
  ({
    sortOrder: 0,
    workType: '内装',
    name: '石膏ボード張り',
    specification: 't12.5',
    unit: 'm2',
    quantity: 10,
    unitPrice: 1500,
    amount: 15000,
    category: 'DIRECT',
    isReference: false,
    ...overrides,
  }) as LineItemInput;

/** 修正の入力（業者名は今と同じ、明細行は保存済みと同じ） */
const updateInput = (
  overrides: Partial<LedgerQuotationUpdateInput> = {}
): LedgerQuotationUpdateInput =>
  ({
    vendorName: '山田工務店',
    submittedAt: '2026-03-02T00:00:00.000Z',
    lineItems: [lineInput()],
    expectedUpdatedAt: UPDATED_AT.toISOString(),
    ...overrides,
  }) as LedgerQuotationUpdateInput;

const marksInput = (overrides: Partial<LedgerMarksUpdateInput> = {}): LedgerMarksUpdateInput => ({
  lineItems: [],
  expectedUpdatedAt: UPDATED_AT.toISOString(),
  ...overrides,
});

const DETAIL = { id: QUOTATION_ID, marker: 'detail-after-save' };

describe('LedgerEditService', () => {
  let tx: MockTx;
  let mockPrisma: PrismaClient;
  let createLog: Mock<IAuditLogService['createLog']>;
  let service: InstanceType<typeof LedgerEditService>;

  /** 監査ログに渡した 1 件目の入力 */
  const auditInput = (): CreateAuditLogInput => createLog.mock.calls[0]![0];
  /** 受領見積書の条件付きの更新に渡した data */
  const claimedData = (): Record<string, unknown> =>
    tx.receivedQuotation.updateMany.mock.calls[0]![0].data;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = createTx();
    mockPrisma = {
      $transaction: vi.fn((fn: (client: MockTx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaClient;
    createLog = vi.fn<IAuditLogService['createLog']>().mockResolvedValue(undefined as never);
    service = new LedgerEditService({
      prisma: mockPrisma,
      auditLogService: {
        createLog,
        getLogs: vi.fn(),
        exportLogs: vi.fn(),
      } as unknown as IAuditLogService,
    });

    findByIdMock.mockResolvedValue(DETAIL);
    tx.receivedQuotation.findFirst.mockResolvedValue(quotationRow());
    tx.receivedQuotation.updateMany.mockResolvedValue({ count: 1 });
    tx.receivedQuotationLineItem.findMany.mockResolvedValue([storedLine()]);
    tx.receivedQuotationLineItem.deleteMany.mockResolvedValue({ count: 1 });
    tx.receivedQuotationLineItem.createMany.mockResolvedValue({ count: 1 });
    tx.receivedQuotationLineItem.count.mockResolvedValue(3);
    tx.receivedQuotationLineItem.update.mockResolvedValue({});
    tx.tradingPartner.findMany.mockResolvedValue([]);
  });

  describe('updateQuotation（修正 5.1）', () => {
    /**
     * @requirement unit-price-ledger/REQ-5.1
     */
    it('台帳の対象から読み、送った欄だけを条件付きで保存し、明細行を全量置き換えて詳細を返す', async () => {
      tx.receivedQuotation.findUniqueOrThrow.mockResolvedValue(
        quotationRow({ quoteNumber: 'Q-999', overallConditions: null })
      );

      const result = await service.updateQuotation(
        QUOTATION_ID,
        updateInput({
          quoteNumber: 'Q-999',
          overallConditions: null,
          ledgerProjectName: '新案件名',
          lineItems: [
            lineInput({
              sortOrder: 2,
              name: '後の行',
              quantity: 3,
              unitPrice: 333.33,
              amount: undefined,
            }),
            lineInput({
              sortOrder: 1,
              name: '先の行',
              quantity: null,
              unitPrice: 100,
              amount: undefined,
            }),
          ],
        }),
        ACTOR_ID
      );

      expect(result).toBe(DETAIL);
      expect(findByIdMock).toHaveBeenCalledWith(QUOTATION_ID, tx);
      expect(tx.receivedQuotation.findFirst).toHaveBeenCalledWith({
        where: { AND: [{ id: QUOTATION_ID }, LEDGER_BASE_WHERE] },
      });

      const [claim] = tx.receivedQuotation.updateMany.mock.calls[0]!;
      expect(claim.where).toEqual({
        id: QUOTATION_ID,
        updatedAt: UPDATED_AT,
        deletedAt: null,
        projectId: null,
      });
      expect(claim.data).toMatchObject({
        quoteNumber: 'Q-999',
        overallConditions: null,
        ledgerProjectName: '新案件名',
        submittedAt: new Date('2026-03-02T00:00:00.000Z'),
      });
      // 送らない欄は変えない
      expect(claim.data).not.toHaveProperty('siteLocation');
      expect(claim.data).not.toHaveProperty('ledgerSourcePath');
      // 業者名が今と同じで取引先を送らないときは業者名・取引先を書き換えない
      expect(claim.data).not.toHaveProperty('vendorName');
      expect(claim.data).not.toHaveProperty('tradingPartnerId');

      expect(tx.receivedQuotationLineItem.deleteMany).toHaveBeenCalledWith({
        where: { receivedQuotationId: QUOTATION_ID },
      });
      const created = tx.receivedQuotationLineItem.createMany.mock.calls[0]![0].data;
      // 並び順で並べ、金額が無く数量と単価がある行だけ数量×単価（丸め）を求める（45.12）
      expect(created.map((row: { name: string }) => row.name)).toEqual(['先の行', '後の行']);
      expect(created[0]).toMatchObject({ receivedQuotationId: QUOTATION_ID, amount: null });
      expect(created[1]).toMatchObject({ amount: 1000 });
    });

    /**
     * @requirement unit-price-ledger/REQ-5.1
     */
    it('換算の値と省略した欄を保存の形（4 列・null）に分けて書く', async () => {
      tx.receivedQuotation.findUniqueOrThrow.mockResolvedValue(quotationRow());

      await service.updateQuotation(
        QUOTATION_ID,
        updateInput({
          lineItems: [
            {
              sortOrder: 0,
              name: '換算の行',
              category: 'DIRECT',
              isReference: true,
              referenceReason: '参考',
              classificationKey: 'K-01',
              quantityRowKey: 'row-1',
              customCategory: '独自',
              condition: '夜間',
              remarks: '備考',
              conversion: { quantity: 2, unit: 'm', unitPrice: 50, basis: '1枚=2m' },
            } as LineItemInput,
          ],
        }),
        ACTOR_ID
      );

      expect(tx.receivedQuotationLineItem.createMany.mock.calls[0]![0].data[0]).toEqual({
        receivedQuotationId: QUOTATION_ID,
        sortOrder: 0,
        customCategory: '独自',
        workType: null,
        name: '換算の行',
        specification: null,
        unit: null,
        quantity: null,
        unitPrice: null,
        amount: null,
        remarks: '備考',
        category: 'DIRECT',
        condition: '夜間',
        conversionQuantity: 2,
        conversionUnit: 'm',
        conversionUnitPrice: 50,
        conversionBasis: '1枚=2m',
        classificationKey: 'K-01',
        quantityRowKey: 'row-1',
        isReference: true,
        referenceReason: '参考',
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-5.1
     */
    it('台帳の見積として無いときは ReceivedQuotationNotFoundError（404）で、何も書かない', async () => {
      tx.receivedQuotation.findFirst.mockResolvedValue(null);

      const error = await service
        .updateQuotation(QUOTATION_ID, updateInput(), ACTOR_ID)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ReceivedQuotationNotFoundError);
      expect((error as ReceivedQuotationNotFoundError).statusCode).toBe(404);
      expect(tx.receivedQuotation.updateMany).not.toHaveBeenCalled();
      expect(tx.receivedQuotationLineItem.deleteMany).not.toHaveBeenCalled();
      expect(createLog).not.toHaveBeenCalled();
    });

    /**
     * @requirement unit-price-ledger/REQ-5.2
     */
    it('案件の受領見積書は LedgerProjectQuotationReadOnlyError（409）で拒み、何も書かない', async () => {
      tx.receivedQuotation.findFirst.mockResolvedValue(quotationRow({ projectId: 'project-1' }));

      const error = await service
        .updateQuotation(QUOTATION_ID, updateInput(), ACTOR_ID)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(LedgerProjectQuotationReadOnlyError);
      expect((error as LedgerProjectQuotationReadOnlyError).statusCode).toBe(409);
      expect((error as LedgerProjectQuotationReadOnlyError).code).toBe(
        'LEDGER_PROJECT_QUOTATION_READ_ONLY'
      );
      expect((error as LedgerProjectQuotationReadOnlyError).details).toEqual({
        quotationId: QUOTATION_ID,
        operation: 'update',
      });
      expect(tx.receivedQuotation.updateMany).not.toHaveBeenCalled();
      expect(createLog).not.toHaveBeenCalled();
    });

    /**
     * @requirement unit-price-ledger/REQ-5.6
     */
    it('読んだ更新の日時が開いた時と違うときは LedgerConflictError（409）で、何も書かない', async () => {
      tx.receivedQuotation.findFirst.mockResolvedValue(
        quotationRow({ updatedAt: NEWER_UPDATED_AT })
      );

      const error = await service
        .updateQuotation(QUOTATION_ID, updateInput(), ACTOR_ID)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(LedgerConflictError);
      expect((error as LedgerConflictError).code).toBe('LEDGER_CONFLICT');
      expect((error as LedgerConflictError).details).toEqual({
        expectedUpdatedAt: UPDATED_AT.toISOString(),
        actualUpdatedAt: NEWER_UPDATED_AT.toISOString(),
      });
      expect(tx.receivedQuotation.updateMany).not.toHaveBeenCalled();
    });

    /**
     * @requirement unit-price-ledger/REQ-5.6
     */
    it('条件付きの更新が 0 件（同時の保存で先に確定した版がある）ときは LedgerConflictError で、明細行と監査ログを書かない', async () => {
      tx.receivedQuotation.updateMany.mockResolvedValue({ count: 0 });

      const error = await service
        .updateQuotation(QUOTATION_ID, updateInput(), ACTOR_ID)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(LedgerConflictError);
      expect((error as LedgerConflictError).statusCode).toBe(409);
      expect(tx.receivedQuotationLineItem.deleteMany).not.toHaveBeenCalled();
      expect(tx.receivedQuotationLineItem.createMany).not.toHaveBeenCalled();
      expect(createLog).not.toHaveBeenCalled();
    });

    /**
     * @requirement unit-price-ledger/REQ-5.1
     */
    it('保存後の詳細が読めないときは ReceivedQuotationNotFoundError', async () => {
      tx.receivedQuotation.findUniqueOrThrow.mockResolvedValue(quotationRow());
      findByIdMock.mockResolvedValue(null);

      await expect(
        service.updateQuotation(QUOTATION_ID, updateInput(), ACTOR_ID)
      ).rejects.toBeInstanceOf(ReceivedQuotationNotFoundError);
    });

    describe('読取の確認（5.4・46.6〜46.8）', () => {
      beforeEach(() => {
        tx.receivedQuotation.findUniqueOrThrow.mockResolvedValue(quotationRow());
      });

      /**
       * @requirement unit-price-ledger/REQ-5.4
       */
      it('未確認から確認済みにしたときは、確認者を操作した利用者、日時を今として記録する', async () => {
        const before = Date.now();
        await service.updateQuotation(
          QUOTATION_ID,
          updateInput({ readingStatus: 'CONFIRMED' }),
          ACTOR_ID
        );
        const after = Date.now();

        const data = claimedData();
        expect(data.readingStatus).toBe('CONFIRMED');
        expect(data.readingConfirmedById).toBe(ACTOR_ID);
        const at = (data.readingConfirmedAt as Date).getTime();
        expect(at).toBeGreaterThanOrEqual(before);
        expect(at).toBeLessThanOrEqual(after);
      });

      /**
       * @requirement unit-price-ledger/REQ-5.4
       */
      it('確認済みのまま明細行を変えずに確認済みを送り直しても、確認者と日時を保つ', async () => {
        tx.receivedQuotation.findFirst.mockResolvedValue(
          quotationRow({ readingStatus: 'CONFIRMED', readingConfirmedById: 'other-user' })
        );

        await service.updateQuotation(
          QUOTATION_ID,
          // Decimal の文字列と数の桁の違いは明細行の変更に当たらない
          updateInput({ readingStatus: 'CONFIRMED', lineItems: [lineInput()] }),
          ACTOR_ID
        );

        const data = claimedData();
        expect(data).not.toHaveProperty('readingStatus');
        expect(data).not.toHaveProperty('readingConfirmedById');
        expect(data).not.toHaveProperty('readingConfirmedAt');
      });

      /**
       * @requirement unit-price-ledger/REQ-5.4
       */
      it('確認済みで明細行の中身が変わるときは、確認済みを送っていても未確認に戻し、確認者と日時を消す', async () => {
        tx.receivedQuotation.findFirst.mockResolvedValue(
          quotationRow({ readingStatus: 'CONFIRMED', readingConfirmedById: 'other-user' })
        );

        await service.updateQuotation(
          QUOTATION_ID,
          updateInput({ readingStatus: 'CONFIRMED', lineItems: [lineInput({ unitPrice: 1600 })] }),
          ACTOR_ID
        );

        expect(claimedData()).toMatchObject({
          readingStatus: 'UNCONFIRMED',
          readingConfirmedById: null,
          readingConfirmedAt: null,
        });
      });

      /**
       * @requirement unit-price-ledger/REQ-5.4
       */
      it('確認済みで明細行の数が変わるときも未確認に戻す', async () => {
        tx.receivedQuotation.findFirst.mockResolvedValue(
          quotationRow({ readingStatus: 'CONFIRMED', readingConfirmedById: 'other-user' })
        );

        await service.updateQuotation(
          QUOTATION_ID,
          updateInput({ lineItems: [lineInput(), lineInput({ sortOrder: 1, name: '追加' })] }),
          ACTOR_ID
        );

        expect(claimedData()).toMatchObject({
          readingStatus: 'UNCONFIRMED',
          readingConfirmedById: null,
          readingConfirmedAt: null,
        });
      });

      /**
       * @requirement unit-price-ledger/REQ-5.4
       */
      it('未確認を送れば確認者と日時を消し、送らなければ読取の確認を変えない', async () => {
        await service.updateQuotation(
          QUOTATION_ID,
          updateInput({ readingStatus: 'UNCONFIRMED' }),
          ACTOR_ID
        );
        expect(claimedData()).toMatchObject({
          readingStatus: 'UNCONFIRMED',
          readingConfirmedById: null,
          readingConfirmedAt: null,
        });

        tx.receivedQuotation.updateMany.mockClear();
        await service.updateQuotation(QUOTATION_ID, updateInput(), ACTOR_ID);
        expect(claimedData()).not.toHaveProperty('readingStatus');
      });
    });

    describe('業者名と取引先の決め直し（44.5〜44.8）', () => {
      beforeEach(() => {
        tx.receivedQuotation.findUniqueOrThrow.mockResolvedValue(quotationRow());
      });

      /**
       * @requirement unit-price-ledger/REQ-5.1
       */
      it('業者名を変えると、前後の空白を除いた名前が一致する協力業者が 1 件なら紐づける', async () => {
        tx.tradingPartner.findMany.mockResolvedValue([{ id: 'tp-1' }]);

        await service.updateQuotation(
          QUOTATION_ID,
          updateInput({ vendorName: '  鈴木建設  ' }),
          ACTOR_ID
        );

        expect(tx.tradingPartner.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              name: '鈴木建設',
              deletedAt: null,
              types: { some: { type: 'SUBCONTRACTOR' } },
            },
            take: 2,
          })
        );
        expect(claimedData()).toMatchObject({ vendorName: '鈴木建設', tradingPartnerId: 'tp-1' });
      });

      /**
       * @requirement unit-price-ledger/REQ-5.1
       */
      it('名前が一致する協力業者が複数なら業者名だけを保持し、取引先の紐づけを外す', async () => {
        tx.tradingPartner.findMany.mockResolvedValue([{ id: 'tp-1' }, { id: 'tp-2' }]);

        await service.updateQuotation(
          QUOTATION_ID,
          updateInput({ vendorName: '鈴木建設' }),
          ACTOR_ID
        );

        expect(claimedData()).toMatchObject({ vendorName: '鈴木建設', tradingPartnerId: null });
      });

      /**
       * @requirement unit-price-ledger/REQ-5.1
       */
      it('今と違う取引先を選ぶと、論理削除されていない協力業者に限り紐づけ、業者名に取引先の名前を入れる', async () => {
        tx.tradingPartner.findUnique.mockResolvedValue({
          id: 'tp-9',
          name: '佐藤設備',
          deletedAt: null,
          types: [{ type: 'CUSTOMER' }, { type: 'SUBCONTRACTOR' }],
        });

        await service.updateQuotation(
          QUOTATION_ID,
          updateInput({ vendorName: '山田工務店', tradingPartnerId: 'tp-9' }),
          ACTOR_ID
        );

        expect(tx.tradingPartner.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'tp-9' } })
        );
        expect(claimedData()).toMatchObject({ vendorName: '佐藤設備', tradingPartnerId: 'tp-9' });
        expect(tx.tradingPartner.findMany).not.toHaveBeenCalled();
      });

      /**
       * @requirement unit-price-ledger/REQ-5.1
       */
      it.each([
        ['存在しない', null],
        [
          '論理削除された',
          { id: 'tp-9', name: 'x', deletedAt: new Date(), types: [{ type: 'SUBCONTRACTOR' }] },
        ],
        [
          '協力業者でない',
          { id: 'tp-9', name: 'x', deletedAt: null, types: [{ type: 'CUSTOMER' }] },
        ],
      ])('%s取引先を選ぶと ValidationError で拒み、保存しない', async (_label, partner) => {
        tx.tradingPartner.findUnique.mockResolvedValue(partner);

        const error = await service
          .updateQuotation(QUOTATION_ID, updateInput({ tradingPartnerId: 'tp-9' }), ACTOR_ID)
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toBe(
          RECEIVED_QUOTATION_VALIDATION_MESSAGES.TRADING_PARTNER_NOT_SUBCONTRACTOR
        );
        expect(tx.receivedQuotation.updateMany).not.toHaveBeenCalled();
      });

      /**
       * @requirement unit-price-ledger/REQ-5.1
       */
      it('今と同じ取引先を送り直したときは業者名と取引先を変えない', async () => {
        tx.receivedQuotation.findFirst.mockResolvedValue(
          quotationRow({ tradingPartnerId: 'tp-1' })
        );

        await service.updateQuotation(
          QUOTATION_ID,
          updateInput({ tradingPartnerId: 'tp-1' }),
          ACTOR_ID
        );

        expect(claimedData()).not.toHaveProperty('vendorName');
        expect(claimedData()).not.toHaveProperty('tradingPartnerId');
        expect(tx.tradingPartner.findUnique).not.toHaveBeenCalled();
        expect(tx.tradingPartner.findMany).not.toHaveBeenCalled();
      });

      /**
       * @requirement unit-price-ledger/REQ-5.1
       */
      it('取引先の紐づけを外す（null）と、業者名の一致で決め直す', async () => {
        tx.receivedQuotation.findFirst.mockResolvedValue(
          quotationRow({ tradingPartnerId: 'tp-1' })
        );
        tx.tradingPartner.findMany.mockResolvedValue([]);

        await service.updateQuotation(
          QUOTATION_ID,
          updateInput({ tradingPartnerId: null }),
          ACTOR_ID
        );

        expect(tx.tradingPartner.findUnique).not.toHaveBeenCalled();
        expect(claimedData()).toMatchObject({ vendorName: '山田工務店', tradingPartnerId: null });
      });
    });

    describe('受領見積書の名前の作り直し（5.8）', () => {
      /** 今と同じ見積日（quotationRow の submittedAt） */
      const SAME_DATE = '2026-03-01T00:00:00.000Z';

      beforeEach(() => {
        tx.receivedQuotation.findUniqueOrThrow.mockResolvedValue(quotationRow());
      });

      /**
       * @requirement unit-price-ledger/REQ-5.8
       */
      it('業者名を変えると、取り込みと同じ「業者_見積日」の形で名前を作り直す', async () => {
        await service.updateQuotation(
          QUOTATION_ID,
          updateInput({ vendorName: ' 鈴木建設 ', submittedAt: SAME_DATE }),
          ACTOR_ID
        );

        expect(claimedData()).toMatchObject({
          vendorName: '鈴木建設',
          name: '鈴木建設_2026-03-01',
        });
      });

      /**
       * @requirement unit-price-ledger/REQ-5.8
       */
      it('見積日だけを変えても、今の業者名と新しい見積日で名前を作り直す', async () => {
        await service.updateQuotation(
          QUOTATION_ID,
          updateInput({ submittedAt: '2026-03-02T00:00:00.000Z' }),
          ACTOR_ID
        );

        expect(claimedData()).toMatchObject({ name: '山田工務店_2026-03-02' });
        expect(claimedData()).not.toHaveProperty('vendorName');
      });

      /**
       * @requirement unit-price-ledger/REQ-5.8
       */
      it('業者名も見積日も変えないときは、名前を変えない（ほかの欄だけの修正）', async () => {
        await service.updateQuotation(
          QUOTATION_ID,
          updateInput({ submittedAt: SAME_DATE, quoteNumber: 'Q-777' }),
          ACTOR_ID
        );

        expect(claimedData()).not.toHaveProperty('name');
      });

      /**
       * @requirement unit-price-ledger/REQ-5.8
       */
      it('取引先を選んで業者名が取引先の名前になったときは、その名前で作り直す', async () => {
        tx.tradingPartner.findUnique.mockResolvedValue({
          id: 'tp-9',
          name: '佐藤設備',
          deletedAt: null,
          types: [{ type: 'SUBCONTRACTOR' }],
        });

        await service.updateQuotation(
          QUOTATION_ID,
          updateInput({ tradingPartnerId: 'tp-9', submittedAt: SAME_DATE }),
          ACTOR_ID
        );

        expect(claimedData()).toMatchObject({ name: '佐藤設備_2026-03-01' });
      });

      /**
       * @requirement unit-price-ledger/REQ-5.8
       */
      it('名前が受領見積書の名前の上限を超えるときは、上限までで切り詰める', async () => {
        const vendorName = '長'.repeat(RECEIVED_QUOTATION_FIELD_LIMITS.vendorName);

        await service.updateQuotation(
          QUOTATION_ID,
          updateInput({ vendorName, submittedAt: SAME_DATE }),
          ACTOR_ID
        );

        const name = claimedData().name as string;
        const nameMax = createReceivedQuotationSchema.shape.name.maxLength!;
        expect(name).toHaveLength(nameMax);
        expect(`${vendorName}_2026-03-01`.startsWith(name)).toBe(true);
      });

      /**
       * @requirement unit-price-ledger/REQ-5.8
       */
      it('作り直した名前の前後を監査ログに入れる', async () => {
        tx.receivedQuotation.findUniqueOrThrow.mockResolvedValue(
          quotationRow({ vendorName: '鈴木建設', name: '鈴木建設_2026-03-01' })
        );

        await service.updateQuotation(
          QUOTATION_ID,
          updateInput({ vendorName: '鈴木建設', submittedAt: SAME_DATE }),
          ACTOR_ID
        );

        const log = auditInput();
        expect(log.before).toMatchObject({ name: '台帳の見積', vendorName: '山田工務店' });
        expect(log.after).toMatchObject({ name: '鈴木建設_2026-03-01', vendorName: '鈴木建設' });
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-5.7
     */
    it('監査ログを同じトランザクションで書き、工事価格・確定金額・明細行の中身・原本のパスの値を入れない', async () => {
      tx.receivedQuotation.findUniqueOrThrow.mockResolvedValue(
        quotationRow({
          quoteNumber: 'Q-002',
          constructionPrice: '7654321.00',
          confirmedAmount: '1000000.00',
          ledgerProjectName: '新案件名',
        })
      );

      await service.updateQuotation(
        QUOTATION_ID,
        updateInput({
          quoteNumber: 'Q-002',
          constructionPrice: 7654321,
          ledgerProjectName: '新案件名',
          lineItems: [lineInput(), lineInput({ sortOrder: 1, name: '追加', amount: 98765 })],
        }),
        ACTOR_ID
      );

      expect(createLog).toHaveBeenCalledTimes(1);
      expect(createLog.mock.calls[0]![1]).toBe(tx);
      const log = auditInput();
      expect(log).toMatchObject({
        action: 'RECEIVED_QUOTATION_UPDATED',
        actorId: ACTOR_ID,
        targetType: 'ReceivedQuotation',
        targetId: QUOTATION_ID,
        metadata: { source: 'unit_price_ledger' },
      });
      expect(log.before).toMatchObject({
        quoteNumber: 'Q-001',
        lineItemCount: 1,
        distanceKm: 12.5,
        submittedAt: '2026-03-01T00:00:00.000Z',
        ledgerCardId: 'card-001',
        ledgerProjectName: '旧案件名',
      });
      expect(log.after).toMatchObject({
        quoteNumber: 'Q-002',
        lineItemCount: 2,
        ledgerProjectName: '新案件名',
        constructionPriceChanged: true,
        confirmedAmountChanged: false,
      });

      for (const side of [log.before, log.after]) {
        expect(side).not.toHaveProperty('constructionPrice');
        expect(side).not.toHaveProperty('confirmedAmount');
        expect(side).not.toHaveProperty('ledgerSourcePath');
        expect(side).not.toHaveProperty('lineItems');
      }
      const serialized = JSON.stringify(log);
      expect(serialized).not.toContain('7654321');
      expect(serialized).not.toContain('1234567');
      expect(serialized).not.toContain('1000000');
      expect(serialized).not.toContain('98765');
      expect(serialized).not.toContain('/secret/path');
    });
  });

  describe('deleteQuotation（削除 5.5）', () => {
    /**
     * @requirement unit-price-ledger/REQ-5.5
     */
    it('案件の無い受領見積書を条件付きで論理削除し、明細行の件数を入れて監査ログを書く', async () => {
      const before = Date.now();
      await service.deleteQuotation(QUOTATION_ID, UPDATED_AT, ACTOR_ID);

      const [claim] = tx.receivedQuotation.updateMany.mock.calls[0]!;
      expect(claim.where).toEqual({
        id: QUOTATION_ID,
        updatedAt: UPDATED_AT,
        deletedAt: null,
        projectId: null,
      });
      expect(Object.keys(claim.data)).toEqual(['deletedAt']);
      expect((claim.data.deletedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
      expect(tx.receivedQuotationLineItem.count).toHaveBeenCalledWith({
        where: { receivedQuotationId: QUOTATION_ID },
      });

      expect(createLog.mock.calls[0]![1]).toBe(tx);
      const log = auditInput();
      expect(log).toMatchObject({
        action: 'RECEIVED_QUOTATION_DELETED',
        actorId: ACTOR_ID,
        targetId: QUOTATION_ID,
        after: null,
        metadata: { source: 'unit_price_ledger' },
      });
      expect(log.before).toMatchObject({ lineItemCount: 3, vendorName: '山田工務店' });
      const serialized = JSON.stringify(log);
      expect(serialized).not.toContain('1234567');
      expect(serialized).not.toContain('/secret/path');
    });

    /**
     * @requirement unit-price-ledger/REQ-5.5
     */
    it('台帳の見積として無いときは ReceivedQuotationNotFoundError で、何も書かない', async () => {
      tx.receivedQuotation.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteQuotation(QUOTATION_ID, UPDATED_AT, ACTOR_ID)
      ).rejects.toBeInstanceOf(ReceivedQuotationNotFoundError);
      expect(tx.receivedQuotation.updateMany).not.toHaveBeenCalled();
      expect(createLog).not.toHaveBeenCalled();
    });

    /**
     * @requirement unit-price-ledger/REQ-5.5
     */
    it('案件の受領見積書は削除の操作として LedgerProjectQuotationReadOnlyError で拒む', async () => {
      tx.receivedQuotation.findFirst.mockResolvedValue(quotationRow({ projectId: 'project-1' }));

      const error = await service
        .deleteQuotation(QUOTATION_ID, UPDATED_AT, ACTOR_ID)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(LedgerProjectQuotationReadOnlyError);
      expect((error as LedgerProjectQuotationReadOnlyError).details).toEqual({
        quotationId: QUOTATION_ID,
        operation: 'delete',
      });
      expect(tx.receivedQuotation.updateMany).not.toHaveBeenCalled();
    });

    /**
     * @requirement unit-price-ledger/REQ-5.6
     */
    it('開いた時と更新の日時が違う・条件付きの更新が 0 件のときは LedgerConflictError で監査ログを書かない', async () => {
      tx.receivedQuotation.findFirst.mockResolvedValue(
        quotationRow({ updatedAt: NEWER_UPDATED_AT })
      );
      await expect(
        service.deleteQuotation(QUOTATION_ID, UPDATED_AT, ACTOR_ID)
      ).rejects.toBeInstanceOf(LedgerConflictError);
      expect(tx.receivedQuotation.updateMany).not.toHaveBeenCalled();

      tx.receivedQuotation.findFirst.mockResolvedValue(quotationRow());
      tx.receivedQuotation.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.deleteQuotation(QUOTATION_ID, UPDATED_AT, ACTOR_ID)
      ).rejects.toBeInstanceOf(LedgerConflictError);
      expect(createLog).not.toHaveBeenCalled();
    });
  });

  describe('updateMarks（印の更新 5.2・5.3）', () => {
    const storedMarks = () => [
      {
        id: LINE_A,
        sortOrder: 0,
        isReference: false,
        referenceReason: null,
        classificationKey: null,
      },
      {
        id: LINE_B,
        sortOrder: 1,
        isReference: true,
        referenceReason: '過去の参考',
        classificationKey: 'K-OLD',
      },
    ];

    beforeEach(() => {
      tx.receivedQuotationLineItem.findMany.mockResolvedValue(storedMarks());
      tx.receivedQuotation.findUniqueOrThrow.mockResolvedValue(quotationRow());
    });

    /**
     * @requirement unit-price-ledger/REQ-5.2
     * @requirement unit-price-ledger/REQ-5.3
     */
    it('案件の受領見積書でも、変わった行だけ参考の印と理由・分類キーを書き、詳細を返す', async () => {
      tx.receivedQuotation.findFirst.mockResolvedValue(quotationRow({ projectId: 'project-1' }));

      const result = await service.updateMarks(
        QUOTATION_ID,
        marksInput({
          lineItems: [
            {
              id: LINE_A,
              isReference: true,
              referenceReason: '単価が特殊',
              classificationKey: 'K-01',
            },
            // 保存済みと同じ印は書かない
            { id: LINE_B, classificationKey: 'K-OLD' },
          ],
        }),
        ACTOR_ID
      );

      expect(result).toBe(DETAIL);
      expect(tx.receivedQuotationLineItem.update).toHaveBeenCalledTimes(1);
      expect(tx.receivedQuotationLineItem.update).toHaveBeenCalledWith({
        where: { id: LINE_A },
        data: { isReference: true, referenceReason: '単価が特殊', classificationKey: 'K-01' },
      });
      // 案件の受領見積書でも、読んだ時と同じ案件の行だけを書き換える
      expect(tx.receivedQuotation.updateMany.mock.calls[0]![0].where).toEqual({
        id: QUOTATION_ID,
        updatedAt: UPDATED_AT,
        deletedAt: null,
        projectId: 'project-1',
      });
      // ほかの欄は変えない
      expect(tx.receivedQuotationLineItem.deleteMany).not.toHaveBeenCalled();
      expect(tx.receivedQuotationLineItem.createMany).not.toHaveBeenCalled();
    });

    /**
     * @requirement unit-price-ledger/REQ-5.6
     */
    it('明細行だけを変えるときも受領見積書の更新の日時を進め、読取の確認を送らなければ変えない', async () => {
      const before = Date.now();
      await service.updateMarks(
        QUOTATION_ID,
        marksInput({ lineItems: [{ id: LINE_A, classificationKey: 'K-01' }] }),
        ACTOR_ID
      );

      const data = claimedData();
      expect(Object.keys(data)).toEqual(['updatedAt']);
      expect((data.updatedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    });

    /**
     * @requirement unit-price-ledger/REQ-5.4
     */
    it('確認済みの見積の印を変えても読取の確認を未確認に戻さない', async () => {
      tx.receivedQuotation.findFirst.mockResolvedValue(
        quotationRow({ readingStatus: 'CONFIRMED', readingConfirmedById: 'other-user' })
      );

      await service.updateMarks(
        QUOTATION_ID,
        marksInput({
          readingStatus: 'CONFIRMED',
          lineItems: [{ id: LINE_A, isReference: true, referenceReason: '理由' }],
        }),
        ACTOR_ID
      );

      const data = claimedData();
      expect(data).not.toHaveProperty('readingStatus');
      expect(data).not.toHaveProperty('readingConfirmedById');
      expect(tx.receivedQuotationLineItem.update).toHaveBeenCalledTimes(1);
    });

    /**
     * @requirement unit-price-ledger/REQ-5.4
     */
    it('未確認から確認済みにすると確認者を操作した利用者として記録し、未確認を送ると確認者と日時を消す', async () => {
      await service.updateMarks(QUOTATION_ID, marksInput({ readingStatus: 'CONFIRMED' }), ACTOR_ID);
      expect(claimedData()).toMatchObject({
        readingStatus: 'CONFIRMED',
        readingConfirmedById: ACTOR_ID,
      });
      expect(claimedData().readingConfirmedAt).toBeInstanceOf(Date);

      tx.receivedQuotation.updateMany.mockClear();
      tx.receivedQuotation.findFirst.mockResolvedValue(
        quotationRow({ readingStatus: 'CONFIRMED', readingConfirmedById: 'other-user' })
      );
      await service.updateMarks(
        QUOTATION_ID,
        marksInput({ readingStatus: 'UNCONFIRMED' }),
        ACTOR_ID
      );
      expect(claimedData()).toMatchObject({
        readingStatus: 'UNCONFIRMED',
        readingConfirmedById: null,
        readingConfirmedAt: null,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-5.2
     */
    it('印を送らずに理由だけを送り、保存済みの印が無の行なら ValidationError（46.5）で、何も書かない', async () => {
      const error = await service
        .updateMarks(
          QUOTATION_ID,
          marksInput({ lineItems: [{ id: LINE_A, referenceReason: '理由だけ' }] }),
          ACTOR_ID
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toBe(
        LINE_ITEM_VALIDATION_MESSAGES.REFERENCE_REASON_WITHOUT_REFERENCE
      );
      expect((error as ValidationError).details).toEqual({ lineItemId: LINE_A });
      expect(tx.receivedQuotation.updateMany).not.toHaveBeenCalled();
      expect(tx.receivedQuotationLineItem.update).not.toHaveBeenCalled();
    });

    /**
     * @requirement unit-price-ledger/REQ-5.2
     */
    it('印を送らずに理由だけを送り、保存済みの印が有の行なら理由を書き換える。空白だけの理由は拒まない', async () => {
      await service.updateMarks(
        QUOTATION_ID,
        marksInput({
          lineItems: [
            { id: LINE_B, referenceReason: '新しい理由' },
            { id: LINE_A, referenceReason: '   ' },
          ],
        }),
        ACTOR_ID
      );

      expect(tx.receivedQuotationLineItem.update).toHaveBeenCalledTimes(1);
      expect(tx.receivedQuotationLineItem.update).toHaveBeenCalledWith({
        where: { id: LINE_B },
        data: { isReference: true, referenceReason: '新しい理由', classificationKey: 'K-OLD' },
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-5.2
     */
    it('参考の印を外して理由を送らないときは、保存済みの理由を消す', async () => {
      await service.updateMarks(
        QUOTATION_ID,
        marksInput({ lineItems: [{ id: LINE_B, isReference: false }] }),
        ACTOR_ID
      );

      expect(tx.receivedQuotationLineItem.update).toHaveBeenCalledWith({
        where: { id: LINE_B },
        data: { isReference: false, referenceReason: null, classificationKey: 'K-OLD' },
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-5.2
     */
    it('見積に無い明細行を指定すると ValidationError で、ほかの行も書かない', async () => {
      const stranger = '44444444-4444-4444-8444-444444444444';

      const error = await service
        .updateMarks(
          QUOTATION_ID,
          marksInput({
            lineItems: [
              { id: LINE_A, classificationKey: 'K-01' },
              { id: stranger, classificationKey: 'K-02' },
            ],
          }),
          ACTOR_ID
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toBe(
        UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.LINE_ITEM_NOT_IN_QUOTATION
      );
      expect((error as ValidationError).details).toEqual({ lineItemId: stranger });
      expect(tx.receivedQuotation.updateMany).not.toHaveBeenCalled();
      expect(tx.receivedQuotationLineItem.update).not.toHaveBeenCalled();
    });

    /**
     * @requirement unit-price-ledger/REQ-5.6
     */
    it('開いた時と更新の日時が違う・条件付きの更新が 0 件のときは LedgerConflictError で、明細行を書かない', async () => {
      tx.receivedQuotation.findFirst.mockResolvedValue(
        quotationRow({ updatedAt: NEWER_UPDATED_AT })
      );
      await expect(
        service.updateMarks(QUOTATION_ID, marksInput(), ACTOR_ID)
      ).rejects.toBeInstanceOf(LedgerConflictError);

      tx.receivedQuotation.findFirst.mockResolvedValue(quotationRow());
      tx.receivedQuotation.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.updateMarks(
          QUOTATION_ID,
          marksInput({ lineItems: [{ id: LINE_A, classificationKey: 'K-01' }] }),
          ACTOR_ID
        )
      ).rejects.toBeInstanceOf(LedgerConflictError);
      expect(tx.receivedQuotationLineItem.update).not.toHaveBeenCalled();
      expect(createLog).not.toHaveBeenCalled();
    });

    /**
     * @requirement unit-price-ledger/REQ-5.2
     */
    it('台帳の見積として無いとき・保存後の詳細が読めないときは ReceivedQuotationNotFoundError', async () => {
      tx.receivedQuotation.findFirst.mockResolvedValue(null);
      await expect(
        service.updateMarks(QUOTATION_ID, marksInput(), ACTOR_ID)
      ).rejects.toBeInstanceOf(ReceivedQuotationNotFoundError);

      tx.receivedQuotation.findFirst.mockResolvedValue(quotationRow());
      findByIdMock.mockResolvedValue(null);
      await expect(
        service.updateMarks(QUOTATION_ID, marksInput(), ACTOR_ID)
      ).rejects.toBeInstanceOf(ReceivedQuotationNotFoundError);
    });

    /**
     * @requirement unit-price-ledger/REQ-5.7
     */
    it('監査ログに変わった印だけを入れ、参考の理由の値は入れず変わったかどうかだけを入れる', async () => {
      await service.updateMarks(
        QUOTATION_ID,
        marksInput({
          lineItems: [
            { id: LINE_A, isReference: true, referenceReason: '単価 98765 円は特殊' },
            { id: LINE_B, classificationKey: 'K-NEW' },
          ],
        }),
        ACTOR_ID
      );

      expect(createLog.mock.calls[0]![1]).toBe(tx);
      const log = auditInput();
      expect(log).toMatchObject({
        action: 'RECEIVED_QUOTATION_UPDATED',
        actorId: ACTOR_ID,
        targetId: QUOTATION_ID,
        metadata: { source: 'unit_price_ledger' },
      });
      expect(log.before).toMatchObject({ lineItemCount: 2 });
      expect(log.after).toMatchObject({
        lineItemCount: 2,
        constructionPriceChanged: false,
        confirmedAmountChanged: false,
        lineItemMarkChanges: [
          {
            lineItemId: LINE_A,
            sortOrder: 0,
            isReference: { before: false, after: true },
            referenceReasonChanged: true,
          },
          {
            lineItemId: LINE_B,
            sortOrder: 1,
            classificationKey: { before: 'K-OLD', after: 'K-NEW' },
          },
        ],
      });
      const changes = (log.after as { lineItemMarkChanges: Record<string, unknown>[] })
        .lineItemMarkChanges;
      expect(changes[0]).not.toHaveProperty('classificationKey');
      expect(changes[1]).not.toHaveProperty('isReference');
      expect(changes[1]).not.toHaveProperty('referenceReasonChanged');

      const serialized = JSON.stringify(log);
      expect(serialized).not.toContain('98765');
      expect(serialized).not.toContain('過去の参考');
      expect(serialized).not.toContain('1234567');
      expect(serialized).not.toContain('/secret/path');
    });
  });
});
