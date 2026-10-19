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

    /** ApiClient の ApiError と同じ形のエラー（statusCode を持つ） */
    function errorWithStatus(statusCode: number, message: string): Error {
      return Object.assign(new Error(message), { statusCode });
    }

    it('should retry on 503 (not processed, response received) with exponential backoff', async () => {
      let attempts = 0;
      const retryMockFn = vi.fn<RefreshTokenFunction>(async () => {
        attempts++;
        if (attempts < 3) {
          throw errorWithStatus(503, 'Service Unavailable');
        }
        return 'new-access-token';
      });
      const retryManager = new TokenRefreshManager(retryMockFn);

      const token = await retryManager.refreshToken();

      // 3回目で成功（503 は処理に到達しておらず、応答を受け取っているため Cookie と食い違わない）
      expect(retryMockFn).toHaveBeenCalledTimes(3);
      expect(token).toBe('new-access-token');

      retryManager.cleanup();
    });

    /**
     * 応答を失った失敗（通信の失敗・時間切れ）では再送しない（user-authentication 要件33.6）
     *
     * backend がローテーションを確定した後に応答を失うと、ブラウザの Cookie は置き換え前のまま残る。
     * それを再送すると置き換え済みのトークンの再提示（再利用）と判定され、系列ごと失効する。
     */
    it.each([
      ['network error (statusCode 0)', () => errorWithStatus(0, 'Network error')],
      ['timeout (statusCode 0)', () => errorWithStatus(0, 'Request timeout')],
      ['network error without status', () => new Error('Failed to fetch')],
      ['500 (may fail after rotation)', () => errorWithStatus(500, 'Token refresh failed')],
      ['504 (backend may keep processing)', () => errorWithStatus(504, 'Gateway Timeout')],
    ])(
      'should not resend the refresh when the response was lost: %s',
      async (_label, makeError) => {
        const lostResponseFn = vi.fn<RefreshTokenFunction>(async () => {
          throw makeError();
        });
        const lostResponseManager = new TokenRefreshManager(lostResponseFn);

        await expect(lostResponseManager.refreshToken()).rejects.toThrow();
        expect(lostResponseFn).toHaveBeenCalledTimes(1);

        lostResponseManager.cleanup();
      }
    );

    it('should not retry on authentication errors', async () => {
      const authErrorMockFn = vi.fn<RefreshTokenFunction>(async () => {
        throw new Error('Unauthorized - token expired');
      });
      const authErrorManager = new TokenRefreshManager(authErrorMockFn);

      try {
        await authErrorManager.refreshToken();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Unauthorized - token expired');
      }

      // 認証エラーはリトライしない
      expect(authErrorMockFn).toHaveBeenCalledTimes(1);

      authErrorManager.cleanup();
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

    it('should log error when auto-refresh fails', async () => {
      const errorMockFn = vi.fn<RefreshTokenFunction>(async () => {
        throw new Error('Auto refresh failed');
      });
      const errorManager = new TokenRefreshManager(errorMockFn, {
        forceAutoRefreshInTest: true,
      });

      errorManager.scheduleAutoRefresh(15 * 60 * 1000);

      // 10分経過（5分前）
      vi.advanceTimersByTime(10 * 60 * 1000);

      // エラーがスローされてもPromise rejectionにならないことを確認
      // 少し待ってからクリーンアップ
      await vi.runAllTimersAsync();

      errorManager.cleanup();
    });

    it('should skip scheduling in test environment without forceAutoRefreshInTest', () => {
      // デフォルトのmanagerはforceAutoRefreshInTestがfalse
      manager.scheduleAutoRefresh(15 * 60 * 1000);

      // 10分経過
      vi.advanceTimersByTime(10 * 60 * 1000);

      // テスト環境ではスケジュールされないため、リフレッシュは実行されない
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

  /**
   * タブ間のリフレッシュの直列化（要件33.6, 33.10）
   *
   * 二つのタブ（同じオリジンの二つの TokenRefreshManager）が同時にリフレッシュしても、
   * Web Locks の中で一つずつ行い、後のタブは先のタブが配ったトークンを使って要求を送らない。
   * Web Locks と Broadcast Channel はブラウザと同じく非同期に振る舞う代替で差し替える
   * （配布はロックの解放より後に届きうる）。
   */
  describe('タブ間の直列化（Web Locks）', () => {
    /** 名前ごとに一つずつ、要求の順に与える排他のロック */
    class FakeLockManager {
      private tails = new Map<string, Promise<void>>();
      async request<T>(
        name: string,
        _options: { mode: 'exclusive' },
        callback: () => Promise<T>
      ): Promise<T> {
        const previous = this.tails.get(name) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>((resolve) => {
          release = resolve;
        });
        this.tails.set(
          name,
          previous.then(() => current)
        );
        await previous;
        try {
          return await callback();
        } finally {
          release();
        }
      }
    }

    /** 同じ名前の他のインスタンスへ、次のタスクで配る Broadcast Channel */
    class FakeBroadcastChannel {
      static instances: FakeBroadcastChannel[] = [];
      onmessage: ((event: MessageEvent) => void) | null = null;
      private closed = false;
      constructor(public readonly name: string) {
        FakeBroadcastChannel.instances.push(this);
      }
      postMessage(data: unknown): void {
        for (const other of FakeBroadcastChannel.instances) {
          if (other !== this && other.name === this.name && !other.closed) {
            setTimeout(() => {
              other.onmessage?.(new MessageEvent('message', { data }));
            }, 0);
          }
        }
      }
      close(): void {
        this.closed = true;
      }
    }

    beforeEach(() => {
      vi.useRealTimers();
      FakeBroadcastChannel.instances = [];
      vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
      vi.stubGlobal('navigator', { ...navigator, locks: new FakeLockManager() });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('二つのタブの同時のリフレッシュは一回の要求にまとまり、両方が同じトークンを得る', async () => {
      // 二つのタブが共有するリフレッシュの API（Cookie はブラウザで共有される）
      let issued = 0;
      const refreshApi = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        issued += 1;
        return `access-token-${issued}`;
      });

      const tabA = new TokenRefreshManager(refreshApi);
      const tabB = new TokenRefreshManager(refreshApi);
      const receivedByB = vi.fn();
      tabB.onTokenRefreshed(receivedByB);

      try {
        const [tokenA, tokenB] = await Promise.all([tabA.refreshToken(), tabB.refreshToken()]);

        expect(refreshApi).toHaveBeenCalledTimes(1);
        expect(tokenA).toBe('access-token-1');
        expect(tokenB).toBe('access-token-1');
        expect(receivedByB).toHaveBeenCalledWith('access-token-1');
      } finally {
        tabA.cleanup();
        tabB.cleanup();
      }
    });

    it('他のタブの配布が呼び出しより前に届いていたときは、改めてリフレッシュを送る', async () => {
      let issued = 0;
      const refreshApi = vi.fn(async () => {
        issued += 1;
        return `access-token-${issued}`;
      });

      const tabA = new TokenRefreshManager(refreshApi);
      const tabB = new TokenRefreshManager(refreshApi);

      try {
        await tabA.refreshToken();
        // 配布が届くのを待つ
        await new Promise((resolve) => setTimeout(resolve, 10));

        // 届いた後に始まったリフレッシュ（受け取ったトークンが拒否された等）は要求を送る
        const tokenB = await tabB.refreshToken();

        expect(refreshApi).toHaveBeenCalledTimes(2);
        expect(tokenB).toBe('access-token-2');
      } finally {
        tabA.cleanup();
        tabB.cleanup();
      }
    });
  });
});
