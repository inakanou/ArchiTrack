/**
 * @fileoverview RBAC（Role-Based Access Control）関連の型定義
 *
 * Requirements:
 * - 6.1-6.8: ロールベースアクセス制御（RBAC）
 * - 21.1-21.10: セキュリティ要件（認可・権限管理）
 */

/**
 * RBACサービスのインターフェース
 */
export interface IRBACService {
  /**
   * ユーザーが指定された権限を持っているかチェック
   *
   * @param userId - ユーザーID
   * @param permission - 権限文字列（例: "adr:read", "user:create"）
   * @returns 権限を持っている場合true、持っていない場合false
   */
  hasPermission(userId: string, permission: string): Promise<boolean>;

  /**
   * ユーザーが持つ全ての権限を取得
   *
   * @param userId - ユーザーID
   * @returns ユーザーが持つ権限情報の配列
   */
  getUserPermissions(userId: string): Promise<PermissionInfo[]>;
}

/**
 * 権限情報
 */
export interface PermissionInfo {
  /** 権限ID */
  id: string;
  /** リソース名（例: "adr", "user", "*"） */
  resource: string;
  /** アクション名（例: "read", "create", "*"） */
  action: string;
  /** 権限の説明 */
  description: string;
}

/**
 * RBACエラー型
 */
export type RBACError =
  | { type: 'USER_NOT_FOUND' }
  | { type: 'DATABASE_ERROR'; message: string }
  | { type: 'CACHE_ERROR'; message: string };
