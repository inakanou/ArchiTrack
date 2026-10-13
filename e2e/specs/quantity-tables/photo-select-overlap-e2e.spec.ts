/**
 * @fileoverview 写真選択・変更ダイアログ 写真一覧の重なり検証 E2Eテスト (REQ-39)
 *
 * Requirements coverage:
 * - @requirement quantity-table-generation/REQ-39.1: 写真選択ダイアログで各写真を重ならないレイアウトで一覧表示
 * - @requirement quantity-table-generation/REQ-39.2: 写真変更ダイアログでも各写真を重ならないレイアウトで一覧表示
 * - @requirement quantity-table-generation/REQ-39.3: 各写真を一定間隔で配置し隣接写真と表示領域が重複しない
 * - @requirement quantity-table-generation/REQ-39.4: 写真枚数にかかわらずサムネイル全体を視認可能に表示
 * - @requirement quantity-table-generation/REQ-39.5: 収まらない場合は折り返し＋スクロールバーで閲覧可能
 * - @requirement quantity-table-generation/REQ-39.6: 写真枚数の多寡にかかわらず重なりによる視認性低下を発生させない
 *
 * 設計方針（design.md REQ-39 / 1801行・2167行）:
 *   写真同士の「重なりゼロ」は実レイアウトを要し jsdom では検証不可のため、
 *   getBoundingClientRect による矩形重複判定は本 E2E（Playwright）で実施する。
 *   多数枚（30枚以上）を API シードで用意し、通常幅・写真変更後・狭幅ビューポートの
 *   いずれでも隣接サムネイルが重ならないことを自動検証して回帰防止する。
 *
 * @module e2e/specs/quantity-tables/photo-select-overlap-e2e.spec
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { assertPresent, assertPrepared } from '../../helpers/preconditions';
import { annotateSurveyImages } from '../../helpers/survey-image-annotations';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 30枚以上を要件とするため十分な枚数をシードする（折り返し＋スクロールを確実に発生させる）
const SEED_PHOTO_COUNT = 32;

let testProjectId: string | null = null;
let createdSurveyId: string | null = null;
let createdQuantityTableId: string | null = null;
let seededPhotoCount = 0;

/**
 * 2つの矩形が重なっているか判定する。
 * 接して（辺が一致して）いるだけの場合は重なりとみなさない（許容誤差で吸収）。
 */
function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  tolerance = 0.5
): boolean {
  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;
  const bRight = b.x + b.width;
  const bBottom = b.y + b.height;

  const overlapX = Math.min(aRight, bRight) - Math.max(a.x, b.x);
  const overlapY = Math.min(aBottom, bBottom) - Math.max(a.y, b.y);

  // 両軸で許容誤差を超える正の重なりがある場合のみ「重なり」と判定する
  return overlapX > tolerance && overlapY > tolerance;
}

/**
 * 写真一覧（photo-list）内の全サムネイルの矩形を取得し、
 * いずれのペアも重なっていないことをアサートする。
 */
async function expectNoThumbnailOverlap(photoList: Locator, context: string): Promise<void> {
  const items = photoList.locator('[data-testid^="photo-item-"]');
  const count = await items.count();

  // 重なり検証には複数枚が必要（30枚以上シードしているので満たすはず）
  expect(count, `${context}: 写真サムネイルが複数枚表示される必要がある`).toBeGreaterThan(1);

  const rects: { x: number; y: number; width: number; height: number }[] = [];
  for (let i = 0; i < count; i++) {
    const box = await items.nth(i).boundingBox();
    assertPresent(box, `${context}: 写真サムネイル[${i}]の矩形`);
    // サムネイルが潰れていない（幅・高さがゼロでない）こと（REQ-39.4 視認可能）
    expect(box.width, `${context}: サムネイル[${i}]の幅がゼロより大きい`).toBeGreaterThan(0);
    expect(box.height, `${context}: サムネイル[${i}]の高さがゼロより大きい`).toBeGreaterThan(0);
    rects.push(box);
  }

  // 全ペアの矩形重複を検証（REQ-39.1/39.2/39.3/39.6: 重なりゼロ）
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const overlap = rectsOverlap(rects[i]!, rects[j]!);
      expect(
        overlap,
        `${context}: 写真サムネイル[${i}]と[${j}]が重なってはならない ` +
          `(rect[${i}]=${JSON.stringify(rects[i])}, rect[${j}]=${JSON.stringify(rects[j])})`
      ).toBe(false);
    }
  }
}
/**
 * 写真一覧の表示領域の寸法と、並んだサムネイルの行構成を実測する。
 *
 * 要素ハンドルを受け取って画面の実レイアウトだけを読み出す（本番の判定を書き写さない）。
 */
