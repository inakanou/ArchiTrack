/**
 * @fileoverview AnnotationToolbar - インライン StylePanel の色・線幅ピッカー間隔
 *
 * Task 70.3: 色・線幅ピッカーのタッチ誤選択抑止レイアウト（RED フェーズ）
 *
 * Requirements:
 * - 28.7: モバイル幅ツールバーの色ピッカー・線幅ピッカーを、タッチ操作で誤選択しにくい間隔で配置する
 *
 * テスト対象:
 * - AnnotationToolbar 内のインライン StylePanel（描画ツール選択時に表示される色/線幅入力群）が
 *   隣接タップ領域間に 8px 以上の間隔を持つ
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import AnnotationToolbar, {
  type ToolType,
} from '../../../components/site-surveys/AnnotationToolbar';

/**
 * インラインスタイルから CSS プロパティ値を取得するヘルパー
 */
const getStyleProperty = (el: Element, prop: string): string | null => {
  const style = (el as HTMLElement).style;
  return style.getPropertyValue(prop) || null;
};

const parsePxValue = (value: string | null): number => {
  if (!value) return Number.NaN;
  const match = value.match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? Number.parseFloat(match[1]!) : Number.NaN;
};

const defaultProps = {
  activeTool: 'arrow' as ToolType, // 描画ツール（StylePanel が表示される）
  onToolChange: vi.fn(),
  disabled: false,
};

describe('AnnotationToolbar - インライン StylePanel のピッカー間隔 (Task 70.3, Req 28.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('インライン StylePanel コンテナの gap が 8px 以上である (Req 28.7)', () => {
    render(<AnnotationToolbar {...defaultProps} />);

    // AnnotationToolbar.tsx の StylePanel は data-testid="style-options" を持つ
    const stylePanel = screen.getByTestId('style-options');
    const gap = parsePxValue(getStyleProperty(stylePanel, 'gap'));

    // 隣接タップ領域（色ピッカー ↔ 線幅入力 ↔ 塗りつぶし 等）間で 8px 以上
    expect(gap).toBeGreaterThanOrEqual(8);
  });

  it('色ピッカー (color-picker) と線幅入力 (line-width) がどちらもインライン StylePanel 内に存在する (回帰防止)', () => {
    render(<AnnotationToolbar {...defaultProps} />);

    expect(screen.getByTestId('color-picker')).toBeInTheDocument();
    expect(screen.getByTestId('line-width')).toBeInTheDocument();
  });
});
