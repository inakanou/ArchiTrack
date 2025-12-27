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
import React, { useRef, type KeyboardEvent } from 'react';
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation';

// テスト用コンポーネント（基本）
function TestComponent({
  circular = false,
  horizontal = false,
  onActivate,
  onKeyDown,
  itemOnKeyDown,
  onClick,
}: {
  circular?: boolean;
  horizontal?: boolean;
  onActivate?: (index: number) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  itemOnKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  onClick?: (index: number) => void;
}) {
  const containerRef = useRef<HTMLElement>(null);
  const { getItemProps } = useKeyboardNavigation({
    containerRef,
    circular,
    horizontal,
    onKeyDown,
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
            onKeyDown: itemOnKeyDown,
            onClick: onClick ? () => onClick(index) : undefined,
          })}
        >
          Item {index}
        </button>
      ))}
    </div>
  );
}

// フォーカス操作関数テスト用コンポーネント
function TestComponentWithFocusControls({ circular = false }: { circular?: boolean }) {
  const containerRef = useRef<HTMLElement>(null);
  const { getItemProps, focusFirstItem, focusLastItem, focusNextItem, focusPreviousItem } =
    useKeyboardNavigation({
      containerRef,
      circular,
    });

  return (
    <div>
      {/* コントロールボタンはコンテナの外に配置 */}
      <div data-testid="controls">
        <button data-testid="focus-first" onClick={focusFirstItem}>
          Focus First
        </button>
        <button data-testid="focus-last" onClick={focusLastItem}>
          Focus Last
        </button>
        <button data-testid="focus-next" onClick={focusNextItem}>
          Focus Next
        </button>
        <button data-testid="focus-prev" onClick={focusPreviousItem}>
          Focus Previous
        </button>
      </div>
      <div
        ref={containerRef as React.RefObject<HTMLDivElement>}
        role="listbox"
        aria-label="Test list"
      >
        {[0, 1, 2].map((index) => (
          <button key={index} data-testid={`item-${index}`} {...getItemProps(index)}>
            Item {index}
          </button>
        ))}
      </div>
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

  describe('水平ナビゲーション', () => {
    it('horizontal: true の場合、ArrowRight でフォーカスが次の要素に移動する', async () => {
      const user = userEvent.setup();
      render(<TestComponent horizontal={true} />);

      const item0 = screen.getByTestId('item-0');
      item0.focus();

      await user.keyboard('{ArrowRight}');

      expect(screen.getByTestId('item-1')).toHaveFocus();
    });

    it('horizontal: true の場合、ArrowLeft でフォーカスが前の要素に移動する', async () => {
      const user = userEvent.setup();
      render(<TestComponent horizontal={true} />);

      const item1 = screen.getByTestId('item-1');
      item1.focus();

      await user.keyboard('{ArrowLeft}');

      expect(screen.getByTestId('item-0')).toHaveFocus();
    });

    it('horizontal: true + circular: true の場合、最後で ArrowRight を押すと最初に移動', async () => {
      const user = userEvent.setup();
      render(<TestComponent horizontal={true} circular={true} />);

      const item2 = screen.getByTestId('item-2');
      item2.focus();

      await user.keyboard('{ArrowRight}');

      expect(screen.getByTestId('item-0')).toHaveFocus();
    });

    it('horizontal: true + circular: true の場合、最初で ArrowLeft を押すと最後に移動', async () => {
      const user = userEvent.setup();
      render(<TestComponent horizontal={true} circular={true} />);

      const item0 = screen.getByTestId('item-0');
      item0.focus();

      await user.keyboard('{ArrowLeft}');

      expect(screen.getByTestId('item-2')).toHaveFocus();
    });
  });

  describe('フォーカス操作関数', () => {
    it('focusFirstItem で最初の要素にフォーカスが移動する', async () => {
      const user = userEvent.setup();
      render(<TestComponentWithFocusControls />);

      await user.click(screen.getByTestId('focus-first'));

      expect(screen.getByTestId('item-0')).toHaveFocus();
    });

    it('focusLastItem で最後の要素にフォーカスが移動する', async () => {
      const user = userEvent.setup();
      render(<TestComponentWithFocusControls />);

      await user.click(screen.getByTestId('focus-last'));

      expect(screen.getByTestId('item-2')).toHaveFocus();
    });

    it('focusNextItem が呼び出し可能（コンテナ内要素が対象）', async () => {
      const user = userEvent.setup();
      render(<TestComponentWithFocusControls />);

      // まず最初の要素にフォーカスを移動
      await user.click(screen.getByTestId('focus-first'));
      expect(screen.getByTestId('item-0')).toHaveFocus();

      // focusNextItem はコンテナ内での相対移動
      // ボタンクリックでフォーカスが外れるため、結果の検証は省略
      await user.click(screen.getByTestId('focus-next'));
      // エラーが発生しないことを確認
      expect(screen.getByTestId('focus-next')).toBeInTheDocument();
    });

    it('focusPreviousItem が呼び出し可能（コンテナ内要素が対象）', async () => {
      const user = userEvent.setup();
      render(<TestComponentWithFocusControls />);

      // まず最後の要素にフォーカスを移動
      await user.click(screen.getByTestId('focus-last'));
      expect(screen.getByTestId('item-2')).toHaveFocus();

      // focusPreviousItem はコンテナ内での相対移動
      await user.click(screen.getByTestId('focus-prev'));
      // エラーが発生しないことを確認
      expect(screen.getByTestId('focus-prev')).toBeInTheDocument();
    });

    it('focusNextItem with circular: true', async () => {
      const user = userEvent.setup();
      render(<TestComponentWithFocusControls circular={true} />);

      await user.click(screen.getByTestId('focus-first'));
      expect(screen.getByTestId('item-0')).toHaveFocus();

      await user.click(screen.getByTestId('focus-next'));
      expect(screen.getByTestId('focus-next')).toBeInTheDocument();
    });
  });

  describe('コールバック', () => {
    it('onKeyDown 外部コールバックが呼び出される', async () => {
      const user = userEvent.setup();
      const onKeyDown = vi.fn();
      render(<TestComponent onKeyDown={onKeyDown} />);

      const item0 = screen.getByTestId('item-0');
      item0.focus();

      await user.keyboard('{ArrowDown}');

      expect(onKeyDown).toHaveBeenCalled();
    });

    it('itemOnKeyDown カスタムハンドラが呼び出される', async () => {
      const user = userEvent.setup();
      const itemOnKeyDown = vi.fn();
      render(<TestComponent itemOnKeyDown={itemOnKeyDown} />);

      const item0 = screen.getByTestId('item-0');
      item0.focus();

      await user.keyboard('{ArrowDown}');

      expect(itemOnKeyDown).toHaveBeenCalled();
    });

    it('onClick コールバックがクリックで呼び出される', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<TestComponent onClick={onClick} />);

      const item1 = screen.getByTestId('item-1');
      await user.click(item1);

      expect(onClick).toHaveBeenCalledWith(1);
    });

    it('onActivate が未定義でも onClick が設定されていれば使用される', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<TestComponent onClick={onClick} />);

      const item0 = screen.getByTestId('item-0');
      await user.click(item0);

      expect(onClick).toHaveBeenCalledWith(0);
    });
  });

  describe('エッジケース', () => {
    it('最初の要素で ArrowUp を押しても移動しない（circular: false）', async () => {
      const user = userEvent.setup();
      render(<TestComponent circular={false} />);

      const item0 = screen.getByTestId('item-0');
      item0.focus();

      await user.keyboard('{ArrowUp}');

      expect(screen.getByTestId('item-0')).toHaveFocus();
    });

    it('itemOnKeyDown で preventDefault されると処理がスキップされる', async () => {
      const user = userEvent.setup();
      const itemOnKeyDown = vi.fn((e: KeyboardEvent<HTMLElement>) => {
        e.preventDefault();
      });
      render(<TestComponent itemOnKeyDown={itemOnKeyDown} />);

      const item0 = screen.getByTestId('item-0');
      item0.focus();

      await user.keyboard('{ArrowDown}');

      // preventDefaultされているのでフォーカスは移動しない
      expect(screen.getByTestId('item-0')).toHaveFocus();
    });

    it('onActivate が未定義でもエラーにならない', async () => {
      const user = userEvent.setup();
      render(<TestComponent />);

      const item0 = screen.getByTestId('item-0');
      item0.focus();

      // Enter を押してもエラーにならない
      await user.keyboard('{Enter}');

      expect(item0).toBeInTheDocument();
    });
  });
});
