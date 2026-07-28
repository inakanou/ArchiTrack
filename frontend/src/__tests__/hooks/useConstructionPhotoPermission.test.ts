/**
 * @fileoverview 工事写真権限フックのテスト
 *
 * Task 11.1: 工事写真権限フックを作成する
 *
 * construction_photo:{read,create,update,delete} の保持状況から
 * canView/canCreate/canEdit/canDelete と権限エラーメッセージ取得
 * (getPermissionError) を提供する useConstructionPhotoPermission を検証する。
 *
 * Requirements:
 * - 17.1: 編集権限を持たない場合、操作手段を表示しない
 * - 17.2: 削除権限を持たない場合、操作手段を表示しない
 * - 17.3: 編集権限を持たない場合、読み取り専用として表示する
 * - 17.5: 権限情報がロードされるまで安全側（非表示）で扱う
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useConstructionPhotoPermission } from '../../hooks/useConstructionPhotoPermission';
import * as usePermissionModule from '../../hooks/usePermission';
import type { UsePermissionReturn } from '../../hooks/usePermission';

// usePermissionフックをモック（判定はusePermissionベースで行う）
vi.mock('../../hooks/usePermission', () => ({
  usePermission: vi.fn(),
}));

/**
 * デフォルトのモックUsePermissionReturnを作成するヘルパー
 * permissionsに含まれる文字列のみhasPermissionがtrueを返す
 */
function createMockUsePermission(
  permissions: string[],
  overrides: Partial<UsePermissionReturn> = {}
): UsePermissionReturn {
  const permissionSet = new Set(permissions);
  const hasPermission = (permission: string): boolean => permissionSet.has(permission);
  return {
    hasPermission: vi.fn(hasPermission),
    hasAllPermissions: vi.fn((perms: string[]) => perms.every(hasPermission)),
    hasAnyPermission: vi.fn((perms: string[]) => perms.some(hasPermission)),
    isLoading: false,
    ...overrides,
  };
}

