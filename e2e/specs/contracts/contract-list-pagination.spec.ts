/**
 * @fileoverview 契約書の一覧のページ送りのE2Eテスト
 *
 * Task 18.4: 契約書の一覧にページ送りを付け、21 件目以降に到達できるようにする。
 * 一覧は 1 ページ 20 件で取得するため、21 件以上の契約書を持つプロジェクトでは
 * ページ送り（project-management の PaginationUI）で 2 ページ目へ移って 21 件目を表示する。
 *
 * 測る契約書は、テスト用の DB へ直接 21 件作る。一覧の既定の並びは作成日時の新しい順のため、
 * 作成日時を 1 日ずつずらした固定の値で投入し、最も古い 1 件（21 件目）が 2 ページ目に来るようにする。
 * ページの移動はキーボードだけで行う（最後の行の導線から Tab でページ送りの釦へ進み、Enter で押す）。
 *
 * Requirements coverage (contract-management):
 * - REQ-1.1: プロジェクトに紐付く契約書のリストを一覧画面に表示する（21 件目以降の契約書を含む）
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient, disconnectDatabase } from '../../fixtures/database';

const PROJECT_NAME = 'E2E契約書一覧のページ送り用プロジェクト';
const ESTIMATE_NAME = '契約書一覧のページ送りの見積書';

/** 投入する契約書の件数（1 ページの 20 件を 1 件超える） */
const CONTRACT_COUNT = 21;

let projectId: string;
/** 作成日時の新しい順（一覧の既定の並び）に並べた契約書の id */
let contractIdsNewestFirst: string[] = [];

/** n 件目（1 始まり、作成日時の古い順）の作成日時。2026-01-01 から 1 日ずつ進める */
function createdAtOf(n: number): Date {
  return new Date(Date.UTC(2026, 0, n));
}

/** プロジェクト・見積書と、作成日時の異なる契約書 21 件を作る */
async function setupTestData(): Promise<void> {
  const prisma = getPrismaClient();
  const testUser = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
  if (!testUser) {
    throw new Error('テストユーザーが見つかりません。global-setupを確認してください。');
  }
  projectId = (
    await prisma.project.create({
      data: {
        name: PROJECT_NAME,
        status: 'PREPARING',
        salesPersonId: testUser.id,
        createdById: testUser.id,
      },
    })
  ).id;
  const estimateId = (await prisma.estimate.create({ data: { projectId, name: ESTIMATE_NAME } }))
    .id;
  const idsOldestFirst: string[] = [];
  for (let n = 1; n <= CONTRACT_COUNT; n += 1) {
    const constructionPrice = n * 10000;
    idsOldestFirst.push(
      (
        await prisma.contract.create({
          data: {
            projectId,
            contractType: 'NEW',
            status: 'BEFORE_CONTRACT',
            estimateId,
            contractDate: createdAtOf(n),
            constructionStartDate: new Date('2026-04-10T00:00:00.000Z'),
            constructionEndDate: new Date('2026-09-30T00:00:00.000Z'),
            deliveryDate: new Date('2026-10-15T00:00:00.000Z'),
            constructionPrice,
            taxAmount: constructionPrice / 10,
            contractAmount: constructionPrice + constructionPrice / 10,
            createdAt: createdAtOf(n),
          },
        })
      ).id
    );
  }
  contractIdsNewestFirst = [...idsOldestFirst].reverse();
}

/** 作ったプロジェクトと、その下の契約書・見積書を消す */
async function cleanupTestData(): Promise<void> {
  const prisma = getPrismaClient();
  if (projectId) {
    await prisma.contract.deleteMany({ where: { projectId } });
    await prisma.estimate.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
  }
}

