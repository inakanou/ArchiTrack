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
});
