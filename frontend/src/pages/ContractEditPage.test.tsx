/**
 * @fileoverview 契約書編集画面テスト
 *
 * Task 8.1: 契約書編集ページコンポーネントを作成する
 * Task 14.1: 契約書編集成功時のトースト通知表示
 *
 * Requirements (contract-management):
 * - REQ-9.1: 契約書編集画面に全項目を編集可能な状態で表示する
 * - REQ-9.2: 編集保存（PUT、楽観的排他制御のversion送信）と契約書詳細画面への遷移
 * - REQ-9.3: 編集キャンセル時に変更を破棄して契約書詳細画面に戻る
 * - REQ-9.4: パンくずナビゲーションを表示する
 * - REQ-9.5: 編集時自動表示項目更新（見積書変更時の金額自動再計算）
 * - REQ-11.6: 契約書編集成功時に「契約書を更新しました。」のトースト通知を表示
 *
 * @module pages/ContractEditPage.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ContractEditPage from './ContractEditPage';
import * as contractsApi from '../api/contracts';
import * as projectsApi from '../api/projects';
import type { ContractDetail } from '../api/contracts';
import { ToastContext } from '../hooks/useToast';
import type { ToastContextValue } from '../hooks/useToast';

// モック
vi.mock('../api/contracts');
vi.mock('../api/projects');
vi.mock('../api/estimates', () => ({
  getEstimates: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  getEstimateDetail: vi.fn().mockResolvedValue(null),
}));
vi.mock('../api/company-info', () => ({
  getCompanyInfo: vi.fn().mockResolvedValue({ companyName: 'テスト建設株式会社' }),
}));
vi.mock('../components/projects/TradingPartnerSelect', () => ({
  default: ({
    value,
    onChange,
    label,
  }: {
    value: string;
    onChange: (v: string) => void;
    label: string;
  }) => (
    <div data-testid="trading-partner-select">
      <label>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  ),
}));

// ============================================================================
// テストデータ
// ============================================================================

const mockContractDetail: ContractDetail = {
  id: 'contract-1',
  projectId: 'project-1',
  contractType: 'NEW',
  status: 'BEFORE_CONTRACT',
  parentContractId: null,
  estimateId: 'estimate-1',
  contractDate: '2026-04-01',
  constructionStartDate: '2026-05-01',
  constructionEndDate: '2026-12-31',
  deliveryDate: '2027-01-15',
  taxRate: 0.1,
  paymentTerms: '着工時30%、中間30%、完成時40%',
  separateConstruction: '電気工事、給排水工事',
  otherNotes: '特になし',
  supervisorTradingPartnerId: 'tp-1',
  contractAmount: 11000000,
  constructionPrice: 10000000,
  taxAmount: 1000000,
  estimate: { id: 'estimate-1', name: 'テスト見積書' },
  parentContract: null,
  supervisorTradingPartner: { id: 'tp-1', name: '監理者株式会社' },
  project: {
    id: 'project-1',
    name: 'テストプロジェクト',
    siteAddress: '東京都渋谷区1-1-1',
    tradingPartner: { id: 'tp-client', name: 'テスト顧客株式会社' },
  },
  version: 3,
  createdAt: '2026-04-01T10:00:00.000Z',
  updatedAt: '2026-04-01T10:00:00.000Z',
};

const mockProjectDetail = {
  id: 'project-1',
  name: 'テストプロジェクト',
  siteAddress: '東京都渋谷区1-1-1',
  tradingPartnerId: 'tp-client',
  tradingPartner: {
    id: 'tp-client',
    name: 'テスト顧客株式会社',
    nameKana: 'テストコキャクカブシキガイシャ',
  },
  salesPerson: { id: 'user-001', displayName: '営業太郎' },
  status: 'PREPARING' as const,
  statusLabel: '準備中',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockUpdatedContract: ContractDetail = {
  ...mockContractDetail,
  paymentTerms: '月末締め翌月末払い',
  version: 4,
  updatedAt: '2026-04-02T10:00:00.000Z',
};

// useNavigateのモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

/** モックトーストコンテキスト値を作成 */
function createMockToastContext(): ToastContextValue {
  return {
    toasts: [],
    addToast: vi.fn().mockReturnValue('toast-1'),
    removeToast: vi.fn(),
    success: vi.fn().mockReturnValue('toast-1'),
    error: vi.fn().mockReturnValue('toast-1'),
    warning: vi.fn().mockReturnValue('toast-1'),
    info: vi.fn().mockReturnValue('toast-1'),
    projectCreated: vi.fn().mockReturnValue('toast-1'),
    projectUpdated: vi.fn().mockReturnValue('toast-1'),
    projectDeleted: vi.fn().mockReturnValue('toast-1'),
    projectStatusChanged: vi.fn().mockReturnValue('toast-1'),
    operationFailed: vi.fn().mockReturnValue('toast-1'),
  };
}

let mockToastContext: ToastContextValue;

function renderWithRouter(projectId = 'project-1', contractId = 'contract-1') {
  mockToastContext = createMockToastContext();
  return render(
    <ToastContext.Provider value={mockToastContext}>
      <MemoryRouter initialEntries={[`/projects/${projectId}/contracts/${contractId}/edit`]}>
        <Routes>
          <Route
            path="/projects/:projectId/contracts/:contractId/edit"
            element={<ContractEditPage />}
          />
        </Routes>
      </MemoryRouter>
    </ToastContext.Provider>
  );
}

