/**
 * @fileoverview StylePanel - 色・線幅ピッカーのタッチ誤選択抑止レイアウト
 *
 * Task 70.3: 色・線幅ピッカーのタッチ誤選択抑止レイアウト（RED フェーズ）
 *
 * Requirements:
 * - 28.7: モバイル幅ツールバーの色ピッカー・線幅ピッカーを、タッチ操作で誤選択しにくい間隔で配置する
 *
 * テスト対象:
 * - モバイル幅 (matchMedia matches=true) において、色プリセット（線色 / 塗りつぶし色）コンテナが
 *   隣接タップ領域間に 8px 以上の間隔を持つ（gap >= 8px）
 * - モバイル幅において、線幅プリセットコンテナ・フォントサイズプリセットコンテナも同様に
 *   gap >= 8px を持つ
 * - デスクトップ幅では既存挙動を壊さない（gap は 4px のまま）
 *
 * @requirement site-survey/REQ-28.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import StylePanel, { DEFAULT_STYLE_OPTIONS } from '../../../components/site-surveys/StylePanel';

// ============================================================================
// matchMedia モック
// ============================================================================

type MatchMediaImpl = (query: string) => MediaQueryList;
let originalMatchMedia: MatchMediaImpl | undefined;

/**
 * window.matchMedia を指定した条件で mock する
 * @param matchesForMobileQuery (max-width: 768px) に対する返却 matches 値
 */
function mockMatchMedia(matchesForMobileQuery: boolean): void {
  const impl: MatchMediaImpl = (query: string) => {
    const matches = query.includes('max-width: 768px') ? matchesForMobileQuery : false;
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

/**
 * インラインスタイルから CSS プロパティ値を取得するヘルパー。
 * JSDOM の HTMLElement.style.getPropertyValue はケバブケース (例: 'gap') で取得する。
 */
const getStyleProperty = (el: Element, prop: string): string | null => {
  const style = (el as HTMLElement).style;
  return style.getPropertyValue(prop) || null;
};

/**
 * gap の px 値を数値として取り出す。形式不明な場合は NaN を返す。
 */
const parsePxValue = (value: string | null): number => {
  if (!value) return Number.NaN;
  const match = value.match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? Number.parseFloat(match[1]!) : Number.NaN;
};

/**
 * モバイル幅初期状態では StylePanel が折りたたまれている (Req 28.8)。
 * 色・線幅の詳細セクションを表示するため、折りたたみトグルをクリックして展開する。
 */
const expandStylePanel = (): void => {
  const toggle = screen.queryByTestId('style-panel-collapse-toggle');
  if (toggle && toggle.getAttribute('aria-expanded') === 'false') {
    fireEvent.click(toggle);
  }
};

// ============================================================================
// テストスイート
// ============================================================================

describe('StylePanel - タッチ誤選択抑止レイアウト (Task 70.3, Req 28.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    originalMatchMedia = (window as unknown as { matchMedia?: MatchMediaImpl }).matchMedia;
    // デフォルトはモバイル幅: Req 28.7 はモバイル幅での挙動を規定している
    mockMatchMedia(true);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    if (originalMatchMedia) {
      (window as unknown as { matchMedia: MatchMediaImpl }).matchMedia = originalMatchMedia;
    } else {
      delete (window as unknown as { matchMedia?: MatchMediaImpl }).matchMedia;
    }
  });

  // ==========================================================================
  // 色ピッカー（線色プリセット）の gap >= 8px (Req 28.7)
  // ==========================================================================
  describe('モバイル幅における色プリセットコンテナの gap', () => {
    it('モバイル幅で線色プリセットコンテナの gap が 8px 以上である (Req 28.7)', () => {
      render(<StylePanel styleOptions={DEFAULT_STYLE_OPTIONS} onStyleChange={vi.fn()} />);
      expandStylePanel();

      const container = screen.getByTestId('stroke-color-presets');
      const gap = parsePxValue(getStyleProperty(container, 'gap'));
      expect(gap).toBeGreaterThanOrEqual(8);
    });

    it('モバイル幅で塗りつぶし色プリセットコンテナの gap が 8px 以上である (Req 28.7)', () => {
      render(<StylePanel styleOptions={DEFAULT_STYLE_OPTIONS} onStyleChange={vi.fn()} />);
      expandStylePanel();

      const container = screen.getByTestId('fill-color-presets');
      const gap = parsePxValue(getStyleProperty(container, 'gap'));
      expect(gap).toBeGreaterThanOrEqual(8);
    });
  });

  // ==========================================================================
  // 線幅ピッカーの gap >= 8px (Req 28.7)
  // ==========================================================================
  describe('モバイル幅における線幅プリセットコンテナの gap', () => {
    it('モバイル幅で線幅プリセットコンテナの gap が 8px 以上である (Req 28.7)', () => {
      render(<StylePanel styleOptions={DEFAULT_STYLE_OPTIONS} onStyleChange={vi.fn()} />);
      expandStylePanel();

      const container = screen.getByTestId('stroke-width-preset-container');
      const gap = parsePxValue(getStyleProperty(container, 'gap'));
      expect(gap).toBeGreaterThanOrEqual(8);
    });

    it('モバイル幅でフォントサイズプリセットコンテナの gap が 8px 以上である (Req 28.7)', () => {
      render(<StylePanel styleOptions={DEFAULT_STYLE_OPTIONS} onStyleChange={vi.fn()} />);
      expandStylePanel();

      const container = screen.getByTestId('font-size-preset-container');
      const gap = parsePxValue(getStyleProperty(container, 'gap'));
      expect(gap).toBeGreaterThanOrEqual(8);
    });
  });

  // ==========================================================================
  // デスクトップ幅では既存レイアウトを保持（回帰防止）
  // ==========================================================================
  describe('デスクトップ幅では既存の密なレイアウトを維持', () => {
    it('デスクトップ幅では線色プリセットコンテナの gap はモバイル幅より小さい（既存 4px）', () => {
      mockMatchMedia(false);

      render(<StylePanel styleOptions={DEFAULT_STYLE_OPTIONS} onStyleChange={vi.fn()} />);
      expandStylePanel();

      const container = screen.getByTestId('stroke-color-presets');
      const gap = parsePxValue(getStyleProperty(container, 'gap'));
      // デスクトップ幅では従来の密なレイアウト (gap=4px) を維持
      expect(gap).toBe(4);
    });
  });
});
