/**
 * @fileoverview 必須フィールドが未入力のまま保存を試行したときのハイライトとエラーメッセージ E2E
 *
 * Task 100.8: REQ-5.3 の除外を取り下げ、条文を直接主張する判定を置く
 *
 * Requirements coverage (quantity-table-generation):
 * - @requirement quantity-table-generation/REQ-5.3: 必須フィールド（工種・名称・単位・計算方法・数量）が
 *   未入力で保存を試行したとき、該当フィールドをハイライトし、エラーメッセージを表示する
 *
 * ## なぜこのファイルが在るか（除外の取り下げ）
 *
 * 受入基準 5.3 は `e2e/requirement-exclusions.json` に「入力バリデーションはユニット/統合テストで
 * 検証」という理由で載っていた。**同じ台帳の中で 8.7 の書き換えがこの同一の文言を
 * 「それだけでは除外の根拠にならない」と断じており**、文面上の不整合が残っていた。
 * さらに台帳の `summary.note` には実測が記録されている——編集画面が描く
 * `frontend/src/components/quantity-table/EditableQuantityItemRow.tsx` は `showValidation` の
 * 既定が真であり（`frontend/src/components/quantity-table/QuantityGroupCard.tsx` は当該 props を
 * 渡さない）、工種・名称・単位の未入力に対して常時エラーを提示する。すなわち
 * **「E2E から観測できない」は 5.3 の除外の根拠として成り立たない**。
 *
 * 本ファイルは条文を直接主張する判定を置き、これをもって除外を取り下げる（作法は 83.1）。
 *
 * ## 既存の判定では足りなかった理由
 *
 * `e2e/specs/quantity-tables/quantity-table-crud.spec.ts` の
 * 「必須フィールド未入力時にエラーメッセージが表示される」は、名称欄を空にして焦点を外した
 * ときのエラーとハイライトを主張するが、**条文が定める契機である「保存の試行」を行っておらず、
 * 名称以外の必須フィールドにも触れていない**。同テストの docblock 自身がそう述べ、
 * 意図して被覆印を掲げていない。本ファイルはその二点を埋める——保存ボタンを押した後の状態を
 * 測り、条文が名指す5欄すべてを扱う。
 *
 * ## 条文が名指す5欄のうち、E2E で未入力を作れるのは3欄である
 *
 * 工種・名称・単位は空の状態を取りうるため、未入力のまま保存を試行して
 * ハイライト（`aria-invalid` と枠線の色）とエラーメッセージを主張する。
 *
 * 残る2欄は**入力欄の作りにより未入力の状態を取りえない**。この事実を散文の言い訳にせず、
 * 同じテストの中で主張する（取りえるようになれば赤くなる）。
 *
 * - **計算方法**: 空の選択肢を持たないドロップダウンであり、既定で `STANDARD` が選ばれている
 *   （`frontend/src/components/quantity-table/CalculationMethodSelect.tsx`）。
 * - **数量**: 空白は焦点喪失の時点で既定値 0 へ差し替えられ「0.00」と表示される
 *   （REQ-15.2。`EditableQuantityItemRow` の `handleQuantityBlur`）。
 *
 * ## 不在の主張が測定器の死で成立しないようにしていること
 *
 * - 空の選択肢が「無い」ことの主張には、**同じ測り方で選択肢そのものが読めている**ことを添える。
 * - 対照（必須欄を埋めた後）でエラーが「消える」ことの主張には、**同じ行・同じ欄が在り、
 *   入力値を保持している**ことを添える。
 * - 枠線の色によるハイライトの主張には、**同じ測り方で必須でない欄（備考）が別の色である**ことを
 *   添える。これが無いと「全欄が赤い画面」でも合格しうる。
 *
 * @module e2e/specs/quantity-tables/required-field-validation-e2e.spec
 */

import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import {
  addQuantityGroup,
  addQuantityItemRows,
  createTestProject,
  createTestQuantityTable,
  fillItemRequiredFields,
} from '../../helpers/quantity-table-preconditions';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { assertPrepared } from '../../helpers/preconditions';
import { API_BASE_URL } from '../../config';

// ============================================================================
// 定数
// ============================================================================

const RUN_ID = Date.now();

/** エラー時の枠線の色（AutocompleteInput の inputError が与える #dc2626） */
const ERROR_BORDER_COLOR = 'rgb(220, 38, 38)';

/** 対照で入力する値（保存が通ることまで確かめる） */
const FILLED_VALUES = { workType: '共通工事', name: '必須検証項目', unit: '式' } as const;

/** 未入力のまま保存を試行する3欄と、その欄が提示するエラーメッセージ・対照で入れる値 */
const REQUIRED_TEXT_FIELDS: ReadonlyArray<{ label: string; message: string; value: string }> = [
  { label: '工種', message: '工種は必須です', value: FILLED_VALUES.workType },
  { label: '名称', message: '名称は必須です', value: FILLED_VALUES.name },
  { label: '単位', message: '単位は必須です', value: FILLED_VALUES.unit },
];

// ============================================================================
// 前提の状態
// ============================================================================

let projectId: string | null = null;

// ============================================================================
// ヘルパー
// ============================================================================

/** ログイン済みページのアクセストークンを取り出す */
async function readAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('accessToken'));
  assertPrepared(token, 'アクセストークン');
  return token;
}

