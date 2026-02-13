/**
 * @fileoverview 数量グループカードのタイトル行統合テスト
 *
 * Task 23.3: 数量グループカードにタイトル行表示を統合する
 * Task 24.2: 数量グループカードのタイトル行統合テストを実装する
 *
 * Requirements:
 * - 18.1: メインのタイトル行を数量グループの一番上にのみ表示する
 * - 18.2: 数量グループ内の2行目以降の数量項目にはメインのタイトル行を繰り返し表示しない
 * - 18.3: 面積・体積計算用フィールドのタイトル行は該当する計算用フィールド群とセットで表示する
 * - 18.4: ピッチ計算用フィールドのタイトル行は該当する計算用フィールド群とセットで表示する
 * - 18.5: 折りたたみ/再展開後にタイトル行の表示ルールが維持される
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuantityGroupCard from '../../../components/quantity-table/QuantityGroupCard';
import type { QuantityGroupDetail } from '../../../types/quantity-table.types';

const mockGroupWithItems: QuantityGroupDetail = {
  id: 'group-1',
  quantityTableId: 'qt-123',
  name: 'テストグループ',
  surveyImageId: null,
  surveyImage: null,
  displayOrder: 0,
  itemCount: 2,
  items: [
    {
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
    },
    {
      id: 'item-2',
      quantityGroupId: 'group-1',
      majorCategory: '土工',
      middleCategory: null,
      minorCategory: null,
      customCategory: null,
      workType: '掘削工',
      name: '掘削',
      specification: null,
      unit: 'm3',
      calculationMethod: 'STANDARD',
      calculationParams: null,
      adjustmentFactor: 1.0,
      roundingUnit: 0.01,
      quantity: 50,
      remarks: null,
      displayOrder: 1,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
  ],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const mockGroupEmpty: QuantityGroupDetail = {
  ...mockGroupWithItems,
  id: 'group-empty',
  items: [],
  itemCount: 0,
};

/**
 * Task 24.2: 面積・体積計算モードの項目を含むグループ
 */
