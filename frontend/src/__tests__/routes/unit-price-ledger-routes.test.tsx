/**
 * @fileoverview 単価台帳の画面の経路の単体テスト（unit-price-ledger タスク4.1）
 *
 * 経路は認証済みの経路（ProtectedLayout の子）に置き、管理者専用の経路（requiredRole="admin"）には置かない。
 * 権限は画面の中で `unit_price_ledger:manage` を確かめ、無ければ内容を出さない（design.md の UnitPriceLedgerPage）。
 *
 * 画面の中身の API（一覧・詳細の取得）は差し替え、本物の要求を送らない（タスク4.6）。
 *
 * @requirement unit-price-ledger/REQ-10.1 台帳の画面を台帳の管理の権限を持つ利用者だけに許す
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, type RouteObject } from 'react-router-dom';
import { routes } from '../../routes';
import { AuthContext, type AuthContextValue } from '../../contexts/AuthContext';

const mocks = vi.hoisted(() => ({
  listQuotations: vi.fn(),
  getQuotation: vi.fn(),
}));

vi.mock('../../api/unit-price-ledger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/unit-price-ledger')>();
  return {
    ...actual,
    unitPriceLedgerApi: {
      ...actual.unitPriceLedgerApi,
      listQuotations: mocks.listQuotations,
      getQuotation: mocks.getQuotation,
    },
  };
});

const LIST_PATH = '/unit-price-ledger';
const DETAIL_PATH = '/unit-price-ledger/quotations/:id';
const NO_PERMISSION_MESSAGE = '単価台帳を表示する権限がありません';

function authValue(permissions: string[]): AuthContextValue {
  return {
    isAuthenticated: true,
    user: {
      id: 'user-1',
      email: 'test@example.com',
      displayName: 'Test User',
      roles: ['user'],
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

/** 認証済みの経路（ProtectedLayout の子）のまとまり。/dashboard を持つ親を探す */
function findAuthenticatedGroup(): RouteObject | undefined {
  return routes.find((route) => route.children?.some((child) => child.path === '/dashboard'));
}

/** 管理者専用の経路のまとまり。/admin/users を持つ親を探す */
function findAdminGroup(): RouteObject | undefined {
  return routes.find((route) => route.children?.some((child) => child.path === '/admin/users'));
}

function findRouteElement(path: string): ReactElement {
  const route = findAuthenticatedGroup()?.children?.find((child) => child.path === path);
  if (!route?.element) {
    throw new Error(`経路 ${path} が認証済みの経路に定義されていない`);
  }
  return route.element as ReactElement;
}

function renderRoute(path: string, url: string, permissions: string[]): void {
  render(
    <AuthContext.Provider value={authValue(permissions)}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={path} element={findRouteElement(path)} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('単価台帳の画面の経路（unit-price-ledger タスク4.1）', () => {
  beforeEach(() => {
    mocks.listQuotations.mockReset();
    mocks.getQuotation.mockReset();
    mocks.listQuotations.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });
    // 詳細の取得は終わらせない（枠の見出しだけを確かめる）
    mocks.getQuotation.mockReturnValue(new Promise(() => {}));
  });

  describe('経路の定義', () => {
    it.each([LIST_PATH, DETAIL_PATH])(
      '%s は認証済みの経路にあり、管理者専用の経路には無い',
      (path) => {
        const authenticated = findAuthenticatedGroup();
        expect(authenticated?.children?.some((child) => child.path === path)).toBe(true);

        const admin = findAdminGroup();
        expect(admin).toBeDefined();
        expect(admin?.children?.some((child) => child.path === path)).toBe(false);
      }
    );
  });

  describe('一覧の画面の枠', () => {
    it('台帳の管理の権限を持つ利用者には、単価台帳の見出しを出す', () => {
      renderRoute(LIST_PATH, '/unit-price-ledger', ['unit_price_ledger:manage']);

      expect(screen.getByRole('heading', { level: 1, name: '単価台帳' })).toBeInTheDocument();
      expect(screen.queryByText(NO_PERMISSION_MESSAGE)).not.toBeInTheDocument();
      // 一覧は差し替えた API に問い合わせる
      expect(mocks.listQuotations).toHaveBeenCalledTimes(1);
    });

    it('権限を持たない利用者には内容を出さず、権限が無い旨を出す', () => {
      renderRoute(LIST_PATH, '/unit-price-ledger', ['estimate:update']);

      expect(screen.getByRole('alert')).toHaveTextContent(NO_PERMISSION_MESSAGE);
      expect(screen.queryByRole('heading', { name: '単価台帳' })).not.toBeInTheDocument();
    });
  });

  describe('詳細の画面の枠', () => {
    const url = '/unit-price-ledger/quotations/11111111-1111-4111-8111-111111111111';

    it('台帳の管理の権限を持つ利用者には、見積の詳細の見出しを出す', () => {
      renderRoute(DETAIL_PATH, url, ['*:*']);

      expect(screen.getByRole('heading', { level: 1, name: '見積の詳細' })).toBeInTheDocument();
      expect(screen.queryByText(NO_PERMISSION_MESSAGE)).not.toBeInTheDocument();
      // 詳細は差し替えた API に問い合わせる
      expect(mocks.getQuotation).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    });

    it('権限を持たない利用者には内容を出さず、権限が無い旨を出す', () => {
      renderRoute(DETAIL_PATH, url, ['project:read']);

      expect(screen.getByRole('alert')).toHaveTextContent(NO_PERMISSION_MESSAGE);
      expect(screen.queryByRole('heading', { name: '見積の詳細' })).not.toBeInTheDocument();
    });
  });
});
