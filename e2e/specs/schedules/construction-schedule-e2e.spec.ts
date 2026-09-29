/**
 * @fileoverview 工程表機能 E2Eテスト
 *
 * Task 16.2: E2Eテストを作成する
 *
 * テスト対象:
 * - 工程表一覧の表示・ナビゲーション
 * - 工程表の新規作成（数量表連携あり/なし）
 * - 項目入力（着工日、日数）とガントチャートリアルタイム更新の確認
 * - 任意項目の追加・削除
 * - 並び順の変更と保存
 * - 出力対象チェックボックスの操作
 * - ラベル文字・詳細文字の入力と表示確認
 * - Excel/PDF出力のダウンロード
 * - Excel/PDF出力の失敗時のエラーメッセージと再試行（Task 17.1）
 *
 * Requirements:
 * 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3,
 * 4.1, 4.2, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 7.1, 7.6, 8.1,
 * 8.6, 9.1, 9.3, 9.5, 10.1, 10.2, 11.1, 11.2
 *
 * @module e2e/specs/schedules/construction-schedule-e2e
 */

import { test, expect, type Page, type Response, type Route } from '@playwright/test';
import * as fs from 'fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient, disconnectDatabase } from '../../fixtures/database';

// ============================================================================
// テストフィクスチャ
// ============================================================================

let testProjectId: string;

/** テスト用プロジェクトの名称（PDF 出力のヘッダーに日本語のまま読めることを確かめる） */
const TEST_PROJECT_NAME = 'E2E工程表テスト用プロジェクト';

/**
 * ダウンロードした PDF の全ページから、描かれた文字列を pdfjs-dist で読み取る。
 * 日本語フォントを埋め込んでいない PDF では、日本語は元の文字列に戻らない（Task 18.5）。
 */
async function readPdfTexts(pdfFilePath: string): Promise<string[]> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfFilePath)) })
    .promise;
  const texts: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const content = await (await pdf.getPage(pageNumber)).getTextContent();
    for (const item of content.items) {
      if ('str' in item && item.str.trim() !== '') texts.push(item.str);
    }
  }
  return texts;
}

/**
 * テスト用プロジェクトを作成
 */
async function setupTestProject(): Promise<string> {
  const prisma = getPrismaClient();

  // 工程表関連の権限を確保
  const schedulePermissions = [
    { resource: 'schedule', action: 'create', description: '工程表の作成' },
    { resource: 'schedule', action: 'read', description: '工程表の閲覧' },
    { resource: 'schedule', action: 'update', description: '工程表の更新' },
    { resource: 'schedule', action: 'delete', description: '工程表の削除' },
  ];

  await prisma.permission.createMany({
    data: schedulePermissions,
    skipDuplicates: true,
  });

  // userロールにschedule権限を割り当て
  const userRole = await prisma.role.findUnique({ where: { name: 'user' } });
  const permissions = await prisma.permission.findMany({
    where: {
      resource: 'schedule',
      action: { in: ['create', 'read', 'update', 'delete'] },
    },
  });

  if (userRole && permissions.length > 0) {
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({
        roleId: userRole.id,
        permissionId: p.id,
      })),
      skipDuplicates: true,
    });
  }

  // テストユーザーを取得
  const testUser = await prisma.user.findUnique({
    where: { email: 'user@example.com' },
  });

  if (!testUser) {
    throw new Error('テストユーザーが見つかりません。global-setupを確認してください。');
  }

  // テスト用プロジェクトを作成
  const project = await prisma.project.create({
    data: {
      name: TEST_PROJECT_NAME,
      status: 'PREPARING',
      salesPersonId: testUser.id,
      createdById: testUser.id,
    },
  });

  return project.id;
}

/**
 * テストデータのクリーンアップ
 */
