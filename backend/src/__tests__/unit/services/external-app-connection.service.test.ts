/**
 * @fileoverview 外部アプリの接続のサービスの単体検証
 *
 * DB を差し替え、接続の作成と置き換え・有効性の判定（期限の境界を含む）・利用の記録・一覧・取り消し・
 * 一括の失効・許可の一覧から外れたアプリの終了・トークンの再利用の処理が、どの問い合わせをどの条件で発行し、
 * どの監査の内容を残すかを確かめる。ロックと同時実行の実際の動作は統合検証が確かめる。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../../services/security-anomaly-monitor.service.js', () => ({
  observeSecurityAnomaly: vi.fn(),
}));

import logger from '../../../utils/logger.js';
import { observeSecurityAnomaly } from '../../../services/security-anomaly-monitor.service.js';
import {
  CONNECTION_ABSOLUTE_MS,
  CONNECTION_IDLE_MS,
  CONNECTION_LIST_MAX_LIMIT,
  CONNECTION_TOUCH_INTERVAL_MS,
  ConnectionBatchEndError,
  ConnectionRevocationConflictError,
  ExternalAppConnectionService,
  REMOVED_CLIENT_BATCH_SIZE,
  coversExternalAppConnect,
} from '../../../services/external-app-connection.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-24T00:00:00.000Z');

interface ConnectionRowFixture {
  id: string;
  userId: string;
  clientId: string;
  grantId: string;
  scopes: string[];
  consentedAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function connectionRow(overrides: Partial<ConnectionRowFixture> = {}): ConnectionRowFixture {
  const consentedAt = overrides.consentedAt ?? new Date(NOW.getTime() - 10 * DAY_MS);
  return {
    id: 'conn-1',
    userId: 'user-1',
    clientId: 'client-1',
    grantId: 'grant-1',
    scopes: ['read', 'write'],
    lastUsedAt: null,
    expiresAt: new Date(consentedAt.getTime() + CONNECTION_ABSOLUTE_MS),
    createdAt: consentedAt,
    updatedAt: consentedAt,
    ...overrides,
    consentedAt,
  };
}

/** 差し替えた DB。サービスの prisma と取引の tx は同じ形の別の値にする */
function fakeDb() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    userRole: { findMany: vi.fn().mockResolvedValue([]) },
    externalAppConnection: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    oAuthStoreRecord: {
      findFirst: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

type FakeDb = ReturnType<typeof fakeDb>;

function build(options: { withRegistry?: boolean; observeAnomaly?: () => void } = {}) {
  const tx = fakeDb();
  const prisma = {
    ...fakeDb(),
    $transaction: vi.fn(async (fn: (client: FakeDb) => Promise<unknown>) => fn(tx)),
  };
  const createLog = vi.fn().mockResolvedValue(undefined);
  const service = new ExternalAppConnectionService({
    prisma: prisma as unknown as PrismaClient,
    auditLogService: { createLog } as never,
    ...(options.withRegistry === false
      ? {}
      : {
          clientRegistry: {
            loadAllowedClients: () => [
              {
                clientId: 'client-1',
                clientSecret: 'secret',
                displayName: '積算アプリ',
                redirectUris: ['https://app.example/cb'],
                tokenEndpointAuthMethod: 'client_secret_post' as const,
              },
            ],
          },
        }),
    ...(options.observeAnomaly ? { observeAnomaly: options.observeAnomaly } : {}),
  });
  return { service, prisma, tx, createLog, asTx: tx as unknown as Prisma.TransactionClient };
}

/** タグ付きテンプレートの呼び出しの SQL の文を返す */
function sqlOf(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join('?').replace(/\s+/g, ' ').trim();
}

function rawCalls(mock: ReturnType<typeof vi.fn>): { sql: string; values: unknown[] }[] {
  return mock.mock.calls.map((call) => ({ sql: sqlOf(call), values: call.slice(1) }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('coversExternalAppConnect', () => {
  it('external_app:connect とそれを包含するワイルドカードを権限として扱う', () => {
    expect(coversExternalAppConnect({ resource: 'external_app', action: 'connect' })).toBe(true);
    expect(coversExternalAppConnect({ resource: '*', action: '*' })).toBe(true);
    expect(coversExternalAppConnect({ resource: 'external_app', action: '*' })).toBe(true);
    expect(coversExternalAppConnect({ resource: '*', action: 'connect' })).toBe(true);
  });

  it('別の資源や操作の権限は包含しない', () => {
    expect(coversExternalAppConnect({ resource: 'external_app', action: 'read' })).toBe(false);
    expect(coversExternalAppConnect({ resource: 'project', action: 'connect' })).toBe(false);
  });
});

describe('createOrReplace', () => {
  const consentedAt = new Date('2026-11-01T00:00:00.000Z');
  const input = {
    userId: 'user-1',
    clientId: 'client-1',
    grantId: 'grant-new',
    scopes: ['read', 'write'] as const,
    consentedAt,
    expectedRevocationGeneration: 3,
    source: { ipAddress: '192.0.2.10', userAgent: 'Mozilla/5.0' },
  };

  function setup() {
    const ctx = build();
    ctx.tx.user.findUnique.mockResolvedValue({ externalAppRevocationGeneration: 3 });
    ctx.tx.externalAppConnection.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        connectionRow({
          id: 'conn-new',
          ...(data as Partial<ConnectionRowFixture>),
        })
    );
    return ctx;
  }

  it('初めての組では接続を作り、同意から 90 日の期限を書き、監査を残さない', async () => {
    const { service, tx, asTx, createLog } = setup();

    const view = await service.createOrReplace(input, asTx);

    const queries = rawCalls(tx.$queryRaw);
    expect(queries[0]).toEqual({
      sql: 'SELECT 1 FROM "users" WHERE "id" = ? FOR KEY SHARE',
      values: ['user-1'],
    });
    expect(queries[1]?.sql).toContain('pg_advisory_xact_lock_shared');
    expect(queries[1]?.values).toEqual([72_002, 'user-1']);
    expect(tx.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { externalAppRevocationGeneration: true },
    });
    const locks = rawCalls(tx.$executeRaw);
    expect(locks).toHaveLength(1);
    expect(locks[0]?.sql).toContain('pg_advisory_xact_lock(');
    expect(locks[0]?.values).toEqual([72_001, 'user-1:client-1']);
    expect(tx.externalAppConnection.findUnique).toHaveBeenCalledWith({
      where: { userId_clientId: { userId: 'user-1', clientId: 'client-1' } },
    });
    expect(tx.externalAppConnection.deleteMany).not.toHaveBeenCalled();
    expect(tx.externalAppConnection.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        clientId: 'client-1',
        grantId: 'grant-new',
        scopes: ['read', 'write'],
        consentedAt,
        expiresAt: new Date(consentedAt.getTime() + 90 * DAY_MS),
      },
    });
    expect(createLog).not.toHaveBeenCalled();
    expect(view).toEqual({
      id: 'conn-new',
      appName: '積算アプリ',
      scopes: ['read', 'write'],
      consentedAt: consentedAt.toISOString(),
      lastUsedAt: null,
      // 未使用の期限（30 日）が同意からの期限（90 日）より早い
      expiresAt: new Date(consentedAt.getTime() + 30 * DAY_MS).toISOString(),
    });
  });

  it('失効の世代が開始時と違えば接続を作らず ConnectionRevocationConflictError を投げる', async () => {
    const { service, tx, asTx } = setup();
    tx.user.findUnique.mockResolvedValue({ externalAppRevocationGeneration: 4 });

    const error = await service.createOrReplace(input, asTx).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConnectionRevocationConflictError);
    expect((error as ConnectionRevocationConflictError).code).toBe(
      'CONNECTION_REVOCATION_CONFLICT'
    );
    expect((error as Error).name).toBe('ConnectionRevocationConflictError');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.externalAppConnection.create).not.toHaveBeenCalled();
  });

  it('利用者がいなければ ConnectionRevocationConflictError を投げる', async () => {
    const { service, tx, asTx } = setup();
    tx.user.findUnique.mockResolvedValue(null);

    await expect(service.createOrReplace(input, asTx)).rejects.toBeInstanceOf(
      ConnectionRevocationConflictError
    );
    expect(tx.externalAppConnection.create).not.toHaveBeenCalled();
  });

  it('既存の接続と同じ Grant を渡すと、行を消さずに失敗する', async () => {
    const { service, tx, asTx } = setup();
    tx.externalAppConnection.findUnique.mockResolvedValue(connectionRow({ grantId: 'grant-new' }));

    await expect(service.createOrReplace(input, asTx)).rejects.toThrow(
      '再度の同意では新しい Grant が必要です'
    );
    expect(tx.externalAppConnection.deleteMany).not.toHaveBeenCalled();
    expect(tx.oAuthStoreRecord.deleteMany).not.toHaveBeenCalled();
    expect(tx.externalAppConnection.create).not.toHaveBeenCalled();
  });

  it('既存の接続を置き換えると、前の Grant の行を消して CONNECTION_REPLACED を記録する', async () => {
    const { service, tx, asTx, createLog } = setup();
    tx.externalAppConnection.findUnique.mockResolvedValue(
      connectionRow({ id: 'conn-old', grantId: 'grant-old' })
    );

    await service.createOrReplace(input, asTx);

    const grantLock = rawCalls(tx.$queryRaw).find((q) => q.sql.includes('oauth_store_records'));
    expect(grantLock?.values).toEqual(['grant-old']);
    expect(grantLock?.sql).toContain('FOR UPDATE');
    expect(tx.externalAppConnection.deleteMany).toHaveBeenCalledWith({ where: { id: 'conn-old' } });
    expect(tx.oAuthStoreRecord.deleteMany).toHaveBeenCalledWith({
      where: { grantId: 'grant-old' },
    });
    expect(tx.externalAppConnection.create).toHaveBeenCalledTimes(1);
    expect(createLog).toHaveBeenCalledTimes(1);
    expect(createLog).toHaveBeenCalledWith(
      {
        action: 'CONNECTION_REPLACED',
        actorId: 'user-1',
        targetType: 'User',
        targetId: 'user-1',
        metadata: {
          clientId: 'client-1',
          scopes: ['read', 'write'],
          reason: 'REPLACED',
          occurredAt: consentedAt.toISOString(),
          ipAddress: '192.0.2.10',
          userAgent: 'Mozilla/5.0',
        },
      },
      asTx
    );
  });

  it('既存の接続を先に他の終了が消していたら、置き換えとして記録しない', async () => {
    const { service, tx, asTx, createLog } = setup();
    tx.externalAppConnection.findUnique.mockResolvedValue(
      connectionRow({ id: 'conn-old', grantId: 'grant-old' })
    );
    tx.externalAppConnection.deleteMany.mockResolvedValue({ count: 0 });

    await service.createOrReplace(input, asTx);

    expect(tx.oAuthStoreRecord.deleteMany).not.toHaveBeenCalled();
    expect(tx.externalAppConnection.create).toHaveBeenCalledTimes(1);
    expect(createLog).not.toHaveBeenCalled();
  });

  it('送信元が無い置き換えでは監査の IP とユーザーエージェントを null にする', async () => {
    const { service, tx, asTx, createLog } = setup();
    tx.externalAppConnection.findUnique.mockResolvedValue(
      connectionRow({ id: 'conn-old', grantId: 'grant-old' })
    );
    const { source: _source, ...withoutSource } = input;

    await service.createOrReplace(withoutSource, asTx);

    expect(createLog.mock.calls[0]?.[0].metadata).toMatchObject({
      ipAddress: null,
      userAgent: null,
    });
  });
});

