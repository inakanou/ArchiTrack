/**
 * @fileoverview 台帳の一覧・絞り込み・詳細（LedgerQueryService）の単体試験（unit-price-ledger タスク2.5）
 *
 * Prisma をモックし、絞り込みの条件の組み立て（buildLedgerWhere・escapeLikePattern）、
 * 一覧のページの計算・合計の写し方・案件名の決め方・参考の行の印、詳細の写し方を確かめる。
 * 実 DB での振る舞いは統合試験（ledger-query.service.int.test.ts）が確かめる。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma, type PrismaClient } from '../../../../generated/prisma/client.js';
import {
  LEDGER_BASE_WHERE,
  LEDGER_ORDER_BY,
  LedgerQueryService,
  buildLedgerWhere,
  escapeLikePattern,
} from '../../../../services/unit-price-ledger/ledger-query.service.js';
import {
  LEDGER_PAGE_SIZE,
  type LedgerFilter,
} from '../../../../schemas/unit-price-ledger.schema.js';

type Where = Prisma.ReceivedQuotationWhereInput;

/** buildLedgerWhere の結果から、基本の条件を除いた絞り込みの条件を取り出す */
const filterConditions = (filter: LedgerFilter): Where[] => {
  const where = buildLedgerWhere(filter);
  const conditions = where.AND as Where[];
  expect(conditions[0]).toBe(LEDGER_BASE_WHERE);
  return conditions.slice(1);
};

const REFERENCE_LINE = { isReference: true };
const MISSING_KEY_LINE = {
  category: { in: ['DIRECT', 'WASTE'] },
  OR: [{ classificationKey: null }, { classificationKey: '' }],
};

function createMockPrisma() {
  return {
    receivedQuotation: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    receivedQuotationLineItem: {
      groupBy: vi.fn(),
    },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

const listRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'q-1',
  name: '見積書A',
  vendorName: '業者A',
  submittedAt: new Date('2026-04-01T00:00:00.000Z'),
  projectId: 'p-1',
  estimateRequestId: 'er-1',
  ledgerProjectName: null,
  constructionKind: 'RENOVATION',
  adoption: 'ADOPTED',
  readingStatus: 'CONFIRMED',
  ledgerCardId: null,
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-03T00:00:00.000Z'),
  project: { name: '案件A' },
  _count: { lineItems: 0 },
  ...overrides,
});

const lineRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'l-1',
  receivedQuotationId: 'q-1',
  sortOrder: 0,
  customCategory: null,
  workType: '内装',
  name: '石膏ボード',
  specification: '12.5mm',
  unit: 'm2',
  quantity: new Prisma.Decimal('10.5'),
  unitPrice: new Prisma.Decimal('1200'),
  amount: new Prisma.Decimal('12600'),
  remarks: null,
  category: 'DIRECT',
  condition: null,
  conversionQuantity: null,
  conversionUnit: null,
  conversionUnitPrice: null,
  conversionBasis: null,
  classificationKey: 'K-1',
  quantityRowKey: null,
  isReference: false,
  referenceReason: null,
  ...overrides,
});

const detailRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'q-1',
  estimateRequestId: null,
  projectId: null,
  project: null,
  ledgerProjectName: '台帳の案件',
  name: '見積書A',
  vendorName: '業者A',
  tradingPartnerId: 'tp-1',
  submittedAt: new Date('2026-04-01T00:00:00.000Z'),
  fileName: null,
  fileMimeType: null,
  fileSize: null,
  quoteNumber: 'No.1',
  overallConditions: '条件',
  siteLocation: '東京都',
  constructionKind: 'NEW_CONSTRUCTION',
  useType: '事務所',
  constructionPrice: new Prisma.Decimal('5000000'),
  workConditions: '夜間',
  distanceKm: new Prisma.Decimal('12.5'),
  adoption: 'UNKNOWN',
  confirmedAmount: null,
  readingStatus: 'UNCONFIRMED',
  readingConfirmedAt: null,
  readingConfirmedBy: null,
  quoteDiscriminator: 'disc',
  ledgerCardId: 'card-1',
  ledgerSourcePath: 'A/B.pdf',
  createdAt: new Date('2026-04-02T00:00:00.000Z'),
  updatedAt: new Date('2026-04-03T00:00:00.000Z'),
  lineItems: [],
  ...overrides,
});

describe('escapeLikePattern', () => {
  /**
   * @requirement unit-price-ledger/REQ-4.2
   */
  it('%・_・\\ の前に \\ を付け、ほかの文字はそのままにする', () => {
    expect(escapeLikePattern('50%_off\\x')).toBe('50\\%\\_off\\\\x');
    expect(escapeLikePattern('石膏ボード')).toBe('石膏ボード');
    expect(escapeLikePattern('')).toBe('');
  });
});

