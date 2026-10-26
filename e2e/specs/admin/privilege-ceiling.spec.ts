/**
 * @fileoverview 権限付与の上限と既定の権限の E2E テスト
 *
 * user-authentication タスク51.2・58.2（58.2 は 2026-10-26 の要件38 の拡張の 38.6〜38.12）。design.md の
 * 「PrivilegeCeilingPolicy・DefaultPermissionSeed・AssignableUsersEndpoint」の節。ロールの割り当てと権限の
 * 追加は管理画面（`/admin/users`）が管理者（admin ロール）だけに開くため、システム管理者でない実行者の操作は
 * API で行う。システムロールの名前の変更は管理者がロールの編集画面で行う。
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
 * - REQ-38.6: ロール更新の権限だけを持つ実行者が、ロールの優先度を自分の上限より高い値へ変えると 403
 *   （`ROLE_PRIORITY_EXCEEDS_ACTOR`）になり、優先度は変わらない。上限ちょうどへは変えられる
 * - REQ-38.7: ロール作成の権限だけを持つ実行者が、上限より高い優先度のロールを作ると 403 になり、ロールは
 *   作られない。上限ちょうどの優先度のロールは作れる
 * - REQ-38.8: ロール更新の権限を持つシステム管理者でない実行者が、保有しない権限をロールへ追加すると 403
 *   （`PERMISSION_NOT_HELD_BY_ACTOR`）になり、一括の追加も全体が反映されない。保有する権限は追加できる
 * - REQ-38.9: ユーザー更新の権限だけを持つ実行者が、上限より高い優先度のロールの割り当てを他の利用者から
 *   外すと 403 になり、割り当ては残る。上限ちょうどのロールの割り当ては外せる
 * - REQ-38.10: ロールの作成・変更でシステム管理者ロールの優先度（100）を超える優先度を指定すると 400
 *   （`VALIDATION_ERROR`）になり、権限チェックの失敗として記録されない。100 ちょうどは指定できる
 * - REQ-38.11: ロール更新・ロール削除の権限を持つ実行者が、上限より高い優先度のロールの優先度を下げる・
 *   権限を追加する・権限を削除する・ロールを削除すると 403 になり、DB は変わらない。上限ちょうどのロールへの
 *   同じ操作と、上限より上のロールの説明だけの変更はできる
 * - REQ-38.12: システム管理者がシステムロール（admin・user）の優先度を変えると 403
 *   （`SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN`）になり、優先度は変わらない。優先度を変えない更新と、
 *   システムロールでないロールの優先度の変更はできる
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

/** 実行者の権限チェックの失敗の記録の総数（対象によらない。想定外の拒否の記録が無いことの確認） */
async function actorRejectionCount(actorId: string): Promise<number> {
  return getPrismaClient().auditLog.count({
    where: { action: 'PERMISSION_CHECK_FAILED', actorId },
  });
}

/** ロールの現在の優先度（ロールが無ければ前提の誤りとして失敗する） */
async function rolePriority(roleId: string): Promise<number> {
  const role = await getPrismaClient().role.findUniqueOrThrow({
    where: { id: roleId },
    select: { priority: true },
  });
  return role.priority;
}

