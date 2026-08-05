/**
 * @fileoverview useEstimateKeyboard - 明細のキー操作を編集・表示状態へ橋渡しする
 *
 * Task 54.6: キー割当の定義と解決
 *
 * キーの条件分岐は一切持ちません。「どのキーがどのコマンドか」は
 * `estimateKeymap`（単一定義）だけが知り、本フックは解決されたコマンドを
 * 編集操作（`useEstimateEditor`）と表示状態（`useEstimateNavigation`）へ
 * 割り振ります。サーバーへの問い合わせは行いません（47.8）。
 *
 * 依存方向（design.md `#### Dependency Direction`）:
 * `types → estimateTree / keymap → reducer → hooks(本モジュール) → components → pages`
 *
 * ## 対象行の決め方
 *
 * 明細のセルはすべて入力要素のため、フォーカスは常に「行の中」にある。
 * そこで対象行は **いまフォーカスのある要素が属する行**（`data-estimate-row-key`）
 * とし、範囲選択中（2行以上）だけ選択範囲全体を対象にする。
 * セルの文字入力中は行操作を解決しない（47.5）ので、まず `Esc` でセルを抜ける。
 * `Esc` は選択を解除したうえでフォーカスを行そのものへ移すため、そのまま
 * 行操作のキーを続けて押せる（＝キーボードだけで完結する / 47.1）。
 *
 * Requirements (estimate-creation):
 * - 47.1: キーボード操作のみで行の挿入・削除・複写・範囲選択・階層の上げ下げ・階層間の移動を実行可能とする
 * - 47.4: ブラウザの標準操作と衝突しないキー割り当てを用いる（`preventDefault` は解決できたキーのみ）
 * - 47.5: セルの文字入力中は文字編集を優先し、行操作を実行しない
 * - 47.6: 範囲選択中に固有のキーボード操作を有効にする
 * - 47.7: 範囲選択解除の操作で範囲選択を解除する
 * - 47.8: キー操作による行操作はサーバーへの保存を伴わずに画面上の明細を更新する
 * - 48.1, 48.2: 取り消し・やり直しをキー操作から実行する（Task 54.8）
 *
 * Design: design.md `##### estimateKeymap`（:4086-4120）
 *
 * 取り消し・やり直し（48.1, 48.2 / Task 54.8）は `onUndo` / `onRedo` として
 * 受け取り、解決できたキーは `preventDefault` する。画面にはこれ以外の取り消し
 * 経路（`useUndoKeyboardShortcuts` などの window リスナ）を置かないため、
 * 二重発火しない。
 *
 * @module hooks/useEstimateKeyboard
 */

import { useCallback, useMemo } from 'react';
import {
  ESTIMATE_KEYMAP,
  ESTIMATE_ROW_KEY_ATTRIBUTE,
  resolveEstimateFocusContext,
  resolveEstimateRowKey,
} from '../domain/estimate/estimateKeymap';
import type { EstimateCommand } from '../domain/estimate/estimateKeymap';
import { childrenOf, nodeKeyOf, pathTo, resolveLevelKey } from '../domain/estimate/estimateTree';
import type { EditableItem, NodeKey } from '../domain/estimate/estimateEditReducer.types';
import type { EstimateViewMode } from './useEstimateNavigation';

// ============================================================================
// 型定義
// ============================================================================

/**
 * キー操作から呼び出す編集操作（いずれもローカル操作 / 47.8）
 *
 * `useEstimateEditor` の同名メソッドがそのまま適合する。
 */
