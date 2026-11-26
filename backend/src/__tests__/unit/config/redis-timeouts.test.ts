/**
 * キャッシュ基盤のクライアントの期限の解釈（user-authentication タスク80.2、要件35.8）
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REDIS_COMMAND_TIMEOUT_MS,
  DEFAULT_REDIS_CONNECT_TIMEOUT_MS,
  parseRedisTimeouts,
} from '../../../config/redis-timeouts.js';

describe('parseRedisTimeouts', () => {
  /**
   * @requirement user-authentication/REQ-35.8
   */
  it('未設定なら既定の期限（コマンド 2000ms・接続 10000ms）を返す', () => {
    expect(parseRedisTimeouts({})).toEqual({
      commandTimeout: DEFAULT_REDIS_COMMAND_TIMEOUT_MS,
      connectTimeout: DEFAULT_REDIS_CONNECT_TIMEOUT_MS,
    });
    expect(DEFAULT_REDIS_COMMAND_TIMEOUT_MS).toBe(2000);
    expect(DEFAULT_REDIS_CONNECT_TIMEOUT_MS).toBe(10000);
  });

  it('設定した正の整数のミリ秒を返す', () => {
    expect(
      parseRedisTimeouts({ REDIS_COMMAND_TIMEOUT_MS: '500', REDIS_CONNECT_TIMEOUT_MS: '3000' })
    ).toEqual({ commandTimeout: 500, connectTimeout: 3000 });
  });

  it.each(['0', '-1', '1.5', 'abc', '2000ms', ''])(
    'コマンドの期限が正の整数でない値（%j）なら拒む',
    (value) => {
      expect(() => parseRedisTimeouts({ REDIS_COMMAND_TIMEOUT_MS: value })).toThrow(
        /REDIS_COMMAND_TIMEOUT_MS must be a positive integer/
      );
    }
  );

  it('接続の期限が正の整数でない値なら拒む', () => {
    expect(() => parseRedisTimeouts({ REDIS_CONNECT_TIMEOUT_MS: '0' })).toThrow(
      /REDIS_CONNECT_TIMEOUT_MS must be a positive integer/
    );
  });
});
