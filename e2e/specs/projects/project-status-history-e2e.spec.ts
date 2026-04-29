/**
 * @fileoverview プロジェクトステータス変更履歴の表示制限と全件表示ダイアログ E2Eテスト
 *
 * Requirements coverage:
 * - REQ-35.1: ステータス変更履歴セクションに直近3件のみを表示する
 * - REQ-35.2: 履歴が4件以上存在する場合「すべての履歴を表示」リンクを表示する
 * - REQ-35.3: 履歴が3件以下の場合「すべての履歴を表示」リンクを非表示にする
 * - REQ-35.4: リンククリックで全件表示ダイアログを開く
 * - REQ-35.5: ダイアログ内に全履歴を時系列順（新しい順）で表示する
 * - REQ-35.6: ダイアログに「閉じる」ボタンを表示する
 * - REQ-35.7: 「閉じる」ボタンクリックでダイアログを閉じる
 * - REQ-35.8: ダイアログ外クリックでダイアログを閉じる
 *
 * 実装メモ: status_history は INITIAL のレコードを含めて履歴行が積み上がるため、
 * 4件以上の履歴を生成するために複数回ステータスを遷移させる。
 *  - 順方向遷移: 準備中 → 調査中 → 見積中 → 決裁待ち → 契約中（履歴は5件）
 */

import { test, expect, type Page, type Response } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

