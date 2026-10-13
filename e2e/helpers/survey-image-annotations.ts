/**
 * @fileoverview 現場調査写真へ注釈を保存する前提の生成（写真選択・変更ダイアログの候補を成立させる）
 *
 * ## 背景（Task 82.1）
 *
 * Task 75.1 が写真選択・変更ダイアログの取得経路を
 * `GET /api/projects/:projectId/survey-images` へ置き換えた。同経路は**注釈レコードが
 * 存在する写真のみ**を返す（選択対象を「注釈エディタで編集済みの写真」と定める
 * Requirement 4.3 / 19.2 の規定）。
 *
 * したがって「写真をアップロードしただけ」の前提はダイアログの選択候補が0件になり、
 * ダイアログを用いる数量表E2Eは前提段階で成立しない。注釈の保存までを前提に含める必要がある。
 *
 * ## 置き場所の決定（採らなかった選択肢とその理由）
 *
 * 注釈保存の入口 `PUT /api/site-surveys/images/:imageId/annotations` を叩く処理は、
 * 本モジュールを設ける直前まで次の3箇所に同じ形で書き起こされていた。
 *
 * - `e2e/specs/quantity-tables/photo-select-bulk-fetch-e2e.spec.ts`（Task 76.1）
 * - `e2e/specs/site-surveys/site-survey-image-request-scaling.spec.ts`
 * - `e2e/specs/site-surveys/site-survey-batch-annotations.spec.ts`
 *
 * 1. **各 spec へ複製する**（Task 82.1 の対象7本へ書き足す）→ 採らない。道具の出所が
 *    8箇所になり、入口の仕様変更（例: 本文スキーマの変更）のたびに8箇所を追う形になる。
 *    75.1 の変更が7本を同時に倒したのは、前提の生成が共有されていない箇所で同時に
 *    陳腐化したからであり、複製は同じ壊れ方を再生産する。
 * 2. **`quantity-table-preconditions.ts` へ直接書く** → 採らない。注釈は現場調査側の資源で
 *    あり、数量表に限らない（site-survey の spec も同じ入口を使う）。数量表専用の
 *    モジュールへ置くと、現場調査側から参照するときに依存の向きが逆になる。
 *    `quantity-table-preconditions.ts` は本モジュールを**利用する**側に留める。
 * 3. **既存 spec のどれかを正典として spec 間で import する** → 採らない。spec は
 *    `test.describe` と状態（モジュールスコープの変数）を持つため、import すると
 *    参照した側でテストが二重に登録される。共有する道具は `e2e/helpers/` に置く。
 * 4. **site-survey の spec 2本の複製も本モジュールへ寄せる** → 本タスクでは採らない。
 *    Task 82.1 の境界は「数量表E2Eのシード前提」であり、site-survey の spec は
 *    合成済みサムネイルの有無まで作り込む固有の前提（Prisma 直接更新）を伴う。
 *    現に落ちていない検証へ手を入れて再実行の対象を広げる利得が無いため、寄せるのは
 *    別タスクとする。本モジュールは現場調査写真一般に使える形（`surveyId` と画像の実寸のみに
 *    依存する）にしてあり、寄せる際に本モジュール側の変更は要らない。
 *
 * @module e2e/helpers/survey-image-annotations
 */

import { expect, type Page } from '@playwright/test';
import { assertPrepared } from './preconditions';
import { API_BASE_URL } from '../config';

/**
 * 注釈を保存する対象の画像（`GET /api/site-surveys/:surveyId` の応答のうち本補助が用いる項目）
 *
 * 注釈の保存は画像の実寸（`canvasWidth` / `canvasHeight`）を要するため、IDだけでは足りない。
 */
export interface AnnotatableSurveyImage {
  /** 画像ID */
  id: string;
  /** ファイル名（選択候補の `alt` と一致する。どの写真に注釈を付けたかの識別に用いる） */
  fileName: string;
  /** 画像の幅（px） */
  width: number;
  /** 画像の高さ（px） */
  height: number;
  /** 現場調査内の表示順 */
  displayOrder: number;
}

/**
 * 注釈を保存する対象の指定
 *
 * - `'all'`: 全件に注釈を付ける
 * - `'none'`: 注釈を付けない（注釈なし写真だけを作る前提で用いる）
 * - 数値配列: 表示順（`displayOrder` 昇順）での位置（0起点）
 */
export type AnnotationTargets = 'all' | 'none' | readonly number[];

/**
 * 保存する注釈レコードの中身（Task 84.1）
 *
 * 選択候補の抽出条件（`backend/src/services/image-list.service.ts` の
 * `annotation: { isNot: null }`）は**注釈レコードの存在のみ**を見る。一方で
 * 目印の表示（site-survey/REQ-20.2）と合成済みサムネイルの有無は
 * `hasDrawnAnnotations`（`data.objects` の件数から算出）を見る。
 * 画像編集画面は注釈0件（回転のみ・無描画）でも無条件に保存するため、
 * 「候補に現れるが描画は持たない写真」は実在する状態である。
 *
 * - `'drawn'`: 描画あり（矩形1件）。`hasDrawnAnnotations` が真になる
 * - `'undrawn'`: 描画なし（`objects` が0件）。レコードは残るので候補には現れるが、
 *   `hasDrawnAnnotations` は偽のままで注釈の目印も合成済みサムネイルも生じない
 */
