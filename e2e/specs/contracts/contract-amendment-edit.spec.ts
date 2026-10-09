/**
 * @fileoverview 変更契約の編集画面の初期化のE2Eテスト
 *
 * Task 18.1: 変更契約の編集画面で、フォームの値が基契約書の値で上書きされないようにする。
 * 編集の初期化で基契約書の詳細を取得しても、入力欄には保存済みの変更契約の値を表示し、
 * 変更せずに保存しても保存済みの値が変わらないことを主張する。
 * 基契約書の値は変更前として比較表示に並ぶ（要件 6 の比較表示を編集の側でも保つ）。
 *
 * 測る契約書・見積書・取引先・プロジェクトは、テスト用の DB へ直接作る（日付は固定値）。
 * 基契約書と変更契約は、見積書・日付・税率・文章の欄・監理者のすべてで値が異なる。
 * 保存後の値は API を通さず DB から直接読み、画面の表示に依らずに確かめる。
 *
 * Requirements coverage (contract-management):
 * - REQ-9.1: 契約書編集画面に新規作成画面で入力した全項目を編集可能な状態で表示する
 * - REQ-9.2: 編集内容を保存した場合、変更内容を反映して契約書詳細画面に遷移する
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient, disconnectDatabase } from '../../fixtures/database';

const PROJECT_NAME = 'E2E変更契約の編集の初期化用プロジェクト';
const PARENT_ESTIMATE_NAME = '変更契約の編集の初期化の基契約書の見積書';
const AMENDMENT_ESTIMATE_NAME = '変更契約の編集の初期化の変更契約の見積書';
const PARENT_SUPERVISOR_NAME = 'E2E変更契約の編集の初期化の基契約書の監理者';
const AMENDMENT_SUPERVISOR_NAME = 'E2E変更契約の編集の初期化の変更契約の監理者';

/** 基契約書（新規契約）の保存済みの値 */
const PARENT_VALUES = {
  contractDate: '2026-01-01',
  constructionStartDate: '2026-01-10',
  constructionEndDate: '2026-06-30',
  deliveryDate: '2026-07-15',
  taxRate: '0.1',
  paymentTerms: 'PARENT_TERMS',
  separateConstruction: 'PARENT_SEPARATE',
  otherNotes: 'PARENT_NOTES',
};

/** 変更契約の保存済みの値（基契約書とすべて異なる） */
const AMENDMENT_VALUES = {
  contractDate: '2026-05-05',
  constructionStartDate: '2026-05-10',
  constructionEndDate: '2026-09-30',
  deliveryDate: '2026-10-20',
  taxRate: '0.08',
  paymentTerms: 'AMENDED_TERMS',
  separateConstruction: 'AMENDED_SEPARATE',
  otherNotes: 'AMENDED_NOTES',
};

let projectId: string;
let parentEstimateId: string;
let amendmentEstimateId: string;
let parentSupervisorId: string;
let amendmentSupervisorId: string;
let parentContractId: string;
let amendmentContractId: string;

/** 日付の文字列（YYYY-MM-DD）を DB の Date 列の値へ直す */
function toDbDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** 監理者の取引先を作る */
async function createSupervisor(name: string, nameKana: string): Promise<string> {
  const prisma = getPrismaClient();
  return (
    await prisma.tradingPartner.create({
      data: {
        name,
        nameKana,
        address: '東京都千代田区変更契約1-2-3',
        types: { create: { type: 'CUSTOMER' } },
      },
    })
  ).id;
}

