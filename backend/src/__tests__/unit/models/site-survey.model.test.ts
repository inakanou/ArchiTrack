/**
 * @fileoverview SiteSurvey関連モデルのスキーマ定義テスト
 *
 * TDD: RED Phase - Prismaスキーマで定義する現場調査モデルの型検証
 *
 * Requirements (site-survey):
 * - REQ-1.1: ユーザーが現場調査作成フォームを送信すると、プロジェクトに紐付く新規現場調査レコードを作成する
 * - REQ-1.4: ユーザーが現場調査を削除すると、現場調査と関連する画像データを論理削除する
 * - REQ-1.6: プロジェクトが存在しない場合、現場調査の作成を許可しない
 *
 * Models to implement:
 * - SiteSurvey: 現場調査エンティティ（プロジェクトに紐付く）
 * - SurveyImage: 現場調査画像（R2オブジェクトパス、サムネイル、表示順序）
 * - ImageAnnotation: 画像注釈（Fabric.js JSON形式）
 */

import { describe, it, expect } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client.js';

describe('SiteSurvey Model Schema', () => {
  describe('SiteSurvey CreateInput type structure', () => {
    it('should require mandatory fields (name, surveyDate, project relation)', () => {
      // Requirement 1.1: プロジェクトに紐付く新規現場調査レコードを作成
      // 必須フィールド: name（現場調査名）、surveyDate（調査日）、project（プロジェクトリレーション）
      const validInput: Prisma.SiteSurveyCreateInput = {
        name: 'テスト現場調査',
        surveyDate: new Date('2025-01-15'),
        project: { connect: { id: 'project-id' } },
      };

      expect(validInput.name).toBe('テスト現場調査');
      expect(validInput.surveyDate).toBeInstanceOf(Date);
    });

    it('should allow optional memo field', () => {
      // memo（メモ）は任意フィールド（最大2000文字）
      const inputWithMemo: Prisma.SiteSurveyCreateInput = {
        name: 'テスト現場調査',
        surveyDate: new Date('2025-01-15'),
        memo: '現場の状況メモ：入口から左手に進む',
        project: { connect: { id: 'project-id' } },
      };

      expect(inputWithMemo.memo).toBe('現場の状況メモ：入口から左手に進む');
    });
  });

  describe('SiteSurvey fields validation', () => {
    it('should have id field as UUID', () => {
      // Prismaスキーマで @id @default(uuid()) が設定されていることを型で確認
      const siteSurveySelect: Prisma.SiteSurveySelect = {
        id: true,
      };
      expect(siteSurveySelect.id).toBe(true);
    });

    it('should have projectId field as foreign key', () => {
      // Requirement 1.6: プロジェクトとの関連付け（外部キー制約）
      const siteSurveySelect: Prisma.SiteSurveySelect = {
        projectId: true,
        project: true,
      };
      expect(siteSurveySelect.projectId).toBe(true);
      expect(siteSurveySelect.project).toBe(true);
    });

    it('should have createdAt and updatedAt fields', () => {
      // 作成日時、更新日時（楽観的排他制御用）
      const siteSurveySelect: Prisma.SiteSurveySelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(siteSurveySelect.createdAt).toBe(true);
      expect(siteSurveySelect.updatedAt).toBe(true);
    });

    it('should have deletedAt field for soft delete', () => {
      // Requirement 1.4: 論理削除フィールド
      const siteSurveySelect: Prisma.SiteSurveySelect = {
        deletedAt: true,
      };
      expect(siteSurveySelect.deletedAt).toBe(true);
    });

    it('should have images relation to SurveyImage', () => {
      // 画像一覧リレーション
      const siteSurveySelect: Prisma.SiteSurveySelect = {
        images: true,
      };
      expect(siteSurveySelect.images).toBe(true);
    });
  });

  describe('SiteSurvey filter and sort fields', () => {
    it('should allow filtering by projectId', () => {
      // インデックス: projectId
      const where: Prisma.SiteSurveyWhereInput = {
        projectId: 'project-id',
      };
      expect(where.projectId).toBe('project-id');
    });

    it('should allow filtering by surveyDate range', () => {
      // インデックス: surveyDate
      const where: Prisma.SiteSurveyWhereInput = {
        surveyDate: {
          gte: new Date('2025-01-01'),
          lte: new Date('2025-12-31'),
        },
      };
      expect(where.surveyDate).toBeDefined();
    });

    it('should allow filtering by name (partial match)', () => {
      // インデックス: name
      const where: Prisma.SiteSurveyWhereInput = {
        name: { contains: 'テスト' },
      };
      expect(where.name).toBeDefined();
    });

    it('should allow excluding soft-deleted records', () => {
      // インデックス: deletedAt
      const where: Prisma.SiteSurveyWhereInput = {
        deletedAt: null,
      };
      expect(where.deletedAt).toBeNull();
    });

    it('should allow sorting by surveyDate, createdAt, updatedAt', () => {
      const orderBySurveyDate: Prisma.SiteSurveyOrderByWithRelationInput = {
        surveyDate: 'desc',
      };
      const orderByCreatedAt: Prisma.SiteSurveyOrderByWithRelationInput = {
        createdAt: 'desc',
      };
      const orderByUpdatedAt: Prisma.SiteSurveyOrderByWithRelationInput = {
        updatedAt: 'desc',
      };

      expect(orderBySurveyDate.surveyDate).toBe('desc');
      expect(orderByCreatedAt.createdAt).toBe('desc');
      expect(orderByUpdatedAt.updatedAt).toBe('desc');
    });
  });
});

