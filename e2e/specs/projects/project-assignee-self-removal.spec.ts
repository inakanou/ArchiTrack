/**
 * @fileoverview 担当者の変更で自分が閲覧範囲から外れるときの確認の E2E テスト
 *
 * project-management タスク82.3。編集画面で保存を選んだとき、変更後の営業担当者・工事担当者のどちらにも
 * 自分が含まれず、作成者でも全プロジェクトの閲覧権限（`project:read_all`）の保持者でもなければ、保存の前に
 * 確認ダイアログ（frontend/src/components/projects/AssigneeSelfRemovalDialog.tsx）を出す。判定は画面で行う
 * （design.md「Requirements 42-46」D4。frontend/src/pages/ProjectEditPage.tsx）。
 *
 * Requirements coverage (project-management):
 * - REQ-45.1: 自分が外れる変更の保存で、逐語の確認ダイアログと「保存する」「キャンセル」を出す
 * - REQ-45.2: 「キャンセル」で閉じ、保存せず、入力を保ったまま編集画面に留まる
 * - REQ-45.3: 「保存する」で保存が成功すると、プロジェクト一覧へ移り逐語の通知を出す
 * - REQ-45.4: 変更後も自分が閲覧範囲に含まれるときは、確認を出さずに保存し詳細画面へ移る
 *   （工事担当者を空にする変更を含む）
 * - REQ-45.5: 「保存する」を選んだ自分を外す変更は保存される
 *
 * 利用者はテストの中で作る一意のメールアドレス・表示名の利用者（`SESSION_USER_EMAIL_PREFIX`）で、ロールは
 * 一般ユーザー（`user`。`project:update` を持ち `project:read_all` を持たない）とする。案件は DB に直接作り
 * （名前の接頭辞 `PROJECT_NAME_PREFIX`）、作成者は編集する利用者と別の利用者にする。案件は利用者を参照する
 * （外部キーが Restrict）ため、後始末で案件を先に消してから利用者を消す。通信の観測は URL のパスで照合する
 * （CI とローカルで API のオリジンが異なるため）。
 */

import { randomBytes } from 'node:crypto';
import { test, expect, type Page, type Request } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import {
  SESSION_USER_EMAIL_PREFIX,
  createCustomUser,
  deleteSessionUsers,
  type CreatedUser,
} from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { TEST_USERS } from '../../helpers/test-users';
import { getTimeout } from '../../helpers/wait-helpers';

/** テストの中で作る案件の名前の接頭辞（後始末で消す） */
const PROJECT_NAME_PREFIX = 'e2e-assignee-self-removal-';

/** 確認ダイアログの本文（要件45.1 の逐語） */
const CONFIRM_MESSAGE =
  'この変更を保存すると、あなたはこのプロジェクトを閲覧できなくなります。保存しますか？';

/** 保存の後の通知（要件45.3 の逐語） */
const UPDATED_WITHOUT_ACCESS_MESSAGE =
  'プロジェクトを更新しました。担当者から外れたため、このプロジェクトは閲覧できなくなりました';

/** 確認ダイアログの見出し（AssigneeSelfRemovalDialog の aria-labelledby） */
const DIALOG_NAME = '担当者の変更の確認';

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

/** 一般ユーザーのロールの利用者を一意の表示名で作る（担当者の選択肢を表示名で選ぶため） */
async function createRegularUser(label: string): Promise<CreatedUser> {
  const suffix = uniqueSuffix();
  return createCustomUser({
    email: `${SESSION_USER_EMAIL_PREFIX}self-removal-${label}-${suffix}@example.com`,
    password: TEST_USERS.REGULAR_USER.password,
    displayName: `担当外れ検証 ${label} ${suffix}`,
    roles: ['user'],
  });
}

/** 検証用の案件を DB に作る */
async function createProject(people: {
  salesPersonId: string;
  createdById: string;
  constructionPersonId?: string | null;
}): Promise<{ id: string; name: string }> {
  return getPrismaClient().project.create({
    data: {
      name: `${PROJECT_NAME_PREFIX}${uniqueSuffix()}`,
      salesPersonId: people.salesPersonId,
      createdById: people.createdById,
      constructionPersonId: people.constructionPersonId ?? null,
    },
    select: { id: true, name: true },
  });
}

/** 案件の担当者と更新日時を DB から読む */
async function assigneesOf(projectId: string) {
  return getPrismaClient().project.findUniqueOrThrow({
    where: { id: projectId },
    select: { salesPersonId: true, constructionPersonId: true, updatedAt: true },
  });
}

