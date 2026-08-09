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
 * Task 108.3: 失敗した画像を撮り直さずに再送できるよう、失敗した `File` の実体と
 * 再送可否の区分を `ImageUploader` へ返す（site-survey 37.1 / 工事写真 20.1）。
 * 失敗通知（onNotify）の文言と部分失敗継続の挙動は変更しない。
 *
 * Task 14: 親への通知（onPhotosAdded / onNotify）の呼び出しを個別に保護し、通知の例外を
 * 送信の失敗として扱わない。保持は「試行対象のうち失敗しなかったものを取り除く」差分更新
 * であるため、通知の例外が伝播すると登録済みの画像まで未送信画像として残り、再送で重複
 * 登録される（工事写真 20.5, 20.14）。
 *
 * Requirements: 4.1, 4.2, 4.4, 4.5, 5.1, 5.2, 5.3, 6.1, 11.5, 12.5, 20.5, 20.14, 37.1
 */

import { useCallback, useState } from 'react';
import { ImageUploader, type UploadProgress } from '../site-surveys/ImageUploader';
import {
  addConstructionPhotosFromSurveys,
  uploadConstructionPhotos,
} from '../../api/construction-photo-images';
import { ApiError } from '../../api/client';
import { toFailedUpload } from '../../utils/upload-failure';
import { SurveyImagePicker } from './SurveyImagePicker';
import type { ConstructionPhotoWithUrls } from '../../types/construction-photo.types';
import type { FailedUpload, UploadOutcome } from '../../types/upload.types';

// ============================================================================
// 定数
// ============================================================================

/** アップロード同時実行数の上限（R11.5） */
export const MAX_UPLOAD_CONCURRENCY = 5;

/**
 * 1リクエスト内の個別ファイル失敗を表す HTTP ステータス（Multi-Status）。
 *
 * `uploadConstructionPhotos` は部分失敗を例外にせず `failed[]` として返すため、
 * 失敗理由から再送可否を判定する `classifyUploadFailure` へ渡す際に、
 * 207 相当の例外として組み立て直す（`survey-images.ts` と同一の規約）。
 */
const MULTI_STATUS = 207;

// ============================================================================
// アップロードウェーブ処理
// ============================================================================

/**
 * `uploadFilesInWaves` の集約結果
 *
 * 失敗分は失敗した画像の実体（`File`）を保持する。撮影済みの画像を未送信画像として
 * 画面に保持し、再圧縮せずそのまま再送できるようにするため、ファイル名の文字列へ
 * 縮退させない（Requirement 37.1 / 工事写真 20.1）。
 */
export interface UploadWavesResult {
  /** 追加に成功した写真項目（署名付きURL同梱） */
  successful: ConstructionPhotoWithUrls[];
  /** 失敗した画像（実体・失敗理由・再送可否） */
  failed: FailedUpload[];
}

/**
 * ファイルを最大 `concurrency` 並列でアップロードする（1ファイル=1リクエスト）。
 *
 * サーバは1リクエストで複数ファイルを受け付けるが、フロントでは同時実行数を制限して
 * サーバ負荷を抑える（R11.5）。ウェーブ単位で `concurrency` 件ずつ並列実行し、各リクエストの
 * 結果を集約する。リクエストが例外を投げても失敗として集約し、残りのウェーブ処理を
 * 継続する（部分失敗継続, R12.5）。
 *
 * 失敗は `FailedUpload` として返す。1リクエスト1ファイルで送信しているため、
 * リクエストの失敗も応答の `failed[]` も、送信した `file` を一意に指す。
 * 再送可否の区分は、送信例外（またはサーバーの失敗理由）が手元にあるこの時点で
 * 確定させる。呼び出し元へ渡るのが文言だけでは 413（サイズ上限超過）を再送不可と
 * 判定できず、再送可へ倒れてしまうためである（37.16, 37.21）。
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
): Promise<UploadWavesResult> {
  const concurrency = options.concurrency ?? MAX_UPLOAD_CONCURRENCY;
  const total = files.length;
  const successful: ConstructionPhotoWithUrls[] = [];
  const failed: FailedUpload[] = [];

  const queue = [...files];
  let completed = 0;

  const notify = () => {
    options.onProgress?.({ completed, total, current: Math.min(completed, total - 1) });
  };

  while (queue.length > 0) {
    const wave = queue.splice(0, concurrency);
    const waveResults = await Promise.all(
      wave.map(async (file): Promise<UploadWavesResult> => {
        try {
          const result = await uploadConstructionPhotos(albumId, [file]);
          return {
            successful: result.successful,
            // 応答の failed[] は 207（部分失敗）として扱い、失敗理由の文言から
            // 再送可否を判定する。ストレージ障害・画像処理失敗も同じ配列で返るため、
            // 一律に再送不可とすると撮影画像を破棄するしかなくなる（37.21）。
            failed: result.failed.map((item) =>
              toFailedUpload(file, new ApiError(MULTI_STATUS, item.error, result))
            ),
          };
        } catch (err) {
          return { successful: [], failed: [toFailedUpload(file, err)] };
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

/**
 * 親への通知呼び出しを保護し、通知の例外を送信の失敗へ昇格させない（20.5, 20.14）。
 *
 * `ImageUploader.submitFiles` の catch は「試行対象の全ファイル」を未送信画像として
 * 保持へ回す。そのため通知の例外が `handleUpload` の外へ伝播すると、サーバー登録済みの
 * 画像まで未送信画像として保持され、再送で同一画像が重複登録される（20.14）。
 *
 * 送信そのものは `uploadFilesInWaves` が各リクエストを個別に捕捉して `failed[]` へ
 * 集約するため例外を投げない。したがってアダプタ層で塞ぐべき例外経路は通知に限られる。
 *
 * 通知の失敗は無言で握り潰さず、原因を辿れるようコンソールへ記録する。ユーザーへの
 * 再提示は行わない（提示手段そのものが失敗しているため。失敗通知の文言・表示条件は
 * 変更しない）。
 */
function notifySafely(label: string, notify: () => void): void {
  try {
    notify();
  } catch (err) {
    console.error(`${label}に失敗しました`, err);
  }
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
  //
  // 失敗した画像は `UploadOutcome` として ImageUploader へ返し、未送信画像として
  // 保持させる（37.1）。再送可否は uploadFilesInWaves が送信例外を参照して確定済みの
  // ため、ここでは文言から再判定しない（37.16, 37.21）。
  const handleUpload = useCallback(
    async (files: File[]): Promise<UploadOutcome> => {
      if (files.length === 0) return { failed: [] };

      setIsUploading(true);
      setUploadProgress({ completed: 0, total: files.length, current: 0 });
      try {
        const { successful, failed } = await uploadFilesInWaves(albumId, files, {
          onProgress: setUploadProgress,
        });

        // 通知は個別に保護する。通知の失敗で `failed[]` を汚染すると、登録済みの画像まで
        // 未送信画像として保持され再送で重複登録される（20.5, 20.14）。
        if (successful.length > 0) {
          notifySafely('追加された写真項目の通知', () => onPhotosAdded(successful));
        }
        // 通知の文言は従来どおり失敗したファイル名の一覧で構成する（挙動保存）
        const notice = buildNotice(
          successful.length,
          failed.map((f) => f.file.name)
        );
        if (notice) {
          notifySafely('アップロード結果の通知', () => onNotify?.(notice));
        }

        return { failed };
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
