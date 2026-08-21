/**
 * @fileoverview 数量グループ・数量項目の並び順管理 E2Eテスト (REQ-23, REQ-24)
 *
 * Requirements coverage:
 * - @requirement quantity-table-generation/REQ-23.1: 数量グループ並び順を保持
 * - @requirement quantity-table-generation/REQ-23.2: 保持された並び順で表示
 * - @requirement quantity-table-generation/REQ-23.3: 「上へ移動」ボタン
 * - @requirement quantity-table-generation/REQ-23.4: 「下へ移動」ボタン
 * - @requirement quantity-table-generation/REQ-23.5: 最上位の上へ移動が無効
 * - @requirement quantity-table-generation/REQ-23.6: 最下位の下へ移動が無効
 * - @requirement quantity-table-generation/REQ-23.7: 並び順変更を保存
 * - @requirement quantity-table-generation/REQ-23.8: 1グループ時に両方無効
 * - @requirement quantity-table-generation/REQ-24.1: 項目並び順を保持
 * - @requirement quantity-table-generation/REQ-24.2: 保持された並び順で表示
 * - @requirement quantity-table-generation/REQ-24.3: 項目「上へ移動」
 * - @requirement quantity-table-generation/REQ-24.4: 項目「下へ移動」
 * - @requirement quantity-table-generation/REQ-24.5: 最上位項目で上へ移動が無効
 * - @requirement quantity-table-generation/REQ-24.6: 最下位項目で下へ移動が無効
 * - @requirement quantity-table-generation/REQ-24.7: 項目並び順変更を保存
 * - @requirement quantity-table-generation/REQ-24.8: 1項目時に両方無効
 *
 * @module e2e/specs/quantity-tables/group-sort-e2e.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { assertPrepared } from '../../helpers/preconditions';
import {
  addQuantityGroup,
  addQuantityItemRows,
  createTestQuantityTable,
} from '../../helpers/quantity-table-preconditions';

let testProjectId: string | null = null;
let createdQuantityTableId: string | null = null;

/**
 * 事前準備で作成する数量グループの件数。
 *
 * REQ-23.3〜23.7 の並び替えは「複数のグループがある」ことを前提とするため、
 * 各テストはこの件数が揃っていることを無条件に主張してから判定へ進む。
 * 揃っていなければ前提が崩れた地点で失敗する（黙って抜ける経路を持たせない）。
 */
const PREPARED_GROUP_COUNT = 2;

/**
 * 事前準備で1つ目の数量グループへ作成する数量項目の件数。
 *
 * REQ-24.3〜24.7 の並び替えは「複数の項目がある」ことを前提とする。
 */
const PREPARED_ITEM_COUNT = 2;

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

