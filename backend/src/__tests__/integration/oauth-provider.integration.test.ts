/**
 * @fileoverview 認可サーバーの設定と搭載の統合検証（user-authentication タスク 73.2）
 *
 * 実際の HTTP・oidc-provider・PostgreSQL で、認可・同意の完了（ライブラリの API）・コードの交換・更新を通す。
 * 同意の画面と API はタスク74が持つので、同意の完了だけを試験用の経路で行う。
 *
 * Design: Requirements 46-51 > OAuthProviderHost
 *
 * @requirement user-authentication/REQ-46.1
 * @requirement user-authentication/REQ-46.4
 * @requirement user-authentication/REQ-46.5
 * @requirement user-authentication/REQ-46.6
 * @requirement user-authentication/REQ-47.9
 * @requirement user-authentication/REQ-48.1
 * @requirement user-authentication/REQ-48.4
 * @requirement user-authentication/REQ-48.5
 */

import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

validateEnv();

import getPrismaClient from '../../db.js';
import {
  createExternalAppClientRegistry,
  parseExternalAppOAuthConfig,
} from '../../oauth/client-registry.js';
import { createOAuthProviderHost, type OAuthProviderHost } from '../../oauth/provider.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { ExternalAppConnectionService } from '../../services/external-app-connection.service.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';

const CLIENT_ID = 'test-oauth732-client';
const CLIENT_SECRET = randomBytes(24).toString('hex');
const REDIRECT_URI = 'https://client.example/callback';
const FORGED_HOST = 'evil.example';
const FORWARDED_CLIENT_IP = '198.51.100.7';
const USER_AGENT = 'oauth-732-integration';
const DAY_SECONDS = 24 * 60 * 60;

interface Harness {
  readonly base: string;
  readonly resource: string;
  readonly host: OAuthProviderHost;
  readonly observeAnomaly: ReturnType<typeof vi.fn>;
  close(): Promise<void>;
}

type CookieJar = Map<string, string>;

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

