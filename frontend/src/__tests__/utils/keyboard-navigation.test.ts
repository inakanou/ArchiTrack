/**
 * @fileoverview キーボードナビゲーション ユニットテスト
 *
 * Task 12.1: キーボードナビゲーションの実装
 *
 * Requirements:
 * - 20.1: すべての操作をキーボードのみで実行可能にする
 * - 20.4: フォーカス状態を視覚的に明確に表示
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleKeyboardActivation,
  handleArrowNavigation,
  isActivationKey,
  isCancelKey,
  isNavigationKey,
  getFocusableElements,
  focusFirst,
  focusLast,
  focusNext,
  focusPrevious,
  FOCUS_VISIBLE_STYLES,
  FOCUS_VISIBLE_HIGH_CONTRAST_STYLES,
  createKeyboardNavigationHandler,
  createActivationHandler,
} from '../../utils/keyboard-navigation';

describe('keyboard-navigation utils', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('isActivationKey', () => {
    it('Enter キーで true を返す', () => {
      expect(isActivationKey('Enter')).toBe(true);
    });

    it('Space キーで true を返す', () => {
      expect(isActivationKey(' ')).toBe(true);
    });

    it('その他のキーで false を返す', () => {
      expect(isActivationKey('Tab')).toBe(false);
      expect(isActivationKey('Escape')).toBe(false);
      expect(isActivationKey('a')).toBe(false);
    });
  });

  describe('isCancelKey', () => {
    it('Escape キーで true を返す', () => {
      expect(isCancelKey('Escape')).toBe(true);
    });

    it('その他のキーで false を返す', () => {
      expect(isCancelKey('Enter')).toBe(false);
      expect(isCancelKey('Tab')).toBe(false);
    });
  });

  describe('isNavigationKey', () => {
    it('矢印キーで true を返す', () => {
      expect(isNavigationKey('ArrowUp')).toBe(true);
      expect(isNavigationKey('ArrowDown')).toBe(true);
      expect(isNavigationKey('ArrowLeft')).toBe(true);
      expect(isNavigationKey('ArrowRight')).toBe(true);
    });

    it('Home/End キーで true を返す', () => {
      expect(isNavigationKey('Home')).toBe(true);
      expect(isNavigationKey('End')).toBe(true);
    });

    it('その他のキーで false を返す', () => {
      expect(isNavigationKey('Enter')).toBe(false);
      expect(isNavigationKey('Tab')).toBe(false);
    });
  });

  describe('handleKeyboardActivation', () => {
    it('Enter キーでハンドラを呼び出す', () => {
      const handler = vi.fn();
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      const preventDefault = vi.spyOn(event, 'preventDefault');

      handleKeyboardActivation(event, handler);

      expect(handler).toHaveBeenCalledOnce();
      expect(preventDefault).toHaveBeenCalled();
    });

    it('Space キーでハンドラを呼び出す', () => {
      const handler = vi.fn();
      const event = new KeyboardEvent('keydown', { key: ' ' });
      const preventDefault = vi.spyOn(event, 'preventDefault');

      handleKeyboardActivation(event, handler);

      expect(handler).toHaveBeenCalledOnce();
      expect(preventDefault).toHaveBeenCalled();
    });

    it('その他のキーではハンドラを呼び出さない', () => {
      const handler = vi.fn();
      const event = new KeyboardEvent('keydown', { key: 'Tab' });

      handleKeyboardActivation(event, handler);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('handleArrowNavigation', () => {
    it('ArrowDown で次の要素にフォーカスを移動', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
        <button id="btn3">Button 3</button>
      `;
      document.body.appendChild(container);

      const btn1 = document.getElementById('btn1') as HTMLElement;
      btn1.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      const preventDefault = vi.spyOn(event, 'preventDefault');

      handleArrowNavigation(event, container);

      expect(document.activeElement?.id).toBe('btn2');
      expect(preventDefault).toHaveBeenCalled();
    });

    it('ArrowUp で前の要素にフォーカスを移動', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
        <button id="btn3">Button 3</button>
      `;
      document.body.appendChild(container);

      const btn2 = document.getElementById('btn2') as HTMLElement;
      btn2.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      handleArrowNavigation(event, container);

      expect(document.activeElement?.id).toBe('btn1');
    });

    it('Home で最初の要素にフォーカスを移動', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
        <button id="btn3">Button 3</button>
      `;
      document.body.appendChild(container);

      const btn3 = document.getElementById('btn3') as HTMLElement;
      btn3.focus();

      const event = new KeyboardEvent('keydown', { key: 'Home' });
      handleArrowNavigation(event, container);

      expect(document.activeElement?.id).toBe('btn1');
    });

    it('End で最後の要素にフォーカスを移動', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
        <button id="btn3">Button 3</button>
      `;
      document.body.appendChild(container);

      const btn1 = document.getElementById('btn1') as HTMLElement;
      btn1.focus();

      const event = new KeyboardEvent('keydown', { key: 'End' });
      handleArrowNavigation(event, container);

      expect(document.activeElement?.id).toBe('btn3');
    });

    it('最後の要素で ArrowDown を押すと最初の要素に循環', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      const btn2 = document.getElementById('btn2') as HTMLElement;
      btn2.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      handleArrowNavigation(event, container, { circular: true });

      expect(document.activeElement?.id).toBe('btn1');
    });

    it('最初の要素で ArrowUp を押すと最後の要素に循環', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      const btn1 = document.getElementById('btn1') as HTMLElement;
      btn1.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      handleArrowNavigation(event, container, { circular: true });

      expect(document.activeElement?.id).toBe('btn2');
    });

    it('circular: false の場合は循環しない', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      const btn2 = document.getElementById('btn2') as HTMLElement;
      btn2.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      handleArrowNavigation(event, container, { circular: false });

      expect(document.activeElement?.id).toBe('btn2');
    });
  });

  describe('getFocusableElements', () => {
    it('フォーカス可能な要素を取得する', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button>Button</button>
        <a href="http://example.com">Link</a>
        <input type="text" />
        <textarea></textarea>
        <select><option>Option</option></select>
        <div tabindex="0">Div with tabindex</div>
      `;
      document.body.appendChild(container);

      const focusable = getFocusableElements(container);
      expect(focusable).toHaveLength(6);
    });

    it('disabled な要素は除外される', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button>Button 1</button>
        <button disabled>Button 2</button>
        <input type="text" disabled />
      `;
      document.body.appendChild(container);

      const focusable = getFocusableElements(container);
      expect(focusable).toHaveLength(1);
    });

    it('tabindex="-1" の要素は除外される', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button>Button</button>
        <div tabindex="-1">Not focusable</div>
        <div tabindex="0">Focusable</div>
      `;
      document.body.appendChild(container);

      const focusable = getFocusableElements(container);
      expect(focusable).toHaveLength(2);
    });

    it('null が渡された場合は空の配列を返す', () => {
      const focusable = getFocusableElements(null);
      expect(focusable).toHaveLength(0);
    });
  });

  describe('focusFirst', () => {
    it('最初のフォーカス可能な要素にフォーカスを当てる', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      focusFirst(container);

      expect(document.activeElement?.id).toBe('btn1');
    });

    it('フォーカス可能な要素がない場合は何もしない', () => {
      const container = document.createElement('div');
      container.innerHTML = '<div>No focusable elements</div>';
      document.body.appendChild(container);

      const previousActive = document.activeElement;
      focusFirst(container);

      expect(document.activeElement).toBe(previousActive);
    });
  });

  describe('focusLast', () => {
    it('最後のフォーカス可能な要素にフォーカスを当てる', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      focusLast(container);

      expect(document.activeElement?.id).toBe('btn2');
    });
  });

  describe('focusNext', () => {
    it('次のフォーカス可能な要素にフォーカスを当てる', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
        <button id="btn3">Button 3</button>
      `;
      document.body.appendChild(container);

      const btn1 = document.getElementById('btn1') as HTMLElement;
      btn1.focus();

      focusNext(container);

      expect(document.activeElement?.id).toBe('btn2');
    });

    it('最後の要素で circular: true の場合は最初の要素にフォーカス', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      const btn2 = document.getElementById('btn2') as HTMLElement;
      btn2.focus();

      focusNext(container, { circular: true });

      expect(document.activeElement?.id).toBe('btn1');
    });
  });

  describe('focusPrevious', () => {
    it('前のフォーカス可能な要素にフォーカスを当てる', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
        <button id="btn3">Button 3</button>
      `;
      document.body.appendChild(container);

      const btn3 = document.getElementById('btn3') as HTMLElement;
      btn3.focus();

      focusPrevious(container);

      expect(document.activeElement?.id).toBe('btn2');
    });

    it('最初の要素で circular: true の場合は最後の要素にフォーカス', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      const btn1 = document.getElementById('btn1') as HTMLElement;
      btn1.focus();

      focusPrevious(container, { circular: true });

      expect(document.activeElement?.id).toBe('btn2');
    });
  });

  describe('FOCUS_VISIBLE_STYLES', () => {
    it('フォーカススタイルが定義されている', () => {
      expect(FOCUS_VISIBLE_STYLES).toBeDefined();
      expect(FOCUS_VISIBLE_STYLES.outline).toBeDefined();
      expect(FOCUS_VISIBLE_STYLES.outlineOffset).toBeDefined();
    });

    it('アウトラインの色が指定されている', () => {
      expect(FOCUS_VISIBLE_STYLES.outline).toContain('2px');
      expect(FOCUS_VISIBLE_STYLES.outline).toContain('solid');
    });
  });

  describe('createKeyboardNavigationHandler', () => {
    it('矢印キーナビゲーションを正しく処理する', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      const btn1 = document.getElementById('btn1') as HTMLElement;
      btn1.focus();

      const handler = createKeyboardNavigationHandler({ circular: true });
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });

      handler(event, container);

      expect(document.activeElement?.id).toBe('btn2');
    });
  });

  describe('createActivationHandler', () => {
    it('Enterキーでハンドラを呼び出す', () => {
      const handler = vi.fn();
      const activationHandler = createActivationHandler(handler);

      const mockEvent = {
        key: 'Enter',
        nativeEvent: new KeyboardEvent('keydown', { key: 'Enter' }),
      } as unknown as React.KeyboardEvent;

      activationHandler(mockEvent);

      expect(handler).toHaveBeenCalled();
    });

    it('Spaceキーでハンドラを呼び出す', () => {
      const handler = vi.fn();
      const activationHandler = createActivationHandler(handler);

      const mockEvent = {
        key: ' ',
        nativeEvent: new KeyboardEvent('keydown', { key: ' ' }),
      } as unknown as React.KeyboardEvent;

      activationHandler(mockEvent);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('FOCUS_VISIBLE_HIGH_CONTRAST_STYLES', () => {
    it('高コントラストフォーカススタイルが定義されている', () => {
      expect(FOCUS_VISIBLE_HIGH_CONTRAST_STYLES).toBeDefined();
      expect(FOCUS_VISIBLE_HIGH_CONTRAST_STYLES.outline).toContain('3px');
      expect(FOCUS_VISIBLE_HIGH_CONTRAST_STYLES.outline).toContain('#000000');
    });
  });

  describe('handleArrowNavigation - ArrowRight/ArrowLeft', () => {
    it('ArrowRight で次の要素にフォーカスを移動', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      const btn1 = document.getElementById('btn1') as HTMLElement;
      btn1.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      const preventDefault = vi.spyOn(event, 'preventDefault');

      handleArrowNavigation(event, container);

      expect(document.activeElement?.id).toBe('btn2');
      expect(preventDefault).toHaveBeenCalled();
    });

    it('ArrowLeft で前の要素にフォーカスを移動', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      const btn2 = document.getElementById('btn2') as HTMLElement;
      btn2.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
      handleArrowNavigation(event, container);

      expect(document.activeElement?.id).toBe('btn1');
    });

    it('最後の要素で ArrowRight を押すと最初の要素に循環', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      const btn2 = document.getElementById('btn2') as HTMLElement;
      btn2.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      handleArrowNavigation(event, container, { circular: true });

      expect(document.activeElement?.id).toBe('btn1');
    });

    it('最初の要素で ArrowLeft を押すと最後の要素に循環', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      const btn1 = document.getElementById('btn1') as HTMLElement;
      btn1.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
      handleArrowNavigation(event, container, { circular: true });

      expect(document.activeElement?.id).toBe('btn2');
    });
  });

  describe('focusNext/focusPrevious - edge cases', () => {
    it('フォーカスがない状態でfocusNextを呼ぶと最初の要素にフォーカス', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      // フォーカスをbodyに移動（コンテナ外）
      document.body.focus();

      focusNext(container);

      expect(document.activeElement?.id).toBe('btn1');
    });

    it('フォーカスがない状態でfocusPreviousを呼ぶと最後の要素にフォーカス', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      // フォーカスをbodyに移動（コンテナ外）
      document.body.focus();

      focusPrevious(container);

      expect(document.activeElement?.id).toBe('btn2');
    });

    it('最後の要素でcircular: falseの場合focusNextは何もしない', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      const btn2 = document.getElementById('btn2') as HTMLElement;
      btn2.focus();

      focusNext(container, { circular: false });

      expect(document.activeElement?.id).toBe('btn2');
    });

    it('最初の要素でcircular: falseの場合focusPreviousは何もしない', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      const btn1 = document.getElementById('btn1') as HTMLElement;
      btn1.focus();

      focusPrevious(container, { circular: false });

      expect(document.activeElement?.id).toBe('btn1');
    });

    it('空のコンテナでfocusNextは何もしない', () => {
      const container = document.createElement('div');
      container.innerHTML = '<div>No buttons</div>';
      document.body.appendChild(container);

      const previousActive = document.activeElement;
      focusNext(container);

      expect(document.activeElement).toBe(previousActive);
    });

    it('空のコンテナでfocusPreviousは何もしない', () => {
      const container = document.createElement('div');
      container.innerHTML = '<div>No buttons</div>';
      document.body.appendChild(container);

      const previousActive = document.activeElement;
      focusPrevious(container);

      expect(document.activeElement).toBe(previousActive);
    });
  });

  describe('focusLast - edge cases', () => {
    it('フォーカス可能な要素がない場合は何もしない', () => {
      const container = document.createElement('div');
      container.innerHTML = '<div>No focusable elements</div>';
      document.body.appendChild(container);

      const previousActive = document.activeElement;
      focusLast(container);

      expect(document.activeElement).toBe(previousActive);
    });
  });

  describe('handleArrowNavigation - non-navigation keys', () => {
    it('ナビゲーションキー以外では何もしない', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
      `;
      document.body.appendChild(container);

      const btn1 = document.getElementById('btn1') as HTMLElement;
      btn1.focus();

      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      const preventDefault = vi.spyOn(event, 'preventDefault');

      handleArrowNavigation(event, container);

      expect(document.activeElement?.id).toBe('btn1');
      expect(preventDefault).not.toHaveBeenCalled();
    });
  });
});