describe('buildLedgerWhere', () => {
  /**
   * @requirement unit-price-ledger/REQ-1.1
   * @requirement unit-price-ledger/REQ-1.3
   */
  it('絞り込みが無ければ基本の条件（論理削除されていない・見積依頼が生きている）だけを返す', () => {
    expect(buildLedgerWhere({})).toEqual({ AND: [LEDGER_BASE_WHERE] });
    expect(LEDGER_BASE_WHERE).toEqual({
      deletedAt: null,
      OR: [{ estimateRequestId: null }, { estimateRequest: { is: { deletedAt: null } } }],
    });
  });

  /**
   * @requirement unit-price-ledger/REQ-4.2
   */
  it('文字は業者名・案件名・台帳の案件名（案件の無いもの）・明細行の名称を、逃がした値の部分一致で探す', () => {
    const [condition] = filterConditions({ keyword: '10%_A\\B' });
    const contains = { contains: '10\\%\\_A\\\\B', mode: 'insensitive' };
    expect(condition).toEqual({
      OR: [
        { vendorName: contains },
        { project: { is: { name: contains } } },
        { projectId: null, ledgerProjectName: contains },
        { lineItems: { some: { name: contains } } },
      ],
    });
  });

  /**
   * @requirement unit-price-ledger/REQ-4.2
   */
  it('見積日の期間は両端を含み、UTC の 0 時の日付にする', () => {
    expect(filterConditions({ submittedFrom: '2026-01-01', submittedTo: '2026-03-31' })).toEqual([
      {
        submittedAt: {
          gte: new Date('2026-01-01T00:00:00.000Z'),
          lte: new Date('2026-03-31T00:00:00.000Z'),
        },
      },
    ]);
  });

  /**
   * @requirement unit-price-ledger/REQ-4.2
   */
  it('見積日の始まりだけ・終わりだけの指定は片側の条件にする', () => {
    expect(filterConditions({ submittedFrom: '2026-01-01' })).toEqual([
      { submittedAt: { gte: new Date('2026-01-01T00:00:00.000Z') } },
    ]);
    expect(filterConditions({ submittedTo: '2026-03-31' })).toEqual([
      { submittedAt: { lte: new Date('2026-03-31T00:00:00.000Z') } },
    ]);
  });

  /**
   * @requirement unit-price-ledger/REQ-4.2
   */
  it('案件の有無は、有りなら案件の ID が空でない、無しなら空', () => {
    expect(filterConditions({ hasProject: true })).toEqual([{ projectId: { not: null } }]);
    expect(filterConditions({ hasProject: false })).toEqual([{ projectId: null }]);
  });

  /**
   * @requirement unit-price-ledger/REQ-4.2
   */
  it('採否・読取の確認・改修／新営は、その値と等しいもの', () => {
    expect(
      filterConditions({
        adoption: 'REJECTED',
        readingStatus: 'UNCONFIRMED',
        constructionKind: 'NEW_CONSTRUCTION',
      })
    ).toEqual([
      { adoption: 'REJECTED' },
      { readingStatus: 'UNCONFIRMED' },
      { constructionKind: 'NEW_CONSTRUCTION' },
    ]);
  });

  /**
   * @requirement unit-price-ledger/REQ-4.3
   */
  it('要確認は、有りなら参考の印のある行を持つ、無しなら持たない', () => {
    expect(filterConditions({ needsReview: true })).toEqual([
      { lineItems: { some: REFERENCE_LINE } },
    ]);
    expect(filterConditions({ needsReview: false })).toEqual([
      { lineItems: { none: REFERENCE_LINE } },
    ]);
  });

  /**
   * @requirement unit-price-ledger/REQ-4.4
   */
  it('分類キーの無い行は、直接工事・産廃で分類キーが null か空の文字の行の有無で探す', () => {
    expect(filterConditions({ missingClassificationKey: true })).toEqual([
      { lineItems: { some: MISSING_KEY_LINE } },
    ]);
    expect(filterConditions({ missingClassificationKey: false })).toEqual([
      { lineItems: { none: MISSING_KEY_LINE } },
    ]);
  });

  /**
   * @requirement unit-price-ledger/REQ-4.9
   */
  it('削除済みの案件を除くは、案件が無いか、案件が論理削除されていない見積に限り、指定しなければ除かない', () => {
    expect(filterConditions({ excludeDeletedProjects: true })).toEqual([
      { OR: [{ projectId: null }, { project: { is: { deletedAt: null } } }] },
    ]);
    // 除かない指定と、指定しないときは条件を足さない（論理削除された案件の見積も台帳に出る。4.8）
    expect(filterConditions({ excludeDeletedProjects: false })).toEqual([]);
    expect(filterConditions({})).toEqual([]);
  });

  /**
   * @requirement unit-price-ledger/REQ-4.2
   * @requirement unit-price-ledger/REQ-4.3
   * @requirement unit-price-ledger/REQ-4.4
   */
  it('複数の絞り込みは AND でつなぐ', () => {
    const conditions = filterConditions({
      keyword: 'x',
      hasProject: true,
      adoption: 'ADOPTED',
      needsReview: true,
      missingClassificationKey: true,
    });
    expect(conditions).toHaveLength(5);
  });
});

