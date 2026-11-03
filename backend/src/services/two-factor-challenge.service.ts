/**
 * @fileoverview 2FA 待ちの資格のサービス
 *
 * パスワードの検証の成功に結び付いた、5 分・一回限りの 2FA の検証の資格を発行・照会・消費する
 * （要件32.1〜32.6）。
 *
 * - 資格は 32 バイトの乱数を base64url にした不透明な文字列で、JWT ではない。アクセストークンや
 *   リフレッシュトークンを資格として提示されても、保存先に鍵が無いため照会できない（32.5）
 * - Redis に鍵 `2fa:challenge:<SHA-256(資格)>`、値 `{ userId, issuedAt }`、TTL 300 秒で置く。
 *   原文は保存しない
 * - 消費は `DEL` が 1 を返したときだけ成功とする。同時に二つの検証が成功しても、消費に成功するのは
 *   一方だけになる（32.4）
 * - Redis が `ready` でないとき・コマンドが失敗したときは `CHALLENGE_STORE_UNAVAILABLE` を返す
 *   （2FA の検証を素通りさせない。呼び出し側は 503 を返す）
 */

import { createHash, randomBytes } from 'crypto';
import type Redis from 'ioredis';
import redis from '../redis.js';
import logger from '../utils/logger.js';
import { Ok, Err, type Result } from '../types/result.js';

/** 資格の有効期間（秒）。要件32.3 の上限 5 分 */
export const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 300;

/** 資格の乱数のバイト数 */
const CHALLENGE_BYTES = 32;

export type ChallengeError =
  /** 不在・期限切れ・消費済み（区別しない） */
  { type: 'CHALLENGE_INVALID' } | { type: 'CHALLENGE_STORE_UNAVAILABLE' };

export interface IssuedChallenge {
  challengeToken: string;
  /** 有効期間（秒） */
  expiresIn: number;
}

/** 資格の原文から Redis の鍵を作る（原文ではなく SHA-256 を鍵に置く） */
export function twoFactorChallengeKey(challengeToken: string): string {
  return `2fa:challenge:${createHash('sha256').update(challengeToken, 'utf8').digest('hex')}`;
}

/** 保存した値から利用者 ID を取り出す（壊れていれば null） */
function parseStoredUserId(stored: string): string | null {
  try {
    const parsed: unknown = JSON.parse(stored);
    if (parsed && typeof parsed === 'object' && 'userId' in parsed) {
      const userId = (parsed as { userId: unknown }).userId;
      return typeof userId === 'string' && userId !== '' ? userId : null;
    }
    return null;
  } catch {
    return null;
  }
}

export class TwoFactorChallengeService {
  /**
   * @param getClient - Redis のクライアントを返す（既定はアプリの Redis。起動後に接続されるため遅延で読む）
   */
  constructor(private readonly getClient: () => Redis | null = () => redis.getClient()) {}

  /** 使える Redis のクライアント（ready でなければ null。コマンドを送ってオフラインキューに積まない） */
  private readyClient(): Redis | null {
    const client = this.getClient();
    if (!client || client.status !== 'ready') {
      logger.error(
        { err: new Error(`Redis connection is not ready (status: ${client?.status ?? 'none'})`) },
        '2FA challenge store unavailable'
      );
      return null;
    }
    return client;
  }

  /**
   * 資格を発行する。AuthService がパスワードの検証と状態の確認に成功した後だけ呼ぶ
   */
  async issue(userId: string): Promise<Result<IssuedChallenge, ChallengeError>> {
    const client = this.readyClient();
    if (!client) {
      return Err({ type: 'CHALLENGE_STORE_UNAVAILABLE' });
    }
    const challengeToken = randomBytes(CHALLENGE_BYTES).toString('base64url');
    try {
      await client.set(
        twoFactorChallengeKey(challengeToken),
        JSON.stringify({ userId, issuedAt: Date.now() }),
        'EX',
        TWO_FACTOR_CHALLENGE_TTL_SECONDS
      );
    } catch (error) {
      logger.error({ err: error }, 'Failed to store 2FA challenge');
      return Err({ type: 'CHALLENGE_STORE_UNAVAILABLE' });
    }
    return Ok({ challengeToken, expiresIn: TWO_FACTOR_CHALLENGE_TTL_SECONDS });
  }

  /**
   * 資格に結び付いた利用者を照会する（消費しない）
   */
  async peek(challengeToken: string): Promise<Result<{ userId: string }, ChallengeError>> {
    const client = this.readyClient();
    if (!client) {
      return Err({ type: 'CHALLENGE_STORE_UNAVAILABLE' });
    }
    if (challengeToken === '') {
      return Err({ type: 'CHALLENGE_INVALID' });
    }
    let stored: string | null;
    try {
      stored = await client.get(twoFactorChallengeKey(challengeToken));
    } catch (error) {
      logger.error({ err: error }, 'Failed to read 2FA challenge');
      return Err({ type: 'CHALLENGE_STORE_UNAVAILABLE' });
    }
    const userId = stored === null ? null : parseStoredUserId(stored);
    return userId === null ? Err({ type: 'CHALLENGE_INVALID' }) : Ok({ userId });
  }

  /**
   * 資格を消費する。`DEL` が 1 を返したときだけ成功する（同時の二重の消費は一方だけが成功する）
   */
  async consume(challengeToken: string): Promise<Result<void, ChallengeError>> {
    const client = this.readyClient();
    if (!client) {
      return Err({ type: 'CHALLENGE_STORE_UNAVAILABLE' });
    }
    if (challengeToken === '') {
      return Err({ type: 'CHALLENGE_INVALID' });
    }
    let deleted: number;
    try {
      deleted = await client.del(twoFactorChallengeKey(challengeToken));
    } catch (error) {
      logger.error({ err: error }, 'Failed to consume 2FA challenge');
      return Err({ type: 'CHALLENGE_STORE_UNAVAILABLE' });
    }
    return deleted === 1 ? Ok(undefined) : Err({ type: 'CHALLENGE_INVALID' });
  }
}
