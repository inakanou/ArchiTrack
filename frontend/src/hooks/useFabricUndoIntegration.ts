/**
 * @fileoverview Fabric.js と UndoManager の連携フック
 *
 * Task 17.2: Fabric.jsイベント連携を実装する
 * - object:added、object:modified、object:removedイベントのキャプチャ
 * - コマンドオブジェクトの生成
 *
 * Requirements:
 * - 11.1: Undo操作で直前の注釈操作を取り消す
 * - 11.2: Redo操作で取り消した操作を再実行する
 *
 * @see design.md - UndoManager State Management
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Canvas as FabricCanvas, FabricObject, ModifiedEvent, TPointerEvent } from 'fabric';
import type { UndoCommand, IUndoManager } from '../services/UndoManager';

// ============================================================================
// Fabric.js イベント型定義
// ============================================================================

/**
 * object:added/removed イベントのペイロード
 */
interface ObjectAddedRemovedEvent {
  target: FabricObject;
}

/**
 * selection:created/updated イベントのペイロード
 */
interface SelectionEvent {
  selected: FabricObject[];
  deselected?: FabricObject[];
}

// ============================================================================
// 型定義
// ============================================================================

/**
 * useFabricUndoIntegration フックの引数
 */
export interface UseFabricUndoIntegrationOptions {
  /** Fabric.js Canvas インスタンス（nullの場合はイベント連携しない） */
  canvas: FabricCanvas | null;
  /** UndoManager インスタンス */
  undoManager: IUndoManager;
  /** イベント連携を有効にするかどうか */
  enabled: boolean;
}

/**
 * useFabricUndoIntegration フックの戻り値
 */
export interface UseFabricUndoIntegrationReturn {
  /** プログラム的操作フラグを設定（trueの間はイベントを無視） */
  setProgrammaticOperation: (isProgrammatic: boolean) => void;
  /** 現在プログラム的操作中かどうか */
  isProgrammaticOperation: boolean;
}

// ============================================================================
// コマンド生成関数
// ============================================================================

/**
 * オブジェクト追加コマンドを生成
 *
 * Undo: キャンバスからオブジェクトを削除
 * Redo: キャンバスにオブジェクトを追加
 */
function createAddObjectCommand(
  canvas: FabricCanvas,
  object: FabricObject,
  setProgrammatic: (value: boolean) => void
): UndoCommand {
  return {
    type: 'add',
    execute: () => {
      // Redoの場合: オブジェクトをキャンバスに追加
      setProgrammatic(true);
      canvas.add(object);
      canvas.renderAll();
      setProgrammatic(false);
    },
    undo: () => {
      // Undoの場合: オブジェクトをキャンバスから削除
      setProgrammatic(true);
      canvas.remove(object);
      canvas.renderAll();
      setProgrammatic(false);
    },
  };
}

/**
 * オブジェクト変更コマンドを生成
 *
 * Undo: オブジェクトの状態を変更前に戻す
 * Redo: オブジェクトの状態を変更後に適用
 */
function createModifyObjectCommand(
  canvas: FabricCanvas,
  object: FabricObject,
  previousState: Record<string, unknown>,
  currentState: Record<string, unknown>,
  setProgrammatic: (value: boolean) => void
): UndoCommand {
  return {
    type: 'modify',
    execute: () => {
      // Redoの場合: 変更後の状態を適用
      setProgrammatic(true);
      object.set(currentState);
      canvas.renderAll();
      setProgrammatic(false);
    },
    undo: () => {
      // Undoの場合: 変更前の状態を復元
      setProgrammatic(true);
      object.set(previousState);
      canvas.renderAll();
      setProgrammatic(false);
    },
  };
}

/**
 * オブジェクト削除コマンドを生成
 *
 * Undo: キャンバスにオブジェクトを追加
 * Redo: キャンバスからオブジェクトを削除
 */
function createRemoveObjectCommand(
  canvas: FabricCanvas,
  object: FabricObject,
  setProgrammatic: (value: boolean) => void
): UndoCommand {
  return {
    type: 'remove',
    execute: () => {
      // Redoの場合: オブジェクトをキャンバスから削除
      setProgrammatic(true);
      canvas.remove(object);
      canvas.renderAll();
      setProgrammatic(false);
    },
    undo: () => {
      // Undoの場合: オブジェクトをキャンバスに追加
      setProgrammatic(true);
      canvas.add(object);
      canvas.renderAll();
      setProgrammatic(false);
    },
  };
}

// ============================================================================
// フック
// ============================================================================

/**
 * Fabric.js Canvas と UndoManager を連携するフック
 *
 * Fabric.jsのobject:added、object:modified、object:removedイベントをキャプチャし、
 * 対応するUndoCommandを生成してUndoManagerに登録します。
 *
 * @example
 * ```tsx
 * const undoManager = new UndoManager();
 * const { setProgrammaticOperation } = useFabricUndoIntegration({
 *   canvas: fabricCanvas,
 *   undoManager,
 *   enabled: true,
 * });
 *
 * // プログラム的にオブジェクトを追加する場合（Undo履歴に残さない）
 * setProgrammaticOperation(true);
 * canvas.add(object);
 * setProgrammaticOperation(false);
 * ```
 */
