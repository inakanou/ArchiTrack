/**
 * @fileoverview 見積依頼画面パンくずナビゲーション E2E テスト（REQ-29）
 *
 * Requirements coverage (estimate-request):
 * - REQ-29.1: 見積依頼一覧画面のパンくず階層構造
 * - REQ-29.2: 一覧画面「ダッシュボード」リンク
 * - REQ-29.3: 一覧画面「プロジェクト一覧」リンク
 * - REQ-29.4: 一覧画面「プロジェクト」リンクとプロジェクト名表示
 * - REQ-29.5: 一覧画面「見積依頼一覧」を現在ページとしてリンクなし表示
 * - REQ-29.6: 新規作成画面のパンくず階層構造
 * - REQ-29.7: 新規作成画面「ダッシュボード」リンク
 * - REQ-29.8: 新規作成画面「プロジェクト一覧」リンク
 * - REQ-29.9: 新規作成画面「プロジェクト」リンクとプロジェクト名表示
 * - REQ-29.10: 新規作成画面「見積依頼一覧」リンク
 * - REQ-29.11: 新規作成画面「新規作成」を現在ページとしてリンクなし表示
 * - REQ-29.12: 新規作成画面から「← 一覧に戻る」リンクを削除
 * - REQ-29.13: 詳細画面のパンくず階層構造
 * - REQ-29.14: 詳細画面「ダッシュボード」リンク
 * - REQ-29.15: 詳細画面「プロジェクト一覧」リンク
 * - REQ-29.16: 詳細画面「プロジェクト」リンクとプロジェクト名表示
 * - REQ-29.17: 詳細画面「見積依頼一覧」リンク
 * - REQ-29.18: 詳細画面「見積依頼」を現在ページとしてリンクなし表示し名称表示
 * - REQ-29.19: 詳細画面から「← 見積依頼一覧に戻る」リンクを削除
 *
 * @module e2e/specs/estimate-requests/breadcrumb-navigation-e2e.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { TEST_USERS } from '../../helpers/test-users';

/**
 * パンくずナビゲーション要素を取得するヘルパー
 */
function breadcrumbNav(page: Page) {
  return page.getByRole('navigation', { name: 'パンくずナビゲーション' });
}

