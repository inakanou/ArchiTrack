/**
 * @fileoverview 招待とパスワードリセットのトークンの保護の E2E テスト
 *
 * user-authentication タスク50.4・59.2。design.md の InvitationService・PasswordService の節と
 * RegisterPage・PasswordResetPage・InvitationManager・AuditLogsPage の要約。招待の作成・取り消し・
 * 再送信は管理者が招待画面（`/admin/invitations`）で行い、登録とリセットはメール（Mailpit）に届いた
 * リンクから別のブラウザのコンテキストで完了させる。
 *
 * Requirements (user-authentication):
 * - 37.2: 招待一覧の応答と画面に、招待トークン・そのハッシュ・招待 URL が出ない（作成直後に一度だけ出た
 *   招待 URL も、画面を開き直すと出ない）
 * - 37.3: メールのリンクはトークンをフラグメントに置き、画面は読んだ直後に URL から取り除き、検証と完了の
 *   要求は本文でトークンを送る（ブラウザが送る要求の URL にトークンが載らない）。登録とリセットの完了後の
 *   URL にトークンが残らない
 * - 37.5: 別の管理者が作成した未使用の招待を、招待画面から取り消せる
 * - 40.5: 招待の作成・取り消し・再送信と招待経由の登録の記録（実行者・対象）が監査ログ画面に出て、
 *   記録に対象のメールアドレスが残る
 * - 40.12: 監査ログ画面の招待の作成・取り消し・再送信の記録の対象の欄に招待先のメールアドレスが出て、
 *   招待の ID が出ない（同じ招待を指す招待経由の登録の記録も同じ表示）
 *
 * リセットでパスワードを変える検証は 47.4 の専用の利用者（`STATE_CHANGE_USER`）を使い、テストの開始時に
 * 初期化の補助で戻す。招待の相手と別の管理者は、テストの中で作る一意のメールアドレスの利用者
 * （`SESSION_USER_EMAIL_PREFIX`）とし、後始末で消す。通信の観測は URL のパスで照合する（CI とローカルで
 * API のオリジンが異なるため）。
 */

import { createHash, randomBytes } from 'node:crypto';
import {
  test,
  expect,
  type Browser,
  type Page,
  type Request,
  type Response,
} from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import {
  SESSION_USER_EMAIL_PREFIX,
  createInvitation,
  createSessionUser,
  createTestUser,
  deleteSessionUsers,
  resetDedicatedUser,
} from '../../fixtures/auth.fixtures';
import { loginAsUser, submitLoginForm } from '../../helpers/auth-actions';
import { getEmailFromMailpit, listMailpitMessageIds } from '../../helpers/mailpit';
import { TEST_USERS } from '../../helpers/test-users';
import { getTimeout } from '../../helpers/wait-helpers';

const INVITATIONS_PATH = '/api/v1/invitations';
const AUDIT_LOGS_PATH = '/api/v1/audit-logs';

/** 招待一覧の 1 件が持つ項目（要件37.2。トークン・ハッシュ・URL を持たない） */
const INVITATION_SUMMARY_KEYS = ['createdAt', 'email', 'expiresAt', 'id', 'inviter', 'status'];

/** 応答が指定のパスへの要求か（オリジンは問わない） */
function isPath(response: Response, method: string, path: string): boolean {
  return response.request().method() === method && new URL(response.url()).pathname === path;
}

/** トークンの SHA-256 の 16 進（保存されるハッシュと同じ形。要件37.1） */
function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** テストの中で作る一意のメールアドレス（後始末の `deleteSessionUsers` が消す接頭辞） */
function uniqueSessionEmail(label: string): string {
  return `${SESSION_USER_EMAIL_PREFIX}${label}-${Date.now()}-${randomBytes(4).toString('hex')}@example.com`;
}

/**
 * 一意のパスワード（パスワードポリシーの「同一文字の 3 文字以上の連続」に掛からないよう、連続を 2 文字に詰める）
 */
function uniquePassword(prefix: string): string {
  return `${prefix}${Date.now()}!Aa`.replace(/(.)\1{2,}/g, '$1$1');
}

/**
 * メールの本文からリンクを読み、トークンがクエリでなくフラグメントにあることを確かめる（要件37.3）
 *
 * @returns 画面を開くためのパスとフラグメント、およびトークン
 */