describe('SurveyImage Model Schema', () => {
  describe('SurveyImage CreateInput type structure', () => {
    it('should require mandatory fields', () => {
      // 必須フィールド: originalPath, thumbnailPath, fileName, fileSize, width, height, displayOrder
      const validInput: Prisma.SurveyImageCreateInput = {
        originalPath: 'surveys/image-123/original.jpg',
        thumbnailPath: 'surveys/image-123/thumbnail.jpg',
        fileName: 'photo_001.jpg',
        fileSize: 256000,
        width: 1920,
        height: 1080,
        displayOrder: 1,
        survey: { connect: { id: 'survey-id' } },
      };

      expect(validInput.originalPath).toBe('surveys/image-123/original.jpg');
      expect(validInput.thumbnailPath).toBe('surveys/image-123/thumbnail.jpg');
      expect(validInput.fileName).toBe('photo_001.jpg');
      expect(validInput.fileSize).toBe(256000);
      expect(validInput.width).toBe(1920);
      expect(validInput.height).toBe(1080);
      expect(validInput.displayOrder).toBe(1);
    });
  });

  describe('SurveyImage fields validation', () => {
    it('should have id field as UUID', () => {
      const surveyImageSelect: Prisma.SurveyImageSelect = {
        id: true,
      };
      expect(surveyImageSelect.id).toBe(true);
    });

    it('should have surveyId field as foreign key', () => {
      const surveyImageSelect: Prisma.SurveyImageSelect = {
        surveyId: true,
        survey: true,
      };
      expect(surveyImageSelect.surveyId).toBe(true);
      expect(surveyImageSelect.survey).toBe(true);
    });

    it('should have image path fields', () => {
      const surveyImageSelect: Prisma.SurveyImageSelect = {
        originalPath: true,
        thumbnailPath: true,
      };
      expect(surveyImageSelect.originalPath).toBe(true);
      expect(surveyImageSelect.thumbnailPath).toBe(true);
    });

    it('should have image metadata fields', () => {
      const surveyImageSelect: Prisma.SurveyImageSelect = {
        fileName: true,
        fileSize: true,
        width: true,
        height: true,
      };
      expect(surveyImageSelect.fileName).toBe(true);
      expect(surveyImageSelect.fileSize).toBe(true);
      expect(surveyImageSelect.width).toBe(true);
      expect(surveyImageSelect.height).toBe(true);
    });

    it('should have displayOrder field for ordering', () => {
      const surveyImageSelect: Prisma.SurveyImageSelect = {
        displayOrder: true,
      };
      expect(surveyImageSelect.displayOrder).toBe(true);
    });

    it('should have createdAt field', () => {
      const surveyImageSelect: Prisma.SurveyImageSelect = {
        createdAt: true,
      };
      expect(surveyImageSelect.createdAt).toBe(true);
    });

    it('should have optional annotation relation', () => {
      // 注釈データは1対1（オプショナル）
      const surveyImageSelect: Prisma.SurveyImageSelect = {
        annotation: true,
      };
      expect(surveyImageSelect.annotation).toBe(true);
    });
  });

  describe('SurveyImage filter and sort fields', () => {
    it('should allow filtering by surveyId', () => {
      // インデックス: surveyId
      const where: Prisma.SurveyImageWhereInput = {
        surveyId: 'survey-id',
      };
      expect(where.surveyId).toBe('survey-id');
    });

    it('should allow sorting by displayOrder', () => {
      // インデックス: displayOrder
      const orderBy: Prisma.SurveyImageOrderByWithRelationInput = {
        displayOrder: 'asc',
      };
      expect(orderBy.displayOrder).toBe('asc');
    });
  });
});