test.describe('見積依頼画面パンくずナビゲーション（REQ-29）', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let projectName: string = '';
  let createdTradingPartnerId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let estimateRequestName: string = '';
  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test.describe('テストデータ準備', () => {
    test('API 経由でプロジェクト・取引先・内訳書・見積依頼を作成する', async ({ request }) => {
      const baseUrl = API_BASE_URL;

      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: {
          email: TEST_USERS.REGULAR_USER.email,
          password: TEST_USERS.REGULAR_USER.password,
        },
      });
      expect(loginResponse.ok()).toBe(true);
      const loginBody = await loginResponse.json();
      accessToken = loginBody.accessToken;
      expect(accessToken).toBeTruthy();

      // 営業担当者 ID を取得（プロジェクト作成スキーマで salesPersonId が必須）
      const usersResponse = await request.get(`${baseUrl}/api/users/assignable`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(usersResponse.ok()).toBe(true);
      const usersBody = await usersResponse.json();
      const salesPersonId = usersBody[0]?.id;
      expect(salesPersonId).toBeTruthy();

      // プロジェクト作成
      projectName = `E2Eパンくず_${Date.now()}`;
      const projectResponse = await request.post(`${baseUrl}/api/projects`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: projectName,
          siteAddress: '東京都千代田区パンくず町1-2-3',
          salesPersonId,
        },
      });
      expect(projectResponse.status()).toBe(201);
      const projectBody = await projectResponse.json();
      createdProjectId = projectBody.id;
      expect(createdProjectId).toBeTruthy();

      // 取引先（協力業者）作成
      const partnerResponse = await request.post(`${baseUrl}/api/trading-partners`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: `E2Eパンくず業者_${Date.now()}`,
          nameKana: 'パンクズギョウシャ',
          address: '東京都千代田区パンくず町2-3-4',
          types: ['SUBCONTRACTOR'],
          email: `breadcrumb-${Date.now()}@example.com`,
        },
      });
      expect(partnerResponse.status()).toBe(201);
      const partnerBody = await partnerResponse.json();
      createdTradingPartnerId = partnerBody.id;

      // 数量表 → グループ → 項目作成
      const quantityTableResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/quantity-tables`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `パンくず数量表_${Date.now()}` },
        }
      );
      expect(quantityTableResponse.status()).toBe(201);
      const quantityTableBody = await quantityTableResponse.json();
      const quantityTableId = quantityTableBody.id;

      const groupResponse = await request.post(
        `${baseUrl}/api/quantity-tables/${quantityTableId}/groups`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: 'パンくずグループ', displayOrder: 0 },
        }
      );
      expect(groupResponse.status()).toBe(201);
      const groupBody = await groupResponse.json();

      const itemResponse = await request.post(
        `${baseUrl}/api/quantity-groups/${groupBody.id}/items`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: 'パンくず項目',
            workType: '工種',
            specification: '規格',
            unit: '式',
            quantity: 1.0,
            displayOrder: 0,
          },
        }
      );
      expect(itemResponse.status()).toBe(201);

      // 内訳書作成
      const itemizedStatementResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/itemized-statements`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `パンくず内訳書_${Date.now()}`, quantityTableId },
        }
      );
      expect(itemizedStatementResponse.status()).toBe(201);
      const itemizedStatementBody = await itemizedStatementResponse.json();
      createdItemizedStatementId = itemizedStatementBody.id;

      // 見積依頼作成
      estimateRequestName = `パンくず見積依頼_${Date.now()}`;
      const estimateRequestResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimate-requests`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: estimateRequestName,
            tradingPartnerId: createdTradingPartnerId,
            itemizedStatementId: createdItemizedStatementId,
          },
        }
      );
      expect(estimateRequestResponse.status()).toBe(201);
      const estimateRequestBody = await estimateRequestResponse.json();
      createdEstimateRequestId = estimateRequestBody.id;
      expect(createdEstimateRequestId).toBeTruthy();
    });
  });

  // ==========================================================================
  // 見積依頼一覧画面: REQ-29.1 ~ REQ-29.5
  // ==========================================================================

  test.describe('見積依頼一覧画面のパンくず', () => {
    /**
     * @requirement estimate-request/REQ-29.1
     * @requirement estimate-request/REQ-29.2
     * @requirement estimate-request/REQ-29.3
     * @requirement estimate-request/REQ-29.4
     * @requirement estimate-request/REQ-29.5
     */
    test('一覧画面のパンくずが正しい階層・リンク・現在ページ表示で構成される (REQ-29.1〜29.5)', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${createdProjectId}/estimate-requests`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('estimate-request-list-page')).toBeVisible({
        timeout: getTimeout(15000),
      });

      const nav = breadcrumbNav(page);
      await expect(nav).toBeVisible();

      // REQ-29.1: 階層構造のラベルがすべて表示される
      await expect(nav.getByText('ダッシュボード')).toBeVisible();
      await expect(nav.getByText('プロジェクト一覧')).toBeVisible();
      await expect(nav.getByText(projectName)).toBeVisible();
      await expect(nav.getByText('見積依頼一覧')).toBeVisible();

      // REQ-29.2: 「ダッシュボード」がリンクで href="/"
      const dashboardLink = nav.getByRole('link', { name: 'ダッシュボード' });
      await expect(dashboardLink).toHaveAttribute('href', '/');

      // REQ-29.3: 「プロジェクト一覧」がリンクで href="/projects"
      const projectsLink = nav.getByRole('link', { name: 'プロジェクト一覧' });
      await expect(projectsLink).toHaveAttribute('href', '/projects');

      // REQ-29.4: 「プロジェクト」がリンクで該当プロジェクト詳細を指し、プロジェクト名表示
      const projectLink = nav.getByRole('link', { name: projectName });
      await expect(projectLink).toHaveAttribute('href', `/projects/${createdProjectId}`);

      // REQ-29.5: 「見積依頼一覧」は現在ページ＝リンクなし、aria-current="page"
      const currentItem = nav.locator('[aria-current="page"]');
      await expect(currentItem).toHaveText('見積依頼一覧');
      // 「見積依頼一覧」テキストを持つリンクが存在しないこと
      await expect(nav.getByRole('link', { name: '見積依頼一覧' })).toHaveCount(0);
    });
  });

  // ==========================================================================
  // 見積依頼新規作成画面: REQ-29.6 ~ REQ-29.12
  // ==========================================================================

  test.describe('見積依頼新規作成画面のパンくず', () => {
    /**
     * @requirement estimate-request/REQ-29.6
     * @requirement estimate-request/REQ-29.7
     * @requirement estimate-request/REQ-29.8
     * @requirement estimate-request/REQ-29.9
     * @requirement estimate-request/REQ-29.10
     * @requirement estimate-request/REQ-29.11
     * @requirement estimate-request/REQ-29.12
     */
    test('新規作成画面のパンくずが正しい階層・リンク・現在ページ表示で構成され、戻るリンクが削除されている (REQ-29.6〜29.12)', async ({
      page,
    }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${createdProjectId}/estimate-requests/new`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('estimate-request-create-page')).toBeVisible({
        timeout: getTimeout(15000),
      });

      const nav = breadcrumbNav(page);
      await expect(nav).toBeVisible();

      // REQ-29.6: 階層ラベル
      await expect(nav.getByText('ダッシュボード')).toBeVisible();
      await expect(nav.getByText('プロジェクト一覧')).toBeVisible();
      await expect(nav.getByText(projectName)).toBeVisible();
      await expect(nav.getByText('見積依頼一覧')).toBeVisible();
      await expect(nav.getByText('新規作成')).toBeVisible();

      // REQ-29.7: ダッシュボードリンク
      await expect(nav.getByRole('link', { name: 'ダッシュボード' })).toHaveAttribute('href', '/');

      // REQ-29.8: プロジェクト一覧リンク
      await expect(nav.getByRole('link', { name: 'プロジェクト一覧' })).toHaveAttribute(
        'href',
        '/projects'
      );

      // REQ-29.9: プロジェクトリンク（プロジェクト詳細へ）
      await expect(nav.getByRole('link', { name: projectName })).toHaveAttribute(
        'href',
        `/projects/${createdProjectId}`
      );

      // REQ-29.10: 見積依頼一覧リンク
      await expect(nav.getByRole('link', { name: '見積依頼一覧' })).toHaveAttribute(
        'href',
        `/projects/${createdProjectId}/estimate-requests`
      );

      // REQ-29.11: 「新規作成」が現在ページ（aria-current="page"）でリンクなし
      const currentItem = nav.locator('[aria-current="page"]');
      await expect(currentItem).toHaveText('新規作成');
      await expect(nav.getByRole('link', { name: '新規作成' })).toHaveCount(0);

      // REQ-29.12: 「← 一覧に戻る」テキストのリンクが画面上に存在しない
      // パンくず外の戻るリンクの全削除を検証する
      await expect(page.getByRole('link', { name: /←.*一覧に戻る/ })).toHaveCount(0);
      await expect(page.getByRole('link', { name: /見積依頼一覧に戻る/ })).toHaveCount(0);
    });
  });

  // ==========================================================================
  // 見積依頼詳細画面: REQ-29.13 ~ REQ-29.19
  // ==========================================================================

  test.describe('見積依頼詳細画面のパンくず', () => {
    /**
     * @requirement estimate-request/REQ-29.13
     * @requirement estimate-request/REQ-29.14
     * @requirement estimate-request/REQ-29.15
     * @requirement estimate-request/REQ-29.16
     * @requirement estimate-request/REQ-29.17
     * @requirement estimate-request/REQ-29.18
     * @requirement estimate-request/REQ-29.19
     */
    test('詳細画面のパンくずが正しい階層・リンク・現在ページ表示で構成され、戻るリンクが削除されている (REQ-29.13〜29.19)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
        timeout: getTimeout(15000),
      });

      const nav = breadcrumbNav(page);
      await expect(nav).toBeVisible();

      // REQ-29.13: 階層ラベル
      await expect(nav.getByText('ダッシュボード')).toBeVisible();
      await expect(nav.getByText('プロジェクト一覧')).toBeVisible();
      await expect(nav.getByText(projectName)).toBeVisible();
      await expect(nav.getByText('見積依頼一覧')).toBeVisible();
      // REQ-29.18: 見積依頼名が表示される
      await expect(nav.getByText(estimateRequestName)).toBeVisible();

      // REQ-29.14: ダッシュボードリンク
      await expect(nav.getByRole('link', { name: 'ダッシュボード' })).toHaveAttribute('href', '/');

      // REQ-29.15: プロジェクト一覧リンク
      await expect(nav.getByRole('link', { name: 'プロジェクト一覧' })).toHaveAttribute(
        'href',
        '/projects'
      );

      // REQ-29.16: プロジェクトリンク
      await expect(nav.getByRole('link', { name: projectName })).toHaveAttribute(
        'href',
        `/projects/${createdProjectId}`
      );

      // REQ-29.17: 見積依頼一覧リンク
      await expect(nav.getByRole('link', { name: '見積依頼一覧' })).toHaveAttribute(
        'href',
        `/projects/${createdProjectId}/estimate-requests`
      );

      // REQ-29.18: 見積依頼名が現在ページとしてリンクなし表示
      const currentItem = nav.locator('[aria-current="page"]');
      await expect(currentItem).toHaveText(estimateRequestName);
      await expect(nav.getByRole('link', { name: estimateRequestName })).toHaveCount(0);

      // REQ-29.19: 「← 見積依頼一覧に戻る」のリンクが画面に存在しない
      await expect(page.getByRole('link', { name: /見積依頼一覧に戻る/ })).toHaveCount(0);
      await expect(page.getByRole('link', { name: /←.*一覧に戻る/ })).toHaveCount(0);
    });
  });

  // ==========================================================================
  // クリーンアップ
  // ==========================================================================

  test.describe('クリーンアップ', () => {
    test('テストデータの削除', async ({ request }) => {
      const baseUrl = API_BASE_URL;

      if (!accessToken) {
        const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
          data: {
            email: TEST_USERS.REGULAR_USER.email,
            password: TEST_USERS.REGULAR_USER.password,
          },
        });
        const loginBody = await loginResponse.json();
        accessToken = loginBody.accessToken;
      }

      if (createdProjectId) {
        await request.delete(`${baseUrl}/api/projects/${createdProjectId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
      if (createdTradingPartnerId) {
        await request.delete(`${baseUrl}/api/trading-partners/${createdTradingPartnerId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
      createdProjectId = null;
      createdTradingPartnerId = null;
      createdItemizedStatementId = null;
      createdEstimateRequestId = null;
    });
  });
});
