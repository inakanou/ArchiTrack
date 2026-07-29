/**
 * @fileoverview 3系統アップローダ（ローカル/カメラ/現調選択）
 *
 * Task 6.3: 詳細画面：写真項目管理＋3系統アップロード
 *
 * site-survey の ImageUploader を踏襲し、以下3系統で写真項目を追加する。
 *   (1) ローカルファイル選択（jpg/png/webp, multiple）— ImageUploader のドロップゾーン
 *   (2) カメラ撮影（capture="environment"）— ImageUploader のカメラ入力
 *   (3) 現場調査写真の参照 — SurveyImagePicker モーダルで選択し from-surveys API でコピー
 *
 * ローカル/カメラのアップロードは uploadFilesInWaves により最大5並列（R11.5）で実行し、
 * 一部が失敗しても残りを継続する（部分失敗継続, R12.5）。成功分は onPhotosAdded で親へ
 * 通知し、失敗・部分失敗は onNotify で通知する。
 *
 * Requirements: 4.1, 4.2, 4.4, 4.5, 5.1, 5.2, 5.3, 6.1, 11.5, 12.5
 */

import { useCallback, useState } from 'react';
import { ImageUploader, type UploadProgress } from '../site-surveys/ImageUploader';
import {
  addConstructionPhotosFromSurveys,
  uploadConstructionPhotos,
} from '../../api/construction-photo-images';
import { ApiError } from '../../api/client';
import { SurveyImagePicker } from './SurveyImagePicker';
import type {
  ConstructionPhotoUploadResult,
  ConstructionPhotoWithUrls,
} from '../../types/construction-photo.types';

// ============================================================================
// 定数
// ============================================================================

/** アップロード同時実行数の上限（R11.5） */
export const MAX_UPLOAD_CONCURRENCY = 5;

// ============================================================================
// アップロードウェーブ処理
// ============================================================================

/**
 * ファイルを最大 `concurrency` 並列でアップロードする（1ファイル=1リクエスト）。
 *
 * サーバは1リクエストで複数ファイルを受け付けるが、フロントでは同時実行数を制限して
 * サーバ負荷を抑える（R11.5）。ウェーブ単位で `concurrency` 件ずつ並列実行し、各リクエストの
 * `{successful, failed}` を集約する。リクエストが例外を投げても失敗として集約し、残りの
 * ウェーブ処理を継続する（部分失敗継続）。
 *
 * @param albumId - アルバムID
 * @param files - アップロード対象ファイル
 * @param options.concurrency - 同時実行数（既定 5）
 * @param options.onProgress - 完了件数の進捗通知
 * @returns 全ウェーブを集約した {successful, failed}
 */
export async function uploadFilesInWaves(
  albumId: string,
  files: File[],
  options: {
    concurrency?: number;
    onProgress?: (progress: UploadProgress) => void;
  } = {}
): Promise<ConstructionPhotoUploadResult> {
  const concurrency = options.concurrency ?? MAX_UPLOAD_CONCURRENCY;
  const total = files.length;
  const successful: ConstructionPhotoWithUrls[] = [];
  const failed: ConstructionPhotoUploadResult['failed'] = [];

  const queue = [...files];
  let completed = 0;

  const notify = () => {
    options.onProgress?.({ completed, total, current: Math.min(completed, total - 1) });
  };

  while (queue.length > 0) {
    const wave = queue.splice(0, concurrency);
    const waveResults = await Promise.all(
      wave.map(async (file) => {
        try {
          return await uploadConstructionPhotos(albumId, [file]);
        } catch (err) {
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'アップロードに失敗しました';
          const single: ConstructionPhotoUploadResult = {
            successful: [],
            failed: [{ fileName: file.name, error: message }],
          };
          return single;
        }
      })
    );

    for (const result of waveResults) {
      successful.push(...result.successful);
      failed.push(...result.failed);
      completed += 1;
    }
    notify();
  }

  return { successful, failed };
}

