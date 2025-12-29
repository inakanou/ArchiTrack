/**
 * @fileoverview ステータス遷移 E2Eテスト
 *
 * Task 16.3: ステータス遷移 E2Eテスト
 *
 * Requirements:
 * - 10.8: ユーザーが許可されたステータス遷移を実行すると新しいステータスをデータベースに保存
 * - 10.9: 許可されていないステータス遷移を実行しようとするとエラーメッセージを表示し、遷移を拒否
 * - 10.12: 各ステータスを視覚的に区別できる色分けで表示
 * - 10.14: 差し戻し遷移を実行すると差し戻し理由の入力を必須とする
 * - 10.16: ステータス変更UIで順方向遷移と差し戻し遷移を視覚的に区別して表示
 *
 * ステータス遷移フロー:
 * - 順方向遷移: 準備中 -> 調査中 -> 見積中 -> 決裁待ち -> 契約中 -> 工事中 -> 引渡中 -> 請求中 -> 入金待ち -> 完了
 * - 差し戻し遷移: 調査中 -> 準備中、見積中 -> 調査中、etc.
 * - 終端遷移: 中止、失注への遷移
 *
 * 遷移種別スタイル:
 * - forward: 緑色 (green)、arrow-right アイコン
 * - backward: オレンジ色 (orange)、arrow-left アイコン
 * - terminate: 赤色 (red)、x-circle アイコン
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../helpers/auth-actions';
import { getTimeout } from '../helpers/wait-helpers';

/**
 * テスト用プロジェクトを作成する共通関数
 */
async function createTestProject(page: Page): Promise<{ id: string; name: string }> {
  // 一覧ページに移動
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  // 新規作成ボタンをクリック
  const createButton = page.getByRole('button', { name: /新規作成/i });
  await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
  await createButton.click();
  await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

  // フォームが表示されるまで待機
  await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

  // 営業担当者のセレクトボックスにオプションが読み込まれるまでリトライ
  const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
  await expect(salesPersonSelect).toBeVisible({ timeout: getTimeout(10000) });

  // ユーザー一覧の読み込み完了を待機
  // 認証状態の伝播に時間がかかる場合があるため、リトライ処理を追加
  let optionsLoaded = false;
  for (let retry = 0; retry < 3 && !optionsLoaded; retry++) {
    // 読み込み中の表示が消えるまで待機
    await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    // オプション数を確認
    const options = await salesPersonSelect.locator('option').all();
    if (options.length > 1) {
      optionsLoaded = true;
      break;
    }

    // エラーが表示されている場合はリロードして再試行
    const hasError = await page
      .getByText(/ユーザー一覧の取得に失敗しました/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (hasError && retry < 2) {
      await page.reload();
      await page.waitForLoadState('networkidle');
    }
  }

  if (!optionsLoaded) {
    throw new Error('営業担当者のユーザー一覧を読み込めませんでした');
  }

  const projectName = `ステータス遷移テスト_${Date.now()}`;
  await page.getByLabel(/プロジェクト名/i).fill(projectName);
  // 取引先は任意フィールドのため未選択のまま進める

  // 営業担当者を確認・選択
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
      response.url().includes('/api/projects') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
    { timeout: getTimeout(30000) }
  );

  await page.getByRole('button', { name: /^作成$/i }).click();
  await createPromise;

  // URLからプロジェクトIDを取得
  await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
  const url = page.url();
  const match = url.match(/\/projects\/([0-9a-f-]+)$/);
  const projectId = match?.[1] ?? null;

  if (!projectId) {
    throw new Error('プロジェクトIDを取得できませんでした');
  }

  return { id: projectId, name: projectName };
}

/**
 * 順方向遷移を実行するヘルパー関数
 */
async function executeForwardTransition(page: Page): Promise<void> {
  const forwardButton = page.locator('button[data-transition-type="forward"]').first();
  await expect(forwardButton).toBeVisible({ timeout: getTimeout(10000) });

  const transitionPromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/projects/') &&
      response.url().includes('/status') &&
      response.request().method() === 'PATCH',
    { timeout: getTimeout(30000) }
  );

  await forwardButton.click();
  await transitionPromise;
}