/** 一覧の取得（GET /api/projects/:projectId/contracts）の応答を待つ。判定はパスで行う */
function waitForListResponse(page: Page, expectedPage: string, expectedLimit: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/projects/${projectId}/contracts` &&
      response.request().method() === 'GET' &&
      url.searchParams.get('page') === expectedPage &&
      url.searchParams.get('limit') === expectedLimit
    );
  });
}

/** 一覧画面を開き、1 ページ目（page=1, limit=20）の応答と行の表示を待つ */
async function openListPage(page: Page): Promise<void> {
  const firstPageResponse = waitForListResponse(page, '1', '20');
  await page.goto(`/projects/${projectId}/contracts`);
  expect((await firstPageResponse).status()).toBe(200);
  await expect(page.getByRole('heading', { name: '契約書一覧', level: 1 })).toBeVisible({
    timeout: getTimeout(10000),
  });
  await expect(page.getByTestId(`contract-row-${contractIdsNewestFirst[0]}`)).toBeVisible({
    timeout: getTimeout(10000),
  });
}

test.describe('契約書の一覧のページ送り', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(async () => {
    await setupTestData();
  });

  test.afterAll(async () => {
    await cleanupTestData();
    await disconnectDatabase();
  });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await loginAsUser(page, 'REGULAR_USER');
  });

  /**
   * @requirement contract-management/REQ-1.1: プロジェクトに紐付く契約書のリストを一覧画面に表示する
   */
  test('契約書が21件あるとき、キーボードで2ページ目へ移ると21件目の契約書が表示される (contract-management/REQ-1.1)', async ({
    page,
  }) => {
    await openListPage(page);

    // 1 ページ目: 新しい 20 件だけが並び、21 件目（最も古い 1 件）は出ない
    const rows = page.getByTestId(/^contract-row-/);
    await expect(rows).toHaveCount(20);
    const oldestRow = page.getByTestId(`contract-row-${contractIdsNewestFirst[20]}`);
    await expect(oldestRow).toHaveCount(0);
    await expect(page.getByText(`全${CONTRACT_COUNT}件`, { exact: true })).toBeVisible();
    const pagination = page.getByRole('navigation', { name: 'ページネーション' });
    await expect(pagination).toBeVisible();
    await expect(pagination.getByTestId('current-page')).toHaveText('1');
    await expect(pagination.getByTestId('total-pages')).toHaveText('2');

    // 最後の行の最後の導線から Tab で進むと、ページ送りの「ページ 2」の釦にフォーカスが移る
    // （「前のページ」と現在の「ページ 1」は押せないため止まらない）
    const lastRowOnFirstPage = page.getByTestId(`contract-row-${contractIdsNewestFirst[19]}`);
    await lastRowOnFirstPage.getByRole('link').last().focus();
    await page.keyboard.press('Tab');
    const pageTwoButton = pagination.getByRole('button', { name: 'ページ 2', exact: true });
    await expect(pageTwoButton).toBeFocused();

    const secondPageResponse = waitForListResponse(page, '2', '20');
    await page.keyboard.press('Enter');
    expect((await secondPageResponse).status()).toBe(200);

    // 2 ページ目: 21 件目だけが並ぶ
    await expect(oldestRow).toBeVisible({ timeout: getTimeout(10000) });
    await expect(rows).toHaveCount(1);
    await expect(oldestRow.getByRole('link', { name: '￥11,000' })).toBeVisible();
    await expect(page.getByTestId(`contract-row-${contractIdsNewestFirst[0]}`)).toHaveCount(0);
    await expect(pagination.getByTestId('current-page')).toHaveText('2');
    await expect(page.getByText(`全${CONTRACT_COUNT}件`, { exact: true })).toBeVisible();

    // 21 件目の導線から詳細画面へ進める（一覧の契約書を選べる）
    await oldestRow.getByRole('link', { name: '￥11,000' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(
      new RegExp(`/projects/${projectId}/contracts/${contractIdsNewestFirst[20]}$`)
    );
  });

  /**
   * @requirement contract-management/REQ-1.1: プロジェクトに紐付く契約書のリストを一覧画面に表示する
   */
  test('表示件数を50件に変えると、21件の契約書が1ページにすべて表示される (contract-management/REQ-1.1)', async ({
    page,
  }) => {
    await openListPage(page);

    const fiftyResponse = waitForListResponse(page, '1', '50');
    await page
      .getByRole('navigation', { name: 'ページネーション' })
      .getByRole('combobox', { name: '表示件数' })
      .selectOption('50');
    expect((await fiftyResponse).status()).toBe(200);

    await expect(page.getByTestId(/^contract-row-/)).toHaveCount(CONTRACT_COUNT, {
      timeout: getTimeout(10000),
    });
    await expect(page.getByTestId(`contract-row-${contractIdsNewestFirst[20]}`)).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'ページネーション' }).getByTestId('total-pages')
    ).toHaveText('1');
  });
});
