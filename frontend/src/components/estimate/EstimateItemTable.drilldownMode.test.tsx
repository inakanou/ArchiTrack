/**
 * @fileoverview EstimateItemTable ドリルダウン表示モードのテスト（Task 54.3）
 *
 * 現在の階層に属する項目だけを一覧表示するドリルダウン表示と、ルートからの
 * 経路表示・階層下げ・階層上げを検証します。現在階層は `useEstimateNavigation` が
 * 単独で所有する**表示状態**であり、編集状態（保存対象）には一切影響しないことを
 * 実フック経由で検証します。
 *
 * Requirements (estimate-creation):
 * - 45.6: ドリルダウン表示では現在の階層に属する項目のみを一覧表示する
 * - 45.7: 現在の階層の位置をルートからの経路として表示し、経路上の各階層へ戻る操作を提供する
 * - 45.8: 子項目を持つ項目に対する階層下げでその項目の子項目の一覧へ切り替える
 * - 45.9: 階層上げで親項目が属する階層の一覧へ切り替える
 *
 * Design: design.md `#### 階層表示モードの状態遷移（45.1〜45.11）`,
 * `EstimateItemTable.tsx  # 改修: ツリー表示 / ドリルダウン表示の2モード`,
 * `EstimateBreadcrumbPath.tsx  # 新規: ドリルダウン時の現在階層経路`
 *
 * @module components/estimate/EstimateItemTable.drilldownMode.test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EstimateItemTable } from './EstimateItemTable';
import { useEstimateEditor } from '../../hooks/useEstimateEditor';
import { useEstimateNavigation } from '../../hooks/useEstimateNavigation';
import type {
  EstimateItemHierarchyEdit,
  EstimateItemLineEdit,
  EstimateEditorSavePayload,
} from '../../hooks/useEstimateEditor';
import type { EditableItem } from '../../domain/estimate/estimateEditReducer.types';

// ============================================================================
// テストデータ
// ============================================================================

const createLine = (itemId: string, name: string, amount: string): EstimateItemLineEdit => ({
  id: `${itemId}-est`,
  estimateItemId: itemId,
  lineType: 'ESTIMATE',
  name,
  specification: null,
  unit: '式',
  quantity: '1',
  unitPrice: amount,
  amount,
  remarks: null,
});

const createItem = (
  id: string,
  name: string,
  amount: string,
  children: EstimateItemHierarchyEdit[] = []
): EstimateItemHierarchyEdit => ({
  id,
  estimateId: 'estimate-1',
  parentId: null,
  displayOrder: 0,
  itemType: 'STANDARD',
  lines: [createLine(id, name, amount)],
  children,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
});

/**
 * 4階層のツリー
 *
 * - 建築工事（root-1）
 *   - 直接仮設工事（child-1）
 *     - 遣り方（grandchild-1）
 *       - 墨出し（great-1）
 *     - 足場（grandchild-2）
 *   - 土工事（child-2）
 * - 電気設備工事（root-2、子なし）
 */
const createFourLevelTree = (): EstimateItemHierarchyEdit[] => [
  createItem('root-1', '建築工事', '1000000', [
    createItem('child-1', '直接仮設工事', '500000', [
      createItem('grandchild-1', '遣り方', '200000', [createItem('great-1', '墨出し', '50000')]),
      createItem('grandchild-2', '足場', '300000'),
    ]),
    createItem('child-2', '土工事', '300000'),
  ]),
  createItem('root-2', '電気設備工事', '400000'),
];

/** 描画されている名称欄の値を表示順で取得する */
const visibleNames = (): string[] =>
  (screen.getAllByLabelText('名称') as HTMLInputElement[]).map((input) => input.value);

