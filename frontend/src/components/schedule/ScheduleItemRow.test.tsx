/**
 * @fileoverview ScheduleItemRow コンポーネントテスト
 *
 * Task 9.1: ScheduleDetailPageと項目入力行を実装する
 *
 * Requirements (construction-schedule):
 * - REQ-3.1: 着工日入力欄
 * - REQ-3.2: 日数入力欄
 * - REQ-3.4: 着工日未入力バリデーション
 * - REQ-3.5: 日数0以下バリデーション
 * - REQ-4.1: 任意項目追加
 * - REQ-4.2: 任意項目の入力欄
 * - REQ-9.1: 出力対象チェックボックス表示
 * - REQ-10.1: ラベル文字入力欄
 * - REQ-11.1: 詳細文字入力欄
 *
 * @module components/schedule/ScheduleItemRow.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduleItemRow } from './ScheduleItemRow';
import type { ScheduleItem } from '../../hooks/useScheduleState';

// ============================================================================
// テストデータ
// ============================================================================

/** 数量表由来の項目 */
const mockQuantityItem: ScheduleItem = {
  id: 'item-1',
  sourceType: 'QUANTITY_TABLE',
  sourceQuantityItemId: 'qi-1',
  itemName: '基礎工事',
  labelText: '基礎',
  detailText: 'コンクリート打設',
  startDate: '2026-04-01',
  duration: 10,
  endDate: '2026-04-10',
  displayOrder: 0,
  isExportTarget: true,
};

/** 任意項目 */
const mockManualItem: ScheduleItem = {
  id: 'item-2',
  sourceType: 'MANUAL',
  sourceQuantityItemId: null,
  itemName: '仮設工事',
  labelText: '',
  detailText: '',
  startDate: null,
  duration: null,
  endDate: null,
  displayOrder: 1,
  isExportTarget: true,
};

/** 着工日なし・日数ありの項目（バリデーションエラー） */
const mockItemWithoutStartDate: ScheduleItem = {
  id: 'item-3',
  sourceType: 'MANUAL',
  sourceQuantityItemId: null,
  itemName: '塗装工事',
  labelText: '',
  detailText: '',
  startDate: null,
  duration: 5,
  endDate: null,
  displayOrder: 2,
  isExportTarget: true,
};

/** 日数0の項目（バリデーションエラー） */
const mockItemWithZeroDuration: ScheduleItem = {
  id: 'item-4',
  sourceType: 'MANUAL',
  sourceQuantityItemId: null,
  itemName: '仕上工事',
  labelText: '',
  detailText: '',
  startDate: '2026-05-01',
  duration: 0,
  endDate: null,
  displayOrder: 3,
  isExportTarget: true,
};

// ============================================================================
// テスト
// ============================================================================

