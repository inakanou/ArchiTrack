import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  focusOnError,
  scrollToError,
  announceError,
  setAriaInvalid,
  setAriaDescribedBy,
} from '../../utils/accessibility';

describe('accessibility utils', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('focusOnError', () => {
    it('指定されたIDの要素にフォーカスを当てる', () => {
      const input = document.createElement('input');
      input.id = 'email';
      document.body.appendChild(input);

      focusOnError('email');

      expect(document.activeElement).toBe(input);
    });

    it('要素が存在しない場合、エラーにならない', () => {
      expect(() => {
        focusOnError('non-existent');
      }).not.toThrow();
    });

    it('フォーカス可能でない要素の場合、エラーにならない', () => {
      const div = document.createElement('div');
      div.id = 'non-focusable';
      document.body.appendChild(div);

      expect(() => {
        focusOnError('non-focusable');
      }).not.toThrow();
    });
  });

  describe('scrollToError', () => {
    it('指定されたIDの要素までスクロールする', () => {
      const input = document.createElement('input');
      input.id = 'password';
      const scrollIntoViewMock = vi.fn();
      input.scrollIntoView = scrollIntoViewMock;
      document.body.appendChild(input);

      scrollToError('password');

      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
      });
    });

    it('要素が存在しない場合、エラーにならない', () => {
      expect(() => {
        scrollToError('non-existent');
      }).not.toThrow();
    });

    it('optionsを指定できる', () => {
      const input = document.createElement('input');
      input.id = 'username';
      const scrollIntoViewMock = vi.fn();
      input.scrollIntoView = scrollIntoViewMock;
      document.body.appendChild(input);

      scrollToError('username', { behavior: 'auto', block: 'start' });

      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: 'auto',
        block: 'start',
      });
    });
  });

  describe('announceError', () => {
    it('aria-live領域にエラーメッセージを追加する', () => {
      announceError('パスワードが正しくありません');

      const announcer = document.getElementById('a11y-announcer');
      expect(announcer).not.toBeNull();
      expect(announcer?.textContent).toBe('パスワードが正しくありません');
      expect(announcer?.getAttribute('aria-live')).toBe('polite');
      expect(announcer?.getAttribute('aria-atomic')).toBe('true');
    });

    it('既存のaria-live領域がある場合、再利用する', () => {
      announceError('最初のメッセージ');
      const firstAnnouncer = document.getElementById('a11y-announcer');

      announceError('2番目のメッセージ');
      const secondAnnouncer = document.getElementById('a11y-announcer');

      expect(firstAnnouncer).toBe(secondAnnouncer);
      expect(secondAnnouncer?.textContent).toBe('2番目のメッセージ');
    });

    it('aria-live領域は視覚的に隠される', () => {
      announceError('テストメッセージ');

      const announcer = document.getElementById('a11y-announcer');
      const style = announcer?.style;

      expect(style?.position).toBe('absolute');
      expect(style?.left).toBe('-10000px');
      expect(style?.width).toBe('1px');
      expect(style?.height).toBe('1px');
      expect(style?.overflow).toBe('hidden');
    });

    it('メッセージをクリアできる', () => {
      announceError('エラーメッセージ');
      const announcer = document.getElementById('a11y-announcer');
      expect(announcer?.textContent).toBe('エラーメッセージ');

      announceError('');
      expect(announcer?.textContent).toBe('');
    });
  });

  describe('setAriaInvalid', () => {
    it('aria-invalid属性をtrueに設定する', () => {
      const input = document.createElement('input');
      input.id = 'email';
      document.body.appendChild(input);

      setAriaInvalid('email', true);

      expect(input.getAttribute('aria-invalid')).toBe('true');
    });

    it('aria-invalid属性をfalseに設定する', () => {
      const input = document.createElement('input');
      input.id = 'email';
      input.setAttribute('aria-invalid', 'true');
      document.body.appendChild(input);

      setAriaInvalid('email', false);

      expect(input.getAttribute('aria-invalid')).toBe('false');
    });

    it('要素が存在しない場合、エラーにならない', () => {
      expect(() => {
        setAriaInvalid('non-existent', true);
      }).not.toThrow();
    });
  });

  describe('setAriaDescribedBy', () => {
    it('aria-describedby属性を設定する', () => {
      const input = document.createElement('input');
      input.id = 'email';
      document.body.appendChild(input);

      setAriaDescribedBy('email', 'email-error');

      expect(input.getAttribute('aria-describedby')).toBe('email-error');
    });

    it('複数のdescription IDを設定できる', () => {
      const input = document.createElement('input');
      input.id = 'password';
      document.body.appendChild(input);

      setAriaDescribedBy('password', 'password-help password-error');

      expect(input.getAttribute('aria-describedby')).toBe('password-help password-error');
    });

    it('空文字列を渡すと属性を削除する', () => {
      const input = document.createElement('input');
      input.id = 'email';
      input.setAttribute('aria-describedby', 'email-error');
      document.body.appendChild(input);

      setAriaDescribedBy('email', '');

      expect(input.hasAttribute('aria-describedby')).toBe(false);
    });

    it('要素が存在しない場合、エラーにならない', () => {
      expect(() => {
        setAriaDescribedBy('non-existent', 'error-message');
      }).not.toThrow();
    });
  });

  describe('統合テスト', () => {
    it('エラーハンドリングのフルフロー', () => {
      // フォーム要素を作成
      const input = document.createElement('input');
      input.id = 'email';
      const errorMessage = document.createElement('div');
      errorMessage.id = 'email-error';
      errorMessage.textContent = 'メールアドレスが無効です';
      const scrollIntoViewMock = vi.fn();
      input.scrollIntoView = scrollIntoViewMock;

      document.body.appendChild(input);
      document.body.appendChild(errorMessage);

      // エラーハンドリング
      setAriaInvalid('email', true);
      setAriaDescribedBy('email', 'email-error');
      announceError('メールアドレスが無効です');
      scrollToError('email');
      focusOnError('email');

      // 検証
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe('email-error');
      expect(document.getElementById('a11y-announcer')?.textContent).toBe(
        'メールアドレスが無効です'
      );
      expect(scrollIntoViewMock).toHaveBeenCalled();
      expect(document.activeElement).toBe(input);
    });
  });
});
