/**
 * 監査ログのアーカイブの型（user-authentication 要件41、design.md の AuditLogArchiveService の節）
 *
 * 13 か月以上前の月ごとの監査ログを gzip と AES-256-GCM で保存先（StorageProvider）へ移し、
 * 8 年を過ぎたアーカイブを目録の期間で消す。
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { StorageProvider } from '../storage/storage-provider.interface.js';
import type { IAdminNotificationService } from '../services/admin-notification.service.js';
import type { IAuditLogService } from './audit-log.types.js';
import type { Result } from './result.js';

/**
 * アーカイブの目録（`audit-archives/YYYY/MM.manifest.json`）
 */
export interface ArchiveManifest {
  /** 対象の月（UTC の月初から月末。ISO 8601） */
  period: { from: string; to: string };
  /** アーカイブに含む行の数 */
  recordCount: number;
  /** 圧縮前の JSON Lines の SHA-256（16 進） */
  plaintextSha256: string;
  /** 目録の内容への HMAC-SHA256（鍵は ARCHIVE_ENCRYPTION_KEY から導出。16 進） */
  hmacSha256: string;
  /** 目録の作成日時（ISO 8601） */
  createdAt: string;
  /** 暗号鍵の識別子（鍵から導出した値で、鍵そのものを表さない） */
  keyId: string;
}

/**
 * アーカイブの失敗
 */
export type ArchiveError =
  | { type: 'KEY_MISSING' }
  | { type: 'STORAGE_FAILED'; cause: string }
  | { type: 'INTEGRITY_FAILED'; month: string };

/**
 * 月次の実行で処理できなかった月（想定外の例外は UNEXPECTED とする）
 */
export interface FailedArchiveMonth {
  month: string;
  error: ArchiveError | { type: 'UNEXPECTED'; cause: string };
}

/**
 * 月次の実行の結果
 */
export interface MonthlyArchiveRunResult {
  /** アーカイブして行を消した月（YYYY-MM） */
  archivedMonths: string[];
  /** 失敗した月（行は残っている） */
  failedMonths: FailedArchiveMonth[];
  /** 8 年を過ぎて消したアーカイブの月（YYYY-MM） */
  deletedArchives: string[];
}

/**
 * 監査ログのアーカイブ
 */
export interface IAuditLogArchiveService {
  /**
   * 指定の月（YYYY-MM、UTC）の監査ログをアーカイブし、照合の後に行を消す
   */
  archiveMonth(month: string): Promise<Result<ArchiveManifest, ArchiveError>>;

  /**
   * 目録の期間の終わりから years 年を過ぎたアーカイブを消す
   */
  deleteArchivesOlderThan(years: number, now: Date): Promise<{ deleted: string[] }>;

  /**
   * 月次の処理: 13 か月以上前の月をアーカイブし、8 年を過ぎたアーカイブを消す
   */
  runMonthly(now: Date): Promise<MonthlyArchiveRunResult>;
}

/**
 * 監査ログのアーカイブの依存
 */
export interface AuditLogArchiveServiceDependencies {
  prisma: PrismaClient;
  /** 保存先（未設定は null。アーカイブは STORAGE_FAILED になる） */
  storage: StorageProvider | null;
  /** 暗号鍵（64 桁の 16 進。未設定・形式違いはアーカイブを KEY_MISSING にする） */
  encryptionKey: string | undefined;
  auditLogService: Pick<IAuditLogService, 'createLog'>;
  adminNotificationService: IAdminNotificationService;
  /** 現在の時刻（既定は new Date()） */
  clock?: () => Date;
  /**
   * 8 年の消去で目録を探す最も古い月（YYYY-MM。既定は ARCHIVE_EARLIEST_MONTH）
   */
  earliestArchiveMonth?: string;
}