async function measurePhotoListLayout(photoList: Locator): Promise<{
  itemCount: number;
  rowCount: number;
  clientHeight: number;
  scrollHeight: number;
  clientWidth: number;
  scrollWidth: number;
  containerRight: number;
  maxItemRight: number;
}> {
  return photoList.evaluate((el: HTMLElement) => {
    const items = Array.from(el.querySelectorAll('[data-testid^="photo-item-"]')) as HTMLElement[];
    const containerRect = el.getBoundingClientRect();
    const itemRects = items.map((item) => item.getBoundingClientRect());
    // 行は「上端の座標が同じサムネイルの集まり」で数える。折り返していれば2行以上になる。
    const rowTops = new Set(itemRects.map((rect) => Math.round(rect.top)));
    return {
      itemCount: items.length,
      rowCount: rowTops.size,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      containerRight: containerRect.right,
      maxItemRight: itemRects.reduce((max, rect) => Math.max(max, rect.right), containerRect.left),
    };
  });
}

/**
 * 写真一覧の末尾のサムネイルが、表示領域（写真一覧の可視矩形）の中に全体が入っているか。
 */
async function isLastThumbnailFullyInView(photoList: Locator): Promise<boolean> {
  return photoList.evaluate((el: HTMLElement) => {
    const items = Array.from(el.querySelectorAll('[data-testid^="photo-item-"]')) as HTMLElement[];
    const last = items[items.length - 1];
    if (last === undefined) {
      // 母集団が空のときに「見えている」と答えると、呼び出し側の主張が空集合への
      // 恒真へ退化する。見えていないと答え、呼び出し側の件数の主張に判定を委ねる。
      return false;
    }
    const containerRect = el.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();
    return lastRect.top >= containerRect.top - 0.5 && lastRect.bottom <= containerRect.bottom + 0.5;
  });
}

/**
 * REQ-39.5 の条文を、前件ごと固定する。
 *
 * 条文（requirements.md Requirement 39 受入基準 5 の逐語）:
 *   「写真の枚数が増加して写真一覧が表示領域に収まらない場合、写真同士を重ねずに
 *     折り返して配置し、収まらない分はスクロールバーを表示して閲覧可能にする」
 *
 * 39.5 固有の主張は次の4つである（「重ならない」は 39.3 / 39.4 / 39.6 の所管であり、
 * 呼び出し側が `expectNoThumbnailOverlap` で別途主張する）。
 *
 *   (1) 母集団: シードした全枚数が一覧に並んでいること。
 *   (2) 折り返して配置: サムネイルが2行以上に分かれ、かつ横方向へはみ出していないこと。
 *       1行に押し込む実装（`nowrap`）では行は1つになり横へあふれる。
 *   (3) 前件の成立: 一覧が表示領域に収まっていないこと（`scrollHeight > clientHeight`）。
 *       収まってしまう枚数・寸法で測ると、(4) の主張は空集合に対する恒真へ退化する。
 *       前提が崩れたら沈黙せず失敗させる。
 *   (4) スクロールバーを表示して閲覧可能: 初期表示で表示領域の外にある末尾のサムネイルが、
 *       **ホイール操作**の後に表示領域の中へ全体が入ること。
 *       `scrollTop` への代入で測ってはならない——`overflow-y: hidden` でも代入は効くため、
 *       「スクロールバーを表示して」を区別できない。利用者が行える操作で手繰ること。
 *
 * 実測（Task 100.1、2026-09-16、test 環境の chromium）: 通常幅は 4列×8行・
 * `scrollHeight` 1292 / `clientHeight` 473、狭幅 375px は 1列×32行・`scrollHeight` 5180 /
 * `clientHeight` 473。いずれも `offsetWidth === clientWidth` であり、この chromium の
 * スクロールバーは重ね描き（overlay）で幅を占めない。**スクロールバーの実体を
 * 「`offsetWidth - clientWidth > 0`」で測ってはならない**——基線でも成立しない。
 */
