/**
 * @fileoverview useScheduleState フック - 工程表の状態管理
 *
 * Task 6.2: useScheduleState フックを実装する
 *
 * 工程表項目のState管理（追加、削除、更新、並び替え）を担当します。
 * ローカル操作はAPI呼び出しなしで実行し、保存時にバルク保存で一括送信します。
 *
 * Requirements (construction-schedule):
 * - REQ-3.3: 完了日自動算出
 * - REQ-4.1: 任意項目追加
 * - REQ-4.2: 任意項目の入力欄
 * - REQ-4.3: 任意項目削除
 * - REQ-4.4: 数量表由来・任意項目の混在管理
 * - REQ-5.2: 並び順リアルタイム反映
 * - REQ-6.1: ガントチャートリアルタイム更新
 * - REQ-6.6: サーバー通信なしの更新
 *
 * @module hooks/useScheduleState
 */

import { useState, useCallback, useMemo } from 'react';
import { bulkSaveScheduleItems } from '../api/schedules';
import type { ScheduleDetail, ScheduleSourceType } from '../api/schedules';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 工程表項目（フロントエンド状態管理用、endDate付き）
 */
export interface ScheduleItem {
  id: string;
  sourceType: ScheduleSourceType;
  sourceQuantityItemId: string | null;
  itemName: string;
  labelText: string;
  detailText: string;
  startDate: string | null;
  duration: number | null;
  endDate: string | null;
  displayOrder: number;
  isExportTarget: boolean;
}

/**
 * 工程表状態
 */
export interface ScheduleState {
  schedule: {
    id: string;
    name: string;
    quantityTableId: string | null;
    version: number;
  };
  items: ScheduleItem[];
  isDirty: boolean;
}

/**
 * useScheduleState フックの返り値
 */
export interface UseScheduleStateReturn {
  state: ScheduleState;
  addItem(): void;
  removeItem(itemId: string): void;
  updateItem(itemId: string, updates: Partial<ScheduleItem>): void;
  reorderItems(fromIndex: number, toIndex: number): void;
  save(): Promise<void>;
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 着工日と日数から完了日を算出する（カレンダー日ベース）
 *
 * @param startDate - 着工日（YYYY-MM-DD形式）
 * @param duration - 日数
 * @returns 完了日（YYYY-MM-DD形式）、算出不可の場合はnull
 */
export function calculateEndDate(startDate: string | null, duration: number | null): string | null {
  if (!startDate || duration === null || duration === undefined) {
    return null;
  }

  const start = new Date(startDate + 'T00:00:00');
  if (isNaN(start.getTime())) {
    return null;
  }

  const end = new Date(start);
  end.setDate(end.getDate() + duration - 1);

  const year = end.getFullYear();
  const month = String(end.getMonth() + 1).padStart(2, '0');
  const day = String(end.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * ScheduleDetailからScheduleItem配列に変換（endDate算出付き）
 */
function toScheduleItems(detail: ScheduleDetail): ScheduleItem[] {
  return detail.items.map((item) => ({
    id: item.id,
    sourceType: item.sourceType,
    sourceQuantityItemId: item.sourceQuantityItemId,
    itemName: item.itemName,
    labelText: item.labelText,
    detailText: item.detailText,
    startDate: item.startDate,
    duration: item.duration,
    endDate: calculateEndDate(item.startDate, item.duration),
    displayOrder: item.displayOrder,
    isExportTarget: item.isExportTarget,
  }));
}

/**
 * 一時的なIDを生成する（新規項目用）
 */
function generateTempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================================================
// フック実装
// ============================================================================

/**
 * 工程表の状態管理フック
 *
 * @param initialData - 初期工程表データ
 * @returns 工程表状態と操作関数
 */
export function useScheduleState(initialData: ScheduleDetail): UseScheduleStateReturn {
  const [items, setItems] = useState<ScheduleItem[]>(() => toScheduleItems(initialData));
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version] = useState(initialData.version);

  const state: ScheduleState = useMemo(
    () => ({
      schedule: {
        id: initialData.id,
        name: initialData.name,
        quantityTableId: initialData.quantityTableId,
        version,
      },
      items,
      isDirty,
    }),
    [initialData.id, initialData.name, initialData.quantityTableId, version, items, isDirty]
  );

  /**
   * 新しい任意項目を追加する
   */
  const addItem = useCallback(() => {
    setItems((prev) => {
      const newItem: ScheduleItem = {
        id: generateTempId(),
        sourceType: 'MANUAL',
        sourceQuantityItemId: null,
        itemName: '',
        labelText: '',
        detailText: '',
        startDate: null,
        duration: null,
        endDate: null,
        displayOrder: prev.length,
        isExportTarget: true,
      };
      return [...prev, newItem];
    });
    setIsDirty(true);
  }, []);

  /**
   * 指定した項目を削除する
   */
  const removeItem = useCallback((itemId: string) => {
    setItems((prev) => {
      const filtered = prev.filter((item) => item.id !== itemId);
      // displayOrderを再計算
      return filtered.map((item, index) => ({
        ...item,
        displayOrder: index,
      }));
    });
    setIsDirty(true);
  }, []);

  /**
   * 指定した項目のフィールドを更新する
   */
  const updateItem = useCallback((itemId: string, updates: Partial<ScheduleItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        const updated = { ...item, ...updates };

        // 着工日または日数が変更された場合、完了日を再算出
        const startDate = 'startDate' in updates ? updates.startDate : item.startDate;
        const duration = 'duration' in updates ? updates.duration : item.duration;
        updated.endDate = calculateEndDate(startDate ?? null, duration ?? null);

        return updated;
      })
    );
    setIsDirty(true);
  }, []);

  /**
   * 項目の並び順を変更する
   */
  const reorderItems = useCallback((fromIndex: number, toIndex: number) => {
    setItems((prev) => {
      const newItems = [...prev];
      const [moved] = newItems.splice(fromIndex, 1);
      if (!moved) return prev;
      newItems.splice(toIndex, 0, moved);
      // displayOrderを再計算
      return newItems.map((item, index) => ({
        ...item,
        displayOrder: index,
      }));
    });
    setIsDirty(true);
  }, []);

  /**
   * バルク保存を実行する
   */
  const save = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const input = {
        version,
        items: items.map((item) => ({
          id: item.id.startsWith('temp-') ? null : item.id,
          itemName: item.itemName,
          labelText: item.labelText,
          detailText: item.detailText,
          startDate: item.startDate,
          duration: item.duration,
          displayOrder: item.displayOrder,
          isExportTarget: item.isExportTarget,
        })),
      };

      await bulkSaveScheduleItems(initialData.id, input);
      setIsDirty(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存に失敗しました';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [initialData.id, version, items]);

  return {
    state,
    addItem,
    removeItem,
    updateItem,
    reorderItems,
    save,
    isLoading,
    error,
  };
}
