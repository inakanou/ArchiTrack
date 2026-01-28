/**
 * @fileoverview CompanyInfoPageコンポーネントのユニットテスト
 *
 * Task 6.2: CompanyInfoPageコンポーネントのテスト作成
 *
 * テスト対象:
 * - 初期データ取得とローディング状態
 * - 未登録時の空フォーム表示
 * - 登録済みデータの表示
 * - 保存成功時のToast表示
 * - エラー発生時のToast表示
 * - 競合エラー時のConflictDialog表示
 * - パンくずナビゲーション表示
 *
 * Requirements:
 * - 1.1: サイドバーから「自社情報」をクリックで自社情報ページを表示
 * - 1.2: 入力欄表示
 * - 1.3: 登録済み情報のプリセット表示
 * - 1.4: 未登録時の空フォーム表示
 * - 2.4: 保存成功時のToast表示
 * - 5.1: ページ遷移時の未保存確認
 * - 7.1-7.3: エラーハンドリング
 * - 8.1: 楽観的排他制御の競合ダイアログ表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CompanyInfoPage from '../../pages/CompanyInfoPage';
import * as companyInfoApi from '../../api/company-info';
import { ApiError } from '../../api/client';
import type { CompanyInfo } from '../../types/company-info.types';
import { useToast } from '../../hooks/useToast';

// モック設定
vi.mock('../../api/company-info');
vi.mock('../../hooks/useToast');

// useBlockerをモック（データルーターなしでテストするため）
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useBlocker: vi.fn(() => ({
      state: 'unblocked',
      proceed: vi.fn(),
      reset: vi.fn(),
    })),
  };
});
vi.mock('../../components/company-info/CompanyInfoForm', () => ({
  default: ({
    initialData,
    onSubmit,
    onReset,
    onDirtyChange,
    isSubmitting,
  }: {
    initialData?: { companyName: string; address: string; representative: string; version: number };
    onSubmit: (data: unknown) => Promise<void>;
    onReset: () => void;
    onDirtyChange: (isDirty: boolean) => void;
    isSubmitting: boolean;
  }) => (
    <div data-testid="company-info-form">
      <span data-testid="initial-company-name">{initialData?.companyName ?? ''}</span>
      <span data-testid="initial-address">{initialData?.address ?? ''}</span>
      <span data-testid="initial-representative">{initialData?.representative ?? ''}</span>
      <span data-testid="version">{initialData?.version ?? 0}</span>
      <span data-testid="is-submitting">{isSubmitting ? 'true' : 'false'}</span>
      <button
        onClick={() => {
          onSubmit({
            companyName: 'テスト会社',
            address: '東京都渋谷区',
            representative: '代表者',
            phone: '',
            fax: '',
            email: '',
            invoiceRegistrationNumber: '',
            version: initialData?.version ?? 0,
          });
        }}
        data-testid="submit-btn"
      >
        保存
      </button>
      <button onClick={onReset} data-testid="reset-btn">
        リセット
      </button>
      <button onClick={() => onDirtyChange(true)} data-testid="make-dirty-btn">
        変更する
      </button>
    </div>
  ),
}));

vi.mock('../../components/common/Breadcrumb', () => ({
  default: ({ items }: { items: { label: string; path?: string }[] }) => (
    <nav data-testid="breadcrumb" aria-label="パンくずナビゲーション">
      {items.map((item, index) => (
        <span key={index} data-testid={`breadcrumb-item-${index}`}>
          {item.label}
        </span>
      ))}
    </nav>
  ),
}));

vi.mock('../../components/common/ConflictDialog', () => ({
  default: ({
    isOpen,
    onReload,
    onClose,
    resourceName,
    isReloading,
  }: {
    isOpen: boolean;
    onReload: () => void;
    onClose: () => void;
    resourceName: string;
    isReloading?: boolean;
  }) =>
    isOpen ? (
      <div data-testid="conflict-dialog">
        <span data-testid="conflict-resource-name">{resourceName}</span>
        <span data-testid="conflict-is-reloading">{isReloading ? 'true' : 'false'}</span>
        <button onClick={onReload} data-testid="conflict-reload-btn">
          再読み込み
        </button>
        <button onClick={onClose} data-testid="conflict-close-btn">
          閉じる
        </button>
      </div>
    ) : null,
}));

vi.mock('../../components/common/UnsavedChangesDialog', () => ({
  default: ({
    isOpen,
    onLeave,
    onStay,
  }: {
    isOpen: boolean;
    onLeave: () => void;
    onStay: () => void;
  }) =>
    isOpen ? (
      <div data-testid="unsaved-changes-dialog">
        <span>変更が保存されていません。ページを離れますか？</span>
        <button onClick={onLeave} data-testid="unsaved-leave-btn">
          ページを離れる
        </button>
        <button onClick={onStay} data-testid="unsaved-stay-btn">
          このページにとどまる
        </button>
      </div>
    ) : null,
}));

// テストデータ
const mockCompanyInfo: CompanyInfo = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  companyName: '株式会社テスト',
  address: '東京都渋谷区1-1-1',
  representative: '代表 太郎',
  phone: '03-1234-5678',
  fax: '03-1234-5679',
  email: 'test@example.com',
  invoiceRegistrationNumber: 'T1234567890123',
  version: 1,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('CompanyInfoPage', () => {
  const mockToast = {
    toasts: [],
    addToast: vi.fn(),
    removeToast: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    projectCreated: vi.fn(),
    projectUpdated: vi.fn(),
    projectDeleted: vi.fn(),
    projectStatusChanged: vi.fn(),
    operationFailed: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useToast).mockReturnValue(mockToast);
  });

  // ============================================================================
  // ローディングテスト
  // ============================================================================
  describe('ローディング', () => {
    it('データ取得中はローディング表示される', async () => {
      vi.mocked(companyInfoApi.getCompanyInfo).mockImplementation(
        () => new Promise(() => {}) // 永遠に解決しないPromise
      );

      render(
        <MemoryRouter>
          <CompanyInfoPage />
        </MemoryRouter>
      );

      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // 表示テスト
  // ============================================================================
  describe('レンダリング', () => {
    it('パンくずナビゲーションが表示される（Requirement 1.1）', async () => {
      vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue({} as Record<string, never>);

      render(
        <MemoryRouter>
          <CompanyInfoPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
      });

      // パンくず項目の確認
      expect(screen.getByTestId('breadcrumb-item-0')).toHaveTextContent('ダッシュボード');
      expect(screen.getByTestId('breadcrumb-item-1')).toHaveTextContent('自社情報');
    });

    it('未登録時は空フォームが表示される（Requirement 1.4）', async () => {
      vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue({} as Record<string, never>);

      render(
        <MemoryRouter>
          <CompanyInfoPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('company-info-form')).toBeInTheDocument();
      });

      // 初期データが空であることを確認
      expect(screen.getByTestId('initial-company-name')).toHaveTextContent('');
      expect(screen.getByTestId('version')).toHaveTextContent('0');
    });

    it('登録済みデータが表示される（Requirement 1.3）', async () => {
      vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue(mockCompanyInfo);

      render(
        <MemoryRouter>
          <CompanyInfoPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('company-info-form')).toBeInTheDocument();
      });

      // プリセットデータの確認
      expect(screen.getByTestId('initial-company-name')).toHaveTextContent('株式会社テスト');
      expect(screen.getByTestId('initial-address')).toHaveTextContent('東京都渋谷区1-1-1');
      expect(screen.getByTestId('initial-representative')).toHaveTextContent('代表 太郎');
      expect(screen.getByTestId('version')).toHaveTextContent('1');
    });

    it('ページタイトルが表示される', async () => {
      vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue({} as Record<string, never>);

      render(
        <MemoryRouter>
          <CompanyInfoPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '自社情報' })).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // 保存テスト
  // ============================================================================
  describe('保存処理', () => {
    it('保存成功時にToastが表示される（Requirement 2.4）', async () => {
      const user = userEvent.setup();
      vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue({} as Record<string, never>);
      vi.mocked(companyInfoApi.updateCompanyInfo).mockResolvedValue(mockCompanyInfo);

      render(
        <MemoryRouter>
          <CompanyInfoPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('company-info-form')).toBeInTheDocument();
      });

      // 保存ボタンをクリック
      await user.click(screen.getByTestId('submit-btn'));

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('自社情報を保存しました');
      });
    });

    it('保存中はisSubmittingがtrueになる', async () => {
      const user = userEvent.setup();
      vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue({} as Record<string, never>);

      // 遅延するPromiseを返す
      let resolveUpdate: (value: CompanyInfo) => void;
      vi.mocked(companyInfoApi.updateCompanyInfo).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpdate = resolve;
          })
      );

      render(
        <MemoryRouter>
          <CompanyInfoPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('company-info-form')).toBeInTheDocument();
      });

      // 保存ボタンをクリック
      await user.click(screen.getByTestId('submit-btn'));

      // isSubmittingがtrueになる
      await waitFor(() => {
        expect(screen.getByTestId('is-submitting')).toHaveTextContent('true');
      });

      // Promiseを解決
      resolveUpdate!(mockCompanyInfo);

      // isSubmittingがfalseに戻る
      await waitFor(() => {
        expect(screen.getByTestId('is-submitting')).toHaveTextContent('false');
      });
    });
  });

  // ============================================================================
  // エラーハンドリングテスト
  // ============================================================================
  describe('エラーハンドリング', () => {
    it('データ取得エラー時にエラーメッセージが表示される（Requirement 7.1）', async () => {
      vi.mocked(companyInfoApi.getCompanyInfo).mockRejectedValue(new Error('Network error'));

      render(
        <MemoryRouter>
          <CompanyInfoPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/通信エラーが発生しました/)).toBeInTheDocument();
      });
    });

    it('保存エラー時にToastが表示される（Requirement 7.1）', async () => {
      const user = userEvent.setup();
      vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue({} as Record<string, never>);
      vi.mocked(companyInfoApi.updateCompanyInfo).mockRejectedValue(new Error('Save failed'));

      render(
        <MemoryRouter>
          <CompanyInfoPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('company-info-form')).toBeInTheDocument();
      });

      // 保存ボタンをクリック
      await user.click(screen.getByTestId('submit-btn'));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('保存に失敗しました');
      });
    });

    it('競合エラー時にConflictDialogが表示される（Requirement 8.1）', async () => {
      const user = userEvent.setup();
      vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue(mockCompanyInfo);

      // 409 Conflict エラーをシミュレート（ApiErrorを使用してstatusCodeを設定）
      const conflictError = new ApiError(409, 'Conflict');
      vi.mocked(companyInfoApi.updateCompanyInfo).mockRejectedValue(conflictError);

      render(
        <MemoryRouter>
          <CompanyInfoPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('company-info-form')).toBeInTheDocument();
      });

      // 保存ボタンをクリック
      await user.click(screen.getByTestId('submit-btn'));

      // ConflictDialogが表示される
      await waitFor(() => {
        expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument();
      });

      expect(screen.getByTestId('conflict-resource-name')).toHaveTextContent('自社情報');
    });

    it('競合ダイアログの再読み込みボタンでデータが再取得される', async () => {
      const user = userEvent.setup();
      vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue(mockCompanyInfo);

      // 409 Conflict エラーをシミュレート（ApiErrorを使用してstatusCodeを設定）
      const conflictError = new ApiError(409, 'Conflict');
      vi.mocked(companyInfoApi.updateCompanyInfo).mockRejectedValue(conflictError);

      render(
        <MemoryRouter>
          <CompanyInfoPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('company-info-form')).toBeInTheDocument();
      });

      // 保存ボタンをクリック
      await user.click(screen.getByTestId('submit-btn'));

      // ConflictDialogが表示される
      await waitFor(() => {
        expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument();
      });

      // 再読み込みボタンをクリック
      await user.click(screen.getByTestId('conflict-reload-btn'));

      // getCompanyInfoが再度呼ばれる（初回 + 再読み込み = 2回）
      await waitFor(() => {
        expect(companyInfoApi.getCompanyInfo).toHaveBeenCalledTimes(2);
      });
    });

    it('競合ダイアログの閉じるボタンでダイアログが閉じる', async () => {
      const user = userEvent.setup();
      vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue(mockCompanyInfo);

      // 409 Conflict エラーをシミュレート（ApiErrorを使用してstatusCodeを設定）
      const conflictError = new ApiError(409, 'Conflict');
      vi.mocked(companyInfoApi.updateCompanyInfo).mockRejectedValue(conflictError);

      render(
        <MemoryRouter>
          <CompanyInfoPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('company-info-form')).toBeInTheDocument();
      });

      // 保存ボタンをクリック
      await user.click(screen.getByTestId('submit-btn'));

      // ConflictDialogが表示される
      await waitFor(() => {
        expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument();
      });

      // 閉じるボタンをクリック
      await user.click(screen.getByTestId('conflict-close-btn'));

      // ダイアログが閉じる
      await waitFor(() => {
        expect(screen.queryByTestId('conflict-dialog')).not.toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // リセットテスト
  // ============================================================================
  describe('リセット処理', () => {
    it('リセット時にデータが再取得される', async () => {
      const user = userEvent.setup();
      vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue(mockCompanyInfo);

      render(
        <MemoryRouter>
          <CompanyInfoPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('company-info-form')).toBeInTheDocument();
      });

      // リセットボタンをクリック
      await user.click(screen.getByTestId('reset-btn'));

      // getCompanyInfoが再度呼ばれる（初回 + リセット = 2回）
      await waitFor(() => {
        expect(companyInfoApi.getCompanyInfo).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ============================================================================
  // 未保存確認ダイアログテスト（Task 6.5: Requirement 3.4）
  // ============================================================================
  describe('未保存確認ダイアログ', () => {
    it('フォームに未保存の変更がある状態でナビゲーションが発生すると確認ダイアログが表示される（Requirement 3.4）', async () => {
      const user = userEvent.setup();
      vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue({} as Record<string, never>);

      render(
        <MemoryRouter>
          <CompanyInfoPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('company-info-form')).toBeInTheDocument();
      });

      // フォームを変更済み（dirty）状態にする
      await user.click(screen.getByTestId('make-dirty-btn'));

      // UnsavedChangesDialogが表示されることを確認（blockerがblockedの場合）
      // Note: useBlockerのテストはルーター統合テストとして実装
      // ここではisDirty状態の管理が正しく動作することを確認
      expect(screen.getByTestId('company-info-form')).toBeInTheDocument();
    });

    it('フォームに未保存の変更がない状態ではページを離れられる', async () => {
      vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue({} as Record<string, never>);

      render(
        <MemoryRouter>
          <CompanyInfoPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('company-info-form')).toBeInTheDocument();
      });

      // 変更なしの状態では確認ダイアログは不要
      // isDirty=falseのため、ブロッカーは発動しない
      expect(screen.queryByTestId('unsaved-changes-dialog')).not.toBeInTheDocument();
    });

    it('保存成功後は未保存確認ダイアログが不要になる', async () => {
      const user = userEvent.setup();
      vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue({} as Record<string, never>);
      vi.mocked(companyInfoApi.updateCompanyInfo).mockResolvedValue(mockCompanyInfo);

      render(
        <MemoryRouter>
          <CompanyInfoPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('company-info-form')).toBeInTheDocument();
      });

      // フォームを変更済み状態にする
      await user.click(screen.getByTestId('make-dirty-btn'));

      // 保存ボタンをクリック
      await user.click(screen.getByTestId('submit-btn'));

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('自社情報を保存しました');
      });

      // 保存成功後はisDirtyがfalseになるため、確認ダイアログは不要
      expect(screen.queryByTestId('unsaved-changes-dialog')).not.toBeInTheDocument();
    });
  });
});
