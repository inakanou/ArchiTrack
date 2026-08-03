/**
 * @fileoverview EstimateExportDialog - 見積書出力ダイアログ
 *
 * Task 56.9: 帳票生成をフロントエンドで完結させ、未保存の変更をそのまま出力する
 *
 * 帳票（PDF）と表計算（Excel）はいずれも**画面が持つ編集中のツリー**から生成する
 * （56.1, 56.2）。サーバーへ出力を依頼しないため、出力は保存を伴わず、未保存の変更は
 * そのまま画面に残る（56.3）。
 *
 * Requirements (estimate-creation):
 * - REQ-10.1: PDF出力を選択した場合、建設工事見積書形式のPDFファイルを生成する
 * - REQ-10.2: Excel出力を選択した場合、同じ書式規則のExcelファイル（.xlsx）を生成する
 * - REQ-10.7: 出力処理中であることを表示する
 * - REQ-10.8: 日本語描画の準備に失敗した場合は中断してエラーメッセージを表示する
 * - REQ-10.9: 出力形式のデフォルトをExcel（.xlsx）とする
 * - REQ-10.10: チェックされた行タイプ（見積・実行・業者）を出力対象とする
 * - REQ-32.1: 出力対象として「見積」「実行」「業者」をチェックボックスで複数選択可能とする
 * - REQ-32.2: チェックされた行タイプごとに独立したファイルを生成する
 * - REQ-32.3: 「見積」「実行」「業者」の順に逐次ダウンロードする
 * - REQ-32.6: 各出力ファイル名に当該ファイルの行タイプのラベルを含める
 * - REQ-32.7: チェックボックスのデフォルト値を Requirement 38 AC1 に従って設定する
 * - REQ-32.8: いずれのチェックボックスもチェックされていない場合、出力ボタンを無効化する
 * - REQ-38.1: デフォルト値として「見積」と「実行」をONとする
 * - REQ-56.1〜56.4: 未保存の変更を含む帳票を、保存を伴わずに出力し、その旨を画面に示す
 *
 * 32.2 / 32.3 / 32.6（ファイル分割・順序・ファイル名）は出力サービスの責務であり、
 * 本ダイアログはチェックされた行タイプの配列を渡すだけでこれらを満たす。
 *
 * @module components/estimate/EstimateExportDialog
 */

import { useState, useCallback } from 'react';
import type { ExportFormat } from '../../api/estimates';
import type {
  EditableItem,
  EstimateReportFields,
} from '../../domain/estimate/estimateEditReducer.types';
import { estimateExcelExportService } from '../../services/export/EstimateExcelExportService';
// 帳票（PDF）サービスは**必ず動的読み込み口を経由する**。
// 実体を静的 import すると日本語フォント資産（約2.25MB）が初期チャンクへ載る
// （`services/export/loadEstimatePdfExportService.test.ts` が静的 import グラフで検査する）。
import { loadEstimatePdfExportService } from '../../services/export/loadEstimatePdfExportService';
import { loadEstimateReportSubject } from '../../services/export/estimateReportSubject';

/**
 * 出力対象行タイプ
 */
type ExportLineType = 'ESTIMATE' | 'EXECUTION' | 'VENDOR';

/**
 * 行タイプの選択状態
 */
interface SelectedLineTypes {
  estimate: boolean;
  execution: boolean;
  vendor: boolean;
}

// ============================================================================
// 型定義
// ============================================================================

