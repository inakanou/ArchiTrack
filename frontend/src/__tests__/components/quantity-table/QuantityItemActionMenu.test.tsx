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

  // ==========================================================================
  // Task 69.1: Portal 描画とスクロール追従（REQ-46）
  //
  // ドロップダウンは QuantityGroupCard.itemTableWrapper（overflowX: auto /
  // overflowY: hidden = REQ-41 の水平スクロール実装）にクリップされ、メニューが
  // 見えなくなっていた。CSS では解決できない（overflow: visible に戻すと REQ-41 の
  // 水平スクロールが壊れる）ため、Portal で document.body 直下へ逃がす。
  // AutocompleteInput.tsx が同一の回帰を同じパターンで解決済み（PR #647 / e6d7edd）。
  //
  // 【検証の限界】jsdom はレイアウトを持たないため「実際にクリップされないこと」は
  // 検証できない（toBeVisible() はクリップされていても真になる）。ここで検証できるのは
  // 「document.body 直下に描画される」「position: fixed である」「スクロールで座標が
  // 再計算される」「z-index が sticky ヘッダー(zIndex:50)より前面」といった構造的性質に
  // 限られる。幾何的なクリップ検証は Task 71.1 の E2E（実ブラウザ）に委譲する。
  // ==========================================================================
  describe('REQ-46: Portal 描画とスクロール追従 (Task 69.1)', () => {
    /** 指定した矩形を返す DOMRect を生成する */
    const makeRect = (rect: { top: number; left: number; bottom: number; right: number }): DOMRect =>
      ({
        top: rect.top,
        left: rect.left,
        bottom: rect.bottom,
        right: rect.right,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
        x: rect.left,
        y: rect.top,
        toJSON: () => ({}),
      }) as DOMRect;

    it('REQ-46.1/46.2: ドロップダウンはPortalでdocument.body直下に描画され祖先のoverflowにクリップされない', () => {
      render(
        <div data-testid="overflow-wrapper" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <QuantityItemActionMenu {...defaultProps} isOpen={true} />
        </div>
      );

      const menu = screen.getByRole('menu');
      const wrapper = screen.getByTestId('overflow-wrapper');

      // overflow を持つ祖先ラッパーの内側には描画されない（クリップ回避）
      expect(wrapper).not.toContainElement(menu);
      // Portal により document.body 直下へ描画される
      expect(menu.parentElement).toBe(document.body);
    });

    it('REQ-46.2: ドロップダウンが position: fixed で配置される（祖先の overflow の影響を受けない）', () => {
      render(<QuantityItemActionMenu {...defaultProps} isOpen={true} />);

      const menu = screen.getByRole('menu');
      expect(menu.style.position).toBe('fixed');
    });

    it('REQ-46.7: ドロップダウンの z-index が固定ヘッダー（zIndex: 50）より前面である', () => {
      render(<QuantityItemActionMenu {...defaultProps} isOpen={true} />);

      const menu = screen.getByRole('menu');
      // QuantityTableEditPage の sticky ヘッダーは zIndex: 50
      expect(Number(menu.style.zIndex)).toBeGreaterThan(50);
    });

    it('REQ-46.1: アクションボタンの矩形から fixed 座標（ボタン直下・右揃え）が算出される', () => {
      const { rerender } = render(<QuantityItemActionMenu {...defaultProps} isOpen={false} />);

      const button = screen.getByRole('button', { name: 'アクション' });
      vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(
        makeRect({ top: 78, left: 278, bottom: 100, right: 300 })
      );

      rerender(<QuantityItemActionMenu {...defaultProps} isOpen={true} />);

      const menu = screen.getByRole('menu');
      // ボタン下端 + 2px
      expect(menu.style.top).toBe('102px');
      // ボタン右端に右揃え（メニュー幅 140px）
      expect(menu.style.left).toBe('160px');
    });

    it('REQ-46.5/46.6: 祖先のスクロール（capture フェーズ）でメニュー座標が再計算されボタンに追従する', () => {
      const { rerender } = render(
        <div data-testid="overflow-wrapper" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <QuantityItemActionMenu {...defaultProps} isOpen={false} />
        </div>
      );

      const button = screen.getByRole('button', { name: 'アクション' });
      const rectSpy = vi
        .spyOn(button, 'getBoundingClientRect')
        .mockReturnValue(makeRect({ top: 78, left: 278, bottom: 100, right: 300 }));

      rerender(
        <div data-testid="overflow-wrapper" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <QuantityItemActionMenu {...defaultProps} isOpen={true} />
        </div>
      );

      const menu = screen.getByRole('menu');
      expect(menu.style.top).toBe('102px');
      expect(menu.style.left).toBe('160px');

      // 表を水平スクロール（ボタンが左へ移動）＋ 画面を垂直スクロール（ボタンが上へ移動）
      rectSpy.mockReturnValue(makeRect({ top: 28, left: 178, bottom: 50, right: 200 }));

      // itemTableWrapper のスクロールは window までバブルしないため、
      // 実装は capture フェーズで購読していなければ追従できない。
      fireEvent.scroll(screen.getByTestId('overflow-wrapper'));

      expect(menu.style.top).toBe('52px');
      expect(menu.style.left).toBe('60px');
    });

    it('REQ-46.5/46.6: ウィンドウリサイズでもメニュー座標が再計算される', () => {
      const { rerender } = render(<QuantityItemActionMenu {...defaultProps} isOpen={false} />);

      const button = screen.getByRole('button', { name: 'アクション' });
      const rectSpy = vi
        .spyOn(button, 'getBoundingClientRect')
        .mockReturnValue(makeRect({ top: 78, left: 278, bottom: 100, right: 300 }));

      rerender(<QuantityItemActionMenu {...defaultProps} isOpen={true} />);
      expect(screen.getByRole('menu').style.top).toBe('102px');

      rectSpy.mockReturnValue(makeRect({ top: 178, left: 378, bottom: 200, right: 400 }));
      fireEvent(window, new Event('resize'));

      const menu = screen.getByRole('menu');
      expect(menu.style.top).toBe('202px');
      expect(menu.style.left).toBe('260px');
    });

    it('REQ-46.10: Portal 化後もメニュー項目の構成と活性制御が変わらない（REQ-36 回帰防止）', () => {
      render(
        <div data-testid="overflow-wrapper" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <QuantityItemActionMenu {...defaultProps} isOpen={true} canMoveUp={false} />
        </div>
      );

      const menu = screen.getByRole('menu');
      expect(within(menu).getByText('上へ移動')).toBeInTheDocument();
      expect(within(menu).getByText('下へ移動')).toBeInTheDocument();
      expect(within(menu).getByText('コピー')).toBeInTheDocument();
      expect(within(menu).getByText('削除')).toBeInTheDocument();
      expect(within(menu).getByText('上へ移動').closest('button')).toBeDisabled();
      expect(within(menu).getByText('下へ移動').closest('button')).not.toBeDisabled();
    });

    it('REQ-46.9: Portal 先のメニュー項目クリックでも操作が実行されメニューが閉じる', async () => {
      const user = userEvent.setup();
      render(
        <div data-testid="overflow-wrapper" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <QuantityItemActionMenu {...defaultProps} isOpen={true} />
        </div>
      );

      await user.click(screen.getByText('コピー'));

      expect(defaultProps.onCopy).toHaveBeenCalledTimes(1);
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });
});
