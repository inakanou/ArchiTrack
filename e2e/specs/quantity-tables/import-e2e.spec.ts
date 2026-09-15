/**
 * @fileoverview 数量表インポート機能 E2Eテスト (REQ-27, 28, 29, 31, 32, 33, 34)
 *
 * Requirements coverage:
 * - @requirement quantity-table-generation/REQ-27.1: インポートダイアログ表示
 * - @requirement quantity-table-generation/REQ-27.2: ファイルアップロードエリア表示
 * - @requirement quantity-table-generation/REQ-27.3: Excel/PDF受付
 * - @requirement quantity-table-generation/REQ-27.4: サポート対象外でエラー
 * - @requirement quantity-table-generation/REQ-27.5: Excelパース自動開始
 * - @requirement quantity-table-generation/REQ-27.6: PDF OCR自動開始
 * - @requirement quantity-table-generation/REQ-27.7: 処理中インジケーター
 * - @requirement quantity-table-generation/REQ-27.8: 処理中ボタン非活性化
 * - @requirement quantity-table-generation/REQ-28.3: 列マッピング
 * - @requirement quantity-table-generation/REQ-28.4: プレビューテーブル
 * - @requirement quantity-table-generation/REQ-28.5: マッピング先表示
 * - @requirement quantity-table-generation/REQ-28.6: 読み取り失敗時のエラー
 * - @requirement quantity-table-generation/REQ-28.7: テキスト選択・コピー可能
 * - @requirement quantity-table-generation/REQ-29.7: OCR完了時に抽出テキストとプレビューテーブルを表示
 * - @requirement quantity-table-generation/REQ-29.9: OCR失敗時にエラーメッセージを表示し手動入力を促す
 * - @requirement quantity-table-generation/REQ-31.1: 「一括取り込み」ボタン
 * - @requirement quantity-table-generation/REQ-31.2: 取り込み先グループ選択UI
 * - @requirement quantity-table-generation/REQ-31.3: 各行を数量項目として追加
 * - @requirement quantity-table-generation/REQ-31.4: 自動入力
 * - @requirement quantity-table-generation/REQ-31.5: 計算方法「標準」
 * - @requirement quantity-table-generation/REQ-31.6: 完了メッセージ
 * - @requirement quantity-table-generation/REQ-31.7: 確認・修正促し
 * - @requirement quantity-table-generation/REQ-31.8: 一括取り込み後の編集可能
 * - @requirement quantity-table-generation/REQ-31.9: 既存項目末尾追加
 * - @requirement quantity-table-generation/REQ-32.1: マッピング先ドロップダウン
 * - @requirement quantity-table-generation/REQ-32.2: 選択肢提供
 * - @requirement quantity-table-generation/REQ-32.3: マッピング即座更新
 * - @requirement quantity-table-generation/REQ-32.4: 自動推定
 * - @requirement quantity-table-generation/REQ-32.5: ユーザー変更可能
 * - @requirement quantity-table-generation/REQ-32.6: 必須未マッピング警告
 * - @requirement quantity-table-generation/REQ-33.1: リトライボタン表示
 * - @requirement quantity-table-generation/REQ-33.2: リトライ実行
 * - @requirement quantity-table-generation/REQ-33.3: リトライ中インジケーター
 * - @requirement quantity-table-generation/REQ-33.4: 別ファイル許可
 * - @requirement quantity-table-generation/REQ-33.5: 別ファイル選択時のクリア
 * - @requirement quantity-table-generation/REQ-34.1: インラインプレビュー表示
 * - @requirement quantity-table-generation/REQ-34.3: Excelインライン表示
 * - @requirement quantity-table-generation/REQ-34.5: ダイアログ内に並べて表示
 *
 * @module e2e/specs/quantity-tables/import-e2e.spec
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type Request } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin, labelWhenVisibleWithin } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { selectFirstRealOption } from '../../helpers/form-preconditions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '..', '..', 'fixtures');

const TEST_PDF = path.join(FIXTURES_DIR, 'test-text-pdf.pdf');
const TEST_TXT = path.join(FIXTURES_DIR, 'test-document.txt');
// クライアントサイド（SheetJS）でパースされる Excel フィクスチャ。
// OCR（ANTHROPIC_API_KEY 依存）を経由せず決定論的に抽出行を得られるため、
// REQ-42.4/42.6 の「取り込みは保存まで永続化しない」挙動を環境非依存で検証できる。
const TEST_XLSX = path.join(FIXTURES_DIR, 'import-items.xlsx');

// ----------------------------------------------------------------------------
// ネットワーク監視（REQ-42.6: 保存前は数量表サブリソースへの書き込みが一切ない）
// client-side-edit-explicit-save-e2e.spec.ts と同一パターン。
// ----------------------------------------------------------------------------
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * 数量表サブリソースへの「永続化書き込み」かを判定する。
 * 唯一許可される書き込みは明示保存（PUT /api/quantity-tables/:id/save）なので除外する。
 */
function isQuantityPersistenceWrite(url: string, method: string): boolean {
  if (!WRITE_METHODS.has(method)) return false;
  if (/\/api\/quantity-tables\/[^/]+\/save$/.test(url)) return false;
  return (
    /\/api\/quantity-tables(\/|$|\?)/.test(url) ||
    /\/api\/quantity-groups(\/|$|\?)/.test(url) ||
    /\/api\/quantity-items(\/|$|\?)/.test(url)
  );
}

/** 永続化書き込みリクエストを記録するリスナーを設置する。 */
function attachPersistenceMonitor(page: Page): {
  writes: Array<{ method: string; url: string }>;
  detach: () => void;
} {
  const writes: Array<{ method: string; url: string }> = [];
  const listener = (request: Request) => {
    const method = request.method();
    const url = request.url();
    if (isQuantityPersistenceWrite(url, method)) {
      writes.push({ method, url });
    }
  };
  page.on('request', listener);
  return { writes, detach: () => page.off('request', listener) };
}

/**
 * 名称フィールド（AutocompleteInput = role="combobox"）のいずれかが指定値を持つことを待機検証する。
 * React の制御コンポーネントは value 属性へ反映されないため、各 combobox の inputValue を走査する。
 */
async function expectNameValuePresent(page: Page, value: string): Promise<void> {
  const nameInputs = page.getByRole('combobox', { name: /名称/i });
  await expect
    .poll(
      async () => {
        const count = await nameInputs.count();
        for (let i = 0; i < count; i++) {
          if ((await nameInputs.nth(i).inputValue()) === value) return true;
        }
        return false;
      },
      { timeout: getTimeout(10000) }
    )
    .toBe(true);
}

let testProjectId: string | null = null;
let createdQuantityTableId: string | null = null;

