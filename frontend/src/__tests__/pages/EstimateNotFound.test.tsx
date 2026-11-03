/**
 * @fileoverview 見積書の画面が 404 を受けたときの不在の表示のテスト
 *
 * estimate-creation のタスク64.1。見積書の一覧・新規作成・詳細の画面の読み込みの 404 で、見つからない旨と
 * プロジェクトの一覧へのリンクを表示し、取得の失敗の文言と再試行の釦を出さないこと（Requirement 58.1）。
 * 作成・保存・削除・諸経費の計算の 404 で、見つからない旨の日本語のメッセージを表示し、操作の失敗の汎用の
 * 文言を出さず、無視しないこと（Requirement 58.2）。404 以外の失敗の従来の文言は保つ。
 *
 * 詳細の画面は明細・ツールバー・諸経費のパネルを実物のまま描く（`EstimateDetailPage.saveError.test.tsx` と
 * 同じく、barrel を丸ごとモックすると操作の結線が見えないため）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateListPage from '../../pages/EstimateListPage';
import EstimateCreatePage from '../../pages/EstimateCreatePage';
import EstimateDetailPage from '../../pages/EstimateDetailPage';
import { ApiError } from '../../api/client';
import * as estimatesApi from '../../api/estimates';
import * as itemizedStatementsApi from '../../api/itemized-statements';

vi.mock('../../api/estimates');
vi.mock('../../api/itemized-statements');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useBlocker: () => ({ state: 'unblocked' as const, proceed: vi.fn(), reset: vi.fn() }),
  };
});

// ============================================================================
// テストデータ
// ============================================================================

const ESTIMATE_GONE = '見積書が見つかりません。すでに削除された可能性があります。';
const PROJECT_GONE = 'プロジェクトが見つかりません。すでに削除された可能性があります。';
const STATEMENT_GONE = '内訳書が見つかりません。すでに削除された可能性があります。';

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

/** 範囲内の利用者に届く見積書の不在（本文は見積書の ID を含む） */
function estimateNotFound(): ApiError {
  return new ApiError(404, '見積書が見つかりません: est-001', {
    status: 404,
    detail: '見積書が見つかりません: est-001',
    code: 'ESTIMATE_NOT_FOUND',
  });
}

function serverError(): ApiError {
  return new ApiError(500, 'Internal Server Error', { status: 500 });
}

const buildLine = (itemId: string, lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR') => ({
  id: `${itemId}-${lineType}`,
  estimateItemId: itemId,
  lineType,
  name: lineType === 'ESTIMATE' ? '項目A' : null,
  specification: null,
  unit: '式',
  quantity: '1',
  unitPrice: '100000',
  amount: '100000',
  remarks: null,
  sourceReceivedQuotationLineItemId: null,
  sourceVendorName: null,
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
});

const mockItems = [
  {
    id: 'item-a',
    estimateId: 'est-001',
    parentId: null,
    displayOrder: 0,
    lines: [
      buildLine('item-a', 'ESTIMATE'),
      buildLine('item-a', 'EXECUTION'),
      buildLine('item-a', 'VENDOR'),
    ],
    children: [],
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
  },
] as unknown as estimatesApi.EstimateItemHierarchy[];

const mockEstimateDetail = {
  id: 'est-001',
  projectId: 'proj-001',
  name: 'テスト見積書',
  sourceItemizedStatementId: null,
  sourceItemizedStatementName: null,
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
  items: mockItems,
  totalAmount: '100000',
} as unknown as estimatesApi.EstimateDetail;

// ============================================================================
// ヘルパー
// ============================================================================

const renderList = () =>
  render(
    <MemoryRouter initialEntries={['/projects/proj-001/estimates']}>
      <Routes>
        <Route path="/projects/:projectId/estimates" element={<EstimateListPage />} />
      </Routes>
    </MemoryRouter>
  );

const renderCreate = () =>
  render(
    <MemoryRouter initialEntries={['/projects/proj-001/estimates/new']}>
      <Routes>
        <Route path="/projects/:projectId/estimates/new" element={<EstimateCreatePage />} />
      </Routes>
    </MemoryRouter>
  );

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={['/estimates/est-001']}>
      <Routes>
        <Route path="/estimates/:id" element={<EstimateDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

/** 不在の表示（ResourceNotFound）。戻り先はプロジェクトの一覧 */
async function expectNotFoundView(resourceType: '見積書' | 'プロジェクト'): Promise<void> {
  expect(
    await screen.findByRole('heading', { name: `${resourceType}が見つかりません` })
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'プロジェクト一覧に戻る' })).toHaveAttribute(
    'href',
    '/projects'
  );
  expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
}

