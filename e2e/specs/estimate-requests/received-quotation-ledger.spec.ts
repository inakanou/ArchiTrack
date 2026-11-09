/**
 * @fileoverview 受領見積書の台帳の項目と、案件の受領見積書の一覧の画面の E2E テスト
 *
 * estimate-request タスク120.1。design.md の章「Requirements 43-50: 受領見積書の台帳の項目と IPA の是正
 * （2026-11-08 の追加）」の Testing Strategy の E2E。実際の画面とバックエンドを通して、次を確かめる。
 *
 * - 案件の受領見積書の一覧の画面（`/projects/:projectId/quotations`）の列・空の表示・パンくず・見積依頼への遷移、
 *   範囲外の 404 の表示と権限の無い利用者の拒否、見積依頼に紐づく行に編集・削除が無いこと
 * - 見積依頼の無い受領見積書を、業者名の候補の選択と自由な入力で登録・編集・削除する流れ（業者名の必須を含む）
 * - 見積依頼の詳細からの登録で、業者名が宛先の取引先の名前で編集できないこと
 * - 明細行の区分と別途を除く合計・小計、単価が空の行の金額の入力、条件・換算・参考の印と理由・分類キーの保存、
 *   保存の前の拒否の文言
 * - 台帳の情報の欄（既定で閉じる）の入力と保存、読取の確認の記録と、明細行の変更で未確認へ戻ること
 * - 同じファイルの二度目の登録の拒否と、見積の区別を変えた登録の知らせ
 * - 画面以外の経路で入った金額・数量表の行のキーが画面の保存で保たれること
 *
 * 被覆する受入基準は各テストの `@requirement` の印が名乗る（印の無い受入基準は名乗らない）。
 *
 * 検証に使う案件・取引先・見積依頼・受領見積書はテストの中で作り（名前の接頭辞 `NAME_PREFIX`）、利用者は
 * テストの中で作る一意のメールアドレスの利用者とする。共有の DB を他の試験と同時に使うため、DB の主張は
 * 自分の案件・自分の行に絞り、DB 全体の件数を主張しない（タスク115.1 の申し送り）。
 */

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect, type Page, type Request, type Response } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import {
  SESSION_USER_EMAIL_PREFIX,
  createCustomUser,
  createSessionUser,
  deleteSessionUsers,
  type CreatedUser,
} from '../../fixtures/auth.fixtures';
import { loginAsUser, submitSessionExpiredTwoFactorCode } from '../../helpers/auth-actions';
import { loginViaApi } from '../../helpers/auth-api';
import { breadcrumbNav, readBreadcrumbTrail } from '../../helpers/breadcrumb';
import { TEST_USERS } from '../../helpers/test-users';
import { API_BASE_URL } from '../../config';
import { getTimeout } from '../../helpers/wait-helpers';

/** テストの中で作る案件・取引先・受領見積書の名前の接頭辞（後始末で消す） */
const NAME_PREFIX = 'e2e-rq-ledger-';

/** テストの中で作るロールの名前の接頭辞（後始末で消す） */
const ROLE_NAME_PREFIX = 'e2e-rq-ledger-role-';

/** どの行としても存在しない ID（版 4・変種 8 の整った UUID） */
const MISSING_ID = '00000000-0000-4000-8000-000000120101';

/** 原本の指紋を比べる 2 つのファイル（内容の違う PDF） */
const PDF_A = 'e2e/fixtures/test-file.pdf';
const PDF_B = 'e2e/fixtures/test-text-pdf.pdf';

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

/** ファイルの内容の SHA-256（16 進の小文字） */
function sha256Of(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

// ============================================================================
// DB の前提
// ============================================================================

interface Partner {
  id: string;
  name: string;
}

interface ProjectRef {
  id: string;
  name: string;
}

/** 協力業者の取引先を DB に作る */
async function createPartner(label: string): Promise<Partner> {
  const name = `${NAME_PREFIX}業者-${label}-${uniqueSuffix()}`;
  const partner = await getPrismaClient().tradingPartner.create({
    data: {
      name,
      nameKana: 'イーツーイーダイチョウギョウシャ',
      address: '東京都千代田区1-1-1',
      email: 'e2e-rq-ledger-partner@example.com',
      types: { create: [{ type: 'SUBCONTRACTOR' }] },
    },
    select: { id: true, name: true },
  });
  return partner;
}

/** 利用者を営業担当者・作成者とする案件を DB に作る（利用者の閲覧範囲に入る） */
async function createProject(owner: CreatedUser, label: string): Promise<ProjectRef> {
  const name = `${NAME_PREFIX}${label}-${uniqueSuffix()}`;
  const project = await getPrismaClient().project.create({
    data: { name, salesPersonId: owner.id, createdById: owner.id },
    select: { id: true, name: true },
  });
  return project;
}

/** 内訳書の全項目を選んだ見積依頼を DB に作る */
async function createEstimateRequest(
  projectId: string,
  tradingPartnerId: string,
  label: string
): Promise<{ id: string; name: string }> {
  const prisma = getPrismaClient();
  const statement = await prisma.itemizedStatement.create({
    data: {
      projectId,
      name: `台帳の検証の内訳書 ${label}`,
      sourceQuantityTableId: `${NAME_PREFIX}${label}-qt`,
      sourceQuantityTableName: `${label} の数量表`,
      items: {
        create: [
          { workType: '内装工事', name: '床の張替え', unit: 'm2', quantity: 12, displayOrder: 1 },
          { workType: '塗装工事', name: '壁の塗装', unit: 'm2', quantity: 30, displayOrder: 2 },
        ],
      },
    },
    select: { id: true },
  });
  const items = await prisma.itemizedStatementItem.findMany({
    where: { itemizedStatementId: statement.id },
    select: { id: true },
  });
  const name = `${NAME_PREFIX}見積依頼-${label}-${uniqueSuffix()}`;
  const created = await prisma.estimateRequest.create({
    data: {
      projectId,
      tradingPartnerId,
      itemizedStatementId: statement.id,
      name,
      selectedItems: {
        create: items.map((item) => ({ itemizedStatementItemId: item.id, selected: true })),
      },
    },
    select: { id: true },
  });
  return { id: created.id, name };
}

/** 自分の案件の受領見積書を名前で引く（明細行は表示順） */
async function findOwnQuotation(projectId: string, name: string) {
  return getPrismaClient().receivedQuotation.findFirstOrThrow({
    where: { projectId, name },
    include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
  });
}

/** 自分の案件の受領見積書の名前の並び（論理削除されていないもの） */
async function ownQuotationNames(projectId: string): Promise<string[]> {
  const rows = await getPrismaClient().receivedQuotation.findMany({
    where: { projectId, deletedAt: null },
    select: { name: true },
  });
  // 並びは DB の照合順序に依らず JS の比較で決める（主張の側も .sort() で作る）
  return rows.map((row) => row.name).sort();
}

/** 権限を ID で引く（無ければ前提の誤りとして失敗する） */
async function permissionId(resource: string, action: string): Promise<string> {
  const permission = await getPrismaClient().permission.findFirst({
    where: { resource, action },
    select: { id: true },
  });
  if (!permission) {
    throw new Error(`権限 ${resource}:${action} が見つかりません（検証の前提の誤り）`);
  }
  return permission.id;
}

/** 指定の権限だけを持つロールの利用者を作る */
async function createLimitedUser(
  label: string,
  permissions: ReadonlyArray<readonly [string, string]>
): Promise<CreatedUser> {
  const prisma = getPrismaClient();
  const role = await prisma.role.create({
    data: {
      name: `${ROLE_NAME_PREFIX}${label}-${uniqueSuffix()}`,
      description: `E2E 受領見積書の台帳の検証（${label}）`,
      priority: 0,
      isSystem: false,
    },
    select: { id: true, name: true },
  });
  for (const [resource, action] of permissions) {
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: await permissionId(resource, action) },
    });
  }
  return createCustomUser({
    email: `${SESSION_USER_EMAIL_PREFIX}rq-ledger-${label}-${uniqueSuffix()}@example.com`,
    password: TEST_USERS.REGULAR_USER.password,
    displayName: `受領見積書の台帳の検証 ${label}`,
    roles: [role.name],
  });
}

// ============================================================================
// 画面の操作
// ============================================================================

