/**
 * @fileoverview 計算方法「箇所数」の永続化・コピー・PDF出力の E2E テスト (REQ-47)
 *
 * Task 71.3: 計算方法「箇所数」の永続化・コピー・PDF出力の E2E を実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - @requirement quantity-table-generation/REQ-47.15: 計算方法「箇所数」の数量項目を含む数量表を
 *   保存して再読み込みすると、計算方法・箇所数・長さ・重量・調整係数・丸め設定・数量の各値を
 *   保存前と同一の状態で復元する
 * - @requirement quantity-table-generation/REQ-47.16: 計算方法「箇所数」の数量項目を含む数量グループを
 *   コピーすると、計算方法「箇所数」および箇所数・長さ・重量・調整係数・丸め設定の各値を複製先へ複製する
 * - @requirement quantity-table-generation/REQ-47.17: 計算方法「箇所数」の数量項目を含む数量表を
 *   PDF出力すると、当該数量項目を他の計算方法の数量項目と同様に数量表内へ出力する
 * - @requirement quantity-table-generation/REQ-47.18: 計算方法「箇所数」の数量項目の編集を
 *   クライアントサイドの編集状態に対して実行し、永続化は保存操作時に行う（Requirement 42）
 *
 * 設計参照:
 * - design.md「数量計算フロー（箇所数モード・REQ-47）」/「PDF出力の計算方法ラベル変換」
 * - requirements.md「箇所数計算フィールド仕様」: フィールド順序（箇所数→長さ→重量→調整係数→丸め設定）
 *
 * 検証方針:
 * - REQ-47.15/47.18: 箇所数モードの全フィールドを入力しても編集中は永続化 API（POST .../items /
 *   PUT .../save）が飛ばないこと（クライアントドラフト）を network 監視で確認し、明示保存後の
 *   リロードで計算方法・箇所数・長さ・重量・調整係数・丸め設定・数量が保存前と同一表示で復元される
 *   ことを検証する（tasks.md Implementation Notes 68.4(a): パラメータ残留は DOM に現れないため
 *   「保存 → リロード → 復元値」で確認する）。
 * - REQ-47.16: 箇所数項目を含むグループをコピーし、複製先の項目が計算方法「箇所数」と全計算パラメータ
 *   （箇所数・長さ・重量・調整係数・丸め設定）を保持することをドラフト直後と保存後リロードの双方で検証する。
 * - REQ-47.17: PDF出力の計算方法欄が「箇所数」と表示され「ピッチ」ではないことを検証する。
 *   これは 68.5 のラベル変換フォールバック回帰（`CalculationMethod` 型の非対称性により COUNT が
 *   ネスト三項の最終分岐「ピッチ」へ化ける不具合）に対する検出力を持つ。表に箇所数項目のみを含め、
 *   ピッチ項目を含めないため、フォールバックが再発すれば計算方法欄は「ピッチ」となり本検証は失敗する。
 *   PDF テキストの取得は jsPDF 生成物を pdfjs-dist の getTextContent() で抽出する
 *   （estimate-request/REQ-17.1 と同じ pdfjs-dist ベースの流儀）。
 *
 * @module e2e/specs/quantity-tables/quantity-count-persistence-e2e.spec
 */

import { test, expect, type Page, type Locator } from '@playwright/test';
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as fs from 'fs';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';

// ESM 環境での __dirname 代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RUN_ID = Date.now();

/** 箇所数モードの計算用フィールドの表示順（requirements.md「箇所数計算フィールド仕様」） */
const COUNT_FIELD_LABELS = ['箇所数', '長さ', '重量', '調整係数', '丸め設定'];

/**
 * 箇所数モードで入力する基準パラメータと、その表示上の復元期待値。
 *
 * - count（整数）: `String(value)` 表示 → '8'
 * - length / weight（任意・小数）: `toFixed(2)` 表示 → '2.50' / '1.50'
 * - adjustmentFactor / roundingUnit（AdjustmentField）: `toFixed(2)` 表示 → '2.00' / '1.00'
 * - 数量: 8 × 2.5 × 1.5 = 30 → ×2（調整係数）= 60 → 丸め1.00 で切り上げ = 60.00
 */
const COUNT_PARAMS = {
  count: { input: '8', display: '8' },
  length: { input: '2.5', display: '2.50' },
  weight: { input: '1.5', display: '1.50' },
  adjustmentFactor: { input: '2', display: '2.00' },
  roundingUnit: { input: '1', display: '1.00' },
  quantity: '60.00',
} as const;

