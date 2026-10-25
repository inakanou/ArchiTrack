/**
 * @fileoverview 運用設定（ログレベル）の管理用エンドポイントの保護と変更の監査の E2E テスト
 *
 * user-authentication タスク55.5。design.md の AdminLogLevelEndpoint の節。ログレベルの変更・参照の画面は
 * 無いため、操作は API（`GET` / `POST /api/v1/admin/log-level`）で行い、変更の記録は監査ログ画面
 * （`/admin/audit-logs`）の種別の絞り込みと詳細の列（変更前・変更後）、および DB の監査の行で確かめる。
 *
 * Requirements (user-authentication):
 * - REQ-42.1: 未認証と一般ユーザー（システム管理者の権限を持たない）のログレベルの参照・変更は拒否され
 *   （401 / 403）、ログレベルは変わらず、変更の記録も残らない。認証の無い旧経路（`/admin/log-level`）は無い（404）
 * - REQ-42.2: 管理者がログレベルを変更すると、実行者と変更前後の値が監査に記録され、監査ログ画面に
 *   種別「運用設定変更」・実行者・対象・変更前後の値として出る
 *
 * ログレベルは E2E の backend のプロセス全体の状態のため、各テストの前に元の値を読み、終了時（失敗しても）に
 * 元の値へ戻す。実行者はテストの中で作る一意のメールアドレスの利用者（`SESSION_USER_EMAIL_PREFIX`）とし、
 * 各テストの後始末で消す。監査の行は消せない（不変）ため、主張はテストの開始時に既にあった行を除いた
 * 新しい行（と実行者の ID・メールアドレス）で範囲を絞る。
 *
 * 範囲は時刻ではなく開始時の行の ID の集合で絞る。WSL2 の壁時計は単調時計からずれ、同期で後ろへ
 * 戻ることがある（実測: 前のテストの後始末の復元の行の createdAt が、次のテストの開始時に DB で取った
 * now() より 1 秒余り後になり、一般ユーザーのテストが「記録が無い」の主張で落ちた）。
 */

import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import {
  createSessionUser,
  deleteSessionUsers,
  type SessionUser,
} from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { getAccessToken } from '../../helpers/auth-api';
import { API_BASE_URL } from '../../config';
import { getTimeout } from '../../helpers/wait-helpers';

const LOG_LEVEL_URL = `${API_BASE_URL}/api/v1/admin/log-level`;
/** 認証の無い旧経路（タスク55.1 で廃止） */
const LEGACY_LOG_LEVEL_URL = `${API_BASE_URL}/admin/log-level`;
const AUDIT_LOGS_PATH = '/api/v1/audit-logs';
const ACTION = 'OPERATIONAL_SETTING_CHANGED';
/** 監査ログ画面の種別の表示名（frontend/src/utils/audit-log-actions.ts） */
const ACTION_LABEL = '運用設定変更';
/** 監査の対象（backend/src/routes/admin.routes.ts） */
const TARGET_TYPE = 'OperationalSetting';
const TARGET_ID = 'logLevel';
const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

/** Bearer のヘッダー */
function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** 管理者のトークンで現在のログレベルを読む */
async function currentLevel(request: APIRequestContext, adminToken: string): Promise<string> {
  const response = await request.get(LOG_LEVEL_URL, { headers: bearer(adminToken) });
  expect(response.status(), await response.text()).toBe(200);
  const body = (await response.json()) as { level: string };
  expect(LOG_LEVELS).toContain(body.level);
  return body.level;
}

