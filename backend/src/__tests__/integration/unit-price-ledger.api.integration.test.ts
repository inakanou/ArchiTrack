/**
 * @fileoverview 単価台帳の API の統合試験（unit-price-ledger タスク3.1）
 *
 * 本物のアプリ（app.ts の経路・authenticate・requirePermission・multer・サービス）とテスト用の実データベースで、
 * `/api/unit-price-ledger` の 8 つの経路と、権限・上限・排他・出力の記録の誤りの応答を確かめる。
 *
 * 確かめること:
 * - 一覧・詳細・修正・印の更新・削除・取り込み・書き出し・似た単価の 8 つの経路が働く
 * - 取り込みの上限の超過（JSON の 1 MB・multer の 1 ファイル 50 MB・2000 ファイル）を 413 `LEDGER_IMPORT_TOO_LARGE` で返す
 * - 排他の不一致を 409 `LEDGER_CONFLICT`、案件の受領見積書の修正・削除を 409 `LEDGER_PROJECT_QUOTATION_READ_ONLY` で返す
 * - 出力の記録の失敗を 500 `EXPORT_RECORD_FAILED` で返し、ファイルを返さない。取り込みの途中の DB の断を 500 で返す
 * - 10.1・10.4：user ロールの利用者の台帳の経路の要求を 403 で拒み、内容を返さず、何も変えない
 * - 10.2・10.4：見積の編集の権限の無い利用者の似た単価の問い合わせを 403 で拒み、候補を返さない
 *
 * 出力の記録の失敗は、AuditLogService の記録を DATA_EXPORTED のときだけ失敗させて起こす
 * （execution-budget-export-audit の統合試験と同じ手段）。監査ログは削除できないため、本試験の利用者の行を
 * 保管の権限で消す。
 *
 * Design: Components > unit-price-ledger.routes、各サービスの API Contract、Error Handling
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { strToU8, zipSync } from 'fflate';
import { validateEnv } from '../../config/env.js';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、アプリとサービスのインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import tokenService from '../../services/token.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { LedgerImportService } from '../../services/unit-price-ledger/ledger-import.service.js';
import type { CreateAuditLogInput } from '../../types/audit-log.types.js';
import { seedPermissions, seedRolePermissions, seedRoles } from '../../utils/seed-helpers.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-upl31-api';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PREFIX = `${MARK}-${RUN}`;
const NO_ESTIMATE_ROLE = `${MARK}-no-estimate`;
const BASE = '/api/unit-price-ledger';
/** 版 4・変種 8 の整った UUID（どの行としても存在しない） */
const MISSING_ID = '00000000-0000-4000-8000-000000003100';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MB = 1024 * 1024;

interface TestUser {
  id: string;
  token: string;
}

type LineSeed = Omit<Prisma.ReceivedQuotationLineItemCreateManyReceivedQuotationInput, 'sortOrder'>;

let seq = 0;
const nextMark = (label: string): string => {
  seq += 1;
  return `${PREFIX}-${label}-${seq}`;
};

/** daicho の見積カードの形に沿った正しいカード */
const validCard = (id: string): Record<string, unknown> => ({
  id,
  業者: `${PREFIX}-取込業者`,
  見積日: '2026-10-01',
  案件: { 名称: `${PREFIX}-取込案件`, 区分: '改修' },
  行: [{ 名称: `${PREFIX}-取込の行`, 数量: 10, 単位: '㎡', 単価: 100, 金額: 1000 }],
});

const cardBuffer = (card: Record<string, unknown>): Buffer =>
  Buffer.from(JSON.stringify(card), 'utf8');

/** 応答の本文に台帳の内容（一覧・詳細・候補・取り込みの結果）が無いこと */
const expectNoLedgerContent = (body: unknown, marker: string): void => {
  expect(body).not.toHaveProperty('data');
  expect(body).not.toHaveProperty('candidates');
  expect(body).not.toHaveProperty('lineItems');
  expect(body).not.toHaveProperty('importedCount');
  expect(JSON.stringify(body)).not.toContain(marker);
};

