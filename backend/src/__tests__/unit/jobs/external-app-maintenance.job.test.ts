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
