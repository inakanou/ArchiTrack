/**
 * @fileoverview ネットワーク状態表示コンポーネント
 *
 * Task 18.4: ネットワーク状態監視 - UI表示
 *
 * オフライン時の警告バナーと、オンライン復帰時の通知を表示する。
 *
 * @see design.md - ネットワーク状態管理フロー
 * @see requirements.md - 要件13.6
 */

import React, { useState, useEffect } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

/**
 * コンポーネントのプロパティ
 */
export interface NetworkStatusIndicatorProps {
  /**
   * オンライン時に表示するかどうか（デフォルト: false）
   */
  showOnline?: boolean;
  /**
   * オフライン時のカスタムメッセージ
   */
  offlineMessage?: string;
  /**
   * 追加のCSSクラス名
   */
  className?: string;
  /**
   * オンラインに復帰したときのコールバック
   */
  onOnline?: () => void;
  /**
   * オフラインになったときのコールバック
   */
  onOffline?: () => void;
  /**
   * オンライン復帰時に通知を表示するかどうか（デフォルト: false）
   */
  showReconnected?: boolean;
  /**
   * 復帰通知の表示時間（ミリ秒、デフォルト: 3000）
   */
  reconnectedDuration?: number;
}

/**
 * デフォルトのオフラインメッセージ
 */
const DEFAULT_OFFLINE_MESSAGE = 'ネットワーク接続がありません。保存操作は接続復帰後に行えます。';

/**
 * 復帰通知のメッセージ
 */
const RECONNECTED_MESSAGE = 'ネットワーク接続が復帰しました';

/**
 * デフォルトの復帰通知表示時間（ミリ秒）
 */
const DEFAULT_RECONNECTED_DURATION = 3000;

/**
 * ネットワーク状態を表示するコンポーネント
 *
 * - オフライン時: 警告バナーを表示
 * - オンライン復帰時: 通知を表示（オプション）
 *
 * @example
 * ```tsx
 * // 基本的な使用例
 * <NetworkStatusIndicator />
 *
 * // コールバック付き
 * <NetworkStatusIndicator
 *   onOffline={() => console.log('オフラインになりました')}
 *   onOnline={() => console.log('オンラインに復帰しました')}
 * />
 *
 * // 復帰通知付き
 * <NetworkStatusIndicator showReconnected />
 * ```
 */
export function NetworkStatusIndicator({
  showOnline = false,
  offlineMessage = DEFAULT_OFFLINE_MESSAGE,
  className = '',
  onOnline,
  onOffline,
  showReconnected = false,
  reconnectedDuration = DEFAULT_RECONNECTED_DURATION,
}: NetworkStatusIndicatorProps): React.ReactElement | null {
  // 復帰通知の表示状態
  const [showReconnectedNotice, setShowReconnectedNotice] = useState(false);

  // ネットワーク状態を監視
  const { isOnline } = useNetworkStatus({
    onOnline: () => {
      // 復帰通知を表示
      if (showReconnected) {
        setShowReconnectedNotice(true);
      }
      onOnline?.();
    },
    onOffline,
  });

  // 復帰通知のタイマー
  useEffect(() => {
    if (showReconnectedNotice) {
      const timer = setTimeout(() => {
        setShowReconnectedNotice(false);
      }, reconnectedDuration);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [showReconnectedNotice, reconnectedDuration]);

  // オフライン時：警告バナーを表示
  if (!isOnline) {
    return (
      <div
        role="alert"
        aria-live="polite"
        className={`flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800 ${className}`}
      >
        {/* 警告アイコン */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-6 w-6 flex-shrink-0"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
        <span>{offlineMessage}</span>
      </div>
    );
  }

  // 復帰通知を表示
  if (showReconnectedNotice) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-3 rounded-lg border border-green-300 bg-green-50 p-4 text-green-800 ${className}`}
      >
        {/* チェックアイコン */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-6 w-6 flex-shrink-0"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
        <span>{RECONNECTED_MESSAGE}</span>
      </div>
    );
  }

  // オンライン表示（オプション）
  if (showOnline) {
    return (
      <div role="status" className={`flex items-center gap-2 text-sm text-green-600 ${className}`}>
        {/* オンラインインジケータ */}
        <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
        <span>オンライン</span>
      </div>
    );
  }

  // 何も表示しない
  return null;
}

export default NetworkStatusIndicator;
