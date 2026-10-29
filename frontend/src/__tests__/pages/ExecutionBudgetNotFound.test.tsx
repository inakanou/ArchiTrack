/**
 * @fileoverview 実行予算の画面が 404 を受けたときの不在の表示のテスト
 *
 * Task 19.1: 実行予算・変更契約の反映・発注詳細・出来高入力の画面と各操作が 404 を受けたときの表示
 *
 * Requirements (execution-budget-management):
 * - 21.1: 画面の読み込みの 404 で見つからない旨と戻り先のリンクを表示し、実行予算が未作成である旨・作成の釦・
 *   読み込みの失敗の文言・応答の英語の文言を出さない。閲覧範囲内の案件に実行予算が無いときは従来の未作成の表示
 * - 21.2: 操作の 404 で見つからない旨の日本語のメッセージを表示し、応答の英語の文言と操作の失敗の汎用の文言を
 *   出さない。409・422 と 404 以外の失敗の従来の文言は保つ
 */

import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ExecutionBudgetPage from '../../pages/ExecutionBudgetPage';
import ExecutionBudgetAmendmentPage from '../../pages/ExecutionBudgetAmendmentPage';
import OrderDetailPage from '../../pages/OrderDetailPage';
import ProgressInputPage from '../../pages/ProgressInputPage';
import { ApiError } from '../../api/client';
import * as executionBudgetApi from '../../api/execution-budget';
import * as contractsApi from '../../api/contracts';
import * as projectsApi from '../../api/projects';
import * as orderDetailApi from '../../api/order-detail';
import * as progressApi from '../../api/progress';

vi.mock('../../api/execution-budget');
vi.mock('../../api/contracts');
vi.mock('../../api/projects');
vi.mock('../../api/order-detail');
vi.mock('../../api/progress');
// 取引先の選択は外部の検索部品のため、選んだことにする釦へ置き換える
vi.mock('../../components/projects/TradingPartnerSelect', () => ({
  default: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange('vendor-2')}>
      取引先を選ぶ
    </button>
  ),
}));
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({
    success: toastMocks.success,
    error: toastMocks.error,
    warning: vi.fn(),
    info: vi.fn(),
    addToast: vi.fn(),
    removeToast: vi.fn(),
    toasts: [],
  }),
}));

// ============================================================================
// テストデータ
// ============================================================================

const PROJECT_GONE = 'プロジェクトが見つかりません。存在しないか、削除されています。';
const BUDGET_GONE = '実行予算が見つかりません。存在しないか、削除されています。';
const CONTRACT_GONE = '契約書が見つかりません。存在しないか、削除されています。';
const AMENDMENT_GONE = '変更契約が見つかりません。存在しないか、削除されています。';
const ORDER_GONE = '発注が見つかりません。存在しないか、削除されています。';
const PROGRESS_RECORD_GONE = '出来高記録が見つかりません。存在しないか、削除されています。';

/** 閲覧範囲外と不在に共通の汎用の 404（本文は英語） */
function genericNotFound(): ApiError {
  return new ApiError(404, 'Not found', {
    type: 'https://architrack.example.com/problems/not-found',
    title: 'Not Found',
    status: 404,
    detail: 'Not found',
    code: 'NOT_FOUND',
  });
}

/** 範囲内の利用者に届く本体の 404（符号の無いものは経路が手で組み立てた実行予算の不在） */
function bodyNotFound(code: string | undefined, detail: string): ApiError {
  return new ApiError(404, detail, code ? { status: 404, detail, code } : { status: 404, detail });
}

/** 案件の取得の 404（getProject は文言を日本語に揃えて投げ直す） */
function projectNotFound(): ApiError {
  return new ApiError(404, 'プロジェクトが見つかりません', {
    status: 404,
    detail: 'Not found',
    code: 'NOT_FOUND',
  });
}

const mockProject = { id: 'project-1', name: '案件A' } as unknown as Awaited<
  ReturnType<typeof projectsApi.getProject>
>;

