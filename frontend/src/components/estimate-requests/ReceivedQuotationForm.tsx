/**
 * @fileoverview 受領見積書登録・編集フォームコンポーネント（改訂版）
 *
 * Task 14.1: ReceivedQuotationFormの実装
 * Task 26.1: ReceivedQuotationFormの改訂統合
 *
 * Requirements:
 * - 11.1: 受領見積書登録ボタン表示
 * - 11.2: 受領見積書登録フォーム
 * - 11.3: 受領見積書名（必須）
 * - 11.4: 提出日（必須）
 * - 11.5: ファイルアップロードフィールド表示
 * - 11.6: ドラッグ&ドロップによるファイル選択のサポート
 * - 11.7: ファイル形式制限（PDF、Excel、画像）
 * - 11.8: ファイルサイズ上限10MB
 * - 11.9: 構造化データ入力エリア表示
 * - 11.14: フォーム初期表示時に1行の空明細行表示
 * - 11.22: ファイルまたは明細行データのいずれか入力で保存可能
 * - 11.23: 必須項目バリデーション
 * - 11.24: ファイル未アップロード・全明細行空の場合のエラー表示
 * - 11.25: 受領見積書の編集機能
 */

import {
  useState,
  useCallback,
  useRef,
  Suspense,
  lazy,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import type {
  ReceivedQuotationInfo,
  CreateReceivedQuotationInput,
  UpdateReceivedQuotationInput,
  LineItemInput,
} from '../../api/received-quotations';
import { LineItemEditor, createEmptyLineItem, type LineItemFormData } from './LineItemEditor';
import { FileInlinePreview } from './FileInlinePreview';

// OcrDataExtractorを遅延ロード（バンドルサイズ影響回避）
const OcrDataExtractor = lazy(() => import('./OcrDataExtractor'));

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 許可されるファイル形式
 */
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

/**
 * 許可されるファイル拡張子（accept属性用）
 */
const ALLOWED_FILE_EXTENSIONS = '.pdf,.xls,.xlsx,.jpg,.jpeg,.png';

/**
 * ファイルサイズ上限（10MB）
 */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// ============================================================================
// 型定義
// ============================================================================

/**
 * 受領見積書情報をAPIクライアントから再エクスポート
 */
export type {
  ReceivedQuotationInfo,
  CreateReceivedQuotationInput,
  UpdateReceivedQuotationInput,
} from '../../api/received-quotations';

/**
 * ReceivedQuotationFormコンポーネントのProps
 */
export interface ReceivedQuotationFormProps {
  /** フォームモード */
  mode: 'create' | 'edit';
  /** 見積依頼ID */
  estimateRequestId: string;
  /** 編集時の初期データ */
  initialData?: ReceivedQuotationInfo;
  /** 送信時のコールバック */
  onSubmit: (data: CreateReceivedQuotationInput | UpdateReceivedQuotationInput) => Promise<void>;
  /** キャンセル時のコールバック */
  onCancel: () => void;
  /** 送信中フラグ */
  isSubmitting?: boolean;
}

/**
 * フォームエラー状態
 */
interface FormErrors {
  name?: string;
  submittedAt?: string;
  content?: string;
  file?: string;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
  },
  required: {
    color: '#ef4444',
    marginLeft: '4px',
  },
  input: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    fontSize: '12px',
    color: '#ef4444',
    marginTop: '4px',
  },
  buttonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '8px',
  },
  button: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    transition: 'background-color 0.2s',
  },
  submitButton: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  },
  cancelButton: {
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
  },
  cancelButtonDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
    cursor: 'not-allowed',
  },
  loadingWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  fileUploadArea: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    borderWidth: '2px',
    borderStyle: 'dashed',
    borderColor: '#d1d5db',
    borderRadius: '8px',
    backgroundColor: '#f9fafb',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  fileUploadAreaDragOver: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  fileUploadAreaError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  fileUploadText: {
    fontSize: '14px',
    color: '#6b7280',
    marginTop: '8px',
  },
  fileUploadHint: {
    fontSize: '12px',
    color: '#9ca3af',
    marginTop: '4px',
  },
  selectedFile: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#f3f4f6',
    borderRadius: '6px',
    marginTop: '8px',
  },
  selectedFileName: {
    fontSize: '14px',
    color: '#374151',
    fontWeight: 500,
  },
  selectedFileSize: {
    fontSize: '12px',
    color: '#6b7280',
  },
  removeFileButton: {
    marginLeft: 'auto',
    padding: '4px 8px',
    fontSize: '12px',
    color: '#ef4444',
    backgroundColor: 'transparent',
    border: '1px solid #ef4444',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  hiddenInput: {
    display: 'none',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    marginTop: '16px',
    marginBottom: '8px',
  },
  previewSection: {
    marginTop: '16px',
  },
  ocrSection: {
    marginTop: '16px',
  },
  lineItemsSection: {
    marginTop: '16px',
  },
  suspenseFallback: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    color: '#6b7280',
    fontSize: '14px',
  },
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * ファイルサイズを人間が読める形式にフォーマット
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * ファイル形式をバリデート
 */
