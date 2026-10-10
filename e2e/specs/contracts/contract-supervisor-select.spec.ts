/**
 * @fileoverview 契約書のフォームの監理者の選択のE2Eテスト
 *
 * Task 18.5: 監理者の選択欄が取引先の一覧を取得できない状態を、画面の側の送り方を正して直す。
 * 監理者の候補は顧客と協力業者の両方の種別から取る。一覧の API（GET /api/trading-partners）の
 * 種別 type は単一の値だけを受け付けるため、画面は種別ごとに取得してまとめる。
 * 新規契約・変更契約・編集の各画面で、取引先一覧の取得がいずれも成功し、候補に顧客と協力業者の
 * 取引先が並び、選んで保存した監理者の名前が詳細画面と編集画面に表示されることを主張する。
 *
 * 測る取引先・プロジェクト・見積書・契約書は、テスト用の DB へ直接作る（日付は固定値）。
 * 保存後の監理者は API を通さず DB から直接読み、画面の表示に依らずにも確かめる。
 *
 * Requirements coverage (contract-management):
 * - REQ-3.8: 新規契約フォームに監理者となる取引先を検索・選択できるUIを提供する
 * - REQ-5.3: 変更契約フォームに新規契約と同一の入力フィールド（監理者を含む）を提供する
 * - REQ-9.1: 契約書編集画面に新規作成画面で入力した全項目を編集可能な状態で表示する
 */

import { test, expect, type Page, type Response } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient, disconnectDatabase } from '../../fixtures/database';

const PROJECT_NAME = 'E2E契約書の監理者の選択用プロジェクト';
const ESTIMATE_NAME = '契約書の監理者の選択の見積書';
/** 顧客だけの種別を持つ監理者の候補 */
const CUSTOMER_NAME = 'E2E契約書の監理者の選択の顧客';
/** 協力業者だけの種別を持つ監理者の候補 */
const SUBCONTRACTOR_NAME = 'E2E契約書の監理者の選択の協力業者';

let projectId: string;
let estimateId: string;
let customerId: string;
let subcontractorId: string;
/** 監理者に顧客を選んだ新規契約（変更契約の基契約書・編集の測定に使う） */
let seededContractId: string;

