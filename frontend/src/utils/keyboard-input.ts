/**
 * @fileoverview キーボード入力判定ユーティリティ
 *
 * Task 53.11: 文字入力判定の共通ユーティリティ化
 *
 * キーボードショートカット側で「文字入力中かどうか」を判定するための共通ロジック。
 * `useUndoKeyboardShortcuts`（取り消し・やり直しのキー割当）と、
 * 見積明細のキー割当解決（`estimateKeymap`）が同一の判定を共有する。
 *
 * Requirements (estimate-creation):
 * - 47.5: セルの文字入力中にキーボード操作が行われた場合、文字編集の操作を優先し行操作を実行しない
 *
 * Design: design.md `#### Frontend Domain` > `##### estimateKeymap`
 *
 * このモジュールは UI・サーバーいずれにも依存しない（import なし）。
 */

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 文字入力を伴う input 要素の type
 *
 * type="button", type="submit", type="checkbox" などは文字入力を伴わないため含めない。
 */
const TEXT_INPUT_TYPES = [
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
] as const;

// ============================================================================
// 判定関数
// ============================================================================

/**
 * 対象の要素がテキスト入力可能な要素かどうかを判定
 *
 * input, textarea, contenteditable要素では文字編集の操作を優先するため、
 * キーボードショートカットによる操作を実行しない。
 *
 * @param element 判定対象の要素（キーボードイベントの target など）
 * @returns テキスト入力可能な要素の場合true
 *
 * @example
 * ```ts
 * document.addEventListener('keydown', (event) => {
 *   if (isTextInputElement(event.target)) {
 *     return; // 文字編集を優先し、ショートカットを実行しない
 *   }
 * });
 * ```
 */
export function isTextInputElement(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  // input要素
  if (element instanceof HTMLInputElement) {
    // type="button", type="submit" などは除外
    return (TEXT_INPUT_TYPES as readonly string[]).includes(element.type);
  }

  // textarea要素
  if (element instanceof HTMLTextAreaElement) {
    return true;
  }

  // contenteditable要素
  // isContentEditableプロパティに加え、属性もチェック（jsdom互換性）
  if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
    return true;
  }

  return false;
}
