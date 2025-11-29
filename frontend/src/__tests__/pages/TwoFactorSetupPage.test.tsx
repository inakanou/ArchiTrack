/**
 * 2要素認証セットアップページのテスト
 *
 * 要件17: 2要素認証の設定と管理機能
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TwoFactorSetupPage } from '../../pages/TwoFactorSetupPage';

// API clientをモック
vi.mock('../../api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

import { apiClient } from '../../api/client';

// react-router-domのuseNavigateをモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// TwoFactorSetupFormコンポーネントをモック
vi.mock('../../components/TwoFactorSetupForm', () => ({
  default: ({
    onSetupStart,
    onEnable,
    onComplete,
    onCancel,
  }: {
    onSetupStart: () => Promise<{
      success: boolean;
      data?: { secret: string; qrCodeDataUrl: string };
      error?: string;
    }>;
    onEnable: (
      code: string
    ) => Promise<{ success: boolean; data?: { backupCodes: string[] }; error?: string }>;
    onComplete: () => void;
    onCancel: () => void;
  }) => (
    <div data-testid="two-factor-setup-form">
      <button onClick={() => onSetupStart()} data-testid="setup-start-button">
        セットアップ開始
      </button>
      <button onClick={() => onEnable('123456')} data-testid="enable-button">
        有効化
      </button>
      <button onClick={() => onComplete()} data-testid="complete-button">
        完了
      </button>
      <button onClick={() => onCancel()} data-testid="cancel-button">
        キャンセル
      </button>
    </div>
  ),
}));

const renderTwoFactorSetupPage = () => {
  return render(
    <MemoryRouter initialEntries={['/2fa-setup']}>
      <Routes>
        <Route path="/2fa-setup" element={<TwoFactorSetupPage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('TwoFactorSetupPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('初期表示', () => {
    it('ページタイトルと説明を表示する', () => {
      renderTwoFactorSetupPage();

      expect(screen.getByRole('heading', { name: /2要素認証の設定/i })).toBeInTheDocument();
      expect(screen.getByText(/アカウントのセキュリティを強化します/i)).toBeInTheDocument();
    });

    it('TwoFactorSetupFormコンポーネントを表示する', () => {
      renderTwoFactorSetupPage();

      expect(screen.getByTestId('two-factor-setup-form')).toBeInTheDocument();
    });
  });

  describe('セットアップ開始処理', () => {
    it('セットアップ開始が成功した場合、QRコードデータを返す', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeDataUrl: 'data:image/png;base64,test',
      });

      renderTwoFactorSetupPage();

      await user.click(screen.getByTestId('setup-start-button'));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/2fa/setup', {});
      });
    });

    it('セットアップ開始が失敗した場合、エラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Setup failed'));

      renderTwoFactorSetupPage();

      await user.click(screen.getByTestId('setup-start-button'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          '2FAセットアップの初期化に失敗しました'
        );
      });
    });
  });

  describe('2FA有効化処理', () => {
    it('有効化が成功した場合、バックアップコードを返す', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        backupCodes: ['CODE1', 'CODE2', 'CODE3'],
      });

      renderTwoFactorSetupPage();

      await user.click(screen.getByTestId('enable-button'));

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/2fa/enable', {
          totpCode: '123456',
        });
      });
    });

    it('有効化が失敗した場合、エラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Enable failed'));

      renderTwoFactorSetupPage();

      await user.click(screen.getByTestId('enable-button'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('認証コードの検証に失敗しました');
      });
    });
  });

  describe('完了処理', () => {
    it('完了ボタンをクリックするとプロフィールページへ遷移する', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({
        advanceTimers: (ms) => vi.advanceTimersByTime(ms),
      });

      renderTwoFactorSetupPage();

      await user.click(screen.getByTestId('complete-button'));

      // setTimeout 後に navigate が呼ばれる
      await vi.advanceTimersByTimeAsync(1500);

      expect(mockNavigate).toHaveBeenCalledWith('/profile', {
        replace: true,
      });

      vi.useRealTimers();
    });
  });

  describe('キャンセル処理', () => {
    it('キャンセルボタンをクリックするとプロフィールページへ遷移する', async () => {
      vi.useRealTimers(); // 前のテストのfakeTimersをクリア
      const user = userEvent.setup();

      renderTwoFactorSetupPage();

      await user.click(screen.getByTestId('cancel-button'));

      expect(mockNavigate).toHaveBeenCalledWith('/profile');
    });
  });
});
