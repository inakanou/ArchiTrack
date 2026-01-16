/**
 * @fileoverview 数量項目行コンポーネントのテスト
 *
 * Task 5.3: 数量項目行コンポーネントを実装する（TDDテストファースト）
 *
 * Requirements:
 * - 5.2: 数量項目の各フィールドに値を入力する
 * - 5.3: 必須フィールド（大項目・工種・名称・単位・数量）が未入力で保存を試行する
 * - 5.4: 数量項目を選択して削除操作を行う
 * - 6.1: 選択した数量項目をコピーする
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuantityItemRow from './QuantityItemRow';
import type { QuantityItemDetail } from '../../types/quantity-table.types';

// テストデータ
const mockItem: QuantityItemDetail = {
  id: 'item-1',
  quantityGroupId: 'group-1',
  majorCategory: '共通仮設',
  middleCategory: '直接仮設',
  minorCategory: null,
  customCategory: null,
  workType: '仮設工',
  name: '足場',
  specification: 'ビケ足場',
  unit: 'm2',
  calculationMethod: 'STANDARD',
  calculationParams: null,
  adjustmentFactor: 1.0,
  roundingUnit: 0.01,
  quantity: 100.5,
  remarks: '備考テスト',
  displayOrder: 0,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

describe('QuantityItemRow', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ====================================================================
  // Task 5.3: 数量項目行コンポーネントを実装する
  // ====================================================================

  describe('Task 5.3: 数量項目行コンポーネント', () => {
    describe('基本表示', () => {
      it('項目名が表示される', () => {
        render(<QuantityItemRow item={mockItem} />);

        expect(screen.getByText('足場')).toBeInTheDocument();
      });

      it('工種が表示される', () => {
        render(<QuantityItemRow item={mockItem} />);

        expect(screen.getByText('仮設工')).toBeInTheDocument();
      });

      it('大項目が表示される', () => {
        render(<QuantityItemRow item={mockItem} />);

        expect(screen.getByText('共通仮設')).toBeInTheDocument();
      });

      it('数量が表示される', () => {
        render(<QuantityItemRow item={mockItem} />);

        expect(screen.getByText('100.5')).toBeInTheDocument();
      });

      it('単位が表示される', () => {
        render(<QuantityItemRow item={mockItem} />);

        expect(screen.getByText('m2')).toBeInTheDocument();
      });

      it('規格が表示される', () => {
        render(<QuantityItemRow item={mockItem} />);

        expect(screen.getByText('ビケ足場')).toBeInTheDocument();
      });
    });

    describe('オプションフィールド表示', () => {
      it('中項目がある場合は表示される', () => {
        render(<QuantityItemRow item={mockItem} />);

        // 中項目は大項目と一緒に表示される（テキストが分割されている）
        expect(screen.getByText(/直接仮設/)).toBeInTheDocument();
      });

      it('中項目がない場合は非表示', () => {
        const itemWithoutMiddle: QuantityItemDetail = {
          ...mockItem,
          middleCategory: null,
        };

        render(<QuantityItemRow item={itemWithoutMiddle} />);

        // 中項目セルはあるが、表示なし
        const cells = screen.getAllByRole('cell');
        expect(cells.some((cell) => cell.textContent === '直接仮設')).toBe(false);
      });

      it('備考がある場合は表示される', () => {
        render(<QuantityItemRow item={mockItem} />);

        expect(screen.getByText('備考テスト')).toBeInTheDocument();
      });
    });

    describe('REQ 5.4: 数量項目を選択して削除操作を行う', () => {
      it('削除ボタンが表示される', () => {
        render(<QuantityItemRow item={mockItem} />);

        expect(screen.getByRole('button', { name: /削除/ })).toBeInTheDocument();
      });

      it('削除ボタンクリックでコールバックが呼ばれる', async () => {
        const onDelete = vi.fn();
        render(<QuantityItemRow item={mockItem} onDelete={onDelete} />);

        await userEvent.click(screen.getByRole('button', { name: /削除/ }));

        expect(onDelete).toHaveBeenCalledWith('item-1');
      });
    });

    describe('選択機能', () => {
      it('選択チェックボックスが表示される', () => {
        render(<QuantityItemRow item={mockItem} />);

        expect(screen.getByRole('checkbox', { name: /選択/ })).toBeInTheDocument();
      });

      it('チェックボックスクリックで選択状態が切り替わる', async () => {
        const onSelectionChange = vi.fn();
        render(<QuantityItemRow item={mockItem} onSelectionChange={onSelectionChange} />);

        await userEvent.click(screen.getByRole('checkbox', { name: /選択/ }));

        expect(onSelectionChange).toHaveBeenCalledWith('item-1', true);
      });

      it('isSelected=trueの場合、チェック状態で表示される', () => {
        render(<QuantityItemRow item={mockItem} isSelected={true} />);

        expect(screen.getByRole('checkbox', { name: /選択/ })).toBeChecked();
      });
    });

    describe('アクションメニュー', () => {
      it('アクションメニューボタンが表示される', () => {
        render(<QuantityItemRow item={mockItem} />);

        expect(screen.getByRole('button', { name: /アクション/ })).toBeInTheDocument();
      });

      it('アクションメニューにコピーオプションがある', async () => {
        render(<QuantityItemRow item={mockItem} />);

        await userEvent.click(screen.getByRole('button', { name: /アクション/ }));

        expect(screen.getByRole('menuitem', { name: /コピー/ })).toBeInTheDocument();
      });

      it('コピーボタンクリックでonCopyコールバックが呼ばれる', async () => {
        const onCopy = vi.fn();
        render(<QuantityItemRow item={mockItem} onCopy={onCopy} />);

        // メニューを開く
        await userEvent.click(screen.getByRole('button', { name: /アクション/ }));
        // コピーをクリック
        await userEvent.click(screen.getByRole('menuitem', { name: /コピー/ }));

        expect(onCopy).toHaveBeenCalledWith('item-1');
      });

      it('コピーボタンクリック後にメニューが閉じる', async () => {
        const onCopy = vi.fn();
        render(<QuantityItemRow item={mockItem} onCopy={onCopy} />);

        // メニューを開く
        await userEvent.click(screen.getByRole('button', { name: /アクション/ }));
        expect(screen.getByRole('menu')).toBeInTheDocument();

        // コピーをクリック
        await userEvent.click(screen.getByRole('menuitem', { name: /コピー/ }));

        // メニューが閉じていることを確認
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });

      it('メニューボタンを2回クリックするとメニューが閉じる', async () => {
        render(<QuantityItemRow item={mockItem} />);

        // メニューを開く
        await userEvent.click(screen.getByRole('button', { name: /アクション/ }));
        expect(screen.getByRole('menu')).toBeInTheDocument();

        // もう一度クリックして閉じる
        await userEvent.click(screen.getByRole('button', { name: /アクション/ }));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });

    describe('規格フィールド', () => {
      it('規格がnullの場合はハイフンが表示される', () => {
        const itemWithoutSpec: QuantityItemDetail = {
          ...mockItem,
          specification: null,
        };

        render(<QuantityItemRow item={itemWithoutSpec} />);

        const cells = screen.getAllByRole('cell');
        expect(cells.some((cell) => cell.textContent === '-')).toBe(true);
      });
    });

    describe('備考フィールド', () => {
      it('備考がnullの場合は空文字が表示される', () => {
        const itemWithoutRemarks: QuantityItemDetail = {
          ...mockItem,
          remarks: null,
        };

        render(<QuantityItemRow item={itemWithoutRemarks} />);

        // 備考セルが空であることを確認（備考テストが表示されていない）
        expect(screen.queryByText('備考テスト')).not.toBeInTheDocument();
      });
    });

    describe('選択状態スタイリング', () => {
      it('isSelected=falseの場合、チェックなしで表示される', () => {
        render(<QuantityItemRow item={mockItem} isSelected={false} />);

        expect(screen.getByRole('checkbox', { name: /選択/ })).not.toBeChecked();
      });

      it('選択済みのチェックボックスをクリックすると選択解除される', async () => {
        const onSelectionChange = vi.fn();
        render(
          <QuantityItemRow
            item={mockItem}
            isSelected={true}
            onSelectionChange={onSelectionChange}
          />
        );

        await userEvent.click(screen.getByRole('checkbox', { name: /選択/ }));

        expect(onSelectionChange).toHaveBeenCalledWith('item-1', false);
      });
    });

    describe('onBlurイベント', () => {
      it('行外にフォーカスが移動するとメニューが閉じる', async () => {
        render(
          <div>
            <QuantityItemRow item={mockItem} />
            <button data-testid="outside-button">外部ボタン</button>
          </div>
        );

        // メニューを開く
        await userEvent.click(screen.getByRole('button', { name: /アクション/ }));
        expect(screen.getByRole('menu')).toBeInTheDocument();

        // 外部ボタンをクリック（フォーカス移動）
        await userEvent.click(screen.getByTestId('outside-button'));

        // メニューが閉じていることを確認
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });

    describe('削除コールバック', () => {
      it('onDeleteが未指定の場合でも削除ボタンクリックでエラーが発生しない', async () => {
        render(<QuantityItemRow item={mockItem} />);

        // エラーなしでクリックできることを確認
        await userEvent.click(screen.getByRole('button', { name: /削除/ }));
      });
    });

    describe('コピーコールバック', () => {
      it('onCopyが未指定の場合でもコピーボタンクリックでエラーが発生しない', async () => {
        render(<QuantityItemRow item={mockItem} />);

        // メニューを開く
        await userEvent.click(screen.getByRole('button', { name: /アクション/ }));
        // コピーをクリック（エラーなし）
        await userEvent.click(screen.getByRole('menuitem', { name: /コピー/ }));
      });
    });

    describe('選択変更コールバック', () => {
      it('onSelectionChangeが未指定の場合でもチェックボックスクリックでエラーが発生しない', async () => {
        render(<QuantityItemRow item={mockItem} />);

        // エラーなしでクリックできることを確認
        await userEvent.click(screen.getByRole('checkbox', { name: /選択/ }));
      });
    });
  });
});
