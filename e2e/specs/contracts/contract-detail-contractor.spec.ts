/**
 * @fileoverview 契約書の詳細画面の請負者（自社）の表示のE2Eテスト
 *
 * Task 18.2: 契約書の詳細画面に請負者（自社）を表示する。
 * 詳細画面は自社情報（GET /api/company-info）を取得し、「請負者」に会社名を表示する。
 * 自社情報が未登録・取得の失敗のときは、契約書フォームと同じく「未設定」を表示し、
 * 契約書の他の項目の表示は妨げない。
 *
 * 自社情報は 1 件だけの共有データで、他の spec（company-info 配下）も読む。
 * 本 spec は、登録済みの値を DB から読んで退避し、測定用の会社名へ一時的に書き換え、
 * afterAll で退避した値（会社名・版・更新日時）へ戻す。未登録だった場合は作った 1 件を消す。
 * 未登録・取得の失敗の表示は、GET /api/company-info を page.route で差し替えて測る（DB は書き換えない）。
 *
 * Requirements coverage (contract-management):
 * - REQ-8.1: 契約書詳細画面に新規作成時に入力した全項目と自動表示項目を表示する
 *   （自動表示項目のうち請負者。請負者を自社情報とする規則は REQ-4.5）
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient, disconnectDatabase } from '../../fixtures/database';

const PROJECT_NAME = 'E2E契約書詳細の請負者表示用プロジェクト';
const ESTIMATE_NAME = '契約書詳細の請負者表示の見積書';
const CUSTOMER_NAME = 'E2E契約書詳細の請負者表示の発注者';
/** 測定のあいだだけ自社情報へ書き込む会社名（他のどの表示とも重ならない名前） */
const TEST_COMPANY_NAME = 'E2E契約書詳細の請負者表示の自社株式会社';

let projectId: string;
let contractId: string;
let customerId: string;

/** 測定前の自社情報（未登録なら null）。afterAll でこの値へ戻す */
let savedCompanyInfo: {
  id: string;
  companyName: string;
  version: number;
  updatedAt: Date;
} | null = null;
/** 未登録だったために本 spec が作った自社情報の id */
let createdCompanyInfoId: string | null = null;

/** 日付の文字列（YYYY-MM-DD）を DB の Date 列の値へ直す */
function toDbDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** 発注者の取引先・プロジェクト・見積書・新規契約を 1 件ずつ作る */
async function setupContract(): Promise<void> {
  const prisma = getPrismaClient();
  const testUser = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
  if (!testUser) {
    throw new Error('テストユーザーが見つかりません。global-setupを確認してください。');
  }
  customerId = (
    await prisma.tradingPartner.create({
      data: {
        name: CUSTOMER_NAME,
        nameKana: 'イーツーイーケイヤクショショウサイウケオイシャヒョウジハッチュウシャ',
        address: '東京都千代田区請負者表示1-2-3',
        types: { create: { type: 'CUSTOMER' } },
      },
    })
  ).id;
  projectId = (
    await prisma.project.create({
      data: {
        name: PROJECT_NAME,
        status: 'PREPARING',
        salesPersonId: testUser.id,
        createdById: testUser.id,
        tradingPartnerId: customerId,
      },
    })
  ).id;
  const estimateId = (await prisma.estimate.create({ data: { projectId, name: ESTIMATE_NAME } }))
    .id;
  contractId = (
    await prisma.contract.create({
      data: {
        projectId,
        contractType: 'NEW',
        status: 'BEFORE_CONTRACT',
        estimateId,
        contractDate: toDbDate('2026-04-01'),
        constructionStartDate: toDbDate('2026-05-01'),
        constructionEndDate: toDbDate('2026-12-31'),
        deliveryDate: toDbDate('2027-01-15'),
        taxRate: '0.1',
      },
    })
  ).id;
}

/** 測定前の自社情報を退避し、会社名を測定用の名前にする（未登録なら 1 件作る） */
async function setupCompanyInfo(): Promise<void> {
  const prisma = getPrismaClient();
  const existing = await prisma.companyInfo.findMany();
  if (existing.length > 1) {
    throw new Error(`自社情報が ${existing.length} 件あります。1 件だけの前提が崩れています。`);
  }
  const current = existing[0];
  if (current) {
    savedCompanyInfo = {
      id: current.id,
      companyName: current.companyName,
      version: current.version,
      updatedAt: current.updatedAt,
    };
    await prisma.companyInfo.update({
      where: { id: current.id },
      data: { companyName: TEST_COMPANY_NAME },
    });
  } else {
    createdCompanyInfoId = (
      await prisma.companyInfo.create({
        data: {
          companyName: TEST_COMPANY_NAME,
          address: '東京都千代田区請負者表示4-5-6',
          representative: '請負者 表示',
        },
      })
    ).id;
  }
}