describe('useConstructionPhotoPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('canView (Requirement 17.5関連の基礎判定)', () => {
    it('construction_photo:read権限を持つ場合、canViewはtrue', () => {
      vi.mocked(usePermissionModule.usePermission).mockReturnValue(
        createMockUsePermission(['construction_photo:read'])
      );

      const { result } = renderHook(() => useConstructionPhotoPermission());

      expect(result.current.canView).toBe(true);
    });

    it('construction_photo:read権限を持たない場合、canViewはfalse', () => {
      vi.mocked(usePermissionModule.usePermission).mockReturnValue(createMockUsePermission([]));

      const { result } = renderHook(() => useConstructionPhotoPermission());

      expect(result.current.canView).toBe(false);
    });
  });

  describe('canCreate (Requirement 17.1)', () => {
    it('construction_photo:create権限を持つ場合、canCreateはtrue', () => {
      vi.mocked(usePermissionModule.usePermission).mockReturnValue(
        createMockUsePermission(['construction_photo:create'])
      );

      const { result } = renderHook(() => useConstructionPhotoPermission());

      expect(result.current.canCreate).toBe(true);
    });

    it('construction_photo:create権限を持たない場合、canCreateはfalse', () => {
      vi.mocked(usePermissionModule.usePermission).mockReturnValue(createMockUsePermission([]));

      const { result } = renderHook(() => useConstructionPhotoPermission());

      expect(result.current.canCreate).toBe(false);
    });
  });

  describe('canEdit (Requirement 17.1, 17.3)', () => {
    it('construction_photo:update権限を持つ場合、canEditはtrue', () => {
      vi.mocked(usePermissionModule.usePermission).mockReturnValue(
        createMockUsePermission(['construction_photo:update'])
      );

      const { result } = renderHook(() => useConstructionPhotoPermission());

      expect(result.current.canEdit).toBe(true);
    });

    it('construction_photo:update権限を持たない場合、canEditはfalse', () => {
      vi.mocked(usePermissionModule.usePermission).mockReturnValue(
        createMockUsePermission(['construction_photo:read'])
      );

      const { result } = renderHook(() => useConstructionPhotoPermission());

      expect(result.current.canEdit).toBe(false);
    });
  });

  describe('canDelete (Requirement 17.2)', () => {
    it('construction_photo:delete権限を持つ場合、canDeleteはtrue', () => {
      vi.mocked(usePermissionModule.usePermission).mockReturnValue(
        createMockUsePermission(['construction_photo:delete'])
      );

      const { result } = renderHook(() => useConstructionPhotoPermission());

      expect(result.current.canDelete).toBe(true);
    });

    it('construction_photo:delete権限を持たない場合、canDeleteはfalse', () => {
      vi.mocked(usePermissionModule.usePermission).mockReturnValue(
        createMockUsePermission([
          'construction_photo:read',
          'construction_photo:create',
          'construction_photo:update',
        ])
      );

      const { result } = renderHook(() => useConstructionPhotoPermission());

      expect(result.current.canDelete).toBe(false);
    });
  });

  describe('権限ロード中 (Requirement 17.5)', () => {
    it('isLoadingがtrueの場合、権限を保持していても全てfalseを返す（安全側）', () => {
      vi.mocked(usePermissionModule.usePermission).mockReturnValue(
        createMockUsePermission(
          [
            'construction_photo:read',
            'construction_photo:create',
            'construction_photo:update',
            'construction_photo:delete',
          ],
          { isLoading: true }
        )
      );

      const { result } = renderHook(() => useConstructionPhotoPermission());

      expect(result.current.canView).toBe(false);
      expect(result.current.canCreate).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canDelete).toBe(false);
      expect(result.current.isLoading).toBe(true);
    });

    it('isLoadingがfalseの場合、通常通り権限保持状況を反映する', () => {
      vi.mocked(usePermissionModule.usePermission).mockReturnValue(
        createMockUsePermission(['construction_photo:read'], { isLoading: false })
      );

      const { result } = renderHook(() => useConstructionPhotoPermission());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.canView).toBe(true);
    });
  });

  describe('getPermissionError', () => {
    it('view権限がない場合のエラーメッセージを返す', () => {
      vi.mocked(usePermissionModule.usePermission).mockReturnValue(createMockUsePermission([]));

      const { result } = renderHook(() => useConstructionPhotoPermission());

      expect(result.current.getPermissionError('view')).toBe('工事写真を閲覧する権限がありません');
    });

    it('create権限がない場合のエラーメッセージを返す', () => {
      vi.mocked(usePermissionModule.usePermission).mockReturnValue(createMockUsePermission([]));

      const { result } = renderHook(() => useConstructionPhotoPermission());

      expect(result.current.getPermissionError('create')).toBe(
        '工事写真を作成する権限がありません'
      );
    });

    it('edit権限がない場合のエラーメッセージを返す', () => {
      vi.mocked(usePermissionModule.usePermission).mockReturnValue(createMockUsePermission([]));

      const { result } = renderHook(() => useConstructionPhotoPermission());

      expect(result.current.getPermissionError('edit')).toBe('工事写真を編集する権限がありません');
    });

    it('delete権限がない場合のエラーメッセージを返す', () => {
      vi.mocked(usePermissionModule.usePermission).mockReturnValue(createMockUsePermission([]));

      const { result } = renderHook(() => useConstructionPhotoPermission());

      expect(result.current.getPermissionError('delete')).toBe(
        '工事写真を削除する権限がありません'
      );
    });

    it('権限がある場合はnullを返す', () => {
      vi.mocked(usePermissionModule.usePermission).mockReturnValue(
        createMockUsePermission([
          'construction_photo:read',
          'construction_photo:create',
          'construction_photo:update',
          'construction_photo:delete',
        ])
      );

      const { result } = renderHook(() => useConstructionPhotoPermission());

      expect(result.current.getPermissionError('view')).toBeNull();
      expect(result.current.getPermissionError('create')).toBeNull();
      expect(result.current.getPermissionError('edit')).toBeNull();
      expect(result.current.getPermissionError('delete')).toBeNull();
    });

    it('ロード中は権限を保持していてもエラーメッセージを返す（安全側）', () => {
      vi.mocked(usePermissionModule.usePermission).mockReturnValue(
        createMockUsePermission(['construction_photo:update'], { isLoading: true })
      );

      const { result } = renderHook(() => useConstructionPhotoPermission());

      expect(result.current.getPermissionError('edit')).toBe('工事写真を編集する権限がありません');
    });
  });
});
