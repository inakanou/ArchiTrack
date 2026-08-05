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
 * - REQ-2.7: 親項目を展開または折りたたむ場合、子項目の表示/非表示を切り替える
 * - REQ-2.6: 項目の階層レベルをインデント表示で視覚的に区別する
 * - REQ-12.2: 見積項目の表示順序を変更した場合、ドラッグ&ドロップで順序を変更可能とする
 *
 * @module components/estimate/EstimateItemTable.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ],
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
                    createdAt: '2025-01-01T00:00:00Z',
                    updatedAt: '2025-01-01T00:00:00Z',
                  },
                ],
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z',
              },
            ],
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

    // 折りたたみ状態は `useEstimateNavigation` が所有する表示状態のため、
    // `collapsedKeys` / `onToggleCollapsed` として受け渡す（Task 54.2）。
    // ツリー表示の網羅的な検証は EstimateItemTable.treeMode.test.tsx が担当する。
    describe('REQ-2.7: 展開/折りたたみ機能', () => {
      it('展開ボタンが表示される（子項目がある場合）', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        const expandButtons = screen.getAllByRole('button', { name: /折りたたむ|展開する/i });
        expect(expandButtons.length).toBeGreaterThan(0);
      });

      it('展開ボタンをクリックすると折りたたみ要求が通知される', async () => {
        const items = createMockHierarchy();
        const onToggleCollapsed = vi.fn();
        render(<EstimateItemTable items={items} onToggleCollapsed={onToggleCollapsed} />);

        // 折りたたむボタンをクリック（最初の項目）
        const collapseButtons = screen.getAllByRole('button', { name: /折りたたむ/i });
        const collapseButton = collapseButtons[0]!;
        await userEvent.click(collapseButton);

        expect(onToggleCollapsed).toHaveBeenCalledWith('item-1');
      });

      it('折りたたんだ状態で展開ボタンをクリックすると展開要求が通知される', async () => {
        const items = createMockHierarchy();
        const onToggleCollapsed = vi.fn();
        render(
          <EstimateItemTable
            items={items}
            collapsedKeys={new Set(['item-1'])}
            onToggleCollapsed={onToggleCollapsed}
          />
        );

        const expandButton = screen.getByRole('button', { name: /展開する/i });
        await userEvent.click(expandButton);

        expect(onToggleCollapsed).toHaveBeenCalledWith('item-1');
      });

      it('折りたたみ状態では子項目が非表示', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} collapsedKeys={new Set(['item-1'])} />);

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
                    createdAt: '2025-01-01T00:00:00Z',
                    updatedAt: '2025-01-01T00:00:00Z',
                  },
                ],
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z',
              },
            ],
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

      it('selectedKeysで指定された項目がハイライトされる', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} selectedKeys={['item-1']} />);

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
      it('テーブルにaria-labelが設定される', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        // Note: ARIA tableロールは削除されたが、aria-labelで識別可能
        expect(screen.getByLabelText('見積項目テーブル')).toBeInTheDocument();
      });

      it('ヘッダー行がaria-hiddenで装飾的要素として設定される', () => {
        const items = createMockHierarchy();
        render(<EstimateItemTable items={items} />);

        // ヘッダー行はaria-hidden="true"で装飾的要素として設定
        // 各入力フィールドはaria-labelで個別にアクセシブル
        const table = screen.getByLabelText('見積項目テーブル');
        const headerSection = table.querySelector('[aria-hidden="true"]');
        expect(headerSection).toBeInTheDocument();
      });
    });

    // ====================================================================
    // Task 51.8: 値引き行（itemType=DISCOUNT, children なし）の描画
    // Requirements (estimate-creation): REQ-41.3, 41.4, 41.6
    // ====================================================================
    describe('Task 51.8: 値引き行（itemType=DISCOUNT）の描画', () => {
      const createDiscountItems = (): EstimateItemHierarchyEdit[] => [
        {
          id: 'discount-1',
          estimateId: 'estimate-1',
          parentId: null,
          displayOrder: 0,
          itemType: 'DISCOUNT',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          lines: [
            {
              id: 'line-discount-est',
              estimateItemId: 'discount-1',
              lineType: 'ESTIMATE',
              name: '値引き',
              specification: null,
              unit: '式',
              quantity: '1',
              unitPrice: '-3000',
              amount: '-3000',
              remarks: null,
            },
          ],
          children: [],
        },
      ];

      it('値引き行は見積行のみ描画し、実行・業者行を持たない (REQ-41.3)', () => {
        render(<EstimateItemTable items={createDiscountItems()} />);

        const itemWrapper = screen.getByTestId('estimate-item-discount-1');
        expect(within(itemWrapper).getByTestId('line-type-ESTIMATE')).toBeInTheDocument();
        expect(within(itemWrapper).queryByTestId('line-type-EXECUTION')).not.toBeInTheDocument();
        expect(within(itemWrapper).queryByTestId('line-type-VENDOR')).not.toBeInTheDocument();
      });

      it('children なし（hasChildren=false）のため単価が編集可能な input である (REQ-41.4)', () => {
        render(<EstimateItemTable items={createDiscountItems()} />);

        const itemWrapper = screen.getByTestId('estimate-item-discount-1');
        const priceInput = within(itemWrapper).getByLabelText('単価');
        // 自動計算の読み取り専用 div ではなく編集可能な input
        expect(priceInput.tagName.toLowerCase()).toBe('input');
        expect(priceInput).toHaveValue('-3000');
      });

      it('負数金額が "-3,000" として表示される (REQ-41.6)', () => {
        render(<EstimateItemTable items={createDiscountItems()} />);

        const itemWrapper = screen.getByTestId('estimate-item-discount-1');
        const amountField = within(itemWrapper).getByTestId('amount-field');
        expect(amountField).toHaveTextContent('-3,000');
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

// ============================================================================
// 注記行の描画（Task 53.8）
// ============================================================================

describe('EstimateItemTable - 注記行（55.1, 55.3）', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  /** 通常項目の子として注記行を持つ階層データ */
  const createHierarchyWithNote = (): EstimateItemHierarchyEdit[] => [
    {
      id: 'item-1',
      estimateId: 'estimate-1',
      parentId: null,
      displayOrder: 0,
      itemType: 'STANDARD',
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
      ],
      children: [
        {
          id: 'note-1',
          estimateId: 'estimate-1',
          parentId: 'item-1',
          displayOrder: 0,
          itemType: 'NOTE',
          lines: [
            {
              id: 'line-note-est',
              estimateItemId: 'note-1',
              lineType: 'ESTIMATE',
              name: '※支給材は別途',
              specification: null,
              unit: null,
              quantity: null,
              unitPrice: null,
              amount: null,
              remarks: null,
            },
          ],
          children: [],
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ],
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
  ];

  it('子階層に配置された注記行が名称欄のみで描画されること (55.1, 55.3)', () => {
    render(<EstimateItemTable items={createHierarchyWithNote()} />);

    const noteWrapper = screen.getByTestId('estimate-item-note-1');
    const noteRow = within(noteWrapper).getByTestId('estimate-item-row');

    expect(noteRow).toHaveAttribute('data-item-type', 'NOTE');
    expect(within(noteRow).getByLabelText('名称')).toHaveValue('※支給材は別途');
    expect(within(noteRow).queryByLabelText('数量')).not.toBeInTheDocument();
    expect(within(noteRow).queryByLabelText('単価')).not.toBeInTheDocument();
    expect(within(noteRow).queryByTestId('amount-field')).not.toBeInTheDocument();
  });

  it('注記行の兄弟にあたる通常項目は従来どおり全欄を描画すること', () => {
    render(<EstimateItemTable items={createHierarchyWithNote()} />);

    const standardWrapper = screen.getByTestId('estimate-item-item-1');
    const standardRow = within(standardWrapper).getAllByTestId('estimate-item-row')[0]!;
    expect(standardRow).toHaveAttribute('data-item-type', 'STANDARD');
    expect(within(standardRow).getByLabelText('数量')).toBeInTheDocument();
  });

  /** 通常項目の子として「注記行と通常項目の両方」を持つ階層データ */
  const createHierarchyWithNoteAndStandardChild = (): EstimateItemHierarchyEdit[] => {
    const tree = createHierarchyWithNote();
    const root = tree[0]!;
    root.children = [
      ...root.children,
      {
        id: 'child-1',
        estimateId: 'estimate-1',
        parentId: 'item-1',
        displayOrder: 1,
        itemType: 'STANDARD',
        lines: [
          {
            id: 'line-child-1-est',
            estimateItemId: 'child-1',
            lineType: 'ESTIMATE',
            name: '子項目',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '400000',
            amount: '400000',
            remarks: null,
          },
        ],
        children: [],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ];
    return tree;
  };

  it('子が注記行のみの親項目は単価欄が入力欄のまま描画されること（53.1の葉扱いと整合 / 55.2）', () => {
    render(<EstimateItemTable items={createHierarchyWithNote()} />);

    const parentWrapper = screen.getByTestId('estimate-item-item-1');
    const parentRow = within(parentWrapper).getByTestId('estimate-item-row');

    // 注記行は集計対象外（55.2）で親は葉として自身の金額を保持するため、
    // 単価は導出値ではなく手入力のまま編集できなければならない
    const unitPrice = within(parentRow).getByLabelText('単価');
    expect(unitPrice.tagName).toBe('INPUT');
    expect(unitPrice).toHaveValue('1000000');
  });

  it('子に通常項目が1件でもあれば単価欄が読み取り専用で描画されること (29.1)', () => {
    render(<EstimateItemTable items={createHierarchyWithNoteAndStandardChild()} />);

    const parentWrapper = screen.getByTestId('estimate-item-item-1');
    const parentRow = within(parentWrapper).getByTestId('estimate-item-row');

    // 集計対象の子を持つ親は導出値になるため単価は入力不可
    const unitPrice = within(parentRow).getByLabelText('単価');
    expect(unitPrice.tagName).not.toBe('INPUT');
    expect(unitPrice.tagName).toBe('DIV');
  });

  it('子が注記行のみでも展開/折りたたみボタンは表示されること（表示上の子は存在する）', () => {
    render(<EstimateItemTable items={createHierarchyWithNote()} />);

    const parentWrapper = screen.getByTestId('estimate-item-item-1');
    expect(within(parentWrapper).getByRole('button', { name: '折りたたむ' })).toBeInTheDocument();
  });

  it('注記行を選択できること（削除・複写・並び替え・階層移動の対象になる前提）(55.6)', async () => {
    const onItemSelect = vi.fn();
    render(<EstimateItemTable items={createHierarchyWithNote()} onItemSelect={onItemSelect} />);

    await userEvent.click(screen.getByTestId('estimate-item-note-1'));

    expect(onItemSelect).toHaveBeenCalledWith('note-1');
  });
});
