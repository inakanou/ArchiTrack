/**
 * @fileoverview パスワードリセットのトークンのハッシュ保存の統合検証（user-authentication タスク50.2）
 *
 * Requirements (user-authentication):
 * - REQ-37.1: パスワードリセットトークンを、保存された値だけからは元のトークンを復元できない形式（SHA-256）で保存する
 *
 * モックを使わず、本物の PasswordService・アプリ（検証とリセットの経路）と実 PostgreSQL を通す。
 * メールの投入だけを差し替え、メールへ渡る原文を受け取る。
 */

import { createHash, randomBytes } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import { PasswordService } from '../../services/password.service.js';
import type { EmailService } from '../../services/email.service.js';
import { hashPasswordResetToken } from '../../utils/password-reset-token.js';
import { createTestUser } from './test-user-factory.js';
import { createStoredPasswordResetToken } from './password-reset-token-fixture.js';

const MARK = 'test-50-2-reset-token-hash';
const HOUR_MS = 60 * 60 * 1000;
const VERIFY_PATH = '/api/v1/auth/password/verify-reset';
const RESET_PATH = '/api/v1/auth/password/reset';
const NEW_PASSWORD = 'Str0ng!Passphrase-2026-50-2';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('パスワードリセットのトークンのハッシュ保存（統合）', () => {
  let prisma: PrismaClient;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.passwordHistory.deleteMany({ where: { userId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  async function createUser(label: string) {
    return createTestUser(prisma, {
      email: `${MARK}-${label}-${randomBytes(4).toString('hex')}@example.com`,
      displayName: `${MARK}-${label}`,
      passwordHash: 'not-used-for-login',
    });
  }

  /** パスワードリセットのトークンの表の行を、列の名前とともに生のまま読む */
  async function rawRowsFor(userId: string): Promise<Array<Record<string, unknown>>> {
    return prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM "password_reset_tokens" WHERE "userId" = ${userId}
    `;
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

  /**
   * @requirement user-authentication/REQ-37.1
   */
  it('リセットの要求はメールへ渡す原文の SHA-256 だけを保存し、原文はどの列にも残らない', async () => {
    const user = await createUser('request');
    const sentTokens: string[] = [];
    const emailService = {
      sendPasswordResetEmail: async (_email: string, token: string) => {
        sentTokens.push(token);
      },
    } as unknown as EmailService;

    const result = await new PasswordService(prisma, emailService).requestPasswordReset(user.email);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(sentTokens).toHaveLength(1);
    const rawToken = sentTokens[0]!;
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);

    const stored = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.tokenHash).toBe(sha256Hex(rawToken));
    expect(stored[0]!.tokenHash).not.toBe(rawToken);

    const rawRows = await rawRowsFor(user.id);
    expect(rawRows).toHaveLength(1);
    expect(Object.keys(rawRows[0]!)).not.toContain('token');
    expect(Object.values(rawRows[0]!)).not.toContain(rawToken);
  });

  /**
   * @requirement user-authentication/REQ-37.1
   */
  it('検証の経路（クエリ）とリセットの経路は原文のハッシュで行を引き、保存された値そのものはトークンとして通らない', async () => {
    const user = await createUser('verify');
    const { rawToken, resetToken } = await createStoredPasswordResetToken(prisma, {
      userId: user.id,
      expiresAt: new Date(Date.now() + HOUR_MS),
    });
    expect(resetToken.tokenHash).toBe(hashPasswordResetToken(rawToken));
    expect(resetToken.tokenHash).not.toBe(rawToken);

    // 保存された値（ハッシュ）を提示しても一致しない
    const byStoredValue = await request(app)
      .get(VERIFY_PATH)
      .query({ token: resetToken.tokenHash });
    expect(byStoredValue.status).toBe(400);
    expect(byStoredValue.body.code).toBe('INVALID_RESET_TOKEN');
    const resetByStoredValue = await request(app)
      .post(RESET_PATH)
      .send({ token: resetToken.tokenHash, newPassword: NEW_PASSWORD });
    expect(resetByStoredValue.status).toBe(400);
    expect(resetByStoredValue.body.code).toBe('RESET_TOKEN_INVALID');

    // 原文なら検証とリセットができる
    const verified = await request(app).get(VERIFY_PATH).query({ token: rawToken });
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    expect(verified.body).toEqual({ valid: true });

    const reset = await request(app)
      .post(RESET_PATH)
      .send({ token: rawToken, newPassword: NEW_PASSWORD });
    expect(reset.status, JSON.stringify(reset.body)).toBe(200);

    const used = await prisma.passwordResetToken.findUniqueOrThrow({
      where: { id: resetToken.id },
    });
    expect(used.usedAt).not.toBeNull();
    const afterUse = await request(app).get(VERIFY_PATH).query({ token: rawToken });
    expect(afterUse.status).toBe(400);
    expect(afterUse.body.code).toBe('TOKEN_USED');
  });

  /**
   * @requirement user-authentication/REQ-37.1
   */
  it('移行の SQL（UTF-8 の SHA-256 の 16 進）とアプリの計算が同じ値を返し、トークンの列はハッシュの必須の一意列だけになる', async () => {
    const samples = [randomBytes(32).toString('hex'), 'test-reset-token-日本語'];
    for (const sample of samples) {
      const rows = await prisma.$queryRaw<Array<{ hash: string }>>`
        SELECT encode(sha256(convert_to(${sample}, 'UTF8')), 'hex') AS "hash"
      `;
      expect(rows[0]!.hash).toBe(hashPasswordResetToken(sample));
    }

    const columns = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string }>>`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'password_reset_tokens'
    `;
    const names = columns.map((c) => c.column_name);
    expect(names).not.toContain('token');
    expect(columns.find((c) => c.column_name === 'token_hash')?.is_nullable).toBe('NO');

    const indexes = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = 'password_reset_tokens'
    `;
    expect(
      indexes.some((i) => /CREATE UNIQUE INDEX .* \(token_hash\)/.test(i.indexdef)),
      JSON.stringify(indexes)
    ).toBe(true);
  });
});
