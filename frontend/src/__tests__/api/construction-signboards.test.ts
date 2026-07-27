/**
 * @fileoverview 工事看板マスタAPIクライアントのユニットテスト
 *
 * Task 5.1: フロントAPIクライアントと型（看板CRUD・一覧）
 * TDD: RED Phase - テストを最初に書く
 *
 * Requirements:
 * - 8.1: POST /api/projects/:projectId/construction-signboards 看板作成
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import {
  getConstructionSignboards,
  createConstructionSignboard,
  updateConstructionSignboard,
  deleteConstructionSignboard,
} from '../../api/construction-signboards';
import {
  isConstructionSignboardConflictErrorResponse,
  type ConstructionSignboard,
  type CreateConstructionSignboardInput,
  type UpdateConstructionSignboardInput,
  type DeleteSignboardResult,
} from '../../types/construction-photo.types';

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
      getAccessToken: vi.fn(() => null),
    },
  };
});

describe('construction-signboards API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockSignboard: ConstructionSignboard = {
    id: 'signboard-1',
    projectId: 'project-1',
    workName: '外壁改修工事',
    workLocation: '東京都千代田区',
    freeItems: [{ label: '天候', value: '晴' }],
    footerText: '施工者: 山田',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
  };

  describe('getConstructionSignboards', () => {
    it('nestedパスで看板一覧を取得できること', async () => {
      const list: ConstructionSignboard[] = [mockSignboard];
      vi.mocked(apiClient.get).mockResolvedValueOnce(list);

      const result = await getConstructionSignboards('project-1');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/construction-signboards'
      );
      expect(result).toEqual(list);
    });
  });

  describe('createConstructionSignboard', () => {
    it('nestedパスで看板を作成できること', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockSignboard);

      const input: CreateConstructionSignboardInput = {
        workName: '外壁改修工事',
        workLocation: '東京都千代田区',
        freeItems: [{ label: '天候', value: '晴' }],
        footerText: '施工者: 山田',
      };
      const result = await createConstructionSignboard('project-1', input);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/projects/project-1/construction-signboards',
        input
      );
      expect(result).toEqual(mockSignboard);
    });
  });

  describe('updateConstructionSignboard', () => {
    it('flatパスでupdatedAt(楽観排他)を付与して更新できること', async () => {
      vi.mocked(apiClient.patch).mockResolvedValueOnce(mockSignboard);

      const input: UpdateConstructionSignboardInput = { workName: '外壁改修工事(更新)' };
      const expectedUpdatedAt = '2025-01-02T00:00:00.000Z';
      const result = await updateConstructionSignboard('signboard-1', input, expectedUpdatedAt);

      expect(apiClient.patch).toHaveBeenCalledWith('/api/construction-signboards/signboard-1', {
        workName: '外壁改修工事(更新)',
        updatedAt: expectedUpdatedAt,
      });
      expect(result).toEqual(mockSignboard);
    });

    it('楽観排他競合(409)を型ガードで識別できること', async () => {
      const response = {
        type: 'https://architrack.example.com/problems/construction-signboard-conflict',
        title: 'Conflict',
        status: 409,
        detail: '工事看板は他のユーザーによって更新されました。',
        code: 'CONSTRUCTION_SIGNBOARD_CONFLICT',
      };
      vi.mocked(apiClient.patch).mockRejectedValue(new ApiError(409, response.detail, response));

      try {
        await updateConstructionSignboard('signboard-1', { workName: 'x' }, '2025-01-02T00:00:00.000Z');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(isConstructionSignboardConflictErrorResponse((error as ApiError).response)).toBe(
          true
        );
      }
    });
  });

  describe('deleteConstructionSignboard', () => {
    it('flatパスで削除し使用件数(inUseCount)を返すこと', async () => {
      const deleteResult: DeleteSignboardResult = { inUseCount: 3 };
      vi.mocked(apiClient.delete).mockResolvedValueOnce(deleteResult);

      const result = await deleteConstructionSignboard('signboard-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/construction-signboards/signboard-1');
      expect(result.inUseCount).toBe(3);
    });
  });

  describe('isConstructionSignboardConflictErrorResponse', () => {
    it('code不一致でfalseを返すこと', () => {
      expect(isConstructionSignboardConflictErrorResponse({ code: 'OTHER' })).toBe(false);
    });

    it('undefinedでfalseを返すこと', () => {
      expect(isConstructionSignboardConflictErrorResponse(undefined)).toBe(false);
    });
  });
});
