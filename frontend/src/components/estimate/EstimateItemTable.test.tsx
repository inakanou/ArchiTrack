/**
 * @fileoverview EstimateItemTableコンポーネントのテスト（TDDテストファースト）
 *
 * Task 9.1: EstimateItemTableコンポーネントの実装
 *
 * 見積項目の階層ツリー表示と操作コンポーネントをテストします。
 *
 * Requirements (estimate-creation):
 * - REQ-1.1: タイトル行に名称・規格・単位・数量・単価・金額・備考のラベルを表示する
 * - REQ-1.3: 金額フィールドを単価と数量の積として自動計算する
 * - REQ-1.4: 金額フィールドを入力不可として表示する
 * - REQ-1.5: 合計行に全見積項目の金額合計を自動計算して表示する
 * - REQ-2.1: 見積項目に親子関係を設定可能とする
 * - REQ-2.2: 親項目を持つ見積項目を作成した場合、その項目を親項目の子として階層表示する
 * - REQ-2.3: 子項目を持つ場合、親項目の金額として子項目の金額合計を自動計算して表示する
 * - REQ-2.4: 複数階層のネストをサポートする
 * - REQ-2.5: 親項目を展開または折りたたむ場合、子項目の表示/非表示を切り替える
 * - REQ-2.6: 項目の階層レベルをインデント表示で視覚的に区別する
 * - REQ-12.2: 見積項目の表示順序を変更した場合、ドラッグ&ドロップで順序を変更可能とする
 *
 * @module components/estimate/EstimateItemTable.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EstimateItemTable } from './EstimateItemTable';
import type { EstimateItemHierarchyEdit } from '../../hooks/useEstimateEditor';

// ============================================================================
// テストデータ
// ============================================================================

/**
 * テスト用の階層構造データを生成
 */
