/**
 * @fileoverview 似た単価の検索と並べ方（SimilarPriceService）の統合試験（unit-price-ledger タスク2.8）
 *
 * テスト用の実データベースの pg_trgm で、似た単価の候補の選び方・並べ方・添える内容を確かめる。
 *
 * 確かめること:
 * - 1.1・1.3：論理削除されていない受領見積書を、見積依頼と案件の有無を問わず対象にし、論理削除された
 *   受領見積書と論理削除された見積依頼の受領見積書を含めない
 * - 1.2：論理削除と編集が、その後の検索に反映される
 * - 7.1：区分が直接工事と産廃の明細行だけ
 * - 7.2：分類キーの一致は名称の近さを問わず候補にし、先に並べる
 * - 7.3：分類キーの一致しない行は、名称を含むか、近さ（名称と規格の similarity と word_similarity の
 *   大きい方）が 0.3 以上のものだけ。`%`・`_`・`\` は文字として扱い、大文字と小文字を区別しない
 * - 7.4：2 文字以下の名称は、近さが下限に満たなくても名称に含む行を候補にする
 * - 7.5：単位（換算のある行は換算の単位）の一致
 * - 7.6：群 → 工種・改修／新営・場所の一致の数 → 近さ → 見積日 → 明細行の ID の順、最大 20 件
 * - 7.7〜7.10：添える内容（業者名・見積日・採否・読取の確認・参考の印と理由・按分の内訳）、
 *   不採用と未確認を含むこと
 * - 7.11：0 件は空の一覧
 *
 * 共有の試験 DB には他の試験の明細行も残りうるため、試験の行には試験ごとの単位・分類キーを付け、
 * 単位で絞るか、試験の行の ID に絞って確かめる。
 *
 * Design: Components > SimilarPriceService、System Flows > 似た単価の検索、Testing Strategy
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import getPrismaClient from '../../db.js';
import {
  SIMILAR_PRICE_LIMIT,
  SIMILAR_PRICE_THRESHOLD,
  SimilarPriceService,
  type SimilarPriceMatch,
} from '../../services/unit-price-ledger/similar-price.service.js';
import {
  similarPriceQuerySchema,
  type SimilarPriceQuery,
} from '../../schemas/unit-price-ledger.schema.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-upl28-similar';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PREFIX = `${MARK}-${RUN}`;

/** 主な試験の単位 */
const UNIT_A = `m2-${RUN}`;
/** 単位の違いを確かめる単位 */
const UNIT_B = `式-${RUN}`;
/** 並べ方の試験の単位 */
const UNIT_ORDER = `ord-${RUN}`;
/** 文字の扱い（`%`・`_`・`\`・大文字と小文字）の試験の単位 */
const UNIT_ESCAPE = `esc-${RUN}`;
/** 2 文字以下の名称の試験の単位 */
const UNIT_SHORT = `sht-${RUN}`;
/** 分類キー（主な試験） */
const KEY = `K${RUN}`;
/** 分類キー（最大 20 件の試験） */
const KEY_MANY = `M${RUN}`;

type LineSeed = Omit<Prisma.ReceivedQuotationLineItemCreateManyReceivedQuotationInput, 'sortOrder'>;

