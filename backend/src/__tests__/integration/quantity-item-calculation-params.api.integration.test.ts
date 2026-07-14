/**
 * @fileoverview 数量項目 作成・更新API 計算パラメータ判別子検証 統合テスト
 *
 * 編集画面はドラフト一括保存（PUT /api/quantity-tables/:id/save）経路のみを通るため、
 * 個々の作成・更新エンドポイントは E2E では踏まれない。design.md が
 * 「（判別子化が）適用されていることを統合テストで確認する」と明記している経路を、
 * 実DB（architrack_test）に対するラウンドトリップで検証する。
 *
 * Task 67.3: 数量項目の作成・更新 API に判別子検証が適用されることの統合テストを実装する
 *
 * Requirements:
 * - 48.3: 計算方法を「ピッチ」から「箇所数」へ変更して箇所数を入力し保存すると、箇所数を欠落させずに永続化する
 * - 48.5: 計算用パラメータの検証を計算方法に対応する規則で行い、パラメータの形状から計算方法を推測しない
 * - 48.6: 指定された計算方法で使用しないフィールドは破棄したうえで保存する
 * - 48.4（回帰）: 「ピッチ」→「面積・体積」への切替で入力された寸法を欠落させずに永続化する
 *
 * Design: design.md「計算方法切替時のパラメータ整合（REQ-48）」
 * - PARAMS_SCHEMA_BY_METHOD + withCalculationParams() superRefine
 * - 適用先: createQuantityItemSchema / updateQuantityItemSchema（quantity-items.routes.ts が参照）
 * - Invariant: 永続化される calculationParams は、必ずその行の calculationMethod に対応するキーのみを持つ
 *
 * @module __tests__/integration/quantity-item-calculation-params.api.integration.test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';

const TEST_EMAIL = 'test-quantity-item-calc-params@example.com';
const PASSWORD = 'TestPassword123!';

/** ピッチ計算の必須4キー（切替後に破棄されるべきキー） */
const PITCH_ONLY_KEYS = ['rangeLength', 'endLength1', 'endLength2', 'pitchLength'] as const;

/** ピッチのキーと箇所数・寸法が混在した計算パラメータ（画面での計算方法切替後に発生する状態） */
const MIXED_PARAMS_WITH_COUNT = {
  rangeLength: 100,
  endLength1: 10,
  endLength2: 10,
  pitchLength: 5,
  count: 5,
  length: 2,
  weight: 1.5,
} as const;

/** ピッチのキーと面積・体積の寸法が混在した計算パラメータ */
const MIXED_PARAMS_WITH_WIDTH = {
  rangeLength: 100,
  endLength1: 10,
  endLength2: 10,
  pitchLength: 5,
  width: 3,
  weight: 1.5,
} as const;

/** 純粋なピッチ計算パラメータ */
const PITCH_PARAMS = {
  rangeLength: 100,
  endLength1: 10,
  endLength2: 10,
  pitchLength: 5,
} as const;

