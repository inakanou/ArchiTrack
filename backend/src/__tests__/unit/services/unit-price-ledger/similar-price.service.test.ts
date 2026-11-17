/**
 * @fileoverview 似た単価の検索（SimilarPriceService）の単体試験（unit-price-ledger タスク2.8・2.9）
 *
 * Prisma をモックし、検索の SQL の組み立て（利用者の入力は結び付けた値だけに入り、SQL の文に入らない）、
 * 任意の条件の有無、行から候補への写し方、按分の内訳の添え方（単価を決められない行の値なし。タスク6.1。
 * 整数に丸める前の値。タスク6.7）、
 * 閲覧範囲による表示制御（範囲外の候補の参考の理由の文の秘匿を含む。タスク6.2）を確かめる。
 * 並べ方・近さの実際の振る舞いは統合試験（similar-price.service.int.test.ts）が確かめる。
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { Prisma, type PrismaClient } from '../../../../generated/prisma/client.js';
import {
  OTHER_PROJECT_NAME,
  SIMILAR_PRICE_LIMIT,
  SIMILAR_PRICE_THRESHOLD,
  SimilarPriceService,
  toProjectFields,
  type SimilarPriceSource,
} from '../../../../services/unit-price-ledger/similar-price.service.js';
import { computeAllocation } from '../../../../services/unit-price-ledger/ledger-allocation.js';
import type { SimilarPriceQuery } from '../../../../schemas/unit-price-ledger.schema.js';
import type { ProjectScopeService } from '../../../../services/project-scope.service.js';

const { sharedBuildProjectScopeWhere } = vi.hoisted(() => ({
  sharedBuildProjectScopeWhere: vi.fn(),
}));

vi.mock('../../../../services/project-scope.service.js', () => ({
  getSharedProjectScopeService: () => ({ buildProjectScopeWhere: sharedBuildProjectScopeWhere }),
}));

function createMockPrisma() {
  return {
    $queryRaw: vi.fn(),
    receivedQuotationLineItem: { groupBy: vi.fn() },
    project: { findMany: vi.fn() },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

/** モックの $queryRaw に渡された tagged template を、ネストした Prisma.sql を平らにした 1 つの Sql にする */
const capturedSql = (prisma: MockPrisma, call = 0): Prisma.Sql => {
  const [strings, ...values] = prisma.$queryRaw.mock.calls[call] as [
    TemplateStringsArray,
    ...unknown[],
  ];
  return Prisma.sql(strings, ...(values as Prisma.Sql[]));
};

const sqlText = (sql: Prisma.Sql): string => sql.strings.join('?');

const row = (overrides: Record<string, unknown> = {}) => ({
  lineItemId: 'l-1',
  receivedQuotationId: 'q-1',
  name: '石膏ボード張り',
  specification: '12.5mm',
  unit: 'm2',
  quantity: new Prisma.Decimal('10'),
  unitPrice: new Prisma.Decimal('1000'),
  amount: new Prisma.Decimal('10000'),
  conversionQuantity: null,
  conversionUnit: null,
  conversionUnitPrice: null,
  category: 'DIRECT',
  isReference: false,
  referenceReason: null,
  keyMatched: true,
  vendorName: '業者A',
  submittedAt: new Date('2026-04-01T00:00:00.000Z'),
  adoption: 'ADOPTED',
  readingStatus: 'CONFIRMED',
  projectId: 'p-1',
  projectName: '案件A',
  ledgerProjectName: null,
  ledgerSourcePath: null,
  ...overrides,
});

const baseQuery: SimilarPriceQuery = { name: '石膏ボード' };

