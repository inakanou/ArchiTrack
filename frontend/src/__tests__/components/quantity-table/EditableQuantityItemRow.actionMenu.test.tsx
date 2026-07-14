/**
 * @fileoverview EditableQuantityItemRow アクションメニュー統合テスト
 *
 * Task 50.2, 50.3: 数量項目行のアクションセルをメニューに統合するテスト
 *
 * Requirements:
 * - 36.1: 並び替えボタン・削除ボタンを個別表示せず、アクションメニューボタン内に統合
 * - 36.3: 「上へ移動」選択で1つ上に移動
 * - 36.4: 「下へ移動」選択で1つ下に移動
 * - 36.5: 「削除」選択で項目削除
 * - 36.8: 既存操作項目（コピー・移動等）と統合表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditableQuantityItemRow from '../../../components/quantity-table/EditableQuantityItemRow';
import type { QuantityItemDetail } from '../../../types/quantity-table.types';

const mockItem: QuantityItemDetail = {
  id: 'item-1',
  quantityGroupId: 'group-1',
  majorCategory: '共通仮設',
  middleCategory: null,
  minorCategory: null,
  customCategory: null,
  workType: '仮設工',
  name: '足場',
  specification: null,
  unit: 'm2',
  calculationMethod: 'STANDARD',
  calculationParams: null,
  adjustmentFactor: 1.0,
  roundingUnit: 0.01,
  quantity: 100,
  remarks: null,
  displayOrder: 0,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const defaultProps = {
  item: mockItem,
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  onCopy: vi.fn(),
  onMoveUp: vi.fn(),
  onMoveDown: vi.fn(),
  canMoveUp: true,
  canMoveDown: true,
  getSuggestions: vi.fn().mockReturnValue([]),
  onBlurAddCandidate: vi.fn(),
  showFieldLabels: false,
  itemIndex: 1,
  itemTotalCount: 3,
};

describe('EditableQuantityItemRow アクションメニュー統合 (Task 50.2, 50.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('REQ-36.1: 行に表示されるボタンがアクションメニューボタン1つのみ', () => {
    it('アクションセルにアクションメニューボタン（三点メニュー）のみ表示されること', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      const row = screen.getByTestId('quantity-item-row');

      // アクションメニューボタン（三点メニュー）が存在する
      const actionButton = within(row).getByRole('button', { name: 'アクション' });
      expect(actionButton).toBeInTheDocument();

      // 個別の「削除」ボタンが行に存在しないこと
      const deleteButtons = within(row).queryAllByRole('button', { name: '削除' });
      expect(deleteButtons).toHaveLength(0);

      // SortOrderButtonsの上下ボタンが行に直接存在しないこと
      const moveUpButtons = within(row).queryAllByRole('button', { name: '上に移動' });
      const moveDownButtons = within(row).queryAllByRole('button', { name: '下に移動' });
      expect(moveUpButtons).toHaveLength(0);
      expect(moveDownButtons).toHaveLength(0);
    });
  });

  describe('REQ-36.3, 36.4, 36.5, 36.8: メニューからの操作', () => {
    it('メニューを開くと「上へ移動」「下へ移動」「コピー」「削除」が表示されること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      // メニューを開く
      const actionButton = screen.getByRole('button', { name: 'アクション' });
      await user.click(actionButton);

      const menu = screen.getByRole('menu');
      expect(within(menu).getByText('上へ移動')).toBeInTheDocument();
      expect(within(menu).getByText('下へ移動')).toBeInTheDocument();
      expect(within(menu).getByText('コピー')).toBeInTheDocument();
      expect(within(menu).getByText('削除')).toBeInTheDocument();
    });

    it('「上へ移動」を選択するとonMoveUpが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByText('上へ移動'));

      expect(defaultProps.onMoveUp).toHaveBeenCalledWith('item-1');
    });

    it('「下へ移動」を選択するとonMoveDownが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByText('下へ移動'));

      expect(defaultProps.onMoveDown).toHaveBeenCalledWith('item-1');
    });

    it('「コピー」を選択するとonCopyが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByText('コピー'));

      expect(defaultProps.onCopy).toHaveBeenCalledWith('item-1');
    });

    it('「削除」を選択するとonDeleteが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByText('削除'));

      expect(defaultProps.onDelete).toHaveBeenCalledWith('item-1');
    });
  });

  // ==========================================================================
  // Task 69.2: 行側の二重の閉じ処理（onBlur）の撤去（REQ-46.8, 46.9）
  //
  // 69.1 の Portal 化でドロップダウンは document.body 直下へ移り、行（quantity-item-row）
  // の DOM ツリー外になった。行に張られていた onBlur（relatedTarget が行の内側かで判定）は
  // Portal 先のメニュー項目を常に「外側」と誤判定するため、キーボード Tab でメニュー項目へ
  // フォーカスを移すだけでメニューが閉じてしまう。閉じ判定は QuantityItemActionMenu の
  // outside-click（mousedown）+ Escape に一本化し、行側の二重処理は撤去する。
  // ==========================================================================
  describe('REQ-46.8: 閉じ判定の一本化（行側の二重 onBlur 撤去）(Task 69.2)', () => {
    it('Portal 先のメニュー項目へフォーカスが移ってもメニューが閉じないこと', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // キーボード Tab 相当: アクションボタン → Portal 先のメニュー項目へフォーカス移動
      const copyItem = screen.getByText('コピー').closest('button')!;
      await act(async () => {
        copyItem.focus();
      });

      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('行の内側の入力欄へフォーカスが移ってもメニューが閉じないこと（blur 方式の撤去）', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));

      const row = screen.getByTestId('quantity-item-row');
      // 行の外側の要素への blur でも、閉じ判定は mousedown / Escape に一本化されている
      fireEvent.blur(row, { relatedTarget: null });

      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('メニュー外を mousedown するとメニューが閉じること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      fireEvent.mouseDown(document.body);

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('Escape キーでメニューが閉じること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('アクションボタンの再クリックでメニューが閉じること（outside-click との二重発火がない）', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      const actionButton = screen.getByRole('button', { name: 'アクション' });
      await user.click(actionButton);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      await user.click(actionButton);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      // 再度開けること（outside-click で閉じてからトグルで開き直す二重発火が起きていない）
      await user.click(actionButton);
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 70.1: 行の状態としてメニューが閉じることの検証（REQ-46.9）
  //
  // 行（EditableQuantityItemRow）が isMenuOpen を保持し、メニューの onClose で閉じる。
  // 既存テストは各操作のコールバック発火のみを検証しており、「操作後にメニューが閉じる」
  // という行側の状態遷移を検証していなかった。閉じ処理は Portal 先のメニュー項目クリックから
  // onClose → 行の setIsMenuOpen(false) と伝播するため、Portal 化の回帰（メニューが開いたまま
  // 残る）を検出できるのはこの経路の検証だけである。
  //
  // 【検証の限界】jsdom はレイアウトを持たないため、メニューが表の水平スクロール領域に
  // 「切り取られないこと」は検証できない（要素は DOM 上に存在し toBeVisible() も真になる）。
  // 幾何的な切り取り検証は Task 71.1 の E2E（実ブラウザ）に委譲する。
  // ==========================================================================
  describe('REQ-46.9: 項目選択後にメニューが閉じる (Task 70.1)', () => {
    it.each([
      ['上へ移動', 'onMoveUp'],
      ['下へ移動', 'onMoveDown'],
      ['コピー', 'onCopy'],
      ['削除', 'onDelete'],
    ] as const)(
      '「%s」を選択すると %s が呼ばれたうえでメニューが閉じること',
      async (label, handler) => {
        const user = userEvent.setup();
        render(<EditableQuantityItemRow {...defaultProps} />);

        await user.click(screen.getByRole('button', { name: 'アクション' }));
        expect(screen.getByRole('menu')).toBeInTheDocument();

        await user.click(screen.getByText(label));

        expect(defaultProps[handler]).toHaveBeenCalledWith('item-1');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      }
    );

    it('メニューを閉じたあと再度開けること（行の開閉状態が固着しないこと）', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByText('コピー'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  describe('REQ-46.1: メニューは行の外（document.body 直下）へ Portal 描画される (Task 70.1)', () => {
    it('開いたメニューが行の DOM ツリー内に描画されず document.body 直下にあること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));

      const menu = screen.getByRole('menu');
      const row = screen.getByTestId('quantity-item-row');

      // 行（＝水平スクロールラッパーの内側）には描画されない
      expect(row).not.toContainElement(menu);
      expect(menu.parentElement).toBe(document.body);
    });
  });

  describe('REQ-36.6, 36.7: disabled状態', () => {
    it('最上位項目（canMoveUp=false）で「上へ移動」がdisabledであること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} canMoveUp={false} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));

      const moveUpButton = screen.getByText('上へ移動').closest('button');
      expect(moveUpButton).toBeDisabled();
    });

    it('最下位項目（canMoveDown=false）で「下へ移動」がdisabledであること', async () => {
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} canMoveDown={false} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));

      const moveDownButton = screen.getByText('下へ移動').closest('button');
      expect(moveDownButton).toBeDisabled();
    });
  });
});
