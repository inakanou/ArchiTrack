/**
 * 監査ログアーカイブサービスの単体テスト
 *
 * 保存先をメモリ上の StorageProvider に、データベースを Prisma のモックに差し替え、
 * 書き出し・読み戻しの照合・行の消去・失敗時の保全と通知・目録の期間による 8 年の消去・
 * 鍵の欠落で乱数の鍵を作らないことを確かめる。実データベースでの結果は統合テスト
 * （integration/audit-log-archive.integration.test.ts）で確かめる。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDecipheriv, hkdfSync } from 'crypto';
import { gunzipSync } from 'zlib';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { StorageProvider } from '../../../storage/storage-provider.interface.js';
import {
  AuditLogArchiveService,
  activeRetentionBoundary,
  archiveKeysOf,
} from '../../../services/audit-log-archive.service.js';
import type {
  ArchiveManifest,
  AuditLogArchiveServiceDependencies,
} from '../../../types/audit-log-archive.types.js';

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
}));

const KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const NOW = new Date('2026-10-01T00:00:00.000Z');

/** メモリ上の保存先 */
function createMemoryStorage() {
  const objects = new Map<string, Buffer>();
  const storage = {
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
  return storage;
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

function derive(info: string, length: number): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(KEY, 'hex'), Buffer.alloc(0), info, length));
}

/** 本文を独立に復号する（形式: 版・IV・タグ・暗号文、追加の認証データは月） */
function decryptArchive(data: Buffer, month: string): string {
  const iv = data.subarray(1, 13);
  const tag = data.subarray(13, 29);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    derive('architrack-audit-archive-encryption', 32),
    iv
  );
  decipher.setAAD(Buffer.from(month));
  decipher.setAuthTag(tag);
  return gunzipSync(Buffer.concat([decipher.update(data.subarray(29)), decipher.final()])).toString(
    'utf8'
  );
}

