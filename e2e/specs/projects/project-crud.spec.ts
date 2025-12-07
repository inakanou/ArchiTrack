/**
 * @fileoverview プロジェクトCRUD操作のE2Eテスト
 *
 * Task 16.1: プロジェクトCRUD E2Eテスト
 *
 * Requirements:
 * - 1.1: 「新規作成」ボタンでプロジェクト作成フォームを表示する
 * - 1.7: 「作成」ボタンをクリックした場合、プロジェクトが作成され、詳細画面に遷移
 * - 1.8: 作成成功時に成功メッセージを表示
 * - 8.1: プロジェクト詳細画面で「編集」ボタンをクリックすると編集フォームを表示
 * - 8.2: 編集フォームには現在のプロジェクト情報がプリセット表示される
 * - 8.3: 編集を保存すると成功メッセージを表示し、詳細画面に戻る
 * - 9.1: 「削除」ボタンをクリックすると削除確認ダイアログを表示
 * - 9.2: 削除確認ダイアログで「削除」を選択すると削除される
 * - 9.3: 削除後、一覧画面に遷移する
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * プロジェクトCRUD機能のE2Eテスト
 */
test.describe('プロジェクトCRUD操作', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストで作成したプロジェクトのIDを保存
  let createdProjectId: string | null = null;

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  /**
   * プロジェクト作成フローのテスト
   *
   * REQ-1.1: 「新規作成」ボタンでプロジェクト作成フォームを表示する
   * REQ-1.7: プロジェクトが作成され、詳細画面に遷移
   * REQ-1.8: 作成成功時に成功メッセージを表示
   */
  test.describe('プロジェクト作成フロー', () => {
    test('新規作成ボタンから作成フォームへ遷移できる', async ({ page }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト一覧ページに移動
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // 「新規作成」ボタンをクリック
      const createButton = page.getByRole('button', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 作成ページに遷移することを確認
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      // フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /新規プロジェクト/i })).toBeVisible();
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible();
      await expect(page.getByLabel(/顧客名/i)).toBeVisible();
    });

    test('フォーム入力→送信→詳細画面遷移が正常に行われる', async ({ page }) => {
      // 一般ユーザーでログイン（管理者は営業担当者として選択できないため）
      await loginAsUser(page, 'REGULAR_USER');

      // ログイン成功後、一覧ページに移動してからフォームに遷移する
      // （認証状態が完全に確立されてからのナビゲーション）
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // 一覧ページで新規作成ボタンをクリック
      const createButton = page.getByRole('button', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 作成ページに遷移
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // ユーザー一覧取得エラーが表示されないことを確認（認証が成功している）
      // もしエラーがあればページをリロードして再試行
      const userFetchError = page.getByText(/ユーザー一覧の取得に失敗しました/i);
      const hasError = await userFetchError.isVisible().catch(() => false);
      if (hasError) {
        console.log('User fetch error detected, reloading page...');
        await page.reload();
        await page.waitForLoadState('networkidle');
      }

      // 営業担当者のセレクトボックスが読み込み完了になるまで待機
      // 「読み込み中...」または「ユーザー一覧の取得に失敗しました」が表示されなくなるまで待機
      await expect(page.getByText(/読み込み中/i)).not.toBeVisible({ timeout: getTimeout(15000) });

      // エラーがないことを確認
      await expect(page.getByText(/ユーザー一覧の取得に失敗しました/i)).not.toBeVisible({
        timeout: getTimeout(5000),
      });

      // 営業担当者セレクトボックスにユーザーが表示されていることを確認
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await expect(salesPersonSelect).toBeVisible({ timeout: getTimeout(10000) });

      // フォームに入力
      const projectName = `E2Eテストプロジェクト_${Date.now()}`;
      const customerName = 'テスト顧客株式会社';
      const siteAddress = '東京都渋谷区テスト1-2-3';
      const description = 'E2Eテスト用のプロジェクト説明文です。';

      await page.getByLabel(/プロジェクト名/i).fill(projectName);
      await page.getByLabel(/顧客名/i).fill(customerName);
      await page.getByLabel(/現場住所/i).fill(siteAddress);
      await page.getByLabel(/概要/i).fill(description);

      // 営業担当者セレクトボックスの現在の値を確認
      // （ログインユーザーがデフォルトで選択されているはず）
      const salesPersonValue = await salesPersonSelect.inputValue();

      // salesPersonIdが設定されていることを確認（空でないこと）
      if (!salesPersonValue) {
        // デフォルト選択が設定されていない場合、最初のオプションを選択
        const options = await salesPersonSelect.locator('option').all();
        if (options.length > 1 && options[1]) {
          // 最初のオプションはプレースホルダーなので、2番目を選択
          const firstUserOption = await options[1].getAttribute('value');
          if (firstUserOption) {
            await salesPersonSelect.selectOption(firstUserOption);
          }
        }
      }

      // APIレスポンスを待機しながら作成ボタンをクリック
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();

      // APIレスポンスを待機
      const response = await createPromise;

      // APIレスポンスが成功であることを確認
      expect(response.status()).toBe(201);

      // 詳細画面に遷移することを確認
      await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });

      // 成功メッセージ（トースト）が表示されることを確認
      await expect(page.getByText(/プロジェクトを作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 詳細画面にプロジェクト情報が表示されることを確認
      // プロジェクト名は複数箇所に表示されるのでheadingを指定
      await expect(page.getByRole('heading', { name: projectName })).toBeVisible();
      await expect(page.getByText(customerName).first()).toBeVisible();

      // 作成したプロジェクトのIDを保存（後続テストで使用）
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = match?.[1] ?? null;
    });

    test('必須項目未入力時にバリデーションエラーが表示される', async ({ page }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // 作成ページに移動
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // 何も入力せずに作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/プロジェクト名は必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(page.getByText(/顧客名は必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });
  });

  /**
   * プロジェクト編集フローのテスト
   *
   * REQ-8.1: 「編集」ボタンをクリックすると編集フォームを表示
   * REQ-8.2: 編集フォームには現在のプロジェクト情報がプリセット表示される
   * REQ-8.3: 編集を保存すると成功メッセージを表示し、詳細画面に戻る
   */
  test.describe('プロジェクト編集フロー', () => {
    test('編集ボタン→フォーム表示→保存→成功メッセージが正常に行われる', async ({ page }) => {
      // 一般ユーザーでログイン（編集は一般ユーザーでも可能）
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトが存在しない場合は作成
      if (!createdProjectId) {
        await page.goto('/projects');
        await page.waitForLoadState('networkidle');

        await page.getByRole('button', { name: /新規作成/i }).click();
        await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

        // ユーザー一覧の読み込み完了を待機
        await expect(page.getByText(/読み込み中/i)).not.toBeVisible({ timeout: getTimeout(15000) });

        const projectName = `編集テスト用プロジェクト_${Date.now()}`;
        await page.getByLabel(/プロジェクト名/i).fill(projectName);
        await page.getByLabel(/顧客名/i).fill('編集テスト顧客');

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
      }

      // 詳細ページに移動
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 「編集」ボタンをクリック
      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 現在の値がプリセットされていることを確認
      await expect(page.getByLabel(/プロジェクト名/i)).toHaveValue(/.+/);
      await expect(page.getByLabel(/顧客名/i)).toHaveValue(/.+/);

      // 値を変更
      const updatedDescription = `E2E編集テスト_更新済み_${Date.now()}`;
      await page.getByLabel(/概要/i).fill(updatedDescription);

      // APIレスポンスを待機しながら保存ボタンをクリック
      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/projects/${createdProjectId}`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();

      // APIレスポンスを待機
      await updatePromise;

      // 成功メッセージ（トースト）が表示されることを確認
      await expect(page.getByText(/プロジェクトを更新しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 詳細表示に戻ることを確認（編集ヘッダーが消える）
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).not.toBeVisible({
        timeout: getTimeout(10000),
      });

      // 更新した内容が反映されていることを確認
      await expect(page.getByText(updatedDescription)).toBeVisible();
    });

    test('編集キャンセル時は変更が破棄される', async ({ page }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // 詳細ページに移動
      if (!createdProjectId) {
        // プロジェクトがない場合はスキップ
        test.skip();
        return;
      }

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 「編集」ボタンをクリック
      await page.getByRole('button', { name: /編集/i }).click();

      // 編集フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 値を変更（保存しない）
      await page.getByLabel(/概要/i).fill('キャンセルされる変更内容');

      // キャンセルボタンをクリック
      await page.getByRole('button', { name: /キャンセル/i }).click();

      // 詳細表示に戻ることを確認
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).not.toBeVisible({
        timeout: getTimeout(10000),
      });

      // 変更が破棄され、元の値が表示されていることを確認
      // キャンセルしたので「キャンセルされる変更内容」は表示されない
      await expect(page.getByText('キャンセルされる変更内容')).not.toBeVisible();

      // 詳細画面が表示されていることを確認
      await expect(page.getByText(/概要/i)).toBeVisible();
    });
  });

  /**
   * プロジェクト削除フローのテスト
   *
   * REQ-9.1: 「削除」ボタンをクリックすると削除確認ダイアログを表示
   * REQ-9.2: 削除確認ダイアログで「削除」を選択すると削除される
   * REQ-9.3: 削除後、一覧画面に遷移する
   */
  test.describe('プロジェクト削除フロー', () => {
    test('削除ボタン→確認ダイアログ→削除→一覧遷移が正常に行われる', async ({ page, context }) => {
      // Step 1: 一般ユーザーでプロジェクトを作成（管理者は営業担当者として選択できないため）
      await loginAsUser(page, 'REGULAR_USER');

      // 一覧ページに移動してから作成画面へ
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      // ユーザー一覧の読み込み完了を待機（複数の読み込み中が存在する可能性があるのでfirst()を使用）
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectNameToDelete = `削除テスト用プロジェクト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectNameToDelete);
      await page.getByLabel(/顧客名/i).fill('削除テスト顧客');

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

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // 詳細ページに遷移したことを確認
      await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });

      // プロジェクトIDを取得
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      const projectIdToDelete = match ? match[1] : null;

      // Step 2: 管理者ユーザーに切り替えて削除（削除権限が必要）
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      // 詳細ページに移動
      await page.goto(`/projects/${projectIdToDelete}`);
      await page.waitForLoadState('networkidle');

      // 「削除」ボタンをクリック
      const deleteButton = page.getByRole('button', { name: /削除/i });
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
      await deleteButton.click();

      // 確認ダイアログが表示されることを確認
      await expect(page.getByText(/プロジェクトの削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      // ダイアログ内のプロジェクト名（テストオーバーレイ内に表示される）
      await expect(
        page.getByTestId('focus-manager-overlay').getByText(projectNameToDelete)
      ).toBeVisible();
      await expect(page.getByText(/この操作は取り消せません/i)).toBeVisible();

      // APIレスポンスを待機しながら削除ボタンをクリック
      const deletePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/projects/${projectIdToDelete}`) &&
          response.request().method() === 'DELETE' &&
          response.status() === 204,
        { timeout: getTimeout(30000) }
      );

      // ダイアログ内の「削除」ボタンをクリック（オーバーレイ内のボタンを指定）
      await page
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /^削除$/i })
        .click();

      // APIレスポンスを待機
      await deletePromise;

      // 成功メッセージ（トースト）が表示されることを確認
      await expect(page.getByText(/プロジェクトを削除しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/projects$/, { timeout: getTimeout(15000) });

      // 削除したプロジェクトが一覧に表示されないことを確認
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(projectNameToDelete)).not.toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    test('削除確認ダイアログでキャンセルすると詳細画面に留まる', async ({ page, context }) => {
      // テスト用プロジェクトが存在しない場合は一般ユーザーで作成
      let testProjectId = createdProjectId;
      if (!testProjectId) {
        await loginAsUser(page, 'REGULAR_USER');

        await page.goto('/projects');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: /新規作成/i }).click();
        await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

        // ユーザー一覧の読み込み完了を待機
        await expect(page.getByText(/読み込み中/i)).not.toBeVisible({ timeout: getTimeout(15000) });

        await page.getByLabel(/プロジェクト名/i).fill(`キャンセルテスト_${Date.now()}`);
        await page.getByLabel(/顧客名/i).fill('キャンセルテスト顧客');

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

        const createPromise = page.waitForResponse(
          (response) =>
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
        testProjectId = match?.[1] ?? null;

        // 管理者ユーザーに切り替え
        await context.clearCookies();
        await page.evaluate(() => {
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('accessToken');
        });
      }

      // 管理者ユーザーでログイン（削除ボタンを表示するため）
      await loginAsUser(page, 'ADMIN_USER');

      // 詳細ページに移動
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 「削除」ボタンをクリック
      await page.getByRole('button', { name: /削除/i }).click();

      // 確認ダイアログが表示されることを確認
      await expect(page.getByText(/プロジェクトの削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 「キャンセル」ボタンをクリック
      await page.getByRole('button', { name: /キャンセル/i }).click();

      // ダイアログが閉じることを確認
      await expect(page.getByText(/プロジェクトの削除/i)).not.toBeVisible({
        timeout: getTimeout(5000),
      });

      // 詳細画面に留まっていることを確認
      await expect(page).toHaveURL(new RegExp(`/projects/${testProjectId}$`));
    });
  });
});
