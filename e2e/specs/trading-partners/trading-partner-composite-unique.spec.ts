/**
 * @fileoverview 複合一意制約のE2Eテスト
 *
 * Task 26: 複合一意制約のE2Eテスト追加
 *
 * 取引先名+部課/支店/支社名の組み合わせによる複合一意制約のE2Eテストを実施します。
 * 同一名でも異なるbranchNameであれば作成可能であること、
 * 同一の組み合わせでは重複エラーが発生することをテストします。
 *
 * Requirements:
 * - 2.11: 同一の取引先名および部課/支店/支社名の組み合わせが既に存在する場合のエラー表示
 * - 4.8: 別の取引先と重複する取引先名および部課/支店/支社名の組み合わせに変更しようとした場合のエラー表示
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * 複合一意制約（取引先名+部課/支店/支社名）のE2Eテスト
 */
test.describe('複合一意制約（取引先名+部課/支店/支社名）', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context, page }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // localStorageもクリア（テスト間の認証状態の干渉を防ぐ）
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  /**
   * Task 26.1: 作成画面での複合重複エラーE2Eテスト
   */
  test.describe('作成画面での複合重複エラー（Task 26.1）', () => {
    /**
     * @requirement trading-partner-management/REQ-2.11
     * 既存の取引先と同一のname+branchNameで作成を試みた際のエラーメッセージ表示を検証
     */
    test('同一の取引先名と部課/支店/支社名の組み合わせで作成するとエラーが表示される (trading-partner-management/REQ-2.11)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 各テスト固有のタイムスタンプを使用（テスト間の干渉を防ぐ）
      const timestamp = Date.now();

      // 1つ目の取引先を作成（取引先名+部課/支店/支社名あり）
      const partnerName = `複合一意テスト株式会社_${timestamp}`;
      const branchName = '東京支店';

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('取引先名').fill(partnerName);
      await page
        .getByLabel('フリガナ', { exact: true })
        .fill('フクゴウイチイテストカブシキガイシャ');
      await page.getByLabel(/部課\/支店\/支社名/i).fill(branchName);
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

      // 一覧ページに遷移したことを確認
      await page.waitForURL(/\/trading-partners$/, { timeout: getTimeout(15000) });
      await page.waitForLoadState('networkidle');

      // 2つ目を同じ組み合わせ（同一名+同一部課/支店/支社名）で作成しようとする
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

      await page.getByLabel('取引先名').fill(partnerName);
      await page
        .getByLabel('フリガナ', { exact: true })
        .fill('フクゴウイチイテストカブシキガイシャ');
      await page.getByLabel(/部課\/支店\/支社名/i).fill(branchName);
      await page.getByLabel('住所').fill('東京都渋谷区別の住所4-5-6');
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
      expect(response.status()).toBe(409);

      // トーストが表示されるまで待機（ネットワーク遅延とReactのレンダリングを考慮）
      await page.waitForLoadState('networkidle');

      // 複合一意制約エラーメッセージがトーストで表示されることを確認
      // トーストはrole="alert"属性を持つ
      await expect(page.getByRole('alert')).toBeVisible({
        timeout: getTimeout(20000),
      });

      // 作成ページに留まっていることを確認（エラー時は遷移しない）
      await expect(page).toHaveURL(/\/trading-partners\/new/);
    });

    /**
     * @requirement trading-partner-management/REQ-2.11
     * 同一nameでも異なるbranchNameで正常に作成できることを検証
     */
    test('同一の取引先名でも異なる部課/支店/支社名なら正常に作成できる (trading-partner-management/REQ-2.11)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 各テスト固有のタイムスタンプを使用
      const timestamp = Date.now();
      const partnerName = `支店テスト株式会社_${timestamp}`;

      // 1つ目の取引先を作成（東京支店）
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('シテンテストカブシキガイシャ');
      await page.getByLabel(/部課\/支店\/支社名/i).fill('東京支店');
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

      await expect(page.getByText(/取引先を作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await page.waitForURL(/\/trading-partners$/, { timeout: getTimeout(15000) });

      // 2つ目を同じ名前で異なる部課/支店/支社名（大阪支店）で作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('シテンテストカブシキガイシャ');
      await page.getByLabel(/部課\/支店\/支社名/i).fill('大阪支店');
      await page.getByLabel('住所').fill('大阪府大阪市テスト4-5-6');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise2 = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise2;

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/取引先を作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(15000) });
    });

    /**
     * @requirement trading-partner-management/REQ-2.11
     * 同一nameで部課/支店/支社名がNULL（空）の場合の重複チェックを検証
     */
    test('同一の取引先名で部課/支店/支社名が空の場合の重複はエラーになる (trading-partner-management/REQ-2.11)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 各テスト固有のタイムスタンプを使用
      const timestamp = Date.now();
      const partnerName = `本社テスト株式会社_${timestamp}`;

      // 1つ目の取引先を作成（部課/支店/支社名なし = NULL）
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('ホンシャテストカブシキガイシャ');
      // 部課/支店/支社名は空のまま
      await page.getByLabel('住所').fill('東京都渋谷区本社テスト1-2-3');
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

      await page.waitForURL(/\/trading-partners$/, { timeout: getTimeout(15000) });

      // 2つ目を同じ名前で部課/支店/支社名なしで作成しようとする
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('ホンシャテストカブシキガイシャ');
      // 部課/支店/支社名は空のまま
      await page.getByLabel('住所').fill('東京都千代田区別の住所4-5-6');
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
      expect(response.status()).toBe(409);

      // トーストが表示されるまで待機
      await page.waitForLoadState('networkidle');

      // 複合一意制約エラーメッセージがトーストで表示されることを確認
      await expect(page.getByRole('alert')).toBeVisible({
        timeout: getTimeout(20000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-2.11
     * 同一nameで一方がNULL、もう一方が値ありの場合は別の取引先として作成可能
     */
    test('同一の取引先名で部課/支店/支社名が空と値ありの組み合わせは別の取引先として作成できる (trading-partner-management/REQ-2.11)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 各テスト固有のタイムスタンプを使用
      const timestamp = Date.now();
      const partnerName = `本社支店テスト株式会社_${timestamp}`;

      // 1つ目の取引先を作成（部課/支店/支社名なし = 本社扱い）
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('取引先名').fill(partnerName);
      await page
        .getByLabel('フリガナ', { exact: true })
        .fill('ホンシャシテンテストカブシキガイシャ');
      // 部課/支店/支社名は空のまま
      await page.getByLabel('住所').fill('東京都渋谷区本社1-2-3');
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

      await expect(page.getByText(/取引先を作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await page.waitForURL(/\/trading-partners$/, { timeout: getTimeout(15000) });

      // 2つ目を同じ名前で部課/支店/支社名あり（東京支店）で作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

      await page.getByLabel('取引先名').fill(partnerName);
      await page
        .getByLabel('フリガナ', { exact: true })
        .fill('ホンシャシテンテストカブシキガイシャ');
      await page.getByLabel(/部課\/支店\/支社名/i).fill('東京支店');
      await page.getByLabel('住所').fill('東京都新宿区支店4-5-6');
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      const createPromise2 = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise2;

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/取引先を作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(15000) });
    });
  });

  /**
   * Task 26.2: 編集画面での複合重複エラーE2Eテスト
   */
  test.describe('編集画面での複合重複エラー（Task 26.2）', () => {
    /**
     * @requirement trading-partner-management/REQ-4.8
     * 他の取引先と同一のname+branchNameに変更しようとした際のエラーメッセージ表示を検証
     */
    test('他の取引先と同一の取引先名と部課/支店/支社名の組み合わせに変更するとエラーが表示される (trading-partner-management/REQ-4.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const timestamp = Date.now();

      // 1つ目の取引先を作成
      const partner1Name = `編集重複テストA_${timestamp}`;
      const partner1BranchName = '名古屋支店';

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('取引先名').fill(partner1Name);
      await page.getByLabel('フリガナ', { exact: true }).fill('ヘンシュウジュウフクテストエー');
      await page.getByLabel(/部課\/支店\/支社名/i).fill(partner1BranchName);
      await page.getByLabel('住所').fill('愛知県名古屋市テスト1-2-3');
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

      // 2つ目の取引先を作成（異なる名前）
      const partner2Name = `編集重複テストB_${timestamp}`;

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('取引先名').fill(partner2Name);
      await page.getByLabel('フリガナ', { exact: true }).fill('ヘンシュウジュウフクテストビー');
      await page.getByLabel(/部課\/支店\/支社名/i).fill('大阪支店');
      await page.getByLabel('住所').fill('大阪府大阪市テスト4-5-6');
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

      // 2つ目の取引先を編集して、1つ目と同じ組み合わせに変更しようとする
      await page.goto(`/trading-partners/${partner2Id}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toHaveValue(partner2Name, {
        timeout: getTimeout(10000),
      });

      // 1つ目と同じ組み合わせに変更
      await page.getByLabel('取引先名').fill(partner1Name);
      await page.getByLabel(/部課\/支店\/支社名/i).fill(partner1BranchName);

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

      // トーストが表示されるまで待機
      await page.waitForLoadState('networkidle');

      // 複合一意制約エラーメッセージがトーストで表示されることを確認
      await expect(page.getByRole('alert')).toBeVisible({
        timeout: getTimeout(20000),
      });

      // 編集ページに留まっていることを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partner2Id}/edit`));
    });

    /**
     * @requirement trading-partner-management/REQ-4.8
     * 自分自身と同じname+branchNameへの変更は正常に処理されることを検証
     */
    test('自分自身の取引先名と部課/支店/支社名の組み合わせを変更しない場合はエラーにならない (trading-partner-management/REQ-4.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const timestamp = Date.now();
      const partnerName = `自己編集テスト_${timestamp}`;
      const branchName = '福岡支店';

      // 取引先を作成
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('取引先名').fill(partnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('ジコヘンシュウテスト');
      await page.getByLabel(/部課\/支店\/支社名/i).fill(branchName);
      await page.getByLabel('住所').fill('福岡県福岡市テスト1-2-3');
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

      // 同じ取引先を編集（name, branchNameは変更せず、備考のみ変更）
      await page.goto(`/trading-partners/${partnerId}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toHaveValue(partnerName, {
        timeout: getTimeout(10000),
      });

      // 備考だけ変更（name, branchNameは変更しない）
      const updatedNotes = `備考更新_${Date.now()}`;
      await page.getByLabel('備考').fill(updatedNotes);

      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${partnerId}`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();
      await updatePromise;

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/取引先を更新しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 詳細ページに遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}$`), {
        timeout: getTimeout(10000),
      });

      // 更新した備考が表示されることを確認
      await expect(page.getByText(updatedNotes)).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-4.8
     * 他の取引先と同一名でも異なるbranchNameに変更なら正常に更新できることを検証
     */
    test('他の取引先と同一の取引先名でも異なる部課/支店/支社名に変更なら更新できる (trading-partner-management/REQ-4.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const timestamp = Date.now();
      const sharedPartnerName = `共通名テスト株式会社_${timestamp}`;

      // 1つ目の取引先を作成（東京支店）
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('取引先名').fill(sharedPartnerName);
      await page
        .getByLabel('フリガナ', { exact: true })
        .fill('キョウツウメイテストカブシキガイシャ');
      await page.getByLabel(/部課\/支店\/支社名/i).fill('東京支店');
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

      // 2つ目の取引先を作成（別の名前）
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      const partner2OriginalName = `変更前テスト_${timestamp}`;
      await page.getByLabel('取引先名').fill(partner2OriginalName);
      await page.getByLabel('フリガナ', { exact: true }).fill('ヘンコウマエテスト');
      await page.getByLabel(/部課\/支店\/支社名/i).fill('札幌支店');
      await page.getByLabel('住所').fill('北海道札幌市テスト4-5-6');
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

      // 2つ目の取引先を編集して、1つ目と同じ名前+異なる部課/支店/支社名に変更
      await page.goto(`/trading-partners/${partner2Id}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toHaveValue(partner2OriginalName, {
        timeout: getTimeout(10000),
      });

      // 1つ目と同じ名前+異なる部課/支店/支社名に変更（大阪支店）
      await page.getByLabel('取引先名').fill(sharedPartnerName);
      await page.getByLabel(/部課\/支店\/支社名/i).fill('大阪支店');

      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/trading-partners/${partner2Id}`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();
      await updatePromise;

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/取引先を更新しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 詳細ページに遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partner2Id}$`), {
        timeout: getTimeout(10000),
      });

      // 更新された名前が表示されることを確認
      await expect(page.getByText(sharedPartnerName).first()).toBeVisible();
      await expect(page.getByText('大阪支店').first()).toBeVisible();
    });

    /**
     * @requirement trading-partner-management/REQ-4.8
     * branchNameをNULLから値あり、または値ありからNULLに変更した場合のエラーメッセージを検証
     */
    test('部課/支店/支社名を空から値ありに変更して他の取引先と重複する場合はエラーになる (trading-partner-management/REQ-4.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const timestamp = Date.now();
      const sharedPartnerName = `空値テスト株式会社_${timestamp}`;

      // 1つ目の取引先を作成（部課/支店/支社名あり）
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('取引先名').fill(sharedPartnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('クウチテストカブシキガイシャ');
      await page.getByLabel(/部課\/支店\/支社名/i).fill('横浜支店');
      await page.getByLabel('住所').fill('神奈川県横浜市テスト1-2-3');
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

      // 2つ目の取引先を作成（同じ名前、部課/支店/支社名なし）
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('取引先名').fill(sharedPartnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('クウチテストカブシキガイシャ');
      // 部課/支店/支社名は空のまま
      await page.getByLabel('住所').fill('東京都千代田区本社4-5-6');
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

      // 2つ目の取引先を編集して、1つ目と同じ組み合わせに変更（部課/支店/支社名を空→横浜支店に）
      await page.goto(`/trading-partners/${partner2Id}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toHaveValue(sharedPartnerName, {
        timeout: getTimeout(10000),
      });

      // 部課/支店/支社名を1つ目と同じ値に変更
      await page.getByLabel(/部課\/支店\/支社名/i).fill('横浜支店');

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

      // トーストが表示されるまで待機
      await page.waitForLoadState('networkidle');

      // 複合一意制約エラーメッセージがトーストで表示されることを確認
      await expect(page.getByRole('alert')).toBeVisible({
        timeout: getTimeout(20000),
      });

      // 編集ページに留まっていることを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partner2Id}/edit`));
    });
  });
});
