/**
 * @fileoverview EstimateDetailPage のキー割当一覧の結線テスト（実物のコンポーネントで検証）
 *
 * Task 54.7: キー割当一覧の表示
 *
 * `EstimateDetailPage.test.tsx` は `../components/estimate` を丸ごとモックするため、
 * 「見積書画面からキー割当一覧を開ける」という**画面上の実際の振る舞い**は捉えられない
 * （53.14 の死んだ `onDragStart` / `onDrop` が長く気づかれなかったのと同じ死角）。
 * 本ファイルはツールバーと一覧を**実物のまま**描画し、画面からの参照可能性（47.3）を
 * 一気通貫で固定する。
 *
 * Requirements (estimate-creation):
 * - 47.3: キーボード操作の割り当て一覧を画面上で参照可能とする
 *
 * Design: design.md `EstimateKeymapHelp.tsx  # 新規: キー割当一覧`（:3727）、
 * mapping table「47.1〜47.8 | キーボード操作・入力中の抑止 | estimateKeymap,
 * EstimateKeymapHelp, isTextInputElement(参照) | `KeymapEntry[]`」（:3911）
 *
 * @module pages/EstimateDetailPage.keymapHelp
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateDetailPage from './EstimateDetailPage';
import * as estimatesApi from '../api/estimates';
import { ESTIMATE_KEYMAP } from '../domain/estimate/estimateKeymap';

vi.mock('../api/estimates');

// jsdom は MemoryRouter で描画するためデータルーター前提の `useBlocker` が動かない。
// `EstimateDetailPage.test.tsx` と同じ確立済みパターンでモックする（27.6）。
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
  id: string,
  itemId: string,
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR',
  name: string
) => ({
  id,
  estimateItemId: itemId,
  lineType,
  name,
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

const mockEstimateDetail = {
  id: 'est-001',
  projectId: 'proj-001',
  name: 'テスト見積書',
  sourceItemizedStatementId: 'is-001',
  sourceItemizedStatementName: '内訳書A',
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
  items: [
    {
      id: 'item-parent',
      estimateId: 'est-001',
      parentId: null,
      displayOrder: 0,
      lines: [
        buildLine('line-parent-1', 'item-parent', 'ESTIMATE', '親項目'),
        buildLine('line-parent-2', 'item-parent', 'EXECUTION', '親項目'),
        buildLine('line-parent-3', 'item-parent', 'VENDOR', '親項目'),
      ],
      children: [],
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    },
  ],
  totalAmount: '100000',
} as unknown as estimatesApi.EstimateDetail;

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/estimates/est-001']}>
      <Routes>
        <Route path="/estimates/:id" element={<EstimateDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

const waitForItems = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.getByTestId('estimate-item-item-parent')).toBeInTheDocument();
  });
};

const dataRowsOf = (dialog: HTMLElement): HTMLElement[] =>
  within(dialog)
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('cell').length > 0);

describe('EstimateDetailPage キー割当一覧の参照 (47.3)（実物のコンポーネント）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
    vi.mocked(estimatesApi.getEstimateItems).mockResolvedValue(mockEstimateDetail.items);
  });

  /** @requirement estimate-creation/REQ-47.3 */
  it('見積書画面からキー割当一覧を開き、定義のすべての割当を確認できること', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    // 開く前は一覧が出ておらず、入口だけが画面にある
    expect(
      screen.queryByRole('dialog', { name: 'キーボード操作の割り当て一覧' })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'キーボード操作の一覧' }));

    const dialog = screen.getByRole('dialog', { name: 'キーボード操作の割り当て一覧' });
    expect(dataRowsOf(dialog)).toHaveLength(ESTIMATE_KEYMAP.entries.length);
    expect(dialog).toHaveTextContent('Alt+Insert');
    expect(dialog).toHaveTextContent('Alt+Shift+PageDown');
  });

  /**
   * 明細領域のキー操作（`useEstimateKeyboard`）は `Esc` を横取りして
   * `preventDefault` する。一覧は明細領域の外に置き、一覧を開いている間の `Esc` が
   * 一覧を閉じる操作として働くことを固定する。
   *
   * @requirement estimate-creation/REQ-47.3
   */
  it('一覧を開いた状態の Esc が一覧を閉じる操作として働くこと', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    await user.click(screen.getByRole('button', { name: 'キーボード操作の一覧' }));
    expect(
      screen.getByRole('dialog', { name: 'キーボード操作の割り当て一覧' })
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'キーボード操作の割り当て一覧' })
      ).not.toBeInTheDocument();
    });
    // 明細はそのまま残る（一覧の開閉は明細の表示・編集に触れない）
    expect(screen.getByTestId('estimate-item-item-parent')).toBeInTheDocument();
  });
});