describe('ContractEditPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockContractDetail);
    vi.mocked(projectsApi.getProject).mockResolvedValue(mockProjectDetail);
  });

  // ==========================================================================
  // REQ-9.1: 編集画面に全項目を編集可能な状態で表示する
  // ==========================================================================

  /**
   * REQ-9.1: 編集画面が正しくレンダリングされる
   */
  it('編集画面が正しくレンダリングされる', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-edit-page')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: '契約書編集' })).toBeInTheDocument();
  });

  /**
   * REQ-9.1: 既存契約書データがフォームの初期値としてロードされる
   */
  it('既存契約書データをフォームの初期値としてロードする', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-form')).toBeInTheDocument();
    });

    // getContractDetailが呼ばれることを確認
    expect(contractsApi.getContractDetail).toHaveBeenCalledWith('contract-1');
  });

  /**
   * REQ-9.1: ContractFormがmode='edit'で表示される
   */
  it('ContractFormがmode=editで表示される', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-form')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // REQ-9.4: パンくずナビゲーションを表示する
  // ==========================================================================

  /**
   * REQ-9.4: パンくずナビゲーションを「ダッシュボード > プロジェクト一覧 > プロジェクト > 契約書一覧 > 契約書詳細 > 編集」形式で表示する
   */
  it('パンくずナビゲーションを正しい形式で表示する', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-edit-page')).toBeInTheDocument();
    });

    const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
    expect(breadcrumb).toBeInTheDocument();

    expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
    expect(screen.getByText('プロジェクト一覧')).toBeInTheDocument();

    const breadcrumbItems = breadcrumb.querySelectorAll('li');
    const labels = Array.from(breadcrumbItems).map((li) =>
      li.textContent?.replace(/^>\s*/, '').trim()
    );
    expect(labels).toContain('プロジェクト');
    expect(labels).toContain('契約書一覧');
    expect(labels).toContain('契約書詳細');
    expect(labels).toContain('編集');
  });

  // ==========================================================================
  // REQ-9.2: 編集保存（PUT、楽観的排他制御のversion送信）と詳細画面への遷移
  // ==========================================================================

  /**
   * REQ-9.2: 保存ボタン押下時にupdateContract APIを呼び出し、詳細画面に遷移する
   */
  it('フォーム送信時にupdateContract APIをversionと共に呼び出し、詳細画面に遷移する', async () => {
    vi.mocked(contractsApi.updateContract).mockResolvedValue(mockUpdatedContract);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-form')).toBeInTheDocument();
    });

    // 保存ボタンをクリック
    const submitButton = screen.getByRole('button', { name: '保存' });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(contractsApi.updateContract).toHaveBeenCalledWith(
        'contract-1',
        expect.objectContaining({
          version: 3,
        })
      );
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1/contracts/contract-1');
    });
  });

  // ==========================================================================
  // REQ-9.3: キャンセルボタン押下時の契約書詳細画面への遷移
  // ==========================================================================

  /**
   * REQ-9.3: キャンセルボタンクリックで契約書詳細画面に遷移する（変更破棄）
   */
  it('キャンセルボタンクリックで契約書詳細画面に遷移する', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-form')).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
    await userEvent.click(cancelButton);

    expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1/contracts/contract-1');
  });

  // ==========================================================================
  // ローディング・エラー状態
  // ==========================================================================

  /**
   * 契約書データロード中はローディング表示する
   */
  it('契約書データロード中はローディング表示する', async () => {
    vi.mocked(contractsApi.getContractDetail).mockImplementation(
      () => new Promise(() => {}) // 解決しないPromise
    );
    vi.mocked(projectsApi.getProject).mockImplementation(() => new Promise(() => {}));

    renderWithRouter();

    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  /**
   * 契約書データ取得失敗時にエラーメッセージを表示する
   */
  it('契約書データ取得失敗時にエラーメッセージを表示する', async () => {
    vi.mocked(contractsApi.getContractDetail).mockRejectedValue(new Error('Not Found'));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText('契約書の取得に失敗しました')).toBeInTheDocument();
  });

  /**
   * プロジェクト情報取得失敗時にエラーメッセージを表示する
   */
  it('プロジェクト情報取得失敗時にエラーメッセージを表示する', async () => {
    vi.mocked(projectsApi.getProject).mockRejectedValue(new Error('Not Found'));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText('プロジェクト情報の取得に失敗しました')).toBeInTheDocument();
  });

  /**
   * 更新API呼び出し失敗時にエラーメッセージを表示する
   */
  it('契約書更新失敗時にエラーメッセージを表示する', async () => {
    vi.mocked(contractsApi.updateContract).mockRejectedValue(new Error('Conflict'));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-form')).toBeInTheDocument();
    });

    const submitButton = screen.getByRole('button', { name: '保存' });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // エラートーストが呼ばれる
    expect(mockToastContext.error).toHaveBeenCalled();

    // 遷移しないことを確認
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // REQ-11.6: 契約書編集成功時のトースト通知
  // ==========================================================================

  /**
   * REQ-11.6: 契約書編集成功時に「契約書を更新しました。」のトースト通知を表示する
   */
  it('契約書編集成功時に「契約書を更新しました。」のトースト通知を表示する', async () => {
    vi.mocked(contractsApi.updateContract).mockResolvedValue(mockUpdatedContract);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-form')).toBeInTheDocument();
    });

    // 保存ボタンをクリック
    const submitButton = screen.getByRole('button', { name: '保存' });
    await userEvent.click(submitButton);

    // トースト通知が表示される
    await waitFor(() => {
      expect(mockToastContext.success).toHaveBeenCalledWith('契約書を更新しました。');
    });

    // 詳細画面に遷移する
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1/contracts/contract-1');
    });
  });
});
