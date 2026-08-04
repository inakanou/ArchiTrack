/**
 * @fileoverview 見積書機能のE2Eテスト
 *
 * Task 15: E2Eテストの実装
 *
 * かつてこの一覧は `- REQ-1.1 ~ REQ-1.6` のような範囲表記だった。
 * 帰属の抽出規則（`scripts/check-requirement-coverage.ts` の `extractTestCoverage`）は
 * `- REQ-N.M` 形式しか読まないため、範囲の**始点だけ**が拾われ、
 * 実際には検証していない REQ-1.1・REQ-2.1・REQ-8.1・REQ-9.1・REQ-11.1 が
 * このファイルの担当として数えられていた（逆に範囲の途中は取りこぼされていた）。
 * 各テストの `@requirement` タグと一致する形へ揃える。
 *
 * Requirements coverage (estimate-creation):
 * - REQ-1.3: 数量または単価の入力に応じて金額を単価×数量として自動計算する
 * - REQ-2.5: 階層の深さに上限を設けない
 * - REQ-2.7: 親項目の展開・折りたたみで子項目の表示/非表示を切り替える
 * - REQ-3.1: 見積書新規作成時にプロジェクトの内訳書選択画面を表示する
 * - REQ-3.2: 選択した内訳書の内容を見積書の初期値とする
 * - REQ-3.3: 内訳書を選択せずに空の見積書を作成する
 * - REQ-4.1: 見積項目行を指定して受領見積書の行を転記する
 * - REQ-4.2: 見積項目行を指定せずに受領見積書の行を転記する
 * - REQ-4.3: 受領見積書から名称・規格・単位・数量・単価を転記する
 * - REQ-4.4: 複数の受領見積書を順次転記する
 * - REQ-5.1: 業者と対象の業者金額行を指定してNET金額計算を開始する
 * - REQ-5.2: 案分から除外する諸経費行を指定する
 * - REQ-5.3: NET金額の入力を受け付ける
 * - REQ-6.1: 利益率を指定して全実行金額行に反映する
 * - REQ-6.2: 「すべて上書き」オプションを選択する
 * - REQ-6.3: 「空の場合のみ上書き」オプションを選択する
 * - REQ-6.4: 「単価のみ上書き」オプションを選択する
 * - REQ-6.5: 見積金額行への反映を実行する
 * - REQ-6.6: 利益率を百分率で入力可能とする
 * - REQ-7.1: 共通仮設費行のプリセット値（名称・規格・単位・数量）を設定する
 * - REQ-7.2: 共通仮設費の単価を手入力で設定可能とする
 * - REQ-7.3: 国土交通省の共通費積算基準に準じて単価を自動計算する
 * - REQ-7.4: 自動計算に必要なパラメータの入力画面を提供する
 * - REQ-7.5: 自動計算結果を手入力で上書き可能とする
 * - REQ-7.6: 自動計算が処理中であることを表示する
 * - REQ-10.1: PDF出力で建設工事見積書形式のファイルを生成する
 * - REQ-10.2: Excel出力でPDFと同じ内容のファイルを生成する
 * - REQ-12.1: 見積項目の追加で新規の3行1セットを生成する
 *
 * @module e2e/specs/estimate/estimate-e2e.spec
 */

import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import {
  buildNewEstimateItemNode,
  findEstimateItemByName,
  getEstimateItemTree,
  saveEstimateDraft,
} from '../../helpers/estimate-draft';
import type { SaveNodePayload } from '../../helpers/estimate-draft';

/**
 * 見積書機能のE2Eテスト
 */
