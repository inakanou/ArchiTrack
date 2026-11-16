/**
 * @fileoverview 台帳の一覧・絞り込み・詳細（LedgerQueryService）の統合試験（unit-price-ledger タスク2.5）
 *
 * テスト用の実データベースで、受領見積書を台帳の見積として一覧・絞り込み・詳細で返すことを確かめる。
 *
 * 確かめること:
 * - 1.1：論理削除されていない受領見積書を、見積依頼と案件の有無を問わず台帳の見積とする
 * - 1.2：登録・編集・論理削除が、その後の一覧に反映される
 * - 1.3：論理削除された受領見積書と、論理削除された見積依頼の受領見積書を含めない
 * - 1.4：取り込んだ案件の無い受領見積書は、estimate-request の一覧・詳細の API に出ない（回帰）
 * - 4.1：業者名・見積日・案件名・合計（別途を除く）・採否・読取の確認・参考の行の有無と、見積日の新しい順
 * - 4.2：文字（業者名・案件名・明細行の名称。`%`・`_`・`\` は文字として扱う）・見積日の期間・案件の有無・
 *   採否・読取の確認・改修／新営の絞り込み
 * - 4.3：要確認（参考の印のある明細行を 1 行以上持つ）
 * - 4.4：分類キーの無い行がある（直接工事・産廃で分類キーが空の行を 1 行以上持つ）
 * - 4.5：1 ページ 50 件と絞り込みの結果の総件数
 * - 4.6：詳細は見積の情報・カードの ID・原本のパス・すべての明細行を返す
 *
 * 共有の試験 DB には他の試験の受領見積書も残りうるため、一覧の試験は試験ごとの印（PREFIX）を
 * 文字の絞り込みに入れて対象を試験の見積に限る。
 *
 * Design: Components > LedgerQueryService、Testing Strategy
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、アプリとサービスのインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import tokenService from '../../services/token.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { seedPermissions, seedRolePermissions, seedRoles } from '../../utils/seed-helpers.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { LedgerImportService } from '../../services/unit-price-ledger/ledger-import.service.js';
import {
  LedgerQueryService,
  type LedgerQuotationSummary,
} from '../../services/unit-price-ledger/ledger-query.service.js';
import {
  LEDGER_PAGE_SIZE,
  ledgerListQuerySchema,
  type LedgerListQuery,
} from '../../schemas/unit-price-ledger.schema.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-upl25-query';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** 主な見積の印（文字の絞り込みでこの試験の見積だけにする） */
const PREFIX = `${MARK}-${RUN}`;
/** ページの試験の見積の印（PREFIX を含まない） */
const PAGE_PREFIX = `${MARK}-pg${RUN}`;
const ROLE_NAME = `${MARK}-${RUN}-reader`;
/** 版 4・変種 8 の整った UUID（どの行としても存在しない） */
const MISSING_ID = '00000000-0000-4000-8000-000000002500';

type LineSeed = Omit<Prisma.ReceivedQuotationLineItemCreateManyReceivedQuotationInput, 'sortOrder'>;

