/**
 * @fileoverview 発注一覧と月別出来高の出力の記録の E2E テスト
 *
 * execution-budget-management タスク17.2。design.md の「Requirement 20: 案件の閲覧範囲と出力の記録の適用」の章。
 * 発注一覧と月別出来高の Excel・PDF はサーバーで生成する。サーバーはファイルを生成する前に出力の記録
 * （user-authentication の ExportAuditService）を 1 回行い、記録が失敗したときはファイルを返さず
 * 500 と識別子 `EXPORT_RECORD_FAILED` を返す。画面はその応答でダウンロードを始めず、エラーメッセージを表示する。
 * ブラウザからは記録の要求（`POST /api/v1/audit-logs/exports`）を送らない（二重の記録になるため）。
 *
 * 被覆する受入基準（execution-budget-management の Requirement 20.7・20.8）は各テストの `@requirement` の印が名乗る。
 *
 * 記録は DB の監査 `DATA_EXPORTED`（実行者・種別・案件・対象）で確かめる。記録の失敗は、サーバー生成のため
 * 出力の要求そのものを route で記録の失敗の応答（500・EXPORT_RECORD_FAILED）にして起こす。apiClient は 500 を
 * 再送するため、失敗側の出力の要求の回数は 1 以上で見る。通信の観測は URL のパスで照合する
 * （CI とローカルで API のオリジンが異なるため）。
 *
 * 検証に使う案件・見積書・契約・実行予算・発注・出来高はテストの中で DB に作り（名前の接頭辞 `NAME_PREFIX`）、
 * 利用者はテストの中で作る一意のメールアドレスの利用者（営業担当者・作成者）とする。
 * 後始末で案件を先に消してから取引先と利用者を消す。
 */

import { randomBytes } from 'node:crypto';
import { test, expect, type Page, type Request } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import { createSessionUser, deleteSessionUsers } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/** テストの中で作る案件・取引先の名前の接頭辞（後始末で消す） */
const NAME_PREFIX = 'e2e-eb-export-audit-';

/** ブラウザで生成する出力の記録の経路（本機能の出力では使わない） */
const RECORD_PATH = '/api/v1/audit-logs/exports';

/** 記録の失敗で表示するエラーメッセージ（Requirement 20.8） */
const RECORD_FAILED_MESSAGE = '出力を記録できなかったため中止しました';

interface Fixture {
  projectId: string;
  budgetId: string;
  orderId: string;
}

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

/** 案件・見積書・契約・実行予算（2 項目）・発注（チェック済み 1 件）・出来高記録（1 か月）を DB に作る */
async function createFixture(ownerId: string): Promise<Fixture> {
  const prisma = getPrismaClient();
  const suffix = uniqueSuffix();
  const partner = await prisma.tradingPartner.create({
    data: {
      name: `${NAME_PREFIX}partner-${suffix}`,
      nameKana: 'イーツーイーキョウリョクギョウシャ',
      address: '東京都千代田区1-1-1',
      types: { create: [{ type: 'SUBCONTRACTOR' }] },
    },
    select: { id: true },
  });
  const project = await prisma.project.create({
    data: { name: `${NAME_PREFIX}${suffix}`, salesPersonId: ownerId, createdById: ownerId },
    select: { id: true },
  });
  const estimate = await prisma.estimate.create({
    data: { projectId: project.id, name: '出力の記録の検証の見積書' },
    select: { id: true },
  });
  const contract = await prisma.contract.create({
    data: {
      projectId: project.id,
      contractType: 'NEW',
      status: 'CONTRACTED',
      estimateId: estimate.id,
      contractDate: new Date('2026-01-01'),
      constructionStartDate: new Date('2026-02-01'),
      constructionEndDate: new Date('2026-12-31'),
      deliveryDate: new Date('2027-01-15'),
      taxRate: 0.1,
      contractAmount: 22000,
      constructionPrice: 20000,
      taxAmount: 2000,
    },
    select: { id: true },
  });
  const budget = await prisma.executionBudget.create({
    data: { projectId: project.id, contractId: contract.id },
    select: { id: true },
  });
  const itemIds: string[] = [];
  for (const [index, unit] of ['m2', 'm3'].entries()) {
    const item = await prisma.executionBudgetItem.create({
      data: {
        executionBudgetId: budget.id,
        displayOrder: index,
        name: `出力の記録の検証の予算項目 ${index + 1}-${suffix}`,
        unit,
        quantity: 10,
        executionUnitPrice: 1000,
        executionAmount: 10000,
      },
      select: { id: true },
    });
    itemIds.push(item.id);
  }
  const order = await prisma.order.create({
    data: {
      executionBudgetId: budget.id,
      tradingPartnerId: partner.id,
      items: {
        create: [
          { executionBudgetItemId: itemIds[0]!, checked: true },
          { executionBudgetItemId: itemIds[1]!, checked: false },
        ],
      },
    },
    select: { id: true },
  });
  await prisma.progressRecord.create({
    data: {
      executionBudgetId: budget.id,
      constructionDate: new Date('2026-10-01'),
      items: { create: [{ executionBudgetItemId: itemIds[0]!, amount: 3000 }] },
    },
  });
  return { projectId: project.id, budgetId: budget.id, orderId: order.id };
}

