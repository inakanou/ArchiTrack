/**
 * @fileoverview 計算方法「箇所数」の計算・表示・入力検証 E2E テスト (REQ-47)
 *
 * Task 71.2: 計算方法「箇所数」の計算・表示・入力検証の E2E を実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - @requirement quantity-table-generation/REQ-47.1: 計算方法の選択肢に「箇所数」を含める
 * - @requirement quantity-table-generation/REQ-47.2: 箇所数→長さ→重量→調整係数→丸め設定の順で行内に水平表示する
 * - @requirement quantity-table-generation/REQ-47.3: 入力値をそのまま箇所数として用い、自動算出を行わない
 * - @requirement quantity-table-generation/REQ-47.4: 入力されている任意項目（長さ・重量）のみを乗算する
 * - @requirement quantity-table-generation/REQ-47.5: 任意項目がいずれも未入力なら箇所数そのものが計算結果になる
 * - @requirement quantity-table-generation/REQ-47.6: 計算結果に調整係数を乗算し、丸め設定の単位で切り上げる
 * - @requirement quantity-table-generation/REQ-47.7: 長さ・重量の乗算／調整係数／丸めの挙動がピッチと同一である
 * - @requirement quantity-table-generation/REQ-47.8: 箇所数は必須で 1〜9999999 の整数のみ受け付ける
 * - @requirement quantity-table-generation/REQ-47.9: 箇所数が未入力のまま保存を試行するとエラーを表示する
 * - @requirement quantity-table-generation/REQ-47.10: 小数・数値以外の入力を拒否しエラーを表示する
 * - @requirement quantity-table-generation/REQ-47.11: 範囲外（1〜9999999 外）の入力にエラーを表示する
 * - @requirement quantity-table-generation/REQ-47.12: 箇所数・長さ・重量・調整係数・丸め設定の変更で最終数量を自動再計算する
 * - @requirement quantity-table-generation/REQ-47.13: ピッチ→箇所数の切替でピッチ固有フィールドを非表示にする
 * - @requirement quantity-table-generation/REQ-47.14: 箇所数→他方式の切替で「箇所数」フィールドを非表示にする
 *
 * 設計参照:
 * - design.md「数量計算フロー（箇所数モード・REQ-47）」: 箇所数 → 長さ/重量の乗算 → 調整係数 → 切り上げ
 * - requirements.md「箇所数計算フィールド仕様」: フィールド順序（箇所数→長さ→重量→調整係数→丸め設定）
 *
 * 検証方針:
 * - 単体テスト（68.x）は「箇所数→長さ→重量」を順に入力して最後に数量を assert する構成のため、
 *   「長さ」単独変更による再計算（REQ-47.12）の欠落を検出できない（tasks.md Implementation Notes 70.2(b)）。
 *   本 spec は「長さ・重量なし」「長さのみ」「長さ＋重量」の各段階で数量を明示的に assert する。
 * - 入力拒否（REQ-47.10/47.11）は blur 時に onChange を呼ばない実装で表現されている（同 68.2）。
 *   そのためエラー表示・不正テキストの残留・数量が更新されないことの3点を検証する。
 * - 保存試行時の必須エラー（REQ-47.9）は QuantityTableEditPage.handleSave の保存前チェック経路
 *   （同 68.7）で発火する。エラー表示に加え、保存 API（PUT /:id/save）が送信されないことを検証する。
 *
 * @module e2e/specs/quantity-tables/quantity-count-calculation-e2e.spec
 */

import { test, expect, type Page, type Locator } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';

const RUN_ID = Date.now();

/** 箇所数モードの計算用フィールドの表示順（requirements.md「箇所数計算フィールド仕様」） */
const COUNT_FIELD_LABELS = ['箇所数', '長さ', '重量', '調整係数', '丸め設定'];

/** ピッチ固有の計算用フィールド（箇所数モードでは表示されない） */
const PITCH_ONLY_LABELS = ['範囲長', '端長1', '端長2', 'ピッチ長'];

let testProjectId: string | null = null;
let testTableId: string | null = null;

