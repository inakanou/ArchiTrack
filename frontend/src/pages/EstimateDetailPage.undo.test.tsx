/**
 * @fileoverview EstimateDetailPage の取り消し・やり直しテスト（実物のコンポーネントで検証）
 *
 * Task 54.8: 編集操作の取り消しとやり直し
 *
 * `EstimateDetailPage.test.tsx` は `../components/estimate` を丸ごとモックするため、
 * 「取り消しボタンを押す → 明細が戻る」という一気通貫は捉えられない（53.16 の
 * 死んだ props と同じ死角）。本ファイルはツールバー・階層パネル・明細テーブルを
 * **実物のまま**描画し、`EstimateDetailPage.keyboard.test.tsx` と同じく API 層と
 * ルーターだけをモックする。
 *
 * Requirements (estimate-creation):
 * - 48.1: 明細に対する編集操作の取り消し（元に戻す）を提供する
 * - 48.2: 取り消した操作のやり直しを提供する
 * - 48.4: 取り消し可能な履歴が存在しない場合、取り消し操作を無効状態で表示する
 * - 48.5: 取り消し・やり直しはサーバーへの保存を伴わずに画面上の明細を更新する
 * - 48.6: 取り消し・やり直しで影響を受ける親項目の金額合計を再計算して表示する
 * - 48.7: 保存操作が成功した場合、取り消し履歴を破棄する
 *
 * Design: design.md `##### useEstimateUndo`（:4123-4151）
 *
 * @module pages/EstimateDetailPage.undo
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
// テストデータ（表示順: item-a > item-a1, item-b）
// ============================================================================

const buildLine = (
  id: string,
  itemId: string,
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR',
  name: string,
  unitPrice: string
) => ({
  id,
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
  sourceVendorName: null,
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
});

const buildItem = (
  id: string,
  name: string,
  parentId: string | null,
  displayOrder: number,
  unitPrice: string,
  children: unknown[] = []
) => ({
  id,
  estimateId: 'est-001',
  parentId,
  displayOrder,
  itemType: 'STANDARD',
  lines: [
    buildLine(`${id}-l1`, id, 'ESTIMATE', name, unitPrice),
    buildLine(`${id}-l2`, id, 'EXECUTION', name, unitPrice),
    buildLine(`${id}-l3`, id, 'VENDOR', name, unitPrice),
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
    buildItem('item-a', '項目A', null, 0, '100000', [
      buildItem('item-a1', '項目A1', 'item-a', 0, '100000'),
    ]),
    buildItem('item-b', '項目B', null, 1, '200000'),
  ],
  totalAmount: '300000',
} as unknown as estimatesApi.EstimateDetail;

/** 保存応答（保存後の最新ツリー）。明細は保存時点の内容を返す想定の固定値 */
const buildSavedResponse = (): estimatesApi.SaveEstimateDraftResponse =>
  ({
    id: 'est-001',
    projectId: 'proj-001',
    project: { id: 'proj-001', name: 'テストプロジェクト' },
    name: 'テスト見積書',
    sourceItemizedStatementId: 'is-001',
    sourceItemizedStatementName: '内訳書A',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-20T12:00:00.000Z',
    itemCount: 2,
    reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
    items: mockEstimateDetail.items,
  }) as unknown as estimatesApi.SaveEstimateDraftResponse;

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

/** 指定行の見積金額行のセル */
const estimateLineOf = (itemId: string): HTMLElement =>
  within(rowOf(itemId)).getByTestId('line-type-ESTIMATE');

/** 指定行の見積金額行に表示されている金額（自動計算・入力不可） */
const amountOf = (itemId: string): string =>
  within(estimateLineOf(itemId)).getByTestId('amount-field').textContent ?? '';

const undoButton = (): HTMLButtonElement => screen.getByTestId('undo-button') as HTMLButtonElement;
const redoButton = (): HTMLButtonElement => screen.getByTestId('redo-button') as HTMLButtonElement;