describe('toProjectFields', () => {
  const source: SimilarPriceSource = {
    receivedQuotationId: 'q-1',
    projectId: 'p-1',
    projectName: '案件A',
    ledgerProjectName: '使わない台帳の案件名',
    ledgerSourcePath: 'X/Y.pdf',
  };

  /**
   * @requirement unit-price-ledger/REQ-9.1
   */
  it('範囲内の案件は案件名・案件の ID・受領見積書の ID を返し、原本のパスは返さない', () => {
    expect(toProjectFields(source, new Set(['p-1']))).toEqual({
      projectName: '案件A',
      projectId: 'p-1',
      receivedQuotationId: 'q-1',
      ledgerSourcePath: null,
    });
  });

  /**
   * @requirement unit-price-ledger/REQ-9.2
   */
  it('範囲外の案件は「他案件」とし、案件の ID・受領見積書の ID・原本のパスを null にする', () => {
    expect(toProjectFields(source, new Set(['p-2']))).toEqual({
      projectName: OTHER_PROJECT_NAME,
      projectId: null,
      receivedQuotationId: null,
      ledgerSourcePath: null,
    });
    expect(OTHER_PROJECT_NAME).toBe('他案件');
  });

  /**
   * @requirement unit-price-ledger/REQ-9.3
   */
  it('案件の無い見積は台帳の案件名・受領見積書の ID・原本のパスを返す', () => {
    expect(
      toProjectFields(
        { ...source, projectId: null, projectName: null, ledgerProjectName: '台帳の案件' },
        new Set()
      )
    ).toEqual({
      projectName: '台帳の案件',
      projectId: null,
      receivedQuotationId: 'q-1',
      ledgerSourcePath: 'X/Y.pdf',
    });
  });
});

