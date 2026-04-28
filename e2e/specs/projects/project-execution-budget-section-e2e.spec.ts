/**
 * @fileoverview プロジェクト詳細画面の実行予算セクション E2Eテスト
 *
 * Requirements coverage:
 * - REQ-40.8: 実行予算データをロード中の場合、スケルトンローダーを表示する
 * - REQ-40.9: 実行予算セクションに「すべて見る」リンクを表示しない
 * - REQ-40.10: 実行予算セクションのUIを既存の契約書セクションと同様のスタイルで提供する
 *
 * 実行予算は新規プロジェクトには未作成のため、空状態（「実行予算はまだありません」表示）が
 * テスト対象となる。
 */

import { test, expect, type Page, type Response } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

test.describe('プロジェクト詳細画面 - 実行予算セクション', () => {
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
    await expect(page.getByText('読み込み中...').first()).not.toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect
      .poll(async () => (await salesPersonSelect.locator('option').all()).length, {
        timeout: getTimeout(30000),
      })
      .toBeGreaterThanOrEqual(2);

    await page.getByLabel(/プロジェクト名/i).fill(`実行予算セクションテスト_${Date.now()}`);
    await page.getByLabel(/現場住所/i).fill('東京都渋谷区実行予算1-2-3');

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

  test('事前準備: テストプロジェクトを作成', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    testProjectId = await createTestProject(page);
    expect(testProjectId).toBeTruthy();
  });

  /**
   * @requirement project-management/REQ-40.8: 実行予算データをロード中はスケルトンローダーを表示する
   *
   * 検証方針: detail-summary API を意図的に遅延させ、初期描画のスケルトン
   * （data-testid="execution-budget-section-skeleton"）が出現することを確認する。
   */
  test('実行予算データのロード中にスケルトンローダーが表示される (project-management/REQ-40.8)', async ({
    page,
  }) => {
    expect(testProjectId, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    // detail-summary API のレスポンスを意図的に遅延させる
    await page.route(/\/api\/projects\/[0-9a-f-]+\/detail-summary/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await page.goto(`/projects/${testProjectId}`);

    // 実行予算セクションのスケルトンローダーが表示されること
    const skeleton = page.getByTestId('execution-budget-section-skeleton');
    await expect(skeleton).toBeVisible({ timeout: getTimeout(5000) });

    // ロード完了後にスケルトンが消え、空状態メッセージが表示される
    await page.waitForLoadState('networkidle');
    await expect(skeleton).toHaveCount(0, { timeout: getTimeout(15000) });
    const section = page.getByTestId('execution-budget-section');
    await expect(section.getByText('実行予算はまだありません')).toBeVisible({
      timeout: getTimeout(10000),
    });
  });

  /**
   * @requirement project-management/REQ-40.9: 実行予算セクションに「すべて見る」リンクを表示しない
   */
  test('実行予算セクションに「すべて見る」リンクが表示されない (project-management/REQ-40.9)', async ({
    page,
  }) => {
    expect(testProjectId, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${testProjectId}`);
    await page.waitForLoadState('networkidle');

    const section = page.getByTestId('execution-budget-section');
    await expect(section).toBeVisible({ timeout: getTimeout(10000) });

    // セクション内に「すべて見る」リンクが存在しない
    const viewAllLink = section.getByRole('link', { name: /すべて見る/ });
    await expect(viewAllLink).toHaveCount(0);
  });

  /**
   * @requirement project-management/REQ-40.10: 実行予算セクションのUIを既存の契約書セクションと同様のスタイルで提供する
   *
   * 検証方針: 契約書セクション (ContractSectionCard) と同様の section + role=region 構造、
   * セクションタイトル「実行予算」、空状態の場合は新規作成ボタンが描画されていることを確認する。
   */
  test('実行予算セクションが契約書セクションと同様の構造で表示される (project-management/REQ-40.10)', async ({
    page,
  }) => {
    expect(testProjectId, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${testProjectId}`);
    await page.waitForLoadState('networkidle');

    // 1. data-testid="execution-budget-section" を持つ section 要素として表示される
    const section = page.getByTestId('execution-budget-section');
    await expect(section).toBeVisible({ timeout: getTimeout(10000) });

    // 2. role="region" でアクセシブルな領域として宣言されている (契約書セクションと同様)
    expect(await section.getAttribute('role')).toBe('region');

    // 3. セクションタイトル「実行予算」が h3 として表示されている
    const title = section.getByRole('heading', { name: '実行予算', level: 3 });
    await expect(title).toBeVisible();

    // 4. 空状態時は「実行予算はまだありません」と「新規作成」リンクが表示される (契約書セクションと同等の空状態UI)
    await expect(section.getByText('実行予算はまだありません')).toBeVisible();
    const createLink = section.getByRole('link', { name: '新規作成' });
    await expect(createLink).toBeVisible();
    const href = await createLink.getAttribute('href');
    expect(href).toContain('execution-budget');
  });
});
