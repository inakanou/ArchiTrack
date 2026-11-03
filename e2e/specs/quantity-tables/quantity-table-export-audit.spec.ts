/**
 * @fileoverview 数量表の PDF の出力の事前記録の E2E テスト
 *
 * quantity-table-generation タスク104.2。design.md の「Requirement 50: 案件の閲覧範囲と出力の記録の適用」の章。
 * 数量表の編集画面の PDF 出力は、生成を始める前に `POST /api/v1/audit-logs/exports`（user-authentication の
 * ExportAuditService）へ出力の記録を要求し、記録が成功したときだけ生成とダウンロードを始める。
 * 記録の要求が失敗したときは生成もダウンロードも始めず、エラーメッセージを表示する。
 *
 * 被覆する受入基準（quantity-table-generation の Requirement 50.8・50.9）は各テストの `@requirement` の印が名乗る。
 *
 * 通信の観測は URL のパスで照合する（CI とローカルで API のオリジンが異なるため）。
 * 生成の始まりは、PDF の生成が送る写真の原本の取得（fetch）で観測する。原本の URL は数量表の詳細の応答の
 * `surveyImage.originalUrl` から得る。画面のサムネイルの読み込みは img 要素（resourceType が image）であり数えない。
 *
 * 検証に使う案件・現場調査・数量表はテストの中で DB に作り（名前の接頭辞 `NAME_PREFIX`）、利用者はテストの中で
 * 作る一意のメールアドレスの利用者（営業担当者・作成者）とする。後始末で案件を先に消してから利用者を消す。
 */

import { randomBytes } from 'node:crypto';
import { test, expect, type Page, type Request } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import {
  createSessionUser,
  deleteSessionUsers,
  type CreatedUser,
} from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/** テストの中で作る案件の名前の接頭辞（後始末で消す） */
const NAME_PREFIX = 'e2e-qt-export-audit-';

/** 出力の記録の経路（user-authentication タスク53.3） */
const RECORD_PATH = '/api/v1/audit-logs/exports';

/** 記録の失敗で表示するエラーメッセージ（Requirement 50.9） */
const RECORD_FAILED_MESSAGE = '出力を記録できなかったため中止しました';

interface Fixture {
  projectId: string;
  quantityTableId: string;
  quantityTableName: string;
}

/** URL からパスを取り出す（解釈できなければ null） */
function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/** 案件・現場調査（画像 1 枚）・数量表（写真を紐付けたグループ 1 つ・項目 1 つ）を DB に作る */
async function createFixture(owner: CreatedUser): Promise<Fixture> {
  const prisma = getPrismaClient();
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const project = await prisma.project.create({
    data: { name: `${NAME_PREFIX}${suffix}`, salesPersonId: owner.id, createdById: owner.id },
    select: { id: true },
  });
  const survey = await prisma.siteSurvey.create({
    data: {
      projectId: project.id,
      name: '出力の事前記録の現場調査',
      surveyDate: new Date('2026-10-01'),
    },
    select: { id: true },
  });
  const image = await prisma.surveyImage.create({
    data: {
      surveyId: survey.id,
      originalPath: `surveys/${survey.id}/export-audit.jpg`,
      thumbnailPath: `surveys/${survey.id}/export-audit-thumb.jpg`,
      fileName: 'export-audit.jpg',
      fileSize: 1024,
      width: 800,
      height: 600,
      displayOrder: 0,
    },
    select: { id: true },
  });
  const quantityTableName = `出力の事前記録の数量表 ${suffix}`;
  const table = await prisma.quantityTable.create({
    data: { projectId: project.id, name: quantityTableName },
    select: { id: true },
  });
  const group = await prisma.quantityGroup.create({
    data: {
      quantityTableId: table.id,
      name: '出力の事前記録のグループ',
      surveyImageId: image.id,
      displayOrder: 0,
    },
    select: { id: true },
  });
  await prisma.quantityItem.create({
    data: {
      quantityGroupId: group.id,
      majorCategory: '土工事',
      workType: '掘削',
      name: '出力の事前記録の項目',
      unit: 'm3',
      quantity: 1,
      displayOrder: 0,
    },
  });
  return { projectId: project.id, quantityTableId: table.id, quantityTableName };
}

/** 出力の操作で観測した出来事 */
type ExportEvent = 'record-request' | 'record-response' | 'generation-request' | 'download';

/**
 * 数量表の編集画面を開き、表示が落ち着いてから出力の操作の観測を始める
 *
 * 写真の原本の URL は数量表の詳細の応答から得る（生成の始まりの観測先）。
 */
