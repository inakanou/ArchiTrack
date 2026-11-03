/**
 * @fileoverview 2FA 待ちの資格（TwoFactorChallengeService）の単体テスト
 *
 * Redis の代わりに、期限付きの GET・SET・DEL だけを持つ偽物を使う（期限は偽の時計で進める）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'crypto';
import type Redis from 'ioredis';
import {
  TwoFactorChallengeService,
  TWO_FACTOR_CHALLENGE_TTL_SECONDS,
  twoFactorChallengeKey,
} from '../../../services/two-factor-challenge.service.js';

/** 期限付きの GET・SET・DEL だけを持つ Redis の偽物 */
class FakeRedis {
  status = 'ready';
  readonly entries = new Map<string, { value: string; expiresAt: number }>();
  readonly setCalls: unknown[][] = [];

  private alive(key: string): { value: string; expiresAt: number } | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  async set(key: string, value: string, mode: string, ttl: number): Promise<'OK'> {
    this.setCalls.push([key, value, mode, ttl]);
    this.entries.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.alive(key)?.value ?? null;
  }

  async del(key: string): Promise<number> {
    const existed = this.alive(key) !== undefined;
    this.entries.delete(key);
    return existed ? 1 : 0;
  }
}

describe('TwoFactorChallengeService', () => {
  let fake: FakeRedis;
  let service: TwoFactorChallengeService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
    fake = new FakeRedis();
    service = new TwoFactorChallengeService(() => fake as unknown as Redis);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * @requirement user-authentication/REQ-32.1
   */
  it('発行した資格の照会が利用者 ID を返す', async () => {
    const issued = await service.issue('user-1');
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const peeked = await service.peek(issued.value.challengeToken);

    expect(peeked).toEqual({ ok: true, value: { userId: 'user-1' } });
  });

  /**
   * @requirement user-authentication/REQ-32.5
   */
  it('資格は JWT ではない 32 バイトの不透明な文字列で、原文ではなくハッシュを鍵に置く', async () => {
    const issued = await service.issue('user-1');
    if (!issued.ok) throw new Error('issue failed');
    const token = issued.value.challengeToken;

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token.split('.')).toHaveLength(1);
    const expectedKey = `2fa:challenge:${createHash('sha256').update(token).digest('hex')}`;
    expect(twoFactorChallengeKey(token)).toBe(expectedKey);
    expect([...fake.entries.keys()]).toEqual([expectedKey]);
    expect(JSON.stringify([...fake.entries.values()])).not.toContain(token);
  });

  /**
   * @requirement user-authentication/REQ-32.3
   */
  it('資格の有効期間は 300 秒で、経過後の照会は CHALLENGE_INVALID', async () => {
    const issued = await service.issue('user-1');
    if (!issued.ok) throw new Error('issue failed');

    expect(TWO_FACTOR_CHALLENGE_TTL_SECONDS).toBe(300);
    expect(issued.value.expiresIn).toBe(300);
    expect(fake.setCalls[0]?.slice(2)).toEqual(['EX', 300]);

    vi.advanceTimersByTime(299_000);
    expect((await service.peek(issued.value.challengeToken)).ok).toBe(true);

    vi.advanceTimersByTime(1_000);
    expect(await service.peek(issued.value.challengeToken)).toEqual({
      ok: false,
      error: { type: 'CHALLENGE_INVALID' },
    });
  });

  /**
   * @requirement user-authentication/REQ-32.4
   */
  it('消費は一度だけ成功し、二度目の消費と消費後の照会は CHALLENGE_INVALID', async () => {
    const issued = await service.issue('user-1');
    if (!issued.ok) throw new Error('issue failed');
    const token = issued.value.challengeToken;

    expect(await service.consume(token)).toEqual({ ok: true, value: undefined });
    expect(await service.consume(token)).toEqual({
      ok: false,
      error: { type: 'CHALLENGE_INVALID' },
    });
    expect(await service.peek(token)).toEqual({ ok: false, error: { type: 'CHALLENGE_INVALID' } });
  });

  /**
   * @requirement user-authentication/REQ-32.2
   */
  it('発行していない資格・空文字の照会と消費は CHALLENGE_INVALID', async () => {
    for (const token of ['not-issued', '']) {
      expect(await service.peek(token)).toEqual({
        ok: false,
        error: { type: 'CHALLENGE_INVALID' },
      });
      expect(await service.consume(token)).toEqual({
        ok: false,
        error: { type: 'CHALLENGE_INVALID' },
      });
    }
  });

  it('保存した値が壊れているときの照会は CHALLENGE_INVALID', async () => {
    const issued = await service.issue('user-1');
    if (!issued.ok) throw new Error('issue failed');
    const key = twoFactorChallengeKey(issued.value.challengeToken);

    for (const broken of ['not-json', '{"issuedAt":1}', '{"userId":""}', 'null']) {
      fake.entries.set(key, { value: broken, expiresAt: Date.now() + 60_000 });
      expect(await service.peek(issued.value.challengeToken)).toEqual({
        ok: false,
        error: { type: 'CHALLENGE_INVALID' },
      });
    }
  });

  /**
   * @requirement user-authentication/REQ-32.1
   */
  it('発行のたびに異なる資格を返す', async () => {
    const first = await service.issue('user-1');
    const second = await service.issue('user-1');
    if (!first.ok || !second.ok) throw new Error('issue failed');

    expect(first.value.challengeToken).not.toBe(second.value.challengeToken);
  });

  describe('保存先が使えないとき', () => {
    it.each([
      ['クライアントが無い', () => null],
      [
        '接続が ready でない',
        () => {
          fake.status = 'reconnecting';
          return fake as unknown as Redis;
        },
      ],
    ])(
      '%s: 発行・照会・消費は CHALLENGE_STORE_UNAVAILABLE で、コマンドを送らない',
      async (_, client) => {
        const getSpy = vi.spyOn(fake, 'get');
        const setSpy = vi.spyOn(fake, 'set');
        const delSpy = vi.spyOn(fake, 'del');
        const unavailable = new TwoFactorChallengeService(client);
        const expected = { ok: false, error: { type: 'CHALLENGE_STORE_UNAVAILABLE' } };

        expect(await unavailable.issue('user-1')).toEqual(expected);
        expect(await unavailable.peek('token')).toEqual(expected);
        expect(await unavailable.consume('token')).toEqual(expected);
        expect(getSpy).not.toHaveBeenCalled();
        expect(setSpy).not.toHaveBeenCalled();
        expect(delSpy).not.toHaveBeenCalled();
      }
    );

    it('コマンドが失敗したときの発行・照会・消費は CHALLENGE_STORE_UNAVAILABLE', async () => {
      const failure = new Error('connection lost');
      vi.spyOn(fake, 'set').mockRejectedValue(failure);
      vi.spyOn(fake, 'get').mockRejectedValue(failure);
      vi.spyOn(fake, 'del').mockRejectedValue(failure);
      const expected = { ok: false, error: { type: 'CHALLENGE_STORE_UNAVAILABLE' } };

      expect(await service.issue('user-1')).toEqual(expected);
      expect(await service.peek('token')).toEqual(expected);
      expect(await service.consume('token')).toEqual(expected);
    });
  });
});
