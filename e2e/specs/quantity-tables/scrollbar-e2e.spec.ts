/**
 * @fileoverview 画面スクロールバー表示 E2Eテスト (REQ-25)
 *
 * Requirements coverage:
 * - @requirement quantity-table-generation/REQ-25.1: 横幅超過時の水平スクロールバー
 * - @requirement quantity-table-generation/REQ-25.2: ページの内容が縦幅を超える場合はページ側が垂直スクロールバーを担い、表示領域の内側には設けない
 * - @requirement quantity-table-generation/REQ-25.3: ページの内容が縦幅に収まる場合はページ側の垂直スクロールバーが非表示（表示領域の内側には常に設けない）
 * - @requirement quantity-table-generation/REQ-25.4: ウィンドウリサイズ時の動的更新
 * - @requirement quantity-table-generation/REQ-25.5: 横スクロール操作可能
 * - @requirement quantity-table-generation/REQ-25.6: 縦スクロール操作可能
 *
 * REQ-25.3 は垂直方向のみを主張する。水平方向を主張しないのは、承認済みの仕様が
 * 数量項目の表の常時溢れを受け入れており、**前件が成立しないため主張対象が存在しない**
 * からである（未検証の放置ではない）。根拠は次の三点。
 * - REQ-37 配置概要（`.kiro/specs/quantity-table-generation/requirements.md:586`）:
 *   「表全体は画面右側にはみ出すことを許容し、ユーザーは表領域の水平スクロールバー
 *   （Requirement 25）で右へスクロールして閲覧する」
 * - REQ-37 AC6（同 `:594`）: 計算用フィールド群がはみ出す場合に表領域の水平スクロールバーを
 *   「Requirement 25 と整合」して表示する
 * - `.kiro/specs/quantity-table-generation/design.md:2212`: 数量項目テーブルはグリッド列幅
 *   合計が「常にビューポートを超える」ため水平スクロールが発生する
 * 実測もこれと整合する。数量グループ1件・数量項目1行の編集画面を幅 2560 / 1920 / 1440 /
 * 1280px で開くと、表示領域（`item-table-scroll-*`）はいずれも `scrollWidth` 1194px /
 * `clientWidth` 1182px（超過 12px）であり、表が収まりきる幅は存在しない。
 *
 * @module e2e/specs/quantity-tables/scrollbar-e2e.spec
 */

import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { openEditPageWithSingleItemRow } from '../../helpers/quantity-table-preconditions';

/**
 * REQ-25.1 の比較で用いるビューポート幅。
 *
 * 広い側（1280px）は数量表編集画面の内容幅の上限と同じで、表示領域の可視幅が
 * 内容幅にもっとも近づく。狭い側（600px）は列幅の合計（1168px）を大きく下回り、
 * REQ-25.1 の前件が決定的に成立する。
 */
const WIDE_VIEWPORT_WIDTH = 1280;
const NARROW_VIEWPORT_WIDTH = 600;

/**
 * REQ-25.2 の「表示領域は収まっているのにページ側が縦を担う」点で用いるビューポート高さ。
 *
 * 幅 1280px・数量グループ1件・数量項目1行の資材では、表示領域（`item-table-scroll-*`）の
 * 矩形は `scrollY === 0` の時点で top 460px / bottom 513px にあり、文書の高さは 642px である。
 * したがって高さ 600px では**表示領域はビューポート内に完全に収まりながら、文書は 42px
 * あふれてページ側が垂直スクロールバーを担う**。この食い違いは高さ 550px 〜 642px の区間に
 * だけ現れ、既存の 400px（表示領域が折り返しより下）や 900px（文書も表示領域も収まる）では
 * 二つの量が同じ向きに動くため現れない（タスク 100.4 が8点で実測、タスク 100.7）。
 */
const AREA_FITS_WHILE_PAGE_OVERFLOWS_HEIGHT = 600;

/**
 * ページ側の垂直スクロールバーの表示を実測するときに当てる、マウスホイールの下方向の量。
 *
 * 高さ 600px でのページの内容の超過量は 42px であり、200 はこれを十分に上回る。実測では
 * 変異の無い状態で `window.scrollY` が 42（＝超過量の全量）まで動き、
 * `body { overflow-y: hidden }` の変異下では 0 のまま動かない（タスク 100.11）。
 */
const WHEEL_DOWN_DELTA = 200;

/**
 * ページ側の垂直スクロールバーの「表示」を、**実際のスクロール可能性**で測る（タスク 100.11）。
 *
 * ページの先頭へ戻し、数量項目の表示領域の上へマウスを運び、**下方向**のマウスホイールを
 * 当てたあとの `window.scrollY` を返す。0 を上回れば「ページは現に縦へスクロールできる」
 * ＝ページ側の垂直スクロールバーが表示されている。0 のままなら縦へ送る手段が無い。
 *
 * **文書の超過量（`document.documentElement.scrollHeight - clientHeight`）ではこれを測れない。**
 * `body { overflow-y: hidden }` を当てると overflow がビューポートへ伝播してページは一切
 * スクロールできなくなる（下方向のホイール 200 の後も `scrollY` は 0）のに、超過量は 42px の
 * まま動かない。超過量は「文書が溢れていること」の proxy であって「スクロールバーが表示されて
 * いること」ではない。タスク 100.7 の独立レビューがこの食い違いを実測し、当時の判定
 * （超過量だけを見る形）は変異の下で3つとも合格していた。本補助はその素通りを塞ぐ。
 *
 * ホイールの効果だけを見るため、マウスを運んだ時点で `window.scrollY` が 0 であることを
 * 前提として主張する。表示領域がビューポート内に収まる高さ（550px 以上）では `hover()` の
 * scrollIntoView が起きないため、この前提は決定的に成立する（高さ 600px / 900px でいずれも
 * 実測 0）。**高さ 400px ではこの前提が成立しない**——表示領域は `scrollY === 0` の時点で
 * 折り返しより下（top 460px / bottom 513px）に在り、`hover()` 自身がページを下端まで送るため、
 * 下方向の増加はホイールが一切効かなくても成立してしまう。400px の判定が上方向のホイールを
 * 使い、本補助を用いないのはそのためである。
 *
 * 待ちは増減のどちら側でも同じ形である。増加を待つ `waitForFunction` が解決すれば増加、
 * 期限切れになれば据え置きで、据え置き側も期限いっぱい待ってから読む。**「増えない」の観測が
 * 待ち不足によるものでないことは、同じ待ちで増加が観測される対照が同一テスト内で成立すること
 * によって示される**（REQ-25.3 の判定を見よ）。待ちの長さそのものは判定に用いないため、
 * 壁時計の遅れ（WSL2）が結論を動かすことはない。
 */
