/**
 * @fileoverview StylePanel の色の正規化が合成側と選択判定側で一本化されていることのテスト
 *
 * Task 115.151 (Req 26.5): 既定色をパレットへ合成する `withDefaultColor` は重複判定を
 * `toLowerCase()` で行って大小を無視する一方、選択状態の判定は素の等価比較で大小を
 * 区別していた。さらに表示用の正規化は3桁記法の展開だけで小文字化しなかった。
 * 二系統の正規化が併存していたため、資材 `annotation-style-tokens.ts` の既定色の
 * **表記**が変わった瞬間に、既定状態でどのプリセットも選択されなくなる。
 *
 * 本ファイルは資材の既定色の表記を変異させて（大文字6桁・3桁記法）、
 * 選択状態が表記に依存せず成立し続けることを主張する。現行値（小文字6桁）だけを
 * 試す検証は、正規化が二系統のままでも通ってしまうため主張として不足である。
 *
 * 期待値の正規化は実装を参照せずテスト内で独立に計算する（実装の正規化関数を
 * 借りると、その関数がどう壊れても期待値が追随して主張が空になるため）。
 *
 * @requirement site-survey/REQ-26.5
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const TOKENS_MODULE = '../../../components/site-surveys/annotation-style-tokens';

type TokensModule = typeof import('../../../components/site-surveys/annotation-style-tokens');

/**
 * 期待値側の正規化（実装から独立）: 3桁記法を6桁へ展開し、小文字へ寄せる
 */
function canonicalize(color: string): string {
  const lower = color.toLowerCase();
  if (!lower.startsWith('#')) return lower;
  const hex = lower.slice(1);
  if (hex.length === 3) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  return `#${hex}`;
}

/**
 * 選択状態のプリセットボタンかどうかを判定する（`presetButtonActive` の強調表現）
 */
function isActivePreset(button: HTMLElement): boolean {
  return button.style.transform === 'scale(1.1)';
}

function titlesOf(pattern: RegExp): string[] {
  return screen.getAllByTestId(pattern).map((button) => button.getAttribute('title') ?? '');
}

function activeTitlesOf(pattern: RegExp): string[] {
  return screen
    .getAllByTestId(pattern)
    .filter(isActivePreset)
    .map((button) => button.getAttribute('title') ?? '');
}

/**
 * 資材の既定本体色を差し替えたうえで StylePanel を既定状態で描画する
 *
 * プリセットの合成はモジュール読込時に確定するため、`vi.resetModules()` と
 * 動的 import で読み直す。`DEFAULT_STYLE_OPTIONS` も同じ資材から供給されるため、
 * 差し替えは合成側と選択判定側の双方へ同時に効く。
 */
async function renderWithDefaultStroke(stroke: string): Promise<void> {
  vi.resetModules();
  vi.doMock(TOKENS_MODULE, async () => {
    const actual = await vi.importActual<TokensModule>(TOKENS_MODULE);
    return {
      ...actual,
      ANNOTATION_DEFAULTS: { ...actual.ANNOTATION_DEFAULTS, stroke },
    };
  });

  const panel = await import('../../../components/site-surveys/StylePanel');
  const StylePanel = panel.default;
  render(
    <StylePanel
      styleOptions={panel.DEFAULT_STYLE_OPTIONS}
      onStyleChange={vi.fn()}
      disabled={false}
    />
  );
}

describe('StylePanel 色の正規化の一本化 (Req 26.5)', () => {
  afterEach(() => {
    cleanup();
    vi.doUnmock(TOKENS_MODULE);
    vi.resetModules();
    vi.clearAllMocks();
  });

  // 先頭の一件だけが現行の資材値と同じ表記であり、回帰の基準点として残す。
  // 残る四件が本タスクの主張（表記が変わっても選択状態が成立する）を担う。
  it.each([
    ['小文字6桁（現行の資材値と同じ表記）', '#e53935'],
    ['大文字6桁（既存パレットと同色）', '#FF0000'],
    ['大文字6桁（既存パレットに無い色）', '#E53935'],
    ['3桁記法（既存パレットと同色）', '#f00'],
    ['3桁記法（既存パレットに無い色）', '#0a8'],
  ])('既定本体色が %s でも線色プリセットがちょうど一つ選択状態になる', async (_label, stroke) => {
    await renderWithDefaultStroke(stroke);

    expect(activeTitlesOf(/^stroke-preset-/).map(canonicalize)).toEqual([canonicalize(stroke)]);
  });

  it.each([
    ['大文字6桁（既存パレットと同色）', '#FF0000'],
    ['3桁記法（既存パレットと同色）', '#f00'],
  ])('既定本体色が %s のとき見分けのつかない色がプリセットに重複しない', async (_label, stroke) => {
    await renderWithDefaultStroke(stroke);

    const canonicalTitles = titlesOf(/^stroke-preset-/).map(canonicalize);
    expect(canonicalTitles).toContain(canonicalize(stroke));
    expect(new Set(canonicalTitles).size).toBe(canonicalTitles.length);
  });

  it('既定本体色が大文字でも塗りつぶしプリセットの並びに含まれる', async () => {
    await renderWithDefaultStroke('#E53935');

    expect(titlesOf(/^fill-preset-/).map(canonicalize)).toContain(canonicalize('#E53935'));
  });

  it('既定の塗りつぶしが透明のときは「塗りつぶしなし」が選択状態を担う', async () => {
    await renderWithDefaultStroke('#FF0000');

    expect(isActivePreset(screen.getByLabelText('塗りつぶしなし'))).toBe(true);
    expect(activeTitlesOf(/^fill-preset-/)).toEqual([]);
  });
});
