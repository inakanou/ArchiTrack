/**
 * @fileoverview 権限管理関連の型定義
 *
 * Requirements:
 * - 18.1-18.7: 権限管理
 */

import type { Result } from './result';

/**
 * 権限サービスのインターフェース
 */
export interface IPermissionService {
  /**
   * 全権限一覧を取得
   *
   * @returns 権限一覧（リソース・アクション順）
   */
  listPermissions(): Promise<PermissionInfo[]>;

  /**
   * 新しい権限を作成
   *
   * @param input - 権限作成入力
   * @returns 作成された権限情報またはエラー
   */
  createPermission(input: CreatePermissionInput): Promise<Result<PermissionInfo, PermissionError>>;

  /**
   * 権限IDで権限を取得
   *
   * @param permissionId - 権限ID
   * @returns 権限情報またはエラー
   */
  getPermissionById(permissionId: string): Promise<Result<PermissionInfo, PermissionError>>;

  /**
   * 権限を削除
   *
   * @param permissionId - 権限ID
   * @returns 成功またはエラー
   */
  deletePermission(permissionId: string): Promise<Result<void, PermissionError>>;
}

/**
 * 権限作成入力
 */
export interface CreatePermissionInput {
  /** リソースタイプ（例: adr, user, role, *, 等） */
  resource: string;
  /** アクション（例: read, create, update, delete, *, 等） */
  action: string;
  /** 権限の説明 */
  description: string;
}

/**
 * 権限情報
 */
export interface PermissionInfo {
  /** 権限ID */
  id: string;
  /** リソースタイプ */
  resource: string;
  /** アクション */
  action: string;
  /** 権限の説明 */
  description: string;
  /** 作成日時 */
  createdAt: Date;
}

/**
 * 権限エラー型
 */
export type PermissionError =
  | { type: 'PERMISSION_NOT_FOUND' }
  | { type: 'PERMISSION_ALREADY_EXISTS'; resource: string; action: string }
  | { type: 'INVALID_PERMISSION_FORMAT'; message: string }
  | { type: 'PERMISSION_IN_USE'; roleCount: number }
  | { type: 'DATABASE_ERROR'; message: string };
