/**
 * @fileoverview EstimateItemTable ドラッグ&ドロップ並び替えのテスト（Task 53.16）
 *
 * 明細行のドラッグ操作から並び替えの通知までを、**子コンポーネントを差し替えずに**
 * 検証します。`EstimateItemTable` は `onDragStart` / `onDrop` を props として公開して
 * いましたが、行要素に DOM ハンドラが一切配線されておらず、画面からドラッグしても
 * 並び替えが起きない状態でした（行には `draggable="true"` だけが付いていた）。
 *
 * そのため本テストは以下を必須の観点として持ちます。
 *
 * 1. テーブルをモックせず、実際の DOM へドラッグイベントを発火させる
 * 2. `dragover` の `preventDefault()` を明示的に固定する
 *    （実ブラウザはこれが無いと `drop` を発火しない。Playwright の合成イベントは
 *     preventDefault が無くても drop するため、E2E では守れない）
 * 3. ツリー表示・ドリルダウン表示の**両モード**で同じ扱いになること
 *
 * Requirements (estimate-creation):
 * - REQ-12.2: 見積項目の表示順序をドラッグ&ドロップで変更可能とする
 * - REQ-12.8: ドラッグ&ドロップの順序変更を保存すると再読み込み後も維持する
 * - REQ-34.5: 並び順の変更を保存し、再読み込み後も変更後の構造で表示する
 * - REQ-43.1: 並び替え・ドラッグ&ドロップはサーバー保存を伴わず画面上で完結する
 *
 * @module components/estimate/EstimateItemTable.dragAndDrop.test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, createEvent, waitFor } from '@testing-library/react';
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

/** 同一階層に並ぶ3項目（どちらの表示モードでも同時に一覧される） */
const createFlatItems = (): EstimateItemHierarchyEdit[] => [
  createItem('root-1', '建築工事', '1000000'),
  createItem('root-2', '電気設備工事', '400000'),
  createItem('root-3', '給排水衛生設備工事', '300000'),
];

/** 描画されている名称欄の値を表示順で取得する */
const visibleNames = (): string[] =>
  (screen.getAllByLabelText('名称') as HTMLInputElement[]).map((input) => input.value);

// ============================================================================
// ドラッグ操作のヘルパー
// ============================================================================

/**
 * jsdom には DataTransfer が無いため、ドラッグ間で値を運ぶ最小の代替を用意する
 *
 * 実ブラウザと同じく `setData` / `getData` と `effectAllowed` / `dropEffect` を持つ。
 */
interface DataTransferStub {
  setData: (key: string, value: string) => void;
  getData: (key: string) => string;
  effectAllowed: string;
  dropEffect: string;
}

const createDataTransfer = (): DataTransferStub => {
  const store = new Map<string, string>();
  return {
    setData: (key, value) => {
      store.set(key, value);
    },
    getData: (key) => store.get(key) ?? '',
    effectAllowed: '',
    dropEffect: '',
  };
};

const rowOf = (itemId: string): HTMLElement => screen.getByTestId(`estimate-item-${itemId}`);

/**
 * 行から行へのドラッグ操作一式を発火する
 *
 * 実ブラウザの発火順（dragstart → dragover → drop → dragend）に合わせる。
 *
 * @returns 発火した dragover イベント（preventDefault の検証に用いる）
 */
const dragRowOnto = (
  sourceItemId: string,
  targetItemId: string
): { dragOverEvent: Event; dataTransfer: DataTransferStub } => {
  const dataTransfer = createDataTransfer();
  const source = rowOf(sourceItemId);
  const target = rowOf(targetItemId);

  fireEvent.dragStart(source, { dataTransfer });
  const dragOverEvent = createEvent.dragOver(target, { dataTransfer });
  fireEvent(target, dragOverEvent);
  fireEvent.drop(target, { dataTransfer });
  fireEvent.dragEnd(source, { dataTransfer });

  return { dragOverEvent, dataTransfer };
};

// ============================================================================
// ツリー表示モード（既定）
// ============================================================================

