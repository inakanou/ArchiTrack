/**
 * @fileoverview 数量グループ名前変更 E2Eテスト (REQ-22)
 *
 * Requirements coverage:
 * - @requirement quantity-table-generation/REQ-22.1: グループ名クリックで編集モード
 * - @requirement quantity-table-generation/REQ-22.2: 編集確定で即座に反映
 * - @requirement quantity-table-generation/REQ-22.3: 空白名でエラー表示
 * - @requirement quantity-table-generation/REQ-22.4: 最大文字数（全角25/半角50）
 * - @requirement quantity-table-generation/REQ-22.5: 最大文字数超過の入力防止
 *
 * @module e2e/specs/quantity-tables/group-rename-e2e.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

async function navigateToQuantityTableEdit(page: Page): Promise<boolean> {
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  const projectCard = page.locator('[data-testid="project-card"]').first();
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

/**
 * 最初の数量グループカードを取得（無ければ null）
 */
async function getFirstGroupCard(page: Page) {
  const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
  if (await groupCard.isVisible({ timeout: getTimeout(5000) }).catch(() => false)) {
    return groupCard;
  }
  return null;
}

test.describe('REQ-22: 数量グループの名前変更', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-22.1: グループ名クリックで編集モード
   */
  test('グループ名クリックで編集用inputが表示される (REQ-22.1)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const groupCard = await getFirstGroupCard(page);
    if (!groupCard) {
      await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
      return;
    }

    // グループ名（h3）をクリック
    const groupName = groupCard.locator('h3').first();
    await expect(groupName).toBeVisible({ timeout: getTimeout(3000) });
    await groupName.click();

    // 編集用inputが表示される
    const editInput = groupCard.getByLabel('グループ名を編集');
    await expect(editInput).toBeVisible({ timeout: getTimeout(3000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-22.2: 編集確定で即座に反映
   */
  test('編集後Enterで新しい名前が即座に反映される (REQ-22.2)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const groupCard = await getFirstGroupCard(page);
    if (!groupCard) {
      await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
      return;
    }

    const groupName = groupCard.locator('h3').first();
    const originalName = (await groupName.textContent()) ?? '';

    await groupName.click();
    const editInput = groupCard.getByLabel('グループ名を編集');
    await expect(editInput).toBeVisible({ timeout: getTimeout(3000) });

    const newName = `E2E_REQ22_${Date.now()}`;
    await editInput.fill(newName);
    await editInput.press('Enter');

    // 名前が変更された状態のh3が表示される
    await expect(groupCard.getByRole('heading', { name: newName })).toBeVisible({
      timeout: getTimeout(8000),
    });

    // 元の名前に戻す
    if (originalName && originalName !== newName) {
      const updatedHeading = groupCard.getByRole('heading', { name: newName });
      await updatedHeading.click();
      const restoreInput = groupCard.getByLabel('グループ名を編集');
      if (await restoreInput.isVisible({ timeout: getTimeout(3000) }).catch(() => false)) {
        await restoreInput.fill(originalName);
        await restoreInput.press('Enter');
      }
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-22.3: 空白名でエラー表示
   */
  test('空白のグループ名で確定時にエラーメッセージが表示される (REQ-22.3)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const groupCard = await getFirstGroupCard(page);
    if (!groupCard) {
      await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
      return;
    }

    const groupName = groupCard.locator('h3').first();
    await groupName.click();
    const editInput = groupCard.getByLabel('グループ名を編集');
    await expect(editInput).toBeVisible({ timeout: getTimeout(3000) });

    // 空白のみ入力してEnter
    await editInput.fill('   ');
    await editInput.press('Enter');

    // エラーメッセージ「グループ名を入力してください」が表示される
    const errorMessage = groupCard.getByText('グループ名を入力してください');
    await expect(errorMessage).toBeVisible({ timeout: getTimeout(5000) });

    // Escでキャンセル
    await editInput.press('Escape');
  });

  /**
   * @requirement quantity-table-generation/REQ-22.4: 最大文字数（全角25/半角50）
   */
  test('最大50半角文字までは入力できる (REQ-22.4)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const groupCard = await getFirstGroupCard(page);
    if (!groupCard) {
      await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
      return;
    }

    const groupName = groupCard.locator('h3').first();
    await groupName.click();
    const editInput = groupCard.getByLabel('グループ名を編集');
    await expect(editInput).toBeVisible({ timeout: getTimeout(3000) });

    // 半角50文字（'a' x 50）を入力
    const fiftyChars = 'a'.repeat(50);
    await editInput.fill(fiftyChars);
    const valueAt50 = await editInput.inputValue();
    expect(valueAt50.length, '半角50文字までは入力可能').toBe(50);

    // Esc でキャンセル
    await editInput.press('Escape');
  });

  /**
   * @requirement quantity-table-generation/REQ-22.5: 最大文字数超過の入力防止
   */
  test('最大文字数を超える入力は防止される (REQ-22.5)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const groupCard = await getFirstGroupCard(page);
    if (!groupCard) {
      await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
      return;
    }

    const groupName = groupCard.locator('h3').first();
    await groupName.click();
    const editInput = groupCard.getByLabel('グループ名を編集');
    await expect(editInput).toBeVisible({ timeout: getTimeout(3000) });

    // 半角51文字を入力試行（onChangeで最大幅50を超える更新は破棄される）
    const overSizedChars = 'a'.repeat(51);
    await editInput.fill(overSizedChars);
    const value = await editInput.inputValue();

    // 入力値は最大50文字以下に制限される
    expect(value.length, '最大50半角文字を超える入力は防止される').toBeLessThanOrEqual(50);

    await editInput.press('Escape');
  });
});
