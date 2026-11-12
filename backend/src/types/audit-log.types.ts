/**
 * 監査ログサービスのインターフェースと型定義
 */

import { PrismaClient, Prisma } from '../generated/prisma/client.js';

/**
 * 監査ログサービスインターフェース
 */
export interface IAuditLogService {
  /**
   * 監査ログを記録する
   * @param input - 監査ログ作成入力
   * @param tx - 呼び出し元のトランザクション（渡すと元の操作と同じトランザクションで記録する）
   * @returns 作成された監査ログ情報
   */
  createLog(input: CreateAuditLogInput, tx?: Prisma.TransactionClient): Promise<AuditLogInfo>;

  /**
   * 監査ログを取得する（フィルタリング対応）
   * @param filter - フィルター条件
   * @returns 監査ログ一覧
   */
  getLogs(filter?: AuditLogFilter): Promise<AuditLogInfo[]>;

  /**
   * 監査ログをJSON形式でエクスポートする
   * @param filter - フィルター条件
   * @returns JSON文字列
   */
  exportLogs(filter?: AuditLogFilter): Promise<string>;
}

/**
 * 監査ログ作成入力
 */
export interface CreateAuditLogInput {
  /** アクション種別 */
  action: AuditLogAction;
  /**
   * 実行者ユーザーID。実行者の無い処理（自動無効化・アーカイブ・存在しないメールアドレスの
   * ログイン失敗）では null とし、実行者の写しも空になる（要件40.1、40.7）
   */
  actorId: string | null;
  /** 対象リソースタイプ */
  targetType: string;
  /** 対象リソースID */
  targetId: string;
  /** 変更前の値（JSON） */
  before?: Prisma.InputJsonValue | null;
  /** 変更後の値（JSON） */
  after?: Prisma.InputJsonValue | null;
  /** メタデータ（JSON：IPアドレス、ユーザーエージェント等） */
  metadata?: Prisma.InputJsonValue | null;
}

/**
 * 監査ログフィルター条件
 */
export interface AuditLogFilter {
  /** 実行者ユーザーID */
  actorId?: string;
  /** 対象リソースID */
  targetId?: string;
  /** アクション種別 */
  action?: AuditLogAction;
  /** 開始日時（ISO 8601形式） */
  startDate?: string;
  /** 終了日時（ISO 8601形式） */
  endDate?: string;
  /** ページネーション：スキップ数 */
  skip?: number;
  /** ページネーション：取得件数 */
  take?: number;
}

/**
 * 監査ログ情報
 */
export interface AuditLogInfo {
  /** 監査ログID */
  id: string;
  /** アクション種別 */
  action: AuditLogAction;
  /** 実行者ユーザーID（外部キーを持たないため、実行者の削除後も残る） */
  actorId: string | null;
  /** 記録時に写した実行者のメールアドレス（要件40.7） */
  actorEmail: string | null;
  /** 記録時に写した実行者の表示名（要件40.7） */
  actorDisplayName: string | null;
  /** 対象リソースタイプ */
  targetType: string;
  /** 対象リソースID */
  targetId: string;
  /** 変更前の値（JSON） */
  before: Prisma.JsonValue | null;
  /** 変更後の値（JSON） */
  after: Prisma.JsonValue | null;
  /** メタデータ（JSON） */
  metadata: Prisma.JsonValue | null;
  /** 作成日時 */
  createdAt: Date;
}

/**
 * 監査ログアクション種別
 */
