/**
 * @fileoverview 画像削除サービス
 *
 * 画像メタデータの削除、R2ストレージからのファイル削除、
 * 関連する注釈データの削除を担当します。
 *
 * Task 4.5: 画像削除機能
 * - データベースからのメタデータ削除
 * - R2からのファイル削除（原画像・サムネイル両方）
 * - 関連する注釈データの削除
 * - 削除失敗時の孤立ファイルログ記録
 *
 * Requirements:
 * - 4.7: ユーザーが画像を削除すると、画像と関連する注釈データを削除する
 *
 * @module services/image-delete
 */

import { DeleteObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { PrismaClient } from '../generated/prisma/client.js';
import logger from '../utils/logger.js';

/**
 * 画像が見つからないエラー
 *
 * 指定されたIDの画像がデータベースに存在しない場合にスローされます。
 */
export class ImageNotFoundError extends Error {
  readonly code = 'IMAGE_NOT_FOUND';
  readonly imageId: string;

  constructor(imageId: string) {
    super(`画像が見つかりません: ${imageId}`);
    this.name = 'ImageNotFoundError';
    this.imageId = imageId;
  }
}

/**
 * ストレージ削除失敗エラー
 *
 * R2ストレージからのファイル削除に失敗した場合にスローされます。
 * データベースからの削除は成功しているため、孤立ファイルが発生します。
 */
export class StorageDeletionFailedError extends Error {
  readonly code = 'STORAGE_DELETION_FAILED';
  readonly path: string;

  constructor(path: string, cause?: Error) {
    super(`ストレージからのファイル削除に失敗しました: ${path}`, { cause });
    this.name = 'StorageDeletionFailedError';
    this.path = path;
  }
}

/**
 * サービス依存関係
 */
export interface ImageDeleteServiceDependencies {
  prisma: PrismaClient;
  s3Client: S3Client;
  bucketName: string;
}

/**
 * 削除結果
 */
export interface DeleteResult {
  /** 削除された画像数 */
  deletedCount: number;
  /** 孤立ファイルのパス（R2削除に失敗したファイル） */
  orphanedFiles: string[];
}

/**
 * 画像削除サービス
 *
 * 画像メタデータとストレージファイルの削除を管理します。
 * データベースとR2ストレージの一貫性を保ちつつ、
 * 削除失敗時には孤立ファイルをログに記録します。
 */
export class ImageDeleteService {
  private readonly prisma: PrismaClient;
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(deps: ImageDeleteServiceDependencies) {
    this.prisma = deps.prisma;
    this.s3Client = deps.s3Client;
    this.bucketName = deps.bucketName;
  }

  /**
   * 画像を削除
   *
   * 以下の順序で削除を実行します：
   * 1. データベースから画像と関連する注釈データを削除（トランザクション）
   * 2. R2ストレージから原画像とサムネイルを削除
   *
   * R2削除が失敗してもデータベースの削除は保持され、
   * 孤立ファイルとしてログに記録されます。
   *
   * Requirements: 4.7
   *
   * @param imageId - 削除する画像のID
   * @throws {ImageNotFoundError} 画像が存在しない場合
   */
  async delete(imageId: string): Promise<void> {
    // 画像の存在確認と関連データの取得
    const image = await this.prisma.surveyImage.findUnique({
      where: { id: imageId },
      include: { annotation: true },
    });

    if (!image) {
      throw new ImageNotFoundError(imageId);
    }

    // データベースからの削除（トランザクション）
    await this.prisma.$transaction(async (tx) => {
      // 注釈データが存在する場合は先に削除
      if (image.annotation) {
        await tx.imageAnnotation.delete({
          where: { imageId },
        });
      }

      // 画像メタデータを削除
      await tx.surveyImage.delete({
        where: { id: imageId },
      });
    });

    // R2ストレージからファイルを削除
    await this.deleteFromStorage(image.originalPath);
    await this.deleteFromStorage(image.thumbnailPath);

    logger.info(
      {
        imageId,
        originalPath: image.originalPath,
        thumbnailPath: image.thumbnailPath,
      },
      '画像を削除しました'
    );
  }

  /**
   * 現場調査に紐付く全画像を削除
   *
   * 指定された現場調査IDに紐付く全ての画像を削除します。
   *
   * @param surveyId - 現場調査ID
   * @returns 削除結果
   */
  async deleteBySurveyId(surveyId: string): Promise<DeleteResult> {
    // 現場調査に紐付く全画像を取得
    const images = await this.prisma.surveyImage.findMany({
      where: { surveyId },
    });

    if (images.length === 0) {
      return { deletedCount: 0, orphanedFiles: [] };
    }

    const imageIds = images.map((img) => img.id);

    // データベースからの削除（トランザクション）
    await this.prisma.$transaction(async (tx) => {
      // 関連する注釈データを削除
      await tx.imageAnnotation.deleteMany({
        where: { imageId: { in: imageIds } },
      });

      // 画像メタデータを削除
      await tx.surveyImage.deleteMany({
        where: { surveyId },
      });
    });

    // R2ストレージからファイルを削除
    const orphanedFiles: string[] = [];

    for (const image of images) {
      // 原画像の削除
      const originalDeleted = await this.deleteFromStorage(image.originalPath);
      if (!originalDeleted) {
        orphanedFiles.push(image.originalPath);
      }

      // サムネイルの削除
      const thumbnailDeleted = await this.deleteFromStorage(image.thumbnailPath);
      if (!thumbnailDeleted) {
        orphanedFiles.push(image.thumbnailPath);
      }
    }

    logger.info(
      {
        surveyId,
        deletedCount: images.length,
        orphanedFilesCount: orphanedFiles.length,
      },
      '現場調査の画像を一括削除しました'
    );

    return {
      deletedCount: images.length,
      orphanedFiles,
    };
  }

  /**
   * R2ストレージからファイルを削除
   *
   * 削除に失敗した場合は孤立ファイルとしてログに記録し、
   * falseを返します（エラーはスローしません）。
   *
   * @param path - 削除するファイルのパス
   * @returns 削除成功ならtrue、失敗ならfalse
   */
  private async deleteFromStorage(path: string): Promise<boolean> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: path,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      // 孤立ファイルとしてログに記録
      logger.warn(
        {
          path,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        '孤立ファイル: R2からのファイル削除に失敗しました。手動での削除が必要です。'
      );
      return false;
    }
  }
}
