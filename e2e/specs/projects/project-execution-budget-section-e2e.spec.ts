/**
 * @fileoverview プロジェクト詳細画面の実行予算セクション E2Eテスト
 *
 * Requirements coverage:
 * - REQ-40.8: 実行予算データをロード中の場合、スケルトンローダーを表示する
 * - REQ-40.9: 実行予算セクションに「すべて見る」リンクを表示しない
 * - REQ-40.10: 実行予算セクションのUIを既存の契約書セクションと同様のスタイルで提供する
 *
 * - REQ-40.3: 実行予算が存在する場合、実行予算のサマリーカードを表示する
 * - REQ-40.4: 実行予算サマリーカードに契約書名、契約金額、実行金額合計、利益見込額、作成日時を表示する
 * - REQ-40.5: 実行予算サマリーカードのクリックで実行予算管理画面へ遷移する
 * - REQ-41.2: 実行予算が存在する場合、detail-summary の実行予算データに実行予算ID、契約書名、
 *   契約金額、実行金額合計、利益見込額、作成日時を含める
 *
 * 実行予算は新規プロジェクトには未作成のため、REQ-40.8〜40.10 は空状態（「実行予算はまだありません」表示）が
 * テスト対象となる。REQ-40.3・40.4・41.2 は「実行予算が存在する場合」を前件に持つため、
 * 見積書 → 契約書 → 実行予算をテスト自身が API で作り、前件に入れてから主張する（タスク 72.2）。
 */

import { test, expect, type Page, type Response } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { API_BASE_URL } from '../../config';
import {
  authHeaders,
  createEstimateItem,
  createTestContract,
  createTestEstimate,
  createTestExecutionBudget,
  createTestProject as createTestProjectViaApi,
  getAccessTokenFromPage,
} from '../execution-budget/helpers';

