/**
 * 90 日の自動無効化（タスク49.4）
 *
 * Requirements (user-authentication):
 * - REQ-36.8: 最終ログイン・作成・最後の再有効化のうち最も新しい日時から 90 日を過ぎた有効な利用者を自動で無効化する
 * - REQ-36.9: 自動無効化を全システム管理者へ通知し、監査に自動無効化であることを記録する
 *
 * 定期処理の実行基盤（scheduled-job-runner.ts）から毎日 03:00（Asia/Tokyo）に呼ばれ、
 * AccountStatusService.deactivateInactiveUsers を現在の時刻で実行する。処理は対象の条件で再判定するため
 * 冪等であり、失敗で漏れた対象者は翌日の実行で拾う。
 *
 * 処理の部品（状態のキャッシュ・メールキュー）は最初の実行のときに一度だけ作る。試験の実行環境では
 * 定期処理を登録しないため、メールキューの接続も作らない。
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import { AccountStatusService } from '../services/account-status.service.js';
import { AdminNotificationService } from '../services/admin-notification.service.js';
import { EmailService } from '../services/email.service.js';
import { getSharedAuthenticatedUserStateService } from '../services/authenticated-user-state.service.js';

/** 定期処理のジョブ名（繰り返しジョブの識別子を兼ねる） */
export const INACTIVE_USER_DEACTIVATION_JOB_NAME = 'inactive-user-deactivation';

/** 毎日 03:00（Asia/Tokyo） */
export const INACTIVE_USER_DEACTIVATION_CRON = '0 3 * * *';

/**
 * 本番の部品で AccountStatusService を作る（管理者の操作の経路と同じ組み立て）
 *
 * @param prisma - データベースのクライアント
 */
export function createAccountStatusServiceForJob(prisma: PrismaClient): AccountStatusService {
  return new AccountStatusService({
    prisma,
    userStateService: {
      invalidate: (userId) => getSharedAuthenticatedUserStateService().invalidate(userId),
    },
    adminNotificationService: new AdminNotificationService(prisma, new EmailService()),
  });
}

/**
 * 自動無効化の処理を返す（部品は最初の実行のときに一度だけ作る）
 *
 * @param prisma - データベースのクライアント
 * @param createService - 部品の作成（既定は本番の組み立て）
 * @param clock - 現在の時刻
 */
export function createInactiveUserDeactivationRun(
  prisma: PrismaClient,
  createService: (
    prisma: PrismaClient
  ) => Pick<AccountStatusService, 'deactivateInactiveUsers'> = createAccountStatusServiceForJob,
  clock: () => Date = () => new Date()
): () => Promise<{ deactivatedUserIds: string[] }> {
  let service: Pick<AccountStatusService, 'deactivateInactiveUsers'> | null = null;
  return () => {
    service ??= createService(prisma);
    return service.deactivateInactiveUsers(clock());
  };
}
