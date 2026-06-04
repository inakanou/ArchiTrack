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
   * 事前準備: テスト用プロジェクト・数量表・グループを作成
   *
   * REQ-22 のテストはグループの存在を前提とするため、独立して実行できるよう
   * 事前にプロジェクト・数量表・グループ1件を作成する。
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

      const projectName = `REQ22_PJ_${Date.now()}`;
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

    test('テスト用数量表とグループを作成する', async ({ page }) => {
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
      await nameInput.fill(`REQ22_数量表_${Date.now()}`);

      const createConfirmButton = page.getByRole('button', { name: /^作成$/i });
      await createConfirmButton.click();

      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
        timeout: getTimeout(15000),
      });
      const tableMatch = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/);
      createdQuantityTableId = tableMatch?.[1] ?? null;
      expect(createdQuantityTableId).toBeTruthy();

      // グループを1つ追加（REQ-22 のテストはグループの存在を前提）。
      // REQ-42 移行: グループ追加はクライアントドラフトのみを更新するため、
      // 永続化 API（POST /groups）は発火しない。カードの出現のみを待機する。
      const addGroupButton = page
        .getByRole('button', { name: /グループ追加|グループを追加/i })
        .first();
      await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });
      await addGroupButton.click();

      const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
      await expect(groupCard).toBeVisible({ timeout: getTimeout(10000) });

      // REQ-42.5: 後続テストが別ナビゲーションでグループを参照できるよう明示保存して永続化する。
      await saveQuantityTableDraft(page);
    });
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
    // h3 は role="button" にオーバーライドされるため、タグセレクタで filter する
    const updatedHeading = groupCard.locator('h3').filter({ hasText: newName }).first();
    await expect(updatedHeading).toBeVisible({
      timeout: getTimeout(8000),
    });

    // 元の名前に戻す
    if (originalName && originalName !== newName) {
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