/** 箇所数項目の識別用フィールド（PDF や複製の照合に使う一意な名称） */
const COUNT_ITEM_FIELDS = { workType: 'PDF検証工種', name: 'PDF検証COUNT', unit: '本' } as const;

let testProjectId: string | null = null;
let testTableId: string | null = null;

// ============================================================================
// PDF テキスト抽出（pdfjs-dist の getTextContent。frontend の pdfjs-dist を参照）
// ============================================================================

/** frontend にインストール済みの pdfjs-dist（legacy build）への絶対パス */
const PDFJS_MODULE_PATH = path.resolve(
  __dirname,
  '../../../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs'
);

interface PdfTextItem {
  str?: string;
}
interface PdfPageLike {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
}
interface PdfDocumentLike {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageLike>;
}
interface PdfjsLike {
  getDocument: (src: { data: Uint8Array }) => { promise: Promise<PdfDocumentLike> };
}

/**
 * ダウンロード済み PDF ファイルから全ページのテキストを抽出して連結する。
 *
 * jsPDF が埋め込む Noto Sans JP サブセットフォントは ToUnicode CMap を持つため、
 * pdfjs-dist の getTextContent() で日本語テキストを正しく復元できる。
 */
async function extractPdfText(pdfFilePath: string): Promise<string> {
  const bytes = new Uint8Array(fs.readFileSync(pdfFilePath));

  // tsc に静的解決させないよう specifier は変数で渡す（frontend の node_modules 参照のため）
  const specifier: string = PDFJS_MODULE_PATH;
  const pdfjs = (await import(specifier)) as unknown as PdfjsLike;

  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  let text = '';
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str ?? '').join('') + '\n';
  }
  return text;
}

// ============================================================================
// セットアップヘルパー（quantity-count-calculation-e2e.spec.ts / 71.2 の流儀を踏襲）
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

const groupCards = (page: Page): Locator => page.locator('[data-testid="quantity-group-card"]');

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
 */
async function fillCalcField(row: Locator, label: RegExp, value: string): Promise<void> {
  const field = row.getByLabel(label);
  await expect(field).toBeVisible({ timeout: getTimeout(5000) });
  await field.fill(value);
  await field.blur();
}

/**
 * 箇所数モードの全計算用フィールドへ COUNT_PARAMS を入力する。
 */
async function fillCountParams(row: Locator): Promise<void> {
  await fillCalcField(row, /箇所数/, COUNT_PARAMS.count.input);
  await fillCalcField(row, /長さ/, COUNT_PARAMS.length.input);
  await fillCalcField(row, /重量/, COUNT_PARAMS.weight.input);
  await fillCalcField(row, /調整係数/, COUNT_PARAMS.adjustmentFactor.input);
  await fillCalcField(row, /丸め設定/, COUNT_PARAMS.roundingUnit.input);
}

/**
 * 箇所数モードの全計算用フィールドと数量が COUNT_PARAMS の期待表示値であることを検証する。
 */
async function expectCountParamsRestored(row: Locator, context: string): Promise<void> {
  // 計算方法が「箇所数」（COUNT）で復元されている
  await expect(methodSelect(row), `${context}: 計算方法が COUNT で復元される`).toHaveValue('COUNT');

  // 箇所数モードの計算用フィールドがこの順序で表示される（REQ-47.2 と整合）
  const wrapper = row.locator('[data-testid="action-cell-inline-wrapper"]');
  const labels = await wrapper.evaluate((el: Element) =>
    Array.from(el.querySelectorAll('label')).map((label) =>
      (label.textContent ?? '').replace('*', '').trim()
    )
  );
  expect(labels, `${context}: 箇所数モードの計算用フィールドが復元される`).toEqual(
    COUNT_FIELD_LABELS
  );

  await expect(row.getByLabel(/箇所数/), `${context}: 箇所数`).toHaveValue(
    COUNT_PARAMS.count.display
  );
  await expect(row.getByLabel(/長さ/), `${context}: 長さ`).toHaveValue(COUNT_PARAMS.length.display);
  await expect(row.getByLabel(/重量/), `${context}: 重量`).toHaveValue(COUNT_PARAMS.weight.display);
  await expect(row.getByLabel(/調整係数/), `${context}: 調整係数`).toHaveValue(
    COUNT_PARAMS.adjustmentFactor.display
  );
  await expect(row.getByLabel(/丸め設定/), `${context}: 丸め設定`).toHaveValue(
    COUNT_PARAMS.roundingUnit.display
  );
  await expect(quantityInput(row), `${context}: 数量`).toHaveValue(COUNT_PARAMS.quantity);
}

