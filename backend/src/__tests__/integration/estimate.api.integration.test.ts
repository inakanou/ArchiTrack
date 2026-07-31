/**
 * @fileoverview 見積書API統合テスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * 見積書CRUD API、内訳書連携、楽観的排他制御の統合テストを実装します。
 *
 * Task 13.1: バックエンド統合テスト
 *
 * Requirements:
 * - 3.1: 新規作成を選択した場合、プロジェクトに紐付く内訳書の選択画面を表示する
 * - 3.2: 選択した内訳書の項目を見積金額行の初期値として設定する
 * - 3.3: 内訳書を選択せずに作成した場合、空の見積書を作成する
 * - 3.4: 見積書をプロジェクトに紐付けて保存する
 * - 3.5: 内訳書が選択された場合、内訳書の名称・規格・単位・数量を見積金額行に転記する
 * - 11.1: プロジェクトに紐付く見積書の一覧を表示する
 * - 11.2: 見積書を選択した場合、見積書の詳細を表示する
 * - 11.3: 見積書を編集した場合、変更内容を保存する
 * - 11.4: 確認ダイアログを表示後に削除を実行する
 * - 11.5: 見積書に見積名称を設定可能とする
 * - 11.6: 楽観的排他制御により競合を検出する
 * - 11.7: 見積書が他のユーザーによって編集中の場合、編集中であることを警告表示する
 *
 * @module __tests__/integration/estimate.api.integration.test
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

/**
 * 見積書API統合テスト
 */
