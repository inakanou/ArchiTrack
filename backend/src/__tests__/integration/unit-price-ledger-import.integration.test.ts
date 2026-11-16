/**
 * @fileoverview 見積カードの取り込み（LedgerImportService）の統合試験（unit-price-ledger タスク2.4）
 *
 * テスト用の実データベースで、カードを 1 枚ずつ案件の無い受領見積書として登録することを確かめる。
 *
 * 確かめること:
 * - 2.1：1 枚のカードを 1 件の案件の無い受領見積書（見積依頼も案件も無い）と明細行として登録する
 * - 2.3：読めないカード・必須の項目の欠けたカードはファイル名と理由を結果に出し、残りを続ける
 * - 2.10・2.11：論理削除されていない協力業者の取引先の名前の完全一致が 1 件のときだけ紐づける
 * - 2.12・2.13：読取の確認の「済」と「済」でないとき
 * - 2.14：取り込み済みのカードの ID は飛ばし、既にある受領見積書を変えない（同時の取り込みを含む）
 * - 2.15：登録・飛ばし・失敗・参考の印の件数と、切り詰めた欄を結果に出し、件数をログに残す（中身は出さない）
 * - 2.16：途中で失敗したカード（DB の桁を超える金額）の受領見積書・明細行・監査ログを残さない
 * - 3.6：参考の印の有無で取り込みを止めない
 * - 監査ログ：RECEIVED_QUOTATION_CREATED、metadata の source は ledger_import。金額と原本のパスは入れない
 *
 * Design: Components > LedgerImportService、System Flows > 取り込み、Monitoring
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { validateEnv } from '../../config/env.js';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（サービスのインポート前に実行）
validateEnv();

import getPrismaClient from '../../db.js';
import logger from '../../utils/logger.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import {
  LedgerImportService,
  type LedgerImportResult,
} from '../../services/unit-price-ledger/ledger-import.service.js';
import type { LedgerUploadFile } from '../../services/unit-price-ledger/ledger-card-parser.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-upl24-import';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PREFIX = `${MARK}-${RUN}`;

type Card = Record<string, unknown>;

let cardSeq = 0;
/** 試験ごとに異なるカードの ID */
const nextCardId = (label: string): string => {
  cardSeq += 1;
  return `${PREFIX}-${label}-${cardSeq}`;
};

/** daicho の見積カードの形に沿った正しいカード（参考の理由が無いもの） */
const validCard = (id: string, overrides: Card = {}): Card => ({
  id,
  業者: `${PREFIX}-照合なし業者`,
  工種: ['内装'],
  種別: '見積',
  見積日: '2026-10-01',
  見積番号: 'Q-123',
  案件: {
    名称: `${PREFIX}-A小学校改修`,
    場所: 'A市',
    片道km: 12.5,
    区分: '改修',
    用途: '学校',
    工事価格: 12000000,
    作業条件: ['夜間'],
  },
  原本: { パス: `${PREFIX}/02_見積/01_山田内装/見積書.pdf`, 形式: 'PDF文字' },
  合計: { 税抜: 110000, 諸経費: 10000 },
  行: [
    {
      名称: '軽量鉄骨天井下地',
      規格: '@300',
      数量: 100,
      単位: '㎡',
      単価: 1000,
      金額: 100000,
      条件: '1階',
    },
    { 名称: '諸経費', 数量: 1, 単位: '式', 金額: 10000, 区分: '諸経費' },
  ],
  採否: '採用',
  確定金額: 98765,
  条件: '足場は別途',
  読取: { 方法: 'PDF文字', 日時: '2026-10-02T10:00:00+09:00', 確認: '済' },
  ...overrides,
});

const jsonFile = (originalName: string, content: unknown): LedgerUploadFile => ({
  originalName,
  buffer: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content), 'utf8'),
  mimeType: 'application/json',
});

const zipFile = (originalName: string, cards: Record<string, Card>): LedgerUploadFile => ({
  originalName,
  buffer: Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(cards).map(([name, card]) => [name, strToU8(JSON.stringify(card))])
      )
    )
  ),
  mimeType: 'application/zip',
});

