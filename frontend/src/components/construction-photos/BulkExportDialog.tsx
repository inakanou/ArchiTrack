/**
 * @fileoverview BulkExportDialog - 工事写真 ZIP一括エクスポート設定ダイアログ
 *
 * Task 11.4: エクスポート設定・進捗・中断UI
 *
 * 「全件」または「選択」モードで起動し、{@link ExportSettingsForm} で
 * 形式・解像度・看板重畳モードを確定して「開始」を押下すると、確定した
 * `ConstructionPhotoExportSettings` を `onStart` へ引き渡す。
 *
 * 本コンポーネントは**プレゼンテーション部品**であり、実際の
 * `ConstructionPhotoBulkExportService.export` 呼び出し（AbortController 生成・
 * Promise 購読・ダウンロード）は呼び出し元（詳細画面, Task 12.2）が担う。
 * ダイアログは `onStart` / `onClose` などのコールバックと `mode` / `totalCount` /
 * `selectedCount` の props のみで駆動する疎結合設計とする
 * （site-survey `BulkExportDialog` は自ら `service.execute` を呼び出す設計だが、
 * 本タスクの指示により独立クローンの上で意図的にその点を変更している）。
 *
 * # 対象0件の扱い（R15.7, R15.11）
 *
 * `mode === 'all'` のときは `totalCount`、`mode === 'selected'` のときは
 * `selectedCount` を対象件数（`targetCount`）とする。`targetCount === 0` の
 * ときは、
 * - 「開始」ボタンを非活性化し実行不可能にする（R15.7: 選択エクスポートの
 *   実行手段の無効化。`mode === 'all'` で対象アルバムが空の場合も同様に扱う）
 * - `open` が true に遷移した時点で `onEmptyTarget` を1度呼び、対象が無い旨を
 *   親（snackbar/alert 等の通知UIを持つ）へ委譲する（R15.11）
 * を行う。実行できない状態を明示するため、ダイアログ自体は自動クローズしない
 * （open の制御は親に委ねる、疎結合設計を優先）。
 *
 * @requirement construction-photo/15.1 一括ZIPダウンロード起動
 * @requirement construction-photo/15.5 全件エクスポート起動
 * @requirement construction-photo/15.6 選択エクスポート起動
 * @requirement construction-photo/15.7 選択0件時の選択エクスポート無効化
 * @requirement construction-photo/15.11 対象0件時の非実行+通知
 * @see .kiro/specs/construction-photo/design.md BulkExportDialog（追加機能ファイル, R15）
 * @module components/construction-photos/BulkExportDialog
 */

import { useEffect, useId, useState } from 'react';
import ExportSettingsForm from './ExportSettingsForm';
import type { ConstructionPhotoExportSettings } from '../../services/export/ConstructionPhotoBulkExportService';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 一括エクスポート起動モード
 *
 * - `all`: アルバム内の全写真項目を対象とする（R15.5）
 * - `selected`: ユーザーが選択した写真項目のみを対象とする（R15.6）
 */
export type BulkExportDialogMode = 'all' | 'selected';

export interface BulkExportDialogProps {
  /** ダイアログの開閉状態 */
  open: boolean;
  /** 起動モード（全件 / 選択） */
  mode: BulkExportDialogMode;
  /** アルバム内の写真項目総数（`mode === 'all'` の対象件数として利用） */
  totalCount: number;
  /** 選択済みの写真項目件数（`mode === 'selected'` の対象件数として利用） */
  selectedCount: number;
  /** キャンセル時に呼ばれる close callback */
  onClose: () => void;
  /**
   * 「開始」押下時に呼ばれるコールバック。確定した設定を渡す。
   *
   * 実際の `ConstructionPhotoBulkExportService.export` 呼び出しは親が担う。
   */
  onStart: (settings: ConstructionPhotoExportSettings) => void;
  /**
   * 対象0件時の通知コールバック（任意）
   *
   * 要件15.11に対応。snackbar / alert 等の UI 選択は親に委ねる。
   */
  onEmptyTarget?: () => void;
}

