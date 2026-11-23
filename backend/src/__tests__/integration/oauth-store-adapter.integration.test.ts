/**
 * @fileoverview 認可サーバーの保存アダプターの統合検証（user-authentication タスク 73.1）
 *
 * 実際の oidc-provider のモデルと実 DB で確かめること:
 * - 48.7: どの列にもトークンの値が現れず、読み出しでライブラリが使える形に戻る
 * - 48.6: ライブラリの順序の Grant の失効で、接続の処理が Grant の行の持ち主を読める
 * - 48.6: 再利用の処理が失敗しても使用済みの行が残り、復旧後の再提示で失効できる
 *
 * Design: Requirements 46-51 > OAuthStoreAdapter
 */

import { createHash, randomBytes, randomUUID } from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

validateEnv();

import getPrismaClient from '../../db.js';
import { createOAuthStoreAdapterFactory } from '../../oauth/store-adapter.js';
import type { TokenReuseEvent } from '../../oauth/oauth.types.js';

const HMAC_KEY = 'ef'.repeat(32);
const CLIENT_ID = 'test-oauth731-client';
const CLIENT_SECRET = randomBytes(24).toString('hex');
const REDIRECT_URI = 'https://client.example/callback';
const RESOURCE = 'http://localhost:3999/mcp';
const SCOPE = 'offline_access read';

interface TokenModel {
  save(ttl?: number): Promise<string>;
  consume(): Promise<void>;
  jti: string;
  consumed?: number;
  accountId?: string;
  grantId?: string;
  clientId?: string;
  scope?: string;
  codeChallenge?: string;
  isValid: boolean;
}

interface TokenModelClass {
  new (input: Record<string, unknown>): TokenModel;
  find(value: string, options?: { ignoreExpiration?: boolean }): Promise<TokenModel | undefined>;
  revokeByGrantId(grantId: string): Promise<void>;
  adapter: { destroy(id: string): Promise<void> };
}

interface SessionModel {
  save(ttl: number): Promise<string>;
  jti: string;
  uid: string;
  accountId?: string;
}

interface OidcProvider {
  AccessToken: TokenModelClass;
  RefreshToken: TokenModelClass;
  AuthorizationCode: TokenModelClass;
  // Omit で元の構築シグネチャを外し、Grant 固有のメソッドを持つ戻り値の型にする
  Grant: Omit<TokenModelClass, never> & {
    new (input: Record<string, unknown>): TokenModel & {
      addOIDCScope(scope: string): void;
      addResourceScope(resource: string, scope: string): void;
    };
  };
  callback(): http.RequestListener;
  Session: {
    new (input?: Record<string, unknown>): SessionModel;
    findByUid(uid: string): Promise<SessionModel | undefined>;
  };
  Interaction: {
    new (id: string, input: Record<string, unknown>): { save(ttl: number): Promise<string> };
    find(id: string): Promise<{ returnTo?: string } | undefined>;
  };
}

type ProviderConstructor = new (issuer: string, config: Record<string, unknown>) => OidcProvider;

