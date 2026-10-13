/**
 * @fileoverview 参照系データ取得が保存と独立して実行され表示されることのE2Eテスト
 *
 * Task 97.4: REQ-42.10 の除外を取り下げ、条文が述べる振る舞いを主張する
 *
 * Requirements coverage (quantity-table-generation):
 * - @requirement quantity-table-generation/REQ-42.10: 参照系データ取得（編集画面初回表示時のデータ読み込み、オートコンプリート候補取得、写真コメント取得、現場調査写真一覧取得、インポート時のファイル読み込み・OCR/データパース処理）を永続化の制約対象外とし、編集内容の永続化とは独立して必要に応じて実行する
 *
 * ## 主張すること
 *
 * 以前の代替検証（client-side-edit-explicit-save-e2e / import-e2e のネットワーク監視）は
 * 「永続化の書き込みを禁じ、参照系の取得は**許す**」だけで、参照系の取得が実際に起きることも、
 * その結果が画面に出ることも確かめていなかった。許可は主張ではない（タスク 95.2 の据え置き (c)）。
 * 本ファイルは条文が列挙する五つの参照系について、次を主張する。
 *
 * 1. 編集画面初回表示時のデータ読み込み: `GET /api/quantity-tables/:id` が発行され、
 *    保存済みの数量項目が画面に表示される
 * 2. オートコンプリート候補取得: `GET /api/projects/:projectId/quantity-items/autocomplete-candidates`
 *    が発行され、未保存の編集中に、保存済みの名称が候補として表示される
 * 3. 現場調査写真一覧取得: 未保存の編集がある状態で写真選択ダイアログを開くと、その操作を契機に
 *    `GET /api/projects/:projectId/survey-images` が発行され、写真が候補に並ぶ
 * 4. 写真コメント取得: 選んだ写真のコメントが、保存を待たずに数量グループへ表示される
 * 5. インポート時のファイル読み込み・データパース: 未保存の編集がある状態で Excel を選ぶと、
 *    保存を待たずに抽出結果が表示される（Excel はクライアントサイドで解析される。PDF の OCR は
 *    Claude Vision の有無で経路が変わり決定論的でないため、同じ条文の「データパース」を Excel で
 *    代表させる）
 *
 * いずれも、表示を主張した時点で明示保存（`PUT /api/quantity-tables/:id/save`）と
 * 数量表サブリソースへの永続化書き込みが**0件**であることを併せて主張する。
 * 「0件」が観測条件の誤りで恒真にならないよう、最後に同じ観測器で明示保存を実際に行い
 * 1件として捉えられることを示す。
 *
 * ## 観測方式
 *
 * リクエストの選別は**オリジンではなくパス**で行う（`new URL(url).pathname`）。ブラウザが使う
 * APIオリジンとE2E側の `API_BASE_URL` は同一とは限らず（CIでは `localhost:3000` と
 * `127.0.0.1:3000`）、オリジンで選別すると観測対象が1件も残らず主張が恒真になるため。
 *
 * @module e2e/specs/quantity-tables/reference-reads-independent-of-save-e2e.spec
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { assertPrepared } from '../../helpers/preconditions';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import {
  addQuantityGroup,
  addQuantityItemRows,
  createTestProject,
  createTestQuantityTable,
  fillItemRequiredFields,
  openQuantityTableEdit,
  seedSurveyPhotosWithComments,
} from '../../helpers/quantity-table-preconditions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** クライアントサイド（SheetJS）で解析される Excel 資材。1行目に「E2E取込項目」を持つ */
const TEST_XLSX = path.join(__dirname, '../../fixtures', 'import-items.xlsx');

/** Excel 資材の名称列の値（抽出結果に現れるべき値） */
const XLSX_ITEM_NAME = 'E2E取込項目';

/** 事前準備で保存する数量項目の名称（初回表示とオートコンプリート候補の判定に用いる） */
const SAVED_ITEM_NAME = `参照系E2E保存済み名称_${Date.now()}`;

/** 事前準備で写真に付けるコメント（写真コメント取得の判定に用いる） */
const PHOTO_COMMENT = 'REQ-42.10: 参照系で取得される写真コメント';