function isValidFileType(file: File): boolean {
  return ALLOWED_MIME_TYPES.includes(file.type);
}

/**
 * ファイルサイズをバリデート
 */
function isValidFileSize(file: File): boolean {
  return file.size <= MAX_FILE_SIZE_BYTES;
}

/**
 * 日付をyyyy-MM-dd形式にフォーマット
 */
function formatDateForInput(date: Date | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 明細行が有効なデータを持つか判定
 */
function hasValidLineItemData(items: LineItemFormData[]): boolean {
  return items.some((item) => item.name.trim() !== '');
}

/**
 * LineItemFormDataをLineItemInputに変換
 */
function convertToLineItemInput(items: LineItemFormData[]): LineItemInput[] {
  return items
    .filter((item) => item.name.trim() !== '')
    .map((item, index) => ({
      name: item.name.trim(),
      specification: item.specification.trim() || undefined,
      unit: item.unit.trim() || undefined,
      quantity: item.quantity ? parseFloat(item.quantity) : undefined,
      unitPrice: item.unitPrice ? parseFloat(item.unitPrice) : undefined,
      amount: item.amount ?? undefined,
      remarks: item.remarks.trim() || undefined,
      sortOrder: index,
    }));
}

/**
 * ReceivedQuotationInfoのlineItemsをLineItemFormDataに変換
 */
function convertToLineItemFormData(
  items: ReceivedQuotationInfo['lineItems'] | undefined
): LineItemFormData[] {
  if (!items || items.length === 0) {
    return [createEmptyLineItem()];
  }
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    specification: item.specification ?? '',
    unit: item.unit ?? '',
    quantity: item.quantity !== null ? String(item.quantity) : '',
    unitPrice: item.unitPrice !== null ? String(item.unitPrice) : '',
    amount: item.amount,
    remarks: item.remarks ?? '',
  }));
}

// ============================================================================
// ローディングスピナー
// ============================================================================

function LoadingSpinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ animation: 'spin 1s linear infinite' }}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 受領見積書登録・編集フォーム（改訂版）
 *
 * ファイルアップロードと構造化データ入力（明細行）の共存UIを提供する。
 * ファイルまたは明細行データのいずれかが入力されていれば保存可能。
 *
 * @example
 * ```tsx
 * <ReceivedQuotationForm
 *   mode="create"
 *   estimateRequestId="er-123"
 *   onSubmit={handleSubmit}
 *   onCancel={() => setShowForm(false)}
 * />
 * ```
 */
