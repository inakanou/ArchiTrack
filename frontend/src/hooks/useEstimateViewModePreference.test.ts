/**
 * @fileoverview useEstimateViewModePreference フックのテスト
 *
 * Task 54.4: 表示モードの切替と引き継ぎ
 *
 * 選択した階層表示モードを**端末単位で**保持し、次回の画面表示時に引き継ぐこと
 * （45.11）と、保存値が無い・壊れている・将来の版で増えた値だった場合に
 * 既定の「ツリー表示」へ縮退し例外を投げないこと（45.2）を検証します。
 *
 * Requirements (estimate-creation):
 * - 45.2: 階層表示モードのデフォルトを「ツリー表示」とする
 * - 45.11: 選択した階層表示モードを次回の画面表示時にも引き継ぐ
 *
 * Design: design.md `#### 階層表示モードの状態遷移（45.1〜45.11）`（:3833-3855）
 * 「モードは端末単位で永続化する」
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  ESTIMATE_VIEW_MODE_STORAGE_KEY,
  loadEstimateViewMode,
  saveEstimateViewMode,
  useEstimateViewModePreference,
} from './useEstimateViewModePreference';

describe('useEstimateViewModePreference', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  // ==========================================================================
  // 読み出し（45.2, 45.11）
  // ==========================================================================

  describe('保存済みモードの読み出し', () => {
    /** @requirement estimate-creation/REQ-45.2 */
    it('保存値が無い初回の表示ではツリー表示を返す', () => {
      expect(loadEstimateViewMode()).toBe('tree');
    });

    /** @requirement estimate-creation/REQ-45.11 */
    it('保存済みのドリルダウン表示を引き継ぐ', () => {
      window.localStorage.setItem(ESTIMATE_VIEW_MODE_STORAGE_KEY, 'drilldown');

      expect(loadEstimateViewMode()).toBe('drilldown');
    });

    /** @requirement estimate-creation/REQ-45.11 */
    it('保存済みのツリー表示を引き継ぐ', () => {
      window.localStorage.setItem(ESTIMATE_VIEW_MODE_STORAGE_KEY, 'tree');

      expect(loadEstimateViewMode()).toBe('tree');
    });

    /** @requirement estimate-creation/REQ-45.2 */
    it('壊れた保存値は既定のツリー表示へ縮退し例外を投げない', () => {
      window.localStorage.setItem(ESTIMATE_VIEW_MODE_STORAGE_KEY, '{"viewMode":');

      expect(() => loadEstimateViewMode()).not.toThrow();
      expect(loadEstimateViewMode()).toBe('tree');
    });

    /** @requirement estimate-creation/REQ-45.2 */
    it('将来の版で増えた未知のモードは既定のツリー表示へ縮退する', () => {
      window.localStorage.setItem(ESTIMATE_VIEW_MODE_STORAGE_KEY, 'matrix');

      expect(loadEstimateViewMode()).toBe('tree');
    });

    /** @requirement estimate-creation/REQ-45.2 */
    it('空文字の保存値も既定のツリー表示へ縮退する', () => {
      window.localStorage.setItem(ESTIMATE_VIEW_MODE_STORAGE_KEY, '');

      expect(loadEstimateViewMode()).toBe('tree');
    });

    /** @requirement estimate-creation/REQ-45.2 */
    it('保存領域の読み出しが失敗する環境でも既定のツリー表示を返す', () => {
      vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });

      expect(() => loadEstimateViewMode()).not.toThrow();
      expect(loadEstimateViewMode()).toBe('tree');
    });

    /** @requirement estimate-creation/REQ-45.2 */
    it('window が存在しない実行環境でも既定のツリー表示を返す', () => {
      vi.stubGlobal('window', undefined);

      expect(() => loadEstimateViewMode()).not.toThrow();
      expect(loadEstimateViewMode()).toBe('tree');
    });
  });

  // ==========================================================================
  // 書き込み（45.11）
  // ==========================================================================

  describe('選択モードの保存', () => {
    /** @requirement estimate-creation/REQ-45.11 */
    it('選択したモードを端末の保存領域へ書き込む', () => {
      saveEstimateViewMode('drilldown');

      expect(window.localStorage.getItem(ESTIMATE_VIEW_MODE_STORAGE_KEY)).toBe('drilldown');
      expect(loadEstimateViewMode()).toBe('drilldown');
    });

    /** @requirement estimate-creation/REQ-45.11 */
    it('保存したモードを上書きできる', () => {
      saveEstimateViewMode('drilldown');
      saveEstimateViewMode('tree');

      expect(loadEstimateViewMode()).toBe('tree');
    });

    /** @requirement estimate-creation/REQ-45.11 */
    it('保存領域が書き込めない環境でも呼び出し側へ例外を伝播しない', () => {
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });

      expect(() => saveEstimateViewMode('drilldown')).not.toThrow();
    });

    /** @requirement estimate-creation/REQ-45.11 */
    it('window が存在しない実行環境でも保存呼び出しが例外を投げない', () => {
      vi.stubGlobal('window', undefined);

      expect(() => saveEstimateViewMode('drilldown')).not.toThrow();
    });
  });

  // ==========================================================================
  // フックとしての振る舞い（45.2, 45.11）
  // ==========================================================================

  describe('フックの振る舞い', () => {
    /** @requirement estimate-creation/REQ-45.11 */
    it('初回描画時に保存済みモードを引き継ぐ', () => {
      window.localStorage.setItem(ESTIMATE_VIEW_MODE_STORAGE_KEY, 'drilldown');

      const { result } = renderHook(() => useEstimateViewModePreference());

      expect(result.current.initialViewMode).toBe('drilldown');
    });

    /** @requirement estimate-creation/REQ-45.2 */
    it('保存値が無ければ既定のツリー表示を初期値とする', () => {
      const { result } = renderHook(() => useEstimateViewModePreference());

      expect(result.current.initialViewMode).toBe('tree');
    });

    /**
     * 初期値は表示中に読み直さない。読み直すと保存の直後に再描画が起きた場合、
     * 表示モードの初期値が変わって現在の選択を上書きしてしまう。
     *
     * @requirement estimate-creation/REQ-45.11
     */
    it('表示中にモードを保存しても初期値は読み直さない', () => {
      const { result, rerender } = renderHook(() => useEstimateViewModePreference());
      expect(result.current.initialViewMode).toBe('tree');

      result.current.persist('drilldown');
      rerender();

      expect(result.current.initialViewMode).toBe('tree');
      // 保存自体は行われているので、次回の画面表示では引き継がれる
      expect(loadEstimateViewMode()).toBe('drilldown');
    });

    /** @requirement estimate-creation/REQ-45.11 */
    it('persist は再描画をまたいで同一の関数参照を保つ', () => {
      const { result, rerender } = renderHook(() => useEstimateViewModePreference());
      const first = result.current.persist;

      rerender();

      expect(result.current.persist).toBe(first);
    });

    /** @requirement estimate-creation/REQ-45.11 */
    it('persist が保存領域へ書き込み、次回の描画で引き継がれる', () => {
      const { result } = renderHook(() => useEstimateViewModePreference());

      result.current.persist('drilldown');

      const remounted = renderHook(() => useEstimateViewModePreference());
      expect(remounted.result.current.initialViewMode).toBe('drilldown');
    });
  });
});
