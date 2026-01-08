/**
 * @fileoverview 検索対象拡張E2Eテスト
 *
 * Task 25.3: 検索対象拡張E2Eテスト
 *
 * Requirements:
 * - 4.1a: 検索フィールドにキーワードを入力してEnterキーを押すと、
 *         プロジェクト名、顧客名、営業担当者、工事担当者を対象に部分一致検索を実行
 * - 4.1b: 検索フィールドにキーワードを入力して検索ボタンをクリックすると、
 *         プロジェクト名、顧客名、営業担当者、工事担当者を対象に部分一致検索を実行
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';
import { getPrismaClient } from '../../fixtures/database';
import { hashPassword } from '../../helpers/test-users';

// Prisma Client型定義
type PrismaClientType = ReturnType<typeof getPrismaClient>;

// テストデータ用の定数
const TEST_PREFIX = 'search-scope-test-';
const SALES_PERSON_NAME = 'SalesPersonUnique田中';
const CONSTRUCTION_PERSON_NAME = 'ConstructionPersonUnique山田';
const PROJECT_NAME_FOR_SALES = `${TEST_PREFIX}営業担当テスト案件`;
const PROJECT_NAME_FOR_CONSTRUCTION = `${TEST_PREFIX}工事担当テスト案件`;
const PROJECT_NAME_FOR_MULTI_FIELD = `${TEST_PREFIX}複数フィールドテスト案件`;

/**
 * 検索対象拡張E2Eテスト
 */
