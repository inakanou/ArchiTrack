/**
 * @fileoverview 写真枚数によらない画面表示の応答性のE2Eテスト
 *
 * Task 113.2: 画面表示で発生する画像関連リクエストが登録枚数に比例しないことを確認する
 *
 * Requirements coverage (site-survey):
 * - REQ-38.1: 画像一覧と各画像の表示に必要な情報を、画像ごとの個別リクエストに分割せず1回のリクエストで取得する
 * - REQ-38.2: 注釈を反映したサムネイルの表示のために、登録写真の枚数に比例した追加リクエストを発生させない
 * - REQ-38.3: 画像に関して発生するリクエストを、画像一覧の取得1回と表示領域に入った画像に対する取得のみに限定する
 * - REQ-38.8: 表示領域外の画像の取得を表示領域に入るまで行わない
 *
 * ## 観測方式
 *
 * リクエストの選別は**オリジンではなくパス**で行う。ブラウザが使うAPIオリジン
 * （`VITE_API_URL`）とE2E側の `API_BASE_URL` は同一とは限らず（CIでは前者が
 * `localhost:3000`、後者が `127.0.0.1:3000`）、オリジン文字列で選別すると
 * 観測対象が1件も残らないまま「リクエストは少ない」が常に成立してしまうため。
 *
 * 画像本体の判定はストレージキーの後方一致で行う。合成済みサムネイルの保存先は
 * 原本・通常サムネイルとは別のプレフィックス（`annotated-thumbnails/...`）を取り得るため、
 * 「現場調査IDを含むパス」のような前方一致では取りこぼす。
 *
 * ## 前提状態の確認経路
 *
 * 詳細画面が実際に用いる取得経路は `GET /api/site-surveys/:id` である。前提状態
 * （合成済みサムネイルの表示元URLが供給されていること）の確認を
 * `GET /api/site-surveys/:id/images` に対して行うと、詳細応答側の欠落を見落として
 * 偽の安心を与える（Task 111.5 の起票経緯）。本テストは前提確認も観測も詳細取得経路で行う。
 *
 * ## 判定が素通りしないことの担保
 *
 * 「初期表示の取得件数 < 登録枚数」だけでは、観測条件の誤りで0件を数えている場合も
 * 成立してしまう。そのため次を併せて検証する。
 *
 * 1. 初期表示の取得件数が1件以上であること
 * 2. 全画像を表示領域へ入れると、同じ計数器が登録枚数へ到達すること
 * 3. 注釈取得についても、合成済みサムネイルを持たない画像では表示領域到達後に
 *    実際に発生すること（＝「注釈取得が0件」が観測漏れではないこと）
 * 4. 合成済みサムネイルのキーが、対象画像の原本とも通常サムネイルとも、また当該現場調査の
 *    どの画像のキーとも異なること（＝どの表示元が採用されたかがパスで一意に判別できること）
 *
 * 実測値はテストログへ出力する。
 *
 * ## 詳細画面が発行するリクエスト
 *
 * 現場調査詳細画面は `GET /api/site-surveys/:id` の1回で画像一覧と表示に必要な情報を
 * 受け取り（38.1）、画像本体はストレージの署名付きURLへ、注釈データは
 * `GET /api/site-surveys/images/:imageId/annotations` へ送出される。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient } from '../../fixtures/database';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { assertPrepared } from '../../helpers/preconditions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 定数
// ============================================================================

/**
 * 登録する写真の枚数
 *
 * 写真1件あたりのパネル高さは約380pxであり、計測に用いる表示領域（下記）へ初期表示で
 * 入るのは先頭の数件に限られる。「表示領域に収まりきらない枚数」を満たす枚数として
 * 10枚を用いる（1リクエストあたりのアップロード上限も10件）。
 */
const IMAGE_COUNT = 10;

/**
 * 注釈を保存する画像の位置（0始まり）
 *
 * いずれも初期表示の表示領域には入らない位置とする。表示領域外では注釈取得も
 * 発生しないこと（38.8）と、表示領域へ入れば発生すること（観測が有効であること）の
 * 双方を同一の画面で確認するため。
 */
const ANNOTATED_INDEX_WITHOUT_THUMBNAIL = 4;
const ANNOTATED_INDEX_WITH_THUMBNAIL = IMAGE_COUNT - 1;

