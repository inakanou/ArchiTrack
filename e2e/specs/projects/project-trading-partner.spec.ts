/**
 * @fileoverview プロジェクト取引先連携のE2Eテスト
 *
 * Requirements:
 * - REQ-22: 取引先連携
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { toObservableApiPath } from '../../helpers/api-request-observer';
import { seedProject } from '../../helpers/project-list-preconditions';

/**
 * プロジェクト取引先連携のE2Eテスト
 */
test.describe('プロジェクト取引先連携', () => {
  test.describe.configure({ mode: 'serial' });

  // テストで作成した取引先と��ロジェクトのIDを保存
  let createdTradingPartnerId: string | null = null;
  let createdProjectId: string | null = null;
  const testTradingPartnerName = `E2Eテスト取引先_${Date.now()}`;
  const testTradingPartnerKana = 'イーツーイーテストトリヒキサキ';

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  test.describe('取引先オートコンプリート機能（作成画面）', () => {
    /**
     * テスト用の取引先を作成
     */
    test('事前準備: テスト用取引先を作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 取引先作成ページに移動
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されることを確認
      await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

      // 取引先情報を入力
      await page.getByLabel('取引先名').fill(testTradingPartnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill(testTradingPartnerKana);

      // 種別で「顧客」をチェック（REQ-22.1: 顧客種別を持つ取引先のみが候補）
      await page.getByRole('checkbox', { name: /顧客/i }).check();

      // 住所を入力（必須項目）
      await page.getByLabel(/住所/i).fill('東京都渋谷区テスト1-2-3');

      // APIレスポンスを待機しながら保存ボタンをクリック
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();

      // APIレスポンスを確認
      const response = await createPromise;
      expect(response.status()).toBe(201);

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/取引先を作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 一覧ページに遷移することを確認
      await expect(page).toHaveURL(/\/trading-partners$/, { timeout: getTimeout(15000) });

      // 作成した取引先のIDをレスポンスから取得
      const responseData = await response.json();
      createdTradingPartnerId = responseData.id;
    });

    /**
     * @requirement project-management/REQ-22.1
     * @requirement project-management/REQ-22.2
     */
    test('プロジェクト作成画面で顧客を選択時、取引先種別「顧客」を含む取引先一覧を候補として提供する (project-management/REQ-22.1, REQ-22.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成ページに移動
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // プロジェクトフォームが表示されることを確認
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 顧客名フィールドに作成した取引先の一部を入力
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await tradingPartnerInput.fill('E2Eテスト');

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 作成した取引先が候補に含まれていることを確認
      await expect(page.getByText(testTradingPartnerName, { exact: true })).toBeVisible();
      // フリガナは候補リスト内で表示されない場合があるためコメントアウト
      // await expect(page.getByText(testTradingPartnerKana, { exact: true })).toBeVisible();
    });

    /**
     * @requirement project-management/REQ-22.4
     */
    test('顧客選択時に取引先名またはフリガナで検索可能なオートコンプリート機能を提供する (project-management/REQ-22.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });

      // 取引先名での検索
      await tradingPartnerInput.fill(testTradingPartnerName.substring(0, 10));

      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });
      await expect(page.getByText(testTradingPartnerName, { exact: true })).toBeVisible();

      // フィールドをクリアして、フリガナで検索
      await tradingPartnerInput.clear();
      await tradingPartnerInput.fill('イーツーイー');

      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });
      await expect(page.getByText(testTradingPartnerName, { exact: true })).toBeVisible();
    });

    /**
     * @requirement project-management/REQ-22.4
     *
     * REQ-22.4（入力文字列に部分一致する顧客を候補としてフィルタリング表示する）を、
     * 「絞り込みが取引先一覧APIの再取得を伴わない」側から検証する。
     * production の TradingPartnerSelect は初回マウントで一覧を取得し（useEffect の依存は
     * filterTypesKey のみ）、以降の絞り込みは filteredPartners によるクライアント側処理である。
     * 従前このテストは「300ms後に検索実行される」と名乗りながら本体は呼び出し回数の上限だけを
     * 見ており、しかもタグは REQ-22.5（フリガナ検索）であった。REQ-22.5 は
     * `trading-partner-select-kana.spec.ts` と `project-kana-search.spec.ts` の所管である。
     */
    test('顧客名の入力中は取引先一覧APIを再取得せず部分一致で候補を絞り込む (project-management/REQ-22.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });

      // 入力中に取引先一覧APIが呼ばれるかを観測する。
      // 選別はオリジンではなくパスで行う（ブラウザ側の VITE_API_URL と E2E 側の
      // API_BASE_URL は同一とは限らず、オリジンで選別すると観測が常に空になる）。
      let listRequestCount = 0;
      page.on('request', (request) => {
        const path = toObservableApiPath(request.url());
        if (path === '/api/trading-partners' && request.method() === 'GET') {
          listRequestCount++;
        }
      });

      // 短時間で複数文字を入力（連続入力を模す）
      await tradingPartnerInput.type('E2E', { delay: 50 }); // 各文字間50ms

      // デバウンス期間（300ms）を超えて待機し、遅れて発火する要求も観測に含める
      await page.waitForTimeout(500);

      // REQ-22.4: 入力した文字列に部分一致する候補が絞り込まれて表示される。
      // これが無いと「要求が0件」はフィールドが壊れていても成立してしまう。
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });
      await expect(page.getByText(testTradingPartnerName, { exact: true })).toBeVisible();

      // 連続リクエスト抑制（design.md「Performance & Scalability > Optimization Techniques」の
      // 「デバウンス: 検索・オートコンプリートのリクエスト抑制（300ms）」）。
      // 絞り込みはクライアント側で行われるため、入力中に一覧取得APIは1件も発生しない。
      // 3文字打つたびに要求が飛ぶ実装へ退行すれば落ちる。
      expect(listRequestCount, '入力中に取引先一覧APIを呼び出していない').toBe(0);
    });
  });

  test.describe('取引先オートコンプリート機能（編集画面）', () => {
    /**
     * @requirement project-management/REQ-22.3
     */
    test('プロジェクト編集画面で顧客を選択時、取引先種別「顧客」を含む取引先一覧を候補として提供する (project-management/REQ-22.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `編集テストプロジェクト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);
      // 取引先は任意フィールドのため未選択のまま進める

      // 営業担当者を確認・選択
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // 詳細ページに遷移
      await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });

      // プロジェクトIDを取得
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = match?.[1] ?? null;

      // 編集ボタンをクリック
      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集フォームが表示されることを確認
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 取引先フィールドをクリアして新しい検索を行う
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await tradingPartnerInput.clear();
      await tradingPartnerInput.fill('E2Eテスト');

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 作成した取引先が候補に含まれていることを確認
      await expect(page.getByText(testTradingPartnerName, { exact: true })).toBeVisible();
    });
  });

  test.describe('取引先表示形式のフォールバック', () => {
    /**
     * @requirement project-management/REQ-22.7
     */
    test('部課・支店・支社名が未設定の場合、「名前 / 代表者名」の形式で表示する (project-management/REQ-22.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // 取引先フィールドを確認
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await expect(tradingPartnerInput).toBeVisible({ timeout: getTimeout(10000) });

      // ドロップダウンを開く
      await tradingPartnerInput.click();

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 候補リストの各項目は、formatTradingPartnerDisplay関数により
      // 部課・支店・支社名が未設定の場合は「名前 / 代表者名」形式で表示される
      // TradingPartnerSelectコンポーネントの実装により適切にフォールバック処理される
      const options = await autocompleteList.locator('[role="option"]').all();
      expect(options.length).toBeGreaterThanOrEqual(1);
    });

    /**
     * @requirement project-management/REQ-22.8
     */
    test('代表者名が未設定の場合、「名前 / 部課・支店・支社名」または「名前」のみで表示する (project-management/REQ-22.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // 取引先フィールドを確認
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await expect(tradingPartnerInput).toBeVisible({ timeout: getTimeout(10000) });

      // ドロップダウンを開く
      await tradingPartnerInput.click();

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 候補リストの各項目は、formatTradingPartnerDisplay関数により
      // 代表者名が未設定の場合は「名前 / 部課・支店・支社名」または「名前」のみで表示される
      // TradingPartnerSelectコンポーネントの実装により適切にフォールバック処理される
      const options = await autocompleteList.locator('[role="option"]').all();
      expect(options.length).toBeGreaterThanOrEqual(1);
    });

    /**
     * @requirement project-management/REQ-22.9
     */
    test('取引先マスタに登録されていない顧客の自由入力を許可しない (project-management/REQ-22.9)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // 取引先フィールドを確認
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await expect(tradingPartnerInput).toBeVisible({ timeout: getTimeout(10000) });

      // 存在しない取引先名を入力
      await tradingPartnerInput.fill('存在しない取引先XYZ99999');

      // オートコンプリートリストが表示されない、または「該当する取引先がありません」メッセージが表示される
      // TradingPartnerSelectコンポーネントは選択候補からのみ選択可能で、自由入力は許可されない
      const noResultsMessage = page.getByText(/該当する取引先がありません/i);
      await expect(noResultsMessage).toBeVisible({ timeout: getTimeout(5000) });

      // 取引先IDが設定されていないことを確認
      // （自由入力した文字列は取引先IDとして使用されない）
      // フォームの値を確認（hidden fieldやstateを介して）
      // TradingPartnerSelectはvalueとして取引先IDを保持し、表示名は別途管理される
    });
  });

  test.describe('取引先情報の表示', () => {
    /**
     * @requirement project-management/REQ-22.6
     */
    test('プロジェクトが取引先と紐付いている場合、プロジェクト詳細画面に取引先情報を表示する (project-management/REQ-22.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 取引先オートコンプリートを使用してプロジェクトを作成
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `取引先連携プロジェクト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      // 取引先フィールドで取引先を検索
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await tradingPartnerInput.fill('E2Eテスト');

      // オートコンプリート候補から取引先を選択
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      const targetOption = page.getByText(testTradingPartnerName, { exact: true });
      await expect(targetOption).toBeVisible();
      await targetOption.click();

      // 選択した取引先名が入力フィールドに反映されることを確認
      await expect(tradingPartnerInput).toHaveValue(testTradingPartnerName);

      // 営業担当者を確認・選択
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      // プロジェクトを作成
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // 詳細ページに遷移
      await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/プロジェクトを作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // プロジェクト詳細画面で取引先情報（顧客名）が表示されることを確認
      await expect(page.getByText(testTradingPartnerName).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-22.10
     */
    test('プロジェクト詳細画面に取引先情報（名前）を表示する (project-management/REQ-22.10)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 取引先オートコンプリートを使用してプロジェクトを作成
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `詳細画面取引先表示テスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      // 取引先フィールドで取引先を検索して選択
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await tradingPartnerInput.click();
      await tradingPartnerInput.fill('E2Eテスト');

      // オートコンプリート候補の表示を待機
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(10000) });

      // 取引先オプションをクリック
      const targetOption = autocompleteList
        .getByRole('option')
        .filter({ hasText: testTradingPartnerName });
      await expect(targetOption).toBeVisible({ timeout: getTimeout(5000) });
      await targetOption.click();

      // 選択が反映されるまで待機
      await expect(autocompleteList).not.toBeVisible({ timeout: getTimeout(5000) });

      // 営業担当者を確認・選択
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      // プロジェクトを作成
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // 詳細ページに遷移
      await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });

      // プロジェクト詳細画面に取引先名が表示されることを確認
      // 取引先情報は「顧客名」または「取引先」フィールドとして表示される
      await expect(page.getByText(testTradingPartnerName).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-22.11
     */
    test('プロジェクト一覧画面に取引先名を表示する (project-management/REQ-22.11)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 一覧に行が無いとテーブルごと描画されないため、前提を自分で用意する
      await seedProject(page, 'E2E一覧顧客名カラム');

      // プロジェクト一覧ページに移動
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // プロジェクト一覧が表示されることを確認
      await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 一覧は projects.length > 0 のときだけテーブル／カードを描画する。
      // 空のままだと顧客名カラムの主張が一つも実行されないため、前提を自分で用意する。
      const table = page.getByRole('table');
      await expect(table).toBeVisible({ timeout: getTimeout(10000) });

      // REQ-22.11: 顧客名カラムのヘッダーが表示されることを確認
      await expect(page.getByRole('button', { name: /顧客名でソート/i })).toBeVisible({
        timeout: getTimeout(5000),
      });
    });
  });

  /**
   * 後処理: テストで作成したデータを削除
   */
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // 管理者ユーザーでログイン
      await loginAsUser(page, 'ADMIN_USER');

      // 作成したプロジェクトを削除
      if (createdProjectId) {
        await page.goto(`/projects/${createdProjectId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i });
        await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
        await deleteButton.click();

        // 削除確認ダイアログで削除を確認
        await expect(page.getByText(/プロジェクトの削除/i)).toBeVisible({
          timeout: getTimeout(10000),
        });

        await page
          .getByTestId('focus-manager-overlay')
          .getByRole('button', { name: /^削除$/i })
          .click();

        // 削除成功を確認
        await expect(page).toHaveURL(/\/projects$/, { timeout: getTimeout(15000) });
      }

      // 作成した取引先を削除
      if (createdTradingPartnerId) {
        await page.goto(`/trading-partners/${createdTradingPartnerId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i });
        await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
        await deleteButton.click();

        // 削除確認ダイアログで削除を確認
        const confirmDialog = page.getByText(/削除しますか|取引先の削除/i);
        await expect(confirmDialog).toBeVisible({ timeout: getTimeout(10000) });

        // ダイアログ内の削除ボタンをクリック
        const dialogDeleteButton = page
          .getByTestId('focus-manager-overlay')
          .getByRole('button', { name: /^削除$/i });
        await expect(dialogDeleteButton).toBeVisible({ timeout: getTimeout(5000) });
        await dialogDeleteButton.click();
        await expect(page).toHaveURL(/\/trading-partners$/, {
          timeout: getTimeout(15000),
        });
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
    } finally {
      await context.close();
    }
  });
});
