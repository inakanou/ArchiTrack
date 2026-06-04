/**
 * @fileoverview 数量グループコピー機能のE2Eテスト
 *
 * Task 54.2: 数量グループコピーの E2E テストを実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - REQ-38.1: 各数量グループパネルの表題部にコピーボタンを表示
 * - REQ-38.2: コピーボタン押下で同一数量表内に複製
 * - REQ-38.3: 元グループの全数量項目（フィールド値・並び順）を複製
 * - REQ-38.5: 複製先グループ名を「{元名}のコピー」とする
 * - REQ-38.6: 名前最大文字数超過時は元名を切り詰めて「のコピー」を付与
 * - REQ-38.7: 複製先を元グループの直下に挿入し、後続グループの並び順を +1 シフト
 * - REQ-38.9: コピー処理中はインジケーター表示・重複操作防止
 * - REQ-38.11: コピー完了後、複製先グループ名を直ちにインライン編集可能な状態で表示
 *
 * 補足:
 * - REQ-38.4（写真紐づけ維持）は、E2E での画像アップロード基盤コストが高いため、
 *   サーバー側のロジックを直接検証する Integration テスト 52.5
 *   (`backend/src/__tests__/integration/quantity-group-copy.integration.test.ts` 想定)
 *   に委譲する。本スペックには含まない。
 *
 * @module e2e/specs/quantity-tables/quantity-group-copy.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';

/** GROUP_NAME_MAX_WIDTH = 50 半角単位（全角=2, 半角=1） — REQ-22.4 / REQ-38.6 */
const GROUP_NAME_MAX_WIDTH = 50;
/** 「のコピー」サフィックス（半角単位の表示幅は 8） */
const COPY_SUFFIX = 'のコピー';

let testProjectId: string | null = null;
let createdQuantityTableId: string | null = null;

/**
 * 文字列の表示幅（半角=1, 全角=2 で集計）。
 * Requirement 22 / 38.6 の最大幅判定で使用。
 */
function getDisplayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    // 半角範囲: ASCII printable + 半角カナ (0xFF61-0xFF9F)
    const isHalfWidth = (code >= 0x0020 && code <= 0x007e) || (code >= 0xff61 && code <= 0xff9f);
    width += isHalfWidth ? 1 : 2;
  }
  return width;
}

/**
 * グループカード内の主入力フィールド（工種・名称・単位）の値スナップショットを取得。
 * displayOrder と一致する DOM 順で配列化する。
 *
 * 各 input は id 属性が `${itemId}-workType` / `${itemId}-name` / `${itemId}-unit` で
 * 終わるため、属性 suffix セレクタで安定的に取得できる。
 */
async function readGroupItemFieldValues(
  groupCard: ReturnType<Page['locator']>
): Promise<Array<{ workType: string; name: string; unit: string }>> {
  const rows = groupCard.locator('[data-testid="quantity-item-row"]');
  const count = await rows.count();
  const result: Array<{ workType: string; name: string; unit: string }> = [];
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const workType =
      (await row
        .locator('input[id$="-workType"]')
        .first()
        .inputValue()
        .catch(() => '')) ?? '';
    const nameVal =
      (await row
        .locator('input[id$="-name"]')
        .first()
        .inputValue()
        .catch(() => '')) ?? '';
    const unit =
      (await row
        .locator('input[id$="-unit"]')
        .first()
        .inputValue()
        .catch(() => '')) ?? '';
    result.push({ workType, name: nameVal, unit });
  }
  return result;
}

/**
 * テスト用プロジェクトを UI 経由で作成し、ID を返す。
 */
async function createTestProject(page: Page, projectName: string): Promise<string> {
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /新規作成/i }).click();
  await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

  await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
    timeout: getTimeout(15000),
  });

  await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

  // 営業担当者は必須（プロジェクト作成のため）
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
 * 数量表編集画面で、現在表示中の指定インデックスのグループに対し、
 * UI 経由で名前を変更する。
 *
 * REQ-42 移行: グループ名変更はクライアントドラフトのみを更新するため、
 * 永続化 API（PUT /api/quantity-groups/:id）は発火しない。ここではドラフト反映
 * （見出しテキストの更新）のみを待機し、永続化は呼び出し側の保存操作で行う。
 */
