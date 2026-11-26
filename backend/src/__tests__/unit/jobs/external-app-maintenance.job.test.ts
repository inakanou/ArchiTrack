/**
 * 外部アプリの接続の定期処理の単体検証（user-authentication タスク76.4）
 *
 * DB を差し替え、失敗の集計とログの内容（件数と接続の ID だけで、Grant の ID と例外の文を出さない。要件48.8）、
 * 許可の一覧の読み込みの失敗で照合を行わないことを確かめる。実 DB での動作は統合検証が確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import logger from '../../../utils/logger.js';
import {
  ExternalAppMaintenanceError,
  createExternalAppMaintenanceRun,
  loadAllowedClientIds,
  reconcileExternalAppClientsAtStartup,
  runExternalAppMaintenance,
  type MaintenanceConnectionService,
} from '../../../jobs/external-app-maintenance.job.js';
import {
  CONNECTION_ABSOLUTE_MS,
  CONNECTION_IDLE_MS,
  ConnectionBatchEndError,
  ExternalAppConnectionService,
} from '../../../services/external-app-connection.service.js';
import { Err, Ok } from '../../../types/result.js';

const GRANT_ID = 'grant-secret-like-id';
const NOW = new Date('2026-11-24T00:00:00.000Z');

function fakePrisma(connections: { id: string; grantId: string }[]): PrismaClient {
  return {
    externalAppConnection: {
      findMany: vi.fn().mockResolvedValueOnce(connections).mockResolvedValue([]),
    },
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([]),
  } as unknown as PrismaClient;
}

describe('runExternalAppMaintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('期限切れの判定の失敗は接続の ID と例外の名前だけを記録し、残りを処理してから失敗を投げる', async () => {
    const service: MaintenanceConnectionService = {
      revokeForRemovedClients: vi.fn().mockResolvedValue(0),
      assertActive: vi
        .fn()
        .mockRejectedValueOnce(new Error(`token value ${GRANT_ID}`))
        .mockResolvedValueOnce(Err('NOT_ACTIVE')),
    };

    const error = await runExternalAppMaintenance(
      {
        prisma: fakePrisma([
          { id: 'c1', grantId: GRANT_ID },
          { id: 'c2', grantId: 'g2' },
        ]),
        connectionService: service,
        loadAllowedClientIds: () => ['app'],
      },
      NOW
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ExternalAppMaintenanceError);
    expect((error as ExternalAppMaintenanceError).result).toEqual({
      removedClientConnectionsEnded: 0,
      expiredConnectionsEnded: 1,
      expiredStoreRecordsDeleted: 0,
      orphanedStoreRecordsDeleted: 0,
      failures: 1,
    });
    expect(service.assertActive).toHaveBeenCalledWith(GRANT_ID, NOW);
    expect(service.assertActive).toHaveBeenCalledWith('g2', NOW);
    expect(logger.warn).toHaveBeenCalledWith(
      { connectionId: 'c1', errorName: 'Error' },
      expect.any(String)
    );
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain(GRANT_ID);
  });

  it('有効な接続は終了の数に数えない', async () => {
    const service: MaintenanceConnectionService = {
      revokeForRemovedClients: vi.fn().mockResolvedValue(2),
      assertActive: vi
        .fn()
        .mockResolvedValue(
          Ok({ id: 'c1', userId: 'u', clientId: 'app', grantId: 'g', scopes: ['read'] })
        ),
    };

    await expect(
      runExternalAppMaintenance(
        {
          prisma: fakePrisma([{ id: 'c1', grantId: 'g' }]),
          connectionService: service,
          loadAllowedClientIds: () => ['app'],
        },
        NOW
      )
    ).resolves.toEqual({
      removedClientConnectionsEnded: 2,
      expiredConnectionsEnded: 0,
      expiredStoreRecordsDeleted: 0,
      orphanedStoreRecordsDeleted: 0,
      failures: 0,
    });
    expect(service.revokeForRemovedClients).toHaveBeenCalledWith(['app']);
  });

  it('照合の一部の失敗は、終了できた数と失敗の数を結果に持つ', async () => {
    const service: MaintenanceConnectionService = {
      revokeForRemovedClients: vi.fn().mockRejectedValue(new ConnectionBatchEndError(3, 2)),
      assertActive: vi.fn(),
    };

    const error = await runExternalAppMaintenance(
      { prisma: fakePrisma([]), connectionService: service, loadAllowedClientIds: () => [] },
      NOW
    ).catch((caught: unknown) => caught);

    expect((error as ExternalAppMaintenanceError).result).toMatchObject({
      removedClientConnectionsEnded: 3,
      failures: 2,
    });
  });

  it('許可の一覧を読めなければ照合を行わず、他の段を処理してから失敗を投げる', async () => {
    const service: MaintenanceConnectionService = {
      revokeForRemovedClients: vi.fn(),
      assertActive: vi.fn().mockResolvedValue(Err('NOT_ACTIVE')),
    };
    const prisma = fakePrisma([{ id: 'c1', grantId: 'g' }]);

    const error = await runExternalAppMaintenance(
      {
        prisma,
        connectionService: service,
        loadAllowedClientIds: () => {
          throw new Error('invalid config');
        },
      },
      NOW
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ExternalAppMaintenanceError);
    expect(service.revokeForRemovedClients).not.toHaveBeenCalled();
    expect(service.assertActive).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });
});

describe('loadAllowedClientIds', () => {
  it('許可するアプリが無い環境では空を返す', () => {
    expect(loadAllowedClientIds({ NODE_ENV: 'test' })).toEqual([]);
    expect(loadAllowedClientIds({ NODE_ENV: 'test', OAUTH_ALLOWED_CLIENTS: '[]' })).toEqual([]);
  });

  it('設定が不正なら空として扱わず例外を投げる', () => {
    expect(() =>
      loadAllowedClientIds({ NODE_ENV: 'test', OAUTH_ALLOWED_CLIENTS: '[{"clientId":' })
    ).toThrow();
  });
});

describe('createExternalAppMaintenanceRun', () => {
  it('接続のサービスは最初の実行で一度だけ作り、実行のたびに許可の一覧を読む', async () => {
    const service: MaintenanceConnectionService = {
      revokeForRemovedClients: vi.fn().mockResolvedValue(0),
      assertActive: vi.fn(),
    };
    const createService = vi.fn(() => service);
    const prisma = {
      externalAppConnection: { findMany: vi.fn().mockResolvedValue([]) },
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaClient;
    const source: NodeJS.ProcessEnv = { NODE_ENV: 'test' };

    const run = createExternalAppMaintenanceRun(prisma, {
      source,
      createService,
      clock: () => NOW,
    });
    expect(createService).not.toHaveBeenCalled();
    await run();
    await run();

    expect(createService).toHaveBeenCalledTimes(1);
    expect(service.revokeForRemovedClients).toHaveBeenNthCalledWith(1, []);
    expect(service.revokeForRemovedClients).toHaveBeenNthCalledWith(2, []);
  });
});

/**
 * 許可の一覧が空のときの全接続の終了の警告（タスク76.4 のレビューの後の利用者の判断）
 *
 * @requirement user-authentication/REQ-50.6
 */
