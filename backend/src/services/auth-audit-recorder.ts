/**
 * @fileoverview 認証の監査の記録（AuthService と SecondFactorVerifier で共有する。タスク74.1）
 *
 * 記録の失敗は認証の結果を変えず、エラーログと Sentry へ送る（design.md の AuthService の節）。
 * 送信元 IP は `getClientIp` で得た値を、ユーザーエージェントとともに `metadata` に書く。
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { RequestContext } from '../types/auth.types.js';
import type { AuditLogAction } from '../types/audit-log.types.js';
import {
  AUDIT_IP_ADDRESS_MAX_LENGTH,
  AUDIT_USER_AGENT_MAX_LENGTH,
  boundAuditText,
} from '../utils/audit-text.js';
import logger from '../utils/logger.js';
import { captureException } from '../utils/sentry.js';
import { observeSecurityAnomaly } from './security-anomaly-monitor.service.js';

/** 認証の監査の実行者（記録時に写す。要件40.7） */
export interface AuthAuditActor {
  id: string;
  email: string | null;
  displayName: string | null;
}

/** 認証の監査の一件 */
export interface AuthAuditEntry {
  action: AuditLogAction;
  /** 実行者。失敗・ロックは null（ログインの失敗は実行者を持たない。design.md の AuditLogService の節） */
  actor: AuthAuditActor | null;
  targetType: string;
  targetId: string;
  /** 結果・メールアドレス・理由など（送信元 IP とユーザーエージェントは要求の文脈から足す） */
  details: Record<string, string | boolean>;
}

/** 監査に書く利用者由来のメールアドレスの上限（RFC 5321 の経路の上限。タスク53.1 のレビュー） */
export const AUDIT_EMAIL_MAX_LENGTH = 254;

/** 認証の監査を記録する（要件40.1〜40.4） */
export async function recordAuthAuditEntry(
  prisma: PrismaClient,
  ctx: RequestContext,
  entry: AuthAuditEntry
): Promise<void> {
  // ログインの失敗（パスワードの段階と 2FA の段階）を異常の検知へ送る（要件43.1）
  if (entry.action === 'LOGIN_FAILED' || entry.action === 'TWO_FACTOR_FAILED') {
    observeSecurityAnomaly({
      signal: 'login_failed',
      sourceIp: ctx.ipAddress ?? null,
      userId: entry.targetType === 'User' ? entry.targetId : null,
    });
  }
  try {
    // 利用者が与える値（入力のメールアドレス・ユーザーエージェント）は上限までに切り詰め、切り詰めたことを残す
    const details: Record<string, string | boolean> = { ...entry.details };
    if (typeof details.email === 'string') {
      const email = boundAuditText(details.email, AUDIT_EMAIL_MAX_LENGTH);
      details.email = email.value;
      if (email.truncated) {
        details.emailTruncated = true;
      }
    }
    const targetId = boundAuditText(entry.targetId, AUDIT_EMAIL_MAX_LENGTH).value;
    const userAgent =
      ctx.userAgent === undefined
        ? undefined
        : boundAuditText(ctx.userAgent, AUDIT_USER_AGENT_MAX_LENGTH);
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actorId: entry.actor?.id ?? null,
        // 実行者の写しは読み込み済みの利用者から書く（要件40.7）
        actorEmail: entry.actor?.email ?? null,
        actorDisplayName: entry.actor?.displayName ?? null,
        targetType: entry.targetType,
        targetId,
        metadata: {
          ...details,
          ...(ctx.ipAddress !== undefined && {
            ipAddress: boundAuditText(ctx.ipAddress, AUDIT_IP_ADDRESS_MAX_LENGTH).value,
          }),
          ...(userAgent !== undefined && { userAgent: userAgent.value }),
          ...(userAgent?.truncated && { userAgentTruncated: true }),
        },
      },
    });
  } catch (error) {
    logger.error(
      { err: error, action: entry.action, targetType: entry.targetType },
      'Failed to record authentication audit log'
    );
    captureException(error instanceof Error ? error : new Error(String(error)), {
      action: entry.action,
      targetType: entry.targetType,
      ...(entry.targetType === 'User' && { userId: entry.targetId }),
    });
  }
}
