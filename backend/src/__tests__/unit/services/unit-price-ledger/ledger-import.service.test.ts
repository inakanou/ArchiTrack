/**
 * @fileoverview 見積カードの取り込み（LedgerImportService）の単体試験（unit-price-ledger タスク2.4）
 *
 * 読み取りの結果（parseUpload）を差し替え、Prisma のトランザクション・監査ログを模して、
 * カードごとの登録・飛ばし・失敗、取引先の照合、読取の確認、一意の索引の違反の扱い、
 * 基盤の誤りの再送出、結果のまとめ、件数のログ、監査ログの中身を確かめる。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma, type PrismaClient } from '../../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../../types/audit-log.types.js';
import type {
  LedgerCardParseOutcome,
  LedgerLineItemInput,
  LedgerQuotationInput,
  LedgerUploadFile,
} from '../../../../services/unit-price-ledger/ledger-card-parser.js';

vi.mock('../../../../services/unit-price-ledger/ledger-card-parser.js', () => ({
  parseUpload: vi.fn(),
}));

vi.mock('../../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { parseUpload } from '../../../../services/unit-price-ledger/ledger-card-parser.js';
import logger from '../../../../utils/logger.js';
import {
  LedgerImportService,
  LEDGER_IMPORT_FAILURE_REASONS,
} from '../../../../services/unit-price-ledger/ledger-import.service.js';

type ParsedOutcome = Extract<LedgerCardParseOutcome, { kind: 'parsed' }>;

const ACTOR_ID = 'actor-admin-1';
const FILES: LedgerUploadFile[] = [
  { originalName: 'cards.zip', buffer: Buffer.from('zip'), mimeType: 'application/zip' },
];

const lineItem = (overrides: Partial<LedgerLineItemInput> = {}): LedgerLineItemInput => ({
  sortOrder: 0,
  name: '石膏ボード張り',
  specification: 't12.5',
  unit: 'm2',
  quantity: 10,
  unitPrice: 1500,
  amount: 15000,
  remarks: null,
  category: 'DIRECT',
  condition: null,
  conversion: null,
  isReference: false,
  referenceReason: null,
  ...overrides,
});

const quotationInput = (overrides: Partial<LedgerQuotationInput> = {}): LedgerQuotationInput => ({
  ledgerCardId: 'card-1',
  ledgerSourcePath: '/secret/source/path/card-1.pdf',
  ledgerProjectName: 'A小学校改修',
  vendorName: '  山田内装  ',
  name: '山田内装 見積 2026-10-01',
  submittedAt: new Date('2026-10-01T00:00:00.000Z'),
  ledgerFields: {
    quoteNumber: 'Q-123',
    overallConditions: '足場は別途',
    siteLocation: 'A市',
    constructionKind: 'RENOVATION',
    useType: '学校',
    constructionPrice: 987654,
    workConditions: '夜間',
    distanceKm: 12.5,
    adoption: 'ADOPTED',
    confirmedAmount: 876543,
  },
  readingConfirmed: { confirmed: false, readAt: null },
  lineItems: [lineItem()],
  ...overrides,
});

const parsed = (
  cardId: string,
  overrides: Partial<Omit<ParsedOutcome, 'kind'>> = {},
  inputOverrides: Partial<LedgerQuotationInput> = {}
): ParsedOutcome => ({
  kind: 'parsed',
  fileName: `${cardId}.json`,
  cardId,
  input: quotationInput({ ledgerCardId: cardId, ...inputOverrides }),
  truncatedFields: [],
  unreadableFields: [],
  referenceReasons: [],
  declaredTotals: {
    taxExcluded: null,
    DISCOUNT: null,
    OVERHEAD: null,
    TRAVEL: null,
    WASTE: null,
  } as ParsedOutcome['declaredTotals'],
  ...overrides,
});

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`error ${code} with secret 山田内装`, {
    code,
    clientVersion: 'test',
  });

/** トランザクションの中の client（tx） */
const createTx = () => ({
  receivedQuotation: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
  },
  receivedQuotationLineItem: {
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  tradingPartner: {
    findMany: vi.fn().mockResolvedValue([]),
  },
});

