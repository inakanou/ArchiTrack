/**
 * @fileoverview フィールド仕様のE2Eテスト
 *
 * Task 13.4: フィールド仕様のE2Eテストを実装する
 *
 * Task 115.126 (site-survey): 前提の用意と後段の判定を、表示条件（`if (await x.isVisible())`）で
 * 包まずに無条件で行う形へ改めた。前提（数量表・数量グループ・数量項目行）は
 * `openEditPageWithSingleItemRow` が用意し、計算方法の設定は `setCalculationMethod` が
 * 成立まで主張する。いずれも崩れた時点で失敗する。各欄は行スコープで取得する。
 *
 * ## Requirements coverage（実際に判定している内容のみを挙げる）
 *
 * 対象spec: quantity-table-generation
 *
 * - REQ-9: 調整係数（面積・体積選択時に表示）
 *   - 9.1: 調整係数フィールドが既定値「1.00」で表示される
 *   - 9.3（一部）: 範囲の境界値（9.99 / -9.99）がそのまま保持される
 *   - 9.4: 空白が入力されると「1.00」が自動設定される
 *   - 9.8: 標準計算時は調整係数フィールドを表示しない
 * - REQ-10: 丸め設定（面積・体積選択時に表示）
 *   - 10.1: 丸め設定フィールドが既定値「0.01」で表示される
 *   - 10.3（一部）: 範囲の境界値（99.99 / -99.99）がそのまま保持される
 *   - 10.4: 0または空白が入力されると「0.01」が自動設定される
 *   - 10.8: 標準計算時は丸め設定フィールドを表示しない
 * - REQ-13: テキストフィールドの入力制御
 *   - 13.1（一部）: 大項目は上限ちょうど（全角25文字/幅50）を受け付け、上限超過（全角26文字/幅52）の
 *     入力は受け付けず直前の確定値のままとなる。判定しているのは大項目のみで、
 *     REQ-13.1 が同じ上限を課す中項目・小項目・任意分類・名称・規格・計算方法・備考は
 *     本ファイルでは判定していない
 *   - 13.2: 工種は上限ちょうど（全角8文字/幅16）を受け付け、上限超過（全角9文字/幅18）の
 *     入力は受け付けず直前の確定値のままとなる
 *   - 13.3: 単位は上限ちょうど（全角3文字/幅6）を受け付け、上限超過（全角4文字/幅8）の
 *     入力は受け付けず直前の確定値のままとなる
 * - REQ-14: 数値フィールドの表示書式
 *   - 14.2: 調整係数・丸め設定・数量を小数2桁で表示する
 *   - 14.3: 寸法フィールドは数値入力時に小数2桁で表示する
 *   - 14.4: 寸法フィールドが空白の場合は空白のまま表示する
 * - REQ-15: 数量フィールドの入力制御
 *   - 15.1（一部）: 範囲の境界値（9999999.99 / -999999.99）がそのまま保持される
 *   - 15.2: 空白が入力されると「0」が設定され「0.00」と表示される
 *   - 15.3: 寸法フィールドは境界値（0.01 / 9999999.99）がそのまま保持される
 *
 * ## 未検証（本ファイルでは主張していない）
 *
 * - REQ-9.3 / REQ-10.3 / REQ-15.1 の「範囲外の値が入力された場合のエラーメッセージ表示」。
 *   production 側（CalculationFields.tsx の AdjustmentField、および
 *   EditableQuantityItemRow.tsx の数量欄）に範囲検査が無く、既定値の補完と小数2桁の整形しか
 *   行わない。値の制限もエラー表示も画面に現れないため観測できる結果が無い。
 *   恒真の判定（「制限されている または エラーが出ている」）を置くことは禁止されているため、
 *   判定を置かずここに未検証として記す。実装は別タスクとして起票する。
 * - REQ-13.1 / 13.2 / 13.3 の入力防止のうち、日本語入力（IME）の変換中から確定に至る経路。
 *   実装（AutocompleteInput）は変換中の幅判定を行わず compositionend の確定値で判定するが、
 *   Playwright の `fill()` は変換イベントを発生させないため、本ファイルの判定は
 *   確定入力の経路のみを通る。変換経路は単体テスト側の担当であり、ここでは主張しない。
 * - REQ-13.4（左寄せ）、REQ-14.1 / 14.5（右寄せ）、REQ-14.6 / 14.7 および
 *   REQ-15.4 / 15.5（箇所数フィールド）。本ファイルの対象外。
 *
 * Task 115.131 (site-survey): 13.2（工種）/ 13.3（単位）へ 13.1 と同型の「上限超過の入力を
 * 受け付けない」判定を足し、被覆表記を実際の判定内容へ揃えた。上限は欄ごとの仕様
 * （`FIELD_CONSTRAINTS`）から `AutocompleteInput` が決めるため、大項目と同じ機序が
 * 工種・単位にも働く。あわせて検証名「文字数超過時にエラーメッセージが表示される」を、
 * 中身（入力拒否で直前値が保たれる）に合う名前へ改めた。
 *
 * Task 115.127 段1: 前提の生成を共通の補助へ寄せ、`test.skip(!testProjectId, …)` 21 件を除いた。
 * 各テストが実際に必要とするのは数量表IDであり、`openEditPageWithSingleItemRow` が無条件に主張する。
 *
 * @module e2e/specs/quantity-tables/field-specification.spec
 */

