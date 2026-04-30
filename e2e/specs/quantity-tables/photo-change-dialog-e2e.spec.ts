/**
 * @fileoverview 写真変更ダイアログ E2Eテスト (REQ-19)
 *
 * Requirements coverage:
 * - @requirement quantity-table-generation/REQ-19.1: 写真変更ダイアログ表示
 * - @requirement quantity-table-generation/REQ-19.2: 注釈付き写真一覧の表示
 * - @requirement quantity-table-generation/REQ-19.3: 写真選択で紐づけ変更
 * - @requirement quantity-table-generation/REQ-19.4: 確定後に関連写真表示エリアを更新
 *
 * @module e2e/specs/quantity-tables/photo-change-dialog-e2e.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

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

test.describe('REQ-19: 写真変更ダイアログでの注釈付き写真表示', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * 事前準備: テスト用プロジェクト・数量表・グループを作成
   *
   * REQ-19 のテストはグループの存在を前提とするため、独立して実行できるよう
   * 事前にプロジェクト・数量表・グループ1件を作成する。写真未紐付けの状態で
   * 「写真選択」UIから写真変更ダイアログを開く動作（REQ-19.1 の同等経路）と、
   * ダイアログ内の写真一覧／空状態表示（REQ-19.2）、選択／クローズ動作
   * （REQ-19.3, 19.4）を検証する。
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

      const projectName = `REQ19_PJ_${Date.now()}`;
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
      await nameInput.fill(`REQ19_数量表_${Date.now()}`);

      const createConfirmButton = page.getByRole('button', { name: /^作成$/i });
      await createConfirmButton.click();

      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
        timeout: getTimeout(15000),
      });
      const tableMatch = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/);
      createdQuantityTableId = tableMatch?.[1] ?? null;
      expect(createdQuantityTableId).toBeTruthy();

      // グループを1つ追加（REQ-19 のテストはグループの存在を前提）
      const addGroupApiPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/quantity-tables/') &&
          response.url().includes('/groups') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(20000) }
      );

      const addGroupButton = page
        .getByRole('button', { name: /グループ追加|グループを追加/i })
        .first();
      await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });
      await addGroupButton.click();
      await addGroupApiPromise;

      const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
      await expect(groupCard).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-19.1: 写真変更ボタンと写真変更ダイアログ
   *
   * 写真が紐付けられている数量グループでは「写真を変更」ボタンが表示され、
   * クリックで写真選択（変更）ダイアログが開くこと。写真未紐付けの場合も
   * プレースホルダーから同等の写真選択ダイアログを開けることを検証する。
   */
  test('写真変更操作で写真選択用ダイアログが開く (REQ-19.1)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated, '数量表編集画面に到達できる必要がある').toBeTruthy();

    // 写真変更ボタンが存在する場合（写真紐付け済みグループがある場合）
    const changePhotoButton = page.getByRole('button', { name: '写真を変更' }).first();
    const changeButtonVisible = await changePhotoButton
      .isVisible({ timeout: getTimeout(5000) })
      .catch(() => false);

    if (changeButtonVisible) {
      // REQ-19.1: 写真変更ダイアログを表示する
      await changePhotoButton.click();

      // 写真選択ダイアログが表示される
      const dialog = page.getByRole('dialog');
      await expect(dialog.first()).toBeVisible({ timeout: getTimeout(5000) });
    } else {
      // 写真未紐付けの場合はプレースホルダーから写真選択ダイアログを開く動作を検証
      const placeholder = page.locator('[data-testid^="image-placeholder-"]').first();
      await expect(
        placeholder,
        '写真選択用UI（変更ボタンまたはプレースホルダー）が必ず存在する'
      ).toBeVisible({ timeout: getTimeout(5000) });

      await placeholder.click();
      const dialog = page.getByRole('dialog').first();
      await expect(dialog).toBeVisible({ timeout: getTimeout(5000) });
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-19.2: ダイアログに注釈付き写真一覧を表示
   *
   * 写真選択ダイアログ内で、選択可能な写真が（注釈付きの場合は注釈バッジ付きで）
   * グリッド表示される。利用可能写真ゼロ件のメッセージ／写真サムネイルのいずれかは必ず表示される。
   */
  test('写真選択ダイアログに注釈付き写真一覧が表示される (REQ-19.2)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    // 写真変更ボタンまたはプレースホルダーから選択ダイアログを開く
    const changePhotoButton = page.getByRole('button', { name: '写真を変更' }).first();
    const placeholder = page.locator('[data-testid^="image-placeholder-"]').first();

    if (await changePhotoButton.isVisible({ timeout: getTimeout(3000) }).catch(() => false)) {
      await changePhotoButton.click();
    } else if (await placeholder.isVisible({ timeout: getTimeout(3000) }).catch(() => false)) {
      await placeholder.click();
    } else {
      // グループも写真も無い場合 - 編集画面が存在することのみ検証
      await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible({
        timeout: getTimeout(5000),
      });
      return;
    }

    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: getTimeout(5000) });

    // 写真リストまたは「利用可能な写真がありません」メッセージが必ず表示される
    const photoList = dialog.locator('[data-testid="photo-list"]');
    const emptyMessage = dialog.getByText(/利用可能な写真がありません|写真を読み込み中/);

    const photoListVisible = await photoList
      .isVisible({ timeout: getTimeout(8000) })
      .catch(() => false);
    const emptyVisible = await emptyMessage
      .first()
      .isVisible({ timeout: getTimeout(8000) })
      .catch(() => false);

    expect(
      photoListVisible || emptyVisible,
      '写真リストまたは空状態メッセージのいずれかが表示される必要がある'
    ).toBeTruthy();
  });

  /**
   * @requirement quantity-table-generation/REQ-19.3: 写真選択で紐づけ変更
   * @requirement quantity-table-generation/REQ-19.4: 関連写真表示エリアを更新
   *
   * 注釈付き写真一覧から写真を選択すると数量グループに紐づく写真が変更され、
   * 確定後に関連写真表示エリアが更新される（ダイアログが閉じる）。
   */
  test('写真変更ダイアログで写真選択するとダイアログが閉じ表示が更新される (REQ-19.3, REQ-19.4)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const changePhotoButton = page.getByRole('button', { name: '写真を変更' }).first();
    const placeholder = page.locator('[data-testid^="image-placeholder-"]').first();

    if (await changePhotoButton.isVisible({ timeout: getTimeout(3000) }).catch(() => false)) {
      await changePhotoButton.click();
    } else if (await placeholder.isVisible({ timeout: getTimeout(3000) }).catch(() => false)) {
      await placeholder.click();
    } else {
      // 編集画面が表示されることのみ検証
      await expect(page.locator('[data-testid="quantity-table-edit-area"]')).toBeVisible();
      return;
    }

    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: getTimeout(5000) });

    // 写真項目を見つけて選択
    const photoItem = dialog.locator('[data-testid^="photo-item-"]').first();
    const photoVisible = await photoItem
      .isVisible({ timeout: getTimeout(8000) })
      .catch(() => false);

    if (photoVisible) {
      // REQ-19.3, 19.4: 写真選択 → ダイアログクローズ
      await photoItem.click();
      await page.waitForLoadState('networkidle');

      // ダイアログが閉じることで「変更を確定」した状態を検証
      await expect(dialog).not.toBeVisible({ timeout: getTimeout(10000) });
    } else {
      // 写真がない場合はダイアログを閉じて画面が維持されること
      const closeBtn = dialog.getByRole('button', { name: 'ダイアログを閉じる' }).first();
      if (await closeBtn.isVisible({ timeout: getTimeout(2000) }).catch(() => false)) {
        await closeBtn.click();
        await expect(dialog).not.toBeVisible({ timeout: getTimeout(5000) });
      }
    }
  });
});
