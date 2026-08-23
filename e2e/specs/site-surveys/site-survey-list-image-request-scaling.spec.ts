/**
 * @fileoverview 現場調査一覧画面の表示リクエストが件数に比例しないことのE2Eテスト
 *
 * Task 115.106: 一覧の遅延取得が無効化されている状態を解消する
 *
 * Requirements coverage (site-survey):
 * - REQ-38.6: 合成済みサムネイルが利用できない場合の代替手段（クライアント合成）のための取得も、
 *   表示領域に入った画像に限る
 * - REQ-38.8: 表示領域外の画像の取得を表示領域に入るまで行わない
 *
 * ## 本テストが被覆する経路
 *
 * 既存の `site-survey-image-request-scaling.spec.ts` と
 * `site-survey-thumbnail-request-per-image.spec.ts` は、いずれも**現場調査詳細画面**の
 * 写真一覧を対象とする。詳細画面は画像の実寸を応答から受け取るため、表示部品が
 * `AnnotatedImageThumbnail` へ実寸を渡せる。
 *
 * 本テストが対象とするのは**現場調査一覧画面**（`/projects/:projectId/site-surveys`）で
 * あり、こちらは代表画像の実寸を応答から受け取らない。表示部品は表示領域を CSS の
 * 固定寸法（テーブル表示では 64px 角）で確保する。実寸の有無で表示領域の観測を
 * 打ち切る判定が残っていると、一覧では観測が働かず全件が即時に取得される。
 *
 * ## 観測方式
 *
 * リクエストの選別は**オリジンではなくパス**で行う。ブラウザが使うAPIオリジン
 * （`VITE_API_URL`）とE2E側の `API_BASE_URL` は同一とは限らず（CIでは前者が
 * `localhost:3000`、後者が `127.0.0.1:3000`）、オリジン文字列で選別すると
 * 観測対象が1件も残らないまま「リクエストは少ない」が常に成立してしまうため。
 *
 * 画像本体の判定はストレージキーの後方一致で行う。キーは現場調査詳細の取得経路から
 * 取り出し、代表画像のサムネイルと原本を別々の目録に持つ。
 *
 * ## 判定が素通りしないことの担保
 *
 * 「初期表示の取得件数 < 一覧の件数」だけでは、観測条件の誤りで0件を数えている場合も
 * 成立してしまう。そのため次を併せて検証する。
 *
 * 1. 初期表示の取得件数が1件以上であること（＝計数器が実際に何かを数えていること）
 * 2. 全ての行を表示領域へ入れると、同じ計数器が一覧の件数へ到達すること
 * 3. 注釈取得についても同じ2点を満たすこと（代替手段の取得も表示領域に限られること＝38.6）
 * 4. 一覧の件数を2倍にしても初期表示の取得件数が増えないこと（＝件数に比例しないこと）
 *
 * 実測値はテストログへ出力する。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { assertPrepared } from '../../helpers/preconditions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 定数
// ============================================================================

/**
 * 比較に用いる一覧の件数
 *
 * 一覧画面の既定の表示件数は20件であり、いずれもページ送りを挟まず1画面へ描画される。
 * 大小の比が2倍であるため、初期表示の取得件数が件数に比例するなら大きい側は小さい側の
 * 概ね2倍になる。テーブル表示の1行はおよそ90pxであり、計測に用いる表示領域（下記）へ
 * 初期表示で入るのは先頭の数行に限られるため、いずれの件数でも表示領域には収まりきらない。
 */
const SMALL_SURVEY_COUNT = 8;
const LARGE_SURVEY_COUNT = 16;

/**
 * 計測に用いる表示領域の大きさ
 *
 * 幅1280pxはデスクトップ相当であり、一覧画面はテーブル表示になる。高さ720pxでは
 * 見出し・絞り込み欄を除いた残りに数行だけが入る。
 */
const MEASUREMENT_VIEWPORT = { width: 1280, height: 720 } as const;

/** 現場調査一覧の取得APIのパス */
const surveyListPath = (projectId: string): string => `/api/projects/${projectId}/site-surveys`;

