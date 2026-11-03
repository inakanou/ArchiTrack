/**
 * @fileoverview 認証・アカウント操作とデータ出力の監査の記録の E2E テスト
 *
 * user-authentication タスク53.5。design.md の AuthService（認証の監査の記録）・UserRoleService の
 * ユーザーの削除・AuditLogService の実行者の写し・ExportAuditService の節。操作は画面（ログイン・2FA の
 * 検証・ログアウト・セッション管理・監査ログ画面の JSON エクスポート）と管理者の API（ユーザーの削除。
 * 削除の画面は無い）で行い、記録は監査ログ画面（`/admin/audit-logs`）の種別の絞り込みと、DB の監査の行
 * （送信元 IP・ユーザーエージェント・削除の対象の写しなど、画面に出ない項目）で確かめる。
 *
 * Requirements (user-authentication):
 * - REQ-40.1: ログインの成功、パスワード誤りと存在しないメールアドレスによる失敗が、結果・対象のメール
 *   アドレス・送信元 IP・ユーザーエージェントとともに記録され、監査ログ画面に出る
 * - REQ-40.2: ログイン失敗の連続と 2FA 検証失敗の連続によるロックが記録され、監査ログ画面に出る
 * - REQ-40.3: 2FA の検証（TOTP）の成功と失敗が記録され、監査ログ画面に出る
 * - REQ-40.4: ログアウトと全デバイスのログアウトが記録され、監査ログ画面に出る
 * - REQ-40.6: ユーザーの削除が実行者と削除対象とともに記録され、監査ログ画面に出る
 * - REQ-40.7: 実行者の利用者を削除しても、その利用者が実行者・対象の記録が残り、監査ログ画面に実行者の
 *   メールアドレス（記録時の写し）が出る
 * - REQ-40.9: 監査ログの JSON 出力が、実行者・種別・件数とともに記録され、監査ログ画面に出る
 *
 * ロック・削除・実行者の削除の対象は、テストの中で作る一意のメールアドレスの利用者
 * （`SESSION_USER_EMAIL_PREFIX`）とし、各テストの後始末で消す（共有の役割の利用者をロック・削除・
 * ログアウトしない）。監査の行は消せない（不変）ため、主張はテストの中で作った利用者の ID・メール
 * アドレスで範囲を絞る。通信の観測は URL のパスで照合する（CI とローカルで API のオリジンが異なるため）。
 */

import { randomBytes } from 'node:crypto';
import { test, expect, type Page, type Response } from '@playwright/test';
import { authenticator } from 'otplib';
import { getPrismaClient } from '../../fixtures/database';
import {
  SESSION_USER_EMAIL_PREFIX,
  createSessionUser,
  createTestUser,
  deleteSessionUsers,
  type SessionUser,
} from '../../fixtures/auth.fixtures';
import { loginAsUser, submitLoginForm } from '../../helpers/auth-actions';
import { getAccessToken, loginViaApi } from '../../helpers/auth-api';
import { E2E_TOTP_SECRET, fillTotpCode } from '../../helpers/two-factor-totp';
import { TEST_USERS } from '../../helpers/test-users';
import { API_BASE_URL } from '../../config';
import { getTimeout } from '../../helpers/wait-helpers';

const LOGIN_PATH = '/api/v1/auth/login';
const VERIFY_2FA_PATH = '/api/v1/auth/verify-2fa';
const AUDIT_LOGS_PATH = '/api/v1/audit-logs';
const AUDIT_EXPORT_PATH = '/api/v1/audit-logs/export';
const INVALID_CREDENTIALS_MESSAGE = /メールアドレスまたはパスワードが正しくありません/;
/** 実行者の無い記録の実行者の表示（frontend/src/utils/audit-log-actions.ts の SYSTEM_ACTOR_LABEL） */
const SYSTEM_ACTOR = 'システム';
/** ロックに至る連続の失敗の回数（backend の SECURITY_CONFIG.LOGIN / TWO_FACTOR の MAX_FAILURES） */
const MAX_FAILURES = 5;

/** 応答が指定のパスへの要求か（オリジンは問わない） */
function isPath(response: Response, method: string, path: string): boolean {
  return response.request().method() === method && new URL(response.url()).pathname === path;
}

/** テストの中で作る一意の、存在しないメールアドレス（利用者は作らない） */
function uniqueUnknownEmail(): string {
  return `${SESSION_USER_EMAIL_PREFIX}unknown-${Date.now()}-${randomBytes(4).toString('hex')}@example.com`;
}