export interface EstimateExportDialogProps {
  /** ダイアログの表示状態 */
  isOpen: boolean;
  /** 見積書名（ファイル名・帳票の表題用） */
  estimateName: string;
  /** 見積書が属するプロジェクトID（表紙の周辺情報の取得に用いる） */
  projectId: string;
  /** 編集中の明細ツリー（未保存の変更を含む / 56.1, 56.2） */
  items: readonly EditableItem[];
  /** 編集中の帳票用入力項目（54.1〜54.3 / 56.2） */
  reportFields: EstimateReportFields;
  /** 未保存の変更があるか（56.4 の画面表示に用いる） */
  hasUnsavedChanges: boolean;
  /** ダイアログを閉じるコールバック */
  onClose: () => void;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 行タイプの既定（REQ-38.1 / REQ-32.7）
 *
 * 「見積」と「実行」の2つをON、「業者」をOFFとする。
 */
const DEFAULT_LINE_TYPES: SelectedLineTypes = {
  estimate: true,
  execution: true,
  vendor: false,
};

/** 出力形式の既定（REQ-10.9）: 表計算形式（Excel / .xlsx） */
const DEFAULT_FORMAT: ExportFormat = 'xlsx';

/** 出力サービスが日本語メッセージを持たない例外を投げた場合の代替表示 */
const FALLBACK_ERROR_MESSAGE = '見積書の出力に失敗しました';

/** 未保存の変更が帳票に載ることの告知（REQ-56.4） */
const UNSAVED_NOTICE_MESSAGE =
  '未保存の変更が含まれた状態で出力されます。出力しても保存はされません。';

// ============================================================================
// スタイル定義
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
  } as React.CSSProperties,
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '400px',
    width: '95%',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '24px',
  } as React.CSSProperties,
  description: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '20px',
  } as React.CSSProperties,
  formatOptions: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    marginBottom: '24px',
  } as React.CSSProperties,
  formatOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    cursor: 'pointer',
    transition: 'border-color 0.2s, background-color 0.2s',
  } as React.CSSProperties,
  formatOptionSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
  } as React.CSSProperties,
  radio: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
  } as React.CSSProperties,
  formatInfo: {
    flex: 1,
  } as React.CSSProperties,
  formatName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
  } as React.CSSProperties,
  formatDescription: {
    fontSize: '12px',
    color: '#636e7b',
    marginTop: '2px',
  } as React.CSSProperties,
  buttonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  } as React.CSSProperties,
  cancelButton: {
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    cursor: 'pointer',
  } as React.CSSProperties,
  submitButton: {
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  submitButtonDisabled: {
    backgroundColor: '#93c5fd',
    color: '#1e40af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  errorContainer: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  errorText: {
    color: '#991b1b',
    fontSize: '14px',
    margin: 0,
  } as React.CSSProperties,
  unsavedNoticeContainer: {
    backgroundColor: '#fffbeb',
    border: '1px solid #fcd34d',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  unsavedNoticeText: {
    color: '#92400e',
    fontSize: '13px',
    margin: 0,
  } as React.CSSProperties,
  progressContainer: {
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  progressText: {
    color: '#1e40af',
    fontSize: '13px',
    margin: 0,
  } as React.CSSProperties,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 選択された行タイプをExportLineType配列に変換する
 */
function getSelectedLineTypeArray(selected: SelectedLineTypes): ExportLineType[] {
  const result: ExportLineType[] = [];
  if (selected.estimate) result.push('ESTIMATE');
  if (selected.execution) result.push('EXECUTION');
  if (selected.vendor) result.push('VENDOR');
  return result;
}

/**
 * 例外から利用者向けのメッセージを取り出す
 *
 * 両出力サービスは失敗をそのまま画面に出せる日本語メッセージへ包んで送出する
 * （`EstimatePdfExportError` / `EstimateExcelExportError`）。その契約を前提に
 * `message` を表示し、契約外の値だけ代替文言へ落とす（REQ-10.8）。
 */
function toDisplayMessage(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : FALLBACK_ERROR_MESSAGE;
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積書出力ダイアログ
 *
 * Requirements:
 * - REQ-32.1: チェックボックスで複数選択
 * - REQ-32.7 / REQ-38.1: デフォルト値は「見積」と「実行」がON
 * - REQ-32.8: チェックボックス全OFFで出力ボタン無効化
 * - REQ-10.9: デフォルト出力形式は表計算形式（Excel）
 * - REQ-10.1 / REQ-10.2: PDF出力・Excel出力
 * - REQ-10.7 / REQ-10.8: 出力処理中表示・失敗時のメッセージ表示
 * - REQ-56.1〜56.4: 未保存の変更を含む帳票を保存を伴わずに出力する
 */
export function EstimateExportDialog({
  isOpen,
  estimateName,
  projectId,
  items,
  reportFields,
  hasUnsavedChanges,
  onClose,
}: EstimateExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>(DEFAULT_FORMAT);
  const [selectedLineTypes, setSelectedLineTypes] = useState<SelectedLineTypes>(DEFAULT_LINE_TYPES);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 出力処理の進捗メッセージ（REQ-10.7）。PDF出力のみ段階を報告する */
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  /** いずれかのチェックボックスが選択されているか（REQ-32.8） */
  const hasSelectedLineType =
    selectedLineTypes.estimate || selectedLineTypes.execution || selectedLineTypes.vendor;

  /**
   * チェックボックスのトグル処理
   */
  const handleLineTypeToggle = useCallback((lineTypeKey: keyof SelectedLineTypes) => {
    setSelectedLineTypes((prev) => ({
      ...prev,
      [lineTypeKey]: !prev[lineTypeKey],
    }));
  }, []);

  /**
   * 出力実行
   *
   * **編集中のツリー（`items`）と帳票用入力項目（`reportFields`）をそのまま渡す**。
   * サーバーから読み直さないため未保存の変更が帳票に載り（56.2）、
   * 保存要求を1本も出さないため未保存の変更は画面に残る（56.3）。
   */
  const handleExport = useCallback(async () => {
    if (!hasSelectedLineType) return;

    const lineTypes = getSelectedLineTypeArray(selectedLineTypes);
    setIsExporting(true);
    setError(null);
    setProgressMessage(null);

    try {
      if (selectedFormat === 'pdf') {
        // 表紙の周辺情報（工事名・宛先・自社情報）は読み取りのみ。
        const [service, subject] = await Promise.all([
          loadEstimatePdfExportService(),
          loadEstimateReportSubject(projectId),
        ]);
        await service.generateAndDownload({
          tree: items,
          lineTypes,
          estimate: { name: estimateName, reportFields },
          project: subject.project,
          customer: subject.customer,
          company: subject.company,
          onProgress: (progress) => setProgressMessage(progress.message ?? null),
        });
      } else {
        estimateExcelExportService.generateAndDownload({
          tree: items,
          lineTypes,
          estimate: { name: estimateName },
        });
      }
      onClose();
    } catch (caught) {
      setError(toDisplayMessage(caught));
    } finally {
      setIsExporting(false);
      setProgressMessage(null);
    }
  }, [
    estimateName,
    projectId,
    items,
    reportFields,
    selectedFormat,
    selectedLineTypes,
    hasSelectedLineType,
    onClose,
  ]);

  if (!isOpen) return null;

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
    >
      <div style={styles.dialog}>
        <h2 id="export-dialog-title" style={styles.title}>
          見積書出力
        </h2>

        <p style={styles.description}>出力対象と出力形式を選択してください</p>

        {/* エラー表示 */}
        {error && (
          <div role="alert" style={styles.errorContainer}>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        {/*
          未保存の変更が帳票に載ることの告知（REQ-56.4）。
          出力は編集中のツリーから生成されるため、保存前でも編集内容が反映される。
        */}
        {hasUnsavedChanges && (
          <div
            data-testid="estimate-export-unsaved-notice"
            role="status"
            style={styles.unsavedNoticeContainer}
          >
            <p style={styles.unsavedNoticeText}>{UNSAVED_NOTICE_MESSAGE}</p>
          </div>
        )}

        {/* 出力処理中の進捗表示（REQ-10.7） */}
        {progressMessage !== null && (
          <div data-testid="estimate-export-progress" style={styles.progressContainer}>
            <p style={styles.progressText}>{progressMessage}</p>
          </div>
        )}

        {/* 出力対象行タイプ選択（REQ-32.1: チェックボックス） */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
            出力対象
          </div>
          <div style={styles.formatOptions}>
            {/* 見積 */}
            <label
              style={{
                ...styles.formatOption,
                ...(selectedLineTypes.estimate ? styles.formatOptionSelected : {}),
              }}
            >
              <input
                type="checkbox"
                value="ESTIMATE"
                checked={selectedLineTypes.estimate}
                onChange={() => handleLineTypeToggle('estimate')}
                style={styles.checkbox}
                disabled={isExporting}
              />
              <div style={styles.formatInfo}>
                <div style={styles.formatName}>見積</div>
                <div style={styles.formatDescription}>見積金額行を出力します</div>
              </div>
            </label>

            {/* 実行 */}
            <label
              style={{
                ...styles.formatOption,
                ...(selectedLineTypes.execution ? styles.formatOptionSelected : {}),
              }}
            >
              <input
                type="checkbox"
                value="EXECUTION"
                checked={selectedLineTypes.execution}
                onChange={() => handleLineTypeToggle('execution')}
                style={styles.checkbox}
                disabled={isExporting}
              />
              <div style={styles.formatInfo}>
                <div style={styles.formatName}>実行</div>
                <div style={styles.formatDescription}>実行金額行を出力します</div>
              </div>
            </label>

            {/* 業者 */}
            <label
              style={{
                ...styles.formatOption,
                ...(selectedLineTypes.vendor ? styles.formatOptionSelected : {}),
              }}
            >
              <input
                type="checkbox"
                value="VENDOR"
                checked={selectedLineTypes.vendor}
                onChange={() => handleLineTypeToggle('vendor')}
                style={styles.checkbox}
                disabled={isExporting}
              />
              <div style={styles.formatInfo}>
                <div style={styles.formatName}>業者</div>
                <div style={styles.formatDescription}>業者金額行を出力します</div>
              </div>
            </label>
          </div>
        </div>

        {/* 出力形式選択 */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
            出力形式
          </div>
          <div style={styles.formatOptions}>
            {/* PDF */}
            <label
              style={{
                ...styles.formatOption,
                ...(selectedFormat === 'pdf' ? styles.formatOptionSelected : {}),
              }}
            >
              <input
                type="radio"
                name="export-format"
                value="pdf"
                checked={selectedFormat === 'pdf'}
                onChange={() => setSelectedFormat('pdf')}
                style={styles.radio}
                disabled={isExporting}
              />
              <div style={styles.formatInfo}>
                <div style={styles.formatName}>PDF形式</div>
                <div style={styles.formatDescription}>印刷用の見積書をPDFファイルで出力します</div>
              </div>
            </label>

            {/* Excel */}
            <label
              style={{
                ...styles.formatOption,
                ...(selectedFormat === 'xlsx' ? styles.formatOptionSelected : {}),
              }}
            >
              <input
                type="radio"
                name="export-format"
                value="xlsx"
                checked={selectedFormat === 'xlsx'}
                onChange={() => setSelectedFormat('xlsx')}
                style={styles.radio}
                disabled={isExporting}
              />
              <div style={styles.formatInfo}>
                <div style={styles.formatName}>Excel形式</div>
                <div style={styles.formatDescription}>
                  編集可能なExcelファイル（.xlsx）で出力します
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* ボタン */}
        <div style={styles.buttonGroup}>
          <button
            type="button"
            onClick={onClose}
            style={styles.cancelButton}
            disabled={isExporting}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!hasSelectedLineType || isExporting}
            style={{
              ...styles.submitButton,
              ...(!hasSelectedLineType || isExporting ? styles.submitButtonDisabled : {}),
            }}
          >
            {isExporting ? '出力中...' : '出力'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EstimateExportDialog;
