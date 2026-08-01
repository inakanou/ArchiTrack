/**
 * @fileoverview EstimateDetailPage の階層表示モード切替テスト（実物のコンポーネントで検証）
 *
 * Task 54.4: 表示モードの切替と引き継ぎ
 *
 * `EstimateDetailPage.test.tsx` は `../components/estimate` を丸ごとモックして
 * props の受け渡しを検証する構成のため、「切替UIを押す → 表がドリルダウンとして
 * 描画し直される」という**画面上の実際の振る舞い**は捉えられない
 * （53.14 の死んだ `onDragStart` / `onDrop` が長く気づかれなかったのと同じ死角）。
 * 本ファイルはツールバーと表を**実物のまま**描画し、モード切替の一気通貫を固定する。
 *
 * Requirements (estimate-creation):
 * - 45.1: 明細の階層表示モードとして「ツリー表示」と「ドリルダウン表示」を提供する
 * - 45.2: 階層表示モードのデフォルトを「ツリー表示」とする
 * - 45.10: 階層表示モードを切り替えた場合、未保存の編集内容を保持する
 * - 45.11: 選択した階層表示モードを次回の画面表示時にも引き継ぐ
 *
 * Design: design.md `#### 階層表示モードの状態遷移（45.1〜45.11）`（:3833-3855）
 * 「モード切替・階層移動はいずれも表示状態のみを変更し、編集状態には触れない（45.10）。
 * モードは端末単位で永続化する」
 *
 * @module pages/EstimateDetailPage.viewMode
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateDetailPage from './EstimateDetailPage';
import * as estimatesApi from '../api/estimates';
import { ESTIMATE_VIEW_MODE_STORAGE_KEY } from '../hooks/useEstimateViewModePreference';

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
// テストデータ（親1件 + 子1件。ドリルダウンでは子がルート階層から消える）
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
      children: [
        {
          id: 'item-child',
          estimateId: 'est-001',
          parentId: 'item-parent',
          displayOrder: 0,
          lines: [
            buildLine('line-child-1', 'item-child', 'ESTIMATE', '子項目'),
            buildLine('line-child-2', 'item-child', 'EXECUTION', '子項目'),
            buildLine('line-child-3', 'item-child', 'VENDOR', '子項目'),
          ],
          children: [],
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
      ],
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

/** 明細が描画され終わるまで待つ */
const waitForItems = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.getByTestId('estimate-item-item-parent')).toBeInTheDocument();
  });
};

/** 指定行の見積金額行の名称入力 */
const nameInputOf = (itemId: string): HTMLInputElement =>
  within(
    within(screen.getByTestId(`estimate-item-${itemId}`)).getByTestId('line-type-ESTIMATE')
  ).getByLabelText('名称') as HTMLInputElement;

/** ドリルダウン表示のときだけ現れる階層経路 */
const breadcrumb = () => screen.queryByRole('navigation', { name: '明細の階層経路' });