test.describe('見積書機能', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストデータの保存
  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateId: string | null = null;
  let createdEstimateIdWithoutItemizedStatement: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let createdReceivedQuotationId: string | null = null;
  let createdReceivedQuotationName: string = '';
  let accessToken: string = '';
  let projectName: string = '';
  let tradingPartnerName: string = '';

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  // ============================================================================
  // タスク15.1: 見積書作成から出力までの一連のフローテスト
  // ============================================================================

  test.describe('タスク15.1: 見積書作成から出力までの一連のフロー', () => {
    // --------------------------------------------------------------------------
    // テストデータセットアップ
    // --------------------------------------------------------------------------

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
        projectName = `E2E見積書テスト_${Date.now()}`;
        await page.getByLabel(/プロジェクト名/i).fill(projectName);

        // 現場住所を入力
        await page.getByLabel(/現場住所/i).fill('東京都渋谷区テスト1-2-3');

        // 営業担当者を確認・選択
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
       * テスト準備：協力業者の作成
       */
      test('準備2：テスト用協力業者を作成する', async ({ page }) => {
        expect(createdProjectId).toBeTruthy();

        await loginAsUser(page, 'REGULAR_USER');

        // 取引先作成画面に移動
        await page.goto('/trading-partners/new');
        await page.waitForLoadState('networkidle');

        // フォームが表示されるまで待機
        await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

        // 取引先情報を入力
        tradingPartnerName = `E2Eテスト協力業者_見積書_${Date.now()}`;
        await page.getByLabel('取引先名').fill(tradingPartnerName);
        await page
          .getByLabel('フリガナ', { exact: true })
          .fill('ミツモリショキョウリョクギョウシャ');
        await page.getByLabel('住所').fill('東京都新宿区テスト町1-1-1');

        // 協力業者チェックボックスをオン
        const subcontractorCheckbox = page.getByRole('checkbox', { name: /協力業者/i });
        await subcontractorCheckbox.check();
        await expect(subcontractorCheckbox).toBeChecked();

        // メールアドレスを入力
        await page.getByLabel('メールアドレス').fill('test-estimate@example.com');

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

        const responseData = await response.json();
        createdTradingPartnerId = responseData.id;

        expect(createdTradingPartnerId).toBeTruthy();
      });

      /**
       * テスト準備：内訳書の作成（APIで直接作成）
       */
      test('準備3：テスト用内訳書を作成する', async ({ page, request }) => {
        expect(createdProjectId).toBeTruthy();

        await loginAsUser(page, 'REGULAR_USER');

        // 数量表作成ページに直接移動
        await page.goto(`/projects/${createdProjectId}/quantity-tables/new`);
        await page.waitForLoadState('networkidle');

        // 数量表作成フォームを入力
        const quantityTableName = '見積書テスト用数量表';
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

        // 項目を作成
        for (let i = 0; i < 3; i++) {
          await request.post(`${baseUrl}/api/quantity-groups/${groupId}/items`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            data: {
              name: `テスト項目${i + 1}`,
              workType: '工種A',
              specification: '規格A',
              unit: '式',
              quantity: 10.0,
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
              name: '見積書テスト用内訳書',
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

    // --------------------------------------------------------------------------
    // 見積書新規作成テスト
    // --------------------------------------------------------------------------

    test.describe('見積書新規作成', () => {
      /**
       * @requirement estimate-creation/REQ-3.1
       * 見積書新規作成時に内訳書選択画面が表示される
       */
      test('REQ-3.1：見積書新規作成時に内訳書選択画面が表示される', async ({ page }) => {
        expect(createdProjectId).toBeTruthy();

        await loginAsUser(page, 'REGULAR_USER');

        // 見積書作成画面に移動
        await page.goto(`/projects/${createdProjectId}/estimates/new`);
        await page.waitForLoadState('networkidle');

        // 作成フォームが表示されることを確認
        await expect(page.getByText(/見積書作成/i).first()).toBeVisible({
          timeout: getTimeout(15000),
        });

        // 内訳書選択が表示されることを確認
        await expect(page.getByText(/内訳書を選択/i).first()).toBeVisible();
      });

      /**
       * @requirement estimate-creation/REQ-3.2
       * 内訳書を選択した場合、見積金額行に初期値が設定される
       */
      test('REQ-3.2：内訳書を選択して見積書を作成する', async ({ page }) => {
        expect(createdProjectId).toBeTruthy();
        expect(createdItemizedStatementId).toBeTruthy();

        await loginAsUser(page, 'REGULAR_USER');

        // 見積書作成画面に移動
        await page.goto(`/projects/${createdProjectId}/estimates/new`);
        await page.waitForLoadState('networkidle');

        // 見積書名を入力
        const estimateName = `内訳書参照見積書_${Date.now()}`;
        await page.getByLabel(/見積書名/i).fill(estimateName);

        // 内訳書を選択
        const itemizedStatementSelect = page.locator('select[aria-label="内訳書を選択"]');
        await itemizedStatementSelect.selectOption({ value: createdItemizedStatementId! });

        // 作成ボタンをクリック
        const createPromise = page.waitForResponse(
          (response) =>
            response.url().includes('/api') &&
            response.url().includes('/estimates') &&
            response.request().method() === 'POST',
          { timeout: getTimeout(30000) }
        );

        await page.getByRole('button', { name: /^作成$/i }).click();
        const response = await createPromise;
        expect(response.status()).toBe(201);

        const responseBody = await response.json();
        createdEstimateId = responseBody.id;

        // 見積書詳細画面に遷移することを確認
        await page.waitForURL(/\/estimates\/[0-9a-f-]+$/);

        // 詳細ページが表示されることを確認
        await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
          timeout: getTimeout(15000),
        });

        // 見積書名がヘッダーに表示されることを確認
        await expect(page.getByRole('heading', { level: 1, name: estimateName })).toBeVisible({
          timeout: getTimeout(5000),
        });

        expect(createdEstimateId).toBeTruthy();
      });

      /**
       * @requirement estimate-creation/REQ-3.3
       * 内訳書を選択せずに空の見積書を作成できる
       */
      test('REQ-3.3：内訳書を選択せずに空の見積書を作成する', async ({ page }) => {
        expect(createdProjectId).toBeTruthy();

        await loginAsUser(page, 'REGULAR_USER');

        // 見積書作成画面に移動
        await page.goto(`/projects/${createdProjectId}/estimates/new`);
        await page.waitForLoadState('networkidle');

        // 見積書名を入力
        const estimateName = `空の見積書_${Date.now()}`;
        await page.getByLabel(/見積書名/i).fill(estimateName);

        // 内訳書を選択しない（選択なしオプション）

        // 作成ボタンをクリック
        const createPromise = page.waitForResponse(
          (response) =>
            response.url().includes('/api') &&
            response.url().includes('/estimates') &&
            response.request().method() === 'POST',
          { timeout: getTimeout(30000) }
        );

        await page.getByRole('button', { name: /^作成$/i }).click();
        const response = await createPromise;
        expect(response.status()).toBe(201);

        const responseBody = await response.json();
        createdEstimateIdWithoutItemizedStatement = responseBody.id;

        // 見積書詳細画面に遷移することを確認
        await page.waitForURL(/\/estimates\/[0-9a-f-]+$/);

        // 詳細ページが表示されることを確認
        await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
          timeout: getTimeout(15000),
        });

        expect(createdEstimateIdWithoutItemizedStatement).toBeTruthy();
      });
    });

    // --------------------------------------------------------------------------
    // 見積項目の追加・編集・削除テスト
    // --------------------------------------------------------------------------

    test.describe('見積項目の操作', () => {
      /**
       * @requirement estimate-creation/REQ-12.1
       * 見積項目を追加すると3行1セットが作成される
       */
      test('REQ-12.1：見積項目を追加する（3行1セット）', async ({ page }) => {
        expect(createdEstimateIdWithoutItemizedStatement).toBeTruthy();

        await loginAsUser(page, 'REGULAR_USER');

        // 見積書詳細画面に移動
        await page.goto(`/estimates/${createdEstimateIdWithoutItemizedStatement}`);
        await page.waitForLoadState('networkidle');

        // 詳細ページが表示されることを確認
        await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
          timeout: getTimeout(15000),
        });

        // 常にインライン編集可能（REQ-27.1: 編集モード切替不要）

        // 項目追加ボタンをクリック（「子項目追加」ボタンと区別するためexact指定）
        const addButton = page.getByRole('button', { name: '+ 項目追加' });
        await expect(addButton).toBeVisible({ timeout: getTimeout(10000) });
        await addButton.click();

        // 3行1セット（見積・実行・業者）が表示されることを確認
        await expect(page.getByText(/見積/i).first()).toBeVisible({
          timeout: getTimeout(10000),
        });
      });

      /**
       * @requirement estimate-creation/REQ-1.3
       * 金額フィールドは単価×数量で自動計算される
       */
      test('REQ-1.3：金額が自動計算される', async ({ page }) => {
        expect(createdEstimateId).toBeTruthy();

        await loginAsUser(page, 'REGULAR_USER');

        // 見積書詳細画面に移動
        await page.goto(`/estimates/${createdEstimateId}`);
        await page.waitForLoadState('networkidle');

        // 詳細ページが表示されることを確認
        await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
          timeout: getTimeout(15000),
        });

        // 常にインライン編集可能（REQ-27.1: 編集モード切替不要）

        // 数量・単価を入力する行を1つに固定する。
        // 「画面のどこかに 5,000 がある」ではなく「入力した行の金額欄が 5,000 になる」を
        // 主張するため、入力欄と金額欄は同じ行（3行1セットの見積金額行）から引く
        const estimateLine = page
          .locator('[aria-label="見積項目テーブル"] [data-testid="line-type-ESTIMATE"]')
          .first();
        await expect(estimateLine).toBeVisible({ timeout: getTimeout(15000) });

        const quantityInput = estimateLine.locator('input[aria-label="数量"]');
        const unitPriceInput = estimateLine.locator('input[aria-label="単価"]');
        const amountField = estimateLine.locator('[data-testid="amount-field"]');

        // 入力欄が無ければ以降の入力・検算はどのみち成立しない。
        // かつてはここが `if (count > 0)` のガードで、欄が消えると何も検証せずに
        // 緑になった（実測ではガードは常に真で、条件そのものが不要だった）
        await expect(quantityInput).toHaveCount(1);
        await expect(unitPriceInput).toHaveCount(1);
        await expect(amountField).toHaveCount(1);

        await quantityInput.fill('5');
        await unitPriceInput.fill('1000');

        // フォーカスを外して計算をトリガー
        await unitPriceInput.blur();

        // 金額欄が単価×数量（1000×5）として自動計算される
        await expect(amountField).toHaveText('5,000', { timeout: getTimeout(10000) });
      });
    });

    // --------------------------------------------------------------------------
    // 階層構造の展開/折りたたみテスト
    // --------------------------------------------------------------------------

    test.describe('階層構造の表示', () => {
      /**
       * 深い階層のフィクスチャ（第1階層 → … → 第5階層）
       *
       * 2.5 は「階層の深さに上限を設けない」を要求する。要件 2.4 が例示する3階層
       * （建築工事 > 直接仮設工事 > 遣り方）を**超える**5階層を作り、すべてが
       * 画面に描かれることを確かめる。深さで打ち切る実装が入れば深い側から消える。
       */
      const DEEP_NAMES = [
        '階層深さ検証_第1階層',
        '階層深さ検証_第2階層',
        '階層深さ検証_第3階層',
        '階層深さ検証_第4階層',
        '階層深さ検証_第5階層',
      ] as const;

      /**
       * @requirement estimate-creation/REQ-2.5
       * @requirement estimate-creation/REQ-2.7
       * 上限のない深さの階層が表示され、展開/折りたたみで子孫の表示が切り替わる
       *
       * かつてこのテストは「展開/折りたたみボタンが1件以上あれば押す」という
       * `if (expandCount > 0)` のガードだけを持ち、最後は素の
       * `getByText(/見積項目/i)` で終わっていた。実測ではフィクスチャの見積書が
       * 平坦（内訳書の3項目がすべてルート）でボタンは**常に0件**であり、
       * 内側は一度も実行されないまま緑になっていた。加えてセレクタの
       * `aria-label*="折りたたみ"` は実際の `折りたたむ` と一致しない。
       * 前提（子を持つ項目）はテスト自身が作る。
       */
      test('REQ-2.5/REQ-2.7：深い階層が表示され展開/折りたたみで子孫の表示が切り替わる', async ({
        page,
      }) => {
        expect(createdEstimateIdWithoutItemizedStatement).toBeTruthy();

        await loginAsUser(page, 'REGULAR_USER');
        const token = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
        expect(token).toBeTruthy();

        // 5階層の入れ子を作る（最も深い項目から順に親へ包んでいく）
        const deepTree = [...DEEP_NAMES].reverse().reduce<SaveNodePayload[]>(
          (children, name) => [
            buildNewEstimateItemNode({
              name,
              unit: '式',
              quantity: 1,
              estimateUnitPrice: 1000,
              children,
            }),
          ],
          []
        );
        await saveEstimateDraft(
          page.request,
          token,
          createdEstimateIdWithoutItemizedStatement!,
          deepTree
        );

        // 保存した階層が実際に5段で返ってくることを確認してから画面を開く
        const tree = await getEstimateItemTree(
          page.request,
          token,
          createdEstimateIdWithoutItemizedStatement!
        );
        const itemIds = DEEP_NAMES.map((name) => {
          const found = findEstimateItemByName(tree, name);
          expect(found, `フィクスチャに ${name} が見つからない`).toBeTruthy();
          return found!.id;
        });

        await page.goto(`/estimates/${createdEstimateIdWithoutItemizedStatement}`);
        await page.waitForLoadState('networkidle');

        // 詳細ページが表示されることを確認
        await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
          timeout: getTimeout(15000),
        });

        // 折りたたみ操作はツリー表示のものなので、表示モードを明示的に確定させる（REQ-45.1）
        const treeModeRadio = page.getByTestId('view-mode-tree');
        await expect(treeModeRadio).toBeVisible({ timeout: getTimeout(10000) });
        await treeModeRadio.click();
        await expect(treeModeRadio).toHaveAttribute('aria-checked', 'true', {
          timeout: getTimeout(10000),
        });

        const row = (itemId: string): Locator => page.getByTestId(`estimate-item-${itemId}`);

        // REQ-2.5: 5階層すべてが描かれる（深さで打ち切られていない）
        for (const itemId of itemIds) {
          await expect(row(itemId)).toBeVisible({ timeout: getTimeout(10000) });
        }

        // REQ-2.7: 第2階層を折りたたむと、その子孫（第3〜第5階層）が画面から消える
        const collapseButton = row(itemIds[1]!).getByRole('button', { name: '折りたたむ' });
        await expect(collapseButton).toHaveAttribute('aria-expanded', 'true');
        await collapseButton.click();

        for (const itemId of itemIds.slice(2)) {
          await expect(row(itemId)).toHaveCount(0, { timeout: getTimeout(10000) });
        }
        // 折りたたんだ項目自身と祖先は残る
        await expect(row(itemIds[0]!)).toBeVisible();
        await expect(row(itemIds[1]!)).toBeVisible();

        // REQ-2.7: 展開すると子孫が戻る
        const expandButton = row(itemIds[1]!).getByRole('button', { name: '展開する' });
        await expect(expandButton).toHaveAttribute('aria-expanded', 'false');
        await expandButton.click();

        for (const itemId of itemIds) {
          await expect(row(itemId)).toBeVisible({ timeout: getTimeout(10000) });
        }
      });
    });

    // --------------------------------------------------------------------------
    // PDF/Excel出力テスト
    // --------------------------------------------------------------------------

    test.describe('見積書出力', () => {
      /**
       * @requirement estimate-creation/REQ-10.1
       * PDF出力を実行できる
       */
      test('REQ-10.1：PDF出力ダイアログの表示と実行', async ({ page }) => {
        expect(createdEstimateId).toBeTruthy();

        await loginAsUser(page, 'REGULAR_USER');

        // 見積書詳細画面に移動
        await page.goto(`/estimates/${createdEstimateId}`);
        await page.waitForLoadState('networkidle');

        // 詳細ページが表示されることを確認
        await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
          timeout: getTimeout(15000),
        });

        // 出力ボタンをクリック
        await page.getByRole('button', { name: /^出力$/i }).click();

        // 出力ダイアログが表示されることを確認
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });
        await expect(page.getByText(/出力形式を選択/i)).toBeVisible({ timeout: getTimeout(5000) });

        // PDFオプションを選択（input[value="pdf"]を直接クリック）
        const pdfOption = page.locator('input[type="radio"][value="pdf"]');
        await pdfOption.click();

        // ダウンロードの待機設定
        const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(30000) });

        // 出力ボタンをクリック（ダイアログ内の「出力」ボタン）
        await page
          .getByRole('dialog')
          .getByRole('button', { name: /^出力$/i })
          .click();

        // ダウンロードが開始されることを確認
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
      });

      /**
       * @requirement estimate-creation/REQ-10.2
       * Excel出力を実行できる
       */
      test('REQ-10.2：Excel出力ダイアログの表示と実行', async ({ page }) => {
        expect(createdEstimateId).toBeTruthy();

        await loginAsUser(page, 'REGULAR_USER');

        // 見積書詳細画面に移動
        await page.goto(`/estimates/${createdEstimateId}`);
        await page.waitForLoadState('networkidle');

        // 詳細ページが表示されることを確認
        await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
          timeout: getTimeout(15000),
        });

        // 出力ボタンをクリック
        await page.getByRole('button', { name: /^出力$/i }).click();

        // 出力ダイアログが表示されることを確認
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });
        await expect(page.getByText(/出力形式を選択/i)).toBeVisible({ timeout: getTimeout(5000) });

        // Excelオプションを選択（input[value="xlsx"]を直接クリック）
        const excelOption = page.locator('input[type="radio"][value="xlsx"]');
        await excelOption.click();

        // ダウンロードの待機設定
        const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(30000) });

        // 出力ボタンをクリック（ダイアログ内の「出力」ボタン）
        await page
          .getByRole('dialog')
          .getByRole('button', { name: /^出力$/i })
          .click();

        // ダウンロードが開始されることを確認
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
      });
    });
  });

  // ============================================================================
  // タスク15.2: NET金額計算・案分のE2Eテスト
  // ============================================================================

  test.describe('タスク15.2: NET金額計算・案分', () => {
    /**
     * テストデータ準備：見積依頼と受領見積書を作成
     *
     * かつてこの準備は `if (status === 201)` で作成の成否を分岐し、末尾も
     * 「両方のIDが取れたときだけアサートする」形だった。実測では見積依頼の作成が
     * **常に 400**（必須の `name` を送っておらず、`requestDate` は受け付けない）で、
     * 受領見積書の作成に至っては URL が実在しない（正しくは `/quotations`）ため
     * 内側は一度も実行されず、**準備が何ひとつ作れていないまま緑**になっていた。
     * 作成できなければ失敗するよう、各段の応答を無条件に検証する。
     */
    test('準備：見積依頼と受領見積書を作成する', async ({ request }) => {
      expect(createdProjectId).toBeTruthy();
      expect(createdTradingPartnerId).toBeTruthy();
      expect(accessToken).toBeTruthy();

      const baseUrl = API_BASE_URL;

      // 見積依頼を作成
      const estimateRequestResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimate-requests`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `E2E見積依頼_${Date.now()}`,
            tradingPartnerId: createdTradingPartnerId,
          },
        }
      );
      expect(estimateRequestResponse.status()).toBe(201);
      createdEstimateRequestId = (await estimateRequestResponse.json()).id;
      expect(createdEstimateRequestId).toBeTruthy();

      // 受領見積書を作成（明細は multipart の `lineItems` にJSON文字列で載せる）
      const lineItems = JSON.stringify([
        {
          name: 'テスト項目1',
          sortOrder: 0,
          specification: '規格A',
          unit: '式',
          quantity: 1,
          unitPrice: 100000,
          amount: 100000,
        },
        {
          name: 'テスト項目2',
          sortOrder: 1,
          specification: '規格B',
          unit: '式',
          quantity: 2,
          unitPrice: 50000,
          amount: 100000,
        },
        {
          name: '諸経費',
          sortOrder: 2,
          specification: '',
          unit: '式',
          quantity: 1,
          unitPrice: 20000,
          amount: 20000,
        },
      ]);

      createdReceivedQuotationName = `E2E受領見積書_${Date.now()}`;
      const receivedQuotationResponse = await request.post(
        `${baseUrl}/api/estimate-requests/${createdEstimateRequestId}/quotations`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          multipart: {
            name: createdReceivedQuotationName,
            submittedAt: new Date().toISOString(),
            lineItems,
          },
        }
      );
      expect(receivedQuotationResponse.status()).toBe(201);
      createdReceivedQuotationId = (await receivedQuotationResponse.json()).id;
      expect(createdReceivedQuotationId).toBeTruthy();
    });

    /**
     * @requirement estimate-creation/REQ-5.1
     * @requirement estimate-creation/REQ-5.2
     * @requirement estimate-creation/REQ-5.3
     * NET金額案分ダイアログへのアクセスと表示
     */
    test('REQ-5.1-5.3：NET金額計算パネルが表示される', async ({ page }) => {
      // 見積書IDが存在しない場合は前提テストが失敗
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // NET金額案分の機能を提供する「業者金額を実行金額に転記」ボタンが存在することを確認
      const netButton = page.getByRole('button', { name: '業者金額を実行金額に転記' });
      await expect(netButton).toBeVisible({ timeout: getTimeout(10000) });

      // ボタンをクリックしてNET金額案分ダイアログが開くことを確認
      await netButton.click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByText(/NET金額案分/i)).toBeVisible({ timeout: getTimeout(5000) });

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });

    // REQ-5.4 / REQ-5.5（案分計算とその結果の実行金額行への表示）の検証は、
    // `estimate-transfer-calculation-save-e2e.spec.ts` の
    // 「未保存の新規行の対象化とプレビューの一致」へ移した（Task 57.4）。
    //
    // かつてここにあった「REQ-5.4-5.5：NET金額入力とプレビュー」は、業者選択肢の件数を
    // `if (vendorOptions > 1)` で見てから案分に触れる作りだった。この describe の serial 順では
    // 業者金額行を作る「タスク15.4: 受領見積書転記」が後ろにあるため条件は常に偽で
    // （実測: option は空選択肢の1件のみ）、NET金額入力もプレビュー確認も一度も実行されない
    // まま緑になっていた。前提が欠けたときに自動的に無効化されるテストは置けないため削除し、
    // 業者金額行を必ず用意したうえで案分後単価・案分後金額を無条件に検証する側へ帰属を移した。
  });

  // ============================================================================
  // タスク15.3: 諸経費自動計算のE2Eテスト
  // ============================================================================

  test.describe('タスク15.3: 諸経費自動計算', () => {
    /** 諸経費計算ダイアログを開き、共通仮設費の計算パラメータを入力する */
    const openOverheadDialog = async (page: Page): Promise<Locator> => {
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      await page.getByRole('button', { name: '諸経費を計算して追加' }).click();
      const dialog = page.getByTestId('overhead-cost-dialog');
      await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
      return dialog;
    };

    /** 追加された未保存の諸経費行（保存前なのでサーバーIDを持たず行キーは `tmp-`） */
    const addedOverheadEstimateLine = (page: Page): Locator =>
      page
        .locator('[aria-label="見積項目テーブル"] [data-estimate-row-key^="tmp-"]')
        .getByTestId('line-type-ESTIMATE');

    /**
     * @requirement estimate-creation/REQ-7.1
     * @requirement estimate-creation/REQ-7.2
     * @requirement estimate-creation/REQ-7.3
     * @requirement estimate-creation/REQ-7.4
     * 共通仮設費の自動計算とプリセット値での行追加
     *
     * かつてこのテストは「諸経費のパネルかボタンのどちらかが見えていれば
     * `expect(panelVisible || buttonVisible).toBeTruthy()`」という、条件が真のときだけ
     * 入るブロックの中で同じ条件を主張する**恒真アサーション**だった
     * （実測: `panelVisible=false` / `buttonVisible=true` で、パネルの testid は
     * 本番コードに存在すらしない）。7.1〜7.4 の何ひとつ検証していないため、
     * 観測可能な振る舞い（パラメータ入力欄・自動計算結果・プリセット値・手入力）へ
     * 置き換える。
     */
    test('REQ-7.1-7.4：共通仮設費を自動計算しプリセット値の行として追加する', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      const dialog = await openOverheadDialog(page);

      // REQ-7.4: 自動計算に必要なパラメータ（直接工事費・工期）の入力欄が提供される
      await dialog.getByLabel('諸経費種別').selectOption('COMMON_TEMPORARY');
      await expect(dialog.getByLabel('直接工事費')).toBeVisible();
      await expect(dialog.getByLabel('工期')).toBeVisible();
      await dialog.getByLabel('直接工事費').fill('100000');
      await dialog.getByLabel('工期').fill('12');

      // REQ-7.3: 共通仮設費の計算式（国土交通省の公共建築工事共通費積算基準）で単価を算出する
      const calcPromise = page.waitForResponse(
        (r) => r.url().includes('/calculate-overhead') && r.request().method() === 'POST',
        { timeout: getTimeout(15000) }
      );
      await dialog.getByRole('button', { name: '計算', exact: true }).click();
      const calcResponse = await calcPromise;
      expect(calcResponse.status()).toBe(200);
      const calculated = (await calcResponse.json()) as {
        rate: string;
        amount: string;
        formula: string;
      };
      expect(Number(calculated.rate)).toBeGreaterThan(0);
      expect(Number(calculated.amount)).toBeGreaterThan(0);

      // 算定率と計算金額が画面に出て、単価として使われる欄へ自動計算結果が入る
      await expect(dialog.getByTestId('calculated-rate')).toHaveText(`${calculated.rate}%`);
      await expect(dialog.getByLabel('計算金額')).toHaveValue(calculated.amount);

      // REQ-7.1: 追加された行は名称=共通仮設費・規格=空白・単位=式・数量=1のプリセット値を持つ
      await dialog.getByRole('button', { name: '項目追加' }).click();
      await expect(dialog).toBeHidden();

      const addedLine = addedOverheadEstimateLine(page);
      await expect(addedLine).toHaveCount(1, { timeout: getTimeout(10000) });
      await expect(addedLine.getByLabel('名称')).toHaveValue('共通仮設費');
      await expect(addedLine.getByLabel('規格')).toHaveValue('');
      await expect(addedLine.getByLabel('単位')).toHaveValue('式');
      await expect(addedLine.getByLabel('数量')).toHaveValue('1');
      await expect(addedLine.getByLabel('単価')).toHaveValue(calculated.amount);

      // REQ-7.2: 共通仮設費の単価は手入力で設定できる（金額も追随して再計算される）
      const unitPriceInput = addedLine.getByLabel('単価');
      await unitPriceInput.fill('123456');
      await unitPriceInput.blur();
      await expect(unitPriceInput).toHaveValue('123456');
      await expect(addedLine.locator('[data-testid="amount-field"]')).toHaveText('123,456');
    });

    /**
     * @requirement estimate-creation/REQ-7.5
     * @requirement estimate-creation/REQ-7.6
     * 計算中の表示と、自動計算結果の手入力での上書き
     *
     * かつてこのテストは「単価の入力欄が1件以上あれば最初の1件に 50000 を入れる」だけで、
     * 諸経費にも自動計算にも触れていなかった（実測ではガードは常に真＝条件は不要だったが、
     * 主張していたのは無関係な見積項目行の入力欄の値）。7.5 は「自動計算結果を手入力で
     * 上書きできること」、7.6 は「計算中であることを表示すること」を要求するので、
     * 実際に計算を走らせ、その応答を保留させた状態で計算中の表示を観測する。
     */
    test('REQ-7.5-7.6：計算中を表示し自動計算結果を手入力で上書きできる', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 計算の応答を保留できるようにする。保留を解くまで「計算中」の表示が続くため、
      // 競合に依存せず REQ-7.6 の表示を観測できる
      let releaseCalculation: () => void = () => {};
      const calculationHeld = new Promise<void>((resolve) => {
        releaseCalculation = resolve;
      });
      await page.route('**/calculate-overhead', async (route) => {
        await calculationHeld;
        await route.continue();
      });

      const dialog = await openOverheadDialog(page);
      await dialog.getByLabel('諸経費種別').selectOption('COMMON_TEMPORARY');
      await dialog.getByLabel('直接工事費').fill('100000');
      await dialog.getByLabel('工期').fill('12');

      const calcPromise = page.waitForResponse(
        (r) => r.url().includes('/calculate-overhead') && r.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );
      await dialog.getByRole('button', { name: '計算', exact: true }).click();

      // REQ-7.6: 計算が終わるまで「計算中」であることが表示され、再実行もできない
      const calculatingButton = dialog.getByRole('button', { name: '計算中...' });
      await expect(calculatingButton).toBeVisible({ timeout: getTimeout(10000) });
      await expect(calculatingButton).toBeDisabled();

      releaseCalculation();
      const calcResponse = await calcPromise;
      expect(calcResponse.status()).toBe(200);
      const calculated = (await calcResponse.json()) as { rate: string; amount: string };

      // 計算が終われば「計算中」の表示は消える
      await expect(calculatingButton).toHaveCount(0, { timeout: getTimeout(10000) });
      await expect(dialog.getByRole('button', { name: '計算', exact: true })).toBeEnabled();

      // 自動計算結果が単価として入っている
      const calculatedAmountInput = dialog.getByLabel('計算金額');
      await expect(calculatedAmountInput).toHaveValue(calculated.amount);

      // REQ-7.5: 自動計算結果を手入力で上書きできる
      const manualUnitPrice = String(Number(calculated.amount) + 77777);
      expect(manualUnitPrice).not.toBe(calculated.amount);
      await calculatedAmountInput.fill(manualUnitPrice);
      await expect(calculatedAmountInput).toHaveValue(manualUnitPrice);

      // 追加される行の単価は自動計算値ではなく手入力値になる
      await dialog.getByRole('button', { name: '項目追加' }).click();
      await expect(dialog).toBeHidden();

      const addedLine = addedOverheadEstimateLine(page);
      await expect(addedLine).toHaveCount(1, { timeout: getTimeout(10000) });
      await expect(addedLine.getByLabel('単価')).toHaveValue(manualUnitPrice);
    });
  });

  // ============================================================================
  // タスク15.4: 受領見積書転記のE2Eテスト
  // ============================================================================

  test.describe('タスク15.4: 受領見積書転記', () => {
    /**
     * @requirement estimate-creation/REQ-4.1
     * @requirement estimate-creation/REQ-4.2
     * 転記ダイアログの表示
     */
    test('REQ-4.1-4.2：転記ダイアログが表示される', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 受領見積書転記ボタンをクリック
      const transferButton = page.getByRole('button', { name: '受領見積書を業者金額に転記' });
      await expect(transferButton).toBeVisible({ timeout: getTimeout(10000) });
      await transferButton.click();

      // 転記ダイアログが表示されることを確認
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });

    /**
     * @requirement estimate-creation/REQ-4.3
     * @requirement estimate-creation/REQ-4.4
     * 転記対象行の選択
     */
    test('REQ-4.3-4.4：転記対象行の選択と転記先の指定', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 受領見積書転記ボタンをクリック
      await page.getByRole('button', { name: '受領見積書を業者金額に転記' }).click();

      // 転記ダイアログが表示されることを確認
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 受領見積書選択ドロップダウンの存在を確認
      const quotationSelect = page.locator('#quotation-select');
      await expect(quotationSelect).toBeVisible({ timeout: getTimeout(10000) });

      // 準備で作成した受領見積書が転記元として選べる。
      // 「選択してください」だけでも通る件数の下限ではなく、準備で作った協力業者の
      // 受領見積書（選択肢のラベルは `取引先名 - 合計金額`）を名指しすることで、
      // 準備が実際に作れていないと失敗する
      expect(tradingPartnerName).toBeTruthy();
      expect(createdReceivedQuotationId).toBeTruthy();
      await expect(quotationSelect.locator('option', { hasText: tradingPartnerName })).toHaveCount(
        1,
        { timeout: getTimeout(10000) }
      );

      // 転記先選択ドロップダウンの存在を確認
      const targetSelect = page.locator('#target-select');
      await expect(targetSelect).toBeVisible({ timeout: getTimeout(5000) });

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });
  });

  // ============================================================================
  // タスク15.5: 利益率適用のE2Eテスト
  // ============================================================================

  test.describe('タスク15.5: 利益率適用', () => {
    /**
     * @requirement estimate-creation/REQ-6.1
     * @requirement estimate-creation/REQ-6.2
     * 利益率適用ダイアログへのアクセスと表示
     */
    test('REQ-6.1-6.2：利益率入力パネルが表示される', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 利益率適用の機能を提供する「実行金額を見積金額に転記」ボタンが存在することを確認
      const profitButton = page.getByRole('button', { name: '実行金額を見積金額に転記' });
      await expect(profitButton).toBeVisible({ timeout: getTimeout(10000) });

      // ボタンをクリックして利益率適用ダイアログが開くことを確認
      await profitButton.click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByText(/利益率適用/i)).toBeVisible({ timeout: getTimeout(5000) });

      // 利益率入力フィールドが表示されることを確認
      const profitRateInput = page.locator('#profit-rate');
      await expect(profitRateInput).toBeVisible({ timeout: getTimeout(5000) });

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });

    /**
     * @requirement estimate-creation/REQ-6.3
     * @requirement estimate-creation/REQ-6.4
     * 上書きオプションの選択
     */
    test('REQ-6.3-6.4：上書きオプションの選択', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 利益率適用ダイアログを開く
      await page.getByRole('button', { name: '実行金額を見積金額に転記' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 上書きオプション（ラジオボタン）が3つ存在することを確認
      const overwriteOptions = page.locator('input[type="radio"][name="overwrite"]');
      const optionsCount = await overwriteOptions.count();
      expect(optionsCount).toBe(3);

      // 各オプションのテキストを確認
      await expect(page.getByText(/すべて上書き/i)).toBeVisible();
      await expect(page.getByText(/空の場合のみ上書き/i)).toBeVisible();
      await expect(page.getByText(/単価のみ上書き/i)).toBeVisible();

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });

    /**
     * @requirement estimate-creation/REQ-6.5
     * @requirement estimate-creation/REQ-6.6
     * 利益率の適用とプレビュー
     */
    test('REQ-6.5-6.6：利益率の適用とプレビュー', async ({ page }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      // 見積書詳細画面に移動
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      // 詳細ページが表示されることを確認
      await expect(page.locator('[data-testid="estimate-detail-page"]')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 利益率適用ダイアログを開く
      await page.getByRole('button', { name: '実行金額を見積金額に転記' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: getTimeout(10000) });

      // 利益率入力フィールドに値を入力
      const profitRateInput = page.locator('#profit-rate');
      await expect(profitRateInput).toBeVisible({ timeout: getTimeout(5000) });
      await profitRateInput.fill('10');

      // 適用ボタンが表示されることを確認
      const applyButton = page.getByRole('dialog').getByRole('button', { name: /適用/i });
      await expect(applyButton).toBeVisible();

      // ダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test.describe('クリーンアップ', () => {
    /**
     * テストで作成したデータを削除
     */
    test('テストデータの削除', async ({ request }) => {
      const baseUrl = API_BASE_URL;

      // アクセストークンが無い場合は再取得
      if (!accessToken) {
        const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
          data: {
            email: 'user@example.com',
            password: 'Password123!',
          },
        });
        const loginBody = await loginResponse.json();
        accessToken = loginBody.accessToken;
      }

      // 見積書を削除
      if (createdEstimateId) {
        await request.delete(`${baseUrl}/api/estimates/${createdEstimateId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      if (createdEstimateIdWithoutItemizedStatement) {
        await request.delete(
          `${baseUrl}/api/estimates/${createdEstimateIdWithoutItemizedStatement}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
      }

      // プロジェクトを削除（カスケードで関連データも削除される）
      if (createdProjectId) {
        await request.delete(`${baseUrl}/api/projects/${createdProjectId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      // 取引先を削除
      if (createdTradingPartnerId) {
        await request.delete(`${baseUrl}/api/trading-partners/${createdTradingPartnerId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      // テストデータリセット
      createdProjectId = null;
      createdTradingPartnerId = null;
      createdItemizedStatementId = null;
      createdEstimateId = null;
      createdEstimateIdWithoutItemizedStatement = null;
      createdEstimateRequestId = null;
      createdReceivedQuotationId = null;
    });
  });
});
