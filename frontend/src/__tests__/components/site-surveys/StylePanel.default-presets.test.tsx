/**
 * @fileoverview StylePanel のプリセットが既定値を含むことのテスト
 *
 * Task 115.99 (Req 26.5): 色・線幅・フォントサイズの各プリセット配列に、設定資材
 * `annotation-style-tokens.ts` が定める既定値が含まれていなかった。結果として、
 * パネルを既定状態（`DEFAULT_STYLE_OPTIONS`）で開いたとき、どのプリセットも
 * 選択状態と一致しなかった。
 *
 * 本ファイルの主張は「プリセットの並びが資材の既定値を単一の供給元として取り込む」
 * ことである。したがって期待値には literal を書かず、すべて `ANNOTATION_DEFAULTS`
 * から導出する。literal で期待値を書くと、プリセット側が資材とは別の供給元を持って
 * いても検出できないため。
 *
 * 塗りつぶしの既定は透明であり、その選択状態はプリセット色ではなく
 * 「塗りつぶしなし」ボタンが示す。よって塗りつぶしについては当該ボタンの選択状態を
 * 主張する。
 *
 * @requirement site-survey/REQ-26.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StylePanel, { DEFAULT_STYLE_OPTIONS } from '../../../components/site-surveys/StylePanel';
import { ANNOTATION_DEFAULTS } from '../../../components/site-surveys/annotation-style-tokens';

// ============================================================================
// テストヘルパー
// ============================================================================

const defaultProps = {
  styleOptions: DEFAULT_STYLE_OPTIONS,
  onStyleChange: vi.fn(),
  disabled: false,
};

/**
 * 選択状態のプリセットボタンかどうかを判定する
 *
 * 選択中の色プリセットは枠線が 2px の強調色（`presetButtonActive`）になり、
 * 選択中の線幅/フォントサイズプリセットは背景が強調色（`presetWidthButtonActive`）になる。
 * 実装のスタイル定義に合わせ、いずれかの強調表現が付いていることを見る。
 */
function isActivePreset(button: HTMLElement): boolean {
  const style = button.style;
  return style.transform === 'scale(1.1)' || style.backgroundColor === 'rgb(37, 99, 235)';
}

/**
 * data-testid の接頭辞から数値プリセットの並びを読み取る
 *
 * Task 115.101: 接頭辞のみの正規表現は同じ接頭辞を持つラッパー要素
 * （`stroke-width-preset-container` / `font-size-preset-container`）にも一致し、
 * 並びへ `NaN` が混入していた。終端を数字で固定して数値プリセットだけを拾う。
 */
function readNumericPresets(prefix: string): number[] {
  return screen
    .getAllByTestId(new RegExp(`^${prefix}\\d+$`))
    .map((button) => Number(button.getAttribute('data-testid')?.slice(prefix.length)));
}

// ============================================================================
// テストスイート
// ============================================================================

describe('StylePanel プリセットと既定値の整合 (Req 26.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('線幅プリセット', () => {
    it('資材の既定線幅がプリセットの並びに含まれる', () => {
      render(<StylePanel {...defaultProps} />);

      expect(readNumericPresets('stroke-width-preset-')).toContain(ANNOTATION_DEFAULTS.strokeWidth);
    });

    it('プリセットの並びは昇順である', () => {
      render(<StylePanel {...defaultProps} />);

      const widths = readNumericPresets('stroke-width-preset-');
      // Task 115.101: 読み出しがラッパー要素を拾うと NaN が混入し、並びの主張が崩れる
      expect(widths.length).toBeGreaterThan(0);
      expect(widths.every((width) => Number.isFinite(width))).toBe(true);
      expect(widths).toEqual([...widths].sort((a, b) => a - b));
    });

    it('既定状態では既定線幅のプリセットが選択状態になる', () => {
      render(<StylePanel {...defaultProps} />);

      const defaultButton = screen.getByTestId(
        `stroke-width-preset-${ANNOTATION_DEFAULTS.strokeWidth}`
      );
      expect(isActivePreset(defaultButton)).toBe(true);
    });

    it('既定線幅のプリセットを押すと既定線幅が通知される', async () => {
      const user = userEvent.setup();
      const onStyleChange = vi.fn();
      render(<StylePanel {...defaultProps} onStyleChange={onStyleChange} />);

      await user.click(
        screen.getByTestId(`stroke-width-preset-${ANNOTATION_DEFAULTS.strokeWidth}`)
      );

      expect(onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({ strokeWidth: ANNOTATION_DEFAULTS.strokeWidth })
      );
    });
  });

  describe('線色プリセット', () => {
    it('資材の既定本体色がプリセットの並びに含まれる', () => {
      render(<StylePanel {...defaultProps} />);

      const titles = screen
        .getAllByTestId(/^stroke-preset-/)
        .map((button) => button.getAttribute('title')?.toLowerCase());
      expect(titles).toContain(ANNOTATION_DEFAULTS.stroke.toLowerCase());
    });

    it('既定状態では既定本体色のプリセットが選択状態になる', () => {
      render(<StylePanel {...defaultProps} />);

      const buttons = screen.getAllByTestId(/^stroke-preset-/);
      const activeTitles = buttons
        .filter((button) => isActivePreset(button))
        .map((button) => button.getAttribute('title')?.toLowerCase());

      expect(activeTitles).toEqual([ANNOTATION_DEFAULTS.stroke.toLowerCase()]);
    });
  });

  describe('フォントサイズプリセット', () => {
    it('資材の既定フォントサイズがプリセットの並びに含まれる', () => {
      render(<StylePanel {...defaultProps} />);

      expect(readNumericPresets('font-size-preset-')).toContain(ANNOTATION_DEFAULTS.fontSize);
    });

    it('既定状態では既定フォントサイズのプリセットが選択状態になる', () => {
      render(<StylePanel {...defaultProps} />);

      const defaultButton = screen.getByTestId(`font-size-preset-${ANNOTATION_DEFAULTS.fontSize}`);
      expect(isActivePreset(defaultButton)).toBe(true);
    });
  });

  describe('塗りつぶしの既定', () => {
    it('既定の塗りつぶしは透明であり「塗りつぶしなし」が選択状態になる', () => {
      render(<StylePanel {...defaultProps} />);

      expect(DEFAULT_STYLE_OPTIONS.fillColor).toBe('transparent');
      expect(isActivePreset(screen.getByLabelText('塗りつぶしなし'))).toBe(true);
    });

    it('塗りつぶしプリセットの並びにも既定本体色が含まれる', () => {
      render(<StylePanel {...defaultProps} />);

      const titles = screen
        .getAllByTestId(/^fill-preset-/)
        .map((button) => button.getAttribute('title')?.toLowerCase());
      expect(titles).toContain(ANNOTATION_DEFAULTS.stroke.toLowerCase());
    });
  });
});
