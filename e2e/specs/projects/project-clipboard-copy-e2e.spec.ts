/**
 * @fileoverview プロジェクト基本情報のクリップボードコピーE2Eテスト
 *
 * Requirements coverage:
 * - REQ-33.1: プロジェクト名の横にクリップボードコピーボタンを表示
 * - REQ-33.2: 顧客名の横にクリップボードコピーボタンを表示
 * - REQ-33.3: 現場住所の横にクリップボードコピーボタンを表示
 * - REQ-33.4: プロジェクト名コピー時に「コピーしました」フィードバックを表示
 * - REQ-33.5: navigator.clipboard API を使用したコピー
 * - REQ-33.6: 顧客名コピー時に「コピーしました」フィードバックを表示
 * - REQ-33.7: 現場住所コピー時に「コピーしました」フィードバックを表示
 * - REQ-33.8: 空欄フィールドのコピーボタンを非表示
 * - REQ-33.9: コピーボタンにクリップボードアイコンとツールチップを表示
 *
 * クリップボードはブラウザの permissions API で `clipboard-read`, `clipboard-write` を
 * 付与してから検証する。
 */

import { test, expect, type Page, type Response } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

test.describe('プロジェクト基本情報のクリップボードコピー機能', () => {
  test.describe.configure({ mode: 'serial' });

  let testProjectIdWithCustomer: string | null = null;
  let testProjectIdWithoutCustomer: string | null = null;
  let createdTradingPartnerName: string | null = null;
  const siteAddressWithCustomer = '東京都渋谷区クリップ1-2-3';
  const siteAddressWithoutCustomer = '東京都新宿区クリップ4-5-6';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    // クリップボード権限を許可
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  /**
   * 顧客（取引先）を1件作成
   */
  async function createTradingPartnerForTest(page: Page): Promise<string> {
    const name = `クリップボードテスト取引先_${Date.now()}`;
    await page.goto('/trading-partners/new');
    await page.waitForLoadState('networkidle');

    await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });
    await page.getByLabel('取引先名').fill(name);
    await page.getByLabel('フリガナ', { exact: true }).fill('クリップボードテストトリヒキサキ');
    await page.getByRole('checkbox', { name: /顧客/i }).check();
    await page.getByLabel(/住所/i).fill('東京都港区取引先1-1-1');

    const createPromise = page.waitForResponse(
      (response: Response) =>
        response.url().includes('/api/trading-partners') &&
        response.request().method() === 'POST' &&
        (response.status() === 201 || response.status() === 200),
      { timeout: getTimeout(30000) }
    );

    await page.getByRole('button', { name: /^作成$/i }).click();
    const response = await createPromise;
    expect(response.ok()).toBeTruthy();

    return name;
  }

  /**
   * テスト用プロジェクトを作成（顧客選択あり/なしを切替可能）
   */
  async function createTestProject(
    page: Page,
    options: { tradingPartnerName?: string; siteAddress?: string }
  ): Promise<string> {
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

    const projectName = `クリップボードテスト_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await page.getByLabel(/プロジェクト名/i).fill(projectName);

    if (options.tradingPartnerName) {
      // 顧客名 (combobox) に名前の一部を入力して候補から選択
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await tradingPartnerInput.fill(options.tradingPartnerName.substring(0, 8));
      const optionItem = page.getByText(options.tradingPartnerName, { exact: true }).first();
      await expect(optionItem).toBeVisible({ timeout: getTimeout(10000) });
      await optionItem.click();
    }

    if (options.siteAddress) {
      await page.getByLabel(/現場住所/i).fill(options.siteAddress);
    }

    const salesPersonValue = await salesPersonSelect.inputValue();
    if (!salesPersonValue) {
      const opts = await salesPersonSelect.locator('option').all();
      if (opts.length > 1 && opts[1]) {
        const v = await opts[1].getAttribute('value');
        if (v) {
          await salesPersonSelect.selectOption(v);
        }
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

  test('事前準備: 顧客付き/顧客なしのテストプロジェクトを作成', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    createdTradingPartnerName = await createTradingPartnerForTest(page);

    testProjectIdWithCustomer = await createTestProject(page, {
      tradingPartnerName: createdTradingPartnerName,
      siteAddress: siteAddressWithCustomer,
    });
    expect(testProjectIdWithCustomer).toBeTruthy();

    testProjectIdWithoutCustomer = await createTestProject(page, {
      siteAddress: siteAddressWithoutCustomer,
    });
    expect(testProjectIdWithoutCustomer).toBeTruthy();
  });

  /**
   * @requirement project-management/REQ-33.1: プロジェクト名の横にクリップボードコピーボタンを表示する
   */
  test('プロジェクト名の横にクリップボードコピーボタンが表示される (project-management/REQ-33.1)', async ({
    page,
  }) => {
    expect(testProjectIdWithCustomer, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${testProjectIdWithCustomer}`);
    await page.waitForLoadState('networkidle');

    const copyButton = page.getByRole('button', { name: 'プロジェクト名をコピー' });
    await expect(copyButton).toBeVisible({ timeout: getTimeout(10000) });
  });

  /**
   * @requirement project-management/REQ-33.2: 顧客名の横にクリップボードコピーボタンを表示する
   */
  test('顧客名の横にクリップボードコピーボタンが表示される (project-management/REQ-33.2)', async ({
    page,
  }) => {
    expect(testProjectIdWithCustomer, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${testProjectIdWithCustomer}`);
    await page.waitForLoadState('networkidle');

    const copyButton = page.getByRole('button', { name: '顧客名をコピー' });
    await expect(copyButton).toBeVisible({ timeout: getTimeout(10000) });
  });

  /**
   * @requirement project-management/REQ-33.3: 現場住所の横にクリップボードコピーボタンを表示する
   */
  test('現場住所の横にクリップボードコピーボタンが表示される (project-management/REQ-33.3)', async ({
    page,
  }) => {
    expect(testProjectIdWithCustomer, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${testProjectIdWithCustomer}`);
    await page.waitForLoadState('networkidle');

    const copyButton = page.getByRole('button', { name: '現場住所をコピー' });
    await expect(copyButton).toBeVisible({ timeout: getTimeout(10000) });
  });

  /**
   * @requirement project-management/REQ-33.4: プロジェクト名コピー時に「コピーしました」フィードバックを表示する
   * @requirement project-management/REQ-33.5: navigator.clipboard API を使用してテキストをコピーする
   */
  test('プロジェクト名コピー時にクリップボードへ書き込まれ「コピーしました」が表示される (project-management/REQ-33.4, REQ-33.5)', async ({
    page,
  }) => {
    expect(testProjectIdWithCustomer, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${testProjectIdWithCustomer}`);
    await page.waitForLoadState('networkidle');

    // 表示されているプロジェクト名のテキストを取得
    const projectName = await page
      .locator('h1')
      .first()
      .textContent({ timeout: getTimeout(10000) });
    expect(projectName).toBeTruthy();

    const copyButton = page.getByRole('button', { name: 'プロジェクト名をコピー' });
    await expect(copyButton).toBeVisible({ timeout: getTimeout(10000) });
    await copyButton.click();

    // 「コピーしました」フィードバックが表示される (REQ-33.4)
    await expect(page.getByText('コピーしました').first()).toBeVisible({
      timeout: getTimeout(5000),
    });

    // navigator.clipboard 経由でテキストが書き込まれている (REQ-33.5)
    const clipboardText = await page.evaluate(async () => navigator.clipboard.readText());
    expect(clipboardText.length).toBeGreaterThan(0);
    expect(clipboardText).toContain('クリップボードテスト_');
  });

  /**
   * @requirement project-management/REQ-33.6: 顧客名コピー時に「コピーしました」フィードバックを表示する
   */
  test('顧客名コピー時にクリップボードへ書き込まれ「コピーしました」が表示される (project-management/REQ-33.6)', async ({
    page,
  }) => {
    expect(testProjectIdWithCustomer, 'テストデータが不足しています').toBeTruthy();
    expect(createdTradingPartnerName, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${testProjectIdWithCustomer}`);
    await page.waitForLoadState('networkidle');

    const copyButton = page.getByRole('button', { name: '顧客名をコピー' });
    await expect(copyButton).toBeVisible({ timeout: getTimeout(10000) });
    await copyButton.click();

    await expect(page.getByText('コピーしました').first()).toBeVisible({
      timeout: getTimeout(5000),
    });

    const clipboardText = await page.evaluate(async () => navigator.clipboard.readText());
    expect(clipboardText).toBe(createdTradingPartnerName);
  });

  /**
   * @requirement project-management/REQ-33.7: 現場住所コピー時に「コピーしました」フィードバックを表示する
   */
  test('現場住所コピー時にクリップボードへ書き込まれ「コピーしました」が表示される (project-management/REQ-33.7)', async ({
    page,
  }) => {
    expect(testProjectIdWithCustomer, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${testProjectIdWithCustomer}`);
    await page.waitForLoadState('networkidle');

    const copyButton = page.getByRole('button', { name: '現場住所をコピー' });
    await expect(copyButton).toBeVisible({ timeout: getTimeout(10000) });
    await copyButton.click();

    await expect(page.getByText('コピーしました').first()).toBeVisible({
      timeout: getTimeout(5000),
    });

    const clipboardText = await page.evaluate(async () => navigator.clipboard.readText());
    expect(clipboardText).toBe(siteAddressWithCustomer);
  });

  /**
   * @requirement project-management/REQ-33.8: 空欄フィールドのコピーボタンは非表示にする
   *
   * 顧客名未設定のプロジェクトでは「顧客名をコピー」ボタンが非表示であることを検証。
   */
  test('顧客名が空欄の場合、顧客名コピーボタンが非表示になる (project-management/REQ-33.8)', async ({
    page,
  }) => {
    expect(testProjectIdWithoutCustomer, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${testProjectIdWithoutCustomer}`);
    await page.waitForLoadState('networkidle');

    // 基本情報セクションが表示されるまで待機
    await expect(page.getByText('基本情報', { exact: true })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // プロジェクト名コピーボタンは表示される
    await expect(page.getByRole('button', { name: 'プロジェクト名をコピー' })).toBeVisible();

    // 顧客名コピーボタンは表示されない
    const customerCopyButton = page.getByRole('button', { name: '顧客名をコピー' });
    await expect(customerCopyButton).toHaveCount(0);
  });

  /**
   * @requirement project-management/REQ-33.9: コピーボタンにクリップボードアイコンを使用し、ホバー時にツールチップを表示する
   *
   * idle 状態でアイコン (svg) が描画されており、accessible name でツールチップ用の説明が読まれることを検証。
   */
  test('コピーボタンにアイコンとツールチップ用の aria-label が設定されている (project-management/REQ-33.9)', async ({
    page,
  }) => {
    expect(testProjectIdWithCustomer, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${testProjectIdWithCustomer}`);
    await page.waitForLoadState('networkidle');

    const copyButton = page.getByRole('button', { name: 'プロジェクト名をコピー' });
    await expect(copyButton).toBeVisible({ timeout: getTimeout(10000) });

    // svg アイコンが含まれている
    const svgCount = await copyButton.locator('svg').count();
    expect(svgCount).toBeGreaterThanOrEqual(1);

    // aria-label 属性が「コピー」を含むツールチップ的な情報になっている
    const ariaLabel = await copyButton.getAttribute('aria-label');
    expect(ariaLabel).toMatch(/コピー/);
  });
});
