/**
 * @fileoverview 出来高APIクライアントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 10.1-10.3: 出来高入力・履歴管理・月別集計
 *
 * Requirements:
 * - REQ-11.1-11.11: 出来高入力機能
 * - REQ-12.3-12.6: 出来高の履歴管理
 * - REQ-16.1-16.5: 月別出来高集計
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveProgress,
  getProgressHistory,
  getProgressByDate,
  deleteProgress,
  getMonthlyProgress,
  getMonthlyProgressDetail,
  exportMonthlyProgress,
} from '../../api/progress';
import { apiClient } from '../../api/client';

vi.mock('../../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('progress API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveProgress', () => {
    it('POST /api/projects/:projectId/execution-budget/progress を呼び出す', async () => {
      const mockResponse = { id: 'pr-1', constructionDate: '2026-03-18' };
      vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

      const input = {
        constructionDate: '2026-03-18',
        items: [{ itemId: 'item-1', amount: '100000' }],
      };

      const result = await saveProgress('project-1', input);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/projects/project-1/execution-budget/progress',
        input
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getProgressHistory', () => {
    it('GET /api/projects/:projectId/execution-budget/progress を呼び出す', async () => {
      const mockResponse = [{ id: 'pr-1', constructionDate: '2026-03-15' }];
      vi.mocked(apiClient.get).mockResolvedValue(mockResponse);

      const result = await getProgressHistory('project-1');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/execution-budget/progress'
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getProgressByDate', () => {
    it('GET /api/projects/:projectId/execution-budget/progress/:date を呼び出す', async () => {
      const mockResponse = { id: 'pr-1', constructionDate: '2026-03-15' };
      vi.mocked(apiClient.get).mockResolvedValue(mockResponse);

      const result = await getProgressByDate('project-1', '2026-03-15');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/execution-budget/progress/2026-03-15'
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('deleteProgress', () => {
    it('DELETE /api/projects/:projectId/execution-budget/progress/:progressRecordId を呼び出す', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(undefined);

      await deleteProgress('project-1', 'pr-1');

      expect(apiClient.delete).toHaveBeenCalledWith(
        '/api/projects/project-1/execution-budget/progress/pr-1'
      );
    });
  });

  describe('getMonthlyProgress', () => {
    it('GET /api/projects/:projectId/execution-budget/progress/monthly を呼び出す', async () => {
      const mockResponse = [{ yearMonth: '2026-03', monthlyAmount: '200000' }];
      vi.mocked(apiClient.get).mockResolvedValue(mockResponse);

      const result = await getMonthlyProgress('project-1');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/execution-budget/progress/monthly'
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getMonthlyProgressDetail', () => {
    it('GET /api/projects/:projectId/execution-budget/progress/monthly/:yearMonth を呼び出す', async () => {
      const mockResponse = [{ executionBudgetItemId: 'item-1', progressAmount: '100000' }];
      vi.mocked(apiClient.get).mockResolvedValue(mockResponse);

      const result = await getMonthlyProgressDetail('project-1', '2026-03');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/execution-budget/progress/monthly/2026-03'
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('exportMonthlyProgress', () => {
    it('GET /api/projects/:projectId/execution-budget/progress/monthly/export?format=xlsx を呼び出す', async () => {
      const mockBlob = new Blob(['test']);
      vi.mocked(apiClient.get).mockResolvedValue(mockBlob);

      const result = await exportMonthlyProgress('project-1', 'xlsx');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/execution-budget/progress/monthly/export?format=xlsx'
      );
      expect(result).toEqual(mockBlob);
    });

    it('GET /api/projects/:projectId/execution-budget/progress/monthly/export?format=pdf を呼び出す', async () => {
      const mockBlob = new Blob(['test']);
      vi.mocked(apiClient.get).mockResolvedValue(mockBlob);

      const result = await exportMonthlyProgress('project-1', 'pdf');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/execution-budget/progress/monthly/export?format=pdf'
      );
      expect(result).toEqual(mockBlob);
    });
  });
});
