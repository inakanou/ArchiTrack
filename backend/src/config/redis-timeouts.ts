/**
 * キャッシュ基盤（Redis）のクライアントの期限（user-authentication 要件35.8）
 *
 * 接続を保ったまま基盤が応答しなくなると、期限の無いコマンドはいつまでも待つ。接続が切れたときの
 * 再試行の上限（maxRetriesPerRequest）はこの場合に効かないため、コマンドと接続の確立に期限を設け、
 * 期限切れを基盤の失敗として各用途の既存の失敗時の扱いに乗せる（design.md「Requirements 35.8・40.13・42.10」）。
 */

import { z } from 'zod';

/** コマンドの期限の既定値（ミリ秒） */
export const DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 2000 as const;

/** 接続の確立の期限の既定値（ミリ秒） */
export const DEFAULT_REDIS_CONNECT_TIMEOUT_MS = 10000 as const;

function positiveMillisecondsSchema(name: string, defaultValue: number) {
  return z
    .string()
    .optional()
    .default(String(defaultValue))
    .refine((val) => /^[1-9][0-9]*$/.test(val), {
      message: `${name} must be a positive integer in milliseconds (e.g. ${defaultValue})`,
    })
    .transform((val) => parseInt(val, 10));
}

/** REDIS_COMMAND_TIMEOUT_MS の検証スキーマ（正の整数のミリ秒。未設定なら既定 2000） */
export const redisCommandTimeoutSchema = positiveMillisecondsSchema(
  'REDIS_COMMAND_TIMEOUT_MS',
  DEFAULT_REDIS_COMMAND_TIMEOUT_MS
);

/** REDIS_CONNECT_TIMEOUT_MS の検証スキーマ（正の整数のミリ秒。未設定なら既定 10000） */
export const redisConnectTimeoutSchema = positiveMillisecondsSchema(
  'REDIS_CONNECT_TIMEOUT_MS',
  DEFAULT_REDIS_CONNECT_TIMEOUT_MS
);

/** Redis のクライアントに渡す期限 */
export interface RedisTimeouts {
  commandTimeout: number;
  connectTimeout: number;
}

/**
 * 環境変数から Redis のクライアントの期限を読む
 *
 * 起動時の validateEnv を経ずにクライアントを生成する経路（統合テスト等）でも同じ検証を通す。
 * @param env - 環境変数（既定は process.env）
 * @returns コマンドと接続の確立の期限（ミリ秒）
 * @throws 正の整数でない場合
 */
export function parseRedisTimeouts(env: NodeJS.ProcessEnv = process.env): RedisTimeouts {
  return {
    commandTimeout: redisCommandTimeoutSchema.parse(env.REDIS_COMMAND_TIMEOUT_MS),
    connectTimeout: redisConnectTimeoutSchema.parse(env.REDIS_CONNECT_TIMEOUT_MS),
  };
}
