/**
 * @fileoverview 台帳の Excel の書き出し（LedgerExportService）の統合試験（unit-price-ledger タスク2.10）
 *
 * テスト用の実データベースで、絞り込みの結果を 3 つのシートの Excel にし、作る前に出力を記録することを確かめる。
 * 作ったファイルは SheetJS で読み直し、シートの名前・見出しの列・行の値を確かめる。
 *
 * 確かめること:
 * - 1.3：論理削除された受領見積書と、論理削除された見積依頼の受領見積書を書き出しに含めない
 * - 6.1：絞り込みの結果を「見積」「明細行」「要確認」の 3 つのシートにする（絞り込みは一覧と同じ）
 * - 6.2：明細行のシートに業者名・見積日・案件名と、区分・名称・規格・数量・単位・単価・金額・条件・換算・
 *   参考の印と理由・分類キーを出す
 * - 6.3：出力の前に出力の記録（DATA_EXPORTED、種別 unit_price_ledger_xlsx、案件なし、件数は見積の数）を残す
 * - 6.4：記録に失敗したらファイルを作らず、500 `EXPORT_RECORD_FAILED` と
 *   「書き出しを記録できなかったため、出力を中止しました」で拒む
 * - 6.5：結果が 0 件の要求は 400 で拒み、記録もファイルも作らない
 *
 * 共有の試験 DB には他の試験の受領見積書も残りうるため、試験ごとの印（PREFIX）を文字の絞り込みに入れて
 * 対象を試験の見積に限る。
 *
 * Design: Components > LedgerExportService、Error Handling
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as XLSX from 'xlsx';
import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import getPrismaClient from '../../db.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { ExportAuditService } from '../../services/export-audit.service.js';
import {
  LedgerExportService,
  writeLedgerWorkbook,
  type LedgerExportServiceDependencies,
} from '../../services/unit-price-ledger/ledger-export.service.js';
import { ledgerFilterSchema, type LedgerFilter } from '../../schemas/unit-price-ledger.schema.js';
import { ApiError } from '../../errors/apiError.js';
import { Err } from '../../types/result.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-upl210-export';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PREFIX = `${MARK}-${RUN}`;
const CTX = { ipAddress: '203.0.113.10', userAgent: 'ledger-export-test' };
/** 2026-11-16 09:30（日本時間）。ファイル名の日付は日本時間で付ける */
const NOW = new Date('2026-11-16T00:30:00.000Z');

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

type LineSeed = Omit<Prisma.ReceivedQuotationLineItemCreateManyReceivedQuotationInput, 'sortOrder'>;
type Cell = string | number;

/** 作ったファイルを読み直し、シートごとに行の配列にする（空の欄は ''） */
const readWorkbook = (
  buffer: Buffer
): { sheetNames: string[]; sheets: Record<string, Cell[][]> } => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheets: Record<string, Cell[][]> = {};
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) {
      throw new Error(`シート ${name} が読めない`);
    }
    sheets[name] = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: '' });
  }
  return { sheetNames: workbook.SheetNames, sheets };
};

