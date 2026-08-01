/**
 * @fileoverview EstimateDetailPage のツールバー統合テスト（実物のコンポーネントで検証）
 *
 * Task 54.10: ツールバーへの範囲選択・モード切替・取り消しの統合
 *
 * `EstimateDetailPage.test.tsx` は `../components/estimate` を丸ごとモックするため、
 * 「行を選ぶ → ツールバーが変わる → 明細が変わる」という一気通貫を捉えられない
 * （53.16 の死んだ props と同じ死角）。本ファイルはツールバー・階層パネル・明細テーブルを
 * **実物のまま**描画し、選択の所有者が表示状態フックへ一本化されていることを固定する。
 *
 * Requirements (estimate-creation):
 * - 23.3: 見積項目を選択した場合、選択項目に対する操作ボタンを有効化する
 * - 23.7: 見積項目をクリックした場合、選択状態にし視覚的にハイライト表示する
 * - 23.8: 未選択の場合、選択が必要な操作ボタンを無効化状態で表示する
 * - 23.9: 「上の階層へ移動」ボタンで選択中の項目を現在の親の兄弟レベルに移動する
 * - 23.10: 「下の階層へ移動」ボタンで Requirement 44 のネスト化ルールに従って階層を1段下げる
 * - 23.11: ツールバーの各操作に対応するキーボード操作を提供する
 * - 44.3: 削除・複写・階層の上げ下げを選択範囲全体に適用する
 * - 44.4: 階層下げは選択範囲の先頭行を親とし、残りをその子として配置する
 * - 44.6: ルートレベルで階層上げが実行された場合、実行せずそれ以上上げられないことを示す
 * - 44.8: 複数行が選択されている場合、選択中の行数を画面上に表示する
 *
 * @module pages/EstimateDetailPage.toolbar
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateDetailPage from './EstimateDetailPage';
import * as estimatesApi from '../api/estimates';

vi.mock('../api/estimates');

// jsdom は MemoryRouter で描画するためデータルーター前提の `useBlocker` が動かない。
// `EstimateDetailPage.keyboard.test.tsx` と同じ確立済みパターンでモックする（27.6）。
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
//
// 54.9 の教訓（浅いフィクスチャは親・祖父・ルートの取り違えを原理的に検出できない）に
// 従い、3階層のツリーを用いる。表示順: item-a > item-a1 > item-a1x, item-b, item-c
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

const buildItem = (
  id: string,
  name: string,
  parentId: string | null,
  displayOrder: number,
  children: unknown[] = []
) => ({
  id,
  estimateId: 'est-001',
  parentId,
  displayOrder,
  lines: [
    buildLine(`${id}-l1`, id, 'ESTIMATE', name),
    buildLine(`${id}-l2`, id, 'EXECUTION', name),
    buildLine(`${id}-l3`, id, 'VENDOR', name),
  ],
  children,
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
    buildItem('item-a', '項目A', null, 0, [
      buildItem('item-a1', '項目A1', 'item-a', 0, [buildItem('item-a1x', '項目A1X', 'item-a1', 0)]),
    ]),
    buildItem('item-b', '項目B', null, 1),
    buildItem('item-c', '項目C', null, 2),
  ],
  totalAmount: '500000',
} as unknown as estimatesApi.EstimateDetail;

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/estimates/est-001']}>
      <Routes>
        <Route path="/estimates/:id" element={<EstimateDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

// ============================================================================
// ヘルパー
// ============================================================================

const waitForItems = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.getByTestId('estimate-item-item-a')).toBeInTheDocument();
  });
};

const rowOf = (itemId: string): HTMLElement => screen.getByTestId(`estimate-item-${itemId}`);

const rowKeys = (): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-estimate-row-key]')).map(
    (row) => row.dataset.estimateRowKey ?? ''
  );

/** 階層構造パネル上の項目の階層の深さ（1 始まり） */
const panelLevelOf = (itemId: string): string | null =>
  screen.getByTestId(`hierarchy-node-${itemId}`).getAttribute('aria-level');

