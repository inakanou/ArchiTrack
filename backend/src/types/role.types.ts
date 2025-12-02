/**
 * @fileoverview ロール管理関連の型定義
 *
 * Requirements:
 * - 17.1-17.9: 動的ロール管理
 */

import type { Result } from './result.js';

/**
 * ロールサービスのインターフェース
 */
export interface IRoleService {
  /**
   * 新しいロールを作成
   *
   * @param input - ロール作成入力
   * @returns 作成されたロール情報またはエラー
   */
  createRole(input: CreateRoleInput): Promise<Result<RoleInfo, RoleError>>;

  /**
   * ロール情報を更新
   *
   * @param roleId - ロールID
   * @param input - ロール更新入力
   * @returns 更新されたロール情報またはエラー
   */
  updateRole(roleId: string, input: UpdateRoleInput): Promise<Result<RoleInfo, RoleError>>;

  /**
   * ロールを削除
   *
   * @param roleId - ロールID
   * @returns 成功またはエラー
   */
  deleteRole(roleId: string): Promise<Result<void, RoleError>>;

  /**
   * 全ロール一覧を取得（統計情報付き）
   *
   * @returns ロール一覧（ユーザー数、権限数含む）
   */
  listRoles(): Promise<RoleWithStats[]>;

  /**
   * ロールIDでロールを取得
   *
   * @param roleId - ロールID
   * @returns ロール情報またはエラー
   */
  getRoleById(roleId: string): Promise<Result<RoleInfo, RoleError>>;
}

/**
 * ロール作成入力
 */
export interface CreateRoleInput {
  /** ロール名（一意） */
  name: string;
  /** ロールの説明 */
  description: string;
  /** 優先順位（高い値が高優先度、デフォルト: 0） */
  priority?: number;
}

/**
 * ロール更新入力
 */
export interface UpdateRoleInput {
  /** ロール名（一意） */
  name?: string;
  /** ロールの説明 */
  description?: string;
  /** 優先順位（高い値が高優先度） */
  priority?: number;
}

/**
 * ロール情報
 */
export interface RoleInfo {
  /** ロールID */
  id: string;
  /** ロール名 */
  name: string;
  /** ロールの説明 */
  description: string;
  /** 優先順位 */
  priority: number;
  /** システムロール（削除不可） */
  isSystem: boolean;
  /** 作成日時 */
  createdAt: Date;
  /** 更新日時 */
  updatedAt: Date;
}

/**
 * 統計情報付きロール情報
 */
export interface RoleWithStats extends RoleInfo {
  /** 割り当てユーザー数 */
  userCount: number;
  /** 権限数 */
  permissionCount: number;
}

/**
 * ロールエラー型
 */
export type RoleError =
  | { type: 'ROLE_NOT_FOUND' }
  | { type: 'ROLE_NAME_CONFLICT'; name: string }
  | { type: 'ROLE_IN_USE'; userCount: number }
  | { type: 'SYSTEM_ROLE_PROTECTED' }
  | { type: 'DATABASE_ERROR'; message: string };