import { test, expect, type Locator } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { assertPrepared } from '../../helpers/preconditions';
import {
  createTestProject,
  createTestQuantityTable,
  openEditPageWithSingleItemRow,
} from '../../helpers/quantity-table-preconditions';

/**
 * 計算方法の選択肢（`CalculationMethodSelect` の option 値）
 */
type CalculationMethodValue = 'STANDARD' | 'AREA_VOLUME' | 'PITCH' | 'COUNT';

/**
 * 数量項目行の計算方法を指定の値に設定し、設定が成立したことまで主張する。
 *
 * `selectFirstRealOption`（Task 115.92）は先頭の実在候補を選ぶ補助であり、
 * 特定の計算方法を指定する必要がある本ファイルでは転用できない。そのため、
 * 「選択欄の表示・指定した選択肢の実在・選択の成立」を無条件に主張する形を本補助に置く。
 *
 * @param row 対象の数量項目行
 * @param method 設定する計算方法
 * @throws 選択欄が表示されない・指定の選択肢が無い・選択が成立しない場合
 */
async function setCalculationMethod(row: Locator, method: CalculationMethodValue): Promise<void> {
  const select = row.getByLabel('計算方法');

  await expect(select, '計算方法の選択欄が表示される').toBeVisible({ timeout: getTimeout(10000) });
  await expect(
    select.locator(`option[value="${method}"]`),
    `計算方法の選択肢に「${method}」が存在する`
  ).toHaveCount(1);

  await select.selectOption(method);
  await expect(select, `計算方法が「${method}」に設定されている`).toHaveValue(method);
}

/**
 * フィールド仕様のE2Eテスト
 */
