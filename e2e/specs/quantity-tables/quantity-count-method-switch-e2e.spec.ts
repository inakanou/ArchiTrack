/**
 * @fileoverview 計算方法切替時の計算用パラメータ整合の E2E テスト (REQ-48)
 *
 * Task 71.4: 計算方法切替時のパラメータ整合の E2E を実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - @requirement quantity-table-generation/REQ-48.1: 計算方法を変更すると、変更前の計算方法に固有の
 *   計算用パラメータを破棄し、変更後の計算方法で使用するパラメータのみを保持する
 * - @requirement quantity-table-generation/REQ-48.2: 変更前後で共通する計算用フィールド（「長さ」「重量」等）
 *   に入力済みの値を引き継ぐ
 * - @requirement quantity-table-generation/REQ-48.3: 計算方法を「ピッチ」から「箇所数」へ変更して箇所数を
 *   入力し保存すると、箇所数を欠落させずに永続化し、再読み込み後も復元する
 * - @requirement quantity-table-generation/REQ-48.4: 計算方法を「ピッチ」から「面積・体積」へ変更して寸法を
 *   入力し保存すると、入力された寸法を欠落させずに永続化し、再読み込み後も復元する（既存不具合の回帰）
 * - @requirement quantity-table-generation/REQ-48.7: 計算方法を変更した直後に変更後の必須パラメータが未入力の
 *   とき、変更前のパラメータを流用して数量を算出せず、必須パラメータの入力を待つ
 *
 * 設計参照:
 * - design.md「計算方法切替時のパラメータ整合（REQ-48）」/「E2Eテスト（calculation-method-switch）」
 * - requirements.md「Requirement 48: 計算方法切替時の計算用パラメータの整合」
 *
 * 検証方針（tasks.md Implementation Notes 68.4 の重要知見に準拠）:
 * - 68.4(a): **パラメータ残留バグは DOM に一切現れない**。`CalculationFields` は切替後の計算方法に
 *   定義されたフィールドしか描画しないため、残留した旧方式のキーは構造的に画面へ出ない。画面表示だけを
 *   見る E2E は REQ-48 に対して「偽の緑」になる。本 spec は残留・整合を必ず次の 2 経路で検証する:
 *     (1) 明示保存の `PUT /api/quantity-tables/:id/save` リクエストボディ（`calculationParams`）を
 *         network intercept で捕捉し、切替後の計算方法のキーのみを持ち旧方式固有キー
 *         （`rangeLength` 等）を含まないことを検証する（frontend の `resetParamsForMethod`＝68.4 の検出）。
 *     (2) 保存 → リロード → 復元値の照合により、切替後に入力した値（箇所数・幅）が欠落せず永続化・復元
 *         されることを検証する（backend の判別子ベース検証＝67.x の検出。旧実装の zod 形状推測 union は
 *         混合パラメータから旧方式スキーマに誤マッチして新規キーを strip するため、リロード後に空欄になる）。
 *   → この 2 経路の併用により、**修正前の実装では箇所数・幅の保持テストが失敗する**（観測可能完了条件）:
 *     backend の形状推測が復活すればリロードで新規キーが消えて (2) が fail、frontend の切替リセットが
 *     復活しなければ保存ボディに旧方式固有キーが混入して (1) が fail する。
 * - 68.4(b): **切替直後の数量は「据え置き」とは限らない**。面積・体積では `calculateAreaVolume` が
 *   全寸法未入力でも例外を投げず、引き継いだ共通フィールド（重量）だけで再計算する。よって AC7 は
 *   「数量が据え置き」ではなく **「旧方式に固有のパラメータ由来の値でないこと」** を主張する形で設計する。
 *     - 箇所数への切替: `calculateCount` は箇所数未入力で例外を投げ、数量は更新されない（直前の値のまま）。
 *     - 面積・体積への切替: 引き継いだ重量のみで再計算され、旧「ピッチ」数量とは異なる値になる。
 *
 * @module e2e/specs/quantity-tables/quantity-count-method-switch-e2e.spec
 */

import { test, expect, type Page, type Locator, type Request } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';

const RUN_ID = Date.now();

/** ピッチ固有の計算用フィールド（切替後は表示されず、保存ボディにも残ってはならない） */
const PITCH_ONLY_LABELS = ['範囲長', '端長1', '端長2', 'ピッチ長'];
/** ピッチ固有パラメータキー（保存ボディで旧方式キーの残留を検出するために使う） */
const PITCH_ONLY_KEYS = ['rangeLength', 'endLength1', 'endLength2', 'pitchLength'];