/** 注釈データ取得APIのパス */
const ANNOTATION_PATH_PATTERN = /^\/api\/site-surveys\/images\/([0-9a-f-]+)\/annotations$/i;

// ============================================================================
// 型
// ============================================================================

/** 計測対象として用意した現場調査1件 */
interface PreparedSurvey {
  id: string;
  name: string;
  /** 代表画像のID。注釈取得APIのパスに現れる */
  imageId: string;
  /** 代表画像のサムネイルのストレージキー。縮小表示の表示元（38.7） */
  thumbnailKey: string;
  /** 代表画像の原本のストレージキー。縮小表示では取得されない想定 */
  originalKey: string;
}

/** 一覧の取得APIが返す要素のうち本テストが用いる項目 */
interface ListedSurvey {
  id: string;
  name: string;
  thumbnailImageId: string | null;
  thumbnailUrl: string | null;
  thumbnailOriginalUrl: string | null;
  annotatedThumbnailUrl: string | null;
}

// ============================================================================
// リクエスト観測
// ============================================================================

interface ListRequestObservation {
  /** 縮小表示の表示元として取得されたストレージキー。発生順・重複あり */
  thumbnailKeys: string[];
  /** 原本として取得されたストレージキー。発生順・重複あり */
  originalKeys: string[];
  /** 注釈取得が発生した画像ID。発生順・重複あり */
  annotatedImageIds: string[];
  /** 一覧取得のパス。発生順・重複あり */
  listPaths: string[];
  stop: () => void;
}

/**
 * 現場調査一覧画面の画像に関するリクエストをパス基準で観測する
 *
 * 画像本体はストレージの署名付きURLへ送出されるためオリジンがAPIと異なる。
 * どちらの経路も `new URL(url).pathname` に対する判定のみで分類し、接続先の違いで
 * 判定が変わらないようにする。
 *
 * @param page - 観測対象のページ
 * @param projectId - 対象のプロジェクトID
 * @param surveys - 分類に用いる、用意済みの現場調査の一覧
 */
function observeListRequests(
  page: Page,
  projectId: string,
  surveys: PreparedSurvey[]
): ListRequestObservation {
  const thumbnailKeys: string[] = [];
  const originalKeys: string[] = [];
  const annotatedImageIds: string[] = [];
  const listPaths: string[] = [];

  const knownThumbnailKeys = surveys.map((survey) => survey.thumbnailKey);
  const knownOriginalKeys = surveys.map((survey) => survey.originalKey);

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
      if (pathname === surveyListPath(projectId)) {
        listPaths.push(pathname);
        return;
      }
      const annotationMatch = ANNOTATION_PATH_PATTERN.exec(pathname);
      if (annotationMatch) {
        annotatedImageIds.push(annotationMatch[1]!);
      }
      return;
    }

    // ストレージ側。署名付きURLのパス末尾に現れるキーで分類する
    const thumbnailKey = knownThumbnailKeys.find((key) => pathname.endsWith(key));
    if (thumbnailKey) {
      thumbnailKeys.push(thumbnailKey);
      return;
    }
    const originalKey = knownOriginalKeys.find((key) => pathname.endsWith(key));
    if (originalKey) {
      originalKeys.push(originalKey);
    }
  };

  page.on('request', record);
  return {
    thumbnailKeys,
    originalKeys,
    annotatedImageIds,
    listPaths,
    stop: () => page.off('request', record),
  };
}

/** 重複を除いた件数 */
const uniqueCount = (values: string[]): number => new Set(values).size;

// ============================================================================
// テスト
// ============================================================================

/**
 * @requirement site-survey/REQ-38.6
 * @requirement site-survey/REQ-38.8
 */
