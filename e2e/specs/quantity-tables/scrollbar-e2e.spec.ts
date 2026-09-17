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
   * - **ページ側（非表示になる側）**: 高さ 900px のビューポートで文書の縦方向の超過量が 0
   *   ＝条文の前件「ページの内容がビューポートの縦幅に収まっている」がそのまま成立する
   *   （数量グループ1件・数量項目1行の編集画面の内容高さは実測 642px）。REQ-25.2 の判定は
   *   同じ内容を高さ 400px で 0 超と主張しており、両者は同じ画面の同じ量に対する相反する
   *   主張であるため、どちらかを恒真にできない
   * - **表示領域の側（収まっていても設けない）**: 同じ画面で表示領域の縦方向の超過量が 0
   *   （実測 53/53px）。REQ-25.2 は縦にあふれた状態で同じ 0 を主張しており、**収まっている
   *   か否かに依らない**という条文の「依らず」を二つの状態の対で固定する
   *
   * 否定側が恒真へ退化していないことは REQ-25.2 と同じ手口——**同じ要素の同じ測り方**で
   * 横方向の超過量が 0 を上回ること（実測 1194/1182px）——で担保する。
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

    // ページ側（条文の前半・垂直方向）
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollHeight - document.documentElement.clientHeight
          ),
        {
          message: 'REQ-25.3: 表示領域が収まっているのにページ側の垂直スクロールバーが表示される',
          timeout: getTimeout(10000),
        }
      )
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
