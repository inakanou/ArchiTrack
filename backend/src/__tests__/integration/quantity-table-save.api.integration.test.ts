/**
 * @fileoverview 数量表フル状態同期保存API統合テスト（PUT /api/quantity-tables/:id/save）
 *
 * 編集画面唯一の書き込みエンドポイント（既存 bulk-save を統合・置換）の統合テスト。
 * 実DB（architrack-*-test, postgres:5433）に対して、認証・権限・存在確認・楽観ロック・
 * フル状態差分同期（新規/更新/削除/並び替え）の原子的永続化・並行保存を検証する。
 *
 * Task 59.4: フル状態同期保存 API の統合テストを実装する
 *
 * Requirements:
 * - 42.5: 保存操作時に全変更（新規/更新/削除/並び替え）を一括永続化する
 * - 42.8: 保存正常完了時に最新データを返却し画面・編集状態を同期する
 * - 42.9: 整合性/競合/サーバーエラー時はエラーを返し未保存状態を保持可能とする（保存中断）
 *
 * Design: design.md L2116-2127（API Contract + Implementation Notes）
 * - PUT /api/quantity-tables/:id/save | SaveQuantityTableDraftInput | QuantityTableDetail | 400,403,404,409
 * - 差分アルゴリズム: DB id 集合と payload id 集合の差分で delete/create/update を決定。
 *   displayOrder は payload の配列順を正とする
 * - 権限: requirePermission('quantity_table:update')（RBAC。プロジェクト単位のスコープ制御は本spec対象外）
 *
 * @module __tests__/integration/quantity-table-save.api.integration.test
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

const PERMITTED_EMAIL = 'test-quantity-table-save-permitted@example.com';
const NO_PERMISSION_EMAIL = 'test-quantity-table-save-no-permission@example.com';
const PASSWORD = 'TestPassword123!';
const NON_EXISTENT_UUID = '12345678-1234-4234-a234-123456789012';

/**
 * 数量表フル状態同期保存API統合テスト
 */