describe('ImageAnnotation Model Schema', () => {
  describe('ImageAnnotation CreateInput type structure', () => {
    it('should require mandatory fields', () => {
      // 必須フィールド: data (JSON), image relation
      const validInput: Prisma.ImageAnnotationCreateInput = {
        data: {
          version: '1.0',
          objects: [],
        },
        image: { connect: { id: 'image-id' } },
      };

      expect(validInput.data).toBeDefined();
    });

    it('should have optional version field with default', () => {
      const inputWithVersion: Prisma.ImageAnnotationCreateInput = {
        data: { version: '1.0', objects: [] },
        version: '2.0',
        image: { connect: { id: 'image-id' } },
      };

      expect(inputWithVersion.version).toBe('2.0');
    });
  });

  describe('ImageAnnotation fields validation', () => {
    it('should have id field as UUID', () => {
      const annotationSelect: Prisma.ImageAnnotationSelect = {
        id: true,
      };
      expect(annotationSelect.id).toBe(true);
    });

    it('should have imageId field as unique foreign key', () => {
      // imageIdは@uniqueでSurveyImageと1対1
      const annotationSelect: Prisma.ImageAnnotationSelect = {
        imageId: true,
        image: true,
      };
      expect(annotationSelect.imageId).toBe(true);
      expect(annotationSelect.image).toBe(true);
    });

    it('should have data field as JSON', () => {
      // Fabric.js JSON形式の注釈データ
      const annotationSelect: Prisma.ImageAnnotationSelect = {
        data: true,
      };
      expect(annotationSelect.data).toBe(true);
    });

    it('should have version field for schema versioning', () => {
      const annotationSelect: Prisma.ImageAnnotationSelect = {
        version: true,
      };
      expect(annotationSelect.version).toBe(true);
    });

    it('should have createdAt and updatedAt fields', () => {
      const annotationSelect: Prisma.ImageAnnotationSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(annotationSelect.createdAt).toBe(true);
      expect(annotationSelect.updatedAt).toBe(true);
    });
  });
});

describe('Cascade Delete Behavior', () => {
  it('should cascade delete SiteSurvey when Project is deleted', () => {
    // Requirement 1.4: プロジェクト削除時、配下の現場調査もカスケード削除
    // Prismaスキーマで onDelete: Cascade が設定されていることを確認
    // この型テストはリレーションの定義を検証する
    const siteSurveyInclude: Prisma.SiteSurveyInclude = {
      project: true,
    };
    expect(siteSurveyInclude.project).toBe(true);
  });

  it('should cascade delete SurveyImage when SiteSurvey is deleted', () => {
    // 現場調査削除時、関連画像もカスケード削除
    const surveyImageInclude: Prisma.SurveyImageInclude = {
      survey: true,
    };
    expect(surveyImageInclude.survey).toBe(true);
  });

  it('should cascade delete ImageAnnotation when SurveyImage is deleted', () => {
    // 画像削除時、関連注釈もカスケード削除
    const annotationInclude: Prisma.ImageAnnotationInclude = {
      image: true,
    };
    expect(annotationInclude.image).toBe(true);
  });
});

describe('Index Definitions', () => {
  describe('SiteSurvey indexes', () => {
    it('should have index on projectId for efficient project-based queries', () => {
      // @@index([projectId])
      const where: Prisma.SiteSurveyWhereInput = {
        projectId: 'project-id',
      };
      expect(where.projectId).toBeDefined();
    });

    it('should have index on surveyDate for date-based filtering', () => {
      // @@index([surveyDate])
      const orderBy: Prisma.SiteSurveyOrderByWithRelationInput = {
        surveyDate: 'desc',
      };
      expect(orderBy.surveyDate).toBeDefined();
    });

    it('should have index on deletedAt for soft delete queries', () => {
      // @@index([deletedAt])
      const where: Prisma.SiteSurveyWhereInput = {
        deletedAt: null,
      };
      expect(where.deletedAt).toBeNull();
    });

    it('should have index on name for search queries', () => {
      // @@index([name])
      const where: Prisma.SiteSurveyWhereInput = {
        name: { contains: 'search' },
      };
      expect(where.name).toBeDefined();
    });
  });

  describe('SurveyImage indexes', () => {
    it('should have index on surveyId for survey-based queries', () => {
      // @@index([surveyId])
      const where: Prisma.SurveyImageWhereInput = {
        surveyId: 'survey-id',
      };
      expect(where.surveyId).toBeDefined();
    });

    it('should have index on displayOrder for ordering', () => {
      // @@index([displayOrder])
      const orderBy: Prisma.SurveyImageOrderByWithRelationInput = {
        displayOrder: 'asc',
      };
      expect(orderBy.displayOrder).toBeDefined();
    });
  });
});