const leafItem: executionBudgetApi.ExecutionBudgetItem = {
  id: 'item-1',
  executionBudgetId: 'eb-1',
  estimateItemId: 'ei-1',
  parentId: null,
  displayOrder: 1,
  name: '仮設工事',
  specification: null,
  unit: '式',
  quantity: '1.0000',
  estimateUnitPrice: '500000.00',
  estimateAmount: '500000',
  executionUnitPrice: '450000.00',
  executionAmount: '450000',
  amendmentAmount: '0',
  previousMonthExpense: '0',
  currentMonthExpense: '0',
  plannedVendorId: null,
  plannedVendorName: null,
  amendmentStatus: null,
  remarks: null,
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
  orderStatus: null,
  orderAmount: null,
  progressAmount: null,
  progressRate: null,
};

const mockBudget: executionBudgetApi.ExecutionBudgetWithItems = {
  id: 'eb-1',
  projectId: 'project-1',
  contractId: 'contract-1',
  version: 1,
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
  deletedAt: null,
  contract: {
    id: 'contract-1',
    contractDate: '2026-01-15',
    contractAmount: 10000000,
    estimate: { id: 'estimate-1', name: '見積書A' },
  },
  items: [leafItem],
  totals: {
    estimateAmount: '500000',
    executionAmount: '450000',
    amendmentAmount: '0',
    orderAmount: '0',
    totalExpense: '0',
    remainingBudget: '450000',
    progressAmount: '0',
    expectedProfit: '50000',
  },
  orderProgressRate: 0,
};

const mockContracts = {
  contracts: [
    {
      id: 'c-1',
      contractType: 'NEW',
      contractDate: '2026-01-01',
      status: 'CONTRACTED',
      contractAmount: 5000000,
      estimateName: '見積書X',
      parentContractId: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  total: 1,
} as unknown as Awaited<ReturnType<typeof contractsApi.getContracts>>;

const mockOrder: orderDetailApi.OrderWithItems = {
  id: 'order-1',
  executionBudgetId: 'eb-1',
  tradingPartnerId: 'vendor-1',
  tradingPartnerName: '協力業者A',
  status: 'BEFORE_ORDER',
  confirmedAmount: null,
  version: 0,
  createdAt: '2026-03-10T00:00:00Z',
  updatedAt: '2026-03-10T00:00:00Z',
  deletedAt: null,
  totalExecutionAmount: '450000',
  checkedItemCount: 1,
  items: [
    {
      id: 'oi-1',
      orderId: 'order-1',
      executionBudgetItemId: 'item-1',
      checked: true,
      orderAmount: null,
      executionBudgetItem: {
        id: 'item-1',
        name: '仮設工事',
        specification: null,
        unit: '式',
        quantity: '1.0000',
        executionUnitPrice: '450000.00',
        executionAmount: '450000',
        plannedVendorId: null,
        plannedVendorName: null,
      },
    },
  ],
};

const mockHistory: progressApi.ProgressRecordSummary[] = [
  {
    id: 'pr-1',
    constructionDate: '2026-03-15T00:00:00.000Z',
    totalAmount: '100000',
    totalRate: '22.2',
    createdAt: '2026-03-15T10:00:00Z',
  } as unknown as progressApi.ProgressRecordSummary,
];

function renderAt(path: string, routePath: string, element: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath} element={element} />
      </Routes>
    </MemoryRouter>
  );
}

const renderBudgetPage = () =>
  renderAt(
    '/projects/project-1/execution-budget',
    '/projects/:projectId/execution-budget',
    <ExecutionBudgetPage />
  );
const renderAmendmentPage = () =>
  renderAt(
    '/projects/project-1/execution-budget/amendments',
    '/projects/:projectId/execution-budget/amendments',
    <ExecutionBudgetAmendmentPage />
  );
const renderOrderPage = (orderId = 'order-1') =>
  renderAt(
    `/projects/project-1/execution-budget/orders/${orderId}`,
    '/projects/:projectId/execution-budget/orders/:orderId',
    <OrderDetailPage />
  );
const renderProgressPage = () =>
  renderAt(
    '/projects/project-1/execution-budget/progress',
    '/projects/:projectId/execution-budget/progress',
    <ProgressInputPage />
  );

