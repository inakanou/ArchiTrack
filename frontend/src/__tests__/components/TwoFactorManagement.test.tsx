import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TwoFactorManagement from '../../components/TwoFactorManagement';
import type {
  BackupCodeInfo,
  RegenerateBackupCodesResultType,
  DisableTwoFactorResult,
} from '../../types/two-factor.types';

describe('TwoFactorManagement', () => {
  const mockOnRegenerateBackupCodes = vi.fn<() => Promise<RegenerateBackupCodesResultType>>();
  const mockOnDisableTwoFactor = vi.fn<(password: string) => Promise<DisableTwoFactorResult>>();
  const mockOnDisableSuccess = vi.fn<() => void>();

  const mockBackupCodes: BackupCodeInfo[] = [
    { code: 'ABCD****', usedAt: null, isUsed: false },
    { code: 'EFGH****', usedAt: null, isUsed: false },
    { code: 'IJKL****', usedAt: '2024-01-01T00:00:00Z', isUsed: true },
    { code: 'MNOP****', usedAt: null, isUsed: false },
    { code: 'QRST****', usedAt: null, isUsed: false },
    { code: 'UVWX****', usedAt: null, isUsed: false },
    { code: 'YZAB****', usedAt: '2024-01-02T00:00:00Z', isUsed: true },
    { code: 'CDEF****', usedAt: null, isUsed: false },
    { code: 'GHIJ****', usedAt: null, isUsed: false },
    { code: 'KLMN****', usedAt: null, isUsed: false },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnRegenerateBackupCodes.mockResolvedValue({
      success: true,
      data: {
        backupCodes: [
          'NEW1ABCD',
          'NEW2EFGH',
          'NEW3IJKL',
          'NEW4MNOP',
          'NEW5QRST',
          'NEW6UVWX',
          'NEW7YZAB',
          'NEW8CDEF',
          'NEW9GHIJ',
          'NEW0KLMN',
        ],
      },
    });
    mockOnDisableTwoFactor.mockResolvedValue({ success: true });
  });

  describe('バックアップコード表示', () => {
    it('バックアップコード一覧を表示する', () => {
      render(
        <TwoFactorManagement
          backupCodes={mockBackupCodes}
          onRegenerateBackupCodes={mockOnRegenerateBackupCodes}
          onDisableTwoFactor={mockOnDisableTwoFactor}
          onDisableSuccess={mockOnDisableSuccess}
        />
      );

      // 10個のバックアップコードが表示される
      mockBackupCodes.forEach((code) => {
        expect(screen.getByText(code.code)).toBeInTheDocument();
      });
    });

    it('使用済みコードをグレーアウト・取り消し線で表示する', () => {
      render(
        <TwoFactorManagement
          backupCodes={mockBackupCodes}
          onRegenerateBackupCodes={mockOnRegenerateBackupCodes}
          onDisableTwoFactor={mockOnDisableTwoFactor}
          onDisableSuccess={mockOnDisableSuccess}
        />
      );

      // 使用済みコードの確認
      const usedCode1 = screen.getByText('IJKL****');
      expect(usedCode1).toHaveStyle({ textDecoration: 'line-through' });
      expect(usedCode1).toHaveStyle({ color: '#999' });
      expect(usedCode1).toHaveAttribute('aria-label', '使用済み');

      const usedCode2 = screen.getByText('YZAB****');
      expect(usedCode2).toHaveStyle({ textDecoration: 'line-through' });
      expect(usedCode2).toHaveStyle({ color: '#999' });
      expect(usedCode2).toHaveAttribute('aria-label', '使用済み');
    });

    it('残りバックアップコード数を表示する', () => {
      render(
        <TwoFactorManagement
          backupCodes={mockBackupCodes}
          onRegenerateBackupCodes={mockOnRegenerateBackupCodes}
          onDisableTwoFactor={mockOnDisableTwoFactor}
          onDisableSuccess={mockOnDisableSuccess}
        />
      );

      // 残り8個（10個中2個使用済み）
      expect(screen.getByText(/残り.*8.*個/i)).toBeInTheDocument();
    });

    it('残り3個以下の場合、警告メッセージを表示する', () => {
      const lowBackupCodes: BackupCodeInfo[] = [
        { code: 'ABCD****', usedAt: null, isUsed: false },
        { code: 'EFGH****', usedAt: null, isUsed: false },
        { code: 'IJKL****', usedAt: null, isUsed: false },
        { code: 'MNOP****', usedAt: '2024-01-01T00:00:00Z', isUsed: true },
        { code: 'QRST****', usedAt: '2024-01-02T00:00:00Z', isUsed: true },
        { code: 'UVWX****', usedAt: '2024-01-03T00:00:00Z', isUsed: true },
        { code: 'YZAB****', usedAt: '2024-01-04T00:00:00Z', isUsed: true },
        { code: 'CDEF****', usedAt: '2024-01-05T00:00:00Z', isUsed: true },
        { code: 'GHIJ****', usedAt: '2024-01-06T00:00:00Z', isUsed: true },
        { code: 'KLMN****', usedAt: '2024-01-07T00:00:00Z', isUsed: true },
      ];

      render(
        <TwoFactorManagement
          backupCodes={lowBackupCodes}
          onRegenerateBackupCodes={mockOnRegenerateBackupCodes}
          onDisableTwoFactor={mockOnDisableTwoFactor}
          onDisableSuccess={mockOnDisableSuccess}
        />
      );

      // 警告メッセージ
      expect(screen.getByText(/バックアップコードの残りが少なくなっています/i)).toBeInTheDocument();
    });
  });

  describe('バックアップコード再生成', () => {
    it('再生成ボタンをクリックすると確認ダイアログを表示する', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <TwoFactorManagement
          backupCodes={mockBackupCodes}
          onRegenerateBackupCodes={mockOnRegenerateBackupCodes}
          onDisableTwoFactor={mockOnDisableTwoFactor}
          onDisableSuccess={mockOnDisableSuccess}
        />
      );

      const regenerateButton = screen.getByRole('button', { name: /再生成/i });
      await user.click(regenerateButton);

      // 確認ダイアログが表示される
      expect(
        screen.getByText(/既存のバックアップコードはすべて無効になります/i)
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /確認/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /キャンセル/i })).toBeInTheDocument();
    });

    it('再生成成功時に新しいコードを表示する', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <TwoFactorManagement
          backupCodes={mockBackupCodes}
          onRegenerateBackupCodes={mockOnRegenerateBackupCodes}
          onDisableTwoFactor={mockOnDisableTwoFactor}
          onDisableSuccess={mockOnDisableSuccess}
        />
      );

      const regenerateButton = screen.getByRole('button', { name: /再生成/i });
      await user.click(regenerateButton);

      const confirmButton = screen.getByRole('button', { name: /確認/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockOnRegenerateBackupCodes).toHaveBeenCalled();
      });

      // 新しいバックアップコードが表示される
      await waitFor(() => {
        expect(screen.getByText('NEW1ABCD')).toBeInTheDocument();
      });

      // ダウンロードボタンとコピーボタンが表示される
      expect(screen.getByRole('button', { name: /ダウンロード/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /コピー/i })).toBeInTheDocument();
    });
  });

  describe('2FA無効化', () => {
    it('無効化ボタンをクリックするとパスワード確認ダイアログを表示する', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <TwoFactorManagement
          backupCodes={mockBackupCodes}
          onRegenerateBackupCodes={mockOnRegenerateBackupCodes}
          onDisableTwoFactor={mockOnDisableTwoFactor}
          onDisableSuccess={mockOnDisableSuccess}
        />
      );

      const disableButton = screen.getByRole('button', { name: /2FAを無効化/i });
      await user.click(disableButton);

      // パスワード確認ダイアログが表示される
      expect(screen.getByLabelText(/パスワード/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /無効化する/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /キャンセル/i })).toBeInTheDocument();
    });

    it('無効化成功時にonDisableSuccessが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <TwoFactorManagement
          backupCodes={mockBackupCodes}
          onRegenerateBackupCodes={mockOnRegenerateBackupCodes}
          onDisableTwoFactor={mockOnDisableTwoFactor}
          onDisableSuccess={mockOnDisableSuccess}
        />
      );

      const disableButton = screen.getByRole('button', { name: /2FAを無効化/i });
      await user.click(disableButton);

      const passwordInput = screen.getByLabelText(/パスワード/i);
      await user.type(passwordInput, 'mypassword123');

      const confirmButton = screen.getByRole('button', { name: /無効化する/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockOnDisableTwoFactor).toHaveBeenCalledWith('mypassword123');
      });

      await waitFor(() => {
        expect(mockOnDisableSuccess).toHaveBeenCalled();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('エラーメッセージにaria-live属性が設定されている', async () => {
      const user = userEvent.setup({ delay: null });
      mockOnDisableTwoFactor.mockResolvedValue({
        success: false,
        error: 'パスワードが正しくありません',
      });

      render(
        <TwoFactorManagement
          backupCodes={mockBackupCodes}
          onRegenerateBackupCodes={mockOnRegenerateBackupCodes}
          onDisableTwoFactor={mockOnDisableTwoFactor}
          onDisableSuccess={mockOnDisableSuccess}
        />
      );

      const disableButton = screen.getByRole('button', { name: /2FAを無効化/i });
      await user.click(disableButton);

      const passwordInput = screen.getByLabelText(/パスワード/i);
      await user.type(passwordInput, 'wrongpassword');

      const confirmButton = screen.getByRole('button', { name: /無効化する/i });
      await user.click(confirmButton);

      await waitFor(() => {
        const errorDiv = screen.getByRole('alert');
        expect(errorDiv).toHaveAttribute('aria-live', 'polite');
        expect(errorDiv).toHaveTextContent('パスワードが正しくありません');
      });
    });
  });
});
