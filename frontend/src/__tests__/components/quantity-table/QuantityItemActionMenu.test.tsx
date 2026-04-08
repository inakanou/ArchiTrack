/**
 * @fileoverview 数量項目アクションメニューコンポーネントテスト
 *
 * Task 50.3: アクションボタン統合のテストを実装する
 *
 * Requirements:
 * - 36.1: 並び替えボタン・削除ボタンを個別表示せず、アクションメニューボタン内に統合
 * - 36.2: アクションメニューボタンクリックでドロップダウン表示
 * - 36.3: 「上へ移動」選択で1つ上に移動
 * - 36.4: 「下へ移動」選択で1つ下に移動
 * - 36.5: 「削除」選択で項目削除
 * - 36.6: 最上位項目で「上へ移動」がdisabled
 * - 36.7: 最下位項目で「下へ移動」がdisabled
 * - 36.8: 既存操作項目（コピー等）と統合表示
 * - 36.9: メニュー外クリックでドロップダウン閉じる
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuantityItemActionMenu from '../../../components/quantity-table/QuantityItemActionMenu';

describe('QuantityItemActionMenu (Task 50.1, 50.3)', () => {
  const defaultProps = {
    isOpen: false,
    onToggle: vi.fn(),
    onClose: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onCopy: vi.fn(),
    onDelete: vi.fn(),
    canMoveUp: true,
    canMoveDown: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('REQ-36.2: ドロップダウン表示', () => {
    it('アクションメニューボタンクリックでonToggleが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<QuantityItemActionMenu {...defaultProps} />);

      const menuButton = screen.getByRole('button', { name: 'アクション' });
      await user.click(menuButton);

      expect(defaultProps.onToggle).toHaveBeenCalledTimes(1);
    });

    it('isOpen=trueの場合、ドロップダウンメニューが表示されること', () => {
      render(<QuantityItemActionMenu {...defaultProps} isOpen={true} />);

      const menu = screen.getByRole('menu');
      expect(menu).toBeInTheDocument();
    });

    it('isOpen=falseの場合、ドロップダウンメニューが非表示であること', () => {
      render(<QuantityItemActionMenu {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('REQ-36.2, 36.8: メニュー項目の表示', () => {
    it('メニュー内に「上へ移動」「下へ移動」「コピー」「削除」の4項目が表示されること', () => {
      render(<QuantityItemActionMenu {...defaultProps} isOpen={true} />);

      const menu = screen.getByRole('menu');
      expect(within(menu).getByText('上へ移動')).toBeInTheDocument();
      expect(within(menu).getByText('下へ移動')).toBeInTheDocument();
      expect(within(menu).getByText('コピー')).toBeInTheDocument();
      expect(within(menu).getByText('削除')).toBeInTheDocument();
    });

    it('「削除」が赤文字スタイルで表示されること', () => {
      render(<QuantityItemActionMenu {...defaultProps} isOpen={true} />);

      const deleteItem = screen.getByText('削除').closest('button');
      expect(deleteItem).toBeTruthy();
      // 赤文字スタイル適用を確認
      const computedStyle = deleteItem?.style;
      expect(computedStyle?.color).toBe('rgb(220, 38, 38)');
    });
  });

  describe('REQ-36.3: 上へ移動', () => {
    it('「上へ移動」選択でonMoveUpが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<QuantityItemActionMenu {...defaultProps} isOpen={true} />);

      await user.click(screen.getByText('上へ移動'));

      expect(defaultProps.onMoveUp).toHaveBeenCalledTimes(1);
    });
  });

  describe('REQ-36.4: 下へ移動', () => {
    it('「下へ移動」選択でonMoveDownが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<QuantityItemActionMenu {...defaultProps} isOpen={true} />);

      await user.click(screen.getByText('下へ移動'));

      expect(defaultProps.onMoveDown).toHaveBeenCalledTimes(1);
    });
  });

  describe('REQ-36.5: 削除', () => {
    it('「削除」選択でonDeleteが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<QuantityItemActionMenu {...defaultProps} isOpen={true} />);

      await user.click(screen.getByText('削除'));

      expect(defaultProps.onDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe('REQ-36.6: 最上位項目で「上へ移動」がdisabled', () => {
    it('canMoveUp=falseの場合、「上へ移動」がdisabledであること', () => {
      render(<QuantityItemActionMenu {...defaultProps} isOpen={true} canMoveUp={false} />);

      const moveUpButton = screen.getByText('上へ移動').closest('button');
      expect(moveUpButton).toBeDisabled();
    });
  });

  describe('REQ-36.7: 最下位項目で「下へ移動」がdisabled', () => {
    it('canMoveDown=falseの場合、「下へ移動」がdisabledであること', () => {
      render(<QuantityItemActionMenu {...defaultProps} isOpen={true} canMoveDown={false} />);

      const moveDownButton = screen.getByText('下へ移動').closest('button');
      expect(moveDownButton).toBeDisabled();
    });
  });

  describe('REQ-36.9: メニュー外クリックでドロップダウン閉じる', () => {
    it('メニューラッパーからフォーカスが外れるとonCloseが呼ばれること', () => {
      render(
        <div>
          <QuantityItemActionMenu {...defaultProps} isOpen={true} />
          <button data-testid="outside-button">外部ボタン</button>
        </div>
      );

      // メニューラッパー要素を取得
      const menuButton = screen.getByRole('button', { name: 'アクション' });
      const wrapper = menuButton.parentElement!;

      // relatedTargetがメニュー外の要素を指すblurイベントを発火
      const outsideButton = screen.getByTestId('outside-button');
      fireEvent.blur(wrapper, { relatedTarget: outsideButton });

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('メニュー内の要素間のフォーカス移動ではonCloseが呼ばれないこと', () => {
      render(<QuantityItemActionMenu {...defaultProps} isOpen={true} />);

      const menuButton = screen.getByRole('button', { name: 'アクション' });
      const wrapper = menuButton.parentElement!;
      const copyButton = screen.getByText('コピー').closest('button')!;

      // relatedTargetがメニュー内の要素を指すblurイベント
      fireEvent.blur(wrapper, { relatedTarget: copyButton });

      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });
  });

  describe('REQ-36.1: アクションメニューボタンのみ表示', () => {
    it('三点メニューボタンが1つだけ表示されること', () => {
      render(<QuantityItemActionMenu {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      // アクションメニューボタン1つのみ
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveAttribute('aria-label', 'アクション');
    });
  });
});