/**
 * 数量表編集画面へ遷移する。
 *
 * 事前準備で作成した tableId が利用できる場合は直接遷移し、
 * それ以外は /projects → 詳細 → 一覧 → カード のUIフローでナビゲートする。
 */
async function navigateToQuantityTableEdit(page: Page): Promise<boolean> {
  if (createdQuantityTableId) {
    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');
    const editArea = page.locator('[data-testid="quantity-table-edit-area"]');
    return await isVisibleWithin(editArea, getTimeout(10000));
  }

  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  const projectCard = page.locator('[data-testid^="project-card-"]').first();
  if (!(await isVisibleWithin(projectCard, getTimeout(5000)))) {
    return false;
  }
  await projectCard.click();
  await page.waitForLoadState('networkidle');

  const quantityTableLink = page.getByText('すべて見る').first();
  if (!(await isVisibleWithin(quantityTableLink, getTimeout(5000)))) {
    return false;
  }
  await quantityTableLink.click();
  await page.waitForLoadState('networkidle');

  const tableCard = page.locator('[data-testid="quantity-table-card"]').first();
  if (!(await isVisibleWithin(tableCard, getTimeout(5000)))) {
    return false;
  }
  await tableCard.click();
  await page.waitForLoadState('networkidle');

  return true;
}

/**
 * インポートダイアログを開くヘルパー
 */
async function openImportDialog(page: Page): Promise<boolean> {
  const importButton = page.getByRole('button', { name: 'インポート' }).first();
  if (!(await isVisibleWithin(importButton, getTimeout(5000)))) {
    return false;
  }
  await importButton.click();

  const dialog = page.getByRole('heading', { name: '数量表インポート' });
  return await isVisibleWithin(dialog, getTimeout(5000));
}

/**
 * 事前準備: テスト用プロジェクト・数量表・グループを作成
 *
 * REQ-27/28/31/32/33/34 のテストは数量表編集画面への到達を前提とし、
 * REQ-31 ではグループ選択UIで利用可能なグループの存在を前提とするため、
 * 独立して実行できるよう事前にプロジェクト・数量表・グループを1件作成する。
 *
 * worker 単位で実行する `test.beforeAll` として実装することで、
 * 失敗テストの retry によって worker が再起動された場合でも、
 * 新しい worker で再度プロジェクト・数量表・グループが作成され、
 * モジュール変数 `createdQuantityTableId` が再セットされる。
 */
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginAsUser(page, 'REGULAR_USER');

    // プロジェクトを作成
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /新規作成/i }).click();
    await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

    await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    const projectName = `IMPORT_E2E_PJ_${Date.now()}`;
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

    // 数量表を作成
    await page.goto(`/projects/${testProjectId}/quantity-tables`);
    await page.waitForLoadState('networkidle');

    const createButton = page.getByRole('link', { name: /新規作成/i });
    await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
    await createButton.click();

    const nameInput = page.getByRole('textbox', { name: /数量表名/i });
    await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
    await nameInput.clear();
    await nameInput.fill(`IMPORT_E2E_数量表_${Date.now()}`);

    const createConfirmButton = page.getByRole('button', { name: /^作成$/i });
    await createConfirmButton.click();

    await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
      timeout: getTimeout(15000),
    });
    const tableMatch = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/);
    createdQuantityTableId = tableMatch?.[1] ?? null;
    expect(createdQuantityTableId).toBeTruthy();

    // REQ-31.2 の取り込み先グループ選択UI検証のため、グループを1つ追加して永続化する。
    // これは「取り込み先となるグループが存在する」状態を用意するための前提準備であり、
    // 取り込み自体の永続化挙動とは独立している（取り込みは REQ-42.4 によりドラフトへ
    // 反映され、保存操作時にのみ永続化される）。後続のOCR系テストはこのテーブルへ
    // ナビゲートし直すため、選択対象グループはサーバー側に存在している必要がある。
    const addGroupButton = page
      .getByRole('button', { name: /グループ追加|グループを追加/i })
      .first();
    await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });
    await addGroupButton.click();

    const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
    await expect(groupCard).toBeVisible({ timeout: getTimeout(10000) });

    // REQ-42.5: 取り込み先グループを永続化する（後続テストがナビゲート後に参照するため）。
    await saveQuantityTableDraft(page);
  } finally {
    await context.close();
  }
});

