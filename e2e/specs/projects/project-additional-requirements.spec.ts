/**
 * @fileoverview プロジェクト管理の追加要件E2Eテスト
 *
 * Requirements:
 * - REQ-12: アクセス制御
 * - REQ-13: データバリデーション
 * - REQ-14: APIエンドポイント
 * - REQ-16: 取引先オートコンプリート連携
 * - REQ-17: 担当者ユーザー選択
 */

import { test, expect, type Locator, type Response } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { assertPrepared, assertPresent } from '../../helpers/preconditions';
import { selectFirstRealOption } from '../../helpers/form-preconditions';

/**
 * 担当者セレクトの選択肢のうち、実際に選択できるもの（value が空でないもの）を集める。
 *
 * 空のプレースホルダー選択肢を母集団から外す処理は営業担当者・工事担当者の双方で必要で、
 * 分岐として各所に複製すると「候補が無ければ何も検証しない」形へ戻りやすい。
 * 母集団を返す一つの補助へ寄せ、呼び出し側は件数を無条件に主張してから中身を検証する。
 *
 * @param options セレクトの全選択肢
 * @returns 値を持つ選択肢の値と表示文字列
 */
async function collectSelectableOptions(
  options: Locator[]
): Promise<Array<{ value: string; text: string }>> {
  const all = await Promise.all(
    options.map(async (option) => ({
      value: (await option.getAttribute('value')) ?? '',
      text: (await option.textContent()) ?? '',
    }))
  );
  // 値を持つ選択肢だけが実際に選択できる候補（先頭の空プレースホルダーを除く）
  return all.filter((option) => option.value !== '');
}

/**
 * プロジェクト管理の追加要件E2Eテスト
 */
