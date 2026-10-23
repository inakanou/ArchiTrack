/**
 * @fileoverview 権限付与の上限と既定の権限の E2E テスト
 *
 * user-authentication タスク51.2。design.md の「PrivilegeCeilingPolicy・DefaultPermissionSeed・
 * AssignableUsersEndpoint」の節。ロールの割り当てと権限の追加は管理画面（`/admin/users`）が管理者
 * （admin ロール）だけに開くため、システム管理者でない実行者の操作は API で行う。システムロールの名前の
 * 変更は管理者がロールの編集画面で行う。
 *
 * Requirements (user-authentication):
 * - REQ-38.1: ユーザー更新の権限を持つ実行者が、自分の保有ロールより優先度の高いロールを割り当てると 403
 *   （`ROLE_PRIORITY_EXCEEDS_ACTOR`）になり、一括の割り当ても全体が反映されない。同じ優先度のロールは割り当てられる
 * - REQ-38.2: ロール更新の権限だけを持つ実行者がロールへ全権限（`*:*`）を追加すると、ユーザー更新の権限だけを
 *   持つ実行者がシステム管理者ロールを割り当てると 403（`SYSTEM_ADMIN_REQUIRED`）になり、DB は変わらない
 * - REQ-38.3: 管理者がロールの編集画面でシステムロールの名前を変えると拒否され（403
 *   `SYSTEM_ROLE_RENAME_FORBIDDEN`）、名前は変わらない。システムロールでないロールの名前は変えられる
 * - REQ-38.4: 一般ユーザーロールはユーザー一覧の閲覧権限（`user:read`）を持たず、一般ユーザーによる
 *   ユーザー一覧の取得（`GET /api/v1/users`）は 403 になる
 *
 * 上限による拒否は権限チェックの失敗（`PERMISSION_CHECK_FAILED`）として監査に記録されることも DB で確かめる。
 * 検証に使うロールと利用者はテストの中で作り（ロールは `ROLE_NAME_PREFIX`、利用者は
 * `SESSION_USER_EMAIL_PREFIX`）、各テストの終了時に消す。各拒否には、同じ実行者が上限の内側の操作を
 * できることを対照として添える（拒否が権限の不足など別の理由で起きていないことの確認）。
 */

import { randomBytes } from 'node:crypto';
import { test, expect, type APIRequestContext, type Response } from '@playwright/test';
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
import { getTimeout } from '../../helpers/wait-helpers';

/** テストの中で作るロールの名前の接頭辞（後始末で消す） */
const ROLE_NAME_PREFIX = 'e2e-ceiling-';

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
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

/** ロールを名前で引く（無ければ前提の誤りとして失敗する） */
async function roleByName(name: string): Promise<{ id: string; name: string; priority: number }> {
  const role = await getPrismaClient().role.findUnique({
    where: { name },
    select: { id: true, name: true, priority: true },
  });
  if (!role) {
    throw new Error(`ロール ${name} が見つかりません（検証の前提の誤り）`);
  }
  return role;
}

/** 検証用のロールを作る（システムロールでない） */
async function createRole(
  label: string,
  priority: number,
  permissions: ReadonlyArray<{ resource: string; action: string }> = []
): Promise<{ id: string; name: string; priority: number }> {
  const prisma = getPrismaClient();
  const role = await prisma.role.create({
    data: {
      name: `${ROLE_NAME_PREFIX}${label}-${uniqueSuffix()}`,
      description: `E2E 権限付与の上限の検証（${label}）`,
      priority,
      isSystem: false,
    },
    select: { id: true, name: true, priority: true },
  });
  for (const { resource, action } of permissions) {
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: await permissionId(resource, action) },
    });
  }
  return role;
}

