/**
 * @fileoverview EstimateDetailPage のNET金額案分の統合テスト（実物のコンポーネントで検証）
 *
 * Task 55.3: 案分ダイアログの入力元を編集中の明細へ変更
 *
 * `EstimateDetailPage.test.tsx` は `../components/estimate` を丸ごとモックするため、
 * 「業者金額を未保存で編集する → ダイアログのプレビュー → 適用結果」の一気通貫を
 * 捉えられない（53.16 / 54.10 で繰り返し死角になった死んだ props と同じ問題）。
 * 本ファイルは明細テーブルと案分ダイアログを**実物のまま**描画し、
 * プレビューに出た金額と実際に明細へ入る金額が一致することを固定する。
 *
 * Requirements (estimate-creation):
 * - 5.1: 業者と対象の業者金額行を指定した場合、案分対象として選択状態にする
 * - 5.3: NET金額を入力した場合、除外行以外の業者金額行を実行金額行に転記する
 * - 5.9: 未保存の新規行が案分対象に含まれる場合、その行も案分対象として扱う
 * - 18.7: 各行の案分率と案分後金額のプレビューを表示する
 * - 18.10: 編集中の業者金額行（未保存の追加・編集を含む）を案分対象の一覧に表示する
 * - 33.4: 合計金額を編集中の業者金額行の値に基づいて計算する
 * - 49.1: 結果を未保存の変更として編集中の明細に反映する
 * - 49.2: 明細の再取得を行わず、それまでの未保存の編集内容を保持する
 * - 49.3: 実行の時点でデータベースへの書き込みを行わない
 * - 49.6: 計算対象を編集中の明細の値とする
 * - 49.7: 計算対象に未保存の新規項目を含める
 *
 * @module pages/EstimateDetailPage.netAllocation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateDetailPage from './EstimateDetailPage';
import * as estimatesApi from '../api/estimates';
import { getReceivedQuotationsByProject } from '../api/received-quotations';

vi.mock('../api/estimates');

vi.mock('../api/received-quotations', () => ({
  getReceivedQuotationsByProject: vi.fn(),
}));

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

const buildLine = (
  itemId: string,
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR',
  name: string,
  unitPrice: string | null,
  vendorName: string | null
) => ({
  id: `${itemId}-${lineType}`,
  estimateItemId: itemId,
  lineType,
  name,
  specification: null,
  unit: '式',
  quantity: '1',
  unitPrice,
  amount: unitPrice,
  remarks: null,
  sourceReceivedQuotationLineItemId: null,
  sourceVendorName: vendorName,
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
});

const buildItem = (id: string, name: string, vendorUnitPrice: string, displayOrder: number) => ({
  id,
  estimateId: 'est-001',
  parentId: null,
  displayOrder,
  lines: [
    buildLine(id, 'ESTIMATE', name, null, null),
    buildLine(id, 'EXECUTION', name, null, null),
    buildLine(id, 'VENDOR', name, vendorUnitPrice, '業者A'),
  ],
  children: [],
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
});

const mockEstimateDetail = {
  id: 'est-001',
  projectId: 'proj-001',
  name: 'テスト見積書',
  sourceItemizedStatementId: null,
  sourceItemizedStatementName: null,
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
  items: [buildItem('item-a', '項目A', '100000', 0), buildItem('item-b', '項目B', '100000', 1)],
  totalAmount: '200000',
} as unknown as estimatesApi.EstimateDetail;

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/estimates/est-001']}>
      <Routes>
        <Route path="/estimates/:id" element={<EstimateDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

const rowOf = (itemId: string): HTMLElement => screen.getByTestId(`estimate-item-${itemId}`);

/** 指定した項目・行タイプの入力欄 */
const lineInput = (itemId: string, lineType: string, label: string): HTMLElement =>
  within(within(rowOf(itemId)).getByTestId(`line-type-${lineType}`)).getByLabelText(label);

/** 指定した項目・行タイプの金額表示（自動計算） */
const lineAmountText = (itemId: string, lineType: string): string =>
  within(within(rowOf(itemId)).getByTestId(`line-type-${lineType}`))
    .getByTestId('amount-field')
    .textContent?.trim() ?? '';

/** プレビュー行の案分後金額（`1,234円` → `1,234`） */
const previewAllocatedText = (itemId: string): string => {
  const row = screen
    .getAllByTestId('allocation-preview-row')
    .find((element) => element.getAttribute('data-allocation-key') === itemId);
  if (row === undefined) {
    throw new Error(`プレビュー行が見つかりません: ${itemId}`);
  }
  return (within(row).getByTestId('preview-allocated').textContent ?? '').replace('円', '').trim();
};