/**
 * 現在の前後の時間ステップのどの TOTP コードとも一致しない 6 桁のコード
 *
 * backend はずれを許すため、前後のステップのコードも避ける（偶然の一致で検証が成功しないように）
 */
function wrongTotpCode(secret: string = E2E_TOTP_SECRET): string {
  const now = Date.now();
  const valid = new Set(
    [-2, -1, 0, 1, 2].map((offset) =>
      authenticator.clone({ epoch: now + offset * 30_000 }).generate(secret)
    )
  );
  const candidate = ['000000', '111111', '222222', '333333', '444444', '555555'].find(
    (code) => !valid.has(code)
  );
  if (!candidate) {
    throw new Error('どの有効なコードとも一致しない候補が無い');
  }
  return candidate;
}

/** 共有の管理者が他の spec の DB の初期化で消えていれば作り直す（実行の順序に依らないため） */
async function ensureAdminUser(): Promise<string> {
  const prisma = getPrismaClient();
  const exists = await prisma.user.findUnique({
    where: { email: TEST_USERS.ADMIN_USER.email },
    select: { id: true },
  });
  if (exists) {
    return exists.id;
  }
  return (await createTestUser('ADMIN_USER')).id;
}

/** ログイン画面で資格を送り、ログイン API の応答の状態コードを返す（ログインを完了させない） */
async function submitCredentials(page: Page, email: string, password: string): Promise<number> {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel(/メールアドレス/i).fill(email);
  await page.locator('input#password').fill(password);
  const responded = page.waitForResponse((r) => isPath(r, 'POST', LOGIN_PATH));
  await page.getByRole('button', { name: /ログイン/i }).click();
  return (await responded).status();
}

/** 2FA の検証の画面でコードを送り、検証 API の応答の状態コードを返す */
async function submitTotpCode(page: Page, code: string): Promise<number> {
  for (let i = 0; i < 6; i++) {
    await page.getByTestId(`totp-digit-${i}`).clear();
  }
  await fillTotpCode(page, code);
  const responded = page.waitForResponse((r) => isPath(r, 'POST', VERIFY_2FA_PATH));
  await page.getByRole('button', { name: '検証', exact: true }).click();
  return (await responded).status();
}

/** 共有の管理者で監査ログ画面を開く */
async function openAuditLogsAsAdmin(page: Page): Promise<void> {
  await ensureAdminUser();
  await loginAsUser(page, 'ADMIN_USER');
  const loaded = page.waitForResponse((r) => isPath(r, 'GET', AUDIT_LOGS_PATH));
  await page.goto('/admin/audit-logs');
  expect((await loaded).status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: '監査ログ' })).toBeVisible();
}

/**
 * 監査ログ画面で種別を選び、実行者と対象が一致する行が指定の数だけあり、種別の表示名・実行者・対象の列を
 * 表示していることを確かめる
 */
async function expectAuditRowsOnScreen(
  page: Page,
  record: { action: string; label: string; actor: string; target: string; count: number }
): Promise<void> {
  // 開き直して絞り込みを「全て」へ戻してから選ぶ（同じ種別を選び直しても再取得しないため）
  const initial = page.waitForResponse(
    (r) => isPath(r, 'GET', AUDIT_LOGS_PATH) && !new URL(r.url()).searchParams.has('action')
  );
  await page.goto('/admin/audit-logs');
  expect((await initial).status()).toBe(200);
  const actionFilter = page.getByLabel('イベント種別');
  await expect(actionFilter).toHaveValue('');
  const filtered = page.waitForResponse(
    (r) =>
      isPath(r, 'GET', AUDIT_LOGS_PATH) &&
      new URL(r.url()).searchParams.get('action') === record.action
  );
  await actionFilter.selectOption(record.label);
  expect((await filtered).status()).toBe(200);
  await expect(actionFilter).toHaveValue(record.action);
  const rows = page
    .getByRole('table')
    .locator('tbody tr')
    .filter({ has: page.getByRole('cell', { name: record.target, exact: true }) })
    .filter({ has: page.getByRole('cell', { name: record.actor, exact: true }) });
  await expect(rows).toHaveCount(record.count);
  for (let i = 0; i < record.count; i++) {
    const cells = rows.nth(i).getByRole('cell');
    await expect(cells.nth(1)).toHaveText(record.label);
    await expect(cells.nth(2)).toHaveText(record.actor);
    await expect(cells.nth(3)).toHaveText(record.target);
  }
}

