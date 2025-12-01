/**
 * セッション管理画面のテスト
 *
 * 要件8: セッション管理
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Sessions } from '../../pages/Sessions';
import type { SessionInfo, UserProfile } from '../../types/auth.types';

// API clientをモック
vi.mock('../../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    delete: vi.fn(),
    post: vi.fn(),
  },
}));

// useAuthフックをモック
const mockLogout = vi.fn();
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'user-123',
      email: 'test@example.com',
      displayName: 'Test User',
      roles: ['user'],
      createdAt: '2025-01-01T00:00:00Z',
      twoFactorEnabled: false,
    } as UserProfile,
    logout: mockLogout,
    isInitialized: true,
    isAuthenticated: true,
  }),
}));

describe('Sessions Component', () => {
  const mockSessions: SessionInfo[] = [
    {
      id: 'session-1',
      userId: 'user-123',
      deviceInfo: 'Chrome on Windows',
      expiresAt: '2025-01-08T00:00:00Z',
      createdAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'session-2',
      userId: 'user-123',
      deviceInfo: 'Safari on iOS',
      expiresAt: '2025-01-08T00:00:00Z',
      createdAt: '2025-01-01T12:00:00Z',
    },
    {
      id: 'session-3',
      userId: 'user-123',
      deviceInfo: 'Firefox on Linux',
      expiresAt: '2025-01-08T00:00:00Z',
      createdAt: '2025-01-02T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('セッション一覧表示', () => {
    it('アクティブデバイス一覧を表示する（要件8.3）', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue({ sessions: mockSessions });

      render(<Sessions />);

      // セッション一覧が表示されるまで待機
      await waitFor(() => {
        expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
      });

      // 全てのセッションが表示される
      expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
      expect(screen.getByText('Safari on iOS')).toBeInTheDocument();
      expect(screen.getByText('Firefox on Linux')).toBeInTheDocument();
    });

    it('セッション情報（デバイス情報、作成日時、有効期限）を表示する（要件8.1）', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue({ sessions: mockSessions });

      render(<Sessions />);

      await waitFor(() => {
        expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
      });

      // デバイス情報
      expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();

      // 作成日時（2025-01-01のいずれかの形式で表示される）
      const createdDates = screen.getAllByText(/2025.*1.*1|1.*1.*2025/);
      expect(createdDates.length).toBeGreaterThan(0);

      // 有効期限（2025-01-08のいずれかの形式で表示される）
      const expiredDates = screen.getAllByText(/2025.*1.*8|1.*8.*2025/);
      expect(expiredDates.length).toBeGreaterThan(0);
    });

    it('現在のデバイスを識別する', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue({ sessions: mockSessions });

      render(<Sessions />);

      await waitFor(() => {
        expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
      });

      // 現在のデバイスに「現在のデバイス」バッジが表示される
      expect(screen.getByText(/現在のデバイス|このデバイス/i)).toBeInTheDocument();
    });
  });

  describe('個別デバイスログアウト', () => {
    it('個別デバイスのログアウトボタンを表示する（要件8.4）', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue({ sessions: mockSessions });

      render(<Sessions />);

      await waitFor(() => {
        expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
      });

      // 各セッションにログアウトボタンが表示される（現在のデバイスを除く）
      const logoutButtons = screen.getAllByRole('button', { name: /ログアウト|削除/i });
      expect(logoutButtons.length).toBeGreaterThan(0);
    });

    it('個別デバイスログアウトボタンクリック時に確認ダイアログを表示する', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue({ sessions: mockSessions });

      render(<Sessions />);

      await waitFor(() => {
        expect(screen.getByText('Safari on iOS')).toBeInTheDocument();
      });

      // Safari on iOSのログアウトボタンをクリック（最初の非現在デバイス）
      const logoutButtons = screen.getAllByLabelText('ログアウト');
      await user.click(logoutButtons[0]!);

      // 確認ダイアログが表示される
      await waitFor(() => {
        expect(screen.getByText(/このデバイスをログアウトしますか/i)).toBeInTheDocument();
      });
    });

    it('個別デバイスログアウトが成功する（要件8.4）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');

      // 初回: 全セッション取得
      vi.mocked(apiClient.get).mockResolvedValueOnce({ sessions: mockSessions });

      // ログアウト成功
      vi.mocked(apiClient.delete).mockResolvedValueOnce({ message: 'ログアウトしました' });

      // 2回目: ログアウト後のセッション取得（1つ減る）
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        sessions: [mockSessions[0], mockSessions[2]],
      });

      render(<Sessions />);

      await waitFor(() => {
        expect(screen.getByText('Safari on iOS')).toBeInTheDocument();
      });

      // ログアウトボタンをクリック
      const logoutButtons = screen.getAllByLabelText('ログアウト');
      await user.click(logoutButtons[0]!);

      // 確認ダイアログで「はい、ログアウト」をクリック
      const confirmButton = await screen.findByText('はい、ログアウト');
      await user.click(confirmButton);

      // 成功メッセージが表示される
      await waitFor(() => {
        expect(screen.getByText(/ログアウトしました/i)).toBeInTheDocument();
      });

      // Safari on iOSのセッションが表示されなくなる
      await waitFor(() => {
        expect(screen.queryByText('Safari on iOS')).not.toBeInTheDocument();
      });
    });
  });

  describe('全デバイスログアウト', () => {
    it('全デバイスログアウトボタンを表示する（要件8.5）', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue({ sessions: mockSessions });

      render(<Sessions />);

      await waitFor(() => {
        expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
      });

      // 全デバイスログアウトボタンが表示される
      expect(screen.getByRole('button', { name: /全デバイスからログアウト/i })).toBeInTheDocument();
    });

    it('全デバイスログアウトボタンクリック時に確認ダイアログを表示する', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue({ sessions: mockSessions });

      render(<Sessions />);

      await waitFor(() => {
        expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
      });

      // 全デバイスログアウトボタンをクリック
      const logoutAllButton = screen.getByRole('button', { name: /全デバイスからログアウト/i });
      await user.click(logoutAllButton);

      // 確認ダイアログが表示される
      await waitFor(() => {
        expect(screen.getByText(/全てのデバイスからログアウトしますか/i)).toBeInTheDocument();
      });
    });

    it('全デバイスログアウトが成功する（要件8.5）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue({ sessions: mockSessions });
      vi.mocked(apiClient.post).mockResolvedValue({ message: '全デバイスからログアウトしました' });

      render(<Sessions />);

      await waitFor(() => {
        expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
      });

      // 全デバイスログアウトボタンをクリック
      const logoutAllButton = screen.getByRole('button', { name: /全デバイスからログアウト/i });
      await user.click(logoutAllButton);

      // 確認ダイアログで「はい」をクリック
      const confirmButton = await screen.findByRole('button', { name: /はい|確認|実行/i });
      if (confirmButton) {
        await user.click(confirmButton);
      }

      // ログアウトが呼ばれる（ログイン画面へリダイレクト）
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('セッション取得失敗時にエラーメッセージを表示する', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockRejectedValue({
        statusCode: 500,
        message: 'サーバーエラー',
      });

      render(<Sessions />);

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText(/セッション情報を取得できませんでした/i)).toBeInTheDocument();
      });
    });

    it('ログアウト失敗時にエラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue({ sessions: mockSessions });
      vi.mocked(apiClient.delete).mockRejectedValueOnce({
        statusCode: 500,
        message: 'ログアウト失敗',
      });

      render(<Sessions />);

      await waitFor(() => {
        expect(screen.getByText('Safari on iOS')).toBeInTheDocument();
      });

      // ログアウトボタンをクリック
      const logoutButtons = screen.getAllByLabelText('ログアウト');
      await user.click(logoutButtons[0]!);

      // 確認ダイアログで「はい、ログアウト」をクリック
      const confirmButton = await screen.findByText('はい、ログアウト');
      await user.click(confirmButton);

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText(/ログアウトに失敗しました/i)).toBeInTheDocument();
      });
    });
  });

  describe('レスポンシブデザイン', () => {
    it('モバイル最適化レイアウトを適用する', async () => {
      // モバイルビューポートをシミュレート（768px未満）
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue({ sessions: mockSessions });

      render(<Sessions />);

      // モバイル最適化されたレイアウトクラスが適用されている
      const container = screen.getByTestId('sessions-container');
      expect(container).toHaveClass('mobile-optimized');
    });
  });

  describe('アクセシビリティ', () => {
    it('適切なaria属性が設定されている', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue({ sessions: mockSessions });

      render(<Sessions />);

      await waitFor(() => {
        expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
      });

      // ボタンにアクセシブルな名前が設定されている
      const logoutAllButton = screen.getByRole('button', { name: /全デバイスからログアウト/i });
      expect(logoutAllButton).toHaveAccessibleName();
    });

    it('エラーメッセージがaria-liveリージョンで通知される', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockRejectedValue({
        statusCode: 500,
        message: 'サーバーエラー',
      });

      render(<Sessions />);

      // エラーメッセージがaria-liveリージョンで通知される
      await waitFor(() => {
        const errorMessage = screen.getByRole('alert');
        expect(errorMessage).toHaveAttribute('aria-live', 'polite');
      });
    });
  });
});
