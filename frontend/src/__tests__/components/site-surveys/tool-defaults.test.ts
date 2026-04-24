/**
 * @fileoverview 各注釈ツールの既定値定数がトークン参照になっていることを検証するテスト
 *
 * Task 64.3: 各ツール側の既定値定数をトークン参照へ差し替え
 *
 * Requirements:
 * - 26.1: 矢印・寸法線・罫線系の初期線幅を3論理ピクセル以上に設定する
 * - 26.2: 矢印・テキストの初期本体色を赤系または橙系の有彩色に設定する
 * - 26.5: 各ツールの既定色・既定線幅・既定白縁取り有無を一元管理する
 *
 * 各 DEFAULT_*_OPTIONS が `ANNOTATION_DEFAULTS` を参照していることを
 * 値の同一性で検証する。これにより将来トークン値を変更しても
 * テストは自動的に追従する（一元管理の不変条件を保つ）。
 */

import { describe, it, expect } from 'vitest';

import { ANNOTATION_DEFAULTS } from '../../../components/site-surveys/annotation-style-tokens';
import { DEFAULT_ARROW_OPTIONS } from '../../../components/site-surveys/tools/ArrowTool';
import { DEFAULT_CIRCLE_OPTIONS } from '../../../components/site-surveys/tools/CircleTool';
import { DEFAULT_DIMENSION_OPTIONS } from '../../../components/site-surveys/tools/DimensionTool';
import { DEFAULT_FREEHAND_OPTIONS } from '../../../components/site-surveys/tools/FreehandTool';
import { DEFAULT_POLYGON_OPTIONS } from '../../../components/site-surveys/tools/PolygonTool';
import { DEFAULT_POLYLINE_OPTIONS } from '../../../components/site-surveys/tools/PolylineTool';
import { DEFAULT_RECTANGLE_OPTIONS } from '../../../components/site-surveys/tools/RectangleTool';
import { DEFAULT_TEXT_OPTIONS } from '../../../components/site-surveys/tools/TextTool';

// ============================================================================
// Req 26.1: 初期線幅の最小値
// ============================================================================