export interface EstimateKeyboardCommands {
  /** 基準行の直後へ行を挿入する */
  insertRowAfter: (afterKey: NodeKey) => void;
  /** 指定行（と子孫）を削除する */
  deleteRows: (keys: readonly NodeKey[]) => void;
  /** 指定行を部分木ごと複写する */
  duplicateRows: (keys: readonly NodeKey[]) => void;
  /** 指定行の階層を1段下げる（表示順で渡す） */
  indentRange: (keys: readonly NodeKey[]) => void;
  /** 指定行の階層を1段上げる（表示順で渡す） */
  outdentRange: (keys: readonly NodeKey[]) => void;
  /**
   * ルートレベルの末尾に項目を追加する（23.2 / ツールバーの「項目追加」）
   *
   * 23.11 が求める「ツールバーの各操作に対応するキーボード操作」の実行先。
   * 以下4つはいずれも省略不可にしてあり、画面側の結線漏れを `tsc` が捕まえる。
   */
  addRootItem: () => void;
  /** 指定行の子として項目を追加する（23.4 / ツールバーの「子項目追加」） */
  addChildItem: (parentKey: NodeKey) => void;
  /** ルートレベルの末尾に値引き行を追加する（41.1 / ツールバーの「値引き行追加」） */
  addDiscountRow: () => void;
  /** 注記行を追加する（55.1, 55.3 / ツールバーの「注記行追加」）。`null` はルート末尾 */
  addNoteRow: (afterKey: NodeKey | null) => void;
  /** 同一階層内で並び順を入れ替える（12.2 / ツールバーの「↑上へ」「↓下へ」） */
  reorderRow: (key: NodeKey, direction: 'up' | 'down') => void;
}

/** useEstimateKeyboard フックの引数 */
export interface UseEstimateKeyboardOptions {
  /** 編集中の明細ツリー（読み取り専用。階層関係の解決にのみ用いる） */
  items: readonly EditableItem[];
  /** 階層表示モード（45.1） */
  viewMode: EstimateViewMode;
  /** ドリルダウン表示の現在階層（45.6）。`null` はルート階層 */
  currentLevelKey: NodeKey | null;
  /** 表示対象の行キー（表示順）。カーソル移動・範囲選択の基準 */
  visibleKeys: readonly NodeKey[];
  /** 選択中の行キー（表示順 / 44.1） */
  selectedKeys: readonly NodeKey[];
  /** カーソル行（範囲選択を広げる基準）。未設定は null */
  cursorKey: NodeKey | null;
  /** 編集操作 */
  commands: EstimateKeyboardCommands;
  /** 単一行の選択（44.2） */
  onSelectSingle: (key: NodeKey) => void;
  /** 選択範囲を指定行まで広げる（44.1） */
  onExtendSelectionTo: (key: NodeKey) => void;
  /** 選択解除（44.2, 47.7） */
  onClearSelection: () => void;
  /** 階層表示モードの変更（45.1, 45.11 の永続化を含む経路を渡す） */
  onViewModeChange: (mode: EstimateViewMode) => void;
  /** ドリルダウン表示の現在階層の変更（45.8, 45.9） */
  onCurrentLevelChange: (key: NodeKey | null) => void;
  /**
   * 直前の編集を取り消す（48.1）
   *
   * 省略可能にすると配線漏れが型で検出できないため必須とする。
   */
  onUndo: () => void;
  /** 取り消した編集をやり直す（48.2） */
  onRedo: () => void;
  /** キー操作を有効にするか（既定は有効） */
  enabled?: boolean;
}

/** useEstimateKeyboard フックの戻り値 */
export interface UseEstimateKeyboardResult {
  /**
   * 明細領域のルート要素へ広げる props
   *
   * `tabIndex` は「行がアンマウントされてもキー操作を続けられる」ための受け皿。
   * 階層移動や表示モード切替は行そのものを描画し直すため、フォーカスの行き先が
   * 無いと以降のキー操作が画面へ届かなくなる。
   */
  readonly keyboardProps: {
    readonly onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
    readonly tabIndex: number;
  };
}

// ============================================================================
// 内部ヘルパー
// ============================================================================

/** 指定した行キーの要素へフォーカスを移す（存在しなければ領域そのものへ） */
function focusRow(container: HTMLElement, key: NodeKey | null): void {
  if (key !== null) {
    for (const row of container.querySelectorAll<HTMLElement>(`[${ESTIMATE_ROW_KEY_ATTRIBUTE}]`)) {
      if (row.getAttribute(ESTIMATE_ROW_KEY_ATTRIBUTE) === key) {
        row.focus();
        return;
      }
    }
  }
  container.focus();
}

/** 現在階層の親（＝一つ上の階層）を求める */
function parentLevelKeyOf(
  items: readonly EditableItem[],
  currentLevelKey: NodeKey | null
): NodeKey | null {
  if (currentLevelKey === null) {
    return null;
  }
  const path = pathTo(items, currentLevelKey);
  const parent = path[path.length - 2];
  return parent === undefined ? null : nodeKeyOf(parent);
}

