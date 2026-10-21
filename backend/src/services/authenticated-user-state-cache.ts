/**
 * @fileoverview 利用者の状態のキャッシュの鍵・TTL・無効化の手順（user-authentication 要件34.2、タスク47.5）
 *
 * AuthenticatedUserStateService（authenticated-user-state.service.ts）と、DB を直接書く試験の補助
 * （backend の統合テストの補助、E2E の補助）が、同じ鍵に同じ「消して世代を進める」処理を行うための定数を
 * 一か所に置く。鍵の名前はこのファイルを正とし、E2E の補助もここから読む。
 *
 * このファイルは他のモジュールを import しない（E2E の実行のプロセスから backend の DB・Redis の接続を
 * 読み込まずに参照できるようにするため）。
 */

/** 状態のキャッシュの鍵の接頭辞（値は状態の JSON） */
export const AUTH_USER_STATE_CACHE_KEY_PREFIX = 'auth:user-state:';

/**
 * 状態のキャッシュの世代の鍵の接頭辞
 *
 * 無効化のたびに INCR で進める。状態の取得は DB を読む前に世代を読み、書き込みの時点で世代が
 * 変わっていなければだけキャッシュへ書き込む（無効化の後に古い状態を書き戻さない）。
 */
export const AUTH_USER_STATE_GENERATION_KEY_PREFIX = 'auth:user-state-generation:';

/** 状態のキャッシュの TTL（秒）。世代の鍵も同じ長さで保つ */
export const AUTH_USER_STATE_CACHE_TTL_SECONDS = 60;

/** 利用者の状態のキャッシュの鍵 `auth:user-state:<userId>` */
export function authUserStateCacheKey(userId: string): string {
  return `${AUTH_USER_STATE_CACHE_KEY_PREFIX}${userId}`;
}

/** 利用者の状態のキャッシュの世代の鍵 */
export function authUserStateGenerationKey(userId: string): string {
  return `${AUTH_USER_STATE_GENERATION_KEY_PREFIX}${userId}`;
}

/**
 * 世代が読んだときのままならキャッシュへ書き込む（読み出しと書き込みを Redis の中で不可分に行う）。
 * KEYS[1]: キャッシュの鍵、KEYS[2]: 世代の鍵
 * ARGV[1]: DB を読む前に読んだ世代（無ければ空文字）、ARGV[2]: TTL（秒）、ARGV[3]: 値
 * 書き込んだら 1、世代が変わっていて書き込まなかったら 0 を返す
 */
export const WRITE_AUTH_USER_STATE_IF_GENERATION_UNCHANGED = `
local current = redis.call('GET', KEYS[2])
if (current or '') ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[3], 'EX', tonumber(ARGV[2]))
return 1
`;

/**
 * キャッシュを消して世代を進める（利用者ごとに不可分に行う）。
 * KEYS: キャッシュの鍵と世代の鍵の組の並び、ARGV[1]: 世代の鍵の TTL（秒）
 * 処理した利用者の数を返す
 */
export const INVALIDATE_AUTH_USER_STATE = `
for i = 1, #KEYS, 2 do
  redis.call('DEL', KEYS[i])
  redis.call('INCR', KEYS[i + 1])
  redis.call('EXPIRE', KEYS[i + 1], tonumber(ARGV[1]))
end
return #KEYS / 2
`;

/**
 * 無効化の手順（INVALIDATE_AUTH_USER_STATE）に渡す鍵の並び（キャッシュの鍵と世代の鍵の組）
 */
export function authUserStateInvalidationKeys(userIds: readonly string[]): string[] {
  return userIds.flatMap((userId) => [
    authUserStateCacheKey(userId),
    authUserStateGenerationKey(userId),
  ]);
}