describe('estimate-creation/REQ-12.2: ツリー表示の行をドラッグ&ドロップで並び替えられる', () => {
  it('別の行へドロップした場合、ドラッグ元と対象の識別子で onDrop が通知されること', () => {
    const onDrop = vi.fn();
    render(<EstimateItemTable items={createFlatItems()} draggable={true} onDrop={onDrop} />);

    dragRowOnto('root-1', 'root-3');

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith('root-1', 'root-3');
  });

  it('ドラッグ開始時にドラッグ元の識別子で onDragStart が通知され、転送データに載ること', () => {
    const onDragStart = vi.fn();
    render(
      <EstimateItemTable items={createFlatItems()} draggable={true} onDragStart={onDragStart} />
    );

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(rowOf('root-2'), { dataTransfer });

    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragStart).toHaveBeenCalledWith('root-2');
    expect(dataTransfer.getData('text/plain')).toBe('root-2');
    expect(dataTransfer.effectAllowed).toBe('move');
  });

  it('自分自身へドロップした場合は並び替えが通知されないこと', () => {
    const onDrop = vi.fn();
    render(<EstimateItemTable items={createFlatItems()} draggable={true} onDrop={onDrop} />);

    dragRowOnto('root-2', 'root-2');

    expect(onDrop).not.toHaveBeenCalled();
  });

  it('転送データが空でもドラッグ元を保持しており、並び替えが通知されること', () => {
    const onDrop = vi.fn();
    render(<EstimateItemTable items={createFlatItems()} draggable={true} onDrop={onDrop} />);

    // dataTransfer を共有しない＝ドロップ時に getData が空になる状況
    fireEvent.dragStart(rowOf('root-3'), { dataTransfer: createDataTransfer() });
    fireEvent.drop(rowOf('root-1'), { dataTransfer: createDataTransfer() });

    expect(onDrop).toHaveBeenCalledWith('root-3', 'root-1');
  });

  it('ドラッグ終了後はドラッグ元が破棄され、単独のドロップでは通知されないこと', () => {
    const onDrop = vi.fn();
    render(<EstimateItemTable items={createFlatItems()} draggable={true} onDrop={onDrop} />);

    fireEvent.dragStart(rowOf('root-1'), { dataTransfer: createDataTransfer() });
    fireEvent.dragEnd(rowOf('root-1'), { dataTransfer: createDataTransfer() });
    fireEvent.drop(rowOf('root-2'), { dataTransfer: createDataTransfer() });

    expect(onDrop).not.toHaveBeenCalled();
  });
});

describe('estimate-creation/REQ-12.2: dragover の既定動作を打ち消してドロップを受け付ける', () => {
  it('ツリー表示の行の dragover が preventDefault されること（実ブラウザの drop 発火条件）', () => {
    render(<EstimateItemTable items={createFlatItems()} draggable={true} onDrop={vi.fn()} />);

    const dataTransfer = createDataTransfer();
    const dragOverEvent = createEvent.dragOver(rowOf('root-2'), { dataTransfer });
    fireEvent(rowOf('root-2'), dragOverEvent);

    expect(dragOverEvent.defaultPrevented).toBe(true);
    expect(dataTransfer.dropEffect).toBe('move');
  });

  it('ドリルダウン表示の行の dragover が preventDefault されること', () => {
    render(
      <EstimateItemTable
        items={createFlatItems()}
        viewMode="drilldown"
        draggable={true}
        onDrop={vi.fn()}
      />
    );

    const dataTransfer = createDataTransfer();
    const dragOverEvent = createEvent.dragOver(rowOf('root-2'), { dataTransfer });
    fireEvent(rowOf('root-2'), dragOverEvent);

    expect(dragOverEvent.defaultPrevented).toBe(true);
    expect(dataTransfer.dropEffect).toBe('move');
  });

  it('ドラッグ不可の場合は dragover の既定動作を打ち消さないこと', () => {
    render(<EstimateItemTable items={createFlatItems()} draggable={false} onDrop={vi.fn()} />);

    const dragOverEvent = createEvent.dragOver(rowOf('root-2'), {
      dataTransfer: createDataTransfer(),
    });
    fireEvent(rowOf('root-2'), dragOverEvent);

    expect(dragOverEvent.defaultPrevented).toBe(false);
  });
});

