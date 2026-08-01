/**
 * @fileoverview EstimateItemToolbar の範囲選択統合テスト
 *
 * Task 54.10: ツールバーへの範囲選択・モード切替・取り消しの統合
 *
 * 既存の `EstimateItemToolbar.test.tsx` が「単一選択のツールバー」を固定しているのに対し、
 * 本ファイルは 54.10 で加わる**範囲選択との統合**だけを対象にする。
 *
 * Requirements (estimate-creation):
 * - 23.3: 見積項目を選択した場合、選択項目に対する操作ボタンを有効化する
 * - 23.8: 未選択の場合、選択が必要な操作ボタンを無効化状態で表示する
 * - 23.9: 「上の階層へ移動」ボタンを提供し、選択中の項目を現在の親の兄弟レベルに移動する
 * - 23.10: 「下の階層へ移動」ボタンを提供し、Requirement 44 のネスト化ルールに従って階層を1段下げる
 * - 23.11: ツールバーの各操作に対応するキーボード操作を Requirement 47 に従って提供する
 * - 44.3: 複数行が選択されている場合、削除・複写・階層の上げ下げを選択範囲全体に適用する
 * - 44.4: 「下の階層へ移動」は選択範囲の先頭行を親とし、残りをその子として配置する
 * - 44.8: 複数行が選択されている場合、選択中の行数を画面上に表示する
 *
 * @module __tests__/components/estimate/EstimateItemToolbar.rangeSelection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EstimateItemToolbar } from '../../../components/estimate/EstimateItemToolbar';
import { ESTIMATE_KEYMAP } from '../../../domain/estimate/estimateKeymap';
import type { KeymapEntry, KeymapModifier } from '../../../domain/estimate/estimateKeymap';
import type { EstimateItemHierarchyEdit } from '../../../hooks/useEstimateEditor';
import type { EstimateViewMode } from '../../../hooks/useEstimateNavigation';

// ============================================================================
// テストデータ
// ============================================================================

const createItem = (
  overrides: Partial<EstimateItemHierarchyEdit> = {}
): EstimateItemHierarchyEdit =>
  ({
    id: 'item-b',
    estimateId: 'est-1',
    parentId: null,
    displayOrder: 0,
    lines: [],
    children: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }) as EstimateItemHierarchyEdit;

const onAddItem = vi.fn();
const onAddChildItem = vi.fn();
const onAddDiscountItem = vi.fn();
const onAddNoteItem = vi.fn();
const onDeleteItems = vi.fn();
const onDuplicateItems = vi.fn();
const onMoveUpItems = vi.fn();
const onMoveDownItems = vi.fn();
const onReorderUp = vi.fn();
const onReorderDown = vi.fn();
const onViewModeChange = vi.fn();
const onUndo = vi.fn();
const onRedo = vi.fn();

const defaultProps = {
  selectedKeys: [] as readonly string[],
  selectedItem: null as EstimateItemHierarchyEdit | null,
  hasPreviousSibling: false,
  onAddItem,
  onAddChildItem,
  onAddDiscountItem,
  onAddNoteItem,
  onDeleteItems,
  onDuplicateItems,
  onMoveUpItems,
  onMoveDownItems,
  onReorderUp,
  onReorderDown,
  canReorderUp: false,
  canReorderDown: false,
  viewMode: 'tree' as EstimateViewMode,
  onViewModeChange,
  canUndo: false,
  canRedo: false,
  onUndo,
  onRedo,
};

const renderToolbar = (overrides: Partial<typeof defaultProps> = {}) =>
  render(<EstimateItemToolbar {...defaultProps} {...overrides} />);

const toolbar = (): HTMLElement => screen.getByTestId('estimate-item-toolbar');

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// 選択中の行数の表示（44.8）
// ============================================================================

describe('選択中の行数の表示 (44.8)', () => {
  /** @requirement estimate-creation/REQ-44.8 */
  it('複数行が選択されている場合に選択中の行数を表示すること (44.8)', () => {
    renderToolbar({
      selectedKeys: ['item-b', 'item-c'],
      selectedItem: createItem({ id: 'item-b' }),
    });

    expect(screen.getByTestId('selected-row-count')).toHaveTextContent('2行を選択中');
  });

  /** @requirement estimate-creation/REQ-44.8 */
  it('選択行数の表示が実際の選択行数に追従すること (44.8)', () => {
    const { rerender } = renderToolbar({
      selectedKeys: ['item-b', 'item-c'],
      selectedItem: createItem({ id: 'item-b' }),
    });
    expect(screen.getByTestId('selected-row-count')).toHaveTextContent('2行を選択中');

    rerender(
      <EstimateItemToolbar
        {...defaultProps}
        selectedKeys={['item-b', 'item-c', 'item-d']}
        selectedItem={createItem({ id: 'item-b' })}
      />
    );

    expect(screen.getByTestId('selected-row-count')).toHaveTextContent('3行を選択中');
  });

  /** @requirement estimate-creation/REQ-44.8 */
  it('単一選択・未選択では行数を表示しないこと (44.8)', () => {
    const { rerender } = renderToolbar({ selectedKeys: [] });
    expect(screen.queryByTestId('selected-row-count')).not.toBeInTheDocument();

    rerender(
      <EstimateItemToolbar
        {...defaultProps}
        selectedKeys={['item-b']}
        selectedItem={createItem({ id: 'item-b' })}
      />
    );
    expect(screen.queryByTestId('selected-row-count')).not.toBeInTheDocument();
  });
});

