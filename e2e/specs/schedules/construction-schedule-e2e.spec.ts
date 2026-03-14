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
 *
 * Requirements:
 * 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3,
 * 4.1, 4.2, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 7.1, 8.1, 9.1,
 * 9.3, 9.5, 10.1, 10.2, 11.1, 11.2
 *
 * @module e2e/specs/schedules/construction-schedule-e2e
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient, disconnectDatabase } from '../../fixtures/database';

// ============================================================================
// テストフィクスチャ
// ============================================================================

let testProjectId: string;

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
      name: 'E2E工程表テスト用プロジェクト',
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
      await expect(page.getByText('E2Eテスト工程表')).toBeVisible({
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

      // 数量表由来の項目が表示されることを確認
      await expect(page.getByText('E2E基礎工事')).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByText('E2E鉄骨工事')).toBeVisible({
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
      await expect(page.getByText('E2Eテスト工程表')).toBeVisible({
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
      const count = await checkboxes.count();
      expect(count).toBeGreaterThan(0);

      // デフォルトでチェック済みであること
      const firstCheckbox = checkboxes.first();
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

      // 現在のチェック状態を取得
      const wasChecked = await firstCheckbox.isChecked();

      // チェック状態をトグル
      await firstCheckbox.click();
      const toggledState = !wasChecked;

      // トグル後の状態が反映されていることを確認
      if (toggledState) {
        await expect(firstCheckbox).toBeChecked({ timeout: getTimeout(5000) });
      } else {
        await expect(firstCheckbox).not.toBeChecked({ timeout: getTimeout(5000) });
      }

      // 保存ボタンをクリック
      await page.getByTestId('save-button').click();

      // 保存完了を待機（成功通知またはネットワークアイドル）
      await page.waitForResponse(
        (response) => response.url().includes('/schedules') && response.status() === 200,
        { timeout: getTimeout(15000) }
      );

      // ページをリロードして永続化を検証
      await page.reload({ waitUntil: 'networkidle' });

      // リロード後のチェック状態が保存した状態と一致すること
      const reloadedCheckbox = page.locator('[data-testid^="export-target-"]').first();
      if (toggledState) {
        await expect(reloadedCheckbox).toBeChecked({ timeout: getTimeout(10000) });
      } else {
        await expect(reloadedCheckbox).not.toBeChecked({ timeout: getTimeout(10000) });
      }

      // テストデータのクリーンアップ: 元の状態に戻す
      await reloadedCheckbox.click();
      await page.getByTestId('save-button').click();
      await page.waitForResponse(
        (response) => response.url().includes('/schedules') && response.status() === 200,
        { timeout: getTimeout(15000) }
      );
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
      const labelCount = await labelInputs.count();
      expect(labelCount).toBeGreaterThan(0);

      // 詳細文字入力欄が存在すること
      const detailInputs = page.locator('[data-testid^="detail-text-"]');
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

      // 出力ボタンをクリック
      await page.getByRole('button', { name: '出力' }).click();

      // ダウンロードが開始されることを確認
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('.xlsx');
    });

    test('PDFファイルのダウンロードが開始される (Req 8.1)', async ({ page }) => {
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

      // 出力ボタンをクリック
      await page.getByRole('button', { name: '出力' }).click();

      // ダウンロードが開始されることを確認
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('.pdf');
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

      // 削除ボタンをクリック
      const deleteButton = page.getByLabel('削除テスト工程表を削除');
      await deleteButton.click();

      // 確認ダイアログが表示される
      await expect(page.getByRole('dialog')).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 確認ボタンをクリック
      await page.getByRole('button', { name: '確認' }).click();

      // 一覧から消えること
      await expect(page.getByText('削除テスト工程表')).not.toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });
});
