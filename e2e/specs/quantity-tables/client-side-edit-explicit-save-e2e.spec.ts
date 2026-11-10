/**
 * @fileoverview クライアントサイド編集・明示保存モデルの E2E テスト (REQ-42)
 *
 * Task 63.2: クライアントサイド編集・明示保存の E2E を実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - REQ-2.6: 数量表編集画面での数量表名編集はクライアント編集状態にのみ反映する（保存まで非永続化）
 * - REQ-38.13: 数量グループのコピーをクライアントサイドの編集状態に対して実施する（保存まで非永続化）
 * - REQ-42.1: グループ/項目の追加・削除・コピー・並び替えは永続化APIを発行しない
 * - REQ-42.2: グループ名・数量表名の変更は永続化APIを発行しない
 * - REQ-42.3: 写真紐づけ・変更は永続化APIを発行しない（一括生成の写真紐づけで間接検証）
 * - REQ-42.4: 一括生成（REQ-40）・取り込み（REQ-31）は永続化APIを発行しない（一括生成で検証）
 * - REQ-42.5: 保存操作で全ての編集（グループ・項目・名称・並び順・写真・フィールド値）を一括永続化
 * - REQ-42.6: 保存前は永続化目的のサーバーアクセスを一切発生させない（ネットワーク監視）
 * - REQ-42.7: 一定間隔の自動保存を行わず永続化は保存操作時のみ（編集セッション全体のネットワーク監視で検証）
 * - REQ-42.8: 保存成功時に最新データを取得・同期し、保存完了メッセージを表示する
 * - REQ-42.11: 保存の本文の数量グループの数が上限を超えると本文の検証の400になり書き込まない（API の要求で検証）
 * - REQ-42.12: 件数の上限を超えた保存の400では上限のメッセージを表示し、汎用の文言を出さず編集状態を保つ（画面の保存の本文を件数の上限を超えるまで増やして実際の400を得る）
 * - REQ-42.13: 保存の本文の計算用パラメータのキーが上限を超えると本文の検証の400になり書き込まない（API の要求で検証）
 *
 * このスペックは Task 63.1（既存スペックの移行）とは独立した「明示保存モデルの
 * 専用検証」である。中核となるのは「保存ボタン押下までは数量表サブリソースへの
 * 書き込みAPI（POST/PUT/PATCH/DELETE）が一切飛ばない」ことのネットワーク監視である。
 *
 * 監視対象（飛んではいけない＝永続化）:
 *   /api/quantity-tables/...（/save を除く）、/api/quantity-groups/...、
 *   /api/quantity-items/... への POST/PUT/PATCH/DELETE。
 * 許可される唯一の書き込み: PUT /api/quantity-tables/:id/save。
 * 参照系（GET、site-surveys/annotations 等の取得）は制約対象外（REQ-42.10）。
 *
 * @module e2e/specs/quantity-tables/client-side-edit-explicit-save-e2e.spec
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type Request } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { API_BASE_URL } from '../../config';
import { getAccessToken } from '../../helpers/auth-api';
import { assertPrepared } from '../../helpers/preconditions';
import { getPrismaClient } from '../../fixtures/database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RUN_ID = Date.now();

let testProjectId: string | null = null;
let surveyWithPhotosId: string | null = null;
/**
 * 上限の検証（タスク108.1・110.1）が作った数量表の ID。108.1 の表は数量グループを 1000 件持つため、
 * テストが途中で落ちても afterEach で DB から消す（110.1 の小さな表も同じく消す）。
 */
const limitTableIdsToRemove: string[] = [];
// 注意: 生成グループ名は現場調査名から派生する（「{調査名} 1」等）。共有ヘルパー
// saveQuantityTableDraft は getByRole('button', { name: '保存' }) で保存ボタンを探すが、
// このマッチはアクセシブル名の部分一致であるため、グループ名に「保存」を含めると
// h3(role=button) と衝突する。よって調査名に「保存」を含めない。
const SURVEY_WITH_PHOTOS_NAME = `明示確定E2E_写真あり_${RUN_ID}`;

// ============================================================================
// ネットワーク監視
// ============================================================================

/** 書き込み HTTP メソッド（永続化を意味する） */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * 与えられた URL が「数量表サブリソースへの永続化書き込み」かを判定する。
 *
 * REQ-42.6: 保存前は数量表・グループ・項目への書き込みが一切あってはならない。
 * 唯一許可される書き込みは PUT /api/quantity-tables/:id/save なので、それは除外する。
 */
function isQuantityPersistenceWrite(url: string, method: string): boolean {
  if (!WRITE_METHODS.has(method)) {
    return false;
  }
  // 明示保存エンドポイントのみ許可（除外）
  if (/\/api\/quantity-tables\/[^/]+\/save$/.test(url)) {
    return false;
  }
  return (
    /\/api\/quantity-tables(\/|$|\?)/.test(url) ||
    /\/api\/quantity-groups(\/|$|\?)/.test(url) ||
    /\/api\/quantity-items(\/|$|\?)/.test(url)
  );
}

/**
 * 数量表サブリソースへの永続化書き込みリクエストを記録するリスナーを設置し、
 * 記録配列とデタッチ関数を返す。
 */
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
  return {
    writes,
    detach: () => page.off('request', listener),
  };
}

