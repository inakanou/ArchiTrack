/**
 * @fileoverview プロジェクトページとトースト通知の統合テスト
 *
 * Task 13.1: トースト通知の統合
 *
 * Requirements:
 * - 18.4: 操作成功時のToastNotification表示を実装（作成完了、更新完了、削除完了、ステータス変更完了）
 * - 18.5: 操作失敗時のToastNotification表示を実装
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReactNode } from 'react';
import { ToastProvider, useToast } from '../../hooks/useToast';
import ToastNotification from '../../components/ToastNotification';
import { AuthContext, AuthContextValue } from '../../contexts/AuthContext';

// ============================================================================
// テスト用のモックとヘルパー
// ============================================================================

// 認証コンテキストのモック値
const mockAuthContextValue: AuthContextValue = {
  isAuthenticated: true,
  user: {
    id: 'user-123',
    email: 'test@example.com',
    displayName: 'Test User',
  },
  isLoading: false,
  isInitialized: true,
  sessionExpired: false,
  twoFactorState: null,
  login: vi.fn(),
  logout: vi.fn(),
  refreshToken: vi.fn(),
  clearSessionExpired: vi.fn(),
  verify2FA: vi.fn(),
  verifyBackupCode: vi.fn(),
  cancel2FA: vi.fn(),
};

/**
 * ToastProviderを含むテストラッパー
 */
function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <AuthContext.Provider value={mockAuthContextValue}>
        <ToastProvider>
          <ToastContainer />
          {children}
        </ToastProvider>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

/**
 * トースト表示用コンテナ
 */
function ToastContainer() {
  const { toasts, removeToast } = useToast();
  return <ToastNotification toasts={toasts} onDismiss={removeToast} />;
}

/**
 * トースト操作用テストコンポーネント
 */
function ToastTrigger() {
  const toast = useToast();

  return (
    <div>
      <button onClick={() => toast.projectCreated()}>作成成功</button>
      <button onClick={() => toast.projectUpdated()}>更新成功</button>
      <button onClick={() => toast.projectDeleted()}>削除成功</button>
      <button onClick={() => toast.projectStatusChanged('調査中')}>ステータス変更</button>
      <button onClick={() => toast.operationFailed('サーバーエラーが発生しました')}>
        操作失敗
      </button>
      <button onClick={() => toast.operationFailed()}>デフォルト失敗</button>
      <button onClick={() => toast.success('カスタム成功メッセージ')}>カスタム成功</button>
      <button onClick={() => toast.error('カスタムエラーメッセージ')}>カスタムエラー</button>
    </div>
  );
}

// ============================================================================
// テスト
// ============================================================================

describe('プロジェクトトースト統合', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('成功時のトースト表示', () => {
    it('プロジェクト作成成功時にトーストが表示される', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ToastTrigger />
        </TestWrapper>
      );

      await user.click(screen.getByRole('button', { name: '作成成功' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('プロジェクトを作成しました')).toBeInTheDocument();
      });
    });

    it('プロジェクト更新成功時にトーストが表示される', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ToastTrigger />
        </TestWrapper>
      );

      await user.click(screen.getByRole('button', { name: '更新成功' }));

      await waitFor(() => {
        expect(screen.getByText('プロジェクトを更新しました')).toBeInTheDocument();
      });
    });

    it('プロジェクト削除成功時にトーストが表示される', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ToastTrigger />
        </TestWrapper>
      );

      await user.click(screen.getByRole('button', { name: '削除成功' }));

      await waitFor(() => {
        expect(screen.getByText('プロジェクトを削除しました')).toBeInTheDocument();
      });
    });

    it('ステータス変更成功時にトーストが表示される', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ToastTrigger />
        </TestWrapper>
      );

      await user.click(screen.getByRole('button', { name: 'ステータス変更' }));

      await waitFor(() => {
        expect(screen.getByText(/ステータスを「調査中」に変更しました/)).toBeInTheDocument();
      });
    });
  });

  describe('失敗時のトースト表示', () => {
    it('操作失敗時にエラートーストが表示される', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ToastTrigger />
        </TestWrapper>
      );

      await user.click(screen.getByRole('button', { name: '操作失敗' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('サーバーエラーが発生しました')).toBeInTheDocument();
      });
    });

    it('デフォルトのエラーメッセージが表示される', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ToastTrigger />
        </TestWrapper>
      );

      await user.click(screen.getByRole('button', { name: 'デフォルト失敗' }));

      await waitFor(() => {
        expect(screen.getByText('操作中にエラーが発生しました')).toBeInTheDocument();
      });
    });
  });

  describe('トーストの閉じる機能', () => {
    it('閉じるボタンでトーストを閉じることができる', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ToastTrigger />
        </TestWrapper>
      );

      await user.click(screen.getByRole('button', { name: '作成成功' }));

      await waitFor(() => {
        expect(screen.getByText('プロジェクトを作成しました')).toBeInTheDocument();
      });

      // 閉じるボタンをクリック
      const closeButton = screen.getByRole('button', { name: /閉じる/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('プロジェクトを作成しました')).not.toBeInTheDocument();
      });
    });
  });

  describe('複数トーストの表示', () => {
    it('複数のトーストを連続で表示できる', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ToastTrigger />
        </TestWrapper>
      );

      await user.click(screen.getByRole('button', { name: 'カスタム成功' }));
      await user.click(screen.getByRole('button', { name: 'カスタムエラー' }));

      await waitFor(() => {
        expect(screen.getByText('カスタム成功メッセージ')).toBeInTheDocument();
        expect(screen.getByText('カスタムエラーメッセージ')).toBeInTheDocument();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('トーストにrole="alert"が設定される', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ToastTrigger />
        </TestWrapper>
      );

      await user.click(screen.getByRole('button', { name: '作成成功' }));

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
        expect(alert).toHaveAttribute('aria-live', 'polite');
      });
    });
  });
});
