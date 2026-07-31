/**
 * @fileoverview useUndoKeyboardShortcuts フックのテスト
 *
 * Task 17.3: キーボードショートカットを実装する
 * - Ctrl/Cmd+Z（Undo）
 * - Ctrl/Cmd+Shift+Z（Redo）
 *
 * Requirements:
 * - 11.3: キーボードショートカット（Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z）でUndo/Redoを実行する
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUndoKeyboardShortcuts } from '../../hooks/useUndoKeyboardShortcuts';
import type { IUndoManager } from '../../services/UndoManager';

// UndoManagerのモック作成
function createMockUndoManager(overrides?: Partial<IUndoManager>): IUndoManager {
  return {
    execute: vi.fn(),
    pushWithoutExecute: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: vi.fn().mockReturnValue(true),
    canRedo: vi.fn().mockReturnValue(true),
    clear: vi.fn(),
    setOnChange: vi.fn(),
    isPerformingOperation: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

// キーボードイベントをシミュレートするヘルパー
function dispatchKeyboardEvent(options: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: options.key,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

describe('useUndoKeyboardShortcuts', () => {
  let undoManager: IUndoManager;

  beforeEach(() => {
    undoManager = createMockUndoManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('イベントリスナーの登録', () => {
    it('should register keydown event listener when enabled', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      addEventListenerSpy.mockRestore();
    });

    it('should not register keydown event listener when disabled', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: false,
        })
      );

      expect(addEventListenerSpy).not.toHaveBeenCalledWith('keydown', expect.any(Function));
      addEventListenerSpy.mockRestore();
    });

    it('should remove event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const { unmount } = renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });
  });

  describe('Ctrl+Z (Undo on Windows/Linux)', () => {
    it('should call undoManager.undo() when Ctrl+Z is pressed', () => {
      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      dispatchKeyboardEvent({ key: 'z', ctrlKey: true });

      expect(undoManager.undo).toHaveBeenCalledTimes(1);
    });

    it('should not call undo when Ctrl+Z is pressed but canUndo returns false', () => {
      undoManager = createMockUndoManager({ canUndo: vi.fn().mockReturnValue(false) });

      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      dispatchKeyboardEvent({ key: 'z', ctrlKey: true });

      expect(undoManager.undo).not.toHaveBeenCalled();
    });

    it('should not call undo when disabled', () => {
      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: false,
        })
      );

      dispatchKeyboardEvent({ key: 'z', ctrlKey: true });

      expect(undoManager.undo).not.toHaveBeenCalled();
    });
  });

  describe('Cmd+Z (Undo on macOS)', () => {
    it('should call undoManager.undo() when Cmd+Z is pressed', () => {
      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      dispatchKeyboardEvent({ key: 'z', metaKey: true });

      expect(undoManager.undo).toHaveBeenCalledTimes(1);
    });

    it('should not call undo when Cmd+Z is pressed but canUndo returns false', () => {
      undoManager = createMockUndoManager({ canUndo: vi.fn().mockReturnValue(false) });

      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      dispatchKeyboardEvent({ key: 'z', metaKey: true });

      expect(undoManager.undo).not.toHaveBeenCalled();
    });
  });

  describe('Ctrl+Shift+Z (Redo on Windows/Linux)', () => {
    it('should call undoManager.redo() when Ctrl+Shift+Z is pressed', () => {
      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      dispatchKeyboardEvent({ key: 'z', ctrlKey: true, shiftKey: true });

      expect(undoManager.redo).toHaveBeenCalledTimes(1);
    });

    it('should call undoManager.redo() when Ctrl+Shift+Z is pressed (uppercase Z)', () => {
      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      dispatchKeyboardEvent({ key: 'Z', ctrlKey: true, shiftKey: true });

      expect(undoManager.redo).toHaveBeenCalledTimes(1);
    });

    it('should not call redo when Ctrl+Shift+Z is pressed but canRedo returns false', () => {
      undoManager = createMockUndoManager({ canRedo: vi.fn().mockReturnValue(false) });

      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      dispatchKeyboardEvent({ key: 'z', ctrlKey: true, shiftKey: true });

      expect(undoManager.redo).not.toHaveBeenCalled();
    });

    it('should not call redo when disabled', () => {
      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: false,
        })
      );

      dispatchKeyboardEvent({ key: 'z', ctrlKey: true, shiftKey: true });

      expect(undoManager.redo).not.toHaveBeenCalled();
    });
  });

  describe('Cmd+Shift+Z (Redo on macOS)', () => {
    it('should call undoManager.redo() when Cmd+Shift+Z is pressed', () => {
      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      dispatchKeyboardEvent({ key: 'z', metaKey: true, shiftKey: true });

      expect(undoManager.redo).toHaveBeenCalledTimes(1);
    });

    it('should not call redo when Cmd+Shift+Z is pressed but canRedo returns false', () => {
      undoManager = createMockUndoManager({ canRedo: vi.fn().mockReturnValue(false) });

      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      dispatchKeyboardEvent({ key: 'z', metaKey: true, shiftKey: true });

      expect(undoManager.redo).not.toHaveBeenCalled();
    });
  });

  describe('Ctrl+Y (Alternative Redo on Windows)', () => {
    it('should call undoManager.redo() when Ctrl+Y is pressed', () => {
      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      dispatchKeyboardEvent({ key: 'y', ctrlKey: true });

      expect(undoManager.redo).toHaveBeenCalledTimes(1);
    });

    it('should not call redo when Ctrl+Y is pressed but canRedo returns false', () => {
      undoManager = createMockUndoManager({ canRedo: vi.fn().mockReturnValue(false) });

      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      dispatchKeyboardEvent({ key: 'y', ctrlKey: true });

      expect(undoManager.redo).not.toHaveBeenCalled();
    });
  });

  describe('イベントのpreventDefault', () => {
    it('should prevent default when Undo shortcut is triggered', () => {
      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      document.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should prevent default when Redo shortcut is triggered', () => {
      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      document.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('その他のキー', () => {
    it('should not trigger undo/redo for unrelated keys', () => {
      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      // 関係ないキーを押す
      dispatchKeyboardEvent({ key: 'a', ctrlKey: true });
      dispatchKeyboardEvent({ key: 'x', ctrlKey: true });
      dispatchKeyboardEvent({ key: 'c', ctrlKey: true });
      dispatchKeyboardEvent({ key: 'v', ctrlKey: true });
      dispatchKeyboardEvent({ key: 'z' }); // 修飾キーなし

      expect(undoManager.undo).not.toHaveBeenCalled();
      expect(undoManager.redo).not.toHaveBeenCalled();
    });
  });

  describe('enabled状態の変更', () => {
    it('should enable/disable shortcuts when enabled prop changes', () => {
      const { rerender } = renderHook(
        ({ enabled }) =>
          useUndoKeyboardShortcuts({
            undoManager,
            enabled,
          }),
        { initialProps: { enabled: false } }
      );

      // 無効時はundoが呼ばれない
      dispatchKeyboardEvent({ key: 'z', ctrlKey: true });
      expect(undoManager.undo).not.toHaveBeenCalled();

      // 有効に変更
      rerender({ enabled: true });

      // 有効時はundoが呼ばれる
      dispatchKeyboardEvent({ key: 'z', ctrlKey: true });
      expect(undoManager.undo).toHaveBeenCalledTimes(1);

      // 再度無効に変更
      rerender({ enabled: false });

      // 無効時はundoが呼ばれない
      dispatchKeyboardEvent({ key: 'z', ctrlKey: true });
      expect(undoManager.undo).toHaveBeenCalledTimes(1); // 回数は増えない
    });
  });

  describe('入力要素内でのショートカット無効化', () => {
    it('should not trigger undo when focus is on input element', () => {
      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      // inputにフォーカスを模擬
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: input });
      document.dispatchEvent(event);

      expect(undoManager.undo).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it('should not trigger undo when focus is on textarea element', () => {
      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      // textareaにフォーカスを模擬
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: textarea });
      document.dispatchEvent(event);

      expect(undoManager.undo).not.toHaveBeenCalled();

      document.body.removeChild(textarea);
    });

    it('should not trigger undo when focus is on contenteditable element', () => {
      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );

      // contenteditableにフォーカスを模擬
      const div = document.createElement('div');
      div.setAttribute('contenteditable', 'true');
      document.body.appendChild(div);
      div.focus();

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: div });
      document.dispatchEvent(event);

      expect(undoManager.undo).not.toHaveBeenCalled();

      document.body.removeChild(div);
    });
  });

  // ==========================================================================
  // Task 53.11: 文字入力判定の共通ユーティリティ化に伴う特性テスト
  //
  // 判定ロジックを utils/keyboard-input.ts へ切り出しても、Ctrl+Z の抑止結果が
  // 切り出し前と完全に同一であることを境界ケースごとに固定する。
  //
  // Requirements (estimate-creation):
  // - 47.5: セルの文字入力中のキーボード操作では行操作を実行しない
  //
  // Design: design.md `#### Frontend Domain` > `##### estimateKeymap`
  // ==========================================================================
  describe('文字入力判定の特性（Task 53.11）', () => {
    /**
     * 指定した target で Ctrl+Z を発火し、undo が呼ばれたかを返す
     *
     * @param target キーボードイベントの target として設定する値
     * @returns undo が呼ばれた場合 true（＝文字入力中と判定されなかった）
     */
    function undoFiredWithTarget(target: unknown): boolean {
      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: target });
      document.dispatchEvent(event);
      return (undoManager.undo as ReturnType<typeof vi.fn>).mock.calls.length > 0;
    }

    /** input 要素を生成して body に追加する */
    function appendInput(type?: string): HTMLInputElement {
      const input = document.createElement('input');
      if (type !== undefined) {
        input.setAttribute('type', type);
      }
      document.body.appendChild(input);
      return input;
    }

    beforeEach(() => {
      renderHook(() =>
        useUndoKeyboardShortcuts({
          undoManager,
          enabled: true,
        })
      );
    });

    afterEach(() => {
      document.body.innerHTML = '';
    });

    describe('文字入力中と判定される（行操作を抑止する）', () => {
      // 文字入力系 input type は全件抑止される
      const textInputTypes = [
        'text',
        'password',
        'email',
        'number',
        'search',
        'tel',
        'url',
        'date',
        'datetime-local',
        'month',
        'time',
        'week',
      ];

      it.each(textInputTypes)('input[type=%s]', (type) => {
        expect(undoFiredWithTarget(appendInput(type))).toBe(false);
      });

      it('type属性のないinput（既定でtext扱い）', () => {
        expect(undoFiredWithTarget(appendInput())).toBe(false);
      });

      it('readOnlyなinput[type=text]', () => {
        const input = appendInput('text');
        input.readOnly = true;
        expect(undoFiredWithTarget(input)).toBe(false);
      });

      it('disabledなinput[type=text]', () => {
        const input = appendInput('text');
        input.disabled = true;
        expect(undoFiredWithTarget(input)).toBe(false);
      });

      it('textarea', () => {
        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);
        expect(undoFiredWithTarget(textarea)).toBe(false);
      });

      it('contenteditable="true" の div', () => {
        const div = document.createElement('div');
        div.setAttribute('contenteditable', 'true');
        document.body.appendChild(div);
        expect(undoFiredWithTarget(div)).toBe(false);
      });
    });

    describe('文字入力中と判定されない（行操作を実行する）', () => {
      it('通常の div', () => {
        const div = document.createElement('div');
        document.body.appendChild(div);
        expect(undoFiredWithTarget(div)).toBe(true);
      });

      it('select 要素', () => {
        const select = document.createElement('select');
        document.body.appendChild(select);
        expect(undoFiredWithTarget(select)).toBe(true);
      });

      it('button 要素', () => {
        const button = document.createElement('button');
        document.body.appendChild(button);
        expect(undoFiredWithTarget(button)).toBe(true);
      });

      // 文字入力でない input type は抑止されない
      const nonTextInputTypes = ['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'];

      it.each(nonTextInputTypes)('input[type=%s]', (type) => {
        expect(undoFiredWithTarget(appendInput(type))).toBe(true);
      });

      it('contenteditable="false" の div', () => {
        const div = document.createElement('div');
        div.setAttribute('contenteditable', 'false');
        document.body.appendChild(div);
        expect(undoFiredWithTarget(div)).toBe(true);
      });

      it('contenteditable="" の div（空文字は true 扱いしない）', () => {
        const div = document.createElement('div');
        div.setAttribute('contenteditable', '');
        document.body.appendChild(div);
        expect(undoFiredWithTarget(div)).toBe(true);
      });

      it('target が null', () => {
        expect(undoFiredWithTarget(null)).toBe(true);
      });

      it('target が document（HTMLElement でない EventTarget）', () => {
        expect(undoFiredWithTarget(document)).toBe(true);
      });

      it('IME変換中（isComposing）でも判定は変わらない', () => {
        // 現行実装は isComposing / keyCode 229 を参照しない。
        // 切り出し時に IME 判定を足さない（＝挙動を変えない）ことを固定する。
        const div = document.createElement('div');
        document.body.appendChild(div);

        const event = new KeyboardEvent('keydown', {
          key: 'z',
          ctrlKey: true,
          isComposing: true,
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(event, 'target', { value: div });
        document.dispatchEvent(event);

        expect(undoManager.undo).toHaveBeenCalledTimes(1);
      });
    });
  });
});
