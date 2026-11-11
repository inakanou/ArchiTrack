/**
 * 論理削除したプロジェクトの完全削除の定期処理（project-management タスク81.4）
 *
 * Requirements (project-management):
 * - 46.5: 1 日 1 回の定期処理で、論理削除から 90 日を過ぎたプロジェクトを関連データ・ファイルと共に完全に削除する
 * - 46.11: 5 回続けて失敗して対象から外したプロジェクトを全システム管理者へ知らせる（タスク83.3。通知の部品を渡す）
 *
 * 定期処理の実行基盤（scheduled-job-runner.ts）から毎日 03:30（Asia/Tokyo）に呼ばれ、
 * ProjectPurgeService.purgeExpired を現在の時刻で実行する。失敗したプロジェクトがあっても処理は成功として
 * 結果を返し、次の回でやり直す（失敗は ProjectPurgeService が logger.error に残す）。
 *
 * 部品（ストレージ）は最初の実行のときに一度だけ作る。ストレージが設定されていないときは、ファイルを
 * 残したまま DB を消さないよう処理を失敗にし、次の実行で作り直す。
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import { AdminNotificationService } from '../services/admin-notification.service.js';
import { EmailService } from '../services/email.service.js';
import { ProjectPurgeService, type ProjectPurgeResult } from '../services/project-purge.service.js';
import { getStorageProvider } from '../storage/storage-factory.js';

/** 定期処理のジョブ名（繰り返しジョブの識別子を兼ねる） */
export const SOFT_DELETED_PROJECT_PURGE_JOB_NAME = 'soft-deleted-project-purge';

/** 毎日 03:30（Asia/Tokyo） */
export const SOFT_DELETED_PROJECT_PURGE_CRON = '30 3 * * *';

/**
 * 本番の部品で ProjectPurgeService を作る（既定では対象から外したことを知らせる部品を明示して渡す）
 *
 * @param prisma - データベースのクライアント
 * @param options.notify - 通知の部品を渡すか（既定は渡す。対象に戻す運用の手順は渡さない。タスク83.6）
 * @throws ストレージが設定されていないとき
 */
export function createProjectPurgeServiceForJob(
  prisma: PrismaClient,
  options: { notify?: boolean } = {}
): ProjectPurgeService {
  const storageProvider = getStorageProvider();
  if (!storageProvider) {
    throw new Error('Soft-deleted project purge requires a configured storage provider');
  }
  return new ProjectPurgeService({
    prisma,
    storageProvider,
    ...((options.notify ?? true)
      ? { adminNotificationService: new AdminNotificationService(prisma, new EmailService()) }
      : {}),
  });
}

/**
 * 完全削除の処理を返す（部品は最初の実行のときに一度だけ作る）
 *
 * @param prisma - データベースのクライアント
 * @param createService - 部品の作成（既定は本番の組み立て）
 * @param clock - 現在の時刻
 */
export function createSoftDeletedProjectPurgeRun(
  prisma: PrismaClient,
  createService: (
    prisma: PrismaClient
  ) => Pick<ProjectPurgeService, 'purgeExpired'> = createProjectPurgeServiceForJob,
  clock: () => Date = () => new Date()
): () => Promise<ProjectPurgeResult> {
  let service: Pick<ProjectPurgeService, 'purgeExpired'> | null = null;
  return async () => {
    service ??= createService(prisma);
    return service.purgeExpired(clock());
  };
}
