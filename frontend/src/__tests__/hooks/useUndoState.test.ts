/**
 * @fileoverview useUndoState フックのテスト
 *
 * Task 17.4: 履歴クリア処理を実装する
 * - 保存時の履歴クリア
 * - canUndo/canRedoの状態更新
 *
 * Requirements:
 * - 11.5: 注釈データを保存するとき、操作履歴をクリアする
 *
 * @see design.md - UndoManager State Management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndoState } from '../../hooks/useUndoState';
import { UndoManager, UndoCommand } from '../../services/UndoManager';

describe('useUndoState', () => {
  let undoManager: UndoManager;

  beforeEach(() => {
    undoManager = new UndoManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('初期状態', () => {
    it('should initialize with canUndo=false and canRedo=false', () => {
      const { result } = renderHook(() => useUndoState({ undoManager }));

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it('should reflect existing undo state when initialized', () => {
      // UndoManagerにコマンドを追加
      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };
      undoManager.execute(command);

      const { result } = renderHook(() => useUndoState({ undoManager }));

      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it('should reflect existing redo state when initialized', () => {
      // UndoManagerにコマンドを追加してUndo
      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };
      undoManager.execute(command);
      undoManager.undo();

      const { result } = renderHook(() => useUndoState({ undoManager }));

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });
  });

  describe('状態の更新', () => {
    it('should update canUndo when a command is executed', () => {
      const { result } = renderHook(() => useUndoState({ undoManager }));

      expect(result.current.canUndo).toBe(false);

      // コマンドを実行
      act(() => {
        const command: UndoCommand = {
          type: 'test',
          execute: vi.fn(),
          undo: vi.fn(),
        };
        undoManager.execute(command);
      });

      expect(result.current.canUndo).toBe(true);
    });

    it('should update canRedo when undo is called', () => {
      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };
      undoManager.execute(command);

      const { result } = renderHook(() => useUndoState({ undoManager }));

      expect(result.current.canRedo).toBe(false);

      // Undoを実行
      act(() => {
        undoManager.undo();
      });

      expect(result.current.canRedo).toBe(true);
      expect(result.current.canUndo).toBe(false);
    });

    it('should update canUndo when redo is called', () => {
      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };
      undoManager.execute(command);
      undoManager.undo();

      const { result } = renderHook(() => useUndoState({ undoManager }));

      expect(result.current.canUndo).toBe(false);

      // Redoを実行
      act(() => {
        undoManager.redo();
      });

      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });
  });

  describe('clearOnSave', () => {
    it('should clear history when clearOnSave is called', () => {
      const command1: UndoCommand = {
        type: 'test1',
        execute: vi.fn(),
        undo: vi.fn(),
      };
      const command2: UndoCommand = {
        type: 'test2',
        execute: vi.fn(),
        undo: vi.fn(),
      };
      undoManager.execute(command1);
      undoManager.execute(command2);
      undoManager.undo();

      const { result } = renderHook(() => useUndoState({ undoManager }));

      // 初期状態を確認
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(true);

      // clearOnSaveを呼び出し
      act(() => {
        result.current.clearOnSave();
      });

      // 履歴がクリアされていること
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it('should update state synchronously after clearOnSave', () => {
      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };
      undoManager.execute(command);

      const { result } = renderHook(() => useUndoState({ undoManager }));

      expect(result.current.canUndo).toBe(true);

      act(() => {
        result.current.clearOnSave();
      });

      // 同期的に状態が更新されること
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it('should be safe to call clearOnSave when history is already empty', () => {
      const { result } = renderHook(() => useUndoState({ undoManager }));

      // 履歴が空でもエラーにならないこと
      expect(() => {
        act(() => {
          result.current.clearOnSave();
        });
      }).not.toThrow();

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });
  });

  describe('UndoManagerインスタンスの変更', () => {
    it('should update state when undoManager changes', () => {
      const undoManager1 = new UndoManager();
      const undoManager2 = new UndoManager();

      // undoManager1にコマンドを追加
      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };
      undoManager1.execute(command);

      const { result, rerender } = renderHook(({ um }) => useUndoState({ undoManager: um }), {
        initialProps: { um: undoManager1 },
      });

      expect(result.current.canUndo).toBe(true);

      // undoManager2に切り替え（履歴なし）
      rerender({ um: undoManager2 });

      expect(result.current.canUndo).toBe(false);
    });

    it('should unregister onChange from previous undoManager', () => {
      const undoManager1 = new UndoManager();
      const undoManager2 = new UndoManager();

      const { result, rerender } = renderHook(({ um }) => useUndoState({ undoManager: um }), {
        initialProps: { um: undoManager1 },
      });

      // undoManager2に切り替え
      rerender({ um: undoManager2 });

      // 古いUndoManagerの変更は反映されないこと
      act(() => {
        const command: UndoCommand = {
          type: 'test',
          execute: vi.fn(),
          undo: vi.fn(),
        };
        undoManager1.execute(command);
      });

      // 新しいUndoManagerの状態が反映されていること
      expect(result.current.canUndo).toBe(false);
    });
  });

  describe('クリーンアップ', () => {
    it('should unregister onChange on unmount', () => {
      const { unmount } = renderHook(() => useUndoState({ undoManager }));

      unmount();

      // アンマウント後にUndoManagerを操作してもエラーにならないこと
      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };
      expect(() => {
        undoManager.execute(command);
      }).not.toThrow();
    });
  });

  describe('複数の操作シナリオ', () => {
    it('should correctly track state through multiple operations', () => {
      const { result } = renderHook(() => useUndoState({ undoManager }));

      const commands: UndoCommand[] = [];
      for (let i = 0; i < 5; i++) {
        commands.push({
          type: `test${i}`,
          execute: vi.fn(),
          undo: vi.fn(),
        });
      }

      // 5つのコマンドを実行
      act(() => {
        commands.forEach((cmd) => undoManager.execute(cmd));
      });

      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);

      // 3回Undo
      act(() => {
        undoManager.undo();
        undoManager.undo();
        undoManager.undo();
      });

      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(true);

      // 保存（履歴クリア）
      act(() => {
        result.current.clearOnSave();
      });

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);

      // 新しいコマンドを追加
      act(() => {
        undoManager.execute({
          type: 'newCommand',
          execute: vi.fn(),
          undo: vi.fn(),
        });
      });

      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });
  });
});
