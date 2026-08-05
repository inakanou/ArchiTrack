/**
 * @fileoverview useEstimateViewModePreference フック - 階層表示モードの端末単位の永続化
 *
 * Task 54.4: 表示モードの切替と引き継ぎ
 *
 * 階層表示モードは**表示状態**であり保存ペイロードには含めない（design.md
 * 「状態には保存対象のみを保持する。表示状態（モード・選択・展開・カーソル）は
 * 保持しない」）。一方で 45.11 は「選択したモードを次回の画面表示時にも引き継ぐ」
 * ことを求めるため、サーバーではなく**端末（localStorage）**へ保持する
 * （design.md `#### 階層表示モードの状態遷移（45.1〜45.11）`「モードは端末単位で
 * 永続化する」）。見積書ごとではなく端末ごとに1つの設定として扱う。
 *
 * 表示状態の所有者は `useEstimateNavigation` のままで、本モジュールは
 * その `initialViewMode`（54.1 が用意した注入口）へ渡す値の読み書きだけを担う。
 *
 * 保存形式は生の文字列（`'tree'` / `'drilldown'`）で、JSON は用いない。
 * 読み出しは以下をいずれも既定の「ツリー表示」へ縮退させ、例外を投げない（45.2）:
 * - 保存値が無い（初回の表示）
 * - 壊れた値・空文字
 * - 将来の版で増えた未知のモード
 * - 保存領域そのものが使えない（プライベートブラウジング・SSR 等）
 *
 * Requirements (estimate-creation):
 * - 45.2: 階層表示モードのデフォルトを「ツリー表示」とする
 * - 45.11: 選択した階層表示モードを次回の画面表示時にも引き継ぐ
 *
 * @module hooks/useEstimateViewModePreference
 */

import { useCallback, useState } from 'react';
import type { EstimateViewMode } from './useEstimateNavigation';

// ============================================================================
// 定数
// ============================================================================

/** 階層表示モードの既定値（45.2） */
const DEFAULT_VIEW_MODE: EstimateViewMode = 'tree';

/** 受け入れる階層表示モードの一覧（これ以外は既定へ縮退させる） */
const KNOWN_VIEW_MODES: readonly EstimateViewMode[] = ['tree', 'drilldown'];

/**
 * 階層表示モードの保存キー
 *
 * 他機能の保存値と衝突しないよう `architrack.<機能>.<設定名>` の名前空間を用いる。
 */
export const ESTIMATE_VIEW_MODE_STORAGE_KEY = 'architrack.estimate.viewMode';

// ============================================================================
// 内部ヘルパー
// ============================================================================

/**
 * 保存領域を取得する
 *
 * SSR（`window` が無い）やプライベートブラウジング（アクセス自体が例外）でも
 * 呼び出し側を止めないよう、取得できない場合は null を返す。
 */
function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** 保存値を既知のモードへ解釈する。解釈できない値は既定へ縮退させる（45.2） */
function toViewMode(value: string | null): EstimateViewMode {
  return KNOWN_VIEW_MODES.find((mode) => mode === value) ?? DEFAULT_VIEW_MODE;
}

// ============================================================================
// 読み書き
// ============================================================================

/**
 * 保存済みの階層表示モードを読み出す（45.11）
 *
 * 保存値が無い・壊れている・未知の場合はツリー表示を返す（45.2）。
 */
export function loadEstimateViewMode(): EstimateViewMode {
  const storage = getStorage();
  if (storage === null) {
    return DEFAULT_VIEW_MODE;
  }
  try {
    return toViewMode(storage.getItem(ESTIMATE_VIEW_MODE_STORAGE_KEY));
  } catch {
    // 読み出しが拒否される環境（SecurityError 等）でも既定で表示を続ける
    return DEFAULT_VIEW_MODE;
  }
}

/**
 * 階層表示モードを端末へ保存する（45.11）
 *
 * 保存できない環境（容量超過・プライベートブラウジング等）でも、モード切替という
 * 表示操作を失敗させないため例外を伝播しない。この場合は次回の表示で既定へ戻る。
 */
export function saveEstimateViewMode(mode: EstimateViewMode): void {
  const storage = getStorage();
  if (storage === null) {
    return;
  }
  try {
    storage.setItem(ESTIMATE_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // 保存できないだけで表示は継続する
  }
}

// ============================================================================
// フック
// ============================================================================

/** useEstimateViewModePreference フックの戻り値 */
export interface UseEstimateViewModePreferenceResult {
  /**
   * 初回描画時に読み出した階層表示モード（45.2, 45.11）
   *
   * `useEstimateNavigation` の `initialViewMode` へ渡す。表示中は読み直さない。
   */
  readonly initialViewMode: EstimateViewMode;
  /** 選択した階層表示モードを端末へ保存する（45.11） */
  persist: (mode: EstimateViewMode) => void;
}

/**
 * 階層表示モードの端末単位の引き継ぎを担う（45.11）
 *
 * 初期値は**マウント時に一度だけ**読み出す。描画のたびに読み直すと、保存直後の
 * 再描画で初期値が現在の選択を上書きしうるため。
 *
 * @example
 * ```tsx
 * const viewModePreference = useEstimateViewModePreference();
 * const navigation = useEstimateNavigation({
 *   items: editor.editState.items,
 *   initialViewMode: viewModePreference.initialViewMode,
 * });
 * ```
 */
export function useEstimateViewModePreference(): UseEstimateViewModePreferenceResult {
  const [initialViewMode] = useState<EstimateViewMode>(loadEstimateViewMode);

  const persist = useCallback((mode: EstimateViewMode): void => {
    saveEstimateViewMode(mode);
  }, []);

  return { initialViewMode, persist };
}
