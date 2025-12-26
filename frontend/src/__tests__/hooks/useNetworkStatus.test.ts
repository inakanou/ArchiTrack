import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNetworkStatus, NetworkStatus } from '../../hooks/useNetworkStatus';

/**
 * useNetworkStatusフックの単体テスト
 *
 * Task 18.4: ネットワーク状態監視
 *
 * @see design.md - AutoSaveManager - ネットワーク状態管理フロー
 * @see requirements.md - 要件13.6
 */
describe('useNetworkStatus', () => {
  // navigator.onLineのモック
  let originalOnLine: boolean;

  // イベントリスナーを追跡
  const onlineListeners: Array<() => void> = [];
  const offlineListeners: Array<() => void> = [];

  beforeEach(() => {
    // navigator.onLineの元の値を保存
    originalOnLine = navigator.onLine;

    // navigator.onLineをモック
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    // イベントリスナーのモック
    vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'online') {
        onlineListeners.push(handler as () => void);
      } else if (event === 'offline') {
        offlineListeners.push(handler as () => void);
      }
    });

    vi.spyOn(window, 'removeEventListener').mockImplementation((event, handler) => {
      if (event === 'online') {
        const index = onlineListeners.indexOf(handler as () => void);
        if (index > -1) onlineListeners.splice(index, 1);
      } else if (event === 'offline') {
        const index = offlineListeners.indexOf(handler as () => void);
        if (index > -1) offlineListeners.splice(index, 1);
      }
    });
  });

  afterEach(() => {
    // 元の値を復元
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      writable: true,
      configurable: true,
    });

    // リスナーをクリア
    onlineListeners.length = 0;
    offlineListeners.length = 0;

    vi.restoreAllMocks();
  });

  describe('初期状態', () => {
    it('navigator.onLineがtrueの場合、オンライン状態で初期化される', () => {
      Object.defineProperty(navigator, 'onLine', { value: true });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isOnline).toBe(true);
      expect(result.current.status).toBe('online');
    });

    it('navigator.onLineがfalseの場合、オフライン状態で初期化される', () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isOnline).toBe(false);
      expect(result.current.status).toBe('offline');
    });
  });

  describe('イベントリスナー登録', () => {
    it('マウント時にonlineイベントリスナーを登録する', () => {
      renderHook(() => useNetworkStatus());

      expect(window.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    });

    it('マウント時にofflineイベントリスナーを登録する', () => {
      renderHook(() => useNetworkStatus());

      expect(window.addEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
    });

    it('アンマウント時にイベントリスナーを解除する', () => {
      const { unmount } = renderHook(() => useNetworkStatus());

      unmount();

      expect(window.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
      expect(window.removeEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
    });
  });

  describe('オンライン/オフライン切り替え', () => {
    it('offlineイベント発火でisOnlineがfalseになる', () => {
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isOnline).toBe(true);

      // オフラインイベントを発火
      act(() => {
        Object.defineProperty(navigator, 'onLine', { value: false });
        offlineListeners.forEach((listener) => listener());
      });

      expect(result.current.isOnline).toBe(false);
      expect(result.current.status).toBe('offline');
    });

    it('onlineイベント発火でisOnlineがtrueになる', () => {
      // オフライン状態で開始
      Object.defineProperty(navigator, 'onLine', { value: false });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isOnline).toBe(false);

      // オンラインイベントを発火
      act(() => {
        Object.defineProperty(navigator, 'onLine', { value: true });
        onlineListeners.forEach((listener) => listener());
      });

      expect(result.current.isOnline).toBe(true);
      expect(result.current.status).toBe('online');
    });
  });

  describe('状態変更コールバック', () => {
    it('オフラインになったときにonOfflineコールバックが呼ばれる', () => {
      const onOffline = vi.fn();

      renderHook(() => useNetworkStatus({ onOffline }));

      // オフラインイベントを発火
      act(() => {
        Object.defineProperty(navigator, 'onLine', { value: false });
        offlineListeners.forEach((listener) => listener());
      });

      expect(onOffline).toHaveBeenCalledTimes(1);
    });

    it('オンラインになったときにonOnlineコールバックが呼ばれる', () => {
      // オフライン状態で開始
      Object.defineProperty(navigator, 'onLine', { value: false });

      const onOnline = vi.fn();

      renderHook(() => useNetworkStatus({ onOnline }));

      // オンラインイベントを発火
      act(() => {
        Object.defineProperty(navigator, 'onLine', { value: true });
        onlineListeners.forEach((listener) => listener());
      });

      expect(onOnline).toHaveBeenCalledTimes(1);
    });

    it('状態が変わらない場合、コールバックは呼ばれない', () => {
      const onOnline = vi.fn();
      const onOffline = vi.fn();

      renderHook(() => useNetworkStatus({ onOnline, onOffline }));

      // 初期状態がオンラインなので、オンラインコールバックは呼ばれない
      expect(onOnline).not.toHaveBeenCalled();
      expect(onOffline).not.toHaveBeenCalled();
    });
  });

  describe('状態変更履歴', () => {
    it('オフラインになった時刻が記録される', () => {
      vi.useFakeTimers();
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const { result } = renderHook(() => useNetworkStatus());

      // オフラインイベントを発火
      act(() => {
        Object.defineProperty(navigator, 'onLine', { value: false });
        offlineListeners.forEach((listener) => listener());
      });

      expect(result.current.lastOfflineAt).toEqual(now);

      vi.useRealTimers();
    });

    it('オンラインに復帰した時刻が記録される', () => {
      vi.useFakeTimers();
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      // オフライン状態で開始
      Object.defineProperty(navigator, 'onLine', { value: false });

      const { result } = renderHook(() => useNetworkStatus());

      // オンラインイベントを発火
      act(() => {
        Object.defineProperty(navigator, 'onLine', { value: true });
        onlineListeners.forEach((listener) => listener());
      });

      expect(result.current.lastOnlineAt).toEqual(now);

      vi.useRealTimers();
    });
  });

  describe('オフライン期間の計算', () => {
    it('オフライン中は経過時間が計算できる', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));

      const { result } = renderHook(() => useNetworkStatus());

      // オフラインイベントを発火
      act(() => {
        Object.defineProperty(navigator, 'onLine', { value: false });
        offlineListeners.forEach((listener) => listener());
      });

      // 5分経過
      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(result.current.getOfflineDuration()).toBe(5 * 60 * 1000);

      vi.useRealTimers();
    });

    it('オンライン中は経過時間が0', () => {
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.getOfflineDuration()).toBe(0);
    });
  });

  describe('保存可能判定', () => {
    it('オンライン時は保存可能', () => {
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.canSave).toBe(true);
    });

    it('オフライン時は保存不可', () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.canSave).toBe(false);
    });
  });

  describe('警告メッセージ', () => {
    it('オフライン時は警告メッセージが設定される', () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.warningMessage).toBe(
        'ネットワーク接続がありません。保存操作は接続復帰後に行えます。'
      );
    });

    it('オンライン時は警告メッセージがnull', () => {
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.warningMessage).toBeNull();
    });
  });

  describe('statusプロパティ', () => {
    it('オンライン時はonlineを返す', () => {
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.status).toBe('online');
    });

    it('オフライン時はofflineを返す', () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.status).toBe('offline');
    });
  });

  describe('NetworkStatus型', () => {
    it('正しい型が返される', () => {
      const { result } = renderHook(() => useNetworkStatus());

      // 型チェック（TypeScriptコンパイル時に検証）
      const status: NetworkStatus = result.current.status;
      expect(['online', 'offline']).toContain(status);
    });
  });
});
