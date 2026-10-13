/**
 * @fileoverview 写真選択ダイアログの一括取得とサムネイル表示のE2Eテスト
 *
 * Task 76.1: 写真選択ダイアログの挙動を実操作で確認する
 *
 * Requirements coverage (quantity-table-generation):
 * - @requirement quantity-table-generation/REQ-49.9: 写真選択ダイアログまたは写真変更ダイアログを開いたとき、選択可能な写真の一覧を現場調査ごとの個別リクエストに分割せずまとめて取得する
 * - @requirement quantity-table-generation/REQ-49.10: 写真選択ダイアログおよび写真変更ダイアログの写真一覧表示にサムネイル画像を用いる
 *
 * ## 検証対象の画面挙動
 *
 * 一覧の対象は注釈エディタで編集済みの写真（注釈レコードが存在する写真）のみであり、
 * 注釈のない写真は選択候補に現れない（design.md「Requirement 49」の
 * 「選択対象を注釈付き写真のみへ絞る（設計レビューでの是正）」。規定の出所は
 * Requirement 4.3 / 19.2）。本テストは注釈付きと注釈なしの**両方**をシードし、
 * 注釈付きだけが現れることを確かめる。注釈付きだけをシードすると「現れない」が
 * 空集合に対して常に成立してしまう。
 *
 * ## 観測方式
 *
 * リクエストの選別は**オリジンではなくパス**で行う。ブラウザが使うAPIオリジン
 * （`VITE_API_URL`）とE2E側の `API_BASE_URL` は同一とは限らず（CIでは前者が
 * `localhost:3000`、後者が `127.0.0.1:3000`）、オリジン文字列で選別すると観測対象が
 * 1件も残らないまま「個別リクエストは発生していない」が常に成立してしまうため。
 *
 * 画像本体の判定はストレージキーの後方一致で行う。表示用URLの実体は通常サムネイルと
 * 合成済みサムネイルのいずれにもなり得るため、「現場調査IDを含むパス」のような
 * 前方一致では原本と区別できない。
 *
 * ## 判定が素通りしないことの担保
 *
 * 「現場調査詳細の取得が0件」「原本の取得が0件」は、観測条件が誤っていても成立する。
 * そのため同じ観測器で、同じ条件に当てはまるリクエストが**実際に発生する操作**を
 * 併せて通し、捉えられることを示す。
 *
 * 1. 現場調査一覧・現場調査詳細: 「現場調査から一括追加」は現在も
 *    `GET /api/projects/:projectId/site-surveys` と `GET /api/site-surveys/:id` を
 *    発行する（REQ-40.1 / 40.3）。写真選択ダイアログでの0件を主張した後に同じ観測器で
 *    これらを捉える。
 * 2. 原本画像: 紐づけ写真の拡大表示は原本を取得する。写真一覧表示での0件を主張した後に
 *    同じ観測器で原本の取得を捉える。
 * 3. 一覧の件数は完全一致（注釈付きの枚数）で主張する。0件でも通る形にしない。
 *
 * 実測値はテストログへ出力する。
 *
 * @module e2e/specs/quantity-tables/photo-select-bulk-fetch-e2e.spec
 */

