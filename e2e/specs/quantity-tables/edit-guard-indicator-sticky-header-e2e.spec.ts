/**
 * @fileoverview 離脱ガード・未保存インジケーター・固定ヘッダーの E2E テスト
 *
 * Task 63.3: 離脱ガード・未保存インジケーター・固定ヘッダーの E2E を実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - REQ-43.1: 未保存変更がある状態でのアプリ内遷移に対し離脱確認を表示する
 * - REQ-43.2: 未保存変更がある状態のタブクローズ・リロードに対しブラウザ標準の離脱確認を表示する
 * - REQ-43.3: 離脱確認で「とどまる」を選ぶと編集画面と未保存状態を維持する
 * - REQ-43.4: 離脱確認で「離脱」を選ぶと画面遷移を実行する
 * - REQ-43.5: 未保存変更がない状態では離脱時に警告を表示しない（保存後の素通り遷移で検証）
 * - REQ-43.6: 保存完了後（未保存変更がなくなった後）はアプリ内遷移で警告を表示しない
 * - REQ-44.1: 未保存変更がある間、未保存インジケーターを表示する
 * - REQ-44.2: 未保存変更がない状態では未保存インジケーターを表示しない（編集前の初期状態で検証）
 * - REQ-44.3: 編集操作により未保存変更が発生するとインジケーターを表示状態に更新する
 * - REQ-44.4: 保存操作が正常に完了したとき、未保存インジケーターを非表示にする
 * - REQ-45.1: 垂直スクロール時もヘッダー操作ボタン群を画面内に常に表示する（固定表示）
 * - REQ-45.2: ヘッダーをビューポート上部に固定（スティッキー）し、スクロールに追従させない
 * - REQ-45.3: 固定表示中も編集領域がヘッダーに恒久的に隠されずスクロール・操作可能を維持する
 * - REQ-45.4: 固定ヘッダー内に未保存変更インジケーター（REQ-44）を両立表示する
 *
 * Task 115.46: 狭幅（幅375）でヘッダー操作群が画面幅を超えないことを実ブラウザで検証する。
 * ヘッダーの固定は垂直方向のみのため、水平スクロールが生じると横へスクロールした時点で
 * 固定ヘッダーの操作ボタン群が画面外へ出る。REQ-45.1 の「常に画面内に表示」は狭幅でも
 * 成立する必要があり、単体テスト（jsdom）はレイアウト計算を行わないため検出できない。
 *
 * 注記:
 * - react-router の useBlocker はアプリ内（クライアントサイド）ナビゲーションのみを
 *   インターセプトする。ブラウザのリロード/タブクローズ（beforeunload）は別経路であり、
 *   Task 100.13 でシナリオ7として本スペックに加えた（それまで REQ-43.2 は除外台帳に
 *   在籍していたが、実際には本番の結線が欠けており実装自体が存在しなかった）。
 * - 離脱確認ダイアログは UnsavedChangesDialog（タイトル「変更が保存されていません」、
 *   「ページを離れる」「このページにとどまる」ボタン）で実装されている。
 *
 * @module e2e/specs/quantity-tables/edit-guard-indicator-sticky-header-e2e.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { selectFirstRealOption } from '../../helpers/form-preconditions';

const RUN_ID = Date.now();

let testProjectId: string | null = null;

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
  const match = page.url().match(/\/projects\/([0-9a-f-]+)$/);
  const projectId = match?.[1] ?? null;
  expect(projectId).toBeTruthy();
  return projectId as string;
}

/**
 * 新規数量表を作成して編集画面へ遷移し、数量表 ID を返す。
 */
async function createQuantityTable(page: Page, tableName: string): Promise<string> {
  await page.goto(`/projects/${testProjectId}/quantity-tables`);
  await page.waitForLoadState('networkidle');

  const createButton = page.getByRole('link', { name: /新規作成/i });
  await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
  await createButton.click();

  const nameInput = page.getByRole('textbox', { name: /数量表名/i });
  await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
  await nameInput.clear();
  await nameInput.fill(tableName);

  await page.getByRole('button', { name: /^作成$/i }).click();

  await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
    timeout: getTimeout(15000),
  });
  const tableMatch = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/);
  const tableId = tableMatch?.[1] ?? null;
  expect(tableId).toBeTruthy();
  return tableId as string;
}