type Tx = ReturnType<typeof createTx>;

/** create の data から、DB が返す受領見積書の行を作る */
const quotationRowFrom = (id: string, data: Record<string, unknown>) => ({
  id,
  fileName: null,
  quoteDiscriminator: 'disc-1',
  ...data,
  distanceKm:
    data.distanceKm === null || data.distanceKm === undefined
      ? null
      : new Prisma.Decimal(String(data.distanceKm)),
});

describe('LedgerImportService', () => {
  let tx: Tx;
  let prisma: {
    receivedQuotation: { findFirst: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let auditLogService: { createLog: ReturnType<typeof vi.fn> };
  let service: LedgerImportService;
  let createdCount: number;

  beforeEach(() => {
    vi.clearAllMocks();
    createdCount = 0;
    tx = createTx();
    tx.receivedQuotation.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        createdCount += 1;
        return quotationRowFrom(`rq-${createdCount}`, data);
      }
    );
    prisma = {
      receivedQuotation: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (fn: (client: Tx) => Promise<unknown>) => fn(tx)),
    };
    auditLogService = { createLog: vi.fn().mockResolvedValue({ id: 'audit-1' }) };
    service = new LedgerImportService({
      prisma: prisma as unknown as PrismaClient,
      auditLogService: auditLogService as unknown as IAuditLogService,
    });
  });

  describe('読み取りの結果の振り分け', () => {
    it('@requirement unit-price-ledger/REQ-2.15 読み取りに失敗したファイルは登録せず、名前と理由を失敗に入れる', async () => {
      vi.mocked(parseUpload).mockReturnValue([
        { kind: 'failed', fileName: 'broken.json', reason: 'JSON として読み込めません' },
      ]);

      const result = await service.importCards(FILES, ACTOR_ID);

      expect(parseUpload).toHaveBeenCalledWith(FILES);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual({
        importedCount: 0,
        skipped: [],
        failed: [{ fileName: 'broken.json', reason: 'JSON として読み込めません' }],
        truncated: [],
        referenceMarkedCount: 0,
      });
    });

    it('@requirement unit-price-ledger/REQ-2.16 カードごとに 1 つのトランザクションで登録する', async () => {
      vi.mocked(parseUpload).mockReturnValue([parsed('card-1'), parsed('card-2')]);

      const result = await service.importCards(FILES, ACTOR_ID);

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(tx.receivedQuotation.create).toHaveBeenCalledTimes(2);
      expect(auditLogService.createLog).toHaveBeenCalledTimes(2);
      // 監査ログはカードの登録と同じトランザクションで書く
      for (const call of auditLogService.createLog.mock.calls) {
        expect(call[1]).toBe(tx);
      }
      expect(result.importedCount).toBe(2);
    });
  });

  describe('受領見積書と明細行の登録', () => {
    it('@requirement unit-price-ledger/REQ-2.1 案件も見積依頼も無い受領見積書として、カードの欄を書く', async () => {
      vi.mocked(parseUpload).mockReturnValue([parsed('card-1')]);

      await service.importCards(FILES, ACTOR_ID);

      const { data } = tx.receivedQuotation.create.mock.calls[0]![0];
      expect(data).toMatchObject({
        estimateRequestId: null,
        projectId: null,
        vendorName: '  山田内装  ',
        name: '山田内装 見積 2026-10-01',
        submittedAt: new Date('2026-10-01T00:00:00.000Z'),
        quoteNumber: 'Q-123',
        overallConditions: '足場は別途',
        siteLocation: 'A市',
        constructionKind: 'RENOVATION',
        useType: '学校',
        constructionPrice: 987654,
        workConditions: '夜間',
        distanceKm: 12.5,
        adoption: 'ADOPTED',
        confirmedAmount: 876543,
        ledgerCardId: 'card-1',
        ledgerSourcePath: '/secret/source/path/card-1.pdf',
        ledgerProjectName: 'A小学校改修',
      });
    });

    it('@requirement unit-price-ledger/REQ-2.1 明細行は換算を 4 列に分けて、登録した受領見積書に紐づけて書く', async () => {
      vi.mocked(parseUpload).mockReturnValue([
        parsed(
          'card-1',
          {},
          {
            lineItems: [
              lineItem(),
              lineItem({
                sortOrder: 1,
                name: '軽鉄下地',
                category: 'OVERHEAD',
                conversion: { quantity: 2, unit: '箇所', unitPrice: 7500, basis: '1 箇所 5m2' },
                isReference: true,
                referenceReason: '数量×単価が金額と合わない',
              }),
            ],
          }
        ),
      ]);

      await service.importCards(FILES, ACTOR_ID);

      expect(tx.receivedQuotationLineItem.createMany).toHaveBeenCalledTimes(1);
      const rows = tx.receivedQuotationLineItem.createMany.mock.calls[0]![0].data;
      expect(rows).toEqual([
        {
          receivedQuotationId: 'rq-1',
          sortOrder: 0,
          name: '石膏ボード張り',
          specification: 't12.5',
          unit: 'm2',
          quantity: 10,
          unitPrice: 1500,
          amount: 15000,
          remarks: null,
          category: 'DIRECT',
          condition: null,
          conversionQuantity: null,
          conversionUnit: null,
          conversionUnitPrice: null,
          conversionBasis: null,
          isReference: false,
          referenceReason: null,
        },
        expect.objectContaining({
          receivedQuotationId: 'rq-1',
          sortOrder: 1,
          name: '軽鉄下地',
          category: 'OVERHEAD',
          conversionQuantity: 2,
          conversionUnit: '箇所',
          conversionUnitPrice: 7500,
          conversionBasis: '1 箇所 5m2',
          isReference: true,
          referenceReason: '数量×単価が金額と合わない',
        }),
      ]);
    });

    it('@requirement unit-price-ledger/REQ-2.1 明細行の無いカードは明細行を書かない', async () => {
      vi.mocked(parseUpload).mockReturnValue([parsed('card-1', {}, { lineItems: [] })]);

      const result = await service.importCards(FILES, ACTOR_ID);

      expect(tx.receivedQuotationLineItem.createMany).not.toHaveBeenCalled();
      expect(result.importedCount).toBe(1);
      expect(auditLogService.createLog.mock.calls[0]![0].after.lineItemCount).toBe(0);
    });
  });

  describe('取引先の照合', () => {
    it('@requirement unit-price-ledger/REQ-2.10 前後の空白を除いた業者名に一致する協力業者が 1 件なら紐づける', async () => {
      tx.tradingPartner.findMany.mockResolvedValue([{ id: 'tp-1' }]);
      vi.mocked(parseUpload).mockReturnValue([parsed('card-1')]);

      await service.importCards(FILES, ACTOR_ID);

      expect(tx.tradingPartner.findMany).toHaveBeenCalledWith({
        where: { name: '山田内装', deletedAt: null, types: { some: { type: 'SUBCONTRACTOR' } } },
        select: { id: true },
        take: 2,
      });
      expect(tx.receivedQuotation.create.mock.calls[0]![0].data.tradingPartnerId).toBe('tp-1');
    });

    it('@requirement unit-price-ledger/REQ-2.11 一致する協力業者が 2 件以上なら紐づけず、業者名だけを残す', async () => {
      tx.tradingPartner.findMany.mockResolvedValue([{ id: 'tp-1' }, { id: 'tp-2' }]);
      vi.mocked(parseUpload).mockReturnValue([parsed('card-1')]);

      await service.importCards(FILES, ACTOR_ID);

      const { data } = tx.receivedQuotation.create.mock.calls[0]![0];
      expect(data.tradingPartnerId).toBeNull();
      expect(data.vendorName).toBe('  山田内装  ');
    });

    it('@requirement unit-price-ledger/REQ-2.11 一致する協力業者が無ければ紐づけない', async () => {
      tx.tradingPartner.findMany.mockResolvedValue([]);
      vi.mocked(parseUpload).mockReturnValue([parsed('card-1')]);

      await service.importCards(FILES, ACTOR_ID);

      expect(tx.receivedQuotation.create.mock.calls[0]![0].data.tradingPartnerId).toBeNull();
    });

    it('@requirement unit-price-ledger/REQ-2.11 業者名が空白だけなら取引先を探さず、紐づけない', async () => {
      vi.mocked(parseUpload).mockReturnValue([parsed('card-1', {}, { vendorName: '   ' })]);

      await service.importCards(FILES, ACTOR_ID);

      expect(tx.tradingPartner.findMany).not.toHaveBeenCalled();
      expect(tx.receivedQuotation.create.mock.calls[0]![0].data.tradingPartnerId).toBeNull();
    });
  });

  describe('読取の確認', () => {
    it('@requirement unit-price-ledger/REQ-2.12 「済」で読取の日時があれば、確認済み・確認者は実行者・日時はカードの日時', async () => {
      const readAt = new Date('2026-10-05T03:00:00.000Z');
      vi.mocked(parseUpload).mockReturnValue([
        parsed('card-1', {}, { readingConfirmed: { confirmed: true, readAt } }),
      ]);

      await service.importCards(FILES, ACTOR_ID);

      expect(tx.receivedQuotation.create.mock.calls[0]![0].data).toMatchObject({
        readingStatus: 'CONFIRMED',
        readingConfirmedById: ACTOR_ID,
        readingConfirmedAt: readAt,
      });
    });

    it('@requirement unit-price-ledger/REQ-2.12 「済」で読取の日時が無ければ、取り込みの日時を確認の日時にする', async () => {
      vi.useFakeTimers();
      const importedAt = new Date('2026-11-16T01:23:45.000Z');
      vi.setSystemTime(importedAt);
      try {
        vi.mocked(parseUpload).mockReturnValue([
          parsed('card-1', {}, { readingConfirmed: { confirmed: true, readAt: null } }),
        ]);

        await service.importCards(FILES, ACTOR_ID);

        expect(tx.receivedQuotation.create.mock.calls[0]![0].data).toMatchObject({
          readingStatus: 'CONFIRMED',
          readingConfirmedById: ACTOR_ID,
          readingConfirmedAt: importedAt,
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('@requirement unit-price-ledger/REQ-2.13 「済」でなければ未確認で、確認者と日時を空にする', async () => {
      vi.mocked(parseUpload).mockReturnValue([
        parsed(
          'card-1',
          {},
          { readingConfirmed: { confirmed: false, readAt: new Date('2026-10-05T03:00:00Z') } }
        ),
      ]);

      await service.importCards(FILES, ACTOR_ID);

      expect(tx.receivedQuotation.create.mock.calls[0]![0].data).toMatchObject({
        readingStatus: 'UNCONFIRMED',
        readingConfirmedById: null,
        readingConfirmedAt: null,
      });
    });

    it('@requirement estimate-request/REQ-46.14 確認済みのカードの受領見積書は、読取の確認の経路を台帳の取り込みにする', async () => {
      vi.mocked(parseUpload).mockReturnValue([
        parsed(
          'card-1',
          {},
          { readingConfirmed: { confirmed: true, readAt: new Date('2026-10-05T03:00:00.000Z') } }
        ),
        parsed('card-2', {}, { readingConfirmed: { confirmed: true, readAt: null } }),
      ]);

      await service.importCards(FILES, ACTOR_ID);

      expect(tx.receivedQuotation.create).toHaveBeenCalledTimes(2);
      for (const call of tx.receivedQuotation.create.mock.calls) {
        expect(call[0].data).toMatchObject({
          readingStatus: 'CONFIRMED',
          readingConfirmationRoute: 'LEDGER_IMPORT',
        });
      }
    });

    it('@requirement estimate-request/REQ-46.14 未確認のカードの受領見積書は、読取の確認の経路を null にする', async () => {
      vi.mocked(parseUpload).mockReturnValue([
        parsed('card-1', {}, { readingConfirmed: { confirmed: false, readAt: null } }),
      ]);

      await service.importCards(FILES, ACTOR_ID);

      expect(tx.receivedQuotation.create).toHaveBeenCalledTimes(1);
      expect(tx.receivedQuotation.create.mock.calls[0]![0].data).toMatchObject({
        readingStatus: 'UNCONFIRMED',
        readingConfirmationRoute: null,
      });
    });
  });

  describe('取り込み済みのカード', () => {
    it('@requirement unit-price-ledger/REQ-2.14 論理削除されていない受領見積書が持つカードの ID は飛ばし、何も書かない', async () => {
      tx.receivedQuotation.findFirst.mockResolvedValue({ id: 'existing-rq' });
      vi.mocked(parseUpload).mockReturnValue([parsed('card-1')]);

      const result = await service.importCards(FILES, ACTOR_ID);

      expect(tx.receivedQuotation.findFirst).toHaveBeenCalledWith({
        where: { ledgerCardId: 'card-1', deletedAt: null },
        select: { id: true },
      });
      expect(tx.receivedQuotation.create).not.toHaveBeenCalled();
      expect(tx.receivedQuotationLineItem.createMany).not.toHaveBeenCalled();
      expect(auditLogService.createLog).not.toHaveBeenCalled();
      expect(result.importedCount).toBe(0);
      expect(result.skipped).toEqual([{ cardId: 'card-1' }]);
      expect(result.failed).toEqual([]);
    });

    it('@requirement unit-price-ledger/REQ-2.14 同時の取り込みで P2002 になり、生きたカードがあれば取り込み済みとして飛ばす', async () => {
      tx.receivedQuotation.create.mockRejectedValue(knownError('P2002'));
      prisma.receivedQuotation.findFirst.mockResolvedValue({ id: 'rq-other' });
      vi.mocked(parseUpload).mockReturnValue([parsed('card-1')]);

      const result = await service.importCards(FILES, ACTOR_ID);

      // 確かめ直しはトランザクションの外の client で行う
      expect(prisma.receivedQuotation.findFirst).toHaveBeenCalledWith({
        where: { ledgerCardId: 'card-1', deletedAt: null },
        select: { id: true },
      });
      expect(result.skipped).toEqual([{ cardId: 'card-1' }]);
      expect(result.failed).toEqual([]);
      expect(result.importedCount).toBe(0);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('@requirement unit-price-ledger/REQ-2.16 P2002 でも生きたカードが無ければ、そのカードの失敗にする', async () => {
      tx.receivedQuotation.create.mockRejectedValue(knownError('P2002'));
      prisma.receivedQuotation.findFirst.mockResolvedValue(null);
      vi.mocked(parseUpload).mockReturnValue([parsed('card-1')]);

      const result = await service.importCards(FILES, ACTOR_ID);

      expect(result.skipped).toEqual([]);
      expect(result.failed).toEqual([
        { fileName: 'card-1.json', reason: LEDGER_IMPORT_FAILURE_REASONS.REGISTRATION_FAILED },
      ]);
      expect(logger.warn).toHaveBeenCalledWith(
        { errorName: 'PrismaClientKnownRequestError', errorCode: 'P2002' },
        expect.any(String)
      );
    });
  });

  describe('登録の失敗', () => {
    it('@requirement unit-price-ledger/REQ-2.16 桁を超える値などの誤りはそのカードだけの失敗にし、次のカードへ進む', async () => {
      tx.receivedQuotation.create
        .mockRejectedValueOnce(knownError('P2020'))
        .mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
          quotationRowFrom('rq-2', data)
        );
      vi.mocked(parseUpload).mockReturnValue([parsed('card-1'), parsed('card-2')]);

      const result = await service.importCards(FILES, ACTOR_ID);

      expect(result.failed).toEqual([
        { fileName: 'card-1.json', reason: LEDGER_IMPORT_FAILURE_REASONS.REGISTRATION_FAILED },
      ]);
      expect(result.importedCount).toBe(1);
      expect(prisma.receivedQuotation.findFirst).not.toHaveBeenCalled();
    });

    it('@requirement unit-price-ledger/REQ-2.16 失敗の警告のログには誤りの名前と符号だけを出し、文言やカードの中身を出さない', async () => {
      tx.receivedQuotation.create.mockRejectedValue(knownError('P2000'));
      vi.mocked(parseUpload).mockReturnValue([parsed('card-1')]);

      await service.importCards(FILES, ACTOR_ID);

      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [payload, message] = vi.mocked(logger.warn).mock.calls[0]! as unknown as [
        unknown,
        string,
      ];
      expect(payload).toEqual({ errorName: 'PrismaClientKnownRequestError', errorCode: 'P2000' });
      const logged = JSON.stringify([payload, message]);
      expect(logged).not.toContain('山田内装');
      expect(logged).not.toContain('card-1');
    });

    it('@requirement unit-price-ledger/REQ-2.16 Prisma 以外の Error は符号を null としてログに出す', async () => {
      auditLogService.createLog.mockRejectedValue(new TypeError('secret content'));
      vi.mocked(parseUpload).mockReturnValue([parsed('card-1')]);

      const result = await service.importCards(FILES, ACTOR_ID);

      expect(result.failed).toHaveLength(1);
      expect(result.importedCount).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(
        { errorName: 'TypeError', errorCode: null },
        expect.any(String)
      );
    });

    it('@requirement unit-price-ledger/REQ-2.16 Error でない値が投げられたら、その型の名前をログに出す', async () => {
      tx.receivedQuotationLineItem.createMany.mockRejectedValue('boom');
      vi.mocked(parseUpload).mockReturnValue([parsed('card-1')]);

      const result = await service.importCards(FILES, ACTOR_ID);

      expect(result.failed).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(
        { errorName: 'string', errorCode: null },
        expect.any(String)
      );
    });
  });

  describe('基盤の誤り', () => {
    const infrastructureErrors: Array<[string, () => Error]> = [
      ['P1001（DB へつながらない）', () => knownError('P1001')],
      ['P1008（時間切れ）', () => knownError('P1008')],
      ['初期化の失敗', () => new Prisma.PrismaClientInitializationError('cannot connect', 'test')],
      ['エンジンの異常終了', () => new Prisma.PrismaClientRustPanicError('panic', 'test')],
    ];

    it.each(infrastructureErrors)(
      '@requirement unit-price-ledger/REQ-2.16 %s はカードの失敗にせず、取り込みの要求ごと失敗させる',
      async (_label, makeError) => {
        const error = makeError();
        prisma.$transaction.mockRejectedValue(error);
        vi.mocked(parseUpload).mockReturnValue([parsed('card-1'), parsed('card-2')]);

        await expect(service.importCards(FILES, ACTOR_ID)).rejects.toBe(error);

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.receivedQuotation.findFirst).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalled();
      }
    );
  });

  describe('結果のまとめとログ', () => {
    it('@requirement unit-price-ledger/REQ-2.15 登録・飛ばし・失敗・切り詰め・参考の印をまとめ、件数だけをログに出す', async () => {
      // card-skip は取り込み済み
      tx.receivedQuotation.findFirst.mockImplementation(
        async ({ where }: { where: { ledgerCardId: string } }) =>
          where.ledgerCardId === 'card-skip' ? { id: 'existing' } : null
      );
      vi.mocked(parseUpload).mockReturnValue([
        parsed('card-plain'),
        parsed('card-trunc', { truncatedFields: ['name', 'overallConditions'] }),
        parsed('card-ref', { referenceReasons: ['数量×単価が金額と合わない'] }),
        parsed('card-skip', {
          truncatedFields: ['name'],
          referenceReasons: ['飛ばすので数えない'],
        }),
        { kind: 'failed', fileName: 'bad.json', reason: '見積カードの形ではありません' },
      ]);

      const result = await service.importCards(FILES, ACTOR_ID);

      expect(result).toEqual({
        importedCount: 3,
        skipped: [{ cardId: 'card-skip' }],
        failed: [{ fileName: 'bad.json', reason: '見積カードの形ではありません' }],
        truncated: [{ cardId: 'card-trunc', fields: ['name', 'overallConditions'] }],
        referenceMarkedCount: 1,
      });

      expect(logger.info).toHaveBeenCalledTimes(1);
      const [payload] = vi.mocked(logger.info).mock.calls[0]! as unknown as [unknown, string];
      expect(payload).toEqual({
        importedCount: 3,
        skippedCount: 1,
        failedCount: 1,
        truncatedCount: 1,
        referenceMarkedCount: 1,
      });
      const logged = JSON.stringify(vi.mocked(logger.info).mock.calls[0]);
      expect(logged).not.toContain('card-');
      expect(logged).not.toContain('山田内装');
    });

    it('@requirement unit-price-ledger/REQ-3.6 参考の印のあるカードも取り込みを止めずに登録する', async () => {
      vi.mocked(parseUpload).mockReturnValue([
        parsed('card-ref', { referenceReasons: ['合計が合わない'] }),
      ]);

      const result = await service.importCards(FILES, ACTOR_ID);

      expect(result.importedCount).toBe(1);
      expect(result.referenceMarkedCount).toBe(1);
      expect(tx.receivedQuotation.create).toHaveBeenCalledTimes(1);
    });

    it('@requirement unit-price-ledger/REQ-2.9 切り詰めの欄は複製して結果に入れる', async () => {
      const truncatedFields = ['name'];
      vi.mocked(parseUpload).mockReturnValue([parsed('card-1', { truncatedFields })]);

      const result = await service.importCards(FILES, ACTOR_ID);

      expect(result.truncated).toEqual([{ cardId: 'card-1', fields: ['name'] }]);
      expect(result.truncated[0]!.fields).not.toBe(truncatedFields);
    });
  });

  describe('監査ログ', () => {
    it('@requirement unit-price-ledger/REQ-2.1 RECEIVED_QUOTATION_CREATED を source ledger_import で書き、金額と原本のパスを入れない', async () => {
      vi.mocked(parseUpload).mockReturnValue([parsed('card-1')]);

      await service.importCards(FILES, ACTOR_ID);

      expect(auditLogService.createLog).toHaveBeenCalledTimes(1);
      const [log, client] = auditLogService.createLog.mock.calls[0]!;
      expect(client).toBe(tx);
      expect(log).toEqual({
        action: 'RECEIVED_QUOTATION_CREATED',
        actorId: ACTOR_ID,
        targetType: 'ReceivedQuotation',
        targetId: 'rq-1',
        before: null,
        after: {
          estimateRequestId: null,
          name: '山田内装 見積 2026-10-01',
          submittedAt: '2026-10-01T00:00:00.000Z',
          fileName: null,
          lineItemCount: 1,
          vendorName: '  山田内装  ',
          quoteNumber: 'Q-123',
          overallConditions: '足場は別途',
          siteLocation: 'A市',
          constructionKind: 'RENOVATION',
          useType: '学校',
          workConditions: '夜間',
          distanceKm: 12.5,
          adoption: 'ADOPTED',
          readingStatus: 'UNCONFIRMED',
          readingConfirmationRoute: null,
          quoteDiscriminator: 'disc-1',
          ledgerCardId: 'card-1',
          ledgerProjectName: 'A小学校改修',
        },
        metadata: { source: 'ledger_import' },
      });
      expect(log.after).not.toHaveProperty('constructionPrice');
      expect(log.after).not.toHaveProperty('confirmedAmount');
      expect(log.after).not.toHaveProperty('ledgerSourcePath');
      expect(log.after).not.toHaveProperty('lineItems');
      const serialized = JSON.stringify(log);
      expect(serialized).not.toContain('987654');
      expect(serialized).not.toContain('876543');
      expect(serialized).not.toContain('15000');
      expect(serialized).not.toContain('/secret/source/path');
    });

    it('@requirement unit-price-ledger/REQ-2.1 距離が空なら監査ログの距離も null にする', async () => {
      const base = quotationInput();
      vi.mocked(parseUpload).mockReturnValue([
        parsed('card-1', {}, { ledgerFields: { ...base.ledgerFields, distanceKm: null } }),
      ]);

      await service.importCards(FILES, ACTOR_ID);

      expect(auditLogService.createLog.mock.calls[0]![0].after.distanceKm).toBeNull();
    });
  });
});
