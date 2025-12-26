import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { NetworkStatusIndicator } from '../../components/NetworkStatusIndicator';

/**
 * NetworkStatusIndicatorコンポーネントの単体テスト
 *
 * Task 18.4: ネットワーク状態監視 - UI表示
 *
 * @see design.md - ネットワーク状態管理フロー
 * @see requirements.md - 要件13.6
 */
describe('NetworkStatusIndicator', () => {
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

  describe('オンライン時の表示', () => {
    it('オンライン時は何も表示しない（デフォルト）', () => {
      const { container } = render(<NetworkStatusIndicator />);

      // 何も表示されていないはず
      expect(container.firstChild).toBeNull();
    });

    it('showOnlineがtrueの場合、オンライン表示を出す', () => {
      render(<NetworkStatusIndicator showOnline />);

      expect(screen.getByText('オンライン')).toBeInTheDocument();
    });
  });

  describe('オフライン時の表示', () => {
    it('オフライン時は警告バナーを表示する', () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      render(<NetworkStatusIndicator />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(
        screen.getByText('ネットワーク接続がありません。保存操作は接続復帰後に行えます。')
      ).toBeInTheDocument();
    });

    it('警告バナーにアイコンが表示される', () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      render(<NetworkStatusIndicator />);

      // alert role内にSVGアイコンがあることを確認
      const alert = screen.getByRole('alert');
      expect(alert.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('状態変更時の表示更新', () => {
    it('オフラインになったとき警告が表示される', async () => {
      const { container } = render(<NetworkStatusIndicator />);

      // 初期状態：何も表示されない
      expect(container.firstChild).toBeNull();

      // オフラインイベントを発火
      act(() => {
        Object.defineProperty(navigator, 'onLine', { value: false });
        offlineListeners.forEach((listener) => listener());
      });

      // 警告が表示される
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('オンラインに復帰したとき警告が消える', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      render(<NetworkStatusIndicator />);

      // 初期状態：警告が表示されている
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // オンラインイベントを発火
      act(() => {
        Object.defineProperty(navigator, 'onLine', { value: true });
        onlineListeners.forEach((listener) => listener());
      });

      // 警告が消える
      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });
  });

  describe('コールバック', () => {
    it('onOfflineコールバックが呼ばれる', () => {
      const onOffline = vi.fn();

      render(<NetworkStatusIndicator onOffline={onOffline} />);

      // オフラインイベントを発火
      act(() => {
        Object.defineProperty(navigator, 'onLine', { value: false });
        offlineListeners.forEach((listener) => listener());
      });

      expect(onOffline).toHaveBeenCalledTimes(1);
    });

    it('onOnlineコールバックが呼ばれる', () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      const onOnline = vi.fn();

      render(<NetworkStatusIndicator onOnline={onOnline} />);

      // オンラインイベントを発火
      act(() => {
        Object.defineProperty(navigator, 'onLine', { value: true });
        onlineListeners.forEach((listener) => listener());
      });

      expect(onOnline).toHaveBeenCalledTimes(1);
    });
  });

  describe('アクセシビリティ', () => {
    it('警告バナーにrole=alertが設定されている', () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      render(<NetworkStatusIndicator />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('警告バナーにaria-live=politeが設定されている', () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      render(<NetworkStatusIndicator />);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('カスタムスタイル', () => {
    it('classNameプロパティが適用される', () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      render(<NetworkStatusIndicator className="custom-class" />);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('custom-class');
    });
  });

  describe('カスタムメッセージ', () => {
    it('offlineMessageプロパティでメッセージをカスタマイズできる', () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      render(<NetworkStatusIndicator offlineMessage="接続が切れています" />);

      expect(screen.getByText('接続が切れています')).toBeInTheDocument();
    });
  });

  describe('復帰通知', () => {
    it('showReconnectedがtrueで復帰時に通知が表示される', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      render(<NetworkStatusIndicator showReconnected />);

      // オンラインイベントを発火
      act(() => {
        Object.defineProperty(navigator, 'onLine', { value: true });
        onlineListeners.forEach((listener) => listener());
      });

      // 復帰通知が表示される
      await waitFor(() => {
        expect(screen.getByText('ネットワーク接続が復帰しました')).toBeInTheDocument();
      });
    });

    it('復帰通知は一定時間後に消える', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      Object.defineProperty(navigator, 'onLine', { value: false });

      render(<NetworkStatusIndicator showReconnected reconnectedDuration={3000} />);

      // オンラインイベントを発火
      act(() => {
        Object.defineProperty(navigator, 'onLine', { value: true });
        onlineListeners.forEach((listener) => listener());
      });

      // 復帰通知が表示される
      expect(screen.getByText('ネットワーク接続が復帰しました')).toBeInTheDocument();

      // 3秒経過
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      // 通知が消える
      expect(screen.queryByText('ネットワーク接続が復帰しました')).not.toBeInTheDocument();

      vi.useRealTimers();
    });
  });
});
