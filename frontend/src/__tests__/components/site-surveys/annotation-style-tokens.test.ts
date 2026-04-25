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
});
