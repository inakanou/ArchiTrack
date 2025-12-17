/**
 * @fileoverview 楽観的排他制御競合ダイアログコンポーネント
 *
 * Task 11.1: 楽観的排他制御の競合ダイアログを実装する
 *
 * 同時編集による競合が検出された場合に表示されるモーダルダイアログ。
 * ユーザーに競合の発生を通知し、再読み込みを促します。
 *
 * Requirements:
 * - 1.5: 同時編集による競合が検出される場合、競合エラーを表示して再読み込みを促す
 * - 20.1: すべての操作をキーボードのみで実行可能
 * - 20.2: フォーム要素にaria-label属性を適切に設定
 *
 * 機能:
 * - 競合エラーメッセージの表示
 * - 再読み込みボタン
 * - フォーカストラップとアクセシビリティ対応
 */

import { useRef, useId } from 'react';
import FocusManager from '../FocusManager';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ConflictDialogコンポーネントのプロパティ
 */
export interface ConflictDialogProps {
  /** ダイアログが開いているか */
  isOpen: boolean;
  /** 再読み込みボタンクリック時のコールバック */
  onReload: () => void;
  /** ダイアログを閉じる時のコールバック */
  onClose: () => void;
  /** 競合が発生したリソース名（例: 「現場調査」「プロジェクト」） */
  resourceName: string;
  /** 再読み込み処理中フラグ */
  isReloading?: boolean;
}

// ============================================================================
// 定数
// ============================================================================

/** スタイル定数 */
const STYLES = {
  colors: {
    primary: '#1d4ed8',
    primaryHover: '#1e40af',
    warning: '#f59e0b',
    warningLight: '#fef3c7',
    warningBorder: '#fcd34d',
    text: '#1f2937',
    textSecondary: '#374151',
    border: '#d1d5db',
    white: '#ffffff',
    disabled: '#9ca3af',
  },
  borderRadius: '0.5rem',
} as const;

/** コンテナスタイル */
const containerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '480px',
  padding: '24px',
};

/** タイトルスタイル */
const titleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  fontSize: '18px',
  fontWeight: 'bold',
  marginBottom: '16px',
  color: STYLES.colors.text,
};

/** 説明文スタイル */
const descriptionStyle: React.CSSProperties = {
  marginBottom: '16px',
  fontSize: '14px',
  color: STYLES.colors.textSecondary,
  lineHeight: '1.6',
};

/** 警告ボックススタイル */
const warningBoxStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  marginBottom: '20px',
  padding: '12px 16px',
  backgroundColor: STYLES.colors.warningLight,
  borderRadius: STYLES.borderRadius,
  border: `1px solid ${STYLES.colors.warningBorder}`,
};

/** 警告アイコンスタイル */
const warningIconStyle: React.CSSProperties = {
  flexShrink: 0,
  width: '24px',
  height: '24px',
  color: STYLES.colors.warning,
};

/** ボタンコンテナスタイル */
const buttonContainerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
  marginTop: '24px',
};

/** ボタン基本スタイル */
const buttonBaseStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: '14px',
  fontWeight: '500',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'all 0.2s',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
};

/** キャンセルボタンスタイル */
const closeButtonStyle: React.CSSProperties = {
  backgroundColor: STYLES.colors.white,
  color: STYLES.colors.textSecondary,
  border: `1px solid ${STYLES.colors.border}`,
};

/** 再読み込みボタンスタイル */
const reloadButtonStyle: React.CSSProperties = {
  backgroundColor: STYLES.colors.primary,
  color: STYLES.colors.white,
  border: 'none',
};

/** 無効ボタンスタイル */
const disabledButtonStyle: React.CSSProperties = {
  opacity: 0.6,
  cursor: 'not-allowed',
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 警告アイコン（SVG）
 */
function WarningIcon(): React.ReactElement {
  return (
    <svg
      data-testid="conflict-warning-icon"
      role="img"
      aria-hidden="true"
      style={warningIconStyle}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

/**
 * スピナーアイコン（SVG）
 */
function SpinnerIcon(): React.ReactElement {
  return (
    <span
      role="status"
      aria-label="ローディング中"
      style={{
        display: 'inline-block',
        width: '1rem',
        height: '1rem',
        border: '2px solid white',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'conflict-dialog-spin 0.6s linear infinite',
      }}
    />
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 楽観的排他制御競合ダイアログ
 *
 * 同時編集により競合が検出された場合に表示されるモーダルダイアログです。
 * ユーザーに競合の発生を通知し、データの再読み込みを促します。
 *
 * @example
 * ```tsx
 * <ConflictDialog
 *   isOpen={isConflictDialogOpen}
 *   onReload={handleReload}
 *   onClose={() => setIsConflictDialogOpen(false)}
 *   resourceName="現場調査"
 *   isReloading={isReloading}
 * />
 * ```
 */
function ConflictDialog({
  isOpen,
  onReload,
  onClose,
  resourceName,
  isReloading = false,
}: ConflictDialogProps): React.ReactNode {
  const reloadButtonRef = useRef<HTMLButtonElement>(null);
  const uniqueId = useId();
  const titleId = `conflict-dialog-title-${uniqueId}`;
  const descriptionId = `conflict-dialog-description-${uniqueId}`;

  return (
    <FocusManager
      isOpen={isOpen}
      onClose={onClose}
      closeOnEscape={!isReloading}
      closeOnOutsideClick={false}
      initialFocusRef={reloadButtonRef as React.RefObject<HTMLElement>}
    >
      <div style={containerStyle} aria-labelledby={titleId} aria-describedby={descriptionId}>
        {/* タイトル */}
        <h2 id={titleId} style={titleStyle}>
          <WarningIcon />
          編集の競合
        </h2>

        {/* 警告ボックス */}
        <div style={warningBoxStyle}>
          <div style={{ flex: 1 }}>
            <p id={descriptionId} style={{ ...descriptionStyle, marginBottom: '8px' }}>
              この{resourceName}は他のユーザーによって更新されました。
            </p>
            <p style={{ ...descriptionStyle, marginBottom: 0, fontSize: '13px' }}>
              最新のデータを読み込んでから再度編集してください。
              再読み込みすると、入力中の変更は失われます。
            </p>
          </div>
        </div>

        {/* ボタン */}
        <div style={buttonContainerStyle}>
          <button
            type="button"
            onClick={onClose}
            disabled={isReloading}
            style={{
              ...buttonBaseStyle,
              ...closeButtonStyle,
              ...(isReloading ? disabledButtonStyle : {}),
            }}
          >
            閉じる
          </button>
          <button
            ref={reloadButtonRef}
            type="button"
            onClick={onReload}
            disabled={isReloading}
            style={{
              ...buttonBaseStyle,
              ...reloadButtonStyle,
              ...(isReloading ? disabledButtonStyle : {}),
            }}
          >
            {isReloading && <SpinnerIcon />}
            {isReloading ? '再読み込み中...' : '再読み込み'}
          </button>
        </div>

        {/* アニメーション定義 */}
        <style>
          {`
            @keyframes conflict-dialog-spin {
              to {
                transform: rotate(360deg);
              }
            }
          `}
        </style>
      </div>
    </FocusManager>
  );
}

export default ConflictDialog;
