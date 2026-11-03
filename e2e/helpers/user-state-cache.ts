/**
 * @fileoverview E2E の補助が DB を直接書いた後に、利用者の状態のキャッシュを無効化する補助
 *
 * backend は利用者の状態（有効・2FA の登録・初回のパスワード変更の要否）を Redis の鍵
 * `auth:user-state:<userId>` に TTL 60 秒でキャッシュする（user-authentication タスク47.5）。
 * E2E の補助（利用者の作成・専用の利用者の初期化・TOTP の時間ステップの戻し）は DB を直接書くため、
 * 書いた後に backend の無効化（`AuthenticatedUserStateService.invalidate`）と同じ鍵に同じ
 * 「消して世代を進める」処理を行う。鍵の名前と手順は backend の定数（authenticated-user-state-cache.ts）を
 * 正とし、ここから読む。
 *
 * - 接続先は `REDIS_URL`。無いときは試験環境の既定値 `redis://localhost:6380/1`（backend-test と同じ
 *   論理 DB）を使う（`fixtures/database.ts` の DB の既定値と同じ扱い。pre-push の
 *   `CI=true npx playwright test` は `.env` を読まない）
 * - 接続できないときは例外を投げてテストを失敗させる（飛ばさない）。無効化しないまま進むと、古い状態が
 *   TTL の間だけ残り、状態による検証が偽の結果になるため
 */

import Redis from 'ioredis';
import {
  AUTH_USER_STATE_CACHE_TTL_SECONDS,
  INVALIDATE_AUTH_USER_STATE,
  authUserStateCacheKey,
  authUserStateInvalidationKeys,
} from '../../backend/src/services/authenticated-user-state-cache';

/** `REDIS_URL` が無いときの既定値（試験環境の Redis の公開ポートと backend-test の論理 DB） */
export const DEFAULT_E2E_REDIS_URL = 'redis://localhost:6380/1';

/** 接続の待ちの上限（ミリ秒） */
const CONNECT_TIMEOUT_MS = 5000;

/** 接続先の Redis の URL */
export function resolveE2eRedisUrl(): string {
  const fromEnv = process.env.REDIS_URL;
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : DEFAULT_E2E_REDIS_URL;
}

/**
 * Redis へ接続して処理を行い、接続を閉じる
 *
 * 再接続とオフラインキューを使わず、接続できなければ直ちに例外にする。
 */
async function withRedis<T>(action: (client: Redis) => Promise<T>): Promise<T> {
  const url = resolveE2eRedisUrl();
  const client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  // 接続の失敗は connect() の拒否で扱う（error の受け手が無いと未処理の事象として報告される）
  client.on('error', () => undefined);
  try {
    try {
      await client.connect();
    } catch (error) {
      throw new Error(
        `利用者の状態のキャッシュの Redis（${url}）に接続できません。backend と同じ Redis の論理 DB を` +
          `REDIS_URL で渡してください: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return await action(client);
  } finally {
    client.disconnect();
  }
}

/**
 * 利用者の状態のキャッシュを無効化する（backend の invalidate と同じく、消して世代を進める）
 *
 * @param userIds - 無効化する利用者の ID（空なら接続しない）
 */
export async function invalidateUserStateCache(userIds: readonly string[]): Promise<void> {
  if (userIds.length === 0) {
    return;
  }
  const keys = authUserStateInvalidationKeys(userIds);
  await withRedis((client) =>
    client.eval(INVALIDATE_AUTH_USER_STATE, keys.length, ...keys, AUTH_USER_STATE_CACHE_TTL_SECONDS)
  );
}

/**
 * 利用者の状態のキャッシュの値を読む（観測用。無ければ null）
 *
 * @param userId - 利用者の ID
 */
export async function readUserStateCacheEntry(userId: string): Promise<unknown> {
  const raw = await withRedis((client) => client.get(authUserStateCacheKey(userId)));
  return raw === null ? null : (JSON.parse(raw) as unknown);
}
