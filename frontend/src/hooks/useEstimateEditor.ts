/**
 * @fileoverview useEstimateEditorフック - 見積書編集状態管理
 *
 * Task 8.1: useEstimateEditorフックの実装
 *
 * 見積書編集画面での状態管理を担当します。
 * ローカル操作はAPI呼び出しなしで実行し、保存時にバッチ処理で一括送信します。
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
 *
 * @module hooks/useEstimateEditor
 */

import { useState, useCallback, useRef } from 'react';
import { EstimateCalculator } from '../utils/estimate-calculation';
import Decimal from 'decimal.js';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 見積項目行タイプ
 */
export type EstimateItemLineType = 'ESTIMATE' | 'EXECUTION' | 'VENDOR';

/**
 * 見積項目行（編集用）
 */
export interface EstimateItemLineEdit {
  id: string;
  estimateItemId: string;
  lineType: EstimateItemLineType;
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
  remarks: string | null;
  sourceReceivedQuotationLineItemId?: string | null;
  sourceVendorName?: string | null;
}

/**
 * 見積項目（階層構造、編集用）
 */
export interface EstimateItemHierarchyEdit {
  id: string;
  estimateId: string;
  parentId: string | null;
  displayOrder: number;
  lines: EstimateItemLineEdit[];
  children: EstimateItemHierarchyEdit[];
  isExpanded: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 変更タイプ
 */
export type ItemChangeType = 'add' | 'update' | 'delete';

/**
 * 変更差分
 */
export interface ItemChange {
  type: ItemChangeType;
  itemId: string;
  data?: EstimateItemHierarchyEdit;
}

/**
 * useEstimateEditorフックのオプション
 */
export interface UseEstimateEditorOptions {
  /**
   * 見積書ID
   */
  estimateId: string;

  /**
   * 初期の見積項目データ
   */
  initialItems: EstimateItemHierarchyEdit[];

  /**
   * 保存処理（変更差分を受け取って保存）
   */
  onSave?: (changes: Map<string, ItemChange>) => Promise<void>;

  /**
   * 保存成功時のコールバック
   */
  onSaveSuccess?: () => void;

  /**
   * 保存エラー時のコールバック
   */
  onSaveError?: (error: Error) => void;
}

/**
 * useEstimateEditorフックの戻り値
 */
export interface UseEstimateEditorResult {
  /**
   * 見積項目一覧
   */
  items: EstimateItemHierarchyEdit[];

  /**
   * 未保存の変更があるか
   */
  isDirty: boolean;

  /**
   * 変更差分
   */
  pendingChanges: Map<string, ItemChange>;

  /**
   * 保存中かどうか
   */
  isSaving: boolean;

  /**
   * 行のフィールドを更新（ローカル操作）
   */
  updateLine: (
    itemId: string,
    lineId: string,
    field: keyof EstimateItemLineEdit,
    value: string | null
  ) => void;

  /**
   * 項目を並び替え（ローカル操作）
   */
  reorderItems: (sourceId: string, targetId: string) => void;

  /**
   * 項目を追加（ローカル操作）
   */
  addItem: (parentId?: string) => void;

  /**
   * 項目を削除（ローカル操作）
   */
  deleteItem: (itemId: string) => void;

  /**
   * 項目を複製（ローカル操作）
   */
  duplicateItem: (itemId: string) => void;

  /**
   * 変更を保存（バッチ処理）
   */
  save: () => Promise<void>;

  /**
   * 変更を破棄
   */
  discard: () => void;

  /**
   * 項目を外部から設定
   */
  setItems: (items: EstimateItemHierarchyEdit[]) => void;

  /**
   * 展開/折りたたみを切り替え
   */
  toggleExpanded: (itemId: string) => void;

