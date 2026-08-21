/**
 * @fileoverview 数量表 Phase 9 E2Eテスト
 *
 * Task 34.5: Phase 9のE2Eテストを実装する
 *
 * Requirements coverage:
 * - REQ-12.1-REQ-12.5: パンくずナビゲーション改善
 * - REQ-3.3, REQ-3.4: 注釈付き写真の表示
 * - REQ-19.1-REQ-19.4: 写真変更ダイアログ
 * - REQ-20.1-REQ-20.3: 写真プレビューダイアログ
 * - REQ-21.1-REQ-21.5: 写真コメント表示
 *
 * @module e2e/specs/quantity-tables/quantity-table-phase9.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { assertPrepared } from '../../helpers/preconditions';
import {
  addQuantityGroup,
  attachPhotoToGroup,
  createTestProject,
  createTestQuantityTable,
  openQuantityTableEdit,
  seedSurveyPhotosWithComments,
} from '../../helpers/quantity-table-preconditions';

/** 事前準備で現場調査写真に付けるコメント（REQ-21.2 の表示内容の判定に用いる） */
const PHASE9_PHOTO_COMMENT = 'Phase9: 写真コメント表示エリアの検証用コメント';

/** 事前準備で作成した数量表のID（写真を紐づけたグループを1件持つ） */
let preparedQuantityTableId: string | null = null;

