/**
 * @fileoverview AnnotationToolbar モバイルレイアウトテスト
 *
 * Task 70.1: ツールバーの flexWrap と 44x44 タップ領域、ツールバー領域の描画抑止境界を導入
 *
 * Requirements:
 * - 28.1: ツールバー項目が画面幅に収まるようにレイアウトする
 * - 28.2: 折返しまたはスクロール可能な領域として項目全てにアクセス可能にする
 * - 28.3: モバイル幅ツールバーの各項目のタップ領域を最小44x44論理ピクセル以上のサイズで提供する
 * - 28.4: 端末の向き（縦/横）変更時にレイアウトを再構成する
 * - 28.5: デスクトップ幅と同じ全操作がモバイル幅でもアクセス可能
 * - 28.6: ツールバー操作が背景画像への描画として誤って発火しないようにする（pointerEvents boundary）
 *
 * テスト対象:
 * - STYLES.toolbar に flexWrap: 'wrap' が設定され、既存 overflowX: 'auto' と両立している
 * - STYLES.toolbar に pointerEvents: 'auto' が設定されている（描画抑止境界）
 * - 各ツールボタンの min 寸法が 44x44 論理ピクセルで統一されている
 * - orientation / resize 変化時に React 再描画が走る
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import AnnotationToolbar, {
  type ToolType,
} from '../../../components/site-surveys/AnnotationToolbar';

const defaultProps = {
  activeTool: 'select' as ToolType,
  onToolChange: vi.fn(),
  disabled: false,
};

/**
 * インラインスタイル属性のパース補助:
 * JSDOM の getAttribute('style') は 'flex-wrap: wrap; ...' のような
 * ケバブケース文字列で返る。プロパティの存在と値を部分一致で検証する。
 */
const getStyleProperty = (el: Element, prop: string): string | null => {
  const style = (el as HTMLElement).style;
  return style.getPropertyValue(prop) || null;
};

describe('AnnotationToolbar - Mobile Layout (Task 70.1, Req 28.1-28.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('STYLES.toolbar: flexWrap + overflowX + pointerEvents', () => {
    it('ツールバーコンテナに flexWrap: wrap が設定されている (Req 28.1, 28.2)', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      expect(getStyleProperty(toolbar, 'flex-wrap')).toBe('wrap');
    });

    it('ツールバーコンテナに overflowX: auto が（併存して）保持されている (Req 28.2)', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      // overflow-x either matches directly, or `overflow` shorthand includes 'auto'
      const overflowX = getStyleProperty(toolbar, 'overflow-x');
      expect(overflowX).toBe('auto');
    });

    it('ツールバーコンテナに pointerEvents: auto が設定され、描画抑止境界を確立している (Req 28.6)', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      expect(getStyleProperty(toolbar, 'pointer-events')).toBe('auto');
    });

    it('ツールバーは display: flex / flex-direction: row を保持している（既存レイアウトを壊さない）', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      expect(getStyleProperty(toolbar, 'display')).toBe('flex');
      expect(getStyleProperty(toolbar, 'flex-direction')).toBe('row');
    });
  });

  describe('ツールボタンの 44x44 タップ領域 (Req 28.3)', () => {
    it('選択ツールボタンの minWidth / minHeight が 44px である', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const selectButton = screen.getByRole('button', { name: /選択/i });
      expect(getStyleProperty(selectButton, 'min-width')).toBe('44px');
      expect(getStyleProperty(selectButton, 'min-height')).toBe('44px');
    });

    it('寸法線ツールボタンの minWidth / minHeight が 44px である', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const dimensionButton = screen.getByRole('button', { name: /寸法線/i });
      expect(getStyleProperty(dimensionButton, 'min-width')).toBe('44px');
      expect(getStyleProperty(dimensionButton, 'min-height')).toBe('44px');
    });

    it('矢印ツールボタンの minWidth / minHeight が 44px である', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const arrowButton = screen.getByRole('button', { name: /矢印/i });
      expect(getStyleProperty(arrowButton, 'min-width')).toBe('44px');
      expect(getStyleProperty(arrowButton, 'min-height')).toBe('44px');
    });

    it('テキストツールボタンの minWidth / minHeight が 44px である', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const textButton = screen.getByRole('button', { name: /テキスト/i });
      expect(getStyleProperty(textButton, 'min-width')).toBe('44px');
      expect(getStyleProperty(textButton, 'min-height')).toBe('44px');
    });

    it('48px が button.base のいずれの次元にも残っていない（設計値への完全移行）', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const selectButton = screen.getByRole('button', { name: /選択/i });
      expect(getStyleProperty(selectButton, 'min-width')).not.toBe('48px');
      expect(getStyleProperty(selectButton, 'min-height')).not.toBe('48px');
    });
  });

  describe('回転/リサイズ時のレイアウト再構成 (Req 28.4)', () => {
    it('window.resize 発火でコンポーネントが再レンダリングされ、スタイルが維持される', () => {
      const { rerender } = render(<AnnotationToolbar {...defaultProps} />);

      // 初期状態確認
      let toolbar = screen.getByTestId('annotation-toolbar');
      expect(getStyleProperty(toolbar, 'flex-wrap')).toBe('wrap');

      // 端末回転をシミュレート（innerWidth 変更 + resize イベント発火）
      act(() => {
        (window as unknown as { innerWidth: number }).innerWidth = 667;
        (window as unknown as { innerHeight: number }).innerHeight = 375;
        window.dispatchEvent(new Event('resize'));
      });

      // 再レンダリング後もスタイルが維持される
      rerender(<AnnotationToolbar {...defaultProps} />);
      toolbar = screen.getByTestId('annotation-toolbar');
      expect(getStyleProperty(toolbar, 'flex-wrap')).toBe('wrap');
      expect(getStyleProperty(toolbar, 'pointer-events')).toBe('auto');
    });

    it('resize イベントリスナーのマウント/アンマウントが安全に行われる（メモリリークしない）', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = render(<AnnotationToolbar {...defaultProps} />);

      const resizeListenersAddedCount = addSpy.mock.calls.filter(
        (call) => call[0] === 'resize'
      ).length;
      expect(resizeListenersAddedCount).toBeGreaterThanOrEqual(1);

      unmount();

      const resizeListenersRemovedCount = removeSpy.mock.calls.filter(
        (call) => call[0] === 'resize'
      ).length;
      // 登録した数と同じ数だけクリーンアップされる
      expect(resizeListenersRemovedCount).toBeGreaterThanOrEqual(resizeListenersAddedCount);

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe('モバイル Viewport (375x667) でのツールアクセス到達性 (Req 28.5)', () => {
    beforeEach(() => {
      (window as unknown as { innerWidth: number }).innerWidth = 375;
      (window as unknown as { innerHeight: number }).innerHeight = 667;
    });

    afterEach(() => {
      // デフォルトに戻す（JSDOM の既定値 1024）
      (window as unknown as { innerWidth: number }).innerWidth = 1024;
      (window as unknown as { innerHeight: number }).innerHeight = 768;
    });

    it('モバイル幅でも全ツールボタン（選択、寸法線、矢印、円、四角形、多角形、折れ線、フリーハンド、テキスト）が到達可能', () => {
      render(<AnnotationToolbar {...defaultProps} />);

      expect(screen.getByRole('button', { name: /選択/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /寸法線/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /矢印/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^円/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /四角形/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /多角形/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /折れ線/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /フリーハンド/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /テキスト/i })).toBeInTheDocument();
    });
  });
});
