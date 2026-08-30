/**
 * @fileoverview AnnotationToolbar モバイル幅の「各項目」のタップ領域
 *
 * Task 115.170: 要件28.3 の適用範囲を条文どおり（モバイル幅ツールバーの**各項目**）へ
 * 追随させる。従前は道具のボタン（`STYLES.button.base`）だけが 44x44 を持ち、属性パネルの
 * 操作要素（切替 32x24・色 32x24・線幅 60x24・吹き出し 高さ24）とアクションボタン
 * （実測 高さ32。タスク本文の「約31」は概算であり、実測は32である）はいずれも 44 に届いて
 * いなかった。被覆判定は 28.3 を緑にしていたが、それは
 * ツールボタンのみの検証によるものだった。
 *
 * 「項目」の範囲（先に宣言する）:
 *   ツールバー（`data-testid="annotation-toolbar"`）の内側にある `button` / `input` /
 *   `select` の全て。すなわちユーザーが操作の対象として直接選ぶ操作要素である。
 *   除外するもの:
 *     - 区切り線（`STYLES.separator`）と各種コンテナ（ツールバー本体・`style-options`・
 *       `action-buttons-container`）。操作の対象ではない
 *     - 見出しの `label`。それ自身は操作の対象ではない。見出しは全て `htmlFor` を持ち、
 *       押下は対応する操作要素へ転送される（Task 115.202 で 9 つ全てを関連付けた。それ以前は
 *       3 つだけが転送し、残る 6 つ——色・線幅・塗りつぶし・文字色・サイズ・背景色——は
 *       押下しても何も起きない不活性な文字だった）。除外が正しい根拠は、転送される見出しが
 *       既に 44x44 を満たす操作要素の当たり判定を**広げる側にしか働かない**こと、そして
 *       いずれの見出しも属する項目コンテナが 44x44 以上であること。関連付けそのものは
 *       `AnnotationToolbar.style-label-association.test.tsx` が固定する
 *     - 長押しのツールヒント。`document.body` 直下へ Portal で描かれ、`pointerEvents: none`
 *       であるためツールバーの項目ではない
 *
 * 本検証は「宣言した個数と実測が一致すること」を先に確かめてから寸法を主張する。
 * 個数を確かめずに全件走査だけを行うと、項目が消えていても空振りで緑になるため。
 *
 * 測るもの: JSDOM は実レイアウトを持たない（`getBoundingClientRect` は常に 0）ため、
 * ここではインラインスタイルの下限宣言（`min-width` / `min-height`）を主張する。
 * 実ブラウザでの実寸は E2E（`e2e/specs/site-surveys/site-survey-annotation-mobile.spec.ts`
 * の (d)、`site-survey-outline-toggle.spec.ts` の (f)）が 375x667 で測る。
 *
 * Requirements:
 * - 28.3: モバイル幅ツールバーの各項目のタップ領域を最小44x44論理ピクセル以上で提供する
 * - 36.5: モバイル幅でツールバーが縦方向の表示領域を過度に占有しない（44 化で段を高くしない）
 *
 * @requirement site-survey/REQ-28.3
 * @requirement site-survey/REQ-36.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import AnnotationToolbar, {
  type ToolType,
} from '../../../components/site-surveys/AnnotationToolbar';

// useMediaQuery をモック化して isMobile 判定をテストから制御する。
// Task 102.2 の記録: `matchMedia` を stub しない検証は `useMediaQuery` が false を返し、
// 実際にはデスクトップ（wrap）分岐を見てしまう。モバイルの主張には stub が要る。
vi.mock('../../../hooks/useMediaQuery', () => ({
  default: vi.fn(() => false),
}));

import useMediaQuery from '../../../hooks/useMediaQuery';

/** 要件28.3 が定めるタップ領域の下限（論理ピクセル） */
const MIN_TAP_TARGET_PX = 44;

const parsePx = (value: string | null): number => {
  if (!value) return Number.NaN;
  const match = value.match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? Number.parseFloat(match[1]!) : Number.NaN;
};

/**
 * ツールごとに属性パネルへ現れる操作要素の個数（数える範囲の宣言）
 *
 * 内訳（`AnnotationToolbar.tsx` の `StylePanel` の分岐から導出）:
 * - 選択: 属性パネル自体が描かれない → 0
 * - 線のみの道具（寸法線・矢印・折れ線・フリーハンド）: 白縁取り切替 + 色 + 線幅 → 3
 * - 塗りを持つ形状（円・四角形・多角形）: 上記 + 塗りつぶし色 → 4
 * - テキスト: 白アウトライン切替 + 文字色 + サイズ + 背景切替 + 背景色 + 吹き出し → 6
 */
const PANEL_CONTROL_COUNT: Readonly<Record<ToolType, number>> = {
  select: 0,
  dimension: 3,
  arrow: 3,
  circle: 4,
  rectangle: 4,
  polygon: 4,
  polyline: 3,
  freehand: 3,
  text: 6,
};

/** 道具のボタンの個数（`TOOL_ORDER` の要素数） */
const TOOL_BUTTON_COUNT = 9;

/** アクションボタンの個数（回転・元に戻す・やり直し・保存・エクスポート） */
const ACTION_BUTTON_COUNT = 5;

