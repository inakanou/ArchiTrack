/**
 * @fileoverview 数量項目アクションメニューの切り取り検証 E2E テスト (REQ-46)
 *
 * Task 71.1: アクションメニューの切り取り検証 E2E を実装する
 *
 * Requirements coverage:
 * - @requirement quantity-table-generation/REQ-46.1: メニュー内の全操作項目を視認可能な状態で表示する
 * - @requirement quantity-table-generation/REQ-46.2: 水平スクロール領域の境界でメニューを切り取らない
 * - @requirement quantity-table-generation/REQ-46.3: グループ最下行でもメニュー全体を切り取らず表示する
 * - @requirement quantity-table-generation/REQ-46.4: 数量項目が1件のみのグループでもメニュー全体を表示する
 * - @requirement quantity-table-generation/REQ-46.5: 表の水平スクロールにメニューが追従する
 * - @requirement quantity-table-generation/REQ-46.6: 画面の垂直スクロールにメニューが追従する
 * - @requirement quantity-table-generation/REQ-46.7: 固定表示ヘッダー（REQ-45）より前面に表示する
 * - @requirement quantity-table-generation/REQ-46.8: メニュー外クリックでドロップダウンを閉じる
 * - @requirement quantity-table-generation/REQ-46.9: メニュー項目選択で操作実行後に閉じる
 * - @requirement quantity-table-generation/REQ-46.11: REQ-37/REQ-41 の水平スクロール動作を阻害しない
 * - @requirement quantity-table-generation/REQ-46.10: 表示修正によって Requirement 36 のメニュー項目構成・活性/非活性制御・各操作の動作を変更しない
 *
 * 検証方針（requirements.md REQ-46「検証方針」/ design.md「アクションメニューの描画・追従フロー」）:
 *   本不具合は祖先要素（itemTableWrapper: overflowX:auto / overflowY:hidden）の
 *   クリップに起因し、レイアウトを再現しない仮想DOM（jsdom）では検出できない。
 *   さらに Playwright の `toBeVisible()` は「祖先の overflow による切り取り」を検出せず、
 *   クリップされていても true を返すため、可視判定だけでは回帰を検出できない。
 *
 *   そこで本スペックは既存の写真一覧の重なり検証 E2E（photo-select-overlap-e2e.spec.ts）と
 *   同じ流儀で、以下の 2 系統の「幾何・実描画」検証を用いる。
 *
 *   1. Portal 描画の直接確認: メニュー要素の `parentElement === document.body` を evaluate で検証する。
 *      （祖先のスクロール領域内に描画されている限りクリップは避けられないため、
 *        描画ツリーが body 直下へ出ていることが不具合解消の必要条件である）
 *   2. 矩形とヒットテストによる切り取り検出:
 *      - `boundingBox()` でメニュー矩形を取得し、切り取り元である itemTableWrapper の矩形から
 *        はみ出していること（＝クリップされていれば見えないはずの位置にあること）を確認したうえで、
 *        メニュー全体がビューポート内に完全に収まっていることを確認する。
 *      - 各メニュー項目の矩形上の複数点で `document.elementFromPoint` を実行し、
 *        その点の最前面要素がメニュー項目自身（またはその子孫）であることを確認する。
 *        クリップされた領域は描画もヒットテストもされないため、`getBoundingClientRect` が
 *        矩形を返しても elementFromPoint はメニュー項目を返さない。これによりクリップと
 *        他要素による被覆（REQ-46.7）を同時に検出できる。
 *
 * @module e2e/specs/quantity-tables/quantity-item-action-menu-clipping-e2e.spec
 */

import { test, expect, type Page, type Locator } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';

const RUN_ID = Date.now();

/** メニュー項目数（上へ移動・下へ移動・コピー・削除。REQ-36 の構成を維持する） */
const MENU_ITEM_COUNT = 4;

/** 幾何比較の許容誤差（px）。サブピクセル丸めを吸収する */
const TOLERANCE = 1.5;

let testProjectId: string | null = null;
let testTableId: string | null = null;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MenuItemProbe {
  index: number;
  text: string;
  rect: Rect;
  /** ヒットテストに失敗した点（＝クリップまたは他要素に覆われている点） */
  misses: { x: number; y: number; actual: string }[];
}

// ============================================================================
// セットアップヘルパー（既存 quantity-tables スペックのパターンを踏襲）
// ============================================================================