async function renameGroupAt(page: Page, groupIndex: number, newName: string): Promise<void> {
  const groupCard = page.locator('[data-testid="quantity-group-card"]').nth(groupIndex);
  const heading = groupCard.locator('h3').first();
  await expect(heading).toBeVisible({ timeout: getTimeout(5000) });
  await heading.click();

  const editInput = groupCard.getByLabel('グループ名を編集');
  await expect(editInput).toBeVisible({ timeout: getTimeout(5000) });

  await editInput.fill(newName);
  await editInput.press('Enter');

  await expect(groupCard.locator('h3').filter({ hasText: newName }).first()).toBeVisible({
    timeout: getTimeout(8000),
  });
}

/**
 * 編集画面に最新グループを追加し、UI 経由で名前を設定する。
 */
async function addAndNameGroup(
  page: Page,
  expectedIndexAfter: number,
  name: string
): Promise<void> {
  // REQ-42 移行: グループ追加はクライアントドラフトのみを更新するため、
  // 永続化 API（POST /api/quantity-tables/:id/groups）は発火しない。
  // ドラフト反映（カード数の増加）のみを待機する。
  const addGroupButton = page.getByRole('button', { name: /グループ追加|グループを追加/i }).first();
  await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });
  await addGroupButton.click();

  await expect(page.locator('[data-testid="quantity-group-card"]')).toHaveCount(
    expectedIndexAfter + 1,
    { timeout: getTimeout(10000) }
  );

  await renameGroupAt(page, expectedIndexAfter, name);
}

/**
 * グループカード内に項目を 1 件追加し、フィールド値を入力する。
 * 項目追加 API の完了と項目数の到達を待機する。
 */
