/**
 * @fileoverview 工事写真権限フック
 *
 * Task 11.1: 工事写真権限フックを作成する
 *
 * `construction_photo:{read,create,update,delete}` の保持状況から
 * canView/canCreate/canEdit/canDelete と権限エラーメッセージ取得
 * (getPermissionError) を提供する。
 *
 * 判定は既存の汎用 usePermission（RBAC権限駆動、ワイルドカード対応、
 * 未ロード時false）に委譲し、ロールを直書きしない。
 *
 * Requirements:
 * - 17.1: 編集権限を持たないユーザーには編集系の操作手段を表示しない
 * - 17.2: 削除権限を持たないユーザーには削除系の操作手段を表示しない
 * - 17.3: 編集権限を持たないユーザーには詳細画面を読み取り専用として表示する
 * - 17.5: 権限情報がロードされるまで操作手段を安全側（非表示）で扱う
 */

import { useCallback, useMemo } from 'react';
import { usePermission } from './usePermission';

/**
 * 権限操作の種類
 */
export type ConstructionPhotoPermissionAction = 'view' | 'create' | 'edit' | 'delete';

/**
 * 工事写真権限フックの戻り値
 */
export interface ConstructionPhotoPermission {
  /** 閲覧権限があるか */
  canView: boolean;
  /** 作成権限があるか */
  canCreate: boolean;
  /** 編集権限があるか */
  canEdit: boolean;
  /** 削除権限があるか */
  canDelete: boolean;
  /** 権限情報がロード中か */
  isLoading: boolean;
  /** 権限エラーメッセージを取得する */
  getPermissionError: (action: ConstructionPhotoPermissionAction) => string | null;
}

/**
 * 権限エラーメッセージのマッピング
 */
const PERMISSION_ERROR_MESSAGES: Record<ConstructionPhotoPermissionAction, string> = {
  view: '工事写真を閲覧する権限がありません',
  create: '工事写真を作成する権限がありません',
  edit: '工事写真を編集する権限がありません',
  delete: '工事写真を削除する権限がありません',
};

/**
 * 工事写真に対する権限を管理するカスタムフック
 *
 * usePermission（construction_photo:read/create/update/delete）の保持状況に
 * 基づいて canView/canCreate/canEdit/canDelete を判定する。
 * 権限情報がロード中の場合は全て false を返す（安全側、Requirement 17.5）。
 *
 * @example
 * ```tsx
 * function ConstructionPhotoDetailPage() {
 *   const { canEdit, canDelete, getPermissionError } = useConstructionPhotoPermission();
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
export function useConstructionPhotoPermission(): ConstructionPhotoPermission {
  const { hasPermission, isLoading } = usePermission();

  /**
   * 閲覧権限（construction_photo:read）
   * ロード中は安全側でfalse
   */
  const canView = useMemo(() => {
    if (isLoading) return false;
    return hasPermission('construction_photo:read');
  }, [hasPermission, isLoading]);

  /**
   * 作成権限（construction_photo:create）
   * ロード中は安全側でfalse
   */
  const canCreate = useMemo(() => {
    if (isLoading) return false;
    return hasPermission('construction_photo:create');
  }, [hasPermission, isLoading]);

  /**
   * 編集権限（construction_photo:update）
   * ロード中は安全側でfalse
   */
  const canEdit = useMemo(() => {
    if (isLoading) return false;
    return hasPermission('construction_photo:update');
  }, [hasPermission, isLoading]);

  /**
   * 削除権限（construction_photo:delete）
   * ロード中は安全側でfalse
   */
  const canDelete = useMemo(() => {
    if (isLoading) return false;
    return hasPermission('construction_photo:delete');
  }, [hasPermission, isLoading]);

  /**
   * 権限エラーメッセージを取得
   *
   * 指定されたアクションに対する権限がない場合、エラーメッセージを返す。
   * 権限がある場合はnullを返す。
   */
  const getPermissionError = useCallback(
    (action: ConstructionPhotoPermissionAction): string | null => {
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
    isLoading,
    getPermissionError,
  };
}