// ============================================================================
// フック
// ============================================================================

/**
 * 明細のキー操作を配線する
 *
 * @example
 * ```tsx
 * const keyboard = useEstimateKeyboard({ ...state, commands: editorCommands });
 * <div {...keyboard.keyboardProps}>{table}</div>
 * ```
 */
export function useEstimateKeyboard(
  options: UseEstimateKeyboardOptions
): UseEstimateKeyboardResult {
  const {
    items,
    viewMode,
    currentLevelKey,
    visibleKeys,
    selectedKeys,
    cursorKey,
    commands,
    onSelectSingle,
    onExtendSelectionTo,
    onClearSelection,
    onViewModeChange,
    onCurrentLevelChange,
    onUndo,
    onRedo,
    enabled = true,
  } = options;

  /**
   * 現在階層（表示に用いられている実効値）
   *
   * 編集で現在階層の項目が消えた場合はルート階層として扱う。表示（明細テーブル）と
   * 同じ規則を用いないと、階層移動のキーが画面と食い違う（54.3 の申し送り）。
   */
  const effectiveLevelKey = useMemo<NodeKey | null>(
    () =>
      currentLevelKey === null
        ? null
        : resolveLevelKey(pathTo(items, currentLevelKey), currentLevelKey),
    [items, currentLevelKey]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>): void => {
      if (!enabled) {
        return;
      }

      const container = event.currentTarget;
      const target = event.target;
      const context = resolveEstimateFocusContext(target, { selectedCount: selectedKeys.length });
      const command = ESTIMATE_KEYMAP.resolve(event.nativeEvent, context);
      if (command === null) {
        return;
      }

      const rowKey = resolveEstimateRowKey(target);
      // 範囲選択中は範囲全体、そうでなければフォーカスのある行が対象（47.6）
      const targetKeys: readonly NodeKey[] =
        context === 'rangeSelected' && selectedKeys.length >= 2
          ? selectedKeys
          : rowKey === null
            ? []
            : [rowKey];

      /**
       * コマンドを実行する。処理したら true（＝ブラウザ標準の動作を止める）
       *
       * 対象行（`rowKey` / `targetKeys`）と受け口（`container`）は同じ
       * キー操作の中で確定済みのため、引数ではなくこのスコープから読む。
       */
      const run = (resolved: EstimateCommand): boolean => {
        switch (resolved) {
          // --- 行操作（43.1: サーバーへ保存せず画面上の明細を更新する） -------
          case 'insertRow': {
            const anchor = targetKeys[targetKeys.length - 1];
            if (anchor === undefined) {
              return false;
            }
            commands.insertRowAfter(anchor);
            return true;
          }
          case 'deleteRow': {
            if (targetKeys.length === 0) {
              return false;
            }
            commands.deleteRows(targetKeys);
            onClearSelection();
            return true;
          }
          case 'duplicateCell': {
            if (targetKeys.length === 0) {
              return false;
            }
            commands.duplicateRows(targetKeys);
            return true;
          }
          case 'indent': {
            if (targetKeys.length === 0) {
              return false;
            }
            commands.indentRange(targetKeys);
            return true;
          }
          case 'outdent': {
            if (targetKeys.length === 0) {
              return false;
            }
            commands.outdentRange(targetKeys);
            return true;
          }

          // --- ツールバーの追加・並び替えに対応する操作（23.11 / Task 54.10） --
          //
          // 「選択中の項目」を要する操作は範囲選択中でも**先頭行**を対象にする。
          // 44.3 が範囲全体への適用を定めるのは削除・複写・階層の上げ下げの3つで、
          // 子項目追加や並び替えを範囲全体へ広げる規定はどの要件にも無い。
          case 'addRootItem': {
            commands.addRootItem();
            return true;
          }
          case 'addChildItem': {
            const parent = targetKeys[0];
            if (parent === undefined) {
              return false;
            }
            commands.addChildItem(parent);
            return true;
          }
          case 'addDiscountRow': {
            commands.addDiscountRow();
            return true;
          }
          case 'addNoteRow': {
            commands.addNoteRow(targetKeys[0] ?? null);
            return true;
          }
          case 'reorderRowUp':
          case 'reorderRowDown': {
            const target = targetKeys[0];
            if (target === undefined) {
              return false;
            }
            commands.reorderRow(target, resolved === 'reorderRowUp' ? 'up' : 'down');
            return true;
          }

          // --- 範囲選択（44.1, 44.2, 47.6, 47.7） --------------------------
          case 'toggleRangeSelect': {
            // 範囲選択は上下の2キーが同じコマンドへ解決されるため、向きだけをキーから取る
            const step = event.key === 'ArrowUp' ? -1 : 1;
            const base = cursorKey ?? rowKey;
            if (base === null) {
              return false;
            }
            const baseIndex = visibleKeys.indexOf(base);
            const next = baseIndex === -1 ? undefined : visibleKeys[baseIndex + step];
            if (next === undefined) {
              // 端では選択を変えない。ブラウザのスクロールだけは止める
              return true;
            }
            if (selectedKeys.length === 0) {
              onSelectSingle(base);
            }
            onExtendSelectionTo(next);
            focusRow(container, next);
            return true;
          }
          case 'clearSelection': {
            onClearSelection();
            // セルの入力中なら行そのものへフォーカスを移し、続けて行操作を行える状態にする
            focusRow(container, rowKey);
            return true;
          }

          // --- 階層間の移動（45.8, 45.9） -----------------------------------
          case 'drillDown': {
            if (viewMode !== 'drilldown' || rowKey === null) {
              return false;
            }
            if (childrenOf(items, rowKey).length === 0) {
              return false;
            }
            onCurrentLevelChange(rowKey);
            container.focus();
            return true;
          }
          case 'drillUp': {
            if (viewMode !== 'drilldown' || effectiveLevelKey === null) {
              return false;
            }
            onCurrentLevelChange(parentLevelKeyOf(items, effectiveLevelKey));
            container.focus();
            return true;
          }
          case 'firstRowInLevel':
          case 'lastRowInLevel': {
            const key =
              resolved === 'firstRowInLevel' ? visibleKeys[0] : visibleKeys[visibleKeys.length - 1];
            if (key === undefined) {
              return false;
            }
            onSelectSingle(key);
            focusRow(container, key);
            return true;
          }
          case 'prevLevel':
          case 'nextLevel': {
            if (viewMode !== 'drilldown' || effectiveLevelKey === null) {
              return false;
            }
            const siblings = childrenOf(items, parentLevelKeyOf(items, effectiveLevelKey)).map(
              nodeKeyOf
            );
            const index = siblings.indexOf(effectiveLevelKey);
            const next = siblings[index + (resolved === 'prevLevel' ? -1 : 1)];
            if (index === -1 || next === undefined) {
              return false;
            }
            onCurrentLevelChange(next);
            container.focus();
            return true;
          }

          // --- 表示モード（45.1） -------------------------------------------
          case 'toggleViewMode': {
            onViewModeChange(viewMode === 'tree' ? 'drilldown' : 'tree');
            container.focus();
            return true;
          }

          // --- 取り消し・やり直し（48.1, 48.2） -----------------------------
          //
          // 解決できた時点で `preventDefault` する（呼び出し元が `true` を受けて
          // 止める）。止めないとブラウザ標準の取り消しが同じキーで重ねて働き、
          // 明細の取り消しとセルの文字取り消しが同時に起きる。文字入力中は
          // `cellEditing` に割当が無いためここへ来ない（47.5）。
          case 'undo': {
            onUndo();
            return true;
          }
          case 'redo': {
            onRedo();
            return true;
          }
        }
      };

      if (run(command)) {
        // 解決できたキーだけを止める。割当の無いキーはブラウザ標準の
        // 振る舞い（Tab のセル間移動など）をそのまま通す（47.2, 47.4）
        event.preventDefault();
      }
    },
    [
      enabled,
      items,
      viewMode,
      effectiveLevelKey,
      visibleKeys,
      selectedKeys,
      cursorKey,
      commands,
      onSelectSingle,
      onExtendSelectionTo,
      onClearSelection,
      onViewModeChange,
      onCurrentLevelChange,
      onUndo,
      onRedo,
    ]
  );

  return useMemo(
    () => ({ keyboardProps: { onKeyDown: handleKeyDown, tabIndex: -1 } }),
    [handleKeyDown]
  );
}

export default useEstimateKeyboard;
