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
 * タスク 23.4 追加: 利用者の判断（2026-10-03）により、受入基準 15.10 のとおり、一部の写真項目の
 * 取得・加工が失敗したときは自動でダウンロードせず、本ダイアログの「結果の段」で利用者に選ばせる。
 * 親は ZIP の生成が終わった時点で `outcome` を渡す。
 *   - `partial`（成功と失敗が混在）: 失敗した写真項目を、ファイル名とエクスポート対象の中での
 *     順番で一覧にし、件数とともに示す。「成功した項目だけでダウンロードする」（`onContinue`）と
 *     「ダウンロードしない」（`onClose`）を出す。Escape は「ダウンロードしない」と同じに扱う
 *   - `allFailed`（すべて失敗）: 失敗した写真項目を示し、ダウンロードしていない旨を述べ、
 *     「閉じる」（`onClose`）だけを出す。続ける操作は出さない
 *   - 全件成功・中断は `outcome` を渡さず、従来の「一括エクスポート完了」の表示のままにする
 * 結果の段が出たら、フォーカスを段の見出し（tabIndex=-1）へ移して段の出現を伝え、Tab と Shift+Tab は
 * ダイアログの中で循環させる。失敗の一覧は長くなりうるため一覧の中でスクロールさせ（操作の列を画面外へ
 * 押し出さない）、キーボードでもスクロールできるよう tabIndex=0 を与える。ファイル名は区切りの無い
 * 長い語でも折り返せるよう overflowWrap:anywhere とする。モバイル幅では二つの操作のタップ領域を横断
 * ルールの下限（`TAP_TARGET_MIN_PX`）以上にし、操作の列を折り返せるようにする（R19 の詳細画面の扱い）。
 * 失敗の理由は区別しない（サービスは失敗した写真項目の ID だけを返す）。
 *
 * @requirement construction-photo/15.8 進捗状況（完了件数・総件数）の表示
 * @requirement construction-photo/15.9 進行中エクスポート処理の中断
 * @requirement construction-photo/15.10 部分失敗の表示（failed件数）と、成功分での継続の選択
 * @see .kiro/specs/construction-photo/design.md BulkExportProgressDialog（追加機能ファイル, R15）
 * @module components/construction-photos/BulkExportProgressDialog
 */

import { useEffect, useId, useRef } from 'react';
import type { ConstructionPhotoExportProgress } from '../../services/export/ConstructionPhotoBulkExportService';
import useMediaQuery from '../../hooks/useMediaQuery';
import { MEDIA_QUERIES } from '../../utils/responsive';
import { TAP_TARGET_MIN_PX } from '../../utils/tap-target';

// ============================================================================
// 結果の型（タスク 23.4, R15.10）
// ============================================================================

/** 取得・加工に失敗した写真項目（利用者が特定できる形） */
export interface BulkExportFailedItem {
  /** 写真項目ID */
  id: string;
  /** アップロード時のファイル名 */
  fileName: string;
  /** エクスポート対象の中での順番（1 始まり） */
  position: number;
}

/**
 * ZIP の生成が終わったときの、利用者の選択を要する結果
 *
 * - `partial`: 成功と失敗が混在する。成功分での継続か取りやめかを選ばせる
 * - `allFailed`: すべて失敗した。ダウンロードするものが無い
 */
export type BulkExportOutcome =
  | { kind: 'partial'; failedItems: BulkExportFailedItem[]; succeededCount: number }
  | { kind: 'allFailed'; failedItems: BulkExportFailedItem[] };