const createMockHierarchy = (): EstimateItemHierarchyEdit[] => [
  {
    id: 'item-1',
    estimateId: 'estimate-1',
    parentId: null,
    displayOrder: 0,
    lines: [
      {
        id: 'line-1-est',
        estimateItemId: 'item-1',
        lineType: 'ESTIMATE',
        name: '建築工事',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '1000000',
        amount: '1000000',
        remarks: null,
      },
      {
        id: 'line-1-exec',
        estimateItemId: 'item-1',
        lineType: 'EXECUTION',
        name: '建築工事',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '900000',
        amount: '900000',
        remarks: null,
      },
      {
        id: 'line-1-vendor',
        estimateItemId: 'item-1',
        lineType: 'VENDOR',
        name: '建築工事',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '800000',
        amount: '800000',
        remarks: null,
      },
    ],
    children: [
      {
        id: 'item-1-1',
        estimateId: 'estimate-1',
        parentId: 'item-1',
        displayOrder: 0,
        lines: [
          {
            id: 'line-1-1-est',
            estimateItemId: 'item-1-1',
            lineType: 'ESTIMATE',
            name: '直接仮設工事',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '500000',
            amount: '500000',
            remarks: null,
          },
          {
            id: 'line-1-1-exec',
            estimateItemId: 'item-1-1',
            lineType: 'EXECUTION',
            name: '直接仮設工事',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '450000',
            amount: '450000',
            remarks: null,
          },
          {
            id: 'line-1-1-vendor',
            estimateItemId: 'item-1-1',
            lineType: 'VENDOR',
            name: '直接仮設工事',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '400000',
            amount: '400000',
            remarks: null,
          },
        ],
        children: [],
        isExpanded: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'item-1-2',
        estimateId: 'estimate-1',
        parentId: 'item-1',
        displayOrder: 1,
        lines: [
          {
            id: 'line-1-2-est',
            estimateItemId: 'item-1-2',
            lineType: 'ESTIMATE',
            name: '土工事',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '500000',
            amount: '500000',
            remarks: null,
          },
          {
            id: 'line-1-2-exec',
            estimateItemId: 'item-1-2',
            lineType: 'EXECUTION',
            name: '土工事',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '450000',
            amount: '450000',
            remarks: null,
          },
          {
            id: 'line-1-2-vendor',
            estimateItemId: 'item-1-2',
            lineType: 'VENDOR',
            name: '土工事',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '400000',
            amount: '400000',
            remarks: null,
          },
        ],
        children: [],
        isExpanded: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ],
    isExpanded: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'item-2',
    estimateId: 'estimate-1',
    parentId: null,
    displayOrder: 1,
    lines: [
      {
        id: 'line-2-est',
        estimateItemId: 'item-2',
        lineType: 'ESTIMATE',
        name: '電気設備工事',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '500000',
        amount: '500000',
        remarks: null,
      },
      {
        id: 'line-2-exec',
        estimateItemId: 'item-2',
        lineType: 'EXECUTION',
        name: '電気設備工事',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '450000',
        amount: '450000',
        remarks: null,
      },
      {
        id: 'line-2-vendor',
        estimateItemId: 'item-2',
        lineType: 'VENDOR',
        name: '電気設備工事',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '400000',
        amount: '400000',
        remarks: null,
      },
    ],
    children: [],
    isExpanded: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

// ============================================================================
// テスト
// ============================================================================

describe('EstimateItemTable', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ====================================================================
  // Task 9.1: EstimateItemTableコンポーネントの実装
  // ====================================================================

  describe('Task 9.1: EstimateItemTableコンポーネント', () => {
    describe('REQ-1.1: タイトル行の表示', () => {
      it('名称ラベルが表示される', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        expect(screen.getByText('名称')).toBeInTheDocument();
      });

      it('規格ラベルが表示される', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        expect(screen.getByText('規格')).toBeInTheDocument();
      });

      it('単位ラベルが表示される', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        expect(screen.getByText('単位')).toBeInTheDocument();
      });

      it('数量ラベルが表示される', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        expect(screen.getByText('数量')).toBeInTheDocument();
      });

      it('単価ラベルが表示される', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        expect(screen.getByText('単価')).toBeInTheDocument();
      });

      it('金額ラベルが表示される', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        expect(screen.getByText('金額')).toBeInTheDocument();
      });

      it('備考ラベルが表示される', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        expect(screen.getByText('備考')).toBeInTheDocument();
      });
    });

    describe('REQ-2.1, REQ-2.2: 階層構造の表示', () => {
      it('ルートレベルの項目が表示される', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        // 入力フィールドの値として確認
        const allNames = screen.getAllByLabelText('名称') as HTMLInputElement[];
        const nameValues = allNames.map((input) => input.value);
        expect(nameValues).toContain('建築工事');
        expect(nameValues).toContain('電気設備工事');
      });

      it('子項目が表示される', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        // 入力フィールドの値として確認
        const allNames = screen.getAllByLabelText('名称') as HTMLInputElement[];
        const nameValues = allNames.map((input) => input.value);
        expect(nameValues).toContain('直接仮設工事');
        expect(nameValues).toContain('土工事');
      });

      it('子項目が親項目の下に表示される', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        // 階層構造で表示されているか確認
        const allNames = screen.getAllByLabelText('名称') as HTMLInputElement[];
        const nameValues = allNames.map((input) => input.value);

        // 建築工事の後に直接仮設工事と土工事が来る
        const buildingIndex = nameValues.findIndex((v) => v === '建築工事');
        const scaffoldIndex = nameValues.findIndex((v) => v === '直接仮設工事');
        const earthworkIndex = nameValues.findIndex((v) => v === '土工事');

        expect(scaffoldIndex).toBeGreaterThan(buildingIndex);
        expect(earthworkIndex).toBeGreaterThan(buildingIndex);
      });
    });

    describe('REQ-2.4: 複数階層のネストサポート', () => {
      it('3階層以上のネストが表示される', () => {
        const items: EstimateItemHierarchyEdit[] = [
          {
            id: 'level-1',
            estimateId: 'estimate-1',
            parentId: null,
            displayOrder: 0,
            lines: [
              {
                id: 'line-l1',
                estimateItemId: 'level-1',
                lineType: 'ESTIMATE',
                name: 'レベル1',
                specification: null,
                unit: '式',
                quantity: '1',
                unitPrice: '100',
                amount: '100',
                remarks: null,
              },
            ],
            children: [
              {
                id: 'level-2',
                estimateId: 'estimate-1',
                parentId: 'level-1',
                displayOrder: 0,
                lines: [
                  {
                    id: 'line-l2',
                    estimateItemId: 'level-2',
                    lineType: 'ESTIMATE',
                    name: 'レベル2',
                    specification: null,
                    unit: '式',
                    quantity: '1',
                    unitPrice: '100',
                    amount: '100',
                    remarks: null,
                  },
                ],
                children: [
                  {
                    id: 'level-3',
                    estimateId: 'estimate-1',
                    parentId: 'level-2',
                    displayOrder: 0,
                    lines: [
                      {
                        id: 'line-l3',
                        estimateItemId: 'level-3',
                        lineType: 'ESTIMATE',
                        name: 'レベル3',
                        specification: null,
                        unit: '式',
                        quantity: '1',
                        unitPrice: '100',
                        amount: '100',
                        remarks: null,
                      },
                    ],
                    children: [],
                    isExpanded: true,
                    createdAt: '2025-01-01T00:00:00Z',
                    updatedAt: '2025-01-01T00:00:00Z',
                  },
                ],
                isExpanded: true,
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z',
              },
            ],
            isExpanded: true,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ];

        render(<EstimateItemTable items={items} />);

        // 入力フィールドの値として確認
        const allNames = screen.getAllByLabelText('名称') as HTMLInputElement[];
        const nameValues = allNames.map((input) => input.value);
        expect(nameValues).toContain('レベル1');
        expect(nameValues).toContain('レベル2');
        expect(nameValues).toContain('レベル3');
      });
    });

    describe('REQ-2.5: 展開/折りたたみ機能', () => {
      it('展開ボタンが表示される（子項目がある場合）', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        const expandButtons = screen.getAllByRole('button', { name: /折りたたむ|展開する/i });
        expect(expandButtons.length).toBeGreaterThan(0);
      });

      it('展開ボタンをクリックすると子項目が非表示になる', async () => {
        const items = createMockHierarchy();
        const onToggleExpand = vi.fn();
        render(<EstimateItemTable items={items} onToggleExpand={onToggleExpand} />);

        // 折りたたむボタンをクリック（最初の項目）
        const collapseButtons = screen.getAllByRole('button', { name: /折りたたむ/i });
        const collapseButton = collapseButtons[0]!;
        await userEvent.click(collapseButton);

        expect(onToggleExpand).toHaveBeenCalledWith('item-1');
      });

      it('折りたたんだ状態で展開ボタンをクリックすると子項目が表示される', async () => {
        const mockData = createMockHierarchy();
        const items: EstimateItemHierarchyEdit[] = [
          {
            ...mockData[0]!,
            isExpanded: false, // 折りたたみ状態
          },
        ];
        const onToggleExpand = vi.fn();
        render(<EstimateItemTable items={items} onToggleExpand={onToggleExpand} />);

        const expandButton = screen.getByRole('button', { name: /展開する/i });
        await userEvent.click(expandButton);

        expect(onToggleExpand).toHaveBeenCalledWith('item-1');
      });

      it('折りたたみ状態では子項目が非表示', () => {
        const mockData = createMockHierarchy();
        const items: EstimateItemHierarchyEdit[] = [
          {
            ...mockData[0]!,
            isExpanded: false, // 折りたたみ状態
          },
          mockData[1]!,
        ];
        render(<EstimateItemTable items={items} />);

        // 子項目が表示されていないことを確認（入力フィールドの値として）
        const allNames = screen.getAllByLabelText('名称') as HTMLInputElement[];
        const nameValues = allNames.map((input) => input.value);
        expect(nameValues).not.toContain('直接仮設工事');
        expect(nameValues).not.toContain('土工事');
      });
    });

    describe('REQ-2.6: インデント表示', () => {
      it('子項目がインデントされて表示される', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        // 子項目の行を取得
        const childItem = screen.getByTestId('estimate-item-item-1-1');
        // インデントレベル1（親がある）
        expect(childItem).toHaveStyle({ paddingLeft: '16px' });
      });

      it('ルート項目はインデントなし', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        const rootItem = screen.getByTestId('estimate-item-item-1');
        expect(rootItem).toHaveStyle({ paddingLeft: '0px' });
      });

      it('深い階層ほどインデントが大きくなる', () => {
        const items: EstimateItemHierarchyEdit[] = [
          {
            id: 'level-1',
            estimateId: 'estimate-1',
            parentId: null,
            displayOrder: 0,
            lines: [
              {
                id: 'line-l1',
                estimateItemId: 'level-1',
                lineType: 'ESTIMATE',
                name: 'レベル1',
                specification: null,
                unit: '式',
                quantity: '1',
                unitPrice: '100',
                amount: '100',
                remarks: null,
              },
            ],
            children: [
              {
                id: 'level-2',
                estimateId: 'estimate-1',
                parentId: 'level-1',
                displayOrder: 0,
                lines: [
                  {
                    id: 'line-l2',
                    estimateItemId: 'level-2',
                    lineType: 'ESTIMATE',
                    name: 'レベル2',
                    specification: null,
                    unit: '式',
                    quantity: '1',
                    unitPrice: '100',
                    amount: '100',
                    remarks: null,
                  },
                ],
                children: [
                  {
                    id: 'level-3',
                    estimateId: 'estimate-1',
                    parentId: 'level-2',
                    displayOrder: 0,
                    lines: [
                      {
                        id: 'line-l3',
                        estimateItemId: 'level-3',
                        lineType: 'ESTIMATE',
                        name: 'レベル3',
                        specification: null,
                        unit: '式',
                        quantity: '1',
                        unitPrice: '100',
                        amount: '100',
                        remarks: null,
                      },
                    ],
                    children: [],
                    isExpanded: true,
                    createdAt: '2025-01-01T00:00:00Z',
                    updatedAt: '2025-01-01T00:00:00Z',
                  },
                ],
                isExpanded: true,
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z',
              },
            ],
            isExpanded: true,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ];

        render(<EstimateItemTable items={items} />);

        const level1 = screen.getByTestId('estimate-item-level-1');
        const level2 = screen.getByTestId('estimate-item-level-2');
        const level3 = screen.getByTestId('estimate-item-level-3');

        expect(level1).toHaveStyle({ paddingLeft: '0px' });
        expect(level2).toHaveStyle({ paddingLeft: '16px' });
        expect(level3).toHaveStyle({ paddingLeft: '32px' });
      });
    });

    describe('項目選択機能', () => {
      it('項目をクリックすると選択される', async () => {
        const items = createMockHierarchy();
        const onItemSelect = vi.fn();
        render(<EstimateItemTable items={items} onItemSelect={onItemSelect} />);

        const itemRow = screen.getByTestId('estimate-item-item-1');
        await userEvent.click(itemRow);

        expect(onItemSelect).toHaveBeenCalledWith('item-1');
      });

      it('selectedItemIdで指定された項目がハイライトされる', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} selectedItemId="item-1" />);

        const selectedItem = screen.getByTestId('estimate-item-item-1');
        expect(selectedItem).toHaveAttribute('data-selected', 'true');
      });
    });

    describe('空の状態', () => {
      it('項目がない場合、空状態メッセージが表示される', () => {
        render(<EstimateItemTable items={[]} />);

        expect(screen.getByText('見積項目がありません')).toBeInTheDocument();
      });
    });

    describe('クライアントサイド金額計算の表示', () => {
      it('金額が表示される', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        // 金額フィールドが表示されていることを確認
        const amountFields = screen.getAllByTestId('amount-field');
        expect(amountFields.length).toBeGreaterThan(0);
      });
    });

    describe('行操作コールバック', () => {
      it('行のフィールド変更でonLineChangeが呼ばれる', async () => {
        const items = createMockHierarchy();
        const onLineChange = vi.fn();
        render(<EstimateItemTable items={items} onLineChange={onLineChange} />);

        // 最初の名称フィールドを変更
        const nameInputs = screen.getAllByLabelText('名称');
        const firstNameInput = nameInputs[0]!;
        await userEvent.clear(firstNameInput);
        await userEvent.type(firstNameInput, '変更後');

        expect(onLineChange).toHaveBeenCalled();
      });
    });

    describe('アクセシビリティ', () => {
      it('テーブルにrole="table"が設定される', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      it('ヘッダー行にrole="rowgroup"が設定される', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        expect(screen.getByRole('rowgroup', { name: 'ヘッダー' })).toBeInTheDocument();
      });
    });

    describe('ドラッグ&ドロップの準備', () => {
      it('各項目がdraggable属性を持つ', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} draggable={true} />);

        const rootItem = screen.getByTestId('estimate-item-item-1');
        expect(rootItem).toHaveAttribute('draggable', 'true');
      });

      it('draggable=falseの場合、draggable属性がfalse', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} draggable={false} />);

        const rootItem = screen.getByTestId('estimate-item-item-1');
        expect(rootItem).toHaveAttribute('draggable', 'false');
      });
    });
  });
});
