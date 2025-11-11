/**
 * アクセシビリティユーティリティ関数
 *
 * フォーカス制御、スクロール制御、ARIAアナウンスなどのアクセシビリティ機能を提供します。
 */

/**
 * 指定された要素にフォーカスを当てる
 *
 * @param elementId - フォーカスを当てる要素のID
 *
 * @example
 * ```ts
 * focusOnError('email-input');
 * ```
 */
export function focusOnError(elementId: string): void {
  const element = document.getElementById(elementId);
  if (element && typeof element.focus === 'function') {
    try {
      element.focus();
    } catch {
      // フォーカスできない要素の場合は無視
    }
  }
}

/**
 * 指定された要素までスクロールする
 *
 * @param elementId - スクロール先の要素のID
 * @param options - スクロールオプション
 *
 * @example
 * ```ts
 * scrollToError('email-input');
 * scrollToError('email-input', { behavior: 'auto', block: 'start' });
 * ```
 */
export function scrollToError(
  elementId: string,
  options: ScrollIntoViewOptions = { behavior: 'smooth', block: 'center' }
): void {
  const element = document.getElementById(elementId);
  if (element && typeof element.scrollIntoView === 'function') {
    try {
      element.scrollIntoView(options);
    } catch {
      // スクロールできない場合は無視
    }
  }
}

/**
 * スクリーンリーダー用のエラーアナウンス
 *
 * aria-live領域にメッセージを追加します。
 * 領域が存在しない場合は自動的に作成します。
 *
 * @param message - アナウンスするメッセージ（空文字列でクリア）
 *
 * @example
 * ```ts
 * announceError('パスワードが正しくありません');
 * announceError(''); // メッセージをクリア
 * ```
 */
export function announceError(message: string): void {
  const announcerId = 'a11y-announcer';
  let announcer = document.getElementById(announcerId);

  // aria-live領域が存在しない場合は作成
  if (!announcer) {
    announcer = document.createElement('div');
    announcer.id = announcerId;
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');

    // 視覚的に隠す（スクリーンリーダーには読み上げられる）
    announcer.style.position = 'absolute';
    announcer.style.left = '-10000px';
    announcer.style.width = '1px';
    announcer.style.height = '1px';
    announcer.style.overflow = 'hidden';

    document.body.appendChild(announcer);
  }

  // メッセージを設定
  announcer.textContent = message;
}

/**
 * aria-invalid属性を設定する
 *
 * @param elementId - 要素のID
 * @param isInvalid - 無効な状態かどうか
 *
 * @example
 * ```ts
 * setAriaInvalid('email-input', true);
 * setAriaInvalid('email-input', false);
 * ```
 */
export function setAriaInvalid(elementId: string, isInvalid: boolean): void {
  const element = document.getElementById(elementId);
  if (element) {
    element.setAttribute('aria-invalid', String(isInvalid));
  }
}

/**
 * aria-describedby属性を設定する
 *
 * @param elementId - 要素のID
 * @param descriptionId - 説明要素のID（空文字列で属性を削除）
 *
 * @example
 * ```ts
 * setAriaDescribedBy('email-input', 'email-error');
 * setAriaDescribedBy('password-input', 'password-help password-error');
 * setAriaDescribedBy('email-input', ''); // 属性を削除
 * ```
 */
export function setAriaDescribedBy(elementId: string, descriptionId: string): void {
  const element = document.getElementById(elementId);
  if (element) {
    if (descriptionId) {
      element.setAttribute('aria-describedby', descriptionId);
    } else {
      element.removeAttribute('aria-describedby');
    }
  }
}
