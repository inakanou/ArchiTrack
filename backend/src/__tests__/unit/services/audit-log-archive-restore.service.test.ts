/**
 * @fileoverview 監査ログのアーカイブの復元の単体テスト（user-authentication タスク54.2）
 *
 * Requirements (user-authentication):
 * - REQ-41.4: 復元のときに目録の件数・ハッシュ・HMAC で改ざんを検知する
 * - REQ-41.5: 指定期間の監査ログを読み取り可能な形式で返す
 *
 * 保存先をメモリ上の StorageProvider に、データベースを Prisma のモックに差し替え、
 * archiveMonth で作ったアーカイブを restore で読み戻す。実データベースと API での結果は統合テスト
 * （integration/audit-log-archive-restore.integration.test.ts）で確かめる。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { StorageProvider } from '../../../storage/storage-provider.interface.js';
import {
  ArchiveFailure,
  AuditLogArchiveService,
  RESTORE_MAX_MONTHS,
  archiveKeysOf,
  restoreMonthsOf,
} from '../../../services/audit-log-archive.service.js';
import { archiveRestoreSchema } from '../../../schemas/audit-log-archive-restore.schema.js';
import type {
  ArchiveManifest,
  AuditLogArchiveServiceDependencies,
  AuditLogRecord,
} from '../../../types/audit-log-archive.types.js';

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
}));

const KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const NOW = new Date('2026-10-01T00:00:00.000Z');

function createMemoryStorage() {
  const objects = new Map<string, Buffer>();
  return {
    type: 'local' as const,
    objects,
    upload: vi.fn(async (key: string, data: Buffer) => {
      objects.set(key, Buffer.from(data));
      return { key, size: data.length };
    }),
    get: vi.fn(async (key: string) => objects.get(key) ?? null),
    delete: vi.fn(async (key: string) => {
      objects.delete(key);
    }),
    copy: vi.fn(),
    exists: vi.fn(async (key: string) => objects.has(key)),
    getSignedUrl: vi.fn(),
    getPublicUrl: vi.fn(() => null),
    testConnection: vi.fn(async () => true),
    disconnect: vi.fn(),
  };
}

function row(id: string, createdAt: string) {
  return {
    id,
    action: 'ROLE_CREATED',
    actorId: 'actor-1',
    actorEmail: 'actor@example.com',
    actorDisplayName: 'Actor',
    targetType: 'Role',
    targetId: `role-${id}`,
    before: null,
    after: { name: id },
    metadata: { ip: '127.0.0.1' },
    createdAt: new Date(createdAt),
  };
}

function recordOf(r: ReturnType<typeof row>): AuditLogRecord {
  return { ...r, createdAt: r.createdAt.toISOString() };
}

const ROWS: Record<string, ReturnType<typeof row>[]> = {
  '2025-03': [row('a', '2025-03-01T00:00:00.000Z'), row('b', '2025-03-31T23:59:59.999Z')],
  '2025-05': [row('c', '2025-05-10T00:00:00.000Z')],
};

async function collect(iterable: AsyncIterable<AuditLogRecord>): Promise<AuditLogRecord[]> {
  const records: AuditLogRecord[] = [];
  for await (const record of iterable) {
    records.push(record);
  }
  return records;
}

describe('AuditLogArchiveService.restore', () => {
  let storage: ReturnType<typeof createMemoryStorage>;
  let prismaMock: PrismaClient;

  function createService(
    overrides: { encryptionKey?: string | undefined; storage?: unknown } = {}
  ) {
    return new AuditLogArchiveService({
      prisma: prismaMock,
      storage: ('storage' in overrides ? overrides.storage : storage) as StorageProvider | null,
      encryptionKey: 'encryptionKey' in overrides ? overrides.encryptionKey : KEY,
      auditLogService: {
        createLog: vi.fn().mockResolvedValue({}),
      } as unknown as AuditLogArchiveServiceDependencies['auditLogService'],
      adminNotificationService: {
        notifyAllAdmins: vi.fn().mockResolvedValue(undefined),
      } as unknown as AuditLogArchiveServiceDependencies['adminNotificationService'],
      clock: () => NOW,
      earliestArchiveMonth: '2010-01',
    });
  }

  beforeEach(async () => {
    storage = createMemoryStorage();
    let currentMonth = '';
    const findMany = vi.fn(async () => ROWS[currentMonth] ?? []);
    const deleteMany = vi.fn(async () => ({ count: (ROWS[currentMonth] ?? []).length }));
    const tx = { auditLog: { deleteMany }, $queryRaw: vi.fn().mockResolvedValue([]) };
    prismaMock = {
      auditLog: { findMany, deleteMany },
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaClient;
    const service = createService();
    for (const month of Object.keys(ROWS)) {
      currentMonth = month;
      expect((await service.archiveMonth(month)).ok).toBe(true);
    }
  });

  /**
   * @requirement user-authentication/REQ-41.5
   */
  it('期間に重なる月のアーカイブを照合して期間の行を返し、アーカイブの無い月は飛ばす', async () => {
    const result = await createService().restore(
      new Date('2025-03-01T00:00:00.000Z'),
      new Date('2025-05-31T23:59:59.999Z')
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.months).toEqual(['2025-03', '2025-05']);
    expect(result.value.recordCount).toBe(3);
    expect(await collect(result.value)).toEqual(
      [...ROWS['2025-03']!, ...ROWS['2025-05']!].map(recordOf)
    );
  });

  /**
   * @requirement user-authentication/REQ-41.5
   */
  it('期間の両端を含み、期間の外の行は返さない', async () => {
    const result = await createService().restore(
      new Date('2025-03-15T00:00:00.000Z'),
      new Date('2025-05-10T00:00:00.000Z')
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recordCount).toBe(2);
    expect((await collect(result.value)).map((r) => r.id)).toEqual(['b', 'c']);
  });

  /**
   * @requirement user-authentication/REQ-41.5
   */
  it('アーカイブが一つも無い期間は空の結果を返す', async () => {
    const result = await createService().restore(
      new Date('2024-01-01T00:00:00.000Z'),
      new Date('2024-12-31T23:59:59.999Z')
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.months).toEqual([]);
    expect(await collect(result.value)).toEqual([]);
  });

  /**
   * @requirement user-authentication/REQ-41.4
   */
  it('目録の件数を書き換えると INTEGRITY_FAILED を返す', async () => {
    const { manifestKey } = archiveKeysOf('2025-05');
    const manifest = JSON.parse(storage.objects.get(manifestKey)!.toString()) as ArchiveManifest;
    storage.objects.set(
      manifestKey,
      Buffer.from(JSON.stringify({ ...manifest, recordCount: 2 }), 'utf8')
    );

    const result = await createService().restore(
      new Date('2025-03-01T00:00:00.000Z'),
      new Date('2025-05-31T23:59:59.999Z')
    );

    expect(result).toEqual({ ok: false, error: { type: 'INTEGRITY_FAILED', month: '2025-05' } });
  });

  /**
   * @requirement user-authentication/REQ-41.4
   */
  it.each([
    ['createdAt', { createdAt: '2020-01-01T00:00:00.000Z' }],
    ['keyId', { keyId: '0000000000000000' }],
  ])(
    '件数・ハッシュ・期間を保ったまま目録の %s だけを書き換えても HMAC で INTEGRITY_FAILED を返す',
    async (_field, change) => {
      const { manifestKey } = archiveKeysOf('2025-03');
      const manifest = JSON.parse(storage.objects.get(manifestKey)!.toString()) as ArchiveManifest;
      const tampered = { ...manifest, ...change };
      expect(tampered.recordCount).toBe(manifest.recordCount);
      expect(tampered.plaintextSha256).toBe(manifest.plaintextSha256);
      expect(tampered.period).toEqual(manifest.period);
      storage.objects.set(manifestKey, Buffer.from(JSON.stringify(tampered), 'utf8'));

      const result = await createService().restore(
        new Date('2025-03-01T00:00:00.000Z'),
        new Date('2025-05-31T23:59:59.999Z')
      );

      expect(result).toEqual({ ok: false, error: { type: 'INTEGRITY_FAILED', month: '2025-03' } });
    }
  );

  /**
   * @requirement user-authentication/REQ-41.4
   */
  it('本文があるのに目録が無い月は飛ばさず INTEGRITY_FAILED を返す', async () => {
    storage.objects.delete(archiveKeysOf('2025-05').manifestKey);

    const result = await createService().restore(
      new Date('2025-03-01T00:00:00.000Z'),
      new Date('2025-05-31T23:59:59.999Z')
    );

    expect(result).toEqual({ ok: false, error: { type: 'INTEGRITY_FAILED', month: '2025-05' } });
  });

  /**
   * @requirement user-authentication/REQ-41.4
   */
  it('本文が壊れていれば INTEGRITY_FAILED を返す', async () => {
    const { archiveKey } = archiveKeysOf('2025-03');
    const archive = Buffer.from(storage.objects.get(archiveKey)!);
    archive[archive.length - 1] = archive[archive.length - 1]! ^ 0xff;
    storage.objects.set(archiveKey, archive);

    const result = await createService().restore(
      new Date('2025-03-01T00:00:00.000Z'),
      new Date('2025-03-31T23:59:59.999Z')
    );

    expect(result).toEqual({ ok: false, error: { type: 'INTEGRITY_FAILED', month: '2025-03' } });
  });

  /**
   * @requirement user-authentication/REQ-41.4
   */
  it('照合の後に本文が差し替えられると、繰り返しの途中で照合し直して例外を投げる', async () => {
    const result = await createService().restore(
      new Date('2025-03-01T00:00:00.000Z'),
      new Date('2025-05-31T23:59:59.999Z')
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    storage.objects.delete(archiveKeysOf('2025-05').archiveKey);

    await expect(collect(result.value)).rejects.toBeInstanceOf(ArchiveFailure);
  });

  /**
   * @requirement user-authentication/REQ-41.5
   */
  it('鍵が無ければ KEY_MISSING、保存先が無ければ STORAGE_FAILED を返す', async () => {
    const from = new Date('2025-03-01T00:00:00.000Z');
    const to = new Date('2025-03-31T23:59:59.999Z');

    expect(await createService({ encryptionKey: undefined }).restore(from, to)).toEqual({
      ok: false,
      error: { type: 'KEY_MISSING' },
    });
    expect(await createService({ storage: null }).restore(from, to)).toEqual({
      ok: false,
      error: { type: 'STORAGE_FAILED', cause: 'storage is not configured' },
    });
  });

  /**
   * @requirement user-authentication/REQ-41.5
   */
  it('保存先の読み出しの失敗は STORAGE_FAILED を返す', async () => {
    storage.exists.mockRejectedValueOnce(new Error('simulated outage'));

    const result = await createService().restore(
      new Date('2025-03-01T00:00:00.000Z'),
      new Date('2025-03-31T23:59:59.999Z')
    );

    expect(result).toEqual({
      ok: false,
      error: { type: 'STORAGE_FAILED', cause: 'simulated outage' },
    });
  });
});