// ============================================================================
// セットアップヘルパー（既存 quantity-tables スペックのパターンを踏襲）
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
  const match = page.url().match(/\/projects\/([0-9a-f-]+)$/);
  const projectId = match?.[1] ?? null;
  expect(projectId).toBeTruthy();
  return projectId as string;
}

async function createSiteSurvey(
  page: Page,
  projectId: string,
  surveyName: string
): Promise<string> {
  await page.goto(`/projects/${projectId}/site-surveys/new`);
  await page.waitForLoadState('networkidle');

  await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });
  await page.getByLabel(/調査名/i).fill(surveyName);
  await page.getByLabel(/調査日/i).fill(new Date().toISOString().split('T')[0]!);

  const createSurveyPromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/') &&
      response.url().includes('site-surveys') &&
      response.request().method() === 'POST',
    { timeout: getTimeout(30000) }
  );

  await page.getByRole('button', { name: /^作成$/i }).click();
  await createSurveyPromise;

  await page.waitForURL(/\/site-surveys\/[0-9a-f-]+$/);
  const match = page.url().match(/\/site-surveys\/([0-9a-f-]+)$/);
  const surveyId = match?.[1] ?? null;
  expect(surveyId).toBeTruthy();
  return surveyId as string;
}

async function uploadOnePhoto(page: Page, surveyId: string, fixtureFile: string): Promise<void> {
  await page.goto(`/site-surveys/${surveyId}`);
  await page.waitForLoadState('networkidle');

  const input = page.locator('input[type="file"]').first();
  await expect(input).toBeAttached({ timeout: getTimeout(10000) });

  const uploadPromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/site-surveys/') &&
      response.url().includes('/images') &&
      response.request().method() === 'POST',
    { timeout: getTimeout(60000) }
  );

  await input.setInputFiles(path.join(__dirname, '../../fixtures', fixtureFile));
  await uploadPromise;
}

/**
 * 新規数量表を作成して編集画面へ遷移し、数量表 ID を返す。
 */
async function createQuantityTable(page: Page, tableName: string): Promise<string> {
  await page.goto(`/projects/${testProjectId}/quantity-tables`);
  await page.waitForLoadState('networkidle');

  const createButton = page.getByRole('link', { name: /新規作成/i });
  await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
  await createButton.click();

  const nameInput = page.getByRole('textbox', { name: /数量表名/i });
  await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
  await nameInput.clear();
  await nameInput.fill(tableName);

  await page.getByRole('button', { name: /^作成$/i }).click();

  await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
    timeout: getTimeout(15000),
  });
  const tableMatch = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/);
  const tableId = tableMatch?.[1] ?? null;
  expect(tableId).toBeTruthy();
  return tableId as string;
}

// ----------------------------------------------------------------------------
// 編集操作ヘルパー（いずれもドラフト更新のみ。永続化APIを発行してはならない）
// ----------------------------------------------------------------------------

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

async function renameGroupAt(page: Page, groupIndex: number, newName: string): Promise<void> {
  const groupCard = page.locator('[data-testid="quantity-group-card"]').nth(groupIndex);
  const heading = groupCard.locator('h3').first();
  await expect(heading).toBeVisible({ timeout: getTimeout(5000) });
  await heading.click();

  const editInput = groupCard.getByLabel('グループ名を編集');
  await expect(editInput).toBeVisible({ timeout: getTimeout(5000) });
  await editInput.fill(newName);
  await editInput.press('Enter');

  await expect(groupCard.locator('h3').filter({ hasText: newName }).first()).toBeVisible({
    timeout: getTimeout(8000),
  });
}

async function copyGroupAt(
  page: Page,
  groupIndex: number,
  expectedCountAfter: number
): Promise<void> {
  const groupCard = page.locator('[data-testid="quantity-group-card"]').nth(groupIndex);
  const copyButton = groupCard.getByRole('button', { name: 'グループをコピー' });
  await expect(copyButton).toBeVisible({ timeout: getTimeout(5000) });
  await copyButton.click();
  await expect(page.locator('[data-testid="quantity-group-card"]')).toHaveCount(
    expectedCountAfter,
    {
      timeout: getTimeout(15000),
    }
  );
}

async function moveGroupDownAt(page: Page, groupIndex: number): Promise<void> {
  const groupCard = page.locator('[data-testid="quantity-group-card"]').nth(groupIndex);
  const sortButtons = groupCard.locator('[data-testid="sort-order-buttons"]').first();
  const downButton = sortButtons.getByRole('button', { name: '下へ移動' });
  await expect(downButton).toBeVisible({ timeout: getTimeout(5000) });
  await downButton.click();
}

async function deleteGroupAt(
  page: Page,
  groupIndex: number,
  expectedCountAfter: number
): Promise<void> {
  const groupCard = page.locator('[data-testid="quantity-group-card"]').nth(groupIndex);
  const deleteButton = groupCard.getByRole('button', { name: 'グループを削除' });
  await expect(deleteButton).toBeVisible({ timeout: getTimeout(5000) });
  await deleteButton.click();

  // 削除確認ダイアログ（REQ-4.5）で「削除する」を承認する
  const confirmDialog = page.getByRole('dialog');
  await expect(confirmDialog).toBeVisible({ timeout: getTimeout(5000) });
  await confirmDialog.getByRole('button', { name: '削除する' }).click();

  await expect(page.locator('[data-testid="quantity-group-card"]')).toHaveCount(
    expectedCountAfter,
    {
      timeout: getTimeout(10000),
    }
  );
}

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