describe('見積カードの取り込み（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let service: LedgerImportService;
  let actorId: string;
  const partnerIds: string[] = [];

  const createPartner = async (
    name: string,
    types: Array<'CUSTOMER' | 'SUBCONTRACTOR'>,
    options: { branchName?: string; deletedAt?: Date } = {}
  ): Promise<string> => {
    const partner = await prisma.tradingPartner.create({
      data: {
        name,
        nameKana: 'トリコミテスト',
        address: '東京都千代田区1-1-1',
        branchName: options.branchName ?? null,
        deletedAt: options.deletedAt ?? null,
        types: { create: types.map((type) => ({ type })) },
      },
    });
    partnerIds.push(partner.id);
    return partner.id;
  };

  const liveByCardId = (ledgerCardId: string) =>
    prisma.receivedQuotation.findMany({
      where: { ledgerCardId, deletedAt: null },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });

  const singleLive = async (ledgerCardId: string) => {
    const rows = await liveByCardId(ledgerCardId);
    expect(rows).toHaveLength(1);
    return rows[0]!;
  };

  const countCreatedLogsByActor = () =>
    prisma.auditLog.count({
      where: { action: 'RECEIVED_QUOTATION_CREATED', actorId },
    });

  beforeAll(async () => {
    prisma = getPrismaClient();
    const user = await createTestUser(prisma, {
      email: `${PREFIX}-admin@example.com`,
      displayName: `${PREFIX}-admin`,
      passwordHash: 'not-used',
    });
    actorId = user.id;
    service = new LedgerImportService({
      prisma,
      auditLogService: new AuditLogService({ prisma }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.receivedQuotation.deleteMany({ where: { ledgerCardId: { startsWith: MARK } } });
    await prisma.tradingPartner.deleteMany({ where: { id: { in: partnerIds } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: MARK } } });
  });

  describe('登録（2.1・2.15）', () => {
    /**
     * @requirement unit-price-ledger/REQ-2.1
     * @requirement unit-price-ledger/REQ-2.15
     */
    it('JSON のカードを、案件も見積依頼も無い受領見積書と明細行として 1 枚ずつ登録し、件数を返す', async () => {
      const id1 = nextCardId('json');
      const id2 = nextCardId('json');

      const result = await service.importCards(
        [jsonFile('a.json', validCard(id1)), jsonFile('b.json', validCard(id2))],
        actorId
      );

      expect(result).toEqual<LedgerImportResult>({
        importedCount: 2,
        skipped: [],
        failed: [],
        truncated: [],
        referenceMarkedCount: 0,
      });
      const row = await singleLive(id1);
      expect(row.projectId).toBeNull();
      expect(row.estimateRequestId).toBeNull();
      expect(row.vendorName).toBe(`${PREFIX}-照合なし業者`);
      expect(row.name).toBe(`${PREFIX}-照合なし業者_2026-10-01`);
      expect(row.submittedAt.toISOString().slice(0, 10)).toBe('2026-10-01');
      expect(row.ledgerSourcePath).toBe(`${PREFIX}/02_見積/01_山田内装/見積書.pdf`);
      expect(row.ledgerProjectName).toBe(`${PREFIX}-A小学校改修`);
      expect(row.quoteNumber).toBe('Q-123');
      expect(row.constructionKind).toBe('RENOVATION');
      expect(row.adoption).toBe('ADOPTED');
      expect(row.confirmedAmount?.toString()).toBe('98765');
      expect(row.distanceKm?.toString()).toBe('12.5');
      expect(row.lineItems).toHaveLength(2);
      expect(row.lineItems[0]).toMatchObject({
        sortOrder: 0,
        name: '軽量鉄骨天井下地',
        specification: '@300',
        unit: '㎡',
        category: 'DIRECT',
        condition: '1階',
        isReference: false,
        referenceReason: null,
      });
      expect(row.lineItems[0]!.amount?.toString()).toBe('100000');
      expect(row.lineItems[1]!.category).toBe('OVERHEAD');
      await singleLive(id2);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('zip の中のカードも 1 枚ずつ登録する', async () => {
      const id1 = nextCardId('zip');
      const id2 = nextCardId('zip');

      const result = await service.importCards(
        [zipFile('cards.zip', { 'x/1.json': validCard(id1), 'x/2.json': validCard(id2) })],
        actorId
      );

      expect(result.importedCount).toBe(2);
      await singleLive(id1);
      await singleLive(id2);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.3
     * @requirement unit-price-ledger/REQ-2.15
     */
    it('読めないカードと必須の項目の欠けたカードはファイル名と理由を返し、残りのカードを登録する', async () => {
      const okId = nextCardId('rest');
      const missing = validCard(nextCardId('missing'));
      delete missing['業者'];

      const result = await service.importCards(
        [
          jsonFile('broken.json', '{not json'),
          jsonFile('missing.json', missing),
          jsonFile('ok.json', validCard(okId)),
        ],
        actorId
      );

      expect(result.importedCount).toBe(1);
      expect(result.failed.map((f) => f.fileName)).toEqual(['broken.json', 'missing.json']);
      for (const failure of result.failed) {
        expect(failure.reason.length).toBeGreaterThan(0);
      }
      await singleLive(okId);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.15
     */
    it('切り詰めた欄を、そのカードの ID とともに結果に出す', async () => {
      const id = nextCardId('trunc');
      const card = validCard(id, { 見積番号: 'Q'.repeat(150) });

      const result = await service.importCards([jsonFile('t.json', card)], actorId);

      expect(result.importedCount).toBe(1);
      expect(result.truncated).toEqual([{ cardId: id, fields: ['見積番号'] }]);
      const row = await singleLive(id);
      expect(row.quoteNumber).toHaveLength(100);
    });
  });

  describe('取引先の照合（2.10・2.11）', () => {
    /**
     * @requirement unit-price-ledger/REQ-2.10
     */
    it('論理削除されていない協力業者の取引先の名前と完全に一致する 1 件に紐づけ、削除済みと顧客だけの同名は数えない', async () => {
      const name = `${PREFIX}-単独業者`;
      const partnerId = await createPartner(name, ['SUBCONTRACTOR']);
      await createPartner(name, ['SUBCONTRACTOR'], {
        branchName: '削除済み',
        deletedAt: new Date('2026-10-01T00:00:00.000Z'),
      });
      await createPartner(name, ['CUSTOMER'], { branchName: '顧客' });
      const id = nextCardId('partner-one');

      const result = await service.importCards(
        [jsonFile('p.json', validCard(id, { 業者: name }))],
        actorId
      );

      expect(result.importedCount).toBe(1);
      const row = await singleLive(id);
      expect(row.tradingPartnerId).toBe(partnerId);
      expect(row.vendorName).toBe(name);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.11
     */
    it('一致する協力業者が無い、または 2 件以上あるときは紐づけず、業者名だけを保持する', async () => {
      const dupName = `${PREFIX}-重複業者`;
      await createPartner(dupName, ['SUBCONTRACTOR'], { branchName: '本店' });
      await createPartner(dupName, ['SUBCONTRACTOR'], { branchName: '支店' });
      const noneName = `${PREFIX}-該当なし業者`;
      const dupId = nextCardId('partner-dup');
      const noneId = nextCardId('partner-none');

      const result = await service.importCards(
        [
          jsonFile('dup.json', validCard(dupId, { 業者: dupName })),
          jsonFile('none.json', validCard(noneId, { 業者: noneName })),
        ],
        actorId
      );

      expect(result.importedCount).toBe(2);
      const dup = await singleLive(dupId);
      expect(dup.tradingPartnerId).toBeNull();
      expect(dup.vendorName).toBe(dupName);
      const none = await singleLive(noneId);
      expect(none.tradingPartnerId).toBeNull();
      expect(none.vendorName).toBe(noneName);
    });
  });

  describe('読取の確認（2.12・2.13）', () => {
    /**
     * @requirement unit-price-ledger/REQ-2.12
     */
    it('「済」なら確認済み、確認者は実行者、日時はカードの読取の日時', async () => {
      const id = nextCardId('read-done');

      await service.importCards([jsonFile('r.json', validCard(id))], actorId);

      const row = await singleLive(id);
      expect(row.readingStatus).toBe('CONFIRMED');
      expect(row.readingConfirmedById).toBe(actorId);
      expect(row.readingConfirmedAt?.toISOString()).toBe('2026-10-02T01:00:00.000Z');
    });

    /**
     * @requirement unit-price-ledger/REQ-2.12
     */
    it('「済」で読取の日時が無ければ、日時は取り込みの日時', async () => {
      const id = nextCardId('read-done-now');
      const before = new Date();

      await service.importCards(
        [jsonFile('r.json', validCard(id, { 読取: { 方法: 'PDF文字', 確認: '済' } }))],
        actorId
      );

      const after = new Date();
      const row = await singleLive(id);
      expect(row.readingStatus).toBe('CONFIRMED');
      expect(row.readingConfirmedById).toBe(actorId);
      const at = row.readingConfirmedAt?.getTime() ?? Number.NaN;
      expect(at).toBeGreaterThanOrEqual(before.getTime());
      expect(at).toBeLessThanOrEqual(after.getTime());
    });

    /**
     * @requirement unit-price-ledger/REQ-2.13
     */
    it('「済」でなければ未確認とし、確認者と日時を持たない', async () => {
      const notYet = nextCardId('read-not');
      const absent = nextCardId('read-absent');
      const absentCard = validCard(absent);
      delete absentCard['読取'];

      await service.importCards(
        [
          jsonFile(
            'n.json',
            validCard(notYet, {
              読取: { 方法: 'PDF文字', 日時: '2026-10-02T10:00:00+09:00', 確認: '未' },
            })
          ),
          jsonFile('a.json', absentCard),
        ],
        actorId
      );

      for (const id of [notYet, absent]) {
        const row = await singleLive(id);
        expect(row.readingStatus).toBe('UNCONFIRMED');
        expect(row.readingConfirmedById).toBeNull();
        expect(row.readingConfirmedAt).toBeNull();
      }
    });
  });

  describe('取り込み済みの飛ばし（2.14）', () => {
    /**
     * @requirement unit-price-ledger/REQ-2.14
     */
    it('論理削除されていない受領見積書に既にあるカードの ID は飛ばし、既にある内容を変えない', async () => {
      const id = nextCardId('skip');
      await service.importCards([jsonFile('s.json', validCard(id))], actorId);
      const before = await singleLive(id);
      const logsBefore = await countCreatedLogsByActor();

      const result = await service.importCards(
        [
          jsonFile(
            's2.json',
            validCard(id, {
              業者: `${PREFIX}-別の業者`,
              行: [{ 名称: '別の行', 数量: 1, 単位: '式', 金額: 1 }],
            })
          ),
        ],
        actorId
      );

      expect(result).toEqual<LedgerImportResult>({
        importedCount: 0,
        skipped: [{ cardId: id }],
        failed: [],
        truncated: [],
        referenceMarkedCount: 0,
      });
      const after = await singleLive(id);
      expect(after.id).toBe(before.id);
      expect(after.vendorName).toBe(before.vendorName);
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
      expect(after.lineItems.map((l) => l.name)).toEqual(before.lineItems.map((l) => l.name));
      expect(await countCreatedLogsByActor()).toBe(logsBefore);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.14
     */
    it('同じ取り込みの中の同じ ID の 2 枚目は飛ばす', async () => {
      const id = nextCardId('skip-same-upload');

      const result = await service.importCards(
        [jsonFile('1.json', validCard(id)), jsonFile('2.json', validCard(id))],
        actorId
      );

      expect(result.importedCount).toBe(1);
      expect(result.skipped).toEqual([{ cardId: id }]);
      await singleLive(id);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.14
     */
    it('論理削除された受領見積書だけが持つカードの ID は、新しく登録する', async () => {
      const id = nextCardId('skip-deleted');
      await service.importCards([jsonFile('d.json', validCard(id))], actorId);
      await prisma.receivedQuotation.updateMany({
        where: { ledgerCardId: id },
        data: { deletedAt: new Date() },
      });

      const result = await service.importCards([jsonFile('d.json', validCard(id))], actorId);

      expect(result.importedCount).toBe(1);
      expect(result.skipped).toEqual([]);
      await singleLive(id);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.14
     */
    it('同じカードを同時に取り込むと、1 件だけを登録し、もう一方は飛ばし、失敗にしない', async () => {
      const ids = [nextCardId('concurrent'), nextCardId('concurrent'), nextCardId('concurrent')];
      const files = ids.map((id, i) => jsonFile(`c${i}.json`, validCard(id)));

      const [a, b] = await Promise.all([
        service.importCards(files, actorId),
        service.importCards(files, actorId),
      ]);

      expect(a.failed).toEqual([]);
      expect(b.failed).toEqual([]);
      expect(a.importedCount + b.importedCount).toBe(ids.length);
      expect(a.skipped.length + b.skipped.length).toBe(ids.length);
      const skippedIds = [...a.skipped, ...b.skipped].map((s) => s.cardId).sort();
      expect(skippedIds).toEqual([...ids].sort());
      for (const id of ids) {
        await singleLive(id);
      }
    });
  });

  describe('まとめての登録（2.16）', () => {
    /**
     * @requirement unit-price-ledger/REQ-2.16
     * @requirement unit-price-ledger/REQ-2.3
     */
    it('途中で失敗したカード（DB の桁を超える金額）は受領見積書も明細行も監査ログも残さず、ほかのカードを登録する', async () => {
      const okBefore = nextCardId('partial-ok');
      const broken = nextCardId('partial-broken');
      const okAfter = nextCardId('partial-ok');
      const brokenCard = validCard(broken, {
        行: [
          { 名称: '正しい行', 数量: 1, 単位: '式', 単価: 1000, 金額: 1000 },
          // 金額は Decimal(15,2)。整数部 13 桁を超えるとそのカードの登録が DB で失敗する
          { 名称: '桁を超える行', 数量: 1, 単位: '式', 金額: 100_000_000_000_000 },
        ],
      });
      const logsBefore = await countCreatedLogsByActor();

      const result = await service.importCards(
        [
          jsonFile('ok1.json', validCard(okBefore)),
          jsonFile('broken.json', brokenCard),
          jsonFile('ok2.json', validCard(okAfter)),
        ],
        actorId
      );

      expect(result.importedCount).toBe(2);
      expect(result.skipped).toEqual([]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.fileName).toBe('broken.json');
      expect(result.failed[0]!.reason.length).toBeGreaterThan(0);
      // 失敗の理由にカードの中身を出さない
      expect(result.failed[0]!.reason).not.toContain(PREFIX);
      expect(await prisma.receivedQuotation.count({ where: { ledgerCardId: broken } })).toBe(0);
      expect(
        await prisma.receivedQuotationLineItem.count({
          where: { receivedQuotation: { ledgerCardId: { in: [okBefore, broken, okAfter] } } },
        })
      ).toBe(4);
      expect(await countCreatedLogsByActor()).toBe(logsBefore + 2);
      await singleLive(okBefore);
      await singleLive(okAfter);
    });
  });

  describe('参考の印（3.6）', () => {
    /**
     * @requirement unit-price-ledger/REQ-3.6
     * @requirement unit-price-ledger/REQ-2.15
     */
    it('参考の理由のあるカードも止めずに登録し、すべての行に印を付け、参考の印を付けた件数を返す', async () => {
      const marked = nextCardId('ref');
      const plain = nextCardId('ref-plain');

      const result = await service.importCards(
        [
          jsonFile('m.json', validCard(marked, { 参考: { 理由: ['概算のみ'] } })),
          jsonFile('p.json', validCard(plain)),
        ],
        actorId
      );

      expect(result.importedCount).toBe(2);
      expect(result.referenceMarkedCount).toBe(1);
      const row = await singleLive(marked);
      expect(row.lineItems.length).toBeGreaterThan(0);
      for (const line of row.lineItems) {
        expect(line.isReference).toBe(true);
        expect(line.referenceReason).toBe('概算のみ');
      }
    });
  });

  describe('監査ログ', () => {
    /**
     * @requirement unit-price-ledger/REQ-2.16
     */
    it('RECEIVED_QUOTATION_CREATED を source ledger_import で 1 件書き、金額と原本のパスを入れない', async () => {
      const id = nextCardId('audit');

      await service.importCards([jsonFile('a.json', validCard(id))], actorId);

      const row = await singleLive(id);
      const logs = await prisma.auditLog.findMany({
        where: { targetType: 'ReceivedQuotation', targetId: row.id },
      });
      expect(logs).toHaveLength(1);
      const log = logs[0]!;
      expect(log.action).toBe('RECEIVED_QUOTATION_CREATED');
      expect(log.actorId).toBe(actorId);
      expect(log.metadata).toEqual({ source: 'ledger_import' });
      expect(log.before).toBeNull();
      expect(log.after).toMatchObject({
        estimateRequestId: null,
        name: row.name,
        vendorName: row.vendorName,
        lineItemCount: 2,
        readingStatus: 'CONFIRMED',
      });
      const serialized = JSON.stringify(log.after);
      expect(serialized).not.toContain('見積書.pdf');
      expect(serialized).not.toContain('98765');
      expect(serialized).not.toContain('12000000');
      expect(serialized).not.toContain('100000');
      expect(serialized).not.toMatch(/confirmedAmount|constructionPrice|ledgerSourcePath/);
    });
  });

  describe('DB につながらないとき（Error Handling）', () => {
    /**
     * @requirement unit-price-ledger/REQ-2.16
     */
    it('DB へつながらない誤りはカードの失敗にせず、取り込みの要求を失敗させる', async () => {
      const id = nextCardId('outage');
      vi.spyOn(prisma, '$transaction').mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Can't reach database server", {
          code: 'P1001',
          clientVersion: Prisma.prismaVersion.client,
        })
      );

      await expect(
        service.importCards([jsonFile('a.json', validCard(id))], actorId)
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.16
     */
    it('DB の初期化の誤りもカードの失敗にせず、取り込みの要求を失敗させる', async () => {
      const id = nextCardId('outage');
      vi.spyOn(prisma, '$transaction').mockRejectedValue(
        new Prisma.PrismaClientInitializationError('init failed', Prisma.prismaVersion.client)
      );

      await expect(
        service.importCards([jsonFile('a.json', validCard(id))], actorId)
      ).rejects.toBeInstanceOf(Prisma.PrismaClientInitializationError);
    });
  });

  describe('ログ（Monitoring）', () => {
    /**
     * @requirement unit-price-ledger/REQ-2.15
     */
    it('登録・飛ばし・失敗の件数をログに残し、カードの中身をログに出さない', async () => {
      const infoSpy = vi.spyOn(logger, 'info');
      const warnSpy = vi.spyOn(logger, 'warn');
      const errorSpy = vi.spyOn(logger, 'error');
      const id = nextCardId('log');
      const broken = validCard(nextCardId('log-broken'), {
        行: [{ 名称: '桁を超える行', 数量: 1, 単位: '式', 金額: 100_000_000_000_000 }],
      });
      await service.importCards([jsonFile('pre.json', validCard(id))], actorId);
      infoSpy.mockClear();
      warnSpy.mockClear();
      errorSpy.mockClear();

      await service.importCards(
        [
          jsonFile('again.json', validCard(id)),
          jsonFile('new.json', validCard(nextCardId('log'))),
          jsonFile('broken.json', broken),
          jsonFile('bad.json', '{'),
        ],
        actorId
      );

      const countLogs = infoSpy.mock.calls.filter(([obj]) => {
        return (
          typeof obj === 'object' &&
          obj !== null &&
          'importedCount' in obj &&
          'skippedCount' in obj &&
          'failedCount' in obj
        );
      });
      expect(countLogs).toHaveLength(1);
      expect(countLogs[0]![0]).toMatchObject({ importedCount: 1, skippedCount: 1, failedCount: 2 });
      const allLogged = JSON.stringify([
        ...infoSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ]);
      expect(allLogged).not.toContain(PREFIX);
      expect(allLogged).not.toContain('桁を超える行');
      expect(allLogged).not.toContain('軽量鉄骨天井下地');
    });
  });
});
