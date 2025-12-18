/**
 * @fileoverview 現場調査CRUD操作のE2Eテスト
 *
 * Task 26.2: 現場調査のE2Eテストを実装する
 *
 * Requirements:
 * - 1.1: 現場調査作成フォームで必須フィールド（調査名、調査日）を入力可能
 * - 1.2: GET /api/site-surveys/:id 現場調査詳細取得
 * - 1.3: PUT /api/site-surveys/:id 現場調査更新（楽観的排他制御）
 * - 1.4: DELETE /api/site-surveys/:id 現場調査削除
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * 現場調査CRUD機能のE2Eテスト
 */
test.describe('現場調査CRUD操作', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストで作成したプロジェクトのIDを保存
  let createdProjectId: string | null = null;
  // テストで作成した現場調査のIDを保存
  let createdSurveyId: string | null = null;

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  /**
   * テスト用プロジェクトを作成する
   */
  test.describe('事前準備', () => {
    test('テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // 新規作成ボタンをクリック
      const createButton = page.getByRole('button', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 作成ページに遷移
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // プロジェクトを作成
      const projectName = `現場調査テスト用プロジェクト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      // 営業担当者を確認・選択
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const salesPersonValue = await salesPersonSelect.inputValue();
      if (!salesPersonValue) {
        const options = await salesPersonSelect.locator('option').all();
        if (options.length > 1 && options[1]) {
          const firstUserOption = await options[1].getAttribute('value');
          if (firstUserOption) {
            await salesPersonSelect.selectOption(firstUserOption);
          }
        }
      }

      // APIレスポンスを待機しながら作成ボタンをクリック
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // URLからプロジェクトIDを取得
      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = match?.[1] ?? null;

      expect(createdProjectId).toBeTruthy();
    });
  });

  /**
   * 現場調査作成フローのテスト
   *
   * REQ-1.1: 現場調査作成フォームで必須フィールド（調査名、調査日）を入力可能
   */
  test.describe('現場調査作成フロー', () => {
    /**
     * @requirement site-survey/REQ-1.1
     */
    test('プロジェクト詳細から現場調査一覧へ遷移できる', async ({ page }) => {
      if (!createdProjectId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細ページに移動
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 現場調査タブまたはリンクを探してクリック
      const surveyLink = page.getByRole('link', { name: /現場調査/i });
      await expect(surveyLink).toBeVisible({ timeout: getTimeout(10000) });
      await surveyLink.click();

      // 現場調査一覧ページに遷移
      await expect(page).toHaveURL(new RegExp(`/projects/${createdProjectId}/site-surveys`), {
        timeout: getTimeout(10000),
      });

      // 一覧ページが表示されることを確認
      await expect(page.getByRole('heading', { name: /現場調査/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement site-survey/REQ-1.1
     */
    test('新規作成ボタンから作成フォームへ遷移できる', async ({ page }) => {
      if (!createdProjectId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 現場調査一覧ページに移動
      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // 「新規作成」ボタンまたはリンクをクリック（ヘッダーの最初のリンクを使用）
      const createButton = page.getByRole('link', { name: /新規作成/i }).first();
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 作成ページに遷移
      await expect(page).toHaveURL(new RegExp(`/projects/${createdProjectId}/site-surveys/new`), {
        timeout: getTimeout(10000),
      });

      // フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /新規現場調査/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByLabel(/調査名/i)).toBeVisible();
      await expect(page.getByLabel(/調査日/i)).toBeVisible();
    });

    /**
     * @requirement site-survey/REQ-1.1
     */
    test('現場調査を作成できる', async ({ page }) => {
      if (!createdProjectId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 作成ページに移動
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // フォームに入力
      const surveyName = `E2Eテスト現場調査_${Date.now()}`;
      const surveyDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD形式
      const memo = 'E2Eテスト用のメモです。';

      await page.getByLabel(/調査名/i).fill(surveyName);
      await page.getByLabel(/調査日/i).fill(surveyDate!);
      await page.getByLabel(/メモ/i).fill(memo);

      // APIレスポンスを待機しながら作成ボタンをクリック
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/') &&
          response.url().includes('site-surveys') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();

      // APIレスポンスを待機
      const response = await createPromise;
      expect(response.status()).toBe(201);

      // 詳細画面に遷移することを確認
      await expect(page).toHaveURL(/\/site-surveys\/[0-9a-f-]+$/, {
        timeout: getTimeout(15000),
      });

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/現場調査を作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 詳細画面に作成した情報が表示されることを確認
      await expect(page.getByText(surveyName)).toBeVisible();

      // 作成した現場調査のIDを保存
      const url = page.url();
      const match = url.match(/\/site-surveys\/([0-9a-f-]+)$/);
      createdSurveyId = match?.[1] ?? null;
    });

    /**
     * @requirement site-survey/REQ-1.1
     */
    test('必須項目未入力時にバリデーションエラーが表示される', async ({ page }) => {
      if (!createdProjectId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 作成ページに移動
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      // 何も入力せずに作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/調査名は必須です|名前は必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });
  });

  /**
   * 現場調査詳細表示のテスト
   *
   * REQ-1.2: GET /api/site-surveys/:id 現場調査詳細取得
   */
  test.describe('現場調査詳細表示', () => {
    /**
     * @requirement site-survey/REQ-1.2
     */
    test('現場調査詳細を表示できる', async ({ page }) => {
      if (!createdSurveyId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 詳細ページに移動
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 詳細情報が表示されることを確認
      await expect(page.getByText(/E2Eテスト現場調査/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // ブレッドクラムナビゲーションが表示されることを確認
      await expect(page.getByRole('navigation', { name: /パンくず|breadcrumb/i })).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 編集ボタンと削除ボタンが表示されることを確認
      await expect(page.getByRole('button', { name: /編集/i })).toBeVisible();
    });
  });

  /**
   * 現場調査編集フローのテスト
   *
   * REQ-1.3: PUT /api/site-surveys/:id 現場調査更新（楽観的排他制御）
   */
  test.describe('現場調査編集フロー', () => {
    /**
     * @requirement site-survey/REQ-1.3
     */
    test('編集ボタン→フォーム表示→保存が正常に行われる', async ({ page }) => {
      if (!createdSurveyId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 詳細ページに移動
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 編集ボタンをクリック
      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集ページに遷移
      await expect(page).toHaveURL(new RegExp(`/site-surveys/${createdSurveyId}/edit`), {
        timeout: getTimeout(10000),
      });

      // 編集フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /現場調査を編集|編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 現在の値がプリセットされていることを確認
      await expect(page.getByLabel(/調査名/i)).toHaveValue(/.+/);

      // 値を変更
      const updatedMemo = `E2E編集テスト_更新済み_${Date.now()}`;
      await page.getByLabel(/メモ/i).fill(updatedMemo);

      // APIレスポンスを待機しながら保存ボタンをクリック
      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/site-surveys/${createdSurveyId}`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存|更新/i }).click();

      // APIレスポンスを待機
      await updatePromise;

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/現場調査を更新しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 詳細画面に戻ることを確認
      await expect(page).toHaveURL(new RegExp(`/site-surveys/${createdSurveyId}$`), {
        timeout: getTimeout(10000),
      });

      // 更新した内容が反映されていることを確認
      await expect(page.getByText(updatedMemo)).toBeVisible();
    });

    /**
     * @requirement site-survey/REQ-1.3
     */
    test('編集キャンセル時は変更が破棄される', async ({ page }) => {
      if (!createdSurveyId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 編集ページに直接移動
      await page.goto(`/site-surveys/${createdSurveyId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集フォームが表示されるまで待機
      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 値を変更（保存しない）
      await page.getByLabel(/メモ/i).fill('キャンセルされる変更内容');

      // キャンセルボタンをクリック
      await page.getByRole('button', { name: /キャンセル/i }).click();

      // 詳細表示に戻ることを確認
      await expect(page).toHaveURL(new RegExp(`/site-surveys/${createdSurveyId}$`), {
        timeout: getTimeout(10000),
      });

      // 変更が破棄されていることを確認（キャンセルした変更内容が表示されない）
      await expect(page.getByText('キャンセルされる変更内容')).not.toBeVisible();
    });
  });

  /**
   * 現場調査削除フローのテスト
   *
   * REQ-1.4: DELETE /api/site-surveys/:id 現場調査削除
   */
  test.describe('現場調査削除フロー', () => {
    /**
     * @requirement site-survey/REQ-1.4
     */
    test('削除ボタン→確認ダイアログ→削除→一覧遷移が正常に行われる', async ({ page }) => {
      if (!createdProjectId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      // まず新しい現場調査を作成（削除テスト用）
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      const deleteSurveyName = `削除テスト用現場調査_${Date.now()}`;
      await page.getByLabel(/調査名/i).fill(deleteSurveyName);
      await page.getByLabel(/調査日/i).fill(new Date().toISOString().split('T')[0]!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/') &&
          response.url().includes('site-surveys') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // 詳細ページに遷移
      await expect(page).toHaveURL(/\/site-surveys\/[0-9a-f-]+$/, {
        timeout: getTimeout(15000),
      });

      // URLから現場調査IDを取得
      const url = page.url();
      const match = url.match(/\/site-surveys\/([0-9a-f-]+)$/);
      const surveyIdToDelete = match?.[1];

      // 削除ボタンをクリック
      const deleteButton = page.getByRole('button', { name: /削除/i });
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
      await deleteButton.click();

      // 確認ダイアログが表示されることを確認
      await expect(page.getByText(/削除しますか|この操作は取り消せません/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // APIレスポンスを待機しながら削除確認ボタンをクリック
      const deletePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/site-surveys/${surveyIdToDelete}`) &&
          response.request().method() === 'DELETE' &&
          response.status() === 204,
        { timeout: getTimeout(30000) }
      );

      // ダイアログ内の「削除する」または「削除」ボタンをクリック
      const confirmDeleteButton = page.getByRole('button', { name: /^削除する$|^削除$/i });
      await confirmDeleteButton.click();

      // APIレスポンスを待機
      await deletePromise;

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/projects/${createdProjectId}/site-surveys$`), {
        timeout: getTimeout(15000),
      });

      // 削除した現場調査が一覧に表示されないことを確認
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(deleteSurveyName)).not.toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement site-survey/REQ-1.4
     */
    test('削除確認ダイアログでキャンセルすると詳細画面に留まる', async ({ page }) => {
      if (!createdSurveyId) {
        test.skip();
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 詳細ページに移動
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 削除ボタンをクリック
      const deleteButton = page.getByRole('button', { name: /削除/i });
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
      await deleteButton.click();

      // 確認ダイアログが表示されることを確認
      await expect(page.getByText(/削除しますか|この操作は取り消せません/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // キャンセルボタンをクリック
      await page.getByRole('button', { name: /キャンセル/i }).click();

      // ダイアログが閉じることを確認
      await expect(page.getByText(/削除しますか|この操作は取り消せません/i)).not.toBeVisible({
        timeout: getTimeout(5000),
      });

      // 詳細画面に留まっていることを確認
      await expect(page).toHaveURL(new RegExp(`/site-surveys/${createdSurveyId}$`));
    });
  });

  /**
   * テスト後のクリーンアップ
   */
  test.describe('クリーンアップ', () => {
    test('作成したデータを削除する', async ({ page, context }) => {
      // 管理者ユーザーに切り替えて削除
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      // 残っている現場調査があれば削除
      if (createdSurveyId) {
        await page.goto(`/site-surveys/${createdSurveyId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i });
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          const confirmButton = page.getByRole('button', { name: /^削除する$|^削除$/i });
          if (await confirmButton.isVisible()) {
            await confirmButton.click();
            await page.waitForURL(/\/site-surveys$/, { timeout: getTimeout(15000) });
          }
        }
      }

      // プロジェクトを削除
      if (createdProjectId) {
        await page.goto(`/projects/${createdProjectId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i });
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          // ダイアログ内の削除ボタンをクリック
          const confirmButton = page
            .getByTestId('focus-manager-overlay')
            .getByRole('button', { name: /^削除$/i });
          if (await confirmButton.isVisible()) {
            await confirmButton.click();
            await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
          }
        }
      }
    });
  });
});
