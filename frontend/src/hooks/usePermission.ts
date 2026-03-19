/**
 * @fileoverview 権限チェックフック
 *
 * Task 10.1: usePermissionフックを作成する
 *
 * AuthContextのUser.permissionsを参照して権限の有無を判定する。
 * 権限情報が未ロードの場合はデフォルトでfalseを返却する（安全側に倒す）。
 *
 * Requirements: 13.5
 */

import { useMemo, useCallback } from 'react';
import { useAuth } from './useAuth';

/**
 * usePermissionフックの戻り値
 */
export interface UsePermissionReturn {
  /** 指定された権限を保持しているか */
  hasPermission: (permission: string) => boolean;
  /** 指定された全権限を保持しているか（AND） */
  hasAllPermissions: (permissions: string[]) => boolean;
  /** 指定されたいずれかの権限を保持しているか（OR） */
  hasAnyPermission: (permissions: string[]) => boolean;
  /** 権限情報がロード中か */
  isLoading: boolean;
}

/**
 * ユーザーの権限に基づくUI要素の表示/非表示制御を提供するカスタムフック
 *
 * @example
 * ```tsx
 * function ContractListPage() {
 *   const { hasPermission, isLoading } = usePermission();
 *
 *   if (isLoading) return <Loading />;
 *
 *   return (
 *     <div>
 *       {hasPermission('contract:create') && (
 *         <button>新規作成</button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePermission(): UsePermissionReturn {
  const { user, isLoading, isInitialized } = useAuth();

  /**
   * ユーザーの権限セット（高速ルックアップ用）
   */
  const permissions = user?.permissions;
  const permissionSet = useMemo(() => {
    if (!permissions) {
      return new Set<string>();
    }
    return new Set(permissions);
  }, [permissions]);

  /**
   * 指定された権限を保持しているかチェック
   * ワイルドカード権限（*:*、resource:*、*:action）にも対応する
   * 権限情報が未ロードの場合はfalseを返す（安全側に倒す）
   */
  const checkPermission = useCallback(
    (permission: string): boolean => {
      if (!permission) return false;
      // 完全一致チェック
      if (permissionSet.has(permission)) return true;
      // ワイルドカードチェック（*:* は全権限を許可）
      if (permissionSet.has('*:*')) return true;
      // resource:* または *:action のワイルドカードチェック
      const [resource, action] = permission.split(':');
      if (resource && action) {
        if (permissionSet.has(`${resource}:*`)) return true;
        if (permissionSet.has(`*:${action}`)) return true;
      }
      return false;
    },
    [permissionSet]
  );

  const hasPermission = checkPermission;

  /**
   * 指定された全ての権限を保持しているかチェック（AND）
   * 空配列の場合はtrueを返す（全条件を満たしている）
   */
  const hasAllPermissions = useCallback(
    (permissions: string[]): boolean => {
      if (permissions.length === 0) return true;
      return permissions.every((p) => checkPermission(p));
    },
    [checkPermission]
  );

  /**
   * 指定されたいずれかの権限を保持しているかチェック（OR）
   * 空配列の場合はfalseを返す（いずれの条件も満たしていない）
   */
  const hasAnyPermission = useCallback(
    (permissions: string[]): boolean => {
      if (permissions.length === 0) return false;
      return permissions.some((p) => checkPermission(p));
    },
    [checkPermission]
  );

  return {
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    isLoading: isLoading || !isInitialized,
  };
}
