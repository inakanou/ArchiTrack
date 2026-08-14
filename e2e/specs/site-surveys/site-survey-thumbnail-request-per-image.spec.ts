/**
 * @fileoverview 縮小表示のリクエスト数が1枚あたり1件であることのE2Eテスト
 *
 * Task 115.9: 縮小表示のリクエスト数が1枚あたり1件であることを検証する
 *
 * Requirements coverage (site-survey):
 * - REQ-38.2: 注釈を反映したサムネイルの表示のために、登録写真の枚数に比例した追加リクエストを発生させない
 * - REQ-38.3: 画像に関して発生するリクエストを、画像一覧の取得1回と表示領域に入った画像に対する取得のみに限定する
 * - REQ-38.5: 注釈をレンダリングしたサムネイル画像が利用可能なとき、縮小表示に当該画像を用いる
 * - REQ-38.6: 合成済みサムネイルが利用できない画像は代替手段（クライアント合成）で注釈付きの表示結果を維持し、そのための取得も表示領域に入った画像に限る
 * - REQ-38.7: 詳細画面の縮小表示にサムネイル画像を用い、原本画像を取得しない
 *
 * ## 検証する状態
 *
 * 合成済みサムネイル（`annotatedThumbnailPath`）が生成されるのは画像編集画面での保存時
 * のみである（Task 115.1 / 115.3）。そのため前提状態は**実際の画像編集画面を操作して**
 * 用意する。データを直接書き換えると、生成経路の欠落を見落とす。
 *
 * | # | 状態 | 用意の仕方 | 期待する表示元 |
 * |---|---|---|---|
 * | 1 | 注釈あり | 編集画面で矢印を描いて保存 | 合成済みサムネイル |
 * | 2 | 回転のみ | 編集画面で90度回転して保存 | 合成済みサムネイル |
 * | 3 | 注釈なし | 何もしない | 通常サムネイル |
 * | 4 | 対照（合成済みなし・注釈あり） | 注釈保存APIのみを直接呼ぶ | 通常サムネイル＋注釈取得 |
 *
 * 4番目は**観測の判別能力を担保するための対照**である。合成済みサムネイルを持たない
 * 注釈付き画像はクライアント合成へ退避する（38.6）ため、注釈取得が実際に発生する。
 * 同一の観測で 1〜3 に注釈取得が「発生しないこと」と、4 で「発生すること」の双方を
 * 確認することで、「注釈取得0件」が観測漏れではないことが示される。
 *
 * ## 観測方式
 *
 * リクエストの選別は**オリジンではなくパス**で行う。ブラウザが使うAPIオリジン
 * （`VITE_API_URL`）とE2E側の `API_BASE_URL` は同一とは限らず、オリジン文字列で
 * 選別すると観測対象が1件も残らないまま判定が素通りしてしまうため。
 *
 * 画像本体の判定はストレージキーの**後方一致**で行う。合成済みサムネイルの保存先は
 * 原本・通常サムネイルとは別の区画（`annotated-thumbnails/...`）であり、
 * 「現場調査IDを含むパス」のような前方一致では取りこぼす。
 *
 * ## 前提状態の確認経路
 *
 * 詳細画面が実際に用いる取得経路は `GET /api/site-surveys/:id` である。前提の確認は
 * この応答に対して行う。画像一覧取得（`/images`）で確認すると、詳細応答側の欠落を
 * 見落として偽の安心を与える（Task 111.5 の起票経緯）。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 定数
// ============================================================================

/** 検証対象の状態（表示順） */
const IMAGE_FILE_NAMES = {
  /** 注釈あり。編集画面で矢印を描いて保存する */
  annotated: 'req38-9-annotated.png',
  /** 回転のみ。編集画面で90度回転して保存する */
  rotatedOnly: 'req38-9-rotated.png',
  /** 注釈なし。保存操作を行わない */
  plain: 'req38-9-plain.png',
  /** 対照。注釈保存APIのみを直接呼び、合成済みサムネイルを持たせない */
  fallback: 'req38-9-fallback.png',
} as const;

/**
 * 計測に用いる表示領域の大きさ
 *
 * 写真1件あたりのパネル高さは約380pxである。4枚すべてを1画面へ収めるのではなく、
 * 既定に近い高さで開いたうえで各写真を順に表示領域へ入れる方式を採る
 * （表示領域到達後の取得件数を数えるため、初期表示で全件が入る必要はない）。
 */