function readTokenLink(
  emailText: string,
  pathname: '/register' | '/password-reset'
): { pathWithFragment: string; token: string } {
  const match = emailText.match(new RegExp(`https?://\\S+?${pathname}#token=[A-Za-z0-9_-]+`));
  expect(match, `メールの本文に ${pathname}#token= のリンクがある`).not.toBeNull();
  const link = new URL(match![0]);
  expect(link.pathname).toBe(pathname);
  expect(link.search, 'トークンをクエリに置かない').toBe('');
  const token = new URLSearchParams(link.hash.slice(1)).get('token') ?? '';
  expect(token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  return { pathWithFragment: `${link.pathname}${link.hash}`, token };
}

/** ブラウザが送った要求の URL を集める（トークンが URL に載らないことの観測。要件37.3） */
function collectRequestUrls(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request: Request) => urls.push(request.url()));
  return urls;
}

/** 共有の管理者が他の spec の DB の初期化で消えていれば作り直す（実行の順序に依らないため） */
async function ensureAdminUser(): Promise<void> {
  const exists = await getPrismaClient().user.findUnique({
    where: { email: TEST_USERS.ADMIN_USER.email },
    select: { id: true },
  });
  if (!exists) {
    await createTestUser('ADMIN_USER');
  }
}

/** 招待画面を開き、招待一覧の応答（本文）を返す */
async function openInvitations(page: Page): Promise<unknown> {
  const listed = page.waitForResponse((r) => isPath(r, 'GET', INVITATIONS_PATH));
  await page.goto('/admin/invitations');
  const response = await listed;
  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'ユーザー招待管理' })).toBeVisible();
  return response.json();
}

/** 招待画面の、メールアドレスで指定した招待の行 */
function invitationRow(page: Page, email: string) {
  return page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: email, exact: true }) });
}

/**
 * 監査ログ画面で種別を選び、招待の記録の行の日時以外の列を確かめる（要件40.5・40.12）
 *
 * 要件40.12: 対象の欄は招待先のメールアドレスで、行のどこにも招待の ID が出ない。行は種別の絞り込みと、
 * テストの中で作る一意のメールアドレスの対象の欄で特定する（日時の並びに依らない）。絞り込みの応答に
 * その招待の ID の記録があることも確かめ、画面の行が作った招待の記録であることを結ぶ
 */
async function expectAuditRecordOnScreen(
  page: Page,
  record: {
    action: string;
    label: string;
    actorEmail: string;
    invitationId: string;
    targetEmail: string;
  }
): Promise<void> {
  const filtered = page.waitForResponse(
    (r) =>
      isPath(r, 'GET', AUDIT_LOGS_PATH) &&
      new URL(r.url()).searchParams.get('action') === record.action
  );
  await page.getByLabel('イベント種別').selectOption(record.label);
  const filteredResponse = await filtered;
  expect(filteredResponse.status()).toBe(200);
  const logs = (await filteredResponse.json()) as Array<{ action: string; targetId: string }>;
  expect(
    logs.filter((log) => log.action === record.action && log.targetId === record.invitationId)
  ).toHaveLength(1);
  const row = page
    .getByRole('table')
    .locator('tbody tr')
    .filter({ has: page.getByRole('cell', { name: record.targetEmail, exact: true }) });
  await expect(row).toHaveCount(1);
  const cells = row.getByRole('cell');
  await expect(cells.nth(1)).toHaveText(record.label);
  await expect(cells.nth(2)).toHaveText(record.actorEmail);
  await expect(cells.nth(3)).toHaveText(record.targetEmail);
  await expect(row).not.toContainText(record.invitationId);
}

/** 招待の操作の監査の記録（DB）が対象のメールアドレスを持つことを確かめる（要件40.5） */
async function expectAuditTargetEmail(
  action: string,
  invitationId: string,
  actorId: string,
  email: string
): Promise<void> {
  const record = await getPrismaClient().auditLog.findFirstOrThrow({
    where: { action, targetId: invitationId },
    orderBy: { createdAt: 'desc' },
  });
  expect(record).toMatchObject({ actorId, targetType: 'Invitation' });
  expect(record.metadata).toMatchObject({ email });
}

/** 招待の相手のブラウザのコンテキストを開く（管理者のセッションと分ける） */
async function openGuestPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