describe('Req 26.1: 初期線幅が 3px 以上であること（ツール別既定）', () => {
  it('Arrow の既定 strokeWidth は 3 以上', () => {
    expect(DEFAULT_ARROW_OPTIONS.strokeWidth).toBeGreaterThanOrEqual(3);
  });

  it('Dimension の既定 strokeWidth は 3 以上', () => {
    expect(DEFAULT_DIMENSION_OPTIONS.strokeWidth).toBeGreaterThanOrEqual(3);
  });

  it('Rectangle の既定 strokeWidth は 3 以上', () => {
    expect(DEFAULT_RECTANGLE_OPTIONS.strokeWidth).toBeGreaterThanOrEqual(3);
  });

  it('Circle の既定 strokeWidth は 3 以上', () => {
    expect(DEFAULT_CIRCLE_OPTIONS.strokeWidth).toBeGreaterThanOrEqual(3);
  });

  it('Polygon の既定 strokeWidth は 3 以上', () => {
    expect(DEFAULT_POLYGON_OPTIONS.strokeWidth).toBeGreaterThanOrEqual(3);
  });

  it('Polyline の既定 strokeWidth は 3 以上', () => {
    expect(DEFAULT_POLYLINE_OPTIONS.strokeWidth).toBeGreaterThanOrEqual(3);
  });

  it('Freehand の既定 strokeWidth は 3 以上', () => {
    expect(DEFAULT_FREEHAND_OPTIONS.strokeWidth).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// Req 26.5: 各ツールの既定値がトークン (ANNOTATION_DEFAULTS) を参照していること
// ============================================================================

describe('Req 26.5: 各ツールの既定値は ANNOTATION_DEFAULTS を参照する', () => {
  describe('stroke（本体色）', () => {
    it('DEFAULT_ARROW_OPTIONS.stroke === ANNOTATION_DEFAULTS.stroke', () => {
      expect(DEFAULT_ARROW_OPTIONS.stroke).toBe(ANNOTATION_DEFAULTS.stroke);
    });

    it('DEFAULT_CIRCLE_OPTIONS.stroke === ANNOTATION_DEFAULTS.stroke', () => {
      expect(DEFAULT_CIRCLE_OPTIONS.stroke).toBe(ANNOTATION_DEFAULTS.stroke);
    });

    it('DEFAULT_RECTANGLE_OPTIONS.stroke === ANNOTATION_DEFAULTS.stroke', () => {
      expect(DEFAULT_RECTANGLE_OPTIONS.stroke).toBe(ANNOTATION_DEFAULTS.stroke);
    });

    it('DEFAULT_POLYGON_OPTIONS.stroke === ANNOTATION_DEFAULTS.stroke', () => {
      expect(DEFAULT_POLYGON_OPTIONS.stroke).toBe(ANNOTATION_DEFAULTS.stroke);
    });

    it('DEFAULT_POLYLINE_OPTIONS.stroke === ANNOTATION_DEFAULTS.stroke', () => {
      expect(DEFAULT_POLYLINE_OPTIONS.stroke).toBe(ANNOTATION_DEFAULTS.stroke);
    });

    it('DEFAULT_FREEHAND_OPTIONS.stroke === ANNOTATION_DEFAULTS.stroke', () => {
      expect(DEFAULT_FREEHAND_OPTIONS.stroke).toBe(ANNOTATION_DEFAULTS.stroke);
    });

    it('DEFAULT_DIMENSION_OPTIONS.stroke === ANNOTATION_DEFAULTS.stroke', () => {
      expect(DEFAULT_DIMENSION_OPTIONS.stroke).toBe(ANNOTATION_DEFAULTS.stroke);
    });
  });

  describe('strokeWidth（線幅）', () => {
    it('DEFAULT_ARROW_OPTIONS.strokeWidth === ANNOTATION_DEFAULTS.strokeWidth', () => {
      expect(DEFAULT_ARROW_OPTIONS.strokeWidth).toBe(ANNOTATION_DEFAULTS.strokeWidth);
    });

    it('DEFAULT_CIRCLE_OPTIONS.strokeWidth === ANNOTATION_DEFAULTS.strokeWidth', () => {
      expect(DEFAULT_CIRCLE_OPTIONS.strokeWidth).toBe(ANNOTATION_DEFAULTS.strokeWidth);
    });

    it('DEFAULT_RECTANGLE_OPTIONS.strokeWidth === ANNOTATION_DEFAULTS.strokeWidth', () => {
      expect(DEFAULT_RECTANGLE_OPTIONS.strokeWidth).toBe(ANNOTATION_DEFAULTS.strokeWidth);
    });

    it('DEFAULT_POLYGON_OPTIONS.strokeWidth === ANNOTATION_DEFAULTS.strokeWidth', () => {
      expect(DEFAULT_POLYGON_OPTIONS.strokeWidth).toBe(ANNOTATION_DEFAULTS.strokeWidth);
    });

    it('DEFAULT_POLYLINE_OPTIONS.strokeWidth === ANNOTATION_DEFAULTS.strokeWidth', () => {
      expect(DEFAULT_POLYLINE_OPTIONS.strokeWidth).toBe(ANNOTATION_DEFAULTS.strokeWidth);
    });

    it('DEFAULT_FREEHAND_OPTIONS.strokeWidth === ANNOTATION_DEFAULTS.strokeWidth', () => {
      expect(DEFAULT_FREEHAND_OPTIONS.strokeWidth).toBe(ANNOTATION_DEFAULTS.strokeWidth);
    });

    it('DEFAULT_DIMENSION_OPTIONS.strokeWidth === ANNOTATION_DEFAULTS.strokeWidth', () => {
      expect(DEFAULT_DIMENSION_OPTIONS.strokeWidth).toBe(ANNOTATION_DEFAULTS.strokeWidth);
    });
  });

  describe('Text の本体色（fill）と fontSize', () => {
    it('DEFAULT_TEXT_OPTIONS.fill === ANNOTATION_DEFAULTS.stroke （本体色は赤系トークン）', () => {
      expect(DEFAULT_TEXT_OPTIONS.fill).toBe(ANNOTATION_DEFAULTS.stroke);
    });

    it('DEFAULT_TEXT_OPTIONS.fontSize === ANNOTATION_DEFAULTS.fontSize', () => {
      expect(DEFAULT_TEXT_OPTIONS.fontSize).toBe(ANNOTATION_DEFAULTS.fontSize);
    });
  });
});

// ============================================================================
// Req 26.2: 初期本体色が赤系/橙系（黒ではない）であること（Arrow/Text）
// ============================================================================

describe('Req 26.2: 矢印・テキストの初期本体色は赤系または橙系', () => {
  it('Arrow の既定 stroke は黒 (#000000) ではない', () => {
    expect(DEFAULT_ARROW_OPTIONS.stroke.toLowerCase()).not.toBe('#000000');
  });

  it('Text の既定 fill は黒 (#000000) ではない', () => {
    expect(DEFAULT_TEXT_OPTIONS.fill.toLowerCase()).not.toBe('#000000');
  });
});