describe('許可の一覧が空のときの警告', () => {
  const EMPTY_LIST_WARNING = /OAUTH_ALLOWED_CLIENTS/;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  function emptyListWarnings(): unknown[][] {
    return vi
      .mocked(logger.warn)
      .mock.calls.filter((call) => typeof call[1] === 'string' && EMPTY_LIST_WARNING.test(call[1]));
  }

  function runWith(allowed: readonly string[], ended: number | Error) {
    const service: MaintenanceConnectionService = {
      revokeForRemovedClients:
        ended instanceof Error
          ? vi.fn().mockRejectedValue(ended)
          : vi.fn().mockResolvedValue(ended),
      assertActive: vi.fn(),
    };
    return runExternalAppMaintenance(
      { prisma: fakePrisma([]), connectionService: service, loadAllowedClientIds: () => allowed },
      NOW
    ).catch((error: unknown) => error);
  }

  it('定期処理: 一覧が空で 1 件以上終了したら、件数だけを持つ警告を残す', async () => {
    await runWith([], 3);

    expect(emptyListWarnings()).toEqual([
      [{ endedConnections: 3, trigger: 'scheduled' }, expect.stringMatching(EMPTY_LIST_WARNING)],
    ]);
    const message = emptyListWarnings()[0]?.[1] as string;
    expect(message).toMatch(/all external app connections/i);
  });

  it('定期処理: 一覧が空で一部が失敗しても、終了できた件数で警告を残す', async () => {
    await runWith([], new ConnectionBatchEndError(2, 1));

    expect(emptyListWarnings()).toEqual([
      [{ endedConnections: 2, trigger: 'scheduled' }, expect.any(String)],
    ]);
  });

  it('定期処理: 一覧が空でも終了が 0 件なら警告を出さない', async () => {
    await runWith([], 0);

    expect(emptyListWarnings()).toEqual([]);
  });

  it('定期処理: 一覧が空でなければ外れたアプリを終了しても警告を出さない', async () => {
    await runWith(['app'], 4);

    expect(emptyListWarnings()).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('起動時: 一覧が空（未設定と []）で 1 件以上終了したら警告を残し、0 件なら出さない', async () => {
    const revoke = vi
      .spyOn(ExternalAppConnectionService.prototype, 'revokeForRemovedClients')
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    const prisma = {} as PrismaClient;

    await reconcileExternalAppClientsAtStartup(prisma, { NODE_ENV: 'test' });
    await reconcileExternalAppClientsAtStartup(prisma, {
      NODE_ENV: 'test',
      OAUTH_ALLOWED_CLIENTS: '[]',
    });
    await reconcileExternalAppClientsAtStartup(prisma, { NODE_ENV: 'test' });

    expect(revoke).toHaveBeenCalledTimes(3);
    expect(emptyListWarnings()).toEqual([
      [{ endedConnections: 5, trigger: 'startup' }, expect.stringMatching(EMPTY_LIST_WARNING)],
      [{ endedConnections: 1, trigger: 'startup' }, expect.stringMatching(EMPTY_LIST_WARNING)],
    ]);
  });

  it('起動時: 一覧が空でなければ警告を出さない', async () => {
    vi.spyOn(ExternalAppConnectionService.prototype, 'revokeForRemovedClients').mockResolvedValue(
      2
    );
    vi.spyOn(
      await import('../../../oauth/client-registry.js'),
      'parseExternalAppOAuthConfig'
    ).mockReturnValue({ clients: [{ clientId: 'app' }] } as never);

    await reconcileExternalAppClientsAtStartup({} as PrismaClient, { NODE_ENV: 'test' });

    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('runExternalAppMaintenance の各段の読み進めと失敗', () => {
  const ORPHAN_MIN_AGE_SECONDS = 60 * 60;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  function activeService(): MaintenanceConnectionService {
    return {
      revokeForRemovedClients: vi.fn().mockResolvedValue(0),
      assertActive: vi.fn().mockResolvedValue(Err('NOT_ACTIVE')),
    };
  }

  /** タグ付きテンプレートの呼び出しから、埋め込まれた値だけを取り出す */
  function templateValues(call: unknown[] | undefined): unknown[] {
    return (call ?? []).slice(1);
  }

  /** 埋め込まれた Prisma.sql の断片の値 */
  function fragmentValues(value: unknown): unknown[] {
    return (value as { values: unknown[] }).values;
  }

  it('期限切れの候補は件数ごとに ID の昇順で読み、最後の ID から続きを読む', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 'c1', grantId: 'g1' },
        { id: 'c2', grantId: 'g2' },
      ])
      .mockResolvedValueOnce([{ id: 'c3', grantId: 'g3' }]);
    const prisma = {
      externalAppConnection: { findMany },
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaClient;
    const service = activeService();

    const result = await runExternalAppMaintenance(
      { prisma, connectionService: service, loadAllowedClientIds: () => ['app'], batchSize: 2 },
      NOW
    );

    expect(result.expiredConnectionsEnded).toBe(3);
    expect(findMany).toHaveBeenCalledTimes(2);
    const idleCutoff = new Date(NOW.getTime() - CONNECTION_IDLE_MS);
    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: { gt: '' },
        OR: [
          { expiresAt: { lte: NOW } },
          { lastUsedAt: { lte: idleCutoff } },
          {
            lastUsedAt: null,
            expiresAt: { lte: new Date(idleCutoff.getTime() + CONNECTION_ABSOLUTE_MS) },
            consentedAt: { lte: idleCutoff },
          },
        ],
      },
      select: { id: true, grantId: true },
      orderBy: { id: 'asc' },
      take: 2,
    });
    expect(findMany.mock.calls[1]?.[0]).toMatchObject({ where: { id: { gt: 'c2' } }, take: 2 });
    expect(vi.mocked(service.assertActive).mock.calls.map((call) => call[0])).toEqual([
      'g1',
      'g2',
      'g3',
    ]);
  });

  it('期限切れの保存データは件数に満たない回まで消し続け、消した数を合計する', async () => {
    const executeRaw = vi
      .fn()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValue(1);
    const prisma = {
      externalAppConnection: { findMany: vi.fn().mockResolvedValue([]) },
      $executeRaw: executeRaw,
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaClient;

    const result = await runExternalAppMaintenance(
      {
        prisma,
        connectionService: activeService(),
        loadAllowedClientIds: () => ['app'],
        batchSize: 2,
      },
      NOW
    );

    expect(result.expiredStoreRecordsDeleted).toBe(5);
    expect(executeRaw).toHaveBeenCalledTimes(3);
    // 期限の基準・残す種別・件数の上限を問い合わせへ渡す
    expect(templateValues(executeRaw.mock.calls[0])).toEqual([
      NOW,
      ['AuthorizationCode', 'RefreshToken'],
      2,
    ]);
  });

  it('接続の無い Grant は行をロックして確かめ直し、まだ孤立しているものだけを消す', async () => {
    const txQueryRaw = vi
      .fn()
      // g1: ロック → 確かめ直しで孤立のまま
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ grant_id: 'g1' }])
      // g2: ロック → 確かめ直しで接続ができていた
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      // g3: ロック → 孤立のまま
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ grant_id: 'g3' }]);
    const deleteMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 1 });
    const tx = { $queryRaw: txQueryRaw, oAuthStoreRecord: { deleteMany } };
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ grant_id: 'g1' }, { grant_id: 'g2' }])
      .mockResolvedValueOnce([{ grant_id: 'g3' }]);
    const prisma = {
      externalAppConnection: { findMany: vi.fn().mockResolvedValue([]) },
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRaw: queryRaw,
      $transaction: vi.fn(async (action: (client: unknown) => Promise<unknown>) => action(tx)),
    } as unknown as PrismaClient;

    const result = await runExternalAppMaintenance(
      {
        prisma,
        connectionService: activeService(),
        loadAllowedClientIds: () => ['app'],
        batchSize: 2,
      },
      NOW
    );

    expect(result).toEqual({
      removedClientConnectionsEnded: 0,
      expiredConnectionsEnded: 0,
      expiredStoreRecordsDeleted: 0,
      orphanedStoreRecordsDeleted: 4,
      failures: 0,
    });
    expect(deleteMany).toHaveBeenCalledTimes(2);
    expect(deleteMany).toHaveBeenNthCalledWith(1, { where: { grantId: 'g1' } });
    expect(deleteMany).toHaveBeenNthCalledWith(2, { where: { grantId: 'g3' } });

    // 1 ページ目は先頭から、2 ページ目は前のページの最後の Grant から読む
    expect(queryRaw).toHaveBeenCalledTimes(2);
    const issuedBefore = Math.floor(NOW.getTime() / 1000) - ORPHAN_MIN_AGE_SECONDS;
    const [firstRange, ...firstRest] = templateValues(queryRaw.mock.calls[0]);
    expect(fragmentValues(firstRange)).toEqual(['']);
    expect(firstRest).toEqual([NOW, issuedBefore, 2]);
    expect(fragmentValues(templateValues(queryRaw.mock.calls[1])[0])).toEqual(['g2']);

    // ロックは対象の Grant の行に掛け、確かめ直しはその Grant だけを 1 件で読む
    expect(templateValues(txQueryRaw.mock.calls[0])).toEqual(['g1']);
    const [onlyRange, ...onlyRest] = templateValues(txQueryRaw.mock.calls[1]);
    expect(fragmentValues(onlyRange)).toEqual(['g1']);
    expect(onlyRest).toEqual([NOW, issuedBefore, 1]);
  });

  it('Grant の消去の失敗は例外の名前だけを記録し、残りの Grant を消してから失敗を投げる', async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ grant_id: 'g2' }]),
      oAuthStoreRecord: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    const transaction = vi
      .fn()
      .mockRejectedValueOnce(new Error(`deadlock on ${GRANT_ID}`))
      .mockImplementation(async (action: (client: unknown) => Promise<unknown>) => action(tx));
    const prisma = {
      externalAppConnection: { findMany: vi.fn().mockResolvedValue([]) },
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRaw: vi.fn().mockResolvedValueOnce([{ grant_id: GRANT_ID }, { grant_id: 'g2' }]),
      $transaction: transaction,
    } as unknown as PrismaClient;

    const error = await runExternalAppMaintenance(
      { prisma, connectionService: activeService(), loadAllowedClientIds: () => ['app'] },
      NOW
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ExternalAppMaintenanceError);
    expect((error as ExternalAppMaintenanceError).result).toMatchObject({
      orphanedStoreRecordsDeleted: 2,
      failures: 1,
    });
    expect((error as Error).message).toContain('1 件');
    expect(tx.oAuthStoreRecord.deleteMany).toHaveBeenCalledWith({ where: { grantId: 'g2' } });
    expect(logger.warn).toHaveBeenCalledWith(
      { errorName: 'Error' },
      'Failed to delete an orphaned external app grant'
    );
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain(GRANT_ID);
  });

  it('段ごとの失敗はその段だけを数え、例外の名前だけを記録して全ての段を試す', async () => {
    const secret = `connection string with ${GRANT_ID}`;
    const prisma = {
      externalAppConnection: { findMany: vi.fn().mockRejectedValue(new TypeError(secret)) },
      $executeRaw: vi.fn().mockRejectedValue(new RangeError(secret)),
      // Error でない値の失敗は名前を unknown にする
      $queryRaw: vi.fn().mockRejectedValue(secret),
    } as unknown as PrismaClient;
    const service: MaintenanceConnectionService = {
      revokeForRemovedClients: vi.fn().mockRejectedValue(new SyntaxError(secret)),
      assertActive: vi.fn(),
    };

    const error = await runExternalAppMaintenance(
      { prisma, connectionService: service, loadAllowedClientIds: () => ['app'] },
      NOW
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ExternalAppMaintenanceError);
    expect((error as ExternalAppMaintenanceError).result).toEqual({
      removedClientConnectionsEnded: 0,
      expiredConnectionsEnded: 0,
      expiredStoreRecordsDeleted: 0,
      orphanedStoreRecordsDeleted: 0,
      failures: 4,
    });
    expect(service.assertActive).not.toHaveBeenCalled();
    expect(vi.mocked(logger.error).mock.calls).toEqual([
      [
        { errorName: 'SyntaxError' },
        'Failed to reconcile external app connections with the allowed clients',
      ],
      [{ errorName: 'TypeError' }, 'Failed to end expired external app connections'],
      [{ errorName: 'RangeError' }, 'Failed to delete expired OAuth store records'],
      [{ errorName: 'unknown' }, 'Failed to delete orphaned external app grants'],
    ]);
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(GRANT_ID);
  });
});

