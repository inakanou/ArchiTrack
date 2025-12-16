/**
 * @fileoverview SiteSurveyService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 1.1: プロジェクトに紐付く新規現場調査レコードを作成する
 * - 1.6: プロジェクトが存在しない場合、現場調査の作成を許可しない
 * - 12.5: 現場調査の作成時に監査ログを記録する
 *
 * Task 3.1: 現場調査の作成機能を実装する
 * - プロジェクト存在確認のバリデーション
 * - 必須フィールド（名前、調査日）の検証
 * - 監査ログへの記録
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SiteSurveyService,
  type SiteSurveyServiceDependencies,
} from '../../../services/site-survey.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';
import type { CreateSiteSurveyInput } from '../../../schemas/site-survey.schema.js';
import { ProjectNotFoundForSurveyError } from '../../../errors/siteSurveyError.js';

// テスト用モック
function createMockPrisma() {
  return {
    project: {
      findUnique: vi.fn(),
    },
    siteSurvey: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        project: {
          findUnique: vi.fn(),
        },
        siteSurvey: {
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
      })
    ),
  } as unknown as PrismaClient;
}

function createMockAuditLogService(): IAuditLogService {
  return {
    createLog: vi.fn().mockResolvedValue({ id: 'audit-log-id' }),
    getLogs: vi.fn().mockResolvedValue([]),
    exportLogs: vi.fn().mockResolvedValue('[]'),
  };
}

// テスト用サンプルデータ
const mockProject = {
  id: 'project-123',
  name: 'テストプロジェクト',
  deletedAt: null,
};

const mockSiteSurvey = {
  id: 'survey-123',
  projectId: 'project-123',
  name: '第1回現場調査',
  surveyDate: new Date('2024-01-15'),
  memo: '調査メモ',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
  deletedAt: null,
  project: mockProject,
};

describe('SiteSurveyService', () => {
  let service: SiteSurveyService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockAuditLogService: IAuditLogService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockAuditLogService = createMockAuditLogService();

    const deps: SiteSurveyServiceDependencies = {
      prisma: mockPrisma,
      auditLogService: mockAuditLogService,
    };

    service = new SiteSurveyService(deps);
  });

  describe('createSiteSurvey', () => {
    const validInput: CreateSiteSurveyInput = {
      projectId: 'project-123',
      name: '第1回現場調査',
      surveyDate: '2024-01-15',
      memo: '調査メモ',
    };

    it('正常に現場調査を作成する（Requirements: 1.1）', async () => {
      // Arrange
      const actorId = 'actor-123';
      const createdSurvey = {
        ...mockSiteSurvey,
        project: mockProject,
      };

      // トランザクション内のモック設定
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
          },
          siteSurvey: {
            create: vi.fn().mockResolvedValue(createdSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.createSiteSurvey(validInput, actorId);

      // Assert
      expect(result).toBeDefined();
      expect(result.name).toBe('第1回現場調査');
      expect(result.projectId).toBe('project-123');
      expect(result.surveyDate).toEqual(new Date('2024-01-15'));
      expect(result.memo).toBe('調査メモ');
    });

    it('プロジェクトが存在しない場合はエラーを返す（Requirements: 1.6）', async () => {
      // Arrange
      const actorId = 'actor-123';

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue(null), // プロジェクトが存在しない
          },
          siteSurvey: {
            create: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(service.createSiteSurvey(validInput, actorId)).rejects.toThrow(
        ProjectNotFoundForSurveyError
      );
    });

    it('プロジェクトが論理削除されている場合はエラーを返す（Requirements: 1.6）', async () => {
      // Arrange
      const actorId = 'actor-123';
      const deletedProject = {
        ...mockProject,
        deletedAt: new Date('2024-01-10'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue(deletedProject),
          },
          siteSurvey: {
            create: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(service.createSiteSurvey(validInput, actorId)).rejects.toThrow(
        ProjectNotFoundForSurveyError
      );
    });

    it('監査ログを記録する（Requirements: 12.5）', async () => {
      // Arrange
      const actorId = 'actor-123';
      const createdSurvey = {
        ...mockSiteSurvey,
        project: mockProject,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
          },
          siteSurvey: {
            create: vi.fn().mockResolvedValue(createdSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      await service.createSiteSurvey(validInput, actorId);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SITE_SURVEY_CREATED',
          actorId,
          targetType: 'SiteSurvey',
          targetId: createdSurvey.id,
        })
      );
    });

    it('メモがnullの場合も正常に作成する', async () => {
      // Arrange
      const actorId = 'actor-123';
      const inputWithoutMemo: CreateSiteSurveyInput = {
        projectId: 'project-123',
        name: '第1回現場調査',
        surveyDate: '2024-01-15',
        memo: null,
      };
      const createdSurvey = {
        ...mockSiteSurvey,
        memo: null,
        project: mockProject,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
          },
          siteSurvey: {
            create: vi.fn().mockResolvedValue(createdSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.createSiteSurvey(inputWithoutMemo, actorId);

      // Assert
      expect(result).toBeDefined();
      expect(result.memo).toBeNull();
    });

    it('メモが省略された場合も正常に作成する', async () => {
      // Arrange
      const actorId = 'actor-123';
      const inputWithoutMemo: CreateSiteSurveyInput = {
        projectId: 'project-123',
        name: '第1回現場調査',
        surveyDate: '2024-01-15',
      };
      const createdSurvey = {
        ...mockSiteSurvey,
        memo: null,
        project: mockProject,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
          },
          siteSurvey: {
            create: vi.fn().mockResolvedValue(createdSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.createSiteSurvey(inputWithoutMemo, actorId);

      // Assert
      expect(result).toBeDefined();
      expect(result.memo).toBeNull();
    });

    it('監査ログにbefore/after情報を含める', async () => {
      // Arrange
      const actorId = 'actor-123';
      const createdSurvey = {
        ...mockSiteSurvey,
        project: mockProject,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue(mockProject),
          },
          siteSurvey: {
            create: vi.fn().mockResolvedValue(createdSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      await service.createSiteSurvey(validInput, actorId);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          before: null,
          after: expect.objectContaining({
            name: '第1回現場調査',
            projectId: 'project-123',
          }),
        })
      );
    });
  });

  /**
   * Task 3.3: 現場調査の更新機能を実装する
   *
   * Requirements:
   * - 1.3: 楽観的排他制御を用いて現場調査レコードを更新する
   * - 1.5: 同時編集による競合が検出される場合、競合エラーを表示して再読み込みを促す
   * - 12.5: 現場調査の更新時に監査ログを記録する
   *
   * - 楽観的排他制御（expectedUpdatedAt）の実装
   * - 競合時のエラーレスポンス
   * - 監査ログへの記録
   */
  describe('updateSiteSurvey', () => {
    const existingSurvey = {
      id: 'survey-123',
      projectId: 'project-123',
      name: '第1回現場調査',
      surveyDate: new Date('2024-01-15'),
      memo: '調査メモ',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02T10:00:00.000Z'),
      deletedAt: null,
      project: mockProject,
    };

    it('正常に現場調査を更新する（Requirements: 1.3）', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput = {
        name: '第1回現場調査（更新）',
        memo: '更新されたメモ',
      };
      const expectedUpdatedAt = new Date('2024-01-02T10:00:00.000Z');
      const updatedSurvey = {
        ...existingSurvey,
        name: updateInput.name,
        memo: updateInput.memo,
        updatedAt: new Date('2024-01-03T10:00:00.000Z'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(existingSurvey),
            update: vi.fn().mockResolvedValue(updatedSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.updateSiteSurvey(
        'survey-123',
        updateInput,
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.name).toBe('第1回現場調査（更新）');
      expect(result.memo).toBe('更新されたメモ');
    });

    it('名前のみ更新できる', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput = { name: '新しい調査名' };
      const expectedUpdatedAt = new Date('2024-01-02T10:00:00.000Z');
      const updatedSurvey = {
        ...existingSurvey,
        name: updateInput.name,
        updatedAt: new Date('2024-01-03T10:00:00.000Z'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(existingSurvey),
            update: vi.fn().mockResolvedValue(updatedSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.updateSiteSurvey(
        'survey-123',
        updateInput,
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(result.name).toBe('新しい調査名');
      expect(result.memo).toBe('調査メモ'); // 変更されていない
    });

    it('調査日のみ更新できる', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput = { surveyDate: '2024-02-20' };
      const expectedUpdatedAt = new Date('2024-01-02T10:00:00.000Z');
      const updatedSurvey = {
        ...existingSurvey,
        surveyDate: new Date('2024-02-20'),
        updatedAt: new Date('2024-01-03T10:00:00.000Z'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(existingSurvey),
            update: vi.fn().mockResolvedValue(updatedSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.updateSiteSurvey(
        'survey-123',
        updateInput,
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(result.surveyDate).toEqual(new Date('2024-02-20'));
    });

    it('メモをnullに更新できる', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput = { memo: null };
      const expectedUpdatedAt = new Date('2024-01-02T10:00:00.000Z');
      const updatedSurvey = {
        ...existingSurvey,
        memo: null,
        updatedAt: new Date('2024-01-03T10:00:00.000Z'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(existingSurvey),
            update: vi.fn().mockResolvedValue(updatedSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.updateSiteSurvey(
        'survey-123',
        updateInput,
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(result.memo).toBeNull();
    });

    it('存在しない現場調査を更新しようとするとエラーを返す', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput = { name: '更新名' };
      const expectedUpdatedAt = new Date('2024-01-02T10:00:00.000Z');

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      const { SiteSurveyNotFoundError } = await import('../../../errors/siteSurveyError.js');
      await expect(
        service.updateSiteSurvey('non-existent', updateInput, actorId, expectedUpdatedAt)
      ).rejects.toThrow(SiteSurveyNotFoundError);
    });

    it('論理削除された現場調査を更新しようとするとエラーを返す', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput = { name: '更新名' };
      const expectedUpdatedAt = new Date('2024-01-02T10:00:00.000Z');
      const deletedSurvey = {
        ...existingSurvey,
        deletedAt: new Date('2024-01-10'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(deletedSurvey),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      const { SiteSurveyNotFoundError } = await import('../../../errors/siteSurveyError.js');
      await expect(
        service.updateSiteSurvey('survey-123', updateInput, actorId, expectedUpdatedAt)
      ).rejects.toThrow(SiteSurveyNotFoundError);
    });

    it('楽観的排他制御: expectedUpdatedAtが一致しない場合はコンフリクトエラーを返す（Requirements: 1.5）', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput = { name: '更新名' };
      // 期待値と実際の値が異なる
      const expectedUpdatedAt = new Date('2024-01-01T10:00:00.000Z'); // 古い値
      // existingSurvey.updatedAtは2024-01-02T10:00:00.000Z

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(existingSurvey),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      const { SiteSurveyConflictError } = await import('../../../errors/siteSurveyError.js');
      await expect(
        service.updateSiteSurvey('survey-123', updateInput, actorId, expectedUpdatedAt)
      ).rejects.toThrow(SiteSurveyConflictError);
    });

    it('楽観的排他制御: コンフリクトエラーに詳細情報を含める', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput = { name: '更新名' };
      const expectedUpdatedAt = new Date('2024-01-01T10:00:00.000Z');

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(existingSurvey),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      try {
        await service.updateSiteSurvey('survey-123', updateInput, actorId, expectedUpdatedAt);
        expect.fail('Should have thrown SiteSurveyConflictError');
      } catch (error: unknown) {
        const { SiteSurveyConflictError } = await import('../../../errors/siteSurveyError.js');
        expect(error).toBeInstanceOf(SiteSurveyConflictError);
        // エラーメッセージに再読み込みを促す内容が含まれる
        expect((error as Error).message).toContain('他のユーザー');
      }
    });

    it('監査ログを記録する（Requirements: 12.5）', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput = { name: '第1回現場調査（更新）' };
      const expectedUpdatedAt = new Date('2024-01-02T10:00:00.000Z');
      const updatedSurvey = {
        ...existingSurvey,
        name: updateInput.name,
        updatedAt: new Date('2024-01-03T10:00:00.000Z'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(existingSurvey),
            update: vi.fn().mockResolvedValue(updatedSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      await service.updateSiteSurvey('survey-123', updateInput, actorId, expectedUpdatedAt);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SITE_SURVEY_UPDATED',
          actorId,
          targetType: 'SiteSurvey',
          targetId: 'survey-123',
        })
      );
    });

    it('監査ログにbefore/after情報を含める', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput = { name: '第1回現場調査（更新）', memo: '新しいメモ' };
      const expectedUpdatedAt = new Date('2024-01-02T10:00:00.000Z');
      const updatedSurvey = {
        ...existingSurvey,
        name: updateInput.name,
        memo: updateInput.memo,
        updatedAt: new Date('2024-01-03T10:00:00.000Z'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(existingSurvey),
            update: vi.fn().mockResolvedValue(updatedSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      await service.updateSiteSurvey('survey-123', updateInput, actorId, expectedUpdatedAt);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          before: expect.objectContaining({
            name: '第1回現場調査',
            memo: '調査メモ',
          }),
          after: expect.objectContaining({
            name: '第1回現場調査（更新）',
            memo: '新しいメモ',
          }),
        })
      );
    });

    it('Prismaのupdateに正しいパラメータを渡す', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput = { name: '更新名', surveyDate: '2024-03-01', memo: '更新メモ' };
      const expectedUpdatedAt = new Date('2024-01-02T10:00:00.000Z');
      const updatedSurvey = {
        ...existingSurvey,
        ...updateInput,
        surveyDate: new Date('2024-03-01'),
        updatedAt: new Date('2024-01-03T10:00:00.000Z'),
      };

      const mockUpdate = vi.fn().mockResolvedValue(updatedSurvey);
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(existingSurvey),
            update: mockUpdate,
          },
        };
        return fn(tx);
      });

      // Act
      await service.updateSiteSurvey('survey-123', updateInput, actorId, expectedUpdatedAt);

      // Assert
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'survey-123' },
        data: expect.objectContaining({
          name: '更新名',
          surveyDate: new Date('2024-03-01'),
          memo: '更新メモ',
        }),
      });
    });

    it('空の更新入力でも正常に処理する', async () => {
      // Arrange
      const actorId = 'actor-123';
      const updateInput = {}; // 何も更新しない
      const expectedUpdatedAt = new Date('2024-01-02T10:00:00.000Z');

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(existingSurvey),
            update: vi.fn().mockResolvedValue(existingSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.updateSiteSurvey(
        'survey-123',
        updateInput,
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('survey-123');
    });
  });

  /**
   * Task 3.2: 現場調査の詳細取得機能を実装する
   *
   * Requirements:
   * - 1.2: 現場調査の基本情報と関連する画像一覧を表示する
   *
   * - 関連する画像一覧の取得を含む
   * - プロジェクト基本情報の取得
   * - 論理削除されたレコードの除外
   */
  describe('findById', () => {
    const mockSurveyImages = [
      {
        id: 'image-001',
        surveyId: 'survey-123',
        originalPath: 'surveys/survey-123/images/image-001.jpg',
        thumbnailPath: 'surveys/survey-123/thumbnails/image-001.jpg',
        fileName: 'photo1.jpg',
        fileSize: 150000,
        width: 1920,
        height: 1080,
        displayOrder: 1,
        createdAt: new Date('2024-01-10'),
      },
      {
        id: 'image-002',
        surveyId: 'survey-123',
        originalPath: 'surveys/survey-123/images/image-002.jpg',
        thumbnailPath: 'surveys/survey-123/thumbnails/image-002.jpg',
        fileName: 'photo2.jpg',
        fileSize: 200000,
        width: 1920,
        height: 1080,
        displayOrder: 2,
        createdAt: new Date('2024-01-11'),
      },
    ];

    const mockSurveyWithProjectAndImages = {
      ...mockSiteSurvey,
      project: {
        id: 'project-123',
        name: 'テストプロジェクト',
      },
      images: mockSurveyImages,
    };

    it('現場調査詳細を正常に取得する（Requirements: 1.2）', async () => {
      // Arrange
      mockPrisma.siteSurvey.findUnique = vi.fn().mockResolvedValue(mockSurveyWithProjectAndImages);

      // Act
      const result = await service.findById('survey-123');

      // Assert
      expect(result).toBeDefined();
      expect(result?.id).toBe('survey-123');
      expect(result?.name).toBe('第1回現場調査');
      expect(result?.projectId).toBe('project-123');
    });

    it('プロジェクト基本情報を含めて取得する', async () => {
      // Arrange
      mockPrisma.siteSurvey.findUnique = vi.fn().mockResolvedValue(mockSurveyWithProjectAndImages);

      // Act
      const result = await service.findById('survey-123');

      // Assert
      expect(result?.project).toBeDefined();
      expect(result?.project.id).toBe('project-123');
      expect(result?.project.name).toBe('テストプロジェクト');
    });

    it('関連する画像一覧を含めて取得する', async () => {
      // Arrange
      mockPrisma.siteSurvey.findUnique = vi.fn().mockResolvedValue(mockSurveyWithProjectAndImages);

      // Act
      const result = await service.findById('survey-123');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.images).toBeDefined();
      expect(result!.images.length).toBe(2);
      expect(result!.images[0]!.id).toBe('image-001');
      expect(result!.images[0]!.fileName).toBe('photo1.jpg');
      expect(result!.images[1]!.id).toBe('image-002');
    });

    it('画像はdisplayOrder順でソートされて取得する（Prisma orderByで制御）', async () => {
      // Arrange
      // Prisma orderByがdisplayOrderで昇順ソートを行うことを検証
      // 実際のソートはDB側で行われるため、モックは順序どおりのデータを返す
      mockPrisma.siteSurvey.findUnique = vi.fn().mockResolvedValue(mockSurveyWithProjectAndImages);

      // Act
      await service.findById('survey-123');

      // Assert - orderByが正しく指定されていることを確認
      expect(mockPrisma.siteSurvey.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            images: {
              orderBy: {
                displayOrder: 'asc',
              },
            },
          }),
        })
      );
    });

    it('画像が存在しない場合も正常に取得する', async () => {
      // Arrange
      mockPrisma.siteSurvey.findUnique = vi.fn().mockResolvedValue({
        ...mockSurveyWithProjectAndImages,
        images: [],
      });

      // Act
      const result = await service.findById('survey-123');

      // Assert
      expect(result).toBeDefined();
      expect(result?.images).toEqual([]);
    });

    it('論理削除された現場調査は取得できない', async () => {
      // Arrange
      mockPrisma.siteSurvey.findUnique = vi.fn().mockResolvedValue(null);

      // Act
      const result = await service.findById('survey-123');

      // Assert
      expect(result).toBeNull();
    });

    it('存在しない現場調査IDの場合はnullを返す', async () => {
      // Arrange
      mockPrisma.siteSurvey.findUnique = vi.fn().mockResolvedValue(null);

      // Act
      const result = await service.findById('non-existent-id');

      // Assert
      expect(result).toBeNull();
    });

    it('正しいクエリパラメータでfindUniqueを呼び出す', async () => {
      // Arrange
      mockPrisma.siteSurvey.findUnique = vi.fn().mockResolvedValue(mockSurveyWithProjectAndImages);

      // Act
      await service.findById('survey-123');

      // Assert
      expect(mockPrisma.siteSurvey.findUnique).toHaveBeenCalledWith({
        where: {
          id: 'survey-123',
          deletedAt: null,
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          images: {
            orderBy: {
              displayOrder: 'asc',
            },
          },
        },
      });
    });

    it('画像件数を返す', async () => {
      // Arrange
      mockPrisma.siteSurvey.findUnique = vi.fn().mockResolvedValue(mockSurveyWithProjectAndImages);

      // Act
      const result = await service.findById('survey-123');

      // Assert
      expect(result?.imageCount).toBe(2);
    });

    it('サムネイルURLを代表画像から取得する', async () => {
      // Arrange
      mockPrisma.siteSurvey.findUnique = vi.fn().mockResolvedValue(mockSurveyWithProjectAndImages);

      // Act
      const result = await service.findById('survey-123');

      // Assert
      // 最初の画像のサムネイルパスを返す
      expect(result?.thumbnailUrl).toBe('surveys/survey-123/thumbnails/image-001.jpg');
    });

    it('画像がない場合はサムネイルURLがnull', async () => {
      // Arrange
      mockPrisma.siteSurvey.findUnique = vi.fn().mockResolvedValue({
        ...mockSurveyWithProjectAndImages,
        images: [],
      });

      // Act
      const result = await service.findById('survey-123');

      // Assert
      expect(result?.thumbnailUrl).toBeNull();
    });
  });

  /**
   * Task 3.4: 現場調査の削除機能を実装する
   *
   * Requirements:
   * - 1.4: 現場調査と関連する画像データを論理削除する
   * - 12.5: 現場調査の削除時に監査ログを記録する
   *
   * - 論理削除（deletedAtの設定）
   * - 関連画像の連動削除処理
   * - 監査ログへの記録
   */
  describe('deleteSiteSurvey', () => {
    const existingSurvey = {
      id: 'survey-123',
      projectId: 'project-123',
      name: '第1回現場調査',
      surveyDate: new Date('2024-01-15'),
      memo: '調査メモ',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02T10:00:00.000Z'),
      deletedAt: null,
      project: mockProject,
    };

    const mockSurveyImages = [
      {
        id: 'image-001',
        surveyId: 'survey-123',
        originalPath: 'surveys/survey-123/images/image-001.jpg',
        thumbnailPath: 'surveys/survey-123/thumbnails/image-001.jpg',
        fileName: 'photo1.jpg',
        fileSize: 150000,
        width: 1920,
        height: 1080,
        displayOrder: 1,
        createdAt: new Date('2024-01-10'),
      },
      {
        id: 'image-002',
        surveyId: 'survey-123',
        originalPath: 'surveys/survey-123/images/image-002.jpg',
        thumbnailPath: 'surveys/survey-123/thumbnails/image-002.jpg',
        fileName: 'photo2.jpg',
        fileSize: 200000,
        width: 1920,
        height: 1080,
        displayOrder: 2,
        createdAt: new Date('2024-01-11'),
      },
    ];

    it('正常に現場調査を論理削除する（Requirements: 1.4）', async () => {
      // Arrange
      const actorId = 'actor-123';
      const deletedAt = new Date('2024-02-01T10:00:00.000Z');
      const surveyWithImages = {
        ...existingSurvey,
        images: mockSurveyImages,
      };
      const deletedSurvey = {
        ...existingSurvey,
        deletedAt,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(surveyWithImages),
            update: vi.fn().mockResolvedValue(deletedSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      await service.deleteSiteSurvey('survey-123', actorId);

      // Assert - エラーがスローされないことを確認
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('存在しない現場調査を削除しようとするとエラーを返す', async () => {
      // Arrange
      const actorId = 'actor-123';

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      const { SiteSurveyNotFoundError } = await import('../../../errors/siteSurveyError.js');
      await expect(service.deleteSiteSurvey('non-existent', actorId)).rejects.toThrow(
        SiteSurveyNotFoundError
      );
    });

    it('既に論理削除されている現場調査を削除しようとするとエラーを返す', async () => {
      // Arrange
      const actorId = 'actor-123';
      const alreadyDeletedSurvey = {
        ...existingSurvey,
        deletedAt: new Date('2024-01-20'),
        images: [],
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(alreadyDeletedSurvey),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      const { SiteSurveyNotFoundError } = await import('../../../errors/siteSurveyError.js');
      await expect(service.deleteSiteSurvey('survey-123', actorId)).rejects.toThrow(
        SiteSurveyNotFoundError
      );
    });

    it('関連する画像がある現場調査を正常に論理削除する（Requirements: 1.4）', async () => {
      // Arrange
      // 注: SurveyImageにはdeletedAtフィールドがない設計
      // 現場調査が論理削除されると、関連画像は親の削除状態により除外される
      const actorId = 'actor-123';
      const surveyWithImages = {
        ...existingSurvey,
        images: mockSurveyImages,
      };
      const deletedSurvey = {
        ...existingSurvey,
        deletedAt: new Date('2024-02-01T10:00:00.000Z'),
      };

      const mockSurveyUpdate = vi.fn().mockResolvedValue(deletedSurvey);
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(surveyWithImages),
            update: mockSurveyUpdate,
          },
        };
        return fn(tx);
      });

      // Act
      await service.deleteSiteSurvey('survey-123', actorId);

      // Assert - 現場調査が論理削除される
      expect(mockSurveyUpdate).toHaveBeenCalledWith({
        where: { id: 'survey-123' },
        data: {
          deletedAt: expect.any(Date),
        },
      });
    });

    it('画像がない場合でも正常に削除する', async () => {
      // Arrange
      const actorId = 'actor-123';
      const surveyWithoutImages = {
        ...existingSurvey,
        images: [],
      };
      const deletedSurvey = {
        ...existingSurvey,
        deletedAt: new Date('2024-02-01T10:00:00.000Z'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(surveyWithoutImages),
            update: vi.fn().mockResolvedValue(deletedSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      await service.deleteSiteSurvey('survey-123', actorId);

      // Assert - エラーがスローされないこと
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('監査ログを記録する（Requirements: 12.5）', async () => {
      // Arrange
      const actorId = 'actor-123';
      const surveyWithImages = {
        ...existingSurvey,
        images: mockSurveyImages,
      };
      const deletedSurvey = {
        ...existingSurvey,
        deletedAt: new Date('2024-02-01T10:00:00.000Z'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(surveyWithImages),
            update: vi.fn().mockResolvedValue(deletedSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      await service.deleteSiteSurvey('survey-123', actorId);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SITE_SURVEY_DELETED',
          actorId,
          targetType: 'SiteSurvey',
          targetId: 'survey-123',
        })
      );
    });

    it('監査ログにbefore情報を含める（削除されたデータの記録）', async () => {
      // Arrange
      const actorId = 'actor-123';
      const surveyWithImages = {
        ...existingSurvey,
        images: mockSurveyImages,
      };
      const deletedSurvey = {
        ...existingSurvey,
        deletedAt: new Date('2024-02-01T10:00:00.000Z'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(surveyWithImages),
            update: vi.fn().mockResolvedValue(deletedSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      await service.deleteSiteSurvey('survey-123', actorId);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          before: expect.objectContaining({
            name: '第1回現場調査',
            projectId: 'project-123',
            memo: '調査メモ',
          }),
          after: null,
        })
      );
    });

    it('トランザクション内でsiteSurveyにdeletedAtを設定する', async () => {
      // Arrange
      const actorId = 'actor-123';
      const surveyWithImages = {
        ...existingSurvey,
        images: mockSurveyImages,
      };
      const deletedSurvey = {
        ...existingSurvey,
        deletedAt: new Date('2024-02-01T10:00:00.000Z'),
      };

      const mockSurveyUpdate = vi.fn().mockResolvedValue(deletedSurvey);
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(surveyWithImages),
            update: mockSurveyUpdate,
          },
        };
        return fn(tx);
      });

      // Act
      await service.deleteSiteSurvey('survey-123', actorId);

      // Assert
      expect(mockSurveyUpdate).toHaveBeenCalledWith({
        where: { id: 'survey-123' },
        data: {
          deletedAt: expect.any(Date),
        },
      });
    });

    it('監査ログに削除された画像の件数を含める', async () => {
      // Arrange
      const actorId = 'actor-123';
      const surveyWithImages = {
        ...existingSurvey,
        images: mockSurveyImages,
      };
      const deletedSurvey = {
        ...existingSurvey,
        deletedAt: new Date('2024-02-01T10:00:00.000Z'),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          siteSurvey: {
            findUnique: vi.fn().mockResolvedValue(surveyWithImages),
            update: vi.fn().mockResolvedValue(deletedSurvey),
          },
        };
        return fn(tx);
      });

      // Act
      await service.deleteSiteSurvey('survey-123', actorId);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          before: expect.objectContaining({
            imageCount: 2,
          }),
        })
      );
    });
  });
});
