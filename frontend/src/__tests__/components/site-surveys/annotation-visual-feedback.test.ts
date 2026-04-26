/**
 * @fileoverview annotation-visual-feedback - ハンドルサイズとツールカーソル適用の単体テスト
 *
 * Task 71.1 (Req 29.4, 29.5): matchMedia('(pointer: coarse)') によりタッチ/マウスを判定し、
 *   FabricObject.ownDefaults.cornerSize / touchCornerSize をそれぞれ適切な値に設定する。
 * Task 71.2 (Req 29.2): ツール別カーソルマップを Canvas に適用する。
 *
 * Boundary: Visual Feedback
 *
 * @requirement site-survey/REQ-29.2
 * @requirement site-survey/REQ-29.4
 * @requirement site-survey/REQ-29.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FabricObject } from 'fabric';
import type { Canvas } from 'fabric';
import {
  configureHandleSizes,
  applyToolCursor,
  TOOL_CURSOR_MAP,
} from '../../../components/site-surveys/annotation-visual-feedback';
import { TOOL_DEFINITIONS } from '../../../components/site-surveys/annotation-toolbar.constants';
import type { ToolType } from '../../../components/site-surveys/annotation-toolbar.constants';

// ============================================================================
// matchMedia モック
// ============================================================================

type MatchMediaImpl = (query: string) => MediaQueryList;
let originalMatchMedia: MatchMediaImpl | undefined;

/**
 * matchMedia('(pointer: coarse)') の返却 matches を指定して mock する。
 */
function mockPointerCoarse(matchesForCoarse: boolean): void {
  const impl: MatchMediaImpl = (query: string) => {
    const matches = query.includes('pointer: coarse') ? matchesForCoarse : false;
    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };
  (window as unknown as { matchMedia: MatchMediaImpl }).matchMedia = impl;
}

// ============================================================================
// ownDefaults スナップショット（テスト間の汚染防止）
// ============================================================================

let originalCornerSize: number | undefined;
let originalTouchCornerSize: number | undefined;

beforeEach(() => {
  originalMatchMedia = (window as unknown as { matchMedia?: MatchMediaImpl }).matchMedia;
  originalCornerSize = FabricObject.ownDefaults.cornerSize;
  originalTouchCornerSize = FabricObject.ownDefaults.touchCornerSize;
});

afterEach(() => {
  if (originalMatchMedia) {
    (window as unknown as { matchMedia: MatchMediaImpl }).matchMedia = originalMatchMedia;
  } else {
    delete (window as unknown as { matchMedia?: MatchMediaImpl }).matchMedia;
  }
  // ownDefaults をテスト開始時点に戻す（ライブラリ共有状態の汚染を回避）
  FabricObject.ownDefaults.cornerSize = originalCornerSize as number;
  FabricObject.ownDefaults.touchCornerSize = originalTouchCornerSize as number;
});

// ============================================================================
// configureHandleSizes (Task 71.1 / Req 29.4, 29.5)
// ============================================================================

describe('configureHandleSizes (Task 71.1, Req 29.4/29.5)', () => {
  it('タッチデバイス判定時は FabricObject.ownDefaults.cornerSize = 20, touchCornerSize = 40 を設定する', () => {
    mockPointerCoarse(true);

    configureHandleSizes();

    expect(FabricObject.ownDefaults.cornerSize).toBe(20);
    expect(FabricObject.ownDefaults.touchCornerSize).toBe(40);
  });

  it('マウス環境判定時は FabricObject.ownDefaults.cornerSize = 13, touchCornerSize = 24 を設定する', () => {
    mockPointerCoarse(false);

    configureHandleSizes();

    expect(FabricObject.ownDefaults.cornerSize).toBe(13);
    expect(FabricObject.ownDefaults.touchCornerSize).toBe(24);
  });

  it('matchMedia が存在しない環境ではマウス向け既定値 (13 / 24) にフォールバックする', () => {
    // SSR 想定: window.matchMedia が未定義のケース
    delete (window as unknown as { matchMedia?: MatchMediaImpl }).matchMedia;

    configureHandleSizes();

    expect(FabricObject.ownDefaults.cornerSize).toBe(13);
    expect(FabricObject.ownDefaults.touchCornerSize).toBe(24);
  });

  it('適用した cornerSize は configureHandleSizes 呼出後に新規作成した FabricObject の既定値へ反映される', () => {
    mockPointerCoarse(true);

    configureHandleSizes();

    // FabricObject.getDefaults() は ownDefaults を返す（Fabric v6+）
    const defaults = FabricObject.getDefaults() as Record<string, unknown>;
    expect(defaults.cornerSize).toBe(20);
    expect(defaults.touchCornerSize).toBe(40);
  });
});

