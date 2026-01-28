/**
 * @fileoverview 未保存変更確認ダイアログコンポーネント
 *
 * Task 6.5: 未保存確認ダイアログの実装
 *
 * フォームに未保存の変更がある状態でページを離れようとした場合に表示される
 * 確認ダイアログ。React RouterのuseBlockerと連携して使用します。
 *
 * Requirements:
 * - 3.4: フォームに未保存の変更がある状態でページを離れようとしたとき、
 *        「変更が保存されていません。ページを離れますか？」という確認ダイアログを表示する
 * - 20.1: すべての操作をキーボードのみで実行可能
 * - 20.2: フォーム要素にaria-label属性を適切に設定
 *
 * @example
 * ```tsx
 * const blocker = useBlocker(isDirty);
 *
 * return (
 *   <>
 *     <form>...</form>
 *     <UnsavedChangesDialog
 *       isOpen={blocker.state === 'blocked'}
 *       onLeave={() => blocker.proceed?.()}
 *       onStay={() => blocker.reset?.()}
 *     />
 *   </>
 * );
 * ```
 */

import { useRef, useId } from 'react';
import FocusManager from '../FocusManager';

// ============================================================================
// 型定義
// ============================================================================

/**
 * UnsavedChangesDialogコンポーネントのプロパティ
 */
export interface UnsavedChangesDialogProps {
  /** ダイアログが開いているか */
  isOpen: boolean;
  /** ページを離れる時のコールバック */
  onLeave: () => void;
  /** ページにとどまる時のコールバック */
  onStay: () => void;
}

// ============================================================================
// 定数
// ============================================================================

/** スタイル定数 */
const STYLES = {
  colors: {
    primary: '#1d4ed8',
    primaryHover: '#1e40af',
    danger: '#dc2626',
    dangerHover: '#b91c1c',
    warning: '#f59e0b',
    warningLight: '#fef3c7',
    warningBorder: '#fcd34d',
    text: '#1f2937',
    textSecondary: '#374151',
    border: '#d1d5db',
    white: '#ffffff',
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

/** 説明文スタイル */
const descriptionStyle: React.CSSProperties = {
  fontSize: '14px',
  color: STYLES.colors.textSecondary,
  lineHeight: '1.6',
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
};

/** 「このページにとどまる」ボタンスタイル */
const stayButtonStyle: React.CSSProperties = {
  backgroundColor: STYLES.colors.primary,
  color: STYLES.colors.white,
  border: 'none',
};

/** 「ページを離れる」ボタンスタイル */
const leaveButtonStyle: React.CSSProperties = {
  backgroundColor: STYLES.colors.white,
  color: STYLES.colors.danger,
  border: `1px solid ${STYLES.colors.danger}`,
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
      data-testid="unsaved-warning-icon"
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

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 未保存変更確認ダイアログ
 *
 * フォームに未保存の変更がある状態でページを離れようとした場合に表示される
 * 確認ダイアログです。
 *
 * Requirement 3.4:
 * - 「変更が保存されていません。ページを離れますか？」という確認ダイアログを表示する
 */
function UnsavedChangesDialog({
  isOpen,
  onLeave,
  onStay,
}: UnsavedChangesDialogProps): React.ReactNode {
  const stayButtonRef = useRef<HTMLButtonElement>(null);
  const uniqueId = useId();
  const titleId = `unsaved-changes-dialog-title-${uniqueId}`;
  const descriptionId = `unsaved-changes-dialog-description-${uniqueId}`;

  return (
    <FocusManager
      isOpen={isOpen}
      onClose={onStay}
      closeOnEscape={true}
      closeOnOutsideClick={false}
      initialFocusRef={stayButtonRef as React.RefObject<HTMLElement>}
      ariaLabelledBy={titleId}
    >
      <div style={containerStyle} aria-labelledby={titleId} aria-describedby={descriptionId}>
        {/* タイトル */}
        <h2 id={titleId} style={titleStyle}>
          <WarningIcon />
          変更が保存されていません
        </h2>

        {/* 警告ボックス */}
        <div style={warningBoxStyle}>
          <div style={{ flex: 1 }}>
            <p id={descriptionId} style={descriptionStyle}>
              変更が保存されていません。ページを離れますか？
            </p>
            <p style={{ ...descriptionStyle, marginTop: '8px', fontSize: '13px' }}>
              「ページを離れる」を選択すると、入力中の変更は失われます。
            </p>
          </div>
        </div>

        {/* ボタン */}
        <div style={buttonContainerStyle}>
          <button
            type="button"
            onClick={onLeave}
            style={{ ...buttonBaseStyle, ...leaveButtonStyle }}
          >
            ページを離れる
          </button>
          <button
            ref={stayButtonRef}
            type="button"
            onClick={onStay}
            style={{ ...buttonBaseStyle, ...stayButtonStyle }}
          >
            このページにとどまる
          </button>
        </div>
      </div>
    </FocusManager>
  );
}

export default UnsavedChangesDialog;