export function useFabricUndoIntegration({
  canvas,
  undoManager,
  enabled,
}: UseFabricUndoIntegrationOptions): UseFabricUndoIntegrationReturn {
  // プログラム的操作フラグ（trueの間はイベントを無視）
  const [isProgrammaticOperation, setIsProgrammaticOperation] = useState(false);
  const isProgrammaticRef = useRef(false);

  // オブジェクトの状態スナップショット（変更前の状態を保持）
  const objectSnapshotsRef = useRef<Map<FabricObject, Record<string, unknown>>>(new Map());

  /**
   * プログラム的操作フラグを設定
   */
  const setProgrammaticOperation = useCallback((value: boolean) => {
    isProgrammaticRef.current = value;
    setIsProgrammaticOperation(value);
  }, []);

  /**
   * オブジェクトの状態をスナップショットとして保存
   */
  const snapshotObjectState = useCallback((object: FabricObject): Record<string, unknown> => {
    // toJSONで取得した状態をコピー
    const state = object.toJSON() as Record<string, unknown>;
    return { ...state };
  }, []);

  useEffect(() => {
    if (!canvas || !enabled) {
      return;
    }

    // refの値をローカル変数にコピー（クリーンアップ時の警告を回避）
    const objectSnapshots = objectSnapshotsRef.current;

    /**
     * object:added イベントハンドラ
     *
     * オブジェクトがキャンバスに追加されたときに呼ばれます。
     * AddObjectCommandを生成してUndoManagerに登録します。
     */
    const handleObjectAdded = (event: ObjectAddedRemovedEvent) => {
      // プログラム的操作またはUndo/Redo操作中の場合は無視
      if (isProgrammaticRef.current || undoManager.isPerformingOperation()) {
        return;
      }

      const object = event.target;
      if (!object) {
        return;
      }

      // AddObjectCommandを生成
      const command = createAddObjectCommand(canvas, object, (value) => {
        isProgrammaticRef.current = value;
      });

      // UndoManagerに追加（execute()を呼ばずに追加）
      // オブジェクトは既にキャンバスに追加されているため
      undoManager.pushWithoutExecute(command);
    };

    /**
     * selection:created/updated イベントハンドラ
     *
     * オブジェクトが選択されたときに状態をスナップショット
     * Fabric.js v6ではobject:selectedではなくselection:created/updatedを使用
     */
    const handleSelectionCreated = (event: SelectionEvent) => {
      const selectedObjects = event.selected;
      if (!selectedObjects || selectedObjects.length === 0) {
        return;
      }

      // 選択時の状態をスナップショット
      selectedObjects.forEach((object) => {
        const state = snapshotObjectState(object);
        objectSnapshotsRef.current.set(object, state);
      });
    };

    /**
     * object:modified イベントハンドラ
     *
     * オブジェクトが変更されたときに呼ばれます。
     * ModifyObjectCommandを生成してUndoManagerに登録します。
     */
    const handleObjectModified = (event: ModifiedEvent<TPointerEvent>) => {
      // プログラム的操作またはUndo/Redo操作中の場合は無視
      if (isProgrammaticRef.current || undoManager.isPerformingOperation()) {
        return;
      }

      const object = event.target;
      if (!object) {
        return;
      }

      // 変更前の状態を取得
      const previousState = objectSnapshotsRef.current.get(object);
      if (!previousState) {
        // スナップショットがない場合は無視
        return;
      }

      // 現在の状態を取得
      const currentState = snapshotObjectState(object);

      // ModifyObjectCommandを生成
      const command = createModifyObjectCommand(
        canvas,
        object,
        previousState,
        currentState,
        (value) => {
          isProgrammaticRef.current = value;
        }
      );

      // UndoManagerに追加（execute()を呼ばずに追加）
      // 変更は既に適用されているため
      undoManager.pushWithoutExecute(command);

      // スナップショットを更新
      objectSnapshotsRef.current.set(object, currentState);
    };

    /**
     * object:removed イベントハンドラ
     *
     * オブジェクトがキャンバスから削除されたときに呼ばれます。
     * RemoveObjectCommandを生成してUndoManagerに登録します。
     */
    const handleObjectRemoved = (event: ObjectAddedRemovedEvent) => {
      // プログラム的操作またはUndo/Redo操作中の場合は無視
      if (isProgrammaticRef.current || undoManager.isPerformingOperation()) {
        return;
      }

      const object = event.target;
      if (!object) {
        return;
      }

      // RemoveObjectCommandを生成
      const command = createRemoveObjectCommand(canvas, object, (value) => {
        isProgrammaticRef.current = value;
      });

      // UndoManagerに追加（execute()を呼ばずに追加）
      // オブジェクトは既に削除されているため
      undoManager.pushWithoutExecute(command);

      // スナップショットを削除
      objectSnapshotsRef.current.delete(object);
    };

    // イベントリスナーを登録
    canvas.on('object:added', handleObjectAdded);
    canvas.on('selection:created', handleSelectionCreated);
    canvas.on('selection:updated', handleSelectionCreated);
    canvas.on('object:modified', handleObjectModified);
    canvas.on('object:removed', handleObjectRemoved);

    // クリーンアップ
    return () => {
      canvas.off('object:added', handleObjectAdded);
      canvas.off('selection:created', handleSelectionCreated);
      canvas.off('selection:updated', handleSelectionCreated);
      canvas.off('object:modified', handleObjectModified);
      canvas.off('object:removed', handleObjectRemoved);
      objectSnapshots.clear();
    };
  }, [canvas, enabled, undoManager, snapshotObjectState]);

  return {
    setProgrammaticOperation,
    isProgrammaticOperation,
  };
}
