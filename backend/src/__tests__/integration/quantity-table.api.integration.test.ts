/**
 * @fileoverview 数量表API統合テスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * 数量表、数量グループ、数量項目のAPI統合テストを実装します。
 *
 * Task 9.3: APIエンドポイントの統合テストを実装する
 *
 * Requirements:
 * - 2.1: 数量表一覧画面で新規作成操作を行う
 * - 4.1: 数量表編集画面で数量グループ追加操作を行う
 * - 5.1: 数量グループ内で行追加操作を行う
 * - 7.1: オートコンプリート候補の取得
 *
 * @module __tests__/integration/quantity-table.api.integration.test
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
 * 数量表API統合テスト
 */
describe('Quantity Table API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;
  let testQuantityTableId: string;
  let testQuantityGroupId: string;

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

    // テストユーザーを作成
    const user = await prisma.user.create({
      data: {
        email: 'test-quantity-table-integration@example.com',
        displayName: 'Quantity Table Test User',
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

    // 数量表関連の権限を作成（seedPermissionsに含まれていないため）
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

    // 必要な権限を割り当て（プロジェクト、数量表関連）
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

    // ログインしてトークンを取得
    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'test-quantity-table-integration@example.com',
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
        name: 'テスト用プロジェクト_数量表統合テスト',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    return project.id;
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    if (testProjectId) {
      await prisma.project.deleteMany({
        where: { id: testProjectId },
      });
    }

    await prisma.user.deleteMany({
      where: { email: 'test-quantity-table-integration@example.com' },
    });

    await prisma.$disconnect();
    redis.disconnect();
  });

  describe('数量表API', () => {
    beforeAll(async () => {
      const auth = await loginTestUser();
      accessToken = auth.token;
      testUserId = auth.userId;
      testProjectId = await createTestProject();
    });

    beforeEach(async () => {
      // 各テスト前にクリーンアップ（数量表APIのテストのみ）
      if (testProjectId) {
        await prisma.quantityTable.deleteMany({
          where: { projectId: testProjectId },
        });
      }
    });

    describe('POST /api/projects/:projectId/quantity-tables', () => {
      it('数量表を作成できる (Req 2.1, 2.2)', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/quantity-tables`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'テスト数量表' });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          name: 'テスト数量表',
          projectId: testProjectId,
          groupCount: 0,
          itemCount: 0,
        });
        expect(response.body.id).toBeDefined();

        testQuantityTableId = response.body.id;
      });

      it('プロジェクトが存在しない場合は404を返す', async () => {
        const response = await request(app)
          .post('/api/projects/12345678-1234-4234-a234-123456789012/quantity-tables')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'テスト数量表' });

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('code', 'PROJECT_NOT_FOUND');
      });

      it('認証なしでは401を返す', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/quantity-tables`)
          .send({ name: 'テスト数量表' });

        expect(response.status).toBe(401);
      });

      it('名前が空の場合は400を返す', async () => {
        const response = await request(app)
          .post(`/api/projects/${testProjectId}/quantity-tables`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: '' });

        expect(response.status).toBe(400);
      });
    });

    describe('GET /api/projects/:projectId/quantity-tables', () => {
      it('数量表一覧を取得できる (Req 2.3)', async () => {
        // テストデータを作成
        await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: 'テスト数量表1',
          },
        });
        await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: 'テスト数量表2',
          },
        });

        const response = await request(app)
          .get(`/api/projects/${testProjectId}/quantity-tables`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBeGreaterThanOrEqual(2);
        expect(response.body.pagination).toBeDefined();
      });

      it('検索フィルターが動作する', async () => {
        // テストデータを作成
        await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: 'ユニークな検索キーワード',
          },
        });

        const response = await request(app)
          .get(`/api/projects/${testProjectId}/quantity-tables`)
          .query({ search: 'ユニークな検索' })
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.length).toBe(1);
        expect(response.body.data[0].name).toBe('ユニークな検索キーワード');
      });
    });

    describe('GET /api/quantity-tables/:id', () => {
      it('数量表詳細を取得できる', async () => {
        const quantityTable = await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: '詳細取得テスト',
          },
        });

        const response = await request(app)
          .get(`/api/quantity-tables/${quantityTable.id}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          id: quantityTable.id,
          name: '詳細取得テスト',
          projectId: testProjectId,
        });
        expect(response.body.project).toBeDefined();
        expect(response.body.groups).toBeInstanceOf(Array);
      });

      it('存在しない数量表の場合は404を返す', async () => {
        const response = await request(app)
          .get('/api/quantity-tables/12345678-1234-4234-a234-123456789012')
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_NOT_FOUND');
      });
    });

    describe('PUT /api/quantity-tables/:id', () => {
      it('数量表名を更新できる (Req 2.5)', async () => {
        const quantityTable = await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: '更新前の名前',
          },
        });

        const response = await request(app)
          .put(`/api/quantity-tables/${quantityTable.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: '更新後の名前',
            expectedUpdatedAt: quantityTable.updatedAt.toISOString(),
          });

        expect(response.status).toBe(200);
        expect(response.body.name).toBe('更新後の名前');
      });

      it('楽観的排他制御でタイムスタンプが一致しない場合は409を返す', async () => {
        const quantityTable = await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: '競合テスト',
          },
        });

        const response = await request(app)
          .put(`/api/quantity-tables/${quantityTable.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: '競合更新',
            expectedUpdatedAt: new Date('2020-01-01').toISOString(), // 過去のタイムスタンプ
          });

        expect(response.status).toBe(409);
        expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_CONFLICT');
      });
    });

    describe('DELETE /api/quantity-tables/:id', () => {
      it('数量表を削除できる (Req 2.4)', async () => {
        const quantityTable = await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: '削除テスト',
          },
        });

        const response = await request(app)
          .delete(`/api/quantity-tables/${quantityTable.id}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(204);

        // 論理削除されたことを確認
        const deleted = await prisma.quantityTable.findUnique({
          where: { id: quantityTable.id },
        });
        expect(deleted?.deletedAt).not.toBeNull();
      });

      it('存在しない数量表の削除は404を返す', async () => {
        const response = await request(app)
          .delete('/api/quantity-tables/12345678-1234-4234-a234-123456789012')
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(404);
      });
    });
  });

  /**
   * Task 22.3: 数量表コピーAPIの統合テスト
   *
   * Requirements:
   * - 17.2: コピーダイアログで数量表名を入力して作成を確定し、全データを複製する
   * - 17.4: コピーされた数量表は元の数量表とは独立したデータとして管理する
   * - 17.7: コピー先でも同じ写真の紐づけを維持する
   */
  describe('数量表コピーAPI', () => {
    describe('POST /api/quantity-tables/:id/copy', () => {
      it('全データが正しく複製されること（グループ数、項目数、各フィールド値の一致、写真紐づけの維持）（Requirements: 17.2, 17.7）', async () => {
        // テスト用の数量表をグループ・項目付きで作成
        const sourceTable = await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: 'コピー元数量表',
          },
        });

        // グループ1: surveyImageId付き
        const group1 = await prisma.quantityGroup.create({
          data: {
            quantityTableId: sourceTable.id,
            name: 'コピーテストグループ1',
            surveyImageId: null, // 統合テストでは実際の画像は不要
            displayOrder: 0,
          },
        });

        // グループ2: surveyImageIdなし
        const group2 = await prisma.quantityGroup.create({
          data: {
            quantityTableId: sourceTable.id,
            name: 'コピーテストグループ2',
            displayOrder: 1,
          },
        });

        // グループ1に2つの項目を作成
        await prisma.quantityItem.create({
          data: {
            quantityGroupId: group1.id,
            majorCategory: '建築工事',
            middleCategory: '仮設工事',
            minorCategory: '足場',
            customCategory: 'カスタム分類A',
            workType: '足場工事',
            name: '外部足場',
            specification: '規格A',
            unit: 'm2',
            calculationMethod: 'STANDARD',
            adjustmentFactor: 1.0,
            roundingUnit: 0.01,
            quantity: 150.5,
            remarks: '備考テスト',
            displayOrder: 0,
          },
        });

        await prisma.quantityItem.create({
          data: {
            quantityGroupId: group1.id,
            majorCategory: '建築工事',
            workType: '型枠工事',
            name: '型枠',
            unit: 'm2',
            calculationMethod: 'AREA_VOLUME',
            calculationParams: { width: 5.0, depth: 3.0, height: 2.5 },
            adjustmentFactor: 1.1,
            roundingUnit: 0.25,
            quantity: 41.25,
            displayOrder: 1,
          },
        });

        // グループ2に1つの項目を作成
        await prisma.quantityItem.create({
          data: {
            quantityGroupId: group2.id,
            majorCategory: '土木工事',
            workType: '鉄筋工事',
            name: '鉄筋',
            unit: '本',
            calculationMethod: 'PITCH',
            calculationParams: {
              rangeLength: 10,
              endLength1: 0.5,
              endLength2: 0.5,
              pitchLength: 1.0,
            },
            adjustmentFactor: 1.0,
            roundingUnit: 1.0,
            quantity: 10,
            remarks: 'ピッチ計算テスト',
            displayOrder: 0,
          },
        });

        // コピーAPIを実行
        const copyResponse = await request(app)
          .post(`/api/quantity-tables/${sourceTable.id}/copy`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'コピー元数量表のコピー' });

        expect(copyResponse.status).toBe(201);
        expect(copyResponse.body.name).toBe('コピー元数量表のコピー');
        expect(copyResponse.body.projectId).toBe(testProjectId);
        expect(copyResponse.body.groupCount).toBe(2);
        expect(copyResponse.body.itemCount).toBe(3);

        // コピーされた数量表の詳細を取得して検証
        const copiedDetailResponse = await request(app)
          .get(`/api/quantity-tables/${copyResponse.body.id}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(copiedDetailResponse.status).toBe(200);
        const copiedDetail = copiedDetailResponse.body;

        // グループ数の一致
        expect(copiedDetail.groups).toHaveLength(2);

        // グループ名と表示順序の一致
        const copiedGroup1 = copiedDetail.groups.find(
          (g: { displayOrder: number }) => g.displayOrder === 0
        );
        const copiedGroup2 = copiedDetail.groups.find(
          (g: { displayOrder: number }) => g.displayOrder === 1
        );
        expect(copiedGroup1.name).toBe('コピーテストグループ1');
        expect(copiedGroup2.name).toBe('コピーテストグループ2');

        // グループ1の項目数と各フィールド値の一致
        expect(copiedGroup1.items).toHaveLength(2);
        const item1 = copiedGroup1.items.find(
          (i: { displayOrder: number }) => i.displayOrder === 0
        );
        expect(item1.majorCategory).toBe('建築工事');
        expect(item1.middleCategory).toBe('仮設工事');
        expect(item1.minorCategory).toBe('足場');
        expect(item1.customCategory).toBe('カスタム分類A');
        expect(item1.workType).toBe('足場工事');
        expect(item1.name).toBe('外部足場');
        expect(item1.specification).toBe('規格A');
        expect(item1.unit).toBe('m2');
        expect(item1.calculationMethod).toBe('STANDARD');
        expect(item1.remarks).toBe('備考テスト');

        // 項目2: AREA_VOLUMEの計算パラメータも維持
        const item2 = copiedGroup1.items.find(
          (i: { displayOrder: number }) => i.displayOrder === 1
        );
        expect(item2.calculationMethod).toBe('AREA_VOLUME');
        expect(item2.workType).toBe('型枠工事');

        // グループ2の項目数
        expect(copiedGroup2.items).toHaveLength(1);
        const item3 = copiedGroup2.items[0];
        expect(item3.calculationMethod).toBe('PITCH');
        expect(item3.remarks).toBe('ピッチ計算テスト');

        // クリーンアップ（コピーされた数量表を削除）
        await prisma.quantityTable.delete({
          where: { id: copyResponse.body.id },
        });
        await prisma.quantityTable.delete({
          where: { id: sourceTable.id },
        });
      });

      it('コピー先とコピー元が独立していること（一方の編集が他方に影響しない）（Requirements: 17.4）', async () => {
        // コピー元の数量表を作成
        const sourceTable = await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: '独立性テスト元',
          },
        });

        const sourceGroup = await prisma.quantityGroup.create({
          data: {
            quantityTableId: sourceTable.id,
            name: '独立性テストグループ',
            displayOrder: 0,
          },
        });

        await prisma.quantityItem.create({
          data: {
            quantityGroupId: sourceGroup.id,
            majorCategory: '独立性テスト大項目',
            workType: '独立性テスト工種',
            name: '独立性テスト名称',
            unit: 'm',
            calculationMethod: 'STANDARD',
            adjustmentFactor: 1.0,
            roundingUnit: 0.01,
            quantity: 100,
            displayOrder: 0,
          },
        });

        // コピーを実行
        const copyResponse = await request(app)
          .post(`/api/quantity-tables/${sourceTable.id}/copy`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: '独立性テストコピー' });

        expect(copyResponse.status).toBe(201);
        const copiedTableId = copyResponse.body.id;

        // コピー元の名前を変更
        await request(app)
          .put(`/api/quantity-tables/${sourceTable.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: '独立性テスト元_変更後',
            expectedUpdatedAt: sourceTable.updatedAt.toISOString(),
          });

        // コピー先が影響を受けていないことを確認
        const copiedResponse = await request(app)
          .get(`/api/quantity-tables/${copiedTableId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(copiedResponse.status).toBe(200);
        expect(copiedResponse.body.name).toBe('独立性テストコピー');

        // コピー元の確認
        const sourceResponse = await request(app)
          .get(`/api/quantity-tables/${sourceTable.id}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(sourceResponse.status).toBe(200);
        expect(sourceResponse.body.name).toBe('独立性テスト元_変更後');

        // コピー先を削除しても元には影響しない
        await request(app)
          .delete(`/api/quantity-tables/${copiedTableId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(204);

        const sourceAfterDelete = await request(app)
          .get(`/api/quantity-tables/${sourceTable.id}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(sourceAfterDelete.status).toBe(200);
        expect(sourceAfterDelete.body.name).toBe('独立性テスト元_変更後');

        // クリーンアップ
        await prisma.quantityTable.delete({
          where: { id: sourceTable.id },
        });
      });

      it('大量データのコピーパフォーマンス検証（Requirements: 17.2）', async () => {
        // 大量データの数量表を作成（5グループ、各グループ10項目 = 50項目）
        const sourceTable = await prisma.quantityTable.create({
          data: {
            projectId: testProjectId,
            name: 'パフォーマンステスト元',
          },
        });

        const groupIds: string[] = [];
        for (let g = 0; g < 5; g++) {
          const group = await prisma.quantityGroup.create({
            data: {
              quantityTableId: sourceTable.id,
              name: `パフォーマンステストグループ${g + 1}`,
              displayOrder: g,
            },
          });
          groupIds.push(group.id);
        }

        // 各グループに10項目ずつ作成
        for (const groupId of groupIds) {
          const items = Array.from({ length: 10 }, (_, i) => ({
            quantityGroupId: groupId,
            majorCategory: `大項目${i}`,
            middleCategory: `中項目${i}`,
            workType: `工種${i}`,
            name: `名称${i}`,
            unit: 'm2',
            calculationMethod: 'STANDARD' as const,
            adjustmentFactor: 1.0,
            roundingUnit: 0.01,
            quantity: i * 10 + 5,
            displayOrder: i,
          }));

          await prisma.quantityItem.createMany({ data: items });
        }

        // コピーのパフォーマンスを測定
        const startTime = Date.now();

        const copyResponse = await request(app)
          .post(`/api/quantity-tables/${sourceTable.id}/copy`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'パフォーマンステストコピー' });

        const endTime = Date.now();
        const duration = endTime - startTime;

        expect(copyResponse.status).toBe(201);
        expect(copyResponse.body.groupCount).toBe(5);
        expect(copyResponse.body.itemCount).toBe(50);

        // 5秒以内にコピーが完了することを検証
        expect(duration).toBeLessThan(5000);

        // クリーンアップ
        await prisma.quantityTable.delete({
          where: { id: copyResponse.body.id },
        });
        await prisma.quantityTable.delete({
          where: { id: sourceTable.id },
        });
      });

      it('コピー元が存在しない場合は404を返す', async () => {
        const response = await request(app)
          .post('/api/quantity-tables/12345678-1234-4234-a234-123456789012/copy')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'コピー名' });

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('code', 'QUANTITY_TABLE_NOT_FOUND');
      });

      it('認証なしでは401を返す', async () => {
        const response = await request(app)
          .post('/api/quantity-tables/12345678-1234-4234-a234-123456789012/copy')
          .send({ name: 'コピー名' });

        expect(response.status).toBe(401);
      });

      it('数量表名が空の場合は400を返す', async () => {
        const response = await request(app)
          .post('/api/quantity-tables/12345678-1234-4234-a234-123456789012/copy')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: '' });

        expect(response.status).toBe(400);
      });
    });
  });

  describe('数量グループAPI', () => {
    beforeAll(async () => {
      // 数量表を作成（前のテストでクリーンアップされている可能性があるため常に新規作成）
      const qt = await prisma.quantityTable.create({
        data: {
          projectId: testProjectId,
          name: 'グループテスト用数量表',
        },
      });
      testQuantityTableId = qt.id;
    });

    describe('POST /api/quantity-tables/:quantityTableId/groups', () => {
      it('数量グループを作成できる (Req 4.1)', async () => {
        const response = await request(app)
          .post(`/api/quantity-tables/${testQuantityTableId}/groups`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'テストグループ' });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          name: 'テストグループ',
          quantityTableId: testQuantityTableId,
        });
        expect(response.body.id).toBeDefined();

        testQuantityGroupId = response.body.id;
      });

      it('数量表が存在しない場合は404を返す', async () => {
        const response = await request(app)
          .post('/api/quantity-tables/12345678-1234-4234-a234-123456789012/groups')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'テストグループ' });

        expect(response.status).toBe(404);
      });
    });

    describe('GET /api/quantity-tables/:quantityTableId/groups', () => {
      it('数量グループ一覧を取得できる', async () => {
        const response = await request(app)
          .get(`/api/quantity-tables/${testQuantityTableId}/groups`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
      });
    });

    describe('DELETE /api/quantity-groups/:id', () => {
      it('数量グループを削除できる (Req 4.5)', async () => {
        // 削除用グループを作成
        const group = await prisma.quantityGroup.create({
          data: {
            quantityTableId: testQuantityTableId,
            name: '削除対象グループ',
            displayOrder: 99,
          },
        });

        const response = await request(app)
          .delete(`/api/quantity-groups/${group.id}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(204);

        // 削除されたことを確認
        const deleted = await prisma.quantityGroup.findUnique({
          where: { id: group.id },
        });
        expect(deleted).toBeNull();
      });
    });
  });

  describe('数量項目API', () => {
    beforeAll(async () => {
      // 数量グループを作成（確実に存在するようにする）
      const group = await prisma.quantityGroup.create({
        data: {
          quantityTableId: testQuantityTableId,
          name: '項目テスト用グループ',
          displayOrder: 0,
        },
      });
      testQuantityGroupId = group.id;
    });

    describe('POST /api/quantity-groups/:groupId/items', () => {
      it('数量項目を作成できる (Req 5.1, 5.2)', async () => {
        const response = await request(app)
          .post(`/api/quantity-groups/${testQuantityGroupId}/items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            majorCategory: '建築工事',
            workType: '足場工事',
            name: '外部足場',
            unit: 'm2',
            quantity: 100.5,
            calculationMethod: 'STANDARD',
            adjustmentFactor: 1.0,
            roundingUnit: 0.01,
          });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          majorCategory: '建築工事',
          workType: '足場工事',
          name: '外部足場',
          unit: 'm2',
          quantity: 100.5,
          quantityGroupId: testQuantityGroupId,
        });
        expect(response.body.id).toBeDefined();
      });

      it('必須フィールドが欠けている場合は400を返す (Req 5.3)', async () => {
        const response = await request(app)
          .post(`/api/quantity-groups/${testQuantityGroupId}/items`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            // majorCategory, workType, name, unit が欠けている
            quantity: 100,
          });

        expect(response.status).toBe(400);
      });
    });

    describe('GET /api/quantity-groups/:groupId/items', () => {
      it('数量項目一覧を取得できる', async () => {
        const response = await request(app)
          .get(`/api/quantity-groups/${testQuantityGroupId}/items`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
      });
    });

    describe('DELETE /api/quantity-items/:id', () => {
      it('数量項目を削除できる (Req 5.4)', async () => {
        // 削除用項目を作成
        const item = await prisma.quantityItem.create({
          data: {
            quantityGroupId: testQuantityGroupId,
            majorCategory: '削除テスト',
            workType: 'テスト工種',
            name: '削除対象項目',
            unit: 'm2',
            quantity: 100,
            calculationMethod: 'STANDARD',
            adjustmentFactor: 1.0,
            roundingUnit: 0.01,
            displayOrder: 99,
          },
        });

        const response = await request(app)
          .delete(`/api/quantity-items/${item.id}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(204);

        // 削除されたことを確認
        const deleted = await prisma.quantityItem.findUnique({
          where: { id: item.id },
        });
        expect(deleted).toBeNull();
      });
    });
  });

  describe('オートコンプリートAPI', () => {
    beforeAll(async () => {
      // テスト用の数量項目を作成（オートコンプリート候補用）
      await prisma.quantityItem.createMany({
        data: [
          {
            quantityGroupId: testQuantityGroupId,
            majorCategory: '建築工事',
            workType: '足場工事',
            name: 'オートコンプリートテスト1',
            unit: 'm2',
            quantity: 100,
            calculationMethod: 'STANDARD',
            adjustmentFactor: 1.0,
            roundingUnit: 0.01,
            displayOrder: 100,
          },
          {
            quantityGroupId: testQuantityGroupId,
            majorCategory: '建設工事',
            workType: '足場工事',
            name: 'オートコンプリートテスト2',
            unit: 'm3',
            quantity: 200,
            calculationMethod: 'STANDARD',
            adjustmentFactor: 1.0,
            roundingUnit: 0.01,
            displayOrder: 101,
          },
        ],
      });
    });

    describe('GET /api/projects/:projectId/quantity-items/autocomplete-candidates', () => {
      it('大項目の候補を一括取得できる (Req 7.1)', async () => {
        const response = await request(app)
          .get(`/api/projects/${testProjectId}/quantity-items/autocomplete-candidates`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body.candidates.majorCategory).toBeInstanceOf(Array);
        expect(
          response.body.candidates.majorCategory.some((item: string) => item.includes('建'))
        ).toBe(true);
      });

      it('単位の候補を一括取得できる', async () => {
        const response = await request(app)
          .get(`/api/projects/${testProjectId}/quantity-items/autocomplete-candidates`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body.candidates.unit).toBeInstanceOf(Array);
        expect(response.body.candidates.unit.length).toBeGreaterThan(0);
      });

      it('全フィールドの候補が返却される', async () => {
        const response = await request(app)
          .get(`/api/projects/${testProjectId}/quantity-items/autocomplete-candidates`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        const { candidates } = response.body;
        expect(candidates).toHaveProperty('majorCategory');
        expect(candidates).toHaveProperty('middleCategory');
        expect(candidates).toHaveProperty('minorCategory');
        expect(candidates).toHaveProperty('workType');
        expect(candidates).toHaveProperty('name');
        expect(candidates).toHaveProperty('unit');
      });
    });
  });
});
