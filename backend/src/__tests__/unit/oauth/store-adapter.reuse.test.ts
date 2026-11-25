/**
 * @fileoverview 認可サーバーの保存アダプターの、使用済みの値の再提示と更新の置き換えの単体検証
 *
 * ライブラリの要求の文脈（`Provider.ctx`）を差し替え、トークンの窓口での置き換え・猶予・再利用の振り分け、
 * 認可コードの交換の前の検証、申し込みのトランザクションの受け渡しを確かめる。実 DB での動作は統合検証が確かめる。
 */

import { createHmac } from 'crypto';
import Provider, { errors } from 'oidc-provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  createOAuthStoreAdapterFactory,
  OAuthStoreError,
  withInteractionTransaction,
  type OAuthStoreAdapterDeps,
  type OAuthStoreDb,
} from '../../../oauth/store-adapter.js';

const HMAC_KEY = 'ab'.repeat(32);
const NOW = new Date('2026-11-24T00:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const GRACE_MS = 30_000;
const OLD_TOKEN = 'old-refresh-token-value';
const NEW_TOKEN = 'new-refresh-token-value';
const SUCCESSOR_TOKEN = 'successor-refresh-token-value';
const CLIENT_ID = 'client-1';
const SOURCE = { ipAddress: '198.51.100.7', userAgent: 'unit-agent' };

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

function fakeDb(rows: Map<string, Row>) {
  const db = {
    $queryRaw: vi.fn(async (_query: TemplateStringsArray, grantId: string) =>
      rows.has(`Grant:${grantId}`) ? [{ id: `Grant:${grantId}` }] : []
    ),
    $executeRaw: vi.fn(
      async (_query: TemplateStringsArray, newId: string, grantId: string, previous: string) => {
        let count = 0;
        for (const row of rows.values()) {
          const rotation = (row.payload as { rotation?: { successorId?: string } }).rotation;
          if (
            row.grantId === grantId &&
            row.kind === 'RefreshToken' &&
            rotation?.successorId === previous
          ) {
            rotation.successorId = newId;
            count += 1;
          }
        }
        return count;
      }
    ),
    $transaction: vi.fn(async (action: (tx: unknown) => Promise<unknown>) => action(db)),
    oAuthStoreRecord: {
      upsert: vi.fn(async ({ where, create, update }) => {
        const previous = rows.get(where.id as string);
        const next = previous ? { ...previous, ...update } : { consumedAt: null, ...create };
        rows.set(where.id as string, next as Row);
        return next;
      }),
      findUnique: vi.fn(async ({ where }) => rows.get(where.id as string) ?? null),
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async ({ where, data }) => {
        const row = rows.get(where.id as string);
        if (!row || row.consumedAt !== null) {
          return { count: 0 };
        }
        Object.assign(row, data);
        return { count: 1 };
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  return db;
}

function grantRow(grantId: string): Row {
  return {
    id: `Grant:${grantId}`,
    kind: 'Grant',
    grantId,
    uid: null,
    payload: { kind: 'Grant' },
    consumedAt: null,
    expiresAt: null,
  };
}

function refreshRow(
  value: string,
  overrides: Partial<Row> & { payload?: Record<string, unknown> } = {}
): Row {
  return {
    id: hmacId('RefreshToken', value),
    kind: 'RefreshToken',
    grantId: 'grant-1',
    uid: null,
    consumedAt: null,
    expiresAt: new Date(NOW.getTime() + 60_000),
    ...overrides,
    payload: {
      kind: 'RefreshToken',
      clientId: CLIENT_ID,
      grantId: 'grant-1',
      ...overrides.payload,
    },
  };
}

/** トークンの窓口の要求の文脈 */
function tokenContext(options: {
  grantType?: string;
  clientId?: string;
  rotatedJti?: string;
}): unknown {
  return {
    oidc: {
      route: 'token',
      params: { grant_type: options.grantType ?? 'refresh_token' },
      client: options.clientId === undefined ? undefined : { clientId: options.clientId },
      entities:
        options.rotatedJti === undefined
          ? {}
          : { RotatedRefreshToken: { jti: options.rotatedJti } },
    },
  };
}

function useContext(ctx: unknown): void {
  vi.spyOn(Provider, 'ctx', 'get').mockReturnValue(ctx as never);
}

describe('OAuthStoreAdapter の使用済みの値と置き換え', () => {
  let rows: Map<string, Row>;
  let db: ReturnType<typeof fakeDb>;
  let onGrantRevoked: ReturnType<typeof vi.fn<OAuthStoreAdapterDeps['onGrantRevoked']>>;
  let onRefreshGraceApplied: ReturnType<
    typeof vi.fn<OAuthStoreAdapterDeps['onRefreshGraceApplied']>
  >;
  let assertCodeExchangeRequest: ReturnType<
    typeof vi.fn<NonNullable<OAuthStoreAdapterDeps['assertCodeExchangeRequest']>>
  >;
  let factory: ReturnType<typeof createOAuthStoreAdapterFactory>;

  beforeEach(() => {
    rows = new Map([['Grant:grant-1', grantRow('grant-1')]]);
    db = fakeDb(rows);
    onGrantRevoked = vi.fn(async () => undefined);
    onRefreshGraceApplied = vi.fn(async () => undefined);
    assertCodeExchangeRequest = vi.fn();
    factory = createOAuthStoreAdapterFactory({
      prisma: db as unknown as OAuthStoreDb,
      tokenHmacKey: HMAC_KEY,
      onGrantRevoked,
      onRefreshGraceApplied,
      getRequestSource: () => SOURCE,
      assertCodeExchangeRequest,
      now: () => NOW,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const newPayload = { jti: NEW_TOKEN, kind: 'RefreshToken', grantId: 'grant-1' };

  describe('更新の要求での後継の保存', () => {
    it('未使用の置き換え元を後継と同じトランザクションで使用済みにし、後継を指す記録を残す', async () => {
      rows.set(hmacId('RefreshToken', OLD_TOKEN), refreshRow(OLD_TOKEN));
      useContext(tokenContext({ clientId: CLIENT_ID, rotatedJti: OLD_TOKEN }));

      await factory('RefreshToken').upsert(NEW_TOKEN, newPayload, 60);

      const old = rows.get(hmacId('RefreshToken', OLD_TOKEN)) as Row;
      expect(old.consumedAt).toEqual(NOW);
      expect(old.payload).toMatchObject({
        rotation: { replacedAt: NOW.getTime(), successorId: hmacId('RefreshToken', NEW_TOKEN) },
      });
      expect(rows.has(hmacId('RefreshToken', NEW_TOKEN))).toBe(true);
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        maxWait: 5_000,
        timeout: 10_000,
      });
      expect(onGrantRevoked).not.toHaveBeenCalled();
      expect(onRefreshGraceApplied).not.toHaveBeenCalled();
    });

    it('置き換え元の消費の競合に負けたら後継を保存せず、Grant を失効して invalid_grant', async () => {
      rows.set(hmacId('RefreshToken', OLD_TOKEN), refreshRow(OLD_TOKEN));
      db.oAuthStoreRecord.updateMany.mockResolvedValueOnce({ count: 0 });
      useContext(tokenContext({ clientId: CLIENT_ID, rotatedJti: OLD_TOKEN }));

      await expect(
        factory('RefreshToken').upsert(NEW_TOKEN, newPayload, 60)
      ).rejects.toBeInstanceOf(errors.InvalidGrant);

      expect(rows.has(hmacId('RefreshToken', NEW_TOKEN))).toBe(false);
      expect(onGrantRevoked).toHaveBeenCalledWith({
        grantId: 'grant-1',
        kind: 'refresh_token',
        ...SOURCE,
      });
    });

    it('猶予の内の使用済みの置き換え元は、未使用の後継を置き換えて新しいトークンへ付け替え、猶予を通知する', async () => {
      const successorId = hmacId('RefreshToken', SUCCESSOR_TOKEN);
      rows.set(
        hmacId('RefreshToken', OLD_TOKEN),
        refreshRow(OLD_TOKEN, {
          consumedAt: new Date(NOW.getTime() - 10_000),
          payload: { rotation: { replacedAt: NOW.getTime() - 10_000, successorId } },
        })
      );
      rows.set(successorId, refreshRow(SUCCESSOR_TOKEN));
      useContext(tokenContext({ clientId: CLIENT_ID, rotatedJti: OLD_TOKEN }));

      await factory('RefreshToken').upsert(NEW_TOKEN, newPayload, 60);

      const newId = hmacId('RefreshToken', NEW_TOKEN);
      expect(rows.has(newId)).toBe(true);
      expect(db.$executeRaw).toHaveBeenCalledTimes(1);
      expect(db.$executeRaw.mock.calls[0]?.slice(1)).toEqual([newId, 'grant-1', successorId]);
      // 置き換え元は新しいトークンを指し、後継は使用済みになって新しいトークンを指す
      expect(
        (rows.get(hmacId('RefreshToken', OLD_TOKEN))?.payload as { rotation: unknown }).rotation
      ).toEqual({ replacedAt: NOW.getTime() - 10_000, successorId: newId });
      const successor = rows.get(successorId) as Row;
      expect(successor.consumedAt).toEqual(NOW);
      expect(successor.payload).toMatchObject({
        rotation: { replacedAt: NOW.getTime(), successorId: newId },
      });
      expect(onRefreshGraceApplied).toHaveBeenCalledWith({ grantId: 'grant-1', ...SOURCE });
      expect(onGrantRevoked).not.toHaveBeenCalled();
    });

    it('送信元が無い猶予の通知は null を渡す', async () => {
      const successorId = hmacId('RefreshToken', SUCCESSOR_TOKEN);
      rows.set(
        hmacId('RefreshToken', OLD_TOKEN),
        refreshRow(OLD_TOKEN, {
          consumedAt: NOW,
          payload: { rotation: { replacedAt: NOW.getTime(), successorId } },
        })
      );
      rows.set(successorId, refreshRow(SUCCESSOR_TOKEN));
      useContext(tokenContext({ clientId: CLIENT_ID, rotatedJti: OLD_TOKEN }));
      const adapter = createOAuthStoreAdapterFactory({
        prisma: db as unknown as OAuthStoreDb,
        tokenHmacKey: HMAC_KEY,
        onGrantRevoked,
        onRefreshGraceApplied,
        getRequestSource: () => ({}),
        now: () => NOW,
      })('RefreshToken');

      await adapter.upsert(NEW_TOKEN, newPayload, 60);

      expect(onRefreshGraceApplied).toHaveBeenCalledWith({
        grantId: 'grant-1',
        ipAddress: null,
        userAgent: null,
      });
    });

    it.each([
      ['猶予の時間を過ぎた', -(GRACE_MS + 1), true],
      ['許す時計のずれより未来の', 5_001, true],
      ['後継が使用済みの', -1_000, false],
    ])(
      '%s置き換え元の再提示は再利用として失効し、後継を保存しない',
      async (_name, offsetMs, successorUnused) => {
        const successorId = hmacId('RefreshToken', SUCCESSOR_TOKEN);
        rows.set(
          hmacId('RefreshToken', OLD_TOKEN),
          refreshRow(OLD_TOKEN, {
            consumedAt: NOW,
            payload: { rotation: { replacedAt: NOW.getTime() + offsetMs, successorId } },
          })
        );
        rows.set(
          successorId,
          refreshRow(SUCCESSOR_TOKEN, { consumedAt: successorUnused ? null : NOW })
        );
        useContext(tokenContext({ clientId: CLIENT_ID, rotatedJti: OLD_TOKEN }));

        await expect(
          factory('RefreshToken').upsert(NEW_TOKEN, newPayload, 60)
        ).rejects.toBeInstanceOf(errors.InvalidGrant);

        expect(rows.has(hmacId('RefreshToken', NEW_TOKEN))).toBe(false);
        expect(db.$executeRaw).not.toHaveBeenCalled();
        expect(onGrantRevoked).toHaveBeenCalledWith(
          expect.objectContaining({ grantId: 'grant-1', kind: 'refresh_token' })
        );
        expect(onRefreshGraceApplied).not.toHaveBeenCalled();
      }
    );

    it('猶予の内でも後継の消費の競合に負けたら再利用として失効する', async () => {
      const successorId = hmacId('RefreshToken', SUCCESSOR_TOKEN);
      rows.set(
        hmacId('RefreshToken', OLD_TOKEN),
        refreshRow(OLD_TOKEN, {
          consumedAt: NOW,
          payload: { rotation: { replacedAt: NOW.getTime(), successorId } },
        })
      );
      rows.set(successorId, refreshRow(SUCCESSOR_TOKEN));
      db.oAuthStoreRecord.updateMany.mockResolvedValueOnce({ count: 0 });
      useContext(tokenContext({ clientId: CLIENT_ID, rotatedJti: OLD_TOKEN }));

      await expect(
        factory('RefreshToken').upsert(NEW_TOKEN, newPayload, 60)
      ).rejects.toBeInstanceOf(errors.InvalidGrant);

      expect(rows.has(hmacId('RefreshToken', NEW_TOKEN))).toBe(false);
      expect(onGrantRevoked).toHaveBeenCalledTimes(1);
      expect(onRefreshGraceApplied).not.toHaveBeenCalled();
    });

    it.each([
      ['置き換え元の行が無い', undefined],
      ['置き換え元が別の Grant の', 'grant-other'],
    ])('%sときは失効せず invalid_grant にする', async (_name, otherGrant) => {
      if (otherGrant !== undefined) {
        rows.set(hmacId('RefreshToken', OLD_TOKEN), refreshRow(OLD_TOKEN, { grantId: otherGrant }));
      }
      useContext(tokenContext({ clientId: CLIENT_ID, rotatedJti: OLD_TOKEN }));

      const error = await factory('RefreshToken')
        .upsert(NEW_TOKEN, newPayload, 60)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(errors.InvalidGrant);
      expect((error as Error & { error_detail?: string }).error_detail).toBe(
        'refresh token not found'
      );
      expect(rows.has(hmacId('RefreshToken', NEW_TOKEN))).toBe(false);
      expect(onGrantRevoked).not.toHaveBeenCalled();
    });

    it.each([
      ['置き換え元が保存する値そのもの', tokenContext({ rotatedJti: NEW_TOKEN })],
      [
        '認可コードの交換',
        tokenContext({ grantType: 'authorization_code', rotatedJti: OLD_TOKEN }),
      ],
      ['要求の文脈の外', undefined],
    ])('%sなら置き換えを行わず保存だけする', async (_name, ctx) => {
      rows.set(hmacId('RefreshToken', OLD_TOKEN), refreshRow(OLD_TOKEN));
      useContext(ctx);

      await factory('RefreshToken').upsert(NEW_TOKEN, newPayload, 60);

      expect(rows.has(hmacId('RefreshToken', NEW_TOKEN))).toBe(true);
      expect(rows.get(hmacId('RefreshToken', OLD_TOKEN))?.consumedAt).toBeNull();
      expect(db.oAuthStoreRecord.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('消費', () => {
    it('更新の要求のリフレッシュトークンはここで書き込まず、後継の保存に任せる', async () => {
      rows.set(hmacId('RefreshToken', OLD_TOKEN), refreshRow(OLD_TOKEN));
      useContext(tokenContext({ clientId: CLIENT_ID }));

      await factory('RefreshToken').consume(OLD_TOKEN);

      expect(rows.get(hmacId('RefreshToken', OLD_TOKEN))?.consumedAt).toBeNull();
      expect(db.oAuthStoreRecord.findUnique).not.toHaveBeenCalled();
      expect(db.oAuthStoreRecord.updateMany).not.toHaveBeenCalled();
    });

    it('トークンの窓口の認可コードは、消費の前に要求を検証してから使用済みにする', async () => {
      const ctx = tokenContext({ grantType: 'authorization_code', clientId: CLIENT_ID });
      const codeId = hmacId('AuthorizationCode', OLD_TOKEN);
      rows.set(codeId, { ...refreshRow(OLD_TOKEN), id: codeId, kind: 'AuthorizationCode' });
      useContext(ctx);

      await factory('AuthorizationCode').consume(OLD_TOKEN);

      expect(assertCodeExchangeRequest).toHaveBeenCalledWith(ctx);
      expect(rows.get(codeId)?.consumedAt).toEqual(NOW);
    });

    it('要求の検証が拒否したら認可コードを使用済みにせず、その拒否をそのまま返す', async () => {
      const codeId = hmacId('AuthorizationCode', OLD_TOKEN);
      rows.set(codeId, { ...refreshRow(OLD_TOKEN), id: codeId, kind: 'AuthorizationCode' });
      useContext(tokenContext({ grantType: 'authorization_code', clientId: CLIENT_ID }));
      assertCodeExchangeRequest.mockImplementation(() => {
        throw new errors.InvalidTarget();
      });

      await expect(factory('AuthorizationCode').consume(OLD_TOKEN)).rejects.toBeInstanceOf(
        errors.InvalidTarget
      );

      expect(rows.get(codeId)?.consumedAt).toBeNull();
      expect(onGrantRevoked).not.toHaveBeenCalled();
    });

    it('トークンの窓口の外の認可コードの消費では要求を検証しない', async () => {
      const codeId = hmacId('AuthorizationCode', OLD_TOKEN);
      rows.set(codeId, { ...refreshRow(OLD_TOKEN), id: codeId, kind: 'AuthorizationCode' });
      useContext({ oidc: { route: 'authorization', entities: {} } });

      await factory('AuthorizationCode').consume(OLD_TOKEN);

      expect(assertCodeExchangeRequest).not.toHaveBeenCalled();
      expect(rows.get(codeId)?.consumedAt).toEqual(NOW);
    });

    it('Grant の行が無い Grant のトークンは消費せず invalid_grant にする', async () => {
      rows.delete('Grant:grant-1');
      const codeId = hmacId('AuthorizationCode', OLD_TOKEN);
      rows.set(codeId, { ...refreshRow(OLD_TOKEN), id: codeId, kind: 'AuthorizationCode' });

      await expect(factory('AuthorizationCode').consume(OLD_TOKEN)).rejects.toBeInstanceOf(
        errors.InvalidGrant
      );

      expect(rows.get(codeId)?.consumedAt).toBeNull();
      expect(db.oAuthStoreRecord.updateMany).not.toHaveBeenCalled();
    });

    it('Grant の無いトークンが使用済みなら、失効を呼ばず invalid_grant にする', async () => {
      const codeId = hmacId('AuthorizationCode', OLD_TOKEN);
      rows.set(codeId, {
        ...refreshRow(OLD_TOKEN),
        id: codeId,
        kind: 'AuthorizationCode',
        grantId: null,
        consumedAt: NOW,
      });

      await expect(factory('AuthorizationCode').consume(OLD_TOKEN)).rejects.toBeInstanceOf(
        errors.InvalidGrant
      );

      expect(db.$transaction).not.toHaveBeenCalled();
      expect(onGrantRevoked).not.toHaveBeenCalled();
    });
  });

  describe('トークンの窓口での使用済みの値の読み出し', () => {
    it('猶予の内で後継が未使用なら、未使用の形で返し期限を猶予の終わりまで延ばす', async () => {
      const successorId = hmacId('RefreshToken', SUCCESSOR_TOKEN);
      const replacedAt = NOW.getTime() - 1_500;
      rows.set(
        hmacId('RefreshToken', OLD_TOKEN),
        refreshRow(OLD_TOKEN, {
          consumedAt: new Date(replacedAt),
          expiresAt: new Date(NOW.getTime() - 1),
          payload: { exp: NOW_SECONDS - 10, rotation: { replacedAt, successorId } },
        })
      );
      rows.set(successorId, refreshRow(SUCCESSOR_TOKEN));
      useContext(tokenContext({ clientId: CLIENT_ID }));

      const found = await factory('RefreshToken').find(OLD_TOKEN);

      expect(found).toEqual({
        kind: 'RefreshToken',
        clientId: CLIENT_ID,
        grantId: 'grant-1',
        jti: OLD_TOKEN,
        exp: Math.ceil((replacedAt + GRACE_MS) / 1000),
      });
      expect(onGrantRevoked).not.toHaveBeenCalled();
      // 行は変えない
      expect(db.oAuthStoreRecord.updateMany).not.toHaveBeenCalled();
    });

    it('猶予の終わりより遅い元の期限はそのまま返す', async () => {
      const successorId = hmacId('RefreshToken', SUCCESSOR_TOKEN);
      rows.set(
        hmacId('RefreshToken', OLD_TOKEN),
        refreshRow(OLD_TOKEN, {
          consumedAt: NOW,
          payload: {
            exp: NOW_SECONDS + 3_600,
            rotation: { replacedAt: NOW.getTime(), successorId },
          },
        })
      );
      rows.set(successorId, refreshRow(SUCCESSOR_TOKEN));
      useContext(tokenContext({ clientId: CLIENT_ID }));

      await expect(factory('RefreshToken').find(OLD_TOKEN)).resolves.toMatchObject({
        exp: NOW_SECONDS + 3_600,
      });
    });

    it('期限を持たない本体は期限を足さずに返す', async () => {
      const successorId = hmacId('RefreshToken', SUCCESSOR_TOKEN);
      rows.set(
        hmacId('RefreshToken', OLD_TOKEN),
        refreshRow(OLD_TOKEN, {
          consumedAt: NOW,
          payload: { rotation: { replacedAt: NOW.getTime(), successorId } },
        })
      );
      rows.set(successorId, refreshRow(SUCCESSOR_TOKEN));
      useContext(tokenContext({ clientId: CLIENT_ID }));

      const found = await factory('RefreshToken').find(OLD_TOKEN);

      expect(found).not.toHaveProperty('exp');
      expect(found).not.toHaveProperty('consumed');
    });

    it.each([
      ['後継が別の Grant', { grantId: 'grant-other' }],
      ['後継が使用済み', { consumedAt: NOW }],
    ])('%sなら再利用として失効し invalid_grant にする', async (_name, successorOverrides) => {
      const successorId = hmacId('RefreshToken', SUCCESSOR_TOKEN);
      rows.set(
        hmacId('RefreshToken', OLD_TOKEN),
        refreshRow(OLD_TOKEN, {
          consumedAt: NOW,
          payload: { rotation: { replacedAt: NOW.getTime(), successorId } },
        })
      );
      rows.set(successorId, refreshRow(SUCCESSOR_TOKEN, successorOverrides));
      useContext(tokenContext({ clientId: CLIENT_ID }));

      await expect(factory('RefreshToken').find(OLD_TOKEN)).rejects.toBeInstanceOf(
        errors.InvalidGrant
      );

      expect(onGrantRevoked).toHaveBeenCalledWith({
        grantId: 'grant-1',
        kind: 'refresh_token',
        ...SOURCE,
      });
    });

    it('置き換えの記録が無い使用済みのリフレッシュトークンは再利用として失効する', async () => {
      rows.set(hmacId('RefreshToken', OLD_TOKEN), refreshRow(OLD_TOKEN, { consumedAt: NOW }));
      useContext(tokenContext({ clientId: CLIENT_ID }));

      await expect(factory('RefreshToken').find(OLD_TOKEN)).rejects.toBeInstanceOf(
        errors.InvalidGrant
      );

      expect(onGrantRevoked).toHaveBeenCalledTimes(1);
    });

    it('ロックの時点で Grant の行が無ければ猶予を判定せず失効する', async () => {
      const successorId = hmacId('RefreshToken', SUCCESSOR_TOKEN);
      rows.set(
        hmacId('RefreshToken', OLD_TOKEN),
        refreshRow(OLD_TOKEN, {
          consumedAt: NOW,
          payload: { rotation: { replacedAt: NOW.getTime(), successorId } },
        })
      );
      rows.set(successorId, refreshRow(SUCCESSOR_TOKEN));
      rows.delete('Grant:grant-1');
      useContext(tokenContext({ clientId: CLIENT_ID }));

      await expect(factory('RefreshToken').find(OLD_TOKEN)).rejects.toBeInstanceOf(
        errors.InvalidGrant
      );

      expect(db.oAuthStoreRecord.findUnique).toHaveBeenCalledTimes(1);
      expect(onGrantRevoked).toHaveBeenCalledTimes(1);
    });

    it('持ち主のアプリが提示した使用済みの認可コードは、猶予なしで失効し invalid_grant にする', async () => {
      const codeId = hmacId('AuthorizationCode', OLD_TOKEN);
      rows.set(codeId, {
        ...refreshRow(OLD_TOKEN, { consumedAt: NOW }),
        id: codeId,
        kind: 'AuthorizationCode',
      });
      useContext(tokenContext({ grantType: 'authorization_code', clientId: CLIENT_ID }));

      await expect(factory('AuthorizationCode').find(OLD_TOKEN)).rejects.toBeInstanceOf(
        errors.InvalidGrant
      );

      expect(db.$transaction).not.toHaveBeenCalled();
      expect(onGrantRevoked).toHaveBeenCalledWith({
        grantId: 'grant-1',
        kind: 'authorization_code',
        ...SOURCE,
      });
    });

    it('Grant に属さない使用済みの値は失効を呼ばず invalid_grant にする', async () => {
      rows.set(
        hmacId('RefreshToken', OLD_TOKEN),
        refreshRow(OLD_TOKEN, { grantId: null, consumedAt: NOW })
      );
      useContext(tokenContext({ clientId: CLIENT_ID }));

      await expect(factory('RefreshToken').find(OLD_TOKEN)).rejects.toBeInstanceOf(
        errors.InvalidGrant
      );

      expect(onGrantRevoked).not.toHaveBeenCalled();
    });

    it.each([
      ['別のアプリの提示', tokenContext({ clientId: 'client-other' })],
      ['クライアント認証の前', tokenContext({})],
      ['トークンの窓口の外', { oidc: { route: 'authorization', client: { clientId: CLIENT_ID } } }],
    ])('%sでは猶予にも失効にも進まず、使用済みの形で返す', async (_name, ctx) => {
      rows.set(hmacId('RefreshToken', OLD_TOKEN), refreshRow(OLD_TOKEN, { consumedAt: NOW }));
      useContext(ctx);

      await expect(factory('RefreshToken').find(OLD_TOKEN)).resolves.toMatchObject({
        jti: OLD_TOKEN,
        consumed: NOW_SECONDS,
      });

      expect(onGrantRevoked).not.toHaveBeenCalled();
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('HMAC にしない種別の使用済みの行は持ち主の判定をせずに返す', async () => {
      rows.set('Interaction:i-1', {
        id: 'Interaction:i-1',
        kind: 'Interaction',
        grantId: 'grant-1',
        uid: null,
        payload: { kind: 'Interaction', clientId: CLIENT_ID },
        consumedAt: NOW,
        expiresAt: null,
      });
      useContext(tokenContext({ clientId: CLIENT_ID }));

      await expect(factory('Interaction').find('i-1')).resolves.toEqual({
        kind: 'Interaction',
        clientId: CLIENT_ID,
        consumed: NOW_SECONDS,
      });
      expect(onGrantRevoked).not.toHaveBeenCalled();
    });
  });

  describe('Session の uid による読み出し', () => {
    it('種別と uid と期限で絞り、無ければ undefined を返す', async () => {
      await expect(factory('Session').findByUid('uid-missing')).resolves.toBeUndefined();

      expect(db.oAuthStoreRecord.findFirst).toHaveBeenCalledWith({
        where: {
          kind: 'Session',
          uid: 'uid-missing',
          OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }],
        },
        orderBy: { id: 'asc' },
      });
    });
  });

  describe('保存の失敗の符号', () => {
    it('Prisma の形でない符号は引き継がない', async () => {
      db.oAuthStoreRecord.findUnique.mockRejectedValueOnce(
        Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
      );

      const error = (await factory('AccessToken')
        .find(OLD_TOKEN)
        .catch((caught: unknown) => caught)) as OAuthStoreError;

      expect(error).toBeInstanceOf(OAuthStoreError);
      expect(error.message).toContain('find');
      expect(error.code).toBeUndefined();
    });

    it('Error でない値の失敗も保存の失敗にする', async () => {
      db.oAuthStoreRecord.deleteMany.mockRejectedValueOnce(null);

      const error = (await factory('AccessToken')
        .destroy(OLD_TOKEN)
        .catch((caught: unknown) => caught)) as OAuthStoreError;

      expect(error).toBeInstanceOf(OAuthStoreError);
      expect(error.message).toContain('destroy');
      expect(error.code).toBeUndefined();
    });
  });
});

describe('withInteractionTransaction', () => {
  let rows: Map<string, Row>;
  let db: ReturnType<typeof fakeDb>;
  let txRows: Map<string, Row>;
  let tx: ReturnType<typeof fakeDb>;
  let factory: ReturnType<typeof createOAuthStoreAdapterFactory>;

  beforeEach(() => {
    rows = new Map();
    db = fakeDb(rows);
    txRows = new Map();
    tx = fakeDb(txRows);
    factory = createOAuthStoreAdapterFactory({
      prisma: db as unknown as OAuthStoreDb,
      tokenHmacKey: HMAC_KEY,
      onGrantRevoked: async () => undefined,
      onRefreshGraceApplied: async () => undefined,
      getRequestSource: () => ({}),
      now: () => NOW,
    });
  });

  it('文脈の中の Interaction の読み書きだけを呼び出し元のトランザクションで行い、結果を返す', async () => {
    const interaction = factory('Interaction');
    const session = factory('Session');

    const result = await withInteractionTransaction(
      tx as unknown as Prisma.TransactionClient,
      async () => {
        await interaction.upsert('i-1', { jti: 'i-1', kind: 'Interaction' }, 60);
        await session.upsert('s-1', { jti: 's-1', kind: 'Session', uid: 'u-1' }, 60);
        return interaction.find('i-1');
      }
    );

    expect(result).toEqual({ jti: 'i-1', kind: 'Interaction' });
    expect(txRows.has('Interaction:i-1')).toBe(true);
    expect(rows.has('Interaction:i-1')).toBe(false);
    // 他のモデルの経路は変えない
    expect(rows.has('Session:s-1')).toBe(true);
    expect(txRows.has('Session:s-1')).toBe(false);
  });

  it('文脈の外の Interaction は通常の接続で読み書きする', async () => {
    await factory('Interaction').upsert('i-1', { jti: 'i-1', kind: 'Interaction' }, 60);

    expect(rows.has('Interaction:i-1')).toBe(true);
    expect(tx.oAuthStoreRecord.upsert).not.toHaveBeenCalled();
  });

  it('終了の後に残った処理は終わったトランザクションを使わず失敗する', async () => {
    const interaction = factory('Interaction');
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let leftover: Promise<unknown> | undefined;

    await withInteractionTransaction(tx as unknown as Prisma.TransactionClient, async () => {
      leftover = gate.then(() => interaction.find('i-1'));
    });
    release();

    const error = await (leftover as Promise<unknown>).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OAuthStoreError);
    expect((error as Error).message).toContain('interaction transaction ended');
    expect(tx.oAuthStoreRecord.findUnique).not.toHaveBeenCalled();
    expect(db.oAuthStoreRecord.findUnique).not.toHaveBeenCalled();
  });

  it('処理の例外はそのまま呼び出し元へ伝える', async () => {
    const failure = new Error('consent failed');

    await expect(
      withInteractionTransaction(tx as unknown as Prisma.TransactionClient, async () => {
        throw failure;
      })
    ).rejects.toBe(failure);
  });
});