/** 利用者が残した監査 DATA_EXPORTED の行 */
async function exportRecords(actorId: string) {
  return getPrismaClient().auditLog.findMany({
    where: { action: 'DATA_EXPORTED', actorId },
    orderBy: { createdAt: 'asc' },
  });
}

/** 出力の要求・ブラウザからの記録の要求・ダウンロードを数える */
function observe(page: Page, exportPath: string) {
  const counts = { exportRequests: 0, recordRequests: 0, downloads: 0 };
  page.on('request', (req: Request) => {
    const path = new URL(req.url()).pathname;
    if (req.method() === 'GET' && path === exportPath) {
      counts.exportRequests += 1;
    }
    if (req.method() === 'POST' && path === RECORD_PATH) {
      counts.recordRequests += 1;
    }
  });
  page.on('download', () => {
    counts.downloads += 1;
  });
  return counts;
}

/** 出力の要求を、サーバーの記録の失敗の応答（ファイルを含まない 500）にする */
async function failExportRecord(page: Page, exportPath: string): Promise<void> {
  await page.route(
    (url) => url.pathname === exportPath,
    (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'https://architrack.example.com/problems/internal-server-error',
          title: 'Internal Server Error',
          status: 500,
          detail: RECORD_FAILED_MESSAGE,
          code: 'EXPORT_RECORD_FAILED',
        }),
      })
  );
}