test.describe('プロジェクトステータス変更履歴の表示制限とダイアログ', () => {
  test.describe.configure({ mode: 'serial' });

  let projectIdWithFewHistory: string | null = null;
  let projectIdWithManyHistory: string | null = null;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * 新規プロジェクトを作成し、IDを返す
   */
  async function createTestProject(page: Page, suffix: string): Promise<string> {
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

    await page.getByLabel(/プロジェクト名/i).fill(`ステータス履歴テスト_${suffix}_${Date.now()}`);
    await page.getByLabel(/現場住所/i).fill('東京都渋谷区履歴1-2-3');

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
   * 順方向遷移ボタンをクリックして1ステップ進める
   * 遷移後、ステータスバッジが nextLabel になるまで待機する。
   */
  async function transitionForward(page: Page, nextLabel: string): Promise<void> {
    const transitionPromise = page.waitForResponse(
      (response: Response) =>
        /\/api\/projects\/[0-9a-f-]+\/status/.test(response.url()) &&
        ['POST', 'PATCH', 'PUT'].includes(response.request().method()) &&
        response.status() < 400,
      { timeout: getTimeout(30000) }
    );

    const button = page.getByRole('button', { name: `${nextLabel}に順方向遷移する` });
    await expect(button).toBeVisible({ timeout: getTimeout(10000) });
    await button.click();
    await transitionPromise;

    // ステータスバッジが更新されるまで待機
    await expect(page.getByTestId('current-status-badge')).toHaveText(nextLabel, {
      timeout: getTimeout(10000),
    });
  }

  test('事前準備: 履歴1件と履歴5件のプロジェクトを生成する', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // 履歴が少ない（INITIAL のみ＝1件）プロジェクト
    projectIdWithFewHistory = await createTestProject(page, 'few');
    expect(projectIdWithFewHistory).toBeTruthy();

    // 履歴が多いプロジェクト：4回順方向遷移して合計5件の履歴を作る
    projectIdWithManyHistory = await createTestProject(page, 'many');
    expect(projectIdWithManyHistory).toBeTruthy();

    await page.goto(`/projects/${projectIdWithManyHistory}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('current-status-badge')).toHaveText('準備中', {
      timeout: getTimeout(10000),
    });

    await transitionForward(page, '調査中');
    await transitionForward(page, '見積中');
    await transitionForward(page, '決裁待ち');
    await transitionForward(page, '契約中');

    // 履歴件数が4件以上に増えたことを確認（INITIAL + forward 4 = 5件）。
    // セクション本体は HISTORY_DISPLAY_LIMIT=3 でクリップされるため (REQ-35.1)、
    // 全件数は「すべての履歴を表示（全N件）」リンクラベルから検証する。
    const showAllButton = page.getByRole('button', { name: /すべての履歴を表示/ });
    await expect(showAllButton).toBeVisible({ timeout: getTimeout(15000) });
    await expect
      .poll(
        async () => {
          const text = (await showAllButton.textContent()) ?? '';
          const match = text.match(/全(\d+)件/);
          return match?.[1] ? parseInt(match[1], 10) : 0;
        },
        { timeout: getTimeout(15000) }
      )
      .toBeGreaterThanOrEqual(4);
  });

  /**
   * @requirement project-management/REQ-35.1: ステータス変更履歴セクションに直近3件のみを表示する
   */
  test('履歴が4件以上ある場合、セクション本体には直近3件のみが表示される (project-management/REQ-35.1)', async ({
    page,
  }) => {
    expect(projectIdWithManyHistory, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${projectIdWithManyHistory}`);
    await page.waitForLoadState('networkidle');

    // ステータス変更履歴セクションのリージョンを取得
    const historyRegion = page.getByRole('region', { name: 'ステータス変更履歴' });
    await expect(historyRegion).toBeVisible({ timeout: getTimeout(10000) });

    // セクション内に表示されている履歴アイテムは3件であること
    const items = historyRegion.locator('[data-testid^="status-history-item-"]');
    await expect(items).toHaveCount(3);
  });

  /**
   * @requirement project-management/REQ-35.2: 履歴が4件以上存在する場合「すべての履歴を表示」リンクを表示する
   */
  test('履歴が4件以上ある場合、「すべての履歴を表示」リンクが表示される (project-management/REQ-35.2)', async ({
    page,
  }) => {
    expect(projectIdWithManyHistory, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${projectIdWithManyHistory}`);
    await page.waitForLoadState('networkidle');

    const showAllButton = page.getByRole('button', { name: /すべての履歴を表示/ });
    await expect(showAllButton).toBeVisible({ timeout: getTimeout(10000) });
  });

  /**
   * @requirement project-management/REQ-35.3: 履歴が3件以下の場合「すべての履歴を表示」リンクを非表示にする
   */
  test('履歴が3件以下の場合、「すべての履歴を表示」リンクが表示されない (project-management/REQ-35.3)', async ({
    page,
  }) => {
    expect(projectIdWithFewHistory, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${projectIdWithFewHistory}`);
    await page.waitForLoadState('networkidle');

    // 履歴セクションが表示されること
    await expect(page.getByRole('region', { name: 'ステータス変更履歴' })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 「すべての履歴を表示」リンクが存在しない
    const showAllButton = page.getByRole('button', { name: /すべての履歴を表示/ });
    await expect(showAllButton).toHaveCount(0);
  });

  /**
   * @requirement project-management/REQ-35.4: 「すべての履歴を表示」クリックで全件表示ダイアログが開く
   */
  test('「すべての履歴を表示」をクリックすると全件表示ダイアログが開く (project-management/REQ-35.4)', async ({
    page,
  }) => {
    expect(projectIdWithManyHistory, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${projectIdWithManyHistory}`);
    await page.waitForLoadState('networkidle');

    const showAllButton = page.getByRole('button', { name: /すべての履歴を表示/ });
    await expect(showAllButton).toBeVisible({ timeout: getTimeout(10000) });
    await showAllButton.click();

    // ダイアログタイトルが表示されることを確認
    const dialogTitle = page.getByRole('heading', { name: /ステータス変更履歴（全\d+件）/ });
    await expect(dialogTitle).toBeVisible({ timeout: getTimeout(5000) });
  });

  /**
   * @requirement project-management/REQ-35.5: ダイアログ内に全履歴を時系列順（新しい順）で表示する
   */
  test('ダイアログには履歴の全件が新しい順で表示される (project-management/REQ-35.5)', async ({
    page,
  }) => {
    expect(projectIdWithManyHistory, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${projectIdWithManyHistory}`);
    await page.waitForLoadState('networkidle');

    // 直近3件のセクションでの件数（baseline）
    const region = page.getByRole('region', { name: 'ステータス変更履歴' });
    const visibleItemsCount = await region.locator('[data-testid^="status-history-item-"]').count();

    // 全件件数をリンクラベルから取得
    const showAllButton = page.getByRole('button', { name: /すべての履歴を表示/ });
    const buttonText = (await showAllButton.textContent()) ?? '';
    const totalMatch = buttonText.match(/全(\d+)件/);
    expect(totalMatch).toBeTruthy();
    const totalCount = parseInt(totalMatch?.[1] ?? '0', 10);
    expect(totalCount).toBeGreaterThanOrEqual(4);
    expect(totalCount).toBeGreaterThan(visibleItemsCount);

    await showAllButton.click();

    // ダイアログ内の履歴アイテムを取得
    const dialogTitle = page.getByRole('heading', { name: /ステータス変更履歴（全\d+件）/ });
    await expect(dialogTitle).toBeVisible({ timeout: getTimeout(5000) });

    // ダイアログ自体は role=dialog の親 (FocusManager) に閉じ込められているため、
    // タイトルから親 (dialog) を辿って範囲を限定
    const dialog = page.locator('[role="dialog"]', {
      has: page.getByRole('heading', { name: /ステータス変更履歴（全\d+件）/ }),
    });
    await expect(dialog).toBeVisible({ timeout: getTimeout(5000) });

    const allItems = dialog.locator('[data-testid^="status-history-item-"]');
    await expect(allItems).toHaveCount(totalCount);

    // 新しい順 (DESC) で並んでいる: 最初の項目 (最新) は最後に遷移した「契約中」を含む
    const firstItemText = await allItems.first().textContent();
    expect(firstItemText).toContain('契約中');
  });

  /**
   * @requirement project-management/REQ-35.6: ダイアログに「閉じる」ボタンが表示される
   */
  test('ダイアログには「閉じる」ボタンが表示される (project-management/REQ-35.6)', async ({
    page,
  }) => {
    expect(projectIdWithManyHistory, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${projectIdWithManyHistory}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /すべての履歴を表示/ }).click();

    const dialog = page.locator('[role="dialog"]', {
      has: page.getByRole('heading', { name: /ステータス変更履歴（全\d+件）/ }),
    });
    await expect(dialog).toBeVisible({ timeout: getTimeout(5000) });

    const closeButton = dialog.getByRole('button', { name: '閉じる' });
    await expect(closeButton).toBeVisible({ timeout: getTimeout(5000) });
  });

  /**
   * @requirement project-management/REQ-35.7: 「閉じる」ボタンでダイアログを閉じる
   */
  test('「閉じる」ボタンをクリックするとダイアログが閉じる (project-management/REQ-35.7)', async ({
    page,
  }) => {
    expect(projectIdWithManyHistory, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${projectIdWithManyHistory}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /すべての履歴を表示/ }).click();

    const dialog = page.locator('[role="dialog"]', {
      has: page.getByRole('heading', { name: /ステータス変更履歴（全\d+件）/ }),
    });
    await expect(dialog).toBeVisible({ timeout: getTimeout(5000) });

    await dialog.getByRole('button', { name: '閉じる' }).click();

    // ダイアログが閉じられる
    await expect(dialog).toHaveCount(0);
  });

  /**
   * @requirement project-management/REQ-35.8: ダイアログ外（オーバーレイ）クリックでダイアログを閉じる
   */
  test('ダイアログ外をクリックするとダイアログが閉じる (project-management/REQ-35.8)', async ({
    page,
  }) => {
    expect(projectIdWithManyHistory, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${projectIdWithManyHistory}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /すべての履歴を表示/ }).click();

    const dialog = page.locator('[role="dialog"]', {
      has: page.getByRole('heading', { name: /ステータス変更履歴（全\d+件）/ }),
    });
    await expect(dialog).toBeVisible({ timeout: getTimeout(5000) });

    // FocusManager のオーバーレイ要素自体をクリックすると closeOnOutsideClick=true により閉じる。
    // dialog 内部ではなくオーバーレイを直接クリックするため、coordinate を計算してクリックする。
    const overlay = page.getByTestId('focus-manager-overlay');
    const overlayBox = await overlay.boundingBox();
    expect(overlayBox).not.toBeNull();
    if (overlayBox) {
      // オーバーレイの左上隅から少し中側を狙う（dialog ではなくオーバーレイの空白領域に当たる）
      await page.mouse.click(overlayBox.x + 5, overlayBox.y + 5);
    }

    // ダイアログが閉じられる
    await expect(dialog).toHaveCount(0, { timeout: getTimeout(5000) });
  });
});
