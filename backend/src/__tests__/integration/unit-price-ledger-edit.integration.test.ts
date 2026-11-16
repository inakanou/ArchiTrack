/**
 * @fileoverview 案件の無い受領見積書の修正と削除（LedgerEditService）の統合試験（unit-price-ledger タスク2.6）
 *
 * テスト用の実データベースで、台帳の画面からの修正・削除を確かめる。
 *
 * 確かめること:
 * - 5.1：案件の無い受領見積書の業者名・見積日・見積の情報・案件名・原本のパスと、明細行の追加・削除・
 *   並べ替え・各欄の修正を保存する（業者名を変えたら取引先を照合し直す）
 * - 5.4：読取の確認を確認済みにしたとき、確認した利用者と日時を記録する。明細行を変えたときは
 *   estimate-request 46.8 と同じく未確認に戻す
 * - 5.5：案件の無い受領見積書を論理削除する。案件の受領見積書の全体の修正と削除は拒む
 * - 5.6：開いた後にほかの利用者が更新していたら、保存せずに排他の不一致にする（同時の保存でも 1 つだけ通す）
 * - 5.7：修正・削除を RECEIVED_QUOTATION_UPDATED / DELETED（source は unit_price_ledger）で記録し、
 *   工事価格・確定金額は変わったかどうかだけを記録する
 * - 5.2（タスク2.7）：案件の受領見積書は、読取の確認・明細行の参考の印と理由・分類キーだけを更新し、
 *   ほかの欄は変えず、読取の確認を戻さない。印を送らない理由は保存済みの印と照合する（46.5）。
 *   明細行だけの更新でも受領見積書の更新の日時を進め、排他の不一致と監査ログを確かめる（5.3・5.4・5.6・5.7）
 *
 * Design: Components > LedgerEditService、Error Handling、Testing Strategy
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import getPrismaClient from '../../db.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { LedgerEditService } from '../../services/unit-price-ledger/ledger-edit.service.js';
import { LedgerQueryService } from '../../services/unit-price-ledger/ledger-query.service.js';
import {
  ledgerMarksUpdateSchema,
  ledgerQuotationUpdateSchema,
  type LedgerMarksUpdateInput,
  type LedgerQuotationUpdateInput,
} from '../../schemas/unit-price-ledger.schema.js';
import { LINE_ITEM_VALIDATION_MESSAGES } from '../../schemas/received-quotation.schema.js';
import {
  LEDGER_CONFLICT_MESSAGE,
  LedgerConflictError,
  LedgerProjectQuotationReadOnlyError,
} from '../../errors/unitPriceLedgerError.js';
import { ReceivedQuotationNotFoundError } from '../../errors/receivedQuotationError.js';
import { ValidationError } from '../../errors/apiError.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-upl26-edit';
/** 見積に無い明細行を指定したときの文言（印の更新。タスク2.7） */
const LINE_ITEM_NOT_IN_QUOTATION_MESSAGE = '指定された明細行はこの見積にありません';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PREFIX = `${MARK}-${RUN}`;
/** 版 4・変種 8 の整った UUID（どの行としても存在しない） */
const MISSING_ID = '00000000-0000-4000-8000-000000002600';

type LineSeed = Omit<Prisma.ReceivedQuotationLineItemCreateManyReceivedQuotationInput, 'sortOrder'>;