test.describe('発注一覧と月別出来高の出力の記録', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    const prisma = getPrismaClient();
    // 実行予算・項目・発注・出来高・契約・見積書は案件の削除に連なって消える
    const budgetWhere = { executionBudget: { project: { name: { startsWith: NAME_PREFIX } } } };
    await prisma.orderItem.deleteMany({ where: { order: budgetWhere } });
    await prisma.progressRecordItem.deleteMany({ where: { progressRecord: budgetWhere } });
    await prisma.project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await prisma.tradingPartner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
  });

  /**
   * @requirement execution-budget-management/REQ-20.7
   */
  test('発注詳細画面の Excel 出力と PDF 出力は、出力のたびに種別・案件・発注つきの記録を 1 件残し、ブラウザからは記録を要求しない', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const fixture = await createFixture(owner.id);
    const exportPath = `/api/projects/${fixture.projectId}/execution-budget/orders/${fixture.orderId}/export`;
    const counts = observe(page, exportPath);

    await loginAsUser(page, owner);
    await page.goto(`/projects/${fixture.projectId}/execution-budget/orders/${fixture.orderId}`);

    for (const [buttonName, recordCount] of [
      ['Excel出力', 1],
      ['PDF出力', 2],
    ] as const) {
      const button = page.getByRole('button', { name: buttonName });
      await expect(button).toBeVisible({ timeout: getTimeout(15000) });
      const response = page.waitForResponse(
        (r) => new URL(r.url()).pathname === exportPath && r.request().method() === 'GET',
        { timeout: getTimeout(30000) }
      );
      await button.click();
      expect((await response).status()).toBe(200);

      await expect
        .poll(async () => (await exportRecords(owner.id)).length, {
          timeout: getTimeout(15000),
        })
        .toBe(recordCount);
    }

    const records = await exportRecords(owner.id);
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record).toMatchObject({ targetType: 'Project', targetId: fixture.projectId });
      expect(record.metadata).toMatchObject({
        kind: 'order_export',
        projectId: fixture.projectId,
        targetIds: [fixture.orderId],
        itemCount: 1,
      });
    }
    expect(counts.exportRequests).toBe(2);
    expect(counts.recordRequests).toBe(0);
    await expect(page.getByText(RECORD_FAILED_MESSAGE)).toHaveCount(0);
  });

  /**
   * @requirement execution-budget-management/REQ-20.7
   */
  test('出来高入力画面の Excel 出力と PDF 出力は、出力のたびに種別・案件・実行予算つきの記録を 1 件残し、ブラウザからは記録を要求しない', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const fixture = await createFixture(owner.id);
    const exportPath = `/api/projects/${fixture.projectId}/execution-budget/progress/monthly/export`;
    const counts = observe(page, exportPath);

    await loginAsUser(page, owner);
    await page.goto(`/projects/${fixture.projectId}/execution-budget/progress`);
    await expect(page.getByRole('heading', { name: '月別出来高集計' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    for (const [buttonName, recordCount] of [
      ['Excel', 1],
      ['PDF', 2],
    ] as const) {
      const response = page.waitForResponse(
        (r) => new URL(r.url()).pathname === exportPath && r.request().method() === 'GET',
        { timeout: getTimeout(30000) }
      );
      await page.getByRole('button', { name: buttonName, exact: true }).click();
      expect((await response).status()).toBe(200);

      await expect
        .poll(async () => (await exportRecords(owner.id)).length, {
          timeout: getTimeout(15000),
        })
        .toBe(recordCount);
    }

    const records = await exportRecords(owner.id);
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record).toMatchObject({ targetType: 'Project', targetId: fixture.projectId });
      expect(record.metadata).toMatchObject({
        kind: 'progress_export',
        projectId: fixture.projectId,
        targetIds: [fixture.budgetId],
        itemCount: 1,
      });
    }
    expect(counts.exportRequests).toBe(2);
    expect(counts.recordRequests).toBe(0);
    await expect(page.getByText(RECORD_FAILED_MESSAGE)).toHaveCount(0);
  });

  /**
   * @requirement execution-budget-management/REQ-20.8
   */
  test('発注詳細画面は出力の記録の失敗の応答でダウンロードを始めず、出力を記録できなかった旨を表示する', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const fixture = await createFixture(owner.id);
    const exportPath = `/api/projects/${fixture.projectId}/execution-budget/orders/${fixture.orderId}/export`;
    const counts = observe(page, exportPath);
    await failExportRecord(page, exportPath);

    await loginAsUser(page, owner);
    await page.goto(`/projects/${fixture.projectId}/execution-budget/orders/${fixture.orderId}`);
    const button = page.getByRole('button', { name: 'Excel出力' });
    await expect(button).toBeVisible({ timeout: getTimeout(15000) });
    await button.click();

    await expect(page.getByRole('alert').filter({ hasText: RECORD_FAILED_MESSAGE })).toBeVisible({
      timeout: getTimeout(30000),
    });
    expect(counts.exportRequests).toBeGreaterThan(0);
    expect(counts.recordRequests).toBe(0);
    expect(counts.downloads).toBe(0);
  });

  /**
   * @requirement execution-budget-management/REQ-20.8
   */
  test('出来高入力画面は出力の記録の失敗の応答でダウンロードを始めず、出力を記録できなかった旨を表示する', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const fixture = await createFixture(owner.id);
    const exportPath = `/api/projects/${fixture.projectId}/execution-budget/progress/monthly/export`;
    const counts = observe(page, exportPath);
    await failExportRecord(page, exportPath);

    await loginAsUser(page, owner);
    await page.goto(`/projects/${fixture.projectId}/execution-budget/progress`);
    await expect(page.getByRole('heading', { name: '月別出来高集計' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await page.getByRole('button', { name: 'PDF', exact: true }).click();

    await expect(page.getByText(RECORD_FAILED_MESSAGE)).toBeVisible({
      timeout: getTimeout(30000),
    });
    await expect(page.getByText('PDFエクスポートに失敗しました')).toHaveCount(0);
    expect(counts.exportRequests).toBeGreaterThan(0);
    expect(counts.recordRequests).toBe(0);
    expect(counts.downloads).toBe(0);
  });
});