describe('assertActive', () => {
  it('接続が無ければ NOT_ACTIVE を返し、取引を始めない', async () => {
    const { service, prisma } = build();

    const result = await service.assertActive('grant-x', NOW);

    expect(result).toEqual({ ok: false, error: 'NOT_ACTIVE' });
    expect(prisma.externalAppConnection.findUnique).toHaveBeenCalledWith({
      where: { grantId: 'grant-x' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('期限内の接続を返し、知らない範囲を権限から外す', async () => {
    const { service, prisma } = build();
    prisma.externalAppConnection.findUnique.mockResolvedValue(
      connectionRow({ scopes: ['read', 'admin', 'write'] })
    );

    const result = await service.assertActive('grant-1', NOW);

    expect(result).toEqual({
      ok: true,
      value: {
        id: 'conn-1',
        userId: 'user-1',
        clientId: 'client-1',
        grantId: 'grant-1',
        scopes: ['read', 'write'],
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('同意からの期限のちょうど 1 ミリ秒前は有効とする', async () => {
    const { service, prisma } = build();
    const lastUsedAt = new Date(NOW.getTime() - DAY_MS);
    prisma.externalAppConnection.findUnique.mockResolvedValue(
      connectionRow({ lastUsedAt, expiresAt: new Date(NOW.getTime() + 1) })
    );

    const result = await service.assertActive('grant-1', NOW);

    expect(result.ok).toBe(true);
  });

  it('同意からの期限の時刻に達した接続を ABSOLUTE_EXPIRED で終了し、監査に送信元を残す', async () => {
    const { service, prisma, tx, createLog } = build();
    const row = connectionRow({
      lastUsedAt: new Date(NOW.getTime() - DAY_MS),
      expiresAt: NOW,
    });
    prisma.externalAppConnection.findUnique.mockResolvedValue(row);

    const result = await service.assertActive('grant-1', NOW, {
      ipAddress: '198.51.100.1',
      userAgent: 'curl/8',
    });

    expect(result).toEqual({ ok: false, error: 'NOT_ACTIVE' });
    // 同意からの期限では最後の利用の値を条件にしない
    expect(tx.externalAppConnection.deleteMany).toHaveBeenCalledWith({
      where: { id: 'conn-1', grantId: 'grant-1' },
    });
    expect(tx.oAuthStoreRecord.deleteMany).toHaveBeenCalledWith({ where: { grantId: 'grant-1' } });
    expect(createLog).toHaveBeenCalledWith(
      {
        action: 'CONNECTION_ENDED',
        actorId: null,
        targetType: 'User',
        targetId: 'user-1',
        metadata: {
          clientId: 'client-1',
          scopes: ['read', 'write'],
          reason: 'ABSOLUTE_EXPIRED',
          occurredAt: NOW.toISOString(),
          ipAddress: '198.51.100.1',
          userAgent: 'curl/8',
        },
      },
      tx
    );
    // 消せたので読み直さない
    expect(prisma.externalAppConnection.findUnique).toHaveBeenCalledTimes(1);
  });

  it('未使用の期限と同意からの期限の両方を過ぎたときは ABSOLUTE_EXPIRED を理由にする', async () => {
    const { service, prisma, createLog } = build();
    prisma.externalAppConnection.findUnique.mockResolvedValue(
      connectionRow({
        consentedAt: new Date(NOW.getTime() - 100 * DAY_MS),
        lastUsedAt: new Date(NOW.getTime() - 40 * DAY_MS),
      })
    );

    await service.assertActive('grant-1', NOW);

    expect(createLog.mock.calls[0]?.[0].metadata.reason).toBe('ABSOLUTE_EXPIRED');
  });

  it('最後の利用から 30 日に達した接続を、最後の利用の値も条件にして IDLE_EXPIRED で終了する', async () => {
    const { service, prisma, tx, createLog } = build();
    const lastUsedAt = new Date(NOW.getTime() - CONNECTION_IDLE_MS);
    prisma.externalAppConnection.findUnique.mockResolvedValue(
      connectionRow({ consentedAt: new Date(NOW.getTime() - 40 * DAY_MS), lastUsedAt })
    );

    const result = await service.assertActive('grant-1', NOW);

    expect(result).toEqual({ ok: false, error: 'NOT_ACTIVE' });
    expect(tx.externalAppConnection.deleteMany).toHaveBeenCalledWith({
      where: { id: 'conn-1', grantId: 'grant-1', lastUsedAt },
    });
    expect(createLog.mock.calls[0]?.[0].metadata).toMatchObject({
      reason: 'IDLE_EXPIRED',
      ipAddress: null,
      userAgent: null,
    });
  });

  it('未使用の接続は同意から 30 日で IDLE_EXPIRED とし、その 1 ミリ秒前は有効とする', async () => {
    const { service, prisma } = build();
    prisma.externalAppConnection.findUnique.mockResolvedValue(
      connectionRow({ consentedAt: new Date(NOW.getTime() - CONNECTION_IDLE_MS + 1) })
    );
    expect((await service.assertActive('grant-1', NOW)).ok).toBe(true);

    const { service: service2, prisma: prisma2, tx: tx2, createLog } = build();
    prisma2.externalAppConnection.findUnique.mockResolvedValue(
      connectionRow({ consentedAt: new Date(NOW.getTime() - CONNECTION_IDLE_MS) })
    );
    expect(await service2.assertActive('grant-1', NOW)).toEqual({
      ok: false,
      error: 'NOT_ACTIVE',
    });
    expect(tx2.externalAppConnection.deleteMany).toHaveBeenCalledWith({
      where: { id: 'conn-1', grantId: 'grant-1', lastUsedAt: null },
    });
    expect(createLog.mock.calls[0]?.[0].metadata.reason).toBe('IDLE_EXPIRED');
  });

  it('消せなかったとき、読み直した接続が利用の記録で期限内なら有効として返す', async () => {
    const { service, prisma, tx, createLog } = build();
    const stale = connectionRow({
      consentedAt: new Date(NOW.getTime() - 40 * DAY_MS),
      lastUsedAt: new Date(NOW.getTime() - 31 * DAY_MS),
    });
    const refreshed = { ...stale, lastUsedAt: NOW };
    prisma.externalAppConnection.findUnique
      .mockResolvedValueOnce(stale)
      .mockResolvedValueOnce(refreshed);
    tx.externalAppConnection.deleteMany.mockResolvedValue({ count: 0 });

    const result = await service.assertActive('grant-1', NOW);

    expect(result).toEqual({
      ok: true,
      value: {
        id: 'conn-1',
        userId: 'user-1',
        clientId: 'client-1',
        grantId: 'grant-1',
        scopes: ['read', 'write'],
      },
    });
    expect(tx.oAuthStoreRecord.deleteMany).not.toHaveBeenCalled();
    expect(createLog).not.toHaveBeenCalled();
    expect(prisma.externalAppConnection.findUnique).toHaveBeenCalledTimes(2);
  });

  it('消せなかったとき、読み直した接続が無いか期限切れのままなら NOT_ACTIVE を返す', async () => {
    const expired = connectionRow({ expiresAt: NOW });

    const gone = build();
    gone.prisma.externalAppConnection.findUnique
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce(null);
    gone.tx.externalAppConnection.deleteMany.mockResolvedValue({ count: 0 });
    expect(await gone.service.assertActive('grant-1', NOW)).toEqual({
      ok: false,
      error: 'NOT_ACTIVE',
    });

    const still = build();
    still.prisma.externalAppConnection.findUnique.mockResolvedValue(expired);
    still.tx.externalAppConnection.deleteMany.mockResolvedValue({ count: 0 });
    expect(await still.service.assertActive('grant-1', NOW)).toEqual({
      ok: false,
      error: 'NOT_ACTIVE',
    });
    expect(still.createLog).not.toHaveBeenCalled();
  });
});

describe('touch', () => {
  it('期限内で 1 分以上前に使われた接続だけを 1 文の条件付きの更新で記録する', async () => {
    const { service, prisma } = build();

    await service.touch('conn-1', NOW);

    const idleCutoff = new Date(NOW.getTime() - CONNECTION_IDLE_MS);
    const touchCutoff = new Date(NOW.getTime() - CONNECTION_TOUCH_INTERVAL_MS);
    expect(prisma.externalAppConnection.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.externalAppConnection.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'conn-1',
        expiresAt: { gt: NOW },
        consentedAt: { lte: NOW },
        OR: [
          { lastUsedAt: null, consentedAt: { gt: idleCutoff } },
          { lastUsedAt: { gt: idleCutoff, lte: touchCutoff } },
        ],
      },
      data: { lastUsedAt: NOW },
    });
    expect(touchCutoff.getTime()).toBe(NOW.getTime() - 60_000);
  });
});

describe('confirmNotEnded', () => {
  it('接続の行を FOR KEY SHARE で読み、残っていれば true を返す', async () => {
    const { service, prisma } = build();
    prisma.$queryRaw.mockResolvedValue([{ id: 'conn-1' }]);

    await expect(service.confirmNotEnded('conn-1')).resolves.toBe(true);

    const [query] = rawCalls(prisma.$queryRaw);
    expect(query?.sql).toContain('FROM "external_app_connections"');
    expect(query?.sql).toContain('FOR KEY SHARE');
    expect(query?.values).toEqual(['conn-1']);
  });

  it('行が無ければ false を返す', async () => {
    const { service, prisma } = build();
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(service.confirmNotEnded('conn-1')).resolves.toBe(false);
  });
});

describe('listOwn', () => {
  it('本人の接続を同意の新しい順に読み、表示名と画面の期限を付ける', async () => {
    const { service, prisma } = build();
    const consentedAt = new Date('2026-11-01T00:00:00.000Z');
    const lastUsedAt = new Date('2026-11-20T00:00:00.000Z');
    prisma.externalAppConnection.findMany.mockResolvedValue([
      {
        id: 'conn-1',
        clientId: 'client-1',
        scopes: ['read', 'unknown'],
        consentedAt,
        lastUsedAt,
        expiresAt: new Date(consentedAt.getTime() + CONNECTION_ABSOLUTE_MS),
      },
      {
        id: 'conn-2',
        clientId: 'client-unregistered',
        scopes: ['write'],
        consentedAt: new Date('2026-08-01T00:00:00.000Z'),
        lastUsedAt: new Date('2026-10-25T00:00:00.000Z'),
        expiresAt: new Date('2026-10-30T00:00:00.000Z'),
      },
    ]);

    const views = await service.listOwn('user-1');

    expect(prisma.externalAppConnection.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: {
        id: true,
        clientId: true,
        scopes: true,
        consentedAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
      orderBy: [{ consentedAt: 'desc' }, { id: 'asc' }],
    });
    expect(views).toEqual([
      {
        id: 'conn-1',
        appName: '積算アプリ',
        scopes: ['read'],
        consentedAt: consentedAt.toISOString(),
        lastUsedAt: lastUsedAt.toISOString(),
        // 最後の利用から 30 日（12-20）が同意から 90 日（01-30）より早い
        expiresAt: '2026-12-20T00:00:00.000Z',
      },
      {
        id: 'conn-2',
        // 許可の一覧に無いアプリはクライアント ID を表示名にする
        appName: 'client-unregistered',
        scopes: ['write'],
        consentedAt: '2026-08-01T00:00:00.000Z',
        lastUsedAt: '2026-10-25T00:00:00.000Z',
        // 同意からの期限が未使用の期限（11-24）より早い
        expiresAt: '2026-10-30T00:00:00.000Z',
      },
    ]);
  });

  it('許可の一覧が渡されていなければクライアント ID を表示名にする', async () => {
    const { service, prisma } = build({ withRegistry: false });
    prisma.externalAppConnection.findMany.mockResolvedValue([
      {
        id: 'conn-1',
        clientId: 'client-1',
        scopes: ['read'],
        consentedAt: NOW,
        lastUsedAt: null,
        expiresAt: new Date(NOW.getTime() + CONNECTION_ABSOLUTE_MS),
      },
    ]);

    const [view] = await service.listOwn('user-1');

    expect(view?.appName).toBe('client-1');
  });
});

describe('listAll', () => {
  const user = { id: 'user-1', displayName: '山田 太郎', email: 'taro@example.com' };

  it('絞り込みとページを問い合わせに渡し、利用者とクライアント ID つきで返す', async () => {
    const { service, prisma } = build();
    prisma.externalAppConnection.findMany.mockResolvedValue([
      {
        id: 'conn-1',
        clientId: 'client-1',
        scopes: ['read'],
        consentedAt: NOW,
        lastUsedAt: null,
        expiresAt: new Date(NOW.getTime() + CONNECTION_ABSOLUTE_MS),
        user,
      },
    ]);
    prisma.externalAppConnection.count.mockResolvedValue(41);

    const result = await service.listAll({
      page: 3,
      limit: 20,
      userId: 'user-1',
      clientId: 'client-1',
    });

    const where = { userId: 'user-1', clientId: 'client-1' };
    expect(prisma.externalAppConnection.findMany).toHaveBeenCalledWith({
      where,
      select: {
        id: true,
        clientId: true,
        scopes: true,
        consentedAt: true,
        lastUsedAt: true,
        expiresAt: true,
        user: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: [{ consentedAt: 'desc' }, { id: 'asc' }],
      skip: 40,
      take: 20,
    });
    expect(prisma.externalAppConnection.count).toHaveBeenCalledWith({ where });
    expect(result).toEqual({
      data: [
        {
          id: 'conn-1',
          appName: '積算アプリ',
          scopes: ['read'],
          consentedAt: NOW.toISOString(),
          lastUsedAt: null,
          expiresAt: new Date(NOW.getTime() + CONNECTION_IDLE_MS).toISOString(),
          clientId: 'client-1',
          user,
        },
      ],
      pagination: { page: 3, limit: 20, total: 41, totalPages: 3 },
    });
  });

  it('絞り込みが無ければ条件を空にし、件数 0 ではページ数 0 を返す', async () => {
    const { service, prisma } = build();

    const result = await service.listAll({ page: 1, limit: CONNECTION_LIST_MAX_LIMIT });

    expect(prisma.externalAppConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 0, take: 100 })
    );
    expect(prisma.externalAppConnection.count).toHaveBeenCalledWith({ where: {} });
    expect(result).toEqual({
      data: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
  });

  it.each([
    { page: 0, limit: 20 },
    { page: 1.5, limit: 20 },
    { page: 1, limit: 0 },
    { page: 1, limit: 2.5 },
    { page: 1, limit: CONNECTION_LIST_MAX_LIMIT + 1 },
    // 読み飛ばす行数が 32 ビットの上限を超える
    { page: 21_474_838, limit: 100 },
  ])(
    'ページか件数が範囲外（$page, $limit）なら RangeError を投げ、問い合わせない',
    async (filter) => {
      const { service, prisma } = build();

      await expect(service.listAll(filter)).rejects.toBeInstanceOf(RangeError);
      expect(prisma.externalAppConnection.findMany).not.toHaveBeenCalled();
      expect(prisma.externalAppConnection.count).not.toHaveBeenCalled();
    }
  );

  it('読み飛ばす行数がちょうど上限なら問い合わせる', async () => {
    const { service, prisma } = build();
    // (page - 1) * limit = 2_147_483_647
    await service.listAll({ page: 2_147_483_648, limit: 1 });

    expect(prisma.externalAppConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 2_147_483_647, take: 1 })
    );
  });
});

describe('revokeOwn と revokeByAdmin', () => {
  it('本人の取り消しは ID と利用者で絞って消し、USER_REVOKED を記録する', async () => {
    const { service, tx, createLog } = build();
    tx.externalAppConnection.findFirst.mockResolvedValue(connectionRow({ scopes: ['read'] }));

    const result = await service.revokeOwn('user-1', 'conn-1', {
      userId: 'user-1',
      source: { ipAddress: '192.0.2.1', userAgent: 'agent' },
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(tx.externalAppConnection.findFirst).toHaveBeenCalledWith({
      where: { id: 'conn-1', userId: 'user-1' },
    });
    const grantLock = rawCalls(tx.$queryRaw)[0];
    expect(grantLock?.sql).toContain('"oauth_store_records"');
    expect(grantLock?.values).toEqual(['grant-1']);
    expect(tx.externalAppConnection.deleteMany).toHaveBeenCalledWith({
      where: { id: 'conn-1', userId: 'user-1', grantId: 'grant-1' },
    });
    expect(tx.oAuthStoreRecord.deleteMany).toHaveBeenCalledWith({ where: { grantId: 'grant-1' } });
    expect(createLog).toHaveBeenCalledTimes(1);
    const [entry, client] = createLog.mock.calls[0] ?? [];
    expect(client).toBe(tx);
    expect(entry).toMatchObject({
      action: 'CONNECTION_ENDED',
      actorId: 'user-1',
      targetType: 'User',
      targetId: 'user-1',
      metadata: {
        clientId: 'client-1',
        scopes: ['read'],
        reason: 'USER_REVOKED',
        ipAddress: '192.0.2.1',
        userAgent: 'agent',
      },
    });
    expect(Number.isNaN(Date.parse(entry.metadata.occurredAt))).toBe(false);
  });

  it('他の利用者の接続や存在しない ID は NOT_FOUND を返し、何も消さない', async () => {
    const { service, tx, createLog } = build();

    const result = await service.revokeOwn('user-2', 'conn-1', { userId: 'user-2' });

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(tx.externalAppConnection.deleteMany).not.toHaveBeenCalled();
    expect(createLog).not.toHaveBeenCalled();
  });

  it('読み取りの後に他の取り消しが先に消していたら NOT_FOUND を返し、監査を残さない', async () => {
    const { service, tx, createLog } = build();
    tx.externalAppConnection.findFirst.mockResolvedValue(connectionRow());
    tx.externalAppConnection.deleteMany.mockResolvedValue({ count: 0 });

    const result = await service.revokeByAdmin('conn-1', { userId: 'admin-1' });

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(tx.oAuthStoreRecord.deleteMany).not.toHaveBeenCalled();
    expect(createLog).not.toHaveBeenCalled();
  });

  it('管理者の取り消しは ID だけで絞り、実行者を管理者として ADMIN_REVOKED を記録する', async () => {
    const { service, tx, createLog } = build();
    tx.externalAppConnection.findFirst.mockResolvedValue(connectionRow());

    const result = await service.revokeByAdmin('conn-1', { userId: 'admin-1' });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(tx.externalAppConnection.findFirst).toHaveBeenCalledWith({ where: { id: 'conn-1' } });
    expect(createLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'CONNECTION_ENDED',
      actorId: 'admin-1',
      targetId: 'user-1',
      metadata: { reason: 'ADMIN_REVOKED', ipAddress: null, userAgent: null },
    });
  });
});

describe('revokeAllForUser', () => {
  it('利用者をロックして世代を進め、接続を Grant の昇順に全て終了する', async () => {
    const { service, tx, asTx, createLog } = build();
    tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join('').includes('FROM "users"') ? [{ id: 'user-1' }] : []
    );
    tx.externalAppConnection.findMany.mockResolvedValue([
      connectionRow({ id: 'conn-a', grantId: 'grant-a', clientId: 'client-1' }),
      connectionRow({ id: 'conn-b', grantId: 'grant-b', clientId: 'client-2' }),
    ]);

    const ended = await service.revokeAllForUser(
      'user-1',
      'PASSWORD_CHANGED',
      { userId: 'user-1', source: { ipAddress: '192.0.2.5', userAgent: 'ua' } },
      asTx
    );

    expect(ended).toBe(2);
    const queries = rawCalls(tx.$queryRaw);
    expect(queries[0]?.sql).toContain('FOR NO KEY UPDATE');
    expect(queries[0]?.values).toEqual([['user-1']]);
    expect(queries[1]?.sql).toContain('pg_advisory_xact_lock(');
    expect(queries[1]?.values).toEqual([72_002, ['user-1']]);
    const updates = rawCalls(tx.$executeRaw);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.sql).toContain('"external_app_revocation_generation" + 1');
    expect(updates[0]?.values).toEqual([['user-1']]);
    expect(tx.externalAppConnection.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { grantId: 'asc' },
    });
    expect(tx.externalAppConnection.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'conn-a', grantId: 'grant-a' },
    });
    expect(tx.externalAppConnection.deleteMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'conn-b', grantId: 'grant-b' },
    });
    expect(createLog).toHaveBeenCalledTimes(2);
    expect(createLog.mock.calls.map(([entry]) => entry.metadata.clientId)).toEqual([
      'client-1',
      'client-2',
    ]);
    expect(createLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'CONNECTION_ENDED',
      actorId: 'user-1',
      targetId: 'user-1',
      metadata: { reason: 'PASSWORD_CHANGED', ipAddress: '192.0.2.5', userAgent: 'ua' },
    });
  });

  it('他の処理が先に消した接続は数えず、監査も残さない', async () => {
    const { service, tx, asTx, createLog } = build();
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'user-1' }]).mockResolvedValue([]);
    tx.externalAppConnection.findMany.mockResolvedValue([
      connectionRow({ id: 'conn-a', grantId: 'grant-a' }),
      connectionRow({ id: 'conn-b', grantId: 'grant-b' }),
    ]);
    tx.externalAppConnection.deleteMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const ended = await service.revokeAllForUser('user-1', 'LOGOUT_ALL', { userId: null }, asTx);

    expect(ended).toBe(1);
    expect(tx.oAuthStoreRecord.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.oAuthStoreRecord.deleteMany).toHaveBeenCalledWith({ where: { grantId: 'grant-b' } });
    expect(createLog).toHaveBeenCalledTimes(1);
    expect(createLog.mock.calls[0]?.[0].actorId).toBeNull();
  });

  it('利用者がいなければ取引ロックも世代の更新も行わない', async () => {
    const { service, tx, asTx } = build();
    tx.$queryRaw.mockResolvedValue([]);

    const ended = await service.revokeAllForUser(
      'user-gone',
      'ACCOUNT_DELETED',
      { userId: null },
      asTx
    );

    expect(ended).toBe(0);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('revokeForUsersWithoutPermission', () => {
  const connectPermission = { permission: { resource: 'external_app', action: 'connect' } };
  const otherPermission = { permission: { resource: 'project', action: 'read' } };

  it('利用者の一覧が空なら何も問い合わせずに 0 を返す', async () => {
    const { service, tx, asTx } = build();

    await expect(service.revokeForUsersWithoutPermission([], { userId: 'a' }, asTx)).resolves.toBe(
      0
    );
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('実在する利用者がいなければ権限を読まずに 0 を返す', async () => {
    const { service, tx, asTx } = build();
    tx.$queryRaw.mockResolvedValue([]);

    await expect(
      service.revokeForUsersWithoutPermission(['user-x'], { userId: 'a' }, asTx)
    ).resolves.toBe(0);
    expect(tx.userRole.findMany).not.toHaveBeenCalled();
  });

  it('権限を失った利用者だけの世代を進め、その接続を PERMISSION_LOST で終了する', async () => {
    const { service, tx, asTx, createLog } = build();
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'user-1' }, { id: 'user-2' }]).mockResolvedValue([]);
    tx.userRole.findMany.mockResolvedValue([
      { userId: 'user-1', role: { rolePermissions: [otherPermission] } },
      { userId: 'user-2', role: { rolePermissions: [otherPermission, connectPermission] } },
    ]);
    tx.externalAppConnection.findMany.mockResolvedValue([connectionRow({ userId: 'user-1' })]);

    const ended = await service.revokeForUsersWithoutPermission(
      ['user-2', 'user-1'],
      { userId: 'admin-1' },
      asTx
    );

    expect(ended).toBe(1);
    expect(rawCalls(tx.$queryRaw)[0]?.values).toEqual([['user-2', 'user-1']]);
    expect(tx.userRole.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: { in: ['user-1', 'user-2'] } } })
    );
    expect(rawCalls(tx.$executeRaw)[0]?.values).toEqual([['user-1']]);
    expect(tx.externalAppConnection.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ['user-1'] } },
      orderBy: { grantId: 'asc' },
    });
    expect(createLog.mock.calls[0]?.[0]).toMatchObject({
      actorId: 'admin-1',
      targetId: 'user-1',
      metadata: { reason: 'PERMISSION_LOST' },
    });
  });

  it('全利用者を対象にすると、全行をロックして権限を条件なしで読む', async () => {
    const { service, tx, asTx } = build();
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'user-1' }]).mockResolvedValue([]);
    tx.userRole.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        role: { rolePermissions: [{ permission: { resource: '*', action: '*' } }] },
      },
    ]);

    const ended = await service.revokeForUsersWithoutPermission('ALL', { userId: null }, asTx);

    expect(ended).toBe(0);
    const [lockUsers] = rawCalls(tx.$queryRaw);
    expect(lockUsers?.sql).toBe('SELECT "id" FROM "users" ORDER BY "id" FOR NO KEY UPDATE');
    expect(lockUsers?.values).toEqual([]);
    expect(tx.userRole.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    // 誰も権限を失っていないので世代を進めず、接続も読まない
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.externalAppConnection.findMany).not.toHaveBeenCalled();
  });
});