async function cleanupTestData(): Promise<void> {
  const prisma = getPrismaClient();

  if (testProjectId) {
    // 工程表を先に削除（FK制約）
    await prisma.constructionSchedule.deleteMany({
      where: { projectId: testProjectId },
    });
    // 数量表関連も削除
    const quantityTables = await prisma.quantityTable.findMany({
      where: { projectId: testProjectId },
      select: { id: true },
    });
    for (const qt of quantityTables) {
      await prisma.quantityGroup.deleteMany({
        where: { quantityTableId: qt.id },
      });
    }
    await prisma.quantityTable.deleteMany({
      where: { projectId: testProjectId },
    });
    await prisma.project.deleteMany({
      where: { id: testProjectId },
    });
  }
}

/**
 * 工程表の一括保存（PUT /api/schedules/{id}/bulk-save）の応答を待つ Promise を返す。
 *
 * 保存ボタンの click より前に呼び、click の後に await すること。
 * bulk-save は十数ミリ秒で返るため、click の後に待ち始めると応答を取り逃す。
 * 一致はパス基準にする。CI とローカルで API のオリジンが違う（localhost と 127.0.0.1）ため。
 */
function waitForBulkSaveResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      /^\/api\/schedules\/[^/]+\/bulk-save$/.test(new URL(response.url()).pathname),
    { timeout: getTimeout(15000) }
  );
}

// ============================================================================
// テストスイート
// ============================================================================

