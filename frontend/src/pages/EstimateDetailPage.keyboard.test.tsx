/**
 * @fileoverview EstimateDetailPage のキーボード操作テスト（実物のコンポーネントで検証）
 *
 * Task 54.6: キー割当の定義と解決
 *
 * `EstimateDetailPage.test.tsx` は `../components/estimate` を丸ごとモックするため、
 * 「キーを押す → 明細が変わる」という一気通貫は捉えられない（53.16 の死んだ props と
 * 同じ死角）。本ファイルはツールバー・階層パネル・明細テーブルを**実物のまま**描画し、
 * キー操作だけで行操作と階層移動が完結することを固定する。
 *
 * Requirements (estimate-creation):
 * - 47.1: キーボード操作のみで行の挿入・削除・複写・範囲選択・階層の上げ下げ・階層間の移動を実行可能とする
 * - 47.2: 明細のセル間をキーボードで移動可能とする
 * - 47.4: ブラウザの標準操作と衝突しないキー割り当てを用いる
 * - 47.5: セルの文字入力中は文字編集を優先し、行操作を実行しない
 * - 47.6: 範囲選択中に範囲固有のキーボード操作（範囲に対する階層の上げ下げ）を有効にする
 * - 47.7: 範囲選択解除の操作で範囲選択を解除する
 * - 47.8: キーボード操作による行操作はサーバーへの保存を伴わずに画面上の明細を更新する
 *
 * Design: design.md `##### estimateKeymap`（:4086-4120）
 *
 * @module pages/EstimateDetailPage.keyboard
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateDetailPage from './EstimateDetailPage';
import * as estimatesApi from '../api/estimates';

vi.mock('../api/estimates');

// jsdom は MemoryRouter で描画するためデータルーター前提の `useBlocker` が動かない。
// `EstimateDetailPage.viewMode.test.tsx` と同じ確立済みパターンでモックする（27.6）。
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
// テストデータ（表示順: item-a > item-a1, item-b, item-c）
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
    buildItem('item-a', '項目A', null, 0, [buildItem('item-a1', '項目A1', 'item-a', 0)]),
    buildItem('item-b', '項目B', null, 1),
    buildItem('item-c', '項目C', null, 2),
  ],
  totalAmount: '300000',
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

/** 指定行の見積金額行の名称入力（＝先頭セル） */
const nameInputOf = (itemId: string): HTMLInputElement =>
  within(within(rowOf(itemId)).getByTestId('line-type-ESTIMATE')).getByLabelText(
    '名称'
  ) as HTMLInputElement;

/** いま焦点のある要素（キー操作は常にここへ届く） */
const focused = (): HTMLElement => document.activeElement as HTMLElement;

/** ドリルダウン表示のときだけ現れる階層経路 */
const breadcrumb = () => screen.queryByRole('navigation', { name: '明細の階層経路' });

/** 階層パネル上の項目の階層の深さ（1 始まり） */
const panelLevelOf = (itemId: string): string | null =>
  screen.getByTestId(`hierarchy-node-${itemId}`).getAttribute('aria-level');

const isRowSelected = (itemId: string): string | undefined => rowOf(itemId).dataset.selected;

/** セル編集を抜けて行選択の文脈へ移る（Esc） */
const escapeToRow = (itemId: string): void => {
  const input = nameInputOf(itemId);
  input.focus();
  fireEvent.keyDown(input, { key: 'Escape' });
};

/**
 * 参照系以外の API が一度も呼ばれていないこと（47.8）
 *
 * 「保存関数だけを見る」と別経路の書き込みを見逃すため、`get` 以外の
 * すべての呼び出しを列挙して空であることを確かめる。
 */
const writeApiCalls = (): string[] => {
  const calls: string[] = [];
  for (const [name, exported] of Object.entries(estimatesApi)) {
    if (typeof exported !== 'function' || !vi.isMockFunction(exported)) {
      continue;
    }
    if (name.startsWith('get')) {
      continue;
    }
    for (let i = 0; i < exported.mock.calls.length; i += 1) {
      calls.push(name);
    }
  }
  return calls;
};

