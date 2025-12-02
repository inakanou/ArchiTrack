import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileForm from '../../components/ProfileForm';
import type { UserProfile } from '../../types/profile.types';

describe('ProfileForm', () => {
  const mockUser: UserProfile = {
    id: '1',
    email: 'test@example.com',
    displayName: 'Test User',
    roles: ['user'],
    createdAt: '2025-01-01T00:00:00Z',
    twoFactorEnabled: false,
  };

  const mockOnUpdateProfile = vi.fn();
  const mockOnChangePassword = vi.fn();
  const mockOnNavigateToUserManagement = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('プロフィール情報を表示する', () => {
    render(
      <ProfileForm
        user={mockUser}
        onUpdateProfile={mockOnUpdateProfile}
        onChangePassword={mockOnChangePassword}
      />
    );

    expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test User')).toBeInTheDocument();
    expect(screen.getByText(/user/i)).toBeInTheDocument();
    expect(screen.getByText(/2025-01-01/)).toBeInTheDocument();
  });

  it('メールアドレスフィールドが読み取り専用である', () => {
    render(
      <ProfileForm
        user={mockUser}
        onUpdateProfile={mockOnUpdateProfile}
        onChangePassword={mockOnChangePassword}
      />
    );

    const emailInput = screen.getByLabelText(/メールアドレス/i);
    expect(emailInput).toHaveAttribute('readonly');
  });

  it('表示名を変更すると保存ボタンが有効化される', async () => {
    const user = userEvent.setup();
    render(
      <ProfileForm
        user={mockUser}
        onUpdateProfile={mockOnUpdateProfile}
        onChangePassword={mockOnChangePassword}
      />
    );

    const displayNameInput = screen.getByLabelText(/表示名/i);
    const saveButton = screen.getByRole('button', { name: /保存/i });

    expect(saveButton).toBeDisabled();

    await user.clear(displayNameInput);
    await user.type(displayNameInput, 'Updated Name');

    expect(saveButton).toBeEnabled();
  });

  it('保存ボタンをクリックするとプロフィール更新が呼び出される', async () => {
    const user = userEvent.setup();
    mockOnUpdateProfile.mockResolvedValue({
      success: true,
      message: 'プロフィールを更新しました',
    });

    render(
      <ProfileForm
        user={mockUser}
        onUpdateProfile={mockOnUpdateProfile}
        onChangePassword={mockOnChangePassword}
      />
    );

    const displayNameInput = screen.getByLabelText(/表示名/i);
    const saveButton = screen.getByRole('button', { name: /保存/i });

    await user.clear(displayNameInput);
    await user.type(displayNameInput, 'Updated Name');
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockOnUpdateProfile).toHaveBeenCalledWith({
        displayName: 'Updated Name',
      });
    });

    expect(screen.getByText(/プロフィールを更新しました/i)).toBeInTheDocument();
  });

  it('パスワード変更セクションを表示する', () => {
    render(
      <ProfileForm
        user={mockUser}
        onUpdateProfile={mockOnUpdateProfile}
        onChangePassword={mockOnChangePassword}
      />
    );

    expect(screen.getByLabelText(/現在のパスワード/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^新しいパスワード$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/パスワード確認/i)).toBeInTheDocument();
  });

  it('パスワード変更ボタンをクリックすると確認ダイアログを表示する', async () => {
    const user = userEvent.setup();
    render(
      <ProfileForm
        user={mockUser}
        onUpdateProfile={mockOnUpdateProfile}
        onChangePassword={mockOnChangePassword}
      />
    );

    const currentPasswordInput = screen.getByLabelText(/現在のパスワード/i);
    const newPasswordInput = screen.getByLabelText(/^新しいパスワード$/i);
    const confirmPasswordInput = screen.getByLabelText(/パスワード確認/i);
    const changePasswordButton = screen.getByRole('button', {
      name: /パスワード変更/i,
    });

    await user.type(currentPasswordInput, 'OldPassword123!');
    await user.type(newPasswordInput, 'NewPassword123!');
    await user.type(confirmPasswordInput, 'NewPassword123!');
    await user.click(changePasswordButton);

    expect(screen.getByText(/全デバイスからログアウトされます/i)).toBeInTheDocument();
  });

  it('パスワード確認が一致しない場合、エラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    render(
      <ProfileForm
        user={mockUser}
        onUpdateProfile={mockOnUpdateProfile}
        onChangePassword={mockOnChangePassword}
      />
    );

    const newPasswordInput = screen.getByLabelText(/^新しいパスワード$/i);
    const confirmPasswordInput = screen.getByLabelText(/パスワード確認/i);

    await user.type(newPasswordInput, 'NewPassword123!');
    await user.type(confirmPasswordInput, 'DifferentPassword123!');

    expect(screen.getByText(/パスワードが一致しません/i)).toBeInTheDocument();
  });

  it('パスワード変更確認ダイアログで確認するとパスワード変更が呼び出される', async () => {
    const user = userEvent.setup();
    mockOnChangePassword.mockResolvedValue({
      success: true,
      message: 'パスワードを変更しました',
    });

    render(
      <ProfileForm
        user={mockUser}
        onUpdateProfile={mockOnUpdateProfile}
        onChangePassword={mockOnChangePassword}
      />
    );

    const currentPasswordInput = screen.getByLabelText(/現在のパスワード/i);
    const newPasswordInput = screen.getByLabelText(/^新しいパスワード$/i);
    const confirmPasswordInput = screen.getByLabelText(/パスワード確認/i);
    const changePasswordButton = screen.getByRole('button', {
      name: /パスワード変更/i,
    });

    await user.type(currentPasswordInput, 'OldPassword123!');
    await user.type(newPasswordInput, 'NewPassword123!');
    await user.type(confirmPasswordInput, 'NewPassword123!');
    await user.click(changePasswordButton);

    const confirmButton = screen.getByRole('button', { name: /確認/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(mockOnChangePassword).toHaveBeenCalledWith({
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!',
      });
    });
  });

  it('パスワード変更確認ダイアログでキャンセルするとパスワード変更が呼び出されない', async () => {
    const user = userEvent.setup();
    render(
      <ProfileForm
        user={mockUser}
        onUpdateProfile={mockOnUpdateProfile}
        onChangePassword={mockOnChangePassword}
      />
    );

    const currentPasswordInput = screen.getByLabelText(/現在のパスワード/i);
    const newPasswordInput = screen.getByLabelText(/^新しいパスワード$/i);
    const confirmPasswordInput = screen.getByLabelText(/パスワード確認/i);
    const changePasswordButton = screen.getByRole('button', {
      name: /パスワード変更/i,
    });

    await user.type(currentPasswordInput, 'OldPassword123!');
    await user.type(newPasswordInput, 'NewPassword123!');
    await user.type(confirmPasswordInput, 'NewPassword123!');
    await user.click(changePasswordButton);

    const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
    await user.click(cancelButton);

    expect(mockOnChangePassword).not.toHaveBeenCalled();
  });

  it('プロフィール更新中はローディングスピナーを表示する', async () => {
    const user = userEvent.setup();
    let resolveUpdate: (value: unknown) => void;
    const updatePromise = new Promise((resolve) => {
      resolveUpdate = resolve;
    });
    mockOnUpdateProfile.mockReturnValue(updatePromise);

    render(
      <ProfileForm
        user={mockUser}
        onUpdateProfile={mockOnUpdateProfile}
        onChangePassword={mockOnChangePassword}
      />
    );

    const displayNameInput = screen.getByLabelText(/表示名/i);
    const saveButton = screen.getByRole('button', { name: /保存/i });

    await user.clear(displayNameInput);
    await user.type(displayNameInput, 'Updated Name');
    await user.click(saveButton);

    expect(screen.getByLabelText(/保存中/i)).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    resolveUpdate!({ success: true, message: '成功' });
    await waitFor(() => {
      expect(screen.queryByLabelText(/保存中/i)).not.toBeInTheDocument();
    });
  });

  it('プロフィール更新エラー時はエラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    mockOnUpdateProfile.mockRejectedValue(new Error('ネットワークエラー'));

    render(
      <ProfileForm
        user={mockUser}
        onUpdateProfile={mockOnUpdateProfile}
        onChangePassword={mockOnChangePassword}
      />
    );

    const displayNameInput = screen.getByLabelText(/表示名/i);
    const saveButton = screen.getByRole('button', { name: /保存/i });

    await user.clear(displayNameInput);
    await user.type(displayNameInput, 'Updated Name');
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/ネットワークエラー/i)).toBeInTheDocument();
    });
  });

  it('管理者ユーザーには「ユーザー管理」リンクを表示する', () => {
    const adminUser: UserProfile = {
      ...mockUser,
      roles: ['admin'],
    };

    render(
      <ProfileForm
        user={adminUser}
        onUpdateProfile={mockOnUpdateProfile}
        onChangePassword={mockOnChangePassword}
        onNavigateToUserManagement={mockOnNavigateToUserManagement}
      />
    );

    const userManagementLink = screen.getByRole('link', {
      name: /ユーザー管理/i,
    });
    expect(userManagementLink).toBeInTheDocument();
  });

  it('一般ユーザーには「ユーザー管理」リンクを表示しない', () => {
    render(
      <ProfileForm
        user={mockUser}
        onUpdateProfile={mockOnUpdateProfile}
        onChangePassword={mockOnChangePassword}
        onNavigateToUserManagement={mockOnNavigateToUserManagement}
      />
    );

    expect(screen.queryByRole('link', { name: /ユーザー管理/i })).not.toBeInTheDocument();
  });

  it('2FA有効ユーザーにはバッジを表示する', () => {
    const twoFactorUser: UserProfile = {
      ...mockUser,
      twoFactorEnabled: true,
    };

    render(
      <ProfileForm
        user={twoFactorUser}
        onUpdateProfile={mockOnUpdateProfile}
        onChangePassword={mockOnChangePassword}
      />
    );

    expect(screen.getByText(/2FA有効/i)).toBeInTheDocument();
  });

  it('アクセシビリティ属性が正しく設定されている', () => {
    render(
      <ProfileForm
        user={mockUser}
        onUpdateProfile={mockOnUpdateProfile}
        onChangePassword={mockOnChangePassword}
      />
    );

    const displayNameInput = screen.getByLabelText(/表示名/i);
    expect(displayNameInput).toHaveAttribute('aria-label');

    const saveButton = screen.getByRole('button', { name: /保存/i });
    expect(saveButton).toHaveAttribute('aria-label');
  });

  it('モバイル最適化レイアウトが適用されている', () => {
    render(
      <ProfileForm
        user={mockUser}
        onUpdateProfile={mockOnUpdateProfile}
        onChangePassword={mockOnChangePassword}
      />
    );

    const form = screen.getByRole('form');
    expect(form).toHaveStyle({ maxWidth: '600px' });
  });
});
