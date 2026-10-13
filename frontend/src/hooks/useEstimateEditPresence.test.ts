/**
 * @fileoverview useEstimateEditPresence のテスト
 *
 * 在席の通知（即時・定期・前面復帰時）、応答の「編集中の他の利用者」の反映、
 * 退出の通知、403/404 での停止、通信エラー時の表示の保持を検証する。
 *
 * Requirements (estimate-creation):
 * - REQ-11.7: 見積書が他のユーザーによって編集中の場合、編集中であることを警告表示する
 *
 * @module hooks/useEstimateEditPresence.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  useEstimateEditPresence,
  ESTIMATE_EDIT_PRESENCE_HEARTBEAT_INTERVAL_MS,
} from './useEstimateEditPresence';
import * as estimatesApi from '../api/estimates';
import { ApiError } from '../api/client';

vi.mock('../api/estimates');

const OTHER = {
  userId: 'user-b',
  displayName: '山田 太郎',
  lastSeenAt: '2026-10-10T03:00:00.000Z',
};

const response = (otherEditors: estimatesApi.EstimateOtherEditor[]) => ({
  otherEditors,
  ttlSeconds: 90,
  heartbeatIntervalSeconds: 20,
});

/** 保留中の Promise を解決させる */
const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('useEstimateEditPresence', () => {
  beforeEach(() => {
    // 前のテストの描画は後始末（アンマウント）で退出を呼ぶため、記録はここで消す
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(estimatesApi.heartbeatEstimateEditSession).mockResolvedValue(response([]));
    vi.mocked(estimatesApi.leaveEstimateEditSession).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('マウント時に在席を通知し、編集中の他の利用者を返す (REQ-11.7)', async () => {
    vi.mocked(estimatesApi.heartbeatEstimateEditSession).mockResolvedValue(response([OTHER]));

    const { result } = renderHook(() => useEstimateEditPresence('est-1'));
    await flush();

    expect(estimatesApi.heartbeatEstimateEditSession).toHaveBeenCalledWith('est-1');
    expect(result.current.otherEditors).toEqual([OTHER]);
  });

  it('一定間隔で通知を繰り返し、相手の出入りを反映する (REQ-11.7)', async () => {
    const { result } = renderHook(() => useEstimateEditPresence('est-1'));
    await flush();
    expect(result.current.otherEditors).toEqual([]);

    // 相手が開いた
    vi.mocked(estimatesApi.heartbeatEstimateEditSession).mockResolvedValue(response([OTHER]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESTIMATE_EDIT_PRESENCE_HEARTBEAT_INTERVAL_MS);
    });
    expect(estimatesApi.heartbeatEstimateEditSession).toHaveBeenCalledTimes(2);
    expect(result.current.otherEditors).toEqual([OTHER]);

    // 相手が離れた
    vi.mocked(estimatesApi.heartbeatEstimateEditSession).mockResolvedValue(response([]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESTIMATE_EDIT_PRESENCE_HEARTBEAT_INTERVAL_MS);
    });
    expect(estimatesApi.heartbeatEstimateEditSession).toHaveBeenCalledTimes(3);
    expect(result.current.otherEditors).toEqual([]);
  });

  it('タブが前面に戻ったときに即時に通知する', async () => {
    renderHook(() => useEstimateEditPresence('est-1'));
    await flush();
    expect(estimatesApi.heartbeatEstimateEditSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    // jsdom の visibilityState は 'visible'
    expect(estimatesApi.heartbeatEstimateEditSession).toHaveBeenCalledTimes(2);
  });

  it('アンマウント時に退出を通知し、以後は通知しない (REQ-11.7)', async () => {
    const { unmount } = renderHook(() => useEstimateEditPresence('est-1'));
    await flush();

    unmount();
    await flush();

    expect(estimatesApi.leaveEstimateEditSession).toHaveBeenCalledWith('est-1', undefined);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESTIMATE_EDIT_PRESENCE_HEARTBEAT_INTERVAL_MS * 3);
    });
    expect(estimatesApi.heartbeatEstimateEditSession).toHaveBeenCalledTimes(1);
  });

  it('タブを閉じる・別のページへ移るとき（pagehide）に keepalive 付きで退出を通知する (REQ-11.7)', async () => {
    renderHook(() => useEstimateEditPresence('est-1'));
    await flush();

    window.dispatchEvent(new Event('pagehide'));

    expect(estimatesApi.leaveEstimateEditSession).toHaveBeenCalledWith('est-1', {
      keepalive: true,
    });
  });

  it.each([403, 404])('%i を受けたら通知をやめ、警告の対象を空にする', async (statusCode) => {
    vi.mocked(estimatesApi.heartbeatEstimateEditSession).mockRejectedValue(
      new ApiError(statusCode, 'error')
    );

    const { result, unmount } = renderHook(() => useEstimateEditPresence('est-1'));
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESTIMATE_EDIT_PRESENCE_HEARTBEAT_INTERVAL_MS * 3);
    });

    expect(estimatesApi.heartbeatEstimateEditSession).toHaveBeenCalledTimes(1);
    expect(result.current.otherEditors).toEqual([]);

    // 在席を記録できていないので退出も送らない
    unmount();
    await flush();
    expect(estimatesApi.leaveEstimateEditSession).not.toHaveBeenCalled();
  });

  it('通信エラーのときは直前の表示を保ち、通知を続ける', async () => {
    vi.mocked(estimatesApi.heartbeatEstimateEditSession).mockResolvedValue(response([OTHER]));
    const { result } = renderHook(() => useEstimateEditPresence('est-1'));
    await flush();
    expect(result.current.otherEditors).toEqual([OTHER]);

    vi.mocked(estimatesApi.heartbeatEstimateEditSession).mockRejectedValue(
      new ApiError(0, 'Network error')
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESTIMATE_EDIT_PRESENCE_HEARTBEAT_INTERVAL_MS);
    });
    expect(result.current.otherEditors).toEqual([OTHER]);

    vi.mocked(estimatesApi.heartbeatEstimateEditSession).mockResolvedValue(response([]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESTIMATE_EDIT_PRESENCE_HEARTBEAT_INTERVAL_MS);
    });
    expect(estimatesApi.heartbeatEstimateEditSession).toHaveBeenCalledTimes(3);
    expect(result.current.otherEditors).toEqual([]);
  });

  it('見積書IDが未確定の間は通知しない', async () => {
    renderHook(() => useEstimateEditPresence(undefined));
    await flush();

    expect(estimatesApi.heartbeatEstimateEditSession).not.toHaveBeenCalled();
  });
});