test.describe('権限付与の上限と既定の権限', () => {
  test.describe.configure({ mode: 'serial' });

  /** システムロールの名前を変える検証が誤って成立したときに戻すための元の名前 */
  const systemRoleNames = new Map<string, string>();
  /** システムロールの優先度を変える検証が誤って成立したときに戻すための元の優先度 */
  const systemRolePriorities = new Map<string, number>();

  test.afterEach(async () => {
    const prisma = getPrismaClient();
    // 名前の変更が誤って成立していても、共有のシステムロールの名前を必ず戻す（他の spec を壊さない）
    for (const [id, name] of systemRoleNames) {
      await prisma.role.updateMany({ where: { id, NOT: { name } }, data: { name } });
    }
    systemRoleNames.clear();
    // 優先度の変更が誤って成立していても、共有のシステムロールの優先度を必ず戻す
    for (const [id, priority] of systemRolePriorities) {
      await prisma.role.updateMany({ where: { id, NOT: { priority } }, data: { priority } });
    }
    systemRolePriorities.clear();
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
    // 保有しない権限の追加は要件38.8 で拒否されるため、対照で追加する adr:read を実行者に持たせる
    const roleUpdater = await createRole('role-updater', 10, [
      { resource: 'role', action: 'update' },
      { resource: 'adr', action: 'read' },
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
    expect(await rolePermissionKeys(roleUpdater.id)).toEqual(['adr:read', 'role:update']);

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

    // 対照: 同じ実行者は保有する全権限でない権限を追加できる（拒否の理由はロール更新の権限の不足ではない）
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

  /**
   * @requirement user-authentication/REQ-38.6
   */
  test('ロール更新の権限だけを持つ利用者はロールの優先度を上限より上へ上げられず、上限ちょうどへは変えられる', async ({
    request,
  }) => {
    const roleUpdater = await createRole('priority-updater', 50, [
      { resource: 'role', action: 'update' },
    ]);
    const target = await createRole('priority-target', 10);
    const actor = await createUserWithRoles('priority-updater', [roleUpdater.name]);
    const headers = await bearerFor(request, actor);

    // 他のロールの優先度を実行者の上限（50）より上へ上げる変更は拒否される
    const raised = await request.patch(`${API_BASE_URL}/api/v1/roles/${target.id}`, {
      headers,
      data: { priority: 51 },
    });
    await expectCeilingRejection(raised, 'ROLE_PRIORITY_EXCEEDS_ACTOR');

    // 自分のロールの優先度を上げる変更（自分の昇格）も拒否される
    const ownRaised = await request.patch(`${API_BASE_URL}/api/v1/roles/${roleUpdater.id}`, {
      headers,
      data: { priority: 100 },
    });
    await expectCeilingRejection(ownRaised, 'ROLE_PRIORITY_EXCEEDS_ACTOR');

    expect(await rolePriority(target.id)).toBe(10);
    expect(await rolePriority(roleUpdater.id)).toBe(50);

    // 拒否は権限チェックの失敗として、対象のロールと現在・要求の優先度とともに記録される
    const targetRecords = await ceilingRejections(actor.id, 'role', target.id);
    expect(targetRecords).toHaveLength(1);
    expect(targetRecords[0]!.metadata).toMatchObject({
      reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
      currentPriority: '10',
      requestedPriority: '51',
    });
    const ownRecords = await ceilingRejections(actor.id, 'role', roleUpdater.id);
    expect(ownRecords).toHaveLength(1);
    expect(ownRecords[0]!.metadata).toMatchObject({
      reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
      currentPriority: '50',
      requestedPriority: '100',
    });
    expect(await actorRejectionCount(actor.id)).toBe(2);

    // 対照: 同じ実行者は上限ちょうど（50）へ優先度を変えられ、拒否の記録は増えない
    const allowed = await request.patch(`${API_BASE_URL}/api/v1/roles/${target.id}`, {
      headers,
      data: { priority: 50 },
    });
    expect(allowed.status(), await allowed.text()).toBe(200);
    expect(await rolePriority(target.id)).toBe(50);
    expect(await actorRejectionCount(actor.id)).toBe(2);
  });

  /**
   * @requirement user-authentication/REQ-38.7
   */
  test('ロール作成の権限だけを持つ利用者は上限より高い優先度のロールを作れず、上限ちょうどのロールは作れる', async ({
    request,
  }) => {
    const roleCreator = await createRole('creator', 50, [{ resource: 'role', action: 'create' }]);
    const actor = await createUserWithRoles('creator', [roleCreator.name]);
    const headers = await bearerFor(request, actor);
    const prisma = getPrismaClient();

    // 実行者の上限（50）を超える優先度のロールの作成は拒否され、ロールは作られない
    const rejectedName = `${ROLE_NAME_PREFIX}created-over-${uniqueSuffix()}`;
    const rejected = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers,
      data: { name: rejectedName, description: 'E2E 上限を超える作成', priority: 51 },
    });
    await expectCeilingRejection(rejected, 'ROLE_PRIORITY_EXCEEDS_ACTOR');
    expect(await prisma.role.count({ where: { name: rejectedName } })).toBe(0);

    // 拒否は権限チェックの失敗として、要求された名前を対象として記録される（ロールは作られないため）
    const records = await ceilingRejections(actor.id, 'role', rejectedName);
    expect(records).toHaveLength(1);
    expect(records[0]!.metadata).toMatchObject({
      reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
      requestedName: rejectedName,
      requestedPriority: '51',
    });
    expect(await actorRejectionCount(actor.id)).toBe(1);

    // 対照: 同じ実行者は上限ちょうど（50）の優先度のロールを作れ、拒否の記録は増えない
    const allowedName = `${ROLE_NAME_PREFIX}created-equal-${uniqueSuffix()}`;
    const allowed = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers,
      data: { name: allowedName, description: 'E2E 上限ちょうどの作成', priority: 50 },
    });
    expect(allowed.status(), await allowed.text()).toBe(201);
    expect(
      await prisma.role.findUniqueOrThrow({
        where: { name: allowedName },
        select: { priority: true, isSystem: true },
      })
    ).toEqual({ priority: 50, isSystem: false });
    expect(await actorRejectionCount(actor.id)).toBe(1);
  });

  /**
   * @requirement user-authentication/REQ-38.8
   */
  test('システム管理者でない利用者は保有しない権限をロールへ追加できず、保有する権限は追加できる', async ({
    request,
  }) => {
    const roleUpdater = await createRole('grantor', 50, [
      { resource: 'role', action: 'update' },
      { resource: 'adr', action: 'read' },
    ]);
    const target = await createRole('grant-target', 10);
    const actor = await createUserWithRoles('grantor', [roleUpdater.name]);
    const headers = await bearerFor(request, actor);
    const adrReadId = await permissionId('adr', 'read');
    const userDeleteId = await permissionId('user', 'delete');

    // 実行者の保有しない権限（user:delete）の追加は拒否される
    const single = await request.post(`${API_BASE_URL}/api/v1/roles/${target.id}/permissions`, {
      headers,
      data: { permissionId: userDeleteId },
    });
    await expectCeilingRejection(single, 'PERMISSION_NOT_HELD_BY_ACTOR');

    // 一括の追加に保有しない権限が 1 件でも含まれると、保有する権限も含めて全体が反映されない
    const bulk = await request.post(`${API_BASE_URL}/api/v1/roles/${target.id}/permissions`, {
      headers,
      data: { permissionIds: [adrReadId, userDeleteId] },
    });
    await expectCeilingRejection(bulk, 'PERMISSION_NOT_HELD_BY_ACTOR');

    // 自分のロールへの保有しない権限の追加（自分の昇格）も拒否される
    const toOwnRole = await request.post(
      `${API_BASE_URL}/api/v1/roles/${roleUpdater.id}/permissions`,
      { headers, data: { permissionId: userDeleteId } }
    );
    await expectCeilingRejection(toOwnRole, 'PERMISSION_NOT_HELD_BY_ACTOR');

    expect(await rolePermissionKeys(target.id)).toEqual([]);
    expect(await rolePermissionKeys(roleUpdater.id)).toEqual(['adr:read', 'role:update']);

    // 拒否は権限チェックの失敗として、対象のロールと拒否した権限とともに記録される
    const targetRecords = await ceilingRejections(actor.id, 'role-permission', target.id);
    expect(targetRecords).toHaveLength(2);
    for (const record of targetRecords) {
      expect(record.metadata).toMatchObject({
        reason: 'PERMISSION_NOT_HELD_BY_ACTOR',
        permissionId: userDeleteId,
        permission: 'user:delete',
      });
    }
    const ownRecords = await ceilingRejections(actor.id, 'role-permission', roleUpdater.id);
    expect(ownRecords).toHaveLength(1);
    expect(ownRecords[0]!.metadata).toMatchObject({
      reason: 'PERMISSION_NOT_HELD_BY_ACTOR',
      permission: 'user:delete',
    });
    expect(await actorRejectionCount(actor.id)).toBe(3);

    // 対照: 同じ実行者は保有する権限（adr:read）を追加でき、拒否の記録は増えない
    const allowed = await request.post(`${API_BASE_URL}/api/v1/roles/${target.id}/permissions`, {
      headers,
      data: { permissionIds: [adrReadId] },
    });
    expect(allowed.status(), await allowed.text()).toBe(204);
    expect(await rolePermissionKeys(target.id)).toEqual(['adr:read']);
    expect(await actorRejectionCount(actor.id)).toBe(3);
  });

  /**
   * @requirement user-authentication/REQ-38.9
   */
  test('ユーザー更新の権限だけを持つ利用者は上限より高いロールの割り当てを他の利用者から外せず、上限ちょうどのロールは外せる', async ({
    request,
  }) => {
    const userUpdater = await createRole('revoker', 50, [{ resource: 'user', action: 'update' }]);
    const higher = await createRole('revoke-higher', 51);
    const equal = await createRole('revoke-equal', 50);
    const actor = await createUserWithRoles('revoker', [userUpdater.name]);
    const subject = await createUserWithRoles('revoke-subject', [higher.name, equal.name]);
    const headers = await bearerFor(request, actor);
    expect(await userRoleNames(subject.id)).toEqual([equal.name, higher.name].sort());

    // 実行者の上限（50）を超えるロールの割り当ての解除は拒否され、割り当ては残る
    const rejected = await request.delete(
      `${API_BASE_URL}/api/v1/users/${subject.id}/roles/${higher.id}`,
      { headers }
    );
    await expectCeilingRejection(rejected, 'ROLE_PRIORITY_EXCEEDS_ACTOR');
    expect(await userRoleNames(subject.id)).toEqual([equal.name, higher.name].sort());

    // 拒否は権限チェックの失敗として、対象の利用者と解除しようとしたロールとともに記録される
    const records = await ceilingRejections(actor.id, 'user-role', subject.id);
    expect(records).toHaveLength(1);
    expect(records[0]!.metadata).toMatchObject({
      reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
      roleId: higher.id,
    });
    expect(await actorRejectionCount(actor.id)).toBe(1);

    // 対照: 同じ実行者は上限ちょうど（50）のロールの割り当てを外せ、拒否の記録は増えない
    const allowed = await request.delete(
      `${API_BASE_URL}/api/v1/users/${subject.id}/roles/${equal.id}`,
      { headers }
    );
    expect(allowed.status(), await allowed.text()).toBe(204);
    expect(await userRoleNames(subject.id)).toEqual([higher.name]);
    expect(await actorRejectionCount(actor.id)).toBe(1);
  });

  /**
   * @requirement user-authentication/REQ-38.11
   */
  test('上限より高いロールの優先度の引き下げ・権限の追加と削除・削除は拒否され、上限ちょうどのロールへの同じ操作はできる', async ({
    request,
  }) => {
    const maintainer = await createRole('maintainer', 50, [
      { resource: 'role', action: 'update' },
      { resource: 'role', action: 'delete' },
      { resource: 'adr', action: 'read' },
      { resource: 'adr', action: 'create' },
    ]);
    const above = await createRole('above', 60, [{ resource: 'adr', action: 'read' }]);
    const equal = await createRole('at-ceiling', 50, [{ resource: 'adr', action: 'read' }]);
    const actor = await createUserWithRoles('maintainer', [maintainer.name]);
    const headers = await bearerFor(request, actor);
    const adrReadId = await permissionId('adr', 'read');
    const adrCreateId = await permissionId('adr', 'create');
    const prisma = getPrismaClient();

    // 上限（50）より上のロールの優先度を上限以下へ下げる変更は拒否される（下げてから割り当てる抜け道）
    const lowered = await request.patch(`${API_BASE_URL}/api/v1/roles/${above.id}`, {
      headers,
      data: { priority: 40 },
    });
    await expectCeilingRejection(lowered, 'ROLE_PRIORITY_EXCEEDS_ACTOR');

    // 実行者の保有する権限であっても、上限より上のロールへの追加は拒否される
    const added = await request.post(`${API_BASE_URL}/api/v1/roles/${above.id}/permissions`, {
      headers,
      data: { permissionId: adrCreateId },
    });
    await expectCeilingRejection(added, 'ROLE_PRIORITY_EXCEEDS_ACTOR');

    // 上限より上のロールからの権限の削除は拒否される
    const removed = await request.delete(
      `${API_BASE_URL}/api/v1/roles/${above.id}/permissions/${adrReadId}`,
      { headers }
    );
    await expectCeilingRejection(removed, 'ROLE_PRIORITY_EXCEEDS_ACTOR');

    // 上限より上のロールの削除は拒否される
    const deleted = await request.delete(`${API_BASE_URL}/api/v1/roles/${above.id}`, { headers });
    await expectCeilingRejection(deleted, 'ROLE_PRIORITY_EXCEEDS_ACTOR');

    // DB は変わらない（ロールは残り、優先度と権限はそのまま）
    expect(await rolePriority(above.id)).toBe(60);
    expect(await rolePermissionKeys(above.id)).toEqual(['adr:read']);

    // 拒否は権限チェックの失敗として、操作ごとの対象とともに記録される
    // （記録の時刻は WSL の壁時計の巻き戻りで前後しうるため、並び順に依らずに照合する）
    const roleRecords = await ceilingRejections(actor.id, 'role', above.id);
    expect(roleRecords).toHaveLength(2);
    expect(roleRecords.map((record) => record.metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
          currentPriority: '60',
          requestedPriority: '40',
        }),
        expect.objectContaining({
          reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
          roleName: above.name,
        }),
      ])
    );
    const permissionRecords = await ceilingRejections(actor.id, 'role-permission', above.id);
    expect(permissionRecords).toHaveLength(2);
    expect(permissionRecords.map((record) => record.metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
          permissionId: adrCreateId,
          permission: 'adr:create',
        }),
        expect.objectContaining({
          reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
          permissionId: adrReadId,
          permission: 'adr:read',
        }),
      ])
    );
    expect(await actorRejectionCount(actor.id)).toBe(4);

    // 対照: 上限より上のロールでも、説明だけの変更（権限が動かない変更）は対象外でできる
    const described = await request.patch(`${API_BASE_URL}/api/v1/roles/${above.id}`, {
      headers,
      data: { description: 'E2E 説明だけの変更' },
    });
    expect(described.status(), await described.text()).toBe(200);
    expect(
      await prisma.role.findUniqueOrThrow({
        where: { id: above.id },
        select: { description: true, priority: true },
      })
    ).toEqual({ description: 'E2E 説明だけの変更', priority: 60 });

    // 対照: 上限ちょうど（50）のロールには、同じ実行者が同じ操作をできる
    const equalLowered = await request.patch(`${API_BASE_URL}/api/v1/roles/${equal.id}`, {
      headers,
      data: { priority: 40 },
    });
    expect(equalLowered.status(), await equalLowered.text()).toBe(200);
    expect(await rolePriority(equal.id)).toBe(40);

    const equalAdded = await request.post(`${API_BASE_URL}/api/v1/roles/${equal.id}/permissions`, {
      headers,
      data: { permissionId: adrCreateId },
    });
    expect(equalAdded.status(), await equalAdded.text()).toBe(204);
    const equalRemoved = await request.delete(
      `${API_BASE_URL}/api/v1/roles/${equal.id}/permissions/${adrReadId}`,
      { headers }
    );
    expect(equalRemoved.status(), await equalRemoved.text()).toBe(204);
    expect(await rolePermissionKeys(equal.id)).toEqual(['adr:create']);

    // 上限ちょうどのロールの削除（優先度を 50 に戻した上で、上限ちょうどの現在の優先度で判定させる）
    const restored = await request.patch(`${API_BASE_URL}/api/v1/roles/${equal.id}`, {
      headers,
      data: { priority: 50 },
    });
    expect(restored.status(), await restored.text()).toBe(200);
    const equalDeleted = await request.delete(`${API_BASE_URL}/api/v1/roles/${equal.id}`, {
      headers,
    });
    expect(equalDeleted.status(), await equalDeleted.text()).toBe(204);
    expect(await prisma.role.count({ where: { id: equal.id } })).toBe(0);
    expect(await actorRejectionCount(actor.id)).toBe(4);
  });

  /**
   * @requirement user-authentication/REQ-38.12
   */
  test('システム管理者でもシステムロールの優先度は変えられず、優先度を変えない更新とシステムロールでないロールの優先度の変更はできる', async ({
    request,
  }) => {
    const adminRole = await roleByName('admin');
    const userRole = await roleByName('user');
    expect(adminRole.priority, 'システム管理者ロールの優先度').toBe(100);
    expect(userRole.priority, '一般ユーザーロールの優先度').toBe(0);
    systemRolePriorities.set(adminRole.id, adminRole.priority);
    systemRolePriorities.set(userRole.id, userRole.priority);
    const custom = await createRole('system-priority-control', 10);
    const admin = await createSessionUser('ADMIN_USER');
    const headers = await bearerFor(request, admin);

    // 一般ユーザーロールの優先度の変更は、システム管理者でも拒否される
    const userRaised = await request.patch(`${API_BASE_URL}/api/v1/roles/${userRole.id}`, {
      headers,
      data: { priority: 1 },
    });
    await expectCeilingRejection(userRaised, 'SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN');

    // システム管理者ロールの優先度の変更（38.10 の基準の 100 を動かす変更）も拒否される
    const adminLowered = await request.patch(`${API_BASE_URL}/api/v1/roles/${adminRole.id}`, {
      headers,
      data: { priority: 99 },
    });
    await expectCeilingRejection(adminLowered, 'SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN');

    expect(await rolePriority(userRole.id)).toBe(0);
    expect(await rolePriority(adminRole.id)).toBe(100);

    // 拒否は権限チェックの失敗として、対象のロールと現在・要求の優先度とともに記録される
    const userRecords = await ceilingRejections(admin.id, 'role', userRole.id);
    expect(userRecords).toHaveLength(1);
    expect(userRecords[0]!.metadata).toMatchObject({
      reason: 'SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN',
      currentPriority: '0',
      requestedPriority: '1',
    });
    const adminRecords = await ceilingRejections(admin.id, 'role', adminRole.id);
    expect(adminRecords).toHaveLength(1);
    expect(adminRecords[0]!.metadata).toMatchObject({
      reason: 'SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN',
      currentPriority: '100',
      requestedPriority: '99',
    });
    expect(await actorRejectionCount(admin.id)).toBe(2);

    // 対照: 優先度を変えない更新（画面が説明だけの変更でも送る現在の優先度）は拒否されない
    const unchanged = await request.patch(`${API_BASE_URL}/api/v1/roles/${userRole.id}`, {
      headers,
      data: { priority: 0 },
    });
    expect(unchanged.status(), await unchanged.text()).toBe(200);
    expect(await rolePriority(userRole.id)).toBe(0);

    // 対照: 同じ管理者はシステムロールでないロールの優先度を上限ちょうど（100）へ変えられる
    const customRaised = await request.patch(`${API_BASE_URL}/api/v1/roles/${custom.id}`, {
      headers,
      data: { priority: 100 },
    });
    expect(customRaised.status(), await customRaised.text()).toBe(200);
    expect(await rolePriority(custom.id)).toBe(100);
    expect(await actorRejectionCount(admin.id)).toBe(2);
  });

  /**
   * @requirement user-authentication/REQ-38.10
   */
  test('システム管理者ロールの優先度を超える優先度の作成・変更は 400 の検証エラーになり権限チェックの失敗として記録されず、100 ちょうどは指定できる', async ({
    request,
  }) => {
    const prisma = getPrismaClient();
    const admin = await createSessionUser('ADMIN_USER');
    const adminHeaders = await bearerFor(request, admin);
    const custom = await createRole('range-target', 10);

    // 作成: 101 は 400 の検証エラーで、ロールは作られない
    const overName = `${ROLE_NAME_PREFIX}range-over-${uniqueSuffix()}`;
    const createOver = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: adminHeaders,
      data: { name: overName, description: 'E2E 範囲外の作成', priority: 101 },
    });
    expect(createOver.status(), await createOver.text()).toBe(400);
    expect(await createOver.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await prisma.role.count({ where: { name: overName } })).toBe(0);

    // 変更: 101 は 400 の検証エラーで、優先度は変わらない
    const updateOver = await request.patch(`${API_BASE_URL}/api/v1/roles/${custom.id}`, {
      headers: adminHeaders,
      data: { priority: 101 },
    });
    expect(updateOver.status(), await updateOver.text()).toBe(400);
    expect(await updateOver.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await rolePriority(custom.id)).toBe(10);

    // ロールの作成・更新の権限だけを持つ実行者でも、範囲外は上限の拒否（403）でなく検証エラー（400）になる
    const roleManager = await createRole('range-manager', 50, [
      { resource: 'role', action: 'create' },
      { resource: 'role', action: 'update' },
    ]);
    const manager = await createUserWithRoles('range-manager', [roleManager.name]);
    const managerHeaders = await bearerFor(request, manager);
    const managerOverName = `${ROLE_NAME_PREFIX}range-manager-over-${uniqueSuffix()}`;
    const managerCreateOver = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: managerHeaders,
      data: { name: managerOverName, priority: 101 },
    });
    expect(managerCreateOver.status(), await managerCreateOver.text()).toBe(400);
    expect(await managerCreateOver.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    const managerUpdateOver = await request.patch(`${API_BASE_URL}/api/v1/roles/${custom.id}`, {
      headers: managerHeaders,
      data: { priority: 101 },
    });
    expect(managerUpdateOver.status(), await managerUpdateOver.text()).toBe(400);
    expect(await managerUpdateOver.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await prisma.role.count({ where: { name: managerOverName } })).toBe(0);
    expect(await rolePriority(custom.id)).toBe(10);

    // 範囲の検証は入力の誤りであり、権限チェックの失敗として記録されない
    expect(await actorRejectionCount(admin.id)).toBe(0);
    expect(await actorRejectionCount(manager.id)).toBe(0);

    // 対照: システム管理者ロールの優先度ちょうど（100）は、作成・変更のどちらでも指定できる
    const equalName = `${ROLE_NAME_PREFIX}range-equal-${uniqueSuffix()}`;
    const createEqual = await request.post(`${API_BASE_URL}/api/v1/roles`, {
      headers: adminHeaders,
      data: { name: equalName, description: 'E2E 100 ちょうどの作成', priority: 100 },
    });
    expect(createEqual.status(), await createEqual.text()).toBe(201);
    expect(
      await prisma.role.findUniqueOrThrow({
        where: { name: equalName },
        select: { priority: true },
      })
    ).toEqual({ priority: 100 });
    const updateEqual = await request.patch(`${API_BASE_URL}/api/v1/roles/${custom.id}`, {
      headers: adminHeaders,
      data: { priority: 100 },
    });
    expect(updateEqual.status(), await updateEqual.text()).toBe(200);
    expect(await rolePriority(custom.id)).toBe(100);
    expect(await actorRejectionCount(admin.id)).toBe(0);
  });
});