// ============================================================================
// 型定義
// ============================================================================

export interface PhotoUploaderProps {
  /** アップロード先アルバムID */
  albumId: string;
  /** 現調写真の参照元プロジェクトID */
  projectId: string;
  /** 追加された写真項目（署名付きURL同梱）を親へ通知する */
  onPhotosAdded: (photos: ConstructionPhotoWithUrls[]) => void;
  /** 部分失敗・失敗などの通知メッセージ */
  onNotify?: (message: string) => void;
  /** 無効化フラグ */
  disabled?: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  surveyButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    backgroundColor: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    cursor: 'pointer',
  } as React.CSSProperties,
};

// ============================================================================
// 内部ヘルパー
// ============================================================================

/**
 * アップロード/コピー結果を通知メッセージへ整形する。
 * 部分失敗・全件失敗をユーザーに伝える（成功のみの場合は null）。
 */
function buildNotice(successCount: number, failedNames: string[]): string | null {
  if (failedNames.length === 0) {
    return null;
  }
  const detail = failedNames.join('\n');
  if (successCount > 0) {
    return `${successCount}件を追加しました。${failedNames.length}件の追加に失敗しました。\n${detail}`;
  }
  return `全${failedNames.length}件の追加に失敗しました。\n${detail}`;
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 3系統アップローダ
 *
 * ImageUploader（ローカル/カメラ）を内包し、現調写真参照ボタン＋モーダルを追加する。
 */
export function PhotoUploader({
  albumId,
  projectId,
  onPhotosAdded,
  onNotify,
  disabled = false,
}: PhotoUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | undefined>(undefined);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  // ローカル/カメラのアップロード（ImageUploader が圧縮済みファイルを渡す）
  const handleUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setIsUploading(true);
      setUploadProgress({ completed: 0, total: files.length, current: 0 });
      try {
        const { successful, failed } = await uploadFilesInWaves(albumId, files, {
          onProgress: setUploadProgress,
        });

        if (successful.length > 0) {
          onPhotosAdded(successful);
        }
        const notice = buildNotice(
          successful.length,
          failed.map((f) => f.fileName)
        );
        if (notice) {
          onNotify?.(notice);
        }
      } finally {
        setIsUploading(false);
        setUploadProgress(undefined);
      }
    },
    [albumId, onPhotosAdded, onNotify]
  );

  // 現調写真の選択確定 → コピー
  const handleSurveySelect = useCallback(
    async (surveyImageIds: string[]) => {
      if (surveyImageIds.length === 0) return;

      setIsCopying(true);
      try {
        const { successful, failed } = await addConstructionPhotosFromSurveys(
          albumId,
          surveyImageIds
        );

        if (successful.length > 0) {
          onPhotosAdded(successful);
        }
        const notice = buildNotice(
          successful.length,
          failed.map((f) => f.surveyImageId)
        );
        if (notice) {
          onNotify?.(notice);
        }
        setIsPickerOpen(false);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : '現調写真の追加に失敗しました';
        onNotify?.(message);
      } finally {
        setIsCopying(false);
      }
    },
    [albumId, onPhotosAdded, onNotify]
  );

  return (
    <div style={styles.container} data-testid="photo-uploader">
      {/* ローカル/カメラ（ImageUploader 踏襲） */}
      <ImageUploader
        onUpload={handleUpload}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        disabled={disabled}
        compact
      />

      {/* 現調写真参照 */}
      <div style={styles.actions}>
        <button
          type="button"
          style={styles.surveyButton}
          onClick={() => setIsPickerOpen(true)}
          disabled={disabled || isUploading}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          現場調査写真から選択
        </button>
      </div>

      {/* 現調写真選択モーダル */}
      <SurveyImagePicker
        projectId={projectId}
        open={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={handleSurveySelect}
        isSubmitting={isCopying}
      />
    </div>
  );
}

export default PhotoUploader;
