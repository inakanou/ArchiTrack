/**
 * @fileoverview AnnotationService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 5.1: 注釈データの保存機能を実装する
 * - Fabric.js JSON形式での保存
 * - バージョン管理（スキーマバージョン1.0）
 * - 楽観的排他制御の実装
 *
 * Requirements:
 * - 9.1: 全ての注釈データをデータベースに保存する
 * - 9.4: 保存中インジケーターを表示する（バックエンドは保存処理を提供）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AnnotationService,
  type AnnotationServiceDependencies,
  type SaveAnnotationInput,
  type AnnotationData,
  AnnotationImageNotFoundError,
  AnnotationConflictError,
  InvalidAnnotationDataError,
} from '../../../services/annotation.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';

// テスト用モック
function createMockPrisma() {
  return {
    surveyImage: {
      findUnique: vi.fn(),
    },
    imageAnnotation: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        surveyImage: {
          findUnique: vi.fn(),
        },
        imageAnnotation: {
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          upsert: vi.fn(),
        },
      })
    ),
  } as unknown as PrismaClient;
}

// テスト用サンプルデータ
const mockSurveyImage = {
  id: 'image-123',
  surveyId: 'survey-123',
  originalPath: 'surveys/survey-123/original.jpg',
  thumbnailPath: 'surveys/survey-123/thumbnail.jpg',
  fileName: 'original.jpg',
  fileSize: 100000,
  width: 1920,
  height: 1080,
  displayOrder: 1,
  createdAt: new Date('2024-01-01'),
  survey: {
    id: 'survey-123',
    deletedAt: null,
  },
};

const mockAnnotationData: AnnotationData = {
  version: '1.0',
  objects: [
    {
      type: 'rect',
      version: '5.3.0',
      originX: 'left',
      originY: 'top',
      left: 100,
      top: 100,
      width: 200,
      height: 150,
      fill: 'transparent',
      stroke: '#ff0000',
      strokeWidth: 2,
    },
    {
      type: 'textbox',
      version: '5.3.0',
      originX: 'left',
      originY: 'top',
      left: 350,
      top: 200,
      width: 150,
      text: 'コメント',
      fontSize: 16,
      fill: '#000000',
    },
  ],
};

const mockImageAnnotation = {
  id: 'annotation-123',
  imageId: 'image-123',
  data: mockAnnotationData,
  version: '1.0',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
};

describe('AnnotationService', () => {
  let service: AnnotationService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();

    const deps: AnnotationServiceDependencies = {
      prisma: mockPrisma,
    };

    service = new AnnotationService(deps);
  });

  describe('save', () => {
    it('新規注釈データを正常に保存する（Requirements: 9.1）', async () => {
      // Arrange
      const input: SaveAnnotationInput = {
        imageId: 'image-123',
        data: mockAnnotationData,
      };

      const createdAnnotation = {
        ...mockImageAnnotation,
        id: 'annotation-new',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          surveyImage: {
            findUnique: vi.fn().mockResolvedValue(mockSurveyImage),
          },
          imageAnnotation: {
            findUnique: vi.fn().mockResolvedValue(null), // 既存の注釈なし
            create: vi.fn().mockResolvedValue(createdAnnotation),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.save(input);

      // Assert
      expect(result).toBeDefined();
      expect(result.imageId).toBe('image-123');
      expect(result.data.version).toBe('1.0');
      expect(result.data.objects).toHaveLength(2);
    });

    it('既存の注釈データを更新する（Requirements: 9.1）', async () => {
      // Arrange
      const input: SaveAnnotationInput = {
        imageId: 'image-123',
        data: mockAnnotationData,
        expectedUpdatedAt: new Date('2024-01-02'),
      };

      const updatedAnnotation = {
        ...mockImageAnnotation,
        data: mockAnnotationData,
        updatedAt: new Date(),
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          surveyImage: {
            findUnique: vi.fn().mockResolvedValue(mockSurveyImage),
          },
          imageAnnotation: {
            findUnique: vi.fn().mockResolvedValue(mockImageAnnotation),
            update: vi.fn().mockResolvedValue(updatedAnnotation),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.save(input);

      // Assert
      expect(result).toBeDefined();
      expect(result.imageId).toBe('image-123');
    });

    it('画像が存在しない場合はエラーを返す', async () => {
      // Arrange
      const input: SaveAnnotationInput = {
        imageId: 'non-existent-image',
        data: mockAnnotationData,
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          surveyImage: {
            findUnique: vi.fn().mockResolvedValue(null), // 画像が存在しない
          },
          imageAnnotation: {
            findUnique: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(service.save(input)).rejects.toThrow(AnnotationImageNotFoundError);
    });

    it('現場調査が論理削除されている場合はエラーを返す', async () => {
      // Arrange
      const input: SaveAnnotationInput = {
        imageId: 'image-123',
        data: mockAnnotationData,
      };

      const deletedSurveyImage = {
        ...mockSurveyImage,
        survey: {
          id: 'survey-123',
          deletedAt: new Date('2024-01-10'),
        },
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          surveyImage: {
            findUnique: vi.fn().mockResolvedValue(deletedSurveyImage),
          },
          imageAnnotation: {
            findUnique: vi.fn(),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(service.save(input)).rejects.toThrow(AnnotationImageNotFoundError);
    });

    it('楽観的排他制御による競合を検出する（Requirements: 9.4）', async () => {
      // Arrange
      const input: SaveAnnotationInput = {
        imageId: 'image-123',
        data: mockAnnotationData,
        expectedUpdatedAt: new Date('2024-01-01'), // 古い更新日時
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          surveyImage: {
            findUnique: vi.fn().mockResolvedValue(mockSurveyImage),
          },
          imageAnnotation: {
            findUnique: vi.fn().mockResolvedValue({
              ...mockImageAnnotation,
              updatedAt: new Date('2024-01-02'), // 実際の更新日時は新しい
            }),
          },
        };
        return fn(tx);
      });

      // Act & Assert
      await expect(service.save(input)).rejects.toThrow(AnnotationConflictError);
    });

    it('バージョン番号が自動的に設定される', async () => {
      // Arrange
      const inputWithoutVersion: SaveAnnotationInput = {
        imageId: 'image-123',
        data: {
          ...mockAnnotationData,
          version: undefined as unknown as string,
        },
      };

      const createdAnnotation = {
        ...mockImageAnnotation,
        version: '1.0',
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          surveyImage: {
            findUnique: vi.fn().mockResolvedValue(mockSurveyImage),
          },
          imageAnnotation: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(createdAnnotation),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.save(inputWithoutVersion);

      // Assert
      expect(result.version).toBe('1.0');
    });

    it('空のオブジェクト配列でも保存できる', async () => {
      // Arrange
      const inputWithEmptyObjects: SaveAnnotationInput = {
        imageId: 'image-123',
        data: {
          version: '1.0',
          objects: [],
        },
      };

      const createdAnnotation = {
        ...mockImageAnnotation,
        data: { version: '1.0', objects: [] },
      };

      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          surveyImage: {
            findUnique: vi.fn().mockResolvedValue(mockSurveyImage),
          },
          imageAnnotation: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(createdAnnotation),
          },
        };
        return fn(tx);
      });

      // Act
      const result = await service.save(inputWithEmptyObjects);

      // Assert
      expect(result).toBeDefined();
      expect(result.data.objects).toHaveLength(0);
    });
  });

  describe('validateAnnotationData', () => {
    it('有効な注釈データを検証する', () => {
      // Act & Assert
      expect(() => service.validateAnnotationData(mockAnnotationData)).not.toThrow();
    });

    it('オブジェクト配列がない場合はエラー', () => {
      // Arrange
      const invalidData = {
        version: '1.0',
      } as unknown as AnnotationData;

      // Act & Assert
      expect(() => service.validateAnnotationData(invalidData)).toThrow(InvalidAnnotationDataError);
    });

    it('オブジェクト配列が配列でない場合はエラー', () => {
      // Arrange
      const invalidData = {
        version: '1.0',
        objects: 'not-an-array',
      } as unknown as AnnotationData;

      // Act & Assert
      expect(() => service.validateAnnotationData(invalidData)).toThrow(InvalidAnnotationDataError);
    });

    it('nullデータの場合はエラー', () => {
      // Act & Assert
      expect(() => service.validateAnnotationData(null as unknown as AnnotationData)).toThrow(
        InvalidAnnotationDataError
      );
    });
  });

  describe('findByImageId', () => {
    it('画像IDで注釈データを取得する', async () => {
      // Arrange
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(mockImageAnnotation);

      // Act
      const result = await service.findByImageId('image-123');

      // Assert
      expect(result).toBeDefined();
      expect(result?.imageId).toBe('image-123');
      expect(result?.data.objects).toHaveLength(2);
    });

    it('存在しない場合はnullを返す', async () => {
      // Arrange
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(null);

      // Act
      const result = await service.findByImageId('non-existent');

      // Assert
      expect(result).toBeNull();
    });
  });

  /**
   * Task 5.2: 注釈データの取得・復元機能を実装する
   *
   * Requirements:
   * - 9.2: 保存された注釈データを復元して表示する
   */
  describe('getAnnotationWithValidation (Task 5.2)', () => {
    it('画像IDで注釈データを取得し、JSONデータを検証する（Requirements: 9.2）', async () => {
      // Arrange
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue({
        ...mockImageAnnotation,
        image: mockSurveyImage,
      });
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockSurveyImage);

      // Act
      const result = await service.getAnnotationWithValidation('image-123');

      // Assert
      expect(result).toBeDefined();
      expect(result?.imageId).toBe('image-123');
      expect(result?.data.version).toBe('1.0');
      expect(result?.data.objects).toHaveLength(2);
    });

    it('注釈データが存在しない場合はnullを返す（Requirements: 9.2）', async () => {
      // Arrange
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(null);
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockSurveyImage);

      // Act
      const result = await service.getAnnotationWithValidation('image-123');

      // Assert
      expect(result).toBeNull();
    });

    it('画像が存在しない場合はAnnotationImageNotFoundErrorをスローする', async () => {
      // Arrange
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.getAnnotationWithValidation('non-existent-image')).rejects.toThrow(
        AnnotationImageNotFoundError
      );
    });

    it('現場調査が論理削除されている場合はAnnotationImageNotFoundErrorをスローする', async () => {
      // Arrange
      const deletedSurveyImage = {
        ...mockSurveyImage,
        survey: {
          id: 'survey-123',
          deletedAt: new Date('2024-01-10'),
        },
      };
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(deletedSurveyImage);

      // Act & Assert
      await expect(service.getAnnotationWithValidation('image-123')).rejects.toThrow(
        AnnotationImageNotFoundError
      );
    });

    it('不正なJSONデータの場合はInvalidAnnotationDataErrorをスローする', async () => {
      // Arrange
      const invalidAnnotation = {
        ...mockImageAnnotation,
        data: { invalid: 'data' }, // objectsプロパティがない
      };
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockSurveyImage);
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(invalidAnnotation);

      // Act & Assert
      await expect(service.getAnnotationWithValidation('image-123')).rejects.toThrow(
        InvalidAnnotationDataError
      );
    });

    it('objectsが配列でない場合はInvalidAnnotationDataErrorをスローする', async () => {
      // Arrange
      const invalidAnnotation = {
        ...mockImageAnnotation,
        data: { version: '1.0', objects: 'not-an-array' },
      };
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockSurveyImage);
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(invalidAnnotation);

      // Act & Assert
      await expect(service.getAnnotationWithValidation('image-123')).rejects.toThrow(
        InvalidAnnotationDataError
      );
    });

    it('空のオブジェクト配列でも正常に取得できる', async () => {
      // Arrange
      const emptyAnnotation = {
        ...mockImageAnnotation,
        data: { version: '1.0', objects: [] },
      };
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockSurveyImage);
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(emptyAnnotation);

      // Act
      const result = await service.getAnnotationWithValidation('image-123');

      // Assert
      expect(result).toBeDefined();
      expect(result?.data.objects).toHaveLength(0);
    });

    it('viewportTransformプロパティを含むデータも正常に取得できる', async () => {
      // Arrange
      const annotationWithViewport = {
        ...mockImageAnnotation,
        data: {
          ...mockAnnotationData,
          viewportTransform: [1, 0, 0, 1, 0, 0],
        },
      };
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockSurveyImage);
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(annotationWithViewport);

      // Act
      const result = await service.getAnnotationWithValidation('image-123');

      // Assert
      expect(result).toBeDefined();
      expect(result?.data.viewportTransform).toEqual([1, 0, 0, 1, 0, 0]);
    });

    it('backgroundプロパティを含むデータも正常に取得できる', async () => {
      // Arrange
      const annotationWithBackground = {
        ...mockImageAnnotation,
        data: {
          ...mockAnnotationData,
          background: '#ffffff',
        },
      };
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockSurveyImage);
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(annotationWithBackground);

      // Act
      const result = await service.getAnnotationWithValidation('image-123');

      // Assert
      expect(result).toBeDefined();
      expect(result?.data.background).toBe('#ffffff');
    });
  });

  describe('delete', () => {
    it('注釈データを削除する', async () => {
      // Arrange
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(mockImageAnnotation);
      mockPrisma.imageAnnotation.delete = vi.fn().mockResolvedValue(mockImageAnnotation);

      // Act
      await service.delete('image-123');

      // Assert
      expect(mockPrisma.imageAnnotation.delete).toHaveBeenCalledWith({
        where: { imageId: 'image-123' },
      });
    });

    it('存在しない注釈データの削除は何もしない', async () => {
      // Arrange
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(null);

      // Act & Assert - エラーがスローされないことを確認
      await expect(service.delete('non-existent')).resolves.toBeUndefined();
    });
  });
});