test.describe('検索対象拡張 (Task 25.3)', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  let prisma: PrismaClientType;
  let testSalesPersonId: string;
  let testConstructionPersonId: string;

  /**
   * テストデータのセットアップ
   * - ユニークな表示名を持つ営業担当者と工事担当者ユーザーを作成
   * - それらを担当者として設定したプロジェクトを作成
   */
  test.beforeAll(async () => {
    prisma = getPrismaClient();

    try {
      // 既存のテストデータをクリーンアップ
      await cleanupTestData(prisma);

      // userロールを取得
      const userRole = await prisma.role.findUnique({
        where: { name: 'user' },
      });

      if (!userRole) {
        throw new Error('User role not found');
      }

      // テスト用営業担当者ユーザーを作成
      const salesPersonEmail = `${TEST_PREFIX}sales@test.com`;
      const salesPerson = await prisma.user.create({
        data: {
          email: salesPersonEmail,
          passwordHash: await hashPassword('Password123!'),
          displayName: SALES_PERSON_NAME,
          userRoles: {
            create: {
              roleId: userRole.id,
            },
          },
        },
      });
      testSalesPersonId = salesPerson.id;

      // テスト用工事担当者ユーザーを作成
      const constructionPersonEmail = `${TEST_PREFIX}construction@test.com`;
      const constructionPerson = await prisma.user.create({
        data: {
          email: constructionPersonEmail,
          passwordHash: await hashPassword('Password123!'),
          displayName: CONSTRUCTION_PERSON_NAME,
          userRoles: {
            create: {
              roleId: userRole.id,
            },
          },
        },
      });
      testConstructionPersonId = constructionPerson.id;

      // テスト用通常ユーザーを取得（作成者として使用）
      const createdByUser = await prisma.user.findFirst({
        where: {
          email: 'user@example.com',
        },
      });

      if (!createdByUser) {
        throw new Error('Test user not found');
      }

      // 営業担当者検索用プロジェクトを作成
      await prisma.project.create({
        data: {
          name: PROJECT_NAME_FOR_SALES,
          salesPersonId: testSalesPersonId,
          constructionPersonId: null,
          status: 'PREPARING',
          createdById: createdByUser.id,
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'PREPARING',
              transitionType: 'initial',
              changedById: createdByUser.id,
            },
          },
        },
      });

      // 工事担当者検索用プロジェクトを作成
      await prisma.project.create({
        data: {
          name: PROJECT_NAME_FOR_CONSTRUCTION,
          salesPersonId: testSalesPersonId,
          constructionPersonId: testConstructionPersonId,
          status: 'PREPARING',
          createdById: createdByUser.id,
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'PREPARING',
              transitionType: 'initial',
              changedById: createdByUser.id,
            },
          },
        },
      });

      // 複数フィールド検索用プロジェクト（営業担当者と工事担当者の両方を設定）
      await prisma.project.create({
        data: {
          name: PROJECT_NAME_FOR_MULTI_FIELD,
          salesPersonId: testSalesPersonId,
          constructionPersonId: testConstructionPersonId,
          status: 'SURVEYING',
          createdById: createdByUser.id,
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'SURVEYING',
              transitionType: 'initial',
              changedById: createdByUser.id,
            },
          },
        },
      });

      console.log('Test data setup completed successfully');
    } catch (error) {
      console.error('Failed to setup test data:', error);
      throw error;
    }
  });

  /**
   * テストデータのクリーンアップ
   */
  test.afterAll(async () => {
    await cleanupTestData(prisma);
  });

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  /**
   * 営業担当者名での検索テスト
   *
   * REQ-4.1a, REQ-4.1b: 営業担当者を対象に部分一致検索を実行
   */
  test('営業担当者名での検索結果が正しいことを確認 (project-management/REQ-4.1a, REQ-4.1b)', async ({
    page,
  }) => {
    // デスクトップサイズを設定（テーブル表示）
    await page.setViewportSize({ width: 1280, height: 720 });

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // プロジェクト一覧画面が表示されることを確認
    await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 検索フィールドに営業担当者の部分名を入力
    const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
    await expect(searchInput).toBeVisible({ timeout: getTimeout(10000) });

    // 「田中」という営業担当者名の一部で検索
    await searchInput.fill('田中');
    await searchInput.press('Enter');

    // URLパラメータに検索キーワードが反映されることを確認
    await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });

    // ローディング完了を待機
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // テーブルが表示されていることを確認
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: getTimeout(10000) });

    // 営業担当者名での検索結果を確認
    // テストで作成したプロジェクトが表示されることを確認
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    // 少なくとも1件以上の結果があることを確認
    expect(rowCount).toBeGreaterThan(0);

    // 検索結果に営業担当者名「田中」が含まれる行があることを確認
    let foundSalesPersonMatch = false;
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const rowText = await row.textContent();
      if (rowText && (rowText.includes('田中') || rowText.includes(PROJECT_NAME_FOR_SALES))) {
        foundSalesPersonMatch = true;
        break;
      }
    }

    expect(foundSalesPersonMatch).toBe(true);
  });

  /**
   * 工事担当者名での検索テスト
   *
   * REQ-4.1a, REQ-4.1b: 工事担当者を対象に部分一致検索を実行
   */
  test('工事担当者名での検索結果が正しいことを確認 (project-management/REQ-4.1a, REQ-4.1b)', async ({
    page,
  }) => {
    // デスクトップサイズを設定（テーブル表示）
    await page.setViewportSize({ width: 1280, height: 720 });

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // プロジェクト一覧画面が表示されることを確認
    await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 検索フィールドに工事担当者の部分名を入力
    const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
    await expect(searchInput).toBeVisible({ timeout: getTimeout(10000) });

    // 「山田」という工事担当者名の一部で検索
    await searchInput.fill('山田');

    // 検索ボタンをクリック（REQ-4.1bのテスト）
    await page.getByRole('button', { name: /^検索$/i }).click();

    // URLパラメータに検索キーワードが反映されることを確認
    await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });

    // ローディング完了を待機
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // テーブルが表示されていることを確認
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: getTimeout(10000) });

    // 工事担当者名での検索結果を確認
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    // 少なくとも1件以上の結果があることを確認
    expect(rowCount).toBeGreaterThan(0);

    // 検索結果に工事担当者名「山田」が含まれる行があることを確認
    let foundConstructionPersonMatch = false;
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const rowText = await row.textContent();
      if (
        rowText &&
        (rowText.includes('山田') || rowText.includes(PROJECT_NAME_FOR_CONSTRUCTION))
      ) {
        foundConstructionPersonMatch = true;
        break;
      }
    }

    expect(foundConstructionPersonMatch).toBe(true);
  });

  /**
   * 複数フィールドにまたがる検索のテスト
   *
   * REQ-4.1a, REQ-4.1b: プロジェクト名、顧客名、営業担当者、工事担当者を対象に部分一致検索を実行
   */
  test('複数フィールドにまたがる検索が動作することを確認 (project-management/REQ-4.1a, REQ-4.1b)', async ({
    page,
  }) => {
    // デスクトップサイズを設定（テーブル表示）
    await page.setViewportSize({ width: 1280, height: 720 });

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // プロジェクト一覧画面が表示されることを確認
    await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
    await expect(searchInput).toBeVisible({ timeout: getTimeout(10000) });

    // Step 1: ユニークなプロジェクト名で検索（プロジェクト名フィールド）
    await searchInput.fill(TEST_PREFIX);
    await searchInput.press('Enter');

    await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // テーブルが表示されていることを確認
    const tableForStep1 = page.getByRole('table');
    await expect(tableForStep1).toBeVisible({ timeout: getTimeout(10000) });

    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    // テストプレフィックスを含むプロジェクトが少なくとも1件表示されることを確認
    expect(rowCount).toBeGreaterThan(0);

    // Step 2: フィルタをクリアして営業担当者名で再検索
    await page.getByRole('button', { name: /フィルタをクリア/i }).click();
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // 営業担当者のユニークな名前で検索
    await searchInput.fill('SalesPersonUnique');
    await searchInput.press('Enter');

    await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    const tableForStep2 = page.getByRole('table');
    await expect(tableForStep2).toBeVisible({ timeout: getTimeout(10000) });

    const salesSearchRows = page.locator('tbody tr');
    const salesSearchRowCount = await salesSearchRows.count();

    // 営業担当者名での検索結果があることを確認
    expect(salesSearchRowCount).toBeGreaterThan(0);

    // Step 3: フィルタをクリアして工事担当者名で再検索
    await page.getByRole('button', { name: /フィルタをクリア/i }).click();
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // 工事担当者のユニークな名前で検索
    await searchInput.fill('ConstructionPersonUnique');
    await searchInput.press('Enter');

    await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    const tableForStep3 = page.getByRole('table');
    await expect(tableForStep3).toBeVisible({ timeout: getTimeout(10000) });

    const constructionSearchRows = page.locator('tbody tr');
    const constructionSearchRowCount = await constructionSearchRows.count();

    // 工事担当者名での検索結果があることを確認
    expect(constructionSearchRowCount).toBeGreaterThan(0);
  });

  /**
   * 検索対象が拡張されていない場合（旧仕様）との違いを確認
   *
   * 担当者名のみで検索した場合に結果が返ることで、検索対象の拡張が機能していることを確認
   */
  test('担当者名のみでの検索が機能することを確認（検索対象拡張の動作確認）', async ({ page }) => {
    // デスクトップサイズを設定（テーブル表示）
    await page.setViewportSize({ width: 1280, height: 720 });

    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // プロジェクト一覧画面が表示されることを確認
    await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
    await expect(searchInput).toBeVisible({ timeout: getTimeout(10000) });

    // ユニークな担当者名で検索（このキーワードはプロジェクト名・顧客名には含まれない）
    const uniqueSearchTerm = 'SalesPersonUnique';
    await searchInput.fill(uniqueSearchTerm);
    await searchInput.press('Enter');

    await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // テーブルが表示されていることを確認
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: getTimeout(10000) });

    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    // 担当者名のみで検索しても結果が返ることを確認
    // これにより、検索対象が営業担当者・工事担当者に拡張されていることを確認
    expect(rowCount).toBeGreaterThan(0);

    // 検索結果の最初の行を確認
    const firstRow = rows.first();
    const firstRowText = await firstRow.textContent();

    // 検索結果に担当者名が含まれていることを確認
    expect(firstRowText).toContain(uniqueSearchTerm);
  });
});

/**
 * テストデータのクリーンアップ
 */
async function cleanupTestData(prisma: PrismaClientType): Promise<void> {
  try {
    // テスト用プロジェクトのステータス履歴を削除
    await prisma.projectStatusHistory.deleteMany({
      where: {
        project: {
          name: {
            startsWith: TEST_PREFIX,
          },
        },
      },
    });

    // テスト用プロジェクトを削除
    await prisma.project.deleteMany({
      where: {
        name: {
          startsWith: TEST_PREFIX,
        },
      },
    });

    // テスト用ユーザーのロール割り当てを削除
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: {
            startsWith: TEST_PREFIX,
          },
        },
      },
    });

    // テスト用ユーザーを削除
    await prisma.user.deleteMany({
      where: {
        email: {
          startsWith: TEST_PREFIX,
        },
      },
    });

    console.log('Test data cleanup completed');
  } catch (error) {
    console.error('Failed to cleanup test data:', error);
    // クリーンアップ失敗はテストを中断しない
  }
}
