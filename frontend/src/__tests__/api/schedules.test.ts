/**
 * @fileoverview 工程表APIクライアントのユニットテスト
 *
 * Task 6.1: 工程表API関数を実装する
 *
 * Requirements:
 * - REQ-1.1: GET /api/projects/:projectId/schedules 工程表一覧取得
 * - REQ-1.2: POST /api/projects/:projectId/schedules 工程表作成
 * - REQ-1.3: POST /api/projects/:projectId/schedules 工程表保存
 * - REQ-1.4: GET /api/schedules/:id 工程表詳細取得
 * - REQ-1.5: DELETE /api/schedules/:id 工程表削除
 * - REQ-7.1: GET /api/schedules/:id/export?format=xlsx エクスポート
 * - REQ-8.1: GET /api/schedules/:id/export?format=pdf エクスポート
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import {
  getSchedules,
  getScheduleDetail,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  bulkSaveScheduleItems,
  exportSchedule,
  type ScheduleListResponse,
  type ScheduleDetail,
  type CreateScheduleInput,
  type UpdateScheduleInput,
  type BulkSaveScheduleItemsInput,
  type BulkSaveResult,
} from '../../api/schedules';

// モック設定
vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// テストデータ
const mockScheduleDetail: ScheduleDetail = {
  id: 'schedule-1',
  projectId: 'project-1',
  name: 'テスト工程表',
  quantityTableId: 'qt-1',
  quantityTableName: '数量表A',
  items: [
    {
      id: 'item-1',
      sourceType: 'QUANTITY_TABLE',
      sourceQuantityItemId: 'qi-1',
      itemName: '基礎工事',
      labelText: '基礎',
      detailText: 'コンクリート打設',
      startDate: '2026-04-01',
      duration: 10,
      displayOrder: 0,
      isExportTarget: true,
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    },
    {
      id: 'item-2',
      sourceType: 'MANUAL',
      sourceQuantityItemId: null,
      itemName: '仮設工事',
      labelText: '仮設',
      detailText: '足場設置',
      startDate: '2026-04-15',
      duration: 5,
      displayOrder: 1,
      isExportTarget: true,
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    },
  ],
  version: 1,
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
};

const mockScheduleListResponse: ScheduleListResponse = {
  schedules: [
    {
      id: 'schedule-1',
      name: 'テスト工程表',
      quantityTableName: '数量表A',
      itemCount: 2,
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    },
    {
      id: 'schedule-2',
      name: '第2工程表',
      quantityTableName: null,
      itemCount: 0,
      createdAt: '2026-03-05T00:00:00Z',
      updatedAt: '2026-03-05T00:00:00Z',
    },
  ],
  total: 2,
};

describe('schedules API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // getSchedules - 工程表一覧取得
  // ==========================================================================
  describe('getSchedules', () => {
    it('オプションなしで工程表一覧を取得する', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockScheduleListResponse);

      const result = await getSchedules('project-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects/project-1/schedules');
      expect(result).toEqual(mockScheduleListResponse);
    });

    it('ページネーションオプション付きで取得する', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockScheduleListResponse);

      await getSchedules('project-1', { page: 2, limit: 10 });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/schedules?page=2&limit=10'
      );
    });

    it('ソートオプション付きで取得する', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockScheduleListResponse);

      await getSchedules('project-1', { sortBy: 'name', sortOrder: 'asc' });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/schedules?sortBy=name&sortOrder=asc'
      );
    });

    it('全オプション付きで取得する', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockScheduleListResponse);

      await getSchedules('project-1', {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/schedules?page=1&limit=20&sortBy=createdAt&sortOrder=desc'
      );
    });

    it('APIエラー時に例外をスローする', async () => {
      const mockError = new ApiError(500, 'Internal Server Error', { detail: 'Server error' });
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getSchedules('project-1')).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // getScheduleDetail - 工程表詳細取得
  // ==========================================================================
  describe('getScheduleDetail', () => {
    it('工程表詳細を取得する', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockScheduleDetail);

      const result = await getScheduleDetail('schedule-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/schedules/schedule-1');
      expect(result).toEqual(mockScheduleDetail);
    });

    it('存在しない工程表IDで404エラーをスローする', async () => {
      const mockError = new ApiError(404, 'Not Found', { detail: 'Schedule not found' });
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getScheduleDetail('non-existent')).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // createSchedule - 工程表作成
  // ==========================================================================
  describe('createSchedule', () => {
    it('数量表指定なしで工程表を作成する', async () => {
      const input: CreateScheduleInput = { name: '新規工程表' };
      const expected = { ...mockScheduleDetail, name: '新規工程表', items: [] };
      vi.mocked(apiClient.post).mockResolvedValueOnce(expected);

      const result = await createSchedule('project-1', input);

      expect(apiClient.post).toHaveBeenCalledWith('/api/projects/project-1/schedules', input);
      expect(result).toEqual(expected);
    });

    it('数量表指定ありで工程表を作成する', async () => {
      const input: CreateScheduleInput = { name: '数量表連携工程表', quantityTableId: 'qt-1' };
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockScheduleDetail);

      const result = await createSchedule('project-1', input);

      expect(apiClient.post).toHaveBeenCalledWith('/api/projects/project-1/schedules', input);
      expect(result.items.length).toBeGreaterThan(0);
    });

    it('バリデーションエラー時に例外をスローする', async () => {
      const mockError = new ApiError(400, 'Bad Request', { detail: 'Validation error' });
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(createSchedule('project-1', { name: '' })).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // updateSchedule - 工程表更新
  // ==========================================================================
  describe('updateSchedule', () => {
    const updateInput: UpdateScheduleInput = {
      name: '更新された工程表',
      version: 1,
    };

    it('工程表を更新する', async () => {
      const updatedSchedule = { ...mockScheduleDetail, name: '更新された工程表', version: 2 };
      vi.mocked(apiClient.put).mockResolvedValueOnce(updatedSchedule);

      const result = await updateSchedule('schedule-1', updateInput);

      expect(apiClient.put).toHaveBeenCalledWith('/api/schedules/schedule-1', updateInput);
      expect(result).toEqual(updatedSchedule);
    });

    it('楽観ロック競合時にエラーをスローする', async () => {
      const mockError = new ApiError(409, 'Conflict', { detail: 'Version conflict' });
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(updateSchedule('schedule-1', updateInput)).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // deleteSchedule - 工程表削除
  // ==========================================================================
  describe('deleteSchedule', () => {
    it('工程表を削除する', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await deleteSchedule('schedule-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/schedules/schedule-1');
    });

    it('存在しない工程表IDで404エラーをスローする', async () => {
      const mockError = new ApiError(404, 'Not Found', { detail: 'Schedule not found' });
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(deleteSchedule('non-existent')).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // bulkSaveScheduleItems - バルク保存
  // ==========================================================================
  describe('bulkSaveScheduleItems', () => {
    const bulkInput: BulkSaveScheduleItemsInput = {
      version: 1,
      items: [
        {
          id: 'item-1',
          itemName: '基礎工事',
          labelText: '基礎',
          detailText: 'コンクリート打設',
          startDate: '2026-04-01',
          duration: 10,
          displayOrder: 0,
          isExportTarget: true,
        },
        {
          id: null,
          itemName: '新規項目',
          labelText: '',
          detailText: '',
          startDate: null,
          duration: null,
          displayOrder: 1,
          isExportTarget: true,
        },
      ],
    };

    const mockBulkResult: BulkSaveResult = {
      updatedItemCount: 2,
      updatedAt: '2026-03-14T10:00:00Z',
    };

    it('バルク保存を実行する', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockBulkResult);

      const result = await bulkSaveScheduleItems('schedule-1', bulkInput);

      expect(apiClient.put).toHaveBeenCalledWith('/api/schedules/schedule-1/bulk-save', bulkInput);
      expect(result).toEqual(mockBulkResult);
    });

    it('バージョン競合時にエラーをスローする', async () => {
      const mockError = new ApiError(409, 'Conflict', { detail: 'Version conflict' });
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(bulkSaveScheduleItems('schedule-1', bulkInput)).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // exportSchedule - エクスポート
  // ==========================================================================
  describe('exportSchedule', () => {
    it('Excel形式でエクスポートURLを生成する', async () => {
      const mockBlob = new Blob(['test'], { type: 'application/octet-stream' });
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockBlob);

      const result = await exportSchedule('schedule-1', 'xlsx');

      expect(apiClient.get).toHaveBeenCalledWith('/api/schedules/schedule-1/export?format=xlsx');
      expect(result).toEqual(mockBlob);
    });

    it('PDF形式でエクスポートURLを生成する', async () => {
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockBlob);

      const result = await exportSchedule('schedule-1', 'pdf');

      expect(apiClient.get).toHaveBeenCalledWith('/api/schedules/schedule-1/export?format=pdf');
      expect(result).toEqual(mockBlob);
    });

    it('エクスポートエラー時に例外をスローする', async () => {
      const mockError = new ApiError(404, 'Not Found', { detail: 'Schedule not found' });
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(exportSchedule('non-existent', 'xlsx')).rejects.toThrow(ApiError);
    });
  });
});
