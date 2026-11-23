/**
 * @fileoverview 認可サーバーの保存アダプターの単体検証（user-authentication タスク 73.1）
 *
 * 確かめること:
 * - 48.7: トークンのキーを HMAC にし、本体から値を除き、読み出しで戻す
 * - 48.8: 保存の失敗の文にトークンの値と DB の内容を出さない
 * - ライブラリの Grant の失効を、注入された処理へ 1 回だけ渡す
 *
 * Design: Requirements 46-51 > OAuthStoreAdapter
 */

import { createHmac } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOAuthStoreAdapterFactory,
  OAuthStoreError,
  type OAuthStoreDb,
} from '../../../oauth/store-adapter.js';

const HMAC_KEY = 'cd'.repeat(32);
const NOW = new Date('2026-11-24T00:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const RAW_TOKEN = 'raw-token-value-that-must-never-be-stored';

interface Row {
  id: string;
  kind: string;
  grantId: string | null;
  uid: string | null;
  payload: unknown;
  consumedAt: Date | null;
  expiresAt: Date | null;
}

function hmacId(kind: string, value: string): string {
  const digest = createHmac('sha256', Buffer.from(HMAC_KEY, 'hex')).update(value).digest('hex');
  return `${kind}:${digest}`;
}

function fakeDb(rows: Map<string, Row>): OAuthStoreDb {
  return {
    oAuthStoreRecord: {
      upsert: vi.fn(async ({ where, create, update }) => {
        const previous = rows.get(where.id as string);
        const next = previous ? { ...previous, ...update } : { consumedAt: null, ...create };
        rows.set(where.id as string, next as Row);
        return next;
      }),
      findUnique: vi.fn(async ({ where }) => rows.get(where.id as string) ?? null),
      findFirst: vi.fn(async ({ where }) => {
        const now = (where.OR?.[1] as { expiresAt: { gt: Date } }).expiresAt.gt;
        return (
          [...rows.values()].find(
            (row) =>
              row.kind === where.kind &&
              row.uid === where.uid &&
              (row.expiresAt === null || row.expiresAt > now)
          ) ?? null
        );
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        const row = rows.get(where.id as string);
        if (!row || row.consumedAt !== null) {
          return { count: 0 };
        }
        row.consumedAt = data.consumedAt as Date;
        return { count: 1 };
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const row = rows.get(where.id as string);
        if (!row || (where.consumedAt === null && row.consumedAt !== null)) {
          return { count: 0 };
        }
        rows.delete(where.id as string);
        return { count: 1 };
      }),
    },
  } as unknown as OAuthStoreDb;
}

describe('OAuthStoreAdapter', () => {
  let rows: Map<string, Row>;
  let onGrantRevoked: ReturnType<typeof vi.fn<(event: unknown) => Promise<void>>>;
  let factory: ReturnType<typeof createOAuthStoreAdapterFactory>;

  beforeEach(() => {
    rows = new Map();
    onGrantRevoked = vi.fn(async () => undefined);
    factory = createOAuthStoreAdapterFactory({
      prisma: fakeDb(rows),
      tokenHmacKey: HMAC_KEY,
      onGrantRevoked,
      onRefreshGraceApplied: async () => undefined,
      getRequestSource: () => ({ ipAddress: '203.0.113.9', userAgent: 'unit-test' }),
      now: () => NOW,
    });
  });

  describe('鍵の検証', () => {
    it('64 桁の 16 進でない鍵を、値を出さずに拒む', () => {
      const badKey = 'not-a-valid-hmac-key';
      let caught: unknown;
      try {
        createOAuthStoreAdapterFactory({
          prisma: fakeDb(rows),
          tokenHmacKey: badKey,
          onGrantRevoked,
          onRefreshGraceApplied: async () => undefined,
          getRequestSource: () => ({}),
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(OAuthStoreError);
      expect(String((caught as Error).message)).not.toContain(badKey);
    });
  });

  describe.each(['AccessToken', 'RefreshToken', 'AuthorizationCode'])('%s の保存', (kind) => {
    it('キーを種別と HMAC の組にし、本体と全ての列に値を残さない', async () => {
      await factory(kind).upsert(
        RAW_TOKEN,
        { jti: RAW_TOKEN, kind, grantId: 'grant-1', accountId: 'user-1', exp: NOW_SECONDS + 60 },
        60
      );

      const row = rows.get(hmacId(kind, RAW_TOKEN));
      expect(row).toBeDefined();
      expect(row?.grantId).toBe('grant-1');
      expect(row?.expiresAt).toEqual(new Date(NOW.getTime() + 60_000));
      expect(JSON.stringify(row)).not.toContain(RAW_TOKEN);
    });

    it('読み出しで jti を提示された値に戻す', async () => {
      const adapter = factory(kind);
      await adapter.upsert(RAW_TOKEN, { jti: RAW_TOKEN, kind, grantId: 'grant-1' }, 60);

      await expect(adapter.find(RAW_TOKEN)).resolves.toEqual({
        jti: RAW_TOKEN,
        kind,
        grantId: 'grant-1',
      });
    });

    it('別の値では読めない', async () => {
      const adapter = factory(kind);
      await adapter.upsert(RAW_TOKEN, { jti: RAW_TOKEN, kind }, 60);

      await expect(adapter.find(`${RAW_TOKEN}x`)).resolves.toBeUndefined();
    });
  });

  describe('期限', () => {
    it('期限に達した未使用の行を返さない', async () => {
      const adapter = factory('AccessToken');
      await adapter.upsert(RAW_TOKEN, { jti: RAW_TOKEN, kind: 'AccessToken' }, 0);

      await expect(adapter.find(RAW_TOKEN)).resolves.toBeUndefined();
    });

    it.each(['AuthorizationCode', 'RefreshToken'])(
      '期限切れでも使用済みの %s は再利用の検知のために返す',
      async (kind) => {
        const adapter = factory(kind);
        await adapter.upsert(RAW_TOKEN, { jti: RAW_TOKEN, kind }, 60);
        await adapter.consume(RAW_TOKEN);
        const row = rows.get(hmacId(kind, RAW_TOKEN)) as Row;
        row.expiresAt = new Date(NOW.getTime() - 1);

        await expect(adapter.find(RAW_TOKEN)).resolves.toMatchObject({ consumed: NOW_SECONDS });
      }
    );

    it('期限切れの使用済みでもアクセストークンは返さない', async () => {
      const adapter = factory('AccessToken');
      await adapter.upsert(RAW_TOKEN, { jti: RAW_TOKEN, kind: 'AccessToken' }, 60);
      const row = rows.get(hmacId('AccessToken', RAW_TOKEN)) as Row;
      row.consumedAt = NOW;
      row.expiresAt = new Date(NOW.getTime() - 1);

      await expect(adapter.find(RAW_TOKEN)).resolves.toBeUndefined();
    });

    it('期限の無い行は期限なしで保存する', async () => {
      await factory('Grant').upsert('grant-1', { jti: 'grant-1', kind: 'Grant' }, undefined);

      expect(rows.get('Grant:grant-1')?.expiresAt).toBeNull();
    });

    it('不正な有効期間を拒む', async () => {
      await expect(
        factory('AccessToken').upsert(RAW_TOKEN, { jti: RAW_TOKEN }, Number.NaN)
      ).rejects.toBeInstanceOf(OAuthStoreError);
    });
  });

  describe('使用済みの記録', () => {
    it('consumed を秒で返す', async () => {
      const adapter = factory('RefreshToken');
      await adapter.upsert(RAW_TOKEN, { jti: RAW_TOKEN, kind: 'RefreshToken' }, 60);
      await adapter.consume(RAW_TOKEN);

      const found = await adapter.find(RAW_TOKEN);

      expect(found?.consumed).toBe(NOW_SECONDS);
      expect(Number.isInteger(found?.consumed)).toBe(true);
    });

    it('本体の consumed は列へ移し、JSON に残さない', async () => {
      await factory('RefreshToken').upsert(
        RAW_TOKEN,
        { jti: RAW_TOKEN, kind: 'RefreshToken', consumed: NOW_SECONDS - 5 },
        60
      );

      const row = rows.get(hmacId('RefreshToken', RAW_TOKEN)) as Row;
      expect(row.consumedAt).toEqual(new Date((NOW_SECONDS - 5) * 1000));
      expect(row.payload).not.toHaveProperty('consumed');
    });

    it('consumed の無い再保存で使用済みを戻さない', async () => {
      const adapter = factory('RefreshToken');
      await adapter.upsert(RAW_TOKEN, { jti: RAW_TOKEN, kind: 'RefreshToken' }, 60);
      await adapter.consume(RAW_TOKEN);
      await adapter.upsert(RAW_TOKEN, { jti: RAW_TOKEN, kind: 'RefreshToken' }, 60);

      await expect(adapter.find(RAW_TOKEN)).resolves.toMatchObject({ consumed: NOW_SECONDS });
    });

    it('存在しない行と使用済みの行の consume は失敗にする', async () => {
      const adapter = factory('RefreshToken');
      await expect(adapter.consume(RAW_TOKEN)).rejects.toBeInstanceOf(OAuthStoreError);

      await adapter.upsert(RAW_TOKEN, { jti: RAW_TOKEN, kind: 'RefreshToken' }, 60);
      await adapter.consume(RAW_TOKEN);
      await expect(adapter.consume(RAW_TOKEN)).rejects.toBeInstanceOf(OAuthStoreError);
    });
  });

  describe('HMAC にしない種別', () => {
    it('Grant の行は自身の ID を grant_id に入れ、利用者とアプリを保つ', async () => {
      await factory('Grant').upsert(
        'grant-1',
        { jti: 'grant-1', kind: 'Grant', accountId: 'user-1', clientId: 'client-1' },
        3600
      );

      const row = rows.get('Grant:grant-1');
      expect(row?.grantId).toBe('grant-1');
      expect(row?.payload).toMatchObject({ accountId: 'user-1', clientId: 'client-1' });
    });

    it('Session は uid の列に入れ、findByUid で読める', async () => {
      const adapter = factory('Session');
      await adapter.upsert('session-1', { jti: 'session-1', kind: 'Session', uid: 'uid-1' }, 60);

      expect(rows.get('Session:session-1')?.uid).toBe('uid-1');
      await expect(adapter.findByUid('uid-1')).resolves.toMatchObject({ jti: 'session-1' });
    });

    it('Interaction の grantId は grant_id の列に入れない', async () => {
      await factory('Interaction').upsert(
        'interaction-1',
        { jti: 'interaction-1', kind: 'Interaction', grantId: 'grant-1' },
        60
      );

      expect(rows.get('Interaction:interaction-1')?.grantId).toBeNull();
    });
  });

  describe('行の消去', () => {
    it.each(['RefreshToken', 'AuthorizationCode'])(
      '使用済みの %s は消さず、再利用として検知できる',
      async (kind) => {
        const adapter = factory(kind);
        await adapter.upsert(RAW_TOKEN, { jti: RAW_TOKEN, kind }, 60);
        await adapter.consume(RAW_TOKEN);

        await adapter.destroy(RAW_TOKEN);

        await expect(adapter.find(RAW_TOKEN)).resolves.toMatchObject({ consumed: NOW_SECONDS });
      }
    );

    it.each(['RefreshToken', 'AuthorizationCode', 'AccessToken'])(
      '未使用の %s は消す',
      async (kind) => {
        const adapter = factory(kind);
        await adapter.upsert(RAW_TOKEN, { jti: RAW_TOKEN, kind }, 60);

        await adapter.destroy(RAW_TOKEN);

        expect(rows.has(hmacId(kind, RAW_TOKEN))).toBe(false);
      }
    );
  });

  describe('Grant の失効', () => {
    it('複数のモデルからの同時の呼び出しを 1 回にして送信元とともに渡す', async () => {
      await Promise.all([
        factory('AccessToken').revokeByGrantId('grant-1'),
        factory('RefreshToken').revokeByGrantId('grant-1'),
        factory('AuthorizationCode').revokeByGrantId('grant-1'),
      ]);

      expect(onGrantRevoked).toHaveBeenCalledTimes(1);
      expect(onGrantRevoked).toHaveBeenCalledWith({
        grantId: 'grant-1',
        kind: 'grant_revocation',
        ipAddress: '203.0.113.9',
        userAgent: 'unit-test',
      });
    });

    it('処理の完了より先に Grant の行を消さない', async () => {
      await factory('Grant').upsert('grant-1', { jti: 'grant-1', kind: 'Grant' }, 3600);
      let seenDuringHandler = false;
      onGrantRevoked.mockImplementation(async () => {
        await Promise.resolve();
        seenDuringHandler = rows.has('Grant:grant-1');
      });

      await Promise.all([
        factory('RefreshToken').revokeByGrantId('grant-1'),
        factory('Grant').destroy('grant-1'),
      ]);

      expect(seenDuringHandler).toBe(true);
      expect(rows.has('Grant:grant-1')).toBe(false);
    });

    it('処理が失敗したら失敗を伝え、Grant の行を残す', async () => {
      await factory('Grant').upsert('grant-1', { jti: 'grant-1', kind: 'Grant' }, 3600);
      onGrantRevoked.mockRejectedValue(new Error(`db failure ${RAW_TOKEN}`));

      const results = await Promise.allSettled([
        factory('RefreshToken').revokeByGrantId('grant-1'),
        factory('Grant').destroy('grant-1'),
      ]);

      for (const result of results) {
        expect(result.status).toBe('rejected');
        const reason = (result as PromiseRejectedResult).reason as Error;
        expect(reason).toBeInstanceOf(OAuthStoreError);
        expect(reason.message).not.toContain(RAW_TOKEN);
      }
      expect(rows.has('Grant:grant-1')).toBe(true);
    });

    it('完了の後の呼び出しは再び処理へ渡す', async () => {
      const adapter = factory('RefreshToken');
      await adapter.revokeByGrantId('grant-1');
      await adapter.revokeByGrantId('grant-1');

      expect(onGrantRevoked).toHaveBeenCalledTimes(2);
    });
  });

  describe('保存の失敗', () => {
    it('DB の例外を、値と原因を含まない例外にする', async () => {
      const db = fakeDb(rows);
      vi.mocked(db.oAuthStoreRecord.upsert).mockRejectedValue(
        Object.assign(new Error(`Invalid invocation: ${RAW_TOKEN}`), { code: 'P2010' })
      );
      const adapter = createOAuthStoreAdapterFactory({
        prisma: db,
        tokenHmacKey: HMAC_KEY,
        onGrantRevoked,
        onRefreshGraceApplied: async () => undefined,
        getRequestSource: () => ({}),
      })('AccessToken');

      const error = (await adapter
        .upsert(RAW_TOKEN, { jti: RAW_TOKEN }, 60)
        .catch((caught: unknown) => caught)) as OAuthStoreError;

      expect(error).toBeInstanceOf(OAuthStoreError);
      expect(error.code).toBe('P2010');
      expect(error.cause).toBeUndefined();
      expect(JSON.stringify({ message: error.message, stack: error.stack })).not.toContain(
        RAW_TOKEN
      );
    });

    it('壊れた本体を読んだら失敗にする', async () => {
      const adapter = factory('AccessToken');
      await adapter.upsert(RAW_TOKEN, { jti: RAW_TOKEN }, 60);
      (rows.get(hmacId('AccessToken', RAW_TOKEN)) as Row).payload = 'broken';

      await expect(adapter.find(RAW_TOKEN)).rejects.toBeInstanceOf(OAuthStoreError);
    });
  });
});