const ALL_TOOLS = Object.keys(PANEL_CONTROL_COUNT) as ToolType[];

const renderToolbar = (activeTool: ToolType): void => {
  render(
    <AnnotationToolbar
      activeTool={activeTool}
      onToolChange={vi.fn()}
      onStyleChange={vi.fn()}
      onRotate={vi.fn()}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      onSave={vi.fn()}
      onExport={vi.fn()}
      disabled={false}
    />
  );
};

/** ツールバー内の操作要素（項目）を全て集める */
const collectItems = (): HTMLElement[] => {
  const toolbar = screen.getByTestId('annotation-toolbar');
  return Array.from(toolbar.querySelectorAll<HTMLElement>('button, input, select'));
};

/** 項目を人が読める名前で指す（失敗時に「どれが小さいか」が分かるようにする） */
const nameOf = (el: HTMLElement): string =>
  el.getAttribute('data-testid') ??
  el.getAttribute('aria-label') ??
  `${el.tagName.toLowerCase()}(${el.getAttribute('type') ?? ''})`;

describe('AnnotationToolbar - モバイル幅の各項目のタップ領域 (Task 115.170, Req 28.3/36.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMediaQuery).mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('Req28.3: モバイル幅ツールバーの各項目が 44x44 以上のタップ領域を宣言する', () => {
    it.each(ALL_TOOLS)('%s ツール選択時の項目の個数が宣言と一致する（数え漏らし防止）', (tool) => {
      renderToolbar(tool);

      const expected = TOOL_BUTTON_COUNT + PANEL_CONTROL_COUNT[tool] + ACTION_BUTTON_COUNT;
      expect(
        collectItems().map(nameOf),
        `${tool}: ツールバーの操作要素の個数が宣言と一致しない`
      ).toHaveLength(expected);
    });

    it.each(ALL_TOOLS)('%s ツール選択時の全項目が 44x44 以上を宣言する', (tool) => {
      renderToolbar(tool);

      const items = collectItems();
      expect(items.length).toBeGreaterThan(0);

      for (const item of items) {
        const name = nameOf(item);
        expect(
          parsePx(item.style.getPropertyValue('min-width')),
          `${tool}: 項目「${name}」の min-width が 44px 未満`
        ).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
        expect(
          parsePx(item.style.getPropertyValue('min-height')),
          `${tool}: 項目「${name}」の min-height が 44px 未満`
        ).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
      }
    });

    it('44 未満の固定寸法（色 32x24・線幅 高さ24・吹き出し 高さ24）が下限を上書きしない', () => {
      renderToolbar('text');

      // width/height を持つ定義と併用しても、CSS では min-* が優先されるため
      // 44 が下限になる。宣言の併存自体は許すが、下限が消えていないことを主張する。
      const colorPicker = screen.getAllByTestId('color-picker')[0]!;
      expect(parsePx(colorPicker.style.getPropertyValue('min-width'))).toBeGreaterThanOrEqual(
        MIN_TAP_TARGET_PX
      );
      expect(parsePx(colorPicker.style.getPropertyValue('min-height'))).toBeGreaterThanOrEqual(
        MIN_TAP_TARGET_PX
      );

      // 44 を超える寸法（線幅の入力の幅 60）は据え置く（下限は幅を縮めない）
      const fontSize = screen.getByTestId('font-size');
      expect(parsePx(fontSize.style.getPropertyValue('width'))).toBeGreaterThan(MIN_TAP_TARGET_PX);
    });
  });

  describe('Req36.5: 44 化してもツールバーの段を高くしない', () => {
    it('モバイル幅では属性パネルの各項目が横並び（見出しを積まない）になる', () => {
      renderToolbar('text');

      const stylePanel = screen.getByTestId('style-options');
      const items = Array.from(stylePanel.querySelectorAll<HTMLElement>(':scope > div'));
      expect(items, '属性パネルの項目が見つからない').toHaveLength(PANEL_CONTROL_COUNT.text);

      for (const item of items) {
        expect(
          item.style.getPropertyValue('flex-direction'),
          `属性パネルの項目が縦積みのままである（44 化で段が高くなる）: ${item.textContent}`
        ).toBe('row');
      }
    });
  });

  describe('デスクトップ幅（isMobile=false）: 適用範囲は要件28.3 の文言どおりモバイル幅に限る', () => {
    beforeEach(() => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
    });

    it('道具のボタンは幅に依らず 44x44 を保つ（Task 70.1 の非回帰）', () => {
      renderToolbar('text');

      const selectButton = screen.getByRole('button', { name: /選択/i });
      expect(selectButton.style.getPropertyValue('min-width')).toBe('44px');
      expect(selectButton.style.getPropertyValue('min-height')).toBe('44px');
    });

    it('属性パネルの項目は縦積み（見出しを上に積む）のまま据え置く', () => {
      renderToolbar('text');

      const stylePanel = screen.getByTestId('style-options');
      const items = Array.from(stylePanel.querySelectorAll<HTMLElement>(':scope > div'));
      expect(items).toHaveLength(PANEL_CONTROL_COUNT.text);
      for (const item of items) {
        expect(item.style.getPropertyValue('flex-direction')).toBe('column');
      }
    });
  });
});