// ============================================================================
// セットアップヘルパー（quantity-item-action-menu-clipping-e2e.spec.ts の流儀を踏襲）
// ============================================================================

async function createTestProject(page: Page, projectName: string): Promise<string> {
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /新規作成/i }).click();
  await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
  await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
    timeout: getTimeout(15000),
  });

  await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

  const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
  const salesPersonValue = await salesPersonSelect.inputValue();
  if (!salesPersonValue) {
    const options = await salesPersonSelect.locator('option').all();
    if (options.length > 1 && options[1]) {
      const firstUserOption = await options[1].getAttribute('value');
      if (firstUserOption) {
        await salesPersonSelect.selectOption(firstUserOption);
      }
    }
  }

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
  const projectId = page.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1] ?? null;
  expect(projectId, 'プロジェクトIDが取得できる必要がある').toBeTruthy();
  return projectId as string;
}

async function createQuantityTable(page: Page, tableName: string): Promise<string> {
  await page.goto(`/projects/${testProjectId}/quantity-tables`);
  await page.waitForLoadState('networkidle');

  const createLink = page.getByRole('link', { name: /新規作成/i }).first();
  await expect(createLink).toBeVisible({ timeout: getTimeout(10000) });
  await createLink.click();

  const nameInput = page.getByRole('textbox', { name: /数量表名|名称/i }).first();
  await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
  await nameInput.fill(tableName);
  await page.getByRole('button', { name: /^作成$/i }).click();

  await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, { timeout: getTimeout(15000) });
  const tableId = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/)?.[1] ?? null;
  expect(tableId, '数量表IDが取得できる必要がある').toBeTruthy();
  return tableId as string;
}

async function addGroup(page: Page, expectedCountAfter: number): Promise<void> {
  const addGroupButton = page.getByRole('button', { name: /グループ追加|グループを追加/i }).first();
  await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });
  await addGroupButton.click();
  await expect(page.locator('[data-testid="quantity-group-card"]')).toHaveCount(
    expectedCountAfter,
    {
      timeout: getTimeout(10000),
    }
  );
}

/**
 * 指定グループへ項目を1件追加し、必須フィールド（工種・名称・単位）を埋める。
 */
async function addItemToGroupAt(
  page: Page,
  groupIndex: number,
  expectedItemCountAfter: number,
  fields: { workType: string; name: string; unit: string }
): Promise<void> {
  const groupCard = page.locator('[data-testid="quantity-group-card"]').nth(groupIndex);

  const addItemButton = groupCard.getByRole('button', { name: '項目を追加' });
  await expect(addItemButton).toBeVisible({ timeout: getTimeout(10000) });
  await addItemButton.click();

  await expect(groupCard.locator('[data-testid="quantity-item-row"]')).toHaveCount(
    expectedItemCountAfter,
    { timeout: getTimeout(10000) }
  );

  const lastRow = groupCard.locator('[data-testid="quantity-item-row"]').last();

  const workTypeInput = lastRow.locator('input[id$="-workType"]').first();
  await expect(workTypeInput).toBeVisible({ timeout: getTimeout(5000) });
  await workTypeInput.fill(fields.workType);
  await workTypeInput.blur();

  const nameInput = lastRow.locator('input[id$="-name"]').first();
  await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
  await nameInput.fill(fields.name);
  await nameInput.blur();

  const unitInput = lastRow.locator('input[id$="-unit"]').first();
  await expect(unitInput).toBeVisible({ timeout: getTimeout(5000) });
  await unitInput.fill(fields.unit);
  await unitInput.blur();
}

// ============================================================================
// 操作・検証ヘルパー
// ============================================================================

const itemRows = (page: Page): Locator => page.locator('[data-testid="quantity-item-row"]');

/** 計算用フィールド領域（メイン行の操作列右側の inline wrapper。REQ-37.13） */
const inlineWrapper = (row: Locator): Locator =>
  row.locator('[data-testid="action-cell-inline-wrapper"]');

/** 数量（自動計算の結果が反映される入力欄） */
const quantityInput = (row: Locator): Locator => row.locator('input[id$="-quantity"]').first();