const toolbar = (): HTMLElement => screen.getByTestId('estimate-item-toolbar');

const toolbarButton = (name: string | RegExp): HTMLElement =>
  within(toolbar()).getByRole('button', { name });

const isRowSelected = (itemId: string): string | undefined => rowOf(itemId).dataset.selected;

/** 行を選び、そのまま行へフォーカスを置く（続くキー操作の起点） */
const selectRow = (itemId: string): void => {
  fireEvent.click(rowOf(itemId));
  rowOf(itemId).focus();
};

describe('EstimateDetailPage ツールバー統合（実物のコンポーネント）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
    vi.mocked(estimatesApi.getEstimateItems).mockResolvedValue(mockEstimateDetail.items);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // ==========================================================================
  // 選択とツールバーの有効/無効（23.3, 23.7, 23.8）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-23.8 */
  it('未選択では選択が必要な操作ボタンが無効であること (23.8)', async () => {
    renderPage();
    await waitForItems();

    expect(toolbarButton(/子項目追加/)).toBeDisabled();
    expect(toolbarButton(/複製/)).toBeDisabled();
    expect(toolbarButton(/削除/)).toBeDisabled();
  });

  /** @requirement estimate-creation/REQ-23.7 */
  it('見積項目をクリックすると選択状態になりハイライトされること (23.7)', async () => {
    renderPage();
    await waitForItems();
    expect(isRowSelected('item-b')).toBe('false');

    fireEvent.click(rowOf('item-b'));

    await waitFor(() => {
      expect(isRowSelected('item-b')).toBe('true');
    });
    expect(isRowSelected('item-c')).toBe('false');
  });

  /** @requirement estimate-creation/REQ-23.3 */
  it('見積項目を選択すると操作ボタンが有効化されること (23.3)', async () => {
    renderPage();
    await waitForItems();

    fireEvent.click(rowOf('item-a1'));

    await waitFor(() => {
      expect(toolbarButton(/子項目追加/)).toBeEnabled();
    });
    expect(toolbarButton(/複製/)).toBeEnabled();
    expect(toolbarButton(/削除/)).toBeEnabled();
    // item-a1 は item-a の子なので「上の階層へ」も有効（23.9）
    expect(toolbarButton('上の階層へ')).toBeEnabled();
  });

  // ==========================================================================
  // 選択中の行数の表示（44.8）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-44.8 */
  it('範囲選択すると選択中の行数が画面上に表示されること (44.8)', async () => {
    renderPage();
    await waitForItems();

    selectRow('item-b');
    expect(screen.queryByTestId('selected-row-count')).not.toBeInTheDocument();

    fireEvent.keyDown(rowOf('item-b'), { key: 'ArrowDown', shiftKey: true });

    await waitFor(() => {
      expect(screen.getByTestId('selected-row-count')).toHaveTextContent('2行を選択中');
    });
    // 行のハイライトと行数表示が同じ選択状態から出ていること（所有者の一本化）
    expect(isRowSelected('item-b')).toBe('true');
    expect(isRowSelected('item-c')).toBe('true');
  });

  /** @requirement estimate-creation/REQ-44.8 */
  it('選択解除で行数表示とボタンの有効化が同時に戻ること (44.2, 44.8)', async () => {
    renderPage();
    await waitForItems();

    selectRow('item-b');
    fireEvent.keyDown(rowOf('item-b'), { key: 'ArrowDown', shiftKey: true });
    await waitFor(() => {
      expect(screen.getByTestId('selected-row-count')).toBeInTheDocument();
    });

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('selected-row-count')).not.toBeInTheDocument();
    });
    expect(toolbarButton(/削除/)).toBeDisabled();
    expect(isRowSelected('item-b')).toBe('false');
  });

  // ==========================================================================
  // 階層下げのネスト化ルール（23.10, 44.3, 44.4）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-44.4 */
  it('範囲選択して「下の階層へ」を押すと先頭行が親になり残りが子になること (23.10, 44.4)', async () => {
    renderPage();
    await waitForItems();
    expect(panelLevelOf('item-b')).toBe('1');
    expect(panelLevelOf('item-c')).toBe('1');

    selectRow('item-b');
    fireEvent.keyDown(rowOf('item-b'), { key: 'ArrowDown', shiftKey: true });
    await waitFor(() => {
      expect(screen.getByTestId('selected-row-count')).toHaveTextContent('2行を選択中');
    });

    fireEvent.click(toolbarButton('下の階層へ'));

    await waitFor(() => {
      expect(panelLevelOf('item-c')).toBe('2');
    });
    // 単一行の規則（直前の兄弟の子へ移す）なら item-b が item-a の子になる。
    // 範囲の規則（44.4）では先頭行の item-b はルートに残る。
    expect(panelLevelOf('item-b')).toBe('1');
  });

  /** @requirement estimate-creation/REQ-44.3 */
  it('範囲選択して「削除」を押すと選択範囲全体が消えること (44.3)', async () => {
    renderPage();
    await waitForItems();
    expect(rowKeys()).toEqual(['item-a', 'item-a1', 'item-a1x', 'item-b', 'item-c']);

    selectRow('item-b');
    fireEvent.keyDown(rowOf('item-b'), { key: 'ArrowDown', shiftKey: true });
    await waitFor(() => {
      expect(screen.getByTestId('selected-row-count')).toHaveTextContent('2行を選択中');
    });

    fireEvent.click(toolbarButton(/削除/));

    await waitFor(() => {
      expect(rowKeys()).toEqual(['item-a', 'item-a1', 'item-a1x']);
    });
  });

  // ==========================================================================
  // それ以上上げられないことの提示（44.6）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-44.6 */
  it('ルートレベルで階層上げを行うと実行されず理由が示されること (44.6)', async () => {
    renderPage();
    await waitForItems();

    selectRow('item-b');
    fireEvent.keyDown(rowOf('item-b'), { key: 'ArrowLeft', altKey: true, shiftKey: true });

    await waitFor(() => {
      expect(screen.getByTestId('estimate-edit-error')).toBeInTheDocument();
    });
    // 44.6 は「それ以上上げられないこと**を示す**」ため、単に何か出ているだけでは足りず
    // 理由が読み取れる必要がある（`lastError` の4種を取り違えても気づけるようにする）
    expect(screen.getByTestId('estimate-edit-error')).toHaveTextContent(
      'すでに最上位の階層のため、これ以上上げられません。'
    );
    // 操作は実行されない（44.6）
    expect(rowKeys()).toEqual(['item-a', 'item-a1', 'item-a1x', 'item-b', 'item-c']);
    expect(panelLevelOf('item-b')).toBe('1');
  });

  /** @requirement estimate-creation/REQ-44.6 */
  it('操作エラーの提示を閉じられること (44.6)', async () => {
    renderPage();
    await waitForItems();

    selectRow('item-b');
    fireEvent.keyDown(rowOf('item-b'), { key: 'ArrowLeft', altKey: true, shiftKey: true });
    await waitFor(() => {
      expect(screen.getByTestId('estimate-edit-error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '操作エラーを閉じる' }));

    await waitFor(() => {
      expect(screen.queryByTestId('estimate-edit-error')).not.toBeInTheDocument();
    });
  });

  /** @requirement estimate-creation/REQ-23.9 */
  it('ルートレベルの項目では「上の階層へ」ボタンが無効であること (23.9)', async () => {
    renderPage();
    await waitForItems();

    fireEvent.click(rowOf('item-b'));

    await waitFor(() => {
      expect(toolbarButton(/削除/)).toBeEnabled();
    });
    expect(toolbarButton('上の階層へ')).toBeDisabled();
  });

  // ==========================================================================
  // ツールバー操作とキー操作の対応（23.11）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-23.11 */
  it('「項目追加」に対応するキー操作でルート末尾に項目が増えること (23.11, 23.2)', async () => {
    renderPage();
    await waitForItems();

    selectRow('item-b');
    fireEvent.keyDown(rowOf('item-b'), { key: 'a', code: 'KeyA', altKey: true });

    await waitFor(() => {
      expect(rowKeys().length).toBe(6);
    });
    expect(rowKeys().slice(0, 5)).toEqual(['item-a', 'item-a1', 'item-a1x', 'item-b', 'item-c']);
  });

  /** @requirement estimate-creation/REQ-23.11 */
  it('「子項目追加」に対応するキー操作で選択項目の子が増えること (23.11, 23.4)', async () => {
    renderPage();
    await waitForItems();

    selectRow('item-b');
    fireEvent.keyDown(rowOf('item-b'), { key: 'a', code: 'KeyA', altKey: true, shiftKey: true });

    await waitFor(() => {
      expect(rowKeys().length).toBe(6);
    });
    // item-b の直後（＝その子）へ入る
    expect(rowKeys()[4]).not.toBe('item-c');
    expect(rowKeys()[5]).toBe('item-c');
  });

  /** @requirement estimate-creation/REQ-23.11 */
  it('「↑上へ」に対応するキー操作で同一階層の並び順が入れ替わること (23.11, 12.2)', async () => {
    renderPage();
    await waitForItems();

    selectRow('item-c');
    fireEvent.keyDown(rowOf('item-c'), { key: 'ArrowUp', altKey: true, shiftKey: true });

    await waitFor(() => {
      expect(rowKeys()).toEqual(['item-a', 'item-a1', 'item-a1x', 'item-c', 'item-b']);
    });
  });

  /** @requirement estimate-creation/REQ-23.11 */
  it('「↓下へ」に対応するキー操作で同一階層の並び順が入れ替わること (23.11, 12.2)', async () => {
    renderPage();
    await waitForItems();

    selectRow('item-b');
    fireEvent.keyDown(rowOf('item-b'), { key: 'ArrowDown', altKey: true, shiftKey: true });

    await waitFor(() => {
      expect(rowKeys()).toEqual(['item-a', 'item-a1', 'item-a1x', 'item-c', 'item-b']);
    });
  });

  /** @requirement estimate-creation/REQ-23.11 */
  it('「注記行追加」に対応するキー操作で注記行が増えること (23.11, 55.1)', async () => {
    renderPage();
    await waitForItems();

    selectRow('item-b');
    fireEvent.keyDown(rowOf('item-b'), { key: 'n', code: 'KeyN', altKey: true, shiftKey: true });

    await waitFor(() => {
      expect(rowKeys().length).toBe(6);
    });
  });

  /** @requirement estimate-creation/REQ-23.11 */
  it('「値引き行追加」に対応するキー操作で値引き行が増えること (23.11, 41.1)', async () => {
    renderPage();
    await waitForItems();

    selectRow('item-b');
    fireEvent.keyDown(rowOf('item-b'), { key: 'd', code: 'KeyD', altKey: true, shiftKey: true });

    await waitFor(() => {
      expect(rowKeys().length).toBe(6);
    });
  });

  /**
   * ボタンとキーの対応は「同じ結果になる」ことで確かめる。
   *
   * @requirement estimate-creation/REQ-23.11
   */
  it('「下の階層へ」ボタンとキー操作が同じ結果になること (23.11)', async () => {
    renderPage();
    await waitForItems();

    selectRow('item-c');
    fireEvent.keyDown(rowOf('item-c'), { key: 'ArrowRight', altKey: true, shiftKey: true });

    await waitFor(() => {
      expect(panelLevelOf('item-c')).toBe('2');
    });

    // 取り消してボタンから同じ操作を行う
    fireEvent.click(within(toolbar()).getByTestId('undo-button'));
    await waitFor(() => {
      expect(panelLevelOf('item-c')).toBe('1');
    });

    fireEvent.click(rowOf('item-c'));
    await waitFor(() => {
      expect(toolbarButton('下の階層へ')).toBeEnabled();
    });
    fireEvent.click(toolbarButton('下の階層へ'));

    await waitFor(() => {
      expect(panelLevelOf('item-c')).toBe('2');
    });
  });
});