/** 不在の表示（ResourceNotFound）と、その戻り先のリンク */
async function expectResourceNotFound(
  resourceType: string,
  returnLabel: string,
  returnPath: string
): Promise<void> {
  expect(
    await screen.findByRole('heading', { name: `${resourceType}が見つかりません` })
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: returnLabel })).toHaveAttribute('href', returnPath);
  expect(screen.queryByText(/Not found/i)).not.toBeInTheDocument();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(mockBudget);
  vi.mocked(executionBudgetApi.getOrders).mockResolvedValue([]);
  vi.mocked(executionBudgetApi.getMonthlyCloseHistory).mockResolvedValue([]);
  vi.mocked(executionBudgetApi.getUnreflectedAmendments).mockResolvedValue([]);
  vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
  vi.mocked(contractsApi.getContracts).mockResolvedValue(mockContracts);
  vi.mocked(orderDetailApi.getOrderDetail).mockResolvedValue(mockOrder);
  vi.mocked(progressApi.getProgressHistory).mockResolvedValue(mockHistory);
  vi.mocked(progressApi.getMonthlyProgress).mockResolvedValue([]);
});

// ============================================================================
// 実行予算の画面
// ============================================================================

describe('実行予算の画面（ExecutionBudgetPage）', () => {
  describe('読み込み（21.1）', () => {
    it('実行予算の取得が 404 で案件の取得も 404 なら、プロジェクトが見つからない旨とプロジェクトの一覧へのリンクを出し、未作成の表示と作成の釦を出さない', async () => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(null);
      vi.mocked(projectsApi.getProject).mockRejectedValue(projectNotFound());

      renderBudgetPage();

      await expectResourceNotFound('プロジェクト', 'プロジェクト一覧に戻る', '/projects');
      expect(projectsApi.getProject).toHaveBeenCalledWith('project-1');
      expect(screen.queryByText('実行予算はまだ作成されていません。')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '実行予算を作成' })).not.toBeInTheDocument();
      expect(screen.queryByText('データの取得に失敗しました')).not.toBeInTheDocument();
    });

    it('実行予算の取得が 404 でも案件が取得できれば、従来の未作成の表示と作成の釦を出す', async () => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(null);

      renderBudgetPage();

      expect(await screen.findByText('実行予算はまだ作成されていません。')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '実行予算を作成' })).toBeInTheDocument();
      expect(projectsApi.getProject).toHaveBeenCalledWith('project-1');
      expect(
        screen.queryByRole('heading', { name: 'プロジェクトが見つかりません' })
      ).not.toBeInTheDocument();
    });

    it('実行予算の取得が 404 で案件の取得が 404 以外で失敗したら、作成の釦を出さず読み込みの失敗を表示する', async () => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(null);
      vi.mocked(projectsApi.getProject).mockRejectedValue(new ApiError(500, 'boom'));

      renderBudgetPage();

      expect(await screen.findByText('データの取得に失敗しました')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '実行予算を作成' })).not.toBeInTheDocument();
      expect(screen.queryByText('実行予算はまだ作成されていません。')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'プロジェクトが見つかりません' })
      ).not.toBeInTheDocument();
    });

    it('実行予算が取得できれば案件を取得しない', async () => {
      renderBudgetPage();

      expect(
        await screen.findByRole('heading', { name: '実行予算', level: 1 })
      ).toBeInTheDocument();
      expect(projectsApi.getProject).not.toHaveBeenCalled();
    });
  });

  describe('操作（21.2）', () => {
    async function openCreateDialog(): Promise<void> {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(null);
      renderBudgetPage();
      await userEvent.click(await screen.findByRole('button', { name: '実行予算を作成' }));
      await screen.findByRole('dialog', { name: '契約書選択' });
      await userEvent.click(screen.getByRole('radio'));
    }

    it.each([
      ['汎用の 404', genericNotFound(), PROJECT_GONE],
      [
        '契約の不在の 404',
        bodyNotFound('CONTRACT_NOT_FOUND_FOR_BUDGET', '指定された契約書が見つかりません'),
        CONTRACT_GONE,
      ],
    ])('実行予算の作成の %s で見つからない旨を表示する', async (_label, error, expected) => {
      vi.mocked(executionBudgetApi.createExecutionBudget).mockRejectedValue(error);
      await openCreateDialog();

      await userEvent.click(screen.getByRole('button', { name: '作成' }));

      expect(await screen.findByText(expected)).toBeInTheDocument();
      expect(screen.queryByText(/Not found/i)).not.toBeInTheDocument();
      expect(screen.queryByText('指定された契約書が見つかりません')).not.toBeInTheDocument();
    });

    it('実行予算の作成の 404 以外の失敗は従来の文言を表示する（表示欄を設けた）', async () => {
      vi.mocked(executionBudgetApi.createExecutionBudget).mockRejectedValue(
        new ApiError(409, '実行予算は既に作成されています')
      );
      await openCreateDialog();

      await userEvent.click(screen.getByRole('button', { name: '作成' }));

      expect(await screen.findByText('実行予算は既に作成されています')).toBeInTheDocument();
    });

    it('契約書の一覧の取得の 404 で見つからない旨を表示し、404 以外は従来の文言を表示する', async () => {
      vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(null);
      vi.mocked(contractsApi.getContracts).mockRejectedValueOnce(genericNotFound());
      renderBudgetPage();

      await userEvent.click(await screen.findByRole('button', { name: '実行予算を作成' }));
      expect(await screen.findByText(PROJECT_GONE)).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      vi.mocked(contractsApi.getContracts).mockRejectedValueOnce(new Error('Network error'));
      await userEvent.click(screen.getByRole('button', { name: '実行予算を作成' }));
      expect(await screen.findByText('契約書一覧の取得に失敗しました')).toBeInTheDocument();
    });

    it.each([
      ['汎用の 404', genericNotFound(), PROJECT_GONE],
      ['実行予算の不在の 404', bodyNotFound(undefined, '実行予算が見つかりません'), BUDGET_GONE],
    ])('実行予算の削除の %s で見つからない旨を表示する', async (_label, error, expected) => {
      vi.mocked(executionBudgetApi.deleteExecutionBudget).mockRejectedValue(error);
      renderBudgetPage();

      await userEvent.click(await screen.findByRole('button', { name: '削除' }));
      await userEvent.click(screen.getByRole('button', { name: '削除する' }));

      const dialog = await screen.findByRole('dialog', { name: '削除確認' });
      expect(await within(dialog).findByText(expected)).toBeInTheDocument();
      expect(screen.queryByText(/Not found/i)).not.toBeInTheDocument();
      expect(screen.queryByText('実行予算が見つかりません')).not.toBeInTheDocument();
    });

    it('実行予算の削除の 404 以外の失敗は従来の文言を表示する', async () => {
      vi.mocked(executionBudgetApi.deleteExecutionBudget).mockRejectedValue(
        new ApiError(422, '発注済みの項目があるため削除できません')
      );
      renderBudgetPage();

      await userEvent.click(await screen.findByRole('button', { name: '削除' }));
      await userEvent.click(screen.getByRole('button', { name: '削除する' }));

      expect(await screen.findByText('発注済みの項目があるため削除できません')).toBeInTheDocument();
    });

    it('原価の入力の 404 で見つからない旨を表示し、409 は従来の文言を表示する', async () => {
      vi.mocked(executionBudgetApi.updateItemCost).mockRejectedValueOnce(genericNotFound());
      renderBudgetPage();

      const input = await screen.findByTestId('current-month-expense-input-item-1');
      await userEvent.click(input);
      await userEvent.clear(input);
      await userEvent.type(input, '70000');
      await userEvent.tab();

      expect((await screen.findAllByText(PROJECT_GONE)).length).toBeGreaterThan(0);
      expect(screen.queryByText(/Not found/i)).not.toBeInTheDocument();
      expect(screen.queryByText('原価の更新に失敗しました')).not.toBeInTheDocument();

      vi.mocked(executionBudgetApi.updateItemCost).mockRejectedValueOnce(
        new ApiError(409, 'バージョン競合')
      );
      await userEvent.click(input);
      await userEvent.clear(input);
      await userEvent.type(input, '80000');
      await userEvent.tab();
      expect((await screen.findAllByText('バージョン競合')).length).toBeGreaterThan(0);
    });

    it.each([
      ['汎用の 404', genericNotFound(), PROJECT_GONE],
      ['実行予算の不在の 404', bodyNotFound(undefined, '実行予算が見つかりません'), BUDGET_GONE],
    ])('月次締めの %s で見つからない旨を表示する', async (_label, error, expected) => {
      vi.mocked(executionBudgetApi.executeMonthlyClose).mockRejectedValue(error);
      renderBudgetPage();

      await userEvent.click(await screen.findByRole('button', { name: '月次締め' }));
      const dialog = await screen.findByRole('dialog', { name: '月次締め' });
      await userEvent.type(within(dialog).getByDisplayValue(''), '2026-03');
      await userEvent.click(within(dialog).getByRole('button', { name: '締め処理を実行' }));

      expect(await screen.findByText(expected)).toBeInTheDocument();
      expect(screen.queryByText(/Not found/i)).not.toBeInTheDocument();
    });

    it('月次締めの 404 以外の失敗は従来の文言を表示する（表示欄を設けた）', async () => {
      vi.mocked(executionBudgetApi.executeMonthlyClose).mockRejectedValue(
        new ApiError(409, '月次締め済みです')
      );
      renderBudgetPage();

      await userEvent.click(await screen.findByRole('button', { name: '月次締め' }));
      const dialog = await screen.findByRole('dialog', { name: '月次締め' });
      await userEvent.type(within(dialog).getByDisplayValue(''), '2026-03');
      await userEvent.click(within(dialog).getByRole('button', { name: '締め処理を実行' }));

      expect(await screen.findByText('月次締め済みです')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// 変更契約の反映の画面
// ============================================================================

describe('変更契約の反映の画面（ExecutionBudgetAmendmentPage）', () => {
  it('実行予算の取得が 404 で案件の取得も 404 なら、プロジェクトが見つからない旨を出し、未反映の変更契約が無い旨を出さない（21.1）', async () => {
    vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(null);
    vi.mocked(projectsApi.getProject).mockRejectedValue(projectNotFound());

    renderAmendmentPage();

    await expectResourceNotFound('プロジェクト', 'プロジェクト一覧に戻る', '/projects');
    expect(screen.queryByText('未反映の変更契約はありません')).not.toBeInTheDocument();
  });

  it('実行予算の取得が 404 でも案件が取得できれば従来の表示（21.1）', async () => {
    vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(null);

    renderAmendmentPage();

    expect(await screen.findByText('未反映の変更契約はありません')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'プロジェクトが見つかりません' })
    ).not.toBeInTheDocument();
  });

  it('実行予算の取得が 404 で案件の取得が 404 以外で失敗したら読み込みの失敗を表示する（21.1）', async () => {
    vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(null);
    vi.mocked(projectsApi.getProject).mockRejectedValue(new Error('Network error'));

    renderAmendmentPage();

    expect(await screen.findByText('データの取得に失敗しました')).toBeInTheDocument();
  });

  describe('項目差分の取得と反映（21.2）', () => {
    beforeEach(() => {
      vi.mocked(executionBudgetApi.getUnreflectedAmendments).mockResolvedValue([
        {
          id: 'amend-1',
          estimateName: '変更見積',
          contractAmount: 12000000,
        } as unknown as executionBudgetApi.UnreflectedAmendment,
      ]);
    });

    it.each([
      ['汎用の 404', genericNotFound(), PROJECT_GONE],
      [
        '変更契約の不在の 404',
        bodyNotFound('AMENDMENT_CONTRACT_NOT_FOUND', '指定された変更契約が見つかりません'),
        AMENDMENT_GONE,
      ],
    ])('項目差分の取得の %s で見つからない旨を表示する', async (_label, error, expected) => {
      vi.mocked(executionBudgetApi.getAmendmentDiff).mockRejectedValue(error);
      renderAmendmentPage();

      await userEvent.click(await screen.findByTestId('open-detail-amend-1'));

      const dialog = await screen.findByRole('dialog', { name: '変更契約反映の確認' });
      expect(await within(dialog).findByText(expected)).toBeInTheDocument();
      expect(screen.queryByText(/Not found/i)).not.toBeInTheDocument();
      expect(screen.queryByText('指定された変更契約が見つかりません')).not.toBeInTheDocument();
    });

    it('反映の 404 で見つからない旨を表示し、409 は従来の文言を表示する', async () => {
      vi.mocked(executionBudgetApi.getAmendmentDiff).mockResolvedValue({
        contractId: 'amend-1',
        contractAmount: '13000000',
        addedItems: [],
        modifiedItems: [],
      } as unknown as executionBudgetApi.AmendmentDiff);
      vi.mocked(executionBudgetApi.applyAmendment).mockRejectedValueOnce(
        bodyNotFound('AMENDMENT_CONTRACT_NOT_FOUND', '指定された変更契約が見つかりません')
      );
      renderAmendmentPage();

      await userEvent.click(await screen.findByTestId('open-detail-amend-1'));
      const confirm = await screen.findByTestId('apply-amendment-confirm');
      await waitFor(() => expect(confirm).toBeEnabled());
      await userEvent.click(confirm);
      expect(await screen.findByText(AMENDMENT_GONE)).toBeInTheDocument();

      vi.mocked(executionBudgetApi.applyAmendment).mockRejectedValueOnce(
        new ApiError(409, '既に反映済みです')
      );
      await userEvent.click(screen.getByTestId('apply-amendment-confirm'));
      expect(await screen.findByText('既に反映済みです')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// 発注詳細の画面
// ============================================================================

describe('発注詳細の画面（OrderDetailPage）', () => {
  it('発注の取得の汎用の 404 で、発注が見つからない旨と実行予算の画面へのリンクを出し、応答の英語の文言を出さない（21.1）', async () => {
    vi.mocked(orderDetailApi.getOrderDetail).mockRejectedValue(genericNotFound());

    renderOrderPage();

    await expectResourceNotFound('発注', '実行予算に戻る', '/projects/project-1/execution-budget');
    expect(screen.queryByText('データの取得に失敗しました')).not.toBeInTheDocument();
  });

  it('発注の取得の 404 以外の失敗は従来の表示を保つ（21.1）', async () => {
    vi.mocked(orderDetailApi.getOrderDetail).mockRejectedValue(new Error('Network error'));

    renderOrderPage();

    expect(await screen.findByText('データの取得に失敗しました')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '発注が見つかりません' })).not.toBeInTheDocument();
  });

  describe('操作（21.2）', () => {
    async function openOrder(): Promise<void> {
      renderOrderPage();
      await screen.findByRole('heading', { name: '発注詳細', level: 1 });
    }

    it('チェック済み項目の更新の 404 で見つからない旨を表示し、404 以外の失敗も従来の文言で表示する（表示欄を設けた）', async () => {
      vi.mocked(orderDetailApi.updateOrderItems).mockRejectedValueOnce(genericNotFound());
      await openOrder();

      await userEvent.click(screen.getByRole('button', { name: 'チェック状態を保存' }));
      expect(await screen.findByText(ORDER_GONE)).toBeInTheDocument();
      expect(screen.queryByText(/Not found/i)).not.toBeInTheDocument();

      vi.mocked(orderDetailApi.updateOrderItems).mockRejectedValueOnce(
        new ApiError(422, '発注済みの発注は編集できません')
      );
      await userEvent.click(screen.getByRole('button', { name: 'チェック状態を保存' }));
      expect(await screen.findByText('発注済みの発注は編集できません')).toBeInTheDocument();
      expect(screen.queryByText(ORDER_GONE)).not.toBeInTheDocument();
    });

    it('確定発注金額の保存の 404 で見つからない旨を表示する', async () => {
      vi.mocked(orderDetailApi.updateOrder).mockRejectedValueOnce(
        bodyNotFound('ORDER_NOT_FOUND', '発注が見つかりません')
      );
      await openOrder();

      await userEvent.type(screen.getByLabelText('確定発注金額'), '400000');
      await userEvent.click(screen.getByRole('button', { name: '保存' }));

      expect(await screen.findByText(ORDER_GONE)).toBeInTheDocument();
    });

    it('取引先の変更の 404 で見つからない旨を表示する', async () => {
      vi.mocked(orderDetailApi.updateOrder).mockRejectedValueOnce(genericNotFound());
      await openOrder();

      await userEvent.click(screen.getByRole('button', { name: '取引先を選ぶ' }));

      expect(await screen.findByText(ORDER_GONE)).toBeInTheDocument();
      expect(orderDetailApi.updateOrder).toHaveBeenCalledWith('project-1', 'order-1', {
        tradingPartnerId: 'vendor-2',
      });
    });

    it('ステータスの変更の 404 で見つからない旨を表示し、422 は従来の文言を表示する', async () => {
      vi.mocked(orderDetailApi.updateOrderStatus).mockRejectedValueOnce(genericNotFound());
      await openOrder();

      await userEvent.click(screen.getByRole('button', { name: '発注金額検討中にする' }));
      expect(await screen.findByText(ORDER_GONE)).toBeInTheDocument();
      expect(screen.queryByText(/Not found/i)).not.toBeInTheDocument();

      vi.mocked(orderDetailApi.updateOrderStatus).mockRejectedValueOnce(
        new ApiError(422, '無効なステータス遷移です')
      );
      await userEvent.click(screen.getByRole('button', { name: '発注金額検討中にする' }));
      expect(await screen.findByText('無効なステータス遷移です')).toBeInTheDocument();
    });

    it('取り除きの 404 で見つからない旨を表示する', async () => {
      vi.mocked(orderDetailApi.deleteOrder).mockRejectedValueOnce(genericNotFound());
      await openOrder();

      await userEvent.click(screen.getByRole('button', { name: '削除' }));
      await userEvent.click(await screen.findByRole('button', { name: '削除する' }));

      expect(await screen.findByText(ORDER_GONE)).toBeInTheDocument();
      expect(screen.queryByText(/Not found/i)).not.toBeInTheDocument();
    });

    it.each([
      ['汎用の 404', genericNotFound(), PROJECT_GONE],
      [
        '実行予算の不在の 404',
        bodyNotFound('EXECUTION_BUDGET_NOT_FOUND_FOR_ORDER', '実行予算が見つかりません'),
        BUDGET_GONE,
      ],
    ])('発注の作成の %s で見つからない旨を表示する', async (_label, error, expected) => {
      vi.mocked(orderDetailApi.createOrder).mockRejectedValueOnce(error);
      renderOrderPage('new');
      await screen.findByRole('heading', { name: '発注作成', level: 1 });

      await userEvent.click(screen.getByRole('button', { name: '取引先を選ぶ' }));
      await userEvent.click(screen.getByRole('button', { name: '作成' }));

      expect(await screen.findByText(expected)).toBeInTheDocument();
      expect(screen.queryByText(/Not found/i)).not.toBeInTheDocument();
      expect(screen.queryByText('実行予算が見つかりません')).not.toBeInTheDocument();
    });
  });
});

// ============================================================================
// 出来高入力の画面
// ============================================================================

describe('出来高入力の画面（ProgressInputPage）', () => {
  it('読み込みの 404 で案件の取得も 404 なら、プロジェクトが見つからない旨を出し、読み込みの失敗のトーストと実行予算が見つからない旨を出さない（21.1）', async () => {
    vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(null);
    vi.mocked(progressApi.getProgressHistory).mockRejectedValue(genericNotFound());
    vi.mocked(progressApi.getMonthlyProgress).mockRejectedValue(genericNotFound());
    vi.mocked(projectsApi.getProject).mockRejectedValue(projectNotFound());

    renderProgressPage();

    await expectResourceNotFound('プロジェクト', 'プロジェクト一覧に戻る', '/projects');
    expect(screen.queryByText('実行予算が見つかりません')).not.toBeInTheDocument();
    expect(toastMocks.error).not.toHaveBeenCalled();
  });

  it('読み込みの 404 でも案件が取得できれば従来の表示（21.1）', async () => {
    vi.mocked(executionBudgetApi.getExecutionBudget).mockResolvedValue(null);
    vi.mocked(progressApi.getProgressHistory).mockRejectedValue(
      bodyNotFound(undefined, '実行予算が見つかりません')
    );

    renderProgressPage();

    expect(await screen.findByText('実行予算が見つかりません')).toBeInTheDocument();
    expect(projectsApi.getProject).toHaveBeenCalledWith('project-1');
    expect(toastMocks.error).toHaveBeenCalledWith('データの読み込みに失敗しました');
    expect(
      screen.queryByRole('heading', { name: 'プロジェクトが見つかりません' })
    ).not.toBeInTheDocument();
  });

  it('読み込みの 404 以外の失敗は案件を確かめず従来の表示（21.1）', async () => {
    vi.mocked(progressApi.getProgressHistory).mockRejectedValue(new ApiError(500, 'boom'));

    renderProgressPage();

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith('データの読み込みに失敗しました');
    });
    expect(projectsApi.getProject).not.toHaveBeenCalled();
  });

  describe('操作（21.2）', () => {
    it('出来高の保存の 404 で見つからない旨を表示し、出来高の保存の失敗の文言を出さない。404 以外は従来の文言', async () => {
      vi.mocked(progressApi.saveProgress).mockRejectedValueOnce(genericNotFound());
      renderProgressPage();

      await userEvent.click(await screen.findByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(toastMocks.error).toHaveBeenCalledWith(PROJECT_GONE);
      });
      expect(toastMocks.error).not.toHaveBeenCalledWith('出来高の保存に失敗しました');

      vi.mocked(progressApi.saveProgress).mockRejectedValueOnce(new ApiError(500, 'boom'));
      await userEvent.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(toastMocks.error).toHaveBeenCalledWith('出来高の保存に失敗しました');
      });
    });

    it('出来高の保存の実行予算の不在の 404 は実行予算が見つからない旨', async () => {
      vi.mocked(progressApi.saveProgress).mockRejectedValueOnce(
        bodyNotFound('EXECUTION_BUDGET_NOT_FOUND_FOR_PROGRESS', '実行予算が見つかりません')
      );
      renderProgressPage();

      await userEvent.click(await screen.findByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(toastMocks.error).toHaveBeenCalledWith(BUDGET_GONE);
      });
    });

    it('出来高記録の取り除きの 404 で見つからない旨を表示し、出来高記録の削除の失敗の文言を出さない', async () => {
      vi.mocked(progressApi.deleteProgress).mockRejectedValueOnce(
        bodyNotFound('PROGRESS_RECORD_NOT_FOUND', '出来高レコードが見つかりません')
      );
      renderProgressPage();

      const rows = await screen.findAllByTestId(/^history-row-/);
      await userEvent.click(within(rows[0]!).getByRole('button', { name: '削除' }));
      await userEvent.click(await screen.findByRole('button', { name: '削除する' }));

      await waitFor(() => {
        expect(toastMocks.error).toHaveBeenCalledWith(PROGRESS_RECORD_GONE);
      });
      expect(toastMocks.error).not.toHaveBeenCalledWith('出来高レコードの削除に失敗しました');
    });

    it('施工日指定の取得の失敗は対象外で、従来の文言のまま', async () => {
      vi.mocked(progressApi.getProgressByDate).mockRejectedValueOnce(genericNotFound());
      renderProgressPage();

      const rows = await screen.findAllByTestId(/^history-row-/);
      await userEvent.click(rows[0]!);

      await waitFor(() => {
        expect(toastMocks.error).toHaveBeenCalledWith('出来高データの読み込みに失敗しました');
      });
    });
  });
});
