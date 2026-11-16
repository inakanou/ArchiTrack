/**
 * @fileoverview 台帳の Excel の書き出し（LedgerExportService）の単体試験（unit-price-ledger タスク2.10）
 *
 * Prisma と出力の記録（ExportAuditService.record）を模して、0 件の拒否、作る前の記録と記録の失敗の拒否、
 * 3 つのシートの行と列、合計（別途を除く）、ファイル名の日本時間の日付を確かめる。
 * シートの中身は実際に作った xlsx を SheetJS で読み戻して確かめる。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { Prisma, type PrismaClient } from '../../../../generated/prisma/client.js';
import { ledgerFilterSchema } from '../../../../schemas/unit-price-ledger.schema.js';
import {
  buildLedgerWhere,
  LEDGER_ORDER_BY,
} from '../../../../services/unit-price-ledger/ledger-query.service.js';
import {
  LedgerExportService,
  LEDGER_EXPORT_EMPTY_MESSAGE,
  LEDGER_EXPORT_RECORD_FAILED_MESSAGE,
  LEDGER_EXPORT_SHEET_NAMES,
  writeLedgerWorkbook,
  type LedgerExportSheet,
} from '../../../../services/unit-price-ledger/ledger-export.service.js';
import { ApiError } from '../../../../errors/apiError.js';
import type { ExportAuditService } from '../../../../services/export-audit.service.js';

type AuditRecorder = Pick<ExportAuditService, 'record'>;

const ACTOR_ID = 'actor-1';
const CTX = { ipAddress: '192.0.2.1', userAgent: 'vitest' };

const QUOTATION_HEADER = [
  '業者名',
  '見積日',
  '案件名',
  '見積の合計（別途を除く）',
  '採否',
  '読取の確認',
  '参考の行',
];

const LINE_HEADER = [
  '業者名',
  '見積日',
  '案件名',
  '区分',
  '名称',
  '規格',
  '数量',
  '単位',
  '単価',
  '金額',
  '条件',
  '換算の数量',
  '換算の単位',
  '換算の単価',
  '換算の根拠',
  '参考の印',
  '参考の理由',
  '分類キー',
];

type LineRow = {
  category: string;
  name: string;
  specification: string | null;
  quantity: Prisma.Decimal | null;
  unit: string;
  unitPrice: Prisma.Decimal | null;
  amount: Prisma.Decimal | null;
  condition: string | null;
  conversionQuantity: Prisma.Decimal | null;
  conversionUnit: string | null;
  conversionUnitPrice: Prisma.Decimal | null;
  conversionBasis: string | null;
  isReference: boolean;
  referenceReason: string | null;
  classificationKey: string | null;
};

const line = (overrides: Partial<LineRow> = {}): LineRow => ({
  category: 'DIRECT',
  name: '石膏ボード張り',
  specification: 't12.5',
  quantity: new Prisma.Decimal('10.5'),
  unit: 'm2',
  unitPrice: new Prisma.Decimal('1500'),
  amount: new Prisma.Decimal('15750'),
  condition: null,
  conversionQuantity: null,
  conversionUnit: null,
  conversionUnitPrice: null,
  conversionBasis: null,
  isReference: false,
  referenceReason: null,
  classificationKey: null,
  ...overrides,
});

const quotationRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'rq-1',
  vendorName: '山田内装',
  submittedAt: new Date('2026-10-01T00:00:00.000Z'),
  ledgerProjectName: 'A小学校改修（台帳）',
  adoption: 'ADOPTED',
  readingStatus: 'CONFIRMED',
  project: null as { name: string } | null,
  lineItems: [line()],
  ...overrides,
});

/** xlsx のファイルを読み戻し、シートの名前と行の配列にする */
const readWorkbook = (buffer: Buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheets: Record<string, unknown[][]> = {};
  for (const name of workbook.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name]!, {
      header: 1,
      defval: null,
      blankrows: false,
    });
  }
  return { names: workbook.SheetNames, sheets, workbook };
};