describe('Quantity Item Calculation Params (判別子検証) API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;
  let testQuantityTableId: string;
  let testQuantityGroupId: string;

  /**
   * quantity_table 権限を持つテストユーザーを作成してログイン
   */
  const setupUser = async (): Promise<{ token: string; userId: string }> => {
    const passwordHash = await (
      await import('@node-rs/argon2')
    ).hash(PASSWORD, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        displayName: 'Quantity Item Calc Params Test User',
        passwordHash,
      },
    });

    const userRole = await prisma.role.findUnique({ where: { name: 'user' } });
    if (userRole) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: userRole.id },
      });
    }

    // 数量表関連の権限は seedPermissions に含まれないため明示的に投入する
    await prisma.permission.createMany({
      data: [
        { resource: 'quantity_table', action: 'create', description: '数量表の作成' },
        { resource: 'quantity_table', action: 'read', description: '数量表の閲覧' },
        { resource: 'quantity_table', action: 'update', description: '数量表の更新' },
        { resource: 'quantity_table', action: 'delete', description: '数量表の削除' },
      ],
      skipDuplicates: true,
    });

    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: 'project', action: { in: ['create', 'read', 'update', 'delete'] } },
          { resource: 'quantity_table', action: { in: ['create', 'read', 'update', 'delete'] } },
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
      .send({ email: TEST_EMAIL, password: PASSWORD });

    return { token: response.body.accessToken, userId: user.id };
  };

  /**
   * 数量項目を作成する（POST /api/quantity-groups/:groupId/items）
   */
  const postItem = async (body: Record<string, unknown>): Promise<SupertestResponse> => {
    return await request(app)
      .post(`/api/quantity-groups/${testQuantityGroupId}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        majorCategory: '建築工事',
        workType: '足場工事',
        name: '判別子検証テスト項目',
        unit: 'm',
        quantity: 10,
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
        ...body,
      });
  };

  /**
   * DBに直接ピッチ項目を作成し、更新API用の id / expectedUpdatedAt を返す
   */
  const seedPitchItem = async (): Promise<{ id: string; expectedUpdatedAt: string }> => {
    const item = await prisma.quantityItem.create({
      data: {
        quantityGroupId: testQuantityGroupId,
        majorCategory: '建築工事',
        workType: '足場工事',
        name: '切替前のピッチ項目',
        unit: 'm',
        calculationMethod: 'PITCH',
        calculationParams: { ...PITCH_PARAMS },
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
        quantity: 17,
        displayOrder: 0,
      },
    });
    return { id: item.id, expectedUpdatedAt: item.updatedAt.toISOString() };
  };

  /**
   * 数量項目を更新する（PUT /api/quantity-items/:id）
   */
  const putItem = async (
    id: string,
    expectedUpdatedAt: string,
    body: Record<string, unknown>
  ): Promise<SupertestResponse> => {
    return await request(app)
      .put(`/api/quantity-items/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ expectedUpdatedAt, ...body });
  };

  /**
   * 永続化された calculationParams を取得する（レスポンスではなくDBの実値）
   */
  const readPersistedParams = async (id: string): Promise<unknown> => {
    const persisted = await prisma.quantityItem.findUniqueOrThrow({
      where: { id },
      select: { calculationParams: true },
    });
    return persisted.calculationParams;
  };

  /**
   * 400 レスポンスに含まれる全メッセージ（detail + details[].message）
   */
  const errorMessages = (body: Record<string, unknown>): string[] => {
    const details = (body.details ?? []) as Array<{ message?: string }>;
    return [String(body.detail ?? ''), ...details.map((d) => String(d.message ?? ''))];
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const auth = await setupUser();
    accessToken = auth.token;
    testUserId = auth.userId;

    const project = await prisma.project.create({
      data: {
        name: 'テスト用プロジェクト_計算パラメータ判別子',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    testProjectId = project.id;

    const table = await prisma.quantityTable.create({
      data: { projectId: testProjectId, name: '判別子検証テスト数量表' },
    });
    testQuantityTableId = table.id;

    const group = await prisma.quantityGroup.create({
      data: {
        quantityTableId: testQuantityTableId,
        name: '判別子検証テストグループ',
        displayOrder: 0,
      },
    });
    testQuantityGroupId = group.id;
  });

  afterAll(async () => {
    if (testProjectId) {
      await prisma.project.deleteMany({ where: { id: testProjectId } });
    }
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });

    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(async () => {
    await prisma.quantityItem.deleteMany({ where: { quantityGroupId: testQuantityGroupId } });
  });

  describe('POST /api/quantity-groups/:groupId/items（作成API）', () => {
    it('計算方法「箇所数」で混在パラメータを送ると箇所数が保持されピッチのキーが破棄される (Req 48.3, 48.5, 48.6)', async () => {
      const response = await postItem({
        calculationMethod: 'COUNT',
        calculationParams: { ...MIXED_PARAMS_WITH_COUNT },
      });

      expect(response.status).toBe(201);
      // レスポンス: ピッチのキーは破棄され、箇所数のキーのみが残る
      expect(response.body.calculationMethod).toBe('COUNT');
      expect(response.body.calculationParams).toEqual({ count: 5, length: 2, weight: 1.5 });

      // DB: 永続化された値も同一（形状推測による silent strip が起きていない）
      const persisted = await readPersistedParams(response.body.id as string);
      expect(persisted).toEqual({ count: 5, length: 2, weight: 1.5 });
      for (const key of PITCH_ONLY_KEYS) {
        expect(persisted).not.toHaveProperty(key);
      }
    });

    it('計算方法「面積・体積」で混在パラメータを送ると幅が保持されピッチのキーが破棄される (Req 48.6)', async () => {
      const response = await postItem({
        calculationMethod: 'AREA_VOLUME',
        calculationParams: { ...MIXED_PARAMS_WITH_WIDTH },
      });

      expect(response.status).toBe(201);
      expect(response.body.calculationParams).toEqual({ width: 3, weight: 1.5 });

      const persisted = await readPersistedParams(response.body.id as string);
      expect(persisted).toEqual({ width: 3, weight: 1.5 });
      for (const key of PITCH_ONLY_KEYS) {
        expect(persisted).not.toHaveProperty(key);
      }
    });

    it('計算方法「箇所数」で箇所数が未指定の場合は400を返す（日本語メッセージ） (Req 48.5)', async () => {
      const response = await postItem({
        calculationMethod: 'COUNT',
        calculationParams: { ...PITCH_PARAMS },
      });

      expect(response.status).toBe(400);
      expect(errorMessages(response.body)).toContain('箇所数は必須です');

      const items = await prisma.quantityItem.findMany({
        where: { quantityGroupId: testQuantityGroupId },
      });
      expect(items).toHaveLength(0);
    });

    it('計算方法「箇所数」で箇所数が小数の場合は400を返す (Req 48.5)', async () => {
      const response = await postItem({
        calculationMethod: 'COUNT',
        calculationParams: { count: 2.5 },
      });

      expect(response.status).toBe(400);
      expect(errorMessages(response.body)).toContain('箇所数は整数で入力してください');
    });

    it('計算方法「箇所数」で箇所数が範囲外（0 / 10000000）の場合は400を返す (Req 48.5)', async () => {
      const tooSmall = await postItem({
        calculationMethod: 'COUNT',
        calculationParams: { count: 0 },
      });
      expect(tooSmall.status).toBe(400);
      expect(errorMessages(tooSmall.body)).toContain('箇所数は1〜9999999の範囲で入力してください');

      const tooLarge = await postItem({
        calculationMethod: 'COUNT',
        calculationParams: { count: 10000000 },
      });
      expect(tooLarge.status).toBe(400);
      expect(errorMessages(tooLarge.body)).toContain('箇所数は1〜9999999の範囲で入力してください');
    });

    it('計算方法「箇所数」で有効な箇所数を送ると作成できる (Req 48.5)', async () => {
      const response = await postItem({
        calculationMethod: 'COUNT',
        calculationParams: { count: 12 },
      });

      expect(response.status).toBe(201);
      expect(await readPersistedParams(response.body.id as string)).toEqual({ count: 12 });
    });

    it('既存3方式（標準・面積体積・ピッチ）の作成が壊れていない（回帰）', async () => {
      const standard = await postItem({ calculationMethod: 'STANDARD', calculationParams: null });
      expect(standard.status).toBe(201);
      expect(await readPersistedParams(standard.body.id as string)).toBeNull();

      const areaVolume = await postItem({
        calculationMethod: 'AREA_VOLUME',
        calculationParams: { width: 5, depth: 3, height: 2.5 },
      });
      expect(areaVolume.status).toBe(201);
      expect(await readPersistedParams(areaVolume.body.id as string)).toEqual({
        width: 5,
        depth: 3,
        height: 2.5,
      });

      const pitch = await postItem({
        calculationMethod: 'PITCH',
        calculationParams: { ...PITCH_PARAMS, length: 2, weight: 1.5 },
      });
      expect(pitch.status).toBe(201);
      expect(await readPersistedParams(pitch.body.id as string)).toEqual({
        ...PITCH_PARAMS,
        length: 2,
        weight: 1.5,
      });
    });

    it('ピッチの必須パラメータが欠落している場合は400を返す（日本語メッセージ）', async () => {
      const response = await postItem({
        calculationMethod: 'PITCH',
        calculationParams: { rangeLength: 100 },
      });

      expect(response.status).toBe(400);
      expect(errorMessages(response.body)).toContain('ピッチ長は必須です');
    });
  });

  describe('PUT /api/quantity-items/:id（更新API）', () => {
    it('ピッチ→箇所数への切替で箇所数が保持されピッチのキーが破棄される (Req 48.3, 48.5, 48.6)', async () => {
      const { id, expectedUpdatedAt } = await seedPitchItem();

      const response = await putItem(id, expectedUpdatedAt, {
        calculationMethod: 'COUNT',
        calculationParams: { ...MIXED_PARAMS_WITH_COUNT },
      });

      expect(response.status).toBe(200);
      expect(response.body.calculationMethod).toBe('COUNT');
      expect(response.body.calculationParams).toEqual({ count: 5, length: 2, weight: 1.5 });

      // DB: 箇所数が欠落せずに永続化される（REQ-48 の中核シナリオ）
      const persisted = await readPersistedParams(id);
      expect(persisted).toEqual({ count: 5, length: 2, weight: 1.5 });
      expect(persisted).toHaveProperty('count', 5);
      for (const key of PITCH_ONLY_KEYS) {
        expect(persisted).not.toHaveProperty(key);
      }
    });

    it('ピッチ→面積・体積への切替で幅が保持されピッチのキーが破棄される (Req 48.4, 48.6 既存不具合の回帰テスト)', async () => {
      const { id, expectedUpdatedAt } = await seedPitchItem();

      const response = await putItem(id, expectedUpdatedAt, {
        calculationMethod: 'AREA_VOLUME',
        calculationParams: { ...MIXED_PARAMS_WITH_WIDTH },
      });

      expect(response.status).toBe(200);
      expect(response.body.calculationParams).toEqual({ width: 3, weight: 1.5 });

      const persisted = await readPersistedParams(id);
      expect(persisted).toEqual({ width: 3, weight: 1.5 });
      expect(persisted).toHaveProperty('width', 3);
      for (const key of PITCH_ONLY_KEYS) {
        expect(persisted).not.toHaveProperty(key);
      }
    });

    it('箇所数への切替で箇所数が未指定なら400を返し、切替前のピッチパラメータが保持される (Req 48.5)', async () => {
      const { id, expectedUpdatedAt } = await seedPitchItem();

      const response = await putItem(id, expectedUpdatedAt, {
        calculationMethod: 'COUNT',
        calculationParams: { ...PITCH_PARAMS },
      });

      expect(response.status).toBe(400);
      expect(errorMessages(response.body)).toContain('箇所数は必須です');

      // 更新は中断され、DBは変更されない
      const persisted = await readPersistedParams(id);
      expect(persisted).toEqual({ ...PITCH_PARAMS });
    });

    it('計算方法を伴わない計算パラメータのみの更新は400を返す（形状からの推測を行わない） (Req 48.5)', async () => {
      const { id, expectedUpdatedAt } = await seedPitchItem();

      const response = await putItem(id, expectedUpdatedAt, {
        calculationParams: { count: 5 },
      });

      expect(response.status).toBe(400);

      const persisted = await readPersistedParams(id);
      expect(persisted).toEqual({ ...PITCH_PARAMS });
    });

    it('ピッチ→標準への切替で計算パラメータがnullになる (Req 48.6)', async () => {
      const { id, expectedUpdatedAt } = await seedPitchItem();

      const response = await putItem(id, expectedUpdatedAt, {
        calculationMethod: 'STANDARD',
        calculationParams: null,
      });

      expect(response.status).toBe(200);
      expect(await readPersistedParams(id)).toBeNull();
    });

    it('計算パラメータを伴わない更新（名称のみ）は既存の計算パラメータを維持する（回帰）', async () => {
      const { id, expectedUpdatedAt } = await seedPitchItem();

      const response = await putItem(id, expectedUpdatedAt, { name: '名称のみ更新' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('名称のみ更新');
      expect(await readPersistedParams(id)).toEqual({ ...PITCH_PARAMS });
    });

    it('ピッチのまま計算パラメータを更新できる（回帰）', async () => {
      const { id, expectedUpdatedAt } = await seedPitchItem();

      const response = await putItem(id, expectedUpdatedAt, {
        calculationMethod: 'PITCH',
        calculationParams: { ...PITCH_PARAMS, pitchLength: 2, length: 3, weight: 1.2 },
      });

      expect(response.status).toBe(200);
      expect(await readPersistedParams(id)).toEqual({
        ...PITCH_PARAMS,
        pitchLength: 2,
        length: 3,
        weight: 1.2,
      });
    });

    it('箇所数→箇所数の更新で小数の箇所数は400を返す (Req 48.5)', async () => {
      const created = await postItem({
        calculationMethod: 'COUNT',
        calculationParams: { count: 3 },
      });
      expect(created.status).toBe(201);
      const id = created.body.id as string;
      const expectedUpdatedAt = new Date(created.body.updatedAt as string).toISOString();

      const response = await putItem(id, expectedUpdatedAt, {
        calculationMethod: 'COUNT',
        calculationParams: { count: 4.5 },
      });

      expect(response.status).toBe(400);
      expect(errorMessages(response.body)).toContain('箇所数は整数で入力してください');
      expect(await readPersistedParams(id)).toEqual({ count: 3 });
    });
  });
});