/**
 * 指定行のアクションメニューを開き、メニュー項目を実行する。
 * （上へ移動 / 下へ移動 / コピー / 削除）
 */
async function runItemMenuAction(
  groupCard: ReturnType<Page['locator']>,
  rowIndex: number,
  actionLabel: '上へ移動' | '下へ移動' | 'コピー' | '削除'
): Promise<void> {
  const row = groupCard.locator('[data-testid="quantity-item-row"]').nth(rowIndex);
  const menuButton = row.getByRole('button', { name: 'アクション' });
  await expect(menuButton).toBeVisible({ timeout: getTimeout(5000) });
  await menuButton.click();
  // アクションメニューのドロップダウンは Portal で document.body 直下に描画される
  // （QuantityItemActionMenu の Task 69.1）。行の DOM サブツリー外に出るため、
  // menuitem は row スコープではなくページ（開いている role="menu"）スコープで参照する。
  const menuItem = groupCard.page().getByRole('menu').getByRole('menuitem', { name: actionLabel });
  await expect(menuItem).toBeVisible({ timeout: getTimeout(5000) });
  await menuItem.click();
}

/**
 * 数量表名インライン入力で名称を変更する（REQ-2.5 / REQ-42.2）。
 */
async function renameTable(page: Page, newName: string): Promise<void> {
  const tableNameInput = page.getByLabel('数量表名');
  await expect(tableNameInput).toBeVisible({ timeout: getTimeout(5000) });
  await tableNameInput.fill(newName);
  await tableNameInput.blur();
}

/**
 * 現場調査からの一括生成を実行する（REQ-40 / REQ-42.4・42.3 写真紐づけ含む）。
 */
async function generateFromSurvey(
  page: Page,
  surveyId: string,
  expectedGeneratedCount: number
): Promise<void> {
  await page.getByTestId('bulk-create-from-survey-button').click();
  const dialog = page.getByTestId('survey-select-dialog');
  await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

  await page.getByTestId(`survey-select-option-${surveyId}`).click();
  await page.getByTestId('survey-select-dialog-confirm').click();

  await expect(page.getByText(`${expectedGeneratedCount}件のグループを生成しました`)).toBeVisible({
    timeout: getTimeout(10000),
  });
  await expect(dialog).not.toBeVisible({ timeout: getTimeout(10000) });
}

// ============================================================================
// テスト
// ============================================================================

