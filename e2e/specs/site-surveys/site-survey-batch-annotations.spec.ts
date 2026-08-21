/**
 * @fileoverview 現場調査 バッチ注釈取得のE2Eテスト
 *
 * Task 43.5: E2Eテストを追加する
 *
 * Requirements coverage (site-survey):
 * - REQ-18.1: 一括注釈取得エンドポイント（バッチAPI）の提供
 * - REQ-18.2: PDF報告書出力時にバッチ注釈取得エンドポイントを使用
 * - REQ-18.3: 全画像IDの注釈データをまとめて返却
 * - REQ-18.4: 存在しないimageIDに空の注釈データ返却
 * - REQ-18.5: APIリクエスト数の大幅削減
 * - REQ-18.6: アクセス権限検証
 * - REQ-18.7: エラー時のメッセージ表示
 * - REQ-18.8: 個別エンドポイントとのレスポンス互換性
 *
 * テスト内容:
 * - PDF報告書出力フローでバッチ注釈取得エンドポイントが使用されること
 * - バッチ取得後にPDF報告書が正常に生成・ダウンロードされること
 * - リクエスト数がN回から1回に削減されていること
 * - 存在しないimageIDに空の注釈データが返却されること
 * - エラー時のメッセージ表示
 * - 個別エンドポイントとのレスポンス互換性
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { assertPrepared } from '../../helpers/preconditions';

// ESモジュールでの__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('現場調査 バッチ注釈取得（要件18）', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  let sharedPage: Page;
  let sharedContext: BrowserContext;
  let accessToken: string | null = null;
  /** 事前準備で注釈を保存した画像のID（REQ-18.3 / REQ-18.8 の前提） */
  let annotatedImageId: string | null = null;

  /** 認証ヘッダーを返すヘルパー */
  function getAuthHeaders(): Record<string, string> {
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  }

  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext();
    sharedPage = await sharedContext.newPage();

    await loginAsUser(sharedPage, 'REGULAR_USER');

    // プロジェクト作成
    await sharedPage.goto('/projects');
    await sharedPage.waitForLoadState('networkidle');

    await sharedPage.getByRole('button', { name: /新規作成/i }).click();
    await expect(sharedPage).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

    await expect(sharedPage.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    const projectName = `バッチ注釈テスト用プロジェクト_${Date.now()}`;
    await sharedPage.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

    const salesPersonSelect = sharedPage.locator('select[aria-label="営業担当者"]');
    await selectFirstRealOption(salesPersonSelect, '営業担当者');

    await sharedPage.getByRole('button', { name: /保存|作成|登録/i }).click();

    await sharedPage.waitForURL(/\/projects\/(?!new)/, { timeout: getTimeout(15000) });
    const url = sharedPage.url();
    const projectMatch = url.match(/\/projects\/([^/]+)/);
    createdProjectId = projectMatch?.[1] ?? null;
    expect(createdProjectId).toBeTruthy();

    // 現場調査作成
    await sharedPage.goto(`/projects/${createdProjectId}/site-surveys/new`);
    await sharedPage.waitForLoadState('networkidle');

    const surveyName = `バッチ注釈テスト調査_${Date.now()}`;
    const nameInput = sharedPage.getByRole('textbox', { name: /調査名|現場調査名/i });
    if (await isVisibleWithin(nameInput, getTimeout(5000))) {
      await nameInput.clear();
      await nameInput.fill(surveyName);
    }

    await sharedPage.getByRole('button', { name: /保存|作成|登録/i }).click();
    await sharedPage.waitForURL(/\/site-surveys\/(?!new)/, { timeout: getTimeout(15000) });

    const surveyUrl = sharedPage.url();
    const surveyMatch = surveyUrl.match(/\/site-surveys\/([^/]+)/);
    createdSurveyId = surveyMatch?.[1] ?? null;
    expect(createdSurveyId).toBeTruthy();

    // API直接呼び出し用のアクセストークンを取得
    accessToken = await sharedPage.evaluate(() => localStorage.getItem('accessToken'));

    // テスト画像をAPI経由でアップロード（2枚）
    const testImagePath = path.join(__dirname, '../../fixtures/test-image.jpg');
    expect(fs.existsSync(testImagePath)).toBeTruthy();
    const imageBuffer = fs.readFileSync(testImagePath);

    for (let i = 0; i < 2; i++) {
      const uploadResponse = await sharedPage.request.post(
        `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
        {
          headers: getAuthHeaders(),
          multipart: {
            images: {
              name: `test-image-${i + 1}.jpg`,
              mimeType: 'image/jpeg',
              buffer: imageBuffer,
            },
          },
        }
      );
      // 画像の存在は後続テストの前提であり、失敗した場合はテストを飛ばさず失敗させる
      expect(uploadResponse.ok()).toBeTruthy();
    }

    // 1枚目にだけ注釈を保存する（Task 115.127 段6）。
    // REQ-18.3（注釈のある画像は AnnotationInfo が返る）と
    // REQ-18.4（注釈の無い画像は空が返る）の双方を、観測で分岐せずに主張するための前提。
    // 前提を用意しないと注釈は 1 件も存在せず、AnnotationInfo の形の検証は
    // 「注釈があれば検証する」という決して成立しない関門の内側で眠り続ける。
    const imagesForAnnotation = await sharedPage.request.get(
      `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
      { headers: getAuthHeaders() }
    );
    expect(imagesForAnnotation.ok(), '事前準備の画像一覧取得が失敗した').toBeTruthy();

    const uploadedImages = (await imagesForAnnotation.json()) as { id: string }[];
    expect(uploadedImages.length, '事前準備でアップロードした画像が取得できない').toBe(2);
    annotatedImageId = uploadedImages[0]!.id;

    const saveAnnotationResponse = await sharedPage.request.put(
      `${API_BASE_URL}/api/site-surveys/images/${annotatedImageId}/annotations`,
      {
        headers: getAuthHeaders(),
        data: {
          data: {
            version: '6.0.0',
            objects: [
              {
                type: 'rect',
                left: 10,
                top: 10,
                width: 20,
                height: 20,
              },
            ],
          },
        },
      }
    );
    expect(saveAnnotationResponse.ok(), '事前準備の注釈保存が失敗した').toBeTruthy();
  });

  test.afterAll(async () => {
    if (sharedContext) {
      await sharedContext.close();
    }
  });

  // ============================================================================
  // バッチ注釈取得E2Eテスト
  // ============================================================================

  /**
   * @requirement site-survey/REQ-18.1
   * @requirement site-survey/REQ-18.2
   * @requirement site-survey/REQ-18.5
   */
  test('PDF報告書出力時にバッチ注釈取得エンドポイントが使用される (site-survey/REQ-18.1, site-survey/REQ-18.2, site-survey/REQ-18.5)', async () => {
    expect(createdSurveyId).toBeTruthy();

    // ネットワークリクエストを監視
    const batchRequests: string[] = [];
    const individualAnnotationRequests: string[] = [];

    sharedPage.on('request', (request) => {
      const url = request.url();
      if (url.includes('/annotations/batch')) {
        batchRequests.push(url);
      }
      if (url.match(/\/images\/[^/]+\/annotations$/) && request.method() === 'GET') {
        individualAnnotationRequests.push(url);
      }
    });

    // 現場調査詳細画面に移動
    await sharedPage.goto(`/site-surveys/${createdSurveyId}`);
    await sharedPage.waitForLoadState('networkidle');

    // 報告書出力フラグをONにする（画像がある場合）
    const reportCheckboxes = sharedPage.locator('input[type="checkbox"]');
    const checkboxCount = await reportCheckboxes.count();
    for (let i = 0; i < checkboxCount; i++) {
      const checkbox = reportCheckboxes.nth(i);
      if (await checkbox.isVisible()) {
        const isChecked = await checkbox.isChecked();
        if (!isChecked) {
          await checkbox.click();
        }
      }
    }

    // 保存ボタンがあればクリック
    const saveButton = sharedPage.getByRole('button', { name: /保存/i });
    if (await isVisibleWithin(saveButton, getTimeout(3000))) {
      await saveButton.click();
      await sharedPage.waitForTimeout(getTimeout(2000));
    }

    // PDF報告書出力ボタンをクリック
    // 注: 一括エクスポートボタン（bulk-export-*）はバッチ注釈取得（REQ-18）の対象外のため、
    // 調査報告書出力ボタンに限定して特定する
    const exportButton = sharedPage.getByRole('button', {
      name: '調査報告書出力',
    });

    await expect(exportButton).toBeVisible({ timeout: getTimeout(5000) });

    // ダウンロードイベントを待機
    const downloadPromise = sharedPage.waitForEvent('download', {
      timeout: getTimeout(30000),
    });

    // 観測の対象を「調査報告書出力ボタンを押して以降」に限る。
    // REQ-18.2 は「調査報告書出力ボタンを押したとき」の取得経路を、
    // REQ-18.5 は「PDF報告書出力時」の合計リクエスト数を定めており、
    // いずれも画面表示中の取得は対象外である。
    // 画面表示では注釈付きサムネイルの合成（AnnotatedImageThumbnail）が
    // 注釈のある画像について個別の注釈取得を行うことがあり
    // （サーバ生成の注釈付きサムネイルが無い場合のフォールバック。
    // frontend/src/components/site-surveys/AnnotatedImageThumbnail.tsx:184）、
    // これを数えると出力経路とは無関係の理由で判定が動く。
    await sharedPage.waitForLoadState('networkidle');
    batchRequests.length = 0;
    individualAnnotationRequests.length = 0;

    await exportButton.click();

    const download = await downloadPromise;
    expect(download).toBeTruthy();

    // バッチ注釈取得エンドポイントが使用されたことを確認（REQ-18.1, REQ-18.2）
    expect(batchRequests.length).toBeGreaterThanOrEqual(1);

    // 個別注釈取得リクエストがバッチ取得後に発生しないことを確認（REQ-18.5）
    // バッチ取得成功時は個別リクエストが0件であるべき
    expect(individualAnnotationRequests.length).toBe(0);
  });

  /**
   * @requirement site-survey/REQ-18.1
   * @requirement site-survey/REQ-18.3
   */
  test('バッチ注釈取得APIに直接アクセスして正常にレスポンスが返る (site-survey/REQ-18.1, site-survey/REQ-18.3)', async () => {
    expect(createdSurveyId).toBeTruthy();

    // 現場調査の画像一覧を取得
    const imagesResponse = await sharedPage.request.get(
      `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
      { headers: getAuthHeaders() }
    );

    expect(imagesResponse.ok()).toBeTruthy();

    const images = await imagesResponse.json();
    const imageIds = (images as { id: string }[]).map((img) => img.id);

    // 画像は beforeAll でアップロード済みであることが前提
    expect(imageIds.length).toBeGreaterThan(0);

    // バッチ注釈取得APIを呼び出し
    const batchResponse = await sharedPage.request.post(
      `${API_BASE_URL}/api/site-surveys/annotations/batch`,
      {
        headers: getAuthHeaders(),
        data: {
          surveyId: createdSurveyId,
          imageIds: imageIds,
        },
      }
    );

    expect(batchResponse.ok()).toBeTruthy();

    const batchData = await batchResponse.json();
    expect(batchData).toHaveProperty('annotations');

    // 全てのimageIdに対応するエントリが返却される（REQ-18.3）
    for (const imageId of imageIds) {
      expect(batchData.annotations).toHaveProperty(imageId);
    }

    // 事前準備で注釈を保存した画像は AnnotationInfo が返る（REQ-18.3）。
    // 以前は `if (annotation !== null)` で包んでおり、注釈を 1 件も作っていなかったため
    // 全エントリが null となり、AnnotationInfo の形は一度も検証されていなかった。
    assertPrepared(annotatedImageId, '事前準備で注釈を保存した画像のID');
    const annotated = batchData.annotations[annotatedImageId];
    expect(annotated, '注釈を保存した画像の注釈が返らない').not.toBeNull();
    expect(annotated).toHaveProperty('id');
    expect(annotated).toHaveProperty('imageId', annotatedImageId);
    expect(annotated).toHaveProperty('data');

    // 注釈を保存していない画像は空（null）が返る（REQ-18.4）
    const notAnnotatedIds = imageIds.filter((id) => id !== annotatedImageId);
    expect(notAnnotatedIds.length, '注釈を保存していない画像が母集団に無い').toBeGreaterThan(0);
    for (const imageId of notAnnotatedIds) {
      expect(batchData.annotations[imageId], '注釈の無い画像に空以外が返る').toBeNull();
    }
  });

  /**
   * @requirement site-survey/REQ-18.4
   */
  test('存在しないimageIDに空の注釈データが返却される (site-survey/REQ-18.4)', async () => {
    expect(createdSurveyId).toBeTruthy();

    // 存在しないUUID形式のimageIDでバッチAPIを呼び出し
    const nonExistentImageId = '00000000-0000-4000-a000-000000000000';

    // 現場調査に紐づく実際の画像IDも含めてリクエスト
    const imagesResponse = await sharedPage.request.get(
      `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
      { headers: getAuthHeaders() }
    );

    const imageIds: string[] = [nonExistentImageId];
    if (imagesResponse.ok()) {
      const images = await imagesResponse.json();
      const existingIds = (images as { id: string }[]).map((img) => img.id);
      imageIds.push(...existingIds);
    }

    const batchResponse = await sharedPage.request.post(
      `${API_BASE_URL}/api/site-surveys/annotations/batch`,
      {
        headers: getAuthHeaders(),
        data: {
          surveyId: createdSurveyId,
          imageIds: imageIds,
        },
      }
    );

    expect(batchResponse.ok()).toBeTruthy();

    const batchData = await batchResponse.json();
    expect(batchData).toHaveProperty('annotations');

    // REQ-18.4: 存在しない画像IDに対しては空の注釈データを返す。
    // 実装（annotation.service.ts findByImageIds）は要求された全IDについて鍵を作り、
    // 該当が無ければ null を入れる。鍵ごと欠落させるのではない。
    // 以前の `=== null || === undefined` は、鍵が消えても（undefined になっても）真であり、
    // 「空のデータを返す」ことと「何も返さない」ことを区別できなかった。
    // 実在するIDの鍵が返っていることと併せて主張する（不在の主張だけでは何も言えない）。
    expect(Object.keys(batchData.annotations)).toContain(nonExistentImageId);
    expect(batchData.annotations[nonExistentImageId]).toBeNull();
    for (const existingId of imageIds) {
      expect(Object.keys(batchData.annotations)).toContain(existingId);
    }
  });

  /**
   * @requirement site-survey/REQ-18.6
   */
  test('バッチ注釈取得APIにバリデーションエラーが正しく返される (site-survey/REQ-18.6)', async () => {
    // surveyIdが不正な場合
    const invalidResponse = await sharedPage.request.post(
      `${API_BASE_URL}/api/site-surveys/annotations/batch`,
      {
        headers: getAuthHeaders(),
        data: {
          surveyId: 'invalid-uuid',
          imageIds: ['also-invalid'],
        },
      }
    );

    expect(invalidResponse.status()).toBe(400);

    // imageIdsが空配列の場合
    const emptyResponse = await sharedPage.request.post(
      `${API_BASE_URL}/api/site-surveys/annotations/batch`,
      {
        headers: getAuthHeaders(),
        data: {
          surveyId: '550e8400-e29b-41d4-a716-446655440000',
          imageIds: [],
        },
      }
    );

    expect(emptyResponse.status()).toBe(400);
  });

  /**
   * @requirement site-survey/REQ-18.7
   */
  test('バッチ注釈取得APIのエラー時にメッセージが返却される (site-survey/REQ-18.7)', async () => {
    // 不正なリクエストボディ（surveyIdなし）
    const noSurveyIdResponse = await sharedPage.request.post(
      `${API_BASE_URL}/api/site-surveys/annotations/batch`,
      {
        headers: getAuthHeaders(),
        data: {
          imageIds: ['550e8400-e29b-41d4-a716-446655440000'],
        },
      }
    );

    // REQ-18.7: バッチ注釈取得が失敗したときはエラーメッセージを返す。
    // 入力検証の失敗は 400 の RFC7807 形式で返り、後方互換のため message も併記される
    // （apiError.ts の toProblemDetails）。
    // 以前は `'message' in b || 'error' in b || 'errors' in b` の論理和を、
    // 本文が取れたときにだけ判定していた。本文の取得に失敗すれば判定ごと消え、
    // 論理和はどれか一つ残れば成立する。返る形そのものを主張する。
    expect(noSurveyIdResponse.status()).toBe(400);

    const errorBody = (await noSurveyIdResponse.json()) as Record<string, unknown>;
    expect(errorBody.message, 'エラー応答に message が無い').toBeTruthy();
    expect(errorBody.detail, 'エラー応答に detail が無い').toBeTruthy();

    // 不正なリクエストボディ（imageIdsなし）
    const noImageIdsResponse = await sharedPage.request.post(
      `${API_BASE_URL}/api/site-surveys/annotations/batch`,
      {
        headers: getAuthHeaders(),
        data: {
          surveyId: '550e8400-e29b-41d4-a716-446655440000',
        },
      }
    );

    expect(noImageIdsResponse.status()).toBe(400);

    const errorBody2 = (await noImageIdsResponse.json()) as Record<string, unknown>;
    expect(errorBody2.message, 'エラー応答に message が無い').toBeTruthy();
    expect(errorBody2.detail, 'エラー応答に detail が無い').toBeTruthy();
  });

  /**
   * @requirement site-survey/REQ-18.8
   */
  test('バッチAPIのレスポンスが個別エンドポイントのレスポンスと互換性を持つ (site-survey/REQ-18.8)', async () => {
    expect(createdSurveyId).toBeTruthy();

    // 現場調査の画像一覧を取得
    const imagesResponse = await sharedPage.request.get(
      `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
      { headers: getAuthHeaders() }
    );

    expect(imagesResponse.ok()).toBeTruthy();

    const images = await imagesResponse.json();
    const imageIds = (images as { id: string }[]).map((img) => img.id);

    // 画像は beforeAll でアップロード済みであることが前提
    expect(imageIds.length).toBeGreaterThan(0);

    // 互換性は「注釈が存在する画像」でしか比べられない。
    // 事前準備で注釈を保存した画像を対象にする（以前は先頭の画像を対象としており、
    // 注釈が 1 件も無いため三重の `if` の内側が一度も実行されていなかった）。
    assertPrepared(annotatedImageId, '事前準備で注釈を保存した画像のID');
    const targetImageId = annotatedImageId;
    expect(imageIds, '注釈を保存した画像が一覧に無い').toContain(targetImageId);

    // 個別エンドポイントで注釈を取得
    const individualResponse = await sharedPage.request.get(
      `${API_BASE_URL}/api/site-surveys/images/${targetImageId}/annotations`,
      { headers: getAuthHeaders() }
    );

    expect(individualResponse.ok(), '個別注釈取得エンドポイントが失敗した').toBeTruthy();

    // バッチエンドポイントで注釈を取得
    const batchResponse = await sharedPage.request.post(
      `${API_BASE_URL}/api/site-surveys/annotations/batch`,
      {
        headers: getAuthHeaders(),
        data: {
          surveyId: createdSurveyId,
          imageIds: [targetImageId],
        },
      }
    );

    expect(batchResponse.ok()).toBeTruthy();

    const batchData = await batchResponse.json();
    expect(batchData).toHaveProperty('annotations');
    expect(typeof batchData.annotations).toBe('object');

    const batchAnnotation = batchData.annotations[targetImageId];
    expect(batchAnnotation, 'バッチ応答に注釈が含まれない').not.toBeNull();

    const individualData = (await individualResponse.json()) as Record<string, unknown>;

    // REQ-18.8: 個別エンドポイントとバッチエンドポイントのレスポンス形式が一致すること
    expect(
      Object.keys(batchAnnotation as Record<string, unknown>).sort(),
      'バッチと個別で注釈オブジェクトの項目構成が食い違う'
    ).toEqual(Object.keys(individualData).sort());
    expect(batchAnnotation.id).toBe(individualData.id);
    expect(batchAnnotation.imageId).toBe(individualData.imageId);
    expect(batchAnnotation.imageId).toBe(targetImageId);
    expect(batchAnnotation.data).toEqual(individualData.data);
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test('テストデータのクリーンアップ', async () => {
    assertPrepared(createdSurveyId, '事前準備で作成した現場調査のID');
    const surveyDeleteResponse = await sharedPage.request.delete(
      `${API_BASE_URL}/api/site-surveys/${createdSurveyId}`,
      { headers: getAuthHeaders() }
    );
    // 200/204: 削除成功, 403: 権限不足（通常ユーザー）, 404: 既に削除済み
    expect([200, 204, 403, 404]).toContain(surveyDeleteResponse.status());

    assertPrepared(createdProjectId, '事前準備で作成したプロジェクトのID');
    const projectDeleteResponse = await sharedPage.request.delete(
      `${API_BASE_URL}/api/projects/${createdProjectId}`,
      { headers: getAuthHeaders() }
    );
    expect([200, 204, 403, 404]).toContain(projectDeleteResponse.status());
  });
});
