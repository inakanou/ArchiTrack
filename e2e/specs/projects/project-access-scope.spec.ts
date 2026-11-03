/**
 * @fileoverview 案件の閲覧範囲の E2E テスト
 *
 * user-authentication タスク52.4。design.md の ProjectScopeService・ProjectScopeGuard の節。案件の一覧・
 * 状態ごとの件数は閲覧範囲内に絞られ、ID 指定の詳細は範囲外と不在（存在しない・論理削除）を同じ 404 にし、
 * 範囲外のときだけ監査（`PROJECT_SCOPE_DENIED`）に記録する。画面は詳細の 404 で「404 - ページが
 * 見つかりません」へ移る（frontend/src/pages/ProjectDetailPage.tsx）。
 *
 * Requirements (user-authentication):
 * - REQ-39.1: 案件の営業担当者・工事担当者・作成者のいずれか、または全案件閲覧の権限（`project:read_all`）を
 *   持つ利用者だけが案件を一覧と詳細で見られる。作成した利用者は自分の案件を見られる
 * - REQ-39.2: 担当外の利用者が詳細の URL を直接開くと「見つかりません」になり、応答は 404 で、存在しない案件・
 *   論理削除した案件と同じ本文（要求の URL を写す `instance` を除く）である
 * - REQ-39.3: 担当外の利用者の案件一覧（検索を含む）と状態ごとの件数に案件が出ない
 * - REQ-39.5: システム管理者ロールは既定で全案件閲覧の権限を持ち（全権限 `*:*`）、管理者は担当でない案件を
 *   一覧・件数・詳細で見られる。一般ユーザーロールは持たない
 * - REQ-39.6: 工事担当者・営業担当者に設定すると次の要求から見え、担当から外すと見えなくなる
 * - REQ-39.7: 範囲外のアクセスが、利用者・対象・日時とともに監査ログ画面に出る（「案件範囲外のアクセス」）
 *
 * 検証に使う案件はテストの中で作り（名前の接頭辞 `PROJECT_NAME_PREFIX`）、担当者の付け替えはその案件に
 * だけ行う。利用者はテストの中で作る一意のメールアドレスの利用者（`SESSION_USER_EMAIL_PREFIX`）とし、
 * 案件は営業担当者・作成者として利用者を参照する（外部キーが Restrict）ため、後始末で案件を先に消してから
 * 利用者を消す。通信の観測は URL のパスで照合する（CI とローカルで API のオリジンが異なるため）。
 */

import { randomBytes } from 'node:crypto';
import { test, expect, type APIRequestContext, type Page, type Response } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import {
  SESSION_USER_EMAIL_PREFIX,
  createCustomUser,
  createSessionUser,
  deleteSessionUsers,
  type CreatedUser,
} from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { loginViaApi } from '../../helpers/auth-api';
import { TEST_USERS } from '../../helpers/test-users';
import { API_BASE_URL } from '../../config';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';

/** テストの中で作る案件の名前の接頭辞（後始末で消す） */
const PROJECT_NAME_PREFIX = 'e2e-project-scope-';

/** テストの中で作るロールの名前の接頭辞（後始末で消す） */
const ROLE_NAME_PREFIX = 'e2e-project-scope-role-';

const PROJECTS_PATH = '/api/projects';
const STATUS_COUNTS_PATH = '/api/projects/status-counts';
const AUDIT_LOGS_PATH = '/api/v1/audit-logs';

/** 監査ログ画面の範囲外のアクセスの表示名（frontend/src/utils/audit-log-actions.ts） */
const SCOPE_DENIED_LABEL = '案件範囲外のアクセス';

/** 存在しない案件の ID */
const MISSING_PROJECT_ID = '00000000-0000-4000-8000-000000000000';

interface StatusCounts {
  counts: Record<string, number>;
  total: number;
}

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

/** 応答が指定のパスへの GET か（オリジンは問わない） */
function isGet(response: Response, path: string): boolean {
  return response.request().method() === 'GET' && new URL(response.url()).pathname === path;
}

/** 検証用の案件を DB に作る（状態は準備中。担当者を明示する） */
async function createProject(
  label: string,
  people: { salesPersonId: string; createdById: string; constructionPersonId?: string | null },
  options: { deleted?: boolean } = {}
): Promise<{ id: string; name: string }> {
  return getPrismaClient().project.create({
    data: {
      name: `${PROJECT_NAME_PREFIX}${label}-${uniqueSuffix()}`,
      salesPersonId: people.salesPersonId,
      createdById: people.createdById,
      constructionPersonId: people.constructionPersonId ?? null,
      deletedAt: options.deleted ? new Date() : null,
    },
    select: { id: true, name: true },
  });
}

