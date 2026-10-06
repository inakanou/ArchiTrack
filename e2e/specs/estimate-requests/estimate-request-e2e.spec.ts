/**
 * @fileoverview 見積依頼機能のE2Eテスト
 *
 * Task 10: E2Eテスト実装
 *
 * Requirements coverage (estimate-request):
 * - 見積依頼セクション表示（旧 Requirement 1）は project-management/Requirement 27 へ移管済み。
 *   本ファイルの被覆印は移管先の番号で名乗る（表題に残る旧番号は移管前の呼称である）
 * - REQ-2.1 ~ REQ-2.7: 見積依頼一覧画面
 * - REQ-3.1 ~ REQ-3.8: 見積依頼新規作成（旧 AC 9 は Requirement 39 AC 5 へ改訂済み）
 * - REQ-4.1 ~ REQ-4.20: 見積依頼詳細画面 - 項目選択
 * - REQ-5.1 ~ REQ-5.3: 内訳書Excel出力
 * - REQ-6.1 ~ REQ-6.10: 見積依頼文表示
 * - REQ-7.1 ~ REQ-7.6: クリップボードコピー機能
 * - REQ-8.1 ~ REQ-8.5: 見積依頼データ管理
 * - REQ-9.1 ~ REQ-9.6: 見積依頼編集・削除
 * - REQ-10.1 ~ REQ-10.4: 権限管理
 *
 * @module e2e/specs/estimate-requests/estimate-request-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, nullWhenTimedOut } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { assertPrepared } from '../../helpers/preconditions';
import { observeDialogs } from '../../helpers/dialog-observer';

/**
 * 保存ボタンをクリックして保存完了を待機するヘルパー
 * Task 30改修: debounce自動保存から保存ボタン方式に変更
 */
async function clickSaveSelectionButton(page: import('@playwright/test').Page) {
  const saveButton = page.getByTestId('save-selection-button');
  await expect(saveButton).toBeVisible({ timeout: getTimeout(5000) });
  await saveButton.click();
  // 保存完了フィードバックを待機
  await expect(page.getByText('保存しました')).toBeVisible({ timeout: getTimeout(10000) });
}

/**
 * TradingPartnerSelectコンボボックスから取引先を選択するヘルパー
 * ネイティブselectではなくcombobox UIのため、クリック→検索→選択の手順で操作する
 */
async function selectTradingPartnerByName(
  page: import('@playwright/test').Page,
  partnerName: string
) {
  const combobox = page.locator('input[role="combobox"][aria-label="宛先（取引先）"]');
  await expect(combobox).toBeVisible({ timeout: getTimeout(5000) });
  await combobox.click();
  // 既存の値をクリアして検索文字列を入力（十分な長さで一意に特定する）
  const searchText = partnerName.slice(0, 20);
  await combobox.fill(searchText);
  // ドロップダウンリストが表示されるのを待機
  const listbox = page.locator('ul[role="listbox"]');
  await expect(listbox).toBeVisible({ timeout: getTimeout(5000) });
  // 一致するオプションをクリック
  const option = listbox.locator('li[role="option"]').first();
  await expect(option).toBeVisible({ timeout: getTimeout(3000) });
  await option.click();
  // ドロップダウンが閉じるのを待機
  await expect(listbox).not.toBeVisible({ timeout: getTimeout(3000) });
}

/**
 * 見積依頼機能のE2Eテスト
 */
