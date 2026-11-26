/**
 * @fileoverview 認可サーバーの組み立てと要求の文脈の単体検証（user-authentication タスク 73.2）
 *
 * @requirement user-authentication/REQ-46.4
 * @requirement user-authentication/REQ-48.8
 */

import { generateKeyPairSync, randomBytes } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  ExternalAppConfigError,
  parseExternalAppOAuthConfig,
  type ExternalAppOAuthConfig,
} from '../../../oauth/client-registry.js';
import {
  createOAuthProviderHost,
  isOAuthProviderRoute,
  mountExternalAppOAuth,
} from '../../../oauth/provider.js';
import { getRequestSource, runWithRequestSource } from '../../../oauth/request-context.js';
import type { ExternalAppConnectionService } from '../../../services/external-app-connection.service.js';
import logger from '../../../utils/logger.js';

const SECRET_MARKER = 'super-secret-token-value';

function rsaJwk(): Record<string, unknown> {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { ...privateKey.export({ format: 'jwk' }), kid: 'unit', use: 'sig', alg: 'RS256' };
}

function buildConfig(overrides: Partial<ExternalAppOAuthConfig> = {}): ExternalAppOAuthConfig {
  const config = parseExternalAppOAuthConfig({
    NODE_ENV: 'test',
    OAUTH_ALLOWED_CLIENTS: JSON.stringify([
      {
        clientId: 'unit-client',
        clientSecret: randomBytes(24).toString('hex'),
        displayName: 'Unit',
        redirectUris: ['https://client.example/callback'],
      },
    ]),
    OAUTH_ISSUER: 'http://localhost:5174',
    OAUTH_RESOURCE_URL: 'http://localhost:5174/mcp',
    OAUTH_JWKS: JSON.stringify({ keys: [rsaJwk()] }),
    OAUTH_COOKIE_KEYS: JSON.stringify([randomBytes(32).toString('hex')]),
    OAUTH_TOKEN_HMAC_KEY: randomBytes(32).toString('hex'),
  });
  if (config === null) {
    throw new Error('試験の設定が読めません');
  }
  return { ...config, ...overrides };
}

const deps = {
  prisma: {} as PrismaClient,
  connectionService: {
    handleReuse: vi.fn(async () => undefined),
    recordRefreshGrace: vi.fn(async () => undefined),
  } as unknown as ExternalAppConnectionService,
};

describe('mountExternalAppOAuth', () => {
  it('許可するアプリが無ければ何も載せない', () => {
    const app = { use: vi.fn() } as unknown as Express;
    expect(mountExternalAppOAuth(app, {} as PrismaClient, {})).toBeNull();
    expect(app.use).not.toHaveBeenCalled();
  });

  it('設定が不正なら例外で止まり、何も載せない', () => {
    const app = { use: vi.fn() } as unknown as Express;
    expect(() =>
      mountExternalAppOAuth(app, {} as PrismaClient, {
        NODE_ENV: 'test',
        OAUTH_ALLOWED_CLIENTS: '[{"clientId":"x"}]',
      })
    ).toThrow(ExternalAppConfigError);
    expect(app.use).not.toHaveBeenCalled();
  });
});

describe('createOAuthProviderHost の構築の失敗', () => {
  it.each([
    [
      'x25519 の鍵',
      () => {
        const { privateKey } = generateKeyPairSync('x25519');
        return { ...privateKey.export({ format: 'jwk' }), kid: 'x' };
      },
    ],
    ['key_ops が decrypt の鍵', () => ({ ...rsaJwk(), use: undefined, key_ops: ['decrypt'] })],
  ])('%s は同期の例外で起動を止める', (_name, makeKey) => {
    const config = buildConfig({ jwks: { keys: [makeKey() as never] } });
    expect(() => createOAuthProviderHost(config, deps)).toThrow(ExternalAppConfigError);
  });

  it('正しい設定なら構築できる（上の失敗が鍵によるものであることの対照）', () => {
    expect(() => createOAuthProviderHost(buildConfig(), deps)).not.toThrow();
  });

  it('構築の失敗の例外に鍵の値を含めない', () => {
    const key = { ...rsaJwk(), use: undefined, key_ops: ['decrypt'] };
    const config = buildConfig({ jwks: { keys: [key as never] } });
    let caught: unknown;
    try {
      createOAuthProviderHost(config, deps);
    } catch (error) {
      caught = error;
    }
    const text = JSON.stringify({
      message: (caught as Error).message,
      issues: (caught as ExternalAppConfigError).issues,
      cause: (caught as Error).cause,
    });
    expect(text).not.toContain(String((key as { d?: unknown }).d));
    expect((caught as Error).cause).toBeUndefined();
  });

  it('パスを持つ発行者は経路と URL が食い違うので止める', () => {
    const config = buildConfig({ issuer: 'http://localhost:5174/base' });
    expect(() => createOAuthProviderHost(config, deps)).toThrow(ExternalAppConfigError);
  });
});

describe('isOAuthProviderRoute', () => {
  it.each([
    ['GET', '/oauth/authorize'],
    ['GET', '/oauth/authorize/abc_DEF-123'],
    ['POST', '/oauth/token'],
    ['OPTIONS', '/oauth/token'],
    ['GET', '/oauth/jwks'],
    ['OPTIONS', '/oauth/jwks'],
    ['GET', '/.well-known/oauth-authorization-server'],
    ['OPTIONS', '/.well-known/oauth-authorization-server'],
  ])('%s %s を扱う', (method, path) => {
    expect(isOAuthProviderRoute(method, path)).toBe(true);
  });

  it.each([
    ['POST', '/oauth/authorize'],
    ['POST', '/oauth/authorize/abc'],
    ['GET', '/oauth/token'],
    ['GET', '/oauth/authorize/'],
    ['GET', '/oauth/authorize/a/b'],
    ['GET', '/oauth/authorize/a%2Fb'],
    ['GET', '/OAUTH/TOKEN'],
    ['GET', '/oauth/interaction/abc'],
    ['POST', '/session/end/confirm'],
    ['GET', '/.well-known/openid-configuration'],
    ['GET', '/.well-known/jwks.json'],
    ['DELETE', '/oauth/token'],
  ])('%s %s を扱わない', (method, path) => {
    expect(isOAuthProviderRoute(method, path)).toBe(false);
  });
});

describe('ライブラリの事象のログ', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['server_error', 'error'])('%s は例外の名前だけを記録する', (eventName) => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    spy.mockClear();
    const host = createOAuthProviderHost(buildConfig(), deps);
    const failure = new TypeError(`failed with ${SECRET_MARKER}`);
    const ctx = { oidc: { route: 'token', params: { refresh_token: SECRET_MARKER } } };
    if (eventName === 'server_error') {
      host.provider.emit(eventName, ctx, failure);
    } else {
      host.provider.emit(eventName, failure, ctx);
    }
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET_MARKER);
    expect(JSON.stringify(spy.mock.calls)).toContain('TypeError');
  });
});

describe('要求の文脈', () => {
  it('文脈の外では空を返す', () => {
    expect(getRequestSource()).toEqual({});
  });

  it('非同期の処理をまたいで送信元を保ち、同時の要求で混ざらない', async () => {
    const read = (ipAddress: string, delay: number) =>
      runWithRequestSource({ ipAddress, userAgent: 'ua' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return getRequestSource().ipAddress;
      });
    await expect(Promise.all([read('192.0.2.1', 10), read('192.0.2.2', 1)])).resolves.toEqual([
      '192.0.2.1',
      '192.0.2.2',
    ]);
  });
});
