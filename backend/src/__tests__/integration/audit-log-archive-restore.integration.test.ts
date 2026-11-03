/**
 * @fileoverview 監査ログのアーカイブの復元の統合検証（user-authentication タスク54.2）
 *
 * Requirements (user-authentication):
 * - REQ-41.4: アーカイブに付けた件数と内容の改ざんを検知できる情報で、復元のときに改ざんを検知する
 * - REQ-41.5: システム管理者がアーカイブの復元を要求すると、指定期間の監査ログを読み取り可能な形式で返す
 *
 * 本物のアプリ（app.ts のルート・authenticate・RBAC）と実 PostgreSQL、試験の環境の保存先
 * （STORAGE_TYPE=local）と暗号鍵（ARCHIVE_ENCRYPTION_KEY）で動かす。復元の API はこの保存先と鍵を読むため、
 * 試験のアーカイブも同じ保存先と鍵で AuditLogArchiveService.archiveMonth により作る。
 *
 * 共有のデータベースの他の行を対象にしないよう、本試験の行は 1973 年の作成日時で作り、
 * 行は targetType に本試験の印を持つ。後始末はアーカイブの許可の設定の取引で本試験の行だけを消し、
 * 保存先の本試験の月のアーカイブを消す。
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、アプリとサービスのインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import tokenService from '../../services/token.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { AuditLogArchiveService, archiveKeysOf } from '../../services/audit-log-archive.service.js';
import { getStorageProvider } from '../../storage/storage-factory.js';
import type { StorageProvider } from '../../storage/storage-provider.interface.js';
import type { ArchiveManifest, AuditLogRecord } from '../../types/audit-log-archive.types.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { seedPermissions, seedRolePermissions, seedRoles } from '../../utils/seed-helpers.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua542-archive-restore';
const ARCHIVE_TARGET_TYPE = 'AuditLogArchive';
const RESTORE_PATH = '/api/v1/audit-logs/archives/restore';

/** 本試験がアーカイブを作る月（1973-04 はアーカイブを作らない） */
const ARCHIVED_MONTHS = ['1973-02', '1973-03'] as const;
const ALL_MONTHS = [...ARCHIVED_MONTHS, '1973-04'] as const;

interface TestUser {
  id: string;
  token: string;
}