describe('AuditLogArchiveService', () => {
  let storage: ReturnType<typeof createMemoryStorage>;
  let prismaMock: PrismaClient;
  let findMany: ReturnType<typeof vi.fn>;
  let deleteMany: ReturnType<typeof vi.fn>;
  let queryRaw: ReturnType<typeof vi.fn>;
  let createLog: ReturnType<typeof vi.fn>;
  let notifyAllAdmins: ReturnType<typeof vi.fn>;
  let txMarker: object;

  function createService(
    overrides: { encryptionKey?: string | undefined; storage?: unknown } = {}
  ) {
    return new AuditLogArchiveService({
      prisma: prismaMock,
      storage: ('storage' in overrides ? overrides.storage : storage) as StorageProvider | null,
      encryptionKey: 'encryptionKey' in overrides ? overrides.encryptionKey : KEY,
      auditLogService: {
        createLog,
      } as unknown as AuditLogArchiveServiceDependencies['auditLogService'],
      adminNotificationService: {
        notifyAllAdmins,
      } as unknown as AuditLogArchiveServiceDependencies['adminNotificationService'],
      clock: () => NOW,
      earliestArchiveMonth: '2010-01',
    });
  }

  beforeEach(() => {
    storage = createMemoryStorage();
    findMany = vi
      .fn()
      .mockResolvedValue([
        row('a', '2025-03-01T00:00:00.000Z'),
        row('b', '2025-03-31T23:59:59.999Z'),
      ]);
    deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    queryRaw = vi.fn().mockResolvedValue([]);
    createLog = vi.fn().mockResolvedValue({});
    notifyAllAdmins = vi.fn().mockResolvedValue(undefined);
    txMarker = { auditLog: { deleteMany }, $queryRaw: queryRaw };
    prismaMock = {
      auditLog: { findMany, deleteMany },
      $queryRaw: queryRaw,
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(txMarker)),
    } as unknown as PrismaClient;
  });

  describe('archiveMonth', () => {
    it('月の行を圧縮・暗号化して目録とともに書き、照合の後に許可の設定の取引で消して成功を監査する', async () => {
      const result = await createService().archiveMonth('2025-03');

      expect(result.ok).toBe(true);
      const { archiveKey, manifestKey } = archiveKeysOf('2025-03');
      expect(archiveKey).toBe('audit-archives/2025/03.jsonl.gz.enc');
      expect(manifestKey).toBe('audit-archives/2025/03.manifest.json');

      const archive = storage.objects.get(archiveKey)!;
      expect(archive.toString('utf8')).not.toContain('actor@example.com');
      const lines = decryptArchive(archive, '2025-03').trimEnd().split('\n');
      expect(lines.map((line) => JSON.parse(line).id)).toEqual(['a', 'b']);

      const manifest = JSON.parse(storage.objects.get(manifestKey)!.toString()) as ArchiveManifest;
      expect(manifest).toMatchObject({
        period: { from: '2025-03-01T00:00:00.000Z', to: '2025-03-31T23:59:59.999Z' },
        recordCount: 2,
        createdAt: NOW.toISOString(),
      });
      expect(manifest.plaintextSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(manifest.hmacSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(manifest.keyId).not.toContain(KEY.slice(0, 16));

      // 目録は本文の後に書く
      expect(storage.upload.mock.calls.map((call) => call[0])).toEqual([archiveKey, manifestKey]);
      // 読み戻して照合してから消す
      expect(storage.get.mock.invocationCallOrder.at(-1)!).toBeLessThan(
        deleteMany.mock.invocationCallOrder[0]!
      );
      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: new Date('2025-03-01T00:00:00.000Z'),
            lte: new Date('2025-03-31T23:59:59.999Z'),
          },
        },
      });
      expect(createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUDIT_ARCHIVE_CREATED',
          actorId: null,
          targetType: 'AuditLogArchive',
          targetId: '2025-03',
        }),
        txMarker
      );
      expect(notifyAllAdmins).not.toHaveBeenCalled();
    });

    it('鍵が無いときは乱数の鍵で書かず KEY_MISSING を返し、行を残して監査と通知を行う', async () => {
      const result = await createService({ encryptionKey: undefined }).archiveMonth('2025-03');

      expect(result).toEqual({ ok: false, error: { type: 'KEY_MISSING' } });
      expect(storage.upload).not.toHaveBeenCalled();
      expect(deleteMany).not.toHaveBeenCalled();
      expect(createLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AUDIT_ARCHIVE_FAILED', targetId: '2025-03' })
      );
      expect(notifyAllAdmins).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'AUDIT_ARCHIVE_FAILED' })
      );
    });

    it('形式の違う鍵も KEY_MISSING にする', async () => {
      const result = await createService({ encryptionKey: 'short' }).archiveMonth('2025-03');
      expect(result).toEqual({ ok: false, error: { type: 'KEY_MISSING' } });
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('保存先が無いときは STORAGE_FAILED で行を残す', async () => {
      const result = await createService({ storage: null }).archiveMonth('2025-03');
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.type).toBe('STORAGE_FAILED');
      expect(deleteMany).not.toHaveBeenCalled();
      expect(notifyAllAdmins).toHaveBeenCalledTimes(1);
    });

    it('保存の失敗では行を消さず、失敗を監査し全システム管理者へ通知する', async () => {
      storage.upload.mockRejectedValueOnce(new Error('bucket unavailable'));

      const result = await createService().archiveMonth('2025-03');

      expect(result).toEqual({
        ok: false,
        error: { type: 'STORAGE_FAILED', cause: 'bucket unavailable' },
      });
      expect(deleteMany).not.toHaveBeenCalled();
      expect(createLog).toHaveBeenCalledTimes(1);
      expect(createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUDIT_ARCHIVE_FAILED',
          actorId: null,
          targetType: 'AuditLogArchive',
          targetId: '2025-03',
        })
      );
      const notification = notifyAllAdmins.mock.calls[0]![0];
      expect(notification.kind).toBe('AUDIT_ARCHIVE_FAILED');
      expect(notification.lines.join('\n')).toContain('2025-03');
      expect(notification.lines.join('\n')).not.toContain(KEY);
    });

    it('読み戻した本文が書いたものと違えば INTEGRITY_FAILED で行を残し、目録を消して次回に書き直せるようにする', async () => {
      const { archiveKey, manifestKey } = archiveKeysOf('2025-03');
      storage.get.mockImplementation(async (key: string) => {
        if (key === archiveKey && storage.objects.has(key)) {
          const data = Buffer.from(storage.objects.get(key)!);
          data.writeUInt8(data.readUInt8(data.length - 1) ^ 0xff, data.length - 1);
          return data;
        }
        return storage.objects.get(key) ?? null;
      });

      const result = await createService().archiveMonth('2025-03');

      expect(result).toEqual({ ok: false, error: { type: 'INTEGRITY_FAILED', month: '2025-03' } });
      expect(deleteMany).not.toHaveBeenCalled();
      expect(storage.objects.has(manifestKey)).toBe(false);
      expect(notifyAllAdmins).toHaveBeenCalledTimes(1);
    });

    it('消した行の数が目録と違えば取引を取り消し INTEGRITY_FAILED にする', async () => {
      deleteMany.mockResolvedValueOnce({ count: 3 });

      const result = await createService().archiveMonth('2025-03');

      expect(result).toEqual({ ok: false, error: { type: 'INTEGRITY_FAILED', month: '2025-03' } });
      expect(createLog).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AUDIT_ARCHIVE_CREATED' }),
        expect.anything()
      );
      expect(notifyAllAdmins).toHaveBeenCalledTimes(1);
    });

    it('目録が既にあれば書き直さず、保存済みの本文と今の行が一致するときだけ消す', async () => {
      await createService().archiveMonth('2025-03');
      storage.upload.mockClear();
      deleteMany.mockClear();

      const again = await createService().archiveMonth('2025-03');
      expect(again.ok).toBe(true);
      expect(storage.upload).not.toHaveBeenCalled();
      expect(deleteMany).toHaveBeenCalledTimes(1);

      // 行が変わっていれば消さない
      deleteMany.mockClear();
      findMany.mockResolvedValueOnce([row('a', '2025-03-01T00:00:00.000Z')]);
      const changed = await createService().archiveMonth('2025-03');
      expect(changed).toEqual({ ok: false, error: { type: 'INTEGRITY_FAILED', month: '2025-03' } });
      expect(storage.upload).not.toHaveBeenCalled();
      expect(deleteMany).not.toHaveBeenCalled();
    });

    it('目録の HMAC が合わなければ消さない', async () => {
      await createService().archiveMonth('2025-03');
      const { manifestKey } = archiveKeysOf('2025-03');
      const manifest = JSON.parse(storage.objects.get(manifestKey)!.toString());
      manifest.recordCount = 1;
      storage.objects.set(manifestKey, Buffer.from(JSON.stringify(manifest)));
      deleteMany.mockClear();

      const result = await createService().archiveMonth('2025-03');
      expect(result).toEqual({ ok: false, error: { type: 'INTEGRITY_FAILED', month: '2025-03' } });
      expect(deleteMany).not.toHaveBeenCalled();
    });

    it('アクティブな保持の期間の月は扱わない', async () => {
      await expect(createService().archiveMonth('2025-09')).rejects.toThrow(RangeError);
      expect(storage.upload).not.toHaveBeenCalled();
    });
  });

  describe('activeRetentionBoundary', () => {
    it('現在の月の 13 か月前の月初を境界にする', () => {
      expect(activeRetentionBoundary(new Date('2026-10-25T12:00:00.000Z')).toISOString()).toBe(
        '2025-09-01T00:00:00.000Z'
      );
      expect(activeRetentionBoundary(new Date('2026-01-31T00:00:00.000Z')).toISOString()).toBe(
        '2024-12-01T00:00:00.000Z'
      );
    });
  });

  describe('定期処理の実際の起動時刻（毎月 1 日 04:00 Asia/Tokyo = 前月末日 19:00 UTC）', () => {
    const FIRING = new Date('2026-09-30T19:00:00.000Z');

    it('境界は Asia/Tokyo の現在の月から 13 か月前の月初（UTC）にする', () => {
      expect(activeRetentionBoundary(FIRING).toISOString()).toBe('2025-09-01T00:00:00.000Z');
      // 同じ Asia/Tokyo の月の中では起動の時刻によらず同じ境界になる
      expect(activeRetentionBoundary(new Date('2026-10-31T14:59:59.999Z')).toISOString()).toBe(
        '2025-09-01T00:00:00.000Z'
      );
      expect(activeRetentionBoundary(new Date('2026-10-31T15:00:00.000Z')).toISOString()).toBe(
        '2025-10-01T00:00:00.000Z'
      );
    });

    it('2026-10-01 04:00 JST の実行は 2025-08 までをアーカイブする', async () => {
      queryRaw.mockResolvedValueOnce([{ month: '2025-08' }]);
      findMany.mockResolvedValueOnce([row('a', '2025-08-15T00:00:00.000Z')]);
      deleteMany.mockResolvedValueOnce({ count: 1 });
      const service = new AuditLogArchiveService({
        prisma: prismaMock,
        storage: storage as unknown as StorageProvider,
        encryptionKey: KEY,
        auditLogService: {
          createLog,
        } as unknown as AuditLogArchiveServiceDependencies['auditLogService'],
        adminNotificationService: {
          notifyAllAdmins,
        } as unknown as AuditLogArchiveServiceDependencies['adminNotificationService'],
        clock: () => FIRING,
        earliestArchiveMonth: '2010-01',
      });

      const result = await service.runMonthly(FIRING);

      // 対象の月の読み出しの境界が 2025-09-01（UTC）であること
      const boundaryArg = (queryRaw.mock.calls[0] as unknown[]).find(
        (value) => value instanceof Date
      ) as Date;
      expect(boundaryArg.toISOString()).toBe('2025-09-01T00:00:00.000Z');
      expect(result.archivedMonths).toEqual(['2025-08']);
      expect(result.failedMonths).toEqual([]);
    });
  });

  describe('deleteArchivesOlderThan', () => {
    async function archive(month: string) {
      const service = new AuditLogArchiveService({
        prisma: prismaMock,
        storage: storage as unknown as StorageProvider,
        encryptionKey: KEY,
        auditLogService: {
          createLog,
        } as unknown as AuditLogArchiveServiceDependencies['auditLogService'],
        adminNotificationService: {
          notifyAllAdmins,
        } as unknown as AuditLogArchiveServiceDependencies['adminNotificationService'],
        clock: () => new Date('2030-01-01T00:00:00.000Z'),
      });
      const [y, m] = month.split('-').map(Number);
      const at = new Date(Date.UTC(y!, m! - 1, 10)).toISOString();
      findMany.mockResolvedValueOnce([row(`${month}-x`, at)]);
      deleteMany.mockResolvedValueOnce({ count: 1 });
      expect((await service.archiveMonth(month)).ok).toBe(true);
    }

    it('目録の期間の終わりから 8 年を過ぎたアーカイブだけを消す', async () => {
      await archive('2016-01');
      await archive('2016-03');

      const result = await createService().deleteArchivesOlderThan(
        8,
        new Date('2024-03-15T00:00:00.000Z')
      );

      expect(result).toEqual({ deleted: ['2016-01'] });
      expect(storage.objects.has(archiveKeysOf('2016-01').archiveKey)).toBe(false);
      expect(storage.objects.has(archiveKeysOf('2016-01').manifestKey)).toBe(false);
      expect(storage.objects.has(archiveKeysOf('2016-03').manifestKey)).toBe(true);
    });

    it('目録の HMAC が合わないアーカイブは消さない', async () => {
      await archive('2016-01');
      const { manifestKey } = archiveKeysOf('2016-01');
      const manifest = JSON.parse(storage.objects.get(manifestKey)!.toString());
      manifest.period.to = '2010-01-31T23:59:59.999Z';
      manifest.hmacSha256 = '00'.repeat(32);
      storage.objects.set(manifestKey, Buffer.from(JSON.stringify(manifest)));

      const result = await createService().deleteArchivesOlderThan(
        8,
        new Date('2030-01-01T00:00:00.000Z')
      );
      expect(result).toEqual({ deleted: [] });
      expect(storage.objects.has(manifestKey)).toBe(true);
    });
  });

  describe('runMonthly', () => {
    it('13 か月以上前の行を持つ月を順にアーカイブし、失敗の月があっても続けて 8 年の消去を行う', async () => {
      queryRaw.mockResolvedValueOnce([{ month: '2025-02' }, { month: '2025-03' }]);
      findMany
        .mockResolvedValueOnce([row('a', '2025-02-10T00:00:00.000Z')])
        .mockResolvedValueOnce([row('b', '2025-03-10T00:00:00.000Z')]);
      storage.upload.mockRejectedValueOnce(new Error('bucket unavailable'));
      deleteMany.mockResolvedValueOnce({ count: 1 });

      const service = createService();
      const spy = vi.spyOn(service, 'deleteArchivesOlderThan');
      const result = await service.runMonthly(NOW);

      expect(result.archivedMonths).toEqual(['2025-03']);
      expect(result.failedMonths).toEqual([
        { month: '2025-02', error: { type: 'STORAGE_FAILED', cause: 'bucket unavailable' } },
      ]);
      expect(spy).toHaveBeenCalledWith(8, NOW);
      expect(notifyAllAdmins).toHaveBeenCalledTimes(1);
    });

    it('鍵が無いときは月ごとに通知せず、対象の月をまとめて 1 回だけ監査し通知する', async () => {
      queryRaw.mockResolvedValueOnce([{ month: '2025-02' }, { month: '2025-03' }]);

      const result = await createService({ encryptionKey: undefined }).runMonthly(NOW);

      expect(result.archivedMonths).toEqual([]);
      expect(result.failedMonths).toEqual([
        { month: '2025-02', error: { type: 'KEY_MISSING' } },
        { month: '2025-03', error: { type: 'KEY_MISSING' } },
      ]);
      expect(findMany).not.toHaveBeenCalled();
      expect(storage.upload).not.toHaveBeenCalled();
      expect(createLog).toHaveBeenCalledTimes(1);
      expect(createLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AUDIT_ARCHIVE_FAILED', targetId: 'monthly-run' })
      );
      expect(notifyAllAdmins).toHaveBeenCalledTimes(1);
      const lines = (notifyAllAdmins.mock.calls[0]![0] as { lines: string[] }).lines.join('\n');
      expect(lines).toContain('2025-02');
      expect(lines).toContain('2025-03');
    });

    it('対象の月の読み出しの失敗は監査と通知の後に投げ直す', async () => {
      queryRaw.mockRejectedValueOnce(new Error('db down'));

      await expect(createService().runMonthly(NOW)).rejects.toThrow('db down');
      expect(createLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AUDIT_ARCHIVE_FAILED', targetId: 'monthly-run' })
      );
      expect(notifyAllAdmins).toHaveBeenCalledTimes(1);
    });
  });
});