async function createTestProject(page: Page, projectName: string): Promise<string> {
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /新規作成/i }).click();
  await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
  await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
    timeout: getTimeout(15000),
  });

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
  const projectId = page.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1] ?? null;
  expect(projectId, 'プロジェクトIDが取得できる必要がある').toBeTruthy();
  return projectId as string;
}

async function createQuantityTable(page: Page, tableName: string): Promise<string> {
  await page.goto(`/projects/${testProjectId}/quantity-tables`);
  await page.waitForLoadState('networkidle');

  const createLink = page.getByRole('link', { name: /新規作成/i }).first();
  await expect(createLink).toBeVisible({ timeout: getTimeout(10000) });
  await createLink.click();

  const nameInput = page.getByRole('textbox', { name: /数量表名|名称/i }).first();
  await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
  await nameInput.fill(tableName);
  await page.getByRole('button', { name: /^作成$/i }).click();

  await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, { timeout: getTimeout(15000) });
  const tableId = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/)?.[1] ?? null;
  expect(tableId, '数量表IDが取得できる必要がある').toBeTruthy();
  return tableId as string;
}

async function addGroup(page: Page, expectedCountAfter: number): Promise<void> {
  const addGroupButton = page.getByRole('button', { name: /グループ追加|グループを追加/i }).first();
  await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });
  await addGroupButton.click();
  await expect(page.locator('[data-testid="quantity-group-card"]')).toHaveCount(
    expectedCountAfter,
    { timeout: getTimeout(10000) }
  );
}

/**
 * 指定グループへ項目を1件追加し、必須フィールド（工種・名称・単位）を埋める。
 */
async function addItemToGroupAt(
  page: Page,
  groupIndex: number,
  expectedItemCountAfter: number,
  fields: { workType: string; name: string; unit: string }
): Promise<void> {
  const groupCard = page.locator('[data-testid="quantity-group-card"]').nth(groupIndex);

  const addItemButton = groupCard.getByRole('button', { name: '項目を追加' });
  await expect(addItemButton).toBeVisible({ timeout: getTimeout(10000) });
  await addItemButton.click();

  await expect(groupCard.locator('[data-testid="quantity-item-row"]')).toHaveCount(
    expectedItemCountAfter,
    { timeout: getTimeout(10000) }
  );

  const lastRow = groupCard.locator('[data-testid="quantity-item-row"]').last();

  const workTypeInput = lastRow.locator('input[id$="-workType"]').first();
  await expect(workTypeInput).toBeVisible({ timeout: getTimeout(5000) });
  await workTypeInput.fill(fields.workType);
  await workTypeInput.blur();

  const nameInput = lastRow.locator('input[id$="-name"]').first();
  await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
  await nameInput.fill(fields.name);
  await nameInput.blur();

  const unitInput = lastRow.locator('input[id$="-unit"]').first();
  await expect(unitInput).toBeVisible({ timeout: getTimeout(5000) });
  await unitInput.fill(fields.unit);
  await unitInput.blur();
}

// ============================================================================
// 検証ヘルパー（幾何・実描画）
// ============================================================================

const groupCards = (page: Page): Locator => page.locator('[data-testid="quantity-group-card"]');
const editHeader = (page: Page): Locator => page.getByTestId('quantity-table-edit-header');
const openMenu = (page: Page): Locator => page.getByRole('menu');

/** 指定グループカードの水平スクロールラッパー（クリップ元＝REQ-41 の overflow コンテナ） */
const itemTableWrapper = (groupCard: Locator): Locator =>
  groupCard.locator('[data-testid^="item-table-scroll-"]');

/**
 * 数量表編集画面を開く。
 */
async function gotoEditPage(page: Page): Promise<void> {
  expect(testTableId, '事前準備（数量表作成）が完了している必要がある').toBeTruthy();
  await page.goto(`/quantity-tables/${testTableId}/edit`);
  await page.waitForLoadState('networkidle');
  await expect(groupCards(page).first()).toBeVisible({ timeout: getTimeout(15000) });
}

/**
 * 指定行のアクションメニューボタンを取得する（行を画面中央へスクロールしてから返す）。
 *
 * メニューはボタン直下へ開く（フリップしない）設計のため、ボタンがビューポート下端付近に
 * あるとメニューがビューポート外へ出る。切り取り検証の前提として行を中央へ寄せる。
 */