/** 管理者として削除の API を呼び、状態コードを返す */
async function deleteAsAdmin(browser: Browser, path: string): Promise<number> {
  const context = await browser.newContext();
  const adminPage = await context.newPage();
  try {
    await loginAsUser(adminPage, 'ADMIN_USER');
    const response = await adminPage.request.delete(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${await readAccessToken(adminPage)}` },
    });
    return response.status();
  } finally {
    await context.close();
  }
}

/** 行の中の入力欄（グループカードは可視ラベルを持たず aria-label で名乗る） */
function fieldOf(row: Locator, label: string): Locator {
  return row.getByLabel(label, { exact: true });
}

/** 欄が提示するエラーメッセージ（スクリーンリーダー向けの role="alert"） */
function messageOf(row: Locator, message: string): Locator {
  return row.getByRole('alert').filter({ hasText: message });
}

/** 欄が提示するエラーの可視の印（警告アイコン。アクセシブルネームはメッセージそのもの） */
function markerOf(row: Locator, message: string): Locator {
  return row.getByRole('img', { name: message, exact: true });
}

/** 要素の枠線の色を、本番が適用した計算済みスタイルから読む */
function borderColorOf(field: Locator): Promise<string> {
  return field.evaluate((element) => window.getComputedStyle(element).borderColor);
}

// ============================================================================
// テスト
// ============================================================================

test.describe('必須フィールド未入力のまま保存を試行したときの提示（Task 100.8）', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsUser(page, 'REGULAR_USER');
      projectId = await createTestProject(page, `T100_8_必須欄_${RUN_ID}`);
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    assertPrepared(projectId, '事前準備で作成したプロジェクトのID');
    const status = await deleteAsAdmin(browser, `/api/projects/${projectId}`);
    expect([200, 204, 404]).toContain(status);
  });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-5.3
   */
  test('必須フィールドが未入力のまま保存を試行すると該当欄がハイライトされエラーメッセージが提示される (quantity-table-generation/REQ-5.3)', async ({
    page,
  }) => {
    assertPrepared(projectId, '事前準備で作成したプロジェクトのID');
    await createTestQuantityTable(page, projectId, `T100_8_${RUN_ID}`);

    const groupCard = await addQuantityGroup(page);
    const itemRows = await addQuantityItemRows(groupCard, 1);
    const row = itemRows.first();

    // 前提: 条文が名指す必須フィールドのうち、空の状態を取りうる3欄が空である
    for (const { label } of REQUIRED_TEXT_FIELDS) {
      await expect(fieldOf(row, label), `前提: ${label}の欄が未入力である`).toHaveValue('');
    }

    // 条文の契機: 保存を試行する
    await page.getByRole('button', { name: '保存', exact: true }).click();

    // 条文の帰結(1): 該当フィールドをハイライトする
    for (const { label } of REQUIRED_TEXT_FIELDS) {
      await expect(
        fieldOf(row, label),
        `${label}の欄がエラーとしてハイライトされない`
      ).toHaveAttribute('aria-invalid', 'true');
    }

    // ハイライトは支援技術向けの属性だけでなく、画面上の枠線の色としても現れる。
    // 「全欄が赤い画面」でも合格することが無いよう、必須でない欄（備考）を同じ測り方の対照に置く。
    expect(await borderColorOf(fieldOf(row, '工種')), '工種の欄の枠線がエラー色にならない').toBe(
      ERROR_BORDER_COLOR
    );
    expect(
      await borderColorOf(fieldOf(row, '備考')),
      '対照: 必須でない備考の欄まで同じエラー色になっている'
    ).not.toBe(ERROR_BORDER_COLOR);

    // 条文の帰結(2): エラーメッセージを表示する
    for (const { message } of REQUIRED_TEXT_FIELDS) {
      await expect(messageOf(row, message), `「${message}」が提示されない`).toHaveCount(1);
      await expect(markerOf(row, message), `「${message}」の可視の印が出ない`).toBeVisible({
        timeout: getTimeout(10000),
      });
    }

    // 条文が名指す残る2欄は、入力欄の作りにより未入力の状態を取りえない。
    // 散文の言い訳にせず主張する——取りえるようになれば、この2つは赤くなる。
    const methodSelect = fieldOf(row, '計算方法');
    await expect(methodSelect, '計算方法は既定で「標準」が選ばれる').toHaveValue('STANDARD');
    await expect(
      methodSelect.locator('option'),
      '測定器の生死: 計算方法の選択肢そのものが読めている'
    ).not.toHaveCount(0);
    await expect(
      methodSelect.locator('option[value=""]'),
      '計算方法に未入力を表す空の選択肢がある'
    ).toHaveCount(0);

    const quantityField = fieldOf(row, '数量');
    await quantityField.fill('');
    await quantityField.blur();
    await expect(quantityField, '数量の空白が既定値へ差し替えられない（REQ-15.2）').toHaveValue(
      '0.00'
    );

    // 対照: 未入力を解消して同じ契機（保存の試行）を踏むと、ハイライトもメッセージも消える。
    // 「消えた」ことが行や欄の消滅で成立しないよう、同じ欄が入力値を保持していることを添える。
    await fillItemRequiredFields(row, FILLED_VALUES);
    await saveQuantityTableDraft(page);

    for (const { label, message, value } of REQUIRED_TEXT_FIELDS) {
      const field = fieldOf(row, label);
      await expect(field, `対照: ${label}の欄が入力値を保持していない（測定器の死）`).toHaveValue(
        value
      );
      await expect(
        field,
        `対照: 入力済みの${label}の欄がハイライトされたままである`
      ).toHaveAttribute('aria-invalid', 'false');
      await expect(
        messageOf(row, message),
        `対照: 入力済みでも「${message}」が提示されたままである`
      ).toHaveCount(0);
    }
    expect(
      await borderColorOf(fieldOf(row, '工種')),
      '対照: 入力済みの工種の欄の枠線がエラー色のままである'
    ).not.toBe(ERROR_BORDER_COLOR);
  });
});
