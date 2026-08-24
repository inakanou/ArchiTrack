/**
 * @fileoverview 名称・備考フィールドのオートコンプリートE2Eテスト
 *
 * Task 27.2: 名称・備考オートコンプリートのE2Eテストを実装する
 *
 * 対象要件: Requirement 7「入力支援・オートコンプリート」
 * Requirements coverage (quantity-table-generation):
 * - REQ-7.2: 候補値の取得APIをテキスト入力中に発行しない
 * - REQ-7.3: 対象フィールドの焦点獲得時に候補をドロップダウン表示する（空欄なら全候補）
 * - REQ-7.4: 候補が選択されると該当フィールドへ自動入力する
 * - REQ-7.5: blur 時に入力値を確定値として候補値リストへ追加する
 * - REQ-7.6: blur 時の候補値リスト更新でAPIリクエストを発行しない
 *
 * ## 本ファイルが判定していないもの（Task 115.134）
 *
 * - REQ-7.1（初回表示時の一括取得）と REQ-7.7（50音順）: 本ファイルは名称・備考を軸に
 *   した確認であり、いずれも `autocomplete-optimization.spec.ts` が判定している。
 *   以前はこの2件を coverage に掲げていたが、対応する主張は本ファイルに無かった。
 * - REQ-7.3 の「値が入力されている場合は前方一致でフィルタリング」: 本ファイルは
 *   空欄への焦点獲得（全候補表示）だけを判定する。値ありの経路は
 *   `autocomplete-optimization.spec.ts` が判定している。
 *
 * Task 115.127 段1: 前提の生成を共通の補助（`quantity-table-preconditions`）へ寄せ、
 * `test.skip(!testProjectId, …)` 7 件を `assertPrepared` へ改めた。
 * 併せて「数量表IDがあれば編集画面、無ければプロジェクト詳細」の分岐を除いた（前提は必ず在る）。
 *
 * Task 115.134: 観測条件（クリーンアップの `if (await isVisibleWithin(...))` 2箇所）を除き、
 * セレクタ自身が `[role="combobox"]` で絞ったうえで同じ属性を主張していた恒真を解いた。
 * 併せて、テスト名が名乗る挙動（候補のドロップダウン表示・フィルタリング）と実際の
 * 主張の食い違いを解消した。
 *
 * @module e2e/specs/quantity-tables/name-remarks-autocomplete.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { assertPrepared } from '../../helpers/preconditions';
import {
  addQuantityGroup,
  addQuantityItemRows,
  createTestProject,
  createTestQuantityTable,
  openEditPageWithSingleItemRow,
  openQuantityTableEdit,
} from '../../helpers/quantity-table-preconditions';

/**
 * 名称・備考フィールドのオートコンプリートE2Eテスト
 */
/** REQ-7.5 で候補値リストへ登録し、REQ-7.3/7.4 で選び直す名称の確定値 */
const REGISTERED_NAME = 'テスト名称';

/** REQ-7.5 で候補値リストへ登録し、REQ-7.3 で候補として現れることを確かめる備考の確定値 */
const REGISTERED_REMARKS = 'テスト備考';

