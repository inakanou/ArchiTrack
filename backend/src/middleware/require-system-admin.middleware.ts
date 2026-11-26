/**
 * @fileoverview システム管理者ロールの確認（SystemAdminGuard。user-authentication タスク 77.1）
 *
 * ロール `admin` を持つ利用者だけを通す。権限では判定しない。要件が「システム管理者」を指しており、
 * カスタムのロールへ権限（`*:*` を含む）を与えても通さないためである（design.md の SystemAdminGuard）。
 *
 * ロールはアクセストークンの `roles` でなく DB の現在の割り当てで判定する。トークンの値は発行の時点の写しで、
 * ロールを外した後も期限まで残るためである。
 *
 * 拒否は既存の権限チェック（authorize.middleware.ts）と同じく、権限チェックの失敗として監査に残し
 * （要件21.7）、権限の拒否として異常の検知へ送る（要件43.2）。
 *
 * `authenticate` の後に置く。
 *
 * @requirement user-authentication/REQ-49.9
 *
 * @module middleware/require-system-admin
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import getPrismaClient from '../db.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { AuditLogService } from '../services/audit-log.service.js';
import {
  observeSecurityAnomaly,
  type AnomalyObservation,
} from '../services/security-anomaly-monitor.service.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import {
  AUDIT_IP_ADDRESS_MAX_LENGTH,
  AUDIT_USER_AGENT_MAX_LENGTH,
  boundAuditText,
} from '../utils/audit-text.js';
import logger from '../utils/logger.js';
import { getClientIp } from './client-ip.js';

/** システム管理者のロール名 */
const SYSTEM_ADMIN_ROLE_NAME = 'admin';
/** 拒否の監査に書く、求めた資格 */
const REQUIRED_ROLE = `role:${SYSTEM_ADMIN_ROLE_NAME}`;

export interface SystemAdminGuardDeps {
  /** 省略時は要求の時点で共有のクライアントを解決する */
  readonly prisma?: { readonly userRole: Pick<PrismaClient['userRole'], 'findFirst'> };
  /** 省略時は共有のクライアントで監査ログを書く */
  readonly auditLogService?: Pick<IAuditLogService, 'createLog'>;
  /** 省略時は共有の異常検知 */
  readonly observeAnomaly?: (observation: AnomalyObservation) => void;
}

/**
 * ロール `admin` を持つ利用者だけを通すミドルウェアを作る
 *
 * - 未認証は 401
 * - ロール `admin` が無ければ 403（対象の有無を見る前に返すので、存在を明かさない）
 * - ロールの読み取りの失敗はエラーハンドラーへ渡す（500、接続のタイムアウトは 503）
 *
 * @param deps - テストで差し替える依存
 * @returns Express のミドルウェア
 */
export function requireSystemAdmin(deps: SystemAdminGuardDeps = {}): RequestHandler {
  const observeAnomaly = deps.observeAnomaly ?? observeSecurityAnomaly;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
      return;
    }
    const { userId } = req.user;

    let isSystemAdmin: boolean;
    try {
      const prisma = deps.prisma ?? getPrismaClient();
      const assignment = await prisma.userRole.findFirst({
        where: { userId, role: { name: SYSTEM_ADMIN_ROLE_NAME } },
        select: { id: true },
      });
      isSystemAdmin = assignment !== null;
    } catch (error) {
      next(error);
      return;
    }

    if (isSystemAdmin) {
      next();
      return;
    }

    const ip = getClientIp(req);
    logger.warn({ userId }, 'System administrator check failed');
    observeAnomaly({ signal: 'permission_denied', sourceIp: ip, userId });
    try {
      const auditLogService =
        deps.auditLogService ?? new AuditLogService({ prisma: getPrismaClient() });
      await auditLogService.createLog({
        action: 'PERMISSION_CHECK_FAILED',
        actorId: userId,
        targetType: 'Role',
        targetId: SYSTEM_ADMIN_ROLE_NAME,
        metadata: {
          required: REQUIRED_ROLE,
          ip: boundAuditText(ip, AUDIT_IP_ADDRESS_MAX_LENGTH).value,
          userAgent: boundAuditText(req.get('user-agent') || 'unknown', AUDIT_USER_AGENT_MAX_LENGTH)
            .value,
        },
      });
    } catch (error) {
      // 監査の失敗で拒否を変えない（既存の権限チェックと同じ）
      logger.error({ err: error, userId }, 'Failed to record system administrator check failure');
    }

    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Insufficient permissions',
      code: 'SYSTEM_ADMIN_REQUIRED',
    });
  };
}