/** 指定のロールだけを持つ利用者をテストの中で作る（後始末の `deleteSessionUsers` が消す） */
async function createUserWithRoles(label: string, roles: readonly string[]): Promise<CreatedUser> {
  return createCustomUser({
    email: `${SESSION_USER_EMAIL_PREFIX}scope-${label}-${uniqueSuffix()}@example.com`,
    password: TEST_USERS.REGULAR_USER.password,
    displayName: `閲覧範囲検証 ${label}`,
    roles,
  });
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

/** 検証用のロールを作る（システムロールでない） */
async function createRole(
  label: string,
  permissions: ReadonlyArray<{ resource: string; action: string }>
): Promise<string> {
  const prisma = getPrismaClient();
  const role = await prisma.role.create({
    data: {
      name: `${ROLE_NAME_PREFIX}${label}-${uniqueSuffix()}`,
      description: `E2E 案件の閲覧範囲の検証（${label}）`,
      priority: 0,
      isSystem: false,
    },
    select: { id: true, name: true },
  });
  for (const { resource, action } of permissions) {
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: await permissionId(resource, action) },
    });
  }
  return role.name;
}

/** ロールが持つ権限（`resource:action`）の一覧 */
async function rolePermissionKeys(roleName: string): Promise<string[]> {
  const rows = await getPrismaClient().rolePermission.findMany({
    where: { role: { name: roleName } },
    select: { permission: { select: { resource: true, action: true } } },
  });
  return rows.map((row) => `${row.permission.resource}:${row.permission.action}`).sort();
}

/** 利用者として API にログインし、Bearer のヘッダーを返す */
async function bearerFor(
  request: APIRequestContext,
  user: CreatedUser
): Promise<Record<string, string>> {
  const { accessToken } = await loginViaApi(request, user);
  expect(accessToken, `${user.email} のアクセストークン`).toBeTruthy();
  return { Authorization: `Bearer ${accessToken}` };
}

/** 画面のセッションを捨てて別の利用者でログインし直す */
async function switchUser(page: Page, user: CreatedUser): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await loginAsUser(page, user);
}

/**
 * 案件一覧を案件の名前で検索して開き、一覧と状態ごとの件数の応答を返す
 *
 * 画面の描画は `expectEmptyList`・`expectListedOnScreen` で確かめる。
 */
async function openProjectList(
  page: Page,
  projectName: string
): Promise<{ listedIds: string[]; statusCounts: StatusCounts }> {
  const listed = page.waitForResponse(
    (r) => isGet(r, PROJECTS_PATH) && new URL(r.url()).searchParams.get('search') === projectName,
    { timeout: getTimeout(30000) }
  );
  const counted = page.waitForResponse((r) => isGet(r, STATUS_COUNTS_PATH), {
    timeout: getTimeout(30000),
  });
  await page.goto(`/projects?search=${encodeURIComponent(projectName)}`);
  const listResponse = await listed;
  const countsResponse = await counted;
  expect(listResponse.status()).toBe(200);
  expect(countsResponse.status()).toBe(200);
  const list = (await listResponse.json()) as { data: Array<{ id: string }> };
  const statusCounts = (await countsResponse.json()) as StatusCounts;
  await waitForLoadingComplete(page, { timeout: getTimeout(30000) });

  return { listedIds: list.data.map((p) => p.id), statusCounts };
}

/** 状態ごとの件数の欄の見出し（画面は一覧が 1 件以上のときだけ描く。frontend/src/pages/ProjectListPage.tsx） */
function statusSummaryHeading(page: Page) {
  return page.getByRole('heading', { name: 'ステータス別件数（全プロジェクト）' });
}

/** 一覧が空で、案件の行と件数の欄が描かれないことを確かめる */
async function expectEmptyList(page: Page): Promise<void> {
  await expect(page.locator('[data-testid^="project-row-"]')).toHaveCount(0);
  await expect(statusSummaryHeading(page)).toHaveCount(0);
}

/** 案件の行が 1 行だけ描かれ、画面の件数の欄（全 N 件・準備中の件数）が応答と一致することを確かめる */
async function expectListedOnScreen(
  page: Page,
  projectId: string,
  statusCounts: StatusCounts
): Promise<void> {
  await expect(projectRow(page, projectId)).toBeVisible();
  await expect(page.locator('[data-testid^="project-row-"]')).toHaveCount(1);
  const summary = statusSummaryHeading(page).locator('xpath=../..');
  await expect(summary.getByText(/^全\s*\d+\s*件$/)).toHaveText(
    new RegExp(`^全\\s*${statusCounts.total}\\s*件$`)
  );
  await expect(
    summary.getByRole('button').filter({ hasText: '準備中' }).locator('div').first()
  ).toHaveText(String(statusCounts.counts.PREPARING));
}

