/**
 * @fileoverview 現場調査エラー表示コンポーネント
 *
 * Task 11.2: エラー表示の実装
 *
 * Requirements:
 * - 14.8: エラー発生時に適切なエラーメッセージを表示し、Sentryにログを送信する
 *
 * 機能:
 * - バリデーションエラー表示
 * - ネットワークエラー表示
 * - サーバーエラー表示
 * - 再試行ボタン機能
 * - ログインページへのリダイレクト
 */

import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SiteSurveyErrorState, SiteSurveyErrorType } from '../../hooks/useSiteSurveyError';

// ============================================================================
// 型定義
// ============================================================================

/**
 * SiteSurveyErrorDisplayコンポーネントのProps
 */
export interface SiteSurveyErrorDisplayProps {
  /** エラー状態（nullの場合は表示しない） */
  error: SiteSurveyErrorState | null;
  /** 再試行関数 */
  onRetry: () => void;
  /** エラーを閉じる関数 */
  onDismiss: () => void;
  /** 再試行中かどうか */
  isRetrying?: boolean;
  /** インラインモード（固定位置ではなくフロー内に表示） */
  inline?: boolean;
}

// ============================================================================
// 定数
// ============================================================================

/**
 * エラータイプごとのスタイル設定
 */
const ERROR_STYLES: Record<
  SiteSurveyErrorType,
  { backgroundColor: string; borderColor: string; color: string; iconColor: string }
> = {
  validation: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    color: '#991b1b',
    iconColor: '#dc2626',
  },
  network: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
    color: '#9a3412',
    iconColor: '#ea580c',
  },
  server: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    color: '#991b1b',
    iconColor: '#dc2626',
  },
  session: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    color: '#1e40af',
    iconColor: '#2563eb',
  },
  conflict: {
    backgroundColor: '#fef3c7',
    borderColor: '#fcd34d',
    color: '#92400e',
    iconColor: '#f59e0b',
  },
  notFound: {
    backgroundColor: '#f3f4f6',
    borderColor: '#d1d5db',
    color: '#374151',
    iconColor: '#6b7280',
  },
  forbidden: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    color: '#991b1b',
    iconColor: '#dc2626',
  },
  client: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    color: '#991b1b',
    iconColor: '#dc2626',
  },
  unsupportedFileType: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    color: '#991b1b',
    iconColor: '#dc2626',
  },
  fileTooLarge: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    color: '#991b1b',
    iconColor: '#dc2626',
  },
  unknown: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
    color: '#9a3412',
    iconColor: '#ea580c',
  },
};

/**
 * エラータイプごとのアイコン（SVG path）
 */
const ERROR_ICONS: Record<SiteSurveyErrorType, string> = {
  validation:
    'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  network:
    'M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.142 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0',
  server:
    'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  session:
    'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  conflict: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  notFound: 'M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  forbidden:
    'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
  client:
    'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  unsupportedFileType:
    'M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  fileTooLarge:
    'M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  unknown:
    'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
};

// ============================================================================
// ヘルパーコンポーネント
// ============================================================================

/**
 * スピナーアイコン
 */
function SpinnerIcon(): React.ReactElement {
  return (
    <span
      role="status"
      aria-label="ローディング中"
      style={{
        display: 'inline-block',
        width: '14px',
        height: '14px',
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'site-survey-error-spin 1s linear infinite',
      }}
    />
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 現場調査エラー表示コンポーネント
 *
 * エラーの種類に応じて適切なメッセージと操作ボタンを表示します。
 * - バリデーションエラー: フィールドエラーのリストを表示
 * - ネットワークエラー: 再試行ボタンを表示
 * - サーバーエラー: メッセージのみ表示
 * - セッション期限切れ: ログインページへのリダイレクトボタンを表示
 *
 * @example
 * ```tsx
 * const { error, retry, clearError, isRetrying } = useSiteSurveyError();
 *
 * <SiteSurveyErrorDisplay
 *   error={error}
 *   onRetry={retry}
 *   onDismiss={clearError}
 *   isRetrying={isRetrying}
 * />
 * ```
 */
function SiteSurveyErrorDisplay({
  error,
  onRetry,
  onDismiss,
  isRetrying = false,
  inline = false,
}: SiteSurveyErrorDisplayProps): React.ReactNode {
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
  const iconPath = ERROR_ICONS[error.type];

  // ログインページへリダイレクト
  const handleLoginRedirect = () => {
    navigate('/login');
  };

  // コンテナスタイル
  const containerStyle: React.CSSProperties = inline
    ? {
        width: '100%',
        padding: '12px 16px',
        borderRadius: '8px',
        border: `1px solid ${styles.borderColor}`,
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        marginBottom: '16px',
      }
    : {
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
      };

  return (
    <div role="alert" aria-live="assertive" tabIndex={-1} style={containerStyle}>
      {/* メッセージ部分 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
        }}
      >
        {/* アイコン */}
        <svg
          style={{
            width: '24px',
            height: '24px',
            color: styles.iconColor,
            flexShrink: 0,
          }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
        </svg>

        {/* メッセージとフィールドエラー */}
        <div style={{ flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontSize: '14px',
              lineHeight: '1.5',
              fontWeight: 500,
            }}
          >
            {error.message}
          </p>

          {/* フィールドエラーのリスト（バリデーションエラー時） */}
          {error.type === 'validation' && error.fieldErrors && (
            <ul
              style={{
                margin: '8px 0 0 0',
                paddingLeft: '20px',
                fontSize: '13px',
              }}
            >
              {Object.entries(error.fieldErrors).map(([field, message]) => (
                <li key={field} style={{ marginBottom: '4px' }}>
                  {message}
                </li>
              ))}
            </ul>
          )}
        </div>

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
          x
        </button>
      </div>

      {/* アクションボタン部分 */}
      {(error.canRetry || error.shouldRedirect) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            marginTop: '12px',
          }}
        >
          {/* 再試行ボタン */}
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
                backgroundColor: isRetrying ? '#9ca3af' : styles.iconColor,
                border: 'none',
                borderRadius: '6px',
                cursor: isRetrying ? 'not-allowed' : 'pointer',
                opacity: isRetrying ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {isRetrying ? (
                <>
                  <SpinnerIcon />
                  再試行中...
                </>
              ) : (
                '再試行'
              )}
            </button>
          )}

          {/* ログインページへリダイレクトボタン */}
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
                backgroundColor: styles.iconColor,
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              ログインページへ
            </button>
          )}
        </div>
      )}

      {/* スピナーアニメーション用のスタイル */}
      <style>{`
        @keyframes site-survey-error-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

export default SiteSurveyErrorDisplay;
