/**
 * @fileoverview 画像アップロードUIコンポーネント
 *
 * Task 9.3: 画像アップロードUIを実装する
 *
 * Requirements:
 * - 4.1: ファイル選択ダイアログ
 * - 4.2: 複数ファイル選択対応
 * - 4.5: エラー表示（形式不正）
 * - 4.6: エラー表示（サイズ超過）
 * - 13.3: モバイル環境でのカメラ連携
 *
 * 機能:
 * - ファイル選択ダイアログ
 * - 複数ファイル選択対応
 * - ドラッグ＆ドロップアップロード
 * - アップロード進捗表示
 * - バリデーションエラー表示（形式不正、サイズ超過）
 * - モバイル環境でのカメラ連携
 */

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import {
  ALLOWED_FILE_TYPES,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_MB,
  MAX_FILE_SIZE_BYTES,
} from './image-uploader.constants';

// 定数の再エクスポート（後方互換性のため）
// eslint-disable-next-line react-refresh/only-export-components
export { ALLOWED_FILE_TYPES, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_MB, MAX_FILE_SIZE_BYTES };

// ============================================================================
// 型定義
// ============================================================================

/**
 * アップロード進捗情報
 */
export interface UploadProgress {
  /** 完了したファイル数 */
  completed: number;
  /** 総ファイル数 */
  total: number;
  /** 現在処理中のファイルインデックス（0始まり） */
  current: number;
}

/**
 * バリデーションエラー情報
 */
export interface ValidationError {
  /** エラーが発生したファイル */
  file: File;
  /** エラーメッセージ */
  error: string;
}

/**
 * ImageUploader コンポーネントの Props
 */