// ============================================================================
// 範囲操作の適用範囲（23.3, 44.3）
// ============================================================================

describe('範囲選択中の操作の適用範囲 (23.3, 44.3)', () => {
  const rangeProps = {
    selectedKeys: ['item-b', 'item-c'] as readonly string[],
    selectedItem: createItem({ id: 'item-b', parentId: 'item-a' }),
    hasPreviousSibling: true,
    canReorderUp: true,
    canReorderDown: true,
  };

  /** @requirement estimate-creation/REQ-44.3 */
  it('削除が選択範囲全体を対象に通知されること (44.3)', async () => {
    const user = userEvent.setup();
    renderToolbar(rangeProps);

    await user.click(within(toolbar()).getByRole('button', { name: /削除/ }));

    expect(onDeleteItems).toHaveBeenCalledTimes(1);
    expect(onDeleteItems).toHaveBeenCalledWith(['item-b', 'item-c']);
  });

  /** @requirement estimate-creation/REQ-44.3 */
  it('複製が選択範囲全体を対象に通知されること (44.3)', async () => {
    const user = userEvent.setup();
    renderToolbar(rangeProps);

    await user.click(within(toolbar()).getByRole('button', { name: /複製/ }));

    expect(onDuplicateItems).toHaveBeenCalledTimes(1);
    expect(onDuplicateItems).toHaveBeenCalledWith(['item-b', 'item-c']);
  });

  /** @requirement estimate-creation/REQ-23.9 */
  it('上の階層へ移動が選択範囲全体を表示順のまま通知されること (23.9, 44.3, 44.5)', async () => {
    const user = userEvent.setup();
    renderToolbar(rangeProps);

    await user.click(within(toolbar()).getByRole('button', { name: '上の階層へ' }));

    expect(onMoveUpItems).toHaveBeenCalledTimes(1);
    expect(onMoveUpItems).toHaveBeenCalledWith(['item-b', 'item-c']);
  });

  /** @requirement estimate-creation/REQ-23.10 */
  it('下の階層へ移動が選択範囲全体を表示順のまま通知されること (23.10, 44.3, 44.4)', async () => {
    const user = userEvent.setup();
    renderToolbar(rangeProps);

    await user.click(within(toolbar()).getByRole('button', { name: '下の階層へ' }));

    expect(onMoveDownItems).toHaveBeenCalledTimes(1);
    // 44.4 の「先頭行」を決めるため表示順のまま渡す（並べ替えない）
    expect(onMoveDownItems).toHaveBeenCalledWith(['item-b', 'item-c']);
  });

  /** @requirement estimate-creation/REQ-23.3 */
  it('単一選択でも同じ操作が1件の配列として通知されること (23.3)', async () => {
    const user = userEvent.setup();
    renderToolbar({
      selectedKeys: ['item-b'],
      selectedItem: createItem({ id: 'item-b', parentId: 'item-a' }),
      hasPreviousSibling: true,
    });

    await user.click(within(toolbar()).getByRole('button', { name: /削除/ }));

    expect(onDeleteItems).toHaveBeenCalledWith(['item-b']);
  });

  /** @requirement estimate-creation/REQ-23.4 */
  it('子項目追加は選択範囲の先頭行を親として通知されること (23.4)', async () => {
    const user = userEvent.setup();
    renderToolbar(rangeProps);

    await user.click(within(toolbar()).getByRole('button', { name: /子項目追加/ }));

    expect(onAddChildItem).toHaveBeenCalledWith('item-b');
  });
});

// ============================================================================
// 下の階層へボタンのネスト化ルール（23.10, 44.4）
// ============================================================================

