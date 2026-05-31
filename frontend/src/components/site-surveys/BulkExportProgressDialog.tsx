/**
 * BulkExportProgressDialog コンポーネント
 *
 * 一括エクスポート処理の進捗を可視化し、キャンセル操作および
 * 部分失敗時のユーザー選択（成功分のみダウンロード / 中止）を取得する。
 *
 * # Props 設計の補足
 *
 * design.md L5296-5320 では Props を `{ open, promise, controller, onClose(result) }`
 * と定義しているが、本実装では「進捗情報」を親（呼び出し元の BulkExportDialog 等）が
 * `bulkExportService.execute(input, onProgress, signal)` の `onProgress` で受け取って
 * state 管理し、本ダイアログには `progress: BulkExportProgress | null` として渡す
 * 構成を採用する。
 *
 * 理由:
 * - 84.x で完成済みの `bulkExportService` は `onProgress` を callback として受け取る
 *   設計であり、外部に EventEmitter を持たない。設計どおり「promise の進捗購読を
 *   ダイアログ側で行う」ためには bulkExportService の変更が必要になるが、本タスクの
 *   Boundary は本コンポーネントのみ（_Boundary: BulkExportProgressDialog_）。
 * - 親で `onProgress` を受け取り state 化する方式なら、bulkExportService に変更を
 *   加えず、かつ design.md の意図（進捗を可視化する）も満たせる。
 * - `onComplete` には `result` および「部分失敗時の選択結果」を渡す。これは
 *   design.md の `onClose(result: BulkExportResult | null)` を拡張した形だが、
 *   要件 31.14 を満たすために選択結果の伝搬経路が必要なため、`onComplete` 名で
 *   2 引数化する。
 *
 * @requirement site-survey/REQ-31.10 進捗可視化
 * @requirement site-survey/REQ-31.11 進行中処理のキャンセル可能性
 * @requirement site-survey/REQ-31.13 部分失敗の明示
 * @requirement site-survey/REQ-31.14 成功分のみダウンロードと中止の選択
 * @see .kiro/specs/site-survey/design.md BulkExportProgressDialog (5296-5320)
 */

import React, { useEffect, useId, useState } from 'react';
import type { BulkExportProgress, BulkExportResult } from '../../services/export/bulkExportService';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 部分失敗時のユーザー選択
 *
 * design.md L5313 の `PartialFailureChoice` と一致させる。
 */
export type PartialFailureChoice = 'download-partial' | 'cancel';

/**
 * BulkExportProgressDialog の Props
 */
export interface BulkExportProgressDialogProps {
  /** ダイアログの開閉状態 */
  open: boolean;
  /** 現場調査名（表示用） */
  surveyName: string;
  /**
   * 進捗情報
   *
   * - `null`: 未受信（処理開始直後）
   * - `BulkExportProgress`: 直近の `onProgress` で受け取った値
   *
   * 親が `bulkExportService.execute(input, onProgress, signal)` の `onProgress`
   * で受け取って state 管理し、毎回最新値を渡す。
   */
  progress: BulkExportProgress | null;
  /**
   * 一括エクスポート処理の Promise
   *
   * 本ダイアログは `useEffect` でこの Promise を await し、解決した結果に応じて
   * 完了処理（onComplete 呼び出し or サブダイアログ表示）を行う。
   */
  promise: Promise<BulkExportResult>;
  /**
   * AbortController
   *
   * キャンセルボタン押下時に `controller.abort()` を呼び、進行中の処理を中断する。
   * 親が `bulkExportService.execute` の `signal` 引数にこの `controller.signal` を
   * 渡しておく必要がある。
   */
  controller: AbortController;
  /**
   * 完了時コールバック
   *
   * - `result.status === 'success'`: `onComplete(result)`（decision なし）
   * - `result.status === 'cancelled'`: `onComplete(result)`（decision なし）
   * - `result.status === 'partial'`: サブダイアログでユーザー選択取得後、
   *   `onComplete(result, 'download-partial' | 'cancel')`
   */
  onComplete: (result: BulkExportResult, downloadDecision?: PartialFailureChoice) => void;
}

// ============================================================================
// スタイル定義（ImageExportDialog と概ね統一）
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    maxWidth: '480px',
    width: '90%',
    maxHeight: '90vh',
    overflow: 'auto' as const,
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
  subTitle: {
    margin: '4px 0 0 0',
    fontSize: '13px',
    color: '#6b7280',
  },
  content: {
    padding: '24px',
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
  progressTextRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline' as const,
    fontSize: '14px',
    color: '#111827',
  },
  failedText: {
    marginTop: '8px',
    fontSize: '13px',
    color: '#b91c1c', // WCAG 2.1 AA 準拠の赤
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
    transition: 'all 0.2s ease',
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
  // サブダイアログ用
  subOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100, // 親ダイアログより前面に
  },
  subDialog: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    maxWidth: '420px',
    width: '90%',
    padding: '20px 24px',
  },
  subTitleText: {
    margin: '0 0 8px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: '#111827',
  },
  subBody: {
    margin: '0 0 16px 0',
    fontSize: '14px',
    color: '#374151',
    lineHeight: 1.5,
  },
  subFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
};

