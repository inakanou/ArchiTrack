/**
 * @fileoverview 利益率適用ダイアログのデフォルト値E2Eテスト
 *
 * Requirements coverage (estimate-creation):
 * - REQ-37.1: 利益率適用ダイアログが開かれた時、利益率の入力フィールドにデフォルト値として12.27を設定する
 * - REQ-37.2: デフォルト値をユーザーが手動で変更可能とする
 *
 * @module e2e/specs/estimate/profit-rate-dialog-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

const DEFAULT_PROFIT_RATE = '12.27';

/**
 * 利益率適用ダイアログのデフォルト値E2Eテスト
 */
test.describe('利益率適用ダイアログのデフォルト値 (REQ-37)', () => {
  test.describe.configure({ mode: 'serial' });

  // テストデータの保存
  let createdProjectId: string | null = null;
  let createdEstimateId: string | null = null;
  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ============================================================================
  // テストデータのセットアップ
  // ============================================================================

  test.describe('テストデータのセットアップ', () => {
    test('準備1：テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `E2E利益率テスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);
      await page.getByLabel(/現場住所/i).fill('東京都千代田区テスト1-1-1');

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
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const response = await createPromise;
      expect(response.status()).toBe(201);

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = match?.[1] ?? null;
      expect(createdProjectId).toBeTruthy();
    });

    test('準備2：APIトークン取得・見積書を作成する', async ({ request }) => {
      expect(createdProjectId).toBeTruthy();

      const baseUrl = API_BASE_URL;

      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: { email: 'user@example.com', password: 'Password123!' },
      });
      const loginBody = await loginResponse.json();
      accessToken = loginBody.accessToken;
      expect(accessToken).toBeTruthy();

      // 見積書をAPI経由で作成（内訳書なし、空の見積書）
      const estimateResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `利益率テスト用見積書_${Date.now()}` },
        }
      );
      expect(estimateResponse.status()).toBe(201);
      const estimateBody = await estimateResponse.json();
      createdEstimateId = estimateBody.id;
      expect(createdEstimateId).toBeTruthy();
    });
  });

  // ============================================================================
  // REQ-37: 利益率のデフォルト値設定
  // ============================================================================

  test.describe('REQ-37: 利益率のデフォルト値設定', () => {
    /**
     * @requirement estimate-creation/REQ-37.1: 利益率のデフォルト値12.27%
     */
    test('利益率適用ダイアログを開くと利益率にデフォルト値12.27が設定される (estimate-creation/REQ-37.1)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 利益率適用ダイアログを開く
      await page.getByRole('button', { name: '実行金額を見積金額に転記' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 利益率入力フィールドを取得
      const profitRateInput = page.locator('#profit-rate');
      await expect(profitRateInput).toBeVisible({ timeout: getTimeout(5000) });

      // デフォルト値が「12.27」であることを確認
      await expect(profitRateInput).toHaveValue(DEFAULT_PROFIT_RATE);

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });

    /**
     * @requirement estimate-creation/REQ-37.2: デフォルト値を手動で変更可能
     */
    test('デフォルト値の利益率をユーザーが手動で変更できる (estimate-creation/REQ-37.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 利益率適用ダイアログを開く
      await page.getByRole('button', { name: '実行金額を見積金額に転記' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 利益率入力フィールドを取得
      const profitRateInput = page.locator('#profit-rate');
      await expect(profitRateInput).toBeVisible({ timeout: getTimeout(5000) });
      await expect(profitRateInput).toHaveValue(DEFAULT_PROFIT_RATE);

      // 入力フィールドが編集可能であること（disabled/readonlyではない）
      await expect(profitRateInput).toBeEnabled();

      // 値を変更
      const newProfitRate = '20';
      await profitRateInput.fill(newProfitRate);
      await expect(profitRateInput).toHaveValue(newProfitRate);

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test.describe('クリーンアップ', () => {
    test('テストデータの削除', async ({ request }) => {
      const baseUrl = API_BASE_URL;

      if (!accessToken) {
        const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
          data: { email: 'user@example.com', password: 'Password123!' },
        });
        const loginBody = await loginResponse.json();
        accessToken = loginBody.accessToken;
      }

      if (createdEstimateId) {
        await request.delete(`${baseUrl}/api/estimates/${createdEstimateId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      if (createdProjectId) {
        await request.delete(`${baseUrl}/api/projects/${createdProjectId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      createdProjectId = null;
      createdEstimateId = null;
    });
  });
});