describe('EstimateDetailPage NET金額案分の統合（実物のコンポーネント）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
    vi.mocked(estimatesApi.getEstimateItems).mockResolvedValue(mockEstimateDetail.items);
    vi.mocked(getReceivedQuotationsByProject).mockResolvedValue([]);
  });

  const waitForItems = async (): Promise<void> => {
    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-a')).toBeInTheDocument();
    });
  };

  /** 業者金額行の単価を未保存のまま書き換える */
  const editVendorUnitPrice = async (itemId: string, value: string): Promise<void> => {
    fireEvent.change(lineInput(itemId, 'VENDOR', '単価'), { target: { value } });
    await waitFor(() => {
      expect(lineAmountText(itemId, 'VENDOR')).toBe(Number(value).toLocaleString('ja-JP'));
    });
  };

  const openNetDialog = async (): Promise<void> => {
    fireEvent.click(screen.getByRole('button', { name: /業者金額を実行金額に転記/ }));
    await waitFor(() => {
      expect(screen.getByText('業者金額を実行金額に転記（NET金額案分）')).toBeInTheDocument();
    });
  };

  /**
   * 55.3 の決定的な検証。
   *
   * 未保存の業者金額（100,000 → 70,000）を含む状態で案分すると、
   * 対象合計は編集中の 70,000 + 100,000 = 170,000 になる。
   * NET 130,000 の案分は 53,529 / 76,471（小数第1位で四捨五入・合計は NET と一致）。
   * 保存済みの 100,000 + 100,000 = 200,000 を用いると 65,000 / 65,000 になるため、
   * 入力元が編集中の明細でなければこの固定値は成立しない。
   */
  /** @requirement estimate-creation/REQ-5.8 */
  it('未保存の業者金額でプレビューと適用結果が一致すること (5.8, 18.7, 49.6)', async () => {
    renderPage();
    await waitForItems();

    await editVendorUnitPrice('item-a', '70000');

    await openNetDialog();

    fireEvent.change(screen.getByLabelText('対象業者を選択'), { target: { value: '業者A' } });
    await waitFor(() => {
      expect(screen.getByTestId('selected-lines-total')).toHaveTextContent('170,000円');
    });

    fireEvent.change(screen.getByLabelText('NET金額'), { target: { value: '130000' } });
    await waitFor(() => {
      expect(screen.getByText('案分プレビュー')).toBeInTheDocument();
    });

    // プレビューは編集中の業者金額（70,000 / 100,000）に基づく
    const previewA = previewAllocatedText('item-a');
    const previewB = previewAllocatedText('item-b');
    expect(previewA).toBe('53,529');
    expect(previewB).toBe('76,471');

    fireEvent.click(screen.getByRole('button', { name: '案分実行' }));

    await waitFor(() => {
      expect(screen.queryByText('案分プレビュー')).not.toBeInTheDocument();
    });

    // 実行金額行にプレビューと同一の金額が入る（5.8）
    await waitFor(() => {
      expect(lineAmountText('item-a', 'EXECUTION')).toBe(previewA);
    });
    expect(lineAmountText('item-b', 'EXECUTION')).toBe(previewB);
    expect(lineAmountText('item-a', 'EXECUTION')).toBe('53,529');
    expect(lineAmountText('item-b', 'EXECUTION')).toBe('76,471');

    // 未保存の業者金額の編集はそのまま残る（49.2）
    expect(lineAmountText('item-a', 'VENDOR')).toBe('70,000');
  });

  /** @requirement estimate-creation/REQ-49.3 */
  it('案分の実行でサーバーへ書き込まず明細も再取得しないこと (49.2, 49.3)', async () => {
    renderPage();
    await waitForItems();

    await editVendorUnitPrice('item-a', '70000');
    await openNetDialog();

    fireEvent.change(screen.getByLabelText('対象業者を選択'), { target: { value: '業者A' } });
    fireEvent.change(screen.getByLabelText('NET金額'), { target: { value: '130000' } });
    await waitFor(() => {
      expect(screen.getByText('案分プレビュー')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '案分実行' }));

    await waitFor(() => {
      expect(lineAmountText('item-a', 'EXECUTION')).toBe('53,529');
    });

    expect(estimatesApi.saveEstimateDraft).not.toHaveBeenCalled();
    // 初回読み込みの1回のみ（案分後の再取得が無い）
    expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
    // 未保存のままなので保存ボタンは有効
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  });

  /** @requirement estimate-creation/REQ-49.8 */
  it('案分の結果を取り消せること (48.8, 49.8)', async () => {
    renderPage();
    await waitForItems();

    await openNetDialog();
    fireEvent.change(screen.getByLabelText('対象業者を選択'), { target: { value: '業者A' } });
    fireEvent.change(screen.getByLabelText('NET金額'), { target: { value: '130000' } });
    await waitFor(() => {
      expect(screen.getByText('案分プレビュー')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '案分実行' }));

    await waitFor(() => {
      expect(lineAmountText('item-a', 'EXECUTION')).toBe('65,000');
    });

    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));

    await waitFor(() => {
      expect(lineAmountText('item-a', 'EXECUTION')).toBe('-');
    });
  });
});
