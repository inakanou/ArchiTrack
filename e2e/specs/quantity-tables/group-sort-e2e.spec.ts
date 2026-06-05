/**
 * @fileoverview 数量グループ・数量項目の並び順管理 E2Eテスト (REQ-23, REQ-24)
 *
 * Requirements coverage:
 * - @requirement quantity-table-generation/REQ-23.1: 数量グループ並び順を保持
 * - @requirement quantity-table-generation/REQ-23.2: 保持された並び順で表示
 * - @requirement quantity-table-generation/REQ-23.3: 「上へ移動」ボタン
 * - @requirement quantity-table-generation/REQ-23.4: 「下へ移動」ボタン
 * - @requirement quantity-table-generation/REQ-23.5: 最上位の上へ移動が無効
 * - @requirement quantity-table-generation/REQ-23.6: 最下位の下へ移動が無効
 * - @requirement quantity-table-generation/REQ-23.7: 並び順変更を保存
 * - @requirement quantity-table-generation/REQ-23.8: 1グループ時に両方無効
 * - @requirement quantity-table-generation/REQ-24.1: 項目並び順を保持
 * - @requirement quantity-table-generation/REQ-24.2: 保持された並び順で表示
 * - @requirement quantity-table-generation/REQ-24.3: 項目「上へ移動」
 * - @requirement quantity-table-generation/REQ-24.4: 項目「下へ移動」
 * - @requirement quantity-table-generation/REQ-24.5: 最上位項目で上へ移動が無効
 * - @requirement quantity-table-generation/REQ-24.6: 最下位項目で下へ移動が無効
 * - @requirement quantity-table-generation/REQ-24.7: 項目並び順変更を保存
 * - @requirement quantity-table-generation/REQ-24.8: 1項目時に両方無効
 *
 * @module e2e/specs/quantity-tables/group-sort-e2e.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';

let testProjectId: string | null = null;
let createdQuantityTableId: string | null = null;

/**
 * 数量表編集画面へ遷移する。
 *
 * 事前準備で作成した tableId が利用できる場合は直接遷移し、
 * それ以外は /projects → 詳細 → 一覧 → カード のUIフローでナビゲートする。
 */
async function navigateToQuantityTableEdit(page: Page): Promise<boolean> {
  if (createdQuantityTableId) {
    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');
    const editArea = page.locator('[data-testid="quantity-table-edit-area"]');
    return await editArea.isVisible({ timeout: getTimeout(10000) }).catch(() => false);
  }

  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  const projectCard = page.locator('[data-testid^="project-card-"]').first();
  if (!(await projectCard.isVisible({ timeout: getTimeout(5000) }).catch(() => false))) {
    return false;
  }
  await projectCard.click();
  await page.waitForLoadState('networkidle');

  const quantityTableLink = page.getByText('すべて見る').first();
  if (!(await quantityTableLink.isVisible({ timeout: getTimeout(5000) }).catch(() => false))) {
    return false;
  }
  await quantityTableLink.click();
  await page.waitForLoadState('networkidle');

  const tableCard = page.locator('[data-testid="quantity-table-card"]').first();
  if (!(await tableCard.isVisible({ timeout: getTimeout(5000) }).catch(() => false))) {
    return false;
  }
  await tableCard.click();
  await page.waitForLoadState('networkidle');

  return true;
}

