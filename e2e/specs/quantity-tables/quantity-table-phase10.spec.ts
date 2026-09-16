/**
 * @fileoverview 数量表 Phase 10 E2Eテスト
 *
 * Task 42.3: Phase 10のE2Eテストを実装する
 *
 * ## 前提の用意（Task 115.127 段0）
 *
 * 以前は「一覧の先頭のプロジェクトの先頭の数量表」を開き、開けなければ引数なしの
 * `test.skip` で検証を丸ごと消していた。参照していたプロジェクトカードの目印は、テスト側が
 * 識別子を持たない固定値を指す一方で実装はカードごとに識別子を付した値を出しており、
 * **一度も一致しなかった**。その結果、本ファイルの12テストは常に全件が飛んでいた
 * （passed 0）。AI運用7原則 第3原則（前提条件でテストを自動的に無効化してはならない）に
 * 抵触する。目印の不一致は失敗ではなく沈黙として現れるため、緑のまま気付かれない。
 *
 * 本ファイルは前提（プロジェクト・数量表・数量グループ2件・数量項目2行）を事前準備で
 * **自ら作り**、作れなければその場で失敗する。共通の補助は
 * `e2e/helpers/quantity-table-preconditions.ts` に置く。
 *
 * 数量グループを2件用意するのは、REQ-23.5（最上位の「上へ移動」無効化）と
 * REQ-23.6（最下位の「下へ移動」無効化）が、グループ1件では両方とも無効化される
 * （REQ-23.8）ため区別が付かないからである。数量項目も同じ理由で2行用意する。
 *
 * Requirements coverage (quantity-table-generation):
 * - REQ-22.1, 22.2, 22.3: 数量グループ名前変更
 * - REQ-23.3, 23.4, 23.5, 23.6: 数量グループの並び順管理（ボタンの表示と無効化）
 * - REQ-24.5, 24.6: 数量項目の並び順管理（無効化。操作の入口は REQ-36 によりアクションメニュー）
 * - REQ-25.1, 25.5: 数量項目表示領域の水平スクロール
 * - REQ-26.1, 26.11: PDF出力
 * - REQ-36.2: 数量項目のアクションメニューに操作項目を含める
 *
 * ヘッダーに機能名を与えたのは、機能名を欠く `Requirements coverage:` の配下の名乗りが
 * 被覆の走査で一件も読まれないためである（タスク 100.6）。名乗りの一覧は本ファイルの
 * 各区間の `@requirement` の印と一致させてある。範囲の記法（`22.1-22.3`）は識別子欄の
 * 読み取りが先頭の一件しか拾わないため、逐一列挙する形へ改めた。
 *
 * 受入基準 26.9（PDF生成中のインジケーター表示と重複操作の防止）は
 * `e2e/requirement-exclusions.json` に在籍しているため、ここでは名乗らない。
 * 除外の宣言と被覆印の同居は `scripts/check-requirement-exclusions.ts` の
 * 不変条件5が禁じる。本ファイルには「PDF生成中にボタンが無効化される」区間が現に在り
 * `toBeDisabled()` を主張しているが、除外を取り下げるかどうかの決着は
 * `.kiro/specs/quantity-table-generation/tasks.md` のタスク 100.5 が扱う。
 *
 * @module e2e/specs/quantity-tables/quantity-table-phase10.spec
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { assertPrepared } from '../../helpers/preconditions';
import {
  addQuantityGroup,
  addQuantityItemRows,
  createTestProject,
  createTestQuantityTable,
  fillItemRequiredFields,
  openQuantityTableEdit,
} from '../../helpers/quantity-table-preconditions';

/** 1件目の数量グループに付ける名前 */
const FIRST_GROUP_NAME = 'Phase10先頭グループ';
/** 2件目の数量グループに付ける名前 */
const SECOND_GROUP_NAME = 'Phase10末尾グループ';

