/**
 * @fileoverview 許可する外部アプリの設定の読み込みと起動時の検証（user-authentication タスク 71.2）
 *
 * Design: Requirements 46-51 > ExternalAppClientRegistry、OAuthProviderHost の Validation
 */

import { generateKeyPairSync } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  createExternalAppClientRegistry,
  ExternalAppConfigError,
  parseExternalAppOAuthConfig,
} from '../../../oauth/client-registry.js';

const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const CLIENT_SECRET = 'unit-test-client-secret-0123456789abcdef';
const COOKIE_KEY = 'unit-test-cookie-key-0123456789abcdefghij';
const HMAC_KEY = 'ab'.repeat(32);

const signingJwk = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
  format: 'jwk',
});
const publicJwk = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({
  format: 'jwk',
});

function client(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    clientId: 'claude',
    clientSecret: CLIENT_SECRET,
    displayName: 'Claude',
    redirectUris: [CLAUDE_CALLBACK],
    tokenEndpointAuthMethod: 'client_secret_post',
    ...overrides,
  };
}

function source(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    OAUTH_ALLOWED_CLIENTS: JSON.stringify([client()]),
    OAUTH_ISSUER: 'https://architrack.example.com',
    OAUTH_RESOURCE_URL: 'https://architrack.example.com/mcp',
    OAUTH_JWKS: JSON.stringify({ keys: [signingJwk] }),
    OAUTH_COOKIE_KEYS: JSON.stringify([COOKIE_KEY]),
    OAUTH_TOKEN_HMAC_KEY: HMAC_KEY,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

function failure(env: NodeJS.ProcessEnv): ExternalAppConfigError {
  try {
    parseExternalAppOAuthConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ExternalAppConfigError);
    return error as ExternalAppConfigError;
  }
  throw new Error('設定の検証が失敗しなかった');
}

