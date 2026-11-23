/**
 * @fileoverview 起動時の環境変数の検証が外部アプリの設定も確かめること（user-authentication タスク 71.2）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const publicKey = Buffer.from(
  JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: 'mock_public_key_base64' })
).toString('base64');
const privateKey = Buffer.from(
  JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: 'mock_public_key_base64', d: 'mock_private' })
).toString('base64');

describe('validateEnv と外部アプリの設定', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.NODE_ENV = 'test';
    process.env.JWT_PUBLIC_KEY = publicKey;
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.TWO_FACTOR_ENCRYPTION_KEY = 'ab'.repeat(32);
    for (const name of Object.keys(process.env)) {
      if (name.startsWith('OAUTH_')) {
        delete process.env[name];
      }
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('許可するアプリが無ければ起動できる', async () => {
    const { validateEnv } = await import('../../../config/env.js');
    expect(() => validateEnv()).not.toThrow();
  });

  /**
   * @requirement user-authentication/REQ-46.4
   */
  it('許可するアプリの形が不正なら起動を止め、検証済みとして残さず、値を出力しない', async () => {
    process.env.OAUTH_ALLOWED_CLIENTS = '[{"clientSecret":"leaky-secret-value"';
    const { getEnv, validateEnv } = await import('../../../config/env.js');

    expect(() => validateEnv()).toThrow('Failed to validate environment variables');
    expect(() => getEnv()).toThrow('Environment not validated');

    const printed = vi.mocked(console.error).mock.calls.flat().map(String).join('\n');
    expect(printed).toContain('OAUTH_ALLOWED_CLIENTS');
    expect(printed).not.toContain('leaky-secret-value');
  });
});
