/**
 * @fileoverview ZoomControls コンポーネントのテスト（TDD）
 *
 * Task 94.1: ZoomControls の実装（ボタン/倍率バッジ/下部配置/44px）
 *
 * Requirements:
 * - 34.1: ズームイン・ズームアウト・全体表示（フィット）の操作手段を提供する
 * - 34.2: 現在のズーム倍率を示す視覚的表示を提供する
 * - 34.5: ズーム操作手段の各タップ領域を最小44x44論理ピクセル以上で提供する
 * - 34.6: ズーム操作手段を画面下部など片手のタッチで届きやすい領域に配置する
 * - 34.8: ズーム操作が背景画像への描画として誤発火しないようにする
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ZoomControls from '../../../components/site-surveys/ZoomControls';

const makeProps = (overrides: Partial<React.ComponentProps<typeof ZoomControls>> = {}) => ({
  zoom: 1,
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onFit: vi.fn(),
  ...overrides,
});

describe('ZoomControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // Req 34.1: 操作手段の提供
  describe('レンダリング (Req 34.1)', () => {
    it('コンテナとズームイン/アウト/フィットの3ボタンを表示する', () => {
      render(<ZoomControls {...makeProps()} />);

      expect(screen.getByTestId('zoom-controls')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ズームイン' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ズームアウト' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '全体表示' })).toBeInTheDocument();
    });
  });

  // Req 34.2: 倍率バッジ
  describe('倍率バッジ (Req 34.2)', () => {
    it('現在倍率 1 を 100% として表示する', () => {
      render(<ZoomControls {...makeProps({ zoom: 1 })} />);
      expect(screen.getByTestId('zoom-badge')).toHaveTextContent('100%');
    });

    it('現在倍率 1.5 を 150% として表示する', () => {
      render(<ZoomControls {...makeProps({ zoom: 1.5 })} />);
      expect(screen.getByTestId('zoom-badge')).toHaveTextContent('150%');
    });

    it('端数は四捨五入して表示する (2.345 -> 235%)', () => {
      render(<ZoomControls {...makeProps({ zoom: 2.345 })} />);
      expect(screen.getByTestId('zoom-badge')).toHaveTextContent('235%');
    });
  });

  // Req 34.3: ズーム変化に追従して倍率バッジが更新される
  describe('倍率バッジのズーム変化更新 (Req 34.3)', () => {
    it('zoom prop の変更で再レンダリングし、バッジが新しい倍率へ更新される', () => {
      const { rerender } = render(<ZoomControls {...makeProps({ zoom: 1 })} />);
      expect(screen.getByTestId('zoom-badge')).toHaveTextContent('100%');

      // ズームイン相当: zoom が増加
      rerender(<ZoomControls {...makeProps({ zoom: 2 })} />);
      expect(screen.getByTestId('zoom-badge')).toHaveTextContent('200%');

      // ズームアウト相当: zoom が減少
      rerender(<ZoomControls {...makeProps({ zoom: 0.5 })} />);
      expect(screen.getByTestId('zoom-badge')).toHaveTextContent('50%');
    });
  });

  // Req 34.1: ハンドラ結線
  describe('ハンドラ結線 (Req 34.1)', () => {
    it('ズームインボタンクリックで onZoomIn が呼ばれる', async () => {
      const user = userEvent.setup();
      const props = makeProps();
      render(<ZoomControls {...props} />);

      await user.click(screen.getByRole('button', { name: 'ズームイン' }));
      expect(props.onZoomIn).toHaveBeenCalledTimes(1);
    });

    it('ズームアウトボタンクリックで onZoomOut が呼ばれる', async () => {
      const user = userEvent.setup();
      const props = makeProps();
      render(<ZoomControls {...props} />);

      await user.click(screen.getByRole('button', { name: 'ズームアウト' }));
      expect(props.onZoomOut).toHaveBeenCalledTimes(1);
    });

    it('全体表示ボタンクリックで onFit が呼ばれる', async () => {
      const user = userEvent.setup();
      const props = makeProps();
      render(<ZoomControls {...props} />);

      await user.click(screen.getByRole('button', { name: '全体表示' }));
      expect(props.onFit).toHaveBeenCalledTimes(1);
    });
  });

  // Req 34.5: 44px タップ領域
  describe('タップ領域 44px (Req 34.5)', () => {
    it('全ボタンの minWidth/minHeight が 44px 以上', () => {
      render(<ZoomControls {...makeProps()} />);

      const buttons = [
        screen.getByRole('button', { name: 'ズームイン' }),
        screen.getByRole('button', { name: 'ズームアウト' }),
        screen.getByRole('button', { name: '全体表示' }),
      ];

      for (const button of buttons) {
        const minWidth = parseInt(button.style.minWidth, 10);
        const minHeight = parseInt(button.style.minHeight, 10);
        expect(minWidth).toBeGreaterThanOrEqual(44);
        expect(minHeight).toBeGreaterThanOrEqual(44);
      }
    });
  });

  // Req 34.6: 下部配置
  describe('下部・片手到達領域配置 (Req 34.6)', () => {
    it('コンテナが画面下部に固定配置される', () => {
      render(<ZoomControls {...makeProps()} />);
      const container = screen.getByTestId('zoom-controls');
      expect(container.style.position).toBe('fixed');
      expect(container.style.bottom).not.toBe('');
    });
  });

  // Req 34.8: 描画誤発火防止
  describe('描画誤発火防止 (Req 34.8)', () => {
    it('各ボタンの onClick が event.stopPropagation を呼び canvas へ伝播させない', async () => {
      const props = makeProps();
      const onParentClick = vi.fn();
      render(
        <div onClick={onParentClick} data-testid="parent">
          <ZoomControls {...props} />
        </div>
      );
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'ズームイン' }));
      await user.click(screen.getByRole('button', { name: 'ズームアウト' }));
      await user.click(screen.getByRole('button', { name: '全体表示' }));

      // stopPropagation により親（背景 canvas 相当）へ click が伝播しない
      expect(onParentClick).not.toHaveBeenCalled();
      expect(props.onZoomIn).toHaveBeenCalledTimes(1);
      expect(props.onZoomOut).toHaveBeenCalledTimes(1);
      expect(props.onFit).toHaveBeenCalledTimes(1);
    });

    it('コンテナの pointerEvents が auto で明示的なポインタ境界を持つ', () => {
      render(<ZoomControls {...makeProps()} />);
      const container = screen.getByTestId('zoom-controls');
      expect(container.style.pointerEvents).toBe('auto');
    });
  });

  // アクセシビリティ
  describe('アクセシビリティ', () => {
    it('各ボタンに aria-label が付与される', () => {
      render(<ZoomControls {...makeProps()} />);
      expect(screen.getByRole('button', { name: 'ズームイン' })).toHaveAttribute('aria-label');
      expect(screen.getByRole('button', { name: 'ズームアウト' })).toHaveAttribute('aria-label');
      expect(screen.getByRole('button', { name: '全体表示' })).toHaveAttribute('aria-label');
    });
  });
});