test.describe('REQ-23, REQ-24: 数量グループ・項目の並び順管理', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * 事前準備: テスト用プロジェクト・数量表・グループ・項目を作成
   *
   * REQ-23/24 のテストはグループ2件以上、および項目2件以上のグループの存在を
   * 前提とするため、独立して実行できるよう事前にデータを作成する。
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

      const projectName = `REQ23_24_PJ_${Date.now()}`;
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

    test('テスト用数量表とグループ2件・項目2件を作成する', async ({ page }) => {
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
      await nameInput.fill(`REQ23_24_数量表_${Date.now()}`);

      const createConfirmButton = page.getByRole('button', { name: /^作成$/i });
      await createConfirmButton.click();

      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
        timeout: getTimeout(15000),
      });
      const tableMatch = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/);
      createdQuantityTableId = tableMatch?.[1] ?? null;
      expect(createdQuantityTableId).toBeTruthy();

      // グループを2つ追加（REQ-23 のテストは2グループ以上を前提）。
      // 各グループに固有の名前を付与する：REQ-23.7 でグループ並び順変更を検証する際、
      // 名前が空だと表示名が位置ベースの「グループ N」にフォールバックするため、
      // 入れ替えを判定できなくなる。
      // REQ-42 移行: グループ追加・名称変更・項目追加はクライアントドラフトのみを
      // 更新するため、永続化 API（POST /groups, PUT /quantity-groups, POST /items）は
      // 発火しない。ドラフト反映（カード数・見出し・行数）のみを待機し、
      // すべての編集後にまとめて明示保存する。
      const groupNameSuffix = Date.now();
      for (let i = 0; i < PREPARED_GROUP_COUNT; i++) {
        const addGroupButton = page
          .getByRole('button', { name: /グループ追加|グループを追加/i })
          .first();
        await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });
        await addGroupButton.click();

        // 追加完了の同期：グループ数が i+1 件に達するのを待機
        await expect(page.locator('[data-testid="quantity-group-card"]')).toHaveCount(i + 1, {
          timeout: getTimeout(10000),
        });

        // 追加したグループに固有の名前を付与する
        const targetGroupCard = page.locator('[data-testid="quantity-group-card"]').nth(i);
        const groupNameHeading = targetGroupCard.locator('h3').first();
        await expect(groupNameHeading).toBeVisible({ timeout: getTimeout(5000) });
        await groupNameHeading.click();

        const editInput = targetGroupCard.getByLabel('グループ名を編集');
        await expect(editInput).toBeVisible({ timeout: getTimeout(5000) });

        const uniqueName = `REQ23_24_G${i + 1}_${groupNameSuffix}`;
        await editInput.fill(uniqueName);
        await editInput.press('Enter');

        // h3 に固有の名前が反映されるのを待機
        await expect(
          targetGroupCard.locator('h3').filter({ hasText: uniqueName }).first()
        ).toBeVisible({
          timeout: getTimeout(8000),
        });
      }

      // 1つ目のグループに項目を2つ追加（REQ-24 のテストは2項目以上を前提）
      const firstGroupCard = page.locator('[data-testid="quantity-group-card"]').first();
      for (let i = 0; i < PREPARED_ITEM_COUNT; i++) {
        const addItemButton = firstGroupCard.getByRole('button', { name: '項目を追加' });
        await expect(addItemButton).toBeVisible({ timeout: getTimeout(10000) });
        await addItemButton.click();

        await expect(firstGroupCard.locator('[data-testid="quantity-item-row"]')).toHaveCount(
          i + 1,
          { timeout: getTimeout(10000) }
        );
      }

      // REQ-42.5: 後続テスト（リロードで並び順の永続化を検証）の前提として、
      // ここまでのドラフト編集を明示保存して永続化する。
      // 項目名が空のままだと保存時の整合性チェックで弾かれるため、各項目に名称を付与する。
      const itemRows = firstGroupCard.locator('[data-testid="quantity-item-row"]');
      const itemCount = await itemRows.count();
      for (let i = 0; i < itemCount; i++) {
        const nameInput = itemRows.nth(i).locator('input[id$="-name"]').first();
        await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
        await nameInput.fill(`REQ24_item_${i + 1}_${groupNameSuffix}`);
        await nameInput.blur();
      }

      await saveQuantityTableDraft(page);
    });
  });

  test.describe('REQ-23: 数量グループの並び順管理', () => {
    /**
     * @requirement quantity-table-generation/REQ-23.1: グループ並び順をデータとして保持
     * @requirement quantity-table-generation/REQ-23.2: 保持された並び順で表示
     *
     * 数量表を再表示しても、データに保持された並び順でグループが順番通り表示される。
     */
    test('数量表を再表示してもグループの並び順が保持されている (REQ-23.1, REQ-23.2)', async ({
      page,
    }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      // 事前準備が用意した数量グループが揃っていることを前提として主張する。
      // 「無ければ編集画面の表示だけ見て抜ける」形では、前提が崩れた瞬間に
      // REQ-23 の判定が丸ごと消える（AI運用7原則 第3原則）。
      const groupCards = page.locator('[data-testid="quantity-group-card"]');
      await expect(groupCards, '前提: 事前準備で作成した数量グループが表示される').toHaveCount(
        PREPARED_GROUP_COUNT,
        { timeout: getTimeout(10000) }
      );
      const initialCount = PREPARED_GROUP_COUNT;

      const initialNames: string[] = [];
      for (let i = 0; i < initialCount; i++) {
        const name = await groupCards.nth(i).locator('h3').first().textContent();
        initialNames.push((name ?? '').trim());
      }

      // 再読み込み（並び順がDBに保持されていることを検証）
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForLoadState('networkidle');

      const reloadedCount = await groupCards.count();
      expect(reloadedCount, '再表示後もグループ数は同じ').toBe(initialCount);

      for (let i = 0; i < reloadedCount; i++) {
        const name = await groupCards.nth(i).locator('h3').first().textContent();
        expect((name ?? '').trim(), `グループ${i}の表示順が保持される`).toBe(initialNames[i]);
      }
    });

    /**
     * @requirement quantity-table-generation/REQ-23.3: 上へ移動ボタン
     * @requirement quantity-table-generation/REQ-23.4: 下へ移動ボタン
     */
    test('数量グループに「上へ移動」「下へ移動」ボタンが表示される (REQ-23.3, REQ-23.4)', async ({
      page,
    }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
      await expect(groupCard, '前提: 事前準備で作成した数量グループが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // ヘッダー直下の SortOrderButtons を取得（最初の sort-order-buttons はグループ用）
      const sortButtons = groupCard.locator('[data-testid="sort-order-buttons"]').first();
      await expect(sortButtons).toBeVisible({ timeout: getTimeout(5000) });

      const upButton = sortButtons.getByRole('button', { name: '上へ移動' });
      const downButton = sortButtons.getByRole('button', { name: '下へ移動' });
      await expect(upButton).toBeVisible({ timeout: getTimeout(3000) });
      await expect(downButton).toBeVisible({ timeout: getTimeout(3000) });
    });

    /**
     * @requirement quantity-table-generation/REQ-23.5: 最上位グループの上へ移動が無効
     */
    test('最上位グループの「上へ移動」がdisabledである (REQ-23.5)', async ({ page }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const firstGroup = page.locator('[data-testid="quantity-group-card"]').first();
      await expect(firstGroup, '前提: 事前準備で作成した数量グループが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      const sortButtons = firstGroup.locator('[data-testid="sort-order-buttons"]').first();
      await expect(sortButtons).toBeVisible({ timeout: getTimeout(5000) });

      const upButton = sortButtons.getByRole('button', { name: '上へ移動' });
      await expect(upButton).toBeDisabled({ timeout: getTimeout(3000) });
    });

    /**
     * @requirement quantity-table-generation/REQ-23.6: 最下位グループの下へ移動が無効
     */
    test('最下位グループの「下へ移動」がdisabledである (REQ-23.6)', async ({ page }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const lastGroup = page.locator('[data-testid="quantity-group-card"]').last();
      await expect(lastGroup, '前提: 事前準備で作成した数量グループが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      const sortButtons = lastGroup.locator('[data-testid="sort-order-buttons"]').first();
      await expect(sortButtons).toBeVisible({ timeout: getTimeout(5000) });

      const downButton = sortButtons.getByRole('button', { name: '下へ移動' });
      await expect(downButton).toBeDisabled({ timeout: getTimeout(3000) });
    });

    /**
     * @requirement quantity-table-generation/REQ-23.7: 並び順変更を保存
     *
     * 並び順変更ボタンを押すと displayOrder の更新APIが呼ばれ、変更が即座に反映される。
     */
    test('グループの並び順変更操作後、画面上の並び順が変わる (REQ-23.7)', async ({ page }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const groupCards = page.locator('[data-testid="quantity-group-card"]');
      // REQ-23.7 の並び替えは2件以上のグループを前提とする。
      await expect(groupCards, '前提: 並び替えに必要な数量グループが揃っている').toHaveCount(
        PREPARED_GROUP_COUNT,
        { timeout: getTimeout(10000) }
      );

      // 元の並び順（事前準備がグループごとに固有の名前を付けている）
      const beforeFirstName = (
        await groupCards.first().locator('h3').first().textContent()
      )?.trim();
      const beforeSecondName = (
        await groupCards.nth(1).locator('h3').first().textContent()
      )?.trim();
      // 名前が取れていなければ入れ替えを判定できない。空も含めてここで失敗させる。
      assertPrepared(beforeFirstName, '1番目の数量グループの表示名');
      assertPrepared(beforeSecondName, '2番目の数量グループの表示名');

      // 1番目のグループの「下へ移動」をクリック
      const firstSortButtons = groupCards
        .first()
        .locator('[data-testid="sort-order-buttons"]')
        .first();
      const downButton = firstSortButtons.getByRole('button', { name: '下へ移動' });

      // グループが2件ある以上、1番目の「下へ移動」は必ず活性である（REQ-23.6 が
      // 無効化するのは最下位のグループだけ）。以前は活性を観測して分岐しており、
      // 無効になっていれば並び替えの判定が丸ごと消えていた。
      await expect(
        downButton,
        'REQ-23.4: 1番目のグループの「下へ移動」が無効になっている'
      ).toBeEnabled({ timeout: getTimeout(5000) });

      await downButton.click();

      // 並び順が入れ替わる（REQ-23.7）。並び替えはクライアントドラフトを更新する
      // （REQ-42.1）ため、画面上の順序で判定し、後続テストは開き直しで元の順序に戻る。
      await expect(
        groupCards.first().locator('h3').first(),
        'REQ-23.7: 下へ移動しても1番目のグループが入れ替わらない'
      ).toHaveText(beforeSecondName, { timeout: getTimeout(10000) });
      await expect(
        groupCards.nth(1).locator('h3').first(),
        'REQ-23.7: 下へ移動した1番目のグループが2番目に来ない'
      ).toHaveText(beforeFirstName, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement quantity-table-generation/REQ-23.8: 1グループ時に両方無効
     */
    test('グループが1つしか存在しない場合、両方のボタンが無効化される (REQ-23.8)', async ({
      page,
    }) => {
      // 以前はグループ数を観測し「1件なら両方無効・複数なら最上位と最下位が無効・
      // 0件なら編集画面が出ていること」の三分岐で判定していた。共有の数量表は事前準備で
      // 2件のグループを持つため、REQ-23.8（1件のとき両方無効）は一度も実行されていない。
      // 本判定が要求する「グループが1件だけ」の状態を専用の数量表として自分で用意する。
      assertPrepared(testProjectId, '事前準備で作成したプロジェクトのID');
      await createTestQuantityTable(page, testProjectId, 'REQ23_8_単一グループ');
      await addQuantityGroup(page);

      const groupCards = page.locator('[data-testid="quantity-group-card"]');
      await expect(groupCards, '前提: 数量グループが1件だけ存在する').toHaveCount(1, {
        timeout: getTimeout(10000),
      });

      const sortButtons = groupCards.first().locator('[data-testid="sort-order-buttons"]').first();
      await expect(sortButtons).toBeVisible({ timeout: getTimeout(5000) });

      await expect(
        sortButtons.getByRole('button', { name: '上へ移動' }),
        'REQ-23.8: グループが1件のとき「上へ移動」が無効になっていない'
      ).toBeDisabled();
      await expect(
        sortButtons.getByRole('button', { name: '下へ移動' }),
        'REQ-23.8: グループが1件のとき「下へ移動」が無効になっていない'
      ).toBeDisabled();
    });
  });

  test.describe('REQ-24: 数量項目の並び順管理', () => {
    /**
     * @requirement quantity-table-generation/REQ-24.1: 項目並び順をデータとして保持
     * @requirement quantity-table-generation/REQ-24.2: 保持された並び順で表示
     */
    test('数量項目の並び順がリロード後も保持されている (REQ-24.1, REQ-24.2)', async ({ page }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const itemRows = page.locator('[data-testid="quantity-item-row"]');
      await expect(itemRows, '前提: 事前準備で作成した数量項目が表示される').toHaveCount(
        PREPARED_ITEM_COUNT,
        { timeout: getTimeout(10000) }
      );
      const count = PREPARED_ITEM_COUNT;

      // 各項目の name 入力値を取得
      const initialNames: string[] = [];
      for (let i = 0; i < count; i++) {
        const text = (await itemRows.nth(i).textContent()) ?? '';
        initialNames.push(text.trim());
      }

      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForLoadState('networkidle');

      const reloadedCount = await itemRows.count();
      expect(reloadedCount, '再表示後も項目数は同じ').toBe(count);
      for (let i = 0; i < reloadedCount; i++) {
        const text = ((await itemRows.nth(i).textContent()) ?? '').trim();
        expect(text, `項目${i}の並び順が保持される`).toBe(initialNames[i]);
      }
    });

    /**
     * @requirement quantity-table-generation/REQ-24.3: 項目「上へ移動」
     * @requirement quantity-table-generation/REQ-24.4: 項目「下へ移動」
     *
     * 数量項目はアクションメニュー内に「上へ移動」「下へ移動」を統合する（REQ-36準拠）。
     */
    test('数量項目のアクションメニューに「上へ移動」「下へ移動」が含まれる (REQ-24.3, REQ-24.4)', async ({
      page,
    }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const itemRow = page.locator('[data-testid="quantity-item-row"]').first();
      await expect(itemRow, '前提: 事前準備で作成した数量項目の行が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      const actionButton = itemRow.getByRole('button', { name: 'アクション' });
      await expect(actionButton).toBeVisible({ timeout: getTimeout(3000) });
      await actionButton.click();

      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible({ timeout: getTimeout(3000) });
      await expect(menu.getByText('上へ移動')).toBeVisible({ timeout: getTimeout(2000) });
      await expect(menu.getByText('下へ移動')).toBeVisible({ timeout: getTimeout(2000) });

      // メニューを閉じる
      await page.locator('body').click({ position: { x: 5, y: 5 } });
    });

    /**
     * @requirement quantity-table-generation/REQ-24.5: 最上位項目で上へ移動が無効
     */
    test('最上位項目のアクションメニュー「上へ移動」が無効化される (REQ-24.5)', async ({
      page,
    }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const itemRow = page.locator('[data-testid="quantity-item-row"]').first();
      await expect(itemRow, '前提: 事前準備で作成した数量項目の行が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      const actionButton = itemRow.getByRole('button', { name: 'アクション' });
      await actionButton.click();

      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible({ timeout: getTimeout(3000) });

      const moveUpItem = menu.getByRole('menuitem', { name: /上へ移動/ });
      await expect(moveUpItem).toBeDisabled({ timeout: getTimeout(3000) });

      await page.locator('body').click({ position: { x: 5, y: 5 } });
    });

    /**
     * @requirement quantity-table-generation/REQ-24.6: 最下位項目で下へ移動が無効
     */
    test('最下位項目のアクションメニュー「下へ移動」が無効化される (REQ-24.6)', async ({
      page,
    }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const itemRows = page.locator('[data-testid="quantity-item-row"]');
      await expect(itemRows, '前提: 事前準備で作成した数量項目が表示される').toHaveCount(
        PREPARED_ITEM_COUNT,
        { timeout: getTimeout(10000) }
      );

      const lastRow = itemRows.last();
      const actionButton = lastRow.getByRole('button', { name: 'アクション' });
      await actionButton.click();

      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible({ timeout: getTimeout(3000) });

      const moveDownItem = menu.getByRole('menuitem', { name: /下へ移動/ });
      await expect(moveDownItem).toBeDisabled({ timeout: getTimeout(3000) });

      await page.locator('body').click({ position: { x: 5, y: 5 } });
    });

    /**
     * @requirement quantity-table-generation/REQ-24.7: 項目並び順変更を保存
     *
     * 項目並び順変更操作後、表示されている順番が変わる。
     */
    test('項目アクションメニューから「下へ移動」で並び順が変わる (REQ-24.7)', async ({ page }) => {
      const navigated = await navigateToQuantityTableEdit(page);
      expect(navigated).toBeTruthy();

      const itemRows = page.locator('[data-testid="quantity-item-row"]');
      // REQ-24.7 の並び替えは2件以上の数量項目を前提とする。
      await expect(itemRows, '前提: 並び替えに必要な数量項目が揃っている').toHaveCount(
        PREPARED_ITEM_COUNT,
        { timeout: getTimeout(10000) }
      );

      // 各項目の入力 id 属性は `${item.id}-<field>` という構造で、
      // 項目に紐づく安定識別子として利用できる。
      // テキスト内容は空のデフォルト値だと両項目で同一になり得るため、
      // input の id 属性で入れ替えを判定する。
      const beforeFirstInputId = await itemRows.first().locator('input').first().getAttribute('id');
      expect(beforeFirstInputId, '項目行の入力に id 属性が存在する').toBeTruthy();
      const beforeSecondInputId = await itemRows.nth(1).locator('input').first().getAttribute('id');
      expect(beforeSecondInputId, '2番目の項目行の入力に id 属性が存在する').toBeTruthy();

      const firstActionButton = itemRows.first().getByRole('button', { name: 'アクション' });
      await firstActionButton.click();

      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible({ timeout: getTimeout(3000) });

      // 項目が2件ある以上、1番目の「下へ移動」は必ず活性である（REQ-24.6 が無効化するのは
      // 最下位の項目だけ）。以前は活性を観測して分岐しており、無効になっていれば
      // メニューを閉じるだけで並び替えの判定が丸ごと消えていた。
      const moveDownItem = menu.getByRole('menuitem', { name: /下へ移動/ });
      await expect(
        moveDownItem,
        'REQ-24.4: 1番目の項目の「下へ移動」が無効になっている'
      ).toBeEnabled({ timeout: getTimeout(3000) });

      await moveDownItem.click();

      // 並び順が入れ替わったことを検証（REQ-24.7）。並び替えはクライアントドラフトを
      // 更新する（REQ-42.1）ため、後続テストは開き直しで元の順序に戻る。
      await expect
        .poll(async () => await itemRows.first().locator('input').first().getAttribute('id'), {
          timeout: getTimeout(10000),
        })
        .toBe(beforeSecondInputId);
      expect(
        await itemRows.nth(1).locator('input').first().getAttribute('id'),
        'REQ-24.7: 下へ移動した項目が2番目に来ない'
      ).toBe(beforeFirstInputId);
    });

    /**
     * @requirement quantity-table-generation/REQ-24.8: 1項目時に両方無効
     */
    test('項目が1つのみのグループでは両方の移動メニューが無効化される (REQ-24.8)', async ({
      page,
    }) => {
      // 以前は「項目数が1のグループを探し、見つかれば主張する。見つからなければ
      // 先頭項目の『上へ移動』が無効であることで代替する。項目が0件なら編集画面の表示だけ
      // 見る」という形だった。共有の数量表は1つ目のグループに2件・2つ目のグループに0件を
      // 持つため、項目数1のグループは存在せず、REQ-24.8 は一度も実行されていない。
      // 本判定が要求する「グループに項目が1件だけ」の状態を専用の数量表として用意する。
      assertPrepared(testProjectId, '事前準備で作成したプロジェクトのID');
      await createTestQuantityTable(page, testProjectId, 'REQ24_8_単一項目');
      const groupCard = await addQuantityGroup(page);
      const items = await addQuantityItemRows(groupCard, 1);

      await expect(items, '前提: 数量項目が1件だけ存在する').toHaveCount(1, {
        timeout: getTimeout(10000),
      });

      const actionButton = items.first().getByRole('button', { name: 'アクション' });
      await actionButton.click();

      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible({ timeout: getTimeout(3000) });

      await expect(
        menu.getByRole('menuitem', { name: /上へ移動/ }),
        'REQ-24.8: 項目が1件のとき「上へ移動」が無効になっていない'
      ).toBeDisabled();
      await expect(
        menu.getByRole('menuitem', { name: /下へ移動/ }),
        'REQ-24.8: 項目が1件のとき「下へ移動」が無効になっていない'
      ).toBeDisabled();

      await page.locator('body').click({ position: { x: 5, y: 5 } });
    });
  });
});