describe('下の階層へボタンのネスト化ルール (23.10, 44.4)', () => {
  const moveDownButton = (): HTMLElement =>
    within(toolbar()).getByRole('button', { name: '下の階層へ' });

  /** @requirement estimate-creation/REQ-23.10 */
  it('単一選択で直前の兄弟が無い場合は無効であること (23.10)', () => {
    renderToolbar({
      selectedKeys: ['item-a'],
      selectedItem: createItem({ id: 'item-a' }),
      hasPreviousSibling: false,
    });

    expect(moveDownButton()).toBeDisabled();
  });

  /** @requirement estimate-creation/REQ-23.10 */
  it('単一選択で直前の兄弟がある場合は有効であること (23.10)', () => {
    renderToolbar({
      selectedKeys: ['item-b'],
      selectedItem: createItem({ id: 'item-b' }),
      hasPreviousSibling: true,
    });

    expect(moveDownButton()).toBeEnabled();
  });

  /**
   * 44.4 は範囲の先頭行を親へ昇格させる規則のため、先頭行に直前の兄弟が無くても成立する。
   * 単一選択の規則（直前の兄弟の子へ移す）をそのまま適用すると押せなくなる。
   *
   * @requirement estimate-creation/REQ-44.4
   */
  it('複数行選択では直前の兄弟が無くても有効であること (23.10, 44.4)', () => {
    renderToolbar({
      selectedKeys: ['item-a', 'item-b'],
      selectedItem: createItem({ id: 'item-a' }),
      hasPreviousSibling: false,
    });

    expect(moveDownButton()).toBeEnabled();
  });
});

// ============================================================================
// ツールバー操作とキー割当の対応（23.11）
// ============================================================================

/** 割当1件のキー表記（`EstimateKeymapHelp` の実装を参照せず独立に組み立てる） */
const MODIFIER_TEXT: Record<KeymapModifier, string> = {
  ctrl: 'Ctrl',
  meta: '⌘',
  alt: 'Alt',
  shift: 'Shift',
};
const MODIFIER_SEQUENCE: readonly KeymapModifier[] = ['ctrl', 'meta', 'alt', 'shift'];
const KEY_TEXT: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
};
const formatKey = (entry: KeymapEntry): string =>
  [
    ...MODIFIER_SEQUENCE.filter((modifier) => entry.modifiers.includes(modifier)).map(
      (modifier) => MODIFIER_TEXT[modifier]
    ),
    KEY_TEXT[entry.key] ?? (entry.key.length === 1 ? entry.key.toUpperCase() : entry.key),
  ].join('+');

describe('ツールバー操作とキー割当の対応 (23.11)', () => {
  /**
   * 「対応するキーボード操作」を人手の突き合わせに委ねると、ボタンが増えたときに
   * 静かに割当が欠ける。ツールバーの各操作ボタンが自分の対応コマンドを
   * DOM 上で名乗り、そのコマンドがキー割当の単一定義に実在することで固定する。
   *
   * @requirement estimate-creation/REQ-23.11
   */
  it('すべての操作ボタンが対応するキー割当を持つこと (23.11)', () => {
    renderToolbar({
      selectedKeys: ['item-b'],
      selectedItem: createItem({ id: 'item-b', parentId: 'item-a' }),
      hasPreviousSibling: true,
      canReorderUp: true,
      canReorderDown: true,
      canUndo: true,
      canRedo: true,
    });

    const commands = new Set(ESTIMATE_KEYMAP.entries.map((entry) => entry.command));
    const buttons = Array.from(toolbar().querySelectorAll<HTMLElement>('button'));
    expect(buttons.length).toBeGreaterThan(0);

    for (const button of buttons) {
      // キー割当一覧の入口（47.3）は明細への操作ではなく一覧そのものの表示なので対象外
      if (button.dataset.testid === 'open-keymap-help') {
        continue;
      }
      const command = button.getAttribute('data-estimate-command');
      expect(command, `「${button.textContent}」に対応コマンドの宣言が無い`).not.toBeNull();
      expect(commands, `「${button.textContent}」の ${command} にキー割当が無い`).toContain(
        command
      );
    }
  });

  /**
   * 対応が宣言だけで終わらないよう、利用者が押すべきキーを画面上でも示す。
   *
   * @requirement estimate-creation/REQ-23.11
   */
  it('操作ボタンの説明に対応するキー表記が含まれること (23.11)', () => {
    renderToolbar({
      selectedKeys: ['item-b'],
      selectedItem: createItem({ id: 'item-b', parentId: 'item-a' }),
      hasPreviousSibling: true,
      canReorderUp: true,
      canReorderDown: true,
    });

    const buttons = Array.from(toolbar().querySelectorAll<HTMLElement>('button')).filter(
      (button) => button.getAttribute('data-estimate-command') !== null
    );
    expect(buttons.length).toBeGreaterThan(0);

    for (const button of buttons) {
      const command = button.getAttribute('data-estimate-command');
      const entry = ESTIMATE_KEYMAP.entries.find((candidate) => candidate.command === command);
      expect(entry, `${command} の割当が見つからない`).toBeDefined();
      expect(button.getAttribute('title') ?? '', `「${button.textContent}」の説明`).toContain(
        formatKey(entry as KeymapEntry)
      );
    }
  });
});