/** 指定のロールだけを持つ利用者をテストの中で作る（後始末の `deleteSessionUsers` が消す） */
async function createUserWithRoles(label: string, roles: readonly string[]): Promise<CreatedUser> {
  return createCustomUser({
    email: `${SESSION_USER_EMAIL_PREFIX}ceiling-${label}-${uniqueSuffix()}@example.com`,
    password: TEST_USERS.REGULAR_USER.password,
    displayName: `上限検証 ${label}`,
    roles,
  });
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

/** ロールが持つ権限（`resource:action`）の一覧 */
async function rolePermissionKeys(roleId: string): Promise<string[]> {
  const rows = await getPrismaClient().rolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { resource: true, action: true } } },
  });
  return rows.map((row) => `${row.permission.resource}:${row.permission.action}`).sort();
}

/** 利用者が持つロールの名前の一覧 */
async function userRoleNames(userId: string): Promise<string[]> {
  const rows = await getPrismaClient().userRole.findMany({
    where: { userId },
    select: { role: { select: { name: true } } },
  });
  return rows.map((row) => row.role.name).sort();
}

/** 実行者の権限チェックの失敗の監査の記録（上限による拒否の記録） */
async function ceilingRejections(actorId: string, targetType: string, targetId: string) {
  return getPrismaClient().auditLog.findMany({
    where: { action: 'PERMISSION_CHECK_FAILED', actorId, targetType, targetId },
    select: { metadata: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** 応答が 403 で、上限による拒否の本文（`code`）を持つことを確かめる */
async function expectCeilingRejection(
  response: Awaited<ReturnType<APIRequestContext['post']>>,
  code: string
): Promise<void> {
  expect(response.status(), await response.text()).toBe(403);
  expect(await response.json()).toMatchObject({ error: 'FORBIDDEN', code });
}

test.describe('権限付与の上限と既定の権限', () => {
  test.describe.configure({ mode: 'serial' });

  /** システムロールの名前を変える検証が誤って成立したときに戻すための元の名前 */
  const systemRoleNames = new Map<string, string>();

  test.afterEach(async () => {
    const prisma = getPrismaClient();
    // 名前の変更が誤って成立していても、共有のシステムロールの名前を必ず戻す（他の spec を壊さない）
    for (const [id, name] of systemRoleNames) {
      await prisma.role.updateMany({ where: { id, NOT: { name } }, data: { name } });
    }
    systemRoleNames.clear();
    // 利用者を先に消し（ロールの割り当ては連なって消える）、続けて検証用のロールを消す
    await deleteSessionUsers();
    await prisma.role.deleteMany({ where: { name: { startsWith: ROLE_NAME_PREFIX } } });
  });

  /**
   * @requirement user-authentication/REQ-38.2
   */
  test('ロール更新の権限だけを持つ利用者は全権限を追加できず、上限の内側の権限は追加できる', async ({
    request,
  }) => {
    const roleUpdater = await createRole('role-updater', 10, [
      { resource: 'role', action: 'update' },
    ]);
    const target = await createRole('target', 0);
    const actor = await createUserWithRoles('role-updater', [roleUpdater.name]);
    const headers = await bearerFor(request, actor);
    const allPermissionId = await permissionId('*', '*');
    const adrReadId = await permissionId('adr', 'read');

    // 他のロールへの全権限の追加は拒否される
    const toTarget = await request.post(`${API_BASE_URL}/api/v1/roles/${target.id}/permissions`, {
      headers,
      data: { permissionIds: [allPermissionId] },
    });
    await expectCeilingRejection(toTarget, 'SYSTEM_ADMIN_REQUIRED');

    // 自分のロールへの全権限の追加（自分の昇格）も拒否される
    const toOwnRole = await request.post(
      `${API_BASE_URL}/api/v1/roles/${roleUpdater.id}/permissions`,
      { headers, data: { permissionId: allPermissionId } }
    );
    await expectCeilingRejection(toOwnRole, 'SYSTEM_ADMIN_REQUIRED');

    // 一括の追加に全権限が 1 件でも含まれると、上限の内側の権限も含めて全体が反映されない
    const bulk = await request.post(`${API_BASE_URL}/api/v1/roles/${target.id}/permissions`, {
      headers,
      data: { permissionIds: [adrReadId, allPermissionId] },
    });
    await expectCeilingRejection(bulk, 'SYSTEM_ADMIN_REQUIRED');

    expect(await rolePermissionKeys(target.id)).toEqual([]);
    expect(await rolePermissionKeys(roleUpdater.id)).toEqual(['role:update']);

    // 拒否は権限チェックの失敗として、対象のロールと拒否した権限とともに記録される
    const targetRecords = await ceilingRejections(actor.id, 'role-permission', target.id);
    expect(targetRecords).toHaveLength(2);
    for (const record of targetRecords) {
      expect(record.metadata).toMatchObject({
        reason: 'SYSTEM_ADMIN_REQUIRED',
        permission: '*:*',
        permissionId: allPermissionId,
      });
    }
    const ownRoleRecords = await ceilingRejections(actor.id, 'role-permission', roleUpdater.id);
    expect(ownRoleRecords).toHaveLength(1);
    expect(ownRoleRecords[0]!.metadata).toMatchObject({
      reason: 'SYSTEM_ADMIN_REQUIRED',
      permission: '*:*',
    });

    // 対照: 同じ実行者は全権限でない権限を追加できる（拒否の理由はロール更新の権限の不足ではない）
    const allowed = await request.post(`${API_BASE_URL}/api/v1/roles/${target.id}/permissions`, {
      headers,
      data: { permissionIds: [adrReadId] },
    });
    expect(allowed.status(), await allowed.text()).toBe(204);
    expect(await rolePermissionKeys(target.id)).toEqual(['adr:read']);
  });

  /**
   * @requirement user-authentication/REQ-38.2
   */
  test('ユーザー更新の権限だけを持つ利用者はシステム管理者ロールを割り当てられず、上限の内側のロールは割り当てられる', async ({
    request,
  }) => {
    const userUpdater = await createRole('user-updater', 50, [
      { resource: 'user', action: 'update' },
    ]);
    const actor = await createUserWithRoles('user-updater', [userUpdater.name]);
    const subject = await createUserWithRoles('subject', []);
    const headers = await bearerFor(request, actor);
    const adminRole = await roleByName('admin');
    const userRole = await roleByName('user');

    // 他の利用者へのシステム管理者ロールの割り当ては拒否される
    const toSubject = await request.post(`${API_BASE_URL}/api/v1/users/${subject.id}/roles`, {
      headers,
      data: { roleIds: [adminRole.id] },
    });
    await expectCeilingRejection(toSubject, 'SYSTEM_ADMIN_REQUIRED');

    // 自分へのシステム管理者ロールの割り当て（自分の昇格）も拒否される
    const toSelf = await request.post(`${API_BASE_URL}/api/v1/users/${actor.id}/roles`, {
      headers,
      data: { roleIds: [adminRole.id] },
    });
    await expectCeilingRejection(toSelf, 'SYSTEM_ADMIN_REQUIRED');

    expect(await userRoleNames(subject.id)).toEqual([]);
    expect(await userRoleNames(actor.id)).toEqual([userUpdater.name]);

    // 拒否は権限チェックの失敗として、対象の利用者と拒否したロールとともに記録される
    const subjectRecords = await ceilingRejections(actor.id, 'user-role', subject.id);
    expect(subjectRecords).toHaveLength(1);
    expect(subjectRecords[0]!.metadata).toMatchObject({
      reason: 'SYSTEM_ADMIN_REQUIRED',
      roleId: adminRole.id,
    });
    const selfRecords = await ceilingRejections(actor.id, 'user-role', actor.id);
    expect(selfRecords).toHaveLength(1);
    expect(selfRecords[0]!.metadata).toMatchObject({
      reason: 'SYSTEM_ADMIN_REQUIRED',
      roleId: adminRole.id,
    });

    // 対照: 同じ実行者は自分の優先度以下のロール（一般ユーザー）を割り当てられる
    const allowed = await request.post(`${API_BASE_URL}/api/v1/users/${subject.id}/roles`, {
      headers,
      data: { roleIds: [userRole.id] },
    });
    expect(allowed.status(), await allowed.text()).toBe(204);
    expect(await userRoleNames(subject.id)).toEqual(['user']);
  });

  /**
   * @requirement user-authentication/REQ-38.1
   */
  test('自分の保有ロールより優先度の高いロールは割り当てられず、同じ優先度のロールは割り当てられる', async ({
    request,
  }) => {
    const userUpdater = await createRole('assigner', 50, [{ resource: 'user', action: 'update' }]);
    const higher = await createRole('higher', 51);
    const equal = await createRole('equal', 50);
    const actor = await createUserWithRoles('assigner', [userUpdater.name]);
    const subject = await createUserWithRoles('subject', []);
    const headers = await bearerFor(request, actor);

    // 実行者の上限（50）を超えるロールの割り当ては拒否される
    const single = await request.post(`${API_BASE_URL}/api/v1/users/${subject.id}/roles`, {
      headers,
      data: { roleIds: [higher.id] },
    });
    await expectCeilingRejection(single, 'ROLE_PRIORITY_EXCEEDS_ACTOR');

    // 一括の割り当てに上限を超えるロールが 1 件でも含まれると、上限の内側のロールも含めて全体が反映されない
    const bulk = await request.post(`${API_BASE_URL}/api/v1/users/${subject.id}/roles`, {
      headers,
      data: { roleIds: [equal.id, higher.id] },
    });
    await expectCeilingRejection(bulk, 'ROLE_PRIORITY_EXCEEDS_ACTOR');

    // 自分への上限を超えるロールの割り当て（自分の昇格）も拒否される
    const toSelf = await request.post(`${API_BASE_URL}/api/v1/users/${actor.id}/roles`, {
      headers,
      data: { roleIds: [higher.id] },
    });
    await expectCeilingRejection(toSelf, 'ROLE_PRIORITY_EXCEEDS_ACTOR');

    expect(await userRoleNames(subject.id)).toEqual([]);
    expect(await userRoleNames(actor.id)).toEqual([userUpdater.name]);

    const records = await ceilingRejections(actor.id, 'user-role', subject.id);
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record.metadata).toMatchObject({
        reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
        roleId: higher.id,
      });
    }

    // 対照: 同じ実行者は自分と同じ優先度（上限ちょうど）のロールを割り当てられる
    const allowed = await request.post(`${API_BASE_URL}/api/v1/users/${subject.id}/roles`, {
      headers,
      data: { roleIds: [equal.id] },
    });
    expect(allowed.status(), await allowed.text()).toBe(204);
    expect(await userRoleNames(subject.id)).toEqual([equal.name]);
  });

  /**
   * @requirement user-authentication/REQ-38.3
   */
  test('管理者がロールの編集画面でシステムロールの名前を変えると拒否され、システムロールでないロールの名前は変えられる', async ({
    page,
  }) => {
    const prisma = getPrismaClient();
    const userRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'user' },
      select: { id: true, name: true, isSystem: true },
    });
    expect(userRole.isSystem, '一般ユーザーロールはシステムロール').toBe(true);
    systemRoleNames.set(userRole.id, userRole.name);
    const custom = await createRole('renamable', 0);
    const admin = await createSessionUser('ADMIN_USER');

    await loginAsUser(page, admin);
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: /ユーザー.*ロール管理/ })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await page.getByRole('tab', { name: 'ロールタブ' }).click();

    // システムロール（user）の名前を変えて保存すると、403 で拒否され、ダイアログに失敗が出る
    await page.getByRole('button', { name: 'userを編集', exact: true }).click();
    const requestedName = `${ROLE_NAME_PREFIX}renamed-${uniqueSuffix()}`;
    await page.getByLabel('ロール名 *').fill(requestedName);
    const rejected = page.waitForResponse(
      (r: Response) =>
        r.request().method() === 'PATCH' &&
        new URL(r.url()).pathname === `/api/v1/roles/${userRole.id}`
    );
    await page.getByRole('button', { name: 'ロールを更新', exact: true }).click();
    const rejectedResponse = await rejected;
    expect(rejectedResponse.status()).toBe(403);
    expect(await rejectedResponse.json()).toMatchObject({
      error: 'FORBIDDEN',
      code: 'SYSTEM_ROLE_RENAME_FORBIDDEN',
    });
    await expect(
      page.getByRole('alert').filter({ hasText: 'ロールの保存に失敗しました' })
    ).toBeVisible();

    // 名前は変わらず、拒否は権限チェックの失敗として記録される
    expect(
      await prisma.role.findUniqueOrThrow({ where: { id: userRole.id }, select: { name: true } })
    ).toEqual({ name: 'user' });
    expect(await prisma.role.count({ where: { name: requestedName } })).toBe(0);
    const records = await ceilingRejections(admin.id, 'role', userRole.id);
    expect(records).toHaveLength(1);
    expect(records[0]!.metadata).toMatchObject({
      reason: 'SYSTEM_ROLE_RENAME_FORBIDDEN',
      currentName: 'user',
      requestedName,
    });

    // 対照: 同じ管理者は、システムロールでないロールの名前を同じ画面で変えられる
    await page.getByRole('button', { name: 'キャンセル' }).click();
    await page.getByRole('button', { name: `${custom.name}を編集`, exact: true }).click();
    const renamed = `${custom.name}-renamed`;
    await page.getByLabel('ロール名 *').fill(renamed);
    const accepted = page.waitForResponse(
      (r: Response) =>
        r.request().method() === 'PATCH' &&
        new URL(r.url()).pathname === `/api/v1/roles/${custom.id}`
    );
    await page.getByRole('button', { name: 'ロールを更新', exact: true }).click();
    expect((await accepted).status()).toBe(200);
    await expect(page.getByText('ロールを更新しました')).toBeVisible();
    expect(
      await prisma.role.findUniqueOrThrow({ where: { id: custom.id }, select: { name: true } })
    ).toEqual({ name: renamed });
  });

  /**
   * @requirement user-authentication/REQ-38.4
   */
  test('一般ユーザーロールはユーザー一覧の閲覧権限を持たず、一般ユーザーはユーザー一覧を取得できない', async ({
    request,
  }) => {
    // 既定の権限: 一般ユーザーロールに user:read が割り当てられていない
    const userRole = await roleByName('user');
    const userRolePermissions = await rolePermissionKeys(userRole.id);
    expect(userRolePermissions).not.toContain('user:read');
    expect(userRolePermissions).not.toContain('*:*');
    expect(userRolePermissions).not.toContain('user:*');

    const regular = await createSessionUser('REGULAR_USER');
    const regularHeaders = await bearerFor(request, regular);

    // 一般ユーザーによるユーザー一覧の取得は、ユーザー一覧の閲覧権限の不足で 403 になる
    const listed = await request.get(`${API_BASE_URL}/api/v1/users`, { headers: regularHeaders });
    expect(listed.status(), '一般ユーザーによるユーザー一覧の取得').toBe(403);
    expect(await listed.json()).toMatchObject({ error: 'FORBIDDEN', required: 'user:read' });

    // 対照: 同じトークンで担当者候補（最小限の情報）は取得でき、管理者はユーザー一覧を取得できる
    const assignable = await request.get(`${API_BASE_URL}/api/users/assignable`, {
      headers: regularHeaders,
    });
    expect(assignable.status(), await assignable.text()).toBe(200);

    const admin = await createSessionUser('ADMIN_USER');
    const adminHeaders = await bearerFor(request, admin);
    const adminListed = await request.get(`${API_BASE_URL}/api/v1/users`, {
      headers: adminHeaders,
    });
    expect(adminListed.status(), '管理者によるユーザー一覧の取得').toBe(200);
  });
});
