/**
 * @fileoverview ロール・権限紐付け管理関連の型定義
 *
 * Requirements:
 * - 19.1-19.8: ロールへの権限割り当て
 */

import type { Result } from './result.js';

/**
 * ロール・権限紐付けサービスのインターフェース
 */
export interface IRolePermissionService {
  /**
   * ロールに権限を追加
   *
   * @param roleId - ロールID
   * @param permissionId - 権限ID
   * @returns 成功またはエラー
   */
  addPermissionToRole(
    roleId: string,
    permissionId: string
  ): Promise<Result<void, RolePermissionError>>;

  /**
   * ロールから権限を削除
   *
   * @param roleId - ロールID
   * @param permissionId - 権限ID
   * @returns 成功またはエラー
   */
  removePermissionFromRole(
    roleId: string,
    permissionId: string
  ): Promise<Result<void, RolePermissionError>>;

  /**
   * ロールの権限一覧を取得
   *
   * @param roleId - ロールID
   * @returns 権限情報の配列またはエラー
   */
  getRolePermissions(roleId: string): Promise<Result<RolePermissionInfo[], RolePermissionError>>;

  /**
   * 複数の権限を一括でロールに追加（トランザクション）
   *
   * @param roleId - ロールID
   * @param permissionIds - 権限IDの配列
   * @returns 成功またはエラー
   */
  addPermissionsToRole(
    roleId: string,
    permissionIds: string[]
  ): Promise<Result<void, RolePermissionError>>;

  /**
   * 複数の権限を一括でロールから削除（トランザクション）
   *
   * @param roleId - ロールID
   * @param permissionIds - 権限IDの配列
   * @returns 成功またはエラー
   */
  removePermissionsFromRole(
    roleId: string,
    permissionIds: string[]
  ): Promise<Result<void, RolePermissionError>>;

  /**
   * ロールが特定の権限を持っているか確認
   *
   * @param roleId - ロールID
   * @param permissionId - 権限ID
   * @returns 持っている場合true
   */
  hasRolePermission(roleId: string, permissionId: string): Promise<boolean>;
}

/**
 * ロール・権限紐付け情報
 */
export interface RolePermissionInfo {
  /** 権限ID */
  permissionId: string;
  /** リソースタイプ */
  resource: string;
  /** アクション */
  action: string;
  /** 権限の説明 */
  description: string;
  /** 割り当て日時 */
  assignedAt: Date;
}

/**
 * ロール・権限紐付けエラー型
 */
export type RolePermissionError =
  | { type: 'ROLE_NOT_FOUND' }
  | { type: 'PERMISSION_NOT_FOUND' }
  | { type: 'ASSIGNMENT_NOT_FOUND' }
  | { type: 'ADMIN_WILDCARD_PROTECTED' }
  | { type: 'DATABASE_ERROR'; message: string };