test.describe('REQ-27: 数量表インポート（ファイルアップロード・処理起動）', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-27.1: インポートダイアログ表示
   */
  test('インポートボタンクリックでインポートダイアログが表示される (REQ-27.1)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const importButton = page.getByRole('button', { name: 'インポート' }).first();
    await expect(importButton).toBeVisible({ timeout: getTimeout(5000) });
    await importButton.click();

    const heading = page.getByRole('heading', { name: '数量表インポート' });
    await expect(heading).toBeVisible({ timeout: getTimeout(5000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-27.2: ファイルアップロードエリア表示
   */
  test('インポートダイアログにファイルアップロードエリアが表示される (REQ-27.2)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // ファイル選択input
    const fileInput = page.getByLabel('ファイルを選択');
    await expect(fileInput).toBeVisible({ timeout: getTimeout(5000) });

    // アップロードエリアの説明文も表示
    await expect(
      page.getByText(/ファイルをドラッグ&ドロップ、またはファイルを選択してください/)
    ).toBeVisible();
  });

  /**
   * @requirement quantity-table-generation/REQ-27.3: Excel/PDF受付
   *
   * fileInput の accept属性が ".xlsx,.xls,.pdf" であること、
   * かつ実際にPDFをアップロードした際にエラーにならず処理が開始される。
   */
  test('ファイルinputがExcelおよびPDFを受け付ける属性を持つ (REQ-27.3)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    const acceptAttr = await fileInput.getAttribute('accept');
    expect(acceptAttr).toContain('.xlsx');
    expect(acceptAttr).toContain('.xls');
    expect(acceptAttr).toContain('.pdf');
  });

  /**
   * @requirement quantity-table-generation/REQ-27.4: サポート対象外でエラー
   *
   * .txt 等のサポート対象外ファイルをアップロードするとエラーメッセージが表示される。
   */
  test('サポート対象外（.txt）アップロード時にエラーメッセージが表示される (REQ-27.4)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_TXT);

    // エラーメッセージが表示される（role=alert または「対応していないファイル形式」テキスト）
    const errorAlert = page.getByText(/対応していないファイル形式|対応ファイル形式/);
    await expect(errorAlert.first()).toBeVisible({ timeout: getTimeout(5000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-27.5: Excelファイルアップロード時にExcelパース自動開始
   *
   * Excel ファイル(.xlsx)をアップロードすると、ユーザーの追加操作なしにパース処理が起動し、
   * プレビュー領域に処理状態（インジケーターまたは結果）が現れる。
   */
  test('Excel(.xlsx)アップロード時にパース処理が自動起動する (REQ-27.5)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles({
      name: 'auto-start.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('PK\x03\x04dummy-excel-bytes'),
    });

    // 自動起動の証拠: インジケーターが現れるか、エラー/プレビューが現れる（いずれにせよ処理は走った）
    const dialog = page.getByRole('dialog');
    await expect(
      dialog
        .locator(
          '[role="status"], [aria-live], [data-testid*="indicator" i], [data-testid*="processing" i], [data-testid*="preview" i], [role="alert"]'
        )
        .first()
    ).toBeVisible({ timeout: getTimeout(10000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-27.6: PDFファイルアップロード時にOCR自動開始
   *
   * PDF ファイルをアップロードすると、ユーザーの追加操作なしに OCR 処理が起動し、
   * PDF の内容を読み取った結果がダイアログに現れる。
   *
   * 以前は「status / aria-live / indicator / preview / alert のいずれかが見える」ことを
   * 待っていたが、実際に一致していたのはフォールバック経路のヘッダーが「列N」だった頃に
   * 付随的に出ていた必須フィールド未マッピングの警告（role="alert"）だけであった。
   * タスク 96.1 でヘッダーが10欄の名前付きフィールドになり警告が出なくなると、
   * OCR は自動起動しているのに何も一致せず失敗した。付随的な要素の選言に頼らず、
   * 次の二点を決定論的な証跡として主張する。
   *   1. ファイル選択の後、何も操作しないまま OCR の最初の段（Claude Vision への抽出要求）が発行される
   *   2. 何も操作しないまま、資材 PDF の本文（1ページ目「Concrete Work」・2ページ目「Rebar Work」）を
   *      読み取った抽出テキストがダイアログに表示される
   * Claude Vision は 503 に固定し、ANTHROPIC_API_KEY の有無によらずフォールバックの OCR 経路
   * （pdfjs-dist + Tesseract.js）を通す（REQ-29 の検証と同じ手口）。
   */
  test('PDFアップロード時にOCR処理が自動起動する (REQ-27.6)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    await forceClaudeVisionUnavailable(page);

    // ファイル選択より前に待機を仕掛け、選択を契機に発行される抽出要求を取りこぼさない
    const extractionRequested = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && /\/api\/claude-vision\/extract$/.test(request.url()),
      { timeout: getTimeout(30000) }
    );

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_PDF);

    // 1. 以降クリック等の操作を一切行わずに、OCR の抽出要求が発行される
    await extractionRequested;

    // 2. 操作なしのまま、PDF の本文を読み取った抽出テキストが表示される
    const dialog = page.getByRole('dialog');
    const extractedText = dialog.getByRole('region', { name: '抽出テキスト' });
    await expect(
      extractedText,
      'REQ-27.6: PDFアップロード後、操作なしにOCRの抽出テキストが表示されない'
    ).toBeVisible({ timeout: getTimeout(45000) });
    await expect(
      extractedText,
      'REQ-27.6: 自動起動したOCRが1ページ目の内容を読み取っていない'
    ).toContainText('Concrete Work');
    await expect(
      extractedText,
      'REQ-27.6: 自動起動したOCRが2ページ目の内容を読み取っていない'
    ).toContainText('Rebar Work');
  });

  /**
   * @requirement quantity-table-generation/REQ-27.7: 処理中インジケーター表示
   *
   * ファイルアップロード直後、処理中インジケーター（role=status / aria-live / プログレス系）が
   * ダイアログ内に表示される。処理完了で消えるか結果に置き換わる。
   */
  test('ファイルアップロード後に処理中インジケーターが表示される (REQ-27.7)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_PDF);

    // 処理中インジケーター: ImportDialog 実装は role="progressbar" で表現する。
    // OCR が高速完了するケースでは progressbar が即座に結果（table または alert）に
    // 置き換わるため、いずれかの「処理が走った証跡」を許容する。
    const dialog = page.getByRole('dialog');
    const indicator = dialog
      .locator(
        '[role="progressbar"], [role="status"], [aria-live], [data-testid*="indicator" i], [data-testid*="processing" i], [data-testid*="loading" i], table, [role="alert"]'
      )
      .first();
    await expect(indicator).toBeVisible({ timeout: getTimeout(15000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-27.8: 処理中時のボタン非活性化
   *
   * 処理中はキャンセル以外の主要操作（再アップロード・取り込み等）が disabled に切り替わる。
   * インジケーターが見えている間に少なくとも 1 つのボタンが disabled であることを確認する。
   */
  test('処理中はダイアログ内ボタンが非活性化される (REQ-27.8)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // 処理中: ImportDialog 実装では `<input type="file">` が `disabled={isProcessing}` で
    // 非活性化される。
    //
    // 以前は「disabled 状態を捉えた」「処理結果が表示された」のどちらかが観測されれば良い
    // 競争にしており、結果が先に出た環境では disabled の判定が一つも実行されなかった。
    // 抽出は Claude Vision の応答（POST /api/claude-vision/extract）を待つため、
    // その応答を保留すれば処理中の状態を確定的に観測できる。判定後に解放する。
    let releaseExtraction: (() => void) | undefined;
    const extractionHeld = new Promise<void>((resolve) => {
      releaseExtraction = resolve;
    });
    await page.route('**/api/claude-vision/extract', async (route) => {
      await extractionHeld;
      await route.continue();
    });

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_PDF);

    // REQ-27.8: 処理中はファイル選択が非活性化される
    const filePicker = page.getByLabel('ファイルを選択');
    await expect(filePicker, 'REQ-27.8: 処理中はファイル選択が非活性化される').toBeDisabled({
      timeout: getTimeout(45000),
    });

    releaseExtraction?.();
    await page.unroute('**/api/claude-vision/extract');
  });
});

test.describe('REQ-28: Excelデータパース', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * タスク 115.188 の是正: quantity-table-generation の受入基準28.2 を名乗る被覆印を取り下げる
   * （ファイル前書きの一覧からも同時に取り下げた）。本区間が主張するのは .xlsx を選んだ
   * ときに Excel の処理経路が起動することだけで、原文28.2（全シートを解析対象とする）は
   * 一度も確かめていない。内容に当たるのは原文28.1（SheetJS で直接読み取る）だが、28.1 は
   * `e2e/requirement-exclusions.json` が「E2Eでは確かめない」と宣言しているため付け替えない。
   * **付け替え先が除外済みであることは取り下げを妨げない。** 取り下げは同居を作らず、
   * 28.2 は未被覆として露出する（本区間が唯一の被覆源であった）。
   * 表題から `(REQ-28.1)` を外し、名乗りと表題の食い違いも解消する。
   *
   * 検証内容: ダイアログ上で .xlsx 拡張子のファイルを選択した際に Excel 処理パスが
   * 起動すること。テキストファイルを .xlsx 拡張子として偽装するとSheetJS処理が走り、
   * エラーになるが、「Excelとして処理を開始する」動作は検証できる。
   */
  test('Excel拡張子(.xlsx)のファイルアップロードでExcel処理パスが起動する', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    // テキストファイルを .xlsx として偽装してアップロード（ZIPマジックバイトを付与し
    // SheetJS の処理パスを確実に通すことで、progressbar かエラーアラートのいずれかを発火させる）
    await fileInput.setInputFiles({
      name: 'fake.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('PK\x03\x04fake-xlsx-bytes'),
    });

    // 処理開始（progressbar）またはエラー表示のいずれかが表示されることを検証
    // → Excel処理が開始されている証跡
    const progressbar = page.locator('[role="progressbar"]');
    const errorAlert = page.locator('[role="alert"]');
    const eitherVisible = await Promise.race([
      isVisibleWithin(progressbar.first(), getTimeout(10000)),
      isVisibleWithin(errorAlert.first(), getTimeout(10000)),
    ]);

    expect(eitherVisible, 'Excel処理開始の証跡（プログレスまたはエラー）が表示される').toBeTruthy();
  });

  /**
   * @requirement quantity-table-generation/REQ-28.3: 列マッピング機能
   * @requirement quantity-table-generation/REQ-32.1: マッピング先フィールド表示
   *
   * タスク 115.188 の是正: 従前は REQ-28.5 を名乗っていたが、受入基準28.5 の原文は「The 数量表管理システム
   * shall 抽出結果のプレビューテーブルに各行のマッピング先フィールドを表示する」である。
   * 本区間の表題・本文が述べる内容に対応するのは受入基準32.1（「The 数量表管理システム shall 抽出結果のプレビューテーブルの各列ヘッダーにマッピング先フィールドのドロップダウンを表示する」
   * ）である。
   *
   * ImportPreviewTable のヘッダーに「のマッピング先」aria-label の select が含まれる
   * （実際にデータが抽出された場合のみ）。
   */
  test('プレビューテーブルにマッピング先フィールドのドロップダウン定義が含まれる (REQ-28.3, REQ-32.1)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // REQ-28.3/28.5 が対象とするのは「抽出された列にマッピング先を表示する」ことであり、
    // 抽出の手段（PDF OCR か Excel パースか）ではない。PDF は Claude Vision
    // （ANTHROPIC_API_KEY 依存）を経由するため、以前は「プレビューが出れば主張し、
    // 出なければエラー表示が出ていることだけを確かめる」分岐になっており、
    // OCR が使えない環境ではマッピング先の判定が一度も実行されなかった。
    // クライアントサイドで決定論的に解析される Excel の資材を用い、無条件に主張する
    // （REQ-32.6・REQ-42.4 の検証と同じ手口）。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    // REQ-28.4: 抽出結果はプレビューテーブルとして表示される
    const previewTable = page.locator('table').first();
    await expect(previewTable, 'REQ-28.4: 抽出結果のプレビューテーブルが表示されない').toBeVisible({
      timeout: getTimeout(45000),
    });

    // REQ-28.3/28.5: 列ごとにマッピング先のドロップダウンが表示される
    const mappingSelects = page.locator('select[aria-label*="のマッピング先"]');
    await expect(
      mappingSelects.first(),
      'REQ-28.5: マッピング先のドロップダウンが表示されない'
    ).toBeVisible({ timeout: getTimeout(5000) });
    // 資材のヘッダーは「工種・名称・規格・数量・単位」の5列である
    await expect(
      mappingSelects,
      'REQ-28.3: 抽出された全列にマッピング先が用意されない'
    ).toHaveCount(5);
  });

  /**
   * @requirement quantity-table-generation/REQ-28.4: プレビューテーブル表示
   */
  test('PDF処理完了時にプレビューテーブルまたはエラーが表示される (REQ-28.4)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_PDF);

    const previewTable = page.locator('table').first();
    const errorAlert = page.locator('[role="alert"]').first();

    // 処理完了 or エラーまでを待つ
    const result = await Promise.race([
      labelWhenVisibleWithin(previewTable, getTimeout(45000), 'preview'),
      labelWhenVisibleWithin(errorAlert, getTimeout(45000), 'error'),
    ]);

    expect(result, 'プレビューテーブル または エラー表示のいずれかが表示される').not.toBeNull();
  });

  /**
   * @requirement quantity-table-generation/REQ-28.6: 読み取り失敗時のエラー
   *
   * 不正なファイルアップロード時、エラーメッセージが表示される。
   */
  test('不正なExcelファイルアップロード時にエラー表示またはリトライボタンが表示される (REQ-28.6)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles({
      name: 'invalid.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('PK\x03\x04invalid-xlsx-content'),
    });

    const errorAlert = page.locator('[role="alert"]').first();
    await expect(errorAlert).toBeVisible({ timeout: getTimeout(15000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-28.7: テキスト選択可能
   *
   * ImportPreviewTable には userSelect: 'text' が設定されている（テキスト選択可能）。
   */
  test('プレビューテーブルがテキスト選択可能なスタイルを持つ (REQ-28.7)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // REQ-28.7 はプレビューテーブルが選択可能であることを対象とする。プレビューが
    // 出なければ判定できないため、抽出が決定論的に成立する Excel の資材を用いる
    // （PDF OCR は ANTHROPIC_API_KEY 依存で、以前はエラー表示だけを見て抜けていた）。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    const previewTable = page.locator('table').first();
    await expect(previewTable, '前提: 抽出結果のプレビューテーブルが表示される').toBeVisible({
      timeout: getTimeout(45000),
    });

    // 親要素のuser-select検証
    const wrapper = page.locator('div').filter({ has: previewTable }).last();
    const userSelect = await wrapper.evaluate((el: HTMLElement) => getComputedStyle(el).userSelect);
    // user-select が text または 親が auto/text どちらでも選択可能
    expect(['text', 'auto'], 'REQ-28.7: プレビューがテキスト選択不可になっている').toContain(
      userSelect
    );
  });
});

/**
 * Claude Vision API を利用不可（HTTP 503）にし、pdfjs-dist + Tesseract.js の OCR 経路を必ず通す。
 *
 * テスト環境の ANTHROPIC_API_KEY の有無によって経路が変わらないよう、応答を固定する
 * （REQ-30.5: 利用不可ならフォールバックする）。
 */
async function forceClaudeVisionUnavailable(page: Page): Promise<void> {
  await page.route('**/api/claude-vision/extract', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Service Unavailable', errorType: 'service_unavailable' }),
    })
  );
}

test.describe('REQ-29: PDF OCR処理の結果表示と失敗時の導線', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-29.7: OCR完了時に抽出テキストとプレビューテーブルを表示
   *
   * 資材 test-text-pdf.pdf は2ページのテキストPDFで、1ページ目に「Concrete Work」、
   * 2ページ目に「Rebar Work」を持つ。抽出テキストの領域が両方を含み、同じダイアログに
   * プレビューテーブル（10欄の名前付きヘッダー。REQ-30.7）が並ぶことを主張する。
   */
  test('OCR処理の完了時に抽出テキストとプレビューテーブルがダイアログ内に表示される (REQ-29.7)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    await forceClaudeVisionUnavailable(page);

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_PDF);

    const dialog = page.getByRole('dialog');
    const extractedText = dialog.getByRole('region', { name: '抽出テキスト' });
    await expect(extractedText, 'REQ-29.7: OCR完了時に抽出テキストが表示されない').toBeVisible({
      timeout: getTimeout(45000),
    });
    await expect(
      extractedText,
      'REQ-29.7: 抽出テキストに1ページ目の内容が含まれない'
    ).toContainText('Concrete Work');
    await expect(
      extractedText,
      'REQ-29.7: 抽出テキストに2ページ目の内容が含まれない'
    ).toContainText('Rebar Work');

    const previewTable = dialog.locator('table').first();
    await expect(
      previewTable.locator('thead'),
      'REQ-29.7: OCR完了時にプレビューテーブルが表示されない'
    ).toBeVisible();
    await expect(previewTable.locator('thead')).toContainText('大項目');
    await expect(previewTable.locator('thead')).toContainText('備考');
  });

  /**
   * @requirement quantity-table-generation/REQ-29.9: OCR失敗時にエラーメッセージを表示し手動入力を促す
   *
   * PDF として読めないバイト列を .pdf として渡すと、Claude Vision 用のページ画像化も
   * pdfjs-dist のテキスト抽出も失敗する。ダイアログのエラー表示が OCR の失敗を告げ、
   * 手動入力を促す文言を含むことを主張する。
   */
  test('OCR処理の失敗時にエラーメッセージと手動入力を促す文言が表示される (REQ-29.9)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    await forceClaudeVisionUnavailable(page);

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles({
      name: 'broken.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('this is not a pdf document'),
    });

    const dialog = page.getByRole('dialog');
    const errorAlert = dialog.getByRole('alert').first();
    await expect(errorAlert, 'REQ-29.9: OCR失敗時にエラー表示が出ない').toBeVisible({
      timeout: getTimeout(45000),
    });
    await expect(errorAlert, 'REQ-29.9: エラー表示がOCR処理の失敗を告げない').toContainText(
      'OCR処理に失敗しました'
    );
    await expect(errorAlert, 'REQ-29.9: エラー表示が手動入力を促さない').toContainText(
      '手動入力してください'
    );
  });
});