export type AnnotationShape = 'drawn' | 'undrawn';

/**
 * 既定の中身が `'drawn'` である理由
 *
 * 本引数を必須にすると既存の呼び出し側（Task 82.1 が是正した7本）を一斉に書き換える
 * ことになり、現に緑である検証へ無関係な変更を波及させる。既定を従来と同一の
 * `'drawn'` に置くことで、既存の呼び出し側の振る舞いは1バイトも変わらない。
 */
const DEFAULT_ANNOTATION_SHAPE: AnnotationShape = 'drawn';

/** 描画あり（矩形1件）として保存する注釈オブジェクト */
const DRAWN_ANNOTATION_OBJECTS = [
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
] as const;

/**
 * アクセストークンを伴うリクエストヘッダを作る。
 *
 * @param page Playwright のページ（ログイン済みであること）
 * @returns Authorization ヘッダ
 * @throws アクセストークンが取得できない場合
 */
async function authHeaders(page: Page): Promise<Record<string, string>> {
  const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
  assertPrepared(accessToken, 'アクセストークン');
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * 現場調査の画像を表示順（`displayOrder` 昇順）で取得する。
 *
 * 並び順を固定するのは、注釈を付ける対象を位置で指定する際に、取得順の揺れで
 * 対象が入れ替わらないようにするためである。
 *
 * @param page Playwright のページ（ログイン済みであること）
 * @param surveyId 対象の現場調査ID
 * @returns 表示順に並べた画像
 * @throws 現場調査詳細が取得できない場合
 */
export async function fetchSurveyImagesInDisplayOrder(
  page: Page,
  surveyId: string
): Promise<AnnotatableSurveyImage[]> {
  const response = await page.request.get(`${API_BASE_URL}/api/site-surveys/${surveyId}`, {
    headers: await authHeaders(page),
  });
  expect(
    response.ok(),
    `前提: 現場調査詳細が取得できる (status=${response.status()})`
  ).toBeTruthy();

  const detail = (await response.json()) as { images?: AnnotatableSurveyImage[] };
  const images = [...(detail.images ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
  return images;
}

/**
 * 画像へ注釈を保存する。
 *
 * 注釈レコードの存在が `GET /api/projects/:projectId/survey-images` の抽出条件であるため、
 * 選択候補として現れるかどうかは描画内容に依らない。描画の有無まで関心に持つ呼び出し側
 * （注釈の目印・合成済みサムネイルを主題にする検証）は `shape` で作り分ける。
 *
 * 合成済みサムネイル（`annotatedThumbnailPath`）はクライアントの画像編集画面が合成して
 * 別の入口で保存するものであり、本経路では生成されない（Task 115.107）。
 * すなわち本補助は画像処理を伴わないDB書き込み1回であり、枚数に対して安価である。
 *
 * @param page Playwright のページ（ログイン済みであること）
 * @param image 注釈を保存する対象の画像
 * @param shape 保存する注釈レコードの中身（既定は描画あり）
 * @throws 保存が成功しない場合
 */
export async function saveSurveyImageAnnotation(
  page: Page,
  image: AnnotatableSurveyImage,
  shape: AnnotationShape = DEFAULT_ANNOTATION_SHAPE
): Promise<void> {
  expect(image.width, `前提: ${image.fileName} の幅が正の値である`).toBeGreaterThan(0);
  expect(image.height, `前提: ${image.fileName} の高さが正の値である`).toBeGreaterThan(0);

  const response = await page.request.put(
    `${API_BASE_URL}/api/site-surveys/images/${image.id}/annotations`,
    {
      headers: await authHeaders(page),
      data: {
        data: {
          version: '6.0.0',
          objects:
            shape === 'drawn' ? DRAWN_ANNOTATION_OBJECTS.map((object) => ({ ...object })) : [],
          canvasWidth: image.width,
          canvasHeight: image.height,
        },
      },
    }
  );
  expect(
    response.ok(),
    `前提: ${image.fileName} の注釈が保存できる (status=${response.status()})`
  ).toBeTruthy();
}

/**
 * 現場調査の画像のうち指定した対象へ注釈を保存し、注釈を付けた画像を返す。
 *
 * @param page Playwright のページ（ログイン済みであること）
 * @param surveyId 対象の現場調査ID
 * @param targets 注釈を付ける対象（`'all'` / `'none'` / 表示順の位置）
 * @param shape 保存する注釈レコードの中身（既定は描画あり）
 * @returns 注釈を付けた画像（表示順）
 * @throws 現場調査詳細が取得できない・指定位置に画像が無い・保存が成功しない場合
 */
export async function annotateSurveyImages(
  page: Page,
  surveyId: string,
  targets: AnnotationTargets,
  shape: AnnotationShape = DEFAULT_ANNOTATION_SHAPE
): Promise<AnnotatableSurveyImage[]> {
  if (targets === 'none') {
    return [];
  }

  const images = await fetchSurveyImagesInDisplayOrder(page, surveyId);
  expect(images.length, '前提: 注釈を付ける対象の写真が存在する').toBeGreaterThan(0);

  const selected =
    targets === 'all'
      ? images
      : targets.map((index) => {
          const image = images[index];
          assertPrepared(image, `表示順${index + 1}番目の写真`);
          return image;
        });

  for (const image of selected) {
    await saveSurveyImageAnnotation(page, image, shape);
  }

  return selected;
}
