/**
 * @fileoverview 監査ログのアーカイブの統合検証（user-authentication タスク54.1）
 *
 * Requirements (user-authentication):
 * - REQ-41.1: 月次のアーカイブで 13 か月以上前の監査ログを暗号化してアーカイブへ移し、アクティブな監査ログから除く
 * - REQ-41.2: 8 年以上を経たアーカイブを削除する
 * - REQ-41.4: アーカイブに件数と内容の改ざんを検知できる情報を付与する
 * - REQ-41.6: アーカイブ処理の失敗ではアクティブな監査ログを削除せず、システム管理者へ通知する
 *
 * 実 PostgreSQL（監査ログのトリガー audit_logs_immutable を含む）と、一時ディレクトリの
 * LocalStorageProvider で動かす。暗号鍵は試験の中で明示し、環境に依存しない。
 *
 * 共有のデータベースの他の行を対象にしないよう、本試験の行は過去（1977〜1990 年）の作成日時で作り、
 * 判定の基準の時刻もその近くに置く。行は targetType に本試験の印を持ち、後始末はアーカイブの許可の
 * 設定の取引（deleteAuditLogsWithArchivePermission）で本試験の行だけを消す。
 */

import { createDecipheriv, hkdfSync, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

validateEnv();

import getPrismaClient from '../../db.js';
import { initRedis } from '../../redis.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { AdminNotificationService } from '../../services/admin-notification.service.js';
import { AuditLogArchiveService, archiveKeysOf } from '../../services/audit-log-archive.service.js';
import { createAuditLogArchiveRun } from '../../jobs/audit-log-archive.job.js';
import { LocalStorageProvider } from '../../storage/local-storage.provider.js';
import type { StorageProvider } from '../../storage/storage-provider.interface.js';
import type { ArchiveManifest } from '../../types/audit-log-archive.types.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { seedRoles } from '../../utils/seed-helpers.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua541-audit-archive';
const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const ARCHIVE_TARGET_TYPE = 'AuditLogArchive';

/** 本試験が扱う月（アーカイブの成否の監査はこれらの月を targetId に持つ） */
const MONTHS = ['1977-06', '1980-01', '1980-03', '1985-01', '1990-03', '1990-04'] as const;

function decryptArchive(data: Buffer, month: string): string {
  const derive = (info: string) =>
    Buffer.from(hkdfSync('sha256', Buffer.from(KEY, 'hex'), Buffer.alloc(0), info, 32));
  const decipher = createDecipheriv(
    'aes-256-gcm',
    derive('architrack-audit-archive-encryption'),
    data.subarray(1, 13)
  );
  decipher.setAAD(Buffer.from(month));
  decipher.setAuthTag(data.subarray(13, 29));
  return gunzipSync(Buffer.concat([decipher.update(data.subarray(29)), decipher.final()])).toString(
    'utf8'
  );
}

describe('監査ログのアーカイブ（統合）', () => {
  let prisma: PrismaClient;
  let storageDir: string;
  let storage: LocalStorageProvider;
  let adminEmail: string;
  let sendAdminNotificationEmail: ReturnType<typeof vi.fn>;
  let adminNotificationService: AdminNotificationService;

  function createService(options: {
    now: string;
    storage?: StorageProvider;
    encryptionKey?: string | undefined;
  }): AuditLogArchiveService {
    return new AuditLogArchiveService({
      prisma,
      storage: options.storage ?? storage,
      encryptionKey: 'encryptionKey' in options ? options.encryptionKey : KEY,
      auditLogService: new AuditLogService({ prisma }),
      adminNotificationService,
      clock: () => new Date(options.now),
      earliestArchiveMonth: '1970-01',
    });
  }

  /** 本試験の印を持つ監査ログを、与えた作成日時で作る */
  async function createRows(createdAts: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const createdAt of createdAts) {
      const row = await prisma.auditLog.create({
        data: {
          id: randomUUID(),
          action: 'ROLE_CREATED',
          actorId: null,
          targetType: MARK,
          targetId: randomUUID(),
          after: { mark: MARK },
          createdAt: new Date(createdAt),
        },
      });
      ids.push(row.id);
    }
    return ids;
  }

  async function remaining(ids: string[]): Promise<string[]> {
    const rows = await prisma.auditLog.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return rows.map((row) => row.id).sort();
  }

  async function outcomeAudits(action: string, month: string) {
    return prisma.auditLog.findMany({
      where: { action, targetType: ARCHIVE_TARGET_TYPE, targetId: month },
    });
  }

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [
        { targetType: MARK },
        { targetType: ARCHIVE_TARGET_TYPE, targetId: { in: [...MONTHS] } },
      ],
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await seedRoles(prisma);
    await cleanup();
    adminEmail = `${MARK}-admin-${randomUUID().slice(0, 8)}@example.com`;
    const admin = await createTestUser(prisma, {
      email: adminEmail,
      displayName: `${MARK}-admin`,
      passwordHash: 'not-used',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [
        { targetType: MARK },
        { targetType: ARCHIVE_TARGET_TYPE, targetId: { in: [...MONTHS] } },
      ],
    });
    storageDir = await fs.mkdtemp(join(tmpdir(), `${MARK}-`));
    storage = new LocalStorageProvider({ basePath: storageDir });
    await storage.initialize();
    // 宛先の解決（有効な admin ロールの利用者）は本物で行い、メールの投入だけを観測する
    sendAdminNotificationEmail = vi.fn().mockResolvedValue(undefined);
    adminNotificationService = new AdminNotificationService(prisma, {
      sendAdminNotificationEmail: sendAdminNotificationEmail as unknown as (
        to: string,
        subject: string,
        lines: string[]
      ) => Promise<void>,
    });
  });

  afterEach(async () => {
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  /**
   * @requirement user-authentication/REQ-41.1
   * @requirement user-authentication/REQ-41.4
   */
  it('13 か月以上前の月の行を暗号化して目録とともに書き、読み戻して照合した後に行を消し、成功を監査する。次の月の行は残る', async () => {
    const marchIds = await createRows([
      '1990-03-01T00:00:00.000Z',
      '1990-03-15T12:00:00.000Z',
      '1990-03-31T23:59:59.999Z',
    ]);
    const aprilIds = await createRows(['1990-04-01T00:00:00.000Z']);

    // 基準の時刻 1991-05-10: 13 か月前の月初 1990-04-01 より前の月がアーカイブの対象
    const result = await createService({ now: '1991-05-10T00:00:00.000Z' }).archiveMonth('1990-03');

    expect(result.ok).toBe(true);
    // 行はアクティブな監査ログから除かれ、次の月の行は残る
    expect(await remaining(marchIds)).toEqual([]);
    expect(await remaining(aprilIds)).toEqual(aprilIds);

    // 保存先に暗号化した本文と目録がある
    const { archiveKey, manifestKey } = archiveKeysOf('1990-03');
    const archive = await fs.readFile(join(storageDir, archiveKey));
    expect(archive.toString('latin1')).not.toContain(MARK);
    const lines = decryptArchive(archive, '1990-03').trimEnd().split('\n');
    expect(lines.map((line) => JSON.parse(line).id).sort()).toEqual([...marchIds].sort());

    const manifest = JSON.parse(
      await fs.readFile(join(storageDir, manifestKey), 'utf8')
    ) as ArchiveManifest;
    expect(manifest).toMatchObject({
      period: { from: '1990-03-01T00:00:00.000Z', to: '1990-03-31T23:59:59.999Z' },
      recordCount: 3,
    });
    expect(manifest.plaintextSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.hmacSha256).toMatch(/^[0-9a-f]{64}$/);

    const created = await outcomeAudits('AUDIT_ARCHIVE_CREATED', '1990-03');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      actorId: null,
      after: expect.objectContaining({ recordCount: 3 }),
    });
    expect(sendAdminNotificationEmail).not.toHaveBeenCalled();
  });

  /**
   * @requirement user-authentication/REQ-41.6
   */
  it('保存先への書き込みが失敗すると行を残し、失敗を監査し、全システム管理者へ通知する', async () => {
    const ids = await createRows(['1990-03-10T00:00:00.000Z', '1990-03-20T00:00:00.000Z']);
    const failingStorage = Object.assign(Object.create(storage) as LocalStorageProvider, {
      upload: async () => {
        throw new Error('simulated storage outage');
      },
    });

    const result = await createService({
      now: '1991-05-10T00:00:00.000Z',
      storage: failingStorage,
    }).archiveMonth('1990-03');

    expect(result).toEqual({
      ok: false,
      error: { type: 'STORAGE_FAILED', cause: 'simulated storage outage' },
    });
    expect(await remaining(ids)).toEqual([...ids].sort());
    expect(await fs.readdir(storageDir)).toEqual([]);

    const failed = await outcomeAudits('AUDIT_ARCHIVE_FAILED', '1990-03');
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ actorId: null });
    expect(await outcomeAudits('AUDIT_ARCHIVE_CREATED', '1990-03')).toHaveLength(0);

    // 有効なシステム管理者へ通知のメールが投入される
    const recipients = sendAdminNotificationEmail.mock.calls.map((call) => call[0]);
    expect(recipients).toContain(adminEmail);
    const [, subject, lines] = sendAdminNotificationEmail.mock.calls.find(
      (call) => call[0] === adminEmail
    )!;
    expect(subject).toContain('監査ログのアーカイブの失敗');
    expect((lines as string[]).join('\n')).toContain('1990-03');
  });

  /**
   * @requirement user-authentication/REQ-41.6
   */
  it('暗号鍵が無いときは乱数の鍵で書かずに失敗とし、行を残して通知する', async () => {
    const ids = await createRows(['1990-03-10T00:00:00.000Z']);

    const result = await createService({
      now: '1991-05-10T00:00:00.000Z',
      encryptionKey: undefined,
    }).archiveMonth('1990-03');

    expect(result).toEqual({ ok: false, error: { type: 'KEY_MISSING' } });
    expect(await remaining(ids)).toEqual(ids);
    expect(await fs.readdir(storageDir)).toEqual([]);
    expect(await outcomeAudits('AUDIT_ARCHIVE_FAILED', '1990-03')).toHaveLength(1);
    expect(sendAdminNotificationEmail.mock.calls.map((call) => call[0])).toContain(adminEmail);
  });

  /**
   * @requirement user-authentication/REQ-41.4
   * @requirement user-authentication/REQ-41.6
   */
  it('既にある目録と今の行が食い違うときは照合の失敗として行を残す', async () => {
    const first = await createRows(['1990-03-10T00:00:00.000Z']);
    const service = createService({ now: '1991-05-10T00:00:00.000Z' });
    expect((await service.archiveMonth('1990-03')).ok).toBe(true);
    expect(await remaining(first)).toEqual([]);

    // 同じ月に別の行が現れても、書き済みのアーカイブを上書きせず、行を消さない
    const late = await createRows(['1990-03-11T00:00:00.000Z']);
    const result = await service.archiveMonth('1990-03');
    expect(result).toEqual({ ok: false, error: { type: 'INTEGRITY_FAILED', month: '1990-03' } });
    expect(await remaining(late)).toEqual(late);
    const lines = decryptArchive(
      await fs.readFile(join(storageDir, archiveKeysOf('1990-03').archiveKey)),
      '1990-03'
    )
      .trimEnd()
      .split('\n');
    expect(lines.map((line) => JSON.parse(line).id)).toEqual(first);
  });

  /**
   * @requirement user-authentication/REQ-41.2
   */
  it('目録の期間の終わりから 8 年を過ぎたアーカイブを消し、8 年に満たないアーカイブは残す', async () => {
    await createRows(['1980-01-15T00:00:00.000Z']);
    await createRows(['1980-03-15T00:00:00.000Z']);
    const writer = createService({ now: '1982-01-01T00:00:00.000Z' });
    expect((await writer.archiveMonth('1980-01')).ok).toBe(true);
    expect((await writer.archiveMonth('1980-03')).ok).toBe(true);

    // ファイルの作成日時（いま）ではなく、目録の period.to（1980-01-31・1980-03-31）で判定する
    const result = await createService({ now: '1988-03-15T00:00:00.000Z' }).deleteArchivesOlderThan(
      8,
      new Date('1988-03-15T00:00:00.000Z')
    );

    expect(result).toEqual({ deleted: ['1980-01'] });
    const january = archiveKeysOf('1980-01');
    const march = archiveKeysOf('1980-03');
    expect(await storage.exists(january.archiveKey)).toBe(false);
    expect(await storage.exists(january.manifestKey)).toBe(false);
    expect(await storage.exists(march.archiveKey)).toBe(true);
    expect(await storage.exists(march.manifestKey)).toBe(true);
  });

  /**
   * @requirement user-authentication/REQ-41.1
   * @requirement user-authentication/REQ-41.2
   */
  it('月次の定期処理は 13 か月以上前の月をアーカイブし、続けて 8 年を過ぎたアーカイブを消す', async () => {
    // 8 年を過ぎるアーカイブを先に作る（期間の終わり 1977-06-30）
    await createRows(['1977-06-15T00:00:00.000Z']);
    expect(
      (await createService({ now: '1979-01-01T00:00:00.000Z' }).archiveMonth('1977-06')).ok
    ).toBe(true);
    const old = await createRows(['1985-01-20T00:00:00.000Z']);
    const recent = await createRows(['1985-02-20T00:00:00.000Z']);

    // 基準の時刻 1986-03-10: 13 か月前の月初 1985-02-01 より前の月（1985-01）が対象で、1985-02 は残る。
    // 8 年の基準は 1978-03-10 で、期間の終わりが 1977-06-30 のアーカイブを消す
    const now = new Date('1986-03-10T00:00:00.000Z');
    const run = createAuditLogArchiveRun(
      prisma,
      () => createService({ now: now.toISOString() }),
      () => now
    );
    const result = await run();

    expect(result.archivedMonths).toContain('1985-01');
    expect(result.archivedMonths).not.toContain('1985-02');
    expect(result.failedMonths).toEqual([]);
    expect(result.deletedArchives).toEqual(['1977-06']);
    expect(await remaining(old)).toEqual([]);
    expect(await remaining(recent)).toEqual(recent);
    expect(await storage.exists(archiveKeysOf('1985-01').manifestKey)).toBe(true);
    expect(await storage.exists(archiveKeysOf('1977-06').manifestKey)).toBe(false);
  });
});
