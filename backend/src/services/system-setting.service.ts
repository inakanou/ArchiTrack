/**
 * @fileoverview システムの設定のサービス
 *
 * estimate-request の design の章「Requirements 43-50」の D8。外部の AI での読み取りの設定
 * （`SystemSetting` の key = externalAiReading、value = { enabled }）を読み書きする。
 *
 * - 行が無いときは有効・版 0 として読む（既存の環境の振る舞いを変えない）
 * - 変更は楽観的排他（送られた版が今の版と同じときだけ変える）で行い、同じトランザクションで
 *   監査ログ（OPERATIONAL_SETTING_CHANGED、before・after）を記録する。記録が失敗すれば変更も残らない
 * - キャッシュは持たない（複数のインスタンスで停止がすぐ効くように、読むたびに 1 行を読む）
 */

import { Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import { SystemSettingConflictError } from '../errors/systemSettingError.js';

/** 外部の AI での読み取りの設定のキー（監査の対象の ID にも使う） */
export const EXTERNAL_AI_READING_SETTING_KEY = 'externalAiReading';

/** 監査ログの対象の種類 */
export const SYSTEM_SETTING_TARGET_TYPE = 'SystemSetting';

/** 外部の AI での読み取りの設定 */
export interface ExternalAiReadingSetting {
  enabled: boolean;
  version: number;
}

export interface SystemSettingServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
}

interface SettingRowLike {
  value: Prisma.JsonValue;
  version: number;
}

/**
 * 行の値から有効・無効を読む
 *
 * 行が無いときは有効（既存の環境の振る舞いを変えない）。行があるのに `enabled` が真偽でない（壊れた値）ときは
 * 止めた側に倒して無効として読む。本設定は外部への送信を止める安全側の切り替えであり、壊れた値で
 * 送信が再開してはならないためである。
 */
function toExternalAiReading(row: SettingRowLike | null): ExternalAiReadingSetting {
  if (!row) {
    return { enabled: true, version: 0 };
  }
  const value = row.value;
  const enabled =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Prisma.JsonObject).enabled
      : undefined;
  return { enabled: enabled === true, version: row.version };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export class SystemSettingService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: IAuditLogService;

  constructor(deps: SystemSettingServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
  }

  /**
   * 外部の AI での読み取りの設定を読む
   * @returns 有効・無効と版（行が無いときは有効・版 0）
   */
  async getExternalAiReading(): Promise<ExternalAiReadingSetting> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: EXTERNAL_AI_READING_SETTING_KEY },
    });
    return toExternalAiReading(row);
  }

  /**
   * 外部の AI での読み取りを止める・戻す
   * @param enabled - 変更後の有効・無効
   * @param expectedVersion - 画面で読んだ版（行が無いときは 0）
   * @param actorId - 操作した利用者の ID
   * @returns 変更後の設定
   * @throws SystemSettingConflictError 版が今の版と違うとき（409）
   */
  async setExternalAiReading(
    enabled: boolean,
    expectedVersion: number,
    actorId: string
  ): Promise<ExternalAiReadingSetting> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.systemSetting.findUnique({
          where: { key: EXTERNAL_AI_READING_SETTING_KEY },
        });
        const before = toExternalAiReading(current);
        if (before.version !== expectedVersion) {
          throw new SystemSettingConflictError({
            expectedVersion,
            actualVersion: before.version,
          });
        }

        let saved: SettingRowLike;
        if (!current) {
          saved = await tx.systemSetting.create({
            data: {
              key: EXTERNAL_AI_READING_SETTING_KEY,
              value: { enabled },
              version: 1,
              updatedById: actorId,
            },
          });
        } else {
          // 読んだ後に他の変更が版を進めていれば 0 件になる
          const result = await tx.systemSetting.updateMany({
            where: { key: EXTERNAL_AI_READING_SETTING_KEY, version: expectedVersion },
            data: {
              value: { enabled },
              version: { increment: 1 },
              updatedById: actorId,
            },
          });
          if (result.count === 0) {
            throw new SystemSettingConflictError({ expectedVersion });
          }
          saved = await tx.systemSetting.findUniqueOrThrow({
            where: { key: EXTERNAL_AI_READING_SETTING_KEY },
          });
        }
        const after = toExternalAiReading(saved);

        await this.auditLogService.createLog(
          {
            action: 'OPERATIONAL_SETTING_CHANGED',
            actorId,
            targetType: SYSTEM_SETTING_TARGET_TYPE,
            targetId: EXTERNAL_AI_READING_SETTING_KEY,
            before: { enabled: before.enabled },
            after: { enabled: after.enabled },
            metadata: { setting: EXTERNAL_AI_READING_SETTING_KEY },
          },
          tx
        );

        return after;
      });
    } catch (error) {
      // 行の無い状態から同時に作ろうとして一意制約にぶつかったときも競合として返す
      if (isUniqueConstraintError(error)) {
        throw new SystemSettingConflictError({ expectedVersion });
      }
      throw error;
    }
  }
}