describe('parseExternalAppOAuthConfig', () => {
  describe('窓口を載せるかの判定', () => {
    it.each([[undefined], [''], ['   '], ['[]']])(
      '許可するアプリが無い（%j）環境では窓口を載せない',
      (value) => {
        expect(
          parseExternalAppOAuthConfig({
            NODE_ENV: 'production',
            OAUTH_ALLOWED_CLIENTS: value,
          } as NodeJS.ProcessEnv)
        ).toBeNull();
      }
    );

    it('許可するアプリがあれば、設定を返す', () => {
      const config = parseExternalAppOAuthConfig(source());
      expect(config?.issuer).toBe('https://architrack.example.com');
      expect(config?.resourceUrl).toBe('https://architrack.example.com/mcp');
      expect(config?.cookieKeys).toEqual([COOKIE_KEY]);
      expect(config?.tokenHmacKey).toBe(HMAC_KEY);
      expect(config?.jwks.keys).toHaveLength(1);
      expect(config?.clients).toEqual([client()]);
    });

    it('送信方式を省くと client_secret_post になる', () => {
      const { tokenEndpointAuthMethod: _omitted, ...withoutMethod } = client();
      const config = parseExternalAppOAuthConfig(
        source({ OAUTH_ALLOWED_CLIENTS: JSON.stringify([withoutMethod]) })
      );
      expect(config?.clients[0]?.tokenEndpointAuthMethod).toBe('client_secret_post');
    });
  });

  describe('必須の鍵', () => {
    it.each([
      'OAUTH_ISSUER',
      'OAUTH_RESOURCE_URL',
      'OAUTH_JWKS',
      'OAUTH_COOKIE_KEYS',
      'OAUTH_TOKEN_HMAC_KEY',
    ])('許可するアプリがあるのに %s が欠けると止める', (name) => {
      expect(failure(source({ [name]: undefined })).issues.join('\n')).toContain(name);
    });

    it.each([
      ['JSON でない', 'not-json'],
      ['keys が空', JSON.stringify({ keys: [] })],
      ['公開鍵だけ', JSON.stringify({ keys: [publicJwk] })],
      ['共通鍵', JSON.stringify({ keys: [{ kty: 'oct', k: 'c2VjcmV0' }] })],
      ['壊れた鍵', JSON.stringify({ keys: [{ kty: 'RSA', n: 'x', e: 'AQAB', d: 'y' }] })],
    ])('OAUTH_JWKS が不正（%s）なら止める', (_label, value) => {
      expect(failure(source({ OAUTH_JWKS: value })).issues.join('\n')).toContain('OAUTH_JWKS');
    });

    it.each([
      ['JSON でない', 'not-json'],
      ['空', '[]'],
      ['短い', JSON.stringify(['short'])],
      ['重複', JSON.stringify([COOKIE_KEY, COOKIE_KEY])],
    ])('OAUTH_COOKIE_KEYS が不正（%s）なら止める', (_label, value) => {
      expect(failure(source({ OAUTH_COOKIE_KEYS: value })).issues.join('\n')).toContain(
        'OAUTH_COOKIE_KEYS'
      );
    });

    it('OAUTH_TOKEN_HMAC_KEY は 64 桁の 16 進に限る', () => {
      expect(failure(source({ OAUTH_TOKEN_HMAC_KEY: 'abc' })).issues.join('\n')).toContain(
        'OAUTH_TOKEN_HMAC_KEY'
      );
    });

    it('画面用の JWT の秘密鍵を認可サーバーの署名に流用すると止める', () => {
      const shared = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
      const error = failure(
        source({
          OAUTH_JWKS: JSON.stringify({ keys: [shared] }),
          JWT_PRIVATE_KEY: Buffer.from(JSON.stringify(shared)).toString('base64'),
        })
      );
      expect(error.issues.join('\n')).toContain('OAUTH_JWKS');
    });

    it('HMAC の鍵を Cookie の鍵に流用すると止める', () => {
      const error = failure(source({ OAUTH_COOKIE_KEYS: JSON.stringify([HMAC_KEY]) }));
      expect(error.issues.join('\n')).toContain('OAUTH_COOKIE_KEYS');
    });
  });

  describe('許可するアプリの形', () => {
    it.each([
      ['JSON でない', 'not-json'],
      ['配列でない', JSON.stringify(client())],
      ['clientId が空', JSON.stringify([client({ clientId: '' })])],
      ['secret が短い', JSON.stringify([client({ clientSecret: 'short' })])],
      ['表示名が空', JSON.stringify([client({ displayName: '' })])],
      ['戻り先が空', JSON.stringify([client({ redirectUris: [] })])],
      ['未知の欄', JSON.stringify([client({ extra: true })])],
      [
        '対応しない送信方式',
        JSON.stringify([client({ tokenEndpointAuthMethod: 'client_secret_basic' })]),
      ],
      ['clientId の重複', JSON.stringify([client(), client()])],
    ])('%s なら止める', (_label, value) => {
      expect(failure(source({ OAUTH_ALLOWED_CLIENTS: value })).issues.join('\n')).toContain(
        'OAUTH_ALLOWED_CLIENTS'
      );
    });
  });

  describe('戻り先（46.5）', () => {
    /**
     * @requirement user-authentication/REQ-46.5
     */
    it('本番では HTTPS でない戻り先を拒む', () => {
      const error = failure(
        source({
          OAUTH_ALLOWED_CLIENTS: JSON.stringify([
            client({ redirectUris: ['http://claude.ai/api/mcp/auth_callback'] }),
          ]),
        })
      );
      expect(error.issues.join('\n')).toContain('redirectUris');
    });

    /**
     * @requirement user-authentication/REQ-46.5
     */
    it.each([
      ['相対', '/api/mcp/auth_callback'],
      ['独自のスキーム', 'claude://callback'],
      ['javascript', 'javascript:alert(1)'],
      ['フラグメント付き', `${CLAUDE_CALLBACK}#fragment`],
      ['資格情報付き', 'https://user:pass@claude.ai/callback'],
      ['ワイルドカード', 'https://*.claude.ai/callback'],
      ['正規形でない', 'https://CLAUDE.ai/callback'],
    ])('完全な URL でない戻り先（%s）を拒む', (_label, redirectUri) => {
      for (const NODE_ENV of ['production', 'development']) {
        const error = failure(
          source({
            NODE_ENV,
            OAUTH_ALLOWED_CLIENTS: JSON.stringify([client({ redirectUris: [redirectUri] })]),
          })
        );
        expect(error.issues.join('\n')).toContain('redirectUris');
      }
    });

    it('本番以外では HTTP の戻り先を許す', () => {
      const config = parseExternalAppOAuthConfig(
        source({
          NODE_ENV: 'test',
          OAUTH_ISSUER: 'http://localhost:5174',
          OAUTH_RESOURCE_URL: 'http://localhost:5174/mcp',
          OAUTH_ALLOWED_CLIENTS: JSON.stringify([
            client({ redirectUris: ['http://127.0.0.1:4999/oauth/callback'] }),
          ]),
        })
      );
      expect(config?.clients[0]?.redirectUris).toEqual(['http://127.0.0.1:4999/oauth/callback']);
    });
  });

  describe('発行者とリソース', () => {
    it.each([
      ['OAUTH_ISSUER', 'http://architrack.example.com'],
      ['OAUTH_ISSUER', 'https://architrack.example.com/'],
      ['OAUTH_ISSUER', 'https://architrack.example.com?x=1'],
      ['OAUTH_RESOURCE_URL', 'http://architrack.example.com/mcp'],
      ['OAUTH_RESOURCE_URL', 'https://architrack.example.com/mcp#x'],
    ])('本番で %s=%s を拒む', (name, value) => {
      expect(failure(source({ [name]: value })).issues.join('\n')).toContain(name);
    });
  });

  describe('リポジトリに載せた試験用の値', () => {
    const COMPOSE_FILES = [
      'docker-compose.test.yml',
      'docker-compose.ci.yml',
      'docker-compose.dev.yml',
    ];

    function composeValue(file: string, name: string): string {
      const text = readFileSync(resolve(__dirname, '../../../../..', file), 'utf-8');
      const match = new RegExp(`^\\s+${name}: '?(.*?)'?$`, 'm').exec(text);
      if (!match?.[1]) {
        throw new Error(`前提の欠落: ${file} に ${name} が無い`);
      }
      return match[1];
    }

    function composeSource(file: string, nodeEnv: string): NodeJS.ProcessEnv {
      return {
        NODE_ENV: nodeEnv,
        OAUTH_ALLOWED_CLIENTS: composeValue(file, 'OAUTH_ALLOWED_CLIENTS'),
        OAUTH_ISSUER: composeValue(file, 'OAUTH_ISSUER'),
        OAUTH_RESOURCE_URL: composeValue(file, 'OAUTH_RESOURCE_URL'),
        OAUTH_JWKS: composeValue(file, 'OAUTH_JWKS'),
        OAUTH_COOKIE_KEYS: composeValue(file, 'OAUTH_COOKIE_KEYS'),
        OAUTH_TOKEN_HMAC_KEY: composeValue(file, 'OAUTH_TOKEN_HMAC_KEY'),
      } as NodeJS.ProcessEnv;
    }

    it.each(COMPOSE_FILES)('%s の値は開発・試験で受け付ける', (file) => {
      for (const nodeEnv of ['development', 'test']) {
        expect(parseExternalAppOAuthConfig(composeSource(file, nodeEnv))).not.toBeNull();
      }
    });

    it.each(
      COMPOSE_FILES.flatMap((file) => [
        [file, 'OAUTH_JWKS'],
        [file, 'OAUTH_COOKIE_KEYS'],
        [file, 'OAUTH_TOKEN_HMAC_KEY'],
      ])
    )('%s の %s は本番で拒む', (file, name) => {
      const error = failure(source({ [name]: composeValue(file, name as string) }));
      expect(error.issues.join('\n')).toContain(name);
    });

    it.each(COMPOSE_FILES)('%s の client secret は本番で拒む', (file) => {
      const [composeClient] = JSON.parse(composeValue(file, 'OAUTH_ALLOWED_CLIENTS')) as {
        clientSecret: string;
      }[];
      const error = failure(
        source({
          OAUTH_ALLOWED_CLIENTS: JSON.stringify([
            client({ clientSecret: composeClient!.clientSecret }),
          ]),
        })
      );
      expect(error.issues.join('\n')).toContain('clientSecret');
    });

    it.each(COMPOSE_FILES)('%s の秘密を大文字にしても本番で拒む', (file) => {
      const hmacError = failure(
        source({
          OAUTH_TOKEN_HMAC_KEY: composeValue(file, 'OAUTH_TOKEN_HMAC_KEY').toUpperCase(),
        })
      );
      expect(hmacError.issues.join('\n')).toContain('OAUTH_TOKEN_HMAC_KEY');

      const cookieError = failure(
        source({ OAUTH_COOKIE_KEYS: composeValue(file, 'OAUTH_COOKIE_KEYS').toUpperCase() })
      );
      expect(cookieError.issues.join('\n')).toContain('OAUTH_COOKIE_KEYS');

      const [composeClient] = JSON.parse(composeValue(file, 'OAUTH_ALLOWED_CLIENTS')) as {
        clientSecret: string;
      }[];
      const secretError = failure(
        source({
          OAUTH_ALLOWED_CLIENTS: JSON.stringify([
            client({ clientSecret: composeClient!.clientSecret.toUpperCase() }),
          ]),
        })
      );
      expect(secretError.issues.join('\n')).toContain('clientSecret');
    });

    it('JWK の kid や欄を変えても、同じ試験用の鍵は本番で拒む', () => {
      const jwks = JSON.parse(composeValue('docker-compose.test.yml', 'OAUTH_JWKS')) as {
        keys: Record<string, unknown>[];
      };
      const renamed = { keys: [{ ...jwks.keys[0], kid: 'renamed' }] };
      const error = failure(source({ OAUTH_JWKS: JSON.stringify(renamed) }));
      expect(error.issues.join('\n')).toContain('OAUTH_JWKS');
    });
  });

  describe('鍵の分離', () => {
    const jwtJwk = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
    const jwtPrivateKey = Buffer.from(JSON.stringify(jwtJwk)).toString('base64');

    it('未使用のビットだけ変えた同じ JWT の鍵を署名に使うと止める', () => {
      const lastChar = jwtJwk.d!.at(-1)!;
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      const altered = `${jwtJwk.d!.slice(0, -1)}${alphabet[alphabet.indexOf(lastChar) + 1]}`;
      const error = failure(
        source({
          OAUTH_JWKS: JSON.stringify({ keys: [{ ...jwtJwk, d: altered }] }),
          JWT_PRIVATE_KEY: jwtPrivateKey,
        })
      );
      expect(error.issues.join('\n')).toContain('OAUTH_JWKS');
    });

    it.each([
      ['JWT の d', jwtJwk.d!],
      ['JWT_PRIVATE_KEY の値', jwtPrivateKey],
    ])('%s を Cookie の鍵に流用すると止める', (_label, value) => {
      const error = failure(
        source({ OAUTH_COOKIE_KEYS: JSON.stringify([value]), JWT_PRIVATE_KEY: jwtPrivateKey })
      );
      expect(error.issues.join('\n')).toContain('OAUTH_COOKIE_KEYS');
    });

    it('大文字にした HMAC の鍵を Cookie の鍵に流用すると止める', () => {
      const error = failure(
        source({ OAUTH_COOKIE_KEYS: JSON.stringify([HMAC_KEY.toUpperCase()]) })
      );
      expect(error.issues.join('\n')).toContain('OAUTH_COOKIE_KEYS');
    });

    it.each([
      ['Cookie の鍵', COOKIE_KEY],
      ['HMAC の鍵', HMAC_KEY],
    ])('%s を client secret に流用すると止める', (_label, value) => {
      const error = failure(
        source({ OAUTH_ALLOWED_CLIENTS: JSON.stringify([client({ clientSecret: value })]) })
      );
      expect(error.issues.join('\n')).toContain('clientSecret');
    });
  });

  describe('署名鍵の強さと形', () => {
    it('2048 bit 未満の RSA 鍵を拒む', () => {
      const weak = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({
        format: 'jwk',
      });
      const error = failure(source({ OAUTH_JWKS: JSON.stringify({ keys: [weak] }) }));
      expect(error.issues.join('\n')).toContain('OAUTH_JWKS');
    });

    it('署名に使えない鍵（use=enc）を拒む', () => {
      const error = failure(
        source({ OAUTH_JWKS: JSON.stringify({ keys: [{ ...signingJwk, use: 'enc' }] }) })
      );
      expect(error.issues.join('\n')).toContain('OAUTH_JWKS');
    });

    it('kid の重複を拒む', () => {
      const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
        format: 'jwk',
      });
      const error = failure(
        source({
          OAUTH_JWKS: JSON.stringify({
            keys: [
              { ...signingJwk, kid: 'same' },
              { ...other, kid: 'same' },
            ],
          }),
        })
      );
      expect(error.issues.join('\n')).toContain('OAUTH_JWKS');
    });
  });

  describe('NODE_ENV が開発・試験と分からないとき', () => {
    /**
     * @requirement user-authentication/REQ-46.5
     */
    it.each([[undefined], [''], ['staging'], ['Production']])(
      'NODE_ENV=%j では HTTP の戻り先・発行者・リソースを拒む',
      (NODE_ENV) => {
        const error = failure(
          source({
            NODE_ENV,
            OAUTH_ISSUER: 'http://architrack.example.com',
            OAUTH_RESOURCE_URL: 'http://architrack.example.com/mcp',
            OAUTH_ALLOWED_CLIENTS: JSON.stringify([
              client({ redirectUris: ['http://claude.ai/api/mcp/auth_callback'] }),
            ]),
          })
        );
        const text = error.issues.join('\n');
        expect(text).toContain('redirectUris');
        expect(text).toContain('OAUTH_ISSUER');
        expect(text).toContain('OAUTH_RESOURCE_URL');
      }
    );
  });

  describe('発行者とリソースの正規形', () => {
    it.each([
      ['OAUTH_ISSUER', 'https://a.example.com/x?'],
      ['OAUTH_ISSUER', 'https://A.example.com'],
      ['OAUTH_ISSUER', ' https://a.example.com'],
      ['OAUTH_RESOURCE_URL', ' https://a.example.com/mcp'],
      ['OAUTH_RESOURCE_URL', 'https://a.example.com/mcp\n'],
      ['OAUTH_RESOURCE_URL', 'https://A.example.com/mcp'],
      ['OAUTH_RESOURCE_URL', 'https://a.example.com:443/mcp'],
      ['OAUTH_RESOURCE_URL', 'https://a.example.com/x/../mcp'],
      ['OAUTH_RESOURCE_URL', 'https://a.example.com/mcp?'],
      ['OAUTH_RESOURCE_URL', 'https://a.example.com/mcp?x=1'],
    ])('%s=%j を拒む', (name, value) => {
      expect(failure(source({ [name]: value })).issues.join('\n')).toContain(name);
    });
  });

  describe('空白の秘密', () => {
    it.each([
      ['空白だけ', ' '.repeat(40)],
      ['前後の空白', ` ${CLIENT_SECRET} `],
    ])('client secret が%sなら止める', (_label, clientSecret) => {
      const error = failure(
        source({ OAUTH_ALLOWED_CLIENTS: JSON.stringify([client({ clientSecret })]) })
      );
      expect(error.issues.join('\n')).toContain('clientSecret');
    });

    it.each([
      ['空白だけ', ' '.repeat(40)],
      ['前後の空白', ` ${COOKIE_KEY} `],
    ])('Cookie の鍵が%sなら止める', (_label, key) => {
      const error = failure(source({ OAUTH_COOKIE_KEYS: JSON.stringify([key]) }));
      expect(error.issues.join('\n')).toContain('OAUTH_COOKIE_KEYS');
    });
  });

  describe('エラーに値を含めない（48.8）', () => {
    /**
     * @requirement user-authentication/REQ-48.8
     */
    it('壊れた JSON や不正な欄の値が、エラーの文に現れない', () => {
      const broken = failure(
        source({
          OAUTH_ALLOWED_CLIENTS: `[{"clientSecret":"${CLIENT_SECRET}"`,
          OAUTH_COOKIE_KEYS: `["${COOKIE_KEY}"`,
          OAUTH_JWKS: `{"d":"${HMAC_KEY}"`,
          OAUTH_TOKEN_HMAC_KEY: 'leaky-hmac-value',
        })
      );
      const shape = failure(
        source({
          OAUTH_ALLOWED_CLIENTS: JSON.stringify([
            client({ redirectUris: ['http://leaky.example.com/cb'], unknownSecretField: 1 }),
          ]),
        })
      );
      for (const error of [broken, shape]) {
        const text = `${error.message}\n${error.issues.join('\n')}`;
        expect(text).not.toContain(CLIENT_SECRET);
        expect(text).not.toContain(COOKIE_KEY);
        expect(text).not.toContain(HMAC_KEY);
        expect(text).not.toContain('leaky');
        expect(text).not.toContain('unknownSecretField');
      }
    });
  });
});

describe('createExternalAppClientRegistry', () => {
  /**
   * @requirement user-authentication/REQ-46.4
   */
  it('許可の一覧にあるアプリだけを許可する', () => {
    const registry = createExternalAppClientRegistry(parseExternalAppOAuthConfig(source()));
    expect(registry.isAllowed('claude')).toBe(true);
    expect(registry.isAllowed('other-app')).toBe(false);
    expect(registry.isAllowed('')).toBe(false);
    expect(registry.isAllowed('__proto__')).toBe(false);
    expect(registry.loadAllowedClients().map((app) => app.clientId)).toEqual(['claude']);
  });

  it('設定が無ければ、どのアプリも許可しない', () => {
    const registry = createExternalAppClientRegistry(null);
    expect(registry.isAllowed('claude')).toBe(false);
    expect(registry.loadAllowedClients()).toEqual([]);
  });
});
