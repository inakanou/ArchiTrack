import { useEffect } from 'react';
import type { ToastNotificationProps, ToastType } from '../types/toast.types';

/**
 * トーストの種類ごとのスタイル
 * WCAG 2.1 AA準拠（コントラスト比4.5:1以上）
 */
const TOAST_STYLES: Record<
  ToastType,
  { backgroundColor: string; color: string; borderColor: string }
> = {
  success: {
    backgroundColor: '#d4edda', // WCAG AA準拠
    color: '#155724',
    borderColor: '#c3e6cb',
  },
  error: {
    backgroundColor: '#f8d7da', // WCAG AA準拠
    color: '#721c24',
    borderColor: '#f5c6cb',
  },
  warning: {
    backgroundColor: '#fff3cd', // WCAG AA準拠
    color: '#856404',
    borderColor: '#ffeaa7',
  },
  info: {
    backgroundColor: '#d1ecf1', // WCAG AA準拠
    color: '#0c5460',
    borderColor: '#bee5eb',
  },
};

/**
 * 表示位置のスタイル
 */
const POSITION_STYLES: Record<
  NonNullable<ToastNotificationProps['position']>,
  Record<string, string>
> = {
  'top-right': { top: '20px', right: '20px' },
  'top-left': { top: '20px', left: '20px' },
  'bottom-right': { bottom: '20px', right: '20px' },
  'bottom-left': { bottom: '20px', left: '20px' },
};

/**
 * トースト通知コンポーネント
 *
 * 4種類のトースト（success/error/warning/info）をスタック表示します。
 * 自動非表示機能（デフォルト5秒）を持ち、WCAG 2.1 AA準拠のアクセシビリティ属性を設定します。
 */
function ToastNotification({ toasts, onDismiss, position = 'top-right' }: ToastNotificationProps) {
  // 自動非表示タイマー
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    toasts.forEach((toast) => {
      const duration = toast.duration ?? 5000;
      const timer = setTimeout(() => {
        onDismiss(toast.id);
      }, duration);
      timers.push(timer);
    });

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [toasts, onDismiss]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxWidth: '400px',
        ...POSITION_STYLES[position],
      }}
    >
      {toasts.map((toast) => {
        const styles = TOAST_STYLES[toast.type];
        const dismissible = toast.dismissible ?? true;

        return (
          <div
            key={toast.id}
            role="alert"
            aria-live="polite"
            style={{
              padding: '12px 16px',
              borderRadius: '4px',
              border: `1px solid ${styles.borderColor}`,
              backgroundColor: styles.backgroundColor,
              color: styles.color,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              minWidth: '300px',
              maxWidth: '100%',
              animation: 'slideIn 0.3s ease-out',
            }}
          >
            {/* メッセージ */}
            <div
              style={{
                flex: 1,
                fontSize: '14px',
                lineHeight: '1.5',
                wordBreak: 'break-word',
              }}
            >
              {toast.message}
            </div>

            {/* 閉じるボタン */}
            {dismissible && (
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label={`${toast.message}を閉じる`}
                style={{
                  background: 'none',
                  border: 'none',
                  color: styles.color,
                  cursor: 'pointer',
                  padding: '4px',
                  fontSize: '18px',
                  lineHeight: 1,
                  opacity: 0.7,
                  transition: 'opacity 0.2s',
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
            )}
          </div>
        );
      })}

      {/* スライドインアニメーション */}
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

export default ToastNotification;
