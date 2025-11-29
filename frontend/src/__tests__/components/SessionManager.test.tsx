import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SessionManager from '../../components/SessionManager';
import type { Session } from '../../types/session.types';

describe('SessionManager', () => {
  const mockSessions: Session[] = [
    {
      id: '1',
      deviceInfo: 'Chrome on Windows',
      ipAddress: '192.168.1.100',
      createdAt: '2025-01-01T00:00:00Z',
      expiresAt: '2025-01-08T00:00:00Z',
      lastActivityAt: '2025-01-02T00:00:00Z',
      isCurrent: true,
    },
    {
      id: '2',
      deviceInfo: 'Safari on macOS',
      ipAddress: '192.168.1.101',
      createdAt: '2024-12-25T00:00:00Z',
      expiresAt: '2025-01-01T00:00:00Z',
      lastActivityAt: '2024-12-26T00:00:00Z',
      isCurrent: false,
    },
  ];

  const mockOnDeleteSession = vi.fn();
  const mockOnDeleteAllSessions = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('アクティブセッション一覧を表示する', () => {
    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    expect(screen.getByText(/Chrome on Windows/i)).toBeInTheDocument();
    expect(screen.getByText(/Safari on macOS/i)).toBeInTheDocument();
  });

  it('現在のセッションにバッジを表示する', () => {
    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    expect(screen.getByText(/現在のセッション/i)).toBeInTheDocument();
  });

  it('デバイス情報を表示する', () => {
    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    expect(screen.getByText(/Chrome on Windows/i)).toBeInTheDocument();
    expect(screen.getByText(/Safari on macOS/i)).toBeInTheDocument();
  });

  it('セッション作成日時を表示する', () => {
    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    expect(screen.getByText(/2025-01-01/)).toBeInTheDocument();
    expect(screen.getByText(/2024-12-25/)).toBeInTheDocument();
  });

  it('IPアドレスを表示する', () => {
    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    expect(screen.getByText(/192\.168\.1\.100/)).toBeInTheDocument();
    expect(screen.getByText(/192\.168\.1\.101/)).toBeInTheDocument();
  });

  it('個別ログアウトボタンを表示する（現在のセッション以外）', () => {
    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    // 個別ログアウトボタンを検索（現在のセッション以外）
    const individualLogoutButton = screen.getByLabelText(/Safari on macOSからログアウト/i);
    expect(individualLogoutButton).toBeInTheDocument();

    // 全デバイスログアウトボタンも存在する
    const allDevicesButton = screen.getByLabelText(/全デバイスからログアウト/i);
    expect(allDevicesButton).toBeInTheDocument();
  });

  it('個別ログアウトボタンをクリックすると確認ダイアログを表示する', async () => {
    const user = userEvent.setup();
    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    const logoutButton = screen.getByLabelText(/Safari on macOSからログアウト/i);
    await user.click(logoutButton);

    expect(screen.getByText(/このデバイス.*をログアウトしますか/i)).toBeInTheDocument();
  });

  it('個別ログアウト確認時に削除が呼び出される', async () => {
    const user = userEvent.setup();
    mockOnDeleteSession.mockResolvedValue({
      success: true,
      message: 'セッションを削除しました',
    });

    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    const logoutButton = screen.getByLabelText(/Safari on macOSからログアウト/i);
    await user.click(logoutButton);

    const confirmButton = screen.getByRole('button', { name: /確認/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(mockOnDeleteSession).toHaveBeenCalledWith('2');
    });

    expect(screen.getByText(/セッションを削除しました/i)).toBeInTheDocument();
  });

  it('個別ログアウトキャンセル時に削除が呼び出されない', async () => {
    const user = userEvent.setup();
    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    const logoutButton = screen.getByLabelText(/Safari on macOSからログアウト/i);
    await user.click(logoutButton);

    const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
    await user.click(cancelButton);

    expect(mockOnDeleteSession).not.toHaveBeenCalled();
  });

  it('全デバイスログアウトボタンを表示する', () => {
    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    expect(screen.getByLabelText(/全デバイスからログアウト/i)).toBeInTheDocument();
  });

  it('全デバイスログアウトボタンをクリックすると確認ダイアログを表示する', async () => {
    const user = userEvent.setup();
    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    const logoutAllButton = screen.getByLabelText(/全デバイスからログアウト/i);
    await user.click(logoutAllButton);

    expect(screen.getByText(/全てのデバイスからログアウトしますか/i)).toBeInTheDocument();
  });

  it('全デバイスログアウト確認時に削除が呼び出される', async () => {
    const user = userEvent.setup();
    mockOnDeleteAllSessions.mockResolvedValue({
      success: true,
      message: '全てのセッションを削除しました',
      deletedCount: 2,
    });

    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    const logoutAllButton = screen.getByLabelText(/全デバイスからログアウト/i);
    await user.click(logoutAllButton);

    const confirmButton = screen.getByRole('button', { name: /確認/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(mockOnDeleteAllSessions).toHaveBeenCalled();
    });

    expect(screen.getByText(/全てのセッションを削除しました/i)).toBeInTheDocument();
  });

  it('セッション一覧が空の場合、メッセージを表示する', () => {
    render(
      <SessionManager
        sessions={[]}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    expect(screen.getByText(/アクティブなセッションはありません/i)).toBeInTheDocument();
  });

  it('ローディング中はスピナーを表示する', () => {
    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
        isLoading={true}
      />
    );

    expect(screen.getByLabelText(/読み込み中/i)).toBeInTheDocument();
  });

  it('エラー時はエラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    mockOnDeleteSession.mockRejectedValue(new Error('ネットワークエラー'));

    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    const logoutButton = screen.getByLabelText(/Safari on macOSからログアウト/i);
    await user.click(logoutButton);

    const confirmButton = screen.getByRole('button', { name: /確認/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText(/ネットワークエラー/i)).toBeInTheDocument();
    });
  });

  it('アクセシビリティ属性が正しく設定されている', () => {
    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    const logoutButtons = screen.getAllByRole('button');
    logoutButtons.forEach((button) => {
      expect(button).toHaveAttribute('aria-label');
    });
  });

  it('Error以外のエラー時はデフォルトメッセージを表示する', async () => {
    const user = userEvent.setup();
    mockOnDeleteSession.mockRejectedValue('string error');

    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    const logoutButton = screen.getByLabelText(/Safari on macOSからログアウト/i);
    await user.click(logoutButton);

    const confirmButton = screen.getByRole('button', { name: /確認/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText(/セッション削除に失敗しました/i)).toBeInTheDocument();
    });
  });

  it('モーダル背景クリックでダイアログが閉じる', async () => {
    const user = userEvent.setup();
    render(
      <SessionManager
        sessions={mockSessions}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    const logoutButton = screen.getByLabelText(/Safari on macOSからログアウト/i);
    await user.click(logoutButton);

    // ダイアログが表示されていることを確認
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // 背景をクリック（モーダル背景のdivは最後の子要素）
    const dialogBackground = document.querySelector('div[style*="rgba(0, 0, 0, 0.5)"]');
    expect(dialogBackground).toBeInTheDocument();
    await user.click(dialogBackground!);

    // ダイアログが閉じたことを確認
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('IPアドレスがない場合は「不明」と表示する', () => {
    const sessionsWithoutIP: Session[] = [
      {
        id: '3',
        deviceInfo: 'Firefox on Linux',
        ipAddress: '',
        createdAt: '2025-01-01T00:00:00Z',
        expiresAt: '2025-01-08T00:00:00Z',
        isCurrent: false,
      },
    ];

    render(
      <SessionManager
        sessions={sessionsWithoutIP}
        onDeleteSession={mockOnDeleteSession}
        onDeleteAllSessions={mockOnDeleteAllSessions}
      />
    );

    expect(screen.getByText(/IP: 不明/)).toBeInTheDocument();
  });
});
