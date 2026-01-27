/**
 * @fileoverview 内訳書専用作成画面のE2Eテスト
 *
 * Task 19.3: 専用作成画面のE2Eテスト
 *
 * Requirements coverage (itemized-statement-generation):
 * - REQ-15.1: プロジェクト詳細画面から新規作成ボタンで作成画面へ遷移
 * - REQ-15.4: デフォルト名「内訳書」が入力フィールドに設定されている
 * - REQ-15.6: 作成成功後に内訳書詳細画面へ遷移
 * - REQ-15.7: プロジェクト詳細から遷移した場合のキャンセル時にプロジェクト詳細画面へ戻る
 * - REQ-15.8: 内訳書一覧画面から新規作成ボタンで作成画面へ遷移
 * - REQ-15.9: 内訳書一覧から遷移した場合のキャンセル時に内訳書一覧画面へ戻る
 *
 * @module e2e/specs/itemized-statements/itemized-statement-create-page.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * 内訳書専用作成画面のE2Eテスト
 */
test.describe('内訳書専用作成画面', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストで使用するリソースのID
  let testProjectId: string | null = null;
  let testQuantityTableId: string | null = null;
  let projectName: string = '';

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  /**
   * 事前準備: テスト用プロジェクトと数量表を作成
   */
  test.describe('事前準備', () => {
    test('テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      projectName = `内訳書作成画面テスト_${Date.now()}`;
      await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

      // 営業担当者を選択
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

      const createProjectPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createProjectPromise;

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const projectUrl = page.url();
      const projectMatch = projectUrl.match(/\/projects\/([0-9a-f-]+)$/);
      testProjectId = projectMatch?.[1] ?? null;
      expect(testProjectId).toBeTruthy();
    });

    test('数量表と項目を作成する', async ({ page, request }) => {
      if (!testProjectId) {
        throw new Error(
          'testProjectIdが未設定です。プロジェクト作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表作成ページに直接移動
      await page.goto(`/projects/${testProjectId}/quantity-tables/new`);
      await page.waitForLoadState('networkidle');

      // 数量表作成フォームを入力
      const quantityTableName = '作成画面テスト用数量表';
      await page.getByRole('textbox', { name: /数量表名/i }).fill(quantityTableName);

      const createQuantityTablePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api') &&
          response.url().includes('quantity-tables') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createQuantityTablePromise;
      const createResponseBody = await createResponse.json();

      // 数量表編集画面に遷移
      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+/);
      testQuantityTableId = createResponseBody.id;
      expect(testQuantityTableId).toBeTruthy();

      // APIを直接使用してグループと項目を作成（UI操作より安定）
      const baseUrl = API_BASE_URL;

      // APIトークンを取得（ログインAPIから）
      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: {
          email: 'user@example.com',
          password: 'Password123!',
        },
      });
      const loginBody = await loginResponse.json();
      const accessToken = loginBody.accessToken;

      // グループを作成
      const groupResponse = await request.post(
        `${baseUrl}/api/quantity-tables/${testQuantityTableId}/groups`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: 'テストグループ',
            displayOrder: 0,
          },
        }
      );
      const groupBody = await groupResponse.json();
      const groupId = groupBody.id;
      expect(groupId).toBeTruthy();

      // 項目を作成
      const itemResponse = await request.post(`${baseUrl}/api/quantity-groups/${groupId}/items`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          customCategory: '任意分類A',
          workType: '工種A',
          name: '名称A',
          specification: '規格A',
          unit: 'm',
          quantity: 10.5,
          displayOrder: 0,
        },
      });
      expect(itemResponse.ok()).toBeTruthy();
    });
  });

  /**
   * REQ-15.1: プロジェクト詳細画面から新規作成ボタンで作成画面へ遷移
   */
  test.describe('プロジェクト詳細画面からの遷移', () => {
    test('プロジェクト詳細画面の新規作成ボタンをクリックすると内訳書作成画面に遷移する', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細画面に移動
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 内訳書セクションが表示されるまで待機
      const itemizedStatementSection = page.locator('[data-testid="itemized-statement-section"]');
      await expect(itemizedStatementSection).toBeVisible({ timeout: getTimeout(15000) });

      // 新規作成ボタンをクリック
      // 内訳書セクション内の新規作成リンクを探す
      const createButton = itemizedStatementSection.getByRole('link', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 内訳書作成画面に遷移したことを確認
      await expect(page).toHaveURL(
        new RegExp(`/projects/${testProjectId}/itemized-statements/new`),
        { timeout: getTimeout(10000) }
      );

      // ページタイトルが表示されていることを確認
      await expect(page.getByRole('heading', { name: /内訳書を新規作成/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * REQ-15.8: 内訳書一覧画面から新規作成ボタンで作成画面へ遷移
   */
  test.describe('内訳書一覧画面からの遷移', () => {
    test('内訳書一覧画面の新規作成ボタンをクリックすると内訳書作成画面に遷移する', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 内訳書一覧画面に移動
      await page.goto(`/projects/${testProjectId}/itemized-statements`);
      await page.waitForLoadState('networkidle');

      // ローディング完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 新規作成ボタンをクリック（ヘッダーのボタンを優先的に選択）
      // aria-label="内訳書を新規作成"を使用してヘッダーの新規作成ボタンを特定
      const createButton = page.getByRole('link', { name: '内訳書を新規作成' });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 内訳書作成画面に遷移し、from=listクエリパラメータが含まれていることを確認
      await expect(page).toHaveURL(
        new RegExp(`/projects/${testProjectId}/itemized-statements/new\\?from=list`),
        { timeout: getTimeout(10000) }
      );

      // ページタイトルが表示されていることを確認
      await expect(page.getByRole('heading', { name: /内訳書を新規作成/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * REQ-15.4: デフォルト名「内訳書」が入力フィールドに設定されている
   */
  test.describe('デフォルト名の設定', () => {
    test('内訳書作成画面の内訳書名フィールドにデフォルト値「内訳書」が設定されている', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 内訳書作成画面に直接移動
      await page.goto(`/projects/${testProjectId}/itemized-statements/new`);
      await page.waitForLoadState('networkidle');

      // ローディング完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 内訳書名入力フィールドの値を確認
      const nameInput = page.locator('input#name');
      await expect(nameInput).toBeVisible({ timeout: getTimeout(10000) });
      await expect(nameInput).toHaveValue('内訳書');
    });
  });

  /**
   * REQ-15.2: 内訳書新規作成画面にプロジェクト詳細画面に戻るリンクを表示する
   */
  test.describe('戻るリンク表示', () => {
    /**
     * @requirement itemized-statement-generation/REQ-15.2
     */
    test('内訳書新規作成画面にプロジェクト詳細画面に戻るリンクが表示される (itemized-statement-generation/REQ-15.2)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${testProjectId}/itemized-statements/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // プロジェクト詳細画面に戻るリンクが表示される
      const backLink = page.getByRole('link', { name: /戻る|キャンセル/i });
      await expect(backLink).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  /**
   * REQ-15.3: 内訳書新規作成画面に内訳書名入力フィールドを表示する
   */
  test.describe('内訳書名入力フィールド表示', () => {
    /**
     * @requirement itemized-statement-generation/REQ-15.3
     */
    test('内訳書新規作成画面に内訳書名入力フィールドが表示される (itemized-statement-generation/REQ-15.3)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${testProjectId}/itemized-statements/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 内訳書名入力フィールドが表示される
      const nameInput = page.locator('input#name');
      await expect(nameInput).toBeVisible({ timeout: getTimeout(10000) });

      // ラベルも確認
      await expect(page.getByText(/内訳書名/i)).toBeVisible();
    });
  });

  /**
   * REQ-15.5: 内訳書新規作成画面に数量表選択リストを表示する
   */
  test.describe('数量表選択リスト表示', () => {
    /**
     * @requirement itemized-statement-generation/REQ-15.5
     */
    test('内訳書新規作成画面に数量表選択リストが表示される (itemized-statement-generation/REQ-15.5)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${testProjectId}/itemized-statements/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 数量表選択リストが表示される
      const quantityTableSelect = page.locator('select#quantityTableId');
      await expect(quantityTableSelect).toBeVisible({ timeout: getTimeout(10000) });

      // ラベルも確認（複数要素にマッチするため最初のものを使用）
      await expect(page.getByLabel(/数量表/i)).toBeVisible();
    });
  });

  /**
   * REQ-9.5: 内訳書新規作成画面にパンくずナビゲーションを表示する
   */
  test.describe('パンくずナビゲーション', () => {
    /**
     * @requirement itemized-statement-generation/REQ-9.5
     */
    test('内訳書新規作成画面にパンくずナビゲーションが表示される (itemized-statement-generation/REQ-9.5)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${testProjectId}/itemized-statements/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // パンくずナビゲーションが表示される
      await expect(page.getByText(/プロジェクト一覧/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement itemized-statement-generation/REQ-9.6
     */
    test('内訳書新規作成画面のパンくずが正しい形式で表示される (itemized-statement-generation/REQ-9.6)', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${testProjectId}/itemized-statements/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // パンくず要素を確認
      // 「プロジェクト一覧 > {プロジェクト名} > 内訳書 > 新規作成」形式
      await expect(page.getByText(/プロジェクト一覧/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(projectName)).toBeVisible();
      await expect(page.getByText(/内訳書/i).first()).toBeVisible();
      await expect(page.getByText(/新規作成/i).first()).toBeVisible();
    });
  });

  /**
   * REQ-15.6: 作成成功後に内訳書詳細画面へ遷移
   */
  test.describe('作成成功後の遷移', () => {
    test('内訳書を作成すると内訳書詳細画面に遷移する', async ({ page }) => {
      if (!testProjectId || !testQuantityTableId) {
        throw new Error('testProjectIdまたはtestQuantityTableIdが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 内訳書作成画面に直接移動
      await page.goto(`/projects/${testProjectId}/itemized-statements/new`);
      await page.waitForLoadState('networkidle');

      // ローディング完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 内訳書名を変更（デフォルト値があるがユニークにする）
      const uniqueName = `テスト内訳書_${Date.now()}`;
      const nameInput = page.locator('input#name');
      await nameInput.clear();
      await nameInput.fill(uniqueName);

      // 数量表を選択
      const quantityTableSelect = page.locator('select#quantityTableId');
      await quantityTableSelect.selectOption(testQuantityTableId);

      // 作成ボタンをクリック
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api') &&
          response.url().includes('itemized-statements') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // 内訳書詳細画面に遷移したことを確認
      await expect(page).toHaveURL(/\/itemized-statements\/[0-9a-f-]+$/, {
        timeout: getTimeout(15000),
      });

      // 詳細画面に作成した内訳書名が見出しとして表示されていることを確認
      await expect(page.getByRole('heading', { name: uniqueName })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * REQ-15.7: プロジェクト詳細から遷移した場合のキャンセル時にプロジェクト詳細画面へ戻る
   */
  test.describe('キャンセル時の遷移（プロジェクト詳細から）', () => {
    test('プロジェクト詳細画面から遷移した場合、キャンセルでプロジェクト詳細画面に戻る', async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細画面に移動
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 内訳書セクションが表示されるまで待機
      const itemizedStatementSection = page.locator('[data-testid="itemized-statement-section"]');
      await expect(itemizedStatementSection).toBeVisible({ timeout: getTimeout(15000) });

      // 新規作成ボタンをクリック
      const createButton = itemizedStatementSection.getByRole('link', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 作成画面に遷移したことを確認
      await expect(page).toHaveURL(
        new RegExp(`/projects/${testProjectId}/itemized-statements/new`),
        { timeout: getTimeout(10000) }
      );

      // キャンセルボタンをクリック
      const cancelButton = page.getByRole('button', { name: /キャンセル/i });
      await expect(cancelButton).toBeVisible({ timeout: getTimeout(10000) });
      await cancelButton.click();

      // プロジェクト詳細画面に戻ったことを確認（from=listパラメータがないためプロジェクト詳細へ）
      await expect(page).toHaveURL(new RegExp(`/projects/${testProjectId}$`), {
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * REQ-15.9: 内訳書一覧から遷移した場合のキャンセル時に内訳書一覧画面へ戻る
   */
  test.describe('キャンセル時の遷移（内訳書一覧から）', () => {
    test('内訳書一覧画面から遷移した場合、キャンセルで内訳書一覧画面に戻る', async ({ page }) => {
      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 内訳書一覧画面に移動
      await page.goto(`/projects/${testProjectId}/itemized-statements`);
      await page.waitForLoadState('networkidle');

      // ローディング完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 新規作成ボタンをクリック（ヘッダーのボタンを優先的に選択）
      const createButton = page.getByRole('link', { name: '内訳書を新規作成' });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 作成画面に遷移したことを確認（from=list付き）
      await expect(page).toHaveURL(
        new RegExp(`/projects/${testProjectId}/itemized-statements/new\\?from=list`),
        { timeout: getTimeout(10000) }
      );

      // キャンセルボタンをクリック
      const cancelButton = page.getByRole('button', { name: /キャンセル/i });
      await expect(cancelButton).toBeVisible({ timeout: getTimeout(10000) });
      await cancelButton.click();

      // 内訳書一覧画面に戻ったことを確認
      await expect(page).toHaveURL(new RegExp(`/projects/${testProjectId}/itemized-statements$`), {
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * クリーンアップ: テスト用リソースを削除
   * 注意: プロジェクト削除には管理者権限が必要な場合があるため、
   * エラーが発生してもテスト失敗とはしない
   */
  test.describe('クリーンアップ', () => {
    test('テスト用プロジェクトを削除する', async ({ request }) => {
      if (!testProjectId) {
        return; // プロジェクトが作成されていない場合はスキップ
      }

      const baseUrl = API_BASE_URL;

      // APIトークンを取得
      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: {
          email: 'user@example.com',
          password: 'Password123!',
        },
      });
      const loginBody = await loginResponse.json();
      const accessToken = loginBody.accessToken;

      // プロジェクトを削除（権限エラーが発生する可能性があるため、成功しなくても良い）
      const deleteResponse = await request.delete(`${baseUrl}/api/projects/${testProjectId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // 削除成功または権限エラーを許容（200, 204, 403）
      // テストデータはテストデータベースリセット時にクリーンアップされる
      expect([200, 204, 403]).toContain(deleteResponse.status());
    });
  });
});
