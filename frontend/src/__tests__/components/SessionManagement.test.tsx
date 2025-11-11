import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SessionManagement from '../../components/SessionManagement';
import type { SessionInfo } from '../../types/auth.types';

describe('SessionManagement', () => {
  const mockSessions: SessionInfo[] = [
    {
      id: 'session-1',
      userId: 'user-1',
      deviceInfo: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      expiresAt: '2025-12-31T23:59:59Z',
      createdAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'session-2',
      userId: 'user-1',
      deviceInfo: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      expiresAt: '2025-12-31T23:59:59Z',
      createdAt: '2025-01-02T00:00:00Z',
    },
  ];

  const mockFetchSessions = vi.fn();
  const mockDeleteSession = vi.fn();
  const mockDeleteAllSessions = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('セッション一覧表示', () => {
    it('セッション一覧が正しく表示される', async () => {
      mockFetchSessions.mockResolvedValueOnce(mockSessions);

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Windows PC')).toBeInTheDocument();
        expect(screen.getByText('iPhone')).toBeInTheDocument();
      });

      expect(mockFetchSessions).toHaveBeenCalledTimes(1);
    });

    it('セッションが0件の場合、メッセージが表示される', async () => {
      mockFetchSessions.mockResolvedValueOnce([]);

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('アクティブなセッションがありません')).toBeInTheDocument();
      });
    });

    it('セッション取得中、ローディングスピナーが表示される', () => {
      mockFetchSessions.mockReturnValueOnce(new Promise(() => {})); // 永続的なPromise

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      expect(screen.getByLabelText('読み込み中')).toBeInTheDocument();
      expect(screen.getByText('セッション一覧を読み込み中...')).toBeInTheDocument();
    });

    it('セッション取得失敗時、エラーメッセージが表示される', async () => {
      mockFetchSessions.mockRejectedValueOnce(new Error('ネットワークエラー'));

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('ネットワークエラー')).toBeInTheDocument();
      });
    });

    it('デバイス情報が正しくフォーマットされる', async () => {
      const sessionsWithVariousDevices: SessionInfo[] = [
        {
          id: 'session-1',
          userId: 'user-1',
          deviceInfo: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          expiresAt: '2025-12-31T23:59:59Z',
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'session-3',
          userId: 'user-1',
          deviceInfo: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          expiresAt: '2025-12-31T23:59:59Z',
          createdAt: '2025-01-02T00:00:00Z',
        },
        {
          id: 'session-4',
          userId: 'user-1',
          deviceInfo: 'Mozilla/5.0 (X11; Linux x86_64)',
          expiresAt: '2025-12-31T23:59:59Z',
          createdAt: '2025-01-03T00:00:00Z',
        },
        {
          id: 'session-5',
          userId: 'user-1',
          deviceInfo: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)',
          expiresAt: '2025-12-31T23:59:59Z',
          createdAt: '2025-01-04T00:00:00Z',
        },
        {
          id: 'session-6',
          userId: 'user-1',
          deviceInfo: 'Mozilla/5.0 (Linux; Android 11; Pixel 5)',
          expiresAt: '2025-12-31T23:59:59Z',
          createdAt: '2025-01-05T00:00:00Z',
        },
      ];

      mockFetchSessions.mockResolvedValueOnce(sessionsWithVariousDevices);

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Windows PC')).toBeInTheDocument();
        expect(screen.getByText('Mac')).toBeInTheDocument();
        expect(screen.getByText('Linux PC')).toBeInTheDocument();
        expect(screen.getByText('iPad')).toBeInTheDocument();
        expect(screen.getByText('Android')).toBeInTheDocument();
      });
    });

    it('デバイス情報がない場合、「不明なデバイス」と表示される', async () => {
      const sessionsWithoutDeviceInfo: SessionInfo[] = [
        {
          id: 'session-1',
          userId: 'user-1',
          deviceInfo: undefined,
          expiresAt: '2025-12-31T23:59:59Z',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ];

      mockFetchSessions.mockResolvedValueOnce(sessionsWithoutDeviceInfo);

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('不明なデバイス')).toBeInTheDocument();
      });
    });
  });

  describe('個別セッション削除', () => {
    it('ログアウトボタンクリックで個別セッションが削除される', async () => {
      const user = userEvent.setup();
      mockFetchSessions.mockResolvedValueOnce(mockSessions);
      mockDeleteSession.mockResolvedValueOnce(undefined);

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Windows PC')).toBeInTheDocument();
      });

      const logoutButtons = screen.getAllByRole('button', { name: /ログアウト/ });
      expect(logoutButtons.length).toBeGreaterThan(0);
      await user.click(logoutButtons[0]!);

      await waitFor(() => {
        expect(mockDeleteSession).toHaveBeenCalledWith('session-1');
        expect(screen.getByText('セッションを削除しました')).toBeInTheDocument();
      });
    });

    it('セッション削除中、ボタンが無効化される', async () => {
      const user = userEvent.setup();
      mockFetchSessions.mockResolvedValueOnce(mockSessions);
      mockDeleteSession.mockReturnValueOnce(new Promise(() => {})); // 永続的なPromise

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Windows PC')).toBeInTheDocument();
      });

      const logoutButtons = screen.getAllByRole('button', { name: /ログアウト/ });
      expect(logoutButtons.length).toBeGreaterThan(0);
      await user.click(logoutButtons[0]!);

      await waitFor(() => {
        const deletingButton = screen.getByRole('button', { name: '削除中...' });
        expect(deletingButton).toBeInTheDocument();
        expect(deletingButton).toBeDisabled();
      });
    });

    it('セッション削除失敗時、エラーメッセージが表示される', async () => {
      const user = userEvent.setup();
      mockFetchSessions.mockResolvedValueOnce(mockSessions);
      mockDeleteSession.mockRejectedValueOnce(new Error('削除に失敗しました'));

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Windows PC')).toBeInTheDocument();
      });

      const logoutButtons = screen.getAllByRole('button', { name: /ログアウト/ });
      expect(logoutButtons.length).toBeGreaterThan(0);
      await user.click(logoutButtons[0]!);

      await waitFor(() => {
        expect(screen.getByText('削除に失敗しました')).toBeInTheDocument();
      });
    });
  });

  describe('全デバイスログアウト', () => {
    it('全デバイスログアウトボタンが表示される', async () => {
      mockFetchSessions.mockResolvedValueOnce(mockSessions);

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: '全デバイスからログアウト' })
        ).toBeInTheDocument();
      });
    });

    it('セッションが0件の場合、全デバイスログアウトボタンが無効化される', async () => {
      mockFetchSessions.mockResolvedValueOnce([]);

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      await waitFor(() => {
        const deleteAllButton = screen.getByRole('button', { name: '全デバイスからログアウト' });
        expect(deleteAllButton).toBeInTheDocument();
        expect(deleteAllButton).toBeDisabled();
      });
    });

    it('全デバイスログアウトボタンクリックで確認ダイアログが表示される', async () => {
      const user = userEvent.setup();
      mockFetchSessions.mockResolvedValueOnce(mockSessions);

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Windows PC')).toBeInTheDocument();
      });

      const deleteAllButton = screen.getByRole('button', {
        name: '全デバイスからログアウト',
      });
      await user.click(deleteAllButton);

      expect(screen.getByText('全デバイスログアウトの確認')).toBeInTheDocument();
      expect(screen.getByText(/全てのデバイスからログアウトします/)).toBeInTheDocument();
    });

    it('確認ダイアログで「キャンセル」をクリックすると、ダイアログが閉じる', async () => {
      const user = userEvent.setup();
      mockFetchSessions.mockResolvedValueOnce(mockSessions);

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Windows PC')).toBeInTheDocument();
      });

      const deleteAllButton = screen.getByRole('button', {
        name: '全デバイスからログアウト',
      });
      await user.click(deleteAllButton);

      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      expect(screen.queryByText('全デバイスログアウトの確認')).not.toBeInTheDocument();
      expect(mockDeleteAllSessions).not.toHaveBeenCalled();
    });

    it('確認ダイアログで「ログアウト」をクリックすると、全デバイスログアウトが実行される', async () => {
      const user = userEvent.setup();
      mockFetchSessions.mockResolvedValueOnce(mockSessions);
      mockDeleteAllSessions.mockResolvedValueOnce(undefined);

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Windows PC')).toBeInTheDocument();
      });

      const deleteAllButton = screen.getByRole('button', {
        name: '全デバイスからログアウト',
      });
      await user.click(deleteAllButton);

      const logoutButtons = screen.getAllByRole('button', { name: 'ログアウト' });
      // 最後の「ログアウト」ボタンがダイアログ内のもの
      expect(logoutButtons.length).toBeGreaterThan(0);
      await user.click(logoutButtons[logoutButtons.length - 1]!);

      await waitFor(() => {
        expect(mockDeleteAllSessions).toHaveBeenCalled();
      });
    });

    it('全デバイスログアウト失敗時、エラーメッセージが表示される', async () => {
      const user = userEvent.setup();
      mockFetchSessions.mockResolvedValueOnce(mockSessions);
      mockDeleteAllSessions.mockRejectedValueOnce(new Error('全デバイスログアウトに失敗しました'));

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Windows PC')).toBeInTheDocument();
      });

      const deleteAllButton = screen.getByRole('button', {
        name: '全デバイスからログアウト',
      });
      await user.click(deleteAllButton);

      const logoutButtons = screen.getAllByRole('button', { name: 'ログアウト' });
      expect(logoutButtons.length).toBeGreaterThan(0);
      await user.click(logoutButtons[logoutButtons.length - 1]!);

      await waitFor(() => {
        expect(screen.getByText('全デバイスログアウトに失敗しました')).toBeInTheDocument();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('エラーメッセージがaria-liveで通知される', async () => {
      mockFetchSessions.mockRejectedValueOnce(new Error('エラーが発生しました'));

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      await waitFor(() => {
        const errorAlert = screen.getByRole('alert');
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert).toHaveAttribute('aria-live', 'polite');
      });
    });

    it('確認ダイアログがaria-modal属性を持つ', async () => {
      const user = userEvent.setup();
      mockFetchSessions.mockResolvedValueOnce(mockSessions);

      render(
        <SessionManagement
          onFetchSessions={mockFetchSessions}
          onDeleteSession={mockDeleteSession}
          onDeleteAllSessions={mockDeleteAllSessions}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Windows PC')).toBeInTheDocument();
      });

      const deleteAllButton = screen.getByRole('button', {
        name: '全デバイスからログアウト',
      });
      await user.click(deleteAllButton);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });
  });
});
