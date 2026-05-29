/**
 * @fileoverview 注釈スタイルトークンのユニットテスト
 *
 * Task 64.1: `annotation-style-tokens.ts` を新規作成しツール横断の既定値を一元化
 *
 * Requirements:
 * - 26.1: 初期線幅を3論理ピクセル以上に設定する
 * - 26.2: 初期本体色を赤系またはオレンジ系の有彩色に設定する
 * - 26.3: 初回選択時に白縁取り/白アウトラインが有効な初期状態で起動する
 * - 26.5: 各ツールの既定色・既定線幅・既定白縁取り有無を一元管理する
 *
 * テスト対象:
 * - ANNOTATION_DEFAULTS の各値が視認性要件を満たす
 * - getToolDefaults(tool) が各ツールの既定値を返す
 *
 * @requirement site-survey/REQ-26.1
 * @requirement site-survey/REQ-26.2
 * @requirement site-survey/REQ-26.3
 * @requirement site-survey/REQ-26.5
 */

import { describe, it, expect } from 'vitest';
import {
  ANNOTATION_DEFAULTS,
  getToolDefaults,
  type ShapeOutlineAttribute,
} from '../../../components/site-surveys/annotation-style-tokens';

describe('annotation-style-tokens', () => {
  describe('ANNOTATION_DEFAULTS', () => {
    it('既定線幅は 3 論理ピクセル以上である (Req 26.1)', () => {
      expect(ANNOTATION_DEFAULTS.strokeWidth).toBeGreaterThanOrEqual(3);
    });

    it('既定本体色は非空の16進カラーである (Req 26.2)', () => {
      expect(typeof ANNOTATION_DEFAULTS.stroke).toBe('string');
      expect(ANNOTATION_DEFAULTS.stroke).toMatch(/^#[0-9a-fA-F]{3,8}$/);
      expect(ANNOTATION_DEFAULTS.stroke.length).toBeGreaterThan(0);
    });

    it('矢印白縁取りは既定で有効である (Req 26.3)', () => {
      expect(ANNOTATION_DEFAULTS.arrowOutline.enabled).toBe(true);
    });

    it('矢印白縁取りの色は白である (Req 26.3)', () => {
      expect(ANNOTATION_DEFAULTS.arrowOutline.color).toBe('#ffffff');
    });

    it('矢印白縁取りの幅は正の数値である', () => {
      expect(ANNOTATION_DEFAULTS.arrowOutline.width).toBeGreaterThan(0);
    });

    it('テキスト白アウトラインは既定で有効である (Req 26.3)', () => {
      expect(ANNOTATION_DEFAULTS.textOutline.enabled).toBe(true);
    });

    it('テキスト白アウトラインの widthRatio は 0.10〜0.20 の範囲内である', () => {
      expect(ANNOTATION_DEFAULTS.textOutline.widthRatio).toBeGreaterThanOrEqual(0.1);
      expect(ANNOTATION_DEFAULTS.textOutline.widthRatio).toBeLessThanOrEqual(0.2);
    });

    it('既定フォントサイズは正の数値である', () => {
      expect(ANNOTATION_DEFAULTS.fontSize).toBeGreaterThan(0);
    });

    it('既定塗りつぶしは透明（空文字）である', () => {
      expect(ANNOTATION_DEFAULTS.fill).toBe('');
    });
  });

  describe('getToolDefaults', () => {
    it('矢印ツールの既定値は白縁取りが有効な設定を返す (Req 26.3, 26.5)', () => {
      const defaults = getToolDefaults('arrow');
      expect(defaults.arrowOutline.enabled).toBe(true);
      expect(defaults.arrowOutline.color).toBe('#ffffff');
      expect(defaults.strokeWidth).toBeGreaterThanOrEqual(3);
    });

    it('テキストツールの既定値は白アウトラインが有効な設定を返す (Req 26.3, 26.5)', () => {
      const defaults = getToolDefaults('text');
      expect(defaults.textOutline.enabled).toBe(true);
      expect(defaults.textOutline.widthRatio).toBeGreaterThanOrEqual(0.1);
      expect(defaults.textOutline.widthRatio).toBeLessThanOrEqual(0.2);
      expect(defaults.fontSize).toBeGreaterThan(0);
    });

    it('寸法線ツールの既定値も 3 ピクセル以上の線幅を返す (Req 26.1, 26.5)', () => {
      const defaults = getToolDefaults('dimension');
      expect(defaults.strokeWidth).toBeGreaterThanOrEqual(3);
    });
  });

  /**
   * Task 75.1 で追加された 6 形状 outline と dimensionLabelOutline の最低要件検証
   *
   * Requirements:
   * - 32.11: 各対象ツール初回起動時に白縁取りが有効な初期状態でツールを起動する
   * - 32.13: 既定白縁取り有無を Requirement 26 の設定資材一元管理の枠組みで管理する
   *
   * @requirement site-survey/REQ-32.11
   * @requirement site-survey/REQ-32.13
   */
  describe('6 形状 outline 既定値 (Req 32.11, 32.13)', () => {
    const shapeOutlineKeys = [
      'rectangleOutline',
      'circleOutline',
      'polygonOutline',
      'polylineOutline',
      'freehandOutline',
      'dimensionOutline',
    ] as const;

    it.each(shapeOutlineKeys)(
      '%s が ANNOTATION_DEFAULTS からエクスポートされ enabled === true である (Req 32.11, 32.13)',
      (key) => {
        const outline = ANNOTATION_DEFAULTS[key] as ShapeOutlineAttribute;
        expect(outline).toBeDefined();
        expect(outline.enabled).toBe(true);
      }
    );

    it.each(shapeOutlineKeys)('%s の width が正の数値である (Req 32.11)', (key) => {
      const outline = ANNOTATION_DEFAULTS[key] as ShapeOutlineAttribute;
      expect(typeof outline.width).toBe('number');
      expect(outline.width).toBeGreaterThan(0);
    });

    it.each(shapeOutlineKeys)('%s の color が白 (#ffffff) である (Req 32.11)', (key) => {
      const outline = ANNOTATION_DEFAULTS[key] as ShapeOutlineAttribute;
      expect(outline.color).toBe('#ffffff');
    });

    it('dimensionLabelOutline が enabled === true かつ widthRatio > 0 である (Req 32.11)', () => {
      expect(ANNOTATION_DEFAULTS.dimensionLabelOutline).toBeDefined();
      expect(ANNOTATION_DEFAULTS.dimensionLabelOutline.enabled).toBe(true);
      expect(ANNOTATION_DEFAULTS.dimensionLabelOutline.widthRatio).toBeGreaterThan(0);
    });

    it('既存 arrowOutline / textOutline の値は維持されている（破壊変更でないこと）', () => {
      // 既存 Req 26 で確立済みの値を回帰防止のため再検証
      expect(ANNOTATION_DEFAULTS.arrowOutline.enabled).toBe(true);
      expect(ANNOTATION_DEFAULTS.arrowOutline.color).toBe('#ffffff');
      expect(ANNOTATION_DEFAULTS.arrowOutline.width).toBeGreaterThan(0);
      expect(ANNOTATION_DEFAULTS.textOutline.enabled).toBe(true);
      expect(ANNOTATION_DEFAULTS.textOutline.widthRatio).toBeGreaterThan(0);
    });

    it('getToolDefaults の戻り値にも 6 形状 outline と dimensionLabelOutline が含まれる (Req 32.13)', () => {
      const defaults = getToolDefaults('rectangle');
      for (const key of shapeOutlineKeys) {
        const outline = defaults[key];
        expect(outline.enabled).toBe(true);
        expect(outline.width).toBeGreaterThan(0);
      }
      expect(defaults.dimensionLabelOutline.enabled).toBe(true);
      expect(defaults.dimensionLabelOutline.widthRatio).toBeGreaterThan(0);
    });

    /**
     * Task 75.2: 既定値モジュールの単体テスト（追加検証）
     *
     * design.md 5501 行に基づく追加境界検証:
     * - 全 6 形状の `enabled === true` および `width >= bodyStrokeWidth * 0.75`
     * - `dimensionLabelOutline.enabled === true` かつ `widthRatio` が Req 25 の
     *   `[0.10, 0.20]` レンジ内にあること
     *
     * 既存テスト（75.1）が「正の数値」「> 0」までしか検証していなかったため、
     * 本タスクで境界条件（下限・上限）を厳密に検証する差分テストを追加。
     *
     * @requirement site-survey/REQ-32.11
     * @requirement site-survey/REQ-32.13
     */
    describe('Task 75.2: 既定値の境界条件検証', () => {
      // bodyStrokeWidth は ANNOTATION_DEFAULTS.strokeWidth（= 3）を意味する
      // 閾値 = bodyStrokeWidth * 0.75 = 2.25
      const bodyStrokeWidth = ANNOTATION_DEFAULTS.strokeWidth;
      const minOutlineWidth = bodyStrokeWidth * 0.75;

      it.each(shapeOutlineKeys)('%s は enabled === true である（境界検証）(Req 32.11)', (key) => {
        const outline = ANNOTATION_DEFAULTS[key] as ShapeOutlineAttribute;
        // 厳密一致で検証し truthy 値（1, "true" など）を弾く
        expect(outline.enabled).toStrictEqual(true);
      });

      it.each(shapeOutlineKeys)(
        '%s の width は bodyStrokeWidth * 0.75 (= 2.25) 以上である (Req 32.11, design.md 5501)',
        (key) => {
          const outline = ANNOTATION_DEFAULTS[key] as ShapeOutlineAttribute;
          expect(outline.width).toBeGreaterThanOrEqual(minOutlineWidth);
        }
      );

      it('dimensionLabelOutline.enabled は厳密に true である (Req 32.11, 32.12)', () => {
        expect(ANNOTATION_DEFAULTS.dimensionLabelOutline.enabled).toStrictEqual(true);
      });

      it('dimensionLabelOutline.widthRatio は 0.10 以上である（Req 25 下限）', () => {
        expect(ANNOTATION_DEFAULTS.dimensionLabelOutline.widthRatio).toBeGreaterThanOrEqual(0.1);
      });

      it('dimensionLabelOutline.widthRatio は 0.20 以下である（Req 25 上限）', () => {
        expect(ANNOTATION_DEFAULTS.dimensionLabelOutline.widthRatio).toBeLessThanOrEqual(0.2);
      });

      it('閾値計算の前提（bodyStrokeWidth = ANNOTATION_DEFAULTS.strokeWidth = 3）が保たれている', () => {
        // 将来 strokeWidth が変更された場合に上記境界テストの基準も再評価すべきことを明示
        expect(bodyStrokeWidth).toBe(3);
        expect(minOutlineWidth).toBeCloseTo(2.25, 10);
      });
    });
  });
});
