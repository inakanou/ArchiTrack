/**
 * @fileoverview EstimateDetailPage の階層構造パネル結線テスト（実物のコンポーネントで検証）
 *
 * Task 54.5: 階層構造の俯瞰パネル
 *
 * `EstimateDetailPage.test.tsx` は `../components/estimate` を丸ごとモックして
 * props の受け渡しだけを検証するため、「パネルで折りたたむ → 明細も追従する」
 * 「パネルで選ぶ → 明細が当該項目へ移動して選択される」といった**画面上の実際の
 * 振る舞い**は捉えられない（53.14 の死んだ `onDragStart` / `onDrop` が長く
 * 気づかれなかったのと同じ死角）。本ファイルはパネル・ツールバー・明細テーブルを
 * **実物のまま**描画し、一気通貫を固定する。
 *
 * Requirements (estimate-creation):
 * - 46.1: 見積書画面に階層構造を俯瞰するパネルを提供する
 * - 46.2: 見積項目の階層構造をツリー形式で表示する
 * - 46.3: 各項目の展開/折りたたみ操作を提供する
 * - 46.4: すべて展開・すべて折りたたむ操作を提供する
 * - 46.5: 項目を選択した場合、明細の表示を当該項目へ移動し選択状態にする
 * - 46.6: 明細の階層構造が編集によって変化した場合、変化後の構造を反映する
 * - 46.7: 階層構造パネルの表示/非表示を切り替え可能とする
 *
 * Design: design.md `EstimateHierarchyPanel.tsx  # 新規: 階層構造の俯瞰パネル`（:3725）、
 * 「EstimateHierarchyPanel | Frontend UI | 階層構造の俯瞰とジャンプ | 46 |
 * estimateTree (P0), useEstimateNavigation (P0)」（:3933）
 *
 * @module pages/EstimateDetailPage.hierarchyPanel
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateDetailPage from './EstimateDetailPage';
import * as estimatesApi from '../api/estimates';

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

// jsdom は scrollIntoView を実装しないため既定の実体を置く（既存の
// `AutocompleteInput.test.tsx` / `TradingPartnerSelect.test.tsx` と同じ確立済みパターン）。
// 46.5 の「明細の表示を当該項目へ移動」を検証するテストは、これに加えて対象行へ
// 個別のスパイを差し込み、**その行が**移動対象になったことを確かめる。
Element.prototype.scrollIntoView = vi.fn();

// ============================================================================
// テストデータ（親 > 子 > 孫 の3階層 + ルートの兄弟1件）
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
  parentId: string | null,
  displayOrder: number,
  name: string,
  children: unknown[]
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
    buildItem('item-parent', null, 0, '親項目', [
      buildItem('item-child', 'item-parent', 0, '子項目', [
        buildItem('item-grandchild', 'item-child', 0, '孫項目', []),
      ]),
    ]),
    buildItem('item-second', null, 1, '第2項目', []),
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

/** 俯瞰パネル本体 */
const panel = () => screen.queryByRole('region', { name: '階層構造' });

/** 俯瞰パネルが並べている項目キー（表示順） */
const panelNodeKeys = (): string[] =>
  within(screen.getByRole('region', { name: '階層構造' }))
    .getAllByRole('treeitem')
    .map((element) => element.getAttribute('data-node-key') ?? '');

/** 明細テーブル側に描画されている行 */
const tableRow = (itemId: string) => screen.queryByTestId(`estimate-item-${itemId}`);

/**
 * 明細操作ツールバーのボタン
 *
 * 画面ヘッダーにも「削除」（見積書そのものの削除）があるため、必ずツールバーへ絞る。
 */
const toolbarButton = (name: string) =>
  within(screen.getByTestId('estimate-item-toolbar')).getByRole('button', { name });

