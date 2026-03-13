/**
 * @fileoverview プロジェクト-契約書間ナビゲーションE2Eテスト
 *
 * Task 60.1: プロジェクト詳細画面の契約書セクションから契約書一覧・詳細・新規作成への遷移をテスト
 *
 * Requirements coverage (project-management):
 * - 36.1: プロジェクト詳細画面の見積書セクションの下に契約書セクションを表示する
 * - 36.2: 契約書セクションにセクションタイトル「契約書」を表示する
 * - 36.3: 契約書セクションに契約書の総数を表示する
 * - 36.6: ユーザーが契約書カードをクリックした場合、契約書詳細画面へ遷移する
 * - 36.7: 契約書セクションに「すべて見る」リンクを提供する
 * - 36.8: 「すべて見る」リンクで契約書一覧画面へ遷移する
 * - 36.9: 契約書セクションに新規作成ボタンを提供する
 * - 36.10: 新規作成ボタンで契約書作成画面へ遷移する
 *
 * @module e2e/specs/project-contract-navigation.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../helpers/auth-actions';
import { getTimeout } from '../helpers/wait-helpers';
import { API_BASE_URL } from '../config';

test.describe('プロジェクト-契約書間ナビゲーション', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  let projectId: string | null = null;
  let estimateId: string | null = null;
  let contractId: string | null = null;
  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ============================================================================
  // テストデータセットアップ
  // ============================================================================

  test('準備：テスト用プロジェクト・見積書・契約書を作成する', async ({ page }) => {
    // ログインしてアクセストークンを取得
    await loginAsUser(page, 'REGULAR_USER');

    // APIからアクセストークンを取得
    const tokenResponse = await page.evaluate(async (apiUrl: string) => {
      const res = await fetch(`${apiUrl}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return res.json();
    }, API_BASE_URL);
    accessToken = tokenResponse.accessToken;
    expect(accessToken).toBeTruthy();

    // プロジェクトを作成
    const projectName = `E2Eプロジェクト契約ナビ_${Date.now()}`;

    // 担当者一覧を取得
    const usersResponse = await page.evaluate(
      async ({ apiUrl, token }: { apiUrl: string; token: string }) => {
        const res = await fetch(`${apiUrl}/api/users/assignable`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return res.json();
      },
      { apiUrl: API_BASE_URL, token: accessToken }
    );
    const salesPersonId = usersResponse[0]?.id;
    expect(salesPersonId).toBeTruthy();

    // プロジェクト作成API
    const projectResponse = await page.evaluate(
      async ({
        apiUrl,
        token,
        name,
        salesId,
      }: {
        apiUrl: string;
        token: string;
        name: string;
        salesId: string;
      }) => {
        const res = await fetch(`${apiUrl}/api/projects`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            salesPersonId: salesId,
          }),
        });
        return res.json();
      },
      { apiUrl: API_BASE_URL, token: accessToken, name: projectName, salesId: salesPersonId }
    );
    projectId = projectResponse.id;
    expect(projectId).toBeTruthy();

    // 内訳書を作成（見積書作成に必要）
    const isResponse = await page.evaluate(
      async ({ apiUrl, token, pId }: { apiUrl: string; token: string; pId: string }) => {
        const res = await fetch(`${apiUrl}/api/projects/${pId}/itemized-statements`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'テスト内訳書',
            classificationAxis: 'CUSTOM',
          }),
        });
        return res.json();
      },
      { apiUrl: API_BASE_URL, token: accessToken, pId: projectId! }
    );

    // 見積書を作成（契約書作成に必要）
    const estimateResponse = await page.evaluate(
      async ({
        apiUrl,
        token,
        pId,
        isId,
      }: {
        apiUrl: string;
        token: string;
        pId: string;
        isId: string;
      }) => {
        const res = await fetch(`${apiUrl}/api/projects/${pId}/estimates`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'テスト見積書',
            sourceItemizedStatementId: isId,
          }),
        });
        return res.json();
      },
      { apiUrl: API_BASE_URL, token: accessToken, pId: projectId!, isId: isResponse.id }
    );
    estimateId = estimateResponse.id;
    expect(estimateId).toBeTruthy();

    // 契約書を作成
    const contractResponse = await page.evaluate(
      async ({
        apiUrl,
        token,
        pId,
        estId,
      }: {
        apiUrl: string;
        token: string;
        pId: string;
        estId: string;
      }) => {
        const res = await fetch(`${apiUrl}/api/projects/${pId}/contracts`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contractType: 'NEW',
            parentContractId: null,
            estimateId: estId,
            contractDate: '2025-06-01',
            constructionStartDate: '2025-07-01',
            constructionEndDate: '2025-12-31',
            deliveryDate: '2026-01-15',
            taxRate: 10,
            paymentTerms: '月末締め翌月末払い',
            separateConstruction: '別途工事なし',
            otherNotes: 'E2Eテスト契約書',
            supervisorTradingPartnerId: null,
            contractAmount: 5500000,
            constructionPrice: 5000000,
            taxAmount: 500000,
          }),
        });
        return res.json();
      },
      { apiUrl: API_BASE_URL, token: accessToken, pId: projectId!, estId: estimateId! }
    );
    contractId = contractResponse.id;
    expect(contractId).toBeTruthy();
  });

  // ============================================================================
  // 契約書セクション表示テスト
  // ============================================================================

  test('プロジェクト詳細画面に契約書セクションが表示される (36.1, 36.2, 36.3)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // プロジェクト詳細画面に移動
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 契約書セクションが表示される
    const contractSection = page.getByTestId('contract-section');
    await expect(contractSection).toBeVisible({ timeout: getTimeout(10000) });

    // セクションタイトル「契約書」が表示される (36.2)
    await expect(contractSection.getByText('契約書')).toBeVisible();

    // 総数が表示される (36.3)
    await expect(contractSection.getByText(/全\d+件/)).toBeVisible();
  });

  // ============================================================================
  // ナビゲーションテスト
  // ============================================================================

  test('契約書カードクリックで詳細画面に遷移する (36.6)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 契約書カードが表示されるまで待機
    const contractCard = page.getByTestId(`contract-card-${contractId}`);
    await expect(contractCard).toBeVisible({ timeout: getTimeout(10000) });

    // カードをクリックして詳細画面に遷移
    await contractCard.click();
    await page.waitForURL(`**/projects/${projectId}/contracts/${contractId}`, {
      timeout: getTimeout(15000),
    });

    // 詳細画面が表示されることを確認
    expect(page.url()).toContain(`/projects/${projectId}/contracts/${contractId}`);
  });

  test('「すべて見る」リンクで一覧画面に遷移する (36.7, 36.8)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 契約書セクション内の「すべて見る」リンクをクリック
    const contractSection = page.getByTestId('contract-section');
    await expect(contractSection).toBeVisible({ timeout: getTimeout(10000) });

    const viewAllLink = contractSection.getByText('すべて見る');
    await expect(viewAllLink).toBeVisible();
    await viewAllLink.click();

    await page.waitForURL(`**/projects/${projectId}/contracts`, {
      timeout: getTimeout(15000),
    });

    expect(page.url()).toContain(`/projects/${projectId}/contracts`);
  });

  test('新規作成ボタンで作成画面に遷移する (36.9, 36.10)', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

    // 契約書セクション内の新規作成ボタンをクリック
    const contractSection = page.getByTestId('contract-section');
    await expect(contractSection).toBeVisible({ timeout: getTimeout(10000) });

    const createButton = contractSection.getByLabel('契約書を新規作成');
    await expect(createButton).toBeVisible();
    await createButton.click();

    await page.waitForURL(`**/projects/${projectId}/contracts/new`, {
      timeout: getTimeout(15000),
    });

    expect(page.url()).toContain(`/projects/${projectId}/contracts/new`);
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

  test('クリーンアップ：テストデータを削除する', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    if (projectId && accessToken) {
      await page.evaluate(
        async ({ apiUrl, token, pId }: { apiUrl: string; token: string; pId: string }) => {
          await fetch(`${apiUrl}/api/projects/${pId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
        },
        { apiUrl: API_BASE_URL, token: accessToken, pId: projectId }
      );
    }
  });
});