const MEASUREMENT_VIEWPORT = { width: 1280, height: 1600 } as const;

/** 現場調査詳細の取得APIのパス。詳細画面が画像一覧を受け取る唯一の経路（38.1） */
const surveyDetailPath = (surveyId: string): string => `/api/site-surveys/${surveyId}`;

/** 注釈データ取得APIのパス */
const ANNOTATION_PATH_PATTERN = /^\/api\/site-surveys\/images\/([0-9a-f-]+)\/annotations$/i;

/** 合成済みサムネイルが置かれる区画。通常サムネイルと識別できること（Task 115.1） */
const ANNOTATED_THUMBNAIL_PREFIX = 'annotated-thumbnails/';

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
  annotatedThumbnailPath: string | null;
  thumbnailUrl: string | null;
  annotatedThumbnailUrl: string | null;
  hasAnnotations: boolean;
  hasDrawnAnnotations: boolean;
}

/** 画像本体リクエストの分類に用いるストレージキーの目録 */
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
  /** 表示元として取得されたストレージキー。発生順・重複あり */
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

/** 指定のキーに対する取得件数 */
const countOf = (values: string[], key: string): number =>
  values.filter((value) => value === key).length;

// ============================================================================
// テスト
// ============================================================================

/**
 * @requirement site-survey/REQ-38.2
 * @requirement site-survey/REQ-38.3
 * @requirement site-survey/REQ-38.5
 * @requirement site-survey/REQ-38.6
 * @requirement site-survey/REQ-38.7
 */
