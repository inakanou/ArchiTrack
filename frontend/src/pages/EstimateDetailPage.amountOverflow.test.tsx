/**
 * @fileoverview EstimateDetailPage の金額の上限超過（オーバーフロー）の警告表示テスト
 *
 * Task 61.2: 見積書詳細画面の金額計算（葉の 数量×単価、親の子の合計、サマリーの合計）が
 * 金額の上限（保存スキーマの整数部13桁・小数部2桁）を超えたとき、画面にオーバーフロー警告を
 * 表示することを、実物のページ・編集フック・明細行で検証する。
 * 実ブラウザでの一気通貫は E2E `e2e/specs/estimate/estimate-amount-overflow-e2e.spec.ts` が検める。
 *
 * Requirements (estimate-creation):
 * - 13.5: 金額計算結果が数値の最大値を超えた場合にオーバーフロー警告を表示する
 *
 * @module pages/EstimateDetailPage.amountOverflow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateDetailPage from './EstimateDetailPage';
import * as estimatesApi from '../api/estimates';

vi.mock('../api/estimates');

// jsdom は MemoryRouter で描画するためデータルーター前提の `useBlocker` が動かない。
// `EstimateDetailPage.saveError.test.tsx` と同じ確立済みパターンでモックする。
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useBlocker: () => ({ state: 'unblocked' as const, proceed: vi.fn(), reset: vi.fn() }),
  };
});

/**
 * 見積書APIの返却形の明細行（数量・単価・金額は**数値**で返る。
 * `EstimateDetailPage` の `toDecimalPayloadValue` の注記）
 */
const buildLine = (
  itemId: string,
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR',
  name: string,
  quantity: number | null,
  unitPrice: number | null,
  amount: number | null
) => ({
  id: `${itemId}-${lineType}`,
  estimateItemId: itemId,
  lineType,
  name,
  specification: null,
  unit: '式',
  quantity,
  unitPrice,
  amount,
  remarks: null,
  sourceReceivedQuotationLineItemId: null,
  sourceVendorName: null,
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
});

/** 見積金額行だけに金額を持ち、実行・業者金額行は小さな金額の項目 */
const buildItem = (
  id: string,
  name: string,
  parentId: string | null,
  displayOrder: number,
  estimateUnitPrice: number | null,
  children: unknown[] = []
) => ({
  id,
  estimateId: 'est-001',
  parentId,
  displayOrder,
  itemType: 'STANDARD',
  lines: [
    buildLine(
      id,
      'ESTIMATE',
      name,
      estimateUnitPrice === null ? null : 1,
      estimateUnitPrice,
      estimateUnitPrice
    ),
    buildLine(id, 'EXECUTION', name, 1, 100, 100),
    buildLine(id, 'VENDOR', name, 1, 100, 100),
  ],
  children,
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
});

/** 親（子の合計）・子A（6兆円）・子B（1000円）。親の合計は上限内 */
const buildItems = () => [
  buildItem('item-parent', '親項目', null, 0, null, [
    buildItem('item-a', '子項目A', 'item-parent', 0, 6000000000000),
    buildItem('item-b', '子項目B', 'item-parent', 1, 1000),
  ]),
];

