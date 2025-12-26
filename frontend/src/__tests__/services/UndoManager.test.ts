import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UndoManager, UndoCommand } from '../../services/UndoManager';

describe('UndoManager', () => {
  let undoManager: UndoManager;

  beforeEach(() => {
    undoManager = new UndoManager();
  });

  describe('constructor', () => {
    it('should initialize with default max history size of 50', () => {
      expect(undoManager.getMaxHistorySize()).toBe(50);
    });

    it('should initialize with empty undo and redo stacks', () => {
      expect(undoManager.canUndo()).toBe(false);
      expect(undoManager.canRedo()).toBe(false);
    });

    it('should allow custom max history size', () => {
      const customManager = new UndoManager(100);
      expect(customManager.getMaxHistorySize()).toBe(100);
    });
  });

  describe('execute', () => {
    it('should execute a command and add it to the undo stack', () => {
      const executeFn = vi.fn();
      const undoFn = vi.fn();
      const command: UndoCommand = {
        type: 'test',
        execute: executeFn,
        undo: undoFn,
      };

      undoManager.execute(command);

      expect(executeFn).toHaveBeenCalledTimes(1);
      expect(undoManager.canUndo()).toBe(true);
    });

    it('should clear the redo stack after executing a new command', () => {
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
      undoManager.undo();
      expect(undoManager.canRedo()).toBe(true);

      undoManager.execute(command2);
      expect(undoManager.canRedo()).toBe(false);
    });

    it('should remove the oldest command when exceeding max history size (FIFO)', () => {
      const manager = new UndoManager(3);
      const commands: UndoCommand[] = [];

      // Add 4 commands to a manager with max size of 3
      for (let i = 0; i < 4; i++) {
        const command: UndoCommand = {
          type: `test${i}`,
          execute: vi.fn(),
          undo: vi.fn(),
        };
        commands.push(command);
        manager.execute(command);
      }

      // The first command should have been removed
      // We should be able to undo 3 times
      expect(manager.canUndo()).toBe(true);
      manager.undo();
      manager.undo();
      manager.undo();
      expect(manager.canUndo()).toBe(false);

      // Verify the oldest command's undo was not called (it was removed)
      expect(commands[0]!.undo).not.toHaveBeenCalled();
      // Verify the newer commands' undo were called
      expect(commands[1]!.undo).toHaveBeenCalled();
      expect(commands[2]!.undo).toHaveBeenCalled();
      expect(commands[3]!.undo).toHaveBeenCalled();
    });
  });

  describe('undo', () => {
    it('should call the undo function of the last executed command', () => {
      const undoFn = vi.fn();
      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: undoFn,
      };

      undoManager.execute(command);
      undoManager.undo();

      expect(undoFn).toHaveBeenCalledTimes(1);
    });

    it('should move the command to the redo stack', () => {
      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };

      undoManager.execute(command);
      expect(undoManager.canRedo()).toBe(false);

      undoManager.undo();
      expect(undoManager.canRedo()).toBe(true);
    });

    it('should do nothing if there are no commands to undo', () => {
      expect(() => undoManager.undo()).not.toThrow();
      expect(undoManager.canUndo()).toBe(false);
    });

    it('should support multiple consecutive undo operations', () => {
      const commands: UndoCommand[] = [];
      for (let i = 0; i < 3; i++) {
        const command: UndoCommand = {
          type: `test${i}`,
          execute: vi.fn(),
          undo: vi.fn(),
        };
        commands.push(command);
        undoManager.execute(command);
      }

      undoManager.undo();
      undoManager.undo();
      undoManager.undo();

      // All undo functions should be called in reverse order
      expect(commands[2]!.undo).toHaveBeenCalled();
      expect(commands[1]!.undo).toHaveBeenCalled();
      expect(commands[0]!.undo).toHaveBeenCalled();
      expect(undoManager.canUndo()).toBe(false);
    });
  });

  describe('redo', () => {
    it('should call the execute function of the last undone command', () => {
      const executeFn = vi.fn();
      const command: UndoCommand = {
        type: 'test',
        execute: executeFn,
        undo: vi.fn(),
      };

      undoManager.execute(command);
      undoManager.undo();
      undoManager.redo();

      // execute is called twice: once for initial execute, once for redo
      expect(executeFn).toHaveBeenCalledTimes(2);
    });

    it('should move the command back to the undo stack', () => {
      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };

      undoManager.execute(command);
      undoManager.undo();
      expect(undoManager.canUndo()).toBe(false);

      undoManager.redo();
      expect(undoManager.canUndo()).toBe(true);
    });

    it('should do nothing if there are no commands to redo', () => {
      expect(() => undoManager.redo()).not.toThrow();
      expect(undoManager.canRedo()).toBe(false);
    });

    it('should support multiple consecutive redo operations', () => {
      const commands: UndoCommand[] = [];
      for (let i = 0; i < 3; i++) {
        const command: UndoCommand = {
          type: `test${i}`,
          execute: vi.fn(),
          undo: vi.fn(),
        };
        commands.push(command);
        undoManager.execute(command);
      }

      undoManager.undo();
      undoManager.undo();
      undoManager.undo();
      undoManager.redo();
      undoManager.redo();
      undoManager.redo();

      // Each execute should be called twice (initial + redo)
      expect(commands[0]!.execute).toHaveBeenCalledTimes(2);
      expect(commands[1]!.execute).toHaveBeenCalledTimes(2);
      expect(commands[2]!.execute).toHaveBeenCalledTimes(2);
      expect(undoManager.canRedo()).toBe(false);
    });
  });

  describe('canUndo', () => {
    it('should return false when undo stack is empty', () => {
      expect(undoManager.canUndo()).toBe(false);
    });

    it('should return true when undo stack has commands', () => {
      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };

      undoManager.execute(command);
      expect(undoManager.canUndo()).toBe(true);
    });
  });

  describe('canRedo', () => {
    it('should return false when redo stack is empty', () => {
      expect(undoManager.canRedo()).toBe(false);
    });

    it('should return true when redo stack has commands', () => {
      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };

      undoManager.execute(command);
      undoManager.undo();
      expect(undoManager.canRedo()).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear both undo and redo stacks', () => {
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

      expect(undoManager.canUndo()).toBe(true);
      expect(undoManager.canRedo()).toBe(true);

      undoManager.clear();

      expect(undoManager.canUndo()).toBe(false);
      expect(undoManager.canRedo()).toBe(false);
    });
  });

  describe('getUndoStackSize', () => {
    it('should return the number of commands in the undo stack', () => {
      expect(undoManager.getUndoStackSize()).toBe(0);

      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };

      undoManager.execute(command);
      expect(undoManager.getUndoStackSize()).toBe(1);

      undoManager.execute({ ...command, type: 'test2' });
      expect(undoManager.getUndoStackSize()).toBe(2);
    });
  });

  describe('getRedoStackSize', () => {
    it('should return the number of commands in the redo stack', () => {
      expect(undoManager.getRedoStackSize()).toBe(0);

      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };

      undoManager.execute(command);
      undoManager.undo();
      expect(undoManager.getRedoStackSize()).toBe(1);
    });
  });

  describe('onChange callback', () => {
    it('should call onChange callback when executing a command', () => {
      const onChange = vi.fn();
      undoManager.setOnChange(onChange);

      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };

      undoManager.execute(command);
      expect(onChange).toHaveBeenCalledWith({
        canUndo: true,
        canRedo: false,
      });
    });

    it('should call onChange callback when undoing a command', () => {
      const onChange = vi.fn();
      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };

      undoManager.execute(command);
      undoManager.setOnChange(onChange);
      undoManager.undo();

      expect(onChange).toHaveBeenCalledWith({
        canUndo: false,
        canRedo: true,
      });
    });

    it('should call onChange callback when redoing a command', () => {
      const onChange = vi.fn();
      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };

      undoManager.execute(command);
      undoManager.undo();
      undoManager.setOnChange(onChange);
      undoManager.redo();

      expect(onChange).toHaveBeenCalledWith({
        canUndo: true,
        canRedo: false,
      });
    });

    it('should call onChange callback when clearing', () => {
      const onChange = vi.fn();
      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };

      undoManager.execute(command);
      undoManager.setOnChange(onChange);
      undoManager.clear();

      expect(onChange).toHaveBeenCalledWith({
        canUndo: false,
        canRedo: false,
      });
    });
  });

  describe('complex scenarios', () => {
    it('should handle interleaved undo and redo operations', () => {
      const commands: UndoCommand[] = [];
      for (let i = 0; i < 5; i++) {
        const command: UndoCommand = {
          type: `test${i}`,
          execute: vi.fn(),
          undo: vi.fn(),
        };
        commands.push(command);
        undoManager.execute(command);
      }

      // Undo 3 operations
      undoManager.undo();
      undoManager.undo();
      undoManager.undo();

      // Redo 1 operation
      undoManager.redo();

      // Execute a new command (should clear remaining redo stack)
      const newCommand: UndoCommand = {
        type: 'new',
        execute: vi.fn(),
        undo: vi.fn(),
      };
      undoManager.execute(newCommand);

      expect(undoManager.getUndoStackSize()).toBe(4); // 2 original + 1 redone + 1 new
      expect(undoManager.canRedo()).toBe(false);
    });

    it('should correctly enforce max history size during complex operations', () => {
      const manager = new UndoManager(5);
      const commands: UndoCommand[] = [];

      // Execute 7 commands
      for (let i = 0; i < 7; i++) {
        const command: UndoCommand = {
          type: `test${i}`,
          execute: vi.fn(),
          undo: vi.fn(),
        };
        commands.push(command);
        manager.execute(command);
      }

      // Stack should have only 5 commands
      expect(manager.getUndoStackSize()).toBe(5);

      // Undo all 5
      for (let i = 0; i < 5; i++) {
        manager.undo();
      }

      // Only commands 2-6 should have undo called (0 and 1 were removed)
      expect(commands[0]!.undo).not.toHaveBeenCalled();
      expect(commands[1]!.undo).not.toHaveBeenCalled();
      expect(commands[2]!.undo).toHaveBeenCalled();
      expect(commands[3]!.undo).toHaveBeenCalled();
      expect(commands[4]!.undo).toHaveBeenCalled();
      expect(commands[5]!.undo).toHaveBeenCalled();
      expect(commands[6]!.undo).toHaveBeenCalled();
    });
  });

  describe('default max history size of 50', () => {
    it('should correctly enforce the default max history size of 50', () => {
      const manager = new UndoManager(); // Default 50

      // Execute 55 commands
      for (let i = 0; i < 55; i++) {
        const command: UndoCommand = {
          type: `test${i}`,
          execute: vi.fn(),
          undo: vi.fn(),
        };
        manager.execute(command);
      }

      // Stack should have only 50 commands
      expect(manager.getUndoStackSize()).toBe(50);
    });
  });

  describe('pushWithoutExecute', () => {
    it('should add command to undo stack without calling execute', () => {
      const executeFn = vi.fn();
      const undoFn = vi.fn();
      const command: UndoCommand = {
        type: 'test',
        execute: executeFn,
        undo: undoFn,
      };

      undoManager.pushWithoutExecute(command);

      // execute should NOT be called
      expect(executeFn).not.toHaveBeenCalled();
      // Command should be in the undo stack
      expect(undoManager.canUndo()).toBe(true);
    });

    it('should clear the redo stack when pushing a new command', () => {
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
      undoManager.undo();
      expect(undoManager.canRedo()).toBe(true);

      undoManager.pushWithoutExecute(command2);
      expect(undoManager.canRedo()).toBe(false);
    });

    it('should enforce max history size (FIFO)', () => {
      const manager = new UndoManager(3);
      const commands: UndoCommand[] = [];

      // Push 4 commands to a manager with max size of 3
      for (let i = 0; i < 4; i++) {
        const command: UndoCommand = {
          type: `test${i}`,
          execute: vi.fn(),
          undo: vi.fn(),
        };
        commands.push(command);
        manager.pushWithoutExecute(command);
      }

      // Stack should have only 3 commands
      expect(manager.getUndoStackSize()).toBe(3);

      // We should be able to undo 3 times
      manager.undo();
      manager.undo();
      manager.undo();
      expect(manager.canUndo()).toBe(false);

      // The first command's undo should not have been called (it was removed)
      expect(commands[0]!.undo).not.toHaveBeenCalled();
      // The newer commands' undo were called
      expect(commands[1]!.undo).toHaveBeenCalled();
      expect(commands[2]!.undo).toHaveBeenCalled();
      expect(commands[3]!.undo).toHaveBeenCalled();
    });

    it('should call onChange callback when pushing a command', () => {
      const onChange = vi.fn();
      undoManager.setOnChange(onChange);

      const command: UndoCommand = {
        type: 'test',
        execute: vi.fn(),
        undo: vi.fn(),
      };

      undoManager.pushWithoutExecute(command);
      expect(onChange).toHaveBeenCalledWith({
        canUndo: true,
        canRedo: false,
      });
    });

    it('should allow undo and then redo with correct behavior', () => {
      const executeFn = vi.fn();
      const undoFn = vi.fn();
      const command: UndoCommand = {
        type: 'test',
        execute: executeFn,
        undo: undoFn,
      };

      // Push without execute
      undoManager.pushWithoutExecute(command);
      expect(executeFn).not.toHaveBeenCalled();

      // Undo should call undo()
      undoManager.undo();
      expect(undoFn).toHaveBeenCalledTimes(1);

      // Redo should call execute()
      undoManager.redo();
      expect(executeFn).toHaveBeenCalledTimes(1);
    });
  });
});