async function expectWrappedAndScrollable(
  page: Page,
  photoList: Locator,
  context: string
): Promise<void> {
  const layout = await measurePhotoListLayout(photoList);

  // (1) 母集団: シードした全枚数が一覧に並んでいること。
  //     ここが崩れると以降の主張はすべて意味を失うので、最初に無条件で主張する。
  expect(
    layout.itemCount,
    `${context}: シードした全枚数（${SEED_PHOTO_COUNT}枚）が一覧に並ぶ必要がある`
  ).toBeGreaterThanOrEqual(SEED_PHOTO_COUNT);

  // (2) 折り返して配置: 2行以上へ折り返し、横方向へはみ出さない。
  //     主張の順序は「壊れた条文がそのまま失敗の文言に出る」ように並べている。
  //     1行へ押し込む実装はここで落ち、収まってしまう実装は (3) で落ちる。
  expect(
    layout.rowCount,
    `${context}: 収まらない分は折り返して2行以上に配置される必要がある (行数=${layout.rowCount})`
  ).toBeGreaterThan(1);
  expect(
    layout.scrollWidth,
    `${context}: 折り返しにより横方向へあふれない必要がある ` +
      `(scrollWidth=${layout.scrollWidth}, clientWidth=${layout.clientWidth})`
  ).toBeLessThanOrEqual(layout.clientWidth);
  expect(
    layout.maxItemRight,
    `${context}: サムネイルが表示領域の右端を越えない必要がある ` +
      `(maxItemRight=${layout.maxItemRight}, containerRight=${layout.containerRight})`
  ).toBeLessThanOrEqual(layout.containerRight + 0.5);

  // (3) 前件: 一覧が表示領域に収まらない状態が実際に起きていること。
  //     収まってしまうなら条文の前件が成立せず、(4) の主張は空集合への恒真へ退化する。
  expect(
    layout.scrollHeight,
    `${context}: 一覧が表示領域に収まらない状態である必要がある ` +
      `(scrollHeight=${layout.scrollHeight}, clientHeight=${layout.clientHeight}, ` +
      `items=${layout.itemCount})`
  ).toBeGreaterThan(layout.clientHeight);

  // (4) 収まらない分がスクロールで閲覧可能になること
  const lastVisibleBeforeScroll = await isLastThumbnailFullyInView(photoList);
  expect(
    lastVisibleBeforeScroll,
    `${context}: 収まらない分（末尾のサムネイル）は初期表示では表示領域の外にある必要がある`
  ).toBe(false);

  await photoList.hover();
  // 観測で打ち切らず固定回数を送る。必要量は実測で最大 4707px（狭幅・32枚）であり、
  // 400px × 40 回 = 16000px はこれを十分に上回る。上限に達した後の余剰は無視される。
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 400);
  }

  await expect
    .poll(async () => isLastThumbnailFullyInView(photoList), {
      timeout: getTimeout(5000),
      message: `${context}: 収まらない分（末尾のサムネイル）がスクロール操作で表示領域の中へ入る必要がある`,
    })
    .toBe(true);
}

