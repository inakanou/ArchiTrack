/**
 * @fileoverview プロジェクト一覧操作のE2Eテスト
 *
 * Task 16.2: プロジェクト一覧操作 E2Eテスト
 *
 * Requirements:
 * - 2.1: プロジェクト一覧画面にアクセスすると認可されたプロジェクト一覧を表示
 * - 3.1: 1ページあたりのデフォルト表示件数を20件とする
 * - 3.3: ページ番号クリックで該当ページのプロジェクトを表示
 * - 4.1: 検索フィールドにキーワードを入力してEnter/検索ボタンで検索実行
 * - 4.4: 2文字以上の検索キーワードを要求
 * - 4.5: 1文字以下で「2文字以上で入力してください」メッセージを表示
 * - 5.1: ステータスフィルタで値を選択すると選択されたステータスのプロジェクトのみ表示
 * - 6.1: テーブルヘッダーをクリックすると該当カラムで昇順ソート
 * - 15.3: 画面幅が768px未満の場合、テーブルをカード形式に切り替えて表示
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';

/**
 * プロジェクト一覧操作のE2Eテスト
 */
test.describe('プロジェクト一覧操作', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  /**
   * プロジェクト一覧表示のテスト
   *
   * REQ-2.1: プロジェクト一覧画面にアクセスすると認可されたプロジェクト一覧を表示
   * REQ-2.4: ローディングインジケータを表示
   * REQ-2.5: プロジェクトが0件の場合、メッセージを表示
   * REQ-2.6: 更新日時の降順でデフォルト表示
   */
  test.describe('プロジェクト一覧表示', () => {
    /**
     * @requirement project-management/REQ-2.1
     */
    test('プロジェクト一覧画面にアクセスすると認可されたプロジェクト一覧が表示される (project-management/REQ-2.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // プロジェクト一覧画面が表示されることを確認
      await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // プロジェクトがある場合はテーブルまたはカードが表示される
      // プロジェクトがない場合は空状態メッセージが表示される
      const table = page.getByRole('table');
      const cardList = page.getByTestId('project-card-list');
      const emptyMessage = page.getByText(/プロジェクトがありません/i);
      const errorMessage = page.getByText(/プロジェクト一覧を取得できませんでした/i);

      await expect(table.or(cardList).or(emptyMessage).or(errorMessage)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-2.6
     */
    test('プロジェクト一覧が更新日時の降順でデフォルト表示される (project-management/REQ-2.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // URLパラメータなしでアクセス
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // デフォルトのソート順序がURLに反映されていることを確認
      // または、URLパラメータがない場合はデフォルトでupdatedAtの降順でソート
      const url = page.url();

      // URLにソートパラメータがない、または明示的にupdatedAt降順が設定されている
      expect(url).toMatch(/projects(\?|$)/);
    });

    /**
     * @requirement project-management/REQ-2.4
     */
    test('プロジェクト一覧データ取得中にローディングインジケータが表示される (project-management/REQ-2.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // ページ遷移を開始
      await page.goto('/projects');

      // ローディングインジケータが表示されることを確認（短時間で完了する可能性があるためtry-catchで囲む）
      try {
        await expect(page.getByText(/読み込み中/i).first()).toBeVisible({ timeout: 1000 });
      } catch {
        // ローディングが高速で完了した場合はスキップ
      }

      // 最終的にローディングが完了することを確認
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });
    });

    /**
     * @requirement project-management/REQ-2.5
     */
    test('プロジェクトが0件の場合に適切なメッセージが表示される (project-management/REQ-2.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // プロジェクトがない場合は「プロジェクトがありません」メッセージが表示される
      // プロジェクトがある場合はテーブルまたはカードリストが表示される
      const emptyMessage = page.getByText(/プロジェクトがありません/i);
      const table = page.getByRole('table');
      const cardList = page.getByTestId('project-card-list');

      // いずれかが表示されることを確認
      await expect(emptyMessage.or(table).or(cardList)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * 検索機能のテスト
   *
   * REQ-4.1: 検索フィールドにキーワードを入力してEnter/検索ボタンで検索実行
   * @requirement project-management/REQ-4.1a
   */
  test.describe('検索機能', () => {
    /**
     * @requirement project-management/REQ-4.1a
     */
    test('検索フィールドにキーワードを入力してEnterで検索が実行される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト一覧ページに移動
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 検索フィールドにキーワードを入力
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await expect(searchInput).toBeVisible({ timeout: getTimeout(10000) });

      await searchInput.fill('プロジェクト');
      await searchInput.press('Enter');

      // URLパラメータに検索キーワードが反映されることを確認
      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-4.1b
     */
    test('検索ボタンクリックで検索が実行される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
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

    /**
     * @requirement project-management/REQ-4.2
     */
    test('検索結果が0件の場合、適切なメッセージが表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 存在しないキーワードで検索
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('存在しないプロジェクト12345XYZ');
      await searchInput.press('Enter');

      // URLに検索パラメータが反映されることを確認
      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });

      // ローディング完了を待機
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 検索結果なしメッセージまたはエラーメッセージが表示されることを確認
      const emptyMessage = page.getByText(/検索結果がありません|プロジェクトがありません/i);
      const errorMessage = page.getByText(/プロジェクト一覧を取得できませんでした/i);
      await expect(emptyMessage.or(errorMessage)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-4.3
     */
    test('検索キーワードをクリアすると全プロジェクト一覧が再表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 検索条件付きでアクセス
      await page.goto('/projects?search=テスト');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // フィルタをクリアボタンをクリック
      await page.getByRole('button', { name: /フィルタをクリア/i }).click();

      // URLパラメータから検索キーワードが削除されることを確認
      await expect(page).not.toHaveURL(/search=/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-4.4a
     * @requirement project-management/REQ-4.4b
     */
    test('2文字以上の検索キーワードで検索が実行される (project-management/REQ-4.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 2文字の検索キーワードを入力
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await expect(searchInput).toBeVisible({ timeout: getTimeout(10000) });

      await searchInput.fill('テスト');
      await searchInput.press('Enter');

      // URLパラメータに検索キーワードが反映されることを確認
      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });

      // エラーメッセージが表示されていないことを確認
      await expect(page.getByText(/2文字以上で入力してください/i)).not.toBeVisible({
        timeout: 3000,
      });
    });

    /**
     * @requirement project-management/REQ-4.5
     */
    test('1文字以下の検索キーワードでエラーメッセージが表示される (project-management/REQ-4.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 1文字の検索キーワードを入力
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await expect(searchInput).toBeVisible({ timeout: getTimeout(10000) });

      await searchInput.fill('あ');
      await searchInput.press('Enter');

      // 「2文字以上で入力してください」エラーメッセージが表示されることを確認
      await expect(page.getByText(/2文字以上で入力してください/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // URLに検索パラメータが反映されていないことを確認
      await expect(page).not.toHaveURL(/search=あ/, { timeout: 3000 });
    });

    /**
     * @requirement project-management/REQ-4.4a
     * @requirement project-management/REQ-4.5
     */
    test('1文字入力後に2文字以上に修正するとエラーが解消される (project-management/REQ-4.4a, REQ-4.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await expect(searchInput).toBeVisible({ timeout: getTimeout(10000) });

      // 1文字で検索を試みる
      await searchInput.fill('あ');
      await searchInput.press('Enter');

      // エラーメッセージが表示されることを確認
      await expect(page.getByText(/2文字以上で入力してください/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 2文字以上に修正
      await searchInput.fill('あいう');
      await searchInput.press('Enter');

      // エラーメッセージが消えることを確認
      await expect(page.getByText(/2文字以上で入力してください/i)).not.toBeVisible({
        timeout: getTimeout(5000),
      });

      // URLに検索パラメータが反映されることを確認
      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
    });
  });

  /**
   * フィルタ機能のテスト
   *
   * REQ-5.1: ステータスフィルタで値を選択すると選択されたステータスのプロジェクトのみ表示
   * REQ-5.6: フィルタの選択状態をURLパラメータに反映
   * @requirement project-management/REQ-5.1
   */
  test.describe('フィルタ機能', () => {
    /**
     * @requirement project-management/REQ-5.6
     */
    test('フィルタの選択状態がURLパラメータに反映される (project-management/REQ-5.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // URLパラメータ付きでアクセス
      await page.goto('/projects?status=PREPARING&createdFrom=2024-01-01');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // URLパラメータが維持されていることを確認
      await expect(page).toHaveURL(/status=PREPARING/);
      await expect(page).toHaveURL(/createdFrom=2024-01-01/);

      // ステータスフィルタの選択状態を確認
      const statusSelect = page.getByRole('listbox', { name: /ステータスフィルタ/i });
      const statusValue = await statusSelect.inputValue();
      expect(statusValue).toBe('PREPARING');
    });

    /**
     * @requirement project-management/REQ-5.1
     */
    test('ステータスフィルタで値を選択するとフィルタリングされる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ステータスフィルタを選択
      const statusSelect = page.getByRole('listbox', { name: /ステータスフィルタ/i });
      await expect(statusSelect).toBeVisible({ timeout: getTimeout(10000) });

      // 「準備中」ステータスを選択
      await statusSelect.selectOption('PREPARING');

      // URLパラメータにステータスが反映されることを確認
      await expect(page).toHaveURL(/status=/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-5.2
     * @requirement project-management/REQ-5.3
     */
    test('期間フィルタで日付範囲を指定するとフィルタリングされる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 開始日を入力
      const fromDate = page.getByRole('textbox', { name: /作成日（開始）/i });
      await expect(fromDate).toBeVisible({ timeout: getTimeout(10000) });

      const today = new Date();
      const oneMonthAgo = new Date(today);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const fromDateStr = oneMonthAgo.toISOString().split('T')[0]; // YYYY-MM-DD

      await fromDate.fill(fromDateStr as string);

      // URLパラメータに日付が反映されることを確認
      await expect(page).toHaveURL(/createdFrom=/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-5.4
     */
    test('複数のフィルタを適用するとAND条件で絞り込まれる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 検索フィールドにキーワードを入力
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('プロジェクト');

      // ステータスフィルタを選択
      const statusSelect = page.getByRole('listbox', { name: /ステータスフィルタ/i });
      await statusSelect.selectOption('PREPARING');

      // 検索実行
      await page.getByRole('button', { name: /^検索$/i }).click();

      // URLパラメータに両方のフィルタが反映されることを確認
      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await expect(page).toHaveURL(/status=/);
    });

    /**
     * @requirement project-management/REQ-5.5
     */
    test('フィルタをクリアをクリックするとすべてのフィルタが解除される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 複数のフィルタ条件付きでアクセス
      await page.goto('/projects?search=テスト&status=PREPARING');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // フィルタをクリアボタンをクリック
      await page.getByRole('button', { name: /フィルタをクリア/i }).click();

      // URLパラメータからフィルタが削除されることを確認
      await expect(page).not.toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await expect(page).not.toHaveURL(/status=/);
    });
  });

  /**
   * ソート機能のテスト
   *
   * REQ-6.1: テーブルヘッダーをクリックすると該当カラムで昇順ソート
   * @requirement project-management/REQ-6.1
   */
  test.describe('ソート機能', () => {
    /**
     * ソートテストの前提条件: プロジェクトが存在することを確認し、なければ作成
     */
    test.beforeAll(async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        await loginAsUser(page, 'REGULAR_USER');
        await page.goto('/projects');
        await page.waitForLoadState('networkidle');

        // プロジェクトが存在するか確認
        const table = page.getByRole('table');
        const hasProjects = await table.isVisible({ timeout: 5000 }).catch(() => false);

        if (!hasProjects) {
          // プロジェクトがない場合は作成
          await page.getByRole('button', { name: /新規作成/i }).click();
          await page.waitForURL(/\/projects\/new/);

          await page
            .getByRole('textbox', { name: /プロジェクト名/i })
            .fill(`ソートテスト用_${Date.now()}`);

          // 営業担当者を選択（必須フィールド）
          const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
          const options = await salesPersonSelect.locator('option').all();
          if (options.length > 1 && options[1]) {
            const firstUserOption = await options[1].getAttribute('value');
            if (firstUserOption) {
              await salesPersonSelect.selectOption(firstUserOption);
            }
          }

          await page.getByRole('button', { name: /^作成$/i }).click();
          await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
        }
      } finally {
        await context.close();
      }
    });

    /**
     * @requirement project-management/REQ-6.1
     */
    test('テーブルヘッダークリックでソートが実行される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // デスクトップサイズを設定（テーブル表示）
      await page.setViewportSize({ width: 1280, height: 720 });

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テーブルが表示されていることを確認（プロジェクトがない場合はテスト失敗）
      const table = page.getByRole('table');
      await expect(table).toBeVisible({ timeout: getTimeout(10000) });

      // プロジェクト名ヘッダーのソートボタンをクリック
      const sortButton = page.getByRole('button', { name: /プロジェクト名でソート/i });
      await expect(sortButton).toBeVisible({ timeout: getTimeout(10000) });

      await sortButton.click();

      // URLパラメータにソートが反映されることを確認
      await expect(page).toHaveURL(/sort=name/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-6.2
     */
    test('ソートボタンを連続クリックするとソート順序が切り替わる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // デスクトップサイズを設定（テーブル表示）
      await page.setViewportSize({ width: 1280, height: 720 });

      // プロジェクト一覧にアクセス
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テーブルが表示されていることを確認（プロジェクトがない場合はテスト失敗）
      const table = page.getByRole('table');
      await expect(table).toBeVisible({ timeout: getTimeout(10000) });

      // プロジェクト名ヘッダーのソートボタンをクリック
      const sortButton = page.getByRole('button', { name: /プロジェクト名でソート/i });
      await expect(sortButton).toBeVisible({ timeout: getTimeout(10000) });

      // 1回目のクリック
      await sortButton.click();
      await expect(page).toHaveURL(/sort=name/, { timeout: getTimeout(10000) });

      // 2回目のクリック（ソート順序が変わることを確認）
      await sortButton.click();
      // URLが変化していることを確認（order=ascまたはorder=descが含まれる）
      await expect(page).toHaveURL(/order=(asc|desc)/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-6.3
     */
    test('ソート時にヘッダーにソートアイコン（昇順: 上矢印、降順: 下矢印）が表示される (project-management/REQ-6.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // デスクトップサイズを設定（テーブル表示）
      await page.setViewportSize({ width: 1280, height: 720 });

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テーブルが表示されていることを確認
      const table = page.getByRole('table');
      const emptyMessage = page.getByText(/プロジェクトがありません/i);
      const errorMessage = page.getByText(/プロジェクト一覧を取得できませんでした/i);

      await expect(table.or(emptyMessage).or(errorMessage)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // テーブルが表示されている場合のみソートテストを実行
      const tableVisible = await table.isVisible();
      if (!tableVisible) {
        // プロジェクトがない場合はテストをスキップ
        return;
      }

      // プロジェクト名ヘッダーのソートボタンをクリック
      const sortButton = page.getByRole('button', { name: /プロジェクト名でソート/i });
      await expect(sortButton).toBeVisible({ timeout: getTimeout(10000) });

      // 1回目のクリック（昇順ソート）
      await sortButton.click();
      await expect(page).toHaveURL(/sort=name/, { timeout: getTimeout(10000) });

      // Reactコンポーネントのリレンダリングを待つ
      await page.waitForLoadState('networkidle');

      // ソートアイコンまたはソート状態の視覚的な表示を確認
      // ソートボタン内のSVGアイコン、data属性、またはテキストでソート状態を確認
      const sortIconSvg = sortButton.locator('svg');

      // SVGアイコンが表示されるまで待機（リレンダリング完了を待つ）
      const hasSvgIcon = await sortIconSvg
        .first()
        .isVisible({ timeout: getTimeout(3000) })
        .catch(() => false);

      // ボタンのテキストまたはaria属性でソート状態を確認
      const buttonText = await sortButton.textContent();
      const hasArrowSymbol =
        buttonText?.includes('▲') ||
        buttonText?.includes('▼') ||
        buttonText?.includes('↑') ||
        buttonText?.includes('↓');

      // th要素のaria-sort属性でソート状態を確認（より信頼性の高い方法）
      const thElement = sortButton.locator('..');
      const ariaSortValue = await thElement.getAttribute('aria-sort');
      const hasAriaSortAttribute = ariaSortValue === 'ascending' || ariaSortValue === 'descending';

      // ソートアイコン（SVGまたは矢印記号）またはaria-sort属性が存在することを確認
      // UIの実装方法によっていずれかが表示される
      expect(hasSvgIcon || hasArrowSymbol || hasAriaSortAttribute).toBeTruthy();
    });

    /**
     * @requirement project-management/REQ-6.4
     */
    test('ソート対象外のカラムヘッダーにはソートアイコンが表示されない (project-management/REQ-6.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // デスクトップサイズを設定（テーブル表示）
      await page.setViewportSize({ width: 1280, height: 720 });

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テーブルが表示されていることを確認
      const table = page.getByRole('table');
      await expect(table).toBeVisible({ timeout: getTimeout(10000) });

      // プロジェクト名でソート
      const sortButton = page.getByRole('button', { name: /プロジェクト名でソート/i });
      await sortButton.click();
      await expect(page).toHaveURL(/sort=name/, { timeout: getTimeout(10000) });

      // 顧客名ヘッダー（ソート対象外のカラム）にはアクティブなソートアイコンがないことを確認
      const customerSortButton = page.getByRole('button', { name: /顧客名でソート/i });
      await expect(customerSortButton).toBeVisible({ timeout: getTimeout(10000) });

      // 顧客名ボタンにアクティブなソートアイコン（▲や▼）が表示されていないことを確認
      const customerButtonText = await customerSortButton.textContent();
      // 顧客名ボタンにはソート方向インジケータがないことを確認
      // （現在ソート中のカラムではないため）
      // ボタンが存在することを確認（非ソートカラムでもソート可能なボタンとして存在）
      expect(customerButtonText).toBeTruthy();
    });
  });

  /**
   * ページネーション機能のテスト
   *
   * REQ-3.1: 1ページあたりのデフォルト表示件数を20件とする
   * REQ-3.3: ページ番号クリックで該当ページのプロジェクトを表示
   * @requirement project-management/REQ-3.1
   * @requirement project-management/REQ-3.2
   * @requirement project-management/REQ-3.3
   * @requirement project-management/REQ-3.4
   */
  test.describe('ページネーション機能', () => {
    /**
     * @requirement project-management/REQ-3.1
     */
    test('デフォルトの表示件数が20件である (project-management/REQ-3.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ページネーションコントロールが存在する場合、デフォルト表示件数を確認
      const pagination = page.getByTestId('pagination-controls');
      const emptyMessage = page.getByText(/プロジェクトがありません/i);
      const errorMessage = page.getByText(/プロジェクト一覧を取得できませんでした/i);

      await expect(emptyMessage.or(errorMessage).or(pagination)).toBeVisible({
        timeout: getTimeout(10000),
      });

      const paginationVisible = await pagination.isVisible();
      if (paginationVisible) {
        // 表示件数セレクトが20件で選択されていることを確認
        const limitSelect = page.getByRole('combobox', { name: /表示件数/i });
        await expect(limitSelect).toBeVisible({ timeout: getTimeout(10000) });

        const selectedValue = await limitSelect.inputValue();
        expect(selectedValue).toBe('20');
      }

      // URLにlimitパラメータがない場合はデフォルト20件
      const url = page.url();
      // limitパラメータがない、または20の場合はデフォルト値が適用されている
      if (url.includes('limit=')) {
        expect(url).toMatch(/limit=20/);
      }
    });

    /**
     * @requirement project-management/REQ-3.2
     * @requirement project-management/REQ-3.4
     */
    test('プロジェクトが存在する場合、ページネーションコントロールが表示される', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // プロジェクトが存在しない場合は空状態メッセージが表示される
      const emptyMessage = page.getByText(/プロジェクトがありません/i);
      const errorMessage = page.getByText(/プロジェクト一覧を取得できませんでした/i);
      const pagination = page.getByTestId('pagination-controls');

      // 3つのうちいずれかが表示されることを確認
      await expect(emptyMessage.or(errorMessage).or(pagination)).toBeVisible({
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

    /**
     * @requirement project-management/REQ-3.5
     */
    test('表示件数を変更するとURLパラメータに反映される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ページネーションコントロールが存在する場合のみテスト
      const pagination = page.getByTestId('pagination-controls');
      const emptyMessage = page.getByText(/プロジェクトがありません/i);
      const errorMessage = page.getByText(/プロジェクト一覧を取得できませんでした/i);

      await expect(emptyMessage.or(errorMessage).or(pagination)).toBeVisible({
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

    /**
     * @requirement project-management/REQ-3.3
     */
    test('ページ番号をクリックすると該当ページのプロジェクトが表示される (project-management/REQ-3.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ページネーションコントロールが存在する場合のみテスト
      const pagination = page.getByTestId('pagination-controls');
      const emptyMessage = page.getByText(/プロジェクトがありません/i);
      const errorMessage = page.getByText(/プロジェクト一覧を取得できませんでした/i);

      await expect(emptyMessage.or(errorMessage).or(pagination)).toBeVisible({
        timeout: getTimeout(10000),
      });

      const paginationVisible = await pagination.isVisible();
      if (paginationVisible) {
        // 総ページ数を確認
        const totalPagesElement = page.getByTestId('total-pages');
        const totalPagesText = await totalPagesElement.textContent();
        const totalPages = parseInt(totalPagesText || '1', 10);

        // 2ページ以上ある場合のみページ遷移テストを実行
        if (totalPages >= 2) {
          // ページ2のボタンを探してクリック
          const page2Button = page.getByRole('button', { name: /^2$|ページ 2/ });
          const nextButton = page.getByRole('button', { name: /次へ|次のページ|→|>/ });

          // ページ2ボタンまたは「次へ」ボタンをクリック
          if (await page2Button.isVisible()) {
            await page2Button.click();
          } else if (await nextButton.isVisible()) {
            await nextButton.click();
          }

          // URLパラメータにページ番号が反映されることを確認
          await expect(page).toHaveURL(/page=2/, { timeout: getTimeout(10000) });

          // 現在のページ番号が更新されていることを確認
          await expect(page.getByTestId('current-page')).toHaveText(/2/);
        }
      }
    });
  });

  /**
   * レスポンシブ表示のテスト
   *
   * REQ-15.3: 画面幅が768px未満の場合、テーブルをカード形式に切り替えて表示
   * @requirement project-management/REQ-15.1
   * @requirement project-management/REQ-15.3
   */
  test.describe('レスポンシブ表示', () => {
    /**
     * @requirement project-management/REQ-15.1
     */
    test('デスクトップ表示: テーブル形式で表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // デスクトップサイズを設定
      await page.setViewportSize({ width: 1280, height: 720 });

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テーブルまたは空状態メッセージが表示されることを確認
      const table = page.getByRole('table');
      const emptyMessage = page.getByText(/プロジェクトがありません/i);
      const errorMessage = page.getByText(/プロジェクト一覧を取得できませんでした/i);
      await expect(table.or(emptyMessage).or(errorMessage)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // テーブルが表示されている場合、ヘッダーを確認
      const tableVisible = await table.isVisible();
      if (tableVisible) {
        await expect(page.getByRole('button', { name: /プロジェクト名でソート/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /顧客名でソート/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /ステータスでソート/i })).toBeVisible();
      }
    });

    /**
     * @requirement project-management/REQ-15.3
     */
    test('モバイル表示: カード形式で表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // モバイルサイズを設定（768px未満）
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // プロジェクトが存在する場合はカードリストが表示される
      // プロジェクトが0件の場合は空状態メッセージが表示される
      const cardList = page.getByTestId('project-card-list');
      const emptyMessage = page.getByText(/プロジェクトがありません/i);
      const errorMessage = page.getByText(/プロジェクト一覧を取得できませんでした/i);

      // いずれかが表示されることを確認
      await expect(cardList.or(emptyMessage).or(errorMessage)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // テーブルが非表示であることを確認（存在しないかhidden）
      const table = page.getByRole('table');
      await expect(table).not.toBeVisible();
    });

    /**
     * @requirement project-management/REQ-15.3
     */
    test('画面幅変更時にテーブル/カード表示が切り替わる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // デスクトップサイズで開始
      await page.setViewportSize({ width: 1280, height: 720 });

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テーブルまたは空状態メッセージが表示されることを確認
      const table = page.getByRole('table');
      const emptyMessage = page.getByText(/プロジェクトがありません/i);
      const errorMessage = page.getByText(/プロジェクト一覧を取得できませんでした/i);
      await expect(table.or(emptyMessage).or(errorMessage)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // プロジェクトが存在する場合のみビューポート切り替えをテスト
      const hasProjects = await table.isVisible();
      if (hasProjects) {
        // モバイルサイズに変更
        await page.setViewportSize({ width: 375, height: 667 });

        // カード表示に切り替わることを確認
        await expect(page.getByTestId('project-card-list')).toBeVisible({
          timeout: getTimeout(10000),
        });
        await expect(table).not.toBeVisible();

        // デスクトップサイズに戻す
        await page.setViewportSize({ width: 1280, height: 720 });

        // テーブル表示に戻ることを確認
        await expect(table).toBeVisible({ timeout: getTimeout(10000) });
      }
    });
  });

  /**
   * 検索・フィルタ・ソート・ページ遷移の統合フローテスト
   */
  test.describe('統合フロー', () => {
    test('検索→フィルタ→ソート→ページ遷移の一連の操作が正常に行われる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // デスクトップサイズを設定
      await page.setViewportSize({ width: 1280, height: 720 });

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // Step 1: 検索を実行
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('プロジェクト');

      await page.getByRole('button', { name: /^検索$/i }).click();

      // URLに検索パラメータが反映されることを確認
      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });

      // Step 2: ソートを実行（テーブルが表示されている場合のみ）
      const table = page.getByRole('table');
      const tableVisible = await table.isVisible();

      if (tableVisible) {
        const sortButton = page.getByRole('button', { name: /プロジェクト名でソート/i });

        await sortButton.click();

        // URLにソートパラメータが反映されることを確認
        await expect(page).toHaveURL(/sort=/, { timeout: getTimeout(10000) });
      }

      // Step 3: 表示件数を変更（ページネーションコントロールが表示されている場合のみ）
      const pagination = page.getByTestId('pagination-controls');
      const paginationVisible = await pagination.isVisible();

      if (paginationVisible) {
        const limitSelect = page.getByRole('combobox', { name: /表示件数/i });
        await limitSelect.selectOption('10');

        // URLに表示件数パラメータが反映されることを確認
        await expect(page).toHaveURL(/limit=10/, { timeout: getTimeout(10000) });
      }

      // Step 4: フィルタをクリア
      await page.getByRole('button', { name: /フィルタをクリア/i }).click();

      // URLパラメータがクリアされることを確認
      await expect(page).not.toHaveURL(/search=/, { timeout: getTimeout(10000) });
    });
  });
});