export type AuditLogAction =
  // ロール管理
  | 'ROLE_CREATED'
  | 'ROLE_UPDATED'
  | 'ROLE_DELETED'
  // 権限管理
  | 'PERMISSION_CREATED'
  | 'PERMISSION_DELETED'
  | 'PERMISSION_ASSIGNED'
  | 'PERMISSION_REVOKED'
  // ユーザー・ロール管理
  | 'USER_ROLE_ASSIGNED'
  | 'USER_ROLE_REVOKED'
  // 認証・認可
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'TWO_FACTOR_SETUP_STARTED'
  | 'TWO_FACTOR_ENABLED'
  | 'TWO_FACTOR_DISABLED'
  | 'TWO_FACTOR_BACKUP_CODE_USED'
  | 'PERMISSION_CHECK_FAILED'
  // ユーザー管理
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  // 招待管理
  | 'INVITATION_CREATED'
  | 'INVITATION_REVOKED'
  // プロジェクト管理
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'PROJECT_DELETED'
  | 'PROJECT_STATUS_CHANGED'
  // 論理削除から保持期間を過ぎたプロジェクトの完全削除（project-management 要件46.6。件数と日時だけを持つ）
  | 'PROJECT_PURGED'
  // 完全削除が 5 回続けて失敗したプロジェクトを定期処理の対象から外した（要件46.11・46.12。回数・日時・段階だけを持つ）
  | 'PROJECT_PURGE_EXCLUDED'
  // 完全削除の定期処理の 1 回の結果（要件46.15。件数だけを持ち、対象が 0 件の回も残す）
  | 'PROJECT_PURGE_RUN_COMPLETED'
  // 対象から外したプロジェクトを運用の手順で対象に戻した（要件46.14。戻す前の回数・日時だけを持つ）
  | 'PROJECT_PURGE_REQUEUED'
  // 取引先管理
  | 'TRADING_PARTNER_CREATED'
  | 'TRADING_PARTNER_UPDATED'
  | 'TRADING_PARTNER_DELETED'
  // 現場調査管理
  | 'SITE_SURVEY_CREATED'
  | 'SITE_SURVEY_UPDATED'
  | 'SITE_SURVEY_DELETED'
  // 数量表管理
  | 'QUANTITY_TABLE_CREATED'
  | 'QUANTITY_TABLE_UPDATED'
  | 'QUANTITY_TABLE_DELETED'
  | 'QUANTITY_TABLE_COPIED'
  | 'QUANTITY_TABLE_BULK_SAVED'
  // 数量グループ管理
  | 'QUANTITY_GROUP_CREATED'
  | 'QUANTITY_GROUP_UPDATED'
  | 'QUANTITY_GROUP_DELETED'
  | 'QUANTITY_GROUP_COPIED'
  | 'QUANTITY_GROUPS_CREATED_FROM_SURVEY'
  // 数量項目管理
  | 'QUANTITY_ITEM_CREATED'
  | 'QUANTITY_ITEM_UPDATED'
  | 'QUANTITY_ITEM_DELETED'
  | 'QUANTITY_ITEM_COPIED'
  | 'QUANTITY_ITEM_MOVED'
  // 内訳書管理
  | 'ITEMIZED_STATEMENT_CREATED'
  | 'ITEMIZED_STATEMENT_UPDATED'
  | 'ITEMIZED_STATEMENT_DELETED'
  // 見積依頼管理
  | 'ESTIMATE_REQUEST_CREATED'
  | 'ESTIMATE_REQUEST_UPDATED'
  | 'ESTIMATE_REQUEST_DELETED'
  | 'ESTIMATE_REQUEST_ITEMS_UPDATED'
  | 'ESTIMATE_REQUEST_STATUS_CHANGED'
  // 受領見積書管理
  | 'RECEIVED_QUOTATION_CREATED'
  | 'RECEIVED_QUOTATION_UPDATED'
  | 'RECEIVED_QUOTATION_DELETED'
  // 見積書管理
  | 'ESTIMATE_CREATED'
  | 'ESTIMATE_UPDATED'
  | 'ESTIMATE_DELETED'
  // 自社情報管理
  | 'COMPANY_INFO_CREATED'
  | 'COMPANY_INFO_UPDATED'
  // 外部の AI での読み取り（Claude Vision）の送信（estimate-request の design の D7。対象の種類 ClaudeVision）
  | 'CLAUDE_VISION_SENT'
  // セキュリティ是正（要件40.1。種別の一覧は SECURITY_REMEDIATION_AUDIT_ACTIONS）
  // 認証（ロック・2FA・全デバイスのログアウト・トークンの再利用）
  | 'LOGIN_LOCKED'
  | 'TWO_FACTOR_VERIFIED'
  | 'TWO_FACTOR_FAILED'
  | 'LOGOUT_ALL'
  | 'REFRESH_TOKEN_REUSE_DETECTED'
  // 招待
  | 'INVITATION_RESENT'
  | 'INVITATION_ACCEPTED'
  // 利用者の状態と 2FA の再設定
  | 'USER_DEACTIVATED'
  | 'USER_REACTIVATED'
  | 'USER_AUTO_DEACTIVATED'
  | 'TWO_FACTOR_RESET_BY_ADMIN'
  | 'TWO_FACTOR_REENROLLED'
  // 範囲外のアクセス・データ出力・運用設定
  | 'PROJECT_SCOPE_DENIED'
  | 'DATA_EXPORTED'
  | 'OPERATIONAL_SETTING_CHANGED'
  // 監査ログのアーカイブと復元
  | 'AUDIT_ARCHIVE_CREATED'
  | 'AUDIT_ARCHIVE_FAILED'
  | 'AUDIT_ARCHIVE_RESTORED';