/** 計算方法セレクト（quantity-table-inline-calculation-fields.spec.ts と同じ取り方） */
const methodSelect = (row: Locator): Locator => row.getByLabel(/計算方法/);

/**
 * 数量表編集画面を開く（毎テスト、保存済みのベースライン状態から開始する）。
 */
async function gotoEditPage(page: Page): Promise<void> {
  expect(testTableId, '事前準備（数量表作成）が完了している必要がある').toBeTruthy();
  await page.goto(`/quantity-tables/${testTableId}/edit`);
  await page.waitForLoadState('networkidle');
  await expect(itemRows(page).first()).toBeVisible({ timeout: getTimeout(15000) });
  await expect(itemRows(page)).toHaveCount(2, { timeout: getTimeout(10000) });
}

/**
 * 計算用フィールド（NumberInputField / AdjustmentField）へ値を入力し blur する。
 *
 * blur によって親へ通知され、数量が自動再計算される（REQ-47.12）。
 */
async function fillCalcField(row: Locator, label: RegExp, value: string): Promise<void> {
  const field = row.getByLabel(label);
  await expect(field).toBeVisible({ timeout: getTimeout(5000) });
  await field.fill(value);
  await field.blur();
}

/**
 * 数量（最終数量）が期待値になることを待って検証する。
 */
async function expectQuantity(row: Locator, expected: string, context: string): Promise<void> {
  await expect
    .poll(async () => quantityInput(row).inputValue(), {
      timeout: getTimeout(10000),
      message: `${context}: 数量が期待値 ${expected} にならない`,
    })
    .toBe(expected);
}

// ============================================================================
// テスト
// ============================================================================

