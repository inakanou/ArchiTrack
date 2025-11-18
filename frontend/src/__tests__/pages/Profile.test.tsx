/**
 * プロフィール画面のテスト
 *
 * 要件14: プロフィール画面のUI/UX
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Profile } from '../../pages/Profile';
import type { UserProfile } from '../../types/auth.types';

// API clientをモック
vi.mock('../../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

// useAuthContextをモック
const mockLogout = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// デフォルトのモック値（一般ユーザー）
mockUseAuth.mockReturnValue({
  user: {
    id: 'user-123',
    email: 'test@example.com',
    displayName: 'Test User',
    roles: ['user'],
    createdAt: '2025-01-01T00:00:00Z',
    twoFactorEnabled: false,
  } as UserProfile,
  logout: mockLogout,
});

describe('Profile Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // デフォルトのモック値（一般ユーザー）にリセット
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        roles: ['user'],
        createdAt: '2025-01-01T00:00:00Z',
        twoFactorEnabled: false,
      } as UserProfile,
      logout: mockLogout,
    });
  });

  describe('ユーザー情報セクション', () => {
    it('メールアドレス、表示名、ロール、作成日時を表示する（要件14.1）', () => {
      render(<Profile />);

      // メールアドレス（読み取り専用）
      const emailField = screen.getByLabelText(/メールアドレス/i);
      expect(emailField).toBeInTheDocument();
      expect(emailField).toHaveValue('test@example.com');
      expect(emailField).toHaveAttribute('readonly');

      // 表示名（編集可能）
      const displayNameField = screen.getByLabelText(/表示名/i);
      expect(displayNameField).toBeInTheDocument();
      expect(displayNameField).toHaveValue('Test User');
      expect(displayNameField).not.toHaveAttribute('readonly');

      // ロール表示
      expect(screen.getByText(/user/i)).toBeInTheDocument();

      // 作成日時表示
      expect(screen.getByText(/2025/)).toBeInTheDocument();
    });

    it('表示名変更時に保存ボタンを有効化する（要件14.3）', async () => {
      const user = userEvent.setup();
      render(<Profile />);

      const displayNameField = screen.getByLabelText(/表示名/i);
      const saveButton = screen.getByRole('button', { name: /保存/i });

      // 初期状態では保存ボタンは無効
      expect(saveButton).toBeDisabled();

      // 表示名を変更
      await user.clear(displayNameField);
      await user.type(displayNameField, 'Updated Name');

      // 保存ボタンが有効化される
      expect(saveButton).toBeEnabled();
    });

    it('保存成功時にトーストメッセージを表示する（要件14.4）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');

      vi.mocked(apiClient.patch).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Updated Name',
        roles: ['user'],
        createdAt: '2025-01-01T00:00:00Z',
        twoFactorEnabled: false,
      });

      render(<Profile />);

      const displayNameField = screen.getByLabelText(/表示名/i);
      const saveButton = screen.getByRole('button', { name: /保存/i });

      // 表示名を変更
      await user.clear(displayNameField);
      await user.type(displayNameField, 'Updated Name');

      // 保存ボタンをクリック
      await user.click(saveButton);

      // トーストメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText(/更新しました/i)).toBeInTheDocument();
      });
    });
  });

  describe('パスワード変更セクション', () => {
    it('現在のパスワード、新しいパスワード、パスワード確認の入力フィールドを表示する（要件14.5）', () => {
      render(<Profile />);

      // 現在のパスワード
      expect(screen.getByLabelText('現在のパスワード')).toBeInTheDocument();

      // 新しいパスワード
      expect(screen.getByLabelText('新しいパスワード', { exact: true })).toBeInTheDocument();

      // パスワード確認
      expect(screen.getByLabelText('新しいパスワード（確認）')).toBeInTheDocument();
    });

    it('新しいパスワード入力時にパスワード強度インジケーターを表示する（要件14.6）', async () => {
      const user = userEvent.setup();
      render(<Profile />);

      const newPasswordField = screen.getByLabelText('新しいパスワード', { exact: true });

      // パスワードを入力
      await user.type(newPasswordField, 'WeakPass123!');

      // パスワード強度インジケーターが表示される
      await waitFor(() => {
        expect(screen.getByTestId('password-strength-indicator')).toBeInTheDocument();
      });
    });

    it('パスワード変更ボタンクリック時に確認ダイアログを表示する（要件14.7）', async () => {
      const user = userEvent.setup();
      render(<Profile />);

      const currentPasswordField = screen.getByLabelText('現在のパスワード');
      const newPasswordField = screen.getByLabelText('新しいパスワード', { exact: true });
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）');
      const changePasswordButton = screen.getByRole('button', { name: /パスワードを変更/i });

      // パスワードフィールドに入力
      await user.type(currentPasswordField, 'CurrentPassword123!');
      await user.type(newPasswordField, 'NewPassword123!@');
      await user.type(confirmPasswordField, 'NewPassword123!@');

      // パスワード変更ボタンをクリック
      await user.click(changePasswordButton);

      // 確認ダイアログが表示される
      await waitFor(() => {
        expect(screen.getByText(/全デバイスからログアウトされます/i)).toBeInTheDocument();
      });
    });

    it('パスワード変更成功後にログイン画面へリダイレクトする（要件14.8）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');

      vi.mocked(apiClient.post).mockResolvedValue({
        message: 'パスワードを変更しました',
      });

      render(<Profile />);

      const currentPasswordField = screen.getByLabelText('現在のパスワード');
      const newPasswordField = screen.getByLabelText('新しいパスワード', { exact: true });
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）');
      const changePasswordButton = screen.getByRole('button', { name: /パスワードを変更/i });

      // パスワードフィールドに入力
      await user.type(currentPasswordField, 'CurrentPassword123!');
      await user.type(newPasswordField, 'NewPassword123!@');
      await user.type(confirmPasswordField, 'NewPassword123!@');

      // パスワード変更ボタンをクリック
      await user.click(changePasswordButton);

      // 確認ダイアログで「はい」をクリック
      const confirmButton = await screen.findByRole('button', { name: /はい|確認|変更する/i });
      await user.click(confirmButton);

      // 成功メッセージが表示される
      await waitFor(() => {
        expect(screen.getByText(/パスワードを変更しました/i)).toBeInTheDocument();
      });

      // ログアウトが呼ばれる（ログイン画面へリダイレクト）
      await waitFor(
        () => {
          expect(mockLogout).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );
    }, 10000);
  });

  describe('管理者機能', () => {
    it('管理者ユーザーには「ユーザー管理」リンクを表示する（要件14.9）', () => {
      // 管理者ユーザーでモック
      mockUseAuth.mockReturnValue({
        user: {
          id: 'admin-123',
          email: 'admin@example.com',
          displayName: 'Admin User',
          roles: ['admin'],
          createdAt: '2025-01-01T00:00:00Z',
          twoFactorEnabled: false,
        } as UserProfile,
        logout: mockLogout,
      });

      render(<Profile />);

      // 「ユーザー管理」リンクが表示される
      expect(screen.getByRole('link', { name: /ユーザー管理/i })).toBeInTheDocument();
    });

    it('一般ユーザーには「ユーザー管理」リンクを表示しない', () => {
      render(<Profile />);

      // 「ユーザー管理」リンクが表示されない
      expect(screen.queryByRole('link', { name: /ユーザー管理/i })).not.toBeInTheDocument();
    });
  });

  describe('レスポンシブデザイン', () => {
    it('モバイル最適化レイアウトを適用する（要件14.10）', () => {
      // モバイルビューポートをシミュレート（768px未満）
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<Profile />);

      // モバイル最適化されたレイアウトクラスが適用されている
      const container = screen.getByTestId('profile-container');
      expect(container).toHaveClass('mobile-optimized');
    });
  });

  describe('アクセシビリティ', () => {
    it('適切なaria属性が設定されている', () => {
      render(<Profile />);

      // フォームフィールドにaria-label属性が設定されている
      const emailField = screen.getByLabelText(/メールアドレス/i);
      expect(emailField).toHaveAccessibleName();

      const displayNameField = screen.getByLabelText(/表示名/i);
      expect(displayNameField).toHaveAccessibleName();
    });

    it('エラーメッセージがaria-liveリージョンで通知される', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');

      vi.mocked(apiClient.patch).mockRejectedValue({
        statusCode: 400,
        message: '入力エラー',
      });

      render(<Profile />);

      const displayNameField = screen.getByLabelText(/表示名/i);
      const saveButton = screen.getByRole('button', { name: /保存/i });

      // 表示名を変更
      await user.clear(displayNameField);
      await user.type(displayNameField, 'Updated Name');

      // 保存ボタンをクリック
      await user.click(saveButton);

      // エラーメッセージがaria-liveリージョンで通知される
      await waitFor(() => {
        const errorMessage = screen.getByRole('alert');
        expect(errorMessage).toHaveAttribute('aria-live', 'polite');
      });
    });
  });
});
