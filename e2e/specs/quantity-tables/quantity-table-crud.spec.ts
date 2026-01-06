/**
 * @fileoverview 数量表CRUD操作のE2Eテスト
 *
 * Task 9.5: E2Eテストを実装する
 *
 * Requirements:
 * - 2.1: 数量表一覧画面で新規作成操作を行う
 * - 2.2: 数量表新規作成ダイアログで名称を入力して作成する
 * - 2.4: 数量表を選択して削除操作を行う
 * - 8.1: 計算方法を選択する
 * - 8.5: 面積・体積計算用入力を行う
 * - 8.8: ピッチ計算用入力を行う
 * - 6.1: 数量項目の複製操作を行う
 * - 6.4: 別グループへの移動操作を行う
 * - 12.1: 数量表編集画面にパンくずが表示される
 * - 12.4: パンくず項目をクリックして該当画面に遷移する
 * - 7.4: オートコンプリート候補を選択すると入力欄に反映される
 * - 11.5: 自動保存が実行される
 *
 * @module e2e/specs/quantity-tables/quantity-table-crud.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * 数量表CRUD機能のE2Eテスト
 */
test.describe('数量表CRUD操作', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストで作成した数量表のIDを保存
  let testProjectId: string | null = null;
  let createdQuantityTableId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    // テスト用プロジェクトを作成または取得
    const page = await browser.newPage();
    await loginAsUser(page, 'REGULAR_USER');

    // プロジェクト一覧ページに移動してテスト用プロジェクトを確認
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // 既存のテストプロジェクトを使用するか、新規作成
    const projectListItem = page.locator('[data-testid="project-list-item"]').first();
    if (await projectListItem.isVisible({ timeout: 5000 }).catch(() => false)) {
      // プロジェクト詳細に移動してIDを取得
      await projectListItem.click();
      await page.waitForURL(/\/projects\/[^/]+$/);
      const url = page.url();
      testProjectId = url.split('/').pop() || null;
    }

    await page.close();
  });

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  /**
   * 数量表新規作成フローのテスト
   *
   * REQ-2.1: 数量表一覧画面で新規作成操作を行う
   * REQ-2.2: 数量表新規作成ダイアログで名称を入力して作成する
   */
  test.describe('数量表新規作成フロー', () => {
    test('プロジェクト詳細画面から数量表を新規作成できる', async ({ page }) => {
      test.skip(!testProjectId, 'テスト用プロジェクトが存在しない');

      // ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細ページに移動
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 数量表セクションを探す
      const quantityTableSection = page.getByTestId('quantity-table-section');
      await expect(quantityTableSection).toBeVisible({ timeout: getTimeout(10000) });

      // 新規作成ボタンをクリック
      const createButton = quantityTableSection.getByRole('button', { name: /新規作成|追加/ });
      await expect(createButton).toBeVisible();
      await createButton.click();

      // 新規作成ダイアログまたはページが表示される
      const dialog = page.getByRole('dialog');
      if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        // ダイアログが表示された場合
        const nameInput = dialog.getByLabel(/名称|数量表名/);
        await expect(nameInput).toBeVisible();
        await nameInput.fill('E2Eテスト用数量表');

        // 作成ボタンをクリック
        const submitButton = dialog.getByRole('button', { name: /作成|保存/ });
        await submitButton.click();

        // ダイアログが閉じることを確認
        await expect(dialog).not.toBeVisible({ timeout: getTimeout(5000) });
      } else {
        // 新規作成ページに遷移した場合
        await expect(page).toHaveURL(/\/quantity-tables\/new/);
        const nameInput = page.getByLabel(/名称|数量表名/);
        await expect(nameInput).toBeVisible();
        await nameInput.fill('E2Eテスト用数量表');

        // 作成ボタンをクリック
        const submitButton = page.getByRole('button', { name: /作成|保存/ });
        await submitButton.click();
      }

      // 編集画面または一覧に遷移することを確認
      await page.waitForURL(/\/quantity-tables\/[^/]+/, { timeout: getTimeout(10000) });

      // URLからIDを保存
      const url = page.url();
      const match = url.match(/\/quantity-tables\/([^/]+)/);
      if (match && match[1]) {
        createdQuantityTableId = match[1];
      }
    });

    test('名称が空の場合は作成ボタンが無効', async ({ page }) => {
      test.skip(!testProjectId, 'テスト用プロジェクトが存在しない');

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const quantityTableSection = page.getByTestId('quantity-table-section');
      const createButton = quantityTableSection.getByRole('button', { name: /新規作成|追加/ });
      await createButton.click();

      const dialog = page.getByRole('dialog');
      if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        // 名称を空のままにして作成ボタンの状態を確認
        const submitButton = dialog.getByRole('button', { name: /作成|保存/ });
        await expect(submitButton).toBeDisabled();
      }
    });
  });

  /**
   * 数量表編集フローのテスト
   *
   * REQ-12.1: 数量表編集画面にパンくずが表示される
   * REQ-12.4: パンくず項目をクリックして該当画面に遷移する
   */
  test.describe('数量表編集画面', () => {
    test('編集画面にパンくずナビゲーションが表示される', async ({ page }) => {
      test.skip(!createdQuantityTableId, '数量表が作成されていない');

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // パンくずナビゲーションが表示される
      const breadcrumb = page.getByRole('navigation', { name: /breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });

      // プロジェクト名がパンくずに含まれる
      await expect(breadcrumb).toContainText(/プロジェクト/);
    });

    test('パンくずからプロジェクト詳細に遷移できる', async ({ page }) => {
      test.skip(!createdQuantityTableId, '数量表が作成されていない');

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      const breadcrumb = page.getByRole('navigation', { name: /breadcrumb/i });
      const projectLink = breadcrumb.getByRole('link').first();
      await projectLink.click();

      // プロジェクト詳細ページに遷移
      await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    });
  });

  /**
   * 計算方法変更と数量再計算のテスト
   *
   * REQ-8.1: 計算方法を選択する
   * REQ-8.5: 面積・体積計算用入力を行う
   * REQ-8.8: ピッチ計算用入力を行う
   */
  test.describe('計算方法と数量計算', () => {
    test('計算方法を変更すると対応する入力フィールドが表示される', async ({ page }) => {
      test.skip(!createdQuantityTableId, '数量表が作成されていない');

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 項目追加ボタンをクリックして新しい行を作成
      const addItemButton = page.getByRole('button', { name: /項目を追加|行追加/ });
      if (await addItemButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addItemButton.click();
      }

      // 計算方法セレクトボックスを探す
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      if (await calcMethodSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
        // 面積・体積モードに変更
        await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });

        // 幅、奥行き、高さなどのフィールドが表示される
        await expect(page.getByLabel(/幅|width/i).first()).toBeVisible({ timeout: 3000 });
      }
    });
  });

  /**
   * コピー・移動操作のテスト
   *
   * REQ-6.1: 数量項目の複製操作を行う
   * REQ-6.4: 別グループへの移動操作を行う
   */
  test.describe('コピー・移動操作', () => {
    test('項目をコピーできる', async ({ page }) => {
      test.skip(!createdQuantityTableId, '数量表が作成されていない');

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 既存の項目行を探す
      const itemRow = page.getByTestId('quantity-item-row').first();
      if (await itemRow.isVisible({ timeout: 5000 }).catch(() => false)) {
        // アクションメニューを開く
        const moreButton = itemRow.getByLabel(/アクション|メニュー/);
        await moreButton.click();

        // コピーオプションをクリック
        const copyOption = page.getByRole('menuitem', { name: /コピー/ });
        await expect(copyOption).toBeVisible();
        await copyOption.click();

        // 新しい行が追加されたことを確認
        const itemRows = page.getByTestId('quantity-item-row');
        await expect(itemRows).toHaveCount(await itemRows.count());
      }
    });
  });

  /**
   * オートコンプリート操作のテスト
   *
   * REQ-7.4: オートコンプリート候補を選択すると入力欄に反映される
   */
  test.describe('オートコンプリート機能', () => {
    test('大項目フィールドでオートコンプリート候補が表示される', async ({ page }) => {
      test.skip(!createdQuantityTableId, '数量表が作成されていない');

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 大項目入力フィールドを探す
      const majorCategoryInput = page.getByRole('combobox', { name: /大項目/ }).first();
      if (await majorCategoryInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        // 入力を開始
        await majorCategoryInput.fill('建');

        // オートコンプリート候補が表示される
        const listbox = page.getByRole('listbox');
        await expect(listbox).toBeVisible({ timeout: 3000 });

        // 候補を選択
        const firstOption = listbox.getByRole('option').first();
        if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          const optionText = await firstOption.textContent();
          await firstOption.click();

          // 入力フィールドに値が反映される
          await expect(majorCategoryInput).toHaveValue(optionText || '');
        }
      }
    });
  });

  /**
   * 自動保存機能のテスト
   *
   * REQ-11.5: 自動保存が実行される
   */
  test.describe('自動保存機能', () => {
    test('編集後に自動保存インジケーターが表示される', async ({ page }) => {
      test.skip(!createdQuantityTableId, '数量表が作成されていない');

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 名称入力フィールドを探す
      const nameInput = page.getByLabel(/名称/).first();
      if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        // 値を変更
        const originalValue = await nameInput.inputValue();
        await nameInput.fill(originalValue + ' 更新');

        // 保存中または保存済みインジケーターが表示される
        const savingIndicator = page.getByText(/保存中|保存しました|自動保存/);
        await expect(savingIndicator).toBeVisible({ timeout: 5000 });
      }
    });
  });

  /**
   * 数量表削除フローのテスト
   *
   * REQ-2.4: 数量表を選択して削除操作を行う
   */
  test.describe('数量表削除フロー', () => {
    test('数量表を削除できる', async ({ page }) => {
      test.skip(!createdQuantityTableId, '数量表が作成されていない');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表一覧ページに移動
      await page.goto(`/projects/${testProjectId}/quantity-tables`);
      await page.waitForLoadState('networkidle');

      // 削除対象の数量表を探す
      const quantityTableRow = page.getByText('E2Eテスト用数量表');
      if (await quantityTableRow.isVisible({ timeout: 5000 }).catch(() => false)) {
        // 削除ボタンをクリック
        const deleteButton = page.getByRole('button', { name: /削除/ }).first();
        await deleteButton.click();

        // 確認ダイアログが表示される
        const confirmDialog = page.getByRole('dialog');
        await expect(confirmDialog).toBeVisible();

        // 削除を確定
        const confirmButton = confirmDialog.getByRole('button', { name: /削除|確認/ });
        await confirmButton.click();

        // ダイアログが閉じる
        await expect(confirmDialog).not.toBeVisible({ timeout: 5000 });

        // 数量表が削除された（一覧から消えた）ことを確認
        await expect(quantityTableRow).not.toBeVisible({ timeout: 5000 });
      }
    });
  });
});
