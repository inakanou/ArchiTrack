/**
 * @fileoverview estimateKeymap - 見積明細のキー割当の単一定義と解決
 *
 * Task 54.6: キー割当の定義と解決
 *
 * 行の挿入・削除・複写・範囲選択・階層の上げ下げ・階層間の移動・表示モード切替の
 * キー割当を**この1ファイルだけ**が持ちます。画面側（`useEstimateKeyboard`）は
 * 「押されたキー」と「フォーカス文脈」を渡してコマンド名を受け取るだけで、
 * キーの条件分岐を持ちません。キー割当一覧の表示（54.7）も同じ `entries` から
 * 生成するため、定義と画面表示・実際の挙動が乖離しません。
 *
 * 依存方向（design.md `#### Dependency Direction`）:
 * `types → api → calculations / estimateTree / keymap → reducer → hooks → components → pages`
 * 本モジュールは hooks / components を参照しません。
 *
 * Requirements (estimate-creation):
 * - 23.11: ツールバーの各操作に対応するキーボードショートカットを提供する（割当の定義）
 * - 47.1: キーボード操作のみで行の挿入・削除・複写・範囲選択・階層の上げ下げ・階層間の移動を実行可能とする
 * - 47.4: ブラウザの標準操作と衝突しないキー割り当てを用いる
 * - 47.5: セルの文字入力中は文字編集の操作を優先し、行操作を実行しない
 * - 47.6: 範囲選択中に固有のキーボード操作を有効にする
 * - 47.7: 範囲選択解除の操作で範囲選択を解除する
 *
 * Design: design.md `##### estimateKeymap`（:4086-4120）
 *
 * ## キー割当の考え方（47.4）
 *
 * ブラウザが自ら使うキーは採用しない。特に次は使えない。
 * - `Alt+←` / `Alt+→`（履歴の戻る・進む）、`Alt+Home`（ホーム）、`Alt+D`（アドレスバー）
 * - `Ctrl+D`（ブックマーク）、`Ctrl+P` `Ctrl+S` `Ctrl+F` `Ctrl+T` `Ctrl+W`
 * - `Ctrl+PageUp` / `Ctrl+PageDown`（タブ切替）、`Shift+Insert`（貼り付け）
 * - `Tab` / `Shift+Tab`（フォーカス移動）。これは 47.2 の**セル間移動そのもの**であり、
 *   横取りせずブラウザ標準のまま使う（明細のセルはすべてフォーカス可能な入力要素で、
 *   DOM の並びが表示順と一致する）
 * - `F1` 等のファンクションキー（ヘルプ・再読み込み・開発者ツール）
 *
 * 残った空きから、方向の意味が対応する組を選んでいる。
 * - `Alt+↑` / `Alt+↓`: 階層を出入りする（表示の移動）
 * - `Alt+Shift+←` / `Alt+Shift+→`: 階層を上げる・下げる（明細の編集）
 * - `Shift+↑` / `Shift+↓`: 範囲選択を広げる
 * - `Alt+PageUp` / `Alt+PageDown`: 階層内の先頭行・末尾行へ
 * - `Alt+Shift+PageUp` / `Alt+Shift+PageDown`: 前の階層・次の階層へ
 *
 * 修飾キーを伴わない割当は `Esc`（選択解除）だけに限る。修飾キー無しのキーは
 * 文字入力・キャレット移動・スクロールを奪うため（47.4, 47.5）。
 *
 * @module domain/estimate/estimateKeymap
 */

import { isTextInputElement } from '../../utils/keyboard-input';
import type { NodeKey } from './estimateEditReducer.types';

// ============================================================================
// 型定義（design.md `##### estimateKeymap` の契約）
// ============================================================================

/** キー操作を解釈する文脈（どこにフォーカスがあるか） */
export type FocusContext = 'cellEditing' | 'rowSelected' | 'rangeSelected' | 'hierarchyPanel';