/**
 * 写真ダイアログを開く導線。REQ-39.1（写真選択）と REQ-39.2（写真変更）で入口が異なる。
 *
 * `QuantityGroupCard` は `group.surveyImage` の有無で排他的に描き分ける
 * （写真なし: `image-placeholder-*` / 写真あり: 「写真を変更」ボタン）。
 * どちらが出ているかを観測して分岐すると、期待した入口が消えた場合に
 * もう一方の入口へ黙って流れ、REQ-39.1 と REQ-39.2 の区別が失われる。
 * 呼び出し側がどちらの入口を検証しているかを渡し、その入口の存在を無条件に主張する。
 */
const PHOTO_DIALOG_ENTRIES = {
  /** 写真未紐付けの数量グループから開く（REQ-39.1 写真選択ダイアログ） */
  select: {
    label: 'REQ-39.1: 写真未紐付けの数量グループに写真選択のプレースホルダーが表示される',
    locate: (page: Page): Locator => page.locator('[data-testid^="image-placeholder-"]').first(),
  },
  /** 写真紐付け済みの数量グループから開く（REQ-39.2 写真変更ダイアログ） */
  change: {
    label: 'REQ-39.2: 写真紐付け済みの数量グループに「写真を変更」ボタンが表示される',
    locate: (page: Page): Locator => page.getByRole('button', { name: '写真を変更' }).first(),
  },
} as const;

/**
 * 指定した入口から写真ダイアログを開き、photo-list を返す。
 *
 * @param page Playwright のページ（数量表の編集画面に居ること）
 * @param entry どちらの入口から開くか（`'select'` = 写真未紐付け / `'change'` = 紐付け済み）
 * @throws 指定した入口が表示されない・ダイアログが開かない・写真が揃わない場合
 */
async function openPhotoDialog(
  page: Page,
  entry: keyof typeof PHOTO_DIALOG_ENTRIES
): Promise<Locator> {
  const { label, locate } = PHOTO_DIALOG_ENTRIES[entry];
  const trigger = locate(page);
  await expect(trigger, label).toBeVisible({ timeout: getTimeout(8000) });
  await trigger.click();

  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible({ timeout: getTimeout(5000) });

  const photoList = dialog.locator('[data-testid="photo-list"]');
  // シードした写真が全件読み込まれるまで待つ
  await expect(photoList).toBeVisible({ timeout: getTimeout(15000) });
  await expect
    .poll(async () => photoList.locator('[data-testid^="photo-item-"]').count(), {
      timeout: getTimeout(15000),
    })
    .toBeGreaterThanOrEqual(SEED_PHOTO_COUNT);

  return photoList;
}