/** 画面の見出しの横の見積書の削除の釦（明細のツールバーの行の削除の釦と区別する） */
const headerDeleteButton = (): HTMLElement => {
  const toolbar = screen.getByTestId('estimate-item-toolbar');
  const button = screen
    .getAllByRole('button', { name: '削除' })
    .find((candidate) => !toolbar.contains(candidate));
  if (button === undefined) {
    throw new Error('見積書の削除の釦が見つかりません');
  }
  return button;
};

const waitForDetail = async (): Promise<void> => {
  expect(
    await screen.findByRole('heading', { level: 1, name: 'テスト見積書' })
  ).toBeInTheDocument();
};

// ============================================================================
// テスト
// ============================================================================

describe('見積書の画面の 404 の表示（estimate-creation タスク64.1）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    vi.mocked(itemizedStatementsApi.getItemizedStatements).mockResolvedValue({
      data: [
        {
          id: 'is-001',
          name: '内訳書A',
          projectId: 'proj-001',
          sourceQuantityTableId: 'qt-1',
          sourceQuantityTableName: '数量表',
          itemCount: 1,
          createdAt: '2024-01-15T00:00:00.000Z',
          updatedAt: '2024-01-15T00:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    } as unknown as Awaited<ReturnType<typeof itemizedStatementsApi.getItemizedStatements>>);
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
    vi.mocked(estimatesApi.getEstimateItems).mockResolvedValue(mockItems);
  });

  // --------------------------------------------------------------------------
  // 一覧の画面
  // --------------------------------------------------------------------------

  describe('見積書の一覧の画面', () => {
    /**
     * @requirement estimate-creation/REQ-58.1
     */
    it('一覧の取得の 404 でプロジェクトが見つからない旨とプロジェクトの一覧へのリンクを表示し、取得の失敗の文言を出さない', async () => {
      vi.mocked(estimatesApi.getEstimates).mockRejectedValue(genericNotFound());
      renderList();

      await expectNotFoundView('プロジェクト');
      expect(screen.queryByText('見積書の取得に失敗しました')).not.toBeInTheDocument();
      expect(screen.queryByText('Not found')).not.toBeInTheDocument();
    });

    it('404 以外の失敗は従来どおり取得の失敗の文言と再試行の釦を表示する', async () => {
      vi.mocked(estimatesApi.getEstimates).mockRejectedValue(serverError());
      renderList();

      expect(await screen.findByText('見積書の取得に失敗しました')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
      expect(screen.queryByText('プロジェクトが見つかりません')).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // 新規作成の画面
  // --------------------------------------------------------------------------

  describe('見積書の新規作成の画面', () => {
    /**
     * @requirement estimate-creation/REQ-58.1
     */
    it('内訳書の一覧の取得の 404 でプロジェクトが見つからない旨を表示し、入力欄を出さない', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatements).mockRejectedValue(genericNotFound());
      renderCreate();

      await expectNotFoundView('プロジェクト');
      expect(screen.queryByLabelText('見積書名')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '作成' })).not.toBeInTheDocument();
    });

    it('内訳書の一覧の取得の 404 以外の失敗は従来どおり無視して選択肢を空にする', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatements).mockRejectedValue(serverError());
      renderCreate();

      const select = await screen.findByRole('combobox', { name: '内訳書を選択' });
      expect(
        within(select)
          .getAllByRole('option')
          .map((o) => o.textContent)
      ).toEqual(['選択しない']);
      expect(screen.queryByText('プロジェクトが見つかりません')).not.toBeInTheDocument();
    });

    /**
     * @requirement estimate-creation/REQ-58.2
     */
    it('作成の汎用の 404 はプロジェクト、内訳書の不在の符号は内訳書が見つからない旨を表示し、作成の失敗の文言を出さない', async () => {
      const user = userEvent.setup();
      vi.mocked(estimatesApi.createEstimate).mockRejectedValueOnce(genericNotFound());
      renderCreate();
      await screen.findByRole('combobox', { name: '内訳書を選択' });

      await user.click(screen.getByRole('button', { name: '作成' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(PROJECT_GONE);
      expect(screen.queryByText('見積書の作成に失敗しました')).not.toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();

      vi.mocked(estimatesApi.createEstimate).mockRejectedValueOnce(
        new ApiError(404, '内訳書が見つかりません: is-001', {
          status: 404,
          detail: '内訳書が見つかりません: is-001',
          code: 'ITEMIZED_STATEMENT_NOT_FOUND',
        })
      );
      await user.selectOptions(screen.getByRole('combobox', { name: '内訳書を選択' }), 'is-001');
      await user.click(screen.getByRole('button', { name: '作成' }));
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(STATEMENT_GONE);
      });
      expect(screen.queryByText(/is-001/)).not.toBeInTheDocument();
      expect(screen.queryByText('見積書の作成に失敗しました')).not.toBeInTheDocument();
    });

    it('作成の 404 以外の失敗は従来どおり作成の失敗の文言を表示する', async () => {
      const user = userEvent.setup();
      vi.mocked(estimatesApi.createEstimate).mockRejectedValue(serverError());
      renderCreate();
      await screen.findByRole('combobox', { name: '内訳書を選択' });

      await user.click(screen.getByRole('button', { name: '作成' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('見積書の作成に失敗しました');
    });
  });

  // --------------------------------------------------------------------------
  // 詳細の画面
  // --------------------------------------------------------------------------

  describe('見積書の詳細の画面', () => {
    /**
     * @requirement estimate-creation/REQ-58.1
     */
    it('見積書の取得の 404 で見積書が見つからない旨とプロジェクトの一覧へのリンクを表示し、取得の失敗の文言と再試行の釦を出さない', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockRejectedValue(genericNotFound());
      renderDetail();

      await expectNotFoundView('見積書');
      expect(screen.queryByText('見積書の取得に失敗しました')).not.toBeInTheDocument();
    });

    it('見積項目の取得の 404 と本体の不在の符号も同じ見つからない旨の表示にする', async () => {
      vi.mocked(estimatesApi.getEstimateItems).mockRejectedValue(estimateNotFound());
      renderDetail();

      await expectNotFoundView('見積書');
      expect(screen.queryByText(/est-001/)).not.toBeInTheDocument();
      expect(screen.queryByText('見積書の取得に失敗しました')).not.toBeInTheDocument();
    });

    it('404 以外の失敗は従来どおり取得の失敗の文言と再試行の釦を表示する', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockRejectedValue(serverError());
      renderDetail();

      expect(await screen.findByText('見積書の取得に失敗しました')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
      expect(screen.queryByText('見積書が見つかりません')).not.toBeInTheDocument();
    });

    /**
     * @requirement estimate-creation/REQ-58.2
     */
    it('削除の 404 で確認のダイアログを閉じ、見積書を表示したまま見つからない旨のメッセージを表示する', async () => {
      const user = userEvent.setup();
      vi.mocked(estimatesApi.deleteEstimate).mockRejectedValue(genericNotFound());
      renderDetail();
      await waitForDetail();

      await user.click(headerDeleteButton());
      const dialog = screen.getByRole('dialog', { name: '見積書の削除' });
      await user.click(within(dialog).getByRole('button', { name: '削除' }));

      const message = await screen.findByTestId('estimate-operation-error');
      expect(message).toHaveAttribute('role', 'alert');
      expect(message).toHaveTextContent(ESTIMATE_GONE);
      expect(screen.queryByRole('dialog', { name: '見積書の削除' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'テスト見積書' })).toBeInTheDocument();
      expect(screen.queryByText('見積書の削除に失敗しました')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('削除の 404 以外の失敗は従来どおり削除の失敗の文言と再試行の釦で画面を置き換える', async () => {
      const user = userEvent.setup();
      vi.mocked(estimatesApi.deleteEstimate).mockRejectedValue(serverError());
      renderDetail();
      await waitForDetail();

      await user.click(headerDeleteButton());
      const dialog = screen.getByRole('dialog', { name: '見積書の削除' });
      await user.click(within(dialog).getByRole('button', { name: '削除' }));

      expect(await screen.findByText('見積書の削除に失敗しました')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
      expect(screen.queryByTestId('estimate-operation-error')).not.toBeInTheDocument();
    });

    /**
     * @requirement estimate-creation/REQ-58.2
     */
    it('諸経費の計算の 404 で諸経費のパネルに見積書が見つからない旨を表示する', async () => {
      const user = userEvent.setup();
      vi.mocked(estimatesApi.calculateOverhead).mockRejectedValue(genericNotFound());
      renderDetail();
      await waitForDetail();

      fireEvent.click(screen.getByRole('button', { name: '諸経費を計算して追加' }));
      const dialog = screen.getByTestId('overhead-cost-dialog');
      fireEvent.change(within(dialog).getByLabelText('直接工事費'), {
        target: { value: '100000' },
      });
      fireEvent.change(within(dialog).getByLabelText('工期'), { target: { value: '12' } });
      await user.click(within(dialog).getByRole('button', { name: '計算' }));

      await waitFor(() => {
        expect(within(dialog).getByRole('alert')).toHaveTextContent(ESTIMATE_GONE);
      });
      expect(estimatesApi.calculateOverhead).toHaveBeenCalledWith('est-001', expect.any(Object));
      expect(within(dialog).getByRole('button', { name: '計算' })).toBeEnabled();
    });
  });
});
