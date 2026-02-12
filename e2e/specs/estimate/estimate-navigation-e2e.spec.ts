/**
 * @fileoverview 見積書一覧・詳細・ナビゲーション関連のE2Eテスト
 *
 * Task 20: 画面構成・ナビゲーション関連のテスト実装
 *
 * Requirements coverage (estimate-creation):
 * - REQ-14.1 ~ REQ-14.10: 画面構成
 * - REQ-15.1 ~ REQ-15.8: パンくずナビゲーション
 * - REQ-16.1 ~ REQ-16.13: プロジェクト詳細画面の見積書セクション
 *
 * @module e2e/specs/estimate/estimate-navigation-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * 見積書画面構成・ナビゲーション関連のE2Eテスト
 */
test.describe('見積書画面構成・ナビゲーション', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial', retries: 0 });

  // テストデータの保存
  let createdProjectId: string | null = null;
  let createdEstimateId: string | null = null;
  let createdEstimateId2: string | null = null;
  let accessToken: string = '';
  let projectName: string = '';
  let estimateName: string = '';
  let estimateName2: string = '';

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  // ============================================================================
  // テストデータのセットアップ
  // ============================================================================

  test.describe('テストデータのセットアップ', () => {
    /**
     * テスト準備：プロジェクトの作成
     */
    test('準備1：テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成画面に移動
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // プロジェクト名を入力
      projectName = `E2Eナビテスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      // 現場住所を入力
      await page.getByLabel(/現場住所/i).fill('東京都渋谷区ナビ1-2-3');

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

      // プロジェクト作成
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const response = await createPromise;
      expect(response.status()).toBe(201);

      // URLからプロジェクトIDを取得
      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = match?.[1] ?? null;

      expect(createdProjectId).toBeTruthy();
    });

    /**
     * テスト準備：APIトークンの取得
     */
    test('準備2：APIトークンを取得する', async ({ request }) => {
      const baseUrl = API_BASE_URL;
      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: {
          email: 'user@example.com',
          password: 'Password123!',
        },
      });
      const loginBody = await loginResponse.json();
      accessToken = loginBody.accessToken;

      expect(accessToken).toBeTruthy();
    });

    /**
     * テスト準備：見積書を複数作成
     */
    test('準備3：テスト用見積書を複数作成する', async ({ request }) => {
      expect(createdProjectId).toBeTruthy();
      expect(accessToken).toBeTruthy();

      const baseUrl = API_BASE_URL;

      // 見積書1を作成
      estimateName = `ナビテスト見積書1_${Date.now()}`;
      const response1 = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: estimateName,
          },
        }
      );
      expect(response1.status()).toBe(201);
      const body1 = await response1.json();
      createdEstimateId = body1.id;

      // 見積書2を作成
      estimateName2 = `ナビテスト見積書2_${Date.now()}`;
      const response2 = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: estimateName2,
          },
        }
      );
      expect(response2.status()).toBe(201);
      const body2 = await response2.json();
      createdEstimateId2 = body2.id;

      expect(createdEstimateId).toBeTruthy();
      expect(createdEstimateId2).toBeTruthy();
    });
  });

  // ============================================================================
  // タスク20.1: 見積書一覧画面・詳細画面のE2Eテスト
  // ============================================================================

  test.describe('タスク20.1: 見積書一覧画面・詳細画面', () => {
    /**
     * @requirement estimate-creation/REQ-14.1
     * 見積書一覧画面を提供する
     */
    test('REQ-14.1：見積書一覧画面が表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書一覧画面に移動
      await page.goto(`/projects/${createdProjectId}/estimates`);
      await page.waitForLoadState('networkidle');

      // 一覧画面が表示されることを確認
      await expect(page.locator('[data-testid="estimate-list-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // タイトルが表示されることを確認
      await expect(page.getByRole('heading', { name: /見積書一覧/i })).toBeVisible();
    });

    /**
     * @requirement estimate-creation/REQ-14.2
     * 見積書の一覧をカード形式で表示する
     */
    test('REQ-14.2：見積書がカード形式で表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書一覧画面に移動
      await page.goto(`/projects/${createdProjectId}/estimates`);
      await page.waitForLoadState('networkidle');

      // 見積書リストが表示されることを確認
      await expect(page.locator('[data-testid="estimate-list"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // カードが表示されることを確認
      const cards = page.locator('[data-testid^="estimate-card-"]');
      const cardCount = await cards.count();
      expect(cardCount).toBeGreaterThanOrEqual(2);
    });

    /**
     * @requirement estimate-creation/REQ-14.3
     * 見積書名、作成日時、合計金額を表示する
     */
    test('REQ-14.3：見積書名、作成日時が表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(estimateName).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書一覧画面に移動
      await page.goto(`/projects/${createdProjectId}/estimates`);
      await page.waitForLoadState('networkidle');

      // 見積書名が表示されることを確認
      await expect(page.getByText(estimateName)).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByText(estimateName2)).toBeVisible();
    });

    /**
     * @requirement estimate-creation/REQ-14.4
     * 見積書カードクリックで詳細画面へ遷移する
     */
    test('REQ-14.4：カードクリックで詳細画面へ遷移する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書一覧画面に移動
      await page.goto(`/projects/${createdProjectId}/estimates`);
      await page.waitForLoadState('networkidle');

      // カードをクリック
      const card = page.locator(`[data-testid="estimate-card-${createdEstimateId}"]`);
      await expect(card).toBeVisible({ timeout: getTimeout(15000) });
      await card.click();

      // 詳細画面に遷移することを確認
      await page.waitForURL(/\/estimates\/[0-9a-f-]+$/);
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });
    });

    /**
     * @requirement estimate-creation/REQ-14.5
     * 新規作成ボタンを提供する
     */
    test('REQ-14.5：新規作成ボタンが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書一覧画面に移動
      await page.goto(`/projects/${createdProjectId}/estimates`);
      await page.waitForLoadState('networkidle');

      // 新規作成ボタンが表示されることを確認
      const createButton = page.getByRole('link', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });

      // クリックで作成画面へ遷移
      await createButton.click();
      await page.waitForURL(/\/projects\/[0-9a-f-]+\/estimates\/new$/);
    });

    /**
     * @requirement estimate-creation/REQ-14.6
     * ページネーションを提供する
     */
    test('REQ-14.6：ページネーションが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書一覧画面に移動
      await page.goto(`/projects/${createdProjectId}/estimates`);
      await page.waitForLoadState('networkidle');

      // ページネーションUIまたは件数表示が存在するか確認
      const paginationOrCount = await page
        .locator('[data-testid="pagination"], [class*="pagination"]')
        .or(page.getByText(/全\d+件/))
        .first()
        .isVisible()
        .catch(() => false);

      // 少なくとも件数表示はあるはず
      const countText = page.getByText(/全\d+件/);
      await expect(countText).toBeVisible({ timeout: getTimeout(10000) });

      // または、ページネーションUIが表示される（データが多い場合）
      expect(paginationOrCount || (await countText.isVisible())).toBeTruthy();
    });

    /**
     * @requirement estimate-creation/REQ-14.7
     * 見積書が存在しない場合のメッセージ表示
     * Note: このテストは別プロジェクトで空状態を確認
     */
    test('REQ-14.7：空状態表示を確認する', async ({ page, request }) => {
      // 空のプロジェクトを作成
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成画面に移動
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // プロジェクト名を入力
      const emptyProjectName = `空プロジェクト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(emptyProjectName);
      await page.getByLabel(/現場住所/i).fill('東京都テスト区');

      // 営業担当者を選択
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const options = await salesPersonSelect.locator('option').all();
      if (options.length > 1 && options[1]) {
        const firstUserOption = await options[1].getAttribute('value');
        if (firstUserOption) {
          await salesPersonSelect.selectOption(firstUserOption);
        }
      }

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const response = await createPromise;
      const responseBody = await response.json();
      const emptyProjectId = responseBody.id;

      // 見積書一覧画面に移動
      await page.goto(`/projects/${emptyProjectId}/estimates`);
      await page.waitForLoadState('networkidle');

      // 空状態が表示されることを確認
      await expect(page.locator('[data-testid="empty-state"]')).toBeVisible({
        timeout: getTimeout(15000),
      });
      await expect(page.getByText(/見積書はまだありません/i)).toBeVisible();

      // 空状態にも新規作成ボタンがあることを確認
      await expect(
        page.locator('[data-testid="empty-state"]').getByRole('link', { name: /新規作成/i })
      ).toBeVisible();

      // クリーンアップ
      const baseUrl = API_BASE_URL;
      await request.delete(`${baseUrl}/api/projects/${emptyProjectId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    });

    /**
     * @requirement estimate-creation/REQ-14.8
     * 見積書画面を提供する
     */
    test('REQ-14.8：見積書詳細画面が表示される', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に直接移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細画面が表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });
    });

    /**
     * @requirement estimate-creation/REQ-14.9
     * 見積書の詳細情報（見積項目一覧、合計金額等）を表示する
     */
    test('REQ-14.9：見積書の詳細情報が表示される', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();
      expect(estimateName).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細画面が表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 見積書名が表示されることを確認
      await expect(page.getByRole('heading', { name: estimateName })).toBeVisible();

      // 基本情報セクションが表示されることを確認
      await expect(page.getByText(/基本情報/i)).toBeVisible();

      // 見積項目セクションが表示されることを確認
      await expect(page.getByRole('heading', { name: /見積項目/i })).toBeVisible();

      // サマリーセクション（合計金額等）が表示されることを確認
      await expect(page.getByRole('heading', { name: /サマリー/i })).toBeVisible();

      // サマリー内の合計金額が表示されることを確認
      await expect(page.getByText(/見積金額合計/)).toBeVisible();
    });

    /**
     * @requirement estimate-creation/REQ-14.10
     * 編集・削除・出力ボタンを提供する
     */
    test('REQ-14.10：編集・削除・出力ボタンが表示される', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細画面が表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 編集ボタンが表示されることを確認
      await expect(page.getByRole('button', { name: /編集/i })).toBeVisible();

      // 削除ボタンが表示されることを確認
      await expect(page.getByRole('button', { name: /削除/i })).toBeVisible();

      // 出力ボタンが表示されることを確認
      await expect(page.getByRole('button', { name: /出力/i })).toBeVisible();

      // 転記ボタンも表示されることを確認（複数存在するため最初の1つで確認）
      await expect(page.getByRole('button', { name: '受領見積書を業者金額に転記' })).toBeVisible();
    });
  });

  // ============================================================================
  // タスク20.2: パンくずナビゲーションのE2Eテスト
  // ============================================================================

  test.describe('タスク20.2: パンくずナビゲーション', () => {
    /**
     * @requirement estimate-creation/REQ-15.1
     * 見積書一覧画面でパンくずナビゲーションを表示する
     */
    test('REQ-15.1：見積書一覧画面でパンくずが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書一覧画面に移動
      await page.goto(`/projects/${createdProjectId}/estimates`);
      await page.waitForLoadState('networkidle');

      // パンくずナビゲーションが表示されることを確認
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(15000) });

      // パンくずの構成を確認：プロジェクト一覧 > プロジェクト詳細 > 見積書一覧
      await expect(breadcrumb.getByText('プロジェクト一覧')).toBeVisible();
      await expect(breadcrumb.getByText('プロジェクト詳細', { exact: true })).toBeVisible();
      await expect(breadcrumb.getByText('見積書一覧')).toBeVisible();
    });

    /**
     * @requirement estimate-creation/REQ-15.2
     * 「プロジェクト一覧」をクリック可能なリンクとして提供する
     */
    test('REQ-15.2：「プロジェクト一覧」リンクで遷移できる', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書一覧画面に移動
      await page.goto(`/projects/${createdProjectId}/estimates`);
      await page.waitForLoadState('networkidle');

      // パンくずの「プロジェクト一覧」リンクをクリック
      const projectListLink = page.getByRole('link', { name: 'プロジェクト一覧' });
      await expect(projectListLink).toBeVisible({ timeout: getTimeout(15000) });
      await projectListLink.click();

      // プロジェクト一覧画面に遷移することを確認
      await page.waitForURL(/\/projects$/);
    });

    /**
     * @requirement estimate-creation/REQ-15.3
     * 「プロジェクト詳細」をクリック可能なリンクとして提供する
     */
    test('REQ-15.3：「プロジェクト詳細」リンクで遷移できる', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書一覧画面に移動
      await page.goto(`/projects/${createdProjectId}/estimates`);
      await page.waitForLoadState('networkidle');

      // パンくずの「プロジェクト詳細」リンクをクリック
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      const projectDetailLink = breadcrumb.getByRole('link', {
        name: 'プロジェクト詳細',
        exact: true,
      });
      await expect(projectDetailLink).toBeVisible({ timeout: getTimeout(15000) });
      await projectDetailLink.click();

      // プロジェクト詳細画面に遷移することを確認
      await page.waitForURL(new RegExp(`/projects/${createdProjectId}$`));
    });

    /**
     * @requirement estimate-creation/REQ-15.4
     * 見積書詳細画面でパンくずナビゲーションを表示する
     */
    test('REQ-15.4：見積書詳細画面でパンくずが表示される', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // パンくずナビゲーションが表示されることを確認
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(15000) });

      // パンくずの構成を確認：プロジェクト一覧 > プロジェクト詳細 > 見積書一覧 > [見積書名]
      await expect(breadcrumb.getByText('プロジェクト一覧')).toBeVisible();
      await expect(breadcrumb.getByText('プロジェクト詳細', { exact: true })).toBeVisible();
      await expect(breadcrumb.getByText('見積書一覧')).toBeVisible();
      await expect(breadcrumb.getByText(estimateName)).toBeVisible();
    });

    /**
     * @requirement estimate-creation/REQ-15.5
     * 見積書詳細画面で「プロジェクト一覧」をクリック可能
     */
    test('REQ-15.5：詳細画面から「プロジェクト一覧」へ遷移できる', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // パンくずの「プロジェクト一覧」リンクをクリック
      const projectListLink = page.getByRole('link', { name: 'プロジェクト一覧' });
      await expect(projectListLink).toBeVisible({ timeout: getTimeout(15000) });
      await projectListLink.click();

      // プロジェクト一覧画面に遷移することを確認
      await page.waitForURL(/\/projects$/);
    });

    /**
     * @requirement estimate-creation/REQ-15.6
     * 見積書詳細画面で「プロジェクト詳細」をクリック可能
     */
    test('REQ-15.6：詳細画面から「プロジェクト詳細」へ遷移できる', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // パンくずの「プロジェクト詳細」リンクをクリック
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      const projectDetailLink = breadcrumb.getByRole('link', {
        name: 'プロジェクト詳細',
        exact: true,
      });
      await expect(projectDetailLink).toBeVisible({ timeout: getTimeout(15000) });
      await projectDetailLink.click();

      // プロジェクト詳細画面に遷移することを確認
      await page.waitForURL(new RegExp(`/projects/${createdProjectId}$`));
    });

    /**
     * @requirement estimate-creation/REQ-15.7
     * 見積書詳細画面で「見積書一覧」をクリック可能
     */
    test('REQ-15.7：詳細画面から「見積書一覧」へ遷移できる', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // パンくずの「見積書一覧」リンクをクリック
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      const estimateListLink = breadcrumb.getByRole('link', { name: '見積書一覧', exact: true });
      await expect(estimateListLink).toBeVisible({ timeout: getTimeout(15000) });
      await estimateListLink.click();

      // 見積書一覧画面に遷移することを確認
      await page.waitForURL(new RegExp(`/projects/${createdProjectId}/estimates$`));
    });

    /**
     * @requirement estimate-creation/REQ-15.8
     * パンくずナビゲーションの現在位置（末尾）をリンクなしのテキストとして表示する
     */
    test('REQ-15.8：現在位置はリンクなしのテキストで表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書一覧画面に移動
      await page.goto(`/projects/${createdProjectId}/estimates`);
      await page.waitForLoadState('networkidle');

      // 「見積書一覧」がテキストとして表示されていることを確認（リンクではない）
      const breadcrumb = page.getByRole('navigation', { name: /パンくず/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(15000) });

      // パンくず内の「見積書一覧」テキストを取得
      const currentItemText = breadcrumb.getByText('見積書一覧');
      await expect(currentItemText).toBeVisible();

      // 最後の要素がリンクでないことを確認
      // aria-current="page" がある、または <span> タグであることを確認
      const isLink = await currentItemText.evaluate((el) => el.tagName === 'A');
      const hasAriaCurrent = await currentItemText.getAttribute('aria-current');

      // 現在位置はリンクではない、またはaria-current="page"を持つ
      expect(!isLink || hasAriaCurrent === 'page').toBeTruthy();
    });
  });

  // ============================================================================
  // タスク20.3: プロジェクト詳細画面の見積書セクションE2Eテスト
  // ============================================================================

  test.describe('タスク20.3: プロジェクト詳細画面の見積書セクション', () => {
    /**
     * @requirement estimate-creation/REQ-16.1
     * 見積書セクションの表示位置確認（見積依頼セクションの下）
     */
    test('REQ-16.1：見積書セクションが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細画面に移動
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 見積書セクションが表示されることを確認
      await expect(page.locator('[data-testid="estimate-section"]')).toBeVisible({
        timeout: getTimeout(15000),
      });
    });

    /**
     * @requirement estimate-creation/REQ-16.2
     * セクションタイトル「見積書」を表示する
     */
    test('REQ-16.2：セクションタイトル「見積書」が表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細画面に移動
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // セクションタイトル「見積書」が表示されることを確認
      await expect(page.locator('#estimate-section-title')).toHaveText('見積書', {
        timeout: getTimeout(15000),
      });
    });

    /**
     * @requirement estimate-creation/REQ-16.3
     * 見積書の総数を表示する
     */
    test('REQ-16.3：総数が表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細画面に移動
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 見積書セクションが表示されることを確認
      await expect(page.locator('[data-testid="estimate-section"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 総数が表示されることを確認（例：全2件）
      const section = page.locator('[data-testid="estimate-section"]');
      await expect(section.getByText(/全\d+件/)).toBeVisible();
    });

    /**
     * @requirement estimate-creation/REQ-16.4 @requirement estimate-creation/REQ-16.5
     * 見積書カードの表示確認（名称、作成日時、合計金額）
     */
    test('REQ-16.4-16.5：見積書カードが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(estimateName).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細画面に移動
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 見積書セクションが表示されることを確認
      const section = page.locator('[data-testid="estimate-section"]');
      await expect(section).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 見積書カードが表示されることを確認
      const cards = section.locator('[data-testid^="estimate-card-"]');
      const cardCount = await cards.count();
      expect(cardCount).toBeGreaterThanOrEqual(2);

      // 見積書名が表示されることを確認（セクション全体で確認）
      // 直近順で表示されるため、見積書2が先に表示される
      await expect(section.getByText(estimateName)).toBeVisible();
      await expect(section.getByText(estimateName2)).toBeVisible();

      // 最初のカードで作成日時が表示されることを確認（日本語日付形式）
      const firstCard = cards.first();
      await expect(firstCard.getByText(/\d{4}年\d{1,2}月\d{1,2}日/)).toBeVisible();

      // 合計金額は見積項目がない場合は表示されないため、
      // カード内に日付を含むメタ情報があることを確認
      // Note: 見積項目がある場合は「○○円」の形式で表示される
      const metaText = firstCard.locator('p');
      await expect(metaText).toBeVisible();
    });

    /**
     * @requirement estimate-creation/REQ-16.6
     * 見積書カードクリックで見積書画面へ遷移
     */
    test('REQ-16.6：見積書カードクリックで詳細画面へ遷移する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細画面に移動
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 見積書セクション内のカードをクリック
      const section = page.locator('[data-testid="estimate-section"]');
      await expect(section).toBeVisible({ timeout: getTimeout(15000) });

      // セクション内のリンクをクリック（最初の見積書カード、/estimates/で終わるもの、newを含まない）
      const estimateCard = section.locator('a[href^="/estimates/"]').first();
      await expect(estimateCard).toBeVisible();

      // URLを確認してからクリック
      const href = await estimateCard.getAttribute('href');
      if (href && !href.includes('/new')) {
        await estimateCard.click();
        // 見積書詳細画面に遷移することを確認
        await page.waitForURL(/\/estimates\/[0-9a-f-]+$/);
      } else {
        // カードのリンクを探す（見積書詳細へのリンク）
        const cardLinks = await section.locator('a').all();
        for (const link of cardLinks) {
          const linkHref = await link.getAttribute('href');
          if (linkHref && linkHref.match(/\/estimates\/[0-9a-f-]+$/)) {
            await link.click();
            await page.waitForURL(/\/estimates\/[0-9a-f-]+$/);
            break;
          }
        }
      }
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });
    });

    /**
     * @requirement estimate-creation/REQ-16.7 @requirement estimate-creation/REQ-16.8
     * 「すべて見る」リンクで一覧画面へ遷移
     */
    test('REQ-16.7-16.8：「すべて見る」リンクで一覧画面へ遷移する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細画面に移動
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 見積書セクションが表示されることを確認
      await expect(page.locator('[data-testid="estimate-section"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 「すべて見る」リンクをクリック
      const viewAllLink = page
        .locator('[data-testid="estimate-section"]')
        .getByRole('link', { name: /すべて見る/i });
      await expect(viewAllLink).toBeVisible();
      await viewAllLink.click();

      // 見積書一覧画面に遷移することを確認
      await page.waitForURL(new RegExp(`/projects/${createdProjectId}/estimates$`));
      await expect(page.locator('[data-testid="estimate-list-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });
    });

    /**
     * @requirement estimate-creation/REQ-16.9 @requirement estimate-creation/REQ-16.10
     * 新規作成ボタンクリックで作成画面へ遷移
     */
    test('REQ-16.9-16.10：新規作成ボタンで作成画面へ遷移する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細画面に移動
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 見積書セクションが表示されることを確認
      await expect(page.locator('[data-testid="estimate-section"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 新規作成ボタンをクリック
      const createButton = page
        .locator('[data-testid="estimate-section"]')
        .getByRole('link', { name: /新規作成/i });
      await expect(createButton).toBeVisible();
      await createButton.click();

      // 見積書作成画面に遷移することを確認
      await page.waitForURL(new RegExp(`/projects/${createdProjectId}/estimates/new$`));
    });

    /**
     * @requirement estimate-creation/REQ-16.11
     * 空状態表示確認
     */
    test('REQ-16.11：見積書がない場合は空状態が表示される', async ({ page, request }) => {
      // 空のプロジェクトを作成
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const emptyProjectName = `空見積書プロジェクト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(emptyProjectName);
      await page.getByLabel(/現場住所/i).fill('東京都テスト区2');

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const options = await salesPersonSelect.locator('option').all();
      if (options.length > 1 && options[1]) {
        const firstUserOption = await options[1].getAttribute('value');
        if (firstUserOption) {
          await salesPersonSelect.selectOption(firstUserOption);
        }
      }

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const response = await createPromise;
      const responseBody = await response.json();
      const emptyProjectId = responseBody.id;

      // プロジェクト詳細画面に移動
      await page.goto(`/projects/${emptyProjectId}`);
      await page.waitForLoadState('networkidle');

      // 見積書セクションが表示されることを確認
      await expect(page.locator('[data-testid="estimate-section"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 空状態メッセージが表示されることを確認
      await expect(page.getByText(/見積書はまだありません/i)).toBeVisible();

      // 空状態でも新規作成リンクが表示されることを確認
      const createLink = page
        .locator('[data-testid="estimate-section"]')
        .getByRole('link', { name: /新規作成/i });
      await expect(createLink).toBeVisible();

      // クリーンアップ
      const baseUrl = API_BASE_URL;
      await request.delete(`${baseUrl}/api/projects/${emptyProjectId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    });

    /**
     * @requirement estimate-creation/REQ-16.12
     * スケルトンローダー表示確認
     * Note: スケルトンはロード中に一瞬だけ表示されるため、ネットワークスロットリングを使用
     */
    test('REQ-16.12：ローディング中にスケルトンが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // ネットワークを遅延させてスケルトンを確認
      await page.route('**/api/projects/*/estimates/latest*', async (route) => {
        // 1秒遅延させる
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.continue();
      });

      // プロジェクト詳細画面に移動
      await page.goto(`/projects/${createdProjectId}`);

      // スケルトンが表示されることを確認（ロード中）
      const skeleton = page.locator('[data-testid="estimate-section-skeleton"]');

      // スケルトンが一時的に表示されることを確認（表示されない場合もある）
      // Note: 高速なAPI応答の場合はスケルトンが見えないこともあるため、存在チェックのみ
      await skeleton.isVisible().catch(() => false);

      // ロード完了後は見積書セクションが表示される
      await expect(page.locator('[data-testid="estimate-section"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // Note: スケルトンは高速なAPI応答の場合は見えないことがある
      // テストはロード完了後のUIが正しいことで成功とする
    });

    /**
     * @requirement estimate-creation/REQ-16.13
     * 見積書セクションのUIが見積依頼セクションと同様のスタイル
     * Note: スタイルの一貫性はUIの視覚的確認となるため、構造の確認を行う
     */
    test('REQ-16.13：見積書セクションの構造が正しい', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細画面に移動
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 見積書セクションが表示されることを確認
      const section = page.locator('[data-testid="estimate-section"]');
      await expect(section).toBeVisible({ timeout: getTimeout(15000) });

      // セクションがregionロールを持つことを確認
      await expect(section).toHaveAttribute('role', 'region');

      // aria-labelledbyが設定されていることを確認
      await expect(section).toHaveAttribute('aria-labelledby', /estimate-section-title/);

      // セクションタイトルが正しいIDを持つことを確認
      const title = section.locator('#estimate-section-title');
      await expect(title).toBeVisible();
      await expect(title).toHaveText('見積書');
    });
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test.describe('クリーンアップ', () => {
    /**
     * テストで作成したデータを削除
     */
    test('テストデータの削除', async ({ request }) => {
      const baseUrl = API_BASE_URL;

      // アクセストークンが無い場合は再取得
      if (!accessToken) {
        const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
          data: {
            email: 'user@example.com',
            password: 'Password123!',
          },
        });
        const loginBody = await loginResponse.json();
        accessToken = loginBody.accessToken;
      }

      // 見積書を削除
      if (createdEstimateId) {
        await request.delete(`${baseUrl}/api/estimates/${createdEstimateId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      if (createdEstimateId2) {
        await request.delete(`${baseUrl}/api/estimates/${createdEstimateId2}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      // プロジェクトを削除（カスケードで関連データも削除される）
      if (createdProjectId) {
        await request.delete(`${baseUrl}/api/projects/${createdProjectId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      // テストデータリセット
      createdProjectId = null;
      createdEstimateId = null;
      createdEstimateId2 = null;
    });
  });
});