/** 箇所数切替検証用の項目（一意な名称で保存ボディ内から特定する） */
const COUNT_ITEM = { workType: '切替検証工種', name: '切替COUNT項目', unit: '本' } as const;
/** 面積・体積切替検証用の項目（一意な名称で保存ボディ内から特定する） */
const AREA_ITEM = { workType: '切替検証工種', name: '切替AREAVOLUME項目', unit: 'm3' } as const;

let testProjectId: string | null = null;
let testTableId: string | null = null;

// ============================================================================
// 保存ボディ（PUT /:id/save）の calculationParams 検証ユーティリティ（68.4(a)）
// ============================================================================

interface SaveDraftItemLike {
  name?: string;
  calculationMethod?: string;
  calculationParams?: Record<string, number> | null;
}
interface SaveDraftGroupLike {
  items?: SaveDraftItemLike[];
}
interface SaveDraftBodyLike {
  groups?: SaveDraftGroupLike[];
}

/**
 * PUT /api/quantity-tables/:id/save のリクエストボディを捕捉するレコーダーを取り付ける。
 *
 * network intercept で保存時の `calculationParams` を検証するため、最後に送信された保存ボディを
 * 保持する。68.4(a): パラメータ残留は DOM に現れないため、切替後の保存ボディを直接検証する。
 */
function attachSaveBodyRecorder(page: Page): { last: () => SaveDraftBodyLike | null } {
  let lastBody: SaveDraftBodyLike | null = null;
  page.on('request', (request: Request) => {
    if (request.method() === 'PUT' && /\/api\/quantity-tables\/[^/]+\/save$/.test(request.url())) {
      const parsed = request.postDataJSON() as SaveDraftBodyLike | null;
      if (parsed) {
        lastBody = parsed;
      }
    }
  });
  return { last: () => lastBody };
}

/** 保存ボディ内から指定名称の項目の calculationParams / calculationMethod を取り出す。 */
function findSavedItem(body: SaveDraftBodyLike | null, itemName: string): SaveDraftItemLike {
  const items = (body?.groups ?? []).flatMap((group) => group.items ?? []);
  const item = items.find((candidate) => candidate.name === itemName);
  expect(item, `保存ボディに項目「${itemName}」が含まれる必要がある`).toBeTruthy();
  return item as SaveDraftItemLike;
}

// ============================================================================
// セットアップヘルパー（quantity-count-persistence-e2e.spec.ts / 71.3 の流儀を踏襲）
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
    { timeout: getTimeout(10000) }
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

/** 数量（自動計算の結果が反映される入力欄） */
const quantityInput = (row: Locator): Locator => row.locator('input[id$="-quantity"]').first();

/** 計算方法セレクト */
const methodSelect = (row: Locator): Locator => row.getByLabel(/計算方法/);

async function gotoEditPage(page: Page, expectedItemCount: number): Promise<void> {
  expect(testTableId, '事前準備（数量表作成）が完了している必要がある').toBeTruthy();
  await page.goto(`/quantity-tables/${testTableId}/edit`);
  await page.waitForLoadState('networkidle');
  await expect(itemRows(page).first()).toBeVisible({ timeout: getTimeout(15000) });
  await expect(itemRows(page)).toHaveCount(expectedItemCount, { timeout: getTimeout(10000) });
}

/**
 * 計算用フィールド（NumberInputField / AdjustmentField）へ値を入力し blur する。
 * blur によって親へ通知され、数量が自動再計算される。
 */
async function fillCalcField(row: Locator, label: RegExp, value: string): Promise<void> {
  const field = row.getByLabel(label);
  await expect(field).toBeVisible({ timeout: getTimeout(5000) });
  await field.fill(value);
  await field.blur();
}

/**
 * 行を「ピッチ」計算方法にして全パラメータ（範囲長・端長1・端長2・ピッチ長・長さ・重量）を入力する。
 *
 * 数量 = floor((10 - 0.5 - 0.5) / 1) + 1 = 10 本 → 10 × 2.5 × 1.5 = 37.5 → 丸め0.01 で 37.50。
 */
async function fillPitchAllParams(row: Locator): Promise<void> {
  await methodSelect(row).selectOption({ value: 'PITCH' });
  await fillCalcField(row, /範囲長/, '10');
  await fillCalcField(row, /端長1/, '0.5');
  await fillCalcField(row, /端長2/, '0.5');
  await fillCalcField(row, /ピッチ長/, '1');
  await fillCalcField(row, /長さ/, '2.5');
  await fillCalcField(row, /重量/, '1.5');
}

