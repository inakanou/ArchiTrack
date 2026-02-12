/**
 * @fileoverview AnnotationService ユニットテスト
 *
 * TDD: AnnotationServiceの単体テスト
 *
 * Task 24.3: AnnotationServiceの単体テストを実装する
 * - 注釈保存・取得のテスト
 * - JSONエクスポートのテスト
 *
 * Task 5.1: 注釈データの保存機能を実装する
 * - Fabric.js JSON形式での保存
 * - バージョン管理（スキーマバージョン1.0）
 * - 楽観的排他制御の実装
 *
 * Task 5.2: 注釈データの取得・復元機能を実装する
 * - 画像IDによる注釈データ取得
 * - JSONデータの検証
 *
 * Task 5.3: 注釈データのJSONエクスポート機能を実装する
 * - Fabric.jsフォーマット準拠のJSONエクスポート
 * - ダウンロード用レスポンス生成
 *
 * Requirements:
 * - 9.1: 全ての注釈データをデータベースに保存する
 * - 9.2: 保存された注釈データを復元して表示する
 * - 9.4: 保存中インジケーターを表示する（バックエンドは保存処理を提供）
 * - 9.6: 注釈データをJSON形式でエクスポート可能にする
 *
 * @module __tests__/unit/services/annotation.service.test
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
  AnnotationNotFoundError,
} from '../../../services/annotation.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';

// テスト用モック
function createMockPrisma() {
  return {
    surveyImage: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    imageAnnotation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
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

  /**
   * Task 5.3: 注釈データのJSONエクスポート機能を実装する
   *
   * Requirements:
   * - 9.6: 注釈データをJSON形式でエクスポート可能にする
   */
  describe('exportAsJson (Task 5.3)', () => {
    it('画像IDで注釈データをJSON文字列としてエクスポートする（Requirements: 9.6）', async () => {
      // Arrange
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockSurveyImage);
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(mockImageAnnotation);

      // Act
      const result = await service.exportAsJson('image-123');

      // Assert
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');

      // JSONとしてパース可能であることを確認
      const parsed = JSON.parse(result);
      expect(parsed.version).toBe('1.0');
      expect(parsed.objects).toHaveLength(2);
    });

    it('エクスポートされたJSONはFabric.jsフォーマットに準拠する（Requirements: 9.6）', async () => {
      // Arrange
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockSurveyImage);
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(mockImageAnnotation);

      // Act
      const result = await service.exportAsJson('image-123');
      const parsed = JSON.parse(result);

      // Assert - Fabric.jsフォーマットの検証
      expect(parsed).toHaveProperty('version');
      expect(parsed).toHaveProperty('objects');
      expect(Array.isArray(parsed.objects)).toBe(true);

      // オブジェクトにFabric.js標準プロパティが含まれることを確認
      if (parsed.objects.length > 0) {
        const firstObject = parsed.objects[0];
        expect(firstObject).toHaveProperty('type');
      }
    });

    it('画像が存在しない場合はAnnotationImageNotFoundErrorをスローする（Requirements: 9.6）', async () => {
      // Arrange
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.exportAsJson('non-existent-image')).rejects.toThrow(
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
      await expect(service.exportAsJson('image-123')).rejects.toThrow(AnnotationImageNotFoundError);
    });

    it('注釈データが存在しない場合はAnnotationNotFoundErrorをスローする', async () => {
      // Arrange
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockSurveyImage);
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.exportAsJson('image-123')).rejects.toThrow(AnnotationNotFoundError);
    });

    it('viewportTransformプロパティを含むデータも正常にエクスポートできる', async () => {
      // Arrange
      const annotationWithViewport = {
        ...mockImageAnnotation,
        data: {
          ...mockAnnotationData,
          viewportTransform: [1, 0, 0, 1, 100, 50],
        },
      };
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockSurveyImage);
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(annotationWithViewport);

      // Act
      const result = await service.exportAsJson('image-123');
      const parsed = JSON.parse(result);

      // Assert
      expect(parsed.viewportTransform).toEqual([1, 0, 0, 1, 100, 50]);
    });

    it('backgroundプロパティを含むデータも正常にエクスポートできる', async () => {
      // Arrange
      const annotationWithBackground = {
        ...mockImageAnnotation,
        data: {
          ...mockAnnotationData,
          background: '#f0f0f0',
        },
      };
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockSurveyImage);
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(annotationWithBackground);

      // Act
      const result = await service.exportAsJson('image-123');
      const parsed = JSON.parse(result);

      // Assert
      expect(parsed.background).toBe('#f0f0f0');
    });

    it('空のオブジェクト配列でも正常にエクスポートできる', async () => {
      // Arrange
      const emptyAnnotation = {
        ...mockImageAnnotation,
        data: { version: '1.0', objects: [] },
      };
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockSurveyImage);
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(emptyAnnotation);

      // Act
      const result = await service.exportAsJson('image-123');
      const parsed = JSON.parse(result);

      // Assert
      expect(parsed.objects).toHaveLength(0);
    });

    it('エクスポートされたJSONは整形されたフォーマットである', async () => {
      // Arrange
      mockPrisma.surveyImage.findUnique = vi.fn().mockResolvedValue(mockSurveyImage);
      mockPrisma.imageAnnotation.findUnique = vi.fn().mockResolvedValue(mockImageAnnotation);

      // Act
      const result = await service.exportAsJson('image-123');

      // Assert - 整形されたJSONは改行を含む
      expect(result).toContain('\n');
      expect(result).toContain('  '); // インデントを含む
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

  // ===========================================================================
  // findByImageIds テスト（Task 43.1: バッチ注釈取得メソッドの単体テスト）
  // Requirements: 18.1, 18.3, 18.4, 18.8
  // ===========================================================================

  describe('findByImageIds', () => {
    const surveyId = 'survey-123';
    const imageId1 = 'image-001';
    const imageId2 = 'image-002';
    const imageId3 = 'image-003';

    const mockAnnotation1 = {
      id: 'annotation-001',
      imageId: imageId1,
      data: mockAnnotationData,
      version: '1.0',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
    };

    const mockAnnotation2 = {
      id: 'annotation-002',
      imageId: imageId2,
      data: { ...mockAnnotationData, objects: [{ type: 'circle', left: 50, top: 50 }] },
      version: '1.0',
      createdAt: new Date('2024-01-03'),
      updatedAt: new Date('2024-01-04'),
    };

    it('正常系: 複数画像IDに対する注釈データを一括取得する（Requirements: 18.1, 18.3）', async () => {
      // Arrange
      mockPrisma.surveyImage.findMany = vi
        .fn()
        .mockResolvedValue([{ id: imageId1 }, { id: imageId2 }]);
      mockPrisma.imageAnnotation.findMany = vi
        .fn()
        .mockResolvedValue([mockAnnotation1, mockAnnotation2]);

      // Act
      const result = await service.findByImageIds([imageId1, imageId2], surveyId);

      // Assert
      expect(result).toBeDefined();
      expect(Object.keys(result)).toHaveLength(2);
      expect(result[imageId1]).toBeDefined();
      expect(result[imageId1]!.id).toBe('annotation-001');
      expect(result[imageId1]!.imageId).toBe(imageId1);
      expect(result[imageId1]!.data).toEqual(mockAnnotationData);
      expect(result[imageId2]).toBeDefined();
      expect(result[imageId2]!.id).toBe('annotation-002');
      expect(result[imageId2]!.imageId).toBe(imageId2);
    });

    it('注釈なし画像に対して空データ（null）が返却される（Requirements: 18.4）', async () => {
      // Arrange: imageId3は注釈なし
      mockPrisma.surveyImage.findMany = vi
        .fn()
        .mockResolvedValue([{ id: imageId1 }, { id: imageId3 }]);
      mockPrisma.imageAnnotation.findMany = vi.fn().mockResolvedValue([
        mockAnnotation1,
        // imageId3の注釈はなし
      ]);

      // Act
      const result = await service.findByImageIds([imageId1, imageId3], surveyId);

      // Assert
      expect(result[imageId1]).toBeDefined();
      expect(result[imageId1]!.id).toBe('annotation-001');
      expect(result[imageId3]).toBeNull();
    });

    it('空の画像ID配列に対して空のオブジェクトを返却する', async () => {
      // Act
      const result = await service.findByImageIds([], surveyId);

      // Assert
      expect(result).toEqual({});
    });

    it('surveyに属さないimageIdに対してnullを返却する（REQ-18.4）', async () => {
      // Arrange: surveyに属さないimageIdがある
      const invalidImageId = 'image-invalid';
      mockPrisma.surveyImage.findMany = vi.fn().mockResolvedValue([
        { id: imageId1 },
        // invalidImageIdはsurveysに属さないので返却されない
      ]);
      mockPrisma.imageAnnotation.findMany = vi.fn().mockResolvedValue([mockAnnotation1]);

      // Act
      const result = await service.findByImageIds([imageId1, invalidImageId], surveyId);

      // Assert: 有効な画像IDには注釈データ、無効な画像IDにはnullが返る
      expect(result[imageId1]).toBeDefined();
      expect(result[imageId1]!.id).toBe('annotation-001');
      expect(result[invalidImageId]).toBeNull();
    });

    it('レスポンス形式が個別取得APIと互換である（Requirements: 18.8）', async () => {
      // Arrange
      mockPrisma.surveyImage.findMany = vi.fn().mockResolvedValue([{ id: imageId1 }]);
      mockPrisma.imageAnnotation.findMany = vi.fn().mockResolvedValue([mockAnnotation1]);

      // Act
      const batchResult = await service.findByImageIds([imageId1], surveyId);
      const individualResult = await service.findByImageId(imageId1);

      // Assert: バッチ結果の各エントリが個別取得結果と同じ構造を持つ
      const batchEntry = batchResult[imageId1];
      // 両方ともAnnotationInfo型（id, imageId, data, version, createdAt, updatedAt）を持つ
      if (batchEntry && individualResult) {
        expect(Object.keys(batchEntry).sort()).toEqual(Object.keys(individualResult).sort());
        expect(batchEntry.imageId).toBe(individualResult.imageId);
        expect(typeof batchEntry.id).toBe('string');
        expect(typeof batchEntry.version).toBe('string');
        expect(batchEntry.data).toBeDefined();
        expect(batchEntry.createdAt).toBeInstanceOf(Date);
        expect(batchEntry.updatedAt).toBeInstanceOf(Date);
      }
    });

    it('WHERE IN句で一括クエリが実行されることを確認する', async () => {
      // Arrange
      mockPrisma.surveyImage.findMany = vi
        .fn()
        .mockResolvedValue([{ id: imageId1 }, { id: imageId2 }]);
      mockPrisma.imageAnnotation.findMany = vi
        .fn()
        .mockResolvedValue([mockAnnotation1, mockAnnotation2]);

      // Act
      await service.findByImageIds([imageId1, imageId2], surveyId);

      // Assert: findManyが1回だけ呼ばれることで一括取得を確認
      expect(mockPrisma.imageAnnotation.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.imageAnnotation.findMany).toHaveBeenCalledWith({
        where: {
          imageId: { in: [imageId1, imageId2] },
        },
      });
    });
  });
});