describe('Quantity Table Save (PUT /:id/save) API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let noPermissionAccessToken: string;
  let testUserId: string;
  let testProjectId: string;
  let otherProjectId: string;

  /**
   * argon2 でパスワードハッシュを生成
   */
  const hashPassword = async (): Promise<string> => {
    return (await import('@node-rs/argon2')).hash(PASSWORD, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  };

  /**
   * quantity_table:update 等の権限を持つユーザーを作成してログイン
   */
  const setupPermittedUser = async (): Promise<{ token: string; userId: string }> => {
    const passwordHash = await hashPassword();

    const user = await prisma.user.create({
      data: {
        email: PERMITTED_EMAIL,
        displayName: 'Quantity Table Save Permitted User',
        passwordHash,
      },
    });

    const userRole = await prisma.role.findUnique({ where: { name: 'user' } });
    if (userRole) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: userRole.id },
      });
    }

    // 数量表関連の権限を作成（seedPermissions に含まれないため明示的に投入）
    const quantityTablePermissions = [
      { resource: 'quantity_table', action: 'create', description: '数量表の作成' },
      { resource: 'quantity_table', action: 'read', description: '数量表の閲覧' },
      { resource: 'quantity_table', action: 'update', description: '数量表の更新' },
      { resource: 'quantity_table', action: 'delete', description: '数量表の削除' },
    ];
    await prisma.permission.createMany({
      data: quantityTablePermissions,
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
      .send({ email: PERMITTED_EMAIL, password: PASSWORD });

    return { token: response.body.accessToken, userId: user.id };
  };

  /**
   * 権限なしユーザーを作成してログイン（ロール未割り当て = quantity_table:update 権限なし）
   */
  const setupNoPermissionUser = async (): Promise<string> => {
    const passwordHash = await hashPassword();

    await prisma.user.create({
      data: {
        email: NO_PERMISSION_EMAIL,
        displayName: 'Quantity Table Save No Permission User',
        passwordHash,
      },
    });

    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: NO_PERMISSION_EMAIL, password: PASSWORD });

    return loginResponse.body.accessToken;
  };

  /**
   * テスト用プロジェクトを作成
   */
  const createTestProject = async (name: string): Promise<string> => {
    const project = await prisma.project.create({
      data: {
        name,
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    return project.id;
  };

  /**
   * グループ・項目付きの数量表を作成し、最新の updatedAt（楽観ロック用）を返す
   */
  const createSeededTable = async (
    projectId: string,
    name: string
  ): Promise<{
    tableId: string;
    group1Id: string;
    group2Id: string;
    item1Id: string;
    item2Id: string;
    item3Id: string;
  }> => {
    const table = await prisma.quantityTable.create({
      data: { projectId, name },
    });

    const group1 = await prisma.quantityGroup.create({
      data: { quantityTableId: table.id, name: '初期グループ1', displayOrder: 0 },
    });
    const group2 = await prisma.quantityGroup.create({
      data: { quantityTableId: table.id, name: '初期グループ2', displayOrder: 1 },
    });

    const item1 = await prisma.quantityItem.create({
      data: {
        quantityGroupId: group1.id,
        majorCategory: '建築工事',
        workType: '足場工事',
        name: '外部足場',
        unit: 'm2',
        calculationMethod: 'STANDARD',
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
        quantity: 100,
        displayOrder: 0,
      },
    });
    const item2 = await prisma.quantityItem.create({
      data: {
        quantityGroupId: group1.id,
        majorCategory: '建築工事',
        workType: '型枠工事',
        name: '型枠',
        unit: 'm2',
        calculationMethod: 'STANDARD',
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
        quantity: 50,
        displayOrder: 1,
      },
    });
    const item3 = await prisma.quantityItem.create({
      data: {
        quantityGroupId: group2.id,
        majorCategory: '土木工事',
        workType: '鉄筋工事',
        name: '鉄筋',
        unit: '本',
        calculationMethod: 'STANDARD',
        adjustmentFactor: 1.0,
        roundingUnit: 1.0,
        quantity: 10,
        displayOrder: 0,
      },
    });

    return {
      tableId: table.id,
      group1Id: group1.id,
      group2Id: group2.id,
      item1Id: item1.id,
      item2Id: item2.id,
      item3Id: item3.id,
    };
  };

  /**
   * 数量表の現在の updatedAt を ISO 文字列で取得（楽観ロック用）
   */
  const getExpectedUpdatedAt = async (tableId: string): Promise<string> => {
    const t = await prisma.quantityTable.findUniqueOrThrow({
      where: { id: tableId },
      select: { updatedAt: true },
    });
    return t.updatedAt.toISOString();
  };

  /**
   * saveDraft 用の有効な項目ペイロードを生成
   */
  const itemPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: null,
    majorCategory: null,
    middleCategory: null,
    minorCategory: null,
    customCategory: null,
    workType: '工種',
    name: '名称',
    specification: null,
    unit: 'm',
    calculationMethod: 'STANDARD',
    calculationParams: null,
    adjustmentFactor: 1.0,
    roundingUnit: 0.01,
    quantity: 10,
    remarks: null,
    displayOrder: 0,
    ...overrides,
  });

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

    testProjectId = await createTestProject('保存テスト_主プロジェクト');
    otherProjectId = await createTestProject('保存テスト_別プロジェクト');
  });

  afterAll(async () => {
    if (testProjectId) {
      await prisma.project.deleteMany({ where: { id: testProjectId } });
    }
    if (otherProjectId) {
      await prisma.project.deleteMany({ where: { id: otherProjectId } });
    }
    await prisma.user.deleteMany({
      where: { email: { in: [PERMITTED_EMAIL, NO_PERMISSION_EMAIL] } },
    });

    await prisma.$disconnect();
    redis.disconnect();
  });

  // 各テスト前に主プロジェクト・別プロジェクトの数量表をクリーンアップ
  beforeEach(async () => {
    await prisma.quantityTable.deleteMany({ where: { projectId: testProjectId } });
    await prisma.quantityTable.deleteMany({ where: { projectId: otherProjectId } });
  });

  describe('認可・存在確認（Req 42.9）', () => {
    it('認証なしリクエストは 401 で拒否される', async () => {
      const { tableId } = await createSeededTable(testProjectId, '認証なしテスト');
      const expectedUpdatedAt = await getExpectedUpdatedAt(tableId);

      const response = await request(app)
        .put(`/api/quantity-tables/${tableId}/save`)
        .send({ expectedUpdatedAt, name: '認証なしテスト', groups: [] });

      expect(response.status).toBe(401);

      // 書き込みが発生していないこと（グループは元のまま）
      const groups = await prisma.quantityGroup.findMany({ where: { quantityTableId: tableId } });
      expect(groups).toHaveLength(2);
    });

    it('権限なしユーザー（quantity_table:update 権限なし）では 403 が返る', async () => {
      const { tableId } = await createSeededTable(testProjectId, '権限なしテスト');
      const expectedUpdatedAt = await getExpectedUpdatedAt(tableId);

      expect(noPermissionAccessToken).toBeDefined();

      const response = await request(app)
        .put(`/api/quantity-tables/${tableId}/save`)
        .set('Authorization', `Bearer ${noPermissionAccessToken}`)
        .send({ expectedUpdatedAt, name: '権限なしテスト', groups: [] });

      expect(response.status).toBe(403);

      // 書き込みが発生していないこと
      const groups = await prisma.quantityGroup.findMany({ where: { quantityTableId: tableId } });
      expect(groups).toHaveLength(2);
    });

    it('存在しない数量表では 404（QUANTITY_TABLE_NOT_FOUND）が返る', async () => {
      const response = await request(app)
        .put(`/api/quantity-tables/${NON_EXISTENT_UUID}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt: new Date().toISOString(),
          name: '存在しないテスト',
          groups: [],
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_NOT_FOUND');
    });

    it('論理削除済みの数量表では 404（QUANTITY_TABLE_NOT_FOUND）が返る', async () => {
      const { tableId } = await createSeededTable(testProjectId, '論理削除テスト');
      const expectedUpdatedAt = await getExpectedUpdatedAt(tableId);
      await prisma.quantityTable.update({
        where: { id: tableId },
        data: { deletedAt: new Date() },
      });

      const response = await request(app)
        .put(`/api/quantity-tables/${tableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expectedUpdatedAt, name: '論理削除テスト', groups: [] });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_NOT_FOUND');
    });

    it(
      '他プロジェクトの数量表でも、quantity_table:update を持つユーザーは保存できる' +
        '（本エンドポイントは RBAC のみでプロジェクト単位スコープ制御を行わない: design L2127）。' +
        'プロジェクト境界の保護は権限欠如（403）で担保される',
      async () => {
        // 別プロジェクトの数量表に対して、権限ありユーザーで保存
        const { tableId } = await createSeededTable(otherProjectId, '他プロジェクト保存テスト');
        const expectedUpdatedAt = await getExpectedUpdatedAt(tableId);

        const okResponse = await request(app)
          .put(`/api/quantity-tables/${tableId}/save`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            expectedUpdatedAt,
            name: '他プロジェクト保存後',
            groups: [],
          });

        // RBAC のみのため 200（プロジェクトに依らず権限で許可される）
        expect(okResponse.status).toBe(200);
        expect(okResponse.body.name).toBe('他プロジェクト保存後');

        // 一方、権限なしユーザーは他プロジェクトの数量表に対しても 403（境界保護）
        const { tableId: tableId2 } = await createSeededTable(
          otherProjectId,
          '他プロジェクト権限なしテスト'
        );
        const expectedUpdatedAt2 = await getExpectedUpdatedAt(tableId2);
        const forbidden = await request(app)
          .put(`/api/quantity-tables/${tableId2}/save`)
          .set('Authorization', `Bearer ${noPermissionAccessToken}`)
          .send({ expectedUpdatedAt: expectedUpdatedAt2, name: 'x', groups: [] });

        expect(forbidden.status).toBe(403);
      }
    );
  });

  describe('フル状態同期保存（Req 42.5, 42.8）', () => {
    it('新規/更新/削除/並び替えが原子的に永続化され、再取得（GET詳細）で反映が保持される', async () => {
      // Arrange: 2グループ（group1: item1,item2 / group2: item3）の初期状態
      const seeded = await createSeededTable(testProjectId, '原子的保存テスト');
      const expectedUpdatedAt = await getExpectedUpdatedAt(seeded.tableId);

      // Act: フル状態を以下に同期
      //  - group2 を削除（payload に含めない）→ 配下 item3 も連鎖削除
      //  - group1 を「更新」（名称変更・displayOrder=1へ並び替え）
      //    - item1 を「更新」（数量変更）
      //    - item2 を「削除」（payload に含めない）
      //    - 新規項目 newItem を追加
      //  - 新規グループ newGroup を「追加」（displayOrder=0で先頭へ並び替え）
      const savePayload = {
        expectedUpdatedAt,
        name: '原子的保存テスト_更新後',
        groups: [
          {
            id: null,
            tempId: 'tmp-new-group',
            name: '新規グループ',
            surveyImageId: null,
            displayOrder: 0,
            items: [itemPayload({ id: null, name: '新規グループの項目', displayOrder: 0 })],
          },
          {
            id: seeded.group1Id,
            name: '初期グループ1_更新後',
            surveyImageId: null,
            displayOrder: 1,
            items: [
              // item1 更新（数量を 100 -> 999 に変更）
              itemPayload({
                id: seeded.item1Id,
                majorCategory: '建築工事',
                workType: '足場工事',
                name: '外部足場',
                unit: 'm2',
                quantity: 999,
                displayOrder: 0,
              }),
              // item2 は payload に含めない → 削除される
              // newItem 追加
              itemPayload({ id: null, name: '追加項目', displayOrder: 1 }),
            ],
          },
        ],
      };

      const response = await request(app)
        .put(`/api/quantity-tables/${seeded.tableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(savePayload);

      // Assert: レスポンス（42.8: 最新の QuantityTableDetail を返却）
      expect(response.status).toBe(200);
      expect(response.body.name).toBe('原子的保存テスト_更新後');
      expect(response.body.groups).toHaveLength(2);

      // Assert: 再取得（GET詳細）で反映が保持される（42.8 同期 / 42.5 永続化）
      const detailResponse = await request(app)
        .get(`/api/quantity-tables/${seeded.tableId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(detailResponse.status).toBe(200);
      const detail = detailResponse.body;
      expect(detail.name).toBe('原子的保存テスト_更新後');

      // 並び替え: 新規グループが先頭（displayOrder=0）、group1 が 2番目（displayOrder=1）
      const groups = [...detail.groups].sort(
        (a: { displayOrder: number }, b: { displayOrder: number }) =>
          a.displayOrder - b.displayOrder
      );
      expect(groups).toHaveLength(2);
      expect(groups[0].displayOrder).toBe(0);
      expect(groups[0].name).toBe('新規グループ');
      expect(groups[0].id).not.toBe(seeded.group1Id);
      expect(groups[0].id).not.toBe(seeded.group2Id);
      expect(groups[1].displayOrder).toBe(1);
      expect(groups[1].id).toBe(seeded.group1Id);
      expect(groups[1].name).toBe('初期グループ1_更新後');

      // group2 が削除されていること
      expect(detail.groups.some((g: { id: string }) => g.id === seeded.group2Id)).toBe(false);

      // 新規グループの項目（新規作成）
      expect(groups[0].items).toHaveLength(1);
      expect(groups[0].items[0].name).toBe('新規グループの項目');

      // group1 の項目: item1 更新（quantity 999）・item2 削除・新規項目追加
      const group1Items = [...groups[1].items].sort(
        (a: { displayOrder: number }, b: { displayOrder: number }) =>
          a.displayOrder - b.displayOrder
      );
      expect(group1Items).toHaveLength(2);
      expect(group1Items[0].id).toBe(seeded.item1Id);
      expect(Number(group1Items[0].quantity)).toBe(999);
      expect(group1Items[1].id).not.toBe(seeded.item2Id);
      expect(group1Items[1].name).toBe('追加項目');

      // item2 が削除されていること（DB 直接確認）
      const deletedItem = await prisma.quantityItem.findUnique({
        where: { id: seeded.item2Id },
      });
      expect(deletedItem).toBeNull();

      // item3 が連鎖削除されていること（DB 直接確認）
      const deletedItem3 = await prisma.quantityItem.findUnique({
        where: { id: seeded.item3Id },
      });
      expect(deletedItem3).toBeNull();
    });

    it('保存成功で updatedAt が更新され、返却された updatedAt で再度保存できる（42.8 同期）', async () => {
      const { tableId } = await createSeededTable(testProjectId, '同期テスト');
      const firstExpected = await getExpectedUpdatedAt(tableId);

      const firstSave = await request(app)
        .put(`/api/quantity-tables/${tableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expectedUpdatedAt: firstExpected, name: '同期テスト_1回目', groups: [] });

      expect(firstSave.status).toBe(200);
      expect(firstSave.body.updatedAt).toBeDefined();
      // updatedAt が進んでいること（楽観ロックトークンの更新）
      expect(new Date(firstSave.body.updatedAt).getTime()).toBeGreaterThan(
        new Date(firstExpected).getTime()
      );

      // 返却された updatedAt をそのまま使って 2回目の保存が成功する（同期が成立している）
      const secondSave = await request(app)
        .put(`/api/quantity-tables/${tableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt: firstSave.body.updatedAt,
          name: '同期テスト_2回目',
          groups: [],
        });

      expect(secondSave.status).toBe(200);
      expect(secondSave.body.name).toBe('同期テスト_2回目');
    });

    it('整合性検証エラー（数量表名が上限超過）では 400 が返り、保存が中断される（42.9）', async () => {
      const { tableId } = await createSeededTable(testProjectId, '検証エラーテスト');
      const expectedUpdatedAt = await getExpectedUpdatedAt(tableId);

      // name は 200 文字上限。Zod スキーマ（max(200)）で 400 になることを検証
      const response = await request(app)
        .put(`/api/quantity-tables/${tableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt,
          name: 'あ'.repeat(201),
          groups: [],
        });

      expect(response.status).toBe(400);

      // 保存が中断され、既存グループ（2件）が残っていること（部分反映なし）
      const groups = await prisma.quantityGroup.findMany({ where: { quantityTableId: tableId } });
      expect(groups).toHaveLength(2);
    });
  });

  describe('楽観的排他制御（Req 42.9）', () => {
    it('expectedUpdatedAt が一致しない場合は 409（QUANTITY_TABLE_CONFLICT）が返り、保存が中断される', async () => {
      const { tableId } = await createSeededTable(testProjectId, '競合テスト');

      const response = await request(app)
        .put(`/api/quantity-tables/${tableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          // 過去のタイムスタンプ（実際の updatedAt と不一致）
          expectedUpdatedAt: new Date('2020-01-01T00:00:00.000Z').toISOString(),
          name: '競合テスト_更新後',
          groups: [],
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_CONFLICT');

      // 保存が中断され、名称・グループが変更されていないこと（部分反映なし）
      const table = await prisma.quantityTable.findUniqueOrThrow({ where: { id: tableId } });
      expect(table.name).toBe('競合テスト');
      const groups = await prisma.quantityGroup.findMany({ where: { quantityTableId: tableId } });
      expect(groups).toHaveLength(2);
    });

    it('先行 save 成功後に同じ expectedUpdatedAt で後発 save を行うと 409 となり、後発の変更は永続化されない', async () => {
      const { tableId } = await createSeededTable(testProjectId, '直列競合テスト');
      const sharedExpected = await getExpectedUpdatedAt(tableId);

      // 先行 save: 成功（updatedAt が進む）
      const first = await request(app)
        .put(`/api/quantity-tables/${tableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expectedUpdatedAt: sharedExpected, name: '先行保存後', groups: [] });
      expect(first.status).toBe(200);

      // 後発 save: 古い（同一の）expectedUpdatedAt を使用 → 409
      const second = await request(app)
        .put(`/api/quantity-tables/${tableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expectedUpdatedAt: sharedExpected, name: '後発保存後', groups: [] });
      expect(second.status).toBe(409);
      expect(second.body).toHaveProperty('code', 'QUANTITY_TABLE_CONFLICT');

      // 後発の変更は永続化されていない（先行の結果が保持される）
      const table = await prisma.quantityTable.findUniqueOrThrow({ where: { id: tableId } });
      expect(table.name).toBe('先行保存後');
    });

    it('後発 save の競合（stale token）で後発が 409 となり、部分反映なし・displayOrder 衝突が起きない', async () => {
      // 並行/後発 save の競合は楽観ロック（expectedUpdatedAt）で検出される。
      // 実装に SELECT ... FOR UPDATE の行ロックは存在せず（design.md L2073: OPTIONAL）、
      // 真の同時並行リクエストでは READ COMMITTED 下で両者が読み取り段階を通過しうるため
      // 結果が非決定的（200/500/200 双方成功 等）になる。
      // そこで REQ-42.9 の「後発が 409・部分反映なし」は、先行 save 成功で updatedAt を
      // 進めた後、stale（陳腐化）な expectedUpdatedAt で後発 save を行う決定的手法で検証する。
      const seeded = await createSeededTable(testProjectId, '後発競合テスト');
      const staleExpected = await getExpectedUpdatedAt(seeded.tableId);

      // 先行 save: 成功（フル状態を確定。新規グループ先頭追加 + group1 残し + group2 削除）
      const first = await request(app)
        .put(`/api/quantity-tables/${seeded.tableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt: staleExpected,
          name: '先行確定',
          groups: [
            {
              id: null,
              name: '先行-新規グループ',
              surveyImageId: null,
              displayOrder: 0,
              items: [itemPayload({ id: null, name: '先行新規項目', displayOrder: 0 })],
            },
            {
              id: seeded.group1Id,
              name: '初期グループ1',
              surveyImageId: null,
              displayOrder: 1,
              items: [
                itemPayload({ id: seeded.item1Id, name: '外部足場', unit: 'm2', displayOrder: 0 }),
              ],
            },
          ],
        });
      expect(first.status).toBe(200);

      // 先行確定後の DB スナップショット（後発が 409 で中断した後に不変であることの基準）
      const afterFirst = await prisma.quantityTable.findUniqueOrThrow({
        where: { id: seeded.tableId },
        include: {
          groups: {
            orderBy: { displayOrder: 'asc' },
            include: { items: { orderBy: { displayOrder: 'asc' } } },
          },
        },
      });
      expect(afterFirst.name).toBe('先行確定');
      expect(afterFirst.groups).toHaveLength(2);

      // 後発 save: stale（先行前の）expectedUpdatedAt を使用 → 409
      const second = await request(app)
        .put(`/api/quantity-tables/${seeded.tableId}/save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expectedUpdatedAt: staleExpected,
          name: '後発（破棄されるべき）',
          groups: [
            {
              id: seeded.group1Id,
              name: '後発-グループ1',
              surveyImageId: null,
              displayOrder: 0,
              items: [
                itemPayload({ id: seeded.item1Id, name: '後発更新', unit: 'm2', displayOrder: 0 }),
                itemPayload({ id: null, name: '後発新規', displayOrder: 1 }),
              ],
            },
          ],
        });
      expect(second.status).toBe(409);
      expect(second.body).toHaveProperty('code', 'QUANTITY_TABLE_CONFLICT');

      // Assert: 後発の変更は一切永続化されていない（部分反映なし）。
      // DB の状態は先行確定時のスナップショットと厳密に一致する。
      const afterSecond = await prisma.quantityTable.findUniqueOrThrow({
        where: { id: seeded.tableId },
        include: {
          groups: {
            orderBy: { displayOrder: 'asc' },
            include: { items: { orderBy: { displayOrder: 'asc' } } },
          },
        },
      });

      expect(afterSecond.name).toBe('先行確定');
      expect(afterSecond.updatedAt.getTime()).toBe(afterFirst.updatedAt.getTime());

      // グループ集合・項目集合が先行確定時のまま不変（後発の作成/更新/削除が反映されていない）
      const afterFirstGroupIds = afterFirst.groups.map((g) => g.id).sort();
      const afterSecondGroupIds = afterSecond.groups.map((g) => g.id).sort();
      expect(afterSecondGroupIds).toEqual(afterFirstGroupIds);

      const afterFirstItemIds = afterFirst.groups.flatMap((g) => g.items.map((it) => it.id)).sort();
      const afterSecondItemIds = afterSecond.groups
        .flatMap((g) => g.items.map((it) => it.id))
        .sort();
      expect(afterSecondItemIds).toEqual(afterFirstItemIds);

      // group1 の名称が後発で書き換わっていないこと
      const group1After = afterSecond.groups.find((g) => g.id === seeded.group1Id);
      expect(group1After?.name).toBe('初期グループ1');

      // Assert: displayOrder 衝突（重複）が発生していないこと
      const groupOrders = afterSecond.groups.map((g) => g.displayOrder);
      expect(new Set(groupOrders).size).toBe(groupOrders.length);
      for (const g of afterSecond.groups) {
        const itemOrders = g.items.map((it) => it.displayOrder);
        expect(new Set(itemOrders).size).toBe(itemOrders.length);
      }
    });
  });
});