describe('台帳の一覧・絞り込み・詳細（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let service: LedgerQueryService;
  let userId: string;
  let projectId: string;
  let liveRequestId: string;
  let deletedRequestId: string;
  let tradingPartnerId: string;

  /** 主な見積の ID */
  const ids = {
    /** 案件の無い・採用・確認済み・改修・2026-03-10 */
    ledgerCard: '',
    /** 案件の受領見積書（見積依頼なし）・不採用・未確認・新営・2026-05-01・参考の行・分類キーの無い直接工事 */
    projectOnly: '',
    /** 見積依頼の受領見積書（見積依頼は生きている）・不明・2026-05-01（projectOnly より後に登録）・分類キーの無い産廃 */
    requested: '',
    /** 案件の無い・2026-01-05・名称に `%`・`_`・`\` を含む・分類キーの無い諸経費（対象外の区分） */
    wildcard: '',
    /** 案件の受領見積書・明細行なし（原本だけ）・2026-02-01 */
    fileOnly: '',
    /** 論理削除された受領見積書 */
    deleted: '',
    /** 論理削除された見積依頼の受領見積書 */
    underDeletedRequest: '',
  };

  /** 文字の絞り込みに試験の印を入れて一覧を引く */
  const list = (query: Partial<Record<keyof LedgerListQuery, unknown>> = {}) =>
    service.list(ledgerListQuerySchema.parse({ keyword: PREFIX, ...query }));

  const idsOf = (rows: LedgerQuotationSummary[]): string[] => rows.map((row) => row.id);

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
    service = new LedgerQueryService({ prisma });

    const user = await createTestUser(prisma, {
      email: `${PREFIX}-admin@example.com`,
      displayName: `${PREFIX}-admin`,
      passwordHash: 'not-used',
    });
    userId = user.id;
    const partner = await prisma.tradingPartner.create({
      data: {
        name: `${PREFIX}-partner`,
        nameKana: 'ダイチョウテスト',
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
    const live = await prisma.estimateRequest.create({
      data: { projectId, tradingPartnerId, name: `${PREFIX}-live-request` },
      select: { id: true },
    });
    liveRequestId = live.id;
    const deleted = await prisma.estimateRequest.create({
      data: {
        projectId,
        tradingPartnerId,
        name: `${PREFIX}-deleted-request`,
        deletedAt: new Date(),
      },
      select: { id: true },
    });
    deletedRequestId = deleted.id;

    ids.ledgerCard = await createQuotation(
      {
        vendorName: `${PREFIX}-業者A`,
        name: `${PREFIX}-業者A_2026-03-10`,
        submittedAt: new Date('2026-03-10'),
        quoteNumber: 'Q-001',
        overallConditions: '足場は別途',
        siteLocation: 'A市',
        constructionKind: 'RENOVATION',
        useType: '学校',
        constructionPrice: 12000000,
        workConditions: '夜間',
        distanceKm: 12.5,
        adoption: 'ADOPTED',
        confirmedAmount: 98765,
        readingStatus: 'CONFIRMED',
        readingConfirmedById: userId,
        readingConfirmedAt: new Date('2026-03-11T01:00:00Z'),
        ledgerCardId: `${PREFIX}-card-1`,
        ledgerSourcePath: `${PREFIX}/02_見積/01_業者A/見積書.pdf`,
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
          remarks: '備考1',
          category: 'DIRECT',
          condition: '1階',
          conversionQuantity: 2,
          conversionUnit: '箇所',
          conversionUnitPrice: 500,
          conversionBasis: '1箇所あたり',
          classificationKey: 'K-001',
          quantityRowKey: 'row-1',
        },
        { name: '別途の足場', amount: 500, category: 'EXCLUDED' },
        { name: '諸経費', amount: 100, category: 'OVERHEAD' },
      ]
    );
    ids.projectOnly = await createQuotation(
      {
        projectId,
        vendorName: `${MARK}-業者B`,
        name: `${MARK}-業者B見積`,
        submittedAt: new Date('2026-05-01'),
        constructionKind: 'NEW_CONSTRUCTION',
        adoption: 'REJECTED',
        createdAt: new Date('2026-05-02T00:00:00Z'),
      },
      [
        {
          name: 'ボード張り',
          amount: 2000.5,
          category: 'DIRECT',
          isReference: true,
          referenceReason: '金額が数量×単価と合わない',
        },
      ]
    );
    ids.requested = await createQuotation(
      {
        estimateRequestId: liveRequestId,
        projectId,
        vendorName: `${PREFIX}-業者C`,
        name: `${PREFIX}-業者C見積`,
        submittedAt: new Date('2026-05-01'),
        createdAt: new Date('2026-05-03T00:00:00Z'),
      },
      [
        { name: '産廃処分', amount: 300, category: 'WASTE' },
        { name: '本体工事', amount: 700, category: 'DIRECT', classificationKey: 'K-002' },
      ]
    );
    ids.wildcard = await createQuotation(
      {
        vendorName: `${MARK}-業者D`,
        name: `${MARK}-業者D見積`,
        submittedAt: new Date('2026-01-05'),
        ledgerCardId: `${PREFIX}-card-2`,
      },
      [
        {
          name: `${PREFIX}-100%特殊_名称 a\\b`,
          amount: 50,
          category: 'DIRECT',
          classificationKey: '',
        },
        { name: '諸経費', amount: 5, category: 'OVERHEAD' },
      ]
    );
    ids.fileOnly = await createQuotation({
      projectId,
      vendorName: `${PREFIX}-業者E`,
      name: `${PREFIX}-業者E見積`,
      submittedAt: new Date('2026-02-01'),
      filePath: `quotations/projects/${PREFIX}/e.pdf`,
      fileName: 'e.pdf',
      fileMimeType: 'application/pdf',
      fileSize: 10,
    });
    ids.deleted = await createQuotation(
      {
        vendorName: `${PREFIX}-削除済み業者`,
        name: `${PREFIX}-削除済み`,
        submittedAt: new Date('2026-06-01'),
        deletedAt: new Date(),
      },
      [{ name: '削除済みの行', amount: 1, category: 'DIRECT' }]
    );
    ids.underDeletedRequest = await createQuotation(
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
    await prisma.receivedQuotation.deleteMany({
      where: {
        OR: [
          { vendorName: { startsWith: MARK } },
          { ledgerCardId: { startsWith: MARK } },
          { projectId },
        ],
      },
    });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.tradingPartner.deleteMany({ where: { id: tradingPartnerId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  describe('一覧の対象と並び（1.1・1.3・4.1）', () => {
    /**
     * @requirement unit-price-ledger/REQ-1.1
     * @requirement unit-price-ledger/REQ-1.3
     * @requirement unit-price-ledger/REQ-4.1
     */
    it('見積依頼と案件の有無を問わず論理削除されていない見積を、見積日の新しい順（同じ日は登録の新しい順）に返す', async () => {
      const result = await list();

      expect(idsOf(result.data)).toEqual([
        ids.requested,
        ids.projectOnly,
        ids.ledgerCard,
        ids.fileOnly,
        ids.wildcard,
      ]);
      expect(result.pagination).toEqual({
        page: 1,
        limit: LEDGER_PAGE_SIZE,
        total: 5,
        totalPages: 1,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-1.3
     */
    it('論理削除された受領見積書と、論理削除された見積依頼の受領見積書を含めない', async () => {
      const result = await list({ keyword: `${PREFIX}-削除済み` });
      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });

    /**
     * @requirement unit-price-ledger/REQ-4.1
     */
    it('一覧の行は業者名・見積日・案件名・別途を除く合計・採否・読取の確認・参考の行の有無を持つ', async () => {
      const rows = (await list()).data;
      const byId = new Map(rows.map((row) => [row.id, row]));

      expect(byId.get(ids.ledgerCard)).toEqual<LedgerQuotationSummary>({
        id: ids.ledgerCard,
        name: `${PREFIX}-業者A_2026-03-10`,
        vendorName: `${PREFIX}-業者A`,
        submittedAt: new Date('2026-03-10'),
        projectId: null,
        estimateRequestId: null,
        projectName: `${PREFIX}-台帳案件X`,
        constructionKind: 'RENOVATION',
        totalAmount: 1100,
        adoption: 'ADOPTED',
        readingStatus: 'CONFIRMED',
        hasReferenceLines: false,
        ledgerCardId: `${PREFIX}-card-1`,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      // 案件の受領見積書の案件名は案件の名前
      expect(byId.get(ids.projectOnly)).toMatchObject({
        projectId,
        projectName: `${PREFIX}-本案件Y`,
        totalAmount: 2000.5,
        adoption: 'REJECTED',
        readingStatus: 'UNCONFIRMED',
        hasReferenceLines: true,
        ledgerCardId: null,
      });
      expect(byId.get(ids.requested)).toMatchObject({
        estimateRequestId: liveRequestId,
        projectName: `${PREFIX}-本案件Y`,
        totalAmount: 1000,
        adoption: 'UNKNOWN',
        hasReferenceLines: false,
      });
      // 明細行の無い見積の合計は null
      expect(byId.get(ids.fileOnly)?.totalAmount).toBeNull();
      expect(byId.get(ids.wildcard)?.projectName).toBeNull();
    });
  });

  describe('絞り込み（4.2〜4.4）', () => {
    /**
     * @requirement unit-price-ledger/REQ-4.2
     */
    it('文字は業者名・案件名（案件の名前と台帳の案件名）・明細行の名称の部分一致で、大文字と小文字を区別しない', async () => {
      expect(idsOf((await list({ keyword: `${PREFIX}-業者a` })).data)).toEqual([ids.ledgerCard]);
      expect(idsOf((await list({ keyword: `${PREFIX}-台帳案件` })).data)).toEqual([ids.ledgerCard]);
      expect(idsOf((await list({ keyword: `${PREFIX}-本案件` })).data)).toEqual([
        ids.requested,
        ids.projectOnly,
        ids.fileOnly,
      ]);
      expect(idsOf((await list({ keyword: `${PREFIX}-100%特殊` })).data)).toEqual([ids.wildcard]);
    });

    /**
     * @requirement unit-price-ledger/REQ-4.2
     */
    it('文字の `%`・`_`・`\\` は任意の文字の印ではなく文字として扱う', async () => {
      // 印として扱えば `${PREFIX}-業者A` などに当たる
      expect((await list({ keyword: `${PREFIX}%業者` })).data).toEqual([]);
      expect((await list({ keyword: `${PREFIX}_業者` })).data).toEqual([]);
      expect((await list({ keyword: `${PREFIX}-___%` })).data).toEqual([]);
      // 文字としてなら当たる
      expect(idsOf((await list({ keyword: '100%特殊_名称' })).data)).toEqual([ids.wildcard]);
      expect(idsOf((await list({ keyword: 'a\\b' })).data)).toEqual([ids.wildcard]);
    });

    /**
     * @requirement unit-price-ledger/REQ-4.2
     */
    it('見積日の期間（両端を含む）で絞り込む', async () => {
      expect(
        idsOf((await list({ submittedFrom: '2026-02-01', submittedTo: '2026-05-01' })).data)
      ).toEqual([ids.requested, ids.projectOnly, ids.ledgerCard, ids.fileOnly]);
      expect(idsOf((await list({ submittedFrom: '2026-03-11' })).data)).toEqual([
        ids.requested,
        ids.projectOnly,
      ]);
      expect(idsOf((await list({ submittedTo: '2026-01-05' })).data)).toEqual([ids.wildcard]);
    });

    /**
     * @requirement unit-price-ledger/REQ-4.2
     */
    it('案件の有無で絞り込む', async () => {
      expect(idsOf((await list({ hasProject: 'true' })).data)).toEqual([
        ids.requested,
        ids.projectOnly,
        ids.fileOnly,
      ]);
      expect(idsOf((await list({ hasProject: 'false' })).data)).toEqual([
        ids.ledgerCard,
        ids.wildcard,
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-4.2
     */
    it('採否・読取の確認・改修／新営で絞り込む', async () => {
      expect(idsOf((await list({ adoption: 'REJECTED' })).data)).toEqual([ids.projectOnly]);
      expect(idsOf((await list({ adoption: 'ADOPTED' })).data)).toEqual([ids.ledgerCard]);
      expect(idsOf((await list({ readingStatus: 'CONFIRMED' })).data)).toEqual([ids.ledgerCard]);
      expect(idsOf((await list({ readingStatus: 'UNCONFIRMED' })).data)).toEqual([
        ids.requested,
        ids.projectOnly,
        ids.fileOnly,
        ids.wildcard,
      ]);
      expect(idsOf((await list({ constructionKind: 'RENOVATION' })).data)).toEqual([
        ids.ledgerCard,
      ]);
      expect(idsOf((await list({ constructionKind: 'NEW_CONSTRUCTION' })).data)).toEqual([
        ids.projectOnly,
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-4.3
     */
    it('要確認は参考の印のある明細行を 1 行以上持つ見積だけを返し、外すと持たない見積だけを返す', async () => {
      expect(idsOf((await list({ needsReview: 'true' })).data)).toEqual([ids.projectOnly]);
      expect(idsOf((await list({ needsReview: 'false' })).data)).toEqual([
        ids.requested,
        ids.ledgerCard,
        ids.fileOnly,
        ids.wildcard,
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-4.4
     */
    it('分類キーの無い行があるは、直接工事・産廃で分類キーが空（無い・空の文字）の行を持つ見積だけを返す', async () => {
      // ledgerCard は直接工事に分類キーがあり、別途・諸経費の分類キーの無さは数えない
      expect(idsOf((await list({ missingClassificationKey: 'true' })).data)).toEqual([
        ids.requested,
        ids.projectOnly,
        ids.wildcard,
      ]);
      expect(idsOf((await list({ missingClassificationKey: 'false' })).data)).toEqual([
        ids.ledgerCard,
        ids.fileOnly,
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-4.2
     * @requirement unit-price-ledger/REQ-4.5
     */
    it('絞り込みは組み合わせられ、総件数は絞り込みの結果の件数になる', async () => {
      const result = await list({ hasProject: 'true', missingClassificationKey: 'true' });
      expect(idsOf(result.data)).toEqual([ids.requested, ids.projectOnly]);
      expect(result.pagination.total).toBe(2);
    });
  });

  describe('ページと総件数（4.5）', () => {
    const PAGE_COUNT = LEDGER_PAGE_SIZE + 1;

    beforeAll(async () => {
      await prisma.receivedQuotation.createMany({
        data: Array.from({ length: PAGE_COUNT }, (_, i) => ({
          vendorName: `${PAGE_PREFIX}-業者${String(i).padStart(3, '0')}`,
          name: `${PAGE_PREFIX}-${i}`,
          submittedAt: new Date(Date.UTC(2025, 0, 1 + i)),
        })),
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-4.5
     */
    it('1 ページ 50 件に分け、総件数とページの数を返す', async () => {
      const page1 = await service.list(ledgerListQuerySchema.parse({ keyword: PAGE_PREFIX }));
      const page2 = await service.list(
        ledgerListQuerySchema.parse({ keyword: PAGE_PREFIX, page: '2' })
      );
      const page3 = await service.list(
        ledgerListQuerySchema.parse({ keyword: PAGE_PREFIX, page: '3' })
      );

      expect(page1.data).toHaveLength(LEDGER_PAGE_SIZE);
      expect(page2.data).toHaveLength(1);
      expect(page3.data).toEqual([]);
      for (const page of [page1, page2, page3]) {
        expect(page.pagination.total).toBe(PAGE_COUNT);
        expect(page.pagination.totalPages).toBe(2);
        expect(page.pagination.limit).toBe(LEDGER_PAGE_SIZE);
      }
      expect(page2.pagination.page).toBe(2);
      // 見積日の新しい順で、最も古い見積が 2 ページ目に来る
      expect(page1.data[0]?.vendorName).toBe(`${PAGE_PREFIX}-業者050`);
      expect(page2.data[0]?.vendorName).toBe(`${PAGE_PREFIX}-業者000`);
      const all = new Set([...idsOf(page1.data), ...idsOf(page2.data)]);
      expect(all.size).toBe(PAGE_COUNT);
    });
  });

  describe('変更の反映（1.2）', () => {
    /**
     * @requirement unit-price-ledger/REQ-1.2
     */
    it('登録・編集・論理削除が、その後の一覧に反映される', async () => {
      const keyword = `${PREFIX}-反映`;
      const id = await createQuotation(
        {
          vendorName: `${keyword}-業者`,
          name: `${keyword}-見積`,
          submittedAt: new Date('2026-07-01'),
        },
        [{ name: '行', amount: 10, category: 'DIRECT', classificationKey: 'K' }]
      );
      expect(idsOf((await list({ keyword })).data)).toEqual([id]);

      await prisma.receivedQuotation.update({ where: { id }, data: { adoption: 'ADOPTED' } });
      expect((await list({ keyword, adoption: 'ADOPTED' })).data[0]?.adoption).toBe('ADOPTED');

      await prisma.receivedQuotation.update({ where: { id }, data: { deletedAt: new Date() } });
      expect((await list({ keyword })).data).toEqual([]);
    });
  });

  describe('詳細（4.6）', () => {
    /**
     * @requirement unit-price-ledger/REQ-4.6
     */
    it('見積の情報・カードの ID・原本のパス・案件名と、すべての明細行を表示順に返す', async () => {
      const detail = await service.findById(ids.ledgerCard);

      expect(detail).toMatchObject({
        id: ids.ledgerCard,
        estimateRequestId: null,
        projectId: null,
        projectName: `${PREFIX}-台帳案件X`,
        name: `${PREFIX}-業者A_2026-03-10`,
        vendorName: `${PREFIX}-業者A`,
        tradingPartnerId: null,
        submittedAt: new Date('2026-03-10'),
        quoteNumber: 'Q-001',
        overallConditions: '足場は別途',
        siteLocation: 'A市',
        constructionKind: 'RENOVATION',
        useType: '学校',
        constructionPrice: 12000000,
        workConditions: '夜間',
        distanceKm: 12.5,
        adoption: 'ADOPTED',
        confirmedAmount: 98765,
        readingStatus: 'CONFIRMED',
        readingConfirmedAt: new Date('2026-03-11T01:00:00Z'),
        readingConfirmedBy: { id: userId, displayName: `${PREFIX}-admin` },
        quoteDiscriminator: '',
        ledgerCardId: `${PREFIX}-card-1`,
        ledgerSourcePath: `${PREFIX}/02_見積/01_業者A/見積書.pdf`,
        ledgerProjectName: `${PREFIX}-台帳案件X`,
        fileName: null,
        totalAmount: 1100,
        hasReferenceLines: false,
      });
      expect(detail?.updatedAt).toBeInstanceOf(Date);
      expect(detail?.lineItems.map((line) => line.name)).toEqual([
        '軽量鉄骨天井下地',
        '別途の足場',
        '諸経費',
      ]);
      expect(detail?.lineItems[0]).toEqual({
        id: expect.any(String),
        receivedQuotationId: ids.ledgerCard,
        sortOrder: 0,
        customCategory: null,
        workType: null,
        name: '軽量鉄骨天井下地',
        specification: '@300',
        unit: '㎡',
        quantity: 100,
        unitPrice: 10,
        amount: 1000,
        remarks: '備考1',
        category: 'DIRECT',
        condition: '1階',
        conversion: { quantity: 2, unit: '箇所', unitPrice: 500, basis: '1箇所あたり' },
        classificationKey: 'K-001',
        quantityRowKey: 'row-1',
        isReference: false,
        referenceReason: null,
      });
      expect(detail?.lineItems[1]?.conversion).toBeNull();
    });

    /**
     * @requirement unit-price-ledger/REQ-4.6
     */
    it('案件の受領見積書の詳細は案件の名前と参考の印と理由を返す', async () => {
      const detail = await service.findById(ids.projectOnly);
      expect(detail).toMatchObject({
        projectId,
        projectName: `${PREFIX}-本案件Y`,
        ledgerCardId: null,
        ledgerSourcePath: null,
        hasReferenceLines: true,
      });
      expect(detail?.lineItems[0]).toMatchObject({
        isReference: true,
        referenceReason: '金額が数量×単価と合わない',
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-1.3
     */
    it('論理削除された見積・論理削除された見積依頼の見積・存在しない ID は null を返す', async () => {
      expect(await service.findById(ids.deleted)).toBeNull();
      expect(await service.findById(ids.underDeletedRequest)).toBeNull();
      expect(await service.findById(MISSING_ID)).toBeNull();
    });
  });

  describe('estimate-request の API に出ないこと（1.4 の回帰）', () => {
    const readerEmail = `${PREFIX}-reader@example.com`;
    let readerId: string;
    let token: string;
    let importedId: string;

    beforeAll(async () => {
      await seedRoles(prisma);
      await seedPermissions(prisma);
      await seedRolePermissions(prisma);
      const role = await prisma.role.create({
        data: { name: ROLE_NAME, description: 'unit-price-ledger タスク2.5 の検証用' },
      });
      const permissions = await prisma.permission.findMany({
        where: {
          OR: [
            { resource: 'estimate_request', action: 'read' },
            { resource: 'project', action: 'read_all' },
          ],
        },
      });
      expect(permissions, '前提の欠落: 見積依頼の閲覧と全案件閲覧の権限').toHaveLength(2);
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      });
      const reader = await createTestUser(prisma, {
        email: readerEmail,
        displayName: `${PREFIX}-reader`,
        passwordHash: 'not-used',
      });
      readerId = reader.id;
      await prisma.userRole.create({ data: { userId: readerId, roleId: role.id } });
      token = await tokenService.generateAccessToken({
        accessTokenGeneration: 0,
        userId: readerId,
        email: readerEmail,
        roles: [ROLE_NAME],
      });

      // 取り込みで案件の無い受領見積書を作る
      const cardId = `${PREFIX}-card-imported`;
      const importService = new LedgerImportService({
        prisma,
        auditLogService: new AuditLogService({ prisma }),
      });
      const card = {
        id: cardId,
        業者: `${PREFIX}-取り込み業者`,
        見積日: '2026-08-01',
        案件: { 名称: `${PREFIX}-取り込み案件` },
        原本: { パス: `${PREFIX}/imported.pdf` },
        行: [{ 名称: '取り込みの行', 数量: 1, 単位: '式', 単価: 100, 金額: 100 }],
        読取: { 確認: '済' },
      };
      const result = await importService.importCards(
        [
          {
            originalName: 'imported.json',
            buffer: Buffer.from(JSON.stringify(card), 'utf8'),
            mimeType: 'application/json',
          },
        ],
        userId
      );
      expect(result.importedCount, '前提: カードを取り込めた').toBe(1);
      const imported = await prisma.receivedQuotation.findFirstOrThrow({
        where: { ledgerCardId: cardId, deletedAt: null },
        select: { id: true },
      });
      importedId = imported.id;
    });

    afterAll(async () => {
      await getSharedRBACService().invalidateUserPermissionsCache(readerId);
      await deleteAuditLogsWithArchivePermission(prisma, {
        OR: [{ actorId: { in: [readerId, userId] } }, { targetId: importedId }],
      });
      await prisma.userRole.deleteMany({ where: { userId: readerId } });
      await prisma.user.deleteMany({ where: { id: readerId } });
      await prisma.rolePermission.deleteMany({ where: { role: { name: ROLE_NAME } } });
      await prisma.role.deleteMany({ where: { name: ROLE_NAME } });
    });

    const auth = (): [string, string] => ['Authorization', `Bearer ${token}`];

    /**
     * @requirement unit-price-ledger/REQ-1.4
     * @requirement unit-price-ledger/REQ-1.1
     */
    it('取り込んだ案件の無い受領見積書は台帳の一覧と詳細に出て、estimate-request の一覧・詳細の API には出ない', async () => {
      // 台帳には出る
      expect(idsOf((await list({ keyword: `${PREFIX}-取り込み` })).data)).toEqual([importedId]);
      expect((await service.findById(importedId))?.projectName).toBe(`${PREFIX}-取り込み案件`);

      // 受領見積書の詳細は、全案件閲覧の利用者にも存在しない ID と同じ 404
      const missing = await request(app)
        .get(`/api/quotations/${MISSING_ID}`)
        .set(...auth())
        .expect(404);
      const orphan = await request(app)
        .get(`/api/quotations/${importedId}`)
        .set(...auth())
        .expect(404);
      const { instance: _a, ...orphanBody } = orphan.body as Record<string, unknown>;
      const { instance: _b, ...missingBody } = missing.body as Record<string, unknown>;
      expect(orphanBody).toEqual(missingBody);
      expect(JSON.stringify(orphan.body)).not.toContain(`${PREFIX}-取り込み`);

      // 見積依頼の配下の一覧・詳細に出ない
      const requestList = await request(app)
        .get(`/api/estimate-requests/${liveRequestId}/quotations`)
        .set(...auth())
        .expect(200);
      const requestListIds = (requestList.body as Array<{ id: string }>).map((q) => q.id);
      expect(requestListIds).toContain(ids.requested);
      expect(requestListIds).not.toContain(importedId);
      await request(app)
        .get(`/api/estimate-requests/${liveRequestId}/quotations/${importedId}`)
        .set(...auth())
        .expect(404);

      // 案件の配下の一覧（既定と全件）に出ない
      for (const query of ['', '?include=all']) {
        const projectList = await request(app)
          .get(`/api/projects/${projectId}/quotations${query}`)
          .set(...auth())
          .expect(200);
        const projectListIds = (projectList.body as Array<{ id: string }>).map((q) => q.id);
        expect(projectListIds).toContain(ids.requested);
        expect(projectListIds).not.toContain(importedId);
      }
    });
  });
});
