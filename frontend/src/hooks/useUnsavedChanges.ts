/**
 * @fileoverview 未保存変更時のページ離脱確認フック（beforeunload）
 *
 * Task 19: 未保存変更の検出を実装する
 * Task 100.24（quantity-table-generation）: API を一本化した
 *
 * 呼び出し側が持つ「未保存かどうか」（`isDirty`）を**直接受け取り**、それが真の間だけ
 * `beforeunload` ハンドラを登録してブラウザ標準の離脱確認を出す。フックは自前の dirty 状態を
 * 持たない。
 *
 * 旧 API は `enabled` を受け取りながら、登録条件が「`enabled` かつ**フック内部の** dirty」で
 * あったため、`enabled` だけを渡して `setDirty` / `markAsChanged` を呼ばない呼び出しは型が通るのに
 * 黙って無効化されていた（100.13 の実測。全6箇所の利用のうち3箇所が同じ注意書きを抱えていた）。
 * 入力を `isDirty` 1本に絞り、渡した値がそのまま登録条件になる形にしてこの罠を API から消した。
 * 未保存判定の正（reducer の状態、画面の state 等）は呼び出し側が持つ。
 *
 * アプリ内遷移のブロック（React Router の `useBlocker`）は本フックの責務外であり、呼び出し側が
 * 同じ `isDirty` で結線する。
 *
 * @see requirements.md - 要件9.3
 */

import { useEffect, useRef } from 'react';

/**
 * デフォルトの確認メッセージ
 */
const DEFAULT_MESSAGE = '保存されていない変更があります。このページを離れますか？';

/**
 * useUnsavedChanges フックのオプション
 */
export interface UseUnsavedChangesOptions {
  /**
   * 未保存の変更があるかどうか。真の間だけ beforeunload の離脱確認を登録する。
   * 省略できない（渡し忘れた呼び出しを型で弾くため）。
   */
  isDirty: boolean;

  /**
   * 確認ダイアログのメッセージ
   * @default '保存されていない変更があります。このページを離れますか？'
   */
  message?: string;
}

/**
 * 未保存変更時のページ離脱確認フック
 *
 * @example
 * ```tsx
 * function Editor() {
 *   const [isDirty, setIsDirty] = useState(false);
 *   useUnsavedChanges({ isDirty });
 *   const blocker = useBlocker(isDirty); // アプリ内遷移は呼び出し側で結線する
 *   // 編集で setIsDirty(true)、保存成功で setIsDirty(false)
 * }
 * ```
 *
 * @param options フックオプション
 */
export function useUnsavedChanges({
  isDirty,
  message = DEFAULT_MESSAGE,
}: UseUnsavedChangesOptions): void {
  // 現在のmessage値（beforeunloadハンドラから参照するため）
  const messageRef = useRef(message);

  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  // beforeunloadイベントハンドラ
  useEffect(() => {
    // 未保存の変更が無い間はリスナーを登録しない
    if (!isDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // 標準的なbeforeunloadの処理
      event.preventDefault();
      // Chrome requires returnValue to be set
      event.returnValue = messageRef.current;
      return messageRef.current;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);
}

export default useUnsavedChanges;
