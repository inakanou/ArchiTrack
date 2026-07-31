/**
 * @fileoverview 見積明細の一括保存API統合テスト（PUT /api/estimates/:id/save）
 *
 * 見積書編集画面から1回の保存操作で明細ツリー全体・帳票用入力項目を確定させる
 * 単一エンドポイントの統合テスト。実DB（architrack test, 127.0.0.1:5433）に対して、
 * 認証・権限・見積書の存在確認・リクエスト検証（400/422 の切り分け）・楽観ロック（409）・
 * 差分適用の永続化・レスポンス契約（EstimateDetailResponse + 最新ツリー）を検証する。
 *
 * Task 52.8: 一括保存エンドポイントの追加
 *
 * Requirements (estimate-creation):
 * - 42.1: 追加・削除・更新・並び順の変更・階層の変更を1回の保存操作でまとめて確定する
 * - 42.2: 保存成功時に保存後の最新の明細内容を返す（呼び出し元は追加取得しない）
 * - 42.4: 入力内容に不備がある場合は保存を開始せず不備の内容を返す（書き込みゼロ）
 * - 42.5: 保存操作の開始後に他ユーザーが更新していた場合は保存を中止する
 * - 54.8: 帳票用の追加入力項目の変更を保存操作で確定する
 *
 * Design: design.md「#### Backend / ##### estimate-draft.service」の API Contract
 * - PUT /api/estimates/:id/save | SaveEstimateDraftRequest | EstimateDetailResponse（最新ツリー）
 * - Errors: 400（形式不正）, 403（権限）, 404（見積書なし）, 409（競合）, 422（検証NG）, 500
 * - Preconditions: 認証済み・`estimate:update` 権限あり
 *
 * @module __tests__/integration/estimate-draft-save.api.integration.test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';

const PERMITTED_EMAIL = 'test-estimate-draft-save-permitted@example.com';
const NO_PERMISSION_EMAIL = 'test-estimate-draft-save-no-permission@example.com';
const PASSWORD = 'TestPassword123!';
const NON_EXISTENT_UUID = '12345678-1234-4234-a234-123456789012';

/** 明細行ペイロード（design.md の `SaveEstimateLine`: null 許容だが省略不可） */
const linePayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  lineType: 'ESTIMATE',
  name: null,
  specification: null,
  unit: null,
  quantity: null,
  unitPrice: null,
  amount: null,
  remarks: null,
  sourceVendorName: null,
  ...overrides,
});

/** 見積項目ノードペイロード（design.md の `SaveEstimateItemNode`） */
const nodePayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: null,
  tempId: null,
  itemType: 'STANDARD',
  lines: [linePayload()],
  children: [],
  ...overrides,
});

/** 帳票用入力項目ペイロード（54.1〜54.3） */
const reportFieldsPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  submissionDate: null,
  validityPeriod: null,
  separateWorks: [],
  ...overrides,
});

/**
 * 見積明細一括保存API統合テスト
 */
