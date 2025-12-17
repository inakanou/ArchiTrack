/**
 * @fileoverview ネットワーク状態監視フック
 *
 * Task 18.4: ネットワーク状態監視を実装する
 *
 * navigator.onLineを使用してネットワーク接続状態を監視し、
 * オフライン時の警告表示・保存操作のブロック・オンライン復帰時の通知を提供する。
 *
 * @see design.md - ネットワーク状態管理フロー
 * @see requirements.md - 要件13.6
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * ネットワーク状態の型
 */
export type NetworkStatus = 'online' | 'offline';

/**
 * フックのオプション
 */
export interface UseNetworkStatusOptions {
  /**
   * オンラインに復帰したときのコールバック
   */
  onOnline?: () => void;
  /**
   * オフラインになったときのコールバック
   */
  onOffline?: () => void;
}

/**
 * フックの戻り値
 */
export interface UseNetworkStatusReturn {
  /**
   * 現在オンラインかどうか
   */
  isOnline: boolean;
  /**
   * ネットワーク状態（'online' | 'offline'）
   */
  status: NetworkStatus;
  /**
   * サーバーへの保存操作が可能かどうか
   * オフライン時はfalse
   */
  canSave: boolean;
  /**
   * オフライン時の警告メッセージ
   * オンライン時はnull
   */
  warningMessage: string | null;
  /**
   * 最後にオフラインになった時刻
   */
  lastOfflineAt: Date | null;
  /**
   * 最後にオンラインに復帰した時刻
   */
  lastOnlineAt: Date | null;
  /**
   * オフライン継続時間を取得する（ミリ秒）
   * オンライン時は0を返す
   */
  getOfflineDuration: () => number;
}

/**
 * オフライン時の警告メッセージ
 */
const OFFLINE_WARNING_MESSAGE = 'ネットワーク接続がありません。保存操作は接続復帰後に行えます。';

/**
 * ネットワーク状態を監視するカスタムフック
 *
 * - navigator.onLineによる接続状態監視
 * - オフライン時の警告メッセージ提供
 * - 保存可能判定（canSave）
 * - 状態変更時のコールバック
 *
 * @example
 * ```tsx
 * function AnnotationEditor() {
 *   const { isOnline, canSave, warningMessage } = useNetworkStatus({
 *     onOffline: () => {
 *       toast.warning('オフラインになりました');
 *     },
 *     onOnline: () => {
 *       toast.success('オンラインに復帰しました');
 *     }
 *   });
 *
 *   const handleSave = () => {
 *     if (!canSave) {
 *       toast.error(warningMessage);
 *       return;
 *     }
 *     // サーバーに保存
 *   };
 *
 *   return (
 *     <div>
 *       {!isOnline && <Alert>{warningMessage}</Alert>}
 *       <button onClick={handleSave} disabled={!canSave}>
 *         保存
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 *
 * @param options - オプション設定
 * @returns ネットワーク状態情報
 */
export function useNetworkStatus(options: UseNetworkStatusOptions = {}): UseNetworkStatusReturn {
  const { onOnline, onOffline } = options;

  // 現在の接続状態
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // 最後にオフラインになった時刻
  const [lastOfflineAt, setLastOfflineAt] = useState<Date | null>(null);

  // 最後にオンラインに復帰した時刻
  const [lastOnlineAt, setLastOnlineAt] = useState<Date | null>(null);

  // 初期レンダリングかどうか（コールバックの重複呼び出し防止）
  const isInitialMount = useRef(true);

  // 前回の状態を保持（状態変更の検出用）
  const prevOnlineRef = useRef<boolean>(isOnline);

  /**
   * オンラインになったときのハンドラー
   */
  const handleOnline = useCallback(() => {
    setIsOnline(true);
    setLastOnlineAt(new Date());
  }, []);

  /**
   * オフラインになったときのハンドラー
   */
  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setLastOfflineAt(new Date());
  }, []);

  // イベントリスナーの登録・解除
  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  // 状態変更時のコールバック実行
  useEffect(() => {
    // 初期マウント時はコールバックを呼ばない
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevOnlineRef.current = isOnline;
      return;
    }

    // 状態が変わった場合のみコールバックを呼ぶ
    if (prevOnlineRef.current !== isOnline) {
      if (isOnline && onOnline) {
        onOnline();
      } else if (!isOnline && onOffline) {
        onOffline();
      }
      prevOnlineRef.current = isOnline;
    }
  }, [isOnline, onOnline, onOffline]);

  /**
   * オフライン継続時間を取得する
   */
  const getOfflineDuration = useCallback((): number => {
    if (isOnline || !lastOfflineAt) {
      return 0;
    }
    return Date.now() - lastOfflineAt.getTime();
  }, [isOnline, lastOfflineAt]);

  // ネットワーク状態
  const status: NetworkStatus = isOnline ? 'online' : 'offline';

  // サーバー保存可能判定
  const canSave = isOnline;

  // 警告メッセージ
  const warningMessage = isOnline ? null : OFFLINE_WARNING_MESSAGE;

  return {
    isOnline,
    status,
    canSave,
    warningMessage,
    lastOfflineAt,
    lastOnlineAt,
    getOfflineDuration,
  };
}

export default useNetworkStatus;
