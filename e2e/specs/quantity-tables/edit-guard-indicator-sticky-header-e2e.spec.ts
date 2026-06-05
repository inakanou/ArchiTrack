/**
 * @fileoverview 離脱ガード・未保存インジケーター・固定ヘッダーの E2E テスト
 *
 * Task 63.3: 離脱ガード・未保存インジケーター・固定ヘッダーの E2E を実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - REQ-43.1: 未保存変更がある状態でのアプリ内遷移に対し離脱確認を表示する
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
 * 注記:
 * - react-router の useBlocker はアプリ内（クライアントサイド）ナビゲーションのみを
 *   インターセプトする。ブラウザのリロード/タブクローズ（beforeunload）の標準ダイアログは
 *   Playwright で安定して検証できないため、本スペックでは扱わない（REQ-43.2 は対象外）。
 * - 離脱確認ダイアログは UnsavedChangesDialog（タイトル「変更が保存されていません」、
 *   「ページを離れる」「このページにとどまる」ボタン）で実装されている。
 *
 * @module e2e/specs/quantity-tables/edit-guard-indicator-sticky-header-e2e.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';

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
      const hasDeleteButton = await deleteButton.isVisible({ timeout: 5000 });
      if (hasDeleteButton) {
        await deleteButton.click();
        const confirmButton = page
          .getByTestId('focus-manager-overlay')
          .getByRole('button', { name: /^削除$/i });
        const hasConfirmButton = await confirmButton.isVisible({ timeout: 5000 });
        if (hasConfirmButton) {
          await confirmButton.click();
          await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
        }
      }
    }
  });
});