// ============================================================================
// スタイル定義（SignboardAssignDialog と概ね統一）
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
  subTitle: {
    margin: '4px 0 0 0',
    fontSize: '13px',
    color: '#6b7280',
  },
  content_: {
    padding: '24px',
  },
  emptyNotice: {
    margin: '0 0 16px 0',
    padding: '10px 12px',
    fontSize: '13px',
    color: '#92400e', // WCAG 2.1 AA準拠
    backgroundColor: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: '6px',
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
    backgroundColor: '#1d4ed8', // WCAG 2.1 AA準拠 (6.2:1 on #fff)
    border: '1px solid #1d4ed8',
    color: '#ffffff',
  },
  primaryButtonDisabled: {
    backgroundColor: '#9ca3af',
    borderColor: '#9ca3af',
    cursor: 'not-allowed',
  },
};

// ============================================================================
// 既定設定
// ============================================================================

/** ExportSettingsForm の初期設定値（JPEG / 中 / 看板を重畳した画像） */
const DEFAULT_SETTINGS: ConstructionPhotoExportSettings = {
  format: 'jpeg',
  resolution: 'medium',
  signboardMode: 'composited',
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 工事写真 ZIP一括エクスポートの設定ダイアログ（形式/解像度/看板重畳モード確定 + 開始）。
 */
export function BulkExportDialog({
  open,
  mode,
  totalCount,
  selectedCount,
  onClose,
  onStart,
  onEmptyTarget,
}: BulkExportDialogProps): React.ReactElement | null {
  const titleId = useId();

  const [settings, setSettings] = useState<ConstructionPhotoExportSettings>(DEFAULT_SETTINGS);

  // 対象件数: all=アルバム総数, selected=選択済み件数
  const targetCount = mode === 'all' ? totalCount : selectedCount;

  // 対象0件時の通知（R15.11）。open への遷移ごとに1度だけ通知する。
  useEffect(() => {
    if (!open) return;
    if (targetCount === 0) {
      onEmptyTarget?.();
    }
    // onEmptyTarget の参照変更で多重発火しないよう、依存は open と targetCount に限定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetCount]);

  if (!open) {
    return null;
  }

  const titleText =
    mode === 'all' ? '全件一括エクスポート' : `${selectedCount} 件選択画像エクスポート`;

  const isEmpty = targetCount === 0;

  const handleStart = (): void => {
    // 対象0件は非活性ボタンで防止済み。念のため二重防御する（R15.7, R15.11）。
    if (isEmpty) {
      return;
    }
    onStart(settings);
  };

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div style={styles.content} onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div style={styles.header}>
          <h2 id={titleId} style={styles.title}>
            {titleText}
          </h2>
          <p style={styles.subTitle}>
            {mode === 'all' ? `対象 ${totalCount} 件` : `選択 ${selectedCount} 件`}
          </p>
        </div>

        {/* コンテンツ */}
        <div style={styles.content_}>
          {isEmpty && (
            <p role="status" style={styles.emptyNotice}>
              {mode === 'selected'
                ? 'エクスポートする写真項目が選択されていません。写真項目を選択してください。'
                : 'エクスポート対象の写真項目がありません。'}
            </p>
          )}
          <ExportSettingsForm value={settings} onChange={setSettings} disabled={isEmpty} />
        </div>

        {/* フッター */}
        <div style={styles.footer}>
          <button
            type="button"
            onClick={onClose}
            style={{ ...styles.button, ...styles.cancelButton }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={isEmpty}
            style={{
              ...styles.button,
              ...(isEmpty ? styles.primaryButtonDisabled : styles.primaryButton),
            }}
          >
            開始
          </button>
        </div>
      </div>
    </div>
  );
}

export default BulkExportDialog;