  /**
   * 合計金額を取得
   */
  getTotalAmount: () => string;
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * ユニークIDを生成
 */
const generateId = (): string => {
  return `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * 新しい見積項目を作成
 */
const createNewItem = (
  estimateId: string,
  parentId: string | null,
  displayOrder: number
): EstimateItemHierarchyEdit => {
  const itemId = generateId();
  const now = new Date().toISOString();

  return {
    id: itemId,
    estimateId,
    parentId,
    displayOrder,
    lines: [
      {
        id: generateId(),
        estimateItemId: itemId,
        lineType: 'ESTIMATE',
        name: null,
        specification: null,
        unit: null,
        quantity: null,
        unitPrice: null,
        amount: null,
        remarks: null,
      },
      {
        id: generateId(),
        estimateItemId: itemId,
        lineType: 'EXECUTION',
        name: null,
        specification: null,
        unit: null,
        quantity: null,
        unitPrice: null,
        amount: null,
        remarks: null,
      },
      {
        id: generateId(),
        estimateItemId: itemId,
        lineType: 'VENDOR',
        name: null,
        specification: null,
        unit: null,
        quantity: null,
        unitPrice: null,
        amount: null,
        remarks: null,
      },
    ],
    children: [],
    isExpanded: true,
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * 項目を複製
 */
const duplicateItemData = (
  item: EstimateItemHierarchyEdit,
  newParentId: string | null = null
): EstimateItemHierarchyEdit => {
  const newItemId = generateId();
  const now = new Date().toISOString();

  return {
    ...item,
    id: newItemId,
    parentId: newParentId ?? item.parentId,
    lines: item.lines.map((line) => ({
      ...line,
      id: generateId(),
      estimateItemId: newItemId,
    })),
    children: item.children.map((child) => duplicateItemData(child, newItemId)),
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * 階層構造から項目を検索
 */
const findItemById = (
  items: EstimateItemHierarchyEdit[],
  itemId: string
): EstimateItemHierarchyEdit | null => {
  for (const item of items) {
    if (item.id === itemId) {
      return item;
    }
    if (item.children.length > 0) {
      const found = findItemById(item.children, itemId);
      if (found) return found;
    }
  }
  return null;
};

/**
 * 階層構造の項目を更新
 */
const updateItemInHierarchy = (
  items: EstimateItemHierarchyEdit[],
  itemId: string,
  updater: (item: EstimateItemHierarchyEdit) => EstimateItemHierarchyEdit
): EstimateItemHierarchyEdit[] => {
  return items.map((item) => {
    if (item.id === itemId) {
      return updater(item);
    }
    if (item.children.length > 0) {
      return {
        ...item,
        children: updateItemInHierarchy(item.children, itemId, updater),
      };
    }
    return item;
  });
};

/**
 * 階層構造から項目を削除
 */
const removeItemFromHierarchy = (
  items: EstimateItemHierarchyEdit[],
  itemId: string
): EstimateItemHierarchyEdit[] => {
  return items
    .filter((item) => item.id !== itemId)
    .map((item) => ({
      ...item,
      children: removeItemFromHierarchy(item.children, itemId),
    }));
};

/**
 * 親項目の金額を再計算（子項目の合計）
 */
const recalculateParentAmounts = (
  items: EstimateItemHierarchyEdit[]
): EstimateItemHierarchyEdit[] => {
  return items.map((item) => {
    // 先に子項目を再帰的に処理
    const processedChildren = recalculateParentAmounts(item.children);

    // 子項目がある場合、親の金額は子項目の合計
    if (processedChildren.length > 0) {
      // 各行タイプごとに合計を計算
      const lineTypes: EstimateItemLineType[] = ['ESTIMATE', 'EXECUTION', 'VENDOR'];

      const updatedLines = item.lines.map((line) => {
        if (!lineTypes.includes(line.lineType)) {
          return line;
        }

        // 同じ行タイプの子項目の金額を合計
        const childAmounts = processedChildren
          .map((child) => {
            const childLine = child.lines.find((l) => l.lineType === line.lineType);
            if (childLine?.amount) {
              try {
                return new Decimal(childLine.amount);
              } catch {
                return null;
              }
            }
            return null;
          })
          .filter((amount): amount is Decimal => amount !== null);

        const totalAmount = childAmounts.reduce((sum, amount) => sum.add(amount), new Decimal(0));

        return {
          ...line,
          amount: totalAmount.toString(),
        };
      });

      return {
        ...item,
        lines: updatedLines,
        children: processedChildren,
      };
    }

    return {
      ...item,
      children: processedChildren,
    };
  });
};

/**
 * 削除された項目のすべての子IDを取得
 */
const getAllChildIds = (item: EstimateItemHierarchyEdit): string[] => {
  const ids: string[] = [];
  for (const child of item.children) {
    ids.push(child.id);
    ids.push(...getAllChildIds(child));
  }
  return ids;
};

// ============================================================================
// useEstimateEditor フック
// ============================================================================

/**
 * 見積書編集状態管理フック
 *
 * @example
 * ```tsx
 * function EstimateEditor() {
 *   const {
 *     items,
 *     isDirty,
 *     updateLine,
 *     addItem,
 *     deleteItem,
 *     save,
 *     discard,
 *   } = useEstimateEditor({
 *     estimateId: 'est-001',
 *     initialItems: [],
 *     onSave: async (changes) => {
 *       await api.batchUpdate(changes);
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       {items.map((item) => (
 *         <EstimateItemRow key={item.id} item={item} onUpdate={updateLine} />
 *       ))}
 *       <button onClick={addItem}>追加</button>
 *       <button onClick={save} disabled={!isDirty}>保存</button>
 *       <button onClick={discard} disabled={!isDirty}>破棄</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useEstimateEditor(options: UseEstimateEditorOptions): UseEstimateEditorResult {
  const { estimateId, initialItems, onSave, onSaveSuccess, onSaveError } = options;

  // 初期データの親項目金額を計算
  const processedInitialItems = recalculateParentAmounts(initialItems);

  // 状態
  const [items, setItems] = useState<EstimateItemHierarchyEdit[]>(processedInitialItems);
  const [pendingChanges, setPendingChanges] = useState<Map<string, ItemChange>>(new Map());
  const [isSaving, setIsSaving] = useState(false);

  // 初期データの参照を保持（破棄時に使用）
  const initialItemsRef = useRef<EstimateItemHierarchyEdit[]>(processedInitialItems);

  // isDirtyは変更差分の有無で判定
  const isDirty = pendingChanges.size > 0;

  /**
   * 変更差分を記録
   */
  const recordChange = useCallback(
    (itemId: string, type: ItemChangeType, data?: EstimateItemHierarchyEdit) => {
      setPendingChanges((prev) => {
        const newChanges = new Map(prev);
        const existingChange = newChanges.get(itemId);

        // 新規追加した項目を削除する場合は、変更差分から完全に削除
        if (type === 'delete' && existingChange?.type === 'add') {
          newChanges.delete(itemId);
          return newChanges;
        }

        // 既存の変更がある場合、タイプを適切に更新
        if (existingChange) {
          // addの後のupdateはaddのまま
          if (existingChange.type === 'add' && type === 'update') {
            newChanges.set(itemId, { type: 'add', itemId, data });
            return newChanges;
          }
        }

        newChanges.set(itemId, { type, itemId, data });
        return newChanges;
      });
    },
    []
  );

  /**
   * 行のフィールドを更新（REQ-1.3, REQ-1.4, REQ-34.3）
   */
  const updateLine = useCallback(
    (
      itemId: string,
      lineId: string,
      field: keyof EstimateItemLineEdit,
      value: string | null
    ): void => {
      setItems((prevItems) => {
        const updatedItems = updateItemInHierarchy(prevItems, itemId, (item) => {
          const updatedLines = item.lines.map((line) => {
            if (line.id !== lineId) return line;

            const updatedLine = { ...line, [field]: value };

            // 数量または単価が変更された場合、金額を自動計算
            if (field === 'quantity' || field === 'unitPrice') {
              const quantity = field === 'quantity' ? value : line.quantity;
              const unitPrice = field === 'unitPrice' ? value : line.unitPrice;
              const calculatedAmount = EstimateCalculator.calculateAmount(quantity, unitPrice);
              updatedLine.amount = calculatedAmount?.toString() ?? null;
            }

            return updatedLine;
          });

          return {
            ...item,
            lines: updatedLines,
            updatedAt: new Date().toISOString(),
          };
        });

        // 親項目の金額を再計算（REQ-2.3）
        const recalculatedItems = recalculateParentAmounts(updatedItems);

        // 変更を記録（recalculatedItemsから最新データを取得してステールデータを回避）
        const updatedItem = findItemById(recalculatedItems, itemId);
        if (updatedItem) {
          recordChange(itemId, 'update', updatedItem);
        }

        return recalculatedItems;
      });
    },
    [recordChange]
  );

  /**
   * 項目を追加（REQ-12.1）
   */
  const addItem = useCallback(
    (parentId?: string): void => {
      setItems((prevItems) => {
        if (parentId) {
          // 子項目として追加
          return updateItemInHierarchy(prevItems, parentId, (parent) => {
            const newDisplayOrder = parent.children.length;
            const newItem = createNewItem(estimateId, parentId, newDisplayOrder);

            // 新規追加を記録
            recordChange(newItem.id, 'add', newItem);

            return {
              ...parent,
              children: [...parent.children, newItem],
            };
          });
        }

        // ルートレベルに追加
        const newDisplayOrder = prevItems.length;
        const newItem = createNewItem(estimateId, null, newDisplayOrder);

        // 新規追加を記録
        recordChange(newItem.id, 'add', newItem);

        return [...prevItems, newItem];
      });
    },
    [estimateId, recordChange]
  );

  /**
   * 項目を削除（REQ-12.3）
   */
  const deleteItem = useCallback(
    (itemId: string): void => {
      const itemToDelete = findItemById(items, itemId);
      if (!itemToDelete) return;

      setItems((prevItems) => {
        return removeItemFromHierarchy(prevItems, itemId);
      });

      // 変更を記録（子項目も含めて削除）
      const childIds = getAllChildIds(itemToDelete);
      recordChange(itemId, 'delete');
      for (const childId of childIds) {
        recordChange(childId, 'delete');
      }
    },
    [items, recordChange]
  );

  /**
   * 項目を複製（REQ-12.5）
   */
  const duplicateItem = useCallback(
    (itemId: string): void => {
      const itemToDuplicate = findItemById(items, itemId);
      if (!itemToDuplicate) return;

      // 複製を一度だけ作成（同じインスタンスを使用）
      const duplicated = duplicateItemData(itemToDuplicate);

      setItems((prevItems) => {
        if (itemToDuplicate.parentId) {
          // 子項目の複製 - 同じ親の子として追加
          return updateItemInHierarchy(prevItems, itemToDuplicate.parentId, (parent) => {
            const newChildren = [...parent.children, duplicated];
            // displayOrderを更新
            return {
              ...parent,
              children: newChildren.map((child, idx) => ({
                ...child,
                displayOrder: idx,
              })),
            };
          });
        }

        // ルートレベルの複製
        const newItems = [...prevItems, duplicated];
        // displayOrderを更新
        return newItems.map((item, idx) => ({
          ...item,
          displayOrder: idx,
        }));
      });

      // 複製した項目を記録（同じインスタンスを使用）
      recordChange(duplicated.id, 'add', duplicated);
    },
    [items, recordChange]
  );

  /**
   * 項目を並び替え（REQ-12.2）
   */
  const reorderItems = useCallback(
    (sourceId: string, targetId: string): void => {
      setItems((prevItems) => {
        // フラットなリストに変換（ルートレベルのみ対応、子項目の並び替えは別途実装）
        const sourceIndex = prevItems.findIndex((item) => item.id === sourceId);
        const targetIndex = prevItems.findIndex((item) => item.id === targetId);

        if (sourceIndex === -1 || targetIndex === -1) return prevItems;

        const newItems = [...prevItems];
        const [removed] = newItems.splice(sourceIndex, 1);
        newItems.splice(targetIndex, 0, removed!);

        // displayOrderを更新
        return newItems.map((item, idx) => ({
          ...item,
          displayOrder: idx,
        }));
      });

      // 両方の項目に変更を記録
      recordChange(sourceId, 'update');
      recordChange(targetId, 'update');
    },
    [recordChange]
  );

  /**
   * 変更を保存
   */
  const save = useCallback(async (): Promise<void> => {
    // 変更がない場合はスキップ
    if (pendingChanges.size === 0) {
      return;
    }

    setIsSaving(true);

    try {
      if (onSave) {
        await onSave(pendingChanges);
      }

      // 保存成功時に変更差分をクリア
      setPendingChanges(new Map());
      // 初期データを更新
      initialItemsRef.current = items;

      if (onSaveSuccess) {
        onSaveSuccess();
      }
    } catch (error) {
      if (onSaveError && error instanceof Error) {
        onSaveError(error);
      }
    } finally {
      setIsSaving(false);
    }
  }, [pendingChanges, items, onSave, onSaveSuccess, onSaveError]);

  /**
   * 変更を破棄
   */
  const discard = useCallback((): void => {
    setItems(initialItemsRef.current);
    setPendingChanges(new Map());
  }, []);

  /**
   * 外部から項目を設定
   */
  const setItemsExternal = useCallback((newItems: EstimateItemHierarchyEdit[]): void => {
    setItems(newItems);
    initialItemsRef.current = newItems;
    setPendingChanges(new Map());
  }, []);

  /**
   * 展開/折りたたみを切り替え
   */
  const toggleExpanded = useCallback((itemId: string): void => {
    setItems((prevItems) =>
      updateItemInHierarchy(prevItems, itemId, (item) => ({
        ...item,
        isExpanded: !item.isExpanded,
      }))
    );
    // 展開状態の変更はisDirtyに影響しない
  }, []);

  /**
   * 合計金額を取得（REQ-1.5）
   */
  const getTotalAmount = useCallback((): string => {
    // ルートレベルの見積金額行の合計を計算
    const total = items.reduce((sum, item) => {
      const estimateLine = item.lines.find((l) => l.lineType === 'ESTIMATE');
      if (estimateLine?.amount) {
        try {
          return sum.add(new Decimal(estimateLine.amount));
        } catch {
          return sum;
        }
      }
      return sum;
    }, new Decimal(0));

    return total.toString();
  }, [items]);

  return {
    items,
    isDirty,
    pendingChanges,
    isSaving,
    updateLine,
    reorderItems,
    addItem,
    deleteItem,
    duplicateItem,
    save,
    discard,
    setItems: setItemsExternal,
    toggleExpanded,
    getTotalAmount,
  };
}

export default useEstimateEditor;
