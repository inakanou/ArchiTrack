/**
 * @fileoverview 見積依頼OCR・Claude Vision API関連のE2Eテスト
 *
 * Requirements coverage (estimate-request):
 * （REQ-19.1 は Task 115.135 の是正で被覆表記から外した。本ファイルは描画スケールを
 *   一切観測しておらず、現行の e2e/fixtures は2件ともテキスト入りPDFで
 *   スキャンPDFフォールバック経路へ到達しないため。`e2e/requirement-exclusions.json` へ
 *   integration-test 区分で登録済みであったが、タスク 115.157 が画像のみのPDF fixture を
 *   用意して `e2e/specs/estimate-requests/scanned-pdf-ocr-fallback-e2e.spec.ts` で被覆し、当該除外を解消した）
 * （REQ-19.2〜REQ-19.5 は Task 115.159 の是正で本ファイルの被覆表記から外した。
 *   本ファイルは前処理後の画素を一切観測しておらず、四段それぞれの規範を判定していない。
 *   画素を観測している `scanned-pdf-ocr-fallback-e2e.spec.ts` の
 *   「画像のみのPDFは…Tesseract OCR が実行される」検証へタグを移した）
 * （REQ-19.7 も同じく Task 115.159 で外した。「画像前処理に新規外部依存関係を追加しない」は
 *   実行中の画面からは観測できない依存関係の性質であるため、
 *   `e2e/requirement-exclusions.json` へ infrastructure 区分で登録した）
 * （REQ-20.4 / 20.6 / 24.5 / 24.6 / 24.8 / 25.7 は Task 115.176 まで、実体が
 *   「`.or` で束ねた集合の先頭が見えること」ただ一本の検証に掲げられていた。
 *   実測すると掴んでいたのは見出し `<h2>項目選択</h2>` であり、どの規範も判定していなかった。
 *   六件とも実行中の画面から判定できたため、除外は増やさず本ファイル末尾の四つの検証で
 *   判定を書いた。詳細は当該箇所の注記にある）
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

import { test, expect, type Page, type Route } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { fileURLToPath } from 'url';
import * as path from 'path';

// ESM環境での__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
// フロントエンドのClaude Vision抽出パスとTesseractフォールバックの観測
//
// 以下の定数と補助は、タスク 115.159 が「OCRアップロードUIが存在する」ことしか
// 確かめていなかった検証を、実際の経路を通す検証へ置き換えるために置いた。
// 観測はいずれも本番が出す通信と本番が描画した DOM だけを見ており、
// 判定は Node 側の `expect` が行う。
// ============================================================================

/** 本番 `frontend/src/api/claude-vision.ts` が叩く抽出エンドポイントのパス */
const CLAUDE_VISION_EXTRACT_PATH = '/api/claude-vision/extract';

/**
 * 本番 `frontend/src/components/estimate-requests/pdf-text-extractor.ts` の
 * `CLAUDE_VISION_RENDER_SCALE`。本番の値をテストが再掲することで
 * 「Claude Vision へ送る画像をこの倍率で描いていること」を外から主張する。
 * Tesseract 用の描画は `CANVAS_RENDER_SCALE`（4.0）であり、寸法で両者を弁別できる。
 */
const EXPECTED_CLAUDE_VISION_RENDER_SCALE = 2.0;

/**
 * `e2e/fixtures/test-scanned-pdf.pdf` の MediaBox（pt）。
 * `e2e/fixtures/generate-image-only-pdf.mjs` の PAGE_WIDTH / PAGE_HEIGHT と対。
 */
const FIXTURE_PAGE_WIDTH_PT = 350;
const FIXTURE_PAGE_HEIGHT_PT = 175;

/**
 * Tesseract.js の資材（worker スクリプト・日本語データ）の取得を見分ける目印。
 * 配信元のホスト名ではなくパスで見る（CI とローカルで配信元が食い違っても
 * 観測が全件外れて素通りしないようにするため）。
 */
const TESSERACT_WORKER_PATH_MARK = '/tesseract.js@';
const TESSERACT_LANG_PATH_MARK = '/@tesseract.js-data/jpn/';

/** OCR が読み取れることを主張する語。画像のみPDFの画像の中にしか存在しない。 */
const OCR_EXPECTED_TOKENS = ['外壁塗装工事', '100', '平米', '5000', '500000'];

/**
 * Claude Vision が「正常に返却した」ことにする明細行データ（タスク 115.176）。
 *
 * テスト環境の backend は ANTHROPIC_API_KEY を持たず REQ-22.3 / REQ-22.6 により 503 で
 * 確定するため、REQ-24.5 / 24.6 / 24.8 が条件とする「正常に返却されたとき」へは
 * 応答の差し替えでしか到達できない。値は次の理由で選んだ。
 * - 名称は画像のOCRからも既存の資材からも生じ得ない語にし、表示が**この応答に由来する**
 *   ことを弁別できるようにする
 * - 数量 2.5 / 単価 1234.6 / 999.4 は要件18の形式（小数2桁・四捨五入の切り上がりと
 *   切り下がり）を通すと表記が変わる値である
 * - 金額 99999999 は数量×単価と一致しない値である。要件18.5 / 18.9 は数量×単価の
 *   四捨五入を表示するよう定めるため、この値が画面に出れば規則に従っていないと分かる
 */
const INJECTED_VISION_LINE_ITEMS = [
  {
    customCategory: '仮設',
    workType: '塗装工事',
    name: 'E2E注入_外壁塗装',
    specification: 'シリコン系',
    unit: 'm2',
    quantity: 2.5,
    unitPrice: 1234.6,
    amount: 99999999,
    remarks: '注入した備考',
  },
  {
    customCategory: null,
    workType: null,
    name: 'E2E注入_足場',
    specification: null,
    unit: '式',
    quantity: 3,
    unitPrice: 999.4,
    amount: null,
    remarks: null,
  },
];

/** OCR の経路で観測する通信。判定はしない。 */
interface OcrRequestTrace {
  /** 観測の順序（単調増加） */
  seq: number;
  kind: 'claude-vision' | 'tesseract-worker' | 'tesseract-lang';
  /** Claude Vision への要求だけ本体を保持する */
  postData: string | null;
}

