/**
 * @fileoverview EstimateDetailPage の利益率適用の統合テスト（実物のコンポーネントで検証）
 *
 * Task 55.4: 利益率ダイアログの入力元を編集中の明細へ変更
 *
 * `EstimateDetailPage.test.tsx` は `../components/estimate` を丸ごとモックするため、
 * 「実行金額を未保存で編集する → ダイアログのプレビュー → 適用結果」の一気通貫を
 * 捉えられない（53.16 / 54.10 で繰り返し死角になった死んだ props と同じ問題）。
 * 本ファイルは明細テーブルと利益率ダイアログを**実物のまま**描画し、
 * プレビューに出た単価と実際に見積金額行へ入る単価が一致することを固定する。
 *
 * Requirements (estimate-creation):
 * - 6.2: 「すべて上書き」は名称・規格・単位・数量・単価を見積金額行に上書きする
 * - 6.5: 反映時に金額を自動計算して表示する
 * - 6.8: プレビューに表示した新しい単価と実際に反映される単価を一致させる
 * - 19.5, 19.6: プレビュー表示と適用ボタン
 * - 19.8: 編集中の実行金額行（未保存の追加・編集を含む）を適用対象の一覧に表示する
 * - 49.1, 49.2, 49.3: 未保存の変更として反映し、再取得も書き込みも行わない
 * - 49.6, 49.7: 計算対象を編集中の明細の値とする
 * - 49.8: 反映結果を取り消せる
 *
 * @module pages/EstimateDetailPage.profitRate
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
  name: string | null,
  unitPrice: string | null
) => ({
  id: `${itemId}-${lineType}`,
  estimateItemId: itemId,
  lineType,
  name,
  specification: lineType === 'EXECUTION' ? '仕様A' : null,
  unit: '式',
  quantity: '1',
  unitPrice,
  amount: unitPrice,
  remarks: null,
  sourceReceivedQuotationLineItemId: null,
  sourceVendorName: null,
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
});

const buildItem = (
  id: string,
  name: string,
  executionUnitPrice: string,
  estimateUnitPrice: string | null,
  displayOrder: number
) => ({
  id,
  estimateId: 'est-001',
  parentId: null,
  displayOrder,
  lines: [
    buildLine(id, 'ESTIMATE', estimateUnitPrice === null ? null : `旧${name}`, estimateUnitPrice),
    buildLine(id, 'EXECUTION', name, executionUnitPrice),
    buildLine(id, 'VENDOR', name, null),
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
  items: [
    buildItem('item-a', '実行A', '90000', null, 0),
    buildItem('item-b', '実行B', '90000', '50000', 1),
  ],
  totalAmount: '50000',
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

const lineInput = (itemId: string, lineType: string, label: string): HTMLElement =>
  within(within(rowOf(itemId)).getByTestId(`line-type-${lineType}`)).getByLabelText(label);

const lineAmountText = (itemId: string, lineType: string): string =>
  within(within(rowOf(itemId)).getByTestId(`line-type-${lineType}`))
    .getByTestId('amount-field')
    .textContent?.trim() ?? '';

/** プレビュー行の新しい単価（`1,234円` → `1,234`） */
const previewNewUnitPrice = (itemId: string): string => {
  const row = screen
    .getAllByTestId('profit-preview-row')
    .find((element) => element.getAttribute('data-profit-key') === itemId);
  if (row === undefined) {
    throw new Error(`プレビュー行が見つかりません: ${itemId}`);
  }
  return (within(row).getByTestId('preview-new-unit-price').textContent ?? '')
    .replace('円', '')
    .trim();
};

