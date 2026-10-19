/**
 * @fileoverview リフレッシュトークンのハッシュ保存と、系列による失効・再利用の検知の統合検証（タスク45.2）
 *
 * 確かめる振る舞い（要件33.4〜33.7）: ログアウトはそのセッションの系列を、全デバイスのログアウトと
 * パスワードの変更・リセットは利用者の全てを使用不能にする。置き換え済みのトークンの再提示は系列の
 * 全てを失効させ、監査に記録する。保存の値は原文から復元できない形式（SHA-256）である。
 *
 * モックを使わず、本物のアプリ（ログイン・リフレッシュ・ログアウトの API）と実 PostgreSQL を通す。
 * リフレッシュトークンの原文は応答の Set-Cookie から得て、リフレッシュとログアウトは画面と同じ Cookie と
 * CSRF・Origin の契約で呼ぶ（応答本文には含まれない。要件33.9・33.12）。
 */

import { createHash, randomBytes } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import {
  issuedRefreshToken,
  logoutWithCookie,
  refreshWithCookie,
} from './refresh-cookie-client.js';

const MARK = 'test-ua452-refresh-family';
const PASSWORD = 'Family!Passphrase-2026';
const NEW_PASSWORD = 'Rotated!Passphrase-2026x';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

interface Session {
  accessToken: string;
  refreshToken: string;
}

