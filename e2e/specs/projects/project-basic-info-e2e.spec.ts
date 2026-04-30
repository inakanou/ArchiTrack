/**
 * @fileoverview プロジェクト基本情報セクションの日時フィールド非表示E2Eテスト
 *
 * Requirements coverage:
 * - REQ-34.1: 基本情報セクションから作成日時フィールドを非表示にする
 * - REQ-34.2: 基本情報セクションから更新日時フィールドを非表示にする
 *
 * 検証ポイント: プロジェクト詳細画面の「基本情報」セクション内に
 * 「作成日時」「更新日時」のラベルが描画されていないこと。
 */

import { test, expect, type Page, type Response } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

test.describe('プロジェクト基本情報セクションの日時フィールド非表示', () => {
  test.describe.configure({ mode: 'serial' });

  let testProjectId: string | null = null;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * テスト用プロジェクトを作成
   */
  async function createTestProject(page: Page): Promise<string> {
    await expect(page.getByRole('button', { name: /Test User/i })).toBeVisible({
      timeout: getTimeout(15000),
    });

    await page.goto('/projects/new');
    await page.waitForLoadState('networkidle');
    await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

    const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
    await expect(salesPersonSelect).toBeVisible({ timeout: getTimeout(10000) });
    await expect(page.getByText('読み込み中...').first()).not.toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect
      .poll(async () => (await salesPersonSelect.locator('option').all()).length, {
        timeout: getTimeout(30000),
      })
      .toBeGreaterThanOrEqual(2);

    await page.getByLabel(/プロジェクト名/i).fill(`基本情報日時テスト_${Date.now()}`);
    await page.getByLabel(/現場住所/i).fill('東京都渋谷区基本情報1-2-3');

    const v = await salesPersonSelect.inputValue();
    if (!v) {
      const opts = await salesPersonSelect.locator('option').all();
      if (opts.length > 1 && opts[1]) {
        const opt = await opts[1].getAttribute('value');
        if (opt) await salesPersonSelect.selectOption(opt);
      }
    }

    const createPromise = page.waitForResponse(
      (response: Response) =>
        response.url().includes('/api/projects') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
      { timeout: getTimeout(30000) }
    );

    await page.getByRole('button', { name: /^作成$/i }).click();
    await createPromise;

    await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
    const url = page.url();
    const match = url.match(/\/projects\/([0-9a-f-]+)$/);
    return match?.[1] ?? '';
  }

  /**
   * @requirement project-management/REQ-34.1: 基本情報セクションから作成日時フィールドを非表示にする
   */
  test('基本情報セクションに作成日時フィールドが表示されない (project-management/REQ-34.1)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    testProjectId = await createTestProject(page);

    await page.goto(`/projects/${testProjectId}`);
    await page.waitForLoadState('networkidle');

    // 基本情報セクション（h2 = 基本情報）を取得し、その兄弟の grid 領域を限定する
    const basicInfoHeading = page.getByRole('heading', { name: '基本情報', level: 2 });
    await expect(basicInfoHeading).toBeVisible({ timeout: getTimeout(10000) });

    // 基本情報セクション全体を section 要素として取得
    const basicInfoSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: '基本情報', level: 2 }) });
    await expect(basicInfoSection).toBeVisible({ timeout: getTimeout(10000) });

    // 「作成日時」というフィールドラベルが基本情報セクション内に存在しないことを確認
    const createdAtLabel = basicInfoSection.getByText('作成日時', { exact: true });
    await expect(createdAtLabel).toHaveCount(0);
  });

  /**
   * @requirement project-management/REQ-34.2: 基本情報セクションから更新日時フィールドを非表示にする
   */
  test('基本情報セクションに更新日時フィールドが表示されない (project-management/REQ-34.2)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    if (!testProjectId) {
      testProjectId = await createTestProject(page);
    }

    await page.goto(`/projects/${testProjectId}`);
    await page.waitForLoadState('networkidle');

    const basicInfoHeading = page.getByRole('heading', { name: '基本情報', level: 2 });
    await expect(basicInfoHeading).toBeVisible({ timeout: getTimeout(10000) });

    const basicInfoSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: '基本情報', level: 2 }) });
    await expect(basicInfoSection).toBeVisible({ timeout: getTimeout(10000) });

    // 「更新日時」というフィールドラベルが基本情報セクション内に存在しないことを確認
    const updatedAtLabel = basicInfoSection.getByText('更新日時', { exact: true });
    await expect(updatedAtLabel).toHaveCount(0);
  });
});
