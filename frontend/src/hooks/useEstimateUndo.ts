/**
 * @fileoverview useEstimateUndo - 明細の編集操作の取り消し・やり直し
 *
 * Task 54.8: 編集操作の取り消しとやり直し
 *
 * 編集状態（`estimateEditReducer` の state）のスナップショットを既存の
 * `UndoManager` に載せ、取り消し・やり直しをサーバーへの問い合わせ無しで行います。
 *
 * ## 取り消しの単位は state スナップショット（design.md:4149）
 *
 * reducer が純粋であるため、遷移の**直前の state を保持するだけ**で復元でき、
 * 操作ごとの逆操作を実装する必要がない。やり直しに必要な「操作後の state」は
 * 記録時点では存在しない（まだ遷移していない）ため、取り消しを行う瞬間に
 * その時点の state を捉えてコマンドへ持たせる。
 *
 * ## Build-vs-Adopt: Adopt（design.md:4148）
 *
 * 履歴の保持・上限・状態通知は既存の `UndoManager`（コマンドパターン、
 * 上限はコンストラクタ引数）と `useUndoState` をそのまま用いる。
 * 本フックが足すのは「スナップショットをコマンドへ載せる」ことだけ。
 *
 * Requirements (estimate-creation):
 * - 48.1: 明細に対する編集操作の取り消し（元に戻す）を提供する
 * - 48.2: 取り消した操作のやり直しを提供する
 * - 48.3: 取り消し可能な操作の履歴を直近10回分とする（`new UndoManager(10)`）
 * - 48.4: 取り消し可能な履歴が存在しない場合、取り消し操作を無効状態で表示する
 *   （`canUndo` / `canRedo` を React state として供給する）
 * - 48.5: 取り消し・やり直しはサーバーへの保存を伴わずに画面上の明細を更新する
 *   （本モジュールは API モジュールを一切 import しない）
 * - 48.6: 影響を受ける親項目の金額合計を再計算して表示する
 *   （集計済みの state をそのまま復元するため、再計算結果も同時に戻る）
 * - 48.7: 保存操作が成功した場合、取り消し履歴を破棄する（`clearOnSave`）。
 *   あわせて、編集の基準となるツリーが差し替わった場合も破棄する（`clearHistory`）。
 *   スナップショットは差し替え前のツリーを前提とするため、残すと別のツリーの状態へ
 *   復元でき、サーバー側書き込みで作られた行を次の保存で消してしまう。
 * - 48.8: 転記・案分・利益率適用・諸経費追加・値引き追加による変更も対象に含める
 *   （適用の直前に `recordSnapshot` を呼べばよい。段階3（55.5, 55.6）でこれらが
 *   クライアント計算へ移る際も、`useEstimateEditor` を経由する限り自動的に含まれる）
 *
 * Design: design.md `##### useEstimateUndo`（:4123-4151）
 *
 * @module hooks/useEstimateUndo
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { UndoManager } from '../services/UndoManager';
import { useUndoState } from './useUndoState';
import type { EstimateEditState } from '../domain/estimate/estimateEditReducer.types';

// ============================================================================
// 定数
// ============================================================================

/**
 * 取り消し可能な履歴の上限（48.3）
 *
 * `UndoManager` は上限を超えた分を最古から捨てる（FIFO）。
 */
export const ESTIMATE_UNDO_HISTORY_LIMIT = 10;

// ============================================================================
// 型定義（design.md `##### useEstimateUndo` の契約）
// ============================================================================

/** useEstimateUndo フックの引数 */
export interface UseEstimateUndoOptions {
  /** 現在の編集状態を返す（呼び出し時点の最新を返すこと） */
  readonly getState: () => EstimateEditState;
  /** 編集状態を丸ごと差し替える */
  readonly restoreState: (state: EstimateEditState) => void;
}

