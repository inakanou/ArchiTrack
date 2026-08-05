/**
 * @fileoverview useEstimateRowDrag - 明細行のドラッグ&ドロップ配線
 *
 * Task 53.16: 見積項目テーブルのドラッグ&ドロップ配線
 *
 * 明細行に付ける DOM ハンドラ（dragstart / dragover / drop / dragend）を組み立てます。
 * ツリー表示（{@link EstimateItemTreeView}）とドリルダウン表示
 * （{@link EstimateItemDrilldownView}）の**双方の行描画**が同じ実装を用いるため、
 * ここに一本化しています。
 *
 * 並び替えそのものは行いません。ドラッグ元と対象の識別子を決めて
 * `onDrop(sourceId, targetId)` として通知するだけで、順序の決定は
 * `useEstimateEditor.reorderItems` 以降（遷移関数）の責務です。
 *
 * Requirements (estimate-creation):
 * - REQ-12.2: 見積項目の表示順序をドラッグ&ドロップで変更可能とする
 * - REQ-43.1: 並び替えはサーバーへの保存を伴わずに画面上の明細を更新する
 *
 * @module components/estimate/useEstimateRowDrag
 */

import { useCallback, useRef } from 'react';

// ============================================================================
// 型定義
// ============================================================================

/** ドラッグ元の識別子を運ぶ転送データの種別 */
const DRAG_DATA_FORMAT = 'text/plain';

/** 明細行の要素へ展開するドラッグ関連の props */
export interface EstimateRowDragProps {
  /** ドラッグ可能かどうか（不可の場合はハンドラを持たない） */
  draggable: boolean;
  onDragStart?: React.DragEventHandler<HTMLElement>;
  onDragOver?: React.DragEventHandler<HTMLElement>;
  onDrop?: React.DragEventHandler<HTMLElement>;
  onDragEnd?: React.DragEventHandler<HTMLElement>;
}

/** 項目IDから行のドラッグ props を作る関数 */
export type EstimateRowDragPropsFactory = (itemId: string) => EstimateRowDragProps;

/** {@link useEstimateRowDrag} の引数 */
export interface UseEstimateRowDragParams {
  /** ドラッグ可能かどうか */
  draggable: boolean;
  /** ドラッグ開始コールバック */
  onDragStart?: (itemId: string) => void;
  /** ドロップコールバック（ドラッグ元と対象の識別子） */
  onDrop?: (sourceId: string, targetId: string) => void;
}

/** ドラッグ不可の行に与える props（毎回生成せず参照を共有する） */
const NOT_DRAGGABLE: EstimateRowDragProps = { draggable: false };

// ============================================================================
// フック
// ============================================================================

/**
 * 明細行のドラッグ&ドロップ配線を組み立てる
 *
 * ドラッグ元は転送データ（`text/plain`）に載せるが、ブラウザや操作経路によっては
 * `drop` 時に読み出せないことがあるため、同じ値を ref にも保持して代替とする。
 *
 * @param params ドラッグ可否と通知先
 * @returns 項目IDを渡すとその行の props を返す関数
 */
export function useEstimateRowDrag({
  draggable,
  onDragStart,
  onDrop,
}: UseEstimateRowDragParams): EstimateRowDragPropsFactory {
  /** ドラッグ中の項目ID（転送データが読めない場合の代替） */
  const dragSourceIdRef = useRef<string | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLElement>, itemId: string) => {
      dragSourceIdRef.current = itemId;
      if (e.dataTransfer) {
        e.dataTransfer.setData(DRAG_DATA_FORMAT, itemId);
        e.dataTransfer.effectAllowed = 'move';
      }
      onDragStart?.(itemId);
    },
    [onDragStart]
  );

  /**
   * ドラッグ中の既定動作を打ち消す
   *
   * 実ブラウザは dragover で `preventDefault()` されない限り **drop を発火しない**。
   * この1行が欠けるとドラッグ&ドロップは画面上で一切成立しない。
   */
  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLElement>, targetId: string) => {
      e.preventDefault();
      const transferred = e.dataTransfer ? e.dataTransfer.getData(DRAG_DATA_FORMAT) : '';
      const sourceId = transferred !== '' ? transferred : dragSourceIdRef.current;
      dragSourceIdRef.current = null;
      if (sourceId === null || sourceId === '' || sourceId === targetId) {
        return;
      }
      onDrop?.(sourceId, targetId);
    },
    [onDrop]
  );

  const handleDragEnd = useCallback(() => {
    dragSourceIdRef.current = null;
  }, []);

  return useCallback(
    (itemId: string): EstimateRowDragProps =>
      draggable
        ? {
            draggable: true,
            onDragStart: (e) => handleDragStart(e, itemId),
            onDragOver: handleDragOver,
            onDrop: (e) => handleDrop(e, itemId),
            onDragEnd: handleDragEnd,
          }
        : NOT_DRAGGABLE,
    [draggable, handleDragStart, handleDragOver, handleDrop, handleDragEnd]
  );
}

export default useEstimateRowDrag;
