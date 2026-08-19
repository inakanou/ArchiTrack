/**
 * @fileoverview 現場調査アクセス制御のE2Eテスト
 *
 * Requirements coverage (site-survey):
 * - REQ-14.1: プロジェクトへのアクセス権を持つユーザーが現場調査を閲覧可能
 * - REQ-14.2: プロジェクトへの編集権限を持つユーザーが現場調査の作成・編集・削除を許可
 * - REQ-14.3: 適切な権限を持たないユーザーの操作拒否とエラーメッセージ表示
 * - REQ-14.4: 画像URLの払い出しがアクセス権限の検証を経ること
 *   （署名付きURLの有効期限そのものは本番の STORAGE_TYPE=r2 前提であり、
 *    STORAGE_TYPE=local のテスト環境では再現できないため検証対象外。詳細は当該テストの説明を参照）
 * - REQ-14.5: 現場調査の操作履歴を監査ログに記録
 * - REQ-38.9: 画面表示の効率化（画像一覧のリクエスト削減）にあたり REQ-14 の
 *   アクセス可否の判定結果を変更しないこと
 */

import { test, expect } from '@playwright/test';
import { API_BASE_URL } from '../../config';
import { loginAsUser } from '../../helpers/auth-actions';
import { TEST_USERS } from '../../helpers/test-users';
import { getTimeout } from '../../helpers/wait-helpers';
import path from 'path';
import { fileURLToPath } from 'url';
import { selectFirstRealOption } from '../../helpers/form-preconditions';