/** useEstimateUndo フックの戻り値 */
export interface UseEstimateUndoReturn {
  /** 取り消せる履歴があるか（48.4 の無効表示の判定） */
  readonly canUndo: boolean;
  /** やり直せる履歴があるか（48.4） */
  readonly canRedo: boolean;
  /**
   * 編集操作の**直前**に現在の状態を履歴へ積む（48.1, 48.8）
   *
   * @param label 履歴の説明（デバッグ・ログ用。画面表示には用いない）
   */
  recordSnapshot(label: string): void;
  /** 直前の編集を取り消す（48.1） */
  undo(): void;
  /** 取り消した編集をやり直す（48.2） */
  redo(): void;
  /** 保存成功時に履歴を破棄する（48.7） */
  clearOnSave(): void;
  /**
   * 編集の基準が入れ替わったときに履歴を破棄する（48.7）
   *
   * 履歴は「その時点のツリー」を前提としたスナップショットなので、読み込み・
   * サーバー側書き込み後の再同期などで**別のツリーへ差し替わった**あとに残しては
   * ならない。残すと、やり直しがサーバー由来の行を含まない古いツリーを復元し、
   * 次の保存でその行を消してしまう。
   */
  clearHistory(): void;
}

// ============================================================================
// フック
// ============================================================================

/**
 * 明細の編集操作の取り消し・やり直し
 *
 * @example
 * ```tsx
 * const undo = useEstimateUndo({
 *   getState: () => editor.editState,
 *   restoreState: editor.restoreState,
 * });
 *
 * // 編集の直前に積む（`useEstimateEditor` の `onBeforeChange` が呼ぶ）
 * undo.recordSnapshot('行削除');
 * ```
 */
export function useEstimateUndo(options: UseEstimateUndoOptions): UseEstimateUndoReturn {
  /**
   * 最新の引数を保持する
   *
   * `getState` は「記録時点の状態」と「取り消し時点の状態」をそれぞれ捉える必要が
   * あり、コマンドを作った描画に閉じた値では足りない。コミット後に更新した参照を
   * 使うことで、返す関数の同一性を保ったまま常に最新の経路を用いる。
   */
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // 履歴の上限は 10（48.3）。画面が生きている間は同一インスタンスを使う
  const undoManager = useMemo(() => new UndoManager(ESTIMATE_UNDO_HISTORY_LIMIT), []);

  // canUndo / canRedo の React state 化と、保存成功時の履歴破棄（48.4, 48.7）
  const { canUndo, canRedo, clearOnSave } = useUndoState({ undoManager });

  /**
   * 編集操作の直前の状態を履歴へ積む（48.1）
   *
   * 操作そのものは呼び出し側が行うため、`execute()` を伴わない追加
   * （`pushWithoutExecute`）を用いる。やり直し用の状態は取り消しの瞬間に確定する。
   */
  const recordSnapshot = useCallback(
    (label: string): void => {
      const before = optionsRef.current.getState();
      let after: EstimateEditState | null = null;

      undoManager.pushWithoutExecute({
        type: label,
        // やり直し: 取り消し時に控えた「操作後の状態」へ戻す（48.2）
        execute: () => {
          if (after !== null) {
            optionsRef.current.restoreState(after);
          }
        },
        // 取り消し: いまの状態をやり直し用に控えてから、操作前の状態へ戻す（48.1）
        undo: () => {
          after = optionsRef.current.getState();
          optionsRef.current.restoreState(before);
        },
      });
    },
    [undoManager]
  );

  /** 直前の編集を取り消す（履歴が無ければ `UndoManager` が何もしない / 48.4） */
  const undo = useCallback((): void => {
    undoManager.undo();
  }, [undoManager]);

  /** 取り消した編集をやり直す（48.2） */
  const redo = useCallback((): void => {
    undoManager.redo();
  }, [undoManager]);

  return useMemo(
    () => ({
      canUndo,
      canRedo,
      recordSnapshot,
      undo,
      redo,
      clearOnSave,
      // 破棄そのものは保存時と同じ（`UndoManager.clear()`）。呼ばれる理由が
      // 「保存の確定」ではなく「基準ツリーの入れ替え」であることを名前で区別する。
      clearHistory: clearOnSave,
    }),
    [canUndo, canRedo, recordSnapshot, undo, redo, clearOnSave]
  );
}

export default useEstimateUndo;