/**
 * セキュリティ是正（IPA注意喚起 2026-10-09）で加えた監査ログアクション一覧（要件40.1）
 * design.md「#### 監査」の AuditLogService が定める種別と一致させる
 */
export const SECURITY_REMEDIATION_AUDIT_ACTIONS = [
  'LOGIN_LOCKED',
  'TWO_FACTOR_VERIFIED',
  'TWO_FACTOR_FAILED',
  'LOGOUT_ALL',
  'INVITATION_RESENT',
  'INVITATION_ACCEPTED',
  'USER_DEACTIVATED',
  'USER_REACTIVATED',
  'USER_AUTO_DEACTIVATED',
  'TWO_FACTOR_RESET_BY_ADMIN',
  'TWO_FACTOR_REENROLLED',
  'REFRESH_TOKEN_REUSE_DETECTED',
  'PROJECT_SCOPE_DENIED',
  'DATA_EXPORTED',
  'OPERATIONAL_SETTING_CHANGED',
  'AUDIT_ARCHIVE_CREATED',
  'AUDIT_ARCHIVE_FAILED',
  'AUDIT_ARCHIVE_RESTORED',
] as const satisfies readonly AuditLogAction[];

/**
 * セキュリティ是正の監査ログアクション型（サブセット）
 */
export type SecurityRemediationAuditAction = (typeof SECURITY_REMEDIATION_AUDIT_ACTIONS)[number];

/**
 * 取引先管理の監査ログアクション一覧
 * TradingPartnerServiceとの連携で使用
 */
export const TRADING_PARTNER_AUDIT_ACTIONS: readonly AuditLogAction[] = [
  'TRADING_PARTNER_CREATED',
  'TRADING_PARTNER_UPDATED',
  'TRADING_PARTNER_DELETED',
] as const;

/**
 * 取引先監査ログアクション型（サブセット）
 */
export type TradingPartnerAuditAction = (typeof TRADING_PARTNER_AUDIT_ACTIONS)[number];

/**
 * 取引先監査ログのターゲットタイプ定数
 */
export const TRADING_PARTNER_TARGET_TYPE = 'TradingPartner' as const;

/**
 * 現場調査管理の監査ログアクション一覧
 * SiteSurveyServiceとの連携で使用
 */
export const SITE_SURVEY_AUDIT_ACTIONS: readonly AuditLogAction[] = [
  'SITE_SURVEY_CREATED',
  'SITE_SURVEY_UPDATED',
  'SITE_SURVEY_DELETED',
] as const;

/**
 * 現場調査監査ログアクション型（サブセット）
 */
export type SiteSurveyAuditAction = (typeof SITE_SURVEY_AUDIT_ACTIONS)[number];

/**
 * 現場調査監査ログのターゲットタイプ定数
 */
export const SITE_SURVEY_TARGET_TYPE = 'SiteSurvey' as const;

/**
 * 数量表管理の監査ログアクション一覧
 * QuantityTableServiceとの連携で使用
 */
export const QUANTITY_TABLE_AUDIT_ACTIONS: readonly AuditLogAction[] = [
  'QUANTITY_TABLE_CREATED',
  'QUANTITY_TABLE_UPDATED',
  'QUANTITY_TABLE_DELETED',
  'QUANTITY_TABLE_COPIED',
] as const;

/**
 * 数量表監査ログアクション型（サブセット）
 */
export type QuantityTableAuditAction = (typeof QUANTITY_TABLE_AUDIT_ACTIONS)[number];

/**
 * 数量表監査ログのターゲットタイプ定数
 */
export const QUANTITY_TABLE_TARGET_TYPE = 'QuantityTable' as const;

/**
 * 数量グループ管理の監査ログアクション一覧
 */
export const QUANTITY_GROUP_AUDIT_ACTIONS: readonly AuditLogAction[] = [
  'QUANTITY_GROUP_CREATED',
  'QUANTITY_GROUP_UPDATED',
  'QUANTITY_GROUP_DELETED',
  'QUANTITY_GROUP_COPIED',
  'QUANTITY_GROUPS_CREATED_FROM_SURVEY',
] as const;

/**
 * 数量グループ監査ログアクション型（サブセット）
 */