// ============================================================================
// テスト
// ============================================================================

test.describe('REQ-47: 計算方法「箇所数」の永続化・コピー・PDF出力', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  // --------------------------------------------------------------------------
  // 事前準備（条件付きスキップは行わない。テストデータは本テスト内で必ず作成する）
  // --------------------------------------------------------------------------
  test('プロジェクト・数量表・数量項目（1件）を作成する', async ({ page }) => {
    testProjectId = await createTestProject(page, `REQ4715_PJ_${RUN_ID}`);
    testTableId = await createQuantityTable(page, `REQ4715_数量表_${RUN_ID}`);

    await addGroup(page, 1);
    await addItemToGroupAt(page, 0, 1, { ...COUNT_ITEM_FIELDS });

    // ベースライン状態を明示保存して永続化する（REQ-42.5）。
    await saveQuantityTableDraft(page);
  });

  // --------------------------------------------------------------------------
  // REQ-47.15 / 47.18: 保存・再読み込みでの全値復元と、編集のクライアントサイド化
  // --------------------------------------------------------------------------
  test('箇所数モードの全パラメータは編集中に永続化されず、保存後のリロードで計算方法・箇所数・長さ・重量・調整係数・丸め設定・数量が復元される (REQ-47.15, 47.18)', async ({
    page,
  }) => {
    await gotoEditPage(page, 1);

    // REQ-47.18: 編集操作中は永続化 API（項目の即時保存 / 保存 PUT）が発火しないことを監視する。
    const persistRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      const method = request.method();
      const isItemPersist =
        /\/api\/quantity-items(\/|$|\?)/.test(url) &&
        (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE');
      const isDraftSave = method === 'PUT' && /\/api\/quantity-tables\/[^/]+\/save$/.test(url);
      const isItemsSubroute =
        /\/api\/quantity-(tables|groups)\/[^/]+\/items(\/|$|\?)/.test(url) && method !== 'GET';
      if (isItemPersist || isDraftSave || isItemsSubroute) {
        persistRequests.push(`${method} ${url}`);
      }
    });

    const row = itemRows(page).first();
    await methodSelect(row).selectOption({ value: 'COUNT' });
    await fillCountParams(row);

    // 入力直後の数量が期待値になる（計算の健全性確認）
    await expect(quantityInput(row)).toHaveValue(COUNT_PARAMS.quantity);

    // REQ-47.18: ここまでの編集はクライアントドラフトのみで、永続化 API は一切発火していない。
    await expect
      .poll(() => persistRequests.length, {
        timeout: getTimeout(3000),
        message: `編集中に永続化 API が発火した: ${persistRequests.join(', ')}`,
      })
      .toBe(0);

    // 明示保存（REQ-42.5）→ 保存 PUT が 1 回だけ発火する。
    await saveQuantityTableDraft(page);
    expect(
      persistRequests.filter((entry) => /\/save$/.test(entry)).length,
      '明示保存で保存 API（PUT /:id/save）が1回発火する'
    ).toBe(1);

    // REQ-47.15: リロードして全値が保存前と同一表示で復元されることを検証する
    // （tasks.md Implementation Notes 68.4(a): 残留パラメータは DOM に現れないため
    // 「保存 → リロード → 復元値」で確認する）。
    await gotoEditPage(page, 1);
    await expectCountParamsRestored(itemRows(page).first(), 'リロード後');
  });

  // --------------------------------------------------------------------------
  // REQ-47.16: 箇所数項目を含むグループのコピーで計算方法と全パラメータが複製される
  // --------------------------------------------------------------------------
  test('箇所数項目を含むグループをコピーすると、複製先の項目に計算方法「箇所数」と箇所数・長さ・重量・調整係数・丸め設定が複製される (REQ-47.16)', async ({
    page,
  }) => {
    await gotoEditPage(page, 1);
    await expect(groupCards(page)).toHaveCount(1, { timeout: getTimeout(10000) });

    // 複製元グループの箇所数項目が期待状態であることを前提確認する。
    await expectCountParamsRestored(itemRows(page).first(), 'コピー前（複製元）');

    // グループをコピー（REQ-42.4: クライアントドラフト複製。サーバー POST /copy は発火しない）。
    const copyButton = groupCards(page).first().getByRole('button', { name: 'グループをコピー' });
    await expect(copyButton).toBeVisible({ timeout: getTimeout(5000) });
    await copyButton.click();

    // 複製先グループが元グループの直下（index=1）に出現する（REQ-38.7）。
    await expect(groupCards(page)).toHaveCount(2, { timeout: getTimeout(15000) });

    // REQ-47.16: 複製先グループの項目に計算方法「箇所数」と全計算パラメータが複製される（ドラフト直後）。
    const copiedRow = groupCards(page).nth(1).locator('[data-testid="quantity-item-row"]').first();
    await expect(copiedRow).toBeVisible({ timeout: getTimeout(10000) });
    await expectCountParamsRestored(copiedRow, 'コピー直後（複製先ドラフト）');

    // 保存 → リロードでも複製先の箇所数パラメータが永続化・復元される。
    await saveQuantityTableDraft(page);
    await gotoEditPage(page, 2);
    await expect(groupCards(page)).toHaveCount(2, { timeout: getTimeout(10000) });

    const originalRowAfter = groupCards(page)
      .nth(0)
      .locator('[data-testid="quantity-item-row"]')
      .first();
    const copiedRowAfter = groupCards(page)
      .nth(1)
      .locator('[data-testid="quantity-item-row"]')
      .first();
    await expectCountParamsRestored(originalRowAfter, 'コピー保存後リロード（複製元）');
    await expectCountParamsRestored(copiedRowAfter, 'コピー保存後リロード（複製先）');
  });

  // --------------------------------------------------------------------------
  // REQ-47.17: PDF出力の計算方法欄が「箇所数」と表示され「ピッチ」ではない
  //
  // 68.5 のフォールバック回帰検出: `CalculationMethod` 型の非対称性により COUNT が
  // ラベル変換のネスト三項の最終分岐「ピッチ」へ化ける不具合の再発を、PDF テキストに
  // 「ピッチ」が現れず「箇所数」が現れることで検出する（表には箇所数項目のみを含める）。
  // --------------------------------------------------------------------------
  test('箇所数項目を含む数量表をPDF出力すると計算方法欄が「箇所数」と表示され「ピッチ」ではない (REQ-47.17)', async ({
    page,
  }) => {
    // 直前のコピーで表には箇所数項目が2件（複製元＋複製先）ある。いずれもピッチではないため、
    // PDF テキストに「ピッチ」が現れなければ COUNT→「ピッチ」フォールバック回帰は無い。
    await gotoEditPage(page, 2);

    const pdfButton = page.getByRole('button', { name: 'PDF出力' });
    await expect(pdfButton).toBeVisible({ timeout: getTimeout(10000) });

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });
    await pdfButton.click();
    const download = await downloadPromise;

    // ファイル名は「{数量表名}.pdf」（REQ-26.11）。
    expect(download.suggestedFilename(), 'PDFファイル名は .pdf で終わる').toMatch(/\.pdf$/);

    const downloadPath = await download.path();
    expect(downloadPath, 'ダウンロードされた PDF のパスが取得できる').toBeTruthy();

    const pdfText = await extractPdfText(downloadPath as string);

    // 抽出テキストが空でない（PDF が正しく生成・抽出された）ことを確認する。
    expect(pdfText.length, 'PDF テキストが抽出できる').toBeGreaterThan(0);

    // 箇所数項目が PDF 内に出力されている（REQ-47.17: 他方式と同様に出力）。
    expect(
      pdfText.includes(COUNT_ITEM_FIELDS.name),
      `PDF に箇所数項目「${COUNT_ITEM_FIELDS.name}」が出力される`
    ).toBe(true);

    // REQ-47.17 / 68.5 回帰検出: 計算方法欄が「箇所数」と表示される。
    expect(pdfText.includes('箇所数'), 'PDF の計算方法欄に「箇所数」が出力される').toBe(true);

    // フォールバック回帰（COUNT→「ピッチ」）が無いこと。表にはピッチ項目を含めていないため、
    // 「ピッチ」が現れれば COUNT がフォールバックした証跡となる。
    expect(
      pdfText.includes('ピッチ'),
      'PDF の計算方法欄が「ピッチ」へフォールバックしていない（68.5 回帰検出）'
    ).toBe(false);
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
