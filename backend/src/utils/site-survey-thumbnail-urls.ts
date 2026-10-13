/**
 * @fileoverview 現場調査サマリーのサムネイル系URLを署名付きURLへ変換する
 *
 * 個別API（`GET /api/projects/:projectId/site-surveys/latest`）と、プロジェクト詳細の
 * 一括取得API（`GET /api/projects/:id/detail-summary`）の双方が、直近の現場調査について
 * 同じ3つのURL（サムネイル・サムネイル元画像・合成済みサムネイル）を同じ規則で生成する。
 * 規則を一か所に置き、二つのAPIの応答の形が食い違わないようにする。
 *
 * Requirements (project-management):
 * - REQ-29.6: 一括取得APIのレスポンス形式を個別APIと互換にする
 * - REQ-30.1, REQ-30.2, REQ-30.4: detail-summary の署名付きURL変換と失敗時の null
 *
 * 合成済みサムネイルURLの供給は、個別APIが site-survey の要件 20.3・38.2・38.7 のために
 * 持っていた規則をそのまま移したものである。
 */

import type { StorageProvider } from '../storage/index.js';
import logger from './logger.js';

/**
 * 署名付きURLの生成に必要な、現場調査サマリーのストレージ上のパス
 */
export interface SiteSurveyThumbnailPaths {
  id: string;
  /** サムネイル画像のパス */
  thumbnailUrl: string | null;
  /** サムネイル元画像のパス（注釈レンダリング用） */
  thumbnailOriginalPath: string | null;
  /** 代表画像の合成済み（注釈付き）サムネイルのパス */
  annotatedThumbnailPath: string | null;
}

/**
 * 現場調査サマリーの応答に載せる3つのURL
 */
export interface SiteSurveyThumbnailUrls {
  thumbnailUrl: string | null;
  thumbnailOriginalUrl: string | null;
  annotatedThumbnailUrl: string | null;
}

/**
 * ストレージを使わない（未設定の）ときに載せる値。キーは省かず null とする。
 */
export const NULL_SITE_SURVEY_THUMBNAIL_URLS: SiteSurveyThumbnailUrls = {
  thumbnailUrl: null,
  thumbnailOriginalUrl: null,
  annotatedThumbnailUrl: null,
};

/**
 * 現場調査サマリー1件の3つのパスを署名付きURLへ変換する。
 *
 * パスが無いものは null、署名に失敗したものは警告を残して null とする。
 * 一つの失敗は他のURLの生成を妨げない。
 *
 * @param survey 変換元の現場調査サマリー
 * @param storageProvider 署名付きURLを発行するストレージ
 * @returns 3つのURL
 */
export async function signSiteSurveyThumbnailUrls(
  survey: SiteSurveyThumbnailPaths,
  storageProvider: StorageProvider
): Promise<SiteSurveyThumbnailUrls> {
  let thumbnailUrl: string | null = null;
  let thumbnailOriginalUrl: string | null = null;
  let annotatedThumbnailUrl: string | null = null;

  // サムネイルURLを生成
  if (survey.thumbnailUrl) {
    try {
      thumbnailUrl = await storageProvider.getSignedUrl(survey.thumbnailUrl);
    } catch (error) {
      logger.warn(
        { surveyId: survey.id, thumbnailPath: survey.thumbnailUrl, error },
        'Failed to generate signed URL for thumbnail'
      );
    }
  }

  // 元画像URLを生成（注釈レンダリング用）
  if (survey.thumbnailOriginalPath) {
    try {
      thumbnailOriginalUrl = await storageProvider.getSignedUrl(survey.thumbnailOriginalPath);
    } catch (error) {
      logger.warn(
        { surveyId: survey.id, originalPath: survey.thumbnailOriginalPath, error },
        'Failed to generate signed URL for original image'
      );
    }
  }

  // 合成済みサムネイルURLを生成（Requirements: 20.3, 38.2, 38.7）
  // 供給しないと表示側は常にクライアント側の合成へ落ち、注釈取得が写真数に比例する
  if (survey.annotatedThumbnailPath) {
    try {
      annotatedThumbnailUrl = await storageProvider.getSignedUrl(survey.annotatedThumbnailPath);
    } catch (error) {
      logger.warn(
        {
          surveyId: survey.id,
          annotatedThumbnailPath: survey.annotatedThumbnailPath,
          error,
        },
        'Failed to generate signed URL for annotated thumbnail'
      );
    }
  }

  return { thumbnailUrl, thumbnailOriginalUrl, annotatedThumbnailUrl };
}
