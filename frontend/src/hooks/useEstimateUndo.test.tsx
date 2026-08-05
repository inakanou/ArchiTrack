/**
 * @fileoverview useEstimateUndo のテスト
 *
 * Task 54.8: 編集操作の取り消しとやり直し
 *
 * 取り消しの単位は**アクションではなく state スナップショット**（design.md
 * `##### useEstimateUndo`:4149）。本ファイルは「スナップショットを積む → 戻る →
 * やり直す」という履歴そのものの振る舞いと、履歴上限・履歴破棄を固定します。
 * 画面一気通貫（サーバー書き込みが無いこと・親項目の集計金額の再計算）は
 * `EstimateDetailPage.undo.test.tsx` が実物のコンポーネントで固定します。
 *
 * Requirements (estimate-creation):
 * - 48.1: 明細に対する編集操作の取り消し（元に戻す）を提供する
 * - 48.2: 取り消した操作のやり直しを提供する
 * - 48.3: 取り消し可能な操作の履歴を直近10回分とする
 * - 48.4: 取り消し可能な履歴が存在しない場合、取り消し操作を無効状態で表示する
 * - 48.5: 取り消し・やり直しはサーバーへの保存を伴わずに画面上の明細を更新する
 * - 48.7: 保存操作が成功した場合、取り消し履歴を破棄する
 *
 * Design: design.md `##### useEstimateUndo`（:4123-4151）
 *
 * @module hooks/useEstimateUndo.test
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef, useState } from 'react';
import { useEstimateUndo, ESTIMATE_UNDO_HISTORY_LIMIT } from './useEstimateUndo';
import type { EstimateEditState } from '../domain/estimate/estimateEditReducer.types';

// ============================================================================
// テスト用の編集状態
// ============================================================================

/** 名称だけが異なる編集状態を作る（スナップショットの同一性を名称で判別する） */
const stateOf = (name: string, isDirty = true): EstimateEditState => ({
  items: [
    {
      id: 'item-1',
      tempId: null,
      itemType: 'STANDARD',
      lines: [
        {
          id: 'line-1',
          lineType: 'ESTIMATE',
          name,
          specification: null,
          unit: null,
          quantity: '1',
          unitPrice: '100',
          amount: '100',
          remarks: null,
          sourceVendorName: null,
        },
      ],
      children: [],
    },
  ],
  reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
  isDirty,
  lastError: null,
});

/** 現在の編集状態から名称を取り出す */
const nameOf = (state: EstimateEditState): string | null => state.items[0]?.lines[0]?.name ?? null;

/**
 * 編集状態の持ち主を模したハーネス
 *
 * 実際の持ち主は `useEstimateEditor`（reducer）。ここでは「現在の state を返す」
 * 「渡された state へ差し替える」という契約（`UseEstimateUndoOptions`）だけを満たす。
 */
function useUndoHarness(initial: EstimateEditState) {
  const [state, setState] = useState<EstimateEditState>(initial);
  const stateRef = useRef(state);
  stateRef.current = state;

  const undo = useEstimateUndo({
    getState: () => stateRef.current,
    restoreState: (next) => setState(next),
  });

  return {
    state,
    undo,
    /** 編集操作（取り消し対象）: 直前の state を積んでから変更する */
    edit: (name: string) => {
      undo.recordSnapshot(`名称を${name}へ変更`);
      setState(stateOf(name));
    },
  };
}

const renderUndo = (initial: EstimateEditState = stateOf('S0', false)) =>
  renderHook(() => useUndoHarness(initial));

// ============================================================================
// テスト
// ============================================================================