export type QuantityGroupAuditAction = (typeof QUANTITY_GROUP_AUDIT_ACTIONS)[number];

/**
 * 数量グループ監査ログのターゲットタイプ定数
 */
export const QUANTITY_GROUP_TARGET_TYPE = 'QuantityGroup' as const;

/**
 * 数量項目管理の監査ログアクション一覧
 */
export const QUANTITY_ITEM_AUDIT_ACTIONS: readonly AuditLogAction[] = [
  'QUANTITY_ITEM_CREATED',
  'QUANTITY_ITEM_UPDATED',
  'QUANTITY_ITEM_DELETED',
  'QUANTITY_ITEM_COPIED',
  'QUANTITY_ITEM_MOVED',
] as const;

/**
 * 数量項目監査ログアクション型（サブセット）
 */
export type QuantityItemAuditAction = (typeof QUANTITY_ITEM_AUDIT_ACTIONS)[number];

/**
 * 数量項目監査ログのターゲットタイプ定数
 */
export const QUANTITY_ITEM_TARGET_TYPE = 'QuantityItem' as const;

/**
 * 内訳書管理の監査ログアクション一覧
 * ItemizedStatementServiceとの連携で使用
 */
export const ITEMIZED_STATEMENT_AUDIT_ACTIONS: readonly AuditLogAction[] = [
  'ITEMIZED_STATEMENT_CREATED',
  'ITEMIZED_STATEMENT_UPDATED',
  'ITEMIZED_STATEMENT_DELETED',
] as const;

/**
 * 内訳書監査ログアクション型（サブセット）
 */
export type ItemizedStatementAuditAction = (typeof ITEMIZED_STATEMENT_AUDIT_ACTIONS)[number];

/**
 * 内訳書監査ログのターゲットタイプ定数
 */
export const ITEMIZED_STATEMENT_TARGET_TYPE = 'ItemizedStatement' as const;

/**
 * 見積依頼管理の監査ログアクション一覧
 * EstimateRequestServiceとの連携で使用
 */
export const ESTIMATE_REQUEST_AUDIT_ACTIONS: readonly AuditLogAction[] = [
  'ESTIMATE_REQUEST_CREATED',
  'ESTIMATE_REQUEST_UPDATED',
  'ESTIMATE_REQUEST_DELETED',
  'ESTIMATE_REQUEST_ITEMS_UPDATED',
] as const;

/**
 * 見積依頼監査ログアクション型（サブセット）
 */
export type EstimateRequestAuditAction = (typeof ESTIMATE_REQUEST_AUDIT_ACTIONS)[number];

/**
 * 見積依頼監査ログのターゲットタイプ定数
 */
export const ESTIMATE_REQUEST_TARGET_TYPE = 'EstimateRequest' as const;

/**
 * 受領見積書管理の監査ログアクション一覧
 * ReceivedQuotationServiceとの連携で使用
 */
export const RECEIVED_QUOTATION_AUDIT_ACTIONS: readonly AuditLogAction[] = [
  'RECEIVED_QUOTATION_CREATED',
  'RECEIVED_QUOTATION_UPDATED',
  'RECEIVED_QUOTATION_DELETED',
] as const;

/**
 * 受領見積書監査ログアクション型（サブセット）
 */
export type ReceivedQuotationAuditAction = (typeof RECEIVED_QUOTATION_AUDIT_ACTIONS)[number];

/**
 * 受領見積書監査ログのターゲットタイプ定数
 */
export const RECEIVED_QUOTATION_TARGET_TYPE = 'ReceivedQuotation' as const;

/**
 * 自社情報管理の監査ログアクション一覧
 * CompanyInfoServiceとの連携で使用
 */
export const COMPANY_INFO_AUDIT_ACTIONS: readonly AuditLogAction[] = [
  'COMPANY_INFO_CREATED',
  'COMPANY_INFO_UPDATED',
] as const;

/**
 * 自社情報監査ログアクション型（サブセット）
 */
export type CompanyInfoAuditAction = (typeof COMPANY_INFO_AUDIT_ACTIONS)[number];

/**
 * 自社情報監査ログのターゲットタイプ定数
 */
export const COMPANY_INFO_TARGET_TYPE = 'CompanyInfo' as const;

/**
 * 監査ログエラー種別
 */
export type AuditLogError = 'DATABASE_ERROR' | 'INVALID_DATE_RANGE';

/**
 * 監査ログサービス依存関係
 */
export interface AuditLogServiceDependencies {
  prisma: PrismaClient;
}
