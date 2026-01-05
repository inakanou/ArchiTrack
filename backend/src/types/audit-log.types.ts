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
   * @returns 作成された監査ログ情報
   */
  createLog(input: CreateAuditLogInput): Promise<AuditLogInfo>;

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
  /** 実行者ユーザーID */
  actorId: string;
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
  /** 実行者ユーザーID */
  actorId: string;
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
  // 数量グループ管理
  | 'QUANTITY_GROUP_CREATED'
  | 'QUANTITY_GROUP_UPDATED'
  | 'QUANTITY_GROUP_DELETED'
  // 数量項目管理
  | 'QUANTITY_ITEM_CREATED'
  | 'QUANTITY_ITEM_UPDATED'
  | 'QUANTITY_ITEM_DELETED'
  | 'QUANTITY_ITEM_COPIED'
  | 'QUANTITY_ITEM_MOVED';

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
 * 監査ログエラー種別
 */
export type AuditLogError = 'DATABASE_ERROR' | 'INVALID_DATE_RANGE';

/**
 * 監査ログサービス依存関係
 */
export interface AuditLogServiceDependencies {
  prisma: PrismaClient;
}
