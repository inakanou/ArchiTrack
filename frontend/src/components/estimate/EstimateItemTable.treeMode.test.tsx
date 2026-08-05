/**
 * @fileoverview EstimateItemTable ツリー表示モードのテスト（Task 54.2）
 *
 * ツリー表示（既定モード）における展開・折りたたみとインデント表示を検証します。
 * 折りたたみ状態は `useEstimateNavigation` が単独で所有する**表示状態**であり、
 * 編集状態（保存対象）には一切影響しないことを実フック経由で検証します。
 *
 * Requirements (estimate-creation):
 * - 2.6: 項目の階層レベルをインデント表示で視覚的に区別する
 * - 2.7: 親項目を展開または折りたたむ場合、子項目の表示/非表示を切り替える
 * - 45.3: ツリー表示では全階層をインデント付きで一覧表示する
 * - 45.4: ツリー表示では子項目を持つ項目に展開/折りたたみの操作を提供する
 * - 45.5: 項目を折りたたんだ場合、その子孫項目を非表示にする
 *
 * Design: design.md `#### 階層表示モードの状態遷移（45.1〜45.11）`,
 * `EstimateItemTable.tsx  # 改修: ツリー表示 / ドリルダウン表示の2モード`
 *
 * @module components/estimate/EstimateItemTable.treeMode.test
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
 * 3階層のツリー
 *
 * - 建築工事（root-1）
 *   - 直接仮設工事（child-1）
 *     - 遣り方（grandchild-1）
 *   - 土工事（child-2）
 * - 電気設備工事（root-2、子なし）
 */
const createThreeLevelTree = (): EstimateItemHierarchyEdit[] => [
  createItem('root-1', '建築工事', '1000000', [
    createItem('child-1', '直接仮設工事', '500000', [
      createItem('grandchild-1', '遣り方', '200000'),
    ]),
    createItem('child-2', '土工事', '300000'),
  ]),
  createItem('root-2', '電気設備工事', '400000'),
];

/** 描画されている名称欄の値を表示順で取得する */
const visibleNames = (): string[] =>
  (screen.getAllByLabelText('名称') as HTMLInputElement[]).map((input) => input.value);

// ============================================================================
// ツリー表示の展開と折りたたみ
// ============================================================================

describe('estimate-creation/REQ-45.3: ツリー表示は全階層をインデント付きで一覧表示する', () => {
  it('折りたたみが無い場合、孫階層まで含めた全項目が表示順に描画されること', () => {
    render(<EstimateItemTable items={createThreeLevelTree()} collapsedKeys={new Set()} />);

    expect(visibleNames()).toEqual([
      '建築工事',
      '直接仮設工事',
      '遣り方',
      '土工事',
      '電気設備工事',
    ]);
  });

  it('collapsedKeys を省略した場合も全階層が表示されること（既定は折りたたみなし）', () => {
    render(<EstimateItemTable items={createThreeLevelTree()} />);

    expect(visibleNames()).toContain('遣り方');
  });
});

describe('estimate-creation/REQ-45.4: 子項目を持つ項目に展開・折りたたみの操作を提供する', () => {
  it('子を持つ項目にのみ展開・折りたたみボタンが描画されること', () => {
    render(<EstimateItemTable items={createThreeLevelTree()} collapsedKeys={new Set()} />);

    // 子を持つ root-1 / child-1 にはボタンがある
    const rootButton = within(screen.getByTestId('estimate-item-root-1')).getByRole('button', {
      name: '折りたたむ',
    });
    expect(rootButton).toBeInTheDocument();
    expect(rootButton).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(screen.getByTestId('estimate-item-child-1')).getByRole('button', {
        name: '折りたたむ',
      })
    ).toBeInTheDocument();

    // 葉である grandchild-1 / child-2 / root-2 にはボタンがない
    for (const leafId of [
      'estimate-item-grandchild-1',
      'estimate-item-child-2',
      'estimate-item-root-2',
    ]) {
      expect(
        within(screen.getByTestId(leafId)).queryByRole('button', { name: /折りたたむ|展開する/ })
      ).not.toBeInTheDocument();
    }
  });

  it('折りたたみボタンのクリックで onToggleCollapsed が当該項目のキーで呼ばれること', async () => {
    const onToggleCollapsed = vi.fn();
    render(
      <EstimateItemTable
        items={createThreeLevelTree()}
        collapsedKeys={new Set()}
        onToggleCollapsed={onToggleCollapsed}
      />
    );

    await userEvent.click(
      within(screen.getByTestId('estimate-item-child-1')).getByRole('button', {
        name: '折りたたむ',
      })
    );

    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    expect(onToggleCollapsed).toHaveBeenCalledWith('child-1');
  });

  it('折りたたみ中の項目のボタンは「展開する」として描画され、クリックで同じキーを通知すること', async () => {
    const onToggleCollapsed = vi.fn();
    render(
      <EstimateItemTable
        items={createThreeLevelTree()}
        collapsedKeys={new Set(['root-1'])}
        onToggleCollapsed={onToggleCollapsed}
      />
    );

    const expandButton = within(screen.getByTestId('estimate-item-root-1')).getByRole('button', {
      name: '展開する',
    });
    // 支援技術へも展開状態を伝える
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(expandButton);

    expect(onToggleCollapsed).toHaveBeenCalledWith('root-1');
  });

  it('展開・折りたたみボタンのクリックでは項目選択が発生しないこと', async () => {
    const onItemSelect = vi.fn();
    render(
      <EstimateItemTable
        items={createThreeLevelTree()}
        collapsedKeys={new Set()}
        onToggleCollapsed={vi.fn()}
        onItemSelect={onItemSelect}
      />
    );

    await userEvent.click(
      within(screen.getByTestId('estimate-item-root-1')).getByRole('button', { name: '折りたたむ' })
    );

    expect(onItemSelect).not.toHaveBeenCalled();
  });
});

