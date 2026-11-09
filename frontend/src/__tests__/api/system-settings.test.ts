/**
 * @fileoverview システムの設定（外部の AI での読み取り）の API クライアントの単体テスト
 *
 * タスク117.1（estimate-request の design.md の章「Requirements 43-50」の D8）。
 * 取得・変更の要求と、版の競合の 409（SYSTEM_SETTING_CONFLICT）の型つきの判別を確かめる。
 *
 * @requirement estimate-request/REQ-49.5 管理者の設定の取得・変更と変更の競合の判別
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';

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

import {
  getExternalAiReadingSetting,
  updateExternalAiReadingSetting,
  SystemSettingConflictError,
  isSystemSettingConflictError,
} from '../../api/system-settings';
import type { ExternalAiReadingSetting } from '../../api/system-settings';

const PATH = '/api/v1/admin/settings/external-ai-reading';

describe('system-settings API client（タスク117.1）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('外部の AI での読み取りの設定を GET で取得する', async () => {
    const setting: ExternalAiReadingSetting = { enabled: true, version: 0 };
    vi.mocked(apiClient.get).mockResolvedValueOnce(setting);

    const result = await getExternalAiReadingSetting();

    expect(apiClient.get).toHaveBeenCalledWith(PATH);
    expect(result).toEqual({ enabled: true, version: 0 });
  });

  it('変更は PUT で有効か否かと読んだ版を送り、新しい版を返す', async () => {
    vi.mocked(apiClient.put).mockResolvedValueOnce({ enabled: false, version: 4 });

    const result = await updateExternalAiReadingSetting(false, 3);

    expect(apiClient.put).toHaveBeenCalledWith(PATH, { enabled: false, version: 3 });
    expect(result).toEqual({ enabled: false, version: 4 });
  });

  it('409 SYSTEM_SETTING_CONFLICT を送った版と今の版つきの SystemSettingConflictError にする', async () => {
    vi.mocked(apiClient.put).mockRejectedValueOnce(
      new ApiError(409, '他の管理者が設定を変更しました', {
        type: 'https://architrack.example.com/problems/conflict',
        status: 409,
        code: 'SYSTEM_SETTING_CONFLICT',
        details: { expectedVersion: 3, actualVersion: 5 },
      })
    );

    const error = await updateExternalAiReadingSetting(true, 3).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SystemSettingConflictError);
    expect(error).toBeInstanceOf(ApiError);
    expect(isSystemSettingConflictError(error)).toBe(true);
    const conflict = error as SystemSettingConflictError;
    expect(conflict.statusCode).toBe(409);
    expect(conflict.code).toBe('SYSTEM_SETTING_CONFLICT');
    expect(conflict.expectedVersion).toBe(3);
    expect(conflict.actualVersion).toBe(5);
    expect(conflict.message).toBe('他の管理者が設定を変更しました');
  });

  it('今の版が分からない競合は actualVersion を null とする', async () => {
    vi.mocked(apiClient.put).mockRejectedValueOnce(
      new ApiError(409, 'conflict', {
        code: 'SYSTEM_SETTING_CONFLICT',
        details: { expectedVersion: 0 },
      })
    );

    const error = await updateExternalAiReadingSetting(false, 0).catch((e: unknown) => e);

    expect(isSystemSettingConflictError(error)).toBe(true);
    expect((error as SystemSettingConflictError).expectedVersion).toBe(0);
    expect((error as SystemSettingConflictError).actualVersion).toBeNull();
  });

  it('競合でない誤り（権限なしの 403 など）は ApiError のまま投げる', async () => {
    vi.mocked(apiClient.put).mockRejectedValueOnce(
      new ApiError(403, 'forbidden', { code: 'FORBIDDEN' })
    );

    const error = await updateExternalAiReadingSetting(false, 1).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(isSystemSettingConflictError(error)).toBe(false);
  });

  it('取得の失敗は ApiError のまま投げる', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new ApiError(403, 'forbidden'));

    await expect(getExternalAiReadingSetting()).rejects.toBeInstanceOf(ApiError);
  });
});
