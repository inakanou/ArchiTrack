/**
 * @fileoverview ネットワークエラー表示コンポーネント
 *
 * Task 13.2: ネットワークエラー対応
 *
 * Requirements:
 * - 18.1: ネットワークエラー時のエラーメッセージ表示を実装
 * - 18.2: 再試行ボタンの表示と機能を実装
 * - 18.3: サーバーエラー（5xx）時のメッセージ表示を実装
 * - 18.6: セッション期限切れ時のリダイレクトを実装
 */

import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NetworkErrorState, ErrorType } from '../hooks/useNetworkError';

/**
 * NetworkErrorDisplayコンポーネントのProps
 */
export interface NetworkErrorDisplayProps {
  /** エラー状態（nullの場合は表示しない） */
  error: NetworkErrorState | null;
  /** 再試行関数 */
  onRetry: () => void;
  /** エラーを閉じる関数 */
  onDismiss: () => void;
  /** 再試行中かどうか */
  isRetrying?: boolean;
}

/**
 * エラータイプごとのスタイル設定
 */
const ERROR_STYLES: Record<
  ErrorType,
  { backgroundColor: string; borderColor: string; color: string; iconColor: string }
> = {
  network: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffc107',
    color: '#856404',
    iconColor: '#856404',
  },
  server: {
    backgroundColor: '#f8d7da',
    borderColor: '#dc3545',
    color: '#721c24',
    iconColor: '#721c24',
  },
  session: {
    backgroundColor: '#d1ecf1',
    borderColor: '#17a2b8',
    color: '#0c5460',
    iconColor: '#0c5460',
  },
  client: {
    backgroundColor: '#f8d7da',
    borderColor: '#dc3545',
    color: '#721c24',
    iconColor: '#721c24',
  },
  unknown: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffc107',
    color: '#856404',
    iconColor: '#856404',
  },
};

/**
 * エラータイプごとのアイコン
 */
const ERROR_ICONS: Record<ErrorType, string> = {
  network: '🔌',
  server: '⚠️',
  session: '🔒',
  client: '❌',
  unknown: '⚠️',
};

/**
 * ネットワークエラー表示コンポーネント
 *
 * エラーの種類に応じて適切なメッセージと操作ボタンを表示します。
 * - ネットワークエラー: 再試行ボタンを表示
 * - サーバーエラー: メッセージのみ表示
 * - セッション期限切れ: ログインページへのリダイレクトボタンを表示
 */
function NetworkErrorDisplay({
  error,
  onRetry,
  onDismiss,
  isRetrying = false,
}: NetworkErrorDisplayProps) {
  const navigate = useNavigate();

  // Escapeキーでエラーを閉じる
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss();
      }
    },
    [onDismiss]
  );

  useEffect(() => {
    if (error) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
    return undefined;
  }, [error, handleKeyDown]);

  // エラーがない場合は何も表示しない
  if (!error) {
    return null;
  }

  const styles = ERROR_STYLES[error.type];
  const icon = ERROR_ICONS[error.type];

  // ログインページへリダイレクト
  const handleLoginRedirect = () => {
    navigate('/login');
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      tabIndex={-1}
      style={{
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        maxWidth: '500px',
        width: '90%',
        padding: '16px 20px',
        borderRadius: '8px',
        border: `2px solid ${styles.borderColor}`,
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* メッセージ部分 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
        }}
      >
        {/* アイコン */}
        <span
          style={{
            fontSize: '24px',
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          {icon}
        </span>

        {/* メッセージ */}
        <p
          style={{
            margin: 0,
            fontSize: '14px',
            lineHeight: '1.5',
            flex: 1,
          }}
        >
          {error.message}
        </p>

        {/* 閉じるボタン */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="閉じる"
          style={{
            background: 'none',
            border: 'none',
            color: styles.color,
            cursor: 'pointer',
            padding: '4px',
            fontSize: '18px',
            lineHeight: 1,
            opacity: 0.7,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.7';
          }}
        >
          ×
        </button>
      </div>

      {/* アクションボタン部分 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
        }}
      >
        {/* 再試行ボタン（canRetryがtrueの場合のみ表示） */}
        {error.canRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            aria-label={isRetrying ? '再試行中' : '再試行'}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#fff',
              backgroundColor: isRetrying ? '#6c757d' : styles.borderColor,
              border: 'none',
              borderRadius: '4px',
              cursor: isRetrying ? 'not-allowed' : 'pointer',
              opacity: isRetrying ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isRetrying ? (
              <>
                <span
                  style={{
                    display: 'inline-block',
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                再試行中...
              </>
            ) : (
              '再試行'
            )}
          </button>
        )}

        {/* ログインページへリダイレクトボタン（セッション期限切れの場合のみ表示） */}
        {error.shouldRedirect && (
          <button
            type="button"
            onClick={handleLoginRedirect}
            aria-label="ログインページへ"
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#fff',
              backgroundColor: styles.borderColor,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            ログインページへ
          </button>
        )}
      </div>

      {/* スピナーアニメーション用のスタイル */}
      <style>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

export default NetworkErrorDisplay;
