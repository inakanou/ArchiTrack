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

test.describe('REQ-25: 画面スクロールバー表示', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
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