describe('estimate-creation/REQ-45.5: 折りたたんだ項目の子孫を非表示にする', () => {
  it('中間階層を折りたたむと、その子だけでなく孫も非表示になること', () => {
    render(
      <EstimateItemTable items={createThreeLevelTree()} collapsedKeys={new Set(['child-1'])} />
    );

    const names = visibleNames();
    expect(names).toContain('建築工事');
    expect(names).toContain('直接仮設工事');
    expect(names).not.toContain('遣り方');
    // 兄弟は影響を受けない
    expect(names).toContain('土工事');
    expect(names).toContain('電気設備工事');
  });

  it('ルート項目を折りたたむと配下の全子孫が非表示になること', () => {
    render(
      <EstimateItemTable items={createThreeLevelTree()} collapsedKeys={new Set(['root-1'])} />
    );

    expect(visibleNames()).toEqual(['建築工事', '電気設備工事']);
  });

  it('折りたたみキーは複数同時に反映されること', () => {
    render(
      <EstimateItemTable
        items={createThreeLevelTree()}
        collapsedKeys={new Set(['root-1', 'child-1'])}
      />
    );

    expect(visibleNames()).toEqual(['建築工事', '電気設備工事']);
  });
});

describe('estimate-creation/REQ-2.6: 階層レベルをインデント表示で視覚的に区別する', () => {
  it('階層の深さに比例したインデントが適用されること', () => {
    render(<EstimateItemTable items={createThreeLevelTree()} collapsedKeys={new Set()} />);

    expect(screen.getByTestId('estimate-item-root-1')).toHaveStyle({ paddingLeft: '0px' });
    expect(screen.getByTestId('estimate-item-child-1')).toHaveStyle({ paddingLeft: '16px' });
    expect(screen.getByTestId('estimate-item-grandchild-1')).toHaveStyle({ paddingLeft: '32px' });
    expect(screen.getByTestId('estimate-item-child-2')).toHaveStyle({ paddingLeft: '16px' });
    expect(screen.getByTestId('estimate-item-root-2')).toHaveStyle({ paddingLeft: '0px' });
  });

  it('折りたたみで表示行が変わってもインデントは階層の深さを保つこと', () => {
    render(
      <EstimateItemTable items={createThreeLevelTree()} collapsedKeys={new Set(['child-1'])} />
    );

    expect(screen.getByTestId('estimate-item-child-1')).toHaveStyle({ paddingLeft: '16px' });
    expect(screen.getByTestId('estimate-item-child-2')).toHaveStyle({ paddingLeft: '16px' });
  });
});

// ============================================================================
// 折りたたみ状態は表示状態であり編集内容に影響しない（2.7 / 45.10）
// ============================================================================

/**
 * 実フック（useEstimateEditor + useEstimateNavigation）と実コンポーネントを接続した検証用画面
 *
 * テーブルをモックせず、実際の DOM 操作から保存ペイロードまでを一気通貫で検証する。
 */
