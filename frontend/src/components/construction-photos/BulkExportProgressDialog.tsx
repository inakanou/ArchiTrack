/**
 * @fileoverview BulkExportProgressDialog - 工事写真 ZIP一括エクスポート進捗ダイアログ
 *
 * Task 11.4: エクスポート設定・進捗・中断UI
 *
 * `ConstructionPhotoBulkExportService.export` の進捗（完了件数・総件数・失敗件数）を
 * 可視化し、中断操作を受け付ける**プレゼンテーション部品**。
 *
 * 実際の `export` 呼び出し（`AbortController` の生成、`onProgress` の購読、
 * Promise の await、ZIP ダウンロード）は呼び出し元（詳細画面, Task 12.2）が担う。
 * 本コンポーネントは `progress` / `isRunning` を props として受け取り、
 * 中断ボタン押下時に `onCancel` を呼ぶだけの疎結合設計とする
 * （site-survey `BulkExportProgressDialog` は `promise`/`controller` を直接
 * 受け取り自ら購読・abort する設計だが、本タスクの指示により独立クローンの
 * 上で意図的にその点を変更している）。
 *
 * @requirement construction-photo/15.8 進捗状況（完了件数・総件数）の表示
 * @requirement construction-photo/15.9 進行中エクスポート処理の中断
 * @requirement construction-photo/15.10 部分失敗の表示（failed件数）
 * @see .kiro/specs/construction-photo/design.md BulkExportProgressDialog（追加機能ファイル, R15）
 * @module components/construction-photos/BulkExportProgressDialog
 */

import { useId } from 'react';
import type { ConstructionPhotoExportProgress } from '../../services/export/ConstructionPhotoBulkExportService';

// ============================================================================
// Props
// ============================================================================

export interface BulkExportProgressDialogProps {
  /** ダイアログの開閉状態 */
  open: boolean;
  /**
   * 進捗情報
   *
   * - `null`: 未受信（処理開始直後の準備中）
   * - `ConstructionPhotoExportProgress`: 直近の `onProgress` で受け取った値
   */
  progress: ConstructionPhotoExportProgress | null;
  /** エクスポート処理が実行中かどうか（false なら完了 or 中断済み） */
  isRunning: boolean;
  /**
   * 中断ボタン押下時のハンドラ
   *
   * 親はここで `AbortController.abort()` 等を呼び、進行中の処理を中断する（R15.9）。
   */
  onCancel: () => void;
  /**
   * ダイアログを閉じるハンドラ
   *
   * `isRunning === false`（完了/中断確定後）の「閉じる」ボタン押下で呼ばれる。
   */
  onClose: () => void;
}

// ============================================================================
// スタイル定義（BulkExportDialog と概ね統一）
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 1200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: '16px',
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    maxWidth: '480px',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
  },
  header: {
    padding: '16px 24px',
    borderBottom: '1px solid #e5e7eb',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#111827',
  },
  body: {
    padding: '24px',
  },
  progressTextRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline' as const,
    fontSize: '14px',
    color: '#111827',
  },
  progressBarOuter: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden' as const,
    marginTop: '8px',
  },
  progressBarInner: (percent: number) => ({
    width: `${percent}%`,
    height: '100%',
    backgroundColor: '#1d4ed8',
    transition: 'width 0.15s ease-out',
  }),
  failedText: {
    marginTop: '8px',
    fontSize: '13px',
    color: '#b91c1c', // WCAG 2.1 AA準拠
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    padding: '16px 24px',
    borderTop: '1px solid #e5e7eb',
  },
  button: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  },
  cancelButton: {
    backgroundColor: '#ffffff',
    border: '1px solid #d1d5db',
    color: '#374151',
  },
  primaryButton: {
    backgroundColor: '#1d4ed8',
    border: '1px solid #1d4ed8',
    color: '#ffffff',
  },
};

// ============================================================================
// 進捗計算ヘルパー
// ============================================================================

/** 進捗から表示用の割合（0〜100の整数）を算出する。total<=0 のときは0（NaN防止）。 */
const calcPercent = (progress: ConstructionPhotoExportProgress | null): number => {
  if (!progress || progress.total <= 0) {
    return 0;
  }
  return Math.floor((progress.completed / progress.total) * 100);
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 工事写真 ZIP一括エクスポートの進捗表示・中断ダイアログ。
 */
export function BulkExportProgressDialog({
  open,
  progress,
  isRunning,
  onCancel,
  onClose,
}: BulkExportProgressDialogProps): React.ReactElement | null {
  const titleId = useId();

  if (!open) {
    return null;
  }

  const percent = calcPercent(progress);
  const completed = progress?.completed ?? 0;
  const total = progress?.total ?? 0;
  const failed = progress?.failed ?? 0;

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div style={styles.content} onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div style={styles.header}>
          <h2 id={titleId} style={styles.title}>
            {isRunning ? '一括エクスポート処理中' : '一括エクスポート完了'}
          </h2>
        </div>

        {/* 進捗本体 (R15.8) */}
        <div style={styles.body}>
          {progress === null ? (
            <p style={{ margin: 0, color: '#6b7280' }}>準備中…</p>
          ) : (
            <>
              <div style={styles.progressTextRow}>
                <span>
                  {completed} / {total} 件
                </span>
                <span>{percent}%</span>
              </div>
              <div
                style={styles.progressBarOuter}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label="一括エクスポート進捗"
              >
                <div style={styles.progressBarInner(percent)} />
              </div>
              {failed > 0 && <p style={styles.failedText}>失敗 {failed} 件</p>}
            </>
          )}
        </div>

        {/* フッター: 実行中は中断、完了後は閉じる (R15.9) */}
        <div style={styles.footer}>
          {isRunning ? (
            <button
              type="button"
              onClick={onCancel}
              style={{ ...styles.button, ...styles.cancelButton }}
            >
              中断
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              style={{ ...styles.button, ...styles.primaryButton }}
            >
              閉じる
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BulkExportProgressDialog;