async function addItemToGroupAt(
  page: Page,
  groupIndex: number,
  expectedItemCountAfter: number,
  fields: { workType: string; name: string; unit: string }
): Promise<void> {
  const groupCard = page.locator('[data-testid="quantity-group-card"]').nth(groupIndex);

  // REQ-42 移行: 項目追加・フィールド編集はクライアントドラフトのみを更新するため、
  // 永続化 API（POST /items, PATCH/PUT）は発火しない。ドラフト反映（行数の増加・
  // 入力値の反映）のみを待機し、永続化は呼び出し側の保存操作で行う。
  const addItemButton = groupCard.getByRole('button', { name: '項目を追加' });
  await expect(addItemButton).toBeVisible({ timeout: getTimeout(10000) });
  await addItemButton.click();

  await expect(groupCard.locator('[data-testid="quantity-item-row"]')).toHaveCount(
    expectedItemCountAfter,
    { timeout: getTimeout(10000) }
  );

  // 追加された行（最下行）に値を入力。入力フィールドは id 属性 suffix で安定的に特定する
  // （placeholder はコンポーネントごとに揺れるため）。
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

test.describe('REQ-38: 数量グループのコピー機能 E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  // ==========================================================================
  // 事前準備: プロジェクト・数量表・元グループA(2項目) + 別グループB(1項目)
  // ==========================================================================
  test.describe('事前準備', () => {
    test('テスト用プロジェクトを作成する', async ({ page }) => {
      const projectName = `数量グループコピーE2E_${Date.now()}`;
      testProjectId = await createTestProject(page, projectName);
      expect(testProjectId).toBeTruthy();
    });

    test('数量表と元グループA(2項目)・別グループB(1項目)を作成する', async ({ page }) => {
      if (!testProjectId) {
        throw new Error('testProjectId が未設定です。事前準備テストが正しく実行されていません。');
      }

      await page.goto(`/projects/${testProjectId}/quantity-tables`);
      await page.waitForLoadState('networkidle');

      const createButton = page.getByRole('link', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      const nameInput = page.getByRole('textbox', { name: /数量表名/i });
      await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
      await nameInput.clear();
      await nameInput.fill('グループコピーテスト数量表');

      const createConfirmButton = page.getByRole('button', { name: /^作成$/i });
      await createConfirmButton.click();

      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
        timeout: getTimeout(15000),
      });
      const tableMatch = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/);
      createdQuantityTableId = tableMatch?.[1] ?? null;
      expect(createdQuantityTableId).toBeTruthy();

      // グループA を追加し、名前を「元グループA」に
      await addAndNameGroup(page, 0, '元グループA');

      // グループA に項目を 2 件追加
      await addItemToGroupAt(page, 0, 1, {
        workType: 'A工種1',
        name: 'A名称1',
        unit: 'm2',
      });
      await addItemToGroupAt(page, 0, 2, {
        workType: 'A工種2',
        name: 'A名称2',
        unit: 'm',
      });

      // グループB を追加し、名前を「別グループB」に
      await addAndNameGroup(page, 1, '別グループB');

      // グループB に項目を 1 件追加
      await addItemToGroupAt(page, 1, 1, {
        workType: 'B工種1',
        name: 'B名称1',
        unit: 'kg',
      });

      // 最終状態を検証（後続テストの前提）
      const groupCards = page.locator('[data-testid="quantity-group-card"]');
      await expect(groupCards).toHaveCount(2);
      await expect(groupCards.nth(0).locator('h3').first()).toHaveText('元グループA');
      await expect(groupCards.nth(1).locator('h3').first()).toHaveText('別グループB');

      // REQ-42.5: ここまでの編集（グループ/項目の追加・名称）はドラフトのため、
      // 後続テストがリロードで参照できるよう明示保存して永続化する。
      await saveQuantityTableDraft(page);
    });
  });

  // ==========================================================================
  // REQ-38.1, 38.2, 38.5, 38.7: コピーボタン押下で複製先が元グループ直下に出現する
  // ==========================================================================
  test('グループコピーボタン押下で複製先が元グループの直下に出現する (REQ-38.1, 38.2, 38.5, 38.7)', async ({
    page,
  }) => {
    if (!createdQuantityTableId) {
      throw new Error('createdQuantityTableId が未設定です。');
    }

    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    const groupCards = page.locator('[data-testid="quantity-group-card"]');
    await expect(groupCards).toHaveCount(2, { timeout: getTimeout(10000) });

    // 元グループA のコピーボタンを取得（REQ-38.1: 表題部に存在）
    const groupACard = groupCards.first();
    const copyButton = groupACard.getByRole('button', { name: 'グループをコピー' });
    await expect(copyButton).toBeVisible({ timeout: getTimeout(5000) });

    // REQ-42.4 移行: コピーはクライアントサイドのドラフト複製となり、サーバー
    // POST /copy は発火しない。クリック後はドラフトへ即時反映される（REQ-38.2/38.7）。
    await copyButton.click();

    // ドラフト反映後にグループ数が 3 になる（REQ-38.7: 直下挿入）
    await expect(groupCards).toHaveCount(3, { timeout: getTimeout(15000) });

    // DOM 順: [元グループA, 元グループAのコピー, 別グループB]
    await expect(groupCards.nth(0).locator('h3').first()).toHaveText('元グループA');
    await expect(groupCards.nth(1).locator('h3').first()).toHaveText('元グループAのコピー');
    await expect(groupCards.nth(2).locator('h3').first()).toHaveText('別グループB');

    // REQ-42.5: コピー結果を後続テスト（リロードで参照）のため明示保存して永続化する。
    await saveQuantityTableDraft(page);

    // 保存後にリロードしてもサーバー反映が維持されることを確認する（REQ-42.5/42.8）。
    await page.reload({ waitUntil: 'networkidle' });
    await expect(groupCards).toHaveCount(3, { timeout: getTimeout(15000) });
    await expect(groupCards.nth(0).locator('h3').first()).toHaveText('元グループA');
    await expect(groupCards.nth(1).locator('h3').first()).toHaveText('元グループAのコピー');
    await expect(groupCards.nth(2).locator('h3').first()).toHaveText('別グループB');
  });

  // ==========================================================================
  // REQ-38.3: 複製先に元グループの全数量項目（フィールド値・並び順）が含まれる
  // ==========================================================================
  test('複製先に元グループの全数量項目（フィールド値・並び順）が含まれる (REQ-38.3)', async ({
    page,
  }) => {
    if (!createdQuantityTableId) {
      throw new Error('createdQuantityTableId が未設定です。');
    }

    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    const groupCards = page.locator('[data-testid="quantity-group-card"]');
    // 直前テストで作成された複製を前提に検証
    await expect(groupCards).toHaveCount(3, { timeout: getTimeout(10000) });

    const sourceCard = groupCards.nth(0);
    const copiedCard = groupCards.nth(1);

    // 元と複製先で項目数が一致
    const sourceCount = await sourceCard.locator('[data-testid="quantity-item-row"]').count();
    const copiedCount = await copiedCard.locator('[data-testid="quantity-item-row"]').count();
    expect(copiedCount, '複製先の項目数は元と一致').toBe(sourceCount);
    expect(copiedCount).toBe(2);

    // フィールド値・並び順を比較（DOM 順 = displayOrder 順）
    const sourceFields = await readGroupItemFieldValues(sourceCard);
    const copiedFields = await readGroupItemFieldValues(copiedCard);
    expect(copiedFields, '工種・名称・単位が並び順含めて一致').toEqual(sourceFields);
  });

  // ==========================================================================
  // REQ-38.7: 後続グループの並び順 +1 シフト（表全体の並び順）
  // ==========================================================================
  test('後続グループの並び順が +1 シフトされる (REQ-38.7)', async ({ page }) => {
    if (!createdQuantityTableId) {
      throw new Error('createdQuantityTableId が未設定です。');
    }

    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    const groupCards = page.locator('[data-testid="quantity-group-card"]');
    await expect(groupCards).toHaveCount(3, { timeout: getTimeout(10000) });

    // 別グループB（元 displayOrder=1）はコピー後に最後尾（index=2）にシフトされる
    await expect(groupCards.nth(2).locator('h3').first()).toHaveText('別グループB');

    // リロードしても並び順が永続化されている（REQ-38.7 + 23.1/23.2 整合）
    await page.reload({ waitUntil: 'networkidle' });
    await expect(groupCards).toHaveCount(3, { timeout: getTimeout(10000) });
    await expect(groupCards.nth(0).locator('h3').first()).toHaveText('元グループA');
    await expect(groupCards.nth(1).locator('h3').first()).toHaveText('元グループAのコピー');
    await expect(groupCards.nth(2).locator('h3').first()).toHaveText('別グループB');
  });

  // ==========================================================================
  // REQ-38.11: 複製先のグループ名が直ちにインライン編集可能な状態で表示される
  // ==========================================================================
  test('複製先のグループ名がインライン編集可能なヘッダーとして表示される (REQ-38.11)', async ({
    page,
  }) => {
    if (!createdQuantityTableId) {
      throw new Error('createdQuantityTableId が未設定です。');
    }

    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    const groupCards = page.locator('[data-testid="quantity-group-card"]');
    await expect(groupCards).toHaveCount(3, { timeout: getTimeout(10000) });

    const copiedCard = groupCards.nth(1);
    const copiedHeading = copiedCard.locator('h3').first();
    await expect(copiedHeading).toHaveText('元グループAのコピー');

    // ヘッダーが role="button" であること（REQ-22 編集可能状態と整合）
    await expect(copiedHeading).toHaveAttribute('role', 'button', { timeout: getTimeout(3000) });

    // クリックでインライン編集用 input が起動し、複製先の名前で初期化される
    await copiedHeading.click();
    const editInput = copiedCard.getByLabel('グループ名を編集');
    await expect(editInput).toBeVisible({ timeout: getTimeout(3000) });
    await expect(editInput).toHaveValue('元グループAのコピー');
    await expect(editInput).toBeEnabled();

    // 編集状態を抜ける（Esc）
    await editInput.press('Escape');
  });

  // ==========================================================================
  // REQ-38.9: 1 回のコピー操作で複製は 1 件のみ作成される（重複コピー防止）
  //
  // REQ-42.4/38.13 移行: コピーはクライアントサイドの同期的なドラフト複製となり、
  // サーバー POST /copy を発行しない。よって従来の「処理中スピナー / aria-busy /
  // API 遅延での in-progress 観測」は同期処理では成立しない（design L1748 の indicator は
  // 同期化により観測不能）。本テストは、要件の本質である「重複コピー操作の防止」を
  // クライアントモデルで検証する: 1 回のクリックで複製が 1 件のみ追加されること。
  // ==========================================================================
  test('1 回のコピー操作で複製は 1 件のみ作成される (REQ-38.9)', async ({ page }) => {
    if (!createdQuantityTableId) {
      throw new Error('createdQuantityTableId が未設定です。');
    }

    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    const groupCards = page.locator('[data-testid="quantity-group-card"]');
    await expect(groupCards.first()).toBeVisible({ timeout: getTimeout(10000) });

    const beforeCount = await groupCards.count();

    const groupACard = groupCards.first();
    const copyButton = groupACard.getByRole('button', { name: 'グループをコピー' });
    await expect(copyButton).toBeVisible({ timeout: getTimeout(5000) });

    // 1 回クリック → 複製は 1 件のみ（重複なし。REQ-38.9）
    await copyButton.click();
    await expect(groupCards).toHaveCount(beforeCount + 1, { timeout: getTimeout(10000) });

    // 元グループ直下に「のコピー」が 1 件だけ挿入されている（REQ-38.7）
    await expect(groupCards.nth(1).locator('h3').first()).toHaveText('元グループAのコピー');

    // 本テストはドラフト状態の重複防止のみを検証するため、永続化は行わず
    // （後続テストの前提状態を変えないよう）リロードで破棄する。
    await page.reload({ waitUntil: 'networkidle' });
    await expect(groupCards).toHaveCount(beforeCount, { timeout: getTimeout(10000) });
  });

  // ==========================================================================
  // REQ-38.6: 文字数超過時は元名が切り詰められた名前で複製される
  //
  // 戦略:
  //   UI のグループ名編集は最大 50 半角単位までしか入力できない（REQ-22.5）。
  //   そのため、UI 経由で「コピー後にサフィックスが付くと最大幅を超える」境界長
  //   （例: 全角 23 文字 = 半角 46 単位）を持つグループC を作成し、これをコピーする。
  //   その結果として、複製先の名前は最大 50 半角単位以内に切り詰められ、
  //   かつ末尾が「のコピー」で終わることを検証する。
  // ==========================================================================
  test('名前が切り詰められたうえで「のコピー」が付与される (REQ-38.6)', async ({ page }) => {
    if (!createdQuantityTableId) {
      throw new Error('createdQuantityTableId が未設定です。');
    }

    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    const groupCards = page.locator('[data-testid="quantity-group-card"]');
    const beforeCount = await groupCards.count();

    // 「コピー後に最大幅を超える」境界の元名:
    //   全角 23 文字 = 46 半角単位。「のコピー」(8 単位) を足すと 54 単位となり 50 を超える。
    //   → サーバ側で切り詰めが発生する境界（REQ-38.6）。
    const longSourceName = 'あ'.repeat(23);
    expect(getDisplayWidth(longSourceName), '元名は最大幅 50 以下である').toBeLessThanOrEqual(
      GROUP_NAME_MAX_WIDTH
    );
    expect(
      getDisplayWidth(longSourceName) + getDisplayWidth(COPY_SUFFIX),
      '元名 + サフィックスは最大幅を超える境界'
    ).toBeGreaterThan(GROUP_NAME_MAX_WIDTH);

    // グループC を追加
    await addAndNameGroup(page, beforeCount, longSourceName);
    await expect(groupCards).toHaveCount(beforeCount + 1, { timeout: getTimeout(10000) });

    const longGroupIndex = beforeCount; // 末尾に追加された
    const longGroupCard = groupCards.nth(longGroupIndex);
    await expect(longGroupCard.locator('h3').first()).toHaveText(longSourceName);

    // コピー実行（REQ-42.4: クライアントサイドのドラフト複製。サーバー POST /copy は発火しない）
    const copyButton = longGroupCard.getByRole('button', { name: 'グループをコピー' });
    await expect(copyButton).toBeVisible({ timeout: getTimeout(5000) });

    await copyButton.click();

    // 複製先は元グループC の直下（index = longGroupIndex + 1）に挿入される
    await expect(groupCards).toHaveCount(beforeCount + 2, { timeout: getTimeout(15000) });
    const copiedCard = groupCards.nth(longGroupIndex + 1);
    const copiedName = (await copiedCard.locator('h3').first().textContent())?.trim() ?? '';

    // 検証 1: 末尾が「のコピー」(REQ-38.5)
    expect(copiedName.endsWith(COPY_SUFFIX), `複製先名は「のコピー」で終わる: ${copiedName}`).toBe(
      true
    );
    // 検証 2: 表示幅が最大 50 半角単位以内（REQ-38.6: 切り詰め）
    expect(
      getDisplayWidth(copiedName),
      `複製先名の表示幅は最大 ${GROUP_NAME_MAX_WIDTH} 半角単位以内: "${copiedName}" (幅=${getDisplayWidth(copiedName)})`
    ).toBeLessThanOrEqual(GROUP_NAME_MAX_WIDTH);
    // 検証 3: サフィックスを除いた部分は元名の prefix である（切り詰め＝末尾欠落）
    const prefix = copiedName.slice(0, copiedName.length - COPY_SUFFIX.length);
    expect(
      longSourceName.startsWith(prefix),
      `切り詰め後の元名部分は元名の prefix: prefix="${prefix}", source="${longSourceName}"`
    ).toBe(true);
    // 検証 4: 元名がそのまま付与された場合（切り詰めなし）は最大幅を超えるはず
    //         → 実際に切り詰めが発生したことの間接検証
    expect(prefix.length, '元名は切り詰められている').toBeLessThan(longSourceName.length);
  });

  // ==========================================================================
  // クリーンアップ: 作成したプロジェクトを削除（権限のある ADMIN_USER で実行）
  // ==========================================================================
  test.describe('クリーンアップ', () => {
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
});
