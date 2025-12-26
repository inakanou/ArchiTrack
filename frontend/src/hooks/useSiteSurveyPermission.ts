/**
 * @fileoverview 現場調査権限フック
 *
 * Task 22.3: アクセス権限によるUI制御を実装する
 *
 * Requirements:
 * - 12.1: プロジェクトへのアクセス権を持つユーザーは現場調査を閲覧可能
 * - 12.2: プロジェクトへの編集権限を持つユーザーは現場調査の作成・編集・削除を許可
 * - 12.3: 適切な権限を持たない場合、操作を拒否してエラーメッセージを表示
 *
 * 権限マッピング（seed-helpers.tsに基づく）:
 * - admin: site_survey:create, site_survey:read, site_survey:update, site_survey:delete
 * - user: site_survey:create, site_survey:read, site_survey:update（削除権限なし）
 */

import { useMemo, useCallback } from 'react';
import { useAuth } from './useAuth';

/**
 * 権限操作の種類
 */
export type SiteSurveyPermissionAction = 'view' | 'create' | 'edit' | 'delete';

/**
 * 現場調査権限フックの戻り値
 */
export interface SiteSurveyPermission {
  /** 閲覧権限があるか */
  canView: boolean;
  /** 作成権限があるか */
  canCreate: boolean;
  /** 編集権限があるか */
  canEdit: boolean;
  /** 削除権限があるか */
  canDelete: boolean;
  /** 認証ローディング中か */
  isLoading: boolean;
  /** 権限エラーメッセージを取得する */
  getPermissionError: (action: SiteSurveyPermissionAction) => string | null;
}

/**
 * 権限エラーメッセージのマッピング
 */
const PERMISSION_ERROR_MESSAGES: Record<SiteSurveyPermissionAction, string> = {
  view: '現場調査を閲覧する権限がありません',
  create: '現場調査を作成する権限がありません',
  edit: '現場調査を編集する権限がありません',
  delete: '現場調査を削除する権限がありません',
};

/**
 * 現場調査権限を管理するカスタムフック
 *
 * ユーザーのロールに基づいて現場調査に対する権限を判定します。
 *
 * @example
 * ```tsx
 * function SiteSurveyDetailPage() {
 *   const { canEdit, canDelete, getPermissionError } = useSiteSurveyPermission();
 *
 *   const handleDelete = () => {
 *     if (!canDelete) {
 *       const error = getPermissionError('delete');
 *       showToast(error);
 *       return;
 *     }
 *     // 削除処理...
 *   };
 *
 *   return (
 *     <div>
 *       {canEdit && <button onClick={handleEdit}>編集</button>}
 *       {canDelete && <button onClick={handleDelete}>削除</button>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSiteSurveyPermission(): SiteSurveyPermission {
  const { user, isLoading, isInitialized } = useAuth();

  /**
   * ユーザーが特定のロールを持っているか確認
   */
  const hasRole = useCallback(
    (role: string): boolean => {
      return user?.roles?.includes(role) ?? false;
    },
    [user]
  );

  /**
   * ユーザーが管理者か確認
   */
  const isAdmin = useMemo(() => hasRole('admin'), [hasRole]);

  /**
   * ユーザーが一般ユーザーか確認
   */
  const isUser = useMemo(() => hasRole('user'), [hasRole]);

  /**
   * 閲覧権限
   * - admin: 可
   * - user: 可
   * - 未認証: 不可
   */
  const canView = useMemo(() => {
    return isAdmin || isUser;
  }, [isAdmin, isUser]);

  /**
   * 作成権限
   * - admin: 可
   * - user: 可
   * - 未認証: 不可
   */
  const canCreate = useMemo(() => {
    return isAdmin || isUser;
  }, [isAdmin, isUser]);

  /**
   * 編集権限
   * - admin: 可
   * - user: 可
   * - 未認証: 不可
   */
  const canEdit = useMemo(() => {
    return isAdmin || isUser;
  }, [isAdmin, isUser]);

  /**
   * 削除権限
   * - admin: 可
   * - user: 不可
   * - 未認証: 不可
   */
  const canDelete = useMemo(() => {
    return isAdmin;
  }, [isAdmin]);

  /**
   * 権限エラーメッセージを取得
   *
   * 指定されたアクションに対する権限がない場合、エラーメッセージを返す。
   * 権限がある場合はnullを返す。
   */
  const getPermissionError = useCallback(
    (action: SiteSurveyPermissionAction): string | null => {
      switch (action) {
        case 'view':
          return canView ? null : PERMISSION_ERROR_MESSAGES.view;
        case 'create':
          return canCreate ? null : PERMISSION_ERROR_MESSAGES.create;
        case 'edit':
          return canEdit ? null : PERMISSION_ERROR_MESSAGES.edit;
        case 'delete':
          return canDelete ? null : PERMISSION_ERROR_MESSAGES.delete;
        default:
          return null;
      }
    },
    [canView, canCreate, canEdit, canDelete]
  );

  return {
    canView,
    canCreate,
    canEdit,
    canDelete,
    isLoading: isLoading || !isInitialized,
    getPermissionError,
  };
}
