/**
 * @fileoverview 受領見積書登録・編集フォームコンポーネント
 *
 * Task 14.1: ReceivedQuotationFormの実装
 *
 * Requirements:
 * - 11.2: 受領見積書登録フォーム
 * - 11.3: 受領見積書名（必須）
 * - 11.4: 提出日（必須）
 * - 11.5: テキスト入力フィールド
 * - 11.6: ファイルアップロード
 * - 11.7: テキストとファイルの排他的選択
 * - 11.8: ファイル形式制限（PDF、Excel、画像）
 * - 11.10: バリデーションエラー表示
 * - 11.15: 受領見積書編集
 */

import { useState, useCallback, useRef, type ChangeEvent } from 'react';

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
 * コンテンツタイプ
 */
type ContentType = 'TEXT' | 'FILE';

/**
 * 受領見積書情報（既存データ）
 */
export interface ReceivedQuotationInfo {
  id: string;
  estimateRequestId: string;
  name: string;
  submittedAt: Date;
  contentType: ContentType;
  textContent: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 受領見積書作成入力
 */
export interface CreateReceivedQuotationInput {
  name: string;
  submittedAt: Date;
  contentType: ContentType;
  textContent?: string;
  file?: File;
}

/**
 * 受領見積書更新入力
 */
export interface UpdateReceivedQuotationInput {
  name?: string;
  submittedAt?: Date;
  contentType?: ContentType;
  textContent?: string;
  file?: File;
}

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
  textarea: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    outline: 'none',
    resize: 'vertical' as const,
    minHeight: '120px',
  },
  radioGroup: {
    display: 'flex',
    gap: '16px',
    marginTop: '4px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    color: '#374151',
    cursor: 'pointer',
  },
  radioInput: {
    width: '16px',
    height: '16px',
    accentColor: '#2563eb',
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
 * 受領見積書登録・編集フォーム
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
  const [name, setName] = useState(initialData?.name ?? '');
  const [submittedAt, setSubmittedAt] = useState(formatDateForInput(initialData?.submittedAt));
  const [contentType, setContentType] = useState<ContentType>(initialData?.contentType ?? 'TEXT');
  const [textContent, setTextContent] = useState(initialData?.textContent ?? '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

    if (contentType === 'TEXT') {
      if (!textContent.trim()) {
        newErrors.content = 'テキスト内容を入力してください';
      }
    } else {
      // FILEモード
      if (!selectedFile && (!initialData || initialData.contentType !== 'FILE')) {
        newErrors.content = 'ファイルを選択してください';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, submittedAt, contentType, textContent, selectedFile, initialData]);

  // フォーム送信
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validate()) {
        return;
      }

      const data: CreateReceivedQuotationInput | UpdateReceivedQuotationInput = {
        name: name.trim(),
        submittedAt: new Date(submittedAt),
        contentType,
        ...(contentType === 'TEXT'
          ? { textContent: textContent.trim() }
          : { file: selectedFile ?? undefined }),
      };

      await onSubmit(data);
    },
    [name, submittedAt, contentType, textContent, selectedFile, validate, onSubmit]
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

  // コンテンツタイプ変更ハンドラ
  const handleContentTypeChange = useCallback((type: ContentType) => {
    setContentType(type);
    setErrors((prev) => ({ ...prev, content: undefined, file: undefined }));
    // 切り替え時にコンテンツをクリア
    if (type === 'TEXT') {
      setSelectedFile(null);
      setTextContent('');
    } else {
      setTextContent('');
    }
  }, []);

  // テキスト内容変更ハンドラ
  const handleTextContentChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setTextContent(e.target.value);
    setErrors((prev) => ({ ...prev, content: undefined }));
  }, []);

  // ファイル選択ハンドラ
  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
    setErrors((prev) => ({ ...prev, content: undefined, file: undefined }));
  }, []);

  // ファイル削除ハンドラ
  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // ファイルアップロードエリアクリックハンドラ
  const handleUploadAreaClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const submitButtonText = mode === 'create' ? '登録' : '更新';
  const submitButtonLoadingText = mode === 'create' ? '登録中...' : '更新中...';

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

      {/* コンテンツタイプ選択 */}
      <div style={styles.fieldGroup}>
        <span style={styles.label}>
          内容<span style={styles.required}>*</span>
        </span>
        <div style={styles.radioGroup}>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="contentType"
              value="TEXT"
              checked={contentType === 'TEXT'}
              onChange={() => handleContentTypeChange('TEXT')}
              disabled={isSubmitting}
              style={styles.radioInput}
            />
            テキスト
          </label>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="contentType"
              value="FILE"
              checked={contentType === 'FILE'}
              onChange={() => handleContentTypeChange('FILE')}
              disabled={isSubmitting}
              style={styles.radioInput}
            />
            ファイル
          </label>
        </div>
      </div>

      {/* テキスト入力 */}
      {contentType === 'TEXT' && (
        <div style={styles.fieldGroup}>
          <textarea
            id="text-content"
            value={textContent}
            onChange={handleTextContentChange}
            placeholder="見積内容を入力してください"
            disabled={isSubmitting}
            style={{
              ...styles.textarea,
              ...(errors.content ? styles.inputError : {}),
            }}
            aria-invalid={!!errors.content}
            aria-describedby={errors.content ? 'content-error' : undefined}
          />
          {errors.content && (
            <p id="content-error" style={styles.errorText} role="alert">
              {errors.content}
            </p>
          )}
        </div>
      )}

      {/* ファイルアップロード */}
      {contentType === 'FILE' && (
        <div style={styles.fieldGroup}>
          <div
            onClick={handleUploadAreaClick}
            onKeyDown={(e) => e.key === 'Enter' && handleUploadAreaClick()}
            role="button"
            tabIndex={0}
            style={{
              ...styles.fileUploadArea,
              ...(errors.content || errors.file ? styles.fileUploadAreaError : {}),
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
            <span style={styles.fileUploadText}>ファイルを選択</span>
            <span style={styles.fileUploadHint}>PDF、Excel、画像（JPEG、PNG）/ 最大10MB</span>
          </div>
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
          {selectedFile && (
            <div style={styles.selectedFile}>
              <div>
                <div style={styles.selectedFileName}>{selectedFile.name}</div>
                <div style={styles.selectedFileSize}>{formatFileSize(selectedFile.size)}</div>
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

          {/* 編集モードで既存ファイルがある場合 */}
          {!selectedFile &&
            mode === 'edit' &&
            initialData?.contentType === 'FILE' &&
            initialData.fileName && (
              <div style={styles.selectedFile}>
                <div>
                  <div style={styles.selectedFileName}>{initialData.fileName}</div>
                  {initialData.fileSize && (
                    <div style={styles.selectedFileSize}>
                      {formatFileSize(initialData.fileSize)}
                    </div>
                  )}
                </div>
              </div>
            )}

          {(errors.content || errors.file) && (
            <p style={styles.errorText} role="alert">
              {errors.file || errors.content}
            </p>
          )}
        </div>
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