describe('EstimateDetailPage 階層表示モードの切替（実物のコンポーネント）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
    vi.mocked(estimatesApi.getEstimateItems).mockResolvedValue(mockEstimateDetail.items);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  /** @requirement estimate-creation/REQ-45.2 */
  it('初回表示はツリー表示で、切替UIがツリー表示を選択済みとして示すこと (45.1, 45.2)', async () => {
    renderPage();
    await waitForItems();

    expect(screen.getByRole('radio', { name: 'ツリー表示' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: 'ドリルダウン表示' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    // ツリー表示では全階層が並び、経路表示は出ない（45.3）
    expect(screen.getByTestId('estimate-item-item-child')).toBeInTheDocument();
    expect(breadcrumb()).not.toBeInTheDocument();
  });

  /** @requirement estimate-creation/REQ-45.1 */
  it('ドリルダウン表示を選ぶと表がドリルダウンとして描画し直されること (45.1, 45.6)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    await user.click(screen.getByRole('radio', { name: 'ドリルダウン表示' }));

    // 現在階層（ルート）の項目だけになり、経路表示が現れる
    await waitFor(() => {
      expect(breadcrumb()).toBeInTheDocument();
    });
    expect(screen.getByTestId('estimate-item-item-parent')).toBeInTheDocument();
    expect(screen.queryByTestId('estimate-item-item-child')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ドリルダウン表示' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  /** @requirement estimate-creation/REQ-45.1 */
  it('ツリー表示へ戻すと全階層の一覧へ描画し直されること (45.1, 45.3)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    await user.click(screen.getByRole('radio', { name: 'ドリルダウン表示' }));
    await waitFor(() => {
      expect(breadcrumb()).toBeInTheDocument();
    });

    await user.click(screen.getByRole('radio', { name: 'ツリー表示' }));

    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-child')).toBeInTheDocument();
    });
    expect(breadcrumb()).not.toBeInTheDocument();
  });

  /**
   * design.md の状態遷移図はドリルダウン表示の入口を `[*] --> ルート階層` と定義する。
   *
   * @requirement estimate-creation/REQ-45.1
   */
  it('モード切替でドリルダウン表示へ入るとルート階層から始まること (45.1)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    await user.click(screen.getByRole('radio', { name: 'ドリルダウン表示' }));
    await waitFor(() => {
      expect(breadcrumb()).toBeInTheDocument();
    });

    // 親項目の子階層まで潜る（45.8）
    await user.click(screen.getByRole('button', { name: '親項目 の子階層を表示' }));
    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-child')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('estimate-item-item-parent')).not.toBeInTheDocument();

    // ツリー表示へ戻し、再びドリルダウン表示にするとルート階層から始まる
    await user.click(screen.getByRole('radio', { name: 'ツリー表示' }));
    await user.click(screen.getByRole('radio', { name: 'ドリルダウン表示' }));

    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-parent')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('estimate-item-item-child')).not.toBeInTheDocument();
  });

  /** @requirement estimate-creation/REQ-45.10 */
  it('モードを切り替えても未保存の編集内容が保持されること (45.10)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    // 保存していない編集を行う
    fireEvent.change(nameInputOf('item-parent'), { target: { value: '切替をまたぐ編集' } });
    expect(nameInputOf('item-parent').value).toBe('切替をまたぐ編集');
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();

    await user.click(screen.getByRole('radio', { name: 'ドリルダウン表示' }));
    await waitFor(() => {
      expect(breadcrumb()).toBeInTheDocument();
    });

    // ドリルダウン表示でも編集内容がそのまま残る
    expect(nameInputOf('item-parent').value).toBe('切替をまたぐ編集');
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();

    await user.click(screen.getByRole('radio', { name: 'ツリー表示' }));
    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-child')).toBeInTheDocument();
    });

    // ツリー表示へ戻しても編集内容は失われない（子項目の内容も無傷）
    expect(nameInputOf('item-parent').value).toBe('切替をまたぐ編集');
    expect(nameInputOf('item-child').value).toBe('子項目');
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  });

  /** @requirement estimate-creation/REQ-45.11 */
  it('選択したモードを次回の画面表示時に引き継ぐこと (45.11)', async () => {
    const user = userEvent.setup();
    const first = renderPage();
    await waitForItems();

    await user.click(screen.getByRole('radio', { name: 'ドリルダウン表示' }));
    await waitFor(() => {
      expect(breadcrumb()).toBeInTheDocument();
    });
    expect(window.localStorage.getItem(ESTIMATE_VIEW_MODE_STORAGE_KEY)).toBe('drilldown');

    first.unmount();

    // 次回の画面表示（再マウント）でドリルダウン表示のまま開く
    renderPage();
    await waitForItems();

    expect(breadcrumb()).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ドリルダウン表示' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.queryByTestId('estimate-item-item-child')).not.toBeInTheDocument();
  });

  /** @requirement estimate-creation/REQ-45.11 */
  it('ツリー表示へ戻した選択も次回の画面表示時に引き継ぐこと (45.11)', async () => {
    const user = userEvent.setup();
    const first = renderPage();
    await waitForItems();

    await user.click(screen.getByRole('radio', { name: 'ドリルダウン表示' }));
    await waitFor(() => {
      expect(breadcrumb()).toBeInTheDocument();
    });
    await user.click(screen.getByRole('radio', { name: 'ツリー表示' }));
    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-child')).toBeInTheDocument();
    });
    expect(window.localStorage.getItem(ESTIMATE_VIEW_MODE_STORAGE_KEY)).toBe('tree');

    first.unmount();
    renderPage();
    await waitForItems();

    expect(breadcrumb()).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ツリー表示' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  /** @requirement estimate-creation/REQ-45.2 */
  it('保存値が壊れていても既定のツリー表示で開くこと (45.2)', async () => {
    window.localStorage.setItem(ESTIMATE_VIEW_MODE_STORAGE_KEY, '{"mode":"drill');

    renderPage();
    await waitForItems();

    expect(breadcrumb()).not.toBeInTheDocument();
    expect(screen.getByTestId('estimate-item-item-child')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ツリー表示' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });
});
