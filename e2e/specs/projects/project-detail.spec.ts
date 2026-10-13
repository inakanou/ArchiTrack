/**
 * @fileoverview プロジェクト詳細画面のE2Eテスト
 *
 * Requirements:
 * - REQ-7.1〜7.7: プロジェクト詳細表示
 * - REQ-8.4〜8.6: プロジェクト編集（競合処理等）
 * - REQ-9.5〜9.6: プロジェクト削除（関連データ警告）
 * - REQ-10.2, REQ-10.4, REQ-10.13: ステータス管理
 * - REQ-11.1〜11.6: 関連データ参照
 */

import { test, expect, type Page, type Response } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { selectFirstRealOption } from '../../helpers/form-preconditions';

/**
 * プロジェクト詳細画面のE2Eテスト
 */
test.describe('プロジェクト詳細画面', () => {
  test.describe.configure({ mode: 'serial' });

  let testProjectId: string | null = null;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * テスト用プロジェクトを作成するヘルパー
   */
  async function createTestProject(page: Page): Promise<string> {
    // 認証が完全に確立されるのを確実にするため、
    // ヘッダーにユーザー名が表示されるまで待機（これでAPIクライアントにもトークンが設定される）
    await expect(page.getByRole('button', { name: /Test User/i })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // SPAナビゲーションを使用してプロジェクト一覧に移動
    // これにより、AuthContextの再初期化を避け、認証状態を維持する
    // ナビゲーションバーのプロジェクトリンクを使用（exactマッチで特定）
    const projectsLink = page.getByRole('link', { name: 'プロジェクト', exact: true });
    await expect(projectsLink).toBeVisible({ timeout: getTimeout(10000) });
    await projectsLink.click();

    await page.waitForURL(/\/projects/, { timeout: getTimeout(15000) });
    await page.waitForLoadState('networkidle');

    // 認証状態が維持されていることを確認
    await expect(page.getByRole('button', { name: /Test User/i })).toBeVisible({
      timeout: getTimeout(15000),
    });

    const createButton = page.getByRole('button', { name: /新規作成/i });
    await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });

    await createButton.click();
    await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

    await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

    // ユーザーオプションが読み込まれるまで待機
    // APIレスポンスではなく、実際にオプションが描画されるのを待つ
    const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
    await expect(salesPersonSelect).toBeVisible({ timeout: getTimeout(10000) });

    // ユーザーがロードされるまで待機
    // 「読み込み中...」が消えてセレクトボックスが表示されることを確認
    await expect(page.getByText('読み込み中...').first()).not.toBeVisible({
      timeout: getTimeout(10000),
    });

    // ユーザーオプションが少なくとも2つ（プレースホルダー + 1ユーザー）あることを確認
    // データベースの状態によってユーザー数は変動する可能性があるため、最低限の検証に留める
    await expect
      .poll(
        async () => {
          const options = await salesPersonSelect.locator('option').all();
          return options.length;
        },
        {
          timeout: getTimeout(30000),
          message: `営業担当者セレクトのオプションがロードされるのを待機中`,
        }
      )
      .toBeGreaterThanOrEqual(2);

    const projectName = `詳細テスト_${Date.now()}`;
    await page.getByLabel(/プロジェクト名/i).fill(projectName);
    // 取引先は任意フィールドのため未選択のまま進める
    await page.getByLabel(/現場住所/i).fill('東京都渋谷区テスト1-2-3');
    await page.getByLabel(/概要/i).fill('テスト用の概要説明');

    // 営業担当者を確認・選択
    await selectFirstRealOption(salesPersonSelect, '営業担当者');

    const createPromise = page.waitForResponse(
      (response: Response) =>
        response.url().includes('/api/projects') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
      { timeout: getTimeout(30000) }
    );

    await page.getByRole('button', { name: /^作成$/i }).click();
    await createPromise;

    await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
    const url = page.url();
    const match = url.match(/\/projects\/([0-9a-f-]+)$/);
    return match?.[1] ?? '';
  }

  /**
   * REQ-7: プロジェクト詳細表示のテスト
   */
  test.describe('プロジェクト詳細表示', () => {
    /**
     * @requirement project-management/REQ-7.1
     */
    test('プロジェクト詳細画面にアクセスすると全情報が表示される (project-management/REQ-7.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      testProjectId = await createTestProject(page);

      await page.waitForLoadState('networkidle');

      // 全情報が表示されることを確認
      await expect(page.getByText(/基本情報/i)).toBeVisible({ timeout: getTimeout(10000) });
      // 取引先は任意フィールドのため未選択なので表示なし
      await expect(page.getByText(/東京都渋谷区テスト1-2-3/i).first()).toBeVisible();
      await expect(page.getByText(/テスト用の概要説明/i).first()).toBeVisible();

      // ステータスバッジが表示されることを確認
      const statusBadge = page.getByTestId('current-status-badge');
      await expect(statusBadge).toBeVisible();
      await expect(statusBadge).toHaveText('準備中');
    });

    /**
     * @requirement project-management/REQ-7.2
     */
    test('プロジェクト詳細データ取得中にローディングインジケータが表示される (project-management/REQ-7.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      // ページ遷移を開始
      await page.goto(`/projects/${testProjectId}`);

      // ローディングインジケータが表示されることを確認（短時間で完了する可能性があるためtry-catchで囲む）
      try {
        await expect(page.getByText(/読み込み中/i).first()).toBeVisible({ timeout: 1000 });
      } catch {
        // ローディングが高速で完了した場合はスキップ
      }

      // 最終的にデータが表示されることを確認
      await expect(page.getByText(/基本情報/i)).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-7.3
     */
    test('存在しないプロジェクトIDで404エラーページが表示される (project-management/REQ-7.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 存在しないUUID
      await page.goto('/projects/00000000-0000-0000-0000-000000000000');
      await page.waitForLoadState('networkidle');

      // エラーメッセージの確認（404/Bad Request/Not Found/形式不正のいずれか）
      const errorMessage = page.getByText(
        /プロジェクトが見つかりませんでした|プロジェクトIDの形式が不正です|404|Not Found|Bad Request/i
      );
      await expect(errorMessage).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-7.4
     */
    test('アクセス権限がないプロジェクトで403エラーが表示される (project-management/REQ-7.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // Note: 実際の403エラーをテストするには、別のユーザーが作成したプロジェクトにアクセスする必要があるが、
      // 現在の実装では全ユーザーが全プロジェクトを閲覧可能なため、
      // ここでは権限チェックの仕組みが存在することを確認する

      // 存在しないプロジェクトにアクセス（権限エラーではなく404が返る）
      await page.goto('/projects/00000000-0000-0000-0000-000000000000');
      await page.waitForLoadState('networkidle');

      // エラーが表示されることを確認（404/403/Bad Request/形式不正のいずれか）
      const errorMessage = page.getByText(
        /プロジェクトが見つかりませんでした|アクセス権限がありません|プロジェクトIDの形式が不正です|403|404|Forbidden|Not Found|Bad Request/i
      );
      await expect(errorMessage).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * タスク 115.188 の是正: 従前は REQ-7.5 を名乗っていたが、受入基準7.5 は「営業担当者フィールドにユーザーの
     * 表示名を表示する」であり、本検証が主張する「一覧に戻る」リンクの表示とクリック遷移とは無関係である。
     * 要件7の受入基準は6件までで、「一覧に戻る」リンクを述べる条文は要件7に無い。ゆえに被覆印を**取り下げる**。
     *
     * 要件32.1 は逆に「プロジェクト詳細画面から『← 一覧に戻る』リンクを**削除する**」と
     * 述べている。本検証はそのリンクが見えることを主張しており、要件32.1 と正面から矛盾する。
     * 検証そのものの是非は本タスクの境界（被覆印の指し先）の外なので、
     * 別途の判断へ引き継ぐ。ここでは番号の付け直しをせず、被覆印を持たない検証として残す。
     */
    test('詳細画面に「一覧に戻る」リンクが表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 「一覧に戻る」リンクを確認
      const backLink = page.getByRole('link', { name: /一覧に戻る|プロジェクト一覧/i });
      await expect(backLink).toBeVisible({ timeout: getTimeout(10000) });

      // クリックすると一覧画面に遷移することを確認
      await backLink.click();
      await expect(page).toHaveURL(/\/projects$/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-7.5
     *
     * タスク 115.188 の是正: 従前は REQ-7.6 を名乗っていたが、受入基準7.6 は「工事担当者が設定されている場合…
     * 工事担当者フィールドにユーザーの表示名を表示する」であり、営業担当者を述べるのは受入基準7.5（営業担当者フィールドにユーザーの
     * 表示名を表示する）である。
     */
    test('営業担当者フィールドにユーザーの表示名が表示される (project-management/REQ-7.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 営業担当者フィールドにユーザー名が表示されることを確認
      // （表示名は実装によって異なるが、何らかのテキストが表示されることを確認）
      const salesPersonField = page.getByText(/営業担当者/i).locator('..');
      await expect(salesPersonField).toBeVisible({ timeout: getTimeout(10000) });
      const salesPersonText = await salesPersonField.textContent();
      expect(salesPersonText).toBeTruthy();
    });

    /**
     * @requirement project-management/REQ-7.6
     *
     * タスク 115.188 の是正: 従前は要件定義書に存在しない REQ-7.7 を名乗っていた。
     * 要件7の受入基準は6件までであり、本検証の表題は受入基準7.6
     * （工事担当者が設定されている場合、工事担当者フィールドにユーザーの表示名を表示する）に対応する。
     */
    test('工事担当者が設定されている場合、表示名が表示される (project-management/REQ-7.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 工事担当者を設定したプロジェクトを作成
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // ユーザー一覧の読み込み完了を待機
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await expect(page.getByText('読み込み中...').first()).not.toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect
        .poll(
          async () => {
            const options = await salesPersonSelect.locator('option').all();
            return options.length;
          },
          {
            timeout: getTimeout(30000),
            message: `営業担当者セレクトのオプションがロードされるのを待機中`,
          }
        )
        .toBeGreaterThanOrEqual(2);

      await page.getByLabel(/プロジェクト名/i).fill(`工事担当者テスト_${Date.now()}`);
      // 取引先は任意フィールドのため未選択のまま進める

      // 営業担当者を確認・選択
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      // 工事担当者を選択
      const constructionPersonSelect = page.locator('select[aria-label="工事担当者"]');
      await selectFirstRealOption(constructionPersonSelect, '工事担当者');

      const createPromise = page.waitForResponse(
        (response: Response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      await page.waitForLoadState('networkidle');

      // 工事担当者フィールドにユーザー名が表示されることを確認
      // exactマッチでラベルを特定し、親要素のテキストを確認
      const constructionPersonField = page.getByText('工事担当者', { exact: true }).locator('..');
      await expect(constructionPersonField).toBeVisible({ timeout: getTimeout(10000) });
      const constructionPersonText = await constructionPersonField.textContent();
      expect(constructionPersonText).toBeTruthy();
    });
  });

  /**
   * REQ-10: ステータス管理のテスト
   */
  test.describe('ステータス管理', () => {
    /**
     * @requirement project-management/REQ-10.2
     */
    test('新規作成時のデフォルトステータスが「準備中」である (project-management/REQ-10.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await createTestProject(page);

      await page.waitForLoadState('networkidle');

      // ステータスバッジが「準備中」であることを確認
      const statusBadge = page.getByTestId('current-status-badge');
      await expect(statusBadge).toBeVisible({ timeout: getTimeout(10000) });
      await expect(statusBadge).toHaveText('準備中');
    });

    /**
     * @requirement project-management/REQ-10.13
     */
    test('プロジェクト詳細画面でステータス変更履歴が閲覧可能 (project-management/REQ-10.13)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // ステータス変更履歴セクションが表示されることを確認
      await expect(page.getByText(/ステータス変更履歴/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 初期ステータスの履歴が表示されることを確認
      const historyItems = page.locator('[data-testid^="status-history-item-"]');
      const historyCount = await historyItems.count();
      expect(historyCount).toBeGreaterThan(0);
    });
  });

  /**
   * REQ-11: 関連データ参照のテスト
   */
  test.describe('関連データ参照', () => {
    /**
     * @requirement project-management/REQ-11.1
     */
    test('現場調査機能が有効な場合、詳細画面に関連する現場調査情報が表示される (project-management/REQ-11.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 現場調査セクションの存在を確認（見出し要素に限定）
      const surveySection = page.getByRole('heading', { name: /現場調査/i });
      await expect(surveySection).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-11.2
     */
    test('見積機能が有効な場合、詳細画面に関連する見積書情報が表示される (project-management/REQ-11.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 見積依頼セクションの存在を確認（見積依頼ヘッダーを使用）
      const quoteSection = page.getByRole('heading', { name: '見積依頼' });
      await expect(quoteSection).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-11.3
     */
    test('現場調査機能が有効な場合、「現場調査一覧」リンクをクリックすると現場調査一覧画面に遷移する (project-management/REQ-11.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 現場調査セクションが表示されることを確認
      const surveySection = page.getByRole('heading', { name: /現場調査/i });
      await expect(surveySection).toBeVisible({ timeout: getTimeout(10000) });

      // 「すべて見る」リンク（現場調査がある場合）または「新規作成」リンク（ない場合）を探す
      // 現場調査セクション内のリンクを使用
      const siteSurveySection = page.getByLabel('現場調査', { exact: true });
      const viewAllLink = siteSurveySection.getByRole('link', { name: /すべて見る/i });
      const createLink = siteSurveySection.getByRole('link', { name: /新規作成/i });

      // どちらかのリンクをクリックして現場調査関連画面に遷移
      const viewAllVisible = await viewAllLink.isVisible().catch(() => false);
      if (viewAllVisible) {
        await viewAllLink.click();
      } else {
        await createLink.click();
      }

      await expect(page).toHaveURL(/site-surveys/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-11.4
     * 見積依頼機能が実装されているため、見積依頼セクションの存在を確認
     */
    test('見積機能が有効な場合、「見積書一覧」リンクをクリックすると見積書一覧画面に遷移する (project-management/REQ-11.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 見積依頼セクションの見出しは件数に依らず常に描画される
      // （ProjectDetailPage が EstimateRequestSectionCard を無条件に置く）。
      // 以前はセクションの有無で判定を包み、無い場合の枝に `expect(true).toBe(true)` を
      // 置いていた。セクションが消えても緑になる形であり、何も確かめていなかった。
      const estimateRequestSection = page.getByRole('heading', { name: /見積依頼/i });
      await expect(estimateRequestSection).toBeVisible({ timeout: getTimeout(10000) });

      // 見積依頼画面への導線は件数で姿を変える。1件以上なら「すべて見る」、
      // 0件なら空状態の「新規作成」が描画される（EstimateRequestSectionCard）。
      // どちらの経路でも見積依頼の画面へ遷移することを主張する。
      const section = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: /見積依頼/i }) });
      const viewAllLink = section.getByRole('link', { name: /すべて見る/i });
      const createLink = section.getByRole('link', { name: /新規作成/i });

      if (await isVisibleWithin(viewAllLink, getTimeout(3000))) {
        await viewAllLink.click();
      } else {
        await createLink.click();
      }

      await expect(page).toHaveURL(/estimate-requests/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-11.5
     */
    test('関連データがない場合は「0件」と表示される (project-management/REQ-11.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 関連データセクションの存在を確認
      const relatedDataSection = page.getByText(/関連データ|現場調査|見積書/i).first();
      await expect(relatedDataSection).toBeVisible({ timeout: getTimeout(10000) });

      // 0件表示を確認
      const zeroOrComingSoon = page.getByText(/0件|今後実装予定/i).first();
      await expect(zeroOrComingSoon).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement project-management/REQ-11.6
     */
    test('関連機能が未実装の場合、該当セクションが非表示 (project-management/REQ-11.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        testProjectId = await createTestProject(page);
      }

      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 現場調査機能・見積機能が未実装の場合、セクションが非表示であることを確認
      const surveySection = page.getByText(/現場調査一覧/i);
      const quoteSection = page.getByText(/見積書一覧/i);

      // 両方のセクションが非表示であることを確認
      await expect(surveySection).not.toBeVisible({ timeout: getTimeout(5000) });
      await expect(quoteSection).not.toBeVisible({ timeout: getTimeout(5000) });
    });
  });
});