/** キー操作が表す明細操作 */
export type EstimateCommand =
  | 'insertRow'
  | 'deleteRow'
  | 'duplicateCell'
  | 'toggleRangeSelect'
  | 'clearSelection'
  | 'indent'
  | 'outdent'
  | 'drillDown'
  | 'drillUp'
  | 'firstRowInLevel'
  | 'lastRowInLevel'
  | 'nextLevel'
  | 'prevLevel'
  | 'toggleViewMode'
  | 'undo'
  | 'redo';

/** 修飾キー */
export type KeymapModifier = 'ctrl' | 'shift' | 'alt' | 'meta';

/** キー割当1件 */
export interface KeymapEntry {
  readonly command: EstimateCommand;
  /** `KeyboardEvent.key` と照合する値（英字は大文字小文字を区別しない） */
  readonly key: string;
  readonly modifiers: readonly KeymapModifier[];
  readonly contexts: readonly FocusContext[];
  /** 利用者向けの説明（54.7 のキー割当一覧はこの文字列を表示する） */
  readonly label: string;
}

/** キー割当の定義と解決 */
export interface EstimateKeymap {
  readonly entries: readonly KeymapEntry[];
  resolve(event: KeyboardEvent, context: FocusContext): EstimateCommand | null;
}

// ============================================================================
// DOM 上の目印（画面側と共有する契約）
// ============================================================================

/**
 * 明細行に付ける行キーの属性
 *
 * キー操作の対象行は「いまフォーカスのある要素が属する行」で決まる。
 * 画面側が独自の選択状態を持たずに済むよう、行の識別子を DOM に載せる。
 */
export const ESTIMATE_ROW_KEY_ATTRIBUTE = 'data-estimate-row-key';

/** 階層構造パネルの範囲を示す属性（`hierarchyPanel` 文脈の判定に用いる） */
export const ESTIMATE_HIERARCHY_PANEL_ATTRIBUTE = 'data-estimate-hierarchy-panel';

// ============================================================================
// キー割当の定義
// ============================================================================

/** 明細行が対象の文脈（行選択中・範囲選択中） */
const ROW_CONTEXTS: readonly FocusContext[] = ['rowSelected', 'rangeSelected'];

/** 明細の編集を伴わない移動系が使える文脈 */
const NAVIGATION_CONTEXTS: readonly FocusContext[] = [
  'rowSelected',
  'rangeSelected',
  'hierarchyPanel',
];

