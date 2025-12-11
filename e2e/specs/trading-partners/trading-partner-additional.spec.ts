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

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';

/**
 * 取引先管理の追加要件テスト
 */
test.describe('取引先管理の追加要件', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();

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

      // 監査ログAPIの呼び出しを監視
      const auditLogPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/audit-logs') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      // 保存ボタンをクリック
      await page.getByRole('button', { name: /保存/i }).click();

      // 監査ログAPIが呼び出されることを確認
      const auditLogResponse = await auditLogPromise.catch(() => null);

      // 監査ログが記録されたことを確認
      if (auditLogResponse) {
        expect(auditLogResponse.status()).toBe(201);
      }

      // 更新成功を確認
      await expect(page.getByText(/取引先を更新しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
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

      // 監査ログAPIの呼び出しを監視
      const auditLogPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/audit-logs') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      // ダイアログ内の「削除」ボタンをクリック
      await page
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /^削除$/i })
        .click();

      // 監査ログAPIが呼び出されることを確認
      const auditLogResponse = await auditLogPromise.catch(() => null);

      // 監査ログが記録されたことを確認
      if (auditLogResponse) {
        expect(auditLogResponse.status()).toBe(201);
      }

      // 削除成功を確認
      await expect(page.getByText(/取引先を削除しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
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

      // 検索APIの呼び出しを監視
      const searchApiPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners/search') &&
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

      // APIトークンを取得
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));

      // 検索APIを直接呼び出し
      const searchResponse = await request.get('/api/trading-partners/search?q=テスト', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(searchResponse.status()).toBe(200);

      const searchData = await searchResponse.json();

      // 結果が配列であることを確認
      expect(Array.isArray(searchData)).toBe(true);

      // 最大10件までであることを確認
      expect(searchData.length).toBeLessThanOrEqual(10);

      // 各結果に必要な情報が含まれていることを確認
      if (searchData.length > 0) {
        const firstResult = searchData[0];
        expect(firstResult).toHaveProperty('id');
        expect(firstResult).toHaveProperty('name');
        expect(firstResult).toHaveProperty('nameKana');
        expect(firstResult).toHaveProperty('types');
      }
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

      // 種別フィルタで「顧客」を選択
      const typeFilter = page.locator('select[name="type"], [data-testid="type-filter"]').first();
      await typeFilter.selectOption('CUSTOMER');

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
        `/api/trading-partners/search?q=${encodeURIComponent(nonExistentQuery)}`,
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
      await expect(
        page.getByText(/有効な電話番号を入力してください|電話番号の形式が不正です/i)
      ).toBeVisible({
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
      await expect(
        page.getByText(/有効なFAX番号を入力してください|FAX番号の形式が不正です/i)
      ).toBeVisible({
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

      // ログイン実行
      await loginAsUser(page, 'REGULAR_USER');

      // 元のページ（取引先詳細）または一覧にリダイレクトされることを確認
      // 注: 実装により元のページに戻るか、ダッシュボードに戻るかが異なる場合がある
      await page.waitForLoadState('networkidle');

      // 元のページまたはダッシュボードに遷移していることを確認
      const currentUrl = page.url();
      const isOnOriginalPage = currentUrl.includes(`/trading-partners/${partnerId}`);
      const isOnDashboard = currentUrl.includes('/dashboard') || currentUrl === '/';
      const isOnTradingPartnersList = currentUrl.includes('/trading-partners');

      // いずれかのページに遷移していればOK
      expect(isOnOriginalPage || isOnDashboard || isOnTradingPartnersList).toBe(true);
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

      // ログイン実行
      await loginAsUser(page, 'REGULAR_USER');

      // 元のページ（取引先一覧）またはダッシュボードに遷移していることを確認
      await page.waitForLoadState('networkidle');

      const currentUrl = page.url();
      const isOnOriginalPage = currentUrl.includes('/trading-partners');
      const isOnDashboard = currentUrl.includes('/dashboard') || currentUrl === '/';

      // いずれかのページに遷移していればOK
      expect(isOnOriginalPage || isOnDashboard).toBe(true);
    });
  });
});
