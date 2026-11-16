/**
 * @fileoverview AppHeader の単価台帳への導線の出し分けの単体テスト（unit-price-ledger タスク4.1）
 *
 * 導線はロールでなく台帳の管理の権限（`unit_price_ledger:manage`）で出し分ける。
 *
 * @requirement unit-price-ledger/REQ-10.5 台帳の管理の権限を持たない利用者には台帳の画面への導線を出さない
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppHeader } from '../../components/Navigation/AppHeader';
import { AuthContext, type AuthContextValue } from '../../contexts/AuthContext';

function authValue(roles: string[], permissions: string[] | undefined): AuthContextValue {
  return {
    isAuthenticated: true,
    user: {
      id: 'user-1',
      email: 'test@example.com',
      displayName: 'Test User',
      roles,
      permissions,
    },
    isLoading: false,
    isInitialized: true,
    sessionExpired: false,
    twoFactorState: null,
    login: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    sessionExpiredDuringOperation: false,
    clearSessionExpired: vi.fn(),
    handleReauthSuccess: vi.fn(),
    navigateToLogin: vi.fn(),
    verify2FA: vi.fn(),
    verifyBackupCode: vi.fn(),
    cancel2FA: vi.fn(),
    establishSession: vi.fn(),
    updateUser: vi.fn(),
  };
}

function renderHeader(value: AuthContextValue): void {
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('AppHeader の単価台帳への導線（unit-price-ledger タスク4.1）', () => {
  it('台帳の管理の権限を持つ利用者には、/unit-price-ledger への導線を出す', () => {
    renderHeader(authValue(['user'], ['project:read', 'unit_price_ledger:manage']));

    const link = screen.getByRole('link', { name: '単価台帳' });
    expect(link).toHaveAttribute('href', '/unit-price-ledger');
  });

  it('全権限（*:*）を持つシステム管理者にも導線を出す', () => {
    renderHeader(authValue(['admin'], ['*:*']));

    expect(screen.getByRole('link', { name: '単価台帳' })).toHaveAttribute(
      'href',
      '/unit-price-ledger'
    );
  });

  it('台帳の管理の権限を持たない利用者には導線を出さない', () => {
    renderHeader(authValue(['user'], ['project:read', 'estimate:update']));

    expect(screen.queryByRole('link', { name: '単価台帳' })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/unit-price-ledger"]')).toBeNull();
  });

  it('admin のロールでも台帳の管理の権限が無ければ導線を出さない（ロールで判定しない）', () => {
    renderHeader(authValue(['admin'], ['user:manage']));

    expect(screen.queryByRole('link', { name: '単価台帳' })).not.toBeInTheDocument();
  });

  it('権限の情報が無いときは導線を出さない（安全側）', () => {
    renderHeader(authValue(['user'], undefined));

    expect(screen.queryByRole('link', { name: '単価台帳' })).not.toBeInTheDocument();
  });
});
