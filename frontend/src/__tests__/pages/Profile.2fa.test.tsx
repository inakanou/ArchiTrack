/**
 * @fileoverview プロフィール画面 2FA機能テスト
 *
 * 要件27B: 二要素認証（2FA）管理機能
 * - バックアップコードの表示と再生成
 * - 2FA無効化
 * - パスワード複雑性バリデーション
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Profile } from '../../pages/Profile';
import type { UserProfile } from '../../types/auth.types';
import type { BackupCodeInfo } from '../../types/two-factor.types';

// API clientをモック
const mockApiGet = vi.fn();
const mockApiPatch = vi.fn();
const mockApiPost = vi.fn();
const mockApiDelete = vi.fn();

vi.mock('../../api/client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockApiGet(...args),
    patch: (...args: unknown[]) => mockApiPatch(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
    setTokenRefreshCallback: vi.fn(),
  },
}));

// useAuthフックをモック
const mockLogout = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// 2FA有効ユーザー
const twoFactorEnabledUser: UserProfile = {
  id: 'user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  roles: ['user'],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  emailVerified: true,
  twoFactorEnabled: true,
};

// 2FA無効ユーザー
const twoFactorDisabledUser: UserProfile = {
  id: 'user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  roles: ['user'],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  emailVerified: true,
  twoFactorEnabled: false,
};

// バックアップコードモック
const mockBackupCodes: BackupCodeInfo[] = [
  { code: 'ABCD-1234', isUsed: false, usedAt: null },
  { code: 'EFGH-5678', isUsed: true, usedAt: '2025-01-02T00:00:00Z' },
  { code: 'IJKL-9012', isUsed: false, usedAt: null },
  { code: 'MNOP-3456', isUsed: false, usedAt: null },
];

describe('Profile - 2FA機能', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: twoFactorEnabledUser,
      logout: mockLogout,
    });
  });

  describe('バックアップコード管理 (要件27B.2)', () => {
    it('2FA有効時にバックアップコードセクションを表示する', () => {
      render(<Profile />);
      expect(screen.getByText(/バックアップコード/i)).toBeInTheDocument();
    });

    it('バックアップコード表示ボタンをクリックするとコードを取得して表示する', async () => {
      const user = userEvent.setup();
      mockApiGet.mockResolvedValueOnce({
        backupCodes: mockBackupCodes,
        remainingCount: 3,
      });

      render(<Profile />);

      // バックアップコード表示ボタンをクリック
      const showButton = screen.getByRole('button', { name: /バックアップコードを表示/i });
      await user.click(showButton);

      // APIが呼ばれたことを確認
      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith('/api/v1/auth/2fa/backup-codes');
      });

      // バックアップコードが表示される
      await waitFor(() => {
        expect(screen.getByText('ABCD-1234')).toBeInTheDocument();
      });
    });

    it('バックアップコード再生成ボタンをクリックすると確認ダイアログを表示する', async () => {
      const user = userEvent.setup();
      mockApiGet.mockResolvedValueOnce({
        backupCodes: mockBackupCodes,
        remainingCount: 3,
      });

      render(<Profile />);

      // バックアップコード表示ボタンをクリック
      const showButton = screen.getByRole('button', { name: /バックアップコードを表示/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(screen.getByText('ABCD-1234')).toBeInTheDocument();
      });

      // 再生成ボタンをクリック
      const regenerateButton = screen.getByRole('button', { name: /再生成/i });
      await user.click(regenerateButton);

      // 確認ダイアログが表示される
      await waitFor(() => {
        expect(
          screen.getByText(/既存のコードは無効になります|再生成しますか/i)
        ).toBeInTheDocument();
      });
    });

    it('バックアップコード再生成成功時に新しいコードを表示する', async () => {
      const user = userEvent.setup();
      mockApiGet.mockResolvedValueOnce({
        backupCodes: mockBackupCodes,
        remainingCount: 3,
      });

      const newBackupCodes: BackupCodeInfo[] = [
        { code: 'NEW1-1111', isUsed: false, usedAt: null },
        { code: 'NEW2-2222', isUsed: false, usedAt: null },
      ];
      mockApiPost.mockResolvedValueOnce({
        backupCodes: newBackupCodes,
        remainingCount: 2,
      });

      render(<Profile />);

      // バックアップコード表示ボタンをクリック
      const showButton = screen.getByRole('button', { name: /バックアップコードを表示/i });
      await user.click(showButton);

      await waitFor(() => {
        expect(screen.getByText('ABCD-1234')).toBeInTheDocument();
      });

      // 再生成ボタンをクリック
      const regenerateButton = screen.getByRole('button', { name: /再生成/i });
      await user.click(regenerateButton);

      // 確認ボタンをクリック
      await waitFor(() => {
        const confirmButton = screen.getByRole('button', { name: /はい|確認|再生成する/i });
        return user.click(confirmButton);
      });

      // 新しいコードが表示される
      await waitFor(() => {
        expect(screen.getByText(/再生成しました/i)).toBeInTheDocument();
      });
    });

    it('バックアップコード取得失敗時にエラーハンドリングする', async () => {
      const user = userEvent.setup();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockApiGet.mockRejectedValueOnce(new Error('Network error'));

      render(<Profile />);

      // バックアップコード表示ボタンをクリック
      const showButton = screen.getByRole('button', { name: /バックアップコードを表示/i });
      await user.click(showButton);

      // エラーログが出力される
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch backup codes');
      });

      consoleSpy.mockRestore();
    });
  });

  describe('パスワード複雑性バリデーション', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: twoFactorDisabledUser,
        logout: mockLogout,
      });
    });

    it('12文字未満のパスワードでエラーを表示する', async () => {
      const user = userEvent.setup();
      render(<Profile />);

      const currentPasswordField = screen.getByLabelText('現在のパスワード');
      const newPasswordField = screen.getByLabelText('新しいパスワード', { exact: true });
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）');
      const changePasswordButton = screen.getByRole('button', { name: /パスワードを変更/i });

      // 12文字未満のパスワード
      await user.type(currentPasswordField, 'OldPass123!@');
      await user.type(newPasswordField, 'Short1!A'); // 8文字
      await user.type(confirmPasswordField, 'Short1!A');
      await user.click(changePasswordButton);

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        const errorAlert = alerts.find((a) => a.textContent?.includes('12文字以上'));
        expect(errorAlert).toBeTruthy();
      });
    });

    it('大文字を含まないパスワードでエラーを表示する', async () => {
      const user = userEvent.setup();
      render(<Profile />);

      const currentPasswordField = screen.getByLabelText('現在のパスワード');
      const newPasswordField = screen.getByLabelText('新しいパスワード', { exact: true });
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）');
      const changePasswordButton = screen.getByRole('button', { name: /パスワードを変更/i });

      // 12文字以上だが大文字なし
      await user.type(currentPasswordField, 'CurrentPass1!');
      await user.type(newPasswordField, 'lowercaseonly1!'); // 大文字なし
      await user.type(confirmPasswordField, 'lowercaseonly1!');
      await user.click(changePasswordButton);

      await waitFor(() => {
        // エラーメッセージが表示される
        const errorMessage = screen.getByRole('alert');
        expect(errorMessage).toHaveTextContent(/大文字/);
      });
    });

    it('パスワードが一致しない場合にエラーを表示する', async () => {
      const user = userEvent.setup();
      render(<Profile />);

      const currentPasswordField = screen.getByLabelText('現在のパスワード');
      const newPasswordField = screen.getByLabelText('新しいパスワード', { exact: true });
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）');
      const changePasswordButton = screen.getByRole('button', { name: /パスワードを変更/i });

      await user.type(currentPasswordField, 'CurrentPass1!');
      await user.type(newPasswordField, 'NewPassword123!@');
      await user.type(confirmPasswordField, 'DifferentPass123!@');
      await user.click(changePasswordButton);

      await waitFor(() => {
        expect(screen.getByText(/一致しません/i)).toBeInTheDocument();
      });
    });

    it('フィールドが未入力の場合にエラーを表示する', async () => {
      const user = userEvent.setup();
      render(<Profile />);

      const changePasswordButton = screen.getByRole('button', { name: /パスワードを変更/i });
      await user.click(changePasswordButton);

      await waitFor(() => {
        expect(screen.getByText(/全てのフィールドを入力/i)).toBeInTheDocument();
      });
    });

    it('連続した同一文字を含むパスワードでエラーを表示する', async () => {
      const user = userEvent.setup();
      render(<Profile />);

      const currentPasswordField = screen.getByLabelText('現在のパスワード');
      const newPasswordField = screen.getByLabelText('新しいパスワード', { exact: true });
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）');
      const changePasswordButton = screen.getByRole('button', { name: /パスワードを変更/i });

      await user.type(currentPasswordField, 'CurrentPass1!');
      await user.type(newPasswordField, 'Newwwwpass123!@'); // 'www' - 3文字以上の連続
      await user.type(confirmPasswordField, 'Newwwwpass123!@');
      await user.click(changePasswordButton);

      await waitFor(() => {
        expect(screen.getByText(/連続した同一文字/i)).toBeInTheDocument();
      });
    });
  });

  describe('2FA無効化 (要件27B.4-6)', () => {
    it('2FA無効化ボタンをクリックするとダイアログを表示する', async () => {
      const user = userEvent.setup();
      render(<Profile />);

      // 2FA無効化ボタンをクリック
      const disableButton = screen.getByRole('button', { name: '無効化' });
      await user.click(disableButton);

      // パスワード入力ダイアログが表示される
      await waitFor(() => {
        expect(screen.getByText(/パスワードを入力/i)).toBeInTheDocument();
      });
    });

    it('2FA無効化ダイアログでパスワード入力後に確認ダイアログを表示する', async () => {
      const user = userEvent.setup();

      render(<Profile />);

      // 2FA無効化ボタンをクリック
      const disableButton = screen.getByRole('button', { name: '無効化' });
      await user.click(disableButton);

      // パスワードダイアログが表示される
      await waitFor(() => {
        expect(screen.getByText(/パスワードを入力/i)).toBeInTheDocument();
      });

      // パスワード入力
      const passwordInput = screen.getByLabelText('パスワード');
      await user.type(passwordInput, 'CurrentPassword123!');

      // 確認ボタンをクリック
      const confirmButton = screen.getByRole('button', { name: '確認' });
      await user.click(confirmButton);

      // 確認ダイアログが表示される
      await waitFor(() => {
        expect(screen.getByText(/続行しますか/i)).toBeInTheDocument();
      });
    });
  });

  describe('Escキーでダイアログを閉じる', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: twoFactorDisabledUser,
        logout: mockLogout,
      });
    });

    it('パスワード変更ダイアログをEscキーで閉じる', async () => {
      const user = userEvent.setup();
      render(<Profile />);

      const currentPasswordField = screen.getByLabelText('現在のパスワード');
      const newPasswordField = screen.getByLabelText('新しいパスワード', { exact: true });
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）');
      const changePasswordButton = screen.getByRole('button', { name: /パスワードを変更/i });

      await user.type(currentPasswordField, 'CurrentPassword123!');
      await user.type(newPasswordField, 'NewPassword123!@');
      await user.type(confirmPasswordField, 'NewPassword123!@');
      await user.click(changePasswordButton);

      // ダイアログが表示される
      await waitFor(() => {
        expect(screen.getByText(/全デバイスからログアウトされます/i)).toBeInTheDocument();
      });

      // Escキーを押す
      fireEvent.keyDown(document, { key: 'Escape' });

      // ダイアログが閉じる
      await waitFor(() => {
        expect(screen.queryByText(/全デバイスからログアウトされます/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('プロフィール更新', () => {
    it('プロフィール更新失敗時にエラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      mockApiPatch.mockRejectedValueOnce(new Error('Update failed'));

      render(<Profile />);

      const displayNameField = screen.getByLabelText(/表示名/i);
      const saveButton = screen.getByRole('button', { name: /保存/i });

      await user.clear(displayNameField);
      await user.type(displayNameField, 'New Name');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/失敗しました/i)).toBeInTheDocument();
      });
    });
  });

  describe('2FA無効ユーザー', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: twoFactorDisabledUser,
        logout: mockLogout,
      });
    });

    it('2FA無効時に設定リンクを表示する', () => {
      render(<Profile />);

      // 2FA設定セクションが表示される
      expect(screen.getByText(/二要素認証/i)).toBeInTheDocument();
      // 設定リンクが表示される
      expect(screen.getByRole('link', { name: /二要素認証設定/i })).toBeInTheDocument();
    });
  });

  describe('パスワード変更ダイアログ操作', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: twoFactorDisabledUser,
        logout: mockLogout,
      });
    });

    it('パスワード変更ダイアログのキャンセルボタンで閉じる', async () => {
      const user = userEvent.setup();
      render(<Profile />);

      const currentPasswordField = screen.getByLabelText('現在のパスワード');
      const newPasswordField = screen.getByLabelText('新しいパスワード', { exact: true });
      const confirmPasswordField = screen.getByLabelText('新しいパスワード（確認）');
      const changePasswordButton = screen.getByRole('button', { name: /パスワードを変更/i });

      await user.type(currentPasswordField, 'CurrentPassword123!');
      await user.type(newPasswordField, 'NewPassword123!@');
      await user.type(confirmPasswordField, 'NewPassword123!@');
      await user.click(changePasswordButton);

      // ダイアログが表示される
      await waitFor(() => {
        expect(screen.getByText(/全デバイスからログアウトされます/i)).toBeInTheDocument();
      });

      // キャンセルボタンをクリック
      const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
      await user.click(cancelButton);

      // ダイアログが閉じる
      await waitFor(() => {
        expect(screen.queryByText(/全デバイスからログアウトされます/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('2FA無効化ダイアログ操作', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: twoFactorEnabledUser,
        logout: mockLogout,
      });
    });

    it('2FA無効化パスワードダイアログのキャンセルボタンで閉じる', async () => {
      const user = userEvent.setup();
      render(<Profile />);

      // 2FA無効化ボタンをクリック
      const disableButton = screen.getByRole('button', { name: '無効化' });
      await user.click(disableButton);

      // パスワードダイアログが表示される
      await waitFor(() => {
        expect(screen.getByText(/パスワードを入力/i)).toBeInTheDocument();
      });

      // キャンセルボタンをクリック
      const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
      await user.click(cancelButton);

      // ダイアログが閉じる
      await waitFor(() => {
        expect(screen.queryByText(/パスワードを入力/i)).not.toBeInTheDocument();
      });
    });

    it('2FA無効化確認ダイアログを表示してキャンセルする', async () => {
      const user = userEvent.setup();
      render(<Profile />);

      // 2FA無効化ボタンをクリック
      const disableButton = screen.getByRole('button', { name: '無効化' });
      await user.click(disableButton);

      // パスワードダイアログが表示される
      await waitFor(() => {
        expect(screen.getByText(/パスワードを入力/i)).toBeInTheDocument();
      });

      // パスワード入力
      const passwordInput = screen.getByLabelText('パスワード');
      await user.type(passwordInput, 'CurrentPassword123!');

      // 確認ボタンをクリック
      const confirmButton = screen.getByRole('button', { name: '確認' });
      await user.click(confirmButton);

      // 確認ダイアログが表示される
      await waitFor(() => {
        expect(screen.getByText(/二要素認証の無効化確認/i)).toBeInTheDocument();
        expect(screen.getByText(/全デバイスからログアウトされます/i)).toBeInTheDocument();
      });

      // キャンセルボタンをクリック
      const cancelConfirmButton = screen.getAllByRole('button', { name: /キャンセル/i })[0];
      await user.click(cancelConfirmButton!);

      // 確認ダイアログが閉じる
      await waitFor(() => {
        expect(screen.queryByText(/二要素認証の無効化確認/i)).not.toBeInTheDocument();
      });
    });
  });
});