/** いま焦点のある要素（キー操作は常にここへ届く） */
const focused = (): HTMLElement => document.activeElement as HTMLElement;

/** セル編集を抜けて行選択の文脈へ移る（Esc） */
const escapeToRow = (itemId: string): void => {
  const input = within(estimateLineOf(itemId)).getByLabelText('名称');
  (input as HTMLInputElement).focus();
  fireEvent.keyDown(input, { key: 'Escape' });
};

/**
 * 参照系以外の API が一度も呼ばれていないこと（48.5）
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

describe('EstimateDetailPage 取り消し・やり直し（実物のコンポーネント）', () => {
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
  // 履歴が無い場合の無効表示（48.4）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-48.4 */
  it('履歴が無い間は取り消し・やり直しを無効状態で表示すること (48.4)', async () => {
    renderPage();
    await waitForItems();

    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();

    // 編集すると取り消しが有効になる（否定と対になる肯定側）
    fireEvent.change(within(estimateLineOf('item-b')).getByLabelText('名称'), {
      target: { value: '項目B改' },
    });

    await waitFor(() => {
      expect(undoButton()).toBeEnabled();
    });
    // やり直しは取り消しを行うまで無効のまま
    expect(redoButton()).toBeDisabled();
  });

  // ==========================================================================
  // 行削除の取り消し（48.1, 48.5）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-48.1 */
  it('行削除を取り消して復元できること (48.1)', async () => {
    renderPage();
    await waitForItems();
    expect(rowKeys()).toEqual(['item-a', 'item-a1', 'item-b']);

    escapeToRow('item-a1');
    fireEvent.keyDown(focused(), { key: 'Delete', altKey: true });
    await waitFor(() => {
      expect(screen.queryByTestId('estimate-item-item-a1')).not.toBeInTheDocument();
    });

    fireEvent.click(undoButton());

    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-a1')).toBeInTheDocument();
    });
    expect(rowKeys()).toEqual(['item-a', 'item-a1', 'item-b']);
    // 復元された行は削除前の内容を保つ
    expect(
      (within(estimateLineOf('item-a1')).getByLabelText('名称') as HTMLInputElement).value
    ).toBe('項目A1');
  });

  /** @requirement estimate-creation/REQ-48.2 */
  it('取り消した行削除をやり直せること (48.2)', async () => {
    renderPage();
    await waitForItems();

    escapeToRow('item-a1');
    fireEvent.keyDown(focused(), { key: 'Delete', altKey: true });
    await waitFor(() => {
      expect(screen.queryByTestId('estimate-item-item-a1')).not.toBeInTheDocument();
    });

    fireEvent.click(undoButton());
    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-a1')).toBeInTheDocument();
    });

    expect(redoButton()).toBeEnabled();
    fireEvent.click(redoButton());

    await waitFor(() => {
      expect(screen.queryByTestId('estimate-item-item-a1')).not.toBeInTheDocument();
    });
    expect(redoButton()).toBeDisabled();
  });

  /** @requirement estimate-creation/REQ-48.5 */
  it('取り消し・やり直しでサーバーへの書き込みが1件も発生しないこと (48.5)', async () => {
    renderPage();
    await waitForItems();

    escapeToRow('item-b');
    fireEvent.keyDown(focused(), { key: 'Insert', altKey: true });
    await waitFor(() => {
      expect(rowKeys().length).toBe(4);
    });

    fireEvent.click(undoButton());
    await waitFor(() => {
      expect(rowKeys().length).toBe(3);
    });

    fireEvent.click(redoButton());
    await waitFor(() => {
      expect(rowKeys().length).toBe(4);
    });

    // 画面上の明細は取り消し・やり直しで動いたが、書き込みは1件も出ていない
    expect(writeApiCalls()).toEqual([]);
    // 未保存としてローカルにだけ反映されている
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  });

  // ==========================================================================
  // 親項目の集計金額の再計算（48.6）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-48.6 */
  it('取り消し・やり直しで親項目の金額合計を再計算して表示すること (48.6)', async () => {
    renderPage();
    await waitForItems();

    // 親（item-a）の金額は子（item-a1）の合計
    expect(amountOf('item-a')).toBe('100,000');

    // 子の単価を変更すると親の集計も動く
    fireEvent.change(within(estimateLineOf('item-a1')).getByLabelText('単価'), {
      target: { value: '250000' },
    });
    await waitFor(() => {
      expect(amountOf('item-a1')).toBe('250,000');
    });
    expect(amountOf('item-a')).toBe('250,000');

    // 取り消すと親の集計金額が戻る
    fireEvent.click(undoButton());
    await waitFor(() => {
      expect(amountOf('item-a1')).toBe('100,000');
    });
    expect(amountOf('item-a')).toBe('100,000');

    // やり直すと再び集計され直す
    fireEvent.click(redoButton());
    await waitFor(() => {
      expect(amountOf('item-a')).toBe('250,000');
    });
  });

  // ==========================================================================
  // 保存成功時の履歴破棄（48.7）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-48.7 */
  it('保存が成功すると取り消し履歴を破棄すること (48.7)', async () => {
    vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue(buildSavedResponse());
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    escapeToRow('item-a1');
    fireEvent.keyDown(focused(), { key: 'Delete', altKey: true });
    await waitFor(() => {
      expect(undoButton()).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(undoButton()).toBeDisabled();
    });
    expect(redoButton()).toBeDisabled();
  });

  // ==========================================================================
  // サーバー側書き込み後の再同期による履歴破棄（48.7 / 42.9, 53.9）
  // ==========================================================================

  /**
   * 「編集 → 取り消し → 諸経費追加（サーバー書き込み＋再同期）」の後にやり直しが
   * 残っていると、サーバーが作った行を含まない**再同期前のツリー**へ戻ってしまう。
   * その状態で保存すると、一括保存の「`id` あり・ペイロードに不在 → 削除」規則により
   * 作られたばかりの行がサーバー上から消える（無言のデータ破壊）。
   *
   * 取り消しによって未保存が解消されるため `openGuardedTransferDialog` の抑止を
   * すり抜けられる点が、この経路を実際に到達可能にしている。
   *
   * @requirement estimate-creation/REQ-48.7
   */
  it('サーバー側書き込み後の再同期で取り消し履歴を破棄すること (48.7)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    // 1. セルを編集して履歴を作る
    fireEvent.change(within(estimateLineOf('item-b')).getByLabelText('名称'), {
      target: { value: '項目B改' },
    });
    await waitFor(() => {
      expect(undoButton()).toBeEnabled();
    });

    // 2. 取り消す（未保存が解消され、やり直しが可能になる）
    fireEvent.click(undoButton());
    await waitFor(() => {
      expect(redoButton()).toBeEnabled();
    });
    // 未保存が無いため転記系の起動抑止をすり抜ける
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();

    // 3. サーバー側書き込みの結果（新しい行 item-c）を再同期で取り込ませる
    const resyncedItems = [
      ...mockEstimateDetail.items,
      buildItem('item-c', '共通仮設費', null, 2, '50000'),
    ] as unknown as typeof mockEstimateDetail.items;
    vi.mocked(estimatesApi.addOverheadItem).mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof estimatesApi.addOverheadItem>>
    );
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue({
      ...mockEstimateDetail,
      items: resyncedItems,
      updatedAt: '2024-01-20T12:00:00.000Z',
    });
    vi.mocked(estimatesApi.getEstimateItems).mockResolvedValue(resyncedItems);

    await user.click(screen.getByRole('button', { name: '諸経費を計算して追加' }));
    const dialog = await screen.findByTestId('overhead-cost-dialog');
    fireEvent.change(within(dialog).getByLabelText('計算金額'), { target: { value: '50000' } });
    await user.click(within(dialog).getByRole('button', { name: '項目追加' }));

    // サーバーが作った行が編集状態へ入っている（再同期は成立している）
    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-c')).toBeInTheDocument();
    });

    // 4. 基準ツリーが入れ替わったので、取り消し・やり直しはどちらも残っていない
    expect(redoButton()).toBeDisabled();
    expect(undoButton()).toBeDisabled();

    // やり直しの経路（キーボード）でも古いツリーへは戻らない
    fireEvent.keyDown(rowOf('item-a'), { key: 'y', code: 'KeyY', ctrlKey: true });
    await waitFor(() => {
      expect(rowKeys()).toEqual(['item-a', 'item-a1', 'item-b', 'item-c']);
    });
    // 復元が起きていないので未保存も生じない
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  // ==========================================================================
  // キーボードからの取り消し・やり直し（48.1, 48.2 / 47.1）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-48.1 */
  it('Ctrl+Z で取り消し、Ctrl+Y でやり直せること (48.1, 48.2)', async () => {
    renderPage();
    await waitForItems();

    escapeToRow('item-a1');
    fireEvent.keyDown(focused(), { key: 'Delete', altKey: true });
    await waitFor(() => {
      expect(screen.queryByTestId('estimate-item-item-a1')).not.toBeInTheDocument();
    });

    // 削除された行は消えているため、残っている行の上でキーを押す
    fireEvent.keyDown(rowOf('item-a'), { key: 'z', code: 'KeyZ', ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-a1')).toBeInTheDocument();
    });

    fireEvent.keyDown(rowOf('item-a'), { key: 'y', code: 'KeyY', ctrlKey: true });
    await waitFor(() => {
      expect(screen.queryByTestId('estimate-item-item-a1')).not.toBeInTheDocument();
    });
  });

  /**
   * QWERTZ 配列の `Ctrl+Y` は `key='y'` / `code='KeyZ'` になる（54.6 のレビュー指摘）。
   * `code` フォールバックが効くと取り消しに解決され、やり直しのつもりで
   * さらに1つ前へ戻ってしまう。
   *
   * @requirement estimate-creation/REQ-48.2
   */
  it('QWERTZ 配列の Ctrl+Y がやり直しとして働くこと (48.2)', async () => {
    renderPage();
    await waitForItems();

    escapeToRow('item-a1');
    fireEvent.keyDown(focused(), { key: 'Delete', altKey: true });
    await waitFor(() => {
      expect(screen.queryByTestId('estimate-item-item-a1')).not.toBeInTheDocument();
    });

    fireEvent.keyDown(rowOf('item-a'), { key: 'z', code: 'KeyZ', ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-a1')).toBeInTheDocument();
    });

    // QWERTZ: `y` を押すと物理キーは `KeyZ`
    fireEvent.keyDown(rowOf('item-a'), { key: 'y', code: 'KeyZ', ctrlKey: true });

    await waitFor(() => {
      expect(screen.queryByTestId('estimate-item-item-a1')).not.toBeInTheDocument();
    });
  });

  /** @requirement estimate-creation/REQ-48.5 */
  it('セルの文字入力中は Ctrl+Z を横取りしないこと (47.5, 48.5)', async () => {
    renderPage();
    await waitForItems();

    // 名称を編集して履歴を作る
    const input = within(estimateLineOf('item-b')).getByLabelText('名称');
    fireEvent.change(input, { target: { value: '項目B改' } });
    await waitFor(() => {
      expect(undoButton()).toBeEnabled();
    });

    // セルにフォーカスがある間の Ctrl+Z はブラウザ標準の文字取り消しに委ねる
    (input as HTMLInputElement).focus();
    const handled = !fireEvent.keyDown(input, { key: 'z', code: 'KeyZ', ctrlKey: true });

    expect(handled).toBe(false);
    expect((input as HTMLInputElement).value).toBe('項目B改');
  });
});