/** ピッチ全入力後の数量表示値（丸め0.01・調整係数1.00 の既定） */
const PITCH_QUANTITY = '37.50';

// ============================================================================
// テスト
// ============================================================================

test.describe('REQ-48: 計算方法切替時の計算用パラメータの整合', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  // --------------------------------------------------------------------------
  // 事前準備（条件付きスキップは行わない。テストデータは本テスト内で必ず作成する）
  //   行0: ピッチ→箇所数 切替の検証（AC1/AC2/AC3/AC7）
  //   行1: ピッチ→面積・体積 切替の検証（AC1/AC4/AC7 = 既存バグの回帰）
  // --------------------------------------------------------------------------
  test('プロジェクト・数量表・数量項目（2件）を作成する', async ({ page }) => {
    testProjectId = await createTestProject(page, `REQ48_PJ_${RUN_ID}`);
    testTableId = await createQuantityTable(page, `REQ48_数量表_${RUN_ID}`);

    await addGroup(page, 1);
    await addItemToGroupAt(page, 0, 1, { ...COUNT_ITEM });
    await addItemToGroupAt(page, 0, 2, { ...AREA_ITEM });

    // ベースライン状態を明示保存して永続化する（REQ-42.5）。
    await saveQuantityTableDraft(page);
  });

  // --------------------------------------------------------------------------
  // REQ-48.1 / 48.2 / 48.3 / 48.7: ピッチ →「箇所数」への切替（今回の欠陥の直接の再現手順）
  // --------------------------------------------------------------------------
  test('「ピッチ」で全パラメータ入力後に「箇所数」へ切替→箇所数を入力し保存・リロードすると、箇所数が保持され旧方式パラメータは破棄・非引継ぎで共通フィールドは引き継がれる (REQ-48.1, 48.2, 48.3, 48.7)', async ({
    page,
  }) => {
    await gotoEditPage(page, 2);

    const saveBody = attachSaveBodyRecorder(page);
    const row = itemRows(page).first();

    // 1) ピッチで全パラメータを入力する（範囲長・端長1・端長2・ピッチ長・長さ・重量）。
    await fillPitchAllParams(row);
    // ピッチ固有フィールドが表示され、数量が確定していることを前提確認する。
    for (const label of PITCH_ONLY_LABELS) {
      await expect(
        row.getByLabel(new RegExp(label)),
        `ピッチ選択時は「${label}」が表示される（切替検証の前提）`
      ).toBeVisible({ timeout: getTimeout(5000) });
    }
    await expect(quantityInput(row), 'ピッチ全入力後の数量が確定している必要がある').toHaveValue(
      PITCH_QUANTITY
    );

    // 2) 「箇所数」へ切り替える。
    await methodSelect(row).selectOption({ value: 'COUNT' });

    // REQ-48.1: 旧方式（ピッチ）に固有のフィールドが画面から消える。
    for (const label of PITCH_ONLY_LABELS) {
      await expect(
        row.getByLabel(new RegExp(label)),
        `箇所数への切替後は「${label}」が表示されてはならない（REQ-48.1）`
      ).toHaveCount(0);
    }
    // 箇所数フィールドが現れ、未入力である（旧値の流用が無い）。
    await expect(row.getByLabel(/箇所数/), '箇所数フィールドが表示される').toBeVisible({
      timeout: getTimeout(5000),
    });
    await expect(row.getByLabel(/箇所数/), '切替直後の箇所数は未入力である').toHaveValue('');

    // REQ-48.2: 共通フィールド（長さ・重量）の入力値は引き継がれる。
    await expect(row.getByLabel(/長さ/), '長さは引き継がれる（REQ-48.2）').toHaveValue('2.50');
    await expect(row.getByLabel(/重量/), '重量は引き継がれる（REQ-48.2）').toHaveValue('1.50');

    // REQ-48.7: 切替直後（箇所数未入力）は旧パラメータを流用して数量を算出せず、入力を待つ。
    // 箇所数モードでは calculateCount が箇所数未入力で例外を投げ、数量は更新されない（直前の値のまま）。
    // → 旧「ピッチ」固有パラメータ由来の新規計算は行われていない（68.4(b) の設計方針）。
    await expect(
      quantityInput(row),
      '箇所数未入力の切替直後は数量が再算出されず直前値のまま（REQ-48.7）'
    ).toHaveValue(PITCH_QUANTITY);

    // 3) 箇所数を入力する（4 × 長さ2.5 × 重量1.5 = 15 → 丸め0.01 で 15.00）。
    //    旧ピッチ数量(37.50)とは異なる値になり、算出が箇所数＋共通フィールドのみに依存することを示す。
    await fillCalcField(row, /箇所数/, '4');
    await expect(
      quantityInput(row),
      '箇所数入力後は箇所数＋共通フィールドのみで再算出される（旧ピッチ固有値でない）'
    ).toHaveValue('15.00');

    // 4) 明示保存 → 保存ボディの calculationParams を network intercept で検証する（68.4(a)）。
    await saveQuantityTableDraft(page);

    const savedCount = findSavedItem(saveBody.last(), COUNT_ITEM.name);
    expect(savedCount.calculationMethod, '保存された計算方法は COUNT である').toBe('COUNT');
    const countParams = savedCount.calculationParams ?? {};
    // REQ-48.1 / 48.6: 旧方式（ピッチ）固有のキーは保存ボディに含まれない（frontend の切替リセット）。
    for (const key of PITCH_ONLY_KEYS) {
      expect(
        Object.prototype.hasOwnProperty.call(countParams, key),
        `保存ボディの calculationParams に旧方式キー「${key}」が残ってはならない（REQ-48.1）`
      ).toBe(false);
    }
    // REQ-48.3 / 48.2: 箇所数と共通フィールドのみが保存される。
    expect(
      Object.keys(countParams).sort(),
      '箇所数モードの保存キーは count/length/weight のみ'
    ).toEqual(['count', 'length', 'weight']);
    expect(countParams.count, '保存された箇所数は 4').toBe(4);
    expect(countParams.length, '保存された長さは 2.5').toBe(2.5);
    expect(countParams.weight, '保存された重量は 1.5').toBe(1.5);

    // 5) リロード → 箇所数（新規入力値）が欠落せず復元される（REQ-48.3）。
    //    旧実装の zod 形状推測 union では混合パラメータがピッチスキーマへ誤マッチして count が
    //    strip され、リロード後の箇所数は空欄になる（＝この検証が失敗する）。
    await gotoEditPage(page, 2);
    const reloadedRow = itemRows(page).first();
    await expect(methodSelect(reloadedRow), 'リロード後の計算方法は COUNT').toHaveValue('COUNT');
    await expect(
      reloadedRow.getByLabel(/箇所数/),
      'リロード後に箇所数が復元される（REQ-48.3）'
    ).toHaveValue('4');
    await expect(reloadedRow.getByLabel(/長さ/), 'リロード後に長さが復元される').toHaveValue(
      '2.50'
    );
    await expect(reloadedRow.getByLabel(/重量/), 'リロード後に重量が復元される').toHaveValue(
      '1.50'
    );
    await expect(quantityInput(reloadedRow), 'リロード後に数量が復元される').toHaveValue('15.00');
    // リロード後も旧方式フィールドは復活しない。
    for (const label of PITCH_ONLY_LABELS) {
      await expect(
        reloadedRow.getByLabel(new RegExp(label)),
        `リロード後も「${label}」は表示されない（旧方式パラメータは破棄済み）`
      ).toHaveCount(0);
    }
  });

  // --------------------------------------------------------------------------
  // REQ-48.1 / 48.4 / 48.7: ピッチ →「面積・体積」への切替（既存不具合の回帰テスト）
  // --------------------------------------------------------------------------
  test('「ピッチ」で全パラメータ入力後に「面積・体積」へ切替→幅を入力し保存・リロードすると、幅が保持され旧方式パラメータは破棄される (REQ-48.1, 48.4, 48.7)', async ({
    page,
  }) => {
    await gotoEditPage(page, 2);

    const saveBody = attachSaveBodyRecorder(page);
    // 行1（面積・体積切替検証用）を対象にする。
    const row = itemRows(page).nth(1);

    // 1) ピッチで全パラメータを入力する。
    await fillPitchAllParams(row);
    await expect(quantityInput(row), 'ピッチ全入力後の数量が確定している必要がある').toHaveValue(
      PITCH_QUANTITY
    );

    // 2) 「面積・体積」へ切り替える。
    await methodSelect(row).selectOption({ value: 'AREA_VOLUME' });

    // REQ-48.1: 旧方式（ピッチ）固有フィールドが消え、面積・体積のフィールドが現れる。
    for (const label of PITCH_ONLY_LABELS) {
      await expect(
        row.getByLabel(new RegExp(label)),
        `面積・体積への切替後は「${label}」が表示されてはならない（REQ-48.1）`
      ).toHaveCount(0);
    }
    await expect(row.getByLabel(/幅/), '面積・体積では幅が表示される').toBeVisible({
      timeout: getTimeout(5000),
    });
    await expect(row.getByLabel(/奥行き/), '面積・体積では奥行きが表示される').toBeVisible();
    await expect(row.getByLabel(/高さ/), '面積・体積では高さが表示される').toBeVisible();
    // 「長さ」はピッチ固有（面積・体積には無い共通外フィールド）なので破棄される（REQ-48.1）。
    await expect(
      row.getByLabel(/長さ/),
      '面積・体積では「長さ」フィールドは表示されない（REQ-48.1: 共通でないキーは破棄）'
    ).toHaveCount(0);
    // 箇所数も表示されない。
    await expect(row.getByLabel(/箇所数/), '面積・体積では箇所数は表示されない').toHaveCount(0);

    // REQ-48.2: 共通フィールド（重量）は引き継がれる。
    await expect(row.getByLabel(/重量/), '重量は引き継がれる（REQ-48.2）').toHaveValue('1.50');

    // REQ-48.7 / 68.4(b): 切替直後（寸法未入力）は旧「ピッチ」固有パラメータ由来の数量にならない。
    // 面積・体積では calculateAreaVolume が引き継いだ重量のみで再計算するため、数量はピッチ数量(37.50)
    // とは異なる（重量1.5のみ → 1.50）。「据え置き」ではなく「旧方式固有パラメータ由来でない」ことを主張する。
    await expect(
      quantityInput(row),
      '切替直後の数量は旧「ピッチ」固有パラメータ由来の値ではない（REQ-48.7 / 68.4(b)）'
    ).not.toHaveValue(PITCH_QUANTITY);
    await expect(
      quantityInput(row),
      '切替直後は引き継いだ重量のみで再計算される（1.5 → 1.50）'
    ).toHaveValue('1.50');

    // 3) 幅を入力する（幅3 × 重量1.5 = 4.5 → 丸め0.01 で 4.50）。
    await fillCalcField(row, /幅/, '3');
    await expect(quantityInput(row), '幅入力後は幅＋重量で再算出される').toHaveValue('4.50');

    // 4) 明示保存 → 保存ボディの calculationParams を検証する（68.4(a)）。
    await saveQuantityTableDraft(page);

    const savedArea = findSavedItem(saveBody.last(), AREA_ITEM.name);
    expect(savedArea.calculationMethod, '保存された計算方法は AREA_VOLUME である').toBe(
      'AREA_VOLUME'
    );
    const areaParams = savedArea.calculationParams ?? {};
    // REQ-48.1 / 48.6: 旧方式（ピッチ）固有キーは保存ボディに含まれない。
    for (const key of PITCH_ONLY_KEYS) {
      expect(
        Object.prototype.hasOwnProperty.call(areaParams, key),
        `保存ボディの calculationParams に旧方式キー「${key}」が残ってはならない（REQ-48.1）`
      ).toBe(false);
    }
    // 「長さ」も面積・体積では使用しないため破棄される。
    expect(
      Object.prototype.hasOwnProperty.call(areaParams, 'length'),
      '面積・体積の保存ボディに「length」が残ってはならない（REQ-48.1）'
    ).toBe(false);
    // REQ-48.4 / 48.2: 幅と共通フィールド（重量）が保存される。
    expect(areaParams.width, '保存された幅は 3').toBe(3);
    expect(areaParams.weight, '保存された重量は 1.5').toBe(1.5);

    // 5) リロード → 幅（新規入力値）が欠落せず復元される（REQ-48.4: 既存バグの回帰）。
    //    旧実装の zod 形状推測 union では混合パラメータがピッチスキーマへ誤マッチして width が
    //    strip され、リロード後の幅は空欄になる（＝この検証が失敗する）。
    await gotoEditPage(page, 2);
    const reloadedRow = itemRows(page).nth(1);
    await expect(methodSelect(reloadedRow), 'リロード後の計算方法は AREA_VOLUME').toHaveValue(
      'AREA_VOLUME'
    );
    await expect(
      reloadedRow.getByLabel(/幅/),
      'リロード後に幅が復元される（REQ-48.4）'
    ).toHaveValue('3.00');
    await expect(reloadedRow.getByLabel(/重量/), 'リロード後に重量が復元される').toHaveValue(
      '1.50'
    );
    await expect(quantityInput(reloadedRow), 'リロード後に数量が復元される').toHaveValue('4.50');
    // リロード後も旧方式フィールド（ピッチ固有・長さ）は復活しない。
    for (const label of [...PITCH_ONLY_LABELS, '長さ']) {
      await expect(
        reloadedRow.getByLabel(new RegExp(label)),
        `リロード後も「${label}」は表示されない（旧方式パラメータは破棄済み）`
      ).toHaveCount(0);
    }
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