describe('ScheduleItemRow', () => {
  const mockOnUpdate = vi.fn();
  const mockOnRemove = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // 表示テスト
  // --------------------------------------------------------------------------

  describe('表示', () => {
    it('項目名の入力欄が表示される', () => {
      render(
        <ScheduleItemRow item={mockQuantityItem} onUpdate={mockOnUpdate} onRemove={mockOnRemove} />
      );
      const input = screen.getByTestId('item-name-item-1');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('基礎工事');
    });

    it('ラベル文字の入力欄が表示される', () => {
      render(
        <ScheduleItemRow item={mockQuantityItem} onUpdate={mockOnUpdate} onRemove={mockOnRemove} />
      );
      const input = screen.getByTestId('label-text-item-1');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('基礎');
    });

    it('詳細文字の入力欄が表示される', () => {
      render(
        <ScheduleItemRow item={mockQuantityItem} onUpdate={mockOnUpdate} onRemove={mockOnRemove} />
      );
      const input = screen.getByTestId('detail-text-item-1');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('コンクリート打設');
    });

    it('着工日の入力欄が表示される', () => {
      render(
        <ScheduleItemRow item={mockQuantityItem} onUpdate={mockOnUpdate} onRemove={mockOnRemove} />
      );
      const input = screen.getByTestId('start-date-item-1');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('2026-04-01');
    });

    it('日数の入力欄が表示される', () => {
      render(
        <ScheduleItemRow item={mockQuantityItem} onUpdate={mockOnUpdate} onRemove={mockOnRemove} />
      );
      const input = screen.getByTestId('duration-item-1');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue(10);
    });

    it('出力対象チェックボックスが表示される', () => {
      render(
        <ScheduleItemRow item={mockQuantityItem} onUpdate={mockOnUpdate} onRemove={mockOnRemove} />
      );
      const checkbox = screen.getByTestId('export-target-item-1');
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).toBeChecked();
    });

    it('数量表由来項目にはソースタイプバッジが表示される', () => {
      render(
        <ScheduleItemRow item={mockQuantityItem} onUpdate={mockOnUpdate} onRemove={mockOnRemove} />
      );
      expect(screen.getByText('数量表')).toBeInTheDocument();
    });

    it('任意項目には削除ボタンが表示される', () => {
      render(
        <ScheduleItemRow item={mockManualItem} onUpdate={mockOnUpdate} onRemove={mockOnRemove} />
      );
      expect(screen.getByTestId('remove-item-item-2')).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // バリデーションテスト
  // --------------------------------------------------------------------------

  describe('バリデーション', () => {
    it('着工日未入力で日数のみ入力時にバリデーションメッセージが表示される', () => {
      render(
        <ScheduleItemRow
          item={mockItemWithoutStartDate}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );
      expect(screen.getByText('着工日を入力してください')).toBeInTheDocument();
    });

    it('日数が0の場合にバリデーションエラーが表示される', () => {
      render(
        <ScheduleItemRow
          item={mockItemWithZeroDuration}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );
      expect(screen.getByText('日数は1以上を入力してください')).toBeInTheDocument();
    });

    it('正常な入力ではバリデーションメッセージが表示されない', () => {
      render(
        <ScheduleItemRow item={mockQuantityItem} onUpdate={mockOnUpdate} onRemove={mockOnRemove} />
      );
      expect(screen.queryByText('着工日を入力してください')).not.toBeInTheDocument();
      expect(screen.queryByText('日数は1以上を入力してください')).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // 操作テスト
  // --------------------------------------------------------------------------

  describe('操作', () => {
    it('項目名を変更するとonUpdateが呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <ScheduleItemRow item={mockManualItem} onUpdate={mockOnUpdate} onRemove={mockOnRemove} />
      );
      const input = screen.getByTestId('item-name-item-2');
      await user.clear(input);
      await user.type(input, '新規工事');
      expect(mockOnUpdate).toHaveBeenCalled();
    });

    it('着工日を変更するとonUpdateが呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <ScheduleItemRow item={mockManualItem} onUpdate={mockOnUpdate} onRemove={mockOnRemove} />
      );
      const input = screen.getByTestId('start-date-item-2');
      await user.type(input, '2026-05-01');
      expect(mockOnUpdate).toHaveBeenCalledWith(
        'item-2',
        expect.objectContaining({
          startDate: '2026-05-01',
        })
      );
    });

    it('日数を変更するとonUpdateが呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <ScheduleItemRow item={mockManualItem} onUpdate={mockOnUpdate} onRemove={mockOnRemove} />
      );
      const input = screen.getByTestId('duration-item-2');
      await user.type(input, '5');
      expect(mockOnUpdate).toHaveBeenCalledWith(
        'item-2',
        expect.objectContaining({
          duration: 5,
        })
      );
    });

    it('出力対象チェックボックスを変更するとonUpdateが呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <ScheduleItemRow item={mockQuantityItem} onUpdate={mockOnUpdate} onRemove={mockOnRemove} />
      );
      const checkbox = screen.getByTestId('export-target-item-1');
      await user.click(checkbox);
      expect(mockOnUpdate).toHaveBeenCalledWith('item-1', { isExportTarget: false });
    });

    it('削除ボタンをクリックするとonRemoveが呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <ScheduleItemRow item={mockManualItem} onUpdate={mockOnUpdate} onRemove={mockOnRemove} />
      );
      const button = screen.getByTestId('remove-item-item-2');
      await user.click(button);
      expect(mockOnRemove).toHaveBeenCalledWith('item-2');
    });

    it('ラベル文字を変更するとonUpdateが呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <ScheduleItemRow item={mockManualItem} onUpdate={mockOnUpdate} onRemove={mockOnRemove} />
      );
      const input = screen.getByTestId('label-text-item-2');
      await user.type(input, 'テスト');
      expect(mockOnUpdate).toHaveBeenCalled();
    });
  });
});