describe('SimilarPriceService', () => {
  let prisma: MockPrisma;
  let buildProjectScopeWhere: Mock<ProjectScopeService['buildProjectScopeWhere']>;
  let service: SimilarPriceService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = createMockPrisma();
    buildProjectScopeWhere = vi.fn<ProjectScopeService['buildProjectScopeWhere']>();
    service = new SimilarPriceService({
      prisma: prisma as unknown as PrismaClient,
      projectScopeService: { buildProjectScopeWhere },
    });
  });

  describe('findMatches の SQL', () => {
    /**
     * @requirement unit-price-ledger/REQ-1.1
     * @requirement unit-price-ledger/REQ-1.3
     * @requirement unit-price-ledger/REQ-7.1
     * @requirement unit-price-ledger/REQ-7.3
     * @requirement unit-price-ledger/REQ-7.4
     * @requirement unit-price-ledger/REQ-7.6
     */
    it('名称だけの問い合わせは、任意の条件を入れず、名称の逃がしたパターン・近さの下限・件数を値で結び付ける', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.findMatches({ name: "50%_off\\'; DROP TABLE x;--" });

      const sql = capturedSql(prisma);
      const text = sqlText(sql);
      const input = "50%_off\\'; DROP TABLE x;--";
      expect(sql.values).toEqual([
        input,
        input,
        `%${"50\\%\\_off\\\\'; DROP TABLE x;--"}%`,
        SIMILAR_PRICE_THRESHOLD,
        SIMILAR_PRICE_LIMIT,
      ]);
      // 利用者の入力は SQL の文に入らない
      expect(text).not.toContain('DROP TABLE');
      expect(text).not.toContain('50%');
      // 対象と並べ方
      expect(text).toContain('rq."deletedAt" IS NULL');
      expect(text).toContain('(rq."estimateRequestId" IS NULL OR er."deletedAt" IS NULL)');
      expect(text).toContain("li.category IN ('DIRECT', 'WASTE')");
      expect(text).toContain('FALSE AS "keyMatched"');
      expect(text).toContain('(0 + 0 + 0) AS "matchCount"');
      expect(text).not.toContain('COALESCE(li.conversion_unit, li.unit)');
      expect(text).toMatch(
        /ORDER BY c\."keyMatched" DESC, c\."matchCount" DESC, c\.similarity DESC,\s+c\."submittedAt" DESC, c\."lineItemId" ASC/
      );
      // 行が無ければ合計を集計しない
      expect(prisma.receivedQuotationLineItem.groupBy).not.toHaveBeenCalled();
    });

    /**
     * @requirement unit-price-ledger/REQ-7.2
     * @requirement unit-price-ledger/REQ-7.3
     * @requirement unit-price-ledger/REQ-7.5
     * @requirement unit-price-ledger/REQ-7.6
     */
    it('分類キー・単位・工種・改修／新営・場所の指定は、それぞれの条件を加えて値で結び付ける', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.findMatches({
        name: 'ボード',
        specification: '厚12.5',
        unit: 'm2',
        classificationKey: 'KEY-1',
        workType: '内装',
        constructionKind: 'RENOVATION',
        siteLocation: '新宿_%',
      });

      const sql = capturedSql(prisma);
      const text = sqlText(sql);
      expect(sql.values).toEqual([
        'KEY-1',
        'ボード 厚12.5',
        'ボード 厚12.5',
        '内装',
        'RENOVATION',
        '%新宿\\_\\%%',
        'm2',
        '%ボード%',
        SIMILAR_PRICE_THRESHOLD,
        SIMILAR_PRICE_LIMIT,
      ]);
      expect(text).toContain(
        '(li.classification_key IS NOT NULL AND li.classification_key = ?) AS "keyMatched"'
      );
      expect(text).toContain('(CASE WHEN li."workType" = ? THEN 1 ELSE 0 END)');
      expect(text).toContain('(CASE WHEN rq.construction_kind::text = ? THEN 1 ELSE 0 END)');
      expect(text).toContain('(CASE WHEN rq.site_location ILIKE ? THEN 1 ELSE 0 END)');
      expect(text).toContain('AND COALESCE(li.conversion_unit, li.unit) = ?');
      for (const value of ['KEY-1', '内装', '新宿', 'm2', 'ボード', '厚12.5']) {
        expect(text).not.toContain(value);
      }
    });

    /**
     * @requirement unit-price-ledger/REQ-7.6
     */
    it('一致の数の項は、指定された条件だけを数え、無い条件は 0 にする', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.findMatches({ name: 'ボード', constructionKind: 'NEW_CONSTRUCTION' });

      const sql = capturedSql(prisma);
      const text = sqlText(sql);
      expect(text).toContain(
        '(0 + (CASE WHEN rq.construction_kind::text = ? THEN 1 ELSE 0 END) + 0)'
      );
      expect(text).not.toContain('li."workType"');
      expect(text).not.toContain('site_location');
      expect(sql.values).toEqual([
        'ボード',
        'ボード',
        'NEW_CONSTRUCTION',
        '%ボード%',
        SIMILAR_PRICE_THRESHOLD,
        SIMILAR_PRICE_LIMIT,
      ]);
    });
  });

  describe('findMatches の候補', () => {
    /**
     * @requirement unit-price-ledger/REQ-7.7
     * @requirement unit-price-ledger/REQ-7.8
     * @requirement unit-price-ledger/REQ-7.10
     */
    it('行を候補に写し、換算のある行は換算の単位と数量を返し、案件の識別の元を source にまとめる', async () => {
      prisma.$queryRaw.mockResolvedValue([
        row(),
        row({
          lineItemId: 'l-2',
          receivedQuotationId: 'q-2',
          category: 'WASTE',
          conversionQuantity: new Prisma.Decimal('2.5'),
          conversionUnit: 't',
          conversionUnitPrice: new Prisma.Decimal('8000'),
          keyMatched: false,
          isReference: true,
          referenceReason: '読取が怪しい',
          adoption: 'REJECTED',
          readingStatus: 'UNCONFIRMED',
          projectId: null,
          projectName: null,
          ledgerProjectName: '台帳の案件',
          ledgerSourcePath: 'A/B.pdf',
          submittedAt: new Date('2025-12-31T00:00:00.000Z'),
        }),
        row({ lineItemId: 'l-3', unit: null, quantity: null }),
      ]);
      prisma.receivedQuotationLineItem.groupBy.mockResolvedValue([]);

      const matches = await service.findMatches(baseQuery);

      expect(matches).toHaveLength(3);
      expect(matches[0]).toMatchObject({
        lineItemId: 'l-1',
        vendorName: '業者A',
        submittedAt: '2026-04-01',
        name: '石膏ボード張り',
        specification: '12.5mm',
        unit: 'm2',
        quantity: '10',
        category: 'DIRECT',
        classificationKeyMatched: true,
        adoption: 'ADOPTED',
        readingStatus: 'CONFIRMED',
        isReference: false,
        referenceReason: null,
        source: {
          receivedQuotationId: 'q-1',
          projectId: 'p-1',
          projectName: '案件A',
          ledgerProjectName: null,
          ledgerSourcePath: null,
        },
      });
      expect(matches[1]).toMatchObject({
        lineItemId: 'l-2',
        submittedAt: '2025-12-31',
        unit: 't',
        quantity: '2.5',
        category: 'WASTE',
        classificationKeyMatched: false,
        adoption: 'REJECTED',
        readingStatus: 'UNCONFIRMED',
        isReference: true,
        referenceReason: '読取が怪しい',
        source: {
          receivedQuotationId: 'q-2',
          projectId: null,
          projectName: null,
          ledgerProjectName: '台帳の案件',
          ledgerSourcePath: 'A/B.pdf',
        },
      });
      expect(matches[2]).toMatchObject({ unit: null, quantity: null });
    });

    /**
     * @requirement unit-price-ledger/REQ-8.2
     * @requirement unit-price-ledger/REQ-8.3
     * @requirement unit-price-ledger/REQ-8.6
     */
    it('候補の見積の区分ごとの合計を 1 回で集計し、その見積の合計で按分の内訳を添える', async () => {
      prisma.$queryRaw.mockResolvedValue([
        row({ lineItemId: 'l-1', receivedQuotationId: 'q-1' }),
        row({
          lineItemId: 'l-2',
          receivedQuotationId: 'q-1',
          unitPrice: new Prisma.Decimal('500'),
        }),
        row({ lineItemId: 'l-3', receivedQuotationId: 'q-2' }),
      ]);
      prisma.receivedQuotationLineItem.groupBy.mockResolvedValue([
        {
          receivedQuotationId: 'q-1',
          category: 'DIRECT',
          _sum: { amount: new Prisma.Decimal('100000') },
        },
        {
          receivedQuotationId: 'q-1',
          category: 'OVERHEAD',
          _sum: { amount: new Prisma.Decimal('10000') },
        },
        {
          receivedQuotationId: 'q-1',
          category: 'DISCOUNT',
          _sum: { amount: new Prisma.Decimal('-5000') },
        },
      ]);

      const matches = await service.findMatches(baseQuery);

      expect(prisma.receivedQuotationLineItem.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.receivedQuotationLineItem.groupBy).toHaveBeenCalledWith({
        by: ['receivedQuotationId', 'category'],
        where: { receivedQuotationId: { in: ['q-1', 'q-2'] }, amount: { not: null } },
        _sum: { amount: true },
      });
      // 単価 1000、諸経費の率 0.1、値引きの率 -0.05 → 100、-50、1050
      expect(matches[0]?.allocation).toEqual({
        allocationStatus: 'ALLOCATED',
        unitPrice: '1000',
        overheadAllocation: '100',
        discountAllocation: '-50',
        appliedUnitPrice: '1050',
        allocatable: true,
        applicable: true,
        unrounded: {
          unitPrice: '1000',
          overheadAllocation: '100',
          discountAllocation: '-50',
          appliedUnitPrice: '1050',
        },
      });
      expect(matches[1]?.allocation).toMatchObject({ unitPrice: '500', appliedUnitPrice: '525' });
      // 合計の無い見積は区分の合計が空として按分できない
      expect(matches[2]?.allocation).toEqual(
        computeAllocation(
          { conversionUnitPrice: null, unitPrice: '1000', amount: '10000', quantity: '10' },
          {}
        )
      );
      expect(matches[2]?.allocation.allocatable).toBe(false);
      expect(matches[2]?.allocation.allocationStatus).toBe('BASE_NOT_POSITIVE');
    });

    /**
     * @requirement unit-price-ledger/REQ-8.8
     */
    it('単価を決められない行は、按分の内訳の 4 つの金額を null とし、単価を決められない状態を添える', async () => {
      prisma.$queryRaw.mockResolvedValue([
        row({
          lineItemId: 'l-1',
          unitPrice: null,
          amount: null,
          quantity: new Prisma.Decimal('3'),
        }),
        row({ lineItemId: 'l-2', unitPrice: null, quantity: new Prisma.Decimal('0') }),
      ]);
      prisma.receivedQuotationLineItem.groupBy.mockResolvedValue([
        {
          receivedQuotationId: 'q-1',
          category: 'DIRECT',
          _sum: { amount: new Prisma.Decimal('100000') },
        },
      ]);

      const matches = await service.findMatches(baseQuery);

      for (const match of matches) {
        expect(match.allocation).toEqual({
          allocationStatus: 'UNIT_PRICE_UNDETERMINED',
          unitPrice: null,
          overheadAllocation: null,
          discountAllocation: null,
          appliedUnitPrice: null,
          allocatable: false,
          applicable: false,
          unrounded: null,
        });
      }
    });

    /**
     * @requirement unit-price-ledger/REQ-8.9
     */
    it('按分の内訳に、整数に丸める前の 4 つの値を小数点以下 10 桁までの文字で添える', async () => {
      // 単価が空の行：単価 = 10000 / 3、諸経費の率 = 10000 / 120000、値引きの率 = -6000 / 120000
      prisma.$queryRaw.mockResolvedValue([
        row({
          unitPrice: null,
          amount: new Prisma.Decimal('10000.00'),
          quantity: new Prisma.Decimal('3.0000'),
        }),
      ]);
      prisma.receivedQuotationLineItem.groupBy.mockResolvedValue([
        {
          receivedQuotationId: 'q-1',
          category: 'DIRECT',
          _sum: { amount: new Prisma.Decimal('120000') },
        },
        {
          receivedQuotationId: 'q-1',
          category: 'OVERHEAD',
          _sum: { amount: new Prisma.Decimal('10000') },
        },
        {
          receivedQuotationId: 'q-1',
          category: 'DISCOUNT',
          _sum: { amount: new Prisma.Decimal('-6000') },
        },
      ]);

      const [match] = await service.findMatches(baseQuery);

      // 3333.333… × 10000 / 120000 = 277.777…、3333.333… × -6000 / 120000 = -166.666…
      // 反映する単価 = 3333.333… × (1 + 1/12 - 1/20) = 3444.444…
      expect(match?.allocation).toEqual({
        allocationStatus: 'ALLOCATED',
        unitPrice: '3333',
        overheadAllocation: '278',
        discountAllocation: '-167',
        appliedUnitPrice: '3444',
        allocatable: true,
        applicable: true,
        unrounded: {
          unitPrice: '3333.3333333333',
          overheadAllocation: '277.7777777778',
          discountAllocation: '-166.6666666667',
          appliedUnitPrice: '3444.4444444444',
        },
      });
    });
  });

  describe('search', () => {
    /**
     * @requirement unit-price-ledger/REQ-7.11
     */
    it('候補が無ければ空の一覧を返し、閲覧範囲も案件も引かない', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(service.search(baseQuery, 'u-1')).resolves.toEqual([]);
      expect(buildProjectScopeWhere).not.toHaveBeenCalled();
      expect(prisma.project.findMany).not.toHaveBeenCalled();
    });

    /**
     * @requirement unit-price-ledger/REQ-9.1
     * @requirement unit-price-ledger/REQ-9.2
     * @requirement unit-price-ledger/REQ-9.4
     */
    it('利用者の閲覧範囲と論理削除の除外で案件の ID をまとめて引き、範囲外の候補は「他案件」にする', async () => {
      prisma.$queryRaw.mockResolvedValue([
        row({
          lineItemId: 'l-1',
          receivedQuotationId: 'q-1',
          projectId: 'p-1',
          projectName: '案件A',
        }),
        row({
          lineItemId: 'l-2',
          receivedQuotationId: 'q-2',
          projectId: 'p-2',
          projectName: '案件B',
        }),
        row({
          lineItemId: 'l-3',
          receivedQuotationId: 'q-3',
          projectId: 'p-1',
          projectName: '案件A',
        }),
      ]);
      prisma.receivedQuotationLineItem.groupBy.mockResolvedValue([]);
      const scope = { OR: [{ salesPersonId: 'u-1' }] };
      buildProjectScopeWhere.mockResolvedValue(scope);
      prisma.project.findMany.mockResolvedValue([{ id: 'p-1' }]);

      const candidates = await service.search(baseQuery, 'u-1');

      expect(buildProjectScopeWhere).toHaveBeenCalledWith('u-1');
      expect(prisma.project.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.project.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['p-1', 'p-2'] }, deletedAt: null, ...scope },
        select: { id: true },
      });
      expect(candidates[0]).toMatchObject({
        lineItemId: 'l-1',
        projectName: '案件A',
        projectId: 'p-1',
        receivedQuotationId: 'q-1',
        ledgerSourcePath: null,
      });
      expect(candidates[1]).toMatchObject({
        lineItemId: 'l-2',
        projectName: OTHER_PROJECT_NAME,
        projectId: null,
        receivedQuotationId: null,
        ledgerSourcePath: null,
        // 業者名・見積日・明細行の内容・按分の内訳は返す（9.4）
        vendorName: '業者A',
        submittedAt: '2026-04-01',
        name: '石膏ボード張り',
      });
      expect(candidates[1]?.allocation).toBeDefined();
      for (const candidate of candidates) {
        expect(candidate).not.toHaveProperty('source');
      }
    });

    /**
     * @requirement unit-price-ledger/REQ-9.2
     * @requirement unit-price-ledger/REQ-9.4
     */
    it('範囲外の案件の候補は参考の理由の文を null にし、参考の印は返す。範囲内と案件の無い候補は理由の文を返す', async () => {
      prisma.$queryRaw.mockResolvedValue([
        row({
          lineItemId: 'l-in',
          projectId: 'p-1',
          isReference: true,
          referenceReason: '案件Aの図面と照合',
        }),
        row({
          lineItemId: 'l-out',
          receivedQuotationId: 'q-2',
          projectId: 'p-2',
          projectName: '案件B',
          isReference: true,
          referenceReason: '案件Bの現場で数量を確認',
        }),
        row({
          lineItemId: 'l-out-plain',
          receivedQuotationId: 'q-2',
          projectId: 'p-2',
          projectName: '案件B',
        }),
        row({
          lineItemId: 'l-none',
          receivedQuotationId: 'q-3',
          projectId: null,
          projectName: null,
          ledgerProjectName: '台帳の案件',
          isReference: true,
          referenceReason: '概算のみ',
        }),
      ]);
      prisma.receivedQuotationLineItem.groupBy.mockResolvedValue([]);
      buildProjectScopeWhere.mockResolvedValue({ OR: [{ salesPersonId: 'u-1' }] });
      prisma.project.findMany.mockResolvedValue([{ id: 'p-1' }]);

      const candidates = await service.search(baseQuery, 'u-1');

      expect(
        candidates.map(({ lineItemId, projectName, isReference, referenceReason }) => ({
          lineItemId,
          projectName,
          isReference,
          referenceReason,
        }))
      ).toEqual([
        {
          lineItemId: 'l-in',
          projectName: '案件A',
          isReference: true,
          referenceReason: '案件Aの図面と照合',
        },
        {
          lineItemId: 'l-out',
          projectName: OTHER_PROJECT_NAME,
          isReference: true,
          referenceReason: null,
        },
        {
          lineItemId: 'l-out-plain',
          projectName: OTHER_PROJECT_NAME,
          isReference: false,
          referenceReason: null,
        },
        {
          lineItemId: 'l-none',
          projectName: '台帳の案件',
          isReference: true,
          referenceReason: '概算のみ',
        },
      ]);
      expect(JSON.stringify(candidates)).not.toContain('案件Bの現場で数量を確認');
    });

    /**
     * @requirement unit-price-ledger/REQ-9.1
     * @requirement unit-price-ledger/REQ-9.2
     */
    it('全案件閲覧（範囲の条件が null）でも論理削除された案件は範囲外とする', async () => {
      prisma.$queryRaw.mockResolvedValue([
        row({ lineItemId: 'l-1', projectId: 'p-live' }),
        row({ lineItemId: 'l-2', projectId: 'p-deleted' }),
      ]);
      prisma.receivedQuotationLineItem.groupBy.mockResolvedValue([]);
      buildProjectScopeWhere.mockResolvedValue(null);
      // DB は deletedAt: null の条件で論理削除された案件を返さない
      prisma.project.findMany.mockResolvedValue([{ id: 'p-live' }]);

      const candidates = await service.search(baseQuery, 'admin');

      expect(prisma.project.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['p-live', 'p-deleted'] }, deletedAt: null },
        select: { id: true },
      });
      expect(candidates.map((candidate) => candidate.projectName)).toEqual([
        '案件A',
        OTHER_PROJECT_NAME,
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-9.3
     */
    it('案件の無い候補だけなら閲覧範囲も案件も引かず、台帳の案件名と原本のパスを返す', async () => {
      prisma.$queryRaw.mockResolvedValue([
        row({
          projectId: null,
          projectName: null,
          ledgerProjectName: '台帳の案件',
          ledgerSourcePath: 'A/B.pdf',
        }),
      ]);
      prisma.receivedQuotationLineItem.groupBy.mockResolvedValue([]);

      const candidates = await service.search(baseQuery, 'u-1');

      expect(buildProjectScopeWhere).not.toHaveBeenCalled();
      expect(prisma.project.findMany).not.toHaveBeenCalled();
      expect(candidates[0]).toMatchObject({
        projectName: '台帳の案件',
        projectId: null,
        receivedQuotationId: 'q-1',
        ledgerSourcePath: 'A/B.pdf',
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-9.1
     */
    it('閲覧範囲の依存が無ければ共有の ProjectScopeService を使う', async () => {
      const defaultService = new SimilarPriceService({ prisma: prisma as unknown as PrismaClient });
      prisma.$queryRaw.mockResolvedValue([row({ projectId: 'p-1' })]);
      prisma.receivedQuotationLineItem.groupBy.mockResolvedValue([]);
      sharedBuildProjectScopeWhere.mockResolvedValue({ OR: [{ createdById: 'u-9' }] });
      prisma.project.findMany.mockResolvedValue([]);

      const candidates = await defaultService.search(baseQuery, 'u-9');

      expect(sharedBuildProjectScopeWhere).toHaveBeenCalledWith('u-9');
      expect(prisma.project.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['p-1'] }, deletedAt: null, OR: [{ createdById: 'u-9' }] },
        select: { id: true },
      });
      expect(candidates[0]?.projectName).toBe(OTHER_PROJECT_NAME);
    });
  });
});
