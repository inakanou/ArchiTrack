/**
 * @fileoverview 画像アップロードUIコンポーネント
 *
 * Task 9.3: 画像アップロードUIを実装する
 * Task 108.1: アップロードUIに未送信保持と再送・破棄を結線する
 *
 * Requirements:
 * - 4.1: ファイル選択ダイアログ
 * - 4.2: 複数ファイル選択対応
 * - 4.5: エラー表示（形式不正）
 * - 4.6: エラー表示（サイズ超過）
 * - 13.3: モバイル環境でのカメラ連携
 * - 37.1: 失敗した画像を未送信画像として画面に保持する
 * - 37.3: 保持中の再送可能な画像をまとめて再送する
 * - 37.4: 再送では初回送信と同一の画像データを送り、再圧縮しない
 * - 37.6: 再送で全件成功したら未送信画像の表示を解消する
 * - 37.8: 破棄は確認の承諾時にのみ実行する
 * - 37.9: 新規のファイル選択・撮影でも既存の未送信画像を保持し続ける
 * - 37.10: アップロード中・再送中は追加の再送操作を受け付けない
 *
 * 機能:
 * - ファイル選択ダイアログ
 * - 複数ファイル選択対応
 * - ドラッグ＆ドロップアップロード
 * - アップロード進捗表示
 * - バリデーションエラー表示（形式不正、サイズ超過）
 * - モバイル環境でのカメラ連携
 * - アップロードに失敗した画像の保持と再送・破棄
 */

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import {
  ALLOWED_FILE_TYPES,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_MB,
  MAX_FILE_SIZE_BYTES,
} from './image-uploader.constants';
import { compressImagesForUpload } from '../../utils/image-compression';
import { toFailedUpload } from '../../utils/upload-failure';
import { usePendingUploads } from '../../hooks/usePendingUploads';
import PendingUploadPanel from './PendingUploadPanel';
import type { UploadOutcome } from '../../types/upload.types';

// 定数の再エクスポート（後方互換性のため）

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
  /**
   * アップロードハンドラ（バリデーション済みファイルを受け取る）
   *
   * 失敗した画像を保持・再送できるよう、失敗の内訳（`UploadOutcome`）を返せる。
   * 戻り値が `void` の場合は全件成功として扱う（既存呼び出しとの後方互換）。
   */
  onUpload: (files: File[]) => Promise<UploadOutcome | void>;
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
// 定数
// ============================================================================

