/**
 * 監査ログの月次のアーカイブと 8 年の消去（user-authentication 要件41.1、41.2、41.6）
 *
 * 定期処理の実行基盤（scheduled-job-runner.ts）から毎月 1 日 04:00（Asia/Tokyo）に呼ばれ、
 * AuditLogArchiveService.runMonthly を現在の時刻で実行する。月ごとの目録の有無で済みを判定するため、
 * 再実行しても同じ月を二重に書かない。
 *
 * 部品（保存先・メールキュー）は最初の実行のときに一度だけ作る。試験の実行環境では定期処理を
 * 登録しないため、メールキューの接続も作らない。暗号鍵は ARCHIVE_ENCRYPTION_KEY を読み、
 * 無ければアーカイブを失敗にして監査と通知を行う（乱数の鍵を作らない）。
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import { AuditLogArchiveService } from '../services/audit-log-archive.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { AdminNotificationService } from '../services/admin-notification.service.js';
import { EmailService } from '../services/email.service.js';
import { getStorageProvider } from '../storage/storage-factory.js';
import type { MonthlyArchiveRunResult } from '../types/audit-log-archive.types.js';

/** 定期処理のジョブ名（繰り返しジョブの識別子を兼ねる） */
export const AUDIT_LOG_ARCHIVE_JOB_NAME = 'audit-log-archive';

/** 毎月 1 日 04:00（Asia/Tokyo） */
export const AUDIT_LOG_ARCHIVE_CRON = '0 4 1 * *';

/**
 * 本番の部品で AuditLogArchiveService を作る
 *
 * @param prisma - データベースのクライアント
 */
export function createAuditLogArchiveServiceForJob(prisma: PrismaClient): AuditLogArchiveService {
  return new AuditLogArchiveService({
    prisma,
    storage: getStorageProvider(),
    encryptionKey: process.env.ARCHIVE_ENCRYPTION_KEY,
    auditLogService: new AuditLogService({ prisma }),
    adminNotificationService: new AdminNotificationService(prisma, new EmailService()),
  });
}

/**
 * 月次のアーカイブの処理を返す（部品は最初の実行のときに一度だけ作る）
 *
 * @param prisma - データベースのクライアント
 * @param createService - 部品の作成（既定は本番の組み立て）
 * @param clock - 現在の時刻
 */
export function createAuditLogArchiveRun(
  prisma: PrismaClient,
  createService: (
    prisma: PrismaClient
  ) => Pick<AuditLogArchiveService, 'runMonthly'> = createAuditLogArchiveServiceForJob,
  clock: () => Date = () => new Date()
): () => Promise<MonthlyArchiveRunResult> {
  let service: Pick<AuditLogArchiveService, 'runMonthly'> | null = null;
  return () => {
    service ??= createService(prisma);
    return service.runMonthly(clock());
  };
}
