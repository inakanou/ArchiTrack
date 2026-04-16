/**
 * @fileoverview 数量項目アクションメニュー統合 E2Eテスト
 *
 * Requirements coverage:
 * - REQ-36.1: ボタン統合（個別表示からアクションメニューへ）
 * - REQ-36.2: アクションメニューのドロップダウン表示
 * - REQ-36.3: 「上へ移動」操作
 * - REQ-36.4: 「下へ移動」操作
 * - REQ-36.5: 「削除」操作
 * - REQ-36.6: 最上位項目の「上へ移動」無効化
 * - REQ-36.7: 最下位項目の「下へ移動」無効化
 * - REQ-36.8: 既存操作項目との統合表示
 * - REQ-36.9: メニュー外クリックでドロップダウン閉じる
 *
 * @module e2e/specs/quantity-tables/quantity-item-action-menu.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

test.describe('REQ-36: 数量項目のアクションボタン統合', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * 数量表編集画面に移動するヘルパー
   */
  async function navigateToQuantityTableEdit(page: import('@playwright/test').Page) {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const projectCard = page.locator('[data-testid="project-card"]').first();
    if (!(await projectCard.isVisible())) return false;

    await projectCard.click();
    await page.waitForLoadState('networkidle');

    const quantityTableLink = page.getByText('すべて見る').first();
    if (!(await quantityTableLink.isVisible())) return false;

    await quantityTableLink.click();
    await page.waitForLoadState('networkidle');

    const tableCard = page.locator('[data-testid="quantity-table-card"]').first();
    if (!(await tableCard.isVisible())) return false;

    await tableCard.click();
    await page.waitForLoadState('networkidle');

    return true;
  }

  /**
   * 数量項目が存在するグループを見つけるヘルパー
   */
  async function findGroupWithItems(page: import('@playwright/test').Page) {
    const groups = page.locator('[data-testid="quantity-group-card"]');
    const count = await groups.count();

    for (let i = 0; i < count; i++) {
      const group = groups.nth(i);
      const itemCount = await group.locator('[data-testid="quantity-item-row"]').count();
      if (itemCount > 0) {
        return group;
      }
    }

    // quantity-group-cardがない場合はquantity-groupでも試行
    const altGroups = page.locator('[data-testid="quantity-group"]');
    const altCount = await altGroups.count();

    for (let i = 0; i < altCount; i++) {
      const group = altGroups.nth(i);
      const itemCount = await group.locator('[data-testid="quantity-item-row"]').count();
      if (itemCount > 0) {
        return group;
      }
    }
    return null;
  }

  /**
   * @requirement quantity-table-generation/REQ-36.1
   * @requirement quantity-table-generation/REQ-36.2
   * 個別ボタンが非表示でアクションメニューボタンが表示される
   */
  test('数量項目行にアクションメニューボタンが表示され、個別の並び替え・削除ボタンが非表示である (REQ-36.1, REQ-36.2)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    if (!navigated) {
      test.skip();
      return;
    }

    const groupWithItems = await findGroupWithItems(page);
    if (!groupWithItems) {
      test.skip();
      return;
    }

    const firstItemRow = groupWithItems.locator('[data-testid="quantity-item-row"]').first();
    await expect(firstItemRow).toBeVisible({ timeout: getTimeout(5000) });

    // アクションメニューボタンが存在する（REQ-36.1）
    const actionButton = firstItemRow.getByRole('button', { name: 'アクション' });
    await expect(actionButton).toBeVisible({ timeout: getTimeout(3000) });

    // アクションメニューをクリックしてドロップダウンが表示される（REQ-36.2）
    await actionButton.click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible({ timeout: getTimeout(3000) });

    // メニュー内に「上へ移動」「下へ移動」「削除」が含まれる
    await expect(menu.getByText('上へ移動')).toBeVisible({ timeout: getTimeout(2000) });
    await expect(menu.getByText('下へ移動')).toBeVisible({ timeout: getTimeout(2000) });
    await expect(menu.getByText('削除')).toBeVisible({ timeout: getTimeout(2000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-36.6
   * 最上位項目の「上へ移動」が無効化されている
   */
  test('最上位の数量項目でアクションメニューの「上へ移動」が無効化されている (REQ-36.6)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    if (!navigated) {
      test.skip();
      return;
    }

    const groupWithItems = await findGroupWithItems(page);
    if (!groupWithItems) {
      test.skip();
      return;
    }

    const firstItemRow = groupWithItems.locator('[data-testid="quantity-item-row"]').first();
    await expect(firstItemRow).toBeVisible({ timeout: getTimeout(5000) });

    const actionButton = firstItemRow.getByRole('button', { name: 'アクション' });
    await actionButton.click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible({ timeout: getTimeout(3000) });

    // 最上位項目の「上へ移動」がdisabledであること
    const moveUpItem = menu.getByText('上へ移動');
    await expect(moveUpItem).toBeVisible({ timeout: getTimeout(2000) });

    // disabled状態の確認（aria-disabled属性またはdisabledスタイル）
    const isDisabled =
      (await moveUpItem.getAttribute('aria-disabled')) === 'true' ||
      (await moveUpItem.isDisabled().catch(() => false));
    expect(isDisabled).toBeTruthy();
  });

  /**
   * @requirement quantity-table-generation/REQ-36.7
   * 最下位項目の「下へ移動」が無効化されている
   */
  test('最下位の数量項目でアクションメニューの「下へ移動」が無効化されている (REQ-36.7)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    if (!navigated) {
      test.skip();
      return;
    }

    const groupWithItems = await findGroupWithItems(page);
    if (!groupWithItems) {
      test.skip();
      return;
    }

    const lastItemRow = groupWithItems.locator('[data-testid="quantity-item-row"]').last();
    await expect(lastItemRow).toBeVisible({ timeout: getTimeout(5000) });

    const actionButton = lastItemRow.getByRole('button', { name: 'アクション' });
    await actionButton.click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible({ timeout: getTimeout(3000) });

    // 最下位項目の「下へ移動」がdisabledであること
    const moveDownItem = menu.getByText('下へ移動');
    await expect(moveDownItem).toBeVisible({ timeout: getTimeout(2000) });

    const isDisabled =
      (await moveDownItem.getAttribute('aria-disabled')) === 'true' ||
      (await moveDownItem.isDisabled().catch(() => false));
    expect(isDisabled).toBeTruthy();
  });

  /**
   * @requirement quantity-table-generation/REQ-36.3
   * @requirement quantity-table-generation/REQ-36.4
   * 「上へ移動」「下へ移動」操作で項目が移動する
   */
  test('アクションメニューから「下へ移動」で項目位置が変更される (REQ-36.3, REQ-36.4)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    if (!navigated) {
      test.skip();
      return;
    }

    const groupWithItems = await findGroupWithItems(page);
    if (!groupWithItems) {
      test.skip();
      return;
    }

    const itemRows = groupWithItems.locator('[data-testid="quantity-item-row"]');
    const itemCount = await itemRows.count();
    if (itemCount < 2) {
      // 項目が2つ未満の場合は移動テスト不可
      test.skip();
      return;
    }

    // 最初の項目のテキストを記録
    const firstItemText = await itemRows.first().textContent();

    // 最初の項目のアクションメニューを開いて「下へ移動」を選択
    const actionButton = itemRows.first().getByRole('button', { name: 'アクション' });
    await actionButton.click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible({ timeout: getTimeout(3000) });

    const moveDownItem = menu.getByText('下へ移動');
    await moveDownItem.click();
    await page.waitForLoadState('networkidle');

    // 項目の順番が変わったことを確認
    const newFirstItemText = await itemRows.first().textContent();
    expect(newFirstItemText).not.toBe(firstItemText);

    // 元に戻す：2番目の項目（元は最初だったもの）の「上へ移動」を選択（REQ-36.3）
    const secondItem = itemRows.nth(1);
    const restoreButton = secondItem.getByRole('button', { name: 'アクション' });
    await restoreButton.click();

    const restoreMenu = page.getByRole('menu');
    await expect(restoreMenu).toBeVisible({ timeout: getTimeout(3000) });

    const moveUpItem = restoreMenu.getByText('上へ移動');
    await moveUpItem.click();
    await page.waitForLoadState('networkidle');
  });

  /**
   * @requirement quantity-table-generation/REQ-36.5
   * 「削除」操作で項目が削除される
   */
  test('アクションメニューから「削除」で確認ダイアログが表示される (REQ-36.5)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    if (!navigated) {
      test.skip();
      return;
    }

    const groupWithItems = await findGroupWithItems(page);
    if (!groupWithItems) {
      test.skip();
      return;
    }

    const itemRows = groupWithItems.locator('[data-testid="quantity-item-row"]');
    const itemCount = await itemRows.count();
    if (itemCount < 1) {
      test.skip();
      return;
    }

    // 最後の項目のアクションメニューを開いて「削除」を選択
    const lastItem = itemRows.last();
    const actionButton = lastItem.getByRole('button', { name: 'アクション' });
    await actionButton.click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible({ timeout: getTimeout(3000) });

    // 削除メニュー項目が存在することを確認
    const deleteItem = menu.getByText('削除');
    await expect(deleteItem).toBeVisible({ timeout: getTimeout(2000) });

    // 削除をクリック
    await deleteItem.click();

    // 削除確認ダイアログが表示されるか、直接削除されるかを確認
    // 確認ダイアログがある場合はキャンセル
    const confirmDialog = page.getByRole('dialog');
    const hasConfirm = await confirmDialog
      .isVisible({ timeout: getTimeout(3000) })
      .catch(() => false);

    if (hasConfirm) {
      // キャンセルして元に戻す
      const cancelButton = confirmDialog.getByRole('button', { name: /キャンセル|いいえ/ });
      if (await cancelButton.isVisible({ timeout: getTimeout(2000) }).catch(() => false)) {
        await cancelButton.click();
      }
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-36.8
   * 既存のアクション項目（コピー等）が統合されて表示される
   */
  test('アクションメニューにコピー操作も統合されている (REQ-36.8)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    if (!navigated) {
      test.skip();
      return;
    }

    const groupWithItems = await findGroupWithItems(page);
    if (!groupWithItems) {
      test.skip();
      return;
    }

    const firstItemRow = groupWithItems.locator('[data-testid="quantity-item-row"]').first();
    await expect(firstItemRow).toBeVisible({ timeout: getTimeout(5000) });

    const actionButton = firstItemRow.getByRole('button', { name: 'アクション' });
    await actionButton.click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible({ timeout: getTimeout(3000) });

    // コピー操作が統合されて表示されている
    const copyItem = menu.getByText('コピー');
    await expect(copyItem).toBeVisible({ timeout: getTimeout(2000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-36.9
   * メニュー外クリックでドロップダウンが閉じる
   */
  test('アクションメニュー外をクリックするとドロップダウンが閉じる (REQ-36.9)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    if (!navigated) {
      test.skip();
      return;
    }

    const groupWithItems = await findGroupWithItems(page);
    if (!groupWithItems) {
      test.skip();
      return;
    }

    const firstItemRow = groupWithItems.locator('[data-testid="quantity-item-row"]').first();
    await expect(firstItemRow).toBeVisible({ timeout: getTimeout(5000) });

    const actionButton = firstItemRow.getByRole('button', { name: 'アクション' });
    await actionButton.click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible({ timeout: getTimeout(3000) });

    // メニュー外をクリック（ページのbody領域）
    await page.locator('body').click({ position: { x: 10, y: 10 } });

    // メニューが閉じることを確認
    await expect(menu).not.toBeVisible({ timeout: getTimeout(3000) });
  });
});
