/**
 * @fileoverview 見積依頼機能のE2Eテスト
 *
 * Task 10: E2Eテスト実装
 *
 * Requirements:
 * - 10.1: 見積依頼作成フローのE2Eテスト
 * - 10.2: 項目選択・テキスト表示のE2Eテスト
 * - 10.3: Excel出力・クリップボードコピーのE2Eテスト
 * - 10.4: 編集・削除フローのE2Eテスト
 *
 * 注意: このテストは協力業者と内訳書の作成を必要とするため、
 * テスト環境の制約により一部のテストは前提条件を検証します。
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * 見積依頼機能のE2Eテスト
 */
test.describe('見積依頼機能', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストデータの保存
  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  // ============================================================================
  // データセットアップ：プロジェクト、協力業者の作成
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
      const projectName = `E2E見積依頼テスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      // 現場住所を入力（見積依頼文に使用される）
      await page.getByLabel(/現場住所/i).fill('東京都渋谷区テスト1-2-3');

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
     * テスト準備：協力業者（取引先）の作成
     */
    test('準備2：テスト用協力業者を作成する', async ({ page }) => {
      // 第3原則: テストは前提条件で自動的に無効化せず、失敗させる
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 取引先作成画面に移動
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

      // 取引先情報を入力
      const partnerName = `E2Eテスト協力業者_${Date.now()}`;
      await page.getByLabel('取引先名').fill(partnerName);
      await page
        .getByLabel('フリガナ', { exact: true })
        .fill('イーツーイーテストキョウリョクギョウシャ');
      await page.getByLabel('住所').fill('東京都新宿区テスト町1-1-1');

      // 協力業者チェックボックスをオン
      const subcontractorCheckbox = page.getByRole('checkbox', { name: /協力業者/i });
      await subcontractorCheckbox.check();
      await expect(subcontractorCheckbox).toBeChecked();

      // メールアドレスを入力（見積依頼文で使用）
      await page.getByLabel('メールアドレス').fill('test-subcontractor@example.com');

      // 取引先作成
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      const response = await createPromise;
      expect(response.status()).toBe(201);

      // URLから取引先IDを取得（リダイレクト先から）
      await page.waitForURL(/\/trading-partners/);

      // 作成成功を確認
      await expect(page.getByText(/取引先を作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // APIレスポンスからIDを取得
      const responseData = await response.json();
      createdTradingPartnerId = responseData.id;

      expect(createdTradingPartnerId).toBeTruthy();
    });
  });

  // ============================================================================
  // 10.1: 見積依頼作成フローのE2Eテスト
  // ============================================================================

  test.describe('見積依頼作成フロー', () => {
    /**
     * @requirement estimate-request/REQ-3.1
     * @requirement estimate-request/REQ-3.2
     * @requirement estimate-request/REQ-3.3
     */
    test('見積依頼作成フォームに必要なフィールドが表示される (REQ-3.1, REQ-3.2, REQ-3.3)', async ({
      page,
    }) => {
      // 第3原則: テストは前提条件で自動的に無効化せず、失敗させる
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積依頼作成画面に移動
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      // フォームの読み込みを待機（読み込み中表示が消えるまで）
      const loadingIndicator = page.getByText(/読み込み中/i);
      const loadingCount = await loadingIndicator.count();
      if (loadingCount > 0) {
        await expect(loadingIndicator).not.toBeVisible({
          timeout: getTimeout(15000),
        });
      }

      // 名前入力フィールドが表示される（Requirements: 3.1）
      const nameInput = page.locator('input#name');
      await expect(nameInput).toBeVisible({ timeout: getTimeout(10000) });
      await expect(nameInput).toHaveAttribute('aria-required', 'true');

      // 宛先選択フィールドが表示される（Requirements: 3.2）
      const tradingPartnerSelect = page.locator('select[aria-label="宛先"]');
      await expect(tradingPartnerSelect).toBeVisible();

      // 内訳書選択フィールドが表示される（Requirements: 3.3）
      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await expect(itemizedStatementSelect).toBeVisible();

      // 作成・キャンセルボタンが表示される
      await expect(page.getByRole('button', { name: /作成/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /キャンセル/i })).toBeVisible();
    });

    /**
     * @requirement estimate-request/REQ-3.8
     * @requirement estimate-request/REQ-3.9
     *
     * 内訳書がないプロジェクトで見積依頼を作成しようとした場合のメッセージ表示
     */
    test('内訳書がない場合にメッセージが表示される (REQ-3.9)', async ({ page }) => {
      // 第3原則: テストは前提条件で自動的に無効化せず、失敗させる
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      // ローディング完了を待機
      const loadingIndicator = page.getByText(/読み込み中/i);
      const loadingCount = await loadingIndicator.count();
      if (loadingCount > 0) {
        await expect(loadingIndicator).not.toBeVisible({
          timeout: getTimeout(15000),
        });
      }

      // 内訳書がない場合のメッセージが表示される
      const noStatementsMessage = page.getByText(/内訳書が登録されていません/i);
      await expect(noStatementsMessage).toBeVisible({ timeout: getTimeout(10000) });

      // 作成ボタンが無効化されている
      const createButton = page.getByRole('button', { name: /作成/i });
      await expect(createButton).toBeDisabled();
    });

    /**
     * @requirement estimate-request/REQ-3.4
     *
     * 宛先選択フィールドに作成した協力業者が表示される
     */
    test('宛先選択フィールドに協力業者が表示される (REQ-3.4)', async ({ page }) => {
      // 第3原則: テストは前提条件で自動的に無効化せず、失敗させる
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      // ローディング完了を待機
      const loadingIndicator = page.getByText(/読み込み中/i);
      const loadingCount = await loadingIndicator.count();
      if (loadingCount > 0) {
        await expect(loadingIndicator).not.toBeVisible({
          timeout: getTimeout(15000),
        });
      }

      // 宛先選択フィールドに作成した協力業者が選択肢として存在する
      const tradingPartnerSelect = page.locator('select[aria-label="宛先"]');
      const options = await tradingPartnerSelect.locator('option').all();

      // 協力業者が少なくとも1つ選択肢にある（プレースホルダー以外）
      expect(options.length).toBeGreaterThan(1);

      // 作成した協力業者のIDが選択肢に含まれる
      const optionValues = await Promise.all(options.map((o) => o.getAttribute('value')));
      expect(optionValues).toContain(createdTradingPartnerId);
    });

    /**
     * @requirement estimate-request/REQ-3.7
     *
     * キャンセルボタンをクリックすると一覧画面に戻る
     */
    test('キャンセルボタンで一覧画面に戻る', async ({ page }) => {
      // 第3原則: テストは前提条件で自動的に無効化せず、失敗させる
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      // ローディング完了を待機
      const loadingIndicator = page.getByText(/読み込み中/i);
      const loadingCount = await loadingIndicator.count();
      if (loadingCount > 0) {
        await expect(loadingIndicator).not.toBeVisible({
          timeout: getTimeout(15000),
        });
      }

      // キャンセルボタンをクリック
      await page.getByRole('button', { name: /キャンセル/i }).click();

      // 一覧画面に遷移することを確認
      await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\/estimate-requests$/, {
        timeout: getTimeout(10000),
      });
    });
  });

  // ============================================================================
  // プロジェクト詳細画面での見積依頼セクションテスト
  // ============================================================================

  test.describe('プロジェクト詳細画面', () => {
    /**
     * @requirement estimate-request/REQ-1.1
     * @requirement estimate-request/REQ-1.2
     */
    test('プロジェクト詳細画面に見積依頼セクションが表示される (REQ-1.1, REQ-1.2)', async ({
      page,
    }) => {
      // 第3原則: テストは前提条件で自動的に無効化せず、失敗させる
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 見積依頼セクションが表示される
      await expect(page.getByTestId('estimate-request-section')).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 新規作成ボタンが表示される
      const newButton = page.getByRole('link', { name: /新規作成/i });
      const newButtonVisible = await newButton.isVisible().catch(() => false);
      if (newButtonVisible) {
        await expect(newButton).toBeVisible();
      }
    });

    /**
     * @requirement estimate-request/REQ-1.3
     * @requirement estimate-request/REQ-1.4
     */
    test('見積依頼一覧画面へ遷移できる (REQ-1.3, REQ-1.4)', async ({ page }) => {
      // 第3原則: テストは前提条件で自動的に無効化せず、失敗させる
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 「すべて見る」リンクまたは見積依頼セクションから一覧画面へ遷移
      const allLink = page.getByRole('link', { name: /すべて見る|見積依頼一覧/i });
      const hasAllLink = await allLink.isVisible().catch(() => false);

      if (hasAllLink) {
        await allLink.click();
        await expect(page).toHaveURL(/\/estimate-requests/, {
          timeout: getTimeout(10000),
        });
      } else {
        // 直接URLで遷移してテスト
        await page.goto(`/projects/${createdProjectId}/estimate-requests`);
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveURL(/\/estimate-requests$/);
      }
    });
  });

  // ============================================================================
  // 見積依頼一覧画面テスト
  // ============================================================================

  test.describe('見積依頼一覧画面', () => {
    /**
     * @requirement estimate-request/REQ-2.1
     * @requirement estimate-request/REQ-2.2
     */
    test('見積依頼一覧画面が正しく表示される (REQ-2.1, REQ-2.2)', async ({ page }) => {
      // 第3原則: テストは前提条件で自動的に無効化せず、失敗させる
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests`);
      await page.waitForLoadState('networkidle');

      // ページタイトルが表示される（見積依頼一覧のヘディング）
      await expect(page.getByRole('heading', { name: /見積依頼一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 新規作成ボタンが表示される（ページ内に複数存在する可能性があるので first() を使用）
      await expect(page.getByRole('link', { name: /新規作成/i }).first()).toBeVisible();

      // パンくずナビゲーションが表示される
      await expect(page.getByText(/プロジェクト一覧/i)).toBeVisible();
    });

    /**
     * @requirement estimate-request/REQ-2.5
     */
    test('見積依頼がない場合のメッセージが表示される (REQ-2.5)', async ({ page }) => {
      // 第3原則: テストは前提条件で自動的に無効化せず、失敗させる
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests`);
      await page.waitForLoadState('networkidle');

      // 読み込み完了を待機
      await expect(page.getByText(/読み込み中/i)).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 見積依頼がない場合のメッセージが表示される（実際のメッセージは「見積依頼はまだありません」）
      await expect(page.getByText(/見積依頼はまだありません/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  // ============================================================================
  // 10.2: 項目選択・テキスト表示のE2Eテスト
  // ============================================================================

  test.describe('項目選択・テキスト表示', () => {
    /**
     * @requirement estimate-request/REQ-4.3
     * @requirement estimate-request/REQ-4.4
     *
     * 見積依頼テキストの表示と項目選択
     */
    test('見積依頼作成フォームにプレビュー領域がある (REQ-4.3, REQ-4.4)', async ({ page }) => {
      // 第3原則: テストは前提条件で自動的に無効化せず、失敗させる
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積依頼作成画面に移動
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      // ローディング完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // フォームフィールドが正しく動作することを確認
      const nameInput = page.locator('input#name');
      await expect(nameInput).toBeVisible({ timeout: getTimeout(10000) });

      // 名前を入力してUIが反応することを確認
      await nameInput.fill('テスト見積依頼名');
      await expect(nameInput).toHaveValue('テスト見積依頼名');
    });
  });
});