test.describe('縮小表示のリクエスト数（1枚あたり1件）', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  /** 前提状態の用意後に詳細取得経路から読み直した画像一覧（表示順） */
  let detailImages: DetailImage[] = [];
  let storageKeyCatalog: StorageKeyCatalog = { displaySourceKeys: [], originalKeys: [] };

  /** ファイル名で画像を引く。用意した4状態はファイル名で識別する */
  const imageOf = (fileName: string): DetailImage => {
    const image = detailImages.find((candidate) => candidate.fileName === fileName);
    if (!image) {
      throw new Error(`前提状態の画像が見つかりません: ${fileName}`);
    }
    return image;
  };

  /** 期待する表示元のキー。合成済みサムネイルがあればそれ、無ければ通常サムネイル（38.5） */
  const expectedDisplayKeyOf = (image: DetailImage): string =>
    image.annotatedThumbnailPath ?? image.thumbnailPath;

  /**
   * 画像編集画面を開き、編集モードへ入る
   */
  async function openEditor(page: Page, imageId: string): Promise<void> {
    await page.goto(`/site-surveys/${createdSurveyId}/images/${imageId}`);
    await page.waitForLoadState('networkidle');

    const editModeButton = page.getByRole('button', { name: /編集モード/i });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(15000) });
    await editModeButton.click();

    await page
      .locator('[data-testid="annotation-toolbar"]')
      .waitFor({ state: 'visible', timeout: getTimeout(15000) });
  }

  /**
   * 編集キャンバスの中心座標を取得する
   */
  async function getCanvasCenter(page: Page): Promise<{ x: number; y: number }> {
    const upperCanvas = page.locator('.upper-canvas');
    await expect(upperCanvas).toBeVisible({ timeout: getTimeout(15000) });

    let box = await upperCanvas.boundingBox();
    for (
      let attempt = 0;
      attempt < 20 && (!box || box.width <= 10 || box.height <= 10);
      attempt++
    ) {
      await page.waitForTimeout(300);
      box = await upperCanvas.boundingBox();
    }
    if (!box || box.width <= 10 || box.height <= 10) {
      throw new Error('編集キャンバスの領域が確保されていません');
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /**
   * 編集キャンバス上の注釈オブジェクト数を取得する
   *
   * 画像編集画面はキャンバスを `window.__fabricCanvas` として公開している。
   * 描画操作が実際に注釈を生成したかを、保存前に確認するために用いる。
   */
  function getCanvasObjectCount(page: Page): Promise<number> {
    return page.evaluate(() => {
      const canvas = (window as unknown as { __fabricCanvas?: { getObjects: () => unknown[] } })
        .__fabricCanvas;
      return canvas ? canvas.getObjects().length : -1;
    });
  }

  /**
   * 画像編集画面で保存し、合成済みサムネイルの更新まで完了したことを確認する
   *
   * 保存は注釈の保存（PUT）と合成済みサムネイルの更新（PATCH）の2段で構成される。
   * Task 115.2 により後者の完了が保存完了の条件であるため、双方の応答を確認する。
   */
  async function saveInEditor(page: Page, imageId: string): Promise<string> {
    const annotationSaved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/site-surveys/images/${imageId}/annotations` &&
        response.request().method() === 'PUT',
      { timeout: getTimeout(30000) }
    );
    const thumbnailUpdated = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/site-surveys/images/${imageId}/annotated-thumbnail` &&
        response.request().method() === 'PATCH',
      { timeout: getTimeout(30000) }
    );

    await page.getByRole('button', { name: /^保存$/i }).click();

    const annotationResponse = await annotationSaved;
    expect(annotationResponse.ok(), '注釈の保存が成功する').toBeTruthy();

    // 合成済みサムネイルの生成要否は「注釈が1件以上」または「回転あり」で決まる（Task 115.3）。
    // 保存された内容を記録し、更新が発生しない場合に原因が判別できるようにする
    const savedAnnotation = (await annotationResponse.json()) as {
      data?: { objects?: unknown[]; imageRotation?: number };
    };
    console.log(
      `[REQ-38.5] 保存した注釈(${imageId}): objects=${savedAnnotation.data?.objects?.length ?? 0} rotation=${savedAnnotation.data?.imageRotation ?? 0}`
    );

    const thumbnailResponse = await thumbnailUpdated;
    expect(
      thumbnailResponse.ok(),
      '合成済みサムネイルの更新が成功する（Task 115.1 / 115.2）'
    ).toBeTruthy();

    // 保存完了の提示まで待つ。合成済みサムネイルの更新失敗時は提示されない（Task 115.2）
    await expect(page.getByText(/保存しました/i)).toBeVisible({ timeout: getTimeout(15000) });

    const body = (await thumbnailResponse.json()) as { annotatedThumbnailPath: string };
    return body.annotatedThumbnailPath;
  }

  /**
   * 事前準備
   *
   * 検証対象の4状態を持つ現場調査を作成する。合成済みサムネイルは実際の画像編集画面を
   * 操作して生成させる（データの直接書き換えでは生成経路の欠落を見落とすため）。
   */
  test.beforeAll(async ({ browser }) => {
    // 前提状態の用意は画像編集画面の操作を伴う。計測用の縦長の表示領域では編集キャンバスが
    // 表示領域に収まらず操作座標が外れるため、ここでは既定の表示領域を用いる
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

      await page
        .getByRole('textbox', { name: /プロジェクト名/i })
        .fill(`縮小表示リクエスト計測_${Date.now()}`);

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      if (!(await salesPersonSelect.inputValue())) {
        const options = await salesPersonSelect.locator('option').all();
        const firstUserOption = options[1] ? await options[1].getAttribute('value') : null;
        if (firstUserOption) {
          await salesPersonSelect.selectOption(firstUserOption);
        }
      }

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

      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      expect(accessToken).toBeTruthy();
      const authHeaders = { Authorization: `Bearer ${accessToken}` };

      // --- 現場調査作成 ---
      const surveyDate = new Date().toISOString().split('T')[0]!;
      const surveyResponse = await page.request.post(
        `${API_BASE_URL}/api/projects/${createdProjectId}/site-surveys`,
        {
          headers: authHeaders,
          data: { name: `縮小表示リクエスト計測用現場調査_${Date.now()}`, surveyDate },
        }
      );
      expect(surveyResponse.ok()).toBeTruthy();
      createdSurveyId = ((await surveyResponse.json()) as { id: string }).id;
      expect(createdSurveyId).toBeTruthy();

      // --- 写真を登録 ---
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.png');
      expect(fs.existsSync(testImagePath)).toBeTruthy();
      const imageBuffer = fs.readFileSync(testImagePath);

      for (const fileName of Object.values(IMAGE_FILE_NAMES)) {
        const uploadResponse = await page.request.post(
          `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
          {
            headers: authHeaders,
            multipart: {
              images: { name: fileName, mimeType: 'image/png', buffer: imageBuffer },
            },
          }
        );
        expect(uploadResponse.ok()).toBeTruthy();
      }

      /** 詳細画面が実際に用いる取得経路。前提確認・目録作成の双方をこの応答で行う */
      const fetchDetailImages = async (): Promise<DetailImage[]> => {
        const response = await page.request.get(
          `${API_BASE_URL}${surveyDetailPath(createdSurveyId!)}`,
          { headers: authHeaders }
        );
        expect(response.ok()).toBeTruthy();
        return ((await response.json()) as { images: DetailImage[] }).images;
      };

      detailImages = await fetchDetailImages();
      expect(detailImages).toHaveLength(Object.keys(IMAGE_FILE_NAMES).length);

      // 表示領域の観測は画像の実寸に依存する。実寸が正でない場合は観測せず即時取得へ
      // 縮退するため、前提が崩れていないことを確認する
      for (const image of detailImages) {
        expect(image.width).toBeGreaterThan(0);
        expect(image.height).toBeGreaterThan(0);
      }

      // --- 状態1: 注釈あり（画像編集画面で矢印を描いて保存） ---
      const annotatedImageId = imageOf(IMAGE_FILE_NAMES.annotated).id;
      await openEditor(page, annotatedImageId);
      const arrowTool = page.getByRole('button', { name: /矢印/i });
      await expect(arrowTool).toBeVisible({ timeout: getTimeout(10000) });
      await arrowTool.click();
      await expect(arrowTool).toHaveAttribute('aria-pressed', 'true');
      // 矢印はドラッグで描画する（開始点で押下し、終了点で離す）
      const center = await getCanvasCenter(page);
      const objectCountBefore = await getCanvasObjectCount(page);
      expect(objectCountBefore, '編集キャンバスが公開されている').toBeGreaterThanOrEqual(0);
      await page.mouse.move(center.x - 50, center.y - 50);
      await page.mouse.down();
      await page.mouse.move(center.x + 50, center.y + 50, { steps: 10 });
      await page.mouse.up();

      // 描画が実際に注釈を生成したことを確認してから保存する。生成されていない状態で
      // 保存すると「注釈なし」として扱われ、検証対象の前提が崩れる（Task 115.3）
      await expect
        .poll(() => getCanvasObjectCount(page), {
          timeout: getTimeout(10000),
          message: '矢印の描画で注釈オブジェクトが生成されていない',
        })
        .toBe(objectCountBefore + 1);

      await page.getByRole('button', { name: /選択/i }).click();
      await saveInEditor(page, annotatedImageId);

      // --- 状態2: 回転のみ（画像編集画面で90度回転して保存） ---
      const rotatedImageId = imageOf(IMAGE_FILE_NAMES.rotatedOnly).id;
      await openEditor(page, rotatedImageId);
      const rotateButton = page.getByRole('button', { name: /画像を90度回転/i });
      await expect(rotateButton).toBeVisible({ timeout: getTimeout(10000) });
      await rotateButton.click();
      await saveInEditor(page, rotatedImageId);

      // --- 状態4: 対照（注釈保存APIのみ。合成済みサムネイルは生成されない） ---
      const fallbackImage = imageOf(IMAGE_FILE_NAMES.fallback);
      const fallbackAnnotationResponse = await page.request.put(
        `${API_BASE_URL}/api/site-surveys/images/${fallbackImage.id}/annotations`,
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
              canvasWidth: fallbackImage.width,
              canvasHeight: fallbackImage.height,
            },
          },
        }
      );
      expect(fallbackAnnotationResponse.ok()).toBeTruthy();

      // --- 用意した状態を、詳細画面が用いる取得経路の応答で確認する ---
      detailImages = await fetchDetailImages();

      const annotated = imageOf(IMAGE_FILE_NAMES.annotated);
      const rotatedOnly = imageOf(IMAGE_FILE_NAMES.rotatedOnly);
      const plain = imageOf(IMAGE_FILE_NAMES.plain);
      const fallback = imageOf(IMAGE_FILE_NAMES.fallback);

      // 注釈あり: 描画された注釈があり、合成済みサムネイルが供給される
      expect(annotated.hasDrawnAnnotations, '注釈ありの画像に描画された注釈がある').toBe(true);
      expect(annotated.annotatedThumbnailPath).toBeTruthy();
      expect(annotated.annotatedThumbnailPath!.startsWith(ANNOTATED_THUMBNAIL_PREFIX)).toBe(true);
      expect(annotated.annotatedThumbnailUrl, '詳細取得の応答に表示元URLが現れる').toBeTruthy();

      // 回転のみ: 描画された注釈は無いが、合成済みサムネイルが供給される（Task 115.3）
      expect(rotatedOnly.hasAnnotations, '回転のみでも注釈レコードは残る').toBe(true);
      expect(rotatedOnly.hasDrawnAnnotations, '回転のみでは描画された注釈は無い').toBe(false);
      expect(rotatedOnly.annotatedThumbnailPath).toBeTruthy();
      expect(rotatedOnly.annotatedThumbnailPath!.startsWith(ANNOTATED_THUMBNAIL_PREFIX)).toBe(true);
      expect(rotatedOnly.annotatedThumbnailUrl).toBeTruthy();

      // 注釈なし: 注釈も合成済みサムネイルも無い
      expect(plain.hasAnnotations, '注釈なしの画像に注釈レコードが無い').toBe(false);
      expect(plain.annotatedThumbnailPath).toBeNull();
      expect(plain.thumbnailUrl, '通常サムネイルの表示元URLが供給される').toBeTruthy();

      // 対照: 注釈はあるが合成済みサムネイルは無い（クライアント合成へ退避する）
      expect(fallback.hasDrawnAnnotations, '対照の画像に描画された注釈がある').toBe(true);
      expect(
        fallback.annotatedThumbnailPath,
        '対照の画像は合成済みサムネイルを持たない'
      ).toBeNull();

      // 表示元がキーで一意に判別できること。合成済みサムネイルは通常サムネイルとも
      // 原本とも異なり、他の画像のキーとも重複しない
      const allKeys = detailImages.flatMap((image) =>
        [image.originalPath, image.thumbnailPath, image.annotatedThumbnailPath].filter(
          (key): key is string => key !== null
        )
      );
      expect(new Set(allKeys).size, 'ストレージキーが全て相異なる').toBe(allKeys.length);

      // --- 画像本体リクエストの分類に用いる目録を作る ---
      storageKeyCatalog = {
        displaySourceKeys: detailImages.flatMap((image) =>
          [image.thumbnailPath, image.annotatedThumbnailPath].filter(
            (key): key is string => key !== null
          )
        ),
        originalKeys: detailImages.map((image) => image.originalPath),
      };

      console.log(
        `[REQ-38.5] 前提状態: 注釈あり=${annotated.annotatedThumbnailPath} / 回転のみ=${rotatedOnly.annotatedThumbnailPath} / 注釈なし=${plain.thumbnailPath} / 対照=${fallback.thumbnailPath}`
      );
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (!createdProjectId) return;

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
   * 本テストが引き受ける受入基準
   *
   * - 38.2 / 38.3 / 38.5: 画像1枚あたりの取得が表示元1件に収まり、合成済みサムネイルを
   *   持つ画像では注釈取得が発生しないこと
   * - 38.6: 合成済みサムネイルを持たない注釈付き画像（対照）が代替手段（クライアント合成）
   *   へ退避し、そのための注釈取得が当該1枚に限られること。対照を表示領域へ入れて初めて
   *   注釈取得が観測されるため、代替手段のための取得も表示領域に入った画像に限られる
   * - 38.7: 縮小表示の取得が全て表示元（通常サムネイル／合成済みサムネイル）であり、
   *   原本の取得が1件も発生しないこと（`observation.originalKeys` が空であること）。
   *   一覧画面側の縮小表示は SiteSurveyListTable のコンポーネントテストが引き受ける
   *
   * @requirement site-survey/REQ-38.2
   * @requirement site-survey/REQ-38.3
   * @requirement site-survey/REQ-38.5
   * @requirement site-survey/REQ-38.6
   * @requirement site-survey/REQ-38.7
   */
  test('注釈あり・回転のみ・注釈なしのいずれも画像1枚あたりの取得が表示元1件に収まり注釈取得が発生しないこと (site-survey/REQ-38.2, site-survey/REQ-38.3, site-survey/REQ-38.5, site-survey/REQ-38.6, site-survey/REQ-38.7)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MEASUREMENT_VIEWPORT });
    const page = await context.newPage();
    try {
      const observation = observeImageRequests(page, createdSurveyId!, storageKeyCatalog);

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/site-surveys/${createdSurveyId}`);

      // 全ての画像を順に表示領域へ入れる
      for (const image of detailImages) {
        await page.getByAltText(image.fileName).scrollIntoViewIfNeeded();
      }

      const annotated = imageOf(IMAGE_FILE_NAMES.annotated);
      const rotatedOnly = imageOf(IMAGE_FILE_NAMES.rotatedOnly);
      const plain = imageOf(IMAGE_FILE_NAMES.plain);
      const fallback = imageOf(IMAGE_FILE_NAMES.fallback);

      // 4枚すべての表示元が取得されるまで待つ。取得が始まっていない状態で数えると
      // 「1件以下」が常に成立してしまうため、到達を待ってから判定する
      for (const image of detailImages) {
        await expect
          .poll(() => countOf(observation.displaySourceKeys, expectedDisplayKeyOf(image)), {
            timeout: getTimeout(30000),
            message: `${image.fileName} の表示元(${expectedDisplayKeyOf(image)})が取得されていない`,
          })
          .toBeGreaterThanOrEqual(1);
      }

      // 対照の注釈取得が観測できることを確認する。これが観測できて初めて、
      // 他の3枚の「注釈取得が発生しない」が観測漏れでないと言える
      const annotationPathOf = (imageId: string): string =>
        `/api/site-surveys/images/${imageId}/annotations`;
      await expect
        .poll(() => observation.annotationPaths.includes(annotationPathOf(fallback.id)), {
          timeout: getTimeout(30000),
          message:
            '対照（合成済みサムネイルを持たない注釈付き画像）で注釈取得が観測できない。' +
            '注釈取得の観測条件が誤っている可能性がある',
        })
        .toBe(true);

      // 追加のリクエストが遅れて発生していないことを確かめてから計数を確定する
      await page.waitForLoadState('networkidle');
      observation.stop();

      const perImage = detailImages.map((image) => ({
        fileName: image.fileName,
        displayKey: expectedDisplayKeyOf(image),
        displayRequests: countOf(observation.displaySourceKeys, expectedDisplayKeyOf(image)),
        annotationRequests: countOf(observation.annotationPaths, annotationPathOf(image.id)),
      }));

      console.log(
        `[REQ-38.5] 画像1枚あたりの取得件数: ${JSON.stringify(perImage, null, 2)}\n` +
          `[REQ-38.5] 詳細取得=${observation.surveyDetailPaths.length} / ` +
          `原本取得=${JSON.stringify(observation.originalKeys)} / ` +
          `未分類ストレージ=${JSON.stringify(observation.unclassifiedStoragePaths)} / ` +
          `表示元取得の全件=${JSON.stringify(observation.displaySourceKeys)} / ` +
          `注釈取得の全件=${JSON.stringify(observation.annotationPaths)}`
      );

      // 画像一覧は画像ごとに分割されず1回で取得される（38.1・38.3の前段）
      expect(observation.surveyDetailPaths).toHaveLength(1);

      // 注釈あり・回転のみ: 表示元は合成済みサムネイルであり、取得は1件（38.5, 38.3）
      for (const image of [annotated, rotatedOnly]) {
        expect(expectedDisplayKeyOf(image)).toBe(image.annotatedThumbnailPath);
        expect(
          countOf(observation.displaySourceKeys, image.annotatedThumbnailPath!),
          `${image.fileName}: 合成済みサムネイルの取得が1件`
        ).toBe(1);
        expect(
          countOf(observation.displaySourceKeys, image.thumbnailPath),
          `${image.fileName}: 通常サムネイルは取得されない`
        ).toBe(0);
        expect(
          countOf(observation.annotationPaths, annotationPathOf(image.id)),
          `${image.fileName}: 注釈データの取得が発生しない（38.2）`
        ).toBe(0);
      }

      // 注釈なし: 表示元は通常サムネイルであり、取得は1件・注釈取得も発生しない
      expect(
        countOf(observation.displaySourceKeys, plain.thumbnailPath),
        `${plain.fileName}: 通常サムネイルの取得が1件`
      ).toBe(1);
      expect(
        countOf(observation.annotationPaths, annotationPathOf(plain.id)),
        `${plain.fileName}: 注釈データの取得が発生しない`
      ).toBe(0);

      // 注釈取得は対照の1枚に限られる。合成済みサムネイルを持つ画像でも持たない画像でも
      // 一律に発生しない、という緩い状態ではないことを示す
      expect(new Set(observation.annotationPaths)).toEqual(
        new Set([annotationPathOf(fallback.id)])
      );

      // 縮小表示に原本を用いない（38.7・38.3）
      expect(observation.originalKeys).toEqual([]);

      // 表示元・原本のいずれにも分類されない画像関連リクエストが無いこと。
      // 分類漏れがあると上の計数が実態より小さく見え、判定が緩む（38.3）
      expect(observation.unclassifiedStoragePaths).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