describe('LedgerQueryService', () => {
  let prisma: MockPrisma;
  let service: LedgerQueryService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new LedgerQueryService({ prisma: prisma as unknown as PrismaClient });
  });

  describe('list', () => {
    /**
     * @requirement unit-price-ledger/REQ-4.1
     * @requirement unit-price-ledger/REQ-4.5
     */
    it('絞り込みの条件・並び・ページの位置で引き、総件数も同じ条件で数える', async () => {
      prisma.receivedQuotation.findMany.mockResolvedValue([]);
      prisma.receivedQuotation.count.mockResolvedValue(0);

      await service.list({ page: 3, adoption: 'ADOPTED' });

      const expectedWhere = buildLedgerWhere({ adoption: 'ADOPTED' });
      const args = prisma.receivedQuotation.findMany.mock.calls[0]?.[0];
      expect(args.where).toEqual(expectedWhere);
      expect(args.orderBy).toBe(LEDGER_ORDER_BY);
      expect(args.skip).toBe(2 * LEDGER_PAGE_SIZE);
      expect(args.take).toBe(LEDGER_PAGE_SIZE);
      expect(args.select._count).toEqual({
        select: { lineItems: { where: { isReference: true } } },
      });
      expect(prisma.receivedQuotation.count).toHaveBeenCalledWith({ where: expectedWhere });
      expect(LEDGER_ORDER_BY).toEqual([
        { submittedAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-4.5
     */
    it('見積が無ければ合計を集計せず、空の一覧と 0 ページを返す', async () => {
      prisma.receivedQuotation.findMany.mockResolvedValue([]);
      prisma.receivedQuotation.count.mockResolvedValue(0);

      const result = await service.list({ page: 1 });

      expect(result).toEqual({
        data: [],
        pagination: { page: 1, limit: LEDGER_PAGE_SIZE, total: 0, totalPages: 0 },
      });
      expect(prisma.receivedQuotationLineItem.groupBy).not.toHaveBeenCalled();
    });

    /**
     * @requirement unit-price-ledger/REQ-4.5
     */
    it('総ページ数は総件数を 1 ページの件数で割って切り上げる', async () => {
      prisma.receivedQuotation.findMany.mockResolvedValue([]);
      prisma.receivedQuotation.count.mockResolvedValue(LEDGER_PAGE_SIZE * 2 + 1);

      const result = await service.list({ page: 2 });

      expect(result.pagination).toEqual({
        page: 2,
        limit: LEDGER_PAGE_SIZE,
        total: LEDGER_PAGE_SIZE * 2 + 1,
        totalPages: 3,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-1.2
     * @requirement unit-price-ledger/REQ-4.1
     * @requirement unit-price-ledger/REQ-4.3
     */
    it('合計はページの見積をまとめて 1 回で集計し、案件名・参考の行の印を写す', async () => {
      prisma.receivedQuotation.findMany.mockResolvedValue([
        listRow({ id: 'q-1', project: { name: '案件A' }, _count: { lineItems: 2 } }),
        listRow({
          id: 'q-2',
          projectId: null,
          estimateRequestId: null,
          project: null,
          ledgerProjectName: '台帳の案件B',
          ledgerCardId: 'card-2',
          constructionKind: null,
        }),
        listRow({ id: 'q-3', project: null, ledgerProjectName: null }),
      ]);
      prisma.receivedQuotation.count.mockResolvedValue(3);
      prisma.receivedQuotationLineItem.groupBy.mockResolvedValue([
        { receivedQuotationId: 'q-1', _sum: { amount: new Prisma.Decimal('12345.5') } },
        { receivedQuotationId: 'q-2', _sum: { amount: null } },
      ]);

      const result = await service.list({ page: 1 });

      expect(prisma.receivedQuotationLineItem.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.receivedQuotationLineItem.groupBy).toHaveBeenCalledWith({
        by: ['receivedQuotationId'],
        where: {
          receivedQuotationId: { in: ['q-1', 'q-2', 'q-3'] },
          category: { not: 'EXCLUDED' },
          amount: { not: null },
        },
        _sum: { amount: true },
      });

      const [first, second, third] = result.data;
      expect(first).toMatchObject({
        id: 'q-1',
        projectName: '案件A',
        totalAmount: 12345.5,
        hasReferenceLines: true,
        projectId: 'p-1',
        estimateRequestId: 'er-1',
      });
      expect(first).not.toHaveProperty('project');
      expect(first).not.toHaveProperty('_count');
      expect(second).toMatchObject({
        id: 'q-2',
        projectId: null,
        projectName: '台帳の案件B',
        totalAmount: null,
        hasReferenceLines: false,
        ledgerCardId: 'card-2',
        constructionKind: null,
      });
      // 集計に現れない（金額を持つ別途以外の行が無い）見積は null
      expect(third).toMatchObject({ id: 'q-3', projectName: null, totalAmount: null });
      expect(result.pagination.totalPages).toBe(1);
    });

    /**
     * @requirement unit-price-ledger/REQ-4.8
     */
    it('案件の論理削除の日時を引き、論理削除された案件の見積だけに削除済みの印を付ける', async () => {
      prisma.receivedQuotation.findMany.mockResolvedValue([
        listRow({
          id: 'q-1',
          project: { name: '削除した案件', deletedAt: new Date('2026-05-01T00:00:00.000Z') },
        }),
        listRow({ id: 'q-2', project: { name: '生きている案件', deletedAt: null } }),
        listRow({ id: 'q-3', projectId: null, project: null, ledgerProjectName: '台帳の案件' }),
      ]);
      prisma.receivedQuotation.count.mockResolvedValue(3);
      prisma.receivedQuotationLineItem.groupBy.mockResolvedValue([]);

      const result = await service.list({ page: 1 });

      const args = prisma.receivedQuotation.findMany.mock.calls[0]?.[0];
      expect(args.select.project).toEqual({ select: { name: true, deletedAt: true } });
      expect(result.data.map((row) => [row.id, row.projectName, row.projectDeleted])).toEqual([
        ['q-1', '削除した案件', true],
        ['q-2', '生きている案件', false],
        ['q-3', '台帳の案件', false],
      ]);
    });
  });

  describe('findById', () => {
    /**
     * @requirement unit-price-ledger/REQ-4.6
     */
    it('見つからなければ null を返し、基本の条件と ID で探す', async () => {
      prisma.receivedQuotation.findFirst.mockResolvedValue(null);

      await expect(service.findById('q-x')).resolves.toBeNull();
      const args = prisma.receivedQuotation.findFirst.mock.calls[0]?.[0];
      expect(args.where).toEqual({ AND: [{ id: 'q-x' }, LEDGER_BASE_WHERE] });
      expect(args.include.lineItems).toEqual({ orderBy: { sortOrder: 'asc' } });
    });

    /**
     * @requirement unit-price-ledger/REQ-4.6
     */
    it('渡されたクライアント（トランザクション）で読む', async () => {
      const tx = { receivedQuotation: { findFirst: vi.fn().mockResolvedValue(detailRow()) } };

      const result = await service.findById('q-1', tx as never);

      expect(result?.id).toBe('q-1');
      expect(tx.receivedQuotation.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.receivedQuotation.findFirst).not.toHaveBeenCalled();
    });

    /**
     * @requirement unit-price-ledger/REQ-1.2
     * @requirement unit-price-ledger/REQ-4.6
     */
    it('案件の無い見積は台帳の案件名を返し、Decimal を数にし、明細行が無ければ合計は null', async () => {
      prisma.receivedQuotation.findFirst.mockResolvedValue(detailRow());

      const result = await service.findById('q-1');

      expect(result).toMatchObject({
        id: 'q-1',
        projectId: null,
        projectName: '台帳の案件',
        constructionPrice: 5000000,
        distanceKm: 12.5,
        confirmedAmount: null,
        readingConfirmedBy: null,
        ledgerCardId: 'card-1',
        ledgerSourcePath: 'A/B.pdf',
        ledgerProjectName: '台帳の案件',
        lineItems: [],
        totalAmount: null,
        hasReferenceLines: false,
        quoteDiscriminator: 'disc',
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-4.6
     * @requirement unit-price-ledger/REQ-4.3
     */
    it('案件の名前・確認者を返し、明細行を写し、合計は別途と金額の無い行を除く', async () => {
      const confirmedAt = new Date('2026-04-05T00:00:00.000Z');
      prisma.receivedQuotation.findFirst.mockResolvedValue(
        detailRow({
          projectId: 'p-1',
          project: { name: '案件A' },
          confirmedAmount: new Prisma.Decimal('9000'),
          readingStatus: 'CONFIRMED',
          readingConfirmedAt: confirmedAt,
          readingConfirmedBy: { id: 'u-1', displayName: '確認者', email: 'x@example.com' },
          lineItems: [
            lineRow({ id: 'l-1' }),
            lineRow({
              id: 'l-2',
              sortOrder: 1,
              category: 'EXCLUDED',
              amount: new Prisma.Decimal('99999'),
            }),
            lineRow({
              id: 'l-3',
              sortOrder: 2,
              category: 'WASTE',
              quantity: null,
              unitPrice: null,
              amount: null,
              isReference: true,
              referenceReason: '要確認',
            }),
            lineRow({
              id: 'l-4',
              sortOrder: 3,
              category: 'OVERHEAD',
              amount: new Prisma.Decimal('400'),
              conversionQuantity: new Prisma.Decimal('2'),
              conversionUnit: '式',
              conversionUnitPrice: new Prisma.Decimal('200'),
              conversionBasis: '1式=2',
            }),
            // 換算の 4 つが揃わない行は換算を返さない
            lineRow({
              id: 'l-5',
              sortOrder: 4,
              amount: null,
              conversionQuantity: new Prisma.Decimal('2'),
              conversionUnit: '式',
              conversionUnitPrice: null,
              conversionBasis: '根拠',
            }),
          ],
        })
      );

      const result = await service.findById('q-1');

      expect(result?.projectName).toBe('案件A');
      expect(result?.confirmedAmount).toBe(9000);
      expect(result?.readingConfirmedAt).toBe(confirmedAt);
      expect(result?.readingConfirmedBy).toEqual({ id: 'u-1', displayName: '確認者' });
      // 12600 + 400（別途 99999 と金額の無い行は除く）
      expect(result?.totalAmount).toBe(13000);
      expect(result?.hasReferenceLines).toBe(true);
      expect(result?.lineItems.map((line) => line.id)).toEqual(['l-1', 'l-2', 'l-3', 'l-4', 'l-5']);
      expect(result?.lineItems[0]).toEqual({
        id: 'l-1',
        receivedQuotationId: 'q-1',
        sortOrder: 0,
        customCategory: null,
        workType: '内装',
        name: '石膏ボード',
        specification: '12.5mm',
        unit: 'm2',
        quantity: 10.5,
        unitPrice: 1200,
        amount: 12600,
        remarks: null,
        category: 'DIRECT',
        condition: null,
        conversion: null,
        classificationKey: 'K-1',
        quantityRowKey: null,
        isReference: false,
        referenceReason: null,
      });
      expect(result?.lineItems[2]).toMatchObject({
        quantity: null,
        unitPrice: null,
        amount: null,
        isReference: true,
        referenceReason: '要確認',
      });
      expect(result?.lineItems[3]?.conversion).toEqual({
        quantity: 2,
        unit: '式',
        unitPrice: 200,
        basis: '1式=2',
      });
      expect(result?.lineItems[4]?.conversion).toBeNull();
    });

    /**
     * @requirement unit-price-ledger/REQ-4.8
     */
    it('論理削除された案件の見積も詳細を返し、削除済みの印を付ける（生きている案件と案件の無い見積は付けない）', async () => {
      prisma.receivedQuotation.findFirst.mockResolvedValueOnce(
        detailRow({
          projectId: 'p-1',
          project: { name: '削除した案件', deletedAt: new Date('2026-05-01T00:00:00.000Z') },
        })
      );
      prisma.receivedQuotation.findFirst.mockResolvedValueOnce(
        detailRow({ projectId: 'p-2', project: { name: '生きている案件', deletedAt: null } })
      );
      prisma.receivedQuotation.findFirst.mockResolvedValueOnce(detailRow());

      const deleted = await service.findById('q-1');
      const live = await service.findById('q-2');
      const ledgerOnly = await service.findById('q-3');

      const args = prisma.receivedQuotation.findFirst.mock.calls[0]?.[0];
      expect(args.include.project).toEqual({ select: { name: true, deletedAt: true } });
      expect(deleted).toMatchObject({ projectName: '削除した案件', projectDeleted: true });
      expect(live).toMatchObject({ projectName: '生きている案件', projectDeleted: false });
      expect(ledgerOnly).toMatchObject({ projectName: '台帳の案件', projectDeleted: false });
    });
  });
});