// ============================================================================
// TOOL_CURSOR_MAP (Task 71.2 / Req 29.2)
// ============================================================================

describe('TOOL_CURSOR_MAP (Task 71.2, Req 29.2)', () => {
  it('全ての ToolType（TOOL_DEFINITIONS のキー）に対してエントリを保持する', () => {
    const allToolTypes = Object.keys(TOOL_DEFINITIONS) as ToolType[];
    for (const tool of allToolTypes) {
      expect(TOOL_CURSOR_MAP[tool]).toBeTypeOf('string');
      expect(TOOL_CURSOR_MAP[tool].length).toBeGreaterThan(0);
    }
  });

  it('選択ツールは default、描画系ツールは crosshair、テキストツールは text を返す', () => {
    expect(TOOL_CURSOR_MAP.select).toBe('default');
    expect(TOOL_CURSOR_MAP.arrow).toBe('crosshair');
    expect(TOOL_CURSOR_MAP.dimension).toBe('crosshair');
    expect(TOOL_CURSOR_MAP.circle).toBe('crosshair');
    expect(TOOL_CURSOR_MAP.rectangle).toBe('crosshair');
    expect(TOOL_CURSOR_MAP.polygon).toBe('crosshair');
    expect(TOOL_CURSOR_MAP.polyline).toBe('crosshair');
    expect(TOOL_CURSOR_MAP.freehand).toBe('crosshair');
    expect(TOOL_CURSOR_MAP.text).toBe('text');
  });
});

// ============================================================================
// applyToolCursor (Task 71.2 / Req 29.2)
// ============================================================================

describe('applyToolCursor (Task 71.2, Req 29.2)', () => {
  /**
   * Canvas の最小スタブ。Fabric.Canvas の実インスタンスは DOM と WebGL を要求するため、
   * カーソル関連プロパティのみ備えた軽量スタブで振る舞いを検証する。
   */
  const createCanvasStub = (): Canvas => {
    return {
      defaultCursor: 'default',
      hoverCursor: 'move',
      freeDrawingCursor: 'crosshair',
    } as unknown as Canvas;
  };

  it("applyToolCursor(canvas, 'arrow') が canvas.defaultCursor を 'crosshair' に設定する", () => {
    const canvas = createCanvasStub();

    applyToolCursor(canvas, 'arrow');

    expect(canvas.defaultCursor).toBe('crosshair');
  });

  it("applyToolCursor(canvas, 'arrow') が hoverCursor / freeDrawingCursor も 'crosshair' に揃える", () => {
    const canvas = createCanvasStub();

    applyToolCursor(canvas, 'arrow');

    expect(canvas.hoverCursor).toBe('crosshair');
    expect(canvas.freeDrawingCursor).toBe('crosshair');
  });

  it("applyToolCursor(canvas, 'text') は 'text' カーソルを適用する", () => {
    const canvas = createCanvasStub();

    applyToolCursor(canvas, 'text');

    expect(canvas.defaultCursor).toBe('text');
    expect(canvas.hoverCursor).toBe('text');
    expect(canvas.freeDrawingCursor).toBe('text');
  });

  it("applyToolCursor(canvas, 'select') は 'default' カーソルを適用する", () => {
    const canvas = createCanvasStub();

    applyToolCursor(canvas, 'select');

    expect(canvas.defaultCursor).toBe('default');
    expect(canvas.hoverCursor).toBe('default');
    expect(canvas.freeDrawingCursor).toBe('default');
  });
});
