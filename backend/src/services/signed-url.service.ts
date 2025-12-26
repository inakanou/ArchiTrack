/**
 * 署名付きURL生成・検証サービス
 *
 * ストレージの署名付きURL生成と、
 * ユーザーのプロジェクトアクセス権限検証を担当する。
 *
 * ローカルストレージの場合は公開URLを返し、
 * R2/S3の場合は署名付きURLを生成する。
 *
 * @module services/signed-url
 *
 * Requirements:
 * - 4.1: 画像ファイルの一時的なアクセスURL生成
 * - 12.4: 署名付きURLの有効期限とアクセス権限を検証
 * - 14.6: 全ての通信をHTTPS/TLSで暗号化
 */
import type { PrismaClient } from '../generated/prisma/client.js';
import { getStorageProvider, isStorageConfigured } from '../storage/index.js';
import logger from '../utils/logger.js';

/**
 * 署名付きURL生成の結果
 */
export interface SignedUrlResult {
  success: true;
  url: string;
  imageId: string;
}

/**
 * 署名付きURL生成失敗の結果
 */
export interface SignedUrlError {
  success: false;
  error: 'IMAGE_NOT_FOUND' | 'ACCESS_DENIED' | 'GENERATION_FAILED';
  imageId: string;
  message?: string;
}

/**
 * 署名付きURL検証・生成の結果
 */
export type SignedUrlWithValidationResult =
  | { success: true; url: string }
  | { success: false; error: 'IMAGE_NOT_FOUND' | 'ACCESS_DENIED' | 'GENERATION_FAILED' };

/**
 * バッチ署名付きURL生成の結果
 */
export type BatchSignedUrlResult = SignedUrlResult | SignedUrlError;

/**
 * SignedUrlService依存関係
 */
export interface SignedUrlServiceDependencies {
  prisma: PrismaClient;
}

/**
 * デフォルトの有効期限（秒）- 15分
 */
const DEFAULT_EXPIRES_IN = 900;

/**
 * 署名付きURL生成・検証サービス
 *
 * 画像ファイルへの一時的なアクセスURLを生成し、
 * ユーザーのプロジェクトアクセス権限を検証する。
 */
export class SignedUrlService {
  private readonly prisma: PrismaClient;

