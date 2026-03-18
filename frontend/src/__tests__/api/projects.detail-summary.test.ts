/**
 * @fileoverview プロジェクト詳細一括取得API関数のユニットテスト
 *
 * Task 49.1: getProjectDetailSummary API関数のテスト
 * TDD: RED Phase - テストを最初に書く
 *
 * Requirements:
 * - 29.2: 最小限のAPIリクエスト数でデータ取得
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import { getProjectDetailSummary } from '../../api/projects';
import type { ProjectDetailSummary } from '../../api/projects';

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

const mockApiGet = vi.mocked(apiClient.get);

describe('getProjectDetailSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockDetailSummary: ProjectDetailSummary = {
    project: {
      id: 'project-1',
      name: 'テストプロジェクト',
      tradingPartnerId: null,
      tradingPartner: null,
      salesPerson: { id: 'user-1', displayName: '営業太郎' },
      siteAddress: '東京都',
      description: 'テスト',
      status: 'PREPARING',
      statusLabel: '準備中',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    statusHistory: [
      {
        id: 'history-1',
        fromStatus: null,
        fromStatusLabel: null,
        toStatus: 'PREPARING',
        toStatusLabel: '準備中',
        transitionType: 'initial',
        transitionTypeLabel: '初期',
        reason: null,
        changedBy: { id: 'user-1', displayName: '営業太郎' },
        changedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    sections: {
      siteSurveys: { totalCount: 2, latestSurveys: [] },
      quantityTables: { totalCount: 1, latestTables: [] },
      itemizedStatements: { totalCount: 0, latestStatements: [] },
      estimateRequests: { totalCount: 0, latestRequests: [] },
      estimates: { totalCount: 0, latestEstimates: [] },
      contracts: { totalCount: 0, latestContracts: [] },
      schedules: { totalCount: 0, latestSchedules: [] },
      executionBudget: null,
    },
  };

  /**
   * 49.1: 正常なAPIレスポンスの取得とパースを検証
   */
  it('正常なレスポンスを取得しProjectDetailSummary型で返却する', async () => {
    mockApiGet.mockResolvedValue(mockDetailSummary);

    const result = await getProjectDetailSummary('project-1');

    expect(mockApiGet).toHaveBeenCalledWith('/api/projects/project-1/detail-summary');
    expect(result).toEqual(mockDetailSummary);
    expect(result.project.id).toBe('project-1');
    expect(result.statusHistory).toHaveLength(1);
    expect(result.sections).toBeDefined();
    expect(result.sections.siteSurveys.totalCount).toBe(2);
  });

  /**
   * 49.1: ネットワークエラー時の例外伝播を検証
   */
  it('ネットワークエラー時に例外が伝播する', async () => {
    mockApiGet.mockRejectedValue(new Error('Network error'));

    await expect(getProjectDetailSummary('project-1')).rejects.toThrow('Network error');
  });

  /**
   * 49.1: 404エラー時のハンドリングを検証
   */
  it('404エラー時にApiErrorが伝播する', async () => {
    const error = new ApiError(404, 'Not found');
    mockApiGet.mockRejectedValue(error);

    await expect(getProjectDetailSummary('nonexistent')).rejects.toThrow(ApiError);
  });

  /**
   * 49.1: 403エラー時のハンドリングを検証
   */
  it('403エラー時にApiErrorが伝播する', async () => {
    const error = new ApiError(403, 'Forbidden');
    mockApiGet.mockRejectedValue(error);

    await expect(getProjectDetailSummary('project-1')).rejects.toThrow(ApiError);
  });

  /**
   * APIエンドポイントのパスが正しいことを検証
   */
  it('正しいAPIエンドポイントを呼び出す', async () => {
    mockApiGet.mockResolvedValue(mockDetailSummary);

    await getProjectDetailSummary('abc-123');

    expect(mockApiGet).toHaveBeenCalledWith('/api/projects/abc-123/detail-summary');
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });
});