test.describe('名称・備考フィールドのオートコンプリート', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストで作成したリソースのIDを保存
  let testProjectId: string | null = null;
  let createdQuantityTableId: string | null = null;

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  /**
   * 事前準備: テスト用プロジェクトと数量表を作成
   *
   * Task 115.127 段1: 前提の生成は共通の補助（`quantity-table-preconditions`）へ寄せる。
   * 作れなければ補助の内側で失敗するため、前提が崩れたまま後段へ進む経路が無い。
   */
  test.describe('事前準備', () => {
    test('テスト用プロジェクトと数量表を作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      testProjectId = await createTestProject(page, '名称備考ACテスト');
      const quantityTable = await createTestQuantityTable(
        page,
        testProjectId,
        '名称備考ACテスト数量表'
      );
      createdQuantityTableId = quantityTable.id;
    });
  });

  // ==========================================================================
  // REQ-7.3: 名称フィールドのオートコンプリート
  // ==========================================================================

  test.describe('REQ-7.3: 名称フィールドのオートコンプリート', () => {
    test('名称フィールドにフォーカスした際にオートコンプリート候補がドロップダウン表示される', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 数量表を作った直後の編集画面には数量グループも数量項目も無く、名称の入力欄は
      // そもそも描画されない。以前は「項目追加ボタンが見えたら押す」「名称欄が見えたら
      // 属性を確かめる」という観測で包まれており、欄が出なければ何も主張せず緑になった。
      // 前提（グループ・項目行）を無条件に作る。
      //
      // Task 115.134: 以前はテスト名が「候補がドロップダウン表示される」と名乗りながら、
      // 主張していたのは ARIA 属性だけで、一覧が出ることは一度も確かめていなかった。
      // 候補を登録する行と焦点を当てる行を分け、焦点獲得だけで一覧が開くことを主張する
      // （同じ行で blur してから焦点を戻すと `handleBlur` の 150ms 遅延クローズと競合する）。
      await openQuantityTableEdit(page, createdQuantityTableId);
      const groupCard = await addQuantityGroup(page);
      const itemRows = await addQuantityItemRows(groupCard, 2);

      // 名称フィールド。ロールは判定の対象なのでセレクタの条件に含めない
      // （`[role="combobox"]` で絞ってから role を主張するのは定義上必ず成立する）。
      const firstNameField = itemRows.nth(0).locator('input[id$="-name"]');
      await expect(firstNameField, '前提: 1行目の名称欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // REQ-7.3: 名称欄は候補をドロップダウン表示する欄として提示される
      await expect(firstNameField, 'REQ-7.3: 名称欄が combobox として提示されない').toHaveAttribute(
        'role',
        'combobox'
      );
      await expect(
        firstNameField,
        'REQ-7.3: 名称欄に aria-autocomplete="list" が無い'
      ).toHaveAttribute('aria-autocomplete', 'list');

      // REQ-7.5: 1行目の名称に確定値を入れ、blur で候補値リストへ追加する
      await firstNameField.fill(REGISTERED_NAME);
      await expect(firstNameField, '名称欄へ入力が反映される').toHaveValue(REGISTERED_NAME);
      await firstNameField.blur();
      await expect(firstNameField, 'blur で名称欄から焦点が外れる').not.toBeFocused();

      // REQ-7.3: 空の名称欄へ焦点が当たると全候補がドロップダウン表示される
      const secondNameField = itemRows.nth(1).locator('input[id$="-name"]');
      await expect(secondNameField, '前提: 2行目の名称欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(secondNameField, '前提: 2行目の名称欄は空である').toHaveValue('');
      await secondNameField.click();

      // 候補一覧は body 直下へ Portal で描画されるためページ配下で参照する
      const listbox = page.getByRole('listbox');
      await expect(listbox, 'REQ-7.3: 名称の候補一覧が表示される').toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(
        listbox.getByRole('option'),
        'REQ-7.3: 空欄への焦点獲得で全候補が表示される'
      ).toHaveText([REGISTERED_NAME]);
    });

    test('名称フィールドのテキスト入力中とblur時に補完のAPIリクエストを発行しない', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 以前は「名称欄が見えたら入力する」観測で包まれており、欄が描画されなければ
      // REQ-7.2 の判定が実行されなかった。前提（グループ1件・項目1行）を無条件に作る。
      //
      // Task 115.134: 以前のテスト名は「候補がフィルタリングされる」と名乗っていたが、
      // 主張していたのはAPIリクエストが無いことだけだった。名を主張に合わせ、
      // 併せて REQ-7.6（blur 時の更新もAPIを発行しない）まで監視の窓を広げた。
      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      const nameField = row.locator('input[id$="-name"]');
      await expect(nameField, '前提: 名称欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // 監視は入力の前に始める（初回表示の一括取得は既に完了している）。
      // REQ-7.2/7.6 が禁じるのはメソッドを問わない補完のAPIリクエストである。
      const apiCalls: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/autocomplete')) {
          apiCalls.push(request.url());
        }
      });

      await nameField.fill('テスト');
      await expect(nameField, '名称欄へ入力が反映される').toHaveValue('テスト');
      await nameField.fill('テスト追加');
      await expect(nameField, '名称欄へ追加入力が反映される').toHaveValue('テスト追加');

      // REQ-7.5: blur で確定値を候補値リストへ追加する
      await nameField.blur();
      await expect(nameField, 'blur で名称欄から焦点が外れる').not.toBeFocused();

      // REQ-7.2/7.6: 入力中も blur 時も補完のAPIリクエストを発行しない
      expect(
        apiCalls,
        'REQ-7.2/7.6: 入力中またはblur時に補完のAPIリクエストが発行された'
      ).toHaveLength(0);
    });
  });

  // ==========================================================================
  // REQ-7.3: 備考フィールドのオートコンプリート
  // ==========================================================================

  test.describe('REQ-7.3: 備考フィールドのオートコンプリート', () => {
    test('備考フィールドにフォーカスした際にオートコンプリート候補がドロップダウン表示される', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 名称欄と同じく、前提（グループ・項目行）を無条件に作ってから判定する。
      // 「備考欄が見えたら属性を確かめる」形では、欄が描画されない限り何も主張しない。
      await openQuantityTableEdit(page, createdQuantityTableId);
      const groupCard = await addQuantityGroup(page);
      const itemRows = await addQuantityItemRows(groupCard, 2);

      // 備考フィールド。ロールは判定の対象なのでセレクタの条件に含めない
      const firstRemarksField = itemRows.nth(0).locator('input[id$="-remarks"]');
      await expect(firstRemarksField, '前提: 1行目の備考欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // REQ-7.3: 備考欄は候補をドロップダウン表示する欄として提示される
      await expect(
        firstRemarksField,
        'REQ-7.3: 備考欄が combobox として提示されない'
      ).toHaveAttribute('role', 'combobox');
      await expect(
        firstRemarksField,
        'REQ-7.3: 備考欄に aria-autocomplete="list" が無い'
      ).toHaveAttribute('aria-autocomplete', 'list');

      // REQ-7.5: 1行目の備考に確定値を入れ、blur で候補値リストへ追加する
      await firstRemarksField.fill(REGISTERED_REMARKS);
      await expect(firstRemarksField, '備考欄へ入力が反映される').toHaveValue(REGISTERED_REMARKS);
      await firstRemarksField.blur();
      await expect(firstRemarksField, 'blur で備考欄から焦点が外れる').not.toBeFocused();

      // REQ-7.3: 空の備考欄へ焦点が当たると全候補がドロップダウン表示される
      const secondRemarksField = itemRows.nth(1).locator('input[id$="-remarks"]');
      await expect(secondRemarksField, '前提: 2行目の備考欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(secondRemarksField, '前提: 2行目の備考欄は空である').toHaveValue('');
      await secondRemarksField.click();

      const listbox = page.getByRole('listbox');
      await expect(listbox, 'REQ-7.3: 備考の候補一覧が表示される').toBeVisible({
        timeout: getTimeout(5000),
      });
      await expect(
        listbox.getByRole('option'),
        'REQ-7.3: 空欄への焦点獲得で全候補が表示される'
      ).toHaveText([REGISTERED_REMARKS]);
    });
  });

  // ==========================================================================
  // REQ-7.4: 名称フィールドで候補を選択すると値が自動入力される
  // ==========================================================================

  test.describe('REQ-7.4: 候補選択時の自動入力', () => {
    test('名称フィールドで候補を選択すると値が自動入力される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 数量表を作った直後の編集画面には数量グループも数量項目も無く、名称の入力欄は
      // そもそも描画されない。「表示されていれば」で探す形では検証が丸ごと飛ぶため、
      // 前提（グループ1件・項目2行）を作ってから判定する。
      await openQuantityTableEdit(page, createdQuantityTableId);
      const groupCard = await addQuantityGroup(page);
      const itemRows = await addQuantityItemRows(groupCard, 2);

      // REQ-7.5: 1行目の名称に確定値を入れ、blur で候補値リストへ追加する
      const firstNameField = itemRows.nth(0).getByRole('combobox', { name: '名称', exact: true });
      await expect(firstNameField, '1行目の名称の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });
      await firstNameField.fill(REGISTERED_NAME);
      await expect(firstNameField).toHaveValue(REGISTERED_NAME);
      await firstNameField.blur();
      await expect(firstNameField, 'blur で名称の入力欄から焦点が外れる').not.toBeFocused();

      // REQ-7.3: 2行目の空欄へフォーカスすると候補一覧が表示される
      const secondNameField = itemRows.nth(1).getByRole('combobox', { name: '名称', exact: true });
      await expect(secondNameField, '2行目の名称の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });
      await secondNameField.click();

      // 候補一覧は body 直下へ Portal で描画されるためページ配下で参照する
      const listbox = page.getByRole('listbox');
      await expect(listbox, 'REQ-7.3: 名称の候補一覧が表示される').toBeVisible({
        timeout: getTimeout(5000),
      });

      const option = listbox.getByRole('option', { name: REGISTERED_NAME, exact: true });
      await expect(option, 'REQ-7.5: blurで追加した名称が候補に現れる').toBeVisible({
        timeout: getTimeout(5000),
      });
      await option.click();

      // REQ-7.4: 選択した候補が該当フィールドへ自動入力される
      await expect(secondNameField, 'REQ-7.4: 選択した候補が自動入力される').toHaveValue(
        REGISTERED_NAME
      );
    });
  });

  // ==========================================================================
  // REQ-7.3: 対象9フィールドが一貫して補完付きの入力欄として提示される
  // ==========================================================================

  test.describe('REQ-7.3: 全9フィールドのオートコンプリート一貫性', () => {
    test('対象9フィールドが一貫して補完付きの入力欄として提示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 対象フィールドは数量項目の行にしか存在しないため、前提として1行用意する。
      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // REQ-7.3 が列挙する対象9フィールドのID末尾
      const autocompleteFieldSuffixes = [
        'majorCategory', // 大項目
        'middleCategory', // 中項目
        'minorCategory', // 小項目
        'customCategory', // 任意分類
        'workType', // 工種
        'name', // 名称
        'specification', // 規格
        'unit', // 単位
        'remarks', // 備考
      ];

      for (const suffix of autocompleteFieldSuffixes) {
        // Task 115.134: 以前はセレクタ自身が `[role="combobox"]` で絞ったうえで
        // `role` が `combobox` であることを主張していた。定義上必ず成立する恒真であり、
        // 補完が外れて素のテキスト入力になっても検出できなかった。
        // 参照も画面全体（`page.locator(...).first()`）ではなく行スコープへ改める。
        const field = row.locator(`input[id$="-${suffix}"]`);
        await expect(field, `前提: ${suffix} の入力欄が表示される`).toBeVisible({
          timeout: getTimeout(10000),
        });

        // REQ-7.3: 対象9フィールドはいずれも候補をドロップダウン表示する欄として提示される
        await expect(field, `REQ-7.3: ${suffix} が combobox として提示されない`).toHaveAttribute(
          'role',
          'combobox'
        );
        await expect(
          field,
          `REQ-7.3: ${suffix} に aria-autocomplete="list" が無い`
        ).toHaveAttribute('aria-autocomplete', 'list');
      }
    });
  });

  // ==========================================================================
  // クリーンアップ
  // ==========================================================================

  test.describe('クリーンアップ', () => {
    test('テスト用プロジェクトを削除する', async ({ page }) => {
      assertPrepared(testProjectId, '事前準備で作成したプロジェクトのID');

      // Task 115.134: 以前は「削除ボタンが見えたら押す」「確認ボタンが見えたら押す」の
      // 二重の観測で包まれていた。しかも一般ユーザーには `project:delete` 権限が無く
      // （backend `src/utils/seed-helpers.ts` の一般ユーザー権限に project:delete は無い）、
      // 確認ボタンの名前（/削除を確認|はい|OK/）も実際のダイアログ（「削除」）と合って
      // いなかったため、この経路は一度も削除に到達していなかった。
      // 管理者で入り、削除が成功したことを主張する。
      await loginAsUser(page, 'ADMIN_USER');
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const deleteButton = page.getByRole('button', { name: '削除', exact: true });
      await expect(deleteButton, '前提: プロジェクトの削除ボタンが表示される').toBeVisible({
        timeout: getTimeout(15000),
      });
      await deleteButton.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog, '前提: 削除確認ダイアログが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      const deletePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/projects/${testProjectId}`) &&
          response.request().method() === 'DELETE',
        { timeout: getTimeout(30000) }
      );
      await dialog.getByRole('button', { name: '削除', exact: true }).click();
      const deleteResponse = await deletePromise;
      expect(deleteResponse.status(), 'テスト用プロジェクトの削除が成功する').toBe(204);

      await expect(page, '削除後はプロジェクト一覧へ戻る').toHaveURL(/\/projects$/, {
        timeout: getTimeout(15000),
      });
    });
  });
});