describe('Estimate Draft Save (PUT /api/estimates/:id/save) API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let noPermissionAccessToken: string;
  let testUserId: string;
  let testProjectId: string;

  const hashPassword = async (): Promise<string> => {
    return (await import('@node-rs/argon2')).hash(PASSWORD, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  };

  /** `estimate:update` を含む権限を持つユーザーを作成してログイン */
  const setupPermittedUser = async (): Promise<{ token: string; userId: string }> => {
    const passwordHash = await hashPassword();

    const user = await prisma.user.create({
      data: {
        email: PERMITTED_EMAIL,
        displayName: 'Estimate Draft Save Permitted User',
        passwordHash,
      },
    });

    const userRole = await prisma.role.findUnique({ where: { name: 'user' } });
    if (userRole) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: userRole.id } });
    }

    // 見積書関連の権限を明示的に投入（seedPermissions に含まれない場合に備える）
    await prisma.permission.createMany({
      data: [
        { resource: 'estimate', action: 'create', description: '見積書の作成' },
        { resource: 'estimate', action: 'read', description: '見積書の閲覧' },
        { resource: 'estimate', action: 'update', description: '見積書の更新' },
        { resource: 'estimate', action: 'delete', description: '見積書の削除' },
      ],
      skipDuplicates: true,
    });

    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: 'project', action: { in: ['create', 'read', 'update', 'delete'] } },
          { resource: 'estimate', action: { in: ['create', 'read', 'update', 'delete'] } },
        ],
      },
    });
    if (userRole && permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: userRole.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
    }

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: PERMITTED_EMAIL, password: PASSWORD });

    return { token: response.body.accessToken, userId: user.id };
  };

  /** ロール未割り当て＝`estimate:update` 権限なしのユーザーを作成してログイン */
  const setupNoPermissionUser = async (): Promise<string> => {
    const passwordHash = await hashPassword();

    await prisma.user.create({
      data: {
        email: NO_PERMISSION_EMAIL,
        displayName: 'Estimate Draft Save No Permission User',
        passwordHash,
      },
    });

    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: NO_PERMISSION_EMAIL, password: PASSWORD });

    return loginResponse.body.accessToken;
  };

  /**
   * 2階層・既存項目つきの見積書を作成する
   *
   * root1（見積/実行/業者の3行）
   *   └ child1（見積1行）
   * root2（見積1行）
   */
  const createSeededEstimate = async (
    name: string
  ): Promise<{ estimateId: string; root1Id: string; child1Id: string; root2Id: string }> => {
    const estimate = await prisma.estimate.create({
      data: { projectId: testProjectId, name },
    });

    const root1 = await prisma.estimateItem.create({
      data: {
        estimateId: estimate.id,
        parentId: null,
        itemType: 'STANDARD',
        displayOrder: 0,
        lines: {
          create: [
            { lineType: 'ESTIMATE', name: '既存ルート1', unit: '式', quantity: 1, unitPrice: 100 },
            { lineType: 'EXECUTION', name: '既存ルート1', unit: '式', quantity: 1, unitPrice: 80 },
            { lineType: 'VENDOR', name: '既存ルート1', unit: '式', quantity: 1, unitPrice: 70 },
          ],
        },
      },
    });

    const child1 = await prisma.estimateItem.create({
      data: {
        estimateId: estimate.id,
        parentId: root1.id,
        itemType: 'STANDARD',
        displayOrder: 0,
        lines: {
          create: [
            { lineType: 'ESTIMATE', name: '既存子1', unit: 'm2', quantity: 2, unitPrice: 50 },
          ],
        },
      },
    });

    const root2 = await prisma.estimateItem.create({
      data: {
        estimateId: estimate.id,
        parentId: null,
        itemType: 'STANDARD',
        displayOrder: 1,
        lines: {
          create: [
            { lineType: 'ESTIMATE', name: '既存ルート2', unit: '式', quantity: 1, unitPrice: 200 },
          ],
        },
      },
    });

    return {
      estimateId: estimate.id,
      root1Id: root1.id,
      child1Id: child1.id,
      root2Id: root2.id,
    };
  };

  /** 楽観ロック用に現在の updatedAt を ISO 文字列で取得 */
  const getExpectedUpdatedAt = async (estimateId: string): Promise<string> => {
    const estimate = await prisma.estimate.findUniqueOrThrow({
      where: { id: estimateId },
      select: { updatedAt: true },
    });
    return estimate.updatedAt.toISOString();
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const auth = await setupPermittedUser();
    accessToken = auth.token;
    testUserId = auth.userId;
    noPermissionAccessToken = await setupNoPermissionUser();

    testProjectId = (
      await prisma.project.create({
        data: {
          name: '一括保存テスト_プロジェクト',
          status: 'PREPARING',
          salesPersonId: testUserId,
          createdById: testUserId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (testProjectId) {
      await prisma.estimate.deleteMany({ where: { projectId: testProjectId } });
      await prisma.project.deleteMany({ where: { id: testProjectId } });
    }
    await prisma.user.deleteMany({
      where: { email: { in: [PERMITTED_EMAIL, NO_PERMISSION_EMAIL] } },
    });

    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(async () => {
    await prisma.estimate.deleteMany({ where: { projectId: testProjectId } });
  });

  // ==========================================
  // 認証・認可・存在確認（設計 API Contract: 403 / 404）
  // ==========================================
  describe('認証・認可・存在確認', () => {
    it('認証なしリクエストは401で拒否され、明細は変更されない', async () => {
      const { estimateId } = await createSeededEstimate('認証なし');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .send({ expectedUpdatedAt, reportFields: reportFieldsPayload(), items: [] });

      expect(response.status).toBe(401);

      const items = await prisma.estimateItem.findMany({ where: { estimateId } });
      expect(items).toHaveLength(3);
    });

    it('estimate:update 権限がないユーザーは403で拒否され、明細は変更されない', async () => {
      const { estimateId } = await createSeededEstimate('権限なし');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);

      expect(noPermissionAccessToken).toBeDefined();

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${noPermissionAccessToken}`)
        .send({ expectedUpdatedAt, reportFields: reportFieldsPayload(), items: [] });

      expect(response.status).toBe(403);

      const items = await prisma.estimateItem.findMany({ where: { estimateId } });
      expect(items).toHaveLength(3);
    });

    it('存在しない見積書IDは404を返す', async () => {
      const response = await request(app)
        .put(`/api/estimates/${NON_EXISTENT_UUID}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt: new Date().toISOString(),
          reportFields: reportFieldsPayload(),
          items: [],
        });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ESTIMATE_NOT_FOUND');
    });

    it('論理削除済みの見積書は404を返す', async () => {
      const { estimateId } = await createSeededEstimate('論理削除済み');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);
      await prisma.estimate.update({
        where: { id: estimateId },
        data: { deletedAt: new Date() },
      });

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expectedUpdatedAt, reportFields: reportFieldsPayload(), items: [] });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ESTIMATE_NOT_FOUND');
    });

    it('UUID形式でない見積書IDは400を返す', async () => {
      const response = await request(app)
        .put('/api/estimates/not-a-uuid/save')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt: new Date().toISOString(),
          reportFields: reportFieldsPayload(),
          items: [],
        });

      expect(response.status).toBe(400);
    });
  });

  // ==========================================
  // リクエスト検証: 400（形式不正）と 422（検証NG）の切り分け（42.4, 42.8）
  // ==========================================
  describe('リクエスト検証（400 形式不正 / 422 検証NG）', () => {
    it('expectedUpdatedAt が欠落したリクエストは400（形式不正）を返す', async () => {
      const { estimateId } = await createSeededEstimate('形式不正_expectedUpdatedAt欠落');

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reportFields: reportFieldsPayload(), items: [] });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('ノードのキーを省略した部分ペイロードは400（形式不正）を返す', async () => {
      const { estimateId } = await createSeededEstimate('形式不正_部分ペイロード');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          // `children` を省略した部分ペイロード（ワイヤ契約は省略不可）
          items: [{ id: null, tempId: 'tmp-1', itemType: 'STANDARD', lines: [linePayload()] }],
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('未知の itemType は400（形式不正）を返す', async () => {
      const { estimateId } = await createSeededEstimate('形式不正_itemType');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: [nodePayload({ tempId: 'tmp-1', itemType: 'UNKNOWN' })],
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('同一の既存IDが複数箇所に現れるツリーは422（検証NG）を返し、書き込みは発生しない', async () => {
      const { estimateId, root1Id } = await createSeededEstimate('検証NG_ID重複');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);
      const before = await prisma.estimateItem.findMany({
        where: { estimateId },
        orderBy: { id: 'asc' },
        select: { id: true, parentId: true, displayOrder: true },
      });

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: [nodePayload({ id: root1Id }), nodePayload({ id: root1Id })],
        });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('ESTIMATE_DRAFT_VALIDATION_ERROR');
      expect(response.body.details?.issues?.length).toBeGreaterThan(0);

      const after = await prisma.estimateItem.findMany({
        where: { estimateId },
        orderBy: { id: 'asc' },
        select: { id: true, parentId: true, displayOrder: true },
      });
      expect(after).toEqual(before);
    });

    it('識別子（id / tempId）を持たないノードは422（検証NG）を返す', async () => {
      const { estimateId } = await createSeededEstimate('検証NG_識別子なし');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: [nodePayload()],
        });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('ESTIMATE_DRAFT_VALIDATION_ERROR');
    });

    it('注記行（NOTE）に子を持たせたツリーは422（検証NG）を返す', async () => {
      const { estimateId } = await createSeededEstimate('検証NG_NOTEに子');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: [
            nodePayload({
              tempId: 'tmp-note',
              itemType: 'NOTE',
              children: [nodePayload({ tempId: 'tmp-child' })],
            }),
          ],
        });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('ESTIMATE_DRAFT_VALIDATION_ERROR');
    });

    it('他の見積書に属するIDを含むツリーは422（検証NG）を返す', async () => {
      const { estimateId } = await createSeededEstimate('検証NG_他見積書ID');
      const other = await createSeededEstimate('検証NG_他見積書ID_別');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: [nodePayload({ id: other.root1Id })],
        });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('ESTIMATE_DRAFT_VALIDATION_ERROR');
    });

    it('検証NGと競合が同時に成立する場合は422を優先する', async () => {
      const { estimateId, root1Id } = await createSeededEstimate('検証NG優先');

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt: new Date('2020-01-01T00:00:00.000Z').toISOString(),
          reportFields: reportFieldsPayload(),
          items: [nodePayload({ id: root1Id }), nodePayload({ id: root1Id })],
        });

      expect(response.status).toBe(422);
    });

    it('別途工事が6件のリクエストは400（形式不正）を返す', async () => {
      const { estimateId } = await createSeededEstimate('形式不正_別途工事6件');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload({
            separateWorks: ['1', '2', '3', '4', '5', '6'],
          }),
          items: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  // ==========================================
  // 楽観ロック（42.5）
  // ==========================================
  describe('楽観ロック（42.5）', () => {
    it('expectedUpdatedAt が最新でない場合は409を返し、明細は変更されない', async () => {
      const { estimateId, root1Id, child1Id, root2Id } = await createSeededEstimate('競合');

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt: new Date('2020-01-01T00:00:00.000Z').toISOString(),
          reportFields: reportFieldsPayload(),
          items: [nodePayload({ id: root1Id })],
        });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('ESTIMATE_CONFLICT');

      const remaining = await prisma.estimateItem.findMany({
        where: { estimateId },
        select: { id: true },
      });
      expect(remaining.map((item) => item.id).sort()).toEqual([root1Id, child1Id, root2Id].sort());
    });
  });

  // ==========================================
  // 保存成功（42.1, 42.2, 54.8）
  // ==========================================
  describe('保存成功', () => {
    it('見積書情報と最新ツリーを含むレスポンスを返す（追加取得を必要としない）', async () => {
      const { estimateId, root1Id, child1Id, root2Id } =
        await createSeededEstimate('保存成功_基本');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload({
            submissionDate: '2026-07-31',
            validityPeriod: '提出日より1ヶ月間',
            separateWorks: ['電気工事', '外構工事'],
          }),
          items: [
            nodePayload({
              id: root2Id,
              lines: [linePayload({ name: '既存ルート2（更新）', unitPrice: '250' })],
            }),
            nodePayload({
              id: root1Id,
              lines: [
                linePayload({
                  name: 'ルート1',
                  unit: '式',
                  quantity: '1',
                  unitPrice: '100',
                  amount: '100',
                }),
                linePayload({ lineType: 'EXECUTION', name: 'ルート1', unitPrice: '80' }),
                linePayload({ lineType: 'VENDOR', name: 'ルート1', unitPrice: '70' }),
              ],
              children: [
                nodePayload({ id: child1Id, lines: [linePayload({ name: '既存子1' })] }),
                nodePayload({ tempId: 'tmp-new-child', lines: [linePayload({ name: '新規子' })] }),
              ],
            }),
          ],
        });

      expect(response.status).toBe(200);

      // 見積書情報（design.md の EstimateDetailResponse 相当）
      expect(response.body.id).toBe(estimateId);
      expect(response.body.projectId).toBe(testProjectId);
      expect(response.body.name).toBe('保存成功_基本');
      expect(response.body.project).toEqual({
        id: testProjectId,
        name: '一括保存テスト_プロジェクト',
      });
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
      expect(new Date(response.body.updatedAt).getTime()).toBeGreaterThan(
        new Date(expectedUpdatedAt).getTime()
      );
      expect(response.body.itemCount).toBe(4);

      // 帳票用入力項目（54.8）
      expect(response.body.reportFields).toEqual({
        submissionDate: '2026-07-31',
        validityPeriod: '提出日より1ヶ月間',
        separateWorks: ['電気工事', '外構工事'],
      });

      // 最新ツリー（42.2）
      expect(response.body.items).toHaveLength(2);
      expect(response.body.items[0].id).toBe(root2Id);
      expect(response.body.items[0].displayOrder).toBe(0);
      expect(response.body.items[1].id).toBe(root1Id);
      expect(response.body.items[1].displayOrder).toBe(1);
      expect(response.body.items[1].children).toHaveLength(2);
      expect(response.body.items[1].children[0].id).toBe(child1Id);
      expect(response.body.items[1].children[1].id).not.toBe(child1Id);
      expect(response.body.items[1].children[1].lines[0].name).toBe('新規子');
      expect(response.body.items[1].lines).toHaveLength(3);

      // DBに永続化されていること
      const persisted = await prisma.estimateItem.findMany({
        where: { estimateId },
        select: { id: true, parentId: true, displayOrder: true },
      });
      expect(persisted).toHaveLength(4);
      const persistedRoot2 = persisted.find((item) => item.id === root2Id);
      expect(persistedRoot2?.displayOrder).toBe(0);
      expect(persistedRoot2?.parentId).toBeNull();

      const persistedEstimate = await prisma.estimate.findUniqueOrThrow({
        where: { id: estimateId },
        select: { validityPeriod: true, separateWorks: true },
      });
      expect(persistedEstimate.validityPeriod).toBe('提出日より1ヶ月間');
      expect(persistedEstimate.separateWorks).toEqual(['電気工事', '外構工事']);
    });

    it('ペイロードに含まれない既存項目とその子孫を削除する（42.1）', async () => {
      const { estimateId, root1Id, child1Id, root2Id } =
        await createSeededEstimate('保存成功_削除');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: [nodePayload({ id: root2Id, lines: [linePayload({ name: '残す' })] })],
        });

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].id).toBe(root2Id);

      const remaining = await prisma.estimateItem.findMany({
        where: { estimateId },
        select: { id: true },
      });
      expect(remaining.map((item) => item.id)).toEqual([root2Id]);
      expect(remaining.map((item) => item.id)).not.toContain(root1Id);
      expect(remaining.map((item) => item.id)).not.toContain(child1Id);
    });

    it('DISCOUNT / NOTE を含む新規ツリーを保存できる（enum・行UPSERTの実DB検証）', async () => {
      const estimate = await prisma.estimate.create({
        data: { projectId: testProjectId, name: '保存成功_種別' },
      });
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimate.id);

      const response = await request(app)
        .put(`/api/estimates/${estimate.id}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: [
            nodePayload({
              tempId: 'tmp-standard',
              lines: [
                linePayload({
                  name: '通常項目',
                  quantity: '2.5',
                  unitPrice: '1000',
                  amount: '2500',
                }),
                linePayload({ lineType: 'EXECUTION', name: '通常項目', unitPrice: '900' }),
                linePayload({
                  lineType: 'VENDOR',
                  name: '通常項目',
                  unitPrice: '850',
                  sourceVendorName: 'A社',
                }),
              ],
              children: [
                nodePayload({
                  tempId: 'tmp-note',
                  itemType: 'NOTE',
                  lines: [linePayload({ name: '注記です' })],
                }),
              ],
            }),
            nodePayload({
              tempId: 'tmp-discount',
              itemType: 'DISCOUNT',
              lines: [
                linePayload({
                  name: '値引き',
                  unit: '式',
                  quantity: '1',
                  unitPrice: '-500',
                  amount: '-500',
                }),
              ],
            }),
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(2);
      expect(response.body.items[0].itemType).toBe('STANDARD');
      expect(response.body.items[0].children[0].itemType).toBe('NOTE');
      expect(response.body.items[1].itemType).toBe('DISCOUNT');
      expect(response.body.items[1].lines[0].unitPrice).toBe(-500);

      const persistedTypes = await prisma.estimateItem.findMany({
        where: { estimateId: estimate.id },
        select: { itemType: true },
      });
      expect(persistedTypes.map((item) => item.itemType).sort()).toEqual([
        'DISCOUNT',
        'NOTE',
        'STANDARD',
      ]);

      const lineTypes = await prisma.estimateItemLine.findMany({
        where: { estimateItem: { estimateId: estimate.id } },
        select: { lineType: true },
      });
      expect(lineTypes).toHaveLength(5);
    });

    it('レスポンスの updatedAt をそのまま次の保存の expectedUpdatedAt として利用できる（42.5）', async () => {
      const { estimateId, root1Id, child1Id, root2Id } =
        await createSeededEstimate('保存成功_連続');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);

      const first = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: [
            nodePayload({ id: root1Id, children: [nodePayload({ id: child1Id })] }),
            nodePayload({ id: root2Id }),
          ],
        });
      expect(first.status).toBe(200);

      const second = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt: first.body.updatedAt,
          reportFields: reportFieldsPayload({ validityPeriod: '2回目' }),
          items: [nodePayload({ id: root2Id }), nodePayload({ id: root1Id })],
        });

      expect(second.status).toBe(200);
      expect(second.body.items.map((item: { id: string }) => item.id)).toEqual([root2Id, root1Id]);
      expect(second.body.reportFields.validityPeriod).toBe('2回目');
    });

    it('空のツリーを保存すると全明細が削除される', async () => {
      const { estimateId } = await createSeededEstimate('保存成功_全削除');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expectedUpdatedAt, reportFields: reportFieldsPayload(), items: [] });

      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([]);
      expect(response.body.itemCount).toBe(0);

      const remaining = await prisma.estimateItem.findMany({ where: { estimateId } });
      expect(remaining).toHaveLength(0);
    });
  });

  // ==========================================
  // 既存経路の維持（撤去は 53.12）
  // ==========================================
  describe('既存経路の維持', () => {
    it('GET /api/estimates/:id/items は引き続き利用でき、保存結果と一致する', async () => {
      const { estimateId, root1Id, child1Id } = await createSeededEstimate('既存経路維持');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);

      const saveResponse = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: [nodePayload({ id: root1Id, children: [nodePayload({ id: child1Id })] })],
        });
      expect(saveResponse.status).toBe(200);

      const itemsResponse = await request(app)
        .get(`/api/estimates/${estimateId}/items`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(itemsResponse.status).toBe(200);
      expect(itemsResponse.body).toHaveLength(1);
      expect(itemsResponse.body[0].id).toBe(root1Id);
      expect(itemsResponse.body[0].children[0].id).toBe(child1Id);
    });
  });
});
