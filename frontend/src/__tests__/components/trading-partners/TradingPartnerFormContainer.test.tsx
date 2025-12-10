/**
 * @fileoverview TradingPartnerFormContainerコンポーネントのユニットテスト
 *
 * Task 8.2: フォーム送信とエラーハンドリングの実装
 *
 * テスト対象:
 * - 作成・更新APIの呼び出し
 * - 成功時のメッセージ表示と画面遷移
 * - バリデーションエラー、重複エラー、競合エラーの表示
 * - ネットワークエラー時の再試行ボタン表示
 *
 * Requirements:
 * - 2.7: 有効なデータを入力して保存ボタンクリックで新しい取引先レコードを作成
 * - 2.8: 取引先作成成功時に成功メッセージを表示し一覧ページに遷移
 * - 2.11: 同一の取引先名が既に存在する場合のエラー表示
 * - 4.5: 変更を保存時に取引先レコードを更新
 * - 4.6: 更新成功時に成功メッセージを表示し詳細ページに遷移
 * - 4.8: 別の取引先と重複する取引先名に変更しようとした場合のエラー表示
 * - 8.1: ネットワークエラー時の再試行ボタン表示
 * - 8.2: サーバーエラー（5xx）時のメッセージ表示
 * - 8.4: ToastNotificationでエラー通知
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TradingPartnerFormContainer from '../../../components/trading-partners/TradingPartnerFormContainer';
import { ApiError } from '../../../api/client';
import type { TradingPartnerInfo } from '../../../types/trading-partner.types';

// React Router モック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'test-id' }),
  };
});

// API モック
const mockCreateTradingPartner = vi.fn();
const mockUpdateTradingPartner = vi.fn();
const mockGetTradingPartner = vi.fn();
vi.mock('../../../api/trading-partners', () => ({
  createTradingPartner: (...args: unknown[]) => mockCreateTradingPartner(...args),
  updateTradingPartner: (...args: unknown[]) => mockUpdateTradingPartner(...args),
  getTradingPartner: (...args: unknown[]) => mockGetTradingPartner(...args),
}));

// Toast モック
const mockSuccess = vi.fn();
const mockError = vi.fn();
vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    success: mockSuccess,
    error: mockError,
    toasts: [],
    addToast: vi.fn(),
    removeToast: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    projectCreated: vi.fn(),
    projectUpdated: vi.fn(),
    projectDeleted: vi.fn(),
    projectStatusChanged: vi.fn(),
    operationFailed: vi.fn(),
  }),
}));

// TradingPartnerFormモック
vi.mock('../../../components/trading-partners/TradingPartnerForm', () => ({
  default: ({
    mode,
    initialData,
    onSubmit,
    onCancel,
    isSubmitting,
  }: {
    mode: 'create' | 'edit';
    initialData?: Record<string, unknown>;
    onSubmit: (data: Record<string, unknown>) => Promise<void>;
    onCancel: () => void;
    isSubmitting: boolean;
  }) => (
    <div data-testid="trading-partner-form">
      <span data-testid="form-mode">{mode}</span>
      <span data-testid="form-is-submitting">{isSubmitting ? 'true' : 'false'}</span>
      {initialData && <span data-testid="form-initial-data">{JSON.stringify(initialData)}</span>}
      <button
        onClick={() =>
          onSubmit({
            name: '株式会社テスト',
            nameKana: 'カブシキガイシャテスト',
            types: ['CUSTOMER'],
            address: '東京都渋谷区1-1-1',
            branchName: null,
            branchNameKana: null,
            representativeName: null,
            representativeNameKana: null,
            phoneNumber: null,
            faxNumber: null,
            email: null,
            billingClosingDay: null,
            paymentMonthOffset: null,
            paymentDay: null,
            notes: null,
          })
        }
        disabled={isSubmitting}
        data-testid="submit-button"
      >
        {mode === 'create' ? '作成' : '保存'}
      </button>
      <button onClick={onCancel} data-testid="cancel-button">
        キャンセル
      </button>
    </div>
  ),
}));

describe('TradingPartnerFormContainer', () => {
  const mockTradingPartner: TradingPartnerInfo = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: '株式会社テスト',
    nameKana: 'カブシキガイシャテスト',
    branchName: null,
    branchNameKana: null,
    representativeName: null,
    representativeNameKana: null,
    types: ['CUSTOMER'],
    address: '東京都渋谷区1-1-1',
    phoneNumber: null,
    faxNumber: null,
    email: null,
    billingClosingDay: null,
    paymentMonthOffset: null,
    paymentDay: null,
    notes: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 作成モードテスト
  // ============================================================================
  describe('作成モード', () => {
    it('作成モードで正しくレンダリングされる', () => {
      render(
        <MemoryRouter>
          <TradingPartnerFormContainer mode="create" />
        </MemoryRouter>
      );

      expect(screen.getByTestId('form-mode')).toHaveTextContent('create');
    });

    it('作成成功時に成功メッセージを表示し一覧ページに遷移する (Requirement 2.8)', async () => {
      mockCreateTradingPartner.mockResolvedValueOnce(mockTradingPartner);
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <TradingPartnerFormContainer mode="create" />
        </MemoryRouter>
      );

      await user.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        expect(mockCreateTradingPartner).toHaveBeenCalled();
        expect(mockSuccess).toHaveBeenCalledWith('取引先を作成しました');
        expect(mockNavigate).toHaveBeenCalledWith('/trading-partners');
      });
    });

    it('バリデーションエラー（400）時にエラーメッセージを表示する', async () => {
      const validationError = new ApiError(400, '取引先名は必須です');
      mockCreateTradingPartner.mockRejectedValueOnce(validationError);
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <TradingPartnerFormContainer mode="create" />
        </MemoryRouter>
      );

      await user.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        expect(mockError).toHaveBeenCalledWith('取引先名は必須です');
      });
    });

    it('重複エラー（409）時にエラーメッセージを表示する (Requirement 2.11)', async () => {
      const duplicateError = new ApiError(409, 'この取引先名は既に登録されています');
      mockCreateTradingPartner.mockRejectedValueOnce(duplicateError);
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <TradingPartnerFormContainer mode="create" />
        </MemoryRouter>
      );

      await user.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        expect(mockError).toHaveBeenCalledWith('この取引先名は既に登録されています');
      });
    });

    it('ネットワークエラー時に再試行可能な状態になる (Requirement 8.1)', async () => {
      const networkError = new ApiError(0, 'Network error');
      mockCreateTradingPartner.mockRejectedValueOnce(networkError);
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <TradingPartnerFormContainer mode="create" />
        </MemoryRouter>
      );

      await user.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        // ネットワークエラー表示を確認
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/通信エラーが発生しました/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /再試行/ })).toBeInTheDocument();
      });
    });

    it('サーバーエラー（500）時にエラーメッセージを表示する (Requirement 8.2)', async () => {
      const serverError = new ApiError(500, 'Internal Server Error');
      mockCreateTradingPartner.mockRejectedValueOnce(serverError);
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <TradingPartnerFormContainer mode="create" />
        </MemoryRouter>
      );

      await user.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        // サーバーエラー表示を確認
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/システムエラーが発生しました/)).toBeInTheDocument();
      });
    });

    it('送信中はボタンが無効化される', async () => {
      // 送信が完了しないようにPromiseを保留状態にする
      let resolvePromise: (value: TradingPartnerInfo) => void;
      const pendingPromise = new Promise<TradingPartnerInfo>((resolve) => {
        resolvePromise = resolve;
      });
      mockCreateTradingPartner.mockReturnValueOnce(pendingPromise);
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <TradingPartnerFormContainer mode="create" />
        </MemoryRouter>
      );

      await user.click(screen.getByTestId('submit-button'));

      // 送信中状態を確認
      await waitFor(() => {
        expect(screen.getByTestId('form-is-submitting')).toHaveTextContent('true');
      });

      // Promiseを解決してクリーンアップ
      resolvePromise!(mockTradingPartner);
    });

    it('キャンセルボタンクリックで一覧ページに遷移する', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <TradingPartnerFormContainer mode="create" />
        </MemoryRouter>
      );

      await user.click(screen.getByTestId('cancel-button'));

      expect(mockNavigate).toHaveBeenCalledWith('/trading-partners');
    });
  });

  // ============================================================================
  // 編集モードテスト
  // ============================================================================
  describe('編集モード', () => {
    beforeEach(() => {
      mockGetTradingPartner.mockResolvedValue(mockTradingPartner);
    });

    it('編集モードで正しくレンダリングされる', async () => {
      render(
        <MemoryRouter>
          <TradingPartnerFormContainer mode="edit" tradingPartnerId={mockTradingPartner.id} />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('form-mode')).toHaveTextContent('edit');
      });
    });

    it('編集モードで初期データをフェッチしてプリセットする', async () => {
      render(
        <MemoryRouter>
          <TradingPartnerFormContainer mode="edit" tradingPartnerId={mockTradingPartner.id} />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(mockGetTradingPartner).toHaveBeenCalledWith(mockTradingPartner.id);
        expect(screen.getByTestId('form-initial-data')).toBeInTheDocument();
      });
    });

    it('更新成功時に成功メッセージを表示し詳細ページに遷移する (Requirement 4.6)', async () => {
      mockUpdateTradingPartner.mockResolvedValueOnce({
        ...mockTradingPartner,
        name: '株式会社テスト更新',
      });
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <TradingPartnerFormContainer mode="edit" tradingPartnerId={mockTradingPartner.id} />
        </MemoryRouter>
      );

      // データ読み込み完了を待つ
      await waitFor(() => {
        expect(screen.getByTestId('form-initial-data')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        expect(mockUpdateTradingPartner).toHaveBeenCalled();
        expect(mockSuccess).toHaveBeenCalledWith('取引先を更新しました');
        expect(mockNavigate).toHaveBeenCalledWith(`/trading-partners/${mockTradingPartner.id}`);
      });
    });

    it('重複エラー（409）時にエラーメッセージを表示する (Requirement 4.8)', async () => {
      const duplicateError = new ApiError(409, 'この取引先名は既に登録されています');
      mockUpdateTradingPartner.mockRejectedValueOnce(duplicateError);
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <TradingPartnerFormContainer mode="edit" tradingPartnerId={mockTradingPartner.id} />
        </MemoryRouter>
      );

      // データ読み込み完了を待つ
      await waitFor(() => {
        expect(screen.getByTestId('form-initial-data')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        expect(mockError).toHaveBeenCalledWith('この取引先名は既に登録されています');
      });
    });

    it('競合エラー（楽観的排他制御）時にエラーメッセージを表示する', async () => {
      const conflictError = new ApiError(
        409,
        '他のユーザーによって更新されました。画面を更新してください'
      );
      mockUpdateTradingPartner.mockRejectedValueOnce(conflictError);
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <TradingPartnerFormContainer mode="edit" tradingPartnerId={mockTradingPartner.id} />
        </MemoryRouter>
      );

      // データ読み込み完了を待つ
      await waitFor(() => {
        expect(screen.getByTestId('form-initial-data')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        expect(mockError).toHaveBeenCalledWith(
          '他のユーザーによって更新されました。画面を更新してください'
        );
      });
    });

    it('キャンセルボタンクリックで詳細ページに遷移する', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <TradingPartnerFormContainer mode="edit" tradingPartnerId={mockTradingPartner.id} />
        </MemoryRouter>
      );

      // データ読み込み完了を待つ
      await waitFor(() => {
        expect(screen.getByTestId('form-initial-data')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('cancel-button'));

      expect(mockNavigate).toHaveBeenCalledWith(`/trading-partners/${mockTradingPartner.id}`);
    });

    it('データ取得エラー時にエラー画面を表示する', async () => {
      const notFoundError = new ApiError(404, '取引先が見つかりません');
      mockGetTradingPartner.mockRejectedValueOnce(notFoundError);

      render(
        <MemoryRouter>
          <TradingPartnerFormContainer mode="edit" tradingPartnerId="non-existent-id" />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // ネットワークエラー再試行テスト
  // ============================================================================
  describe('ネットワークエラー再試行', () => {
    it('再試行ボタンクリックで再度API呼び出しを行う', async () => {
      const networkError = new ApiError(0, 'Network error');
      mockCreateTradingPartner
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(mockTradingPartner);
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <TradingPartnerFormContainer mode="create" />
        </MemoryRouter>
      );

      // 最初の送信でエラー
      await user.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /再試行/ })).toBeInTheDocument();
      });

      // 再試行ボタンをクリック
      await user.click(screen.getByRole('button', { name: /再試行/ }));

      await waitFor(() => {
        expect(mockCreateTradingPartner).toHaveBeenCalledTimes(2);
        expect(mockSuccess).toHaveBeenCalledWith('取引先を作成しました');
      });
    });
  });
});
