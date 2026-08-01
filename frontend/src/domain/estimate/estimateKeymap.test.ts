/**
 * @fileoverview estimateKeymap の単体テスト
 *
 * Task 54.6: キー割当の定義と解決
 *
 * Requirements (estimate-creation):
 * - 47.1: キーボード操作のみで行の挿入・削除・複写・範囲選択・階層の上げ下げ・階層間の移動を実行可能とする
 * - 47.4: ブラウザの標準操作と衝突しないキー割り当てを用いる
 * - 47.5: セルの文字入力中は文字編集を優先し、行操作を実行しない
 * - 47.6: 範囲選択中に固有のキーボード操作を有効にする
 * - 47.7: 範囲選択解除の操作で範囲選択を解除する
 *
 * Design: design.md `##### estimateKeymap`（:4086-4120）
 *
 * @module domain/estimate/estimateKeymap.test
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  ESTIMATE_KEYMAP,
  ESTIMATE_HIERARCHY_PANEL_ATTRIBUTE,
  ESTIMATE_ROW_KEY_ATTRIBUTE,
  resolveEstimateFocusContext,
} from './estimateKeymap';
import type { EstimateCommand, FocusContext, KeymapEntry } from './estimateKeymap';

// ============================================================================
// テストヘルパー
// ============================================================================

type Modifier = 'ctrl' | 'shift' | 'alt' | 'meta';

interface PressOptions {
  readonly modifiers?: readonly Modifier[];
  readonly target?: HTMLElement;
  readonly code?: string;
}

const created: HTMLElement[] = [];

/** テスト用の要素を body 直下に作る（`event.target` を実物にするため） */
function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  const element = host.firstElementChild as HTMLElement;
  document.body.appendChild(host);
  created.push(host);
  return element;
}

/**
 * キーイベントを実際に dispatch して返す
 *
 * `resolve` は `event.target` を見る（47.5）ため、生成しただけのイベントでは足りない。
 */