/** 監査ログの行を、アーカイブの JSON Lines の 1 行と同じ形にする */
function toRecord(row: {
  id: string;
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  actorDisplayName: string | null;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: Date;
}): AuditLogRecord {
  return {
    id: row.id,
    action: row.action,
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    actorDisplayName: row.actorDisplayName,
    targetType: row.targetType,
    targetId: row.targetId,
    before: row.before,
    after: row.after,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}

function parseJsonLines(text: string): AuditLogRecord[] {
  expect(text.endsWith('\n')).toBe(true);
  return text
    .slice(0, -1)
    .split('\n')
    .map((line) => JSON.parse(line) as AuditLogRecord);
}

function byId(records: AuditLogRecord[]): AuditLogRecord[] {
  return [...records].sort((a, b) => a.id.localeCompare(b.id));
}

describe('監査ログのアーカイブの復元（統合）', () => {
  let prisma: PrismaClient;
  let storage: StorageProvider;
  let encryptionKey: string;
  let admin: TestUser;
  let member: TestUser;
  /** アーカイブする前の元の行（月ごと） */
  const originals = new Map<string, AuditLogRecord[]>();

  function createService(): AuditLogArchiveService {
    return new AuditLogArchiveService({
      prisma,
      storage,
      encryptionKey,
      auditLogService: new AuditLogService({ prisma }),
      adminNotificationService: {
        notifyAllAdmins: async () => {
          throw new Error('本試験ではアーカイブの失敗の通知は起きない');
        },
      } as unknown as ConstructorParameters<
        typeof AuditLogArchiveService
      >[0]['adminNotificationService'],
      clock: () => new Date('1974-06-10T00:00:00.000Z'),
      earliestArchiveMonth: '1970-01',
    });
  }

  async function removeArchives(): Promise<void> {
    for (const month of ALL_MONTHS) {
      const { archiveKey, manifestKey } = archiveKeysOf(month);
      await storage.delete(archiveKey);
      await storage.delete(manifestKey);
    }
  }

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    const rbac = getSharedRBACService();
    for (const id of userIds) {
      await rbac.invalidateUserPermissionsCache(id);
    }
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [
        { targetType: MARK },
        { targetType: ARCHIVE_TARGET_TYPE, targetId: { in: [...ALL_MONTHS] } },
        { actorId: { in: userIds } },
      ],
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  async function createUser(suffix: string, roleName: string): Promise<TestUser> {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new Error(`前提の欠落: ロール ${roleName} が試験 DB に無い`);
    }
    const email = `${MARK}-${suffix}@example.com`;
    const user = await createTestUser(prisma, {
      email,
      displayName: `${MARK}-${suffix}`,
      passwordHash: 'not-used',
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const token = await tokenService.generateAccessToken({
      accessTokenGeneration: 0,
      userId: user.id,
      email,
      roles: [roleName],
    });
    return { id: user.id, token };
  }

  /** 本試験の印を持つ監査ログを、与えた作成日時で作り、元の行を返す */
  async function createRows(createdAts: string[]): Promise<AuditLogRecord[]> {
    const records: AuditLogRecord[] = [];
    for (const [index, createdAt] of createdAts.entries()) {
      const row = await prisma.auditLog.create({
        data: {
          id: randomUUID(),
          action: 'ROLE_UPDATED',
          actorId: null,
          actorEmail: `${MARK}-actor-${index}@example.com`,
          actorDisplayName: `復元の試験の実行者 ${index}`,
          targetType: MARK,
          targetId: randomUUID(),
          before: { name: `前-${index}`, nested: { values: [1, 2, 3] } },
          after: { name: `後-${index}`, flag: true },
          metadata: { ipAddress: '192.0.2.1', note: '改行\nと"引用"を含む' },
          createdAt: new Date(createdAt),
        },
      });
      records.push(toRecord(row));
    }
    return records;
  }

  async function restoredAudits(actorId: string) {
    return prisma.auditLog.findMany({
      where: { action: 'AUDIT_ARCHIVE_RESTORED', actorId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 目録の件数を書き換える（HMAC は書き換えない） */
  async function tamperManifest(month: string): Promise<void> {
    const { manifestKey } = archiveKeysOf(month);
    const data = await storage.get(manifestKey);
    if (!data) {
      throw new Error(`前提の欠落: ${month} の目録が無い`);
    }
    const manifest = JSON.parse(data.toString('utf8')) as ArchiveManifest;
    const tampered = { ...manifest, recordCount: manifest.recordCount - 1 };
    await storage.upload(manifestKey, Buffer.from(JSON.stringify(tampered), 'utf8'), {
      contentType: 'application/json',
    });
  }

  /**
   * 目録の作成日時だけを書き換える（件数・SHA-256・期間は保ち、HMAC だけが改ざんを検知できる）
   */
  async function tamperManifestCreatedAt(month: string): Promise<void> {
    const { manifestKey } = archiveKeysOf(month);
    const data = await storage.get(manifestKey);
    if (!data) {
      throw new Error(`前提の欠落: ${month} の目録が無い`);
    }
    const manifest = JSON.parse(data.toString('utf8')) as ArchiveManifest;
    const tampered = { ...manifest, createdAt: '1999-12-31T00:00:00.000Z' };
    expect(tampered.createdAt).not.toBe(manifest.createdAt);
    await storage.upload(manifestKey, Buffer.from(JSON.stringify(tampered), 'utf8'), {
      contentType: 'application/json',
    });
  }

  /** 復元の API を呼び、照合の失敗で行が返らず、失敗が監査に残ることを確かめる */
  async function expectApiIntegrityFailure(month: string): Promise<void> {
    const auditsBefore = (await restoredAudits(admin.id)).length;

    const response = await request(app)
      .post(RESTORE_PATH)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ from: '1973-02-01T00:00:00.000Z', to: '1973-03-31T23:59:59.999Z' })
      .expect(500);

    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toMatchObject({ code: 'ARCHIVE_INTEGRITY_FAILED', details: { month } });
    const body = JSON.stringify(response.body);
    for (const record of [...originals.get('1973-02')!, ...originals.get('1973-03')!]) {
      expect(body).not.toContain(record.id);
    }
    const audits = await restoredAudits(admin.id);
    expect(audits).toHaveLength(auditsBefore + 1);
    expect(audits.at(-1)!.metadata).toMatchObject({
      outcome: 'failed',
      error: { type: 'INTEGRITY_FAILED', month },
    });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    const configured = getStorageProvider();
    if (!configured) {
      throw new Error('前提の欠落: 試験の環境の保存先（STORAGE_TYPE）が設定されていない');
    }
    storage = configured;
    const key = process.env.ARCHIVE_ENCRYPTION_KEY;
    if (!key) {
      throw new Error('前提の欠落: 試験の環境の ARCHIVE_ENCRYPTION_KEY が設定されていない');
    }
    encryptionKey = key;

    await cleanup();
    await removeArchives();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    admin = await createUser('admin', 'admin');
    member = await createUser('member', 'user');
    expect(await getSharedRBACService().hasPermission(member.id, 'audit:read')).toBe(false);
  });

  beforeEach(async () => {
    // 毎回、元の行から作り直したアーカイブで始める
    await removeArchives();
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [
        { targetType: MARK },
        { targetType: ARCHIVE_TARGET_TYPE, targetId: { in: [...ALL_MONTHS] } },
      ],
    });
    originals.set(
      '1973-02',
      await createRows([
        '1973-02-01T00:00:00.000Z',
        '1973-02-14T09:30:00.000Z',
        '1973-02-28T23:59:59.999Z',
      ])
    );
    originals.set(
      '1973-03',
      await createRows(['1973-03-01T00:00:00.000Z', '1973-03-20T12:00:00.000Z'])
    );
    const service = createService();
    for (const month of ARCHIVED_MONTHS) {
      const archived = await service.archiveMonth(month);
      expect(archived.ok).toBe(true);
    }
    // アーカイブした行はアクティブな監査ログから除かれている
    expect(await prisma.auditLog.count({ where: { targetType: MARK } })).toBe(0);
  });

  afterAll(async () => {
    await removeArchives();
    await cleanup();
  });

  /**
   * @requirement user-authentication/REQ-41.5
   */
  it('サービスの復元は、期間に重なる月のアーカイブを照合し、元の行と同じ内容を返す。アーカイブの無い月は飛ばし、行を監査ログへ戻さない', async () => {
    const result = await createService().restore(
      new Date('1973-02-01T00:00:00.000Z'),
      new Date('1973-04-30T23:59:59.999Z')
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.months).toEqual(['1973-02', '1973-03']);
    expect(result.value.recordCount).toBe(5);
    const restored: AuditLogRecord[] = [];
    for await (const record of result.value) {
      restored.push(record);
    }
    expect(byId(restored)).toEqual(
      byId([...originals.get('1973-02')!, ...originals.get('1973-03')!])
    );
    expect(await prisma.auditLog.count({ where: { targetType: MARK } })).toBe(0);
  });

  /**
   * @requirement user-authentication/REQ-41.5
   */
  it('システム管理者の復元の要求に、指定期間の行を JSON Lines で返し、復元を監査に記録する', async () => {
    const response = await request(app)
      .post(RESTORE_PATH)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('User-Agent', 'archive-restore-integration')
      .send({ from: '1973-02-14T09:30:00.000Z', to: '1973-03-01T00:00:00.000Z' })
      .buffer(true)
      .parse((res, callback) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          text += chunk;
        });
        res.on('end', () => callback(null, text));
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('application/x-ndjson');
    expect(response.headers['content-disposition']).toContain('attachment');
    // 期間の両端を含み、期間の外の行は返さない
    const expected = [
      ...originals.get('1973-02')!.slice(1),
      ...originals.get('1973-03')!.slice(0, 1),
    ];
    expect(byId(parseJsonLines(response.body as string))).toEqual(byId(expected));
    expect(await prisma.auditLog.count({ where: { targetType: MARK } })).toBe(0);

    const audits = await restoredAudits(admin.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: admin.id,
      actorEmail: `${MARK}-admin@example.com`,
      targetType: ARCHIVE_TARGET_TYPE,
      targetId: '1973-02-14T09:30:00.000Z/1973-03-01T00:00:00.000Z',
    });
    expect(audits[0]!.metadata).toMatchObject({
      from: '1973-02-14T09:30:00.000Z',
      to: '1973-03-01T00:00:00.000Z',
      outcome: 'succeeded',
      months: ['1973-02', '1973-03'],
      recordCount: 3,
      userAgent: 'archive-restore-integration',
    });
  });

  /**
   * @requirement user-authentication/REQ-41.4
   * @requirement user-authentication/REQ-41.5
   */
  it('目録を改ざんすると、サービスの復元は行を返さず INTEGRITY_FAILED を返す', async () => {
    await tamperManifest('1973-03');

    const result = await createService().restore(
      new Date('1973-02-01T00:00:00.000Z'),
      new Date('1973-03-31T23:59:59.999Z')
    );

    expect(result).toEqual({ ok: false, error: { type: 'INTEGRITY_FAILED', month: '1973-03' } });
  });

  /**
   * @requirement user-authentication/REQ-41.4
   * @requirement user-authentication/REQ-41.5
   */
  it('目録を改ざんすると、復元の API は行を返さず照合の失敗を返し、失敗を監査に記録する', async () => {
    await tamperManifest('1973-02');
    const auditsBefore = (await restoredAudits(admin.id)).length;

    const response = await request(app)
      .post(RESTORE_PATH)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ from: '1973-02-01T00:00:00.000Z', to: '1973-03-31T23:59:59.999Z' })
      .expect(500);

    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toMatchObject({
      code: 'ARCHIVE_INTEGRITY_FAILED',
      details: { month: '1973-02' },
    });
    const body = JSON.stringify(response.body);
    for (const record of originals.get('1973-03')!) {
      expect(body).not.toContain(record.id);
    }

    const audits = await restoredAudits(admin.id);
    expect(audits).toHaveLength(auditsBefore + 1);
    expect(audits.at(-1)!.metadata).toMatchObject({
      outcome: 'failed',
      error: { type: 'INTEGRITY_FAILED', month: '1973-02' },
    });
  });

  /**
   * @requirement user-authentication/REQ-41.4
   * @requirement user-authentication/REQ-41.5
   */
  it('件数・ハッシュ・期間を保ったまま目録の作成日時だけを書き換えると、サービスは INTEGRITY_FAILED を返し、API は行を返さず失敗を監査に記録する', async () => {
    await tamperManifestCreatedAt('1973-03');

    const result = await createService().restore(
      new Date('1973-02-01T00:00:00.000Z'),
      new Date('1973-03-31T23:59:59.999Z')
    );
    expect(result).toEqual({ ok: false, error: { type: 'INTEGRITY_FAILED', month: '1973-03' } });

    await expectApiIntegrityFailure('1973-03');
  });

  /**
   * @requirement user-authentication/REQ-41.4
   * @requirement user-authentication/REQ-41.5
   */
  it('本文があるのに目録が消された月は飛ばさず、サービスは INTEGRITY_FAILED を返し、API は行を返さず失敗を監査に記録する', async () => {
    await storage.delete(archiveKeysOf('1973-02').manifestKey);
    expect(await storage.exists(archiveKeysOf('1973-02').archiveKey)).toBe(true);

    const result = await createService().restore(
      new Date('1973-02-01T00:00:00.000Z'),
      new Date('1973-03-31T23:59:59.999Z')
    );
    expect(result).toEqual({ ok: false, error: { type: 'INTEGRITY_FAILED', month: '1973-02' } });

    await expectApiIntegrityFailure('1973-02');
  });

  /**
   * @requirement user-authentication/REQ-41.5
   */
  it('監査ログの閲覧の権限の無い利用者は 403 になり、期間の始まりが終わりより後なら 400 になる', async () => {
    await request(app)
      .post(RESTORE_PATH)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ from: '1973-02-01T00:00:00.000Z', to: '1973-03-31T23:59:59.999Z' })
      .expect(403);
    expect(await restoredAudits(member.id)).toHaveLength(0);

    await request(app)
      .post(RESTORE_PATH)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ from: '1973-04-01T00:00:00.000Z', to: '1973-03-01T00:00:00.000Z' })
      .expect(400);
  });
});