describe('OAuthStoreAdapter（統合・実 DB と実ライブラリ）', () => {
  let prisma: PrismaClient;
  let provider: OidcProvider;
  let server: http.Server;
  let tokenUrl: string;
  const onGrantRevoked = vi.fn<(event: TokenReuseEvent) => Promise<void>>();
  const createdIds = new Set<string>();
  const createdRecordIds = new Set<string>();

  async function grantRows(grantId: string) {
    return prisma.oAuthStoreRecord.findMany({ where: { grantId } });
  }

  async function saveGrant(): Promise<string> {
    const grant = new provider.Grant({ accountId: randomUUID(), clientId: CLIENT_ID });
    const grantId = await grant.save();
    createdIds.add(grantId);
    return grantId;
  }

  /** 実際の更新に使える同意済みの Grant を保存する */
  async function saveConsentedGrant(accountId: string): Promise<string> {
    const grant = new provider.Grant({ accountId, clientId: CLIENT_ID });
    grant.addOIDCScope(SCOPE);
    grant.addResourceScope(RESOURCE, 'read');
    const grantId = await grant.save();
    createdIds.add(grantId);
    return grantId;
  }

  async function postToken(
    body: Record<string, string>
  ): Promise<{ status: number; json: Record<string, string> }> {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        resource: RESOURCE,
        ...body,
      }),
    });
    return { status: response.status, json: (await response.json()) as Record<string, string> };
  }

  /** 認可コードを実際に交換して、最初のリフレッシュトークンを得る */
  async function exchangeCode(grantId: string, accountId: string): Promise<string> {
    const verifier = randomBytes(32).toString('base64url');
    const code = await new provider.AuthorizationCode({
      accountId,
      clientId: CLIENT_ID,
      grantId,
      scope: SCOPE,
      resource: RESOURCE,
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
      codeChallengeMethod: 'S256',
      redirectUri: REDIRECT_URI,
    }).save();
    const exchanged = await postToken({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    });
    expect(exchanged.status).toBe(200);
    return exchanged.json.refresh_token as string;
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    const moduleName = 'oidc-provider';
    const { default: Provider } = (await import(moduleName)) as { default: ProviderConstructor };
    provider = new Provider('http://localhost:3999', {
      adapter: createOAuthStoreAdapterFactory({
        prisma,
        tokenHmacKey: HMAC_KEY,
        onGrantRevoked,
        getRequestSource: () => ({ ipAddress: '203.0.113.10', userAgent: 'integration' }),
      }),
      clients: [
        {
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uris: [REDIRECT_URI],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'client_secret_post',
          scope: SCOPE,
        },
      ],
      scopes: ['offline_access', 'read'],
      cookies: { keys: [randomBytes(32).toString('hex')] },
      features: {
        devInteractions: { enabled: false },
        resourceIndicators: {
          enabled: true,
          defaultResource: () => RESOURCE,
          useGrantedResource: () => true,
          getResourceServerInfo: () => ({
            scope: 'read',
            accessTokenFormat: 'opaque',
            audience: RESOURCE,
          }),
        },
      },
      issueRefreshToken: async () => true,
      rotateRefreshToken: true,
      findAccount: async (_ctx: unknown, id: string) => ({
        accountId: id,
        claims: async () => ({ sub: id }),
      }),
      ttl: {
        AccessToken: 900,
        AuthorizationCode: 600,
        RefreshToken: 3600,
        Grant: 7776000,
        Interaction: 600,
        Session: 600,
      },
    });
    server = http.createServer(provider.callback());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    tokenUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/token`;
  });

  afterEach(async () => {
    onGrantRevoked.mockReset();
    await prisma.oAuthStoreRecord.deleteMany({ where: { grantId: { in: [...createdIds] } } });
    await prisma.oAuthStoreRecord.deleteMany({ where: { id: { in: [...createdRecordIds] } } });
    createdIds.clear();
    createdRecordIds.clear();
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  });

  it('全ての種別で、行の全ての列にトークンの値が現れない', async () => {
    const grantId = await saveGrant();
    const base = { accountId: randomUUID(), clientId: CLIENT_ID, grantId, scope: 'read write' };
    const access = await new provider.AccessToken(base).save();
    const refresh = await new provider.RefreshToken({ ...base, gty: 'authorization_code' }).save();
    const code = await new provider.AuthorizationCode({
      ...base,
      codeChallenge: 'challenge-value',
      codeChallengeMethod: 'S256',
      redirectUri: 'https://client.example/callback',
    }).save();

    // 表の全ての行の全ての列を 1 つの文字列にして探す
    const rows = await prisma.$queryRaw<{ row: string }[]>`
      SELECT row_to_json(r)::text AS row FROM oauth_store_records r`;

    expect(await grantRows(grantId)).toHaveLength(4);
    const whole = rows.map(({ row }) => row).join('\n');
    for (const raw of [access, refresh, code]) {
      expect(raw.length).toBeGreaterThan(20);
      expect(whole).not.toContain(raw);
    }
    const ids = (await grantRows(grantId)).map((row) => row.id);
    for (const kind of ['AccessToken', 'RefreshToken', 'AuthorizationCode']) {
      expect(ids.some((id) => new RegExp(`^${kind}:[0-9a-f]{64}$`).test(id))).toBe(true);
    }
  });

  it('実際のモデルが保存した値で読み戻せる', async () => {
    const grantId = await saveGrant();
    const accountId = randomUUID();
    const base = { accountId, clientId: CLIENT_ID, grantId, scope: 'read' };
    const access = await new provider.AccessToken(base).save();
    const refresh = await new provider.RefreshToken(base).save();
    const code = await new provider.AuthorizationCode({
      ...base,
      codeChallenge: 'challenge-value',
      codeChallengeMethod: 'S256',
      redirectUri: 'https://client.example/callback',
    }).save();

    const foundAccess = await provider.AccessToken.find(access);
    const foundRefresh = await provider.RefreshToken.find(refresh);
    const foundCode = await provider.AuthorizationCode.find(code);

    expect(foundAccess).toMatchObject({ jti: access, accountId, grantId, clientId: CLIENT_ID });
    expect(foundRefresh).toMatchObject({ jti: refresh, accountId, grantId, scope: 'read' });
    expect(foundCode).toMatchObject({ jti: code, codeChallenge: 'challenge-value' });
    expect(foundCode?.isValid).toBe(true);
    await expect(provider.AccessToken.find(`${access}x`)).resolves.toBeUndefined();
  });

  it('consume の結果がライブラリの秒の consumed に戻り、無効になる', async () => {
    const grantId = await saveGrant();
    const raw = await new provider.RefreshToken({
      accountId: randomUUID(),
      clientId: CLIENT_ID,
      grantId,
    }).save();
    const before = Math.floor(Date.now() / 1000);

    await (await provider.RefreshToken.find(raw))?.consume();
    const found = await provider.RefreshToken.find(raw);

    expect(found?.isValid).toBe(false);
    expect(Number.isInteger(found?.consumed)).toBe(true);
    expect(found?.consumed).toBeGreaterThanOrEqual(before);
    expect(found?.consumed).toBeLessThanOrEqual(before + 5);
  });

  it('Grant の行に grant_id と持ち主が入り、Grant として読める', async () => {
    const grantId = await saveGrant();

    const row = await prisma.oAuthStoreRecord.findFirst({ where: { grantId, kind: 'Grant' } });

    expect(row?.id).toBe(`Grant:${grantId}`);
    expect(row?.payload).toMatchObject({ clientId: CLIENT_ID });
    expect((row?.payload as { accountId?: string }).accountId).toBeTruthy();
    await expect(provider.Grant.find(grantId)).resolves.toMatchObject({ clientId: CLIENT_ID });
  });

  it('期限の列がライブラリの有効期間に従う', async () => {
    const grantId = await saveGrant();
    const before = Date.now();
    await new provider.AccessToken({
      accountId: randomUUID(),
      clientId: CLIENT_ID,
      grantId,
    }).save();

    const row = await prisma.oAuthStoreRecord.findFirst({
      where: { grantId, kind: 'AccessToken' },
    });

    const remaining = (row?.expiresAt?.getTime() ?? 0) - before;
    expect(remaining).toBeGreaterThan(895_000);
    expect(remaining).toBeLessThanOrEqual(905_000);
  });

  it('Session と Interaction を実際のモデルで往復できる', async () => {
    const session = new provider.Session();
    session.accountId = randomUUID();
    await session.save(600);
    createdRecordIds.add(`Session:${session.jti}`);
    createdRecordIds.add('Interaction:test-oauth731-interaction');
    await new provider.Interaction('test-oauth731-interaction', {
      returnTo: 'https://issuer.example/resume',
      prompt: { name: 'consent', reasons: [], details: {} },
      params: { client_id: CLIENT_ID },
    }).save(600);

    await expect(provider.Session.findByUid(session.uid)).resolves.toMatchObject({
      jti: session.jti,
      accountId: session.accountId,
    });
    await expect(provider.Interaction.find('test-oauth731-interaction')).resolves.toMatchObject({
      returnTo: 'https://issuer.example/resume',
    });
  });

  it('ライブラリの順序の失効で、処理の間は Grant の行が残り、処理は 1 回だけ呼ばれる', async () => {
    const grantId = await saveGrant();
    let ownerDuringHandler: unknown;
    onGrantRevoked.mockImplementation(async () => {
      const row = await prisma.oAuthStoreRecord.findFirst({ where: { grantId, kind: 'Grant' } });
      ownerDuringHandler = (row?.payload as { clientId?: string } | undefined)?.clientId;
    });

    // lib/helpers/revoke.js と同じ順序（各モデルの失効の後に Grant の消去）で同時に呼ぶ
    await Promise.all([
      provider.AccessToken.revokeByGrantId(grantId),
      provider.RefreshToken.revokeByGrantId(grantId),
      provider.AuthorizationCode.revokeByGrantId(grantId),
      provider.Grant.adapter.destroy(grantId),
    ]);

    expect(onGrantRevoked).toHaveBeenCalledTimes(1);
    expect(onGrantRevoked).toHaveBeenCalledWith({
      grantId,
      kind: 'grant_revocation',
      ipAddress: '203.0.113.10',
      userAgent: 'integration',
    });
    expect(ownerDuringHandler).toBe(CLIENT_ID);
    await expect(
      prisma.oAuthStoreRecord.findFirst({ where: { grantId, kind: 'Grant' } })
    ).resolves.toBeNull();
  });

  it('通常の認可コードの交換と更新は、使用済みの行を残したまま動く', async () => {
    const accountId = randomUUID();
    const grantId = await saveConsentedGrant(accountId);
    const first = await exchangeCode(grantId, accountId);

    const refreshed = await postToken({ grant_type: 'refresh_token', refresh_token: first });

    expect(refreshed.status).toBe(200);
    expect(refreshed.json.refresh_token).not.toBe(first);
    expect(onGrantRevoked).not.toHaveBeenCalled();
    const consumedKinds = (await grantRows(grantId))
      .filter((row) => row.consumedAt !== null)
      .map((row) => row.kind)
      .sort();
    expect(consumedKinds).toEqual(['AuthorizationCode', 'RefreshToken']);
  });

  it('再利用の処理が失敗しても使用済みの行が残り、復旧後の再提示で失効して後継も使えない', async () => {
    const accountId = randomUUID();
    const grantId = await saveConsentedGrant(accountId);
    const used = await exchangeCode(grantId, accountId);
    const rotated = await postToken({ grant_type: 'refresh_token', refresh_token: used });
    expect(rotated.status).toBe(200);
    const successor = rotated.json.refresh_token as string;

    onGrantRevoked.mockRejectedValueOnce(new Error('handler down'));
    const failed = await postToken({ grant_type: 'refresh_token', refresh_token: used });

    expect(failed.status).toBe(500);
    expect(onGrantRevoked).toHaveBeenCalledTimes(1);
    await expect(provider.RefreshToken.find(used)).resolves.toMatchObject({
      jti: used,
      consumed: expect.any(Number),
    });
    await expect(provider.Grant.find(grantId)).resolves.toBeDefined();

    onGrantRevoked.mockClear();
    onGrantRevoked.mockImplementation(async (event) => {
      await prisma.oAuthStoreRecord.deleteMany({ where: { grantId: event.grantId } });
    });
    const retried = await postToken({ grant_type: 'refresh_token', refresh_token: used });

    expect(retried.status).toBe(400);
    expect(retried.json.error).toBe('invalid_grant');
    expect(onGrantRevoked).toHaveBeenCalledTimes(1);
    const afterRevocation = await postToken({
      grant_type: 'refresh_token',
      refresh_token: successor,
    });
    expect(afterRevocation.status).toBe(400);
    expect(afterRevocation.json.error).toBe('invalid_grant');
  });
});
