/**
 * @fileoverview ユーザー・ロール紐付け管理関連の型定義
 *
 * Requirements:
 * - 20.1-20.9: ユーザーへのロール割り当て（マルチロール対応）
 */

import type { Result } from './result';

/**
 * ユーザー・ロール紐付けサービスのインターフェース
 */
export interface IUserRoleService {
  /**
   * ユーザーにロールを追加
   *
   * @param userId - ユーザーID
   * @param roleId - ロールID
   * @returns 成功またはエラー
   */
  addRoleToUser(userId: string, roleId: string): Promise<Result<void, UserRoleError>>;

  /**
   * ユーザーからロールを削除
   *
   * @param userId - ユーザーID
   * @param roleId - ロールID
   * @returns 成功またはエラー
   */
  removeRoleFromUser(userId: string, roleId: string): Promise<Result<void, UserRoleError>>;

  /**
   * ユーザーのロール一覧を取得
   *
   * @param userId - ユーザーID
   * @returns ロール情報の配列またはエラー
   */
  getUserRoles(userId: string): Promise<Result<UserRoleInfo[], UserRoleError>>;

  /**
   * 複数のロールを一括でユーザーに追加（トランザクション）
   *
   * @param userId - ユーザーID
   * @param roleIds - ロールIDの配列
   * @returns 成功またはエラー
   */
  addRolesToUser(userId: string, roleIds: string[]): Promise<Result<void, UserRoleError>>;

  /**
   * 複数のロールを一括でユーザーから削除（トランザクション）
   *
   * @param userId - ユーザーID
   * @param roleIds - ロールIDの配列
   * @returns 成功またはエラー
   */
  removeRolesFromUser(userId: string, roleIds: string[]): Promise<Result<void, UserRoleError>>;

  /**
   * ユーザーが特定のロールを持っているか確認
   *
   * @param userId - ユーザーID
   * @param roleId - ロールID
   * @returns 持っている場合true
   */
  hasUserRole(userId: string, roleId: string): Promise<boolean>;
}

/**
 * ユーザー・ロール紐付け情報
 */
export interface UserRoleInfo {
  /** ロールID */
  roleId: string;
  /** ロール名 */
  name: string;
  /** ロール説明 */
  description: string;
  /** 優先順位 */
  priority: number;
  /** システムロールかどうか */
  isSystem: boolean;
  /** 割り当て日時 */
  assignedAt: Date;
}

/**
 * ユーザー・ロールエラー型
 */
export type UserRoleError =
  | { type: 'USER_NOT_FOUND' }
  | { type: 'ROLE_NOT_FOUND' }
  | { type: 'ASSIGNMENT_NOT_FOUND' }
  | { type: 'LAST_ADMIN_PROTECTED' }
  | { type: 'DATABASE_ERROR'; message: string };