describe('createExternalAppMaintenanceRun の既定の部品', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('省略時は本番の接続のサービス・process.env の許可の一覧・現在の時刻で実行する', async () => {
    const parse = vi
      .spyOn(await import('../../../oauth/client-registry.js'), 'parseExternalAppOAuthConfig')
      .mockReturnValue({ clients: [{ clientId: 'app-from-env' }] } as never);
    const revoke = vi
      .spyOn(ExternalAppConnectionService.prototype, 'revokeForRemovedClients')
      .mockResolvedValue(0);
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      externalAppConnection: { findMany },
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaClient;

    const before = Date.now();
    await expect(createExternalAppMaintenanceRun(prisma)()).resolves.toMatchObject({
      failures: 0,
    });
    const after = Date.now();

    expect(parse).toHaveBeenCalledWith(process.env);
    expect(revoke).toHaveBeenCalledWith(['app-from-env']);
    const where = findMany.mock.calls[0]?.[0].where as { OR: [{ expiresAt: { lte: Date } }] };
    const usedNow = where.OR[0].expiresAt.lte.getTime();
    expect(usedNow).toBeGreaterThanOrEqual(before);
    expect(usedNow).toBeLessThanOrEqual(after);
  });

  it('起動時の照合は終了した数と許可するアプリの数を記録して返す', async () => {
    vi.spyOn(
      await import('../../../oauth/client-registry.js'),
      'parseExternalAppOAuthConfig'
    ).mockReturnValue({ clients: [{ clientId: 'a' }, { clientId: 'b' }] } as never);
    const revoke = vi
      .spyOn(ExternalAppConnectionService.prototype, 'revokeForRemovedClients')
      .mockResolvedValue(3);

    await expect(
      reconcileExternalAppClientsAtStartup({} as PrismaClient, { NODE_ENV: 'test' })
    ).resolves.toBe(3);

    expect(revoke).toHaveBeenCalledWith(['a', 'b']);
    expect(logger.info).toHaveBeenCalledWith(
      { endedConnections: 3, allowedClients: 2 },
      'Reconciled external app connections with the allowed clients'
    );
  });
});
