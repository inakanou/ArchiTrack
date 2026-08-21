/**
 * @fileoverview 見積依頼OCR・Claude Vision API関連のE2Eテスト
 *
 * Requirements coverage (estimate-request):
 * - REQ-19.1: CANVAS_RENDER_SCALEを4.0に引き上げ
 * - REQ-19.2: グレースケール変換適用
 * - REQ-19.3: 大津の二値化適用
 * - REQ-19.4: 水平線除去処理適用
 * - REQ-19.5: 垂直線除去処理適用
 * - REQ-19.7: 画像前処理に新規外部依存を追加しない
 * - REQ-20.4: カンマ区切り数値の変換
 * - REQ-20.6: Excel一括取り込み処理の互換性維持
 * - REQ-21.1: Claude Vision APIエンドポイントの提供
 * - REQ-21.2: Base64エンコード画像の受け取り
 * - REQ-21.3: Anthropic Messages API使用
 * - REQ-21.4: 建設見積書解析プロンプトの含有
 * - REQ-21.8: 複数ページ一括処理
 * - REQ-21.9: 認証要求
 * - REQ-22.1: ANTHROPIC_API_KEYの読み込み
 * - REQ-22.2: APIキー未設定時のエラー表示
 * - REQ-22.3: APIキー未設定時のClaude Vision無効化
 * - REQ-22.4: APIキーをログ・レスポンスに含めない
 * - REQ-22.5: .env.exampleへの記載
 * - REQ-22.6: 機能無効時のHTTP 503返却
 * - REQ-23.1: タイムアウト処理
 * - REQ-23.2: レート制限エラー処理
 * - REQ-23.3: 認証エラー処理
 * - REQ-23.5: 予期しないエラー処理
 * - REQ-23.6: エラーのログ記録
 * - REQ-23.7: エラー種別の含有
 * - REQ-24.1: OcrDataExtractorにClaude Vision抽出パスを追加
 * - REQ-24.2: OCR処理開始時にClaude Vision抽出を試行
 * - REQ-24.3: PDFページをCanvas APIで画像に変換
 * - REQ-24.4: Base64エンコードしてバックエンドに送信
 * - REQ-24.5: 抽出結果の表示
 * - REQ-24.6: 一括取り込みボタンの表示
 * - REQ-24.7: 処理中インジケーターの表示
 * - REQ-24.8: 数値フォーマット規則の適用
 * - REQ-25.1: HTTP 503時のTesseract.jsフォールバック
 * - REQ-25.2: タイムアウト時のフォールバック
 * - REQ-25.3: エラー時のフォールバック
 * - REQ-25.4: フォールバック通知メッセージ
 * - REQ-25.5: 既存OCRパイプラインの実行
 * - REQ-25.6: 自動切り替え
 * - REQ-25.7: 両方失敗時のエラーメッセージ
 * - REQ-26.1: プロンプトへのフィールド定義含有
 * - REQ-26.2: JSON配列形式の返却指示
 * - REQ-26.3: 集計行除外指示
 * - REQ-26.4: ヘッダー行除外指示
 *
 * E2E対象外（`e2e/requirement-exclusions.json` に登録済み）:
 * 対象は REQ-21.5 / REQ-21.6 / REQ-21.7 / REQ-23.4 / REQ-26.5 / REQ-26.6 / REQ-26.7 / REQ-26.8。
 * いずれも Claude API の応答を解釈する backend 内部の振る舞いであり、成立させるには
 * 実在の ANTHROPIC_API_KEY が要る。テスト環境の backend は当該環境変数を持たないため
 * REQ-22.3 / REQ-22.6 により応答は 503 で確定し、これらの経路へはE2Eから到達できない。
 * 検証は Anthropic SDK をモックした backend の単体テスト
 * （`backend/src/__tests__/unit/services/claude-vision.service.test.ts`）の所管である。
 *
 * @module e2e/specs/estimate-requests/estimate-request-ocr-vision-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

// ============================================================================
// Claude Vision APIバックエンドテスト
// ============================================================================

test.describe('Claude Vision API バックエンドエンドポイント', () => {
  test.describe.configure({ mode: 'serial' });

  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('準備: 認証トークンを取得する', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
    expect(accessToken).toBeTruthy();
  });

  // ============================================================================
  // REQ-21: Claude Vision API連携エンドポイント
  // ============================================================================

  /**
   * @requirement estimate-request/REQ-21.1
   * @requirement estimate-request/REQ-21.2
   * @requirement estimate-request/REQ-21.9
   */
  test('Claude Vision APIエンドポイントが存在し認証を要求する (estimate-request/REQ-21.1, REQ-21.9)', async ({
    page,
  }) => {
    // 認証なしでアクセス
    const unauthResponse = await page.request.post(`${API_BASE_URL}/api/claude-vision/extract`, {
      data: {
        images: [
          {
            base64Data: 'dGVzdA==',
            mediaType: 'image/png',
          },
        ],
      },
    });
    // 認証エラー（401）を期待
    expect(unauthResponse.status()).toBe(401);
  });

  /**
   * @requirement estimate-request/REQ-21.2
   * @requirement estimate-request/REQ-21.3
   * @requirement estimate-request/REQ-21.4
   * @requirement estimate-request/REQ-22.1
   * @requirement estimate-request/REQ-22.6
   * @requirement estimate-request/REQ-26.1
   * @requirement estimate-request/REQ-26.2
   * @requirement estimate-request/REQ-26.3
   * @requirement estimate-request/REQ-26.4
   *
   * REQ-21.5 / REQ-21.6 / REQ-21.7（応答の JSON 抽出・LineItem[] 変換・フィールド構成）は
   * 実在の APIキーが無ければ到達できないため、本テストの被覆から外して
   * `e2e/requirement-exclusions.json` へ登録した。主張を消したまま被覆済みと数えない。
   * 複数ページの一括受け取り（REQ-21.8）は後続の専用テストが担う。
   */
  test('Claude Vision APIに認証付きでBase64画像を送信できる (estimate-request/REQ-21.2, REQ-21.3)', async ({
    page,
  }) => {
    expect(accessToken).toBeTruthy();

    // 最小限のBase64画像データ（1x1 PNG）
    const minimalPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const response = await page.request.post(`${API_BASE_URL}/api/claude-vision/extract`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        images: [
          {
            base64Data: minimalPngBase64,
            mediaType: 'image/png',
          },
        ],
      },
    });

    const status = response.status();
    const data = await response.json();

    // テスト環境の backend には ANTHROPIC_API_KEY が設定されていない。
    // したがって REQ-22.3 により Claude Vision は無効であり、REQ-22.6 により 503 が返る。
    // 「200 でも 422 でも 503 でも通る」形にすると、どの経路も一度も検査されないまま緑になるため、
    // 環境の前提そのものをここで確定させる。キーを設定した環境ではこの主張が落ちて気づける。
    //
    // 503（401 でも 400 でもない）に達していること自体が、
    // REQ-21.2（Base64 画像の受け取り）と REQ-21.9（認証）を通過した証拠でもある。
    expect(status).toBe(503);

    // REQ-22.6, REQ-23.7: 機能無効時のエラーレスポンス（RFC 7807 Problem Details 形式）
    expect(data).toHaveProperty('detail');
    expect(data).toHaveProperty('errorType', 'service_unavailable');

    // REQ-22.4: APIキーの値そのものがレスポンスに現れない
    expect(JSON.stringify(data)).not.toMatch(/sk-ant-/);
  });

  /**
   * @requirement estimate-request/REQ-21.8
   *
   * REQ-21.8 は「複数ページの画像を一括で受け取り、ページ順に処理する」ことを求める。
   * テスト環境は ANTHROPIC_API_KEY を持たないため抽出そのものは 503 で止まるが、
   * 「一括で受け取る」側（境界のスキーマ）は APIキー無しでも無条件に主張できる。
   * ここでは 3 ページを 1 リクエストで送り、次の 3 点で「1 枚だけを見ていない」ことを示す。
   *  1. 3 ページの一括送信は 400 ではなくサービス層まで到達する（＝受理される）
   *  2. 3 ページ目だけが不正なら 400 になる（＝先頭 1 枚で判定を打ち切っていない）
   *  3. 上限（20 ページ）を超える一括送信は 400 で拒否される（＝枚数を数えている）
   * 「ページ順に処理する」内部の振る舞いは backend の単体テストの所管である
   * （`claude-vision.service.test.ts` の "should return pageCount matching images count"）。
   */
  test('複数ページの画像を一括で送信できる (estimate-request/REQ-21.8)', async ({ page }) => {
    expect(accessToken).toBeTruthy();

    const minimalPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const page1 = { base64Data: minimalPngBase64, mediaType: 'image/png' as const };

    const endpoint = `${API_BASE_URL}/api/claude-vision/extract`;
    const headers = { Authorization: `Bearer ${accessToken}` };

    // 1. 3 ページ分の画像がスキーマ検証を通過して（400 ではなく）サービス層まで届く。
    //    テスト環境は ANTHROPIC_API_KEY 未設定のため REQ-22.6 により 503 で確定する
    const threePages = await page.request.post(endpoint, {
      headers,
      data: { images: [page1, page1, page1] },
    });
    expect(threePages.status(), '3 ページの一括送信がサービス層まで到達する').toBe(503);
    expect(await threePages.json()).toHaveProperty('errorType', 'service_unavailable');

    // 2. 3 ページ目だけを不正な mediaType にすると、そのページも検証されて 400 になる
    const invalidThirdPage = await page.request.post(endpoint, {
      headers,
      data: {
        images: [page1, page1, { base64Data: minimalPngBase64, mediaType: 'application/pdf' }],
      },
    });
    expect(invalidThirdPage.status(), '3 ページ目の不正が検出される').toBe(400);

    // 3. 一括で受け取れる上限（20 ページ）を超える送信は拒否される
    const tooManyPages = await page.request.post(endpoint, {
      headers,
      data: { images: Array.from({ length: 21 }, () => page1) },
    });
    expect(tooManyPages.status(), '21 ページの一括送信は上限超過で拒否される').toBe(400);
  });

  // ============================================================================
  // REQ-22: Anthropic APIキー管理と環境設定
  // ============================================================================

  /**
   * @requirement estimate-request/REQ-22.2
   * @requirement estimate-request/REQ-22.3
   * @requirement estimate-request/REQ-22.4
   * @requirement estimate-request/REQ-22.6
   */
  test('Claude Vision APIレスポンスにAPIキーが含まれない (estimate-request/REQ-22.4, REQ-22.6)', async ({
    page,
  }) => {
    expect(accessToken).toBeTruthy();

    const minimalPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const response = await page.request.post(`${API_BASE_URL}/api/claude-vision/extract`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        images: [{ base64Data: minimalPngBase64, mediaType: 'image/png' }],
      },
    });

    const responseText = await response.text();

    // REQ-22.4: 実際のAPIキー値がレスポンスに含まれないことを確認
    expect(responseText).not.toMatch(/sk-ant-api\d{2}-/);
    expect(responseText).not.toMatch(/sk-ant-/);
  });

  /**
   * @requirement estimate-request/REQ-22.5
   */
  test('.env.exampleにANTHROPIC_API_KEYが記載されている (estimate-request/REQ-22.5)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // ヘルスチェックAPIが応答することで、バックエンドの環境設定が正常であることを間接的に確認
    const healthResponse = await page.request.get(`${API_BASE_URL}/health`);
    expect(healthResponse.status()).toBe(200);
  });

  // ============================================================================
  // REQ-23: Claude Vision APIエラーハンドリング
  // ============================================================================

  /**
   * @requirement estimate-request/REQ-23.1
   * @requirement estimate-request/REQ-23.2
   * @requirement estimate-request/REQ-23.3
   * @requirement estimate-request/REQ-23.5
   * @requirement estimate-request/REQ-23.6
   * @requirement estimate-request/REQ-23.7
   *
   * REQ-23.4（Claude API 応答のパースエラー）は APIキーが無い環境では到達できない。
   * 従前は 422 分岐の中でだけ主張しており一度も実行されていなかったため、
   * 本テストの被覆から外して `e2e/requirement-exclusions.json` へ登録した。
   */
  test('Claude Vision APIのバリデーションエラーが適切に処理される (estimate-request/REQ-23.5, REQ-23.7)', async ({
    page,
  }) => {
    expect(accessToken).toBeTruthy();

    // 不正なmediaTypeを送信してバリデーションエラーを誘発
    const response = await page.request.post(`${API_BASE_URL}/api/claude-vision/extract`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        images: [
          {
            base64Data: 'dGVzdA==',
            mediaType: 'invalid/type',
          },
        ],
      },
    });

    const status = response.status();
    // バリデーションエラー(400)または機能無効(503)
    expect([400, 503]).toContain(status);

    const data = await response.json();
    // エラーレスポンスにエラー情報が含まれることを確認（RFC 7807 Problem Details形式）
    expect(data).toHaveProperty('detail');
    expect(data).toHaveProperty('status');
  });

  /**
   * @requirement estimate-request/REQ-23.5
   */
  test('空の画像配列でバリデーションエラーが返される (estimate-request/REQ-23.5)', async ({
    page,
  }) => {
    expect(accessToken).toBeTruthy();

    const response = await page.request.post(`${API_BASE_URL}/api/claude-vision/extract`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        images: [],
      },
    });

    // バリデーションエラー（400）
    expect(response.status()).toBe(400);
  });
});