describe('EstimateDetailPage 階層構造の俯瞰パネル（実物のコンポーネント）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
    vi.mocked(estimatesApi.getEstimateItems).mockResolvedValue(mockEstimateDetail.items);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  /** @requirement estimate-creation/REQ-46.1 */
  it('見積書画面に階層構造を俯瞰するパネルを表示すること (46.1)', async () => {
    renderPage();
    await waitForItems();

    expect(panel()).toBeInTheDocument();
  });

  /** @requirement estimate-creation/REQ-46.2 */
  it('明細と同じ階層構造をツリー形式で表示すること (46.2)', async () => {
    renderPage();
    await waitForItems();

    expect(panelNodeKeys()).toEqual([
      'item-parent',
      'item-child',
      'item-grandchild',
      'item-second',
    ]);
    expect(
      within(screen.getByTestId('hierarchy-node-item-grandchild')).getByRole('button', {
        name: '孫項目',
      })
    ).toBeInTheDocument();
  });

  /** @requirement estimate-creation/REQ-46.3 */
  it('パネルで折りたたむとパネルと明細の双方から子孫が消えること (46.3)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    expect(tableRow('item-child')).toBeInTheDocument();

    await user.click(
      within(screen.getByTestId('hierarchy-node-item-parent')).getByRole('button', {
        name: '親項目 を折りたたむ',
      })
    );

    await waitFor(() => {
      expect(panelNodeKeys()).toEqual(['item-parent', 'item-second']);
    });
    // 折りたたみ状態は明細テーブルと同一の所有者（useEstimateNavigation）が持つ
    expect(tableRow('item-child')).not.toBeInTheDocument();
    expect(tableRow('item-grandchild')).not.toBeInTheDocument();
    expect(tableRow('item-parent')).toBeInTheDocument();
  });

  /** @requirement estimate-creation/REQ-46.3 */
  it('折りたたんだ項目をパネルで展開すると元へ戻ること (46.3)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    await user.click(screen.getByRole('button', { name: '親項目 を折りたたむ' }));
    await waitFor(() => {
      expect(tableRow('item-child')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '親項目 を展開する' }));

    await waitFor(() => {
      expect(tableRow('item-child')).toBeInTheDocument();
    });
    expect(panelNodeKeys()).toEqual([
      'item-parent',
      'item-child',
      'item-grandchild',
      'item-second',
    ]);
  });

  /** @requirement estimate-creation/REQ-46.4 */
  it('すべて折りたたむとルートの項目だけが残ること (46.4)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    await user.click(screen.getByRole('button', { name: 'すべて折りたたむ' }));

    await waitFor(() => {
      expect(panelNodeKeys()).toEqual(['item-parent', 'item-second']);
    });
    expect(tableRow('item-child')).not.toBeInTheDocument();
    expect(tableRow('item-grandchild')).not.toBeInTheDocument();
  });

  /** @requirement estimate-creation/REQ-46.4 */
  it('すべて展開すると全階層が戻ること (46.4)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    await user.click(screen.getByRole('button', { name: 'すべて折りたたむ' }));
    await waitFor(() => {
      expect(tableRow('item-grandchild')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'すべて展開' }));

    await waitFor(() => {
      expect(tableRow('item-grandchild')).toBeInTheDocument();
    });
    expect(panelNodeKeys()).toEqual([
      'item-parent',
      'item-child',
      'item-grandchild',
      'item-second',
    ]);
  });

  /** @requirement estimate-creation/REQ-46.5 */
  it('パネルの項目を選ぶと明細の当該行が選択状態になること (46.5 / ツリー表示)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    expect(screen.getByTestId('estimate-item-item-grandchild')).toHaveAttribute(
      'data-selected',
      'false'
    );

    await user.click(
      within(screen.getByTestId('hierarchy-node-item-grandchild')).getByRole('button', {
        name: '孫項目',
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-grandchild')).toHaveAttribute(
        'data-selected',
        'true'
      );
    });
    expect(screen.getByTestId('hierarchy-node-item-grandchild')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    // 選択必須のツールバー操作が有効になる（選択状態が画面全体へ伝わっている）
    expect(toolbarButton('削除')).toBeEnabled();
  });

  /**
   * ツリー表示（既定 / 45.2）では折りたたまれた祖先の展開だけでは「移動」にならない。
   * パネルに現れている項目は定義上どの祖先も展開済み（パネルと明細は同一の
   * `collapsedKeys` を共有する）ため、祖先展開は何も起こさず選択色が変わるだけになる。
   * 46.5 の「明細の表示を当該項目へ移動し」を満たすには、明細のスクロール領域が
   * 当該行まで実際に動く必要がある。
   *
   * @requirement estimate-creation/REQ-46.5
   */
  it('パネルの項目を選ぶと明細のスクロール位置が当該行まで移動すること (46.5 / ツリー表示)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    // 対象行そのものに個別のスパイを置く（プロトタイプ既定の実体を覆う）。
    // 「どこかの行が動いた」ではなく「孫項目の行が動いた」ことを固定する。
    const grandchildRow = screen.getByTestId('estimate-item-item-grandchild');
    const revealGrandchild = vi.fn();
    grandchildRow.scrollIntoView = revealGrandchild;

    expect(revealGrandchild).not.toHaveBeenCalled();

    await user.click(
      within(screen.getByTestId('hierarchy-node-item-grandchild')).getByRole('button', {
        name: '孫項目',
      })
    );

    await waitFor(() => {
      expect(revealGrandchild).toHaveBeenCalled();
    });
    expect(revealGrandchild).toHaveBeenCalledWith({ block: 'nearest' });
    // 移動先の行は同時に選択状態にもなる（46.5 の後段）
    expect(screen.getByTestId('estimate-item-item-grandchild')).toHaveAttribute(
      'data-selected',
      'true'
    );
  });

  /** @requirement estimate-creation/REQ-46.5 */
  it('同じ項目を選び直しても明細の表示を当該行へ移動し直すこと (46.5 / ツリー表示)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    const grandchildLabel = within(screen.getByTestId('hierarchy-node-item-grandchild')).getByRole(
      'button',
      { name: '孫項目' }
    );
    const revealGrandchild = vi.fn();
    screen.getByTestId('estimate-item-item-grandchild').scrollIntoView = revealGrandchild;

    await user.click(grandchildLabel);
    await waitFor(() => {
      expect(revealGrandchild).toHaveBeenCalledTimes(1);
    });

    // 選択状態が変わらなくても「移動」は要求のたびに起きる（行を見失った利用者が
    // 同じ項目をもう一度選ぶ操作が無反応にならない）
    await user.click(grandchildLabel);

    await waitFor(() => {
      expect(revealGrandchild).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * ドリルダウン表示では「当該項目が属する階層」へ現在階層を移すことが
   * 「明細の表示を当該項目へ移動」に当たる（45.6: 現在の階層に属する項目のみを一覧表示する）。
   *
   * @requirement estimate-creation/REQ-46.5
   */
  it('ドリルダウン表示では当該項目が属する階層へ明細を移動し選択すること (46.5)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    await user.click(screen.getByRole('radio', { name: 'ドリルダウン表示' }));
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: '明細の階層経路' })).toBeInTheDocument();
    });
    // ルート階層なので孫項目は明細に出ていない
    expect(tableRow('item-grandchild')).not.toBeInTheDocument();

    await user.click(
      within(screen.getByTestId('hierarchy-node-item-grandchild')).getByRole('button', {
        name: '孫項目',
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-grandchild')).toBeInTheDocument();
    });
    expect(screen.getByTestId('estimate-item-item-grandchild')).toHaveAttribute(
      'data-selected',
      'true'
    );
    // 現在階層は親（子項目）へ移り、経路にも現れる
    expect(
      within(screen.getByRole('navigation', { name: '明細の階層経路' })).getByText('子項目')
    ).toBeInTheDocument();
    expect(tableRow('item-parent')).not.toBeInTheDocument();
  });

  /** @requirement estimate-creation/REQ-46.6 */
  it('明細に項目を追加するとパネルの構造が追従すること (46.6)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    expect(panelNodeKeys()).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: '+ 項目追加' }));

    await waitFor(() => {
      expect(panelNodeKeys()).toHaveLength(5);
    });
  });

  /** @requirement estimate-creation/REQ-46.6 */
  it('明細の階層を変更するとパネルの階層が追従すること (46.6)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    expect(screen.getByTestId('hierarchy-node-item-second')).toHaveAttribute('aria-level', '1');

    // 第2項目を選択して「下の階層へ」＝直前の兄弟（親項目）の子へネストする
    await user.click(
      within(screen.getByTestId('hierarchy-node-item-second')).getByRole('button', {
        name: '第2項目',
      })
    );
    await waitFor(() => {
      expect(toolbarButton('下の階層へ')).toBeEnabled();
    });
    await user.click(toolbarButton('下の階層へ'));

    await waitFor(() => {
      expect(screen.getByTestId('hierarchy-node-item-second')).toHaveAttribute('aria-level', '2');
    });
    expect(panelNodeKeys()).toEqual([
      'item-parent',
      'item-child',
      'item-grandchild',
      'item-second',
    ]);
  });

  /** @requirement estimate-creation/REQ-46.6 */
  it('明細から項目を削除するとパネルからも消えること (46.6)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    await user.click(
      within(screen.getByTestId('hierarchy-node-item-second')).getByRole('button', {
        name: '第2項目',
      })
    );
    await waitFor(() => {
      expect(toolbarButton('削除')).toBeEnabled();
    });
    await user.click(toolbarButton('削除'));

    await waitFor(() => {
      expect(screen.queryByTestId('hierarchy-node-item-second')).not.toBeInTheDocument();
    });
    expect(panelNodeKeys()).toEqual(['item-parent', 'item-child', 'item-grandchild']);
  });

  /** @requirement estimate-creation/REQ-46.7 */
  it('パネルの表示/非表示を切り替えられること (46.7)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    expect(panel()).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '階層パネルを隠す' }));

    await waitFor(() => {
      expect(panel()).not.toBeInTheDocument();
    });
    // 明細そのものは残る
    expect(tableRow('item-parent')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '階層パネルを表示' }));

    await waitFor(() => {
      expect(panel()).toBeInTheDocument();
    });
    expect(panelNodeKeys()).toEqual([
      'item-parent',
      'item-child',
      'item-grandchild',
      'item-second',
    ]);
  });

  /**
   * 46.7 は 45.11 と異なり「次回の画面表示時にも引き継ぐ」と述べていないため、
   * 表示/非表示は端末へ永続化しない（再表示時は既定の表示状態へ戻る）。
   *
   * @requirement estimate-creation/REQ-46.7
   */
  it('非表示にした状態を端末へ永続化しないこと (46.7)', async () => {
    const user = userEvent.setup();
    const first = renderPage();
    await waitForItems();

    await user.click(screen.getByRole('button', { name: '階層パネルを隠す' }));
    await waitFor(() => {
      expect(panel()).not.toBeInTheDocument();
    });
    expect(
      Object.keys(window.localStorage).filter((key) => key.toLowerCase().includes('panel'))
    ).toEqual([]);

    first.unmount();
    renderPage();
    await waitForItems();

    expect(panel()).toBeInTheDocument();
  });
});