// ============================================================================
// ドリルダウン表示モード
// ============================================================================

describe('estimate-creation/REQ-12.2: ドリルダウン表示の行も同じ扱いで並び替えられる', () => {
  it('別の行へドロップした場合、ドラッグ元と対象の識別子で onDrop が通知されること', () => {
    const onDrop = vi.fn();
    render(
      <EstimateItemTable
        items={createFlatItems()}
        viewMode="drilldown"
        draggable={true}
        onDrop={onDrop}
      />
    );

    dragRowOnto('root-3', 'root-1');

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith('root-3', 'root-1');
  });

  it('自分自身へドロップした場合は並び替えが通知されないこと', () => {
    const onDrop = vi.fn();
    render(
      <EstimateItemTable
        items={createFlatItems()}
        viewMode="drilldown"
        draggable={true}
        onDrop={onDrop}
      />
    );

    dragRowOnto('root-1', 'root-1');

    expect(onDrop).not.toHaveBeenCalled();
  });
});

// ============================================================================
// ドラッグ不可の場合
// ============================================================================

describe('estimate-creation/REQ-12.2: ドラッグ可能でない場合はドラッグ操作を受け付けない', () => {
  it.each([
    ['tree' as const, 'ツリー表示'],
    ['drilldown' as const, 'ドリルダウン表示'],
  ])(
    '%s（%s）で draggable=false の行はドラッグ属性を持たず通知もしないこと',
    (viewMode, _label) => {
      const onDragStart = vi.fn();
      const onDrop = vi.fn();
      render(
        <EstimateItemTable
          items={createFlatItems()}
          viewMode={viewMode}
          draggable={false}
          onDragStart={onDragStart}
          onDrop={onDrop}
        />
      );

      expect(rowOf('root-1')).toHaveAttribute('draggable', 'false');

      dragRowOnto('root-1', 'root-3');

      expect(onDragStart).not.toHaveBeenCalled();
      expect(onDrop).not.toHaveBeenCalled();
    }
  );
});

// ============================================================================
// 実フック接続（43.1 / 12.8 / 34.5）
// ============================================================================

/**
 * 実フック（useEstimateEditor + useEstimateNavigation）と実コンポーネントを接続した検証用画面
 *
 * テーブルをモックせず、実際のドラッグ操作から保存ペイロードまでを一気通貫で検証する。
 */
function DragHarness({
  onSave,
}: {
  onSave: (payload: EstimateEditorSavePayload) => Promise<void>;
}) {
  const editor = useEstimateEditor({
    estimateId: 'estimate-1',
    initialItems: createFlatItems(),
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
        draggable={true}
        collapsedKeys={navigation.collapsedKeys}
        onToggleCollapsed={navigation.toggleCollapsed}
        onLineChange={editor.updateLine}
        onDrop={editor.reorderItems}
      />
    </div>
  );
}

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

describe('estimate-creation/REQ-43.1: ドラッグ&ドロップの並び替えはサーバー保存を伴わずに反映される', () => {
  it('画面のドラッグ操作だけで表示順が入れ替わり、保存が発生しないこと', () => {
    const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>(async () => {});
    render(<DragHarness onSave={onSave} />);

    expect(visibleNames()).toEqual(['建築工事', '電気設備工事', '給排水衛生設備工事']);

    dragRowOnto('root-1', 'root-3');

    expect(visibleNames()).toEqual(['電気設備工事', '給排水衛生設備工事', '建築工事']);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('estimate-creation/REQ-12.8, REQ-34.5: ドラッグ&ドロップの順序が保存対象に載る', () => {
  it('ドラッグで並び替えた後の保存ペイロードが変更後の順序になっていること', async () => {
    const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>(async () => {});
    render(<DragHarness onSave={onSave} />);

    dragRowOnto('root-3', 'root-1');

    expect(screen.getByTestId('is-dirty')).toHaveTextContent('true');

    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]![0] as EstimateEditorSavePayload;
    expect(collectNames(payload.items)).toEqual(['給排水衛生設備工事', '建築工事', '電気設備工事']);
  });
});
