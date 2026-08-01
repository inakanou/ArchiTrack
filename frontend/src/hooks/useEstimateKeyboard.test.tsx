/**
 * @fileoverview useEstimateKeyboard のテスト
 *
 * Task 54.6: キー割当の定義と解決
 *
 * `EstimateDetailPage.keyboard.test.tsx` が画面一気通貫を固定するのに対し、
 * 本ファイルは画面からは踏みにくい分岐（階層間の移動・端での範囲選択・
 * 取り消しの素通し・無効化）を固定します。
 *
 * Requirements (estimate-creation):
 * - 47.1: キーボード操作のみで行操作と階層移動を実行可能とする
 * - 47.4: ブラウザの標準操作と衝突しない（解決できないキーは `preventDefault` しない）
 * - 47.6: 範囲選択中に固有のキーボード操作を有効にする
 * - 47.8: 行操作はサーバーへの保存を伴わない（本フックは API を import しない）
 *
 * @module hooks/useEstimateKeyboard.test
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEstimateKeyboard } from './useEstimateKeyboard';
import type { EstimateKeyboardCommands } from './useEstimateKeyboard';
import { ESTIMATE_ROW_KEY_ATTRIBUTE } from '../domain/estimate/estimateKeymap';
import type { EstimateViewMode } from './useEstimateNavigation';
import type {
  EditableItem,
  EditableLine,
  EstimateLineType,
  NodeKey,
} from '../domain/estimate/estimateEditReducer.types';

// ============================================================================
// テストデータ・ハーネス
// ============================================================================

const createLine = (lineType: EstimateLineType, name: string): EditableLine => ({
  id: `line-${name}-${lineType}`,
  lineType,
  name,
  specification: null,
  unit: null,
  quantity: null,
  unitPrice: null,
  amount: '1000',
  remarks: null,
  sourceVendorName: null,
});

const createItem = (
  id: string,
  name: string,
  children: readonly EditableItem[] = []
): EditableItem => ({
  id,
  tempId: null,
  itemType: 'STANDARD',
  lines: [createLine('ESTIMATE', name), createLine('EXECUTION', name), createLine('VENDOR', name)],
  children,
});

/** item-a > (item-a1, item-a2), item-b > (item-b1), item-c（葉） */
const createTree = (): readonly EditableItem[] => [
  createItem('item-a', 'A', [createItem('item-a1', 'A1'), createItem('item-a2', 'A2')]),
  createItem('item-b', 'B', [createItem('item-b1', 'B1')]),
  createItem('item-c', 'C'),
];

interface HarnessProps {
  viewMode?: EstimateViewMode;
  currentLevelKey?: NodeKey | null;
  visibleKeys?: readonly NodeKey[];
  selectedKeys?: readonly NodeKey[];
  cursorKey?: NodeKey | null;
  enabled?: boolean;
  commands: EstimateKeyboardCommands;
  onSelectSingle: (key: NodeKey) => void;
  onExtendSelectionTo: (key: NodeKey) => void;
  onClearSelection: () => void;
  onViewModeChange: (mode: EstimateViewMode) => void;
  onCurrentLevelChange: (key: NodeKey | null) => void;
}

function Harness({
  viewMode = 'tree',
  currentLevelKey = null,
  visibleKeys = ['item-a', 'item-b', 'item-c'],
  selectedKeys = [],
  cursorKey = null,
  enabled = true,
  ...handlers
}: HarnessProps) {
  const keyboard = useEstimateKeyboard({
    items: createTree(),
    viewMode,
    currentLevelKey,
    visibleKeys,
    selectedKeys,
    cursorKey,
    enabled,
    ...handlers,
  });

  return (
    <div data-testid="scope" {...keyboard.keyboardProps}>
      {visibleKeys.map((key) => (
        <div
          key={key}
          data-testid={`row-${key}`}
          {...{ [ESTIMATE_ROW_KEY_ATTRIBUTE]: key }}
          tabIndex={-1}
        />
      ))}
    </div>
  );
}

const createHandlers = () => ({
  commands: {
    insertRowAfter: vi.fn(),
    deleteRows: vi.fn(),
    duplicateRows: vi.fn(),
    indentRange: vi.fn(),
    outdentRange: vi.fn(),
  },
  onSelectSingle: vi.fn(),
  onExtendSelectionTo: vi.fn(),
  onClearSelection: vi.fn(),
  onViewModeChange: vi.fn(),
  onCurrentLevelChange: vi.fn(),
});

/** キーを押し、`preventDefault` されたか（＝処理されたか）を返す */
const pressOn = (
  element: HTMLElement,
  init: { key: string; altKey?: boolean; shiftKey?: boolean; ctrlKey?: boolean; code?: string }
): boolean => !fireEvent.keyDown(element, init);

const rowOf = (key: NodeKey): HTMLElement => screen.getByTestId(`row-${key}`);

// ============================================================================
// テスト
// ============================================================================