describe('revokeForRemovedClients', () => {
  it('許可の一覧に無いアプリの接続を 1 件ずつ取引で終了し、CLIENT_REMOVED を記録する', async () => {
    const { service, prisma, tx, createLog } = build();
    prisma.externalAppConnection.findMany.mockResolvedValueOnce([{ id: 'conn-1' }]);
    tx.externalAppConnection.findFirst.mockResolvedValue(connectionRow({ clientId: 'client-old' }));

    const ended = await service.revokeForRemovedClients(['client-1', 'client-1', 'client-2']);

    expect(ended).toBe(1);
    const removedWhere = { clientId: { notIn: ['client-1', 'client-2'] } };
    expect(prisma.externalAppConnection.findMany).toHaveBeenCalledWith({
      where: removedWhere,
      select: { id: true },
      orderBy: { id: 'asc' },
      take: REMOVED_CLIENT_BATCH_SIZE,
    });
    expect(tx.externalAppConnection.findFirst).toHaveBeenCalledWith({
      where: { ...removedWhere, id: 'conn-1' },
    });
    expect(tx.externalAppConnection.deleteMany).toHaveBeenCalledWith({
      where: { ...removedWhere, id: 'conn-1', grantId: 'grant-1' },
    });
    expect(createLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'CONNECTION_ENDED',
      actorId: null,
      targetId: 'user-1',
      metadata: {
        clientId: 'client-old',
        reason: 'CLIENT_REMOVED',
        ipAddress: null,
        userAgent: null,
      },
    });
  });

  it('許可の一覧が空なら全ての接続を対象にし、件数の上限ごとに ID のカーソルで読み進める', async () => {
    const { service, prisma, tx } = build();
    const firstBatch = Array.from({ length: REMOVED_CLIENT_BATCH_SIZE }, (_, i) => ({
      id: `conn-${String(i).padStart(3, '0')}`,
    }));
    prisma.externalAppConnection.findMany
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce([{ id: 'conn-999' }]);
    tx.externalAppConnection.findFirst.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        connectionRow({ id: where.id, grantId: `g-${where.id}` })
    );

    const ended = await service.revokeForRemovedClients([]);

    expect(ended).toBe(REMOVED_CLIENT_BATCH_SIZE + 1);
    expect(prisma.externalAppConnection.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.externalAppConnection.findMany.mock.calls[0]?.[0].where).toEqual({});
    expect(prisma.externalAppConnection.findMany.mock.calls[1]?.[0].where).toEqual({
      id: { gt: 'conn-099' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(REMOVED_CLIENT_BATCH_SIZE + 1);
  });

  it('上限ちょうどの件数の後に空のページが来たら終える', async () => {
    const { service, prisma, tx } = build();
    prisma.externalAppConnection.findMany
      .mockResolvedValueOnce(
        Array.from({ length: REMOVED_CLIENT_BATCH_SIZE }, (_, i) => ({ id: `c${i}` }))
      )
      .mockResolvedValueOnce([]);
    tx.externalAppConnection.findFirst.mockResolvedValue(null);

    const ended = await service.revokeForRemovedClients(['client-1']);

    // 読み取りの後に他の処理が終了した接続は数えない
    expect(ended).toBe(0);
    expect(prisma.externalAppConnection.findMany).toHaveBeenCalledTimes(2);
    expect(tx.externalAppConnection.deleteMany).not.toHaveBeenCalled();
  });

  it('条件付きの消去で消せなかった接続は数えず、監査を残さない', async () => {
    const { service, prisma, tx, createLog } = build();
    prisma.externalAppConnection.findMany.mockResolvedValueOnce([{ id: 'conn-1' }]);
    tx.externalAppConnection.findFirst.mockResolvedValue(connectionRow());
    tx.externalAppConnection.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.revokeForRemovedClients(['client-2'])).resolves.toBe(0);
    expect(createLog).not.toHaveBeenCalled();
  });

  it('1 件の失敗は残りの処理を続け、最後に件数つきの ConnectionBatchEndError を投げる', async () => {
    const { service, prisma } = build();
    prisma.externalAppConnection.findMany.mockResolvedValueOnce([
      { id: 'conn-1' },
      { id: 'conn-2' },
      { id: 'conn-3' },
    ]);
    const tx = fakeDb();
    tx.externalAppConnection.findFirst.mockImplementation(
      async ({ where }: { where: { id: string } }) => connectionRow({ id: where.id })
    );
    let call = 0;
    prisma.$transaction.mockImplementation(async (fn: (client: FakeDb) => Promise<unknown>) => {
      call += 1;
      if (call === 1) {
        throw new TypeError('db down');
      }
      if (call === 2) {
        throw 'not an error';
      }
      return fn(tx);
    });

    const error = await service.revokeForRemovedClients([]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConnectionBatchEndError);
    expect((error as ConnectionBatchEndError).ended).toBe(1);
    expect((error as ConnectionBatchEndError).failed).toBe(2);
    expect((error as Error).name).toBe('ConnectionBatchEndError');
    expect((error as Error).message).toBe('接続の一括の終了で 2 件が失敗しました（終了 1 件）');
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenNthCalledWith(
      1,
      { connectionId: 'conn-1', errorName: 'TypeError' },
      'Failed to end an external app connection of a removed client'
    );
    expect(logger.warn).toHaveBeenNthCalledWith(
      2,
      { connectionId: 'conn-2', errorName: 'unknown' },
      'Failed to end an external app connection of a removed client'
    );
  });
});

