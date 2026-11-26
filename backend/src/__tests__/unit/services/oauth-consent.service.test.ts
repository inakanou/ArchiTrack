/**
 * @fileoverview 外部アプリの接続の同意の手続き（ConsentInteractionService）の単体検証
 *
 * 申し込みの確認、失効の世代の結び付け、同意専用の 2FA の通過の印、同意、拒否を、
 * 認可サーバー・DB・Redis・2FA の検証・接続の記録を全て差し替えて確かめる。
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type Redis from 'ioredis';
import type Provider from 'oidc-provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { AllowedExternalApp } from '../../../oauth/client-registry.js';
import type { ConnectionAuditEvent } from '../../../oauth/oauth.types.js';
import { ConnectionRevocationConflictError } from '../../../services/external-app-connection.service.js';
import {
  CONSENT_PASS_TTL_SECONDS,
  ConsentInteractionService,
  consentPassKey,
  type InteractionContext,
} from '../../../services/oauth-consent.service.js';
import logger from '../../../utils/logger.js';

vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const NOW_MS = Date.UTC(2026, 10, 25, 0, 0, 0);
const NOW_SECONDS = Math.floor(NOW_MS / 1000);
const UID = 'uid-1';
const USER_ID = 'user-1';
const CLIENT_ID = 'client-1';
const RESOURCE_URL = 'https://architrack.example/mcp';
const REDIRECT_TO = 'https://auth.example/auth/uid-1';
const GENERATION_KEY = `oauth:consent:generation:${UID}:${USER_ID}`;
const PASS_KEY = `oauth:consent:2fa-pass:${UID}:${USER_ID}`;
const FINISH_KEY = `oauth:consent:finish:${UID}`;

interface FakeInteraction {
  uid: string;
  prompt: { name: string };
  params: Record<string, unknown>;
  exp: number;
  result?: unknown;
  session?: { accountId?: string };
}

interface FakeUser {
  id: string;
  displayName: string;
  email: string;
  externalAppRevocationGeneration: number;
  isActive: boolean;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
}

interface FakePermission {
  resource: string;
  action: string;
}

/** 生成された Grant の記録 */
interface FakeGrantRecord {
  init: { accountId: string; clientId: string };
  addResourceScope: ReturnType<typeof vi.fn>;
  rejectResourceScope: ReturnType<typeof vi.fn>;
  addOIDCScope: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function createFakeRedis() {
  const store = new Map<string, string>();
  const redis = {
    status: 'ready',
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(key)) {
        return null;
      }
      store.set(key, value);
      return 'OK';
    }),
    getdel: vi.fn(async (key: string) => {
      const value = store.get(key) ?? null;
      store.delete(key);
      return value;
    }),
    exists: vi.fn(async (key: string) => (store.has(key) ? 1 : 0)),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
  };
  return redis;
}

type FakeRedis = ReturnType<typeof createFakeRedis>;