/** ダイアログの中でフォーカスを受け取れる要素 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
   * 結果の段（`outcome`）では「ダウンロードしない」・「閉じる」・Escape で呼ばれる（タスク 23.4）。
   */
  onClose: () => void;
  /**
   * ZIP の生成が終わったときの、利用者の選択を要する結果（R15.10, タスク 23.4）
   *
   * `null`/未指定なら従来の完了表示。実行中（`isRunning`）は渡されても結果の段を出さない。
   */
  outcome?: BulkExportOutcome | null;
  /** 結果の段の「成功した項目だけでダウンロードする」押下で呼ばれる（`partial` のときだけ出す） */
  onContinue?: () => void;
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
  // 結果の段（タスク 23.4）。見出しへフォーカスを移す。キーボードの利用者にフォーカスの位置が
  // 分かるよう、共通の :focus-visible の outline に乗る（インラインで消さない。タスク 29.1）
  resultTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#111827',
    overflowWrap: 'anywhere' as const,
  },
  resultText: {
    margin: 0,
    fontSize: '14px',
    color: '#111827',
    lineHeight: 1.6,
    overflowWrap: 'anywhere' as const,
  },
  // 失敗の一覧は長くなりうるため一覧の中でスクロールさせ、操作の列を画面外へ押し出さない
  failedList: {
    listStyle: 'none',
    margin: '12px 0',
    padding: '8px 12px',
    maxHeight: '40vh',
    overflowY: 'auto' as const,
    border: '1px solid #fecaca',
    borderRadius: '6px',
    backgroundColor: '#fef2f2',
  },
  failedListItem: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'baseline' as const,
    columnGap: '8px',
    padding: '4px 0',
    fontSize: '14px',
    color: '#991b1b',
  },
  // 区切りの無い長いファイル名（`IMG_20261001_143052_...jpg` など）にも折り返し位置を与える
  failedFileName: {
    minWidth: 0,
    overflowWrap: 'anywhere' as const,
  },
  failedPosition: {
    fontSize: '12px',
    color: '#7f1d1d',
    whiteSpace: 'nowrap' as const,
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
  // モバイル幅でのみ合成する結果の段の上書き（タスク 23.4。PhotoItemPanel と同じ出所の下限）。
  // 文言の長い操作は狭い幅で折り返し、操作の列ごと折り返して画面内に収める
  footerMobile: {
    flexWrap: 'wrap' as const,
  },
  resultButtonMobile: {
    minWidth: `${TAP_TARGET_MIN_PX}px`,
    minHeight: `${TAP_TARGET_MIN_PX}px`,
    maxWidth: '100%',
    overflowWrap: 'anywhere' as const,
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
  outcome = null,
  onContinue,
}: BulkExportProgressDialogProps): React.ReactElement | null {
  const titleId = useId();
  const isMobile = useMediaQuery(MEDIA_QUERIES.isMobile);
  const contentRef = useRef<HTMLDivElement>(null);
  const resultTitleRef = useRef<HTMLHeadingElement>(null);

  // 結果の段（実行中は出さない。中断の操作を保つ）
  const result = open && !isRunning ? outcome : null;
  const resultKind = result?.kind ?? null;

  // 結果の段が出たら見出しへフォーカスを移し、段の出現を伝える
  useEffect(() => {
    if (resultKind !== null) {
      resultTitleRef.current?.focus();
    }
  }, [resultKind]);

  if (!open) {
    return null;
  }

  /** Tab の循環と、結果の段での Escape（取りやめ）を扱う */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && result !== null) {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !contentRef.current) {
      return;
    }
    const focusables = Array.from(
      contentRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) {
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const index = active ? focusables.indexOf(active) : -1;
    if (e.shiftKey) {
      if (index <= 0) {
        e.preventDefault();
        last.focus();
      }
    } else if (index === -1 || index === focusables.length - 1) {
      e.preventDefault();
      first.focus();
    }
  };

  if (result !== null) {
    const failedCount = result.failedItems.length;
    const isPartial = result.kind === 'partial';
    const resultButtonStyle = isMobile ? styles.resultButtonMobile : {};
    return (
      <div
        style={styles.overlay}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <div ref={contentRef} style={styles.content} onClick={(e) => e.stopPropagation()}>
          <div style={styles.header}>
            <h2 id={titleId} ref={resultTitleRef} tabIndex={-1} style={styles.resultTitle}>
              {isPartial
                ? '一部の写真項目をエクスポートできませんでした'
                : '写真項目をエクスポートできませんでした'}
            </h2>
          </div>

          <div style={styles.body}>
            <p style={styles.resultText}>
              {isPartial
                ? `${failedCount}件の写真項目の画像を取得または加工できませんでした。`
                : `すべての写真項目（${failedCount}件）の画像を取得または加工できませんでした。ZIPはダウンロードしていません。`}
            </p>
            {/* 失敗した写真項目（ファイル名と、エクスポート対象の中での順番） */}
            <ul style={styles.failedList} aria-label="エクスポートに失敗した写真項目" tabIndex={0}>
              {result.failedItems.map((item) => (
                <li key={item.id} style={styles.failedListItem}>
                  <span style={styles.failedFileName}>{item.fileName}</span>
                  <span style={styles.failedPosition}>（{item.position}番目）</span>
                </li>
              ))}
            </ul>
            {result.kind === 'partial' && (
              <p style={styles.resultText}>
                {`成功した${result.succeededCount}件の写真項目だけでZIPをダウンロードしますか？`}
              </p>
            )}
          </div>

          <div style={{ ...styles.footer, ...(isMobile ? styles.footerMobile : {}) }}>
            {isPartial ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ ...styles.button, ...styles.cancelButton, ...resultButtonStyle }}
                >
                  ダウンロードしない
                </button>
                <button
                  type="button"
                  onClick={onContinue}
                  style={{ ...styles.button, ...styles.primaryButton, ...resultButtonStyle }}
                >
                  成功した項目だけでダウンロードする
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                style={{ ...styles.button, ...styles.primaryButton, ...resultButtonStyle }}
              >
                閉じる
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const percent = calcPercent(progress);
  const completed = progress?.completed ?? 0;
  const total = progress?.total ?? 0;
  const failed = progress?.failed ?? 0;

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={handleKeyDown}
    >
      <div ref={contentRef} style={styles.content} onClick={(e) => e.stopPropagation()}>
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
