/**
 * @fileoverview SortableScheduleList コンポーネント - ドラッグ&ドロップ並び替え
 *
 * Task 9.2: SortableScheduleListによる並び順管理を実装する
 *
 * HTML5 Drag and Drop APIを使用した軽量なドラッグ&ドロップ並び替え実装。
 *
 * Requirements (construction-schedule):
 * - REQ-5.1: 並び順変更機能
 * - REQ-5.2: 並び順リアルタイム反映
 * - REQ-5.3: 並び順の永続化（保存時）
 * - REQ-5.4: 並び順の復元
 *
 * @module components/schedule/SortableScheduleList
 */

import { useState, useCallback, useRef } from 'react';
import { ScheduleItemRow } from './ScheduleItemRow';
import type { ScheduleItem } from '../../hooks/useScheduleState';

// ============================================================================
// 型定義
// ============================================================================

export interface SortableScheduleListProps {
  /** 工程表項目リスト */
  items: ScheduleItem[];
  /** 項目更新コールバック */
  onUpdate: (itemId: string, updates: Partial<ScheduleItem>) => void;
  /** 項目削除コールバック */
  onRemove: (itemId: string) => void;
  /** 並び順変更コールバック */
  onReorder: (fromIndex: number, toIndex: number) => void;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
  } as React.CSSProperties,
  draggableRow: {
    display: 'flex',
    alignItems: 'stretch',
    cursor: 'grab',
    transition: 'opacity 0.2s',
  } as React.CSSProperties,
  draggableRowDragging: {
    opacity: 0.5,
  } as React.CSSProperties,
  dragOver: {
    borderTop: '2px solid #3b82f6',
  } as React.CSSProperties,
  dragHandle: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 4px',
    cursor: 'grab',
    color: '#9ca3af',
    fontSize: '16px',
    userSelect: 'none' as const,
  } as React.CSSProperties,
  rowContent: {
    flex: 1,
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * ドラッグ&ドロップ対応の工程表項目リスト
 */
export function SortableScheduleList({
  items,
  onUpdate,
  onRemove,
  onReorder,
}: SortableScheduleListProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  const handleDragStart = useCallback(
    (index: number) => (e: React.DragEvent<HTMLDivElement>) => {
      setDragIndex(index);
      dragIndexRef.current = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    },
    []
  );

  const handleDragOver = useCallback(
    (index: number) => (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverIndex(index);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (toIndex: number) => (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const fromIndex = dragIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex) {
        onReorder(fromIndex, toIndex);
      }
      setDragIndex(null);
      setDragOverIndex(null);
      dragIndexRef.current = null;
    },
    [onReorder]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
    dragIndexRef.current = null;
  }, []);

  return (
    <div style={styles.list} data-testid="sortable-schedule-list">
      {items.map((item, index) => {
        const isDragging = dragIndex === index;
        const isDragOver = dragOverIndex === index;

        return (
          <div
            key={item.id}
            data-testid={`sortable-row-${item.id}`}
            data-dragging={isDragging ? 'true' : 'false'}
            draggable
            onDragStart={handleDragStart(index)}
            onDragOver={handleDragOver(index)}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop(index)}
            onDragEnd={handleDragEnd}
            style={{
              ...styles.draggableRow,
              ...(isDragging ? styles.draggableRowDragging : {}),
              ...(isDragOver ? styles.dragOver : {}),
            }}
          >
            {/* ドラッグハンドル */}
            <div
              data-testid={`drag-handle-${item.id}`}
              style={styles.dragHandle}
              aria-label="並び替え"
            >
              ⠿
            </div>

            {/* 項目入力行 */}
            <div style={styles.rowContent}>
              <ScheduleItemRow item={item} onUpdate={onUpdate} onRemove={onRemove} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