describe('似た単価の検索と並べ方（統合・実 DB の pg_trgm）', () => {
  let prisma: PrismaClient;
  let service: SimilarPriceService;
  let userId: string;
  let projectId: string;
  let tradingPartnerId: string;
  const projectName = `${PREFIX}-本案件`;

  /** 試験の明細行の ID（名前で引く） */
  const lineIds = new Map<string, string>();
  /** 試験の受領見積書の ID */
  const quotationIds = new Map<string, string>();
  /** 並べ方の試験の明細行の ID（作った順） */
  const orderLineIds: Record<string, string> = {};

  const lineId = (label: string): string => {
    const id = lineIds.get(label);
    if (!id) throw new Error(`試験の明細行 ${label} がありません`);
    return id;
  };

  const createQuotation = async (
    label: string,
    data: Omit<Prisma.ReceivedQuotationUncheckedCreateInput, 'lineItems' | 'vendorName' | 'name'> &
      Partial<Pick<Prisma.ReceivedQuotationUncheckedCreateInput, 'vendorName'>>,
    lines: Array<LineSeed & { label: string }>
  ): Promise<string> => {
    const vendorName = data.vendorName ?? `${PREFIX}-${label}`;
    const created = await prisma.receivedQuotation.create({
      data: {
        ...data,
        vendorName,
        name: `${vendorName}_見積`,
        lineItems: {
          createMany: {
            data: lines.map(({ label: _label, ...line }, i) => ({ ...line, sortOrder: i })),
          },
        },
      },
      select: { id: true, lineItems: { select: { id: true, sortOrder: true } } },
    });
    for (const item of created.lineItems) {
      const seed = lines[item.sortOrder];
      if (seed) lineIds.set(seed.label, item.id);
    }
    quotationIds.set(label, created.id);
    return created.id;
  };

  const search = (query: Partial<Record<keyof SimilarPriceQuery, unknown>>) =>
    service.findMatches(similarPriceQuerySchema.parse(query));

  const idsOf = (matches: SimilarPriceMatch[]): string[] => matches.map((m) => m.lineItemId);

  /** 試験の行に絞った ID（並びはそのまま） */
  const ownIdsOf = (matches: SimilarPriceMatch[]): string[] => {
    const own = new Set(lineIds.values());
    return idsOf(matches).filter((id) => own.has(id));
  };

  /**
   * 設計の近さ（名称と規格を空白でつないだ値どうしの similarity と word_similarity の大きい方）を DB で測る。
   * 候補にするかの境目を、試験の前提として下限の値と比べるために使う
   */
  const measureSimilarity = async (
    target: { name: string; specification?: string },
    query: { name: string; specification?: string }
  ): Promise<number> => {
    const targetText = [target.name, target.specification].filter(Boolean).join(' ');
    const queryText = [query.name, query.specification].filter(Boolean).join(' ');
    const rows = await prisma.$queryRaw<Array<{ s: number }>>`
      SELECT GREATEST(similarity(${targetText}, ${queryText}), word_similarity(${queryText}, ${targetText}))::float8 AS s
    `;
    const value = rows[0]?.s;
    if (value === undefined) throw new Error('近さを測れませんでした');
    return value;
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    service = new SimilarPriceService({ prisma });

    const user = await createTestUser(prisma, {
      email: `${PREFIX}-user@example.com`,
      displayName: `${PREFIX}-user`,
      passwordHash: 'not-used',
    });
    userId = user.id;
    const partner = await prisma.tradingPartner.create({
      data: {
        name: `${PREFIX}-partner`,
        nameKana: 'ニタタンカテスト',
        address: '東京都千代田区1-1-1',
        types: { create: [{ type: 'SUBCONTRACTOR' }] },
      },
    });
    tradingPartnerId = partner.id;
    const project = await prisma.project.create({
      data: { name: projectName, salesPersonId: userId, createdById: userId },
      select: { id: true },
    });
    projectId = project.id;
    const liveRequest = await prisma.estimateRequest.create({
      data: { projectId, tradingPartnerId, name: `${PREFIX}-live-request` },
      select: { id: true },
    });
    const deletedRequest = await prisma.estimateRequest.create({
      data: {
        projectId,
        tradingPartnerId,
        name: `${PREFIX}-deleted-request`,
        deletedAt: new Date(),
      },
      select: { id: true },
    });

    // 案件の無い受領見積書（採用・確認済み・改修）。按分の基準＝直接工事 1000＋産廃 1000＝2000、
    // 諸経費の率＝200÷2000＝0.1、値引きの率＝-100÷2000＝-0.05（別途は使わない）
    await createQuotation(
      'projectless',
      {
        submittedAt: new Date('2026-03-01'),
        constructionKind: 'RENOVATION',
        siteLocation: '東京都千代田区',
        adoption: 'ADOPTED',
        readingStatus: 'CONFIRMED',
        readingConfirmedById: userId,
        readingConfirmedAt: new Date('2026-03-02T00:00:00Z'),
        ledgerCardId: `${PREFIX}-card-1`,
        ledgerSourcePath: `${PREFIX}/02_見積/見積書.pdf`,
        ledgerProjectName: `${PREFIX}-台帳の案件`,
      },
      [
        {
          label: 'contains',
          name: '軽量鉄骨天井下地',
          specification: '@300',
          unit: UNIT_A,
          quantity: 10,
          unitPrice: 100,
          amount: 1000,
          category: 'DIRECT',
          workType: '内装',
        },
        {
          label: 'similarOnly',
          name: '天井板',
          unit: UNIT_A,
          quantity: 1,
          unitPrice: 1000,
          amount: 1000,
          category: 'WASTE',
        },
        { label: 'lowSimilarity', name: '床下地', unit: UNIT_A, category: 'DIRECT' },
        {
          label: 'specOnly',
          name: '床仕上',
          specification: 'LGS19型',
          unit: UNIT_A,
          category: 'DIRECT',
        },
        { label: 'overhead', name: '天井下地', unit: UNIT_A, amount: 200, category: 'OVERHEAD' },
        { label: 'discount', name: '値引き', unit: UNIT_A, amount: -100, category: 'DISCOUNT' },
        { label: 'excluded', name: '天井下地', unit: UNIT_A, amount: 999, category: 'EXCLUDED' },
      ]
    );

    // 案件の受領見積書（見積依頼なし・不採用・未確認・新営）
    await createQuotation(
      'project',
      {
        projectId,
        submittedAt: new Date('2026-05-01'),
        constructionKind: 'NEW_CONSTRUCTION',
        adoption: 'REJECTED',
        readingStatus: 'UNCONFIRMED',
      },
      [
        {
          label: 'keyMatched',
          name: '床下地',
          unit: UNIT_A,
          category: 'DIRECT',
          classificationKey: KEY,
        },
        {
          label: 'reference',
          name: '天井下地 張替',
          unit: UNIT_A,
          quantity: 2,
          amount: 500,
          category: 'DIRECT',
          isReference: true,
          referenceReason: '合計の不一致',
        },
        {
          label: 'conversion',
          name: '天井下地',
          unit: 'm',
          quantity: 30,
          unitPrice: 50,
          amount: 1500,
          conversionQuantity: 5,
          conversionUnit: UNIT_A,
          conversionUnitPrice: 300,
          conversionBasis: '1 ㎡あたり',
          category: 'DIRECT',
        },
        {
          label: 'conversionOtherUnit',
          name: '天井下地',
          unit: UNIT_A,
          quantity: 1,
          conversionQuantity: 1,
          conversionUnit: `m3-${RUN}`,
          conversionUnitPrice: 1,
          conversionBasis: '換算',
          category: 'DIRECT',
        },
        { label: 'unitB', name: '天井下地', unit: UNIT_B, category: 'DIRECT' },
      ]
    );

    // 見積依頼の受領見積書（見積依頼は生きている）
    await createQuotation(
      'requested',
      {
        estimateRequestId: liveRequest.id,
        projectId,
        submittedAt: new Date('2026-04-01'),
      },
      [{ label: 'requested', name: '天井下地', unit: UNIT_A, category: 'DIRECT' }]
    );

    // 論理削除された受領見積書と、論理削除された見積依頼の受領見積書
    await createQuotation(
      'deleted',
      { submittedAt: new Date('2026-06-01'), deletedAt: new Date() },
      [
        {
          label: 'deleted',
          name: '天井下地',
          unit: UNIT_A,
          category: 'DIRECT',
          classificationKey: KEY,
        },
      ]
    );
    await createQuotation(
      'underDeletedRequest',
      {
        estimateRequestId: deletedRequest.id,
        projectId,
        submittedAt: new Date('2026-06-02'),
      },
      [
        {
          label: 'underDeletedRequest',
          name: '天井下地',
          unit: UNIT_A,
          category: 'DIRECT',
          classificationKey: KEY,
        },
      ]
    );

    // 並べ方：問い合わせ＝名称「天井下地」・工種「内装」・改修・場所「港区」
    const orderSeeds: Array<{
      label: string;
      submittedAt: string;
      constructionKind?: 'RENOVATION' | 'NEW_CONSTRUCTION';
      siteLocation?: string;
      workType?: string;
      name: string;
      adoption?: 'ADOPTED' | 'REJECTED' | 'UNKNOWN';
      readingStatus?: 'UNCONFIRMED' | 'CONFIRMED';
    }> = [
      // 一致 3（工種・改修・場所の部分一致）。見積日は最も古い
      {
        label: 'o3match',
        submittedAt: '2026-01-01',
        constructionKind: 'RENOVATION',
        siteLocation: '東京都港区',
        workType: '内装',
        name: '天井下地材',
      },
      // 一致 2（工種・改修）
      {
        label: 'o2match',
        submittedAt: '2026-01-02',
        constructionKind: 'RENOVATION',
        siteLocation: '大阪府',
        workType: '内装',
        name: '天井下地材',
      },
      // 一致 0・近さが高い（天井下地）・見積日は古い
      { label: 'oHighSim', submittedAt: '2026-02-01', name: '天井下地' },
      // 一致 0・近さが同じ（天井下地材）・見積日が新しい
      {
        label: 'oNewest',
        submittedAt: '2026-09-01',
        constructionKind: 'NEW_CONSTRUCTION',
        siteLocation: '大阪府港町',
        workType: '外装',
        name: '天井下地材',
      },
      // 一致 0・近さと見積日が同じ（明細行の ID の順）。採否と読取の確認は並べ方に使わない
      {
        label: 'oTieA',
        submittedAt: '2026-07-01',
        name: '天井下地材',
        adoption: 'REJECTED',
        readingStatus: 'UNCONFIRMED',
      },
      {
        label: 'oTieB',
        submittedAt: '2026-07-01',
        name: '天井下地材',
        adoption: 'ADOPTED',
        readingStatus: 'CONFIRMED',
      },
    ];
    for (const seed of orderSeeds) {
      await createQuotation(
        seed.label,
        {
          submittedAt: new Date(seed.submittedAt),
          constructionKind: seed.constructionKind ?? null,
          siteLocation: seed.siteLocation ?? null,
          adoption: seed.adoption ?? 'UNKNOWN',
          readingStatus: seed.readingStatus ?? 'UNCONFIRMED',
          ...(seed.readingStatus === 'CONFIRMED'
            ? { readingConfirmedById: userId, readingConfirmedAt: new Date() }
            : {}),
        },
        [
          {
            label: seed.label,
            name: seed.name,
            unit: UNIT_ORDER,
            workType: seed.workType ?? null,
            category: 'DIRECT',
          },
        ]
      );
      orderLineIds[seed.label] = lineId(seed.label);
    }

    // 文字の扱い（`%`・`_`・`\`・大文字と小文字）
    await createQuotation('escape', { submittedAt: new Date('2026-03-03') }, [
      { label: 'percent', name: '目地材 50%増', unit: UNIT_ESCAPE, category: 'DIRECT' },
      { label: 'noPercent', name: '目地材', unit: UNIT_ESCAPE, category: 'DIRECT' },
      { label: 'underscore', name: 'PB_12', unit: UNIT_ESCAPE, category: 'DIRECT' },
      { label: 'noUnderscore', name: 'PB12', unit: UNIT_ESCAPE, category: 'DIRECT' },
      { label: 'backslash', name: 'C\\D', unit: UNIT_ESCAPE, category: 'DIRECT' },
      { label: 'noBackslash', name: 'CD', unit: UNIT_ESCAPE, category: 'DIRECT' },
      { label: 'upperCase', name: 'LGS天井', unit: UNIT_ESCAPE, category: 'DIRECT' },
    ]);

    // 2 文字以下の名称
    await createQuotation('short', { submittedAt: new Date('2026-03-04') }, [
      {
        label: 'shortContains',
        name: 'システム天井ボード張り工事',
        unit: UNIT_SHORT,
        category: 'DIRECT',
      },
      { label: 'shortOther', name: '上天ボード', unit: UNIT_SHORT, category: 'DIRECT' },
    ]);

    // 最大 20 件：分類キーの一致する行を 22 行
    await createQuotation(
      'many',
      { submittedAt: new Date('2026-03-05') },
      Array.from({ length: SIMILAR_PRICE_LIMIT + 2 }, (_, i) => ({
        label: `many-${i}`,
        name: `杉板 ${i}`,
        unit: UNIT_A,
        category: 'DIRECT' as const,
        classificationKey: KEY_MANY,
      }))
    );
  });

  afterAll(async () => {
    await prisma.receivedQuotation.deleteMany({ where: { vendorName: { startsWith: PREFIX } } });
    await prisma.estimateRequest.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.tradingPartner.deleteMany({ where: { id: tradingPartnerId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  describe('前提（実 DB の pg_trgm）', () => {
    /**
     * @requirement unit-price-ledger/REQ-7.3
     */
    it('近さの下限は 0.3 で、試験の行の近さが下限の前後に分かれる', async () => {
      expect(SIMILAR_PRICE_THRESHOLD).toBe(0.3);
      // 名称を含まず、近さだけで下限に届く
      expect(
        await measureSimilarity({ name: '天井板' }, { name: '天井下地' })
      ).toBeGreaterThanOrEqual(SIMILAR_PRICE_THRESHOLD);
      // 名称を含まず、近さが下限に届かない
      expect(await measureSimilarity({ name: '床下地' }, { name: '天井下地' })).toBeLessThan(
        SIMILAR_PRICE_THRESHOLD
      );
      // 規格を問い合わせに入れたときだけ届く
      expect(
        await measureSimilarity({ name: '床仕上', specification: 'LGS19型' }, { name: '天井下地' })
      ).toBeLessThan(SIMILAR_PRICE_THRESHOLD);
      expect(
        await measureSimilarity(
          { name: '床仕上', specification: 'LGS19型' },
          { name: '天井下地', specification: 'LGS19型' }
        )
      ).toBeGreaterThanOrEqual(SIMILAR_PRICE_THRESHOLD);
      // 2 文字の名称は近さが下限に届かない（含むことだけで候補になる）
      expect(
        await measureSimilarity({ name: 'システム天井ボード張り工事' }, { name: '天井' })
      ).toBeLessThan(SIMILAR_PRICE_THRESHOLD);
      // 並べ方の試験：天井下地 の方が 天井下地材 より近い
      expect(await measureSimilarity({ name: '天井下地' }, { name: '天井下地' })).toBeGreaterThan(
        await measureSimilarity({ name: '天井下地材' }, { name: '天井下地' })
      );
    });
  });

  describe('候補の選び方（1.1・1.3・7.1〜7.5）', () => {
    /**
     * @requirement unit-price-ledger/REQ-1.1
     * @requirement unit-price-ledger/REQ-1.3
     * @requirement unit-price-ledger/REQ-7.1
     * @requirement unit-price-ledger/REQ-7.2
     * @requirement unit-price-ledger/REQ-7.3
     * @requirement unit-price-ledger/REQ-7.5
     */
    it('分類キーの一致の行を先に、名称を含むか近さが下限以上の行を後に返し、それ以外と対象外を含めない', async () => {
      const matches = await search({ name: '天井下地', unit: UNIT_A, classificationKey: KEY });
      const ids = ownIdsOf(matches);

      // 分類キーの一致（名称の近さは下限に満たない）が先頭
      expect(ids[0]).toBe(lineId('keyMatched'));
      expect(
        matches.find((m) => m.lineItemId === lineId('keyMatched'))?.classificationKeyMatched
      ).toBe(true);
      // 名称を含む行・近さだけで届く行・換算の単位が一致する行・見積依頼の受領見積書の行
      expect(new Set(ids.slice(1))).toEqual(
        new Set([
          lineId('contains'),
          lineId('similarOnly'),
          lineId('reference'),
          lineId('conversion'),
          lineId('requested'),
        ])
      );
      for (const match of matches.filter((m) => m.lineItemId !== lineId('keyMatched'))) {
        expect(match.classificationKeyMatched).toBe(false);
      }
      // 近さが下限に満たない行・規格だけが近い行・諸経費・別途・単位の違う行・換算の単位の違う行・
      // 論理削除された見積・論理削除された見積依頼の見積は含めない
      for (const label of [
        'lowSimilarity',
        'specOnly',
        'overhead',
        'excluded',
        'unitB',
        'conversionOtherUnit',
        'deleted',
        'underDeletedRequest',
      ]) {
        expect(ids).not.toContain(lineId(label));
      }
    });

    /**
     * @requirement unit-price-ledger/REQ-7.3
     */
    it('近さは名称と規格で測る（問い合わせに規格があると規格の近い行が届く）', async () => {
      const ids = ownIdsOf(
        await search({ name: '天井下地', specification: 'LGS19型', unit: UNIT_A })
      );
      expect(ids).toContain(lineId('specOnly'));
      expect(ids).not.toContain(lineId('lowSimilarity'));
    });

    /**
     * @requirement unit-price-ledger/REQ-7.2
     */
    it('分類キーの指定が無ければ、分類キーの一致の群は作らない', async () => {
      const matches = await search({ name: '天井下地', unit: UNIT_A });
      const ids = ownIdsOf(matches);
      expect(ids).not.toContain(lineId('keyMatched'));
      expect(matches.every((m) => !m.classificationKeyMatched)).toBe(true);
    });

    /**
     * @requirement unit-price-ledger/REQ-7.5
     */
    it('単位の指定が無ければ単位で絞らず、指定があれば換算のある行は換算の単位で照らす', async () => {
      const withoutUnit = ownIdsOf(await search({ name: '天井下地', classificationKey: KEY }));
      expect(withoutUnit).toEqual(
        expect.arrayContaining([
          lineId('keyMatched'),
          lineId('unitB'),
          lineId('conversionOtherUnit'),
          lineId('conversion'),
        ])
      );

      const unitB = ownIdsOf(await search({ name: '天井下地', unit: UNIT_B }));
      expect(unitB).toEqual([lineId('unitB')]);

      // 換算の単位でだけ一致する（行の単位は m）
      const byConversionUnit = ownIdsOf(await search({ name: '天井下地', unit: `m3-${RUN}` }));
      expect(byConversionUnit).toEqual([lineId('conversionOtherUnit')]);
    });

    /**
     * @requirement unit-price-ledger/REQ-7.3
     */
    it('名称を含むかは `%`・`_`・`\\` を文字として扱い、大文字と小文字を区別しない', async () => {
      expect(idsOf(await search({ name: '%', unit: UNIT_ESCAPE }))).toEqual([lineId('percent')]);
      expect(idsOf(await search({ name: '_', unit: UNIT_ESCAPE }))).toEqual([lineId('underscore')]);
      expect(idsOf(await search({ name: '\\', unit: UNIT_ESCAPE }))).toEqual([lineId('backslash')]);
      expect(await measureSimilarity({ name: 'LGS天井' }, { name: 'gS' })).toBeLessThan(
        SIMILAR_PRICE_THRESHOLD
      );
      expect(idsOf(await search({ name: 'gS', unit: UNIT_ESCAPE }))).toEqual([lineId('upperCase')]);
    });

    /**
     * @requirement unit-price-ledger/REQ-7.4
     */
    it('2 文字以下の名称は、近さが下限に満たなくても名称に含む行を候補にする', async () => {
      expect(idsOf(await search({ name: '天井', unit: UNIT_SHORT }))).toEqual([
        lineId('shortContains'),
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-7.11
     */
    it('候補が無ければ空の一覧を返す', async () => {
      expect(await search({ name: `該当なし${RUN}`, unit: `none-${RUN}` })).toEqual([]);
    });
  });

  describe('並べ方と件数（7.6・7.8）', () => {
    /**
     * @requirement unit-price-ledger/REQ-7.6
     * @requirement unit-price-ledger/REQ-7.8
     */
    it('一致の数の多い順、近さの高い順、見積日の新しい順、明細行の ID の順に並べ、採否と読取の確認を使わない', async () => {
      const matches = await search({
        name: '天井下地',
        unit: UNIT_ORDER,
        workType: '内装',
        constructionKind: 'RENOVATION',
        siteLocation: '港区',
      });
      const [tieFirst, tieSecond] = [orderLineIds.oTieA, orderLineIds.oTieB].sort();
      expect(idsOf(matches)).toEqual([
        orderLineIds.o3match,
        orderLineIds.o2match,
        orderLineIds.oHighSim,
        orderLineIds.oNewest,
        tieFirst,
        tieSecond,
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-7.6
     */
    it('最大 20 件を返す', async () => {
      const matches = await search({ name: '杉板', unit: UNIT_A, classificationKey: KEY_MANY });
      expect(matches).toHaveLength(SIMILAR_PRICE_LIMIT);
      expect(SIMILAR_PRICE_LIMIT).toBe(20);
      expect(matches.every((m) => m.classificationKeyMatched)).toBe(true);
    });
  });

  describe('候補に添える内容（7.7〜7.10・8.x）', () => {
    /**
     * @requirement unit-price-ledger/REQ-7.7
     * @requirement unit-price-ledger/REQ-7.10
     * @requirement unit-price-ledger/REQ-8.4
     */
    it('業者名・見積日・明細行の内容・採否・読取の確認・按分の内訳・案件の識別の元を返す', async () => {
      const matches = await search({ name: '天井下地', unit: UNIT_A });
      const contains = matches.find((m) => m.lineItemId === lineId('contains'));
      expect(contains).toEqual({
        lineItemId: lineId('contains'),
        vendorName: `${PREFIX}-projectless`,
        submittedAt: '2026-03-01',
        name: '軽量鉄骨天井下地',
        specification: '@300',
        unit: UNIT_A,
        quantity: '10',
        category: 'DIRECT',
        classificationKeyMatched: false,
        adoption: 'ADOPTED',
        readingStatus: 'CONFIRMED',
        isReference: false,
        referenceReason: null,
        // 単価 100、諸経費 100×0.1＝10、値引き 100×(-0.05)＝-5、反映 105
        allocation: {
          unitPrice: '100',
          overheadAllocation: '10',
          discountAllocation: '-5',
          appliedUnitPrice: '105',
          allocatable: true,
          applicable: true,
        },
        source: {
          receivedQuotationId: quotationIds.get('projectless'),
          projectId: null,
          projectName: null,
          ledgerProjectName: `${PREFIX}-台帳の案件`,
          ledgerSourcePath: `${PREFIX}/02_見積/見積書.pdf`,
        },
      });

      const requested = matches.find((m) => m.lineItemId === lineId('requested'));
      expect(requested?.source).toEqual({
        receivedQuotationId: quotationIds.get('requested'),
        projectId,
        projectName,
        ledgerProjectName: null,
        ledgerSourcePath: null,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-7.7
     * @requirement unit-price-ledger/REQ-8.1
     */
    it('換算のある行は、換算の単位・数量・単価で返す', async () => {
      const matches = await search({ name: '天井下地', unit: UNIT_A });
      const conversion = matches.find((m) => m.lineItemId === lineId('conversion'));
      expect(conversion).toMatchObject({
        unit: UNIT_A,
        quantity: '5',
        allocation: {
          unitPrice: '300',
          overheadAllocation: '0',
          discountAllocation: '0',
          appliedUnitPrice: '300',
          allocatable: true,
          applicable: true,
        },
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-7.8
     * @requirement unit-price-ledger/REQ-7.9
     */
    it('不採用・未確認の見積の行を含め、参考の印と理由を返す', async () => {
      const matches = await search({ name: '天井下地', unit: UNIT_A });
      const reference = matches.find((m) => m.lineItemId === lineId('reference'));
      expect(reference).toMatchObject({
        adoption: 'REJECTED',
        readingStatus: 'UNCONFIRMED',
        isReference: true,
        referenceReason: '合計の不一致',
        source: { projectId, projectName, receivedQuotationId: quotationIds.get('project') },
        // 単価が空の行は金額÷数量（500÷2）
        allocation: { unitPrice: '250' },
      });
    });
  });

  describe('変更の反映（1.2）', () => {
    /**
     * @requirement unit-price-ledger/REQ-1.2
     * @requirement unit-price-ledger/REQ-1.3
     */
    it('編集と論理削除が、その後の検索に反映される', async () => {
      const before = ownIdsOf(await search({ name: '天井下地', unit: UNIT_A }));
      expect(before).toContain(lineId('requested'));
      expect(before).not.toContain(lineId('lowSimilarity'));

      await prisma.receivedQuotationLineItem.update({
        where: { id: lineId('lowSimilarity') },
        data: { name: '天井下地 改' },
      });
      await prisma.receivedQuotation.update({
        where: { id: quotationIds.get('requested') },
        data: { deletedAt: new Date() },
      });

      const after = ownIdsOf(await search({ name: '天井下地', unit: UNIT_A }));
      expect(after).toContain(lineId('lowSimilarity'));
      expect(after).not.toContain(lineId('requested'));
    });
  });
});
