import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenRefreshManager, RefreshTokenFunction } from '../../services/TokenRefreshManager';

describe('TokenRefreshManager', () => {
  let manager: TokenRefreshManager;
  let mockRefreshFn: ReturnType<typeof vi.fn<RefreshTokenFunction>>;

  beforeEach(() => {
    // モックのリフレッシュ関数を作成
    mockRefreshFn = vi.fn<RefreshTokenFunction>(async () => 'new-access-token');
    manager = new TokenRefreshManager(mockRefreshFn);

    // タイマーをモック化
    vi.useFakeTimers();
  });

  afterEach(() => {
    // クリーンアップ
    manager.cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('refreshToken', () => {
    it('should call the refresh function and return the new access token', async () => {
      const token = await manager.refreshToken();

      expect(mockRefreshFn).toHaveBeenCalledTimes(1);
      expect(token).toBe('new-access-token');
    });

    it('should share a single Promise across concurrent calls (Race Condition protection)', async () => {
      // 3つの同時呼び出しを実行
      const [token1, token2, token3] = await Promise.all([
        manager.refreshToken(),
        manager.refreshToken(),
        manager.refreshToken(),
      ]);

      // リフレッシュ関数は1回のみ呼ばれる
      expect(mockRefreshFn).toHaveBeenCalledTimes(1);
      // すべての呼び出しが同じトークンを返す
      expect(token1).toBe('new-access-token');
      expect(token2).toBe('new-access-token');
      expect(token3).toBe('new-access-token');
    });

    it('should reset the shared Promise after completion', async () => {
      // 1回目のリフレッシュ
      await manager.refreshToken();
      expect(mockRefreshFn).toHaveBeenCalledTimes(1);

      // 2回目のリフレッシュ（新しいPromiseが作成される）
      await manager.refreshToken();
      expect(mockRefreshFn).toHaveBeenCalledTimes(2);
    });

    it('should handle refresh function errors', async () => {
      const errorMockFn = vi.fn<RefreshTokenFunction>(async () => {
        throw new Error('Refresh failed');
      });
      const errorManager = new TokenRefreshManager(errorMockFn);

      try {
        await errorManager.refreshToken();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Refresh failed');
      } finally {
        errorManager.cleanup();
      }
    });
  });

  describe('scheduleAutoRefresh', () => {
    // scheduleAutoRefreshのテストでは、テスト環境でも自動リフレッシュを有効化
    let autoRefreshManager: TokenRefreshManager;

    beforeEach(() => {
      autoRefreshManager = new TokenRefreshManager(mockRefreshFn, {
        forceAutoRefreshInTest: true,
      });
    });

    afterEach(() => {
      autoRefreshManager.cleanup();
    });

    it('should schedule auto-refresh 5 minutes before expiry', () => {
      const expiresIn = 15 * 60 * 1000; // 15分

      autoRefreshManager.scheduleAutoRefresh(expiresIn);

      // 9分59秒経過（5分前の直前）
      vi.advanceTimersByTime(9 * 60 * 1000 + 59 * 1000);
      expect(mockRefreshFn).not.toHaveBeenCalled();

      // 10分経過（5分前）
      vi.advanceTimersByTime(1000);
      expect(mockRefreshFn).toHaveBeenCalledTimes(1);
    });

    it('should cancel previous auto-refresh when a new one is scheduled', () => {
      // 1回目のスケジュール
      autoRefreshManager.scheduleAutoRefresh(15 * 60 * 1000);

      // 2回目のスケジュール（1回目をキャンセル）
      autoRefreshManager.scheduleAutoRefresh(15 * 60 * 1000);

      // 10分経過
      vi.advanceTimersByTime(10 * 60 * 1000);

      // 1回のみ実行される（2回目のスケジュールのみ）
      expect(mockRefreshFn).toHaveBeenCalledTimes(1);
    });

    it('should not schedule auto-refresh if expiresIn is less than 5 minutes', () => {
      autoRefreshManager.scheduleAutoRefresh(4 * 60 * 1000); // 4分

      // 4分経過
      vi.advanceTimersByTime(4 * 60 * 1000);

      // リフレッシュが実行されない
      expect(mockRefreshFn).not.toHaveBeenCalled();
    });
  });

  describe('Broadcast Channel (Multi-tab sync)', () => {
    it('should send TOKEN_REFRESHED message after successful refresh', async () => {
      // BroadcastChannelのモック
      const mockPostMessage = vi.fn();
      const mockClose = vi.fn();
      // @ts-expect-error - モック用に上書き
      manager['broadcastChannel'] = { postMessage: mockPostMessage, close: mockClose };

      await manager.refreshToken();

      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'TOKEN_REFRESHED',
        accessToken: 'new-access-token',
      });
    });

    it('should handle TOKEN_REFRESHED message from other tabs', () => {
      const mockOnTokenRefreshed = vi.fn();
      manager.onTokenRefreshed(mockOnTokenRefreshed);

      // 他のタブからのメッセージをシミュレート
      const event = new MessageEvent('message', {
        data: {
          type: 'TOKEN_REFRESHED',
          accessToken: 'token-from-other-tab',
        },
      });

      // @ts-expect-error - テスト用にonmessageを直接呼び出し
      manager['broadcastChannel'].onmessage(event);

      expect(mockOnTokenRefreshed).toHaveBeenCalledWith('token-from-other-tab');
    });

    it('should ignore messages with unknown type', () => {
      const mockOnTokenRefreshed = vi.fn();
      manager.onTokenRefreshed(mockOnTokenRefreshed);

      // 不明なタイプのメッセージをシミュレート
      const event = new MessageEvent('message', {
        data: {
          type: 'UNKNOWN_TYPE',
          accessToken: 'some-token',
        },
      });

      // @ts-expect-error - テスト用にonmessageを直接呼び出し
      manager['broadcastChannel'].onmessage(event);

      // コールバックは呼ばれない
      expect(mockOnTokenRefreshed).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should cancel auto-refresh timer and close Broadcast Channel', () => {
      manager.scheduleAutoRefresh(15 * 60 * 1000);

      const mockClose = vi.fn();
      // @ts-expect-error - モック用に上書き
      manager['broadcastChannel'] = { close: mockClose };

      manager.cleanup();

      // タイマー実行後もリフレッシュされない
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(mockRefreshFn).not.toHaveBeenCalled();

      // BroadcastChannelがクローズされる
      expect(mockClose).toHaveBeenCalled();
    });
  });
});