/** 数量表サブリソースへの書き込みを意味するメソッド */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let createdProjectId: string | null = null;
let createdQuantityTableId: string | null = null;
let annotatedImageId: string | null = null;

// ============================================================================
// 観測
// ============================================================================

/** 参照系の取得と永続化の書き込みの観測結果 */
interface ReferenceReadObservation {
  /** 数量表データの読み込み（`GET /api/quantity-tables/:id`） */
  tableDetailReads: string[];
  /** オートコンプリート候補の取得 */
  candidateReads: string[];
  /** 現場調査写真一覧の取得 */
  surveyImageListReads: string[];
  /** 明示保存（`PUT /api/quantity-tables/:id/save`） */
  saves: string[];
  /** 明示保存以外の数量表サブリソースへの書き込み */
  persistenceWrites: string[];
  /** 観測を終了する */
  stop: () => void;
}

/**
 * ブラウザが送出したリクエストをパスで分類して観測する。
 *
 * @param page 観測対象のページ
 * @param projectId 対象プロジェクトのID
 * @param quantityTableId 対象数量表のID
 * @returns 記録の格納先と観測終了関数
 */
function observeReferenceReads(
  page: Page,
  projectId: string,
  quantityTableId: string
): ReferenceReadObservation {
  const tableDetailReads: string[] = [];
  const candidateReads: string[] = [];
  const surveyImageListReads: string[] = [];
  const saves: string[] = [];
  const persistenceWrites: string[] = [];

  const tableDetailPath = `/api/quantity-tables/${quantityTableId}`;
  const candidatePath = `/api/projects/${projectId}/quantity-items/autocomplete-candidates`;
  const surveyImageListPath = `/api/projects/${projectId}/survey-images`;
  const savePath = `/api/quantity-tables/${quantityTableId}/save`;

  const record = (request: { url: () => string; method: () => string }): void => {
    const method = request.method();
    if (method === 'OPTIONS') {
      return;
    }
    let pathname: string;
    try {
      pathname = new URL(request.url()).pathname;
    } catch {
      return;
    }

    if (method === 'GET') {
      if (pathname === tableDetailPath) tableDetailReads.push(pathname);
      if (pathname === candidatePath) candidateReads.push(pathname);
      if (pathname === surveyImageListPath) surveyImageListReads.push(pathname);
      return;
    }

    if (!WRITE_METHODS.has(method)) {
      return;
    }
    if (method === 'PUT' && pathname === savePath) {
      saves.push(`${method} ${pathname}`);
      return;
    }
    if (/^\/api\/(quantity-tables|quantity-groups|quantity-items)(\/|$)/.test(pathname)) {
      persistenceWrites.push(`${method} ${pathname}`);
    }
  };

  page.on('request', record);
  return {
    tableDetailReads,
    candidateReads,
    surveyImageListReads,
    saves,
    persistenceWrites,
    stop: () => page.off('request', record),
  };
}

/**
 * 保存が一度も行われていないこと（明示保存・永続化書き込みとも0件）と、
 * 未保存の変更が画面上に残っていることを主張する。
 *
 * @param page Playwright のページ
 * @param observation 観測結果
 * @param moment どの表示を主張した時点かの説明
 */
async function expectNothingSaved(
  page: Page,
  observation: ReferenceReadObservation,
  moment: string
): Promise<void> {
  expect(observation.saves, `REQ-42.10: ${moment}までに明示保存が発行された`).toHaveLength(0);
  expect(
    observation.persistenceWrites,
    `REQ-42.10: ${moment}までに永続化の書き込みが発行された`
  ).toHaveLength(0);
  await expect(
    page.getByTestId('unsaved-changes-badge'),
    `前提: ${moment}の時点で未保存の変更が残っている`
  ).toBeVisible();
}

// ============================================================================
// テスト
// ============================================================================

