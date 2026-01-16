/**
 * @fileoverview プロジェクト一覧の列構成変更E2Eテスト
 *
 * Task 25.2: 一覧表示の列構成変更E2Eテスト
 *
 * Requirements:
 * - 2.2: 各プロジェクトのプロジェクト名、顧客名、営業担当者、工事担当者、ステータス、作成日、更新日を一覧に表示
 *        （ID列を削除し、営業担当者・工事担当者列を追加）
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';
import { getPrismaClient } from '../../fixtures/database';
import { hashPassword } from '../../helpers/test-users';

// Prisma Client型定義
type PrismaClientType = ReturnType<typeof getPrismaClient>;

// テストデータ用の定数
const TEST_PREFIX = 'list-columns-test-';
const PROJECT_WITH_CONSTRUCTION = `${TEST_PREFIX}工事担当者設定済みプロジェクト`;
const PROJECT_WITHOUT_CONSTRUCTION = `${TEST_PREFIX}工事担当者未設定プロジェクト`;

/**
 * プロジェクト一覧の列構成変更E2Eテスト
 */
test.describe('プロジェクト一覧の列構成変更 (Task 25.2)', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  let prisma: PrismaClientType;
  let testProjectWithConstructionId: string;
  let testProjectWithoutConstructionId: string;
  let testSalesPersonId: string;
  let testConstructionPersonId: string;
  let testTradingPartnerId: string;

  /**
   * テストデータのクリーンアップ（プレフィックス付きのデータのみ削除）
   */
  async function cleanupTestData(): Promise<void> {
    // テスト用プロジェクトを削除
    await prisma.projectStatusHistory.deleteMany({
      where: {
        project: {
          name: { startsWith: TEST_PREFIX },
        },
      },
    });
    await prisma.project.deleteMany({
      where: { name: { startsWith: TEST_PREFIX } },
    });
    // テスト用取引先を削除
    await prisma.tradingPartnerTypeMapping.deleteMany({
      where: {
        tradingPartner: {
          name: { startsWith: TEST_PREFIX },
        },
      },
    });
    await prisma.tradingPartner.deleteMany({
      where: { name: { startsWith: TEST_PREFIX } },
    });
  }

  /**
   * テストデータのセットアップ
   * - 工事担当者が設定されているプロジェクト
   * - 工事担当者が未設定のプロジェクト
   */
  test.beforeAll(async () => {
    prisma = getPrismaClient();

    try {
      // 既存のテストデータをクリーンアップ
      await cleanupTestData();

      // userロールを取得
      const userRole = await prisma.role.findUnique({
        where: { name: 'user' },
      });

      if (!userRole) {
        throw new Error('User role not found');
      }

      // テスト用営業担当者ユーザーを取得（既存のuser@example.com）
      const salesPersonEmail = 'user@example.com';
      let salesPerson = await prisma.user.findUnique({
        where: { email: salesPersonEmail },
      });

      if (!salesPerson) {
        salesPerson = await prisma.user.create({
          data: {
            email: salesPersonEmail,
            passwordHash: await hashPassword('Password123!'),
            displayName: 'テスト営業担当',
            userRoles: {
              create: {
                roleId: userRole.id,
              },
            },
          },
        });
      }
      testSalesPersonId = salesPerson.id;

      // テスト用工事担当者ユーザーを取得（既存のmanager@example.com）
      const constructionPersonEmail = 'manager@example.com';
      let constructionPerson = await prisma.user.findUnique({
        where: { email: constructionPersonEmail },
      });

      if (!constructionPerson) {
        constructionPerson = await prisma.user.create({
          data: {
            email: constructionPersonEmail,
            passwordHash: await hashPassword('Password123!'),
            displayName: 'テスト工事担当',
            userRoles: {
              create: {
                roleId: userRole.id,
              },
            },
          },
        });
      }
      testConstructionPersonId = constructionPerson.id;

      // テスト用取引先を作成
      const tradingPartner = await prisma.tradingPartner.create({
        data: {
          name: `${TEST_PREFIX}テスト取引先`,
          nameKana: 'テストトリヒキサキ',
          address: '東京都テスト区',
          types: {
            create: {
              type: 'CUSTOMER',
            },
          },
        },
      });
      testTradingPartnerId = tradingPartner.id;

      // プロジェクト1: 工事担当者設定済み
      const projectWithConstruction = await prisma.project.create({
        data: {
          name: PROJECT_WITH_CONSTRUCTION,
          tradingPartnerId: testTradingPartnerId,
          salesPersonId: testSalesPersonId,
          constructionPersonId: testConstructionPersonId,
          status: 'PREPARING',
          createdById: testSalesPersonId,
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'PREPARING',
              transitionType: 'initial',
              changedById: testSalesPersonId,
            },
          },
        },
      });
      testProjectWithConstructionId = projectWithConstruction.id;

      // プロジェクト2: 工事担当者未設定
      const projectWithoutConstruction = await prisma.project.create({
        data: {
          name: PROJECT_WITHOUT_CONSTRUCTION,
          tradingPartnerId: testTradingPartnerId,
          salesPersonId: testSalesPersonId,
          constructionPersonId: null, // 工事担当者未設定
          status: 'PREPARING',
          createdById: testSalesPersonId,
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'PREPARING',
              transitionType: 'initial',
              changedById: testSalesPersonId,
            },
          },
        },
      });
      testProjectWithoutConstructionId = projectWithoutConstruction.id;

      console.log('Test data setup completed successfully');
      console.log(`Project with construction person ID: ${testProjectWithConstructionId}`);
      console.log(`Project without construction person ID: ${testProjectWithoutConstructionId}`);
    } catch (error) {
      console.error('Failed to setup test data:', error);
      throw error;
    }
  });

  /**
   * テストデータのクリーンアップ
   */
  test.afterAll(async () => {
    await cleanupTestData();
  });

  test.beforeEach(async ({ context, page }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // ビューポートサイズをデスクトップサイズにリセット（他のテストファイルでの変更を引き継がないため）
    await page.setViewportSize({ width: 1280, height: 720 });

    // ブラウザのストレージを完全にクリア（前のテストの状態を引き継がないため）
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  /**
   * ID列の非表示テスト
   *
   * REQ-2.2: 一覧画面でID列が表示されないことを確認
   * @requirement project-management/REQ-2.2
   */
  test('一覧画面でID列が表示されないことを確認 (project-management/REQ-2.2)', async ({ page }) => {
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

    // テーブルが表示されていることを確認
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: getTimeout(10000) });

    // テーブルヘッダー行を取得
    const headerRow = page.locator('thead tr');

    // ID列のソートボタンが存在しないことを確認
    const idSortButton = page.getByRole('button', { name: /^IDでソート$/i });
    await expect(idSortButton).not.toBeVisible();

    // ヘッダー内に「ID」というテキストが列ラベルとして存在しないことを確認
    // 注意: 「プロジェクトID」などの部分一致は避ける
    const headerCells = headerRow.locator('th');
    const headerTexts: string[] = [];
    const count = await headerCells.count();
    for (let i = 0; i < count; i++) {
      const text = await headerCells.nth(i).textContent();
      if (text) {
        headerTexts.push(text.trim());
      }
    }

    // ヘッダーに「ID」のみの列が存在しないことを確認
    expect(headerTexts).not.toContain('ID');
  });

  /**
   * 営業担当者列の表示テスト
   *
   * REQ-2.2: 一覧画面で営業担当者列が表示されることを確認
   * @requirement project-management/REQ-2.2
   */
  test('一覧画面で営業担当者列が表示されることを確認 (project-management/REQ-2.2)', async ({
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

    // テーブルが表示されていることを確認
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: getTimeout(10000) });

    // 営業担当者列のソートボタンが存在することを確認
    const salesPersonSortButton = page.getByRole('button', { name: /営業担当者でソート/i });
    await expect(salesPersonSortButton).toBeVisible({ timeout: getTimeout(10000) });
  });

  /**
   * 工事担当者列の表示テスト
   *
   * REQ-2.2: 一覧画面で工事担当者列が表示されることを確認
   * @requirement project-management/REQ-2.2
   */
  test('一覧画面で工事担当者列が表示されることを確認 (project-management/REQ-2.2)', async ({
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

    // テーブルが表示されていることを確認
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: getTimeout(10000) });

    // 工事担当者列のソートボタンが存在することを確認
    const constructionPersonSortButton = page.getByRole('button', {
      name: /工事担当者でソート/i,
    });
    await expect(constructionPersonSortButton).toBeVisible({ timeout: getTimeout(10000) });
  });

  /**
   * 担当者表示名の正しい表示テスト
   *
   * REQ-2.2: 営業担当者・工事担当者の表示名が正しく表示されることを確認
   * @requirement project-management/REQ-2.2
   */
  test('営業担当者・工事担当者の表示名が正しく表示されることを確認 (project-management/REQ-2.2)', async ({
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

    // テーブルが表示されていることを確認
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: getTimeout(10000) });

    // テスト用プロジェクト（工事担当者設定済み）の行を検索
    const testProjectRow = page.locator('tbody tr', { hasText: PROJECT_WITH_CONSTRUCTION });
    await expect(testProjectRow).toBeVisible({ timeout: getTimeout(10000) });

    // テスト用プロジェクト行を確認
    const cells = testProjectRow.locator('td');

    // 列の数を確認（7列: プロジェクト名、顧客名、営業担当者、工事担当者、ステータス、作成日、更新日）
    const cellCount = await cells.count();
    expect(cellCount).toBe(7);

    // 営業担当者セル（3列目）の内容を確認
    const salesPersonCell = cells.nth(2);
    const salesPersonText = await salesPersonCell.textContent();
    expect(salesPersonText).toBeTruthy();
    // 空でないことを確認（実際の名前が表示される）
    expect(salesPersonText!.trim().length).toBeGreaterThan(0);
    // 「-」ではなく実際の担当者名が表示されていることを確認
    expect(salesPersonText!.trim()).not.toBe('-');

    // 工事担当者セル（4列目）の内容を確認
    const constructionPersonCell = cells.nth(3);
    const constructionPersonText = await constructionPersonCell.textContent();
    expect(constructionPersonText).toBeTruthy();
    // 空でないことを確認（実際の名前が表示される）
    expect(constructionPersonText!.trim().length).toBeGreaterThan(0);
    // 「-」ではなく実際の担当者名が表示されていることを確認
    expect(constructionPersonText!.trim()).not.toBe('-');
  });

  /**
   * 工事担当者未設定時の「-」表示テスト
   *
   * REQ-2.2: 工事担当者未設定時に「-」が表示されることを確認
   * @requirement project-management/REQ-2.2
   */
  test('工事担当者未設定時に「-」が表示されることを確認 (project-management/REQ-2.2)', async ({
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

    // テーブルが表示されていることを確認
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: getTimeout(10000) });

    // テスト用プロジェクト（工事担当者未設定）の行を検索
    const testProjectRow = page.locator('tbody tr', { hasText: PROJECT_WITHOUT_CONSTRUCTION });
    await expect(testProjectRow).toBeVisible({ timeout: getTimeout(10000) });

    // 工事担当者セル（4列目、0-indexedで3）を確認
    const cells = testProjectRow.locator('td');
    const constructionPersonCell = cells.nth(3);
    const constructionPersonText = await constructionPersonCell.textContent();

    // 工事担当者未設定時は「-」が表示されることを確認
    expect(constructionPersonText).toBeTruthy();
    expect(constructionPersonText!.trim()).toBe('-');
  });

  /**
   * 列順序の確認テスト
   *
   * REQ-2.2: 列順序が「プロジェクト名、顧客名、営業担当者、工事担当者、ステータス、作成日、更新日」であることを確認
   * @requirement project-management/REQ-2.2
   */
  test('列順序が正しいことを確認 (project-management/REQ-2.2)', async ({ page }) => {
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

    // テーブルが表示されていることを確認
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: getTimeout(10000) });

    // テーブルヘッダーのボタン/テキストを順序通りに確認
    const expectedOrder = [
      /プロジェクト名/,
      /顧客名/,
      /営業担当者/,
      /工事担当者/,
      /ステータス/,
      /作成日/,
      /更新日/,
    ];

    // ヘッダー行のボタン（ソート可能列）を取得
    const headerRow = page.locator('thead tr');
    const headerButtons = headerRow.locator('button');
    const headerCount = await headerButtons.count();

    // 7列全てがソート可能であることを確認
    expect(headerCount).toBe(7);

    // 各列の順序を確認
    for (let i = 0; i < expectedOrder.length; i++) {
      const button = headerButtons.nth(i);
      const buttonText = await button.textContent();
      const pattern = expectedOrder[i];
      if (pattern) {
        expect(buttonText).toMatch(pattern);
      }
    }
  });

  /**
   * モバイル表示でのカード内担当者表示テスト
   *
   * REQ-2.2, REQ-15.3: モバイル表示（カード形式）でも営業担当者・工事担当者が表示されることを確認
   * @requirement project-management/REQ-2.2
   * @requirement project-management/REQ-15.3
   */
  test('モバイル表示で営業担当者・工事担当者が表示されることを確認 (project-management/REQ-2.2)', async ({
    page,
  }) => {
    // 先にログインしてから、モバイルサイズに変更
    // （viewport変更前にログインすることで、認証状態を確立）
    await loginAsUser(page, 'REGULAR_USER');

    // モバイルサイズを設定（カード表示）
    await page.setViewportSize({ width: 375, height: 667 });

    // viewport変更後にページを再読み込みして、レスポンシブレイアウトを適用
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

    // プロジェクト一覧画面が表示されることを確認
    await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // レスポンシブレイアウトが適用されるまで待機
    await page.waitForTimeout(1000);

    // カードリストが表示されていることを確認
    // （モバイル表示ではカード形式が必須）
    const cardList = page.getByTestId('project-card-list');
    await expect(cardList).toBeVisible({ timeout: getTimeout(10000) });

    // テスト用プロジェクト（工事担当者設定済み）のカードを検索
    // project-card-{id} 形式のtestIdを持つ要素のみを対象にする（project-card-list、project-card-header-{id}を除外）
    const testCard = page.locator('[data-testid][role="button"]', {
      hasText: PROJECT_WITH_CONSTRUCTION,
    });
    await expect(testCard).toBeVisible({ timeout: getTimeout(10000) });

    // カード内に営業担当者情報が表示されていることを確認
    const salesPersonElement = testCard.locator('[data-testid^="sales-person-"]').first();
    await expect(salesPersonElement).toBeVisible({ timeout: getTimeout(10000) });

    // カード内に工事担当者情報が表示されていることを確認
    const constructionPersonElement = testCard
      .locator('[data-testid^="construction-person-"]')
      .first();
    await expect(constructionPersonElement).toBeVisible({ timeout: getTimeout(10000) });
  });
});
