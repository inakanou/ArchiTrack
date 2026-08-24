/**
 * @fileoverview 画面スクロールバー表示 E2Eテスト (REQ-25)
 *
 * Requirements coverage:
 * - @requirement quantity-table-generation/REQ-25.1: 横幅超過時の水平スクロールバー
 * - @requirement quantity-table-generation/REQ-25.2: 縦幅超過時の垂直スクロールバー
 * - @requirement quantity-table-generation/REQ-25.3: ビューポート内収納時はスクロールバー非表示
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
   * @requirement quantity-table-generation/REQ-25.2: 縦幅超過時の垂直スクロールバー
   *
   * 従来の判定は空の数量表を開いて
   * `expect(scrollHeight).toBeGreaterThanOrEqual(clientHeight)` を主張していたが、
   * `scrollHeight` は定義上 `clientHeight` を下回らないため、この不等式は
   * どのような画面でも成立する**恒真**であり、REQ-25.2 を一度も検証していなかった。
   *
   * 垂直方向は数量項目の表示領域（`item-table-scroll-*`）が `overflowY: hidden` で
   * ページ側へ委ねる実装であり（`QuantityGroupCard` の `itemTableWrapper`）、
   * スクロールの主体は文書（`document.documentElement` / `window`）である。
   * 判定先を文書に取り、数量グループ1件・数量項目1行を用意したうえで高さ 400px の
   * ビューポートを与え、超過量が 0 を上回ることを主張する。
   */
  test('数量項目の表示領域が縦幅を超えると垂直スクロールバーが表示される (REQ-25.2)', async ({
    page,
  }) => {
    await openEditPageWithSingleItemRow(page, createdQuantityTableId);

    await page.setViewportSize({ width: 1280, height: 400 });

    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollHeight - document.documentElement.clientHeight
          ),
        {
          message: 'REQ-25.2: 表示領域がビューポート縦幅を超えても垂直スクロールが生じない',
          timeout: getTimeout(10000),
        }
      )
      .toBeGreaterThan(0);
  });

  /**
   * @requirement quantity-table-generation/REQ-25.3: ビューポート内収納時はスクロールバーが非表示
   *
   * 従来の判定は空の数量表を 2560x1440 で開き、文書の横方向の超過量が 50px 以下で
   * あることを主張していた。数量項目の表示領域を持たない画面を見ており、また 50px の
   * 許容は「収まっている」と「わずかに溢れている」を区別しない。
   *
   * REQ-25.2 と対になる状態（収まっている side）を、同じ判定先（文書の垂直方向）で
   * 主張する。数量グループ1件・数量項目1行を持つ編集画面の内容高さは実測 642px で
   * あるため、高さ 900px のビューポートでは超過量が 0 になる（＝垂直スクロールバーが
   * 表示されない）。REQ-25.2 の判定は同じ内容を高さ 400px で 0 超と主張しており、
   * 両者は同じ画面の同じ量に対する相反する主張であるため、どちらかを恒真にできない。
   *
   * 水平方向は主張しない。承認済みの仕様（REQ-37 配置概要・REQ-37 AC6・design.md:2212）が
   * 数量項目の表の常時溢れを受け入れており、「表示領域がビューポート内に収まっている」
   * という前件が成立しないためである。詳細と実測はファイル冒頭の注記を参照。
   */
  test('表示領域がビューポート内に収まる場合は垂直スクロールバーが表示されない (REQ-25.3)', async ({
    page,
  }) => {
    await openEditPageWithSingleItemRow(page, createdQuantityTableId);

    await page.setViewportSize({ width: 1280, height: 900 });

    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollHeight - document.documentElement.clientHeight
          ),
        {
          message: 'REQ-25.3: 表示領域が収まっているのに垂直スクロールバーが表示される',
          timeout: getTimeout(10000),
        }
      )
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

    // 横スクロール操作
    await itemTableScroll.evaluate((el) => {
      el.scrollLeft += 200;
    });

    await expect
      .poll(() => itemTableScroll.evaluate((el) => el.scrollLeft), {
        message: 'REQ-25.5: 水平スクロール操作で表領域が横方向にスクロールする',
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
    await page.evaluate(() => window.scrollBy(0, 200));

    await expect
      .poll(() => page.evaluate(() => window.scrollY), {
        message: 'REQ-25.6: 縦スクロール操作で画面が縦方向にスクロールする',
        timeout: getTimeout(10000),
      })
      .toBeGreaterThan(scrollYBefore);
  });
});
