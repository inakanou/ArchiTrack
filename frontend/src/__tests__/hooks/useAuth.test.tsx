import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuth } from '../../hooks/useAuth';
import { AuthContext, AuthContextValue } from '../../contexts/AuthContext';
import { ReactNode } from 'react';

describe('useAuth', () => {
  const mockAuthContextValue: AuthContextValue = {
    isAuthenticated: true,
    user: {
      id: '123',
      email: 'test@example.com',
      displayName: 'Test User',
    },
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
  };

  it('AuthProvider内で使用した場合、AuthContextの値を返す', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={mockAuthContextValue}>{children}</AuthContext.Provider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('test@example.com');
  });

  it('AuthProvider外で使用した場合、エラーをスローする', () => {
    // AuthProvider外でuseAuthを使用
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');
  });
});
