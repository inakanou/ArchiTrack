/**
 * @fileoverview useKeyboardNavigation フック ユニットテスト
 *
 * Task 12.1: キーボードナビゲーションの実装
 *
 * Requirements:
 * - 20.1: すべての操作をキーボードのみで実行可能にする
 * - 20.4: フォーカス状態を視覚的に明確に表示
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useRef } from 'react';
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation';

// テスト用コンポーネント
function TestComponent({
  circular = false,
  onActivate,
}: {
  circular?: boolean;
  onActivate?: (index: number) => void;
}) {
  const containerRef = useRef<HTMLElement>(null);
  const { getItemProps } = useKeyboardNavigation({
    containerRef,
    circular,
  });

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      role="listbox"
      aria-label="Test list"
    >
      {[0, 1, 2].map((index) => (
        <button
          key={index}
          data-testid={`item-${index}`}
          {...getItemProps(index, {
            onActivate: onActivate ? () => onActivate(index) : undefined,
          })}
        >
          Item {index}
        </button>
      ))}
    </div>
  );
}

describe('useKeyboardNavigation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('基本機能', () => {
    it('getItemProps が正しいプロパティを返す', () => {
      render(<TestComponent />);

      const item0 = screen.getByTestId('item-0');
      expect(item0).toHaveAttribute('tabindex', '0');
    });

    it('ArrowDown でフォーカスが次の要素に移動する', async () => {
      const user = userEvent.setup();
      render(<TestComponent />);

      const item0 = screen.getByTestId('item-0');
      item0.focus();

      await user.keyboard('{ArrowDown}');

      expect(screen.getByTestId('item-1')).toHaveFocus();
    });

    it('ArrowUp でフォーカスが前の要素に移動する', async () => {
      const user = userEvent.setup();
      render(<TestComponent />);

      const item1 = screen.getByTestId('item-1');
      item1.focus();

      await user.keyboard('{ArrowUp}');

      expect(screen.getByTestId('item-0')).toHaveFocus();
    });

    it('Home で最初の要素にフォーカスが移動する', async () => {
      const user = userEvent.setup();
      render(<TestComponent />);

      const item2 = screen.getByTestId('item-2');
      item2.focus();

      await user.keyboard('{Home}');

      expect(screen.getByTestId('item-0')).toHaveFocus();
    });

    it('End で最後の要素にフォーカスが移動する', async () => {
      const user = userEvent.setup();
      render(<TestComponent />);

      const item0 = screen.getByTestId('item-0');
      item0.focus();

      await user.keyboard('{End}');

      expect(screen.getByTestId('item-2')).toHaveFocus();
    });
  });

  describe('循環ナビゲーション', () => {
    it('circular: false の場合、最後の要素で ArrowDown を押しても移動しない', async () => {
      const user = userEvent.setup();
      render(<TestComponent circular={false} />);

      const item2 = screen.getByTestId('item-2');
      item2.focus();

      await user.keyboard('{ArrowDown}');

      expect(screen.getByTestId('item-2')).toHaveFocus();
    });

    it('circular: true の場合、最後の要素で ArrowDown を押すと最初の要素に移動', async () => {
      const user = userEvent.setup();
      render(<TestComponent circular={true} />);

      const item2 = screen.getByTestId('item-2');
      item2.focus();

      await user.keyboard('{ArrowDown}');

      expect(screen.getByTestId('item-0')).toHaveFocus();
    });

    it('circular: true の場合、最初の要素で ArrowUp を押すと最後の要素に移動', async () => {
      const user = userEvent.setup();
      render(<TestComponent circular={true} />);

      const item0 = screen.getByTestId('item-0');
      item0.focus();

      await user.keyboard('{ArrowUp}');

      expect(screen.getByTestId('item-2')).toHaveFocus();
    });
  });

  describe('アクティベーション', () => {
    it('Enter キーで onActivate が呼び出される', async () => {
      const user = userEvent.setup();
      const onActivate = vi.fn();
      render(<TestComponent onActivate={onActivate} />);

      const item1 = screen.getByTestId('item-1');
      item1.focus();

      await user.keyboard('{Enter}');

      expect(onActivate).toHaveBeenCalledWith(1);
    });

    it('Space キーで onActivate が呼び出される', async () => {
      const user = userEvent.setup();
      const onActivate = vi.fn();
      render(<TestComponent onActivate={onActivate} />);

      const item0 = screen.getByTestId('item-0');
      item0.focus();

      await user.keyboard(' ');

      expect(onActivate).toHaveBeenCalledWith(0);
    });
  });
});