test.describe('現場調査一覧の表示リクエストが件数に比例しないこと', () => {
  test.describe.configure({ mode: 'serial' });

  /** 少ない件数の一覧を持つプロジェクト */
  let smallProjectId: string | null = null;
  /** 多い件数の一覧を持つプロジェクト */
  let largeProjectId: string | null = null;
  let smallSurveys: PreparedSurvey[] = [];
  let largeSurveys: PreparedSurvey[] = [];

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600000);

    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();

    try {
      await loginAsUser(page, 'REGULAR_USER');

      // --- 1件目のプロジェクトを画面から作成する（営業担当者の選択が要るため） ---
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const stamp = Date.now();
      await page
        .getByRole('textbox', { name: /プロジェクト名/i })
        .fill(`一覧リクエスト計測_少_${stamp}`);

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
      smallProjectId = page.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1] ?? null;
      expect(smallProjectId).toBeTruthy();

      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      expect(accessToken).toBeTruthy();
      const authHeaders = { Authorization: `Bearer ${accessToken}` };

      // --- 2件目のプロジェクトは1件目と同じ営業担当者でAPIから作成する ---
      const smallProjectResponse = await page.request.get(
        `${API_BASE_URL}/api/projects/${smallProjectId}`,
        { headers: authHeaders }
      );
      expect(smallProjectResponse.ok()).toBeTruthy();
      const salesPersonId = ((await smallProjectResponse.json()) as { salesPerson: { id: string } })
        .salesPerson.id;
      expect(salesPersonId).toBeTruthy();

      const largeProjectResponse = await page.request.post(`${API_BASE_URL}/api/projects`, {
        headers: authHeaders,
        data: { name: `一覧リクエスト計測_多_${stamp}`, salesPersonId },
      });
      expect(largeProjectResponse.status()).toBe(201);
      largeProjectId = ((await largeProjectResponse.json()) as { id: string }).id;
      expect(largeProjectId).toBeTruthy();

      // --- 各プロジェクトへ、代表画像を1枚ずつ持つ現場調査を用意する ---
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.png');
      expect(fs.existsSync(testImagePath)).toBeTruthy();
      const imageBuffer = fs.readFileSync(testImagePath);
      const surveyDate = new Date().toISOString().split('T')[0]!;

      const prepareSurveys = async (
        projectId: string,
        count: number,
        label: string
      ): Promise<PreparedSurvey[]> => {
        const prepared: PreparedSurvey[] = [];
        for (let index = 0; index < count; index++) {
          const name = `${label}_${String(index + 1).padStart(2, '0')}_${stamp}`;
          const surveyResponse = await page.request.post(
            `${API_BASE_URL}/api/projects/${projectId}/site-surveys`,
            { headers: authHeaders, data: { name, surveyDate } }
          );
          expect(surveyResponse.ok()).toBeTruthy();
          const surveyId = ((await surveyResponse.json()) as { id: string }).id;

          const uploadResponse = await page.request.post(
            `${API_BASE_URL}/api/site-surveys/${surveyId}/images`,
            {
              headers: authHeaders,
              multipart: {
                images: {
                  name: `list-req38-${index + 1}.png`,
                  mimeType: 'image/png',
                  buffer: imageBuffer,
                },
              },
            }
          );
          expect(uploadResponse.ok()).toBeTruthy();

          const detailResponse = await page.request.get(
            `${API_BASE_URL}/api/site-surveys/${surveyId}`,
            { headers: authHeaders }
          );
          expect(detailResponse.ok()).toBeTruthy();
          const detailImages = (
            (await detailResponse.json()) as {
              images: { id: string; thumbnailPath: string; originalPath: string }[];
            }
          ).images;
          expect(detailImages).toHaveLength(1);

          prepared.push({
            id: surveyId,
            name,
            imageId: detailImages[0]!.id,
            thumbnailKey: detailImages[0]!.thumbnailPath,
            originalKey: detailImages[0]!.originalPath,
          });
        }
        return prepared;
      };

      smallSurveys = await prepareSurveys(smallProjectId!, SMALL_SURVEY_COUNT, '少件数調査');
      largeSurveys = await prepareSurveys(largeProjectId!, LARGE_SURVEY_COUNT, '多件数調査');

      // --- 一覧画面が実際に用いる取得経路の応答で前提を確認する ---
      const fetchListed = async (projectId: string, count: number): Promise<ListedSurvey[]> => {
        const response = await page.request.get(
          `${API_BASE_URL}${surveyListPath(projectId)}?page=1&limit=20&sort=surveyDate&order=desc`,
          { headers: authHeaders }
        );
        expect(response.ok()).toBeTruthy();
        const listed = ((await response.json()) as { data: ListedSurvey[] }).data;
        expect(listed).toHaveLength(count);
        return listed;
      };

      for (const [projectId, count] of [
        [smallProjectId!, SMALL_SURVEY_COUNT],
        [largeProjectId!, LARGE_SURVEY_COUNT],
      ] as const) {
        const listed = await fetchListed(projectId, count);
        for (const survey of listed) {
          // 表示部品が `AnnotatedImageThumbnail` の経路（代替手段）へ入る前提。
          // 合成済みサムネイルが供給されていると素の img 要素の経路になり、
          // 本テストが対象とする判定を通らない。
          expect(survey.annotatedThumbnailUrl).toBeNull();
          expect(survey.thumbnailImageId).toBeTruthy();
          expect(survey.thumbnailOriginalUrl).toBeTruthy();
          expect(survey.thumbnailUrl).toBeTruthy();
        }
      }

      console.log(
        `[REQ-38 一覧] 準備完了: 少=${SMALL_SURVEY_COUNT}件 / 多=${LARGE_SURVEY_COUNT}件`
      );
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    // 前提が用意されていなければ削除すべき対象も無い。黙って戻ると「後片付けした」ことになり、
    // 前提の生成が壊れたことが記録に残らない。前提が崩れた地点で失敗させる。
    assertPrepared(smallProjectId, '事前準備で作成した少件数側プロジェクトのID');
    assertPrepared(largeProjectId, '事前準備で作成した多件数側プロジェクトのID');

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsUser(page, 'ADMIN_USER');
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      for (const projectId of [smallProjectId, largeProjectId]) {
        const deleteResponse = await page.request.delete(
          `${API_BASE_URL}/api/projects/${projectId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        expect([200, 204, 404]).toContain(deleteResponse.status());
      }
    } finally {
      await context.close();
    }
  });

  /**
   * 一覧画面を開き、先頭の代表画像の描画が始まるまで待つ
   *
   * ブラウザキャッシュの影響を受けないよう、呼び出し側は毎回新しいコンテキストを用いる。
   */
  async function openSurveyList(page: Page, projectId: string): Promise<void> {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/projects/${projectId}/site-surveys`);

    // テーブル表示であることを確かめてから計測する。表示モードが変わると
    // 1行の高さが変わり、表示領域へ入る件数の前提が崩れる
    await expect(page.getByRole('table')).toBeVisible({ timeout: getTimeout(20000) });

    // 先頭の代表画像に表示元URLが設定される＝表示領域内の画像の取得が始まったことを待つ
    await expect(page.locator('table img[alt$="のサムネイル"]').first()).toHaveAttribute(
      'src',
      /.+/,
      { timeout: getTimeout(20000) }
    );
    await page.waitForLoadState('networkidle');
  }

  /** 全ての代表画像を順に表示領域へ入れる */
  async function scrollThroughAll(page: Page, surveys: PreparedSurvey[]): Promise<void> {
    for (const survey of surveys) {
      await page.getByAltText(`${survey.name}のサムネイル`).scrollIntoViewIfNeeded();
    }
    await page.waitForLoadState('networkidle');
  }

  /**
   * 表示領域外の代表画像は、画像本体も注釈取得も行われない
   *
   * 一覧の表示部品は代表画像の実寸を持たない。実寸の有無で表示領域の観測を打ち切る
   * 判定が残っていると、初期表示で全件が取得され本テストは失敗する。
   *
   * @requirement site-survey/REQ-38.6
   * @requirement site-survey/REQ-38.8
   */
  test('初期表示では表示領域内の代表画像だけを取得し、スクロールで残りを取得する (site-survey/REQ-38.6, site-survey/REQ-38.8)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MEASUREMENT_VIEWPORT });
    const page = await context.newPage();
    try {
      const observation = observeListRequests(page, largeProjectId!, largeSurveys);
      await openSurveyList(page, largeProjectId!);

      const initialThumbnails = uniqueCount(observation.thumbnailKeys);
      const initialAnnotations = uniqueCount(observation.annotatedImageIds);
      console.log(
        `[REQ-38 一覧] 初期表示: 一覧件数=${LARGE_SURVEY_COUNT} / 画像本体=${initialThumbnails}件 / 注釈取得=${initialAnnotations}件`
      );

      // 一覧取得は1回。画像ごとの個別リクエストへ分割されない
      expect(observation.listPaths.length).toBeGreaterThanOrEqual(1);

      // 計数器が実際に数えていること（0件が常に成立する形になっていないこと）
      expect(initialThumbnails).toBeGreaterThanOrEqual(1);
      expect(initialAnnotations).toBeGreaterThanOrEqual(1);

      // 表示領域外の分は取得されていないこと（38.8 / 38.6）
      expect(initialThumbnails).toBeLessThan(LARGE_SURVEY_COUNT);
      expect(initialAnnotations).toBeLessThan(LARGE_SURVEY_COUNT);

      // 縮小表示に原本を用いないこと（38.7 の維持。ここで原本が現れると
      // 「取得件数が少ない」の意味が変わるため併せて確認する）
      expect(observation.originalKeys).toEqual([]);

      // --- 全件を表示領域へ入れる ---
      await scrollThroughAll(page, largeSurveys);

      const scrolledThumbnails = uniqueCount(observation.thumbnailKeys);
      const scrolledAnnotations = uniqueCount(observation.annotatedImageIds);
      console.log(
        `[REQ-38 一覧] 全件表示後: 画像本体=${scrolledThumbnails}件 / 注釈取得=${scrolledAnnotations}件`
      );

      // 表示領域へ入れば取得されること（＝初期表示の少なさが観測漏れではないこと）
      expect(scrolledThumbnails).toBe(LARGE_SURVEY_COUNT);
      expect(scrolledAnnotations).toBe(LARGE_SURVEY_COUNT);

      observation.stop();
    } finally {
      await context.close();
    }
  });

  /**
   * 一覧の件数を2倍にしても初期表示の取得件数は増えない
   *
   * 「初期表示の取得件数 < 一覧件数」だけでは、件数に比例して増える経路が残っていても
   * 成立し得る。同じ表示領域で件数だけを変えて計測し、取得件数が件数に追随しないことを
   * 直接確かめる。
   *
   * @requirement site-survey/REQ-38.8
   */
  test('一覧の件数を2倍にしても初期表示の画像取得件数が増えない (site-survey/REQ-38.8)', async ({
    browser,
  }) => {
    const measure = async (
      projectId: string,
      surveys: PreparedSurvey[]
    ): Promise<{ thumbnails: number; annotations: number }> => {
      const context = await browser.newContext({ viewport: MEASUREMENT_VIEWPORT });
      const page = await context.newPage();
      try {
        const observation = observeListRequests(page, projectId, surveys);
        await openSurveyList(page, projectId);
        const result = {
          thumbnails: uniqueCount(observation.thumbnailKeys),
          annotations: uniqueCount(observation.annotatedImageIds),
        };
        observation.stop();
        return result;
      } finally {
        await context.close();
      }
    };

    const small = await measure(smallProjectId!, smallSurveys);
    const large = await measure(largeProjectId!, largeSurveys);

    console.log(
      `[REQ-38 一覧] 比例の実測: ${SMALL_SURVEY_COUNT}件→画像本体${small.thumbnails}件/注釈${small.annotations}件, ` +
        `${LARGE_SURVEY_COUNT}件→画像本体${large.thumbnails}件/注釈${large.annotations}件`
    );

    // 双方とも計数器が働いていること
    expect(small.thumbnails).toBeGreaterThanOrEqual(1);
    expect(large.thumbnails).toBeGreaterThanOrEqual(1);

    // 件数が2倍でも初期表示の取得件数は増えない。表示領域の大きさが同じであり、
    // 取得の上限は表示領域に入る行数で決まるため
    expect(large.thumbnails).toBeLessThanOrEqual(small.thumbnails);
    expect(large.annotations).toBeLessThanOrEqual(small.annotations);
  });
});
