/**
 * @fileoverview 現場調査アクセス制御のE2Eテスト
 *
 * Requirements coverage (site-survey):
 * - REQ-12.1: プロジェクトへのアクセス権を持つユーザーが現場調査を閲覧可能
 * - REQ-12.2: プロジェクトへの編集権限を持つユーザーが現場調査の作成・編集・削除を許可
 * - REQ-12.3: 適切な権限を持たないユーザーの操作拒否とエラーメッセージ表示
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

test.describe('現場調査アクセス制御', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test.describe('事前準備', () => {
    test('テスト用プロジェクトと現場調査を作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `アクセス制御テスト用プロジェクト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const salesPersonValue = await salesPersonSelect.inputValue();
      if (!salesPersonValue) {
        const options = await salesPersonSelect.locator('option').all();
        if (options.length > 1 && options[1]) {
          const firstUserOption = await options[1].getAttribute('value');
          if (firstUserOption) {
            await salesPersonSelect.selectOption(firstUserOption);
          }
        }
      }

      const createProjectPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createProjectPromise;

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const projectUrl = page.url();
      const projectMatch = projectUrl.match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = projectMatch?.[1] ?? null;
      expect(createdProjectId).toBeTruthy();

      // 現場調査作成
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      const surveyName = `アクセス制御テスト用現場調査_${Date.now()}`;
      await page.getByLabel(/調査名/i).fill(surveyName);
      await page.getByLabel(/調査日/i).fill(new Date().toISOString().split('T')[0]!);

      const createSurveyPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/') &&
          response.url().includes('site-surveys') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createSurveyPromise;

      await page.waitForURL(/\/site-surveys\/[0-9a-f-]+$/);
      const surveyUrl = page.url();
      const surveyMatch = surveyUrl.match(/\/site-surveys\/([0-9a-f-]+)$/);
      createdSurveyId = surveyMatch?.[1] ?? null;
      expect(createdSurveyId).toBeTruthy();
    });
  });

  /**
   * @requirement site-survey/REQ-12.1
   */
  test.describe('閲覧権限', () => {
    test('プロジェクトにアクセス可能なユーザーは現場調査を閲覧できる (site-survey/REQ-12.1)', async ({
      page,
    }) => {
      if (!createdProjectId || !createdSurveyId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 現場調査詳細ページにアクセス
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 現場調査情報が表示されることを確認
      await expect(page.getByText(/アクセス制御テスト用現場調査/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // エラーメッセージが表示されないことを確認
      await expect(page.getByText(/アクセス拒否|権限がありません|403/i)).not.toBeVisible({
        timeout: getTimeout(3000),
      });
    });

    test('プロジェクト一覧から現場調査一覧へアクセスできる (site-survey/REQ-12.1)', async ({
      page,
    }) => {
      if (!createdProjectId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 現場調査一覧ページにアクセス
      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // 一覧が表示されることを確認
      await expect(page.getByRole('heading', { name: /現場調査/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 作成した現場調査が表示されることを確認
      await expect(page.getByText(/アクセス制御テスト用現場調査/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * @requirement site-survey/REQ-12.2
   */
  test.describe('編集権限', () => {
    test('編集権限を持つユーザーは現場調査を作成できる (site-survey/REQ-12.2)', async ({
      page,
    }) => {
      if (!createdProjectId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 新規作成ページにアクセス
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      // 作成フォームが表示されることを確認
      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 作成ボタンが有効であることを確認
      const createButton = page.getByRole('button', { name: /^作成$/i });
      await expect(createButton).toBeVisible();
      await expect(createButton).not.toBeDisabled();
    });

    test('編集権限を持つユーザーは現場調査を編集できる (site-survey/REQ-12.2)', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 編集ページにアクセス
      await page.goto(`/site-surveys/${createdSurveyId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集フォームが表示されることを確認
      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 保存ボタンが有効であることを確認
      const saveButton = page.getByRole('button', { name: /保存|更新/i });
      await expect(saveButton).toBeVisible();
      await expect(saveButton).not.toBeDisabled();
    });

    test('編集権限を持つユーザーは削除ボタンが表示される (site-survey/REQ-12.2)', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 詳細ページにアクセス
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 削除ボタンが表示されることを確認
      const deleteButton = page.getByRole('button', { name: /削除/i });
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  /**
   * @requirement site-survey/REQ-12.3
   */
  test.describe('権限拒否', () => {
    test('未認証ユーザーは現場調査にアクセスできない (site-survey/REQ-12.3)', async ({
      page,
      context,
    }) => {
      if (!createdSurveyId) {
        test.skip();
        return;
      }

      // ログアウト状態（Cookieクリア済み）
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      // 現場調査詳細ページにアクセス
      await page.goto(`/site-surveys/${createdSurveyId}`);

      // ログインページにリダイレクトされるか、エラーメッセージが表示されることを確認
      const isRedirectedToLogin = await page
        .waitForURL(/\/login/, { timeout: getTimeout(10000) })
        .then(() => true)
        .catch(() => false);

      const hasUnauthorizedError = await page
        .getByText(/ログインが必要|認証エラー|401|Unauthorized/i)
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      expect(isRedirectedToLogin || hasUnauthorizedError).toBeTruthy();
    });

    test('未認証ユーザーは現場調査一覧にアクセスできない (site-survey/REQ-12.3)', async ({
      page,
      context,
    }) => {
      if (!createdProjectId) {
        test.skip();
        return;
      }

      // ログアウト状態
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      // 現場調査一覧ページにアクセス
      await page.goto(`/projects/${createdProjectId}/site-surveys`);

      // ログインページにリダイレクトされるか、エラーメッセージが表示されることを確認
      const isRedirectedToLogin = await page
        .waitForURL(/\/login/, { timeout: getTimeout(10000) })
        .then(() => true)
        .catch(() => false);

      const hasUnauthorizedError = await page
        .getByText(/ログインが必要|認証エラー|401|Unauthorized/i)
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      expect(isRedirectedToLogin || hasUnauthorizedError).toBeTruthy();
    });

    test('未認証ユーザーは現場調査作成ページにアクセスできない (site-survey/REQ-12.3)', async ({
      page,
      context,
    }) => {
      if (!createdProjectId) {
        test.skip();
        return;
      }

      // ログアウト状態
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      // 現場調査作成ページにアクセス
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);

      // ログインページにリダイレクトされるか、エラーメッセージが表示されることを確認
      const isRedirectedToLogin = await page
        .waitForURL(/\/login/, { timeout: getTimeout(10000) })
        .then(() => true)
        .catch(() => false);

      const hasUnauthorizedError = await page
        .getByText(/ログインが必要|認証エラー|401|Unauthorized/i)
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      expect(isRedirectedToLogin || hasUnauthorizedError).toBeTruthy();
    });
  });

  test.describe('クリーンアップ', () => {
    test('作成したデータを削除する', async ({ page, context }) => {
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      if (createdSurveyId) {
        await page.goto(`/site-surveys/${createdSurveyId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i }).first();
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          const confirmButton = page.getByRole('button', { name: /^削除する$|^削除$/i });
          if (await confirmButton.isVisible()) {
            await confirmButton.click();
            await page
              .waitForURL(/\/site-surveys$/, { timeout: getTimeout(15000) })
              .catch(() => {});
          }
        }
      }

      if (createdProjectId) {
        await page.goto(`/projects/${createdProjectId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i }).first();
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          const confirmButton = page
            .getByTestId('focus-manager-overlay')
            .getByRole('button', { name: /^削除$/i });
          if (await confirmButton.isVisible()) {
            await confirmButton.click();
            await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) }).catch(() => {});
          }
        }
      }
    });
  });
});
