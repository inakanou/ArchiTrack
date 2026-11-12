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

/**
 * 招待の作成・取り消しの種別（要件40.5）
 *
 * backend では従来からある種別で、SECURITY_REMEDIATION_AUDIT_ACTIONS には含まれない。記録はタスク50.1 で
 * 始め、監査ログ画面の表示名と絞り込みはタスク50.4 で加えた。並びは監査ログ画面の絞り込みの一覧の表示順
 */
export const INVITATION_AUDIT_ACTIONS = [
  'INVITATION_CREATED',
  'INVITATION_REVOKED',
] as const satisfies readonly AuditLogAction[];

export type InvitationAuditAction = (typeof INVITATION_AUDIT_ACTIONS)[number];

/** 招待の作成・取り消しの種別の表示名 */
export const INVITATION_AUDIT_ACTION_LABELS: Record<InvitationAuditAction, string> = {
  INVITATION_CREATED: '招待作成',
  INVITATION_REVOKED: '招待取り消し',
};

/**
 * ユーザーの削除の種別（要件40.6）
 *
 * backend では従来からある種別で、SECURITY_REMEDIATION_AUDIT_ACTIONS には含まれない。記録はタスク53.2 で
 * 始め、監査ログ画面の表示名と絞り込みはタスク53.5 で加えた。並びは監査ログ画面の絞り込みの一覧の表示順
 */
export const USER_DELETION_AUDIT_ACTIONS = [
  'USER_DELETED',
] as const satisfies readonly AuditLogAction[];

export type UserDeletionAuditAction = (typeof USER_DELETION_AUDIT_ACTIONS)[number];

/** ユーザーの削除の種別の表示名 */
export const USER_DELETION_AUDIT_ACTION_LABELS: Record<UserDeletionAuditAction, string> = {
  USER_DELETED: 'ユーザー削除',
};

/**
 * 外部の AI での読み取り（Claude Vision）の送信の種別（estimate-request の 49.7）
 *
 * backend は送信のたびに利用者・機能・画像の枚数・結果を記録する（画像と読み取りの結果は入れない）。
 * 並びは監査ログ画面の絞り込みの一覧の表示順
 */
export const CLAUDE_VISION_AUDIT_ACTIONS = [
  'CLAUDE_VISION_SENT',
] as const satisfies readonly AuditLogAction[];

export type ClaudeVisionAuditAction = (typeof CLAUDE_VISION_AUDIT_ACTIONS)[number];

/** 外部の AI での読み取りの送信の種別の表示名 */
export const CLAUDE_VISION_AUDIT_ACTION_LABELS: Record<ClaudeVisionAuditAction, string> = {
  CLAUDE_VISION_SENT: '外部AIでの読み取りの送信',
};

/**
 * 論理削除したプロジェクトの完全削除の種別（project-management 要件46.6）と、
 * その失敗の扱いの種別（対象外化・対象への復帰・定期処理の結果。要件46.11・46.14・46.15）
 *
 * backend の定期処理と運用の手順が実行者なしで記録する。並びは監査ログ画面の絞り込みの一覧の表示順
 */
export const PROJECT_PURGE_AUDIT_ACTIONS = [
  'PROJECT_PURGED',
  'PROJECT_PURGE_EXCLUDED',
  'PROJECT_PURGE_REQUEUED',
  'PROJECT_PURGE_RUN_COMPLETED',
] as const satisfies readonly AuditLogAction[];

export type ProjectPurgeAuditAction = (typeof PROJECT_PURGE_AUDIT_ACTIONS)[number];

/** プロジェクトの完全削除の種別の表示名 */
export const PROJECT_PURGE_AUDIT_ACTION_LABELS: Record<ProjectPurgeAuditAction, string> = {
  PROJECT_PURGED: 'プロジェクトの完全削除',
  PROJECT_PURGE_EXCLUDED: 'プロジェクトの完全削除の対象外化',
  PROJECT_PURGE_REQUEUED: 'プロジェクトの完全削除の対象への復帰',
  PROJECT_PURGE_RUN_COMPLETED: 'プロジェクトの完全削除の定期処理の結果',
};

/** 招待の記録の対象の種別（backend の InvitationService.recordAudit と register の記録の targetType） */
const INVITATION_TARGET_TYPE = 'Invitation';

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

/**
 * 監査ログの対象の欄の表示（要件40.12）
 *
 * 招待の記録（targetType が Invitation）は対象の ID が招待の ID なので、記録の付帯情報の
 * 招待先のメールアドレス（metadata.email）を表示する。メールアドレスの無い記録と他の種別の
 * 記録は従来どおり対象の名前、無ければ対象の ID を表示する
 */
export function getAuditLogTargetLabel(
  log: Pick<AuditLog, 'targetType' | 'targetId' | 'targetName' | 'metadata'>
): string {
  if (log.targetType === INVITATION_TARGET_TYPE) {
    const email = log.metadata?.email;
    if (typeof email === 'string' && email !== '') {
      return email;
    }
  }
  return log.targetName || log.targetId || '-';
}