test.describe('REQ-42.10: 参照系データ取得は保存と独立して実行され表示される', () => {
  test.describe.configure({ mode: 'serial' });

  /**
   * 事前準備
   *
   * - コメント付き・注釈付きの写真を1枚持つ現場調査（写真一覧・写真コメントの前提）
   * - 名称を持つ数量項目を1件保存した数量表（初回表示・オートコンプリート候補の前提）
   */
  test.beforeAll(async ({ browser }) => {
    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();

    try {
      await loginAsUser(page, 'REGULAR_USER');

      createdProjectId = await createTestProject(page, 'REQ42_10_参照系');

      const seeded = await seedSurveyPhotosWithComments(
        page,
        createdProjectId,
        'REQ42_10_調査',
        [PHOTO_COMMENT],
        'all'
      );
      expect(seeded.annotatedImageIds, '前提: 注釈付きの写真が1枚ある').toHaveLength(1);
      annotatedImageId = seeded.annotatedImageIds[0] ?? null;
      assertPrepared(annotatedImageId, '注釈を付けた写真のID');

      const created = await createTestQuantityTable(page, createdProjectId, 'REQ42_10_数量表');
      createdQuantityTableId = created.id;

      await openQuantityTableEdit(page, createdQuantityTableId);
      const groupCard = await addQuantityGroup(page);
      const rows = await addQuantityItemRows(groupCard, 1);
      await fillItemRequiredFields(rows.first(), { name: SAVED_ITEM_NAME });
      await saveQuantityTableDraft(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement quantity-table-generation/REQ-42.10
   *
   * 初回表示のデータ読み込み・オートコンプリート候補取得・現場調査写真一覧取得・写真コメント取得が
   * 実際に発行され、未保存の編集がある間に保存を待たずその結果が表示される。
   */
  test('初回表示・候補・写真一覧・写真コメントの取得が保存を待たずに実行され表示される (quantity-table-generation/REQ-42.10)', async ({
    page,
  }) => {
    assertPrepared(createdProjectId, '事前準備で作成したプロジェクトのID');
    assertPrepared(createdQuantityTableId, '事前準備で作成した数量表のID');
    assertPrepared(annotatedImageId, '事前準備で注釈を付けた写真のID');

    // 観測は遷移の前から始める（初回表示の読み込みそのものを捉えるため）
    const observation = observeReferenceReads(page, createdProjectId, createdQuantityTableId);

    // --- 1. 編集画面初回表示時のデータ読み込み ---
    await openQuantityTableEdit(page, createdQuantityTableId);
    expect(
      observation.tableDetailReads.length,
      'REQ-42.10: 初回表示で数量表データの読み込みが発行されない'
    ).toBeGreaterThan(0);
    const groupCards = page.locator('[data-testid="quantity-group-card"]');
    await expect(groupCards, '前提: 保存済みの数量グループが1件表示される').toHaveCount(1, {
      timeout: getTimeout(15000),
    });
    await expect(
      groupCards.first().getByLabel('名称', { exact: true }),
      'REQ-42.10: 初回表示で読み込んだ数量項目が表示されない'
    ).toHaveValue(SAVED_ITEM_NAME, { timeout: getTimeout(15000) });

    // --- 未保存の編集を作る（以降の参照系はすべて未保存の状態で行う） ---
    const newGroup = await addQuantityGroup(page);
    const newRows = await addQuantityItemRows(newGroup, 1);
    await expect(
      page.getByTestId('unsaved-changes-badge'),
      '前提: 編集により未保存の変更が生じる'
    ).toBeVisible({ timeout: getTimeout(10000) });

    // --- 2. オートコンプリート候補取得 ---
    await expect
      .poll(() => observation.candidateReads.length, {
        timeout: getTimeout(15000),
        message: 'REQ-42.10: オートコンプリート候補の取得が発行されない',
      })
      .toBeGreaterThan(0);
    const newNameField = newRows.first().getByLabel('名称', { exact: true });
    await expect(newNameField, '前提: 追加した行の名称欄は空である').toHaveValue('');
    await newNameField.click();
    const listbox = page.getByRole('listbox');
    await expect(listbox, 'REQ-42.10: 取得した候補の一覧が表示されない').toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(
      listbox.getByRole('option', { name: SAVED_ITEM_NAME, exact: true }),
      'REQ-42.10: 保存済みの名称が保存を待たずに候補として表示されない'
    ).toBeVisible();
    await expectNothingSaved(page, observation, 'オートコンプリート候補の表示');
    await newNameField.press('Escape');

    // --- 3. 現場調査写真一覧取得（操作を契機に発行される） ---
    const listReadsBeforeOpen = observation.surveyImageListReads.length;
    const placeholder = newGroup.locator('[data-testid^="image-placeholder-"]').first();
    await expect(placeholder, '前提: 写真未紐付けのプレースホルダーが表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    await placeholder.click();

    const dialog = page.getByRole('dialog', { name: '写真を選択' });
    await expect(dialog, '前提: 写真選択ダイアログが開く').toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect
      .poll(() => observation.surveyImageListReads.length, {
        timeout: getTimeout(15000),
        message: 'REQ-42.10: ダイアログを開いても現場調査写真一覧の取得が発行されない',
      })
      .toBe(listReadsBeforeOpen + 1);
    const photoItem = dialog.locator(`[data-testid="photo-item-${annotatedImageId}"]`);
    await expect(
      photoItem,
      'REQ-42.10: 取得した現場調査写真が保存を待たずに選択候補として表示されない'
    ).toBeVisible({ timeout: getTimeout(20000) });
    await expectNothingSaved(page, observation, '現場調査写真一覧の表示');

    // --- 4. 写真コメント取得 ---
    await photoItem.click();
    await expect(dialog, '前提: 写真の選択でダイアログが閉じる').not.toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(
      newGroup.locator('[data-testid="photo-comment-display"]'),
      'REQ-42.10: 選んだ写真のコメントが保存を待たずに表示されない'
    ).toHaveText(PHOTO_COMMENT, { timeout: getTimeout(15000) });
    await expectNothingSaved(page, observation, '写真コメントの表示');

    // --- 判定の素通り防止: 同じ観測器が明示保存を捉えられることを示す ---
    await fillItemRequiredFields(newRows.first(), { name: `${SAVED_ITEM_NAME}_追加` });
    await saveQuantityTableDraft(page);
    observation.stop();
    expect(observation.saves, '観測器が明示保存を捉えられない（観測条件が誤っている）').toEqual([
      `PUT /api/quantity-tables/${createdQuantityTableId}/save`,
    ]);
  });

  /**
   * @requirement quantity-table-generation/REQ-42.10
   *
   * インポート時のファイル読み込み・データパースは、未保存の編集がある間に保存を待たず実行され、
   * 抽出結果が表示される。
   */
  test('インポートのファイル読み込み・データパースが保存を待たずに実行され抽出結果が表示される (quantity-table-generation/REQ-42.10)', async ({
    page,
  }) => {
    assertPrepared(createdProjectId, '事前準備で作成したプロジェクトのID');
    assertPrepared(createdQuantityTableId, '事前準備で作成した数量表のID');

    await openQuantityTableEdit(page, createdQuantityTableId);
    const observation = observeReferenceReads(page, createdProjectId, createdQuantityTableId);

    // 未保存の編集を作る
    await addQuantityGroup(page);
    await expect(
      page.getByTestId('unsaved-changes-badge'),
      '前提: 編集により未保存の変更が生じる'
    ).toBeVisible({ timeout: getTimeout(10000) });

    await page.getByRole('button', { name: 'インポート' }).first().click();
    await expect(
      page.getByRole('heading', { name: '数量表インポート' }),
      '前提: インポートダイアログが開く'
    ).toBeVisible({ timeout: getTimeout(10000) });

    await page.getByLabel('ファイルを選択').setInputFiles(TEST_XLSX);

    const extracted = page.getByRole('region', { name: '抽出結果' });
    await expect(
      extracted.locator('table'),
      'REQ-42.10: ファイル読み込み・データパースの結果が保存を待たずに表示されない'
    ).toBeVisible({ timeout: getTimeout(45000) });
    await expect(
      extracted,
      'REQ-42.10: 抽出結果にファイルの内容（名称列の値）が現れない'
    ).toContainText(XLSX_ITEM_NAME);
    await expectNothingSaved(page, observation, 'インポートの抽出結果の表示');

    observation.stop();
  });
});
