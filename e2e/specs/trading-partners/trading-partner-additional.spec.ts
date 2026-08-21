/**
 * @fileoverview 取引先管理の追加要件のE2Eテスト
 *
 * Task: 取引先管理の追加要件カバレッジテスト
 *
 * このファイルは、既存のCRUD・ナビゲーションテストでカバーされていない
 * 受入基準をテストします。
 *
 * Requirements:
 * - 7.4: すべての取引先操作を監査ログに記録
 * - 7.6: 監査ログに記録する操作として取引先作成、更新、削除を含める
 * - 8.4: エラーメッセージを表示時にToastNotificationコンポーネントを使用
 * - 10.1-10.7: 取引先検索API
 * - 11.7-11.9: データインテグリティ（電話番号、FAX番号、メールアドレスの形式バリデーション）
 * - 12.28: ログイン後に元のページに遷移
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { TEST_USERS } from '../../helpers/test-users';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { getPrismaClient } from '../../fixtures/database';
import { seedTradingPartner } from '../../helpers/project-list-preconditions';

/**
 * 取引先操作が監査ログに記録されていることを主張する。
 *
 * REQ-7.4 / REQ-7.6 の監査ログはサーバ側で記録される
 * （`TradingPartnerService` が `AuditLogService.createLog` を呼ぶ）。
 * ブラウザは監査ログAPIを呼ばないため、画面側のリクエスト観測では記録の有無を判定できない。
 * 記録先である `audit_logs` を直接参照する。
 *
 * @param partnerId 対象の取引先ID
 * @param action 期待する操作（`TRADING_PARTNER_UPDATED` / `TRADING_PARTNER_DELETED` など）
 */
async function expectAuditLogRecorded(partnerId: string, action: string): Promise<void> {
  const prisma = getPrismaClient();
  await expect
    .poll(
      async () =>
        prisma.auditLog.count({
          where: { targetType: 'TradingPartner', targetId: partnerId, action },
        }),
      {
        timeout: getTimeout(10000),
        message: `REQ-7.4/REQ-7.6: ${action} が監査ログに記録される (targetId=${partnerId})`,
      }
    )
    .toBeGreaterThan(0);
}

/**
 * 取引先管理の追加要件テスト
 */

/**
 * リダイレクトされたログイン画面で、その画面を離れずにログインする。
 *
 * `loginAsUser` は `/login` へ改めて遷移するため、ProtectedRoute が付けた
 * `redirectUrl` クエリを捨ててしまう。それではログイン後の戻り先（REQ-12.28）を
 * 確かめられないため、表示されているログイン画面のまま認証する。
 *
 * @param page Playwright のページ（ログイン画面にリダイレクト済みであること）
 */
async function loginOnRedirectedLoginPage(page: Page): Promise<void> {
  const user = TEST_USERS.REGULAR_USER;

  const emailInput = page.getByLabel(/メールアドレス/i);
  await expect(emailInput, '前提: リダイレクト先のログイン画面が表示される').toBeVisible({
    timeout: getTimeout(15000),
  });
  await emailInput.fill(user.email);
  await page.locator('input#password').fill(user.password);
  await page.getByRole('button', { name: /ログイン/i }).click();

  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: getTimeout(15000),
  });
  await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
}

