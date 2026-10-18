/**
 * @fileoverview リフレッシュとログアウトで Cookie を受け付ける互換の期間の統合検証（タスク45.3）
 *
 * 確かめる振る舞い（要件33.12）: 本文にリフレッシュトークンが無い要求は Cookie を読み、CSRF の
 * 二重送信（Cookie `csrf-token` とヘッダー `X-CSRF-Token`）と Origin（無ければ Referer）の照合を課す。
 * 本文にリフレッシュトークンがある要求は旧来の経路で扱い、CSRF を課さない（45.5 で外す互換の経路）。
 * あわせて、リフレッシュの Cookie の Path が認証の経路に限られ、CORS が `X-CSRF-Token` を許すことを確かめる。
 *
 * モックを使わず、本物のアプリ（CSRF トークンの取得・ログイン・リフレッシュ・ログアウトの API）と
 * 実 PostgreSQL を通す。試験環境（NODE_ENV=test）でも Cookie の経路の CSRF が素通りしないことを含む。
 */

import { randomBytes } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { validateEnv, getEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { hashRefreshToken } from '../../services/session.service.js';

const MARK = 'test-ua453-refresh-cookie';
const PASSWORD = 'Cookie!Passphrase-2026';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

interface Session {
  accessToken: string;
  refreshToken: string;
}

/** 応答の Set-Cookie から、指定した名前の Cookie の行を全て返す */
function setCookieLines(response: request.Response, name: string): string[] {
  const raw = response.headers['set-cookie'] as unknown;
  const lines = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  return lines.filter((line) => line.startsWith(`${name}=`));
}

/** Set-Cookie の行から値を取り出す */
function cookieValue(line: string): string {
  return line.slice(line.indexOf('=') + 1).split(';')[0]!;
}

/** Set-Cookie の行が消去（空の値・過去の期限）かを返す */
function isClearing(line: string): boolean {
  return cookieValue(line) === '' && /Expires=Thu, 01 Jan 1970/i.test(line);
}

/** Set-Cookie の行の Path を返す */
function cookiePath(line: string): string | undefined {
  const match = /;\s*Path=([^;]*)/i.exec(line);
  return match?.[1];
}

describe('リフレッシュとログアウトの Cookie の受け付けと CSRF の検証（統合）', () => {
  let prisma: PrismaClient;
  let passwordHash: string;
  let userId: string;
  let email: string;
  let frontendOrigin: string;

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

  async function login(): Promise<{ session: Session; response: request.Response }> {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return {
      session: { accessToken: response.body.accessToken, refreshToken: response.body.refreshToken },
      response,
    };
  }

  async function fetchCsrfToken(): Promise<string> {
    const response = await request(app).get('/csrf-token').expect(200);
    return response.body.csrfToken as string;
  }

  /** 本文なしで Cookie だけを送るリフレッシュ（CSRF のヘッダー・Origin は呼び出し側で足す） */
  function cookieRefresh(cookies: string[]) {
    return request(app).post('/api/v1/auth/refresh').set('Cookie', cookies);
  }

  /** 原文のハッシュで保存された行を読む */
  async function rowOf(refreshToken: string) {
    return prisma.refreshToken.findFirst({ where: { tokenHash: hashRefreshToken(refreshToken) } });
  }

  /** 旧来の本文の経路でリフレッシュトークンが今も使えるか（使えればローテーションされる） */
  async function stillUsable(refreshToken: string): Promise<boolean> {
    const response = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    return response.status === 200;
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    frontendOrigin = new URL(getEnv().FRONTEND_URL).origin;
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
      data: { email, displayName: 'Refresh Cookie User', passwordHash },
    });
    userId = user.id;
  });

  describe('Cookie の属性と CORS', () => {
    it('ログインで発行するリフレッシュの Cookie の Path は認証の経路に限られる', async () => {
      const { session, response } = await login();

      const issued = setCookieLines(response, 'refreshToken').filter((line) => !isClearing(line));
      expect(issued).toHaveLength(1);
      expect(cookieValue(issued[0]!)).toBe(session.refreshToken);
      expect(cookiePath(issued[0]!)).toBe(REFRESH_COOKIE_PATH);
      expect(issued[0]).toMatch(/HttpOnly/i);
      expect(issued[0]).toMatch(/SameSite=Strict/i);
    });

    it('CORS の事前確認が X-CSRF-Token のヘッダーを許す', async () => {
      const response = await request(app)
        .options('/api/v1/auth/refresh')
        .set('Origin', frontendOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,x-csrf-token');

      const allowed = String(response.headers['access-control-allow-headers'] ?? '')
        .split(',')
        .map((h) => h.trim().toLowerCase());
      expect(allowed).toContain('x-csrf-token');
    });
  });

  describe('リフレッシュの Cookie の経路（本文なし）', () => {
    /**
     * @requirement user-authentication/REQ-33.12: 本文が無く Cookie と CSRF のヘッダーと許可されたオリジンがあるリフレッシュは成功する
     */
    it('本文が無く Cookie と CSRF のヘッダーがあるリフレッシュは成功し、後継を認証の経路の Cookie で返す', async () => {
      const { session } = await login();
      const csrf = await fetchCsrfToken();

      const response = await cookieRefresh([
        `refreshToken=${session.refreshToken}`,
        `csrf-token=${csrf}`,
      ])
        .set('X-CSRF-Token', csrf)
        .set('Origin', frontendOrigin);

      expect(response.status).toBe(200);
      expect(typeof response.body.accessToken).toBe('string');
      const issued = setCookieLines(response, 'refreshToken').filter((line) => !isClearing(line));
      expect(issued).toHaveLength(1);
      expect(cookiePath(issued[0]!)).toBe(REFRESH_COOKIE_PATH);
      const successor = cookieValue(issued[0]!);
      expect(successor).not.toBe(session.refreshToken);

      // Cookie で提示したトークンがローテーションされた（後継が使え、旧は置き換え済み）
      const rows = await prisma.refreshToken.findMany({ where: { userId } });
      expect(rows).toHaveLength(2);
      expect(rows.filter((row) => row.replacedAt !== null)).toHaveLength(1);
      expect(await stillUsable(successor)).toBe(true);
    });

    /**
     * @requirement user-authentication/REQ-33.12: 本文が無く Cookie だけで CSRF のヘッダーが無いリフレッシュは 403 で、トークンを消費しない
     */
    it('本文が無く Cookie だけで CSRF のヘッダーが無いリフレッシュは 403 になり、トークンを消費しない', async () => {
      const { session } = await login();
      const csrf = await fetchCsrfToken();

      const response = await cookieRefresh([
        `refreshToken=${session.refreshToken}`,
        `csrf-token=${csrf}`,
      ]).set('Origin', frontendOrigin);

      expect(response.status).toBe(403);
      expect(setCookieLines(response, 'refreshToken')).toHaveLength(0);
      const rows = await prisma.refreshToken.findMany({ where: { userId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.replacedAt).toBeNull();
      expect(await stillUsable(session.refreshToken)).toBe(true);
    });

    /**
     * @requirement user-authentication/REQ-33.12: CSRF の Cookie とヘッダーが一致しないリフレッシュは 403
     */
    it('CSRF の Cookie とヘッダーが一致しないリフレッシュは 403 になる', async () => {
      const { session } = await login();
      const csrf = await fetchCsrfToken();

      const response = await cookieRefresh([
        `refreshToken=${session.refreshToken}`,
        `csrf-token=${csrf}`,
      ])
        .set('X-CSRF-Token', `${csrf.slice(0, -1)}${csrf.endsWith('0') ? '1' : '0'}`)
        .set('Origin', frontendOrigin);

      expect(response.status).toBe(403);
      expect(await stillUsable(session.refreshToken)).toBe(true);
    });

    /**
     * @requirement user-authentication/REQ-33.12: 許可されたオリジン以外からの Cookie のリフレッシュは CSRF のトークンが揃っていても 403
     */
    it('Origin が画面のオリジンと異なるリフレッシュは CSRF のトークンが揃っていても 403 になる', async () => {
      const { session } = await login();
      const csrf = await fetchCsrfToken();

      const response = await cookieRefresh([
        `refreshToken=${session.refreshToken}`,
        `csrf-token=${csrf}`,
      ])
        .set('X-CSRF-Token', csrf)
        .set('Origin', 'https://attacker.example');

      expect(response.status).toBe(403);
      expect(await stillUsable(session.refreshToken)).toBe(true);
    });

    /**
     * @requirement user-authentication/REQ-33.12: Origin が無いときは Referer のオリジンで照合し、どちらも無ければ 403
     */
    it('Origin が無いときは Referer で照合し、Origin も Referer も無ければ 403 になる', async () => {
      const { session } = await login();
      const csrf = await fetchCsrfToken();
      const cookies = [`refreshToken=${session.refreshToken}`, `csrf-token=${csrf}`];

      const withoutOrigin = await cookieRefresh(cookies).set('X-CSRF-Token', csrf);
      expect(withoutOrigin.status).toBe(403);

      const foreignReferer = await cookieRefresh(cookies)
        .set('X-CSRF-Token', csrf)
        .set('Referer', 'https://attacker.example/page');
      expect(foreignReferer.status).toBe(403);

      const ownReferer = await cookieRefresh(cookies)
        .set('X-CSRF-Token', csrf)
        .set('Referer', `${frontendOrigin}/dashboard`);
      expect(ownReferer.status).toBe(200);
    });

    it('本文も Cookie も無いリフレッシュは CSRF の検証を通っても 400 になる', async () => {
      const csrf = await fetchCsrfToken();

      const response = await cookieRefresh([`csrf-token=${csrf}`])
        .set('X-CSRF-Token', csrf)
        .set('Origin', frontendOrigin);

      expect(response.status).toBe(400);
    });

    it('Cookie のトークンが無効なリフレッシュは 401 になり、リフレッシュの Cookie を消す', async () => {
      const csrf = await fetchCsrfToken();

      const response = await cookieRefresh([
        'refreshToken=invalid.refresh.token',
        `csrf-token=${csrf}`,
      ])
        .set('X-CSRF-Token', csrf)
        .set('Origin', frontendOrigin);

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('INVALID_REFRESH_TOKEN');
      const cleared = setCookieLines(response, 'refreshToken').filter(isClearing);
      expect(cleared.map(cookiePath)).toContain(REFRESH_COOKIE_PATH);
    });
  });

  describe('リフレッシュの本文の経路（互換の期間）', () => {
    /**
     * @requirement user-authentication/REQ-33.12: 本文にリフレッシュトークンがある旧来の経路は CSRF を課さず、Cookie の同送の有無に関わらず成功する
     */
    it('本文があり CSRF のヘッダーが無いリフレッシュは、Cookie を同送しなくても成功する', async () => {
      const { session } = await login();

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken });

      expect(response.status).toBe(200);
      expect(typeof response.body.accessToken).toBe('string');
    });

    /**
     * @requirement user-authentication/REQ-33.12: 本文にリフレッシュトークンがある旧来の経路は CSRF を課さず、Cookie の同送の有無に関わらず成功する
     */
    it('本文があり CSRF のヘッダーが無いリフレッシュは、Cookie を同送しても成功する', async () => {
      const { session } = await login();

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${session.refreshToken}`])
        .send({ refreshToken: session.refreshToken });

      expect(response.status).toBe(200);
      expect(typeof response.body.accessToken).toBe('string');
    });

    /**
     * @requirement user-authentication/REQ-33.12: 本文の経路は本文のトークンだけを読み、同送の Cookie のトークンには触れない
     */
    it('本文と Cookie で別の系列のトークンを送ると、本文のトークンだけがローテーションされ Cookie のトークンは使えるまま', async () => {
      const { session: bodySession } = await login();
      const { session: cookieSession } = await login();
      const bodyRowBefore = await rowOf(bodySession.refreshToken);
      const cookieRowBefore = await rowOf(cookieSession.refreshToken);
      expect(bodyRowBefore!.familyId).not.toBe(cookieRowBefore!.familyId);

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${cookieSession.refreshToken}`])
        .send({ refreshToken: bodySession.refreshToken });

      expect(response.status).toBe(200);
      const bodyRowAfter = await rowOf(bodySession.refreshToken);
      expect(bodyRowAfter!.replacedAt).not.toBeNull();
      const successorRows = await prisma.refreshToken.findMany({
        where: { familyId: bodyRowBefore!.familyId, replacedAt: null },
      });
      expect(successorRows).toHaveLength(1);
      expect(successorRows[0]!.tokenHash).toBe(hashRefreshToken(response.body.refreshToken));

      const cookieRowAfter = await rowOf(cookieSession.refreshToken);
      expect(cookieRowAfter!.replacedAt).toBeNull();
      expect(
        await prisma.refreshToken.count({ where: { familyId: cookieRowBefore!.familyId } })
      ).toBe(1);
      expect(await stillUsable(cookieSession.refreshToken)).toBe(true);
    });

    it('本文のトークンが無効なリフレッシュは 401 になり、リフレッシュの Cookie を消す', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid.refresh.token' });

      expect(response.status).toBe(401);
      const cleared = setCookieLines(response, 'refreshToken').filter(isClearing);
      expect(cleared.map(cookiePath)).toContain(REFRESH_COOKIE_PATH);
    });
  });

  describe('ログアウト', () => {
    /**
     * @requirement user-authentication/REQ-33.12: 本文の無いログアウトは Cookie を読み、CSRF のヘッダーと許可されたオリジンがあれば系列を失効させる
     */
    it('本文が無く Cookie と CSRF のヘッダーがあるログアウトは成功し、そのセッションを失効させて Cookie を消す', async () => {
      const { session } = await login();
      const csrf = await fetchCsrfToken();

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('Cookie', [`refreshToken=${session.refreshToken}`, `csrf-token=${csrf}`])
        .set('X-CSRF-Token', csrf)
        .set('Origin', frontendOrigin);

      expect(response.status).toBe(200);
      const cleared = setCookieLines(response, 'refreshToken').filter(isClearing);
      expect(cleared.map(cookiePath)).toContain(REFRESH_COOKIE_PATH);
      expect(await stillUsable(session.refreshToken)).toBe(false);
    });

    /**
     * @requirement user-authentication/REQ-33.12: 本文が無く CSRF のヘッダーが無いログアウトは 403 で、セッションを失効させない
     */
    it('本文が無く Cookie だけで CSRF のヘッダーが無いログアウトは 403 になり、セッションを失効させない', async () => {
      const { session } = await login();
      const csrf = await fetchCsrfToken();

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('Cookie', [`refreshToken=${session.refreshToken}`, `csrf-token=${csrf}`])
        .set('Origin', frontendOrigin);

      expect(response.status).toBe(403);
      expect(await stillUsable(session.refreshToken)).toBe(true);
    });

    /**
     * @requirement user-authentication/REQ-33.12: 本文の経路のログアウトは本文のトークンの系列だけを失効させ、同送の Cookie のトークンには触れない
     */
    it('本文と Cookie で別の系列のトークンを送るログアウトは、本文のトークンの系列だけを失効させる', async () => {
      const { session: bodySession } = await login();
      const { session: cookieSession } = await login();

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${bodySession.accessToken}`)
        .set('Cookie', [`refreshToken=${cookieSession.refreshToken}`])
        .send({ refreshToken: bodySession.refreshToken });

      expect(response.status).toBe(200);
      expect(await stillUsable(bodySession.refreshToken)).toBe(false);
      expect(await stillUsable(cookieSession.refreshToken)).toBe(true);
    });

    it('本文があり CSRF のヘッダーが無いログアウトは旧来の経路で成功する', async () => {
      const { session } = await login();

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ refreshToken: session.refreshToken });

      expect(response.status).toBe(200);
      expect(await stillUsable(session.refreshToken)).toBe(false);
    });
  });
});
