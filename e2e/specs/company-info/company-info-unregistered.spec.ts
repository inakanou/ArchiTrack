/**
 * @fileoverview 自社情報未登録状態のE2Eテスト
 *
 * 自社情報が未登録の状態でのフォーム表示・操作をテストします。
 * このテストファイルは最初にcompany_infoテーブルをクリアして未登録状態を作成します。
 *
 * Requirements:
 * - Requirement 1.4: 自社情報が未登録の場合、空のフォームを表示する
 * - Requirement 3.3: 自社情報が未登録の状態でリセットボタンをクリックした場合、フォームを空の状態にリセットする
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient } from '../../fixtures/database';

test.describe('自社情報未登録状態のテスト', () => {
  // このテストスイートは独立して実行し、未登録状態をテストする
  test.describe.configure({ mode: 'serial' });

  /**
   * テストスイート開始前にcompany_infoテーブルをクリアして未登録状態を作成
   */
  test.beforeAll(async () => {
    const prisma = getPrismaClient();
    // company_infoテーブルを直接クリア
    await prisma.companyInfo.deleteMany();
  });

  test.beforeEach(async ({ context, page }) => {
    // CI並列実行時に他テストがcompany_infoを作成する場合があるため、毎回クリアする
    const prisma = getPrismaClient();
    await prisma.companyInfo.deleteMany();

    await context.clearCookies();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  /**
   * Requirement 1.4: 未登録時の空フォーム表示
   */
  test.describe('Requirement 1.4: 未登録時の空フォーム表示', () => {
    /**
     * @requirement company-info/REQ-1.4
     */
    test('REQ-1.4: 自社情報が未登録の場合、空のフォームを表示する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/会社名/)).toBeVisible({ timeout: getTimeout(10000) });

      // 全てのフィールドが空であることを確認
      await expect(page.getByLabel(/会社名/)).toHaveValue('');
      await expect(page.getByLabel(/住所/)).toHaveValue('');
      await expect(page.getByLabel(/代表者/)).toHaveValue('');
      await expect(page.getByLabel(/電話番号/)).toHaveValue('');
      await expect(page.getByLabel(/FAX/)).toHaveValue('');
      await expect(page.getByLabel(/メールアドレス/)).toHaveValue('');
      await expect(page.getByLabel(/適格請求書発行事業者登録番号/)).toHaveValue('');
    });
  });

  /**
   * Requirement 3.3: 未登録時のリセット操作
   */
  test.describe('Requirement 3.3: 未登録時のリセット操作', () => {
    /**
     * @requirement company-info/REQ-3.3
     */
    test('REQ-3.3: 自社情報が未登録の状態でリセットボタンをクリックした場合、フォームを空の状態にリセットする', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/会社名/)).toBeVisible({ timeout: getTimeout(10000) });

      // フォームに値を入力
      await page.getByLabel(/会社名/).fill('テスト会社');
      await page.getByLabel(/住所/).fill('テスト住所');
      await page.getByLabel(/代表者/).fill('テスト代表者');

      // 入力値が反映されていることを確認
      await expect(page.getByLabel(/会社名/)).toHaveValue('テスト会社');

      // リセットボタンをクリック
      const resetButton = page.getByRole('button', { name: /リセット/ });
      await resetButton.click();

      // フォームが空になることを確認
      await expect(page.getByLabel(/会社名/)).toHaveValue('', { timeout: getTimeout(5000) });
      await expect(page.getByLabel(/住所/)).toHaveValue('');
      await expect(page.getByLabel(/代表者/)).toHaveValue('');
    });
  });
});