/** 日付の文字列（YYYY-MM-DD）を DB の Date 列の値へ直す */
function toDbDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** 取引先・プロジェクト・見積書と、監理者に顧客を選んだ新規契約を作る */
async function setupTestData(): Promise<void> {
  const prisma = getPrismaClient();
  const testUser = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
  if (!testUser) {
    throw new Error('テストユーザーが見つかりません。global-setupを確認してください。');
  }
  // フリガナは一覧の先頭（取得の上限 100 件の内側）に並ぶ値にする
  customerId = (
    await prisma.tradingPartner.create({
      data: {
        name: CUSTOMER_NAME,
        nameKana: 'アアアイーツーイーケイヤクショカンリシャコキャク',
        address: '東京都千代田区監理者1-2-3',
        types: { create: { type: 'CUSTOMER' } },
      },
    })
  ).id;
  subcontractorId = (
    await prisma.tradingPartner.create({
      data: {
        name: SUBCONTRACTOR_NAME,
        nameKana: 'アアアイーツーイーケイヤクショカンリシャキョウリョクギョウシャ',
        address: '東京都千代田区監理者4-5-6',
        types: { create: { type: 'SUBCONTRACTOR' } },
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
      },
    })
  ).id;
  estimateId = (await prisma.estimate.create({ data: { projectId, name: ESTIMATE_NAME } })).id;
  seededContractId = (
    await prisma.contract.create({
      data: {
        projectId,
        contractType: 'NEW',
        status: 'CONTRACTED',
        estimateId,
        contractDate: toDbDate('2026-02-01'),
        constructionStartDate: toDbDate('2026-02-10'),
        constructionEndDate: toDbDate('2026-08-31'),
        deliveryDate: toDbDate('2026-09-15'),
        taxRate: '0.1',
        paymentTerms: 'SUPERVISOR_TERMS',
        separateConstruction: 'SUPERVISOR_SEPARATE',
        otherNotes: 'SUPERVISOR_NOTES',
        supervisorTradingPartnerId: customerId,
        createdAt: toDbDate('2026-02-01'),
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
    where: { name: { in: [CUSTOMER_NAME, SUBCONTRACTOR_NAME] } },
  });
}

/** 契約書の DB の監理者の取引先 ID を読む */
async function readSupervisorIdFromDb(contractId: string): Promise<string | null> {
  const prisma = getPrismaClient();
  const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
  return contract.supervisorTradingPartnerId;
}

/**
 * 取引先一覧（GET /api/trading-partners）の応答を集める。
 * 観測はパス基準（API のオリジンは環境で異なるため）
 */
function collectTradingPartnerListResponses(page: Page): Response[] {
  const responses: Response[] = [];
  page.on('response', (response) => {
    if (
      new URL(response.url()).pathname === '/api/trading-partners' &&
      response.request().method() === 'GET'
    ) {
      responses.push(response);
    }
  });
  return responses;
}

/**
 * 集めた取引先一覧の応答が、顧客と協力業者の両方の種別について取得され、いずれも成功したことを主張する
 */
function expectTradingPartnerListsLoaded(responses: Response[]): void {
  expect(responses.map((response) => response.status()).filter((status) => status !== 200)).toEqual(
    []
  );
  const requestedTypes = new Set(
    responses.flatMap((response) => new URL(response.url()).searchParams.getAll('type'))
  );
  expect(requestedTypes).toEqual(new Set(['CUSTOMER', 'SUBCONTRACTOR']));
}

/** 監理者の欄（combobox）が読み込みを終えて操作できるようになるのを待つ */
async function waitForSupervisorReady(page: Page) {
  const supervisor = page.getByRole('combobox', { name: '監理者' });
  await expect(supervisor).toBeEnabled({ timeout: getTimeout(10000) });
  return supervisor;
}

/**
 * 監理者の欄を開き、候補に顧客と協力業者の取引先が並ぶことを主張してから、指定の取引先を選ぶ
 */
async function selectSupervisor(page: Page, name: string): Promise<void> {
  const supervisor = await waitForSupervisorReady(page);
  await supervisor.click();
  const listbox = page.getByRole('listbox', { name: '取引先候補' });
  await expect(listbox.getByRole('option', { name: CUSTOMER_NAME, exact: true })).toHaveCount(1);
  await expect(listbox.getByRole('option', { name: SUBCONTRACTOR_NAME, exact: true })).toHaveCount(
    1
  );
  await listbox.getByRole('option', { name, exact: true }).click();
  await expect(supervisor).toHaveValue(name);
}

/** 詳細画面の「監理者」の値の表示 */
function detailSupervisorValue(page: Page) {
  return page.locator('span', { hasText: /^監理者$/ }).locator('xpath=following-sibling::span[1]');
}

/** 保存の後の詳細画面への遷移を待ち、監理者の名前の表示を主張する */
async function expectDetailShowsSupervisor(
  page: Page,
  contractId: string,
  name: string
): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/contracts/${contractId}$`), {
    timeout: getTimeout(10000),
  });
  await expect(page.getByRole('heading', { name: '契約書詳細', level: 1 })).toBeVisible({
    timeout: getTimeout(10000),
  });
  await expect(detailSupervisorValue(page)).toHaveText(name, { timeout: getTimeout(10000) });
}

/** 編集画面を開き、監理者の欄に指定の名前が表示されることを主張する */
async function expectEditShowsSupervisor(
  page: Page,
  contractId: string,
  name: string
): Promise<void> {
  const responses = collectTradingPartnerListResponses(page);
  await page.goto(`/projects/${projectId}/contracts/${contractId}/edit`);
  await expect(page.getByRole('heading', { name: '契約書編集', level: 1 })).toBeVisible({
    timeout: getTimeout(10000),
  });
  const supervisor = await waitForSupervisorReady(page);
  await expect(supervisor).toHaveValue(name, { timeout: getTimeout(10000) });
  expectTradingPartnerListsLoaded(responses);
}

/** 作成画面を開き、見積書の選択肢の読み込みを待つ */
async function openCreatePage(page: Page): Promise<void> {
  await page.goto(`/projects/${projectId}/contracts/new`);
  await expect(page.getByRole('heading', { name: '契約書作成', level: 1 })).toBeVisible({
    timeout: getTimeout(10000),
  });
  await expect(
    page.getByRole('combobox', { name: '見積書', exact: true }).locator('option', {
      hasText: ESTIMATE_NAME,
    })
  ).toHaveCount(1, { timeout: getTimeout(10000) });
}

/** 作成の釦を押し、作られた契約書の ID を返す */
async function submitCreate(page: Page): Promise<string> {
  const createResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/projects/${projectId}/contracts` &&
      response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: '作成', exact: true }).click();
  const response = await createResponse;
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { id: string };
  return body.id;
}