/** 現在あるログレベルの変更の監査の行の ID（テストの開始時の基準） */
async function existingChangeRecordIds(): Promise<string[]> {
  const rows = await getPrismaClient().auditLog.findMany({
    where: { action: ACTION },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/**
 * 基準（テストの開始時の行の ID）に無い、新しいログレベルの変更の監査の行
 * （実行者を指定すればその実行者に絞る）
 */
async function newChangeRecords(baselineIds: readonly string[], actorId?: string) {
  return getPrismaClient().auditLog.findMany({
    where: {
      action: ACTION,
      id: { notIn: [...baselineIds] },
      ...(actorId ? { actorId } : {}),
    },
    select: { actorId: true, targetType: true, targetId: true, before: true, after: true },
    orderBy: { createdAt: 'asc' },
  });
}

test.describe('運用設定（ログレベル）の管理用エンドポイントの保護と変更の監査', () => {
  test.describe.configure({ mode: 'serial' });

  /** テストの中で作る管理者（ログレベルの参照・復元と、変更の実行者） */
  let admin: SessionUser;
  let adminToken: string;
  /** テストの開始時のログレベル（終了時にこの値へ戻す） */
  let originalLevel: string;
  /**
   * テストの開始時にあったログレベルの変更の監査の行の ID（監査の行の範囲を絞る）。元の値を読んだ後に取り、
   * 前のテストの後始末の復元の記録を範囲に含めない。時刻で絞ると壁時計の巻き戻りで前の行が入る
   */
  let baselineIds: string[];
  let api: APIRequestContext;

  test.beforeEach(async ({ page }) => {
    api = await playwrightRequest.newContext();
    admin = await createSessionUser('ADMIN_USER');
    adminToken = await getAccessToken(page, admin);
    originalLevel = await currentLevel(api, adminToken);
    baselineIds = await existingChangeRecordIds();
  });

  test.afterEach(async () => {
    try {
      // 失敗しても元のログレベルへ戻す（他の spec の記録に影響させない）。変わっていなくても
      // 無条件に送る（同じ値の変更も記録されるが、行は後始末の管理者のものでテストの主張の外）
      const restored = await api.post(LOG_LEVEL_URL, {
        headers: bearer(adminToken),
        data: { level: originalLevel },
      });
      expect(restored.status(), await restored.text()).toBe(200);
      expect(await currentLevel(api, adminToken)).toBe(originalLevel);
    } finally {
      await api.dispose();
      await deleteSessionUsers();
    }
  });

  /**
   * @requirement user-authentication/REQ-42.1
   */
  test('未認証ではログレベルを参照・変更できず、認証の無い旧経路も無い', async () => {
    const otherLevel = LOG_LEVELS.find((level) => level !== originalLevel)!;

    const read = await api.get(LOG_LEVEL_URL);
    expect(read.status()).toBe(401);
    expect(await read.text()).not.toContain('"level"');

    const change = await api.post(LOG_LEVEL_URL, { data: { level: otherLevel } });
    expect(change.status()).toBe(401);

    const forgedToken = await api.post(LOG_LEVEL_URL, {
      headers: bearer('invalid.token.value'),
      data: { level: otherLevel },
    });
    expect(forgedToken.status()).toBe(401);

    // 認証の無い旧経路は設けない
    const legacyRead = await api.get(LEGACY_LOG_LEVEL_URL);
    expect(legacyRead.status()).toBe(404);
    const legacyChange = await api.post(LEGACY_LOG_LEVEL_URL, { data: { level: otherLevel } });
    expect(legacyChange.status()).toBe(404);

    expect(await currentLevel(api, adminToken)).toBe(originalLevel);
    expect(await newChangeRecords(baselineIds)).toEqual([]);
  });

  /**
   * @requirement user-authentication/REQ-42.1
   */
  test('一般ユーザーはログレベルを参照・変更できない', async ({ page }) => {
    const regular = await createSessionUser('REGULAR_USER');
    const regularToken = await getAccessToken(page, regular);
    const otherLevel = LOG_LEVELS.find((level) => level !== originalLevel)!;

    const read = await api.get(LOG_LEVEL_URL, { headers: bearer(regularToken) });
    expect(read.status(), await read.text()).toBe(403);
    expect(await read.text()).not.toContain('"level"');

    const change = await api.post(LOG_LEVEL_URL, {
      headers: bearer(regularToken),
      data: { level: otherLevel },
    });
    expect(change.status(), await change.text()).toBe(403);

    expect(await currentLevel(api, adminToken)).toBe(originalLevel);
    expect(await newChangeRecords(baselineIds)).toEqual([]);

    // 対照: 同じ要求を管理者が送れば参照できる（拒否が経路の誤りなど別の理由で起きていない）
    const adminRead = await api.get(LOG_LEVEL_URL, { headers: bearer(adminToken) });
    expect(adminRead.status()).toBe(200);
  });

  /**
   * @requirement user-authentication/REQ-42.2
   */
  test('管理者のログレベルの変更が実行者と変更前後の値とともに記録され、監査ログ画面に出る', async ({
    page,
  }) => {
    const newLevel = originalLevel === 'warn' ? 'error' : 'warn';

    const change = await api.post(LOG_LEVEL_URL, {
      headers: bearer(adminToken),
      data: { level: newLevel },
    });
    expect(change.status(), await change.text()).toBe(200);
    expect(await change.json()).toMatchObject({ success: true, level: newLevel });
    expect(await currentLevel(api, adminToken)).toBe(newLevel);

    // DB: 実行者と変更前後の値
    expect(await newChangeRecords(baselineIds, admin.id)).toEqual([
      {
        actorId: admin.id,
        targetType: TARGET_TYPE,
        targetId: TARGET_ID,
        before: { logLevel: originalLevel },
        after: { logLevel: newLevel },
      },
    ]);

    // 画面: 種別で絞り込み、実行者・対象・変更前後の値の行が出る
    await loginAsUser(page, admin);
    const initial = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        new URL(r.url()).pathname === AUDIT_LOGS_PATH &&
        !new URL(r.url()).searchParams.has('action')
    );
    await page.goto('/admin/audit-logs');
    expect((await initial).status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: '監査ログ' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    const actionFilter = page.getByLabel('イベント種別');
    const filtered = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        new URL(r.url()).pathname === AUDIT_LOGS_PATH &&
        new URL(r.url()).searchParams.get('action') === ACTION
    );
    await actionFilter.selectOption(ACTION_LABEL);
    expect((await filtered).status()).toBe(200);
    await expect(actionFilter).toHaveValue(ACTION);

    const rows = page
      .getByRole('table')
      .locator('tbody tr')
      .filter({ has: page.getByRole('cell', { name: admin.email, exact: true }) });
    await expect(rows).toHaveCount(1);
    const cells = rows.first().getByRole('cell');
    await expect(cells.nth(1)).toHaveText(ACTION_LABEL);
    await expect(cells.nth(2)).toHaveText(admin.email);
    await expect(cells.nth(3)).toHaveText(TARGET_ID);
    await expect(cells.nth(4)).toContainText(`変更前: {"logLevel":"${originalLevel}"}`);
    await expect(cells.nth(4)).toContainText(`変更後: {"logLevel":"${newLevel}"}`);
  });
});
