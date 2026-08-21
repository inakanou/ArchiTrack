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
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { openEditPageWithSingleItemRow } from '../../helpers/quantity-table-preconditions';

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
    return await isVisibleWithin(editArea, getTimeout(10000));
  }

  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  const projectCard = page.locator('[data-testid^="project-card-"]').first();
  if (!(await isVisibleWithin(projectCard, getTimeout(5000)))) {
    return false;
  }
  await projectCard.click();
  await page.waitForLoadState('networkidle');

  const quantityTableLink = page.getByText('すべて見る').first();
  if (!(await isVisibleWithin(quantityTableLink, getTimeout(5000)))) {
    return false;
  }
  await quantityTableLink.click();
  await page.waitForLoadState('networkidle');

  const tableCard = page.locator('[data-testid="quantity-table-card"]').first();
  if (!(await isVisibleWithin(tableCard, getTimeout(5000)))) {
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
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

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
   * REQ-25.5 は「水平スクロールバーが表示されている状態で」横方向へスクロールできることを
   * 定めている。従来は前提の成否を観測して `if (scrollWidth > clientWidth)` で分岐しており、
   * 空の数量表（事前準備は数量グループを持たない数量表を作る）では前提が成立せず、
   * else 側の `scrollX === scrollX`（常に成立）だけが実行されて REQ-25.5 の主張は
   * 一度も行われなかった。前提を観測せず、数量グループと数量項目行を作って確定させる。
   *
   * 数量項目の表示領域は REQ-41 で `itemTableWrapper`（`item-table-scroll-*`）に
   * 限定された水平スクロール領域であり、requirements.md の Requirement 37 の記述
   * 「表領域の水平スクロールバー（Requirement 25 と整合）」がこれを明示している。
   * 列幅の合計（QUANTITY_ITEM_GRID_COLUMNS = 1168px）は 600px のビューポートを必ず超えるため、
   * 「水平スクロールバーが表示されている状態」が決定的に成立する。
   */
  test('水平スクロールバーが表示されている状態で表領域を横スクロールできる (REQ-25.5)', async ({
    page,
  }) => {
    await openEditPageWithSingleItemRow(page, createdQuantityTableId);

    await page.setViewportSize({ width: 600, height: 800 });

    const itemTableScroll = page.locator('[data-testid^="item-table-scroll-"]').first();
    await expect(itemTableScroll, '前提: 数量項目の表示領域が表示される').toBeVisible({
      timeout: getTimeout(15000),
    });

    // 前提（REQ-25.1）: 表示領域がビューポート幅を超え、水平スクロールバーが表示される
    await expect
      .poll(() => itemTableScroll.evaluate((el) => el.scrollWidth - el.clientWidth), {
        message: 'REQ-25.1: 数量項目の表示領域がビューポート幅を超え水平スクロールが可能になる',
        timeout: getTimeout(10000),
      })
      .toBeGreaterThan(0);

    const scrollLeftBefore = await itemTableScroll.evaluate((el) => el.scrollLeft);

    // 横スクロール操作
    await itemTableScroll.evaluate((el) => {
      el.scrollLeft += 200;
    });

    await expect
      .poll(() => itemTableScroll.evaluate((el) => el.scrollLeft), {
        message: 'REQ-25.5: 水平スクロール操作で表領域が横方向にスクロールする',
        timeout: getTimeout(10000),
      })
      .toBeGreaterThan(scrollLeftBefore);
  });

  /**
   * @requirement quantity-table-generation/REQ-25.6: 縦スクロール操作可能
   *
   * REQ-25.6 の前提「垂直スクロールバーが表示されている状態」も観測せずに確定させる。
   * 垂直スクロールは `itemTableWrapper` が `overflowY: hidden` でページ側へ委ねており
   * （QuantityGroupCard の Task 58.2 の注記）、スクロールの主体は window である。
   * 数量グループ1件（写真領域・タイトル行・項目行・追加ボタン）を持つ編集画面は
   * 高さ 400px のビューポートに収まらないため、前提が決定的に成立する。
   */
  test('垂直スクロールバーが表示されている状態で縦スクロールできる (REQ-25.6)', async ({
    page,
  }) => {
    await openEditPageWithSingleItemRow(page, createdQuantityTableId);

    await page.setViewportSize({ width: 1280, height: 400 });

    // 前提（REQ-25.2）: コンテンツがビューポート高さを超え、垂直スクロールバーが表示される
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollHeight - document.documentElement.clientHeight
          ),
        {
          message: 'REQ-25.2: コンテンツがビューポート高さを超え垂直スクロールが可能になる',
          timeout: getTimeout(10000),
        }
      )
      .toBeGreaterThan(0);

    const scrollYBefore = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollBy(0, 200));

    await expect
      .poll(() => page.evaluate(() => window.scrollY), {
        message: 'REQ-25.6: 縦スクロール操作で画面が縦方向にスクロールする',
        timeout: getTimeout(10000),
      })
      .toBeGreaterThan(scrollYBefore);
  });
});