test.describe('契約書のフォームの監理者の選択', () => {
  // 各テストは自ら作った契約書か、DB を書き換えない測定だけを使い、互いに依らない
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
   * @requirement contract-management/REQ-3.8: 新規契約フォームに監理者となる取引先を検索・選択できるUIを提供する
   */
  test('新規契約で、監理者の候補に顧客と協力業者が並び、選んだ協力業者が詳細と編集に表示される (contract-management/REQ-3.8)', async ({
    page,
  }) => {
    const responses = collectTradingPartnerListResponses(page);
    await openCreatePage(page);

    await page
      .getByRole('combobox', { name: '見積書', exact: true })
      .selectOption({ label: ESTIMATE_NAME });
    await page.getByLabel('契約日', { exact: true }).fill('2026-03-01');
    await page.getByLabel('工期着手日', { exact: true }).fill('2026-03-10');
    await page.getByLabel('工期完成日', { exact: true }).fill('2026-09-30');
    await page.getByLabel('引渡日', { exact: true }).fill('2026-10-15');

    await selectSupervisor(page, SUBCONTRACTOR_NAME);
    expectTradingPartnerListsLoaded(responses);

    const contractId = await submitCreate(page);
    await expectDetailShowsSupervisor(page, contractId, SUBCONTRACTOR_NAME);
    expect(await readSupervisorIdFromDb(contractId)).toBe(subcontractorId);

    await expectEditShowsSupervisor(page, contractId, SUBCONTRACTOR_NAME);
  });

  /**
   * @requirement contract-management/REQ-5.3: 変更契約フォームに新規契約と同一の入力フィールド（監理者を含む）を提供する
   */
  test('変更契約で、基契約書の監理者が表示され、選び直した協力業者が詳細と編集に表示される (contract-management/REQ-5.3)', async ({
    page,
  }) => {
    const responses = collectTradingPartnerListResponses(page);
    await openCreatePage(page);

    await page.getByRole('radio', { name: '変更契約' }).check();
    const parentSelect = page.getByRole('combobox', { name: '基となる契約書' });
    await expect(parentSelect.locator(`option[value="${seededContractId}"]`)).toHaveCount(1, {
      timeout: getTimeout(10000),
    });
    await parentSelect.selectOption(seededContractId);

    // 基契約書の監理者（顧客）が既定値として名前で表示される
    const supervisor = await waitForSupervisorReady(page);
    await expect(supervisor).toHaveValue(CUSTOMER_NAME, { timeout: getTimeout(10000) });

    await selectSupervisor(page, SUBCONTRACTOR_NAME);
    expectTradingPartnerListsLoaded(responses);

    const contractId = await submitCreate(page);
    await expectDetailShowsSupervisor(page, contractId, SUBCONTRACTOR_NAME);
    expect(await readSupervisorIdFromDb(contractId)).toBe(subcontractorId);

    await expectEditShowsSupervisor(page, contractId, SUBCONTRACTOR_NAME);
  });

  /**
   * @requirement contract-management/REQ-9.1: 契約書編集画面に新規作成画面で入力した全項目を編集可能な状態で表示する
   */
  test('編集で、保存済みの監理者（顧客）の名前が表示され、協力業者へ選び直して保存すると詳細と編集に表示される (contract-management/REQ-9.1)', async ({
    page,
  }) => {
    // 編集の測定用に、監理者に顧客を選んだ新規契約を別に作る（他のテストの基契約書を書き換えない）
    const prisma = getPrismaClient();
    const editedContractId = (
      await prisma.contract.create({
        data: {
          projectId,
          contractType: 'NEW',
          status: 'BEFORE_CONTRACT',
          estimateId,
          contractDate: toDbDate('2026-04-01'),
          constructionStartDate: toDbDate('2026-04-10'),
          constructionEndDate: toDbDate('2026-10-31'),
          deliveryDate: toDbDate('2026-11-15'),
          taxRate: '0.1',
          supervisorTradingPartnerId: customerId,
          createdAt: toDbDate('2026-04-01'),
        },
      })
    ).id;

    await expectEditShowsSupervisor(page, editedContractId, CUSTOMER_NAME);

    await selectSupervisor(page, SUBCONTRACTOR_NAME);
    const updateResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/contracts/${editedContractId}` &&
        response.request().method() === 'PUT'
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    expect((await updateResponse).status()).toBe(200);

    await expectDetailShowsSupervisor(page, editedContractId, SUBCONTRACTOR_NAME);
    expect(await readSupervisorIdFromDb(editedContractId)).toBe(subcontractorId);

    await expectEditShowsSupervisor(page, editedContractId, SUBCONTRACTOR_NAME);
  });
});
