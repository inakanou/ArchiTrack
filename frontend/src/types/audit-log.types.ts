/**
 * AuditLog型定義ファイル
 *
 * 監査ログ機能に関する型定義を提供します。
 */

/**
 * 監査ログアクション種別
 */
export type AuditLogAction =
  | 'ROLE_CREATED'
  | 'ROLE_UPDATED'
  | 'ROLE_DELETED'
  | 'PERMISSION_ASSIGNED'
  | 'PERMISSION_REVOKED'
  | 'USER_ROLE_ASSIGNED'
  | 'USER_ROLE_REVOKED'
  | 'PERMISSION_CHECK_FAILED'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'TWO_FACTOR_ENABLED'
  | 'TWO_FACTOR_DISABLED';

/**
 * 監査ログ情報
 */
export interface AuditLog {
  /** 監査ログID */
  id: string;
  /** 実行者ID */
  actorId: string;
  /** 実行者メールアドレス */
  actorEmail?: string;
  /** 対象リソースタイプ */
  targetType?: string;
  /** 対象リソースID */
  targetId?: string;
  /** 対象リソース名 */
  targetName?: string;
  /** アクション種別 */
  action: AuditLogAction;
  /** 変更前の値 */
  before?: Record<string, unknown>;
  /** 変更後の値 */
  after?: Record<string, unknown>;
  /** メタデータ */
  metadata?: Record<string, unknown>;
  /** IPアドレス */
  ipAddress?: string;
  /** ユーザーエージェント */
  userAgent?: string;
  /** 作成日時 */
  createdAt: string;
}

/**
 * 監査ログフィルター
 */
export interface AuditLogFilter {
  /** 実行者ID（オプション） */
  actorId?: string;
  /** 対象リソースID（オプション） */
  targetId?: string;
  /** アクション種別（オプション） */
  action?: AuditLogAction;
  /** 開始日時（オプション） */
  startDate?: string;
  /** 終了日時（オプション） */
  endDate?: string;
  /** ページネーション: スキップ */
  skip?: number;
  /** ページネーション: 取得数 */
  take?: number;
}

/**
 * 監査ログ一覧結果
 */
export interface AuditLogListResult {
  /** 成功フラグ */
  success: boolean;
  /** 監査ログリスト */
  logs: AuditLog[];
  /** 合計数 */
  total?: number;
  /** エラーメッセージ */
  error?: string;
}

/**
 * 監査ログエクスポート結果
 */
export interface AuditLogExportResult {
  /** 成功フラグ */
  success: boolean;
  /** JSONデータ */
  data?: string;
  /** エラーメッセージ */
  error?: string;
}

/**
 * APIエラーレスポンス
 */
export interface ApiErrorResponse {
  /** エラーメッセージ */
  message: string;
  /** エラーコード */
  code?: string;
}
