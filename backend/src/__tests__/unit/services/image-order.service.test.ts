/**
 * @fileoverview ImageOrderServiceの単体テスト
 *
 * Task 4.4: 画像順序変更機能を実装する
 * - ドラッグアンドドロップによる順序変更のバックエンド対応
 * - 一括更新処理
 *
 * Requirements: 4.9, 4.10
 * - 4.9: 画像一覧を固定の表示順序で表示する
 * - 4.10: ユーザーが画像をドラッグアンドドロップすると、画像の表示順序を変更して保存する
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';

import {
  ImageOrderService,
  type ImageOrderServiceDependencies,
  type ImageOrderUpdate,
  ImageOrderError,
} from '../../../services/image-order.service.js';

describe('ImageOrderService', () => {
  let service: ImageOrderService;
  let mockPrisma: {
    siteSurvey: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    surveyImage: {
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // モックの作成
    mockPrisma = {
      siteSurvey: {
        findUnique: vi.fn(),
      },
      surveyImage: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    const deps: ImageOrderServiceDependencies = {
      prisma: mockPrisma as unknown as PrismaClient,
    };

    service = new ImageOrderService(deps);
  });

  describe('updateImageOrder (Requirements: 4.9, 4.10)', () => {
    const surveyId = 'survey-123';
    const existingImages = [
      { id: 'image-1', surveyId, displayOrder: 1 },
      { id: 'image-2', surveyId, displayOrder: 2 },
      { id: 'image-3', surveyId, displayOrder: 3 },
    ];

    describe('successful updates', () => {
      it('should update image order for all images in survey', async () => {
        // Arrange
        const orders: ImageOrderUpdate[] = [
          { id: 'image-1', order: 3 },
          { id: 'image-2', order: 1 },
          { id: 'image-3', order: 2 },
        ];

        mockPrisma.siteSurvey.findUnique.mockResolvedValue({
          id: surveyId,
          deletedAt: null,
        });
        mockPrisma.surveyImage.findMany.mockResolvedValue(existingImages);
        mockPrisma.$transaction.mockImplementation(async (callback) => {
          const result = await callback(mockPrisma);
          return result;
        });
        mockPrisma.surveyImage.update.mockResolvedValue({});

        // Act
        await service.updateImageOrder(surveyId, orders);

        // Assert
        expect(mockPrisma.siteSurvey.findUnique).toHaveBeenCalledWith({
          where: { id: surveyId },
        });
        expect(mockPrisma.surveyImage.findMany).toHaveBeenCalledWith({
          where: { surveyId },
          select: { id: true, surveyId: true, displayOrder: true },
        });
        expect(mockPrisma.$transaction).toHaveBeenCalled();
      });

      it('should call update for each image with new order', async () => {
        // Arrange
        const orders: ImageOrderUpdate[] = [
          { id: 'image-1', order: 2 },
          { id: 'image-2', order: 1 },
        ];

        mockPrisma.siteSurvey.findUnique.mockResolvedValue({
          id: surveyId,
          deletedAt: null,
        });
        mockPrisma.surveyImage.findMany.mockResolvedValue(existingImages.slice(0, 2));
        mockPrisma.$transaction.mockImplementation(async (callback) => {
          await callback(mockPrisma);
        });
        mockPrisma.surveyImage.update.mockResolvedValue({});

        // Act
        await service.updateImageOrder(surveyId, orders);

        // Assert
        expect(mockPrisma.surveyImage.update).toHaveBeenCalledWith({
          where: { id: 'image-1' },
          data: { displayOrder: 2 },
        });
        expect(mockPrisma.surveyImage.update).toHaveBeenCalledWith({
          where: { id: 'image-2' },
          data: { displayOrder: 1 },
        });
      });

      it('should handle single image reorder', async () => {
        // Arrange
        const orders: ImageOrderUpdate[] = [{ id: 'image-1', order: 1 }];

        mockPrisma.siteSurvey.findUnique.mockResolvedValue({
          id: surveyId,
          deletedAt: null,
        });
        mockPrisma.surveyImage.findMany.mockResolvedValue([existingImages[0]]);
        mockPrisma.$transaction.mockImplementation(async (callback) => {
          await callback(mockPrisma);
        });
        mockPrisma.surveyImage.update.mockResolvedValue({});

        // Act
        await service.updateImageOrder(surveyId, orders);

        // Assert
        expect(mockPrisma.surveyImage.update).toHaveBeenCalledTimes(1);
      });

      it('should update orders within a transaction', async () => {
        // Arrange
        const orders: ImageOrderUpdate[] = [
          { id: 'image-1', order: 2 },
          { id: 'image-2', order: 1 },
        ];

        mockPrisma.siteSurvey.findUnique.mockResolvedValue({
          id: surveyId,
          deletedAt: null,
        });
        mockPrisma.surveyImage.findMany.mockResolvedValue(existingImages.slice(0, 2));

        let transactionCalled = false;
        mockPrisma.$transaction.mockImplementation(async (callback) => {
          transactionCalled = true;
          await callback(mockPrisma);
        });
        mockPrisma.surveyImage.update.mockResolvedValue({});

        // Act
        await service.updateImageOrder(surveyId, orders);

        // Assert
        expect(transactionCalled).toBe(true);
      });
    });

    describe('error handling', () => {
      it('should throw error when survey does not exist', async () => {
        // Arrange
        const orders: ImageOrderUpdate[] = [{ id: 'image-1', order: 1 }];
        mockPrisma.siteSurvey.findUnique.mockResolvedValue(null);

        // Act & Assert
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(ImageOrderError);
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(
          /現場調査が見つかりません/
        );
      });

      it('should throw error when survey is deleted', async () => {
        // Arrange
        const orders: ImageOrderUpdate[] = [{ id: 'image-1', order: 1 }];
        mockPrisma.siteSurvey.findUnique.mockResolvedValue({
          id: surveyId,
          deletedAt: new Date(),
        });

        // Act & Assert
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(ImageOrderError);
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(
          /削除された現場調査/
        );
      });

      it('should throw error when orders array is empty', async () => {
        // Arrange
        const orders: ImageOrderUpdate[] = [];
        mockPrisma.siteSurvey.findUnique.mockResolvedValue({
          id: surveyId,
          deletedAt: null,
        });

        // Act & Assert
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(ImageOrderError);
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(
          /順序情報が指定されていません/
        );
      });

      it('should throw error when image ID does not exist in survey', async () => {
        // Arrange
        const orders: ImageOrderUpdate[] = [
          { id: 'image-1', order: 1 },
          { id: 'non-existent-image', order: 2 },
        ];

        mockPrisma.siteSurvey.findUnique.mockResolvedValue({
          id: surveyId,
          deletedAt: null,
        });
        mockPrisma.surveyImage.findMany.mockResolvedValue([existingImages[0]]);

        // Act & Assert
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(ImageOrderError);
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(
          /画像が見つかりません|存在しない画像/
        );
      });

      it('should throw error when order number is invalid (zero)', async () => {
        // Arrange
        const orders: ImageOrderUpdate[] = [
          { id: 'image-1', order: 0 },
          { id: 'image-2', order: 1 },
        ];

        mockPrisma.siteSurvey.findUnique.mockResolvedValue({
          id: surveyId,
          deletedAt: null,
        });
        mockPrisma.surveyImage.findMany.mockResolvedValue(existingImages.slice(0, 2));

        // Act & Assert
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(ImageOrderError);
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(/無効な順序値/);
      });

      it('should throw error when order number is negative', async () => {
        // Arrange
        const orders: ImageOrderUpdate[] = [
          { id: 'image-1', order: -1 },
          { id: 'image-2', order: 1 },
        ];

        mockPrisma.siteSurvey.findUnique.mockResolvedValue({
          id: surveyId,
          deletedAt: null,
        });
        mockPrisma.surveyImage.findMany.mockResolvedValue(existingImages.slice(0, 2));

        // Act & Assert
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(ImageOrderError);
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(/無効な順序値/);
      });

      it('should throw error when there are duplicate order values', async () => {
        // Arrange
        const orders: ImageOrderUpdate[] = [
          { id: 'image-1', order: 1 },
          { id: 'image-2', order: 1 },
        ];

        mockPrisma.siteSurvey.findUnique.mockResolvedValue({
          id: surveyId,
          deletedAt: null,
        });
        mockPrisma.surveyImage.findMany.mockResolvedValue(existingImages.slice(0, 2));

        // Act & Assert
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(ImageOrderError);
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(
          /重複した順序値|順序値が重複/
        );
      });

      it('should throw error when there are duplicate image IDs', async () => {
        // Arrange
        const orders: ImageOrderUpdate[] = [
          { id: 'image-1', order: 1 },
          { id: 'image-1', order: 2 },
        ];

        mockPrisma.siteSurvey.findUnique.mockResolvedValue({
          id: surveyId,
          deletedAt: null,
        });
        mockPrisma.surveyImage.findMany.mockResolvedValue([existingImages[0]]);

        // Act & Assert
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(ImageOrderError);
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(
          /重複した画像ID|画像IDが重複/
        );
      });

      it('should propagate database errors', async () => {
        // Arrange
        const orders: ImageOrderUpdate[] = [{ id: 'image-1', order: 1 }];

        mockPrisma.siteSurvey.findUnique.mockResolvedValue({
          id: surveyId,
          deletedAt: null,
        });
        mockPrisma.surveyImage.findMany.mockResolvedValue([existingImages[0]]);
        mockPrisma.$transaction.mockRejectedValue(new Error('Database connection failed'));

        // Act & Assert
        await expect(service.updateImageOrder(surveyId, orders)).rejects.toThrow(
          /Database connection failed/
        );
      });
    });

    describe('order validation', () => {
      it('should accept non-sequential order values', async () => {
        // Arrange
        const orders: ImageOrderUpdate[] = [
          { id: 'image-1', order: 10 },
          { id: 'image-2', order: 20 },
        ];

        mockPrisma.siteSurvey.findUnique.mockResolvedValue({
          id: surveyId,
          deletedAt: null,
        });
        mockPrisma.surveyImage.findMany.mockResolvedValue(existingImages.slice(0, 2));
        mockPrisma.$transaction.mockImplementation(async (callback) => {
          await callback(mockPrisma);
        });
        mockPrisma.surveyImage.update.mockResolvedValue({});

        // Act & Assert
        await expect(service.updateImageOrder(surveyId, orders)).resolves.not.toThrow();
      });

      it('should accept large order values', async () => {
        // Arrange
        const orders: ImageOrderUpdate[] = [
          { id: 'image-1', order: 1000000 },
          { id: 'image-2', order: 2000000 },
        ];

        mockPrisma.siteSurvey.findUnique.mockResolvedValue({
          id: surveyId,
          deletedAt: null,
        });
        mockPrisma.surveyImage.findMany.mockResolvedValue(existingImages.slice(0, 2));
        mockPrisma.$transaction.mockImplementation(async (callback) => {
          await callback(mockPrisma);
        });
        mockPrisma.surveyImage.update.mockResolvedValue({});

        // Act & Assert
        await expect(service.updateImageOrder(surveyId, orders)).resolves.not.toThrow();
      });
    });
  });

  describe('ImageOrderError', () => {
    it('should have correct name and code', () => {
      const error = new ImageOrderError('Test error', 'TEST_CODE');
      expect(error.name).toBe('ImageOrderError');
      expect(error.code).toBe('TEST_CODE');
      expect(error.message).toBe('Test error');
    });

    it('should preserve cause', () => {
      const cause = new Error('Original error');
      const error = new ImageOrderError('Wrapper error', 'WRAPPER', cause);
      expect(error.cause).toBe(cause);
    });
  });
});