describe('restoreMonthsOf', () => {
  /**
   * @requirement user-authentication/REQ-41.5
   */
  it('期間に重なる UTC の月を古い順に返し、逆順・上限超えは RangeError', () => {
    expect(
      restoreMonthsOf(new Date('2025-11-30T23:00:00.000Z'), new Date('2026-02-01T00:00:00.000Z'))
    ).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(() =>
      restoreMonthsOf(new Date('2026-02-01T00:00:00.000Z'), new Date('2026-01-01T00:00:00.000Z'))
    ).toThrow(RangeError);
    expect(
      restoreMonthsOf(new Date('2016-01-01T00:00:00.000Z'), new Date('2025-12-31T00:00:00.000Z'))
    ).toHaveLength(RESTORE_MAX_MONTHS);
    expect(() =>
      restoreMonthsOf(new Date('2016-01-01T00:00:00.000Z'), new Date('2026-01-01T00:00:00.000Z'))
    ).toThrow(RangeError);
  });
});

describe('archiveRestoreSchema', () => {
  /**
   * @requirement user-authentication/REQ-41.5
   */
  it('時差を含む日時の from と to を受け、逆順・上限超え・余分な項目・形式違いを拒む', () => {
    expect(
      archiveRestoreSchema.safeParse({
        from: '2025-03-01T00:00:00+09:00',
        to: '2025-03-31T23:59:59.999Z',
      }).success
    ).toBe(true);
    expect(
      archiveRestoreSchema.safeParse({
        from: '2025-04-01T00:00:00.000Z',
        to: '2025-03-01T00:00:00.000Z',
      }).success
    ).toBe(false);
    expect(
      archiveRestoreSchema.safeParse({
        from: '2010-01-01T00:00:00.000Z',
        to: '2025-03-01T00:00:00.000Z',
      }).success
    ).toBe(false);
    expect(
      archiveRestoreSchema.safeParse({
        from: '2025-03-01T00:00:00.000Z',
        to: '2025-03-31T00:00:00.000Z',
        extra: 1,
      }).success
    ).toBe(false);
    expect(archiveRestoreSchema.safeParse({ from: '2025-03', to: '2025-04' }).success).toBe(false);
  });
});
