/**
 * @fileoverview 現場調査権限フックのテスト
 *
 * Task 22.3: アクセス権限によるUI制御を実装する
 *
 * Requirements:
 * - 12.1: プロジェクトへのアクセス権を持つユーザーは現場調査を閲覧可能
 * - 12.2: プロジェクトへの編集権限を持つユーザーは現場調査の作成・編集・削除を許可
 * - 12.3: 適切な権限を持たない場合、操作を拒否してエラーメッセージを表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSiteSurveyPermission } from '../../hooks/useSiteSurveyPermission';
import * as useAuthModule from '../../hooks/useAuth';

// useAuthフックをモック
vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

describe('useSiteSurveyPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('閲覧権限 (Requirement 12.1)', () => {
    it('site_survey:read権限を持つユーザーは閲覧可能', () => {
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        user: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'Test User',
          roles: ['user'],
        },
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
        sessionExpired: false,
        twoFactorState: null,
        login: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
        clearSessionExpired: vi.fn(),
        verify2FA: vi.fn(),
        verifyBackupCode: vi.fn(),
        cancel2FA: vi.fn(),
      });

      const { result } = renderHook(() => useSiteSurveyPermission());

      expect(result.current.canView).toBe(true);
    });

    it('admin権限を持つユーザーは閲覧可能', () => {
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        user: {
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Admin User',
          roles: ['admin'],
        },
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
        sessionExpired: false,
        twoFactorState: null,
        login: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
        clearSessionExpired: vi.fn(),
        verify2FA: vi.fn(),
        verifyBackupCode: vi.fn(),
        cancel2FA: vi.fn(),
      });

      const { result } = renderHook(() => useSiteSurveyPermission());

      expect(result.current.canView).toBe(true);
    });

    it('認証されていないユーザーは閲覧不可', () => {
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        sessionExpired: false,
        twoFactorState: null,
        login: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
        clearSessionExpired: vi.fn(),
        verify2FA: vi.fn(),
        verifyBackupCode: vi.fn(),
        cancel2FA: vi.fn(),
      });

      const { result } = renderHook(() => useSiteSurveyPermission());

      expect(result.current.canView).toBe(false);
    });
  });

  describe('編集権限 (Requirement 12.2)', () => {
    it('admin権限を持つユーザーは作成・編集・削除が可能', () => {
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        user: {
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Admin User',
          roles: ['admin'],
        },
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
        sessionExpired: false,
        twoFactorState: null,
        login: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
        clearSessionExpired: vi.fn(),
        verify2FA: vi.fn(),
        verifyBackupCode: vi.fn(),
        cancel2FA: vi.fn(),
      });

      const { result } = renderHook(() => useSiteSurveyPermission());

      expect(result.current.canCreate).toBe(true);
      expect(result.current.canEdit).toBe(true);
      expect(result.current.canDelete).toBe(true);
    });

    it('user権限を持つユーザーは作成・編集は可能だが削除は不可', () => {
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        user: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'Test User',
          roles: ['user'],
        },
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
        sessionExpired: false,
        twoFactorState: null,
        login: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
        clearSessionExpired: vi.fn(),
        verify2FA: vi.fn(),
        verifyBackupCode: vi.fn(),
        cancel2FA: vi.fn(),
      });

      const { result } = renderHook(() => useSiteSurveyPermission());

      expect(result.current.canCreate).toBe(true);
      expect(result.current.canEdit).toBe(true);
      expect(result.current.canDelete).toBe(false);
    });

    it('認証されていないユーザーは作成・編集・削除が不可', () => {
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        sessionExpired: false,
        twoFactorState: null,
        login: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
        clearSessionExpired: vi.fn(),
        verify2FA: vi.fn(),
        verifyBackupCode: vi.fn(),
        cancel2FA: vi.fn(),
      });

      const { result } = renderHook(() => useSiteSurveyPermission());

      expect(result.current.canCreate).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canDelete).toBe(false);
    });
  });

  describe('エラーメッセージ生成 (Requirement 12.3)', () => {
    it('閲覧権限がない場合のエラーメッセージを返す', () => {
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        sessionExpired: false,
        twoFactorState: null,
        login: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
        clearSessionExpired: vi.fn(),
        verify2FA: vi.fn(),
        verifyBackupCode: vi.fn(),
        cancel2FA: vi.fn(),
      });

      const { result } = renderHook(() => useSiteSurveyPermission());
      const errorMessage = result.current.getPermissionError('view');

      expect(errorMessage).toBe('現場調査を閲覧する権限がありません');
    });

    it('作成権限がない場合のエラーメッセージを返す', () => {
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        sessionExpired: false,
        twoFactorState: null,
        login: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
        clearSessionExpired: vi.fn(),
        verify2FA: vi.fn(),
        verifyBackupCode: vi.fn(),
        cancel2FA: vi.fn(),
      });

      const { result } = renderHook(() => useSiteSurveyPermission());
      const errorMessage = result.current.getPermissionError('create');

      expect(errorMessage).toBe('現場調査を作成する権限がありません');
    });

    it('編集権限がない場合のエラーメッセージを返す', () => {
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        sessionExpired: false,
        twoFactorState: null,
        login: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
        clearSessionExpired: vi.fn(),
        verify2FA: vi.fn(),
        verifyBackupCode: vi.fn(),
        cancel2FA: vi.fn(),
      });

      const { result } = renderHook(() => useSiteSurveyPermission());
      const errorMessage = result.current.getPermissionError('edit');

      expect(errorMessage).toBe('現場調査を編集する権限がありません');
    });

    it('削除権限がない場合のエラーメッセージを返す', () => {
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        user: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'Test User',
          roles: ['user'],
        },
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
        sessionExpired: false,
        twoFactorState: null,
        login: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
        clearSessionExpired: vi.fn(),
        verify2FA: vi.fn(),
        verifyBackupCode: vi.fn(),
        cancel2FA: vi.fn(),
      });

      const { result } = renderHook(() => useSiteSurveyPermission());
      const errorMessage = result.current.getPermissionError('delete');

      expect(errorMessage).toBe('現場調査を削除する権限がありません');
    });

    it('権限がある場合はnullを返す', () => {
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        user: {
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Admin User',
          roles: ['admin'],
        },
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
        sessionExpired: false,
        twoFactorState: null,
        login: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
        clearSessionExpired: vi.fn(),
        verify2FA: vi.fn(),
        verifyBackupCode: vi.fn(),
        cancel2FA: vi.fn(),
      });

      const { result } = renderHook(() => useSiteSurveyPermission());

      expect(result.current.getPermissionError('view')).toBeNull();
      expect(result.current.getPermissionError('create')).toBeNull();
      expect(result.current.getPermissionError('edit')).toBeNull();
      expect(result.current.getPermissionError('delete')).toBeNull();
    });
  });

  describe('ローディング状態', () => {
    it('認証初期化中はisLoadingがtrueを返す', () => {
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: true,
        isInitialized: false,
        sessionExpired: false,
        twoFactorState: null,
        login: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
        clearSessionExpired: vi.fn(),
        verify2FA: vi.fn(),
        verifyBackupCode: vi.fn(),
        cancel2FA: vi.fn(),
      });

      const { result } = renderHook(() => useSiteSurveyPermission());

      expect(result.current.isLoading).toBe(true);
    });

    it('認証初期化完了後はisLoadingがfalseを返す', () => {
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        user: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'Test User',
          roles: ['user'],
        },
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
        sessionExpired: false,
        twoFactorState: null,
        login: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
        clearSessionExpired: vi.fn(),
        verify2FA: vi.fn(),
        verifyBackupCode: vi.fn(),
        cancel2FA: vi.fn(),
      });

      const { result } = renderHook(() => useSiteSurveyPermission());

      expect(result.current.isLoading).toBe(false);
    });
  });
});
