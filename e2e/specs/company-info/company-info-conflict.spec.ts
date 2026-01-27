/**
 * @fileoverview 自社情報の楽観的排他制御・未保存確認ダイアログのE2Eテスト
 *
 * 自社情報機能の競合検出と未保存確認機能をテストします。
 *
 * Requirements:
 * - Requirement 2.7: 楽観的排他制御（versionフィールド）を実装し、同時更新による競合を検出する
 * - Requirement 2.8: 楽観的排他制御で競合が検出された場合、エラーを表示する
 * - Requirement 3.4: フォームに未保存の変更がある状態でページを離れようとしたとき、確認ダイアログを表示する
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

test.describe('自社情報の楽観的排他制御・未保存確認', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  /**
   * Requirement 2.7, 2.8: 楽観的排他制御
   */
  test.describe('Requirement 2.7, 2.8: 楽観的排他制御', () => {
    /**
     * @requirement company-info/REQ-2.7, REQ-2.8
     *
     * このテストは実際の競合状況をシミュレートするため、
     * 2つのブラウザコンテキストで同時に更新を試みます。
     */
    test('REQ-2.7, REQ-2.8: 楽観的排他制御で競合が検出された場合、エラーメッセージを表示する', async ({
      browser,
    }) => {
      // 2つのコンテキストを作成して同時更新をシミュレート
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      try {
        // 両方のコンテキストでログイン
        await loginAsUser(page1, 'REGULAR_USER');
        await loginAsUser(page2, 'REGULAR_USER');

        // 両方のページで自社情報を開く
        await page1.goto('/company-info');
        await page2.goto('/company-info');

        await page1.waitForLoadState('networkidle');
        await page2.waitForLoadState('networkidle');

        // 両方のページでフォームが読み込まれるまで待機
        await expect(page1.getByLabel(/会社名/)).toBeVisible({ timeout: getTimeout(10000) });
        await expect(page2.getByLabel(/会社名/)).toBeVisible({ timeout: getTimeout(10000) });

        // page1で更新して保存
        const companyNameField1 = page1.getByLabel(/会社名/);
        await companyNameField1.clear();
        await companyNameField1.fill('ユーザー1による更新');

        const saveButton1 = page1.getByRole('button', { name: /保存/ });
        await saveButton1.click();

        // page1の保存成功を確認
        await expect(page1.getByText(/自社情報を保存しました/)).toBeVisible({
          timeout: getTimeout(10000),
        });

        // page2で更新して保存（競合が発生するはず）
        const companyNameField2 = page2.getByLabel(/会社名/);
        await companyNameField2.clear();
        await companyNameField2.fill('ユーザー2による更新（競合）');

        const saveButton2 = page2.getByRole('button', { name: /保存/ });
        await saveButton2.click();

        // 競合エラーメッセージが表示されることを確認
        await expect(
          page2.getByText(/他のユーザーによって更新されました|画面を更新してください|競合/)
        ).toBeVisible({
          timeout: getTimeout(10000),
        });
      } finally {
        await context1.close();
        await context2.close();
      }
    });
  });

  /**
   * Requirement 3.4: 未保存確認ダイアログ
   */
  test.describe('Requirement 3.4: 未保存確認ダイアログ', () => {
    /**
     * @requirement company-info/REQ-3.4
     */
    test('REQ-3.4: フォームに未保存の変更がある状態でページを離れようとしたとき、確認ダイアログを表示する', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // フォームに変更を加える
      const companyNameField = page.getByLabel(/会社名/);
      await companyNameField.clear();
      await companyNameField.fill('未保存テスト株式会社');

      // 別のページに遷移しようとする
      const dashboardLink = page.getByRole('link', { name: /ダッシュボード/ });
      await dashboardLink.click();

      // 確認ダイアログが表示されることを確認
      const dialog = page.locator(
        '[role="dialog"], [role="alertdialog"], [class*="dialog"], [class*="Dialog"], [class*="modal"], [class*="Modal"]'
      );
      await expect(dialog.first()).toBeVisible({ timeout: getTimeout(5000) });

      // ダイアログに「変更が保存されていません」のようなメッセージがあることを確認
      await expect(page.getByText(/変更.*保存.*ない|ページを離れ/)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement company-info/REQ-3.4
     */
    test('REQ-3.4: 確認ダイアログで「このページにとどまる」を選択するとページに留まる', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // フォームに変更を加える
      const companyNameField = page.getByLabel(/会社名/);
      await companyNameField.clear();
      await companyNameField.fill('とどまるテスト株式会社');

      // 別のページに遷移しようとする
      const dashboardLink = page.getByRole('link', { name: /ダッシュボード/ });
      await dashboardLink.click();

      // ダイアログが表示されるまで待機
      const stayButton = page.getByRole('button', { name: /とどまる|キャンセル|いいえ/i });
      await expect(stayButton).toBeVisible({ timeout: getTimeout(5000) });

      // 「とどまる」ボタンをクリック
      await stayButton.click();

      // 自社情報ページに留まっていることを確認
      await expect(page).toHaveURL(/\/company-info/, { timeout: getTimeout(5000) });

      // 入力値が保持されていることを確認
      await expect(companyNameField).toHaveValue('とどまるテスト株式会社');
    });

    /**
     * @requirement company-info/REQ-3.4
     */
    test('REQ-3.4: 確認ダイアログで「ページを離れる」を選択するとページを離れる', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // フォームに変更を加える
      const companyNameField = page.getByLabel(/会社名/);
      await companyNameField.clear();
      await companyNameField.fill('離れるテスト株式会社');

      // 別のページに遷移しようとする
      const dashboardLink = page.getByRole('link', { name: /ダッシュボード/ });
      await dashboardLink.click();

      // ダイアログが表示されるまで待機
      const leaveButton = page.getByRole('button', { name: /離れる|はい|確認/i });
      await expect(leaveButton).toBeVisible({ timeout: getTimeout(5000) });

      // 「ページを離れる」ボタンをクリック
      await leaveButton.click();

      // ダッシュボードに遷移することを確認
      await expect(page).toHaveURL(/^\/$/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement company-info/REQ-3.4
     */
    test('REQ-3.4: 保存後は未保存確認ダイアログが表示されない', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/company-info');
      await page.waitForLoadState('networkidle');

      // フォームに変更を加える
      const companyNameField = page.getByLabel(/会社名/);
      await companyNameField.clear();
      await companyNameField.fill('保存済みテスト株式会社');

      // 保存する
      const saveButton = page.getByRole('button', { name: /保存/ });
      await saveButton.click();

      // 保存成功を確認
      await expect(page.getByText(/自社情報を保存しました/)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 別のページに遷移
      const dashboardLink = page.getByRole('link', { name: /ダッシュボード/ });
      await dashboardLink.click();

      // 確認ダイアログなしでダッシュボードに遷移することを確認
      await expect(page).toHaveURL(/^\/$/, { timeout: getTimeout(10000) });
    });
  });

  });