  constructor(deps: SignedUrlServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * 署名付きURLを生成する
   *
   * 画像IDから対応するストレージパスを取得し、
   * ストレージプロバイダーに応じたURLを生成する。
   *
   * - R2/S3: 有効期限付きの署名付きURL
   * - ローカル: 公開URL（署名なし）
   *
   * @param imageId - 画像ID
   * @param type - 画像タイプ（'original' | 'thumbnail'）
   * @param expiresIn - 有効期限（秒）、デフォルト15分（ローカルストレージでは無視）
   * @returns 署名付きURLまたは公開URL
   * @throws Error 画像が存在しない場合またはストレージが設定されていない場合
   *
   * @example
   * ```typescript
   * const url = await signedUrlService.generateSignedUrl('image-id', 'original');
   * // R2: 'https://bucket.r2.cloudflarestorage.com/path/image.jpg?X-Amz-Signature=...'
   * // Local: 'http://localhost:3100/storage/surveys/xxx/image.jpg'
   * ```
   */
  async generateSignedUrl(
    imageId: string,
    type: 'original' | 'thumbnail',
    expiresIn: number = DEFAULT_EXPIRES_IN
  ): Promise<string> {
    // ストレージプロバイダーを取得
    if (!isStorageConfigured()) {
      throw new Error('Storage is not configured');
    }

    const storageProvider = getStorageProvider();
    if (!storageProvider) {
      throw new Error('Storage provider not available');
    }

    // 画像情報を取得
    const image = await this.prisma.surveyImage.findUnique({
      where: { id: imageId },
      select: {
        id: true,
        surveyId: true,
        originalPath: true,
        thumbnailPath: true,
      },
    });

    if (!image) {
      throw new Error('Image not found');
    }

    // タイプに応じてパスを選択
    const objectKey = type === 'original' ? image.originalPath : image.thumbnailPath;

    // ストレージプロバイダーから署名付きURLを取得
    const signedUrl = await storageProvider.getSignedUrl(objectKey, { expiresIn });

    logger.debug(
      {
        imageId,
        type,
        expiresIn,
        objectKey,
        storageType: storageProvider.type,
      },
      'Generated signed URL for image'
    );

    return signedUrl;
  }

  /**
   * ユーザーが画像にアクセスする権限を持っているか検証する
   *
   * 以下の条件のいずれかを満たす場合にtrueを返す：
   * 1. 画像が紐付くプロジェクトの作成者である
   * 2. 画像が紐付くプロジェクトの営業担当者である
   * 3. 画像が紐付くプロジェクトの工事担当者である
   * 4. ユーザーがadminロールを持っている
   *
   * @param imageId - 画像ID
   * @param userId - ユーザーID
   * @returns アクセス権限があればtrue、なければfalse
   */
  async validateSignedUrlAccess(imageId: string, userId: string): Promise<boolean> {
    // 画像と関連する現場調査、プロジェクトを取得
    const image = await this.prisma.surveyImage.findUnique({
      where: { id: imageId },
      select: {
        id: true,
        surveyId: true,
        survey: {
          select: {
            id: true,
            projectId: true,
          },
        },
      },
    });

    if (!image || !image.survey) {
      return false;
    }

    // プロジェクト情報を取得
    const project = await this.prisma.project.findUnique({
      where: { id: image.survey.projectId },
      select: {
        id: true,
        deletedAt: true,
        createdById: true,
        salesPersonId: true,
        constructionPersonId: true,
      },
    });

    if (!project || project.deletedAt !== null) {
      return false;
    }

    // プロジェクトの関係者かチェック
    if (
      project.createdById === userId ||
      project.salesPersonId === userId ||
      project.constructionPersonId === userId
    ) {
      return true;
    }

    // adminロールを持っているかチェック
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            name: true,
          },
        },
      },
    });

    const isAdmin = userRoles.some((ur) => ur.role.name === 'admin');

    return isAdmin;
  }

  /**
   * アクセス権限を検証した上で署名付きURLを生成する
   *
   * まずユーザーのアクセス権限を検証し、
   * 権限がある場合のみ署名付きURLを生成する。
   *
   * @param imageId - 画像ID
   * @param userId - ユーザーID
   * @param type - 画像タイプ（'original' | 'thumbnail'）
   * @param expiresIn - 有効期限（秒）、デフォルト15分
   * @returns 署名付きURL生成結果
   */
  async getSignedUrlWithValidation(
    imageId: string,
    userId: string,
    type: 'original' | 'thumbnail',
    expiresIn: number = DEFAULT_EXPIRES_IN
  ): Promise<SignedUrlWithValidationResult> {
    // アクセス権限を検証
    const hasAccess = await this.validateSignedUrlAccess(imageId, userId);

    if (!hasAccess) {
      // 画像が存在しない場合とアクセス権限がない場合を区別
      const image = await this.prisma.surveyImage.findUnique({
        where: { id: imageId },
        select: { id: true },
      });

      if (!image) {
        return { success: false, error: 'IMAGE_NOT_FOUND' };
      }

      return { success: false, error: 'ACCESS_DENIED' };
    }

    try {
      const url = await this.generateSignedUrl(imageId, type, expiresIn);
      return { success: true, url };
    } catch (error) {
      logger.error({ error, imageId, userId, type }, 'Failed to generate signed URL');
      return { success: false, error: 'GENERATION_FAILED' };
    }
  }

  /**
   * 複数の画像に対して署名付きURLを一括生成する
   *
   * 各画像に対してアクセス権限を検証し、署名付きURLを生成する。
   * 一部の画像でエラーが発生しても、他の画像の処理は継続する。
   *
   * @param imageIds - 画像IDの配列
   * @param userId - ユーザーID
   * @param type - 画像タイプ（'original' | 'thumbnail'）
   * @param expiresIn - 有効期限（秒）、デフォルト15分
   * @returns バッチ署名付きURL生成結果の配列
   */
  async generateBatchSignedUrls(
    imageIds: string[],
    userId: string,
    type: 'original' | 'thumbnail',
    expiresIn: number = DEFAULT_EXPIRES_IN
  ): Promise<BatchSignedUrlResult[]> {
    const results: BatchSignedUrlResult[] = [];

    for (const imageId of imageIds) {
      const validationResult = await this.getSignedUrlWithValidation(
        imageId,
        userId,
        type,
        expiresIn
      );

      if (validationResult.success) {
        results.push({
          success: true,
          url: validationResult.url,
          imageId,
        });
      } else {
        results.push({
          success: false,
          error: validationResult.error,
          imageId,
        });
      }
    }

    return results;
  }
}
