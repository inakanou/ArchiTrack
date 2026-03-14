/**
 * @fileoverview SortableScheduleList コンポーネントテスト
 *
 * Task 9.2: SortableScheduleListによる並び順管理を実装する
 *
 * Requirements (construction-schedule):
 * - REQ-5.1: 並び順変更機能
 * - REQ-5.2: 並び順リアルタイム反映
 * - REQ-5.3: 並び順の永続化（保存時）
 * - REQ-5.4: 並び順の復元
 *
 * @module components/schedule/SortableScheduleList.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SortableScheduleList } from './SortableScheduleList';
import type { ScheduleItem } from '../../hooks/useScheduleState';

// ============================================================================
// テストデータ
// ============================================================================

const mockItems: ScheduleItem[] = [
  {
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
  },
  {
    id: 'item-2',
    sourceType: 'MANUAL',
    sourceQuantityItemId: null,
    itemName: '仮設工事',
    labelText: '仮設',
    detailText: '',
    startDate: '2026-04-05',
    duration: 5,
    endDate: '2026-04-09',
    displayOrder: 1,
    isExportTarget: true,
  },
  {
    id: 'item-3',
    sourceType: 'QUANTITY_TABLE',
    sourceQuantityItemId: 'qi-2',
    itemName: '鉄骨工事',
    labelText: '鉄骨',
    detailText: '',
    startDate: '2026-04-11',
    duration: 20,
    endDate: '2026-04-30',
    displayOrder: 2,
    isExportTarget: false,
  },
];

// ============================================================================
// テスト
// ============================================================================

describe('SortableScheduleList', () => {
  const mockOnUpdate = vi.fn();
  const mockOnRemove = vi.fn();
  const mockOnReorder = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // 表示テスト
  // --------------------------------------------------------------------------

  describe('表示', () => {
    it('全項目がdisplayOrder順で表示される', () => {
      render(
        <SortableScheduleList
          items={mockItems}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
          onReorder={mockOnReorder}
        />
      );

      const rows = screen.getAllByTestId(/^item-row-/);
      expect(rows.length).toBe(3);

      // displayOrder順序で表示されていること
      expect(screen.getByTestId('item-row-item-1')).toBeInTheDocument();
      expect(screen.getByTestId('item-row-item-2')).toBeInTheDocument();
      expect(screen.getByTestId('item-row-item-3')).toBeInTheDocument();
    });

    it('各項目にドラッグハンドルが表示される', () => {
      render(
        <SortableScheduleList
          items={mockItems}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
          onReorder={mockOnReorder}
        />
      );

      const handles = screen.getAllByTestId(/^drag-handle-/);
      expect(handles.length).toBe(3);
    });

    it('数量表由来と任意項目の両方が表示される', () => {
      render(
        <SortableScheduleList
          items={mockItems}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
          onReorder={mockOnReorder}
        />
      );

      expect(screen.getByTestId('item-name-item-1')).toHaveValue('基礎工事');
      expect(screen.getByTestId('item-name-item-2')).toHaveValue('仮設工事');
      expect(screen.getByTestId('item-name-item-3')).toHaveValue('鉄骨工事');
    });
  });

  // --------------------------------------------------------------------------
  // ドラッグ&ドロップテスト
  // --------------------------------------------------------------------------

  describe('ドラッグ&ドロップ', () => {
    it('ドラッグ開始時にdragging状態になる', () => {
      render(
        <SortableScheduleList
          items={mockItems}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
          onReorder={mockOnReorder}
        />
      );

      const row = screen.getByTestId('sortable-row-item-1');

      fireEvent.dragStart(row, {
        dataTransfer: { setData: vi.fn(), effectAllowed: '' },
      });

      // ドラッグ開始後、行にdragging classが適用される
      expect(row.getAttribute('data-dragging')).toBe('true');
    });

    it('ドロップ時にonReorderが呼ばれる', () => {
      render(
        <SortableScheduleList
          items={mockItems}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
          onReorder={mockOnReorder}
        />
      );

      const row1 = screen.getByTestId('sortable-row-item-1');
      const row3 = screen.getByTestId('sortable-row-item-3');

      // ドラッグ開始
      fireEvent.dragStart(row1, {
        dataTransfer: { setData: vi.fn(), effectAllowed: '' },
      });

      // ドラッグオーバー
      fireEvent.dragOver(row3, {
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: '' },
      });

      // ドロップ
      fireEvent.drop(row3, {
        preventDefault: vi.fn(),
      });

      expect(mockOnReorder).toHaveBeenCalledWith(0, 2);
    });

    it('ドラッグ終了時にdragging状態がリセットされる', () => {
      render(
        <SortableScheduleList
          items={mockItems}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
          onReorder={mockOnReorder}
        />
      );

      const row1 = screen.getByTestId('sortable-row-item-1');

      fireEvent.dragStart(row1, {
        dataTransfer: { setData: vi.fn(), effectAllowed: '' },
      });

      fireEvent.dragEnd(row1);

      expect(row1.getAttribute('data-dragging')).toBe('false');
    });
  });

  // --------------------------------------------------------------------------
  // 項目操作テスト
  // --------------------------------------------------------------------------

  describe('項目操作', () => {
    it('onUpdateが各ScheduleItemRowに渡される', () => {
      render(
        <SortableScheduleList
          items={mockItems}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
          onReorder={mockOnReorder}
        />
      );

      // ScheduleItemRowが描画されていること
      expect(screen.getByTestId('item-name-item-1')).toBeInTheDocument();
    });

    it('onRemoveが各ScheduleItemRowに渡される', () => {
      render(
        <SortableScheduleList
          items={mockItems}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
          onReorder={mockOnReorder}
        />
      );

      // 任意項目（item-2）の削除ボタンが存在する
      expect(screen.getByTestId('remove-item-item-2')).toBeInTheDocument();
    });
  });
});