/** 案件の受領見積書の一覧の画面を開き、一覧の取得の応答の状態を返す */
async function openProjectQuotations(page: Page, projectId: string): Promise<number> {
  const loaded = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === `/api/projects/${projectId}/quotations`,
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/projects/${projectId}/quotations`);
  return (await loaded).status();
}

/** 一覧の画面の本体が出るまで待つ */
async function expectListPage(page: Page): Promise<void> {
  await expect(page.getByTestId('project-received-quotation-list-page')).toBeVisible({
    timeout: getTimeout(15000),
  });
}

/** 一覧の画面の登録の釦からフォームを開く */
async function openRegisterForm(page: Page): Promise<void> {
  await page.getByRole('button', { name: '受領見積書登録', exact: true }).click();
  await expect(page.getByRole('heading', { name: '受領見積書の登録' })).toBeVisible({
    timeout: getTimeout(10000),
  });
}

/** 一覧の行の編集の釦からフォームを開く */
async function openEditForm(page: Page, quotationName: string): Promise<void> {
  await page.getByRole('button', { name: `${quotationName}を編集`, exact: true }).click();
  await expect(page.getByRole('heading', { name: '受領見積書の編集' })).toBeVisible({
    timeout: getTimeout(10000),
  });
}

/** 案件の文脈の業者名の入力欄 */
function vendorInput(page: Page) {
  return page.getByRole('combobox', { name: '業者名' });
}

/** 明細行の欄（aria-label の完全一致） */
function lineField(page: Page, row: number, field: string) {
  return page.getByLabel(`行${row} ${field}`, { exact: true });
}

/** 明細行の詳細の欄を開く */
async function openLineDetail(page: Page, row: number): Promise<void> {
  await page.getByRole('button', { name: `行${row}の操作メニュー`, exact: true }).click();
  await page.getByRole('menuitem', { name: '詳細', exact: true }).click();
  await expect(page.getByRole('group', { name: `行${row}の詳細`, exact: true })).toBeVisible();
  // 開くと次の描画で条件の欄へフォーカスが移る。移る前に他の欄へ打つと、
  // 移った先（条件）へ文字が入るため、移ったことを確かめてから入力へ進む
  await expect(lineField(page, row, '条件')).toBeFocused();
}

/** 台帳の情報の欄の見出し（開閉の釦） */
function ledgerHeader(page: Page) {
  return page.getByTestId('ledger-info-section-header');
}

/** 案件の文脈の登録の保存を押し、その POST の応答を返す */
async function submitProjectCreate(page: Page, projectId: string): Promise<Response> {
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === `/api/projects/${projectId}/quotations`,
    { timeout: getTimeout(30000) }
  );
  await page.getByRole('button', { name: '登録', exact: true }).click();
  return response;
}

/** 編集の保存を押し、その PUT の応答を返す */
async function submitUpdate(page: Page, quotationId: string): Promise<Response> {
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === 'PUT' &&
      new URL(r.url()).pathname === `/api/quotations/${quotationId}`,
    { timeout: getTimeout(30000) }
  );
  await page.getByRole('button', { name: '更新', exact: true }).click();
  return response;
}

/** フォームが閉じたこと（登録・編集の見出しが消えた） */
async function expectFormClosed(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: /^受領見積書の(登録|編集)$/ })).toHaveCount(0, {
    timeout: getTimeout(20000),
  });
}

/** 一覧の行 */
function listRow(page: Page, quotationId: string) {
  return page.getByTestId(`project-quotation-row-${quotationId}`);
}

/** 指定のパスへの指定の方法の要求を数える */
function countRequests(page: Page, method: string, pathname: string): Request[] {
  const seen: Request[] = [];
  page.on('request', (req) => {
    if (req.method() === method && new URL(req.url()).pathname === pathname) {
      seen.push(req);
    }
  });
  return seen;
}

/** Node 側で画面と同じ書式（ja-JP の年月日と時分）の日時の文字を作る */
function formatJaDateTime(date: Date): string {
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// テスト
// ============================================================================

test.describe('受領見積書の台帳の項目と案件の受領見積書の一覧', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    const prisma = getPrismaClient();
    // 受領見積書は案件を onDelete: Restrict で指すため先に消す（design の D1）。案件の無い受領見積書は名前で消す
    await prisma.receivedQuotation.deleteMany({
      where: {
        OR: [
          { project: { name: { startsWith: NAME_PREFIX } } },
          { name: { startsWith: NAME_PREFIX } },
        ],
      },
    });
    await prisma.project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await prisma.tradingPartner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
    await prisma.role.deleteMany({ where: { name: { startsWith: ROLE_NAME_PREFIX } } });
  });

  /**
   * @requirement estimate-request/REQ-43.1
   * @requirement estimate-request/REQ-43.2
   * @requirement estimate-request/REQ-43.3
   * @requirement estimate-request/REQ-43.4
   * @requirement estimate-request/REQ-43.5
   * @requirement estimate-request/REQ-43.10
   * @requirement estimate-request/REQ-43.15
   * @requirement estimate-request/REQ-44.8
   */
  test('一覧の画面は見積依頼の有無を問わず案件の受領見積書を列とパンくずで示し、依頼に紐づく行は依頼の詳細へ遷移して編集・削除を持たない', async ({
    page,
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const partner = await createPartner('list');
    const project = await createProject(owner, 'list');
    const emptyProject = await createProject(owner, 'list-empty');
    const estimateRequest = await createEstimateRequest(project.id, partner.id, 'list');
    const prisma = getPrismaClient();
    const linked = await prisma.receivedQuotation.create({
      data: {
        estimateRequestId: estimateRequest.id,
        projectId: project.id,
        vendorName: partner.name,
        tradingPartnerId: partner.id,
        name: `${NAME_PREFIX}依頼あり`,
        submittedAt: new Date('2026-10-01'),
        netAmount: 12345,
      },
      select: { id: true, createdAt: true },
    });
    const requestLess = await prisma.receivedQuotation.create({
      data: {
        projectId: project.id,
        vendorName: partner.name,
        tradingPartnerId: partner.id,
        name: `${NAME_PREFIX}依頼なしの見積`,
        submittedAt: new Date('2026-10-02'),
      },
      select: { id: true, createdAt: true, updatedAt: true },
    });
    // 論理削除したものは載らない
    await prisma.receivedQuotation.create({
      data: {
        projectId: project.id,
        vendorName: '削除済みの業者',
        name: `${NAME_PREFIX}削除済み`,
        submittedAt: new Date('2026-10-03'),
        deletedAt: new Date(),
      },
    });
    // 紐づく取引先の名前を変え、論理削除しても、受領見積書の業者名は変わらない（44.8）
    await prisma.tradingPartner.update({
      where: { id: partner.id },
      data: { name: `${partner.name}-改名`, deletedAt: new Date() },
    });

    await loginAsUser(page, owner);

    // 空の案件: 空の旨と登録の釦
    expect(await openProjectQuotations(page, emptyProject.id)).toBe(200);
    await expectListPage(page);
    await expect(page.getByTestId('project-quotation-empty')).toHaveText(
      '受領見積書はまだありません'
    );
    await expect(page.getByTestId('project-quotation-table')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '受領見積書登録', exact: true })).toBeVisible();

    // 受領見積書のある案件
    expect(await openProjectQuotations(page, project.id)).toBe(200);
    await expectListPage(page);
    expect(await readBreadcrumbTrail(breadcrumbNav(page))).toEqual([
      'ダッシュボード',
      'プロジェクト一覧',
      project.name,
      '受領見積書',
    ]);
    await expect(page.getByRole('heading', { level: 1, name: '受領見積書' })).toBeVisible();
    await expect(page.getByRole('columnheader')).toHaveText([
      '受領見積書名',
      '業者名',
      '提出日',
      '見積依頼名',
      'NET金額',
      '登録日時',
      '台帳の状態',
      '操作',
    ]);
    await expect(page.getByTestId('project-quotation-table').locator('tbody tr')).toHaveCount(2);
    await expect(page.getByTestId('project-quotation-empty')).toHaveCount(0);

    const linkedRow = listRow(page, linked.id);
    await expect(linkedRow.getByRole('cell')).toHaveText([
      `${NAME_PREFIX}依頼あり`,
      partner.name,
      '2026/10/01',
      estimateRequest.name,
      '12,345円',
      formatJaDateTime(linked.createdAt),
      '読取: 未確認',
      '',
    ]);
    // 見積依頼に紐づく行は編集・削除を持たない（見積依頼の詳細画面が持つ）
    await expect(linkedRow.getByRole('button')).toHaveCount(0);

    const requestLessRow = listRow(page, requestLess.id);
    await expect(requestLessRow.getByRole('cell')).toHaveText([
      `${NAME_PREFIX}依頼なしの見積`,
      partner.name,
      '2026/10/02',
      '依頼なし',
      '-',
      formatJaDateTime(requestLess.createdAt),
      '読取: 未確認',
      '編集削除',
    ]);
    await expect(requestLessRow.getByRole('link')).toHaveCount(0);
    await expect(page.getByText(`${NAME_PREFIX}削除済み`)).toHaveCount(0);

    // 見積依頼に紐づかない受領見積書を後から見積依頼に紐づけられない（更新の要求に見積依頼の ID を混ぜても変わらない）
    const { accessToken } = await loginViaApi(request, owner);
    const put = await request.put(`${API_BASE_URL}/api/quotations/${requestLess.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      multipart: {
        expectedUpdatedAt: requestLess.updatedAt.toISOString(),
        estimateRequestId: estimateRequest.id,
        name: `${NAME_PREFIX}依頼なしの見積`,
      },
    });
    expect(put.status()).toBe(200);
    const afterPut = await prisma.receivedQuotation.findUniqueOrThrow({
      where: { id: requestLess.id },
      select: { estimateRequestId: true, projectId: true },
    });
    expect(afterPut).toEqual({ estimateRequestId: null, projectId: project.id });

    // 見積依頼名を選ぶとその見積依頼の詳細画面へ遷移する
    await linkedRow.getByRole('link', { name: estimateRequest.name }).click();
    await expect(page).toHaveURL(new RegExp(`/estimate-requests/${estimateRequest.id}$`));
    await expect(page.getByRole('heading', { level: 1, name: estimateRequest.name })).toBeVisible({
      timeout: getTimeout(15000),
    });
  });

  /**
   * @requirement estimate-request/REQ-43.6
   * @requirement estimate-request/REQ-43.7
   * @requirement estimate-request/REQ-43.8
   * @requirement estimate-request/REQ-43.9
   * @requirement estimate-request/REQ-14.1
   * @requirement estimate-request/REQ-44.1
   * @requirement estimate-request/REQ-44.4
   * @requirement estimate-request/REQ-44.5
   * @requirement estimate-request/REQ-44.6
   * @requirement estimate-request/REQ-44.7
   */
  test('見積依頼の無い受領見積書を業者名の候補の選択・自由な入力で登録し、業者名の未入力は止まり、編集と確認つきの論理削除ができる', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const partner = await createPartner('register');
    const project = await createProject(owner, 'register');
    const prisma = getPrismaClient();
    const posts = countRequests(page, 'POST', `/api/projects/${project.id}/quotations`);

    await loginAsUser(page, owner);
    expect(await openProjectQuotations(page, project.id)).toBe(200);
    await expectListPage(page);

    // --- 業者名の未入力は止まる ---
    await openRegisterForm(page);
    // 登録のフォームは受領見積書名（既定「見積書」）・提出日・業者名の入力・ファイル・明細行・台帳の情報を持つ
    await expect(page.locator('#quotation-name')).toHaveValue('見積書');
    await expect(page.locator('#submitted-at')).toBeVisible();
    await expect(vendorInput(page)).toHaveValue('');
    await expect(vendorInput(page)).toHaveAttribute('maxlength', '200');
    await expect(page.getByTestId('file-input')).toBeAttached();
    await expect(lineField(page, 1, '名称')).toBeVisible();
    await expect(ledgerHeader(page)).toBeVisible();

    const requiredName = `${NAME_PREFIX}業者名なし`;
    await page.locator('#quotation-name').fill(requiredName);
    await lineField(page, 1, '名称').fill('業者名の検証の行');
    await page.getByRole('button', { name: '登録', exact: true }).click();
    await expect(page.getByText('業者名を入力してください', { exact: true })).toBeVisible();
    await expect(vendorInput(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('heading', { name: '受領見積書の登録' })).toBeVisible();
    expect(posts).toHaveLength(0);

    // --- 候補から協力業者を選ぶ: 取引先に紐づき、取引先の名前が業者名に入る ---
    const pickedName = `${NAME_PREFIX}候補から選択`;
    await page.locator('#quotation-name').fill(pickedName);
    await vendorInput(page).fill(partner.name.slice(0, -3));
    const listbox = page.getByRole('listbox', { name: '協力業者の候補' });
    await expect(listbox).toBeVisible({ timeout: getTimeout(10000) });
    await listbox.getByRole('option', { name: new RegExp(partner.name) }).click();
    await expect(vendorInput(page)).toHaveValue(partner.name);
    await expect(page.getByTestId('vendor-name-linked')).toBeVisible();
    expect((await submitProjectCreate(page, project.id)).status()).toBe(201);
    await expectFormClosed(page);
    expect(posts).toHaveLength(1);

    const picked = await findOwnQuotation(project.id, pickedName);
    expect({
      estimateRequestId: picked.estimateRequestId,
      vendorName: picked.vendorName,
      tradingPartnerId: picked.tradingPartnerId,
    }).toEqual({ estimateRequestId: null, vendorName: partner.name, tradingPartnerId: partner.id });
    await expect(listRow(page, picked.id).getByRole('cell').nth(1)).toHaveText(partner.name);
    await expect(listRow(page, picked.id).getByRole('cell').nth(3)).toHaveText('依頼なし');

    // --- 候補を選ばず、名前が完全に一致する協力業者が 1 件ある名前を打つ: その取引先に紐づく ---
    const exactName = `${NAME_PREFIX}完全一致`;
    await openRegisterForm(page);
    await page.locator('#quotation-name').fill(exactName);
    await vendorInput(page).fill(partner.name);
    await vendorInput(page).press('Escape');
    await expect(page.getByTestId('vendor-name-linked')).toHaveCount(0);
    await lineField(page, 1, '名称').fill('完全一致の行');
    expect((await submitProjectCreate(page, project.id)).status()).toBe(201);
    await expectFormClosed(page);
    const exact = await findOwnQuotation(project.id, exactName);
    expect({ vendorName: exact.vendorName, tradingPartnerId: exact.tradingPartnerId }).toEqual({
      vendorName: partner.name,
      tradingPartnerId: partner.id,
    });

    // --- 一致する協力業者が無い自由な入力: 取引先に紐づけず業者名だけを残す（200 文字ちょうど） ---
    const freeName = `${NAME_PREFIX}自由入力`;
    const freeVendor = `自由入力の業者-${uniqueSuffix()}-`.padEnd(200, 'あ');
    await openRegisterForm(page);
    await page.locator('#quotation-name').fill(freeName);
    await vendorInput(page).fill(freeVendor);
    await vendorInput(page).press('Escape');
    await lineField(page, 1, '名称').fill('自由入力の行');
    await lineField(page, 1, '数量').fill('3');
    await lineField(page, 1, '単価').fill('1000');
    expect((await submitProjectCreate(page, project.id)).status()).toBe(201);
    await expectFormClosed(page);
    const free = await findOwnQuotation(project.id, freeName);
    expect({
      estimateRequestId: free.estimateRequestId,
      projectId: free.projectId,
      vendorName: free.vendorName,
      tradingPartnerId: free.tradingPartnerId,
    }).toEqual({
      estimateRequestId: null,
      projectId: project.id,
      vendorName: freeVendor,
      tradingPartnerId: null,
    });
    expect(free.vendorName).toHaveLength(200);
    // 業者名なしの試行は保存されていない
    expect(await ownQuotationNames(project.id)).toEqual([exactName, pickedName, freeName].sort());

    // --- 編集: 業者名を空にすると止まり、名前と業者名を変えて更新できる ---
    await openEditForm(page, freeName);
    await expect(vendorInput(page)).toHaveValue(freeVendor);
    await vendorInput(page).fill('');
    await page.getByRole('button', { name: '更新', exact: true }).click();
    await expect(page.getByText('業者名を入力してください', { exact: true })).toBeVisible();
    const editedName = `${NAME_PREFIX}自由入力-編集後`;
    await page.locator('#quotation-name').fill(editedName);
    await vendorInput(page).fill('編集後の業者');
    await vendorInput(page).press('Escape');
    expect((await submitUpdate(page, free.id)).status()).toBe(200);
    await expectFormClosed(page);
    await expect(listRow(page, free.id).getByRole('cell').first()).toHaveText(editedName);
    const edited = await prisma.receivedQuotation.findUniqueOrThrow({
      where: { id: free.id },
      select: { name: true, vendorName: true, tradingPartnerId: true, estimateRequestId: true },
    });
    expect(edited).toEqual({
      name: editedName,
      vendorName: '編集後の業者',
      tradingPartnerId: null,
      estimateRequestId: null,
    });

    // --- 削除: 確認のダイアログで取り消せば残り、「削除する」で論理削除される ---
    await page.getByRole('button', { name: `${editedName}を削除`, exact: true }).click();
    const confirm = page.getByRole('dialog', { name: '受領見積書の削除' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(`「${editedName}」を削除しますか？`);
    await confirm.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(listRow(page, free.id)).toBeVisible();
    expect(
      (await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: free.id } })).deletedAt
    ).toBeNull();

    await page.getByRole('button', { name: `${editedName}を削除`, exact: true }).click();
    const deleted = page.waitForResponse(
      (r) =>
        r.request().method() === 'DELETE' &&
        new URL(r.url()).pathname === `/api/quotations/${free.id}`,
      { timeout: getTimeout(30000) }
    );
    await page
      .getByRole('dialog', { name: '受領見積書の削除' })
      .getByRole('button', { name: '削除する', exact: true })
      .click();
    expect((await deleted).status()).toBe(204);
    await expect(listRow(page, free.id)).toHaveCount(0);
    await expect(page.getByTestId('project-quotation-operation-error')).toHaveCount(0);
    // 論理削除: 行は残り削除の日時が入る
    const softDeleted = await prisma.receivedQuotation.findUniqueOrThrow({
      where: { id: free.id },
      select: { deletedAt: true },
    });
    expect(softDeleted.deletedAt).toBeInstanceOf(Date);
    expect(await ownQuotationNames(project.id)).toEqual([exactName, pickedName].sort());
  });

  /**
   * @requirement estimate-request/REQ-44.2
   * @requirement estimate-request/REQ-44.3
   * @requirement estimate-request/REQ-45.3
   * @requirement estimate-request/REQ-47.6
   */
  test('見積依頼の詳細からの登録では業者名が宛先の取引先の名前で編集できず、項目選択から転記した行は直接工事で分類キーと数量表の行のキーが空になる', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const partner = await createPartner('request');
    const project = await createProject(owner, 'request');
    const estimateRequest = await createEstimateRequest(project.id, partner.id, 'request');

    await loginAsUser(page, owner);
    await page.goto(`/estimate-requests/${estimateRequest.id}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await page.getByRole('button', { name: '受領見積書登録' }).click();
    await expect(page.getByText('受領見積書の登録', { exact: true })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 業者名は宛先の取引先の名前で、編集できない（案件の文脈の入力欄は出ない）
    const vendor = page.getByLabel('業者名', { exact: true });
    await expect(vendor).toHaveValue(partner.name);
    await expect(vendor).toHaveAttribute('readonly', '');
    await expect(vendor).not.toBeEditable();
    await expect(page.getByRole('combobox', { name: '業者名' })).toHaveCount(0);

    // 項目選択から転記した行は区分が直接工事、分類キーと数量表の行のキーが空
    await page.getByTestId('transcription-button').click();
    await expect(lineField(page, 2, '名称')).toHaveValue('壁の塗装');
    for (const row of [1, 2]) {
      await expect(lineField(page, row, '区分')).toHaveValue('DIRECT');
      await expect(lineField(page, row, '分類キー')).toHaveValue('');
      await openLineDetail(page, row);
      await expect(lineField(page, row, '数量表の行のキー')).toHaveValue('');
    }

    const quotationName = `${NAME_PREFIX}依頼からの登録`;
    await page.locator('#quotation-name').fill(quotationName);
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname === `/api/estimate-requests/${estimateRequest.id}/quotations`,
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '登録', exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    // 業者名を送らない（サーバーが宛先の取引先を写す）
    expect(response.request().postData() ?? '').not.toContain('name="vendorName"');

    const quotation = await findOwnQuotation(project.id, quotationName);
    expect({
      estimateRequestId: quotation.estimateRequestId,
      vendorName: quotation.vendorName,
      tradingPartnerId: quotation.tradingPartnerId,
    }).toEqual({
      estimateRequestId: estimateRequest.id,
      vendorName: partner.name,
      tradingPartnerId: partner.id,
    });
    expect(
      quotation.lineItems.map((line) => ({
        name: line.name,
        category: line.category,
        classificationKey: line.classificationKey,
        quantityRowKey: line.quantityRowKey,
      }))
    ).toEqual([
      { name: '床の張替え', category: 'DIRECT', classificationKey: null, quantityRowKey: null },
      { name: '壁の塗装', category: 'DIRECT', classificationKey: null, quantityRowKey: null },
    ]);
  });

  /**
   * @requirement estimate-request/REQ-11.11
   * @requirement estimate-request/REQ-11.13
   * @requirement estimate-request/REQ-45.1
   * @requirement estimate-request/REQ-45.2
   * @requirement estimate-request/REQ-45.5
   * @requirement estimate-request/REQ-45.6
   * @requirement estimate-request/REQ-45.7
   * @requirement estimate-request/REQ-45.8
   * @requirement estimate-request/REQ-45.10
   * @requirement estimate-request/REQ-45.11
   * @requirement estimate-request/REQ-46.4
   * @requirement estimate-request/REQ-47.1
   * @requirement estimate-request/REQ-47.2
   * @requirement estimate-request/REQ-47.3
   */
  test('明細行の区分・別途を除く合計と小計・単価の空の行の金額・条件・換算・参考の印と理由・分類キーが保存され、読み込み直しても戻る', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const project = await createProject(owner, 'lines');

    await loginAsUser(page, owner);
    expect(await openProjectQuotations(page, project.id)).toBe(200);
    await expectListPage(page);
    await openRegisterForm(page);

    const quotationName = `${NAME_PREFIX}明細行`;
    await page.locator('#quotation-name').fill(quotationName);
    await vendorInput(page).fill('明細行の検証の業者');
    await vendorInput(page).press('Escape');

    // 新しい行の区分の既定は直接工事。区分の選択欄は 7 つの区分を持つ
    await expect(lineField(page, 1, '区分')).toHaveValue('DIRECT');
    await expect(lineField(page, 1, '区分').locator('option')).toHaveText([
      '直接工事',
      '諸経費',
      '交通費',
      '産廃',
      '値引き',
      '法定福利費',
      '別途',
    ]);

    await lineField(page, 1, '名称').fill('直接の行');
    await lineField(page, 1, '数量').fill('2');
    await lineField(page, 1, '単価').fill('1000');
    // 単価のある行の金額は自動の計算で、入力欄を持たない
    await expect(page.getByTestId('line-item-amount').nth(0)).toHaveText('2,000');
    await expect(lineField(page, 1, '金額')).toHaveCount(0);

    await page.getByRole('button', { name: '行を追加' }).click();
    await lineField(page, 2, '区分').selectOption({ label: '諸経費' });
    await lineField(page, 2, '名称').fill('諸経費の行');
    await lineField(page, 2, '数量').fill('1');
    await lineField(page, 2, '単価').fill('500');

    await page.getByRole('button', { name: '行を追加' }).click();
    await lineField(page, 3, '区分').selectOption({ label: '別途' });
    await lineField(page, 3, '名称').fill('別途の行');
    await lineField(page, 3, '数量').fill('1');
    await lineField(page, 3, '単価').fill('300');

    // 単価が空の行は金額を直接入れる
    await page.getByRole('button', { name: '行を追加' }).click();
    await lineField(page, 4, '区分').selectOption({ label: '交通費' });
    await lineField(page, 4, '名称').fill('交通費の行');
    await lineField(page, 4, '金額').fill('700');

    // 区分ごとの小計と、別途を除く合計
    const expectedSubtotals = {
      DIRECT: '2,000',
      OVERHEAD: '500',
      TRAVEL: '700',
      WASTE: '0',
      DISCOUNT: '0',
      LEGAL_WELFARE: '0',
      EXCLUDED: '300',
    };
    for (const [category, amount] of Object.entries(expectedSubtotals)) {
      await expect(page.getByTestId(`category-subtotal-${category}`)).toHaveText(amount);
    }
    await expect(page.getByTestId('total-amount')).toHaveText('3,200');

    // 行1 の分類キー（体系に無い文字のまま）・参考の印と、詳細の条件・換算・参考の理由
    const classificationKey = '未登録の体系/K-001';
    await lineField(page, 1, '分類キー').fill(classificationKey);
    await lineField(page, 1, '参考').check();
    await openLineDetail(page, 1);
    await lineField(page, 1, '条件').fill('夜間・棟別');
    await lineField(page, 1, '換算の数量').fill('12.5');
    await lineField(page, 1, '換算の単位').fill('m2');
    await lineField(page, 1, '換算の単価').fill('160.4');
    await lineField(page, 1, '換算の単価').blur();
    // 換算の単価に単価の表示形式と丸めを適用する
    await expect(lineField(page, 1, '換算の単価')).toHaveValue('160');
    await lineField(page, 1, '換算の根拠').fill('一式を延べ面積 12.5m2 で割った');
    await lineField(page, 1, '参考の理由').fill('夜間の割増を含むため参考');

    expect((await submitProjectCreate(page, project.id)).status()).toBe(201);
    await expectFormClosed(page);

    const quotation = await findOwnQuotation(project.id, quotationName);
    expect(
      quotation.lineItems.map((line) => ({
        name: line.name,
        category: line.category,
        quantity: line.quantity === null ? null : Number(line.quantity),
        unitPrice: line.unitPrice === null ? null : Number(line.unitPrice),
        amount: line.amount === null ? null : Number(line.amount),
      }))
    ).toEqual([
      { name: '直接の行', category: 'DIRECT', quantity: 2, unitPrice: 1000, amount: 2000 },
      { name: '諸経費の行', category: 'OVERHEAD', quantity: 1, unitPrice: 500, amount: 500 },
      { name: '別途の行', category: 'EXCLUDED', quantity: 1, unitPrice: 300, amount: 300 },
      { name: '交通費の行', category: 'TRAVEL', quantity: null, unitPrice: null, amount: 700 },
    ]);
    const first = quotation.lineItems[0]!;
    expect({
      condition: first.condition,
      conversionQuantity: Number(first.conversionQuantity),
      conversionUnit: first.conversionUnit,
      conversionUnitPrice: Number(first.conversionUnitPrice),
      conversionBasis: first.conversionBasis,
      classificationKey: first.classificationKey,
      isReference: first.isReference,
      referenceReason: first.referenceReason,
    }).toEqual({
      condition: '夜間・棟別',
      conversionQuantity: 12.5,
      conversionUnit: 'm2',
      conversionUnitPrice: 160,
      conversionBasis: '一式を延べ面積 12.5m2 で割った',
      classificationKey,
      isReference: true,
      referenceReason: '夜間の割増を含むため参考',
    });
    // 参考の印の無い行は印が無で理由も無い
    expect(
      quotation.lineItems.slice(1).map((line) => [line.isReference, line.referenceReason])
    ).toEqual([
      [false, null],
      [false, null],
      [false, null],
    ]);

    // 読み込み直して編集を開くと、保存した値が戻る
    expect(await openProjectQuotations(page, project.id)).toBe(200);
    await expectListPage(page);
    await openEditForm(page, quotationName);
    await expect(lineField(page, 1, '区分')).toHaveValue('DIRECT');
    await expect(lineField(page, 2, '区分')).toHaveValue('OVERHEAD');
    await expect(lineField(page, 3, '区分')).toHaveValue('EXCLUDED');
    await expect(lineField(page, 4, '区分')).toHaveValue('TRAVEL');
    await expect(lineField(page, 4, '金額')).toHaveValue('700');
    await expect(page.getByTestId('total-amount')).toHaveText('3,200');
    await expect(page.getByTestId('category-subtotal-EXCLUDED')).toHaveText('300');
    await expect(lineField(page, 1, '分類キー')).toHaveValue(classificationKey);
    await expect(lineField(page, 1, '参考')).toBeChecked();
    await expect(lineField(page, 2, '参考')).not.toBeChecked();
    await openLineDetail(page, 1);
    await expect(lineField(page, 1, '条件')).toHaveValue('夜間・棟別');
    await expect(lineField(page, 1, '換算の数量')).toHaveValue('12.5');
    await expect(lineField(page, 1, '換算の単位')).toHaveValue('m2');
    await expect(lineField(page, 1, '換算の単価')).toHaveValue('160');
    await expect(lineField(page, 1, '換算の根拠')).toHaveValue('一式を延べ面積 12.5m2 で割った');
    await expect(lineField(page, 1, '参考の理由')).toHaveValue('夜間の割増を含むため参考');
  });

  /**
   * @requirement estimate-request/REQ-45.4
   * @requirement estimate-request/REQ-45.9
   * @requirement estimate-request/REQ-46.5
   */
  test('値引きの正の金額・換算の一部だけの入力・参考の印の無い行の理由は行の下に拒否の文言が出て保存されず、直すと保存できる', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const project = await createProject(owner, 'reject');
    const posts = countRequests(page, 'POST', `/api/projects/${project.id}/quotations`);

    await loginAsUser(page, owner);
    expect(await openProjectQuotations(page, project.id)).toBe(200);
    await expectListPage(page);
    await openRegisterForm(page);

    const quotationName = `${NAME_PREFIX}拒否の文言`;
    await page.locator('#quotation-name').fill(quotationName);
    await vendorInput(page).fill('拒否の検証の業者');
    await vendorInput(page).press('Escape');

    // 行1: 値引きで正の金額
    await lineField(page, 1, '区分').selectOption({ label: '値引き' });
    await lineField(page, 1, '名称').fill('値引きの行');
    await lineField(page, 1, '数量').fill('1');
    await lineField(page, 1, '単価').fill('500');
    // 行2: 換算の数量だけ
    await page.getByRole('button', { name: '行を追加' }).click();
    await lineField(page, 2, '名称').fill('換算の行');
    await openLineDetail(page, 2);
    await lineField(page, 2, '換算の数量').fill('3');
    // 行3: 参考の印が無いのに理由
    await page.getByRole('button', { name: '行を追加' }).click();
    await lineField(page, 3, '名称').fill('理由の行');
    await openLineDetail(page, 3);
    await lineField(page, 3, '参考の理由').fill('印の無い行の理由');

    await page.getByRole('button', { name: '登録', exact: true }).click();
    await expect(page.getByTestId('line-item-errors-0')).toHaveText(
      '値引きの金額は0以下で入力してください'
    );
    await expect(page.getByTestId('line-item-errors-1')).toHaveText(
      '換算は数量・単位・単価・根拠をすべて入力してください（数量は0より大きい値）'
    );
    await expect(page.getByTestId('line-item-errors-2')).toHaveText(
      '参考の理由は参考の印を付けた行にだけ入力できます'
    );
    await expect(page.getByRole('heading', { name: '受領見積書の登録' })).toBeVisible();
    expect(posts).toHaveLength(0);
    expect(await ownQuotationNames(project.id)).toEqual([]);

    // 換算の数量が 0 以下も同じ文言で止まる
    await lineField(page, 2, '換算の数量').fill('0');
    await lineField(page, 2, '換算の単位').fill('式');
    await lineField(page, 2, '換算の単価').fill('100');
    await lineField(page, 2, '換算の根拠').fill('一式');
    await page.getByRole('button', { name: '登録', exact: true }).click();
    await expect(page.getByTestId('line-item-errors-1')).toHaveText(
      '換算は数量・単位・単価・根拠をすべて入力してください（数量は0より大きい値）'
    );
    expect(posts).toHaveLength(0);

    // 直すと保存できる
    await lineField(page, 1, '単価').fill('-500');
    await lineField(page, 2, '換算の数量').fill('2');
    await lineField(page, 3, '参考').check();
    expect((await submitProjectCreate(page, project.id)).status()).toBe(201);
    await expectFormClosed(page);
    expect(posts).toHaveLength(1);
    const quotation = await findOwnQuotation(project.id, quotationName);
    expect(
      quotation.lineItems.map((line) => ({
        category: line.category,
        amount: line.amount === null ? null : Number(line.amount),
        conversionQuantity:
          line.conversionQuantity === null ? null : Number(line.conversionQuantity),
        isReference: line.isReference,
        referenceReason: line.referenceReason,
      }))
    ).toEqual([
      {
        category: 'DISCOUNT',
        amount: -500,
        conversionQuantity: null,
        isReference: false,
        referenceReason: null,
      },
      {
        category: 'DIRECT',
        amount: null,
        conversionQuantity: 2,
        isReference: false,
        referenceReason: null,
      },
      {
        category: 'DIRECT',
        amount: null,
        conversionQuantity: null,
        isReference: true,
        referenceReason: '印の無い行の理由',
      },
    ]);
  });

  /**
   * @requirement estimate-request/REQ-46.1
   * @requirement estimate-request/REQ-46.2
   * @requirement estimate-request/REQ-46.3
   * @requirement estimate-request/REQ-46.6
   * @requirement estimate-request/REQ-46.7
   * @requirement estimate-request/REQ-46.8
   * @requirement estimate-request/REQ-46.9
   * @requirement estimate-request/REQ-46.10
   * @requirement estimate-request/REQ-46.11
   */
  test('台帳の情報の欄は既定で閉じ、入力が保存され、確認済みにすると確認者と日時が記録・表示され、明細行を変えて保存すると未確認へ戻る', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const project = await createProject(owner, 'ledger');
    const prisma = getPrismaClient();

    await loginAsUser(page, owner);
    expect(await openProjectQuotations(page, project.id)).toBe(200);
    await expectListPage(page);
    await openRegisterForm(page);

    const quotationName = `${NAME_PREFIX}台帳の情報`;
    await page.locator('#quotation-name').fill(quotationName);
    await vendorInput(page).fill('台帳の検証の業者');
    await vendorInput(page).press('Escape');
    await lineField(page, 1, '名称').fill('台帳の行');
    await lineField(page, 1, '数量').fill('1');
    await lineField(page, 1, '単価').fill('1000');
    await lineField(page, 1, '参考').check();

    // 既定では閉じている
    await expect(ledgerHeader(page)).toHaveText(/台帳の情報/);
    await expect(ledgerHeader(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByLabel('見積番号', { exact: true })).toBeHidden();
    await expect(page.getByLabel('見積の区別', { exact: true })).toBeHidden();

    await ledgerHeader(page).click();
    await expect(ledgerHeader(page)).toHaveAttribute('aria-expanded', 'true');
    // 既定の値: 改修／新営は未設定、採否は不明、読取の確認は未確認
    await expect(page.getByLabel('改修／新営', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('採否', { exact: true })).toHaveValue('UNKNOWN');
    await expect(page.getByLabel('読取の確認', { exact: true })).toHaveValue('UNCONFIRMED');
    await expect(page.getByLabel('見積の区別', { exact: true })).toHaveValue('');

    await page.getByLabel('見積番号', { exact: true }).fill('Q-2026-0042');
    await page.getByLabel('見積全体の条件', { exact: true }).fill('足場は別途。工程は 3 日');
    await page.getByLabel('場所', { exact: true }).fill('千代田区');
    await page.getByLabel('改修／新営', { exact: true }).selectOption({ label: '改修' });
    await page.getByLabel('用途', { exact: true }).fill('事務所');
    await page.getByLabel('工事価格（円）', { exact: true }).fill('1200000');
    await page.getByLabel('作業条件', { exact: true }).fill('夜間、居ながら');
    await page.getByLabel('距離（km）', { exact: true }).fill('12.5');
    await page.getByLabel('採否', { exact: true }).selectOption({ label: '採用' });
    await page.getByLabel('確定金額（円）', { exact: true }).fill('1100000');
    await page.getByLabel('読取の確認', { exact: true }).selectOption({ label: '確認済み' });
    await expect(page.getByTestId('ledger-reading-confirmation')).toHaveText(
      '保存すると確認者と日時を記録します'
    );

    const beforeSave = new Date();
    expect((await submitProjectCreate(page, project.id)).status()).toBe(201);
    await expectFormClosed(page);
    const afterSave = new Date();

    const saved = await findOwnQuotation(project.id, quotationName);
    expect({
      quoteNumber: saved.quoteNumber,
      overallConditions: saved.overallConditions,
      siteLocation: saved.siteLocation,
      constructionKind: saved.constructionKind,
      useType: saved.useType,
      constructionPrice: Number(saved.constructionPrice),
      workConditions: saved.workConditions,
      distanceKm: Number(saved.distanceKm),
      adoption: saved.adoption,
      confirmedAmount: Number(saved.confirmedAmount),
      readingStatus: saved.readingStatus,
      readingConfirmedById: saved.readingConfirmedById,
    }).toEqual({
      quoteNumber: 'Q-2026-0042',
      overallConditions: '足場は別途。工程は 3 日',
      siteLocation: '千代田区',
      constructionKind: 'RENOVATION',
      useType: '事務所',
      constructionPrice: 1200000,
      workConditions: '夜間、居ながら',
      distanceKm: 12.5,
      adoption: 'ADOPTED',
      confirmedAmount: 1100000,
      readingStatus: 'CONFIRMED',
      readingConfirmedById: owner.id,
    });
    const confirmedAt = saved.readingConfirmedAt;
    expect(confirmedAt).toBeInstanceOf(Date);
    expect(confirmedAt!.getTime()).toBeGreaterThanOrEqual(beforeSave.getTime() - 5000);
    expect(confirmedAt!.getTime()).toBeLessThanOrEqual(afterSave.getTime() + 5000);

    // 一覧は参考の印のある受領見積書であることと、読取の確認の状態を示す
    const row = listRow(page, saved.id);
    await expect(row.getByTestId('received-quotation-reference-indicator')).toHaveText(
      '参考の印あり'
    );
    await expect(row.getByTestId('received-quotation-reading-status')).toHaveText('読取: 確認済み');

    // 読み込み直して編集を開くと、台帳の情報が戻り、確認者と日時が表示される
    expect(await openProjectQuotations(page, project.id)).toBe(200);
    await expectListPage(page);
    await openEditForm(page, quotationName);
    await expect(ledgerHeader(page)).toHaveAttribute('aria-expanded', 'false');
    await ledgerHeader(page).click();
    await expect(page.getByLabel('見積番号', { exact: true })).toHaveValue('Q-2026-0042');
    await expect(page.getByLabel('見積全体の条件', { exact: true })).toHaveValue(
      '足場は別途。工程は 3 日'
    );
    await expect(page.getByLabel('場所', { exact: true })).toHaveValue('千代田区');
    await expect(page.getByLabel('改修／新営', { exact: true })).toHaveValue('RENOVATION');
    await expect(page.getByLabel('用途', { exact: true })).toHaveValue('事務所');
    await expect(page.getByLabel('工事価格（円）', { exact: true })).toHaveValue('1200000');
    await expect(page.getByLabel('作業条件', { exact: true })).toHaveValue('夜間、居ながら');
    await expect(page.getByLabel('距離（km）', { exact: true })).toHaveValue('12.5');
    await expect(page.getByLabel('採否', { exact: true })).toHaveValue('ADOPTED');
    await expect(page.getByLabel('確定金額（円）', { exact: true })).toHaveValue('1100000');
    await expect(page.getByLabel('読取の確認', { exact: true })).toHaveValue('CONFIRMED');
    await expect(page.getByTestId('ledger-reading-confirmation')).toHaveText(
      `確認者: ${owner.displayName}　確認日時: ${formatJaDateTime(confirmedAt!)}`
    );

    // 明細行を変えずに台帳の情報だけを変えて保存: 確認済みと確認者・日時は保たれ、監査の記録は金額を含めない
    await page.getByLabel('見積番号', { exact: true }).fill('Q-2026-0043');
    await page.getByLabel('工事価格（円）', { exact: true }).fill('1300000');
    expect((await submitUpdate(page, saved.id)).status()).toBe(200);
    await expectFormClosed(page);
    const kept = await prisma.receivedQuotation.findUniqueOrThrow({
      where: { id: saved.id },
      select: {
        quoteNumber: true,
        constructionPrice: true,
        readingStatus: true,
        readingConfirmedById: true,
        readingConfirmedAt: true,
      },
    });
    expect({
      quoteNumber: kept.quoteNumber,
      constructionPrice: Number(kept.constructionPrice),
      readingStatus: kept.readingStatus,
      readingConfirmedById: kept.readingConfirmedById,
      readingConfirmedAt: kept.readingConfirmedAt?.getTime(),
    }).toEqual({
      quoteNumber: 'Q-2026-0043',
      constructionPrice: 1300000,
      readingStatus: 'CONFIRMED',
      readingConfirmedById: owner.id,
      readingConfirmedAt: confirmedAt!.getTime(),
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { targetId: saved.id, action: 'RECEIVED_QUOTATION_UPDATED' },
      orderBy: { createdAt: 'desc' },
    });
    const auditBefore = audit.before as Record<string, unknown>;
    const auditAfter = audit.after as Record<string, unknown>;
    expect([auditBefore.quoteNumber, auditAfter.quoteNumber]).toEqual([
      'Q-2026-0042',
      'Q-2026-0043',
    ]);
    expect([auditBefore.siteLocation, auditAfter.siteLocation]).toEqual(['千代田区', '千代田区']);
    expect(auditAfter.constructionPriceChanged).toBe(true);
    expect(auditAfter.confirmedAmountChanged).toBe(false);
    const auditText = JSON.stringify([audit.before, audit.after]);
    for (const amount of ['1200000', '1300000', '1100000']) {
      expect(auditText, `監査の記録に金額 ${amount} が現れない`).not.toContain(amount);
    }

    // 明細行を変えて保存すると未確認に戻り、確認者と日時が消える
    await openEditForm(page, quotationName);
    await lineField(page, 1, '単価').fill('1200');
    expect((await submitUpdate(page, saved.id)).status()).toBe(200);
    await expectFormClosed(page);
    const reverted = await prisma.receivedQuotation.findUniqueOrThrow({
      where: { id: saved.id },
      select: { readingStatus: true, readingConfirmedById: true, readingConfirmedAt: true },
    });
    expect(reverted).toEqual({
      readingStatus: 'UNCONFIRMED',
      readingConfirmedById: null,
      readingConfirmedAt: null,
    });
    await expect(row.getByTestId('received-quotation-reading-status')).toHaveText('読取: 未確認');
    await expect(row.getByTestId('received-quotation-reference-indicator')).toHaveText(
      '参考の印あり'
    );
  });

  /**
   * @requirement estimate-request/REQ-48.1
   * @requirement estimate-request/REQ-48.2
   * @requirement estimate-request/REQ-48.3
   * @requirement estimate-request/REQ-48.4
   * @requirement estimate-request/REQ-48.5
   * @requirement estimate-request/REQ-48.6
   * @requirement estimate-request/REQ-48.7
   */
  test('同じファイルの二度目の登録は既存の受領見積書を示して止まり、見積の区別を変えると同じ原本の件数の知らせつきで保存され、ファイルの差し替えでも判定される', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const project = await createProject(owner, 'dup');
    const otherProject = await createProject(owner, 'dup-other');
    const prisma = getPrismaClient();
    const hashA = sha256Of(PDF_A);
    const hashB = sha256Of(PDF_B);
    expect(hashA).not.toBe(hashB);

    // 他の案件に同じ原本・同じ区別の受領見積書がある（判定の対象にしない）
    await prisma.receivedQuotation.create({
      data: {
        projectId: otherProject.id,
        vendorName: '他の案件の業者',
        name: `${NAME_PREFIX}他の案件の原本`,
        submittedAt: new Date('2026-09-01'),
        filePath: `quotations/e2e/${uniqueSuffix()}.pdf`,
        fileName: 'other.pdf',
        fileMimeType: 'application/pdf',
        fileSize: 1024,
        fileSha256: hashA,
      },
    });
    // 同じ案件のファイルの無い受領見積書（判定の対象にしない）
    await prisma.receivedQuotation.create({
      data: {
        projectId: project.id,
        vendorName: 'ファイルなしの業者',
        name: `${NAME_PREFIX}ファイルなし-既存`,
        submittedAt: new Date('2026-09-02'),
      },
    });

    await loginAsUser(page, owner);
    expect(await openProjectQuotations(page, project.id)).toBe(200);
    await expectListPage(page);

    // ファイルの無い受領見積書は、区別が同じ（空）でも重複にならない
    const noFileName = `${NAME_PREFIX}ファイルなし-新規`;
    await openRegisterForm(page);
    await page.locator('#quotation-name').fill(noFileName);
    await vendorInput(page).fill('ファイルなしの業者');
    await vendorInput(page).press('Escape');
    await lineField(page, 1, '名称').fill('ファイルなしの行');
    expect((await submitProjectCreate(page, project.id)).status()).toBe(201);
    await expectFormClosed(page);
    await expect(page.getByTestId('shared-original-notice')).toHaveCount(0);

    // 1 件目: ファイル A・区別は空。保存したファイルの内容から指紋を求めて残す
    const firstName = `${NAME_PREFIX}原本A-1件目`;
    await openRegisterForm(page);
    await page.locator('#quotation-name').fill(firstName);
    await page.locator('#submitted-at').fill('2026-10-05');
    await vendorInput(page).fill('原本の業者');
    await vendorInput(page).press('Escape');
    await page.getByTestId('file-input').setInputFiles(PDF_A);
    expect((await submitProjectCreate(page, project.id)).status()).toBe(201);
    await expectFormClosed(page);
    // 他の案件の同じ原本は数えない
    await expect(page.getByTestId('shared-original-notice')).toHaveCount(0);
    const first = await findOwnQuotation(project.id, firstName);
    expect({ fileSha256: first.fileSha256, quoteDiscriminator: first.quoteDiscriminator }).toEqual({
      fileSha256: hashA,
      quoteDiscriminator: '',
    });

    // 2 件目: 同じファイル・同じ区別（空）は止まり、既存の受領見積書の名前・業者名・提出日を示す
    const secondName = `${NAME_PREFIX}原本A-別案`;
    await openRegisterForm(page);
    await page.locator('#quotation-name').fill(secondName);
    await vendorInput(page).fill('別案の業者');
    await vendorInput(page).press('Escape');
    await page.getByTestId('file-input').setInputFiles(PDF_A);
    const rejected = await submitProjectCreate(page, project.id);
    expect(rejected.status()).toBe(409);
    const duplicateError = page.getByTestId('duplicate-original-error');
    await expect(duplicateError).toContainText('同じ原本の受領見積書が既に登録されています');
    await expect(duplicateError).toContainText(
      `既存の受領見積書: ${firstName}（業者名: 原本の業者、提出日: 2026-10-05）`
    );
    await expect(page.getByRole('heading', { name: '受領見積書の登録' })).toBeVisible();
    expect(await ownQuotationNames(project.id)).toEqual(
      [`${NAME_PREFIX}ファイルなし-既存`, noFileName, firstName].sort()
    );

    // 見積の区別を変えると保存され、同じ原本の他の受領見積書の件数を知らせる
    await ledgerHeader(page).click();
    await page.getByLabel('見積の区別', { exact: true }).fill('別案');
    expect((await submitProjectCreate(page, project.id)).status()).toBe(201);
    await expectFormClosed(page);
    await expect(page.getByTestId('shared-original-notice')).toHaveText(
      '同じ原本の受領見積書が他に1件登録されています（見積の区別が違うため登録しました）'
    );
    const second = await findOwnQuotation(project.id, secondName);
    expect({
      fileSha256: second.fileSha256,
      quoteDiscriminator: second.quoteDiscriminator,
    }).toEqual({
      fileSha256: hashA,
      quoteDiscriminator: '別案',
    });

    // 3 件目: ファイル B・区別は空（知らせ無し）
    const thirdName = `${NAME_PREFIX}原本B`;
    await openRegisterForm(page);
    await page.locator('#quotation-name').fill(thirdName);
    await vendorInput(page).fill('原本Bの業者');
    await vendorInput(page).press('Escape');
    await page.getByTestId('file-input').setInputFiles(PDF_B);
    expect((await submitProjectCreate(page, project.id)).status()).toBe(201);
    await expectFormClosed(page);
    await expect(page.getByTestId('shared-original-notice')).toHaveCount(0);
    const third = await findOwnQuotation(project.id, thirdName);
    expect(third.fileSha256).toBe(hashB);

    // 3 件目のファイルを A に差し替える: 指紋を求め直し、1 件目と同じ組になるため止まり、データは変わらない
    await openEditForm(page, thirdName);
    await page.getByRole('button', { name: '削除', exact: true }).click();
    await page.getByTestId('file-input').setInputFiles(PDF_A);
    const replaceRejected = await submitUpdate(page, third.id);
    expect(replaceRejected.status()).toBe(409);
    await expect(page.getByTestId('duplicate-original-error')).toContainText(
      `既存の受領見積書: ${firstName}（業者名: 原本の業者、提出日: 2026-10-05）`
    );
    const unchanged = await prisma.receivedQuotation.findUniqueOrThrow({
      where: { id: third.id },
      select: { fileSha256: true, updatedAt: true, fileName: true },
    });
    expect({
      fileSha256: unchanged.fileSha256,
      updatedAt: unchanged.updatedAt.getTime(),
      fileName: unchanged.fileName,
    }).toEqual({
      fileSha256: hashB,
      updatedAt: third.updatedAt.getTime(),
      fileName: third.fileName,
    });

    // 区別を変えて差し替えると保存され、指紋は A になり、同じ原本の他の 2 件を知らせる
    await ledgerHeader(page).click();
    await page.getByLabel('見積の区別', { exact: true }).fill('第3案');
    expect((await submitUpdate(page, third.id)).status()).toBe(200);
    await expectFormClosed(page);
    await expect(page.getByTestId('shared-original-notice')).toHaveText(
      '同じ原本の受領見積書が他に2件登録されています（見積の区別が違うため登録しました）'
    );
    const replaced = await prisma.receivedQuotation.findUniqueOrThrow({
      where: { id: third.id },
      select: { fileSha256: true, quoteDiscriminator: true },
    });
    expect(replaced).toEqual({ fileSha256: hashA, quoteDiscriminator: '第3案' });
  });

  /**
   * @requirement estimate-request/REQ-45.12
   * @requirement estimate-request/REQ-47.4
   * @requirement estimate-request/REQ-47.5
   */
  test('画面以外の経路で入った数量×単価と違う金額と数量表の行のキーは表示され画面の保存で保たれ、数量を変えたときだけ金額を計算し直す', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const project = await createProject(owner, 'seeded');
    const prisma = getPrismaClient();
    // 指す数量表の行の無いキー（有無を検査しない）
    const quantityRowKey = 'QK:存在しない数量表/行-0001|区別:北棟';
    const quotationName = `${NAME_PREFIX}他の経路の登録`;
    const seeded = await prisma.receivedQuotation.create({
      data: {
        projectId: project.id,
        vendorName: '取り込みの業者',
        name: quotationName,
        submittedAt: new Date('2026-10-10'),
        lineItems: {
          create: [
            {
              sortOrder: 0,
              name: '取り込みの行',
              quantity: 2,
              unitPrice: 100,
              amount: 250,
              classificationKey: 'K-SEED-01',
              quantityRowKey,
            },
            { sortOrder: 1, name: '二つ目の行', quantity: 1, unitPrice: 50, amount: 50 },
          ],
        },
      },
      select: { id: true },
    });

    await loginAsUser(page, owner);
    expect(await openProjectQuotations(page, project.id)).toBe(200);
    await expectListPage(page);
    await openEditForm(page, quotationName);

    // 登録された金額（数量×単価の 200 ではない 250）を表示する
    await expect(page.getByTestId('line-item-amount').nth(0)).toHaveText('250');
    await openLineDetail(page, 1);
    const rowKey = lineField(page, 1, '数量表の行のキー');
    await expect(rowKey).toHaveValue(quantityRowKey);
    await expect(rowKey).toHaveAttribute('readonly', '');
    await expect(lineField(page, 1, '分類キー')).toHaveValue('K-SEED-01');

    // 数量・単価以外を変えて保存: 金額と数量表の行のキーは保たれる
    await lineField(page, 1, '備考').fill('備考だけ変えた');
    await expect(page.getByTestId('line-item-amount').nth(0)).toHaveText('250');
    expect((await submitUpdate(page, seeded.id)).status()).toBe(200);
    await expectFormClosed(page);
    const afterRemarks = await findOwnQuotation(project.id, quotationName);
    expect(
      afterRemarks.lineItems.map((line) => ({
        amount: Number(line.amount),
        remarks: line.remarks,
        classificationKey: line.classificationKey,
        quantityRowKey: line.quantityRowKey,
      }))
    ).toEqual([
      {
        amount: 250,
        remarks: '備考だけ変えた',
        classificationKey: 'K-SEED-01',
        quantityRowKey,
      },
      { amount: 50, remarks: null, classificationKey: null, quantityRowKey: null },
    ]);

    // 数量を変えたときだけ金額を計算し直す。数量表の行のキーは保たれる
    await openEditForm(page, quotationName);
    await expect(page.getByTestId('line-item-amount').nth(0)).toHaveText('250');
    await lineField(page, 1, '数量').fill('3');
    await expect(page.getByTestId('line-item-amount').nth(0)).toHaveText('300');
    expect((await submitUpdate(page, seeded.id)).status()).toBe(200);
    await expectFormClosed(page);
    const afterQuantity = await findOwnQuotation(project.id, quotationName);
    expect(
      afterQuantity.lineItems.map((line) => [Number(line.amount), line.quantityRowKey])
    ).toEqual([
      [300, quantityRowKey],
      [50, null],
    ]);
  });

  /**
   * @requirement estimate-request/REQ-43.12
   * @requirement estimate-request/REQ-43.13
   * @requirement estimate-request/REQ-43.14
   */
  test('担当外の利用者が一覧の画面を開くと存在しないプロジェクトと同じ見つからない表示になり、案件の無い受領見積書は ID 指定でも 404 になる', async ({
    page,
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const project = await createProject(owner, 'scope');
    const prisma = getPrismaClient();
    const quotation = await prisma.receivedQuotation.create({
      data: {
        projectId: project.id,
        vendorName: '範囲の検証の業者',
        name: `${NAME_PREFIX}範囲の検証`,
        submittedAt: new Date('2026-10-01'),
      },
      select: { id: true, updatedAt: true },
    });
    // 案件の無い受領見積書（過去の見積カード）
    const orphan = await prisma.receivedQuotation.create({
      data: {
        vendorName: '過去の見積の業者',
        name: `${NAME_PREFIX}案件なし`,
        submittedAt: new Date('2025-01-01'),
      },
      select: { id: true, updatedAt: true },
    });

    // 担当外の利用者の画面: 存在しない ID と同じ見つからない表示
    await loginAsUser(page, outsider);
    expect(await openProjectQuotations(page, MISSING_ID)).toBe(404);
    const main = page.getByRole('main').last();
    await expect(main.getByRole('heading', { name: 'プロジェクトが見つかりません' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    const missingText = await main.innerText();

    expect(await openProjectQuotations(page, project.id)).toBe(404);
    await expect(main.getByRole('heading', { name: 'プロジェクトが見つかりません' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(main.getByRole('link', { name: 'プロジェクト一覧に戻る' })).toHaveAttribute(
      'href',
      '/projects'
    );
    await expect(page.getByRole('button', { name: '再試行' })).toHaveCount(0);
    await expect(page.getByText('受領見積書の取得に失敗しました', { exact: true })).toHaveCount(0);
    await expect(page.getByText(`${NAME_PREFIX}範囲の検証`)).toHaveCount(0);
    expect(await main.innerText(), '存在しないプロジェクトと同じ表示').toBe(missingText);

    // 担当外の利用者の API: 一覧・登録・更新・削除は 404 で、データは変わらない
    const { accessToken: outsiderToken } = await loginViaApi(request, outsider);
    const outsiderHeaders = { Authorization: `Bearer ${outsiderToken}` };
    const responses = [
      await request.get(`${API_BASE_URL}/api/projects/${project.id}/quotations?include=all`, {
        headers: outsiderHeaders,
      }),
      await request.post(`${API_BASE_URL}/api/projects/${project.id}/quotations`, {
        headers: outsiderHeaders,
        multipart: {
          name: 'intrusion',
          vendorName: 'intrusion',
          submittedAt: '2026-10-27T00:00:00.000Z',
          lineItems: JSON.stringify([{ name: '項目', sortOrder: 0, quantity: 1, unitPrice: 1 }]),
        },
      }),
      await request.put(`${API_BASE_URL}/api/quotations/${quotation.id}`, {
        headers: outsiderHeaders,
        multipart: { expectedUpdatedAt: quotation.updatedAt.toISOString(), name: 'intrusion' },
      }),
      await request.delete(
        `${API_BASE_URL}/api/quotations/${quotation.id}?updatedAt=${encodeURIComponent(quotation.updatedAt.toISOString())}`,
        { headers: outsiderHeaders }
      ),
    ];
    for (const response of responses) {
      expect(response.status(), response.url()).toBe(404);
      expect(((await response.json()) as { code?: string }).code, response.url()).toBe('NOT_FOUND');
    }
    expect(await ownQuotationNames(project.id)).toEqual([`${NAME_PREFIX}範囲の検証`]);

    // 案件の無い受領見積書は、関係者にも存在しない ID と同じ 404 になる
    const { accessToken: ownerToken } = await loginViaApi(request, owner);
    const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };
    for (const [orphanPath, missingPath] of [
      [`/api/quotations/${orphan.id}`, `/api/quotations/${MISSING_ID}`],
      [`/api/quotations/${orphan.id}/preview`, `/api/quotations/${MISSING_ID}/preview`],
    ] as const) {
      const orphanRes = await request.get(`${API_BASE_URL}${orphanPath}`, {
        headers: ownerHeaders,
      });
      const missingRes = await request.get(`${API_BASE_URL}${missingPath}`, {
        headers: ownerHeaders,
      });
      expect(orphanRes.status(), orphanPath).toBe(404);
      expect(missingRes.status(), missingPath).toBe(404);
      expect(((await orphanRes.json()) as { code?: string }).code, orphanPath).toBe(
        ((await missingRes.json()) as { code?: string }).code
      );
    }
    const orphanDelete = await request.delete(
      `${API_BASE_URL}/api/quotations/${orphan.id}?updatedAt=${encodeURIComponent(orphan.updatedAt.toISOString())}`,
      { headers: ownerHeaders }
    );
    expect(orphanDelete.status()).toBe(404);
    expect(
      (await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: orphan.id } })).deletedAt
    ).toBeNull();
  });

  /**
   * @requirement estimate-request/REQ-43.11
   */
  test('閲覧の権限の無い利用者にはアクセスの拒否を、登録・削除の権限の無い利用者には操作の拒否を表示し、データは変わらない', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const viewDenied = await createLimitedUser('view-denied', [['project', 'read']]);
    const operationDenied = await createLimitedUser('operation-denied', [
      ['project', 'read'],
      ['estimate_request', 'read'],
      ['trading-partner', 'read'],
    ]);
    const prisma = getPrismaClient();
    const viewProject = await prisma.project.create({
      data: {
        name: `${NAME_PREFIX}閲覧の拒否-${uniqueSuffix()}`,
        salesPersonId: viewDenied.id,
        createdById: owner.id,
      },
      select: { id: true },
    });
    const operationProject = await prisma.project.create({
      data: {
        name: `${NAME_PREFIX}操作の拒否-${uniqueSuffix()}`,
        salesPersonId: operationDenied.id,
        createdById: owner.id,
      },
      select: { id: true },
    });
    const existingName = `${NAME_PREFIX}操作の拒否の既存`;
    const existing = await prisma.receivedQuotation.create({
      data: {
        projectId: operationProject.id,
        vendorName: '拒否の検証の業者',
        name: existingName,
        submittedAt: new Date('2026-10-01'),
      },
      select: { id: true },
    });

    // 閲覧の権限が無い: アクセスの拒否（一覧・登録の釦・再試行は出さない）
    await loginAsUser(page, viewDenied);
    expect(await openProjectQuotations(page, viewProject.id)).toBe(403);
    await expect(
      page.getByText('アクセスが拒否されました。受領見積書の一覧を閲覧する権限がありません。', {
        exact: true,
      })
    ).toBeVisible({ timeout: getTimeout(15000) });
    await expect(page.getByTestId('project-quotation-table')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '受領見積書登録' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '再試行' })).toHaveCount(0);

    // 登録・削除の権限が無い: 一覧は見え、登録と削除は操作の拒否になる
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAsUser(page, operationDenied);
    expect(await openProjectQuotations(page, operationProject.id)).toBe(200);
    await expectListPage(page);
    await expect(listRow(page, existing.id)).toBeVisible();

    await openRegisterForm(page);
    await page.locator('#quotation-name').fill(`${NAME_PREFIX}拒否される登録`);
    await vendorInput(page).fill('拒否される業者');
    await vendorInput(page).press('Escape');
    await lineField(page, 1, '名称').fill('拒否される行');
    expect((await submitProjectCreate(page, operationProject.id)).status()).toBe(403);
    await expect(page.getByTestId('save-error')).toHaveText(
      '操作が拒否されました。受領見積書を登録・編集・削除する権限がありません。'
    );
    await expect(page.getByRole('heading', { name: '受領見積書の登録' })).toBeVisible();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await expectFormClosed(page);

    await page.getByRole('button', { name: `${existingName}を削除`, exact: true }).click();
    const deleted = page.waitForResponse(
      (r) =>
        r.request().method() === 'DELETE' &&
        new URL(r.url()).pathname === `/api/quotations/${existing.id}`,
      { timeout: getTimeout(30000) }
    );
    await page
      .getByRole('dialog', { name: '受領見積書の削除' })
      .getByRole('button', { name: '削除する', exact: true })
      .click();
    expect((await deleted).status()).toBe(403);
    await expect(page.getByTestId('project-quotation-operation-error')).toHaveText(
      '操作が拒否されました。受領見積書を登録・編集・削除する権限がありません。'
    );
    await expect(listRow(page, existing.id)).toBeVisible();
    expect(await ownQuotationNames(operationProject.id)).toEqual([existingName]);
    expect(
      (await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: existing.id } })).deletedAt
    ).toBeNull();
  });

  /**
   * 削除の失敗の既定の文言と、保存の 401 がフォームへ返って再認証の後に 1 回だけ登録されること
   * （タスク118.1 の申し送り）。
   *
   * @requirement estimate-request/REQ-43.7
   */
  test('削除が 500 で失敗すると日本語の失敗の文言を出して行を残し、保存が 401 を受けると再認証の後に 1 回だけ登録される', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const project = await createProject(owner, 'failure');
    const prisma = getPrismaClient();
    const existingName = `${NAME_PREFIX}削除の失敗`;
    const existing = await prisma.receivedQuotation.create({
      data: {
        projectId: project.id,
        vendorName: '失敗の検証の業者',
        name: existingName,
        submittedAt: new Date('2026-10-01'),
      },
      select: { id: true },
    });

    await loginAsUser(page, owner);
    expect(await openProjectQuotations(page, project.id)).toBe(200);
    await expectListPage(page);

    // 削除の 500: 応答の英語の文言を出さず日本語の失敗の文言を出し、行は残る
    await page.route(`**/api/quotations/${existing.id}?*`, async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Internal Server Error (e2e)', code: 'INTERNAL_ERROR' }),
        });
        return;
      }
      await route.continue();
    });
    await page.getByRole('button', { name: `${existingName}を削除`, exact: true }).click();
    await page
      .getByRole('dialog', { name: '受領見積書の削除' })
      .getByRole('button', { name: '削除する', exact: true })
      .click();
    await expect(page.getByTestId('project-quotation-operation-error')).toHaveText(
      '受領見積書の削除に失敗しました'
    );
    await expect(page.getByText('Internal Server Error (e2e)')).toHaveCount(0);
    await expect(listRow(page, existing.id)).toBeVisible();
    expect(
      (await prisma.receivedQuotation.findUniqueOrThrow({ where: { id: existing.id } })).deletedAt
    ).toBeNull();
    await page.unroute(`**/api/quotations/${existing.id}?*`);

    // 保存の 401: 再認証の窓が出て、再認証の後にフォームが 1 回だけ送り直す
    const createPath = `/api/projects/${project.id}/quotations`;
    let rejectedOnce = false;
    await page.route(`**${createPath}`, async (route) => {
      if (!rejectedOnce && route.request().method() === 'POST') {
        rejectedOnce = true;
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'session expired (e2e)' }),
        });
        return;
      }
      await route.continue();
    });
    await page.route('**/api/v1/auth/refresh', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'session expired (e2e)' }),
      })
    );

    const reauthName = `${NAME_PREFIX}再認証の後の登録`;
    await openRegisterForm(page);
    await page.locator('#quotation-name').fill(reauthName);
    await vendorInput(page).fill('再認証の業者');
    await vendorInput(page).press('Escape');
    await lineField(page, 1, '名称').fill('再認証の行');
    await page.getByRole('button', { name: '登録', exact: true }).click();

    const sessionDialog = page.getByRole('dialog', { name: /セッション/ });
    await expect(sessionDialog).toBeVisible({ timeout: getTimeout(20000) });
    // フォームは入力を保ったまま残る
    await expect(page.locator('#quotation-name')).toHaveValue(reauthName);
    expect(rejectedOnce).toBe(true);

    const retried = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === createPath,
      { timeout: getTimeout(30000) }
    );
    await sessionDialog.locator('input#session-expired-password').fill(owner.password);
    await sessionDialog.getByRole('button', { name: /再ログイン/ }).click();
    await submitSessionExpiredTwoFactorCode(page, owner);
    expect((await retried).status()).toBe(201);
    await expectFormClosed(page);
    await expect(sessionDialog).toBeHidden();

    const created = await findOwnQuotation(project.id, reauthName);
    await expect(listRow(page, created.id)).toBeVisible();
    expect(await ownQuotationNames(project.id)).toEqual([existingName, reauthName].sort());
  });
});