describe('EstimateDetailPage キーボード操作（実物のコンポーネント）', () => {
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
  // 文字入力の優先（47.5）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-47.5 */
  it('セルの文字入力中は行挿入のキーで明細が増えないこと (47.5)', async () => {
    renderPage();
    await waitForItems();
    expect(rowKeys()).toEqual(['item-a', 'item-a1', 'item-b', 'item-c']);

    const input = nameInputOf('item-a');
    input.focus();
    fireEvent.keyDown(input, { key: 'Insert', altKey: true });
    fireEvent.keyDown(input, { key: 'Delete', altKey: true });
    fireEvent.keyDown(input, { key: 'c', code: 'KeyC', altKey: true });

    expect(rowKeys()).toEqual(['item-a', 'item-a1', 'item-b', 'item-c']);
  });

  /** @requirement estimate-creation/REQ-47.5 */
  it('セル編集を抜ければ同じキーで行が挿入されること (47.1, 47.5)', async () => {
    renderPage();
    await waitForItems();

    escapeToRow('item-a');
    expect(focused()).toBe(rowOf('item-a'));

    fireEvent.keyDown(focused(), { key: 'Insert', altKey: true });

    await waitFor(() => {
      expect(rowKeys().length).toBe(5);
    });
    // 挿入位置は対象行の直後（同一階層）
    expect(rowKeys()[0]).toBe('item-a');
    expect(rowKeys().slice(-2)).toEqual(['item-b', 'item-c']);
  });

  // ==========================================================================
  // 行操作のキーボード完結（47.1, 47.8）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-47.1 */
  it('キー操作のみで行の複写と削除が完結すること (47.1)', async () => {
    renderPage();
    await waitForItems();

    escapeToRow('item-a');

    // 複写（部分木ごと複写されるため2行増える）
    fireEvent.keyDown(focused(), { key: 'c', code: 'KeyC', altKey: true });
    await waitFor(() => {
      expect(rowKeys().length).toBe(6);
    });

    // 削除（子孫もあわせて消えるため2行減る）
    fireEvent.keyDown(rowOf('item-a'), { key: 'Delete', altKey: true });
    await waitFor(() => {
      expect(rowKeys().length).toBe(4);
    });
    expect(screen.queryByTestId('estimate-item-item-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('estimate-item-item-a1')).not.toBeInTheDocument();
  });

  /** @requirement estimate-creation/REQ-47.1 */
  it('キー操作のみで単一行の階層を下げ、また上げられること (47.1)', async () => {
    renderPage();
    await waitForItems();
    expect(panelLevelOf('item-c')).toBe('1');

    escapeToRow('item-c');
    fireEvent.keyDown(focused(), { key: 'ArrowRight', altKey: true, shiftKey: true });

    await waitFor(() => {
      expect(panelLevelOf('item-c')).toBe('2');
    });

    fireEvent.keyDown(rowOf('item-c'), { key: 'ArrowLeft', altKey: true, shiftKey: true });

    await waitFor(() => {
      expect(panelLevelOf('item-c')).toBe('1');
    });
  });

  // ==========================================================================
  // 範囲選択（44.1, 47.6, 47.7）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-47.6 */
  it('範囲選択中は範囲全体に階層の上げ下げが効くこと (47.6)', async () => {
    renderPage();
    await waitForItems();

    escapeToRow('item-b');
    fireEvent.keyDown(focused(), { key: 'ArrowDown', shiftKey: true });

    await waitFor(() => {
      expect(isRowSelected('item-b')).toBe('true');
    });
    expect(isRowSelected('item-c')).toBe('true');
    expect(isRowSelected('item-a')).toBe('false');

    // 範囲の階層下げ: 先頭行が親になり、残りがその子になる（44.4）
    fireEvent.keyDown(focused(), { key: 'ArrowRight', altKey: true, shiftKey: true });

    await waitFor(() => {
      expect(panelLevelOf('item-c')).toBe('2');
    });
    expect(panelLevelOf('item-b')).toBe('1');
  });

  /** @requirement estimate-creation/REQ-47.7 */
  it('選択解除の操作で範囲選択が解除されること (47.7)', async () => {
    renderPage();
    await waitForItems();

    escapeToRow('item-b');
    fireEvent.keyDown(focused(), { key: 'ArrowDown', shiftKey: true });
    await waitFor(() => {
      expect(isRowSelected('item-c')).toBe('true');
    });

    fireEvent.keyDown(focused(), { key: 'Escape' });

    await waitFor(() => {
      expect(isRowSelected('item-c')).toBe('false');
    });
    expect(isRowSelected('item-b')).toBe('false');
  });

  // ==========================================================================
  // 階層間の移動（47.1）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-47.1 */
  it('キー操作のみで表示モードを切り替え階層を出入りできること (47.1)', async () => {
    renderPage();
    await waitForItems();
    expect(breadcrumb()).not.toBeInTheDocument();

    escapeToRow('item-a');

    // 表示モードの切替
    fireEvent.keyDown(focused(), { key: 'm', code: 'KeyM', altKey: true });
    await waitFor(() => {
      expect(breadcrumb()).toBeInTheDocument();
    });
    expect(screen.queryByTestId('estimate-item-item-a1')).not.toBeInTheDocument();

    // 階層内の先頭行へ（行がアンマウントされてもキー操作を続けられる）
    fireEvent.keyDown(focused(), { key: 'PageUp', altKey: true });
    await waitFor(() => {
      expect(isRowSelected('item-a')).toBe('true');
    });

    // 子階層へ入る
    fireEvent.keyDown(focused(), { key: 'ArrowDown', altKey: true });
    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-a1')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('estimate-item-item-b')).not.toBeInTheDocument();

    // 一つ上の階層へ戻る
    fireEvent.keyDown(focused(), { key: 'ArrowUp', altKey: true });
    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-b')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('estimate-item-item-a1')).not.toBeInTheDocument();
  });

  // ==========================================================================
  // ブラウザ標準の操作（47.2, 47.4）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-47.2 */
  it('Tab でセル間を移動でき、キー割当が横取りしないこと (47.2, 47.4)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    const name = nameInputOf('item-a');
    name.focus();
    expect(focused()).toBe(name);

    await user.tab();

    const estimateLine = within(rowOf('item-a')).getByTestId('line-type-ESTIMATE');
    expect(focused()).toBe(within(estimateLine).getByLabelText('規格'));
  });

  // ==========================================================================
  // サーバーへの保存を伴わない（47.8）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-47.8 */
  it('一連のキー操作でサーバーへの書き込みが1件も発生しないこと (47.8)', async () => {
    renderPage();
    await waitForItems();

    escapeToRow('item-a');
    fireEvent.keyDown(focused(), { key: 'Insert', altKey: true });
    await waitFor(() => {
      expect(rowKeys().length).toBe(5);
    });

    fireEvent.keyDown(rowOf('item-b'), { key: 'ArrowDown', shiftKey: true });
    fireEvent.keyDown(rowOf('item-c'), { key: 'ArrowRight', altKey: true, shiftKey: true });
    await waitFor(() => {
      expect(panelLevelOf('item-c')).toBe('2');
    });

    // 範囲選択を解除してから単一行を削除する（範囲選択中の削除は範囲が対象になる）
    fireEvent.keyDown(rowOf('item-c'), { key: 'Escape' });
    await waitFor(() => {
      expect(isRowSelected('item-c')).toBe('false');
    });
    fireEvent.keyDown(rowOf('item-a'), { key: 'Delete', altKey: true });
    await waitFor(() => {
      expect(screen.queryByTestId('estimate-item-item-a')).not.toBeInTheDocument();
    });

    // 画面上の明細は変わったが、書き込みは1件も出ていない
    expect(writeApiCalls()).toEqual([]);
    // 未保存として保存操作が可能な状態になる（＝ローカルにだけ反映されている）
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  });
});