test.describe('プロジェクト詳細画面 - 実行予算セクション', () => {
  test.describe.configure({ mode: 'serial' });

  let testProjectId: string | null = null;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * テスト用プロジェクトを作成
   */
  async function createTestProject(page: Page): Promise<string> {
    await expect(page.getByRole('button', { name: /Test User/i })).toBeVisible({
      timeout: getTimeout(15000),
    });

    await page.goto('/projects/new');
    await page.waitForLoadState('networkidle');
    await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

    const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
    await expect(page.getByText('読み込み中...').first()).not.toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect
      .poll(async () => (await salesPersonSelect.locator('option').all()).length, {
        timeout: getTimeout(30000),
      })
      .toBeGreaterThanOrEqual(2);

    await page.getByLabel(/プロジェクト名/i).fill(`実行予算セクションテスト_${Date.now()}`);
    await page.getByLabel(/現場住所/i).fill('東京都渋谷区実行予算1-2-3');

    await selectFirstRealOption(salesPersonSelect, '営業担当者');

    const createPromise = page.waitForResponse(
      (response: Response) =>
        response.url().includes('/api/projects') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
      { timeout: getTimeout(30000) }
    );

    await page.getByRole('button', { name: /^作成$/i }).click();
    await createPromise;

    await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
    const url = page.url();
    const match = url.match(/\/projects\/([0-9a-f-]+)$/);
    return match?.[1] ?? '';
  }

  test('事前準備: テストプロジェクトを作成', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    testProjectId = await createTestProject(page);
    expect(testProjectId).toBeTruthy();
  });

  /**
   * @requirement project-management/REQ-40.8: 実行予算データをロード中はスケルトンローダーを表示する
   *
   * 検証方針:
   * - ExecutionBudgetSectionCard コンポーネント内のスケルトン UI（isLoading=true 時）はユニットテスト
   *   (frontend/src/components/projects/ExecutionBudgetSectionCard.test.tsx) で保証されている。
   * - E2E では detail-summary API を遅延させ、ロード中はページレベルのローディング表示が出ること、
   *   ロード完了後に実行予算セクションが描画されスケルトン要素が DOM に残らないこと、
   *   空状態メッセージが表示される遷移を間接的に検証する。
   */
  test('実行予算データのロード中にスケルトンローダーが表示される (project-management/REQ-40.8)', async ({
    page,
  }) => {
    expect(testProjectId, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    // detail-summary API のレスポンスを意図的に遅延させる
    await page.route(/\/api\/projects\/[0-9a-f-]+\/detail-summary/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await page.goto(`/projects/${testProjectId}`);

    // ロード中はページレベルのローディング表示（スピナー）が表示されること
    await expect(page.getByText('読み込み中...')).toBeVisible({ timeout: getTimeout(5000) });

    // ロード完了後、実行予算セクションが描画されスケルトンが消える
    await page.waitForLoadState('networkidle');
    const section = page.getByTestId('execution-budget-section');
    await expect(section).toBeVisible({ timeout: getTimeout(10000) });
    const skeleton = page.getByTestId('execution-budget-section-skeleton');
    await expect(skeleton).toHaveCount(0, { timeout: getTimeout(15000) });

    // ロード完了後は空状態メッセージが表示される
    await expect(section.getByText('実行予算はまだありません')).toBeVisible({
      timeout: getTimeout(10000),
    });
  });

  /**
   * @requirement project-management/REQ-40.9: 実行予算セクションに「すべて見る」リンクを表示しない
   */
  test('実行予算セクションに「すべて見る」リンクが表示されない (project-management/REQ-40.9)', async ({
    page,
  }) => {
    expect(testProjectId, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${testProjectId}`);
    await page.waitForLoadState('networkidle');

    const section = page.getByTestId('execution-budget-section');
    await expect(section).toBeVisible({ timeout: getTimeout(10000) });

    // セクション内に「すべて見る」リンクが存在しない
    const viewAllLink = section.getByRole('link', { name: /すべて見る/ });
    await expect(viewAllLink).toHaveCount(0);
  });

  /**
   * @requirement project-management/REQ-40.10: 実行予算セクションのUIを既存の契約書セクションと同様のスタイルで提供する
   *
   * 検証方針: 契約書セクション (ContractSectionCard) と同様の section + role=region 構造、
   * セクションタイトル「実行予算」、空状態の場合は新規作成ボタンが描画されていることを確認する。
   */
  test('実行予算セクションが契約書セクションと同様の構造で表示される (project-management/REQ-40.10)', async ({
    page,
  }) => {
    expect(testProjectId, 'テストデータが不足しています').toBeTruthy();
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto(`/projects/${testProjectId}`);
    await page.waitForLoadState('networkidle');

    // 1. data-testid="execution-budget-section" を持つ section 要素として表示される
    const section = page.getByTestId('execution-budget-section');
    await expect(section).toBeVisible({ timeout: getTimeout(10000) });

    // 2. role="region" でアクセシブルな領域として宣言されている (契約書セクションと同様)
    expect(await section.getAttribute('role')).toBe('region');

    // 3. セクションタイトル「実行予算」が h3 として表示されている
    const title = section.getByRole('heading', { name: '実行予算', level: 3 });
    await expect(title).toBeVisible();

    // 4. 空状態時は「実行予算はまだありません」と「新規作成」リンクが表示される (契約書セクションと同等の空状態UI)
    await expect(section.getByText('実行予算はまだありません')).toBeVisible();
    const createLink = section.getByRole('link', { name: '新規作成' });
    await expect(createLink).toBeVisible();
    const href = await createLink.getAttribute('href');
    expect(href).toContain('execution-budget');
  });
});

/**
 * 実行予算が存在する場合の実行予算セクションと detail-summary（タスク 72.2）
 *
 * 前件「実行予算が存在する場合」に入るため、見積書（実行単価つきの項目1件）→ 契約書 → 実行予算を
 * API で作る。期待値はテストが与えた入力から定まる:
 * - 契約書名: 契約書の元になった見積書の名前
 * - 契約金額: 1,100,000円（契約書の作成時に与えた値）
 * - 実行金額合計: 数量 10 × 実行単価 40,000 = 400,000円
 * - 利益見込額: 契約金額 − 実行金額合計 = 700,000円
 */
test.describe('プロジェクト詳細画面 - 実行予算セクション（実行予算が存在する場合）', () => {
  const CONTRACT_AMOUNT = 1100000;
  const EXECUTION_AMOUNT_TOTAL = 10 * 40000;
  const PROFIT_FORECAST = CONTRACT_AMOUNT - EXECUTION_AMOUNT_TOTAL;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  interface SeededExecutionBudget {
    projectId: string;
    estimateName: string;
    budgetId: string;
    budgetCreatedAt: string;
  }

  /**
   * 実行予算を1件持つプロジェクトを API で用意する。
   * いずれかの作成に失敗した時点で（helpers の各関数が例外を投げて）失敗する。
   */
  async function seedProjectWithExecutionBudget(
    page: Page,
    label: string
  ): Promise<SeededExecutionBudget> {
    const token = await getAccessTokenFromPage(page);
    const projectId = await createTestProjectViaApi(page.request, token, label);
    const estimateName = `${label}見積_${Date.now()}`;
    const estimateId = await createTestEstimate(page.request, token, projectId, estimateName);
    await createEstimateItem(page.request, token, estimateId, {
      name: `${label}工種`,
      unit: '個',
      quantity: 10,
      estimateUnitPrice: 50000,
      executionUnitPrice: 40000,
      displayOrder: 0,
    });
    const contractId = await createTestContract(page.request, token, projectId, estimateId, {
      contractAmount: CONTRACT_AMOUNT,
      constructionPrice: 1000000,
      taxAmount: 100000,
    });
    const budget = await createTestExecutionBudget(page.request, token, projectId, contractId);

    // 作成日時は実行予算そのものの取得APIから得る（期待値をテスト側で捏造しない）
    const budgetRes = await page.request.get(
      `${API_BASE_URL}/api/projects/${projectId}/execution-budget`,
      { headers: authHeaders(token) }
    );
    expect(budgetRes.ok(), `前提: 実行予算を取得できる (status=${budgetRes.status()})`).toBe(true);
    const budgetBody = (await budgetRes.json()) as { id: string; createdAt: string };
    expect(budgetBody.id, '前提: 取得した実行予算が作成したものである').toBe(budget.id);

    return { projectId, estimateName, budgetId: budget.id, budgetCreatedAt: budgetBody.createdAt };
  }

  /**
   * @requirement project-management/REQ-40.3: When 実行予算が存在する場合, the ArchiTrackシステム shall 実行予算のサマリーカードを表示する
   * @requirement project-management/REQ-40.4: The ArchiTrackシステム shall 実行予算サマリーカードに契約書名、契約金額、実行金額合計、利益見込額、作成日時を表示する
   */
  test('実行予算が存在する場合、サマリーカードに契約書名・契約金額・実行金額合計・利益見込額・作成日時が表示される (project-management/REQ-40.3, REQ-40.4)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    const seeded = await seedProjectWithExecutionBudget(page, 'E2E実行予算サマリー');

    await page.goto(`/projects/${seeded.projectId}`);
    await page.waitForLoadState('networkidle');

    const section = page.getByTestId('execution-budget-section');
    await expect(section).toBeVisible({ timeout: getTimeout(15000) });

    // REQ-40.3: 実行予算が存在するので、空状態ではなくサマリーカードが表示される
    await expect(section.getByText('実行予算はまだありません')).toHaveCount(0);
    await expect(section.getByTestId('execution-budget-section-skeleton')).toHaveCount(0);

    // REQ-40.4: 各項目のラベルの直後に、その値が表示される
    const valueOf = (label: string) =>
      section.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]');

    const expectedDate = await page.evaluate(
      (iso) =>
        new Date(iso).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      seeded.budgetCreatedAt
    );

    await expect(valueOf('契約書')).toHaveText(seeded.estimateName);
    await expect(valueOf('契約金額')).toHaveText('1,100,000円');
    await expect(valueOf('実行金額合計')).toHaveText('400,000円');
    await expect(valueOf('利益見込額')).toHaveText('700,000円');
    await expect(valueOf('作成日時')).toHaveText(expectedDate);
  });

  /**
   * @requirement project-management/REQ-40.5: When ユーザーが実行予算サマリーカードをクリックした場合, the ArchiTrackシステム shall 実行予算管理画面へ遷移する
   *
   * カードの中の値の表示（リンク文言ではない箇所）をクリックして遷移することを主張する。
   */
  test('実行予算サマリーカードをクリックすると実行予算管理画面へ遷移する (project-management/REQ-40.5)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    const seeded = await seedProjectWithExecutionBudget(page, 'E2E実行予算クリック');

    await page.goto(`/projects/${seeded.projectId}`);
    await page.waitForLoadState('networkidle');

    const section = page.getByTestId('execution-budget-section');
    const contractAmountLabel = section.getByText('契約金額', { exact: true });
    await expect(contractAmountLabel).toBeVisible({ timeout: getTimeout(15000) });

    await contractAmountLabel.click();

    await expect(page).toHaveURL(new RegExp(`/projects/${seeded.projectId}/execution-budget$`), {
      timeout: getTimeout(10000),
    });
  });

  /**
   * @requirement project-management/REQ-41.2: When 実行予算が存在する場合, the ArchiTrackシステム shall 実行予算データに実行予算ID、契約書名、契約金額、実行金額合計、利益見込額、作成日時を含める
   */
  test('実行予算が存在する場合、detail-summary の実行予算データに ID・契約書名・契約金額・実行金額合計・利益見込額・作成日時が含まれる (project-management/REQ-41.2)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    const seeded = await seedProjectWithExecutionBudget(page, 'E2E実行予算API');
    const token = await getAccessTokenFromPage(page);

    const res = await page.request.get(
      `${API_BASE_URL}/api/projects/${seeded.projectId}/detail-summary`,
      { headers: authHeaders(token) }
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      sections: {
        executionBudget: {
          id: string;
          contractName: string;
          contractAmount: number | string;
          executionAmountTotal: number | string;
          profitForecast: number | string;
          createdAt: string;
        } | null;
      };
    };

    const budget = body.sections.executionBudget;
    expect(budget, '実行予算が存在するので null ではない').not.toBeNull();
    expect(budget?.id).toBe(seeded.budgetId);
    expect(budget?.contractName).toBe(seeded.estimateName);
    expect(Number(budget?.contractAmount)).toBe(CONTRACT_AMOUNT);
    expect(Number(budget?.executionAmountTotal)).toBe(EXECUTION_AMOUNT_TOTAL);
    expect(Number(budget?.profitForecast)).toBe(PROFIT_FORECAST);
    expect(new Date(budget?.createdAt ?? '').toISOString()).toBe(
      new Date(seeded.budgetCreatedAt).toISOString()
    );
  });
});
