/**
 * 監査ログの種別の表示名と実行者の表示
 *
 * 要件40.1: セキュリティ是正（IPA注意喚起 2026-10-09）で加えた監査の種別と、
 * 実行者の無い記録（自動無効化・アーカイブ・存在しないメールアドレスのログイン失敗）の表示
 */

import type { AuditLog, AuditLogAction } from '../types/audit-log.types';

/**
 * セキュリティ是正で加えた監査の種別（backend の SECURITY_REMEDIATION_AUDIT_ACTIONS と一致させる）
 * 並びは監査ログ画面の絞り込みの一覧の表示順
 */
export const SECURITY_REMEDIATION_AUDIT_ACTIONS = [
  'LOGIN_LOCKED',
  'TWO_FACTOR_VERIFIED',
  'TWO_FACTOR_FAILED',
  'LOGOUT_ALL',
  'REFRESH_TOKEN_REUSE_DETECTED',
  'INVITATION_RESENT',
  'INVITATION_ACCEPTED',
  'USER_DEACTIVATED',
  'USER_REACTIVATED',
  'USER_AUTO_DEACTIVATED',
  'TWO_FACTOR_RESET_BY_ADMIN',
  'TWO_FACTOR_REENROLLED',
  'PROJECT_SCOPE_DENIED',
  'DATA_EXPORTED',
  'OPERATIONAL_SETTING_CHANGED',
  'AUDIT_ARCHIVE_CREATED',
  'AUDIT_ARCHIVE_FAILED',
  'AUDIT_ARCHIVE_RESTORED',
] as const satisfies readonly AuditLogAction[];

export type SecurityRemediationAuditAction = (typeof SECURITY_REMEDIATION_AUDIT_ACTIONS)[number];

/** セキュリティ是正で加えた監査の種別の表示名 */
export const SECURITY_REMEDIATION_AUDIT_ACTION_LABELS: Record<
  SecurityRemediationAuditAction,
  string
> = {
  LOGIN_LOCKED: 'アカウントロック',
  TWO_FACTOR_VERIFIED: '2FA検証成功',
  TWO_FACTOR_FAILED: '2FA検証失敗',
  LOGOUT_ALL: '全デバイスからログアウト',
  REFRESH_TOKEN_REUSE_DETECTED: 'リフレッシュトークン再利用検知',
  INVITATION_RESENT: '招待再送信',
  INVITATION_ACCEPTED: '招待経由の登録',
  USER_DEACTIVATED: 'ユーザー無効化',
  USER_REACTIVATED: 'ユーザー再有効化',
  USER_AUTO_DEACTIVATED: 'ユーザー自動無効化',
  TWO_FACTOR_RESET_BY_ADMIN: '2FA再設定（管理者）',
  TWO_FACTOR_REENROLLED: '2FA再登録',
  PROJECT_SCOPE_DENIED: '案件範囲外のアクセス',
  DATA_EXPORTED: 'データ出力',
  OPERATIONAL_SETTING_CHANGED: '運用設定変更',
  AUDIT_ARCHIVE_CREATED: '監査ログのアーカイブ',
  AUDIT_ARCHIVE_FAILED: '監査ログのアーカイブ失敗',
  AUDIT_ARCHIVE_RESTORED: '監査ログの復元',
};

/** 実行者の無い記録の実行者の表示 */
export const SYSTEM_ACTOR_LABEL = 'システム';

/**
 * 監査ログの実行者の表示。実行者の無い記録（actorId が null）は「システム」とする
 */
export function getAuditLogActorLabel(log: Pick<AuditLog, 'actorId' | 'actorEmail'>): string {
  if (log.actorId === null) {
    return SYSTEM_ACTOR_LABEL;
  }
  return log.actorEmail || log.actorId;
}