describe('Estimate API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;
  let testQuantityTableId: string;
  let testItemizedStatementId: string;

  /**
   * テスト用認証情報でログインしてアクセストークンを取得
   */
  const loginTestUser = async (): Promise<{ token: string; userId: string }> => {
    const passwordHash = await (
      await import('@node-rs/argon2')
    ).hash('TestPassword123!', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // 既存のテストユーザーをクリーンアップ（外部キー制約を考慮）
    const existingUser = await prisma.user.findUnique({
      where: { email: 'test-estimate-integration@example.com' },
    });

    if (existingUser) {
      // 関連するプロジェクトのデータをクリーンアップ
      const projects = await prisma.project.findMany({
        where: {
          OR: [{ salesPersonId: existingUser.id }, { createdById: existingUser.id }],
        },
      });

      for (const project of projects) {
        await prisma.estimate.deleteMany({ where: { projectId: project.id } });
        await prisma.itemizedStatement.deleteMany({ where: { projectId: project.id } });
        await prisma.quantityTable.deleteMany({ where: { projectId: project.id } });
      }
      await prisma.project.deleteMany({
        where: {
          OR: [{ salesPersonId: existingUser.id }, { createdById: existingUser.id }],
        },
      });
      await prisma.userRole.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    // テストユーザーを作成
    const user = await prisma.user.create({
      data: {
        email: 'test-estimate-integration@example.com',
        displayName: 'Estimate Test User',
        passwordHash,
      },
    });

    // userロールを取得して割り当て
    const userRole = await prisma.role.findUnique({
      where: { name: 'user' },
    });

    if (userRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: userRole.id,
        },
      });
    }

    // 見積書関連の権限を作成
    const estimatePermissions = [
      { resource: 'estimate', action: 'create', description: '見積書の作成' },
      { resource: 'estimate', action: 'read', description: '見積書の閲覧' },
      { resource: 'estimate', action: 'update', description: '見積書の更新' },
      { resource: 'estimate', action: 'delete', description: '見積書の削除' },
    ];

    await prisma.permission.createMany({
      data: estimatePermissions,
      skipDuplicates: true,
    });

    // 必要な権限を割り当て（プロジェクト、内訳書、見積書関連）
    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: 'project', action: { in: ['create', 'read', 'update', 'delete'] } },
          { resource: 'quantity_table', action: { in: ['create', 'read', 'update', 'delete'] } },
          {
            resource: 'itemized_statement',
            action: { in: ['create', 'read', 'update', 'delete'] },
          },
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

    // ログインしてトークンを取得
    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'test-estimate-integration@example.com',
      password: 'TestPassword123!',
    });

    return {
      token: response.body.accessToken,
      userId: user.id,
    };
  };

  /**
   * テスト用プロジェクトを作成
   */
  const createTestProject = async (): Promise<string> => {
    const project = await prisma.project.create({
      data: {
        name: 'テスト用プロジェクト_見積書統合テスト',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    return project.id;
  };

  /**
   * テスト用数量表と項目を作成
   */
  const createTestQuantityTableWithItems = async (
    name: string,
    itemCount: number
  ): Promise<{ tableId: string; groupId: string }> => {
    const quantityTable = await prisma.quantityTable.create({
      data: {
        projectId: testProjectId,
        name,
      },
    });

    const quantityGroup = await prisma.quantityGroup.create({
      data: {
        quantityTableId: quantityTable.id,
        name: 'テストグループ',
        displayOrder: 0,
      },
    });

    // 指定された数量項目を作成
    const itemsData = Array.from({ length: itemCount }, (_, i) => ({
      quantityGroupId: quantityGroup.id,
      customCategory: `任意分類${i % 3}`,
      workType: `工種${i % 2}`,
      name: `名称${i}`,
      specification: `規格${i % 4}`,
      unit: i % 2 === 0 ? 'm2' : 'm3',
      quantity: 10 + i,
      majorCategory: '大項目',
      calculationMethod: 'STANDARD' as const,
      adjustmentFactor: 1.0,
      roundingUnit: 0.01,
      displayOrder: i,
    }));

    await prisma.quantityItem.createMany({ data: itemsData });

    return {
      tableId: quantityTable.id,
      groupId: quantityGroup.id,
    };
  };

  /**
   * テスト用内訳書を作成
   */
  const createTestItemizedStatement = async (): Promise<string> => {
    const itemizedStatement = await prisma.itemizedStatement.create({
      data: {
        projectId: testProjectId,
        name: 'テスト内訳書',
        sourceQuantityTableId: testQuantityTableId,
        sourceQuantityTableName: 'テスト数量表',
        items: {
          create: [
            {
              customCategory: '任意分類1',
              workType: '工種1',
              name: '内訳書項目1',
              specification: '規格A',
              unit: 'm2',
              quantity: 100,
              displayOrder: 0,
            },
            {
              customCategory: '任意分類2',
              workType: '工種2',
              name: '内訳書項目2',
              specification: '規格B',
              unit: 'm3',
              quantity: 200,
              displayOrder: 1,
            },
            {
              customCategory: '任意分類3',
              workType: '工種1',
              name: '内訳書項目3',
              specification: '規格C',
              unit: '式',
              quantity: 1,
              displayOrder: 2,
            },
          ],
        },
      },
    });
    return itemizedStatement.id;
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const auth = await loginTestUser();
    accessToken = auth.token;
    testUserId = auth.userId;
    testProjectId = await createTestProject();

    // テスト用数量表を作成
    const result = await createTestQuantityTableWithItems('テスト数量表', 10);
    testQuantityTableId = result.tableId;

    // テスト用内訳書を作成
    testItemizedStatementId = await createTestItemizedStatement();
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    if (testProjectId) {
      await prisma.estimate.deleteMany({
        where: { projectId: testProjectId },
      });
      await prisma.itemizedStatement.deleteMany({
        where: { projectId: testProjectId },
      });
      await prisma.quantityTable.deleteMany({
        where: { projectId: testProjectId },
      });
      await prisma.project.deleteMany({
        where: { id: testProjectId },
      });
    }

    if (testUserId) {
      await prisma.userRole.deleteMany({
        where: { userId: testUserId },
      });
      await prisma.user.deleteMany({
        where: { email: 'test-estimate-integration@example.com' },
      });
    }

    await prisma.$disconnect();
    redis.disconnect();
  });

  // ==========================================
  // 明細の一括保存（PUT /api/estimates/:id/save）ヘルパー
  // ==========================================
  //
  // 明細操作系6経路（POST /items、DELETE /items/:itemId、POST /items/:itemId/duplicate、
  // PUT /items/batch、PUT /items/reorder、PATCH /items/:itemId/move）は Task 53.12 で撤去され、
  // 追加・削除・更新・並び順の変更・階層の変更は `PUT /:id/save` 1回へ集約された（REQ-42.1）。
  //
  // 本APIのワイヤ契約はフル状態同期かつ strict である。
  // - 明細行の9フィールド・ノードの `id`/`tempId`/`children`・`reportFields` はいずれも省略不可
  // - 数量・単価・金額は10進数**文字列**（数値を送ると400）
  // - ペイロードに現れない既存項目は削除される
  // したがって既存項目を保持したまま1件追加するには、現在のツリーを読んでから足して送る。

  type SaveLineType = 'ESTIMATE' | 'EXECUTION' | 'VENDOR';
  type SaveItemType = 'STANDARD' | 'DISCOUNT' | 'NOTE';

  interface SaveLinePayload {
    lineType: SaveLineType;
    name: string | null;
    specification: string | null;
    unit: string | null;
    quantity: string | null;
    unitPrice: string | null;
    amount: string | null;
    remarks: string | null;
    sourceVendorName: string | null;
  }

  interface SaveNodePayload {
    id: string | null;
    tempId: string | null;
    itemType: SaveItemType;
    lines: SaveLinePayload[];
    children: SaveNodePayload[];
  }

  /** `GET /api/estimates/:id/items` が返す明細ツリーの節点 */
  interface ApiItemNode {
    id: string;
    parentId: string | null;
    displayOrder: number;
    itemType: SaveItemType;
    lines: Array<{
      id: string;
      lineType: SaveLineType;
      name: string | null;
      specification: string | null;
      unit: string | null;
      quantity: number | null;
      unitPrice: number | null;
      amount: number | null;
      remarks: string | null;
      sourceVendorName: string | null;
    }>;
    children: ApiItemNode[];
  }

  /** 数値を保存スキーマの10進数文字列へ変換する（数値のまま送ると400になる） */
  const decimal = (value: number | null | undefined): string | null =>
    value === null || value === undefined ? null : String(value);

  /** 明細行を9フィールドすべて明示した形で組み立てる（キー欠落は400） */
  const buildSaveLine = (
    lineType: SaveLineType,
    overrides: Partial<Omit<SaveLinePayload, 'lineType'>> = {}
  ): SaveLinePayload => ({
    lineType,
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

  /** 3行1セット（見積・実行・業者）の新規項目を組み立てる（Req 1.2） */
  const buildNewItem = (
    tempId: string,
    options: {
      name: string;
      specification?: string | null;
      unit?: string | null;
      quantity?: number | null;
      estimateUnitPrice?: number | null;
      executionUnitPrice?: number | null;
      vendorUnitPrice?: number | null;
      children?: SaveNodePayload[];
    }
  ): SaveNodePayload => {
    const quantity = options.quantity ?? null;
    const line = (lineType: SaveLineType, unitPrice: number | null): SaveLinePayload =>
      buildSaveLine(lineType, {
        name: options.name,
        specification: options.specification ?? null,
        unit: options.unit ?? null,
        quantity: decimal(quantity),
        unitPrice: decimal(unitPrice),
        // 金額はサーバーが再計算しないため、単価×数量を明示的に送る
        amount: quantity !== null && unitPrice !== null ? decimal(quantity * unitPrice) : null,
      });

    return {
      id: null,
      tempId,
      itemType: 'STANDARD',
      lines: [
        line('ESTIMATE', options.estimateUnitPrice ?? null),
        line('EXECUTION', options.executionUnitPrice ?? null),
        line('VENDOR', options.vendorUnitPrice ?? null),
      ],
      children: options.children ?? [],
    };
  };

  /** 既存の明細ツリー（GET の返却形）を保存ペイロードの形へ写す */
  const toSaveNodes = (items: readonly ApiItemNode[]): SaveNodePayload[] =>
    items.map((item) => ({
      id: item.id,
      tempId: null,
      itemType: item.itemType,
      lines: item.lines.map((line) =>
        buildSaveLine(line.lineType, {
          name: line.name,
          specification: line.specification,
          unit: line.unit,
          quantity: decimal(line.quantity),
          unitPrice: decimal(line.unitPrice),
          amount: decimal(line.amount),
          remarks: line.remarks,
          sourceVendorName: line.sourceVendorName ?? null,
        })
      ),
      children: toSaveNodes(item.children),
    }));

  /** 現在の明細ツリーを取得する */
  const fetchItemTree = async (estimateId: string): Promise<ApiItemNode[]> => {
    const response = await request(app)
      .get(`/api/estimates/${estimateId}/items`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(200);
    return response.body as ApiItemNode[];
  };

  /** 楽観ロックの基準時刻を取得する（Req 42.5） */
  const fetchUpdatedAt = async (estimateId: string): Promise<string> => {
    const response = await request(app)
      .get(`/api/estimates/${estimateId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(200);
    return response.body.updatedAt as string;
  };

  /**
   * 明細ツリー全体を1リクエストで保存する（Req 42.1）
   *
   * `reportFields` は本ファイルのテストが提出日・有効期限・別途工事を扱わないため
   * 既定値（未設定）を送る。これらを検証するテストを足す場合は明示的に渡すこと。
   */
  const saveDraft = async (
    estimateId: string,
    items: SaveNodePayload[],
    options: { expectedUpdatedAt?: string } = {}
  ) => {
    const expectedUpdatedAt = options.expectedUpdatedAt ?? (await fetchUpdatedAt(estimateId));
    return await request(app)
      .put(`/api/estimates/${estimateId}/save`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        expectedUpdatedAt,
        reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
        items,
      });
  };

  /** テスト用見積書を作成する（一括保存はフル状態同期のため describe ごとに分離する） */
  const createEstimateForTest = async (name: string): Promise<string> => {
    const response = await request(app)
      .post(`/api/projects/${testProjectId}/estimates`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `${name}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` });
    expect(response.status).toBe(201);
    return response.body.id as string;
  };

  /** 明細ツリーを平坦化する */
  const flattenItems = (items: readonly ApiItemNode[]): ApiItemNode[] =>
    items.flatMap((item) => [item, ...flattenItems(item.children)]);

  /** 見積金額行の名称で節点を探す */
  const findByEstimateName = (
    items: readonly ApiItemNode[],
    name: string
  ): ApiItemNode | undefined =>
    flattenItems(items).find((item) =>
      item.lines.some((line) => line.lineType === 'ESTIMATE' && line.name === name)
    );

  // ==========================================
  // 見積書作成テスト (Req 3.1, 3.2, 3.3, 3.4, 3.5)
  // ==========================================

  describe('見積書作成 POST /api/projects/:projectId/estimates', () => {
    beforeEach(async () => {
      // 各テスト前に見積書をクリーンアップ
      await prisma.estimate.deleteMany({
        where: { projectId: testProjectId },
      });
    });

    it('内訳書を選択せずに空の見積書を作成できる (Req 3.3)', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '空の見積書',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: '空の見積書',
        projectId: testProjectId,
        sourceItemizedStatementId: null,
        sourceItemizedStatementName: null,
      });
      expect(response.body.id).toBeDefined();
      expect(response.body.itemCount).toBe(0);
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
    });

    it('内訳書を参照して見積書を作成できる (Req 3.1, 3.2, 3.4)', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '内訳書参照見積書',
          sourceItemizedStatementId: testItemizedStatementId,
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: '内訳書参照見積書',
        projectId: testProjectId,
        sourceItemizedStatementId: testItemizedStatementId,
        sourceItemizedStatementName: 'テスト内訳書',
      });
      expect(response.body.id).toBeDefined();
      expect(response.body.itemCount).toBe(3); // 内訳書の項目数
    });

    it('内訳書から見積金額行に名称・規格・単位・数量が転記される (Req 3.5)', async () => {
      // 内訳書参照で見積書を作成
      const createResponse = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '転記確認用見積書',
          sourceItemizedStatementId: testItemizedStatementId,
        });

      expect(createResponse.status).toBe(201);
      const estimateId = createResponse.body.id;

      // 見積書詳細を取得して項目を確認
      const detailResponse = await request(app)
        .get(`/api/estimates/${estimateId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(detailResponse.status).toBe(200);
      expect(detailResponse.body.items).toBeInstanceOf(Array);
      expect(detailResponse.body.items.length).toBe(3);

      // 各項目の見積金額行（ESTIMATE）に内訳書の情報が転記されていることを確認
      detailResponse.body.items.forEach(
        (
          item: {
            lines: Array<{
              lineType: string;
              name: string | null;
              specification: string | null;
              unit: string | null;
              quantity: number | null;
            }>;
          },
          index: number
        ) => {
          const estimateLine = item.lines.find(
            (line: { lineType: string }) => line.lineType === 'ESTIMATE'
          );
          expect(estimateLine).toBeDefined();
          expect(estimateLine!.name).toBe(`内訳書項目${index + 1}`);
          expect(estimateLine!.specification).toBeDefined();
          expect(estimateLine!.unit).toBeDefined();
          expect(typeof estimateLine!.quantity).toBe('number');
        }
      );
    });

    it('存在しない内訳書IDで作成しようとすると404エラー', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'エラーテスト見積書',
          sourceItemizedStatementId: '12345678-1234-4234-a234-123456789012',
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'ITEMIZED_STATEMENT_NOT_FOUND');
    });

    it('存在しないプロジェクトIDで作成しようとすると404エラー', async () => {
      const response = await request(app)
        .post(`/api/projects/12345678-1234-4234-a234-123456789012/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'エラーテスト見積書',
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'PROJECT_NOT_FOUND');
    });

    it('同名の見積書が存在する場合は409エラー', async () => {
      // 既存の見積書を作成
      await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '重複テスト見積書',
        });

      // 同名で再度作成を試行
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '重複テスト見積書',
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('code', 'DUPLICATE_ESTIMATE_NAME');
    });

    it('認証なしでは401を返す', async () => {
      const response = await request(app).post(`/api/projects/${testProjectId}/estimates`).send({
        name: 'テスト見積書',
      });

      expect(response.status).toBe(401);
    });

    it('名称が空の場合は400エラー', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '',
        });

      expect(response.status).toBe(400);
    });

    it('名称が200文字を超える場合は400エラー', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'a'.repeat(201),
        });

      expect(response.status).toBe(400);
    });
  });

  // ==========================================
  // 見積書一覧取得テスト (Req 11.1)
  // ==========================================

  describe('見積書一覧取得 GET /api/projects/:projectId/estimates', () => {
    beforeAll(async () => {
      // テスト用の見積書を複数作成
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post(`/api/projects/${testProjectId}/estimates`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: `一覧テスト見積書${i}`,
          });
      }
    });

    it('プロジェクトに紐付く見積書一覧を取得できる (Req 11.1)', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: expect.any(Number),
        total: expect.any(Number),
        totalPages: expect.any(Number),
      });
    });

    it('ページネーション付きで一覧を取得できる', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/estimates`)
        .query({ page: 1, limit: 3 })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeLessThanOrEqual(3);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 3,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      });
    });

    it('作成日時の降順でソートできる', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/estimates`)
        .query({ sort: 'createdAt', order: 'desc' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      const data = response.body.data;

      // 日付が降順になっているか確認
      for (let i = 0; i < data.length - 1; i++) {
        const current = new Date(data[i].createdAt).getTime();
        const next = new Date(data[i + 1].createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it('名前でソートできる', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/estimates`)
        .query({ sort: 'name', order: 'asc' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      const data = response.body.data;

      // 名前が昇順になっているか確認
      for (let i = 0; i < data.length - 1; i++) {
        expect(data[i].name <= data[i + 1].name).toBe(true);
      }
    });

    it('検索フィルターが動作する', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/estimates`)
        .query({ search: '一覧テスト' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      response.body.data.forEach((item: { name: string }) => {
        expect(item.name).toContain('一覧テスト');
      });
    });
  });

  // ==========================================
  // 見積書詳細取得テスト (Req 11.2)
  // ==========================================

  describe('見積書詳細取得 GET /api/estimates/:id', () => {
    let testEstimateId: string;

    beforeAll(async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '詳細テスト見積書',
          sourceItemizedStatementId: testItemizedStatementId,
        });
      testEstimateId = response.body.id;
    });

    it('見積書の詳細を取得できる (Req 11.2)', async () => {
      const response = await request(app)
        .get(`/api/estimates/${testEstimateId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: testEstimateId,
        name: '詳細テスト見積書',
        projectId: testProjectId,
      });
      expect(response.body.project).toBeDefined();
      expect(response.body.project.id).toBe(testProjectId);
      expect(response.body.items).toBeInstanceOf(Array);
    });

    it('見積項目に3行1セット（ESTIMATE/EXECUTION/VENDOR）が含まれる', async () => {
      const response = await request(app)
        .get(`/api/estimates/${testEstimateId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.items.length).toBeGreaterThan(0);

      // 各項目に3行が含まれていることを確認
      response.body.items.forEach((item: { lines: Array<{ lineType: string }> }) => {
        expect(item.lines.length).toBe(3);
        const lineTypes = item.lines.map((line: { lineType: string }) => line.lineType);
        expect(lineTypes).toContain('ESTIMATE');
        expect(lineTypes).toContain('EXECUTION');
        expect(lineTypes).toContain('VENDOR');
      });
    });

    it('存在しない見積書IDでは404エラー', async () => {
      const response = await request(app)
        .get('/api/estimates/12345678-1234-4234-a234-123456789012')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'ESTIMATE_NOT_FOUND');
    });
  });

  // ==========================================
  // 見積書更新テスト (Req 11.3, 11.5, 11.6)
  // ==========================================

  describe('見積書更新 PUT /api/estimates/:id', () => {
    let updateTargetId: string;
    let updateTargetUpdatedAt: string;

    beforeEach(async () => {
      // 更新用の見積書を作成
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: `更新テスト見積書_${Date.now()}`,
        });

      updateTargetId = response.body.id;
      updateTargetUpdatedAt = response.body.updatedAt;
    });

    it('見積書名を更新できる (Req 11.3, 11.5)', async () => {
      const response = await request(app)
        .put(`/api/estimates/${updateTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '更新後の見積書名',
          expectedUpdatedAt: updateTargetUpdatedAt,
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('更新後の見積書名');
      expect(response.body.id).toBe(updateTargetId);
    });

    it('楽観的排他制御エラー - 古いupdatedAtで409を返す (Req 11.6)', async () => {
      const response = await request(app)
        .put(`/api/estimates/${updateTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '更新後の見積書名',
          expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('code', 'ESTIMATE_CONFLICT');
    });

    it('存在しない見積書の更新は404を返す', async () => {
      const response = await request(app)
        .put('/api/estimates/12345678-1234-4234-a234-123456789012')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '更新後の見積書名',
          expectedUpdatedAt: new Date().toISOString(),
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'ESTIMATE_NOT_FOUND');
    });

    it('名前が空の場合は400エラー', async () => {
      const response = await request(app)
        .put(`/api/estimates/${updateTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '',
          expectedUpdatedAt: updateTargetUpdatedAt,
        });

      expect(response.status).toBe(400);
    });

    it('同名の見積書が存在する場合は409エラー', async () => {
      // 別の見積書を作成
      await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '既存の見積書名',
        });

      // 既存の名前に更新しようとする
      const response = await request(app)
        .put(`/api/estimates/${updateTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '既存の見積書名',
          expectedUpdatedAt: updateTargetUpdatedAt,
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('code', 'DUPLICATE_ESTIMATE_NAME');
    });
  });

  // ==========================================
  // 見積書削除テスト (Req 11.4, 11.6)
  // ==========================================

  describe('見積書削除 DELETE /api/estimates/:id', () => {
    let deleteTargetId: string;
    let deleteTargetUpdatedAt: string;

    beforeEach(async () => {
      // 削除用の見積書を作成
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: `削除テスト見積書_${Date.now()}`,
        });

      deleteTargetId = response.body.id;
      deleteTargetUpdatedAt = response.body.updatedAt;
    });

    it('見積書を削除できる (Req 11.4)', async () => {
      const response = await request(app)
        .delete(`/api/estimates/${deleteTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ updatedAt: deleteTargetUpdatedAt });

      expect(response.status).toBe(204);

      // 削除後は取得できないことを確認
      const getResponse = await request(app)
        .get(`/api/estimates/${deleteTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(getResponse.status).toBe(404);
    });

    it('楽観的排他制御エラー - 古いupdatedAtで409を返す (Req 11.6)', async () => {
      const response = await request(app)
        .delete(`/api/estimates/${deleteTargetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ updatedAt: '2020-01-01T00:00:00.000Z' });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('code', 'ESTIMATE_CONFLICT');
    });

    it('存在しない見積書の削除は404を返す', async () => {
      const response = await request(app)
        .delete('/api/estimates/12345678-1234-4234-a234-123456789012')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ updatedAt: new Date().toISOString() });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'ESTIMATE_NOT_FOUND');
    });
  });

  // ==========================================
  // 最新見積書サマリー取得テスト (Req 16)
  // ==========================================

  describe('最新見積書サマリー取得 GET /api/projects/:projectId/estimates/latest', () => {
    it('プロジェクトの最新見積書サマリーを取得できる', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/estimates/latest`)
        .query({ limit: 2 })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalCount');
      expect(response.body).toHaveProperty('latestEstimates');
      expect(response.body.latestEstimates).toBeInstanceOf(Array);
      expect(response.body.latestEstimates.length).toBeLessThanOrEqual(2);
    });

    it('最新の見積書が作成日時の降順で取得される', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/estimates/latest`)
        .query({ limit: 5 })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      const estimates = response.body.latestEstimates;

      // 日付が降順になっているか確認
      for (let i = 0; i < estimates.length - 1; i++) {
        const current = new Date(estimates[i].createdAt).getTime();
        const next = new Date(estimates[i + 1].createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  // ==========================================
  // Task 13.2: 見積項目API統合テスト
  // ==========================================
  // Requirements:
  // - 1.1-1.6: 見積書基本構造
  // - 2.1-2.6: 見積項目ネスト構造
  // - 12.1-12.6: 見積項目操作

  describe('見積項目API統合テスト', () => {
    let itemTestEstimateId: string;

    beforeAll(async () => {
      // テスト用見積書を作成
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '見積項目テスト用見積書',
        });
      itemTestEstimateId = response.body.id;
    });

    describe('見積項目一覧取得 GET /api/estimates/:id/items', () => {
      it('見積項目一覧を取得できる (Req 12.1)', async () => {
        const response = await request(app)
          .get(`/api/estimates/${itemTestEstimateId}/items`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
      });
    });

    // 撤去済みの `POST /api/estimates/:id/items` から `PUT /:id/save` へ移行（Task 53.13）。
    // 検証している要件（3行1セットの構成・親子関係の成立）は変えていない。
    describe('見積項目の追加 PUT /api/estimates/:id/save', () => {
      let addTestEstimateId: string;

      beforeAll(async () => {
        addTestEstimateId = await createEstimateForTest('項目追加テスト用見積書');
      });

      it('3行1セット（ESTIMATE/EXECUTION/VENDOR）で見積項目を追加できる (Req 1.2, 2.1, 42.1)', async () => {
        const response = await saveDraft(addTestEstimateId, [
          buildNewItem('new-1', {
            name: 'テスト項目',
            specification: '規格A',
            unit: 'm2',
            quantity: 100,
            estimateUnitPrice: 1000,
            executionUnitPrice: 800,
            vendorUnitPrice: 700,
          }),
        ]);

        expect(response.status).toBe(200);
        expect(response.body.items).toBeInstanceOf(Array);
        expect(response.body.items.length).toBe(1);

        const savedItem = response.body.items[0];
        expect(savedItem.id).toBeDefined();
        expect(savedItem.lines).toBeInstanceOf(Array);
        expect(savedItem.lines.length).toBe(3);

        // 3行の行タイプを確認
        const lineTypes = savedItem.lines.map((line: { lineType: string }) => line.lineType);
        expect(lineTypes).toContain('ESTIMATE');
        expect(lineTypes).toContain('EXECUTION');
        expect(lineTypes).toContain('VENDOR');

        // 再読込後も3行1セットで保持される（Req 34.1）
        const reloaded = await fetchItemTree(addTestEstimateId);
        const reloadedItem = findByEstimateName(reloaded, 'テスト項目');
        expect(reloadedItem).toBeDefined();
        expect(reloadedItem!.lines.length).toBe(3);
      });

      it('親子ツリーを送ると子項目に親のIDが設定される (Req 2.1, 2.2, 42.1)', async () => {
        const existing = toSaveNodes(await fetchItemTree(addTestEstimateId));

        const response = await saveDraft(addTestEstimateId, [
          ...existing,
          buildNewItem('parent-1', {
            name: '親項目',
            children: [buildNewItem('child-1', { name: '子項目' })],
          }),
        ]);

        expect(response.status).toBe(200);

        const reloaded = await fetchItemTree(addTestEstimateId);
        const parentItem = findByEstimateName(reloaded, '親項目');
        expect(parentItem).toBeDefined();
        expect(parentItem!.children.length).toBe(1);

        const childItem = parentItem!.children[0]!;
        expect(childItem.parentId).toBe(parentItem!.id);
        expect(childItem.lines.find((line) => line.lineType === 'ESTIMATE')?.name).toBe('子項目');

        // 既存項目は保存後も残っている（Req 42.9）
        expect(findByEstimateName(reloaded, 'テスト項目')).toBeDefined();
      });

      it('存在しない見積書への保存は404エラー', async () => {
        const response = await request(app)
          .put('/api/estimates/12345678-1234-4234-a234-123456789012/save')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            expectedUpdatedAt: new Date().toISOString(),
            reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
            items: [buildNewItem('new-1', { name: 'テスト' })],
          });

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('code', 'ESTIMATE_NOT_FOUND');
      });
    });

    describe('値引き行追加 POST /api/estimates/:id/discount-items', () => {
      it('種別DISCOUNT・見積金額行1行の値引き行を作成できる (REQ-41.1, 41.2)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${itemTestEstimateId}/discount-items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ unitPrice: -50000 });

        expect(response.status).toBe(201);
        expect(response.body.id).toBeDefined();
        expect(response.body.itemType).toBe('DISCOUNT');
        expect(response.body.lines).toBeInstanceOf(Array);
        // 値引き行は見積金額行（ESTIMATE）のみ（REQ-41.3）
        expect(response.body.lines.length).toBe(1);
        expect(response.body.lines[0].lineType).toBe('ESTIMATE');
        // プリセット値（名称=値引き、規格=空、単位=式、数量=1）
        expect(response.body.lines[0].name).toBe('値引き');
        expect(response.body.lines[0].unit).toBe('式');
        expect(response.body.lines[0].quantity).toBe(1);
        // 負数の単価を許容（REQ-41.5）
        expect(response.body.lines[0].unitPrice).toBe(-50000);
      });

      it('単価を省略しても値引き行を作成できる', async () => {
        const response = await request(app)
          .post(`/api/estimates/${itemTestEstimateId}/discount-items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({});

        expect(response.status).toBe(201);
        expect(response.body.itemType).toBe('DISCOUNT');
        expect(response.body.lines.length).toBe(1);
        expect(response.body.lines[0].unitPrice).toBeNull();
      });

      it('存在しない見積書に値引き行を追加しようとすると404エラー', async () => {
        const response = await request(app)
          .post('/api/estimates/12345678-1234-4234-a234-123456789012/discount-items')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ unitPrice: -1000 });

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('code', 'ESTIMATE_NOT_FOUND');
      });
    });

    // 撤去済みの `PUT /items/batch` / `DELETE /items/:itemId` から `PUT /:id/save` へ移行（Task 53.13）。
    // 検証対象は値引き行の仕様そのもの（REQ-41 系, REQ-34）であり、経路のみを差し替えている。
    // 値引き行の**作成**は維持対象の `POST /:id/discount-items` を引き続き用いる。
    // 一括保存はフル状態同期のため、この describe には専用の見積書を割り当てる。
    describe('値引き行 一括保存ラウンドトリップ (REQ-41.2, 41.3, 41.5, 41.6, 41.8, 41.10, REQ-34)', () => {
      let discountTestEstimateId: string;

      beforeEach(async () => {
        discountTestEstimateId = await createEstimateForTest('値引き行ラウンドトリップ用見積書');
      });

      it('値引き行の追加が再読込後も種別DISCOUNT・ESTIMATE 1行で保持される (REQ-41.2, 41.3)', async () => {
        // 値引き行を追加
        const createResponse = await request(app)
          .post(`/api/estimates/${discountTestEstimateId}/discount-items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ unitPrice: -10000 });

        expect(createResponse.status).toBe(201);
        const discountItemId = createResponse.body.id as string;

        // 再読込（GET）で保持されていることを確認
        const getResponse = await request(app)
          .get(`/api/estimates/${discountTestEstimateId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(getResponse.status).toBe(200);
        const reloadedItem = getResponse.body.items.find(
          (item: { id: string }) => item.id === discountItemId
        );
        expect(reloadedItem).toBeDefined();
        // 値引き行は ESTIMATE 行のみ（EXECUTION/VENDOR 行を持たない）構造で保持される（REQ-41.3）。
        // ※GET詳細レスポンスは itemType を含まないため、単一 ESTIMATE 行という構造で DISCOUNT 構造の保持を検証する。
        expect(reloadedItem.lines.length).toBe(1);
        expect(reloadedItem.lines[0].lineType).toBe('ESTIMATE');
        expect(reloadedItem.lines[0].name).toBe('値引き');
        expect(reloadedItem.lines[0].unit).toBe('式');
        expect(Number(reloadedItem.lines[0].quantity)).toBe(1);
      });

      it('一括保存で値引き行の単価を負数に更新すると単価・金額（負数）が再読込後も保持される (REQ-41.5, 41.6, 41.8, 41.10, REQ-34)', async () => {
        // 値引き行を追加（単価未設定）
        const createResponse = await request(app)
          .post(`/api/estimates/${discountTestEstimateId}/discount-items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({});

        expect(createResponse.status).toBe(201);
        const discountItemId = createResponse.body.id as string;

        // 一括保存で負数単価・名称を更新（値引き行は種別DISCOUNT・見積金額行1件のまま送る）
        const tree = await fetchItemTree(discountTestEstimateId);
        const items = toSaveNodes(tree);
        const discountNode = items.find((node) => node.id === discountItemId);
        expect(discountNode).toBeDefined();
        expect(discountNode!.itemType).toBe('DISCOUNT');
        expect(discountNode!.lines.length).toBe(1);
        discountNode!.lines[0] = buildSaveLine('ESTIMATE', {
          name: '出精値引き',
          specification: null,
          unit: '式',
          quantity: '1',
          unitPrice: '-3000',
          amount: '-3000',
          remarks: null,
        });

        const saveResponse = await saveDraft(discountTestEstimateId, items);
        expect(saveResponse.status).toBe(200);

        // 再読込で負数単価・金額・名称が保持されていることを確認
        const getResponse = await request(app)
          .get(`/api/estimates/${discountTestEstimateId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(getResponse.status).toBe(200);
        const reloadedItem = getResponse.body.items.find(
          (item: { id: string }) => item.id === discountItemId
        );
        expect(reloadedItem).toBeDefined();
        // 値引き行は ESTIMATE 行のみで保持される（REQ-41.3）
        expect(reloadedItem.lines.length).toBe(1);
        const reloadedLine = reloadedItem.lines[0];
        expect(reloadedLine.lineType).toBe('ESTIMATE');
        expect(reloadedLine.name).toBe('出精値引き');
        expect(reloadedLine.unitPrice).toBe(-3000);
        // 金額=単価×数量=負数（REQ-41.6, 41.8）
        expect(reloadedLine.amount).toBe(-3000);
      });

      it('値引き行を保存ペイロードから除くと再読込後に消えている (REQ-34, Req 42.1)', async () => {
        // 値引き行を2件追加し、片方だけをペイロードから除く
        const keepResponse = await request(app)
          .post(`/api/estimates/${discountTestEstimateId}/discount-items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ unitPrice: -1000 });
        expect(keepResponse.status).toBe(201);
        const keptItemId = keepResponse.body.id as string;

        const deleteResponse = await request(app)
          .post(`/api/estimates/${discountTestEstimateId}/discount-items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ unitPrice: -5000 });
        expect(deleteResponse.status).toBe(201);
        const discountItemId = deleteResponse.body.id as string;

        // 削除対象を除いたツリーを保存する（一括保存はフル状態同期）
        const items = toSaveNodes(await fetchItemTree(discountTestEstimateId)).filter(
          (node) => node.id !== discountItemId
        );
        const saveResponse = await saveDraft(discountTestEstimateId, items);
        expect(saveResponse.status).toBe(200);

        // 再読込で消えていることを確認
        const getResponse = await request(app)
          .get(`/api/estimates/${discountTestEstimateId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(getResponse.status).toBe(200);
        const deletedItem = getResponse.body.items.find(
          (item: { id: string }) => item.id === discountItemId
        );
        expect(deletedItem).toBeUndefined();
        // ペイロードに残した値引き行は削除されない（Req 42.9）
        const keptItem = getResponse.body.items.find(
          (item: { id: string }) => item.id === keptItemId
        );
        expect(keptItem).toBeDefined();
      });
    });

    // 撤去済みの `POST /items/:itemId/duplicate` から `PUT /:id/save` へ移行（Task 53.13）。
    // 複製は編集セッション中のローカル操作となり（Req 12.7, 43.1）、サーバー側の契約は
    // 「複製された3行1セットが新規ノードとして保存される」ことに収斂する。
    describe('見積項目の複製結果の保存 PUT /api/estimates/:id/save', () => {
      let duplicateTestEstimateId: string;

      beforeAll(async () => {
        duplicateTestEstimateId = await createEstimateForTest('複製テスト用見積書');

        // 複製元の項目を作成
        const response = await saveDraft(duplicateTestEstimateId, [
          buildNewItem('source-1', {
            name: '複製元項目',
            specification: '規格X',
            unit: 'm2',
            quantity: 50,
            estimateUnitPrice: 2000,
            executionUnitPrice: 1800,
            vendorUnitPrice: 1500,
          }),
        ]);
        expect(response.status).toBe(200);
      });

      it('複製した3行1セットが元項目と同じ内容の別項目として保存される (Req 12.5, 42.1)', async () => {
        const existing = toSaveNodes(await fetchItemTree(duplicateTestEstimateId));
        expect(existing.length).toBe(1);
        const sourceNode = existing[0]!;
        const sourceItemId = sourceNode.id;

        // 画面上の複製操作と同じく、元項目の行内容をそのまま持つ新規ノードを足して保存する
        const duplicated: SaveNodePayload = {
          id: null,
          tempId: 'duplicated-1',
          itemType: sourceNode.itemType,
          lines: sourceNode.lines.map((line) => ({ ...line })),
          children: [],
        };

        const response = await saveDraft(duplicateTestEstimateId, [sourceNode, duplicated]);
        expect(response.status).toBe(200);

        const reloaded = await fetchItemTree(duplicateTestEstimateId);
        expect(reloaded.length).toBe(2);

        const copy = reloaded.find((item) => item.id !== sourceItemId);
        expect(copy).toBeDefined();
        expect(copy!.id).not.toBe(sourceItemId);
        // 3行1セット全体が複製される（Req 12.5）
        expect(copy!.lines.length).toBe(3);

        const estimateLine = copy!.lines.find((line) => line.lineType === 'ESTIMATE');
        expect(estimateLine!.name).toBe('複製元項目');
        expect(estimateLine!.specification).toBe('規格X');
        expect(estimateLine!.unitPrice).toBe(2000);
        // 元項目も残る
        expect(reloaded.find((item) => item.id === sourceItemId)).toBeDefined();
      });
    });

    // 撤去済みの `PUT /items/reorder` から `PUT /:id/save` へ移行（Task 53.13）。
    // 並び順はペイロードの配列順で確定する（Req 42.6）。
    describe('見積項目の並び順の保存 PUT /api/estimates/:id/save', () => {
      let reorderTestEstimateId: string;

      beforeAll(async () => {
        reorderTestEstimateId = await createEstimateForTest('並び替えテスト用見積書');

        const response = await saveDraft(
          reorderTestEstimateId,
          [0, 1, 2].map((i) => buildNewItem(`reorder-${i}`, { name: `並び替えテスト${i}` }))
        );
        expect(response.status).toBe(200);
      });

      it('配列順どおりに並び順が確定し再読込後も維持される (Req 12.2, 12.8, 34.5, 42.1, 42.6)', async () => {
        const before = await fetchItemTree(reorderTestEstimateId);
        expect(before.map((item) => item.displayOrder)).toEqual([0, 1, 2]);
        const originalIds = before.map((item) => item.id);

        // 逆順に並び替えて保存
        const reversed = toSaveNodes(before).reverse();
        const response = await saveDraft(reorderTestEstimateId, reversed);
        expect(response.status).toBe(200);

        const after = await fetchItemTree(reorderTestEstimateId);
        expect(after.map((item) => item.id)).toEqual([...originalIds].reverse());
        // 表示順は配列順で 0 起点の連番になる（Req 42.6）
        expect(after.map((item) => item.displayOrder)).toEqual([0, 1, 2]);
      });
    });

    // 撤去済みの `DELETE /items/:itemId` から `PUT /:id/save` へ移行（Task 53.13）。
    // 一括保存はフル状態同期であり、削除は「ペイロードから除く」ことで表現する。
    // `forceDelete` は撤去した経路固有の概念であり、一括保存では親を除けば子孫も連鎖削除される。
    describe('見積項目の削除の保存 PUT /api/estimates/:id/save', () => {
      let deleteTestEstimateId: string;

      beforeEach(async () => {
        deleteTestEstimateId = await createEstimateForTest('削除テスト用見積書');
      });

      it('ペイロードから除いた項目が削除され再読込後に現れない (Req 12.3, 34.2, 42.1)', async () => {
        const setupResponse = await saveDraft(deleteTestEstimateId, [
          buildNewItem('keep-1', { name: '残す項目' }),
          buildNewItem('delete-1', { name: '削除テスト項目' }),
        ]);
        expect(setupResponse.status).toBe(200);

        const before = await fetchItemTree(deleteTestEstimateId);
        const deleteTarget = findByEstimateName(before, '削除テスト項目');
        expect(deleteTarget).toBeDefined();

        const response = await saveDraft(
          deleteTestEstimateId,
          toSaveNodes(before).filter((node) => node.id !== deleteTarget!.id)
        );
        expect(response.status).toBe(200);

        const after = await fetchItemTree(deleteTestEstimateId);
        expect(findByEstimateName(after, '削除テスト項目')).toBeUndefined();
        // 3行1セット全体が削除される（Req 12.3）
        expect(flattenItems(after).some((item) => item.id === deleteTarget!.id)).toBe(false);
        // 残した項目は保持される（Req 42.9）
        expect(findByEstimateName(after, '残す項目')).toBeDefined();
      });

      it('親項目をペイロードから除くと子孫項目もあわせて削除される (Req 12.4, 34.2, 42.1, 43.6)', async () => {
        const setupResponse = await saveDraft(deleteTestEstimateId, [
          buildNewItem('parent-1', {
            name: '削除テスト親項目',
            children: [buildNewItem('child-1', { name: '削除テスト子項目' })],
          }),
          buildNewItem('other-1', { name: '無関係項目' }),
        ]);
        expect(setupResponse.status).toBe(200);

        const before = await fetchItemTree(deleteTestEstimateId);
        const parentItem = findByEstimateName(before, '削除テスト親項目');
        expect(parentItem).toBeDefined();
        const childItem = findByEstimateName(before, '削除テスト子項目');
        expect(childItem).toBeDefined();
        expect(childItem!.parentId).toBe(parentItem!.id);

        // 親（とその子孫）をペイロードから除いて保存する
        const response = await saveDraft(
          deleteTestEstimateId,
          toSaveNodes(before).filter((node) => node.id !== parentItem!.id)
        );
        expect(response.status).toBe(200);

        const after = await fetchItemTree(deleteTestEstimateId);
        const remainingIds = flattenItems(after).map((item) => item.id);
        expect(remainingIds).not.toContain(parentItem!.id);
        expect(remainingIds).not.toContain(childItem!.id);
        expect(findByEstimateName(after, '無関係項目')).toBeDefined();
      });

      it('この見積書に存在しない項目IDを含むペイロードは422で保存を中止する (Req 42.4)', async () => {
        const setupResponse = await saveDraft(deleteTestEstimateId, [
          buildNewItem('keep-1', { name: '検証前から存在する項目' }),
        ]);
        expect(setupResponse.status).toBe(200);

        const before = await fetchItemTree(deleteTestEstimateId);
        const items = toSaveNodes(before);
        items.push({
          id: '12345678-1234-4234-a234-123456789012',
          tempId: null,
          itemType: 'STANDARD',
          lines: [buildSaveLine('ESTIMATE', { name: '存在しない項目' })],
          children: [],
        });

        const response = await saveDraft(deleteTestEstimateId, items);
        expect(response.status).toBe(422);

        // 保存を開始していないため既存項目は変わらない（Req 42.3, 42.4）
        const after = await fetchItemTree(deleteTestEstimateId);
        expect(after.map((item) => item.id)).toEqual(before.map((item) => item.id));
      });
    });

    // ========================================
    // 階層変更の一括保存（Task 28.2 の PATCH /items/:itemId/move から Task 53.13 で移行）
    // ========================================
    // REQ-24 は撤廃され（requirements.md「Requirement 24」）、階層移動は編集セッション中の
    // ローカル操作となった。サーバー側の契約は「変更後のツリーを保存で確定する」ことに収斂し、
    // 循環参照の検出は保存時の構造検証（Req 42.8）へ移管された。
    describe('見積項目の階層変更の保存 PUT /api/estimates/:id/save', () => {
      let moveTestEstimateId: string;
      let rootItem1Id: string;
      let rootItem2Id: string;
      let childItemId: string;

      beforeEach(async () => {
        // テスト用見積書を作成（一括保存はフル状態同期のためテストごとに分離する）
        moveTestEstimateId = await createEstimateForTest('階層移動テスト用見積書');

        // ルート項目1（子項目を1つ持つ）とルート項目2を作成
        const setupResponse = await saveDraft(moveTestEstimateId, [
          buildNewItem('root-1', {
            name: 'ルート項目1',
            children: [buildNewItem('child-1', { name: '子項目' })],
          }),
          buildNewItem('root-2', { name: 'ルート項目2' }),
        ]);
        expect(setupResponse.status).toBe(200);

        const tree = await fetchItemTree(moveTestEstimateId);
        rootItem1Id = findByEstimateName(tree, 'ルート項目1')!.id;
        rootItem2Id = findByEstimateName(tree, 'ルート項目2')!.id;
        childItemId = findByEstimateName(tree, '子項目')!.id;
      });

      it('子項目をルートレベルへ移して保存すると再読込後も親を持たない (Req 34.5, 42.1, 44.5)', async () => {
        const before = toSaveNodes(await fetchItemTree(moveTestEstimateId));
        const root1 = before.find((node) => node.id === rootItem1Id)!;
        const child = root1.children.find((node) => node.id === childItemId)!;
        root1.children = root1.children.filter((node) => node.id !== childItemId);

        const response = await saveDraft(moveTestEstimateId, [...before, child]);
        expect(response.status).toBe(200);

        // 移動後の状態を確認
        const detailResponse = await request(app)
          .get(`/api/estimates/${moveTestEstimateId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(detailResponse.status).toBe(200);
        const rootItems = detailResponse.body.items;
        const movedItem = rootItems.find((item: { id: string }) => item.id === childItemId);
        expect(movedItem).toBeDefined();
        expect(movedItem.parentId).toBeNull();
        // 項目のIDは保存を跨いで維持される（Req 42.9）
        expect(
          movedItem.lines.find((line: { lineType: string }) => line.lineType === 'ESTIMATE').name
        ).toBe('子項目');
      });

      it('項目を別の項目の子へ移して保存すると再読込後も子として保持される (Req 34.5, 42.1, 44.4)', async () => {
        const before = toSaveNodes(await fetchItemTree(moveTestEstimateId));
        const root1 = before.find((node) => node.id === rootItem1Id)!;
        const root2 = before.find((node) => node.id === rootItem2Id)!;
        const child = root1.children.find((node) => node.id === childItemId)!;
        root1.children = [];
        root2.children = [...root2.children, child];

        const response = await saveDraft(moveTestEstimateId, before);
        expect(response.status).toBe(200);

        const after = await fetchItemTree(moveTestEstimateId);
        const newParent = after.find((item) => item.id === rootItem2Id);
        expect(newParent).toBeDefined();
        expect(newParent!.children.map((item) => item.id)).toContain(childItemId);
        const formerParent = after.find((item) => item.id === rootItem1Id);
        expect(formerParent!.children.length).toBe(0);
      });

      it('循環参照を含むツリーは422で保存を中止する (Req 42.8)', async () => {
        const before = await fetchItemTree(moveTestEstimateId);
        const nodes = toSaveNodes(before);
        const root1 = nodes.find((node) => node.id === rootItem1Id)!;
        const child = root1.children.find((node) => node.id === childItemId)!;
        // 子項目の配下に、その子項目自身の祖先である root1 を置く（循環参照）。
        // 送信データ自体が循環しないよう、祖先は値のコピーとして配置する
        child.children = [
          ...child.children,
          { ...structuredClone(root1), children: [] } satisfies SaveNodePayload,
        ];

        const response = await saveDraft(moveTestEstimateId, nodes);

        expect(response.status).toBe(422);

        // 保存は開始されず構造は変わらない（Req 42.3, 42.8）
        const after = await fetchItemTree(moveTestEstimateId);
        expect(after.find((item) => item.id === rootItem1Id)!.children.map((c) => c.id)).toEqual([
          childItemId,
        ]);
      });

      it('不正なリクエストボディは400エラーとなる (Req 42.4)', async () => {
        const response = await request(app)
          .put(`/api/estimates/${moveTestEstimateId}/save`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            expectedUpdatedAt: await fetchUpdatedAt(moveTestEstimateId),
            reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
            items: [
              {
                id: 'invalid-uuid',
                tempId: null,
                itemType: 'STANDARD',
                lines: [buildSaveLine('ESTIMATE', { name: '不正な項目' })],
                children: [],
              },
            ],
          });

        expect(response.status).toBe(400);
      });
    });

    // ========================================
    // 撤去した明細操作系6経路の統合レベルでの確認（Task 53.13, Req 42.1）
    // ========================================
    // design.md「Integration Tests」5「撤去した旧エンドポイントが404を返す」の統合テスト版。
    // 実サーバーに対して、撤去した6経路が404であること、および**維持対象の経路が404でない**こと
    // （＝過剰撤去が起きていないこと）を固定する。
    describe('撤去した明細操作系エンドポイント PUT /api/estimates/:id/save への統合', () => {
      let removedRouteEstimateId: string;
      let existingItemId: string;

      beforeAll(async () => {
        removedRouteEstimateId = await createEstimateForTest('撤去経路確認用見積書');
        const response = await saveDraft(removedRouteEstimateId, [
          buildNewItem('existing-1', { name: '撤去経路確認用項目', quantity: 1 }),
        ]);
        expect(response.status).toBe(200);
        existingItemId = (await fetchItemTree(removedRouteEstimateId))[0]!.id;
      });

      it('撤去した6経路はいずれも404を返す (Req 42.1)', async () => {
        const removedRoutes: Array<{ label: string; call: () => Promise<{ status: number }> }> = [
          {
            label: 'POST /:id/items',
            call: () =>
              request(app)
                .post(`/api/estimates/${removedRouteEstimateId}/items`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ displayOrder: 0, lines: [{ lineType: 'ESTIMATE', name: 'x' }] }),
          },
          {
            label: 'PUT /:id/items/batch',
            call: () =>
              request(app)
                .put(`/api/estimates/${removedRouteEstimateId}/items/batch`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ items: [], updatedAt: new Date().toISOString() }),
          },
          {
            label: 'PUT /:id/items/reorder',
            call: () =>
              request(app)
                .put(`/api/estimates/${removedRouteEstimateId}/items/reorder`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ itemOrders: [] }),
          },
          {
            label: 'POST /:id/items/:itemId/duplicate',
            call: () =>
              request(app)
                .post(`/api/estimates/${removedRouteEstimateId}/items/${existingItemId}/duplicate`)
                .set('Authorization', `Bearer ${accessToken}`),
          },
          {
            label: 'DELETE /:id/items/:itemId',
            call: () =>
              request(app)
                .delete(`/api/estimates/${removedRouteEstimateId}/items/${existingItemId}`)
                .set('Authorization', `Bearer ${accessToken}`),
          },
          {
            label: 'PATCH /:id/items/:itemId/move',
            call: () =>
              request(app)
                .patch(`/api/estimates/${removedRouteEstimateId}/items/${existingItemId}/move`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ newParentId: null }),
          },
        ];

        for (const route of removedRoutes) {
          const response = await route.call();
          expect(response.status, `${route.label} は404であるべき`).toBe(404);
        }

        // 撤去は経路のみで、明細は消えていない
        const tree = await fetchItemTree(removedRouteEstimateId);
        expect(tree.map((item) => item.id)).toEqual([existingItemId]);
      });

      it('維持対象の経路は404を返さない（過剰撤去の検出）', async () => {
        const keptRoutes: Array<{ label: string; call: () => Promise<{ status: number }> }> = [
          {
            label: 'GET /:id/items',
            call: () =>
              request(app)
                .get(`/api/estimates/${removedRouteEstimateId}/items`)
                .set('Authorization', `Bearer ${accessToken}`),
          },
          {
            label: 'PUT /:id/save',
            call: async () =>
              await saveDraft(
                removedRouteEstimateId,
                toSaveNodes(await fetchItemTree(removedRouteEstimateId))
              ),
          },
          {
            label: 'POST /:id/discount-items',
            call: () =>
              request(app)
                .post(`/api/estimates/${removedRouteEstimateId}/discount-items`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ unitPrice: -1 }),
          },
          {
            label: 'POST /:id/calculate-overhead',
            call: () =>
              request(app)
                .post(`/api/estimates/${removedRouteEstimateId}/calculate-overhead`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                  costType: 'COMMON_TEMPORARY',
                  directCost: '100000',
                  constructionMonths: 12,
                }),
          },
          {
            label: 'POST /:id/overhead-items',
            call: () =>
              request(app)
                .post(`/api/estimates/${removedRouteEstimateId}/overhead-items`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ costType: 'COMMON_TEMPORARY' }),
          },
          {
            label: 'POST /:id/transfer-quotation',
            call: () =>
              request(app)
                .post(`/api/estimates/${removedRouteEstimateId}/transfer-quotation`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({}),
          },
          {
            label: 'POST /:id/calculate-net',
            call: () =>
              request(app)
                .post(`/api/estimates/${removedRouteEstimateId}/calculate-net`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({}),
          },
          {
            label: 'POST /:id/apply-profit-rate',
            call: () =>
              request(app)
                .post(`/api/estimates/${removedRouteEstimateId}/apply-profit-rate`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({}),
          },
          {
            label: 'GET /:id/export',
            call: () =>
              request(app)
                .get(`/api/estimates/${removedRouteEstimateId}/export?format=pdf`)
                .set('Authorization', `Bearer ${accessToken}`),
          },
          {
            label: 'GET /:id',
            call: () =>
              request(app)
                .get(`/api/estimates/${removedRouteEstimateId}`)
                .set('Authorization', `Bearer ${accessToken}`),
          },
        ];

        // 検証したいのは「経路が存在すること」なので、ボディ不備由来の 400/422 は許容し
        // 404（経路なし＝過剰撤去）だけを不合格とする
        for (const route of keptRoutes) {
          const response = await route.call();
          expect(response.status, `${route.label} は撤去対象ではない`).not.toBe(404);
        }
      });
    });
  });

  // ==========================================
  // Task 13.3: 計算・転記API統合テスト
  // ==========================================
  // Requirements:
  // - 4.1-4.5: 受領見積書転記
  // - 5.1-5.7: NET金額計算と案分
  // - 6.1-6.6: 利益率による見積金額反映
  // - 7.1-9.6: 諸経費自動計算

  describe('計算・転記API統合テスト', () => {
    let calcTestEstimateId: string;

    beforeAll(async () => {
      // テスト用見積書を作成
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/estimates`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '計算・転記テスト用見積書',
        });
      calcTestEstimateId = response.body.id;
    });

    describe('諸経費計算 POST /api/estimates/:id/calculate-overhead', () => {
      it('共通仮設費を計算できる (Req 7.1, 7.2, 7.3)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-overhead`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'COMMON_TEMPORARY',
            directCost: '100000', // 1億円（千円単位）
            constructionPeriod: 12, // 12ヶ月
            isRenovation: false,
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('costType', 'COMMON_TEMPORARY');
        expect(response.body).toHaveProperty('rate');
        expect(response.body).toHaveProperty('amount');
        expect(response.body).toHaveProperty('formula');
        expect(parseFloat(response.body.rate)).toBeGreaterThan(0);
        expect(parseFloat(response.body.amount)).toBeGreaterThan(0);
      });

      it('現場管理費を計算できる (Req 8.1, 8.2, 8.3)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-overhead`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'SITE_MANAGEMENT',
            directCost: '100000',
            pureConstructionCost: '120000', // 1.2億円（千円単位）
            isRenovation: false,
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('costType', 'SITE_MANAGEMENT');
        expect(response.body).toHaveProperty('rate');
        expect(response.body).toHaveProperty('amount');
        expect(parseFloat(response.body.rate)).toBeGreaterThan(0);
      });

      it('一般管理費を計算できる (Req 9.1, 9.2, 9.3)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-overhead`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'GENERAL_ADMIN',
            directCost: '100000',
            constructionCost: '150000', // 1.5億円（千円単位）
            isRenovation: false,
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('costType', 'GENERAL_ADMIN');
        expect(response.body).toHaveProperty('rate');
        expect(response.body).toHaveProperty('amount');
        expect(parseFloat(response.body.rate)).toBeGreaterThan(0);
      });

      it('改修工事フラグを指定できる (Req 7.5)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-overhead`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'COMMON_TEMPORARY',
            directCost: '100000',
            constructionPeriod: 12,
            isRenovation: true,
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('costType', 'COMMON_TEMPORARY');
      });

      it('工期なしで共通仮設費を計算しようとすると400エラー', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-overhead`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'COMMON_TEMPORARY',
            directCost: '100000',
            isRenovation: false,
          });

        expect(response.status).toBe(400);
      });

      it('純工事費なしで現場管理費を計算しようとすると400エラー', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-overhead`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'SITE_MANAGEMENT',
            directCost: '100000',
            isRenovation: false,
          });

        expect(response.status).toBe(400);
      });

      it('工事原価なしで一般管理費を計算しようとすると400エラー', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-overhead`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'GENERAL_ADMIN',
            directCost: '100000',
            isRenovation: false,
          });

        expect(response.status).toBe(400);
      });
    });

    describe('諸経費行追加 POST /api/estimates/:id/overhead-items', () => {
      it('共通仮設費のプリセット行を追加できる (Req 7.6)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/overhead-items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'COMMON_TEMPORARY',
          });

        expect(response.status).toBe(201);
        expect(response.body.lines).toBeInstanceOf(Array);
        expect(response.body.lines.length).toBe(3);

        // プリセット値の確認
        const estimateLine = response.body.lines.find(
          (line: { lineType: string }) => line.lineType === 'ESTIMATE'
        );
        expect(estimateLine.name).toBe('共通仮設費');
        expect(estimateLine.unit).toBe('式');
        expect(parseFloat(estimateLine.quantity)).toBe(1);
      });

      it('現場管理費のプリセット行を追加できる', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/overhead-items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'SITE_MANAGEMENT',
          });

        expect(response.status).toBe(201);
        const estimateLine = response.body.lines.find(
          (line: { lineType: string }) => line.lineType === 'ESTIMATE'
        );
        expect(estimateLine.name).toBe('現場管理費');
      });

      it('一般管理費のプリセット行を追加できる', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/overhead-items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'GENERAL_ADMIN',
          });

        expect(response.status).toBe(201);
        const estimateLine = response.body.lines.find(
          (line: { lineType: string }) => line.lineType === 'ESTIMATE'
        );
        expect(estimateLine.name).toBe('一般管理費');
      });

      it('単価を指定して諸経費行を追加できる', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/overhead-items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'COMMON_TEMPORARY',
            unitPrice: 5000000, // 500万円
          });

        expect(response.status).toBe(201);
        const estimateLine = response.body.lines.find(
          (line: { lineType: string }) => line.lineType === 'ESTIMATE'
        );
        expect(parseFloat(estimateLine.unitPrice)).toBe(5000000);
      });

      it('存在しない見積書に諸経費行を追加しようとすると404エラー', async () => {
        const response = await request(app)
          .post('/api/estimates/12345678-1234-4234-a234-123456789012/overhead-items')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            costType: 'COMMON_TEMPORARY',
          });

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('code', 'ESTIMATE_NOT_FOUND');
      });
    });

    describe('NET金額計算・案分 POST /api/estimates/:id/calculate-net', () => {
      const vendorLineIds: string[] = [];

      beforeAll(async () => {
        // NET金額計算テスト用にVENDOR行を持つ見積項目を3つ作成
        // 撤去済みの `POST /:id/items` から `PUT /:id/save` へ移行（Task 53.13）。
        // ここはあくまで `POST /:id/calculate-net`（維持対象）のセットアップである。
        const items = [
          { name: 'NET項目A', quantity: 100, unitPrice: 3000 },
          { name: 'NET項目B', quantity: 200, unitPrice: 4000 },
          { name: 'NET項目C', quantity: 50, unitPrice: 2000 },
        ];

        const existing = toSaveNodes(await fetchItemTree(calcTestEstimateId));
        const saveResponse = await saveDraft(calcTestEstimateId, [
          ...existing,
          ...items.map((item, index) =>
            buildNewItem(`net-${index}`, {
              name: item.name,
              unit: 'm2',
              quantity: item.quantity,
              estimateUnitPrice: item.unitPrice,
              vendorUnitPrice: item.unitPrice,
            })
          ),
        ]);
        expect(saveResponse.status).toBe(200);

        const tree = await fetchItemTree(calcTestEstimateId);
        for (const item of items) {
          const savedItem = findByEstimateName(tree, item.name);
          expect(savedItem).toBeDefined();
          const vendorLine = savedItem!.lines.find((line) => line.lineType === 'VENDOR');
          expect(vendorLine).toBeDefined();
          vendorLineIds.push(vendorLine!.id);
        }
      });

      it('NET金額の案分計算ができる (Req 5.1, 5.2, 5.3)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-net`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            vendorName: 'テスト業者',
            targetLineIds: vendorLineIds,
            excludeLineIds: [],
            netAmount: '1000000',
          });

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
        expect(response.body.length).toBeGreaterThan(0);

        // 各行の結果を確認
        response.body.forEach(
          (item: { lineId: string; allocatedAmount: string; ratio: string }) => {
            expect(item).toHaveProperty('lineId');
            expect(item).toHaveProperty('allocatedAmount');
            expect(item).toHaveProperty('ratio');
          }
        );
      });

      it('除外行を指定してNET金額計算ができる (Req 5.4)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/calculate-net`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            vendorName: 'テスト業者',
            targetLineIds: vendorLineIds,
            excludeLineIds: [vendorLineIds[0]],
            netAmount: '1000000',
          });

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
      });
    });

    describe('利益率適用 POST /api/estimates/:id/apply-profit-rate', () => {
      it('利益率を適用できる (Req 6.1, 6.2)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/apply-profit-rate`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            profitRate: '15.00',
            overwriteOption: 'all',
          });

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
      });

      it('上書きオプションempty_onlyで利益率を適用できる (Req 6.4)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/apply-profit-rate`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            profitRate: '20.00',
            overwriteOption: 'empty_only',
          });

        expect(response.status).toBe(200);
      });

      it('上書きオプションunit_price_onlyで利益率を適用できる (Req 6.5)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/apply-profit-rate`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            profitRate: '25.00',
            overwriteOption: 'unit_price_only',
          });

        expect(response.status).toBe(200);
      });

      it('利益率が範囲外（0未満）の場合は400エラー (Req 6.3)', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/apply-profit-rate`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            profitRate: '-10.00',
            overwriteOption: 'all',
          });

        expect(response.status).toBe(400);
      });

      it('利益率が範囲外（500超）の場合は400エラー', async () => {
        const response = await request(app)
          .post(`/api/estimates/${calcTestEstimateId}/apply-profit-rate`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            profitRate: '501.00',
            overwriteOption: 'all',
          });

        expect(response.status).toBe(400);
      });
    });

    describe('見積書出力 GET /api/estimates/:id/export', () => {
      it('PDF形式で見積書を出力できる (Req 10.1)', async () => {
        const response = await request(app)
          .get(`/api/estimates/${calcTestEstimateId}/export`)
          .query({ format: 'pdf' })
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('application/pdf');
        expect(response.headers['content-disposition']).toContain('attachment');
        expect(response.body).toBeDefined();
      });

      it('Excel形式で見積書を出力できる (Req 10.2)', async () => {
        const response = await request(app)
          .get(`/api/estimates/${calcTestEstimateId}/export`)
          .query({ format: 'xlsx' })
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        expect(response.headers['content-disposition']).toContain('attachment');
      });

      it('存在しない見積書を出力しようとすると404エラー', async () => {
        const response = await request(app)
          .get('/api/estimates/12345678-1234-4234-a234-123456789012/export')
          .query({ format: 'pdf' })
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('code', 'ESTIMATE_NOT_FOUND');
      });

      it('不正な出力形式を指定すると400エラー', async () => {
        const response = await request(app)
          .get(`/api/estimates/${calcTestEstimateId}/export`)
          .query({ format: 'invalid' })
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(400);
      });
    });
  });
});