import { test, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import {
  createTestProject,
  createTestQuantityTable,
  openQuantityTableEdit,
  addQuantityGroup,
  seedSurveyPhotosWithComments,
} from '../../helpers/quantity-table-preconditions';
import { assertPrepared } from '../../helpers/preconditions';
import { API_BASE_URL } from '../../config';

// ============================================================================
// 定数
// ============================================================================

/**
 * シードする現場調査の件数
 *
 * 「現場調査ごとの個別リクエストに分割しない」は、現場調査が複数ある状態で観測しないと
 * 比例しないことの証拠にならない（1件では1回の取得と区別できない）。
 */
const SURVEY_COUNT = 2;

/** 1現場調査あたりにシードする写真の枚数（注釈を付ける1枚＋付けない1枚） */
const PHOTOS_PER_SURVEY = 2;

/** 注釈を付ける写真の位置（表示順の先頭） */
const ANNOTATED_INDEX = 0;

/** 一覧に現れるべき写真の枚数（注釈付きのみ） */
const EXPECTED_LISTED_COUNT = SURVEY_COUNT;

/** 現場調査詳細取得APIのパス（1セグメントのみ。`/images` 等の下位パスは含めない） */
const SURVEY_DETAIL_PATH_PATTERN = /^\/api\/site-surveys\/[0-9a-f-]+$/i;

// ============================================================================
// 型
// ============================================================================

/** `GET /api/site-surveys/:id` が返す画像要素のうち本テストが用いる項目 */
interface DetailImage {
  id: string;
  fileName: string;
  width: number;
  height: number;
  displayOrder: number;
  originalPath: string;
  thumbnailPath: string;
  annotatedThumbnailPath?: string | null;
}

/** `GET /api/projects/:projectId/survey-images` が返す要素のうち本テストが用いる項目 */
interface ListedImage {
  id: string;
  surveyId: string;
  fileName: string;
  displayUrl: string | null;
  originalUrl: string | null;
  isDisplayUrlAnnotated: boolean;
}

/**
 * 画像本体リクエストの分類に用いる目録
 *
 * 表示元（サムネイル系）と原本をキーで区別する。通常サムネイルと合成済みサムネイルの
 * いずれが表示元になっても「サムネイルを用いた」と判定できるよう、双方を表示元として扱う。
 */
interface StorageKeyCatalog {
  /** 選択候補となる写真のサムネイル系ストレージキー */
  thumbnailKeys: string[];
  /** 選択候補となる写真の原本ストレージキー */
  originalKeys: string[];
}

/** 写真選択ダイアログに関するリクエストの観測結果 */
interface PhotoDialogObservation {
  /** プロジェクト写真一覧（一括取得）のパス */
  bulkListPaths: string[];
  /** 現場調査一覧取得のパス */
  surveyListPaths: string[];
  /** 現場調査詳細取得のパス */
  surveyDetailPaths: string[];
  /** サムネイル系画像本体の取得パス */
  thumbnailRequestPaths: string[];
  /** 原本画像本体の取得パス */
  originalRequestPaths: string[];
  /** 目録のどれにも当てはまらないストレージ取得パス（分類漏れの検出用） */
  unclassifiedStoragePaths: string[];
  /** 観測を終了する */
  stop: () => void;
}

// ============================================================================
// 観測
// ============================================================================

/**
 * ブラウザが送出したリクエストをパスで分類して観測する。
 *
 * @param page 観測対象のページ
 * @param projectId 対象プロジェクトのID（一括取得・現場調査一覧のパス判定に用いる）
 * @param catalog 画像本体の分類に用いるストレージキーの目録
 * @returns 記録の格納先と観測終了関数
 */
function observePhotoDialogRequests(
  page: Page,
  projectId: string,
  catalog: StorageKeyCatalog
): PhotoDialogObservation {
  const bulkListPaths: string[] = [];
  const surveyListPaths: string[] = [];
  const surveyDetailPaths: string[] = [];
  const thumbnailRequestPaths: string[] = [];
  const originalRequestPaths: string[] = [];
  const unclassifiedStoragePaths: string[] = [];

  const bulkListPath = `/api/projects/${projectId}/survey-images`;
  const surveyListPath = `/api/projects/${projectId}/site-surveys`;

  const record = (request: { url: () => string; method: () => string }): void => {
    if (request.method() === 'OPTIONS') {
      return;
    }
    let pathname: string;
    try {
      pathname = new URL(request.url()).pathname;
    } catch {
      return;
    }

    if (pathname.startsWith('/api/')) {
      if (pathname === bulkListPath) {
        bulkListPaths.push(pathname);
        return;
      }
      if (pathname === surveyListPath) {
        surveyListPaths.push(pathname);
        return;
      }
      if (SURVEY_DETAIL_PATH_PATTERN.test(pathname)) {
        surveyDetailPaths.push(pathname);
      }
      return;
    }

    // ストレージ側。署名付きURLのパス末尾に現れるキーで分類する
    const thumbnailKey = catalog.thumbnailKeys.find((key) => pathname.endsWith(key));
    if (thumbnailKey !== undefined) {
      thumbnailRequestPaths.push(pathname);
      return;
    }
    const originalKey = catalog.originalKeys.find((key) => pathname.endsWith(key));
    if (originalKey !== undefined) {
      originalRequestPaths.push(pathname);
      return;
    }
    if (pathname.includes('/storage/')) {
      unclassifiedStoragePaths.push(pathname);
    }
  };

  page.on('request', record);
  return {
    bulkListPaths,
    surveyListPaths,
    surveyDetailPaths,
    thumbnailRequestPaths,
    originalRequestPaths,
    unclassifiedStoragePaths,
    stop: () => page.off('request', record),
  };
}

// ============================================================================
// 補助
// ============================================================================

/** アクセストークンを伴うリクエストヘッダ */
let authHeaders: Record<string, string> = {};

/** シードした現場調査のID（表示順） */
const seededSurveyIds: string[] = [];
/** 注釈を付けた写真（選択候補に現れるべき写真） */
const annotatedImages: DetailImage[] = [];
/** 注釈を付けていない写真（選択候補に現れてはならない写真） */
const plainImages: DetailImage[] = [];
/** 一括取得APIが返した一覧（表示元URLの確認に用いる） */
let listedImages: ListedImage[] = [];
/** 画像本体リクエストの分類に用いる目録 */
let storageKeyCatalog: StorageKeyCatalog = { thumbnailKeys: [], originalKeys: [] };

let createdProjectId: string | null = null;
let createdQuantityTableId: string | null = null;

/**
 * 画像のサムネイル系ストレージキー（通常サムネイルと合成済みサムネイル）を返す。
 *
 * @param image 現場調査詳細が返した画像
 * @returns サムネイル系のストレージキー
 */
function thumbnailKeysOf(image: DetailImage): string[] {
  const keys = [image.thumbnailPath, image.annotatedThumbnailPath ?? ''];
  return keys.filter((key) => key.length > 0);
}

/**
 * URLからパス部分のみを取り出す。
 *
 * @param url 署名付きURL
 * @param label 失敗時に示す対象名
 * @returns URLのパス
 */
function pathnameOf(url: string | null, label: string): string {
  assertPrepared(url, label);
  return new URL(url).pathname;
}

/**
 * 写真選択ダイアログを開き、注釈付き写真が揃うまで待つ。
 *
 * @param page Playwright のページ（数量表の編集画面に居ること）
 * @param groupCard 写真未紐付けの数量グループのカード
 * @returns 開いたダイアログ
 * @throws プレースホルダーが出ない・ダイアログが開かない・候補が揃わない場合
 */
async function openPhotoSelectDialog(page: Page, groupCard: Locator): Promise<Locator> {
  const placeholder = groupCard.locator('[data-testid^="image-placeholder-"]').first();
  await expect(placeholder, '前提: 写真未紐付けのプレースホルダーが表示される').toBeVisible({
    timeout: getTimeout(15000),
  });
  await placeholder.click();

  const dialog = page.getByRole('dialog', { name: '写真を選択' });
  await expect(dialog, '前提: 写真選択ダイアログが開く').toBeVisible({
    timeout: getTimeout(10000),
  });

  await expect(
    dialog.locator('[data-testid^="photo-item-"]'),
    `前提: 注釈付き写真${EXPECTED_LISTED_COUNT}件が選択候補に並ぶ`
  ).toHaveCount(EXPECTED_LISTED_COUNT, { timeout: getTimeout(20000) });

  return dialog;
}

// ============================================================================
// テスト
// ============================================================================

test.describe('写真選択ダイアログの一括取得とサムネイル表示', () => {
  test.describe.configure({ mode: 'serial' });

  /**
   * 事前準備
   *
   * 注釈付きと注釈なしの写真を持つ現場調査を複数作成する。既存のシードデータには
   * 「同一プロジェクトに複数の現場調査があり、その一部の写真だけが注釈付き」という
   * 状態が無いため、テスト内で作成する。
   */
  test.beforeAll(async ({ browser }) => {
    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();

    try {
      await loginAsUser(page, 'REGULAR_USER');

      createdProjectId = await createTestProject(page, 'REQ49_写真選択');

      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      assertPrepared(accessToken, 'アクセストークン');
      authHeaders = { Authorization: `Bearer ${accessToken}` };

      /** 現場調査詳細の画像を表示順で取得する */
      const fetchDetailImages = async (surveyId: string): Promise<DetailImage[]> => {
        const response = await page.request.get(`${API_BASE_URL}/api/site-surveys/${surveyId}`, {
          headers: authHeaders,
        });
        expect(
          response.ok(),
          `前提: 現場調査詳細が取得できる (status=${response.status()})`
        ).toBeTruthy();
        const detail = (await response.json()) as { images: DetailImage[] };
        return [...detail.images].sort((a, b) => a.displayOrder - b.displayOrder);
      };

      // --- 現場調査をシードし、各現場調査の先頭1枚にだけ注釈を付ける ---
      // 注釈の保存は共有ヘルパー `e2e/helpers/survey-image-annotations.ts` に集約した
      // （Task 82.1。従前は本ファイル内に `saveAnnotation` を書き起こしていた）。
      // 位置指定で渡すため注釈なし写真が残り、「注釈付きだけが現れる」の主張が
      // 空集合に対する恒真にならない。
      for (let index = 0; index < SURVEY_COUNT; index += 1) {
        const seeded = await seedSurveyPhotosWithComments(
          page,
          createdProjectId,
          `REQ49_調査${index + 1}`,
          Array.from({ length: PHOTOS_PER_SURVEY }, () => null),
          [ANNOTATED_INDEX]
        );
        seededSurveyIds.push(seeded.surveyId);

        expect(
          seeded.imageIds,
          `前提: 現場調査${index + 1}に写真が${PHOTOS_PER_SURVEY}枚ある`
        ).toHaveLength(PHOTOS_PER_SURVEY);
        expect(
          seeded.annotatedImageIds,
          `前提: 現場調査${index + 1}の写真のうち1枚だけに注釈が付く`
        ).toHaveLength(1);
      }

      // --- 注釈の保存後に目録を作り直す（合成済みサムネイルが生成された場合も拾う） ---
      for (const surveyId of seededSurveyIds) {
        const images = await fetchDetailImages(surveyId);
        images.forEach((image, index) => {
          // 表示領域の確保と表示元の判定は実寸に依存するため、前提が崩れていないことを確認する
          expect(image.width, '前提: 写真の幅が正の値である').toBeGreaterThan(0);
          expect(image.height, '前提: 写真の高さが正の値である').toBeGreaterThan(0);
          if (index === ANNOTATED_INDEX) {
            annotatedImages.push(image);
          } else {
            plainImages.push(image);
          }
        });
      }

      expect(annotatedImages, '前提: 注釈付き写真が現場調査ごとに1枚ある').toHaveLength(
        SURVEY_COUNT
      );
      expect(plainImages, '前提: 注釈なし写真が現場調査ごとに1枚ある').toHaveLength(SURVEY_COUNT);

      storageKeyCatalog = {
        thumbnailKeys: [...annotatedImages, ...plainImages].flatMap(thumbnailKeysOf),
        originalKeys: [...annotatedImages, ...plainImages].map((image) => image.originalPath),
      };

      // --- 一括取得APIの応答を確認し、表示元URLの目録を作る ---
      const listResponse = await page.request.get(
        `${API_BASE_URL}/api/projects/${createdProjectId}/survey-images`,
        { headers: authHeaders }
      );
      expect(
        listResponse.ok(),
        `前提: プロジェクト写真一覧が取得できる (status=${listResponse.status()})`
      ).toBeTruthy();
      const list = (await listResponse.json()) as { images: ListedImage[]; hasMore: boolean };
      listedImages = list.images;

      expect(list.hasMore, '前提: 上限による切り捨てが発生していない').toBe(false);
      expect([...listedImages].map((image) => image.id).sort()).toEqual(
        annotatedImages.map((image) => image.id).sort()
      );

      // 表示元URLはサムネイル系であり、原本ではない（REQ-49.10 の前提）
      for (const listed of listedImages) {
        const detail = annotatedImages.find((image) => image.id === listed.id);
        assertPrepared(detail, `一覧の写真(${listed.id})に対応する現場調査詳細の画像`);
        const displayPathname = pathnameOf(listed.displayUrl, `写真(${listed.id})の表示用URL`);
        expect(
          thumbnailKeysOf(detail).some((key) => displayPathname.endsWith(key)),
          `前提: 表示用URL(${displayPathname})がサムネイル系のキーを指す`
        ).toBe(true);
        expect(
          displayPathname.endsWith(detail.originalPath),
          `前提: 表示用URL(${displayPathname})が原本のキーを指さない`
        ).toBe(false);
      }

      const created = await createTestQuantityTable(page, createdProjectId, 'REQ49_数量表');
      createdQuantityTableId = created.id;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-49.9
   *
   * 一覧の対象は注釈エディタで編集済みの写真のみ（Requirement 4.3 / 19.2）。
   * 注釈なしの写真は候補に現れず、注釈付きの写真は選択して紐づけられる。
   */
  test('注釈を付けた写真だけが選択候補に並び、注釈のない写真は現れない (quantity-table-generation/REQ-49.9)', async ({
    page,
  }) => {
    await openQuantityTableEdit(page, createdQuantityTableId);
    const groupCard = await addQuantityGroup(page);
    const dialog = await openPhotoSelectDialog(page, groupCard);

    // 注釈付きの写真はすべて候補に現れる
    for (const image of annotatedImages) {
      await expect(
        dialog.locator(`[data-testid="photo-item-${image.id}"]`),
        `注釈付き写真(${image.fileName})が選択候補に現れる`
      ).toBeVisible({ timeout: getTimeout(10000) });
    }

    // 注釈のない写真は候補に現れない（注釈付きと同じプロジェクトに存在しているが対象外）
    for (const image of plainImages) {
      await expect(
        dialog.locator(`[data-testid="photo-item-${image.id}"]`),
        `注釈のない写真(${image.fileName})は選択候補に現れない`
      ).toHaveCount(0);
    }

    console.log(
      `[REQ-49] 選択候補=${EXPECTED_LISTED_COUNT}件 / 注釈付き=${annotatedImages.length}件 / 注釈なし=${plainImages.length}件（いずれも同一プロジェクト・現場調査${SURVEY_COUNT}件に分散）`
    );

    // 注釈付きの写真は選択して数量グループへ紐づけられる
    const target = annotatedImages[0]!;
    await dialog.locator(`[data-testid="photo-item-${target.id}"]`).click();
    await expect(dialog, '写真の選択でダイアログが閉じる').not.toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(
      groupCard.locator(`img[alt="${target.fileName}"]`).first(),
      `選択した注釈付き写真(${target.fileName})が数量グループに表示される`
    ).toBeVisible({ timeout: getTimeout(15000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-49.9
   *
   * ダイアログを開いたときの取得はプロジェクト写真一覧1回のみであり、現場調査ごとの
   * 個別リクエスト（現場調査一覧→現場調査詳細×N）は発生しない。
   */
  test('ダイアログを開いても現場調査詳細への個別リクエストが発生しない (quantity-table-generation/REQ-49.9)', async ({
    page,
  }) => {
    assertPrepared(createdProjectId, '事前準備で作成したプロジェクトのID');
    await openQuantityTableEdit(page, createdQuantityTableId);
    const groupCard = await addQuantityGroup(page);

    // 観測はダイアログを開く直前から開始する（画面の初期表示を混ぜない）
    const observation = observePhotoDialogRequests(page, createdProjectId, storageKeyCatalog);

    await openPhotoSelectDialog(page, groupCard);

    console.log(
      `[REQ-49] ダイアログ表示時: 一括取得=${observation.bulkListPaths.length} / 現場調査一覧=${observation.surveyListPaths.length} / 現場調査詳細=${observation.surveyDetailPaths.length}（現場調査=${SURVEY_COUNT}件）`
    );

    // 写真一覧は1回の取得でまとめて得られる
    expect(observation.bulkListPaths, '写真一覧の取得は1回である').toHaveLength(1);
    // 現場調査ごとの個別リクエストは発生しない
    expect(observation.surveyDetailPaths, '現場調査詳細の取得は発生しない').toEqual([]);
    expect(observation.surveyListPaths, '現場調査一覧の取得は発生しない').toEqual([]);

    // --- 判定の素通り防止: 同じ観測器で現場調査一覧・詳細を実際に捉えられることを示す ---
    await page.getByRole('button', { name: 'ダイアログを閉じる' }).click();
    await expect(page.getByRole('dialog', { name: '写真を選択' })).not.toBeVisible({
      timeout: getTimeout(10000),
    });

    const bulkCreateButton = page.getByTestId('bulk-create-from-survey-button');
    await expect(bulkCreateButton, '前提: 現場調査から一括追加のボタンが表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    await bulkCreateButton.click();

    const surveySelectDialog = page.getByTestId('survey-select-dialog');
    await expect(surveySelectDialog, '前提: 現場調査選択ダイアログが開く').toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect
      .poll(() => observation.surveyListPaths.length, {
        timeout: getTimeout(15000),
        message: '現場調査一覧の観測条件が誤っている（実際に発生した取得を捉えられていない）',
      })
      .toBeGreaterThan(0);

    const targetSurveyId = seededSurveyIds[0]!;
    await page.getByTestId(`survey-select-option-${targetSurveyId}`).click();
    await page.getByTestId('survey-select-dialog-confirm').click();
    await expect
      .poll(() => observation.surveyDetailPaths.includes(`/api/site-surveys/${targetSurveyId}`), {
        timeout: getTimeout(20000),
        message: '現場調査詳細の観測条件が誤っている（実際に発生した取得を捉えられていない）',
      })
      .toBe(true);

    observation.stop();

    console.log(
      `[REQ-49] 現場調査から一括追加の後: 現場調査一覧=${observation.surveyListPaths.length} / 現場調査詳細=${observation.surveyDetailPaths.length} / 一括取得=${observation.bulkListPaths.length}`
    );

    // 写真一覧の取得は増えていない（別経路の取得で一覧を引き直していない）
    expect(observation.bulkListPaths, '写真一覧の取得は1回のままである').toHaveLength(1);
  });

  /**
   * @requirement quantity-table-generation/REQ-49.10
   *
   * 一覧表示はサムネイル画像を取得し、原本画像は取得しない。
   */
  test('写真一覧の表示にサムネイル画像を用い、原本画像を取得しない (quantity-table-generation/REQ-49.10)', async ({
    page,
  }) => {
    assertPrepared(createdProjectId, '事前準備で作成したプロジェクトのID');
    await openQuantityTableEdit(page, createdQuantityTableId);
    const groupCard = await addQuantityGroup(page);

    const observation = observePhotoDialogRequests(page, createdProjectId, storageKeyCatalog);

    const dialog = await openPhotoSelectDialog(page, groupCard);

    // 一覧の各写真について、サムネイル系の画像本体が取得される
    for (const image of annotatedImages) {
      const keys = thumbnailKeysOf(image);
      await expect
        .poll(
          () =>
            observation.thumbnailRequestPaths.some((requestPath) =>
              keys.some((key) => requestPath.endsWith(key))
            ),
          {
            timeout: getTimeout(20000),
            message: `写真(${image.fileName})のサムネイルが取得されていない`,
          }
        )
        .toBe(true);
    }

    console.log(
      `[REQ-49] 一覧表示: サムネイル取得=${observation.thumbnailRequestPaths.length} / 原本取得=${observation.originalRequestPaths.length} / 未分類ストレージ=${JSON.stringify(observation.unclassifiedStoragePaths)}`
    );

    // 一覧表示で原本は取得されない
    expect(observation.originalRequestPaths, '一覧表示で原本画像を取得しない').toEqual([]);
    // 分類漏れがあると上の判定が緩むため、未分類のストレージ取得が無いことを確かめる
    expect(observation.unclassifiedStoragePaths, '分類できないストレージ取得が無い').toEqual([]);

    // --- 判定の素通り防止: 同じ観測器で原本の取得を実際に捉えられることを示す ---
    const target = annotatedImages[0]!;
    await dialog.locator(`[data-testid="photo-item-${target.id}"]`).click();
    await expect(dialog, '写真の選択でダイアログが閉じる').not.toBeVisible({
      timeout: getTimeout(10000),
    });

    const previewButton = groupCard.getByRole('button', { name: '紐付け画像を表示' }).first();
    await expect(previewButton, '前提: 紐付け画像の表示ボタンが表示される').toBeVisible({
      timeout: getTimeout(15000),
    });
    await previewButton.click();
    await expect(
      page.getByRole('dialog', { name: '写真プレビュー' }),
      '前提: 写真プレビューダイアログが開く'
    ).toBeVisible({ timeout: getTimeout(10000) });

    await expect
      .poll(
        () =>
          observation.originalRequestPaths.some((requestPath) =>
            requestPath.endsWith(target.originalPath)
          ),
        {
          timeout: getTimeout(20000),
          message: '原本取得の観測条件が誤っている（実際に発生した取得を捉えられていない）',
        }
      )
      .toBe(true);

    observation.stop();

    console.log(
      `[REQ-49] 拡大表示の後: サムネイル取得=${observation.thumbnailRequestPaths.length} / 原本取得=${observation.originalRequestPaths.length}`
    );
  });
});