const mockGroupWithAreaVolumeItem: QuantityGroupDetail = {
  id: 'group-av',
  quantityTableId: 'qt-123',
  name: 'テストグループ（面積・体積）',
  surveyImageId: null,
  surveyImage: null,
  displayOrder: 0,
  itemCount: 1,
  items: [
    {
      id: 'item-av-1',
      quantityGroupId: 'group-av',
      majorCategory: '土工',
      middleCategory: null,
      minorCategory: null,
      customCategory: null,
      workType: '掘削工',
      name: '掘削',
      specification: null,
      unit: 'm3',
      calculationMethod: 'AREA_VOLUME',
      calculationParams: { width: 10, depth: 5 },
      adjustmentFactor: 1.0,
      roundingUnit: 0.01,
      quantity: 50,
      remarks: null,
      displayOrder: 0,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
  ],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

/**
 * Task 24.2: ピッチ計算モードの項目を含むグループ
 */
const mockGroupWithPitchItem: QuantityGroupDetail = {
  id: 'group-pitch',
  quantityTableId: 'qt-123',
  name: 'テストグループ（ピッチ）',
  surveyImageId: null,
  surveyImage: null,
  displayOrder: 0,
  itemCount: 1,
  items: [
    {
      id: 'item-pitch-1',
      quantityGroupId: 'group-pitch',
      majorCategory: '鉄筋工',
      middleCategory: null,
      minorCategory: null,
      customCategory: null,
      workType: '配筋工',
      name: '鉄筋',
      specification: null,
      unit: '本',
      calculationMethod: 'PITCH',
      calculationParams: { rangeLength: 100, endLength1: 5, endLength2: 5, pitchLength: 10 },
      adjustmentFactor: 1.0,
      roundingUnit: 0.01,
      quantity: 10,
      remarks: null,
      displayOrder: 0,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
  ],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

describe('QuantityGroupCard - タイトル行統合', () => {
  const defaultProps = {
    group: mockGroupWithItems,
    groupDisplayName: 'テストグループ',
    isEditable: true,
    onAddItem: vi.fn(),
    onDeleteGroup: vi.fn(),
    onSelectImage: vi.fn(),
    onOpenAnnotationViewer: vi.fn(),
    onUpdateItem: vi.fn(),
    onDeleteItem: vi.fn(),
    onCopyItem: vi.fn(),
    onMoveItem: vi.fn(),
    getSuggestions: vi.fn(() => []),
    onBlurAddCandidate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('REQ-18.1: メインタイトル行の表示', () => {
    it('項目が存在する場合にタイトル行が1つだけ表示される', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      const titleRows = screen.getAllByTestId('quantity-group-title-row');
      expect(titleRows).toHaveLength(1);
    });

    it('タイトル行に全列タイトルが表示される', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      const titleRow = screen.getByTestId('quantity-group-title-row');
      expect(within(titleRow).getByText('大項目')).toBeInTheDocument();
      expect(within(titleRow).getByText('工種')).toBeInTheDocument();
      expect(within(titleRow).getByText('名称')).toBeInTheDocument();
      expect(within(titleRow).getByText('数量')).toBeInTheDocument();
      expect(within(titleRow).getByText('単位')).toBeInTheDocument();
    });

    it('項目が存在しない場合にタイトル行が表示されない', () => {
      render(<QuantityGroupCard {...defaultProps} group={mockGroupEmpty} />);

      expect(screen.queryByTestId('quantity-group-title-row')).not.toBeInTheDocument();
    });
  });

  describe('REQ-18.2: 個別行のラベル非表示', () => {
    it('各数量項目行ではメインフィールドラベルが非表示になる', () => {
      render(<QuantityGroupCard {...defaultProps} />);

      // 数量項目行内のラベルが非表示であることを確認
      const itemRows = screen.getAllByTestId('quantity-item-row');
      expect(itemRows).toHaveLength(2);

      // 各項目行内にメインフィールドラベル（大項目、中項目等）がないことを確認
      // タイトル行にはあるが、項目行内には大項目ラベルが存在しない
      itemRows.forEach((row) => {
        const labels = row.querySelectorAll('label');
        const labelTexts = Array.from(labels).map((l) => l.textContent?.replace(/\s+/g, ''));
        // メインフィールドのラベルが表示されていない
        expect(labelTexts).not.toContain('大項目');
        expect(labelTexts).not.toContain('中項目');
        expect(labelTexts).not.toContain('小項目');
        expect(labelTexts).not.toContain('任意分類');
        expect(labelTexts).not.toContain('工種');
        expect(labelTexts).not.toContain('名称*');
        expect(labelTexts).not.toContain('規格');
        expect(labelTexts).not.toContain('数量*');
        expect(labelTexts).not.toContain('単位');
        expect(labelTexts).not.toContain('備考');
      });
    });
  });

  describe('REQ-18.5: 折りたたみ/再展開時のタイトル行維持', () => {
    it('折りたたみ後に再展開するとタイトル行が正しく表示される', async () => {
      const user = userEvent.setup();
      render(<QuantityGroupCard {...defaultProps} />);

      // 初期状態でタイトル行が1つ表示
      expect(screen.getAllByTestId('quantity-group-title-row')).toHaveLength(1);

      // 折りたたむ
      const toggleButton = screen.getByRole('button', { name: 'グループを折りたたむ' });
      await user.click(toggleButton);

      // 再展開
      const expandButton = screen.getByRole('button', { name: 'グループを展開' });
      await user.click(expandButton);

      // 再展開後もタイトル行が1つだけ表示される
      expect(screen.getAllByTestId('quantity-group-title-row')).toHaveLength(1);
    });

    it('折りたたみ後に再展開しても項目行のラベルは非表示のまま', async () => {
      const user = userEvent.setup();
      render(<QuantityGroupCard {...defaultProps} />);

      // 折りたたむ
      await user.click(screen.getByRole('button', { name: 'グループを折りたたむ' }));

      // 再展開
      await user.click(screen.getByRole('button', { name: 'グループを展開' }));

      // 項目行のラベルが非表示のまま
      const itemRows = screen.getAllByTestId('quantity-item-row');
      itemRows.forEach((row) => {
        const labels = row.querySelectorAll('label');
        const labelTexts = Array.from(labels).map((l) => l.textContent?.replace(/\s+/g, ''));
        expect(labelTexts).not.toContain('大項目');
        expect(labelTexts).not.toContain('工種');
      });
    });
  });

  describe('isEditable=false（閲覧モード）', () => {
    it('閲覧モードでもタイトル行が表示される', () => {
      render(<QuantityGroupCard {...defaultProps} isEditable={false} />);

      const titleRows = screen.getAllByTestId('quantity-group-title-row');
      expect(titleRows).toHaveLength(1);
    });
  });

  /**
   * Task 24.2: 数量グループカードのタイトル行統合テスト（追加分）
   */
  describe('Task 24.2: REQ-18.3: メインフィールドラベル非表示時でも面積・体積計算用フィールドのタイトルは表示される', () => {
    it('面積・体積モードの項目で計算用フィールドラベル（幅/奥行き/高さ/重量/調整係数/丸め設定）が表示される', () => {
      render(
        <QuantityGroupCard
          {...defaultProps}
          group={mockGroupWithAreaVolumeItem}
          isEditable={true}
        />
      );

      // メインタイトル行は1つだけ
      const titleRows = screen.getAllByTestId('quantity-group-title-row');
      expect(titleRows).toHaveLength(1);

      // 項目行のメインフィールドラベルは非表示
      const itemRows = screen.getAllByTestId('quantity-item-row');
      expect(itemRows).toHaveLength(1);
      const labels = itemRows[0]!.querySelectorAll('label');
      const labelTexts = Array.from(labels).map((l) => l.textContent?.replace(/\s+/g, ''));
      expect(labelTexts).not.toContain('大項目');
      expect(labelTexts).not.toContain('工種');

      // 計算用フィールドのラベルは表示される（REQ-18.3）
      expect(screen.getByText('幅（W）')).toBeInTheDocument();
      expect(screen.getByText('奥行き（D）')).toBeInTheDocument();
      expect(screen.getByText('高さ（H）')).toBeInTheDocument();
      expect(screen.getByText('重量')).toBeInTheDocument();
      expect(screen.getByText('調整係数')).toBeInTheDocument();
      expect(screen.getByText('丸め設定')).toBeInTheDocument();
    });
  });

  describe('Task 24.2: REQ-18.4: メインフィールドラベル非表示時でもピッチ計算用フィールドのタイトルは表示される', () => {
    it('ピッチモードの項目で計算用フィールドラベル（範囲長/端長1/端長2/ピッチ長等）が表示される', () => {
      render(
        <QuantityGroupCard {...defaultProps} group={mockGroupWithPitchItem} isEditable={true} />
      );

      // メインタイトル行は1つだけ
      const titleRows = screen.getAllByTestId('quantity-group-title-row');
      expect(titleRows).toHaveLength(1);

      // 項目行のメインフィールドラベルは非表示
      const itemRows = screen.getAllByTestId('quantity-item-row');
      expect(itemRows).toHaveLength(1);
      const labels = itemRows[0]!.querySelectorAll('label');
      const labelTexts = Array.from(labels).map((l) => l.textContent?.replace(/\s+/g, ''));
      expect(labelTexts).not.toContain('大項目');
      expect(labelTexts).not.toContain('工種');

      // ピッチ計算用フィールドのラベルは表示される（REQ-18.4）
      expect(screen.getByText('範囲長')).toBeInTheDocument();
      expect(screen.getByText('端長1')).toBeInTheDocument();
      expect(screen.getByText('端長2')).toBeInTheDocument();
      expect(screen.getByText('ピッチ長')).toBeInTheDocument();
    });
  });

  describe('Task 24.2: 複数項目でのタイトル行表示ルール', () => {
    it('3つ以上の項目がある場合でもメインタイトル行は1つだけ表示される', () => {
      const mockGroupWith3Items: QuantityGroupDetail = {
        ...mockGroupWithItems,
        id: 'group-3items',
        itemCount: 3,
        items: [
          ...mockGroupWithItems.items,
          {
            id: 'item-3',
            quantityGroupId: 'group-3items',
            majorCategory: '基礎工',
            middleCategory: null,
            minorCategory: null,
            customCategory: null,
            workType: 'コンクリート工',
            name: 'コンクリート',
            specification: null,
            unit: 'm3',
            calculationMethod: 'STANDARD',
            calculationParams: null,
            adjustmentFactor: 1.0,
            roundingUnit: 0.01,
            quantity: 30,
            remarks: null,
            displayOrder: 2,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ],
      };

      render(<QuantityGroupCard {...defaultProps} group={mockGroupWith3Items} />);

      // タイトル行は1つだけ
      const titleRows = screen.getAllByTestId('quantity-group-title-row');
      expect(titleRows).toHaveLength(1);

      // 項目行は3つ
      const itemRows = screen.getAllByTestId('quantity-item-row');
      expect(itemRows).toHaveLength(3);

      // 全項目行でメインフィールドラベルが非表示
      itemRows.forEach((row) => {
        const rowLabels = row.querySelectorAll('label');
        const rowLabelTexts = Array.from(rowLabels).map((l) => l.textContent?.replace(/\s+/g, ''));
        expect(rowLabelTexts).not.toContain('大項目');
        expect(rowLabelTexts).not.toContain('工種');
      });
    });

    it('折りたたみ後の再展開でタイトル行の列テキストが全て保持されている', async () => {
      const user = userEvent.setup();
      render(<QuantityGroupCard {...defaultProps} />);

      // 折りたたむ
      await user.click(screen.getByRole('button', { name: 'グループを折りたたむ' }));

      // 再展開
      await user.click(screen.getByRole('button', { name: 'グループを展開' }));

      // タイトル行の全列テキストが保持されている
      const titleRow = screen.getByTestId('quantity-group-title-row');
      expect(within(titleRow).getByText('大項目')).toBeInTheDocument();
      expect(within(titleRow).getByText('中項目')).toBeInTheDocument();
      expect(within(titleRow).getByText('小項目')).toBeInTheDocument();
      expect(within(titleRow).getByText('任意分類')).toBeInTheDocument();
      expect(within(titleRow).getByText('工種')).toBeInTheDocument();
      expect(within(titleRow).getByText('名称')).toBeInTheDocument();
      expect(within(titleRow).getByText('規格')).toBeInTheDocument();
      expect(within(titleRow).getByText('計算方法')).toBeInTheDocument();
      expect(within(titleRow).getByText('数量')).toBeInTheDocument();
      expect(within(titleRow).getByText('単位')).toBeInTheDocument();
      expect(within(titleRow).getByText('備考')).toBeInTheDocument();
    });
  });
});