describe('useEstimateUndo', () => {
  // ==========================================================================
  // 履歴が無い状態（48.4）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-48.4 */
  it('履歴が無い間は取り消しもやり直しもできないこと (48.4)', () => {
    const { result } = renderUndo();

    expect(result.current.undo.canUndo).toBe(false);
    expect(result.current.undo.canRedo).toBe(false);
  });

  /** @requirement estimate-creation/REQ-48.4 */
  it('履歴が無い状態で取り消し・やり直しを呼んでも編集状態が変わらないこと (48.4)', () => {
    const { result } = renderUndo();

    act(() => {
      result.current.undo.undo();
      result.current.undo.redo();
    });

    expect(nameOf(result.current.state)).toBe('S0');
    expect(result.current.undo.canUndo).toBe(false);
    expect(result.current.undo.canRedo).toBe(false);
  });

  // ==========================================================================
  // 取り消し（48.1）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-48.1 */
  it('編集を記録すると取り消せるようになり、直前の状態へ戻ること (48.1, 48.4)', () => {
    const { result } = renderUndo();

    act(() => {
      result.current.edit('S1');
    });
    expect(nameOf(result.current.state)).toBe('S1');
    expect(result.current.undo.canUndo).toBe(true);

    act(() => {
      result.current.undo.undo();
    });

    expect(nameOf(result.current.state)).toBe('S0');
    expect(result.current.undo.canUndo).toBe(false);
  });

  /** @requirement estimate-creation/REQ-48.1 */
  it('複数回の編集を新しい順に取り消せること (48.1)', () => {
    const { result } = renderUndo();

    act(() => {
      result.current.edit('S1');
    });
    act(() => {
      result.current.edit('S2');
    });
    act(() => {
      result.current.edit('S3');
    });

    act(() => {
      result.current.undo.undo();
    });
    expect(nameOf(result.current.state)).toBe('S2');

    act(() => {
      result.current.undo.undo();
    });
    expect(nameOf(result.current.state)).toBe('S1');

    act(() => {
      result.current.undo.undo();
    });
    expect(nameOf(result.current.state)).toBe('S0');
    expect(result.current.undo.canUndo).toBe(false);
  });

  /**
   * 取り消しの単位は state スナップショット（design.md:4149）。
   * 復元された state は「操作前の state そのもの」でなければならない。
   *
   * @requirement estimate-creation/REQ-48.1
   */
  it('取り消しで未保存フラグを含む操作前の状態がそのまま戻ること (48.1)', () => {
    const initial = stateOf('S0', false);
    const { result } = renderUndo(initial);

    act(() => {
      result.current.edit('S1');
    });
    expect(result.current.state.isDirty).toBe(true);

    act(() => {
      result.current.undo.undo();
    });

    expect(result.current.state).toBe(initial);
    expect(result.current.state.isDirty).toBe(false);
  });

  // ==========================================================================
  // やり直し（48.2）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-48.2 */
  it('取り消した操作をやり直せること (48.2)', () => {
    const { result } = renderUndo();

    act(() => {
      result.current.edit('S1');
    });
    act(() => {
      result.current.undo.undo();
    });
    expect(nameOf(result.current.state)).toBe('S0');
    expect(result.current.undo.canRedo).toBe(true);

    act(() => {
      result.current.undo.redo();
    });

    expect(nameOf(result.current.state)).toBe('S1');
    expect(result.current.undo.canRedo).toBe(false);
    expect(result.current.undo.canUndo).toBe(true);
  });

  /** @requirement estimate-creation/REQ-48.2 */
  it('取り消しとやり直しを繰り返しても同じ状態を往復すること (48.1, 48.2)', () => {
    const { result } = renderUndo();

    act(() => {
      result.current.edit('S1');
    });
    act(() => {
      result.current.edit('S2');
    });

    act(() => {
      result.current.undo.undo();
    });
    act(() => {
      result.current.undo.undo();
    });
    expect(nameOf(result.current.state)).toBe('S0');

    act(() => {
      result.current.undo.redo();
    });
    expect(nameOf(result.current.state)).toBe('S1');

    act(() => {
      result.current.undo.redo();
    });
    expect(nameOf(result.current.state)).toBe('S2');

    act(() => {
      result.current.undo.undo();
    });
    expect(nameOf(result.current.state)).toBe('S1');
  });

  /** @requirement estimate-creation/REQ-48.2 */
  it('取り消した後に新しい編集を行うとやり直せなくなること (48.2)', () => {
    const { result } = renderUndo();

    act(() => {
      result.current.edit('S1');
    });
    act(() => {
      result.current.undo.undo();
    });
    expect(result.current.undo.canRedo).toBe(true);

    act(() => {
      result.current.edit('S9');
    });

    expect(result.current.undo.canRedo).toBe(false);
    expect(nameOf(result.current.state)).toBe('S9');
  });

  // ==========================================================================
  // 履歴の上限（48.3）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-48.3 */
  it('取り消し可能な履歴を直近10回分とすること (48.3)', () => {
    expect(ESTIMATE_UNDO_HISTORY_LIMIT).toBe(10);

    const { result } = renderUndo();

    // 11回編集する（最古の1件は破棄される）
    for (let i = 1; i <= 11; i += 1) {
      act(() => {
        result.current.edit(`S${i}`);
      });
    }
    expect(nameOf(result.current.state)).toBe('S11');

    // 10回は戻れる
    for (let i = 0; i < 10; i += 1) {
      expect(result.current.undo.canUndo).toBe(true);
      act(() => {
        result.current.undo.undo();
      });
    }

    // 11回目の取り消しはできない。最古の状態（S0）ではなく S1 で止まる
    expect(result.current.undo.canUndo).toBe(false);
    expect(nameOf(result.current.state)).toBe('S1');

    act(() => {
      result.current.undo.undo();
    });
    expect(nameOf(result.current.state)).toBe('S1');
  });

  // ==========================================================================
  // 保存成功時の履歴破棄（48.7）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-48.7 */
  it('保存成功時に取り消し履歴を破棄すること (48.7)', () => {
    const { result } = renderUndo();

    act(() => {
      result.current.edit('S1');
    });
    act(() => {
      result.current.edit('S2');
    });
    act(() => {
      result.current.undo.undo();
    });
    expect(result.current.undo.canUndo).toBe(true);
    expect(result.current.undo.canRedo).toBe(true);

    act(() => {
      result.current.undo.clearOnSave();
    });

    expect(result.current.undo.canUndo).toBe(false);
    expect(result.current.undo.canRedo).toBe(false);

    // 破棄後の取り消し・やり直しは編集状態を変えない
    const afterClear = result.current.state;
    act(() => {
      result.current.undo.undo();
      result.current.undo.redo();
    });
    expect(result.current.state).toBe(afterClear);
  });

  /** @requirement estimate-creation/REQ-48.7 */
  it('履歴破棄の後も新しい編集からは取り消せること (48.7, 48.1)', () => {
    const { result } = renderUndo();

    act(() => {
      result.current.edit('S1');
    });
    act(() => {
      result.current.undo.clearOnSave();
    });
    act(() => {
      result.current.edit('S2');
    });

    expect(result.current.undo.canUndo).toBe(true);

    act(() => {
      result.current.undo.undo();
    });

    expect(nameOf(result.current.state)).toBe('S1');
  });
});
