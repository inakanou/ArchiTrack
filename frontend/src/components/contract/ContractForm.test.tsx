/**
 * @vitest-environment jsdom
 *
 * @fileoverview ContractForm テスト
 *
 * Task 5.1: 契約種類選択と新規契約用入力フォームを実装する
 * Task 5.2: 見積書選択時の金額自動計算とプロジェクト情報の自動表示を実装する
 * Task 5.3: 変更契約用の基契約書選択とデフォルト値設定を実装する
 * Task 5.4: 変更契約の変更前後比較表示パネルを実装する
 *
 * Requirements (contract-management):
 * - REQ-2.1: 契約種類選択UI（ラジオボタン）
 * - REQ-2.2: 新規契約フォーム表示
 * - REQ-3.1: 新規契約入力フィールド
 * - REQ-3.2: 消費税率デフォルト10%
 * - REQ-3.3: 監理者取引先選択UI
 * - REQ-3.4: 見積書選択UI
 * - REQ-4.1-4.7: 自動表示項目
 * - REQ-5.1-5.3: 変更契約
 * - REQ-6.1-6.2: 変更前後比較表示
 */

import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ContractForm from './ContractForm';
import * as contractsApi from '../../api/contracts';
import * as estimatesApi from '../../api/estimates';
import * as companyInfoApi from '../../api/company-info';

// 各テスト後にDOMをクリーンアップ
afterEach(() => {
  cleanup();
});