test.describe('招待とパスワードリセットのトークンの保護', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    // テストの中で作った管理者の招待を先に消す（招待は作成者を参照するため、利用者だけでは消せない）
    await getPrismaClient().invitation.deleteMany({
      where: { inviter: { email: { startsWith: SESSION_USER_EMAIL_PREFIX } } },
    });
    await deleteSessionUsers();
  });

  /**
   * @requirement user-authentication/REQ-37.2
   * @requirement user-authentication/REQ-37.3
   * @requirement user-authentication/REQ-40.5
   * @requirement user-authentication/REQ-40.12
   */
  test('招待一覧にトークンと招待 URL が出ず、メールのリンクから登録でき、完了後の URL にトークンが残らず、作成と登録が監査ログ画面に出る', async ({
    page,
    browser,
  }) => {
    await ensureAdminUser();
    const prisma = getPrismaClient();
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_USERS.ADMIN_USER.email },
      select: { id: true },
    });
    const inviteeEmail = uniqueSessionEmail('invitee');

    // 管理者が招待画面で招待する
    await loginAsUser(page, 'ADMIN_USER');
    await openInvitations(page);
    const created = page.waitForResponse((r) => isPath(r, 'POST', INVITATIONS_PATH));
    await page.getByLabel('メールアドレス').fill(inviteeEmail);
    await page.getByRole('button', { name: /招待を送信|招待する/ }).click();
    const createdResponse = await created;
    expect(createdResponse.status()).toBe(201);
    const issued = (await createdResponse.json()) as { id: string; invitationUrl: string };
    const invitationId = issued.id;

    // 招待メールのリンク（トークンはフラグメント。要件37.3）
    const invitationEmail = await getEmailFromMailpit(inviteeEmail);
    const { pathWithFragment, token } = readTokenLink(invitationEmail.text, '/register');
    // 作成の直後の応答だけが、サーバーの組み立てた同じ招待 URL を返す（要件37.2 の例外）
    expect(issued.invitationUrl).toContain(`/register#token=${token}`);
    await expect(page.getByLabel('招待URL')).toHaveValue(issued.invitationUrl);

    // 要件37.2: 招待画面を開き直すと、一覧の応答にも画面にもトークン・ハッシュ・招待 URL が無い
    const listed = (await openInvitations(page)) as Array<Record<string, unknown>>;
    const listedInvitation = listed.find((item) => item.id === invitationId);
    expect(listedInvitation, '作成した招待が一覧にある').toBeDefined();
    expect(Object.keys(listedInvitation!).sort()).toEqual(INVITATION_SUMMARY_KEYS);
    const listedBody = JSON.stringify(listed);
    expect(listedBody).not.toContain(token);
    expect(listedBody).not.toContain(sha256Hex(token));
    expect(listedBody).not.toContain('#token=');
    for (const item of listed) {
      expect(Object.keys(item).sort()).toEqual(INVITATION_SUMMARY_KEYS);
    }
    await expect(invitationRow(page, inviteeEmail)).toHaveCount(1);
    await expect(invitationRow(page, inviteeEmail)).toContainText('未使用');
    await expect(page.locator('body')).not.toContainText(token);
    await expect(page.locator('body')).not.toContainText('#token=');
    await expect(page.getByLabel('招待URL')).toHaveCount(0);

    // 招待の相手がメールのリンクから登録する（別のコンテキスト）
    const guestPage = await openGuestPage(browser);
    try {
      const requestUrls = collectRequestUrls(guestPage);
      const verified = guestPage.waitForResponse((r) =>
        isPath(r, 'POST', `${INVITATIONS_PATH}/verify`)
      );
      await guestPage.goto(pathWithFragment);
      const verifiedResponse = await verified;
      expect(verifiedResponse.status()).toBe(200);
      // 要件37.3: 検証は本文でトークンを送り、画面は読んだ直後に URL からトークンを取り除く
      expect(verifiedResponse.request().postDataJSON()).toEqual({ token });
      await expect(guestPage).toHaveURL(/\/register$/);
      await expect(guestPage.getByLabel(/メールアドレス/)).toHaveValue(inviteeEmail);

      const password = uniquePassword('Invited');
      await guestPage.locator('input#password').fill(password);
      await guestPage.locator('input#passwordConfirm').fill(password);
      await guestPage.getByLabel(/表示名/).fill('Invited Member');
      await guestPage.getByRole('checkbox').check();
      const registered = guestPage.waitForResponse((r) =>
        isPath(r, 'POST', '/api/v1/auth/register')
      );
      await guestPage.getByRole('button', { name: /登録/ }).click();
      const registeredResponse = await registered;
      expect(registeredResponse.status()).toBe(201);
      expect(registeredResponse.request().postDataJSON()).toMatchObject({
        invitationToken: token,
      });

      // 要件37.3: 登録の完了後の URL（2FA 設定の画面）にトークンが無く、どの要求の URL にも載らない
      await expect(guestPage).toHaveURL(/\/profile\/2fa-setup$/, { timeout: getTimeout(15000) });
      expect(guestPage.url()).not.toContain(token);
      expect(
        requestUrls.some((url) => new URL(url).pathname === `${INVITATIONS_PATH}/verify`)
      ).toBe(true);
      expect(requestUrls.filter((url) => url.includes(token))).toEqual([]);
    } finally {
      await guestPage.context().close();
    }

    const invitee = await prisma.user.findUniqueOrThrow({
      where: { email: inviteeEmail },
      select: { id: true },
    });
    expect(
      await prisma.invitation.findUniqueOrThrow({
        where: { id: invitationId },
        select: { status: true },
      })
    ).toEqual({ status: 'used' });

    // 要件40.5: 招待の作成と招待経由の登録が、実行者と対象とともに監査ログ画面に出る
    // 要件40.12: 対象の欄は招待先のメールアドレスで、招待の ID は出ない
    await expectAuditTargetEmail('INVITATION_CREATED', invitationId, admin.id, inviteeEmail);
    await expectAuditTargetEmail('INVITATION_ACCEPTED', invitationId, invitee.id, inviteeEmail);
    const auditLoaded = page.waitForResponse((r) => isPath(r, 'GET', AUDIT_LOGS_PATH));
    await page.goto('/admin/audit-logs');
    expect((await auditLoaded).status()).toBe(200);
    await expectAuditRecordOnScreen(page, {
      action: 'INVITATION_CREATED',
      label: '招待作成',
      actorEmail: TEST_USERS.ADMIN_USER.email,
      invitationId,
      targetEmail: inviteeEmail,
    });
    await expectAuditRecordOnScreen(page, {
      action: 'INVITATION_ACCEPTED',
      label: '招待経由の登録',
      actorEmail: inviteeEmail,
      invitationId,
      targetEmail: inviteeEmail,
    });
  });

  /**
   * @requirement user-authentication/REQ-37.5
   * @requirement user-authentication/REQ-40.5
   * @requirement user-authentication/REQ-40.12
   */
  test('別の管理者が作成した招待を招待画面から取り消し・再送信でき、取り消しと再送信が監査ログ画面に出る', async ({
    page,
  }) => {
    await ensureAdminUser();
    const prisma = getPrismaClient();
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_USERS.ADMIN_USER.email },
      select: { id: true },
    });
    const otherAdmin = await createSessionUser('ADMIN_USER');
    expect(otherAdmin.id).not.toBe(admin.id);

    // 別の管理者が作成した、未使用の招待と期限切れの招待
    const pendingEmail = uniqueSessionEmail('revoke-target');
    const pending = await createInvitation({ email: pendingEmail, inviterId: otherAdmin.id });
    const expiredEmail = uniqueSessionEmail('resend-target');
    const expired = await createInvitation({
      email: expiredEmail,
      inviterId: otherAdmin.id,
      status: 'expired',
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    await loginAsUser(page, 'ADMIN_USER');
    await openInvitations(page);

    // 要件37.5: 作成者でない管理者の取り消しが受け付けられる
    const pendingRow = invitationRow(page, pendingEmail);
    await expect(pendingRow).toContainText('未使用');
    await pendingRow.getByRole('button', { name: '取り消し' }).click();
    const dialog = page.getByRole('dialog', { name: '招待を取り消しますか？' });
    const revoked = page.waitForResponse((r) =>
      isPath(r, 'DELETE', `${INVITATIONS_PATH}/${pending.id}`)
    );
    await dialog.getByRole('button', { name: 'はい、取り消します' }).click();
    expect((await revoked).status()).toBe(204);
    await expect(dialog).toBeHidden();
    await expect(pendingRow).toHaveCount(1);
    await expect(pendingRow.getByRole('button', { name: '取り消し' })).toHaveCount(0);
    expect(
      await prisma.invitation.findUniqueOrThrow({
        where: { id: pending.id },
        select: { status: true },
      })
    ).toEqual({ status: 'revoked' });

    // 別の管理者の期限切れの招待を再送信する（同じ行に新しいトークンと期限）
    const resent = page.waitForResponse((r) =>
      isPath(r, 'POST', `${INVITATIONS_PATH}/${expired.id}/resend`)
    );
    await invitationRow(page, expiredEmail).getByRole('button', { name: '再送信' }).click();
    const resentResponse = await resent;
    expect(resentResponse.status()).toBe(200);
    const reissued = (await resentResponse.json()) as { invitationUrl: string };
    expect(reissued.invitationUrl).toMatch(/\/register#token=[A-Za-z0-9_-]+$/);
    const afterResend = await prisma.invitation.findUniqueOrThrow({
      where: { id: expired.id },
      select: { status: true, expiresAt: true, tokenHash: true },
    });
    expect(afterResend.status).toBe('pending');
    expect(afterResend.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(afterResend.tokenHash).not.toBe(sha256Hex(expired.token));

    // 要件40.5: 取り消しと再送信が、実行者（取り消した管理者）と対象とともに監査ログ画面に出る
    // 要件40.12: 対象の欄は招待先のメールアドレスで、招待の ID は出ない
    await expectAuditTargetEmail('INVITATION_REVOKED', pending.id, admin.id, pendingEmail);
    await expectAuditTargetEmail('INVITATION_RESENT', expired.id, admin.id, expiredEmail);
    const auditLoaded = page.waitForResponse((r) => isPath(r, 'GET', AUDIT_LOGS_PATH));
    await page.goto('/admin/audit-logs');
    expect((await auditLoaded).status()).toBe(200);
    await expectAuditRecordOnScreen(page, {
      action: 'INVITATION_REVOKED',
      label: '招待取り消し',
      actorEmail: TEST_USERS.ADMIN_USER.email,
      invitationId: pending.id,
      targetEmail: pendingEmail,
    });
    await expectAuditRecordOnScreen(page, {
      action: 'INVITATION_RESENT',
      label: '招待再送信',
      actorEmail: TEST_USERS.ADMIN_USER.email,
      invitationId: expired.id,
      targetEmail: expiredEmail,
    });
  });

  /**
   * @requirement user-authentication/REQ-37.3
   */
  test('リセットのメールのリンクからパスワードを変更でき、URL と要求にトークンが残らず、新しいパスワードでログインできる', async ({
    page,
  }) => {
    const target = await resetDedicatedUser('STATE_CHANGE_USER');
    const newPassword = uniquePassword('ResetViaMail');
    // 操作の前から届いていた同じ宛先のメールは読まない（専用の利用者のメールアドレスは固定）
    const earlierEmails = await listMailpitMessageIds(target.email);

    await page.goto('/password-reset');
    const requested = page.waitForResponse((r) =>
      isPath(r, 'POST', '/api/v1/auth/password/reset-request')
    );
    await page.getByLabel(/メールアドレス/).fill(target.email);
    await page.getByRole('button', { name: /リセットリンクを送信/ }).click();
    expect((await requested).status()).toBe(200);

    const resetEmail = await getEmailFromMailpit(target.email, { excludeIds: earlierEmails });
    expect(resetEmail.subject).toContain('パスワードリセット');
    const { pathWithFragment, token } = readTokenLink(resetEmail.text, '/password-reset');

    const requestUrls = collectRequestUrls(page);
    const verified = page.waitForResponse((r) =>
      isPath(r, 'POST', '/api/v1/auth/password/verify-reset')
    );
    await page.goto(pathWithFragment);
    const verifiedResponse = await verified;
    expect(verifiedResponse.status()).toBe(200);
    // 要件37.3: 検証は本文でトークンを送り、画面は読んだ直後に URL からトークンを取り除く
    expect(verifiedResponse.request().postDataJSON()).toEqual({ token });
    await expect(page).toHaveURL(/\/password-reset$/);

    await expect(page.locator('input#password')).toBeEnabled({ timeout: getTimeout(10000) });
    await page.locator('input#password').fill(newPassword);
    await page.locator('input#passwordConfirm').fill(newPassword);
    const reset = page.waitForResponse((r) => isPath(r, 'POST', '/api/v1/auth/password/reset'));
    await page.getByRole('button', { name: /パスワードをリセット/ }).click();
    const resetResponse = await reset;
    expect(resetResponse.status()).toBe(200);
    expect(resetResponse.request().postDataJSON()).toMatchObject({ token });

    // 要件37.3: 完了後の URL（ログイン画面）にトークンが無く、どの要求の URL にも載らない
    await expect(page).toHaveURL(/\/login$/, { timeout: getTimeout(10000) });
    await expect(page.getByText(/パスワードがリセットされました/)).toBeVisible();
    expect(page.url()).not.toContain(token);
    expect(requestUrls.some((url) => new URL(url).pathname === '/api/v1/auth/password/reset')).toBe(
      true
    );
    expect(requestUrls.filter((url) => url.includes(token))).toEqual([]);

    // 新しいパスワードでログインできる（リセットが完了している）
    await submitLoginForm(page, { ...target, password: newPassword });
    await expect(page).not.toHaveURL(/\/login/);
  });
});