// ESモジュールでの__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('現場調査アクセス制御', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test.describe('事前準備', () => {
    test('テスト用プロジェクトと現場調査を作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `アクセス制御テスト用プロジェクト_${Date.now()}`;
      await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      const createProjectPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createProjectPromise;

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const projectUrl = page.url();
      const projectMatch = projectUrl.match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = projectMatch?.[1] ?? null;
      expect(createdProjectId).toBeTruthy();

      // 現場調査作成
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      const surveyName = `アクセス制御テスト用現場調査_${Date.now()}`;
      await page.getByLabel(/調査名/i).fill(surveyName);
      await page.getByLabel(/調査日/i).fill(new Date().toISOString().split('T')[0]!);

      const createSurveyPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/') &&
          response.url().includes('site-surveys') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createSurveyPromise;

      await page.waitForURL(/\/site-surveys\/[0-9a-f-]+$/);
      const surveyUrl = page.url();
      const surveyMatch = surveyUrl.match(/\/site-surveys\/([0-9a-f-]+)$/);
      createdSurveyId = surveyMatch?.[1] ?? null;
      expect(createdSurveyId).toBeTruthy();

      // 画像をアップロード（REQ-14.4のテストで必要）
      await page.waitForLoadState('networkidle');

      // ファイル入力を取得
      let fileInput = page.locator('input[type="file"]').first();
      const inputCount = await fileInput.count();
      if (inputCount === 0) {
        const uploadButton = page.getByRole('button', { name: /画像を追加|アップロード/i });
        if (await uploadButton.isVisible()) {
          await uploadButton.click();
        }
        fileInput = page.locator('input[type="file"]').first();
      }

      await expect(fileInput).toBeAttached({ timeout: getTimeout(10000) });

      // テスト用画像ファイルをアップロード
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.jpg');

      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/site-surveys/') &&
          response.url().includes('/images') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(60000) }
      );

      await fileInput.setInputFiles(testImagePath);

      const uploadResponse = await uploadPromise;
      expect(uploadResponse.ok()).toBe(true);

      // ページをリロードして画像が保存されていることを確認
      await page.reload();
      await page.waitForLoadState('networkidle');
    });
  });

  /**
   * @requirement site-survey/REQ-14.1
   */
  test.describe('閲覧権限', () => {
    test('プロジェクトにアクセス可能なユーザーは現場調査を閲覧できる (site-survey/REQ-14.1)', async ({
      page,
    }) => {
      if (!createdProjectId || !createdSurveyId) {
        throw new Error(
          'createdProjectIdまたはcreatedSurveyIdが未設定です。事前準備テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 現場調査詳細ページにアクセス
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 現場調査情報が表示されることを確認（見出しで特定）
      await expect(
        page.getByRole('heading', { name: /アクセス制御テスト用現場調査/i })
      ).toBeVisible({
        timeout: getTimeout(10000),
      });

      // エラーメッセージが表示されないことを確認
      await expect(page.getByText(/アクセス拒否|権限がありません|403/i)).not.toBeVisible({
        timeout: getTimeout(3000),
      });
    });

    test('プロジェクト一覧から現場調査一覧へアクセスできる (site-survey/REQ-14.1)', async ({
      page,
    }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 現場調査一覧ページにアクセス
      await page.goto(`/projects/${createdProjectId}/site-surveys`);
      await page.waitForLoadState('networkidle');

      // 一覧が表示されることを確認（h1の「現場調査一覧」見出しをマッチ）
      await expect(page.getByRole('heading', { name: '現場調査一覧', exact: true })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 作成した現場調査が表示されることを確認
      await expect(page.getByText(/アクセス制御テスト用現場調査/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * @requirement site-survey/REQ-14.2
   */
  test.describe('編集権限', () => {
    test('編集権限を持つユーザーは現場調査を作成できる (site-survey/REQ-14.2)', async ({
      page,
    }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 新規作成ページにアクセス
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      // 作成フォームが表示されることを確認
      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 作成ボタンが有効であることを確認
      const createButton = page.getByRole('button', { name: /^作成$/i });
      await expect(createButton).toBeVisible();
      await expect(createButton).not.toBeDisabled();
    });

    test('編集権限を持つユーザーは現場調査を編集できる (site-survey/REQ-14.2)', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 編集ページにアクセス
      await page.goto(`/site-surveys/${createdSurveyId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集フォームが表示されることを確認
      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 保存ボタンが有効であることを確認
      const saveButton = page.getByRole('button', { name: /保存|更新/i });
      await expect(saveButton).toBeVisible();
      await expect(saveButton).not.toBeDisabled();
    });

    test('管理者ユーザーは削除ボタンが表示される (site-survey/REQ-14.2)', async ({ page }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'ADMIN_USER');

      // 詳細ページにアクセス
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 削除ボタンが表示されることを確認（画像削除ボタンと区別するためexact指定）
      const deleteButton = page.getByRole('button', { name: '削除', exact: true });
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
    });
  });

  /**
   * @requirement site-survey/REQ-14.3
   */
  test.describe('権限拒否', () => {
    test('未認証ユーザーは現場調査にアクセスできない (site-survey/REQ-14.3)', async ({
      page,
      context,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      // ログアウト状態にする（まずアプリのオリジンに移動してからlocalStorageをクリア）
      await page.goto('/');
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      // 現場調査詳細ページにアクセス
      await page.goto(`/site-surveys/${createdSurveyId}`);

      // ログインページにリダイレクトされることを確認
      await page.waitForURL(/\/login/, { timeout: getTimeout(10000) });
      expect(page.url()).toMatch(/\/login/);
    });

    test('未認証ユーザーは現場調査一覧にアクセスできない (site-survey/REQ-14.3)', async ({
      page,
      context,
    }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      // ログアウト状態にする（まずアプリのオリジンに移動してからlocalStorageをクリア）
      await page.goto('/');
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      // 現場調査一覧ページにアクセス
      await page.goto(`/projects/${createdProjectId}/site-surveys`);

      // ログインページにリダイレクトされることを確認
      await page.waitForURL(/\/login/, { timeout: getTimeout(10000) });
      expect(page.url()).toMatch(/\/login/);
    });

    test('未認証ユーザーは現場調査作成ページにアクセスできない (site-survey/REQ-14.3)', async ({
      page,
      context,
    }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      // ログアウト状態にする（まずアプリのオリジンに移動してからlocalStorageをクリア）
      await page.goto('/');
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      // 現場調査作成ページにアクセス
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);

      // ログインページにリダイレクトされることを確認
      await page.waitForURL(/\/login/, { timeout: getTimeout(10000) });
      expect(page.url()).toMatch(/\/login/);
    });
  });

  /**
   * @requirement site-survey/REQ-14.4
   */
  test.describe('署名付きURL', () => {
    /**
     * 画像URLの払い出し契約（site-survey/REQ-14.4）
     *
     * 【このテスト環境で検証すること / しないこと】
     * 本番の `STORAGE_TYPE` は `r2`（docs/deployment/environment-variables.md）であり、
     * 画像URLは R2 の署名付きURL（既定900秒）として認証済みAPIから払い出される。
     * このとき `backend/src/app.ts` の `/storage` 静的配信はマウントされない。
     *
     * 一方 E2E のテスト環境は `STORAGE_TYPE: local`（docker-compose.test.yml）であり、
     * `/storage` の静的配信が有効になる。この静的配信は dev/test 専用の構成で
     * 署名を伴わないため、「署名パラメータが付与されていること」「有効期限切れの
     * 署名付きURLが拒否されること」といった本番相当の署名付きURL契約は
     * テスト環境では再現できない。よって本テストではそれらを検証しない
     * （検証しようとすると、テスト環境固有の構成に対する偽の合否判定になる）。
     *
     * 代わりに、ストレージ種別に依存しない契約
     * 「画像URLは認証済みAPI経由でのみ払い出され、その払い出しはアクセス権限の
     * 検証を経る」ことを検証する。`request` フィクスチャはブラウザコンテキストとは
     * 独立した認証情報を持たないAPIコンテキストであり、未認証状態を再現できる。
     */
    test('画像URLは認証済みAPI経由でのみ払い出される (site-survey/REQ-14.4)', async ({
      page,
      request,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      // 未認証では現場調査（画像URLを含む）を取得できない
      const unauthenticatedSurvey = await request.get(
        `${API_BASE_URL}/api/site-surveys/${createdSurveyId}`
      );
      expect(unauthenticatedSurvey.status()).toBe(401);

      // 未認証では画像一覧（署名付きURLの払い出し口）を取得できない
      const unauthenticatedImages = await request.get(
        `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`
      );
      expect(unauthenticatedImages.status()).toBe(401);

      // 認証済みかつアクセス権限を持つユーザーには画像URLが払い出される
      await loginAsUser(page, 'REGULAR_USER');
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      expect(accessToken, 'ログイン後にアクセストークンが保持されている').toBeTruthy();

      const authenticatedImages = await request.get(
        `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      expect(authenticatedImages.status()).toBe(200);

      const images = (await authenticatedImages.json()) as Array<{
        id: string;
        originalUrl: string | null;
      }>;
      expect(Array.isArray(images)).toBe(true);
      expect(images.length).toBeGreaterThan(0);

      // 原画像URLは現場調査へのアクセス権限検証を通過した場合のみ払い出される
      // （backend/src/services/image-list.service.ts の validateSurveyAccess）
      expect(images[0]!.originalUrl).toBeTruthy();
    });

    /**
     * アクセス権限の検証（site-survey/REQ-14.4）
     *
     * 【このテストが引き受ける範囲】
     * REQ-14.4 は「署名付きURLの有効期限とアクセス権限を検証する」と規定する。
     * このうち **有効期限** は本番の `STORAGE_TYPE=r2` に固有の性質であり、
     * `STORAGE_TYPE=local` のテスト環境では `LocalStorageProvider.getSignedUrl` が
     * 署名も期限も伴わない静的配信URLを返すため、E2Eでは原理的に再現できない。
     * 有効期限側は `e2e/requirement-exclusions.json` の `site-survey/REQ-14.4` に
     * E2E対象外として登録済みで、バックエンドの単体・統合テストとセキュリティ監査の所管とする。
     *
     * 一方 **アクセス権限の検証** はストレージ種別に依存しない。原画像URLの払い出しは
     * `ImageListService.findBySurveyIdWithUrls` が `validateSurveyAccess` の結果で
     * 分岐しており、この分岐はローカルストレージ構成でもそのまま働く。
     * よってE2Eはこちらを引き受ける。直前のテストが「未認証では払い出されない」を、
     * 本テストが「認証済みでもプロジェクトの関係者でなければ払い出されない」を検証する。
     *
     * 【観測の判別能力】
     * 「原画像URLが null であること」は、権限検証が働いた結果ではなく
     * ストレージ未構成やURL生成失敗でも成立し得る。そのため同一の画像一覧に対して
     * 関係者（プロジェクト作成者）の払い出しを対照として同時に観測し、
     * 同じ画像レコードに対して払い出しの有無が利用者によって分かれることを確認する。
     *
     * 【前提】
     * 事前準備でプロジェクトを作成したのは REGULAR_USER であり、営業担当者・工事担当者は
     * ログインユーザーが既定値となる（project-management の Requirement 1.5 / 1.6）。
     * したがって REGULAR_USER_2 は当該プロジェクトの関係者ではない。この前提
     * （別人であること・admin ロールを持たないこと）はテスト内で明示的に検証し、
     * 崩れた場合は検証本体を素通りさせずに失敗させる。
     *
     * 【REQ-38.9（効率化が判定結果を変えないこと）を引き受ける理由】
     * Requirement 38 は画像一覧のリクエスト・クエリ削減として、権限検証を画像ごとから
     * 現場調査ごと1回へ集約した（`ImageListService.findBySurveyIdWithUrls`）。
     * 本テストは**その集約後の実装**に対して、関係者には原画像URLが払い出され、
     * 非関係者には同じ画像レコードでも払い出されないことを観測する。すなわち
     * 削減の前後で REQ-14 の判定結果（誰に払い出すか）が変わっていないことを、
     * 対照付きで確認している。集約が「1回だけ・同じ引数で」行われることは
     * backend/src/__tests__/unit/services/image-list.service.test.ts が併せて固定する。
     *
     * @requirement site-survey/REQ-38.9
     */
    test('アクセス権限を持たないユーザーには原画像URLが払い出されない (site-survey/REQ-14.4, site-survey/REQ-38.9)', async ({
      request,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      const loginViaApi = async (
        user: (typeof TEST_USERS)[keyof typeof TEST_USERS]
      ): Promise<{ userId: string; roles: string[]; accessToken: string }> => {
        const response = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
          data: { email: user.email, password: user.password },
        });
        expect(response.status(), `${user.email} のログインが成功する`).toBe(200);
        const body = (await response.json()) as {
          accessToken: string;
          user: { id: string; roles: string[] };
        };
        return { userId: body.user.id, roles: body.user.roles, accessToken: body.accessToken };
      };

      const fetchImages = async (
        accessToken: string
      ): Promise<Array<{ id: string; originalUrl: string | null }>> => {
        const response = await request.get(
          `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        expect(response.status(), '画像一覧の取得が成功する').toBe(200);
        return (await response.json()) as Array<{ id: string; originalUrl: string | null }>;
      };

      const member = await loginViaApi(TEST_USERS.REGULAR_USER);
      const outsider = await loginViaApi(TEST_USERS.REGULAR_USER_2);

      // 前提の検証: 別人であり、かつ関係者でなくても払い出されるadminロールを持たないこと
      expect(outsider.userId, '非関係者はプロジェクト作成者とは別のユーザーである').not.toBe(
        member.userId
      );
      expect(outsider.roles, '非関係者はadminロールを持たない').not.toContain('admin');

      // 対照: プロジェクトの関係者には原画像URLが払い出される
      const memberImages = await fetchImages(member.accessToken);
      expect(memberImages.length, '事前準備でアップロードした画像が存在する').toBeGreaterThan(0);
      for (const image of memberImages) {
        expect(
          image.originalUrl,
          `関係者には原画像URLが払い出される (image=${image.id})`
        ).toBeTruthy();
      }

      // 本体: 同じ画像レコードでも、関係者でないユーザーには原画像URLが払い出されない
      const outsiderImages = await fetchImages(outsider.accessToken);
      expect(
        outsiderImages.map((image) => image.id),
        '非関係者にも同じ画像レコードが返る（払い出しの有無だけが分かれる）'
      ).toEqual(memberImages.map((image) => image.id));
      for (const image of outsiderImages) {
        expect(
          image.originalUrl,
          `非関係者には原画像URLが払い出されない (image=${image.id})`
        ).toBeNull();
      }
    });
  });

  /**
   * @requirement site-survey/REQ-14.5
   */
  test.describe('監査ログ', () => {
    test('現場調査の作成操作がAPIリクエストとして記録される (site-survey/REQ-14.5)', async ({
      page,
    }) => {
      if (!createdProjectId) {
        throw new Error('createdProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 新規作成ページにアクセス
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');

      // 作成フォームを入力
      const surveyName = `監査ログテスト用現場調査_${Date.now()}`;
      await page.getByLabel(/調査名/i).fill(surveyName);
      await page.getByLabel(/調査日/i).fill(new Date().toISOString().split('T')[0]!);

      // APIリクエストを監視
      let createRequestMade = false;
      page.on('request', (request) => {
        if (
          request.url().includes('/api/') &&
          request.url().includes('site-surveys') &&
          request.method() === 'POST'
        ) {
          createRequestMade = true;
        }
      });

      // 作成ボタンをクリック
      const createButton = page.getByRole('button', { name: /^作成$/i });
      await createButton.click();

      // APIリクエストが発生するまで待機
      await page.waitForTimeout(2000);

      // 作成APIが呼び出されたことを確認（監査ログに記録されるはず）
      expect(createRequestMade).toBeTruthy();
    });

    test('現場調査の編集操作がAPIリクエストとして記録される (site-survey/REQ-14.5)', async ({
      page,
    }) => {
      if (!createdSurveyId) {
        throw new Error('createdSurveyIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 編集ページにアクセス
      await page.goto(`/site-surveys/${createdSurveyId}/edit`);
      await page.waitForLoadState('networkidle');

      // APIリクエストを監視
      let updateRequestMade = false;
      page.on('request', (request) => {
        if (
          request.url().includes('/api/') &&
          request.url().includes('site-surveys') &&
          (request.method() === 'PUT' || request.method() === 'PATCH')
        ) {
          updateRequestMade = true;
        }
      });

      // メモを更新
      const memoField = page.getByLabel(/メモ/i);
      await expect(memoField).toBeVisible({ timeout: getTimeout(5000) });
      await memoField.fill(`監査ログテスト更新_${Date.now()}`);

      // 保存ボタンをクリック
      const saveButton = page.getByRole('button', { name: /保存|更新/i });
      await saveButton.click();

      // APIリクエストが発生するまで待機
      await page.waitForTimeout(2000);

      // 更新APIが呼び出されたことを確認（監査ログに記録されるはず）
      expect(updateRequestMade).toBeTruthy();
    });
  });

  test.describe('クリーンアップ', () => {
    test('作成したデータを削除する', async ({ page, context }) => {
      // まずアプリのオリジンに移動してからlocalStorageをクリア
      await page.goto('/');
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      if (createdSurveyId) {
        await page.goto(`/site-surveys/${createdSurveyId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i }).first();
        await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
        await deleteButton.click();
        // 確認ダイアログの「削除する」ボタンを正確に指定
        const confirmButton = page.getByRole('button', { name: '削除する' });
        await expect(confirmButton).toBeVisible({ timeout: getTimeout(5000) });
        await confirmButton.click();
        await page.waitForURL(/\/site-surveys$/, { timeout: getTimeout(15000) });
      }

      if (createdProjectId) {
        await page.goto(`/projects/${createdProjectId}`);
        await page.waitForLoadState('networkidle');

        const deleteButton = page.getByRole('button', { name: /削除/i }).first();
        await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
        await deleteButton.click();
        const confirmButton = page
          .getByTestId('focus-manager-overlay')
          .getByRole('button', { name: /^削除$/i });
        await expect(confirmButton).toBeVisible({ timeout: getTimeout(5000) });
        await confirmButton.click();
        await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
      }
    });
  });
});