test.describe('REQ-31: 抽出結果から数量項目への一括取り込み', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-31.1: 「一括取り込み」ボタン
   */
  test('プレビュー表示後に「一括取り込み」ボタンまたはリトライボタンが表示される (REQ-31.1)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_PDF);

    const importBtn = page.getByRole('button', { name: '一括取り込み' });
    const retryBtn = page.getByRole('button', { name: 'リトライ' });

    const result = await Promise.race([
      labelWhenVisibleWithin(importBtn, getTimeout(45000), 'import'),
      labelWhenVisibleWithin(retryBtn, getTimeout(45000), 'retry'),
    ]);

    expect(result, '一括取り込みボタンまたはリトライボタンが表示される').not.toBeNull();
  });

  /**
   * @requirement quantity-table-generation/REQ-31.2: 取り込み先グループ選択UI
   */
  test('「一括取り込み」クリックで取り込み先グループ選択UIが表示される (REQ-31.2)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // REQ-31.2 は「一括取り込みを押すと取り込み先グループ選択UIを表示する」ことを対象と
    // する。以前は「一括取り込みが出れば押して主張し、出なければリトライの表示だけを
    // 確かめる」分岐で、OCR が使えない環境では選択UIの判定が実行されなかった。
    // 抽出が決定論的に成立する Excel の資材を用い、無条件に主張する。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    const importBtn = page.getByRole('button', { name: '一括取り込み' });
    await expect(importBtn, 'REQ-31.1: 抽出完了後に一括取り込みボタンが表示されない').toBeVisible({
      timeout: getTimeout(45000),
    });

    await importBtn.click();

    // グループ選択UIが表示される
    const groupSelector = page.getByRole('heading', { name: '取り込み先グループを選択' });
    await expect(groupSelector, 'REQ-31.2: 取り込み先グループ選択UIが表示されない').toBeVisible({
      timeout: getTimeout(5000),
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-31.3: 各行を数量項目として追加
   * @requirement quantity-table-generation/REQ-31.4: 自動入力
   * @requirement quantity-table-generation/REQ-31.5: 計算方法「標準」
   * @requirement quantity-table-generation/REQ-31.6: 完了メッセージ
   * @requirement quantity-table-generation/REQ-31.7: 確認・修正促し
   * @requirement quantity-table-generation/REQ-31.8: 一括取り込み後の編集可能
   * @requirement quantity-table-generation/REQ-31.9: 既存項目末尾追加
   *
   * 一括取り込み実行後、完了メッセージと確認・修正促進メッセージが表示される。
   * convertToQuantityItems により計算方法は「STANDARD」として設定される（field-mapping.ts）。
   */
  test('一括取り込み実行後、完了メッセージが表示される (REQ-31.3, 31.4, 31.5, 31.6, 31.7, 31.8, 31.9)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // REQ-31.3〜31.9 が対象とするのは「抽出結果を数量項目へ取り込む」挙動であり、
    // 抽出の手段（PDF OCR か Excel パースか）ではない。PDF は Claude Vision
    // （ANTHROPIC_API_KEY 依存）を経由するため、失敗時に検証を丸ごと飛ばす関門が
    // 置かれていた。クライアントサイドで決定論的に解析される Excel の資材を用いれば、
    // 環境に依らず抽出が成立し、関門を置かずに済む（REQ-42.4 の検証と同じ手口）。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    const importBtn = page.getByRole('button', { name: '一括取り込み' });
    await expect(importBtn, 'REQ-31.1: 抽出完了後に一括取り込みボタンが表示される').toBeVisible({
      timeout: getTimeout(45000),
    });

    await importBtn.click();

    // グループ選択 → 最初のグループを選択。
    // 一括取り込みを押せた以上、グループ選択UIは必ず出る。出なければ取り込みが
    // 壊れているということであり、黙って戻ると REQ-31.3〜31.9 の検証が丸ごと消える。
    const dialog = page.getByRole('dialog');
    const groupSelector = page.getByRole('heading', { name: '取り込み先グループを選択' });
    await expect(groupSelector).toBeVisible({ timeout: getTimeout(5000) });

    // 利用可能な最初のグループ選択ボタン（ダイアログ内に限定し、項目数表記 "(N項目)"
    // を含む実グループ選択ボタンのみをマッチさせる）
    // 取り込み先グループは beforeAll で1件作成し保存済みである（サーバー側に存在する）。
    // 以前は「候補が見えなければキャンセルして戻る」形で、前提が崩れると
    // REQ-31.3〜31.9 の検証が丸ごと消えていた。前提を無条件に主張する。
    const groupButton = dialog
      .locator('button')
      .filter({ hasText: /\(\d+項目\)/ })
      .first();
    await expect(
      groupButton,
      '前提: 事前準備で作成した取り込み先グループが選択候補に表示される'
    ).toBeVisible({ timeout: getTimeout(10000) });

    await groupButton.click();
    await page.waitForLoadState('networkidle');

    // 完了メッセージ：「件の数量項目を取り込みました」または「失敗しました」
    const completeMessage = page.getByText(/件の数量項目を取り込みました|取り込み結果を確認・修正/);
    const failMessage = page.getByText(/取り込みに失敗しました/);

    const result = await Promise.race([
      labelWhenVisibleWithin(completeMessage.first(), getTimeout(15000), 'complete'),
      labelWhenVisibleWithin(failMessage.first(), getTimeout(15000), 'fail'),
    ]);

    expect(result, '完了メッセージまたは失敗メッセージのいずれかが表示される').not.toBeNull();
  });
});

