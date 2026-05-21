/**
 * @fileoverview useEstimateEditorフックのテスト
 *
 * Task 8.1: useEstimateEditorフックの実装
 *
 * Requirements (estimate-creation):
 * - REQ-1.3: 金額フィールドを単価と数量の積として自動計算する
 * - REQ-1.4: 金額フィールドを入力不可として表示する
 * - REQ-1.5: 合計行に全見積項目の金額合計を自動計算して表示する
 * - REQ-2.3: 子項目を持つ場合、親項目の金額として子項目の金額合計を自動計算して表示する
 * - REQ-12.1: 見積項目を追加した場合、新規の3行1セット（見積・実行・業者金額行）を作成する
 * - REQ-12.2: 見積項目の表示順序を変更した場合、ドラッグ&ドロップで順序を変更可能とする
 * - REQ-12.3: 見積項目を削除した場合、3行1セット全体を削除する
 * - REQ-12.5: 見積項目を複製した場合、3行1セット全体を複製する
 * - REQ-34.1: 見積項目追加後の保存・再読み込みの整合性
 * - REQ-34.2: 見積項目削除後の保存・再読み込みの整合性
 * - REQ-34.3: 見積項目編集後の保存・再読み込みの整合性
 * - REQ-34.4: 保存処理における全変更タイプの正しい処理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useEstimateEditor,
  type UseEstimateEditorOptions,
  type EstimateItemHierarchyEdit,
  type ItemChange,
} from './useEstimateEditor';

describe('useEstimateEditor', () => {
  // Mock console.error to avoid noise in tests
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * テスト用の見積項目データを作成
   */
  const createMockItems = (): EstimateItemHierarchyEdit[] => [
    {
      id: 'item-1',
      estimateId: 'estimate-1',
      parentId: null,
      displayOrder: 0,
      lines: [
        {
          id: 'line-1-estimate',
          estimateItemId: 'item-1',
          lineType: 'ESTIMATE',
          name: '項目1',
          specification: '仕様1',
          unit: '式',
          quantity: '10',
          unitPrice: '1000',
          amount: '10000',
          remarks: null,
        },
        {
          id: 'line-1-execution',
          estimateItemId: 'item-1',
          lineType: 'EXECUTION',
          name: '項目1',
          specification: '仕様1',
          unit: '式',
          quantity: '10',
          unitPrice: '900',
          amount: '9000',
          remarks: null,
        },
        {
          id: 'line-1-vendor',
          estimateItemId: 'item-1',
          lineType: 'VENDOR',
          name: '項目1',
          specification: '仕様1',
          unit: '式',
          quantity: '10',
          unitPrice: '800',
          amount: '8000',
          remarks: null,
        },
      ],
      children: [],
      isExpanded: true,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'item-2',
      estimateId: 'estimate-1',
      parentId: null,
      displayOrder: 1,
      lines: [
        {
          id: 'line-2-estimate',
          estimateItemId: 'item-2',
          lineType: 'ESTIMATE',
          name: '項目2',
          specification: '仕様2',
          unit: 'm2',
          quantity: '5',
          unitPrice: '2000',
          amount: '10000',
          remarks: null,
        },
        {
          id: 'line-2-execution',
          estimateItemId: 'item-2',
          lineType: 'EXECUTION',
          name: '項目2',
          specification: '仕様2',
          unit: 'm2',
          quantity: '5',
          unitPrice: '1800',
          amount: '9000',
          remarks: null,
        },
        {
          id: 'line-2-vendor',
          estimateItemId: 'item-2',
          lineType: 'VENDOR',
          name: '項目2',
          specification: '仕様2',
          unit: 'm2',
          quantity: '5',
          unitPrice: '1600',
          amount: '8000',
          remarks: null,
        },
      ],
      children: [],
      isExpanded: true,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ];

  /**
   * 階層構造を持つテスト用データを作成
   */
  const createMockHierarchyItems = (): EstimateItemHierarchyEdit[] => [
    {
      id: 'parent-1',
      estimateId: 'estimate-1',
      parentId: null,
      displayOrder: 0,
      lines: [
        {
          id: 'line-parent-1-estimate',
          estimateItemId: 'parent-1',
          lineType: 'ESTIMATE',
          name: '建築工事',
          specification: '',
          unit: '式',
          quantity: '1',
          unitPrice: '0', // 子項目の合計になる
          amount: '0',
          remarks: null,
        },
        {
          id: 'line-parent-1-execution',
          estimateItemId: 'parent-1',
          lineType: 'EXECUTION',
          name: '建築工事',
          specification: '',
          unit: '式',
          quantity: '1',
          unitPrice: '0',
          amount: '0',
          remarks: null,
        },
        {
          id: 'line-parent-1-vendor',
          estimateItemId: 'parent-1',
          lineType: 'VENDOR',
          name: '建築工事',
          specification: '',
          unit: '式',
          quantity: '1',
          unitPrice: '0',
          amount: '0',
          remarks: null,
        },
      ],
      children: [
        {
          id: 'child-1',
          estimateId: 'estimate-1',
          parentId: 'parent-1',
          displayOrder: 0,
          lines: [
            {
              id: 'line-child-1-estimate',
              estimateItemId: 'child-1',
              lineType: 'ESTIMATE',
              name: '子項目1',
              specification: '',
              unit: '式',
              quantity: '1',
              unitPrice: '5000',
              amount: '5000',
              remarks: null,
            },
            {
              id: 'line-child-1-execution',
              estimateItemId: 'child-1',
              lineType: 'EXECUTION',
              name: '子項目1',
              specification: '',
              unit: '式',
              quantity: '1',
              unitPrice: '4500',
              amount: '4500',
              remarks: null,
            },
            {
              id: 'line-child-1-vendor',
              estimateItemId: 'child-1',
              lineType: 'VENDOR',
              name: '子項目1',
              specification: '',
              unit: '式',
              quantity: '1',
              unitPrice: '4000',
              amount: '4000',
              remarks: null,
            },
          ],
          children: [],
          isExpanded: true,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'child-2',
          estimateId: 'estimate-1',
          parentId: 'parent-1',
          displayOrder: 1,
          lines: [
            {
              id: 'line-child-2-estimate',
              estimateItemId: 'child-2',
              lineType: 'ESTIMATE',
              name: '子項目2',
              specification: '',
              unit: '式',
              quantity: '1',
              unitPrice: '3000',
              amount: '3000',
              remarks: null,
            },
            {
              id: 'line-child-2-execution',
              estimateItemId: 'child-2',
              lineType: 'EXECUTION',
              name: '子項目2',
              specification: '',
              unit: '式',
              quantity: '1',
              unitPrice: '2700',
              amount: '2700',
              remarks: null,
            },
            {
              id: 'line-child-2-vendor',
              estimateItemId: 'child-2',
              lineType: 'VENDOR',
              name: '子項目2',
              specification: '',
              unit: '式',
              quantity: '1',
              unitPrice: '2400',
              amount: '2400',
              remarks: null,
            },
          ],
          children: [],
          isExpanded: true,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      isExpanded: true,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ];

  const defaultOptions: UseEstimateEditorOptions = {
    estimateId: 'estimate-1',
    initialItems: [],
    onSaveSuccess: vi.fn(),
    onSaveError: vi.fn(),
  };

  describe('初期状態', () => {
    it('初期状態が正しく設定されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      expect(result.current.items).toHaveLength(2);
      expect(result.current.isDirty).toBe(false);
      expect(result.current.pendingChanges.size).toBe(0);
      expect(result.current.isSaving).toBe(false);
    });

    it('空の初期データでも正しく動作すること', () => {
      const { result } = renderHook(() => useEstimateEditor(defaultOptions));

      expect(result.current.items).toHaveLength(0);
      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('updateLine - 行のフィールド更新（REQ-1.3, REQ-1.4）', () => {
    it('数量を更新すると金額が自動計算されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'quantity', '20');
      });

      const updatedItem = result.current.items[0];
      const estimateLine = updatedItem?.lines.find((l) => l.lineType === 'ESTIMATE');

      expect(estimateLine?.quantity).toBe('20');
      // 金額は自動計算される (20 * 1000 = 20000)
      expect(estimateLine?.amount).toBe('20000');
      expect(result.current.isDirty).toBe(true);
    });

    it('単価を更新すると金額が自動計算されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'unitPrice', '1500');
      });

      const updatedItem = result.current.items[0];
      const estimateLine = updatedItem?.lines.find((l) => l.lineType === 'ESTIMATE');

      expect(estimateLine?.unitPrice).toBe('1500');
      // 金額は自動計算される (10 * 1500 = 15000)
      expect(estimateLine?.amount).toBe('15000');
    });

    it('名称を更新しても金額は変更されないこと', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '新しい名称');
      });

      const updatedItem = result.current.items[0];
      const estimateLine = updatedItem?.lines.find((l) => l.lineType === 'ESTIMATE');

      expect(estimateLine?.name).toBe('新しい名称');
      expect(estimateLine?.amount).toBe('10000'); // 元の金額のまま
    });

    it('変更差分が正しく追跡されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '新しい名称');
      });

      const change = result.current.pendingChanges.get('item-1');
      expect(change).toBeDefined();
      expect(change?.type).toBe('update');
    });
  });

  describe('addItem - 項目追加（REQ-12.1）', () => {
    it('新規項目が3行1セットで追加されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addItem();
      });

      expect(result.current.items).toHaveLength(3);

      const newItem = result.current.items[2];
      expect(newItem?.lines).toHaveLength(3);
      expect(newItem?.lines.map((l) => l.lineType)).toEqual(['ESTIMATE', 'EXECUTION', 'VENDOR']);
      expect(result.current.isDirty).toBe(true);
    });

    it('親を指定して子項目として追加できること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockHierarchyItems(),
        })
      );

      act(() => {
        result.current.addItem('parent-1');
      });

      const parent = result.current.items[0];
      expect(parent?.children).toHaveLength(3); // 元の2つ + 新規1つ

      const newChild = parent?.children[2];
      expect(newChild?.parentId).toBe('parent-1');
      expect(newChild?.lines).toHaveLength(3);
    });

    it('変更差分にaddとして追加されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addItem();
      });

      const newItem = result.current.items[2];
      const change = result.current.pendingChanges.get(newItem!.id);
      expect(change?.type).toBe('add');
    });
  });

  describe('deleteItem - 項目削除（REQ-12.3）', () => {
    it('項目を削除すると3行1セット全体が削除されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.deleteItem('item-1');
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0]?.id).toBe('item-2');
      expect(result.current.isDirty).toBe(true);
    });

    it('変更差分にdeleteとして追加されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.deleteItem('item-1');
      });

      const change = result.current.pendingChanges.get('item-1');
      expect(change?.type).toBe('delete');
    });

    it('子項目を持つ項目を削除すると子項目も削除されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockHierarchyItems(),
        })
      );

      act(() => {
        result.current.deleteItem('parent-1');
      });

      expect(result.current.items).toHaveLength(0);
    });

    it('新規追加した項目を削除するとpendingChangesからも削除されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      // 項目を追加
      act(() => {
        result.current.addItem();
      });

      const newItemId = result.current.items[2]!.id;
      expect(result.current.pendingChanges.has(newItemId)).toBe(true);

      // 追加した項目を削除
      act(() => {
        result.current.deleteItem(newItemId);
      });

      // 新規追加した項目は完全に削除される（deleteフラグも立たない）
      expect(result.current.pendingChanges.has(newItemId)).toBe(false);
    });
  });

  describe('reorderItems - 項目並び替え（REQ-12.2）', () => {
    it('項目の順序を変更できること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      // item-2をitem-1の前に移動
      act(() => {
        result.current.reorderItems('item-2', 'item-1');
      });

      expect(result.current.items[0]?.id).toBe('item-2');
      expect(result.current.items[1]?.id).toBe('item-1');
      expect(result.current.isDirty).toBe(true);
    });

    it('displayOrderが正しく更新されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.reorderItems('item-2', 'item-1');
      });

      expect(result.current.items[0]?.displayOrder).toBe(0);
      expect(result.current.items[1]?.displayOrder).toBe(1);
    });

    it('変更差分にreorderとして追加されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.reorderItems('item-2', 'item-1');
      });

      const change1 = result.current.pendingChanges.get('item-1');
      const change2 = result.current.pendingChanges.get('item-2');
      // 並び替えはupdateとして記録
      expect(change1?.type).toBe('update');
      expect(change2?.type).toBe('update');
    });
  });

  describe('duplicateItem - 項目複製（REQ-12.5）', () => {
    it('項目を複製すると3行1セット全体が複製されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.duplicateItem('item-1');
      });

      expect(result.current.items).toHaveLength(3);

      const duplicated = result.current.items[2];
      expect(duplicated?.lines).toHaveLength(3);
      expect(duplicated?.lines[0]?.name).toBe('項目1');
    });

    it('複製された項目は新しいIDを持つこと', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.duplicateItem('item-1');
      });

      const duplicated = result.current.items[2];
      expect(duplicated?.id).not.toBe('item-1');
      // 行のIDも新しくなっている
      duplicated?.lines.forEach((line) => {
        expect(line.id).not.toContain('line-1');
      });
    });

    it('変更差分にaddとして追加されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.duplicateItem('item-1');
      });

      const duplicated = result.current.items[2];
      const change = result.current.pendingChanges.get(duplicated!.id);
      expect(change?.type).toBe('add');
    });
  });

  describe('階層金額の自動計算（REQ-2.3）', () => {
    it('子項目の金額変更時に親項目の金額が自動計算されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockHierarchyItems(),
        })
      );

      // 子項目1の金額を変更（数量を2に）
      act(() => {
        result.current.updateLine('child-1', 'line-child-1-estimate', 'quantity', '2');
      });

      // 親項目の金額が子項目の合計になる
      // child-1: 2 * 5000 = 10000
      // child-2: 1 * 3000 = 3000
      // 合計: 13000
      const parent = result.current.items[0];
      const parentEstimateLine = parent?.lines.find((l) => l.lineType === 'ESTIMATE');
      expect(parentEstimateLine?.amount).toBe('13000');
    });
  });

  describe('save - バッチ保存', () => {
    it('変更がない場合は保存をスキップすること', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
        })
      );

      await act(async () => {
        await result.current.save();
      });

      expect(onSave).not.toHaveBeenCalled();
    });

    it('変更がある場合に保存が実行されること', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const onSaveSuccess = vi.fn();
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
          onSaveSuccess,
        })
      );

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '新しい名称');
      });

      await act(async () => {
        await result.current.save();
      });

      expect(onSave).toHaveBeenCalled();
      expect(onSaveSuccess).toHaveBeenCalled();
    });

    it('保存成功後にisDirtyがfalseになること', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
        })
      );

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '新しい名称');
      });

      expect(result.current.isDirty).toBe(true);

      await act(async () => {
        await result.current.save();
      });

      expect(result.current.isDirty).toBe(false);
      expect(result.current.pendingChanges.size).toBe(0);
    });

    it('保存中はisSavingがtrueになること', async () => {
      let resolvePromise: () => void;
      const onSave = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolvePromise = resolve;
          })
      );

      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
        })
      );

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '新しい名称');
      });

      // 保存開始
      act(() => {
        result.current.save();
      });

      // 非同期処理の開始を待つ
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.isSaving).toBe(true);

      // 保存完了
      await act(async () => {
        resolvePromise!();
        await Promise.resolve();
      });

      expect(result.current.isSaving).toBe(false);
    });

    it('保存失敗時にonSaveErrorが呼ばれること', async () => {
      const error = new Error('Save failed');
      const onSave = vi.fn().mockRejectedValue(error);
      const onSaveError = vi.fn();
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
          onSaveError,
        })
      );

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '新しい名称');
      });

      await act(async () => {
        await result.current.save();
      });

      expect(onSaveError).toHaveBeenCalledWith(error);
      expect(result.current.isDirty).toBe(true); // 失敗時はisDirtyを維持
    });

    it('保存時に変更差分がonSaveに渡されること', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
        })
      );

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '新しい名称');
        result.current.deleteItem('item-2');
      });

      await act(async () => {
        await result.current.save();
      });

      expect(onSave).toHaveBeenCalled();
      const savedChanges = onSave.mock.calls[0]![0] as Map<string, ItemChange>;
      expect(savedChanges.has('item-1')).toBe(true);
      expect(savedChanges.has('item-2')).toBe(true);
      expect(savedChanges.get('item-1')?.type).toBe('update');
      expect(savedChanges.get('item-2')?.type).toBe('delete');
    });
  });

  describe('discard - 変更破棄', () => {
    it('変更を破棄すると初期状態に戻ること', () => {
      const initialItems = createMockItems();
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems,
        })
      );

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '新しい名称');
        result.current.addItem();
      });

      expect(result.current.isDirty).toBe(true);
      expect(result.current.items).toHaveLength(3);

      act(() => {
        result.current.discard();
      });

      expect(result.current.isDirty).toBe(false);
      expect(result.current.items).toHaveLength(2);
      expect(result.current.pendingChanges.size).toBe(0);
    });
  });

  describe('setItems - 外部からの項目設定', () => {
    it('外部から項目を設定できること', () => {
      const { result } = renderHook(() => useEstimateEditor(defaultOptions));

      const newItems = createMockItems();

      act(() => {
        result.current.setItems(newItems);
      });

      expect(result.current.items).toHaveLength(2);
      expect(result.current.isDirty).toBe(false);
      expect(result.current.pendingChanges.size).toBe(0);
    });
  });

  describe('toggleExpanded - 展開/折りたたみ', () => {
    it('項目の展開状態をトグルできること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockHierarchyItems(),
        })
      );

      expect(result.current.items[0]?.isExpanded).toBe(true);

      act(() => {
        result.current.toggleExpanded('parent-1');
      });

      expect(result.current.items[0]?.isExpanded).toBe(false);
    });

    it('展開状態の変更はisDirtyに影響しないこと', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockHierarchyItems(),
        })
      );

      act(() => {
        result.current.toggleExpanded('parent-1');
      });

      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('getTotalAmount - 合計金額取得（REQ-1.5）', () => {
    it('全見積項目の合計金額を取得できること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      const total = result.current.getTotalAmount();
      // item-1: 10000, item-2: 10000
      expect(total).toBe('20000');
    });

    it('階層構造でも正しく合計金額を取得できること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockHierarchyItems(),
        })
      );

      const total = result.current.getTotalAmount();
      // parent-1の金額は子項目の合計（5000 + 3000 = 8000）
      expect(total).toBe('8000');
    });
  });

  /** @requirement estimate-creation/REQ-34.3 */
  describe('updateLine - ステールデータ問題の修正 (REQ-34.3)', () => {
    it('連続したupdateLineでrecordChangeに最新データが記録されること', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
        })
      );

      // 名称を変更
      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '変更後名称A');
      });

      // 続けて単価を変更（同じ項目に対して）
      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'unitPrice', '2000');
      });

      // 保存時にonSaveに渡される変更データに最新の値が含まれること
      await act(async () => {
        await result.current.save();
      });

      expect(onSave).toHaveBeenCalled();
      const savedChanges = onSave.mock.calls[0]![0] as Map<string, ItemChange>;
      const change = savedChanges.get('item-1');
      expect(change).toBeDefined();
      expect(change?.type).toBe('update');
      expect(change?.data).toBeDefined();

      // data内のlinesに最新の名称と単価が反映されていること
      const estimateLine = change?.data?.lines.find((l) => l.lineType === 'ESTIMATE');
      expect(estimateLine?.name).toBe('変更後名称A');
      expect(estimateLine?.unitPrice).toBe('2000');
      // 金額も自動計算されていること (10 * 2000 = 20000)
      expect(estimateLine?.amount).toBe('20000');
    });
  });

  /**
   * @requirement estimate-creation/REQ-34.1
   * @requirement estimate-creation/REQ-34.2
   * @requirement estimate-creation/REQ-34.3
   * @requirement estimate-creation/REQ-34.4
   */
  describe('保存時の変更タイプ処理 (REQ-34.4)', () => {
    it('add/delete/updateの全変更タイプがpendingChangesに正しく記録されること', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
        })
      );

      // update: 名称変更
      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '変更後');
      });

      // add: 新規追加
      act(() => {
        result.current.addItem();
      });

      // delete: 既存項目削除
      act(() => {
        result.current.deleteItem('item-2');
      });

      // 保存
      await act(async () => {
        await result.current.save();
      });

      expect(onSave).toHaveBeenCalled();
      const savedChanges = onSave.mock.calls[0]![0] as Map<string, ItemChange>;

      // update
      const updateChange = savedChanges.get('item-1');
      expect(updateChange?.type).toBe('update');

      // delete
      const deleteChange = savedChanges.get('item-2');
      expect(deleteChange?.type).toBe('delete');

      // add（新規追加されたアイテムを見つける）
      const addChanges = Array.from(savedChanges.values()).filter((c) => c.type === 'add');
      expect(addChanges.length).toBe(1);
    });

    it('追加された項目のデータがpendingChangesに含まれること (REQ-34.1)', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
        })
      );

      // 新規追加
      act(() => {
        result.current.addItem();
      });

      const newItem = result.current.items[2];
      expect(newItem).toBeDefined();
      expect(newItem!.lines).toHaveLength(3);

      // 保存
      await act(async () => {
        await result.current.save();
      });

      const savedChanges = onSave.mock.calls[0]![0] as Map<string, ItemChange>;
      const addChange = savedChanges.get(newItem!.id);
      expect(addChange?.type).toBe('add');
      expect(addChange?.data).toBeDefined();
      expect(addChange?.data?.lines).toHaveLength(3);
    });

    it('削除された項目のIDがpendingChangesに含まれること (REQ-34.2)', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
        })
      );

      act(() => {
        result.current.deleteItem('item-1');
      });

      // items から削除されていること
      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0]?.id).toBe('item-2');

      // 保存
      await act(async () => {
        await result.current.save();
      });

      const savedChanges = onSave.mock.calls[0]![0] as Map<string, ItemChange>;
      const deleteChange = savedChanges.get('item-1');
      expect(deleteChange?.type).toBe('delete');
    });

    it('編集された項目の最新データがpendingChangesに含まれること (REQ-34.3)', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
        })
      );

      // 名称を変更
      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '最新名称');
      });

      // 単価を変更
      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'unitPrice', '5000');
      });

      // 保存
      await act(async () => {
        await result.current.save();
      });

      const savedChanges = onSave.mock.calls[0]![0] as Map<string, ItemChange>;
      const updateChange = savedChanges.get('item-1');
      expect(updateChange?.type).toBe('update');

      const estimateLine = updateChange?.data?.lines.find((l) => l.lineType === 'ESTIMATE');
      // 最新の名称と単価が含まれること
      expect(estimateLine?.name).toBe('最新名称');
      expect(estimateLine?.unitPrice).toBe('5000');
      // 金額も自動計算されていること (10 * 5000 = 50000)
      expect(estimateLine?.amount).toBe('50000');
    });
  });

  describe('addDiscountItem - 値引き行追加（REQ-41.2, 41.3, 41.6, 41.8, 41.10）', () => {
    it('ルート末尾にitemType=DISCOUNT・ESTIMATE1行のみ・プリセット値の項目が追加されること (REQ-41.2, 41.3)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addDiscountItem();
      });

      // ルート末尾に追加されること
      expect(result.current.items).toHaveLength(3);
      const discountItem = result.current.items[2]!;

      // itemTypeがDISCOUNT
      expect(discountItem.itemType).toBe('DISCOUNT');
      // ルートレベル
      expect(discountItem.parentId).toBeNull();
      // 子を持たないリーフ
      expect(discountItem.children).toHaveLength(0);
      // ESTIMATE行のみ
      expect(discountItem.lines).toHaveLength(1);
      const estimateLine = discountItem.lines[0]!;
      expect(estimateLine.lineType).toBe('ESTIMATE');
      // プリセット値
      expect(estimateLine.name).toBe('値引き');
      expect(estimateLine.specification).toBe('');
      expect(estimateLine.unit).toBe('式');
      expect(estimateLine.quantity).toBe('1');
      expect(estimateLine.unitPrice).toBeNull();
      expect(estimateLine.amount).toBeNull();
      expect(estimateLine.remarks).toBeNull();
      // displayOrderは末尾
      expect(discountItem.displayOrder).toBe(2);
    });

    it('pendingChangesにaddとして記録され、data.itemTypeがDISCOUNTかつlines長1であること (REQ-41.8)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addDiscountItem();
      });

      const discountItem = result.current.items[2]!;
      const change = result.current.pendingChanges.get(discountItem.id);
      expect(change?.type).toBe('add');
      expect(change?.data?.itemType).toBe('DISCOUNT');
      expect(change?.data?.lines).toHaveLength(1);
      expect(change?.data?.lines[0]!.lineType).toBe('ESTIMATE');
    });

    it('値引き行の単価を負数に更新すると金額が負数になり、getTotalAmountが減算されること (REQ-41.6, 41.8)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      // 初期合計: item-1(10000) + item-2(10000) = 20000
      expect(result.current.getTotalAmount()).toBe('20000');

      act(() => {
        result.current.addDiscountItem();
      });

      const discountItem = result.current.items[2]!;
      const estimateLineId = discountItem.lines[0]!.id;

      // 単価を負数に更新（数量=1）
      act(() => {
        result.current.updateLine(discountItem.id, estimateLineId, 'unitPrice', '-3000');
      });

      const updatedDiscount = result.current.items[2]!;
      const updatedLine = updatedDiscount.lines[0]!;
      // 金額が負数（1 * -3000 = -3000）
      expect(updatedLine.amount).toBe('-3000');

      // 合計が減算される: 20000 + (-3000) = 17000
      expect(result.current.getTotalAmount()).toBe('17000');
    });

    it('値引き行はupdateLine・階層再計算を経てもEXECUTION/VENDOR行が再合成されないこと (REQ-41.3 不変条件)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addDiscountItem();
      });

      const discountItem = result.current.items[2]!;
      const estimateLineId = discountItem.lines[0]!.id;

      // 単価更新（recalculateParentAmounts経由のstate更新を誘発）
      act(() => {
        result.current.updateLine(discountItem.id, estimateLineId, 'unitPrice', '-1000');
      });
      // 名称更新でも再合成されないこと
      act(() => {
        result.current.updateLine(discountItem.id, estimateLineId, 'name', '出精値引き');
      });

      const finalDiscount = result.current.items[2]!;
      expect(finalDiscount.lines).toHaveLength(1);
      expect(finalDiscount.lines.some((l) => l.lineType === 'EXECUTION')).toBe(false);
      expect(finalDiscount.lines.some((l) => l.lineType === 'VENDOR')).toBe(false);
      expect(finalDiscount.itemType).toBe('DISCOUNT');
    });
  });
});
