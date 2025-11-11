import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileForm from '../../components/ProfileForm';
import type { UserProfile } from '../../types/auth.types';

describe('ProfileForm', () => {
  const mockUser: UserProfile = {
    id: 'user-1',
    email: 'test@example.com',
    displayName: 'Test User',
    roles: ['user'],
    createdAt: '2025-01-01T00:00:00Z',
    twoFactorEnabled: false,
  };

  const mockUpdateProfile = vi.fn();
  const mockChangePassword = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('プロフィール編集', () => {
    it('ユーザー情報が正しく表示される', () => {
      render(
        <ProfileForm
          user={mockUser}
          onUpdateProfile={mockUpdateProfile}
          onChangePassword={mockChangePassword}
        />
      );

      expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test User')).toBeInTheDocument();
      expect(screen.getByDisplayValue('user')).toBeInTheDocument();
    });

    it('メールアドレスは読み取り専用である', () => {
      render(
        <ProfileForm
          user={mockUser}
          onUpdateProfile={mockUpdateProfile}
          onChangePassword={mockChangePassword}
        />
      );

      const emailInput = screen.getByLabelText('メールアドレス（読み取り専用）');
      expect(emailInput).toHaveAttribute('readonly');
    });

    it('表示名を変更すると保存ボタンが有効になる', async () => {
      const user = userEvent.setup();
      render(
        <ProfileForm
          user={mockUser}
          onUpdateProfile={mockUpdateProfile}
          onChangePassword={mockChangePassword}
        />
      );

      const saveButton = screen.getByRole('button', { name: '保存' });
      expect(saveButton).toBeDisabled();

      const displayNameInput = screen.getByLabelText('表示名');
      await user.clear(displayNameInput);
      await user.type(displayNameInput, 'Updated Name');

      expect(saveButton).toBeEnabled();
    });

    it('表示名が空の場合、保存時にエラーが表示される', async () => {
      const user = userEvent.setup();
      render(
        <ProfileForm
          user={mockUser}
          onUpdateProfile={mockUpdateProfile}
          onChangePassword={mockChangePassword}
        />
      );

      const displayNameInput = screen.getByLabelText('表示名');
      await user.clear(displayNameInput);

      const saveButton = screen.getByRole('button', { name: '保存' });
      await user.click(saveButton);

      expect(screen.getByText('表示名は必須です')).toBeInTheDocument();
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('プロフィール更新が成功すると成功メッセージが表示される', async () => {
      const user = userEvent.setup();
      mockUpdateProfile.mockResolvedValueOnce(undefined);

      render(
        <ProfileForm
          user={mockUser}
          onUpdateProfile={mockUpdateProfile}
          onChangePassword={mockChangePassword}
        />
      );

      const displayNameInput = screen.getByLabelText('表示名');
      await user.clear(displayNameInput);
      await user.type(displayNameInput, 'Updated Name');

      const saveButton = screen.getByRole('button', { name: '保存' });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('プロフィールを更新しました')).toBeInTheDocument();
      });

      expect(mockUpdateProfile).toHaveBeenCalledWith({ displayName: 'Updated Name' });
    });

    it('プロフィール更新が失敗するとエラーメッセージが表示される', async () => {
      const user = userEvent.setup();
      mockUpdateProfile.mockRejectedValueOnce(new Error('更新に失敗しました'));

      render(
        <ProfileForm
          user={mockUser}
          onUpdateProfile={mockUpdateProfile}
          onChangePassword={mockChangePassword}
        />
      );

      const displayNameInput = screen.getByLabelText('表示名');
      await user.clear(displayNameInput);
      await user.type(displayNameInput, 'Updated Name');

      const saveButton = screen.getByRole('button', { name: '保存' });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('更新に失敗しました')).toBeInTheDocument();
      });
    });
  });

  describe('パスワード変更', () => {
    it('パスワード表示/非表示切り替えボタンが動作する', async () => {
      const user = userEvent.setup();
      render(
        <ProfileForm
          user={mockUser}
          onUpdateProfile={mockUpdateProfile}
          onChangePassword={mockChangePassword}
        />
      );

      const currentPasswordInput = screen.getByLabelText('現在のパスワード');
      expect(currentPasswordInput).toHaveAttribute('type', 'password');

      const toggleButtons = screen.getAllByLabelText('パスワードを表示');
      expect(toggleButtons.length).toBeGreaterThan(0);
      await user.click(toggleButtons[0]!);

      expect(currentPasswordInput).toHaveAttribute('type', 'text');
    });

    it('パスワード入力時、強度インジケーターが表示される', async () => {
      const user = userEvent.setup();
      render(
        <ProfileForm
          user={mockUser}
          onUpdateProfile={mockUpdateProfile}
          onChangePassword={mockChangePassword}
        />
      );

      const newPasswordInput = screen.getByLabelText('新しいパスワード');
      await user.type(newPasswordInput, 'TestPassword123!');

      expect(screen.getByText(/パスワード強度/)).toBeInTheDocument();
    });

    it('必須フィールドが未入力の場合、エラーが表示される', async () => {
      const user = userEvent.setup();
      render(
        <ProfileForm
          user={mockUser}
          onUpdateProfile={mockUpdateProfile}
          onChangePassword={mockChangePassword}
        />
      );

      const changeButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(changeButton);

      expect(screen.getByText('現在のパスワードは必須です')).toBeInTheDocument();
      expect(screen.getByText('新しいパスワードは必須です')).toBeInTheDocument();
      expect(screen.getByText('パスワード確認は必須です')).toBeInTheDocument();
    });

    it('新しいパスワードが12文字未満の場合、エラーが表示される', async () => {
      const user = userEvent.setup();
      render(
        <ProfileForm
          user={mockUser}
          onUpdateProfile={mockUpdateProfile}
          onChangePassword={mockChangePassword}
        />
      );

      const currentPasswordInput = screen.getByLabelText('現在のパスワード');
      await user.type(currentPasswordInput, 'OldPassword123!');

      const newPasswordInput = screen.getByLabelText('新しいパスワード');
      await user.type(newPasswordInput, 'Short1!');

      const newPasswordConfirmInput = screen.getByLabelText('新しいパスワード（確認）');
      await user.type(newPasswordConfirmInput, 'Short1!');

      const changeButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(changeButton);

      expect(screen.getByText('パスワードは12文字以上である必要があります')).toBeInTheDocument();
    });

    it('パスワード確認が一致しない場合、エラーが表示される', async () => {
      const user = userEvent.setup();
      render(
        <ProfileForm
          user={mockUser}
          onUpdateProfile={mockUpdateProfile}
          onChangePassword={mockChangePassword}
        />
      );

      const currentPasswordInput = screen.getByLabelText('現在のパスワード');
      await user.type(currentPasswordInput, 'OldPassword123!');

      const newPasswordInput = screen.getByLabelText('新しいパスワード');
      await user.type(newPasswordInput, 'NewPassword123!');

      const newPasswordConfirmInput = screen.getByLabelText('新しいパスワード（確認）');
      await user.type(newPasswordConfirmInput, 'DifferentPassword123!');

      const changeButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(changeButton);

      expect(screen.getByText('パスワードが一致しません')).toBeInTheDocument();
    });

    it('パスワード変更ボタンクリック時、確認ダイアログが表示される', async () => {
      const user = userEvent.setup();
      render(
        <ProfileForm
          user={mockUser}
          onUpdateProfile={mockUpdateProfile}
          onChangePassword={mockChangePassword}
        />
      );

      const currentPasswordInput = screen.getByLabelText('現在のパスワード');
      await user.type(currentPasswordInput, 'OldPassword123!');

      const newPasswordInput = screen.getByLabelText('新しいパスワード');
      await user.type(newPasswordInput, 'NewPassword123!');

      const newPasswordConfirmInput = screen.getByLabelText('新しいパスワード（確認）');
      await user.type(newPasswordConfirmInput, 'NewPassword123!');

      const changeButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(changeButton);

      expect(screen.getByText('パスワード変更の確認')).toBeInTheDocument();
      expect(screen.getByText(/全てのデバイスからログアウトされます/)).toBeInTheDocument();
    });

    it('確認ダイアログで「キャンセル」をクリックすると、ダイアログが閉じる', async () => {
      const user = userEvent.setup();
      render(
        <ProfileForm
          user={mockUser}
          onUpdateProfile={mockUpdateProfile}
          onChangePassword={mockChangePassword}
        />
      );

      const currentPasswordInput = screen.getByLabelText('現在のパスワード');
      await user.type(currentPasswordInput, 'OldPassword123!');

      const newPasswordInput = screen.getByLabelText('新しいパスワード');
      await user.type(newPasswordInput, 'NewPassword123!');

      const newPasswordConfirmInput = screen.getByLabelText('新しいパスワード（確認）');
      await user.type(newPasswordConfirmInput, 'NewPassword123!');

      const changeButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(changeButton);

      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      expect(screen.queryByText('パスワード変更の確認')).not.toBeInTheDocument();
      expect(mockChangePassword).not.toHaveBeenCalled();
    });

    it('確認ダイアログで「変更する」をクリックすると、パスワード変更が実行される', async () => {
      const user = userEvent.setup();
      mockChangePassword.mockResolvedValueOnce(undefined);

      render(
        <ProfileForm
          user={mockUser}
          onUpdateProfile={mockUpdateProfile}
          onChangePassword={mockChangePassword}
        />
      );

      const currentPasswordInput = screen.getByLabelText('現在のパスワード');
      await user.type(currentPasswordInput, 'OldPassword123!');

      const newPasswordInput = screen.getByLabelText('新しいパスワード');
      await user.type(newPasswordInput, 'NewPassword123!');

      const newPasswordConfirmInput = screen.getByLabelText('新しいパスワード（確認）');
      await user.type(newPasswordConfirmInput, 'NewPassword123!');

      const changeButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(changeButton);

      const confirmButton = screen.getByRole('button', { name: '変更する' });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockChangePassword).toHaveBeenCalledWith({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
          newPasswordConfirm: 'NewPassword123!',
        });
      });
    });

    it('パスワード変更が失敗すると、エラーメッセージが表示される', async () => {
      const user = userEvent.setup();
      mockChangePassword.mockRejectedValueOnce(new Error('パスワード変更に失敗しました'));

      render(
        <ProfileForm
          user={mockUser}
          onUpdateProfile={mockUpdateProfile}
          onChangePassword={mockChangePassword}
        />
      );

      const currentPasswordInput = screen.getByLabelText('現在のパスワード');
      await user.type(currentPasswordInput, 'OldPassword123!');

      const newPasswordInput = screen.getByLabelText('新しいパスワード');
      await user.type(newPasswordInput, 'NewPassword123!');

      const newPasswordConfirmInput = screen.getByLabelText('新しいパスワード（確認）');
      await user.type(newPasswordConfirmInput, 'NewPassword123!');

      const changeButton = screen.getByRole('button', { name: 'パスワードを変更' });
      await user.click(changeButton);

      const confirmButton = screen.getByRole('button', { name: '変更する' });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('パスワード変更に失敗しました')).toBeInTheDocument();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('エラーメッセージがaria-liveで通知される', async () => {
      const user = userEvent.setup();
      render(
        <ProfileForm
          user={mockUser}
          onUpdateProfile={mockUpdateProfile}
          onChangePassword={mockChangePassword}
        />
      );

      const displayNameInput = screen.getByLabelText('表示名');
      await user.clear(displayNameInput);

      const saveButton = screen.getByRole('button', { name: '保存' });
      await user.click(saveButton);

      const errorAlert = screen.getByRole('alert');
      expect(errorAlert).toBeInTheDocument();
      expect(errorAlert).toHaveAttribute('aria-live', 'polite');
    });
  });
});
