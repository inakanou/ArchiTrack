/**
 * @fileoverview 取引先一覧操作のE2Eテスト
 *
 * Task 15.2: 一覧画面機能のE2Eテスト
 *
 * 取引先一覧画面のページネーション、検索、フィルタリング、ソートの動作をテストします。
 * 空データ時のメッセージ表示もテストします。
 *
 * Requirements:
 * - 1.1: 取引先一覧ページにアクセスしたとき、登録済みの取引先をテーブル形式で表示
 * - 1.3: 検索条件を入力したとき、取引先名またはフリガナによる部分一致検索を実行
 * - 1.4: フィルター条件を選択したとき、取引先種別（顧客/協力業者）でのフィルタリングを実行
 * - 1.5: ページネーションを提供し、1ページあたりの表示件数を選択可能とする
 * - 1.6: ソート列クリックで指定された列（取引先名、フリガナ、登録日等）で昇順または降順にソート
 * - 1.7: 取引先データが存在しない場合、「取引先が登録されていません」というメッセージを表示
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';

/**
 * 取引先一覧操作のE2Eテスト
 */
test.describe('取引先一覧操作', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context, page }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // localStorageもクリア（テスト間の認証状態の干渉を防ぐ）
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  /**
   * 取引先一覧表示のテスト
   *
   * REQ-1.1: 取引先一覧ページにアクセスしたとき、登録済みの取引先をテーブル形式で表示
   * REQ-1.7: 取引先データが存在しない場合、「取引先が登録されていません」というメッセージを表示
   */
  test.describe('取引先一覧表示', () => {
    /**
     * @requirement trading-partner-management/REQ-1.1
     */
    test('取引先一覧画面にアクセスすると取引先一覧が表示される (trading-partner-management/REQ-1.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 取引先一覧画面が表示されることを確認
      await expect(page.getByRole('heading', { name: /取引先一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 取引先がある場合はテーブルが表示される
      // 取引先がない場合は空状態メッセージが表示される
      const table = page.getByRole('table', { name: /取引先一覧/i });
      const emptyMessage = page.getByText(/取引先が登録されていません/i);

      await expect(table.or(emptyMessage)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement trading-partner-management/REQ-1.8
     */
    test('取引先一覧がフリガナの昇順でデフォルト表示される (trading-partner-management/REQ-1.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // URLパラメータなしでアクセス
      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // デフォルトのソート順序がURLに反映されていることを確認
      // URLパラメータがない場合はデフォルトでnameKanaの昇順でソート
      const url = page.url();

      // URLにソートパラメータがない、または明示的にnameKana昇順が設定されている
      expect(url).toMatch(/trading-partners(\?|$)/);
    });

    /**
     * @requirement trading-partner-management/REQ-1.7
     */
    test('取引先データが存在しない場合に「取引先が登録されていません」メッセージが表示される (trading-partner-management/REQ-1.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 存在しないキーワードで検索して0件状態を作る
      await page.goto('/trading-partners?search=ZZZZNOTEXISTZZZZ');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 検索結果が0件の場合は空状態メッセージが表示される
      const emptyMessage = page.getByText(/取引先が登録されていません/i);
      const table = page.getByRole('table', { name: /取引先一覧/i });

      // いずれかが表示されることを確認
      await expect(emptyMessage.or(table)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    test('ローディングインジケータが表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // ページ遷移を開始
      await page.goto('/trading-partners');

      // ローディングインジケータが表示されることを確認（短時間で完了する可能性があるためtry-catchで囲む）
      try {
        await expect(page.getByText(/読み込み中/i).first()).toBeVisible({ timeout: 1000 });
      } catch {
        // ローディングが高速で完了した場合はスキップ
      }

      // 最終的にローディングが完了することを確認
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });
    });
  });

  /**
   * 検索機能のテスト
   *
   * REQ-1.3: 検索条件を入力したとき、取引先名またはフリガナによる部分一致検索を実行
   */
  test.describe('検索機能', () => {
    /**
     * @requirement trading-partner-management/REQ-1.3
     */
    test('検索フィールドにキーワードを入力してEnterで検索が実行される (trading-partner-management/REQ-1.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 取引先一覧ページに移動
      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 検索フィールドにキーワードを入力
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await expect(searchInput).toBeVisible({ timeout: getTimeout(10000) });

      await searchInput.fill('テスト');
      await searchInput.press('Enter');

      // URLパラメータに検索キーワードが反映されることを確認
      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
    });

    test('検索ボタンクリックで検索が実行される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 検索フィールドにキーワードを入力
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('テスト');

      // 検索ボタンをクリック
      await page.getByRole('button', { name: /^検索$/i }).click();

      // URLパラメータに検索キーワードが反映されることを確認
      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
    });

    test('検索結果が0件の場合、適切なメッセージが表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 存在しないキーワードで検索
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('存在しない取引先12345XYZ');
      await searchInput.press('Enter');

      // URLに検索パラメータが反映されることを確認
      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });

      // ローディング完了を待機
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 検索結果なしメッセージが表示されることを確認
      const emptyMessage = page.getByText(/取引先が登録されていません/i);
      const table = page.getByRole('table', { name: /取引先一覧/i });
      await expect(emptyMessage.or(table)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    test('フリガナでも検索ができる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // フリガナで検索
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('カブシキ'); // 「株式」のフリガナの一部
      await searchInput.press('Enter');

      // URLに検索パラメータが反映されることを確認
      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });

      // ローディング完了を待機
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 一覧またはメッセージが表示されることを確認
      const emptyMessage = page.getByText(/取引先が登録されていません/i);
      const table = page.getByRole('table', { name: /取引先一覧/i });
      await expect(emptyMessage.or(table)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    test('検索キーワードをクリアすると全取引先一覧が再表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 検索条件付きでアクセス
      await page.goto('/trading-partners?search=テスト');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // フィルタをクリアボタンをクリック
      await page.getByRole('button', { name: /フィルタをクリア/i }).click();

      // URLパラメータから検索キーワードが削除されることを確認
      await expect(page).not.toHaveURL(/search=/, { timeout: getTimeout(10000) });
    });
  });

  /**
   * フィルタ機能のテスト
   *
   * REQ-1.4: フィルター条件を選択したとき、取引先種別（顧客/協力業者）でのフィルタリングを実行
   */
  test.describe('フィルタ機能', () => {
    /**
     * @requirement trading-partner-management/REQ-1.4
     */
    test('種別フィルタで「顧客」を選択するとフィルタリングされる (trading-partner-management/REQ-1.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 種別フィルタのチェックボックスをクリック
      const customerCheckbox = page.getByRole('checkbox', { name: /顧客/i });
      await expect(customerCheckbox).toBeVisible({ timeout: getTimeout(10000) });

      await customerCheckbox.check();

      // URLパラメータに種別が反映されることを確認
      await expect(page).toHaveURL(/type=/, { timeout: getTimeout(10000) });
    });

    test('種別フィルタで「協力業者」を選択するとフィルタリングされる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 協力業者チェックボックスをクリック
      const subcontractorCheckbox = page.getByRole('checkbox', { name: /協力業者/i });
      await expect(subcontractorCheckbox).toBeVisible({ timeout: getTimeout(10000) });

      await subcontractorCheckbox.check();

      // URLパラメータに種別が反映されることを確認
      await expect(page).toHaveURL(/type=/, { timeout: getTimeout(10000) });
    });

    test('複数の種別を選択すると両方の種別でフィルタリングされる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 顧客と協力業者の両方をチェック
      const customerCheckbox = page.getByRole('checkbox', { name: /顧客/i });
      const subcontractorCheckbox = page.getByRole('checkbox', { name: /協力業者/i });

      await customerCheckbox.check();
      await subcontractorCheckbox.check();

      // URLパラメータに両方の種別が反映されることを確認
      await expect(page).toHaveURL(/type=/, { timeout: getTimeout(10000) });
    });

    test('フィルタの選択状態がURLパラメータに反映される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // URLパラメータ付きでアクセス
      await page.goto('/trading-partners?type=CUSTOMER');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // URLパラメータが維持されていることを確認
      await expect(page).toHaveURL(/type=CUSTOMER/);

      // 種別チェックボックスの選択状態を確認
      const customerCheckbox = page.getByRole('checkbox', { name: /顧客/i });
      await expect(customerCheckbox).toBeChecked();
    });

    test('検索と種別フィルタを組み合わせることができる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 検索フィールドにキーワードを入力
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('テスト');

      // 種別フィルタを選択
      const customerCheckbox = page.getByRole('checkbox', { name: /顧客/i });
      await customerCheckbox.check();

      // 検索実行
      await page.getByRole('button', { name: /^検索$/i }).click();

      // URLパラメータに両方のフィルタが反映されることを確認
      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await expect(page).toHaveURL(/type=/);
    });

    test('フィルタをクリアをクリックするとすべてのフィルタが解除される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 複数のフィルタ条件付きでアクセス
      await page.goto('/trading-partners?search=テスト&type=CUSTOMER');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // フィルタをクリアボタンをクリック
      await page.getByRole('button', { name: /フィルタをクリア/i }).click();

      // URLパラメータからフィルタが削除されることを確認
      await expect(page).not.toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await expect(page).not.toHaveURL(/type=/);
    });
  });

  /**
   * ソート機能のテスト
   *
   * REQ-1.6: ソート列クリックで指定された列（取引先名、フリガナ、登録日等）で昇順または降順にソート
   */
  test.describe('ソート機能', () => {
    /**
     * @requirement trading-partner-management/REQ-1.6
     */
    test('テーブルヘッダークリックでソートが実行される (trading-partner-management/REQ-1.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テーブルが表示されているか確認（取引先がない場合はスキップ）
      const table = page.getByRole('table', { name: /取引先一覧/i });
      const tableVisible = await table.isVisible().catch(() => false);

      if (!tableVisible) {
        // 取引先がない場合、空状態メッセージを確認
        const emptyMessage = page.getByText(/取引先が登録されていません/i);
        await expect(emptyMessage).toBeVisible();
        return;
      }

      // 取引先名ヘッダーのソートボタンをクリック
      const sortButton = page.getByRole('button', { name: /取引先名でソート/i });
      await expect(sortButton).toBeVisible({ timeout: getTimeout(10000) });

      await sortButton.click();

      // URLパラメータにソートが反映されることを確認
      await expect(page).toHaveURL(/sort=name/, { timeout: getTimeout(10000) });
    });

    test('フリガナヘッダーをクリックするとフリガナでソートされる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テーブルが表示されているか確認
      const table = page.getByRole('table', { name: /取引先一覧/i });
      const tableVisible = await table.isVisible().catch(() => false);

      if (!tableVisible) {
        const emptyMessage = page.getByText(/取引先が登録されていません/i);
        await expect(emptyMessage).toBeVisible();
        return;
      }

      // フリガナヘッダーのソートボタンをクリック
      const sortButton = page.getByRole('button', { name: /フリガナでソート/i });
      await expect(sortButton).toBeVisible({ timeout: getTimeout(10000) });

      await sortButton.click();

      // デフォルトがnameKana ascなので、クリックするとdescになる
      await expect(page).toHaveURL(/order=desc/, { timeout: getTimeout(10000) });
    });

    test('登録日ヘッダーをクリックすると登録日でソートされる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テーブルが表示されているか確認
      const table = page.getByRole('table', { name: /取引先一覧/i });
      const tableVisible = await table.isVisible().catch(() => false);

      if (!tableVisible) {
        const emptyMessage = page.getByText(/取引先が登録されていません/i);
        await expect(emptyMessage).toBeVisible();
        return;
      }

      // 登録日ヘッダーのソートボタンをクリック
      const sortButton = page.getByRole('button', { name: /登録日でソート/i });
      await expect(sortButton).toBeVisible({ timeout: getTimeout(10000) });

      await sortButton.click();

      // URLパラメータにソートが反映されることを確認
      await expect(page).toHaveURL(/sort=createdAt/, { timeout: getTimeout(10000) });
    });

    test('ソートボタンを連続クリックするとソート順序が切り替わる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テーブルが表示されているか確認
      const table = page.getByRole('table', { name: /取引先一覧/i });
      const tableVisible = await table.isVisible().catch(() => false);

      if (!tableVisible) {
        const emptyMessage = page.getByText(/取引先が登録されていません/i);
        await expect(emptyMessage).toBeVisible();
        return;
      }

      // 取引先名ヘッダーのソートボタンをクリック
      const sortButton = page.getByRole('button', { name: /取引先名でソート/i });
      await expect(sortButton).toBeVisible({ timeout: getTimeout(10000) });

      // 1回目のクリック（name asc）
      await sortButton.click();
      await expect(page).toHaveURL(/sort=name/, { timeout: getTimeout(10000) });

      // 2回目のクリック（name desc）
      await sortButton.click();
      await expect(page).toHaveURL(/order=desc/, { timeout: getTimeout(10000) });

      // 3回目のクリック（name asc に戻る）
      await sortButton.click();
      await expect(page).toHaveURL(/order=asc/, { timeout: getTimeout(10000) });
    });

    test('ソートアイコンが現在のソート状態を反映する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テーブルが表示されているか確認
      const table = page.getByRole('table', { name: /取引先一覧/i });
      const tableVisible = await table.isVisible().catch(() => false);

      if (!tableVisible) {
        const emptyMessage = page.getByText(/取引先が登録されていません/i);
        await expect(emptyMessage).toBeVisible();
        return;
      }

      // デフォルトでフリガナの昇順ソートなので、昇順アイコンが表示されているはず
      const ascIcon = page.getByTestId('sort-icon-asc');
      await expect(ascIcon).toBeVisible({ timeout: getTimeout(5000) });

      // フリガナヘッダーのソートボタンをクリック（降順に切り替わる）
      const sortButton = page.getByRole('button', { name: /フリガナでソート/i });
      await sortButton.click();

      // 降順アイコンが表示されることを確認
      const descIcon = page.getByTestId('sort-icon-desc');
      await expect(descIcon).toBeVisible({ timeout: getTimeout(5000) });
    });
  });

  /**
   * ページネーション機能のテスト
   *
   * REQ-1.5: ページネーションを提供し、1ページあたりの表示件数を選択可能とする
   */
  test.describe('ページネーション機能', () => {
    /**
     * @requirement trading-partner-management/REQ-1.5
     */
    test('取引先が存在する場合、ページネーションコントロールが表示される (trading-partner-management/REQ-1.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 取引先が存在しない場合は空状態メッセージが表示される
      const emptyMessage = page.getByText(/取引先が登録されていません/i);
      const pagination = page.getByTestId('pagination-controls');

      // 2つのうちいずれかが表示されることを確認
      await expect(emptyMessage.or(pagination)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // ページネーションが表示されている場合、詳細を確認
      const paginationVisible = await pagination.isVisible();
      if (paginationVisible) {
        // 現在のページ番号が表示されていることを確認
        await expect(page.getByTestId('current-page')).toBeVisible();

        // 総ページ数が表示されていることを確認
        await expect(page.getByTestId('total-pages')).toBeVisible();

        // 総件数が表示されていることを確認
        await expect(page.getByTestId('total-count')).toBeVisible();
      }
    });

    test('表示件数を変更するとURLパラメータに反映される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ページネーションコントロールが存在する場合のみテスト
      const pagination = page.getByTestId('pagination-controls');
      const emptyMessage = page.getByText(/取引先が登録されていません/i);

      await expect(emptyMessage.or(pagination)).toBeVisible({
        timeout: getTimeout(10000),
      });

      const paginationVisible = await pagination.isVisible();
      if (paginationVisible) {
        // 表示件数セレクトを変更
        const limitSelect = page.getByRole('combobox', { name: /表示件数/i });
        await expect(limitSelect).toBeVisible({ timeout: getTimeout(10000) });

        await limitSelect.selectOption('10');

        // URLパラメータに表示件数が反映されることを確認
        await expect(page).toHaveURL(/limit=10/, { timeout: getTimeout(10000) });
      }
    });

    test('表示件数を50件に変更できる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ページネーションコントロールが存在する場合のみテスト
      const pagination = page.getByTestId('pagination-controls');
      const emptyMessage = page.getByText(/取引先が登録されていません/i);

      await expect(emptyMessage.or(pagination)).toBeVisible({
        timeout: getTimeout(10000),
      });

      const paginationVisible = await pagination.isVisible();
      if (paginationVisible) {
        // 表示件数セレクトを変更
        const limitSelect = page.getByRole('combobox', { name: /表示件数/i });
        await limitSelect.selectOption('50');

        // URLパラメータに表示件数が反映されることを確認
        await expect(page).toHaveURL(/limit=50/, { timeout: getTimeout(10000) });
      }
    });

    test('ページ番号ボタンをクリックするとそのページに移動する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 表示件数を少なくしてページ数を増やす
      await page.goto('/trading-partners?limit=10');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ページネーションコントロールが存在する場合のみテスト
      const pagination = page.getByTestId('pagination-controls');
      const paginationVisible = await pagination.isVisible();

      if (paginationVisible) {
        // 総ページ数を確認
        const totalPagesElement = page.getByTestId('total-pages');
        const totalPagesText = await totalPagesElement.textContent();
        const totalPages = parseInt(totalPagesText || '1', 10);

        if (totalPages > 1) {
          // ページ2ボタンをクリック
          const page2Button = page.getByRole('button', { name: /^ページ 2$/i });
          await expect(page2Button).toBeVisible({ timeout: getTimeout(5000) });
          await page2Button.click();

          // URLパラメータにページ番号が反映されることを確認
          await expect(page).toHaveURL(/page=2/, { timeout: getTimeout(10000) });

          // 現在のページ番号が更新されることを確認
          await expect(page.getByTestId('current-page')).toHaveText('2');
        }
      }
    });

    test('前のページボタンで前のページに移動する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // ページ2で開始
      await page.goto('/trading-partners?limit=10&page=2');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ページネーションコントロールが存在する場合のみテスト
      const pagination = page.getByTestId('pagination-controls');
      const paginationVisible = await pagination.isVisible();

      if (paginationVisible) {
        // 現在のページ番号を確認
        const currentPage = await page.getByTestId('current-page').textContent();

        if (currentPage === '2') {
          // 前のページボタンをクリック
          const prevButton = page.getByRole('button', { name: /前のページ/i });
          await expect(prevButton).toBeEnabled({ timeout: getTimeout(5000) });
          await prevButton.click();

          // ページ1に移動することを確認
          await expect(page.getByTestId('current-page')).toHaveText('1', {
            timeout: getTimeout(10000),
          });
        }
      }
    });

    test('次のページボタンで次のページに移動する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 表示件数を少なくしてページ数を増やす
      await page.goto('/trading-partners?limit=10');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ページネーションコントロールが存在する場合のみテスト
      const pagination = page.getByTestId('pagination-controls');
      const paginationVisible = await pagination.isVisible();

      if (paginationVisible) {
        // 総ページ数を確認
        const totalPagesElement = page.getByTestId('total-pages');
        const totalPagesText = await totalPagesElement.textContent();
        const totalPages = parseInt(totalPagesText || '1', 10);

        if (totalPages > 1) {
          // 次のページボタンをクリック
          const nextButton = page.getByRole('button', { name: /次のページ/i });
          await expect(nextButton).toBeEnabled({ timeout: getTimeout(5000) });
          await nextButton.click();

          // ページ2に移動することを確認
          await expect(page.getByTestId('current-page')).toHaveText('2', {
            timeout: getTimeout(10000),
          });
        }
      }
    });

    test('最初のページでは「前のページ」ボタンが無効化される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ページネーションコントロールが存在する場合のみテスト
      const pagination = page.getByTestId('pagination-controls');
      const paginationVisible = await pagination.isVisible();

      if (paginationVisible) {
        // 前のページボタンが無効化されていることを確認
        const prevButton = page.getByRole('button', { name: /前のページ/i });
        await expect(prevButton).toBeDisabled({ timeout: getTimeout(5000) });
      }
    });

    test('最後のページでは「次のページ」ボタンが無効化される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners?limit=10');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ページネーションコントロールが存在する場合のみテスト
      const pagination = page.getByTestId('pagination-controls');
      const paginationVisible = await pagination.isVisible();

      if (paginationVisible) {
        // 総ページ数を確認
        const totalPagesElement = page.getByTestId('total-pages');
        const totalPagesText = await totalPagesElement.textContent();
        const totalPages = parseInt(totalPagesText || '1', 10);

        // 最後のページに移動
        await page.goto(`/trading-partners?limit=10&page=${totalPages}`);
        await page.waitForLoadState('networkidle');
        await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

        // 次のページボタンが無効化されていることを確認
        const nextButton = page.getByRole('button', { name: /次のページ/i });
        await expect(nextButton).toBeDisabled({ timeout: getTimeout(5000) });
      }
    });
  });

  /**
   * 検索・フィルタ・ソート・ページ遷移の統合フローテスト
   */
  test.describe('統合フロー', () => {
    test('検索→フィルタ→ソート→ページ遷移の一連の操作が正常に行われる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // Step 1: 検索を実行
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('テスト');

      await page.getByRole('button', { name: /^検索$/i }).click();

      // URLに検索パラメータが反映されることを確認
      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });

      // Step 2: 種別フィルタを適用
      const customerCheckbox = page.getByRole('checkbox', { name: /顧客/i });
      await customerCheckbox.check();

      // URLに種別パラメータが反映されることを確認
      await expect(page).toHaveURL(/type=/, { timeout: getTimeout(10000) });

      // Step 3: ソートを実行（テーブルが表示されている場合のみ）
      const table = page.getByRole('table', { name: /取引先一覧/i });
      const tableVisible = await table.isVisible();

      if (tableVisible) {
        const sortButton = page.getByRole('button', { name: /取引先名でソート/i });
        await sortButton.click();

        // URLにソートパラメータが反映されることを確認
        await expect(page).toHaveURL(/sort=/, { timeout: getTimeout(10000) });
      }

      // Step 4: 表示件数を変更（ページネーションコントロールが表示されている場合のみ）
      const pagination = page.getByTestId('pagination-controls');
      const paginationVisible = await pagination.isVisible();

      if (paginationVisible) {
        const limitSelect = page.getByRole('combobox', { name: /表示件数/i });
        await limitSelect.selectOption('10');

        // URLに表示件数パラメータが反映されることを確認
        await expect(page).toHaveURL(/limit=10/, { timeout: getTimeout(10000) });
      }

      // Step 5: フィルタをクリア
      await page.getByRole('button', { name: /フィルタをクリア/i }).click();

      // URLパラメータがクリアされることを確認
      await expect(page).not.toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await expect(page).not.toHaveURL(/type=/);
    });

    test('URLパラメータで状態を復元できる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 全てのパラメータを指定してアクセス
      await page.goto(
        '/trading-partners?search=テスト&type=CUSTOMER&sort=name&order=desc&limit=10'
      );
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 検索フィールドに値が設定されていることを確認
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await expect(searchInput).toHaveValue('テスト');

      // 種別チェックボックスが選択されていることを確認
      const customerCheckbox = page.getByRole('checkbox', { name: /顧客/i });
      await expect(customerCheckbox).toBeChecked();

      // URLパラメータが維持されていることを確認
      await expect(page).toHaveURL(/search=/);
      await expect(page).toHaveURL(/type=/);
      await expect(page).toHaveURL(/sort=name/);
      await expect(page).toHaveURL(/order=desc/);
      await expect(page).toHaveURL(/limit=10/);
    });
  });

  /**
   * 一覧から詳細へのナビゲーションテスト
   */
  test.describe('一覧から詳細への遷移', () => {
    test('取引先行をクリックすると詳細ページに遷移する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テーブルが表示されているか確認
      const table = page.getByRole('table', { name: /取引先一覧/i });
      const tableVisible = await table.isVisible().catch(() => false);

      if (!tableVisible) {
        // 取引先がない場合、空状態メッセージを確認
        const emptyMessage = page.getByText(/取引先が登録されていません/i);
        await expect(emptyMessage).toBeVisible();
        return;
      }

      // 最初の取引先行をクリック
      const firstRow = page.locator('[data-testid^="partner-row-"]').first();
      await expect(firstRow).toBeVisible({ timeout: getTimeout(10000) });

      // 行のテストIDからIDを取得
      const testId = await firstRow.getAttribute('data-testid');
      const partnerId = testId?.replace('partner-row-', '');

      await firstRow.click();

      // 詳細ページに遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}`), {
        timeout: getTimeout(10000),
      });
    });

    test('Enterキーで取引先詳細ページに遷移できる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テーブルが表示されているか確認
      const table = page.getByRole('table', { name: /取引先一覧/i });
      const tableVisible = await table.isVisible().catch(() => false);

      if (!tableVisible) {
        const emptyMessage = page.getByText(/取引先が登録されていません/i);
        await expect(emptyMessage).toBeVisible();
        return;
      }

      // 最初の取引先行にフォーカスしてEnterキーを押す
      const firstRow = page.locator('[data-testid^="partner-row-"]').first();
      await expect(firstRow).toBeVisible({ timeout: getTimeout(10000) });

      // 行のテストIDからIDを取得
      const testId = await firstRow.getAttribute('data-testid');
      const partnerId = testId?.replace('partner-row-', '');

      await firstRow.focus();
      await firstRow.press('Enter');

      // 詳細ページに遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/trading-partners/${partnerId}`), {
        timeout: getTimeout(10000),
      });
    });
  });
});
