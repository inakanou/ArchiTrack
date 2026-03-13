/**
 * @fileoverview ContractCreatePage テスト
 *
 * Task 6.1: 契約書新規作成ページコンポーネントを作成する
 *
 * Requirements (contract-management):
 * - REQ-2.3: 変更契約フォーム表示
 * - REQ-2.4: パンくずナビゲーション
 * - REQ-7.1: 作成ボタン押下時にAPI呼び出し（POST）と契約書詳細画面への遷移
 * - REQ-7.2: キャンセルボタン押下時に前画面への遷移（何も作成しない）
 * - REQ-7.3: 作成・キャンセルボタン表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ContractCreatePage from './ContractCreatePage';
import * as contractsApi from '../api/contracts';
import * as projectsApi from '../api/projects';

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

const mockProjectDetail = {
  id: 'proj-001',
  name: 'テストプロジェクト',
  siteAddress: '東京都渋谷区1-1-1',
  tradingPartnerId: 'tp-001',
  tradingPartner: {
    id: 'tp-001',
    name: 'テスト顧客株式会社',
    nameKana: 'テストコキャクカブシキガイシャ',
  },
  salesPerson: { id: 'user-001', displayName: '営業太郎' },
  status: 'PREPARING' as const,
  statusLabel: '準備中',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockCreatedContract = {
  id: 'contract-new-001',
  projectId: 'proj-001',
  contractType: 'NEW' as const,
  status: 'BEFORE_CONTRACT' as const,
  parentContractId: null,
  estimateId: 'est-001',
  contractDate: '2024-06-01',
  constructionStartDate: '2024-07-01',
  constructionEndDate: '2024-12-31',
  deliveryDate: '2025-01-15',
  taxRate: 0.1,
  paymentTerms: '月末締め翌月末払い',
  separateConstruction: '',
  otherNotes: '',
  supervisorTradingPartnerId: null,
  contractAmount: 11000000,
  constructionPrice: 10000000,
  taxAmount: 1000000,
  estimate: { id: 'est-001', name: 'テスト見積書' },
  parentContract: null,
  supervisorTradingPartner: null,
  project: {
    id: 'proj-001',
    name: 'テストプロジェクト',
    siteAddress: '東京都渋谷区1-1-1',
    tradingPartner: {
      id: 'tp-001',
      name: 'テスト顧客株式会社',
      nameKana: 'テストコキャクカブシキガイシャ',
    },
  },
  version: 0,
  createdAt: '2024-06-01T10:00:00.000Z',
  updatedAt: '2024-06-01T10:00:00.000Z',
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

function renderWithRouter(projectId = 'proj-001') {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/contracts/new`]}>
      <Routes>
        <Route path="/projects/:projectId/contracts/new" element={<ContractCreatePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ContractCreatePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(projectsApi.getProject).mockResolvedValue(mockProjectDetail);
  });

  /**
   * REQ-2.3, REQ-2.4: 新規作成画面が正しくレンダリングされる
   */
  it('新規作成画面が正しくレンダリングされる', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-create-page')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: '契約書作成' })).toBeInTheDocument();
  });

  /**
   * REQ-2.4: パンくずナビゲーションを表示する
   */
  it('パンくずナビゲーションを「ダッシュボード > プロジェクト一覧 > プロジェクト > 契約書一覧 > 新規作成」形式で表示する', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-create-page')).toBeInTheDocument();
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
    expect(labels).toContain('新規作成');
  });

  /**
   * ContractFormコンポーネントがmode='create'で表示される
   */
  it('ContractFormがmode=createで表示される', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-form')).toBeInTheDocument();
    });
  });

  /**
   * REQ-7.1: 作成ボタン押下時のAPI呼び出しと契約書詳細画面への遷移
   */
  it('フォーム送信時にcreateContract APIを呼び出し、詳細画面に遷移する', async () => {
    vi.mocked(contractsApi.createContract).mockResolvedValue(mockCreatedContract);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-form')).toBeInTheDocument();
    });

    // フォームを送信する（ContractForm内の作成ボタン）
    const submitButton = screen.getByRole('button', { name: '作成' });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(contractsApi.createContract).toHaveBeenCalledWith('proj-001', expect.any(Object));
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-001/contracts/contract-new-001');
    });
  });

  /**
   * REQ-7.2: キャンセルボタン押下時の前画面への遷移
   */
  it('キャンセルボタンクリックで契約書一覧画面に遷移する', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-form')).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
    await userEvent.click(cancelButton);

    expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-001/contracts');
  });

  /**
   * ローディング状態のテスト
   */
  it('プロジェクト情報ロード中はローディング表示する', async () => {
    vi.mocked(projectsApi.getProject).mockImplementation(
      () => new Promise(() => {}) // 解決しないPromise
    );

    renderWithRouter();

    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  /**
   * エラー状態のテスト
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
   * API呼び出し失敗時のエラーハンドリング
   */
  it('契約書作成失敗時にエラーメッセージを表示する', async () => {
    vi.mocked(contractsApi.createContract).mockRejectedValue(new Error('Validation Error'));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('contract-form')).toBeInTheDocument();
    });

    const submitButton = screen.getByRole('button', { name: '作成' });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('契約書の作成に失敗しました')).toBeInTheDocument();
    });

    // 遷移しないことを確認
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