function storeCookies(jar: CookieJar, response: Response): void {
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(';');
    const separator = (pair ?? '').indexOf('=');
    const name = (pair ?? '').slice(0, separator);
    const value = (pair ?? '').slice(separator + 1);
    if (value === '' || /expires=Thu, 01 Jan 1970/i.test(line)) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

describe('認可サーバーの設定と搭載（タスク73.2）', () => {
  let prisma: PrismaClient;
  let harness: Harness;
  let httpsHarness: Harness;
  const userIds: string[] = [];

  async function startHarness(issuerOverride?: string): Promise<Harness> {
    const expressApp = express();
    expressApp.set('trust proxy', 1);
    const server = http.createServer(expressApp);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    const issuer = issuerOverride ?? base;
    const resource = `${issuer}/mcp`;
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const config = parseExternalAppOAuthConfig({
      NODE_ENV: 'test',
      OAUTH_ALLOWED_CLIENTS: JSON.stringify([
        {
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          displayName: 'Test App',
          redirectUris: [REDIRECT_URI],
        },
      ]),
      OAUTH_ISSUER: issuer,
      OAUTH_RESOURCE_URL: resource,
      OAUTH_JWKS: JSON.stringify({
        keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }],
      }),
      OAUTH_COOKIE_KEYS: JSON.stringify([randomBytes(32).toString('hex')]),
      OAUTH_TOKEN_HMAC_KEY: randomBytes(32).toString('hex'),
    });
    if (config === null) {
      throw new Error('試験の設定が読めません');
    }
    const observeAnomaly = vi.fn();
    const connectionService = new ExternalAppConnectionService({
      prisma,
      auditLogService: new AuditLogService({ prisma }),
      clientRegistry: createExternalAppClientRegistry(config),
      observeAnomaly,
    });
    const host = createOAuthProviderHost(config, { prisma, connectionService });

    expressApp.use(host.middleware);
    // 同意の完了（タスク74の代わりに試験だけが使う経路）。本番には載せない
    expressApp.post('/oauth/interaction/:uid/test-finish', express.json(), async (req, res) => {
      const { accountId, scopes } = req.body as { accountId: string; scopes: string };
      const grant = new host.provider.Grant({ accountId, clientId: CLIENT_ID });
      grant.addResourceScope(resource, scopes);
      const grantId = await grant.save();
      const returnTo = await host.provider.interactionResult(req, res, {
        login: { accountId },
        consent: { grantId },
      });
      res.json({ returnTo, grantId });
    });
    expressApp.use((_req, res) => {
      res.status(404).json({ passedThrough: true });
    });

    return {
      base,
      resource,
      host,
      observeAnomaly,
      close: () => new Promise((resolve) => server.close(() => resolve())),
    };
  }

  async function createUser(isActive = true): Promise<string> {
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        email: `oauth732-${id}@example.test`,
        displayName: 'OAuth 732',
        passwordHash: 'not-used',
        isActive,
      },
    });
    userIds.push(id);
    return id;
  }

  function authorizeUrl(
    h: Harness,
    challenge: string,
    overrides: Record<string, string | undefined> = {}
  ): string {
    const params: Record<string, string | undefined> = {
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: 'read write',
      resource: h.resource,
      state: 'state-value-732',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...overrides,
    };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        query.set(key, value);
      }
    }
    return `${h.base}/oauth/authorize?${query.toString()}`;
  }

  async function get(url: string, jar: CookieJar, headers: Record<string, string> = {}) {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { ...(jar.size > 0 ? { cookie: cookieHeader(jar) } : {}), ...headers },
    });
    storeCookies(jar, response);
    return response;
  }

  async function finishConsent(
    h: Harness,
    jar: CookieJar,
    location: string,
    accountId: string,
    scopes = 'read write'
  ): Promise<{ response: Response; grantId: string }> {
    const uid = new URL(location, h.base).pathname.split('/').pop();
    const finished = await fetch(`${h.base}/oauth/interaction/${uid}/test-finish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader(jar) },
      body: JSON.stringify({ accountId, scopes }),
    });
    expect(finished.status).toBe(200);
    const { returnTo, grantId } = (await finished.json()) as { returnTo: string; grantId: string };
    const resumed = await get(`${h.base}${new URL(returnTo).pathname}`, jar);
    return { response: resumed, grantId };
  }

  async function obtainCode(
    h: Harness,
    accountId: string,
    overrides: Record<string, string | undefined> = {}
  ): Promise<{ code: string; verifier: string; grantId: string; jar: CookieJar }> {
    const jar: CookieJar = new Map();
    const { verifier, challenge } = pkcePair();
    const started = await get(authorizeUrl(h, challenge, overrides), jar);
    expect(started.status).toBe(303);
    const { response, grantId } = await finishConsent(
      h,
      jar,
      started.headers.get('location') ?? '',
      accountId
    );
    expect(response.status).toBe(303);
    const redirected = new URL(response.headers.get('location') ?? '');
    expect(redirected.origin + redirected.pathname).toBe(REDIRECT_URI);
    const code = redirected.searchParams.get('code');
    if (code === null) {
      throw new Error('認可コードが返りませんでした');
    }
    return { code, verifier, grantId, jar };
  }

  function tokenRequest(h: Harness, body: Record<string, string>, headers = {}) {
    return fetch(`${h.base}/oauth/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
        'user-agent': USER_AGENT,
        ...headers,
      },
      body: new URLSearchParams(body).toString(),
    });
  }

  function exchangeCode(h: Harness, code: string, verifier: string) {
    return tokenRequest(h, {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      resource: h.resource,
    });
  }

  function refresh(h: Harness, refreshToken: string, headers = {}) {
    return tokenRequest(
      h,
      {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        resource: h.resource,
      },
      headers
    );
  }

  async function shortenGrant(grantId: string, remainingSeconds: number): Promise<number> {
    const exp = Math.floor(Date.now() / 1000) + remainingSeconds;
    const row = await prisma.oAuthStoreRecord.findUniqueOrThrow({
      where: { id: `Grant:${grantId}` },
    });
    await prisma.oAuthStoreRecord.update({
      where: { id: row.id },
      data: {
        expiresAt: new Date(exp * 1000),
        payload: { ...(row.payload as Record<string, unknown>), exp },
      },
    });
    return exp;
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    harness = await startHarness();
    httpsHarness = await startHarness('https://auth.architrack.test');
  });

  afterAll(async () => {
    await harness.close();
    await httpsHarness.close();
    await prisma.oAuthStoreRecord.deleteMany({
      where: { payload: { path: ['clientId'], equals: CLIENT_ID } },
    });
    await prisma.oAuthStoreRecord.deleteMany({
      where: { payload: { path: ['params', 'client_id'], equals: CLIENT_ID } },
    });
    await prisma.oAuthStoreRecord.deleteMany({
      where: {
        kind: 'Session',
        OR: userIds.map((id) => ({ payload: { path: ['accountId'], equals: id } })),
      },
    });
    await deleteAuditLogsWithArchivePermission(prisma, { targetId: { in: userIds } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe('通しの流れ', () => {
    it('認可・同意・コードの交換・更新が通り、値の条件を満たす', async () => {
      const userId = await createUser();
      const { code, verifier } = await obtainCode(harness, userId);

      const exchanged = await exchangeCode(harness, code, verifier);
      expect(exchanged.status).toBe(200);
      const tokens = (await exchanged.json()) as Record<string, unknown>;
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.expires_in).toBe(900);
      expect(typeof tokens.refresh_token).toBe('string');
      expect(tokens.id_token).toBeUndefined();
      // 不透明な値（JWT の形でない）
      expect(String(tokens.access_token).split('.')).toHaveLength(1);

      const refreshed = await refresh(harness, String(tokens.refresh_token));
      expect(refreshed.status).toBe(200);
      const next = (await refreshed.json()) as Record<string, unknown>;
      expect(next.refresh_token).not.toBe(tokens.refresh_token);
      expect(next.access_token).not.toBe(tokens.access_token);
      expect(next.expires_in).toBe(900);
    });

    it('offline_access と prompt=consent の要求でも同意へ戻り続けず、リフレッシュトークンが出る', async () => {
      const userId = await createUser();
      const { code, verifier, grantId } = await obtainCode(harness, userId, {
        scope: 'offline_access read write',
        prompt: 'consent',
      });
      const stored = await harness.host.provider.Grant.find(grantId);
      expect(stored?.getOIDCScope().split(' ')).toContain('offline_access');

      const exchanged = await exchangeCode(harness, code, verifier);
      expect(exchanged.status).toBe(200);
      const tokens = (await exchanged.json()) as Record<string, unknown>;
      expect(typeof tokens.refresh_token).toBe('string');
    });

    it('読み取りだけの同意でも同意へ戻らず、offline_access なしでリフレッシュトークンが出る', async () => {
      const userId = await createUser();
      const jar: CookieJar = new Map();
      const { verifier, challenge } = pkcePair();
      const started = await get(authorizeUrl(harness, challenge), jar);
      const { response } = await finishConsent(
        harness,
        jar,
        started.headers.get('location') ?? '',
        userId,
        'read'
      );
      const code = new URL(response.headers.get('location') ?? '').searchParams.get('code');
      expect(code).not.toBeNull();

      const exchanged = await exchangeCode(harness, String(code), verifier);
      expect(exchanged.status).toBe(200);
      const tokens = (await exchanged.json()) as Record<string, unknown>;
      expect(tokens.scope).toBe('read');
      expect(typeof tokens.refresh_token).toBe('string');
    });
  });

  describe('ID トークン', () => {
    it('openid の要求は invalid_scope で拒否し、ID トークンの経路へ進まない', async () => {
      const { challenge } = pkcePair();
      const response = await get(
        authorizeUrl(harness, challenge, { scope: 'openid read' }),
        new Map()
      );
      expect(new URL(response.headers.get('location') ?? '').searchParams.get('error')).toBe(
        'invalid_scope'
      );
    });
  });

  describe('PKCE と認可コード', () => {
    it('code_challenge の無い要求を拒否する', async () => {
      const { challenge } = pkcePair();
      const response = await get(
        authorizeUrl(harness, challenge, {
          code_challenge: undefined,
          code_challenge_method: undefined,
        }),
        new Map()
      );
      expect(new URL(response.headers.get('location') ?? '').searchParams.get('error')).toBe(
        'invalid_request'
      );
    });

    it('plain の方式を拒否する', async () => {
      const { challenge } = pkcePair();
      const response = await get(
        authorizeUrl(harness, challenge, { code_challenge_method: 'plain' }),
        new Map()
      );
      expect(new URL(response.headers.get('location') ?? '').searchParams.get('error')).toBe(
        'invalid_request'
      );
    });

    it('query 以外の応答モードを拒否する', async () => {
      const { challenge } = pkcePair();
      const response = await get(
        authorizeUrl(harness, challenge, { response_mode: 'form_post' }),
        new Map()
      );
      // ライブラリは拒否の結果を要求の方式で登録済みの戻り先へ返す。手続きへ進まず、コードも出ない
      expect(response.headers.get('location')).toBeNull();
      const body = await response.text();
      expect(body).toContain('invalid_request');
      expect(body).toContain(REDIRECT_URI);
      expect(body).not.toContain('name="code"');
    });

    it('検証値が違うコードの交換は invalid_grant', async () => {
      const userId = await createUser();
      const { code } = await obtainCode(harness, userId);
      const response = await exchangeCode(harness, code, pkcePair().verifier);
      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: string }).error).toBe('invalid_grant');
    });

    it('認可コードの有効期間は 600 秒', async () => {
      const userId = await createUser();
      const { code } = await obtainCode(harness, userId);
      const stored = await harness.host.provider.AuthorizationCode.find(code);
      expect((stored?.exp ?? 0) - (stored?.iat ?? 0)).toBe(600);
    });
  });

  describe('期限（90 日を延ばさない）', () => {
    it('Grant は 90 日で、更新しても期限が変わらない', async () => {
      const userId = await createUser();
      const { code, verifier, grantId } = await obtainCode(harness, userId);
      const before = await harness.host.provider.Grant.find(grantId);
      expect((before?.exp ?? 0) - (before?.iat ?? 0)).toBe(90 * DAY_SECONDS);

      const tokens = (await (await exchangeCode(harness, code, verifier)).json()) as {
        refresh_token: string;
      };
      const refreshed = await refresh(harness, tokens.refresh_token);
      expect(refreshed.status).toBe(200);

      const after = await harness.host.provider.Grant.find(grantId);
      expect(after?.exp).toBe(before?.exp);
    });

    it('リフレッシュトークンは 30 日', async () => {
      const userId = await createUser();
      const { code, verifier } = await obtainCode(harness, userId);
      const tokens = (await (await exchangeCode(harness, code, verifier)).json()) as {
        refresh_token: string;
      };
      const stored = await harness.host.provider.RefreshToken.find(tokens.refresh_token);
      expect((stored?.exp ?? 0) - (stored?.iat ?? 0)).toBe(30 * DAY_SECONDS);
    });

    it('Grant の残りが短いと、更新のトークンもアクセストークンも残りを超えない', async () => {
      const userId = await createUser();
      const { code, verifier, grantId } = await obtainCode(harness, userId);
      const tokens = (await (await exchangeCode(harness, code, verifier)).json()) as {
        refresh_token: string;
      };
      const grantExp = await shortenGrant(grantId, 120);

      const refreshed = await refresh(harness, tokens.refresh_token);
      expect(refreshed.status).toBe(200);
      const next = (await refreshed.json()) as { refresh_token: string; expires_in: number };
      expect(next.expires_in).toBeLessThanOrEqual(120);
      const rotated = await harness.host.provider.RefreshToken.find(next.refresh_token);
      expect(rotated?.exp).toBeLessThanOrEqual(grantExp);

      const after = await harness.host.provider.Grant.find(grantId);
      expect(after?.exp).toBe(grantExp);
    });

    it('Grant の期限を過ぎた更新は invalid_grant', async () => {
      const userId = await createUser();
      const { code, verifier, grantId } = await obtainCode(harness, userId);
      const tokens = (await (await exchangeCode(harness, code, verifier)).json()) as {
        refresh_token: string;
      };
      await shortenGrant(grantId, -10);
      const response = await refresh(harness, tokens.refresh_token);
      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: string }).error).toBe('invalid_grant');
    });
  });

  describe('リソース', () => {
    it('resource を省いた認可要求を invalid_target で拒否する', async () => {
      const { challenge } = pkcePair();
      const response = await get(
        authorizeUrl(harness, challenge, { resource: undefined }),
        new Map()
      );
      expect(new URL(response.headers.get('location') ?? '').searchParams.get('error')).toBe(
        'invalid_target'
      );
    });

    it('別のリソースの認可要求を invalid_target で拒否する', async () => {
      const { challenge } = pkcePair();
      const response = await get(
        authorizeUrl(harness, challenge, { resource: 'https://other.example/mcp' }),
        new Map()
      );
      expect(new URL(response.headers.get('location') ?? '').searchParams.get('error')).toBe(
        'invalid_target'
      );
    });

    it('トークンの要求で別のリソースを指定すると invalid_target', async () => {
      const userId = await createUser();
      const { code, verifier } = await obtainCode(harness, userId);
      const response = await tokenRequest(harness, {
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        resource: 'https://other.example/mcp',
      });
      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: string }).error).toBe('invalid_target');
    });

    it('アクセストークンの想定利用者が設定のリソースになる', async () => {
      const userId = await createUser();
      const { code, verifier } = await obtainCode(harness, userId);
      const tokens = (await (await exchangeCode(harness, code, verifier)).json()) as {
        access_token: string;
      };
      const stored = await harness.host.provider.AccessToken.find(tokens.access_token);
      expect(stored?.aud).toBe(harness.resource);
    });
  });

  describe('クライアントの認証', () => {
    it('client_secret_basic を拒否する', async () => {
      const userId = await createUser();
      const { code, verifier } = await obtainCode(harness, userId);
      const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
      const response = await tokenRequest(
        harness,
        {
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
          redirect_uri: REDIRECT_URI,
          resource: harness.resource,
        },
        { authorization: `Basic ${basic}` }
      );
      expect(response.status).toBe(401);
      expect(((await response.json()) as { error: string }).error).toBe('invalid_client');
    });

    it('client secret の誤りを invalid_client で拒否する', async () => {
      const response = await tokenRequest(harness, {
        grant_type: 'refresh_token',
        refresh_token: 'unknown',
        client_id: CLIENT_ID,
        client_secret: 'wrong-secret-wrong-secret-wrong-secret',
      });
      expect(response.status).toBe(401);
      expect(((await response.json()) as { error: string }).error).toBe('invalid_client');
    });
  });

  describe('無効な利用者', () => {
    it('コードの交換は invalid_grant', async () => {
      const userId = await createUser();
      const { code, verifier } = await obtainCode(harness, userId);
      await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
      const response = await exchangeCode(harness, code, verifier);
      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: string }).error).toBe('invalid_grant');
    });

    it('更新は invalid_grant', async () => {
      const userId = await createUser();
      const { code, verifier } = await obtainCode(harness, userId);
      const tokens = (await (await exchangeCode(harness, code, verifier)).json()) as {
        refresh_token: string;
      };
      await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
      const response = await refresh(harness, tokens.refresh_token);
      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: string }).error).toBe('invalid_grant');
    });

    it('同意の後の再開で無効なら認可コードを返さない', async () => {
      const userId = await createUser();
      const jar: CookieJar = new Map();
      const { challenge } = pkcePair();
      const started = await get(authorizeUrl(harness, challenge), jar);
      const location = started.headers.get('location') ?? '';
      const uid = location.split('/').pop();
      const finished = await fetch(`${harness.base}/oauth/interaction/${uid}/test-finish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: cookieHeader(jar) },
        body: JSON.stringify({ accountId: userId, scopes: 'read' }),
      });
      const { returnTo } = (await finished.json()) as { returnTo: string };
      await prisma.user.update({ where: { id: userId }, data: { isActive: false } });

      const resumed = await get(`${harness.base}${new URL(returnTo).pathname}`, jar);
      const redirected = new URL(resumed.headers.get('location') ?? '');
      expect(redirected.searchParams.get('code')).toBeNull();
      expect(redirected.searchParams.get('error')).toBe('access_denied');
    });
  });

  describe('毎回の同意とセッションの Cookie（別々に確かめる）', () => {
    it('方針: 有効なセッションと Grant があっても、同意の結果の無い要求は同意へ戻す', async () => {
      const userId = await createUser();
      const { jar } = await obtainCode(harness, userId);
      expect(jar.has('_session')).toBe(true);

      // Cookie を外す層を通さず、ライブラリへ直接渡して方針だけを確かめる
      const direct = http.createServer(harness.host.provider.callback());
      await new Promise<void>((resolve) => direct.listen(0, '127.0.0.1', resolve));
      try {
        const { port } = direct.address() as AddressInfo;
        const { challenge } = pkcePair();
        const url = authorizeUrl(harness, challenge).replace(
          harness.base,
          `http://127.0.0.1:${port}`
        );
        const response = await fetch(url, {
          redirect: 'manual',
          headers: { cookie: cookieHeader(jar), host: new URL(harness.base).host },
        });
        expect(response.status).toBe(303);
        const location = response.headers.get('location') ?? '';
        expect(location).toMatch(/^\/oauth\/interaction\//);
        const interaction = await harness.host.provider.Interaction.find(
          location.split('/').pop() ?? ''
        );
        // セッションが効いて login を通り、同意の方針で止まったことを確かめる
        expect(interaction?.prompt.name).toBe('consent');
        expect(interaction?.prompt.reasons).toContain('consent_result_required');
        expect(interaction?.session?.accountId).toBe(userId);
      } finally {
        await new Promise<void>((resolve) => direct.close(() => resolve()));
      }
    });

    it('Cookie の除去: 同じブラウザで別の利用者が同意しても認可コードが返る', async () => {
      const first = await createUser();
      const second = await createUser();
      const { jar } = await obtainCode(harness, first);
      expect(jar.has('_session')).toBe(true);
      expect(jar.has('_session.sig')).toBe(true);

      const { verifier, challenge } = pkcePair();
      const started = await get(authorizeUrl(harness, challenge), jar);
      expect(started.status).toBe(303);
      const { response } = await finishConsent(
        harness,
        jar,
        started.headers.get('location') ?? '',
        second
      );
      expect(response.status).toBe(303);
      const code = new URL(response.headers.get('location') ?? '').searchParams.get('code');
      expect(code).not.toBeNull();
      const stored = await harness.host.provider.AuthorizationCode.find(String(code));
      expect(stored?.accountId).toBe(second);
      expect((await exchangeCode(harness, String(code), verifier)).status).toBe(200);
    });
  });

  describe('発行者の固定', () => {
    it('偽の Host と転送ヘッダーがメタデータへ現れない', async () => {
      const response = await fetch(`${httpsHarness.base}/.well-known/oauth-authorization-server`, {
        headers: {
          'x-forwarded-host': FORGED_HOST,
          'x-forwarded-proto': 'http',
          forwarded: `host=${FORGED_HOST};proto=http`,
        },
      });
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toContain(FORGED_HOST);
      const metadata = JSON.parse(text) as Record<string, string>;
      expect(metadata.issuer).toBe('https://auth.architrack.test');
      expect(metadata.authorization_endpoint).toBe('https://auth.architrack.test/oauth/authorize');
      expect(metadata.token_endpoint).toBe('https://auth.architrack.test/oauth/token');
      expect(metadata.jwks_uri).toBe('https://auth.architrack.test/oauth/jwks');
    });

    it('https の構成で手続きの Cookie に Secure が付き、遷移先に偽の Host が現れない', async () => {
      const { challenge } = pkcePair();
      const response = await fetch(authorizeUrl(httpsHarness, challenge), {
        redirect: 'manual',
        headers: { 'x-forwarded-host': FORGED_HOST, 'x-forwarded-proto': 'http' },
      });
      expect(response.status).toBe(303);
      expect(response.headers.get('location') ?? '').not.toContain(FORGED_HOST);
      expect(response.headers.get('location')).toMatch(/^\/oauth\/interaction\//);
      const cookies = response.headers.getSetCookie();
      expect(cookies.length).toBeGreaterThan(0);
      for (const cookie of cookies) {
        expect(cookie.toLowerCase()).toContain('secure');
        expect(cookie.toLowerCase()).toContain('httponly');
      }
    });
  });

  describe('担当の経路だけを扱う', () => {
    it('メタデータは無効にした機能を広告しない', async () => {
      const response = await fetch(`${harness.base}/.well-known/oauth-authorization-server`);
      const metadata = (await response.json()) as Record<string, unknown>;
      for (const key of [
        'registration_endpoint',
        'revocation_endpoint',
        'introspection_endpoint',
        'end_session_endpoint',
        'device_authorization_endpoint',
        'pushed_authorization_request_endpoint',
        'userinfo_endpoint',
        'dpop_signing_alg_values_supported',
      ]) {
        expect(metadata[key], key).toBeUndefined();
      }
      expect(metadata.client_id_metadata_document_supported).not.toBe(true);
      expect(metadata.code_challenge_methods_supported).toEqual(['S256']);
      expect(metadata.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
      expect(metadata.token_endpoint_auth_methods_supported).toEqual(['client_secret_post']);
      expect(metadata.response_types_supported).toEqual(['code']);
      expect(metadata.scopes_supported).toEqual(
        expect.arrayContaining(['offline_access', 'read', 'write'])
      );
      expect(metadata.scopes_supported).not.toContain('openid');
    });

    it.each([
      ['GET', '/session/end'],
      ['POST', '/session/end'],
      ['POST', '/session/end/confirm'],
      ['GET', '/session/end/success'],
      ['POST', '/token/revocation'],
      ['POST', '/oauth/token/revocation'],
      ['POST', '/token/introspection'],
      ['POST', '/oauth/token/introspection'],
      ['POST', '/reg'],
      ['POST', '/device/auth'],
      ['GET', '/device'],
      ['POST', '/request'],
      ['GET', '/me'],
      ['POST', '/me'],
      ['GET', '/interaction/abc'],
      ['GET', '/.well-known/openid-configuration'],
      ['POST', '/oauth/authorize'],
      ['GET', '/oauth/token'],
      ['GET', '/oauth/token/'],
      ['GET', '/oauth/authorize/abc/extra'],
      ['GET', '/token'],
      ['GET', '/auth'],
      ['GET', '/jwks'],
    ])('%s %s はライブラリへ渡らない', async (method, path) => {
      const response = await fetch(`${harness.base}${path}`, { method, redirect: 'manual' });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ passedThrough: true });
    });

    it('/oauth/jwks は公開鍵だけを返す', async () => {
      const response = await fetch(`${harness.base}/oauth/jwks`);
      expect(response.status).toBe(200);
      const { keys } = (await response.json()) as { keys: Record<string, unknown>[] };
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(key.d).toBeUndefined();
      }
    });
  });

  describe('不正なアプリと戻り先', () => {
    it.each([
      ['未知のアプリ', { client_id: 'unknown-<script>alert(1)</script>' }],
      ['登録に無い戻り先', { redirect_uri: 'https://evil.example/<script>cb' }],
    ])('%s では遷移せず、要求の値を反映しない', async (_name, overrides) => {
      const { challenge } = pkcePair();
      const response = await get(
        authorizeUrl(harness, challenge, { ...overrides, state: 'reflected-state-marker' }),
        new Map(),
        { accept: 'text/html' }
      );
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(response.headers.get('location')).toBeNull();
      const body = await response.text();
      expect(body).not.toContain('reflected-state-marker');
      expect(body).not.toContain('<script>');
      expect(body).not.toContain('evil.example');
      expect(body).not.toContain('unknown-');
    });
  });

  describe('再利用の処理の注入と要求の送信元', () => {
    it('使用済みの更新を再提示すると、信頼する段数で得た送信元で監査に残り invalid_grant になる', async () => {
      const userId = await createUser();
      const { code, verifier, grantId } = await obtainCode(harness, userId);
      const tokens = (await (await exchangeCode(harness, code, verifier)).json()) as {
        refresh_token: string;
      };
      const rotated = await refresh(harness, tokens.refresh_token);
      expect(rotated.status).toBe(200);
      // 後継を実際に使い、48.11 の猶予に当たらない再提示にする
      const { refresh_token: successor } = (await rotated.json()) as { refresh_token: string };
      expect((await refresh(harness, successor)).status).toBe(200);

      const replay = await refresh(harness, tokens.refresh_token, {
        'x-forwarded-for': `203.0.113.99, ${FORWARDED_CLIENT_IP}`,
      });
      expect(replay.status).toBe(400);
      expect(((await replay.json()) as { error: string }).error).toBe('invalid_grant');

      expect(await prisma.oAuthStoreRecord.count({ where: { grantId } })).toBe(0);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'TOKEN_REUSE_DETECTED', targetId: userId },
      });
      const metadata = audit.metadata as Record<string, unknown>;
      expect(metadata.ipAddress).toBe(FORWARDED_CLIENT_IP);
      expect(metadata.userAgent).toBe(USER_AGENT);
      expect(harness.observeAnomaly).toHaveBeenCalledWith(
        expect.objectContaining({ signal: 'external_app_token_reuse', userId })
      );
    });
  });
});
