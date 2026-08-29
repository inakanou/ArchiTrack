/**
 * @fileoverview 見積項目操作ツールバーのE2Eテスト
 *
 * Task 28.3: 見積項目操作E2Eテスト
 *
 * Requirements coverage (estimate-creation):
 * - REQ-23.1: 見積項目テーブルの上部に項目操作ツールバーを表示する
 * - REQ-23.2: 「項目追加」ボタンを提供し、ルートレベルに新規3行1セットを追加する
 * - REQ-23.8: 未選択時は選択必須ボタンをdisabled状態で表示する
 *
 * タスク 115.188 の是正: 本ファイルの検証は上記3件（118 行・165 行・133 行）だけである。
 * 前書きが名乗っていた REQ-23.3・23.4・23.5・23.6・23.7・23.9・23.10・12.1・12.3・12.4・
 * 12.5・12.6・2.5・2.6 は、対応する検証がファイル内に一件も存在しないため取り下げた
 * （選択状態での有効化・子項目追加・削除・複製・ハイライト・階層移動・ネスト深さのいずれも
 * 本ファイルでは操作していない）。要件24 の記載も、受入基準がすべて撤廃・移管済みで
 * 番号付きの受入基準を持たないため取り下げ済みである。
 *
 * @module e2e/specs/estimate/estimate-toolbar-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';

/**
 * 見積項目操作ツールバーのE2Eテスト
 */
test.describe('見積項目操作ツールバー', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
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
    test('準備1: テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成画面に移動
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `E2Eツールバーテスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);
      await page.getByLabel(/現場住所/i).fill('東京都千代田区テスト1-1-1');

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

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

    test('準備2: テスト用見積書を作成する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // アクセストークンを取得
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
      expect(accessToken).toBeTruthy();

      // APIで直接見積書を作成
      const response = await page.request.post(
        `${API_BASE_URL}/api/projects/${createdProjectId}/estimates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: 'ツールバーテスト用見積書' },
        }
      );
      expect(response.status()).toBe(201);

      const data = await response.json();
      createdEstimateId = data.id;
      expect(createdEstimateId).toBeTruthy();
    });
  });

  // ============================================================================
  // ツールバー表示・ボタン状態テスト (REQ-23.1, REQ-23.8)
  // ============================================================================

  test.describe('ツールバー表示とボタン状態', () => {
    test('ツールバーが見積項目テーブルの上部に表示される (REQ-23.1)', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // ツールバーが表示されること
      await expect(page.getByTestId('estimate-item-toolbar')).toBeVisible();
    });

    test('未選択時は選択必須ボタンがdisabled状態である (REQ-23.8)', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 項目追加ボタンは常に有効
      await expect(page.getByRole('button', { name: /^\+\s*項目追加$/ })).toBeEnabled();

      // 選択必須ボタンはdisabled
      await expect(page.getByRole('button', { name: /子項目追加/ })).toBeDisabled();
      await expect(page.getByRole('button', { name: /複製/ })).toBeDisabled();

      // ツールバー内の削除ボタンを確認
      const toolbar = page.getByTestId('estimate-item-toolbar');
      await expect(toolbar.getByRole('button', { name: /削除/ })).toBeDisabled();

      await expect(page.getByRole('button', { name: /上の階層へ/ })).toBeDisabled();
      await expect(page.getByRole('button', { name: /下の階層へ/ })).toBeDisabled();
    });
  });

  // ============================================================================
  // 項目追加テスト (REQ-23.2)
  // ============================================================================

  test.describe('項目追加操作', () => {
    test('項目追加ボタンでルートレベルに新規3行1セットが追加される (REQ-23.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 項目追加ボタンをクリック
      await page.getByRole('button', { name: /^\+\s*項目追加$/ }).click();

      // 見積項目テーブルに行が追加されたことを確認（3行1セット: 見積/実行/業者）
      await expect(page.locator('[data-testid="line-type-ESTIMATE"]').first()).toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(page.locator('[data-testid="line-type-EXECUTION"]').first()).toBeVisible();
      await expect(page.locator('[data-testid="line-type-VENDOR"]').first()).toBeVisible();
    });
  });
});