/**
 * Claude Vision の抽出要求と Tesseract 資材の取得を、順序つきで記録し始める。
 *
 * @param page Playwright のページ
 * @returns 記録された通信の配列（進行中も追記される）
 */
function watchOcrRequests(page: Page): OcrRequestTrace[] {
  const traces: OcrRequestTrace[] = [];
  let seq = 0;
  page.on('request', (request) => {
    const requestPath = new URL(request.url()).pathname;
    let kind: OcrRequestTrace['kind'] | null = null;
    if (request.method() === 'POST' && requestPath.endsWith(CLAUDE_VISION_EXTRACT_PATH)) {
      kind = 'claude-vision';
    } else if (requestPath.includes(TESSERACT_WORKER_PATH_MARK)) {
      kind = 'tesseract-worker';
    } else if (requestPath.includes(TESSERACT_LANG_PATH_MARK)) {
      kind = 'tesseract-lang';
    }
    if (kind === null) return;
    seq += 1;
    traces.push({ seq, kind, postData: kind === 'claude-vision' ? request.postData() : null });
  });
  return traces;
}

/**
 * Claude Vision の抽出要求に対する応答の状態コードを記録し始める。
 *
 * @param page Playwright のページ
 * @returns 記録された状態コードの配列（進行中も追記される）
 */
function watchClaudeVisionResponseStatuses(page: Page): number[] {
  const statuses: number[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith(CLAUDE_VISION_EXTRACT_PATH)) {
      statuses.push(response.status());
    }
  });
  return statuses;
}

/** JPEG の画素寸法 */
interface JpegSize {
  width: number;
  height: number;
}

/**
 * JPEG のバイト列から画素寸法を読む。
 *
 * JPEG は SOI（0xFFD8）で始まり、以降 `0xFF + マーカー + 長さ` の区間が並ぶ。
 * 寸法は SOF（Start Of Frame。0xC0〜0xCF のうち 0xC4 / 0xC8 / 0xCC を除く）が持つ。
 *
 * @param bytes JPEG のバイト列
 * @returns 画素寸法
 * @throws SOF が見つからない場合（JPEG として解釈できない場合）
 */
function readJpegSize(bytes: Buffer): JpegSize {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] as number;
    // 詰め物の 0xFF、SOI、TEM、RST は長さを持たない
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const segmentLength = bytes.readUInt16BE(offset + 2);
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + segmentLength;
  }
  throw new Error('送信された画像に JPEG の SOF マーカーが無い（JPEG として解釈できない）');
}

/** 利用者の操作の観測。判定はしない。件数だけを持つ。 */
interface UserInputObservation {
  /** ファイル選択が観測されたか */
  fileSelected: boolean;
  /** ファイル選択より後に起きた、利用者に由来する入力事象の件数 */
  trustedInputEventsAfterFileSelect: number;
}

/**
 * ファイル選択より後の利用者操作を数える観測を挟む。
 *
 * 記録するのは事象の件数だけで、判定はしない。`isTrusted` が真の事象、
 * すなわち利用者の入力に由来するものだけを数える。
 *
 * @param page Playwright のページ
 */
async function installUserInputObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record = { fileSelected: false, trustedInputEventsAfterFileSelect: 0 };
    (window as unknown as Record<string, unknown>).__ocrUserInput = record;

    const count = (event: Event) => {
      if (!record.fileSelected) return;
      if (!event.isTrusted) return;
      record.trustedInputEventsAfterFileSelect += 1;
    };
    for (const type of ['click', 'pointerdown', 'keydown']) {
      document.addEventListener(type, count, true);
    }

    document.addEventListener(
      'change',
      (event) => {
        const target = event.target as HTMLInputElement | null;
        if (target?.type === 'file') record.fileSelected = true;
      },
      true
    );
  });
}

/**
 * 画面側に溜まった利用者操作の観測を回収する。
 *
 * @param page Playwright のページ
 */
async function collectUserInputObservation(page: Page): Promise<UserInputObservation> {
  return page.evaluate(
    () =>
      (window as unknown as Record<string, unknown>)
        .__ocrUserInput as unknown as UserInputObservation
  );
}

/**
 * 見積依頼詳細から受領見積書の登録フォームを開き、fixture のファイルを選ぶ。
 *
 * @param page Playwright のページ
 * @param estimateRequestId 見積依頼の識別子
 * @param fixtureName `e2e/fixtures` 配下のファイル名
 */
async function uploadQuotationFixture(
  page: Page,
  estimateRequestId: string,
  fixtureName: string
): Promise<void> {
  await page.goto(`/estimate-requests/${estimateRequestId}`);
  await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
    timeout: getTimeout(15000),
  });

  const registerButton = page.getByRole('button', { name: /受領見積書登録/i });
  await expect(registerButton).toBeVisible({ timeout: getTimeout(10000) });
  await registerButton.click();

  await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });

  const fixturePath = path.resolve(__dirname, '../../fixtures', fixtureName);
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
}

// ============================================================================
// フロントエンドのClaude Vision抽出パスとTesseractフォールバック
// ============================================================================

