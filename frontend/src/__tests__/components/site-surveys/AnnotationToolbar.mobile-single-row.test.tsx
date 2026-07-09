/**
 * @fileoverview AnnotationToolbar モバイル単段（横スクロール）レイアウトテスト
 *
 * Task 102.2: AnnotationToolbar のモバイル単段化
 *
 * モバイル幅ではツールバーを `flexWrap: nowrap` + `overflowX: auto` の
 * 単段レイアウトにし、縦方向の占有を抑えて画像作業領域の縦高を確保する。
 * その際、ボタンの 44px タップ領域（Req 28.3）は維持し、
 * スタイルパネル／アクションボタン群は潰れず（flexShrink: 0）横スクロールへあふれさせる。
 * デスクトップ幅では既存の折返し（wrap）レイアウトを維持する。
 *
 * Requirements:
 * - 36.3: 画像作業領域の短辺を画面短辺の概ね50%以上確保する（ツールバーの縦占有を抑制）
 * - 36.5: モバイル幅でツールバーが縦方向の表示領域を過度に占有しない（単段化）
 *
 * @requirement site-survey/REQ-36.3
 * @requirement site-survey/REQ-36.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import AnnotationToolbar, {
  type ToolType,
} from '../../../components/site-surveys/AnnotationToolbar';

// useMediaQuery をモック化（isMobile 判定をテストから制御）
vi.mock('../../../hooks/useMediaQuery', () => ({
  default: vi.fn(() => false),
}));

import useMediaQuery from '../../../hooks/useMediaQuery';

/**
 * インラインスタイルから CSS プロパティ値を取得するヘルパー
 * JSDOM の style は 'flex-wrap' のようなケバブケースで参照する。
 */
const getStyleProperty = (el: Element, prop: string): string | null => {
  const style = (el as HTMLElement).style;
  return style.getPropertyValue(prop) || null;
};

// 描画ツールを選択してスタイルパネル（style-options）を表示させる
const defaultProps = {
  activeTool: 'arrow' as ToolType,
  onToolChange: vi.fn(),
  disabled: false,
};

describe('AnnotationToolbar - モバイル単段レイアウト (Task 102.2, Req 36.3/36.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMediaQuery).mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('モバイル幅（isMobile=true）: 単段化 + 横スクロール', () => {
    beforeEach(() => {
      vi.mocked(useMediaQuery).mockReturnValue(true);
    });

    it('Req36.5: ツールバーが flex-wrap: nowrap の単段レイアウトになる', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      expect(getStyleProperty(toolbar, 'flex-wrap')).toBe('nowrap');
    });

    it('Req36.5: 単段化しても overflow-x: auto を保持し全項目へ横スクロールで到達できる', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      expect(getStyleProperty(toolbar, 'overflow-x')).toBe('auto');
    });

    it('Req28.3 非回帰: ツールボタンの 44px タップ領域を維持する', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const selectButton = screen.getByRole('button', { name: /選択/i });
      expect(getStyleProperty(selectButton, 'min-width')).toBe('44px');
      expect(getStyleProperty(selectButton, 'min-height')).toBe('44px');
    });

    it('Req36.5: スタイルパネルは潰れず（flex-shrink: 0）横スクロールへあふれる', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const stylePanel = screen.getByTestId('style-options');
      expect(getStyleProperty(stylePanel, 'flex-shrink')).toBe('0');
    });

    it('Req36.5: アクションボタン群は潰れず（flex-shrink: 0）margin-left:auto を解除する', () => {
      render(<AnnotationToolbar {...defaultProps} onSave={vi.fn()} onExport={vi.fn()} />);
      const container = screen.getByTestId('action-buttons-container');
      expect(getStyleProperty(container, 'flex-shrink')).toBe('0');
      // nowrap の横スクロール前提では margin-left:auto は不適切なため解除する
      expect(getStyleProperty(container, 'margin-left')).not.toBe('auto');
    });
  });

  describe('デスクトップ幅（isMobile=false）: 既存 wrap レイアウト維持', () => {
    beforeEach(() => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
    });

    it('Req35.7 非回帰: ツールバーは flex-wrap: wrap の折返しレイアウトを維持する', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      expect(getStyleProperty(toolbar, 'flex-wrap')).toBe('wrap');
    });

    it('Req35.7 非回帰: アクションボタン群は margin-left:auto を維持する', () => {
      render(<AnnotationToolbar {...defaultProps} onSave={vi.fn()} onExport={vi.fn()} />);
      const container = screen.getByTestId('action-buttons-container');
      expect(getStyleProperty(container, 'margin-left')).toBe('auto');
    });
  });
});
