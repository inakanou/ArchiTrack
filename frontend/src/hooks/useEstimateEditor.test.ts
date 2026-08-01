/**
 * @fileoverview useEstimateEditorフックのテスト
 *
 * Task 53.4: 編集フックの遷移関数への置き換え
 *
 * 差分記録方式（`pendingChanges: Map`）を廃止し、編集状態を
 * `estimateEditReducer` へ委譲した後の振る舞いを検証します。
 *
 * Requirements (estimate-creation):
 * - 12.1: 見積項目の追加は3行1セット（見積・実行・業者金額行）を作成する
 * - 12.2: 見積項目の表示順序をドラッグ&ドロップで変更可能とする
 * - 12.3: 見積項目の削除は3行1セット全体を削除する
 * - 12.5: 見積項目の複製は3行1セット全体を複製する
 * - 12.7: 行操作を編集セッション中にサーバーへ問い合わせずに行う
 * - 27.1: 名称・規格・単位・数量・単価・備考をクライアントサイドで即座に編集可能とする
 * - 27.2: 見積項目セクションの保存ボタンが押下時に呼ぶ操作（save）を提供する
 * - 42.7: 保存操作が成功した場合に未保存の変更がない状態へ戻す
 * - 54.1〜54.3: 別途工事・有効期限・提出日を見積書ごとに保持する
 * - 54.6: 別途工事・有効期限・提出日を編集する経路を提供する
 * - 54.8: 帳票用入力項目の変更を未保存の変更として扱う
 * - 1.5: 合計行に全見積項目の金額合計を自動計算して表示する
 * - 2.3: 子項目を持つ場合、親項目の金額を子項目の金額合計とする
 * - 41.2, 41.3, 41.6, 41.8, 41.11: 値引きプリセット行
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useEstimateEditor,
  type EstimateEditorSavePayload,
  type EstimateEditorSaveResult,
  type UseEstimateEditorOptions,
  type EstimateItemHierarchyEdit,
} from './useEstimateEditor';
import type { EditableItem } from '../domain/estimate/estimateEditReducer.types';

/** 保存ペイロードのツリーから ESTIMATE 行の名称を取り出す */
const estimateNameOf = (item: EditableItem): string | null =>
  item.lines.find((line) => line.lineType === 'ESTIMATE')?.name ?? null;

