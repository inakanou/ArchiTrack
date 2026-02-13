/**
 * @fileoverview EditableQuantityItemRow showFieldLabelsプロパティのテスト
 *
 * Task 23.2: 数量項目行コンポーネントのメインフィールドラベル表示を制御可能にする
 *
 * Requirements:
 * - 18.2: 数量グループ内の2行目以降の数量項目にはメインのタイトル行を繰り返し表示しない
 * - 18.3: 面積・体積計算用フィールドのタイトル行は該当する計算用フィールド群とセットで表示する
 * - 18.4: ピッチ計算用フィールドのタイトル行は該当する計算用フィールド群とセットで表示する
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import EditableQuantityItemRow from '../../../components/quantity-table/EditableQuantityItemRow';
import type { QuantityItemDetail } from '../../../types/quantity-table.types';

// モックアイテムデータ（標準モード）
const mockStandardItem: QuantityItemDetail = {
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

// モックアイテムデータ（面積・体積モード）
const mockAreaVolumeItem: QuantityItemDetail = {
  ...mockStandardItem,
  id: 'item-2',
  calculationMethod: 'AREA_VOLUME',
  calculationParams: { width: 10, depth: 5 },
};

// モックアイテムデータ（ピッチモード）
const mockPitchItem: QuantityItemDetail = {
  ...mockStandardItem,
  id: 'item-3',
  calculationMethod: 'PITCH',
  calculationParams: { rangeLength: 100, endLength1: 5, endLength2: 5, pitchLength: 10 },
};

const defaultProps = {
  getSuggestions: vi.fn(() => []),
  onBlurAddCandidate: vi.fn(),
};

describe('EditableQuantityItemRow - showFieldLabels', () => {
  describe('デフォルト（showFieldLabels未指定）', () => {
    it('デフォルトではメインフィールドのラベルが表示される（後方互換性維持）', () => {
      render(<EditableQuantityItemRow item={mockStandardItem} {...defaultProps} />);

      // メインフィールドのラベルが表示されている
      // AutocompleteInput経由のラベル
      expect(screen.getByText('大項目')).toBeInTheDocument();
      expect(screen.getByText('中項目')).toBeInTheDocument();
      expect(screen.getByText('小項目')).toBeInTheDocument();
      expect(screen.getByText('任意分類')).toBeInTheDocument();
      expect(screen.getByText('工種')).toBeInTheDocument();
      expect(screen.getByText('規格')).toBeInTheDocument();
      expect(screen.getByText('単位')).toBeInTheDocument();

      // 直接入力フィールドのラベルテキストが存在する
      const row = screen.getByTestId('quantity-item-row');
      const labels = row.querySelectorAll('label');
      const labelTexts = Array.from(labels).map((l) => l.textContent?.replace(/\s+/g, ''));
      // 名称*、数量*、備考のラベルが含まれている
      expect(labelTexts.some((t) => t?.includes('名称'))).toBe(true);
      expect(labelTexts.some((t) => t?.includes('数量'))).toBe(true);
      expect(labelTexts.some((t) => t?.includes('備考'))).toBe(true);
    });
  });

  describe('showFieldLabels=true', () => {
    it('メインフィールドのラベルが表示される', () => {
      render(
        <EditableQuantityItemRow item={mockStandardItem} showFieldLabels={true} {...defaultProps} />
      );

      expect(screen.getByText('大項目')).toBeInTheDocument();
      expect(screen.getByText('中項目')).toBeInTheDocument();
      expect(screen.getByText('工種')).toBeInTheDocument();
    });
  });

  describe('showFieldLabels=false', () => {
    it('メインフィールドのラベルが非表示になる', () => {
      render(
        <EditableQuantityItemRow
          item={mockStandardItem}
          showFieldLabels={false}
          {...defaultProps}
        />
      );

      // メインフィールドのラベルが表示されていない
      expect(screen.queryByText('大項目')).not.toBeInTheDocument();
      expect(screen.queryByText('中項目')).not.toBeInTheDocument();
      expect(screen.queryByText('小項目')).not.toBeInTheDocument();
      expect(screen.queryByText('任意分類')).not.toBeInTheDocument();
      expect(screen.queryByText('工種')).not.toBeInTheDocument();
      expect(screen.queryByText('規格')).not.toBeInTheDocument();
      expect(screen.queryByText('単位')).not.toBeInTheDocument();
    });

    it('showFieldLabels=falseでも入力フィールド自体は表示される', () => {
      render(
        <EditableQuantityItemRow
          item={mockStandardItem}
          showFieldLabels={false}
          {...defaultProps}
        />
      );

      // 入力フィールドは存在する（プレースホルダーで確認）
      const row = screen.getByTestId('quantity-item-row');
      expect(within(row).getByPlaceholderText('大項目を入力')).toBeInTheDocument();
      expect(within(row).getByPlaceholderText('工種を入力')).toBeInTheDocument();
      expect(within(row).getByPlaceholderText('名称を入力')).toBeInTheDocument();
    });

    it('showFieldLabels=falseでも名称・数量・備考のラベルが非表示になる', () => {
      render(
        <EditableQuantityItemRow
          item={mockStandardItem}
          showFieldLabels={false}
          {...defaultProps}
        />
      );

      // 直接入力フィールドのラベルテキストも非表示
      // "名称"、"数量"、"備考" のラベル要素が存在しない
      // ラベルの「名称」テキスト（label要素内）が表示されないことを確認
      const labels = screen.getByTestId('quantity-item-row').querySelectorAll('label');
      const labelTexts = Array.from(labels).map((l) => l.textContent?.trim());
      expect(labelTexts).not.toContain('名称*');
      expect(labelTexts).not.toContain('数量*');
      expect(labelTexts).not.toContain('備考');
    });
  });

  describe('計算用フィールドのタイトル行は影響を受けない', () => {
    it('showFieldLabels=falseでも面積・体積計算用フィールドのラベルは表示される（REQ-18.3）', () => {
      render(
        <EditableQuantityItemRow
          item={mockAreaVolumeItem}
          showFieldLabels={false}
          {...defaultProps}
        />
      );

      // 計算用フィールドのラベルは表示されること
      expect(screen.getByText('幅（W）')).toBeInTheDocument();
      expect(screen.getByText('奥行き（D）')).toBeInTheDocument();
      expect(screen.getByText('高さ（H）')).toBeInTheDocument();
      expect(screen.getByText('重量')).toBeInTheDocument();
      expect(screen.getByText('調整係数')).toBeInTheDocument();
      expect(screen.getByText('丸め設定')).toBeInTheDocument();
    });

    it('showFieldLabels=falseでもピッチ計算用フィールドのラベルは表示される（REQ-18.4）', () => {
      render(
        <EditableQuantityItemRow item={mockPitchItem} showFieldLabels={false} {...defaultProps} />
      );

      // ピッチ計算用フィールドのラベルは表示されること
      expect(screen.getByText('範囲長')).toBeInTheDocument();
      expect(screen.getByText('端長1')).toBeInTheDocument();
      expect(screen.getByText('端長2')).toBeInTheDocument();
      expect(screen.getByText('ピッチ長')).toBeInTheDocument();
    });
  });
});