async function actionButtonOf(row: Locator): Promise<Locator> {
  await row.evaluate((el: Element) => el.scrollIntoView({ block: 'center' }));
  return row.getByRole('button', { name: 'アクション' });
}

/**
 * メニューが document.body 直下（Portal）へ描画されていることを直接検証する（REQ-46.2）。
 */
async function expectMenuPortaledToBody(page: Page, context: string): Promise<void> {
  const menu = openMenu(page);
  await expect(menu, `${context}: メニューが1つだけ開いている必要がある`).toHaveCount(1, {
    timeout: getTimeout(5000),
  });

  const parentInfo = await menu.evaluate((el: Element) => {
    const parent = el.parentElement;
    return {
      isBodyChild: parent === document.body,
      parentTag: parent ? parent.tagName.toLowerCase() : 'null',
      parentTestId: parent?.getAttribute('data-testid') ?? '',
    };
  });

  expect(
    parentInfo.isBodyChild,
    `${context}: アクションメニューは document.body 直下へ Portal 描画される必要がある ` +
      `(実際の親要素: <${parentInfo.parentTag}${
        parentInfo.parentTestId ? ` data-testid="${parentInfo.parentTestId}"` : ''
      }>)。` +
      'スクロール領域（itemTableWrapper）の内側に描画されている限り overflow でクリップされる。'
  ).toBe(true);
}

/**
 * メニューの全項目が実際に画面上へ描画され、切り取られても覆われてもいないことを検証する。
 *
 * `getBoundingClientRect` は祖先の overflow による切り取りを反映しない（クリップされていても
 * 矩形を返す）ため、矩形だけでは不十分である。矩形上の各点で `document.elementFromPoint` を
 * 実行し、最前面要素がメニュー項目自身（またはその子孫）であることを確認する。
 * クリップされた領域・他要素に覆われた領域はヒットテストされないため、ここで検出できる。
 */
async function expectMenuItemsFullyRendered(page: Page, context: string): Promise<void> {
  const menu = openMenu(page);

  const probes: MenuItemProbe[] = await menu.evaluate((menuEl: Element) => {
    const describe = (el: Element | null): string => {
      if (!el) return 'null（クリップまたはビューポート外で描画されていない）';
      const testId = el.getAttribute('data-testid');
      const role = el.getAttribute('role');
      return `<${el.tagName.toLowerCase()}${role ? ` role="${role}"` : ''}${
        testId ? ` data-testid="${testId}"` : ''
      }>`;
    };

    return Array.from(menuEl.querySelectorAll('[role="menuitem"]')).map((item, index) => {
      const r = item.getBoundingClientRect();
      const points = [
        { x: r.left + r.width / 2, y: r.top + r.height / 2 },
        { x: r.left + r.width / 2, y: r.top + 2 },
        { x: r.left + r.width / 2, y: r.bottom - 2 },
      ];
      const misses = points
        .map((p) => {
          const topMost = document.elementFromPoint(p.x, p.y);
          const isHit = !!topMost && (topMost === item || item.contains(topMost));
          return isHit
            ? null
            : { x: Math.round(p.x), y: Math.round(p.y), actual: describe(topMost) };
        })
        .filter((m): m is { x: number; y: number; actual: string } => m !== null);

      return {
        index,
        text: (item.textContent ?? '').trim(),
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        misses,
      };
    });
  });

  expect(
    probes.length,
    `${context}: メニュー項目は ${MENU_ITEM_COUNT} 件（上へ移動・下へ移動・コピー・削除）である必要がある`
  ).toBe(MENU_ITEM_COUNT);

  for (const probe of probes) {
    expect(
      probe.rect.width,
      `${context}: メニュー項目[${probe.index}] "${probe.text}" の幅がゼロより大きい`
    ).toBeGreaterThan(0);
    expect(
      probe.rect.height,
      `${context}: メニュー項目[${probe.index}] "${probe.text}" の高さがゼロより大きい`
    ).toBeGreaterThan(0);
    expect(
      probe.misses,
      `${context}: メニュー項目[${probe.index}] "${probe.text}" が画面上に描画されていない ` +
        `(rect=${JSON.stringify(probe.rect)}, ヒットテスト失敗点=${JSON.stringify(probe.misses)})。` +
        '祖先の overflow による切り取り、または他要素による被覆が発生している。'
    ).toEqual([]);
  }
}

