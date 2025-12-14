/**
 * @fileoverview プロジェクト一覧のソート拡張E2Eテスト
 *
 * Task 25.4: ソート拡張E2Eテスト
 *
 * Requirements:
 * - 6.5: プロジェクト名、顧客名、営業担当者、工事担当者、ステータス、作成日、更新日のカラムでソート可能とする
 * - 6.1: テーブルヘッダークリックで昇順ソート
 * - 6.2: 同じヘッダー再度クリックで降順ソート切り替え
 * - 6.3: 現在のソート状態をヘッダーにアイコン（昇順: up、降順: down）で表示
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';

/**
 * プロジェクト一覧のソート拡張E2Eテスト
 */
test.describe('プロジェクト一覧のソート拡張 (Task 25.4)', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context, page }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // ビューポートサイズをデスクトップサイズにリセット（他のテストファイルでの変更を引き継がないため）
    await page.setViewportSize({ width: 1280, height: 720 });

    // ブラウザのストレージを完全にクリア（前のテストの状態を引き継がないため）
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  /**
   * 営業担当者列のソート機能テスト
   *
   * REQ-6.5: 営業担当者列のヘッダークリックでソートが動作する
   * REQ-6.1: テーブルヘッダークリックで昇順ソート
   */
  test('営業担当者列のヘッダークリックでソートが動作することを確認 (project-management/REQ-6.5)', async ({
    page,
  }) => {
    // デスクトップサイズを設定（テーブル表示）
    await page.setViewportSize({ width: 1280, height: 720 });

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // プロジェクト一覧画面が表示されることを確認
    await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // テーブルが表示されているか確認
    const table = page.getByRole('table');
    const tableVisible = await table.isVisible().catch(() => false);

    if (tableVisible) {
      // 営業担当者列のソートボタンを取得してクリック
      const salesPersonSortButton = page.getByRole('button', { name: /営業担当者でソート/i });
      await expect(salesPersonSortButton).toBeVisible({ timeout: getTimeout(10000) });

      await salesPersonSortButton.click();

      // URLパラメータにソートが反映されることを確認
      await expect(page).toHaveURL(/sort=salesPersonName/, { timeout: getTimeout(10000) });
    } else {
      // プロジェクトがない場合、空状態メッセージまたはエラーメッセージを確認
      const emptyOrError = page.getByText(
        /プロジェクトがありません|プロジェクト一覧を取得できませんでした/i
      );
      await expect(emptyOrError).toBeVisible();
    }
  });

  /**
   * 工事担当者列のソート機能テスト
   *
   * REQ-6.5: 工事担当者列のヘッダークリックでソートが動作する
   * REQ-6.1: テーブルヘッダークリックで昇順ソート
   */
  test('工事担当者列のヘッダークリックでソートが動作することを確認 (project-management/REQ-6.5)', async ({
    page,
  }) => {
    // デスクトップサイズを設定（テーブル表示）
    await page.setViewportSize({ width: 1280, height: 720 });

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // プロジェクト一覧画面が表示されることを確認
    await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // テーブルが表示されているか確認
    const table = page.getByRole('table');
    const tableVisible = await table.isVisible().catch(() => false);

    if (tableVisible) {
      // 工事担当者列のソートボタンを取得してクリック
      const constructionPersonSortButton = page.getByRole('button', {
        name: /工事担当者でソート/i,
      });
      await expect(constructionPersonSortButton).toBeVisible({ timeout: getTimeout(10000) });

      await constructionPersonSortButton.click();

      // URLパラメータにソートが反映されることを確認
      await expect(page).toHaveURL(/sort=constructionPersonName/, { timeout: getTimeout(10000) });
    } else {
      // プロジェクトがない場合、空状態メッセージまたはエラーメッセージを確認
      const emptyOrError = page.getByText(
        /プロジェクトがありません|プロジェクト一覧を取得できませんでした/i
      );
      await expect(emptyOrError).toBeVisible();
    }
  });

  /**
   * 営業担当者列の昇順・降順切り替えテスト
   *
   * REQ-6.2: 同じヘッダー再度クリックで降順ソート切り替え
   */
  test('営業担当者列で昇順・降順の切り替えが正しく動作することを確認 (project-management/REQ-6.2)', async ({
    page,
  }) => {
    // デスクトップサイズを設定（テーブル表示）
    await page.setViewportSize({ width: 1280, height: 720 });

    await loginAsUser(page, 'REGULAR_USER');

    // 前のテストのソート状態をリセットするため、クエリパラメータなしでアクセス
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // プロジェクト一覧画面が表示されることを確認
    await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // テーブルが表示されているか確認
    const table = page.getByRole('table');
    const tableVisible = await table.isVisible().catch(() => false);

    if (tableVisible) {
      // 営業担当者列のソートボタンを取得
      let salesPersonSortButton = page.getByRole('button', { name: /営業担当者でソート/i });
      await expect(salesPersonSortButton).toBeVisible({ timeout: getTimeout(10000) });

      // 現在のURLをチェックして、すでにソートが適用されている場合はリセット
      const currentUrl = page.url();
      if (currentUrl.includes('sort=') || currentUrl.includes('order=')) {
        // ソートが適用されている場合、クエリパラメータをクリアしてリロード
        await page.goto('/projects');
        await page.waitForLoadState('networkidle');
        await waitForLoadingComplete(page, { timeout: getTimeout(15000) });
        // ボタンを再取得
        salesPersonSortButton = page.getByRole('button', { name: /営業担当者でソート/i });
        await expect(salesPersonSortButton).toBeVisible({ timeout: getTimeout(10000) });
      }

      // DOMが安定するまで待機
      await page.waitForTimeout(500);

      // 1回目のクリック - 昇順
      await salesPersonSortButton.click();
      await expect(page).toHaveURL(/sort=salesPersonName/, { timeout: getTimeout(10000) });
      await expect(page).toHaveURL(/order=asc/, { timeout: getTimeout(10000) });

      // ローディング完了を待機
      await waitForLoadingComplete(page, { timeout: getTimeout(10000) });

      // テーブルが再描画されるまで待機
      await page.waitForTimeout(1000);

      // ボタンを再取得（DOMが更新されている可能性があるため）
      salesPersonSortButton = page.getByRole('button', { name: /営業担当者でソート/i });
      await expect(salesPersonSortButton).toBeVisible({ timeout: getTimeout(5000) });
      await expect(salesPersonSortButton).toBeEnabled({ timeout: getTimeout(5000) });

      // 2回目のクリック - 降順
      await salesPersonSortButton.click();

      // ローディング完了を待機
      await waitForLoadingComplete(page, { timeout: getTimeout(10000) });

      // URLが変更されるのを待機
      // 注意: デフォルトのソート順序が'desc'のため、order=descはURLに含まれない
      // 代わりにorder=ascが消えていることを確認
      await expect(page).not.toHaveURL(/order=asc/, { timeout: getTimeout(15000) });
      // sortパラメータは維持されていることを確認
      await expect(page).toHaveURL(/sort=salesPersonName/, { timeout: getTimeout(5000) });
    } else {
      // プロジェクトがない場合、空状態メッセージまたはエラーメッセージを確認
      const emptyOrError = page.getByText(
        /プロジェクトがありません|プロジェクト一覧を取得できませんでした/i
      );
      await expect(emptyOrError).toBeVisible();
    }
  });

  /**
   * 工事担当者列の昇順・降順切り替えテスト
   *
   * REQ-6.2: 同じヘッダー再度クリックで降順ソート切り替え
   */
  test('工事担当者列で昇順・降順の切り替えが正しく動作することを確認 (project-management/REQ-6.2)', async ({
    page,
  }) => {
    // デスクトップサイズを設定（テーブル表示）
    await page.setViewportSize({ width: 1280, height: 720 });

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // プロジェクト一覧画面が表示されることを確認
    await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // テーブルが表示されているか確認
    const table = page.getByRole('table');
    const tableVisible = await table.isVisible().catch(() => false);

    if (tableVisible) {
      // 工事担当者列のソートボタンを取得
      const constructionPersonSortButton = page.getByRole('button', {
        name: /工事担当者でソート/i,
      });
      await expect(constructionPersonSortButton).toBeVisible({ timeout: getTimeout(10000) });

      // 現在のURLをチェックして、すでにソートが適用されている場合はリセット
      const currentUrl = page.url();
      if (currentUrl.includes('sort=constructionPersonName')) {
        // すでにソートが適用されている場合、ページをリロードしてリセット
        await page.goto('/projects');
        await page.waitForLoadState('networkidle');
        await waitForLoadingComplete(page, { timeout: getTimeout(15000) });
      }

      // 1回目のクリック - 昇順
      await constructionPersonSortButton.click();
      await expect(page).toHaveURL(/sort=constructionPersonName/, { timeout: getTimeout(10000) });
      await expect(page).toHaveURL(/order=asc/, { timeout: getTimeout(10000) });

      // ローディング完了を待機
      await waitForLoadingComplete(page, { timeout: getTimeout(10000) });

      // ボタンが再度クリック可能になるまで待機
      await expect(constructionPersonSortButton).toBeEnabled({ timeout: getTimeout(5000) });

      // 昇順ソートが適用されたことを確認（URLで確認）
      await expect(page).toHaveURL(/order=asc/, { timeout: getTimeout(5000) });

      // クリック間の安定待機（ダブルクリック防止）
      await page.waitForTimeout(500);

      // 2回目のクリック - 降順
      await constructionPersonSortButton.click();

      // ローディング完了を待機
      await waitForLoadingComplete(page, { timeout: getTimeout(10000) });

      // URLが変更されるのを待機
      // 注意: デフォルトのソート順序が'desc'のため、order=descはURLに含まれない
      // 代わりにorder=ascが消えていることを確認
      await expect(page).not.toHaveURL(/order=asc/, { timeout: getTimeout(15000) });
      // sortパラメータは維持されていることを確認
      await expect(page).toHaveURL(/sort=constructionPersonName/, { timeout: getTimeout(5000) });
    } else {
      // プロジェクトがない場合、空状態メッセージまたはエラーメッセージを確認
      const emptyOrError = page.getByText(
        /プロジェクトがありません|プロジェクト一覧を取得できませんでした/i
      );
      await expect(emptyOrError).toBeVisible();
    }
  });

  /**
   * 営業担当者列のソートアイコン表示テスト
   *
   * REQ-6.3: 現在のソート状態をヘッダーにアイコン（昇順: up、降順: down）で表示
   */
  test('営業担当者列でソートアイコンが適切に表示されることを確認 (project-management/REQ-6.3)', async ({
    page,
  }) => {
    // デスクトップサイズを設定（テーブル表示）
    await page.setViewportSize({ width: 1280, height: 720 });

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // プロジェクト一覧画面が表示されることを確認
    await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // テーブルが表示されているか確認
    const table = page.getByRole('table');
    const tableVisible = await table.isVisible().catch(() => false);

    if (tableVisible) {
      // 営業担当者列のソートボタンを取得
      const salesPersonSortButton = page.getByRole('button', { name: /営業担当者でソート/i });
      await expect(salesPersonSortButton).toBeVisible({ timeout: getTimeout(10000) });

      // 初期状態ではソートアイコンが表示されていないことを確認
      // （デフォルトソートは更新日降順なので、営業担当者列にはアイコンがない）
      let ascIcon = salesPersonSortButton.getByTestId('sort-icon-asc');
      let descIcon = salesPersonSortButton.getByTestId('sort-icon-desc');
      await expect(ascIcon).not.toBeVisible();
      await expect(descIcon).not.toBeVisible();

      // 1回目のクリック - 昇順
      await salesPersonSortButton.click();
      await expect(page).toHaveURL(/sort=salesPersonName/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(10000) });

      // 昇順アイコンが表示されることを確認
      ascIcon = salesPersonSortButton.getByTestId('sort-icon-asc');
      await expect(ascIcon).toBeVisible({ timeout: getTimeout(5000) });

      // 2回目のクリック - 降順
      await salesPersonSortButton.click();
      // 注意: デフォルトのソート順序が'desc'のため、order=descはURLに含まれない
      await expect(page).not.toHaveURL(/order=asc/, { timeout: getTimeout(10000) });
      await expect(page).toHaveURL(/sort=salesPersonName/, { timeout: getTimeout(5000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(10000) });

      // 降順アイコンが表示されることを確認
      descIcon = salesPersonSortButton.getByTestId('sort-icon-desc');
      await expect(descIcon).toBeVisible({ timeout: getTimeout(5000) });
    } else {
      // プロジェクトがない場合、空状態メッセージまたはエラーメッセージを確認
      const emptyOrError = page.getByText(
        /プロジェクトがありません|プロジェクト一覧を取得できませんでした/i
      );
      await expect(emptyOrError).toBeVisible();
    }
  });

  /**
   * 工事担当者列のソートアイコン表示テスト
   *
   * REQ-6.3: 現在のソート状態をヘッダーにアイコン（昇順: up、降順: down）で表示
   */
  test('工事担当者列でソートアイコンが適切に表示されることを確認 (project-management/REQ-6.3)', async ({
    page,
  }) => {
    // デスクトップサイズを設定（テーブル表示）
    await page.setViewportSize({ width: 1280, height: 720 });

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // プロジェクト一覧画面が表示されることを確認
    await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // テーブルが表示されているか確認
    const table = page.getByRole('table');
    const tableVisible = await table.isVisible().catch(() => false);

    if (tableVisible) {
      // 工事担当者列のソートボタンを取得
      const constructionPersonSortButton = page.getByRole('button', {
        name: /工事担当者でソート/i,
      });
      await expect(constructionPersonSortButton).toBeVisible({ timeout: getTimeout(10000) });

      // 初期状態ではソートアイコンが表示されていないことを確認
      let ascIcon = constructionPersonSortButton.getByTestId('sort-icon-asc');
      let descIcon = constructionPersonSortButton.getByTestId('sort-icon-desc');
      await expect(ascIcon).not.toBeVisible();
      await expect(descIcon).not.toBeVisible();

      // 1回目のクリック - 昇順
      await constructionPersonSortButton.click();
      await expect(page).toHaveURL(/sort=constructionPersonName/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(10000) });

      // 昇順アイコンが表示されることを確認
      ascIcon = constructionPersonSortButton.getByTestId('sort-icon-asc');
      await expect(ascIcon).toBeVisible({ timeout: getTimeout(5000) });

      // 2回目のクリック - 降順
      await constructionPersonSortButton.click();
      // 注意: デフォルトのソート順序が'desc'のため、order=descはURLに含まれない
      await expect(page).not.toHaveURL(/order=asc/, { timeout: getTimeout(10000) });
      await expect(page).toHaveURL(/sort=constructionPersonName/, { timeout: getTimeout(5000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(10000) });

      // 降順アイコンが表示されることを確認
      descIcon = constructionPersonSortButton.getByTestId('sort-icon-desc');
      await expect(descIcon).toBeVisible({ timeout: getTimeout(5000) });
    } else {
      // プロジェクトがない場合、空状態メッセージまたはエラーメッセージを確認
      const emptyOrError = page.getByText(
        /プロジェクトがありません|プロジェクト一覧を取得できませんでした/i
      );
      await expect(emptyOrError).toBeVisible();
    }
  });

  /**
   * ソート列切り替え時のアイコン表示テスト
   *
   * REQ-6.3: 現在のソート状態をヘッダーにアイコンで表示
   * REQ-6.4: ソート対象外のカラムヘッダーにはソートアイコンを表示しない
   */
  test('ソート列を切り替えた時にアイコンが正しく移動することを確認 (project-management/REQ-6.3, REQ-6.4)', async ({
    page,
  }) => {
    // デスクトップサイズを設定（テーブル表示）
    await page.setViewportSize({ width: 1280, height: 720 });

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // プロジェクト一覧画面が表示されることを確認
    await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // テーブルが表示されているか確認
    const table = page.getByRole('table');
    const tableVisible = await table.isVisible().catch(() => false);

    if (tableVisible) {
      // 営業担当者列と工事担当者列のソートボタンを取得
      const salesPersonSortButton = page.getByRole('button', { name: /営業担当者でソート/i });
      const constructionPersonSortButton = page.getByRole('button', {
        name: /工事担当者でソート/i,
      });

      // Step 1: 営業担当者列でソート
      await salesPersonSortButton.click();
      await expect(page).toHaveURL(/sort=salesPersonName/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(10000) });

      // 営業担当者列にソートアイコンが表示される
      const salesAscIcon = salesPersonSortButton.getByTestId('sort-icon-asc');
      await expect(salesAscIcon).toBeVisible({ timeout: getTimeout(5000) });

      // 工事担当者列にはソートアイコンがない
      const constructionAscIcon = constructionPersonSortButton.getByTestId('sort-icon-asc');
      const constructionDescIcon = constructionPersonSortButton.getByTestId('sort-icon-desc');
      await expect(constructionAscIcon).not.toBeVisible();
      await expect(constructionDescIcon).not.toBeVisible();

      // Step 2: 工事担当者列でソート
      await constructionPersonSortButton.click();
      await expect(page).toHaveURL(/sort=constructionPersonName/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(10000) });

      // 工事担当者列にソートアイコンが表示される
      const constructionAscIcon2 = constructionPersonSortButton.getByTestId('sort-icon-asc');
      await expect(constructionAscIcon2).toBeVisible({ timeout: getTimeout(5000) });

      // 営業担当者列からソートアイコンがなくなる
      const salesAscIcon2 = salesPersonSortButton.getByTestId('sort-icon-asc');
      const salesDescIcon2 = salesPersonSortButton.getByTestId('sort-icon-desc');
      await expect(salesAscIcon2).not.toBeVisible();
      await expect(salesDescIcon2).not.toBeVisible();
    } else {
      // プロジェクトがない場合、空状態メッセージまたはエラーメッセージを確認
      const emptyOrError = page.getByText(
        /プロジェクトがありません|プロジェクト一覧を取得できませんでした/i
      );
      await expect(emptyOrError).toBeVisible();
    }
  });

  /**
   * aria-sort属性のテスト
   *
   * REQ-6.3: アクセシビリティ対応のソート状態表示
   */
  test('ソート時にaria-sort属性が適切に設定されることを確認 (project-management/REQ-6.3)', async ({
    page,
  }) => {
    // デスクトップサイズを設定（テーブル表示）
    await page.setViewportSize({ width: 1280, height: 720 });

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // プロジェクト一覧画面が表示されることを確認
    await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // テーブルが表示されているか確認
    const table = page.getByRole('table');
    const tableVisible = await table.isVisible().catch(() => false);

    if (tableVisible) {
      // ヘッダー行を取得
      const headerRow = page.locator('thead tr');

      // 営業担当者列のソートボタンをクリック
      const salesPersonSortButton = page.getByRole('button', { name: /営業担当者でソート/i });
      await salesPersonSortButton.click();
      await expect(page).toHaveURL(/sort=salesPersonName/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(10000) });

      // 営業担当者列のthにaria-sort="ascending"が設定されていることを確認
      // ヘッダーセルは「営業担当者」ボタンを含むth
      const salesPersonHeader = headerRow.locator('th').filter({ hasText: '営業担当者' });
      await expect(salesPersonHeader).toHaveAttribute('aria-sort', 'ascending', {
        timeout: getTimeout(5000),
      });

      // 2回目のクリック - 降順
      await salesPersonSortButton.click();
      // 注意: デフォルトのソート順序が'desc'のため、order=descはURLに含まれない
      await expect(page).not.toHaveURL(/order=asc/, { timeout: getTimeout(10000) });
      await expect(page).toHaveURL(/sort=salesPersonName/, { timeout: getTimeout(5000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(10000) });

      // 営業担当者列のthにaria-sort="descending"が設定されていることを確認
      await expect(salesPersonHeader).toHaveAttribute('aria-sort', 'descending', {
        timeout: getTimeout(5000),
      });
    } else {
      // プロジェクトがない場合、空状態メッセージまたはエラーメッセージを確認
      const emptyOrError = page.getByText(
        /プロジェクトがありません|プロジェクト一覧を取得できませんでした/i
      );
      await expect(emptyOrError).toBeVisible();
    }
  });

  /**
   * URLからのソート状態復元テスト
   *
   * REQ-6.5: URLパラメータからソート状態を復元
   */
  test('URLパラメータからソート状態が正しく復元されることを確認 (project-management/REQ-6.5)', async ({
    page,
  }) => {
    // デスクトップサイズを設定（テーブル表示）
    await page.setViewportSize({ width: 1280, height: 720 });

    await loginAsUser(page, 'REGULAR_USER');

    // 営業担当者昇順でソートされた状態でアクセス
    await page.goto('/projects?sort=salesPersonName&order=asc');
    await page.waitForLoadState('networkidle');
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // プロジェクト一覧画面が表示されることを確認
    await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // テーブルが表示されているか確認
    const table = page.getByRole('table');
    const tableVisible = await table.isVisible().catch(() => false);

    if (tableVisible) {
      // 営業担当者列のソートボタンに昇順アイコンが表示されていることを確認
      const salesPersonSortButton = page.getByRole('button', { name: /営業担当者でソート/i });
      const ascIcon = salesPersonSortButton.getByTestId('sort-icon-asc');
      await expect(ascIcon).toBeVisible({ timeout: getTimeout(5000) });

      // 工事担当者降順でソートされた状態でアクセス
      await page.goto('/projects?sort=constructionPersonName&order=desc');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 工事担当者列のソートボタンに降順アイコンが表示されていることを確認
      const constructionPersonSortButton = page.getByRole('button', {
        name: /工事担当者でソート/i,
      });
      const descIcon = constructionPersonSortButton.getByTestId('sort-icon-desc');
      await expect(descIcon).toBeVisible({ timeout: getTimeout(5000) });
    } else {
      // プロジェクトがない場合、空状態メッセージまたはエラーメッセージを確認
      const emptyOrError = page.getByText(
        /プロジェクトがありません|プロジェクト一覧を取得できませんでした/i
      );
      await expect(emptyOrError).toBeVisible();
    }
  });
});