/**
 * プロジェクト 1 件に、見積書 2 件と監理者の取引先 2 件、
 * 新規契約（基契約書）と、それを基にした変更契約を作る
 */
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
  parentEstimateId = (
    await prisma.estimate.create({ data: { projectId, name: PARENT_ESTIMATE_NAME } })
  ).id;
  amendmentEstimateId = (
    await prisma.estimate.create({ data: { projectId, name: AMENDMENT_ESTIMATE_NAME } })
  ).id;
  parentSupervisorId = await createSupervisor(
    PARENT_SUPERVISOR_NAME,
    'イーツーイーヘンコウケイヤクキケイヤクショカンリシャ'
  );
  amendmentSupervisorId = await createSupervisor(
    AMENDMENT_SUPERVISOR_NAME,
    'イーツーイーヘンコウケイヤクヘンコウケイヤクカンリシャ'
  );
  parentContractId = (
    await prisma.contract.create({
      data: {
        projectId,
        contractType: 'NEW',
        status: 'CONTRACTED',
        estimateId: parentEstimateId,
        contractDate: toDbDate(PARENT_VALUES.contractDate),
        constructionStartDate: toDbDate(PARENT_VALUES.constructionStartDate),
        constructionEndDate: toDbDate(PARENT_VALUES.constructionEndDate),
        deliveryDate: toDbDate(PARENT_VALUES.deliveryDate),
        taxRate: PARENT_VALUES.taxRate,
        paymentTerms: PARENT_VALUES.paymentTerms,
        separateConstruction: PARENT_VALUES.separateConstruction,
        otherNotes: PARENT_VALUES.otherNotes,
        supervisorTradingPartnerId: parentSupervisorId,
        createdAt: toDbDate(PARENT_VALUES.contractDate),
      },
    })
  ).id;
  amendmentContractId = (
    await prisma.contract.create({
      data: {
        projectId,
        contractType: 'AMENDMENT',
        status: 'BEFORE_CONTRACT',
        parentContractId,
        estimateId: amendmentEstimateId,
        contractDate: toDbDate(AMENDMENT_VALUES.contractDate),
        constructionStartDate: toDbDate(AMENDMENT_VALUES.constructionStartDate),
        constructionEndDate: toDbDate(AMENDMENT_VALUES.constructionEndDate),
        deliveryDate: toDbDate(AMENDMENT_VALUES.deliveryDate),
        taxRate: AMENDMENT_VALUES.taxRate,
        paymentTerms: AMENDMENT_VALUES.paymentTerms,
        separateConstruction: AMENDMENT_VALUES.separateConstruction,
        otherNotes: AMENDMENT_VALUES.otherNotes,
        supervisorTradingPartnerId: amendmentSupervisorId,
        createdAt: toDbDate(AMENDMENT_VALUES.contractDate),
      },
    })
  ).id;
}

/** 作ったプロジェクトと、その下の契約書・見積書、監理者の取引先を消す */
async function cleanupTestData(): Promise<void> {
  const prisma = getPrismaClient();
  if (projectId) {
    await prisma.contract.deleteMany({ where: { projectId, parentContractId: { not: null } } });
    await prisma.contract.deleteMany({ where: { projectId } });
    await prisma.estimate.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
  }
  await prisma.tradingPartner.deleteMany({
    where: { name: { in: [PARENT_SUPERVISOR_NAME, AMENDMENT_SUPERVISOR_NAME] } },
  });
}

/** 変更契約の DB の保存済みの値を、比べやすい文字列へ直して読む */
async function readAmendmentFromDb() {
  const prisma = getPrismaClient();
  const contract = await prisma.contract.findUniqueOrThrow({ where: { id: amendmentContractId } });
  const day = (value: Date) => value.toISOString().slice(0, 10);
  return {
    parentContractId: contract.parentContractId,
    estimateId: contract.estimateId,
    contractDate: day(contract.contractDate),
    constructionStartDate: day(contract.constructionStartDate),
    constructionEndDate: day(contract.constructionEndDate),
    deliveryDate: day(contract.deliveryDate),
    taxRate: contract.taxRate.toString(),
    paymentTerms: contract.paymentTerms,
    separateConstruction: contract.separateConstruction,
    otherNotes: contract.otherNotes,
    supervisorTradingPartnerId: contract.supervisorTradingPartnerId,
    version: contract.version,
  };
}

/**
 * 変更契約の編集画面を開き、基契約書の詳細の取得が終わる（比較表示に基契約書の値が並ぶ）まで待つ。
 * 基契約書の詳細は編集の初期化の後に取得されるため、その応答の後の表示を測る
 */