describe('useEstimateKeyboard', () => {
  /** @requirement estimate-creation/REQ-47.1 */
  it('ドリルダウン表示で前後の階層へ移動できる (47.1)', () => {
    const handlers = createHandlers();
    render(
      <Harness
        {...handlers}
        viewMode="drilldown"
        currentLevelKey="item-a"
        visibleKeys={['item-a1', 'item-a2']}
      />
    );

    expect(pressOn(rowOf('item-a1'), { key: 'PageDown', altKey: true, shiftKey: true })).toBe(true);
    expect(handlers.onCurrentLevelChange).toHaveBeenCalledWith('item-b');

    handlers.onCurrentLevelChange.mockClear();
    expect(pressOn(rowOf('item-a1'), { key: 'PageUp', altKey: true, shiftKey: true })).toBe(false);
    expect(handlers.onCurrentLevelChange).not.toHaveBeenCalled();
  });

  /** @requirement estimate-creation/REQ-47.1 */
  it('ツリー表示では階層の出入りのキーが働かない (47.1)', () => {
    const handlers = createHandlers();
    render(<Harness {...handlers} viewMode="tree" />);

    expect(pressOn(rowOf('item-a'), { key: 'ArrowDown', altKey: true })).toBe(false);
    expect(pressOn(rowOf('item-a'), { key: 'ArrowUp', altKey: true })).toBe(false);
    expect(handlers.onCurrentLevelChange).not.toHaveBeenCalled();
  });

  /** @requirement estimate-creation/REQ-47.1 */
  it('子を持たない行では階層を下げない (47.1)', () => {
    const handlers = createHandlers();
    render(<Harness {...handlers} viewMode="drilldown" />);

    expect(pressOn(rowOf('item-c'), { key: 'ArrowDown', altKey: true })).toBe(false);
    expect(handlers.onCurrentLevelChange).not.toHaveBeenCalled();

    expect(pressOn(rowOf('item-a'), { key: 'ArrowDown', altKey: true })).toBe(true);
    expect(handlers.onCurrentLevelChange).toHaveBeenCalledWith('item-a');
  });

  /** @requirement estimate-creation/REQ-47.1 */
  it('階層内の先頭行・末尾行へカーソルを移せる (47.1)', () => {
    const handlers = createHandlers();
    render(<Harness {...handlers} />);

    expect(pressOn(rowOf('item-b'), { key: 'PageDown', altKey: true })).toBe(true);
    expect(handlers.onSelectSingle).toHaveBeenCalledWith('item-c');

    handlers.onSelectSingle.mockClear();
    expect(pressOn(rowOf('item-b'), { key: 'PageUp', altKey: true })).toBe(true);
    expect(handlers.onSelectSingle).toHaveBeenCalledWith('item-a');
  });

  /** @requirement estimate-creation/REQ-47.6 */
  it('表示の端では範囲選択を広げない (47.6)', () => {
    const handlers = createHandlers();
    render(<Harness {...handlers} selectedKeys={[]} cursorKey="item-c" />);

    expect(pressOn(rowOf('item-c'), { key: 'ArrowDown', shiftKey: true })).toBe(true);
    expect(handlers.onExtendSelectionTo).not.toHaveBeenCalled();
    expect(handlers.onSelectSingle).not.toHaveBeenCalled();
  });

  /** @requirement estimate-creation/REQ-47.6 */
  it('範囲選択中の削除は範囲全体を対象にし、選択を解除する (47.6)', () => {
    const handlers = createHandlers();
    render(<Harness {...handlers} selectedKeys={['item-a', 'item-b']} />);

    // 対象は「フォーカスのある行」ではなく選択範囲
    expect(pressOn(rowOf('item-c'), { key: 'Delete', altKey: true })).toBe(true);
    expect(handlers.commands.deleteRows).toHaveBeenCalledWith(['item-a', 'item-b']);
    expect(handlers.onClearSelection).toHaveBeenCalled();
  });

  /**
   * 取り消し・やり直しの実装は 54.8。ここで握り潰すと二重配線になるため素通しする。
   *
   * @requirement estimate-creation/REQ-47.4
   */
  it('取り消し・やり直しのキーは横取りせず素通しする (47.4)', () => {
    const handlers = createHandlers();
    render(<Harness {...handlers} />);

    expect(pressOn(rowOf('item-a'), { key: 'z', ctrlKey: true, code: 'KeyZ' })).toBe(false);
    expect(pressOn(rowOf('item-a'), { key: 'y', ctrlKey: true, code: 'KeyY' })).toBe(false);
    expect(handlers.commands.deleteRows).not.toHaveBeenCalled();
    expect(handlers.onClearSelection).not.toHaveBeenCalled();
  });

  /** @requirement estimate-creation/REQ-47.4 */
  it('割当の無いキーは preventDefault しない (47.4)', () => {
    const handlers = createHandlers();
    render(<Harness {...handlers} />);

    expect(pressOn(rowOf('item-a'), { key: 'Tab' })).toBe(false);
    expect(pressOn(rowOf('item-a'), { key: 'ArrowDown' })).toBe(false);
  });

  /** @requirement estimate-creation/REQ-47.1 */
  it('明細の外にフォーカスがある場合は行操作を実行しない (47.1)', () => {
    const handlers = createHandlers();
    render(<Harness {...handlers} />);

    expect(pressOn(screen.getByTestId('scope'), { key: 'Insert', altKey: true })).toBe(false);
    expect(handlers.commands.insertRowAfter).not.toHaveBeenCalled();
  });

  /** @requirement estimate-creation/REQ-47.1 */
  it('無効化されている間はどのキーも実行しない (47.1)', () => {
    const handlers = createHandlers();
    render(<Harness {...handlers} enabled={false} />);

    expect(pressOn(rowOf('item-a'), { key: 'Insert', altKey: true })).toBe(false);
    expect(handlers.commands.insertRowAfter).not.toHaveBeenCalled();
  });
});