function press(key: string, options: PressOptions = {}): KeyboardEvent {
  const modifiers = options.modifiers ?? [];
  const target = options.target ?? mount('<div data-plain="true"></div>');
  const event = new KeyboardEvent('keydown', {
    key,
    code: options.code,
    ctrlKey: modifiers.includes('ctrl'),
    shiftKey: modifiers.includes('shift'),
    altKey: modifiers.includes('alt'),
    metaKey: modifiers.includes('meta'),
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

/** 行操作のコマンド（文字入力中に発火してはならない / 47.5） */
const ROW_COMMANDS: readonly EstimateCommand[] = [
  'insertRow',
  'deleteRow',
  'duplicateCell',
  'indent',
  'outdent',
];

/** 定義に含まれるべき全コマンド（design.md の `EstimateCommand`） */
const ALL_COMMANDS: readonly EstimateCommand[] = [
  'insertRow',
  'deleteRow',
  'duplicateCell',
  'toggleRangeSelect',
  'clearSelection',
  'indent',
  'outdent',
  'drillDown',
  'drillUp',
  'firstRowInLevel',
  'lastRowInLevel',
  'nextLevel',
  'prevLevel',
  'toggleViewMode',
  'undo',
  'redo',
];

/**
 * ブラウザ標準に割り当て済みで採用してはならないキー（47.4）
 *
 * 取り消し・やり直し（Ctrl/Cmd+Z 等）は「同じ意味の操作」を引き継ぐ設計上の例外で、
 * design.md `##### estimateKeymap` が明示的に維持を求めているため含めない。
 */
const BROWSER_RESERVED: readonly { key: string; modifiers: readonly Modifier[] }[] = [
  { key: 'ArrowLeft', modifiers: ['alt'] }, // 履歴を戻る
  { key: 'ArrowRight', modifiers: ['alt'] }, // 履歴を進む
  { key: 'Home', modifiers: ['alt'] }, // ホーム
  { key: 'd', modifiers: ['alt'] }, // アドレスバーへフォーカス
  { key: 'e', modifiers: ['alt'] }, // メニュー
  { key: 'f', modifiers: ['alt'] }, // メニュー
  { key: 'd', modifiers: ['ctrl'] }, // ブックマーク
  { key: 'f', modifiers: ['ctrl'] }, // ページ内検索
  { key: 'n', modifiers: ['ctrl'] }, // 新規ウィンドウ
  { key: 'p', modifiers: ['ctrl'] }, // 印刷
  { key: 'r', modifiers: ['ctrl'] }, // 再読み込み
  { key: 's', modifiers: ['ctrl'] }, // 保存
  { key: 't', modifiers: ['ctrl'] }, // 新規タブ
  { key: 'w', modifiers: ['ctrl'] }, // タブを閉じる
  { key: 'Insert', modifiers: ['shift'] }, // 貼り付け
  { key: 'PageUp', modifiers: ['ctrl'] }, // 前のタブ
  { key: 'PageDown', modifiers: ['ctrl'] }, // 次のタブ
  { key: 'Tab', modifiers: [] }, // フォーカス移動（47.2 のセル間移動に使う）
  { key: 'Tab', modifiers: ['shift'] },
  { key: 'F1', modifiers: [] },
  { key: 'F5', modifiers: [] },
  { key: 'F6', modifiers: [] },
  { key: 'F11', modifiers: [] },
  { key: 'F12', modifiers: [] },
];

const sameModifiers = (a: readonly Modifier[], b: readonly Modifier[]): boolean =>
  a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');

const CELL_EDITING: FocusContext = 'cellEditing';
const ROW_SELECTED: FocusContext = 'rowSelected';
const RANGE_SELECTED: FocusContext = 'rangeSelected';
const HIERARCHY_PANEL: FocusContext = 'hierarchyPanel';

const entriesOf = (command: EstimateCommand): readonly KeymapEntry[] =>
  ESTIMATE_KEYMAP.entries.filter((entry) => entry.command === command);

afterEach(() => {
  for (const host of created.splice(0)) {
    host.remove();
  }
});

// ============================================================================
// 単一定義（47.1, 47.3 の一覧生成の元）
// ============================================================================

describe('ESTIMATE_KEYMAP.entries', () => {
  /** @requirement estimate-creation/REQ-47.1 */
  it('設計が定めた全コマンドに割当を持つこと (47.1)', () => {
    for (const command of ALL_COMMANDS) {
      expect(entriesOf(command).length, `${command} の割当が無い`).toBeGreaterThan(0);
    }
  });

  /** @requirement estimate-creation/REQ-47.1 */
  it('定義されたコマンドが設計の一覧を超えないこと (47.1)', () => {
    for (const entry of ESTIMATE_KEYMAP.entries) {
      expect(ALL_COMMANDS).toContain(entry.command);
    }
  });

  /**
   * 54.7 のキー割当一覧は本定義から生成するため、利用者向けの表記が必須。
   *
   * @requirement estimate-creation/REQ-47.1
   */
  it('すべての割当が利用者向けの表記と適用文脈を持つこと (47.1)', () => {
    for (const entry of ESTIMATE_KEYMAP.entries) {
      expect(entry.label.length, `${entry.command} の label が空`).toBeGreaterThan(0);
      expect(entry.contexts.length, `${entry.command} の contexts が空`).toBeGreaterThan(0);
    }
  });

  /** @requirement estimate-creation/REQ-47.4 */
  it('ブラウザ標準に割り当て済みのキーを採用しないこと (47.4)', () => {
    for (const entry of ESTIMATE_KEYMAP.entries) {
      for (const reserved of BROWSER_RESERVED) {
        const conflicts =
          entry.key.toLowerCase() === reserved.key.toLowerCase() &&
          sameModifiers(entry.modifiers, reserved.modifiers);
        expect(conflicts, `${entry.command} が ${reserved.key} と衝突`).toBe(false);
      }
    }
  });

  /**
   * 修飾キーの無い割当は文字入力・キャレット移動・スクロールを奪う。
   * 唯一の例外は Escape（47.7 の選択解除）。
   *
   * @requirement estimate-creation/REQ-47.4
   */
  it('Escape 以外は修飾キーを伴うこと (47.4)', () => {
    for (const entry of ESTIMATE_KEYMAP.entries) {
      if (entry.key === 'Escape') {
        continue;
      }
      expect(entry.modifiers.length, `${entry.command} が修飾キー無し`).toBeGreaterThan(0);
    }
  });

  /** @requirement estimate-creation/REQ-47.4 */
  it('同一文脈で同じキーの組み合わせが重複しないこと (47.4)', () => {
    const seen = new Set<string>();
    for (const entry of ESTIMATE_KEYMAP.entries) {
      for (const context of entry.contexts) {
        const signature = `${context}:${entry.key.toLowerCase()}:${[...entry.modifiers].sort().join('+')}`;
        expect(seen.has(signature), `重複した割当: ${signature}`).toBe(false);
        seen.add(signature);
      }
    }
  });

  /**
   * design.md `##### estimateKeymap`: 「`undo` / `redo` は既存の Ctrl/Cmd+Z、
   * Ctrl/Cmd+Shift+Z、Ctrl+Y と同一割当を維持する」
   *
   * @requirement estimate-creation/REQ-47.1
   */
  it('取り消し・やり直しの既存割当を維持すること (47.1)', () => {
    expect(ESTIMATE_KEYMAP.resolve(press('z', { modifiers: ['ctrl'] }), 'rowSelected')).toBe(
      'undo'
    );
    expect(ESTIMATE_KEYMAP.resolve(press('z', { modifiers: ['meta'] }), 'rowSelected')).toBe(
      'undo'
    );
    expect(
      ESTIMATE_KEYMAP.resolve(press('z', { modifiers: ['ctrl', 'shift'] }), 'rowSelected')
    ).toBe('redo');
    expect(
      ESTIMATE_KEYMAP.resolve(press('z', { modifiers: ['meta', 'shift'] }), 'rowSelected')
    ).toBe('redo');
    expect(ESTIMATE_KEYMAP.resolve(press('y', { modifiers: ['ctrl'] }), 'rowSelected')).toBe(
      'redo'
    );
  });
});

// ============================================================================
// 文脈ごとの解決
// ============================================================================

describe('ESTIMATE_KEYMAP.resolve', () => {
  /** 行選択中は行操作が解決される（47.5 の否定側と対になる肯定側） */
  /** @requirement estimate-creation/REQ-47.1 */
  it('行選択中は行の挿入・削除・複写・階層の上げ下げを解決すること (47.1)', () => {
    const resolved = ROW_COMMANDS.map((command) => {
      const entry = entriesOf(command)[0] as KeymapEntry;
      return ESTIMATE_KEYMAP.resolve(
        press(entry.key, {
          modifiers: [...entry.modifiers],
          code: `Key${entry.key.toUpperCase()}`,
        }),
        'rowSelected'
      );
    });
    expect(resolved).toEqual([...ROW_COMMANDS]);
  });

  /** @requirement estimate-creation/REQ-47.5 */
  it('セルの文字入力中は行操作のコマンドを返さないこと (47.5)', () => {
    const input = mount('<input type="text" />');
    for (const command of ROW_COMMANDS) {
      const entry = entriesOf(command)[0] as KeymapEntry;
      const event = press(entry.key, {
        modifiers: [...entry.modifiers],
        target: input,
        code: `Key${entry.key.toUpperCase()}`,
      });
      expect(ESTIMATE_KEYMAP.resolve(event, 'cellEditing'), `${command} が発火した`).toBeNull();
    }
  });

  /**
   * 呼び出し側が文脈を取り違えても文字編集が勝つ（47.5 は無条件）。
   *
   * @requirement estimate-creation/REQ-47.5
   */
  it('文字入力要素が対象なら行選択の文脈を渡しても行操作を返さないこと (47.5)', () => {
    const input = mount('<input type="text" />');
    const entry = entriesOf('insertRow')[0] as KeymapEntry;
    const event = press(entry.key, { modifiers: [...entry.modifiers], target: input });
    expect(ESTIMATE_KEYMAP.resolve(event, 'rowSelected')).toBeNull();
  });

  /** @requirement estimate-creation/REQ-47.5 */
  it('textarea と contenteditable でも行操作を返さないこと (47.5)', () => {
    const entry = entriesOf('deleteRow')[0] as KeymapEntry;
    for (const html of ['<textarea></textarea>', '<div contenteditable="true"></div>']) {
      const element = mount(html);
      const event = press(entry.key, { modifiers: [...entry.modifiers], target: element });
      expect(ESTIMATE_KEYMAP.resolve(event, 'cellEditing')).toBeNull();
    }
  });

  /** @requirement estimate-creation/REQ-47.7 */
  it('セルの文字入力中でも選択解除だけは解決すること (47.5, 47.7)', () => {
    const input = mount('<input type="text" />');
    expect(ESTIMATE_KEYMAP.resolve(press('Escape', { target: input }), 'cellEditing')).toBe(
      'clearSelection'
    );
  });

  /** @requirement estimate-creation/REQ-47.6 */
  it('範囲選択中に範囲固有の操作を有効にすること (47.6)', () => {
    const indent = entriesOf('indent')[0] as KeymapEntry;
    const outdent = entriesOf('outdent')[0] as KeymapEntry;
    expect(
      ESTIMATE_KEYMAP.resolve(
        press(indent.key, { modifiers: [...indent.modifiers] }),
        'rangeSelected'
      )
    ).toBe('indent');
    expect(
      ESTIMATE_KEYMAP.resolve(
        press(outdent.key, { modifiers: [...outdent.modifiers] }),
        'rangeSelected'
      )
    ).toBe('outdent');
    expect(ESTIMATE_KEYMAP.resolve(press('Escape'), 'rangeSelected')).toBe('clearSelection');
  });

  /** @requirement estimate-creation/REQ-47.1 */
  it('範囲選択を上下へ広げる操作を解決すること (47.1, 47.6)', () => {
    expect(
      ESTIMATE_KEYMAP.resolve(press('ArrowDown', { modifiers: ['shift'] }), 'rowSelected')
    ).toBe('toggleRangeSelect');
    expect(
      ESTIMATE_KEYMAP.resolve(press('ArrowUp', { modifiers: ['shift'] }), 'rangeSelected')
    ).toBe('toggleRangeSelect');
  });

  /** @requirement estimate-creation/REQ-47.1 */
  it('階層間の移動を解決すること (47.1)', () => {
    expect(ESTIMATE_KEYMAP.resolve(press('ArrowDown', { modifiers: ['alt'] }), 'rowSelected')).toBe(
      'drillDown'
    );
    expect(ESTIMATE_KEYMAP.resolve(press('ArrowUp', { modifiers: ['alt'] }), 'rowSelected')).toBe(
      'drillUp'
    );
  });

  /** @requirement estimate-creation/REQ-47.1 */
  it('階層構造パネルでは明細の編集コマンドを返さず移動コマンドを返すこと (47.1)', () => {
    for (const command of ROW_COMMANDS) {
      const entry = entriesOf(command)[0] as KeymapEntry;
      const event = press(entry.key, {
        modifiers: [...entry.modifiers],
        code: `Key${entry.key.toUpperCase()}`,
      });
      expect(ESTIMATE_KEYMAP.resolve(event, 'hierarchyPanel'), `${command} が発火した`).toBeNull();
    }
    expect(
      ESTIMATE_KEYMAP.resolve(press('ArrowUp', { modifiers: ['alt'] }), 'hierarchyPanel')
    ).toBe('drillUp');
  });

  /** @requirement estimate-creation/REQ-47.4 */
  it('余分な修飾キーが押されている場合は解決しないこと (47.4)', () => {
    const entry = entriesOf('insertRow')[0] as KeymapEntry;
    const event = press(entry.key, { modifiers: [...entry.modifiers, 'ctrl'] });
    expect(ESTIMATE_KEYMAP.resolve(event, 'rowSelected')).toBeNull();
  });

  /** @requirement estimate-creation/REQ-47.4 */
  it('割当の無いキーでは何も返さないこと (47.4)', () => {
    expect(ESTIMATE_KEYMAP.resolve(press('a'), 'rowSelected')).toBeNull();
    expect(ESTIMATE_KEYMAP.resolve(press('Tab'), 'rowSelected')).toBeNull();
    expect(ESTIMATE_KEYMAP.resolve(press('ArrowDown'), 'rowSelected')).toBeNull();
  });
});

// ============================================================================
// フォーカス文脈の判定
// ============================================================================

describe('resolveEstimateFocusContext', () => {
  /** @requirement estimate-creation/REQ-47.5 */
  it('文字入力要素はセル入力中と判定すること (47.5)', () => {
    const input = mount('<input type="text" />');
    expect(resolveEstimateFocusContext(input, { selectedCount: 0 })).toBe(CELL_EDITING);
  });

  /** @requirement estimate-creation/REQ-47.6 */
  it('2行以上選択されている場合は範囲選択中と判定すること (47.6)', () => {
    const row = mount(`<div ${ESTIMATE_ROW_KEY_ATTRIBUTE}="item-a"></div>`);
    expect(resolveEstimateFocusContext(row, { selectedCount: 2 })).toBe(RANGE_SELECTED);
    expect(resolveEstimateFocusContext(row, { selectedCount: 1 })).toBe(ROW_SELECTED);
  });

  /** @requirement estimate-creation/REQ-47.1 */
  it('階層構造パネル配下は階層パネルの文脈と判定すること (47.1)', () => {
    const panel = mount(
      `<div ${ESTIMATE_HIERARCHY_PANEL_ATTRIBUTE}="true"><button type="button">節</button></div>`
    );
    const button = panel.querySelector('button') as HTMLElement;
    expect(resolveEstimateFocusContext(button, { selectedCount: 3 })).toBe(HIERARCHY_PANEL);
  });

  /** @requirement estimate-creation/REQ-47.5 */
  it('パネル内の文字入力はセル入力中の判定を優先すること (47.5)', () => {
    const panel = mount(
      `<div ${ESTIMATE_HIERARCHY_PANEL_ATTRIBUTE}="true"><input type="text" /></div>`
    );
    const input = panel.querySelector('input') as HTMLElement;
    expect(resolveEstimateFocusContext(input, { selectedCount: 0 })).toBe(CELL_EDITING);
  });
});
