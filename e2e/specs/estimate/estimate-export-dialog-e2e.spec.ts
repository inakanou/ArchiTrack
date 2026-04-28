/**
 * @fileoverview 見積書出力ダイアログのデフォルト値E2Eテスト
 *
 * Requirements coverage (estimate-creation):
 * - REQ-38.1: 出力ダイアログのチェックボックスのデフォルト値として「見積」と「実行」をONとする
 *
 * Note: REQ-38.2, REQ-38.3 は出力API側（バックエンド処理）の責務であり、
 *       本E2EテストではA区分対象外（B区分）として扱う。
 *
 * @module e2e/specs/estimate/estimate-export-dialog-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * 見積書出力ダイアログのデフォルト値E2Eテスト
 */
test.describe('見積書出力ダイアログのデフォルト値 (REQ-38)', () => {
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

      const projectName = `E2E出力ダイアログテスト_${Date.now()}`;
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

      const estimateResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `出力ダイアログテスト用見積書_${Date.now()}` },
        }
      );
      expect(estimateResponse.status()).toBe(201);
      const estimateBody = await estimateResponse.json();
      createdEstimateId = estimateBody.id;
      expect(createdEstimateId).toBeTruthy();
    });
  });

  // ============================================================================
  // REQ-38: 見積書出力のデフォルト設定
  // ============================================================================

  test.describe('REQ-38: 見積書出力のデフォルト設定', () => {
    /**
     * @requirement estimate-creation/REQ-38.1: 出力ダイアログの「見積」「実行」がデフォルトでON
     */
    test('出力ダイアログを開くと「見積」と「実行」のチェックボックスがデフォルトでONとなる (estimate-creation/REQ-38.1)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 出力ダイアログを開く
      await page.getByRole('button', { name: /^出力$/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 出力対象チェックボックスを取得
      const estimateCheckbox = page.locator('input[type="checkbox"][value="ESTIMATE"]');
      const executionCheckbox = page.locator('input[type="checkbox"][value="EXECUTION"]');
      const vendorCheckbox = page.locator('input[type="checkbox"][value="VENDOR"]');

      await expect(estimateCheckbox).toBeVisible({ timeout: getTimeout(5000) });
      await expect(executionCheckbox).toBeVisible();
      await expect(vendorCheckbox).toBeVisible();

      // REQ-38.1: 「見積」と「実行」がデフォルトでON、「業者」がOFF
      await expect(estimateCheckbox).toBeChecked();
      await expect(executionCheckbox).toBeChecked();
      await expect(vendorCheckbox).not.toBeChecked();

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