export interface ImageUploaderProps {
  /** アップロードハンドラ（バリデーション済みファイルを受け取る） */
  onUpload: (files: File[]) => Promise<void>;
  /** バリデーションエラーコールバック */
  onValidationError?: (errors: ValidationError[]) => void;
  /** アップロードエラーコールバック */
  onError?: (error: Error) => void;
  /** アップロード中フラグ */
  isUploading?: boolean;
  /** アップロード進捗情報 */
  uploadProgress?: UploadProgress;
  /** 無効状態 */
  disabled?: boolean;
  /** コンパクト表示 */
  compact?: boolean;
  /** カスタムクラス名 */
  className?: string;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    width: '100%',
  } as React.CSSProperties,
  uploadArea: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 24px',
    borderWidth: '2px',
    borderStyle: 'dashed',
    borderColor: '#d1d5db',
    borderRadius: '12px',
    backgroundColor: '#f9fafb',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    outline: 'none',
  } as React.CSSProperties,
  uploadAreaActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  } as React.CSSProperties,
  uploadAreaDisabled: {
    cursor: 'not-allowed',
    opacity: 0.6,
  } as React.CSSProperties,
  uploadAreaCompact: {
    padding: '16px 12px',
  } as React.CSSProperties,
  uploadIcon: {
    width: '48px',
    height: '48px',
    color: '#9ca3af',
    marginBottom: '16px',
  } as React.CSSProperties,
  uploadIconCompact: {
    width: '32px',
    height: '32px',
    marginBottom: '8px',
  } as React.CSSProperties,
  uploadTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '4px',
  } as React.CSSProperties,
  uploadDescription: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '12px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  uploadHint: {
    fontSize: '12px',
    color: '#9ca3af',
  } as React.CSSProperties,
  hiddenInput: {
    position: 'absolute' as const,
    width: 0,
    height: 0,
    opacity: 0,
    overflow: 'hidden',
  } as React.CSSProperties,
  buttonContainer: {
    display: 'flex',
    gap: '12px',
    marginTop: '16px',
  } as React.CSSProperties,
  cameraButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    backgroundColor: '#ffffff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  } as React.CSSProperties,
  progressContainer: {
    marginTop: '16px',
    width: '100%',
  } as React.CSSProperties,
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
  } as React.CSSProperties,
  progressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  } as React.CSSProperties,
  progressText: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '8px',
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
  spinner: {
    width: '16px',
    height: '16px',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: '#e5e7eb',
    borderTopColor: '#2563eb',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  } as React.CSSProperties,
  errorContainer: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: '#fef2f2',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#fecaca',
    borderRadius: '8px',
  } as React.CSSProperties,
  errorTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#dc2626',
    marginBottom: '8px',
  } as React.CSSProperties,
  errorList: {
    margin: 0,
    padding: '0 0 0 20px',
    fontSize: '13px',
    color: '#b91c1c',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 画像アップロードUIコンポーネント
 *
 * ファイル選択、ドラッグ＆ドロップ、カメラ撮影による画像アップロードを
 * サポートするコンポーネントです。
 *
 * @example
 * ```tsx
 * <ImageUploader
 *   onUpload={handleUpload}
 *   isUploading={isUploading}
 *   uploadProgress={progress}
 * />
 * ```
 */
export function ImageUploader({
  onUpload,
  onValidationError,
  onError,
  isUploading = false,
  uploadProgress,
  disabled = false,
  compact = false,
  className = '',
}: ImageUploaderProps) {
  // 状態管理
  const [isDragActive, setIsDragActive] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // 参照
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ファイルバリデーション
  const validateFile = useCallback((file: File): ValidationError | null => {
    // MIMEタイプチェック
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        file,
        error: `${file.name}: サポートされていないファイル形式です。JPEG、PNG、WEBPのみ対応しています。`,
      };
    }

    // ファイルサイズチェック
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        file,
        error: `${file.name}: ファイルサイズが${MAX_FILE_SIZE_MB}MBを超えています。`,
      };
    }

    return null;
  }, []);

  // ファイル処理
  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      if (disabled || isUploading) return;

      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      // バリデーション
      const errors: ValidationError[] = [];
      const validFiles: File[] = [];

      fileArray.forEach((file) => {
        const error = validateFile(file);
        if (error) {
          errors.push(error);
        } else {
          validFiles.push(file);
        }
      });

      // バリデーションエラーを設定
      if (errors.length > 0) {
        setValidationErrors(errors);
        onValidationError?.(errors);
      } else {
        setValidationErrors([]);
      }

      // 有効なファイルがある場合はアップロード
      if (validFiles.length > 0) {
        setUploadError(null);
        try {
          await onUpload(validFiles);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'アップロードに失敗しました。';
          setUploadError(errorMessage);
          if (error instanceof Error) {
            onError?.(error);
          } else {
            onError?.(new Error(errorMessage));
          }
        }
      }
    },
    [disabled, isUploading, validateFile, onUpload, onValidationError, onError]
  );

  // ファイル入力変更ハンドラ
  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files) {
        processFiles(files);
      }
      // 同じファイルを再選択できるようにリセット
      event.target.value = '';
    },
    [processFiles]
  );

  // クリックハンドラ
  const handleClick = useCallback(() => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  }, [disabled, isUploading]);

  // キーボードハンドラ
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && !disabled && !isUploading) {
        event.preventDefault();
        fileInputRef.current?.click();
      }
    },
    [disabled, isUploading]
  );

  // ドラッグイベントハンドラ
  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!disabled && !isUploading) {
        setIsDragActive(true);
      }
    },
    [disabled, isUploading]
  );

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragActive(false);

      if (disabled || isUploading) return;

      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        processFiles(files);
      }
    },
    [disabled, isUploading, processFiles]
  );

  // カメラボタンクリックハンドラ
  const handleCameraClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!disabled && !isUploading) {
        cameraInputRef.current?.click();
      }
    },
    [disabled, isUploading]
  );

  // 進捗バーの計算
  const progressPercentage = uploadProgress
    ? Math.round((uploadProgress.completed / uploadProgress.total) * 100)
    : 0;

  // スタイルの計算
  const uploadAreaStyle: React.CSSProperties = {
    ...styles.uploadArea,
    ...(isDragActive ? styles.uploadAreaActive : {}),
    ...(disabled || isUploading ? styles.uploadAreaDisabled : {}),
    ...(compact ? styles.uploadAreaCompact : {}),
  };

  const uploadIconStyle: React.CSSProperties = {
    ...styles.uploadIcon,
    ...(compact ? styles.uploadIconCompact : {}),
  };

  return (
    <div
      data-testid="image-uploader"
      data-compact={compact ? 'true' : undefined}
      className={className}
      style={styles.container}
    >
      {/* アップロードエリア */}
      <div
        data-testid="upload-area"
        data-drag-active={isDragActive ? 'true' : undefined}
        role="button"
        tabIndex={disabled || isUploading ? -1 : 0}
        aria-disabled={disabled || isUploading ? 'true' : undefined}
        style={uploadAreaStyle}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* アップロードアイコン */}
        <svg style={uploadIconStyle} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>

        {/* タイトル */}
        <div style={styles.uploadTitle}>画像をアップロード</div>

        {/* 説明文 */}
        <div style={styles.uploadDescription}>ファイルを選択またはドラッグ＆ドロップ</div>

        {/* ヒント */}
        <div style={styles.uploadHint}>対応形式: JPEG, PNG, WEBP（最大{MAX_FILE_SIZE_MB}MB）</div>

        {/* ボタンコンテナ */}
        <div style={styles.buttonContainer}>
          {/* カメラボタン */}
          <button
            type="button"
            data-testid="camera-button"
            style={styles.cameraButton}
            onClick={handleCameraClick}
            disabled={disabled || isUploading}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            カメラで撮影
          </button>
        </div>
      </div>

      {/* 隠しファイル入力 */}
      <input
        ref={fileInputRef}
        type="file"
        data-testid="file-input"
        accept={ALLOWED_FILE_TYPES.join(',')}
        multiple
        disabled={disabled || isUploading}
        onChange={handleFileChange}
        style={styles.hiddenInput}
        aria-label="画像ファイルを選択"
      />

      {/* カメラ入力（モバイル対応） */}
      <input
        ref={cameraInputRef}
        type="file"
        data-testid="camera-input"
        accept="image/*"
        capture="environment"
        disabled={disabled || isUploading}
        onChange={handleFileChange}
        style={styles.hiddenInput}
        aria-label="カメラで撮影"
      />

      {/* アップロード進捗表示 */}
      {isUploading && (
        <div data-testid="upload-progress" style={styles.progressContainer} role="status">
          <div style={styles.progressBar}>
            <div
              role="progressbar"
              aria-valuenow={progressPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                ...styles.progressFill,
                width: `${progressPercentage}%`,
              }}
            />
          </div>
          <div style={styles.progressText}>
            <div data-testid="upload-spinner" style={styles.spinner} />
            {uploadProgress && (
              <span>
                {uploadProgress.completed} / {uploadProgress.total} ファイル完了
              </span>
            )}
          </div>
        </div>
      )}

      {/* バリデーションエラー表示 */}
      {validationErrors.length > 0 && (
        <div data-testid="validation-errors" role="alert" style={styles.errorContainer}>
          <div style={styles.errorTitle}>アップロードできないファイルがあります</div>
          <ul style={styles.errorList}>
            {validationErrors.map((error, index) => (
              <li key={index}>{error.error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* アップロードエラー表示 */}
      {uploadError && (
        <div data-testid="upload-error" role="alert" style={styles.errorContainer}>
          <div style={styles.errorTitle}>アップロードエラー</div>
          <p style={{ margin: 0, fontSize: '13px', color: '#b91c1c' }}>{uploadError}</p>
        </div>
      )}

      {/* スピナーアニメーション用のスタイル */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// デフォルトエクスポート
export default ImageUploader;
