/**
 * @fileoverview 数量グループ数によらない数量表編集画面の画像リクエストのE2Eテスト
 *
 * Task 76.2: 数量表編集画面の画像リクエストが数量グループ数に比例しないことを確認する
 * Task 83.1: 拡大表示で原本を取得することをE2Eで確認する
 *
 * Requirements coverage (quantity-table-generation):
 * - @requirement quantity-table-generation/REQ-49.2: 数量表編集画面の表示で、注釈を反映した写真を表示するための追加リクエストを数量グループごとに発生させない
 * - @requirement quantity-table-generation/REQ-49.3: 数量表編集画面の表示で発生するサーバーリクエストの件数を、数量グループ数の増加に比例して増大させない
 * - @requirement quantity-table-generation/REQ-49.7: 表題部の写真を拡大表示した操作の時点で原本画像を取得する
 * - @requirement quantity-table-generation/REQ-49.8: 表示領域外の数量グループの写真の取得を、表示領域に入るまで行わない
 *
 * ## 観測方式
 *
 * リクエストの選別は**オリジンではなくパス**で行う。ブラウザが使うAPIオリジン
 * （`VITE_API_URL`）とE2E側の `API_BASE_URL` は同一とは限らず（CIでは前者が
 * `localhost:3000`、後者が `127.0.0.1:3000`）、オリジン文字列で選別すると観測対象が
 * 1件も残らないまま「リクエストは少ない」が常に成立してしまうため。画像本体の送り先
 * （`LOCAL_STORAGE_URL`）もテスト環境では 3100、CI では 3000 であり同じ事情にある。
 *
 * 画像本体の判定はストレージキーの後方一致で行う。合成済みサムネイルの保存先は原本・
 * 通常サムネイルとは別のキーを取り得るため、「現場調査IDを含むパス」のような前方一致では
 * どの表示元が採用されたかを判別できない。
 *
 * ## 前提状態の確認経路
 *
 * 編集画面が実際に用いる取得経路は `GET /api/quantity-tables/:id` である。前提状態
 * （各グループの表題部へ合成済みサムネイルの表示元URLが供給されていること）の確認も
 * この応答で行う。現場調査側の応答で確認すると、数量表側の応答の欠落を見落とす。
 *
 * ## 判定が素通りしないことの担保
 *
 * 「初期表示の取得件数 < 数量グループ数」は主張として弱い。観測条件の誤りで0件を数えている
 * 場合も成立し、グループ数が少なければ恒真に近づく。さらに表示領域の観測（`useInViewport`）を
 * 外しても、`loading="lazy"` の native lazy loading が先頭から連続して数件だけ取得するため
 * （取得件数はスクロール距離の閾値÷カード高で決まり、**数量グループ数には依存しない定数**）、
 * グループ数を増やすほど `取得件数 < グループ数` はかえって容易に成立してしまう。
 * そのため件数の主張は**表示領域へ実際に入るグループ数**（`VIEWPORT_GROUP_LIMIT`）を上限とし、
 * 併せて次を検証する。
 *
 * 1. 初期表示の取得件数が1件以上であること（＝表題部の写真表示そのものが壊れていない）
 * 2. 初期表示で観測した表示元キーの集合が、表示領域へ入る先頭グループの表示元キーの
 *    **部分集合**であること（＝表示領域外のどのグループも取得されていない。49.3 / 49.8）
 * 3. 表示領域外のグループの表示元が初期表示では取得されず、当該グループを表示領域へ入れると
 *    **そのグループの表示元が**取得されること（＝遅延であって欠落ではない。件数の増加だけでは
 *    別のグループの取得かもしれず、主張にならない）。これを 49.5 が定める主経路
 *    （合成済みサムネイルを持つグループ）と、クライアント側合成を経由するグループの双方で行う
 * 4. 全グループを表示領域へ入れると、同じ計数器が数量グループ数へ到達すること
 * 5. 注釈取得についても、合成済みサムネイルを持たないグループでは表示領域到達後に実際に
 *    発生すること（＝「注釈取得が0件」が観測漏れではないこと）
 * 6. 合成済みサムネイルのキーが、当該画像の原本とも通常サムネイルとも、また計測対象の
 *    どの画像のキーとも異なること（＝どの表示元が採用されたかがパスで一意に判別できること）
 *
 * 実測値はテストログへ出力する。
 *
 * ## 取得の契機（49.7）
 *
 * 49.4 / 49.5 が定める表題部の表示元はサムネイル（合成済みサムネイル）であり、原本は
 * 拡大表示の時点で取得される（49.7）。この対比は**同一の観測器・同一の述語**
 * （`observation.originalKeys`）で測る。すなわち「拡大表示の前は原本0件」と
 * 「拡大操作の後は当該写真の原本が取得される」を一組として判定し、0件の側だけでは
 * 観測漏れでも成立してしまうことを避ける。原本とサムネイルはいずれもストレージキーの
 * 後方一致で判別するため、拡大表示の表示元がサムネイルへ退行した場合は原本0件のまま
 * 後者が成立しない。
 *
 * ## 編集画面が発行するリクエスト
 *
 * 編集画面は `GET /api/quantity-tables/:id` の1回で全グループと表題部の写真表示に必要な情報を
 * 受け取り（49.1）、画像本体はストレージの署名付きURLへ、注釈データは
 * `GET /api/site-surveys/images/:imageId/annotations` へ送出される。
 *
 * @module e2e/specs/quantity-tables/quantity-group-image-request-scaling-e2e.spec
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import {
  createTestProject,
  createTestQuantityTable,
  seedSurveyPhotosWithComments,
} from '../../helpers/quantity-table-preconditions';
import { assertPrepared } from '../../helpers/preconditions';
import { getPrismaClient } from '../../fixtures/database';
import { API_BASE_URL } from '../../config';

// ============================================================================
// 定数
// ============================================================================

/**
 * 数量グループの件数
 *
 * 表示領域へ収まりきらない件数を用いる必要がある。表題部の写真枠は 640x480 の固定寸法であり、
 * グループカード1件の高さは 600px を超える。計測に用いる表示領域（下記 1280x720）へ
 * 初期表示で入るのは先頭の1〜2グループに限られるため、10件あれば「表示領域外のグループ」が
 * 8件以上残る。10件は写真アップロードの1リクエストあたりの上限（`MAX_FILES_PER_REQUEST`）と
 * 一致し、1回のアップロードで揃う最大の件数でもある。
 *
 * この件数は**判定の強さには関与しない**。件数の主張は `VIEWPORT_GROUP_LIMIT`（表示領域へ
 * 実際に入るグループ数）を上限とするため、グループ数を増減しても判定の厳しさは変わらない。
 */