/** 監査の行の metadata（JSON オブジェクト） */
function metadataOf(row: { metadata: unknown }): Record<string, unknown> {
  expect(row.metadata).toEqual(expect.any(Object));
  return row.metadata as Record<string, unknown>;
}

/** 送信元 IP とユーザーエージェントが記録されていることを確かめる（要件40.1） */
function expectRequestContext(metadata: Record<string, unknown>): void {
  expect(metadata.ipAddress).toEqual(expect.any(String));
  expect(String(metadata.ipAddress)).not.toBe('');
  expect(metadata.userAgent).toEqual(expect.any(String));
  expect(String(metadata.userAgent)).toMatch(/Mozilla|Chrome|HeadlessChrome/);
}

test.describe('認証・アカウント操作とデータ出力の監査の記録', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    await deleteSessionUsers();
  });

  /**
   * @requirement user-authentication/REQ-40.1
   * @requirement user-authentication/REQ-40.3
   * @requirement user-authentication/REQ-40.4
   */
  test('ログインの失敗と成功、2FA の検証の成功、ログアウトと全デバイスのログアウトが監査ログ画面に出る', async ({
    page,
  }) => {
    const prisma = getPrismaClient();
    const user = await createSessionUser('REGULAR_USER');
    const unknownEmail = uniqueUnknownEmail();

    // 存在しないメールアドレスとパスワード誤りのログインの失敗
    expect(await submitCredentials(page, unknownEmail, user.password)).toBe(401);
    await expect(page.getByText(INVALID_CREDENTIALS_MESSAGE)).toBeVisible();
    expect(await submitCredentials(page, user.email, 'WrongPassword123!')).toBe(401);
    await expect(page.getByText(INVALID_CREDENTIALS_MESSAGE)).toBeVisible();

    // 2FA の検証を経たログインの成功と、ログアウト
    await loginAsUser(page, user);
    await page.goto('/profile');
    await page.getByRole('button', { name: new RegExp(user.displayName) }).click();
    const loggedOut = page.waitForResponse((r) => isPath(r, 'POST', '/api/v1/auth/logout'));
    await page.getByRole('menuitem', { name: 'ログアウト' }).click();
    expect((await loggedOut).status()).toBeLessThan(300);
    await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(15000) });

    // 再びログインし、セッション管理画面から全デバイスのログアウト
    await page.goto('/login', { waitUntil: 'networkidle' });
    await submitLoginForm(page, user);
    await page.goto('/sessions');
    await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await page.getByRole('button', { name: /全デバイスからログアウト/i }).click();
    const loggedOutAll = page.waitForResponse((r) => isPath(r, 'POST', '/api/v1/auth/logout-all'));
    await page.getByRole('button', { name: /はい、全デバイスからログアウト/i }).click();
    expect((await loggedOutAll).status()).toBeLessThan(300);
    await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(15000) });

    // 要件40.1: 失敗と成功の記録が結果・メールアドレス・送信元 IP・ユーザーエージェントを持つ
    const unknownFailure = await prisma.auditLog.findMany({
      where: { action: 'LOGIN_FAILED', targetId: unknownEmail },
    });
    expect(unknownFailure).toHaveLength(1);
    expect(unknownFailure[0]).toMatchObject({ actorId: null, targetType: 'Email' });
    const unknownMeta = metadataOf(unknownFailure[0]!);
    expect(unknownMeta).toMatchObject({
      result: 'failure',
      reason: 'unknown_email',
      email: unknownEmail,
    });
    expectRequestContext(unknownMeta);

    const passwordFailure = await prisma.auditLog.findMany({
      where: { action: 'LOGIN_FAILED', targetId: user.id },
    });
    expect(passwordFailure).toHaveLength(1);
    expect(passwordFailure[0]).toMatchObject({ actorId: null, targetType: 'User' });
    const passwordMeta = metadataOf(passwordFailure[0]!);
    expect(passwordMeta).toMatchObject({
      result: 'failure',
      reason: 'invalid_password',
      email: user.email,
    });
    expectRequestContext(passwordMeta);

    const successes = await prisma.auditLog.findMany({
      where: { action: 'LOGIN_SUCCESS', targetId: user.id },
    });
    expect(successes).toHaveLength(2);
    for (const success of successes) {
      expect(success).toMatchObject({ actorId: user.id, actorEmail: user.email });
      const meta = metadataOf(success);
      expect(meta).toMatchObject({ result: 'success', email: user.email, method: 'totp' });
      expectRequestContext(meta);
    }

    // 要件40.3・40.4: 2FA の検証の成功、ログアウト、全デバイスのログアウト
    expect(
      await prisma.auditLog.count({
        where: { action: 'TWO_FACTOR_VERIFIED', targetId: user.id, actorId: user.id },
      })
    ).toBe(2);
    // ログアウトはメニューからの 1 回と、全デバイスのログアウトの後に画面が続けて行う 1 回
    // （frontend/src/pages/Sessions.tsx の handleConfirmLogoutAll が logout-all の後に logout を呼ぶ）
    expect(
      await prisma.auditLog.count({
        where: { action: 'LOGOUT', targetId: user.id, actorId: user.id },
      })
    ).toBe(2);
    expect(
      await prisma.auditLog.count({
        where: { action: 'LOGOUT_ALL', targetId: user.id, actorId: user.id },
      })
    ).toBe(1);

    // 監査ログ画面に、種別の表示名・実行者・対象とともに出る
    await openAuditLogsAsAdmin(page);
    await expectAuditRowsOnScreen(page, {
      action: 'LOGIN_FAILED',
      label: 'ログイン失敗',
      actor: SYSTEM_ACTOR,
      target: unknownEmail,
      count: 1,
    });
    await expectAuditRowsOnScreen(page, {
      action: 'LOGIN_FAILED',
      label: 'ログイン失敗',
      actor: SYSTEM_ACTOR,
      target: user.id,
      count: 1,
    });
    await expectAuditRowsOnScreen(page, {
      action: 'LOGIN_SUCCESS',
      label: 'ログイン成功',
      actor: user.email,
      target: user.id,
      count: 2,
    });
    await expectAuditRowsOnScreen(page, {
      action: 'TWO_FACTOR_VERIFIED',
      label: '2FA検証成功',
      actor: user.email,
      target: user.id,
      count: 2,
    });
    await expectAuditRowsOnScreen(page, {
      action: 'LOGOUT',
      label: 'ログアウト',
      actor: user.email,
      target: user.id,
      count: 2,
    });
    await expectAuditRowsOnScreen(page, {
      action: 'LOGOUT_ALL',
      label: '全デバイスからログアウト',
      actor: user.email,
      target: user.id,
      count: 1,
    });
  });

  /**
   * @requirement user-authentication/REQ-40.2
   * @requirement user-authentication/REQ-40.3
   */
  test('ログイン失敗の連続と 2FA の検証の失敗の連続によるロックと、2FA の検証の失敗が監査ログ画面に出る', async ({
    page,
  }) => {
    const prisma = getPrismaClient();
    const passwordLocked = await createSessionUser('REGULAR_USER');
    const twoFactorLocked = await createSessionUser('REGULAR_USER');

    // ログイン失敗の連続によるロック
    for (let attempt = 1; attempt < MAX_FAILURES; attempt++) {
      expect(await submitCredentials(page, passwordLocked.email, 'WrongPassword123!')).toBe(401);
      await expect(page.getByText(INVALID_CREDENTIALS_MESSAGE)).toBeVisible();
    }
    expect(await submitCredentials(page, passwordLocked.email, 'WrongPassword123!')).not.toBe(200);
    await expect(page.getByText(/アカウントがロックされています/)).toBeVisible();

    // 正しいパスワードの後の 2FA の検証の失敗の連続によるロック
    expect(await submitCredentials(page, twoFactorLocked.email, twoFactorLocked.password)).toBe(
      200
    );
    await page.getByTestId('totp-digit-0').waitFor({ state: 'visible' });
    for (let attempt = 1; attempt < MAX_FAILURES; attempt++) {
      expect(await submitTotpCode(page, wrongTotpCode())).toBe(401);
      await expect(page.getByText(/認証コードが正しくありません/)).toBeVisible();
    }
    expect(await submitTotpCode(page, wrongTotpCode())).not.toBe(200);
    await expect(
      page.getByText(/アカウントが一時的にロックされました|アカウントがロックされています|5分後/)
    ).toBeVisible();

    // 要件40.2: 二つのロックがそれぞれの契機とともに記録される
    const passwordLock = await prisma.auditLog.findMany({
      where: { action: 'LOGIN_LOCKED', targetId: passwordLocked.id },
    });
    expect(passwordLock).toHaveLength(1);
    expect(passwordLock[0]).toMatchObject({ actorId: null, targetType: 'User' });
    expect(metadataOf(passwordLock[0]!)).toMatchObject({
      trigger: 'login_failures',
      email: passwordLocked.email,
    });
    const twoFactorLock = await prisma.auditLog.findMany({
      where: { action: 'LOGIN_LOCKED', targetId: twoFactorLocked.id },
    });
    expect(twoFactorLock).toHaveLength(1);
    expect(metadataOf(twoFactorLock[0]!)).toMatchObject({
      trigger: 'two_factor_failures',
      email: twoFactorLocked.email,
    });

    // 要件40.3: 2FA の検証の失敗が 1 回ごとに記録される
    const twoFactorFailures = await prisma.auditLog.findMany({
      where: { action: 'TWO_FACTOR_FAILED', targetId: twoFactorLocked.id },
    });
    expect(twoFactorFailures).toHaveLength(MAX_FAILURES);
    for (const failure of twoFactorFailures) {
      expect(failure.actorId).toBeNull();
      const meta = metadataOf(failure);
      expect(meta).toMatchObject({
        result: 'failure',
        reason: 'invalid_code',
        method: 'totp',
        email: twoFactorLocked.email,
      });
      expectRequestContext(meta);
    }

    await openAuditLogsAsAdmin(page);
    await expectAuditRowsOnScreen(page, {
      action: 'LOGIN_LOCKED',
      label: 'アカウントロック',
      actor: SYSTEM_ACTOR,
      target: passwordLocked.id,
      count: 1,
    });
    await expectAuditRowsOnScreen(page, {
      action: 'LOGIN_LOCKED',
      label: 'アカウントロック',
      actor: SYSTEM_ACTOR,
      target: twoFactorLocked.id,
      count: 1,
    });
    await expectAuditRowsOnScreen(page, {
      action: 'TWO_FACTOR_FAILED',
      label: '2FA検証失敗',
      actor: SYSTEM_ACTOR,
      target: twoFactorLocked.id,
      count: MAX_FAILURES,
    });
  });

  /**
   * @requirement user-authentication/REQ-40.6
   * @requirement user-authentication/REQ-40.7
   */
  test('ユーザーの削除が実行者と対象とともに監査ログ画面に出て、実行者の利用者を削除しても記録と実行者の表示が残る', async ({
    page,
    request,
  }) => {
    const prisma = getPrismaClient();
    const adminId = await ensureAdminUser();
    const actorAdmin: SessionUser = await createSessionUser('ADMIN_USER');
    const deletedTarget: SessionUser = await createSessionUser('REGULAR_USER');

    // 実行者になる管理者がログインし（LOGIN_SUCCESS の実行者）、利用者を削除する（USER_DELETED の実行者）
    const { accessToken: actorToken } = await loginViaApi(request, actorAdmin);
    const deleted = await request.delete(`${API_BASE_URL}/api/v1/users/${deletedTarget.id}`, {
      headers: { Authorization: `Bearer ${actorToken}` },
    });
    expect(deleted.status()).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: deletedTarget.id } })).toBeNull();

    // 要件40.6: 実行者と削除対象（ID とメールアドレス・表示名の写し）が記録される
    const targetDeletion = await prisma.auditLog.findMany({
      where: { action: 'USER_DELETED', targetId: deletedTarget.id },
    });
    expect(targetDeletion).toHaveLength(1);
    expect(targetDeletion[0]).toMatchObject({
      actorId: actorAdmin.id,
      actorEmail: actorAdmin.email,
      targetType: 'User',
    });
    expect(targetDeletion[0]!.before).toMatchObject({
      id: deletedTarget.id,
      email: deletedTarget.email,
      displayName: deletedTarget.displayName,
    });

    // 要件40.7: 実行者の管理者を共有の管理者が削除しても、その管理者の記録が残る
    const actorRecordsBefore = await prisma.auditLog.findMany({
      where: { actorId: actorAdmin.id },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    expect(actorRecordsBefore.length).toBeGreaterThanOrEqual(2);
    const adminToken = await getAccessToken(page, 'ADMIN_USER');
    const actorDeleted = await request.delete(`${API_BASE_URL}/api/v1/users/${actorAdmin.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(actorDeleted.status()).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: actorAdmin.id } })).toBeNull();
    const actorRecordsAfter = await prisma.auditLog.findMany({
      where: { actorId: actorAdmin.id },
      select: { id: true, actorEmail: true },
      orderBy: { id: 'asc' },
    });
    expect(actorRecordsAfter.map((r) => r.id)).toEqual(actorRecordsBefore.map((r) => r.id));
    for (const record of actorRecordsAfter) {
      expect(record.actorEmail).toBe(actorAdmin.email);
    }
    const actorDeletion = await prisma.auditLog.findMany({
      where: { action: 'USER_DELETED', targetId: actorAdmin.id },
    });
    expect(actorDeletion).toHaveLength(1);
    expect(actorDeletion[0]).toMatchObject({ actorId: adminId });

    // 監査ログ画面に、削除された実行者のメールアドレス（写し）とともに出る
    await openAuditLogsAsAdmin(page);
    await expectAuditRowsOnScreen(page, {
      action: 'USER_DELETED',
      label: 'ユーザー削除',
      actor: actorAdmin.email,
      target: deletedTarget.id,
      count: 1,
    });
    await expectAuditRowsOnScreen(page, {
      action: 'USER_DELETED',
      label: 'ユーザー削除',
      actor: TEST_USERS.ADMIN_USER.email,
      target: actorAdmin.id,
      count: 1,
    });
    await expectAuditRowsOnScreen(page, {
      action: 'LOGIN_SUCCESS',
      label: 'ログイン成功',
      actor: actorAdmin.email,
      target: actorAdmin.id,
      count: 1,
    });
  });

  /**
   * @requirement user-authentication/REQ-40.9
   */
  test('監査ログ画面の JSON エクスポートが実行者・種別・件数とともに記録され、監査ログ画面に出る', async ({
    page,
  }) => {
    const prisma = getPrismaClient();
    const exporter = await createSessionUser('ADMIN_USER');
    await loginAsUser(page, exporter);
    const loaded = page.waitForResponse((r) => isPath(r, 'GET', AUDIT_LOGS_PATH));
    await page.goto('/admin/audit-logs');
    expect((await loaded).status()).toBe(200);

    // 出力の件数を抑えるため、種別をデータ出力に絞ってエクスポートする
    const filtered = page.waitForResponse(
      (r) =>
        isPath(r, 'GET', AUDIT_LOGS_PATH) &&
        new URL(r.url()).searchParams.get('action') === 'DATA_EXPORTED'
    );
    await page.getByLabel('イベント種別').selectOption('データ出力');
    expect((await filtered).status()).toBe(200);
    const exported = page.waitForResponse((r) => isPath(r, 'GET', AUDIT_EXPORT_PATH));
    await page.getByRole('button', { name: 'JSONエクスポート' }).click();
    const exportResponse = await exported;
    expect(exportResponse.status()).toBe(200);
    expect(new URL(exportResponse.url()).searchParams.get('action')).toBe('DATA_EXPORTED');
    const exportedLogs = (await exportResponse.json()) as { id: string }[];
    await expect(page.getByText('エクスポートが完了しました')).toBeVisible();

    // 要件40.9: 実行者・種別・件数・対象のデータが記録される（日時は行の作成日時）
    const records = await prisma.auditLog.findMany({
      where: { action: 'DATA_EXPORTED', actorId: exporter.id },
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      actorEmail: exporter.email,
      targetType: 'DataExport',
      targetId: 'audit_log_json',
    });
    expect(records[0]!.createdAt).toBeInstanceOf(Date);
    const meta = metadataOf(records[0]!);
    expect(meta).toMatchObject({
      kind: 'audit_log_json',
      projectId: null,
      itemCount: exportedLogs.length,
      targetIdCount: exportedLogs.length,
    });
    // 対象のデータの ID は先頭の 1000 件までを記録し、超えたときは切り詰めたことを残す（53.3）
    expect(meta.targetIds).toEqual(exportedLogs.slice(0, 1000).map((log) => log.id));
    expect(meta.targetIdsTruncated === true).toBe(exportedLogs.length > 1000);

    // 監査ログ画面に出る（補助が画面を開き直して読み直す）
    await expectAuditRowsOnScreen(page, {
      action: 'DATA_EXPORTED',
      label: 'データ出力',
      actor: exporter.email,
      target: 'audit_log_json',
      count: 1,
    });
  });
});
