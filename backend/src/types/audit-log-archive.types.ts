/**
 * 監査ログアーカイブサービスのインターフェースと型定義
 *
 * 13ヶ月以上前の監査ログをアーカイブし、8年以上前のアーカイブを削除する機能を提供します。
 * - JSON Lines形式での圧縮
 * - AES-256-GCM暗号化
 * - S3/GCS統合（オプション）
 */

import { PrismaClient } from '@prisma/client';

/**
 * 監査ログアーカイブサービスインターフェース
 */
export interface IAuditLogArchiveService {
  /**
   * 13ヶ月以上前の監査ログをアーカイブする
   * @returns アーカイブ結果
   */
  archiveOldLogs(): Promise<ArchiveResult>;

  /**
   * 8年以上前のアーカイブを削除する
   * @returns 削除結果
   */
  deleteOldArchives(): Promise<DeleteArchiveResult>;
}

/**
 * アーカイブ結果
 */
export interface ArchiveResult {
  /** アーカイブされたログ件数 */
  archivedCount: number;
  /** アーカイブファイルパス（S3/GCSキーまたはローカルパス） */
  archiveFilePath: string;
  /** アーカイブサイズ（バイト） */
  archiveSize: number;
  /** 暗号化済みか */
  encrypted: boolean;
  /** 圧縮済みか */
  compressed: boolean;
}

/**
 * アーカイブ削除結果
 */
export interface DeleteArchiveResult {
  /** 削除されたアーカイブ件数 */
  deletedCount: number;
  /** 削除されたアーカイブファイルパス一覧 */
  deletedFilePaths: string[];
}

/**
 * アーカイブエラー種別
 */
export type ArchiveError =
  | 'DATABASE_ERROR'
  | 'STORAGE_ERROR'
  | 'ENCRYPTION_ERROR'
  | 'COMPRESSION_ERROR'
  | 'NO_LOGS_TO_ARCHIVE';

/**
 * 監査ログアーカイブサービス依存関係
 */
export interface AuditLogArchiveServiceDependencies {
  /** Prisma Client */
  prisma: PrismaClient;
}