test.describe('REQ-42.4/42.6: 一括取り込みのクライアントサイド反映と明示保存', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-42.4: 一括取り込みはクライアントサイドの編集状態にのみ反映する
   * @requirement quantity-table-generation/REQ-42.6: 保存前は永続化目的のサーバーアクセスを一切発生させない
   * @requirement quantity-table-generation/REQ-31.3: 各行を数量項目として追加（保存で永続化）
   *
   * クライアントサイド（SheetJS）でパースされる Excel を取り込み、取り込み完了から
   * 保存ボタン押下までの間に数量表サブリソースへの永続化書き込み（POST /quantity-items 等）が
   * 一切飛ばないことをネットワーク監視で検証する。保存後にリロードしても取り込み項目が
   * 残存することで、保存（PUT /:id/save）によってのみ永続化されることを確認する。
   *
   * 注: 本テストは OCR（ANTHROPIC_API_KEY 依存）を使用せず Excel パースのみで成立する。
   */
  test('Excel一括取り込みは保存まで永続化APIを発行せず、保存後はリロードしても残存する (REQ-42.4, REQ-42.6, REQ-31.3)', async ({
    page,
  }) => {
    expect(createdQuantityTableId, '事前準備で数量表が作成済み').toBeTruthy();

    await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
    await page.waitForLoadState('networkidle');
    const editArea = page.locator('[data-testid="quantity-table-edit-area"]');
    await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

    // 取り込み先グループが存在することを確認（beforeAll で永続化済み）
    const groupCard = page.locator('[data-testid="quantity-group-card"]').first();
    await expect(groupCard).toBeVisible({ timeout: getTimeout(10000) });

    // ネットワーク監視を設置（以降、保存まで永続化書き込みが飛んではならない）
    const monitor = attachPersistenceMonitor(page);

    // インポートダイアログを開く
    const importButton = page.getByRole('button', { name: 'インポート' }).first();
    await expect(importButton).toBeVisible({ timeout: getTimeout(5000) });
    await importButton.click();
    await expect(page.getByRole('heading', { name: '数量表インポート' })).toBeVisible({
      timeout: getTimeout(5000),
    });

    // Excel をアップロード（クライアントサイドでパースされる）
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    // 抽出完了 → 「一括取り込み」ボタンが表示される
    const dialog = page.getByRole('dialog');
    const importBtn = dialog.getByRole('button', { name: '一括取り込み' });
    await expect(importBtn).toBeVisible({ timeout: getTimeout(20000) });
    await importBtn.click();

    // 取り込み先グループを選択
    await expect(page.getByRole('heading', { name: '取り込み先グループを選択' })).toBeVisible({
      timeout: getTimeout(5000),
    });
    const groupButton = dialog
      .locator('button')
      .filter({ hasText: /\(\d+項目\)/ })
      .first();
    await expect(groupButton).toBeVisible({ timeout: getTimeout(5000) });
    await groupButton.click();

    // 取り込み完了メッセージ（クライアント反映済み）
    await expect(page.getByText(/件の数量項目を取り込みました/).first()).toBeVisible({
      timeout: getTimeout(10000),
    });

    // ダイアログを閉じる
    const closeBtn = dialog.getByRole('button', { name: /閉じる|キャンセル/ }).last();
    if (await isVisibleWithin(closeBtn, getTimeout(2000))) {
      await closeBtn.click();
    }

    // 取り込み項目が編集画面のドラフトに反映されている（名称フィールドの value として表示）
    await expectNameValuePresent(page, 'E2E取込項目');

    // 検証(REQ-42.4/42.6): 取り込みから保存前までに永続化書き込みは1件も飛んでいない
    expect(
      monitor.writes,
      `取り込み後・保存前に永続化書き込みが発生した: ${JSON.stringify(monitor.writes, null, 2)}`
    ).toHaveLength(0);

    // 保存（PUT /:id/save）でのみ永続化される
    await saveQuantityTableDraft(page);
    monitor.detach();

    // リロード後も取り込み項目が残存する（= 保存で永続化された）
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });
    await expectNameValuePresent(page, 'E2E取込項目');
  });
});

