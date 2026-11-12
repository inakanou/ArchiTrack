/**
 * @fileoverview 現場調査アクセス制御のE2Eテスト
 *
 * Requirements coverage (site-survey):
 * - REQ-14.1: プロジェクトへのアクセス権を持つユーザーが現場調査を閲覧可能
 * - REQ-14.2: プロジェクトへの編集権限を持つユーザーが現場調査の作成・編集・削除を許可
 * - REQ-14.3: 適切な権限を持たないユーザーの操作拒否とエラーメッセージ表示
 * - REQ-38.9: 画面表示の効率化（画像一覧のリクエスト削減）にあたり、表示元URLを発行するか否かを
 *   Requirement 39 の案件の閲覧範囲の判定の結果から変更しないこと（2026-10-27 改訂。タスク119.1）
 *
 * 除外のため被覆印を掲げない受入基準（e2e/requirement-exclusions.json）:
 *   要件14.4: アクセス権限の側は主張するが、署名付きURLの有効期限を主張していない
 *   要件14.5: APIリクエストが発生したことを主張するもので、監査ログへの記録を主張していない
 */

import { test, expect } from '@playwright/test';
import { API_BASE_URL } from '../../config';
import { loginAsUser } from '../../helpers/auth-actions';
import { assertPrepared } from '../../helpers/preconditions';
import { getTimeout } from '../../helpers/wait-helpers';
import path from 'path';
import { fileURLToPath } from 'url';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { getAccessToken, loginViaApi, type AuthUserRef } from '../../helpers/auth-api';

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

      // 接尾辞は 36 進にして長い数字の列を作らない。数字の列は「403」等の文言の探索に偶然当たりうる
      // （Task 117.1）。下の否定の確認は名前に依存しない表示領域で行う
      const projectName = `アクセス制御テスト用プロジェクト_${Date.now().toString(36)}`;
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

      const surveyName = `アクセス制御テスト用現場調査_${Date.now().toString(36)}`;
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

      // エラーの表示領域（role="alert"）が出ていないことを確認する。
      // この画面は権限不足（403）を含む取得の失敗を role="alert" の領域へ出す
      // （SiteSurveyDetailPage のエラー表示。本文はサーバーのエラーコード等）。
      // 文言の正規表現でページ全体を探すと、テストデータの名前（パンくず等）に偶然当たり
      // strict mode violation で落ちる（Task 117.1）ため、表示領域へ絞り、文言を問わず
      // 「出ていないこと」を主張する。なお 403 の実際の表示の本文は「FORBIDDEN」であり、
      // 旧来の文言の探索（アクセス拒否|権限がありません|403）には当たっていなかった。
      await expect(page.getByRole('alert')).toHaveCount(0, {
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
   * 受入基準 14.4 は除外である（e2e/requirement-exclusions.json）。アクセス権限の側は主張するが、署名付きURLの有効期限を主張していないため、被覆印は掲げない。
   */
  test.describe('署名付きURL', () => {
    /**
     * 画像URLの払い出し契約（要件14.4）
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
    test('画像URLは認証済みAPI経由でのみ払い出される', async ({ page, request }) => {
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
      const accessToken = await getAccessToken(page, 'REGULAR_USER');
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
     * 閲覧範囲の判定（要件14.4、改訂後の要件38.9）
     *
     * 【このテストが引き受ける範囲】
     * REQ-14.4 は「署名付きURLの有効期限と、画像が属するプロジェクトがユーザーの閲覧範囲に含まれることを
     * 検証する」と規定する。このうち **有効期限** は本番の `STORAGE_TYPE=r2` に固有の性質であり、
     * `STORAGE_TYPE=local` のテスト環境では `LocalStorageProvider.getSignedUrl` が署名も期限も伴わない
     * 静的配信URLを返すため、E2Eでは原理的に再現できない。有効期限側は `e2e/requirement-exclusions.json`
     * の当該の除外（要件14.4）に E2E対象外として登録済みで、バックエンドの単体・統合テストと
     * セキュリティ監査の所管とする。
     *
     * 一方 **閲覧範囲の判定** はストレージ種別に依存しない。画像一覧の経路は案件の閲覧範囲の判定部品
     * （requireProjectScope）を経て、範囲外を存在しない現場調査と同じ 404 にし、表示元URLを一つも
     * 発行しない（site-survey タスク119.1、Requirement 39.2・39.6）。
     *
     * 【観測の判別能力】
     * 「表示元URLが返らないこと」は、判定が働いた結果ではなくストレージ未構成やURL生成失敗でも
     * 成立し得る。そのため同じ現場調査の画像一覧に対して関係者（プロジェクト作成者）の払い出しを
     * 対照として同時に観測し、利用者によって払い出しの有無が分かれることを確認する。さらに、
     * 範囲外の応答の本文が存在しない現場調査の応答の本文と（要求の経路を写す `instance` を除いて）
     * 一致することを確かめ、範囲外であることを推測させないことを主張する。
     *
     * 【前提】
     * 事前準備でプロジェクトを作成したのは REGULAR_USER であり、営業担当者は選択肢の先頭の利用者、
     * 工事担当者は未設定である。REGULAR_USER_2 が営業担当者に選ばれている場合や全案件閲覧の権限
     * （project:read_all）を持つ場合は範囲内になるため、この前提（別人であり、管理者ロールを持たず、
     * 営業担当者・工事担当者・作成者のいずれでもないこと）はテスト内で明示的に検証し、崩れた場合は
     * 検証本体を素通りさせずに失敗させる。
     *
     * 【改訂後の REQ-38.9（効率化が判定結果を変えないこと）を引き受ける理由】
     * Requirement 38 は画像一覧のリクエスト・クエリ削減として、判定を画像ごとから現場調査ごと1回へ
     * 集約した（`ImageListService.findBySurveyIdWithUrls`）。本テストは**その集約後の実装**に対して、
     * 関係者には原画像・サムネイルの表示元URLが払い出され、閲覧範囲外の利用者には同じ現場調査でも
     * どの表示元URLも払い出されないことを観測する。改訂前の本テストは、範囲外の利用者の画像一覧が
     * 200 で原画像のURLだけが空になることを主張していた（サムネイルは判定を経ずに発行していた）。
     * 改訂後の条文（判定の元は Requirement 39 の閲覧範囲、範囲外には 3 種のURLを発行しない）に合わせ、
     * 404 でURLが一つも返らない主張へ改めた（user-authentication の tasks.md の Implementation Notes の
     * 52.2 の区分 C）。
     *
     * @requirement site-survey/REQ-38.9
     */
    test('閲覧範囲外のユーザーには画像の表示元URLが払い出されない (site-survey/REQ-38.9)', async ({
      request,
    }) => {
      if (!createdSurveyId || !createdProjectId) {
        throw new Error(
          'createdProjectIdまたはcreatedSurveyIdが未設定です。事前準備テストが正しく実行されていません。'
        );
      }

      const loginAs = async (
        user: AuthUserRef
      ): Promise<{ userId: string; roles: string[]; accessToken: string }> => {
        const body = await loginViaApi(request, user);
        return { userId: body.user.id, roles: body.user.roles, accessToken: body.accessToken };
      };

      const fetchImages = (accessToken: string, surveyId: string) =>
        request.get(`${API_BASE_URL}/api/site-surveys/${surveyId}/images`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

      const member = await loginAs('REGULAR_USER');
      const outsider = await loginAs('REGULAR_USER_2');

      // 前提の検証: 別人であり、管理者ロールを持たず、案件の関係者でないこと
      expect(outsider.userId, '非関係者はプロジェクト作成者とは別のユーザーである').not.toBe(
        member.userId
      );
      expect(outsider.roles, '非関係者は管理者ロールを持たない').not.toContain('admin');
      const projectResponse = await request.get(
        `${API_BASE_URL}/api/projects/${createdProjectId}`,
        { headers: { Authorization: `Bearer ${member.accessToken}` } }
      );
      expect(projectResponse.status(), '作成者はプロジェクトを取得できる').toBe(200);
      const project = (await projectResponse.json()) as {
        salesPerson?: { id: string } | null;
        constructionPerson?: { id: string } | null;
      };
      expect(project.salesPerson?.id, '非関係者は営業担当者ではない').not.toBe(outsider.userId);
      expect(project.constructionPerson?.id ?? null, '非関係者は工事担当者ではない').not.toBe(
        outsider.userId
      );

      // 対照: プロジェクトの関係者には原画像・サムネイルの表示元URLが払い出される
      const memberResponse = await fetchImages(member.accessToken, createdSurveyId);
      expect(memberResponse.status(), '関係者の画像一覧の取得が成功する').toBe(200);
      const memberImages = (await memberResponse.json()) as Array<{
        id: string;
        originalUrl: string | null;
        thumbnailUrl: string | null;
      }>;
      expect(memberImages.length, '事前準備でアップロードした画像が存在する').toBeGreaterThan(0);
      for (const image of memberImages) {
        expect(
          image.originalUrl,
          `関係者には原画像URLが払い出される (image=${image.id})`
        ).toBeTruthy();
        expect(
          image.thumbnailUrl,
          `関係者にはサムネイルURLが払い出される (image=${image.id})`
        ).toBeTruthy();
      }

      // 本体: 同じ現場調査でも、閲覧範囲外のユーザーには存在しない現場調査と同じ 404 が返り、
      // どの表示元URLも払い出されない
      const missingResponse = await fetchImages(
        outsider.accessToken,
        '00000000-0000-4000-8000-000000038900'
      );
      const outsiderResponse = await fetchImages(outsider.accessToken, createdSurveyId);
      expect(missingResponse.status(), '存在しない現場調査の画像一覧は 404').toBe(404);
      expect(outsiderResponse.status(), '閲覧範囲外の画像一覧は 404').toBe(404);
      const withoutInstance = (body: Record<string, unknown>) => {
        return Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'instance'));
      };
      const outsiderBody = (await outsiderResponse.json()) as Record<string, unknown>;
      expect(
        withoutInstance(outsiderBody),
        '範囲外の本文は存在しない現場調査の本文と区別できない'
      ).toEqual(withoutInstance((await missingResponse.json()) as Record<string, unknown>));
      const exposed = JSON.stringify(outsiderBody);
      for (const image of memberImages) {
        expect(exposed, '範囲外の応答に画像のIDを含めない').not.toContain(image.id);
      }
      expect(exposed, '範囲外の応答に表示元URLを含めない').not.toContain('/storage');
      expect(exposed, '範囲外の応答にプロジェクトIDを含めない').not.toContain(createdProjectId);
    });
  });

  /**
   * 受入基準 14.5 は除外である（e2e/requirement-exclusions.json）。APIリクエストが発生したことを主張するもので、監査ログへの記録を主張していないため、被覆印は掲げない。
   */
  test.describe('監査ログ', () => {
    test('現場調査の作成操作がAPIリクエストとして記録される', async ({ page }) => {
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

    test('現場調査の編集操作がAPIリクエストとして記録される', async ({ page }) => {
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

      assertPrepared(createdSurveyId, '事前準備で作成した現場調査のID');
      await page.goto(`/site-surveys/${createdSurveyId}`);
      await page.waitForLoadState('networkidle');

      const surveyDeleteButton = page.getByRole('button', { name: /削除/i }).first();
      await expect(surveyDeleteButton).toBeVisible({ timeout: getTimeout(10000) });
      await surveyDeleteButton.click();
      // 確認ダイアログの「削除する」ボタンを正確に指定
      const surveyConfirmButton = page.getByRole('button', { name: '削除する' });
      await expect(surveyConfirmButton).toBeVisible({ timeout: getTimeout(5000) });
      await surveyConfirmButton.click();
      await page.waitForURL(/\/site-surveys$/, { timeout: getTimeout(15000) });

      assertPrepared(createdProjectId, '事前準備で作成したプロジェクトのID');
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      const projectDeleteButton = page.getByRole('button', { name: /削除/i }).first();
      await expect(projectDeleteButton).toBeVisible({ timeout: getTimeout(10000) });
      await projectDeleteButton.click();
      // 関連データがあるプロジェクトでは確定ボタンが「削除する」になる（REQ-9.5）
      const projectConfirmButton = page
        .getByTestId('focus-manager-overlay')
        .getByRole('button', { name: /^削除(する)?$/i });
      await expect(projectConfirmButton).toBeVisible({ timeout: getTimeout(5000) });
      await projectConfirmButton.click();
      await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
    });
  });
});
