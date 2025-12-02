/**
 * Role & Permission型定義ファイル
 *
 * ロール・権限管理機能に関する型定義を提供します。
 */

/**
 * ロール情報
 */
export interface Role {
  /** ロールID */
  id: string;
  /** ロール名 */
  name: string;
  /** 説明 */
  description: string;
  /** 優先順位 */
  priority: number;
  /** システムロール */
  isSystem: boolean;
  /** 割り当てユーザー数 */
  userCount?: number;
  /** 権限数 */
  permissionCount?: number;
  /** 作成日時 */
  createdAt: string;
}

/**
 * 権限情報
 */
export interface Permission {
  /** 権限ID */
  id: string;
  /** リソースタイプ */
  resource: string;
  /** アクション */
  action: string;
  /** 説明 */
  description: string;
}

/**
 * ロール作成入力
 */
export interface CreateRoleInput {
  /** ロール名 */
  name: string;
  /** 説明 */
  description: string;
  /** 優先順位（オプション） */
  priority?: number;
}

/**
 * ロール更新入力
 */
export interface UpdateRoleInput {
  /** ロール名（オプション） */
  name?: string;
  /** 説明（オプション） */
  description?: string;
  /** 優先順位（オプション） */
  priority?: number;
}

/**
 * ロール・権限紐付け入力
 */
export interface AssignPermissionToRoleInput {
  /** ロールID */
  roleId: string;
  /** 権限ID */
  permissionId: string;
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

/**
 * ロール一覧結果
 */
export interface RoleListResult {
  /** 成功フラグ */
  success: boolean;
  /** ロールリスト */
  roles: Role[];
  /** エラーメッセージ */
  error?: string;
}

/**
 * 権限一覧結果
 */
export interface PermissionListResult {
  /** 成功フラグ */
  success: boolean;
  /** 権限リスト */
  permissions: Permission[];
  /** エラーメッセージ */
  error?: string;
}

/**
 * ロール作成結果
 */
export interface CreateRoleResult {
  /** 成功フラグ */
  success: boolean;
  /** ロール情報 */
  role?: Role;
  /** エラーメッセージ */
  error?: string;
}

/**
 * ロール更新結果
 */
export interface UpdateRoleResult {
  /** 成功フラグ */
  success: boolean;
  /** ロール情報 */
  role?: Role;
  /** エラーメッセージ */
  error?: string;
}

/**
 * ロール削除結果
 */
export interface DeleteRoleResult {
  /** 成功フラグ */
  success: boolean;
  /** エラーメッセージ */
  error?: string;
}

/**
 * ユーザー情報（管理画面用）
 */
export interface UserWithRoles {
  /** ユーザーID */
  id: string;
  /** メールアドレス */
  email: string;
  /** 表示名 */
  displayName: string;
  /** アカウント作成日時 */
  createdAt: string;
  /** ロール一覧 */
  roles: Role[];
}

/**
 * ユーザーロール割り当て入力
 */
export interface AssignRoleToUserInput {
  /** ユーザーID */
  userId: string;
  /** ロールID */
  roleId: string;
}