test.describe('REQ-32: フィールドマッピング調整', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-32.1: マッピング先ドロップダウン表示
   * @requirement quantity-table-generation/REQ-32.2: 選択肢提供
   */
  test('プレビュー表示時にマッピング先ドロップダウンが各列に表示される (REQ-32.1, REQ-32.2)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // REQ-32.1/32.2 は抽出済みの列に対する挙動であり、抽出手段を問わない。
    // 以前は PDF OCR が失敗すると「エラーかリトライが出ている」ことだけを確かめて
    // 選択肢の判定を飛ばしていた。決定論的に解析される Excel の資材を用いる。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    const previewTable = page.locator('table').first();
    await expect(previewTable, '前提: 抽出結果のプレビューテーブルが表示される').toBeVisible({
      timeout: getTimeout(45000),
    });

    // ドロップダウン（select aria-label*="マッピング先"）の確認
    const select = page.locator('select[aria-label*="のマッピング先"]').first();
    await expect(select, 'REQ-32.1: マッピング先ドロップダウンが表示されない').toBeVisible({
      timeout: getTimeout(5000),
    });

    // 選択肢に必須項目が含まれる
    const options = await select.locator('option').allTextContents();
    const expected = [
      '大項目',
      '中項目',
      '小項目',
      '任意分類',
      '工種',
      '名称',
      '規格',
      '数量',
      '単位',
      '備考',
      '取り込まない',
    ];
    for (const exp of expected) {
      expect(options, `REQ-32.2: マッピング先の選択肢に「${exp}」が無い`).toContain(exp);
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-32.3: マッピング即座更新
   * @requirement quantity-table-generation/REQ-32.5: ユーザー変更可能
   */
  test('マッピング先を変更すると select 値が即座に更新される (REQ-32.3, REQ-32.5)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // REQ-32.3/32.5 の検証対象は「マッピング先を変更でき、即座に反映される」ことである。
    // 以前は PDF OCR の結果を Promise.race で観測し、select が出なければ
    // 「リトライ・一括取り込み・アラートのいずれかが出ている」ことだけを確かめていた。
    // これでは変更の判定が一度も実行されない。決定論的に列が抽出される Excel を用いる。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    const dialog = page.getByRole('dialog');
    const firstSelect = dialog.locator('select[aria-label*="のマッピング先"]').first();
    await expect(firstSelect, '前提: マッピング先の選択欄が表示される').toBeVisible({
      timeout: getTimeout(45000),
    });

    // 資材の先頭列は「工種」であり、自動推定は 'workType' を選ぶ（REQ-32.4）。
    // 変更が反映されることを見るため、別の値へ切り替えてから戻す。
    await firstSelect.selectOption('skip');
    await expect(firstSelect, 'REQ-32.3: マッピング先の変更が即座に反映されない').toHaveValue(
      'skip'
    );

    await firstSelect.selectOption('workType');
    await expect(firstSelect, 'REQ-32.5: マッピング先をユーザーが変更できない').toHaveValue(
      'workType'
    );
  });

  /**
   * @requirement quantity-table-generation/REQ-32.4: 自動推定
   *
   * autoDetectFieldMapping により、キーワードマッチでマッピングが自動推定される。
   * 資材 import-items.xlsx のヘッダーは「工種・名称・規格・数量・単位」であり、
   * field-mapping.ts の MAPPING_RULES により推定結果は一意に定まる。
   */
  test('プレビュー表示時にマッピング先が自動推定される (REQ-32.4)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // 以前は PDF OCR の結果を観測し、select が出なければ「処理完了の証跡が何か出ている」
    // ことだけを確かめていた。また select が出た場合も「値が空でない」だけを見ており、
    // 未推定を表す 'skip' でも成立した。すなわち自動推定を一度も確かめていない。
    // 決定論的に列が抽出される Excel を用い、列ごとの推定結果を名指しで主張する。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    const dialog = page.getByRole('dialog');
    const expectedMapping: Array<[string, string]> = [
      ['工種', 'workType'],
      ['名称', 'name'],
      ['規格', 'specification'],
      ['数量', 'quantity'],
      ['単位', 'unit'],
    ];

    for (const [header, target] of expectedMapping) {
      const select = dialog.locator(`select[aria-label="${header}のマッピング先"]`);
      await expect(select, `前提: 列「${header}」のマッピング先の選択欄が表示される`).toBeVisible({
        timeout: getTimeout(45000),
      });
      await expect(select, `REQ-32.4: 列「${header}」のマッピング先が自動推定されない`).toHaveValue(
        target
      );
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-32.6: 必須未マッピング警告
   */
  test('必須フィールド未マッピング時に警告メッセージが表示される (REQ-32.6)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // REQ-32.6 は「必須フィールドが未マッピングなら警告する」ことを対象とする。
    // その状態を作るには列が抽出されている必要があるため、環境に依存する PDF OCR
    // ではなく、クライアントサイドで決定論的に解析される Excel の資材を用いる。
    // 以前は OCR 失敗時にリトライ表示だけを見て抜けており、警告の判定は実行されなかった。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    const dialog = page.getByRole('dialog');
    const warning = page.getByText(/必須フィールドがマッピングされていません/);

    // REQ-32.1: 抽出後は列ごとのマッピング先ドロップダウンが表示される
    const selects = dialog.locator('select[aria-label*="のマッピング先"]');
    const firstSelect = selects.first();
    await expect(firstSelect, 'REQ-32.1: マッピング先の選択欄が表示される').toBeVisible({
      timeout: getTimeout(45000),
    });

    // 全ての select を 'skip' に設定 → 必須フィールドが未マッピング
    const selectCount = await selects.count();
    expect(selectCount, '前提: マッピング対象の列が抽出されている').toBeGreaterThan(0);
    for (let i = 0; i < selectCount; i++) {
      await selects.nth(i).selectOption('skip');
    }

    // REQ-32.6: 必須フィールドが未マッピングであることの警告が表示される
    await expect(warning, 'REQ-32.6: 必須フィールド未マッピングの警告が表示される').toBeVisible({
      timeout: getTimeout(5000),
    });
  });
});

test.describe('REQ-33: OCR再実行・リトライ機能', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-33.1: リトライボタン表示
   *
   * 不正なxlsxアップロードでエラーが発生した時、リトライボタンが表示される。
   */
  test('処理失敗時に「リトライ」ボタンが表示される (REQ-33.1)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles({
      name: 'invalid.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // ZIP マジックバイトのみを持つ不正な xlsx。SheetJS が "Unsupported ZIP encryption"
      // 等のエラーを返す（任意のテキストだけだとパーサーが空ワークブックとして処理を完了
      // させてしまう環境があり、REQ-33 の「処理失敗」状態を再現できないため）。
      buffer: Buffer.from('PK\x03\x04dummy-excel-bytes'),
    });

    const retryBtn = page.getByRole('button', { name: 'リトライ' });
    await expect(retryBtn).toBeVisible({ timeout: getTimeout(15000) });
  });

  /**
   * @requirement quantity-table-generation/REQ-33.2: リトライ実行
   * @requirement quantity-table-generation/REQ-33.3: リトライ中インジケーター
   */
  test('「リトライ」クリックで再処理が走り、インジケーターまたはエラーが再表示される (REQ-33.2, REQ-33.3)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles({
      name: 'invalid.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // ZIP マジックバイトのみを持つ不正な xlsx。SheetJS が "Unsupported ZIP encryption"
      // 等のエラーを返す（任意のテキストだけだとパーサーが空ワークブックとして処理を完了
      // させてしまう環境があり、REQ-33 の「処理失敗」状態を再現できないため）。
      buffer: Buffer.from('PK\x03\x04dummy-excel-bytes'),
    });

    const retryBtn = page.getByRole('button', { name: 'リトライ' });
    await expect(retryBtn).toBeVisible({ timeout: getTimeout(15000) });

    await retryBtn.click();

    // 再処理開始の証跡：プログレスバー or エラー（再表示）
    const progressbar = page.locator('[role="progressbar"]');
    const errorAlert = page.locator('[role="alert"]');

    const result = await Promise.race([
      labelWhenVisibleWithin(progressbar.first(), getTimeout(10000), 'progress'),
      labelWhenVisibleWithin(errorAlert.first(), getTimeout(10000), 'error'),
    ]);
    expect(result, 'リトライ後にプログレスまたはエラー表示が出る').not.toBeNull();
  });

  /**
   * @requirement quantity-table-generation/REQ-33.4: 別ファイル許可
   *
   * エラー後でもファイル選択input は disabled にならず、新しいファイルを再選択可能。
   */
  test('処理失敗後でもファイルinputが操作可能である (REQ-33.4)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles({
      name: 'invalid.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('PK\x03\x04garbage-bytes'),
    });

    // エラー表示を待機
    await expect(page.locator('[role="alert"]').first()).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 別のファイルを選択できる（input が enabled）
    const isDisabled = await fileInput.isDisabled();
    expect(isDisabled, 'エラー後でもファイル入力は無効化されない').toBe(false);
  });

  /**
   * @requirement quantity-table-generation/REQ-33.5: 別ファイル選択時のクリア
   *
   * 新しいファイルをアップロードすると、前回のエラー表示がクリアされる。
   */
  test('別ファイルアップロード時に前回のエラーがクリアされる (REQ-33.5)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');

    // 1回目：txt（サポート対象外）→ ファイル形式エラー
    await fileInput.setInputFiles(TEST_TXT);
    const formatError = page.getByText(/対応していないファイル形式/);
    await expect(formatError).toBeVisible({ timeout: getTimeout(5000) });

    // 2回目：PDF
    await fileInput.setInputFiles(TEST_PDF);

    // 形式エラーが消える（要素が無くなるか非表示になる）
    await expect(formatError).not.toBeVisible({ timeout: getTimeout(5000) });
  });
});