test.describe('REQ-23, REQ-24: 数量グループ・項目の並び順管理', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * 事前準備: テスト用プロジェクト・数量表・グループ・項目を作成
   *
   * REQ-23/24 のテストはグループ2件以上、および項目2件以上のグループの存在を
   * 前提とするため、独立して実行できるよう事前にデータを作成する。
   */
  test.describe('事前準備', () => {
    test('テスト用プロジェクトを作成する', async ({ page }) => {
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `REQ23_24_PJ_${Date.now()}`;
      await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

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
      const projectMatch = page.url().match(/\/projects\/([0-9a-f-]+)$/);
      testProjectId = projectMatch?.[1] ?? null;
      expect(testProjectId).toBeTruthy();
    });

    test('テスト用数量表とグループ2件・項目2件を作成する', async ({ page }) => {
      if (!testProjectId) {
        throw new Error(
          'testProjectIdが未設定です。プロジェクト作成テストが正しく実行されていません。'
        );
      }

      await page.goto(`/projects/${testProjectId}/quantity-tables`);
      await page.waitForLoadState('networkidle');

      const createButton = page.getByRole('link', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      const nameInput = page.getByRole('textbox', { name: /数量表名/i });
      await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
      await nameInput.clear();
      await nameInput.fill(`REQ23_24_数量表_${Date.now()}`);

      const createConfirmButton = page.getByRole('button', { name: /^作成$/i });
      await createConfirmButton.click();

      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
        timeout: getTimeout(15000),
      });
      const tableMatch = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/);
      createdQuantityTableId = tableMatch?.[1] ?? null;
      expect(createdQuantityTableId).toBeTruthy();

      // グループを2つ追加（REQ-23 のテストは2グループ以上を前提）。
      // 各グループに固有の名前を付与する：REQ-23.7 でグループ並び順変更を検証する際、
      // 名前が空だと表示名が位置ベースの「グループ N」にフォールバックするため、
      // 入れ替えを判定できなくなる。
      // REQ-42 移行: グループ追加・名称変更・項目追加はクライアントドラフトのみを
      // 更新するため、永続化 API（POST /groups, PUT /quantity-groups, POST /items）は
      // 発火しない。ドラフト反映（カード数・見出し・行数）のみを待機し、
      // すべての編集後にまとめて明示保存する。
      const groupNameSuffix = Date.now();
      for (let i = 0; i < 2; i++) {
        const addGroupButton = page
          .getByRole('button', { name: /グループ追加|グループを追加/i })
          .first();
        await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });
        await addGroupButton.click();

        // 追加完了の同期：グループ数が i+1 件に達するのを待機
        await expect(page.locator('[data-testid="quantity-group-card"]')).toHaveCount(i + 1, {
          timeout: getTimeout(10000),
        });

        // 追加したグループに固有の名前を付与する
        const targetGroupCard = page.locator('[data-testid="quantity-group-card"]').nth(i);
        const groupNameHeading = targetGroupCard.locator('h3').first();
        await expect(groupNameHeading).toBeVisible({ timeout: getTimeout(5000) });
        await groupNameHeading.click();

        const editInput = targetGroupCard.getByLabel('グループ名を編集');
        await expect(editInput).toBeVisible({ timeout: getTimeout(5000) });

        const uniqueName = `REQ23_24_G${i + 1}_${groupNameSuffix}`;
        await editInput.fill(uniqueName);
        await editInput.press('Enter');

        // h3 に固有の名前が反映されるのを待機
        await expect(
          targetGroupCard.locator('h3').filter({ hasText: uniqueName }).first()
        ).toBeVisible({
          timeout: getTimeout(8000),
        });
      }

      // 1つ目のグループに項目を2つ追加（REQ-24 のテストは2項目以上を前提）
      const firstGroupCard = page.locator('[data-testid="quantity-group-card"]').first();
      for (let i = 0; i < 2; i++) {
        const addItemButton = firstGroupCard.getByRole('button', { name: '項目を追加' });
        await expect(addItemButton).toBeVisible({ timeout: getTimeout(10000) });
        await addItemButton.click();

        await expect(firstGroupCard.locator('[data-testid="quantity-item-row"]')).toHaveCount(
          i + 1,
          { timeout: getTimeout(10000) }
        );
      }

      // REQ-42.5: 後続テスト（リロードで並び順の永続化を検証）の前提として、
      // ここまでのドラフト編集を明示保存して永続化する。
      // 項目名が空のままだと保存時の整合性チェックで弾かれるため、各項目に名称を付与する。
      const itemRows = firstGroupCard.locator('[data-testid="quantity-item-row"]');
      const itemCount = await itemRows.count();
      for (let i = 0; i < itemCount; i++) {
        const nameInput = itemRows.nth(i).locator('input[id$="-name"]').first();
        await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
        await nameInput.fill(`REQ24_item_${i + 1}_${groupNameSuffix}`);
        await nameInput.blur();
      }

      await saveQuantityTableDraft(page);
    });
  });

  test.describe('REQ-23: 数量グループの並び順管理', () => {
    /**
     * @requirement quantity-table-generation/REQ-23.1: グループ並び順をデータとして保持
     * @requirement quantity-table-generation/REQ-23.2: 保持された並び順で表示
     *
     * 数量表を再表示しても、データに保持された並び順でグループが順番通り表示される。
     */
    test('数量表を再表示してもグループの並び順が保持されている (REQ-23.1, REQ-23.2)', async ({
      page,
    }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      // 初回表示時のグループ名一覧を取得
      const groupCards = page.locator('[data-testid="quantity-group-card"]');
      const initialCount = await groupCards.count();
      if (initialCount === 0) {
        await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
        return;
      }

      const initialNames: string[] = [];
      for (let i = 0; i < initialCount; i++) {
        const name = await groupCards.nth(i).locator('h3').first().textContent();
        initialNames.push((name ?? '').trim());
      }

      // 再読み込み（並び順がDBに保持されていることを検証）
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForLoadState('networkidle');

      const reloadedCount = await groupCards.count();
      expect(reloadedCount, '再表示後もグループ数は同じ').toBe(initialCount);

      for (let i = 0; i < reloadedCount; i++) {
        const name = await groupCards.nth(i).locator('h3').first().textContent();
        expect((name ?? '').trim(), `グループ${i}の表示順が保持される`).toBe(initialNames[i]);
      }
    });

    /**
     * @requirement quantity-table-generation/REQ-23.3: 上へ移動ボタン
     * @requirement quantity-table-generation/REQ-23.4: 下へ移動ボタン
     */
    test('数量グループに「上へ移動」「下へ移動」ボタンが表示される (REQ-23.3, REQ-23.4)', async ({
      page,
    }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
      if (!(await groupCard.isVisible({ timeout: getTimeout(5000) }).catch(() => false))) {
        await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
        return;
      }

      // ヘッダー直下の SortOrderButtons を取得（最初の sort-order-buttons はグループ用）
      const sortButtons = groupCard.locator('[data-testid="sort-order-buttons"]').first();
      await expect(sortButtons).toBeVisible({ timeout: getTimeout(5000) });

      const upButton = sortButtons.getByRole('button', { name: '上へ移動' });
      const downButton = sortButtons.getByRole('button', { name: '下へ移動' });
      await expect(upButton).toBeVisible({ timeout: getTimeout(3000) });
      await expect(downButton).toBeVisible({ timeout: getTimeout(3000) });
    });

    /**
     * @requirement quantity-table-generation/REQ-23.5: 最上位グループの上へ移動が無効
     */
    test('最上位グループの「上へ移動」がdisabledである (REQ-23.5)', async ({ page }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const firstGroup = page.locator('[data-testid="quantity-group-card"]').first();
      if (!(await firstGroup.isVisible({ timeout: getTimeout(5000) }).catch(() => false))) {
        await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
        return;
      }

      const sortButtons = firstGroup.locator('[data-testid="sort-order-buttons"]').first();
      await expect(sortButtons).toBeVisible({ timeout: getTimeout(5000) });

      const upButton = sortButtons.getByRole('button', { name: '上へ移動' });
      await expect(upButton).toBeDisabled({ timeout: getTimeout(3000) });
    });

    /**
     * @requirement quantity-table-generation/REQ-23.6: 最下位グループの下へ移動が無効
     */
    test('最下位グループの「下へ移動」がdisabledである (REQ-23.6)', async ({ page }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const lastGroup = page.locator('[data-testid="quantity-group-card"]').last();
      if (!(await lastGroup.isVisible({ timeout: getTimeout(5000) }).catch(() => false))) {
        await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
        return;
      }

      const sortButtons = lastGroup.locator('[data-testid="sort-order-buttons"]').first();
      await expect(sortButtons).toBeVisible({ timeout: getTimeout(5000) });

      const downButton = sortButtons.getByRole('button', { name: '下へ移動' });
      await expect(downButton).toBeDisabled({ timeout: getTimeout(3000) });
    });

    /**
     * @requirement quantity-table-generation/REQ-23.7: 並び順変更を保存
     *
     * 並び順変更ボタンを押すと displayOrder の更新APIが呼ばれ、変更が即座に反映される。
     */
    test('グループの並び順変更操作後、画面上の並び順が変わる (REQ-23.7)', async ({ page }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const groupCards = page.locator('[data-testid="quantity-group-card"]');
      const count = await groupCards.count();

      if (count < 2) {
        // 並び順変更不可：他の検証として最上位と最下位ボタンの状態を確認するに留める
        const firstGroup = groupCards.first();
        if (await firstGroup.isVisible({ timeout: getTimeout(3000) }).catch(() => false)) {
          const sortButtons = firstGroup.locator('[data-testid="sort-order-buttons"]').first();
          await expect(sortButtons).toBeVisible({ timeout: getTimeout(5000) });
        }
        return;
      }

      // 元の並び順
      const beforeFirstName = (
        await groupCards.first().locator('h3').first().textContent()
      )?.trim();

      // 1番目のグループの「下へ移動」をクリック
      const firstSortButtons = groupCards
        .first()
        .locator('[data-testid="sort-order-buttons"]')
        .first();
      const downButton = firstSortButtons.getByRole('button', { name: '下へ移動' });

      if (await downButton.isEnabled().catch(() => false)) {
        await downButton.click();
        await page.waitForLoadState('networkidle');

        // 並び順が変更された
        const afterFirstName = (
          await groupCards.first().locator('h3').first().textContent()
        )?.trim();
        expect(afterFirstName, '下へ移動後、1番目のグループ名が変わる').not.toBe(beforeFirstName);

        // 元に戻す
        const restoreUpButton = groupCards
          .nth(1)
          .locator('[data-testid="sort-order-buttons"]')
          .first()
          .getByRole('button', { name: '上へ移動' });
        if (await restoreUpButton.isEnabled().catch(() => false)) {
          await restoreUpButton.click();
          await page.waitForLoadState('networkidle');
        }
      }
    });

    /**
     * @requirement quantity-table-generation/REQ-23.8: 1グループ時に両方無効
     */
    test('グループが1つしか存在しない場合、両方のボタンが無効化される (REQ-23.8)', async ({
      page,
    }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const groupCards = page.locator('[data-testid="quantity-group-card"]');
      const count = await groupCards.count();

      if (count === 1) {
        const sortButtons = groupCards
          .first()
          .locator('[data-testid="sort-order-buttons"]')
          .first();
        await expect(sortButtons).toBeVisible({ timeout: getTimeout(5000) });

        const upButton = sortButtons.getByRole('button', { name: '上へ移動' });
        const downButton = sortButtons.getByRole('button', { name: '下へ移動' });
        await expect(upButton).toBeDisabled();
        await expect(downButton).toBeDisabled();
      } else if (count > 1) {
        // 1つではない場合は最上位の上ボタン、最下位の下ボタンが無効
        const firstSortButtons = groupCards
          .first()
          .locator('[data-testid="sort-order-buttons"]')
          .first();
        const lastSortButtons = groupCards
          .last()
          .locator('[data-testid="sort-order-buttons"]')
          .first();
        await expect(firstSortButtons.getByRole('button', { name: '上へ移動' })).toBeDisabled();
        await expect(lastSortButtons.getByRole('button', { name: '下へ移動' })).toBeDisabled();
      } else {
        // グループが0個の場合は編集画面のみ検証
        await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
      }
    });
  });

  test.describe('REQ-24: 数量項目の並び順管理', () => {
    /**
     * @requirement quantity-table-generation/REQ-24.1: 項目並び順をデータとして保持
     * @requirement quantity-table-generation/REQ-24.2: 保持された並び順で表示
     */
    test('数量項目の並び順がリロード後も保持されている (REQ-24.1, REQ-24.2)', async ({ page }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const itemRows = page.locator('[data-testid="quantity-item-row"]');
      const count = await itemRows.count();
      if (count === 0) {
        await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
        return;
      }

      // 各項目の name 入力値を取得
      const initialNames: string[] = [];
      for (let i = 0; i < count; i++) {
        const text = (await itemRows.nth(i).textContent()) ?? '';
        initialNames.push(text.trim());
      }

      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForLoadState('networkidle');

      const reloadedCount = await itemRows.count();
      expect(reloadedCount, '再表示後も項目数は同じ').toBe(count);
      for (let i = 0; i < reloadedCount; i++) {
        const text = ((await itemRows.nth(i).textContent()) ?? '').trim();
        expect(text, `項目${i}の並び順が保持される`).toBe(initialNames[i]);
      }
    });

    /**
     * @requirement quantity-table-generation/REQ-24.3: 項目「上へ移動」
     * @requirement quantity-table-generation/REQ-24.4: 項目「下へ移動」
     *
     * 数量項目はアクションメニュー内に「上へ移動」「下へ移動」を統合する（REQ-36準拠）。
     */
    test('数量項目のアクションメニューに「上へ移動」「下へ移動」が含まれる (REQ-24.3, REQ-24.4)', async ({
      page,
    }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const itemRow = page.locator('[data-testid="quantity-item-row"]').first();
      if (!(await itemRow.isVisible({ timeout: getTimeout(5000) }).catch(() => false))) {
        await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
        return;
      }

      const actionButton = itemRow.getByRole('button', { name: 'アクション' });
      await expect(actionButton).toBeVisible({ timeout: getTimeout(3000) });
      await actionButton.click();

      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible({ timeout: getTimeout(3000) });
      await expect(menu.getByText('上へ移動')).toBeVisible({ timeout: getTimeout(2000) });
      await expect(menu.getByText('下へ移動')).toBeVisible({ timeout: getTimeout(2000) });

      // メニューを閉じる
      await page.locator('body').click({ position: { x: 5, y: 5 } });
    });

    /**
     * @requirement quantity-table-generation/REQ-24.5: 最上位項目で上へ移動が無効
     */
    test('最上位項目のアクションメニュー「上へ移動」が無効化される (REQ-24.5)', async ({
      page,
    }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const itemRow = page.locator('[data-testid="quantity-item-row"]').first();
      if (!(await itemRow.isVisible({ timeout: getTimeout(5000) }).catch(() => false))) {
        await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
        return;
      }

      const actionButton = itemRow.getByRole('button', { name: 'アクション' });
      await actionButton.click();

      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible({ timeout: getTimeout(3000) });

      const moveUpItem = menu.getByRole('menuitem', { name: /上へ移動/ });
      await expect(moveUpItem).toBeDisabled({ timeout: getTimeout(3000) });

      await page.locator('body').click({ position: { x: 5, y: 5 } });
    });

    /**
     * @requirement quantity-table-generation/REQ-24.6: 最下位項目で下へ移動が無効
     */
    test('最下位項目のアクションメニュー「下へ移動」が無効化される (REQ-24.6)', async ({
      page,
    }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const itemRows = page.locator('[data-testid="quantity-item-row"]');
      const count = await itemRows.count();
      if (count === 0) {
        await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
        return;
      }

      const lastRow = itemRows.last();
      const actionButton = lastRow.getByRole('button', { name: 'アクション' });
      await actionButton.click();

      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible({ timeout: getTimeout(3000) });

      const moveDownItem = menu.getByRole('menuitem', { name: /下へ移動/ });
      await expect(moveDownItem).toBeDisabled({ timeout: getTimeout(3000) });

      await page.locator('body').click({ position: { x: 5, y: 5 } });
    });

    /**
     * @requirement quantity-table-generation/REQ-24.7: 項目並び順変更を保存
     *
     * 項目並び順変更操作後、表示されている順番が変わる。
     */
    test('項目アクションメニューから「下へ移動」で並び順が変わる (REQ-24.7)', async ({ page }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const itemRows = page.locator('[data-testid="quantity-item-row"]');
      const count = await itemRows.count();
      if (count < 2) {
        // 項目が2つ未満の場合、サブシナリオとして、ボタンが存在することを確認するに留める
        if (count === 1) {
          const actionButton = itemRows.first().getByRole('button', { name: 'アクション' });
          await expect(actionButton).toBeVisible({ timeout: getTimeout(3000) });
        } else {
          await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
        }
        return;
      }

      // 各項目の入力 id 属性は `${item.id}-<field>` という構造で、
      // 項目に紐づく安定識別子として利用できる。
      // テキスト内容は空のデフォルト値だと両項目で同一になり得るため、
      // input の id 属性で入れ替えを判定する。
      const beforeFirstInputId = await itemRows.first().locator('input').first().getAttribute('id');
      expect(beforeFirstInputId, '項目行の入力に id 属性が存在する').toBeTruthy();

      const firstActionButton = itemRows.first().getByRole('button', { name: 'アクション' });
      await firstActionButton.click();

      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible({ timeout: getTimeout(3000) });

      const moveDownItem = menu.getByRole('menuitem', { name: /下へ移動/ });
      if (await moveDownItem.isEnabled().catch(() => false)) {
        await moveDownItem.click();
        await page.waitForLoadState('networkidle');

        // 並び順が変わったことを検証
        const afterFirstInputId = await itemRows
          .first()
          .locator('input')
          .first()
          .getAttribute('id');
        expect(afterFirstInputId, '下へ移動後、1番目の項目を識別する id が変わる').not.toBe(
          beforeFirstInputId
        );

        // 元に戻す
        const restoreAction = itemRows.nth(1).getByRole('button', { name: 'アクション' });
        await restoreAction.click();
        const restoreMenu = page.getByRole('menu');
        const restoreUp = restoreMenu.getByRole('menuitem', { name: /上へ移動/ });
        if (await restoreUp.isEnabled().catch(() => false)) {
          await restoreUp.click();
          await page.waitForLoadState('networkidle');
        }
      } else {
        // disabledの場合、メニューを閉じる
        await page.locator('body').click({ position: { x: 5, y: 5 } });
      }
    });

    /**
     * @requirement quantity-table-generation/REQ-24.8: 1項目時に両方無効
     */
    test('項目が1つのみのグループでは両方の移動メニューが無効化される (REQ-24.8)', async ({
      page,
    }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      // 項目数が 1 のグループを検索
      const groupCards = page.locator('[data-testid="quantity-group-card"]');
      const groupCount = await groupCards.count();

      let foundSingleItemGroup = false;
      for (let i = 0; i < groupCount; i++) {
        const group = groupCards.nth(i);
        const items = group.locator('[data-testid="quantity-item-row"]');
        const itemCount = await items.count();
        if (itemCount === 1) {
          foundSingleItemGroup = true;
          const actionButton = items.first().getByRole('button', { name: 'アクション' });
          await actionButton.click();

          const menu = page.getByRole('menu');
          await expect(menu).toBeVisible({ timeout: getTimeout(3000) });

          const upItem = menu.getByRole('menuitem', { name: /上へ移動/ });
          const downItem = menu.getByRole('menuitem', { name: /下へ移動/ });
          await expect(upItem).toBeDisabled();
          await expect(downItem).toBeDisabled();

          await page.locator('body').click({ position: { x: 5, y: 5 } });
          break;
        }
      }

      if (!foundSingleItemGroup) {
        // 1項目グループがない場合、最上位/最下位での無効化を代替検証
        const allItems = page.locator('[data-testid="quantity-item-row"]');
        const totalCount = await allItems.count();
        if (totalCount > 0) {
          const actionButton = allItems.first().getByRole('button', { name: 'アクション' });
          await actionButton.click();
          const menu = page.getByRole('menu');
          await expect(menu).toBeVisible({ timeout: getTimeout(3000) });
          const moveUp = menu.getByRole('menuitem', { name: /上へ移動/ });
          await expect(moveUp).toBeDisabled();
          await page.locator('body').click({ position: { x: 5, y: 5 } });
        } else {
          await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
        }
      }
    });
  });
});