/**
 * 計測に用いる表示領域の大きさ
 *
 * 現場調査詳細画面は写真一覧の上に見出し・メタ情報・アップロード領域を持ち、既定の
 * 720px高では写真が1枚も表示領域へ入らない。それでも「取得件数 < 登録枚数」は成立して
 * しまうため、**一部の写真だけが表示領域へ入る**高さを用いて判定に意味を持たせる。
 * 1280x1600 は実在するデスクトップ環境の大きさであり、写真10枚のうち先頭の数枚のみが
 * 表示領域（+先読み余白50px）へ入る。
 */
const MEASUREMENT_VIEWPORT = { width: 1280, height: 1600 } as const;

/**
 * 現場調査詳細の取得APIのパス
 *
 * 詳細画面は画像一覧と各画像の表示に必要な情報をこの1回のリクエストで受け取る（38.1）。
 */
const surveyDetailPath = (surveyId: string): string => `/api/site-surveys/${surveyId}`;

/** 注釈データ取得APIのパス */
const ANNOTATION_PATH_PATTERN = /^\/api\/site-surveys\/images\/([0-9a-f-]+)\/annotations$/i;

// ============================================================================
// 型
// ============================================================================

/** `GET /api/site-surveys/:id` が返す画像要素のうち本テストが用いる項目 */
interface DetailImage {
  id: string;
  fileName: string;
  width: number;
  height: number;
  originalPath: string;
  thumbnailPath: string;
  thumbnailUrl: string | null;
  annotatedThumbnailUrl: string | null;
  hasAnnotations: boolean;
}

/**
 * 画像本体リクエストの分類に用いるストレージキーの目録
 *
 * キーは署名付きURLのパス末尾に現れる。オリジンや署名クエリに依存せず後方一致で判定する。
 */
interface StorageKeyCatalog {
  /** 縮小表示の表示元となり得るキー（通常サムネイル・合成済みサムネイル） */
  displaySourceKeys: string[];
  /** 原本のキー。縮小表示では取得されない想定（38.7） */
  originalKeys: string[];
}

// ============================================================================
// リクエスト観測
// ============================================================================

interface ImageRequestObservation {
  /** 縮小表示の表示元として取得されたストレージキー。発生順・重複あり */
  displaySourceKeys: string[];
  /** 原本として取得されたストレージキー。発生順・重複あり */
  originalKeys: string[];
  /** 目録のどれにも該当しなかったストレージ宛のパス。観測漏れの検知用 */
  unclassifiedStoragePaths: string[];
  /** 注釈データ取得のパス。発生順・重複あり */
  annotationPaths: string[];
  /** 現場調査詳細取得のパス。発生順・重複あり */
  surveyDetailPaths: string[];
  stop: () => void;
}

/**
 * 現場調査の画像に関するリクエストをパス基準で観測する
 *
 * 画像本体はストレージの署名付きURLへ送出されるためオリジンがAPIと異なる。
 * どちらの経路も `new URL(url).pathname` に対する判定のみで分類し、接続先の違いで
 * 判定が変わらないようにする。
 *
 * @param page - 観測対象のページ
 * @param surveyId - 対象の現場調査ID
 * @param catalog - 画像本体の分類に用いるストレージキーの目録
 */
function observeImageRequests(
  page: Page,
  surveyId: string,
  catalog: StorageKeyCatalog
): ImageRequestObservation {
  const displaySourceKeys: string[] = [];
  const originalKeys: string[] = [];
  const unclassifiedStoragePaths: string[] = [];
  const annotationPaths: string[] = [];
  const surveyDetailPaths: string[] = [];

  const record = (request: { url: () => string; method: () => string }): void => {
    let pathname: string;
    try {
      pathname = new URL(request.url()).pathname;
    } catch {
      return;
    }
    if (request.method() === 'OPTIONS') {
      return;
    }

    if (pathname.startsWith('/api/')) {
      if (pathname === surveyDetailPath(surveyId)) {
        surveyDetailPaths.push(pathname);
        return;
      }
      if (ANNOTATION_PATH_PATTERN.test(pathname)) {
        annotationPaths.push(pathname);
      }
      return;
    }

    // ストレージ側。署名付きURLのパス末尾に現れるキーで分類する
    const displayKey = catalog.displaySourceKeys.find((key) => pathname.endsWith(key));
    if (displayKey) {
      displaySourceKeys.push(displayKey);
      return;
    }
    const originalKey = catalog.originalKeys.find((key) => pathname.endsWith(key));
    if (originalKey) {
      originalKeys.push(originalKey);
      return;
    }
    if (pathname.includes('/storage/')) {
      unclassifiedStoragePaths.push(pathname);
    }
  };

  page.on('request', record);
  return {
    displaySourceKeys,
    originalKeys,
    unclassifiedStoragePaths,
    annotationPaths,
    surveyDetailPaths,
    stop: () => page.off('request', record),
  };
}

