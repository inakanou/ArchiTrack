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
    });
  });
});
