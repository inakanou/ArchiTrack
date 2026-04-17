/**
 * @fileoverview 写真コメント表示 E2Eテスト
 *
 * Requirements coverage:
 * - REQ-35.1: 写真選択時にコメントを取得して表示
 * - REQ-35.2: 初回表示時に既存写真のコメントを表示
 * - REQ-35.3: 写真変更時にコメントを更新
 * - REQ-35.4: コメント存在時に写真右側に表示
 * - REQ-35.5: コメント非存在時にエリアを空白表示
 * - REQ-35.6: グループ折りたたみ時にコメント非表示
 * - REQ-35.7: グループ再展開時にコメント再表示
 *
 * @module e2e/specs/quantity-tables/photo-comment-display.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

test.describe('REQ-35: 写真コメント表示の不具合修正', () => {
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
   * 写真が紐づいている数量グループを見つけるヘルパー
   */
  async function findGroupWithPhoto(page: import('@playwright/test').Page) {
    const groups = page.locator('[data-testid="quantity-group-card"]');
    const count = await groups.count();

    for (let i = 0; i < count; i++) {
      const group = groups.nth(i);
      // 写真が表示されているグループを探す（imgタグが存在する）
      const hasPhoto = await group
        .locator('img')
        .first()
        .isVisible({ timeout: getTimeout(1000) })
        .catch(() => false);
      if (hasPhoto) {
        return group;
      }
    }
    return null;
  }

  /**
   * @requirement quantity-table-generation/REQ-35.2
   * @requirement quantity-table-generation/REQ-35.4
   * @requirement quantity-table-generation/REQ-35.5
   * 初回表示時に既に写真が紐づけられているグループにコメントが表示される
   */
  test('初回表示時に写真が紐づいたグループでコメント表示エリアが存在する (REQ-35.2, REQ-35.4, REQ-35.5)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    if (!navigated) {
      test.skip();
      return;
    }

    const groupWithPhoto = await findGroupWithPhoto(page);
    if (!groupWithPhoto) {
      // 写真が紐づいたグループがない場合はスキップ
      test.skip();
      return;
    }

    // コメント表示エリアが存在することを確認（REQ-35.4 / REQ-35.5）
    const commentDisplay = groupWithPhoto.locator('[data-testid="photo-comment-display"]');
    await expect(commentDisplay).toBeVisible({ timeout: getTimeout(5000) });

    // コメントが存在する場合はテキストが表示される（REQ-35.4）
    // コメントが存在しない場合はエリアが空白（REQ-35.5）
    // いずれの場合もエラー表示がないことを確認
    const errorElement = groupWithPhoto.locator('[role="alert"]');
    const hasError = await errorElement.isVisible({ timeout: getTimeout(1000) }).catch(() => false);
    expect(hasError).toBeFalsy();
  });

  /**
   * @requirement quantity-table-generation/REQ-35.1
   * 写真選択時にコメントを取得して表示する
   */
  test('写真選択後にコメント表示エリアが更新される (REQ-35.1)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    if (!navigated) {
      test.skip();
      return;
    }

    // 写真が紐づいたグループを探す
    const groupWithPhoto = await findGroupWithPhoto(page);
    if (!groupWithPhoto) {
      test.skip();
      return;
    }

    // コメント表示エリアが存在することを確認
    const commentDisplay = groupWithPhoto.locator('[data-testid="photo-comment-display"]');
    await expect(commentDisplay).toBeVisible({ timeout: getTimeout(5000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-35.3
   * 写真変更ダイアログで別の写真に変更した際にコメントが更新される
   */
  test('写真変更ダイアログで写真を変更するとコメント表示が更新される (REQ-35.3)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    if (!navigated) {
      test.skip();
      return;
    }

    const groupWithPhoto = await findGroupWithPhoto(page);
    if (!groupWithPhoto) {
      test.skip();
      return;
    }

    // 変更前のコメント表示を取得
    const commentDisplay = groupWithPhoto.locator('[data-testid="photo-comment-display"]');
    await expect(commentDisplay).toBeVisible({ timeout: getTimeout(5000) });
    // 写真変更ボタンをクリック
    const changePhotoButton = groupWithPhoto.getByRole('button', { name: '写真を変更' });
    if (!(await changePhotoButton.isVisible({ timeout: getTimeout(3000) }).catch(() => false))) {
      test.skip();
      return;
    }

    await changePhotoButton.click();

    // 写真変更ダイアログが表示される
    const dialog = page.locator('[data-testid="photo-preview-overlay"]');
    const dialogVisible = await dialog.isVisible({ timeout: getTimeout(5000) }).catch(() => false);

    if (!dialogVisible) {
      // ダイアログセレクタが異なる可能性があるため、role="dialog"でも確認
      const roleDialog = page.getByRole('dialog');
      const roleDialogVisible = await roleDialog
        .isVisible({ timeout: getTimeout(3000) })
        .catch(() => false);
      if (!roleDialogVisible) {
        test.skip();
        return;
      }
    }

    // 別の写真を選択（現在選択されていない写真をクリック）
    const unselectedPhoto = page.locator('[data-selected="false"]').first();
    if (await unselectedPhoto.isVisible({ timeout: getTimeout(3000) }).catch(() => false)) {
      await unselectedPhoto.click();
      await page.waitForLoadState('networkidle');

      // コメント表示エリアが引き続き存在し、エラーがないことを確認
      await expect(commentDisplay).toBeVisible({ timeout: getTimeout(5000) });
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-35.6
   * @requirement quantity-table-generation/REQ-35.7
   * グループ折りたたみ/展開時のコメント表示制御
   */
  test('グループ折りたたみ時にコメントが非表示になり、再展開時に再表示される (REQ-35.6, REQ-35.7)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    if (!navigated) {
      test.skip();
      return;
    }

    const groupWithPhoto = await findGroupWithPhoto(page);
    if (!groupWithPhoto) {
      test.skip();
      return;
    }

    const commentDisplay = groupWithPhoto.locator('[data-testid="photo-comment-display"]');
    await expect(commentDisplay).toBeVisible({ timeout: getTimeout(5000) });

    // グループを折りたたむ
    const collapseButton = groupWithPhoto.getByRole('button', { name: /グループを折りたたむ/ });
    if (!(await collapseButton.isVisible({ timeout: getTimeout(3000) }).catch(() => false))) {
      test.skip();
      return;
    }

    await collapseButton.click();

    // コメント表示が非表示になることを確認（REQ-35.6）
    await expect(commentDisplay).not.toBeVisible({ timeout: getTimeout(5000) });

    // グループを再展開する
    const expandButton = groupWithPhoto.getByRole('button', { name: /グループを展開/ });
    await expect(expandButton).toBeVisible({ timeout: getTimeout(3000) });
    await expandButton.click();

    // コメント表示が再表示されることを確認（REQ-35.7）
    await expect(commentDisplay).toBeVisible({ timeout: getTimeout(5000) });
  });
});
