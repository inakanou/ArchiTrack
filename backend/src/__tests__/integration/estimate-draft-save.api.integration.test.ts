/**
 * @fileoverview 見積明細の一括保存API統合テスト（PUT /api/estimates/:id/save）
 *
 * 見積書編集画面から1回の保存操作で明細ツリー全体・帳票用入力項目を確定させる
 * 単一エンドポイントの統合テスト。実DB（architrack test, 127.0.0.1:5433）に対して、
 * 認証・権限・見積書の存在確認・リクエスト検証（400/422 の切り分け）・楽観ロック（409）・
 * 差分適用の永続化・レスポンス契約（EstimateDetailResponse + 最新ツリー）を検証する。
 *
 * Task 52.8: 一括保存エンドポイントの追加
 * Task 52.9: 統合テスト（一括保存のセマンティクス）
 * Task 57.6: トランザクションの制限時間（実測で確定）と超過時のロールバック・応答（42.1, 42.3）
 *
 * Requirements (estimate-creation):
 * - 34.5: 変更後の並び順と階層をデータベースに反映し、再読み込み後も変更後の構造で表示する
 * - 34.6: 転記・案分・利益率適用・諸経費追加・値引き追加の結果を反映し、再読み込み後も表示する
 * - 42.1: 追加・削除・更新・並び順の変更・階層の変更を1回の保存操作でまとめて確定する
 * - 42.2: 保存成功時に保存後の最新の明細内容を返す（呼び出し元は追加取得しない）
 * - 42.4: 入力内容に不備がある場合は保存を開始せず不備の内容を返す（書き込みゼロ）
 * - 42.5: 保存操作の開始後に他ユーザーが更新していた場合は保存を中止する
 * - 42.9: 保存処理において既存の見積項目とその実行予算項目からの参照関係を維持する
 * - 54.8: 帳票用の追加入力項目の変更を保存操作で確定する
 *
 * Design: design.md「#### Backend / ##### estimate-draft.service」の API Contract
 * - PUT /api/estimates/:id/save | SaveEstimateDraftRequest | EstimateDetailResponse（最新ツリー）
 * - Errors: 400（形式不正）, 403（権限）, 404（見積書なし）, 409（競合）, 422（検証NG）, 500
 * - Preconditions: 認証済み・`estimate:update` 権限あり
 * - design.md「### Testing Strategy / #### Integration Tests」の 1〜4 に対応する
 *
 * @module __tests__/integration/estimate-draft-save.api.integration.test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { validateEnv } from '../../config/env.js';
import {
  PrismaClient as PrismaClientCtor,
  type PrismaClient,
} from '../../generated/prisma/client.js';
import { EstimateDraftService } from '../../services/estimate-draft.service.js';
import { EstimateSaveTimeoutError } from '../../errors/estimateError.js';

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

  /**
   * 複合操作（追加・削除・更新・並び替え・階層変更）の検証用に7項目の見積書を作成する
   *
   * A（0）3行
   *   A1（0）
   *   A2（1）
   * B（1）
   *   B1（0）
   * D（2）
   *   D1（0）
   */
  const createComplexEstimate = async (
    name: string
  ): Promise<{
    estimateId: string;
    aId: string;
    a1Id: string;
    a2Id: string;
    bId: string;
    b1Id: string;
    dId: string;
    d1Id: string;
  }> => {
    const estimate = await prisma.estimate.create({
      data: { projectId: testProjectId, name },
    });

    const createItem = async (
      parentId: string | null,
      displayOrder: number,
      label: string,
      unitPrice: number,
      withAllLineTypes = false
    ): Promise<string> => {
      const item = await prisma.estimateItem.create({
        data: {
          estimateId: estimate.id,
          parentId,
          itemType: 'STANDARD',
          displayOrder,
          lines: {
            create: withAllLineTypes
              ? [
                  { lineType: 'ESTIMATE', name: label, unit: '式', quantity: 1, unitPrice },
                  {
                    lineType: 'EXECUTION',
                    name: label,
                    unit: '式',
                    quantity: 1,
                    unitPrice: unitPrice - 10,
                  },
                  {
                    lineType: 'VENDOR',
                    name: label,
                    unit: '式',
                    quantity: 1,
                    unitPrice: unitPrice - 20,
                  },
                ]
              : [{ lineType: 'ESTIMATE', name: label, unit: '式', quantity: 1, unitPrice }],
          },
        },
      });
      return item.id;
    };

    const aId = await createItem(null, 0, '既存A', 100, true);
    const a1Id = await createItem(aId, 0, '既存A1', 50);
    const a2Id = await createItem(aId, 1, '既存A2', 60);
    const bId = await createItem(null, 1, '既存B', 200);
    const b1Id = await createItem(bId, 0, '既存B1', 70);
    const dId = await createItem(null, 2, '既存D', 300);
    const d1Id = await createItem(dId, 0, '既存D1', 80);

    return { estimateId: estimate.id, aId, a1Id, a2Id, bId, b1Id, dId, d1Id };
  };

  /**
   * 追加・削除・更新・並び替え・階層変更の5種すべてを含む1リクエストの `items`
   *
   * - 追加: `tmp-c` とその子 `tmp-c1`
   * - 削除: A2（ペイロード不在）と D（ペイロード不在。子 D1 は存続させる）
   * - 更新: A の3行すべてと B1 の行内容
   * - 並び替え: ルートを B → A → B1 → C の順にする（元は A → B → D）
   * - 階層変更: A1 を A → B へ、D1 を D（削除対象）→ A へ、B1 を B → ルートへ
   */
  const buildComplexSaveItems = (ids: {
    aId: string;
    a1Id: string;
    bId: string;
    b1Id: string;
    d1Id: string;
  }): Record<string, unknown>[] => [
    nodePayload({
      id: ids.bId,
      lines: [
        linePayload({
          name: 'B（更新）',
          unit: '式',
          quantity: '1',
          unitPrice: '210',
          amount: '210',
        }),
      ],
      children: [
        nodePayload({
          id: ids.a1Id,
          lines: [
            linePayload({
              name: 'A1（Bの子へ移動）',
              unit: 'm2',
              quantity: '3',
              unitPrice: '55',
              amount: '165',
            }),
          ],
        }),
      ],
    }),
    nodePayload({
      id: ids.aId,
      lines: [
        linePayload({
          name: 'A（更新）',
          unit: '式',
          quantity: '2',
          unitPrice: '150',
          amount: '300',
        }),
        linePayload({ lineType: 'EXECUTION', name: 'A（更新）', unitPrice: '120' }),
        linePayload({
          lineType: 'VENDOR',
          name: 'A（更新）',
          unitPrice: '110',
          sourceVendorName: '甲社',
        }),
      ],
      children: [
        nodePayload({
          id: ids.d1Id,
          lines: [
            linePayload({
              name: 'D1（削除される親からAの子へ移動）',
              unit: '式',
              quantity: '1',
              unitPrice: '80',
              amount: '80',
            }),
          ],
        }),
      ],
    }),
    nodePayload({
      id: ids.b1Id,
      lines: [
        linePayload({
          name: 'B1（ルートへ昇格）',
          unit: '式',
          quantity: '1',
          unitPrice: '77',
          amount: '77',
        }),
      ],
    }),
    nodePayload({
      tempId: 'tmp-c',
      lines: [
        linePayload({
          name: 'C（新規）',
          unit: '式',
          quantity: '1',
          unitPrice: '400',
          amount: '400',
        }),
      ],
      children: [
        nodePayload({
          tempId: 'tmp-c1',
          lines: [
            linePayload({
              name: 'C1（新規の子）',
              unit: '式',
              quantity: '1',
              unitPrice: '410',
              amount: '410',
            }),
          ],
        }),
      ],
    }),
  ];

  /** 見積項目の親子・並び順・種別のDB状態（IDをキーにした比較用） */
  const loadItemStateById = async (
    estimateId: string
  ): Promise<
    Record<string, { parentId: string | null; displayOrder: number; itemType: string }>
  > => {
    const items = await prisma.estimateItem.findMany({
      where: { estimateId },
      select: { id: true, parentId: true, displayOrder: true, itemType: true },
    });
    return Object.fromEntries(
      items.map((item) => [
        item.id,
        { parentId: item.parentId, displayOrder: item.displayOrder, itemType: item.itemType },
      ])
    );
  };

  /** 明細行の内容（行タイプ昇順・数値化済み） */
  const loadLineValues = async (
    estimateItemId: string
  ): Promise<
    {
      lineType: string;
      name: string | null;
      quantity: number | null;
      unitPrice: number | null;
      amount: number | null;
      sourceVendorName: string | null;
    }[]
  > => {
    const lines = await prisma.estimateItemLine.findMany({
      where: { estimateItemId },
      orderBy: { lineType: 'asc' },
    });
    return lines.map((line) => ({
      lineType: line.lineType,
      name: line.name,
      quantity: line.quantity === null ? null : Number(line.quantity),
      unitPrice: line.unitPrice === null ? null : Number(line.unitPrice),
      amount: line.amount === null ? null : Number(line.amount),
      sourceVendorName: line.sourceVendorName,
    }));
  };

  /** 競合検出の「データが変更されていない」を証明するための全明細スナップショット */
  const snapshotItems = async (estimateId: string): Promise<unknown> => {
    const items = await prisma.estimateItem.findMany({
      where: { estimateId },
      select: {
        id: true,
        parentId: true,
        displayOrder: true,
        itemType: true,
        updatedAt: true,
        lines: {
          select: {
            id: true,
            lineType: true,
            name: true,
            specification: true,
            unit: true,
            quantity: true,
            unitPrice: true,
            amount: true,
            remarks: true,
            sourceReceivedQuotationLineItemId: true,
            sourceVendorName: true,
            updatedAt: true,
          },
          orderBy: { lineType: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
    });
    // Decimal はインスタンス比較になるため文字列へ正規化する
    return JSON.parse(JSON.stringify(items)) as unknown;
  };

  /**
   * 見積項目を参照する実行予算項目を1件作成する（42.9）
   *
   * `ExecutionBudgetItem.estimateItemId` は `onDelete: SetNull` のため、
   * 見積項目が削除＋再作成されると参照が NULL に落ちる。
   */
  const createExecutionBudgetItemFor = async (
    estimateId: string,
    estimateItemId: string
  ): Promise<string> => {
    const contract = await prisma.contract.create({
      data: {
        projectId: testProjectId,
        contractType: 'NEW',
        status: 'CONTRACTED',
        estimateId,
        contractDate: new Date('2026-01-01'),
        constructionStartDate: new Date('2026-02-01'),
        constructionEndDate: new Date('2026-12-31'),
        deliveryDate: new Date('2027-01-15'),
      },
    });

    const budget = await prisma.executionBudget.create({
      data: { projectId: testProjectId, contractId: contract.id },
    });

    const budgetItem = await prisma.executionBudgetItem.create({
      data: {
        executionBudgetId: budget.id,
        estimateItemId,
        displayOrder: 0,
        name: '実行予算項目',
        unit: '式',
        quantity: 1,
        estimateUnitPrice: 100,
      },
    });

    return budgetItem.id;
  };

  /** 実行予算・契約の後始末（`ExecutionBudget.projectId` は一意のためテストごとに消す） */
  const cleanupExecutionBudget = async (): Promise<void> => {
    await prisma.executionBudget.deleteMany({ where: { projectId: testProjectId } });
    await prisma.contract.deleteMany({ where: { projectId: testProjectId } });
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
      // 実行予算 → 契約の順に消す（`ExecutionBudget.contractId` は必須リレーション）
      await cleanupExecutionBudget();
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

  // ==========================================
  // 複合操作を含む1リクエスト（42.1, 34.5）
  // design.md「Testing Strategy / Integration Tests」1
  // ==========================================
  describe('追加・削除・更新・並び替え・階層変更を含む1リクエスト（42.1, 34.5）', () => {
    it('5種の操作を1リクエストで確定し、保存後のDB状態が期待どおりになる', async () => {
      const ids = await createComplexEstimate('複合操作_5種');
      const expectedUpdatedAt = await getExpectedUpdatedAt(ids.estimateId);

      const response = await request(app)
        .put(`/api/estimates/${ids.estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: buildComplexSaveItems(ids),
        });

      expect(response.status).toBe(200);
      expect(response.body.itemCount).toBe(7);

      // 新規項目のIDはレスポンスから取得する（追加取得を必要としない、42.2）
      const cId = response.body.items[3].id as string;
      const c1Id = response.body.items[3].children[0].id as string;
      expect(cId).not.toBe(c1Id);

      // ===== 見積項目の親子・並び順・種別を網羅的に検証 =====
      const state = await loadItemStateById(ids.estimateId);
      expect(Object.keys(state).sort()).toEqual(
        [ids.aId, ids.a1Id, ids.bId, ids.b1Id, ids.d1Id, cId, c1Id].sort()
      );
      expect(state[ids.bId]).toEqual({ parentId: null, displayOrder: 0, itemType: 'STANDARD' });
      expect(state[ids.a1Id]).toEqual({
        parentId: ids.bId,
        displayOrder: 0,
        itemType: 'STANDARD',
      });
      expect(state[ids.aId]).toEqual({ parentId: null, displayOrder: 1, itemType: 'STANDARD' });
      expect(state[ids.d1Id]).toEqual({
        parentId: ids.aId,
        displayOrder: 0,
        itemType: 'STANDARD',
      });
      expect(state[ids.b1Id]).toEqual({ parentId: null, displayOrder: 2, itemType: 'STANDARD' });
      expect(state[cId]).toEqual({ parentId: null, displayOrder: 3, itemType: 'STANDARD' });
      expect(state[c1Id]).toEqual({ parentId: cId, displayOrder: 0, itemType: 'STANDARD' });

      // 削除: A2 と D（Dの子 D1 は別の親へ移動したので存続する）
      expect(state[ids.a2Id]).toBeUndefined();
      expect(state[ids.dId]).toBeUndefined();

      // ===== 明細行の値を網羅的に検証 =====
      expect(await loadLineValues(ids.aId)).toEqual([
        {
          lineType: 'ESTIMATE',
          name: 'A（更新）',
          quantity: 2,
          unitPrice: 150,
          amount: 300,
          sourceVendorName: null,
        },
        {
          lineType: 'EXECUTION',
          name: 'A（更新）',
          quantity: null,
          unitPrice: 120,
          amount: null,
          sourceVendorName: null,
        },
        {
          lineType: 'VENDOR',
          name: 'A（更新）',
          quantity: null,
          unitPrice: 110,
          amount: null,
          sourceVendorName: '甲社',
        },
      ]);
      expect(await loadLineValues(ids.bId)).toEqual([
        {
          lineType: 'ESTIMATE',
          name: 'B（更新）',
          quantity: 1,
          unitPrice: 210,
          amount: 210,
          sourceVendorName: null,
        },
      ]);
      expect(await loadLineValues(ids.a1Id)).toEqual([
        {
          lineType: 'ESTIMATE',
          name: 'A1（Bの子へ移動）',
          quantity: 3,
          unitPrice: 55,
          amount: 165,
          sourceVendorName: null,
        },
      ]);
      expect(await loadLineValues(ids.d1Id)).toEqual([
        {
          lineType: 'ESTIMATE',
          name: 'D1（削除される親からAの子へ移動）',
          quantity: 1,
          unitPrice: 80,
          amount: 80,
          sourceVendorName: null,
        },
      ]);
      expect(await loadLineValues(ids.b1Id)).toEqual([
        {
          lineType: 'ESTIMATE',
          name: 'B1（ルートへ昇格）',
          quantity: 1,
          unitPrice: 77,
          amount: 77,
          sourceVendorName: null,
        },
      ]);
      expect(await loadLineValues(cId)).toEqual([
        {
          lineType: 'ESTIMATE',
          name: 'C（新規）',
          quantity: 1,
          unitPrice: 400,
          amount: 400,
          sourceVendorName: null,
        },
      ]);
      expect(await loadLineValues(c1Id)).toEqual([
        {
          lineType: 'ESTIMATE',
          name: 'C1（新規の子）',
          quantity: 1,
          unitPrice: 410,
          amount: 410,
          sourceVendorName: null,
        },
      ]);

      // 削除された項目の明細行も残っていない（子孫の連鎖削除）
      const orphanLines = await prisma.estimateItemLine.findMany({
        where: { estimateItemId: { in: [ids.a2Id, ids.dId] } },
      });
      expect(orphanLines).toHaveLength(0);

      // 明細行の総数（A の3行＋他6項目の1行ずつ）
      const totalLines = await prisma.estimateItemLine.count({
        where: { estimateItem: { estimateId: ids.estimateId } },
      });
      expect(totalLines).toBe(9);
    });

    it('再読み込み（GET /:id/items）でも変更後の並び順と階層が維持される（34.5）', async () => {
      const ids = await createComplexEstimate('複合操作_再読み込み');
      const expectedUpdatedAt = await getExpectedUpdatedAt(ids.estimateId);

      const saveResponse = await request(app)
        .put(`/api/estimates/${ids.estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: buildComplexSaveItems(ids),
        });
      expect(saveResponse.status).toBe(200);

      const reloaded = await request(app)
        .get(`/api/estimates/${ids.estimateId}/items`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(reloaded.status).toBe(200);
      expect(reloaded.body.map((item: { id: string }) => item.id)).toEqual([
        ids.bId,
        ids.aId,
        ids.b1Id,
        saveResponse.body.items[3].id,
      ]);
      expect(reloaded.body[0].children.map((item: { id: string }) => item.id)).toEqual([ids.a1Id]);
      expect(reloaded.body[1].children.map((item: { id: string }) => item.id)).toEqual([ids.d1Id]);
      expect(reloaded.body[2].children).toEqual([]);
      expect(reloaded.body[3].children).toHaveLength(1);
    });

    it('バインドパラメータ上限で分割される大量ペイロードも1リクエストで確定する', async () => {
      // `estimate-draft.service.ts` の `chunkByBindParameters`
      // （`MAX_BIND_PARAMETERS_PER_STATEMENT = 30000` で分割）を実DBに対して実行する経路。
      // 1000項目 × 3行 = 3000行、1行11パラメータで 33000個となり、明細行の一括UPSERTは
      // 1文あたり floor(30000/11) = 2727行 ＝ 909項目ずつ、計2文に分割される
      // （項目の一括UPDATEは 1000×4 = 4000 パラメータで1文のまま）。
      //
      // 件数は分割が起きる最小規模側に寄せている。design.md「Testing Strategy /
      // Performance Tests」2 が大規模ペイロードの応答時間測定を性能テストへ割り当てているため、
      // ここでは所要時間ではなく「分割された複数文が単一トランザクションで整合して確定すること」
      // だけを検証する。`SAVE_ESTIMATE_MAX_ITEMS`（2000）いっぱいの規模での応答時間測定は
      // タスク 57.2（性能実測）が担当する。
      const estimate = await prisma.estimate.create({
        data: { projectId: testProjectId, name: '複合操作_分割実行' },
      });
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimate.id);

      const itemCount = 1000;
      const items = Array.from({ length: itemCount }, (_, index) =>
        nodePayload({
          tempId: `tmp-${index}`,
          lines: [
            linePayload({
              name: `分割${index}`,
              unit: '式',
              quantity: '1',
              unitPrice: String(index),
              amount: String(index),
            }),
            linePayload({ lineType: 'EXECUTION', name: `分割${index}`, unitPrice: String(index) }),
            linePayload({ lineType: 'VENDOR', name: `分割${index}`, unitPrice: String(index) }),
          ],
        })
      );

      const response = await request(app)
        .put(`/api/estimates/${estimate.id}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expectedUpdatedAt, reportFields: reportFieldsPayload(), items });

      expect(response.status).toBe(200);
      expect(response.body.itemCount).toBe(itemCount);

      const persistedItemCount = await prisma.estimateItem.count({
        where: { estimateId: estimate.id },
      });
      expect(persistedItemCount).toBe(itemCount);

      const persistedLineCount = await prisma.estimateItemLine.count({
        where: { estimateItem: { estimateId: estimate.id } },
      });
      expect(persistedLineCount).toBe(itemCount * 3);

      // 分割境界（1文あたり 30000/11 = 2727行 ＝ 909項目）をまたぐ位置の内容を確認する
      for (const index of [0, 908, 909, itemCount - 1]) {
        const itemId = response.body.items[index].id as string;
        expect(await loadLineValues(itemId)).toEqual([
          {
            lineType: 'ESTIMATE',
            name: `分割${index}`,
            quantity: 1,
            unitPrice: index,
            amount: index,
            sourceVendorName: null,
          },
          {
            lineType: 'EXECUTION',
            name: `分割${index}`,
            quantity: null,
            unitPrice: index,
            amount: null,
            sourceVendorName: null,
          },
          {
            lineType: 'VENDOR',
            name: `分割${index}`,
            quantity: null,
            unitPrice: index,
            amount: null,
            sourceVendorName: null,
          },
        ]);
      }
    }, 60000);
  });

  // ==========================================
  // 実行予算項目からの参照維持（42.9）
  // design.md「Testing Strategy / Integration Tests」4
  // ==========================================
  describe('実行予算項目からの参照維持（42.9）', () => {
    afterEach(async () => {
      await cleanupExecutionBudget();
    });

    it('更新・並び替え・階層変更を受けた見積項目への参照が同じIDのまま維持される', async () => {
      const ids = await createComplexEstimate('参照維持_更新と階層変更');
      // 階層変更・並び替え・内容更新のすべてを受ける A1 を参照させる
      const budgetItemId = await createExecutionBudgetItemFor(ids.estimateId, ids.a1Id);
      const expectedUpdatedAt = await getExpectedUpdatedAt(ids.estimateId);

      const response = await request(app)
        .put(`/api/estimates/${ids.estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: buildComplexSaveItems(ids),
        });

      expect(response.status).toBe(200);

      const budgetItem = await prisma.executionBudgetItem.findUniqueOrThrow({
        where: { id: budgetItemId },
        include: { estimateItem: { select: { id: true, parentId: true, displayOrder: true } } },
      });

      // 参照は切れず、同じ見積項目IDを指し続ける（削除＋再作成をしていない証拠）
      expect(budgetItem.estimateItemId).toBe(ids.a1Id);
      expect(budgetItem.estimateItem).toEqual({
        id: ids.a1Id,
        parentId: ids.bId,
        displayOrder: 0,
      });

      // 同一リクエストで削除された兄弟（A2）と親（D）の分だけが消えている
      const state = await loadItemStateById(ids.estimateId);
      expect(state[ids.a1Id]).toEqual({
        parentId: ids.bId,
        displayOrder: 0,
        itemType: 'STANDARD',
      });
      expect(state[ids.a2Id]).toBeUndefined();
      expect(state[ids.dId]).toBeUndefined();
    });

    it('参照先の見積項目が保存で削除された場合は参照がNULLになり、保存自体は成功する', async () => {
      const ids = await createComplexEstimate('参照維持_削除時はNULL');
      // ペイロードから外れて削除される A2 を参照させる
      const budgetItemId = await createExecutionBudgetItemFor(ids.estimateId, ids.a2Id);
      const expectedUpdatedAt = await getExpectedUpdatedAt(ids.estimateId);

      const response = await request(app)
        .put(`/api/estimates/${ids.estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: buildComplexSaveItems(ids),
        });

      expect(response.status).toBe(200);

      const budgetItem = await prisma.executionBudgetItem.findUniqueOrThrow({
        where: { id: budgetItemId },
      });
      // 実行予算項目そのものは消えず、参照だけが NULL になる（onDelete: SetNull）
      expect(budgetItem.estimateItemId).toBeNull();
      expect(budgetItem.name).toBe('実行予算項目');
    });

    it('連鎖削除された子孫を参照していた場合も参照がNULLになり、保存自体は成功する', async () => {
      const { estimateId, root1Id, child1Id, root2Id } =
        await createSeededEstimate('参照維持_連鎖削除時はNULL');
      // 親 root1 の削除に伴い cascade で消える child1 を参照させる
      const budgetItemId = await createExecutionBudgetItemFor(estimateId, child1Id);
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

      const remaining = await prisma.estimateItem.findMany({
        where: { estimateId },
        select: { id: true },
      });
      expect(remaining.map((item) => item.id)).toEqual([root2Id]);
      expect(remaining.map((item) => item.id)).not.toContain(root1Id);

      const budgetItem = await prisma.executionBudgetItem.findUniqueOrThrow({
        where: { id: budgetItemId },
      });
      expect(budgetItem.estimateItemId).toBeNull();
    });

    it('明細行のIDと転記元参照が保存をまたいで維持される（34.6, 42.9）', async () => {
      const { estimateId, root1Id, child1Id } = await createSeededEstimate('参照維持_行ID');
      const sourceLineItemId = '3f1c0f6a-1f2e-4a3b-9c4d-5e6f7a8b9c0d';
      await prisma.estimateItemLine.updateMany({
        where: { estimateItemId: root1Id, lineType: 'VENDOR' },
        data: {
          sourceReceivedQuotationLineItemId: sourceLineItemId,
          sourceVendorName: '転記元業者',
        },
      });

      const linesBefore = await prisma.estimateItemLine.findMany({
        where: { estimateItemId: root1Id },
        orderBy: { lineType: 'asc' },
        select: { id: true, lineType: true },
      });
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: [
            nodePayload({
              id: root1Id,
              lines: [
                linePayload({ name: '更新後', unit: '式', quantity: '1', unitPrice: '111' }),
                linePayload({ lineType: 'EXECUTION', name: '更新後', unitPrice: '88' }),
                linePayload({
                  lineType: 'VENDOR',
                  name: '更新後',
                  unitPrice: '77',
                  sourceVendorName: '転記元業者',
                }),
              ],
              children: [nodePayload({ id: child1Id, lines: [linePayload({ name: '子' })] })],
            }),
          ],
        });

      expect(response.status).toBe(200);

      const linesAfter = await prisma.estimateItemLine.findMany({
        where: { estimateItemId: root1Id },
        orderBy: { lineType: 'asc' },
        select: {
          id: true,
          lineType: true,
          name: true,
          unitPrice: true,
          sourceReceivedQuotationLineItemId: true,
        },
      });

      // 行IDは維持される（削除＋再作成をしていない）
      expect(linesAfter.map((line) => ({ id: line.id, lineType: line.lineType }))).toEqual(
        linesBefore
      );
      // 保存ペイロードに含まれない転記元参照は既存値のまま残る
      expect(
        linesAfter.find((line) => line.lineType === 'VENDOR')?.sourceReceivedQuotationLineItemId
      ).toBe(sourceLineItemId);
      expect(
        linesAfter.find((line) => line.lineType === 'ESTIMATE')?.sourceReceivedQuotationLineItemId
      ).toBeNull();
      // 内容は更新されている
      expect(linesAfter.map((line) => Number(line.unitPrice))).toEqual([111, 88, 77]);
    });
  });

  // ==========================================
  // 競合時の応答とデータ不変性（42.5）
  // design.md「Testing Strategy / Integration Tests」2
  // ==========================================
  describe('競合時の応答とデータ不変性（42.5）', () => {
    it('先に他ユーザーの保存が確定した後の保存は409になり、確定済みデータが一切変更されない', async () => {
      const ids = await createComplexEstimate('競合_他ユーザー先行保存');

      // セッションA が編集を開始した時点の基準時刻
      const staleUpdatedAt = await getExpectedUpdatedAt(ids.estimateId);

      // セッションB が先に保存を確定させる
      const firstSave = await request(app)
        .put(`/api/estimates/${ids.estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt: staleUpdatedAt,
          reportFields: reportFieldsPayload({
            submissionDate: '2026-07-31',
            validityPeriod: 'Bの保存',
            separateWorks: ['B工事'],
          }),
          items: buildComplexSaveItems(ids),
        });
      expect(firstSave.status).toBe(200);

      const itemsAfterFirstSave = await snapshotItems(ids.estimateId);
      const estimateAfterFirstSave = await prisma.estimate.findUniqueOrThrow({
        where: { id: ids.estimateId },
        select: {
          updatedAt: true,
          submissionDate: true,
          validityPeriod: true,
          separateWorks: true,
        },
      });

      // セッションA が古い基準時刻のまま保存しようとする
      const conflictingSave = await request(app)
        .put(`/api/estimates/${ids.estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt: staleUpdatedAt,
          reportFields: reportFieldsPayload({ validityPeriod: 'Aの保存' }),
          items: [nodePayload({ id: ids.aId, lines: [linePayload({ name: 'Aの上書き' })] })],
        });

      expect(conflictingSave.status).toBe(409);
      expect(conflictingSave.body.code).toBe('ESTIMATE_CONFLICT');

      // 明細（親子・並び順・行の全列・行ID・更新時刻）が1つも変わっていない
      expect(await snapshotItems(ids.estimateId)).toEqual(itemsAfterFirstSave);

      // 見積書側（帳票用入力項目・更新時刻）も変わっていない
      const estimateAfterConflict = await prisma.estimate.findUniqueOrThrow({
        where: { id: ids.estimateId },
        select: {
          updatedAt: true,
          submissionDate: true,
          validityPeriod: true,
          separateWorks: true,
        },
      });
      expect(estimateAfterConflict).toEqual(estimateAfterFirstSave);
      expect(estimateAfterConflict.validityPeriod).toBe('Bの保存');
    });
  });

  // ==========================================
  // 保存応答の最新ツリー（42.2）
  // design.md「Testing Strategy / Integration Tests」— 追加取得を必要としない
  // ==========================================
  describe('保存応答に含まれる最新の明細ツリー（42.2）', () => {
    it('複合操作の保存応答の明細ツリーが、直後の再取得結果と完全に一致する', async () => {
      const ids = await createComplexEstimate('最新ツリー_再取得と一致');
      const expectedUpdatedAt = await getExpectedUpdatedAt(ids.estimateId);

      const saveResponse = await request(app)
        .put(`/api/estimates/${ids.estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: buildComplexSaveItems(ids),
        });
      expect(saveResponse.status).toBe(200);

      const itemsResponse = await request(app)
        .get(`/api/estimates/${ids.estimateId}/items`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(itemsResponse.status).toBe(200);

      // 保存応答のツリーだけで画面を再構成できる＝追加取得を必要としない
      expect(saveResponse.body.items).toEqual(itemsResponse.body);
      expect(saveResponse.body.items).toHaveLength(4);

      // 見積書サマリも `GET /api/estimates/:id` と一致する
      const detailResponse = await request(app)
        .get(`/api/estimates/${ids.estimateId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(detailResponse.status).toBe(200);
      expect(saveResponse.body.id).toBe(detailResponse.body.id);
      expect(saveResponse.body.name).toBe(detailResponse.body.name);
      expect(saveResponse.body.projectId).toBe(detailResponse.body.projectId);
      expect(saveResponse.body.updatedAt).toBe(detailResponse.body.updatedAt);
      expect(saveResponse.body.itemCount).toBe(detailResponse.body.itemCount);
    });

    it('注記行・値引き行を含むツリーでも保存応答と再取得結果が一致する（55.1）', async () => {
      const estimate = await prisma.estimate.create({
        data: { projectId: testProjectId, name: '最新ツリー_種別混在' },
      });
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimate.id);

      const saveResponse = await request(app)
        .put(`/api/estimates/${estimate.id}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: [
            nodePayload({
              tempId: 'tmp-standard',
              lines: [linePayload({ name: '通常', unit: '式', quantity: '1', unitPrice: '1000' })],
              children: [
                nodePayload({
                  tempId: 'tmp-note',
                  itemType: 'NOTE',
                  lines: [linePayload({ name: '注記' })],
                }),
              ],
            }),
            nodePayload({
              tempId: 'tmp-discount',
              itemType: 'DISCOUNT',
              lines: [
                linePayload({ name: '値引き', unit: '式', quantity: '1', unitPrice: '-500' }),
              ],
            }),
          ],
        });
      expect(saveResponse.status).toBe(200);

      const itemsResponse = await request(app)
        .get(`/api/estimates/${estimate.id}/items`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(itemsResponse.status).toBe(200);

      expect(saveResponse.body.items).toEqual(itemsResponse.body);
      expect(saveResponse.body.items[0].children[0].itemType).toBe('NOTE');
      expect(saveResponse.body.items[1].itemType).toBe('DISCOUNT');
    });
  });

  // ==========================================
  // 転記・案分・利益率適用等の結果の永続化（34.6）
  // ==========================================
  describe('計算結果の永続化と再読み込み（34.6）', () => {
    it('転記・案分・利益率適用の結果（小数を含む3行タイプ）が保存され再読み込みで一致する', async () => {
      const { estimateId, root1Id, child1Id, root2Id } =
        await createSeededEstimate('計算結果_永続化');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);

      const saveResponse = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: [
            nodePayload({
              id: root1Id,
              lines: [
                // 親項目の金額合計（クライアントで再計算した結果をそのまま永続化する）
                linePayload({ name: '親', unit: '式', quantity: '1', amount: '2893.68' }),
                linePayload({ lineType: 'EXECUTION', name: '親', amount: '2600.00' }),
                // 業者金額行はペイロードから外す（＝行タイプ単位の削除）
              ],
              children: [
                nodePayload({
                  id: child1Id,
                  lines: [
                    // 利益率適用後の単価と数量×単価の金額
                    linePayload({
                      name: '案分後',
                      unit: 'm2',
                      quantity: '2.3456',
                      unitPrice: '1234.56',
                      amount: '2895.16',
                      remarks: '利益率10%適用',
                    }),
                    // 転記結果（業者名スナップショット付き）
                    linePayload({
                      lineType: 'VENDOR',
                      name: '案分後',
                      unit: 'm2',
                      quantity: '2.3456',
                      unitPrice: '1000.00',
                      amount: '2345.60',
                      sourceVendorName: '乙建設',
                    }),
                  ],
                }),
              ],
            }),
            // 値引き行の追加結果（負数）
            nodePayload({
              id: root2Id,
              itemType: 'DISCOUNT',
              lines: [
                linePayload({
                  name: '値引き',
                  unit: '式',
                  quantity: '1',
                  unitPrice: '-1500.50',
                  amount: '-1500.50',
                }),
              ],
            }),
          ],
        });

      expect(saveResponse.status).toBe(200);

      // 再読み込みしても同じ値が返る
      const reloaded = await request(app)
        .get(`/api/estimates/${estimateId}/items`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(reloaded.status).toBe(200);
      expect(reloaded.body).toEqual(saveResponse.body.items);

      // 案分・利益率の結果が小数精度を保って永続化されている
      expect(await loadLineValues(child1Id)).toEqual([
        {
          lineType: 'ESTIMATE',
          name: '案分後',
          quantity: 2.3456,
          unitPrice: 1234.56,
          amount: 2895.16,
          sourceVendorName: null,
        },
        {
          lineType: 'VENDOR',
          name: '案分後',
          quantity: 2.3456,
          unitPrice: 1000,
          amount: 2345.6,
          sourceVendorName: '乙建設',
        },
      ]);

      // 転記元業者名と備考も永続化されている
      const childEstimateLine = await prisma.estimateItemLine.findFirstOrThrow({
        where: { estimateItemId: child1Id, lineType: 'ESTIMATE' },
      });
      expect(childEstimateLine.remarks).toBe('利益率10%適用');

      // 親の合計金額が反映され、ペイロードから外した業者金額行は削除されている
      expect(await loadLineValues(root1Id)).toEqual([
        {
          lineType: 'ESTIMATE',
          name: '親',
          quantity: 1,
          unitPrice: null,
          amount: 2893.68,
          sourceVendorName: null,
        },
        {
          lineType: 'EXECUTION',
          name: '親',
          quantity: null,
          unitPrice: null,
          amount: 2600,
          sourceVendorName: null,
        },
      ]);

      // 値引き行の追加結果（負数）が種別ごと永続化されている（41.3, 41.5）
      const persistedRoot2 = await prisma.estimateItem.findUniqueOrThrow({
        where: { id: root2Id },
        select: { itemType: true },
      });
      expect(persistedRoot2.itemType).toBe('DISCOUNT');
      expect(await loadLineValues(root2Id)).toEqual([
        {
          lineType: 'ESTIMATE',
          name: '値引き',
          quantity: 1,
          unitPrice: -1500.5,
          amount: -1500.5,
          sourceVendorName: null,
        },
      ]);
    });
  });

  // ==========================================
  // 形式不正と検証NGが同時に含まれるペイロード（42.4, 42.8）
  // ==========================================
  describe('形式不正と検証NGの混在ペイロード', () => {
    it('形式不正とツリー構造の検証NGを同時に含むリクエストは400を返し、書き込みは発生しない', async () => {
      const { estimateId, root1Id } = await createSeededEstimate('混在_形式不正と検証NG');
      const expectedUpdatedAt = await getExpectedUpdatedAt(estimateId);
      const before = await snapshotItems(estimateId);

      const response = await request(app)
        .put(`/api/estimates/${estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          // 形式不正: 別途工事が上限（5件）超過
          reportFields: reportFieldsPayload({
            separateWorks: ['1', '2', '3', '4', '5', '6'],
          }),
          // 検証NG: 同一の既存IDが複数箇所に現れる
          items: [nodePayload({ id: root1Id }), nodePayload({ id: root1Id })],
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');

      expect(await snapshotItems(estimateId)).toEqual(before);
      const estimate = await prisma.estimate.findUniqueOrThrow({
        where: { id: estimateId },
        select: { updatedAt: true, separateWorks: true },
      });
      expect(estimate.updatedAt.toISOString()).toBe(expectedUpdatedAt);
      expect(estimate.separateWorks).toEqual([]);
    });
  });

  // ==========================================
  // トランザクションの制限時間と超過時のロールバック（42.1, 42.3 / Task 57.6）
  //
  // モックで `$transaction` の引数を覗くだけでは「渡している」ことしか言えないため、
  // ここでは**実DBの行ロックで保存処理を実際に待たせて**、設定した制限時間が
  // 本当に効いているか（超えれば失敗し、超えなければ成功するか）を境界の両側から固定する。
  // ==========================================
  describe('トランザクションの制限時間と超過時のロールバック（42.1, 42.3）', () => {
    /**
     * 期待値はリテラルで持つ（本番定数をそのまま参照すると、定数を書き換えたときに
     * 期待値も一緒に動いてしまい、実測で確定した値を固定できないため）
     */
    const EXPECTED_TIMEOUT_MS = 15000;
    const EXPECTED_MAX_WAIT_MS = 5000;

    /** 保持中の行ロック */
    interface HeldRowLock {
      /** ロック保持トランザクションの終了を待つ */
      readonly finished: Promise<void>;
      /** ロックを解放する */
      release(): void;
    }

    /**
     * 対象見積書の行を別セッションから `FOR UPDATE` で占有する
     *
     * 保存トランザクション内の `UPDATE estimates ...` がこのロック待ちでブロックされるため、
     * 「トランザクションが何ミリ秒動き続けたか」をテスト側から任意に制御できる。
     */
    const lockEstimateRow = async (estimateId: string): Promise<HeldRowLock> => {
      const holder = new PrismaClientCtor({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
      });

      let releaseFn: () => void = () => {};
      const releaseSignal = new Promise<void>((resolve) => {
        releaseFn = resolve;
      });
      let acquiredFn: () => void = () => {};
      const acquired = new Promise<void>((resolve) => {
        acquiredFn = resolve;
      });

      let acquireError: unknown = null;
      let failedFn: () => void = () => {};
      const failed = new Promise<void>((resolve) => {
        failedFn = resolve;
      });

      const running = holder
        .$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT id FROM estimates WHERE id = ${estimateId} FOR UPDATE`;
            acquiredFn();
            await releaseSignal;
          },
          { timeout: 60000, maxWait: 20000 }
        )
        .then(
          () => undefined,
          (e: unknown) => {
            acquireError = e;
            failedFn();
          }
        )
        .then(async () => {
          await holder.$disconnect();
        });

      // ロックが取れなければテストの前提が崩れる。黙って待ち続けず即座に失敗させる
      await Promise.race([acquired, failed]);
      if (acquireError !== null) {
        throw acquireError;
      }
      return { finished: running, release: releaseFn };
    };

    it('保存が8秒ブロックされても完了する（Prisma既定の5秒では落ちる長さ）', async () => {
      const ids = await createComplexEstimate('制限時間_8秒ブロックでも完了');
      const expectedUpdatedAt = await getExpectedUpdatedAt(ids.estimateId);
      const lock = await lockEstimateRow(ids.estimateId);

      const startedAt = performance.now();
      const pending = request(app)
        .put(`/api/estimates/${ids.estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload(),
          items: buildComplexSaveItems(ids),
        });

      const releaseTimer = setTimeout(() => lock.release(), 8000);
      const response = await pending;
      clearTimeout(releaseTimer);
      lock.release();
      await lock.finished;
      const elapsedMs = performance.now() - startedAt;

      // ロックが実際に保存をブロックしたことを確かめる（ブロックしていなければ検証にならない）
      expect(elapsedMs).toBeGreaterThanOrEqual(8000);
      expect(response.status).toBe(200);

      // 保存自体は正しく確定している
      const savedItems = await prisma.estimateItem.findMany({
        where: { estimateId: ids.estimateId },
        select: { id: true },
      });
      expect(savedItems.length).toBeGreaterThan(0);
    }, 60000);

    it('制限時間を超えた保存は破棄され、保存前の状態と更新日時が保たれる', async () => {
      const ids = await createComplexEstimate('制限時間_超過でロールバック');
      const expectedUpdatedAt = await getExpectedUpdatedAt(ids.estimateId);
      const before = await snapshotItems(ids.estimateId);
      const lock = await lockEstimateRow(ids.estimateId);

      const startedAt = performance.now();
      const pending = request(app)
        .put(`/api/estimates/${ids.estimateId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          reportFields: reportFieldsPayload({ validityPeriod: '見積後30日間' }),
          items: buildComplexSaveItems(ids),
        });

      // 設定値（15秒）より確実に長くブロックする
      const releaseTimer = setTimeout(() => lock.release(), 17000);
      const response = await pending;
      clearTimeout(releaseTimer);
      lock.release();
      await lock.finished;
      const elapsedMs = performance.now() - startedAt;

      expect(elapsedMs).toBeGreaterThan(15000);

      // 原因（時間内に完了しなかった）と結果（保存されていない）が分かる応答
      expect(response.status).toBe(500);
      expect(response.body.code).toBe('ESTIMATE_SAVE_TIMEOUT');
      expect(response.body.detail).toContain('制限時間');
      expect(response.body.detail).toContain('保存されていません');
      expect(response.body.details).toEqual({
        timeoutMs: EXPECTED_TIMEOUT_MS,
        maxItems: 2000,
      });

      // 変更はすべて破棄され保存前の状態が保たれている（42.3）
      expect(await snapshotItems(ids.estimateId)).toEqual(before);
      const estimate = await prisma.estimate.findUniqueOrThrow({
        where: { id: ids.estimateId },
        select: { updatedAt: true, validityPeriod: true },
      });
      expect(estimate.updatedAt.toISOString()).toBe(expectedUpdatedAt);
      expect(estimate.validityPeriod).toBeNull();
    }, 90000);

    it('接続の取得待ちが maxWait を超えた場合も書き込みゼロで失敗する', async () => {
      const ids = await createComplexEstimate('制限時間_maxWait超過');
      const expectedUpdatedAt = await getExpectedUpdatedAt(ids.estimateId);
      const before = await snapshotItems(ids.estimateId);

      // 接続を1本しか持たないクライアントを用意し、トランザクション開始の直前に
      // その1本を別トランザクションで占有する。事前照合の読み取りは占有前に済むため、
      // `maxWait` が支配する区間だけを切り出して観測できる。
      const singleConnection = new PrismaClientCtor({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 }),
      });

      let releaseFn: () => void = () => {};
      const releaseSignal = new Promise<void>((resolve) => {
        releaseFn = resolve;
      });
      let occupied: Promise<void> | null = null;

      const occupyPool = async (): Promise<void> => {
        let acquiredFn: () => void = () => {};
        const acquired = new Promise<void>((resolve) => {
          acquiredFn = resolve;
        });
        occupied = singleConnection
          .$transaction(
            async (tx) => {
              await tx.$executeRaw`SELECT 1`;
              acquiredFn();
              await releaseSignal;
            },
            { timeout: 60000, maxWait: 20000 }
          )
          .then(
            () => undefined,
            () => undefined
          );
        await acquired;
      };

      let waitStartedAt = 0;
      // サービスが渡した `$transaction` のオプションには一切手を加えず、
      // 呼び出しの直前にプールを枯渇させるだけのゲート
      const gated = new Proxy(singleConnection, {
        get(target, prop, receiver) {
          if (prop === '$transaction') {
            return async (
              ...args: [(tx: unknown) => Promise<unknown>, unknown]
            ): Promise<unknown> => {
              await occupyPool();
              waitStartedAt = performance.now();
              return (target.$transaction as unknown as (...a: unknown[]) => Promise<unknown>)(
                ...args
              );
            };
          }
          const value = Reflect.get(target, prop, receiver) as unknown;
          return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
        },
      });

      const gatedService = new EstimateDraftService({
        prisma: gated as unknown as PrismaClient,
      });

      const error = await gatedService
        .saveDraft(ids.estimateId, {
          expectedUpdatedAt,
          reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
          items: buildComplexSaveItems(ids) as never,
        })
        .then(
          () => null,
          (e: unknown) => e
        );
      const waitedMs = performance.now() - waitStartedAt;

      releaseFn();
      await occupied;
      await singleConnection.$disconnect();

      expect(error).toBeInstanceOf(EstimateSaveTimeoutError);
      // Prisma 既定の maxWait は 2000ms。実測に基づき 5000ms を明示していることを、
      // 「待った時間」で確かめる（既定に戻すとここが約2秒になり落ちる）
      expect(waitedMs).toBeGreaterThanOrEqual(EXPECTED_MAX_WAIT_MS - 1000);
      expect(waitedMs).toBeLessThan(EXPECTED_MAX_WAIT_MS + 4000);

      // トランザクションが始まらなかったので書き込みはゼロ（42.3）
      expect(await snapshotItems(ids.estimateId)).toEqual(before);
      const estimate = await prisma.estimate.findUniqueOrThrow({
        where: { id: ids.estimateId },
        select: { updatedAt: true },
      });
      expect(estimate.updatedAt.toISOString()).toBe(expectedUpdatedAt);
    }, 60000);
  });
});