const GROUP_COUNT = 10;

/**
 * 合成済みサムネイルを持たせない画像の位置（0始まり）
 *
 * 中間のグループ（6番目）とする。初期表示の表示領域には入らない位置であり、
 * 「表示領域外では注釈取得も発生しないこと」（49.8）と「表示領域へ入れば発生すること」
 * （＝注釈取得の観測が有効であること）の双方を同一の画面で確認できる。
 *
 * **末尾へ置かない理由。** 合成済みサムネイルを持たないグループの表示はクライアント側合成
 * （注釈取得 → Fabric.js 合成 → data URL）を経由するため、`loading="lazy"` の native lazy
 * loading による取得制限が働かない。この1件だけで 49.8 を判定すると、表示領域の観測を外した
 * 状態でもこの1件は必ず検出できてしまう一方、49.5 が定める主経路（全グループが合成済み
 * サムネイルを持つ本番の通常状態）での取得抑止については何も述べないことになる。主経路の
 * 判定は下の `INDEX_OFFSCREEN_WITH_COMPOSED_THUMBNAIL` が担い、この位置のグループは
 * 「注釈取得の観測が成立していること」の担保に用いる。両者を別の位置へ置くことで、
 * 主経路の判定がクライアント側合成の経路に依存しない。
 */
const INDEX_WITHOUT_COMPOSED_THUMBNAIL = 5;

/**
 * 49.8 の主経路の判定に用いる、表示領域外のグループの位置（0始まり）
 *
 * 合成済みサムネイルを持つ5番目のグループ。表示領域の観測（`useInViewport`）が働かない状態では
 * native lazy loading が先頭から連続して取得する範囲がこの位置まで及ぶ（スクロール距離の閾値
 * ÷カード高で決まり、数量グループ数には依存しない）。すなわち取得抑止の欠落を最も検出しにくい
 * 位置であるため、ここを主経路の判定点に置く。
 */
const INDEX_OFFSCREEN_WITH_COMPOSED_THUMBNAIL = 4;

/**
 * 初期表示で表示領域（+先読み余白50px）へ入る数量グループ数の上限
 *
 * 計測に用いる表示領域は 1280x720、グループカード1件の高さは 600px を超えるため、先読み余白を
 * 含めて到達するのは先頭1件である。見出し高や余白の取り方の変動を吸収するため、許容を
 * 先頭2件までとする。**数量グループ数に依存しない定数**であり、件数の主張はこの上限で行う。
 */
const VIEWPORT_GROUP_LIMIT = 2;

/** 合成済みサムネイルを持たせる画像の件数（持たせない1件を除く） */
const COMPOSED_THUMBNAIL_COUNT = GROUP_COUNT - 1;

/**
 * 計測に用いる表示領域の大きさ
 *
 * Playwright の既定（Desktop Chrome）と同じ 1280x720 を明示的に与える。数量表編集画面は
 * グループ一覧の上に見出し・数量表名・操作列を持ち、この高さでは先頭グループの表題部だけが
 * 表示領域（+先読み余白50px）へ入る。**一部のグループだけが表示領域へ入る**大きさでなければ
 * 「取得件数 < グループ数」に意味が無いため、既定に依存せずテスト側で固定する。
 */
const MEASUREMENT_VIEWPORT = { width: 1280, height: 720 } as const;

/** 数量表詳細の取得APIのパス（編集画面が全グループをまとめて受け取る経路。49.1） */
const quantityTableDetailPath = (quantityTableId: string): string =>
  `/api/quantity-tables/${quantityTableId}`;

/** 注釈データ取得APIのパス */
const ANNOTATION_PATH_PATTERN = /^\/api\/site-surveys\/images\/([0-9a-f-]+)\/annotations$/i;

/** 注釈データ取得APIのパスを画像IDから組み立てる */
const annotationPathOf = (imageId: string): string =>
  `/api/site-surveys/images/${imageId}/annotations`;

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
}

/** `GET /api/quantity-tables/:id` が返すグループ要素のうち本テストが用いる項目 */
interface DetailGroup {
  id: string;
  name: string;
  displayOrder: number;
  surveyImage: {
    id: string;
    fileName: string;
    thumbnailUrl: string | null;
    originalUrl: string | null;
    annotatedThumbnailUrl?: string | null;
    hasAnnotations?: boolean;
    width?: number;
    height?: number;
  } | null;
}

/** `GET /api/quantity-tables/:id` の応答のうち本テストが用いる項目 */
interface QuantityTableDetailResponse {
  id: string;
  updatedAt: string;
  groups: DetailGroup[];
}

/**
 * 画像本体リクエストの分類に用いるストレージキーの目録
 *
 * キーは署名付きURLのパス末尾に現れる。オリジンや署名クエリに依存せず後方一致で判定する。
 */
interface StorageKeyCatalog {
  /** 縮小表示の表示元となり得るキー（通常サムネイル・合成済みサムネイル） */
  displaySourceKeys: string[];
  /** 原本のキー。表題部の縮小表示では取得されない想定（49.4） */
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
  /**
   * 目録のどれにも該当しなかったストレージ宛のパス。観測漏れの検知用
   *
   * 解析できないURLもここへ記録する。無言で捨てると分類漏れが件数の主張を緩めたまま
   * 気付けなくなる。
   */
  unclassifiedStoragePaths: string[];
  /** 注釈データ取得のパス。発生順・重複あり */
  annotationPaths: string[];
  /** 数量表詳細取得のパス。発生順・重複あり */
  quantityTableDetailPaths: string[];
  stop: () => void;
}