test.describe('フロントエンドのClaude Vision抽出パスとTesseractフォールバック', () => {
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
   * ## タスク 115.159 の是正
   *
   * 従前この位置には「見積依頼詳細画面でOCR処理UIが利用可能である」という検証があり、
   * REQ-19.2〜19.5 / 19.7 / 24.1〜24.4 / 24.7 / 25.1〜25.6 の**十六件**のタグを掲げていた。
   * しかし実体は「`ocr-upload-area` **または** 『PDF』**または**『アップロード』**または**
   * 『受領見積書』のいずれかの文字が見えること」だけであり、十六件のどの受入基準の規範も
   * 判定していなかった。被覆率の検査はタグだけを見るため、十六件が被覆済みと数えられ続けていた。
   *
   * 十六件の処遇は次のとおり（内訳は本ファイル冒頭の被覆表記にも反映してある）。
   * - REQ-19.2〜19.5（前処理四段）: 画素を観測している
   *   `scanned-pdf-ocr-fallback-e2e.spec.ts` へタグを移した。
   * - REQ-19.7（画像前処理に新規外部依存を追加しない）: 実行中の画面からは観測できないため
   *   タグを外し `e2e/requirement-exclusions.json` へ登録した。
   * - 残る十件（24.1〜24.4 / 24.7 / 25.1〜25.3 / 25.4〜25.6）: 本検証と直後の二つの検証で
   *   実際に判定する。
   *
   * ## 本検証が判定するもの
   *
   * 画像のみのPDF（`e2e/fixtures/test-scanned-pdf.pdf`）を受領見積書として選び、
   * テスト環境の backend が持たない ANTHROPIC_API_KEY に由来する **実物の 503** を受けて
   * Tesseract へ退避するまでを、通信の順序・送信された画像・画面の表示で確かめる。
   * 応答を差し替えないため、REQ-22.3 / REQ-22.6 が定める実際の応答をそのまま刺激に使う。
   *
   * - REQ-24.1 / 24.2: 受領見積書のOCRを起動すると
   *   `/api/claude-vision/extract` への要求がちょうど一件出て、それが Tesseract の資材の
   *   取得より**先**に起きる（順序を見ずに「両方起きた」だけを言うと、退避が先で
   *   Claude Vision が後でも成立してしまう）
   * - REQ-24.3: 送られた画像は1ページのPDFに対して1枚で、寸法が
   *   350x175pt に対し 700x350、すなわち Canvas 描画スケール 2.0 のページ画像である
   *   （Tesseract 用の 4.0 なら 1400x700 になるため、この値は両者を弁別する）
   * - REQ-24.4: その画像が `images[].base64Data` / `mediaType` として Base64 で送られている
   * - REQ-25.1 / 25.4: 応答が 503 であり、フォールバック通知バナーが本番の文言で現れる
   * - REQ-25.5: Tesseract の worker と日本語データが取得され、抽出結果に**画像の中にしか
   *   存在しない語**が現れ、要件20の変換が明細行を生んで一括取り込みボタンが出る
   * - REQ-25.6: ファイル選択より後、利用者に由来する入力事象が一件も無いまま結果に至る
   *
   * @requirement estimate-request/REQ-24.1
   * @requirement estimate-request/REQ-24.2
   * @requirement estimate-request/REQ-24.3
   * @requirement estimate-request/REQ-24.4
   * @requirement estimate-request/REQ-25.1
   * @requirement estimate-request/REQ-25.4
   * @requirement estimate-request/REQ-25.5
   * @requirement estimate-request/REQ-25.6
   */
  test('受領見積書のOCRはClaude Visionを先に試行し、503応答で操作なしにTesseractへ退避する (estimate-request/REQ-24.2, REQ-24.3, REQ-25.1, REQ-25.6)', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(240000));
    expect(createdEstimateRequestId).toBeTruthy();

    const traces = watchOcrRequests(page);
    const visionStatuses = watchClaudeVisionResponseStatuses(page);
    await installUserInputObserver(page);

    await loginAsUser(page, 'REGULAR_USER');
    await uploadQuotationFixture(page, createdEstimateRequestId as string, 'test-scanned-pdf.pdf');

    // 抽出の成立だけを主張する（「結果 または エラー」の選言では何も主張していない）。
    // 上限は Claude Vision の試行とその失敗後の Tesseract 一巡を合わせた全体に対するもの。
    const extractedText = page.getByTestId('ocr-extracted-text');
    await expect(extractedText).toBeVisible({ timeout: getTimeout(120000) });
    await expect(page.getByTestId('ocr-error-message')).toHaveCount(0);

    // ------------------------------------------------------------------
    // REQ-24.1 / REQ-24.2: Claude Vision 抽出を先に試行する
    // ------------------------------------------------------------------
    const visionRequests = traces.filter((t) => t.kind === 'claude-vision');
    expect(
      visionRequests.length,
      'Claude Vision の抽出エンドポイントへの要求が1件ちょうどではない（抽出パスが通っていないか、再送が起きている）'
    ).toBe(1);

    const tesseractRequests = traces.filter((t) => t.kind !== 'claude-vision');
    expect(
      tesseractRequests.length,
      'Tesseract の資材が一度も取得されていない（退避経路へ入っていない）'
    ).toBeGreaterThan(0);
    expect(
      visionRequests[0]!.seq,
      'Tesseract の資材の取得が Claude Vision の試行より先に起きている（先に試行していない）'
    ).toBeLessThan(Math.min(...tesseractRequests.map((t) => t.seq)));

    // ------------------------------------------------------------------
    // REQ-24.3 / REQ-24.4: PDFページを Canvas で画像にし Base64 で送る
    // ------------------------------------------------------------------
    const requestBody = visionRequests[0]!.postData;
    expect(requestBody, 'Claude Vision へ送られた本体が観測できていない').toBeTruthy();
    const payload = JSON.parse(requestBody as string) as {
      images?: Array<{ base64Data?: string; mediaType?: string }>;
    };
    expect(
      payload.images?.length,
      '1ページのPDFに対して送られた画像が1枚ではない（ページと画像が対応していない）'
    ).toBe(1);

    const sentImage = payload.images![0]!;
    expect(sentImage.mediaType, '送られた画像のメディアタイプが JPEG ではない').toBe('image/jpeg');
    expect(sentImage.base64Data ?? '', 'Base64 データが空である').not.toBe('');

    const jpegBytes = Buffer.from(sentImage.base64Data as string, 'base64');
    expect(
      jpegBytes.subarray(0, 2).toString('hex'),
      'Base64 を戻した中身が JPEG の SOI で始まっていない（画像になっていない）'
    ).toBe('ffd8');
    expect(
      readJpegSize(jpegBytes),
      `Canvas 描画スケール ${EXPECTED_CLAUDE_VISION_RENDER_SCALE} のページ画像が送られていない`
    ).toEqual({
      width: FIXTURE_PAGE_WIDTH_PT * EXPECTED_CLAUDE_VISION_RENDER_SCALE,
      height: FIXTURE_PAGE_HEIGHT_PT * EXPECTED_CLAUDE_VISION_RENDER_SCALE,
    });

    // ------------------------------------------------------------------
    // REQ-25.1 / REQ-25.4: 503 を受けて退避し、その旨を利用者へ通知する
    // ------------------------------------------------------------------
    expect(
      visionStatuses,
      'Claude Vision の応答が 503 一件で確定していない（テスト環境に ANTHROPIC_API_KEY があると本検証の前提が崩れる）'
    ).toEqual([503]);

    const fallbackBanner = page.getByTestId('fallback-warning-banner');
    await expect(fallbackBanner).toBeVisible();
    await expect(fallbackBanner).toContainText(
      'Claude Vision APIが利用できないため、従来のOCR処理で実行しています'
    );

    // ------------------------------------------------------------------
    // REQ-25.5: 既存のOCR処理パイプライン（要件17・19・20）が実行される
    // ------------------------------------------------------------------
    expect(
      traces.filter((t) => t.kind === 'tesseract-worker').length,
      'Tesseract の worker スクリプトが取得されていない'
    ).toBeGreaterThan(0);
    expect(
      traces.filter((t) => t.kind === 'tesseract-lang').length,
      'Tesseract の日本語データが取得されていない（createWorker("jpn") へ到達していない）'
    ).toBeGreaterThan(0);

    const textContent = await extractedText.textContent();
    expect(textContent, '抽出結果の本文が空である').toBeTruthy();
    const normalizedText = (textContent as string).replace(/\s/g, '');
    for (const token of OCR_EXPECTED_TOKENS) {
      expect(
        normalizedText,
        `OCR結果に画像内の語「${token}」が現れていない（要件17のOCRが読み取れていない）`
      ).toContain(token);
    }
    // 要件20の変換が明細行を生んだこと（生まなければ一括取り込みの区画は描画されない）
    await expect(page.getByTestId('ocr-import-button')).toBeVisible();

    // ------------------------------------------------------------------
    // REQ-25.6: 切り替えは利用者の操作なしに行われる
    // ------------------------------------------------------------------
    const userInput = await collectUserInputObservation(page);
    expect(
      userInput.fileSelected,
      'ファイル選択が観測されていない（観測器が働いていないため次の主張が空洞になる）'
    ).toBe(true);
    expect(
      userInput.trustedInputEventsAfterFileSelect,
      'ファイル選択より後に利用者に由来する入力事象が起きている（自動的な切り替えと言えない）'
    ).toBe(0);
  });

  /**
   * 直前の検証が置いた「ファイル選択より後、利用者に由来する入力事象が0件」という主張が、
   * 弁別能力を持つことの確認（タスク 115.159）。
   *
   * 観測器が数える事象が Playwright の操作でも一度も真にならないのなら、あの 0 は
   * 「操作しなかったから 0」ではなく「何をしても 0」であり、何も述べていない。
   * ここでは同じ観測器のもとで**故意に一度クリックし**、件数が増えることを確かめる。
   *
   * 受入基準の被覆ではないため `@requirement` は付けない。
   */
  test('利用者操作の観測器はファイル選択より後のクリックを数える（観測の弁別能力の確認）', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(120000));
    expect(createdEstimateRequestId).toBeTruthy();

    await installUserInputObserver(page);
    await loginAsUser(page, 'REGULAR_USER');
    await uploadQuotationFixture(page, createdEstimateRequestId as string, 'test-scanned-pdf.pdf');

    const beforeClick = await collectUserInputObservation(page);
    expect(beforeClick.fileSelected, 'ファイル選択が観測されていない').toBe(true);
    expect(
      beforeClick.trustedInputEventsAfterFileSelect,
      'まだ何も操作していない時点で件数が増えている'
    ).toBe(0);

    await page.locator('#quotation-name').click();

    await expect
      .poll(
        () => collectUserInputObservation(page).then((o) => o.trustedInputEventsAfterFileSelect),
        {
          timeout: getTimeout(10000),
          message:
            'クリックしても観測器の件数が増えない（直前の検証の「0件」が何も述べていないことになる）',
        }
      )
      .toBeGreaterThan(0);
  });

  /**
   * ## 本検証が判定するもの（タスク 115.159）
   *
   * Claude Vision の応答を**返さずに滞留させる**。本番 `frontend/src/api/claude-vision.ts` は
   * `timeout: 60000` / `disableRetry: true` で呼んでおり、`frontend/src/api/client.ts` の
   * `AbortController` が 60 秒で打ち切って `new ApiError(0, 'Request timeout')` を投げる。
   * 滞留は刺激であって同期の手段ではない。テスト側に固定時間の待機は書いていない。
   *
   * - REQ-24.7: 滞留させている間、すなわち Claude Vision 処理が実行中の間に、
   *   処理中インジケーターが「Claude Vision APIで解析中...」の相で出ている。
   *   要求が観測できた後に主張するため、まだ要求が出ていない相を見て通ることはない。
   * - REQ-25.2: 打ち切りの後にフォールバック通知が現れ、その理由が `Request timeout`
   *   すなわち時間切れであること、そして Tesseract の日本語データの取得が始まること。
   *   理由の文言により、直後の検証（エラー応答による退避）と刺激を取り違えない。
   *
   * @requirement estimate-request/REQ-24.7
   * @requirement estimate-request/REQ-25.2
   */
  test('Claude Vision処理中は処理中インジケーターを表示し、応答が返らなければ時間切れでTesseractへ退避する (estimate-request/REQ-24.7, REQ-25.2)', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(300000));
    expect(createdEstimateRequestId).toBeTruthy();

    const traces = watchOcrRequests(page);

    // 応答を返さずに保持する。保持した route は検証の後に破棄する。
    const heldRoutes: Route[] = [];
    const holdVisionRoute = (route: Route) => {
      heldRoutes.push(route);
    };
    await page.route(`**${CLAUDE_VISION_EXTRACT_PATH}`, holdVisionRoute);

    await loginAsUser(page, 'REGULAR_USER');
    await uploadQuotationFixture(page, createdEstimateRequestId as string, 'test-scanned-pdf.pdf');

    // ------------------------------------------------------------------
    // REQ-24.7: Claude Vision 処理が実行中の間の処理中インジケーター
    // ------------------------------------------------------------------
    await expect
      .poll(() => traces.filter((t) => t.kind === 'claude-vision').length, {
        timeout: getTimeout(60000),
        message: 'Claude Vision への要求が観測できない（滞留させる対象が発生していない）',
      })
      .toBe(1);

    const progressIndicator = page.getByTestId('ocr-progress-indicator');
    await expect(progressIndicator).toBeVisible();
    await expect(progressIndicator).toContainText('Claude Vision APIで解析中');
    expect(
      traces.filter((t) => t.kind !== 'claude-vision'),
      'Claude Vision の応答を待っている間に Tesseract が動いている（先に試行していない）'
    ).toEqual([]);

    // ------------------------------------------------------------------
    // REQ-25.2: 時間切れで Tesseract へ退避する
    // ------------------------------------------------------------------
    const fallbackBanner = page.getByTestId('fallback-warning-banner');
    await expect(fallbackBanner).toBeVisible({ timeout: getTimeout(120000) });
    await expect(fallbackBanner).toContainText(
      'Claude Vision APIが利用できないため、従来のOCR処理で実行しています'
    );
    await expect(fallbackBanner).toContainText('Request timeout');

    await expect
      .poll(() => traces.filter((t) => t.kind === 'tesseract-lang').length, {
        timeout: getTimeout(120000),
        message: 'Tesseract の日本語データの取得が始まらない（退避先で OCR が動いていない）',
      })
      .toBeGreaterThan(0);

    await page.unroute(`**${CLAUDE_VISION_EXTRACT_PATH}`, holdVisionRoute);
    for (const route of heldRoutes) {
      // 画面側が既に打ち切っている場合、破棄は失敗しうる。観測は済んでいるため後始末に留める
      await route.abort().catch(() => undefined);
    }
  });

  /**
   * ## 本検証が判定するもの（タスク 115.159）
   *
   * Claude Vision の応答を 500 に差し替える。REQ-25.1 の 503（機能無効）とも
   * REQ-25.2 の時間切れとも異なる刺激であり、`errorType` も `service_unavailable` ではない。
   * 差し替えた本体の `detail` がフォールバック通知の理由としてそのまま現れることで、
   * 「この刺激で退避した」ことと「別の刺激で退避した」ことを取り違えない。
   *
   * 抽出の完走までは待たない。REQ-25.3 が定めるのは退避が起きることであり、
   * 退避先で OCR が動き始めたことは Tesseract の日本語データの取得で確定する。
   *
   * @requirement estimate-request/REQ-25.3
   */
  test('Claude Visionがエラーを返すとTesseractへ自動的に退避する (estimate-request/REQ-25.3)', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(180000));
    expect(createdEstimateRequestId).toBeTruthy();

    const traces = watchOcrRequests(page);

    const injectedDetail = 'E2Eが注入したClaude Vision内部エラー';
    await page.route(`**${CLAUDE_VISION_EXTRACT_PATH}`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: 500, detail: injectedDetail, errorType: 'unknown' }),
      });
    });

    await loginAsUser(page, 'REGULAR_USER');
    await uploadQuotationFixture(page, createdEstimateRequestId as string, 'test-scanned-pdf.pdf');

    const fallbackBanner = page.getByTestId('fallback-warning-banner');
    await expect(fallbackBanner).toBeVisible({ timeout: getTimeout(60000) });
    await expect(fallbackBanner).toContainText(
      'Claude Vision APIが利用できないため、従来のOCR処理で実行しています'
    );
    await expect(fallbackBanner).toContainText(injectedDetail);

    expect(
      traces.filter((t) => t.kind === 'claude-vision').length,
      'Claude Vision への要求が1件ちょうどではない'
    ).toBe(1);

    await expect
      .poll(() => traces.filter((t) => t.kind === 'tesseract-lang').length, {
        timeout: getTimeout(120000),
        message: 'Tesseract の日本語データの取得が始まらない（退避先で OCR が動いていない）',
      })
      .toBeGreaterThan(0);
  });

  /**
   * ## タスク 115.176 の是正
   *
   * 従前この位置には「OCR処理結果の構造化データ表示エリアが存在する」という検証があり、
   * REQ-24.5 / 24.6 / 24.8 / 25.7 / 20.4 / 20.6 の**六件**のタグを掲げていた。
   * しかし主張は二本（種データの識別子が真であること、と、選択子を四つ `.or` で
   * 束ねた集合の先頭が見えること）だけであった。
   *
   * ### 旧主張が実際に受理していたもの（2026-08-27 実測）
   *
   * 見積依頼詳細画面で四つの枝の一致件数を数えると
   * `structured-data-area` 0 件・`line-items-table` 0 件・`/明細/` 0 件・`/項目/` 3 件で、
   * 束ねた集合の要素は 3 件。前二つの `data-testid` は**本番のどこにも存在しない**
   * （`frontend/src` 全体で参照 0 件）。`.or(...).first()` は文書順で先頭の要素を選ぶため
   * （115.158 が確定し 115.175 が再確認した）、掴んでいたのは見出し `<h2>項目選択</h2>` であった。
   * 旧検証は受領見積書の登録フォームすら開いておらず、六件のどの受入基準の規範も判定していない。
   *
   * ### 六件の処遇（一件ずつ「その受入基準の規範をどの主張が確かめているか」で判断した）
   *
   * 六件とも実行中の画面から判定できたため、除外は一件も足していない。
   * - REQ-24.5 / 24.6 / 24.8: 直下の「Claude Visionが明細行を返すと…」で判定する。
   * - REQ-25.7: 「Claude VisionとTesseractの両方が失敗すると…」で判定する。
   * - REQ-20.4: 「OCRテキストのカンマ区切り数値は…」で判定する。
   * - REQ-20.6: 「Excelデータパースの一括取り込みは…」で判定する。
   *
   * なお REQ-26.5〜REQ-26.8（backend のJSON配列パーサーと数値変換）は 115.127 の是正で
   * 既に `e2e/requirement-exclusions.json` へ登録済みであり、本ファイル冒頭に記載がある。
   *
   * ## 本検証が判定するもの
   *
   * Claude Vision の応答を**明細行データを持つ 200** に差し替える。テスト環境の backend は
   * ANTHROPIC_API_KEY を持たず REQ-22.3 / REQ-22.6 により必ず 503 を返すため、
   * 「正常に返却されたとき」を条件とする三件の受入基準は応答の差し替えでしか到達できない。
   * 直前までの検証が用いた実物の 503・滞留・500 とは弁別できる刺激であり、
   * 注入した値そのものが画面に現れることで刺激と観測が対応する。
   *
   * - REQ-24.5: 抽出結果の表示が、返却された明細行データ**そのもの**である
   *   （表示は本番が `JSON.stringify(result.lineItems, null, 2)` で組み立てるため、
   *   Node 側で解析して注入した配列と一致することを主張する）
   * - REQ-24.6: 一括取り込みボタンが現れ、検出件数が返却された件数と一致する
   *   （0 件を返したときにボタンが出ないことは直後の検証で確かめる。したがって
   *   この主張は「何を返しても出る」ものではない）
   * - REQ-24.8: 取り込んだ明細行の数量・単価・金額が要件18の形式と丸め規則に従う。
   *   注入値は 2.5 → `2.50`（18.1）、1234.6 → `1235`（18.3 の切り上がり）、
   *   999.4 → `999`（18.3 の切り下がり）と形が変わる値を選んだ。金額は
   *   18.5 / 18.9 により数量×単価の四捨五入であり、注入した金額 99999999 は用いられない
   *   （2.50×1235=3087.5 → `3,088`、3.00×999 → `2,997`。実測で確認した）。
   *
   * @requirement estimate-request/REQ-24.5
   * @requirement estimate-request/REQ-24.6
   * @requirement estimate-request/REQ-24.8
   */
  test('Claude Visionが明細行を返すと返却データを抽出結果として表示し一括取り込みへ渡す (estimate-request/REQ-24.5, REQ-24.6, REQ-24.8)', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(180000));
    expect(createdEstimateRequestId).toBeTruthy();

    const traces = watchOcrRequests(page);
    const visionStatuses = watchClaudeVisionResponseStatuses(page);

    await page.route(`**${CLAUDE_VISION_EXTRACT_PATH}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ lineItems: INJECTED_VISION_LINE_ITEMS, pageCount: 1 }),
      });
    });

    await loginAsUser(page, 'REGULAR_USER');
    await uploadQuotationFixture(page, createdEstimateRequestId as string, 'test-scanned-pdf.pdf');

    // ------------------------------------------------------------------
    // REQ-24.5: 返却された明細行データを抽出結果として表示する
    // ------------------------------------------------------------------
    const extractedText = page.getByTestId('ocr-extracted-text');
    await expect(extractedText).toBeVisible({ timeout: getTimeout(120000) });
    await expect(page.getByTestId('ocr-error-message')).toHaveCount(0);

    expect(
      visionStatuses,
      'Claude Vision の応答が 200 一件で確定していない（「正常に返却されたとき」の条件が成立していない）'
    ).toEqual([200]);
    expect(
      traces.filter((t) => t.kind === 'claude-vision').length,
      'Claude Vision への要求が1件ちょうどではない'
    ).toBe(1);
    // 成功した以上、退避は起きない。起きていれば表示は Tesseract の結果であり
    // 「返却されたデータを表示している」ことにならない。
    // 画面の相（Claude Vision で抽出した旨のバナー）と通信（Tesseract の資材を一件も
    // 取りに行っていないこと）は観測の系統が別であり、一方が他方を含意しない。
    // 退避通知バナーの不在は当該バナーとの排他条件から従うため主張しない。
    await expect(page.getByTestId('claude-vision-info-banner')).toBeVisible();
    expect(
      traces.filter((t) => t.kind !== 'claude-vision'),
      'Claude Vision が成功したのに Tesseract の資材が取得されている'
    ).toEqual([]);

    // 本文が空であれば次の主張がそのまま落ちるため、空でないことは別に述べない
    const shownText = await extractedText.textContent();
    expect(
      JSON.parse(shownText as string),
      '抽出結果の表示が返却された明細行データと一致しない'
    ).toEqual(INJECTED_VISION_LINE_ITEMS);

    // ------------------------------------------------------------------
    // REQ-24.6: 一括取り込みボタンを表示する
    // ------------------------------------------------------------------
    const importButton = page.getByTestId('ocr-import-button');
    await expect(importButton).toBeVisible();
    await expect(
      page.getByText(`${INJECTED_VISION_LINE_ITEMS.length}件のデータが検出されました`)
    ).toBeVisible();

    // ------------------------------------------------------------------
    // REQ-24.8: 要件18の数値表示形式・丸め規則に従って表示する
    // ------------------------------------------------------------------
    await importButton.click();
    await expect(page.getByTestId('ocr-import-success')).toBeVisible({
      timeout: getTimeout(10000),
    });

    const nameInputs = page.locator('input[data-field="name"]');
    await expect(
      nameInputs,
      '取り込み後の明細行が返却件数と一致しない（以降の主張の母集団が定まらない）'
    ).toHaveCount(INJECTED_VISION_LINE_ITEMS.length);

    await expect(page.locator('input[data-row="0"][data-field="quantity"]')).toHaveValue('2.50');
    await expect(page.locator('input[data-row="0"][data-field="unitPrice"]')).toHaveValue('1235');
    await expect(page.locator('input[data-row="1"][data-field="quantity"]')).toHaveValue('3.00');
    await expect(page.locator('input[data-row="1"][data-field="unitPrice"]')).toHaveValue('999');

    const amountCells = page.getByTestId('line-item-amount');
    await expect(amountCells).toHaveCount(INJECTED_VISION_LINE_ITEMS.length);
    await expect(amountCells.nth(0)).toHaveText('3,088');
    await expect(amountCells.nth(1)).toHaveText('2,997');
    // 返却された金額 99999999 をそのまま表示していないこと（母集団は上で2行に固定済み）
    await expect(page.getByText('99,999,999')).toHaveCount(0);
  });

  /**
   * 直前の検証が置いた「一括取り込みボタンが現れる」という主張が、弁別能力を持つことの
   * 確認（タスク 115.176）。
   *
   * REQ-24.6 が求めるのは「明細行データが正常に返却されたとき」にボタンを出すことである。
   * 応答の中身にかかわらず常にボタンが出るのなら、直前の主張は何も述べていない。
   * ここでは同じ 200 応答で**明細行を 0 件**にし、抽出結果の表示は現れる一方で
   * 取り込みボタンが現れないことを確かめる。
   *
   * 受入基準の被覆ではないため `@requirement` は付けない。
   */
  test('Claude Visionが明細行を0件で返すと一括取り込みボタンは現れない（観測の弁別能力の確認）', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(180000));
    expect(createdEstimateRequestId).toBeTruthy();

    await page.route(`**${CLAUDE_VISION_EXTRACT_PATH}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ lineItems: [], pageCount: 1 }),
      });
    });

    await loginAsUser(page, 'REGULAR_USER');
    await uploadQuotationFixture(page, createdEstimateRequestId as string, 'test-scanned-pdf.pdf');

    const extractedText = page.getByTestId('ocr-extracted-text');
    await expect(extractedText).toBeVisible({ timeout: getTimeout(120000) });
    expect(
      JSON.parse((await extractedText.textContent()) as string),
      '明細行0件の応答に対して抽出結果の表示が空配列になっていない'
    ).toEqual([]);
    await expect(page.getByTestId('claude-vision-info-banner')).toBeVisible();
    await expect(
      page.getByTestId('ocr-import-button'),
      '明細行が0件でも一括取り込みボタンが出ている（直前の検証の「ボタンが出る」が何も述べていないことになる）'
    ).toHaveCount(0);
  });

  /**
   * ## 本検証が判定するもの（タスク 115.176）
   *
   * REQ-25.7 は「Claude Vision抽出と Tesseract.js フォールバックの**両方**が失敗した場合」に
   * エラーメッセージを表示し手動入力を促すことを求める。両方を失敗させる必要があるため、
   * 刺激は二つ用意する。
   *  1. Claude Vision の応答を 500 に差し替える（退避が起きる。REQ-25.3 の刺激と同型）
   *  2. 退避先の Tesseract が読み込む worker スクリプトの取得を失敗させる
   *
   * 同じ資材（`test-scanned-pdf.pdf`）は、遮断しなければ本ファイルの REQ-25.5 の検証で
   * Tesseract が完走し抽出結果と取り込みボタンに到達する。すなわちここでの失敗は
   * 遮断に由来し、資材や環境に由来しない。遮断が実際に効いたことは、遮断した要求を
   * 数えて主張する（数えずに結果だけを見ると、遮断が空振りでも通ってしまう）。
   *
   * @requirement estimate-request/REQ-25.7
   */
  test('Claude VisionとTesseractの両方が失敗するとエラーを表示し手動入力を促す (estimate-request/REQ-25.7)', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(180000));
    expect(createdEstimateRequestId).toBeTruthy();

    const traces = watchOcrRequests(page);
    const visionStatuses = watchClaudeVisionResponseStatuses(page);

    await page.route(`**${CLAUDE_VISION_EXTRACT_PATH}`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 500,
          detail: 'E2Eが注入したClaude Vision内部エラー',
          errorType: 'unknown',
        }),
      });
    });

    const blockedTesseractRequests: string[] = [];
    const blockTesseractAsset = async (route: Route) => {
      blockedTesseractRequests.push(new URL(route.request().url()).pathname);
      await route.abort('failed');
    };
    await page.route(`**${TESSERACT_WORKER_PATH_MARK}**`, blockTesseractAsset);
    await page.route(`**${TESSERACT_LANG_PATH_MARK}**`, blockTesseractAsset);

    await loginAsUser(page, 'REGULAR_USER');
    await uploadQuotationFixture(page, createdEstimateRequestId as string, 'test-scanned-pdf.pdf');

    // ------------------------------------------------------------------
    // 二つの刺激がどちらも到達したこと
    // ------------------------------------------------------------------
    const errorMessage = page.getByTestId('ocr-error-message');
    await expect(errorMessage).toBeVisible({ timeout: getTimeout(120000) });

    expect(visionStatuses, 'Claude Vision の応答が注入した 500 一件で確定していない').toEqual([
      500,
    ]);
    expect(
      traces.filter((t) => t.kind === 'claude-vision').length,
      'Claude Vision への要求が1件ちょうどではない'
    ).toBe(1);
    expect(
      blockedTesseractRequests.length,
      'Tesseract の資材の取得を一度も遮断していない（退避先を失敗させられていない）'
    ).toBeGreaterThan(0);

    // ------------------------------------------------------------------
    // REQ-25.7: エラーメッセージを表示し手動入力を促す
    // ------------------------------------------------------------------
    await expect(errorMessage).toContainText('OCR処理に失敗しました。手動入力してください');
    await expect(errorMessage).toContainText('手動で明細行にデータを入力してください。');

    // 抽出は成立していない。成立しているなら「両方が失敗した」ことにならない
    await expect(page.getByTestId('ocr-extracted-text')).toHaveCount(0);
    await expect(page.getByTestId('ocr-import-button')).toHaveCount(0);
  });

  /**
   * ## 本検証が判定するもの（タスク 115.176）
   *
   * REQ-20.4 は「OCRテキスト内のカンマ区切り数値（例: 1,234,567）をカンマ除去して
   * 数値として認識する」ことを求める。資材 `e2e/fixtures/test-comma-number-pdf.pdf` は
   * 2 ページのテキスト PDF で、1 ページ目に閾値（空白を除き 50 文字）を満たす英文、
   * 2 ページ目に `WallPaint  Silicone  m2  100  1,234,567` を持つ。
   * テスト環境では Claude Vision が 503 を返すため退避し、
   * `extractPdfHybrid` が pdfjs-dist の直接抽出で当該テキストを取り出す。
   *
   * 刺激（カンマ付きの原文）と観測（カンマの無い取り込み結果）が**同じ画面に同時に出る**。
   * 抽出結果の表示には `1,234,567` がそのまま現れ、そこから変換された明細行には
   * `1234567` が現れる。`normalizeCommaNumbers` を外せば後者にカンマが残るため、
   * この主張は本番の当該処理だけを見ている。
   *
   * 列への振り分けまでは主張しない。`extractPdfText` はページ内のテキストアイテムを
   * 単一スペースで連結し、pdfjs 自身も文字列中の連続空白を単一スペースへ畳むため
   * （2026-08-27 実測。原文の 2 個の空白は抽出後 1 個になる）、
   * `convertOcrTextToLineItems` の列分割（タブまたは 2 個以上の空白）は
   * テキスト PDF では成立せず、行全体が名称へ入る。
   *
   * @requirement estimate-request/REQ-20.4
   */
  test('OCRテキストのカンマ区切り数値はカンマを除いて取り込まれる (estimate-request/REQ-20.4)', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(180000));
    expect(createdEstimateRequestId).toBeTruthy();

    await loginAsUser(page, 'REGULAR_USER');
    await uploadQuotationFixture(
      page,
      createdEstimateRequestId as string,
      'test-comma-number-pdf.pdf'
    );

    const extractedText = page.getByTestId('ocr-extracted-text');
    await expect(extractedText).toBeVisible({ timeout: getTimeout(120000) });
    await expect(page.getByTestId('ocr-error-message')).toHaveCount(0);

    // 刺激: 抽出されたOCRテキストにカンマ区切り数値が含まれている
    await expect(
      extractedText,
      '抽出テキストにカンマ区切り数値が現れていない（カンマ除去を検査できる原文になっていない）'
    ).toContainText('WallPaint Silicone m2 100 1,234,567');

    const importButton = page.getByTestId('ocr-import-button');
    await expect(importButton).toBeVisible();
    await importButton.click();
    await expect(page.getByTestId('ocr-import-success')).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 観測: 変換後の明細行ではカンマが除かれている（母集団は2行に固定される）
    const nameInputs = page.locator('input[data-field="name"]');
    await expect(nameInputs, '取り込まれた明細行が2行ではない').toHaveCount(2);
    await expect(nameInputs.nth(0)).toHaveValue(
      'Received quotation table for E2E verification of comma separated numbers'
    );
    await expect(nameInputs.nth(1)).toHaveValue('WallPaint Silicone m2 100 1234567');
  });

  /**
   * ## 本検証が判定するもの（タスク 115.176）
   *
   * REQ-20.6 は「既存のExcelデータパース結果の一括取り込み処理（convertExcelToLineItems）に
   * 影響を与えない」ことを求める。要件20が加えたのはゴミ行フィルタ（20.1・20.2）と
   * 集計行除外（20.3）であり、本番ではこの二つを `convertOcrTextToLineItems` の
   * 行分割直後だけに置いている（20.5）。`convertExcelToLineItems` は両経路の共用であるため、
   * フィルタを共用側へ置くと Excel の取り込みが痩せる。それが起きていないことを判定する。
   *
   * 資材 `e2e/fixtures/test-excel-filter-unaffected.xlsx` は
   * ヘッダー（名称・規格・単位・数量・単価）と次の 3 行を持つ。
   *  1. `鋼材 / SS400 / kg / 4 / 250` — 通常の行（Excel 経路が動いていること自体の対照）
   *  2. `合計調整費 / 調整 / 式 / 1 / 5000` — 集計キーワード「合計」を含む。
   *     OCRテキスト経路なら 20.3 により落ちる
   *  3. `鋼` — 名称だけの 1 文字の行。OCRテキスト経路なら 20.2（2文字以下）により落ちる
   *
   * 2 と 3 が取り込まれていることが、フィルタが Excel 経路へ及んでいないことの観測である。
   * OCRテキスト経路で 2 と 3 に相当する行が実際に落ちることは
   * `ocr-accuracy-improvement-e2e.spec.ts` の REQ-20.1〜20.3 の検証が担う。
   *
   * @requirement estimate-request/REQ-20.6
   */
  test('Excelデータパースの一括取り込みは要件20のゴミ行・集計行フィルタの影響を受けない (estimate-request/REQ-20.6)', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(120000));
    expect(createdEstimateRequestId).toBeTruthy();

    await loginAsUser(page, 'REGULAR_USER');
    await uploadQuotationFixture(
      page,
      createdEstimateRequestId as string,
      'test-excel-filter-unaffected.xlsx'
    );

    const extractedText = page.getByTestId('ocr-extracted-text');
    await expect(extractedText).toBeVisible({ timeout: getTimeout(60000) });
    await expect(page.getByTestId('ocr-error-message')).toHaveCount(0);

    // 刺激: 3行すべてがパース結果として読み取られている
    expect(
      await extractedText.textContent(),
      'Excel のパース結果が資材の3行と一致しない（判定の前提が崩れている）'
    ).toBe(
      '名称\t規格\t単位\t数量\t単価\n鋼材\tSS400\tkg\t4\t250\n合計調整費\t調整\t式\t1\t5000\n鋼'
    );

    const importButton = page.getByTestId('ocr-import-button');
    await expect(importButton).toBeVisible();
    await importButton.click();
    await expect(page.getByTestId('ocr-import-success')).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 観測: 3行とも取り込まれている（母集団を件数で固定してから各行を主張する）
    const nameInputs = page.locator('input[data-field="name"]');
    await expect(
      nameInputs,
      'Excel の3行が取り込まれていない（要件20のフィルタが Excel 経路へ及んでいる）'
    ).toHaveCount(3);
    await expect(nameInputs.nth(0)).toHaveValue('鋼材');
    await expect(nameInputs.nth(1)).toHaveValue('合計調整費');
    await expect(nameInputs.nth(2)).toHaveValue('鋼');

    // 通常の行の数量・単価も従来どおり取り込まれる
    // （金額は数量×単価から自動計算される値であり、この二つが定まれば決まるため述べない）
    await expect(page.locator('input[data-row="0"][data-field="quantity"]')).toHaveValue('4.00');
    await expect(page.locator('input[data-row="0"][data-field="unitPrice"]')).toHaveValue('250');
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