/**
 * メニュー全体がビューポート内に完全に収まっていることを検証する（REQ-46.1）。
 */
async function expectMenuWithinViewport(page: Page, context: string): Promise<Rect> {
  const box = await openMenu(page).boundingBox();
  expect(box, `${context}: メニューの矩形が取得できる必要がある`).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport, `${context}: ビューポートサイズが取得できる必要がある`).not.toBeNull();

  const menuBox = box as Rect;
  const vp = viewport as { width: number; height: number };

  expect(menuBox.x, `${context}: メニュー左端がビューポート内にある`).toBeGreaterThanOrEqual(
    -TOLERANCE
  );
  expect(menuBox.y, `${context}: メニュー上端がビューポート内にある`).toBeGreaterThanOrEqual(
    -TOLERANCE
  );
  expect(
    menuBox.x + menuBox.width,
    `${context}: メニュー右端がビューポート内にある (menu=${JSON.stringify(menuBox)})`
  ).toBeLessThanOrEqual(vp.width + TOLERANCE);
  expect(
    menuBox.y + menuBox.height,
    `${context}: メニュー下端がビューポート内にある (menu=${JSON.stringify(menuBox)})`
  ).toBeLessThanOrEqual(vp.height + TOLERANCE);

  return menuBox;
}

/**
 * 「切り取り元」である itemTableWrapper の矩形から、メニューが実際にはみ出していることを
 * 検証する（＝クリップされていれば見えないはずの位置にメニューがあることの確認）。
 *
 * この前提が成立していないと、切り取り検証そのものが空虚になる。
 * あわせて wrapper が実際にクリップする overflow を持つ（REQ-41 の実装が生きている）ことも確認する。
 */
async function expectMenuOverflowsWrapper(
  groupCard: Locator,
  menuBox: Rect,
  context: string
): Promise<void> {
  const wrapper = itemTableWrapper(groupCard);
  const overflow = await wrapper.evaluate((el: Element) => {
    const style = window.getComputedStyle(el);
    return { overflowX: style.overflowX, overflowY: style.overflowY };
  });
  expect(
    overflow.overflowX,
    `${context}: itemTableWrapper は水平スクロール（REQ-41）を保持している必要がある`
  ).toMatch(/auto|scroll/);
  expect(
    overflow.overflowY,
    `${context}: itemTableWrapper は縦方向をクリップする（＝メニューを切り取りうる）必要がある`
  ).toMatch(/hidden|clip|auto|scroll/);

  const wrapperBox = await wrapper.boundingBox();
  expect(wrapperBox, `${context}: itemTableWrapper の矩形が取得できる必要がある`).not.toBeNull();
  const wb = wrapperBox as Rect;

  expect(
    menuBox.y + menuBox.height,
    `${context}: メニュー下端がクリップ元（itemTableWrapper）の下端を超えている必要がある。` +
      `超えていない場合、切り取り検証が空虚になる ` +
      `(menu=${JSON.stringify(menuBox)}, wrapper=${JSON.stringify(wb)})`
  ).toBeGreaterThan(wb.y + wb.height + TOLERANCE);
}

// ============================================================================
// テスト
// ============================================================================