const ENTRIES: readonly KeymapEntry[] = [
  // --- 行操作（43.1: いずれもサーバーへ保存せず画面上の明細を更新する） -------
  {
    command: 'insertRow',
    key: 'Insert',
    modifiers: ['alt'],
    contexts: ROW_CONTEXTS,
    label: 'Alt+Insert: 選択行の直後に行を挿入',
  },
  {
    command: 'deleteRow',
    key: 'Delete',
    modifiers: ['alt'],
    contexts: ROW_CONTEXTS,
    label: 'Alt+Delete: 選択行（範囲選択中は範囲全体）を削除',
  },
  {
    command: 'duplicateCell',
    key: 'c',
    modifiers: ['alt'],
    contexts: ROW_CONTEXTS,
    label: 'Alt+C: 選択行（範囲選択中は範囲全体）を複写',
  },
  // --- 範囲選択（44.1, 44.2, 47.6, 47.7） -----------------------------------
  {
    command: 'toggleRangeSelect',
    key: 'ArrowDown',
    modifiers: ['shift'],
    contexts: ROW_CONTEXTS,
    label: 'Shift+↓: 範囲選択を1行下へ広げる',
  },
  {
    command: 'toggleRangeSelect',
    key: 'ArrowUp',
    modifiers: ['shift'],
    contexts: ROW_CONTEXTS,
    label: 'Shift+↑: 範囲選択を1行上へ広げる',
  },
  {
    command: 'clearSelection',
    key: 'Escape',
    modifiers: [],
    contexts: ['cellEditing', 'rowSelected', 'rangeSelected', 'hierarchyPanel'],
    label: 'Esc: セルの入力を抜ける／選択を解除する',
  },
  // --- 階層の上げ下げ（44.4, 44.5, 47.6） ------------------------------------
  {
    command: 'indent',
    key: 'ArrowRight',
    modifiers: ['alt', 'shift'],
    contexts: ROW_CONTEXTS,
    label: 'Alt+Shift+→: 階層を1段下げる（範囲選択中は範囲全体）',
  },
  {
    command: 'outdent',
    key: 'ArrowLeft',
    modifiers: ['alt', 'shift'],
    contexts: ROW_CONTEXTS,
    label: 'Alt+Shift+←: 階層を1段上げる（範囲選択中は範囲全体）',
  },
  // --- 階層間の移動（45.7〜45.9, 47.1） --------------------------------------
  {
    command: 'drillDown',
    key: 'ArrowDown',
    modifiers: ['alt'],
    contexts: NAVIGATION_CONTEXTS,
    label: 'Alt+↓: 選択行の子階層を表示する（ドリルダウン表示）',
  },
  {
    command: 'drillUp',
    key: 'ArrowUp',
    modifiers: ['alt'],
    contexts: NAVIGATION_CONTEXTS,
    label: 'Alt+↑: 一つ上の階層へ戻る（ドリルダウン表示）',
  },
  {
    command: 'firstRowInLevel',
    key: 'PageUp',
    modifiers: ['alt'],
    contexts: NAVIGATION_CONTEXTS,
    label: 'Alt+PageUp: 表示中の先頭行を選択',
  },
  {
    command: 'lastRowInLevel',
    key: 'PageDown',
    modifiers: ['alt'],
    contexts: NAVIGATION_CONTEXTS,
    label: 'Alt+PageDown: 表示中の末尾行を選択',
  },
  {
    command: 'prevLevel',
    key: 'PageUp',
    modifiers: ['alt', 'shift'],
    contexts: NAVIGATION_CONTEXTS,
    label: 'Alt+Shift+PageUp: 前の階層へ移動（ドリルダウン表示）',
  },
  {
    command: 'nextLevel',
    key: 'PageDown',
    modifiers: ['alt', 'shift'],
    contexts: NAVIGATION_CONTEXTS,
    label: 'Alt+Shift+PageDown: 次の階層へ移動（ドリルダウン表示）',
  },
  // --- 表示モード（45.1） ----------------------------------------------------
  {
    command: 'toggleViewMode',
    key: 'm',
    modifiers: ['alt'],
    contexts: NAVIGATION_CONTEXTS,
    label: 'Alt+M: ツリー表示とドリルダウン表示を切り替える',
  },
  // --- 取り消し・やり直し（48.1, 48.2） --------------------------------------
  // 既存の割当（`useUndoKeyboardShortcuts`）をそのまま引き継ぐ。文字入力中は
  // ブラウザ標準の取り消しが働くため `cellEditing` には割り当てない。
  {
    command: 'undo',
    key: 'z',
    modifiers: ['ctrl'],
    contexts: NAVIGATION_CONTEXTS,
    label: 'Ctrl+Z: 直前の編集を取り消す',
  },
  {
    command: 'undo',
    key: 'z',
    modifiers: ['meta'],
    contexts: NAVIGATION_CONTEXTS,
    label: '⌘Z: 直前の編集を取り消す',
  },
  {
    command: 'redo',
    key: 'z',
    modifiers: ['ctrl', 'shift'],
    contexts: NAVIGATION_CONTEXTS,
    label: 'Ctrl+Shift+Z: 取り消した編集をやり直す',
  },
  {
    command: 'redo',
    key: 'z',
    modifiers: ['meta', 'shift'],
    contexts: NAVIGATION_CONTEXTS,
    label: '⌘Shift+Z: 取り消した編集をやり直す',
  },
  {
    command: 'redo',
    key: 'y',
    modifiers: ['ctrl'],
    contexts: NAVIGATION_CONTEXTS,
    label: 'Ctrl+Y: 取り消した編集をやり直す',
  },
];