describe('台帳の Excel の書き出し（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let userId: string;
  let projectId: string;
  let liveRequestId: string;
  let deletedRequestId: string;
  let tradingPartnerId: string;
  let realExportAudit: ExportAuditService;

  const ids = { ledgerCard: '', projectOnly: '', requested: '' };

  const filterOf = (input: Record<string, unknown> = {}): LedgerFilter =>
    ledgerFilterSchema.parse({ keyword: PREFIX, ...input });

  /** 記録と書き込みを見張れる依存で書き出しのサービスを作る */
  const buildService = (overrides: Partial<LedgerExportServiceDependencies> = {}) => {
    const record = vi.fn(realExportAudit.record.bind(realExportAudit));
    const writeWorkbook = vi.fn(writeLedgerWorkbook);
    const service = new LedgerExportService({
      prisma,
      exportAuditService: { record },
      writeWorkbook,
      now: () => NOW,
      ...overrides,
    });
    return { service, record, writeWorkbook };
  };

  const exportLogsOf = (actorId: string) =>
    prisma.auditLog.findMany({
      where: { actorId, action: 'DATA_EXPORTED' },
      orderBy: { createdAt: 'asc' },
    });

  const createQuotation = async (
    data: Omit<Prisma.ReceivedQuotationUncheckedCreateInput, 'lineItems'>,
    lines: LineSeed[] = []
  ): Promise<string> => {
    const created = await prisma.receivedQuotation.create({
      data: {
        ...data,
        lineItems: { createMany: { data: lines.map((line, i) => ({ ...line, sortOrder: i })) } },
      },
      select: { id: true },
    });
    return created.id;
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    realExportAudit = new ExportAuditService({
      auditLogService: new AuditLogService({ prisma }),
      scopeService: {
        evaluateProjectAccess: () => Promise.reject(new Error('案件なしの記録は範囲を判定しない')),
      },
    });

    const user = await createTestUser(prisma, {
      email: `${PREFIX}-admin@example.com`,
      displayName: `${PREFIX}-admin`,
      passwordHash: 'not-used',
    });
    userId = user.id;
    const partner = await prisma.tradingPartner.create({
      data: {
        name: `${PREFIX}-partner`,
        nameKana: 'ダイチョウショシュツ',
        address: '東京都千代田区1-1-1',
        types: { create: [{ type: 'SUBCONTRACTOR' }] },
      },
    });
    tradingPartnerId = partner.id;
    const project = await prisma.project.create({
      data: { name: `${PREFIX}-本案件Y`, salesPersonId: userId, createdById: userId },
      select: { id: true },
    });
    projectId = project.id;
    liveRequestId = (
      await prisma.estimateRequest.create({
        data: { projectId, tradingPartnerId, name: `${PREFIX}-live-request` },
        select: { id: true },
      })
    ).id;
    deletedRequestId = (
      await prisma.estimateRequest.create({
        data: {
          projectId,
          tradingPartnerId,
          name: `${PREFIX}-deleted-request`,
          deletedAt: new Date(),
        },
        select: { id: true },
      })
    ).id;

    // 案件の無い受領見積書・採用・確認済み・2026-03-10
    ids.ledgerCard = await createQuotation(
      {
        vendorName: `${PREFIX}-業者A`,
        name: `${PREFIX}-業者A_2026-03-10`,
        submittedAt: new Date('2026-03-10'),
        constructionKind: 'RENOVATION',
        adoption: 'ADOPTED',
        readingStatus: 'CONFIRMED',
        readingConfirmedById: userId,
        readingConfirmedAt: new Date('2026-03-11T01:00:00Z'),
        ledgerCardId: `${PREFIX}-card-1`,
        ledgerProjectName: `${PREFIX}-台帳案件X`,
      },
      [
        {
          name: '軽量鉄骨天井下地',
          specification: '@300',
          unit: '㎡',
          quantity: 100,
          unitPrice: 10,
          amount: 1000,
          category: 'DIRECT',
          condition: '1階',
          conversionQuantity: 2,
          conversionUnit: '箇所',
          conversionUnitPrice: 500,
          conversionBasis: '1箇所あたり',
          classificationKey: 'K-001',
        },
        { name: '別途の足場', amount: 500, category: 'EXCLUDED' },
        { name: '=1+1', specification: '@SUM(A1)', amount: 100, category: 'OVERHEAD' },
      ]
    );
    // 案件の受領見積書・不採用・未確認・2026-05-01・参考の行
    ids.projectOnly = await createQuotation(
      {
        projectId,
        vendorName: `${PREFIX}-業者B`,
        name: `${PREFIX}-業者B見積`,
        submittedAt: new Date('2026-05-01'),
        adoption: 'REJECTED',
        createdAt: new Date('2026-05-02T00:00:00Z'),
      },
      [
        {
          name: 'ボード張り',
          quantity: 10.5,
          unit: '㎡',
          unitPrice: 190.5,
          amount: 2000.25,
          category: 'DIRECT',
          isReference: true,
          referenceReason: '金額が数量×単価と合わない',
        },
        { name: '産廃処分', amount: 300, category: 'WASTE' },
      ]
    );
    // 見積依頼の受領見積書・2026-05-01（projectOnly より後に登録）
    ids.requested = await createQuotation(
      {
        estimateRequestId: liveRequestId,
        projectId,
        vendorName: `${PREFIX}-業者C`,
        name: `${PREFIX}-業者C見積`,
        submittedAt: new Date('2026-05-01'),
        createdAt: new Date('2026-05-03T00:00:00Z'),
      },
      [{ name: '値引き', amount: -100, category: 'DISCOUNT' }]
    );
    // 論理削除された受領見積書と、論理削除された見積依頼の受領見積書（書き出しに出ない）
    await createQuotation(
      {
        vendorName: `${PREFIX}-削除済み業者`,
        name: `${PREFIX}-削除済み`,
        submittedAt: new Date('2026-06-01'),
        deletedAt: new Date(),
      },
      [{ name: '削除済みの行', amount: 1, category: 'DIRECT' }]
    );
    await createQuotation(
      {
        estimateRequestId: deletedRequestId,
        projectId,
        vendorName: `${PREFIX}-削除済み依頼の業者`,
        name: `${PREFIX}-削除済み依頼の見積`,
        submittedAt: new Date('2026-06-02'),
      },
      [{ name: '削除済み依頼の行', amount: 1, category: 'DIRECT' }]
    );
  });

  afterAll(async () => {
    await deleteAuditLogsWithArchivePermission(prisma, { actorId: userId });
    await prisma.receivedQuotation.deleteMany({
      where: { OR: [{ vendorName: { startsWith: MARK } }, { projectId }] },
    });
    await prisma.estimateRequest.deleteMany({
      where: { id: { in: [liveRequestId, deletedRequestId] } },
    });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.tradingPartner.deleteMany({ where: { id: tradingPartnerId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  describe('3 つのシートと列（1.3・6.1・6.2）', () => {
    /**
     * @requirement unit-price-ledger/REQ-6.1
     * @requirement unit-price-ledger/REQ-1.3
     */
    it('絞り込みの結果を「見積」「明細行」「要確認」の 3 つのシートにし、論理削除された見積を含めない', async () => {
      const { service } = buildService();

      const result = await service.export(filterOf(), userId, CTX);
      const { sheetNames, sheets } = readWorkbook(result.buffer);

      expect(sheetNames).toEqual(['見積', '明細行', '要確認']);
      expect(result.quotationCount).toBe(3);
      expect(result.fileName).toBe('単価台帳_20261116.xlsx');

      // 見積のシート：一覧と同じ列（4.1）と並び（見積日の新しい順、同じ日は登録の新しい順）
      expect(sheets['見積']).toEqual([
        [
          '業者名',
          '見積日',
          '案件名',
          '見積の合計（別途を除く）',
          '採否',
          '読取の確認',
          '参考の行',
        ],
        [`${PREFIX}-業者C`, '2026-05-01', `${PREFIX}-本案件Y`, -100, '不明', '未確認', 'なし'],
        [`${PREFIX}-業者B`, '2026-05-01', `${PREFIX}-本案件Y`, 2300.25, '不採用', '未確認', 'あり'],
        [`${PREFIX}-業者A`, '2026-03-10', `${PREFIX}-台帳案件X`, 1100, '採用', '確認済み', 'なし'],
      ]);
      const allText = JSON.stringify(sheets);
      expect(allText).not.toContain('削除済み');
    });

    /**
     * @requirement unit-price-ledger/REQ-6.2
     */
    it('明細行のシートに、見積の業者名・見積日・案件名と明細行の区分から分類キーまでを表示順に出す', async () => {
      const { service } = buildService();

      const { buffer } = await service.export(filterOf(), userId, CTX);
      const { sheets } = readWorkbook(buffer);

      expect(sheets['明細行']).toEqual([
        LINE_HEADER,
        [
          `${PREFIX}-業者C`,
          '2026-05-01',
          `${PREFIX}-本案件Y`,
          '値引き',
          '値引き',
          '',
          '',
          '',
          '',
          -100,
          '',
          '',
          '',
          '',
          '',
          'なし',
          '',
          '',
        ],
        [
          `${PREFIX}-業者B`,
          '2026-05-01',
          `${PREFIX}-本案件Y`,
          '直接工事',
          'ボード張り',
          '',
          10.5,
          '㎡',
          190.5,
          2000.25,
          '',
          '',
          '',
          '',
          '',
          'あり',
          '金額が数量×単価と合わない',
          '',
        ],
        [
          `${PREFIX}-業者B`,
          '2026-05-01',
          `${PREFIX}-本案件Y`,
          '産廃',
          '産廃処分',
          '',
          '',
          '',
          '',
          300,
          '',
          '',
          '',
          '',
          '',
          'なし',
          '',
          '',
        ],
        [
          `${PREFIX}-業者A`,
          '2026-03-10',
          `${PREFIX}-台帳案件X`,
          '直接工事',
          '軽量鉄骨天井下地',
          '@300',
          100,
          '㎡',
          10,
          1000,
          '1階',
          2,
          '箇所',
          500,
          '1箇所あたり',
          'なし',
          '',
          'K-001',
        ],
        [
          `${PREFIX}-業者A`,
          '2026-03-10',
          `${PREFIX}-台帳案件X`,
          '別途',
          '別途の足場',
          '',
          '',
          '',
          '',
          500,
          '',
          '',
          '',
          '',
          '',
          'なし',
          '',
          '',
        ],
        [
          `${PREFIX}-業者A`,
          '2026-03-10',
          `${PREFIX}-台帳案件X`,
          '諸経費',
          '=1+1',
          '@SUM(A1)',
          '',
          '',
          '',
          100,
          '',
          '',
          '',
          '',
          '',
          'なし',
          '',
          '',
        ],
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-6.2
     */
    it('「=」や「@」で始まる文字は式にせず、文字のまま書く', async () => {
      const { service } = buildService();

      const { buffer } = await service.export(filterOf(), userId, CTX);
      const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: true });
      const sheet = workbook.Sheets['明細行'];
      const formulaCells = Object.entries(sheet ?? {}).filter(
        ([key, cell]) => !key.startsWith('!') && (cell as XLSX.CellObject).f !== undefined
      );

      expect(formulaCells).toEqual([]);
    });

    /**
     * @requirement unit-price-ledger/REQ-6.1
     */
    it('要確認のシートに、参考の印のある明細行だけを明細行のシートと同じ列で出す', async () => {
      const { service } = buildService();

      const { buffer } = await service.export(filterOf(), userId, CTX);
      const { sheets } = readWorkbook(buffer);

      expect(sheets['要確認']).toEqual([
        LINE_HEADER,
        [
          `${PREFIX}-業者B`,
          '2026-05-01',
          `${PREFIX}-本案件Y`,
          '直接工事',
          'ボード張り',
          '',
          10.5,
          '㎡',
          190.5,
          2000.25,
          '',
          '',
          '',
          '',
          '',
          'あり',
          '金額が数量×単価と合わない',
          '',
        ],
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-6.1
     */
    it('一覧と同じ絞り込みで、条件に合う見積だけを書き出す', async () => {
      const { service, record } = buildService();

      const result = await service.export(filterOf({ hasProject: 'false' }), userId, CTX);
      const { sheets } = readWorkbook(result.buffer);

      expect(result.quotationCount).toBe(1);
      expect(sheets['見積']?.slice(1).map((row) => row[0])).toEqual([`${PREFIX}-業者A`]);
      expect(sheets['明細行']?.slice(1).map((row) => row[4])).toEqual([
        '軽量鉄骨天井下地',
        '別途の足場',
        '=1+1',
      ]);
      expect(sheets['要確認']).toEqual([LINE_HEADER]);
      expect(record).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ itemCount: 1, targetIds: [ids.ledgerCard] }),
        CTX
      );
    });
  });

  describe('出力の記録（6.3・6.4）', () => {
    /**
     * @requirement unit-price-ledger/REQ-6.3
     */
    it('ファイルを作る前に、種別 unit_price_ledger_xlsx・案件なし・件数は見積の数で出力を記録する', async () => {
      const { service, record, writeWorkbook } = buildService();
      const before = await exportLogsOf(userId);

      await service.export(filterOf(), userId, CTX);

      expect(record).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledWith(
        userId,
        {
          kind: 'unit_price_ledger_xlsx',
          projectId: null,
          targetIds: [ids.requested, ids.projectOnly, ids.ledgerCard],
          itemCount: 3,
        },
        CTX
      );
      expect(writeWorkbook).toHaveBeenCalledTimes(1);
      const recordOrder = record.mock.invocationCallOrder[0] ?? Infinity;
      const writeOrder = writeWorkbook.mock.invocationCallOrder[0] ?? -Infinity;
      expect(recordOrder).toBeLessThan(writeOrder);

      const after = await exportLogsOf(userId);
      expect(after).toHaveLength(before.length + 1);
      const log = after[after.length - 1];
      expect(log?.targetType).toBe('DataExport');
      expect(log?.targetId).toBe('unit_price_ledger_xlsx');
      expect(log?.metadata).toMatchObject({
        kind: 'unit_price_ledger_xlsx',
        projectId: null,
        itemCount: 3,
        ipAddress: CTX.ipAddress,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-6.4
     */
    it('記録に失敗したらファイルを作らず、500 EXPORT_RECORD_FAILED と逐語の文言で拒む', async () => {
      const record = vi.fn().mockResolvedValue(Err({ type: 'RECORD_FAILED' as const }));
      const { service, writeWorkbook } = buildService({ exportAuditService: { record } });

      const error = await service.export(filterOf(), userId, CTX).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        statusCode: 500,
        code: 'EXPORT_RECORD_FAILED',
        message: '書き出しを記録できなかったため、出力を中止しました',
      });
      expect(record).toHaveBeenCalledTimes(1);
      expect(writeWorkbook).not.toHaveBeenCalled();
    });

    /**
     * @requirement unit-price-ledger/REQ-6.4
     */
    it('監査ログの書き込みが失敗したとき（実の ExportAuditService）もファイルを作らない', async () => {
      const failingAudit = new ExportAuditService({
        auditLogService: { createLog: () => Promise.reject(new Error('audit db down')) },
        scopeService: { evaluateProjectAccess: () => Promise.resolve('allowed' as const) },
      });
      const { service, writeWorkbook } = buildService({ exportAuditService: failingAudit });

      await expect(service.export(filterOf(), userId, CTX)).rejects.toMatchObject({
        statusCode: 500,
        code: 'EXPORT_RECORD_FAILED',
        message: '書き出しを記録できなかったため、出力を中止しました',
      });
      expect(writeWorkbook).not.toHaveBeenCalled();
    });
  });

  describe('0 件の拒否（6.5）', () => {
    /**
     * @requirement unit-price-ledger/REQ-6.5
     */
    it('絞り込みの結果が 0 件の要求は 400 で拒み、記録もファイルも作らない', async () => {
      const { service, record, writeWorkbook } = buildService();
      const before = await exportLogsOf(userId);

      const error = await service
        .export(filterOf({ keyword: `${PREFIX}-該当なし` }), userId, CTX)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ statusCode: 400, code: 'LEDGER_EXPORT_EMPTY' });
      expect(record).not.toHaveBeenCalled();
      expect(writeWorkbook).not.toHaveBeenCalled();
      expect(await exportLogsOf(userId)).toHaveLength(before.length);
    });
  });
});
