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
  resolveArrowOutlineWidth,
  resolveShapeOutlineWidth,
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

    /**
     * Task 115.98 (Req 26.5): 寸法値ラベルの既定スタイルを一元管理の資材へ寄せた。
     * 既定値は移設前と同一であることを具体値で固定する。
     */
    describe('dimensionLabel（寸法値ラベルの既定スタイル / Req 26.5）', () => {
      it('既定フォントサイズは 12 である', () => {
        expect(ANNOTATION_DEFAULTS.dimensionLabel.fontSize).toBe(12);
      });

      it('既定文字色は #000000 である', () => {
        expect(ANNOTATION_DEFAULTS.dimensionLabel.fontColor).toBe('#000000');
      });

      it('既定背景色は #ffffff である', () => {
        expect(ANNOTATION_DEFAULTS.dimensionLabel.backgroundColor).toBe('#ffffff');
      });

      it('既定文字色は本体色（stroke）とは別の値である（要件26.2 の対象は本体色）', () => {
        expect(ANNOTATION_DEFAULTS.dimensionLabel.fontColor).not.toBe(ANNOTATION_DEFAULTS.stroke);
      });

      it('既定フォントサイズはツール横断の既定フォントサイズとは別の値である', () => {
        expect(ANNOTATION_DEFAULTS.dimensionLabel.fontSize).not.toBe(ANNOTATION_DEFAULTS.fontSize);
      });
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

    it('寸法線ツールの既定値に寸法値ラベルの既定スタイルが含まれる (Req 26.5)', () => {
      const defaults = getToolDefaults('dimension');

      expect(defaults.dimensionLabel).toEqual({
        fontSize: 12,
        fontColor: '#000000',
        backgroundColor: '#ffffff',
      });
    });

    it('dimensionLabel はコピーで返り、呼び出し側の変更が資材を壊さない (Req 26.5)', () => {
      const defaults = getToolDefaults('dimension');

      defaults.dimensionLabel.fontColor = '#00ff00';

      expect(ANNOTATION_DEFAULTS.dimensionLabel.fontColor).toBe('#000000');
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
      // Task 115.101: 閾値を資材の値から算出すると、既定線幅が変わったとき閾値も同時に
      // 動いて主張が落ちない。既定線幅 3 とその 0.75 倍 2.25 を具体値で置き、
      // 前提そのものは下の「閾値計算の前提」で資材と突き合わせる。
      const bodyStrokeWidth = 3;
      const minOutlineWidth = 2.25;

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

      it('閾値計算の前提（ANNOTATION_DEFAULTS.strokeWidth = 3）が保たれている', () => {
        // 将来 strokeWidth が変更された場合に上記境界テストの基準（2.25 = 3 × 0.75）も
        // 再評価すべきことを明示する。閾値は具体値で置いているため、ここでは資材の既定線幅が
        // 前提から動いていないことだけを主張する（両辺で同じ算出を走らせない）。
        expect(ANNOTATION_DEFAULTS.strokeWidth).toBe(bodyStrokeWidth);
      });
    });
  });

  // Task 115.53 (Req 32.2): 縁取り幅は固定値の加算ではなく本体線幅からの比率で算出する
  describe('resolveShapeOutlineWidth (Req 32.2)', () => {
    /** 線の太さの入力範囲（AnnotationToolbar / StylePanel の min=1 / max=20） */
    const SELECTABLE_STROKE_WIDTHS = Array.from({ length: 20 }, (_, index) => index + 1);

    it.each(SELECTABLE_STROKE_WIDTHS)(
      '本体線幅 %i で描画される縁取り線幅が本体線幅の 1.5 倍以上になる',
      (bodyStrokeWidth) => {
        // 描画される縁取り線幅は design.md の `bodyStrokeWidth + outline.width * 2`
        const renderedOutlineWidth =
          bodyStrokeWidth + resolveShapeOutlineWidth(bodyStrokeWidth) * 2;

        expect(renderedOutlineWidth).toBeGreaterThanOrEqual(bodyStrokeWidth * 1.5);
      }
    );

    it('本体線幅の上限 20 でも比率を満たす（固定値の加算では 1.3 倍に留まっていた）', () => {
      const renderedOutlineWidth = 20 + resolveShapeOutlineWidth(20) * 2;

      expect(resolveShapeOutlineWidth(20)).toBe(15);
      expect(renderedOutlineWidth).toBe(50);
      expect(renderedOutlineWidth / 20).toBeGreaterThanOrEqual(1.5);
    });

    it('片側幅の下限 2 論理ピクセルを保証する', () => {
      expect(resolveShapeOutlineWidth(1)).toBe(2);
    });

    it('既定線幅 3 に対する算出値は既定の縁取り幅 3 と一致する', () => {
      // Task 115.101: 既定値 `rectangleOutline.width` は `resolveShapeOutlineWidth(既定線幅)` で
      // 定義されている。両辺に同じ算出を置くと何を変えても通る恒真になるため具体値で固定する。
      expect(resolveShapeOutlineWidth(3)).toBe(3);
      expect(ANNOTATION_DEFAULTS.rectangleOutline.width).toBe(3);
    });

    it('非数・非正の本体線幅は既定線幅 3 の算出値 3 にフォールバックする', () => {
      // Task 115.101: 両辺で同じ算出を走らせると恒真になるため、既定線幅 3 から導かれる
      // 具体値 3 を期待値に置く。
      expect(resolveShapeOutlineWidth(0)).toBe(3);
      expect(resolveShapeOutlineWidth(-1)).toBe(3);
      expect(resolveShapeOutlineWidth(Number.NaN)).toBe(3);
    });
  });

  // Task 115.59 (Req 24.2): 矢印の縁取り幅も固定値ではなく本体線幅からの比率で算出する
  describe('resolveArrowOutlineWidth (Req 24.2)', () => {
    /** 線の太さの入力範囲（AnnotationToolbar / StylePanel の min=1 / max=20） */
    const SELECTABLE_STROKE_WIDTHS = Array.from({ length: 20 }, (_, index) => index + 1);

    it.each(SELECTABLE_STROKE_WIDTHS)(
      '本体線幅 %i で描画される矢印の縁取り線幅が本体線幅の 1.5 倍以上になる',
      (bodyStrokeWidth) => {
        // 描画される縁取り線幅は design.md 4478 行の `bodyStrokeWidth + outlineWidth * 2`
        const renderedOutlineWidth =
          bodyStrokeWidth + resolveArrowOutlineWidth(bodyStrokeWidth) * 2;

        expect(renderedOutlineWidth).toBeGreaterThanOrEqual(bodyStrokeWidth * 1.5);
      }
    );

    it('本体線幅の上限 20 でも比率を満たす（固定値 2 の加算では 1.2 倍に留まっていた）', () => {
      const renderedOutlineWidth = 20 + resolveArrowOutlineWidth(20) * 2;

      expect(resolveArrowOutlineWidth(20)).toBe(15);
      expect(renderedOutlineWidth).toBe(50);
      expect(renderedOutlineWidth / 20).toBeGreaterThanOrEqual(1.5);
    });

    it('比率が最初に破綻していた本体線幅 9 で 1.5 倍以上を満たす', () => {
      const renderedOutlineWidth = 9 + resolveArrowOutlineWidth(9) * 2;

      // 従来の固定値 2 では 9 + 4 = 13（1.44 倍）で要件 24.2 を下回っていた
      expect(renderedOutlineWidth).toBeGreaterThanOrEqual(9 * 1.5);
    });

    it('片側幅の下限 1 論理ピクセルを保証する', () => {
      expect(resolveArrowOutlineWidth(1)).toBe(1);
    });

    it('既定線幅 3 に対する算出値は既定の矢印縁取り幅と一致する（既定の見た目を変えない）', () => {
      // Task 115.101: 既定値 `arrowOutline.width` は `resolveArrowOutlineWidth(既定線幅)` で
      // 定義されている。両辺に同じ算出を置くと恒真になるため具体値で固定する。
      expect(resolveArrowOutlineWidth(3)).toBe(2);
      expect(ANNOTATION_DEFAULTS.arrowOutline.width).toBe(2);
    });

    it('非数・非正の本体線幅は既定線幅 3 の算出値 2 にフォールバックする', () => {
      // Task 115.101: 両辺で同じ算出を走らせると恒真になるため、既定線幅 3 から導かれる
      // 具体値 2 を期待値に置く。
      expect(resolveArrowOutlineWidth(0)).toBe(2);
      expect(resolveArrowOutlineWidth(-1)).toBe(2);
      expect(resolveArrowOutlineWidth(Number.NaN)).toBe(2);
    });
  });

  /**
   * Task 115.71 (Req 24.2, 32.2, 26.5): 既定線幅から導かれる白縁取りの既定の見た目を固定する
   *
   * Task 115.60 で既定線幅が 2 から 3 へ是正された結果、六形状の片側幅は切り上げのため
   * 2 から 3 へ変わり、矢印は四捨五入のため 2 のまま変わらなかった。同じ既定値の変更が
   * 部位ごとに異なる結果を生むため、既定の見た目そのものを具体的な数値で主張する。
   *
   * 期待値は算出関数を再実行して得るのではなく **具体的な数値を直接書く**。算出側の変更に
   * 追随して緑のままになる恒真の判定を避けるため（design.md 要件32 節
   * 「既定線幅から導かれる白縁取りの既定値（要件24.2 / 32.2 / 26.5）」の表と対応する）。
   *
   * 選択可能な全線幅（1〜20）での比率充足は上の resolveShapeOutlineWidth /
   * resolveArrowOutlineWidth の各 describe が既に全件で主張しているため、ここでは重複させない。
   *
   * @requirement site-survey/REQ-24.2
   * @requirement site-survey/REQ-32.2
   * @requirement site-survey/REQ-26.5
   */
  describe('Task 115.71: 既定線幅から導かれる白縁取りの既定値', () => {
    const shapeOutlineKeys = [
      'rectangleOutline',
      'circleOutline',
      'polygonOutline',
      'polylineOutline',
      'freehandOutline',
      'dimensionOutline',
    ] as const;

    it('既定線幅は 3 論理ピクセルである（本表の前提。Req 26.1, 26.5）', () => {
      expect(ANNOTATION_DEFAULTS.strokeWidth).toBe(3);
    });

    it('既定線幅 3 から六形状の片側幅 3 が導かれる（切り上げ。Req 32.2）', () => {
      expect(resolveShapeOutlineWidth(3)).toBe(3);
    });

    it('既定線幅 3 から矢印の片側幅 2 が導かれる（四捨五入。Req 24.2）', () => {
      expect(resolveArrowOutlineWidth(3)).toBe(2);
    });

    it.each(shapeOutlineKeys)('%s の既定の片側幅は 3 である (Req 32.2, 26.5)', (key) => {
      const outline = ANNOTATION_DEFAULTS[key] as ShapeOutlineAttribute;
      expect(outline.width).toBe(3);
    });

    it('矢印の既定の片側幅は 2 である（六形状の 3 とは異なる）(Req 24.2, 26.5)', () => {
      expect(ANNOTATION_DEFAULTS.arrowOutline.width).toBe(2);
    });

    it('六形状と矢印で既定の片側幅が異なる（丸め方の違いによる非対称）', () => {
      expect(ANNOTATION_DEFAULTS.rectangleOutline.width).not.toBe(
        ANNOTATION_DEFAULTS.arrowOutline.width
      );
    });

    it('既定状態で描画される六形状の縁取り線幅は 9 である（本体線幅の 3.0 倍。Req 32.2）', () => {
      // 描画される縁取り線幅は各ツールの `bodyStrokeWidth + outline.width * 2`
      expect(3 + 3 * 2).toBe(9);
      expect(ANNOTATION_DEFAULTS.strokeWidth + ANNOTATION_DEFAULTS.rectangleOutline.width * 2).toBe(
        9
      );
    });

    it('既定状態で描画される矢印の縁取り線幅は 7 である（本体線幅の約 2.33 倍。Req 24.2）', () => {
      expect(3 + 2 * 2).toBe(7);
      expect(ANNOTATION_DEFAULTS.strokeWidth + ANNOTATION_DEFAULTS.arrowOutline.width * 2).toBe(7);
    });

    it('テキスト白アウトラインは本体線幅を参照しないため既定線幅の変更で変化しない (Req 26.5)', () => {
      // fontSize * widthRatio = 16 * 0.12 = 1.92（片側幅の算出とは独立）
      expect(ANNOTATION_DEFAULTS.fontSize).toBe(16);
      expect(ANNOTATION_DEFAULTS.textOutline.widthRatio).toBe(0.12);
      expect(ANNOTATION_DEFAULTS.fontSize * ANNOTATION_DEFAULTS.textOutline.widthRatio).toBeCloseTo(
        1.92,
        10
      );
    });

    it('寸法値ラベルの白アウトラインも本体線幅を参照しない (Req 26.5)', () => {
      expect(ANNOTATION_DEFAULTS.dimensionLabelOutline.widthRatio).toBe(0.12);
    });
  });
});