function buildHarness() {
  const interaction: FakeInteraction = {
    uid: UID,
    prompt: { name: 'login' },
    params: {
      client_id: CLIENT_ID,
      scope: 'offline_access read write',
      redirect_uri: 'https://app.example/callback',
    },
    exp: NOW_SECONDS + 600,
  };
  const state: {
    user: FakeUser | null;
    permissions: FakePermission[];
    interaction: FakeInteraction;
  } = {
    user: {
      id: USER_ID,
      displayName: '山田 太郎',
      email: 'yamada@example.com',
      externalAppRevocationGeneration: 3,
      isActive: true,
      mustChangePassword: false,
      twoFactorEnabled: true,
    },
    permissions: [{ resource: 'external_app', action: 'connect' }],
    interaction,
  };

  const findUnique = vi.fn(
    async (args: { where: { id: string }; select: Record<string, true> }) => {
      const user = state.user;
      if (!user || args.where.id !== user.id) {
        return null;
      }
      const picked: Record<string, unknown> = {};
      for (const key of Object.keys(args.select)) {
        picked[key] = user[key as keyof FakeUser];
      }
      return picked;
    }
  );
  const findMany = vi.fn(async () => [
    {
      role: {
        rolePermissions: state.permissions.map((permission) => ({ permission })),
      },
    },
  ]);
  const tx = { marker: 'tx' };
  const $transaction = vi.fn(
    async (run: (client: unknown) => Promise<unknown>, _options?: unknown) => run(tx)
  );
  const prisma = {
    user: { findUnique },
    userRole: { findMany },
    $transaction,
  };

  const grants: FakeGrantRecord[] = [];
  class FakeGrant {
    addResourceScope = vi.fn();
    rejectResourceScope = vi.fn();
    addOIDCScope = vi.fn();
    save = vi.fn(async () => 'grant-1');
    destroy = vi.fn(async () => undefined);
    constructor(init: { accountId: string; clientId: string }) {
      grants.push({
        init,
        addResourceScope: this.addResourceScope,
        rejectResourceScope: this.rejectResourceScope,
        addOIDCScope: this.addOIDCScope,
        save: this.save,
        destroy: this.destroy,
      });
    }
  }
  const provider = {
    interactionDetails: vi.fn(async () => state.interaction),
    interactionResult: vi.fn(async () => REDIRECT_TO),
    Grant: FakeGrant,
  };

  const connectionService = {
    createOrReplace: vi.fn(async () => undefined),
    recordEvent: vi.fn(async () => undefined),
  };
  const secondFactorVerifier = {
    verify: vi.fn(async () => ({ ok: true as const, value: undefined })),
  };
  const client: AllowedExternalApp = {
    clientId: CLIENT_ID,
    clientSecret: 'secret',
    displayName: 'テスト用アプリ',
    redirectUris: ['https://app.example/callback'],
    tokenEndpointAuthMethod: 'client_secret_post',
  };
  const clientRegistry = { loadAllowedClients: vi.fn(() => [client]) };

  const redis = createFakeRedis();
  const getRedis = vi.fn((): FakeRedis | null => redis);

  const service = new ConsentInteractionService({
    prisma: prisma as unknown as PrismaClient,
    provider: provider as unknown as Provider,
    connectionService: connectionService as never,
    secondFactorVerifier: secondFactorVerifier as never,
    clientRegistry,
    resourceUrl: RESOURCE_URL,
    getRedis: getRedis as unknown as () => Redis | null,
  });

  const ctx: InteractionContext = {
    req: {} as IncomingMessage,
    res: {} as ServerResponse,
    uid: UID,
    source: { ipAddress: '203.0.113.5', userAgent: 'UnitAgent/1.0' },
  };

  return {
    state,
    prisma,
    tx,
    provider,
    grants,
    connectionService,
    secondFactorVerifier,
    clientRegistry,
    redis,
    getRedis,
    service,
    ctx,
  };
}

type Harness = ReturnType<typeof buildHarness>;

/** 最初に作られた Grant。作られていなければ失敗させる */
function firstGrant(harness: Harness): FakeGrantRecord {
  const grant = harness.grants[0];
  if (!grant) {
    throw new Error('Grant が作られていません');
  }
  return grant;
}

/** findUnique の呼び出しのうち、指定した列を読んだものの数 */
function findUniqueCallsSelecting(h: Harness, column: string): number {
  return h.prisma.user.findUnique.mock.calls.filter(([args]) => column in args.select).length;
}

