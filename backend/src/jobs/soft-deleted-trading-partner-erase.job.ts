/**
 * 論理削除した取引先の個人情報の消去の定期処理（trading-partner-management タスク34.2）
 *
 * Requirements (trading-partner-management):
 * - 5.6: 1 日 1 回の定期処理で、論理削除から 90 日を過ぎた取引先の個人情報を空にする
 *
 * 定期処理の実行基盤（scheduled-job-runner.ts）から毎日 03:45（Asia/Tokyo。プロジェクトの完全削除の
 * 15 分後）に呼ばれ、TradingPartnerPersonalDataEraseService.eraseExpired を現在の時刻で実行する。
 * 1 件の失敗では止まらず、件数を返して次の回でやり直す。
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import {
  TradingPartnerPersonalDataEraseService,
  type TradingPartnerPersonalDataEraseResult,
} from '../services/trading-partner-personal-data-erase.service.js';

/** 定期処理のジョブ名（繰り返しジョブの識別子を兼ねる） */
export const SOFT_DELETED_TRADING_PARTNER_ERASE_JOB_NAME = 'soft-deleted-trading-partner-erase';

/** 毎日 03:45（Asia/Tokyo） */
export const SOFT_DELETED_TRADING_PARTNER_ERASE_CRON = '45 3 * * *';

/**
 * 消去の処理を返す（部品は最初の実行のときに一度だけ作る）
 *
 * @param prisma - データベースのクライアント
 * @param createService - 部品の作成（既定は本番の組み立て）
 * @param clock - 現在の時刻
 */
export function createSoftDeletedTradingPartnerEraseRun(
  prisma: PrismaClient,
  createService: (
    prisma: PrismaClient
  ) => Pick<TradingPartnerPersonalDataEraseService, 'eraseExpired'> = (client) =>
    new TradingPartnerPersonalDataEraseService({ prisma: client }),
  clock: () => Date = () => new Date()
): () => Promise<TradingPartnerPersonalDataEraseResult> {
  let service: Pick<TradingPartnerPersonalDataEraseService, 'eraseExpired'> | null = null;
  return async () => {
    service ??= createService(prisma);
    return service.eraseExpired(clock());
  };
}
