/**
 * BulkExportDialog コンポーネント
 *
 * Task 87.1: BulkExportDialog 本体実装
 *
 * 「全件」または「選択画像」モードを起動時に受け、ExportSettingsForm をマウントして
 * エクスポート設定を確定する。「開始」押下時に `AbortController` を生成し、
 * `bulkExportService.execute(input, onProgress, signal)` を起動して
 * 親コンポーネント（通常は SurveyDetailPage）に promise と controller を引き継ぐ。
 *
 * # Props 設計の補足
 *
 * design.md L5281-5289 では Props を `{ open, mode, targetImageIds, surveyId,
 * surveyName, onClose, onStart(controller) }` と定義しているが、
 * 本実装では以下の差分を取り入れる。
 *
 * 1. `targetImageIds: string[]` ではなく `images: SurveyImageMetadata[]` を受領
 *    - `bulkExportService.execute` は `SurveyImageMetadata[]` を必要とするため、
 *      ID から `SurveyImageInfo` への解決は親で行う方が責務として自然
 *    - 件数表示も `images.length` から導出できる
 * 2. `onStart` シグネチャを `{ promise, controller, surveyName }` の object 引数に
 *    変更
 *    - 親（SurveyDetailPage）が `BulkExportProgressDialog` へそのまま流し込めるよう、
 *      BulkExportProgressDialog の Props (`promise`, `controller`, `surveyName`) と
 *      対応する 3 値をひとまとめにする
 * 3. `onProgress?` callback を追加
 *    - `BulkExportProgressDialog` は `progress` を親管理 state として受領するため、
 *      execute の `onProgress` を親に橋渡しする経路が必要
 * 4. `onEmptyTarget?` callback を追加
 *    - 要件 31.15「対象 0 件のとき通知」を、UI 文脈に依存しない汎用 callback として
 *      親に委ねる（snackbar / alert 等の選択を親に委ねる）
 * 5. `service?` prop を追加
 *    - テスト容易性のために `BulkExportService` を DI 可能にする
 *
 * @requirement site-survey/REQ-31.1 全件一括エクスポート起動
 * @requirement site-survey/REQ-31.2 選択画像エクスポート起動
 * @requirement site-survey/REQ-31.4 エクスポート設定 UI
 * @requirement site-survey/REQ-31.5 設定確定 → 一括実行
 * @requirement site-survey/REQ-31.15 対象 0 件時の通知 + クローズ
 * @see .kiro/specs/site-survey/design.md BulkExportDialog (5271-5294)
 */

import React, { useEffect, useId, useState } from 'react';
import ExportSettingsForm, { type ExportSettings } from './ExportSettingsForm';
import {
  bulkExportService as defaultBulkExportService,
  type BulkExportInput,
  type BulkExportProgress,
  type BulkExportResult,
  type BulkExportService,
  type SurveyImageMetadata,
} from '../../services/export/bulkExportService';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 一括エクスポート起動モード
 *
 * - `all`: 現場調査配下の全画像を対象とする（要件 31.1）
 * - `selected`: ユーザーが画像一覧で選択した画像のみを対象とする（要件 31.2）
 */
export type BulkExportDialogMode = 'all' | 'selected';

/**
 * `onStart` callback に渡される引数
 *
 * `BulkExportProgressDialog` の Props (promise / controller / surveyName) と
 * 対応するため object でまとめる。
 */
export interface BulkExportStartArgs {
  /** `bulkExportService.execute` が返した Promise */
  promise: Promise<BulkExportResult>;
  /** 一括エクスポートの中断に利用する AbortController */
  controller: AbortController;
  /** 現場調査名（進捗ダイアログのヘッダ表示用） */
  surveyName: string;
}

/**
 * BulkExportDialog の Props
 */