describe('handleReuse', () => {
  const event = {
    grantId: 'grant-1',
    kind: 'refresh_token' as const,
    ipAddress: '203.0.113.9',
    userAgent: 'evil-agent',
  };

  it('接続があれば Grant をロックして接続とトークンを消し、監査の後に異常を通知する', async () => {
    const observeAnomaly = vi.fn();
    const { service, tx, createLog } = build({ observeAnomaly });
    tx.externalAppConnection.findUnique.mockResolvedValue(connectionRow({ scopes: ['write'] }));

    await service.handleReuse(event);

    const grantLocks = rawCalls(tx.$queryRaw).filter((q) => q.sql.includes('oauth_store_records'));
    expect(grantLocks.map((q) => q.values)).toEqual([['grant-1'], ['grant-1']]);
    expect(tx.externalAppConnection.findUnique).toHaveBeenCalledWith({
      where: { grantId: 'grant-1' },
    });
    expect(tx.externalAppConnection.deleteMany).toHaveBeenCalledWith({
      where: { id: 'conn-1', grantId: 'grant-1' },
    });
    expect(tx.oAuthStoreRecord.deleteMany).toHaveBeenCalledWith({ where: { grantId: 'grant-1' } });
    const [entry, client] = createLog.mock.calls[0] ?? [];
    expect(client).toBe(tx);
    expect(entry).toMatchObject({
      action: 'TOKEN_REUSE_DETECTED',
      actorId: null,
      targetType: 'User',
      targetId: 'user-1',
      metadata: {
        clientId: 'client-1',
        scopes: ['write'],
        reason: 'TOKEN_REUSE',
        ipAddress: '203.0.113.9',
        userAgent: 'evil-agent',
        reuseKind: 'refresh_token',
      },
    });
    // トークンの値と Grant の ID を監査に含めない
    expect(JSON.stringify(entry)).not.toContain('grant-1');
    expect(observeAnomaly).toHaveBeenCalledWith({
      signal: 'external_app_token_reuse',
      sourceIp: '203.0.113.9',
      userId: 'user-1',
    });
    expect(observeSecurityAnomaly).not.toHaveBeenCalled();
  });

  it('接続を他の処理が先に消していたら、監査も通知もしない', async () => {
    const observeAnomaly = vi.fn();
    const { service, tx, createLog } = build({ observeAnomaly });
    tx.externalAppConnection.findUnique.mockResolvedValue(connectionRow());
    tx.externalAppConnection.deleteMany.mockResolvedValue({ count: 0 });

    await service.handleReuse(event);

    expect(tx.oAuthStoreRecord.deleteMany).not.toHaveBeenCalled();
    expect(createLog).not.toHaveBeenCalled();
    expect(observeAnomaly).not.toHaveBeenCalled();
  });

  it('接続の無い Grant は、Grant の payload から検証した利用者とアプリで監査する', async () => {
    const { service, tx, createLog } = build();
    tx.oAuthStoreRecord.findFirst.mockResolvedValue({
      payload: { accountId: 'user-7', clientId: 'client-9' },
    });
    tx.user.findUnique.mockResolvedValue({ id: 'user-7' });

    await service.handleReuse({ ...event, kind: 'authorization_code' });

    expect(tx.oAuthStoreRecord.findFirst).toHaveBeenCalledWith({
      where: { grantId: 'grant-1', kind: 'Grant' },
      select: { payload: true },
      orderBy: { id: 'asc' },
    });
    expect(tx.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-7' },
      select: { id: true },
    });
    expect(tx.oAuthStoreRecord.deleteMany).toHaveBeenCalledWith({ where: { grantId: 'grant-1' } });
    expect(tx.externalAppConnection.deleteMany).not.toHaveBeenCalled();
    expect(createLog).toHaveBeenCalledWith(
      {
        action: 'TOKEN_REUSE_DETECTED',
        actorId: null,
        targetType: 'User',
        targetId: 'user-7',
        metadata: expect.objectContaining({
          clientId: 'client-9',
          scopes: [],
          reason: 'TOKEN_REUSE',
          reuseKind: 'authorization_code',
        }),
      },
      tx
    );
    // 通知の既定は共有の異常検知
    expect(observeSecurityAnomaly).toHaveBeenCalledWith({
      signal: 'external_app_token_reuse',
      sourceIp: '203.0.113.9',
      userId: 'user-7',
    });
  });

  it.each([
    { label: 'Grant の行が無い', record: null, user: null },
    { label: 'payload が配列', record: { payload: ['user-7'] }, user: null },
    { label: 'payload が文字列', record: { payload: 'user-7' }, user: null },
    {
      label: 'ID の形でない',
      record: { payload: { accountId: 'bad\nid', clientId: 42 } },
      user: null,
    },
    {
      label: '利用者がいない',
      record: { payload: { accountId: 'user-gone', clientId: 'x'.repeat(256) } },
      user: null,
    },
  ])('$label ときは対象を不明として監査する', async ({ record, user }) => {
    const { service, tx, createLog } = build();
    tx.oAuthStoreRecord.findFirst.mockResolvedValue(record);
    tx.user.findUnique.mockResolvedValue(user);

    await service.handleReuse({ ...event, ipAddress: null, userAgent: null });

    expect(createLog.mock.calls[0]?.[0]).toMatchObject({
      targetType: 'ExternalAppGrant',
      targetId: 'unknown',
      metadata: { clientId: null, ipAddress: null, userAgent: null },
    });
    expect(observeSecurityAnomaly).toHaveBeenCalledWith({
      signal: 'external_app_token_reuse',
      sourceIp: null,
      userId: null,
    });
  });

  it('ID の形でない利用者の値では利用者を問い合わせない', async () => {
    const { service, tx } = build();
    tx.oAuthStoreRecord.findFirst.mockResolvedValue({
      payload: { accountId: '', clientId: 'client-1' },
    });

    await service.handleReuse(event);

    expect(tx.user.findUnique).not.toHaveBeenCalled();
  });

  it('接続も保存データの行も無ければ、監査も通知もしない', async () => {
    const { service, tx, createLog } = build();
    tx.oAuthStoreRecord.deleteMany.mockResolvedValue({ count: 0 });

    await service.handleReuse(event);

    expect(createLog).not.toHaveBeenCalled();
    expect(observeSecurityAnomaly).not.toHaveBeenCalled();
  });

  it('DB の失敗は呼び出し元へ伝え、通知しない', async () => {
    const { service, prisma } = build();
    prisma.$transaction.mockRejectedValue(new Error('db down'));

    await expect(service.handleReuse(event)).rejects.toThrow('db down');
    expect(observeSecurityAnomaly).not.toHaveBeenCalled();
  });

  it('通知の失敗はトークンの処理へ伝えず、例外の名前だけをログに残す', async () => {
    const observeAnomaly = vi.fn(() => {
      throw new RangeError('redis secret detail');
    });
    const { service, tx } = build({ observeAnomaly });
    tx.externalAppConnection.findUnique.mockResolvedValue(connectionRow());

    await expect(service.handleReuse(event)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      { errorName: 'RangeError' },
      'Failed to notify external app token reuse'
    );
  });

  it('例外でない値が投げられた通知の失敗は unknown としてログに残す', async () => {
    const observeAnomaly = vi.fn(() => {
      throw 'oops';
    });
    const { service, tx } = build({ observeAnomaly });
    tx.externalAppConnection.findUnique.mockResolvedValue(connectionRow());

    await service.handleReuse(event);

    expect(logger.warn).toHaveBeenCalledWith(
      { errorName: 'unknown' },
      'Failed to notify external app token reuse'
    );
  });
});