export function ReceivedQuotationForm({
  mode,
  estimateRequestId: _estimateRequestId,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: ReceivedQuotationFormProps) {
  // フォーム状態
  // Requirement 11.3.1: 受領見積書名のデフォルト値を「見積書」とする
  const [name, setName] = useState(initialData?.name ?? '見積書');
  // Requirement 11.4.1: 提出日のデフォルト値を現在日付とする
  const [submittedAt, setSubmittedAt] = useState(
    formatDateForInput(initialData?.submittedAt ?? new Date())
  );

  // ファイル状態
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [existingFileName] = useState<string | null>(initialData?.fileName ?? null);
  const [removeFile, setRemoveFile] = useState(false);

  // 明細行状態（11.14: 初期表示時に1行の空明細行）
  const [lineItems, setLineItems] = useState<LineItemFormData[]>(
    convertToLineItemFormData(initialData?.lineItems)
  );

  // ドラッグ&ドロップ状態
  const [isDragOver, setIsDragOver] = useState(false);

  // エラー状態
  const [errors, setErrors] = useState<FormErrors>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // バリデーション
  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!name.trim()) {
      newErrors.name = '受領見積書名を入力してください';
    }

    if (!submittedAt) {
      newErrors.submittedAt = '提出日を入力してください';
    }

    // 11.24: ファイル未アップロード・全明細行空の場合のエラー
    const hasFile = selectedFile !== null || (existingFileName !== null && !removeFile);
    const hasLineItems = hasValidLineItemData(lineItems);

    if (!hasFile && !hasLineItems) {
      newErrors.content = 'ファイルのアップロードまたは明細行データの入力が必要です';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, submittedAt, selectedFile, existingFileName, removeFile, lineItems]);

  // フォーム送信
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validate()) {
        return;
      }

      const lineItemInputs = convertToLineItemInput(lineItems);

      const data: CreateReceivedQuotationInput | UpdateReceivedQuotationInput = {
        name: name.trim(),
        submittedAt: new Date(submittedAt),
        ...(selectedFile ? { file: selectedFile } : {}),
        ...(removeFile ? { removeFile: true } : {}),
        ...(lineItemInputs.length > 0 ? { lineItems: lineItemInputs } : {}),
      };

      await onSubmit(data);
    },
    [name, submittedAt, selectedFile, removeFile, lineItems, validate, onSubmit]
  );

  // 名前変更ハンドラ
  const handleNameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setErrors((prev) => ({ ...prev, name: undefined }));
  }, []);

  // 提出日変更ハンドラ
  const handleDateChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSubmittedAt(e.target.value);
    setErrors((prev) => ({ ...prev, submittedAt: undefined }));
  }, []);

  // ファイル選択ハンドラ
  const handleFileSelect = useCallback((file: File) => {
    // ファイル形式バリデーション
    if (!isValidFileType(file)) {
      setErrors((prev) => ({
        ...prev,
        file: 'PDF、Excel、画像ファイルのみ対応しています',
      }));
      return;
    }

    // ファイルサイズバリデーション
    if (!isValidFileSize(file)) {
      setErrors((prev) => ({
        ...prev,
        file: 'ファイルサイズは10MB以下にしてください',
      }));
      return;
    }

    setSelectedFile(file);
    setRemoveFile(false);
    setErrors((prev) => ({ ...prev, content: undefined, file: undefined }));
  }, []);

  // ファイルinput変更ハンドラ
  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  // ファイル削除ハンドラ
  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    if (mode === 'edit' && existingFileName) {
      setRemoveFile(true);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [mode, existingFileName]);

  // ファイルアップロードエリアクリックハンドラ
  const handleUploadAreaClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ドラッグ&ドロップハンドラ (11.6)
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  // 明細行変更ハンドラ
  const handleLineItemsChange = useCallback((items: LineItemFormData[]) => {
    setLineItems(items);
    setErrors((prev) => ({ ...prev, content: undefined }));
  }, []);

  // OCR一括取り込みハンドラ
  const handleImportLineItems = useCallback((items: LineItemFormData[]) => {
    setLineItems(items);
    setErrors((prev) => ({ ...prev, content: undefined }));
  }, []);

  const submitButtonText = mode === 'create' ? '登録' : '更新';
  const submitButtonLoadingText = mode === 'create' ? '登録中...' : '更新中...';

  // ファイル表示判定
  const hasCurrentFile = selectedFile !== null || (existingFileName !== null && !removeFile);
  const displayFileName = selectedFile?.name ?? existingFileName;
  const displayFileSize = selectedFile?.size ?? initialData?.fileSize;

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      {/* 受領見積書名 */}
      <div style={styles.fieldGroup}>
        <label htmlFor="quotation-name" style={styles.label}>
          受領見積書名<span style={styles.required}>*</span>
        </label>
        <input
          id="quotation-name"
          type="text"
          value={name}
          onChange={handleNameChange}
          maxLength={200}
          placeholder="受領見積書名を入力"
          disabled={isSubmitting}
          style={{
            ...styles.input,
            ...(errors.name ? styles.inputError : {}),
          }}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'name-error' : undefined}
        />
        {errors.name && (
          <p id="name-error" style={styles.errorText} role="alert">
            {errors.name}
          </p>
        )}
      </div>

      {/* 提出日 */}
      <div style={styles.fieldGroup}>
        <label htmlFor="submitted-at" style={styles.label}>
          提出日<span style={styles.required}>*</span>
        </label>
        <input
          id="submitted-at"
          type="date"
          value={submittedAt}
          onChange={handleDateChange}
          disabled={isSubmitting}
          style={{
            ...styles.input,
            ...(errors.submittedAt ? styles.inputError : {}),
          }}
          aria-invalid={!!errors.submittedAt}
          aria-describedby={errors.submittedAt ? 'date-error' : undefined}
        />
        {errors.submittedAt && (
          <p id="date-error" style={styles.errorText} role="alert">
            {errors.submittedAt}
          </p>
        )}
      </div>

      {/* ファイルアップロード (11.5, 11.6) */}
      <div style={styles.fieldGroup}>
        <span style={styles.label}>ファイル</span>

        {!hasCurrentFile && (
          <div
            onClick={handleUploadAreaClick}
            onKeyDown={(e) => e.key === 'Enter' && handleUploadAreaClick()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            style={{
              ...styles.fileUploadArea,
              ...(isDragOver ? styles.fileUploadAreaDragOver : {}),
              ...(errors.file ? styles.fileUploadAreaError : {}),
            }}
          >
            <svg
              width="32"
              height="32"
              fill="none"
              viewBox="0 0 24 24"
              stroke="#6b7280"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3v11.25"
              />
            </svg>
            <span style={styles.fileUploadText}>ファイルを選択またはドラッグ&ドロップ</span>
            <span style={styles.fileUploadHint}>PDF、Excel、画像（JPEG、PNG）/ 最大10MB</span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          data-testid="file-input"
          accept={ALLOWED_FILE_EXTENSIONS}
          onChange={handleFileChange}
          disabled={isSubmitting}
          style={styles.hiddenInput}
        />

        {/* 選択されたファイル表示 */}
        {hasCurrentFile && displayFileName && (
          <div style={styles.selectedFile}>
            <div>
              <div style={styles.selectedFileName}>{displayFileName}</div>
              {displayFileSize && (
                <div style={styles.selectedFileSize}>{formatFileSize(displayFileSize)}</div>
              )}
            </div>
            <button
              type="button"
              onClick={handleRemoveFile}
              style={styles.removeFileButton}
              disabled={isSubmitting}
            >
              削除
            </button>
          </div>
        )}

        {errors.file && (
          <p style={styles.errorText} role="alert">
            {errors.file}
          </p>
        )}
      </div>

      {/* ファイルインラインプレビュー (11.5) */}
      {selectedFile && (
        <div style={styles.previewSection}>
          <FileInlinePreview file={selectedFile} />
        </div>
      )}

      {/* OcrDataExtractor（遅延ロード） */}
      {selectedFile && (
        <div style={styles.ocrSection}>
          <Suspense
            fallback={<div style={styles.suspenseFallback}>OCRエンジンを読み込み中...</div>}
          >
            <OcrDataExtractor file={selectedFile} onImportLineItems={handleImportLineItems} />
          </Suspense>
        </div>
      )}

      {/* 構造化データ入力エリア（明細行エディタ） (11.9) */}
      <div style={styles.lineItemsSection}>
        <div style={styles.sectionTitle}>明細行</div>
        <LineItemEditor
          lineItems={lineItems}
          onLineItemsChange={handleLineItemsChange}
          disabled={isSubmitting}
        />
      </div>

      {/* コンテンツエラー（ファイルも明細行もない場合） */}
      {errors.content && (
        <p style={styles.errorText} role="alert">
          {errors.content}
        </p>
      )}

      {/* ボタングループ */}
      <div style={styles.buttonGroup}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          style={{
            ...styles.button,
            ...styles.cancelButton,
            ...(isSubmitting ? styles.cancelButtonDisabled : {}),
          }}
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            ...styles.button,
            ...styles.submitButton,
            ...(isSubmitting ? styles.submitButtonDisabled : {}),
          }}
        >
          {isSubmitting ? (
            <span style={styles.loadingWrapper}>
              <LoadingSpinner />
              {submitButtonLoadingText}
            </span>
          ) : (
            submitButtonText
          )}
        </button>
      </div>
    </form>
  );
}

export default ReceivedQuotationForm;