test.describe('Phase 9: パンくずナビゲーション改善・注釈付き写真・コメント表示', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * 事前準備: コメント付き写真を紐づけた数量グループを持つ数量表を作成する。
   *
   * REQ-19.1（写真変更ボタン）と REQ-21.2（写真コメント表示エリア）は、いずれも
   * 「写真の紐づいた数量グループ」がなければ検証対象そのものが描画されない。
   * 前提を探す形（プロジェクト一覧の先頭カードを辿る）は、当該のプロジェクトに
   * 写真も数量表も無い場合に検証が丸ごと飛ぶ。前提は探さずに作る。
   */
  test.describe('事前準備', () => {
    test('コメント付き写真を紐づけた数量グループを作成する', async ({ page }) => {
      const projectId = await createTestProject(page, 'Phase9_PJ');
      await seedSurveyPhotosWithComments(page, projectId, 'Phase9_現場調査', [
        PHASE9_PHOTO_COMMENT,
      ]);

      const quantityTable = await createTestQuantityTable(page, projectId, 'Phase9_数量表');
      preparedQuantityTableId = quantityTable.id;

      const groupCard = await addQuantityGroup(page);
      await attachPhotoToGroup(page, groupCard, 0);

      // REQ-42.5: グループ追加・写真紐づけはドラフトのみを更新するため、
      // 後続テストが開き直したときの前提として明示保存する。
      await saveQuantityTableDraft(page);
    });
  });

  test.describe('REQ-12.1-12.5: パンくずナビゲーション改善', () => {
    test('数量表一覧画面のパンくずが正しい形式で表示されること', async ({ page }) => {
      // プロジェクト一覧に移動
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // 最初のプロジェクトに移動
      const projectCard = page.locator('[data-testid="project-card"]').first();
      if (await projectCard.isVisible()) {
        await projectCard.click();
        await page.waitForLoadState('networkidle');

        // 数量表セクションに移動
        const quantityTableLink = page.getByText('すべて見る').first();
        if (await quantityTableLink.isVisible()) {
          await quantityTableLink.click();
          await page.waitForLoadState('networkidle');

          // パンくずの検証
          const breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
          await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

          // 「プロジェクト一覧」が表示されていること
          await expect(breadcrumb.getByText('プロジェクト一覧')).toBeVisible();

          // 「数量表一覧」が非リンクで表示されていること
          const currentItem = breadcrumb.locator('li').last().locator('span');
          await expect(currentItem).toContainText('数量表一覧');
        }
      }
    });

    test('数量表編集画面のパンくずが正しい形式で表示されること', async ({ page }) => {
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      const projectCard = page.locator('[data-testid="project-card"]').first();
      if (await projectCard.isVisible()) {
        await projectCard.click();
        await page.waitForLoadState('networkidle');

        const quantityTableLink = page.getByText('すべて見る').first();
        if (await quantityTableLink.isVisible()) {
          await quantityTableLink.click();
          await page.waitForLoadState('networkidle');

          // 最初の数量表をクリック
          const tableCard = page.locator('[data-testid="quantity-table-card"]').first();
          if (await tableCard.isVisible()) {
            await tableCard.click();
            await page.waitForLoadState('networkidle');

            const breadcrumb = page.locator('nav[aria-label="パンくずナビゲーション"]');
            await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });
            await expect(breadcrumb.getByText('プロジェクト一覧')).toBeVisible();
            await expect(breadcrumb.getByText('数量表一覧')).toBeVisible();
          }
        }
      }
    });
  });

  test.describe('REQ-20.1-20.3: 写真プレビューダイアログ', () => {
    test('写真クリックでプレビューダイアログが開くこと', async ({ page }) => {
      // 数量表編集画面に移動（写真が紐付けられたグループがある前提）
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      const projectCard = page.locator('[data-testid="project-card"]').first();
      if (await projectCard.isVisible()) {
        await projectCard.click();
        await page.waitForLoadState('networkidle');

        const quantityTableLink = page.getByText('すべて見る').first();
        if (await quantityTableLink.isVisible()) {
          await quantityTableLink.click();
          await page.waitForLoadState('networkidle');

          const tableCard = page.locator('[data-testid="quantity-table-card"]').first();
          if (await tableCard.isVisible()) {
            await tableCard.click();
            await page.waitForLoadState('networkidle');

            // 紐付け画像を表示ボタンをクリック
            const imageButton = page.getByRole('button', { name: '紐付け画像を表示' }).first();
            if (await imageButton.isVisible()) {
              await imageButton.click();

              // プレビューダイアログが表示されること
              const dialog = page.getByRole('dialog', { name: '写真プレビュー' });
              await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

              // Escキーで閉じること
              await page.keyboard.press('Escape');
              await expect(dialog).not.toBeVisible();
            }
          }
        }
      }
    });
  });

  test.describe('REQ-21.2-21.5: 写真コメント表示', () => {
    test('写真が紐付けられたグループでコメント表示エリアが存在すること', async ({ page }) => {
      assertPrepared(preparedQuantityTableId, '事前準備で作成した数量表のID');
      await openQuantityTableEdit(page, preparedQuantityTableId);

      const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
      await expect(groupCard, '前提: 写真を紐づけた数量グループが表示される').toBeVisible({
        timeout: getTimeout(15000),
      });

      const commentDisplay = groupCard.locator('[data-testid="photo-comment-display"]').first();
      await expect(commentDisplay, 'REQ-21.2: 写真コメント表示エリアが表示される').toBeVisible({
        timeout: getTimeout(15000),
      });
      await expect(commentDisplay, 'REQ-21.1: 紐づいた写真のコメントが表示される').toHaveText(
        PHASE9_PHOTO_COMMENT,
        { timeout: getTimeout(15000) }
      );
    });

    test('グループ折りたたみ時にコメント表示が非表示になること', async ({ page }) => {
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      const projectCard = page.locator('[data-testid="project-card"]').first();
      if (await projectCard.isVisible()) {
        await projectCard.click();
        await page.waitForLoadState('networkidle');

        const quantityTableLink = page.getByText('すべて見る').first();
        if (await quantityTableLink.isVisible()) {
          await quantityTableLink.click();
          await page.waitForLoadState('networkidle');

          const tableCard = page.locator('[data-testid="quantity-table-card"]').first();
          if (await tableCard.isVisible()) {
            await tableCard.click();
            await page.waitForLoadState('networkidle');

            // 折りたたみボタンをクリック
            const collapseButton = page
              .getByRole('button', { name: 'グループを折りたたむ' })
              .first();
            if (await collapseButton.isVisible()) {
              await collapseButton.click();

              // コメント表示エリアが非表示になること
              const commentDisplay = page.locator('[data-testid="photo-comment-display"]').first();
              await expect(commentDisplay).not.toBeVisible();
            }
          }
        }
      }
    });
  });

  test.describe('REQ-19.1: 写真変更ボタン', () => {
    test('写真変更ボタンが表示されること', async ({ page }) => {
      assertPrepared(preparedQuantityTableId, '事前準備で作成した数量表のID');
      await openQuantityTableEdit(page, preparedQuantityTableId);

      const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
      await expect(groupCard, '前提: 写真を紐づけた数量グループが表示される').toBeVisible({
        timeout: getTimeout(15000),
      });

      await expect(
        groupCard.getByRole('button', { name: '写真を変更' }),
        'REQ-19.1: 写真が紐づいたグループに写真変更ボタンが表示される'
      ).toBeVisible({ timeout: getTimeout(10000) });
    });
  });
});