/** 保存ペイロードのツリーからキー（id または tempId）を取り出す */
const keyOf = (item: EditableItem): string => item.id ?? item.tempId ?? '';

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
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
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
      expect(result.current.isSaving).toBe(false);
      expect(result.current.lastError).toBeNull();
    });

    it('空の初期データでも正しく動作すること', () => {
      const { result } = renderHook(() => useEstimateEditor(defaultOptions));

      expect(result.current.items).toHaveLength(0);
      expect(result.current.isDirty).toBe(false);
    });

    it('提出日・有効期限・別途工事を状態として持ち初期値が未入力であること (54.1〜54.3)', () => {
      const { result } = renderHook(() => useEstimateEditor(defaultOptions));

      expect(result.current.reportFields).toEqual({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: [],
      });
    });
  });

  describe('updateLine - 行のフィールド更新（1.3, 1.4, 27.1）', () => {
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

    it('編集モード切替なしにセルを編集でき、未保存の変更として扱われること (27.1)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      expect(result.current.isDirty).toBe(false);

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '新しい名称');
      });

      expect(result.current.isDirty).toBe(true);
      expect(result.current.items[0]?.lines[0]?.name).toBe('新しい名称');
    });

    it('存在しない行を指定しても状態が変化しないこと', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.updateLine('item-1', '存在しない行', 'name', 'X');
      });

      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('addItem - 項目追加（12.1）', () => {
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

    it('新規項目が一時識別子を持ち、未保存の変更になること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addItem();
      });

      expect(result.current.items[2]?.id).toMatch(/^tmp-/);
      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('deleteItem - 項目削除（12.3, 43.6）', () => {
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

    it('新規追加した項目を削除するとツリーから取り除かれること', () => {
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

      // 追加した項目を削除
      act(() => {
        result.current.deleteItem(newItemId);
      });

      expect(result.current.items).toHaveLength(2);
      expect(result.current.items.some((item) => item.id === newItemId)).toBe(false);
    });

    it('存在しない項目を削除しても状態が変化しないこと', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.deleteItem('存在しない項目');
      });

      expect(result.current.items).toHaveLength(2);
      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('reorderItems - 項目並び替え（12.2）', () => {
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

    it('後方への移動では対象行の後ろへ挿入されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      // item-1をitem-2の位置へ移動（後方移動）
      act(() => {
        result.current.reorderItems('item-1', 'item-2');
      });

      expect(result.current.items[0]?.id).toBe('item-2');
      expect(result.current.items[1]?.id).toBe('item-1');
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

    /**
     * 旧実装ではドラッグによる並び替えが差分に本体（data）を持たず、
     * 保存経路で読み飛ばされて永続化されなかった（design.md `#### Modified Files`）。
     * 遷移関数へ委譲した後は並び順そのものが state であり、保存対象に含まれる。
     */
    it('並び替えが保存対象のツリーに反映されること (12.2)', async () => {
      const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>();
      onSave.mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
        })
      );

      act(() => {
        result.current.reorderItems('item-2', 'item-1');
      });

      expect(result.current.isDirty).toBe(true);

      await act(async () => {
        await result.current.save();
      });

      expect(onSave).toHaveBeenCalledTimes(1);
      const payload = onSave.mock.calls[0]![0];
      expect(payload.items.map(keyOf)).toEqual(['item-2', 'item-1']);
    });

    it('並び替えを行っても未保存のセル編集が保持されること (43.3)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '編集済み');
      });

      act(() => {
        result.current.reorderItems('item-2', 'item-1');
      });

      const moved = result.current.items.find((item) => item.id === 'item-1');
      expect(moved?.lines.find((l) => l.lineType === 'ESTIMATE')?.name).toBe('編集済み');
    });
  });

  describe('duplicateItem - 項目複製（12.5）', () => {
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

      // 複製は複製元の直後に配置される
      const duplicated = result.current.items[1];
      expect(duplicated?.lines).toHaveLength(3);
      expect(duplicated?.lines[0]?.name).toBe('項目1');
      expect(result.current.isDirty).toBe(true);
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

      const duplicated = result.current.items[1];
      expect(duplicated?.id).not.toBe('item-1');
      // 行のIDも新しくなっている
      duplicated?.lines.forEach((line) => {
        expect(line.id).not.toContain('line-1');
      });
    });
  });

  describe('階層金額の自動計算（2.3, 43.5）', () => {
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

    it('子項目の削除時に親項目の金額が再計算されること (43.5)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockHierarchyItems(),
        })
      );

      act(() => {
        result.current.deleteItem('child-2');
      });

      const parent = result.current.items[0];
      const parentEstimateLine = parent?.lines.find((l) => l.lineType === 'ESTIMATE');
      expect(parentEstimateLine?.amount).toBe('5000');
    });
  });

  describe('save - 一括保存', () => {
    it('変更がない場合は保存をスキップすること', async () => {
      const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>();
      onSave.mockResolvedValue(undefined);
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
      const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>();
      onSave.mockResolvedValue(undefined);
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

    it('保存成功後に未保存の変更がない状態へ戻ること (42.7)', async () => {
      const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>();
      onSave.mockResolvedValue(undefined);
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
      // 保存後も編集内容は画面に残る
      expect(result.current.items[0]?.lines[0]?.name).toBe('新しい名称');
    });

    it('保存中はisSavingがtrueになること', async () => {
      let resolvePromise: () => void;
      const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>();
      onSave.mockImplementation(
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
      const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>();
      onSave.mockRejectedValue(error);
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

    it('保存時に編集後のツリー全体と帳票用入力項目が渡されること (54.8)', async () => {
      const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>();
      onSave.mockResolvedValue(undefined);
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
      act(() => {
        result.current.deleteItem('item-2');
      });
      act(() => {
        result.current.updateReportFields({
          submissionDate: '2026-07-31',
          validityPeriod: '提出日より1ヶ月間',
          separateWorks: ['外構工事'],
        });
      });

      await act(async () => {
        await result.current.save();
      });

      const payload = onSave.mock.calls[0]![0];
      expect(payload.items.map(keyOf)).toEqual(['item-1']);
      expect(estimateNameOf(payload.items[0]!)).toBe('新しい名称');
      expect(payload.reportFields).toEqual({
        submissionDate: '2026-07-31',
        validityPeriod: '提出日より1ヶ月間',
        separateWorks: ['外構工事'],
      });
    });

    /**
     * 42.2: 保存操作が成功した場合、保存後の最新の明細内容を画面に反映する
     *
     * 一括保存の応答は採番済みの項目ID・明細行IDを含むため、送信内容ではなく
     * 応答で差し替えないと新規行が一時IDのまま残り、次の保存で二重作成される。
     */
    it('onSaveが返した最新ツリーで状態を差し替えること (42.2)', async () => {
      const onSave =
        vi.fn<(payload: EstimateEditorSavePayload) => Promise<EstimateEditorSaveResult>>();
      onSave.mockResolvedValue({
        items: [
          {
            id: 'server-assigned-1',
            estimateId: 'estimate-1',
            parentId: null,
            displayOrder: 0,
            lines: [
              {
                id: 'server-line-1',
                estimateItemId: 'server-assigned-1',
                lineType: 'ESTIMATE',
                name: 'サーバー確定名称',
                specification: null,
                unit: '式',
                quantity: '1',
                unitPrice: '5000',
                amount: '5000',
                remarks: null,
                sourceReceivedQuotationLineItemId: 'quotation-line-9',
                sourceVendorName: null,
              },
            ],
            children: [],
            createdAt: '2025-02-01T00:00:00.000Z',
            updatedAt: '2025-02-01T00:00:00.000Z',
          },
        ],
        reportFields: {
          submissionDate: '2026-07-31',
          validityPeriod: '提出日より1ヶ月間',
          separateWorks: ['外構工事'],
        },
      });

      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
        })
      );

      act(() => {
        result.current.addItem();
      });
      expect(result.current.isDirty).toBe(true);

      await act(async () => {
        await result.current.save();
      });

      expect(onSave).toHaveBeenCalledTimes(1);
      // 送信内容（3項目・一時ID入り）ではなく応答の1項目で差し替わる
      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0]?.id).toBe('server-assigned-1');
      expect(result.current.items[0]?.lines[0]?.name).toBe('サーバー確定名称');
      // 転記元行の参照も応答から取り込まれる
      expect(result.current.items[0]?.lines[0]?.sourceReceivedQuotationLineItemId).toBe(
        'quotation-line-9'
      );
      expect(result.current.reportFields).toEqual({
        submissionDate: '2026-07-31',
        validityPeriod: '提出日より1ヶ月間',
        separateWorks: ['外構工事'],
      });
      // 42.7: 未保存の変更がない状態へ戻る
      expect(result.current.isDirty).toBe(false);
    });

    /**
     * 42.2: 応答を差し替えた後の再保存では、応答由来の確定IDが送られる
     */
    it('応答反映後の再保存で一時IDではなく確定IDが送られること (42.2)', async () => {
      const onSave =
        vi.fn<(payload: EstimateEditorSavePayload) => Promise<EstimateEditorSaveResult>>();
      onSave.mockResolvedValue({
        items: [
          {
            id: 'server-assigned-1',
            estimateId: 'estimate-1',
            parentId: null,
            displayOrder: 0,
            lines: [
              {
                id: 'server-line-1',
                estimateItemId: 'server-assigned-1',
                lineType: 'ESTIMATE',
                name: 'サーバー確定名称',
                specification: null,
                unit: '式',
                quantity: '1',
                unitPrice: '5000',
                amount: '5000',
                remarks: null,
                sourceReceivedQuotationLineItemId: null,
                sourceVendorName: null,
              },
            ],
            children: [],
            createdAt: '2025-02-01T00:00:00.000Z',
            updatedAt: '2025-02-01T00:00:00.000Z',
          },
        ],
      });

      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: [],
          onSave,
        })
      );

      act(() => {
        result.current.addItem();
      });
      await act(async () => {
        await result.current.save();
      });

      act(() => {
        result.current.updateLine('server-assigned-1', 'server-line-1', 'name', '再編集');
      });
      await act(async () => {
        await result.current.save();
      });

      expect(onSave).toHaveBeenCalledTimes(2);
      const secondPayload = onSave.mock.calls[1]![0];
      expect(secondPayload.items).toHaveLength(1);
      expect(secondPayload.items[0]?.id).toBe('server-assigned-1');
      expect(secondPayload.items[0]?.tempId).toBeNull();
    });

    it('onSaveがvoidを返す場合は送信内容をそのまま確定済みとして扱うこと', async () => {
      const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>();
      onSave.mockResolvedValue(undefined);
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

      await act(async () => {
        await result.current.save();
      });

      expect(result.current.isDirty).toBe(false);
      expect(result.current.items[0]?.lines[0]?.name).toBe('新しい名称');
    });

    /**
     * 42.5: 競合（保存失敗）時に編集中の内容を失わせない
     */
    it('保存が失敗した場合に編集内容と未保存状態が保持されること (42.5)', async () => {
      const onSave =
        vi.fn<(payload: EstimateEditorSavePayload) => Promise<EstimateEditorSaveResult>>();
      onSave.mockRejectedValue(new Error('conflict'));
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
        })
      );

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '編集済み名称');
      });

      await act(async () => {
        await result.current.save();
      });

      expect(result.current.items[0]?.lines[0]?.name).toBe('編集済み名称');
      expect(result.current.isDirty).toBe(true);
      expect(result.current.isSaving).toBe(false);
    });

    it('onSave未指定の場合は保存されず未保存状態が維持されること', async () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '新しい名称');
      });

      await act(async () => {
        await result.current.save();
      });

      expect(result.current.isDirty).toBe(true);
      expect(result.current.isSaving).toBe(false);
    });

    it('連続した編集の最新値が保存対象に含まれること', async () => {
      const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>();
      onSave.mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
        })
      );

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '変更後名称A');
      });
      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'unitPrice', '2000');
      });

      await act(async () => {
        await result.current.save();
      });

      const payload = onSave.mock.calls[0]![0];
      const line = payload.items[0]!.lines.find((l) => l.lineType === 'ESTIMATE');
      expect(line?.name).toBe('変更後名称A');
      expect(line?.unitPrice).toBe('2000');
      // 金額も自動計算されていること (10 * 2000 = 20000)
      expect(line?.amount).toBe('20000');
    });

    it('追加・削除・更新を含む編集内容が1つのツリーとして渡されること', async () => {
      const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>();
      onSave.mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
        })
      );

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '変更後');
      });
      act(() => {
        result.current.addItem();
      });
      act(() => {
        result.current.deleteItem('item-2');
      });

      await act(async () => {
        await result.current.save();
      });

      const payload = onSave.mock.calls[0]![0];
      expect(payload.items).toHaveLength(2);
      // 更新: 既存IDのまま最新値を持つ
      expect(payload.items[0]!.id).toBe('item-1');
      expect(estimateNameOf(payload.items[0]!)).toBe('変更後');
      // 追加: 一時識別子を持ち id は null
      expect(payload.items[1]!.id).toBeNull();
      expect(payload.items[1]!.tempId).toMatch(/^tmp-/);
      // 削除: ツリーから消えている
      expect(payload.items.some((item) => item.id === 'item-2')).toBe(false);
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
      });
      act(() => {
        result.current.addItem();
      });

      expect(result.current.isDirty).toBe(true);
      expect(result.current.items).toHaveLength(3);

      act(() => {
        result.current.discard();
      });

      expect(result.current.isDirty).toBe(false);
      expect(result.current.items).toHaveLength(2);
      expect(result.current.items[0]?.lines[0]?.name).toBe('項目1');
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
    });

    it('外部設定後の項目が破棄の基準になること', () => {
      const { result } = renderHook(() => useEstimateEditor(defaultOptions));

      act(() => {
        result.current.setItems(createMockItems());
      });
      act(() => {
        result.current.deleteItem('item-1');
      });

      expect(result.current.items).toHaveLength(1);

      act(() => {
        result.current.discard();
      });

      expect(result.current.items).toHaveLength(2);
      expect(result.current.isDirty).toBe(false);
    });
  });

  // 折りたたみ状態は表示状態であり、単一の所有者は `useEstimateNavigation`（Task 54.2）。
  // 本フックが再び表示状態を持つと俯瞰パネル（54.5）と明細テーブルの表示が食い違う。
  describe('表示状態を保持しないこと（design.md「状態には保存対象のみを保持する」）', () => {
    it('編集用ビューモデルが展開状態（isExpanded）を持たないこと', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockHierarchyItems(),
        })
      );

      expect(result.current.items[0]).not.toHaveProperty('isExpanded');
    });

    it('展開/折りたたみの操作（toggleExpanded）を公開しないこと', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockHierarchyItems(),
        })
      );

      expect(result.current).not.toHaveProperty('toggleExpanded');
    });
  });

  describe('getTotalAmount - 合計金額取得（1.5）', () => {
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

  describe('updateReportFields - 帳票用入力項目（54.6, 54.8）', () => {
    it('提出日・有効期限・別途工事を編集できること (54.6)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.updateReportFields({
          submissionDate: '2026-07-31',
          validityPeriod: '提出日より1ヶ月間',
          separateWorks: ['外構工事', '電気設備工事'],
        });
      });

      expect(result.current.reportFields).toEqual({
        submissionDate: '2026-07-31',
        validityPeriod: '提出日より1ヶ月間',
        separateWorks: ['外構工事', '電気設備工事'],
      });
    });

    it('帳票用入力項目の編集が未保存の変更として扱われること (54.8)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      expect(result.current.isDirty).toBe(false);

      act(() => {
        result.current.updateReportFields({
          submissionDate: '2026-07-31',
          validityPeriod: null,
          separateWorks: [],
        });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('明細の編集と帳票用入力項目の編集が同一の状態に含まれること (54.8)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.updateLine('item-1', 'line-1-estimate', 'name', '編集済み');
      });
      act(() => {
        result.current.updateReportFields({
          submissionDate: '2026-07-31',
          validityPeriod: null,
          separateWorks: [],
        });
      });

      expect(result.current.editState.items[0]?.lines[0]?.name).toBe('編集済み');
      expect(result.current.editState.reportFields.submissionDate).toBe('2026-07-31');
      expect(result.current.editState.isDirty).toBe(true);
    });
  });

  describe('行操作のローカル完結（12.7）', () => {
    it('行操作とセル編集でサーバーへのリクエストが発生しないこと (12.7)', () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      try {
        const { result } = renderHook(() =>
          useEstimateEditor({
            ...defaultOptions,
            initialItems: createMockItems(),
          })
        );

        act(() => {
          result.current.updateLine('item-1', 'line-1-estimate', 'quantity', '3');
        });
        act(() => {
          result.current.addItem();
        });
        act(() => {
          result.current.duplicateItem('item-1');
        });
        act(() => {
          result.current.reorderItems('item-2', 'item-1');
        });
        act(() => {
          result.current.deleteItem('item-2');
        });
        act(() => {
          result.current.addDiscountItem();
        });

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.current.isDirty).toBe(true);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  /**
   * ツールバーの「上の階層へ移動」「下の階層へ移動」「↑」「↓」が使う遷移関数。
   * 53.6 でページ側の移動API・並び替えAPIの即時呼び出しを置き換えるために公開した。
   *
   * 範囲選択UIは 54.10 のため、ここでは単一行の指示のみを扱う。
   * `indentRange` / `outdentRange` は `keys` を表示順（先行順）で受け取る契約だが
   * （design.md `##### estimateEditReducer` の Preconditions）、要素が1つのため自明に満たされる。
   */
  describe('moveItem / indentItem / outdentItem - 階層移動と並び替え（23.9, 23.10, 43.1）', () => {
    it('moveItemが同一階層内で順序を入れ替えること (43.1)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.moveItem('item-2', 'up');
      });

      expect(result.current.items.map((item) => item.id)).toEqual(['item-2', 'item-1']);
      expect(result.current.isDirty).toBe(true);

      act(() => {
        result.current.moveItem('item-2', 'down');
      });

      expect(result.current.items.map((item) => item.id)).toEqual(['item-1', 'item-2']);
    });

    it('indentItemが直前の兄弟の子へ移すこと (23.10, 43.1)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.indentItem('item-2');
      });

      expect(result.current.items.map((item) => item.id)).toEqual(['item-1']);
      expect(result.current.items[0]?.children.map((child) => child.id)).toEqual(['item-2']);
      expect(result.current.items[0]?.children[0]?.parentId).toBe('item-1');
      expect(result.current.lastError).toBeNull();
    });

    it('outdentItemが親の兄弟レベルへ戻すこと (23.9, 43.1)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.indentItem('item-2');
      });
      act(() => {
        result.current.outdentItem('item-2');
      });

      expect(result.current.items.map((item) => item.id)).toEqual(['item-1', 'item-2']);
      expect(result.current.items[1]?.parentId).toBeNull();
      expect(result.current.lastError).toBeNull();
    });

    it('直前の兄弟が無い行のindentItemは状態を変えず理由を残すこと', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.indentItem('item-1');
      });

      expect(result.current.items.map((item) => item.id)).toEqual(['item-1', 'item-2']);
      expect(result.current.lastError?.kind).toBe('NO_PRECEDING_SIBLING');
    });

    it('ルート行のoutdentItemは状態を変えず理由を残すこと', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.outdentItem('item-1');
      });

      expect(result.current.items.map((item) => item.id)).toEqual(['item-1', 'item-2']);
      expect(result.current.lastError?.kind).toBe('CANNOT_OUTDENT_ROOT');
    });

    it('階層移動と並び替えを連続で行ってもサーバーへのリクエストが発生しないこと (12.7, 43.2)', () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      try {
        const { result } = renderHook(() =>
          useEstimateEditor({
            ...defaultOptions,
            initialItems: createMockItems(),
          })
        );

        act(() => {
          result.current.indentItem('item-2');
        });
        act(() => {
          result.current.outdentItem('item-2');
        });
        act(() => {
          result.current.moveItem('item-2', 'up');
        });
        act(() => {
          result.current.moveItem('item-2', 'down');
        });

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.current.items.map((item) => item.id)).toEqual(['item-1', 'item-2']);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('lastError - 操作が無効だった理由の保持', () => {
    it('値引き行を親に指定した追加が拒否され理由が得られること (41.3)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addDiscountItem();
      });
      const discountId = result.current.items[2]!.id;

      act(() => {
        result.current.addItem(discountId);
      });

      expect(result.current.items).toHaveLength(3);
      expect(result.current.lastError).toEqual({
        kind: 'INVALID_PARENT_TYPE',
        key: discountId,
        itemType: 'DISCOUNT',
      });
    });

    it('変化の無い操作では直前のエラーが保持されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addDiscountItem();
      });
      const discountId = result.current.items[2]!.id;
      act(() => {
        result.current.addItem(discountId);
      });
      expect(result.current.lastError?.kind).toBe('INVALID_PARENT_TYPE');

      // 存在しない項目への削除指示（無害な no-op）
      act(() => {
        result.current.deleteItem('存在しない項目');
      });

      expect(result.current.lastError?.kind).toBe('INVALID_PARENT_TYPE');
    });

    it('変更が成立した操作でエラーが解除されること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addDiscountItem();
      });
      const discountId = result.current.items[2]!.id;
      act(() => {
        result.current.addItem(discountId);
      });
      expect(result.current.lastError?.kind).toBe('INVALID_PARENT_TYPE');

      act(() => {
        result.current.addItem();
      });

      expect(result.current.lastError).toBeNull();
    });

    it('dismissErrorで明示的に解除できること', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addDiscountItem();
      });
      const discountId = result.current.items[2]!.id;
      act(() => {
        result.current.addItem(discountId);
      });
      expect(result.current.lastError?.kind).toBe('INVALID_PARENT_TYPE');

      act(() => {
        result.current.dismissError();
      });

      expect(result.current.lastError).toBeNull();
    });
  });

  describe('addDiscountItem - 値引き行追加（41.2, 41.3, 41.6, 41.8, 41.11）', () => {
    it('ルート末尾にitemType=DISCOUNT・ESTIMATE1行のみ・プリセット値の項目が追加されること (41.2, 41.3)', () => {
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

    it('値引き行の追加が未保存の変更として扱われ、保存対象に含まれること (41.11)', async () => {
      const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>();
      onSave.mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
        })
      );

      act(() => {
        result.current.addDiscountItem();
      });

      expect(result.current.isDirty).toBe(true);

      await act(async () => {
        await result.current.save();
      });

      const payload = onSave.mock.calls[0]![0];
      const discount = payload.items[2]!;
      expect(discount.itemType).toBe('DISCOUNT');
      expect(discount.lines).toHaveLength(1);
      expect(discount.lines[0]!.lineType).toBe('ESTIMATE');
    });

    it('値引き行の単価を負数に更新すると金額が負数になり、getTotalAmountが減算されること (41.6, 41.8)', () => {
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

    it('値引き行はupdateLine・階層再計算を経てもEXECUTION/VENDOR行が再合成されないこと (41.3 不変条件)', () => {
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

      // 単価更新（親集計の再計算を経由するstate更新を誘発）
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

  describe('addNoteItem - 注記行追加（55.1, 55.2, 55.3, 55.6）', () => {
    /** 名称のみを持つ注記行（金額を持ってしまっている異常データを含む）を作る */
    const createNoteHierarchyItem = (
      id: string,
      name: string,
      amount: string | null = null
    ): EstimateItemHierarchyEdit => ({
      id,
      estimateId: 'estimate-1',
      parentId: null,
      displayOrder: 0,
      itemType: 'NOTE',
      lines: [
        {
          id: `line-${id}-estimate`,
          estimateItemId: id,
          lineType: 'ESTIMATE',
          name,
          specification: null,
          unit: null,
          quantity: null,
          unitPrice: null,
          amount,
          remarks: null,
        },
      ],
      children: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });

    it('位置未指定でルート末尾にitemType=NOTE・ESTIMATE1行のみ・名称以外NULLの項目が追加されること (55.1)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addNoteItem();
      });

      expect(result.current.items).toHaveLength(3);
      const noteItem = result.current.items[2]!;

      expect(noteItem.itemType).toBe('NOTE');
      expect(noteItem.parentId).toBeNull();
      expect(noteItem.children).toHaveLength(0);
      expect(noteItem.lines).toHaveLength(1);

      const line = noteItem.lines[0]!;
      expect(line.lineType).toBe('ESTIMATE');
      // 名称のみを持つ（初期値は空欄）。他の欄はすべてNULL
      expect(line.name).toBeNull();
      expect(line.specification).toBeNull();
      expect(line.unit).toBeNull();
      expect(line.quantity).toBeNull();
      expect(line.unitPrice).toBeNull();
      expect(line.amount).toBeNull();
      expect(line.remarks).toBeNull();
    });

    it('parentId・afterId指定で任意の階層の任意の位置へ挿入されること (55.3)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockHierarchyItems(),
        })
      );

      // parent-1 の子（child-1 と child-2 の間）へ挿入する
      act(() => {
        result.current.addNoteItem({ parentId: 'parent-1', afterId: 'child-1' });
      });

      const parent = result.current.items[0]!;
      expect(parent.children).toHaveLength(3);
      expect(parent.children.map((child) => child.id)[0]).toBe('child-1');
      expect(parent.children[1]!.itemType).toBe('NOTE');
      expect(parent.children[2]!.id).toBe('child-2');
      // 親IDと表示順が挿入位置に合わせて解決されること
      expect(parent.children[1]!.parentId).toBe('parent-1');
      expect(parent.children[1]!.displayOrder).toBe(1);
    });

    it('ルート内の任意の位置（先頭項目の直後）へ挿入できること (55.3)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addNoteItem({ afterId: 'item-1' });
      });

      expect(result.current.items.map((item) => item.id)[0]).toBe('item-1');
      expect(result.current.items[1]!.itemType).toBe('NOTE');
      expect(result.current.items[2]!.id).toBe('item-2');
    });

    it('注記行を親項目の集計対象から除外すること (55.2)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockHierarchyItems(),
        })
      );

      // 子の合計 5000 + 3000 = 8000
      const beforeAmount = result.current.items[0]!.lines.find(
        (line) => line.lineType === 'ESTIMATE'
      )!.amount;
      expect(beforeAmount).toBe('8000');

      act(() => {
        result.current.addNoteItem({ parentId: 'parent-1' });
      });

      const afterAmount = result.current.items[0]!.lines.find(
        (line) => line.lineType === 'ESTIMATE'
      )!.amount;
      // 注記行を足しても親の集計は変わらない
      expect(afterAmount).toBe('8000');
      expect(result.current.getTotalAmount()).toBe('8000');
    });

    it('ルートレベルの注記行が金額を持っていても合計金額に加算されないこと (55.2)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          // 注記行が金額を持つ異常データでも集計対象外であること
          initialItems: [...createMockItems(), createNoteHierarchyItem('note-1', '注記', '5000')],
        })
      );

      // item-1(10000) + item-2(10000) のみ。注記行の 5000 は加算しない
      expect(result.current.getTotalAmount()).toBe('20000');
    });

    it('注記行の追加が未保存の変更として扱われ、保存対象に含まれること (55.1)', async () => {
      const onSave = vi.fn<(payload: EstimateEditorSavePayload) => Promise<void>>();
      onSave.mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
          onSave,
        })
      );

      act(() => {
        result.current.addNoteItem();
      });

      expect(result.current.isDirty).toBe(true);

      await act(async () => {
        await result.current.save();
      });

      const payload = onSave.mock.calls[0]![0];
      const note = payload.items[2]!;
      expect(note.itemType).toBe('NOTE');
      expect(note.id).toBeNull();
      expect(note.tempId).not.toBeNull();
      expect(note.lines).toHaveLength(1);
      expect(note.lines[0]!.lineType).toBe('ESTIMATE');
    });

    it('注記行が削除の対象となること (55.6)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addNoteItem();
      });
      const noteId = result.current.items[2]!.id;

      act(() => {
        result.current.deleteItem(noteId);
      });

      expect(result.current.items).toHaveLength(2);
      expect(result.current.items.some((item) => item.itemType === 'NOTE')).toBe(false);
    });

    it('注記行が複写の対象となること (55.6)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addNoteItem();
      });
      const noteItem = result.current.items[2]!;
      act(() => {
        result.current.updateLine(noteItem.id, noteItem.lines[0]!.id, 'name', '※支給材は別途');
      });

      act(() => {
        result.current.duplicateItem(result.current.items[2]!.id);
      });

      expect(result.current.items).toHaveLength(4);
      const copy = result.current.items[3]!;
      expect(copy.itemType).toBe('NOTE');
      expect(copy.lines).toHaveLength(1);
      expect(copy.lines[0]!.name).toBe('※支給材は別途');
    });

    it('注記行が同一階層内の並び替えの対象となること (55.6)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addNoteItem();
      });
      const noteId = result.current.items[2]!.id;

      act(() => {
        result.current.moveItem(noteId, 'up');
      });

      expect(result.current.items.map((item) => item.id)).toEqual(['item-1', noteId, 'item-2']);
    });

    it('注記行が階層移動の対象となること (55.6)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addNoteItem();
      });
      const noteId = result.current.items[2]!.id;

      // 直前の兄弟（item-2）の子へ下げる
      act(() => {
        result.current.indentItem(noteId);
      });

      expect(result.current.lastError).toBeNull();
      expect(result.current.items).toHaveLength(2);
      expect(result.current.items[1]!.children.map((child) => child.id)).toEqual([noteId]);

      // ルートレベルへ戻す
      act(() => {
        result.current.outdentItem(noteId);
      });

      expect(result.current.lastError).toBeNull();
      expect(result.current.items.map((item) => item.id)).toEqual(['item-1', 'item-2', noteId]);
    });

    it('注記行を親に指定した挿入は拒否され、INVALID_PARENT_TYPEを設定すること (55.1 不変条件)', () => {
      const { result } = renderHook(() =>
        useEstimateEditor({
          ...defaultOptions,
          initialItems: createMockItems(),
        })
      );

      act(() => {
        result.current.addNoteItem();
      });
      const noteId = result.current.items[2]!.id;

      act(() => {
        result.current.addNoteItem({ parentId: noteId });
      });

      expect(result.current.items).toHaveLength(3);
      expect(result.current.items[2]!.children).toHaveLength(0);
      expect(result.current.lastError).toEqual({
        kind: 'INVALID_PARENT_TYPE',
        key: noteId,
        itemType: 'NOTE',
      });
    });
  });
});