describe('ConsentInteractionService', () => {
  let h: Harness;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS);
    vi.clearAllMocks();
    h = buildHarness();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('consentPassKey', () => {
    it('申し込みと利用者を含む、ログインの資格と別の鍵を返す', () => {
      expect(consentPassKey('u-9', 'user-9')).toBe('oauth:consent:2fa-pass:u-9:user-9');
      expect(consentPassKey('u-9', 'user-9')).not.toContain('2fa:challenge:');
    });
  });

  describe('getInteraction', () => {
    it('申し込みの内容を返し、失効の世代を申し込みの期限まで NX で結び付ける', async () => {
      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result).toEqual({
        ok: true,
        value: {
          appName: 'テスト用アプリ',
          redirectHost: 'app.example',
          account: { displayName: '山田 太郎', email: 'yamada@example.com' },
          requestedScopes: ['read', 'write'],
          idleDays: 30,
          absoluteDays: 90,
          secondFactorVerified: false,
        },
      });
      expect(h.redis.set).toHaveBeenCalledWith(GENERATION_KEY, '3', 'EX', 600, 'NX');
      expect(h.redis.store.get(GENERATION_KEY)).toBe('3');
      expect(h.redis.exists).toHaveBeenCalledWith(PASS_KEY);
    });

    it('通過の印があれば secondFactorVerified を true で返す', async () => {
      h.redis.store.set(PASS_KEY, '3');

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result.ok && result.value.secondFactorVerified).toBe(true);
    });

    it('結び付けた世代があれば DB の世代を読まず、新しい世代へ変えない', async () => {
      h.redis.store.set(GENERATION_KEY, '1');
      h.state.user!.externalAppRevocationGeneration = 5;

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result.ok).toBe(true);
      expect(findUniqueCallsSelecting(h, 'externalAppRevocationGeneration')).toBe(0);
      expect(h.redis.set).not.toHaveBeenCalled();
      expect(h.redis.store.get(GENERATION_KEY)).toBe('1');
    });

    it('期限が過ぎかけている申し込みでも世代の TTL を 1 秒以上にする', async () => {
      h.state.interaction.exp = NOW_SECONDS + 1;
      vi.setSystemTime(NOW_MS + 999);

      await h.service.getInteraction(h.ctx, USER_ID);

      expect(h.redis.set).toHaveBeenCalledWith(GENERATION_KEY, '3', 'EX', 1, 'NX');
    });

    it('同時の結び付けに負けたら先に結び付いた世代を使う', async () => {
      h.redis.set.mockImplementationOnce(async (key: string) => {
        h.redis.store.set(key, '2');
        return null;
      });

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result.ok).toBe(true);
      expect(h.redis.get).toHaveBeenCalledTimes(2);
      expect(h.redis.store.get(GENERATION_KEY)).toBe('2');
    });

    it('同時の結び付けに負け、読み直した値が世代として読めなければ INTERACTION_NOT_FOUND', async () => {
      h.redis.set.mockImplementationOnce(async (key: string) => {
        h.redis.store.set(key, 'not-a-number');
        return null;
      });

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'INTERACTION_NOT_FOUND' } });
      expect(h.prisma.userRole.findMany).not.toHaveBeenCalled();
    });

    it('世代を結び付ける時点で利用者がいなければ INTERACTION_NOT_FOUND で、権限を確かめない', async () => {
      h.state.user = null;

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'INTERACTION_NOT_FOUND' } });
      expect(h.redis.set).not.toHaveBeenCalled();
      expect(h.prisma.userRole.findMany).not.toHaveBeenCalled();
    });

    it('手続きの Cookie が無い（SessionNotFound）なら INTERACTION_NOT_FOUND', async () => {
      const error = new Error('interaction session not found');
      error.name = 'SessionNotFound';
      h.provider.interactionDetails.mockRejectedValueOnce(error);

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'INTERACTION_NOT_FOUND' } });
      expect(h.redis.get).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('申し込みの読み取りがほかの理由で失敗したら SERVICE_UNAVAILABLE で、例外の名前だけを記録する', async () => {
      const error = new TypeError('code=SECRET-VALUE');
      h.provider.interactionDetails.mockRejectedValueOnce(error);

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'SERVICE_UNAVAILABLE' } });
      expect(logger.error).toHaveBeenCalledWith(
        { errorName: 'TypeError', operation: 'getInteraction' },
        'OAuth consent operation failed'
      );
      expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('SECRET-VALUE');
    });

    it('Error でない値が投げられたら名前を unknown として記録する', async () => {
      h.provider.interactionDetails.mockRejectedValueOnce('boom');

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'SERVICE_UNAVAILABLE' } });
      expect(logger.error).toHaveBeenCalledWith(
        { errorName: 'unknown', operation: 'getInteraction' },
        'OAuth consent operation failed'
      );
    });

    it.each<[string, (interaction: FakeInteraction) => void]>([
      ['URL の uid が手続きの申し込みと違う', (i) => (i.uid = 'other-uid')],
      ['申し込みに結果が書き込み済み', (i) => (i.result = { login: { accountId: USER_ID } })],
      ['申し込みの期限が切れている', (i) => (i.exp = NOW_SECONDS)],
      ['prompt が login でも consent でもない', (i) => (i.prompt = { name: 'select_account' })],
      ['セッションの利用者が別人', (i) => (i.session = { accountId: 'someone-else' })],
      ['許可されていないアプリ', (i) => (i.params = { ...i.params, client_id: 'unknown-client' })],
    ])('%s なら INTERACTION_NOT_FOUND で、Redis に触れない', async (_label, mutate) => {
      mutate(h.state.interaction);

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'INTERACTION_NOT_FOUND' } });
      expect(h.getRedis).not.toHaveBeenCalled();
      expect(h.prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('prompt が consent で、セッションの利用者が本人なら扱う', async () => {
      h.state.interaction.prompt = { name: 'consent' };
      h.state.interaction.session = { accountId: USER_ID };

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result.ok).toBe(true);
    });

    it.each<[string, (harness: Harness) => void, unknown]>([
      ['利用者が無効', (x) => (x.state.user!.isActive = false), { type: 'PERMISSION_REQUIRED' }],
      [
        '接続の権限が無い',
        (x) => (x.state.permissions = [{ resource: 'project', action: 'read' }]),
        { type: 'PERMISSION_REQUIRED' },
      ],
      [
        'パスワードの変更を求められている',
        (x) => (x.state.user!.mustChangePassword = true),
        { type: 'ACCOUNT_RESTRICTED', restriction: 'PASSWORD_CHANGE_REQUIRED' },
      ],
      [
        '2FA が未登録',
        (x) => (x.state.user!.twoFactorEnabled = false),
        { type: 'ACCOUNT_RESTRICTED', restriction: 'TWO_FACTOR_SETUP_REQUIRED' },
      ],
    ])('%s なら拒み、世代は先に結び付けておく', async (_label, mutate, expected) => {
      mutate(h);

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: expected });
      expect(h.redis.store.get(GENERATION_KEY)).toBe('3');
      expect(h.redis.exists).not.toHaveBeenCalled();
    });

    it('利用者の行が状態の確認の時点で消えていれば PERMISSION_REQUIRED', async () => {
      h.redis.store.set(GENERATION_KEY, '3');
      h.state.user = null;

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'PERMISSION_REQUIRED' } });
      expect(h.prisma.userRole.findMany).not.toHaveBeenCalled();
    });

    it.each([
      [{ resource: '*', action: '*' }],
      [{ resource: '*', action: 'connect' }],
      [{ resource: 'external_app', action: '*' }],
    ])('ワイルドカードの権限 %o でも接続を許す', async (permission) => {
      h.state.permissions = [permission];

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result.ok).toBe(true);
    });

    it('要求に read が無ければ READ_SCOPE_REQUIRED', async () => {
      h.state.interaction.params = { ...h.state.interaction.params, scope: 'offline_access write' };

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'READ_SCOPE_REQUIRED' } });
      expect(h.redis.exists).not.toHaveBeenCalled();
    });

    it('要求の scope が文字列でなければ範囲なしとして READ_SCOPE_REQUIRED', async () => {
      h.state.interaction.params = { ...h.state.interaction.params, scope: undefined };

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'READ_SCOPE_REQUIRED' } });
    });

    it('表示用の利用者の行が読めなければ INTERACTION_NOT_FOUND', async () => {
      const original = h.prisma.user.findUnique.getMockImplementation()!;
      h.prisma.user.findUnique.mockImplementation(async (args) =>
        'displayName' in args.select ? null : original(args)
      );

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'INTERACTION_NOT_FOUND' } });
      expect(h.redis.exists).not.toHaveBeenCalled();
    });

    it('Redis が無ければ SERVICE_UNAVAILABLE で、DB を読まない', async () => {
      h.getRedis.mockReturnValue(null);

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'SERVICE_UNAVAILABLE' } });
      expect(h.prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('Redis が ready でなければ SERVICE_UNAVAILABLE', async () => {
      h.redis.status = 'reconnecting';

      const result = await h.service.getInteraction(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'SERVICE_UNAVAILABLE' } });
      expect(h.redis.get).not.toHaveBeenCalled();
    });
  });

  describe('verifySecondFactor', () => {
    const code = { type: 'totp', code: '123456' } as const;

    beforeEach(() => {
      h.redis.store.set(GENERATION_KEY, '3');
    });

    it('検証に通れば結び付けた世代を値に、5 分の通過の印を記録する', async () => {
      const result = await h.service.verifySecondFactor(h.ctx, USER_ID, code);

      expect(result).toEqual({ ok: true, value: undefined });
      expect(h.secondFactorVerifier.verify).toHaveBeenCalledWith(
        USER_ID,
        code,
        'oauth_consent',
        h.ctx.source
      );
      expect(CONSENT_PASS_TTL_SECONDS).toBe(300);
      expect(h.redis.set).toHaveBeenCalledWith(PASS_KEY, '3', 'EX', 300);
      expect(h.redis.store.get(PASS_KEY)).toBe('3');
    });

    it('要求の送信元が無ければ空の文脈で検証する', async () => {
      const { source: _source, ...withoutSource } = h.ctx;

      const result = await h.service.verifySecondFactor(withoutSource, USER_ID, code);

      expect(result.ok).toBe(true);
      expect(h.secondFactorVerifier.verify).toHaveBeenCalledWith(
        USER_ID,
        code,
        'oauth_consent',
        {}
      );
    });

    it('申し込みが扱えなければ INTERACTION_NOT_FOUND で、検証しない', async () => {
      h.state.interaction.uid = 'other';

      const result = await h.service.verifySecondFactor(h.ctx, USER_ID, code);

      expect(result).toEqual({ ok: false, error: { type: 'INTERACTION_NOT_FOUND' } });
      expect(h.secondFactorVerifier.verify).not.toHaveBeenCalled();
    });

    it.each([[null], ['abc'], ['01']])(
      '結び付けた世代が %s なら RECONNECT_REQUIRED で、コードを照合しない',
      async (stored) => {
        if (stored === null) {
          h.redis.store.delete(GENERATION_KEY);
        } else {
          h.redis.store.set(GENERATION_KEY, stored);
        }

        const result = await h.service.verifySecondFactor(h.ctx, USER_ID, code);

        expect(result).toEqual({ ok: false, error: { type: 'RECONNECT_REQUIRED' } });
        expect(h.secondFactorVerifier.verify).not.toHaveBeenCalled();
        expect(h.prisma.user.findUnique).not.toHaveBeenCalled();
      }
    );

    it('世代の鍵を新しく結び付けない', async () => {
      h.redis.store.delete(GENERATION_KEY);

      await h.service.verifySecondFactor(h.ctx, USER_ID, code);

      expect(h.redis.set).not.toHaveBeenCalled();
    });

    it('2FA 未登録の利用者は状態の確認で止まり、検証に届かない', async () => {
      h.state.user!.twoFactorEnabled = false;

      const result = await h.service.verifySecondFactor(h.ctx, USER_ID, code);

      expect(result).toEqual({
        ok: false,
        error: { type: 'ACCOUNT_RESTRICTED', restriction: 'TWO_FACTOR_SETUP_REQUIRED' },
      });
      expect(h.secondFactorVerifier.verify).not.toHaveBeenCalled();
    });

    it('権限が無ければ PERMISSION_REQUIRED で、検証しない', async () => {
      h.state.permissions = [];

      const result = await h.service.verifySecondFactor(h.ctx, USER_ID, code);

      expect(result).toEqual({ ok: false, error: { type: 'PERMISSION_REQUIRED' } });
      expect(h.secondFactorVerifier.verify).not.toHaveBeenCalled();
    });

    it('要求に read が無ければ READ_SCOPE_REQUIRED で、検証しない', async () => {
      h.state.interaction.params = { ...h.state.interaction.params, scope: 'write' };

      const result = await h.service.verifySecondFactor(h.ctx, USER_ID, code);

      expect(result).toEqual({ ok: false, error: { type: 'READ_SCOPE_REQUIRED' } });
      expect(h.secondFactorVerifier.verify).not.toHaveBeenCalled();
    });

    it('コードが違えば SECOND_FACTOR_FAILED で、通過の印を記録しない', async () => {
      h.secondFactorVerifier.verify.mockResolvedValueOnce({
        ok: false,
        error: { type: 'INVALID_CODE' },
      } as never);

      const result = await h.service.verifySecondFactor(h.ctx, USER_ID, code);

      expect(result).toEqual({ ok: false, error: { type: 'SECOND_FACTOR_FAILED' } });
      expect(h.redis.set).not.toHaveBeenCalled();
      expect(h.redis.store.has(PASS_KEY)).toBe(false);
    });

    it('ロック中なら SECOND_FACTOR_LOCKED と解除の時刻を返し、通過の印を記録しない', async () => {
      const unlockAt = new Date(NOW_MS + 15 * 60 * 1000);
      h.secondFactorVerifier.verify.mockResolvedValueOnce({
        ok: false,
        error: { type: 'ACCOUNT_LOCKED', unlockAt },
      } as never);

      const result = await h.service.verifySecondFactor(h.ctx, USER_ID, code);

      expect(result).toEqual({ ok: false, error: { type: 'SECOND_FACTOR_LOCKED', unlockAt } });
      expect(h.redis.set).not.toHaveBeenCalled();
    });

    it('Redis が ready でなければ SERVICE_UNAVAILABLE で、コードを使用済みにしない', async () => {
      h.redis.status = 'end';

      const result = await h.service.verifySecondFactor(h.ctx, USER_ID, code);

      expect(result).toEqual({ ok: false, error: { type: 'SERVICE_UNAVAILABLE' } });
      expect(h.secondFactorVerifier.verify).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        { errorName: 'Error', operation: 'verifySecondFactor' },
        'OAuth consent operation failed'
      );
    });

    it('検証の途中で Redis が使えなくなれば SERVICE_UNAVAILABLE で、印を記録しない', async () => {
      h.getRedis
        .mockReturnValueOnce(h.redis)
        .mockReturnValueOnce(null as never)
        .mockReturnValue(h.redis);

      const result = await h.service.verifySecondFactor(h.ctx, USER_ID, code);

      expect(result).toEqual({ ok: false, error: { type: 'SERVICE_UNAVAILABLE' } });
      expect(h.secondFactorVerifier.verify).not.toHaveBeenCalled();
      expect(h.redis.set).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    beforeEach(() => {
      h.redis.store.set(GENERATION_KEY, '3');
      h.redis.store.set(PASS_KEY, '3');
    });

    it('Grant を保存し、接続・監査・申し込みの結果を 1 つのトランザクションで確定する', async () => {
      const result = await h.service.approve(h.ctx, USER_ID, ['read']);

      expect(result).toEqual({ ok: true, value: { redirectTo: REDIRECT_TO } });

      // 通過の印は 1 回だけ消費し、申し込みの終わりを占有する
      expect(h.redis.getdel).toHaveBeenCalledWith(PASS_KEY);
      expect(h.redis.store.has(PASS_KEY)).toBe(false);
      expect(h.redis.set).toHaveBeenCalledWith(FINISH_KEY, '1', 'EX', 600, 'NX');
      expect(h.redis.store.get(FINISH_KEY)).toBe('1');

      // Grant は同意した範囲だけをリソースに付け、選ばなかった範囲を拒む
      expect(h.grants).toHaveLength(1);
      const grant = firstGrant(h);
      expect(grant.init).toEqual({ accountId: USER_ID, clientId: CLIENT_ID });
      expect(grant.addResourceScope).toHaveBeenCalledWith(RESOURCE_URL, 'read');
      expect(grant.rejectResourceScope).toHaveBeenCalledWith(RESOURCE_URL, 'write');
      expect(grant.addOIDCScope).toHaveBeenCalledWith('offline_access');
      expect(grant.save).toHaveBeenCalledTimes(1);
      expect(grant.destroy).not.toHaveBeenCalled();

      expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'ReadCommitted',
      });
      expect(h.connectionService.createOrReplace).toHaveBeenCalledWith(
        {
          userId: USER_ID,
          clientId: CLIENT_ID,
          grantId: 'grant-1',
          scopes: ['read'],
          consentedAt: new Date(NOW_MS),
          expectedRevocationGeneration: 3,
          source: h.ctx.source,
        },
        h.tx
      );
      const event: ConnectionAuditEvent = {
        kind: 'CONSENT_GRANTED',
        actorUserId: USER_ID,
        targetUserId: USER_ID,
        clientId: CLIENT_ID,
        scopes: ['read'],
        reason: null,
        occurredAt: new Date(NOW_MS),
        ipAddress: '203.0.113.5',
        userAgent: 'UnitAgent/1.0',
      };
      expect(h.connectionService.recordEvent).toHaveBeenCalledWith(event, h.tx);
      expect(h.provider.interactionResult).toHaveBeenCalledWith(h.ctx.req, h.ctx.res, {
        login: { accountId: USER_ID },
        consent: { grantId: 'grant-1' },
      });
    });

    it('期待する失効の世代は通過の印の値を使う', async () => {
      h.redis.store.set(PASS_KEY, '7');

      await h.service.approve(h.ctx, USER_ID, ['read', 'write']);

      expect(h.connectionService.createOrReplace).toHaveBeenCalledWith(
        expect.objectContaining({ expectedRevocationGeneration: 7, scopes: ['read', 'write'] }),
        h.tx
      );
    });

    it('要求の範囲を全て選び offline_access も無ければ、拒む範囲も OIDC の範囲も付けない', async () => {
      h.state.interaction.params = { ...h.state.interaction.params, scope: 'read write' };

      const result = await h.service.approve(h.ctx, USER_ID, ['write', 'read']);

      expect(result.ok).toBe(true);
      const grant = firstGrant(h);
      expect(grant.addResourceScope).toHaveBeenCalledWith(RESOURCE_URL, 'read write');
      expect(grant.rejectResourceScope).not.toHaveBeenCalled();
      expect(grant.addOIDCScope).not.toHaveBeenCalled();
    });

    it.each<[string, string, string[], unknown]>([
      ['要求に無い範囲を選んだ', 'offline_access read', ['read', 'write'], 'SCOPE_NOT_REQUESTED'],
      [
        '選べない範囲を選んだ',
        'offline_access read write',
        ['read', 'admin'],
        'SCOPE_NOT_REQUESTED',
      ],
      ['read を選ばなかった', 'offline_access read write', ['write'], 'READ_SCOPE_REQUIRED'],
      ['何も選ばなかった', 'offline_access read write', [], 'READ_SCOPE_REQUIRED'],
      ['要求に read が無い', 'offline_access write', ['write'], 'READ_SCOPE_REQUIRED'],
    ])('%s なら拒み、状態も印も読まない', async (_label, scope, selected, type) => {
      h.state.interaction.params = { ...h.state.interaction.params, scope };

      const result = await h.service.approve(h.ctx, USER_ID, selected as never);

      expect(result).toEqual({ ok: false, error: { type } });
      expect(h.prisma.user.findUnique).not.toHaveBeenCalled();
      expect(h.redis.getdel).not.toHaveBeenCalled();
      expect(h.redis.store.get(PASS_KEY)).toBe('3');
      expect(h.grants).toHaveLength(0);
    });

    it('申し込みが扱えなければ INTERACTION_NOT_FOUND', async () => {
      h.state.interaction.exp = NOW_SECONDS - 1;

      const result = await h.service.approve(h.ctx, USER_ID, ['read']);

      expect(result).toEqual({ ok: false, error: { type: 'INTERACTION_NOT_FOUND' } });
      expect(h.redis.getdel).not.toHaveBeenCalled();
    });

    it('確定の時点で権限が無ければ PERMISSION_REQUIRED で、通過の印を消費しない', async () => {
      h.state.permissions = [];

      const result = await h.service.approve(h.ctx, USER_ID, ['read']);

      expect(result).toEqual({ ok: false, error: { type: 'PERMISSION_REQUIRED' } });
      expect(h.redis.getdel).not.toHaveBeenCalled();
      expect(h.redis.store.get(PASS_KEY)).toBe('3');
      expect(h.grants).toHaveLength(0);
    });

    it('通過の印が無ければ SECOND_FACTOR_REQUIRED で、申し込みを占有しない', async () => {
      h.redis.store.delete(PASS_KEY);

      const result = await h.service.approve(h.ctx, USER_ID, ['read']);

      expect(result).toEqual({ ok: false, error: { type: 'SECOND_FACTOR_REQUIRED' } });
      expect(h.redis.store.has(FINISH_KEY)).toBe(false);
      expect(h.grants).toHaveLength(0);
    });

    it('通過の印の値が世代として読めなければ SECOND_FACTOR_REQUIRED', async () => {
      h.redis.store.set(PASS_KEY, '-1');

      const result = await h.service.approve(h.ctx, USER_ID, ['read']);

      expect(result).toEqual({ ok: false, error: { type: 'SECOND_FACTOR_REQUIRED' } });
      expect(h.grants).toHaveLength(0);
    });

    it('拒否などで申し込みが占有済みなら INTERACTION_NOT_FOUND で、Grant を作らない', async () => {
      h.redis.store.set(FINISH_KEY, '1');

      const result = await h.service.approve(h.ctx, USER_ID, ['read']);

      expect(result).toEqual({ ok: false, error: { type: 'INTERACTION_NOT_FOUND' } });
      expect(h.grants).toHaveLength(0);
      expect(h.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('開始の後に失効が進んだら RECONNECT_REQUIRED で、Grant を消して占有を解く', async () => {
      h.connectionService.createOrReplace.mockRejectedValueOnce(
        new ConnectionRevocationConflictError()
      );

      const result = await h.service.approve(h.ctx, USER_ID, ['read']);

      expect(result).toEqual({ ok: false, error: { type: 'RECONNECT_REQUIRED' } });
      expect(firstGrant(h).destroy).toHaveBeenCalledTimes(1);
      expect(h.redis.del).toHaveBeenCalledWith(FINISH_KEY);
      expect(h.redis.store.has(FINISH_KEY)).toBe(false);
      expect(h.connectionService.recordEvent).not.toHaveBeenCalled();
      expect(h.provider.interactionResult).not.toHaveBeenCalled();
    });

    it('トランザクションがほかの理由で失敗したら SERVICE_UNAVAILABLE で、Grant を消して占有を解く', async () => {
      h.provider.interactionResult.mockRejectedValueOnce(new RangeError('db down'));

      const result = await h.service.approve(h.ctx, USER_ID, ['read']);

      expect(result).toEqual({ ok: false, error: { type: 'SERVICE_UNAVAILABLE' } });
      expect(firstGrant(h).destroy).toHaveBeenCalledTimes(1);
      expect(h.redis.del).toHaveBeenCalledWith(FINISH_KEY);
      expect(h.redis.store.has(FINISH_KEY)).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        { errorName: 'RangeError', operation: 'approve' },
        'OAuth consent operation failed'
      );
    });

    it('Grant の削除が失敗したら名前だけを記録し、元の失敗を返す', async () => {
      h.connectionService.recordEvent.mockRejectedValueOnce(new Error('audit failed'));
      h.provider.Grant = class extends h.provider.Grant {
        constructor(init: { accountId: string; clientId: string }) {
          super(init);
          this.destroy.mockRejectedValueOnce(new SyntaxError('cannot destroy'));
        }
      };

      const result = await h.service.approve(h.ctx, USER_ID, ['read']);

      expect(result).toEqual({ ok: false, error: { type: 'SERVICE_UNAVAILABLE' } });
      expect(firstGrant(h).destroy).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        { errorName: 'SyntaxError' },
        'Failed to remove OAuth grant after failure'
      );
      expect(h.redis.store.has(FINISH_KEY)).toBe(false);
    });

    it('Grant の保存が失敗したら SERVICE_UNAVAILABLE で、占有を解き、接続を作らない', async () => {
      h.provider.Grant = class extends h.provider.Grant {
        constructor(init: { accountId: string; clientId: string }) {
          super(init);
          this.save.mockRejectedValueOnce(new Error('save failed'));
        }
      };

      const result = await h.service.approve(h.ctx, USER_ID, ['read']);

      expect(result).toEqual({ ok: false, error: { type: 'SERVICE_UNAVAILABLE' } });
      expect(firstGrant(h).destroy).not.toHaveBeenCalled();
      expect(h.prisma.$transaction).not.toHaveBeenCalled();
      expect(h.redis.del).toHaveBeenCalledWith(FINISH_KEY);
      expect(h.redis.store.has(FINISH_KEY)).toBe(false);
    });

    it('占有を解けなくても警告を記録し、元の結果を返す', async () => {
      h.connectionService.createOrReplace.mockRejectedValueOnce(
        new ConnectionRevocationConflictError()
      );
      h.redis.del.mockRejectedValueOnce(new Error('redis down'));

      const result = await h.service.approve(h.ctx, USER_ID, ['read']);

      expect(result).toEqual({ ok: false, error: { type: 'RECONNECT_REQUIRED' } });
      expect(logger.warn).toHaveBeenCalledWith(
        { errorName: 'Error' },
        'Failed to release OAuth consent claim'
      );
    });

    it('占有を解く時点で Redis が無ければ何もせず、元の結果を返す', async () => {
      h.connectionService.createOrReplace.mockRejectedValueOnce(
        new ConnectionRevocationConflictError()
      );
      // 1 回目は確定の前の確認、2 回目は占有を解く時点
      h.getRedis.mockReturnValueOnce(h.redis).mockReturnValue(null);

      const result = await h.service.approve(h.ctx, USER_ID, ['read']);

      expect(result).toEqual({ ok: false, error: { type: 'RECONNECT_REQUIRED' } });
      expect(h.redis.del).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('deny', () => {
    it('権限と状態を確かめず、監査と access_denied を 1 つのトランザクションで確定する', async () => {
      h.state.permissions = [];
      h.state.user!.twoFactorEnabled = false;

      const result = await h.service.deny(h.ctx, USER_ID);

      expect(result).toEqual({ ok: true, value: { redirectTo: REDIRECT_TO } });
      expect(h.prisma.userRole.findMany).not.toHaveBeenCalled();
      expect(h.redis.set).toHaveBeenCalledWith(FINISH_KEY, '1', 'EX', 600, 'NX');
      expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'ReadCommitted',
      });
      const event: ConnectionAuditEvent = {
        kind: 'CONSENT_DENIED',
        actorUserId: USER_ID,
        targetUserId: USER_ID,
        clientId: CLIENT_ID,
        scopes: ['read', 'write'],
        reason: null,
        occurredAt: new Date(NOW_MS),
        ipAddress: '203.0.113.5',
        userAgent: 'UnitAgent/1.0',
      };
      expect(h.connectionService.recordEvent).toHaveBeenCalledWith(event, h.tx);
      expect(h.provider.interactionResult).toHaveBeenCalledWith(h.ctx.req, h.ctx.res, {
        error: 'access_denied',
        error_description: 'The user denied the connection',
      });
      expect(h.connectionService.createOrReplace).not.toHaveBeenCalled();
      expect(h.grants).toHaveLength(0);
    });

    it('要求の送信元が無ければ監査の IP と UA を null にする', async () => {
      const { source: _source, ...withoutSource } = h.ctx;

      await h.service.deny(withoutSource, USER_ID);

      expect(h.connectionService.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: null, userAgent: null }),
        h.tx
      );
    });

    it('申し込みが扱えなければ INTERACTION_NOT_FOUND', async () => {
      h.state.interaction.result = { error: 'access_denied' };

      const result = await h.service.deny(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'INTERACTION_NOT_FOUND' } });
      expect(h.prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('利用者がいなければ INTERACTION_NOT_FOUND で、申し込みを占有しない', async () => {
      h.state.user = null;

      const result = await h.service.deny(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'INTERACTION_NOT_FOUND' } });
      expect(h.redis.set).not.toHaveBeenCalled();
      expect(h.connectionService.recordEvent).not.toHaveBeenCalled();
    });

    it('同意などで申し込みが占有済みなら INTERACTION_NOT_FOUND で、監査しない', async () => {
      h.redis.store.set(FINISH_KEY, '1');

      const result = await h.service.deny(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'INTERACTION_NOT_FOUND' } });
      expect(h.prisma.$transaction).not.toHaveBeenCalled();
      expect(h.connectionService.recordEvent).not.toHaveBeenCalled();
    });

    it('トランザクションが失敗したら SERVICE_UNAVAILABLE で、占有を解く', async () => {
      h.connectionService.recordEvent.mockRejectedValueOnce(new Error('audit failed'));

      const result = await h.service.deny(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'SERVICE_UNAVAILABLE' } });
      expect(h.provider.interactionResult).not.toHaveBeenCalled();
      expect(h.redis.del).toHaveBeenCalledWith(FINISH_KEY);
      expect(h.redis.store.has(FINISH_KEY)).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        { errorName: 'Error', operation: 'deny' },
        'OAuth consent operation failed'
      );
    });

    it('Redis が使えなければ SERVICE_UNAVAILABLE で、監査しない', async () => {
      h.getRedis.mockReturnValue(null);

      const result = await h.service.deny(h.ctx, USER_ID);

      expect(result).toEqual({ ok: false, error: { type: 'SERVICE_UNAVAILABLE' } });
      expect(h.connectionService.recordEvent).not.toHaveBeenCalled();
    });
  });
});
