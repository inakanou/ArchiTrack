/**
 * @fileoverview Storage Warning Banner コンポーネント
 *
 * Task 35.4: QuotaExceededError時のユーザー警告UIを実装する
 * Task 35.5: プライベートブラウジングモード時の警告UIを実装する
 *
 * Requirements:
 * - 15.8: QuotaExceededError時のユーザー警告
 * - 15.9: プライベートブラウジングモード対応
 *
 * このコンポーネントは以下の警告を表示します:
 * - quota-exceeded: 自動保存に失敗した際の警告（「今すぐ保存」ボタン付き）
 * - private-browsing: プライベートモードで自動保存が無効の警告
 */

import { useState, useCallback } from 'react';

// =============================================================================
// 型定義
// =============================================================================

/**
 * 警告の種類
 */
export type StorageWarningType = 'quota-exceeded' | 'private-browsing';

/**
 * StorageWarningBanner の Props
 */
export interface StorageWarningBannerProps {
  /** 警告の種類 */
  type: StorageWarningType;
  /** 閉じるボタンクリック時のハンドラ（doNotShowAgainフラグを引数に取る） */
  onDismiss: (doNotShowAgain?: boolean) => void;
  /** 「今すぐ保存」ボタンクリック時のハンドラ（quota-exceededの場合のみ） */
  onSaveNow?: () => void;
  /** 「今後表示しない」チェックボックスを表示するか */
  showDoNotShowAgain?: boolean;
  /** 表示/非表示制御（デフォルト: true） */
  isVisible?: boolean;
}

// =============================================================================
// スタイル定義
// =============================================================================

const styles = {
  banner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    lineHeight: '1.5',
  } as React.CSSProperties,
  quotaExceeded: {
    backgroundColor: '#fef3c7',
    border: '1px solid #f59e0b',
    color: '#78350f',
  } as React.CSSProperties,
  privateBrowsing: {
    backgroundColor: '#e0f2fe',
    border: '1px solid #0284c7',
    color: '#0c4a6e',
  } as React.CSSProperties,
  iconContainer: {
    flexShrink: 0,
    marginTop: '2px',
  } as React.CSSProperties,
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  } as React.CSSProperties,
  title: {
    fontWeight: 600,
    marginBottom: '4px',
  } as React.CSSProperties,
  message: {
    margin: 0,
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '4px',
  } as React.CSSProperties,
  saveButton: {
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: 500,
    backgroundColor: '#b45309',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  dismissButton: {
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: 500,
    backgroundColor: 'transparent',
    border: '1px solid currentColor',
    borderRadius: '6px',
    cursor: 'pointer',
    color: 'inherit',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    cursor: 'pointer',
  } as React.CSSProperties,
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  } as React.CSSProperties,
};

// =============================================================================
// アイコンコンポーネント
// =============================================================================

/**
 * 警告アイコン（quota-exceeded用）
 */
function WarningIcon() {
  return (
    <svg
      role="img"
      aria-label="警告"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/**
 * 情報アイコン（private-browsing用）
 */
function InfoIcon() {
  return (
    <svg
      role="img"
      aria-label="情報"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

// =============================================================================
// メインコンポーネント
// =============================================================================

/**
 * ストレージ警告バナーコンポーネント
 *
 * localStorage関連の警告をユーザーに表示します。
 *
 * @example
 * ```tsx
 * // QuotaExceededError警告
 * <StorageWarningBanner
 *   type="quota-exceeded"
 *   onDismiss={() => setShowWarning(false)}
 *   onSaveNow={handleManualSave}
 * />
 *
 * // プライベートブラウジング警告
 * <StorageWarningBanner
 *   type="private-browsing"
 *   onDismiss={(doNotShow) => {
 *     if (doNotShow) localStorage.setItem('hidePrivateModeWarning', 'true');
 *     setShowWarning(false);
 *   }}
 *   showDoNotShowAgain
 * />
 * ```
 */
export default function StorageWarningBanner({
  type,
  onDismiss,
  onSaveNow,
  showDoNotShowAgain = false,
  isVisible = true,
}: StorageWarningBannerProps) {
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);

  const handleDismiss = useCallback(() => {
    onDismiss(doNotShowAgain);
  }, [onDismiss, doNotShowAgain]);

  const handleCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDoNotShowAgain(e.target.checked);
  }, []);

  // 非表示の場合は何もレンダリングしない
  if (!isVisible) {
    return null;
  }

  const isQuotaExceeded = type === 'quota-exceeded';
  const isPrivateBrowsing = type === 'private-browsing';

  const bannerStyle = {
    ...styles.banner,
    ...(isQuotaExceeded ? styles.quotaExceeded : styles.privateBrowsing),
  };

  return (
    <div role="alert" style={bannerStyle} data-warning-type={type}>
      {/* アイコン */}
      <div style={styles.iconContainer}>{isQuotaExceeded ? <WarningIcon /> : <InfoIcon />}</div>

      {/* コンテンツ */}
      <div style={styles.content}>
        {/* タイトルとメッセージ */}
        {isQuotaExceeded && (
          <>
            <div style={styles.title}>自動保存に失敗しました</div>
            <p style={styles.message}>
              ブラウザのストレージ容量が不足しています。
              データを保持するため、今すぐ手動で保存してください。
            </p>
          </>
        )}

        {isPrivateBrowsing && (
          <>
            <div style={styles.title}>自動保存が無効です</div>
            <p style={styles.message}>
              プライベートブラウジングモードでは、ブラウザの制限により自動保存機能が利用できません。
              編集内容は手動で保存してください。
            </p>
          </>
        )}

        {/* アクションボタン */}
        <div style={styles.actions}>
          {isQuotaExceeded && onSaveNow && (
            <button type="button" onClick={onSaveNow} style={styles.saveButton}>
              今すぐ保存
            </button>
          )}

          <button
            type="button"
            onClick={handleDismiss}
            style={styles.dismissButton}
            aria-label="閉じる"
          >
            閉じる
          </button>

          {/* 「今後表示しない」チェックボックス（プライベートモード用） */}
          {isPrivateBrowsing && showDoNotShowAgain && (
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={doNotShowAgain}
                onChange={handleCheckboxChange}
                style={styles.checkbox}
                aria-label="今後表示しない"
              />
              今後表示しない
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