const mockEstimateDetail = {
  id: 'est-001',
  projectId: 'proj-001',
  name: 'テスト見積書',
  sourceItemizedStatementId: null,
  sourceItemizedStatementName: null,
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
  items: buildItems(),
  totalAmount: '0',
} as unknown as estimatesApi.EstimateDetail;

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/estimates/est-001']}>
      <Routes>
        <Route path="/estimates/:id" element={<EstimateDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

/** 名称欄の値で見積項目（3行1セット）を探す */
const findItemRowByName = (name: string): HTMLElement => {
  const rows = screen.getAllByTestId('estimate-item-row');
  const row = rows.find((candidate) =>
    within(candidate)
      .getAllByLabelText('名称')
      .some((input) => (input as HTMLInputElement).value === name)
  );
  if (row === undefined) {
    throw new Error(`見積項目「${name}」の行が見つからない`);
  }
  return row;
};

const estimateAmountField = (row: HTMLElement): HTMLElement =>
  within(within(row).getByTestId('line-type-ESTIMATE')).getByTestId('amount-field');

describe('EstimateDetailPage 金額の上限超過の警告 (13.5)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
    vi.mocked(estimatesApi.getEstimateItems).mockResolvedValue(
      buildItems() as unknown as Awaited<ReturnType<typeof estimatesApi.getEstimateItems>>
    );
    vi.mocked(estimatesApi.heartbeatEstimateEditSession).mockResolvedValue({
      otherEditors: [],
      ttlSeconds: 90,
      heartbeatIntervalSeconds: 20,
    });
    vi.mocked(estimatesApi.leaveEstimateEditSession).mockResolvedValue(undefined);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('上限内の金額だけなら警告を出さない (13.5)', async () => {
    renderPage();
    await screen.findByTestId('estimate-detail-page');
    await waitFor(() => {
      expect(estimateAmountField(findItemRowByName('親項目'))).toHaveTextContent(
        '6,000,000,001,000'
      );
    });

    expect(screen.queryByTestId('estimate-amount-overflow-warning')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-amount-overflow="true"]')).toHaveLength(0);
  });

  /**
   * @requirement estimate-creation/REQ-13.5 金額計算結果が数値の最大値を超えた場合にオーバーフロー警告を表示する
   */
  it('単価の入力で親の合計とサマリーが上限を超えると警告し、戻すと警告が消える (13.5)', async () => {
    renderPage();
    await screen.findByTestId('estimate-detail-page');
    await waitFor(() => {
      expect(findItemRowByName('子項目B')).toBeInTheDocument();
    });

    // 子項目B の見積単価を 6兆円にすると、子B 自身は上限内のまま、親の合計（12兆円）が上限を超える
    const unitPriceB = within(
      within(findItemRowByName('子項目B')).getByTestId('line-type-ESTIMATE')
    ).getByLabelText('単価');
    fireEvent.change(unitPriceB, { target: { value: '6000000000000' } });

    const warning = await screen.findByTestId('estimate-amount-overflow-warning');
    expect(warning).toHaveAttribute('role', 'alert');
    expect(warning).toHaveTextContent('金額が上限（9,999,999,999,999円）を超えています');
    expect(warning).toHaveTextContent('上限を超えた金額は保存できません');
    // 明細は親の見積金額行の 1 件。サマリーは見積金額合計と利益額の 2 件
    expect(warning).toHaveTextContent('明細 1 件、サマリー 2 件');

    const parentAmount = estimateAmountField(findItemRowByName('親項目'));
    expect(parentAmount).toHaveAttribute('data-amount-overflow', 'true');
    expect(parentAmount).toHaveAttribute('aria-invalid', 'true');
    expect(parentAmount).toHaveTextContent('12,000,000,000,000');
    expect(estimateAmountField(findItemRowByName('子項目B'))).not.toHaveAttribute(
      'data-amount-overflow'
    );

    const summary = screen.getByTestId('summary-panel');
    const overflowingSummary = summary.querySelectorAll('[data-amount-overflow="true"]');
    expect(overflowingSummary).toHaveLength(2);
    for (const value of overflowingSummary) {
      expect(value).toHaveAttribute('aria-invalid', 'true');
      expect(value).toHaveAccessibleDescription(/金額が上限（9,999,999,999,999円）を超えています/);
    }

    // 単価を戻すと警告が消える
    fireEvent.change(unitPriceB, { target: { value: '1000' } });
    await waitFor(() => {
      expect(screen.queryByTestId('estimate-amount-overflow-warning')).not.toBeInTheDocument();
    });
    expect(document.querySelectorAll('[data-amount-overflow="true"]')).toHaveLength(0);
  });

  it('数量×単価の結果そのものが上限を超えた明細行にも警告を付ける (13.5)', async () => {
    renderPage();
    await screen.findByTestId('estimate-detail-page');
    await waitFor(() => {
      expect(findItemRowByName('子項目A')).toBeInTheDocument();
    });

    // 子項目A（単価 6兆円）の数量を 2 にすると、子A 自身が 12兆円で上限を超える
    const quantityA = within(
      within(findItemRowByName('子項目A')).getByTestId('line-type-ESTIMATE')
    ).getByLabelText('数量');
    fireEvent.change(quantityA, { target: { value: '2' } });

    const warning = await screen.findByTestId('estimate-amount-overflow-warning');
    // 子A と、その合計を受ける親の 2 件
    expect(warning).toHaveTextContent('明細 2 件');
    expect(estimateAmountField(findItemRowByName('子項目A'))).toHaveAttribute(
      'data-amount-overflow',
      'true'
    );
  });
});