describe('LedgerExportService', () => {
  let prisma: { receivedQuotation: { findMany: ReturnType<typeof vi.fn> } };
  let exportAuditService: { record: ReturnType<typeof vi.fn> };
  let now: () => Date;
  const filter = ledgerFilterSchema.parse({});

  const createService = (writeWorkbook?: (sheets: LedgerExportSheet[]) => Buffer) =>
    new LedgerExportService({
      prisma: prisma as unknown as PrismaClient,
      exportAuditService: exportAuditService as unknown as AuditRecorder,
      now,
      ...(writeWorkbook ? { writeWorkbook } : {}),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = { receivedQuotation: { findMany: vi.fn().mockResolvedValue([quotationRow()]) } };
    exportAuditService = {
      record: vi.fn().mockResolvedValue({ ok: true, value: { recordId: 'audit-1' } }),
    };
    now = () => new Date('2026-11-16T03:00:00.000Z');
  });

  describe('対象の見積の取得', () => {
    it('@requirement unit-price-ledger/REQ-6.1 一覧と同じ条件と並びで、ページに分けずに見積を読む', async () => {
      const keywordFilter = ledgerFilterSchema.parse({ keyword: 'ボード' });

      await createService().export(keywordFilter, ACTOR_ID, CTX);

      expect(prisma.receivedQuotation.findMany).toHaveBeenCalledTimes(1);
      const args = prisma.receivedQuotation.findMany.mock.calls[0]![0];
      expect(args.where).toEqual(buildLedgerWhere(keywordFilter));
      expect(args.orderBy).toEqual(LEDGER_ORDER_BY);
      expect(args).not.toHaveProperty('skip');
      expect(args).not.toHaveProperty('take');
      expect(args.select.lineItems.orderBy).toEqual({ sortOrder: 'asc' });
    });
  });

  describe('0 件の拒否', () => {
    it('@requirement unit-price-ledger/REQ-6.5 結果が 0 件なら 400 LEDGER_EXPORT_EMPTY で拒み、記録もファイルも作らない', async () => {
      prisma.receivedQuotation.findMany.mockResolvedValue([]);
      const writeWorkbook = vi.fn(() => Buffer.from('x'));

      const error = await createService(writeWorkbook)
        .export(filter, ACTOR_ID, CTX)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        statusCode: 400,
        code: 'LEDGER_EXPORT_EMPTY',
        message: LEDGER_EXPORT_EMPTY_MESSAGE,
      });
      expect(LEDGER_EXPORT_EMPTY_MESSAGE).toBe('条件に合う見積はありません');
      expect(exportAuditService.record).not.toHaveBeenCalled();
      expect(writeWorkbook).not.toHaveBeenCalled();
    });
  });

  describe('出力の記録', () => {
    it('@requirement unit-price-ledger/REQ-6.3 ファイルを作る前に、種別・案件なし・見積の ID と数で記録する', async () => {
      prisma.receivedQuotation.findMany.mockResolvedValue([
        quotationRow({ id: 'rq-1' }),
        quotationRow({ id: 'rq-2', lineItems: [] }),
      ]);
      const order: string[] = [];
      exportAuditService.record.mockImplementation(async () => {
        order.push('record');
        return { ok: true, value: { recordId: 'audit-1' } };
      });
      const writeWorkbook = vi.fn((sheets: LedgerExportSheet[]) => {
        order.push('workbook');
        return writeLedgerWorkbook(sheets);
      });

      const result = await createService(writeWorkbook).export(filter, ACTOR_ID, CTX);

      expect(order).toEqual(['record', 'workbook']);
      expect(exportAuditService.record).toHaveBeenCalledWith(
        ACTOR_ID,
        {
          kind: 'unit_price_ledger_xlsx',
          projectId: null,
          targetIds: ['rq-1', 'rq-2'],
          itemCount: 2,
        },
        CTX
      );
      expect(result.quotationCount).toBe(2);
    });

    it('@requirement unit-price-ledger/REQ-6.4 記録に失敗したら 500 EXPORT_RECORD_FAILED で拒み、ファイルを作らない', async () => {
      exportAuditService.record.mockResolvedValue({ ok: false, error: { type: 'RECORD_FAILED' } });
      const writeWorkbook = vi.fn(() => Buffer.from('x'));

      const error = await createService(writeWorkbook)
        .export(filter, ACTOR_ID, CTX)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        statusCode: 500,
        code: 'EXPORT_RECORD_FAILED',
        message: '書き出しを記録できなかったため、出力を中止しました',
      });
      expect(LEDGER_EXPORT_RECORD_FAILED_MESSAGE).toBe(
        '書き出しを記録できなかったため、出力を中止しました'
      );
      expect(writeWorkbook).not.toHaveBeenCalled();
    });
  });

  describe('シートの中身', () => {
    it('@requirement unit-price-ledger/REQ-6.1 見積・明細行・要確認の 3 つのシートをこの順で作る', async () => {
      const result = await createService().export(filter, ACTOR_ID, CTX);

      const { names } = readWorkbook(result.buffer);
      expect(names).toEqual([
        LEDGER_EXPORT_SHEET_NAMES.quotations,
        LEDGER_EXPORT_SHEET_NAMES.lineItems,
        LEDGER_EXPORT_SHEET_NAMES.needsReview,
      ]);
      expect(names).toEqual(['見積', '明細行', '要確認']);
    });

    it('@requirement unit-price-ledger/REQ-6.2 見積・明細行・要確認の行を一覧と 6.2 の列で書く', async () => {
      prisma.receivedQuotation.findMany.mockResolvedValue([
        quotationRow({
          id: 'rq-1',
          project: { name: '案件B' },
          ledgerProjectName: '使わない台帳の案件名',
          adoption: 'REJECTED',
          readingStatus: 'UNCONFIRMED',
          lineItems: [
            line(),
            line({
              category: 'OVERHEAD',
              name: '諸経費',
              specification: null,
              quantity: new Prisma.Decimal('1'),
              unit: '式',
              unitPrice: null,
              amount: new Prisma.Decimal('2000'),
              condition: '=SUM(A1:A2)',
              conversionQuantity: new Prisma.Decimal('3'),
              conversionUnit: '箇所',
              conversionUnitPrice: new Prisma.Decimal('666.67'),
              conversionBasis: '3 箇所で割る',
              isReference: true,
              referenceReason: '数量×単価が金額と合わない',
              classificationKey: 'K-01',
            }),
          ],
        }),
        quotationRow({
          id: 'rq-2',
          vendorName: '佐藤設備',
          submittedAt: new Date('2026-09-30T00:00:00.000Z'),
          adoption: 'UNKNOWN',
          lineItems: [],
        }),
      ]);

      const result = await createService().export(filter, ACTOR_ID, CTX);
      const { sheets, workbook } = readWorkbook(result.buffer);

      expect(sheets['見積']).toEqual([
        QUOTATION_HEADER,
        ['山田内装', '2026-10-01', '案件B', 17750, '不採用', '未確認', 'あり'],
        ['佐藤設備', '2026-09-30', 'A小学校改修（台帳）', null, '不明', '確認済み', 'なし'],
      ]);

      const firstLine = [
        '山田内装',
        '2026-10-01',
        '案件B',
        '直接工事',
        '石膏ボード張り',
        't12.5',
        10.5,
        'm2',
        1500,
        15750,
        null,
        null,
        null,
        null,
        null,
        'なし',
        null,
        null,
      ];
      const referenceLine = [
        '山田内装',
        '2026-10-01',
        '案件B',
        '諸経費',
        '諸経費',
        null,
        1,
        '式',
        null,
        2000,
        '=SUM(A1:A2)',
        3,
        '箇所',
        666.67,
        '3 箇所で割る',
        'あり',
        '数量×単価が金額と合わない',
        'K-01',
      ];
      expect(sheets['明細行']).toEqual([LINE_HEADER, firstLine, referenceLine]);
      expect(sheets['要確認']).toEqual([LINE_HEADER, referenceLine]);

      // 「=」で始まる文字の欄は式にならない
      const conditionCell = workbook.Sheets['明細行']!['K3'];
      expect(conditionCell?.t).toBe('s');
      expect(conditionCell?.f).toBeUndefined();
    });

    it('@requirement unit-price-ledger/REQ-6.2 参考の行が無ければ要確認のシートは見出しだけにする', async () => {
      const result = await createService().export(filter, ACTOR_ID, CTX);

      const { sheets } = readWorkbook(result.buffer);
      expect(sheets['要確認']).toEqual([LINE_HEADER]);
      expect(sheets['明細行']).toHaveLength(2);
    });

    it('@requirement unit-price-ledger/REQ-6.1 見積の合計は別途と金額の無い行を除いて足す', async () => {
      prisma.receivedQuotation.findMany.mockResolvedValue([
        quotationRow({
          lineItems: [
            line({ amount: new Prisma.Decimal('0.1') }),
            line({ amount: new Prisma.Decimal('0.2') }),
            line({ category: 'EXCLUDED', amount: new Prisma.Decimal('99999') }),
            line({ category: 'DISCOUNT', amount: new Prisma.Decimal('-0.05') }),
            line({ amount: null }),
          ],
        }),
        quotationRow({
          id: 'rq-only-excluded',
          lineItems: [
            line({ category: 'EXCLUDED', amount: new Prisma.Decimal('500') }),
            line({ amount: null }),
          ],
        }),
      ]);
      const writeWorkbook = vi.fn((_sheets: LedgerExportSheet[]) => Buffer.from('xlsx'));

      await createService(writeWorkbook).export(filter, ACTOR_ID, CTX);

      const sheets = writeWorkbook.mock.calls[0]![0];
      const quotationSheet = sheets.find((sheet) => sheet.name === '見積')!;
      // Decimal で足すため 0.1 + 0.2 - 0.05 の丸めの誤差が出ない
      expect(quotationSheet.rows[1]![3]).toBe(0.25);
      // 足す行が無ければ空
      expect(quotationSheet.rows[2]![3]).toBeNull();
      // 区分の表示名
      const lineSheet = sheets.find((sheet) => sheet.name === '明細行')!;
      expect(lineSheet.rows.slice(1).map((row) => row[3])).toEqual([
        '直接工事',
        '直接工事',
        '別途',
        '値引き',
        '直接工事',
        '別途',
        '直接工事',
      ]);
    });

    it('@requirement unit-price-ledger/REQ-6.2 区分の表示名をすべて書き分ける', async () => {
      prisma.receivedQuotation.findMany.mockResolvedValue([
        quotationRow({
          lineItems: ['TRAVEL', 'WASTE', 'LEGAL_WELFARE'].map((category) => line({ category })),
        }),
      ]);
      const writeWorkbook = vi.fn((_sheets: LedgerExportSheet[]) => Buffer.from('xlsx'));

      await createService(writeWorkbook).export(filter, ACTOR_ID, CTX);

      const lineSheet = writeWorkbook.mock.calls[0]![0][1]!;
      expect(lineSheet.rows.slice(1).map((row) => row[3])).toEqual([
        '交通費',
        '産廃',
        '法定福利費',
      ]);
    });
  });

  describe('ファイル名と結果', () => {
    it('@requirement unit-price-ledger/REQ-6.1 ファイル名は日本時間の日付の「単価台帳_YYYYMMDD.xlsx」にする', async () => {
      // UTC では 11/16 15:30 だが、日本時間では 11/17 0:30
      now = () => new Date('2026-11-16T15:30:00.000Z');

      const result = await createService().export(filter, ACTOR_ID, CTX);

      expect(result.fileName).toBe('単価台帳_20261117.xlsx');
      expect(result.quotationCount).toBe(1);
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
    });

    it('@requirement unit-price-ledger/REQ-6.1 日本時間の日付が UTC と同じ日ならその日付にする', async () => {
      now = () => new Date('2026-11-16T14:59:59.000Z');

      const result = await createService().export(filter, ACTOR_ID, CTX);

      expect(result.fileName).toBe('単価台帳_20261116.xlsx');
    });

    it('@requirement unit-price-ledger/REQ-6.1 差し替えた writeWorkbook の結果をそのまま返す', async () => {
      const buffer = Buffer.from('custom');
      const writeWorkbook = vi.fn(() => buffer);

      const result = await createService(writeWorkbook).export(filter, ACTOR_ID, CTX);

      expect(result.buffer).toBe(buffer);
      expect(writeWorkbook).toHaveBeenCalledTimes(1);
    });

    it('@requirement unit-price-ledger/REQ-6.1 now を渡さなければ今の時刻でファイル名を作る', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-31T16:00:00.000Z'));
      try {
        const service = new LedgerExportService({
          prisma: prisma as unknown as PrismaClient,
          exportAuditService: exportAuditService as unknown as AuditRecorder,
        });

        const result = await service.export(filter, ACTOR_ID, CTX);

        expect(result.fileName).toBe('単価台帳_20260401.xlsx');
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