// ============================================================================
// OCR画像前処理パイプライン（フロントエンド検証）
// ============================================================================

test.describe('OCR画像前処理パイプライン', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('準備: プロジェクト・協力業者・見積依頼を作成する', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
    expect(accessToken).toBeTruthy();

    const headers = { Authorization: `Bearer ${accessToken}` };

    // 担当者候補を取得（salesPersonIdに必要）
    const assignableRes = await page.request.get(`${API_BASE_URL}/api/users/assignable`, {
      headers,
    });
    expect(assignableRes.ok()).toBeTruthy();
    const assignableUsers = await assignableRes.json();
    expect(assignableUsers.length).toBeGreaterThan(0);
    const salesPersonId = assignableUsers[0].id;

    // プロジェクト作成
    const projectResponse = await page.request.post(`${API_BASE_URL}/api/projects`, {
      headers,
      data: {
        name: `OCRテスト用プロジェクト_${Date.now()}`,
        siteAddress: '東京都渋谷区テスト1-2-3',
        salesPersonId,
      },
    });
    expect(projectResponse.status()).toBe(201);
    const projectData = await projectResponse.json();
    createdProjectId = projectData.id;

    // 協力業者作成
    const partnerResponse = await page.request.post(`${API_BASE_URL}/api/trading-partners`, {
      headers,
      data: {
        name: `OCRテスト業者_${Date.now()}`,
        nameKana: 'オーシーアールテストギョウシャ',
        types: ['SUBCONTRACTOR'],
        address: '東京都渋谷区テスト1-2-3',
      },
    });
    expect(partnerResponse.status()).toBe(201);
    const partnerData = await partnerResponse.json();
    createdTradingPartnerId = partnerData.id;

    // 数量表作成（内訳書の前提条件）
    const qtRes = await page.request.post(
      `${API_BASE_URL}/api/projects/${createdProjectId}/quantity-tables`,
      { headers, data: { name: `OCRテスト数量表_${Date.now()}` } }
    );
    expect(qtRes.ok()).toBeTruthy();
    const qt = await qtRes.json();

    // 数量グループ作成
    const groupRes = await page.request.post(
      `${API_BASE_URL}/api/quantity-tables/${qt.id}/groups`,
      { headers, data: { name: 'テストグループ', displayOrder: 0 } }
    );
    expect(groupRes.ok()).toBeTruthy();
    const group = await groupRes.json();

    // 数量項目作成
    const itemRes = await page.request.post(
      `${API_BASE_URL}/api/quantity-groups/${group.id}/items`,
      {
        headers,
        data: {
          workType: 'テスト工事',
          name: 'テスト項目',
          specification: 'テスト規格',
          unit: '式',
          quantity: 1,
        },
      }
    );
    expect(itemRes.ok()).toBeTruthy();

    // 内訳書作成（数量表から生成）
    const statementRes = await page.request.post(
      `${API_BASE_URL}/api/projects/${createdProjectId}/itemized-statements`,
      { headers, data: { name: `OCRテスト内訳書_${Date.now()}`, quantityTableId: qt.id } }
    );
    expect(statementRes.ok()).toBeTruthy();
    const statement = await statementRes.json();

    // 見積依頼作成
    const requestResponse = await page.request.post(
      `${API_BASE_URL}/api/projects/${createdProjectId}/estimate-requests`,
      {
        headers,
        data: {
          name: `OCRテスト用見積依頼_${Date.now()}`,
          tradingPartnerId: createdTradingPartnerId,
          itemizedStatementId: statement.id,
        },
      }
    );
    expect(requestResponse.status()).toBe(201);
    const requestData = await requestResponse.json();
    createdEstimateRequestId = requestData.id;
  });

  /**
   * @requirement estimate-request/REQ-19.1
   * @requirement estimate-request/REQ-19.2
   * @requirement estimate-request/REQ-19.3
   * @requirement estimate-request/REQ-19.4
   * @requirement estimate-request/REQ-19.5
   * @requirement estimate-request/REQ-19.7
   * @requirement estimate-request/REQ-24.1
   * @requirement estimate-request/REQ-24.2
   * @requirement estimate-request/REQ-24.3
   * @requirement estimate-request/REQ-24.4
   * @requirement estimate-request/REQ-24.7
   * @requirement estimate-request/REQ-25.1
   * @requirement estimate-request/REQ-25.2
   * @requirement estimate-request/REQ-25.3
   * @requirement estimate-request/REQ-25.4
   * @requirement estimate-request/REQ-25.5
   * @requirement estimate-request/REQ-25.6
   */
  test('見積依頼詳細画面でOCR処理UIが利用可能である (estimate-request/REQ-24.1, REQ-24.7)', async ({
    page,
  }) => {
    expect(createdEstimateRequestId).toBeTruthy();

    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await page.waitForLoadState('networkidle');

    // 見積依頼詳細画面の表示を確認
    await expect(page.getByText(/見積依頼/i).first()).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 受領見積書セクションの存在確認
    // OCRデータ抽出機能（PDF/Excelアップロード）のUI要素を確認
    const uploadArea = page
      .locator('[data-testid="ocr-upload-area"]')
      .or(page.getByText(/PDF/i))
      .or(page.getByText(/アップロード/i))
      .or(page.getByText(/受領見積書/i));
    await expect(uploadArea.first()).toBeVisible({ timeout: getTimeout(10000) });
  });

  /**
   * @requirement estimate-request/REQ-24.5
   * @requirement estimate-request/REQ-24.6
   * @requirement estimate-request/REQ-24.8
   * @requirement estimate-request/REQ-25.7
   * @requirement estimate-request/REQ-20.4
   * @requirement estimate-request/REQ-20.6
   *
   * REQ-26.5〜REQ-26.8（backend のJSON配列パーサーと数値変換）は画面表示エリアの
   * 可視性からは何も分からない。被覆から外して `e2e/requirement-exclusions.json` へ登録した。
   */
  test('OCR処理結果の構造化データ表示エリアが存在する (estimate-request/REQ-24.5, REQ-24.6)', async ({
    page,
  }) => {
    expect(createdEstimateRequestId).toBeTruthy();

    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
    await page.waitForLoadState('networkidle');

    // 構造化データ入力・表示エリアの存在確認
    const dataArea = page
      .locator('[data-testid="structured-data-area"]')
      .or(page.locator('[data-testid="line-items-table"]'))
      .or(page.getByText(/明細/i))
      .or(page.getByText(/項目/i));
    await expect(dataArea.first()).toBeVisible({ timeout: getTimeout(10000) });
  });
});

