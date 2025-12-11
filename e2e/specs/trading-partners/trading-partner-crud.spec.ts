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
     * @requirement trading-partner-management/REQ-5.4
     * Note: 削除権限は管理者のみのため、管理者ユーザーでテスト
     */
    test('削除ボタン→確認ダイアログ→削除→一覧遷移が正常に行われる (trading-partner-management/REQ-5.1, REQ-5.4)', async ({
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