test.describe('REQ-47: 計算方法「箇所数」の計算・表示・入力検証', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  // --------------------------------------------------------------------------
  // 事前準備（条件付きスキップは行わない。テストデータは本テスト内で必ず作成する）
  // --------------------------------------------------------------------------
  test('プロジェクト・数量表・数量項目（2件）を作成する', async ({ page }) => {
    testProjectId = await createTestProject(page, `REQ47_PJ_${RUN_ID}`);
    testTableId = await createQuantityTable(page, `REQ47_数量表_${RUN_ID}`);

    await addGroup(page, 1);
    // 行0: 箇所数の検証用 / 行1: ピッチとの一致検証用
    await addItemToGroupAt(page, 0, 1, { workType: '鉄骨', name: '箇所数項目', unit: '本' });
    await addItemToGroupAt(page, 0, 2, { workType: '鉄骨', name: 'ピッチ項目', unit: '本' });

    // REQ-42.5: 後続テストが再ナビゲートで参照できるよう明示保存して永続化する。
    await saveQuantityTableDraft(page);
  });

  // --------------------------------------------------------------------------
  // REQ-47.1 / 47.2 / 47.13: 選択肢・フィールドの順序と表示・ピッチフィールドの非表示
  // --------------------------------------------------------------------------
  test('計算方法の選択肢に「箇所数」があり、選択すると箇所数→長さ→重量→調整係数→丸め設定の順に表示され、ピッチ固有フィールドは表示されない (REQ-47.1, 47.2, 47.13)', async ({
    page,
  }) => {
    await gotoEditPage(page);

    const row = itemRows(page).first();
    const select = methodSelect(row);
    await expect(select).toBeVisible({ timeout: getTimeout(5000) });

    // REQ-47.1: 選択肢に「箇所数」（value=COUNT）が含まれる
    const optionLabels = await select.locator('option').allTextContents();
    expect(
      optionLabels.map((label) => label.trim()),
      '計算方法の選択肢に「箇所数」が含まれる必要がある'
    ).toContain('箇所数');
    const optionValues = await select
      .locator('option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    expect(optionValues, '計算方法の選択肢に COUNT が含まれる必要がある').toContain('COUNT');

    // ピッチ → 箇所数 の切替（REQ-47.13）。まずピッチ固有フィールドが表示されることを前提として確認する。
    await select.selectOption({ value: 'PITCH' });
    for (const label of PITCH_ONLY_LABELS) {
      await expect(
        row.getByLabel(new RegExp(label)),
        `ピッチ選択時は「${label}」が表示される必要がある（切替検証の前提）`
      ).toBeVisible({ timeout: getTimeout(5000) });
    }

    await select.selectOption({ value: 'COUNT' });

    // REQ-47.2: 「箇所数」フィールドが表示される
    await expect(row.getByLabel(/箇所数/)).toBeVisible({ timeout: getTimeout(5000) });

    // REQ-47.13: ピッチ固有の計算用フィールドは表示されない
    for (const label of PITCH_ONLY_LABELS) {
      await expect(
        row.getByLabel(new RegExp(label)),
        `箇所数選択時は「${label}」が表示されてはならない`
      ).toHaveCount(0);
    }

    // REQ-47.2: フィールド順序（箇所数 → 長さ → 重量 → 調整係数 → 丸め設定）を DOM 順で検証する
    const labels = await inlineWrapper(row).evaluate((wrapper: Element) =>
      Array.from(wrapper.querySelectorAll('label')).map((label) =>
        (label.textContent ?? '').replace('*', '').trim()
      )
    );
    expect(
      labels,
      '箇所数モードの計算用フィールドは 箇所数→長さ→重量→調整係数→丸め設定 の順で表示される必要がある'
    ).toEqual(COUNT_FIELD_LABELS);

    // REQ-37.13: 計算用フィールドはメイン行の操作列右側（inline wrapper）の内側に配置される
    const countIsInsideWrapper = await row
      .getByLabel(/箇所数/)
      .evaluate(
        (input: Element) => input.closest('[data-testid="action-cell-inline-wrapper"]') !== null
      );
    expect(
      countIsInsideWrapper,
      '「箇所数」フィールドは操作列右側の inline wrapper 内に配置される必要がある'
    ).toBe(true);
  });

  // --------------------------------------------------------------------------
  // REQ-47.3 / 47.5: 長さ・重量なしの自動計算（箇所数そのものが計算結果）
  // --------------------------------------------------------------------------
  test('長さ・重量が未入力のとき、箇所数そのものが最終数量になる (REQ-47.3, 47.5, 47.12)', async ({
    page,
  }) => {
    await gotoEditPage(page);

    const row = itemRows(page).first();
    await methodSelect(row).selectOption({ value: 'COUNT' });

    await fillCalcField(row, /箇所数/, '7');

    // REQ-47.5: 任意項目（長さ・重量）は未入力のまま
    await expect(row.getByLabel(/長さ/)).toHaveValue('');
    await expect(row.getByLabel(/重量/)).toHaveValue('');

    // REQ-47.3: 入力値がそのまま箇所数として保持される（ピッチのような自動算出をしない）
    // 整数表示（小数桁を付与しない）であることも併せて確認する
    await expect(
      row.getByLabel(/箇所数/),
      '入力した箇所数がそのまま整数で保持される必要がある'
    ).toHaveValue('7');

    // REQ-47.5 / 47.12: 数量 = 7 × 調整係数1.00 → 丸め0.01 で切り上げ = 7.00
    await expectQuantity(row, '7.00', '長さ・重量なし');
  });

  // --------------------------------------------------------------------------
  // REQ-47.4 / 47.6 / 47.12: 長さ・重量ありの自動計算と各値変更での再計算
  //
  // 「長さ」単独変更による再計算（REQ-47.12）は単体テストに分離検証がない
  // （tasks.md Implementation Notes 70.2(b)）ため、長さのみ入力した段階で明示的に検証する。
  // --------------------------------------------------------------------------
  test('長さ・重量ありのとき入力済みの任意項目のみを乗算し、箇所数・長さ・重量・調整係数・丸め設定の変更で自動再計算する (REQ-47.4, 47.6, 47.12)', async ({
    page,
  }) => {
    await gotoEditPage(page);

    const row = itemRows(page).first();
    await methodSelect(row).selectOption({ value: 'COUNT' });

    // 箇所数のみ: 5 → 5.00（長さ・重量なし）
    await fillCalcField(row, /箇所数/, '5');
    await expectQuantity(row, '5.00', '箇所数のみ');

    // 「長さ」単独変更で再計算される: 5 × 2.5 = 12.5 → 12.50
    await fillCalcField(row, /長さ/, '2.5');
    await expect(row.getByLabel(/重量/), '重量は未入力のままである必要がある').toHaveValue('');
    await expectQuantity(row, '12.50', '長さのみ入力（REQ-47.12: 長さ単独変更での再計算）');

    // 「重量」を追加: 5 × 2.5 × 1.5 = 18.75 → 18.75
    await fillCalcField(row, /重量/, '1.5');
    await expectQuantity(row, '18.75', '長さ・重量あり');

    // REQ-47.6: 調整係数 2.00 → 18.75 × 2 = 37.5 → 丸め0.01 で 37.50
    await fillCalcField(row, /調整係数/, '2');
    await expectQuantity(row, '37.50', '調整係数の変更');

    // REQ-47.6: 丸め設定 1.00 → 37.5 を 1 単位で切り上げ = 38.00
    await fillCalcField(row, /丸め設定/, '1');
    await expectQuantity(row, '38.00', '丸め設定の変更');

    // REQ-47.12: 箇所数の変更でも再計算される: 6 × 2.5 × 1.5 = 22.5 → ×2 = 45 → 切り上げ 45.00
    await fillCalcField(row, /箇所数/, '6');
    await expectQuantity(row, '45.00', '箇所数の変更');
  });

  // --------------------------------------------------------------------------
  // REQ-47.7: ピッチとの最終数量の一致
  // --------------------------------------------------------------------------
  test('同一の箇所数・長さ・重量・調整係数・丸め設定であれば、ピッチと箇所数の最終数量が一致する (REQ-47.7)', async ({
    page,
  }) => {
    await gotoEditPage(page);

    const countRow = itemRows(page).nth(0);
    const pitchRow = itemRows(page).nth(1);

    // ピッチ行: 箇所数 = floor((10 - 0.5 - 0.5) / 1) + 1 = 10 本
    await methodSelect(pitchRow).selectOption({ value: 'PITCH' });
    await fillCalcField(pitchRow, /範囲長/, '10');
    await fillCalcField(pitchRow, /端長1/, '0.5');
    await fillCalcField(pitchRow, /端長2/, '0.5');
    await fillCalcField(pitchRow, /ピッチ長/, '1');
    await fillCalcField(pitchRow, /長さ/, '2.5');
    await fillCalcField(pitchRow, /重量/, '1.5');
    await fillCalcField(pitchRow, /調整係数/, '2');
    await fillCalcField(pitchRow, /丸め設定/, '1');

    // 箇所数行: 同じ箇所数（10）を手入力し、以降のパラメータをピッチ行と揃える
    await methodSelect(countRow).selectOption({ value: 'COUNT' });
    await fillCalcField(countRow, /箇所数/, '10');
    await fillCalcField(countRow, /長さ/, '2.5');
    await fillCalcField(countRow, /重量/, '1.5');
    await fillCalcField(countRow, /調整係数/, '2');
    await fillCalcField(countRow, /丸め設定/, '1');

    // 10 × 2.5 × 1.5 = 37.5 → ×2 = 75 → 1単位で切り上げ = 75.00
    await expectQuantity(pitchRow, '75.00', 'ピッチ行');
    await expectQuantity(countRow, '75.00', '箇所数行');

    const pitchQuantity = await quantityInput(pitchRow).inputValue();
    const countQuantity = await quantityInput(countRow).inputValue();
    expect(
      countQuantity,
      `箇所数の最終数量はピッチと一致する必要がある（ピッチ=${pitchQuantity}, 箇所数=${countQuantity}）`
    ).toBe(pitchQuantity);
    expect(
      Number(countQuantity),
      '最終数量が0でない必要がある（検証が空虚にならないこと）'
    ).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // REQ-47.10: 小数の拒否
  // --------------------------------------------------------------------------
  test('「箇所数」に小数を入力すると拒否されエラーが表示され、数量は更新されない (REQ-47.8, 47.10)', async ({
    page,
  }) => {
    await gotoEditPage(page);

    const row = itemRows(page).first();
    await methodSelect(row).selectOption({ value: 'COUNT' });

    // 正当値を入れた状態を作る（拒否時に数量が更新されないことを検証するため）
    await fillCalcField(row, /箇所数/, '5');
    await expectQuantity(row, '5.00', '正当値入力後');

    // 小数を入力して blur → 拒否
    await fillCalcField(row, /箇所数/, '5.5');

    const countField = row.getByLabel(/箇所数/);
    await expect(
      row.getByRole('alert').filter({ hasText: '箇所数は整数で入力してください' }),
      '小数入力時は整数エラーが表示される必要がある'
    ).toBeVisible({ timeout: getTimeout(5000) });
    await expect(countField, '拒否された入力値は入力欄に残る（REQ-47.10 の拒否実装）').toHaveValue(
      '5.5'
    );
    await expect(countField).toHaveAttribute('aria-invalid', 'true');

    // 数量は直前の正当値のまま（拒否されたため再計算されない）
    await expectQuantity(row, '5.00', '小数拒否後');
  });

  // --------------------------------------------------------------------------
  // REQ-47.11: 範囲外エラー
  // --------------------------------------------------------------------------
  test('「箇所数」に範囲外（1未満・9999999超）の値を入力するとエラーが表示され、数量は更新されない (REQ-47.8, 47.11)', async ({
    page,
  }) => {
    await gotoEditPage(page);

    const row = itemRows(page).first();
    await methodSelect(row).selectOption({ value: 'COUNT' });

    await fillCalcField(row, /箇所数/, '5');
    await expectQuantity(row, '5.00', '正当値入力後');

    const countField = row.getByLabel(/箇所数/);
    const rangeError = row
      .getByRole('alert')
      .filter({ hasText: '箇所数は1〜9999999の範囲で入力してください' });

    // 下限未満（0）
    await fillCalcField(row, /箇所数/, '0');
    await expect(rangeError, '下限未満では範囲エラーが表示される必要がある').toBeVisible({
      timeout: getTimeout(5000),
    });
    await expect(countField).toHaveValue('0');
    await expectQuantity(row, '5.00', '下限未満の拒否後');

    // 上限超過（10000000）
    await fillCalcField(row, /箇所数/, '10000000');
    await expect(rangeError, '上限超過では範囲エラーが表示される必要がある').toBeVisible({
      timeout: getTimeout(5000),
    });
    await expect(countField).toHaveValue('10000000');
    await expectQuantity(row, '5.00', '上限超過の拒否後');
  });

  // --------------------------------------------------------------------------
  // REQ-47.9: 未入力での必須エラー（保存試行時）
  // --------------------------------------------------------------------------
  test('「箇所数」が未入力のまま保存を試行するとエラーが表示され、保存が中断される (REQ-47.9)', async ({
    page,
  }) => {
    await gotoEditPage(page);

    // 保存 API（PUT /:id/save）が送信されないことを検証するためリクエストを監視する
    const saveRequests: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'PUT' &&
        /\/api\/quantity-tables\/[^/]+\/save$/.test(request.url())
      ) {
        saveRequests.push(request.url());
      }
    });

    const row = itemRows(page).first();
    await methodSelect(row).selectOption({ value: 'COUNT' });

    // 箇所数は未入力のまま（空欄であることを前提として確認する）
    await expect(row.getByLabel(/箇所数/), '箇所数が未入力である必要がある（前提）').toHaveValue(
      ''
    );

    const saveButton = page.getByRole('button', { name: '保存' });
    await expect(saveButton).toBeVisible({ timeout: getTimeout(10000) });
    await saveButton.click();

    // REQ-47.9: 必須エラーが画面に表示される（QuantityTableEditPage の保存前チェック）
    const saveError = page.getByRole('alert').filter({ hasText: '保存できません' });
    await expect(
      saveError,
      '箇所数未入力での保存試行はエラーメッセージを表示する必要がある'
    ).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(saveError).toContainText('箇所数は必須です');

    // REQ-11.2 / 47.9: 保存は中断され、サーバーへ送信されない
    await expect.poll(() => saveRequests.length, { timeout: getTimeout(3000) }).toBe(0);
    await expect(page.getByText(/保存しました/)).toHaveCount(0);

    // 箇所数を入力すれば保存できる（エラーが必須項目由来であることの確認）
    await fillCalcField(row, /箇所数/, '3');
    await expectQuantity(row, '3.00', '箇所数入力後');
    await saveQuantityTableDraft(page);
    expect(saveRequests.length, '箇所数入力後は保存 API が送信される必要がある').toBe(1);
  });

  // --------------------------------------------------------------------------
  // REQ-47.13 / 47.14: 計算方法切替時のフィールド差し替え
  // --------------------------------------------------------------------------
  test('計算方法を切り替えると計算用フィールド群が切替先のものへ差し替わる (REQ-47.13, 47.14)', async ({
    page,
  }) => {
    await gotoEditPage(page);

    const row = itemRows(page).first();
    const select = methodSelect(row);

    // ピッチ → 箇所数: ピッチ固有フィールドが消え、箇所数が現れる（REQ-47.13）
    await select.selectOption({ value: 'PITCH' });
    await expect(row.getByLabel(/範囲長/)).toBeVisible({ timeout: getTimeout(5000) });
    await expect(row.getByLabel(/箇所数/)).toHaveCount(0);

    await select.selectOption({ value: 'COUNT' });
    await expect(row.getByLabel(/箇所数/)).toBeVisible({ timeout: getTimeout(5000) });
    await expect(row.getByLabel(/範囲長/)).toHaveCount(0);
    await expect(row.getByLabel(/端長1/)).toHaveCount(0);
    await expect(row.getByLabel(/端長2/)).toHaveCount(0);
    await expect(row.getByLabel(/ピッチ長/)).toHaveCount(0);

    // 箇所数 → 面積・体積: 箇所数が消え、面積・体積のフィールドが現れる（REQ-47.14）
    await select.selectOption({ value: 'AREA_VOLUME' });
    await expect(row.getByLabel(/幅/)).toBeVisible({ timeout: getTimeout(5000) });
    await expect(row.getByLabel(/奥行き/)).toBeVisible();
    await expect(row.getByLabel(/高さ/)).toBeVisible();
    await expect(
      row.getByLabel(/箇所数/),
      '面積・体積では箇所数が表示されてはならない'
    ).toHaveCount(0);

    // 箇所数 → 標準: 計算用フィールドが一切表示されない（REQ-47.14）
    await select.selectOption({ value: 'COUNT' });
    await expect(row.getByLabel(/箇所数/)).toBeVisible({ timeout: getTimeout(5000) });
    await select.selectOption({ value: 'STANDARD' });
    await expect(row.getByLabel(/箇所数/), '標準では箇所数が表示されてはならない').toHaveCount(0);
    await expect(row.getByLabel(/調整係数/)).toHaveCount(0);
    await expect(row.getByLabel(/丸め設定/)).toHaveCount(0);
  });

  // --------------------------------------------------------------------------
  // クリーンアップ
  // --------------------------------------------------------------------------
  test('作成したプロジェクトを削除する', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('accessToken');
    });

    await loginAsUser(page, 'ADMIN_USER');

    if (testProjectId) {
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const deleteButton = page.getByRole('button', { name: /削除/i }).first();
      if (await deleteButton.isVisible({ timeout: getTimeout(5000) })) {
        await deleteButton.click();
        const confirmButton = page
          .getByTestId('focus-manager-overlay')
          .getByRole('button', { name: /^削除$/i });
        if (await confirmButton.isVisible({ timeout: getTimeout(5000) })) {
          await confirmButton.click();
          await page.waitForLoadState('networkidle');
        }
      }
    }
  });
});