test.describe('REQ-46: 数量項目アクションメニューが表示領域に切り取られない', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  // --------------------------------------------------------------------------
  // 事前準備
  // --------------------------------------------------------------------------
  test('プロジェクト・数量表・数量グループ（複数項目／単一項目）を作成する', async ({ page }) => {
    testProjectId = await createTestProject(page, `REQ46_PJ_${RUN_ID}`);
    testTableId = await createQuantityTable(page, `REQ46_数量表_${RUN_ID}`);

    // グループ1: 3項目（最下行の検証用）
    await addGroup(page, 1);
    for (let i = 0; i < 3; i++) {
      await addItemToGroupAt(page, 0, i + 1, {
        workType: `工種1-${i}`,
        name: `名称1-${i}`,
        unit: 'm2',
      });
    }

    // グループ2: 1項目（数量項目が1件のみのグループの検証用。REQ-46.4）
    await addGroup(page, 2);
    await addItemToGroupAt(page, 1, 1, { workType: '工種2-0', name: '名称2-0', unit: 'm' });

    // グループ3: 2項目（垂直スクロール量を確保し、行を固定ヘッダー下へ送れるようにする）
    await addGroup(page, 3);
    for (let i = 0; i < 2; i++) {
      await addItemToGroupAt(page, 2, i + 1, {
        workType: `工種3-${i}`,
        name: `名称3-${i}`,
        unit: 'm3',
      });
    }

    // REQ-42.5: 後続テストが再ナビゲートで参照できるよう明示保存して永続化する。
    await saveQuantityTableDraft(page);
  });

  // --------------------------------------------------------------------------
  // REQ-46.1 / 46.2 / 46.3: グループ最下行
  // --------------------------------------------------------------------------
  test('グループ最下行のアクションメニューが表の表示領域に切り取られず全項目表示される (REQ-46.1, 46.2, 46.3)', async ({
    page,
  }) => {
    await gotoEditPage(page);

    const groupCard = groupCards(page).first();
    const rows = groupCard.locator('[data-testid="quantity-item-row"]');
    await expect(rows).toHaveCount(3, { timeout: getTimeout(10000) });

    // 最下行（グループ内の最後の数量項目）— メニューがラッパー下端を超えて開くケース
    const lastRow = rows.last();
    const button = await actionButtonOf(lastRow);
    await expect(button).toBeVisible({ timeout: getTimeout(5000) });
    await button.click();

    const context = '最下行';
    await expectMenuPortaledToBody(page, context);
    const menuBox = await expectMenuWithinViewport(page, context);
    // 切り取り元をはみ出していること（＝クリップされていれば見えない位置にあること）
    await expectMenuOverflowsWrapper(groupCard, menuBox, context);
    // それでもなお全項目が画面上に描画されている（＝切り取られていない）
    await expectMenuItemsFullyRendered(page, context);
  });

  // --------------------------------------------------------------------------
  // REQ-46.4: 数量項目が1件のみのグループ
  // --------------------------------------------------------------------------
  test('数量項目が1件のみのグループでもメニュー全体が切り取られず表示され、活性/非活性制御が維持される (REQ-46.1, 46.4, 46.10)', async ({
    page,
  }) => {
    await gotoEditPage(page);

    const groupCard = groupCards(page).nth(1);
    const rows = groupCard.locator('[data-testid="quantity-item-row"]');
    await expect(rows, '2番目のグループは数量項目が1件である必要がある').toHaveCount(1, {
      timeout: getTimeout(10000),
    });

    const button = await actionButtonOf(rows.first());
    await expect(button).toBeVisible({ timeout: getTimeout(5000) });
    await button.click();

    const context = '単一項目グループ';
    await expectMenuPortaledToBody(page, context);
    const menuBox = await expectMenuWithinViewport(page, context);
    await expectMenuOverflowsWrapper(groupCard, menuBox, context);
    await expectMenuItemsFullyRendered(page, context);

    // REQ-46.10: 表示修正（Portal 化）後も Requirement 36 の活性/非活性制御を変更しない。
    // 単一項目グループでは当該項目が最上位かつ最下位のため「上へ移動」「下へ移動」は
    // ともに非活性、「コピー」「削除」は活性である（REQ-36.6/36.7 と整合）。
    const menu = openMenu(page);
    await expect(
      menu.getByRole('menuitem', { name: '上へ移動' }),
      '単一項目グループでは最上位のため「上へ移動」が非活性である必要がある（REQ-46.10）'
    ).toBeDisabled();
    await expect(
      menu.getByRole('menuitem', { name: '下へ移動' }),
      '単一項目グループでは最下位のため「下へ移動」が非活性である必要がある（REQ-46.10）'
    ).toBeDisabled();
    await expect(
      menu.getByRole('menuitem', { name: 'コピー' }),
      '「コピー」は活性のまま維持される必要がある（REQ-46.10）'
    ).toBeEnabled();
    await expect(
      menu.getByRole('menuitem', { name: '削除' }),
      '「削除」は活性のまま維持される必要がある（REQ-46.10）'
    ).toBeEnabled();
  });

  // --------------------------------------------------------------------------
  // REQ-46.5 / 46.11: 表の水平スクロール追従とスクロール動作の非阻害
  // --------------------------------------------------------------------------
  test('表の水平スクロールでメニューがボタンに追従し、メニュー操作後も水平スクロールが壊れない (REQ-46.5, 46.11)', async ({
    page,
  }) => {
    await gotoEditPage(page);

    const groupCard = groupCards(page).first();
    const rows = groupCard.locator('[data-testid="quantity-item-row"]');
    await expect(rows).toHaveCount(3, { timeout: getTimeout(10000) });

    // REQ-37: 計算方法「ピッチ」で計算用フィールドが行内に水平配置され、
    // 表の幅がビューポートを超えて itemTableWrapper が水平スクロール可能になる（REQ-41）。
    const targetRow = rows.first();
    await targetRow.getByLabel(/計算方法/).selectOption({ value: 'PITCH' });

    const wrapper = itemTableWrapper(groupCard);
    await expect
      .poll(async () => wrapper.evaluate((el: Element) => el.scrollWidth - el.clientWidth), {
        timeout: getTimeout(10000),
      })
      .toBeGreaterThan(50);

    const button = await actionButtonOf(targetRow);
    await expect(button).toBeVisible({ timeout: getTimeout(5000) });
    await button.click();

    await expectMenuPortaledToBody(page, '水平スクロール前');
    await expectMenuItemsFullyRendered(page, '水平スクロール前');

    const buttonBefore = await button.boundingBox();
    const menuBefore = await openMenu(page).boundingBox();
    expect(buttonBefore, 'アクションボタンの矩形が取得できる必要がある').not.toBeNull();
    expect(menuBefore, 'メニューの矩形が取得できる必要がある').not.toBeNull();
    const bBefore = buttonBefore as Rect;
    const mBefore = menuBefore as Rect;

    // 表を水平スクロールする（itemTableWrapper のスクロールは window までバブルしない）
    const scrolled = await wrapper.evaluate((el: Element) => {
      const target = Math.min(200, el.scrollWidth - el.clientWidth);
      el.scrollLeft = target;
      return el.scrollLeft;
    });
    expect(scrolled, '表が実際に水平スクロールしている必要がある（前提）').toBeGreaterThan(50);

    // 追従を待つ（scroll イベント → 座標再計算 → 再描画）
    await expect
      .poll(async () => (await button.boundingBox())?.x ?? Number.NaN, {
        timeout: getTimeout(10000),
      })
      .toBeLessThan(bBefore.x - 50);

    const buttonAfter = await button.boundingBox();
    const menuAfter = await openMenu(page).boundingBox();
    expect(buttonAfter).not.toBeNull();
    expect(menuAfter).not.toBeNull();
    const bAfter = buttonAfter as Rect;
    const mAfter = menuAfter as Rect;

    // メニューはボタンとの相対位置を保ったまま追従する（REQ-46.5）
    expect(
      Math.abs(mAfter.x - bAfter.x - (mBefore.x - bBefore.x)),
      `メニューがボタンに水平追従していない ` +
        `(before: button=${JSON.stringify(bBefore)}, menu=${JSON.stringify(mBefore)} / ` +
        `after: button=${JSON.stringify(bAfter)}, menu=${JSON.stringify(mAfter)})`
    ).toBeLessThanOrEqual(TOLERANCE);
    expect(
      Math.abs(mAfter.y - bAfter.y - (mBefore.y - bBefore.y)),
      'メニューがボタンに垂直追従していない（水平スクロール時）'
    ).toBeLessThanOrEqual(TOLERANCE);

    // 追従後も切り取られず全項目が描画されている
    await expectMenuItemsFullyRendered(page, '水平スクロール後');

    // メニュー操作（コピー）を実行 → メニューが閉じ、項目が1件増える
    await openMenu(page).getByRole('menuitem', { name: 'コピー' }).click();
    await expect(rows).toHaveCount(4, { timeout: getTimeout(10000) });
    await expect(openMenu(page)).toHaveCount(0, { timeout: getTimeout(5000) });

    // REQ-46.11: メニュー操作後も表の水平スクロールが機能する
    const afterOperation = await wrapper.evaluate((el: Element) => {
      const style = window.getComputedStyle(el);
      el.scrollLeft = el.scrollWidth - el.clientWidth;
      return {
        overflowX: style.overflowX,
        maxScroll: el.scrollWidth - el.clientWidth,
        scrollLeft: el.scrollLeft,
      };
    });
    expect(
      afterOperation.overflowX,
      'メニュー操作後も itemTableWrapper の水平スクロール（REQ-41）が維持される'
    ).toMatch(/auto|scroll/);
    expect(
      afterOperation.maxScroll,
      'メニュー操作後も表がビューポートを超える幅を保っている（REQ-37）'
    ).toBeGreaterThan(50);
    expect(
      afterOperation.scrollLeft,
      'メニュー操作後も表を水平スクロールできる（REQ-46.11）'
    ).toBeGreaterThan(50);
  });

  // --------------------------------------------------------------------------
  // REQ-46.6 / 46.7: 垂直スクロール追従と固定ヘッダーより前面
  // --------------------------------------------------------------------------
  test('垂直スクロールでメニューがボタンに追従し、固定ヘッダーより前面に表示される (REQ-46.6, 46.7)', async ({
    page,
  }) => {
    await gotoEditPage(page);

    const header = editHeader(page);
    await expect(header).toBeVisible({ timeout: getTimeout(10000) });

    // 前提: ページが垂直スクロール可能であること
    const metrics = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));
    expect(
      metrics.scrollHeight,
      'ページが垂直スクロール可能でない（アサーションが空虚になる）'
    ).toBeGreaterThan(metrics.clientHeight);

    const groupCard = groupCards(page).first();
    const targetRow = groupCard.locator('[data-testid="quantity-item-row"]').first();
    const button = await actionButtonOf(targetRow);
    await expect(button).toBeVisible({ timeout: getTimeout(5000) });
    await button.click();

    await expectMenuPortaledToBody(page, '垂直スクロール前');
    await expectMenuItemsFullyRendered(page, '垂直スクロール前');

    const buttonBefore = (await button.boundingBox()) as Rect;
    const menuBefore = (await openMenu(page).boundingBox()) as Rect;
    expect(buttonBefore, 'アクションボタンの矩形が取得できる必要がある').not.toBeNull();
    expect(menuBefore, 'メニューの矩形が取得できる必要がある').not.toBeNull();

    // 固定ヘッダー（REQ-45: sticky / zIndex 50）の帯へボタンを送り込む。
    // ボタン上端がビューポート上端付近（5px）に来るまでページを垂直スクロールする。
    const headerBox = (await header.boundingBox()) as Rect;
    expect(headerBox, '固定ヘッダーの矩形が取得できる必要がある').not.toBeNull();

    const scrollDelta = buttonBefore.y - 5;
    expect(
      scrollDelta,
      '垂直スクロールの検証にはボタンが画面上部より下にある必要がある'
    ).toBeGreaterThan(0);

    const scrollYBefore = await page.evaluate(() => window.scrollY);
    const scrollYAfter = await page.evaluate((delta: number) => {
      window.scrollBy(0, delta);
      return window.scrollY;
    }, scrollDelta);
    expect(
      Math.abs(scrollYAfter - scrollYBefore - scrollDelta),
      `ページを目的量だけ垂直スクロールできなかった（実スクロール量=${
        scrollYAfter - scrollYBefore
      }, 目標=${scrollDelta}）。ページ下部のコンテンツ量が不足している可能性がある`
    ).toBeLessThanOrEqual(TOLERANCE);

    // 追従を待つ（window scroll → 座標再計算）
    await expect
      .poll(async () => (await openMenu(page).boundingBox())?.y ?? Number.NaN, {
        timeout: getTimeout(10000),
      })
      .toBeLessThan(menuBefore.y - 50);

    const buttonAfter = (await button.boundingBox()) as Rect;
    const menuAfter = (await openMenu(page).boundingBox()) as Rect;

    // メニューはボタンとの相対位置を保ったまま追従する（REQ-46.6）
    expect(
      Math.abs(menuAfter.y - buttonAfter.y - (menuBefore.y - buttonBefore.y)),
      `メニューがボタンに垂直追従していない ` +
        `(before: button=${JSON.stringify(buttonBefore)}, menu=${JSON.stringify(menuBefore)} / ` +
        `after: button=${JSON.stringify(buttonAfter)}, menu=${JSON.stringify(menuAfter)})`
    ).toBeLessThanOrEqual(TOLERANCE);
    expect(
      Math.abs(menuAfter.x - buttonAfter.x - (menuBefore.x - buttonBefore.x)),
      'メニューがボタンに水平追従していない（垂直スクロール時）'
    ).toBeLessThanOrEqual(TOLERANCE);

    // 前提: メニューが固定ヘッダーの帯と実際に重なっていること（REQ-46.7 の検証が空虚にならないこと）
    const headerBoxAfter = (await header.boundingBox()) as Rect;
    const overlapX =
      Math.min(menuAfter.x + menuAfter.width, headerBoxAfter.x + headerBoxAfter.width) -
      Math.max(menuAfter.x, headerBoxAfter.x);
    const overlapY =
      Math.min(menuAfter.y + menuAfter.height, headerBoxAfter.y + headerBoxAfter.height) -
      Math.max(menuAfter.y, headerBoxAfter.y);
    expect(
      overlapX,
      `メニューと固定ヘッダーが水平方向に重なっていない ` +
        `(menu=${JSON.stringify(menuAfter)}, header=${JSON.stringify(headerBoxAfter)})`
    ).toBeGreaterThan(TOLERANCE);
    expect(
      overlapY,
      `メニューと固定ヘッダーが垂直方向に重なっていない ` +
        `(menu=${JSON.stringify(menuAfter)}, header=${JSON.stringify(headerBoxAfter)})`
    ).toBeGreaterThan(TOLERANCE);

    // 重なった状態でも、メニューの各項目が最前面に描画されている（REQ-46.7 / 46.1）
    await expectMenuItemsFullyRendered(page, '固定ヘッダーと重なった状態');
    await expectMenuWithinViewport(page, '垂直スクロール後');
  });

  // --------------------------------------------------------------------------
  // REQ-46.8 / 46.9: 外側クリック・項目選択で閉じる
  // --------------------------------------------------------------------------
  test('メニュー外クリックで閉じ、メニュー項目選択では操作を実行して閉じる (REQ-46.8, 46.9)', async ({
    page,
  }) => {
    await gotoEditPage(page);

    // 最終グループはページ下端に位置し行を画面中央へ寄せられない（メニューがビューポート外へ出る）
    // ため、下方向に十分な余白を持つ先頭グループで検証する。
    const groupCard = groupCards(page).first();
    const rows = groupCard.locator('[data-testid="quantity-item-row"]');
    await expect(rows).toHaveCount(3, { timeout: getTimeout(10000) });

    // --- REQ-46.8: メニュー外クリックで閉じる ---
    const firstButton = await actionButtonOf(rows.first());
    await firstButton.click();
    await expectMenuPortaledToBody(page, '外側クリック前');
    await expectMenuItemsFullyRendered(page, '外側クリック前');

    // メニュー外（数量項目テーブルの左上隅＝メニュー矩形の外側）を実クリックする
    const itemList = groupCard.getByRole('table', { name: '数量項目一覧' });
    await itemList.click({ position: { x: 5, y: 5 } });
    await expect(openMenu(page), 'メニュー外クリックでメニューが閉じる').toHaveCount(0, {
      timeout: getTimeout(5000),
    });

    // --- REQ-46.9: メニュー項目選択で操作を実行して閉じる ---
    const firstRowNameBefore = await rows
      .first()
      .locator('input[id$="-name"]')
      .first()
      .inputValue();

    const buttonAgain = await actionButtonOf(rows.first());
    await buttonAgain.click();
    await expectMenuItemsFullyRendered(page, '項目選択前');

    // 「下へ移動」を選択 → 並び順が入れ替わり、メニューが閉じる
    await openMenu(page).getByRole('menuitem', { name: '下へ移動' }).click();
    await expect(openMenu(page), 'メニュー項目選択でメニューが閉じる').toHaveCount(0, {
      timeout: getTimeout(5000),
    });

    await expect
      .poll(async () => rows.first().locator('input[id$="-name"]').first().inputValue(), {
        timeout: getTimeout(10000),
      })
      .not.toBe(firstRowNameBefore);
  });

  // --------------------------------------------------------------------------
  // クリーンアップ
  // --------------------------------------------------------------------------
  test('作成したプロジェクトを削除する', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('accessToken');
    });

    await loginAsUser(page, 'ADMIN_USER');

    if (testProjectId) {
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const deleteButton = page.getByRole('button', { name: /削除/i }).first();
      if (await deleteButton.isVisible({ timeout: getTimeout(5000) })) {
        await deleteButton.click();
        const confirmButton = page
          .getByTestId('focus-manager-overlay')
          .getByRole('button', { name: /^削除$/i });
        if (await confirmButton.isVisible({ timeout: getTimeout(5000) })) {
          await confirmButton.click();
          await page.waitForLoadState('networkidle');
        }
      }
    }
  });
});