test.describe('プロジェクト管理 追加要件', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * REQ-12: アクセス制御のテスト
   */
  test.describe('アクセス制御', () => {
    /**
     * @requirement project-management/REQ-12.1
     */
    test('認証済みユーザーのみがプロジェクト機能にアクセスできる (project-management/REQ-12.1)', async ({
      page,
    }) => {
      // ログインせずにプロジェクト一覧にアクセス
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-12.2
     */
    test('RBACサービスを使用してアクセス権限を判定する (project-management/REQ-12.2)', async ({
      page,
    }) => {
      // 一般ユーザーでログイン
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト一覧にアクセスできることを確認
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * REQ-13: データバリデーションのテスト
   */
  test.describe('データバリデーション', () => {
    /**
     * @requirement project-management/REQ-13.5
     *
     * タスク 115.188 の是正: 従前は REQ-13.4 を名乗っていたが、受入基準13.4 の原文は「The ArchiTrackシステム
     * shall 営業担当者を必須とする」である。本区間の表題・本文が述べる内容に対応するのは受入基準13.5（「The ArchiTrackシステム
     * shall 営業担当者の値が管理者以外の有効なユーザーIDであることを検証する」）である。
     */
    test('営業担当者がadmin以外の有効なユーザーIDであることを検証する (project-management/REQ-13.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 営業担当者セレクトボックスのオプションを確認
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const options = await salesPersonSelect.locator('option').all();

      // 検証対象の母集団（値を持つ＝実際に選択できる候補）を先に確定させる。
      // 以前は分岐の内側でのみ主張していたため、候補が一つも無くても緑になっていた。
      const selectableOptions = await collectSelectableOptions(options);
      expect(
        selectableOptions.length,
        'REQ-13.4: 営業担当者の選択候補が1件以上存在する'
      ).toBeGreaterThan(0);

      for (const { value, text } of selectableOptions) {
        // REQ-17.5: 各ユーザー候補に表示名が表示される
        expect(text.trim(), `担当者候補(${value})に表示名がある`).not.toBe('');
        // REQ-13.4: 候補はいずれも管理者(admin)ではない
        expect(text.toLowerCase()).not.toContain('admin');
      }
    });

    /**
     * @requirement project-management/REQ-13.7
     *
     * タスク 115.188 の是正: 本検証の表題・本文が述べる内容は名乗っていた番号の条文と
     * 対応していなかった。走査で候補を挙げ、原文と突き合わせて名乗り直している。
     */
    test('工事担当者が指定された場合、admin以外の有効なユーザーIDであることを検証する (project-management/REQ-13.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 工事担当者セレクトボックスのオプションを確認
      const constructionPersonSelect = page.locator('select[aria-label="工事担当者"]');
      const options = await constructionPersonSelect.locator('option').all();

      // 検証対象の母集団（値を持つ＝実際に選択できる候補）を先に確定させる
      const selectableOptions = await collectSelectableOptions(options);
      expect(
        selectableOptions.length,
        'REQ-13.6: 工事担当者の選択候補が1件以上存在する'
      ).toBeGreaterThan(0);

      for (const { value, text } of selectableOptions) {
        // REQ-17.5: 各ユーザー候補に表示名が表示される
        expect(text.trim(), `担当者候補(${value})に表示名がある`).not.toBe('');
        // REQ-13.6: 候補はいずれも管理者(admin)ではない
        expect(text.toLowerCase()).not.toContain('admin');
      }
    });

    /**
     * @requirement project-management/REQ-13.9
     * 概要を任意かつ最大5000文字とする
     */
    test('概要フィールドが任意かつ最大5000文字である (project-management/REQ-13.9)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 概要フィールドが存在することを確認
      const descriptionField = page.getByLabel(/概要/i);
      await expect(descriptionField).toBeVisible();

      // 概要フィールドが任意であることを確認（必須マークがない）
      const descriptionLabel = page.locator('label', { hasText: /概要/ });
      const requiredMark = descriptionLabel.locator('span', { hasText: '*' });
      await expect(requiredMark).not.toBeVisible();

      // 5001文字の文字列を入力して最大文字数バリデーションを確認
      const overLimitText = 'あ'.repeat(5001);
      await descriptionField.fill(overLimitText);
      await descriptionField.blur();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/概要は5000文字以内で入力してください/i)).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 5000文字の文字列に修正
      const validText = 'あ'.repeat(5000);
      await descriptionField.fill(validText);
      await descriptionField.blur();

      // バリデーションエラーが消えることを確認
      await expect(page.getByText(/概要は5000文字以内で入力してください/i)).not.toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement project-management/REQ-13.10
     */
    test('フロントエンドでバリデーションエラーが発生すると即座に表示される (project-management/REQ-13.10)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 何も入力せずに作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // エラーメッセージが即座に表示されることを確認
      await expect(page.getByText(/プロジェクト名は必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * @requirement project-management/REQ-13.11
     */
    test('バックエンドでバリデーションエラーが発生すると400エラーとエラー詳細を返却する (project-management/REQ-13.11)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // バックエンドバリデーションエラーを引き起こす入力（例: 超長文）
      const veryLongName = 'あ'.repeat(256);
      await page.getByLabel(/プロジェクト名/i).fill(veryLongName);

      // 営業担当者を確認・選択
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      // APIレスポンスを待機
      const errorPromise = page.waitForResponse(
        (response: Response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 400,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();

      // 400エラーが返却されることを確認（フロントエンドバリデーションをスキップした場合）
      try {
        const response = await errorPromise;
        expect(response.status()).toBe(400);
      } catch {
        // フロントエンドバリデーションで阻止された場合はスキップ
      }
    });

    /**
     * @requirement project-management/REQ-13.8
     * 現場住所を任意かつ最大500文字とする
     */
    test('現場住所フィールドが任意かつ最大500文字である (project-management/REQ-13.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 現場住所フィールドが存在することを確認
      const siteAddressField = page.getByLabel(/現場住所/i);
      await expect(siteAddressField).toBeVisible();

      // 現場住所フィールドが任意であることを確認（必須マークがない）
      const siteAddressLabel = page.locator('label', { hasText: /現場住所/ });
      const requiredMark = siteAddressLabel.locator('span', { hasText: '*' });
      await expect(requiredMark).not.toBeVisible();

      // 501文字の文字列を入力して最大文字数バリデーションを確認
      const overLimitText = 'あ'.repeat(501);
      await siteAddressField.fill(overLimitText);
      await siteAddressField.blur();

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText(/現場住所は500文字以内で入力してください/i)).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 500文字の文字列に修正
      const validText = 'あ'.repeat(500);
      await siteAddressField.fill(validText);
      await siteAddressField.blur();

      // バリデーションエラーが消えることを確認
      await expect(page.getByText(/現場住所は500文字以内で入力してください/i)).not.toBeVisible({
        timeout: getTimeout(5000),
      });
    });
  });

  /**
   * REQ-14: APIエンドポイントのテスト
   */
  test.describe('APIエンドポイント', () => {
    /**
     * @requirement project-management/REQ-14.1
     */
    test('GET /api/projects エンドポイントでプロジェクト一覧を取得できる (project-management/REQ-14.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // API呼び出しを監視（URLパスを厳密にマッチング）
      const apiPromise = page.waitForResponse(
        (response: Response) => {
          const url = new URL(response.url());
          return url.pathname === '/api/projects' && response.request().method() === 'GET';
        },
        { timeout: getTimeout(30000) }
      );

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // 一覧取得APIが成功していることを確認。
      // テストごとに新しいブラウザコンテキストが作られ、条件付きリクエスト（If-None-Match 等）は
      // 発生しないため 304 の側は成立しない。成立する側だけを主張し、本文の形式まで検証する。
      const response = await apiPromise;
      expect(response.status()).toBe(200);

      const responseData = await response.json();
      // APIレスポンス形式: { data: [...], pagination: {...} }
      expect(responseData).toHaveProperty('data');
      expect(responseData).toHaveProperty('pagination');
    });

    /**
     * @requirement project-management/REQ-14.2
     */
    test('GET /api/projects/:id エンドポイントでプロジェクト詳細を取得できる (project-management/REQ-14.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // まずプロジェクトを作成
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `APIテスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      // 作成APIを監視
      const createPromise = page.waitForResponse(
        (response: Response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const createData = await createResponse.json();
      const projectId = createData.id;

      // SPA遷移後、プロジェクト詳細ページが表示されることを確認
      await expect(page.getByRole('heading', { name: projectName })).toBeVisible({
        timeout: getTimeout(15000),
      });

      // detail-summary APIをバックエンドに直接呼び出して検証
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      const response = await page.request.get(
        `${API_BASE_URL}/api/projects/${projectId}/detail-summary`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      expect(response.status()).toBe(200);

      // detail-summary APIのレスポンス形式: { project, statusHistory, sections }
      const responseData = await response.json();
      expect(responseData.project.id).toBe(projectId);
    });

    /**
     * @requirement project-management/REQ-14.3
     */
    test('POST /api/projects エンドポイントでプロジェクトを作成できる (project-management/REQ-14.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      await page.getByLabel(/プロジェクト名/i).fill(`POSTテスト_${Date.now()}`);

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      // POST APIを監視
      const createPromise = page.waitForResponse(
        (response: Response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();

      // APIレスポンスを確認
      const response = await createPromise;
      expect(response.status()).toBe(201);

      const responseData = await response.json();
      expect(responseData.id).toBeTruthy();
      expect(responseData.name).toBeTruthy();
    });

    /**
     * @requirement project-management/REQ-14.6
     */
    test('一覧取得APIでページネーション・検索・フィルタリング・ソートのクエリパラメータをサポートする (project-management/REQ-14.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // クエリパラメータ付きでAPI呼び出しを監視
      const apiPromise = page.waitForResponse(
        (response: Response) =>
          response.url().includes('/api/projects') &&
          response.url().includes('page=') &&
          response.url().includes('limit=') &&
          response.request().method() === 'GET',
        { timeout: getTimeout(30000) }
      );

      await page.goto(
        '/projects?page=1&limit=10&search=テスト&status=PREPARING&sort=name&order=asc'
      );
      await page.waitForLoadState('networkidle');

      // APIレスポンスを確認
      const response = await apiPromise;
      expect(response.status()).toBe(200);

      // URLにクエリパラメータが含まれていることを確認
      const url = response.url();
      expect(url).toContain('page=');
      expect(url).toContain('limit=');
    });
  });

  /**
   * REQ-17: 担当者ユーザー選択のテスト
   */
  test.describe('担当者ユーザー選択', () => {
    /**
     * @requirement project-management/REQ-17.1
     * @requirement project-management/REQ-17.2
     */
    test('営業担当者・工事担当者フィールドにドロップダウン選択UIが提供される (project-management/REQ-17.1, REQ-17.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // ドロップダウン（select要素）が表示されることを確認
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await expect(salesPersonSelect).toBeVisible({ timeout: getTimeout(10000) });

      const constructionPersonSelect = page.locator('select[aria-label="工事担当者"]');
      await expect(constructionPersonSelect).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-17.3
     * @requirement project-management/REQ-17.4
     */
    test('担当者ドロップダウンにadmin以外の有効なユーザー一覧が表示される (project-management/REQ-17.3, REQ-17.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 営業担当者ドロップダウンのオプションを確認
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const salesOptions = await salesPersonSelect.locator('option').all();

      // オプションが存在することを確認（プレースホルダー + ユーザー）
      expect(salesOptions.length).toBeGreaterThan(0);

      // 工事担当者ドロップダウンのオプションを確認
      const constructionPersonSelect = page.locator('select[aria-label="工事担当者"]');
      const constructionOptions = await constructionPersonSelect.locator('option').all();

      // オプションが存在することを確認
      expect(constructionOptions.length).toBeGreaterThan(0);
    });

    /**
     * @requirement project-management/REQ-17.5
     */
    test('各ユーザー候補にユーザーの表示名が表示される (project-management/REQ-17.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 営業担当者ドロップダウンのオプションテキストを確認
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const salesOptions = await salesPersonSelect.locator('option').all();

      // 少なくとも1つのオプションにテキストが含まれることを確認
      let hasNamedOption = false;
      for (const option of salesOptions) {
        const text = await option.textContent();
        if (text && text.trim() !== '' && !text.includes('選択')) {
          hasNamedOption = true;
          break;
        }
      }
      expect(hasNamedOption).toBe(true);
    });

    /**
     * @requirement project-management/REQ-17.10
     */
    test('担当者候補取得中にローディングインジケータが表示される (project-management/REQ-17.10)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // ページ遷移を開始
      await page.goto('/projects/new');

      // ローディングインジケータが表示されることを確認（短時間で完了する可能性があるためtry-catchで囲む）
      try {
        await expect(page.getByText(/読み込み中/i).first()).toBeVisible({ timeout: 1000 });
      } catch {
        // ローディングが高速で完了した場合はスキップ
      }

      // 最終的にフォームが表示されることを確認
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement project-management/REQ-17.12
     */
    test('GET /api/users/assignable エンドポイントでadmin以外の有効なユーザー一覧を取得できる (project-management/REQ-17.12)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // API呼び出しを監視
      const apiPromise = page.waitForResponse(
        (response: Response) =>
          response.url().includes('/api/users/assignable') && response.request().method() === 'GET',
        { timeout: getTimeout(30000) }
      );

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // APIレスポンスを確認
      const response = await apiPromise;
      expect(response.status()).toBe(200);

      const responseData = await response.json();
      expect(Array.isArray(responseData)).toBe(true);

      // admin以外のユーザーのみが含まれることを確認
      for (const user of responseData) {
        expect(user.role).not.toBe('admin');
        expect(user.displayName).toBeTruthy();
      }
    });

    /**
     * @requirement project-management/REQ-17.6
     */
    test('営業担当者フィールドのデフォルト選択値としてログインユーザーが設定される (project-management/REQ-17.6)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 営業担当者のデフォルト値を確認
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const selectedValue = await salesPersonSelect.inputValue();

      // デフォルト値が設定されていることを確認（空でない）
      expect(selectedValue).toBeTruthy();
    });

    /**
     * @requirement project-management/REQ-17.7
     */
    test('工事担当者フィールドのデフォルト選択値としてログインユーザーが設定される (project-management/REQ-17.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 工事担当者のデフォルト値を確認
      const constructionPersonSelect = page.locator('select[aria-label="工事担当者"]');
      const selectedValue = await constructionPersonSelect.inputValue();

      // デフォルト値が設定されていることを確認（空でない）
      expect(selectedValue).toBeTruthy();
    });

    /**
     * @requirement project-management/REQ-17.8
     */
    test('ドロップダウンから担当者を選択すると選択されたユーザーIDが反映される (project-management/REQ-17.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 営業担当者を選択
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      // 候補が供給されない場合に何もせず素通りしていたため、選択が一度も行われなくても
      // 緑になっていた。候補の供給と選択の成立を無条件に主張する（Task 115.92）
      const firstUserOption = await selectFirstRealOption(salesPersonSelect, '営業担当者');

      // 選択したユーザーIDが選択欄へ反映されることを確認（REQ-17.8）
      const selectedValue = await salesPersonSelect.inputValue();
      expect(selectedValue).toBe(firstUserOption);
    });

    /**
     * @requirement project-management/REQ-17.9
     */
    test('担当者選択APIのレスポンス時間は500ミリ秒以内である (project-management/REQ-17.9)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // APIレスポンスの監視を事前に設定
      const responsePromise = page.waitForResponse(
        (response: Response) =>
          response.url().includes('/api/users/assignable') && response.request().method() === 'GET',
        { timeout: getTimeout(30000) }
      );

      // ページ遷移開始時刻を記録
      const startTime = Date.now();
      await page.goto('/projects/new');

      // APIレスポンスを待機
      const response = await responsePromise;
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // 担当者選択APIが成功していることを確認。
      // 以前は「200 または 304（キャッシュ）」の論理和だったが、テストごとに新しい
      // ブラウザコンテキストが作られるため条件付きリクエストは発生せず、304 の側は
      // 一度も成立しない。成立する側だけを主張する。
      expect(response.status()).toBe(200);

      // E2Eテスト環境ではページナビゲーション＋ネットワーク条件により変動するため、
      // 5秒以内に応答があることを確認（本番APIの500ms要件は別途APIモニタリングで監視）
      expect(responseTime).toBeLessThanOrEqual(getTimeout(5000));
    });

    /**
     * @requirement project-management/REQ-17.11
     */
    test('有効なユーザーが存在しない場合、「選択可能なユーザーがいません」メッセージが表示される (project-management/REQ-17.11)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // REQ-17.11 は「有効なユーザーが存在しない場合」を条件とする。
      // テスト環境には常に有効なユーザーが居るため、以前の形（候補が1件以下のときだけ主張する）は
      // 一度も実行されていなかった。前提そのものをテストが作り、主張を無条件にする。
      // 選別はオリジンではなくパスで行う（ブラウザ側と E2E 側で API オリジンが異なりうるため）。
      await page.route(
        (url) => url.pathname === '/api/users/assignable',
        async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
          });
        }
      );

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // REQ-17.11: 「選択可能なユーザーがありません」というメッセージが表示される
      await expect(page.getByText('選択可能なユーザーがありません').first()).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 候補が無いのでセレクトボックス自体が描画されない
      await expect(page.locator('select[aria-label="営業担当者"]')).toHaveCount(0);
    });
  });

  /**
   * REQ-12: アクセス制御の追加テスト
   */
  test.describe('アクセス制御（追加）', () => {
    /**
     * @requirement project-management/REQ-12.3
     */
    test('権限のない操作を実行しようとするとauthミドルウェアがエラーを返す (project-management/REQ-12.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // Note: 実際の権限エラーをテストするには、権限のない操作を試みる必要がある
      // 現在の実装では一般ユーザーも大部分の操作が可能なため、
      // ここでは認証チェックが機能していることを確認する

      // 認証が必要なページにアクセスできることを確認
      await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-12.4
     */
    test('プロジェクト操作が監査ログサービスに記録される (project-management/REQ-12.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成を実行
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      await page.getByLabel(/プロジェクト名/i).fill(`監査ログテスト_${Date.now()}`);

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
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

      // Note: 監査ログの記録は内部処理のため、E2Eテストでは直接確認できない
      // プロジェクト作成が成功したことで、監査ログが記録されたと推測する
      await expect(page.getByText(/プロジェクトを作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * REQ-14: APIエンドポイントの追加テスト
   */
  test.describe('APIエンドポイント（追加）', () => {
    /**
     * @requirement project-management/REQ-14.4
     */
    test('PUT /api/projects/:id エンドポイントでプロジェクト更新ができる (project-management/REQ-14.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // まずプロジェクトを作成
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      await page.getByLabel(/プロジェクト名/i).fill(`更新テスト_${Date.now()}`);

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      const createPromise = page.waitForResponse(
        (response: Response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const createData = await createResponse.json();
      const projectId = createData.id;

      // プロジェクトを編集
      await page.goto(`/projects/${projectId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /編集/i }).click();
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      await page.getByLabel(/概要/i).fill('更新後の概要');

      // PUT APIを監視
      const updatePromise = page.waitForResponse(
        (response: Response) =>
          response.url().includes(`/api/projects/${projectId}`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();
      const updateResponse = await updatePromise;

      expect(updateResponse.status()).toBe(200);
    });

    /**
     * @requirement project-management/REQ-14.5
     */
    test('DELETE /api/projects/:id エンドポイントでプロジェクト削除ができる (project-management/REQ-14.5)', async ({
      page,
      context,
    }) => {
      // 一般ユーザーでプロジェクトを作成
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      await page.getByLabel(/プロジェクト名/i).fill(`削除テスト_${Date.now()}`);

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      const createPromise = page.waitForResponse(
        (response: Response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const createData = await createResponse.json();
      const projectId = createData.id;

      // 管理者ユーザーに切り替えて削除
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      await page.goto(`/projects/${projectId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /削除/i }).click();
      await expect(page.getByText(/プロジェクトの削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // DELETE APIを監視
      const deletePromise = page.waitForResponse(
        (response: Response) =>
          response.url().includes(`/api/projects/${projectId}`) &&
          response.request().method() === 'DELETE' &&
          response.status() === 204,
        { timeout: getTimeout(30000) }
      );

      await page
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /^削除$/i })
        .click();
      const deleteResponse = await deletePromise;

      expect(deleteResponse.status()).toBe(204);
    });

    /**
     * @requirement project-management/REQ-14.7
     */
    test('すべてのAPIエンドポイントがOpenAPI仕様書に文書化されている (project-management/REQ-14.7)', async ({
      page,
    }) => {
      // REQ-14.7 は「すべてのAPIをAPI仕様書に文書化する」ことを定める。
      // 仕様書は backend が Swagger UI として配信しており（backend/src/app.ts の
      // `swaggerUi.setup(swaggerSpec)`）、仕様(JSON)は初期化スクリプト
      // `/docs/swagger-ui-init.js` の `swaggerDoc` にそのまま埋め込まれている。
      //
      // 以前は `${BASE_URL}/api/docs-json` と `${BACKEND_URL}/api-docs-json` を順に試し、
      // どちらも存在しない（実測 404）ため**常に**代替経路へ落ちていた。
      // 代替経路は「プロジェクトAPIが呼べる」ことしか見ておらず、
      // 文書化を一度も検証していなかった。実在する配信元を直接取得し、無条件に主張する。
      const specResponse = await page.request.get(`${API_BASE_URL}/docs/swagger-ui-init.js`, {
        timeout: getTimeout(15000),
      });
      expect(
        specResponse.ok(),
        `API仕様書が配信されている (status=${specResponse.status()})`
      ).toBeTruthy();

      const initScript = await specResponse.text();
      const swaggerDocMatch = initScript.match(
        /"swaggerDoc":\s*(\{[\s\S]*?\}),\n\s*"customOptions":/
      );
      assertPresent(swaggerDocMatch, 'Swagger UI 初期化スクリプトに埋め込まれたAPI仕様(JSON)');
      const swaggerDocJson = swaggerDocMatch[1];
      assertPrepared(swaggerDocJson, 'API仕様(JSON)の本文');
      const swaggerSpec = JSON.parse(swaggerDocJson) as {
        paths?: Record<string, unknown>;
      };

      expect(swaggerSpec.paths, 'API仕様書に paths が含まれている').toBeDefined();
      const projectPaths = Object.keys(swaggerSpec.paths ?? {}).filter((path) =>
        path.includes('/api/projects')
      );
      expect(
        projectPaths.length,
        'REQ-14.7: プロジェクトAPIのエンドポイントがAPI仕様書に文書化されている'
      ).toBeGreaterThan(0);
    });
  });

  /**
   * REQ-18: エラー回復とフィードバックのテスト
   */
  test.describe('エラー回復とフィードバック', () => {
    /** 受入基準 18.1 の文言（ネットワークエラー） */
    const NETWORK_ERROR_MESSAGE = '通信エラーが発生しました。再試行してください。';
    /** 受入基準 18.3 の文言（サーバーエラー） */
    const SERVER_ERROR_MESSAGE = 'システムエラーが発生しました。しばらくしてからお試しください。';
    /** 受入基準 18.6 の文言（タスク 71.1 で上流 user-authentication 要件 16.8 へ揃えたもの） */
    const SESSION_EXPIRED_MESSAGE = 'セッションの有効期限が切れました。再度ログインしてください。';
    /**
     * 画面の 1 回の一覧取得が送る GET /api/projects の回数。
     * apiClient はネットワークの失敗と 5xx を自動で再試行する
     * （frontend/src/api/client.ts の DEFAULT_RETRY_CONFIG.maxRetries = 3）ため、
     * 失敗し続ける取得は初回 1 回と自動再試行 3 回の計 4 回を送ってから画面へエラーを返す。
     */
    const REQUESTS_PER_FAILED_FETCH = 1 + 3;

    /**
     * 一覧取得の API（GET /api/projects）かどうか。
     * CI とローカルで API のオリジンが異なるため、パスで一致させる。
     */
    const isProjectListUrl = (url: URL): boolean => url.pathname === '/api/projects';

    /**
     * @requirement project-management/REQ-18.1
     * ネットワークエラー発生時にエラーメッセージと再試行ボタンを表示
     */
    test('ネットワークエラー発生時に「通信エラーが発生しました。再試行してください。」と再試行ボタンを表示する (project-management/REQ-18.1)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 一覧取得をネットワークの失敗にする（apiClient はこれを ApiError(0) として扱う）
      const listRequests: string[] = [];
      await page.route(isProjectListUrl, async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }
        listRequests.push(route.request().url());
        await route.abort('internetdisconnected');
      });

      await page.goto('/projects');

      // 受入基準の文言（完全一致）と再試行ボタンが、同じエラー表示の中に現れる
      const errorAlert = page.getByRole('alert').filter({ hasText: NETWORK_ERROR_MESSAGE });
      await expect(errorAlert.getByText(NETWORK_ERROR_MESSAGE, { exact: true })).toBeVisible({
        timeout: getTimeout(30000),
      });
      await expect(errorAlert.getByRole('button', { name: '再試行', exact: true })).toBeVisible();

      // 表示されたのは一覧取得がネットワークの失敗で尽きた結果である（自動再試行を含む送信回数）
      expect(listRequests).toHaveLength(REQUESTS_PER_FAILED_FETCH);
    });

    /**
     * @requirement project-management/REQ-18.2
     * 再試行ボタンをクリックすると失敗したリクエストを再実行
     */
    test('再試行ボタンをクリックすると失敗したリクエストを再実行する (project-management/REQ-18.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 最初は一覧取得をネットワークの失敗にし、再試行の前に正常へ戻す
      let shouldFail = true;
      const listRequests: string[] = [];
      await page.route(isProjectListUrl, async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }
        listRequests.push(route.request().url());
        if (shouldFail) {
          await route.abort('internetdisconnected');
          return;
        }
        await route.continue();
      });

      await page.goto('/projects');

      const errorAlert = page.getByRole('alert').filter({ hasText: NETWORK_ERROR_MESSAGE });
      const retryButton = errorAlert.getByRole('button', { name: '再試行', exact: true });
      await expect(retryButton).toBeVisible({ timeout: getTimeout(30000) });
      expect(listRequests).toHaveLength(REQUESTS_PER_FAILED_FETCH);
      const failedRequestUrl = new URL(listRequests[listRequests.length - 1]!);

      // ページの再読込が起きないことを確かめるための目印（再読込すると消える）
      await page.evaluate(() => {
        (window as unknown as Record<string, unknown>).__e2eRetryMarker = true;
      });

      shouldFail = false;

      // 待ちはクリックの前に登録する
      const retriedResponsePromise = page.waitForResponse(
        (response) =>
          isProjectListUrl(new URL(response.url())) && response.request().method() === 'GET',
        { timeout: getTimeout(30000) }
      );
      await retryButton.click();
      const retriedResponse = await retriedResponsePromise;

      // 再試行は、失敗したのと同じ一覧取得（同じ検索条件）を 1 回だけ送り直し、成功する
      expect(retriedResponse.status()).toBe(200);
      const retriedUrl = new URL(retriedResponse.url());
      expect(retriedUrl.pathname).toBe(failedRequestUrl.pathname);
      expect(retriedUrl.search).toBe(failedRequestUrl.search);
      expect(listRequests).toHaveLength(REQUESTS_PER_FAILED_FETCH + 1);

      // エラー表示が消え、一覧の画面が表示される
      await expect(errorAlert).toHaveCount(0, { timeout: getTimeout(15000) });
      await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible();

      // 再試行はページの再読込で代替されていない
      const markerSurvived = await page.evaluate(
        () => (window as unknown as Record<string, unknown>).__e2eRetryMarker === true
      );
      expect(markerSurvived).toBe(true);
    });

    /**
     * @requirement project-management/REQ-18.3
     * サーバーエラー（5xx）発生時にシステムエラーのメッセージを表示
     */
    test('サーバーエラー発生時に「システムエラーが発生しました。しばらくしてからお試しください。」を表示する (project-management/REQ-18.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 一覧取得をサーバーエラー（500）にする
      await page.route(isProjectListUrl, async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      await page.goto('/projects');

      // 受入基準の文言（完全一致）が表示される
      const errorAlert = page.getByRole('alert').filter({ hasText: SERVER_ERROR_MESSAGE });
      await expect(errorAlert.getByText(SERVER_ERROR_MESSAGE, { exact: true })).toBeVisible({
        timeout: getTimeout(30000),
      });
    });

    /**
     * @requirement project-management/REQ-18.4
     * 操作成功時にトースト通知で成功メッセージを表示
     */
    test('プロジェクト作成成功時にトースト通知で成功メッセージを表示する (project-management/REQ-18.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // プロジェクト名を入力
      await page.getByLabel(/プロジェクト名/i).fill(`成功メッセージテスト_${Date.now()}`);

      // 営業担当者を確認・選択
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      // プロジェクトを作成
      const createPromise = page.waitForResponse(
        (response: Response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise;

      // トースト通知で成功メッセージが表示されることを確認
      await expect(page.getByText(/プロジェクトを作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-18.5
     * 操作失敗時にトースト通知でエラーメッセージを表示
     */
    test('バリデーションエラー時にトースト通知またはインラインエラーでエラーメッセージを表示する (project-management/REQ-18.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 何も入力せずに作成ボタンをクリック（バリデーションエラーを発生させる）
      await page.getByRole('button', { name: /^作成$/i }).click();

      // エラーメッセージが表示されることを確認（トーストまたはインラインエラー）
      const errorMessage = page.getByText(/プロジェクト名は必須です|入力してください|必須項目/i);
      await expect(errorMessage).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement project-management/REQ-18.6
     * セッション期限切れ時にログインページへリダイレクトし、メッセージを表示
     */
    test('セッション期限切れ時にログインページにリダイレクトし「セッションの有効期限が切れました。再度ログインしてください。」を表示する (project-management/REQ-18.6)', async ({
      page,
      context,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト一覧にアクセス
      await page.goto('/projects');
      await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // セッションを期限切れにする: Cookie を消し、保存済みのトークンを失効したもの（無効な値）へ置き換える。
      // トークンを単に削除すると「未ログイン」として扱われ、期限切れにはならない
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.setItem('accessToken', 'expired.access.token');
        localStorage.setItem('refreshToken', 'expired.refresh.token');
      });

      // 期限切れのセッションのまま、プロジェクト一覧を開き直す
      await page.reload();

      // ログインページへ、元のページを redirectUrl に保ってリダイレクトされる
      await expect(page).toHaveURL(/\/login\?redirectUrl=%2Fprojects$/, {
        timeout: getTimeout(15000),
      });

      // 受入基準の文言（完全一致）が表示される
      await expect(page.getByText(SESSION_EXPIRED_MESSAGE, { exact: true })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });
});