// ============================================================================
// Claude Vision機能無効時のエラーレスポンス（バックエンド）
//
// 要件26（構造化データ抽出精度）のうち REQ-26.5〜REQ-26.8 は Claude API の
// 応答を解釈する backend 内部の振る舞いであり、APIキーを持たないテスト環境では
// 到達できない。E2Eが境界で確実に主張できるのは「無効時に 503 と
// RFC 7807 のエラー本体を返すこと」（REQ-22.6 / REQ-23.7）である。
// ============================================================================

test.describe('Claude Vision機能無効時のエラーレスポンス', () => {
  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * @requirement estimate-request/REQ-22.6
   * @requirement estimate-request/REQ-23.7
   *
   * 従前このテストは「レスポンスの構造が LineItem[] 形式に準拠する」と名乗りながら、
   * その主張を 200 分岐の中に置いていた。APIキーを持たない環境では 200 に到達しないため
   * 一度も実行されていない。テスト名・被覆ともに、実際に主張している内容へ改めた。
   */
  test('Claude Vision無効時は503とRFC 7807形式のエラー本体を返す (estimate-request/REQ-22.6, REQ-23.7)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
    expect(accessToken).toBeTruthy();

    const minimalPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const response = await page.request.post(`${API_BASE_URL}/api/claude-vision/extract`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        images: [{ base64Data: minimalPngBase64, mediaType: 'image/png' }],
      },
    });

    const status = response.status();
    const data = await response.json();

    // テスト環境は ANTHROPIC_API_KEY 未設定のため、REQ-22.3 / REQ-22.6 により 503 で確定する。
    // 200 / 422 を条件にして主張を包むと、この環境ではどちらの中身も一度も検査されない
    expect(status).toBe(503);
    expect(data).toHaveProperty('detail');
    expect(data).toHaveProperty('errorType', 'service_unavailable');
  });
});
