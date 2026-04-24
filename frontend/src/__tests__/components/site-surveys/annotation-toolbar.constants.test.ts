/**
 * @fileoverview `annotation-toolbar.constants.ts` のトークン参照ブリッジ検証
 *
 * Task 64.2: `DEFAULT_STYLE_OPTIONS` の値を `annotation-style-tokens` から
 *            import する形に置換し、トークンを単一情報源とする。
 *
 * Requirements:
 * - 26.5: 各ツールの既定色・既定線幅・既定白縁取り有無を一元管理する
 *
 * テスト対象:
 * - `DEFAULT_STYLE_OPTIONS` の各フィールドが `ANNOTATION_DEFAULTS` と同値である
 * - 既存 import 元が参照するフィールド名（strokeColor / strokeWidth / fillColor /
 *   fontSize）が維持されている
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_STYLE_OPTIONS } from '../../../components/site-surveys/annotation-toolbar.constants';
import { ANNOTATION_DEFAULTS } from '../../../components/site-surveys/annotation-style-tokens';

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
  });

  describe('DEFAULT_STYLE_OPTIONS のフィールド名は既存 consumer との互換性を維持する', () => {
    it('期待される4つのキーのみが公開されている', () => {
      expect(Object.keys(DEFAULT_STYLE_OPTIONS).sort()).toEqual(
        ['fillColor', 'fontSize', 'strokeColor', 'strokeWidth'].sort()
      );
    });
  });
});