// ============================================================================
// 進捗計算ヘルパー
// ============================================================================

/**
 * 進捗から表示用の割合（0〜100 の整数）を算出する。
 *
 * total === 0 のときは 0 を返す（NaN 防止）。
 */
const calcPercent = (progress: BulkExportProgress | null): number => {
  if (!progress || progress.total <= 0) {
    return 0;
  }
  return Math.floor((progress.done / progress.total) * 100);
};

// ============================================================================
// コンポーネント
// ============================================================================

const BulkExportProgressDialog: React.FC<BulkExportProgressDialogProps> = ({
  open,
  surveyName,
  progress,
  promise,
  controller,
  onComplete,
}) => {
  const titleId = useId();
  const subDialogTitleId = useId();

  // 解決済みの BulkExportResult。サブダイアログ判定および onComplete 呼び出しに利用。
  const [result, setResult] = useState<BulkExportResult | null>(null);
  // 部分失敗時のサブダイアログ表示状態
  const [showPartialDialog, setShowPartialDialog] = useState(false);

  // ---------------------------------------------------------------------------
  // promise の購読
  //
  // promise が解決したら result を state に格納する。
  // unmount 後の setState 警告を避けるため、`cancelled` フラグで保護する。
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    promise
      .then((value) => {
        if (cancelled) return;
        setResult(value);
      })
      .catch(() => {
        // bulkExportService.execute は reject ではなく BulkExportResult を返す設計。
        // 万一 reject されても UI を固まらせないため、ここでは握り潰す。
      });
    return () => {
      cancelled = true;
    };
  }, [promise]);

  // ---------------------------------------------------------------------------
  // result 解決時の自動完了 / サブダイアログ表示分岐
  //
  // - success / cancelled: 即時 onComplete(result)
  // - partial: サブダイアログ表示（ユーザー選択を待つ）
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!result) return;
    if (result.status === 'partial') {
      setShowPartialDialog(true);
      return;
    }
    // success / cancelled: そのまま親に通知
    onComplete(result);
    // onComplete の参照変更で再呼び出ししないよう、依存は result のみに限定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // ---------------------------------------------------------------------------
  // ハンドラ
  // ---------------------------------------------------------------------------

  /** キャンセルボタン押下 */
  const handleCancel = () => {
    controller.abort();
  };

  /** 部分失敗サブダイアログ: 「ダウンロード」 */
  const handleDownloadPartial = () => {
    if (!result) return;
    setShowPartialDialog(false);
    onComplete(result, 'download-partial');
  };

  /** 部分失敗サブダイアログ: 「中止」 */
  const handleCancelPartial = () => {
    if (!result) return;
    setShowPartialDialog(false);
    onComplete(result, 'cancel');
  };

  // open=false のときは何も描画しない
  if (!open) {
    return null;
  }

  const percent = calcPercent(progress);
  const done = progress?.done ?? 0;
  const total = progress?.total ?? 0;
  const failedSoFar = progress?.failedSoFar ?? 0;

  // 部分失敗サブダイアログの本文に出す件数
  const partialFailureCount = result?.failures.length ?? 0;
  // 成功件数 = total - 失敗件数（partial 時の表示用）
  const partialSuccessCount = Math.max(total - partialFailureCount, 0);

  return (
    <>
      <div style={styles.overlay} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
          {/* ヘッダー */}
          <div style={styles.header}>
            <h2 id={titleId} style={styles.title}>
              一括エクスポート処理中
            </h2>
            <p style={styles.subTitle}>{surveyName}</p>
          </div>

          {/* 進捗本体 */}
          <div style={styles.content}>
            {progress === null ? (
              <p style={{ margin: 0, color: '#6b7280' }}>準備中…</p>
            ) : (
              <>
                <div style={styles.progressTextRow}>
                  <span>
                    {done} / {total} 件
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
                {failedSoFar > 0 && <p style={styles.failedText}>失敗 {failedSoFar} 件</p>}
              </>
            )}
          </div>

          {/* フッター */}
          <div style={styles.footer}>
            <button
              type="button"
              onClick={handleCancel}
              style={{ ...styles.button, ...styles.cancelButton }}
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>

      {/* 部分失敗サブダイアログ */}
      {showPartialDialog && result && (
        <div
          style={styles.subOverlay}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={subDialogTitleId}
        >
          <div style={styles.subDialog}>
            <h3 id={subDialogTitleId} style={styles.subTitleText}>
              一部の画像が失敗しました
            </h3>
            <p style={styles.subBody}>
              {partialFailureCount} 件 失敗しました。 成功した {partialSuccessCount}{' '}
              件のみダウンロードしますか?
            </p>
            <div style={styles.subFooter}>
              <button
                type="button"
                onClick={handleCancelPartial}
                style={{ ...styles.button, ...styles.cancelButton }}
              >
                中止
              </button>
              <button
                type="button"
                onClick={handleDownloadPartial}
                style={{ ...styles.button, ...styles.primaryButton }}
              >
                ダウンロード
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BulkExportProgressDialog;