/**
 * 数量表編集画面の画像に関するリクエストをパス基準で観測する
 *
 * 画像本体はストレージの署名付きURLへ送出されるためオリジンがAPIと異なる。どちらの経路も
 * `new URL(url).pathname` に対する判定のみで分類し、接続先の違いで判定が変わらないようにする。
 *
 * @param page 観測対象のページ
 * @param quantityTableId 対象の数量表ID
 * @param catalog 画像本体の分類に用いるストレージキーの目録
 * @returns 記録の格納先と観測終了関数
 */
function observeImageRequests(
  page: Page,
  quantityTableId: string,
  catalog: StorageKeyCatalog
): ImageRequestObservation {
  const displaySourceKeys: string[] = [];
  const originalKeys: string[] = [];
  const unclassifiedStoragePaths: string[] = [];
  const annotationPaths: string[] = [];
  const quantityTableDetailPaths: string[] = [];

  const detailPath = quantityTableDetailPath(quantityTableId);

  const record = (request: { url: () => string; method: () => string }): void => {
    if (request.method() === 'OPTIONS') {
      return;
    }
    let pathname: string;
    try {
      pathname = new URL(request.url()).pathname;
    } catch {
      // 解析できないURLは分類できない。黙って捨てると観測漏れが判定を緩めるため記録する
      unclassifiedStoragePaths.push(request.url());
      return;
    }

    if (pathname.startsWith('/api/')) {
      if (pathname === detailPath) {
        quantityTableDetailPaths.push(pathname);
        return;
      }
      if (ANNOTATION_PATH_PATTERN.test(pathname)) {
        annotationPaths.push(pathname);
      }
      return;
    }

    // ストレージ側。署名付きURLのパス末尾に現れるキーで分類する
    const displayKey = catalog.displaySourceKeys.find((key) => pathname.endsWith(key));
    if (displayKey !== undefined) {
      displaySourceKeys.push(displayKey);
      return;
    }
    const originalKey = catalog.originalKeys.find((key) => pathname.endsWith(key));
    if (originalKey !== undefined) {
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
    quantityTableDetailPaths,
    stop: () => page.off('request', record),
  };
}

/** 重複を除いた件数 */
const uniqueCount = (values: string[]): number => new Set(values).size;

// ============================================================================
// テスト
// ============================================================================

test.describe('数量グループ数によらない編集画面の画像リクエスト', () => {
  // `mode: 'serial'` は用いない。直列実行は `playwright.config.ts` の
  // `fullyParallel: false` / `workers: 1` で既に担保されている。serial を指定すると
  // 先頭のテストが落ちた時点で後続が未実行（`-`）になり、どの主張が感応したのかを
  // 取得抑止の変異下で確かめられなくなる。各テストは専用のブラウザコンテキストで
  // 観測するため互いに依存しない。

  let createdProjectId: string | null = null;
  let createdQuantityTableId: string | null = null;
  /** 数量グループへ紐づけた写真（表示順） */
  let measuredImages: DetailImage[] = [];
  /**
   * 合成済みサムネイルとして各グループへ与えたストレージキー
   *
   * 位置は `measuredImages` と対応する。合成済みサムネイルを持たせないグループ
   * （`INDEX_WITHOUT_COMPOSED_THUMBNAIL`）の位置は `null`。
   */
  const composedThumbnailKeys: (string | null)[] = [];
  /** グループごとに取得されるべき表示元のストレージキー（位置は measuredImages と対応） */
  const expectedDisplayKeys: string[] = [];
  /** 画像本体リクエストの分類に用いる目録 */
  let storageKeyCatalog: StorageKeyCatalog = { displaySourceKeys: [], originalKeys: [] };

  /**
   * 事前準備
   *
   * 表示領域に収まりきらない件数の数量グループを持ち、各グループに別々の写真が紐づいた
   * 数量表は既存のシードデータに存在しないため、テスト内で作成する。
   */
  test.beforeAll(async ({ browser }) => {
    // 再試行で作業プロセスが作り直された場合にも積み残しが混ざらないようにする
    composedThumbnailKeys.length = 0;
    expectedDisplayKeys.length = 0;

    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();

    try {
      await loginAsUser(page, 'REGULAR_USER');

      createdProjectId = await createTestProject(page, 'REQ49_件数計測');

      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      assertPrepared(accessToken, 'アクセストークン');
      const authHeaders = { Authorization: `Bearer ${accessToken}` };

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

      // --- 計測対象の写真を作る（全件に注釈を付ける） ---
      // 注釈レコードが無い写真は `hasAnnotations` が偽となり、共有表示部品が注釈取得を
      // 短絡する。「注釈を反映した写真の表示で追加リクエストを発生させない」（49.2）の
      // 主張は、注釈がある状態でなければ何も述べていないことになる。
      const measuredSurvey = await seedSurveyPhotosWithComments(
        page,
        createdProjectId,
        'REQ49_計測',
        Array.from({ length: GROUP_COUNT }, () => null),
        'all'
      );
      expect(
        measuredSurvey.annotatedImageIds,
        `前提: 計測対象の写真${GROUP_COUNT}枚すべてに注釈が付く`
      ).toHaveLength(GROUP_COUNT);

      measuredImages = await fetchDetailImages(measuredSurvey.surveyId);
      expect(measuredImages, `前提: 計測対象の写真が${GROUP_COUNT}枚ある`).toHaveLength(
        GROUP_COUNT
      );

      // --- 合成済みサムネイルの実体を用意する ---
      // 注釈をレンダリングしたサムネイル画像の生成契機は現場調査機能の所管であり、本要件は
      // 所管しない（requirements.md「Requirement 49」のスコープ段落）。本要件が定めるのは
      // 「利用可能である」状態での表示側の振る舞い（49.2 / 49.5）であるため、検証対象の
      // 前提状態（annotatedThumbnailPath が設定済み）をテストデータとして用意する。
      //
      // 保存先には、計測対象とは別の現場調査へアップロードした画像のサムネイルを用いる。
      // 実体のあるオブジェクトでありながら、計測対象の画面が他の用途で取得することが無い
      // キーであるため、「どの表示元が採用されたか」をパスで一意に判別できる。
      const donorSurvey = await seedSurveyPhotosWithComments(
        page,
        createdProjectId,
        'REQ49_供給',
        Array.from({ length: COMPOSED_THUMBNAIL_COUNT }, () => null),
        'none'
      );
      const donorImages = await fetchDetailImages(donorSurvey.surveyId);
      expect(
        donorImages,
        `前提: 合成済みサムネイルの供給元が${COMPOSED_THUMBNAIL_COUNT}枚ある`
      ).toHaveLength(COMPOSED_THUMBNAIL_COUNT);

      // 合成済みサムネイルを持たせないグループは中間位置（INDEX_WITHOUT_COMPOSED_THUMBNAIL）
      // であり、供給元の割り当ては当該位置を飛ばして詰める
      const prisma = getPrismaClient();
      let donorCursor = 0;
      for (let index = 0; index < GROUP_COUNT; index += 1) {
        if (index === INDEX_WITHOUT_COMPOSED_THUMBNAIL) {
          composedThumbnailKeys.push(null);
          continue;
        }
        const target = measuredImages[index]!;
        const donorKey = donorImages[donorCursor]!.thumbnailPath;
        expect(donorKey, `前提: 供給元${donorCursor + 1}枚目のサムネイルキーがある`).toBeTruthy();
        donorCursor += 1;
        await prisma.surveyImage.update({
          where: { id: target.id },
          data: { annotatedThumbnailPath: donorKey },
        });
        composedThumbnailKeys.push(donorKey);
      }
      expect(
        composedThumbnailKeys,
        `前提: 合成済みサムネイルの割り当てが${GROUP_COUNT}グループ分揃う`
      ).toHaveLength(GROUP_COUNT);
      expect(
        composedThumbnailKeys.filter((key) => key !== null),
        `前提: 合成済みサムネイルを持つグループが${COMPOSED_THUMBNAIL_COUNT}件ある`
      ).toHaveLength(COMPOSED_THUMBNAIL_COUNT);

      // 表示元の判別が成立すること。合成済みサムネイルのキーは、計測対象のどの画像の
      // 原本・通常サムネイルとも一致しない
      const measuredStorageKeys = measuredImages.flatMap((image) => [
        image.originalPath,
        image.thumbnailPath,
      ]);
      for (const composedKey of composedThumbnailKeys) {
        if (composedKey === null) {
          continue;
        }
        expect(
          measuredStorageKeys,
          `前提: 合成済みサムネイルのキー(${composedKey})が計測対象のキーと重ならない`
        ).not.toContain(composedKey);
      }

      // --- 数量表を作り、写真を紐づけた数量グループを一括で用意する ---
      // 画面操作で10件のグループを作り1件ずつ写真を選ぶと、本テストの関心（初期表示で
      // 発生するリクエスト）とは無関係な操作に実行時間の大半を費やす。前提の生成は
      // 編集画面の保存経路（PUT /api/quantity-tables/:id/save。REQ-42.5）で行い、
      // 成立は編集画面が用いる取得経路（GET /api/quantity-tables/:id）の応答で主張する。
      const created = await createTestQuantityTable(page, createdProjectId, 'REQ49_件数計測');
      createdQuantityTableId = created.id;

      /** 編集画面が用いる取得経路で数量表詳細を取得する */
      const fetchQuantityTableDetail = async (): Promise<QuantityTableDetailResponse> => {
        const response = await page.request.get(
          `${API_BASE_URL}${quantityTableDetailPath(createdQuantityTableId!)}`,
          { headers: authHeaders }
        );
        expect(
          response.ok(),
          `前提: 数量表詳細が取得できる (status=${response.status()})`
        ).toBeTruthy();
        return (await response.json()) as QuantityTableDetailResponse;
      };

      const beforeSave = await fetchQuantityTableDetail();
      const saveResponse = await page.request.put(
        `${API_BASE_URL}${quantityTableDetailPath(createdQuantityTableId)}/save`,
        {
          headers: authHeaders,
          data: {
            expectedUpdatedAt: beforeSave.updatedAt,
            name: created.name,
            groups: measuredImages.map((image, index) => ({
              id: null,
              name: `計測グループ${index + 1}`,
              surveyImageId: image.id,
              displayOrder: index,
              items: [],
            })),
          },
        }
      );
      expect(
        saveResponse.ok(),
        `前提: 数量グループ${GROUP_COUNT}件の保存が成功する (status=${saveResponse.status()})`
      ).toBeTruthy();

      // --- 準備した状態を、編集画面が用いる取得経路の応答で確認する ---
      const afterSave = await fetchQuantityTableDetail();
      const groups = [...afterSave.groups].sort((a, b) => a.displayOrder - b.displayOrder);
      expect(groups, `前提: 数量グループが${GROUP_COUNT}件ある`).toHaveLength(GROUP_COUNT);

      /** 供給元として与えた合成済みサムネイルのキー（割り当てのある位置の分だけ） */
      const donorThumbnailKeys = composedThumbnailKeys.filter((key): key is string => key !== null);

      /**
       * 応答が返した合成済みサムネイルURLを、供給したキーへ解き直す
       *
       * 割り当てが無い位置では `null` を返す。解けない場合はパスをそのまま返し、
       * 「割り当てと違うものが入っている」ことが主張の差分として見えるようにする。
       * 位置ごとに分岐した主張を書かず、どの位置でも同じ形で割り当てと突き合わせるための補助。
       */
      const resolveComposedKey = (url: string | null | undefined): string | null => {
        if (!url) {
          return null;
        }
        const pathname = new URL(url).pathname;
        return donorThumbnailKeys.find((key) => pathname.includes(key)) ?? pathname;
      };

      for (const [index, group] of groups.entries()) {
        const image = measuredImages[index]!;
        const surveyImage = group.surveyImage;
        assertPrepared(surveyImage, `グループ${index + 1}に紐づく写真`);
        expect(surveyImage.id, `前提: グループ${index + 1}に${index + 1}枚目の写真が紐づく`).toBe(
          image.id
        );
        expect(surveyImage.hasAnnotations, `前提: グループ${index + 1}の写真に注釈がある`).toBe(
          true
        );

        // 通常サムネイルのURLは、合成済みサムネイルの有無にかかわらず当該写真のキーを指す。
        // 合成済みサムネイルを持たないグループ（49.6 の経路）ではこれが表示元になる
        const thumbnailUrl = surveyImage.thumbnailUrl;
        assertPrepared(thumbnailUrl, `グループ${index + 1}の通常サムネイルURL`);
        expect(
          new URL(thumbnailUrl).pathname,
          `前提: グループ${index + 1}の通常サムネイルが${index + 1}枚目のサムネイルを指す`
        ).toContain(image.thumbnailPath);

        // 合成済みサムネイルの割り当ては用意したとおりである（割り当てが無い位置では null）。
        // 持つ位置では表示元が合成済みサムネイルとなり、注釈取得とクライアント側合成を
        // 経由しない（49.5）。持たない位置では通常サムネイルが表示元となる（49.6）
        const composedKey = composedThumbnailKeys[index] ?? null;
        expect(
          resolveComposedKey(surveyImage.annotatedThumbnailUrl),
          `前提: グループ${index + 1}の合成済みサムネイルの割り当てが用意したとおりである`
        ).toBe(composedKey);

        expectedDisplayKeys.push(composedKey ?? image.thumbnailPath);
      }

      expect(
        expectedDisplayKeys,
        `前提: グループごとの表示元キーが${GROUP_COUNT}件揃う`
      ).toHaveLength(GROUP_COUNT);

      // --- 画像本体リクエストの分類に用いる目録を作る ---
      // 通常サムネイルも目録へ含める。合成済みサムネイルがあるグループで通常サムネイルが
      // 取得された場合を「未分類」ではなく「表示元の取り違え」として判別できるようにする。
      storageKeyCatalog = {
        displaySourceKeys: [
          ...measuredImages.map((image) => image.thumbnailPath),
          ...composedThumbnailKeys.filter((key): key is string => key !== null),
        ],
        originalKeys: measuredImages.map((image) => image.originalPath),
      };

      console.log(
        `[REQ-49] 準備完了: 数量グループ=${GROUP_COUNT}件 / 合成済みサムネイルあり=${COMPOSED_THUMBNAIL_COUNT}件 / 合成済みサムネイルなし=1件（${INDEX_WITHOUT_COMPOSED_THUMBNAIL + 1}番目のグループ） / 49.8の主経路の判定点=${INDEX_OFFSCREEN_WITH_COMPOSED_THUMBNAIL + 1}番目のグループ / 写真の実寸=${measuredImages[0]!.width}x${measuredImages[0]!.height}`
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
   * 数量表編集画面を開き、表題部の画像の描画が始まるまで待つ
   *
   * ブラウザキャッシュの影響を受けないよう、呼び出し側は毎回新しいコンテキストを用いる。
   */
  async function openQuantityTableEditPage(page: Page): Promise<void> {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await expect(
      page.locator('[data-testid="quantity-table-edit-area"]'),
      '前提: 数量表の編集画面が表示される'
    ).toBeVisible({ timeout: getTimeout(20000) });

    // 先頭グループの表題部に表示元URLが設定される＝表示領域内のグループの取得が始まった
    await expect(
      photoOfGroup(page, 0),
      '前提: 先頭グループの表題部の写真に表示元が設定される'
    ).toHaveAttribute('src', /.+/, { timeout: getTimeout(20000) });
    await page.waitForLoadState('networkidle');
  }

  /**
   * 指定位置のグループの表題部の写真要素を返す
   *
   * ファイル名は一方が他方の接頭辞になり得る（`REQ49_計測-1.png` は `REQ49_計測-10.png` の
   * 部分文字列）ため、完全一致で指定する。
   *
   * @param page Playwright のページ
   * @param index グループの位置（0起点）
   */
  function photoOfGroup(page: Page, index: number) {
    return page.getByAltText(measuredImages[index]!.fileName, { exact: true });
  }

  /** 全グループの表題部を順に表示領域へ入れる */
  async function scrollThroughAllGroups(page: Page): Promise<void> {
    for (let index = 0; index < GROUP_COUNT; index += 1) {
      await photoOfGroup(page, index).scrollIntoViewIfNeeded();
    }
    await page.waitForLoadState('networkidle');
  }

  /**
   * @requirement quantity-table-generation/REQ-49.2
   * @requirement quantity-table-generation/REQ-49.3
   * @requirement quantity-table-generation/REQ-49.8
   */
  test('初期表示で発生する画像関連リクエストが表示領域に入るグループの分だけであること (quantity-table-generation/REQ-49.2, quantity-table-generation/REQ-49.3, quantity-table-generation/REQ-49.8)', async ({
    browser,
  }) => {
    assertPrepared(createdQuantityTableId, '事前準備で作成した数量表のID');
    const context = await browser.newContext({ viewport: MEASUREMENT_VIEWPORT });
    const page = await context.newPage();
    try {
      const observation = observeImageRequests(page, createdQuantityTableId, storageKeyCatalog);
      await openQuantityTableEditPage(page);
      observation.stop();

      const imageBodyCount = uniqueCount(observation.displaySourceKeys);
      const annotationCount = uniqueCount(observation.annotationPaths);
      const total = imageBodyCount + annotationCount;

      console.log(
        `[REQ-49] 数量グループ=${GROUP_COUNT}件 / 初期表示: 画像本体=${imageBodyCount} 注釈取得=${annotationCount} 合計=${total} / 数量表詳細取得=${observation.quantityTableDetailPaths.length} / 原本取得=${uniqueCount(observation.originalKeys)} / 未分類ストレージ=${JSON.stringify(observation.unclassifiedStoragePaths)}`
      );
      console.log(
        `[REQ-49] 初期表示で観測した表示元キー: ${JSON.stringify([...new Set(observation.displaySourceKeys)])}`
      );

      // 全グループの情報はグループごとに分割されず1回で取得される（49.3）
      expect(
        observation.quantityTableDetailPaths,
        '数量表詳細の取得は1回である（グループごとに発生しない）'
      ).toHaveLength(1);

      // 観測条件の誤りにより0件を数えていないこと（判定の素通り防止）。
      // 表題部の写真表示そのものが壊れていれば、この主張が先に落ちる
      expect(imageBodyCount, '初期表示で表題部の写真が1件以上取得される').toBeGreaterThan(0);

      // --- 件数の主張（49.3, 49.8） ---
      // 上限は「表示領域へ実際に入るグループ数」であり、数量グループ数には依存しない。
      // `合計 < 数量グループ数` だけでは、表示領域の観測が働かず native lazy loading が
      // 先頭から連続して数件取得する状態（グループ数に依存しない定数件）でも成立してしまう。
      const inViewportExpectedKeys = expectedDisplayKeys.slice(0, VIEWPORT_GROUP_LIMIT);
      expect(
        inViewportExpectedKeys,
        `前提: 表示領域へ入る先頭${VIEWPORT_GROUP_LIMIT}グループの表示元キーが揃う`
      ).toHaveLength(VIEWPORT_GROUP_LIMIT);
      const observedUniqueKeys = [...new Set(observation.displaySourceKeys)];
      const offscreenObservedKeys = observedUniqueKeys.filter(
        (key) => !inViewportExpectedKeys.includes(key)
      );

      // 初期表示で取得された表示元は、表示領域へ入る先頭グループの表示元の部分集合である
      // （＝表示領域外のどのグループも取得されていない）
      expect(
        offscreenObservedKeys,
        `初期表示で表示領域外のグループの表示元を取得しない（許容は先頭${VIEWPORT_GROUP_LIMIT}グループ: ${JSON.stringify(inViewportExpectedKeys)}）`
      ).toEqual([]);
      expect(
        observedUniqueKeys.length,
        `初期表示の表示元の取得件数が表示領域へ入るグループ数(${VIEWPORT_GROUP_LIMIT})以下である`
      ).toBeLessThanOrEqual(VIEWPORT_GROUP_LIMIT);

      // 画像関連リクエストの合計が数量グループ数を下回る（タスク本文の箇条に対応する主張。
      // 上の部分集合の主張が成立していれば従うが、条文との対応を明示するために残す）
      expect(total, '画像関連リクエストの合計が数量グループ数より少ない').toBeLessThan(GROUP_COUNT);

      // 合成済みサムネイルを用いるグループでは注釈取得が発生せず（49.2）、表示領域外の
      // グループでは注釈取得もサムネイル取得も発生しない（49.8）。両者の帰結として
      // 初期表示の注釈取得は0件になる。0件が観測漏れでないことは、同じ観測器で
      // 注釈取得を捉える後続のテストが示す
      expect(observation.annotationPaths, '初期表示で注釈取得が発生しない').toHaveLength(0);

      // 表題部の縮小表示に原本を用いないため、初期表示で原本の取得は発生しない（49.4）
      expect(uniqueCount(observation.originalKeys), '初期表示で原本を取得しない').toBe(0);

      // 表示元・原本・注釈のいずれにも分類されない画像関連リクエストが無いこと。
      // 分類漏れがあると上の合計が実態より小さく見え、判定が緩む（49.3）
      expect(observation.unclassifiedStoragePaths, '分類できないストレージ取得が無い').toEqual([]);
    } finally {
      await context.close();
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-49.2
   */
  test('合成済みサムネイルを持つグループは表示領域へ入れても注釈データの取得が発生しないこと (quantity-table-generation/REQ-49.2)', async ({
    browser,
  }) => {
    assertPrepared(createdQuantityTableId, '事前準備で作成した数量表のID');
    const context = await browser.newContext({ viewport: MEASUREMENT_VIEWPORT });
    const page = await context.newPage();
    try {
      const observation = observeImageRequests(page, createdQuantityTableId, storageKeyCatalog);
      await openQuantityTableEditPage(page);

      // 全グループ（合成済みサムネイルあり9件／なし1件）を表示領域へ入れる
      await scrollThroughAllGroups(page);

      // 合成済みサムネイルが取得された＝当該グループは表示領域へ入り、その画像を表示元とした
      const firstComposedKey = composedThumbnailKeys[0]!;
      await expect
        .poll(() => observation.displaySourceKeys.includes(firstComposedKey), {
          timeout: getTimeout(20000),
          message:
            `先頭グループの合成済みサムネイル(${firstComposedKey})が表示元として取得されていない。` +
            '数量表詳細の応答に annotatedThumbnailUrl が含まれているかを確認すること',
        })
        .toBe(true);

      // 合成済みサムネイルを持たないグループでは注釈取得が発生する。これが観測できることで、
      // 下の「発生しない」判定が観測漏れでないことが示される
      const imageWithoutComposed = measuredImages[INDEX_WITHOUT_COMPOSED_THUMBNAIL]!;
      await expect
        .poll(
          () => observation.annotationPaths.includes(annotationPathOf(imageWithoutComposed.id)),
          {
            timeout: getTimeout(20000),
            message:
              '合成済みサムネイルを持たないグループで注釈取得が観測できない。' +
              '注釈取得の観測条件が誤っている可能性がある',
          }
        )
        .toBe(true);

      observation.stop();

      const composedImageIds = measuredImages
        .filter((_, index) => index !== INDEX_WITHOUT_COMPOSED_THUMBNAIL)
        .map((image) => image.id);
      const annotationRequestsForComposed = observation.annotationPaths.filter((requestPath) =>
        composedImageIds.some((imageId) => requestPath === annotationPathOf(imageId))
      );
      const plainThumbnailRequestsForComposed = measuredImages
        .filter((_, index) => index !== INDEX_WITHOUT_COMPOSED_THUMBNAIL)
        .map((image) => image.thumbnailPath)
        .filter((key) => observation.displaySourceKeys.includes(key));

      console.log(
        `[REQ-49] 全グループ到達後: 注釈取得=${observation.annotationPaths.length}件（合成済みサムネイルあり${COMPOSED_THUMBNAIL_COUNT}件分=${annotationRequestsForComposed.length}件 / なし1件分=${observation.annotationPaths.filter((requestPath) => requestPath === annotationPathOf(imageWithoutComposed.id)).length}件） / 合成済みサムネイルのあるグループで通常サムネイルを取得=${plainThumbnailRequestsForComposed.length}件`
      );

      // 表示領域へ入っても、合成済みサムネイルを持つグループでは注釈取得が発生しない（49.2）
      expect(
        annotationRequestsForComposed,
        '合成済みサムネイルを持つグループで注釈取得が発生しない'
      ).toHaveLength(0);

      // 表示元には通常サムネイルではなく合成済みサムネイルが用いられる（49.2 の前提）
      expect(
        plainThumbnailRequestsForComposed,
        '合成済みサムネイルを持つグループで通常サムネイルを取得しない'
      ).toHaveLength(0);
    } finally {
      await context.close();
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-49.3
   * @requirement quantity-table-generation/REQ-49.8
   */
  test('表示領域外のグループの表示元が初期表示では取得されず、表示領域へ入れて初めて取得されること (quantity-table-generation/REQ-49.3, quantity-table-generation/REQ-49.8)', async ({
    browser,
  }) => {
    assertPrepared(createdQuantityTableId, '事前準備で作成した数量表のID');
    const context = await browser.newContext({ viewport: MEASUREMENT_VIEWPORT });
    const page = await context.newPage();
    try {
      const observation = observeImageRequests(page, createdQuantityTableId, storageKeyCatalog);
      await openQuantityTableEditPage(page);

      const initialImageBodyCount = uniqueCount(observation.displaySourceKeys);
      // 観測が成立していること（0件を数えていない）を先に確かめる。これが無ければ
      // 以下の「表示領域外のグループは取得されていない」は観測漏れでも成立する
      expect(initialImageBodyCount, '初期表示で表題部の写真が1件以上取得される').toBeGreaterThan(0);

      // --- 49.5 が定める主経路（合成済みサムネイルを持つグループ）での 49.8 の判定 ---
      // 本番の通常状態は全グループが合成済みサムネイルを持つ。その経路で取得抑止が外れた
      // ときに検出できなければ 49.8 は固定できない。判定点は native lazy loading が
      // 先頭から到達する最も遠い位置（INDEX_OFFSCREEN_WITH_COMPOSED_THUMBNAIL）へ置く。
      const offscreenComposedKey = composedThumbnailKeys[INDEX_OFFSCREEN_WITH_COMPOSED_THUMBNAIL];
      assertPrepared(
        offscreenComposedKey,
        `${INDEX_OFFSCREEN_WITH_COMPOSED_THUMBNAIL + 1}番目のグループの合成済みサムネイルのキー`
      );
      expect(
        observation.displaySourceKeys,
        `表示領域外の${INDEX_OFFSCREEN_WITH_COMPOSED_THUMBNAIL + 1}番目のグループ（合成済みサムネイルあり）の表示元(${offscreenComposedKey})が初期表示では取得されていない`
      ).not.toContain(offscreenComposedKey);

      // 表示領域外の、合成済みサムネイルを持たないグループの表示元も取得されていない（49.8）
      const clientComposedKey = expectedDisplayKeys[INDEX_WITHOUT_COMPOSED_THUMBNAIL]!;
      expect(
        observation.displaySourceKeys,
        `表示領域外の${INDEX_WITHOUT_COMPOSED_THUMBNAIL + 1}番目のグループ（合成済みサムネイルなし）の表示元(${clientComposedKey})が初期表示では取得されていない`
      ).not.toContain(clientComposedKey);

      // 件数の上限は表示領域へ入るグループ数とする。`< 数量グループ数` は表示領域の観測が
      // 働かない状態（native lazy loading が先頭から連続して定数件を取得する状態）でも
      // 成立するため、単独では取得抑止を何も述べていない。位置を指定した上の2件の後に置くのは、
      // 取得抑止が外れたときに「どのグループが取得されたか」が先に記録へ残るようにするため
      expect(
        initialImageBodyCount,
        `初期表示の取得件数が表示領域へ入るグループ数(${VIEWPORT_GROUP_LIMIT})以下である`
      ).toBeLessThanOrEqual(VIEWPORT_GROUP_LIMIT);

      // --- 主経路のグループを表示領域へ入れる ---
      await photoOfGroup(page, INDEX_OFFSCREEN_WITH_COMPOSED_THUMBNAIL).scrollIntoViewIfNeeded();

      // 当該グループの表示元が取得される＝取得は「遅延」であって「欠落」ではない（49.8）。
      // 件数の増加だけでは別のグループの取得である可能性が残るため、キーで指定して確かめる
      await expect
        .poll(() => observation.displaySourceKeys.includes(offscreenComposedKey), {
          timeout: getTimeout(20000),
          message: `${INDEX_OFFSCREEN_WITH_COMPOSED_THUMBNAIL + 1}番目のグループを表示領域へ入れても合成済みサムネイル(${offscreenComposedKey})が取得されない（遅延ではなく欠落している）`,
        })
        .toBe(true);

      // --- 合成済みサムネイルを持たないグループを表示領域へ入れる ---
      await photoOfGroup(page, INDEX_WITHOUT_COMPOSED_THUMBNAIL).scrollIntoViewIfNeeded();

      await expect
        .poll(() => observation.displaySourceKeys.includes(clientComposedKey), {
          timeout: getTimeout(20000),
          message: `${INDEX_WITHOUT_COMPOSED_THUMBNAIL + 1}番目のグループを表示領域へ入れても表示元(${clientComposedKey})が取得されない（遅延ではなく欠落している）`,
        })
        .toBe(true);

      // --- 全グループを表示領域へ入れる ---
      await scrollThroughAllGroups(page);

      // 全グループの表示元が最終的に取得される（取得は「遅延」であって「欠落」ではない）
      await expect
        .poll(() => uniqueCount(observation.displaySourceKeys), {
          timeout: getTimeout(20000),
          message: '全グループを表示領域へ入れても表示元の取得件数が数量グループ数へ達しない',
        })
        .toBeGreaterThanOrEqual(GROUP_COUNT);

      observation.stop();
      const finalImageBodyCount = uniqueCount(observation.displaySourceKeys);

      console.log(
        `[REQ-49] 表示元の取得件数: 初期表示=${initialImageBodyCount} → スクロール後=${finalImageBodyCount}（数量グループ=${GROUP_COUNT}件）`
      );

      // スクロールによって追加の取得が発生した（49.8）
      expect(finalImageBodyCount, 'スクロール後の取得件数が初期表示より増えている').toBeGreaterThan(
        initialImageBodyCount
      );

      // 数量表詳細の取得は増えない（表示領域到達でグループ情報を引き直していない。49.3）
      expect(
        observation.quantityTableDetailPaths,
        '数量表詳細の取得は1回のままである'
      ).toHaveLength(1);
    } finally {
      await context.close();
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-49.7
   *
   * 表題部の縮小表示（サムネイル。49.4 / 49.5）と拡大表示（原本。49.7）の対比で、原本の
   * 取得が拡大操作の時点に限られることを確かめる。判定は「拡大表示の前は原本0件」と
   * 「拡大操作の後は当該写真の原本が取得される」を**同一の観測器・同一の述語**
   * （`observation.originalKeys`）で一組にして行う。前者だけでは観測条件の誤りでも成立する。
   */
  test('表題部の写真を拡大表示した操作の時点で原本画像を取得すること (quantity-table-generation/REQ-49.7)', async ({
    browser,
  }) => {
    assertPrepared(createdQuantityTableId, '事前準備で作成した数量表のID');
    const context = await browser.newContext({ viewport: MEASUREMENT_VIEWPORT });
    const page = await context.newPage();
    try {
      const observation = observeImageRequests(page, createdQuantityTableId, storageKeyCatalog);
      await openQuantityTableEditPage(page);

      // 拡大表示の対象は初期表示で表示領域へ入る先頭グループとする。表示領域外のグループは
      // 表題部の取得自体が遅延されるため（49.8）、縮小表示と拡大表示の対比にならない
      const target = measuredImages[0]!;
      const composedKey = composedThumbnailKeys[0];
      assertPrepared(composedKey, '先頭グループの合成済みサムネイルのキー');

      // 表題部の表示元はサムネイル側である（49.4 / 49.5）。画面が実際に表示元を引いている
      // ことを先に確かめ、下の「原本0件」が画面の停止や観測の失敗によるものでないようにする
      await expect
        .poll(() => observation.displaySourceKeys.includes(composedKey), {
          timeout: getTimeout(20000),
          message: `先頭グループの表題部の表示元(${composedKey})が取得されていない。数量表詳細の応答に annotatedThumbnailUrl が含まれているかを確認すること`,
        })
        .toBe(true);

      // 拡大表示の前に原本の取得は発生していない（＝取得の契機が拡大操作に限られる）
      expect(
        observation.originalKeys,
        `拡大表示の前に原本(${target.originalPath})を取得しない`
      ).toEqual([]);

      // --- 拡大表示の操作 ---
      // 操作部は表題部の写真を包む要素である。位置ではなく当該写真を含むことで指定し、
      // グループの並び順に依存しないようにする
      const zoomTrigger = page
        .getByRole('button', { name: '紐付け画像を表示' })
        .filter({ has: page.getByAltText(target.fileName, { exact: true }) });
      await expect(
        zoomTrigger,
        '前提: 先頭グループの表題部に拡大表示の操作部が1つある'
      ).toHaveCount(1);
      await zoomTrigger.click();
      await expect(
        page.getByRole('dialog', { name: '写真プレビュー' }),
        '前提: 写真プレビューダイアログが開く'
      ).toBeVisible({ timeout: getTimeout(10000) });

      // 当該操作の時点で原本が取得される（49.7）。0件の側と同じ述語で非空を捉えることで、
      // 上の「拡大表示の前は原本0件」が観測漏れでないことが示される
      await expect
        .poll(() => observation.originalKeys.includes(target.originalPath), {
          timeout: getTimeout(20000),
          message: `拡大表示しても原本(${target.originalPath})が取得されない。拡大表示の表示元がサムネイル側へ退行している可能性がある`,
        })
        .toBe(true);

      observation.stop();

      const observedOriginalKeys = [...new Set(observation.originalKeys)];
      console.log(
        `[REQ-49] 拡大表示: 原本取得=${JSON.stringify(observedOriginalKeys)} / 表示元取得=${uniqueCount(observation.displaySourceKeys)}件 / 未分類ストレージ=${JSON.stringify(observation.unclassifiedStoragePaths)}`
      );

      // 取得された原本は拡大表示した写真の分だけである（＝拡大操作が他のグループの原本取得を
      // 引き起こしていない。「当該操作の時点で」の主張が件数の増加に頼らないようにする）
      expect(observedOriginalKeys, '取得する原本は拡大表示した写真の分だけである').toEqual([
        target.originalPath,
      ]);

      // 分類漏れがあると原本0件・原本1件の双方の判定が緩むため、未分類が無いことを確かめる
      expect(observation.unclassifiedStoragePaths, '分類できないストレージ取得が無い').toEqual([]);
    } finally {
      await context.close();
    }
  });
});