async function scrollYAfterWheelDown(page: Page, itemTableScroll: Locator): Promise<number> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await itemTableScroll.hover();

  expect(
    await page.evaluate(() => window.scrollY),
    '前提: 表示領域がビューポート内に在り hover() がページを送らない（scrollY の増減がホイールに帰属すること）'
  ).toBe(0);

  await page.mouse.wheel(0, WHEEL_DOWN_DELTA);

  // 待ちの失敗は結論に用いない（期限切れ以外の例外もここで握る）。判定に使うのは直後に
  // 読み直す `window.scrollY` そのものであり、読み直しが失敗すれば呼び出し側で例外になる。
  await page
    .waitForFunction(() => window.scrollY > 0, undefined, { timeout: getTimeout(3000) })
    .catch(() => undefined);

  return page.evaluate(() => window.scrollY);
}

let testProjectId: string | null = null;
let createdQuantityTableId: string | null = null;

test.describe('REQ-25: 画面スクロールバー表示', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * 事前準備: テスト用プロジェクト・数量表を作成
   *
   * REQ-25 のスクロールバー検証はビューポートと数量表編集画面の表示領域の
   * 関係を検証するため、独立して実行できるようにプロジェクト・数量表 1件を作成する。
   *
   * ここで用意するのは空の数量表までである。REQ-25 の主語は「数量項目の表示領域」で
   * あり、数量グループも数量項目も無い画面には表示領域そのものが存在しない。
   * 表示領域を要する各検証は `openEditPageWithSingleItemRow` で数量グループ1件・
   * 数量項目1行をその場で作り、前提が用意できなければ補助の内側で失敗する。
   */
  test.describe('事前準備', () => {
    test('テスト用プロジェクトを作成する', async ({ page }) => {
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `REQ25_PJ_${Date.now()}`;
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
      const projectMatch = page.url().match(/\/projects\/([0-9a-f-]+)$/);
      testProjectId = projectMatch?.[1] ?? null;
      expect(testProjectId).toBeTruthy();
    });

    test('テスト用数量表を作成する', async ({ page }) => {
      if (!testProjectId) {
        throw new Error(
          'testProjectIdが未設定です。プロジェクト作成テストが正しく実行されていません。'
        );
      }

      await page.goto(`/projects/${testProjectId}/quantity-tables`);
      await page.waitForLoadState('networkidle');

      const createButton = page.getByRole('link', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      const nameInput = page.getByRole('textbox', { name: /数量表名/i });
      await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
      await nameInput.clear();
      await nameInput.fill(`REQ25_数量表_${Date.now()}`);

      const createConfirmButton = page.getByRole('button', { name: /^作成$/i });
      await createConfirmButton.click();

      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
        timeout: getTimeout(15000),
      });
      const tableMatch = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/);
      createdQuantityTableId = tableMatch?.[1] ?? null;
      expect(createdQuantityTableId).toBeTruthy();
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-25.1: 横幅超過時の水平スクロールバー
   *
   * 従来の判定は空の数量表を開き、文書の `scrollWidth >= clientWidth` を主張していた。
   * `scrollWidth` は定義上 `clientWidth` を下回らないため、この不等式はどのような画面でも
   * 成立する**恒真**であり（コメント自身が「仮にデータが少なくても成立」と書いていた）、
   * REQ-25.1 を一度も検証していなかった。
   *
   * 水平スクロールは REQ-41 で数量項目の表示領域（`itemTableWrapper` =
   * `item-table-scroll-*`、`overflowX: auto`）に限定されており、判定先はこの要素である。
   *
   * ただし判定先を改めるだけでは足りない。**「超過量が 0 を上回る」ことは REQ-25.1 の前件
   * （表示領域がビューポートの横幅を超える場合）に依存しない。** 実測では幅 2560 / 1920 /
   * 1440 / 1280px のいずれでも表示領域は `scrollWidth` 1194px / `clientWidth` 1182px であり、
   * 12px の超過が常に残る。溢れているかどうかだけを見ても、ビューポートを狭めた効果は
   * 何も示せない。
   *
   * そこで広いビューポート（1280px）と狭いビューポート（600px）の両方で超過量を実測し、
   * 狭めた側が有意に大きいことを主張する。表示領域の可視幅はビューポート幅に追従するため、
   * 680px 狭めれば隠れる量もほぼ同じだけ増える（実測 12px → 660px、増分 648px）。
   * 内側余白がビューポート幅に応じて変わる分を吸収するため、下限は縮小幅の半分に置く。
   *
   * `scrollLeft` を動かせることで「水平スクロールバーが表示されている」を捉える案は採らな
   * かった。12px の超過が常に残る以上、広いビューポートでも `scrollLeft` は動いてしまい、
   * やはり前件に依存しないためである（横スクロール操作そのものは REQ-25.5 が主張する）。
   */
  test('ビューポートを狭めると表示領域の横方向の超過量が増える (REQ-25.1)', async ({ page }) => {
    await openEditPageWithSingleItemRow(page, createdQuantityTableId);

    const itemTableScroll = page.locator('[data-testid^="item-table-scroll-"]').first();
    await expect(itemTableScroll, '前提: 数量項目の表示領域が表示される').toBeVisible({
      timeout: getTimeout(15000),
    });

    const visibleWidth = () => itemTableScroll.evaluate((el) => el.clientWidth);
    const contentWidth = () => itemTableScroll.evaluate((el) => el.scrollWidth);
    const horizontalOverflow = () =>
      itemTableScroll.evaluate((el) => el.scrollWidth - el.clientWidth);

    // 広い側。ここでは要件を主張せず、比較の基準となる超過量を読むだけである。
    await page.setViewportSize({ width: WIDE_VIEWPORT_WIDTH, height: 800 });
    await expect
      .poll(visibleWidth, {
        message: '前提: 広いビューポートの寸法が表示領域の可視幅へ反映される',
        timeout: getTimeout(10000),
      })
      .toBeGreaterThan(NARROW_VIEWPORT_WIDTH);
    const overflowAtWide = await horizontalOverflow();

    // 狭い側。REQ-25.1 の前件が成立する状態である。
    await page.setViewportSize({ width: NARROW_VIEWPORT_WIDTH, height: 800 });
    await expect
      .poll(visibleWidth, {
        message: '前提: 狭いビューポートの寸法が表示領域の可視幅へ反映される',
        timeout: getTimeout(10000),
      })
      .toBeLessThanOrEqual(NARROW_VIEWPORT_WIDTH);

    // 前件: 表示領域の内容幅がビューポートの横幅を超える。内容幅は列幅の合計で決まり
    // ビューポート幅に依らない（実測 1194px）ため、この主張は狭い側でのみ成立する。
    expect(
      await contentWidth(),
      'REQ-25.1 の前件: 表示領域の内容幅がビューポートの横幅を超える'
    ).toBeGreaterThan(NARROW_VIEWPORT_WIDTH);

    const overflowAtNarrow = await horizontalOverflow();
    expect(
      overflowAtNarrow - overflowAtWide,
      'REQ-25.1: ビューポートの横幅を超えた分だけ表示領域の水平スクロール量が増えない'
    ).toBeGreaterThanOrEqual((WIDE_VIEWPORT_WIDTH - NARROW_VIEWPORT_WIDTH) / 2);
  });

  /**
   * @requirement quantity-table-generation/REQ-25.2: ページの内容がビューポートの縦幅を超える場合にページ側の垂直スクロールバーを表示する（表示領域の内側には設けない）
   *
   * 従来の判定は空の数量表を開いて
   * `expect(scrollHeight).toBeGreaterThanOrEqual(clientHeight)` を主張していたが、
   * `scrollHeight` は定義上 `clientHeight` を下回らないため、この不等式は
   * どのような画面でも成立する**恒真**であり、REQ-25.2 を一度も検証していなかった。
   *
   * 条文は タスク 100.4（利用者の裁定）で実体へ改訂された。実装
   * （`QuantityGroupCard` の `styles.itemTableWrapper`）は数量項目の表示領域に
   * `overflowY: 'hidden'` を明示宣言し、垂直方向のスクロールをページ側へ委ねている。
   * **改訂前の条文が定めていた「表示領域が持つ垂直スクロールバー」は実装に存在しない。**
   * 改訂後の条文は「**ページの内容（数量項目の表示領域を含む）が**ビューポートの縦幅を超える
   * 場合に、ページ側の垂直スクロールバーを表示する（垂直方向のスクロールはページが担い、
   * 数量項目の表示領域の内側には垂直スクロールバーを設けない）」である。**前件も後件と同じ
   * ページ側の量である**——表示領域の収まりとページ側のスクロールバーの有無は独立で、
   * 幅 1280px の資材では高さ 550px / 600px で「表示領域は収まっているがページは溢れている」
   * 状態が現に起きる（文書超過 92px / 42px、表示領域は top 460px / bottom 513px で収まる）。
   * したがって下の判定が測る `document.documentElement` の縦超過が、条文の前件そのものである。
   *
   * 判定は改訂後の条文の両半を直接主張する。委譲を註釈で説明するだけでは足りないためである。
   * - **ページ側（表示する側）**: 文書の縦方向の超過量が 0 を上回る（高さ 400px。実測 242px）
   * - **表示領域の側（設けない側）**: 同じ画面で表示領域の縦方向の超過量が 0（実測 53/53px）
   * - **委譲が現に働いていること**: 表示領域の上でマウスホイールを**上方向**へ回すと
   *   `window.scrollY` が減り、表示領域自身の `scrollTop` は 0 のままである。下方向で
   *   `scrollY` の増加を主張してはならない——表示領域は `scrollY === 0` では折り返しより
   *   下に在り、マウスを運ぶ `hover()` 自身がページを下端まで送ってしまうため、ホイールを
   *   握り潰す変異の下でも増加の主張は成立してしまう（実測）
   *
   * 否定側（縦の超過量が 0）が恒真へ退化していないことは、**同じ要素の同じ測り方**で
   * 横方向の超過量が 0 を上回ること（実測 1194/1182px）で担保する。要素が描かれていない、
   * あるいは測定そのものが死んでいる場合、この肯定側が先に落ちる。
   *
   * **この高さ 400px の点だけでは、改訂の核心は守れない。** ここでは表示領域が折り返しより下に
   * 在るため「表示領域の量」と「ページ側の量」が同じ向きに動き、差し戻された偽の条文
   * （前件を表示領域の収まりに据えた案）でも同じように合格する。改訂後の条文の特徴的な場合
   * （表示領域は収まっているのにページ側が縦を担う高さ 600px）は、直後の判定が主張する
   * （タスク 100.7）。
   */
  test('ページ側が垂直スクロールバーを担い表示領域の内側には設けない (REQ-25.2)', async ({
    page,
  }) => {
    await openEditPageWithSingleItemRow(page, createdQuantityTableId);

    await page.setViewportSize({ width: 1280, height: 400 });

    const itemTableScroll = page.locator('[data-testid^="item-table-scroll-"]').first();
    await expect(itemTableScroll, '前提: 数量項目の表示領域が表示される').toBeVisible({
      timeout: getTimeout(15000),
    });

    // ページ側（条文の前半）: 縦にあふれた分はページの垂直スクロールバーが受け持つ
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollHeight - document.documentElement.clientHeight
          ),
        {
          message:
            'REQ-25.2: 表示領域がビューポート縦幅を超えてもページ側に垂直スクロールが生じない',
          timeout: getTimeout(10000),
        }
      )
      .toBeGreaterThan(0);

    // 肯定側（測定器が生きていることの証拠）: 同じ要素の同じ測り方で横方向は超過を返す
    expect(
      await itemTableScroll.evaluate((el) => el.scrollWidth - el.clientWidth),
      '前提: 表示領域の横方向の超過量が 0 を上回る（縦の 0 が測定不能による 0 でないこと）'
    ).toBeGreaterThan(0);

    // 表示領域の側（条文の後半）: 内側に縦へスクロールする余地が無い＝垂直スクロールバーを設けない
    await expect
      .poll(() => itemTableScroll.evaluate((el) => el.scrollHeight - el.clientHeight), {
        message:
          'REQ-25.2: 数量項目の表示領域の内側に縦へスクロールする余地があり垂直スクロールバーが現れる',
        timeout: getTimeout(10000),
      })
      .toBe(0);

    // 委譲が現に働いていること: 表示領域の上のホイール操作がページの縦スクロールになる。
    //
    // ホイールは**上方向**へ回す。高さ 400px のビューポートでは、表示領域は
    // `scrollY === 0` の時点で折り返しより下（実測 top 460px / bottom 513px）にあり、
    // 表示領域の上へマウスを運ぶ `hover()` 自身がページを下端（実測 242px ＝ 超過量の
    // 全量）まで送る。**下方向のホイールはそこから先へ進む余地が無く、`scrollY > 0` は
    // ホイールが一切効かなくても `hover()` だけで成立してしまう**（ホイールを
    // `preventDefault` で握り潰す変異を当てても合格し続けることを実測で確認した）。
    // 上方向であればホイールの効果だけが `scrollY` を減らすため、主張が委譲を捉える。
    await itemTableScroll.hover();

    const scrollYAfterHover = await page.evaluate(() => window.scrollY);
    expect(
      scrollYAfterHover,
      '前提: 表示領域の上へマウスを運んだ時点でページが縦に送られている（上方向へ戻す余地がある）'
    ).toBeGreaterThan(0);

    await page.mouse.wheel(0, -300);

    await expect
      .poll(() => page.evaluate(() => window.scrollY), {
        message:
          'REQ-25.2: 表示領域の上でのマウスホイールの縦操作がページの垂直スクロールへ委譲されない',
        timeout: getTimeout(10000),
      })
      .toBeLessThan(scrollYAfterHover);

    expect(
      await itemTableScroll.evaluate((el) => el.scrollTop),
      'REQ-25.2: 表示領域自身が縦にスクロールしており、垂直方向がページへ委譲されていない'
    ).toBe(0);
  });

  /**
   * @requirement quantity-table-generation/REQ-25.2: ページの内容がビューポートの縦幅を超える場合にページ側の垂直スクロールバーを表示する（表示領域の内側には設けない）
   *
   * **この判定は、上の高さ 400px の点が構造的に踏めない場合を踏む**（タスク 100.7）。
   *
   * 条文はタスク 100.4 で「前件も後件もページ側の量」へ改訂された。改訂前の案は**後件だけを
   * ページ側へ付け替え、前件を「数量項目の表示領域が収まっている」に据え置いた偽の条文**で、
   * 独立レビューが差し戻した。ところが被覆源は 25.2 を高さ 400px、25.3 を高さ 900px の各1点
   * でしか測っておらず、**この2点は差し戻された偽の条文でも同じように合格する**——400px では
   * 表示領域が折り返しより下（top 460px / bottom 513px）に在って「収まっていない」、900px では
   * 文書も表示領域も収まるため、「表示領域の量」と「ページ側の量」が同じ向きに動くからである。
   * つまり従来の判定は 100.4 の是正そのものを守っていなかった。
   *
   * 両者が食い違うのは高さ 550px 〜 642px の区間で、ここが**改訂後の条文の特徴的な場合**である。
   * この判定は高さ {@link AREA_FITS_WHILE_PAGE_OVERFLOWS_HEIGHT}px を取り、次の四つを**同時に**
   * 主張する。四つが同時に成り立つ状態は、前件を「表示領域の収まり」に据えた偽の条文では
   * 説明できない（偽の条文の下では (b) が真なのでページ側の垂直スクロールバーは現れず (a) が偽になる）。
   * - (a) `document.documentElement` の縦方向の超過量が 0 を上回る（実測 42px。文書 642px）
   * - (b) 表示領域の矩形がビューポート内に**完全に**収まる（`top >= 0 && bottom <= 600`。実測 460..513）
   * - (c) 表示領域の**内側**の縦方向の超過量が 0（実測 53/53px）
   * - (d) 下方向のマウスホイールで**ページが現に縦へスクロールする**（`window.scrollY` が 0 を
   *   上回る。実測 42 ＝ 超過量の全量）
   *
   * **(a) は条文の前件の観測であって、後件の観測ではない（タスク 100.11）。** 文書の超過量は
   * 「文書が溢れていること」の proxy にすぎず、「ページ側の垂直スクロールバーが表示されて
   * いること」ではない。`body { overflow-y: hidden }` を当てると overflow がビューポートへ伝播
   * してページは一切スクロールできなくなる（下方向のホイール 200 の後も `scrollY` は 0）のに、
   * 超過量は 42px のまま動かず、(a)(b)(c) は3つとも合格する（タスク 100.7 の独立レビューが
   * 実測）。後件そのものは (d) が {@link scrollYAfterWheelDown} で測り、同じ変異の下で (d)
   * だけが赤になる。
   *
   * **この変異に盲目だったのはファイル全体ではなく本判定の三点である。** 同じ変異を遷移を
   * またいで当て直した実測では、素通りするのは 600px の (a)(b)(c) の三点であり（改修後は
   * (d) だけが赤。`scrollY` は 0 のまま）、高さ 400px の REQ-25.2（上方向のホイールによる
   * 委譲。`scrollY` が 242 から減らない）と REQ-25.6（ホイールでページが縦へ動くこと。
   * `scrollY` が 0 のまま）は同じ変異を現に捉えて赤になる。**変異は `test.beforeEach` の
   * `page.addInitScript` で注入すること**——`addStyleTag` は画面遷移で失われ、遷移をまたぐ
   * 判定には届かないため、「変異を当てたのに全件緑」という誤った観測を生む（タスク 100.11）。
   *
   * (d) が下方向のホイールを取れるのは、この判定が高さ 600px を取るからである。ここでは
   * 表示領域がビューポート内に在り `hover()` が scrollIntoView を起こさない（実測 `scrollY` 0）
   * ため、増加はホイールにのみ帰属する。**高さ 400px ではこの帰属が成り立たない**ので、
   * 上の 400px の判定は上方向のホイールで委譲を主張している（両者は別の事実を測っている）。
   *
   * 矩形はビューポート座標で読むため、測る前にページの縦位置を先頭へ戻す。前提を用意する
   * 補助が入力欄へ焦点を当てる際にページを送ることがあり、位置が実行ごとに揺れるためである
   * （100.4 の実測もすべて `scrollY === 0` で取られている）。
   *
   * (c) が恒真へ退化していないことは、上の 400px の判定と同じ手口——**同じ要素の同じ測り方**で
   * 横方向の超過量が 0 を上回ること（実測 1194/1182px）——で担保する。併せて表示領域が高さを
   * 持つことを主張し、(b) が高さ 0 の要素で自明に成立する形を排除する。
   *
   * （タスク 100.7 の時点では「高さ 600px では文書の超過が 42px しかなく `hover()` の
   * scrollIntoView がページを動かす余地と区別しにくい」としてホイール操作を避けていた。
   * この回避理由は**実測で否定された**——高さ 600px では表示領域がビューポート内にあるため
   * `hover()` は scrollIntoView を起こさず、マウスを運んだ時点の `scrollY` は 0 である。
   * 回避理由が成り立つのは表示領域が折り返しより下に在る 400px の側だけであった。）
   */
  test('表示領域がビューポート内に完全に収まっていてもページ側が垂直スクロールバーを担う (REQ-25.2)', async ({
    page,
  }) => {
    await openEditPageWithSingleItemRow(page, createdQuantityTableId);

    await page.setViewportSize({
      width: 1280,
      height: AREA_FITS_WHILE_PAGE_OVERFLOWS_HEIGHT,
    });

    const itemTableScroll = page.locator('[data-testid^="item-table-scroll-"]').first();
    await expect(itemTableScroll, '前提: 数量項目の表示領域が表示される').toBeVisible({
      timeout: getTimeout(15000),
    });

    // 矩形をビューポート座標で読むための基準をそろえる（主張ではなく前提の整備）。
    await page.evaluate(() => window.scrollTo(0, 0));

    // (a) ページ側: 条文の**前件**が成立する（ページの内容がビューポートの縦幅を超える）。
    // 後件（垂直スクロールバーが表示されている）は (d) が実際のスクロール可能性で測る。
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollHeight - document.documentElement.clientHeight
          ),
        {
          message:
            'REQ-25.2: 表示領域がビューポート内に完全に収まる高さで、ページ側に垂直スクロールが生じない',
          timeout: getTimeout(10000),
        }
      )
      .toBeGreaterThan(0);

    const areaRect = await itemTableScroll.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });

    // (b) 表示領域の矩形がビューポート内に完全に収まる（ここが偽の条文と食い違う点である）
    expect(
      areaRect.top,
      'REQ-25.2: 表示領域の上端がビューポートの外にあり、「表示領域は収まっている」状態になっていない'
    ).toBeGreaterThanOrEqual(0);
    expect(
      areaRect.bottom,
      'REQ-25.2: 表示領域の下端がビューポートの外にあり、「表示領域は収まっている」状態になっていない'
    ).toBeLessThanOrEqual(AREA_FITS_WHILE_PAGE_OVERFLOWS_HEIGHT);
    expect(
      areaRect.bottom - areaRect.top,
      '前提: 表示領域が高さを持つ（矩形の収まりが高さ 0 の要素で自明に成立していないこと）'
    ).toBeGreaterThan(0);

    // 肯定側（測定器が生きていることの証拠）: 同じ要素の同じ測り方で横方向は超過を返す
    expect(
      await itemTableScroll.evaluate((el) => el.scrollWidth - el.clientWidth),
      '前提: 表示領域の横方向の超過量が 0 を上回る（縦の 0 が測定不能による 0 でないこと）'
    ).toBeGreaterThan(0);

    // (c) 表示領域の側: 収まっている状態でも内側に縦へスクロールする余地が無い
    await expect
      .poll(() => itemTableScroll.evaluate((el) => el.scrollHeight - el.clientHeight), {
        message:
          'REQ-25.2: 表示領域が収まっている状態で、その内側に縦へスクロールする余地があり垂直スクロールバーが現れる',
        timeout: getTimeout(10000),
      })
      .toBe(0);

    // (d) ページ側（条文の**後件**そのもの）: ページが現に縦へスクロールできる。
    // ここが (a) の proxy と食い違う唯一の点であり、ページを縦へ送れなくする変異
    // （`body { overflow-y: hidden }`）の下で (a)(b)(c) が合格したまま本行だけが落ちる。
    expect(
      await scrollYAfterWheelDown(page, itemTableScroll),
      'REQ-25.2: ページの内容が縦幅を超えているのに、マウスホイールの縦操作でページが縦へスクロールしない（ページ側の垂直スクロールバーが表示されていない）'
    ).toBeGreaterThan(0);
  });

  /**
   * @requirement quantity-table-generation/REQ-25.3: ページの内容がビューポートの縦幅に収まっている状態ではページ側の垂直スクロールバーを非表示にする（表示領域の内側には常に設けない）
   *
   * 従来の判定は空の数量表を 2560x1440 で開き、文書の横方向の超過量が 50px 以下で
   * あることを主張していた。数量項目の表示領域を持たない画面を見ており、また 50px の
   * 許容は「収まっている」と「わずかに溢れている」を区別しない。
   *
   * 条文は タスク 100.4（利用者の裁定）で垂直方向を前件・後件とも「ページ側の量」へ改訂した。
   * 改訂後は「**ページの内容（数量項目の表示領域を含む）が**ビューポートの縦幅に収まっている
   * 状態で、ページ側の垂直スクロールバーを非表示にする（数量項目の表示領域の内側には、
   * 収まっているか否かに依らず垂直スクロールバーを設けない）」である。
   *
   * **前件を「数量項目の表示領域が収まっている」に据え置いてはならない。** 表示領域の収まりと
   * ページ側のスクロールバーの有無は独立であり、幅 1280px の資材では高さ 550px / 600px で
   * 前件が真・後件が偽になる（文書超過 92px / 42px なのに表示領域は top 460px / bottom 513px
   * でビューポート内に収まる）。この判定が高さ 900px を選ぶのは、そこで**ページの内容**が
   * 収まる（文書超過 0）からであって、表示領域が収まるからではない。
   *
   * 判定は両半を主張する。
   * - **ページ側（前件）**: 高さ 900px のビューポートで文書の縦方向の超過量が 0
   *   ＝条文の前件「ページの内容がビューポートの縦幅に収まっている」がそのまま成立する
   *   （数量グループ1件・数量項目1行の編集画面の内容高さは実測 642px）。REQ-25.2 の判定は
   *   同じ内容を高さ 400px で 0 超と主張しており、両者は同じ画面の同じ量に対する相反する
   *   主張であるため、どちらかを恒真にできない
   * - **ページ側（非表示になる側＝後件）**: 同じ画面で下方向のマウスホイールを当てても
   *   `window.scrollY` が 0 のまま動かない（{@link scrollYAfterWheelDown}）。**文書の超過量は
   *   後件の観測ではない**——「文書が溢れていること」の proxy にすぎず、スクロールバーが
   *   表示されているかどうかを一切見ていないからである（タスク 100.11）。後件は「縦へ送る
   *   手段が無い」ことで測る
   * - **表示領域の側（収まっていても設けない）**: 同じ画面で表示領域の縦方向の超過量が 0
   *   （実測 53/53px）。REQ-25.2 は縦にあふれた状態で同じ 0 を主張しており、**収まっている
   *   か否かに依らない**という条文の「依らず」を二つの状態の対で固定する
   *
   * 否定側が恒真へ退化していないことは REQ-25.2 と同じ手口——**同じ要素の同じ測り方**で
   * 横方向の超過量が 0 を上回ること（実測 1194/1182px）——で担保する。
   *
   * **後件の否定（縦へ送れない）には、測定器の生死の対照を同一テスト内に置く。** 「スクロール
   * できない」は、ホイール操作が届かない環境では何も壊れていなくても成立してしまうからである。
   * そこで高さ {@link AREA_FITS_WHILE_PAGE_OVERFLOWS_HEIGHT}px（ページの内容が 42px あふれる点）
   * へ一度移し、**同じ補助・同じ待ち方**で `window.scrollY` が現に増える（実測 42）ことを先に
   * 示してから、高さ 900px へ戻して増えないことを主張する。対照が落ちれば、続く「増えない」は
   * 条文の充足ではなく測定器の死である。対照の区間は 25.3 の前件が偽（空虚）な点であり、
   * 25.3 の主張そのものではない——**25.3 として主張するのは高さ 900px の側だけ**である。
   * なお対照が待ちの十分さも兼ねる。増加待ちの期限は両側で同じで、増えない側は期限いっぱい
   * 待ってから読むため、対照が同じ期限で増加を捉えている限り「待ち不足の 0」ではありえない。
   *
   * **ただし後件の非空洞性は 600px から借りた対照だけに支えられているのではない。前件と後件は
   * 測る時刻が異なるため、後件だけを独立に偽にする経路が実在する。** 高さ 900px で表示領域へ
   * マウスを運んだことを契機に `body` 直下へ縦に長い要素が開けば、前件の poll と 900px への
   * 復帰後の再確認がいずれも 0 を返したあとで文書が伸び、ホイールがページを縦へ送る。この画面の
   * 補完ドロップダウンは現に Portal で `body` 直下へ描かれるため架空の経路ではない。実測でも、
   * この形の変異（高さ 900px のときだけ hover を契機に `body` 直下へ高さ 2000px の要素を足す）
   * の下で前件の poll・再確認・600px の対照がすべて通過したまま後件だけが赤になる
   * （`scrollY` が 200 になり `.toBe(0)` が落ちる。タスク 100.11 の独立レビューが設計し実証）。
   *
   * **この判定の 900px の点だけでは、100.4 が差し戻した「表示領域の収まりを前件に据えた
   * 偽の条文」を捉えられない**（900px では文書も表示領域も収まるため、独立な二つの量が
   * 同じ向きに動く）。改訂の核心を守る点は REQ-25.2 側の高さ 600px の判定
   * （本ファイルの `AREA_FITS_WHILE_PAGE_OVERFLOWS_HEIGHT` を使う区間。タスク 100.7）
   * である。25.3 の判定だけを読んで「改訂は被覆源に載っている」と結論しないこと。
   *
   * 水平方向の非表示は主張しない。承認済みの仕様（REQ-37 配置概要・REQ-37 AC6・
   * design.md:2212）が数量項目の表の常時溢れを受け入れており、「数量項目の表示領域が
   * ビューポートの横幅に収まる」という水平方向の前件が成立しないためである。詳細と実測は
   * ファイル冒頭の注記を参照。条文の AC 3 も水平方向の意味は変えておらず、前件が成立しない
   * ことを明記しただけである（垂直方向の前件をページ側へ移した際に水平方向まで巻き込まない
   * よう、条文は両軸の前件を分けて書いている）。
   */
  test('収まっている状態ではページ側の垂直スクロールバーが非表示になり表示領域の内側にも設けない (REQ-25.3)', async ({
    page,
  }) => {
    await openEditPageWithSingleItemRow(page, createdQuantityTableId);

    await page.setViewportSize({ width: 1280, height: 900 });

    const itemTableScroll = page.locator('[data-testid^="item-table-scroll-"]').first();
    await expect(itemTableScroll, '前提: 数量項目の表示領域が表示される').toBeVisible({
      timeout: getTimeout(15000),
    });

    const pageVerticalOverflow = () =>
      page.evaluate(
        () => document.documentElement.scrollHeight - document.documentElement.clientHeight
      );

    // ページ側（条文の前件・垂直方向）: ページの内容がビューポートの縦幅に収まっている
    await expect
      .poll(pageVerticalOverflow, {
        message: 'REQ-25.3: 表示領域が収まっているのにページ側の垂直スクロールバーが表示される',
        timeout: getTimeout(10000),
      })
      .toBe(0);

    // 肯定側（測定器が生きていることの証拠）: 同じ要素の同じ測り方で横方向は超過を返す
    expect(
      await itemTableScroll.evaluate((el) => el.scrollWidth - el.clientWidth),
      '前提: 表示領域の横方向の超過量が 0 を上回る（縦の 0 が測定不能による 0 でないこと）'
    ).toBeGreaterThan(0);

    // 表示領域の側（条文の後半）: 収まっている状態でも内側に垂直スクロールバーを設けない
    await expect
      .poll(() => itemTableScroll.evaluate((el) => el.scrollHeight - el.clientHeight), {
        message:
          'REQ-25.3: 収まっている状態でも数量項目の表示領域の内側に縦へスクロールする余地がある',
        timeout: getTimeout(10000),
      })
      .toBe(0);

    // 対照（測定器の生死）: 同じ資材・同じ補助・同じ待ち方で、ページが縦へあふれる高さでは
    // 現にスクロールできることを先に示す。ここが落ちれば、続く「縦へ送れない」は条文の充足
    // ではなくホイール操作が届いていないことの現れである。この区間は 25.3 の前件が偽なので
    // 25.3 の主張ではない（25.3 として主張するのは高さ 900px の側だけである）。
    await page.setViewportSize({
      width: 1280,
      height: AREA_FITS_WHILE_PAGE_OVERFLOWS_HEIGHT,
    });
    await expect
      .poll(pageVerticalOverflow, {
        message:
          '対照の前提: 高さ 600px でページの内容がビューポートの縦幅を超える（対照が空虚でないこと）',
        timeout: getTimeout(10000),
      })
      .toBeGreaterThan(0);
    expect(
      await scrollYAfterWheelDown(page, itemTableScroll),
      '対照: ページの内容が縦へあふれている高さでもマウスホイールの縦操作でページが動かない（測定器が死んでおり、続く「縦へ送れない」が空虚になる）'
    ).toBeGreaterThan(0);

    // ページ側（条文の後件）: 収まっている高さへ戻すと、同じ操作でページは縦へ動かない
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect
      .poll(pageVerticalOverflow, {
        message:
          '前提: 高さ 900px へ戻してもページの内容がビューポートの縦幅に収まる（条文の前件の再確認）',
        timeout: getTimeout(10000),
      })
      .toBe(0);
    expect(
      await scrollYAfterWheelDown(page, itemTableScroll),
      'REQ-25.3: ページの内容が縦幅に収まっているのに、マウスホイールの縦操作でページが縦へスクロールする（ページ側の垂直スクロールバーが表示されている）'
    ).toBe(0);
  });

  /**
   * @requirement quantity-table-generation/REQ-25.4: ウィンドウリサイズ時の動的更新
   *
   * 従来の判定はリサイズ前後の `clientWidth` を比較して「縮小後は小さくなる」ことを
   * 主張していた。これはビューポートが縮んだことの確認であり、
   * **スクロールバーの表示・非表示が更新されること**は一度も検証していなかった。
   *
   * 垂直スクロールの主体はページ（文書）である（数量項目の表示領域は `overflowY: hidden`
   * でページ側へ委ねる。`QuantityGroupCard` の `itemTableWrapper`）。文書の縦方向の
   * 超過量が、高いビューポートでは 0（非表示）、低いビューポートでは 0 超（表示）、
   * 高さを戻せば再び 0（非表示）へ切り替わることを主張する。
   * 初期状態を「非表示（0）」に置くため、次の「表示（0 超）」の主張が初期値のまま
   * 成立して素通りすることはない。
   */
  test('ウィンドウサイズの変更でスクロールバーの表示・非表示が動的に更新される (REQ-25.4)', async ({
    page,
  }) => {
    await openEditPageWithSingleItemRow(page, createdQuantityTableId);

    const verticalOverflow = () =>
      page.evaluate(
        () => document.documentElement.scrollHeight - document.documentElement.clientHeight
      );

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect
      .poll(verticalOverflow, {
        message: 'REQ-25.4: 高いビューポートで垂直スクロールバーが非表示にならない',
        timeout: getTimeout(10000),
      })
      .toBe(0);

    await page.setViewportSize({ width: 1280, height: 400 });
    await expect
      .poll(verticalOverflow, {
        message: 'REQ-25.4: ウィンドウを低くしても垂直スクロールバーが表示されない',
        timeout: getTimeout(10000),
      })
      .toBeGreaterThan(0);

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect
      .poll(verticalOverflow, {
        message: 'REQ-25.4: ウィンドウを高く戻しても垂直スクロールバーが非表示に戻らない',
        timeout: getTimeout(10000),
      })
      .toBe(0);
  });

  /**
   * @requirement quantity-table-generation/REQ-25.5: 横スクロール操作可能
   *
   * REQ-25.5 は「水平スクロールバーが表示されている状態で」横方向へスクロールできることを
   * 定めている。従来は前提の成否を観測して `if (scrollWidth > clientWidth)` で分岐しており、
   * 空の数量表（事前準備は数量グループを持たない数量表を作る）では前提が成立せず、
   * else 側の `scrollX === scrollX`（常に成立）だけが実行されて REQ-25.5 の主張は
   * 一度も行われなかった。前提を観測せず、数量グループと数量項目行を作って確定させる。
   *
   * 数量項目の表示領域は REQ-41 で `itemTableWrapper`（`item-table-scroll-*`）に
   * 限定された水平スクロール領域であり、requirements.md の Requirement 37 の記述
   * 「表領域の水平スクロールバー（Requirement 25 と整合）」がこれを明示している。
   * 列幅の合計（QUANTITY_ITEM_GRID_COLUMNS = 1168px）は 600px のビューポートを必ず超えるため、
   * 「水平スクロールバーが表示されている状態」が決定的に成立する。
   */
  test('水平スクロールバーが表示されている状態で表領域を横スクロールできる (REQ-25.5)', async ({
    page,
  }) => {
    await openEditPageWithSingleItemRow(page, createdQuantityTableId);

    await page.setViewportSize({ width: 600, height: 800 });

    const itemTableScroll = page.locator('[data-testid^="item-table-scroll-"]').first();
    await expect(itemTableScroll, '前提: 数量項目の表示領域が表示される').toBeVisible({
      timeout: getTimeout(15000),
    });

    // 前提（REQ-25.1）: 表示領域がビューポート幅を超え、水平スクロールバーが表示される
    await expect
      .poll(() => itemTableScroll.evaluate((el) => el.scrollWidth - el.clientWidth), {
        message: 'REQ-25.1: 数量項目の表示領域がビューポート幅を超え水平スクロールが可能になる',
        timeout: getTimeout(10000),
      })
      .toBeGreaterThan(0);

    const scrollLeftBefore = await itemTableScroll.evaluate((el) => el.scrollLeft);

    // 条文が名指す手段そのもの（マウスホイールの横スクロール操作）で動かす。
    // 旧判定は `el.scrollLeft += 200` のプログラム代入であり、これは利用者の操作を
    // 一切通らない——表示領域の `overflow-x` を `hidden` にしても、ホイールの既定動作を
    // `preventDefault()` で止めても、プログラム代入は変わらず成功する（タスク 100.6）。
    await itemTableScroll.hover();
    await page.mouse.wheel(200, 0);

    await expect
      .poll(() => itemTableScroll.evaluate((el) => el.scrollLeft), {
        message: 'REQ-25.5: マウスホイールの横スクロール操作で表領域が横方向にスクロールする',
        timeout: getTimeout(10000),
      })
      .toBeGreaterThan(scrollLeftBefore);
  });

  /**
   * @requirement quantity-table-generation/REQ-25.6: 縦スクロール操作可能
   *
   * REQ-25.6 の前提「垂直スクロールバーが表示されている状態」も観測せずに確定させる。
   * 垂直スクロールは `itemTableWrapper` が `overflowY: hidden` でページ側へ委ねており
   * （QuantityGroupCard の Task 58.2 の注記）、スクロールの主体は window である。
   * 数量グループ1件（写真領域・タイトル行・項目行・追加ボタン）を持つ編集画面は
   * 高さ 400px のビューポートに収まらないため、前提が決定的に成立する。
   */
  test('垂直スクロールバーが表示されている状態で縦スクロールできる (REQ-25.6)', async ({
    page,
  }) => {
    await openEditPageWithSingleItemRow(page, createdQuantityTableId);

    await page.setViewportSize({ width: 1280, height: 400 });

    // 前提（REQ-25.2）: コンテンツがビューポート高さを超え、垂直スクロールバーが表示される
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollHeight - document.documentElement.clientHeight
          ),
        {
          message: 'REQ-25.2: コンテンツがビューポート高さを超え垂直スクロールが可能になる',
          timeout: getTimeout(10000),
        }
      )
      .toBeGreaterThan(0);

    const scrollYBefore = await page.evaluate(() => window.scrollY);

    // 25.5 と同じ理由で、条文が名指す手段（マウスホイールの縦スクロール操作）で動かす。
    // 旧判定の `window.scrollBy(0, 200)` はプログラム代入であり、ホイールの既定動作が
    // 止められていても成功する（タスク 100.6）。
    await page.mouse.move(640, 200);
    await page.mouse.wheel(0, 200);

    await expect
      .poll(() => page.evaluate(() => window.scrollY), {
        message: 'REQ-25.6: マウスホイールの縦スクロール操作で画面が縦方向にスクロールする',
        timeout: getTimeout(10000),
      })
      .toBeGreaterThan(scrollYBefore);
  });
});