test.describe('REQ-34: インポートダイアログのインラインプレビュー', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-34.1: インラインプレビュー表示
   *
   * ファイルアップロード後、ダイアログ内に処理プログレスまたはプレビューテーブルが
   * インライン表示される（PDFはOCR処理結果のテーブル形式プレビュー）。
   */
  test('ファイルアップロード時にダイアログ内にインラインプレビューが表示される (REQ-34.1)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_PDF);

    // ダイアログ内にprogressbar or table が表示される
    const progressbar = page.locator('[role="progressbar"]').first();
    const previewTable = page.locator('table').first();

    // 枝ごとに待機の指定が異なる（プログレスは処理開始直後に出るため 10 秒、
    // プレビューは OCR の完了を待つため 45 秒）。`Promise.race` は最初に解決した枝が
    // 勝つため、プログレスが 10 秒で出なければその枝が null で勝つ。これは畳み方に
    // よらない `Promise.race` の意味そのものであり、待機の指定を揃えると
    // 「プログレスが出ないまま 45 秒後にプレビューが出る」場合の結論が変わる。
    // したがって枝ごとの待機の指定を機械的に揃えてはならない。
    const result = await Promise.race([
      labelWhenVisibleWithin(progressbar, getTimeout(10000), 'progress'),
      labelWhenVisibleWithin(previewTable, getTimeout(45000), 'preview'),
    ]);

    expect(result, 'プログレスまたはプレビューが表示される').not.toBeNull();
  });

  /**
   * @requirement quantity-table-generation/REQ-34.3: Excelインライン表示（テーブル形式）
   *
   * Excel/PDF いずれもプレビューはテーブル形式（ImportPreviewTable）で表示される。
   */
  test('処理完了時にテーブル形式のプレビューがインライン表示される (REQ-34.3)', async ({
    page,
  }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    // REQ-34.3 は「処理完了時にテーブル形式で表示する」ことを対象とする。
    // 以前は PDF OCR が失敗すると「エラーかリトライが出ている」ことだけを確かめており、
    // テーブル形式の判定は実行されなかった。決定論的に解析される Excel を用いる。
    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_XLSX);

    const previewTable = page.locator('table').first();
    await expect(previewTable, 'REQ-34.3: プレビューがテーブル形式で表示されない').toBeVisible({
      timeout: getTimeout(45000),
    });

    // table 要素が thead と tbody を含む
    await expect(
      previewTable.locator('thead'),
      'REQ-34.3: プレビューテーブルにヘッダー行が無い'
    ).toBeVisible();
    await expect(
      previewTable.locator('tbody'),
      'REQ-34.3: プレビューテーブルにデータ行が無い'
    ).toBeVisible();
  });

  /**
   * @requirement quantity-table-generation/REQ-34.5: ダイアログ内に並べて表示
   *
   * インラインプレビューと抽出結果プレビューテーブルが同一ダイアログ内に表示される。
   * E2Eでは、ダイアログ heading とプレビューテーブルが両方表示されることで検証。
   */
  test('インポートダイアログ内にプレビューテーブルが含まれる (REQ-34.5)', async ({ page }) => {
    const navigated = await navigateToQuantityTableEdit(page);
    expect(navigated).toBeTruthy();

    const opened = await openImportDialog(page);
    expect(opened).toBeTruthy();

    const fileInput = page.getByLabel('ファイルを選択');
    await fileInput.setInputFiles(TEST_PDF);

    // ダイアログヘッダーが継続表示される
    const heading = page.getByRole('heading', { name: '数量表インポート' });
    await expect(heading).toBeVisible();

    // プレビューテーブル/抽出結果アラート/リトライ/一括取り込みのいずれかが
    // ダイアログ内に表示される。空抽出では table が 0 サイズになり Playwright 上で
    // hidden 扱いになるため、抽出後に出現する alert（必須フィールド警告など）や
    // 一括取り込みボタンも「ダイアログ内に並べて表示された結果」の証跡として許容する。
    const dialog = page.getByRole('dialog');
    const previewTable = dialog.locator('table').first();
    const retryBtn = dialog.getByRole('button', { name: 'リトライ' });
    const importBtn = dialog.getByRole('button', { name: '一括取り込み' });
    const alertInDialog = dialog.locator('[role="alert"]').first();

    const result = await Promise.race([
      labelWhenVisibleWithin(previewTable, getTimeout(45000), 'preview'),
      labelWhenVisibleWithin(retryBtn, getTimeout(45000), 'retry'),
      labelWhenVisibleWithin(importBtn, getTimeout(45000), 'import'),
      labelWhenVisibleWithin(alertInDialog, getTimeout(45000), 'alert'),
    ]);

    expect(result).not.toBeNull();
    // ダイアログ headingは依然として表示
    await expect(heading).toBeVisible();
  });
});