async function openEditAndObserve(page: Page, fixture: Fixture) {
  const detailResponse = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      pathOf(r.url()) === `/api/quantity-tables/${fixture.quantityTableId}`,
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/quantity-tables/${fixture.quantityTableId}/edit`);
  const detail = await detailResponse;
  expect(detail.status(), '前提: 数量表の詳細を取得できる').toBe(200);
  const body = (await detail.json()) as {
    groups: Array<{ surveyImage: { originalUrl: string } | null }>;
  };
  const originalUrl = body.groups[0]?.surveyImage?.originalUrl ?? null;
  expect(originalUrl, '前提: グループに写真が紐付き、原本の URL が返る').toBeTruthy();
  const originalPath = pathOf(new URL(originalUrl!, page.url()).toString());

  await expect(page.getByRole('textbox', { name: '数量表名' })).toHaveValue(
    fixture.quantityTableName,
    { timeout: getTimeout(15000) }
  );
  await page.waitForLoadState('networkidle');

  const events: ExportEvent[] = [];
  const recordRequestBodies: unknown[] = [];
  const recordStatuses: number[] = [];
  const isGenerationRequest = (request: Request): boolean =>
    (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') &&
    pathOf(request.url()) === originalPath;

  page.on('request', (request) => {
    if (pathOf(request.url()) === RECORD_PATH && request.method() === 'POST') {
      events.push('record-request');
      recordRequestBodies.push(request.postDataJSON());
    } else if (isGenerationRequest(request)) {
      events.push('generation-request');
    }
  });
  page.on('response', (response) => {
    if (pathOf(response.url()) === RECORD_PATH && response.request().method() === 'POST') {
      events.push('record-response');
      recordStatuses.push(response.status());
    }
  });
  page.on('download', () => {
    events.push('download');
  });

  return { events, recordRequestBodies, recordStatuses };
}

/** 記録の要求だけを 500（記録の失敗）にし、要求の回数を返す関数を返す */
async function failExportRecords(page: Page): Promise<() => number> {
  let attempts = 0;
  await page.route('**/api/v1/audit-logs/exports', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    attempts += 1;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Export record failed', code: 'EXPORT_RECORD_FAILED' }),
    });
  });
  return () => attempts;
}

test.describe('数量表の PDF の出力の事前記録', () => {
  test.afterEach(async () => {
    // 数量表・数量グループ・数量項目・現場調査・現調画像は案件の削除に連なって消える
    await getPrismaClient().project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
  });

  /**
   * @requirement quantity-table-generation/REQ-50.8
   */
  test('数量表の PDF の出力が生成より前に出力の記録を種別・案件つきで1回要求する', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const fixture = await createFixture(owner);
    await loginAsUser(page, owner);
    const observed = await openEditAndObserve(page, fixture);

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });
    await page.getByRole('button', { name: 'PDF出力' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`${fixture.quantityTableName}.pdf`);

    const firstGeneration = observed.events.indexOf('generation-request');
    expect(firstGeneration, '前提: PDF の生成が写真の原本の取得を送る').toBeGreaterThanOrEqual(0);

    expect(
      observed.recordStatuses,
      'REQ-50.8: 数量表の PDF の出力が出力の記録を 1 回要求し、201 で記録される'
    ).toEqual([201]);
    expect(observed.recordRequestBodies, 'REQ-50.8: 記録の要求は 1 回だけ').toHaveLength(1);
    expect(observed.recordRequestBodies[0]).toEqual({
      kind: 'quantity_table_pdf',
      projectId: fixture.projectId,
      targetIds: [fixture.quantityTableId],
      itemCount: 1,
    });

    const recordResponse = observed.events.indexOf('record-response');
    expect(recordResponse, 'REQ-50.8: 記録の応答が生成の始まりより前に返る').toBeLessThan(
      firstGeneration
    );
    expect(recordResponse).toBeLessThan(observed.events.indexOf('download'));
  });

  /**
   * @requirement quantity-table-generation/REQ-50.9
   */
  test('出力の記録が失敗すると数量表の PDF を生成もダウンロードもせずエラーメッセージを表示する', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const fixture = await createFixture(owner);
    await loginAsUser(page, owner);
    const recordAttempts = await failExportRecords(page);
    const observed = await openEditAndObserve(page, fixture);

    const pdfButton = page.getByRole('button', { name: 'PDF出力' });
    await pdfButton.click();

    await expect(
      page.getByRole('alert').filter({ hasText: RECORD_FAILED_MESSAGE }),
      `REQ-50.9: 記録の失敗で「${RECORD_FAILED_MESSAGE}」が表示される`
    ).toBeVisible({ timeout: getTimeout(30000) });
    // 記録の要求は非冪等なので API クライアントは送り直さない。失敗の応答でも回数はちょうど 1 回
    expect(
      recordAttempts(),
      '記録の要求はちょうど 1 回送られ、失敗の応答を受けても送り直されない'
    ).toBe(1);
    await expect(pdfButton).toBeEnabled();
    await expect(pdfButton).toHaveText('PDF出力');

    expect(
      observed.events.filter((event) => event === 'generation-request'),
      'REQ-50.9: 記録の失敗の後に PDF の生成（写真の原本の取得）が始まらない'
    ).toEqual([]);
    expect(
      observed.events.filter((event) => event === 'download'),
      'REQ-50.9: 記録の失敗の後にダウンロードが始まらない'
    ).toEqual([]);
  });
});