/** ロールが持つ権限（`resource:action`）の一覧 */
async function rolePermissionKeys(roleName: string): Promise<string[]> {
  const rows = await getPrismaClient().rolePermission.findMany({
    where: { role: { name: roleName } },
    select: { permission: { select: { resource: true, action: true } } },
  });
  return rows.map((row) => `${row.permission.resource}:${row.permission.action}`);
}

/** 案件の更新の要求（PUT /api/projects/:id）か（オリジンは問わない） */
function isProjectUpdate(request: Request, projectId: string): boolean {
  return (
    request.method() === 'PUT' && new URL(request.url()).pathname === `/api/projects/${projectId}`
  );
}

function salesSelect(page: Page) {
  return page.getByRole('combobox', { name: '営業担当者', exact: true });
}

function constructionSelect(page: Page) {
  return page.getByRole('combobox', { name: '工事担当者', exact: true });
}

function confirmDialog(page: Page) {
  return page.getByRole('dialog', { name: DIALOG_NAME });
}

/** 編集画面を開き、担当者の選択肢が読み込まれて現在の担当者が選ばれるまで待つ */
async function openEditPage(
  page: Page,
  projectId: string,
  current: { salesPersonId: string; constructionPersonId: string | null }
): Promise<void> {
  await page.goto(`/projects/${projectId}/edit`);
  await expect(page.getByRole('heading', { level: 1, name: 'プロジェクトを編集' })).toBeVisible({
    timeout: getTimeout(15000),
  });
  await expect(salesSelect(page)).toHaveValue(current.salesPersonId, {
    timeout: getTimeout(15000),
  });
  await expect(constructionSelect(page)).toHaveValue(current.constructionPersonId ?? '');
}