describe('recordEvent', () => {
  const base = {
    kind: 'CONSENT_GRANTED' as const,
    actorUserId: 'user-1',
    targetUserId: 'user-1',
    clientId: 'client-1',
    scopes: ['read'] as const,
    reason: null,
    occurredAt: NOW,
    ipAddress: '192.0.2.1',
    userAgent: 'agent',
  };

  it('出来事を監査へ写し、取引を渡す', async () => {
    const { service, asTx, createLog } = build();

    await service.recordEvent(base, asTx);

    expect(createLog).toHaveBeenCalledWith(
      {
        action: 'CONSENT_GRANTED',
        actorId: 'user-1',
        targetType: 'User',
        targetId: 'user-1',
        metadata: {
          clientId: 'client-1',
          scopes: ['read'],
          reason: null,
          occurredAt: NOW.toISOString(),
          ipAddress: '192.0.2.1',
          userAgent: 'agent',
        },
      },
      asTx
    );
  });

  it('長すぎる IP とユーザーエージェントを上限で切り詰め、切り詰めた印を付ける', async () => {
    const { service, createLog } = build();

    await service.recordEvent({ ...base, ipAddress: '1'.repeat(100), userAgent: 'a'.repeat(600) });

    const metadata = createLog.mock.calls[0]?.[0].metadata;
    expect(metadata.ipAddress).toBe('1'.repeat(64));
    expect(metadata.userAgent).toBe('a'.repeat(512));
    expect(metadata.userAgentTruncated).toBe(true);
    expect(createLog.mock.calls[0]?.[1]).toBeUndefined();
  });

  it('上限ちょうどのユーザーエージェントは切り詰めの印を付けない', async () => {
    const { service, createLog } = build();

    await service.recordEvent({ ...base, userAgent: 'a'.repeat(512) });

    const metadata = createLog.mock.calls[0]?.[0].metadata;
    expect(metadata.userAgent).toBe('a'.repeat(512));
    expect(metadata).not.toHaveProperty('userAgentTruncated');
    expect(metadata).not.toHaveProperty('reuseKind');
  });
});