test.describe('REQ-42: クライアントサイド編集・明示保存モデル E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  // 上限の検証が作った数量表（数量グループ 1000 件）を消す。削除の API は論理削除で
  // 行もグループも DB に残すため、Prisma で物理削除する（グループ・項目は onDelete: Cascade）。
  // 消せなければ例外のまま落とし、消えたことを件数で確かめる（失敗を握りつぶさない）。
  // テスト本体の try/finally では本体の失敗を後始末の失敗が上書きしうるため、afterEach に置く。
  test.afterEach(async () => {
    const prisma = getPrismaClient();
    for (const tableId of limitTableIdsToRemove.splice(0)) {
      await prisma.quantityTable.delete({ where: { id: tableId } });
      expect(
        await prisma.quantityTable.count({ where: { id: tableId } }),
        `後始末: 上限の検証の数量表 ${tableId} が DB から消える`
      ).toBe(0);
      expect(
        await prisma.quantityGroup.count({ where: { quantityTableId: tableId } }),
        `後始末: 上限の検証の数量表 ${tableId} の数量グループが DB から消える`
      ).toBe(0);
    }
  });

  // --------------------------------------------------------------------------
  // 事前準備
  // --------------------------------------------------------------------------
  test.describe('事前準備', () => {
    test('テスト用プロジェクトを作成する', async ({ page }) => {
      testProjectId = await createTestProject(page, `明示保存E2E_${RUN_ID}`);
      expect(testProjectId).toBeTruthy();
    });

    test('写真2枚の現場調査を作成する（一括生成・写真紐づけ検証用）', async ({ page }) => {
      if (!testProjectId) {
        throw new Error('testProjectId が未設定です。前段のテストが実行されていません。');
      }
      surveyWithPhotosId = await createSiteSurvey(page, testProjectId, SURVEY_WITH_PHOTOS_NAME);
      await uploadOnePhoto(page, surveyWithPhotosId, 'test-image.jpg');
      await uploadOnePhoto(page, surveyWithPhotosId, 'test-image.png');

      await page.goto(`/site-surveys/${surveyWithPhotosId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-testid="photo-panel-item"]')).toHaveCount(2, {
        timeout: getTimeout(15000),
      });
    });
  });

  // --------------------------------------------------------------------------
  // シナリオ1: 保存前は永続化書き込みが一切飛ばない + 保存で全永続化 + リロードで保持
  //            (REQ-42.1/42.2/42.3/42.4/42.5/42.6/42.8)
  // --------------------------------------------------------------------------
  test('広範な編集を行っても保存まで永続化APIが飛ばず、保存で全変更が永続化されリロード後も保持される', async ({
    page,
  }) => {
    if (!testProjectId || !surveyWithPhotosId) {
      throw new Error('事前準備の状態が未設定です。');
    }

    const tableId = await createQuantityTable(page, `永続化監視数量表_${RUN_ID}`);

    // ネットワーク監視を「編集開始直前」から設置する。
    // （作成直後の編集画面は読み込み済みで、以降の編集はすべてドラフトのはず）
    const monitor = attachPersistenceMonitor(page);

    const groupCards = page.locator('[data-testid="quantity-group-card"]');

    // --- グループ追加 (REQ-42.1) ---
    await addGroup(page, 1);
    await renameGroupAt(page, 0, 'グループ1'); // グループ名変更 (REQ-42.2)

    // --- 項目追加 + フィールド編集 (REQ-42.1/42.5) ---
    await addItemToGroupAt(page, 0, 1, { workType: '工種X', name: '名称X', unit: 'm2' });
    await addItemToGroupAt(page, 0, 2, { workType: '工種Y', name: '名称Y', unit: 'm' });

    // --- 項目コピー (REQ-42.1) ---
    const group0 = groupCards.nth(0);
    await runItemMenuAction(group0, 0, 'コピー');
    await expect(group0.locator('[data-testid="quantity-item-row"]')).toHaveCount(3, {
      timeout: getTimeout(10000),
    });

    // --- 項目並び替え (REQ-42.1) ---
    await runItemMenuAction(group0, 0, '下へ移動');

    // --- 項目削除 (REQ-42.1) ---
    await runItemMenuAction(group0, 2, '削除');
    await expect(group0.locator('[data-testid="quantity-item-row"]')).toHaveCount(2, {
      timeout: getTimeout(10000),
    });

    // --- 2グループ目追加・名称・グループコピー・並び替え・削除 (REQ-42.1) ---
    await addGroup(page, 2);
    await renameGroupAt(page, 1, 'グループ2');
    await copyGroupAt(page, 0, 3); // グループコピー
    await moveGroupDownAt(page, 0); // グループ並び替え
    await deleteGroupAt(page, 2, 2); // グループ削除（末尾を削除して2件に）

    // --- 数量表名変更 (REQ-42.2) ---
    const NEW_TABLE_NAME = `永続化監視数量表_改名_${RUN_ID}`;
    await renameTable(page, NEW_TABLE_NAME);

    // --- 現場調査からの一括生成（写真紐づけ含む）(REQ-42.3/42.4) ---
    await generateFromSurvey(page, surveyWithPhotosId, 2);
    // 生成2件が末尾に追加される
    await expect(groupCards).toHaveCount(4, { timeout: getTimeout(15000) });

    // ========================================================================
    // 検証(REQ-42.6): ここまでの全編集で、永続化書き込みAPIは1件も飛んでいない
    // ========================================================================
    expect(
      monitor.writes,
      `保存前に永続化書き込みが発生した: ${JSON.stringify(monitor.writes, null, 2)}`
    ).toEqual([]);

    // ========================================================================
    // 保存(REQ-42.5/42.8): 1回の PUT /:id/save で全状態を確定し「保存しました」表示
    // ========================================================================
    // 保存の PUT /save リクエストを別途記録して「ちょうど1回」を確認する
    const saveRequests: string[] = [];
    const saveListener = (request: Request) => {
      if (
        /\/api\/quantity-tables\/[^/]+\/save$/.test(request.url()) &&
        request.method() === 'PUT'
      ) {
        saveRequests.push(request.url());
      }
    };
    page.on('request', saveListener);

    await saveQuantityTableDraft(page);

    page.off('request', saveListener);
    monitor.detach();

    // 唯一許可される書き込み = PUT /:id/save がちょうど1回 (REQ-42.5)
    expect(saveRequests.length, 'save の PUT はちょうど1回').toBe(1);

    // ========================================================================
    // リロードでサーバー反映が保持される (REQ-42.5/42.8)
    // ========================================================================
    await page.goto(`/quantity-tables/${tableId}/edit`);
    await page.waitForLoadState('networkidle');

    // 数量表名が永続化されている
    await expect(page.getByLabel('数量表名')).toHaveValue(NEW_TABLE_NAME, {
      timeout: getTimeout(10000),
    });

    // グループ構成: グループ1 / グループ1のコピー / 一括生成2件 = 計4件
    // （moveGroupDown により グループ1/グループ2 の順序は入れ替わるが、最終的に
    //   グループ2 は削除済みのため、残るのは グループ1 系 + 生成2件）
    await expect(groupCards).toHaveCount(4, { timeout: getTimeout(15000) });

    // グループ1 と そのコピーが存在する（永続化された）
    const headings = await groupCards.locator('h3').allInnerTexts();
    expect(
      headings.some((h) => h.includes('グループ1')),
      'グループ1が永続化'
    ).toBe(true);
    expect(
      headings.some((h) => h.includes('のコピー')),
      'コピーグループが永続化'
    ).toBe(true);
    // 一括生成グループが永続化（{現場調査名} 1 / 2）
    expect(
      headings.some((h) => h.includes(`${SURVEY_WITH_PHOTOS_NAME} 1`)),
      '一括生成グループ1が永続化'
    ).toBe(true);
    expect(
      headings.some((h) => h.includes(`${SURVEY_WITH_PHOTOS_NAME} 2`)),
      '一括生成グループ2が永続化'
    ).toBe(true);

    // グループ1 の項目（並び替え後 2件）が永続化されている
    const group1Card = groupCards
      .filter({ has: page.locator('h3', { hasText: /^グループ1$/ }) })
      .first();
    await expect(group1Card.locator('[data-testid="quantity-item-row"]')).toHaveCount(2, {
      timeout: getTimeout(10000),
    });
  });

  // --------------------------------------------------------------------------
  // シナリオ2: 保存前にリロードすると未保存の編集は破棄される (REQ-42.6)
  // --------------------------------------------------------------------------
  test('保存せずにリロードすると未保存の編集は破棄される', async ({ page }) => {
    if (!testProjectId) {
      throw new Error('testProjectId が未設定です。');
    }

    const tableId = await createQuantityTable(page, `破棄検証数量表_${RUN_ID}`);

    const groupCards = page.locator('[data-testid="quantity-group-card"]');
    // 新規数量表はグループ0件の初期状態
    await expect(groupCards).toHaveCount(0, { timeout: getTimeout(10000) });

    const monitor = attachPersistenceMonitor(page);

    // 編集（グループ追加・名称・項目追加）— いずれも保存しない
    await addGroup(page, 1);
    await renameGroupAt(page, 0, '破棄されるべきグループ');
    await addItemToGroupAt(page, 0, 1, {
      workType: '破棄工種',
      name: '破棄名称',
      unit: 'm2',
    });

    // 保存前なので永続化書き込みは飛んでいない (REQ-42.6)
    expect(
      monitor.writes,
      `保存前に永続化書き込みが発生した: ${JSON.stringify(monitor.writes, null, 2)}`
    ).toEqual([]);
    monitor.detach();

    // beforeunload による離脱確認を自動承認してリロード（未保存破棄を実行）
    page.on('dialog', (dialog) => dialog.accept());

    // 明示保存せずにリロード
    await page.goto(`/quantity-tables/${tableId}/edit`);
    await page.waitForLoadState('networkidle');

    // サーバーには何も永続化されていないため、グループは0件のまま（破棄された）
    await expect(groupCards).toHaveCount(0, { timeout: getTimeout(10000) });
    await expect(page.getByText('破棄されるべきグループ')).toHaveCount(0);
  });

  // --------------------------------------------------------------------------
  // シナリオ: 保存の本文の配列の件数の上限（quantity-table-generation タスク108.1）
  // --------------------------------------------------------------------------
  /**
   * 画面の操作で上限（数量グループ 1000 件）を超えることは現実的でないため、
   * 編集画面と同じ保存の経路（PUT /api/quantity-tables/:id/save）へ API で送って確かめる。
   *
   * @requirement quantity-table-generation/REQ-42.11
   */
  test('数量グループの数が上限を1件超えた保存は400になり数量表は変わらず、上限ちょうどは保存される', async ({
    page,
  }) => {
    if (!testProjectId) {
      throw new Error('testProjectId が未設定です。');
    }
    const token = await getAccessToken(page, 'REGULAR_USER');
    assertPrepared(token, 'アクセストークン');
    const headers = { Authorization: `Bearer ${token}` };
    const tableName = `上限検証数量表_${RUN_ID}`;
    const existingGroupName = `上限検証の既存グループ_${RUN_ID}`;

    const created = await page.request.post(
      `${API_BASE_URL}/api/projects/${testProjectId}/quantity-tables`,
      { headers, data: { name: tableName } }
    );
    expect(created.status(), '前提: 数量表を作成できる').toBe(201);
    const { id: tableId } = (await created.json()) as { id: string };
    limitTableIdsToRemove.push(tableId);

    const readTable = async () => {
      const detail = await page.request.get(`${API_BASE_URL}/api/quantity-tables/${tableId}`, {
        headers,
      });
      expect(detail.status(), '数量表を取得できる').toBe(200);
      return (await detail.json()) as {
        name: string;
        updatedAt: string;
        groups: Array<{ id: string; name: string | null }>;
      };
    };
    const emptyGroups = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: null,
        name: `上限グループ${index}`,
        surveyImageId: null,
        displayOrder: index,
        items: [],
      }));

    // 前提: 既存のグループが 1 件ある数量表
    const initial = await readTable();
    const prepared = await page.request.put(`${API_BASE_URL}/api/quantity-tables/${tableId}/save`, {
      headers,
      data: {
        expectedUpdatedAt: initial.updatedAt,
        name: tableName,
        groups: [
          { id: null, name: existingGroupName, surveyImageId: null, displayOrder: 0, items: [] },
        ],
      },
    });
    expect(prepared.status(), '前提: 既存のグループを保存できる').toBe(200);
    const before = await readTable();
    expect(before.groups.map((group) => group.name)).toEqual([existingGroupName]);

    // 上限（1000）を 1 件超えた本文
    const rejected = await page.request.put(`${API_BASE_URL}/api/quantity-tables/${tableId}/save`, {
      headers,
      data: {
        expectedUpdatedAt: before.updatedAt,
        name: '書き込まれてはならない名前',
        groups: emptyGroups(1001),
      },
    });
    expect(rejected.status()).toBe(400);
    const rejectedBody = (await rejected.json()) as {
      code: string;
      message: string;
      details: Array<{ path: string; message: string }>;
    };
    expect(rejectedBody.code).toBe('VALIDATION_ERROR');
    expect(rejectedBody.message).toBe('数量グループは1000件以内で保存してください');
    expect(rejectedBody.details).toContainEqual(
      expect.objectContaining({
        path: 'groups',
        message: '数量グループは1000件以内で保存してください',
      })
    );

    // 数量表は変わらない（通っていれば名前が変わり、既存のグループが消えて 1001 件になる）
    const afterRejected = await readTable();
    expect(afterRejected.name).toBe(tableName);
    expect(afterRejected.updatedAt).toBe(before.updatedAt);
    expect(afterRejected.groups.map((group) => [group.id, group.name])).toEqual(
      before.groups.map((group) => [group.id, group.name])
    );

    // 非空証明: 同じ形で上限ちょうど（1000）なら保存される。400 は件数による
    const accepted = await page.request.put(`${API_BASE_URL}/api/quantity-tables/${tableId}/save`, {
      headers,
      data: {
        expectedUpdatedAt: before.updatedAt,
        name: `${tableName}_上限ちょうど`,
        groups: emptyGroups(1000),
      },
    });
    expect(accepted.status(), `上限ちょうどは保存される (status=${accepted.status()})`).toBe(200);
    const afterAccepted = await readTable();
    expect(afterAccepted.name).toBe(`${tableName}_上限ちょうど`);
    expect(afterAccepted.groups).toHaveLength(1000);
  });

  // --------------------------------------------------------------------------
  // シナリオ: 保存の本文の計算用パラメータのキーの上限（quantity-table-generation タスク110.1）
  // --------------------------------------------------------------------------
  /**
   * 画面は計算方法ごとに使うキー（最大 6）しか送らないため、編集画面と同じ保存の経路
   * （PUT /api/quantity-tables/:id/save）へ API で、キーが上限（10）を超えた本文を送って確かめる。
   *
   * @requirement quantity-table-generation/REQ-42.13
   */
  test('計算用パラメータのキーが上限を超えた保存は400になり数量表は変わらず、上限ちょうどは保存される', async ({
    page,
  }) => {
    if (!testProjectId) {
      throw new Error('testProjectId が未設定です。');
    }
    const token = await getAccessToken(page, 'REGULAR_USER');
    assertPrepared(token, 'アクセストークン');
    const headers = { Authorization: `Bearer ${token}` };
    const tableName = `キー上限検証数量表_${RUN_ID}`;
    const groupName = `キー上限検証のグループ_${RUN_ID}`;
    const usedParams = { width: 2, depth: 3, height: 1 };

    const created = await page.request.post(
      `${API_BASE_URL}/api/projects/${testProjectId}/quantity-tables`,
      { headers, data: { name: tableName } }
    );
    expect(created.status(), '前提: 数量表を作成できる').toBe(201);
    const { id: tableId } = (await created.json()) as { id: string };
    limitTableIdsToRemove.push(tableId);

    type TableDetail = {
      name: string;
      updatedAt: string;
      groups: Array<{
        id: string;
        name: string | null;
        items: Array<{ id: string; name: string; calculationParams: unknown }>;
      }>;
    };
    const readTable = async (): Promise<TableDetail> => {
      const detail = await page.request.get(`${API_BASE_URL}/api/quantity-tables/${tableId}`, {
        headers,
      });
      expect(detail.status(), '数量表を取得できる').toBe(200);
      return (await detail.json()) as TableDetail;
    };
    const itemWithParams = (name: string, calculationParams: Record<string, number>) => ({
      id: null,
      tempId: 'temp-item-0',
      majorCategory: null,
      middleCategory: null,
      minorCategory: null,
      customCategory: null,
      workType: '工種',
      name,
      specification: null,
      unit: 'm3',
      calculationMethod: 'AREA_VOLUME',
      calculationParams,
      adjustmentFactor: 1,
      roundingUnit: 0.01,
      quantity: 6,
      remarks: null,
      displayOrder: 0,
    });
    const bodyWith = (
      expectedUpdatedAt: string,
      name: string,
      itemName: string,
      calculationParams: Record<string, number>
    ) => ({
      expectedUpdatedAt,
      name,
      groups: [
        {
          id: null,
          tempId: 'temp-group-0',
          name: groupName,
          surveyImageId: null,
          displayOrder: 0,
          items: [itemWithParams(itemName, calculationParams)],
        },
      ],
    });
    /** 使うキー（3 つ）に使わないキーを足して、指定の数のキーにする */
    const paramsWithKeys = (count: number) => ({
      ...usedParams,
      ...Object.fromEntries(
        Array.from({ length: count - Object.keys(usedParams).length }, (_, index) => [
          `unused${index}`,
          1,
        ])
      ),
    });
    const summarize = (table: TableDetail) =>
      table.groups.map((group) => ({
        id: group.id,
        name: group.name,
        items: group.items.map((item) => [item.id, item.name, item.calculationParams]),
      }));

    // 前提: 計算用パラメータを持つ数量項目が 1 件ある数量表
    const initial = await readTable();
    const prepared = await page.request.put(`${API_BASE_URL}/api/quantity-tables/${tableId}/save`, {
      headers,
      data: bodyWith(initial.updatedAt, tableName, '既存の項目', usedParams),
    });
    expect(prepared.status(), '前提: 既存の数量項目を保存できる').toBe(200);
    const before = await readTable();
    expect(summarize(before)).toEqual([
      {
        id: expect.any(String),
        name: groupName,
        items: [[expect.any(String), '既存の項目', usedParams]],
      },
    ]);

    // 上限（10）を超えたキーの本文
    const rejected = await page.request.put(`${API_BASE_URL}/api/quantity-tables/${tableId}/save`, {
      headers,
      data: bodyWith(
        before.updatedAt,
        '書き込まれてはならない名前',
        '書き込まれてはならない項目',
        paramsWithKeys(11)
      ),
    });
    expect(rejected.status()).toBe(400);
    const rejectedBody = (await rejected.json()) as {
      code: string;
      message: string;
      details: Array<{ path: string; message: string }>;
    };
    expect(rejectedBody.code).toBe('VALIDATION_ERROR');
    expect(rejectedBody.message).toBe('計算用パラメータは10項目以内で指定してください');
    expect(rejectedBody.details).toEqual([
      expect.objectContaining({
        path: 'groups.0.items.0.calculationParams',
        message: '計算用パラメータは10項目以内で指定してください',
      }),
    ]);

    // 数量表は変わらない（通っていれば名前が変わり、既存の数量項目が新規の項目に置き換わる）
    const afterRejected = await readTable();
    expect(afterRejected.name).toBe(tableName);
    expect(afterRejected.updatedAt).toBe(before.updatedAt);
    expect(summarize(afterRejected)).toEqual(summarize(before));

    // 非空証明: 同じ形で上限ちょうど（10）なら保存される。400 はキーの数による
    const accepted = await page.request.put(`${API_BASE_URL}/api/quantity-tables/${tableId}/save`, {
      headers,
      data: bodyWith(
        before.updatedAt,
        `${tableName}_上限ちょうど`,
        '上限ちょうどの項目',
        paramsWithKeys(10)
      ),
    });
    expect(accepted.status(), `上限ちょうどは保存される (status=${accepted.status()})`).toBe(200);
    const afterAccepted = await readTable();
    expect(afterAccepted.name).toBe(`${tableName}_上限ちょうど`);
    // 使わないキーは従来どおり捨てて永続化する
    expect(summarize(afterAccepted)).toEqual([
      {
        id: expect.any(String),
        name: groupName,
        items: [[expect.any(String), '上限ちょうどの項目', usedParams]],
      },
    ]);
  });

  // --------------------------------------------------------------------------
  // シナリオ: 件数の上限を超えた保存の画面の表示（quantity-table-generation タスク109.1）
  // --------------------------------------------------------------------------
  /**
   * 画面の操作で上限（数量グループ 1000 件など）を超えることは現実的でないため、画面で編集して
   * 保存し、送られる保存の要求の本文だけを経路の差し替え（`route.continue` の `postData`）で
   * 件数の上限を超えるまで増やす。応答は差し替えず、バックエンドの実際の 400 を画面が受ける。
   * 画面の編集の部分（先頭の数量グループと、その中の編集した数量項目）は本文に残す。
   */
  const SAVE_LIMIT_CASES: Array<{
    label: string;
    expectedMessage: string;
    inflate: (groups: Array<Record<string, unknown>>) => Array<Record<string, unknown>>;
  }> = [
    {
      label: '数量グループの数',
      expectedMessage: '保存できません: 数量グループは1000件以内で保存してください',
      inflate: (groups) => [
        ...groups,
        ...Array.from({ length: 1001 - groups.length }, (_, index) => ({
          id: null,
          tempId: `temp-pad-group-${index}`,
          name: `上限超過の埋め草${index}`,
          surveyImageId: null,
          displayOrder: groups.length + index,
          items: [],
        })),
      ],
    },
    {
      label: '一つの数量グループの数量項目の数',
      expectedMessage: '保存できません: 一つの数量グループの数量項目は2000件以内で保存してください',
      inflate: (groups) => [
        { ...groups[0], items: copiesOfFirstItem(groups, 'items', 2001) },
        ...groups.slice(1),
      ],
    },
    {
      label: '数量項目の総数',
      // 一つの数量グループは 1667 件（上限 2000 の内側）で、3 つの合計が 5001 件
      expectedMessage: '保存できません: 数量項目は合計5000件以内で保存してください',
      inflate: (groups) => [
        { ...groups[0], items: copiesOfFirstItem(groups, 'total0', 1667) },
        ...[1, 2].map((n) => ({
          id: null,
          tempId: `temp-pad-group-${n}`,
          name: `上限超過の埋め草${n}`,
          surveyImageId: null,
          displayOrder: n,
          items: copiesOfFirstItem(groups, `total${n}`, 1667),
        })),
      ],
    },
  ];

  /** 先頭の数量グループの先頭の数量項目（画面で編集したもの）を新規の数量項目として count 件に複製する */
  function copiesOfFirstItem(
    groups: Array<Record<string, unknown>>,
    prefix: string,
    count: number
  ): Array<Record<string, unknown>> {
    const firstItem = (groups[0]?.items as Array<Record<string, unknown>> | undefined)?.[0];
    assertPrepared(firstItem, '保存の本文の先頭の数量項目');
    return Array.from({ length: count }, (_, index) => ({
      ...firstItem,
      id: null,
      tempId: `temp-pad-${prefix}-${index}`,
      displayOrder: index,
    }));
  }

  for (const limitCase of SAVE_LIMIT_CASES) {
    /**
     * @requirement quantity-table-generation/REQ-42.12
     */
    test(`${limitCase.label}の上限を超えた保存は上限のメッセージを表示し、汎用の文言を出さず編集中の内容と未保存の表示が残る`, async ({
      page,
    }) => {
      if (!testProjectId) {
        throw new Error('testProjectId が未設定です。');
      }
      const tableName = `上限表示検証数量表_${limitCase.label}_${RUN_ID}`;
      const editedTableName = `${tableName}_編集中`;
      const groupName = `上限表示検証のグループ_${RUN_ID}`;
      const tableId = await createQuantityTable(page, tableName);
      limitTableIdsToRemove.push(tableId);

      // 画面で編集する（いずれも保存しない）
      const groupCards = page.locator('[data-testid="quantity-group-card"]');
      await addGroup(page, 1);
      await renameGroupAt(page, 0, groupName);
      await addItemToGroupAt(page, 0, 1, { workType: '上限工種', name: '上限名称', unit: 'm2' });
      await renameTable(page, editedTableName);
      const unsavedIndicator = page.getByText('未保存の変更があります', { exact: true });
      await expect(unsavedIndicator).toBeVisible({ timeout: getTimeout(5000) });

      // 保存の要求の本文だけを件数の上限を超えるまで増やす（応答はバックエンドの実際のもの）
      const savePattern = `**/api/quantity-tables/${tableId}/save`;
      const sentGroupNames: unknown[][] = [];
      await page.route(savePattern, async (route) => {
        const body = route.request().postDataJSON() as {
          groups: Array<Record<string, unknown>>;
        };
        sentGroupNames.push(body.groups.map((group) => group.name));
        await route.continue({
          postData: JSON.stringify({ ...body, groups: limitCase.inflate(body.groups) }),
        });
      });

      const rejectedResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/quantity-tables/${tableId}/save`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(60000) }
      );
      await page.getByRole('button', { name: '保存' }).click();
      const rejected = await rejectedResponse;
      expect(sentGroupNames, '前提: 画面の編集が保存の本文に載っている').toEqual([[groupName]]);
      expect(rejected.status(), '前提: バックエンドが件数の上限の 400 を返す').toBe(400);

      // 上限のメッセージを完全一致で表示し、汎用の文言は出さない
      const operationAlert = page.getByRole('alert').filter({ hasText: '保存できません: ' });
      await expect(operationAlert.locator('p').first()).toHaveText(limitCase.expectedMessage, {
        timeout: getTimeout(10000),
      });
      await expect(page.getByText('保存に失敗しました。再度お試しください。')).toHaveCount(0);

      // 編集中の内容と未保存の表示が残る（42.9）
      await expect(page.getByLabel('数量表名')).toHaveValue(editedTableName);
      await expect(groupCards).toHaveCount(1);
      await expect(groupCards.nth(0).locator('h3').first()).toHaveText(groupName);
      await expect(
        groupCards
          .nth(0)
          .locator('[data-testid="quantity-item-row"]')
          .first()
          .locator('input[id$="-name"]')
      ).toHaveValue('上限名称');
      await expect(unsavedIndicator).toBeVisible();

      // 何も書き込まれていない（数量表名は作成時のまま、数量グループは無い）
      const token = await getAccessToken(page, 'REGULAR_USER');
      assertPrepared(token, 'アクセストークン');
      const detail = await page.request.get(`${API_BASE_URL}/api/quantity-tables/${tableId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(detail.status(), '数量表を取得できる').toBe(200);
      const persisted = (await detail.json()) as { name: string; groups: unknown[] };
      expect(persisted.name).toBe(tableName);
      expect(persisted.groups).toEqual([]);

      // 非空証明: 本文を増やさずに保存し直すと保存される（400 は増やした件数による）
      await page.unroute(savePattern);
      await saveQuantityTableDraft(page);
      await expect(unsavedIndicator).toHaveCount(0);
    });
  }

  // --------------------------------------------------------------------------
  // クリーンアップ
  // --------------------------------------------------------------------------
  test.describe('クリーンアップ', () => {
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
        const hasDeleteButton = await isVisibleWithin(deleteButton, 5000);
        if (hasDeleteButton) {
          await deleteButton.click();
          // 関連データがあるプロジェクトでは確定ボタンが「削除する」になる（REQ-9.5）
          const confirmButton = page
            .getByTestId('focus-manager-overlay')
            .getByRole('button', { name: /^削除(する)?$/i });
          const hasConfirmButton = await isVisibleWithin(confirmButton, 5000);
          if (hasConfirmButton) {
            await confirmButton.click();
            await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
          }
        }
      }
    });
  });
});