describe('案件の無い受領見積書の修正と削除（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let service: LedgerEditService;
  let query: LedgerQueryService;
  let actorId: string;
  let otherUserId: string;
  let projectId: string;
  let tradingPartnerId: string;
  let requesterPartnerId: string;
  let deletedRequestId: string;
  let seq = 0;

  const nextMark = (label: string): string => {
    seq += 1;
    return `${PREFIX}-${label}-${seq}`;
  };

  const createQuotation = async (
    data: Omit<Prisma.ReceivedQuotationUncheckedCreateInput, 'lineItems'>,
    lines: LineSeed[] = []
  ) =>
    prisma.receivedQuotation.create({
      data: {
        ...data,
        lineItems: { createMany: { data: lines.map((line, i) => ({ ...line, sortOrder: i })) } },
      },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });

  /** 案件の無い受領見積書（取り込んだ見積の形）。確認済み・確認者は別の利用者 */
  const createLedgerQuotation = async (label: string) => {
    const mark = nextMark(label);
    return createQuotation(
      {
        vendorName: `${mark}-業者`,
        name: `${mark}-業者_2026-03-10`,
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
        readingConfirmedById: otherUserId,
        readingConfirmedAt: new Date('2026-03-11T01:00:00Z'),
        ledgerCardId: `${mark}-card`,
        ledgerSourcePath: `${mark}/02_見積/01_業者/見積書.pdf`,
        ledgerProjectName: `${mark}-台帳案件`,
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
          classificationKey: 'K-001',
        },
        { name: '諸経費', amount: 100, category: 'OVERHEAD' },
      ]
    );
  };

  type SeededQuotation = Awaited<ReturnType<typeof createLedgerQuotation>>;

  /** 保存済みの明細行を、そのまま送り直す明細行の入力にする */
  const sameLineItems = (quotation: SeededQuotation) =>
    quotation.lineItems.map((line) => ({
      name: line.name,
      sortOrder: line.sortOrder,
      specification: line.specification,
      unit: line.unit,
      quantity: line.quantity === null ? null : Number(line.quantity),
      unitPrice: line.unitPrice === null ? null : Number(line.unitPrice),
      amount: line.amount === null ? null : Number(line.amount),
      category: line.category,
      classificationKey: line.classificationKey,
    }));

  /** 保存済みの値をそのまま送る修正の本文（検証のスキーマを通す） */
  const buildInput = (
    quotation: SeededQuotation,
    overrides: Record<string, unknown> = {}
  ): LedgerQuotationUpdateInput =>
    ledgerQuotationUpdateSchema.parse({
      vendorName: quotation.vendorName,
      submittedAt: quotation.submittedAt.toISOString(),
      lineItems: sameLineItems(quotation),
      expectedUpdatedAt: quotation.updatedAt.toISOString(),
      ...overrides,
    });

  const logsOf = (targetId: string) =>
    prisma.auditLog.findMany({
      where: { targetType: 'ReceivedQuotation', targetId },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    prisma = getPrismaClient();
    service = new LedgerEditService({ prisma, auditLogService: new AuditLogService({ prisma }) });
    query = new LedgerQueryService({ prisma });

    const actor = await createTestUser(prisma, {
      email: `${PREFIX}-admin@example.com`,
      displayName: `${PREFIX}-admin`,
      passwordHash: 'not-used',
    });
    actorId = actor.id;
    const other = await createTestUser(prisma, {
      email: `${PREFIX}-other@example.com`,
      displayName: `${PREFIX}-other`,
      passwordHash: 'not-used',
    });
    otherUserId = other.id;

    const partner = await prisma.tradingPartner.create({
      data: {
        name: `${PREFIX}-照合業者`,
        nameKana: 'ダイチョウテスト',
        address: '東京都千代田区1-1-1',
        types: { create: [{ type: 'SUBCONTRACTOR' }] },
      },
    });
    tradingPartnerId = partner.id;
    const requester = await prisma.tradingPartner.create({
      data: {
        name: `${PREFIX}-顧客`,
        nameKana: 'ダイチョウテストコキャク',
        address: '東京都千代田区1-1-2',
        types: { create: [{ type: 'CUSTOMER' }] },
      },
    });
    requesterPartnerId = requester.id;
    const project = await prisma.project.create({
      data: { name: `${PREFIX}-案件`, salesPersonId: actorId, createdById: actorId },
      select: { id: true },
    });
    projectId = project.id;
    const deletedRequest = await prisma.estimateRequest.create({
      data: {
        projectId,
        tradingPartnerId,
        name: `${PREFIX}-deleted-request`,
        deletedAt: new Date(),
      },
      select: { id: true },
    });
    deletedRequestId = deletedRequest.id;
  });

  afterAll(async () => {
    await prisma.receivedQuotation.deleteMany({
      where: { OR: [{ vendorName: { startsWith: MARK } }, { projectId }] },
    });
    await prisma.estimateRequest.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.tradingPartner.deleteMany({
      where: { id: { in: [tradingPartnerId, requesterPartnerId] } },
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: MARK } } });
  });

  describe('修正（5.1）', () => {
    /**
     * @requirement unit-price-ledger/REQ-5.1
     */
    it('業者名・見積日・見積の情報・案件名・原本のパスと、明細行の追加・削除・並べ替え・修正を保存し、詳細を返す', async () => {
      const seeded = await createLedgerQuotation('update');
      const vendorName = `${PREFIX}-直した業者-${seq}`;

      const detail = await service.updateQuotation(
        seeded.id,
        buildInput(seeded, {
          vendorName,
          submittedAt: '2026-04-02T00:00:00.000Z',
          quoteNumber: 'Q-999',
          overallConditions: null,
          siteLocation: 'B市',
          constructionKind: 'NEW_CONSTRUCTION',
          useType: '庁舎',
          constructionPrice: 15000000,
          workConditions: '昼間',
          distanceKm: 3.5,
          adoption: 'REJECTED',
          confirmedAmount: null,
          ledgerProjectName: '  直した台帳案件  ',
          ledgerSourcePath: 'X/02_見積/直した見積書.pdf',
          lineItems: [
            // 2 行目だった諸経費を先頭へ並べ替え、金額を直す
            { name: '諸経費', sortOrder: 0, amount: 200, category: 'OVERHEAD' },
            // 新しい行（金額が無く数量と単価があれば数量×単価を求める）
            {
              name: '追加の行',
              sortOrder: 1,
              unit: '式',
              quantity: 3,
              unitPrice: 250,
              amount: null,
              category: 'DIRECT',
              classificationKey: 'K-NEW',
              conversion: { quantity: 2, unit: '箇所', unitPrice: 375, basis: '1箇所あたり' },
            },
            // 軽量鉄骨天井下地の行は削除する
          ],
        }),
        actorId
      );

      const row = await prisma.receivedQuotation.findUniqueOrThrow({
        where: { id: seeded.id },
        include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
      });
      expect(row.vendorName).toBe(vendorName);
      expect(row.submittedAt.toISOString().slice(0, 10)).toBe('2026-04-02');
      expect(row.quoteNumber).toBe('Q-999');
      expect(row.overallConditions).toBeNull();
      expect(row.siteLocation).toBe('B市');
      expect(row.constructionKind).toBe('NEW_CONSTRUCTION');
      expect(row.useType).toBe('庁舎');
      expect(Number(row.constructionPrice)).toBe(15000000);
      expect(row.workConditions).toBe('昼間');
      expect(Number(row.distanceKm)).toBe(3.5);
      expect(row.adoption).toBe('REJECTED');
      expect(row.confirmedAmount).toBeNull();
      expect(row.ledgerProjectName).toBe('直した台帳案件');
      expect(row.ledgerSourcePath).toBe('X/02_見積/直した見積書.pdf');
      // 文脈とカードの ID は変えない
      expect(row.projectId).toBeNull();
      expect(row.estimateRequestId).toBeNull();
      expect(row.ledgerCardId).toBe(seeded.ledgerCardId);
      expect(row.updatedAt.getTime()).toBeGreaterThan(seeded.updatedAt.getTime());

      expect(row.lineItems.map((line) => line.name)).toEqual(['諸経費', '追加の行']);
      expect(Number(row.lineItems[0]!.amount)).toBe(200);
      expect(row.lineItems[0]!.category).toBe('OVERHEAD');
      expect(Number(row.lineItems[1]!.amount)).toBe(750);
      expect(row.lineItems[1]!.classificationKey).toBe('K-NEW');
      expect(row.lineItems[1]!.conversionUnit).toBe('箇所');
      expect(Number(row.lineItems[1]!.conversionUnitPrice)).toBe(375);

      // 返す詳細は台帳の詳細（保存後の値）
      expect(detail).toEqual(await query.findById(seeded.id));
      expect(detail.projectName).toBe('直した台帳案件');
      expect(detail.totalAmount).toBe(950);
      expect(detail.updatedAt.getTime()).toBe(row.updatedAt.getTime());
    });

    /**
     * @requirement unit-price-ledger/REQ-5.1
     */
    it('送らない見積の情報・案件名・原本のパスは変えない', async () => {
      const seeded = await createLedgerQuotation('partial');

      await service.updateQuotation(seeded.id, buildInput(seeded), actorId);

      const row = await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: seeded.id } });
      expect(row.quoteNumber).toBe('Q-001');
      expect(row.overallConditions).toBe('足場は別途');
      expect(Number(row.constructionPrice)).toBe(12000000);
      expect(Number(row.confirmedAmount)).toBe(98765);
      expect(row.adoption).toBe('ADOPTED');
      expect(row.ledgerProjectName).toBe(seeded.ledgerProjectName);
      expect(row.ledgerSourcePath).toBe(seeded.ledgerSourcePath);
    });

    /**
     * @requirement unit-price-ledger/REQ-5.1
     */
    it('業者名を変えたら、名前の一致する協力業者が 1 件のときに取引先を紐づける', async () => {
      const seeded = await createLedgerQuotation('vendor');

      await service.updateQuotation(
        seeded.id,
        buildInput(seeded, { vendorName: `${PREFIX}-照合業者` }),
        actorId
      );

      const row = await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: seeded.id } });
      expect(row.vendorName).toBe(`${PREFIX}-照合業者`);
      expect(row.tradingPartnerId).toBe(tradingPartnerId);
    });

    /**
     * @requirement unit-price-ledger/REQ-5.1
     */
    it('協力業者でない取引先を選んだ修正は拒み、何も変えない', async () => {
      const seeded = await createLedgerQuotation('not-sub');

      await expect(
        service.updateQuotation(
          seeded.id,
          buildInput(seeded, { tradingPartnerId: requesterPartnerId, siteLocation: 'Z市' }),
          actorId
        )
      ).rejects.toBeInstanceOf(ValidationError);

      const row = await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: seeded.id } });
      expect(row.siteLocation).toBe('A市');
      expect(row.updatedAt.getTime()).toBe(seeded.updatedAt.getTime());
      expect(await logsOf(seeded.id)).toHaveLength(0);
    });
  });

  describe('読取の確認（5.4・46.8）', () => {
    /**
     * @requirement unit-price-ledger/REQ-5.4
     */
    it('未確認を確認済みにしたとき、確認者は操作した利用者、日時は保存の時とする', async () => {
      const seeded = await createLedgerQuotation('confirm');
      await prisma.receivedQuotation.update({
        where: { id: seeded.id },
        data: {
          readingStatus: 'UNCONFIRMED',
          readingConfirmedById: null,
          readingConfirmedAt: null,
        },
      });
      const unconfirmed = await prisma.receivedQuotation.findUniqueOrThrow({
        where: { id: seeded.id },
        include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
      });
      const before = Date.now();

      const detail = await service.updateQuotation(
        seeded.id,
        buildInput(unconfirmed, { readingStatus: 'CONFIRMED' }),
        actorId
      );

      const row = await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: seeded.id } });
      expect(row.readingStatus).toBe('CONFIRMED');
      expect(row.readingConfirmedById).toBe(actorId);
      expect(row.readingConfirmedAt).not.toBeNull();
      expect(row.readingConfirmedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(row.readingConfirmedAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
      expect(detail.readingConfirmedBy).toEqual({ id: actorId, displayName: `${PREFIX}-admin` });
    });

    /**
     * @requirement unit-price-ledger/REQ-5.4
     */
    it('確認済みの見積の明細行を変えたら、未確認に戻し確認者と日時を消す（確認済みを送っても戻す）', async () => {
      const seeded = await createLedgerQuotation('reset');
      const lines = sameLineItems(seeded);
      lines[0] = { ...lines[0]!, unitPrice: 12, amount: 1200 };

      await service.updateQuotation(
        seeded.id,
        buildInput(seeded, { lineItems: lines, readingStatus: 'CONFIRMED' }),
        actorId
      );

      const row = await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: seeded.id } });
      expect(row.readingStatus).toBe('UNCONFIRMED');
      expect(row.readingConfirmedById).toBeNull();
      expect(row.readingConfirmedAt).toBeNull();
    });

    /**
     * @requirement unit-price-ledger/REQ-5.4
     */
    it('明細行を変えない修正では、確認済みと確認者・日時を保つ', async () => {
      const seeded = await createLedgerQuotation('keep');

      await service.updateQuotation(
        seeded.id,
        buildInput(seeded, { siteLocation: 'C市', readingStatus: 'CONFIRMED' }),
        actorId
      );

      const row = await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: seeded.id } });
      expect(row.siteLocation).toBe('C市');
      expect(row.readingStatus).toBe('CONFIRMED');
      expect(row.readingConfirmedById).toBe(otherUserId);
      expect(row.readingConfirmedAt!.toISOString()).toBe('2026-03-11T01:00:00.000Z');
    });

    /**
     * @requirement unit-price-ledger/REQ-5.4
     */
    it('未確認を送ったら、確認者と日時を消す', async () => {
      const seeded = await createLedgerQuotation('unconfirm');

      await service.updateQuotation(
        seeded.id,
        buildInput(seeded, { readingStatus: 'UNCONFIRMED' }),
        actorId
      );

      const row = await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: seeded.id } });
      expect(row.readingStatus).toBe('UNCONFIRMED');
      expect(row.readingConfirmedById).toBeNull();
      expect(row.readingConfirmedAt).toBeNull();
    });
  });

  describe('排他の不一致（5.6）', () => {
    /**
     * @requirement unit-price-ledger/REQ-5.6
     */
    it('開いた後にほかの利用者が更新していたら、修正を保存せずに排他の不一致にする', async () => {
      const seeded = await createLedgerQuotation('conflict');
      const stale = buildInput(seeded, { siteLocation: '古い画面の値' });
      await prisma.receivedQuotation.update({
        where: { id: seeded.id },
        data: { siteLocation: 'ほかの利用者の値' },
      });

      const error = await service.updateQuotation(seeded.id, stale, actorId).catch((e) => e);

      expect(error).toBeInstanceOf(LedgerConflictError);
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('LEDGER_CONFLICT');
      expect(error.message).toBe(LEDGER_CONFLICT_MESSAGE);
      expect(error.message).toBe('ほかの利用者が更新しました。最新の内容を読み込み直してください');
      const row = await prisma.receivedQuotation.findUniqueOrThrow({
        where: { id: seeded.id },
        include: { lineItems: true },
      });
      expect(row.siteLocation).toBe('ほかの利用者の値');
      expect(row.lineItems).toHaveLength(2);
      expect(await logsOf(seeded.id)).toHaveLength(0);
    });

    /**
     * @requirement unit-price-ledger/REQ-5.6
     */
    it('同じ版から同時に保存したら、1 つだけを保存し、ほかは排他の不一致にする', async () => {
      const seeded = await createLedgerQuotation('race');
      const attempts = ['同時A', '同時B', '同時C'].map((siteLocation) =>
        service.updateQuotation(
          seeded.id,
          buildInput(seeded, {
            siteLocation,
            lineItems: [{ name: siteLocation, sortOrder: 0, amount: 1, category: 'DIRECT' }],
          }),
          actorId
        )
      );

      const results = await Promise.allSettled(attempts);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(2);
      for (const r of rejected) {
        expect(r.reason).toBeInstanceOf(LedgerConflictError);
      }
      const row = await prisma.receivedQuotation.findUniqueOrThrow({
        where: { id: seeded.id },
        include: { lineItems: true },
      });
      // 保存した 1 つの本体と明細行だけが残る（混ざらない）
      expect(row.lineItems).toHaveLength(1);
      expect(row.lineItems[0]!.name).toBe(row.siteLocation);
      expect(await logsOf(seeded.id)).toHaveLength(1);
    });

    /**
     * @requirement unit-price-ledger/REQ-5.6
     */
    it('開いた後にほかの利用者が更新していたら、削除せずに排他の不一致にする', async () => {
      const seeded = await createLedgerQuotation('conflict-del');
      await prisma.receivedQuotation.update({
        where: { id: seeded.id },
        data: { siteLocation: 'ほかの利用者の値' },
      });

      await expect(service.deleteQuotation(seeded.id, seeded.updatedAt, actorId)).rejects.toThrow(
        LedgerConflictError
      );

      const row = await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: seeded.id } });
      expect(row.deletedAt).toBeNull();
      expect(await logsOf(seeded.id)).toHaveLength(0);
    });
  });

  describe('削除（5.5）', () => {
    /**
     * @requirement unit-price-ledger/REQ-5.5
     */
    it('案件の無い受領見積書を論理削除し、台帳の詳細に出さなくする', async () => {
      const seeded = await createLedgerQuotation('delete');

      await service.deleteQuotation(seeded.id, seeded.updatedAt, actorId);

      const row = await prisma.receivedQuotation.findUniqueOrThrow({
        where: { id: seeded.id },
        include: { lineItems: true },
      });
      expect(row.deletedAt).not.toBeNull();
      // 論理削除のため行と明細行は残す
      expect(row.lineItems).toHaveLength(2);
      expect(await query.findById(seeded.id)).toBeNull();
    });

    /**
     * @requirement unit-price-ledger/REQ-5.5
     */
    it('論理削除済みの見積の修正・削除は、見積が無いとして拒む', async () => {
      const seeded = await createLedgerQuotation('deleted');
      await service.deleteQuotation(seeded.id, seeded.updatedAt, actorId);
      const deleted = await prisma.receivedQuotation.findUniqueOrThrow({
        where: { id: seeded.id },
        include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
      });

      await expect(
        service.updateQuotation(seeded.id, buildInput(deleted), actorId)
      ).rejects.toBeInstanceOf(ReceivedQuotationNotFoundError);
      await expect(
        service.deleteQuotation(seeded.id, deleted.updatedAt, actorId)
      ).rejects.toBeInstanceOf(ReceivedQuotationNotFoundError);
      await expect(
        service.deleteQuotation(MISSING_ID, deleted.updatedAt, actorId)
      ).rejects.toBeInstanceOf(ReceivedQuotationNotFoundError);
    });
  });

  describe('案件の受領見積書の拒否（5.2・5.5）', () => {
    /**
     * @requirement unit-price-ledger/REQ-5.5
     */
    it('案件の受領見積書の全体の修正と削除は拒み、何も変えない', async () => {
      const mark = nextMark('project');
      const seeded = await createQuotation(
        {
          projectId,
          vendorName: `${mark}-業者`,
          name: `${mark}-見積`,
          submittedAt: new Date('2026-05-01'),
          siteLocation: 'P市',
        },
        [{ name: '案件の行', amount: 100, category: 'DIRECT' }]
      );

      const updateError = await service
        .updateQuotation(seeded.id, buildInput(seeded, { siteLocation: 'Q市' }), actorId)
        .catch((e) => e);
      expect(updateError).toBeInstanceOf(LedgerProjectQuotationReadOnlyError);
      expect(updateError.statusCode).toBe(409);
      expect(updateError.code).toBe('LEDGER_PROJECT_QUOTATION_READ_ONLY');
      expect(updateError.details).toEqual({ quotationId: seeded.id, operation: 'update' });

      const deleteError = await service
        .deleteQuotation(seeded.id, seeded.updatedAt, actorId)
        .catch((e) => e);
      expect(deleteError).toBeInstanceOf(LedgerProjectQuotationReadOnlyError);
      expect(deleteError.details).toEqual({ quotationId: seeded.id, operation: 'delete' });

      const row = await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: seeded.id } });
      expect(row.siteLocation).toBe('P市');
      expect(row.deletedAt).toBeNull();
      expect(row.updatedAt.getTime()).toBe(seeded.updatedAt.getTime());
      expect(await logsOf(seeded.id)).toHaveLength(0);
    });

    /**
     * @requirement unit-price-ledger/REQ-5.5
     */
    it('論理削除された見積依頼の受領見積書は、台帳に無い見積として拒む', async () => {
      const mark = nextMark('deleted-request');
      const seeded = await createQuotation(
        {
          projectId,
          estimateRequestId: deletedRequestId,
          vendorName: `${mark}-業者`,
          name: `${mark}-見積`,
          submittedAt: new Date('2026-05-01'),
        },
        [{ name: '行', amount: 100, category: 'DIRECT' }]
      );

      await expect(
        service.updateQuotation(seeded.id, buildInput(seeded), actorId)
      ).rejects.toBeInstanceOf(ReceivedQuotationNotFoundError);
      await expect(
        service.deleteQuotation(seeded.id, seeded.updatedAt, actorId)
      ).rejects.toBeInstanceOf(ReceivedQuotationNotFoundError);
    });
  });

  describe('監査ログ（5.7）', () => {
    /**
     * @requirement unit-price-ledger/REQ-5.7
     */
    it('修正を RECEIVED_QUOTATION_UPDATED（source unit_price_ledger）で記録し、工事価格・確定金額は変わったかどうかだけを入れる', async () => {
      const seeded = await createLedgerQuotation('audit-update');

      await service.updateQuotation(
        seeded.id,
        buildInput(seeded, {
          siteLocation: 'D市',
          constructionPrice: 13000000,
          confirmedAmount: 98765,
          ledgerProjectName: '監査の案件名',
          ledgerSourcePath: 'Y/02_見積/監査の原本.pdf',
        }),
        actorId
      );

      const logs = await logsOf(seeded.id);
      expect(logs).toHaveLength(1);
      const log = logs[0]!;
      expect(log.action).toBe('RECEIVED_QUOTATION_UPDATED');
      expect(log.actorId).toBe(actorId);
      expect(log.metadata).toEqual({ source: 'unit_price_ledger' });
      expect(log.before).toMatchObject({
        vendorName: seeded.vendorName,
        siteLocation: 'A市',
        readingStatus: 'CONFIRMED',
        ledgerProjectName: seeded.ledgerProjectName,
      });
      expect(log.after).toMatchObject({
        vendorName: seeded.vendorName,
        siteLocation: 'D市',
        ledgerProjectName: '監査の案件名',
        constructionPriceChanged: true,
        confirmedAmountChanged: false,
      });
      const serialized = JSON.stringify([log.before, log.after]);
      expect(serialized).not.toContain('12000000');
      expect(serialized).not.toContain('13000000');
      expect(serialized).not.toContain('98765');
      expect(serialized).not.toContain('原本.pdf');
      expect(serialized).not.toContain('見積書.pdf');
      expect(serialized).not.toMatch(/"constructionPrice"|"confirmedAmount"|ledgerSourcePath/);
    });

    /**
     * @requirement unit-price-ledger/REQ-5.7
     */
    it('確定金額を消したら confirmedAmountChanged を true、工事価格を送り直しただけなら false とする', async () => {
      const seeded = await createLedgerQuotation('audit-amount');

      await service.updateQuotation(
        seeded.id,
        buildInput(seeded, { constructionPrice: 12000000, confirmedAmount: null }),
        actorId
      );

      const [log] = await logsOf(seeded.id);
      expect(log!.after).toMatchObject({
        constructionPriceChanged: false,
        confirmedAmountChanged: true,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-5.7
     */
    it('削除を RECEIVED_QUOTATION_DELETED（source unit_price_ledger）で記録し、金額と原本のパスを入れない', async () => {
      const seeded = await createLedgerQuotation('audit-delete');

      await service.deleteQuotation(seeded.id, seeded.updatedAt, actorId);

      const logs = await logsOf(seeded.id);
      expect(logs).toHaveLength(1);
      const log = logs[0]!;
      expect(log.action).toBe('RECEIVED_QUOTATION_DELETED');
      expect(log.actorId).toBe(actorId);
      expect(log.metadata).toEqual({ source: 'unit_price_ledger' });
      expect(log.after).toBeNull();
      expect(log.before).toMatchObject({
        estimateRequestId: null,
        name: seeded.name,
        vendorName: seeded.vendorName,
        ledgerCardId: seeded.ledgerCardId,
        ledgerProjectName: seeded.ledgerProjectName,
      });
      const serialized = JSON.stringify(log.before);
      expect(serialized).not.toContain('12000000');
      expect(serialized).not.toContain('98765');
      expect(serialized).not.toContain('見積書.pdf');
    });
  });

  describe('印の更新（5.2・5.3・5.4・5.6・5.7）', () => {
    /** 案件の受領見積書（確認済み・確認者は別の利用者）。明細行は 3 行 */
    const createProjectQuotation = async (label: string) => {
      const mark = nextMark(label);
      return createQuotation(
        {
          projectId,
          vendorName: `${mark}-業者`,
          name: `${mark}-見積`,
          submittedAt: new Date('2026-06-01'),
          quoteNumber: 'P-001',
          siteLocation: 'P市',
          constructionPrice: 7654321,
          confirmedAmount: 4321000,
          readingStatus: 'CONFIRMED',
          readingConfirmedById: otherUserId,
          readingConfirmedAt: new Date('2026-06-02T03:00:00Z'),
        },
        [
          {
            name: '案件の天井下地',
            specification: '@300',
            unit: '㎡',
            quantity: 120,
            unitPrice: 3456,
            amount: 414720,
            category: 'DIRECT',
            classificationKey: 'K-OLD',
          },
          {
            name: '案件の参考行',
            unit: '式',
            quantity: 1,
            unitPrice: 55555,
            amount: 55555,
            category: 'DIRECT',
            isReference: true,
            referenceReason: '元の理由',
          },
          { name: '案件の諸経費', amount: 77777, category: 'OVERHEAD' },
        ]
      );
    };

    type ProjectQuotation = Awaited<ReturnType<typeof createProjectQuotation>>;

    /** 印の更新の本文（検証のスキーマを通す） */
    const buildMarks = (
      quotation: { updatedAt: Date },
      body: Record<string, unknown>
    ): LedgerMarksUpdateInput =>
      ledgerMarksUpdateSchema.parse({
        expectedUpdatedAt: quotation.updatedAt.toISOString(),
        lineItems: [],
        ...body,
      });

    const reload = (id: string) =>
      prisma.receivedQuotation.findUniqueOrThrow({
        where: { id },
        include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
      });

    /** 印の欄（参考の印と理由・分類キー）を除いた明細行 */
    const withoutMarks = (lines: ProjectQuotation['lineItems']) =>
      lines.map(
        ({
          isReference: _isReference,
          referenceReason: _referenceReason,
          classificationKey: _classificationKey,
          ...rest
        }) => rest
      );

    /** 印の欄に関わらない見積の欄 */
    const unmarkedFields = (q: ProjectQuotation) => ({
      vendorName: q.vendorName,
      name: q.name,
      submittedAt: q.submittedAt.toISOString(),
      quoteNumber: q.quoteNumber,
      siteLocation: q.siteLocation,
      constructionPrice: q.constructionPrice === null ? null : Number(q.constructionPrice),
      confirmedAmount: q.confirmedAmount === null ? null : Number(q.confirmedAmount),
      projectId: q.projectId,
      tradingPartnerId: q.tradingPartnerId,
      deletedAt: q.deletedAt,
    });

    /**
     * @requirement unit-price-ledger/REQ-5.2
     * @requirement unit-price-ledger/REQ-5.3
     */
    it('案件の受領見積書の参考の印と理由・分類キーを更新し、ほかの欄は変えず、読取の確認を戻さない', async () => {
      const seeded = await createProjectQuotation('marks');
      const [first, second, third] = seeded.lineItems;

      const detail = await service.updateMarks(
        seeded.id,
        buildMarks(seeded, {
          lineItems: [
            {
              id: first!.id,
              isReference: true,
              referenceReason: '数量が少ない',
              classificationKey: 'K-NEW-001',
            },
            { id: second!.id, classificationKey: '' },
            { id: third!.id, classificationKey: 'X'.repeat(50) },
          ],
        }),
        actorId
      );

      const row = await reload(seeded.id);
      expect(
        row.lineItems.map((l) => [l.isReference, l.referenceReason, l.classificationKey])
      ).toEqual([
        [true, '数量が少ない', 'K-NEW-001'],
        // 送らない印と理由は保つ。空の分類キーは消す
        [true, '元の理由', null],
        [false, null, 'X'.repeat(50)],
      ]);
      // 明細行のほかの欄（名称・数量・単価・金額・並び・区分など）は変えない
      expect(withoutMarks(row.lineItems)).toEqual(withoutMarks(seeded.lineItems));
      // 見積のほかの欄も変えない
      expect(unmarkedFields(row)).toEqual(unmarkedFields(seeded));
      // 印の更新は 46.8 の明細行の変更に当たらず、確認済みと確認者・日時を保つ
      expect(row.readingStatus).toBe('CONFIRMED');
      expect(row.readingConfirmedById).toBe(otherUserId);
      expect(row.readingConfirmedAt!.toISOString()).toBe('2026-06-02T03:00:00.000Z');

      expect(detail.id).toBe(seeded.id);
      expect(detail.readingStatus).toBe('CONFIRMED');
      expect(detail.lineItems).toHaveLength(3);
      expect(detail.updatedAt.getTime()).toBe(row.updatedAt.getTime());
    });

    /**
     * @requirement unit-price-ledger/REQ-5.2
     * @requirement unit-price-ledger/REQ-5.6
     */
    it('明細行の印だけを変える更新でも見積の更新の日時を進め、古い版からの更新を排他の不一致にする', async () => {
      const seeded = await createProjectQuotation('marks-version');

      await service.updateMarks(
        seeded.id,
        buildMarks(seeded, {
          lineItems: [{ id: seeded.lineItems[0]!.id, classificationKey: 'K-V1' }],
        }),
        actorId
      );

      const row = await reload(seeded.id);
      expect(row.updatedAt.getTime()).toBeGreaterThan(seeded.updatedAt.getTime());

      const error = await service
        .updateMarks(
          seeded.id,
          buildMarks(seeded, {
            lineItems: [{ id: seeded.lineItems[0]!.id, classificationKey: 'K-V2' }],
          }),
          actorId
        )
        .catch((e) => e);
      expect(error).toBeInstanceOf(LedgerConflictError);
      expect((await reload(seeded.id)).lineItems[0]!.classificationKey).toBe('K-V1');
    });

    /**
     * @requirement unit-price-ledger/REQ-5.4
     */
    it('未確認を確認済みにしたとき確認者と日時を記録し、読取の確認を送らなければ変えない', async () => {
      const seeded = await createProjectQuotation('marks-confirm');
      await prisma.receivedQuotation.update({
        where: { id: seeded.id },
        data: {
          readingStatus: 'UNCONFIRMED',
          readingConfirmedById: null,
          readingConfirmedAt: null,
        },
      });
      const unconfirmed = await reload(seeded.id);
      const before = Date.now();

      const detail = await service.updateMarks(
        seeded.id,
        buildMarks(unconfirmed, {
          readingStatus: 'CONFIRMED',
          lineItems: [{ id: seeded.lineItems[0]!.id, isReference: true }],
        }),
        actorId
      );

      const row = await reload(seeded.id);
      expect(row.readingStatus).toBe('CONFIRMED');
      expect(row.readingConfirmedById).toBe(actorId);
      expect(row.readingConfirmedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(row.readingConfirmedAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
      expect(detail.readingConfirmedBy).toEqual({ id: actorId, displayName: `${PREFIX}-admin` });

      // 読取の確認を送らない印の更新では、確認者と日時を変えない
      await service.updateMarks(
        seeded.id,
        buildMarks(row, { lineItems: [{ id: seeded.lineItems[0]!.id, isReference: false }] }),
        otherUserId
      );
      const after = await reload(seeded.id);
      expect(after.readingStatus).toBe('CONFIRMED');
      expect(after.readingConfirmedById).toBe(actorId);
      expect(after.readingConfirmedAt!.getTime()).toBe(row.readingConfirmedAt!.getTime());
    });

    /**
     * @requirement unit-price-ledger/REQ-5.4
     */
    it('未確認を送ったら確認者と日時を消す', async () => {
      const seeded = await createProjectQuotation('marks-unconfirm');

      await service.updateMarks(
        seeded.id,
        buildMarks(seeded, { readingStatus: 'UNCONFIRMED' }),
        actorId
      );

      const row = await reload(seeded.id);
      expect(row.readingStatus).toBe('UNCONFIRMED');
      expect(row.readingConfirmedById).toBeNull();
      expect(row.readingConfirmedAt).toBeNull();
    });

    /**
     * @requirement unit-price-ledger/REQ-5.2
     */
    it('参考の印を外したとき、理由を送らなければ保存済みの理由を消す', async () => {
      const seeded = await createProjectQuotation('marks-unref');

      await service.updateMarks(
        seeded.id,
        buildMarks(seeded, { lineItems: [{ id: seeded.lineItems[1]!.id, isReference: false }] }),
        actorId
      );

      const line = (await reload(seeded.id)).lineItems[1]!;
      expect(line.isReference).toBe(false);
      expect(line.referenceReason).toBeNull();
    });

    /**
     * @requirement unit-price-ledger/REQ-5.2
     */
    it('印を送らずに理由だけを送ったとき、保存済みの印が無なら拒み、何も変えない（46.5）', async () => {
      const seeded = await createProjectQuotation('marks-reason-only');

      const error = await service
        .updateMarks(
          seeded.id,
          buildMarks(seeded, {
            readingStatus: 'UNCONFIRMED',
            lineItems: [
              { id: seeded.lineItems[1]!.id, referenceReason: '印のある行の理由' },
              { id: seeded.lineItems[0]!.id, referenceReason: '印の無い行の理由' },
            ],
          }),
          actorId
        )
        .catch((e) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe(LINE_ITEM_VALIDATION_MESSAGES.REFERENCE_REASON_WITHOUT_REFERENCE);
      expect(error.message).toBe('参考の理由は参考の印を付けた行にだけ入力できます');
      const row = await reload(seeded.id);
      expect(row.lineItems[0]!.referenceReason).toBeNull();
      expect(row.lineItems[1]!.referenceReason).toBe('元の理由');
      expect(row.readingStatus).toBe('CONFIRMED');
      expect(row.updatedAt.getTime()).toBe(seeded.updatedAt.getTime());
      expect(await logsOf(seeded.id)).toHaveLength(0);

      // 保存済みの印が有の行なら、理由だけを送って直せる
      await service.updateMarks(
        seeded.id,
        buildMarks(seeded, {
          lineItems: [{ id: seeded.lineItems[1]!.id, referenceReason: '直した理由' }],
        }),
        actorId
      );
      const fixed = (await reload(seeded.id)).lineItems[1]!;
      expect(fixed.isReference).toBe(true);
      expect(fixed.referenceReason).toBe('直した理由');
    });

    /**
     * @requirement unit-price-ledger/REQ-5.2
     */
    it('ほかの見積の明細行や存在しない明細行を指定したら拒み、何も変えない', async () => {
      const seeded = await createProjectQuotation('marks-foreign');
      const other = await createProjectQuotation('marks-foreign-other');

      for (const foreignId of [other.lineItems[0]!.id, MISSING_ID]) {
        const error = await service
          .updateMarks(
            seeded.id,
            buildMarks(seeded, {
              lineItems: [
                { id: seeded.lineItems[0]!.id, classificationKey: 'K-SHOULD-NOT-SAVE' },
                { id: foreignId, classificationKey: 'K-FOREIGN' },
              ],
            }),
            actorId
          )
          .catch((e) => e);
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.statusCode).toBe(400);
        expect(error.message).toBe(LINE_ITEM_NOT_IN_QUOTATION_MESSAGE);
      }

      expect((await reload(seeded.id)).lineItems[0]!.classificationKey).toBe('K-OLD');
      expect((await reload(other.id)).lineItems[0]!.classificationKey).toBe('K-OLD');
      expect(await logsOf(seeded.id)).toHaveLength(0);
      expect(await logsOf(other.id)).toHaveLength(0);
    });

    /**
     * @requirement unit-price-ledger/REQ-5.2
     */
    it('案件の無い受領見積書の印も更新できる', async () => {
      const seeded = await createLedgerQuotation('marks-ledger');

      await service.updateMarks(
        seeded.id,
        buildMarks(seeded, {
          lineItems: [{ id: seeded.lineItems[1]!.id, classificationKey: 'K-LEDGER' }],
        }),
        actorId
      );

      const row = await prisma.receivedQuotation.findUniqueOrThrow({
        where: { id: seeded.id },
        include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
      });
      expect(row.lineItems[1]!.classificationKey).toBe('K-LEDGER');
      expect(row.readingStatus).toBe('CONFIRMED');
      expect(row.readingConfirmedById).toBe(otherUserId);
    });

    /**
     * @requirement unit-price-ledger/REQ-5.2
     */
    it('論理削除された見積や論理削除された見積依頼の見積は、台帳に無い見積として拒む', async () => {
      const seeded = await createProjectQuotation('marks-deleted');
      const deleted = await prisma.receivedQuotation.update({
        where: { id: seeded.id },
        data: { deletedAt: new Date() },
      });
      await expect(
        service.updateMarks(seeded.id, buildMarks(deleted, {}), actorId)
      ).rejects.toBeInstanceOf(ReceivedQuotationNotFoundError);

      const mark = nextMark('marks-deleted-request');
      const underDeletedRequest = await createQuotation(
        {
          projectId,
          estimateRequestId: deletedRequestId,
          vendorName: `${mark}-業者`,
          name: `${mark}-見積`,
          submittedAt: new Date('2026-05-01'),
        },
        [{ name: '行', amount: 100, category: 'DIRECT' }]
      );
      await expect(
        service.updateMarks(underDeletedRequest.id, buildMarks(underDeletedRequest, {}), actorId)
      ).rejects.toBeInstanceOf(ReceivedQuotationNotFoundError);
      await expect(
        service.updateMarks(MISSING_ID, buildMarks(underDeletedRequest, {}), actorId)
      ).rejects.toBeInstanceOf(ReceivedQuotationNotFoundError);
    });

    /**
     * @requirement unit-price-ledger/REQ-5.6
     */
    it('開いた後にほかの利用者が更新していたら、印を保存せずに排他の不一致にする', async () => {
      const seeded = await createProjectQuotation('marks-conflict');
      const stale = buildMarks(seeded, {
        readingStatus: 'UNCONFIRMED',
        lineItems: [{ id: seeded.lineItems[0]!.id, classificationKey: 'K-STALE' }],
      });
      await prisma.receivedQuotation.update({
        where: { id: seeded.id },
        data: { siteLocation: 'ほかの利用者の値' },
      });

      const error = await service.updateMarks(seeded.id, stale, actorId).catch((e) => e);

      expect(error).toBeInstanceOf(LedgerConflictError);
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('LEDGER_CONFLICT');
      expect(error.message).toBe('ほかの利用者が更新しました。最新の内容を読み込み直してください');
      const row = await reload(seeded.id);
      expect(row.lineItems[0]!.classificationKey).toBe('K-OLD');
      expect(row.readingStatus).toBe('CONFIRMED');
      expect(await logsOf(seeded.id)).toHaveLength(0);
    });

    /**
     * @requirement unit-price-ledger/REQ-5.6
     */
    it('同じ版から同時に印を保存したら、1 つだけを保存し、ほかは排他の不一致にする', async () => {
      const seeded = await createProjectQuotation('marks-race');
      const keys = ['K-RACE-A', 'K-RACE-B', 'K-RACE-C'];
      const attempts = keys.map((key) =>
        service.updateMarks(
          seeded.id,
          buildMarks(seeded, {
            lineItems: [
              { id: seeded.lineItems[0]!.id, classificationKey: key },
              { id: seeded.lineItems[2]!.id, classificationKey: key },
            ],
          }),
          actorId
        )
      );

      const results = await Promise.allSettled(attempts);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(2);
      for (const r of rejected) {
        expect(r.reason).toBeInstanceOf(LedgerConflictError);
      }
      const row = await reload(seeded.id);
      // 保存した 1 つの印だけが残る（混ざらない）
      expect(keys).toContain(row.lineItems[0]!.classificationKey);
      expect(row.lineItems[2]!.classificationKey).toBe(row.lineItems[0]!.classificationKey);
      expect(await logsOf(seeded.id)).toHaveLength(1);
    });

    /**
     * @requirement unit-price-ledger/REQ-5.7
     */
    it('印の更新を RECEIVED_QUOTATION_UPDATED（source unit_price_ledger）で記録し、変えた印を入れ、金額を入れない', async () => {
      const seeded = await createProjectQuotation('marks-audit');
      const [first, second, third] = seeded.lineItems;

      await service.updateMarks(
        seeded.id,
        buildMarks(seeded, {
          readingStatus: 'UNCONFIRMED',
          lineItems: [
            { id: first!.id, isReference: true, referenceReason: '新しい理由' },
            { id: second!.id, classificationKey: 'K-AUDIT' },
            // 同じ値を送り直しただけの行は、変えた印に入れない
            { id: third!.id, isReference: false, classificationKey: null },
          ],
        }),
        actorId
      );

      const logs = await logsOf(seeded.id);
      expect(logs).toHaveLength(1);
      const log = logs[0]!;
      expect(log.action).toBe('RECEIVED_QUOTATION_UPDATED');
      expect(log.actorId).toBe(actorId);
      expect(log.metadata).toEqual({ source: 'unit_price_ledger' });
      expect(log.before).toMatchObject({
        vendorName: seeded.vendorName,
        readingStatus: 'CONFIRMED',
        lineItemCount: 3,
      });
      expect(log.after).toMatchObject({
        vendorName: seeded.vendorName,
        readingStatus: 'UNCONFIRMED',
        lineItemCount: 3,
        constructionPriceChanged: false,
        confirmedAmountChanged: false,
        lineItemMarkChanges: [
          {
            lineItemId: first!.id,
            sortOrder: 0,
            isReference: { before: false, after: true },
            referenceReasonChanged: true,
          },
          {
            lineItemId: second!.id,
            sortOrder: 1,
            classificationKey: { before: null, after: 'K-AUDIT' },
          },
        ],
      });
      const changes = (log.after as { lineItemMarkChanges: Record<string, unknown>[] })
        .lineItemMarkChanges;
      expect(changes).toHaveLength(2);
      expect(changes[0]).not.toHaveProperty('classificationKey');
      expect(changes[1]).not.toHaveProperty('isReference');
      expect(changes[1]).not.toHaveProperty('referenceReasonChanged');

      const serialized = JSON.stringify([log.before, log.after]);
      for (const money of ['7654321', '4321000', '414720', '3456', '55555', '77777']) {
        expect(serialized).not.toContain(money);
      }
      expect(serialized).not.toMatch(/"constructionPrice"|"confirmedAmount"|"amount"|"unitPrice"/);
    });
  });
});