test.describe('担当者の変更で自分が外れるときの確認', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    const prisma = getPrismaClient();
    // 案件は利用者を営業担当者・作成者として参照する（Restrict）ため、案件を先に消す
    await prisma.project.deleteMany({ where: { name: { startsWith: PROJECT_NAME_PREFIX } } });
    await deleteSessionUsers();
  });

  /**
   * @requirement project-management/REQ-45.1
   * @requirement project-management/REQ-45.2
   * @requirement project-management/REQ-45.3
   * @requirement project-management/REQ-45.5
   */
  test('自分を担当者から外すと確認が出て、キャンセルで留まり、保存する で一覧へ移って通知が出て、詳細は不在の表示になる', async ({
    page,
  }) => {
    const me = await createRegularUser('me');
    const other = await createRegularUser('other');
    const creator = await createRegularUser('creator');
    const project = await createProject({ salesPersonId: me.id, createdById: creator.id });

    // 前提: 一般ユーザーのロールは更新の権限を持ち、全プロジェクトの閲覧権限を持たない
    const permissions = await rolePermissionKeys('user');
    expect(permissions).toContain('project:update');
    expect(permissions).not.toContain('project:read_all');
    expect(permissions).not.toContain('*:*');
    const before = await assigneesOf(project.id);

    const updateRequests: string[] = [];
    page.on('request', (request) => {
      if (isProjectUpdate(request, project.id)) updateRequests.push(request.url());
    });

    await loginAsUser(page, me);
    await openEditPage(page, project.id, { salesPersonId: me.id, constructionPersonId: null });

    // 営業担当者を別の利用者へ替え、工事担当者は空のまま（自分がどちらにも残らない）
    await salesSelect(page).selectOption({ label: other.displayName });
    await expect(salesSelect(page)).toHaveValue(other.id);
    await page.getByRole('button', { name: '保存', exact: true }).click();

    // 要件45.1: 保存の前に逐語の確認と「保存する」「キャンセル」を出す
    const dialog = confirmDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(CONFIRM_MESSAGE, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '保存する', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'キャンセル', exact: true })).toBeVisible();

    // 要件45.2: キャンセルで閉じ、保存せず、入力を保ったまま編集画面に留まる
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await expect(confirmDialog(page)).toHaveCount(0);
    await expect(page).toHaveURL((url) => url.pathname === `/projects/${project.id}/edit`);
    await expect(salesSelect(page)).toHaveValue(other.id);
    await expect(constructionSelect(page)).toHaveValue('');
    expect(updateRequests).toEqual([]);
    expect(await assigneesOf(project.id)).toEqual(before);

    // 要件45.5・45.3: もう一度保存を選び「保存する」で保存し、一覧へ移って逐語の通知を出す
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(confirmDialog(page)).toBeVisible();
    const updated = page.waitForResponse((r) => isProjectUpdate(r.request(), project.id), {
      timeout: getTimeout(30000),
    });
    await confirmDialog(page).getByRole('button', { name: '保存する', exact: true }).click();
    expect((await updated).status()).toBe(200);
    await expect(page).toHaveURL((url) => url.pathname === '/projects');
    await expect(
      page.getByRole('alert').filter({ hasText: UPDATED_WITHOUT_ACCESS_MESSAGE })
    ).toBeVisible();
    await expect(confirmDialog(page)).toHaveCount(0);
    expect(updateRequests).toHaveLength(1);

    // 要件45.5: 自分を外す変更が保存されている
    const after = await assigneesOf(project.id);
    expect(after.salesPersonId).toBe(other.id);
    expect(after.constructionPersonId).toBeNull();

    // 外れた後に詳細を開くと不在の表示になり、案件の名前を出さない（要件44.2）
    await page.goto(`/projects/${project.id}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'プロジェクトが見つかりません' })
    ).toBeVisible({ timeout: getTimeout(15000) });
    await expect(page.getByRole('link', { name: 'プロジェクト一覧に戻る' })).toHaveAttribute(
      'href',
      '/projects'
    );
    await expect(page.locator('body')).not.toContainText(project.name);
  });

  /**
   * @requirement project-management/REQ-45.4
   */
  test('担当者に残る変更では確認を出さずに保存して詳細へ移り、工事担当者を空にする変更も保存される', async ({
    page,
  }) => {
    const me = await createRegularUser('me');
    const other = await createRegularUser('other');
    const creator = await createRegularUser('creator');
    const project = await createProject({
      salesPersonId: me.id,
      constructionPersonId: other.id,
      createdById: creator.id,
    });

    const permissions = await rolePermissionKeys('user');
    expect(permissions).toContain('project:update');
    expect(permissions).not.toContain('project:read_all');

    await loginAsUser(page, me);

    // 1 回目: 自分は営業担当者に残り、工事担当者を空にする
    await openEditPage(page, project.id, { salesPersonId: me.id, constructionPersonId: other.id });
    await constructionSelect(page).selectOption('');
    await expect(constructionSelect(page)).toHaveValue('');
    const firstUpdate = page.waitForResponse((r) => isProjectUpdate(r.request(), project.id), {
      timeout: getTimeout(30000),
    });
    await page.getByRole('button', { name: '保存', exact: true }).click();
    const firstResponse = await firstUpdate;
    expect(firstResponse.status()).toBe(200);
    // 空にした工事担当者は null（紐付けを外す）として送られる
    expect(firstResponse.request().postDataJSON()).toMatchObject({ constructionPersonId: null });
    await expect(page).toHaveURL((url) => url.pathname === `/projects/${project.id}`);
    await expect(page.getByRole('heading', { level: 1, name: project.name })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(
      page.getByRole('alert').filter({ hasText: 'プロジェクトを更新しました' })
    ).toBeVisible();
    await expect(page.getByText(UPDATED_WITHOUT_ACCESS_MESSAGE)).toHaveCount(0);
    await expect(confirmDialog(page)).toHaveCount(0);
    expect(await assigneesOf(project.id)).toMatchObject({
      salesPersonId: me.id,
      constructionPersonId: null,
    });

    // 2 回目: 営業担当者を別の利用者へ替えるが、自分を工事担当者にする（担当者に残る）
    await openEditPage(page, project.id, { salesPersonId: me.id, constructionPersonId: null });
    await salesSelect(page).selectOption({ label: other.displayName });
    await constructionSelect(page).selectOption({ label: me.displayName });
    await expect(salesSelect(page)).toHaveValue(other.id);
    await expect(constructionSelect(page)).toHaveValue(me.id);
    const secondUpdate = page.waitForResponse((r) => isProjectUpdate(r.request(), project.id), {
      timeout: getTimeout(30000),
    });
    await page.getByRole('button', { name: '保存', exact: true }).click();
    expect((await secondUpdate).status()).toBe(200);
    await expect(page).toHaveURL((url) => url.pathname === `/projects/${project.id}`);
    await expect(page.getByRole('heading', { level: 1, name: project.name })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(confirmDialog(page)).toHaveCount(0);
    expect(await assigneesOf(project.id)).toMatchObject({
      salesPersonId: other.id,
      constructionPersonId: me.id,
    });
  });
});
