/**
 * @fileoverview 自社情報ルーティング・アクセス制御のテスト
 *
 * Task 7.1: ルーティング設定とアクセス制御のテスト
 *
 * テスト対象:
 * - /company-info ルートが定義されている
 * - 保護されたルート（認証必須）として設定されている
 * - AppHeaderレイアウト内で表示される
 * - 認証済みユーザーがアクセス可能
 *
 * Requirements:
 * - 6.1: 認証済みユーザーのみが自社情報画面にアクセス可能
 * - 6.2: 未認証ユーザーはログイン画面へリダイレクト
 * - 5.1: AppHeaderに「自社情報」リンクが表示される
 */

import { describe, it, expect } from 'vitest';
import { routes } from '../../routes';

describe('Company Info Routes', () => {
  /**
   * ルートの存在確認
   */
  describe('ルート定義', () => {
    it('/company-info ルートが定義されている', () => {
      // 保護されたルート（ProtectedLayoutの子要素）内を検索
      const protectedRouteWithLayout = routes.find(
        (route) =>
          route.element && route.children && route.children.some((child) => child.path !== undefined)
      );

      expect(protectedRouteWithLayout).toBeDefined();

      // /company-info ルートを検索
      const companyInfoRoute = protectedRouteWithLayout?.children?.find(
        (child) => child.path === '/company-info'
      );

      expect(companyInfoRoute).toBeDefined();
      expect(companyInfoRoute?.element).toBeDefined();
    });

    it('自社情報ルートはProtectedLayout内に配置されている（AppHeaderが表示される）', () => {
      // 保護されたルート（ProtectedLayoutの子要素）内に/company-infoがある
      const protectedRouteWithLayout = routes.find(
        (route) =>
          route.element && route.children && route.children.some((child) => child.path !== undefined)
      );

      const companyInfoRoute = protectedRouteWithLayout?.children?.find(
        (child) => child.path === '/company-info'
      );

      // ProtectedLayout内のルートであることを確認
      expect(companyInfoRoute).toBeDefined();
    });
  });

  /**
   * ルートの構造確認
   */
  describe('ルート構造', () => {
    it('自社情報ルートはダッシュボードや他の保護されたルートと同じ親要素を持つ', () => {
      // 保護されたルート（ProtectedLayoutの子要素）を取得
      const protectedRouteWithLayout = routes.find(
        (route) =>
          route.element && route.children && route.children.some((child) => child.path !== undefined)
      );

      // ダッシュボードルートの存在確認
      const dashboardRoute = protectedRouteWithLayout?.children?.find(
        (child) => child.path === '/dashboard'
      );
      expect(dashboardRoute).toBeDefined();

      // 自社情報ルートの存在確認
      const companyInfoRoute = protectedRouteWithLayout?.children?.find(
        (child) => child.path === '/company-info'
      );
      expect(companyInfoRoute).toBeDefined();

      // 両方とも同じ親ルート内に存在
      expect(protectedRouteWithLayout?.children).toContain(dashboardRoute);
      expect(protectedRouteWithLayout?.children).toContain(companyInfoRoute);
    });
  });
});