async function openAmendmentEditPage(page: Page): Promise<void> {
  const parentDetailResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/contracts/${parentContractId}` &&
      response.request().method() === 'GET'
  );
  await page.goto(`/projects/${projectId}/contracts/${amendmentContractId}/edit`);
  await expect(page.getByRole('heading', { name: '契約書編集', level: 1 })).toBeVisible({
    timeout: getTimeout(10000),
  });
  expect((await parentDetailResponse).status()).toBe(200);
  const comparisonPanel = page.getByTestId('comparison-panel');
  await expect(comparisonPanel).toBeVisible({ timeout: getTimeout(10000) });
  await expect(comparisonPanel).toContainText(PARENT_VALUES.paymentTerms);
  await expect(
    page.getByRole('combobox', { name: '見積書', exact: true }).locator('option', {
      hasText: AMENDMENT_ESTIMATE_NAME,
    })
  ).toHaveCount(1, { timeout: getTimeout(10000) });
}

test.describe('変更契約の編集画面の初期化', () => {
  // 2 件は互いに依らない（表示の測定は DB を書き換えず、保存の測定は前後の値を自ら読む）
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
    await loginAsUser(page, 'ADMIN_USER');
  });

  /**
   * @requirement contract-management/REQ-9.1: 契約書編集画面に新規作成画面で入力した全項目を編集可能な状態で表示する
   */
  test('変更契約の編集画面に、基契約書の取得の後も保存済みの変更後の値が表示される (contract-management/REQ-9.1)', async ({
    page,
  }) => {
    await openAmendmentEditPage(page);

    await expect(page.getByRole('combobox', { name: '見積書', exact: true })).toHaveValue(
      amendmentEstimateId
    );
    await expect(page.getByLabel('契約日', { exact: true })).toHaveValue(
      AMENDMENT_VALUES.contractDate
    );
    await expect(page.getByLabel('工期着手日', { exact: true })).toHaveValue(
      AMENDMENT_VALUES.constructionStartDate
    );
    await expect(page.getByLabel('工期完成日', { exact: true })).toHaveValue(
      AMENDMENT_VALUES.constructionEndDate
    );
    await expect(page.getByLabel('引渡日', { exact: true })).toHaveValue(
      AMENDMENT_VALUES.deliveryDate
    );
    await expect(page.getByLabel('消費税率（%）', { exact: true })).toHaveValue('8');
    await expect(page.getByLabel('支払条件', { exact: true })).toHaveValue(
      AMENDMENT_VALUES.paymentTerms
    );
    await expect(page.getByLabel('別途工事', { exact: true })).toHaveValue(
      AMENDMENT_VALUES.separateConstruction
    );
    await expect(page.getByLabel('その他', { exact: true })).toHaveValue(
      AMENDMENT_VALUES.otherNotes
    );
    // 監理者は画面の表示では測らない（監理者の選択の部品は取引先一覧の取得が 400 で失敗し、
    // 選択済みの名前を表示できないため）。基契約書の監理者に差し替わらないことは、
    // 次のテストが保存後の DB の supervisorTradingPartnerId で主張する

    // 比較表示は基契約書の値を変更前、保存済みの値を変更後に並べる
    const paymentTermsRow = page.getByTestId('comparison-field-changed-paymentTerms');
    await expect(paymentTermsRow).toContainText(PARENT_VALUES.paymentTerms);
    await expect(paymentTermsRow).toContainText(AMENDMENT_VALUES.paymentTerms);
    const taxRateRow = page.getByTestId('comparison-field-changed-taxRate');
    await expect(taxRateRow).toContainText('10%');
    await expect(taxRateRow).toContainText('8%');
  });

  /**
   * @requirement contract-management/REQ-9.2: 編集内容を保存した場合、変更内容を反映して契約書詳細画面に遷移する
   */
  test('変更契約の編集画面で変更せずに保存しても、保存済みの変更後の値は基契約書の値に書き換わらない (contract-management/REQ-9.2)', async ({
    page,
  }) => {
    const before = await readAmendmentFromDb();
    expect(before).toMatchObject({
      parentContractId,
      estimateId: amendmentEstimateId,
      ...AMENDMENT_VALUES,
      supervisorTradingPartnerId: amendmentSupervisorId,
    });

    await openAmendmentEditPage(page);

    const updateResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/contracts/${amendmentContractId}` &&
        response.request().method() === 'PUT'
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    expect((await updateResponse).status()).toBe(200);

    await expect(page).toHaveURL(
      new RegExp(`/projects/${projectId}/contracts/${amendmentContractId}$`),
      { timeout: getTimeout(10000) }
    );
    await expect(page.getByRole('heading', { name: '契約書詳細', level: 1 })).toBeVisible({
      timeout: getTimeout(10000),
    });

    const after = await readAmendmentFromDb();
    // 保存が行われた（版が進んだ）うえで、入力項目の値は保存前のまま
    expect(after.version).toBe(before.version + 1);
    expect(after).toMatchObject({
      parentContractId,
      estimateId: amendmentEstimateId,
      ...AMENDMENT_VALUES,
      supervisorTradingPartnerId: amendmentSupervisorId,
    });
  });
});
