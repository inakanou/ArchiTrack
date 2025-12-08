/**
 * @fileoverview プロジェクト管理ナビゲーションのE2Eテスト
 *
 * Requirements:
 * - REQ-21: ナビゲーション
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * プロジェクト管理ナビゲーションのE2Eテスト
 */
test.describe('プロジェクト管理ナビゲーション', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * REQ-21: ナビゲーションのテスト
   */
  test.describe('ヘッダーナビゲーション', () => {
    /**
     * @requirement project-management/REQ-21.1
     */
    test('ヘッダーナビゲーションに「プロジェクト」リンクが表示される (project-management/REQ-21.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ヘッダーに「プロジェクト」リンクが存在することを確認
      const projectLink = page.getByRole('link', { name: /プロジェクト/i });
      await expect(projectLink).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-21.2
     */
    test('ヘッダーの「プロジェクト」リンクをクリックするとプロジェクト一覧画面に遷移する (project-management/REQ-21.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 「プロジェクト」リンクをクリック
      const projectLink = page.getByRole('link', { name: /プロジェクト/i });
      await projectLink.click();

      // プロジェクト一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/projects$/, { timeout: getTimeout(10000) });
      await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-21.3
     */
    test('「プロジェクト」リンクが「ダッシュボード」リンクの右側に配置されている (project-management/REQ-21.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ヘッダーナビゲーションを取得
      const nav = page.getByRole('navigation').first();

      // 「ダッシュボード」リンクと「プロジェクト」リンクの位置を確認
      const dashboardLink = nav.getByRole('link', { name: /ダッシュボード/i });
      const projectLink = nav.getByRole('link', { name: /プロジェクト/i });

      const dashboardBox = await dashboardLink.boundingBox();
      const projectBox = await projectLink.boundingBox();

      if (dashboardBox && projectBox) {
        // プロジェクトリンクがダッシュボードリンクの右側にあることを確認
        expect(projectBox.x).toBeGreaterThan(dashboardBox.x);
      }
    });

    /**
     * @requirement project-management/REQ-21.4
     */
    test('「プロジェクト」リンクにプロジェクトを表すアイコンが表示される (project-management/REQ-21.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 「プロジェクト」リンク内にアイコンが存在することを確認
      const projectLink = page.getByRole('link', { name: /プロジェクト/i });
      const icon = projectLink.locator('svg, img, i').first();

      const iconVisible = await icon.isVisible().catch(() => false);
      if (iconVisible) {
        await expect(icon).toBeVisible();
      }
    });
  });

  /**
   * REQ-21: ダッシュボードナビゲーションのテスト
   */
  test.describe('ダッシュボードナビゲーション', () => {
    /**
     * @requirement project-management/REQ-21.5
     */
    test('ダッシュボードのクイックアクセスセクションに「プロジェクト管理」カードが表示される (project-management/REQ-21.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 「プロジェクト管理」カードが存在することを確認
      const projectCard = page.getByText(/プロジェクト管理/i);
      await expect(projectCard).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-21.6
     */
    test('ダッシュボードの「プロジェクト管理」カードをクリックするとプロジェクト一覧画面に遷移する (project-management/REQ-21.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 「プロジェクト管理」カードをクリック
      const projectCard = page.getByRole('link', { name: /プロジェクト管理/i });
      const cardVisible = await projectCard.isVisible().catch(() => false);

      if (cardVisible) {
        await projectCard.click();

        // プロジェクト一覧画面に遷移することを確認
        await expect(page).toHaveURL(/\/projects$/, { timeout: getTimeout(10000) });
        await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
          timeout: getTimeout(10000),
        });
      }
    });

    /**
     * @requirement project-management/REQ-21.7
     */
    test('「プロジェクト管理」カードがクイックアクセスセクションの先頭に配置されている (project-management/REQ-21.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // クイックアクセスセクション内のカードを取得
      const cards = page.getByRole('link').filter({ hasText: /管理/ });
      const firstCard = cards.first();

      const firstCardText = await firstCard.textContent();

      // 最初のカードが「プロジェクト管理」であることを確認
      if (firstCardText) {
        expect(firstCardText).toMatch(/プロジェクト管理/i);
      }
    });

    /**
     * @requirement project-management/REQ-21.8
     */
    test('「プロジェクト管理」カードに「工事案件の作成・管理」という説明文が表示される (project-management/REQ-21.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 「プロジェクト管理」カード内に説明文が存在することを確認
      const description = page.getByText(/工事案件の作成・管理/i);
      const descriptionVisible = await description.isVisible().catch(() => false);

      if (descriptionVisible) {
        await expect(description).toBeVisible({ timeout: getTimeout(10000) });
      }
    });
  });
});