function TreeModeHarness({
  onSave,
}: {
  onSave: (payload: EstimateEditorSavePayload) => Promise<void>;
}) {
  const editor = useEstimateEditor({
    estimateId: 'estimate-1',
    initialItems: createThreeLevelTree(),
    onSave,
  });
  const navigation = useEstimateNavigation({ items: editor.editState.items });

  return (
    <div>
      <div data-testid="is-dirty">{String(editor.isDirty)}</div>
      <button type="button" onClick={() => void editor.save()}>
        保存
      </button>
      <EstimateItemTable
        items={editor.items}
        collapsedKeys={navigation.collapsedKeys}
        onToggleCollapsed={navigation.toggleCollapsed}
        onLineChange={editor.updateLine}
      />
    </div>
  );
}

/**
 * 表示状態のキー（保存ペイロードへ混ざってはいけないもの）
 *
 * 折りたたみ・表示モード・選択・カーソルはすべて `useEstimateNavigation` が単独で
 * 所有する表示状態であり、保存対象の編集ツリーには存在しない（45.10）。
 */
const VIEW_STATE_KEYS = [
  'isExpanded',
  'collapsedKeys',
  'viewMode',
  'selectedKeys',
  'cursor',
] as const;

/** 保存対象ノードが持ってよいキー（`EditableItem` の全項目） */
const EDITABLE_ITEM_KEYS = ['children', 'id', 'itemType', 'lines', 'tempId'];

/**
 * ペイロードの全階層に表示状態が混入していないことを検証する
 *
 * 構造的部分型では余剰キーが型検査で弾かれないため、キー集合の完全一致で押さえる。
 * ルートだけでなく子孫まで再帰的に確認する。
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

describe('estimate-creation/REQ-2.7: 折りたたみ状態が表示状態として保持され、編集内容に影響しない', () => {
  it('折りたたみ操作だけでは未保存の変更（isDirty）が発生しないこと', async () => {
    const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>(async () => {});
    render(<TreeModeHarness onSave={onSave} />);

    expect(screen.getByTestId('is-dirty')).toHaveTextContent('false');

    await userEvent.click(
      within(screen.getByTestId('estimate-item-root-1')).getByRole('button', { name: '折りたたむ' })
    );

    expect(visibleNames()).toEqual(['建築工事', '電気設備工事']);
    expect(screen.getByTestId('is-dirty')).toHaveTextContent('false');

    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('折りたたみと再展開を挟んでも未保存の編集内容が保持されること', async () => {
    const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>(async () => {});
    render(<TreeModeHarness onSave={onSave} />);

    const targetInput = () =>
      within(screen.getByTestId('estimate-item-grandchild-1')).getByLabelText(
        '名称'
      ) as HTMLInputElement;

    await userEvent.clear(targetInput());
    await userEvent.type(targetInput(), '遣り方（改）');
    expect(targetInput()).toHaveValue('遣り方（改）');

    // 折りたたむと孫は DOM から消える
    await userEvent.click(
      within(screen.getByTestId('estimate-item-child-1')).getByRole('button', {
        name: '折りたたむ',
      })
    );
    expect(screen.queryByTestId('estimate-item-grandchild-1')).not.toBeInTheDocument();

    // 再展開すると編集内容がそのまま残っている
    await userEvent.click(
      within(screen.getByTestId('estimate-item-child-1')).getByRole('button', { name: '展開する' })
    );
    expect(targetInput()).toHaveValue('遣り方（改）');
  });

  it('折りたたみ中でも保存ペイロードに全階層と編集内容が含まれること', async () => {
    const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>(async () => {});
    render(<TreeModeHarness onSave={onSave} />);

    const targetInput = () =>
      within(screen.getByTestId('estimate-item-grandchild-1')).getByLabelText(
        '名称'
      ) as HTMLInputElement;

    await userEvent.clear(targetInput());
    await userEvent.type(targetInput(), '遣り方（改）');

    await userEvent.click(
      within(screen.getByTestId('estimate-item-root-1')).getByRole('button', { name: '折りたたむ' })
    );
    expect(screen.getByTestId('is-dirty')).toHaveTextContent('true');

    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]![0] as EstimateEditorSavePayload;
    expect(collectNames(payload.items)).toEqual([
      '建築工事',
      '直接仮設工事',
      '遣り方（改）',
      '土工事',
      '電気設備工事',
    ]);

    // 折りたたみは表示状態のみ。ペイロードのどの階層にも表示状態は載らない（45.10）
    expectFreeOfViewState(payload.items);
  });
});