test.describe('REQ-39: 写真選択・変更ダイアログの写真一覧が重ならない', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  test.describe('事前準備', () => {
    test('プロジェクト・現場調査・多数枚の写真・数量表グループを作成する', async ({ page }) => {
      // --- プロジェクト作成 ---
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `REQ39_PJ_${Date.now()}`;
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
      testProjectId = page.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1] ?? null;
      expect(testProjectId).toBeTruthy();

      // --- 現場調査作成 ---
      await page.goto(`/projects/${testProjectId}/site-surveys/new`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });
      await page.getByLabel(/調査名/i).fill(`REQ39_現場調査_${Date.now()}`);
      const dateInput = page.getByLabel(/調査日/i);
      if (await isVisibleWithin(dateInput, getTimeout(2000))) {
        await dateInput.fill(new Date().toISOString().split('T')[0]!);
      }

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

      // --- 多数枚の写真を API で直接アップロード（重なり検証には30枚以上が必要）---
      // 画像アップロードは upload.array('images', 10) で1リクエスト最大10枚のため複数回に分割する。
      const testImagePath = path.join(__dirname, '../../fixtures/test-image.png');
      expect(fs.existsSync(testImagePath)).toBeTruthy();
      const imageBuffer = fs.readFileSync(testImagePath);
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      expect(accessToken, 'アクセストークンが取得できる必要がある').toBeTruthy();

      const BATCH = 8; // 10枚上限に対する安全側のバッチサイズ
      let uploaded = 0;
      while (uploaded < SEED_PHOTO_COUNT) {
        const n = Math.min(BATCH, SEED_PHOTO_COUNT - uploaded);
        // Playwright の multipart は同名キー重複を表現できないため、
        // FormData で 'images' フィールドを n 件付与する。
        const form = new FormData();
        for (let i = 0; i < n; i++) {
          const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
          form.append('images', blob, `req39-${uploaded + i + 1}.png`);
        }
        const uploadResponse = await page.request.post(
          `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            multipart: form,
          }
        );
        expect(
          uploadResponse.ok(),
          `写真アップロードが成功する必要がある (status=${uploadResponse.status()})`
        ).toBeTruthy();
        uploaded += n;
      }

      // 実際にシードされた枚数を確認（現場調査詳細の画像件数）
      const detailResponse = await page.request.get(
        `${API_BASE_URL}/api/site-surveys/${createdSurveyId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      expect(detailResponse.ok()).toBeTruthy();
      const detail = await detailResponse.json();
      seededPhotoCount = Array.isArray(detail.images) ? detail.images.length : 0;
      expect(
        seededPhotoCount,
        '重なり検証のため30枚以上の写真がシードされている必要がある'
      ).toBeGreaterThanOrEqual(30);

      // --- シードした全枚数へ注釈を保存する（Task 82.1）---
      // 写真選択・変更ダイアログの一覧（`GET /api/projects/:projectId/survey-images`）は
      // 注釈レコードを持つ写真のみを返す（Requirement 4.3 / 19.2）。注釈を保存しないと
      // 選択候補が0件になり、重なり判定は「複数枚が表示される」の前提段階で失敗する。
      //
      // 枚数を絞らず全件へ注釈を付けるのは、本 spec の検証対象（REQ-39: 写真枚数の多寡に
      // かかわらず重なりゼロ／折り返しとスクロール）が**一覧に並ぶ枚数**そのものを要件と
      // するためである。一覧に並ぶのは注釈付きのみなので、注釈を付けた枚数＝判定に供される
      // 枚数であり、ここを30枚未満に絞ると REQ-39.4 / 39.5 / 39.6 の「多数枚」が成立しない。
      // 注釈の保存は画像処理を伴わないDB書き込み1回であり（合成済みサムネイルは別経路。
      // `survey-image-annotations.ts` 参照）、枚数に対する所要時間は軽い。
      assertPrepared(createdSurveyId, '作成した現場調査のID');
      const annotatedImages = await annotateSurveyImages(page, createdSurveyId, 'all');
      expect(
        annotatedImages.length,
        '重なり検証のため30枚以上の写真が選択候補（注釈付き）になっている必要がある'
      ).toBeGreaterThanOrEqual(30);

      // --- 数量表作成 ---
      await page.goto(`/projects/${testProjectId}/quantity-tables`);
      await page.waitForLoadState('networkidle');
      const createLink = page.getByRole('link', { name: /新規作成/i }).first();
      await expect(createLink).toBeVisible({ timeout: getTimeout(10000) });
      await createLink.click();

      const nameInput = page.getByRole('textbox', { name: /数量表名|名称/i }).first();
      await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
      await nameInput.fill(`REQ39_数量表_${Date.now()}`);
      await page.getByRole('button', { name: /^作成$/i }).click();

      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
        timeout: getTimeout(15000),
      });
      createdQuantityTableId =
        page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/)?.[1] ?? null;
      expect(createdQuantityTableId).toBeTruthy();

      // --- グループを1件追加（写真選択ダイアログを開く起点）---
      // REQ-42 移行: グループ追加はクライアントドラフトのみを更新するため、
      // 永続化 API（POST /groups）は発火しない。後続テストは編集画面へ再ナビゲートして
      // グループの存在を前提とするため、追加後に明示保存して永続化する。
      const addGroupButton = page
        .getByRole('button', { name: /グループ追加|グループを追加/i })
        .first();
      await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });
      await addGroupButton.click();

      await expect(page.locator('[data-testid="quantity-group-card"]').first()).toBeVisible({
        timeout: getTimeout(10000),
      });

      // REQ-42.5: 後続テストが再ナビゲートで参照できるよう明示保存して永続化する。
      await saveQuantityTableDraft(page);
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-39.1
   * @requirement quantity-table-generation/REQ-39.3
   * @requirement quantity-table-generation/REQ-39.4
   * @requirement quantity-table-generation/REQ-39.5
   * @requirement quantity-table-generation/REQ-39.6
   *
   * 写真選択ダイアログを開いた際、隣接サムネイルの矩形が重複しないこと（39.1 / 39.3 / 39.4 / 39.6）。
   * 加えて、一覧が表示領域に収まらない状態で折り返して配置され、収まらない分がスクロールで
   * 閲覧可能になること（39.5）。39.5 の主張は `expectWrappedAndScrollable` が持つ。
   */
  test('写真選択ダイアログで多数枚のサムネイルが重ならず折り返しとスクロールで全件を閲覧できる (REQ-39.1, 39.3, 39.4, 39.5, 39.6)', async ({
    page,
  }) => {
    expect(createdQuantityTableId, '事前準備が完了している必要がある').toBeTruthy();
    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    const photoList = await openPhotoDialog(page, 'select');
    await expectNoThumbnailOverlap(photoList, '写真選択ダイアログ（通常幅）');
    await expectWrappedAndScrollable(page, photoList, '写真選択ダイアログ（通常幅）');
  });

  /**
   * @requirement quantity-table-generation/REQ-39.2
   * @requirement quantity-table-generation/REQ-39.6
   *
   * 写真を選択して紐づけたのち、写真変更（再度ダイアログを開く）経路でも
   * 重なりのない一覧が表示されること。
   */
  test('写真選択→写真変更の経路でもサムネイルが重ならない (REQ-39.2, 39.6)', async ({ page }) => {
    expect(createdQuantityTableId).toBeTruthy();
    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    // 1回目: 写真選択ダイアログを開いて1枚選択（紐づけ）
    const firstPhotoList = await openPhotoDialog(page, 'select');
    const firstItem = firstPhotoList.locator('[data-testid^="photo-item-"]').first();
    await expect(firstItem).toBeVisible({ timeout: getTimeout(8000) });
    await firstItem.click();
    // ダイアログが閉じて紐づけが確定する
    await expect(page.getByRole('dialog').first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    // 2回目: 写真変更ダイアログ（別の写真を選択する経路）を開いて重なりを再検証
    const changedPhotoList = await openPhotoDialog(page, 'change');
    await expectNoThumbnailOverlap(changedPhotoList, '写真変更ダイアログ');
  });

  /**
   * @requirement quantity-table-generation/REQ-39.4
   * @requirement quantity-table-generation/REQ-39.5
   * @requirement quantity-table-generation/REQ-39.6
   *
   * 狭幅ビューポートでも写真が潰れず（幅・高さがゼロにならず）重ならないこと（39.4 / 39.6）。
   * 狭幅では列数が1へ落ちて折り返しが最大になり、収まらない分も最大になるため、
   * 39.5 の「折り返して配置し、収まらない分はスクロールバーを表示して閲覧可能にする」を
   * 通常幅とは別の列構成でもう一度固定する。
   */
  test('狭幅ビューポートでもサムネイルが潰れず重ならず折り返しとスクロールで全件を閲覧できる (REQ-39.4, 39.5, 39.6)', async ({
    page,
  }) => {
    expect(createdQuantityTableId).toBeTruthy();
    // 狭幅（モバイル相当）に設定して折り返しを強制する
    await page.setViewportSize({ width: 375, height: 720 });

    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');

    const photoList = await openPhotoDialog(page, 'select');
    await expectNoThumbnailOverlap(photoList, '写真選択ダイアログ（狭幅 375px）');
    await expectWrappedAndScrollable(page, photoList, '写真選択ダイアログ（狭幅 375px）');
  });
});
