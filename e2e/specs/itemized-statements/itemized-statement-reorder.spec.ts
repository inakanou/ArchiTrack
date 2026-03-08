/**
 * @fileoverview 内訳書項目の並び替え機能 E2Eテスト
 *
 * Task 24.2: 並び替え機能のE2Eテスト
 *
 * Requirements coverage (itemized-statement-generation):
 * - REQ-16.1: 初期ソート順序（任意分類>工種>名称>規格>単位の昇順）
 * - REQ-17.1: 各内訳項目行に上移動ボタン(上向き矢印)と下移動ボタン(下向き矢印)を表示する
 * - REQ-17.2: 先頭の項目の上移動ボタンを無効化する
 * - REQ-17.3: 末尾の項目の下移動ボタンを無効化する
 * - REQ-17.8: 保存ボタンクリック時にAPIを呼び出す
 * - REQ-17.9: 保存成功時に「並び順を保存しました」トースト通知
 *
 * @module e2e/specs/itemized-statements/itemized-statement-reorder.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * 内訳書項目の並び替え機能のE2Eテスト
 */
test.describe('内訳書項目の並び替え', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストで作成したリソースのIDを保存
  let testProjectId: string | null = null;
  let testQuantityTableId: string | null = null;
  let createdItemizedStatementId: string | null = null;

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  /**
   * 事前準備: テスト用プロジェクト・数量表・内訳書を作成
   */
  test.describe('事前準備', () => {
    test('テスト用プロジェクト・数量表・内訳書を作成する', async ({ page, request }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // APIトークンを取得
      const baseUrl = API_BASE_URL;
      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: {
          email: 'user@example.com',
          password: 'Password123!',
        },
      });
      const loginBody = await loginResponse.json();
      const accessToken = loginBody.accessToken;

      // ユーザー情報を取得（salesPersonId用）
      const meResponse = await request.get(`${baseUrl}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const meBody = await meResponse.json();
      const userId = meBody.id;

      // プロジェクト作成
      const projectName = `並び替えテスト用プロジェクト_${Date.now()}`;
      const projectResponse = await request.post(`${baseUrl}/api/projects`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: projectName,
          salesPersonId: userId,
        },
      });
      const projectBody = await projectResponse.json();
      testProjectId = projectBody.id;
      expect(testProjectId).toBeTruthy();

      // 数量表作成
      const qtResponse = await request.post(
        `${baseUrl}/api/projects/${testProjectId}/quantity-tables`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: '並び替えテスト用数量表' },
        }
      );
      const qtBody = await qtResponse.json();
      testQuantityTableId = qtBody.id;
      expect(testQuantityTableId).toBeTruthy();

      // グループ作成
      const groupResponse = await request.post(
        `${baseUrl}/api/quantity-tables/${testQuantityTableId}/groups`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: 'テストグループ', displayOrder: 0 },
        }
      );
      const groupBody = await groupResponse.json();
      const groupId = groupBody.id;

      // 数量項目を5件作成（異なる分類で並び替えテストしやすいように）
      const items = [
        {
          customCategory: 'C分類',
          workType: '塗装工事',
          name: 'ペイント',
          specification: '水性',
          unit: 'L',
          quantity: 10,
        },
        {
          customCategory: 'A分類',
          workType: '電気工事',
          name: 'ケーブル',
          specification: '100m',
          unit: 'm',
          quantity: 100,
        },
        {
          customCategory: 'B分類',
          workType: '配管工事',
          name: 'パイプ',
          specification: '50mm',
          unit: '本',
          quantity: 50,
        },
        {
          customCategory: 'A分類',
          workType: '電気工事',
          name: 'コンセント',
          specification: '2口',
          unit: '個',
          quantity: 20,
        },
        {
          customCategory: 'B分類',
          workType: '建築工事',
          name: 'ボルト',
          specification: 'M10',
          unit: '個',
          quantity: 200,
        },
      ];

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        await request.post(`${baseUrl}/api/quantity-tables/${testQuantityTableId}/items`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            quantityGroupId: groupId,
            ...item,
            majorCategory: '大項目',
            calculationMethod: 'STANDARD',
            adjustmentFactor: 1.0,
            roundingUnit: 0.01,
            displayOrder: i,
          },
        });
      }

      // 内訳書作成
      const statementResponse = await request.post(
        `${baseUrl}/api/projects/${testProjectId}/itemized-statements`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: '並び替えテスト内訳書',
            quantityTableId: testQuantityTableId,
          },
        }
      );
      const statementBody = await statementResponse.json();
      createdItemizedStatementId = statementBody.id;
      expect(createdItemizedStatementId).toBeTruthy();
    });
  });

  /**
   * 並び替えUI表示テスト
   */
  test.describe('並び替えUI (REQ-17.1, REQ-17.2, REQ-17.3)', () => {
    test('各項目行に上下ボタンが表示される', async ({ page }) => {
      if (!createdItemizedStatementId) {
        throw new Error('内訳書IDが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/itemized-statements/${createdItemizedStatementId}`);

      // テーブルが表示されるまで待機
      await expect(page.getByRole('table')).toBeVisible({ timeout: getTimeout(15000) });

      // 上下ボタンの存在確認
      const upButtons = page.getByRole('button', { name: '上へ移動' });
      const downButtons = page.getByRole('button', { name: '下へ移動' });

      await expect(upButtons.first()).toBeVisible();
      await expect(downButtons.first()).toBeVisible();

      // ボタン数がデータ行数と一致
      const upCount = await upButtons.count();
      const downCount = await downButtons.count();
      expect(upCount).toBeGreaterThan(0);
      expect(upCount).toBe(downCount);
    });

    test('先頭項目の上移動ボタンが無効化されている', async ({ page }) => {
      if (!createdItemizedStatementId) {
        throw new Error('内訳書IDが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/itemized-statements/${createdItemizedStatementId}`);
      await expect(page.getByRole('table')).toBeVisible({ timeout: getTimeout(15000) });

      // 先頭行の上移動ボタンが無効化
      const firstUpButton = page.getByRole('button', { name: '上へ移動' }).first();
      await expect(firstUpButton).toBeDisabled();
    });

    test('末尾項目の下移動ボタンが無効化されている', async ({ page }) => {
      if (!createdItemizedStatementId) {
        throw new Error('内訳書IDが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/itemized-statements/${createdItemizedStatementId}`);
      await expect(page.getByRole('table')).toBeVisible({ timeout: getTimeout(15000) });

      // 末尾行の下移動ボタンが無効化
      const downButtons = page.getByRole('button', { name: '下へ移動' });
      const lastDownButton = downButtons.last();
      await expect(lastDownButton).toBeDisabled();
    });
  });

  /**
   * 並び替え操作と保存テスト
   */
  test.describe('並び替え操作と保存 (REQ-17.8, REQ-17.9)', () => {
    test('項目を下方向に移動して保存すると並び順が保存される', async ({ page }) => {
      if (!createdItemizedStatementId) {
        throw new Error('内訳書IDが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/itemized-statements/${createdItemizedStatementId}`);
      await expect(page.getByRole('table')).toBeVisible({ timeout: getTimeout(15000) });

      // テーブルの行数を確認
      const table = page.getByRole('table');
      const tbodyRows = table.locator('tbody tr');
      const rowCount = await tbodyRows.count();
      expect(rowCount).toBeGreaterThan(1);

      // 最初の行の名称を取得（移動前）
      const firstRowCells = tbodyRows.first().getByRole('cell');
      const firstRowName = await firstRowCells.nth(3).textContent(); // 名称列

      // 最初の行の下移動ボタンをクリック
      const firstDownButton = tbodyRows.first().getByRole('button', { name: '下へ移動' });
      await firstDownButton.click();

      // 保存ボタンが表示されることを確認
      const saveButton = page.getByRole('button', { name: /並び順を保存/ });
      await expect(saveButton).toBeVisible({ timeout: getTimeout(5000) });

      // API呼び出しを監視
      const orderUpdatePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/items/order') &&
          response.request().method() === 'PATCH' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      // 保存ボタンをクリック
      await saveButton.click();
      await orderUpdatePromise;

      // 成功メッセージが表示される (REQ-17.9)
      await expect(page.getByText(/並び順を保存しました/)).toBeVisible({
        timeout: getTimeout(5000),
      });

      // ページをリロードして並び順が維持されていることを確認
      await page.reload();
      await expect(page.getByRole('table')).toBeVisible({ timeout: getTimeout(15000) });

      // 移動後の2行目に元の最初の行の名称が表示されている
      const reloadedRows = page.getByRole('table').locator('tbody tr');
      const secondRowCells = reloadedRows.nth(1).getByRole('cell');
      const secondRowName = await secondRowCells.nth(3).textContent();
      expect(secondRowName).toBe(firstRowName);
    });

    test('項目を上方向に移動して保存すると並び順が保存される', async ({ page }) => {
      if (!createdItemizedStatementId) {
        throw new Error('内訳書IDが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/itemized-statements/${createdItemizedStatementId}`);
      await expect(page.getByRole('table')).toBeVisible({ timeout: getTimeout(15000) });

      // 2番目の行の上移動ボタンをクリック
      const table = page.getByRole('table');
      const tbodyRows = table.locator('tbody tr');
      const secondUpButton = tbodyRows.nth(1).getByRole('button', { name: '上へ移動' });
      await secondUpButton.click();

      // 保存ボタンが表示される
      const saveButton = page.getByRole('button', { name: /並び順を保存/ });
      await expect(saveButton).toBeVisible({ timeout: getTimeout(5000) });

      // API呼び出しを監視して保存
      const orderUpdatePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/items/order') &&
          response.request().method() === 'PATCH' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await saveButton.click();
      await orderUpdatePromise;

      // 成功メッセージ
      await expect(page.getByText(/並び順を保存しました/)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    test('複数回並び替え操作後に保存するとAPIは1回のみ呼ばれる', async ({ page }) => {
      if (!createdItemizedStatementId) {
        throw new Error('内訳書IDが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/itemized-statements/${createdItemizedStatementId}`);
      await expect(page.getByRole('table')).toBeVisible({ timeout: getTimeout(15000) });

      // API呼び出し回数を記録
      let orderApiCallCount = 0;
      page.on('request', (req) => {
        if (req.url().includes('/items/order') && req.method() === 'PATCH') {
          orderApiCallCount++;
        }
      });

      const table = page.getByRole('table');
      const tbodyRows = table.locator('tbody tr');

      // 複数回の並び替え操作（保存前にはAPIが呼ばれないことを確認）
      const firstDownButton = tbodyRows.first().getByRole('button', { name: '下へ移動' });
      await firstDownButton.click();
      expect(orderApiCallCount).toBe(0);

      // さらに移動
      const secondDownButton = tbodyRows.nth(1).getByRole('button', { name: '下へ移動' });
      await secondDownButton.click();
      expect(orderApiCallCount).toBe(0);

      // 保存ボタンをクリック
      const saveButton = page.getByRole('button', { name: /並び順を保存/ });
      await expect(saveButton).toBeVisible();

      const orderUpdatePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/items/order') &&
          response.request().method() === 'PATCH' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await saveButton.click();
      await orderUpdatePromise;

      // 保存時に1回だけAPIが呼ばれる
      expect(orderApiCallCount).toBe(1);
    });
  });

  /**
   * 初期ソート順序テスト
   */
  test.describe('初期ソート順序 (REQ-16.1)', () => {
    test('内訳書作成時に任意分類>工種>名称>規格>単位の昇順で並ぶ', async ({ page, request }) => {
      if (!testProjectId || !testQuantityTableId) {
        throw new Error('テスト用リソースが未設定です');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // APIトークンを取得
      const baseUrl = API_BASE_URL;
      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: {
          email: 'user@example.com',
          password: 'Password123!',
        },
      });
      const loginBody = await loginResponse.json();
      const accessToken = loginBody.accessToken;

      // 新しい内訳書を作成
      const statementResponse = await request.post(
        `${baseUrl}/api/projects/${testProjectId}/itemized-statements`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: '初期ソート確認用内訳書',
            quantityTableId: testQuantityTableId,
          },
        }
      );
      const statementBody = await statementResponse.json();
      const statementId = statementBody.id;
      expect(statementId).toBeTruthy();

      // 詳細画面に遷移
      await page.goto(`/itemized-statements/${statementId}`);
      await expect(page.getByRole('table')).toBeVisible({ timeout: getTimeout(15000) });

      // テーブルの行を取得して初期ソート順序を確認
      const table = page.getByRole('table');
      const tbodyRows = table.locator('tbody tr');
      const rowCount = await tbodyRows.count();
      expect(rowCount).toBeGreaterThan(0);

      // 任意分類列の値を取得（先頭列はSortOrderButtons、その次がcustomCategory）
      const categories: string[] = [];
      for (let i = 0; i < rowCount; i++) {
        const cells = tbodyRows.nth(i).getByRole('cell');
        // SortOrderButtons列をスキップ (offset=1)
        const cellCount = await cells.count();
        const offset = cellCount === 7 ? 1 : 0;
        const categoryText = await cells.nth(offset).textContent();
        categories.push(categoryText ?? '');
      }

      // A分類が最初の方に来ることを確認（昇順）
      const nonEmptyCategories = categories.filter((c) => c !== '-' && c !== '');
      for (let i = 0; i < nonEmptyCategories.length - 1; i++) {
        expect(nonEmptyCategories[i]! <= nonEmptyCategories[i + 1]!).toBe(true);
      }
    });
  });

  /**
   * クリーンアップ
   */
  test.describe('クリーンアップ', () => {
    test('テストデータを削除する', async ({ request }) => {
      if (!testProjectId) return;

      const baseUrl = API_BASE_URL;
      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: {
          email: 'user@example.com',
          password: 'Password123!',
        },
      });
      const loginBody = await loginResponse.json();
      const accessToken = loginBody.accessToken;

      // プロジェクト削除（カスケードで内訳書・数量表も削除される）
      await request.delete(`${baseUrl}/api/projects/${testProjectId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    });
  });
});