test.describe('Phase 10: グループ名変更・並び順管理・スクロールバー・PDF出力', () => {
  test.describe.configure({ mode: 'serial' });

  let testProjectId: string | null = null;
  let createdQuantityTableId: string | null = null;
  let createdQuantityTableName: string | null = null;

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * 数量グループ名を書き換え、画面へ反映されたことまで主張する（REQ-22.1, 22.2）。
   *
   * グループ名は見出し（`h3[role="button"]`）で表示され、クリックすると
   * `input[aria-label="グループ名を編集"]` に切り替わる。
   */
  async function renameGroup(groupCard: Locator, from: string, to: string): Promise<void> {
    const nameHeading = groupCard.getByRole('button', { name: from });
    await expect(nameHeading, `グループ名「${from}」が表示される`).toBeVisible({
      timeout: getTimeout(10000),
    });
    await nameHeading.click();

    const nameInput = groupCard.getByLabel('グループ名を編集');
    await expect(nameInput, 'REQ-22.1: グループ名が編集可能な状態になる').toBeVisible({
      timeout: getTimeout(10000),
    });
    await nameInput.fill(to);
    await nameInput.press('Enter');

    await expect(
      groupCard.getByRole('button', { name: to }),
      `REQ-22.2: 変更後の名前「${to}」が画面へ反映される`
    ).toBeVisible({ timeout: getTimeout(10000) });
  }

  /**
   * 事前準備で用意した数量表を開き、数量グループ（2件）を返す。
   */
  async function openPreparedGroups(page: Page): Promise<Locator> {
    await openQuantityTableEdit(page, createdQuantityTableId);

    const groupCards = page.locator('[data-testid="quantity-group-card"]');
    await expect(groupCards, '前提: 事前準備の数量グループが2件存在する').toHaveCount(2, {
      timeout: getTimeout(15000),
    });
    return groupCards;
  }

  /**
   * 対象行のアクションメニューを開き、メニューを返す。
   *
   * REQ-36 により数量項目の並び替えの入口はアクションメニューへ統合されている。
   * ドロップダウンは body 直下へ Portal 描画されるため行スコープでは参照できない。
   */
  async function openItemActionMenu(page: Page, row: Locator): Promise<Locator> {
    const actionButton = row.getByRole('button', { name: 'アクション' });
    await expect(actionButton, 'アクションメニューボタンが表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    await actionButton.click();

    const menu = page.getByRole('menu');
    await expect(menu, 'アクションメニューが表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    return menu;
  }

  // 前提の生成は1テストあたりのタイムアウト（60秒）に収まるよう段階に分ける。
  // 直列（serial）であるため、前段が失敗した場合に後段が成功して見えることはない。
  test.describe('事前準備', () => {
    test('テスト用プロジェクトと数量表を作成する', async ({ page }) => {
      testProjectId = await createTestProject(page, 'Phase10_PJ');
      const created = await createTestQuantityTable(page, testProjectId, 'Phase10_数量表');
      createdQuantityTableId = created.id;
      createdQuantityTableName = created.name;
    });

    test('数量グループ2件と数量項目2行を作成する', async ({ page }) => {
      await openQuantityTableEdit(page, createdQuantityTableId);

      const firstGroup = await addQuantityGroup(page);
      const itemRows = await addQuantityItemRows(firstGroup, 2);
      // 名称が空の項目があると保存が拒否される（REQ-11.2 の整合性チェック）
      await fillItemRequiredFields(itemRows.nth(0), { name: 'Phase10先頭項目' });
      await fillItemRequiredFields(itemRows.nth(1), { name: 'Phase10末尾項目' });
      await renameGroup(firstGroup, 'グループ 1', FIRST_GROUP_NAME);

      const secondGroup = await addQuantityGroup(page);
      await renameGroup(secondGroup, 'グループ 2', SECOND_GROUP_NAME);

      // REQ-42.5: 追加・名称変更はクライアントドラフトの更新に留まるため明示保存する。
      // 後続の各テストは編集画面を開き直して前提を参照する。
      await saveQuantityTableDraft(page);
    });
  });

  test.describe('REQ-22.1-22.3: 数量グループ名前変更', () => {
    /**
     * @requirement quantity-table-generation/REQ-22.1
     * @requirement quantity-table-generation/REQ-22.2
     */
    test('グループ名をクリックして編集モードに遷移し、新しい名前を入力して確定後に反映される', async ({
      page,
    }) => {
      const groupCards = await openPreparedGroups(page);
      const firstGroup = groupCards.first();

      // 変更はドラフトのみを更新する（REQ-42）。保存しないため、次のテストが
      // 編集画面を開き直した時点で事前準備の名前へ戻る。
      await renameGroup(firstGroup, FIRST_GROUP_NAME, 'E2E変更後の名前');
    });

    /**
     * @requirement quantity-table-generation/REQ-22.3
     */
    test('空白名前を確定しようとした場合にエラーメッセージが表示される', async ({ page }) => {
      const groupCards = await openPreparedGroups(page);
      const firstGroup = groupCards.first();

      const nameHeading = firstGroup.getByRole('button', { name: FIRST_GROUP_NAME });
      await expect(nameHeading, '前提: 事前準備のグループ名が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });
      await nameHeading.click();

      const nameInput = firstGroup.getByLabel('グループ名を編集');
      await expect(nameInput, 'グループ名が編集可能な状態になる').toBeVisible({
        timeout: getTimeout(10000),
      });
      await nameInput.fill('   ');
      await nameInput.press('Enter');

      // REQ-22.3: 空白のまま確定するとエラーメッセージを表示し、入力を求める
      await expect(
        firstGroup.getByText('グループ名を入力してください'),
        'REQ-22.3: 空白確定でエラーメッセージが表示される'
      ).toBeVisible({ timeout: getTimeout(10000) });
      await expect(nameInput, 'REQ-22.3: 入力欄は編集状態のまま残り入力を求める').toBeVisible();
    });
  });

  test.describe('REQ-23.3-23.6: 数量グループ並び順管理', () => {
    /**
     * @requirement quantity-table-generation/REQ-23.3
     * @requirement quantity-table-generation/REQ-23.4
     */
    test('数量グループの「上へ移動」「下へ移動」ボタンが表示される', async ({ page }) => {
      const groupCards = await openPreparedGroups(page);
      const firstGroup = groupCards.first();

      await expect(
        firstGroup.getByRole('button', { name: '上へ移動' }),
        'REQ-23.3: グループに「上へ移動」ボタンが表示される'
      ).toBeVisible({ timeout: getTimeout(10000) });
      await expect(
        firstGroup.getByRole('button', { name: '下へ移動' }),
        'REQ-23.4: グループに「下へ移動」ボタンが表示される'
      ).toBeVisible({ timeout: getTimeout(10000) });
    });

    /**
     * @requirement quantity-table-generation/REQ-23.5
     */
    test('最上位グループの「上へ移動」ボタンが無効化されている', async ({ page }) => {
      const groupCards = await openPreparedGroups(page);
      const firstGroup = groupCards.first();

      await expect(
        firstGroup.getByRole('button', { name: '上へ移動' }),
        'REQ-23.5: 最上位グループの「上へ移動」は無効化される'
      ).toBeDisabled();
      await expect(
        firstGroup.getByRole('button', { name: '下へ移動' }),
        'REQ-23.5: 最上位グループの「下へ移動」は有効のままである'
      ).toBeEnabled();
    });

    /**
     * @requirement quantity-table-generation/REQ-23.6
     */
    test('最下位グループの「下へ移動」ボタンが無効化されている', async ({ page }) => {
      const groupCards = await openPreparedGroups(page);
      const lastGroup = groupCards.last();

      await expect(
        lastGroup.getByRole('button', { name: '下へ移動' }),
        'REQ-23.6: 最下位グループの「下へ移動」は無効化される'
      ).toBeDisabled();
      await expect(
        lastGroup.getByRole('button', { name: '上へ移動' }),
        'REQ-23.6: 最下位グループの「上へ移動」は有効のままである'
      ).toBeEnabled();
    });
  });

  test.describe('REQ-24.5-24.6: 数量項目並び順管理', () => {
    /**
     * @requirement quantity-table-generation/REQ-36.2
     *
     * タスク 115.188 の是正: 従前は REQ-24.3 を名乗っていたが、受入基準24.3 の原文は「When 数量項目の「上へ移動」
     * ボタンをクリックする, the 数量表管理システム shall 当該数量項目を同一グループ内で1つ上の位置に移動する」
     * である。本区間の表題・本文が述べる内容に対応するのは受入基準36.2（「When 数量項目のアクションメニューボタンをクリックする,
     * the 数量表管理システム shall ドロップダウンメニューを表示し、メニュー内に「上へ移動」
     * 「下へ移動」「削除」の操作項目を含める」）である。
     * @requirement quantity-table-generation/REQ-36.2
     *
     * タスク 115.188 の是正: 従前は REQ-24.4 を名乗っていたが、受入基準24.4 の原文は「When 数量項目の「下へ移動」
     * ボタンをクリックする, the 数量表管理システム shall 当該数量項目を同一グループ内で1つ下の位置に移動する」
     * である。本区間の表題・本文が述べる内容に対応するのは受入基準36.2（「When 数量項目のアクションメニューボタンをクリックする,
     * the 数量表管理システム shall ドロップダウンメニューを表示し、メニュー内に「上へ移動」
     * 「下へ移動」「削除」の操作項目を含める」）である。
     *
     * REQ-36.1 により個別の並び替えボタンは廃止され、操作の入口はアクションメニューに
     * 統合されている。したがって「表示される」の判定はメニュー項目に対して行う。
     */
    test('数量項目の「上へ移動」「下へ移動」がアクションメニューに表示される', async ({ page }) => {
      const groupCards = await openPreparedGroups(page);
      const itemRows = groupCards.first().locator('[data-testid="quantity-item-row"]');
      await expect(itemRows, '前提: 事前準備の数量項目が2行存在する').toHaveCount(2, {
        timeout: getTimeout(15000),
      });

      const menu = await openItemActionMenu(page, itemRows.first());
      await expect(
        menu.getByRole('menuitem', { name: /上へ移動/ }),
        'REQ-24.3: 「上へ移動」の入口が表示される'
      ).toBeVisible({ timeout: getTimeout(5000) });
      await expect(
        menu.getByRole('menuitem', { name: /下へ移動/ }),
        'REQ-24.4: 「下へ移動」の入口が表示される'
      ).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement quantity-table-generation/REQ-24.5
     * @requirement quantity-table-generation/REQ-24.6
     */
    test('最上位項目の「上へ移動」と最下位項目の「下へ移動」が無効化されている', async ({
      page,
    }) => {
      const groupCards = await openPreparedGroups(page);
      const itemRows = groupCards.first().locator('[data-testid="quantity-item-row"]');
      await expect(itemRows, '前提: 事前準備の数量項目が2行存在する').toHaveCount(2, {
        timeout: getTimeout(15000),
      });

      const firstMenu = await openItemActionMenu(page, itemRows.first());
      await expect(
        firstMenu.getByRole('menuitem', { name: /上へ移動/ }),
        'REQ-24.5: 最上位項目の「上へ移動」は無効化される'
      ).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(firstMenu, 'メニューが閉じる').not.toBeVisible({ timeout: getTimeout(10000) });

      const lastMenu = await openItemActionMenu(page, itemRows.last());
      await expect(
        lastMenu.getByRole('menuitem', { name: /下へ移動/ }),
        'REQ-24.6: 最下位項目の「下へ移動」は無効化される'
      ).toBeDisabled();
    });
  });

  test.describe('REQ-25.1, 25.5: 数量項目表示領域のスクロール', () => {
    /**
     * @requirement quantity-table-generation/REQ-25.1
     *
     * 水平スクロールの対象は数量項目テーブルのラッパー
     * （`item-table-scroll-{groupId}`、REQ-41 の実装）である。
     * 数量グループの一覧（`quantity-group-section`）は縦の並びを担うだけで
     * スクロール領域ではない。
     */
    test('数量項目テーブルの表示領域に水平スクロールが設定されている', async ({ page }) => {
      const groupCards = await openPreparedGroups(page);
      const tableWrapper = groupCards.first().locator('[data-testid^="item-table-scroll-"]');
      await expect(tableWrapper, '数量項目テーブルの表示領域が存在する').toHaveCount(1, {
        timeout: getTimeout(15000),
      });

      const overflowX = await tableWrapper.evaluate(
        (el: HTMLElement) => getComputedStyle(el).overflowX
      );
      expect(overflowX, 'REQ-25.1: 水平方向のスクロールが有効である').toBe('auto');
    });

    /**
     * @requirement quantity-table-generation/REQ-25.1
     * @requirement quantity-table-generation/REQ-25.5
     */
    test('ビューポートを狭くした場合に数量項目テーブルを横スクロールできる', async ({ page }) => {
      const groupCards = await openPreparedGroups(page);

      // 列幅の合計（1168px）を下回る幅にして、表示領域から溢れる状態を作る
      await page.setViewportSize({ width: 800, height: 600 });

      const tableWrapper = groupCards.first().locator('[data-testid^="item-table-scroll-"]');
      await expect(tableWrapper, '数量項目テーブルの表示領域が存在する').toHaveCount(1, {
        timeout: getTimeout(15000),
      });

      const overflowAmount = await tableWrapper.evaluate(
        (el: HTMLElement) => el.scrollWidth - el.clientWidth
      );
      expect(
        overflowAmount,
        'REQ-25.1: 表示領域の横幅を超えるため水平スクロールが必要な状態になる'
      ).toBeGreaterThan(0);

      // REQ-25.5: 水平方向にスクロールできる
      const scrolledTo = await tableWrapper.evaluate((el: HTMLElement) => {
        el.scrollLeft = el.scrollWidth - el.clientWidth;
        return el.scrollLeft;
      });
      expect(scrolledTo, 'REQ-25.5: 横方向にスクロールできる').toBeGreaterThan(0);
    });
  });

  test.describe('REQ-26.1, 26.9, 26.11: PDF出力', () => {
    /**
     * @requirement quantity-table-generation/REQ-26.1
     */
    test('PDF出力ボタンが表示される', async ({ page }) => {
      await openPreparedGroups(page);

      const pdfButton = page.getByRole('button', { name: /PDF出力/ });
      await expect(pdfButton, 'REQ-26.1: PDF出力ボタンが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement quantity-table-generation/REQ-26.1
     * @requirement quantity-table-generation/REQ-26.11
     */
    test('PDF出力ボタンクリックでPDFファイルがダウンロードされる', async ({ page }) => {
      assertPrepared(createdQuantityTableName, '事前準備で作成した数量表の名称');
      await openPreparedGroups(page);

      const pdfButton = page.getByRole('button', { name: /PDF出力/ });
      await expect(pdfButton, 'PDF出力ボタンが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(45000) });
      await pdfButton.click();
      const download = await downloadPromise;

      // REQ-26.11: ファイル名は「{数量表名}.pdf」
      expect(
        download.suggestedFilename(),
        'REQ-26.11: PDFファイル名が「{数量表名}.pdf」である'
      ).toBe(`${createdQuantityTableName}.pdf`);
    });

    /**
     * 受入基準 26.9 は除外である（e2e/requirement-exclusions.json）。ボタンの無効化は主張するが、処理中であることを示すインジケーターの表示を主張していないため、被覆印は掲げない。
     */
    test('PDF生成中にボタンが無効化される (REQ-26.9)', async ({ page }) => {
      await openPreparedGroups(page);

      const pdfButton = page.getByRole('button', { name: /PDF出力/ });
      await expect(pdfButton, 'PDF出力ボタンが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(45000) });
      await pdfButton.click();

      // REQ-26.9: 生成中は処理中であることを示し、重複操作を防止する。
      // 生成の完了（ダウンロード）を待つ前に、無効化されていることを主張する。
      await expect(pdfButton, 'REQ-26.9: PDF生成中はボタンが無効化される').toBeDisabled({
        timeout: getTimeout(10000),
      });

      // 生成の完了まで待ち、後続テストへ処理中の状態を持ち越さない
      await downloadPromise;
      await expect(pdfButton, 'PDF生成の完了でボタンが再び有効になる').toBeEnabled({
        timeout: getTimeout(45000),
      });
    });
  });
});
