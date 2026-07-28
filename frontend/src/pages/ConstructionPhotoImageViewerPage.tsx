/**
 * @fileoverview 工事写真 画像ビューアページ
 *
 * Task 11.2: 閲覧専用画像ビューア＋ビューアページ＋ルート
 *
 * ルート `/construction-photos/:albumId/photos/:photoId` に対応するページ。
 * アルバム・写真項目一覧を取得して表示名（ファイル名）を解決したうえで、非合成原本
 * （`getConstructionPhotoOriginalImage`, task 10.2）を必要時にのみ取得し（R14.6）、
 * `ConstructionPhotoImageViewer` へ object URL として渡す。閉じる操作で
 * 詳細画面（`/construction-photos/:albumId`）へ戻る（R14.5）。
 *
 * Requirements: 14.1, 14.5, 14.6
 * @see design.md - 「画像ビューア（閲覧専用）」System Flow
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getConstructionPhotoAlbum } from '../api/construction-photos';
import {
  getConstructionPhotos,
  getConstructionPhotoOriginalImage,
} from '../api/construction-photo-images';
import { ApiError } from '../api/client';
import { ResourceNotFound } from '../components/common';
import ConstructionPhotoImageViewer from '../components/construction-photos/ConstructionPhotoImageViewer';
import type {
  ConstructionPhotoAlbum,
  ConstructionPhotoWithUrls,
} from '../types/construction-photo.types';

/**
 * 工事写真 画像ビューアページ。
 *
 * データ取得の責務（アルバム/写真項目メタ・原本Blobのobject URL化とライフサイクル管理）を
 * 担い、ズーム/回転/パン等の表示ロジックは `ConstructionPhotoImageViewer` に委譲する。
 */
export default function ConstructionPhotoImageViewerPage() {
  const { albumId, photoId } = useParams<{ albumId: string; photoId: string }>();
  const navigate = useNavigate();

  const [album, setAlbum] = useState<ConstructionPhotoAlbum | null>(null);
  const [photo, setPhoto] = useState<ConstructionPhotoWithUrls | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [isMetaLoading, setIsMetaLoading] = useState(true);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [imageError, setImageError] = useState<string | null>(null);

  // 生成した object URL を保持し、差し替え/アンマウント時に確実に revoke する。
  const objectUrlRef = useRef<string | null>(null);

  const revokeCurrentObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  /**
   * アルバム・写真項目一覧を取得し、対象写真項目（表示名解決用）を確定する。
   */
  const fetchMeta = useCallback(async () => {
    if (!albumId || !photoId) return;

    setIsMetaLoading(true);
    setIsNotFound(false);

    try {
      const [albumData, photos] = await Promise.all([
        getConstructionPhotoAlbum(albumId),
        getConstructionPhotos(albumId),
      ]);
      setAlbum(albumData);

      const foundPhoto = photos.find((p) => p.id === photoId);
      if (!foundPhoto) {
        setIsNotFound(true);
        return;
      }
      setPhoto(foundPhoto);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) {
        setIsNotFound(true);
        return;
      }
      setIsNotFound(true);
    } finally {
      setIsMetaLoading(false);
    }
  }, [albumId, photoId]);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  /**
   * 非合成原本を必要時にのみ取得する（R14.6）。
   * 対象写真項目が確定した後にのみ取得を開始し、取得結果を object URL 化して保持する。
   */
  const fetchOriginalImage = useCallback(async () => {
    if (!photoId || !photo) return;

    setIsImageLoading(true);
    setImageError(null);

    try {
      const blob = await getConstructionPhotoOriginalImage(photoId);
      const url = URL.createObjectURL(blob);
      revokeCurrentObjectUrl();
      objectUrlRef.current = url;
      setImageUrl(url);
    } catch (err) {
      if (err instanceof ApiError) {
        setImageError(err.message || '原本画像の取得に失敗しました');
      } else {
        setImageError('原本画像の取得に失敗しました');
      }
    } finally {
      setIsImageLoading(false);
    }
  }, [photoId, photo, revokeCurrentObjectUrl]);

  useEffect(() => {
    if (photo) {
      fetchOriginalImage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- photo確定時にのみ起動する（fetchOriginalImage自体は依存として不要）
  }, [photo]);

  // アンマウント時に object URL を解放する。
  useEffect(() => {
    return () => {
      revokeCurrentObjectUrl();
    };
  }, [revokeCurrentObjectUrl]);

  /**
   * 閉じる操作: 詳細画面（アルバム）へ戻る（R14.5）。
   */
  const handleClose = useCallback(() => {
    if (albumId) {
      navigate(`/construction-photos/${albumId}`);
    }
  }, [albumId, navigate]);

  if (isNotFound) {
    return (
      <ResourceNotFound
        resourceType="写真"
        returnPath={albumId ? `/construction-photos/${albumId}` : '/projects'}
        returnLabel="前の画面に戻る"
      />
    );
  }

  if (isMetaLoading || !album || !photo) {
    return null;
  }

  return (
    <ConstructionPhotoImageViewer
      imageUrl={imageUrl}
      imageName={photo.fileName}
      isLoading={isImageLoading}
      error={imageError}
      onClose={handleClose}
    />
  );
}