/** 階層経路のセグメント表記（現在階層には末尾に印を付けない素の文字列） */
const pathLabels = (): string[] =>
  within(screen.getByRole('navigation', { name: '明細の階層経路' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent ?? '');

/** 階層経路のうち「戻る操作」を持つ（＝ボタンとして描画された）セグメント */
const pathButtonLabels = (): string[] =>
  within(screen.getByRole('navigation', { name: '明細の階層経路' }))
    .getAllByRole('button')
    .map((button) => button.textContent ?? '');

const renderDrilldown = (
  props: Partial<React.ComponentProps<typeof EstimateItemTable>> = {}
): { onCurrentLevelChange: ReturnType<typeof vi.fn> } => {
  const onCurrentLevelChange = vi.fn();
  render(
    <EstimateItemTable
      items={createFourLevelTree()}
      viewMode="drilldown"
      currentLevelKey={null}
      onCurrentLevelChange={onCurrentLevelChange}
      {...props}
    />
  );
  return { onCurrentLevelChange };
};

// ============================================================================
// 45.6: 現在の階層に属する項目のみを一覧表示する
// ============================================================================

describe('estimate-creation/REQ-45.6: ドリルダウン表示は現在の階層の項目のみを一覧表示する', () => {
  it('ルート階層ではルート項目のみが描画され、子孫は描画されないこと', () => {
    renderDrilldown();

    expect(visibleNames()).toEqual(['建築工事', '電気設備工事']);
    expect(screen.queryByTestId('estimate-item-child-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('estimate-item-grandchild-1')).not.toBeInTheDocument();
  });

  it('現在階層を指定した場合、その直下の子項目のみが描画されること', () => {
    renderDrilldown({ currentLevelKey: 'child-1' });

    expect(visibleNames()).toEqual(['遣り方', '足場']);
    // 親・祖先・兄弟階層・孫のいずれも現在の階層ではない
    expect(screen.queryByTestId('estimate-item-child-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('estimate-item-root-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('estimate-item-child-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('estimate-item-great-1')).not.toBeInTheDocument();
  });

  it('ツリー表示（既定）では全階層が描画され、ドリルダウン表示との差が生じること', () => {
    render(<EstimateItemTable items={createFourLevelTree()} />);

    expect(visibleNames()).toEqual([
      '建築工事',
      '直接仮設工事',
      '遣り方',
      '墨出し',
      '足場',
      '土工事',
      '電気設備工事',
    ]);
    expect(screen.queryByRole('navigation', { name: '明細の階層経路' })).not.toBeInTheDocument();
  });

  it('現在階層の項目は同じ深さのため、インデントを付けずに並べること', () => {
    renderDrilldown({ currentLevelKey: 'child-1' });

    expect(screen.getByTestId('estimate-item-grandchild-1')).toHaveStyle({ paddingLeft: '0px' });
    expect(screen.getByTestId('estimate-item-grandchild-2')).toHaveStyle({ paddingLeft: '0px' });
  });

  it('子を持たない項目を現在階層にした場合、空の階層である旨を表示すること', () => {
    renderDrilldown({ currentLevelKey: 'child-2' });

    expect(screen.queryAllByLabelText('名称')).toHaveLength(0);
    expect(screen.getByText('この階層に項目がありません')).toBeInTheDocument();
    // 経路は保たれ、上位階層へ戻れる
    expect(pathLabels()).toEqual(['全体', '建築工事', '土工事']);
  });

  it('削除などで現在階層のキーがツリーに存在しない場合、ルート階層を表示すること', () => {
    renderDrilldown({ currentLevelKey: 'removed-item' });

    expect(visibleNames()).toEqual(['建築工事', '電気設備工事']);
    expect(pathLabels()).toEqual(['全体']);
  });
});

// ============================================================================
// 45.7: ルートからの経路表示と各階層へ戻る操作
// ============================================================================

describe('estimate-creation/REQ-45.7: 現在階層の位置をルートからの経路として表示する', () => {
  it('ルート階層の経路は「全体」のみであること', () => {
    renderDrilldown();

    expect(pathLabels()).toEqual(['全体']);
  });

  it('深い階層ではルートから現在階層までの全段が順に並ぶこと', () => {
    renderDrilldown({ currentLevelKey: 'grandchild-1' });

    expect(pathLabels()).toEqual(['全体', '建築工事', '直接仮設工事', '遣り方']);
  });

  it('現在階層より上位のセグメントのみが戻る操作（ボタン）を持つこと', () => {
    renderDrilldown({ currentLevelKey: 'grandchild-1' });

    // 現在階層「遣り方」は戻り先ではないためボタンにしない
    expect(pathButtonLabels()).toEqual(['全体', '建築工事', '直接仮設工事']);
  });

  it('現在階層のセグメントに aria-current を付与すること', () => {
    renderDrilldown({ currentLevelKey: 'grandchild-1' });

    const current = within(screen.getByRole('navigation', { name: '明細の階層経路' })).getByText(
      '遣り方'
    );
    expect(current).toHaveAttribute('aria-current', 'true');
  });

  it('経路のセグメントをクリックすると、その階層のキーで現在階層の変更が要求されること', async () => {
    const { onCurrentLevelChange } = renderDrilldown({ currentLevelKey: 'grandchild-1' });

    await userEvent.click(screen.getByRole('button', { name: '建築工事' }));

    expect(onCurrentLevelChange).toHaveBeenCalledTimes(1);
    expect(onCurrentLevelChange).toHaveBeenCalledWith('root-1');
  });

  it('経路の「全体」をクリックするとルート階層（null）が要求されること', async () => {
    const { onCurrentLevelChange } = renderDrilldown({ currentLevelKey: 'grandchild-1' });

    await userEvent.click(screen.getByRole('button', { name: '全体' }));

    expect(onCurrentLevelChange).toHaveBeenCalledWith(null);
  });
});

// ============================================================================
// 45.8: 階層下げで子項目の一覧へ切り替える
// ============================================================================

describe('estimate-creation/REQ-45.8: 子項目を持つ項目の階層下げで子項目の一覧へ切り替える', () => {
  it('子項目を持つ項目にのみ階層下げの操作が描画されること', () => {
    renderDrilldown();

    expect(
      within(screen.getByTestId('estimate-item-root-1')).getByRole('button', {
        name: '建築工事 の子階層を表示',
      })
    ).toBeInTheDocument();
    // 子を持たない電気設備工事には階層下げの操作を出さない
    expect(
      within(screen.getByTestId('estimate-item-root-2')).queryByRole('button', {
        name: /の子階層を表示$/,
      })
    ).not.toBeInTheDocument();
  });

  it('階層下げの操作でその項目のキーが現在階層として要求されること', async () => {
    const { onCurrentLevelChange } = renderDrilldown();

    await userEvent.click(screen.getByRole('button', { name: '建築工事 の子階層を表示' }));

    expect(onCurrentLevelChange).toHaveBeenCalledTimes(1);
    expect(onCurrentLevelChange).toHaveBeenCalledWith('root-1');
  });

  it('階層下げの操作では項目選択のコールバックが発火しないこと', async () => {
    const onItemSelect = vi.fn();
    renderDrilldown({ onItemSelect });

    await userEvent.click(screen.getByRole('button', { name: '建築工事 の子階層を表示' }));

    expect(onItemSelect).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 45.9: 階層上げで親項目が属する階層の一覧へ切り替える
// ============================================================================

describe('estimate-creation/REQ-45.9: 階層上げで親項目が属する階層の一覧へ切り替える', () => {
  it('階層上げの操作で、現在階層の項目が属する階層のキーが要求されること', async () => {
    const { onCurrentLevelChange } = renderDrilldown({ currentLevelKey: 'child-1' });

    await userEvent.click(screen.getByRole('button', { name: '一つ上の階層へ戻る' }));

    // 現在階層 child-1 の親は root-1 ＝ 直接仮設工事が属する階層
    expect(onCurrentLevelChange).toHaveBeenCalledTimes(1);
    expect(onCurrentLevelChange).toHaveBeenCalledWith('root-1');
  });

  it('第1階層を現在階層にしている場合、階層上げでルート階層（null）が要求されること', async () => {
    const { onCurrentLevelChange } = renderDrilldown({ currentLevelKey: 'root-1' });

    await userEvent.click(screen.getByRole('button', { name: '一つ上の階層へ戻る' }));

    expect(onCurrentLevelChange).toHaveBeenCalledWith(null);
  });

  it('ルート階層ではこれ以上上げられないため階層上げの操作を描画しないこと', () => {
    renderDrilldown();

    expect(screen.queryByRole('button', { name: '一つ上の階層へ戻る' })).not.toBeInTheDocument();
  });
});

// ============================================================================
// 実フックとの結線（表示状態は編集内容に影響しない / 45.6〜45.9）
// ============================================================================

/**
 * 実フック（useEstimateEditor + useEstimateNavigation）と実コンポーネントを接続した検証用画面
 *
 * テーブルをモックせず、実際の DOM 操作から表示の切り替え・保存ペイロードまでを
 * 一気通貫で検証する。
 */
function DrilldownHarness({
  onSave,
}: {
  onSave: (payload: EstimateEditorSavePayload) => Promise<void>;
}) {
  const editor = useEstimateEditor({
    estimateId: 'estimate-1',
    initialItems: createFourLevelTree(),
    onSave,
  });
  const navigation = useEstimateNavigation({
    items: editor.editState.items,
    initialViewMode: 'drilldown',
  });

  return (
    <div>
      <div data-testid="is-dirty">{String(editor.isDirty)}</div>
      <div data-testid="current-level">{String(navigation.currentLevelKey)}</div>
      <div data-testid="visible-keys">{navigation.visibleKeys.join(',')}</div>
      <button type="button" onClick={() => void editor.save()}>
        保存
      </button>
      <EstimateItemTable
        items={editor.items}
        viewMode={navigation.viewMode}
        currentLevelKey={navigation.currentLevelKey}
        onCurrentLevelChange={navigation.setCurrentLevelKey}
        onLineChange={editor.updateLine}
      />
    </div>
  );
}

const noopSave = () => vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>(async () => {});

/**
 * 表示状態のキー（保存ペイロードへ混ざってはいけないもの）
 *
 * 現在階層・表示モード・折りたたみ・選択はすべて `useEstimateNavigation` が単独で
 * 所有する表示状態であり、保存対象の編集ツリーには存在しない。
 */
const VIEW_STATE_KEYS = ['currentLevelKey', 'viewMode', 'isExpanded', 'collapsedKeys'] as const;

/** 保存対象ノードが持ってよいキー（`EditableItem` の全項目） */
const EDITABLE_ITEM_KEYS = ['children', 'id', 'itemType', 'lines', 'tempId'];

/**
 * ペイロードの全階層に表示状態が混入していないことを検証する
 *
 * 構造的部分型では余剰キーが型検査で弾かれないため、キー集合の完全一致で押さえる。
 */
const expectFreeOfViewState = (items: readonly EditableItem[], path = 'items'): void => {
  items.forEach((node, index) => {
    const where = `${path}[${index}]`;
    for (const key of VIEW_STATE_KEYS) {
      expect(node, where).not.toHaveProperty(key);
    }
    expect(Object.keys(node).sort(), where).toEqual(EDITABLE_ITEM_KEYS);
    expectFreeOfViewState(node.children, `${where}.children`);
  });
};

/** 保存ペイロードから名称を先行順で集める */
const collectNames = (items: readonly EditableItem[]): string[] => {
  const names: string[] = [];
  const walk = (nodes: readonly EditableItem[]): void => {
    for (const node of nodes) {
      names.push(node.lines[0]?.name ?? '');
      walk(node.children);
    }
  };
  walk(items);
  return names;
};

describe('estimate-creation/REQ-45.6〜45.9: 表示フックと接続したドリルダウンの階層移動', () => {
  it('階層下げ・階層上げで一覧が実際に切り替わること', async () => {
    render(<DrilldownHarness onSave={noopSave()} />);

    expect(visibleNames()).toEqual(['建築工事', '電気設備工事']);

    // 階層下げ（45.8）
    await userEvent.click(screen.getByRole('button', { name: '建築工事 の子階層を表示' }));
    expect(visibleNames()).toEqual(['直接仮設工事', '土工事']);
    expect(screen.getByTestId('current-level')).toHaveTextContent('root-1');

    await userEvent.click(screen.getByRole('button', { name: '直接仮設工事 の子階層を表示' }));
    expect(visibleNames()).toEqual(['遣り方', '足場']);
    expect(pathLabels()).toEqual(['全体', '建築工事', '直接仮設工事']);

    // 階層上げ（45.9）
    await userEvent.click(screen.getByRole('button', { name: '一つ上の階層へ戻る' }));
    expect(visibleNames()).toEqual(['直接仮設工事', '土工事']);
    expect(pathLabels()).toEqual(['全体', '建築工事']);

    await userEvent.click(screen.getByRole('button', { name: '一つ上の階層へ戻る' }));
    expect(visibleNames()).toEqual(['建築工事', '電気設備工事']);
    expect(screen.getByTestId('current-level')).toHaveTextContent('null');
  });

  it('深い階層から経路のクリックで任意の上位階層へ戻れること（45.7）', async () => {
    render(<DrilldownHarness onSave={noopSave()} />);

    await userEvent.click(screen.getByRole('button', { name: '建築工事 の子階層を表示' }));
    await userEvent.click(screen.getByRole('button', { name: '直接仮設工事 の子階層を表示' }));
    await userEvent.click(screen.getByRole('button', { name: '遣り方 の子階層を表示' }));

    expect(visibleNames()).toEqual(['墨出し']);
    expect(pathLabels()).toEqual(['全体', '建築工事', '直接仮設工事', '遣り方']);

    // 3段戻って第1階層へ（間の階層を経由しない）
    await userEvent.click(screen.getByRole('button', { name: '建築工事' }));
    expect(visibleNames()).toEqual(['直接仮設工事', '土工事']);
    expect(pathLabels()).toEqual(['全体', '建築工事']);

    // さらに「全体」でルート階層へ
    await userEvent.click(screen.getByRole('button', { name: '全体' }));
    expect(visibleNames()).toEqual(['建築工事', '電気設備工事']);
    expect(pathLabels()).toEqual(['全体']);
  });

  it('描画される行が表示フックの visibleKeys と一致すること（導出規則の単一性）', async () => {
    render(<DrilldownHarness onSave={noopSave()} />);

    // 行の内側にある `estimate-item-row`（3行1セットの器）は行キーではないため除く
    const renderedKeys = (): string[] =>
      screen
        .getAllByTestId(/^estimate-item-/)
        .map((el) => el.getAttribute('data-testid')?.replace('estimate-item-', '') ?? '')
        .filter((key) => key !== 'row');

    expect(renderedKeys()).toEqual(screen.getByTestId('visible-keys').textContent?.split(','));

    await userEvent.click(screen.getByRole('button', { name: '建築工事 の子階層を表示' }));
    expect(renderedKeys()).toEqual(['child-1', 'child-2']);
    expect(renderedKeys()).toEqual(screen.getByTestId('visible-keys').textContent?.split(','));
  });

  it('階層移動だけでは未保存の変更が発生しないこと（表示状態のみの変更）', async () => {
    const onSave = noopSave();
    render(<DrilldownHarness onSave={onSave} />);

    expect(screen.getByTestId('is-dirty')).toHaveTextContent('false');

    await userEvent.click(screen.getByRole('button', { name: '建築工事 の子階層を表示' }));
    await userEvent.click(screen.getByRole('button', { name: '一つ上の階層へ戻る' }));

    expect(screen.getByTestId('is-dirty')).toHaveTextContent('false');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('階層を移動しても未保存の編集内容が保持されること', async () => {
    render(<DrilldownHarness onSave={noopSave()} />);

    const nameInput = (testId: string): HTMLInputElement =>
      within(screen.getByTestId(testId)).getByLabelText('名称') as HTMLInputElement;

    await userEvent.clear(nameInput('estimate-item-root-1'));
    await userEvent.type(nameInput('estimate-item-root-1'), '建築工事（改）');
    expect(screen.getByTestId('is-dirty')).toHaveTextContent('true');

    // 子階層へ降りて戻る
    await userEvent.click(screen.getByRole('button', { name: '建築工事（改） の子階層を表示' }));
    expect(screen.queryByTestId('estimate-item-root-1')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '全体' }));

    expect(nameInput('estimate-item-root-1')).toHaveValue('建築工事（改）');
  });

  it('現在階層を降りた状態の保存でも全階層が送られ、表示状態は混入しないこと', async () => {
    const onSave = noopSave();
    render(<DrilldownHarness onSave={onSave} />);

    // 第2階層まで降りてから編集する
    await userEvent.click(screen.getByRole('button', { name: '建築工事 の子階層を表示' }));
    const nameInput = within(screen.getByTestId('estimate-item-child-1')).getByLabelText(
      '名称'
    ) as HTMLInputElement;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '仮設工事');

    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const payload = onSave.mock.calls[0]![0] as EstimateEditorSavePayload;
    // 画面に出ていない階層も含めてツリー全体が送られる
    expect(collectNames(payload.items)).toEqual([
      '建築工事',
      '仮設工事',
      '遣り方',
      '墨出し',
      '足場',
      '土工事',
      '電気設備工事',
    ]);
    expectFreeOfViewState(payload.items);
  });
});