/**
 * ステータス遷移 E2Eテスト
 */
test.describe('ステータス遷移', () => {
  /**
   * 順方向遷移フローのテスト
   *
   * REQ-10.8: ユーザーが許可されたステータス遷移を実行すると新しいステータスをデータベースに保存
   * REQ-10.16: ステータス変更UIで順方向遷移と差し戻し遷移を視覚的に区別して表示
   */
  test.describe('順方向遷移フロー', () => {
    test('順方向遷移ボタン -> 遷移選択 -> ステータス更新が正常に行われる', async ({ page }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成（初期ステータス: PREPARING）
      await createTestProject(page);

      // プロジェクト詳細ページで待機
      await page.waitForLoadState('networkidle');

      // 現在のステータスが「準備中」であることを確認
      const currentStatusBadge = page.getByTestId('current-status-badge');
      await expect(currentStatusBadge).toBeVisible({ timeout: getTimeout(10000) });
      await expect(currentStatusBadge).toHaveText('準備中');

      // 順方向遷移ボタン（「調査中」への遷移）が表示されることを確認
      const forwardButton = page.locator('button[data-transition-type="forward"]').first();
      await expect(forwardButton).toBeVisible({ timeout: getTimeout(10000) });

      // ボタンに arrow-right アイコンがあることを確認
      const forwardIcon = forwardButton.locator('[data-testid="transition-icon-forward"]');
      await expect(forwardIcon).toBeVisible();

      // APIレスポンスを待機しながら遷移ボタンをクリック
      const transitionPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects/') &&
          response.url().includes('/status') &&
          response.request().method() === 'PATCH',
        { timeout: getTimeout(30000) }
      );

      await forwardButton.click();

      // APIレスポンスを待機
      const response = await transitionPromise;
      expect(response.status()).toBe(200);

      // ステータスが「調査中」に更新されたことを確認
      await expect(currentStatusBadge).toHaveText('調査中', { timeout: getTimeout(10000) });

      // 成功メッセージ（トースト）が表示されることを確認
      await expect(page.getByText(/ステータスを.+に変更しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    test('順方向遷移ボタンは緑色で表示される', async ({ page }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成
      await createTestProject(page);
      await page.waitForLoadState('networkidle');

      // 順方向遷移ボタンのスタイルを確認
      const forwardButton = page.locator('button[data-transition-type="forward"]').first();
      await expect(forwardButton).toBeVisible({ timeout: getTimeout(10000) });

      // 緑色（green系）のスタイルが適用されていることを確認
      // backgroundColor: #f0fdf4, color: #16a34a（緑系）
      const buttonStyles = await forwardButton.evaluate((el) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - window is available in browser context
        const style = window.getComputedStyle(el);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
        };
      });

      // 緑系の色が使われていることを確認（RGB値で検証）
      // #f0fdf4 -> rgb(240, 253, 244)
      // #16a34a -> rgb(22, 163, 74)
      expect(buttonStyles.backgroundColor).toContain('240'); // 薄い緑の背景
      expect(buttonStyles.color).toContain('22'); // 緑のテキスト
    });
  });

  /**
   * 差し戻し遷移フローのテスト
   *
   * REQ-10.4: 差し戻し遷移を許可する
   * REQ-10.14: 差し戻し遷移を実行すると差し戻し理由の入力を必須とする
   * REQ-10.16: ステータス変更UIで順方向遷移と差し戻し遷移を視覚的に区別して表示
   */
  test.describe('差し戻し遷移フロー', () => {
    /**
     * @requirement project-management/REQ-10.4
     * @requirement project-management/REQ-10.14
     */
    test('差し戻しボタン -> 理由入力ダイアログ -> 理由入力 -> 確認でステータスが差し戻される (project-management/REQ-10.4, REQ-10.14)', async ({
      page,
    }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成し、順方向遷移を実行して差し戻し可能な状態にする
      await createTestProject(page);
      await page.waitForLoadState('networkidle');

      // 順方向遷移を実行（準備中 -> 調査中）
      await executeForwardTransition(page);

      // 現在のステータスを確認（調査中であること）
      const currentStatusBadge = page.getByTestId('current-status-badge');
      await expect(currentStatusBadge).toHaveText('調査中', { timeout: getTimeout(10000) });

      // 差し戻しボタン（「準備中」への遷移）を探す
      const backwardButton = page.locator('button[data-transition-type="backward"]').first();
      await expect(backwardButton).toBeVisible({ timeout: getTimeout(10000) });

      // ボタンに arrow-left アイコンがあることを確認
      const backwardIcon = backwardButton.locator('[data-testid="transition-icon-backward"]');
      await expect(backwardIcon).toBeVisible();

      // 差し戻しボタンをクリック
      await backwardButton.click();

      // 差し戻し理由入力ダイアログが表示されることを確認
      await expect(page.getByRole('heading', { name: /差し戻し理由の入力/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 理由入力欄が表示されることを確認
      // Note: getByRole('textbox') を使用して、ダイアログ自体ではなくtextareaを特定する
      const reasonTextarea = page.getByRole('textbox', { name: /差し戻し理由/i });
      await expect(reasonTextarea).toBeVisible();

      // 理由を入力せずに「差し戻す」ボタンをクリック
      await page.getByRole('button', { name: /差し戻す/i }).click();

      // エラーメッセージが表示されることを確認
      await expect(page.getByText(/差し戻し理由は必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 理由を入力
      const backwardReason = 'テスト用の差し戻し理由：追加調査が必要なため';
      await reasonTextarea.fill(backwardReason);

      // APIレスポンスを待機しながら「差し戻す」ボタンをクリック
      const transitionPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects/') &&
          response.url().includes('/status') &&
          response.request().method() === 'PATCH',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /差し戻す/i }).click();

      // APIレスポンスを待機
      const response = await transitionPromise;
      expect(response.status()).toBe(200);

      // ダイアログが閉じることを確認
      await expect(page.getByRole('heading', { name: /差し戻し理由の入力/i })).not.toBeVisible({
        timeout: getTimeout(10000),
      });

      // ステータスが「準備中」に更新されたことを確認
      await expect(currentStatusBadge).toHaveText('準備中', { timeout: getTimeout(10000) });

      // 成功メッセージ（トースト）が表示されることを確認
      // 差し戻しの場合は「準備中」への変更メッセージを確認
      await expect(page.getByText(/ステータスを「準備中」に変更しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    test('差し戻し理由入力ダイアログでキャンセルするとダイアログが閉じる', async ({ page }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成し、順方向遷移を実行
      await createTestProject(page);
      await page.waitForLoadState('networkidle');

      // 順方向遷移を実行（準備中 -> 調査中）
      await executeForwardTransition(page);

      // ステータスが「調査中」に更新されたことを確認
      const currentStatusBadge = page.getByTestId('current-status-badge');
      await expect(currentStatusBadge).toHaveText('調査中', { timeout: getTimeout(10000) });

      // 差し戻しボタンをクリック
      const backwardButton = page.locator('button[data-transition-type="backward"]').first();
      await expect(backwardButton).toBeVisible({ timeout: getTimeout(10000) });
      await backwardButton.click();

      // ダイアログが表示されることを確認
      await expect(page.getByRole('heading', { name: /差し戻し理由の入力/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 理由を入力（保存しない）
      // Note: getByRole('textbox') を使用して、ダイアログ自体ではなくtextareaを特定する
      const reasonTextarea = page.getByRole('textbox', { name: /差し戻し理由/i });
      await reasonTextarea.fill('キャンセルされる理由');

      // キャンセルボタンをクリック
      await page.getByRole('button', { name: /キャンセル/i }).click();

      // ダイアログが閉じることを確認
      await expect(page.getByRole('heading', { name: /差し戻し理由の入力/i })).not.toBeVisible({
        timeout: getTimeout(5000),
      });

      // ステータスが変更されていないことを確認（調査中のまま）
      await expect(currentStatusBadge).toHaveText('調査中');
    });

    test('差し戻しボタンはオレンジ色で表示される', async ({ page }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // テスト用プロジェクトを作成し、順方向遷移を実行して差し戻し可能な状態にする
      await createTestProject(page);
      await page.waitForLoadState('networkidle');

      // 順方向遷移を実行（準備中 -> 調査中）
      await executeForwardTransition(page);

      // 差し戻しボタンのスタイルを確認
      const backwardButton = page.locator('button[data-transition-type="backward"]').first();
      await expect(backwardButton).toBeVisible({ timeout: getTimeout(10000) });

      // オレンジ色（orange系）のスタイルが適用されていることを確認
      // backgroundColor: #fff7ed, color: #ea580c（オレンジ系）
      const buttonStyles = await backwardButton.evaluate((el) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - window is available in browser context
        const style = window.getComputedStyle(el);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
        };
      });

      // オレンジ系の色が使われていることを確認（RGB値で検証）
      // #fff7ed -> rgb(255, 247, 237) (背景)
      // #c2410c -> rgb(194, 65, 12) (テキスト - Tailwind orange-700)
      expect(buttonStyles.backgroundColor).toContain('255'); // 薄いオレンジの背景
      expect(buttonStyles.color).toContain('194'); // オレンジのテキスト
    });
  });

  /**
   * 終端遷移フローのテスト
   *
   * REQ-10.8: ユーザーが許可されたステータス遷移を実行すると新しいステータスをデータベースに保存
   */
  test.describe('終端遷移フロー', () => {
    test('終端遷移ボタン（中止）をクリックするとステータスが終端状態に遷移する', async ({
      page,
    }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // 新しいプロジェクトを作成
      await createTestProject(page);
      await page.waitForLoadState('networkidle');

      // 現在のステータスが「準備中」であることを確認
      const currentStatusBadge = page.getByTestId('current-status-badge');
      await expect(currentStatusBadge).toHaveText('準備中', { timeout: getTimeout(10000) });

      // 終端遷移ボタン（「中止」への遷移）を探す
      const terminateButton = page.locator('button[data-transition-type="terminate"]').first();
      await expect(terminateButton).toBeVisible({ timeout: getTimeout(10000) });

      // ボタンに x-circle アイコンがあることを確認
      const terminateIcon = terminateButton.locator('[data-testid="transition-icon-terminate"]');
      await expect(terminateIcon).toBeVisible();

      // APIレスポンスを待機しながら終端遷移ボタンをクリック
      const transitionPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects/') &&
          response.url().includes('/status') &&
          response.request().method() === 'PATCH',
        { timeout: getTimeout(30000) }
      );

      await terminateButton.click();

      // APIレスポンスを待機
      const response = await transitionPromise;
      expect(response.status()).toBe(200);

      // ステータスが「中止」に更新されたことを確認
      await expect(currentStatusBadge).toHaveText('中止', { timeout: getTimeout(10000) });

      // 遷移可能なステータスがないことを確認（終端状態）
      await expect(page.getByText(/遷移可能なステータスがありません/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    test('終端遷移ボタンは赤色で表示される', async ({ page }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // 新しいプロジェクトを作成
      await createTestProject(page);
      await page.waitForLoadState('networkidle');

      // 終端遷移ボタンのスタイルを確認
      const terminateButton = page.locator('button[data-transition-type="terminate"]').first();
      await expect(terminateButton).toBeVisible({ timeout: getTimeout(10000) });

      // 赤色（red系）のスタイルが適用されていることを確認
      // backgroundColor: #fef2f2, color: #dc2626（赤系）
      const buttonStyles = await terminateButton.evaluate((el) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - window is available in browser context
        const style = window.getComputedStyle(el);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
        };
      });

      // 赤系の色が使われていることを確認（RGB値で検証）
      // #fef2f2 -> rgb(254, 242, 242)
      // #b91c1c -> rgb(185, 28, 28) (text-red-700)
      expect(buttonStyles.backgroundColor).toContain('254'); // 薄い赤の背景
      expect(buttonStyles.color).toContain('185'); // 赤のテキスト (red-700)
    });
  });

  /**
   * ステータスの視覚的区別テスト
   *
   * REQ-10.12: 各ステータスを視覚的に区別できる色分けで表示
   */
  test.describe('ステータスの視覚的区別', () => {
    test('現在のステータスバッジが適切な色で表示される', async ({ page }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // 新しいプロジェクトを作成
      await createTestProject(page);
      await page.waitForLoadState('networkidle');

      // 現在のステータスバッジを取得
      const currentStatusBadge = page.getByTestId('current-status-badge');
      await expect(currentStatusBadge).toBeVisible({ timeout: getTimeout(10000) });

      // ステータスバッジに背景色が設定されていることを確認
      const badgeStyles = await currentStatusBadge.evaluate((el) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - window is available in browser context
        const style = window.getComputedStyle(el);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
        };
      });

      // 背景色とテキスト色が設定されていることを確認（透明でない）
      expect(badgeStyles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
      expect(badgeStyles.color).not.toBe('');
    });

    test('ステータス変更履歴で遷移種別が視覚的に区別される', async ({ page }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // 新しいプロジェクトを作成し、遷移を実行して履歴を作成
      await createTestProject(page);
      await page.waitForLoadState('networkidle');

      // 順方向遷移を実行
      await executeForwardTransition(page);

      // ステータス変更履歴セクションを確認
      await expect(page.getByText(/ステータス変更履歴/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 履歴アイテムが表示されることを確認（少なくとも初期遷移と順方向遷移）
      const historyItems = page.locator('[data-testid^="status-history-item-"]');
      const historyCount = await historyItems.count();
      expect(historyCount).toBeGreaterThan(0);

      // 履歴アイテムにdata-transition-type属性が設定されていることを確認
      const firstHistoryItem = historyItems.first();
      const transitionType = await firstHistoryItem.getAttribute('data-transition-type');
      expect(transitionType).toBeTruthy();
      expect(['initial', 'forward', 'backward', 'terminate']).toContain(transitionType);
    });
  });

  /**
   * 遷移UIの視覚的区別テスト
   *
   * REQ-10.16: ステータス変更UIで順方向遷移と差し戻し遷移を視覚的に区別して表示
   */
  test.describe('遷移UIの視覚的区別', () => {
    test('順方向・差し戻し・終端遷移ボタンが視覚的に区別される', async ({ page }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // 新しいプロジェクトを作成し、順方向遷移を実行（差し戻しボタンを表示するため）
      await createTestProject(page);
      await page.waitForLoadState('networkidle');

      // 順方向遷移ボタンと終端遷移ボタンを取得
      const forwardButton = page.locator('button[data-transition-type="forward"]').first();
      await expect(forwardButton).toBeVisible({ timeout: getTimeout(10000) });

      const terminateButton = page.locator('button[data-transition-type="terminate"]').first();
      await expect(terminateButton).toBeVisible({ timeout: getTimeout(10000) });

      // 順方向遷移と終端遷移のスタイルが異なることを確認
      const forwardStyles = await forwardButton.evaluate((el) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - window is available in browser context
        const style = window.getComputedStyle(el);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
        };
      });

      const terminateStyles = await terminateButton.evaluate((el) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - window is available in browser context
        const style = window.getComputedStyle(el);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
        };
      });

      // スタイルが異なることを確認
      expect(forwardStyles.backgroundColor).not.toBe(terminateStyles.backgroundColor);
      expect(forwardStyles.color).not.toBe(terminateStyles.color);

      // 順方向遷移を実行して差し戻しボタンを表示
      await executeForwardTransition(page);

      // 差し戻しボタンのスタイルを確認
      const backwardButton = page.locator('button[data-transition-type="backward"]').first();
      await expect(backwardButton).toBeVisible({ timeout: getTimeout(10000) });

      const backwardStyles = await backwardButton.evaluate((el) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - window is available in browser context
        const style = window.getComputedStyle(el);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
        };
      });

      // 新しい順方向ボタンを取得
      const newForwardButton = page.locator('button[data-transition-type="forward"]').first();
      await expect(newForwardButton).toBeVisible({ timeout: getTimeout(10000) });

      const newForwardStyles = await newForwardButton.evaluate((el) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - window is available in browser context
        const style = window.getComputedStyle(el);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
        };
      });

      // 差し戻しと順方向のスタイルが異なることを確認
      expect(backwardStyles.backgroundColor).not.toBe(newForwardStyles.backgroundColor);
      expect(backwardStyles.color).not.toBe(newForwardStyles.color);
    });

    test('各遷移種別に対応するアイコンが表示される', async ({ page }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // 新しいプロジェクトを作成
      await createTestProject(page);
      await page.waitForLoadState('networkidle');

      // 順方向遷移アイコンを確認
      const forwardIcon = page.locator('[data-testid="transition-icon-forward"]').first();
      await expect(forwardIcon).toBeVisible({ timeout: getTimeout(10000) });

      // 終端遷移アイコンを確認
      const terminateIcon = page.locator('[data-testid="transition-icon-terminate"]').first();
      await expect(terminateIcon).toBeVisible({ timeout: getTimeout(10000) });

      // 順方向遷移を実行して差し戻しアイコンを確認
      await executeForwardTransition(page);

      // 差し戻し遷移アイコンを確認
      const backwardIcon = page.locator('[data-testid="transition-icon-backward"]').first();
      await expect(backwardIcon).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-10.12
     */
    test('各ステータスを視覚的に区別できる色分けで表示する (project-management/REQ-10.12)', async ({
      page,
    }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // 新しいプロジェクトを作成
      await createTestProject(page);
      await page.waitForLoadState('networkidle');

      // 現在のステータスバッジを確認
      const statusBadge = page.getByTestId('current-status-badge');
      await expect(statusBadge).toBeVisible({ timeout: getTimeout(10000) });

      // ステータスバッジに色が設定されていることを確認
      const badgeStyles = await statusBadge.evaluate((el) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - window is available in browser context
        const style = window.getComputedStyle(el);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
        };
      });

      // 背景色または文字色が設定されていることを確認
      expect(badgeStyles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
      expect(badgeStyles.backgroundColor).not.toBe('transparent');
    });

    /**
     * @requirement project-management/REQ-10.16
     */
    test('ステータス変更UIで順方向遷移と差し戻し遷移を視覚的に区別して表示する (project-management/REQ-10.16)', async ({
      page,
    }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // 新しいプロジェクトを作成
      await createTestProject(page);
      await page.waitForLoadState('networkidle');

      // 順方向遷移ボタンを確認
      const forwardButton = page.locator('button[data-transition-type="forward"]').first();
      await expect(forwardButton).toBeVisible({ timeout: getTimeout(10000) });

      const forwardStyles = await forwardButton.evaluate((el) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - window is available in browser context
        const style = window.getComputedStyle(el);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
        };
      });

      // 順方向遷移を実行
      await executeForwardTransition(page);

      // 差し戻し遷移ボタンを確認
      const backwardButton = page.locator('button[data-transition-type="backward"]').first();
      await expect(backwardButton).toBeVisible({ timeout: getTimeout(10000) });

      const backwardStyles = await backwardButton.evaluate((el) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - window is available in browser context
        const style = window.getComputedStyle(el);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
        };
      });

      // 順方向と差し戻しのスタイルが異なることを確認
      expect(forwardStyles.backgroundColor).not.toBe(backwardStyles.backgroundColor);
    });
  });
});
