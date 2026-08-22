/**
 * @fileoverview `annotation-toolbar.constants.ts` のトークン参照ブリッジ検証
 *
 * Task 64.2: `DEFAULT_STYLE_OPTIONS` の値を `annotation-style-tokens` から
 *            import する形に置換し、トークンを単一情報源とする。
 *
 * Requirements:
 * - 26.5: 各ツールの既定色・既定線幅・既定白縁取り有無を一元管理する
 *
 * Task 115.96 (Req 24.5, 25.2, 32.5): `outlineEnabled`（ツール別の白縁取り有無）を追加した。
 * 従来この型には白縁取りに相当する項目が無く、道具帯のスタイルパネルは切替を表現できなかった。
 * 鍵の集合を固定する主張は「4つのみ」から現在の集合へ改める（追加を検知する関門としては
 * 引き続き機能する）。
 *
 * テスト対象:
 * - `DEFAULT_STYLE_OPTIONS` の各フィールドが `ANNOTATION_DEFAULTS` と同値である
 * - 既存 import 元が参照するフィールド名（strokeColor / strokeWidth / fillColor /
 *   fontSize）が維持されている
 * - `outlineEnabled` の既定値がツールごとに一元管理の資材と一致する
 *
 * @requirement site-survey/REQ-26.5
 * @requirement site-survey/REQ-24.5
 * @requirement site-survey/REQ-25.2
 * @requirement site-survey/REQ-32.5
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_STYLE_OPTIONS } from '../../../components/site-surveys/annotation-toolbar.constants';
import {
  ANNOTATION_DEFAULTS,
  createDefaultOutlineEnabled,
} from '../../../components/site-surveys/annotation-style-tokens';

describe('annotation-toolbar.constants bridge to annotation-style-tokens', () => {
  describe('DEFAULT_STYLE_OPTIONS は ANNOTATION_DEFAULTS を単一情報源として参照する (Req 26.5)', () => {
    it('strokeColor は ANNOTATION_DEFAULTS.stroke と同値である', () => {
      expect(DEFAULT_STYLE_OPTIONS.strokeColor).toBe(ANNOTATION_DEFAULTS.stroke);
    });

    it('strokeWidth は ANNOTATION_DEFAULTS.strokeWidth と同値である', () => {
      expect(DEFAULT_STYLE_OPTIONS.strokeWidth).toBe(ANNOTATION_DEFAULTS.strokeWidth);
    });

    it('fillColor は ANNOTATION_DEFAULTS.fill と同値である', () => {
      expect(DEFAULT_STYLE_OPTIONS.fillColor).toBe(ANNOTATION_DEFAULTS.fill);
    });

    it('fontSize は ANNOTATION_DEFAULTS.fontSize と同値である', () => {
      expect(DEFAULT_STYLE_OPTIONS.fontSize).toBe(ANNOTATION_DEFAULTS.fontSize);
    });

    it('outlineEnabled の既定値はツールごとに ANNOTATION_DEFAULTS と同値である', () => {
      expect(DEFAULT_STYLE_OPTIONS.outlineEnabled).toEqual({
        arrow: ANNOTATION_DEFAULTS.arrowOutline.enabled,
        text: ANNOTATION_DEFAULTS.textOutline.enabled,
        dimension: ANNOTATION_DEFAULTS.dimensionOutline.enabled,
        circle: ANNOTATION_DEFAULTS.circleOutline.enabled,
        rectangle: ANNOTATION_DEFAULTS.rectangleOutline.enabled,
        polygon: ANNOTATION_DEFAULTS.polygonOutline.enabled,
        polyline: ANNOTATION_DEFAULTS.polylineOutline.enabled,
        freehand: ANNOTATION_DEFAULTS.freehandOutline.enabled,
      });
    });

    it('outlineEnabled は呼び出しごとに独立した実体を返す（既定値の破壊を防ぐ）', () => {
      expect(createDefaultOutlineEnabled()).not.toBe(createDefaultOutlineEnabled());
      expect(createDefaultOutlineEnabled()).toEqual(DEFAULT_STYLE_OPTIONS.outlineEnabled);
    });
  });

  describe('DEFAULT_STYLE_OPTIONS のフィールド名は既存 consumer との互換性を維持する', () => {
    it('期待されるキーのみが公開されている', () => {
      expect(Object.keys(DEFAULT_STYLE_OPTIONS).sort()).toEqual(
        ['fillColor', 'fontSize', 'outlineEnabled', 'strokeColor', 'strokeWidth'].sort()
      );
    });
  });
});
