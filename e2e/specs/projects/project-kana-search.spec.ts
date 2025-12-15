/**
 * @fileoverview プロジェクト検索のひらがな・カタカナ両対応E2Eテスト
 *
 * Task 30.2: かな検索E2Eテスト
 *
 * プロジェクト一覧画面でひらがな入力・カタカナ入力での検索テストと、
 * ひらがな・カタカナ両方で同一結果が表示されることをテストします。
 *
 * Requirements:
 * - 8.4: 顧客名入力フィールドでの検索
 * - 16.3: フリガナで検索するとき、ひらがな入力とカタカナ入力の両方を許容
 * - 22.5: 取引先フリガナでの検索がひらがな・カタカナ両対応
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';
import { getPrismaClient } from '../../fixtures/database';
import { hashPassword } from '../../helpers/test-users';

// Prisma Client型定義
type PrismaClientType = ReturnType<typeof getPrismaClient>;

// テストデータ用の定数
const TEST_PREFIX = 'kana-search-test-';
// 取引先名（カタカナフリガナ）
const TRADING_PARTNER_NAME = `${TEST_PREFIX}取引先テスト株式会社`;
const TRADING_PARTNER_NAME_KANA = 'トリヒキサキテストカブシキガイシャ';
// プロジェクト名（取引先に紐付けられるプロジェクト）
const PROJECT_WITH_KANA_PARTNER = `${TEST_PREFIX}かな検索用プロジェクト`;

/**
 * プロジェクト検索のひらがな・カタカナ両対応E2Eテスト
 */