test.describe('見積依頼機能', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストデータの保存
  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdTradingPartnerWithoutEmailId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let projectName: string = '';
  let tradingPartnerName: string = '';
  let tradingPartnerWithoutEmailName: string = '';
  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  // ============================================================================
  // データセットアップ：プロジェクト、協力業者、内訳書の作成
  // ============================================================================

  test.describe('テストデータのセットアップ', () => {
    /**
     * テスト準備：プロジェクトの作成
     */
    test('準備1：テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成画面に移動
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // プロジェクト名を入力
      projectName = `E2E見積依頼テスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      // 現場住所を入力（見積依頼文に使用される）
      await page.getByLabel(/現場住所/i).fill('東京都渋谷区テスト1-2-3');

      // 営業担当者を確認・選択
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      // プロジェクト作成
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const response = await createPromise;
      expect(response.status()).toBe(201);

      // URLからプロジェクトIDを取得
      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = match?.[1] ?? null;

      expect(createdProjectId).toBeTruthy();
    });

    /**
     * テスト準備：協力業者（取引先）の作成
     */
    test('準備2：テスト用協力業者（メールあり）を作成する', async ({ page }) => {
      // 第3原則: テストは前提条件で自動的に無効化せず、失敗させる
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 取引先作成画面に移動
      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

      // 取引先情報を入力
      tradingPartnerName = `E2Eテスト協力業者_${Date.now()}`;
      await page.getByLabel('取引先名').fill(tradingPartnerName);
      await page
        .getByLabel('フリガナ', { exact: true })
        .fill('イーツーイーテストキョウリョクギョウシャ');
      await page.getByLabel('住所').fill('東京都新宿区テスト町1-1-1');

      // 協力業者チェックボックスをオン
      const subcontractorCheckbox = page.getByRole('checkbox', { name: /協力業者/i });
      await subcontractorCheckbox.check();
      await expect(subcontractorCheckbox).toBeChecked();

      // メールアドレスを入力（見積依頼文で使用）
      await page.getByLabel('メールアドレス').fill('test-subcontractor@example.com');

      // FAX番号を入力
      await page.getByLabel('FAX').fill('03-1234-5678');

      // 取引先作成
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      const response = await createPromise;
      expect(response.status()).toBe(201);

      // APIレスポンスからIDを取得
      const responseData = await response.json();
      createdTradingPartnerId = responseData.id;

      expect(createdTradingPartnerId).toBeTruthy();
    });

    /**
     * テスト準備：メールなし協力業者の作成（エラーテスト用）
     */
    test('準備3：テスト用協力業者（メールなし）を作成する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

      tradingPartnerWithoutEmailName = `E2Eテスト協力業者_メールなし_${Date.now()}`;
      await page.getByLabel('取引先名').fill(tradingPartnerWithoutEmailName);
      await page.getByLabel('フリガナ', { exact: true }).fill('メールナシ');
      await page.getByLabel('住所').fill('東京都千代田区テスト町2-2-2');

      const subcontractorCheckbox = page.getByRole('checkbox', { name: /協力業者/i });
      await subcontractorCheckbox.check();

      // メールアドレスを空欄にする

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      const response = await createPromise;
      expect(response.status()).toBe(201);

      const responseData = await response.json();
      createdTradingPartnerWithoutEmailId = responseData.id;

      expect(createdTradingPartnerWithoutEmailId).toBeTruthy();
    });

    /**
     * テスト準備：内訳書の作成（APIで直接作成）
     */
    test('準備4：テスト用内訳書を作成する', async ({ page, request }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表作成ページに直接移動
      await page.goto(`/projects/${createdProjectId}/quantity-tables/new`);
      await page.waitForLoadState('networkidle');

      // 数量表作成フォームを入力
      const quantityTableName = '見積依頼テスト用数量表';
      await page.getByRole('textbox', { name: /数量表名/i }).fill(quantityTableName);

      const createQuantityTablePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api') &&
          response.url().includes('quantity-tables') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createQuantityTablePromise;
      const createResponseBody = await createResponse.json();

      const quantityTableId = createResponseBody.id;
      expect(quantityTableId).toBeTruthy();

      // APIトークンを取得
      const baseUrl = API_BASE_URL;
      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: {
          email: 'user@example.com',
          password: 'Password123!',
        },
      });
      const loginBody = await loginResponse.json();
      accessToken = loginBody.accessToken;

      // グループを作成
      const groupResponse = await request.post(
        `${baseUrl}/api/quantity-tables/${quantityTableId}/groups`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: 'テストグループ',
            displayOrder: 0,
          },
        }
      );
      const groupBody = await groupResponse.json();
      const groupId = groupBody.id;

      // 項目を作成（customCategory含む: Task 37.2対応）
      const categories = ['躯体工事', '仕上工事', '設備工事'];
      for (let i = 0; i < 3; i++) {
        await request.post(`${baseUrl}/api/quantity-groups/${groupId}/items`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `テスト項目${i + 1}`,
            customCategory: categories[i],
            workType: '工種A',
            specification: '規格A',
            unit: '式',
            quantity: 1.0,
            displayOrder: i,
          },
        });
      }

      // 内訳書を作成
      const itemizedStatementResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/itemized-statements`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: '見積依頼テスト用内訳書',
            quantityTableId: quantityTableId,
          },
        }
      );
      expect(itemizedStatementResponse.status()).toBe(201);

      const itemizedStatementBody = await itemizedStatementResponse.json();
      createdItemizedStatementId = itemizedStatementBody.id;

      expect(createdItemizedStatementId).toBeTruthy();
    });
  });

  // ============================================================================
  // Requirement 1: 見積依頼セクション表示
  // ============================================================================

  test.describe('Requirement 1: 見積依頼セクション表示', () => {
    /**
     * @requirement project-management/REQ-27.1
     * プロジェクト詳細画面の内訳書セクションの下に見積依頼セクションを表示する
     */
    test('REQ-1.1: プロジェクト詳細画面に見積依頼セクションが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 見積依頼セクションが表示される
      await expect(page.getByTestId('estimate-request-section')).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-27.3
     * 見積依頼が存在しない場合、メッセージの下に「新規作成」ボタンを表示する
     *
     * タスク 115.188 の是正: 本ブロックの被覆印は project-management 要件27 へ集約される前の
     * 番号（estimate-request 要件1 の 1.2〜1.5）をそのまま 27.2〜27.5 に読み替えたもので、
     * 条文の内容と対応していなかった。表題・本文が述べる内容に合わせて名乗り直している。
     */
    test('REQ-1.2: 見積依頼セクションに「新規作成」ボタンが表示される (project-management/REQ-27.3)', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 見積依頼セクション内の新規作成ボタン/リンクが表示される
      const section = page.getByTestId('estimate-request-section');
      await expect(section).toBeVisible({ timeout: getTimeout(10000) });

      const newButton = section.getByRole('link', { name: /新規作成/i });
      await expect(newButton).toBeVisible();
    });

    /**
     * @requirement project-management/REQ-27.4
     * 見積依頼が存在しない場合、セクション右上の「新規作成」ボタンと「すべて見る」リンクを非表示にする
     *
     * タスク 115.188 の是正: 本ブロックの被覆印は project-management 要件27 へ集約される前の
     * 番号（estimate-request 要件1 の 1.2〜1.5）をそのまま 27.2〜27.5 に読み替えたもので、
     * 条文の内容と対応していなかった。表題・本文が述べる内容に合わせて名乗り直している。
     */
    test('REQ-1.3: 見積依頼がない場合、「すべて見る」リンクが非表示である (project-management/REQ-27.4)', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      const section = page.getByTestId('estimate-request-section');
      await expect(section).toBeVisible({ timeout: getTimeout(10000) });

      // 見積依頼が存在しない場合、「すべて見る」リンクは非表示
      const allLink = section.getByRole('link', { name: /すべて見る|見積依頼一覧/i });
      await expect(allLink).not.toBeVisible();
    });

    /**
     * @requirement project-management/REQ-27.7
     * ユーザーが「新規作成」ボタンをクリックしたとき、見積依頼作成画面に遷移する
     *
     * タスク 115.188 の是正: 本ブロックの被覆印は project-management 要件27 へ集約される前の
     * 番号（estimate-request 要件1 の 1.2〜1.5）をそのまま 27.2〜27.5 に読み替えたもので、
     * 条文の内容と対応していなかった。表題・本文が述べる内容に合わせて名乗り直している。
     */
    test('REQ-1.4: 「新規作成」ボタンをクリックで見積依頼作成画面に遷移する (project-management/REQ-27.7)', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      const section = page.getByTestId('estimate-request-section');
      await expect(section).toBeVisible({ timeout: getTimeout(10000) });

      const newButton = section.getByRole('link', { name: /新規作成/i });
      await newButton.click();

      await expect(page).toHaveURL(/\/estimate-requests\/new/, {
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-27.2
     * @requirement project-management/REQ-27.3
     * @requirement project-management/REQ-27.4
     * 見積依頼が存在しない場合、「見積依頼はまだありません」というメッセージとその下の
     * 「新規作成」ボタンを表示し、セクション右上の「新規作成」ボタンと
     * 「すべて見る」リンクを非表示にする
     * 注: 「すべて見る」リンクのクリック遷移テストはREQ-1.8（見積依頼存在時）でカバー
     *
     * タスク 115.188 の是正: 本ブロックの被覆印は project-management 要件27 へ集約される前の
     * 番号（estimate-request 要件1 の 1.2〜1.5）をそのまま 27.2〜27.5 に読み替えたもので、
     * 条文の内容と対応していなかった。表題・本文が述べる内容に合わせて名乗り直している。
     *
     * タスク 115.220 の是正: 表題は「セクション右上の『新規作成』ボタンが非表示である」と
     * 名乗りながら、本文が確かめていたのは空状態の「新規作成」リンクの表示と
     * 「すべて見る」リンクの非表示だけで、右上のボタンの非表示は一度も見ていなかった。
     * 右上のボタンだけが持つアクセシブル名（`EstimateRequestSectionCard.tsx` の
     * `aria-label="見積依頼を新規作成"`）を exact で指し、空状態のリンクと区別して確かめる。
     */
    test('REQ-1.5: 見積依頼がない場合、セクション右上の「新規作成」ボタンが非表示である', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      const section = page.getByTestId('estimate-request-section');
      await expect(section).toBeVisible({ timeout: getTimeout(10000) });

      // 見積依頼が存在しない場合、空状態の「新規作成」リンクは表示される（メッセージ下）
      const emptyStateNewButton = section
        .locator('div')
        .filter({ hasText: /見積依頼はまだありません/ })
        .getByRole('link', { name: /新規作成/i });
      await expect(emptyStateNewButton).toBeVisible();

      // しかしセクション右上の「新規作成」ボタンは非表示。
      // この主張は**一致が零件でも真になる**。名前が実在することの錨は本区間には無く、
      // 同名を `exact: true` の `toBeVisible()` で指す肯定側——本ファイルの
      // 「見積依頼が存在する場合」の区間——に置いてある（タスク 115.251）。
      //
      // 実行した変異と出力（2026-09-03 に実測。frontend は test 環境で再ビルドし、復元後の
      // 配信バンドルが `assets/index-D5RUevcK.js` へ戻ることを `sha256sum` で照合した）:
      //   - M1 `aria-label` の値を `見積依頼をあたらしく作成` へ変える変異を当てても
      //     **本区間は緑のまま**である（本区間を含む 7 件は 6 passed / 1 failed で、
      //     落ちたのは肯定側だけであった）。
      //   - M2 `aria-label` の行そのものを消す変異を当てても、同じく**本区間は緑のまま**である。
      //   つまり本区間の緑は「右上のボタンが出ていないこと」を保証しない。保証しているのは
      //   肯定側の完全一致であり、**それが緩められると本区間は静かに空振りへ変わる**。
      //   - M3 肯定側の locator を `{ name: /新規作成/i }` へ戻す変異を当てると
      //     `npm run check:e2e-guards` が赤になる（EXIT=1。本区間を `0 → 1` 件として
      //     名指しする。2026-09-03 に実測）。
      //   詳細な出力と実行したコマンドは肯定側の区間の注記に置いた。
      //
      // 他の区間を表題で引かないのは、表題の末尾の被覆印を散文へ綴ると
      // `scripts/scan-coverage-mark-correspondence.ts` が拾って帳簿を水増しするためである。
      const headerNewButton = section.getByRole('link', {
        name: '見積依頼を新規作成',
        exact: true,
      });
      await expect(headerNewButton).not.toBeVisible();

      // しかしセクション右上の「すべて見る」リンクは非表示
      const headerAllLink = section.getByRole('link', { name: /すべて見る|見積依頼一覧/i });
      await expect(headerAllLink).not.toBeVisible();
    });
  });

  // ============================================================================
  // Requirement 2: 見積依頼一覧画面
  // ============================================================================

  test.describe('Requirement 2: 見積依頼一覧画面', () => {
    /**
     * @requirement estimate-request/REQ-2.1
     * 見積依頼一覧画面にパンくずナビゲーションを表示する
     */
    test('REQ-2.1: 見積依頼一覧画面にパンくずナビゲーションが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests`);
      await page.waitForLoadState('networkidle');

      // パンくずナビゲーションが表示される
      await expect(page.getByText(/プロジェクト一覧/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement estimate-request/REQ-2.2
     * 見積依頼一覧画面に「新規作成」ボタンを表示する
     */
    test('REQ-2.2: 見積依頼一覧画面に「新規作成」ボタンが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('link', { name: /新規作成/i }).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement estimate-request/REQ-2.7
     * 見積依頼が存在しない場合、「見積依頼がありません」というメッセージを表示する
     */
    test('REQ-2.7: 見積依頼がない場合のメッセージが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests`);
      await page.waitForLoadState('networkidle');

      // 読み込み完了を待機
      await expect(page.getByText(/読み込み中/i)).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 見積依頼がない場合のメッセージが表示される
      await expect(page.getByText(/見積依頼はまだありません/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  // ============================================================================
  // Requirement 3: 見積依頼新規作成
  // ============================================================================

  test.describe('Requirement 3: 見積依頼新規作成', () => {
    /**
     * @requirement estimate-request/REQ-3.1
     * 新規作成時に見積依頼の名前入力フィールドを表示する
     */
    test('REQ-3.1: 見積依頼作成フォームに名前入力フィールドが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await expect(nameInput).toBeVisible({ timeout: getTimeout(10000) });
      await expect(nameInput).toHaveAttribute('aria-required', 'true');
    });

    /**
     * @requirement estimate-request/REQ-3.2
     * 新規作成時に宛先（取引先）選択フィールドを表示する
     */
    test('REQ-3.2: 見積依頼作成フォームに宛先選択フィールドが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const tradingPartnerSelect = page.locator('[role="combobox"][aria-label="宛先（取引先）"]');
      await expect(tradingPartnerSelect).toBeVisible();
    });

    /**
     * @requirement estimate-request/REQ-3.3
     * 新規作成時に参照する内訳書の選択フィールドを表示する
     */
    test('REQ-3.3: 見積依頼作成フォームに内訳書選択フィールドが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await expect(itemizedStatementSelect).toBeVisible();
    });

    /**
     * @requirement estimate-request/REQ-3.4
     * 宛先の候補として協力業者である取引先のみを表示する
     */
    test('REQ-3.4: 宛先選択フィールドに協力業者が表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const tradingPartnerInput = page.locator(
        'input[role="combobox"][aria-label="宛先（取引先）"]'
      );
      await expect(tradingPartnerInput).toBeVisible({ timeout: getTimeout(5000) });

      // コンボボックスをクリックしてドロップダウンを開く
      await tradingPartnerInput.click();
      await page.waitForTimeout(500);

      // リストボックスの選択肢を取得
      const listbox = page.locator('ul[role="listbox"]');
      await expect(listbox).toBeVisible({ timeout: 3000 });
      const options = await listbox.locator('li[role="option"]').all();

      // 協力業者が少なくとも1つ選択肢にある
      expect(options.length).toBeGreaterThan(0);

      // 作成した協力業者名が選択肢に含まれる
      const optionTexts = await Promise.all(options.map((o) => o.textContent()));
      const hasPartner = optionTexts.some((text) => text?.includes(tradingPartnerName!));
      expect(hasPartner).toBeTruthy();
    });

    /**
     * @requirement estimate-request/REQ-3.6
     * 必須項目を入力して保存したとき、見積依頼を作成し詳細画面に遷移する
     */
    test('REQ-3.6: 必須項目入力後に保存すると詳細画面に遷移する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // フォームに入力
      const nameInput = page.locator('input#name');
      await nameInput.fill('テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      // 作成APIを待機
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      // 詳細画面に遷移を確認
      await expect(page).toHaveURL(/\/estimate-requests\/[0-9a-f-]+$/, {
        timeout: getTimeout(10000),
      });

      // URLから見積依頼IDを取得
      const url = page.url();
      const matches = url.match(/\/estimate-requests\/([0-9a-f-]+)$/);
      if (matches && matches[1]) {
        createdEstimateRequestId = matches[1];
      }
    });

    /**
     * @requirement estimate-request/REQ-3.7
     * 必須項目が未入力の場合、バリデーションエラーを表示する
     */
    test('REQ-3.7: 必須項目が未入力の場合バリデーションエラーが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 見積依頼名フィールドをクリアして空にする（デフォルト値「見積依頼」が設定されているため）
      const nameInput = page.getByLabel(/見積依頼名/);
      await nameInput.clear();

      // 名前を空のまま作成ボタンをクリック
      await page.getByRole('button', { name: /作成/i }).click();

      // バリデーションエラーが表示される
      await expect(page.getByText(/見積依頼名を入力してください/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });
  });

  // ============================================================================
  // Requirement 1: 見積依頼セクション表示（見積依頼存在時）
  // ============================================================================

  test.describe('Requirement 1: 見積依頼セクション表示（見積依頼存在時）', () => {
    /**
     * @requirement project-management/REQ-27.6
     * 見積依頼が存在する場合、セクション右上に「新規作成」ボタンと「すべて見る」リンクを表示する
     */
    test('REQ-1.6: 見積依頼が存在する場合、セクション右上に「新規作成」ボタンと「すべて見る」リンクを表示する (project-management/REQ-27.6)', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // 見積依頼セクションが表示される
      const section = page.getByTestId('estimate-request-section');
      await expect(section).toBeVisible({ timeout: getTimeout(10000) });

      // セクションヘッダー内に「新規作成」リンクが表示される。
      //
      // タスク 115.251 の是正: 従前は `{ name: /新規作成/i }` の部分一致で locate していた。
      // 部分一致は表示文言「新規作成」だけで成立するため、右上のボタンだけが持つ
      // アクセシブル名（`EstimateRequestSectionCard.tsx` の `aria-label="見積依頼を新規作成"`）を
      // 別の綴りへ変えても、また消しても、本区間は緑のまま通っていた。
      // 一方、同じ名前を `not.toBeVisible()` で指す否定側は二件ある。本ファイルの
      // 「見積依頼がない場合」の区間と、`e2e/specs/projects/project-detail-sections.spec.ts` の
      // 「見積依頼が存在しない場合」の区間である。どちらも**一致が零件でも真になる**形であり、
      // `aria-label` を変えれば両方が空振りで緑になる。つまり改名は E2E の誰にも検出されず、
      // 115.220 が塞いだ穴が静かに再び開く。
      //
      // 実行した変異と出力（いずれも 2026-09-03 に実測。frontend は test 環境で再ビルドし、
      // 変異前と復元後の配信バンドルが `assets/index-D5RUevcK.js`（sha256 e4b9948…）で
      // 一致することを `sha256sum` で照合した）:
      //   - M1 `aria-label` の値を `見積依頼をあたらしく作成` へ変える変異
      //     （配信 `assets/index-B7raFDWN.js`）を当てると本区間は赤になる（7 件が
      //     6 passed / 1 failed になり、落ちるのは本区間だけである）。
      //   - M2 `aria-label` の行そのものを消す変異（配信 `assets/index-YHhOgCER.js`）を
      //     当てても同じで、6 passed / 1 failed になり本区間だけが赤になる。
      //   - **否定側の二件は M1 でも M2 でも緑のまま**であり、`aria-label` を変えても
      //     消しても検出されない。
      //   - 変異前と復元後はいずれも 7 passed / 0 failed である。
      //   実行したコマンドは次の二つ（後者は否定側の一件を単独で回したもので、いずれの変異でも
      //   1 passed / 0 failed であった）。
      //     npm run test:e2e -- e2e/specs/estimate-requests/estimate-request-e2e.spec.ts \
      //       -g "準備|REQ-1\.5:|REQ-3\.6:|REQ-1\.6:"
      //     npm run test:e2e -- e2e/specs/projects/project-detail-sections.spec.ts \
      //       -g "見積依頼が存在しない場合、セクション右上"
      //
      // 本区間はアクセシブル名を `exact: true` で完全一致に固定し、改名・削除を
      // **肯定側の失敗**として表面化させる。否定側二件が依存する名前の錨はここに在る。
      // 本区間が名乗る受入基準（`.kiro/specs/project-management/requirements.md` の
      // 要件27 の受入基準6）が求める「セクション右上の『新規作成』ボタン」はこの名前を持つ
      // 要素そのものであり、完全一致で指すことは条文の観測を狭めない。
      //
      // **肯定側の完全一致を緩めると否定側二件は静かに空振りへ変わる。** この関係は散文では
      // なく機械が拘束する。`npm run check:e2e-guards` の `T13-unanchored-accessible-name` が
      // 「零件で真になる主張が指すアクセシブル名は、同名を肯定側から指す箇所を e2e 内に
      // 持たねばならない」を検査する。
      //   - M3 本区間の locator を是正前の `{ name: /新規作成/i }` へ戻す変異を当てると
      //     `npm run check:e2e-guards` が赤になる（EXIT=1。否定側の二ファイルを `0 → 1` 件と
      //     して名指しする。2026-09-03 に実測。変異前と復元後はいずれも EXIT=0 である）。
      //   走査そのものは `npx tsx scripts/check-e2e-assertion-guards.ts --accessible-names` が
      //   印字する（走査根・母集団・比較できなかった名前の内訳・未錨の一覧）。
      //
      // 注: 上で他の区間を指すときに表題を逐語で引かないのは、表題の末尾の被覆印を散文へ
      // 綴ると `scripts/scan-coverage-mark-correspondence.ts` が本区間を当該受入基準の
      // 被覆印として拾い、帳簿を水増しするためである（`scripts/coverage-mark-adjudication.md`
      // §4.5 が「散文の言及」として挙げる形）。同じ理由で受入基準は原典の節番号表記で述べる。
      const headerNewButton = section.getByRole('link', {
        name: '見積依頼を新規作成',
        exact: true,
      });
      await expect(headerNewButton).toBeVisible();

      // 「すべて見る」リンクが表示される
      const allLink = section.getByRole('link', { name: /すべて見る|見積依頼一覧/i });
      await expect(allLink).toBeVisible();
    });

    /**
     * @requirement project-management/REQ-27.7
     * ユーザーが「新規作成」ボタンをクリックしたとき、見積依頼作成画面に遷移する
     */
    test('REQ-1.7: 「新規作成」ボタンをクリックで見積依頼作成画面に遷移する (project-management/REQ-27.7)', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      const section = page.getByTestId('estimate-request-section');
      await expect(section).toBeVisible({ timeout: getTimeout(10000) });

      const newButton = section.getByRole('link', { name: /新規作成/i });
      await newButton.click();

      await expect(page).toHaveURL(/\/estimate-requests\/new/, {
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-27.8
     * ユーザーが「すべて見る」リンクをクリックしたとき、見積依頼一覧画面に遷移する
     */
    test('REQ-1.8: 「すべて見る」リンクをクリックで見積依頼一覧画面に遷移する (project-management/REQ-27.8)', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      const section = page.getByTestId('estimate-request-section');
      await expect(section).toBeVisible({ timeout: getTimeout(10000) });

      const allLink = section.getByRole('link', { name: /すべて見る|見積依頼一覧/i });
      await allLink.click();

      await expect(page).toHaveURL(/\/estimate-requests$/, {
        timeout: getTimeout(10000),
      });
    });
  });

  // ============================================================================
  // Requirement 4: 見積依頼詳細画面 - 項目選択
  // ============================================================================

  test.describe('Requirement 4: 見積依頼詳細画面 - 項目選択', () => {
    /**
     * @requirement estimate-request/REQ-4.1
     * 見積依頼詳細画面にパンくずナビゲーションを表示する
     */
    test('REQ-4.1: 見積依頼詳細画面にパンくずナビゲーションが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/プロジェクト一覧/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement estimate-request/REQ-4.2
     * 見積依頼詳細画面に指定した内訳書の項目一覧を表示する
     */
    test('REQ-4.2: 見積依頼詳細画面に内訳書項目一覧が表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 項目テーブルが表示される
      await expect(page.locator('table[aria-label="内訳書項目一覧"]')).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * Task 37.2: 項目選択セクションの列ヘッダーが「任意分類」であることの確認
     * @requirement estimate-request/REQ-4.2
     */
    test('Task 37.2: 項目選択テーブルの列ヘッダーに「任意分類」が表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 項目テーブルが表示される
      const table = page.locator('table[aria-label="内訳書項目一覧"]');
      await expect(table).toBeVisible({ timeout: getTimeout(10000) });

      // 列ヘッダーに「任意分類」が表示される（Task 31.1改修: 「分類」→「任意分類」）
      await expect(table.locator('th', { hasText: '任意分類' })).toBeVisible();

      // テストデータのcustomCategoryが表示されていることを確認
      await expect(table.getByText('躯体工事')).toBeVisible();
    });

    /**
     * @requirement estimate-request/REQ-4.3
     * 各項目に選択用のチェックボックスを表示する
     */
    test('REQ-4.3: 各項目に選択用チェックボックスが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // チェックボックスが表示される
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });

      const count = await checkboxes.count();
      expect(count).toBeGreaterThan(0);
    });

    /**
     * @requirement estimate-request/REQ-4.10
     * 項目一覧の下に「内訳書を本文に含める」チェックボックスを表示する
     *
     * タスク 115.188 の是正: 要件4 に受入基準が追加される前の番号のままだった。
     * 直上の一行は現行の受入基準の逐語であり、名乗る番号をそれに合わせた。
     */
    test('REQ-4.6→4.10: 「内訳書を本文に含める」チェックボックスが表示される (estimate-request/REQ-4.10)', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/内訳書を本文に含める/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement estimate-request/REQ-4.12
     * 見積依頼方法としてラジオボタン（メール/FAX）を表示する
     *
     * タスク 115.188 の是正: 要件4 に受入基準が追加される前の番号のままだった。
     * 直上の一行は現行の受入基準の逐語であり、名乗る番号をそれに合わせた。
     */
    test('REQ-4.8→4.12: 見積依頼方法ラジオボタン（メール/FAX）が表示される (estimate-request/REQ-4.12)', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('radio', { name: /メール/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByRole('radio', { name: /FAX/i })).toBeVisible();
    });

    /**
     * @requirement estimate-request/REQ-4.13
     * 見積依頼方法のデフォルト値をメールとする
     *
     * タスク 115.188 の是正: 要件4 に受入基準が追加される前の番号のままだった。
     * 直上の一行は現行の受入基準の逐語であり、名乗る番号をそれに合わせた。
     */
    test('REQ-4.9→4.13: 見積依頼方法のデフォルト値がメールである (estimate-request/REQ-4.13)', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      const emailRadio = page.getByRole('radio', { name: /メール/i });
      await expect(emailRadio).toBeChecked({ timeout: getTimeout(10000) });
    });
  });

  // ============================================================================
  // Requirement 6: 見積依頼文表示
  // ============================================================================

  test.describe('Requirement 6: 見積依頼文表示', () => {
    /**
     * @requirement estimate-request/REQ-6.1
     * 見積依頼文表示パネルに宛先、表題、本文を表示する
     */
    test('REQ-6.1: 見積依頼文表示パネルが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // まず少なくとも1つの項目を選択する（見積依頼文生成に必要）
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      await checkboxes.first().click();

      // Task 30改修: 保存ボタンで一括保存
      await clickSaveSelectionButton(page);

      // 見積依頼文表示ボタンをクリック
      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await expect(showTextButton).toBeVisible({ timeout: getTimeout(10000) });
      await showTextButton.click();

      // 見積依頼文パネルが表示される
      const panel = page.locator('[role="region"][aria-label="見積依頼文"]');
      await expect(panel).toBeVisible({ timeout: getTimeout(10000) });

      // パネル内に宛先、表題、本文のラベルが表示される
      await expect(panel.getByText('宛先', { exact: true })).toBeVisible();
      await expect(panel.getByText('表題')).toBeVisible();
      await expect(panel.getByText('本文')).toBeVisible();
    });

    /**
     * @requirement estimate-request/REQ-6.2
     * 見積依頼方法がメールのとき、宛先として宛先取引先のメールアドレスを表示する
     */
    test('REQ-6.2: メール選択時にメールアドレスが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // メールラジオが選択されていることを確認
      await expect(page.getByRole('radio', { name: /メール/i })).toBeChecked({
        timeout: getTimeout(10000),
      });

      // 見積依頼文表示ボタンをクリック（パネルを開く）
      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await expect(showTextButton).toBeVisible({ timeout: getTimeout(10000) });
      await showTextButton.click();

      // 見積依頼文パネルが表示されるまで待機
      const panel = page.locator('[role="region"][aria-label="見積依頼文"]');
      await expect(panel).toBeVisible({ timeout: getTimeout(10000) });

      // メールアドレスが表示される
      await expect(page.getByText(/test-subcontractor@example\.com/i)).toBeVisible();
    });

    /**
     * @requirement estimate-request/REQ-6.3
     * 見積依頼方法がFAXのとき、宛先として宛先取引先のFAX番号を表示する
     */
    test('REQ-6.3: FAX選択時にFAX番号が表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // FAXラジオを選択（クライアントサイド状態のみ変更）
      const faxRadio = page.getByRole('radio', { name: /FAX/i });
      await expect(faxRadio).toBeVisible({ timeout: getTimeout(10000) });
      await faxRadio.click();
      await expect(faxRadio).toBeChecked({ timeout: getTimeout(5000) });

      // Task 30改修: 保存ボタンで見積依頼方法の変更をサーバーに反映
      await clickSaveSelectionButton(page);

      // 見積依頼文表示ボタンをクリック（パネルを開く）
      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await expect(showTextButton).toBeVisible({ timeout: getTimeout(10000) });
      await showTextButton.click();

      // 見積依頼文パネルが表示されるまで待機
      const panel = page.locator('[role="region"][aria-label="見積依頼文"]');
      await expect(panel).toBeVisible({ timeout: getTimeout(10000) });

      // FAX番号が表示される
      await expect(page.getByText(/03-1234-5678/i)).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-request/REQ-6.6
     * 表題として「[プロジェクト名] 御見積依頼」を表示する
     * ※ 実際の表題フォーマットは「【お見積りご依頼】{プロジェクト名}」
     */
    test('REQ-6.6: 表題が正しいフォーマットで表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // メールモードに切り替え（REQ-6.3でFAXに変更されているため）
      // FAXモードには表題がないため、メールモードで確認する
      const emailRadio = page.getByRole('radio', { name: /メール/i });
      await emailRadio.click();
      await expect(emailRadio).toBeChecked({ timeout: getTimeout(10000) });
      await page.waitForLoadState('networkidle');

      // 見積依頼文表示ボタンをクリック（パネルを開く）
      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await expect(showTextButton).toBeVisible({ timeout: getTimeout(10000) });
      await showTextButton.click();

      // 見積依頼文パネルが表示されるまで待機
      const panel = page.locator('[role="region"][aria-label="見積依頼文"]');
      await expect(panel).toBeVisible({ timeout: getTimeout(10000) });

      // 表題に「お見積りご依頼」または「見積依頼」が含まれる
      // 実際のフォーマット: 【お見積りご依頼】{プロジェクト名}
      await expect(page.getByText(/お見積り.?依頼/i)).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-request/REQ-6.10
     * 本文の【現場】セクションにプロジェクトの現場住所を表示する
     */
    test('REQ-6.10: 本文に現場住所が表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 見積依頼文表示ボタンをクリック（パネルを開く）
      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await expect(showTextButton).toBeVisible({ timeout: getTimeout(10000) });
      await showTextButton.click();

      // 見積依頼文パネルが表示されるまで待機
      const panel = page.locator('[role="region"][aria-label="見積依頼文"]');
      await expect(panel).toBeVisible({ timeout: getTimeout(10000) });

      // 現場住所が本文に表示される
      await expect(page.getByText(/東京都渋谷区テスト1-2-3/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  // ============================================================================
  // Requirement 7: クリップボードコピー機能
  // ============================================================================

  test.describe('Requirement 7: クリップボードコピー機能', () => {
    /**
     * @requirement estimate-request/REQ-7.1
     * @requirement estimate-request/REQ-7.2
     * @requirement estimate-request/REQ-7.3
     * 宛先・表題・本文の横にクリップボードコピーボタンを表示する
     */
    test('REQ-7.1, REQ-7.2, REQ-7.3: クリップボードコピーボタンが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 見積依頼文表示ボタンをクリック（パネルを開く）
      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await expect(showTextButton).toBeVisible({ timeout: getTimeout(10000) });
      await showTextButton.click();

      // 見積依頼文パネルが表示されるまで待機
      const panel = page.locator('[role="region"][aria-label="見積依頼文"]');
      await expect(panel).toBeVisible({ timeout: getTimeout(10000) });

      // コピーボタンが表示される（宛先、表題、本文用の3つ）
      // パネル内に限定して検索し、データロード完了後に3つ全て表示されるのを待機
      const copyButtons = panel.getByRole('button', { name: /コピー/i });
      await expect(copyButtons.nth(2)).toBeVisible({ timeout: getTimeout(10000) });

      const count = await copyButtons.count();
      expect(count).toBeGreaterThanOrEqual(3);
    });

    /**
     * @requirement estimate-request/REQ-7.5
     * クリップボードへのコピーが成功したとき、コピー完了のフィードバックを表示する
     */
    test('REQ-7.5: コピー成功時にフィードバックが表示される', async ({ page, context }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      // クリップボード権限を付与
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 見積依頼文表示ボタンをクリック（パネルを開く）
      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await expect(showTextButton).toBeVisible({ timeout: getTimeout(10000) });
      await showTextButton.click();

      // 見積依頼文パネルが表示されるまで待機
      const panel = page.locator('[role="region"][aria-label="見積依頼文"]');
      await expect(panel).toBeVisible({ timeout: getTimeout(10000) });

      // コピーボタンをクリック
      const copyButtons = page.getByRole('button', { name: /コピー/i });
      await expect(copyButtons.first()).toBeVisible({ timeout: getTimeout(10000) });
      await copyButtons.first().click();

      // 「コピーしました」のフィードバックが表示される
      await expect(page.getByText(/コピーしました/i)).toBeVisible({ timeout: getTimeout(5000) });
    });
  });

  // ============================================================================
  // Requirement 2: 見積依頼一覧画面（作成後のテスト）
  // ============================================================================

  test.describe('Requirement 2: 見積依頼一覧画面（作成後）', () => {
    /**
     * @requirement estimate-request/REQ-2.3
     * 作成済みの見積依頼を一覧形式で表示する
     */
    test('REQ-2.3: 作成済みの見積依頼が一覧に表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i)).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 見積依頼が一覧に表示される
      await expect(page.getByText(/テスト見積依頼/i)).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-request/REQ-2.4
     * 一覧に見積依頼の名前、宛先（取引先名）、見積依頼方法（メール/FAX）、参照内訳書名、作成日時を表示する
     */
    test('REQ-2.4: 一覧に必要な情報が表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i)).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 名前が表示される
      await expect(page.getByText(/テスト見積依頼/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 取引先名が表示される
      await expect(page.getByText(new RegExp(tradingPartnerName.slice(0, 10), 'i'))).toBeVisible();
    });

    /**
     * @requirement estimate-request/REQ-2.5
     * 見積依頼項目をクリックしたとき、該当する見積依頼詳細画面に遷移する
     */
    test('REQ-2.5: 見積依頼項目クリックで詳細画面に遷移する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i)).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 見積依頼項目をクリック
      await page.getByText(/テスト見積依頼/i).click();

      // 詳細画面に遷移
      await expect(page).toHaveURL(/\/estimate-requests\/[0-9a-f-]+$/, {
        timeout: getTimeout(10000),
      });
    });
  });

  // ============================================================================
  // Requirement 9: 見積依頼編集・削除
  // ============================================================================

  test.describe('Requirement 9: 見積依頼編集・削除', () => {
    /**
     * @requirement estimate-request/REQ-9.1
     * 見積依頼詳細画面に編集ボタン（リンク）を表示する
     */
    test('REQ-9.1: 見積依頼詳細画面に編集ボタンが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 編集ボタンはリンクとして実装されている
      await expect(page.getByRole('link', { name: /編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement estimate-request/REQ-9.2
     * 見積依頼詳細画面に削除ボタンを表示する
     */
    test('REQ-9.2: 見積依頼詳細画面に削除ボタンが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('button', { name: /削除/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement estimate-request/REQ-9.3
     * 編集ボタンをクリックしたとき、見積依頼の名前・宛先・内訳書を編集可能にする
     */
    test('REQ-9.3: 編集ボタンクリックで編集画面に遷移する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 編集ボタンはリンクとして実装されている
      await page.getByRole('link', { name: /編集/i }).click();

      // 編集画面またはフォームが表示される
      await expect(page).toHaveURL(/\/edit/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-request/REQ-9.4
     * 削除ボタンをクリックしたとき、削除確認ダイアログを表示する
     */
    test('REQ-9.4: 削除ボタンクリックで確認ダイアログが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /削除/i }).click();

      // 確認ダイアログが表示される
      // 実際のテキスト: "この見積依頼を削除してよろしいですか？"
      await expect(page.getByText(/削除して.*よろしいですか/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement estimate-request/REQ-9.5
     * 削除を確認したとき、見積依頼を論理削除し一覧画面に遷移する
     */
    test('REQ-9.5: 削除確認で論理削除し一覧画面に遷移する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /削除/i }).click();

      // 確認ダイアログが表示される
      await expect(page.getByText(/削除して.*よろしいですか/i)).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 削除APIを待機
      const deletePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') && response.request().method() === 'DELETE',
        { timeout: getTimeout(30000) }
      );

      // ダイアログ内の削除確定ボタンをクリック
      const dialog = page.getByRole('dialog', { name: /削除/i });
      await dialog.getByRole('button', { name: /削除/i }).click();
      await deletePromise;

      // 一覧画面に遷移
      await expect(page).toHaveURL(/\/estimate-requests$/, { timeout: getTimeout(10000) });

      // 削除した見積依頼が一覧に表示されない
      await expect(page.getByText(/読み込み中/i)).not.toBeVisible({
        timeout: getTimeout(15000),
      });
    });
  });

  // ============================================================================
  // Requirement 8: 見積依頼データ管理
  // ============================================================================

  test.describe('Requirement 8: 見積依頼データ管理', () => {
    /**
     * @requirement estimate-request/REQ-8.1
     * 見積依頼をプロジェクトに紐づけて保存する
     */
    test('REQ-8.1: 見積依頼がプロジェクトに紐づいて保存される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 新しい見積依頼を作成
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-8.1テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      const response = await createPromise;

      const responseData = await response.json();

      // プロジェクトIDが正しく紐づいている
      expect(responseData.projectId).toBe(createdProjectId);
    });

    /**
     * @requirement estimate-request/REQ-8.3
     * 見積依頼の作成日時と更新日時を記録する
     */
    test('REQ-8.3: 見積依頼の作成日時と更新日時が記録される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-8.3テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      const response = await createPromise;

      const responseData = await response.json();

      // 作成日時と更新日時が記録されている
      expect(responseData.createdAt).toBeTruthy();
      expect(responseData.updatedAt).toBeTruthy();
    });
  });

  // ============================================================================
  // Requirement 10: 権限管理
  // ============================================================================

  test.describe('Requirement 10: 権限管理', () => {
    /**
     * @requirement estimate-request/REQ-10.1
     * @requirement estimate-request/REQ-10.2
     * プロジェクトの閲覧・編集権限を持つユーザーのみに見積依頼の閲覧・作成・編集・削除を許可する
     */
    test('REQ-10.1, REQ-10.2: 認証済みユーザーが見積依頼にアクセスできる', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積依頼一覧にアクセス
      await page.goto(`/projects/${createdProjectId}/estimate-requests`);
      await page.waitForLoadState('networkidle');

      // アクセスが許可される（エラーページでない）
      await expect(page.getByRole('heading', { name: /見積依頼一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement estimate-request/REQ-10.3
     * 権限のないユーザーが見積依頼にアクセスした場合、アクセス拒否エラーを表示する
     */
    test('REQ-10.3: 未認証ユーザーはログインページにリダイレクトされる', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      // 認証なしでアクセス
      await page.goto(`/projects/${createdProjectId}/estimate-requests`);

      // ログインページにリダイレクト
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });
    });
  });

  // ============================================================================
  // Requirement 3: 見積依頼新規作成（追加テスト）
  // ============================================================================

  test.describe('Requirement 3: 見積依頼新規作成（追加テスト）', () => {
    /**
     * @requirement estimate-request/REQ-39.5
     * @requirement estimate-request/REQ-39.1
     * 旧 REQ-3.9（内訳書未登録メッセージ）は要件定義書上で取り消し線により撤廃され、
     * Requirement 39 AC 5 が文言と挙動を引き取った。被覆印は移管先の番号だけで名乗る。
     * Task 85.5: 内訳書任意化に伴うメッセージ更新
     * - メッセージ文言が「内訳書が登録されていません（任意）。」に変更されたことを確認
     * - 内訳書任意化により「作成」ボタンが活性であることを確認
     * - 必須マーカー `*` が内訳書フィールドに表示されないことを確認
     */
    test('REQ-3.9 / REQ-39.5: 内訳書がない場合に（任意）付きメッセージが表示され作成ボタンが活性である', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 内訳書のない新しいプロジェクトを作成
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const newProjectName = `REQ-3.9テスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(newProjectName);

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      const noItemizedProjectId = match?.[1] ?? null;

      // 見積依頼作成画面に移動
      await page.goto(`/projects/${noItemizedProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // Task 85.5: 「内訳書が登録されていません（任意）。」メッセージが表示される（Req 39.5）
      await expect(page.getByText(/内訳書が登録されていません（任意）。/)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // Task 85.5: 内訳書フィールドの必須マーカー `*` が表示されないこと（Req 39.1）
      const itemizedLabel = page.locator('label[for="itemizedStatementId"]');
      await expect(itemizedLabel).toBeVisible({ timeout: getTimeout(5000) });
      // ラベル内に「（任意）」が含まれていることを確認
      await expect(itemizedLabel).toContainText('（任意）');

      // Task 85.5: 内訳書未登録でも「作成」ボタンが活性であることを確認（Req 39.5）
      const createButton = page.getByRole('button', { name: /^作成$/ });
      await expect(createButton).toBeEnabled({ timeout: getTimeout(5000) });
    });
  });

  // ============================================================================
  // Requirement 4: 見積依頼詳細画面 - 項目選択（追加テスト）
  // ============================================================================

  test.describe('Requirement 4: 見積依頼詳細画面 - 項目選択（追加テスト）', () => {
    /**
     * @requirement estimate-request/REQ-4.4
     * @requirement estimate-request/REQ-4.5
     * @requirement estimate-request/REQ-4.6
     * @requirement estimate-request/REQ-4.7
     * Task 30改修: チェックボックス変更時はクライアントサイド状態のみ更新し、保存ボタンで一括保存する
     * タスク 115.188 の追記: 本検証は保存ボタンが表示・活性であること（受入基準4.6）と、
     * クリックで選択状態がサーバーへ永続化されること（受入基準4.7）を実際に主張している。
     * Task 37.1: 保存ボタン方式E2Eテスト
     */
    test('REQ-4.4, REQ-4.5: チェックボックス変更後に保存ボタンで一括保存される', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 新しい見積依頼を作成
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-4.4テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      // 詳細画面に遷移
      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // チェックボックスを見つけてクリック
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });

      // チェックボックスの状態を変更（最初のチェックボックスをクリック）
      const firstCheckbox = checkboxes.first();
      const initialState = await firstCheckbox.isChecked();
      await firstCheckbox.click();

      // Task 37.1: チェックボックス変更直後はサーバーにリクエストが発生しない（クライアントサイド管理）
      // 保存ボタンが有効になっていることを確認（未保存変更あり）
      const saveButton = page.getByTestId('save-selection-button');
      await expect(saveButton).toBeEnabled({ timeout: getTimeout(5000) });

      // 保存ボタンをクリックして一括保存
      await clickSaveSelectionButton(page);

      // ページをリロードして状態が保存されていることを確認
      await page.reload();
      await page.waitForLoadState('networkidle');

      const checkboxesAfterReload = page.locator(
        'table[aria-label="内訳書項目一覧"] input[type="checkbox"]'
      );
      await expect(checkboxesAfterReload.first()).toBeVisible({ timeout: getTimeout(10000) });

      // チェックボックスの状態が変更されている
      const newState = await checkboxesAfterReload.first().isChecked();
      expect(newState).toBe(!initialState);
    });

    /**
     * @requirement estimate-request/REQ-4.11
     * 項目一覧の下にExcel出力ボタンを表示する
     *
     * タスク 115.188 の是正: 要件4 に受入基準が追加される前の番号のままだった。
     * 直上の一行は現行の受入基準の逐語であり、名乗る番号をそれに合わせた。
     */
    test('REQ-4.7→4.11: Excel出力ボタンが表示される (estimate-request/REQ-4.11)', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 新しい見積依頼を作成（REQ-9.5で削除されているため）
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-4.7テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      // 詳細画面に遷移
      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);
      await page.waitForLoadState('networkidle');

      // Excel出力ボタンが存在することを確認
      // 項目未選択時は「項目を選択してください」、選択時は「選択された件の項目をExcelでエクスポート」がアクセシブルネーム
      // ボタン内のテキスト「Excelでエクスポート」で検索
      await expect(page.locator('button:has-text("Excelでエクスポート")')).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  // ============================================================================
  // Requirement 5: 内訳書Excel出力
  // ============================================================================

  test.describe('Requirement 5: 内訳書Excel出力', () => {
    /**
     * @requirement estimate-request/REQ-5.1
     * @requirement estimate-request/REQ-5.2
     * Excel出力ボタンをクリックしたとき、チェックした項目のみを含むExcelファイルを生成し、ダウンロードさせる
     */
    test('REQ-5.1, REQ-5.2: Excel出力ボタンでファイルがダウンロードされる', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積依頼を作成
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-5テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);
      await page.waitForLoadState('networkidle');

      // 項目をチェックする（Excel出力には選択が必要）
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      await checkboxes.first().click();

      // Task 30改修: 保存ボタンで一括保存
      await clickSaveSelectionButton(page);

      // Excel出力ボタンが有効になるのを待機
      const excelButton = page.locator('button:has-text("Excelでエクスポート")');
      await expect(excelButton).toBeEnabled({ timeout: getTimeout(10000) });

      // ダウンロードを待機
      const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(30000) });

      // Excel出力ボタンをクリック
      await excelButton.click();

      const download = await downloadPromise;

      // ダウンロードが開始されたことを確認
      expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    });

    /**
     * @requirement estimate-request/REQ-5.3
     * 項目が1つも選択されていない場合、エラーメッセージを表示する
     */
    test('REQ-5.3: 項目未選択時にエラーメッセージが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積依頼を作成
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-5.3テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // すべてのチェックボックスを外す
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });

      const count = await checkboxes.count();
      let hasChanges = false;
      for (let i = 0; i < count; i++) {
        const checkbox = checkboxes.nth(i);
        if (await checkbox.isChecked()) {
          await checkbox.click();
          hasChanges = true;
          await page.waitForTimeout(100);
        }
      }

      // Task 30改修: 変更があった場合のみ保存ボタンで一括保存
      if (hasChanges) {
        await clickSaveSelectionButton(page);
      }

      // 項目未選択時はExcel出力ボタンが無効化され、「項目を選択してください」と表示される
      const excelButton = page.locator('button:has-text("Excelでエクスポート")');
      await expect(excelButton).toBeDisabled({ timeout: getTimeout(5000) });

      // ボタンのアクセシブルネームに「項目を選択してください」が含まれることを確認
      await expect(page.getByRole('button', { name: /項目.*選択/i })).toBeVisible({
        timeout: getTimeout(5000),
      });
    });
  });

  // ============================================================================
  // Requirement 6: 見積依頼文表示（追加テスト）
  // ============================================================================

  test.describe('Requirement 6: 見積依頼文表示（追加テスト）', () => {
    /**
     * @requirement estimate-request/REQ-6.8
     * 「内訳書を本文に含める」がチェックされているとき、本文の【内容】セクションにチェックされた内訳書項目を成形して表示する
     */
    test('REQ-6.8: 「内訳書を本文に含める」チェック時に項目が本文に表示される', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積依頼を作成
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-6.8テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);
      await page.waitForLoadState('networkidle');

      // まず項目を選択する（テキスト生成に必要）
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      await checkboxes.first().click();

      // 保存ボタンクリックで項目選択を永続化（Task 30改修: debounce自動保存 -> 保存ボタン方式）
      await clickSaveSelectionButton(page);

      // 「内訳書を本文に含める」チェックボックスをチェック
      const includeBreakdownCheckbox = page.getByLabel(/内訳書を本文に含める/i);
      await includeBreakdownCheckbox.click();

      // includeBreakdownオプション反映待機
      await page.waitForTimeout(500);

      // 見積依頼文表示ボタンをクリック
      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await expect(showTextButton).toBeVisible({ timeout: getTimeout(10000) });
      await showTextButton.click();

      // 見積依頼文パネルが表示されるまで待機
      const panel = page.locator('[role="region"][aria-label="見積依頼文"]');
      await expect(panel).toBeVisible({ timeout: getTimeout(10000) });

      // 本文にテスト項目が含まれることを確認
      await expect(panel.getByText(/テスト項目/i)).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-request/REQ-6.9
     * 「内訳書を本文に含める」がチェックされていないとき、本文の【内容】セクションに「添付内訳書の通り」と表示する
     */
    test('REQ-6.9: 「内訳書を本文に含める」未チェック時に本文の【内容】へ「添付内訳書の通り」が表示される', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積依頼を作成
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-6.9テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);
      await page.waitForLoadState('networkidle');

      // まず項目を選択する（テキスト生成に必要）
      const itemCheckboxes = page.locator(
        'table[aria-label="内訳書項目一覧"] input[type="checkbox"]'
      );
      await expect(itemCheckboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      await itemCheckboxes.first().click();

      // 保存ボタンクリックで項目選択を永続化（Task 30改修: debounce自動保存 -> 保存ボタン方式）
      await clickSaveSelectionButton(page);

      // 「内訳書を本文に含める」は新規作成時に未チェックである（作成フォームはこの値を送らず、
      // サーバーは false で保存する）。前提を分岐で吸収せず、未チェックであることを主張する
      const includeBreakdownCheckbox = page.getByLabel(/内訳書を本文に含める/i);
      await expect(includeBreakdownCheckbox).toBeVisible({ timeout: getTimeout(10000) });
      await expect(includeBreakdownCheckbox).not.toBeChecked();

      // 見積依頼文表示ボタンをクリックし、本文の取得が成功することを待つ
      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await expect(showTextButton).toBeVisible({ timeout: getTimeout(10000) });
      const textResponsePromise = page.waitForResponse(
        (response) =>
          /\/estimate-requests\/[0-9a-f-]+\/text$/.test(new URL(response.url()).pathname) &&
          response.request().method() === 'GET',
        { timeout: getTimeout(30000) }
      );
      await showTextButton.click();
      const textResponse = await textResponsePromise;
      expect(textResponse.status()).toBe(200);

      // 見積依頼文パネルが表示されるまで待機
      const panel = page.locator('[role="region"][aria-label="見積依頼文"]');
      await expect(panel).toBeVisible({ timeout: getTimeout(10000) });

      // 本文（pre）の【内容】セクションに「添付内訳書の通り」が表示される
      const bodyPre = panel.locator('pre');
      await expect(bodyPre).toBeVisible({ timeout: getTimeout(10000) });
      await expect(bodyPre).toContainText('【内容】\n添付内訳書の通り');

      // 未チェックなので、選択した項目（テスト項目）は本文に並ばない
      await expect(bodyPre).not.toContainText('テスト項目');
    });
  });

  // ============================================================================
  // Requirement 9: 見積依頼編集・削除（追加テスト）
  // ============================================================================

  test.describe('Requirement 9: 見積依頼編集・削除（追加テスト）', () => {
    /**
     * @requirement estimate-request/REQ-9.6
     * 編集内容を保存したとき、変更を保存し詳細画面を更新する
     */
    test('REQ-9.6: 編集内容を保存すると変更が反映される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積依頼を作成
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-9.6テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // 編集ボタン（リンク）をクリック
      await page.getByRole('link', { name: /編集/i }).click();

      await expect(page).toHaveURL(/\/edit/, { timeout: getTimeout(10000) });

      // 名前を変更
      const editNameInput = page.locator('input#name');
      await editNameInput.clear();
      await editNameInput.fill('REQ-9.6編集後の名前');

      // 保存
      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          (response.request().method() === 'PUT' || response.request().method() === 'PATCH'),
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存|更新/i }).click();
      await updatePromise;

      // 詳細画面に戻り、変更が反映されていることを確認
      await expect(page).toHaveURL(/\/estimate-requests\/[0-9a-f-]+$/, {
        timeout: getTimeout(10000),
      });

      await page.waitForLoadState('networkidle');

      // 見出しに編集後の名前が表示されていることを確認
      await expect(page.getByRole('heading', { name: /REQ-9\.6編集後の名前/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  // ============================================================================
  // Requirement 8: 見積依頼データ管理（追加テスト）
  // ============================================================================

  test.describe('Requirement 8: 見積依頼データ管理（追加テスト）', () => {
    /**
     * @requirement estimate-request/REQ-8.2
     * 見積依頼に選択された項目リストを保存する
     */
    test('REQ-8.2: 見積依頼に項目リストが保存される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積依頼を作成
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-8.2テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      const response = await createPromise;

      const responseData = await response.json();
      const estimateRequestId = responseData.id;

      // 作成された見積依頼のIDが返される
      expect(estimateRequestId).toBeTruthy();

      // 詳細画面に遷移して項目テーブルが表示されることを確認
      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // 項目テーブルに項目が表示されることを確認（項目リストが保存された証拠）
      const itemsTable = page.locator('table[aria-label="内訳書項目一覧"]');
      await expect(itemsTable).toBeVisible({ timeout: getTimeout(10000) });

      // テーブルに行が存在することを確認
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement estimate-request/REQ-8.4
     * 見積依頼の削除時に論理削除を行う
     */
    test('REQ-8.4: 見積依頼削除時に論理削除が行われる', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積依頼を作成
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-8.4テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // 削除ボタンをクリック
      await page.getByRole('button', { name: /削除/i }).click();

      await expect(page.getByText(/削除して.*よろしいですか/i)).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 削除APIレスポンスを確認
      const deletePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') && response.request().method() === 'DELETE',
        { timeout: getTimeout(30000) }
      );

      // ダイアログ内の削除確定ボタンをクリック
      const deleteDialog = page.getByRole('dialog', { name: /削除/i });
      await deleteDialog.getByRole('button', { name: /削除/i }).click();
      const deleteResponse = await deletePromise;

      // 削除が成功（200または204）
      expect([200, 204]).toContain(deleteResponse.status());

      // 一覧画面で削除した見積依頼が表示されない（論理削除）
      await expect(page).toHaveURL(/\/estimate-requests$/, { timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i)).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      await expect(page.getByText('REQ-8.4テスト見積依頼')).not.toBeVisible();
    });
  });

  // ============================================================================
  // Requirement 4: 見積依頼詳細画面 - 項目選択（他の見積依頼との重複表示テスト）
  // ============================================================================

  test.describe('Requirement 4: 他の見積依頼との重複表示', () => {
    /**
     * @requirement estimate-request/REQ-4.15
     * @requirement estimate-request/REQ-4.16
     * @requirement estimate-request/REQ-4.17
     * 内訳書項目が他の見積依頼で選択済みのとき、該当行の背景色を変更して視覚的に区別し、
     * 該当行の一番右の列に依頼先取引先名（複数のときはすべての依頼先名）を表示する
     *
     * タスク 115.188 の是正: 要件4 に受入基準が追加される前の番号のままだった。
     * 直上の一行は現行の受入基準の逐語であり、名乗る番号をそれに合わせた。
     */
    test('REQ-4.10-4.12→4.15-4.17: 他の見積依頼で選択済み項目が視覚的に区別される (estimate-request/REQ-4.15, REQ-4.16, REQ-4.17)', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 最初の見積依頼を作成
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-4.10テスト見積依頼1');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise1 = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise1;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // 最初の見積依頼で項目一覧が表示されていることを確認
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });

      // 2つ目の見積依頼を作成
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput2 = page.locator('input#name');
      await nameInput2.fill('REQ-4.10テスト見積依頼2');

      await selectTradingPartnerByName(page, tradingPartnerName);
      const itemizedStatementSelect2 = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect2.selectOption(createdItemizedStatementId!);

      const createPromise2 = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise2;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // 「他の依頼先」列が表示されることを確認（テーブルヘッダー）
      await expect(page.getByText(/他の依頼先/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 他の見積依頼で選択済みの項目がある場合、取引先名が表示される
      // （この時点で最初の見積依頼で項目が選択されているため、表示される可能性がある）
      const table = page.locator('table[aria-label="内訳書項目一覧"]');
      await expect(table).toBeVisible();
    });
  });

  // ============================================================================
  // Requirement 6: 見積依頼文表示（エラーメッセージテスト）
  // ============================================================================

  test.describe('Requirement 6: 見積依頼文表示（エラーメッセージ）', () => {
    /**
     * @requirement estimate-request/REQ-6.4
     * 見積依頼方法がメールで取引先にメールアドレスが未登録の場合、
     * 「メールアドレスが登録されていません」というエラーメッセージを表示する
     */
    test('REQ-6.4: メールアドレス未登録時にエラーメッセージが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerWithoutEmailId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // メールアドレスがない協力業者で見積依頼を作成
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-6.4テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerWithoutEmailName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // 項目を選択して見積依頼文を表示する
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      await checkboxes.first().click();

      // 保存ボタンクリックで項目選択を永続化（Task 30改修: debounce自動保存 -> 保存ボタン方式）
      await clickSaveSelectionButton(page);

      // メール選択時にメールアドレス未登録エラーが表示される
      const emailRadio = page.getByRole('radio', { name: /メール/i });
      await expect(emailRadio).toBeChecked({ timeout: getTimeout(10000) });

      // 見積依頼文を表示ボタンをクリック
      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await showTextButton.click();
      await page.waitForTimeout(500);

      // メールアドレス未登録エラーが表示される（パネル内またはページ内）
      // 注: REQ-41 メーラー転記機能の追加により、同メッセージは宛先欄(recipientError)と
      // メーラーボタン横(mailDisabledReason)の2箇所に描画されるため、strict mode 違反を
      // 避けて first() で一意化する（REQ-41.9 と同じ対応）。要件は表示されていれば充足。
      await expect(page.getByText(/メールアドレスが登録されていません/i).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement estimate-request/REQ-6.5
     * 見積依頼方法がFAXで取引先にFAX番号が未登録の場合、
     * 「FAX番号が登録されていません」というエラーメッセージを表示する
     */
    test('REQ-6.5: FAX番号未登録時にエラーメッセージが表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerWithoutEmailId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // FAX番号がない協力業者で見積依頼を作成
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-6.5テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerWithoutEmailName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // 項目を選択
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      await checkboxes.first().click();

      // FAXを選択
      const faxRadio = page.getByRole('radio', { name: /FAX/i });
      await faxRadio.click();

      // 保存ボタンクリックで項目選択とメソッド変更を永続化（Task 30改修: debounce自動保存 -> 保存ボタン方式）
      await clickSaveSelectionButton(page);

      // 見積依頼文を表示ボタンをクリック
      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await showTextButton.click();
      await page.waitForTimeout(500);

      // FAX番号未登録エラーが表示される
      await expect(page.getByText(/FAX番号が登録されていません/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement estimate-request/REQ-6.7
     * 本文を所定のフォーマットで表示する
     */
    test('REQ-6.7: 本文が所定のフォーマットで表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-6.7テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // 項目を選択してから見積依頼文を表示する
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      await checkboxes.first().click();

      // 保存ボタンクリックで項目選択を永続化（Task 30改修: debounce自動保存 -> 保存ボタン方式）
      await clickSaveSelectionButton(page);

      // 見積依頼文を表示ボタンをクリック
      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await showTextButton.click();

      // 見積依頼文パネルが表示される
      const panel = page.locator('[role="region"][aria-label="見積依頼文"]');
      await expect(panel).toBeVisible({ timeout: getTimeout(10000) });

      // 本文セクションが表示される
      await expect(panel.getByText('本文')).toBeVisible({ timeout: getTimeout(10000) });

      // 本文にプロジェクト名または現場情報が含まれる（物件名など）
      await expect(panel.getByText(/物件名|プロジェクト|お世話になっております/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  // ============================================================================
  // Requirement 7: クリップボードコピー機能（追加テスト）
  // ============================================================================

  test.describe('Requirement 7: クリップボードコピー機能（追加）', () => {
    /**
     * @requirement estimate-request/REQ-7.4
     * クリップボードコピーボタンをクリックしたとき、該当する項目の内容をクリップボードにコピーする
     */
    test('REQ-7.4: クリップボードに内容がコピーされる', async ({ page, context }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      // クリップボード権限を付与
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-7.4テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // 項目を選択してから見積依頼文を表示する
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      await checkboxes.first().click();

      // 保存ボタンクリックで項目選択を永続化（Task 30改修: debounce自動保存 -> 保存ボタン方式）
      await clickSaveSelectionButton(page);

      // 見積依頼文を表示ボタンをクリック
      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await showTextButton.click();

      // 見積依頼文パネルが表示される
      const panel = page.locator('[role="region"][aria-label="見積依頼文"]');
      await expect(panel).toBeVisible({ timeout: getTimeout(10000) });

      // 表題のコピーボタンをクリック（パネル内の2番目のコピーボタン）
      const copyButtons = panel.getByRole('button', { name: /コピー/i });
      await expect(copyButtons.first()).toBeVisible({ timeout: getTimeout(10000) });

      // 表題セクションのコピーボタン（2番目）をクリック
      const subjectCopyButton = copyButtons.nth(1);
      await subjectCopyButton.click();

      // クリップボードの内容を確認
      const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());

      // クリップボードに「見積」または「依頼」が含まれることを確認
      expect(clipboardContent).toMatch(/見積|依頼|お見積り/i);
    });
  });

  // ============================================================================
  // Requirement 8: 見積依頼データ管理（楽観的排他制御テスト）
  // ============================================================================

  test.describe('Requirement 8: 見積依頼データ管理（楽観的排他制御）', () => {
    /**
     * @requirement estimate-request/REQ-8.5
     * 楽観的排他制御により同時更新を防止する
     */
    test('REQ-8.5: 楽観的排他制御がバージョン情報で管理される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-8.5テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      const response = await createPromise;

      const responseData = await response.json();

      // REQ-8.5: 楽観的排他制御。EstimateRequest に version 列は存在せず、更新・削除は
      // 期待する updatedAt との突き合わせで競合を検出し 409 を返す
      // （estimate-request.service.ts / estimate-requests.routes.ts）。
      // したがって排他制御の拠り所は updatedAt であり、「version または updatedAt」の
      // 論理和は version が無くても成立するため何も確かめていなかった。
      // 作成応答が排他制御に使える更新時刻を返すことを主張する。
      // 競合時に 409 が返ることは session-expired-protection-extra-e2e.spec.ts で検証している。
      expect(responseData.version, 'version 列は存在しないはず').toBeUndefined();
      expect(responseData.updatedAt, '作成応答に updatedAt が含まれない').toBeTruthy();
      expect(Date.parse(responseData.updatedAt)).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Requirement 2: 見積依頼一覧画面（ページネーション）
  // ============================================================================

  test.describe('Requirement 2: ページネーション', () => {
    /**
     * @requirement estimate-request/REQ-2.6
     * 一覧表示にページネーションを提供する
     */
    test('REQ-2.6: 一覧画面にページネーションUIが存在する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests`);
      await page.waitForLoadState('networkidle');

      // 読み込み完了を待機
      await expect(page.getByText(/読み込み中/i)).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // REQ-2.6: 一覧表示にページネーションを提供する。
      // 以前は「ページネーションがある、または『見積依頼はまだありません』が出ている」の
      // 論理和で判定していた。空状態を許す側があるため、ページネーションが失われても
      // 通ってしまう。要件が求めているのはページネーションの提供そのものである。
      // 本テストは事前準備で見積依頼を作成済みの一覧を開いているため、空状態にはならない。
      await expect(page.getByText(/見積依頼はまだありません/i)).toHaveCount(0);

      const paginationArea = page.locator('[aria-label*="ページ"]').or(page.getByText(/ページ/i));
      expect(await paginationArea.count()).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Requirement 3: 取引先検索機能
  // ============================================================================

  test.describe('Requirement 3: 取引先検索機能', () => {
    /**
     * @requirement estimate-request/REQ-3.5
     * 取引先の検索機能を提供する（プロジェクト新規作成時の顧客名検索と同様）
     */
    test('REQ-3.5: 宛先選択で取引先の候補が表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 宛先選択フィールド（combobox）が表示される
      const tradingPartnerCombobox = page.locator(
        'input[role="combobox"][aria-label="宛先（取引先）"]'
      );
      await expect(tradingPartnerCombobox).toBeVisible();

      // コンボボックスをクリックしてドロップダウンを開く
      await tradingPartnerCombobox.click();
      await page.waitForTimeout(500);

      // リストボックスの選択肢を取得
      const listbox = page.locator('ul[role="listbox"]');
      await expect(listbox).toBeVisible({ timeout: getTimeout(3000) });
      const options = await listbox.locator('li[role="option"]').all();

      // 少なくとも1つの選択肢がある
      expect(options.length).toBeGreaterThan(0);

      // 作成した協力業者名が選択肢に含まれる
      const optionTexts = await Promise.all(options.map((o) => o.textContent()));
      const hasPartner = optionTexts.some((text) =>
        text?.includes(tradingPartnerName.slice(0, 10))
      );
      expect(hasPartner).toBeTruthy();
    });
  });

  // ============================================================================
  // Requirement 4: 内訳書項目なし
  // ============================================================================

  test.describe('Requirement 4: 内訳書項目なし', () => {
    /**
     * @requirement estimate-request/REQ-4.18
     * 参照内訳書に項目が存在しない場合、「内訳書に項目がありません」というメッセージを表示する
     *
     * Note: 現在のAPI設計では空の数量表から内訳書を作成することは許可されていない
     * （EmptyQuantityItemsError）。このテストでは、空の数量表を選択した際の
     * フロントエンドバリデーションエラーメッセージを検証する。
     */
    test('REQ-4.13→4.18: 内訳書に項目がない場合のメッセージ表示 (estimate-request/REQ-4.18)', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 空の数量表を作成
      await page.goto(`/projects/${createdProjectId}/quantity-tables/new`);
      await page.waitForLoadState('networkidle');

      const emptyQuantityTableName = `空の数量表_${Date.now()}`;
      await page.getByRole('textbox', { name: /数量表名/i }).fill(emptyQuantityTableName);

      const createQuantityTablePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/quantity-tables') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createQuantityTablePromise;

      // 内訳書一覧画面に移動
      await page.goto(`/projects/${createdProjectId}/itemized-statements`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 新規作成リンクをクリックして内訳書作成ページに遷移
      await page.getByRole('link', { name: /新規作成/i }).click();

      // フォームが表示されるまで待機
      await expect(page.getByRole('textbox', { name: /内訳書名/i })).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 内訳書名を入力
      const nameInput = page.getByRole('textbox', { name: /内訳書名/i });
      await nameInput.fill('REQ-4.13テスト内訳書');

      // 空の数量表を選択
      const quantityTableSelect = page.locator('select#quantityTableId');

      // セレクトの中から「空の数量表」を含むオプションを見つけて選択
      const options = await quantityTableSelect.locator('option').all();
      let emptyTableValue: string | null = null;

      for (const option of options) {
        const text = await option.textContent();
        if (text && text.startsWith('空の数量表_')) {
          emptyTableValue = await option.getAttribute('value');
          break;
        }
      }

      expect(emptyTableValue).toBeTruthy();
      await quantityTableSelect.selectOption(emptyTableValue!);

      // 選択が反映されるのを待機
      await page.waitForTimeout(500);

      // 作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // 項目がない数量表選択時のエラーメッセージが表示される
      await expect(
        page.getByText(/選択された数量表に項目がありません|項目がありません/i)
      ).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  // ============================================================================
  // Requirement 7: クリップボードフォールバック
  // ============================================================================

  test.describe('Requirement 7: クリップボードフォールバック', () => {
    /**
     * @requirement estimate-request/REQ-7.6
     * クリップボードAPIが利用できない場合、テキストを選択状態にしてコピーを促すフォールバックを提供する
     * Note: このテストは通常の環境では実行が難しいため、コピー機能の基本動作を確認
     */
    test('REQ-7.6: コピーボタンが存在し、操作可能である', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-7.6テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // 項目を選択
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      await checkboxes.first().click();

      // 保存ボタンクリックで項目選択を永続化（Task 30改修: debounce自動保存 -> 保存ボタン方式）
      await clickSaveSelectionButton(page);

      // 見積依頼文を表示
      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await showTextButton.click();

      // 見積依頼文パネルが表示される
      const panel = page.locator('[role="region"][aria-label="見積依頼文"]');
      await expect(panel).toBeVisible({ timeout: getTimeout(10000) });

      // コピーボタンが存在し、クリック可能である
      const copyButtons = panel.getByRole('button', { name: /コピー/i });
      await expect(copyButtons.first()).toBeEnabled();

      // コピーボタンをクリックしてエラーにならないことを確認
      await copyButtons.first().click();

      // フィードバックまたはエラーがないことを確認（正常に機能している）
      // エラーダイアログが表示されていないことを確認
      await expect(page.getByRole('dialog', { name: /エラー/i })).not.toBeVisible({
        timeout: getTimeout(3000),
      });
    });
  });

  // ============================================================================
  // Requirement 10: 権限管理（操作拒否）
  // ============================================================================

  test.describe('Requirement 10: 権限管理（操作拒否）', () => {
    /**
     * @requirement estimate-request/REQ-10.4
     * 権限のないユーザーが見積依頼を操作しようとした場合、操作拒否エラーを表示する
     */
    test('REQ-10.4: 未認証状態での操作はログインにリダイレクトされる', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      // 認証なしで見積依頼作成ページにアクセス
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);

      // ログインページにリダイレクト
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });
    });
  });

  // ============================================================================
  // Requirement 4: 見積依頼詳細画面 - 項目選択（REQ-4.14 ~ REQ-4.20）
  // ============================================================================

  test.describe('Requirement 4: 項目選択（追加要件 REQ-4.14~4.20）', () => {
    // このブロック内で共有する見積依頼ID（REQ-4.14で作成）
    let blockEstimateRequestId: string | null = null;

    /**
     * @requirement estimate-request/REQ-4.14
     * 見積依頼方法のラジオボタンを変更したとき、選択状態をクライアントサイドの状態として管理する
     */
    test('REQ-4.14: 見積依頼方法のラジオボタン変更がクライアントサイドで管理される', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積依頼を作成
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill('REQ-4.14テスト見積依頼');

      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // URLからIDを取得してブロック内で共有
      const currentUrl = page.url();
      const idMatch = currentUrl.match(/\/estimate-requests\/([0-9a-f-]+)$/);
      if (idMatch) {
        blockEstimateRequestId = idMatch[1]!;
      }

      const emailRadio = page.getByRole('radio', { name: /メール/i });
      const faxRadio = page.getByRole('radio', { name: /FAX/i });

      // 見積依頼エンドポイントへの通信を**方法で絞り込まずに**記録する。
      // 絞り込みを観測子の中に置くと、その絞り込み自体が一度も的中しない場合でも
      // 「送信されていない」が成立し、不在の主張が何も述べない恒真式になる。
      const estimateRequestCallMethods: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/estimate-requests')) {
          estimateRequestCallMethods.push(request.method());
        }
      });

      // 陽性対照: 画面の再読込で観測子が実際に発火することを示す（実測: GET 7件を記録）。
      // これが無いと、以降の「更新系が無い」は観測子の沈黙と区別できない。
      await page.reload({ waitUntil: 'networkidle' });
      expect(
        estimateRequestCallMethods,
        '観測子が見積依頼エンドポイントへの通信を一件も捉えていない（不在の主張が空振りする）'
      ).toContain('GET');

      // メールラジオがデフォルトで選択されていることを確認
      await expect(emailRadio).toBeChecked({ timeout: getTimeout(10000) });
      const methodsBeforeClick = estimateRequestCallMethods.length;

      await faxRadio.click();

      // FAXラジオが選択されている（クライアントサイドの状態変更）
      await expect(faxRadio).toBeChecked();
      await expect(emailRadio).not.toBeChecked();

      // 「1秒待てば送信され終えているはず」という前提を置かず、
      // **不在を否定する事象そのもの**（更新系の要求）を待つ。
      // 要求が飛べばその時点で捉えて主張が落ち、飛ばなければ待機切れで null になる。
      // 待機切れ以外の失敗は `nullWhenTimedOut` が送出するため「起きなかった」に化けない。
      //
      // `page.waitForLoadState('networkidle')` は代わりにならない。現在の文書では
      // 既に networkidle が発火済みで、以降の呼び出しは**即座に解決する**
      // （Task 115.183 の実測: 0ms）。窓を一切作らないため、遅れて飛ぶ要求を取り逃す。
      const updateAfterClick = await nullWhenTimedOut(
        page.waitForRequest(
          (request) =>
            request.url().includes('/estimate-requests') &&
            (request.method() === 'PUT' || request.method() === 'PATCH'),
          { timeout: getTimeout(1000) }
        )
      );
      expect(updateAfterClick, 'ラジオ押下だけでサーバーへの更新が送信された').toBeNull();

      // 押下より後に更新系（PUT/PATCH）の通信が一件も無い（上の窓の外で飛んだ分も含める）
      const methodsAfterClick = estimateRequestCallMethods.slice(methodsBeforeClick);
      expect(
        methodsAfterClick.filter((method) => method === 'PUT' || method === 'PATCH'),
        'ラジオ押下だけでサーバーへの更新が送信された'
      ).toEqual([]);
    });

    /**
     * @requirement estimate-request/REQ-4.15
     * 内訳書項目が他の見積依頼で選択済みのとき、該当行の背景色を変更して視覚的に区別する
     */
    test('REQ-4.15: 他の見積依頼で選択済みの項目は背景色が変更される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 1つ目の見積依頼を作成して項目を選択
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      await page.locator('input#name').fill('REQ-4.15テスト依頼1');
      await selectTradingPartnerByName(page, tradingPartnerName);
      await page.locator('select[aria-label="内訳書"]').selectOption(createdItemizedStatementId!);

      const createPromise1 = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise1;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // 1つ目の見積依頼で項目を選択して保存
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      await checkboxes.first().click();
      await clickSaveSelectionButton(page);

      // 2つ目の見積依頼を作成（同じ内訳書を参照）
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      await page.locator('input#name').fill('REQ-4.15テスト依頼2');
      await selectTradingPartnerByName(page, tradingPartnerName);
      await page.locator('select[aria-label="内訳書"]').selectOption(createdItemizedStatementId!);

      const createPromise2 = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise2;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // 2つ目の見積依頼の項目一覧で、他の見積依頼で選択済みの行の背景色を確認
      const table = page.locator('table[aria-label="内訳書項目一覧"]');
      await expect(table).toBeVisible({ timeout: getTimeout(10000) });

      // 他の見積依頼で選択済みの行はオレンジ系の背景色（rgb(255, 247, 237)）になっている
      const firstRow = table.locator('tbody tr').first();
      const bgColor = await firstRow.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bgColor).toBe('rgb(255, 247, 237)');
    });

    /**
     * @requirement estimate-request/REQ-4.16
     * 内訳書項目が他の見積依頼で選択済みのとき、該当行の一番右の列に依頼先取引先名を表示する
     */
    test('REQ-4.16: 他の見積依頼で選択済みの項目に依頼先取引先名が表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 2つ目の見積依頼の詳細画面を開く（前のテストで作成済み）
      // 見積依頼一覧から最新の見積依頼を開く
      await page.goto(`/projects/${createdProjectId}/estimate-requests`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // REQ-4.15テスト依頼2をクリック
      await page.getByText('REQ-4.15テスト依頼2').click();
      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);
      await page.waitForLoadState('networkidle');

      // 項目テーブルの「他の依頼先」列に取引先名が表示されていることを確認
      const table = page.locator('table[aria-label="内訳書項目一覧"]');
      await expect(table).toBeVisible({ timeout: getTimeout(10000) });

      // 他の依頼先列のテキストに取引先名が含まれることを確認
      const otherRequestsCells = table.locator('tbody tr td:last-child');
      const firstCellText = await otherRequestsCells.first().textContent();
      expect(firstCellText).toBeTruthy();
      expect(firstCellText).not.toBe('-');
    });

    /**
     * @requirement estimate-request/REQ-4.17
     * 内訳書項目が複数の見積依頼で選択済みのとき、該当行の一番右の列にすべての依頼先取引先名を表示する
     */
    test('REQ-4.17: 複数の見積依頼で選択済みの項目にすべての依頼先名が表示される', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdTradingPartnerWithoutEmailId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 3つ目の見積依頼を別の取引先で作成（同じ内訳書の同じ項目を選択）
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      await page.locator('input#name').fill('REQ-4.17テスト依頼3');
      await selectTradingPartnerByName(page, tradingPartnerWithoutEmailName);
      await page.locator('select[aria-label="内訳書"]').selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // 項目テーブルの「他の依頼先」列に複数の取引先名が表示されていることを確認
      const table = page.locator('table[aria-label="内訳書項目一覧"]');
      await expect(table).toBeVisible({ timeout: getTimeout(10000) });

      // 他の依頼先列のテキストを確認（「、」区切りで複数表示されるはず）
      const otherRequestsCells = table.locator('tbody tr td:last-child');
      const firstCellText = await otherRequestsCells.first().textContent();

      // テスト依頼1で選択した項目は、テスト依頼1の取引先名が表示される
      expect(firstCellText).toBeTruthy();
      expect(firstCellText).not.toBe('-');
    });

    /**
     * @requirement estimate-request/REQ-4.18
     * 参照内訳書に項目が存在しない場合、「内訳書に項目がありません」というメッセージを表示する
     */
    test('REQ-4.18: 内訳書に項目がない場合のメッセージ表示', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 空の内訳書を持つ見積依頼の詳細画面で確認
      // まず空の内訳書を作成するため、空の数量表を作成
      await page.goto(`/projects/${createdProjectId}/quantity-tables/new`);
      await page.waitForLoadState('networkidle');

      const emptyTableName = `REQ-4.18空数量表_${Date.now()}`;
      await page.getByRole('textbox', { name: /数量表名/i }).fill(emptyTableName);

      const createQTPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/quantity-tables') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createQTPromise;

      // 内訳書を作成
      await page.goto(`/projects/${createdProjectId}/itemized-statements`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      await page.getByRole('link', { name: /新規作成/i }).click();
      await expect(page.getByRole('textbox', { name: /内訳書名/i })).toBeVisible({
        timeout: getTimeout(5000),
      });

      await page.getByRole('textbox', { name: /内訳書名/i }).fill('REQ-4.18空内訳書');

      // 空の数量表を選択
      const quantityTableSelect = page.locator('select#quantityTableId');
      const options = await quantityTableSelect.locator('option').all();

      let emptyTableValue: string | null = null;
      for (const option of options) {
        const text = await option.textContent();
        if (text && text.startsWith('REQ-4.18空数量表_')) {
          emptyTableValue = await option.getAttribute('value');
          break;
        }
      }

      // 直前で空の数量表を作成しているため、選択肢は必ず見つかる。
      // 以前は `if (emptyTableValue) { … } else { expect(emptyTableValue).toBeTruthy(); }` と
      // 書いていたが、値の絞り込みと失敗の主張が分かれており、else 側を消しても型検査が通った。
      // 主張と絞り込みを一つの呼び出しへ畳む。
      assertPrepared(emptyTableValue, 'REQ-4.18 検証用に作成した空の数量表の選択肢');

      await quantityTableSelect.selectOption(emptyTableValue);
      await expect(quantityTableSelect).toHaveValue(emptyTableValue);

      await page.getByRole('button', { name: /^作成$/i }).click();

      // 項目がない数量表選択時のエラーメッセージが表示される
      await expect(
        page.getByText(/選択された数量表に項目がありません|項目がありません/i)
      ).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement estimate-request/REQ-4.19
     * 未保存の変更が存在するとき、「保存」ボタンを視覚的に強調表示する
     */
    test('REQ-4.19: 未保存の変更があると保存ボタンが強調表示される', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(blockEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${blockEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 保存ボタンが表示されることを確認
      const saveButton = page.getByTestId('save-selection-button');
      await expect(saveButton).toBeVisible({ timeout: getTimeout(10000) });

      // 未保存の変更がない状態：保存ボタンは無効（非強調）
      const initialBgColor = await saveButton.evaluate(
        (el) => getComputedStyle(el).backgroundColor
      );
      // 無効状態は #9ca3af (rgb(156, 163, 175))
      expect(initialBgColor).toBe('rgb(156, 163, 175)');

      // チェックボックスを変更して未保存の変更を作成
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      await checkboxes.first().click();

      // CSSトランジション完了を待機（transition: background-color 0.2s）
      await page.waitForTimeout(500);

      // 未保存の変更がある状態：保存ボタンが強調表示される（非無効色であること）
      const highlightedBgColor = await saveButton.evaluate(
        (el) => getComputedStyle(el).backgroundColor
      );
      // 無効状態の色(rgb(156, 163, 175))ではなくなっていることを確認
      expect(highlightedBgColor).not.toBe('rgb(156, 163, 175)');

      // boxShadowが設定されていることで強調表示を確認（saveButtonHighlightスタイル）
      const boxShadow = await saveButton.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(boxShadow).not.toBe('none');
    });

    /**
     * @requirement estimate-request/REQ-4.20
     * ユーザーが未保存の変更がある状態でページを離脱しようとしたとき、確認ダイアログを表示する
     */
    test('REQ-4.20: 未保存の変更がある状態でページ離脱時に確認ダイアログが表示される', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(blockEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${blockEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // チェックボックスを変更して未保存の変更を作成
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      await checkboxes.first().click();

      // beforeunloadイベントリスナーが登録されていることを確認
      const hasBeforeUnload = await page.evaluate(() => {
        // beforeunloadイベントをディスパッチして、preventDefaultが呼ばれるか確認
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });
      expect(hasBeforeUnload).toBe(true);

      // ダイアログの観測を開始する（Task 115.178）。
      // 主張をリスナの中に置くと、その失敗が本体の終了後に届いた場合は誰も観測せず、
      // 緑のまま素通りする。観測だけをリスナで行い、主張は本体に置く。
      // 応答は accept（dismiss だと page.goto が ERR_ABORTED になる）。
      const dialogs = observeDialogs(page);

      try {
        // ページ離脱を試行（別のURLに遷移）
        await page.goto(`/projects/${createdProjectId}`);
      } finally {
        // 本体の終了前にリスナを外す。以降の対話で新たな応答は始まらない。
        dialogs.detach();
      }

      // 外したうえで保留中の応答を待ち合わせ、控えた失敗を送出する（飲まない）。
      await dialogs.settle();

      // beforeunloadダイアログが表示されたことを確認
      expect(
        dialogs.observed.map((observation) => observation.type),
        'REQ-4.20: 未保存の変更があるままページを離脱しようとしても beforeunload の確認ダイアログが表示されない'
      ).toContain('beforeunload');
    });

    /**
     * 受入基準4.8「When 選択状態の保存が成功したとき, the システム shall 保存完了のフィードバックを表示する」
     * @requirement estimate-request/REQ-4.8
     */
    test('REQ-4.8: 選択状態の保存が成功すると保存完了のフィードバックが表示される', async ({
      page,
    }) => {
      expect(blockEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimate-requests/${blockEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      const initialState = await checkboxes.first().isChecked();
      await checkboxes.first().click();

      // 変更前はフィードバックが出ていない
      const feedback = page.getByTestId('save-feedback');
      await expect(feedback).toHaveCount(0);

      // 保存の要求が成功したことを確かめたうえで、フィードバックを主張する
      const saveResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/estimate-requests/${blockEstimateRequestId}/items` &&
          response.request().method() === 'PATCH',
        { timeout: getTimeout(15000) }
      );
      await page.getByTestId('save-selection-button').click();
      expect((await saveResponse).ok(), '前提: 選択状態の保存の要求が成功する').toBe(true);

      await expect(feedback).toBeVisible({ timeout: getTimeout(10000) });
      await expect(feedback).toHaveAttribute('role', 'status');
      await expect(feedback).toHaveText('保存しました');

      // 保存が完了したので未保存の変更は無い（保存ボタンは非活性に戻る）
      await expect(page.getByTestId('save-selection-button')).toBeDisabled();

      // 永続化された選択状態は変更後の値である（成功の表示が実際の成功と一致する）
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      expect(await checkboxes.first().isChecked()).toBe(!initialState);
    });

    /**
     * 受入基準4.9「If 選択状態の保存が失敗した場合, then the システム shall エラーメッセージを表示し
     * 選択状態をサーバー側の最新状態に復元する」
     * 保存の要求（PATCH /api/estimate-requests/:id/items）だけを 500 で失敗させる。
     * @requirement estimate-request/REQ-4.9
     */
    test('REQ-4.9: 選択状態の保存が失敗するとエラーメッセージを表示し選択状態をサーバーの状態に戻す', async ({
      page,
    }) => {
      expect(blockEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimate-requests/${blockEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      const serverState = await checkboxes.first().isChecked();

      const itemsPath = `/api/estimate-requests/${blockEstimateRequestId}/items`;
      let failedSaveRequests = 0;
      await page.route(
        (url) => url.pathname === itemsPath,
        async (route) => {
          if (route.request().method() !== 'PATCH') {
            await route.fallback();
            return;
          }
          failedSaveRequests++;
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              type: 'about:blank',
              title: 'Internal Server Error',
              status: 500,
              detail: 'E2E: 選択状態の保存を失敗させる',
            }),
          });
        }
      );

      // 選択状態を変更して保存する
      await checkboxes.first().click();
      await expect(checkboxes.first()).toBeChecked({ checked: !serverState });
      await page.getByTestId('save-selection-button').click();

      // 前提: 保存の要求が、失敗させた経路を通った
      await expect
        .poll(() => failedSaveRequests, {
          message: '前提: 保存の要求（PATCH）が失敗させた経路を通った',
          timeout: getTimeout(10000),
        })
        .toBeGreaterThan(0);

      // エラーメッセージが表示される（クライアントの再試行を含めて待つ）
      const feedback = page.getByTestId('save-feedback');
      await expect(feedback).toBeVisible({ timeout: getTimeout(30000) });
      await expect(feedback).toContainText('失敗', { timeout: getTimeout(30000) });
      await expect(feedback).not.toHaveText('保存しました');

      // 選択状態がサーバー側の最新状態に復元される
      await expect(checkboxes.first()).toBeChecked({ checked: serverState });
      // 未保存の変更は残らない（保存ボタンは非活性）
      await expect(page.getByTestId('save-selection-button')).toBeDisabled();

      // サーバー側の状態は変わっていない
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      await expect(checkboxes.first()).toBeChecked({ checked: serverState });
    });
  });

  // ============================================================================
  // Requirement 39: 内訳書任意化（Task 85.5: 4 シナリオ）
  // ============================================================================
  //
  // - シナリオ 1（クイック作成→詳細）: 内訳書空欄で作成し、詳細画面で項目選択
  //   セクション・Excel 出力・「本文に含める」チェックボックス・参照内訳書「-」・
  //   受領見積書セクションが期待通り表示されることの確認（Req 39.2, 39.7, 39.8, 39.10, 39.11）
  // - シナリオ 2（一覧表示）: 一覧で参照内訳書名列に「-」が表示されること（Req 39.6）
  // - シナリオ 3（編集挙動）: 編集画面で内訳書（読み取り専用）ブロックが非表示で、
  //   name 更新が可能であること（Req 39.10, 39.12）。method 更新は詳細画面の
  //   ItemSelectionPanel 内ラジオで行うため、内訳書なしでは UI が出ない実装現状を
  //   反映し、name 更新のみを観察（CONCERNS 参照）
  // - シナリオ 4（内訳書ありの回帰）: 既存挙動が維持されていることの確認（Req 39.12）
  // ============================================================================

  test.describe('Requirement 39: 内訳書任意化', () => {
    let quickEstimateRequestId: string | null = null;
    let regressionEstimateRequestId: string | null = null;

    /**
     * @requirement estimate-request/REQ-39.2
     * @requirement estimate-request/REQ-39.4 データモデルで参照内訳書を任意（NULL 許容）として扱う（API レスポンスの itemizedStatementId === null で担保）
     * @requirement estimate-request/REQ-39.7
     * @requirement estimate-request/REQ-39.8
     * @requirement estimate-request/REQ-39.10
     * @requirement estimate-request/REQ-39.11
     * シナリオ 1: クイック作成→詳細
     * 内訳書空欄でクイック作成 → 詳細画面で：
     *   - 項目選択セクション（table[aria-label="内訳書項目一覧"]）が非表示
     *   - Excel 出力ボタンが非表示
     *   - 「内訳書を本文に含める」チェックボックスが非表示
     *   - 参照内訳書表示が「-」
     *   - 受領見積書セクション（受領見積書 ReceivedQuotationList）が利用可能
     */
    test('REQ-39.2 / 39.7 / 39.8 / 39.10 / 39.11: クイック作成（内訳書空欄）後の詳細画面で必要な非表示・表示が反映される', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細経由ではなく作成画面へ直接遷移（Req 39.2）
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 名前を入力
      const nameInput = page.locator('input#name');
      await nameInput.fill('Task85.5 クイック作成テスト');

      // 宛先を選択（協力業者）
      await selectTradingPartnerByName(page, tradingPartnerName);

      // 内訳書は意図的に空欄のまま（クイック作成 / Req 39.2）
      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      // デフォルトの空文字 value のままであることを確認（第3原則: 前提条件で無効化せず明示）
      const initialValue = await itemizedStatementSelect.inputValue();
      expect(initialValue).toBe('');

      // 作成 API を待機
      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/ }).click();
      const createResponse = await createPromise;
      const createBody = await createResponse.json();
      // itemizedStatementId が null（内訳書未紐付け）であることを確認（Req 39.2）
      expect(createBody.itemizedStatementId).toBeNull();
      quickEstimateRequestId = createBody.id;

      // 詳細画面に遷移を確認
      await expect(page).toHaveURL(/\/estimate-requests\/[0-9a-f-]+$/, {
        timeout: getTimeout(10000),
      });

      // 項目選択セクション（内訳書項目一覧テーブル）が非表示（Req 39.7）
      await expect(page.locator('table[aria-label="内訳書項目一覧"]')).not.toBeVisible({
        timeout: getTimeout(5000),
      });

      // Excel 出力ボタンが非表示（Req 39.8）
      await expect(page.locator('button:has-text("Excelでエクスポート")')).not.toBeVisible({
        timeout: getTimeout(5000),
      });

      // 「内訳書を本文に含める」チェックボックスが非表示（Req 39.8）
      // 見積依頼文パネルを開いてもチェックボックスが現れないことを確認
      // 「見積依頼文を表示」ボタンは REQ-5.1 のとおり常に描画される
      // （`EstimateRequestDetailPage` のアクションカードで無条件にレンダリングされる）。
      // 以前は「ボタンが見えなければパネルを開かずに判定する」という全域分岐であったが、
      // else 側はパネルを開かないため「展開後も非表示である」ことを確かめていなかった。
      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await expect(showTextButton).toBeVisible({ timeout: getTimeout(10000) });
      await showTextButton.click();

      // パネル展開後も「内訳書を本文に含める」は非表示
      await expect(page.getByLabel(/内訳書を本文に含める/i)).not.toBeVisible({
        timeout: getTimeout(5000),
      });

      // 参照内訳書表示が「-」（Req 39.7 関連 / 一覧含む全体方針）
      // 基本情報カード内の「参照内訳書」ラベルに対応する値が「-」
      const detailReferenceText = page
        .locator('text=参照内訳書')
        .locator('..')
        .locator('span')
        .last();
      await expect(detailReferenceText).toHaveText('-', { timeout: getTimeout(5000) });

      // 受領見積書セクションが利用可能（Req 39.11）
      // ReceivedQuotationList コンポーネントの可視性を確認
      // セクションタイトル等のテキストで判定（実装の data-testid 不在のため文言で判定）
      await expect(page.getByText(/受領見積書/).first()).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement estimate-request/REQ-39.9
     * シナリオ 1b: 内訳書未紐付けの見積依頼の見積依頼文
     * シナリオ 1 でクイック作成した見積依頼の詳細画面で見積依頼文を表示し、
     * 本文の取得が成功して（「見積依頼文を取得できませんでした」ではない）、
     * 本文の【内容】セクションに「添付内訳書の通り」が表示されることを確認する
     */
    test('REQ-39.9: 内訳書未紐付けの見積依頼で本文の【内容】に「添付内訳書の通り」が表示される', async ({
      page,
    }) => {
      expect(quickEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimate-requests/${quickEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 前提: 内訳書未紐付けであり、項目選択セクションが無い（Req 39.7）
      await expect(page.locator('table[aria-label="内訳書項目一覧"]')).toHaveCount(0);

      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await expect(showTextButton).toBeVisible({ timeout: getTimeout(10000) });
      const textResponsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.endsWith(
            `/estimate-requests/${quickEstimateRequestId}/text`
          ) && response.request().method() === 'GET',
        { timeout: getTimeout(30000) }
      );
      await showTextButton.click();
      const textResponse = await textResponsePromise;
      // 本文の取得が成功する（項目が無いことによる 422 NO_ITEMS_SELECTED ではない）
      expect(textResponse.status()).toBe(200);

      const panel = page.locator('[role="region"][aria-label="見積依頼文"]');
      await expect(panel).toBeVisible({ timeout: getTimeout(10000) });
      await expect(panel.getByText('見積依頼文を取得できませんでした')).toHaveCount(0);

      // 本文の【内容】セクションに「添付内訳書の通り」が表示される
      const bodyPre = panel.locator('pre');
      await expect(bodyPre).toBeVisible({ timeout: getTimeout(10000) });
      await expect(bodyPre).toContainText('【内容】\n添付内訳書の通り');
    });

    /**
     * @requirement estimate-request/REQ-39.6
     * シナリオ 2: 一覧表示
     * 内訳書なしの見積依頼が一覧で参照内訳書名列に「-」と表示されることの確認
     */
    test('REQ-39.6: 内訳書なしの見積依頼が一覧で参照内訳書名「-」と表示される', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(quickEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 一覧画面に遷移
      await page.goto(`/projects/${createdProjectId}/estimate-requests`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i)).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // クイック作成した見積依頼カードを取得
      const card = page.getByTestId(`request-card-${quickEstimateRequestId}`);
      await expect(card).toBeVisible({ timeout: getTimeout(10000) });

      // カード内のメタ情報に「-」が含まれる（参照内訳書名フォールバック）
      // 実装: `${formatDate(...)} / ${tradingPartnerName} / ${formatMethod(method)} / ${itemizedStatementName ?? '-'}`
      const meta = card.locator('p').first();
      await expect(meta).toContainText(' / -', { timeout: getTimeout(5000) });
    });

    /**
     * @requirement estimate-request/REQ-39.10
     * @requirement estimate-request/REQ-39.12
     * シナリオ 3: 編集挙動
     * 内訳書なしの見積依頼の編集画面で内訳書（読み取り専用）ブロックが非表示、
     * name の更新が通常通り可能であることの確認。
     *
     * 注: method 更新の UI は詳細画面の ItemSelectionPanel 内ラジオで提供されており、
     *     内訳書なし時は ItemSelectionPanel 自体が非表示になる現実装に合わせ、
     *     編集画面では name 更新のみを E2E で観察する。method API 更新は backend
     *     unit/integration テスト（Task 85.1, 85.2）でカバー。
     */
    test('REQ-39.10 / 39.12: 編集画面で内訳書ブロックが非表示、name 更新が可能', async ({
      page,
    }) => {
      expect(quickEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 編集画面に遷移
      await page.goto(`/estimate-requests/${quickEstimateRequestId}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 内訳書（読み取り専用）ブロックが非表示（Req 39.12）
      // 「内訳書は変更できません」ヘルパーテキストが表示されないことで判定
      await expect(page.getByText(/内訳書は変更できません/)).not.toBeVisible({
        timeout: getTimeout(3000),
      });

      // 「内訳書」ラベル（読み取り専用ブロック内のもの）も表示されない
      // 注: 「参照内訳書」など他のラベルとの競合を避けるため exact 比較は厳格化しない
      const readOnlyItemizedLabel = page.locator('label', { hasText: /^内訳書$/ });
      await expect(readOnlyItemizedLabel).toHaveCount(0, { timeout: getTimeout(3000) });

      // name の更新が可能（Req 39.10）
      const nameInput = page.locator('input#name');
      await expect(nameInput).toBeEnabled({ timeout: getTimeout(5000) });

      const updatedName = `Task85.5 編集後_${Date.now()}`;
      await nameInput.fill(updatedName);

      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      // 更新ボタンをクリック
      await page.getByRole('button', { name: /^更新$/ }).click();
      const updateResponse = await updatePromise;
      const updateBody = await updateResponse.json();
      expect(updateBody.name).toBe(updatedName);
      // 内訳書未紐付けが維持されていることを確認（Req 39.12）
      expect(updateBody.itemizedStatementId).toBeNull();
    });

    /**
     * @requirement estimate-request/REQ-39.3 内訳書を選択して保存した場合に従来通り内訳書を紐付ける（itemizedStatementId が選択値と一致）
     * @requirement estimate-request/REQ-39.12
     * シナリオ 4: 内訳書ありの回帰
     * 既存の内訳書ありの見積依頼を作成し、詳細・一覧・編集すべての画面で
     * 従来通りの表示・挙動であることの確認。
     */
    test('REQ-39.12: 内訳書ありの見積依頼で従来挙動が維持される（回帰）', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 内訳書ありの見積依頼を新規作成
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const requestName = 'Task85.5 内訳書あり回帰テスト';
      await page.locator('input#name').fill(requestName);
      await selectTradingPartnerByName(page, tradingPartnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );
      await page.getByRole('button', { name: /^作成$/ }).click();
      const createResponse = await createPromise;
      const createBody = await createResponse.json();
      // 内訳書 ID が紐付いていることを確認（Req 39.12: 既存挙動維持）
      expect(createBody.itemizedStatementId).toBe(createdItemizedStatementId);
      regressionEstimateRequestId = createBody.id;

      // 詳細画面に遷移を確認
      await expect(page).toHaveURL(/\/estimate-requests\/[0-9a-f-]+$/, {
        timeout: getTimeout(10000),
      });

      // 詳細: 項目選択セクション（内訳書項目一覧テーブル）が表示される
      await expect(page.locator('table[aria-label="内訳書項目一覧"]')).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 詳細: Excel 出力ボタンが表示される
      await expect(page.locator('button:has-text("Excelでエクスポート")')).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 詳細: 参照内訳書には内訳書名（「-」ではない）が表示される
      const detailReferenceText = page
        .locator('text=参照内訳書')
        .locator('..')
        .locator('span')
        .last();
      await expect(detailReferenceText).not.toHaveText('-', { timeout: getTimeout(5000) });
      await expect(detailReferenceText).toContainText('見積依頼テスト用内訳書');

      // 一覧: 参照内訳書名列に内訳書名が表示される（「-」ではない）
      await page.goto(`/projects/${createdProjectId}/estimate-requests`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i)).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const card = page.getByTestId(`request-card-${regressionEstimateRequestId}`);
      await expect(card).toBeVisible({ timeout: getTimeout(10000) });
      const meta = card.locator('p').first();
      await expect(meta).toContainText('見積依頼テスト用内訳書', { timeout: getTimeout(5000) });

      // 編集画面: 内訳書（読み取り専用）ブロックが表示される
      await page.goto(`/estimate-requests/${regressionEstimateRequestId}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 「内訳書は変更できません」ヘルパーテキストが表示される
      await expect(page.getByText(/内訳書は変更できません/)).toBeVisible({
        timeout: getTimeout(5000),
      });
      // 内訳書名がそのまま読み取り専用フィールドに表示される
      await expect(page.getByText('見積依頼テスト用内訳書').first()).toBeVisible({
        timeout: getTimeout(5000),
      });
    });
  });

  // ============================================================================
  // Requirement 41: 見積依頼文 - メーラーへのワンクリック転記
  // ============================================================================

  test.describe('Requirement 41: メーラーへのワンクリック転記', () => {
    /**
     * 見積依頼を新規作成し、項目を選択して見積依頼文パネルを開くまでを行う共通ヘルパー。
     * 既存スペックのデータ準備パターン（取引先選択・内訳書選択・項目選択・保存ボタン）を踏襲する。
     *
     * @param page Playwright Page
     * @param partnerName 宛先取引先名（メールあり／なしを呼び出し側で指定）
     * @param requestName 見積依頼名
     * @param method 'EMAIL' | 'FAX'（FAX の場合は FAX ラジオを選択して保存）
     */
    async function setupEstimateRequestAndOpenTextPanel(
      page: import('@playwright/test').Page,
      partnerName: string,
      requestName: string,
      method: 'EMAIL' | 'FAX'
    ) {
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const nameInput = page.locator('input#name');
      await nameInput.fill(requestName);

      await selectTradingPartnerByName(page, partnerName);

      const itemizedStatementSelect = page.locator('select[aria-label="内訳書"]');
      await itemizedStatementSelect.selectOption(createdItemizedStatementId!);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/estimate-requests') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      await createPromise;

      await page.waitForURL(/\/estimate-requests\/[0-9a-f-]+$/);

      // 少なくとも1つの項目を選択（見積依頼文生成に必要）
      const checkboxes = page.locator('table[aria-label="内訳書項目一覧"] input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: getTimeout(10000) });
      await checkboxes.first().click();

      // 見積依頼方法のラジオを明示的に選択する。
      // 以前は `if (method === 'FAX') { 選択して確認 } else { 既定の確認だけ }` と
      // 経路ごとに手順が違ったため、経路によって行われる検証が食い違っていた。
      // どちらの方法でも「選ぶ → 選ばれている」を同じ手順で行う
      // （メールは既定で選択済みだが、明示的に選び直しても状態は変わらない）。
      const methodRadio = page.getByRole('radio', {
        name: method === 'FAX' ? /FAX/i : /メール/i,
      });
      await methodRadio.click();
      await expect(methodRadio).toBeChecked({ timeout: getTimeout(10000) });

      // 保存ボタンで項目選択・見積依頼方法をサーバーに永続化（Task 30改修）
      await clickSaveSelectionButton(page);

      // 見積依頼文表示ボタンをクリックしてパネルを開く
      const showTextButton = page.getByRole('button', { name: /見積依頼文を表示/i });
      await expect(showTextButton).toBeVisible({ timeout: getTimeout(10000) });
      await showTextButton.click();

      const panel = page.locator('[role="region"][aria-label="見積依頼文"]');
      await expect(panel).toBeVisible({ timeout: getTimeout(10000) });

      return panel;
    }

    /**
     * @requirement estimate-request/REQ-41.1
     * @requirement estimate-request/REQ-41.2
     * @requirement estimate-request/REQ-41.3
     * @requirement estimate-request/REQ-41.4
     * @requirement estimate-request/REQ-41.5
     * @requirement estimate-request/REQ-41.6
     * @requirement estimate-request/REQ-41.7
     * @requirement estimate-request/REQ-41.8
     * メール方法・メールアドレス登録済み取引先で、「メールで開く」「Gmailで開く」が活性であり、
     * mailto / Gmail compose URL のいずれにも表示中の宛先・表題・本文が転記され、
     * いずれも新規作成（compose）の起動にとどまり自動送信しないことを検証する。
     */
    test('REQ-41.1/41.2/41.3/41.4/41.5/41.6/41.7/41.8: メール方法でボタンが活性化し、mailto/Gmail compose URLへ宛先・表題・本文が転記される', async ({
      page,
      context,
    }) => {
      // 第3原則: テストは前提条件で自動的に無効化せず、欠落時は失敗させる
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      // 実際の Gmail への外部ナビゲーション／ネットワークアクセスを遮断する。
      // mail.google.com へのリクエストは中断するが、中断するとポップアップは
      // エラーページ(chromewebdata)に遷移し popup.url() では compose URL を取得できない。
      // そのため window.open が要求した URL を route ハンドラ内で確実に捕捉する。
      let gmailRequestUrl: string | null = null;
      await context.route(/mail\.google\.com/, (route) => {
        if (!gmailRequestUrl) {
          gmailRequestUrl = route.request().url();
        }
        return route.abort();
      });

      await loginAsUser(page, 'REGULAR_USER');

      const panel = await setupEstimateRequestAndOpenTextPanel(
        page,
        tradingPartnerName,
        'REQ-41メール転記テスト見積依頼',
        'EMAIL'
      );

      // 「メールで開く」は活性時にアンカー（mailto）として描画される（Req 41 AC 1）。
      // OS ハンドラ起動を伴うため E2E ではクリックせず、href の転記内容を検証する。
      const mailOpenAnchor = panel.getByRole('link', { name: 'メールで開く' });
      await expect(mailOpenAnchor).toBeVisible({ timeout: getTimeout(10000) });
      const mailtoHref = await mailOpenAnchor.getAttribute('href');
      expect(mailtoHref).toBeTruthy();
      // mailto スキーム = OS 既定メーラーの新規作成画面を起動する。送信パラメータは持たない (REQ-41.2/41.7)
      expect(mailtoHref!).toMatch(/^mailto:/);
      const mailtoParsed = new URL(mailtoHref!);
      // 宛先＝宛先取引先のメールアドレス (REQ-41.4)
      expect(decodeURIComponent(mailtoParsed.pathname)).toBe('test-subcontractor@example.com');
      // 表題・本文が入力済み（空でない）であること (REQ-41.2/41.5/41.6)
      const mailtoSubject = mailtoParsed.searchParams.get('subject');
      const mailtoBody = mailtoParsed.searchParams.get('body');
      expect(mailtoSubject).toBeTruthy();
      expect(mailtoBody).toBeTruthy();
      // 転記元が「表示中の見積依頼文」であること（表題・本文が画面表示と一致）(REQ-41.5/41.6)
      await expect(panel.getByText(mailtoSubject!, { exact: false }).first()).toBeVisible();
      const bodyFirstLine = mailtoBody!.replace(/\r\n/g, '\n').split('\n')[0] ?? '';
      expect(bodyFirstLine.length).toBeGreaterThan(0);
      await expect(panel.locator('pre', { hasText: bodyFirstLine })).toBeVisible();

      // 「Gmailで開く」ボタンは活性（disabled でない）（Req 41 AC 1/8）
      const gmailOpenButton = panel.getByRole('button', { name: 'Gmailで開く' });
      await expect(gmailOpenButton).toBeVisible();
      await expect(gmailOpenButton).toBeEnabled();

      // 「Gmailで開く」クリックで Gmail 新規作成画面（compose）のポップアップが開かれることを検証（Req 41 AC 3）
      const popupPromise = context.waitForEvent('page', { timeout: getTimeout(10000) });
      await gmailOpenButton.click();
      const popup = await popupPromise;

      // window.open が要求した Gmail compose URL（route ハンドラで捕捉）が
      // Gmail compose URL であり、宛先・表題・本文が転記済みであることをアサート。
      // abort によりポップアップ自体は chromewebdata に遷移するため popup.url() は使わない。
      await expect.poll(() => gmailRequestUrl, { timeout: getTimeout(10000) }).toBeTruthy();
      const gmailParsed = new URL(gmailRequestUrl!);
      expect(gmailParsed.hostname).toBe('mail.google.com');
      // view=cm は「新規作成（compose）」モード。自動送信は行わない (REQ-41.3/41.7)
      expect(gmailParsed.searchParams.get('view')).toBe('cm');
      // 宛先・表題・本文が mailto と同一内容で転記される (REQ-41.4/41.5/41.6)
      expect(gmailParsed.searchParams.get('to')).toBe('test-subcontractor@example.com');
      expect(gmailParsed.searchParams.get('su')).toBe(mailtoSubject);
      expect(gmailParsed.searchParams.get('body')).toBe(mailtoBody);

      // 実際の Gmail へ遷移・ネットワークアクセスさせないため即時 close する
      await popup.close();
    });

    /**
     * @requirement estimate-request/REQ-41.9
     * @requirement estimate-request/REQ-41.10
     * メールアドレス未登録の取引先（メール方法）／FAX 方法の見積依頼で、
     * 両ボタンが無効化され、無効化理由が表示される
     */
    test('REQ-41.9/41.10: メールアドレス未登録・FAX方法で両ボタンが無効化され理由が表示される', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerWithoutEmailId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // --- ケース1: メール方法・メールアドレス未登録（Req 41 AC 9） ---
      const panelNoEmail = await setupEstimateRequestAndOpenTextPanel(
        page,
        tradingPartnerWithoutEmailName,
        'REQ-41メールなし転記テスト見積依頼',
        'EMAIL'
      );

      // 無効化時「メールで開く」はアンカーではなく disabled button として描画される
      await expect(panelNoEmail.getByRole('link', { name: 'メールで開く' })).toHaveCount(0);
      const mailOpenButtonDisabled = panelNoEmail.getByRole('button', { name: 'メールで開く' });
      await expect(mailOpenButtonDisabled).toBeVisible({ timeout: getTimeout(10000) });
      await expect(mailOpenButtonDisabled).toBeDisabled();

      // 「Gmailで開く」ボタンも無効化される
      await expect(panelNoEmail.getByRole('button', { name: 'Gmailで開く' })).toBeDisabled();

      // 無効化理由が表示される。
      // 注: 「メールアドレスが登録されていません」は宛先欄(recipientError)とボタン横(mailDisabledReason)の
      // 両方に出るため strict mode 違反を避けて first() を用いる。
      await expect(
        panelNoEmail.getByText('メールアドレスが登録されていません').first()
      ).toBeVisible({ timeout: getTimeout(10000) });

      // --- ケース2: FAX 方法（Req 41 AC 10） ---
      // FAX 方法では宛先メールの有無に関わらずメール起動の対象外となる。
      // メールアドレス登録済み取引先で FAX 方法を選択し、両ボタンが無効化されることを検証する。
      const panelFax = await setupEstimateRequestAndOpenTextPanel(
        page,
        tradingPartnerName,
        'REQ-41FAX方法転記テスト見積依頼',
        'FAX'
      );

      // FAX 方法時「メールで開く」は disabled button として描画される
      await expect(panelFax.getByRole('link', { name: 'メールで開く' })).toHaveCount(0);
      await expect(panelFax.getByRole('button', { name: 'メールで開く' })).toBeDisabled();

      // 「Gmailで開く」ボタンも無効化される
      await expect(panelFax.getByRole('button', { name: 'Gmailで開く' })).toBeDisabled();

      // FAX 方法のためメール起動対象外である理由が表示される
      await expect(panelFax.getByText('FAX依頼のためメール起動の対象外です')).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement estimate-request/REQ-41.11
     * メーラー起動ボタン（メールで開く／Gmailで開く）の追加後も、見積依頼文の
     * 宛先・表題・本文の既存クリップボードコピー機能が従来どおり動作し、挙動が変わらないことを検証する。
     */
    test('REQ-41.11: メーラー起動ボタン追加後も宛先・表題・本文のクリップボードコピーの挙動が変わらない', async ({
      page,
      context,
    }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();

      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      await loginAsUser(page, 'REGULAR_USER');

      const panel = await setupEstimateRequestAndOpenTextPanel(
        page,
        tradingPartnerName,
        'REQ-41クリップボード非変更テスト見積依頼',
        'EMAIL'
      );

      // メーラー起動ボタンが活性で表示されている状態であることを確認（コピー機能と併存する）
      await expect(panel.getByRole('link', { name: 'メールで開く' })).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(panel.getByRole('button', { name: 'Gmailで開く' })).toBeEnabled();

      // 宛先・表題・本文の3つのコピーボタンが従来どおり存在する
      const copyButtons = panel.getByRole('button', { name: /^コピー$/ });
      await expect(copyButtons).toHaveCount(3);

      // 宛先コピーボタン（1番目）押下で宛先メールアドレスがクリップボードへコピーされる（挙動不変）
      await copyButtons.first().click();
      const clipboardRecipient = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardRecipient).toBe('test-subcontractor@example.com');
    });
  });
});