/** 重複を除いた件数 */
const uniqueCount = (values: string[]): number => new Set(values).size;

// ============================================================================
// テスト
// ============================================================================

/**
 * @requirement site-survey/REQ-38.1
 * @requirement site-survey/REQ-38.2
 * @requirement site-survey/REQ-38.3
 * @requirement site-survey/REQ-38.8
 */
test.describe('写真枚数によらない画面表示の応答性', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  /** アップロードした画像の一覧（表示順） */
  let detailImages: DetailImage[] = [];
  /** 注釈があり、合成済みサムネイルを持つ画像 */
  let imageWithComposedThumbnail: DetailImage | null = null;
  /** 注釈があり、合成済みサムネイルを持たない画像（クライアント合成へ退避する） */
  let imageWithoutComposedThumbnail: DetailImage | null = null;
  /** 合成済みサムネイルとして用いるストレージキー */
  let composedThumbnailKey: string | null = null;
  /** 画像本体リクエストの分類に用いる目録 */
  let storageKeyCatalog: StorageKeyCatalog = { displaySourceKeys: [], originalKeys: [] };

  /**
   * 事前準備
   *
   * 表示領域に収まりきらない枚数の写真を持つ現場調査は既存のシードデータに存在しない
   * ため、テスト内で作成する。
   */
  test.beforeAll(async ({ browser }) => {
    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();

    try {
      await loginAsUser(page, 'REGULAR_USER');

      // --- プロジェクト作成 ---
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `画像リクエスト計測_${Date.now()}`;
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
      createdProjectId = page.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1] ?? null;
      expect(createdProjectId).toBeTruthy();

      // --- 現場調査作成 ---
      await page.goto(`/projects/${createdProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

      const surveyDate = new Date().toISOString().split('T')[0]!;
      await page.getByLabel(/調査名/i).fill(`画像リクエスト計測用現場調査_${Date.now()}`);
      await page.getByLabel(/調査日/i).fill(surveyDate);

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
      createdSurveyId = page.url().match(/\/site-surveys\/([0-9a-f-]+)$/)?.[1] ?? null;
      expect(createdSurveyId).toBeTruthy();

      // --- 写真を登録 ---
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.png');
      expect(fs.existsSync(testImagePath)).toBeTruthy();
      const imageBuffer = fs.readFileSync(testImagePath);

      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      expect(accessToken).toBeTruthy();
      const authHeaders = { Authorization: `Bearer ${accessToken}` };

      const uploadImage = async (surveyId: string, fileName: string): Promise<void> => {
        const uploadResponse = await page.request.post(
          `${API_BASE_URL}/api/site-surveys/${surveyId}/images`,
          {
            headers: authHeaders,
            multipart: {
              images: { name: fileName, mimeType: 'image/png', buffer: imageBuffer },
            },
          }
        );
        expect(uploadResponse.ok()).toBeTruthy();
      };

      for (let index = 0; index < IMAGE_COUNT; index++) {
        await uploadImage(createdSurveyId!, `req38-${String(index + 1).padStart(2, '0')}.png`);
      }

      /**
       * 詳細画面が実際に用いる取得経路。前提確認・目録作成の双方をこの応答で行う。
       */
      const fetchDetailImages = async (surveyId: string): Promise<DetailImage[]> => {
        const response = await page.request.get(`${API_BASE_URL}${surveyDetailPath(surveyId)}`, {
          headers: authHeaders,
        });
        expect(response.ok()).toBeTruthy();
        return ((await response.json()) as { images: DetailImage[] }).images;
      };

      detailImages = await fetchDetailImages(createdSurveyId!);
      expect(detailImages).toHaveLength(IMAGE_COUNT);

      // 表示領域の観測は画像の実寸に依存する。実寸が正の値でない場合は観測を行わず
      // 即時取得へ縮退するため、前提が崩れていないことを確認する
      for (const image of detailImages) {
        expect(image.width).toBeGreaterThan(0);
        expect(image.height).toBeGreaterThan(0);
      }

      // --- 合成済みサムネイルの実体を用意する ---
      // 注釈をレンダリングしたサムネイル画像の生成契機は Requirement 20.4 / 23.1 の所管で
      // あり、本要件（38.2 / 38.5）は「利用可能である」状態での表示側の振る舞いを定める。
      // 現状の実行環境では当該画像を生成する経路が動作していないため、検証対象の前提状態
      // （annotatedThumbnailPath が設定済み）をテストデータとして用意する。
      //
      // 保存先には、計測対象の現場調査とは別の現場調査へアップロードした画像のサムネイルを
      // 用いる。実体のあるオブジェクトでありながら、計測対象の画面が他の用途で取得すること
      // が無いキーであるため、「どの表示元が採用されたか」をパスで一意に判別できる。
      const donorSurveyResponse = await page.request.post(
        `${API_BASE_URL}/api/projects/${createdProjectId}/site-surveys`,
        {
          headers: authHeaders,
          data: { name: `合成済みサムネイル供給用_${Date.now()}`, surveyDate },
        }
      );
      expect(donorSurveyResponse.ok()).toBeTruthy();
      const donorSurveyId = ((await donorSurveyResponse.json()) as { id: string }).id;
      await uploadImage(donorSurveyId, 'req38-composed-thumbnail.png');
      const donorImages = await fetchDetailImages(donorSurveyId);
      expect(donorImages).toHaveLength(1);
      composedThumbnailKey = donorImages[0]!.thumbnailPath;
      expect(composedThumbnailKey).toBeTruthy();

      // --- 表示領域外の2枚へ注釈を保存する ---
      const saveAnnotation = async (image: DetailImage): Promise<void> => {
        const response = await page.request.put(
          `${API_BASE_URL}/api/site-surveys/images/${image.id}/annotations`,
          {
            headers: authHeaders,
            data: {
              data: {
                version: '6.0.0',
                objects: [
                  {
                    type: 'Rect',
                    left: 10,
                    top: 10,
                    width: 40,
                    height: 30,
                    fill: 'transparent',
                    stroke: '#ff0000',
                    strokeWidth: 3,
                  },
                ],
                canvasWidth: image.width,
                canvasHeight: image.height,
              },
            },
          }
        );
        expect(response.ok()).toBeTruthy();
      };

      await saveAnnotation(detailImages[ANNOTATED_INDEX_WITHOUT_THUMBNAIL]!);
      await saveAnnotation(detailImages[ANNOTATED_INDEX_WITH_THUMBNAIL]!);

      // --- 片方に合成済みサムネイルを持たせる ---
      const prisma = getPrismaClient();
      await prisma.surveyImage.update({
        where: { id: detailImages[ANNOTATED_INDEX_WITH_THUMBNAIL]!.id },
        data: { annotatedThumbnailPath: composedThumbnailKey },
      });

      // --- 準備した状態を、詳細画面が用いる取得経路の応答で確認する ---
      detailImages = await fetchDetailImages(createdSurveyId!);
      imageWithComposedThumbnail = detailImages[ANNOTATED_INDEX_WITH_THUMBNAIL]!;
      imageWithoutComposedThumbnail = detailImages[ANNOTATED_INDEX_WITHOUT_THUMBNAIL]!;

      expect(imageWithComposedThumbnail.hasAnnotations).toBe(true);
      expect(imageWithComposedThumbnail.annotatedThumbnailUrl).toBeTruthy();
      expect(new URL(imageWithComposedThumbnail.annotatedThumbnailUrl!).pathname).toContain(
        composedThumbnailKey!
      );
      expect(imageWithoutComposedThumbnail.hasAnnotations).toBe(true);
      expect(imageWithoutComposedThumbnail.annotatedThumbnailUrl).toBeNull();

      // 表示元の判別が成立すること。合成済みサムネイルのキーは、対象画像の原本とも
      // 通常サムネイルとも異なり、かつ当該現場調査のどの画像のキーとも一致しない
      expect(composedThumbnailKey).not.toBe(imageWithComposedThumbnail.originalPath);
      expect(composedThumbnailKey).not.toBe(imageWithComposedThumbnail.thumbnailPath);
      const surveyStorageKeys = detailImages.flatMap((image) => [
        image.originalPath,
        image.thumbnailPath,
      ]);
      expect(surveyStorageKeys).not.toContain(composedThumbnailKey);

      // --- 画像本体リクエストの分類に用いる目録を作る ---
      storageKeyCatalog = {
        displaySourceKeys: [
          ...detailImages.map((image) => image.thumbnailPath),
          composedThumbnailKey!,
        ],
        originalKeys: detailImages.map((image) => image.originalPath),
      };

      console.log(
        `[REQ-38] 準備完了: 登録枚数=${IMAGE_COUNT} / 合成済みサムネイルのキー=${composedThumbnailKey}`
      );
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    // 前提が用意されていなければ削除すべき対象も無い。黙って戻ると「後片付けした」ことになり、
    // 前提の生成が壊れたことが記録に残らない。前提が崩れた地点で失敗させる。
    assertPrepared(createdProjectId, '事前準備で作成したプロジェクトのID');

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsUser(page, 'ADMIN_USER');
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      const deleteResponse = await page.request.delete(
        `${API_BASE_URL}/api/projects/${createdProjectId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      expect([200, 204, 404]).toContain(deleteResponse.status());
    } finally {
      await context.close();
    }
  });

  /**
   * 現場調査詳細画面を開き、画像の描画が始まるまで待つ
   *
   * ブラウザキャッシュの影響を受けないよう、呼び出し側は毎回新しいコンテキストを用いる。
   */
  async function openSurveyDetail(page: Page): Promise<void> {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/site-surveys/${createdSurveyId}`);

    // 先頭の画像に表示元URLが設定される＝表示領域内の画像の取得が始まったことを待つ
    await expect(page.getByAltText(detailImages[0]!.fileName)).toHaveAttribute('src', /.+/, {
      timeout: getTimeout(20000),
    });
    await page.waitForLoadState('networkidle');
  }

  /**
   * 全ての画像を順に表示領域へ入れる
   */
  async function scrollThroughAllImages(page: Page): Promise<void> {
    for (const image of detailImages) {
      await page.getByAltText(image.fileName).scrollIntoViewIfNeeded();
    }
    await page.waitForLoadState('networkidle');
  }

  /**
   * @requirement site-survey/REQ-38.1
   * @requirement site-survey/REQ-38.3
   * @requirement site-survey/REQ-38.8
   */
  test('初期表示で発生する画像関連リクエストの合計が登録写真の総数より少ないこと (site-survey/REQ-38.1, site-survey/REQ-38.3, site-survey/REQ-38.8)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MEASUREMENT_VIEWPORT });
    const page = await context.newPage();
    try {
      const observation = observeImageRequests(page, createdSurveyId!, storageKeyCatalog);
      await openSurveyDetail(page);
      observation.stop();

      const imageBodyCount = uniqueCount(observation.displaySourceKeys);
      const annotationCount = uniqueCount(observation.annotationPaths);
      const total = imageBodyCount + annotationCount;

      console.log(
        `[REQ-38] 登録枚数=${IMAGE_COUNT} / 初期表示: 画像本体=${imageBodyCount} 注釈取得=${annotationCount} 合計=${total} / 詳細取得=${observation.surveyDetailPaths.length} / 原本取得=${uniqueCount(observation.originalKeys)} / 未分類ストレージ=${JSON.stringify(observation.unclassifiedStoragePaths)}`
      );
      console.log(
        `[REQ-38] 初期表示で観測した表示元キー: ${JSON.stringify([...new Set(observation.displaySourceKeys)])}`
      );

      // 画像一覧は画像ごとに分割されず1回で取得される（38.1）
      expect(observation.surveyDetailPaths).toHaveLength(1);

      // 観測条件の誤りにより0件を数えていないこと（判定の素通り防止）
      expect(imageBodyCount).toBeGreaterThan(0);

      // 画像関連リクエストの合計が登録枚数を下回る（38.3, 38.8）
      expect(total).toBeLessThan(IMAGE_COUNT);

      // 表示領域外の画像は注釈を持っていても注釈取得が発生しない（38.8）
      expect(observation.annotationPaths).toHaveLength(0);

      // 縮小表示に原本を用いないため、初期表示で原本の取得は発生しない（38.3）
      expect(uniqueCount(observation.originalKeys)).toBe(0);

      // 表示元・原本・注釈のいずれにも分類されない画像関連リクエストが無いこと。
      // 分類漏れがあると上の合計が実態より小さく見え、判定が緩む（38.3）
      expect(observation.unclassifiedStoragePaths).toEqual([]);
    } finally {
      await context.close();
    }
  });

  /**
   * @requirement site-survey/REQ-38.2
   */
  test('合成済みサムネイルを持つ画像は表示領域へ入れても注釈データの取得が発生しないこと (site-survey/REQ-38.2)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MEASUREMENT_VIEWPORT });
    const page = await context.newPage();
    try {
      const observation = observeImageRequests(page, createdSurveyId!, storageKeyCatalog);
      await openSurveyDetail(page);

      // 注釈を持つ2枚（合成済みサムネイルあり／なし）を表示領域へ入れる
      await scrollThroughAllImages(page);

      // 合成済みサムネイルが取得された＝当該画像は表示領域へ入り、その画像を表示元とした
      await expect
        .poll(() => observation.displaySourceKeys.includes(composedThumbnailKey!), {
          timeout: getTimeout(20000),
          message:
            `合成済みサムネイル(${composedThumbnailKey})が表示元として取得されていない。` +
            '現場調査詳細画面が受け取る画像情報に annotatedThumbnailUrl が含まれているかを確認すること',
        })
        .toBe(true);

      // 合成済みサムネイルを持たない画像では注釈取得が発生する。
      // これが観測できることで、下の「発生しない」判定が観測漏れでないことが示される
      const annotationPathOf = (imageId: string): string =>
        `/api/site-surveys/images/${imageId}/annotations`;
      await expect
        .poll(
          () =>
            observation.annotationPaths.includes(
              annotationPathOf(imageWithoutComposedThumbnail!.id)
            ),
          {
            timeout: getTimeout(20000),
            message:
              '合成済みサムネイルを持たない画像で注釈取得が観測できない。' +
              '注釈取得の観測条件が誤っている可能性がある',
          }
        )
        .toBe(true);

      observation.stop();

      const annotationRequestsForComposed = observation.annotationPaths.filter(
        (requestPath) => requestPath === annotationPathOf(imageWithComposedThumbnail!.id)
      );

      console.log(
        `[REQ-38] 合成済みサムネイルあり(${imageWithComposedThumbnail!.id}): 注釈取得=${annotationRequestsForComposed.length} / 合成済みサムネイルなし(${imageWithoutComposedThumbnail!.id}): 注釈取得=${
          observation.annotationPaths.filter(
            (requestPath) => requestPath === annotationPathOf(imageWithoutComposedThumbnail!.id)
          ).length
        }`
      );

      // 表示領域へ入っても注釈データの取得は発生しない（38.2）
      expect(annotationRequestsForComposed).toHaveLength(0);

      // 表示元にはサムネイルではなく合成済みサムネイルが用いられる（38.2 の前提）
      expect(observation.displaySourceKeys).not.toContain(
        imageWithComposedThumbnail!.thumbnailPath
      );
    } finally {
      await context.close();
    }
  });

  /**
   * @requirement site-survey/REQ-38.8
   */
  test('スクロール後に追加の画像取得が発生し、遅延であって欠落ではないこと (site-survey/REQ-38.8)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MEASUREMENT_VIEWPORT });
    const page = await context.newPage();
    try {
      const observation = observeImageRequests(page, createdSurveyId!, storageKeyCatalog);
      await openSurveyDetail(page);

      const initialImageBodyCount = uniqueCount(observation.displaySourceKeys);
      expect(initialImageBodyCount).toBeGreaterThan(0);
      expect(initialImageBodyCount).toBeLessThan(IMAGE_COUNT);

      await scrollThroughAllImages(page);

      // 全画像が最終的に取得される（取得は「遅延」であって「欠落」ではない）
      await expect
        .poll(() => uniqueCount(observation.displaySourceKeys), { timeout: getTimeout(20000) })
        .toBeGreaterThanOrEqual(IMAGE_COUNT);

      observation.stop();
      const finalImageBodyCount = uniqueCount(observation.displaySourceKeys);

      console.log(
        `[REQ-38] 表示元の取得件数: 初期表示=${initialImageBodyCount} → スクロール後=${finalImageBodyCount}（登録枚数=${IMAGE_COUNT}）`
      );

      // スクロールによって追加の取得が発生した（38.8）
      expect(finalImageBodyCount).toBeGreaterThan(initialImageBodyCount);
      // 画像一覧の取得は増えない（表示領域到達で一覧を引き直していない）
      expect(observation.surveyDetailPaths).toHaveLength(1);
    } finally {
      await context.close();
    }
  });
});