export interface BulkExportDialogProps {
  /** ダイアログの開閉状態 */
  open: boolean;
  /** 起動モード（全件 / 選択） */
  mode: BulkExportDialogMode;
  /** 現場調査 ID（`BulkExportInput.surveyId` にそのまま渡す） */
  surveyId: string;
  /** 現場調査名（ZIP ファイル名 / 進捗ダイアログのヘッダ表示用） */
  surveyName: string;
  /**
   * 対象画像メタデータ
   *
   * `bulkExportService.execute` の `BulkExportInput.images` に渡す。
   * 親側で `mode` に応じて全件 or 選択画像を解決して渡す。
   */
  images: SurveyImageMetadata[];
  /** キャンセル / 完了時に呼ばれる close callback */
  onClose: () => void;
  /**
   * 「開始」押下時に呼ばれる callback
   *
   * 親はここで受け取った `promise` / `controller` を `BulkExportProgressDialog` に
   * 引き継ぎ、進捗購読・キャンセル操作を委譲する。
   */
  onStart: (args: BulkExportStartArgs) => void;
  /**
   * 進捗 callback（任意）
   *
   * `bulkExportService.execute` の `onProgress` から橋渡しされる。
   * 親は本 callback で `BulkExportProgress` を state 化し、
   * `BulkExportProgressDialog.progress` に渡す。
   */
  onProgress?: (progress: BulkExportProgress) => void;
  /**
   * 対象 0 件時の通知 callback（任意）
   *
   * 要件 31.15 に対応。本 callback では snackbar / alert 等の UI 選択を親に委ね、
   * 本コンポーネントは即時 `onClose()` を呼び自身を閉じる。
   */
  onEmptyTarget?: () => void;
  /**
   * `BulkExportService` の DI（テスト用途）
   *
   * 省略時はモジュール singleton `bulkExportService` を利用する。
   */
  service?: BulkExportService;
}

// ============================================================================
// スタイル定義（ImageExportDialog / BulkExportProgressDialog と概ね統一）
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
    backgroundColor: '#1d4ed8', // WCAG 2.1 AA 準拠 (6.2:1 on #fff)
    border: '1px solid #1d4ed8',
    color: '#ffffff',
  },
  primaryButtonDisabled: {
    backgroundColor: '#6b7280',
    borderColor: '#6b7280',
    cursor: 'not-allowed',
  },
};

// ============================================================================
// 既定設定
// ============================================================================

/**
 * ExportSettingsForm の初期設定値
 *
 * `ImageExportDialog` と同等のデフォルト（JPEG / 中 / 注釈含む）を採用する。
 */
const DEFAULT_SETTINGS: ExportSettings = {
  format: 'jpeg',
  resolution: 'medium',
  annotationMode: 'include',
};

// ============================================================================
// コンポーネント
// ============================================================================

const BulkExportDialog: React.FC<BulkExportDialogProps> = ({
  open,
  mode,
  surveyId,
  surveyName,
  images,
  onClose,
  onStart,
  onProgress,
  onEmptyTarget,
  service = defaultBulkExportService,
}) => {
  const titleId = useId();

  // フォーム設定 state（ExportSettingsForm に渡す）
  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_SETTINGS);

  // 対象 0 件時のクローズ通知（要件 31.15）
  //
  // open=true の遷移で images=[] のとき、親に空通知してダイアログを閉じる。
  // useEffect で扱うことで React のレンダリングサイクルを尊重する。
  useEffect(() => {
    if (!open) return;
    if (images.length === 0) {
      if (onEmptyTarget) {
        onEmptyTarget();
      }
      onClose();
    }
    // onClose / onEmptyTarget の参照変更で多重発火しないよう、依存は open と images に限定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, images]);

  // open=false / 対象 0 件のときは描画しない
  if (!open) {
    return null;
  }
  if (images.length === 0) {
    // useEffect で onClose 済み。レンダリングは行わない。
    return null;
  }

  // タイトル文言
  const titleText =
    mode === 'all' ? '全件一括エクスポート' : `${images.length} 件選択画像エクスポート`;

  // 開始ボタン押下: AbortController を生成し execute を起動、onStart に引き継ぐ
  const handleStart = () => {
    // 対象 0 件は useEffect で処理済みのため、この時点で images.length > 0 が保証される。
    // 念のため二重防御として明示的に検査する。
    if (images.length === 0) {
      onClose();
      return;
    }

    const controller = new AbortController();
    const input: BulkExportInput = {
      surveyId,
      surveyName,
      images,
      settings,
    };

    // 進捗 callback の橋渡し。親が onProgress prop を渡していなければ no-op。
    const onProgressBridge = (progress: BulkExportProgress) => {
      if (onProgress) {
        onProgress(progress);
      }
    };

    const promise = service.execute(input, onProgressBridge, controller.signal);

    onStart({ promise, controller, surveyName });
    onClose();
  };

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div style={styles.header}>
          <h2 id={titleId} style={styles.title}>
            {titleText}
          </h2>
          <p style={styles.subTitle}>{surveyName}</p>
        </div>

        {/* コンテンツ */}
        <div style={styles.content}>
          <ExportSettingsForm value={settings} onChange={setSettings} />
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
            style={{ ...styles.button, ...styles.primaryButton }}
          >
            開始
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkExportDialog;
