/**
 * @fileoverview 未送信画像の一覧表示と再送・破棄の操作面
 *
 * Task 106.2: 未送信画像の一覧表示と再送・破棄の操作面を実装する
 *
 * Requirements:
 * - 37.2: 未送信画像の件数と、各画像のサムネイル・ファイル名・失敗理由を表示する
 * - 37.3: 再送可能な画像をまとめて再送する操作手段を提供する
 * - 37.7: 保持中の画像を破棄する操作手段を提供する
 * - 37.10: 処理中は追加の再送操作を受け付けない
 * - 37.16: 再送不可の画像に再送しても解消しない旨とその理由を提示する
 * - 37.17: 再送不可の画像を再送の対象に含めない
 * - 37.18: 保持中の画像が全て再送不可なら再送手段を実行不可の状態で提示する
 *
 * 設計方針:
 * - 状態を持たない純表示コンポーネントとする。保持ロジックは `usePendingUploads`
 *   が所有し、本コンポーネントは props で受け取った内容の提示だけを担う。
 * - コンテナの読み上げ役割は `role="status"` とする。Requirement 19 の失敗通知が
 *   `role="alert"` を用いており、同一画面で alert が重複すると読み上げが競合する
 *   ためである。未送信画像の保持は「失敗の通知」ではなく「現在の状態」である。
 * - 操作ボタンのタップ領域は 44x44 論理ピクセル以上とする。
 *
 * 依存方向:
 * - 本モジュールは `types/upload.types` のみに依存する。api / hooks へは依存しない。
 */

import type { PendingUpload } from '../../types/upload.types';

// ============================================================================
// 定数
// ============================================================================

/** 操作要素の最小タップ領域（論理ピクセル） */
const MIN_TAP_TARGET_PX = 44;

// ============================================================================
// 型定義
// ============================================================================

/**
 * PendingUploadPanel コンポーネントの Props
 */
