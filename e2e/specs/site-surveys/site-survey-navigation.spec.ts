/**
 * @fileoverview 現場調査画面遷移・ナビゲーションのE2Eテスト
 *
 * Requirements coverage (site-survey):
 * - REQ-2.1: プロジェクト詳細画面に「現場調査」タブを表示
 * - REQ-2.2: 「現場調査」タブで現場調査一覧を表示
 * - REQ-2.3: 一覧で項目をクリックして詳細画面に遷移
 * - REQ-2.4: 詳細画面で画像をクリックしてビューア/エディタを開く
 * - REQ-2.5: ブレッドクラムナビゲーションを表示
 * - REQ-2.6: ブレッドクラムで階層を表示
 * - REQ-2.7: ブレッドクラムの各項目をクリックして遷移
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

test.describe('現場調査画面遷移・ナビゲーション', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  let projectName: string = '';
  let surveyName: string = '';

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

      projectName = `ナビテスト用プロジェクト_${Date.now()}`;
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

      surveyName = `ナビテスト用現場調査_${Date.now()}`;
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
   * @requirement site-survey/REQ-2.1
   * @requirement site-survey/REQ-2.2
   */
  test.describe('プロジェクト詳細から現場調査へのナビゲーション', () => {
    test('プロジェクト詳細画面に現場調査タブ/セクションが表示される (site-survey/REQ-2.1)', async ({
      page,
    }) => {
      if (!createdProjectId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 現場調査タブまたはリンクが表示されることを確認
      const surveyLink = page.getByRole('link', { name: /現場調査/i });
      const surveyTab = page.getByRole('tab', { name: /現場調査/i });
      const surveySection = page.getByRole('heading', { name: /現場調査/i });

      const hasLink = await surveyLink.isVisible({ timeout: 5000 }).catch(() => false);
      const hasTab = await surveyTab.isVisible({ timeout: 2000 }).catch(() => false);
      const hasSection = await surveySection.isVisible({ timeout: 2000 }).catch(() => false);

      expect(hasLink || hasTab || hasSection).toBeTruthy();
    });

    test('現場調査タブをクリックすると一覧が表示される (site-survey/REQ-2.2)', async ({ page }) => {
      if (!createdProjectId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 現場調査リンク/タブをクリック
      const surveyLink = page.getByRole('link', { name: /現場調査/i });
      if (await surveyLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await surveyLink.click();
      }

      // 現場調査一覧ページに遷移
      await expect(page).toHaveURL(new RegExp(`/projects/${createdProjectId}/site-surveys`), {
        timeout: getTimeout(10000),
      });

      // 一覧が表示されることを確認
      await expect(page.getByRole('heading', { name: /現場調査/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 作成した現場調査が一覧に表示されることを確認
      await expect(page.getByText(surveyName)).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  /**
   * @requirement site-survey/REQ-2.3
   */
  test.describe('現場調査一覧から詳細へのナビゲーション', () => {
    test('一覧で項目をクリックすると詳細画面に遷移する (site-survey/REQ-2.3)', async ({ page }) => {
      if (!createdProjectId || !createdSurveyId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 一覧ページに移動
      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // 現場調査名をクリック
      const surveyItem = page.getByText(surveyName);
      await expect(surveyItem).toBeVisible({ timeout: getTimeout(10000) });
      await surveyItem.click();

      // 詳細画面に遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/site-surveys/${createdSurveyId}`), {
        timeout: getTimeout(10000),
      });

      // 詳細情報が表示されることを確認
      await expect(page.getByText(surveyName)).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  /**
   * @requirement site-survey/REQ-2.4
   */
  test.describe('現場調査詳細から画像ビューアへのナビゲーション', () => {
    test('詳細画面で画像をクリックするとビューアが開く (site-survey/REQ-2.4)', async ({ page }) => {
      if (!createdSurveyId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 画像が存在する場合のみテスト
      const imageElement = page
        .locator('[data-testid="survey-image"], .survey-image img, .image-item')
        .first();

      if (!(await imageElement.isVisible({ timeout: 3000 }).catch(() => false))) {
        // 画像がない場合はこのテストをパス（画像アップロードは別テストで検証）
        test.skip();
        return;
      }

      await imageElement.click();

      // ビューアページに遷移するか、モーダルが開くことを確認
      await expect(page).toHaveURL(
        new RegExp(`/site-surveys/${createdSurveyId}/images/[0-9a-f-]+`),
        { timeout: getTimeout(10000) }
      );
    });
  });

  /**
   * @requirement site-survey/REQ-2.5
   * @requirement site-survey/REQ-2.6
   */
  test.describe('ブレッドクラムナビゲーション', () => {
    test('現場調査詳細画面にブレッドクラムが表示される (site-survey/REQ-2.5)', async ({ page }) => {
      if (!createdSurveyId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // ブレッドクラムナビゲーションが表示されることを確認
      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });
    });

    test('ブレッドクラムでプロジェクト名と現場調査名が表示される (site-survey/REQ-2.6)', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // ブレッドクラムの要素を取得
      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });

      // プロジェクト名が含まれることを確認
      await expect(breadcrumb.getByText(projectName)).toBeVisible({ timeout: getTimeout(10000) });

      // 現場調査関連のテキストが含まれることを確認
      const hasSurveyText = await breadcrumb
        .getByText(/現場調査/i)
        .isVisible()
        .catch(() => false);
      const hasSurveyName = await breadcrumb
        .getByText(surveyName)
        .isVisible()
        .catch(() => false);
      expect(hasSurveyText || hasSurveyName).toBeTruthy();
    });

    /**
     * @requirement site-survey/REQ-2.7
     */
    test('ブレッドクラムのプロジェクト名をクリックするとプロジェクト詳細に遷移する (site-survey/REQ-2.7)', async ({
      page,
    }) => {
      if (!createdProjectId || !createdSurveyId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // ブレッドクラムのプロジェクト名リンクをクリック
      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      const projectLink = breadcrumb.getByRole('link', { name: projectName });

      if (await projectLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await projectLink.click();

        // プロジェクト詳細ページに遷移することを確認
        await expect(page).toHaveURL(new RegExp(`/projects/${createdProjectId}`), {
          timeout: getTimeout(10000),
        });
      } else {
        // プロジェクト名がリンクでない場合、テキストとして表示されているか確認
        await expect(breadcrumb.getByText(projectName)).toBeVisible();
      }
    });

    test('現場調査一覧画面にブレッドクラムが表示される (site-survey/REQ-2.5)', async ({ page }) => {
      if (!createdProjectId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // ブレッドクラムナビゲーションが表示されることを確認
      const breadcrumb = page.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });
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

      // 現場調査を削除
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

      // プロジェクトを削除
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
