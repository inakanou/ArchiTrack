/**
 * @fileoverview useFabricUndoIntegration フックのテスト
 *
 * Task 17.2: Fabric.jsイベント連携を実装する
 * - object:added、object:modified、object:removedイベントのキャプチャ
 * - コマンドオブジェクトの生成
 *
 * Requirements:
 * - 11.1: Undo操作で直前の注釈操作を取り消す
 * - 11.2: Redo操作で取り消した操作を再実行する
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFabricUndoIntegration } from '../../hooks/useFabricUndoIntegration';
import { UndoManager } from '../../services/UndoManager';
import type { Canvas as FabricCanvas, FabricObject } from 'fabric';

// Fabric.js Canvasのモック作成
function createMockCanvas(): {
  canvas: FabricCanvas;
  eventHandlers: Map<string, ((...args: unknown[]) => void)[]>;
  emit: (event: string, ...args: unknown[]) => void;
  resetMocks: () => void;
} {
  const eventHandlers = new Map<string, ((...args: unknown[]) => void)[]>();

  const addMock = vi.fn();
  const removeMock = vi.fn();
  const renderAllMock = vi.fn();

  const canvas = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      eventHandlers.get(event)!.push(handler);
    }),
    off: vi.fn((event?: string, handler?: (...args: unknown[]) => void) => {
      if (!event) {
        // 全イベント解除
        eventHandlers.clear();
      } else if (!handler) {
        // 特定イベントの全ハンドラ解除
        eventHandlers.delete(event);
      } else {
        // 特定ハンドラの解除
        const handlers = eventHandlers.get(event);
        if (handlers) {
          const index = handlers.indexOf(handler);
          if (index >= 0) {
            handlers.splice(index, 1);
          }
        }
      }
    }),
    add: addMock,
    remove: removeMock,
    renderAll: renderAllMock,
    getObjects: vi.fn(() => []),
  } as unknown as FabricCanvas;

  const emit = (event: string, ...args: unknown[]) => {
    const handlers = eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(...args));
    }
  };

  const resetMocks = () => {
    addMock.mockClear();
    removeMock.mockClear();
    renderAllMock.mockClear();
  };

  return { canvas, eventHandlers, emit, resetMocks };
}

// FabricObjectのモック作成
function createMockObject(overrides?: Partial<FabricObject>): FabricObject {
  return {
    toJSON: vi.fn(() => ({
      type: 'rect',
      left: 100,
      top: 100,
      width: 50,
      height: 50,
      fill: '#ff0000',
    })),
    set: vi.fn(),
    ...overrides,
  } as unknown as FabricObject;
}

describe('useFabricUndoIntegration', () => {
  let undoManager: UndoManager;

  beforeEach(() => {
    undoManager = new UndoManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('イベントリスナーの登録', () => {
    it('should register event listeners when canvas is provided', () => {
      const { canvas } = createMockCanvas();

      renderHook(() =>
        useFabricUndoIntegration({
          canvas,
          undoManager,
          enabled: true,
        })
      );

      // object:added、object:modified、object:removedのイベントリスナーが登録されること
      expect(canvas.on).toHaveBeenCalledWith('object:added', expect.any(Function));
      expect(canvas.on).toHaveBeenCalledWith('object:modified', expect.any(Function));
      expect(canvas.on).toHaveBeenCalledWith('object:removed', expect.any(Function));
    });

    it('should not register event listeners when canvas is null', () => {
      renderHook(() =>
        useFabricUndoIntegration({
          canvas: null,
          undoManager,
          enabled: true,
        })
      );

      // 何もエラーが発生しないこと（canvas.onは呼ばれない）
      expect(undoManager.canUndo()).toBe(false);
    });

    it('should not register event listeners when disabled', () => {
      const { canvas } = createMockCanvas();

      renderHook(() =>
        useFabricUndoIntegration({
          canvas,
          undoManager,
          enabled: false,
        })
      );

      // イベントリスナーが登録されないこと
      expect(canvas.on).not.toHaveBeenCalled();
    });

    it('should unregister event listeners on unmount', () => {
      const { canvas } = createMockCanvas();

      const { unmount } = renderHook(() =>
        useFabricUndoIntegration({
          canvas,
          undoManager,
          enabled: true,
        })
      );

      unmount();

      // offが呼ばれること（クリーンアップ）
      expect(canvas.off).toHaveBeenCalled();
    });
  });

  describe('object:added イベント', () => {
    it('should create an AddObjectCommand when object:added is emitted', () => {
      const { canvas, emit } = createMockCanvas();
      const mockObject = createMockObject();

      renderHook(() =>
        useFabricUndoIntegration({
          canvas,
          undoManager,
          enabled: true,
        })
      );

      // object:addedイベントを発火
      act(() => {
        emit('object:added', { target: mockObject });
      });

      // UndoManagerに追加されていること
      expect(undoManager.canUndo()).toBe(true);
      expect(undoManager.getUndoStackSize()).toBe(1);
    });

    it('should allow undoing an added object', () => {
      const { canvas, emit, resetMocks } = createMockCanvas();
      const mockObject = createMockObject();

      renderHook(() =>
        useFabricUndoIntegration({
          canvas,
          undoManager,
          enabled: true,
        })
      );

      // object:addedイベントを発火
      act(() => {
        emit('object:added', { target: mockObject });
      });

      // モックをリセット（イベント登録時の呼び出しをクリア）
      resetMocks();

      // Undoを実行
      act(() => {
        undoManager.undo();
      });

      // オブジェクトがキャンバスから削除されること
      expect(canvas.remove).toHaveBeenCalledWith(mockObject);
      expect(canvas.renderAll).toHaveBeenCalled();
    });

    it('should allow redoing an added object after undo', () => {
      const { canvas, emit, resetMocks } = createMockCanvas();
      const mockObject = createMockObject();

      renderHook(() =>
        useFabricUndoIntegration({
          canvas,
          undoManager,
          enabled: true,
        })
      );

      // object:addedイベントを発火
      act(() => {
        emit('object:added', { target: mockObject });
      });

      // Undoを実行
      act(() => {
        undoManager.undo();
      });

      // モックをリセット
      resetMocks();

      // Redoを実行
      act(() => {
        undoManager.redo();
      });

      // オブジェクトがキャンバスに追加されること
      expect(canvas.add).toHaveBeenCalledWith(mockObject);
      expect(canvas.renderAll).toHaveBeenCalled();
    });

    it('should ignore events when programmatic flag is set', () => {
      const { canvas, emit } = createMockCanvas();
      const mockObject = createMockObject();

      const { result } = renderHook(() =>
        useFabricUndoIntegration({
          canvas,
          undoManager,
          enabled: true,
        })
      );

      // プログラム的操作フラグをオン
      act(() => {
        result.current.setProgrammaticOperation(true);
      });

      // object:addedイベントを発火
      act(() => {
        emit('object:added', { target: mockObject });
      });

      // UndoManagerに追加されないこと
      expect(undoManager.canUndo()).toBe(false);

      // フラグをオフ
      act(() => {
        result.current.setProgrammaticOperation(false);
      });

      // 再度イベントを発火
      act(() => {
        emit('object:added', { target: mockObject });
      });

      // 今度は追加されること
      expect(undoManager.canUndo()).toBe(true);
    });
  });

  describe('object:modified イベント', () => {
    it('should create a ModifyObjectCommand when object:modified is emitted', () => {
      const { canvas, emit } = createMockCanvas();
      const mockObject = createMockObject();

      renderHook(() =>
        useFabricUndoIntegration({
          canvas,
          undoManager,
          enabled: true,
        })
      );

      // 最初にオブジェクトの状態をスナップショット（selection:createdで発生）
      act(() => {
        emit('selection:created', { selected: [mockObject] });
      });

      // object:modifiedイベントを発火
      act(() => {
        emit('object:modified', { target: mockObject });
      });

      // UndoManagerに追加されていること
      expect(undoManager.canUndo()).toBe(true);
    });

    it('should allow undoing a modified object', () => {
      const { canvas, emit, resetMocks } = createMockCanvas();
      const originalState = {
        type: 'rect',
        left: 100,
        top: 100,
        width: 50,
        height: 50,
        fill: '#ff0000',
      };
      const modifiedState = {
        type: 'rect',
        left: 200,
        top: 200,
        width: 100,
        height: 100,
        fill: '#ff0000',
      };
      const setMock = vi.fn();
      const mockObject = createMockObject({
        toJSON: vi.fn().mockReturnValueOnce(originalState).mockReturnValueOnce(modifiedState),
        set: setMock,
      });

      renderHook(() =>
        useFabricUndoIntegration({
          canvas,
          undoManager,
          enabled: true,
        })
      );

      // オブジェクト選択で状態をスナップショット（selection:createdで発生）
      act(() => {
        emit('selection:created', { selected: [mockObject] });
      });

      // object:modifiedイベントを発火
      act(() => {
        emit('object:modified', { target: mockObject });
      });

      // モックをリセット
      resetMocks();
      setMock.mockClear();

      // Undoを実行
      act(() => {
        undoManager.undo();
      });

      // オブジェクトの状態が復元されること
      expect(setMock).toHaveBeenCalled();
      expect(canvas.renderAll).toHaveBeenCalled();
    });

    it('should allow redoing a modified object after undo', () => {
      const { canvas, emit, resetMocks } = createMockCanvas();
      const originalState = {
        type: 'rect',
        left: 100,
        top: 100,
        width: 50,
        height: 50,
        fill: '#ff0000',
      };
      const modifiedState = {
        type: 'rect',
        left: 200,
        top: 200,
        width: 100,
        height: 100,
        fill: '#ff0000',
      };
      const setMock = vi.fn();
      const mockObject = createMockObject({
        toJSON: vi.fn().mockReturnValueOnce(originalState).mockReturnValueOnce(modifiedState),
        set: setMock,
      });

      renderHook(() =>
        useFabricUndoIntegration({
          canvas,
          undoManager,
          enabled: true,
        })
      );

      // オブジェクト選択で状態をスナップショット（selection:createdで発生）
      act(() => {
        emit('selection:created', { selected: [mockObject] });
      });

      // object:modifiedイベントを発火
      act(() => {
        emit('object:modified', { target: mockObject });
      });

      // Undoを実行
      act(() => {
        undoManager.undo();
      });

      // モックをリセット
      resetMocks();
      setMock.mockClear();

      // Redoを実行
      act(() => {
        undoManager.redo();
      });

      // オブジェクトの状態が再適用されること
      expect(setMock).toHaveBeenCalled();
      expect(canvas.renderAll).toHaveBeenCalled();
    });
  });

  describe('object:removed イベント', () => {
    it('should create a RemoveObjectCommand when object:removed is emitted', () => {
      const { canvas, emit } = createMockCanvas();
      const mockObject = createMockObject();

      renderHook(() =>
        useFabricUndoIntegration({
          canvas,
          undoManager,
          enabled: true,
        })
      );

      // object:removedイベントを発火
      act(() => {
        emit('object:removed', { target: mockObject });
      });

      // UndoManagerに追加されていること
      expect(undoManager.canUndo()).toBe(true);
    });

    it('should allow undoing a removed object', () => {
      const { canvas, emit, resetMocks } = createMockCanvas();
      const mockObject = createMockObject();

      renderHook(() =>
        useFabricUndoIntegration({
          canvas,
          undoManager,
          enabled: true,
        })
      );

      // object:removedイベントを発火
      act(() => {
        emit('object:removed', { target: mockObject });
      });

      // モックをリセット
      resetMocks();

      // Undoを実行
      act(() => {
        undoManager.undo();
      });

      // オブジェクトがキャンバスに追加されること
      expect(canvas.add).toHaveBeenCalledWith(mockObject);
      expect(canvas.renderAll).toHaveBeenCalled();
    });

    it('should allow redoing a removed object after undo', () => {
      const { canvas, emit, resetMocks } = createMockCanvas();
      const mockObject = createMockObject();

      renderHook(() =>
        useFabricUndoIntegration({
          canvas,
          undoManager,
          enabled: true,
        })
      );

      // object:removedイベントを発火
      act(() => {
        emit('object:removed', { target: mockObject });
      });

      // Undoを実行
      act(() => {
        undoManager.undo();
      });

      // モックをリセット
      resetMocks();

      // Redoを実行
      act(() => {
        undoManager.redo();
      });

      // オブジェクトがキャンバスから削除されること
      expect(canvas.remove).toHaveBeenCalledWith(mockObject);
      expect(canvas.renderAll).toHaveBeenCalled();
    });
  });

  describe('複数オブジェクトの操作', () => {
    it('should handle multiple object additions and undos in correct order', () => {
      const { canvas, emit, resetMocks } = createMockCanvas();
      const mockObject1 = createMockObject();
      const mockObject2 = createMockObject();
      const mockObject3 = createMockObject();

      renderHook(() =>
        useFabricUndoIntegration({
          canvas,
          undoManager,
          enabled: true,
        })
      );

      // 3つのオブジェクトを追加
      act(() => {
        emit('object:added', { target: mockObject1 });
      });
      act(() => {
        emit('object:added', { target: mockObject2 });
      });
      act(() => {
        emit('object:added', { target: mockObject3 });
      });

      expect(undoManager.getUndoStackSize()).toBe(3);

      // モックをリセット
      resetMocks();

      // Undoを3回実行
      act(() => {
        undoManager.undo();
      });
      expect(canvas.remove).toHaveBeenLastCalledWith(mockObject3);

      act(() => {
        undoManager.undo();
      });
      expect(canvas.remove).toHaveBeenLastCalledWith(mockObject2);

      act(() => {
        undoManager.undo();
      });
      expect(canvas.remove).toHaveBeenLastCalledWith(mockObject1);

      expect(undoManager.canUndo()).toBe(false);
      expect(undoManager.canRedo()).toBe(true);
    });
  });

  describe('enabled状態の変更', () => {
    it('should register/unregister listeners when enabled changes', () => {
      const { canvas } = createMockCanvas();

      const { rerender } = renderHook(
        ({ enabled }) =>
          useFabricUndoIntegration({
            canvas,
            undoManager,
            enabled,
          }),
        { initialProps: { enabled: false } }
      );

      // 最初はリスナーが登録されない
      expect(canvas.on).not.toHaveBeenCalled();

      // enabledをtrueに変更
      rerender({ enabled: true });

      // リスナーが登録される
      expect(canvas.on).toHaveBeenCalled();
    });

    it('should cleanup listeners when enabled changes from true to false', () => {
      const { canvas } = createMockCanvas();

      const { rerender } = renderHook(
        ({ enabled }) =>
          useFabricUndoIntegration({
            canvas,
            undoManager,
            enabled,
          }),
        { initialProps: { enabled: true } }
      );

      // リスナーが登録される
      expect(canvas.on).toHaveBeenCalled();

      // enabledをfalseに変更
      rerender({ enabled: false });

      // リスナーが解除される
      expect(canvas.off).toHaveBeenCalled();
    });
  });

  describe('canvasの変更', () => {
    it('should handle canvas change', () => {
      const { canvas: canvas1 } = createMockCanvas();
      const { canvas: canvas2 } = createMockCanvas();

      const { rerender } = renderHook(
        ({ canvas }) =>
          useFabricUndoIntegration({
            canvas,
            undoManager,
            enabled: true,
          }),
        { initialProps: { canvas: canvas1 } }
      );

      // 最初のキャンバスにリスナーが登録される
      expect(canvas1.on).toHaveBeenCalled();

      // キャンバスを変更
      rerender({ canvas: canvas2 });

      // 最初のキャンバスのリスナーが解除される
      expect(canvas1.off).toHaveBeenCalled();

      // 2つ目のキャンバスにリスナーが登録される
      expect(canvas2.on).toHaveBeenCalled();
    });
  });
});