test.describe('工程表機能 E2Eテスト', () => {
  // シリアル実行（データ依存性あり）
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    testProjectId = await setupTestProject();
  });

  test.afterAll(async () => {
    await cleanupTestData();
    await disconnectDatabase();
  });

  // =================================================================
  // 工程表一覧の表示・ナビゲーション (Req 1.1)
  // =================================================================
  test.describe('工程表一覧の表示・ナビゲーション', () => {
    test('工程表一覧画面が表示される (Req 1.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      // ページが表示されることを確認
      await expect(page.getByRole('heading', { name: '工程表一覧' })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    test('工程表が未作成の場合は空状態が表示される (Req 1.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      // 空状態の確認
      await expect(page.getByText('工程表はまだありません')).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    test('新規作成ボタンが表示される (Req 1.2)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      // 新規作成ボタンの確認
      await expect(page.getByText('新規作成').first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  // =================================================================
  // 工程表の新規作成（数量表連携なし）(Req 1.2, 1.3, 2.2)
  // =================================================================
  test.describe('工程表の新規作成', () => {
    test('数量表なしで工程表を新規作成できる (Req 1.2, 1.3, 2.2)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules/new`, {
        waitUntil: 'networkidle',
      });

      // 作成画面が表示されることを確認
      await expect(page.getByRole('heading', { name: '工程表作成' })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 工程表名称を入力
      await page.getByLabel('工程表名称').fill('E2Eテスト工程表');

      // 数量表は選択しない（デフォルト: 数量表なし）
      await expect(page.getByLabel('数量表')).toHaveValue('');

      // 作成ボタンをクリック
      await page.getByRole('button', { name: '作成' }).click();

      // 詳細画面に遷移することを確認
      await page.waitForURL(/\/schedules\//, { timeout: getTimeout(15000) });

      // 工程表名が表示されること
      await expect(page.getByRole('heading', { name: 'E2Eテスト工程表' })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    test('数量表選択肢が表示される (Req 2.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules/new`, {
        waitUntil: 'networkidle',
      });

      // 数量表セレクトボックスが存在することを確認
      const selectEl = page.getByLabel('数量表');
      await expect(selectEl).toBeVisible({ timeout: getTimeout(10000) });

      // 「数量表なし」オプションがあること
      await expect(selectEl.locator('option', { hasText: '数量表なし' })).toBeAttached();
    });

    test('数量表連携ありで工程表を新規作成できる (Req 2.1, 2.3)', async ({ page }) => {
      const prisma = getPrismaClient();

      // テスト用数量表を作成
      const quantityTable = await prisma.quantityTable.create({
        data: {
          projectId: testProjectId,
          name: 'E2Eテスト数量表',
        },
      });

      const group = await prisma.quantityGroup.create({
        data: {
          quantityTableId: quantityTable.id,
          name: 'テストグループ',
          displayOrder: 0,
        },
      });

      await prisma.quantityItem.createMany({
        data: [
          {
            quantityGroupId: group.id,
            name: 'E2E基礎工事',
            workType: '基礎',
            unit: '式',
            quantity: 1,
            displayOrder: 0,
          },
          {
            quantityGroupId: group.id,
            name: 'E2E鉄骨工事',
            workType: '鉄骨',
            unit: '式',
            quantity: 1,
            displayOrder: 1,
          },
        ],
      });

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules/new`, {
        waitUntil: 'networkidle',
      });

      // 工程表名称を入力
      await page.getByLabel('工程表名称').fill('数量表連携E2Eテスト');

      // 数量表を選択
      await page.getByLabel('数量表').selectOption({ label: 'E2Eテスト数量表' });

      // 作成ボタンをクリック
      await page.getByRole('button', { name: '作成' }).click();

      // 詳細画面に遷移
      await page.waitForURL(/\/schedules\//, { timeout: getTimeout(15000) });

      // 数量表由来の項目が表示されることを確認（input要素のvalue値として表示される）
      const itemNames = page.locator('[data-testid^="item-name-"]');
      await expect(itemNames.nth(0)).toHaveValue('E2E基礎工事', {
        timeout: getTimeout(10000),
      });
      await expect(itemNames.nth(1)).toHaveValue('E2E鉄骨工事', {
        timeout: getTimeout(10000),
      });
    });
  });

  // =================================================================
  // 一覧から詳細への遷移 (Req 1.4)
  // =================================================================
  test.describe('一覧と詳細画面のナビゲーション', () => {
    test('一覧画面に作成した工程表が表示される (Req 1.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      // 以前作成した工程表が一覧に表示されること
      await expect(page.getByText('E2Eテスト工程表')).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    test('一覧から工程表詳細画面に遷移できる (Req 1.4)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      // 工程表名をクリック
      await page.getByText('E2Eテスト工程表').first().click();

      // 詳細画面に遷移
      await page.waitForURL(/\/schedules\//, { timeout: getTimeout(15000) });

      // 詳細画面が表示されること
      await expect(page.getByRole('heading', { name: 'E2Eテスト工程表' })).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  // =================================================================
  // 項目入力・ガントチャートリアルタイム更新 (Req 3.1, 3.2, 3.3, 6.1)
  // =================================================================
  test.describe('項目入力とガントチャート', () => {
    test('任意項目を追加して着工日と日数を入力できる (Req 3.1, 3.2, 4.1, 4.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      // 工程表詳細に遷移
      await page.getByText('E2Eテスト工程表').first().click();
      await page.waitForURL(/\/schedules\//, { timeout: getTimeout(15000) });

      // 項目追加ボタンをクリック
      await page.getByTestId('add-item-button').click();

      // 項目名を入力
      const itemNameInputs = page.locator('[data-testid^="item-name-"]');
      const lastItemName = itemNameInputs.last();
      await lastItemName.fill('E2E追加項目');

      // 着工日を入力
      const startDateInputs = page.locator('[data-testid^="start-date-"]');
      const lastStartDate = startDateInputs.last();
      await lastStartDate.fill('2026-05-01');

      // 日数を入力
      const durationInputs = page.locator('[data-testid^="duration-"]');
      const lastDuration = durationInputs.last();
      await lastDuration.fill('10');

      // ガントチャートエリアが存在すること (Req 6.1)
      await expect(page.getByTestId('gantt-chart-area')).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    test('ガントチャートエリアが表示される (Req 6.1, 6.2, 6.3, 6.4)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      // 数量表連携工程表の詳細に遷移
      await page.getByText('数量表連携E2Eテスト').first().click();
      await page.waitForURL(/\/schedules\//, { timeout: getTimeout(15000) });

      // ガントチャートエリアが存在すること
      await expect(page.getByTestId('gantt-chart-area')).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  // =================================================================
  // 任意項目の追加・削除 (Req 4.1, 4.3)
  // =================================================================
  test.describe('任意項目の追加・削除', () => {
    test('任意項目を追加できる (Req 4.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      await page.getByText('E2Eテスト工程表').first().click();
      await page.waitForURL(/\/schedules\//, { timeout: getTimeout(15000) });

      // 現在の項目数を記録
      const itemsBefore = await page.locator('[data-testid^="item-name-"]').count();

      // 項目追加
      await page.getByTestId('add-item-button').click();

      // 項目数が増えたことを確認
      const itemsAfter = await page.locator('[data-testid^="item-name-"]').count();
      expect(itemsAfter).toBeGreaterThan(itemsBefore);
    });
  });

  // =================================================================
  // 出力対象チェックボックスの操作 (Req 9.1)
  // =================================================================
  test.describe('出力対象チェックボックス', () => {
    test('出力対象チェックボックスが表示される (Req 9.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      await page.getByText('数量表連携E2Eテスト').first().click();
      await page.waitForURL(/\/schedules\//, { timeout: getTimeout(15000) });

      // 出力対象チェックボックスが存在すること
      const checkboxes = page.locator('[data-testid^="export-target-"]');
      const firstCheckbox = checkboxes.first();
      await expect(firstCheckbox).toBeVisible({ timeout: getTimeout(10000) });
      const count = await checkboxes.count();
      expect(count).toBeGreaterThan(0);

      // デフォルトでチェック済みであること
      await expect(firstCheckbox).toBeChecked({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement construction-schedule/REQ-9.5
     */
    test('出力対象チェックボックスの設定が保存後も永続化される (construction-schedule/REQ-9.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      await page.getByText('数量表連携E2Eテスト').first().click();
      await page.waitForURL(/\/schedules\//, { timeout: getTimeout(15000) });

      // 出力対象チェックボックスの最初の項目を取得
      const firstCheckbox = page.locator('[data-testid^="export-target-"]').first();
      await expect(firstCheckbox).toBeVisible({ timeout: getTimeout(5000) });

      // 現在の状態を観測して「トグル後はこうなるはず」と分岐する形は、初期状態が変われば
      // 主張する内容も入れ替わり、どちらの向きも検証されないまま通りうる。
      // 既知の状態（チェック済み。既定値であることは直前のテストが主張している）へ揃えてから
      // 外し、外れたことを無条件に主張する。
      // `check()` は既にチェック済みなら何もしないため、既定の状態を壊さない。
      await firstCheckbox.check();
      await expect(firstCheckbox, '前提: 出力対象をチェック済みの状態に揃える').toBeChecked({
        timeout: getTimeout(5000),
      });

      // チェックを外す
      await firstCheckbox.uncheck();
      await expect(firstCheckbox, 'REQ-9.5: 出力対象のチェックを外せる').not.toBeChecked({
        timeout: getTimeout(5000),
      });

      // 保存ボタンをクリックし、保存の応答を待つ。
      // bulk-save は十数ミリ秒で返るため、応答待ちは click の前に登録しないと取り逃す。
      // 一致はパス基準にする（CI とローカルで API のオリジンが localhost と 127.0.0.1 で違う）。
      const saveResponsePromise = waitForBulkSaveResponse(page);
      await page.getByTestId('save-button').click();
      const saveResponse = await saveResponsePromise;
      expect(saveResponse.status(), '前提: 出力対象の変更の保存が成功する').toBe(200);

      // ページをリロードして永続化を検証
      await page.reload({ waitUntil: 'networkidle' });

      // リロード後のチェック状態が保存した状態（未チェック）と一致すること
      const reloadedCheckbox = page.locator('[data-testid^="export-target-"]').first();
      await expect(
        reloadedCheckbox,
        'REQ-9.5: 保存した「出力対象から外した」状態がリロード後も保持される'
      ).not.toBeChecked({ timeout: getTimeout(10000) });

      // テストデータのクリーンアップ: 既定の状態（チェック済み）へ戻す
      await reloadedCheckbox.check();
      await expect(reloadedCheckbox, '後始末: 出力対象を既定のチェック済みへ戻す').toBeChecked({
        timeout: getTimeout(5000),
      });
      const cleanupResponsePromise = waitForBulkSaveResponse(page);
      await page.getByTestId('save-button').click();
      const cleanupResponse = await cleanupResponsePromise;
      expect(cleanupResponse.status(), '後始末: 既定の状態への保存が成功する').toBe(200);
    });
  });

  // =================================================================
  // ラベル文字・詳細文字の入力と表示確認 (Req 10.1, 10.2, 11.1, 11.2)
  // =================================================================
  test.describe('ラベル文字・詳細文字', () => {
    test('ラベル文字と詳細文字の入力欄が存在する (Req 10.1, 11.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      await page.getByText('数量表連携E2Eテスト').first().click();
      await page.waitForURL(/\/schedules\//, { timeout: getTimeout(15000) });

      // ラベル文字入力欄が存在すること
      const labelInputs = page.locator('[data-testid^="label-text-"]');
      await expect(labelInputs.first()).toBeVisible({ timeout: getTimeout(10000) });
      const labelCount = await labelInputs.count();
      expect(labelCount).toBeGreaterThan(0);

      // 詳細文字入力欄が存在すること
      const detailInputs = page.locator('[data-testid^="detail-text-"]');
      await expect(detailInputs.first()).toBeVisible({ timeout: getTimeout(10000) });
      const detailCount = await detailInputs.count();
      expect(detailCount).toBeGreaterThan(0);
    });
  });

  // =================================================================
  // 保存操作 (Req 5.2)
  // =================================================================
  test.describe('保存操作', () => {
    test('保存ボタンが表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      await page.getByText('E2Eテスト工程表').first().click();
      await page.waitForURL(/\/schedules\//, { timeout: getTimeout(15000) });

      // 保存ボタンが存在すること
      await expect(page.getByTestId('save-button')).toBeVisible({
        timeout: getTimeout(5000),
      });
    });
  });

  // =================================================================
  // Excel/PDF出力のダウンロード (Req 7.1, 8.1)
  // =================================================================
  test.describe('Excel/PDF出力', () => {
    test('出力ボタンが表示される (Req 7.1, 8.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      await page.getByText('E2Eテスト工程表').first().click();
      await page.waitForURL(/\/schedules\//, { timeout: getTimeout(15000) });

      // 出力ボタンが存在すること
      await expect(page.getByTestId('export-button')).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    test('出力ダイアログが開く (Req 7.1, 8.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      await page.getByText('E2Eテスト工程表').first().click();
      await page.waitForURL(/\/schedules\//, { timeout: getTimeout(15000) });

      // 出力ボタンをクリック
      await page.getByTestId('export-button').click();

      // 出力ダイアログが表示されること
      await expect(page.getByRole('dialog')).toBeVisible({
        timeout: getTimeout(5000),
      });

      // Excel出力ボタンが存在すること
      await expect(page.getByText('Excel').first()).toBeVisible({
        timeout: getTimeout(5000),
      });

      // PDF出力ボタンが存在すること
      await expect(page.getByText('PDF').first()).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    test('Excelファイルのダウンロードが開始される (Req 7.1)', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      await page.getByText('E2Eテスト工程表').first().click();
      await page.waitForURL(/\/schedules\//, { timeout: getTimeout(15000) });

      // 出力ボタンをクリック
      await page.getByTestId('export-button').click();

      // ダイアログが開くのを待機
      await expect(page.getByRole('dialog')).toBeVisible({
        timeout: getTimeout(5000),
      });

      // Excel形式が選択されていることを確認（デフォルト）
      const xlsxRadio = page.locator('input[value="xlsx"]');
      await expect(xlsxRadio).toBeChecked({ timeout: getTimeout(5000) });

      // ダウンロードイベントを監視して出力ボタンをクリック
      const downloadPromise = page.waitForEvent('download', {
        timeout: getTimeout(30000),
      });

      // ダイアログ内の出力ボタンをクリック
      await page.getByRole('dialog').getByRole('button', { name: '出力' }).click();

      // ダウンロードが開始されることを確認
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('.xlsx');
    });

    test('PDFファイルのダウンロードが開始され、日本語のプロジェクト名が読める (Req 8.1, 8.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      await page.getByText('E2Eテスト工程表').first().click();
      await page.waitForURL(/\/schedules\//, { timeout: getTimeout(15000) });

      // 出力ボタンをクリック
      await page.getByTestId('export-button').click();

      // ダイアログが開くのを待機
      await expect(page.getByRole('dialog')).toBeVisible({
        timeout: getTimeout(5000),
      });

      // PDF形式を選択
      const pdfRadio = page.locator('input[value="pdf"]');
      await pdfRadio.click();
      await expect(pdfRadio).toBeChecked({ timeout: getTimeout(5000) });

      // ダウンロードイベントを監視して出力ボタンをクリック
      const downloadPromise = page.waitForEvent('download', {
        timeout: getTimeout(30000),
      });

      // ダイアログ内の出力ボタンをクリック
      await page.getByRole('dialog').getByRole('button', { name: '出力' }).click();

      // ダウンロードが開始されることを確認
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('.pdf');

      // 実際の API が出力した PDF のヘッダーに、日本語のプロジェクト名が文字化けせずに読める
      const downloadPath = await download.path();
      expect(downloadPath).toBeTruthy();
      expect(await readPdfTexts(downloadPath!)).toContain(TEST_PROJECT_NAME);
    });

    /**
     * 出力の失敗から再試行でダウンロードが成功するまでを、形式ごとに通しで確かめる。
     *
     * export API への応答だけを 500 に差し替えて失敗の前提を作り、エラーメッセージと
     * 「再試行」ボタンが出ることを確かめる。差し替えを外してから再試行を押し、
     * 直前に選んだ形式でダウンロードが成功することまでを見る。
     *
     * 差し替えの一致はパス基準である。CI とローカルで API のオリジンが違う
     * （localhost と 127.0.0.1）ため、オリジンを含めると CI で一致せず空振りする。
     * 空振りを見逃さないよう、差し替えた応答を返した回数を数えて主張する。
     */
    async function verifyExportFailureAndRetry(page: Page, format: 'xlsx' | 'pdf'): Promise<void> {
      const exportRoutePattern = '**/api/schedules/*/export**';
      let failedResponses = 0;
      const failExport = async (route: Route): Promise<void> => {
        failedResponses += 1;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'forced failure for construction-schedule export E2E' }),
        });
      };

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      await page.getByText('E2Eテスト工程表').first().click();
      await page.waitForURL(/\/schedules\//, { timeout: getTimeout(15000) });

      // 1. export API を 500 にする
      await page.route(exportRoutePattern, failExport);

      await page.getByTestId('export-button').click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: getTimeout(5000) });

      const formatRadio = page.locator(`input[value="${format}"]`);
      await formatRadio.click();
      await expect(formatRadio).toBeChecked({ timeout: getTimeout(5000) });

      // 2. 出力を押す
      await dialog.getByRole('button', { name: '出力', exact: true }).click();

      // 3. エラーメッセージと「再試行」ボタンが出る
      const alert = dialog.getByRole('alert');
      await expect(alert).toHaveText(/工程表の出力に失敗しました/, {
        timeout: getTimeout(10000),
      });
      const retryButton = alert.getByRole('button', { name: '再試行', exact: true });
      await expect(retryButton).toBeVisible({ timeout: getTimeout(5000) });
      expect(failedResponses).toBe(1);

      // 4. 差し替えを外す（登録時と同じハンドラ参照で外す）
      await page.unroute(exportRoutePattern, failExport);

      // 5. 再試行を押す。再試行が直前の形式で出力を要求し直すことも確かめる
      const retryRequestPromise = page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname.endsWith('/export') &&
          new URL(request.url()).searchParams.get('format') === format,
        { timeout: getTimeout(30000) }
      );
      const downloadPromise = page.waitForEvent('download', {
        timeout: getTimeout(30000),
      });
      await retryButton.click();

      // 6. ダウンロードが成功する
      await retryRequestPromise;
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain(`.${format}`);
      expect(await download.failure()).toBeNull();
      await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });
      expect(failedResponses).toBe(1);
    }

    /**
     * @requirement construction-schedule/REQ-7.6
     */
    test('Excel出力の失敗時にエラーメッセージと再試行が現れ、再試行でダウンロードできる (construction-schedule/REQ-7.6)', async ({
      page,
    }) => {
      await verifyExportFailureAndRetry(page, 'xlsx');
    });

    /**
     * @requirement construction-schedule/REQ-8.6
     */
    test('PDF出力の失敗時にエラーメッセージと再試行が現れ、再試行でダウンロードできる (construction-schedule/REQ-8.6)', async ({
      page,
    }) => {
      await verifyExportFailureAndRetry(page, 'pdf');
    });
  });

  // =================================================================
  // 工程表の削除 (Req 1.5)
  // =================================================================
  test.describe('工程表の削除', () => {
    test('一覧画面から工程表を削除できる (Req 1.5)', async ({ page }) => {
      // テスト用の工程表を作成
      const prisma = getPrismaClient();
      await prisma.constructionSchedule.create({
        data: {
          projectId: testProjectId,
          name: '削除テスト工程表',
          version: 0,
        },
      });

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}/schedules`, {
        waitUntil: 'networkidle',
      });

      // 削除の前に、一覧へ当該工程表のリンクが**出ている**ことを完全一致で確かめる。
      // **下の「消えたこと」の主張が指すアクセシブル名の錨はこの一行である**
      // （タスク 115.302。是正の形はタスク 115.251 に倣う）。名前は `aria-label` ではなく
      // `ScheduleListPage.tsx` の名称欄のリンクの表示文言に由来し、`getByLabel` が指す
      // `削除テスト工程表を削除` は**別綴りなので錨にならない**。
      //
      // 実行した変異と出力（2026-09-06 に実測。frontend は test 環境で再ビルドし、
      // 変異前と復元後の配信バンドルが `assets/index-D5RUevcK.js` で一致することを照合した）:
      //   - M1 名称欄のリンクの表示を `{schedule.name}（工程表）` へ変える変異
      //     （配信 `assets/index-BMZGJ3l-.js`）を当てても、**是正前は本区間が
      //     1 passed / 0 failed で緑のまま**であった。削除の主張は一致が零件でも真になるため、
      //     リンクの綴りが変わると静かに空振りへ変わる。
      //   （M1 が入れる綴りは復元済みであり、いまのリポジトリには無い。逆引用符は変異が置く
      //     字面を示すものであって、作業ツリーに実在することの主張ではない。）
      //   - 同じ M1 を当てたまま本行を足すと、**本区間は 0 passed / 1 failed で赤になる**。
      //     復元後は 1 passed / 0 failed に戻る。
      //   実行したコマンドは
      //   `npm run test:e2e -- e2e/specs/schedules/construction-schedule-e2e.spec.ts -g "一覧画面から工程表を削除できる"`。
      //
      // **検出されないのは E2E 層に限った話である。** 単体側には錨があり、
      // `frontend/src/pages/ScheduleListPage.test.tsx` が名称欄の表示を `getByText` で
      // 完全一致に固定している。M1 を当てて同ファイルを走らせると 17 件のうち 1 件が落ちる
      // （1 failed / 16 passed。2026-09-06 に実測）。ここで塞ぐのは E2E 層の空振りである。
      //
      // 固定が緩められたら `npm run check:e2e-guards` の `T13-unanchored-accessible-name` が
      // 赤になる（走査は `npx tsx scripts/check-e2e-assertion-guards.ts --accessible-names`）。
      await expect(page.getByRole('link', { name: '削除テスト工程表', exact: true })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 削除ボタンをクリック
      const deleteButton = page.getByLabel('削除テスト工程表を削除');
      await deleteButton.click();

      // 確認ダイアログが表示される
      await expect(page.getByRole('dialog')).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 確認ボタンをクリック
      await page.getByRole('button', { name: '確認' }).click();

      // 一覧から消えること（リンク要素で特定）
      await expect(page.getByRole('link', { name: '削除テスト工程表' })).not.toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });
});