// モック
vi.mock('../../api/contracts');
vi.mock('../../api/estimates');
vi.mock('../../api/company-info');
vi.mock('../projects/TradingPartnerSelect', () => ({
  default: ({
    value,
    onChange,
    label,
  }: {
    value: string;
    onChange: (v: string) => void;
    label?: string;
  }) => (
    <div data-testid="trading-partner-select">
      <label>{label || '監理者'}</label>
      <input
        data-testid="trading-partner-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

// ============================================================================
// テストデータ
// ============================================================================

const mockProjectInfo = {
  id: 'proj-001',
  name: 'テストプロジェクト',
  siteAddress: '東京都千代田区1-1-1',
  tradingPartner: { id: 'tp-001', name: 'テスト顧客株式会社' },
};

const mockEstimates = {
  data: [
    {
      id: 'est-001',
      projectId: 'proj-001',
      name: '見積書A',
      sourceItemizedStatementId: null,
      sourceItemizedStatementName: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'est-002',
      projectId: 'proj-001',
      name: '見積書B',
      sourceItemizedStatementId: null,
      sourceItemizedStatementName: null,
      createdAt: '2024-02-01T00:00:00.000Z',
      updatedAt: '2024-02-01T00:00:00.000Z',
    },
  ],
  pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
};

function createMockLine(
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR',
  amount: string
): estimatesApi.EstimateItemLine {
  return {
    id: `line-${lineType}-${amount}`,
    estimateItemId: 'item-001',
    lineType,
    name: null,
    specification: null,
    unit: null,
    quantity: null,
    unitPrice: null,
    amount,
    remarks: null,
    sourceReceivedQuotationLineItemId: null,
    sourceVendorName: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

const mockEstimateDetail: estimatesApi.EstimateDetail = {
  // 帳票用入力項目（56.8 で `EstimateDetail` に追加。未入力の見積書を表す）
  reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
  id: 'est-001',
  projectId: 'proj-001',
  name: '見積書A',
  sourceItemizedStatementId: null,
  sourceItemizedStatementName: null,
  totalAmount: '10000000',
  items: [
    {
      id: 'item-001',
      estimateId: 'est-001',
      parentId: null,
      displayOrder: 1,
      lines: [createMockLine('ESTIMATE', '5000000'), createMockLine('EXECUTION', '4000000')],
      children: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'item-002',
      estimateId: 'est-001',
      parentId: null,
      displayOrder: 2,
      lines: [createMockLine('ESTIMATE', '3000000'), createMockLine('EXECUTION', '2500000')],
      children: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockCompanyInfo = {
  id: 'company-001',
  companyName: 'テスト建設株式会社',
  address: '大阪府大阪市北区1-2-3',
  representative: '山田太郎',
  phone: '06-1234-5678',
  fax: null,
  email: null,
  invoiceRegistrationNumber: null,
  version: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockContracts = {
  contracts: [
    {
      id: 'contract-001',
      contractType: 'NEW' as const,
      contractDate: '2024-06-01',
      status: 'CONTRACTED' as const,
      contractAmount: 8800000,
      estimateName: '見積書A',
      parentContractId: null,
      createdAt: '2024-06-01T00:00:00.000Z',
      updatedAt: '2024-06-01T00:00:00.000Z',
    },
  ],
  total: 1,
};

const mockParentContractDetail: contractsApi.ContractDetail = {
  id: 'contract-001',
  projectId: 'proj-001',
  contractType: 'NEW',
  status: 'CONTRACTED',
  parentContractId: null,
  estimateId: 'est-001',
  contractDate: '2024-06-01',
  constructionStartDate: '2024-07-01',
  constructionEndDate: '2024-12-31',
  deliveryDate: '2025-01-15',
  taxRate: 0.1,
  paymentTerms: '出来高払い',
  separateConstruction: '電気工事',
  otherNotes: 'メモ',
  supervisorTradingPartnerId: 'tp-002',
  contractAmount: 8800000,
  constructionPrice: 8000000,
  taxAmount: 800000,
  estimate: { id: 'est-001', name: '見積書A' },
  parentContract: null,
  supervisorTradingPartner: { id: 'tp-002', name: '監理事務所A' },
  project: mockProjectInfo,
  version: 1,
  createdAt: '2024-06-01T00:00:00.000Z',
  updatedAt: '2024-06-01T00:00:00.000Z',
};

// ============================================================================
// ヘルパー関数
// ============================================================================

function setupMocks() {
  vi.mocked(estimatesApi.getEstimates).mockResolvedValue(mockEstimates);
  vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
  vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue(mockCompanyInfo);
  vi.mocked(contractsApi.getContracts).mockResolvedValue(mockContracts);
  vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockParentContractDetail);
}

function renderContractForm(props: Partial<React.ComponentProps<typeof ContractForm>> = {}) {
  const defaultProps = {
    mode: 'create' as const,
    projectId: 'proj-001',
    projectInfo: mockProjectInfo,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    ...props,
  };

  return render(
    <MemoryRouter>
      <ContractForm {...defaultProps} />
    </MemoryRouter>
  );
}

// ============================================================================
// Task 5.1 テスト: 契約種類選択と新規契約用入力フォーム
// ============================================================================

describe('ContractForm - Task 5.1', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupMocks();
  });

  /**
   * REQ-2.1: 契約種類選択UI（ラジオボタン）
   */
  it('契約種類選択のラジオボタンが表示される', async () => {
    renderContractForm();

    expect(screen.getByLabelText('新規契約')).toBeInTheDocument();
    expect(screen.getByLabelText('変更契約')).toBeInTheDocument();

    // デフォルトは新規契約が選択されている
    expect(screen.getByLabelText('新規契約')).toBeChecked();
    expect(screen.getByLabelText('変更契約')).not.toBeChecked();
  });

  /**
   * REQ-3.4: 見積書選択UI
   */
  it('見積書選択セレクトボックスが表示される', async () => {
    renderContractForm();

    // 見積書一覧がAPIから非同期で取得されるのを待つ
    await waitFor(() => {
      const select = screen.getByLabelText('見積書') as HTMLSelectElement;
      expect(within(select).getByText('見積書A')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('見積書') as HTMLSelectElement;
    expect(within(select).getByText('見積書B')).toBeInTheDocument();
  });

  /**
   * REQ-3.1: 新規契約入力フィールド
   */
  it('日付入力フィールドが表示される', async () => {
    renderContractForm();

    expect(screen.getByLabelText('契約日')).toBeInTheDocument();
    expect(screen.getByLabelText('工期着手日')).toBeInTheDocument();
    expect(screen.getByLabelText('工期完成日')).toBeInTheDocument();
    expect(screen.getByLabelText('引渡日')).toBeInTheDocument();
  });

  /**
   * REQ-3.2: 消費税率デフォルト10%
   */
  it('消費税率のデフォルト値が10%である', async () => {
    renderContractForm();

    const taxRateInput = screen.getByLabelText('消費税率（%）') as HTMLInputElement;
    expect(taxRateInput.value).toBe('10');
  });

  /**
   * REQ-3.1: テキスト入力フィールド
   */
  it('支払条件、別途工事、その他のテキスト入力フィールドが表示される', async () => {
    renderContractForm();

    expect(screen.getByLabelText('支払条件')).toBeInTheDocument();
    expect(screen.getByLabelText('別途工事')).toBeInTheDocument();
    expect(screen.getByLabelText('その他')).toBeInTheDocument();
  });

  /**
   * REQ-3.3: 監理者取引先選択UI
   */
  it('監理者取引先の選択UIが表示される', async () => {
    renderContractForm();

    // TradingPartnerSelectのモックが少なくとも1つ存在する
    const tpSelects = screen.getAllByTestId('trading-partner-select');
    expect(tpSelects.length).toBeGreaterThanOrEqual(1);
  });

  /**
   * mode prop による動作切り替え
   */
  it('editモードでは契約種類選択が無効化される', async () => {
    renderContractForm({
      mode: 'edit',
      initialData: mockParentContractDetail,
    });

    const newRadio = screen.getByLabelText('新規契約') as HTMLInputElement;
    expect(newRadio).toBeDisabled();

    const amendmentRadio = screen.getByLabelText('変更契約') as HTMLInputElement;
    expect(amendmentRadio).toBeDisabled();
  });
});

// ============================================================================
// Task 5.2 テスト: 見積書選択時の金額自動計算とプロジェクト情報の自動表示
// ============================================================================

describe('ContractForm - Task 5.2', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupMocks();
  });

  /**
   * REQ-4.2: 工事価格自動表示
   * REQ-4.1: 請負代金額自動表示
   * REQ-4.3: 消費税額自動計算
   */
  it('見積書選択時に金額が自動計算される', async () => {
    const user = userEvent.setup({ delay: null });
    renderContractForm();

    // 見積書一覧がAPIから非同期で取得されるのを待つ
    await waitFor(() => {
      const select = screen.getByLabelText('見積書') as HTMLSelectElement;
      expect(within(select).getByText('見積書A')).toBeInTheDocument();
    });

    // 見積書を選択
    const select = screen.getByLabelText('見積書');
    await user.selectOptions(select, 'est-001');

    // 工事価格 = ESTIMATE行のamountの合計 = 5000000 + 3000000 = 8000000
    await waitFor(() => {
      expect(screen.getByTestId('construction-price')).toHaveTextContent('8,000,000');
    });

    // 消費税額 = 工事価格 x 消費税率 = 8000000 x 0.1 = 800000
    expect(screen.getByTestId('tax-amount')).toHaveTextContent('800,000');

    // 請負代金額 = 工事価格 + 消費税額 = 8000000 + 800000 = 8800000
    expect(screen.getByTestId('contract-amount')).toHaveTextContent('8,800,000');
  });

  /**
   * REQ-4.4: 発注者自動表示
   */
  it('発注者（プロジェクトの顧客）が自動表示される', async () => {
    renderContractForm();

    expect(screen.getByTestId('client-name')).toHaveTextContent('テスト顧客株式会社');
  });

  /**
   * REQ-4.5: 請負者自動表示
   */
  it('請負者（自社情報）が自動表示される', async () => {
    renderContractForm();

    await waitFor(() => {
      expect(screen.getByTestId('contractor-name')).toHaveTextContent('テスト建設株式会社');
    });
  });

  /**
   * REQ-4.6: 工事名自動表示
   */
  it('工事名（プロジェクト名）が自動表示される', async () => {
    renderContractForm();

    expect(screen.getByTestId('project-name')).toHaveTextContent('テストプロジェクト');
  });

  /**
   * REQ-4.7: 工事場所自動表示
   */
  it('工事場所（プロジェクトの住所）が自動表示される', async () => {
    renderContractForm();

    expect(screen.getByTestId('site-address')).toHaveTextContent('東京都千代田区1-1-1');
  });

  /**
   * 消費税率変更時の金額再計算
   */
  it('消費税率変更時に金額が再計算される', async () => {
    const user = userEvent.setup({ delay: null });
    renderContractForm();

    // 見積書一覧がAPIから非同期で取得されるのを待つ
    await waitFor(() => {
      const select = screen.getByLabelText('見積書') as HTMLSelectElement;
      expect(within(select).getByText('見積書A')).toBeInTheDocument();
    });

    // 見積書を選択
    await user.selectOptions(screen.getByLabelText('見積書'), 'est-001');

    await waitFor(() => {
      expect(screen.getByTestId('construction-price')).toHaveTextContent('8,000,000');
    });

    // 消費税率を8%に変更
    const taxRateInput = screen.getByLabelText('消費税率（%）');
    await user.clear(taxRateInput);
    await user.type(taxRateInput, '8');

    // 消費税額 = 8000000 x 0.08 = 640000
    await waitFor(() => {
      expect(screen.getByTestId('tax-amount')).toHaveTextContent('640,000');
    });

    // 請負代金額 = 8000000 + 640000 = 8640000
    expect(screen.getByTestId('contract-amount')).toHaveTextContent('8,640,000');
  });
});

// ============================================================================
// Task 5.3 テスト: 変更契約用の基契約書選択とデフォルト値設定
// ============================================================================

describe('ContractForm - Task 5.3', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupMocks();
  });

  /**
   * REQ-5.1: 変更契約選択時に基契約書選択UIが表示される
   */
  it('変更契約選択時に基契約書選択UIが表示される', async () => {
    const user = userEvent.setup({ delay: null });
    renderContractForm();

    // 変更契約を選択
    await user.click(screen.getByLabelText('変更契約'));

    await waitFor(() => {
      expect(screen.getByLabelText('基となる契約書')).toBeInTheDocument();
    });
  });

  /**
   * REQ-5.2: 基契約書選択時にデフォルト値が設定される
   */
  it('基契約書選択時に全入力フィールドにデフォルト値が設定される', async () => {
    const user = userEvent.setup({ delay: null });
    renderContractForm();

    // 変更契約を選択
    await user.click(screen.getByLabelText('変更契約'));

    await waitFor(() => {
      expect(screen.getByLabelText('基となる契約書')).toBeInTheDocument();
    });

    // 基契約書を選択
    const parentSelect = screen.getByLabelText('基となる契約書');
    await user.selectOptions(parentSelect, 'contract-001');

    // 基契約書のデータがデフォルト値として設定される
    await waitFor(() => {
      const contractDateInput = screen.getByLabelText('契約日') as HTMLInputElement;
      expect(contractDateInput.value).toBe('2024-06-01');
    });

    // 見積書が基契約書のものに設定される
    const estimateSelect = screen.getByLabelText('見積書') as HTMLSelectElement;
    expect(estimateSelect.value).toBe('est-001');

    // 支払条件がデフォルト値
    const paymentTermsInput = screen.getByLabelText('支払条件') as HTMLTextAreaElement;
    expect(paymentTermsInput.value).toBe('出来高払い');
  });

  /**
   * REQ-5.3: 変更契約フォームに新規契約と同一の入力フィールドを提供する
   */
  it('変更契約フォームは新規契約と同一の入力フィールドを持つ', async () => {
    const user = userEvent.setup({ delay: null });
    renderContractForm();

    // 変更契約を選択
    await user.click(screen.getByLabelText('変更契約'));

    // 新規契約と同一の入力フィールドが存在する
    await waitFor(() => {
      expect(screen.getByLabelText('見積書')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('契約日')).toBeInTheDocument();
    expect(screen.getByLabelText('工期着手日')).toBeInTheDocument();
    expect(screen.getByLabelText('工期完成日')).toBeInTheDocument();
    expect(screen.getByLabelText('引渡日')).toBeInTheDocument();
    expect(screen.getByLabelText('消費税率（%）')).toBeInTheDocument();
    expect(screen.getByLabelText('支払条件')).toBeInTheDocument();
    expect(screen.getByLabelText('別途工事')).toBeInTheDocument();
    expect(screen.getByLabelText('その他')).toBeInTheDocument();
  });
});

// ============================================================================
// Task 5.4 テスト: 変更契約の変更前後比較表示パネル
// ============================================================================

describe('ContractForm - Task 5.4', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupMocks();
  });

  /**
   * REQ-6.1: 基契約書の各フィールド値を「変更前」として表示
   */
  it('変更契約時に基契約書の値が「変更前」として表示される', async () => {
    const user = userEvent.setup({ delay: null });
    renderContractForm();

    // 変更契約を選択
    await user.click(screen.getByLabelText('変更契約'));

    await waitFor(() => {
      expect(screen.getByLabelText('基となる契約書')).toBeInTheDocument();
    });

    // 基契約書を選択
    await user.selectOptions(screen.getByLabelText('基となる契約書'), 'contract-001');

    // 比較パネルが表示される
    await waitFor(() => {
      expect(screen.getByTestId('comparison-panel')).toBeInTheDocument();
    });

    // 変更前の値が表示される
    const comparisonPanel = screen.getByTestId('comparison-panel');
    expect(within(comparisonPanel).getByText('変更前')).toBeInTheDocument();
  });

  /**
   * REQ-6.2: 値が変更されたフィールドのハイライト表示
   */
  it('値が変更されたフィールドがハイライト表示される', async () => {
    const user = userEvent.setup({ delay: null });
    renderContractForm();

    // 変更契約を選択
    await user.click(screen.getByLabelText('変更契約'));

    await waitFor(() => {
      expect(screen.getByLabelText('基となる契約書')).toBeInTheDocument();
    });

    // 基契約書を選択
    await user.selectOptions(screen.getByLabelText('基となる契約書'), 'contract-001');

    await waitFor(() => {
      expect(screen.getByTestId('comparison-panel')).toBeInTheDocument();
    });

    // 支払条件を変更する
    const paymentTermsInput = screen.getByLabelText('支払条件');
    await user.clear(paymentTermsInput);
    await user.type(paymentTermsInput, '一括払い');

    // 変更されたフィールドにはchangedクラスまたはdata属性がつく
    await waitFor(() => {
      const changedFields = screen.getAllByTestId(/comparison-field-changed/);
      expect(changedFields.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Task 12.1 テスト: クライアントサイドバリデーション
// ============================================================================

describe('ContractForm - Task 12.1 バリデーション', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupMocks();
  });

  /**
   * REQ-10.1: 見積書選択必須チェック
   * REQ-10.2: 契約日必須チェック
   * REQ-10.3: 工期着手日・完成日必須チェック
   * REQ-10.4: 引渡日必須チェック
   * REQ-10.5: 消費税率必須チェック
   * REQ-10.6: 必須項目エラーメッセージ
   */
  it('必須項目が未入力の状態で送信するとバリデーションエラーが表示される', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn();
    renderContractForm({ onSubmit });

    // 消費税率をクリアしてから送信
    const taxRateInput = screen.getByLabelText('消費税率（%）');
    await user.clear(taxRateInput);

    // 送信ボタンをクリック
    const submitButton = screen.getByRole('button', { name: '作成' });
    await user.click(submitButton);

    // onSubmitが呼ばれていないことを確認
    expect(onSubmit).not.toHaveBeenCalled();

    // エラーメッセージが表示される
    await waitFor(() => {
      expect(screen.getByText('見積書の選択は必須です')).toBeInTheDocument();
    });
    expect(screen.getByText('契約日の入力は必須です')).toBeInTheDocument();
    expect(screen.getByText('工期着手日の入力は必須です')).toBeInTheDocument();
    expect(screen.getByText('工期完成日の入力は必須です')).toBeInTheDocument();
    expect(screen.getByText('引渡日の入力は必須です')).toBeInTheDocument();
    expect(screen.getByText('消費税率の入力は必須です')).toBeInTheDocument();
  });

  /**
   * REQ-10.5: 消費税率範囲チェック（0-100%）
   */
  it('消費税率が0未満の場合にバリデーションエラーが表示される', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn();
    renderContractForm({ onSubmit });

    // 見積書一覧のロードを待つ
    await waitFor(() => {
      const select = screen.getByLabelText('見積書') as HTMLSelectElement;
      expect(within(select).getByText('見積書A')).toBeInTheDocument();
    });

    // 全必須フィールドを入力
    await user.selectOptions(screen.getByLabelText('見積書'), 'est-001');
    const contractDate = screen.getByLabelText('契約日');
    await user.type(contractDate, '2024-06-01');
    const startDate = screen.getByLabelText('工期着手日');
    await user.type(startDate, '2024-07-01');
    const endDate = screen.getByLabelText('工期完成日');
    await user.type(endDate, '2024-12-31');
    const deliveryDate = screen.getByLabelText('引渡日');
    await user.type(deliveryDate, '2025-01-15');

    // 消費税率を-1に設定
    const taxRateInput = screen.getByLabelText('消費税率（%）');
    await user.clear(taxRateInput);
    await user.type(taxRateInput, '-1');

    // 送信ボタンをクリック
    await user.click(screen.getByRole('button', { name: '作成' }));

    // onSubmitが呼ばれていない
    expect(onSubmit).not.toHaveBeenCalled();

    // 範囲エラーメッセージ
    await waitFor(() => {
      expect(
        screen.getByText('消費税率は0以上100以下の数値を指定してください')
      ).toBeInTheDocument();
    });
  });

  it('消費税率が100を超える場合にバリデーションエラーが表示される', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn();
    renderContractForm({ onSubmit });

    await waitFor(() => {
      const select = screen.getByLabelText('見積書') as HTMLSelectElement;
      expect(within(select).getByText('見積書A')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('見積書'), 'est-001');
    await user.type(screen.getByLabelText('契約日'), '2024-06-01');
    await user.type(screen.getByLabelText('工期着手日'), '2024-07-01');
    await user.type(screen.getByLabelText('工期完成日'), '2024-12-31');
    await user.type(screen.getByLabelText('引渡日'), '2025-01-15');

    const taxRateInput = screen.getByLabelText('消費税率（%）');
    await user.clear(taxRateInput);
    await user.type(taxRateInput, '101');

    await user.click(screen.getByRole('button', { name: '作成' }));

    expect(onSubmit).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(
        screen.getByText('消費税率は0以上100以下の数値を指定してください')
      ).toBeInTheDocument();
    });
  });

  /**
   * REQ-10.7: 着手日・完成日の論理チェック
   */
  it('工期着手日が完成日より後の場合にエラーメッセージが表示される', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn();
    renderContractForm({ onSubmit });

    await waitFor(() => {
      const select = screen.getByLabelText('見積書') as HTMLSelectElement;
      expect(within(select).getByText('見積書A')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('見積書'), 'est-001');
    await user.type(screen.getByLabelText('契約日'), '2024-06-01');
    // 着手日を完成日より後に設定
    await user.type(screen.getByLabelText('工期着手日'), '2025-01-01');
    await user.type(screen.getByLabelText('工期完成日'), '2024-12-31');
    await user.type(screen.getByLabelText('引渡日'), '2025-01-15');

    await user.click(screen.getByRole('button', { name: '作成' }));

    expect(onSubmit).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByText('着手日は完成日以前の日付を指定してください')).toBeInTheDocument();
    });
  });

  /**
   * REQ-10.8: 変更契約の基契約書必須チェック
   */
  it('変更契約で基契約書が未選択の場合にエラーメッセージが表示される', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn();
    renderContractForm({ onSubmit });

    // 変更契約を選択
    await user.click(screen.getByLabelText('変更契約'));

    await waitFor(() => {
      expect(screen.getByLabelText('基となる契約書')).toBeInTheDocument();
    });

    // 必須フィールドを入力（基契約書以外）
    await waitFor(() => {
      const select = screen.getByLabelText('見積書') as HTMLSelectElement;
      expect(within(select).getByText('見積書A')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('見積書'), 'est-001');
    await user.type(screen.getByLabelText('契約日'), '2024-06-01');
    await user.type(screen.getByLabelText('工期着手日'), '2024-07-01');
    await user.type(screen.getByLabelText('工期完成日'), '2024-12-31');
    await user.type(screen.getByLabelText('引渡日'), '2025-01-15');

    // 基契約書を選択しないまま送信
    await user.click(screen.getByRole('button', { name: '作成' }));

    expect(onSubmit).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(
        screen.getByText('変更契約の場合、基となる契約書の選択は必須です')
      ).toBeInTheDocument();
    });
  });

  /**
   * バリデーション通過時にonSubmitが呼ばれることを確認
   */
  it('全バリデーション通過時にonSubmitが呼ばれる', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn();
    renderContractForm({ onSubmit });

    await waitFor(() => {
      const select = screen.getByLabelText('見積書') as HTMLSelectElement;
      expect(within(select).getByText('見積書A')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('見積書'), 'est-001');
    await user.type(screen.getByLabelText('契約日'), '2024-06-01');
    await user.type(screen.getByLabelText('工期着手日'), '2024-07-01');
    await user.type(screen.getByLabelText('工期完成日'), '2024-12-31');
    await user.type(screen.getByLabelText('引渡日'), '2025-01-15');

    await user.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * バリデーションエラーが修正後にクリアされることを確認
   */
  it('バリデーションエラーがフィールド修正後にクリアされる', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn();
    renderContractForm({ onSubmit });

    // 未入力のまま送信してエラーを発生させる
    await user.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => {
      expect(screen.getByText('見積書の選択は必須です')).toBeInTheDocument();
    });

    // 見積書を選択してエラーが消えることを確認
    await waitFor(() => {
      const select = screen.getByLabelText('見積書') as HTMLSelectElement;
      expect(within(select).getByText('見積書A')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('見積書'), 'est-001');

    await waitFor(() => {
      expect(screen.queryByText('見積書の選択は必須です')).not.toBeInTheDocument();
    });
  });

  /**
   * 消費税率が0の場合にバリデーションを通過する（境界値テスト）
   */
  it('消費税率0%はバリデーションを通過する', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn();
    renderContractForm({ onSubmit });

    await waitFor(() => {
      const select = screen.getByLabelText('見積書') as HTMLSelectElement;
      expect(within(select).getByText('見積書A')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('見積書'), 'est-001');
    await user.type(screen.getByLabelText('契約日'), '2024-06-01');
    await user.type(screen.getByLabelText('工期着手日'), '2024-07-01');
    await user.type(screen.getByLabelText('工期完成日'), '2024-12-31');
    await user.type(screen.getByLabelText('引渡日'), '2025-01-15');

    const taxRateInput = screen.getByLabelText('消費税率（%）');
    await user.clear(taxRateInput);
    await user.type(taxRateInput, '0');

    await user.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * 消費税率が100の場合にバリデーションを通過する（境界値テスト）
   */
  it('消費税率100%はバリデーションを通過する', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn();
    renderContractForm({ onSubmit });

    await waitFor(() => {
      const select = screen.getByLabelText('見積書') as HTMLSelectElement;
      expect(within(select).getByText('見積書A')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('見積書'), 'est-001');
    await user.type(screen.getByLabelText('契約日'), '2024-06-01');
    await user.type(screen.getByLabelText('工期着手日'), '2024-07-01');
    await user.type(screen.getByLabelText('工期完成日'), '2024-12-31');
    await user.type(screen.getByLabelText('引渡日'), '2025-01-15');

    const taxRateInput = screen.getByLabelText('消費税率（%）');
    await user.clear(taxRateInput);
    await user.type(taxRateInput, '100');

    await user.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * 着手日と完成日が同日の場合にバリデーションを通過する（境界値テスト）
   */
  it('工期着手日と完成日が同日の場合はバリデーションを通過する', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn();
    renderContractForm({ onSubmit });

    await waitFor(() => {
      const select = screen.getByLabelText('見積書') as HTMLSelectElement;
      expect(within(select).getByText('見積書A')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('見積書'), 'est-001');
    await user.type(screen.getByLabelText('契約日'), '2024-06-01');
    await user.type(screen.getByLabelText('工期着手日'), '2024-12-31');
    await user.type(screen.getByLabelText('工期完成日'), '2024-12-31');
    await user.type(screen.getByLabelText('引渡日'), '2025-01-15');

    await user.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });
});