/**
 * グループを1件追加する（クライアントドラフトのみ更新＝未保存変更が発生する）。
 */
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
 * 保存検証用に妥当な項目を作るための補助（丸め設定はデフォルト 0.01 のまま）。
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

/**
 * 狭幅ビューポート（スマートフォン想定）。
 * ヘッダー操作群が画面幅を超えるかどうかの検証に用いる。
 */
const NARROW_VIEWPORT = { width: 375, height: 812 } as const;

/**
 * ページ全体・編集画面ヘッダーの水平方向のはみ出しを実ブラウザ上で計測する。
 *
 * overflow による内部スクロール領域（REQ-41 の水平スクロール等）の中身は
 * ページ全体の水平スクロールを生じさせないため、診断一覧からは除外する。
 */
async function measureHorizontalOverflow(page: Page): Promise<{
  docScrollWidth: number;
  docClientWidth: number;
  headerScrollWidth: number;
  headerClientWidth: number;
  overflowingElements: { tag: string; testId: string; right: number; text: string }[];
}> {
  return page.evaluate(() => {
    const header = document.querySelector('[data-testid="quantity-table-edit-header"]');
    if (!header) {
      throw new Error('編集画面ヘッダーが見つかりません');
    }

    const clientWidth = document.documentElement.clientWidth;

    /** 祖先に水平スクロール領域を持つ（＝はみ出しが内部で吸収される）要素か */
    const isClippedByAncestor = (element: Element): boolean => {
      let current = element.parentElement;
      while (current && current !== document.body) {
        const overflowX = window.getComputedStyle(current).overflowX;
        if (overflowX !== 'visible') {
          return true;
        }
        current = current.parentElement;
      }
      return false;
    };

    const overflowingElements = Array.from(document.querySelectorAll('body *'))
      .filter((element) => element.getBoundingClientRect().right > clientWidth + 1)
      .filter((element) => !isClippedByAncestor(element))
      .slice(0, 10)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        testId: element.getAttribute('data-testid') ?? '',
        right: Math.round(element.getBoundingClientRect().right),
        text: (element.textContent ?? '').trim().slice(0, 24),
      }));

    return {
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: clientWidth,
      headerScrollWidth: header.scrollWidth,
      headerClientWidth: header.clientWidth,
      overflowingElements,
    };
  });
}

const editHeader = (page: Page) => page.getByTestId('quantity-table-edit-header');
const unsavedBadge = (page: Page) => page.getByTestId('unsaved-changes-badge');
const leaveDialogTitle = (page: Page) =>
  page.getByRole('heading', { name: '変更が保存されていません' });
const leaveButton = (page: Page) => page.getByRole('button', { name: 'ページを離れる' });
const stayButton = (page: Page) => page.getByRole('button', { name: 'このページにとどまる' });
// パンくずの「数量表一覧」リンクはアプリ内（react-router Link）ナビゲーション。
// useBlocker でインターセプトされる導線として使用する。
const breadcrumbListLink = (page: Page) => page.getByRole('link', { name: '数量表一覧' }).first();

// ============================================================================
// テスト
// ============================================================================

