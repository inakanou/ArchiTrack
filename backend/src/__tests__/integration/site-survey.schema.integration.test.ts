// vitest.global-setup.tsで.env.testが読み込まれるため、ここでは不要
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import getPrismaClient from '../../db.js';

/**
 * 現場調査スキーマ統合テスト
 * site-surveyマイグレーションが正しく適用されていることを検証
 * Requirements: 1.1
 */
describe('Site Survey Schema Integration Tests', () => {
  let prisma: PrismaClient;
  let testUserId: string;
  let testProjectId: string;

  beforeAll(async () => {
    prisma = getPrismaClient();

    // テスト用ユーザーの作成
    const testUser = await prisma.user.create({
      data: {
        email: 'test-site-survey-schema@example.com',
        displayName: 'Site Survey Schema Test User',
        passwordHash: 'test-hash',
      },
    });
    testUserId = testUser.id;

    // テスト用プロジェクトの作成
    const testProject = await prisma.project.create({
      data: {
        name: 'Site Survey Schema Test Project',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    testProjectId = testProject.id;
  });

  afterAll(async () => {
    // テストデータのクリーンアップ（カスケード削除が適用される）
    await prisma.project.deleteMany({
      where: {
        name: 'Site Survey Schema Test Project',
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: 'test-site-survey-schema@example.com',
      },
    });

    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // 各テスト前に現場調査データをクリーンアップ
    await prisma.siteSurvey.deleteMany({
      where: {
        projectId: testProjectId,
      },
    });
  });

  describe('SiteSurvey Table Existence', () => {
    it('site_surveysテーブルが存在すること', async () => {
      // テーブルの存在確認（簡単なクエリが成功することで確認）
      const surveys = await prisma.siteSurvey.findMany({
        take: 1,
      });

      expect(Array.isArray(surveys)).toBe(true);
    });

    it('現場調査レコードを作成できること', async () => {
      const survey = await prisma.siteSurvey.create({
        data: {
          projectId: testProjectId,
          name: 'テスト現場調査',
          surveyDate: new Date('2025-01-15'),
          memo: 'テスト用メモ',
        },
      });

      expect(survey).toHaveProperty('id');
      expect(survey.name).toBe('テスト現場調査');
      expect(survey.projectId).toBe(testProjectId);
      expect(survey.memo).toBe('テスト用メモ');
      expect(survey.createdAt).toBeInstanceOf(Date);
      expect(survey.updatedAt).toBeInstanceOf(Date);
      expect(survey.deletedAt).toBeNull();
    });

    it('論理削除（deletedAt）が設定できること', async () => {
      const survey = await prisma.siteSurvey.create({
        data: {
          projectId: testProjectId,
          name: '論理削除テスト',
          surveyDate: new Date('2025-01-15'),
        },
      });

      const deletedSurvey = await prisma.siteSurvey.update({
        where: { id: survey.id },
        data: { deletedAt: new Date() },
      });

      expect(deletedSurvey.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('SurveyImage Table Existence', () => {
    it('survey_imagesテーブルが存在すること', async () => {
      const images = await prisma.surveyImage.findMany({
        take: 1,
      });

      expect(Array.isArray(images)).toBe(true);
    });

    it('画像レコードを作成できること', async () => {
      // 現場調査を先に作成
      const survey = await prisma.siteSurvey.create({
        data: {
          projectId: testProjectId,
          name: '画像テスト用現場調査',
          surveyDate: new Date('2025-01-15'),
        },
      });

      const image = await prisma.surveyImage.create({
        data: {
          surveyId: survey.id,
          originalPath: 'surveys/2025/01/test-image.jpg',
          thumbnailPath: 'surveys/2025/01/test-image-thumb.jpg',
          fileName: 'test-image.jpg',
          fileSize: 102400,
          width: 1920,
          height: 1080,
          displayOrder: 1,
        },
      });

      expect(image).toHaveProperty('id');
      expect(image.surveyId).toBe(survey.id);
      expect(image.originalPath).toBe('surveys/2025/01/test-image.jpg');
      expect(image.thumbnailPath).toBe('surveys/2025/01/test-image-thumb.jpg');
      expect(image.fileName).toBe('test-image.jpg');
      expect(image.fileSize).toBe(102400);
      expect(image.width).toBe(1920);
      expect(image.height).toBe(1080);
      expect(image.displayOrder).toBe(1);
      expect(image.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('ImageAnnotation Table Existence', () => {
    it('image_annotationsテーブルが存在すること', async () => {
      const annotations = await prisma.imageAnnotation.findMany({
        take: 1,
      });

      expect(Array.isArray(annotations)).toBe(true);
    });

    it('注釈データを作成できること', async () => {
      // 現場調査と画像を先に作成
      const survey = await prisma.siteSurvey.create({
        data: {
          projectId: testProjectId,
          name: '注釈テスト用現場調査',
          surveyDate: new Date('2025-01-15'),
        },
      });

      const image = await prisma.surveyImage.create({
        data: {
          surveyId: survey.id,
          originalPath: 'surveys/2025/01/annotation-test.jpg',
          thumbnailPath: 'surveys/2025/01/annotation-test-thumb.jpg',
          fileName: 'annotation-test.jpg',
          fileSize: 51200,
          width: 800,
          height: 600,
          displayOrder: 1,
        },
      });

      const annotationData = {
        version: '1.0',
        objects: [
          {
            type: 'rect',
            left: 100,
            top: 100,
            width: 200,
            height: 150,
            stroke: '#ff0000',
            strokeWidth: 2,
          },
        ],
      };

      const annotation = await prisma.imageAnnotation.create({
        data: {
          imageId: image.id,
          data: annotationData,
          version: '1.0',
        },
      });

      expect(annotation).toHaveProperty('id');
      expect(annotation.imageId).toBe(image.id);
      expect(annotation.data).toEqual(annotationData);
      expect(annotation.version).toBe('1.0');
      expect(annotation.createdAt).toBeInstanceOf(Date);
      expect(annotation.updatedAt).toBeInstanceOf(Date);
    });

    it('画像と注釈は1対1のリレーションであること', async () => {
      const survey = await prisma.siteSurvey.create({
        data: {
          projectId: testProjectId,
          name: '1対1リレーションテスト',
          surveyDate: new Date('2025-01-15'),
        },
      });

      const image = await prisma.surveyImage.create({
        data: {
          surveyId: survey.id,
          originalPath: 'surveys/2025/01/one-to-one.jpg',
          thumbnailPath: 'surveys/2025/01/one-to-one-thumb.jpg',
          fileName: 'one-to-one.jpg',
          fileSize: 30000,
          width: 640,
          height: 480,
          displayOrder: 1,
        },
      });

      // 最初の注釈を作成
      await prisma.imageAnnotation.create({
        data: {
          imageId: image.id,
          data: { version: '1.0', objects: [] },
        },
      });

      // 同じ画像に対して2つ目の注釈を作成しようとするとエラーになること
      await expect(
        prisma.imageAnnotation.create({
          data: {
            imageId: image.id,
            data: { version: '1.0', objects: [] },
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Cascade Delete', () => {
    it('プロジェクト削除時に現場調査が連動削除されること', async () => {
      // テスト用プロジェクトを作成
      const project = await prisma.project.create({
        data: {
          name: 'カスケード削除テストプロジェクト',
          salesPersonId: testUserId,
          createdById: testUserId,
        },
      });

      // 現場調査を作成
      const survey = await prisma.siteSurvey.create({
        data: {
          projectId: project.id,
          name: 'カスケード削除テスト調査',
          surveyDate: new Date('2025-01-15'),
        },
      });

      // プロジェクトを削除
      await prisma.project.delete({
        where: { id: project.id },
      });

      // 現場調査も削除されていること
      const deletedSurvey = await prisma.siteSurvey.findUnique({
        where: { id: survey.id },
      });

      expect(deletedSurvey).toBeNull();
    });

    it('現場調査削除時に画像が連動削除されること', async () => {
      const survey = await prisma.siteSurvey.create({
        data: {
          projectId: testProjectId,
          name: '画像カスケード削除テスト',
          surveyDate: new Date('2025-01-15'),
        },
      });

      const image = await prisma.surveyImage.create({
        data: {
          surveyId: survey.id,
          originalPath: 'surveys/2025/01/cascade-test.jpg',
          thumbnailPath: 'surveys/2025/01/cascade-test-thumb.jpg',
          fileName: 'cascade-test.jpg',
          fileSize: 25000,
          width: 500,
          height: 400,
          displayOrder: 1,
        },
      });

      // 現場調査を削除
      await prisma.siteSurvey.delete({
        where: { id: survey.id },
      });

      // 画像も削除されていること
      const deletedImage = await prisma.surveyImage.findUnique({
        where: { id: image.id },
      });

      expect(deletedImage).toBeNull();
    });

    it('画像削除時に注釈が連動削除されること', async () => {
      const survey = await prisma.siteSurvey.create({
        data: {
          projectId: testProjectId,
          name: '注釈カスケード削除テスト',
          surveyDate: new Date('2025-01-15'),
        },
      });

      const image = await prisma.surveyImage.create({
        data: {
          surveyId: survey.id,
          originalPath: 'surveys/2025/01/annotation-cascade.jpg',
          thumbnailPath: 'surveys/2025/01/annotation-cascade-thumb.jpg',
          fileName: 'annotation-cascade.jpg',
          fileSize: 20000,
          width: 400,
          height: 300,
          displayOrder: 1,
        },
      });

      const annotation = await prisma.imageAnnotation.create({
        data: {
          imageId: image.id,
          data: { version: '1.0', objects: [] },
        },
      });

      // 画像を削除
      await prisma.surveyImage.delete({
        where: { id: image.id },
      });

      // 注釈も削除されていること
      const deletedAnnotation = await prisma.imageAnnotation.findUnique({
        where: { id: annotation.id },
      });

      expect(deletedAnnotation).toBeNull();
    });
  });

  describe('Indexes', () => {
    it('projectIdでの検索が可能であること', async () => {
      // 複数の現場調査を作成
      await prisma.siteSurvey.createMany({
        data: [
          {
            projectId: testProjectId,
            name: 'インデックステスト1',
            surveyDate: new Date('2025-01-15'),
          },
          {
            projectId: testProjectId,
            name: 'インデックステスト2',
            surveyDate: new Date('2025-01-16'),
          },
        ],
      });

      // projectIdで検索
      const surveys = await prisma.siteSurvey.findMany({
        where: {
          projectId: testProjectId,
        },
      });

      expect(surveys.length).toBeGreaterThanOrEqual(2);
    });

    it('surveyDateでの検索が可能であること', async () => {
      const targetDate = new Date('2025-06-15');

      await prisma.siteSurvey.create({
        data: {
          projectId: testProjectId,
          name: '日付検索テスト',
          surveyDate: targetDate,
        },
      });

      const surveys = await prisma.siteSurvey.findMany({
        where: {
          surveyDate: targetDate,
        },
      });

      expect(surveys.length).toBeGreaterThanOrEqual(1);
      expect(surveys.some((s) => s.name === '日付検索テスト')).toBe(true);
    });

    it('deletedAtでの論理削除フィルタリングが可能であること', async () => {
      // 削除済みと未削除の両方を作成
      const activesurvey = await prisma.siteSurvey.create({
        data: {
          projectId: testProjectId,
          name: 'アクティブ調査',
          surveyDate: new Date('2025-01-15'),
        },
      });

      await prisma.siteSurvey.create({
        data: {
          projectId: testProjectId,
          name: '削除済み調査',
          surveyDate: new Date('2025-01-15'),
          deletedAt: new Date(),
        },
      });

      // 削除されていないものだけを取得
      const activeSurveys = await prisma.siteSurvey.findMany({
        where: {
          projectId: testProjectId,
          deletedAt: null,
        },
      });

      const hasActive = activeSurveys.some((s) => s.id === activesurvey.id);
      expect(hasActive).toBe(true);
    });

    it('displayOrderでの画像ソートが可能であること', async () => {
      const survey = await prisma.siteSurvey.create({
        data: {
          projectId: testProjectId,
          name: '順序テスト',
          surveyDate: new Date('2025-01-15'),
        },
      });

      // 順序を入れ替えて作成
      await prisma.surveyImage.createMany({
        data: [
          {
            surveyId: survey.id,
            originalPath: 'test3.jpg',
            thumbnailPath: 'test3-thumb.jpg',
            fileName: 'test3.jpg',
            fileSize: 1000,
            width: 100,
            height: 100,
            displayOrder: 3,
          },
          {
            surveyId: survey.id,
            originalPath: 'test1.jpg',
            thumbnailPath: 'test1-thumb.jpg',
            fileName: 'test1.jpg',
            fileSize: 1000,
            width: 100,
            height: 100,
            displayOrder: 1,
          },
          {
            surveyId: survey.id,
            originalPath: 'test2.jpg',
            thumbnailPath: 'test2-thumb.jpg',
            fileName: 'test2.jpg',
            fileSize: 1000,
            width: 100,
            height: 100,
            displayOrder: 2,
          },
        ],
      });

      // displayOrderでソート
      const images = await prisma.surveyImage.findMany({
        where: { surveyId: survey.id },
        orderBy: { displayOrder: 'asc' },
      });

      expect(images[0]?.displayOrder).toBe(1);
      expect(images[1]?.displayOrder).toBe(2);
      expect(images[2]?.displayOrder).toBe(3);
    });
  });

  describe('Relations', () => {
    it('現場調査からプロジェクト情報を取得できること', async () => {
      const survey = await prisma.siteSurvey.create({
        data: {
          projectId: testProjectId,
          name: 'リレーションテスト',
          surveyDate: new Date('2025-01-15'),
        },
      });

      const surveyWithProject = await prisma.siteSurvey.findUnique({
        where: { id: survey.id },
        include: { project: true },
      });

      expect(surveyWithProject?.project).not.toBeNull();
      expect(surveyWithProject?.project.id).toBe(testProjectId);
    });

    it('現場調査から画像一覧を取得できること', async () => {
      const survey = await prisma.siteSurvey.create({
        data: {
          projectId: testProjectId,
          name: '画像リレーションテスト',
          surveyDate: new Date('2025-01-15'),
        },
      });

      await prisma.surveyImage.createMany({
        data: [
          {
            surveyId: survey.id,
            originalPath: 'rel1.jpg',
            thumbnailPath: 'rel1-thumb.jpg',
            fileName: 'rel1.jpg',
            fileSize: 1000,
            width: 100,
            height: 100,
            displayOrder: 1,
          },
          {
            surveyId: survey.id,
            originalPath: 'rel2.jpg',
            thumbnailPath: 'rel2-thumb.jpg',
            fileName: 'rel2.jpg',
            fileSize: 1000,
            width: 100,
            height: 100,
            displayOrder: 2,
          },
        ],
      });

      const surveyWithImages = await prisma.siteSurvey.findUnique({
        where: { id: survey.id },
        include: { images: true },
      });

      expect(surveyWithImages?.images.length).toBe(2);
    });

    it('画像から注釈データを取得できること', async () => {
      const survey = await prisma.siteSurvey.create({
        data: {
          projectId: testProjectId,
          name: '注釈リレーションテスト',
          surveyDate: new Date('2025-01-15'),
        },
      });

      const image = await prisma.surveyImage.create({
        data: {
          surveyId: survey.id,
          originalPath: 'annotation-rel.jpg',
          thumbnailPath: 'annotation-rel-thumb.jpg',
          fileName: 'annotation-rel.jpg',
          fileSize: 1000,
          width: 100,
          height: 100,
          displayOrder: 1,
        },
      });

      await prisma.imageAnnotation.create({
        data: {
          imageId: image.id,
          data: { version: '1.0', objects: [{ type: 'line' }] },
        },
      });

      const imageWithAnnotation = await prisma.surveyImage.findUnique({
        where: { id: image.id },
        include: { annotation: true },
      });

      expect(imageWithAnnotation?.annotation).not.toBeNull();
      expect(imageWithAnnotation?.annotation?.data).toHaveProperty('objects');
    });
  });
});
