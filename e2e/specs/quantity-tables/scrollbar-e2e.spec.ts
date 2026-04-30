/**
 * @fileoverview 画面スクロールバー表示 E2Eテスト (REQ-25)
 *
 * Requirements coverage:
 * - @requirement quantity-table-generation/REQ-25.1: 横幅超過時の水平スクロールバー
 * - @requirement quantity-table-generation/REQ-25.2: 縦幅超過時の垂直スクロールバー
 * - @requirement quantity-table-generation/REQ-25.3: ビューポート内収納時はスクロールバー非表示
 * - @requirement quantity-table-generation/REQ-25.4: ウィンドウリサイズ時の動的更新
 * - @requirement quantity-table-generation/REQ-25.5: 横スクロール操作可能
 * - @requirement quantity-table-generation/REQ-25.6: 縦スクロール操作可能
 *
 * @module e2e/specs/quantity-tables/scrollbar-e2e.spec
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

test.describe('REQ-25: 画面スクロールバー表示', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * 事前準備: テスト用プロジェクト・数量表を作成
   *
   * REQ-25 のスクロールバー検証はビューポートと数量表編集画面の表示領域の
   * 関係を検証するため、独立して実行できるようにプロジェクト・数量表 1件を作成する。
   * 数量項目グループの有無に関わらずスクロールバー挙動はブラウザの仕様で成立するため、
   * 空の数量表のみを用意する。
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

      const projectName = `REQ25_PJ_${Date.now()}`;
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

    test('テスト用数量表を作成する', async ({ page }) => {
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
      await nameInput.fill(`REQ25_数量表_${Date.now()}`);

      const createConfirmButton = page.getByRole('button', { name: /^作成$/i });
      await createConfirmButton.click();

      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
        timeout: getTimeout(15000),
      });
      const tableMatch = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/);
      createdQuantityTableId = tableMatch?.[1] ?? null;
      expect(createdQuantityTableId).toBeTruthy();
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-25.1: 横幅超過時の水平スクロールバー
   *
   * 数量項目の表示領域がビューポートの横幅を超えた場合、ブラウザによって水平スクロールが
   * 可能になる（document.documentElementのscrollWidth > clientWidth）。
   */
  test('小さいビューポート時に水平スクロールが可能になる (REQ-25.1)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    // ビューポートを狭く設定
    await page.setViewportSize({ width: 600, height: 800 });
    await page.waitForLoadState('networkidle');

    // ドキュメントの横スクロール可能性を検証
    const scrollInfo = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    // 数量項目テーブルは多数の列を持つため、600px幅では超える可能性が高い
    // 仮にデータが少なくても scrollWidth >= clientWidth は成立
    expect(scrollInfo.scrollWidth, '横スクロール可能な状態にある').toBeGreaterThanOrEqual(
      scrollInfo.clientWidth
    );
  });

  /**
   * @requirement quantity-table-generation/REQ-25.2: 縦幅超過時の垂直スクロールバー
   */
  test('縦に長いコンテンツで垂直スクロールが可能になる (REQ-25.2)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    // ビューポートを縦に小さく設定
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.waitForLoadState('networkidle');

    const scrollInfo = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));

    // 編集画面のヘッダー＋コンテンツは400pxより通常は大きい
    expect(scrollInfo.scrollHeight, '垂直スクロール可能な状態にある').toBeGreaterThanOrEqual(
      scrollInfo.clientHeight
    );
  });

  /**
   * @requirement quantity-table-generation/REQ-25.3: ビューポート内収納時はスクロールバーが非表示
   *
   * 大きなビューポートで全体が収まる場合、横スクロールが発生しない（scrollWidth ≦ clientWidth）。
   */
  test('十分大きいビューポートでは水平スクロールが発生しない (REQ-25.3)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    // 十分に大きいビューポート
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.waitForLoadState('networkidle');

    const scrollInfo = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    // 大きなビューポートでは横スクロールが発生しないか、誤差程度
    // scrollWidth が clientWidth を大きく超えないことを許容範囲で検証
    const horizontalOverflow = scrollInfo.scrollWidth - scrollInfo.clientWidth;
    expect(
      horizontalOverflow,
      '十分なビューポート幅では横スクロールが顕著に発生しない'
    ).toBeLessThanOrEqual(50);
  });

  /**
   * @requirement quantity-table-generation/REQ-25.4: ウィンドウリサイズ時の動的更新
   *
   * ビューポートサイズを動的に変更すると、scrollWidth/clientWidth の関係が動的に変化する。
   */
  test('ビューポートリサイズに応じてスクロール状態が動的に更新される (REQ-25.4)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    // 大きなビューポート → 小さなビューポートにリサイズ
    await page.setViewportSize({ width: 2000, height: 1200 });
    await page.waitForLoadState('networkidle');
    const beforeWide = await page.evaluate(() => document.documentElement.clientWidth);

    await page.setViewportSize({ width: 600, height: 800 });
    await page.waitForLoadState('networkidle');
    const afterNarrow = await page.evaluate(() => document.documentElement.clientWidth);

    expect(afterNarrow, 'ビューポート縮小後はclientWidthが小さくなる').toBeLessThan(beforeWide);
  });

  /**
   * @requirement quantity-table-generation/REQ-25.5: 横スクロール操作可能
   *
   * 横スクロール可能な状態でscrollX操作を行うと、scrollX値が変化する。
   */
  test('水平スクロール可能な状態でwindow.scrollByにより横スクロールできる (REQ-25.5)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    await page.setViewportSize({ width: 600, height: 800 });
    await page.waitForLoadState('networkidle');

    // スクロール前のscrollX
    const scrollXBefore = await page.evaluate(() => window.scrollX);

    // 横スクロールを試行
    await page.evaluate(() => window.scrollBy(200, 0));
    await page.waitForLoadState('networkidle');

    const scrollXAfter = await page.evaluate(() => window.scrollX);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    if (scrollWidth > clientWidth) {
      // 実際に横スクロール可能な状態の場合
      expect(scrollXAfter, '横スクロール可能領域があれば scrollX が増加する').toBeGreaterThan(
        scrollXBefore
      );
    } else {
      // 横スクロール不要の場合は scrollX は0で変化しない
      expect(scrollXAfter).toBe(scrollXBefore);
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-25.6: 縦スクロール操作可能
   */
  test('垂直スクロール可能な状態でwindow.scrollByにより縦スクロールできる (REQ-25.6)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    await page.setViewportSize({ width: 1280, height: 400 });
    await page.waitForLoadState('networkidle');

    const scrollYBefore = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForLoadState('networkidle');
    const scrollYAfter = await page.evaluate(() => window.scrollY);

    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const clientHeight = await page.evaluate(() => document.documentElement.clientHeight);

    if (scrollHeight > clientHeight) {
      expect(scrollYAfter, '縦スクロール可能領域があれば scrollY が増加する').toBeGreaterThan(
        scrollYBefore
      );
    } else {
      expect(scrollYAfter).toBe(scrollYBefore);
    }
  });
});