test.describe('REQ-43/44/45: 離脱ガード・未保存インジケーター・固定ヘッダー E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  // --------------------------------------------------------------------------
  // 事前準備
  // --------------------------------------------------------------------------
  test('テスト用プロジェクトを作成する', async ({ page }) => {
    testProjectId = await createTestProject(page, `離脱ガードE2E_${RUN_ID}`);
    expect(testProjectId).toBeTruthy();
  });

  // --------------------------------------------------------------------------
  // シナリオ1: 未保存インジケーターの表示／非表示 (REQ-44.1/44.4)
  // --------------------------------------------------------------------------
  test('編集すると未保存インジケーターが表示され、保存すると消える', async ({ page }) => {
    if (!testProjectId) {
      throw new Error('testProjectId が未設定です。前段のテストが実行されていません。');
    }

    await createQuantityTable(page, `インジケーター数量表_${RUN_ID}`);

    // 初期状態（編集なし）ではインジケーターは表示されない（REQ-44.2 前提）
    await expect(unsavedBadge(page)).toHaveCount(0);

    // 編集（グループ追加）で未保存変更が発生 → インジケーター表示 (REQ-44.1)
    await addGroup(page, 1);
    await addItemToGroupAt(page, 0, 1, { workType: '工種A', name: '名称A', unit: 'm2' });

    const badge = unsavedBadge(page);
    await expect(badge).toBeVisible({ timeout: getTimeout(10000) });
    await expect(badge).toHaveText(/未保存の変更があります/);
    await expect(badge).toHaveAttribute('role', 'status');

    // 保存成功でインジケーターが消える (REQ-44.4)
    await saveQuantityTableDraft(page);
    await expect(unsavedBadge(page)).toHaveCount(0, { timeout: getTimeout(10000) });
  });

  // --------------------------------------------------------------------------
  // シナリオ2: 離脱ガード — 「とどまる」で留まり未保存状態を維持 (REQ-43.1/43.3)
  // --------------------------------------------------------------------------
  test('未保存状態でアプリ内遷移すると確認が出て「とどまる」で留まり編集を維持する', async ({
    page,
  }) => {
    if (!testProjectId) {
      throw new Error('testProjectId が未設定です。');
    }

    const tableId = await createQuantityTable(page, `離脱ガード留まる数量表_${RUN_ID}`);

    // 未保存変更を作る
    await addGroup(page, 1);
    await expect(unsavedBadge(page)).toBeVisible({ timeout: getTimeout(10000) });

    // アプリ内遷移（パンくず「数量表一覧」リンク）を試みる → 離脱確認が表示される (REQ-43.1)
    await breadcrumbListLink(page).click();
    await expect(leaveDialogTitle(page)).toBeVisible({ timeout: getTimeout(10000) });

    // 「このページにとどまる」で編集画面に留まる (REQ-43.3)
    await stayButton(page).click();
    await expect(leaveDialogTitle(page)).toHaveCount(0, { timeout: getTimeout(10000) });

    // 編集画面のままで（URL が edit のまま）、未保存状態・編集内容が維持されている
    await expect(page).toHaveURL(new RegExp(`/quantity-tables/${tableId}/edit$`));
    await expect(page.locator('[data-testid="quantity-group-card"]')).toHaveCount(1);
    await expect(unsavedBadge(page)).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // シナリオ3: 離脱ガード — 「離脱」で遷移する (REQ-43.4)
  // --------------------------------------------------------------------------
  test('未保存状態で離脱確認の「ページを離れる」を選ぶと遷移する', async ({ page }) => {
    if (!testProjectId) {
      throw new Error('testProjectId が未設定です。');
    }

    await createQuantityTable(page, `離脱ガード離脱数量表_${RUN_ID}`);

    // 未保存変更を作る
    await addGroup(page, 1);
    await expect(unsavedBadge(page)).toBeVisible({ timeout: getTimeout(10000) });

    // アプリ内遷移を試みる → 離脱確認が表示される (REQ-43.1)
    await breadcrumbListLink(page).click();
    await expect(leaveDialogTitle(page)).toBeVisible({ timeout: getTimeout(10000) });

    // 「ページを離れる」で実際に遷移する (REQ-43.4)
    await leaveButton(page).click();
    await page.waitForURL(new RegExp(`/projects/${testProjectId}/quantity-tables$`), {
      timeout: getTimeout(15000),
    });
    await expect(page).toHaveURL(new RegExp(`/projects/${testProjectId}/quantity-tables$`));
  });

  // --------------------------------------------------------------------------
  // シナリオ4: 保存後はアプリ内遷移で確認が出ない (REQ-43.6)
  // --------------------------------------------------------------------------
  test('保存後はアプリ内遷移で離脱確認が表示されず素通りで遷移する', async ({ page }) => {
    if (!testProjectId) {
      throw new Error('testProjectId が未設定です。');
    }

    await createQuantityTable(page, `保存後素通り数量表_${RUN_ID}`);

    // 編集 → 保存して未保存変更をなくす
    await addGroup(page, 1);
    await addItemToGroupAt(page, 0, 1, { workType: '工種B', name: '名称B', unit: 'm' });
    await saveQuantityTableDraft(page);
    await expect(unsavedBadge(page)).toHaveCount(0, { timeout: getTimeout(10000) });

    // 保存後のアプリ内遷移では離脱確認が出ず、そのまま遷移する (REQ-43.6)
    await breadcrumbListLink(page).click();
    await page.waitForURL(new RegExp(`/projects/${testProjectId}/quantity-tables$`), {
      timeout: getTimeout(15000),
    });
    // 念のため離脱ダイアログが現れていないことを確認
    await expect(leaveDialogTitle(page)).toHaveCount(0);
  });

  // --------------------------------------------------------------------------
  // シナリオ5: 固定ヘッダー — 下方向スクロールしてもヘッダー操作ボタン群が常に表示 (REQ-45.1)
  // --------------------------------------------------------------------------
  test('ページを下方向へスクロールしてもヘッダー操作ボタン群が常に表示される', async ({ page }) => {
    if (!testProjectId) {
      throw new Error('testProjectId が未設定です。');
    }

    await createQuantityTable(page, `固定ヘッダー数量表_${RUN_ID}`);

    // ページがビューポートを超える高さになるよう十分なグループ・項目をシードする。
    // （スクロール不能だとアサーションが空虚になるため必ずコンテンツ高を稼ぐ）
    const GROUP_COUNT = 6;
    const ITEMS_PER_GROUP = 3;
    for (let g = 0; g < GROUP_COUNT; g++) {
      await addGroup(page, g + 1);
      for (let i = 0; i < ITEMS_PER_GROUP; i++) {
        await addItemToGroupAt(page, g, i + 1, {
          workType: `工種${g}-${i}`,
          name: `名称${g}-${i}`,
          unit: 'm2',
        });
      }
    }

    const header = editHeader(page);
    await expect(header).toBeVisible({ timeout: getTimeout(10000) });

    // 前提検証: コンテンツ高さがビューポートを超えており実際にスクロール可能であること
    const scrollMetrics = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));
    expect(
      scrollMetrics.scrollHeight,
      'コンテンツ高さがビューポートを超えていない（スクロール不能でアサーションが空虚）'
    ).toBeGreaterThan(scrollMetrics.clientHeight);

    // 下方向へ大きくスクロールする
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: getTimeout(10000) })
      .toBeGreaterThan(0);

    // スクロール後もヘッダーは表示され、上端がビューポート上部付近に固定されている (REQ-45.1, 45.2)
    await expect(header).toBeInViewport();
    const box = await header.boundingBox();
    expect(box, 'ヘッダーの bounding box が取得できない').not.toBeNull();
    // sticky top:0 のためヘッダー上端はビューポート最上部付近に張り付く
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeLessThan(120);

    // 主要操作ボタン（保存）がスクロール後も表示・操作可能 (REQ-45.1)
    const saveButton = header.getByRole('button', { name: '保存' });
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeInViewport();

    // インポート・PDF出力・グループを追加もヘッダー内に表示される (REQ-45.1, 45.4)
    await expect(header.getByRole('button', { name: 'インポート' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'PDF出力' })).toBeVisible();
    await expect(header.getByRole('button', { name: /グループを追加/ })).toBeVisible();
    // 未保存インジケーターも固定ヘッダー内に表示される (REQ-45.4 / REQ-44.1)
    await expect(header.getByTestId('unsaved-changes-badge')).toBeVisible();

    // REQ-45.3: 固定ヘッダー下でも編集領域（最後のグループカード）が恒久的に隠されず、
    // ビューポート内に表示され操作可能な状態を維持する。
    const lastGroupCard = page.locator('[data-testid="quantity-group-card"]').last();
    await expect(lastGroupCard).toBeInViewport();
    // 編集領域として操作可能（項目追加ボタンが見えている）
    await expect(lastGroupCard.getByRole('button', { name: '項目を追加' })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // シナリオ6: 狭幅ビューポートでヘッダー操作群が画面幅に収まる (REQ-45.1, 45.2, 45.3, 45.4)
  //
  // ヘッダーの固定は垂直方向のみ（position: sticky / top: 0）であり、ページに水平方向の
  // スクロールが生じると、横へスクロールした時点で固定ヘッダーの操作ボタン群も
  // 画面外へ出てしまう。したがって「常に画面内に表示する」(REQ-45.1) を狭幅でも
  // 成立させるには、ヘッダー操作群が画面幅に収まっていることが必要条件となる。
  //
  // 単体テスト（jsdom）はレイアウトを計算せず scrollWidth が常に 0 になるため、
  // この検証は実ブラウザでのみ成立する。
  // --------------------------------------------------------------------------
  test('幅375でもヘッダー操作群が画面幅に収まりページに横スクロールが生じない', async ({
    page,
  }) => {
    if (!testProjectId) {
      throw new Error('testProjectId が未設定です。前段のテストが実行されていません。');
    }

    await page.setViewportSize({ width: NARROW_VIEWPORT.width, height: NARROW_VIEWPORT.height });

    // 数量表名には RUN_ID（13桁の数字）を付けない。パンくずは共有コンポーネントであり、
    // 途中で改行できない長大な英数字の連なりを含む名称では狭幅で自らはみ出す。
    // それは本タスクの境界（数量表の編集画面の見出し）の外側にある別事象であり、
    // 混入させるとヘッダーの収まりを測れなくなるため、現実的な長さの名称を用いる。
    await createQuantityTable(page, '狭幅ヘッダー数量表');

    // 編集領域を伴う実際の状態で検証する（空表示のままでは検証が現実の使用状態から乖離する）
    await addGroup(page, 1);
    await addItemToGroupAt(page, 0, 1, { workType: '工種N', name: '名称N', unit: 'm2' });

    const header = editHeader(page);
    await expect(header).toBeVisible({ timeout: getTimeout(10000) });

    // 前提検証: ビューポート幅が意図した狭幅になっていること
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(viewportWidth, 'ビューポート幅が 375 に設定されていない').toBe(NARROW_VIEWPORT.width);

    const metrics = await measureHorizontalOverflow(page);

    // REQ-45.1: ページ全体に水平スクロールが生じない
    // （生じると横スクロール時に固定ヘッダーの操作ボタン群が画面外へ出る）
    expect(
      metrics.docScrollWidth,
      `幅${NARROW_VIEWPORT.width}でページ全体に横方向のスクロールが生じている` +
        `（内容の幅 ${metrics.docScrollWidth} > 表示幅 ${metrics.docClientWidth}）。` +
        `画面幅を超える要素: ${JSON.stringify(metrics.overflowingElements)}`
    ).toBeLessThanOrEqual(metrics.docClientWidth);

    // REQ-45.1: ヘッダー自身の内容も表示幅に収まる（操作群が右へはみ出していない）
    expect(
      metrics.headerScrollWidth,
      `ヘッダーの内容が表示幅を超えている` +
        `（内容の幅 ${metrics.headerScrollWidth} > 表示幅 ${metrics.headerClientWidth}）`
    ).toBeLessThanOrEqual(metrics.headerClientWidth);

    // 挙動としての確認: 右方向へスクロールを試みても実際には移動しない
    await page.evaluate(() => window.scrollTo(document.documentElement.scrollWidth, 0));
    const scrollXAfterAttempt = await page.evaluate(() => window.scrollX);
    expect(scrollXAfterAttempt, '右方向へのスクロールが発生している').toBe(0);

    // REQ-45.1, 45.4: 狭幅でもヘッダー操作ボタン群と未保存インジケーターが画面内に見えている
    await expect(header.getByRole('button', { name: 'インポート' })).toBeInViewport();
    await expect(header.getByRole('button', { name: 'PDF出力' })).toBeInViewport();
    await expect(header.getByRole('button', { name: '保存' })).toBeInViewport();
    await expect(header.getByRole('button', { name: /グループを追加/ })).toBeInViewport();
    await expect(header.getByTestId('bulk-create-from-survey-button')).toBeInViewport();
    await expect(header.getByTestId('unsaved-changes-badge')).toBeInViewport();

    // REQ-45.2: 狭幅でも垂直スクロールに追従せずビューポート上部に固定される
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: getTimeout(10000) })
      .toBeGreaterThan(0);
    const headerBoxAfterScroll = await header.boundingBox();
    expect(headerBoxAfterScroll, 'ヘッダーの bounding box が取得できない').not.toBeNull();
    expect(headerBoxAfterScroll!.y).toBeGreaterThanOrEqual(0);
    expect(headerBoxAfterScroll!.y).toBeLessThan(120);

    // REQ-45.3: 折り返しでヘッダーが縦に伸びても編集領域が恒久的に隠されない
    expect(
      headerBoxAfterScroll!.height,
      `ヘッダーの高さ ${headerBoxAfterScroll!.height} がビューポート高さの半分を超え、` +
        `編集領域の可視域が確保できていない`
    ).toBeLessThan(NARROW_VIEWPORT.height / 2);
    const groupCard = page.locator('[data-testid="quantity-group-card"]').last();
    await expect(groupCard).toBeInViewport();
    await expect(groupCard.getByRole('button', { name: '項目を追加' })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // シナリオ7: タブクローズ/リロードに対するブラウザ標準の離脱確認 (REQ-43.2)
  // --------------------------------------------------------------------------
  /**
   * REQ-43.2 の条文は「タブ/ウィンドウを閉じる操作またはリロード操作に対して**ブラウザ標準の
   * 離脱確認を表示する**」である。本判定は、その帰結そのもの——ブラウザが標準の離脱確認を
   * 実際に提示し、取り消せば画面に留まること——を観測する。
   *
   * 観測の設計（なぜこの形か）:
   * - `page.close({ runBeforeUnload: true })` はタブを閉じる操作そのものであり、ページが
   *   beforeunload の既定動作を抑止していれば Chromium は標準の離脱確認を提示する。
   *   Playwright はそれを `dialog` イベント（`type() === 'beforeunload'`）として渡すため、
   *   「利用者に確認が出た」ことを直接観測できる。`dismiss()` は確認の取り消し（留まる）に
   *   あたり、実際にタブが閉じずに編集画面が残ることまで確かめられる。
   * - `window.dispatchEvent(new Event('beforeunload'))` の合成イベントで
   *   `defaultPrevented` を見る形（construction-photo / site-survey の先例）は「ページが
   *   確認を要求したか」までしか測れず、条文の帰結である「ブラウザが確認を表示する」からは
   *   一段遠い。本判定はより近い側を採る。
   * - 限界: OS/ブラウザが描画する確認ダイアログの**文面やボタン配置**は Chromium が決める
   *   ため観測・検証の対象にしない。確認が提示されたこと・取り消しで留まること・未保存が
   *   無ければ提示されないことまでを判定範囲とする。
   *
   * 陰性対照は同一テスト内に置く: 保存して未保存変更を解消したのち同じ操作を行い、確認が
   * 提示されず（`dialog` イベント 0 件）タブがそのまま閉じることを確かめる（REQ-43.5/43.6）。
   * これが無いと「常に確認が出る実装」でも本判定は緑になりうる。
   *
   * @requirement quantity-table-generation/REQ-43.2
   */
  test('未保存状態でタブを閉じるとブラウザ標準の離脱確認が出て、取り消すと画面に留まる', async ({
    page,
  }) => {
    if (!testProjectId) {
      throw new Error('testProjectId が未設定です。');
    }

    const tableId = await createQuantityTable(page, `標準離脱確認数量表_${RUN_ID}`);

    // 観測したブラウザ標準ダイアログを記録する。取り消し（dismiss）＝「留まる」。
    const browserDialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      browserDialogs.push(dialog.type());
      await dialog.dismiss();
    });

    // 未保存変更を作る（保存可能な項目まで埋める。後段で保存して陰性対照に移るため）
    await addGroup(page, 1);
    await addItemToGroupAt(page, 0, 1, { workType: '工種C', name: '名称C', unit: 'm3' });
    await expect(unsavedBadge(page)).toBeVisible({ timeout: getTimeout(10000) });

    // REQ-43.2: タブを閉じる操作に対してブラウザ標準の離脱確認が提示される
    await page.close({ runBeforeUnload: true });
    await expect
      .poll(() => browserDialogs, { timeout: getTimeout(10000) })
      .toEqual(['beforeunload']);

    // 確認を取り消した（dismiss）ので、タブは閉じず編集画面と未保存状態が維持される
    expect(page.isClosed()).toBe(false);
    await expect(page).toHaveURL(new RegExp(`/quantity-tables/${tableId}/edit$`));
    await expect(unsavedBadge(page)).toBeVisible();

    // 陰性対照（REQ-43.5/43.6）: 保存して未保存変更が無くなれば確認は提示されない
    await saveQuantityTableDraft(page);
    await expect(unsavedBadge(page)).toHaveCount(0, { timeout: getTimeout(10000) });

    const dialogCountBeforeCleanClose = browserDialogs.length;
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => page.isClosed(), { timeout: getTimeout(10000) }).toBe(true);
    expect(browserDialogs.length).toBe(dialogCountBeforeCleanClose);
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
      const hasDeleteButton = await isVisibleWithin(deleteButton, 5000);
      if (hasDeleteButton) {
        await deleteButton.click();
        const confirmButton = page
          .getByTestId('focus-manager-overlay')
          .getByRole('button', { name: /^削除$/i });
        const hasConfirmButton = await isVisibleWithin(confirmButton, 5000);
        if (hasConfirmButton) {
          await confirmButton.click();
          await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
        }
      }
    }
  });
});
