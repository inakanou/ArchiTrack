/**
 * @fileoverview リフレッシュトークンのハッシュ保存と、系列による失効・再利用の検知の統合検証（タスク45.2）
 *
 * 確かめる振る舞い（要件33.4〜33.7）: ログアウトはそのセッションの系列を、全デバイスのログアウトと
 * パスワードの変更・リセットは利用者の全てを使用不能にする。置き換え済みのトークンの再提示は系列の
 * 全てを失効させ、監査に記録する。保存の値は原文から復元できない形式（SHA-256）である。
 * 置き換えから 10 秒以内で後継が未使用の再提示は系列を失効させず新しい後継を発行する（要件33.13、タスク69.1）。
 * 猶予を過ぎた再提示は、置き換えの時刻を 10 秒より前へ戻して作る。
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
import { loginForTokens } from './auth-login-client.js';
import { createTestUser } from './test-user-factory.js';
import { createStoredPasswordResetToken } from './password-reset-token-fixture.js';
import { REFRESH_REUSE_GRACE_MS } from '../../services/session.service.js';

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
    const response = await loginForTokens(app, { email, password: PASSWORD });
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

  /** 置き換えの時刻を猶予（10 秒）より前へ戻し、猶予を過ぎた再提示を作る */
  async function ageReplacement(refreshToken: string): Promise<void> {
    const { count } = await prisma.refreshToken.updateMany({
      where: { tokenHash: sha256Hex(refreshToken), replacedAt: { not: null } },
      data: { replacedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1000) },
    });
    expect(count).toBe(1);
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
    const user = await createTestUser(prisma, {
      email,
      displayName: 'Refresh Family User',
      passwordHash,
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
      expect(successor!.parentId).toBe(previous!.id);
    });
  });

  describe('再利用の検知', () => {
    /**
     * @requirement user-authentication/REQ-33.6: 猶予を過ぎた置き換え済みのトークンの再提示で、派生した全てのトークンが失効する
     */
    it('置き換えから 10 秒を過ぎたトークンの再提示で後継も使えなくなり、監査が残る', async () => {
      const session = await login();
      const rotated = await refresh(session.refreshToken, 200);
      const successor = issuedRefreshToken(rotated);
      const familyId = (await storedRows())[0]!.familyId;
      await ageReplacement(session.refreshToken);

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

    /**
     * @requirement user-authentication/REQ-33.6: 後継が既にローテーションに使われていれば、10秒以内でも系列の全てが失効する
     */
    it('後継が使われた後の置き換え済みのトークンの再提示は、10 秒以内でも系列の全てを失効させる', async () => {
      const session = await login();
      const second = issuedRefreshToken(await refresh(session.refreshToken, 200));
      const third = issuedRefreshToken(await refresh(second, 200));
      const familyId = (await storedRows())[0]!.familyId;

      await refresh(session.refreshToken, 401);

      await refresh(third, 401);
      await expect(prisma.refreshToken.count({ where: { familyId } })).resolves.toBe(0);
      await expect(
        prisma.auditLog.count({
          where: { action: 'REFRESH_TOKEN_REUSE_DETECTED', targetId: userId },
        })
      ).resolves.toBe(1);
    });

    /**
     * @requirement user-authentication/REQ-33.13: 置き換えから10秒以内で後継が未使用の再提示は、系列を失効させずに新しい後継を発行し、未使用の後継を置き換え済みにする
     */
    it('置き換えの直後で後継が未使用の再提示は、系列を残して新しい後継を発行し、届かなかった後継を置き換え済みにする', async () => {
      const session = await login();
      // 画面の移動で応答が届かなかった後継
      const lost = issuedRefreshToken(await refresh(session.refreshToken, 200));
      const familyId = (await storedRows())[0]!.familyId;

      const regranted = await refresh(session.refreshToken, 200);
      const reissued = issuedRefreshToken(regranted);
      expect(reissued).not.toBe(lost);
      expect(reissued).not.toBe(session.refreshToken);

      const rows = await prisma.refreshToken.findMany({ where: { familyId } });
      const byHash = new Map(rows.map((row) => [row.tokenHash, row]));
      const original = byHash.get(sha256Hex(session.refreshToken))!;
      expect(byHash.get(sha256Hex(lost))!.replacedAt).toBeInstanceOf(Date);
      expect(byHash.get(sha256Hex(reissued))!.replacedAt).toBeNull();
      expect(byHash.get(sha256Hex(reissued))!.parentId).toBe(original.id);
      expect(rows.filter((row) => row.replacedAt === null)).toHaveLength(1);
      await expect(
        prisma.auditLog.count({
          where: { action: 'REFRESH_TOKEN_REUSE_DETECTED', targetId: userId },
        })
      ).resolves.toBe(0);

      // 新しい後継でセッションが続く
      await refresh(reissued, 200);
    });

    it('猶予で置き換え済みにした後継を、猶予を過ぎて提示すると系列の全てが失効する', async () => {
      const session = await login();
      const lost = issuedRefreshToken(await refresh(session.refreshToken, 200));
      const reissued = issuedRefreshToken(await refresh(session.refreshToken, 200));
      const familyId = (await storedRows())[0]!.familyId;
      await ageReplacement(lost);

      await refresh(lost, 401);

      await refresh(reissued, 401);
      await expect(prisma.refreshToken.count({ where: { familyId } })).resolves.toBe(0);
    });

    /**
     * @requirement user-authentication/REQ-33.13: 同じトークンの同時の提示は直列化され、二度目は猶予で新しい後継を受け取る
     */
    it('同じトークンを同時に二度提示すると、どちらも成功し系列の未置き換えの行は 1 行になる', async () => {
      const session = await login();
      const familyId = (await storedRows())[0]!.familyId;

      const responses = await Promise.all([
        refresh(session.refreshToken),
        refresh(session.refreshToken),
      ]);

      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      const issued = responses.map((r) => issuedRefreshToken(r));
      expect(new Set(issued).size).toBe(2);
      const active = await prisma.refreshToken.findMany({ where: { familyId, replacedAt: null } });
      expect(active).toHaveLength(1);
      expect(issued.map(sha256Hex)).toContain(active[0]!.tokenHash);
      await expect(
        prisma.auditLog.count({
          where: { action: 'REFRESH_TOKEN_REUSE_DETECTED', targetId: userId },
        })
      ).resolves.toBe(0);
    });

    it('他の系列（別のセッション）は再利用の検知で失効しない', async () => {
      const victim = await login();
      const other = await login();
      await refresh(victim.refreshToken, 200);
      await ageReplacement(victim.refreshToken);

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
      const { rawToken: resetToken } = await createStoredPasswordResetToken(prisma, {
        userId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
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
