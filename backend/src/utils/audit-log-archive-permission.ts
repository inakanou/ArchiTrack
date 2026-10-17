/**
 * 監査ログの行の消去を、アーカイブの許可の設定を置いたトランザクションの中で行う。
 *
 * `audit_logs` のトリガー `audit_logs_immutable` は UPDATE を常に拒否し、DELETE は
 * セッション変数 `architrack.audit_archive` が `'on'` のときだけ許す（要件40.8）。
 * 許可の設定はトランザクションに閉じる（`set_config(..., true)`）ため、取引の外へ漏れない。
 *
 * 行を消してよいのはアーカイブによる移動（要件41.1）と、試験の後始末だけである。
 * 試験の後始末で表の全体を消すときは TRUNCATE を使ってもよい（行のトリガーを発火しない）。
 *
 * @module utils/audit-log-archive-permission
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';

/** 監査ログの消去を許すセッション変数の名前（design.md「監査」の AuditLogService の節） */
export const AUDIT_ARCHIVE_SETTING = 'architrack.audit_archive' as const;

/**
 * アーカイブの許可の設定を置いたトランザクションの中で、条件に合う監査ログを消す。
 * @param prisma - Prisma クライアント
 * @param where - 消す行の条件
 * @returns 消した行の数
 */
export async function deleteAuditLogsWithArchivePermission(
  prisma: PrismaClient,
  where: Prisma.AuditLogWhereInput
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config(${AUDIT_ARCHIVE_SETTING}, 'on', true)`;
    const { count } = await tx.auditLog.deleteMany({ where });
    return count;
  });
}
