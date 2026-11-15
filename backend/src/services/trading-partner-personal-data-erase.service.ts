/**
 * 論理削除した取引先の個人情報の消去（trading-partner-management タスク34.2）
 *
 * Requirements (trading-partner-management):
 * - 5.6: 論理削除から 90 日を過ぎた取引先の代表者名・電話番号・FAX番号・メールアドレス・備考を空にし、
 *   住所を空の文字列にする（取引先名・フリガナ・部課/支店/支社名・取引先種別・請求締日・支払日は残す）
 * - 5.7: 空にしたことを取引先の ID・論理削除の日時・空にした日時だけで監査ログに記録する
 *
 * 行は消さない。取引先は見積依頼・受領見積書・発注・契約書などから参照され、行を消すと宛先が分からなくなる
 * （設計の D1）。1 回最大 100 件を論理削除の古い順に、1 件ずつトランザクションの中で処理する（D3）。
 */

import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import { TRADING_PARTNER_TARGET_TYPE } from '../types/audit-log.types.js';
import logger from '../utils/logger.js';
import { AuditLogService } from './audit-log.service.js';

/** 論理削除から個人情報を空にするまでの日数（DB のバックアップの最長の保持 89 日を超える） */
export const TRADING_PARTNER_PERSONAL_DATA_RETENTION_DAYS = 90;

/** 1 回の処理で空にする取引先の最大の件数 */
export const TRADING_PARTNER_PERSONAL_DATA_ERASE_BATCH_SIZE = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 空にした後の個人情報の欄（住所の列は必須のため空の文字列にする） */
const ERASED_PERSONAL_DATA = {
  representativeName: null,
  address: '',
  phoneNumber: null,
  faxNumber: null,
  email: null,
  notes: null,
} satisfies Prisma.TradingPartnerUpdateManyMutationInput;

/** 1 回の処理の結果（件数だけ） */
export interface TradingPartnerPersonalDataEraseResult {
  /** 個人情報を空にした件数 */
  erasedCount: number;
  /** 失敗した件数（次の回でやり直す） */
  failedCount: number;
  /** 処理の後もまだ残る対象の件数 */
  remainingCount: number;
}

/** 部品の依存 */
export interface TradingPartnerPersonalDataEraseServiceDependencies {
  prisma: PrismaClient;
  auditLogService?: Pick<IAuditLogService, 'createLog'>;
}

/**
 * 個人情報を空にする対象の条件（論理削除から 90 日を過ぎ、個人情報の欄のどれかが残る）
 *
 * @param cutoff - 論理削除の日時がこれ以前のものを対象にする
 */
function expiredWithPersonalData(cutoff: Date): Prisma.TradingPartnerWhereInput {
  return {
    deletedAt: { not: null, lte: cutoff },
    OR: [
      { representativeName: { not: null } },
      { address: { not: '' } },
      { phoneNumber: { not: null } },
      { faxNumber: { not: null } },
      { email: { not: null } },
      { notes: { not: null } },
    ],
  };
}

/**
 * 論理削除した取引先の個人情報を空にする部品
 */
export class TradingPartnerPersonalDataEraseService {
  private readonly auditLogService: Pick<IAuditLogService, 'createLog'>;

  constructor(private readonly deps: TradingPartnerPersonalDataEraseServiceDependencies) {
    this.auditLogService = deps.auditLogService ?? new AuditLogService({ prisma: deps.prisma });
  }

  /**
   * 論理削除から 90 日を過ぎた取引先の個人情報を、古い順に最大 100 件空にして記録する
   *
   * @param now - 現在の時刻
   * @returns 空にした件数・失敗した件数・まだ残る対象の件数
   */
  async eraseExpired(now: Date): Promise<TradingPartnerPersonalDataEraseResult> {
    const cutoff = new Date(now.getTime() - TRADING_PARTNER_PERSONAL_DATA_RETENTION_DAYS * DAY_MS);
    const where = expiredWithPersonalData(cutoff);
    const targets = await this.deps.prisma.tradingPartner.findMany({
      where,
      orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
      take: TRADING_PARTNER_PERSONAL_DATA_ERASE_BATCH_SIZE,
      select: { id: true, deletedAt: true },
    });

    let erasedCount = 0;
    let failedCount = 0;
    for (const target of targets) {
      try {
        const erased = await this.deps.prisma.$transaction(async (tx) => {
          // 選んだ後に状態が変わったもの（論理削除の取り消しなど）は更新しない
          const { count } = await tx.tradingPartner.updateMany({
            where: { id: target.id, deletedAt: { not: null, lte: cutoff } },
            data: ERASED_PERSONAL_DATA,
          });
          if (count === 0) {
            return false;
          }
          // ID と日時だけを記録する。空にした値は記録しない（要件5.7）
          await this.auditLogService.createLog(
            {
              action: 'TRADING_PARTNER_PERSONAL_DATA_ERASED',
              actorId: null,
              targetType: TRADING_PARTNER_TARGET_TYPE,
              targetId: target.id,
              metadata: {
                deletedAt: target.deletedAt?.toISOString() ?? null,
                erasedAt: now.toISOString(),
              },
            },
            tx
          );
          return true;
        });
        if (erased) {
          erasedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        // 取引先の ID とエラーの種類だけを残す（値やエラーの文言に個人情報が入りうるため）
        logger.error(
          {
            tradingPartnerId: target.id,
            errorName: error instanceof Error ? error.name : typeof error,
          },
          'Failed to erase personal data of soft-deleted trading partner'
        );
      }
    }

    const remainingCount = await this.deps.prisma.tradingPartner.count({ where });
    return { erasedCount, failedCount, remainingCount };
  }
}