describe('リフレッシュトークンのハッシュ保存と系列による失効（統合）', () => {
  let prisma: PrismaClient;
  let passwordHash: string;
  let userId: string;
  let email: string;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }],
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  async function clearRateLimits(): Promise<void> {
    const client = redis.getClient();
    if (client) {
      const keys = await client.keys('rl:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }
  }

  async function login(): Promise<Session> {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { accessToken: response.body.accessToken, refreshToken: issuedRefreshToken(response) };
  }

  /** Cookie と CSRF の経路でリフレッシュする（`expectedStatus` を渡すと応答の状態を確かめる） */
  async function refresh(refreshToken: string, expectedStatus?: number) {
    const response = await refreshWithCookie(app, refreshToken);
    if (expectedStatus !== undefined) {
      expect(response.status).toBe(expectedStatus);
    }
    return response;
  }

  async function storedRows() {
    return prisma.refreshToken.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    passwordHash = await hash(PASSWORD, { memoryCost: 65536, timeCost: 3, parallelism: 4 });
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
    await clearRateLimits();
    email = `${MARK}-${randomBytes(4).toString('hex')}@example.com`;
    const user = await prisma.user.create({
      data: { email, displayName: 'Refresh Family User', passwordHash },
    });
    userId = user.id;
  });

  describe('保存の形式', () => {
    /**
     * @requirement user-authentication/REQ-33.7: ログインとローテーションで保存した値が原文と異なり、原文の SHA-256 と一致する
     */
    it('ログインとローテーションで保存した値は原文でなく、原文の SHA-256 である', async () => {
      const session = await login();

      const [loginRow] = await storedRows();
      expect(loginRow!.tokenHash).not.toBe(session.refreshToken);
      expect(loginRow!.tokenHash).toBe(sha256Hex(session.refreshToken));

      const rotated = await refresh(session.refreshToken, 200);
      const successor = issuedRefreshToken(rotated);

      const rows = await storedRows();
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.tokenHash)).toEqual([
        sha256Hex(session.refreshToken),
        sha256Hex(successor),
      ]);
      // どの列にも原文が残っていない
      const leaked = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM refresh_tokens AS t
        WHERE t."userId" = ${userId}
          AND (row_to_json(t)::text LIKE ${'%' + session.refreshToken + '%'}
            OR row_to_json(t)::text LIKE ${'%' + successor + '%'})`;
      expect(Number(leaked[0]!.count)).toBe(0);
    });

    it('ローテーションは前の行に置き換えの日時を記録し、後継を同じ系列で作る', async () => {
      const session = await login();
      await refresh(session.refreshToken, 200);

      const [previous, successor] = await storedRows();
      expect(previous!.replacedAt).toBeInstanceOf(Date);
      expect(successor!.replacedAt).toBeNull();
      expect(successor!.familyId).toBe(previous!.familyId);
    });
  });

  describe('再利用の検知', () => {
    it('置き換え済みのトークンの再提示で後継も使えなくなり、監査が残る', async () => {
      const session = await login();
      const rotated = await refresh(session.refreshToken, 200);
      const successor = issuedRefreshToken(rotated);
      const familyId = (await storedRows())[0]!.familyId;

      await refresh(session.refreshToken, 401);

      // 後継も使えない（系列の全てが失効している）
      await refresh(successor, 401);
      await expect(prisma.refreshToken.count({ where: { familyId } })).resolves.toBe(0);

      const audits = await prisma.auditLog.findMany({
        where: { action: 'REFRESH_TOKEN_REUSE_DETECTED', targetId: userId },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        actorId: userId,
        actorEmail: email,
        targetType: 'User',
      });
      expect(audits[0]!.metadata).toMatchObject({ familyId });
    });

    it('同じトークンを同時に二度提示すると、系列の全てが失効する', async () => {
      const session = await login();
      const familyId = (await storedRows())[0]!.familyId;

      const responses = await Promise.all([
        refresh(session.refreshToken),
        refresh(session.refreshToken),
      ]);

      expect(responses.map((r) => r.status).filter((s) => s === 200).length).toBeLessThanOrEqual(1);
      expect(responses.some((r) => r.status === 401)).toBe(true);
      for (const response of responses.filter((r) => r.status === 200)) {
        await refresh(issuedRefreshToken(response), 401);
      }
      await expect(prisma.refreshToken.count({ where: { familyId } })).resolves.toBe(0);
      await expect(
        prisma.auditLog.count({
          where: { action: 'REFRESH_TOKEN_REUSE_DETECTED', targetId: userId },
        })
      ).resolves.toBe(1);
    });

    it('他の系列（別のセッション）は再利用の検知で失効しない', async () => {
      const victim = await login();
      const other = await login();
      await refresh(victim.refreshToken, 200);

      await refresh(victim.refreshToken, 401);

      await refresh(other.refreshToken, 200);
    });
  });

  describe('ログアウトと全ての失効', () => {
    it('ログアウトはそのセッションの系列だけを失効させる', async () => {
      const session = await login();
      const other = await login();
      const rotated = await refresh(session.refreshToken, 200);
      const current = issuedRefreshToken(rotated);

      const loggedOut = await logoutWithCookie(app, session.accessToken, current);
      expect(loggedOut.status).toBe(200);

      await refresh(current, 401);
      // 系列の置き換え済みの行も消えている（再利用の監査は起きない）
      await refresh(session.refreshToken, 401);
      await expect(
        prisma.auditLog.count({
          where: { action: 'REFRESH_TOKEN_REUSE_DETECTED', targetId: userId },
        })
      ).resolves.toBe(0);
      await refresh(other.refreshToken, 200);
    });

    it('全デバイスのログアウトは利用者の全てを失効させる', async () => {
      const first = await login();
      const second = await login();

      await request(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${first.accessToken}`)
        .expect(200);

      await refresh(first.refreshToken, 401);
      await refresh(second.refreshToken, 401);
      await expect(storedRows()).resolves.toHaveLength(0);
    });

    it('パスワードの変更は利用者の全てを失効させる', async () => {
      const first = await login();
      const second = await login();

      await request(app)
        .post('/api/v1/auth/password/change')
        .set('Authorization', `Bearer ${first.accessToken}`)
        .send({
          currentPassword: PASSWORD,
          newPassword: NEW_PASSWORD,
          newPasswordConfirm: NEW_PASSWORD,
        })
        .expect(200);

      await refresh(first.refreshToken, 401);
      await refresh(second.refreshToken, 401);
      await expect(storedRows()).resolves.toHaveLength(0);
    });

    it('パスワードのリセットは利用者の全てを失効させる', async () => {
      const first = await login();
      const second = await login();
      const resetToken = randomBytes(32).toString('hex');
      await prisma.passwordResetToken.create({
        data: { userId, token: resetToken, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });

      await request(app)
        .post('/api/v1/auth/password/reset')
        .send({ token: resetToken, newPassword: NEW_PASSWORD })
        .expect(200);

      await refresh(first.refreshToken, 401);
      await refresh(second.refreshToken, 401);
      await expect(storedRows()).resolves.toHaveLength(0);
    });
  });
});