// ============================================================================
// 解決
// ============================================================================

/**
 * 押されたキーが割当と一致するか
 *
 * macOS の Option+英字は `event.key` が別の文字になる（`Alt+C` → `ç`）ため、
 * 英字1文字の割当は `event.code` でも照合する。
 */
function keyMatches(entryKey: string, event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() === entryKey.toLowerCase()) {
    return true;
  }
  if (entryKey.length === 1 && /^[a-z]$/i.test(entryKey)) {
    return event.code === `Key${entryKey.toUpperCase()}`;
  }
  return false;
}

/** 修飾キーが過不足なく一致するか（余分な修飾キーは不一致とする） */
function modifiersMatch(modifiers: readonly KeymapModifier[], event: KeyboardEvent): boolean {
  return (
    event.ctrlKey === modifiers.includes('ctrl') &&
    event.shiftKey === modifiers.includes('shift') &&
    event.altKey === modifiers.includes('alt') &&
    event.metaKey === modifiers.includes('meta')
  );
}

/**
 * キー操作からコマンドを解決する
 *
 * 文字入力要素が対象のイベントは、呼び出し側がどの文脈を渡しても
 * `cellEditing` として扱う。文字編集の優先（47.5）は文脈判定の取り違えで
 * 破れてはならないため。
 */
function resolve(event: KeyboardEvent, context: FocusContext): EstimateCommand | null {
  const effectiveContext: FocusContext = isTextInputElement(event.target) ? 'cellEditing' : context;

  for (const entry of ENTRIES) {
    if (!entry.contexts.includes(effectiveContext)) {
      continue;
    }
    if (keyMatches(entry.key, event) && modifiersMatch(entry.modifiers, event)) {
      return entry.command;
    }
  }
  return null;
}

/** 見積明細のキー割当（単一の定義） */
export const ESTIMATE_KEYMAP: EstimateKeymap = {
  entries: ENTRIES,
  resolve,
};

// ============================================================================
// フォーカス文脈・対象行の判定
// ============================================================================

/** {@link resolveEstimateFocusContext} の判定材料 */
export interface FocusContextInput {
  /** 選択中の行数（2行以上で範囲選択の文脈になる / 44.8, 47.6） */
  readonly selectedCount: number;
}

/**
 * フォーカス位置から文脈を判定する
 *
 * 判定順は「文字入力中 → 階層構造パネル → 範囲選択中 → 行選択中」。
 * 文字入力の判定は共通ユーティリティ `isTextInputElement`（53.11）を用い、
 * 取り消し・やり直しのショートカットと同一の基準を共有する（47.5）。
 */
export function resolveEstimateFocusContext(
  target: EventTarget | null,
  input: FocusContextInput
): FocusContext {
  if (isTextInputElement(target)) {
    return 'cellEditing';
  }
  if (
    target instanceof HTMLElement &&
    target.closest(`[${ESTIMATE_HIERARCHY_PANEL_ATTRIBUTE}]`) !== null
  ) {
    return 'hierarchyPanel';
  }
  return input.selectedCount >= 2 ? 'rangeSelected' : 'rowSelected';
}

/**
 * フォーカス位置が属する明細行のキーを取り出す
 *
 * 明細の外（ツールバー・パネルなど）にフォーカスがある場合は null。
 */
export function resolveEstimateRowKey(target: EventTarget | null): NodeKey | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const row = target.closest<HTMLElement>(`[${ESTIMATE_ROW_KEY_ATTRIBUTE}]`);
  const key = row?.getAttribute(ESTIMATE_ROW_KEY_ATTRIBUTE);
  return key === undefined || key === null || key === '' ? null : key;
}