test.describe('取引先管理の追加要件', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();

    // ビューポートサイズをデスクトップサイズにリセット（他のテストファイルでの変更を引き継がないため）
    await page.setViewportSize({ width: 1280, height: 720 });

    // localStorageもクリア（テスト間の認証状態の干渉を防ぐ）
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  /**
   * アクセス制御と監査ログのテスト
   *
   * REQ-7.4: すべての取引先操作を監査ログに記録
   * REQ-7.6: 監査ログに記録する操作として取引先作成、更新、削除を含める
   */
  test.describe('監査ログ記録', () => {
    /**
     * @requirement trading-partner-management/REQ-7.4
     * @requirement trading-partner-management/REQ-7.6
     */
    test('取引先作成時に監査ログが記録される (trading-partner-management/REQ-7.4, REQ-7.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'ADMIN_USER');

      // 作成ページに移動
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // フォームに入力
      const partnerName = `監査ログテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('カンサログテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区監査ログテスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      // 作成APIのレスポンスを待機
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      // 作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // 作成APIのレスポンスを待機
      await createPromise;

      // 作成成功を確認（一覧ページに遷移して成功メッセージが表示される）
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(10000) });
      await expect(page.getByText(/取引先を作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-7.4
     * @requirement trading-partner-management/REQ-7.6
     */
    test('取引先更新時に監査ログが記録される (trading-partner-management/REQ-7.4, REQ-7.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'ADMIN_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `監査ログ更新テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page
        .getByLabel('フリガナ', { exact: true })
        .fill('カンサログコウシンテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区監査ログ更新テスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const responseData = await createResponse.json();
      const partnerId = responseData.id;

      // 編集ページに移動
      await page.waitForURL(/\/trading-partners$/);
      await page.goto(`/trading-partners/${partnerId}/edit`);
      await page.waitForLoadState('networkidle');

      // 備考を変更
      const updatedNotes = `監査ログテスト備考_${Date.now()}`;
      await page.getByLabel('備考').fill(updatedNotes);

      // 更新APIのレスポンスを待機
      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${partnerId}`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );

      // 保存ボタンをクリック
      await page.getByRole('button', { name: /保存/i }).click();

      // 更新APIのレスポンスを待機
      const updateResponse = await updatePromise;
      expect(updateResponse.status()).toBe(200);

      // 更新成功を確認（詳細ページに遷移することで確認）
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}$`), {
        timeout: getTimeout(10000),
      });

      // REQ-7.4, REQ-7.6: 更新操作が監査ログに記録されていることを確認。
      // 監査ログはサーバ側で記録される（TradingPartnerService が AuditLogService.createLog を呼ぶ）ため、
      // ブラウザからの `POST /api/audit-logs` は原理的に発生しない。
      // 以前はその発生しない要求を関門にしていたため、この主張は一度も実行されていなかった。
      // 記録先である監査ログそのものを参照して無条件に主張する。
      await expectAuditLogRecorded(partnerId, 'TRADING_PARTNER_UPDATED');
    });

    /**
     * @requirement trading-partner-management/REQ-7.4
     * @requirement trading-partner-management/REQ-7.6
     */
    test('取引先削除時に監査ログが記録される (trading-partner-management/REQ-7.4, REQ-7.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'ADMIN_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `監査ログ削除テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page
        .getByLabel('フリガナ', { exact: true })
        .fill('カンサログサクジョテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区監査ログ削除テスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const responseData = await createResponse.json();
      const partnerId = responseData.id;

      // 詳細ページに移動
      await page.waitForURL(/\/trading-partners$/);
      await page.goto(`/trading-partners/${partnerId}`);
      await page.waitForLoadState('networkidle');

      // 削除ボタンをクリック
      await page.getByRole('button', { name: /削除/i }).click();

      // 確認ダイアログが表示されることを確認
      await expect(page.getByText(/取引先の削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 削除APIレスポンスを待機
      const deletePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${partnerId}`) &&
          response.request().method() === 'DELETE' &&
          response.status() === 204,
        { timeout: getTimeout(30000) }
      );

      // ダイアログ内の「削除」ボタンをクリック
      await page
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /^削除$/i })
        .click();

      // 削除APIレスポンスを待機
      await deletePromise;

      // 削除成功を確認（トーストは自動消去されるため、先に確認する）
      await expect(page.getByText(/取引先を削除しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // REQ-7.4, REQ-7.6: 削除操作が監査ログに記録されていることを確認（記録先を直接参照する）
      await expectAuditLogRecorded(partnerId, 'TRADING_PARTNER_DELETED');
    });
  });

  /**
   * エラー回復とフィードバックのテスト
   *
   * REQ-8.4: エラーメッセージを表示時にToastNotificationコンポーネントを使用
   */
  test.describe('ToastNotification表示', () => {
    /**
     * @requirement trading-partner-management/REQ-8.4
     */
    test('作成エラー時にToastNotificationが表示される (trading-partner-management/REQ-8.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 重複する取引先名を作成してエラーを発生させる
      // まず1つ目を作成
      const partnerName = `Toastテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('トーストテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区Toastテスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise1 = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise1;

      // 一覧に戻る
      await page.waitForURL(/\/trading-partners$/);

      // 同じ名前で2つ目を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('トーストテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区Toastテスト別住所1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise2 = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 409,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise2;

      // ToastNotificationでエラーが表示されることを確認
      // Toastは通常、画面上部または下部に表示されるdiv要素
      const toast = page.locator('[role="alert"], [role="status"], .toast, [data-testid="toast"]');
      await expect(toast.filter({ hasText: /既に登録されています|重複|エラー/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-8.4
     */
    test('成功メッセージもToastNotificationで表示される (trading-partner-management/REQ-8.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `Toast成功テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('トーストセイコウテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区Toast成功テスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // ToastNotificationで成功メッセージが表示されることを確認
      const toast = page.locator('[role="alert"], [role="status"], .toast, [data-testid="toast"]');
      await expect(toast.filter({ hasText: /取引先を作成しました/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * 取引先検索APIのテスト
   *
   * REQ-10.1: `GET /api/trading-partners/search` エンドポイントで検索機能を提供
   * REQ-10.2: 検索クエリが1文字以上の場合に部分一致検索を実行
   * REQ-10.3: 検索結果を最大10件まで返却
   * REQ-10.4: 検索結果に取引先ID、取引先名、フリガナ、種別を含める
   * REQ-10.5: 種別フィルタ指定時に指定された種別を含む取引先のみを返却
   * REQ-10.7: 検索結果が0件の場合に空配列を返却
   */
  test.describe('取引先検索API', () => {
    /**
     * @requirement trading-partner-management/REQ-10.1
     * @requirement trading-partner-management/REQ-10.2
     */
    test('検索APIが1文字以上のクエリで部分一致検索を実行する (trading-partner-management/REQ-10.1, REQ-10.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const uniquePrefix = `検索APIテスト_${Date.now()}`;
      const partnerName = `${uniquePrefix}_取引先`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page
        .getByLabel('フリガナ', { exact: true })
        .fill('ケンサクエーピーアイテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区検索APIテスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // 一覧ページに移動
      await page.waitForURL(/\/trading-partners$/);
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 検索フィールドに1文字入力して検索
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill(uniquePrefix.substring(0, 3)); // 最初の3文字で検索

      // 検索APIの呼び出しを監視（一覧APIにsearchパラメータを付けて呼び出す）
      const searchApiPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.url().includes('search=') &&
          response.request().method() === 'GET',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^検索$/i }).click();

      // 検索APIが呼び出されることを確認
      const searchResponse = await searchApiPromise;
      expect(searchResponse.status()).toBe(200);

      // 部分一致で結果が表示されることを確認
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });
      await expect(page.getByText(partnerName)).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement trading-partner-management/REQ-10.3
     * @requirement trading-partner-management/REQ-10.4
     */
    test('検索結果を最大10件まで返却し、必要な情報を含める (trading-partner-management/REQ-10.3, REQ-10.4)', async ({
      page,
      request,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // REQ-10.4 は検索結果の各項目を定める。結果が0件だと項目の主張が一つも実行されないため、
      // 検索語「テスト」に必ず一致する取引先をこのテスト自身が用意する。
      await seedTradingPartner(page, 'テスト取引先検索');

      // APIトークンを取得
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));

      // 検索APIを直接呼び出し
      const searchResponse = await request.get(
        `${API_BASE_URL}/api/trading-partners/search?q=テスト`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect(searchResponse.status()).toBe(200);

      const searchData = await searchResponse.json();

      // 結果が配列であることを確認
      expect(Array.isArray(searchData)).toBe(true);

      // 最大10件までであることを確認
      expect(searchData.length).toBeLessThanOrEqual(10);

      // REQ-10.4: 検索結果には取引先ID・取引先名・フリガナ・種別が含まれる
      expect(searchData.length, 'REQ-10.4: 検索結果が1件以上返る').toBeGreaterThan(0);
      const firstResult = searchData[0];
      expect(firstResult).toHaveProperty('id');
      expect(firstResult).toHaveProperty('name');
      expect(firstResult).toHaveProperty('nameKana');
      expect(firstResult).toHaveProperty('types');
    });

    /**
     * @requirement trading-partner-management/REQ-10.5
     */
    test('種別フィルタ指定時に該当する種別の取引先のみを返却する (trading-partner-management/REQ-10.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成（顧客のみ）
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const uniquePrefix = `種別フィルタテスト_${Date.now()}`;
      const partnerName = `${uniquePrefix}_顧客取引先`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('シュベツフィルタテストコキャク');
      await page.getByLabel('住所').fill('東京都渋谷区種別フィルタテスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // 一覧ページに移動
      await page.waitForURL(/\/trading-partners$/);
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 種別フィルタで「顧客」チェックボックスを選択
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      // 検索APIの呼び出しを監視
      const searchApiPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.url().includes('type=CUSTOMER') &&
          response.request().method() === 'GET',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^検索$/i }).click();

      // APIが呼び出されることを確認
      const searchResponse = await searchApiPromise;
      expect(searchResponse.status()).toBe(200);

      // フィルタされた結果が表示されることを確認
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });
    });

    /**
     * @requirement trading-partner-management/REQ-10.7
     */
    test('検索結果が0件の場合に空配列を返却する (trading-partner-management/REQ-10.7)', async ({
      page,
      request,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // APIトークンを取得
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));

      // 存在しない検索クエリでAPIを呼び出し
      const nonExistentQuery = `存在しない取引先_${Date.now()}_XXXXXXXXX`;
      const searchResponse = await request.get(
        `${API_BASE_URL}/api/trading-partners/search?q=${encodeURIComponent(nonExistentQuery)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect(searchResponse.status()).toBe(200);

      const searchData = await searchResponse.json();

      // 空配列が返されることを確認
      expect(Array.isArray(searchData)).toBe(true);
      expect(searchData.length).toBe(0);
    });
  });

  /**
   * データインテグリティのテスト
   *
   * REQ-11.7: 電話番号の形式バリデーション
   * REQ-11.8: FAX番号の形式バリデーション
   * REQ-11.9: メールアドレスの形式バリデーション
   */
  test.describe('データインテグリティ - 形式バリデーション', () => {
    /**
     * @requirement trading-partner-management/REQ-11.7
     */
    test('電話番号の形式が不正な場合にバリデーションエラーが表示される (trading-partner-management/REQ-11.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 不正な電話番号を入力
      const phoneInput = page.getByLabel(/電話番号/i);
      await phoneInput.fill('123-invalid-phone');
      await phoneInput.blur();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/電話番号は数字、ハイフン、括弧のみ使用できます/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-11.7
     */
    test('正しい電話番号形式ではバリデーションエラーが表示されない (trading-partner-management/REQ-11.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 正しい電話番号を入力
      const phoneInput = page.getByLabel(/電話番号/i);
      await phoneInput.fill('03-1234-5678');
      await phoneInput.blur();

      // 必須フィールドに入力
      await page.getByLabel('取引先名').fill('電話番号テスト取引先');
      await page.getByLabel('フリガナ', { exact: true }).fill('デンワバンゴウテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区電話番号テスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      // バリデーションエラーが表示されないことを確認
      await expect(
        page.getByText(/有効な電話番号を入力してください|電話番号の形式が不正です/i)
      ).not.toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-11.8
     */
    test('FAX番号の形式が不正な場合にバリデーションエラーが表示される (trading-partner-management/REQ-11.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 不正なFAX番号を入力
      const faxInput = page.getByLabel(/FAX番号/i);
      await faxInput.fill('invalid-fax-123');
      await faxInput.blur();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/FAX番号は数字、ハイフン、括弧のみ使用できます/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-11.8
     */
    test('正しいFAX番号形式ではバリデーションエラーが表示されない (trading-partner-management/REQ-11.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 正しいFAX番号を入力
      const faxInput = page.getByLabel(/FAX番号/i);
      await faxInput.fill('03-9876-5432');
      await faxInput.blur();

      // 必須フィールドに入力
      await page.getByLabel('取引先名').fill('FAX番号テスト取引先');
      await page
        .getByLabel('フリガナ', { exact: true })
        .fill('ファックスバンゴウテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区FAX番号テスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      // バリデーションエラーが表示されないことを確認
      await expect(
        page.getByText(/有効なFAX番号を入力してください|FAX番号の形式が不正です/i)
      ).not.toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-11.9
     */
    test('メールアドレスの形式が不正な場合にバリデーションエラーが表示される (trading-partner-management/REQ-11.9)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 不正なメールアドレスを入力
      const emailInput = page.getByLabel(/メールアドレス/i);
      await emailInput.fill('invalid-email');
      await emailInput.blur();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/有効なメールアドレスを入力してください/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-11.9
     */
    test('正しいメールアドレス形式ではバリデーションエラーが表示されない (trading-partner-management/REQ-11.9)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 正しいメールアドレスを入力
      const emailInput = page.getByLabel(/メールアドレス/i);
      await emailInput.fill('test@example.com');
      await emailInput.blur();

      // 必須フィールドに入力
      await page.getByLabel('取引先名').fill('メールアドレステスト取引先');
      await page.getByLabel('フリガナ', { exact: true }).fill('メールアドレステストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区メールアドレステスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      // バリデーションエラーが表示されないことを確認
      await expect(page.getByText(/有効なメールアドレスを入力してください/i)).not.toBeVisible();
    });
  });

  /**
   * 画面遷移のテスト
   *
   * REQ-12.28: ログイン後に元のページに遷移
   */
  test.describe('ログイン後のリダイレクト', () => {
    /**
     * @requirement trading-partner-management/REQ-12.28
     */
    test('未認証状態で取引先詳細にアクセスし、ログイン後に元のページに遷移する (trading-partner-management/REQ-12.28)', async ({
      page,
      context,
    }) => {
      // まずログイン状態で取引先を作成
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `リダイレクトテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('リダイレクトテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区リダイレクトテスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const responseData = await createResponse.json();
      const partnerId = responseData.id;

      // ログアウト（認証状態をクリア）
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.clear();
      });

      // 未認証状態で取引先詳細ページにアクセス
      await page.goto(`/trading-partners/${partnerId}`);

      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });

      // REQ-12.28: ログイン後は元のページ（リダイレクト元の取引先ページ）に遷移する。
      // 以前は `loginAsUser` を呼んでいたが、この補助は `/login` へ改めて遷移するため
      // ProtectedRoute が付けた `redirectUrl` を捨ててしまい、常に既定の遷移先に着く。
      // そのうえで「元のページ または ダッシュボード または 取引先一覧」を許していたため、
      // どこへ遷移しても成立し、要件の戻り先を一度も確かめていなかった
      // （`/trading-partners` は元のページのURLにも含まれるため、三項目は互いに重なる）。
      // リダイレクトされたログイン画面のまま認証し、戻り先そのものを主張する。
      await loginOnRedirectedLoginPage(page);

      await expect(page, 'REQ-12.28: ログイン後に元の取引先詳細へ戻らない').toHaveURL(
        new RegExp(`/trading-partners/${partnerId}$`),
        { timeout: getTimeout(15000) }
      );
    });

    /**
     * @requirement trading-partner-management/REQ-12.28
     */
    test('未認証状態で取引先一覧にアクセスし、ログイン後に元のページに遷移する (trading-partner-management/REQ-12.28)', async ({
      page,
    }) => {
      // 未認証状態で取引先一覧ページにアクセス
      await page.goto('/trading-partners');

      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });

      // REQ-12.28: ログイン後は元のページ（取引先一覧）に遷移する。
      // 以前は `loginAsUser` が `redirectUrl` を捨てるうえ、「元のページ または
      // ダッシュボード」を許していたため、どこへ遷移しても成立していた。
      await loginOnRedirectedLoginPage(page);

      await expect(page, 'REQ-12.28: ログイン後に元の取引先一覧へ戻らない').toHaveURL(
        /\/trading-partners$/,
        { timeout: getTimeout(15000) }
      );
    });
  });
});
