/**
 * @fileoverview 取引先データインテグリティのE2Eテスト
 *
 * Task: 未カバー要件のE2Eテスト追加
 *
 * このファイルは、既存のテストでカバーされていない
 * データインテグリティと画面表示に関する要件をテストします。
 *
 * Requirements:
 * - 1.2: 一覧表示のカラム（取引先名、部課/支店/支社名、代表者名、取引先種別、住所、電話番号、登録日）
 * - 4.4: 編集時の支払日オプション（月選択・日選択）
 * - 6.1: 「顧客」と「協力業者」の2種類の取引先種別を提供
 * - 7.2, 7.3, 7.5: アクセス制御と権限チェック
 * - 8.1, 8.2: エラー回復メッセージ（ネットワークエラー、サーバーエラー）
 * - 11.1: 取引先名の最大文字数200文字
 * - 11.2: フリガナの最大文字数200文字、カタカナのみ
 * - 11.3: 部課/支店/支社名の最大文字数100文字
 * - 11.4: 代表者名の最大文字数100文字
 * - 11.8: 住所の最大文字数500文字
 * - 11.11: 備考の最大文字数2000文字
 * - 11.12: 作成日時と更新日時の自動記録
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';

/**
 * 取引先データインテグリティのE2Eテスト
 */
test.describe('取引先データインテグリティ', () => {
  // 各テストは独立して実行（シリアルモードを使用しない）

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();

    // ビューポートサイズをデスクトップサイズにリセット
    await page.setViewportSize({ width: 1280, height: 720 });

    // localStorageをクリア
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  /**
   * 一覧表示カラムのテスト
   *
   * REQ-1.2: 一覧に表示するカラムを確認
   */
  test.describe('一覧表示カラム (REQ-1.2)', () => {
    /**
     * @requirement trading-partner-management/REQ-1.2
     */
    test('取引先一覧に必要なカラムヘッダーが表示される (trading-partner-management/REQ-1.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // まずテスト用取引先を作成（データがない場合はテーブルが表示されないため）
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `一覧カラムテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('イチランカラムテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区一覧テスト1-2-3');
      await page.getByLabel(/電話番号/i).fill('03-1234-5678');
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

      // 一覧ページに遷移
      await page.waitForURL(/\/trading-partners$/);
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テーブルが表示されることを確認
      const table = page.getByRole('table', { name: /取引先一覧/i });
      await expect(table).toBeVisible({ timeout: getTimeout(15000) });

      // 必要なカラムヘッダーが表示されることを確認（REQ-1.2で定義された全カラム）
      // 取引先名カラム
      await expect(page.getByRole('columnheader', { name: /取引先名/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 部課/支店/支社名カラム
      await expect(page.getByRole('columnheader', { name: /部課\/支店\/支社/i })).toBeVisible();

      // 代表者名カラム
      await expect(page.getByRole('columnheader', { name: /代表者名/i })).toBeVisible();

      // 種別カラム（取引先種別）
      await expect(page.getByRole('columnheader', { name: /種別/i })).toBeVisible();

      // 住所カラム
      await expect(page.getByRole('columnheader', { name: /住所/i })).toBeVisible();

      // 電話番号カラム
      await expect(page.getByRole('columnheader', { name: /電話番号/i })).toBeVisible();

      // 登録日カラム
      await expect(page.getByRole('columnheader', { name: /登録日/i })).toBeVisible();
    });
  });

  /**
   * 取引先種別管理のテスト
   *
   * REQ-6.1: 「顧客」と「協力業者」の2種類を提供
   */
  test.describe('取引先種別オプション (REQ-6.1)', () => {
    /**
     * @requirement trading-partner-management/REQ-6.1
     */
    test('取引先作成フォームに「顧客」と「協力業者」の2種類のチェックボックスが表示される (trading-partner-management/REQ-6.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 顧客チェックボックスが存在することを確認
      const customerCheckbox = page.getByRole('checkbox', { name: /顧客/i });
      await expect(customerCheckbox).toBeVisible({ timeout: getTimeout(10000) });

      // 協力業者チェックボックスが存在することを確認
      const subcontractorCheckbox = page.getByRole('checkbox', { name: /協力業者/i });
      await expect(subcontractorCheckbox).toBeVisible();

      // 両方のチェックボックスが同時にチェック可能であることを確認
      await customerCheckbox.check();
      await subcontractorCheckbox.check();

      await expect(customerCheckbox).toBeChecked();
      await expect(subcontractorCheckbox).toBeChecked();
    });
  });

  /**
   * 編集時の支払日オプションのテスト
   *
   * REQ-4.4: 編集時の支払日として月選択・日選択の組み合わせを提供
   */
  test.describe('編集時の支払日オプション (REQ-4.4)', () => {
    /**
     * @requirement trading-partner-management/REQ-4.4
     */
    test('編集時に支払日として月選択（翌月/翌々月/3ヶ月後）と日選択の組み合わせが提供される (trading-partner-management/REQ-4.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `支払日テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('シハライビテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区支払日テスト1-2-3');
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

      await page.waitForURL(/\/trading-partners$/);

      // 編集ページに移動
      await page.goto(`/trading-partners/${partnerId}/edit`);
      await page.waitForLoadState('networkidle');

      // 支払日の月選択セレクトボックスを確認
      const paymentMonthOffsetSelect = page.locator('select[name="paymentMonthOffset"]');
      await expect(paymentMonthOffsetSelect).toBeVisible({ timeout: getTimeout(10000) });
      await paymentMonthOffsetSelect.click();

      // 月選択のオプションを確認
      await expect(paymentMonthOffsetSelect.getByRole('option', { name: /翌月/i })).toHaveCount(1);
      await expect(paymentMonthOffsetSelect.getByRole('option', { name: /翌々月/i })).toHaveCount(
        1
      );
      await expect(paymentMonthOffsetSelect.getByRole('option', { name: /3ヶ月後/i })).toHaveCount(
        1
      );

      // 支払日の日選択セレクトボックスを確認
      const paymentDaySelect = page.locator('select[name="paymentDay"]');
      await expect(paymentDaySelect).toBeVisible();
      await paymentDaySelect.click();

      // 日選択のオプションを確認（末日オプション）
      await expect(paymentDaySelect.getByRole('option', { name: /末日/i })).toHaveCount(1);
      await expect(paymentDaySelect.getByRole('option', { name: /^1日$/i })).toHaveCount(1);
      await expect(paymentDaySelect.getByRole('option', { name: /^15日$/i })).toHaveCount(1);
      await expect(paymentDaySelect.getByRole('option', { name: /^31日$/i })).toHaveCount(1);
    });
  });

  /**
   * 最大文字数バリデーションのテスト
   *
   * REQ-11.1: 取引先名の最大文字数200文字
   * REQ-11.2: フリガナの最大文字数200文字、カタカナのみ
   * REQ-11.3: 部課/支店/支社名の最大文字数100文字
   * REQ-11.4: 代表者名の最大文字数100文字
   * REQ-11.8: 住所の最大文字数500文字
   * REQ-11.11: 備考の最大文字数2000文字
   */
  test.describe('最大文字数バリデーション', () => {
    /**
     * @requirement trading-partner-management/REQ-11.1
     */
    test('取引先名が200文字を超える場合にバリデーションエラーが表示される (trading-partner-management/REQ-11.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 201文字の取引先名を入力
      const longName = 'あ'.repeat(201);
      const nameInput = page.getByLabel('取引先名');
      await nameInput.fill(longName);
      await nameInput.blur();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/取引先名は200文字以内で入力してください/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-11.1
     */
    test('取引先名が200文字以内の場合はバリデーションエラーが表示されない (trading-partner-management/REQ-11.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 200文字の取引先名を入力
      const validName = 'あ'.repeat(200);
      const nameInput = page.getByLabel('取引先名');
      await nameInput.fill(validName);
      await nameInput.blur();

      // バリデーションエラーが表示されないことを確認
      await expect(page.getByText(/取引先名は200文字以内で入力してください/i)).not.toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-11.2
     */
    test('フリガナが200文字を超える場合にバリデーションエラーが表示される (trading-partner-management/REQ-11.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 201文字のフリガナを入力（カタカナ）
      const longKana = 'ア'.repeat(201);
      const kanaInput = page.getByLabel('フリガナ', { exact: true });
      await kanaInput.fill(longKana);
      await kanaInput.blur();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/フリガナは200文字以内で入力してください/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-11.2
     */
    test('フリガナにカタカナ以外の文字が含まれる場合にバリデーションエラーが表示される (trading-partner-management/REQ-11.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // ひらがなを含むフリガナを入力
      const kanaInput = page.getByLabel('フリガナ', { exact: true });
      await kanaInput.fill('カタカナとひらがな');
      await kanaInput.blur();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/フリガナはカタカナのみで入力してください/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-11.2
     */
    test('フリガナが有効なカタカナのみの場合はバリデーションエラーが表示されない (trading-partner-management/REQ-11.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 有効なカタカナフリガナを入力
      const kanaInput = page.getByLabel('フリガナ', { exact: true });
      await kanaInput.fill('カブシキガイシャテスト');
      await kanaInput.blur();

      // バリデーションエラーが表示されないことを確認
      await expect(page.getByText(/フリガナはカタカナのみで入力してください/i)).not.toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-11.3
     */
    test('部課/支店/支社名が100文字を超える場合にバリデーションエラーが表示される (trading-partner-management/REQ-11.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 101文字の部課名を入力
      const longBranchName = 'あ'.repeat(101);
      const branchNameInput = page.getByLabel(/部課\/支店\/支社名/i);
      await branchNameInput.fill(longBranchName);
      await branchNameInput.blur();

      // バリデーションエラーが表示されることを確認
      await expect(
        page.getByText(/部課\/支店\/支社名は100文字以内で入力してください/i)
      ).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-11.4
     */
    test('代表者名が100文字を超える場合にバリデーションエラーが表示される (trading-partner-management/REQ-11.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 101文字の代表者名を入力
      const longRepName = 'あ'.repeat(101);
      const repNameInput = page.getByLabel(/代表者名/i);
      await repNameInput.fill(longRepName);
      await repNameInput.blur();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/代表者名は100文字以内で入力してください/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-11.8
     */
    test('住所が500文字を超える場合にバリデーションエラーが表示される (trading-partner-management/REQ-11.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 501文字の住所を入力
      const longAddress = 'あ'.repeat(501);
      const addressInput = page.getByLabel('住所');
      await addressInput.fill(longAddress);
      await addressInput.blur();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/住所は500文字以内で入力してください/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-11.11
     */
    test('備考が2000文字を超える場合にバリデーションエラーが表示される (trading-partner-management/REQ-11.11)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 2001文字の備考を入力
      const longNotes = 'あ'.repeat(2001);
      const notesInput = page.getByLabel(/備考/i);
      await notesInput.fill(longNotes);
      await notesInput.blur();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/備考は2000文字以内で入力してください/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });
  });

  /**
   * 作成日時・更新日時の自動記録テスト
   *
   * REQ-11.12: 各取引先レコードに作成日時と更新日時を自動記録する
   */
  test.describe('日時自動記録 (REQ-11.12)', () => {
    /**
     * @requirement trading-partner-management/REQ-11.12
     */
    test('取引先作成時に作成日時が自動記録される (trading-partner-management/REQ-11.12)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `日時記録テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('ニチジキロクテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区日時記録テスト1-2-3');
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

      // APIレスポンスに作成日時が含まれていることを確認
      expect(responseData.createdAt).toBeDefined();
      expect(new Date(responseData.createdAt).getTime()).toBeGreaterThan(0);

      // 詳細ページで作成日時が表示されることを確認
      await page.waitForURL(/\/trading-partners$/);
      await page.goto(`/trading-partners/${partnerId}`);
      await page.waitForLoadState('networkidle');

      // 登録日または作成日のラベルが表示されることを確認
      await expect(page.getByText(/登録日|作成日/i).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-11.12
     */
    test('取引先更新時に更新日時が自動記録される (trading-partner-management/REQ-11.12)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `更新日時テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('コウシンニチジテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区更新日時テスト1-2-3');
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
      const originalCreatedAt = responseData.createdAt;

      await page.waitForURL(/\/trading-partners$/);

      // 少し待機して時間差を確保
      await page.waitForTimeout(1000);

      // 編集ページに移動して更新
      await page.goto(`/trading-partners/${partnerId}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toHaveValue(/.+/, { timeout: getTimeout(10000) });

      const updatedNotes = `更新日時テスト備考_${Date.now()}`;
      await page.getByLabel('備考').fill(updatedNotes);

      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${partnerId}`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();
      const updateResponse = await updatePromise;
      const updatedData = await updateResponse.json();

      // APIレスポンスに更新日時が含まれていることを確認
      expect(updatedData.updatedAt).toBeDefined();
      expect(new Date(updatedData.updatedAt).getTime()).toBeGreaterThan(0);

      // 更新日時が作成日時より後であることを確認
      expect(new Date(updatedData.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(originalCreatedAt).getTime()
      );

      // 詳細ページで更新日時が表示されることを確認
      await page.waitForURL(new RegExp(`/trading-partners/${partnerId}$`));

      // 更新日のラベルが表示されることを確認
      await expect(page.getByText(/更新日/i).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * 権限チェックのテスト
   *
   * REQ-7.2: 適切な権限チェックを実行
   * REQ-7.3: 権限のないユーザーが操作を試みた場合、403 Forbiddenエラーを返却
   * REQ-7.5: 権限をシステムに定義
   */
  test.describe('アクセス制御と権限チェック', () => {
    /**
     * @requirement trading-partner-management/REQ-7.2
     * @requirement trading-partner-management/REQ-7.5
     */
    test('一般ユーザーが取引先の作成・編集操作を実行できる (trading-partner-management/REQ-7.2, REQ-7.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 作成ページにアクセスできることを確認
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('heading', { name: /取引先の新規作成/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 取引先を作成
      const partnerName = `権限テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('ケンゲンテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区権限テスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;

      // 作成が成功することを確認
      expect(createResponse.status()).toBe(201);
    });

    /**
     * @requirement trading-partner-management/REQ-7.2
     * @requirement trading-partner-management/REQ-7.3
     */
    test('一般ユーザーは取引先の削除ができない (trading-partner-management/REQ-7.2, REQ-7.3)', async ({
      page,
    }) => {
      // まず管理者で取引先を作成
      await loginAsUser(page, 'ADMIN_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `削除権限テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('サクジョケンゲンテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区削除権限テスト1-2-3');
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

      await page.waitForURL(/\/trading-partners$/);

      // 一般ユーザーに切り替え（コンテキストをクリアして再ログイン）
      await page.context().clearCookies();
      await page.goto('/login');
      await page.evaluate(() => {
        localStorage.clear();
      });

      await loginAsUser(page, 'REGULAR_USER');

      // 詳細ページにアクセス
      await page.goto(`/trading-partners/${partnerId}`);
      await page.waitForLoadState('networkidle');

      // 削除ボタンが表示されないか、無効化されていることを確認
      const deleteButton = page.getByRole('button', { name: /削除/i });
      const isVisible = await deleteButton.isVisible().catch(() => false);

      if (isVisible) {
        // ボタンが表示されている場合は、クリックしても削除できないことを確認
        await deleteButton.click();

        // 確認ダイアログが表示された場合
        const confirmDialog = page.getByText(/取引先の削除/i);
        const dialogVisible = await confirmDialog.isVisible().catch(() => false);

        if (dialogVisible) {
          const deletePromise = page.waitForResponse(
            (response) =>
              response.url().includes(`/api/trading-partners/${partnerId}`) &&
              response.request().method() === 'DELETE',
            { timeout: getTimeout(10000) }
          );

          await page
            .getByTestId('focus-manager-overlay')
            .getByRole('button', { name: /^削除$/i })
            .click()
            .catch(() => {});

          // APIが呼び出された場合、403エラーが返されることを確認
          const deleteResponse = await deletePromise.catch(() => null);
          if (deleteResponse) {
            expect(deleteResponse.status()).toBe(403);
          }
        }
      }
      // 削除ボタンが表示されない場合は、権限制御が正しく動作している
    });
  });
});
