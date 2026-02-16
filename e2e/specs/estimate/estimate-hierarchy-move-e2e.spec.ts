/**
 * @fileoverview 見積項目の階層移動APIエンドポイントのE2Eテスト
 *
 * Requirements coverage (estimate-creation):
 * - REQ-24.1: PATCH /api/estimates/:id/items/:itemId/move エンドポイント提供
 * - REQ-24.2: 新しい親項目IDが指定された場合、対象項目を子項目に移動する
 * - REQ-24.3: 親項目IDにnullが指定された場合、対象項目をルートレベルに移動する
 * - REQ-24.4: 移動先が自身または子孫の場合、循環参照エラー（400）を返す
 * - REQ-24.5: 移動対象の項目が存在しない場合、404 Not Foundを返す
 *
 * @module e2e/specs/estimate/estimate-hierarchy-move-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

test.describe('見積項目の階層移動API', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdEstimateId: string | null = null;
  let accessToken: string = '';
  const rootItemIds: string[] = [];

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ============================================================================
  // テストデータのセットアップ
  // ============================================================================

  test.describe('テストデータのセットアップ', () => {
    test('準備1: テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `E2E階層移動テスト_${Date.now()}`;
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

    test('準備2: テスト用見積書を作成し項目を追加する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
      expect(accessToken).toBeTruthy();

      // 見積書を作成
      const estimateResponse = await page.request.post(
        `${API_BASE_URL}/api/projects/${createdProjectId}/estimates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: '階層移動テスト用見積書' },
        }
      );
      expect(estimateResponse.status()).toBe(201);
      const estimateData = await estimateResponse.json();
      createdEstimateId = estimateData.id;
      expect(createdEstimateId).toBeTruthy();

      // 見積項目を3つ追加（ルートレベル）
      for (let i = 0; i < 3; i++) {
        const itemResponse = await page.request.post(
          `${API_BASE_URL}/api/estimates/${createdEstimateId}/items`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            data: {
              parentId: null,
              displayOrder: i,
              lines: [
                {
                  lineType: 'ESTIMATE',
                  name: `階層移動テスト項目${i + 1}`,
                  specification: null,
                  unit: '式',
                  quantity: 1,
                  unitPrice: 1000,
                },
                {
                  lineType: 'EXECUTION',
                  name: `階層移動テスト項目${i + 1}`,
                  specification: null,
                  unit: '式',
                  quantity: 1,
                  unitPrice: 1000,
                },
                {
                  lineType: 'VENDOR',
                  name: `階層移動テスト項目${i + 1}`,
                  specification: null,
                  unit: '式',
                  quantity: 1,
                  unitPrice: 1000,
                },
              ],
            },
          }
        );
        expect(itemResponse.status()).toBe(201);
        const itemData = await itemResponse.json();
        rootItemIds.push(itemData.id);
      }

      expect(rootItemIds.length).toBe(3);
    });
  });

  // ============================================================================
  // REQ-24.2: 新しい親項目IDが指定された場合、子項目に移動する
  // ============================================================================

  test.describe('親項目への移動', () => {
    /**
     * @requirement estimate-creation/REQ-24.2
     */
    test('新しい親項目IDを指定して子項目に移動できる (estimate-creation/REQ-24.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();
      expect(rootItemIds.length).toBeGreaterThanOrEqual(2);

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');

      // rootItemIds[2] を rootItemIds[0] の子に移動
      const response = await page.request.patch(
        `${API_BASE_URL}/api/estimates/${createdEstimateId}/items/${rootItemIds[2]}/move`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { newParentId: rootItemIds[0] },
        }
      );
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // 移動後に階層構造で取得して親子関係を確認
      const getResponse = await page.request.get(
        `${API_BASE_URL}/api/estimates/${createdEstimateId}/items`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      expect(getResponse.status()).toBe(200);

      const items = await getResponse.json();
      // 移動した項目が親項目の子になっていることを確認
      const parentItem = items.find((item: { id: string }) => item.id === rootItemIds[0]);
      expect(parentItem).toBeTruthy();
      const childIds = parentItem.children.map((c: { id: string }) => c.id);
      expect(childIds).toContain(rootItemIds[2]);
    });
  });

  // ============================================================================
  // REQ-24.3: 親項目IDにnullが指定された場合、ルートレベルに移動する
  // ============================================================================

  test.describe('ルートレベルへの移動', () => {
    /**
     * @requirement estimate-creation/REQ-24.3
     */
    test('親項目IDにnullを指定してルートレベルに移動できる (estimate-creation/REQ-24.3)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');

      // 前のテストで子に移動した rootItemIds[2] をルートに戻す
      const response = await page.request.patch(
        `${API_BASE_URL}/api/estimates/${createdEstimateId}/items/${rootItemIds[2]}/move`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { newParentId: null },
        }
      );
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // 移動後に階層構造で確認
      const getResponse = await page.request.get(
        `${API_BASE_URL}/api/estimates/${createdEstimateId}/items`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      expect(getResponse.status()).toBe(200);

      const items = await getResponse.json();
      // ルートレベルの項目IDに含まれることを確認（items配列のトップレベルに存在する）
      const rootIds = items.map((item: { id: string }) => item.id);
      expect(rootIds).toContain(rootItemIds[2]);
    });
  });

  // ============================================================================
  // REQ-24.4: 循環参照エラー
  // ============================================================================

  test.describe('循環参照チェック', () => {
    /**
     * @requirement estimate-creation/REQ-24.4
     */
    test('自身を親に指定すると400エラーが返される (estimate-creation/REQ-24.4)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');

      // 自身を親に指定
      const response = await page.request.patch(
        `${API_BASE_URL}/api/estimates/${createdEstimateId}/items/${rootItemIds[0]}/move`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { newParentId: rootItemIds[0] },
        }
      );
      expect(response.status()).toBe(400);
    });

    /**
     * @requirement estimate-creation/REQ-24.4
     */
    test('子孫を親に指定すると400エラーが返される (estimate-creation/REQ-24.4)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');

      // まず rootItemIds[2] を rootItemIds[0] の子に移動
      const moveResponse = await page.request.patch(
        `${API_BASE_URL}/api/estimates/${createdEstimateId}/items/${rootItemIds[2]}/move`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { newParentId: rootItemIds[0] },
        }
      );
      expect(moveResponse.status()).toBe(200);

      // rootItemIds[0] を rootItemIds[2]（自身の子孫）の子に移動しようとする
      const response = await page.request.patch(
        `${API_BASE_URL}/api/estimates/${createdEstimateId}/items/${rootItemIds[0]}/move`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { newParentId: rootItemIds[2] },
        }
      );
      expect(response.status()).toBe(400);
    });
  });

  // ============================================================================
  // REQ-24.5: 存在しない項目への移動
  // ============================================================================

  test.describe('存在しない項目', () => {
    /**
     * @requirement estimate-creation/REQ-24.5
     */
    test('存在しない項目を移動しようとすると404エラーが返される (estimate-creation/REQ-24.5)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');

      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const response = await page.request.patch(
        `${API_BASE_URL}/api/estimates/${createdEstimateId}/items/${nonExistentId}/move`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { newParentId: null },
        }
      );
      expect(response.status()).toBe(404);
    });
  });
});
