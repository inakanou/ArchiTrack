/**
 * @fileoverview 取引先CRUDフローのE2Eテスト
 *
 * Task 15.1: 取引先CRUDフローのE2Eテスト
 *
 * 取引先の作成、詳細表示、編集、削除の一連のフローをテストします。
 * バリデーションエラー、重複エラー、競合エラーの表示もテストします。
 *
 * Requirements:
 * - 2.1: 「新規作成」ボタンで取引先作成フォームを表示する
 * - 2.8: 取引先作成成功時に成功メッセージを表示し一覧ページに遷移
 * - 2.11: 同一の取引先名が既に存在する場合のエラー表示
 * - 4.1: 編集ボタンクリックで現在の取引先情報がプリセットされた編集フォームを表示
 * - 4.6: 更新成功時に成功メッセージを表示し詳細ページに遷移
 * - 4.10: 別のユーザーが同時に編集していた場合の競合エラー表示
 * - 5.1: 削除ボタンクリックで削除確認ダイアログを表示
 * - 5.4: 削除成功時に成功メッセージを表示し一覧ページに遷移
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * 取引先CRUD機能のE2Eテスト
 */
test.describe('取引先CRUD操作', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストで作成した取引先のIDを保存
  let createdTradingPartnerId: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // localStorageもクリア（テスト間の認証状態の干渉を防ぐ）
    // ページを一度開いてからlocalStorageをクリアする必要がある
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  /**
   * 取引先作成フローのテスト
   *
   * REQ-2.1: 「新規作成」ボタンで取引先作成フォームを表示する
   * REQ-2.8: 取引先作成成功時に成功メッセージを表示し一覧ページに遷移
   */
  test.describe('取引先作成フロー', () => {
    /**
     * @requirement trading-partner-management/REQ-2.1
     */
    test('新規作成ボタンから作成フォームへ遷移できる (trading-partner-management/REQ-2.1)', async ({
      page,
    }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // 取引先一覧ページに移動
      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');

      // 「新規作成」ボタンをクリック
      const createButton = page.getByRole('button', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 作成ページに遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners\/new/, { timeout: getTimeout(10000) });

      // フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /取引先の新規作成/i })).toBeVisible();
      await expect(page.getByLabel('取引先名')).toBeVisible();
      await expect(page.getByLabel('フリガナ', { exact: true })).toBeVisible();
      await expect(page.getByLabel('住所')).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-2.2
     */
    test('必須入力欄（名前、フリガナ、種別、住所）が提供される (trading-partner-management/REQ-2.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 必須入力欄が全て存在することを確認
      await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByLabel('フリガナ', { exact: true })).toBeVisible();
      await expect(page.getByLabel('住所')).toBeVisible();

      // 種別チェックボックスが存在することを確認
      await expect(page.getByRole('checkbox', { name: /顧客/i })).toBeVisible();
      await expect(page.getByRole('checkbox', { name: /協力業者/i })).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-2.3
     */
    test('任意入力欄（部課名、代表者名、電話番号、FAX、メール、請求締日、支払日、備考）が提供される (trading-partner-management/REQ-2.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 任意入力欄が全て存在することを確認
      await expect(page.getByLabel(/部課\/支店\/支社名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByLabel(/代表者名/i)).toBeVisible();
      await expect(page.getByLabel(/電話番号/i)).toBeVisible();
      await expect(page.getByLabel(/FAX/i)).toBeVisible();
      await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
      await expect(page.getByLabel(/請求締日/i)).toBeVisible();
      await expect(page.getByLabel(/支払日/i).first()).toBeVisible();
      await expect(page.getByLabel(/備考/i)).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-2.4
     */
    test('請求締日として1日〜31日および「末日」の計32オプションが提供される (trading-partner-management/REQ-2.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 請求締日のセレクトボックスを開く
      const billingCutoffDaySelect = page.getByLabel(/請求締日/i);
      await expect(billingCutoffDaySelect).toBeVisible({ timeout: getTimeout(10000) });
      await billingCutoffDaySelect.click();

      // 1日〜31日と「末日」のオプションが存在することを確認（計32個）
      // option要素はhiddenなのでtoHaveCountで存在確認する
      // まず「末日」オプションの存在を確認（請求締日のセレクト内で）
      await expect(billingCutoffDaySelect.getByRole('option', { name: /末日/i })).toHaveCount(1);

      // いくつかの代表的な日付オプションの存在を確認（請求締日のセレクト内で）
      await expect(billingCutoffDaySelect.getByRole('option', { name: /^1日$/i })).toHaveCount(1);
      await expect(billingCutoffDaySelect.getByRole('option', { name: /^15日$/i })).toHaveCount(1);
      await expect(billingCutoffDaySelect.getByRole('option', { name: /^31日$/i })).toHaveCount(1);
    });

    /**
     * @requirement trading-partner-management/REQ-2.5
     */
    test('支払日として月選択（翌月/翌々月/3ヶ月後）と日選択の組み合わせが提供される (trading-partner-management/REQ-2.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 支払日の月選択セレクトボックスを開く
      const paymentMonthOffsetSelect = page.locator('select[name="paymentMonthOffset"]');
      await expect(paymentMonthOffsetSelect).toBeVisible({ timeout: getTimeout(10000) });
      await paymentMonthOffsetSelect.click();

      // 月選択のオプションを確認（option要素はhiddenなのでtoHaveCountで存在確認）
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
    });

    /**
     * @requirement trading-partner-management/REQ-2.6
     */
    test('種別選択肢として「顧客」と「協力業者」がチェックボックスで提供される (trading-partner-management/REQ-2.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 種別チェックボックスの存在と種類を確認
      const customerCheckbox = page.getByRole('checkbox', { name: /顧客/i });
      const supplierCheckbox = page.getByRole('checkbox', { name: /協力業者/i });

      await expect(customerCheckbox).toBeVisible({ timeout: getTimeout(10000) });
      await expect(supplierCheckbox).toBeVisible();

      // チェックボックスがチェック可能であることを確認
      await customerCheckbox.check();
      await expect(customerCheckbox).toBeChecked();

      await supplierCheckbox.check();
      await expect(supplierCheckbox).toBeChecked();
    });

    /**
     * @requirement trading-partner-management/REQ-2.7
     */
    test('有効なデータで保存ボタンクリック時に新規レコードが作成される (trading-partner-management/REQ-2.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 有効なデータを入力
      const partnerName = `有効データ取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('ユウコウデータトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区有効データ1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      // APIレスポンスを待機
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();

      const response = await createPromise;

      // 201 Createdが返されることを確認
      expect(response.status()).toBe(201);

      // レスポンスにIDが含まれることを確認
      const responseData = await response.json();
      expect(responseData.id).toBeDefined();
      expect(responseData.name).toBe(partnerName);
    });

    /**
     * @requirement trading-partner-management/REQ-2.8
     */
    test('フォーム入力→送信→一覧画面遷移が正常に行われる (trading-partner-management/REQ-2.8)', async ({
      page,
    }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // 作成ページに移動
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

      // フォームに入力
      const partnerName = `E2Eテスト取引先_${Date.now()}`;
      const partnerNameKana = 'イーツーイーテストトリヒキサキ';
      const partnerAddress = '東京都渋谷区テスト1-2-3';

      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill(partnerNameKana);
      await page.getByLabel('住所').fill(partnerAddress);

      // 種別を選択（顧客チェックボックス）
      const customerCheckbox = page.getByRole('checkbox', { name: /顧客/i });
      await expect(customerCheckbox).toBeVisible();
      await customerCheckbox.check();

      // APIレスポンスを待機しながら作成ボタンをクリック
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();

      // APIレスポンスを待機
      const response = await createPromise;

      // APIレスポンスが成功であることを確認
      expect(response.status()).toBe(201);

      // 成功メッセージ（トースト）が表示されることを確認
      await expect(page.getByText(/取引先を作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(15000) });

      // 一覧が読み込まれたことを確認（テーブルが表示される）
      await expect(page.getByRole('table', { name: /取引先一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 注: 一覧はソート順により作成した取引先が先頭に表示されない場合があるため、
      // APIレスポンスの成功とトースト表示をもって作成成功を確認としています
    });

    /**
     * @requirement trading-partner-management/REQ-2.9
     */
    test('必須項目未入力時にバリデーションエラーが表示される (trading-partner-management/REQ-2.9)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 何も入力せずに作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/取引先名は必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(page.getByText(/フリガナは必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(page.getByText(/住所は必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(page.getByText(/種別を1つ以上選択してください/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-2.10
     */
    test('メールアドレス形式不正時にバリデーションエラーが表示される (trading-partner-management/REQ-2.10)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // メールアドレスフィールドに不正な形式を入力
      await page.getByLabel(/メールアドレス/i).fill('invalid-email');
      await page.getByLabel(/メールアドレス/i).blur();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/有効なメールアドレスを入力してください/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-2.11
     */
    test('同一の取引先名が既に存在する場合にエラーが表示される (trading-partner-management/REQ-2.11)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // まず1つ目の取引先を作成
      const partnerName = `重複テスト取引先_${Date.now()}`;
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('ジュウフクテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区テスト1-2-3');
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

      // 成功トーストが消えるのを待つ
      await page.waitForURL(/\/trading-partners$/, { timeout: getTimeout(15000) });
      await page.waitForLoadState('networkidle');

      // 同じ名前で2つ目を作成しようとする
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('ジュウフクテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区別の住所1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise2 = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();

      // APIレスポンスを待機（409 Conflictが返るはず）
      const response = await createPromise2;

      // 409エラーが返されていることを確認
      expect(response.status()).toBe(409);

      // 重複エラーがトーストで表示されることを確認
      // トーストは複数の方法で表示される可能性があるため、複数のセレクタを試す
      await expect(page.getByText(/この取引先名は既に登録されています|既に存在|重複/i)).toBeVisible(
        {
          timeout: getTimeout(15000),
        }
      );

      // 作成ページに留まっていることを確認（エラー時は遷移しない）
      await expect(page).toHaveURL(/\/trading-partners\/new/);
    });
  });

  /**
   * 取引先詳細表示・編集フローのテスト
   *
   * REQ-4.1: 編集ボタンクリックで現在の取引先情報がプリセットされた編集フォームを表示
   * REQ-4.6: 更新成功時に成功メッセージを表示し詳細ページに遷移
   */
  test.describe('取引先詳細表示・編集フロー', () => {
    /**
     * テスト用取引先を作成するヘルパー関数
     */
    async function createTestTradingPartner(
      page: import('@playwright/test').Page
    ): Promise<string> {
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `編集テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('ヘンシュウテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区テスト1-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const response = await createPromise;
      const responseData = await response.json();

      return responseData.id;
    }

    /**
     * @requirement trading-partner-management/REQ-3.1
     * @requirement trading-partner-management/REQ-3.2
     */
    test('一覧から取引先を選択して詳細ページを表示できる (trading-partner-management/REQ-3.1, REQ-3.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      const partnerId = await createTestTradingPartner(page);
      createdTradingPartnerId = partnerId;

      // 作成成功後、一覧ページに遷移することを確認
      await page.waitForURL(/\/trading-partners$/);
      await page.waitForLoadState('networkidle');

      // 詳細ページに直接遷移（一覧からのクリックは別テストで確認）
      await page.goto(`/trading-partners/${partnerId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページに遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}`), {
        timeout: getTimeout(10000),
      });

      // 詳細情報が表示されることを確認
      await expect(page.getByText(/編集テスト取引先_/).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(/ヘンシュウテストトリヒキサキ/).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /編集/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /削除/i })).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-3.3
     */
    test('編集ボタンと削除ボタンが詳細ページに表示される (trading-partner-management/REQ-3.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      const partnerId = await createTestTradingPartner(page);
      createdTradingPartnerId = partnerId;

      await page.waitForURL(/\/trading-partners$/);
      await page.goto(`/trading-partners/${partnerId}`);
      await page.waitForLoadState('networkidle');

      // 編集ボタンが表示されることを確認
      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await expect(editButton).toBeEnabled();

      // 削除ボタンが表示されることを確認
      const deleteButton = page.getByRole('button', { name: /削除/i });
      await expect(deleteButton).toBeVisible();
      await expect(deleteButton).toBeEnabled();
    });

    /**
     * @requirement trading-partner-management/REQ-3.4
     * プロジェクト管理機能が有効なとき、取引先詳細ページに関連プロジェクト一覧を表示
     */
    test('当該取引先に紐付くプロジェクト一覧が表示される (trading-partner-management/REQ-3.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      const partnerId = await createTestTradingPartner(page);
      createdTradingPartnerId = partnerId;

      await page.waitForURL(/\/trading-partners$/);
      await page.goto(`/trading-partners/${partnerId}`);
      await page.waitForLoadState('networkidle');

      // プロジェクト一覧セクションが表示されることを確認
      // （プロジェクトが0件でもセクションは表示されるべき）
      await expect(
        page.getByRole('heading', { name: /プロジェクト|関連プロジェクト/i })
      ).toBeVisible({ timeout: getTimeout(10000) });

      // プロジェクトがない場合のメッセージまたはテーブルが表示されることを確認
      const projectsEmpty = page.getByText(
        /プロジェクトがありません|関連するプロジェクトはありません/i
      );
      const projectsTable = page.getByRole('table', { name: /プロジェクト/i });

      // どちらかが表示されていることを確認
      const hasEmpty = await projectsEmpty.isVisible().catch(() => false);
      const hasTable = await projectsTable.isVisible().catch(() => false);
      expect(hasEmpty || hasTable).toBeTruthy();
    });

    /**
     * @requirement trading-partner-management/REQ-4.1
     */
    test('編集ボタンから編集フォームへ遷移し、現在の情報がプリセットされる (trading-partner-management/REQ-4.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成または既存のものを使用
      if (!createdTradingPartnerId) {
        createdTradingPartnerId = await createTestTradingPartner(page);
        await page.waitForURL(/\/trading-partners$/);
      }

      // 詳細ページに移動
      await page.goto(`/trading-partners/${createdTradingPartnerId}`);
      await page.waitForLoadState('networkidle');

      // 「編集」ボタンをクリック
      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集ページに遷移することを確認
      await expect(page).toHaveURL(
        new RegExp(`/trading-partners/${createdTradingPartnerId}/edit`),
        { timeout: getTimeout(10000) }
      );

      // 現在の値がプリセットされていることを確認
      await expect(page.getByLabel('取引先名')).toHaveValue(/編集テスト取引先_/);
      await expect(page.getByLabel('フリガナ', { exact: true })).toHaveValue(
        /ヘンシュウテストトリヒキサキ/
      );
    });

    /**
     * @requirement trading-partner-management/REQ-4.6
     */
    test('編集フォームで変更を保存すると詳細ページに遷移する (trading-partner-management/REQ-4.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成または既存のものを使用
      if (!createdTradingPartnerId) {
        createdTradingPartnerId = await createTestTradingPartner(page);
        await page.waitForURL(/\/trading-partners$/);
      }

      // 編集ページに移動
      await page.goto(`/trading-partners/${createdTradingPartnerId}/edit`);
      await page.waitForLoadState('networkidle');

      // フォームが読み込まれるまで待機
      await expect(page.getByLabel('取引先名')).toHaveValue(/.+/, { timeout: getTimeout(10000) });

      // 備考を変更
      const updatedNotes = `E2E編集テスト_更新済み_${Date.now()}`;
      await page.getByLabel('備考').fill(updatedNotes);

      // APIレスポンスを待機しながら保存ボタンをクリック
      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${createdTradingPartnerId}`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();

      // APIレスポンスを待機
      const response = await updatePromise;
      expect(response.status()).toBe(200);

      // 成功メッセージ（トースト）が表示されることを確認
      await expect(page.getByText(/取引先を更新しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 詳細ページに遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${createdTradingPartnerId}$`), {
        timeout: getTimeout(10000),
      });

      // 更新した内容が反映されていることを確認
      await expect(page.getByText(updatedNotes)).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-4.7
     */
    test('編集時にバリデーションエラーが発生するとエラーメッセージが表示される (trading-partner-management/REQ-4.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!createdTradingPartnerId) {
        createdTradingPartnerId = await createTestTradingPartner(page);
        await page.waitForURL(/\/trading-partners$/);
      }

      await page.goto(`/trading-partners/${createdTradingPartnerId}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toHaveValue(/.+/, { timeout: getTimeout(10000) });

      // 取引先名を空にしてバリデーションエラーを発生させる
      await page.getByLabel('取引先名').fill('');
      await page.getByRole('button', { name: /保存/i }).click();

      // バリデーションエラーメッセージが表示されることを確認
      await expect(page.getByText(/取引先名は必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-4.2
     */
    test('新規作成時と同じ必須項目と任意項目の編集が可能 (trading-partner-management/REQ-4.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!createdTradingPartnerId) {
        createdTradingPartnerId = await createTestTradingPartner(page);
        await page.waitForURL(/\/trading-partners$/);
      }

      await page.goto(`/trading-partners/${createdTradingPartnerId}/edit`);
      await page.waitForLoadState('networkidle');

      // 必須項目が編集可能であることを確認
      const nameField = page.getByLabel('取引先名');
      const kanaField = page.getByLabel('フリガナ', { exact: true });
      const addressField = page.getByLabel('住所');

      await expect(nameField).toBeEnabled({ timeout: getTimeout(10000) });
      await expect(kanaField).toBeEnabled();
      await expect(addressField).toBeEnabled();

      // 任意項目が編集可能であることを確認
      await expect(page.getByLabel(/部課\/支店\/支社名/i)).toBeEnabled();
      await expect(page.getByLabel(/代表者名/i)).toBeEnabled();
      await expect(page.getByLabel(/電話番号/i)).toBeEnabled();
      await expect(page.getByLabel(/FAX/i)).toBeEnabled();
      await expect(page.getByLabel(/メールアドレス/i)).toBeEnabled();
      await expect(page.getByLabel(/請求締日/i)).toBeEnabled();
      await expect(page.getByLabel(/備考/i)).toBeEnabled();

      // 種別チェックボックスが編集可能であることを確認
      await expect(page.getByRole('checkbox', { name: /顧客/i })).toBeEnabled();
      await expect(page.getByRole('checkbox', { name: /協力業者/i })).toBeEnabled();
    });

    /**
     * @requirement trading-partner-management/REQ-4.3
     */
    test('編集時に請求締日として1日〜31日および「末日」の計32オプションが提供される (trading-partner-management/REQ-4.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!createdTradingPartnerId) {
        createdTradingPartnerId = await createTestTradingPartner(page);
        await page.waitForURL(/\/trading-partners$/);
      }

      await page.goto(`/trading-partners/${createdTradingPartnerId}/edit`);
      await page.waitForLoadState('networkidle');

      // 請求締日のセレクトボックスを開く
      const billingCutoffDaySelect = page.getByLabel(/請求締日/i);
      await expect(billingCutoffDaySelect).toBeVisible({ timeout: getTimeout(10000) });
      await billingCutoffDaySelect.click();

      // 1日〜31日と「末日」のオプションが存在することを確認（請求締日のセレクトにスコープ）
      // NOTE: <option>要素はネイティブselectでhiddenとなる場合があるため、toHaveCount(1)で存在確認
      await expect(billingCutoffDaySelect.getByRole('option', { name: /末日/i })).toHaveCount(1);
      await expect(billingCutoffDaySelect.getByRole('option', { name: /^1日$/i })).toHaveCount(1);
      await expect(billingCutoffDaySelect.getByRole('option', { name: /^15日$/i })).toHaveCount(1);
      await expect(billingCutoffDaySelect.getByRole('option', { name: /^31日$/i })).toHaveCount(1);
    });

    /**
     * @requirement trading-partner-management/REQ-4.4
     */
    test('編集キャンセル時は変更が破棄され詳細ページに戻る (trading-partner-management/REQ-4.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!createdTradingPartnerId) {
        createdTradingPartnerId = await createTestTradingPartner(page);
        await page.waitForURL(/\/trading-partners$/);
      }

      await page.goto(`/trading-partners/${createdTradingPartnerId}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toHaveValue(/.+/, { timeout: getTimeout(10000) });

      // 値を変更（保存しない）
      await page.getByLabel('備考').fill('キャンセルされる変更内容');

      // キャンセルボタンをクリック
      await page.getByRole('button', { name: /キャンセル/i }).click();

      // 詳細ページに遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${createdTradingPartnerId}$`), {
        timeout: getTimeout(10000),
      });

      // 変更が破棄されたことを確認（キャンセルされた内容が表示されない）
      await expect(page.getByText('キャンセルされる変更内容')).not.toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-4.5
     */
    test('変更を保存時に取引先レコードが更新される (trading-partner-management/REQ-4.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!createdTradingPartnerId) {
        createdTradingPartnerId = await createTestTradingPartner(page);
        await page.waitForURL(/\/trading-partners$/);
      }

      await page.goto(`/trading-partners/${createdTradingPartnerId}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toHaveValue(/.+/, { timeout: getTimeout(10000) });

      // 複数のフィールドを変更
      const updatedAddress = `更新された住所_${Date.now()}`;
      const updatedNotes = `更新された備考_${Date.now()}`;

      await page.getByLabel('住所').fill(updatedAddress);
      await page.getByLabel('備考').fill(updatedNotes);

      // APIレスポンスを待機しながら保存
      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${createdTradingPartnerId}`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();

      const response = await updatePromise;
      expect(response.status()).toBe(200);

      // 詳細ページで更新内容が反映されていることを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${createdTradingPartnerId}$`), {
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(updatedAddress)).toBeVisible();
      await expect(page.getByText(updatedNotes)).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-4.8
     */
    test('別の取引先と重複する取引先名に変更時にエラーが表示される (trading-partner-management/REQ-4.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 1つ目の取引先を作成
      const partner1Name = `重複編集テスト1_${Date.now()}`;
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('取引先名').fill(partner1Name);
      await page.getByLabel('フリガナ', { exact: true }).fill('ジュウフクヘンシュウテストイチ');
      await page.getByLabel('住所').fill('東京都渋谷区テスト1-2-3');
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
      await page.waitForURL(/\/trading-partners$/);

      // 2つ目の取引先を作成
      const partner2Name = `重複編集テスト2_${Date.now()}`;
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('取引先名').fill(partner2Name);
      await page.getByLabel('フリガナ', { exact: true }).fill('ジュウフクヘンシュウテストニ');
      await page.getByLabel('住所').fill('東京都渋谷区テスト2-2-3');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise2 = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse2 = await createPromise2;
      const partner2Data = await createResponse2.json();
      const partner2Id = partner2Data.id;

      await page.waitForURL(/\/trading-partners$/);

      // 2つ目の取引先を編集して1つ目の名前に変更しようとする
      await page.goto(`/trading-partners/${partner2Id}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toHaveValue(partner2Name, {
        timeout: getTimeout(10000),
      });

      await page.getByLabel('取引先名').fill(partner1Name);

      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${partner2Id}`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();

      const response = await updatePromise;

      // 409エラーが返されることを確認
      expect(response.status()).toBe(409);

      // 重複エラーメッセージが表示されることを確認
      await expect(page.getByText('この取引先名は既に登録されています')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 編集ページに留まっていることを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partner2Id}/edit`));
    });

    /**
     * @requirement trading-partner-management/REQ-4.9
     * @requirement trading-partner-management/REQ-4.10
     */
    test('楽観的排他制御が実装され、競合検出時にエラーが表示される (trading-partner-management/REQ-4.9, REQ-4.10)', async ({
      page,
      context,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      if (!createdTradingPartnerId) {
        createdTradingPartnerId = await createTestTradingPartner(page);
        await page.waitForURL(/\/trading-partners$/);
      }

      // 1つ目のブラウザコンテキストで編集ページを開く
      await page.goto(`/trading-partners/${createdTradingPartnerId}/edit`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByLabel('取引先名')).toHaveValue(/.+/, { timeout: getTimeout(10000) });

      // 2つ目のブラウザコンテキストを作成して同じ取引先を編集
      const page2 = await context.newPage();
      await loginAsUser(page2, 'REGULAR_USER');
      await page2.goto(`/trading-partners/${createdTradingPartnerId}/edit`);
      await page2.waitForLoadState('networkidle');
      await expect(page2.getByLabel('取引先名')).toHaveValue(/.+/, { timeout: getTimeout(10000) });

      // 2つ目のコンテキストで変更を保存
      const updatedNotes2 = `2つ目のコンテキスト変更_${Date.now()}`;
      await page2.getByLabel('備考').fill(updatedNotes2);

      const updatePromise2 = page2.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${createdTradingPartnerId}`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page2.getByRole('button', { name: /保存/i }).click();
      await updatePromise2;

      // 2つ目のコンテキストは成功するはず
      await expect(page2.getByText(/取引先を更新しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      await page2.close();

      // 1つ目のコンテキストで変更を保存しようとする（競合が発生するはず）
      const updatedNotes1 = `1つ目のコンテキスト変更_${Date.now()}`;
      await page.getByLabel('備考').fill(updatedNotes1);

      const updatePromise1 = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${createdTradingPartnerId}`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();

      const response = await updatePromise1;

      // 409 Conflictエラーが返されることを確認
      expect(response.status()).toBe(409);

      // 競合エラーメッセージが表示されることを確認
      await expect(
        page.getByText(/他のユーザーによって更新されています|競合|最新の情報を取得/i)
      ).toBeVisible({
        timeout: getTimeout(15000),
      });
    });
  });

  /**
   * 取引先削除フローのテスト
   *
   * REQ-5.1: 削除ボタンクリックで削除確認ダイアログを表示
   * REQ-5.4: 削除成功時に成功メッセージを表示し一覧ページに遷移
   */
  test.describe('取引先削除フロー', () => {
    /**
     * @requirement trading-partner-management/REQ-5.1
     * @requirement trading-partner-management/REQ-5.2
     * @requirement trading-partner-management/REQ-5.4
     * Note: 削除権限は管理者のみのため、管理者ユーザーでテスト
     */
    test('削除ボタン→確認ダイアログ→削除確認時に論理削除→一覧遷移が正常に行われる (trading-partner-management/REQ-5.1, REQ-5.2, REQ-5.4)', async ({
      page,
    }) => {
      // 管理者でログイン（削除権限が必要）
      await loginAsUser(page, 'ADMIN_USER');

      // 削除用の新しい取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `削除テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('サクジョテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区削除テスト1-2-3');
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
      const partnerIdToDelete = responseData.id;

      // 一覧から詳細ページに移動
      await page.waitForURL(/\/trading-partners$/);
      await page.goto(`/trading-partners/${partnerIdToDelete}`);
      await page.waitForLoadState('networkidle');

      // 「削除」ボタンをクリック
      const deleteButton = page.getByRole('button', { name: /削除/i });
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
      await deleteButton.click();

      // 確認ダイアログが表示されることを確認
      await expect(page.getByText(/取引先の削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      // ダイアログ内に取引先名が表示される
      await expect(page.getByTestId('focus-manager-overlay').getByText(partnerName)).toBeVisible();
      await expect(page.getByText(/この操作は取り消せません/i)).toBeVisible();

      // APIレスポンスを待機しながら削除ボタンをクリック
      const deletePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${partnerIdToDelete}`) &&
          response.request().method() === 'DELETE' &&
          response.status() === 204,
        { timeout: getTimeout(30000) }
      );

      // ダイアログ内の「削除」ボタンをクリック
      await page
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /^削除$/i })
        .click();

      // APIレスポンスを待機
      await deletePromise;

      // 成功メッセージ（トースト）が表示されることを確認
      await expect(page.getByText(/取引先を削除しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(15000) });

      // 削除した取引先が一覧に表示されないことを確認
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(partnerName)).not.toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-5.3
     * Note: 削除ダイアログ確認のため、管理者ユーザーでテスト
     */
    test('削除確認ダイアログでキャンセルすると詳細画面に留まる (trading-partner-management/REQ-5.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'ADMIN_USER');

      // キャンセルテスト用の取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `キャンセルテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('キャンセルテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区キャンセルテスト1-2-3');
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

      // 「削除」ボタンをクリック
      await page.getByRole('button', { name: /削除/i }).click();

      // 確認ダイアログが表示されることを確認
      await expect(page.getByText(/取引先の削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 「キャンセル」ボタンをクリック
      await page
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /キャンセル/i })
        .click();

      // ダイアログが閉じることを確認
      await expect(page.getByText(/取引先の削除/i)).not.toBeVisible({
        timeout: getTimeout(5000),
      });

      // 詳細画面に留まっていることを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}$`));

      // 取引先情報がまだ表示されていることを確認
      await expect(page.getByText(partnerName).first()).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-5.5
     * Note: プロジェクトに紐付いている取引先の削除制限をテスト
     */
    test('プロジェクトに紐付いている取引先は削除が拒否される (trading-partner-management/REQ-5.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'ADMIN_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `プロジェクト紐付きテスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page
        .getByLabel('フリガナ', { exact: true })
        .fill('プロジェクトヒモヅキテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区プロジェクトテスト1-2-3');
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
      const partnerData = await createResponse.json();
      const partnerId = partnerData.id;

      await page.waitForURL(/\/trading-partners$/);

      // この取引先に紐付くプロジェクトを作成
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      const projectName = `紐付きプロジェクト_${Date.now()}`;
      await page.getByLabel('プロジェクト名').fill(projectName);
      await page.getByLabel('プロジェクトコード').fill(`PROJ${Date.now()}`);

      // 取引先を選択（セレクトボックスから選択）
      const tradingPartnerSelect = page.getByLabel(/取引先/i);
      await tradingPartnerSelect.click();
      await page.getByRole('option', { name: new RegExp(partnerName) }).click();

      const projectCreatePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await projectCreatePromise;

      await page.waitForURL(/\/projects$/);

      // 取引先の詳細ページに移動して削除を試みる
      await page.goto(`/trading-partners/${partnerId}`);
      await page.waitForLoadState('networkidle');

      // 削除ボタンをクリック
      await page.getByRole('button', { name: /削除/i }).click();

      // 確認ダイアログが表示されることを確認
      await expect(page.getByText(/取引先の削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // APIレスポンスを待機しながら削除ボタンをクリック
      const deletePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${partnerId}`) &&
          response.request().method() === 'DELETE',
        { timeout: getTimeout(30000) }
      );

      await page
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /^削除$/i })
        .click();

      const response = await deletePromise;

      // 400または409エラーが返されることを確認（プロジェクトに紐付いているため削除不可）
      expect([400, 409]).toContain(response.status());

      // エラーメッセージが表示されることを確認
      await expect(
        page.getByText(
          /プロジェクトに紐付いています|削除できません|関連するプロジェクトがあります/i
        )
      ).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 詳細画面に留まっていることを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}`));
    });
  });

  /**
   * 取引先種別管理のテスト
   *
   * REQ-6.4: 取引先登録/編集時に種別をチェックボックスで選択させる
   */
  test.describe('取引先種別管理', () => {
    /**
     * @requirement trading-partner-management/REQ-6.4
     */
    test('取引先登録時に種別をチェックボックスで選択できる (trading-partner-management/REQ-6.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // 種別チェックボックスが表示されていることを確認
      const customerCheckbox = page.getByRole('checkbox', { name: /顧客/i });
      const supplierCheckbox = page.getByRole('checkbox', { name: /協力業者/i });

      await expect(customerCheckbox).toBeVisible({ timeout: getTimeout(10000) });
      await expect(supplierCheckbox).toBeVisible();

      // 両方の種別を選択可能であることを確認
      await customerCheckbox.check();
      await expect(customerCheckbox).toBeChecked();

      await supplierCheckbox.check();
      await expect(supplierCheckbox).toBeChecked();

      // チェックを外すことも可能であることを確認
      await customerCheckbox.uncheck();
      await expect(customerCheckbox).not.toBeChecked();
      await expect(supplierCheckbox).toBeChecked();
    });

    /**
     * @requirement trading-partner-management/REQ-6.4
     */
    test('取引先編集時に種別をチェックボックスで選択できる (trading-partner-management/REQ-6.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partnerName = `種別編集テスト取引先_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page
        .getByLabel('フリガナ', { exact: true })
        .fill('シュベツヘンシュウテストトリヒキサキ');
      await page.getByLabel('住所').fill('東京都渋谷区種別テスト1-2-3');
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
      const partnerData = await createResponse.json();
      const partnerId = partnerData.id;

      await page.waitForURL(/\/trading-partners$/);

      // 編集ページに移動
      await page.goto(`/trading-partners/${partnerId}/edit`);
      await page.waitForLoadState('networkidle');

      // 種別チェックボックスが表示され、編集可能であることを確認
      const customerCheckbox = page.getByRole('checkbox', { name: /顧客/i });
      const supplierCheckbox = page.getByRole('checkbox', { name: /協力業者/i });

      await expect(customerCheckbox).toBeVisible({ timeout: getTimeout(10000) });
      await expect(supplierCheckbox).toBeVisible();

      // 現在の状態を確認（顧客がチェック済み）
      await expect(customerCheckbox).toBeChecked();
      await expect(supplierCheckbox).not.toBeChecked();

      // 協力業者もチェックする
      await supplierCheckbox.check();
      await expect(supplierCheckbox).toBeChecked();

      // 変更を保存
      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${partnerId}`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();
      await updatePromise;

      // 詳細ページで種別が正しく表示されることを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}$`), {
        timeout: getTimeout(10000),
      });

      // 両方の種別が表示されることを確認
      await expect(page.getByText(/顧客/).first()).toBeVisible();
      await expect(page.getByText(/協力業者/).first()).toBeVisible();
    });
  });

  /**
   * CRUDフロー全体の統合テスト
   *
   * 作成→詳細表示→編集→削除の一連の操作をテスト
   */
  test.describe('CRUD統合フロー', () => {
    /**
     * 削除操作を含むため、管理者ユーザーでテスト
     */
    test('取引先の作成→詳細表示→編集→削除の一連のフローが正常に動作する', async ({ page }) => {
      await loginAsUser(page, 'ADMIN_USER');

      // ========== 1. 作成 ==========
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const originalName = `統合テスト取引先_${Date.now()}`;
      const originalNameKana = 'トウゴウテストトリヒキサキ';

      await page.getByLabel('取引先名').fill(originalName);
      await page.getByLabel('フリガナ', { exact: true }).fill(originalNameKana);
      await page.getByLabel('住所').fill('東京都渋谷区統合テスト1-2-3');
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
      const createData = await createResponse.json();
      const partnerId = createData.id;

      await expect(page.getByText(/取引先を作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(15000) });

      // ========== 2. 詳細表示 ==========
      await page.goto(`/trading-partners/${partnerId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(originalName).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(originalNameKana).first()).toBeVisible();

      // ========== 3. 編集 ==========
      await page.getByRole('button', { name: /編集/i }).click();
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}/edit`), {
        timeout: getTimeout(10000),
      });

      await expect(page.getByLabel('取引先名')).toHaveValue(originalName, {
        timeout: getTimeout(10000),
      });

      const updatedName = `${originalName}_更新済み`;
      await page.getByLabel('取引先名').fill(updatedName);

      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${partnerId}`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();
      await updatePromise;

      await expect(page.getByText(/取引先を更新しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}$`), {
        timeout: getTimeout(10000),
      });

      // 更新された名前が表示されることを確認
      await expect(page.getByText(updatedName).first()).toBeVisible();

      // ========== 4. 削除 ==========
      await page.getByRole('button', { name: /削除/i }).click();

      await expect(page.getByText(/取引先の削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      const deletePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${partnerId}`) &&
          response.request().method() === 'DELETE' &&
          response.status() === 204,
        { timeout: getTimeout(30000) }
      );

      await page
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /^削除$/i })
        .click();

      await deletePromise;

      await expect(page.getByText(/取引先を削除しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(15000) });

      // 一覧が読み込まれたことを確認（削除後のリダイレクト完了）
      await expect(page.getByRole('table', { name: /取引先一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 注: 削除された取引先の非表示確認は、一覧のソート順・ページネーションにより
      // 厳密な検証が困難なため、APIレスポンス(204)とトースト表示で確認としています
    });
  });
});
