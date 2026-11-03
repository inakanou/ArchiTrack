/**
 * @fileoverview 招待とリセットのトークンを本文で受け渡す検証の経路の統合検証（user-authentication タスク50.3）
 *
 * Requirements (user-authentication):
 * - REQ-37.3: 招待トークン・パスワードリセットトークンの検証の要求を記録するとき、アクセスログその他の記録にトークンの値を残さない
 *
 * モックを使わず、本物のアプリ（検証とリセットの経路）と実 PostgreSQL を通す。
 * トークンは URL に載せず本文で受け（クエリの検証の経路は置かない）、リセットの成功の記録にも残さない。
 */

import { randomBytes } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import logger from '../../utils/logger.js';
import { createTestUser } from './test-user-factory.js';
import { createStoredInvitation } from './invitation-fixture.js';
import { createStoredPasswordResetToken } from './password-reset-token-fixture.js';

const MARK = 'test-50-3-token-transport';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const RESET_VERIFY_PATH = '/api/v1/auth/password/verify-reset';
const RESET_PATH = '/api/v1/auth/password/reset';
const INVITATION_VERIFY_PATH = '/api/v1/invitations/verify';
const NEW_PASSWORD = 'Str0ng!Passphrase-2026-50-3';

describe('招待とリセットのトークンの本文による検証（統合）', () => {
  let prisma: PrismaClient;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.invitation.deleteMany({ where: { email: { contains: MARK } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.passwordHistory.deleteMany({ where: { userId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  function markedEmail(label: string): string {
    return `${MARK}-${label}-${randomBytes(4).toString('hex')}@example.com`;
  }

  async function createUser(label: string) {
    return createTestUser(prisma, {
      email: markedEmail(label),
      displayName: `${MARK}-${label}`,
      passwordHash: 'not-used-for-login',
    });
  }

  /** アプリのロガーへ渡った全ての記録（呼び出しの引数）を一つの文字列にする */
  function spyOnLogs() {
    const spies = (['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const).map((level) =>
      vi.spyOn(logger, level)
    );
    return () => JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * @requirement user-authentication/REQ-37.3
   */
  it('リセットのトークンは本文で検証し、クエリの検証の経路は無い', async () => {
    const user = await createUser('reset-verify');
    const { rawToken } = await createStoredPasswordResetToken(prisma, {
      userId: user.id,
      expiresAt: new Date(Date.now() + HOUR_MS),
    });

    const verified = await request(app).post(RESET_VERIFY_PATH).send({ token: rawToken });
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    expect(verified.body).toEqual({ valid: true });

    const missing = await request(app).post(RESET_VERIFY_PATH).send({});
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('MISSING_TOKEN');

    const byQuery = await request(app).get(RESET_VERIFY_PATH).query({ token: rawToken });
    expect(byQuery.status).toBe(404);
    expect(byQuery.body).not.toHaveProperty('valid');
  });

  /**
   * @requirement user-authentication/REQ-37.3
   */
  it('招待のトークンは本文で検証し、クエリの検証の経路は無い', async () => {
    const inviter = await createUser('inviter');
    const email = markedEmail('invitee');
    const { rawToken } = await createStoredInvitation(prisma, {
      email,
      inviterId: inviter.id,
      expiresAt: new Date(Date.now() + 7 * DAY_MS),
    });

    const verified = await request(app).post(INVITATION_VERIFY_PATH).send({ token: rawToken });
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    expect(verified.body).toEqual({ email });

    const missing = await request(app).post(INVITATION_VERIFY_PATH).send({});
    expect(missing.status).toBe(400);

    const byQuery = await request(app).get(INVITATION_VERIFY_PATH).query({ token: rawToken });
    expect(byQuery.status).toBe(404);
    expect(byQuery.body).not.toHaveProperty('email');
  });

  /**
   * @requirement user-authentication/REQ-37.3
   */
  it('リセットの検証と実行の記録にトークンの値もその先頭も残さない', async () => {
    const user = await createUser('reset-log');
    const { rawToken } = await createStoredPasswordResetToken(prisma, {
      userId: user.id,
      expiresAt: new Date(Date.now() + HOUR_MS),
    });
    const loggedText = spyOnLogs();

    const verified = await request(app).post(RESET_VERIFY_PATH).send({ token: rawToken });
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    const reset = await request(app)
      .post(RESET_PATH)
      .send({ token: rawToken, newPassword: NEW_PASSWORD });
    expect(reset.status, JSON.stringify(reset.body)).toBe(200);

    const logs = loggedText();
    // 成功の記録そのものは残る（記録を消して主張を空振りさせない）
    expect(logs).toContain('Password reset successfully');
    expect(logs).toContain(user.id);
    expect(logs).not.toContain(rawToken);
    expect(logs).not.toContain(rawToken.substring(0, 8));
  });
});