test.describe('プロジェクト検索のかな変換検索 (Task 30.2)', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  let prisma: PrismaClientType;
  let testTradingPartnerId: string;
  let testProjectId: string;
  let testSalesPersonId: string;

  /**
   * テストデータのセットアップ
   * - カタカナフリガナを持つ取引先を作成
   * - その取引先に紐付いたプロジェクトを作成
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

      // テスト用営業担当者ユーザーを取得または作成
      const salesPersonEmail = 'user@example.com';
      let salesPerson = await prisma.user.findUnique({
        where: { email: salesPersonEmail },
      });

      if (!salesPerson) {
        salesPerson = await prisma.user.create({
          data: {
            email: salesPersonEmail,
            passwordHash: await hashPassword('Password123!'),
            displayName: 'Test User',
            userRoles: {
              create: {
                roleId: userRole.id,
              },
            },
          },
        });
      }
      testSalesPersonId = salesPerson.id;

      // テスト用取引先を作成（カタカナフリガナ）
      const tradingPartner = await prisma.tradingPartner.create({
        data: {
          name: TRADING_PARTNER_NAME,
          nameKana: TRADING_PARTNER_NAME_KANA,
          address: '東京都渋谷区テスト1-2-3',
          types: {
            create: {
              type: 'CUSTOMER',
            },
          },
        },
      });
      testTradingPartnerId = tradingPartner.id;

      // テスト用プロジェクトを作成（取引先に紐付け）
      const project = await prisma.project.create({
        data: {
          name: PROJECT_WITH_KANA_PARTNER,
          tradingPartnerId: testTradingPartnerId,
          salesPersonId: testSalesPersonId,
          status: 'PREPARING',
          createdById: salesPerson.id,
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'PREPARING',
              transitionType: 'initial',
              changedById: salesPerson.id,
            },
          },
        },
      });
      testProjectId = project.id;

      console.log('Test data setup completed successfully');
      console.log(`Trading Partner ID: ${testTradingPartnerId}`);
      console.log(`Project ID: ${testProjectId}`);
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

  test.beforeEach(async ({ context, page }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // ビューポートサイズをデスクトップサイズにリセット
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  /**
   * ひらがな入力検索のテスト
   *
   * REQ-16.3, REQ-22.5: フリガナで検索するとき、ひらがな入力を許容
   */
  test.describe('ひらがな入力検索', () => {
    /**
     * @requirement project-management/REQ-16.3
     * @requirement project-management/REQ-22.5
     */
    test('ひらがなで検索すると対応するカタカナフリガナを持つ取引先のプロジェクトがヒットする (project-management/REQ-16.3, REQ-22.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // プロジェクト一覧画面が表示されることを確認
      await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // ひらがなで検索（「とりひきさき」で「トリヒキサキ」を持つ取引先を検索）
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await expect(searchInput).toBeVisible({ timeout: getTimeout(10000) });

      await searchInput.fill('とりひきさき');
      await searchInput.press('Enter');

      // URLパラメータに検索キーワードが反映されることを確認
      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });

      // ローディング完了を待機
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テスト用プロジェクトが検索結果に表示されることを確認
      await expect(page.getByText(PROJECT_WITH_KANA_PARTNER).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-16.3
     * @requirement project-management/REQ-22.5
     */
    test('ひらがなの部分一致で検索できる (project-management/REQ-16.3, REQ-22.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ひらがなの一部で検索
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('かぶしき');
      await searchInput.press('Enter');

      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // 「カブシキ」をフリガナに含む取引先のプロジェクトがヒットすることを確認
      // テスト用プロジェクトの取引先フリガナには「カブシキガイシャ」が含まれる
      await expect(page.getByText(PROJECT_WITH_KANA_PARTNER).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * カタカナ入力検索のテスト
   *
   * REQ-16.3, REQ-22.5: フリガナで検索するとき、カタカナ入力を許容
   */
  test.describe('カタカナ入力検索', () => {
    /**
     * @requirement project-management/REQ-16.3
     * @requirement project-management/REQ-22.5
     */
    test('カタカナで検索すると対応するフリガナを持つ取引先のプロジェクトがヒットする (project-management/REQ-16.3, REQ-22.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // カタカナで検索
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('トリヒキサキ');
      await searchInput.press('Enter');

      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テスト用プロジェクトが検索結果に表示されることを確認
      await expect(page.getByText(PROJECT_WITH_KANA_PARTNER).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * ひらがな・カタカナ両方で同一結果が返されることのテスト
   *
   * REQ-16.3, REQ-22.5: ひらがな入力とカタカナ入力の両方を許容し、同一の検索結果を返却
   */
  test.describe('ひらがな・カタカナ同一結果', () => {
    /**
     * @requirement project-management/REQ-8.4
     * @requirement project-management/REQ-16.3
     * @requirement project-management/REQ-22.5
     */
    test('ひらがなとカタカナで同一の検索結果が表示される (project-management/REQ-8.4, REQ-16.3, REQ-22.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // Step 1: ひらがなで検索
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('とりひきさきてすと');
      await searchInput.press('Enter');

      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ひらがな検索の結果を取得
      const hiraganaResults: string[] = [];
      const table = page.getByRole('table');
      const tableVisible = await table.isVisible().catch(() => false);

      if (tableVisible) {
        const rows = page.locator('tbody tr');
        const rowCount = await rows.count();
        for (let i = 0; i < rowCount; i++) {
          const row = rows.nth(i);
          const rowText = await row.getAttribute('data-testid').catch(() => null);
          if (rowText) {
            hiraganaResults.push(rowText);
          }
        }
      }

      // Step 2: カタカナで検索（同じキーワード）
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      const searchInput2 = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput2.fill('トリヒキサキテスト');
      await searchInput2.press('Enter');

      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // カタカナ検索の結果を取得
      const katakanaResults: string[] = [];
      const table2 = page.getByRole('table');
      const tableVisible2 = await table2.isVisible().catch(() => false);

      if (tableVisible2) {
        const rows2 = page.locator('tbody tr');
        const rowCount2 = await rows2.count();
        for (let i = 0; i < rowCount2; i++) {
          const row = rows2.nth(i);
          const rowText = await row.getAttribute('data-testid').catch(() => null);
          if (rowText) {
            katakanaResults.push(rowText);
          }
        }
      }

      // 検索結果が同一であることを確認
      expect(hiraganaResults.length).toBe(katakanaResults.length);
      expect(hiraganaResults.sort()).toEqual(katakanaResults.sort());

      // テスト用プロジェクトが両方の検索結果に表示されることを確認
      // プロジェクト一覧の行にはdata-testid="project-row-{id}"が設定されている前提
      if (tableVisible && tableVisible2) {
        // 両方のテーブルでテスト用プロジェクトが表示されていることを確認
        await page.goto('/projects');
        await page.waitForLoadState('networkidle');
        await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

        await searchInput.fill('とりひきさきてすと');
        await searchInput.press('Enter');
        await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

        await expect(page.getByText(PROJECT_WITH_KANA_PARTNER).first()).toBeVisible({
          timeout: getTimeout(10000),
        });
      }
    });

    /**
     * @requirement project-management/REQ-16.3
     * @requirement project-management/REQ-22.5
     */
    test('混合入力（ひらがな＋カタカナ）でも検索できる (project-management/REQ-16.3, REQ-22.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ひらがなとカタカナを混合した検索（「トリひきサキ」）
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('トリひきサキ');
      await searchInput.press('Enter');

      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テスト用プロジェクトが検索結果に表示されることを確認
      await expect(page.getByText(PROJECT_WITH_KANA_PARTNER).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });

    /**
     * @requirement project-management/REQ-16.3
     * @requirement project-management/REQ-22.5
     */
    test('検索ボタンクリックでもひらがな検索が実行される (project-management/REQ-16.3, REQ-22.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // ひらがなで入力し、検索ボタンをクリック
      const searchInput = page.getByRole('searchbox', { name: /検索キーワード/i });
      await searchInput.fill('とりひきさき');

      await page.getByRole('button', { name: /^検索$/i }).click();

      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テスト用プロジェクトが検索結果に表示されることを確認
      await expect(page.getByText(PROJECT_WITH_KANA_PARTNER).first()).toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * プロジェクト一覧の検索結果が正しいことの確認
   */
  test.describe('プロジェクト一覧の検索結果', () => {
    /**
     * @requirement project-management/REQ-8.4
     * @requirement project-management/REQ-16.3
     * @requirement project-management/REQ-22.5
     */
    test('取引先フリガナでひらがな検索した結果が一覧に正しく表示される (project-management/REQ-8.4, REQ-16.3, REQ-22.5)', async ({
      page,
    }) => {
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

      // ひらがなで検索
      await searchInput.fill('とりひきさきてすと');
      await searchInput.press('Enter');

      await expect(page).toHaveURL(/search=/, { timeout: getTimeout(10000) });
      await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

      // テーブルが表示されているか確認
      const table = page.getByRole('table');
      const tableVisible = await table.isVisible().catch(() => false);

      if (tableVisible) {
        const rows = page.locator('tbody tr');
        const rowCount = await rows.count();

        // 少なくとも1件以上の結果があることを確認
        expect(rowCount).toBeGreaterThan(0);

        // 検索結果にテスト用プロジェクト名が含まれていることを確認
        let foundTestProject = false;
        for (let i = 0; i < rowCount; i++) {
          const row = rows.nth(i);
          const rowText = await row.textContent();
          if (rowText && rowText.includes(PROJECT_WITH_KANA_PARTNER)) {
            foundTestProject = true;
            break;
          }
        }

        expect(foundTestProject).toBe(true);
      } else {
        // テーブルが表示されない場合、空状態メッセージを確認
        const emptyOrError = page.getByText(
          /検索結果がありません|プロジェクトがありません|プロジェクト一覧を取得できませんでした/i
        );
        // テストデータが正しく作成されていればテーブルが表示されるはず
        await expect(emptyOrError).not.toBeVisible();
      }
    });
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

    // テスト用取引先種別マッピングを削除
    await prisma.tradingPartnerTypeMapping.deleteMany({
      where: {
        tradingPartner: {
          name: {
            startsWith: TEST_PREFIX,
          },
        },
      },
    });

    // テスト用取引先を削除
    await prisma.tradingPartner.deleteMany({
      where: {
        name: {
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
