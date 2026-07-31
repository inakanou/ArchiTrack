/**
 * @fileoverview キーボード入力判定ユーティリティ 単体テスト
 *
 * Task 53.11: 文字入力判定の共通ユーティリティ化
 *
 * Requirements (estimate-creation):
 * - 47.5: セルの文字入力中にキーボード操作が行われた場合、文字編集の操作を優先し行操作を実行しない
 *
 * Design: design.md `#### Frontend Domain` > `##### estimateKeymap`
 *   （`resolve` の文字入力中判定に用いる共通ユーティリティ）
 */

import { describe, it, expect, afterEach } from 'vitest';
import { isTextInputElement } from './keyboard-input';

/** input 要素を生成して body に追加する */
function appendInput(type?: string): HTMLInputElement {
  const input = document.createElement('input');
  if (type !== undefined) {
    input.setAttribute('type', type);
  }
  document.body.appendChild(input);
  return input;
}

/** 任意のタグの要素を生成して body に追加する */
function appendElement(tagName: string, attributes: Record<string, string> = {}): HTMLElement {
  const element = document.createElement(tagName);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  document.body.appendChild(element);
  return element;
}

describe('isTextInputElement', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('文字入力可能な要素（true）', () => {
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

    it.each(textInputTypes)('input[type=%s] は true', (type) => {
      expect(isTextInputElement(appendInput(type))).toBe(true);
    });

    it('type属性のないinputは true（既定でtext扱い）', () => {
      expect(isTextInputElement(appendInput())).toBe(true);
    });

    it('未知のtypeを持つinputは true（ブラウザがtextへフォールバックするため）', () => {
      expect(isTextInputElement(appendInput('unknown-type'))).toBe(true);
    });

    it('readOnlyなinput[type=text]は true', () => {
      const input = appendInput('text');
      input.readOnly = true;
      expect(isTextInputElement(input)).toBe(true);
    });

    it('disabledなinput[type=text]は true', () => {
      const input = appendInput('text');
      input.disabled = true;
      expect(isTextInputElement(input)).toBe(true);
    });

    it('textareaは true', () => {
      expect(isTextInputElement(appendElement('textarea'))).toBe(true);
    });

    it('disabledなtextareaは true', () => {
      const textarea = appendElement('textarea') as HTMLTextAreaElement;
      textarea.disabled = true;
      expect(isTextInputElement(textarea)).toBe(true);
    });

    it('contenteditable="true" の div は true', () => {
      expect(isTextInputElement(appendElement('div', { contenteditable: 'true' }))).toBe(true);
    });

    it('contenteditable="true" の span は true', () => {
      expect(isTextInputElement(appendElement('span', { contenteditable: 'true' }))).toBe(true);
    });

    it('isContentEditable プロパティが true の要素は true（属性が無くても判定する）', () => {
      // jsdom は contentEditable を実装しないため、プロパティ経路を明示的に検証する
      const div = appendElement('div');
      Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true });
      expect(isTextInputElement(div)).toBe(true);
    });
  });

  describe('文字入力可能でない要素（false）', () => {
    const nonTextInputTypes = [
      'checkbox',
      'radio',
      'button',
      'submit',
      'reset',
      'range',
      'color',
      'file',
      'image',
      'hidden',
    ];

    it.each(nonTextInputTypes)('input[type=%s] は false', (type) => {
      expect(isTextInputElement(appendInput(type))).toBe(false);
    });

    it('通常の div は false', () => {
      expect(isTextInputElement(appendElement('div'))).toBe(false);
    });

    it('select は false', () => {
      expect(isTextInputElement(appendElement('select'))).toBe(false);
    });

    it('button は false', () => {
      expect(isTextInputElement(appendElement('button'))).toBe(false);
    });

    it('td は false', () => {
      expect(isTextInputElement(appendElement('td'))).toBe(false);
    });

    it('contenteditable="false" の div は false', () => {
      expect(isTextInputElement(appendElement('div', { contenteditable: 'false' }))).toBe(false);
    });

    it('contenteditable="" の div は false（空文字は true 扱いしない）', () => {
      expect(isTextInputElement(appendElement('div', { contenteditable: '' }))).toBe(false);
    });

    it('contenteditable="plaintext-only" の div は false', () => {
      expect(isTextInputElement(appendElement('div', { contenteditable: 'plaintext-only' }))).toBe(
        false
      );
    });
  });

  describe('要素でない入力（false）', () => {
    it('null は false', () => {
      expect(isTextInputElement(null)).toBe(false);
    });

    it('document は false（HTMLElement でない EventTarget）', () => {
      expect(isTextInputElement(document)).toBe(false);
    });

    it('window は false（HTMLElement でない EventTarget）', () => {
      expect(isTextInputElement(window)).toBe(false);
    });

    it('SVG要素は false（HTMLElement でない Element）', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      document.body.appendChild(svg);
      expect(isTextInputElement(svg)).toBe(false);
    });
  });
});
