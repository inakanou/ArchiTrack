/**
 * @fileoverview 見積項目の階層移動のE2Eテスト（画面操作＋一括保存）
 *
 * Task 53.13: 旧API直叩き（`PATCH /api/estimates/:id/items/:itemId/move`）を
 * 画面操作＋一括保存（`PUT /api/estimates/:id/save`）の検証へ移行した。
 * REQ-24 は撤廃され（requirements.md「Requirement 24」）、階層移動は編集セッション中の
 * ローカル操作となり、確定は保存1回に集約された。
 *
 * Requirements coverage (estimate-creation):
 * - REQ-23.9: 「上の階層へ移動」ボタンを提供する
 * - REQ-23.10: 「下の階層へ移動」ボタンを提供する
 * - REQ-12.6: 見積項目の親項目を変更（移動）可能とする
 * - REQ-12.7: 上記の操作を編集セッション中にサーバーへ問い合わせずに行う
 * - REQ-43.1: 階層の上げ下げをサーバーへの保存を伴わずに画面上の明細へ反映する
 * - REQ-43.2: 操作を連続して行ってもサーバーへの保存を発生させない
 * - REQ-42.1: 追加・削除・更新・並び順の変更・階層の変更を1回の保存操作でまとめて確定する
 * - REQ-34.5: 階層を変更して保存した場合、画面再読み込み後も変更後の構造で表示する
 * - REQ-44.6: ルートレベルで「上の階層へ移動」は実行できない
 *
 * @module e2e/specs/estimate/estimate-hierarchy-move-e2e.spec
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import {
  buildNewEstimateItemNode,
  findEstimateItemByName,
  getEstimateItemTree,
  saveEstimateDraft,
  type EstimateItemNode,
} from '../../helpers/estimate-draft';

test.describe('見積項目の階層移動（画面操作と一括保存）', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdEstimateId: string | null = null;
  let accessToken: string = '';

  /** 明細ツリーの初期状態（ルート3項目）へ戻す */
  const resetItemTree = async (page: Page): Promise<void> => {
    await saveEstimateDraft(page.request, accessToken, createdEstimateId!, [
      buildNewEstimateItemNode({
        name: '階層移動テスト項目1',
        unit: '式',
        quantity: 1,
        estimateUnitPrice: 1000,
        executionUnitPrice: 1000,
        vendorUnitPrice: 1000,
      }),
      buildNewEstimateItemNode({
        name: '階層移動テスト項目2',
        unit: '式',
        quantity: 1,
        estimateUnitPrice: 1000,
        executionUnitPrice: 1000,
        vendorUnitPrice: 1000,
      }),
      buildNewEstimateItemNode({
        name: '階層移動テスト項目3',
        unit: '式',
        quantity: 1,
        estimateUnitPrice: 1000,
        executionUnitPrice: 1000,
        vendorUnitPrice: 1000,
      }),
    ]);
  };

  /** 見積書画面を開いて明細が描画されるまで待つ */
  const openEstimatePage = async (page: Page): Promise<void> => {
    await page.goto(`/estimates/${createdEstimateId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(page.locator('[aria-label="見積項目テーブル"]')).toBeVisible({
      timeout: getTimeout(15000),
    });
  };

  /** 明細行を選択する（入力欄を避けて行の端をクリックする） */
  const selectRow = async (page: Page, itemId: string): Promise<void> => {
    const row = page.getByTestId(`estimate-item-${itemId}`);
    await expect(row).toBeVisible({ timeout: getTimeout(10000) });
    await row.click({ position: { x: 5, y: 5 } });
    await expect(row).toHaveAttribute('data-selected', 'true');
  };

  /** 保存ボタンを押し、`PUT /:id/save` が1回だけ成功することを確認する（REQ-42.1） */
  const saveAndExpectSingleRequest = async (page: Page): Promise<void> => {
    const saveRequests: string[] = [];
    const countSave = (request: { url: () => string; method: () => string }): void => {
      if (request.url().includes(`/api/estimates/${createdEstimateId}/save`)) {
        saveRequests.push(request.method());
      }
    };
    page.on('request', countSave);

    const savePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/estimates/${createdEstimateId}/save`) &&
        response.request().method() === 'PUT',
      { timeout: getTimeout(30000) }
    );
    const saveButton = page.getByRole('button', { name: /^保存$/i });
    await expect(saveButton).toBeEnabled({ timeout: getTimeout(10000) });
    await saveButton.click();

    const saveResponse = await savePromise;
    expect(saveResponse.status()).toBe(200);
    await page.waitForLoadState('networkidle');
    page.off('request', countSave);

    // 保存はまとめて1回（REQ-42.1）
    expect(saveRequests).toEqual(['PUT']);
  };

  const fetchTree = async (page: Page): Promise<EstimateItemNode[]> =>
    await getEstimateItemTree(page.request, accessToken, createdEstimateId!);

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

      // 見積項目を3つ追加（ルートレベル）。撤去済みの `POST /:id/items` ではなく
      // 一括保存（`PUT /:id/save`）で作成する
      await resetItemTree(page);

      const tree = await fetchTree(page);
      expect(tree.length).toBe(3);
      expect(tree.every((item) => item.parentId === null)).toBe(true);
    });
  });

  // ============================================================================
  // 下の階層へ移動（REQ-23.10, 12.6, 34.5, 42.1）
  // ============================================================================

  test.describe('下の階層へ移動', () => {
    /**
     * @requirement estimate-creation/REQ-23.10
     * @requirement estimate-creation/REQ-12.6
     * @requirement estimate-creation/REQ-34.5
     * @requirement estimate-creation/REQ-42.1
     */
    test('「下の階層へ」で直前の兄弟の子になり保存後の再読込でも維持される (estimate-creation/REQ-23.10, estimate-creation/REQ-12.6, estimate-creation/REQ-34.5, estimate-creation/REQ-42.1)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
      await resetItemTree(page);

      const before = await fetchTree(page);
      const parentId = findEstimateItemByName(before, '階層移動テスト項目1')!.id;
      const targetId = findEstimateItemByName(before, '階層移動テスト項目2')!.id;

      await openEstimatePage(page);
      await selectRow(page, targetId);

      // 直前に兄弟が存在するため「下の階層へ」が有効になる
      const moveDownButton = page.getByRole('button', { name: /下の階層へ/ });
      await expect(moveDownButton).toBeEnabled();
      await moveDownButton.click();

      await saveAndExpectSingleRequest(page);

      // 再読込後も親子関係が維持される（REQ-34.5）
      const after = await fetchTree(page);
      const parentItem = after.find((item) => item.id === parentId);
      expect(parentItem).toBeDefined();
      expect(parentItem!.children.map((child) => child.id)).toContain(targetId);
      // ルートレベルからは外れている
      expect(after.map((item) => item.id)).not.toContain(targetId);
    });
  });

  // ============================================================================
  // 上の階層へ移動（REQ-23.9, 12.6, 34.5, 42.1）
  // ============================================================================

  test.describe('上の階層へ移動', () => {
    /**
     * @requirement estimate-creation/REQ-23.9
     * @requirement estimate-creation/REQ-12.6
     * @requirement estimate-creation/REQ-34.5
     * @requirement estimate-creation/REQ-42.1
     */
    test('「上の階層へ」で子項目がルートレベルへ戻り保存後の再読込でも維持される (estimate-creation/REQ-23.9, estimate-creation/REQ-12.6, estimate-creation/REQ-34.5, estimate-creation/REQ-42.1)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
      await resetItemTree(page);

      const before = await fetchTree(page);
      const parentId = findEstimateItemByName(before, '階層移動テスト項目1')!.id;
      const targetId = findEstimateItemByName(before, '階層移動テスト項目2')!.id;

      await openEstimatePage(page);

      // 親子関係は編集セッション中の操作で作る（REQ-43.1: 行操作はローカル完結）。
      // 保存を挟まずに「下の階層へ」→「上の階層へ」と戻せることを確認する。
      await selectRow(page, targetId);
      const moveDownButton = page.getByRole('button', { name: /下の階層へ/ });
      await expect(moveDownButton).toBeEnabled();
      await moveDownButton.click();

      // 親を持つ状態になったため「上の階層へ」が有効になる（REQ-23.9）
      const moveUpButton = page.getByRole('button', { name: /上の階層へ/ });
      await expect(moveUpButton).toBeEnabled();
      await moveUpButton.click();

      await saveAndExpectSingleRequest(page);

      // 再読込後もルートレベルに存在する（REQ-34.5）
      const after = await fetchTree(page);
      const movedItem = after.find((item) => item.id === targetId);
      expect(movedItem).toBeDefined();
      expect(movedItem!.parentId).toBeNull();
      // 元の親も子を持たないルート項目のまま
      const parentItem = after.find((item) => item.id === parentId);
      expect(parentItem).toBeDefined();
      expect(parentItem!.children.length).toBe(0);
    });

    /**
     * @requirement estimate-creation/REQ-44.6
     * @requirement estimate-creation/REQ-23.9
     */
    test('ルートレベルの項目では「上の階層へ」を実行できない (estimate-creation/REQ-44.6, estimate-creation/REQ-23.9)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
      await resetItemTree(page);

      const before = await fetchTree(page);
      const rootItemId = before[0]!.id;

      await openEstimatePage(page);
      await selectRow(page, rootItemId);

      await expect(page.getByRole('button', { name: /上の階層へ/ })).toBeDisabled();
    });
  });

  // ============================================================================
  // 階層移動のローカル完結（REQ-12.7, 43.1, 43.2）
  // ============================================================================

  test.describe('階層移動のローカル完結', () => {
    /**
     * @requirement estimate-creation/REQ-12.7
     * @requirement estimate-creation/REQ-43.1
     * @requirement estimate-creation/REQ-43.2
     */
    test('階層の上げ下げを連続して行ってもサーバーへの書き込みが発生しない (estimate-creation/REQ-12.7, estimate-creation/REQ-43.1, estimate-creation/REQ-43.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
      await resetItemTree(page);

      const before = await fetchTree(page);
      const targetId = findEstimateItemByName(before, '階層移動テスト項目2')!.id;

      await openEstimatePage(page);

      // 画面表示後の書き込みリクエストのみを数える
      const writeRequests: string[] = [];
      page.on('request', (request) => {
        const method = request.method();
        if (
          request.url().includes('/api/estimates') &&
          (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')
        ) {
          writeRequests.push(`${method} ${request.url()}`);
        }
      });

      await selectRow(page, targetId);

      // 「下の階層へ」→「上の階層へ」を3往復
      for (let i = 0; i < 3; i++) {
        const moveDownButton = page.getByRole('button', { name: /下の階層へ/ });
        await expect(moveDownButton).toBeEnabled();
        await moveDownButton.click();

        const moveUpButton = page.getByRole('button', { name: /上の階層へ/ });
        await expect(moveUpButton).toBeEnabled();
        await moveUpButton.click();
      }

      // 未保存の変更として保持され、サーバーへの書き込みは1件も起きない（REQ-43.1, 43.2）
      expect(writeRequests).toEqual([]);
      await expect(page.getByRole('button', { name: /^保存$/i })).toBeEnabled();

      // DBの構造も変わっていない
      const after = await fetchTree(page);
      expect(after.map((item) => item.id)).toEqual(before.map((item) => item.id));
      expect(after.every((item) => item.children.length === 0)).toBe(true);
    });
  });
});