describe('EstimateDetailPage 利益率適用の統合（実物のコンポーネント）', () => {
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

  const editExecutionUnitPrice = async (itemId: string, value: string): Promise<void> => {
    fireEvent.change(lineInput(itemId, 'EXECUTION', '単価'), { target: { value } });
    await waitFor(() => {
      expect(lineAmountText(itemId, 'EXECUTION')).toBe(Number(value).toLocaleString('ja-JP'));
    });
  };

  const openProfitDialog = async (): Promise<void> => {
    fireEvent.click(screen.getByRole('button', { name: /実行金額を見積金額に転記/ }));
    await waitFor(() => {
      expect(screen.getByText('実行金額を見積金額に転記（利益率適用）')).toBeInTheDocument();
    });
  };

  /**
   * 55.4 の決定的な検証。
   *
   * 未保存の実行単価（90,000 → 75,000）で利益率 12.27% を適用すると
   * 75,000 × 1.1227 = 84,202.5 → 84,203（小数第1位で四捨五入）。
   * 保存済みの 90,000 を用いると 101,043 になるため、入力元が編集中の明細で
   * なければこの固定値は成立しない。
   */
  /** @requirement estimate-creation/REQ-6.8 */
  it('未保存の実行金額でプレビューと適用結果が一致すること (6.8, 19.5, 49.6)', async () => {
    renderPage();
    await waitForItems();

    await editExecutionUnitPrice('item-a', '75000');

    await openProfitDialog();

    // プレビューは編集中の実行金額（75,000）に基づく
    const previewA = previewNewUnitPrice('item-a');
    expect(previewA).toBe('84,203');
    expect(previewNewUnitPrice('item-b')).toBe('101,043');

    fireEvent.click(screen.getByRole('button', { name: '適用' }));

    await waitFor(() => {
      expect(screen.queryByText('適用プレビュー')).not.toBeInTheDocument();
    });

    // 見積金額行にプレビューと同一の単価が入る（6.8）
    await waitFor(() => {
      expect(lineInput('item-a', 'ESTIMATE', '単価')).toHaveValue('84203');
    });
    expect(lineAmountText('item-a', 'ESTIMATE')).toBe(previewA);
    expect(lineInput('item-b', 'ESTIMATE', '単価')).toHaveValue('101043');

    // 「すべて上書き」は名称も複写する（6.2）
    expect(lineInput('item-a', 'ESTIMATE', '名称')).toHaveValue('実行A');

    // 未保存の実行金額の編集はそのまま残る（49.2）
    expect(lineInput('item-a', 'EXECUTION', '単価')).toHaveValue('75000');
  });

  /**
   * 53.9 の未保存ガードは、利益率適用がサーバーへ書き込む段階1の暫定措置だった。
   * 55.4 でクライアント計算へ移ったため、ガードがあると「未保存の実行金額で適用する」
   * という要件（6.8, 19.8, 49.6）を実行する経路自体が存在しなくなる。
   */
  /** @requirement estimate-creation/REQ-19.8 */
  it('未保存の編集があっても利益率ダイアログが開くこと (19.8, 49.6)', async () => {
    renderPage();
    await waitForItems();

    await editExecutionUnitPrice('item-a', '75000');

    await openProfitDialog();

    expect(screen.queryByTestId('estimate-transfer-guard')).not.toBeInTheDocument();
  });

  /** @requirement estimate-creation/REQ-49.3 */
  it('利益率の適用でサーバーへ書き込まず明細も再取得しないこと (49.2, 49.3)', async () => {
    renderPage();
    await waitForItems();

    await editExecutionUnitPrice('item-a', '75000');
    await openProfitDialog();
    fireEvent.click(screen.getByRole('button', { name: '適用' }));

    await waitFor(() => {
      expect(lineInput('item-a', 'ESTIMATE', '単価')).toHaveValue('84203');
    });

    expect(estimatesApi.saveEstimateDraft).not.toHaveBeenCalled();
    // 初回読み込みの1回のみ（適用後の再取得が無い）
    expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
    // 未保存のままなので保存ボタンは有効
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  });

  /** @requirement estimate-creation/REQ-49.8 */
  it('利益率の適用結果を取り消せること (48.8, 49.8)', async () => {
    renderPage();
    await waitForItems();

    await openProfitDialog();
    fireEvent.click(screen.getByRole('button', { name: '適用' }));

    await waitFor(() => {
      expect(lineInput('item-a', 'ESTIMATE', '単価')).toHaveValue('101043');
    });

    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));

    await waitFor(() => {
      expect(lineInput('item-a', 'ESTIMATE', '単価')).toHaveValue('');
    });
  });
});