export interface PendingUploadPanelProps {
  /** 保持中の未送信画像。空配列の場合は何も描画しない */
  readonly pending: readonly PendingUpload[];
  /** 再送可能な画像が存在しない場合は false */
  readonly canRetry: boolean;
  /** 再送中またはアップロード中は true。操作を受け付けない */
  readonly isBusy: boolean;
  /** 再送の要求 */
  readonly onRetry: () => void;
  /** 保持中の全画像の破棄の要求 */
  readonly onDiscardAll: () => void;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: '#fffbeb',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#fde68a',
    borderRadius: '8px',
  } as React.CSSProperties,
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#92400e',
    marginBottom: '8px',
  } as React.CSSProperties,
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  } as React.CSSProperties,
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
  } as React.CSSProperties,
  thumbnail: {
    width: '48px',
    height: '48px',
    flexShrink: 0,
    objectFit: 'cover' as const,
    borderRadius: '4px',
    backgroundColor: '#e5e7eb',
  } as React.CSSProperties,
  itemBody: {
    minWidth: 0,
    flex: 1,
  } as React.CSSProperties,
  fileName: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#374151',
    overflowWrap: 'anywhere' as const,
  } as React.CSSProperties,
  reason: {
    margin: '2px 0 0',
    fontSize: '12px',
    color: '#b45309',
    overflowWrap: 'anywhere' as const,
  } as React.CSSProperties,
  permanentNote: {
    margin: '2px 0 0',
    fontSize: '12px',
    fontWeight: 500,
    color: '#b91c1c',
    overflowWrap: 'anywhere' as const,
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
    marginTop: '12px',
  } as React.CSSProperties,
  button: {
    minWidth: `${MIN_TAP_TARGET_PX}px`,
    minHeight: `${MIN_TAP_TARGET_PX}px`,
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderRadius: '8px',
    cursor: 'pointer',
  } as React.CSSProperties,
  retryButton: {
    color: '#ffffff',
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  } as React.CSSProperties,
  discardButton: {
    color: '#374151',
    backgroundColor: '#ffffff',
    borderColor: '#d1d5db',
  } as React.CSSProperties,
  buttonDisabled: {
    cursor: 'not-allowed',
    color: '#4b5563', // WCAG 2.1 AA準拠: 7.0:1 contrast ratio on #e5e7eb
    backgroundColor: '#e5e7eb',
    borderColor: '#d1d5db',
  } as React.CSSProperties,
  unavailableNote: {
    margin: '8px 0 0',
    fontSize: '12px',
    color: '#92400e',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 未送信画像パネル
 *
 * アップロードに失敗して画面に保持されている画像を提示し、再送と破棄の
 * 操作手段を提供します。状態は保持せず、すべて props から受け取ります。
 *
 * @example
 * ```tsx
 * <PendingUploadPanel
 *   pending={pending}
 *   canRetry={retriableFiles.length > 0}
 *   isBusy={isUploading}
 *   onRetry={handleRetry}
 *   onDiscardAll={handleDiscardAll}
 * />
 * ```
 */
export function PendingUploadPanel({
  pending,
  canRetry,
  isBusy,
  onRetry,
  onDiscardAll,
}: PendingUploadPanelProps) {
  // 保持中の画像が無ければ表示すべき状態が存在しない（37.6）
  if (pending.length === 0) {
    return null;
  }

  const isRetryDisabled = !canRetry || isBusy;

  const retryButtonStyle: React.CSSProperties = {
    ...styles.button,
    ...styles.retryButton,
    ...(isRetryDisabled ? styles.buttonDisabled : {}),
  };

  const discardButtonStyle: React.CSSProperties = {
    ...styles.button,
    ...styles.discardButton,
    ...(isBusy ? styles.buttonDisabled : {}),
  };

  return (
    <div data-testid="pending-upload-panel" role="status" style={styles.container}>
      {/* 未送信件数（37.2） */}
      <div data-testid="pending-upload-count" style={styles.title}>
        未送信の画像 {pending.length} 件
      </div>

      {/* 未送信画像の一覧（37.2） */}
      <ul style={styles.list}>
        {pending.map((item) => (
          <li
            key={item.id}
            data-testid="pending-upload-item"
            data-kind={item.kind}
            style={styles.item}
          >
            <img
              data-testid="pending-upload-thumbnail"
              src={item.previewUrl}
              alt={`${item.file.name} のプレビュー`}
              style={styles.thumbnail}
            />
            <div style={styles.itemBody}>
              <div data-testid="pending-upload-filename" style={styles.fileName}>
                {item.file.name}
              </div>
              <p data-testid="pending-upload-reason" style={styles.reason}>
                {item.error}
              </p>
              {/* 再送不可の項目は理由を併記し、再送対象外であることを示す（37.16, 37.17） */}
              {item.kind === 'permanent' && (
                <p data-testid="pending-upload-permanent-note" style={styles.permanentNote}>
                  再送しても解消しません（理由: {item.error}）。再送の対象から除外されています。
                  破棄してください。
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* 再送・破棄の操作（37.3, 37.7, 37.10, 37.18） */}
      <div style={styles.actions}>
        <button
          type="button"
          data-testid="pending-upload-retry-button"
          style={retryButtonStyle}
          disabled={isRetryDisabled}
          onClick={onRetry}
        >
          再送する
        </button>
        <button
          type="button"
          data-testid="pending-upload-discard-button"
          style={discardButtonStyle}
          disabled={isBusy}
          onClick={onDiscardAll}
        >
          破棄する
        </button>
      </div>

      {/* 再送可能な画像が無いことの説明（37.18） */}
      {!canRetry && (
        <p data-testid="pending-upload-retry-unavailable" style={styles.unavailableNote}>
          再送できる画像がありません。保持中の画像は再送しても解消しないため、破棄してください。
        </p>
      )}
    </div>
  );
}

// デフォルトエクスポート
export default PendingUploadPanel;
