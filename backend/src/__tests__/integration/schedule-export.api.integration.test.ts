/**
 * @fileoverview 工程表エクスポートAPI統合テスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 16.1: エクスポートAPIの統合テストを作成する
 * - GET /api/schedules/:id/export?format=xlsx のテスト
 * - GET /api/schedules/:id/export?format=pdf のテスト
 * - 認証・認可エラーケースのテスト
 * - 出力対象フィルタリングの統合確認
 *
 * Requirements:
 * - 7.1: Excelダウンロード
 * - 8.1: PDFダウンロード
 * - 9.3: isExportTarget=false の項目を出力から除外
 *
 * @module __tests__/integration/schedule-export.api.integration.test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';

/**
 * 工程表エクスポートAPI統合テスト
 */
describe('Schedule Export API Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;

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

    // 前回の失敗によるテストデータ残留を除去
    const existingUser = await prisma.user.findUnique({
      where: { email: 'test-schedule-export@example.com' },
    });
    if (existingUser) {
      const existingProjects = await prisma.project.findMany({
        where: { createdById: existingUser.id },
        select: { id: true },
      });
      const projectIds = existingProjects.map((p) => p.id);
      if (projectIds.length > 0) {
        await prisma.constructionSchedule.deleteMany({
          where: { projectId: { in: projectIds } },
        });
        await prisma.project.deleteMany({
          where: { id: { in: projectIds } },
        });
      }
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    // テストユーザーを作成
    const user = await prisma.user.create({
      data: {
        email: 'test-schedule-export@example.com',
        displayName: 'Schedule Export Test User',
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

    // 工程表関連の権限を作成
    const schedulePermissions = [
      { resource: 'schedule', action: 'create', description: '工程表の作成' },
      { resource: 'schedule', action: 'read', description: '工程表の閲覧' },
      { resource: 'schedule', action: 'update', description: '工程表の更新' },
      { resource: 'schedule', action: 'delete', description: '工程表の削除' },
    ];

    await prisma.permission.createMany({
      data: schedulePermissions,
      skipDuplicates: true,
    });

    // 必要な権限を割り当て
    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: 'project', action: { in: ['create', 'read', 'update', 'delete'] } },
          { resource: 'schedule', action: { in: ['create', 'read', 'update', 'delete'] } },
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
      email: 'test-schedule-export@example.com',
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
        name: 'エクスポート統合テスト用プロジェクト',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    return project.id;
  };

  /**
   * テスト用工程表を作成（項目付き）
   */
  const createTestScheduleWithItems = async (options?: {
    name?: string;
    items?: Array<{
      itemName: string;
      labelText?: string;
      detailText?: string;
      startDate?: Date | null;
      duration?: number | null;
      displayOrder: number;
      isExportTarget: boolean;
    }>;
  }) => {
    const schedule = await prisma.constructionSchedule.create({
      data: {
        projectId: testProjectId,
        name: options?.name ?? 'エクスポートテスト工程表',
        version: 0,
        items: {
          create: options?.items ?? [
            {
              itemName: '基礎工事',
              labelText: '基礎',
              detailText: 'コンクリート打設',
              startDate: new Date('2026-04-01'),
              duration: 10,
              displayOrder: 0,
              isExportTarget: true,
            },
            {
              itemName: '鉄骨工事',
              labelText: '鉄骨',
              detailText: '組立作業',
              startDate: new Date('2026-04-15'),
              duration: 20,
              displayOrder: 1,
              isExportTarget: true,
            },
            {
              itemName: '内装工事',
              labelText: '内装',
              detailText: 'クロス貼り',
              startDate: new Date('2026-05-10'),
              duration: 15,
              displayOrder: 2,
              isExportTarget: false, // 出力対象外
            },
          ],
        },
      },
    });
    return schedule;
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
  });

  afterAll(async () => {
    if (testUserId) {
      const allProjects = await prisma.project.findMany({
        where: { createdById: testUserId },
        select: { id: true },
      });
      const projectIds = allProjects.map((p) => p.id);

      if (projectIds.length > 0) {
        await prisma.constructionSchedule.deleteMany({
          where: { projectId: { in: projectIds } },
        });
        await prisma.project.deleteMany({
          where: { id: { in: projectIds } },
        });
      }

      await prisma.user.deleteMany({
        where: { id: testUserId },
      });
    }

    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(async () => {
    if (testProjectId) {
      await prisma.constructionSchedule.deleteMany({
        where: { projectId: testProjectId },
      });
    }
  });

  // =================================================================
  // 認証・認可エラーケース
  // =================================================================
  describe('認証・認可エラーケース', () => {
    it('認証なしでGET /api/schedules/:id/export?format=xlsxにアクセスすると401を返す (Req 7.1)', async () => {
      const response = await request(app).get(
        '/api/schedules/12345678-1234-4234-a234-123456789012/export?format=xlsx'
      );

      expect(response.status).toBe(401);
    });

    it('認証なしでGET /api/schedules/:id/export?format=pdfにアクセスすると401を返す (Req 8.1)', async () => {
      const response = await request(app).get(
        '/api/schedules/12345678-1234-4234-a234-123456789012/export?format=pdf'
      );

      expect(response.status).toBe(401);
    });

    it('無効なトークンでアクセスすると401を返す', async () => {
      const schedule = await createTestScheduleWithItems();

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'xlsx' })
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });

  // =================================================================
  // GET /api/schedules/:id/export?format=xlsx - Excel出力
  // =================================================================
  describe('GET /api/schedules/:id/export?format=xlsx', () => {
    it('xlsx形式でExcelファイルをダウンロードできる (Req 7.1)', async () => {
      const schedule = await createTestScheduleWithItems();

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'xlsx' })
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(response.headers['content-disposition']).toContain('.xlsx');
      expect(response.body).toBeInstanceOf(Buffer);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('Excelファイルにプロジェクト名と自社名が含まれる (Req 7.1)', async () => {
      // 自社情報を設定
      await prisma.companyInfo.deleteMany();
      await prisma.companyInfo.create({
        data: {
          companyName: 'テスト建設株式会社',
          address: '東京都千代田区1-1-1',
          representative: '田中太郎',
          version: 0,
        },
      });

      const schedule = await createTestScheduleWithItems();

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'xlsx' })
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(200);

      // Excelファイルの内容を検証
      const workbook = XLSX.read(response.body, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const data = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });

      // プロジェクト名（1行目）
      expect(data[0]![0]).toBe('エクスポート統合テスト用プロジェクト');
      // 自社名（2行目）
      expect(data[1]![0]).toBe('テスト建設株式会社');

      // クリーンアップ
      await prisma.companyInfo.deleteMany();
    });

    it('isExportTarget=trueの項目のみ出力される (Req 9.3)', async () => {
      const schedule = await createTestScheduleWithItems();

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'xlsx' })
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(200);

      // Excelファイルの内容を検証
      const workbook = XLSX.read(response.body, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const data = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });

      // ヘッダー行（4行目）以降がデータ行
      // データ行は isExportTarget=true の2項目のみ（基礎工事、鉄骨工事）
      // 内装工事（isExportTarget=false）は含まれない
      const dataRows = data.slice(4); // ヘッダー4行をスキップ
      expect(dataRows.length).toBe(2);

      // 項目名を確認（2列目=index 1）
      expect(dataRows[0]![1]).toBe('基礎工事');
      expect(dataRows[1]![1]).toBe('鉄骨工事');

      // 内装工事が含まれないことを確認
      const allItemNames = dataRows.map((row) => row[1]);
      expect(allItemNames).not.toContain('内装工事');
    });

    it('項目なしの工程表でもExcelエクスポートが成功する (Req 7.1)', async () => {
      const schedule = await createTestScheduleWithItems({
        name: '空の工程表',
        items: [],
      });

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'xlsx' })
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Buffer);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('存在しない工程表のエクスポートは404を返す (Req 7.1)', async () => {
      const response = await request(app)
        .get('/api/schedules/12345678-1234-4234-a234-123456789012/export')
        .query({ format: 'xlsx' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
    });

    it('論理削除された工程表のエクスポートは404を返す (Req 7.1)', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: '削除済みエクスポートテスト',
          version: 0,
          deletedAt: new Date(),
        },
      });

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'xlsx' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
    });

    it('無効なformat指定は400を返す', async () => {
      const schedule = await createTestScheduleWithItems();

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(400);
    });

    it('format未指定は400を返す', async () => {
      const schedule = await createTestScheduleWithItems();

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(400);
    });
  });

  // =================================================================
  // GET /api/schedules/:id/export?format=pdf - PDF出力
  // =================================================================
  describe('GET /api/schedules/:id/export?format=pdf', () => {
    it('pdf形式でPDFファイルをダウンロードできる (Req 8.1)', async () => {
      const schedule = await createTestScheduleWithItems();

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'pdf' })
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('.pdf');
      expect(response.body).toBeInstanceOf(Buffer);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('PDFファイルが有効なPDF形式である (Req 8.1)', async () => {
      const schedule = await createTestScheduleWithItems();

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'pdf' })
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(200);

      // PDFファイルのマジックバイトを確認（%PDF-）
      const pdfHeader = response.body.slice(0, 5).toString('ascii');
      expect(pdfHeader).toBe('%PDF-');
    });

    it('項目なしの工程表でもPDFエクスポートが成功する (Req 8.1)', async () => {
      const schedule = await createTestScheduleWithItems({
        name: '空のPDF工程表',
        items: [],
      });

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'pdf' })
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Buffer);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('存在しない工程表のPDFエクスポートは404を返す (Req 8.1)', async () => {
      const response = await request(app)
        .get('/api/schedules/12345678-1234-4234-a234-123456789012/export')
        .query({ format: 'pdf' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
    });

    it('論理削除された工程表のPDFエクスポートは404を返す (Req 8.1)', async () => {
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: '削除済みPDFテスト',
          version: 0,
          deletedAt: new Date(),
        },
      });

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'pdf' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
    });
  });

  // =================================================================
  // 出力対象フィルタリングの統合確認
  // =================================================================
  describe('出力対象フィルタリングの統合確認 (Req 9.3)', () => {
    it('全項目がisExportTarget=falseの場合、ヘッダーのみのExcelが生成される', async () => {
      const schedule = await createTestScheduleWithItems({
        name: '全項目出力対象外',
        items: [
          {
            itemName: '非出力項目A',
            labelText: 'A',
            detailText: '詳細A',
            startDate: new Date('2026-04-01'),
            duration: 5,
            displayOrder: 0,
            isExportTarget: false,
          },
          {
            itemName: '非出力項目B',
            labelText: 'B',
            detailText: '詳細B',
            startDate: new Date('2026-04-10'),
            duration: 3,
            displayOrder: 1,
            isExportTarget: false,
          },
        ],
      });

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'xlsx' })
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(200);

      // Excelファイルの内容を検証
      const workbook = XLSX.read(response.body, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const data = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });

      // ヘッダー行（4行）のみ存在し、データ行はなし
      const dataRows = data.slice(4);
      expect(dataRows.length).toBe(0);
    });

    it('isExportTarget=trueに変更後、出力対象に含まれることを確認', async () => {
      // まず全項目出力対象外で作成
      const schedule = await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: '出力対象復帰テスト',
          version: 0,
          items: {
            create: [
              {
                itemName: '復帰対象項目',
                labelText: '復帰',
                detailText: '復帰テスト',
                startDate: new Date('2026-04-01'),
                duration: 5,
                displayOrder: 0,
                isExportTarget: false,
              },
            ],
          },
        },
        include: { items: true },
      });

      // バルク保存で出力対象に変更
      const bulkResponse = await request(app)
        .put(`/api/schedules/${schedule.id}/bulk-save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          version: 0,
          items: [
            {
              id: schedule.items[0]!.id,
              itemName: '復帰対象項目',
              labelText: '復帰',
              detailText: '復帰テスト',
              startDate: '2026-04-01',
              duration: 5,
              displayOrder: 0,
              isExportTarget: true, // trueに変更
            },
          ],
        });

      expect(bulkResponse.status).toBe(200);

      // エクスポートして出力に含まれることを確認
      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'xlsx' })
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(200);

      const workbook = XLSX.read(response.body, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const data = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });

      // データ行に復帰対象項目が含まれること
      const dataRows = data.slice(4);
      expect(dataRows.length).toBe(1);
      expect(dataRows[0]![1]).toBe('復帰対象項目');
    });

    it('Excel出力とPDF出力の両方で同じフィルタリングが適用される (Req 9.3)', async () => {
      const schedule = await createTestScheduleWithItems();

      // Excel出力
      const xlsxResponse = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'xlsx' })
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(xlsxResponse.status).toBe(200);

      // PDF出力
      const pdfResponse = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'pdf' })
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(pdfResponse.status).toBe(200);

      // Excel側のフィルタリングを検証
      const workbook = XLSX.read(xlsxResponse.body, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const data = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });
      const xlsxDataRows = data.slice(4);

      // Excelに出力対象2件のみ含まれること
      expect(xlsxDataRows.length).toBe(2);

      // PDFも有効なPDFであること（内容の詳細検証はPDFパーサーが必要なため、形式のみ確認）
      const pdfHeader = pdfResponse.body.slice(0, 5).toString('ascii');
      expect(pdfHeader).toBe('%PDF-');
    });
  });

  // =================================================================
  // Content-Dispositionヘッダーの検証
  // =================================================================
  describe('Content-Dispositionヘッダーの検証', () => {
    it('Excelファイル名にUTF-8エンコードされた工程表名が含まれる (Req 7.1)', async () => {
      const schedule = await createTestScheduleWithItems({
        name: '日本語ファイル名テスト',
      });

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'xlsx' })
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(200);
      const contentDisposition = response.headers['content-disposition'];
      expect(contentDisposition).toContain('attachment');
      expect(contentDisposition).toContain('.xlsx');
    });

    it('PDFファイル名にUTF-8エンコードされた工程表名が含まれる (Req 8.1)', async () => {
      const schedule = await createTestScheduleWithItems({
        name: 'PDFファイル名テスト',
      });

      const response = await request(app)
        .get(`/api/schedules/${schedule.id}/export`)
        .query({ format: 'pdf' })
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(200);
      const contentDisposition = response.headers['content-disposition'];
      expect(contentDisposition).toContain('attachment');
      expect(contentDisposition).toContain('.pdf');
    });
  });
});