/** 自社情報を測定前の状態へ戻す */
async function restoreCompanyInfo(): Promise<void> {
  const prisma = getPrismaClient();
  if (savedCompanyInfo) {
    await prisma.companyInfo.update({
      where: { id: savedCompanyInfo.id },
      data: {
        companyName: savedCompanyInfo.companyName,
        version: savedCompanyInfo.version,
        updatedAt: savedCompanyInfo.updatedAt,
      },
    });
  }
  if (createdCompanyInfoId) {
    await prisma.companyInfo.deleteMany({ where: { id: createdCompanyInfoId } });
  }
}

/** 作ったプロジェクトと、その下の契約書・見積書、発注者の取引先を消す */
async function cleanupContract(): Promise<void> {
  const prisma = getPrismaClient();
  if (projectId) {
    await prisma.contract.deleteMany({ where: { projectId } });
    await prisma.estimate.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
  }
  if (customerId) {
    await prisma.tradingPartner.deleteMany({ where: { id: customerId } });
  }
}

/**
 * 契約書の詳細画面を開き、自社情報の取得の応答を待つ。
 * 請負者の表示は契約書の取得とは別の取得で決まるため、その応答の後の表示を測る
 */
async function openDetailPage(page: Page): Promise<number> {
  const companyInfoResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/company-info' &&
      response.request().method() === 'GET'
  );
  await page.goto(`/projects/${projectId}/contracts/${contractId}`);
  await expect(page.getByRole('heading', { name: '契約書詳細', level: 1 })).toBeVisible({
    timeout: getTimeout(10000),
  });
  return (await companyInfoResponse).status();
}

test.describe('契約書の詳細画面の請負者（自社）の表示', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(async () => {
    await setupContract();
    await setupCompanyInfo();
  });

  test.afterAll(async () => {
    await restoreCompanyInfo();
    await cleanupContract();
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
   * @requirement contract-management/REQ-8.1: 契約書詳細画面に新規作成時に入力した全項目と自動表示項目を表示する
   */
  test('契約書の詳細画面に、請負者として自社情報の会社名が表示される (contract-management/REQ-8.1)', async ({
    page,
  }) => {
    expect(await openDetailPage(page)).toBe(200);

    const projectCard = page
      .getByRole('heading', { name: 'プロジェクト情報', level: 2 })
      .locator('xpath=..');
    await expect(projectCard.getByText('請負者', { exact: true })).toBeVisible();
    await expect(projectCard.getByTestId('contractor-name')).toHaveText(TEST_COMPANY_NAME, {
      timeout: getTimeout(10000),
    });
    // 並びの他の自動表示項目（発注者・工事名）も同じカードに表示される
    await expect(projectCard.getByText(CUSTOMER_NAME, { exact: true })).toBeVisible();
    await expect(projectCard.getByText(PROJECT_NAME, { exact: true })).toBeVisible();
  });

  /**
   * 自社情報が未登録・取得の失敗のときの表示（Task 18.2 が設計で決めた規則。契約書フォームに揃える）
   */
  for (const scenario of [
    { label: '未登録（空オブジェクト）', status: 200, body: '{}' },
    {
      label: '取得の失敗（500）',
      status: 500,
      body: JSON.stringify({ title: 'Internal Server Error', status: 500 }),
    },
  ]) {
    test(`自社情報が${scenario.label}のとき、請負者に「未設定」を表示し、契約書の他の項目は表示される`, async ({
      page,
    }) => {
      await page.route(
        (url) => url.pathname === '/api/company-info',
        (route) =>
          route.fulfill({
            status: scenario.status,
            contentType: 'application/json',
            body: scenario.body,
          })
      );

      expect(await openDetailPage(page)).toBe(scenario.status);

      const projectCard = page
        .getByRole('heading', { name: 'プロジェクト情報', level: 2 })
        .locator('xpath=..');
      await expect(projectCard.getByTestId('contractor-name')).toHaveText('未設定', {
        timeout: getTimeout(10000),
      });
      await expect(projectCard.getByText(TEST_COMPANY_NAME, { exact: true })).toHaveCount(0);
      await expect(projectCard.getByText(CUSTOMER_NAME, { exact: true })).toBeVisible();
      await expect(projectCard.getByText(PROJECT_NAME, { exact: true })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
  }
});