describe('単価台帳の API（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let admin: TestUser;
  let general: TestUser;
  let noEstimate: TestUser;
  let projectId: string;
  let ledgerQuotationId: string;
  let projectQuotationId: string;

  const auth = (user: TestUser) => `Bearer ${user.token}`;

  const createUser = async (suffix: string, roleName: string): Promise<TestUser> => {
    const email = `${PREFIX}-${suffix}@example.com`;
    const user = await createTestUser(prisma, {
      email,
      displayName: `${MARK}-${suffix}`,
      passwordHash: 'not-used',
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const token = await tokenService.generateAccessToken({
      accessTokenGeneration: 0,
      userId: user.id,
      email,
      roles: [roleName],
    });
    return { id: user.id, token };
  };

  const createQuotation = async (
    data: Omit<Prisma.ReceivedQuotationUncheckedCreateInput, 'lineItems'>,
    lines: LineSeed[]
  ) =>
    prisma.receivedQuotation.create({
      data: {
        ...data,
        lineItems: { createMany: { data: lines.map((line, i) => ({ ...line, sortOrder: i })) } },
      },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });

  /** 案件の無い受領見積書（取り込んだ見積の形） */
  const createLedgerQuotation = async (label: string) => {
    const mark = nextMark(label);
    return createQuotation(
      {
        vendorName: `${mark}-業者`,
        name: `${mark}-業者_2026-03-10`,
        submittedAt: new Date('2026-03-10'),
        ledgerCardId: `${mark}-card`,
        ledgerProjectName: `${mark}-台帳案件`,
        ledgerSourcePath: `${mark}/02_見積/見積書.pdf`,
      },
      [
        {
          name: `${PREFIX}-軽量鉄骨天井下地`,
          specification: '@300',
          unit: '㎡',
          quantity: 100,
          unitPrice: 10,
          amount: 1000,
          category: 'DIRECT',
          classificationKey: `${PREFIX}-K`,
        },
      ]
    );
  };

  /** 案件の受領見積書 */
  const createProjectQuotation = async (label: string) => {
    const mark = nextMark(label);
    return createQuotation(
      {
        projectId,
        vendorName: `${mark}-業者`,
        name: `${mark}-案件の見積`,
        submittedAt: new Date('2026-04-01'),
      },
      [{ name: `${mark}-内装`, unit: '式', quantity: 1, amount: 5000, category: 'DIRECT' }]
    );
  };

  /** 保存済みの見積を、そのまま送り直す修正の本文 */
  const updateBody = (
    quotation: Awaited<ReturnType<typeof createLedgerQuotation>>,
    overrides: Record<string, unknown> = {}
  ) => ({
    vendorName: quotation.vendorName,
    submittedAt: quotation.submittedAt.toISOString(),
    ledgerProjectName: quotation.ledgerProjectName,
    ledgerSourcePath: quotation.ledgerSourcePath,
    lineItems: quotation.lineItems.map((line) => ({
      name: line.name,
      sortOrder: line.sortOrder,
      specification: line.specification,
      unit: line.unit,
      quantity: line.quantity === null ? null : Number(line.quantity),
      unitPrice: line.unitPrice === null ? null : Number(line.unitPrice),
      amount: line.amount === null ? null : Number(line.amount),
      category: line.category,
      classificationKey: line.classificationKey,
    })),
    expectedUpdatedAt: quotation.updatedAt.toISOString(),
    ...overrides,
  });

  /** AuditLogService の記録を、DATA_EXPORTED のときだけ失敗させる（ほかの記録は本物を通す） */
  const failExportRecord = (): void => {
    const original = AuditLogService.prototype.createLog;
    vi.spyOn(AuditLogService.prototype, 'createLog').mockImplementation(async function (
      this: AuditLogService,
      input: CreateAuditLogInput,
      tx?: Prisma.TransactionClient
    ) {
      if (input.action !== 'DATA_EXPORTED') {
        return original.call(this, input, tx);
      }
      throw new Error('injected export audit write failure');
    });
  };

  const exportRecordCount = (userId: string) =>
    prisma.auditLog.count({ where: { action: 'DATA_EXPORTED', actorId: userId } });

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    const rbac = getSharedRBACService();
    for (const id of userIds) {
      await rbac.invalidateUserPermissionsCache(id);
    }
    const projects = await prisma.project.findMany({
      where: { name: { startsWith: MARK } },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);
    const quotations = await prisma.receivedQuotation.findMany({
      where: { OR: [{ vendorName: { startsWith: MARK } }, { projectId: { in: projectIds } }] },
      select: { id: true },
    });
    const quotationIds = quotations.map((q) => q.id);
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [
        { actorId: { in: userIds } },
        { targetId: { in: userIds } },
        { targetId: { in: quotationIds } },
      ],
    });
    await prisma.receivedQuotation.deleteMany({ where: { id: { in: quotationIds } } });
    await prisma.projectStatusHistory.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { role: { name: NO_ESTIMATE_ROLE } } });
    await prisma.role.deleteMany({ where: { name: NO_ESTIMATE_ROLE } });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    // 見積の編集の権限（estimate:update）を持たないロール（台帳の権限も持たない）
    const noEstimateRole = await prisma.role.create({
      data: { name: NO_ESTIMATE_ROLE, description: 'unit-price-ledger タスク3.1 の検証用' },
    });
    const projectRead = await prisma.permission.findFirstOrThrow({
      where: { resource: 'project', action: 'read' },
    });
    await prisma.rolePermission.create({
      data: { roleId: noEstimateRole.id, permissionId: projectRead.id },
    });

    admin = await createUser('admin', 'admin');
    general = await createUser('general', 'user');
    noEstimate = await createUser('no-estimate', NO_ESTIMATE_ROLE);

    const project = await prisma.project.create({
      data: { name: `${PREFIX}-案件`, salesPersonId: admin.id, createdById: admin.id },
      select: { id: true },
    });
    projectId = project.id;

    ledgerQuotationId = (await createLedgerQuotation('base')).id;
    projectQuotationId = (await createProjectQuotation('base')).id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('一覧と詳細', () => {
    /**
     * @requirement unit-price-ledger/REQ-10.1
     * @requirement unit-price-ledger/REQ-4.1
     */
    it('GET /quotations が絞り込みの結果とページを返す', async () => {
      const res = await request(app)
        .get(`${BASE}/quotations`)
        .query({ keyword: PREFIX, hasProject: 'false' })
        .set('Authorization', auth(admin));

      expect(res.status).toBe(200);
      const ids = (res.body.data as Array<{ id: string }>).map((row) => row.id);
      expect(ids).toContain(ledgerQuotationId);
      expect(ids).not.toContain(projectQuotationId);
      expect(res.body.pagination).toMatchObject({ page: 1, limit: 50 });
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
    });

    /**
     * @requirement unit-price-ledger/REQ-4.2
     */
    it('GET /quotations が正しくない問い合わせを 400 で拒む', async () => {
      const res = await request(app)
        .get(`${BASE}/quotations`)
        .query({ page: '0' })
        .set('Authorization', auth(admin));

      expect(res.status).toBe(400);
    });

    /**
     * @requirement unit-price-ledger/REQ-10.1
     * @requirement unit-price-ledger/REQ-4.6
     */
    it('GET /quotations/:id が詳細を返し、無い見積は 404 を返す', async () => {
      const res = await request(app)
        .get(`${BASE}/quotations/${ledgerQuotationId}`)
        .set('Authorization', auth(admin));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ledgerQuotationId);
      expect(res.body.lineItems).toHaveLength(1);
      expect(typeof res.body.updatedAt).toBe('string');

      const missing = await request(app)
        .get(`${BASE}/quotations/${MISSING_ID}`)
        .set('Authorization', auth(admin));
      expect(missing.status).toBe(404);
    });
  });

  describe('修正・印の更新・削除', () => {
    /**
     * @requirement unit-price-ledger/REQ-10.1
     * @requirement unit-price-ledger/REQ-5.1
     */
    it('PUT /quotations/:id が案件の無い見積を修正し、詳細を返す', async () => {
      const seeded = await createLedgerQuotation('put');
      const vendorName = `${PREFIX}-直した業者-${seq}`;

      const res = await request(app)
        .put(`${BASE}/quotations/${seeded.id}`)
        .set('Authorization', auth(admin))
        .send(updateBody(seeded, { vendorName }));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(seeded.id);
      expect(res.body.vendorName).toBe(vendorName);
      const stored = await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: seeded.id } });
      expect(stored.vendorName).toBe(vendorName);
    });

    /**
     * @requirement unit-price-ledger/REQ-5.6
     */
    it('PUT /quotations/:id が排他の不一致を 409 LEDGER_CONFLICT で返し、保存しない', async () => {
      const seeded = await createLedgerQuotation('conflict');

      const res = await request(app)
        .put(`${BASE}/quotations/${seeded.id}`)
        .set('Authorization', auth(admin))
        .send(
          updateBody(seeded, {
            vendorName: `${PREFIX}-保存されない業者`,
            expectedUpdatedAt: new Date(seeded.updatedAt.getTime() - 60_000).toISOString(),
          })
        );

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LEDGER_CONFLICT');
      expect(res.body.detail).toBe(
        'ほかの利用者が更新しました。最新の内容を読み込み直してください'
      );
      const stored = await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: seeded.id } });
      expect(stored.vendorName).toBe(seeded.vendorName);
    });

    /**
     * @requirement unit-price-ledger/REQ-5.2
     */
    it('PUT /quotations/:id が案件の受領見積書の修正を 409 LEDGER_PROJECT_QUOTATION_READ_ONLY で返す', async () => {
      const seeded = await createProjectQuotation('put-ro');

      const res = await request(app)
        .put(`${BASE}/quotations/${seeded.id}`)
        .set('Authorization', auth(admin))
        .send({
          vendorName: `${PREFIX}-保存されない業者`,
          submittedAt: seeded.submittedAt.toISOString(),
          lineItems: [{ name: '内装', sortOrder: 0, amount: 1, category: 'DIRECT' }],
          expectedUpdatedAt: seeded.updatedAt.toISOString(),
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LEDGER_PROJECT_QUOTATION_READ_ONLY');
    });

    /**
     * @requirement unit-price-ledger/REQ-10.1
     * @requirement unit-price-ledger/REQ-5.2
     */
    it('PATCH /quotations/:id/marks が案件の受領見積書の印を更新し、詳細を返す', async () => {
      const seeded = await createProjectQuotation('marks');
      const lineId = seeded.lineItems[0]!.id;

      const res = await request(app)
        .patch(`${BASE}/quotations/${seeded.id}/marks`)
        .set('Authorization', auth(admin))
        .send({
          readingStatus: 'CONFIRMED',
          lineItems: [
            { id: lineId, isReference: true, referenceReason: '要確認', classificationKey: 'K-9' },
          ],
          expectedUpdatedAt: seeded.updatedAt.toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.readingStatus).toBe('CONFIRMED');
      expect(res.body.lineItems[0]).toMatchObject({
        id: lineId,
        isReference: true,
        referenceReason: '要確認',
        classificationKey: 'K-9',
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-10.1
     * @requirement unit-price-ledger/REQ-5.5
     */
    it('DELETE /quotations/:id が案件の無い見積を論理削除して 204 を返し、案件の受領見積書は 409 で拒む', async () => {
      const seeded = await createLedgerQuotation('delete');

      const res = await request(app)
        .delete(`${BASE}/quotations/${seeded.id}`)
        .query({ updatedAt: seeded.updatedAt.toISOString() })
        .set('Authorization', auth(admin));

      expect(res.status).toBe(204);
      const stored = await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: seeded.id } });
      expect(stored.deletedAt).not.toBeNull();

      const projectSeeded = await createProjectQuotation('delete-ro');
      const readOnly = await request(app)
        .delete(`${BASE}/quotations/${projectSeeded.id}`)
        .query({ updatedAt: projectSeeded.updatedAt.toISOString() })
        .set('Authorization', auth(admin));
      expect(readOnly.status).toBe(409);
      expect(readOnly.body.code).toBe('LEDGER_PROJECT_QUOTATION_READ_ONLY');
      const kept = await prisma.receivedQuotation.findUniqueOrThrow({
        where: { id: projectSeeded.id },
      });
      expect(kept.deletedAt).toBeNull();
    });
  });

  describe('取り込み', () => {
    /**
     * @requirement unit-price-ledger/REQ-10.1
     * @requirement unit-price-ledger/REQ-2.1
     * @requirement unit-price-ledger/REQ-2.15
     */
    it('POST /imports が JSON と zip のカードを取り込み、結果を返す', async () => {
      const jsonCardId = `${PREFIX}-json-card`;
      const zipCardId = `${PREFIX}-zip-card`;
      const zip = Buffer.from(
        zipSync({ 'cards/zip-card.json': strToU8(JSON.stringify(validCard(zipCardId))) })
      );

      const res = await request(app)
        .post(`${BASE}/imports`)
        .set('Authorization', auth(admin))
        .attach('files', cardBuffer(validCard(jsonCardId)), {
          filename: '見積カード.json',
          contentType: 'application/json',
        })
        .attach('files', zip, { filename: 'cards.zip', contentType: 'application/zip' })
        .attach('files', Buffer.from('{ 読めない', 'utf8'), {
          filename: '壊れたカード.json',
          contentType: 'application/json',
        });

      expect(res.status).toBe(200);
      expect(res.body.importedCount).toBe(2);
      expect(res.body.skipped).toEqual([]);
      expect(res.body.failed).toHaveLength(1);
      expect(res.body.failed[0].fileName).toBe('壊れたカード.json');
      const stored = await prisma.receivedQuotation.findMany({
        where: { ledgerCardId: { in: [jsonCardId, zipCardId] }, deletedAt: null },
      });
      expect(stored).toHaveLength(2);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('POST /imports が 1 MB を超える JSON のファイルを 413 LEDGER_IMPORT_TOO_LARGE で拒み、登録しない', async () => {
      const cardId = `${PREFIX}-large-json`;
      const card = { ...validCard(cardId), 条件: 'あ'.repeat(MB) };

      const res = await request(app)
        .post(`${BASE}/imports`)
        .set('Authorization', auth(admin))
        .attach('files', cardBuffer(card), {
          filename: 'large.json',
          contentType: 'application/json',
        });

      expect(res.status).toBe(413);
      expect(res.body.code).toBe('LEDGER_IMPORT_TOO_LARGE');
      expect(await prisma.receivedQuotation.count({ where: { ledgerCardId: cardId } })).toBe(0);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('POST /imports が 50 MB を超えるファイルを 413 LEDGER_IMPORT_TOO_LARGE で拒む', async () => {
      const res = await request(app)
        .post(`${BASE}/imports`)
        .set('Authorization', auth(admin))
        .attach('files', Buffer.alloc(50 * MB + 1), {
          filename: 'too-large.zip',
          contentType: 'application/zip',
        });

      expect(res.status).toBe(413);
      expect(res.body.code).toBe('LEDGER_IMPORT_TOO_LARGE');
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('POST /imports が 2000 個を超えるファイルを 413 LEDGER_IMPORT_TOO_LARGE で拒み、登録しない', async () => {
      const cardId = `${PREFIX}-too-many`;
      let req = request(app).post(`${BASE}/imports`).set('Authorization', auth(admin));
      for (let i = 0; i < 2001; i += 1) {
        req = req.attach('files', cardBuffer(validCard(`${cardId}-${i}`)), {
          filename: `card-${i}.json`,
          contentType: 'application/json',
        });
      }

      const res = await req;

      expect(res.status).toBe(413);
      expect(res.body.code).toBe('LEDGER_IMPORT_TOO_LARGE');
      expect(
        await prisma.receivedQuotation.count({ where: { ledgerCardId: { startsWith: cardId } } })
      ).toBe(0);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.16
     */
    it('POST /imports が取り込みの途中の DB の断を 500 で返す', async () => {
      vi.spyOn(LedgerImportService.prototype, 'importCards').mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Can't reach database server", {
          code: 'P1001',
          clientVersion: 'test',
        })
      );

      const res = await request(app)
        .post(`${BASE}/imports`)
        .set('Authorization', auth(admin))
        .attach('files', cardBuffer(validCard(`${PREFIX}-outage`)), {
          filename: 'outage.json',
          contentType: 'application/json',
        });

      expect(res.status).toBe(500);
      expect(res.body.code).toBe('LEDGER_IMPORT_FAILED');
      expect(res.body).not.toHaveProperty('importedCount');
    });
  });

  describe('書き出し', () => {
    /**
     * @requirement unit-price-ledger/REQ-10.1
     * @requirement unit-price-ledger/REQ-6.1
     * @requirement unit-price-ledger/REQ-6.3
     */
    it('POST /exports が絞り込みの結果の Excel を返し、出力を記録する', async () => {
      const before = await exportRecordCount(admin.id);

      const res = await request(app)
        .post(`${BASE}/exports`)
        .set('Authorization', auth(admin))
        .send({ keyword: PREFIX })
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain(XLSX_MIME);
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename\*=UTF-8''%E5%8D%98%E4%BE%A1%E5%8F%B0%E5%B8%B3_\d{8}\.xlsx$/
      );
      const body = res.body as Buffer;
      // xlsx は zip（PK で始まる）
      expect(body.subarray(0, 2).toString('latin1')).toBe('PK');
      expect(await exportRecordCount(admin.id)).toBe(before + 1);
    });

    /**
     * @requirement unit-price-ledger/REQ-6.5
     */
    it('POST /exports が 0 件の結果を 400 LEDGER_EXPORT_EMPTY で拒む', async () => {
      const res = await request(app)
        .post(`${BASE}/exports`)
        .set('Authorization', auth(admin))
        .send({ keyword: `${PREFIX}-該当なし` });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('LEDGER_EXPORT_EMPTY');
    });

    /**
     * @requirement unit-price-ledger/REQ-6.4
     */
    it('POST /exports が出力の記録の失敗を 500 EXPORT_RECORD_FAILED で返し、ファイルを返さない', async () => {
      failExportRecord();

      const res = await request(app)
        .post(`${BASE}/exports`)
        .set('Authorization', auth(admin))
        .send({ keyword: PREFIX });

      expect(res.status).toBe(500);
      expect(res.headers['content-type']).not.toContain(XLSX_MIME);
      expect(res.headers['content-disposition']).toBeUndefined();
      expect(res.body.code).toBe('EXPORT_RECORD_FAILED');
      expect(res.body.detail).toBe('書き出しを記録できなかったため、出力を中止しました');
    });
  });

  describe('似た単価', () => {
    /**
     * @requirement unit-price-ledger/REQ-10.2
     * @requirement unit-price-ledger/REQ-7.2
     */
    it('POST /similar-prices が見積の編集の権限を持つ利用者に候補を返す', async () => {
      const res = await request(app)
        .post(`${BASE}/similar-prices`)
        .set('Authorization', auth(general))
        .send({ name: '軽量鉄骨天井下地', classificationKey: `${PREFIX}-K` });

      expect(res.status).toBe(200);
      const candidates = res.body.candidates as Array<{
        classificationKeyMatched: boolean;
        projectName: string | null;
        unit: string | null;
        quantity: string | null;
        allocation: { appliedUnitPrice: string };
      }>;
      const matched = candidates.filter((c) => c.classificationKeyMatched);
      expect(matched.length).toBeGreaterThanOrEqual(1);
      expect(candidates[0]!.classificationKeyMatched).toBe(true);
      expect(matched.map((c) => c.projectName)).toContain(`${PREFIX}-base-1-台帳案件`);
      expect(matched[0]).toMatchObject({ unit: '㎡', quantity: '100' });
      expect(matched[0]!.allocation.appliedUnitPrice).toBe('10');
    });

    /**
     * @requirement unit-price-ledger/REQ-7.1
     */
    it('POST /similar-prices が名称の無い問い合わせを 400 で拒む', async () => {
      const res = await request(app)
        .post(`${BASE}/similar-prices`)
        .set('Authorization', auth(general))
        .send({ name: '   ' });

      expect(res.status).toBe(400);
    });

    /**
     * @requirement unit-price-ledger/REQ-10.2
     * @requirement unit-price-ledger/REQ-10.4
     */
    it('見積の編集の権限の無い利用者の問い合わせを 403 で拒み、候補を返さない', async () => {
      const res = await request(app)
        .post(`${BASE}/similar-prices`)
        .set('Authorization', auth(noEstimate))
        .send({ name: '軽量鉄骨天井下地', classificationKey: `${PREFIX}-K` });

      expect(res.status).toBe(403);
      expectNoLedgerContent(res.body, PREFIX);
    });
  });

  describe('権限（user ロール）', () => {
    /**
     * @requirement unit-price-ledger/REQ-10.1
     * @requirement unit-price-ledger/REQ-10.4
     */
    it('一覧・詳細・書き出しの要求を 403 で拒み、内容を返さない', async () => {
      const before = await exportRecordCount(general.id);
      const responses = await Promise.all([
        request(app)
          .get(`${BASE}/quotations`)
          .query({ keyword: PREFIX })
          .set('Authorization', auth(general)),
        request(app)
          .get(`${BASE}/quotations/${ledgerQuotationId}`)
          .set('Authorization', auth(general)),
        request(app)
          .post(`${BASE}/exports`)
          .set('Authorization', auth(general))
          .send({ keyword: PREFIX }),
      ]);

      for (const res of responses) {
        expect(res.status).toBe(403);
        expect(res.headers['content-disposition']).toBeUndefined();
        expectNoLedgerContent(res.body, PREFIX);
      }
      expect(await exportRecordCount(general.id)).toBe(before);
    });

    /**
     * @requirement unit-price-ledger/REQ-10.1
     * @requirement unit-price-ledger/REQ-10.4
     */
    it('修正・印の更新・削除の要求を 403 で拒み、何も変えない', async () => {
      const seeded = await createLedgerQuotation('forbidden-edit');

      const put = await request(app)
        .put(`${BASE}/quotations/${seeded.id}`)
        .set('Authorization', auth(general))
        .send(updateBody(seeded, { vendorName: `${PREFIX}-保存されない業者` }));
      const patch = await request(app)
        .patch(`${BASE}/quotations/${seeded.id}/marks`)
        .set('Authorization', auth(general))
        .send({
          readingStatus: 'CONFIRMED',
          lineItems: [],
          expectedUpdatedAt: seeded.updatedAt.toISOString(),
        });
      const del = await request(app)
        .delete(`${BASE}/quotations/${seeded.id}`)
        .query({ updatedAt: seeded.updatedAt.toISOString() })
        .set('Authorization', auth(general));

      for (const res of [put, patch, del]) {
        expect(res.status).toBe(403);
        expectNoLedgerContent(res.body, PREFIX);
      }
      const stored = await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: seeded.id } });
      expect(stored.vendorName).toBe(seeded.vendorName);
      expect(stored.readingStatus).toBe(seeded.readingStatus);
      expect(stored.deletedAt).toBeNull();
      expect(stored.updatedAt.toISOString()).toBe(seeded.updatedAt.toISOString());
    });

    /**
     * @requirement unit-price-ledger/REQ-10.1
     * @requirement unit-price-ledger/REQ-10.4
     */
    it('取り込みの要求を 403 で拒み、カードを登録しない', async () => {
      const cardId = `${PREFIX}-forbidden-import`;

      const res = await request(app)
        .post(`${BASE}/imports`)
        .set('Authorization', auth(general))
        .attach('files', cardBuffer(validCard(cardId)), {
          filename: 'card.json',
          contentType: 'application/json',
        });

      expect(res.status).toBe(403);
      expectNoLedgerContent(res.body, PREFIX);
      expect(await prisma.receivedQuotation.count({ where: { ledgerCardId: cardId } })).toBe(0);
    });
  });
});