test.describe('フィールド仕様', () => {
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
   */
  test.describe('事前準備', () => {
    test('テスト用プロジェクトと数量表を作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // Task 115.127 段1: 前提の生成は共通の補助へ寄せる。作れなければ補助の内側で失敗する
      testProjectId = await createTestProject(page, 'フィールド仕様テスト');
      const quantityTable = await createTestQuantityTable(
        page,
        testProjectId,
        'フィールドテスト数量表'
      );
      createdQuantityTableId = quantityTable.id;
    });
  });

  /**
   * REQ-13: テキストフィールドの文字数制限テスト
   */
  test.describe('REQ-13: テキストフィールドの文字数制限', () => {
    test('13.1: 大項目フィールドに全角25文字まで入力できる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 大項目フィールドを取得する。画面全体ではなく行スコープで取得する
      const majorCategoryInput = row.getByLabel('大項目', { exact: true });
      await expect(majorCategoryInput, '大項目フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // REQ-13.1: 上限ちょうど（全角25文字＝幅50）は受け付けられる
      const validText = '漢'.repeat(25); // 幅50
      await majorCategoryInput.fill(validText);
      await expect(majorCategoryInput, '全角25文字はそのまま保持される').toHaveValue(validText);

      // 上限を超えた場合の挙動（入力の拒否）は
      // 「13.1: 大項目フィールドは上限を超える入力を受け付けず直前の確定値が保たれる」で検証する。
      // REQ-13.1 は「超える入力を防止する」であってエラーメッセージの表示を求めておらず、
      // 実装（AutocompleteInput）も文字数のエラーメッセージを持たない。ここで
      // 「エラーが表示されていない」を主張しても存在しない要素の不在を見るだけで何も確かめられない。
    });

    test('13.2: 工種フィールドは全角8文字までを受け付け、超える入力を受け付けない', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 工種フィールドを取得する。画面全体ではなく行スコープで取得する
      const workTypeInput = row.getByLabel('工種', { exact: true });
      await expect(workTypeInput, '工種フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // REQ-13.2: 上限ちょうど（全角8文字＝幅16）は受け付けられる
      const validText = '漢'.repeat(8); // 幅16
      await workTypeInput.fill(validText);
      await expect(workTypeInput, '全角8文字はそのまま保持される').toHaveValue(validText);

      // REQ-13.2: 上限を超える入力（全角9文字＝幅18）は防止される。13.1（大項目）と同型であり、
      // 実装（AutocompleteInput.handleInputChange）は上限超過の値を親へ通知せず、
      // controlled input の表示が直前の確定値へ戻る。上限は欄ごとの仕様
      // （FIELD_CONSTRAINTS.workType = 全角8文字/半角16文字）から決まる。
      // エラーメッセージは持たない仕様のため、観測できる結果は
      // 「値が直前の確定値のままであること」ただ一つである。
      const overLimitText = '漢'.repeat(9); // 幅18
      await workTypeInput.fill(overLimitText);
      await workTypeInput.blur();

      await expect(
        workTypeInput,
        '上限を超える入力は受け付けられず直前の全角8文字が保たれる'
      ).toHaveValue(validText);
    });

    test('13.3: 単位フィールドは全角3文字までを受け付け、超える入力を受け付けない', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 単位フィールドを取得する。画面全体ではなく行スコープで取得する
      const unitInput = row.getByLabel('単位', { exact: true });
      await expect(unitInput, '単位フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // REQ-13.3: 上限ちょうど（全角3文字＝幅6）は受け付けられる
      const validText = '平米台'; // 幅6
      await unitInput.fill(validText);
      await expect(unitInput, '全角3文字はそのまま保持される').toHaveValue(validText);

      // REQ-13.3: 上限を超える入力（全角4文字＝幅8）は防止される。13.1（大項目）と同型であり、
      // 実装（AutocompleteInput.handleInputChange）は上限超過の値を親へ通知せず、
      // controlled input の表示が直前の確定値へ戻る。上限は欄ごとの仕様
      // （FIELD_CONSTRAINTS.unit = 全角3文字/半角6文字）から決まる。
      // エラーメッセージは持たない仕様のため、観測できる結果は
      // 「値が直前の確定値のままであること」ただ一つである。
      const overLimitText = '平米台数'; // 幅8
      await unitInput.fill(overLimitText);
      await unitInput.blur();

      await expect(
        unitInput,
        '上限を超える入力は受け付けられず直前の全角3文字が保たれる'
      ).toHaveValue(validText);
    });

    test('13.1: 大項目フィールドは上限を超える入力を受け付けず直前の確定値が保たれる', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      const majorCategoryInput = row.getByLabel('大項目', { exact: true });
      await expect(majorCategoryInput, '大項目フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // 先に上限ちょうど（全角25文字＝幅50）を入れて受理されることを確かめる。
      // これが無いと「どんな入力も受け付けない実装」でも超過拒否の判定が通ってしまう
      const validText = '漢'.repeat(25); // 幅50
      await majorCategoryInput.fill(validText);
      await expect(majorCategoryInput, '全角25文字は受け付けられる').toHaveValue(validText);

      // REQ-13.1: 上限を超える入力（全角26文字＝幅52）は防止される。
      // 実装（AutocompleteInput.handleInputChange）は上限超過の値を親へ通知せず、
      // controlled input の表示が直前の確定値へ戻る。エラーメッセージは持たない仕様のため、
      // 観測できる結果は「値が直前の確定値のままであること」ただ一つである。
      const invalidText = '漢'.repeat(26); // 幅52
      await majorCategoryInput.fill(invalidText);
      await majorCategoryInput.blur();

      await expect(
        majorCategoryInput,
        '上限を超える入力は受け付けられず直前の全角25文字が保たれる'
      ).toHaveValue(validText);
    });
  });

  /**
   * REQ-14: 数値フィールドの表示書式テスト
   * 注: 調整係数・丸め設定は面積・体積/ピッチ選択時のみ表示される
   */
  test.describe('REQ-14: 数値フィールドの表示書式', () => {
    test('14.2: 調整係数が小数2桁で表示される（面積・体積選択時）', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 計算方法を「面積・体積」に変更（調整係数を表示するため）
      await setCalculationMethod(row, 'AREA_VOLUME');

      // 調整係数フィールドを取得
      const adjustmentFactorInput = row.getByLabel('調整係数');
      await expect(adjustmentFactorInput, '調整係数フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // 整数を入力（既定値 1.00 と異なる値を使い、整形が実際に働くことを確かめる）
      await adjustmentFactorInput.fill('2');
      await adjustmentFactorInput.blur();

      // 小数2桁で表示されることを確認
      await expect(adjustmentFactorInput).toHaveValue('2.00');
    });

    test('14.2: 丸め設定が小数2桁で表示される（面積・体積選択時）', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 計算方法を「面積・体積」に変更（丸め設定を表示するため）
      await setCalculationMethod(row, 'AREA_VOLUME');

      // 丸め設定フィールドを取得
      const roundingUnitInput = row.getByLabel('丸め設定');
      await expect(roundingUnitInput, '丸め設定フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // 小数1桁を入力
      await roundingUnitInput.fill('0.5');
      await roundingUnitInput.blur();

      // 小数2桁で表示されることを確認
      await expect(roundingUnitInput).toHaveValue('0.50');
    });

    test('14.2: 数量フィールドが小数2桁で表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 数量フィールドを取得する。画面全体ではなく行スコープで取得する
      const quantityInput = row.getByLabel('数量', { exact: true });
      await expect(quantityInput, '数量フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // 既定値「0.00」と衝突しない整数を入力する（既定値のままだと整形の有無を区別できない）
      await quantityInput.fill('100');
      await quantityInput.blur();

      // REQ-14.2: 小数2桁で表示されることを確認
      await expect(quantityInput, '数量は小数2桁で表示される').toHaveValue('100.00');
    });

    test('14.3: 寸法フィールドに数値を入力すると小数2桁で表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 計算方法を「面積・体積」に変更
      await setCalculationMethod(row, 'AREA_VOLUME');

      // 幅フィールドを取得
      const widthInput = row.getByLabel('幅（W）');
      await expect(widthInput, '幅（W）フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // 整数を入力
      await widthInput.fill('5');
      await widthInput.blur();

      // 小数2桁で表示されることを確認
      await expect(widthInput).toHaveValue('5.00');
    });

    test('14.4: 寸法フィールドが空白の場合は空白のまま表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 計算方法を「面積・体積」に変更
      await setCalculationMethod(row, 'AREA_VOLUME');

      // 奥行きフィールドを取得
      const depthInput = row.getByLabel('奥行き（D）');
      await expect(depthInput, '奥行き（D）フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // いったん値を入力し、小数2桁の整形が働く状態にする（REQ-14.3）。
      // 既定の空欄のまま判定すると「整形が一切働かない実装」でも通ってしまうため。
      await depthInput.fill('3');
      await depthInput.blur();
      await expect(depthInput).toHaveValue('3.00');

      // 空白を入力
      await depthInput.fill('');
      await depthInput.blur();

      // 空白のまま表示されることを確認（0.00ではない）
      await expect(depthInput).toHaveValue('');
    });
  });

  /**
   * REQ-15: 数量フィールドの入力制御テスト
   */
  test.describe('REQ-15: 数量フィールドの入力制御', () => {
    test('15.1: 数量は-999999.99〜9999999.99の範囲で入力できる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 数量フィールドを取得する。画面全体ではなく行スコープで取得する
      const quantityInput = row.getByLabel('数量', { exact: true });
      await expect(quantityInput, '数量フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // REQ-15.1: 範囲の上限（9999999.99）はそのまま保持される
      await quantityInput.fill('9999999.99');
      await quantityInput.blur();
      await expect(quantityInput, '上限値がそのまま保持される').toHaveValue('9999999.99');

      // REQ-15.1: 範囲の下限（-999999.99）はそのまま保持される
      await quantityInput.fill('-999999.99');
      await quantityInput.blur();
      await expect(quantityInput, '下限値がそのまま保持される').toHaveValue('-999999.99');

      // 【未検証】範囲外の値（例: 10000000）を入力したときのエラー表示は主張していない。
      // REQ-15.1 は範囲外入力に対しエラーメッセージの表示を求めるが、実装
      // （EditableQuantityItemRow.handleQuantityBlur）は parseFloat と toFixed(2) を行うだけで
      // 範囲検査を持たず、frontend/src/utils/field-validation.ts の validateNumericRange も
      // 数量欄からは呼ばれていない。値の制限もエラー表示も画面に現れないため観測できる結果が無い。
      // 「値が制限されている または エラーが出ている」の形は常に真となり何も主張しないため置かない。
      // 範囲外エラーの実装は別タスクとして起票する。
    });

    test('15.2: 数量フィールドに空白が入力されると0.00が自動設定される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 数量フィールドを取得する。画面全体ではなく行スコープで取得する
      const quantityInput = row.getByLabel('数量', { exact: true });
      await expect(quantityInput, '数量フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // いったん既定値（0.00）以外にする。既定値のまま空欄にすると
      // 「空白時の自動設定が無い実装」でも 0.00 のままとなり判定が成立してしまう
      await quantityInput.fill('12');
      await quantityInput.blur();
      await expect(quantityInput, '入力値が小数2桁で保持される').toHaveValue('12.00');

      // REQ-15.2: 空白を入力すると0が自動設定され「0.00」と表示される
      await quantityInput.fill('');
      await quantityInput.blur();
      await expect(quantityInput, '空白入力時は0.00が自動設定される').toHaveValue('0.00');
    });

    test('15.3: 寸法フィールドは0.01〜9999999.99の範囲で入力できる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 計算方法を「面積・体積」に変更
      await setCalculationMethod(row, 'AREA_VOLUME');

      // 幅フィールドを取得
      const widthInput = row.getByLabel('幅（W）');
      await expect(widthInput, '幅（W）フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // 下限値を入力
      await widthInput.fill('0.01');
      await widthInput.blur();

      // 下限値がそのまま保持されることを確認
      await expect(widthInput).toHaveValue('0.01');

      // 上限値を入力
      await widthInput.fill('9999999.99');
      await widthInput.blur();

      // 上限値がそのまま保持されることを確認
      await expect(widthInput).toHaveValue('9999999.99');
    });
  });

  /**
   * REQ-9: 調整係数テスト
   * 調整係数は「面積・体積」または「ピッチ」選択時のみ表示される
   */
  test.describe('REQ-9: 調整係数', () => {
    test('9.8: 標準計算時は調整係数フィールドが表示されない (quantity-table-generation/REQ-9.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      const adjustmentFactorInput = row.getByLabel('調整係数');

      // 先に「面積・体積」で調整係数が表示されることを確かめる。
      // これが無いと「どの計算方法でも調整係数が存在しない実装」でも非表示の判定が通ってしまう
      await setCalculationMethod(row, 'AREA_VOLUME');
      await expect(
        adjustmentFactorInput,
        '面積・体積では調整係数フィールドが表示される'
      ).toBeVisible({ timeout: getTimeout(10000) });

      // 計算方法を「標準」に変更する
      await setCalculationMethod(row, 'STANDARD');

      // REQ-9.8: 標準計算時は調整係数フィールドが表示されない
      await expect(
        adjustmentFactorInput,
        '標準計算時は調整係数フィールドが表示されない'
      ).not.toBeVisible({ timeout: getTimeout(10000) });
    });

    test('9.1, 9.3: 面積・体積選択時に調整係数フィールドが表示され-9.99〜9.99の範囲で入力できる (quantity-table-generation/REQ-9.1, REQ-9.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 計算方法を「面積・体積」に変更
      await setCalculationMethod(row, 'AREA_VOLUME');

      // REQ-9.1: 調整係数フィールドが既定値「1.00」で表示される
      const adjustmentFactorInput = row.getByLabel('調整係数');
      await expect(adjustmentFactorInput, '調整係数フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(adjustmentFactorInput, '調整係数の既定値は1.00である').toHaveValue('1.00');

      // REQ-9.3: 上限の有効な値を入力
      await adjustmentFactorInput.fill('9.99');
      await adjustmentFactorInput.blur();

      // 小数2桁で表示されることを確認
      await expect(adjustmentFactorInput).toHaveValue('9.99');

      // REQ-9.3: 下限の有効な値を入力
      await adjustmentFactorInput.fill('-9.99');
      await adjustmentFactorInput.blur();

      await expect(adjustmentFactorInput).toHaveValue('-9.99');
    });

    test('9.4: 調整係数が空白時は1.00が自動設定される (quantity-table-generation/REQ-9.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 計算方法を「面積・体積」に変更（調整係数を表示するため）
      await setCalculationMethod(row, 'AREA_VOLUME');

      // 調整係数フィールドを取得
      const adjustmentFactorInput = row.getByLabel('調整係数');
      await expect(adjustmentFactorInput, '調整係数フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // いったん既定値以外の値にする。既定値のまま空白にすると、
      // 「空白時の自動設定が無い実装」でも1.00のままとなり判定が成立してしまう
      await adjustmentFactorInput.fill('2');
      await adjustmentFactorInput.blur();
      await expect(adjustmentFactorInput).toHaveValue('2.00');

      // 空白を入力
      await adjustmentFactorInput.fill('');
      await adjustmentFactorInput.blur();

      // 1.00が自動設定されることを確認
      await expect(adjustmentFactorInput).toHaveValue('1.00');
    });
  });

  /**
   * REQ-10: 丸め設定テスト
   * 丸め設定は「面積・体積」または「ピッチ」選択時のみ表示される
   */
  test.describe('REQ-10: 丸め設定', () => {
    test('10.8: 標準計算時は丸め設定フィールドが表示されない (quantity-table-generation/REQ-10.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      const roundingUnitInput = row.getByLabel('丸め設定');

      // 先に「面積・体積」で丸め設定が表示されることを確かめる。
      // これが無いと「どの計算方法でも丸め設定が存在しない実装」でも非表示の判定が通ってしまう
      await setCalculationMethod(row, 'AREA_VOLUME');
      await expect(roundingUnitInput, '面積・体積では丸め設定フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // 計算方法を「標準」に変更する
      await setCalculationMethod(row, 'STANDARD');

      // REQ-10.8: 標準計算時は丸め設定フィールドが表示されない
      await expect(
        roundingUnitInput,
        '標準計算時は丸め設定フィールドが表示されない'
      ).not.toBeVisible({ timeout: getTimeout(10000) });
    });

    test('10.1, 10.3: 面積・体積選択時に丸め設定フィールドが表示され-99.99〜99.99の範囲で入力できる (quantity-table-generation/REQ-10.1, REQ-10.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 計算方法を「面積・体積」に変更
      await setCalculationMethod(row, 'AREA_VOLUME');

      // REQ-10.1: 丸め設定フィールドが既定値「0.01」で表示される
      const roundingUnitInput = row.getByLabel('丸め設定');
      await expect(roundingUnitInput, '丸め設定フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(roundingUnitInput, '丸め設定の既定値は0.01である').toHaveValue('0.01');

      // REQ-10.3: 上限の有効な値を入力
      await roundingUnitInput.fill('99.99');
      await roundingUnitInput.blur();

      // 小数2桁で表示されることを確認
      await expect(roundingUnitInput).toHaveValue('99.99');

      // REQ-10.3: 下限の有効な値を入力
      await roundingUnitInput.fill('-99.99');
      await roundingUnitInput.blur();

      await expect(roundingUnitInput).toHaveValue('-99.99');
    });

    test('10.4: 丸め設定が空白時は0.01が自動設定される (quantity-table-generation/REQ-10.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 計算方法を「面積・体積」に変更（丸め設定を表示するため）
      await setCalculationMethod(row, 'AREA_VOLUME');

      // 丸め設定フィールドを取得
      const roundingUnitInput = row.getByLabel('丸め設定');
      await expect(roundingUnitInput, '丸め設定フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // いったん既定値以外の値にする。既定値のまま空白にすると、
      // 「空白時の自動設定が無い実装」でも0.01のままとなり判定が成立してしまう
      await roundingUnitInput.fill('5');
      await roundingUnitInput.blur();
      await expect(roundingUnitInput).toHaveValue('5.00');

      // 空白を入力
      await roundingUnitInput.fill('');
      await roundingUnitInput.blur();

      // 0.01が自動設定されることを確認
      await expect(roundingUnitInput).toHaveValue('0.01');
    });

    test('10.4: 丸め設定が0の時は0.01が自動設定される (quantity-table-generation/REQ-10.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 計算方法を「面積・体積」に変更（丸め設定を表示するため）
      await setCalculationMethod(row, 'AREA_VOLUME');

      // 丸め設定フィールドを取得
      const roundingUnitInput = row.getByLabel('丸め設定');
      await expect(roundingUnitInput, '丸め設定フィールドが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // いったん既定値以外の値にする。既定値のまま0を入力すると、
      // 「0の自動設定が無い実装」でも0.01のままとなり判定が成立してしまう
      await roundingUnitInput.fill('5');
      await roundingUnitInput.blur();
      await expect(roundingUnitInput).toHaveValue('5.00');

      // 0を入力
      await roundingUnitInput.fill('0');
      await roundingUnitInput.blur();

      // 0.01が自動設定されることを確認
      await expect(roundingUnitInput).toHaveValue('0.01');
    });
  });

  /**
   * クリーンアップ: テストデータを削除
   */
  test.describe('クリーンアップ', () => {
    test('テスト用プロジェクトを削除する', async ({ page }) => {
      assertPrepared(testProjectId, '事前準備で作成したプロジェクトのID');

      await loginAsUser(page, 'ADMIN_USER');
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 削除ボタンをクリック
      const deleteButton = page.getByRole('button', { name: /削除/i }).first();
      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        // 確認ダイアログが表示されるのを待つ
        const dialog = page.getByRole('dialog');
        const dialogVisible = await dialog
          .waitFor({ state: 'visible', timeout: getTimeout(5000) })
          .then(() => true)
          .catch(() => false);

        if (dialogVisible) {
          // 確認ダイアログ内の削除確定ボタンをクリック
          const confirmButton = dialog.getByRole('button', { name: /^削除$/i });

          // APIレスポンスを待ちながら削除ボタンをクリック
          const deletePromise = page.waitForResponse(
            (response) =>
              response.url().includes(`/api/projects/${testProjectId}`) &&
              response.request().method() === 'DELETE',
            { timeout: getTimeout(15000) }
          );

          await confirmButton.click();
          await deletePromise.catch(() => {});

          // 一覧画面に遷移するのを待つ
          await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) }).catch(() => {});
        }
      }
    });
  });
});