/** 未送信画像の破棄を確認する文言（37.8） */
const DISCARD_CONFIRM_MESSAGE =
  '未送信の画像をすべて破棄します。破棄した画像は元に戻せません。よろしいですか？';

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
    backgroundColor: '#e5e7eb',
    color: '#525b6a', // WCAG 2.1 AA準拠: 5.0:1 contrast ratio on #e5e7eb
  } as React.CSSProperties,
  uploadAreaCompact: {
    padding: '16px 12px',
  } as React.CSSProperties,
  uploadIcon: {
    width: '48px',
    height: '48px',
    color: '#6b7280',
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
    color: '#6b7280',
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

  /** 再送の実行中フラグ。アップロード中と同様に追加の送信操作を受け付けない（37.10） */
  const [isRetrying, setIsRetrying] = useState(false);

  // 未送信画像の保持（37.1, 37.5, 37.6, 37.9）
  const { pending, retriableFiles, record, discardAll } = usePendingUploads();

  /**
   * アップロード中または再送中は送信系の操作を受け付けない（37.10）。
   *
   * 37.10 と design が明示的に求めるのは「再送・破棄」の抑止のみだが、本実装は
   * 新規選択・カメラ・D&D・キーボード操作も同時に抑止する意図的な選択を採る。
   * 送信の後処理はいずれも `record(attempted, failed)` を通り、これは
   * 「試行対象のうち失敗しなかったものを保持から取り除く」という前回保持を
   * 前提とした差分更新である。送信が同時に走ると、後から解決した試行の
   * `record` が先行試行の結果を上書きし、未送信画像を取りこぼす競合が生じる。
   * 抑止中も保持自体は維持され、完了後に新規アップロードを実行できるため
   * 37.9 の保持要件は満たされる。
   */
  const isBusy = isUploading || isRetrying;

  // 参照
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ファイルバリデーション
  // 要件21対応: MIMEタイプチェックを廃止し、画像形式の最終判定をバックエンドのマジックバイト検証に委ねる
  const validateFile = useCallback((file: File): ValidationError | null => {
    // ファイルサイズチェック
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        file,
        error: `${file.name}: ファイルサイズが${MAX_FILE_SIZE_MB}MBを超えています。`,
      };
    }

    return null;
  }, []);

  /**
   * 送信を実行し、その結果を未送信画像の保持へ反映する。
   *
   * 初回送信と再送の後処理（失敗の記録・エラー表示）を1箇所に集約し、
   * 「試行して失敗しなかった画像は保持に残らない」という不変条件を共通化する。
   *
   * 例外で失敗した場合も試行対象の File を保持へ回す（37.1）。呼び出し側の
   * `onUpload`（`SiteSurveyDetailPage.handleImageUpload` /
   * `PhotoUploader.handleUpload`）は catch を持たず、通信断・認証切れ・
   * `onPhotosAdded` の例外がそのままここへ伝播する。ここで File 参照を捨てると
   * 撮影済みの画像が復元不能に失われるため、メッセージの state 化だけでは足りない。
   *
   * @param files - 送信対象の画像
   * @param compress - 送信前に圧縮するかどうか。再送では false を指定する（37.4）
   */
  const submitFiles = useCallback(
    async (files: File[], compress: boolean): Promise<void> => {
      setUploadError(null);

      // 例外時に保持へ回す試行対象。圧縮前に例外が起きた場合は元ファイルが
      // 試行対象であるため、初期値を入力ファイルとし圧縮成功後に差し替える。
      let attempted: File[] = files;

      try {
        // 初回送信のみブラウザ側で縮小・再エンコードして通信量とサーバ負荷を削減する。
        // 非対応環境や圧縮不要な画像は元ファイルがそのまま返るため安全。
        // 再送は保持している圧縮済みの画像をそのまま送り、再圧縮による画質の
        // 二重劣化を避ける（37.4）。
        const filesToSend = compress ? await compressImagesForUpload(files) : files;
        attempted = filesToSend;
        const outcome = await onUpload(filesToSend);
        // 戻り値が void の呼び出しは全件成功として扱う（既存呼び出しとの後方互換）
        record(filesToSend, outcome?.failed ?? []);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'アップロードに失敗しました。';
        setUploadError(errorMessage);
        if (error instanceof Error) {
          onError?.(error);
        } else {
          onError?.(new Error(errorMessage));
        }

        // 試行対象をすべて未送信画像として保持する（37.1）。`toFailedUpload` は
        // 400 / 413 のみを permanent とし、通信エラーや ApiError でない例外は
        // retriable に分類するため、例外時は既定で再送可能な状態で残る（37.3, 37.16）。
        record(
          attempted,
          attempted.map((file) => toFailedUpload(file, error))
        );
      }
    },
    [onUpload, onError, record]
  );

  // ファイル処理
  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      if (disabled || isBusy) return;

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
      // 既存の未送信画像は今回の試行対象に含まれないため保持され続ける（37.9）
      if (validFiles.length > 0) {
        await submitFiles(validFiles, true);
      }
    },
    [disabled, isBusy, validateFile, onValidationError, submitFiles]
  );

  /**
   * 保持中の再送可能な画像をまとめて再送する（37.3）。
   * 再送では圧縮を通さず、初回送信と同一の画像データを送る（37.4）。
   */
  const handleRetry = useCallback(async () => {
    if (disabled || isBusy) return;

    // 再送不可（permanent）の画像は対象に含めない（37.17）
    const filesToRetry = [...retriableFiles];
    if (filesToRetry.length === 0) return;

    setIsRetrying(true);
    try {
      await submitFiles(filesToRetry, false);
    } finally {
      setIsRetrying(false);
    }
  }, [disabled, isBusy, retriableFiles, submitFiles]);

  /**
   * 保持中の未送信画像を破棄する（37.7, 37.8）。
   * 破棄した画像は復元できないため、確認が承諾された場合にのみ解放する。
   */
  const handleDiscardAll = useCallback(() => {
    if (disabled || isBusy) return;

    if (!window.confirm(DISCARD_CONFIRM_MESSAGE)) return;

    discardAll();
  }, [disabled, isBusy, discardAll]);

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
    if (!disabled && !isBusy) {
      fileInputRef.current?.click();
    }
  }, [disabled, isBusy]);

  // キーボードハンドラ
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && !disabled && !isBusy) {
        event.preventDefault();
        fileInputRef.current?.click();
      }
    },
    [disabled, isBusy]
  );

  // ドラッグイベントハンドラ
  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!disabled && !isBusy) {
        setIsDragActive(true);
      }
    },
    [disabled, isBusy]
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

      if (disabled || isBusy) return;

      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        processFiles(files);
      }
    },
    [disabled, isBusy, processFiles]
  );

  // カメラボタンクリックハンドラ
  const handleCameraClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!disabled && !isBusy) {
        cameraInputRef.current?.click();
      }
    },
    [disabled, isBusy]
  );

  // 進捗バーの計算
  const progressPercentage = uploadProgress
    ? Math.round((uploadProgress.completed / uploadProgress.total) * 100)
    : 0;

  // スタイルの計算
  const uploadAreaStyle: React.CSSProperties = {
    ...styles.uploadArea,
    ...(isDragActive ? styles.uploadAreaActive : {}),
    ...(disabled || isBusy ? styles.uploadAreaDisabled : {}),
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
        tabIndex={disabled || isBusy ? -1 : 0}
        aria-disabled={disabled || isBusy ? 'true' : undefined}
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
      </div>

      {/* カメラボタン - アップロードエリア外に配置（nested-interactive回避） */}
      <div style={styles.buttonContainer}>
        <button
          type="button"
          data-testid="camera-button"
          style={styles.cameraButton}
          onClick={handleCameraClick}
          disabled={disabled || isBusy}
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

      {/* 隠しファイル入力 */}
      <input
        ref={fileInputRef}
        type="file"
        data-testid="file-input"
        accept={ALLOWED_FILE_TYPES.join(',')}
        multiple
        disabled={disabled || isBusy}
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
        disabled={disabled || isBusy}
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
              aria-label="アップロード進捗"
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

      {/* 未送信画像の保持と再送・破棄（37.1〜37.3, 37.6〜37.10） */}
      <PendingUploadPanel
        pending={pending}
        canRetry={retriableFiles.length > 0}
        isBusy={isBusy}
        onRetry={handleRetry}
        onDiscardAll={handleDiscardAll}
      />

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