/** 案件一覧の行（`project-row-<id>`） */
function projectRow(page: Page, projectId: string) {
  return page.getByTestId(`project-row-${projectId}`);
}

/** 詳細の URL を直接開き、詳細の集計の応答を返す */
async function openProjectDetail(page: Page, projectId: string): Promise<Response> {
  const loaded = page.waitForResponse(
    (r) => isGet(r, `${PROJECTS_PATH}/${projectId}/detail-summary`),
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/projects/${projectId}`);
  return loaded;
}

/** 詳細の URL を開くと 404 になり、画面が「見つかりません」を出すことを確かめ、応答の本文を返す */
async function expectDetailNotFound(
  page: Page,
  projectId: string
): Promise<Record<string, unknown>> {
  const response = await openProjectDetail(page, projectId);
  expect(response.status()).toBe(404);
  await expect(page).toHaveURL(/\/404$/, { timeout: getTimeout(15000) });
  await expect(
    page.getByRole('heading', { level: 1, name: '404 - ページが見つかりません' })
  ).toBeVisible();
  return (await response.json()) as Record<string, unknown>;
}

/** 詳細の URL を開くと案件の名前の見出しが出ることを確かめる */
async function expectDetailVisible(page: Page, project: { id: string; name: string }) {
  const response = await openProjectDetail(page, project.id);
  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: project.name })).toBeVisible({
    timeout: getTimeout(15000),
  });
}

/** 応答の本文から、要求の URL を写す `instance` を除く */
function withoutInstance(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'instance'));
}

/** 利用者が対象の案件について残した範囲外のアクセスの記録 */
async function scopeDeniedRecords(actorId: string, targetIds: readonly string[]) {
  return getPrismaClient().auditLog.findMany({
    where: { action: 'PROJECT_SCOPE_DENIED', actorId, targetId: { in: [...targetIds] } },
    select: { targetId: true, targetType: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

test.describe('案件の閲覧範囲', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    const prisma = getPrismaClient();
    // 案件は利用者を営業担当者・作成者として参照する（Restrict）ため、案件を先に消す
    await prisma.project.deleteMany({ where: { name: { startsWith: PROJECT_NAME_PREFIX } } });
    await deleteSessionUsers();
    await prisma.role.deleteMany({ where: { name: { startsWith: ROLE_NAME_PREFIX } } });
  });

  /**
   * @requirement user-authentication/REQ-39.1
   * @requirement user-authentication/REQ-39.2
   * @requirement user-authentication/REQ-39.3
   * @requirement user-authentication/REQ-39.6
   * @requirement user-authentication/REQ-39.7
   */
  test('担当外の利用者には一覧・件数・詳細で案件が見えず、範囲外のアクセスが監査ログ画面に出て、担当者に設定すると見え、外すと見えなくなる', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const auditor = await createSessionUser('ADMIN_USER');
    const project = await createProject('target', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    // 論理削除した案件は、利用者が営業担当者・作成者でも不在と同じに扱われる
    const deletedProject = await createProject(
      'deleted',
      { salesPersonId: outsider.id, createdById: outsider.id },
      { deleted: true }
    );

    // 前提: 担当外の利用者のロールは全案件閲覧の権限を持たない
    expect(await rolePermissionKeys('user')).not.toEqual(
      expect.arrayContaining(['project:read_all'])
    );
    expect(await rolePermissionKeys('user')).not.toContain('*:*');

    await loginAsUser(page, outsider);

    // 要件39.3: 一覧（検索）と状態ごとの件数に案件が出ない
    const before = await openProjectList(page, project.name);
    expect(before.listedIds).toEqual([]);
    await expectEmptyList(page);
    expect(before.statusCounts).toMatchObject({ total: 0, counts: { PREPARING: 0 } });

    // 要件39.2: 詳細の URL を直接開くと「見つかりません」になり、本文は不在・論理削除と同じ
    const outOfScopeBody = await expectDetailNotFound(page, project.id);
    const missingBody = await expectDetailNotFound(page, MISSING_PROJECT_ID);
    const deletedBody = await expectDetailNotFound(page, deletedProject.id);
    expect(outOfScopeBody).toMatchObject({ status: 404 });
    expect(withoutInstance(outOfScopeBody)).toEqual(withoutInstance(missingBody));
    expect(withoutInstance(outOfScopeBody)).toEqual(withoutInstance(deletedBody));
    expect(JSON.stringify(withoutInstance(outOfScopeBody))).not.toContain(project.id);

    // 要件39.7: 範囲外のアクセスだけが記録され、不在・論理削除は記録されない
    const denied = await scopeDeniedRecords(outsider.id, [
      project.id,
      MISSING_PROJECT_ID,
      deletedProject.id,
    ]);
    expect(denied.length).toBeGreaterThan(0);
    expect(denied.every((r) => r.targetId === project.id && r.targetType === 'Project')).toBe(true);

    // 要件39.6・39.1: 工事担当者に設定すると、次の要求から一覧・件数・詳細で見える
    await getPrismaClient().project.update({
      where: { id: project.id },
      data: { constructionPersonId: outsider.id },
    });
    const asConstruction = await openProjectList(page, project.name);
    expect(asConstruction.listedIds).toEqual([project.id]);
    expect(asConstruction.statusCounts).toMatchObject({ total: 1, counts: { PREPARING: 1 } });
    await expectListedOnScreen(page, project.id, asConstruction.statusCounts);
    await expectDetailVisible(page, project);

    // 要件39.6: 工事担当者から外すと、次の要求から見えなくなる
    await getPrismaClient().project.update({
      where: { id: project.id },
      data: { constructionPersonId: owner.id },
    });
    const removed = await openProjectList(page, project.name);
    expect(removed.listedIds).toEqual([]);
    expect(removed.statusCounts).toMatchObject({ total: 0, counts: { PREPARING: 0 } });
    await expectEmptyList(page);
    await expectDetailNotFound(page, project.id);
    // 外した後の範囲外のアクセスも記録される
    const deniedAfterRemoval = await scopeDeniedRecords(outsider.id, [project.id]);
    expect(deniedAfterRemoval.length).toBeGreaterThan(denied.length);

    // 要件39.6・39.1: 営業担当者に設定すると、次の要求から見える
    await getPrismaClient().project.update({
      where: { id: project.id },
      data: { salesPersonId: outsider.id },
    });
    const asSales = await openProjectList(page, project.name);
    expect(asSales.listedIds).toEqual([project.id]);
    expect(asSales.statusCounts).toMatchObject({ total: 1, counts: { PREPARING: 1 } });
    await expectListedOnScreen(page, project.id, asSales.statusCounts);
    await expectDetailVisible(page, project);
    // 範囲内のアクセスは記録されない
    const allDenied = await scopeDeniedRecords(outsider.id, [project.id]);
    expect(allDenied).toHaveLength(deniedAfterRemoval.length);

    // 要件39.7: 範囲外のアクセスが、利用者・対象・日時とともに監査ログ画面に出る
    await switchUser(page, auditor);
    const auditLoaded = page.waitForResponse((r) => isGet(r, AUDIT_LOGS_PATH), {
      timeout: getTimeout(30000),
    });
    await page.goto('/admin/audit-logs');
    expect((await auditLoaded).status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: '監査ログ' })).toBeVisible();
    const filtered = page.waitForResponse(
      (r) =>
        isGet(r, AUDIT_LOGS_PATH) &&
        new URL(r.url()).searchParams.get('action') === 'PROJECT_SCOPE_DENIED'
    );
    await page.getByLabel('イベント種別').selectOption(SCOPE_DENIED_LABEL);
    expect((await filtered).status()).toBe(200);
    const rows = page
      .getByRole('table')
      .locator('tbody tr')
      .filter({ has: page.getByRole('cell', { name: project.id, exact: true }) });
    // 範囲外の詳細の要求（設定の前と、工事担当者から外した後）の記録がすべて出る。最新の行が先頭
    await expect(rows).toHaveCount(allDenied.length);
    const cells = rows.first().getByRole('cell');
    const expectedDate = await page.evaluate(
      (iso) => new Date(iso).toLocaleString('ja-JP'),
      allDenied[0]!.createdAt.toISOString()
    );
    await expect(cells.nth(0)).toHaveText(expectedDate);
    await expect(cells.nth(1)).toHaveText(SCOPE_DENIED_LABEL);
    await expect(cells.nth(2)).toHaveText(outsider.email);
    await expect(cells.nth(3)).toHaveText(project.id);
  });

  /**
   * @requirement user-authentication/REQ-39.1
   */
  test('作成した利用者は、営業担当者・工事担当者でなくても自分の案件を一覧と詳細で見られる', async ({
    page,
    request,
  }) => {
    const salesPerson = await createSessionUser('REGULAR_USER');
    const creator = await createSessionUser('REGULAR_USER');

    // 作成者として画面と同じ API で案件を作る（営業担当者は別の利用者、工事担当者は無し）
    const headers = await bearerFor(request, creator);
    const name = `${PROJECT_NAME_PREFIX}creator-${uniqueSuffix()}`;
    const created = await request.post(`${API_BASE_URL}${PROJECTS_PATH}`, {
      headers,
      data: { name, salesPersonId: salesPerson.id },
    });
    expect(created.status(), await created.text()).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(
      await getPrismaClient().project.findUniqueOrThrow({
        where: { id },
        select: { createdById: true, salesPersonId: true, constructionPersonId: true },
      })
    ).toEqual({
      createdById: creator.id,
      salesPersonId: salesPerson.id,
      constructionPersonId: null,
    });

    await loginAsUser(page, creator);
    const listed = await openProjectList(page, name);
    expect(listed.listedIds).toEqual([id]);
    expect(listed.statusCounts).toMatchObject({ total: 1, counts: { PREPARING: 1 } });
    await expectListedOnScreen(page, id, listed.statusCounts);
    await expectDetailVisible(page, { id, name });
  });

  /**
   * @requirement user-authentication/REQ-39.1
   * @requirement user-authentication/REQ-39.5
   */
  test('管理者と全案件閲覧の権限を持つ利用者は担当でない案件を見られ、権限を持たない利用者は見られない', async ({
    page,
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const admin = await createSessionUser('ADMIN_USER');
    const project = await createProject('read-all', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });

    // 要件39.5: システム管理者ロールは全権限（全案件閲覧を含む）を既定で持ち、全案件閲覧の権限が定義されている
    expect(await rolePermissionKeys('admin')).toContain('*:*');
    await permissionId('project', 'read_all');

    // 管理者は担当でない案件を一覧・件数・詳細で見られる
    await loginAsUser(page, admin);
    const listed = await openProjectList(page, project.name);
    expect(listed.listedIds).toEqual([project.id]);
    await expectListedOnScreen(page, project.id, listed.statusCounts);
    const total = await getPrismaClient().project.count({ where: { deletedAt: null } });
    expect(listed.statusCounts.total).toBe(total);
    expect(listed.statusCounts.counts.PREPARING).toBe(
      await getPrismaClient().project.count({ where: { deletedAt: null, status: 'PREPARING' } })
    );
    await expectDetailVisible(page, project);
    expect(await scopeDeniedRecords(admin.id, [project.id])).toHaveLength(0);

    // 要件39.1: 全案件閲覧の権限を持つ利用者は見られ、同じロールから権限を除いた利用者は見られない
    const readOnly = [{ resource: 'project', action: 'read' }];
    const withReadAll = await createUserWithRoles('read-all', [
      await createRole('read-all', [...readOnly, { resource: 'project', action: 'read_all' }]),
    ]);
    const withoutReadAll = await createUserWithRoles('read-only', [
      await createRole('read-only', readOnly),
    ]);
    const search = `?search=${encodeURIComponent(project.name)}`;

    const allowedHeaders = await bearerFor(request, withReadAll);
    const allowedList = await request.get(`${API_BASE_URL}${PROJECTS_PATH}${search}`, {
      headers: allowedHeaders,
    });
    expect(allowedList.status()).toBe(200);
    expect(
      ((await allowedList.json()) as { data: Array<{ id: string }> }).data.map((p) => p.id)
    ).toEqual([project.id]);
    const allowedDetail = await request.get(`${API_BASE_URL}${PROJECTS_PATH}/${project.id}`, {
      headers: allowedHeaders,
    });
    expect(allowedDetail.status()).toBe(200);
    expect(await allowedDetail.json()).toMatchObject({ id: project.id, name: project.name });

    const deniedHeaders = await bearerFor(request, withoutReadAll);
    const deniedList = await request.get(`${API_BASE_URL}${PROJECTS_PATH}${search}`, {
      headers: deniedHeaders,
    });
    expect(deniedList.status()).toBe(200);
    expect(((await deniedList.json()) as { data: unknown[] }).data).toEqual([]);
    const deniedDetail = await request.get(`${API_BASE_URL}${PROJECTS_PATH}/${project.id}`, {
      headers: deniedHeaders,
    });
    expect(deniedDetail.status()).toBe(404);
  });
});
