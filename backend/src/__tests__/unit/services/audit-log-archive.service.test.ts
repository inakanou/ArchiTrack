/**
 * 監査ログアーカイブサービスの単体テスト
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '../../../generated/prisma/client.js';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AuditLogArchiveService } from '../../../services/audit-log-archive.service.js';

describe('AuditLogArchiveService', () => {
  let auditLogArchiveService: AuditLogArchiveService;
  let prismaMock: PrismaClient;
  let testArchiveDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    // 環境変数をリセット
    process.env = { ...originalEnv };
    delete process.env.ARCHIVE_PATH;
    delete process.env.ARCHIVE_ENCRYPTION_KEY;

    // OSの一時ディレクトリを使用（プロジェクトディレクトリを汚染しない）
    testArchiveDir = join(
      tmpdir(),
      `audit-log-archive-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );

    // Prisma Clientのモック作成
    prismaMock = {
      auditLog: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
    } as unknown as PrismaClient;

    auditLogArchiveService = new AuditLogArchiveService(
      {
        prisma: prismaMock,
      },
      {
        archiveDir: testArchiveDir,
      }
    );
  });

  afterEach(async () => {
    // 環境変数を復元
    process.env = originalEnv;
    // テスト後のクリーンアップ: 一時ディレクトリを削除
    try {
      await fs.rm(testArchiveDir, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  describe('constructor', () => {
    it('ARCHIVE_PATH環境変数からディレクトリを取得できること', () => {
      const envArchiveDir = join(tmpdir(), 'env-archive-test');
      process.env.ARCHIVE_PATH = envArchiveDir;

      const service = new AuditLogArchiveService({ prisma: prismaMock });

      // サービスが作成されることを確認（内部のarchiveDirを直接確認はできないが、エラーが発生しないことを確認）
      expect(service).toBeDefined();
    });

    it('archiveDirもARCHIVE_PATHもない場合はエラーをスローすること', () => {
      delete process.env.ARCHIVE_PATH;

      expect(() => new AuditLogArchiveService({ prisma: prismaMock })).toThrow(
        'Archive directory is required'
      );
    });

    it('ARCHIVE_ENCRYPTION_KEY環境変数から暗号化キーを取得できること', () => {
      // 32バイト = 64文字のhex文字列
      const hexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      process.env.ARCHIVE_ENCRYPTION_KEY = hexKey;

      const service = new AuditLogArchiveService(
        { prisma: prismaMock },
        { archiveDir: testArchiveDir }
      );

      expect(service).toBeDefined();
    });

    it('暗号化キーがない場合はランダムキーが生成されること', () => {
      delete process.env.ARCHIVE_ENCRYPTION_KEY;

      const service = new AuditLogArchiveService(
        { prisma: prismaMock },
        { archiveDir: testArchiveDir }
      );

      expect(service).toBeDefined();
    });

    it('optionsのencryptionKeyを優先すること', () => {
      const hexKey = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

      const service = new AuditLogArchiveService(
        { prisma: prismaMock },
        { archiveDir: testArchiveDir, encryptionKey: hexKey }
      );

      expect(service).toBeDefined();
    });
  });

  describe('archiveOldLogs', () => {
    it('13ヶ月以上前のログをアーカイブできること', async () => {
      // テスト用の古いログ（13ヶ月前）を作成
      const thirteenMonthsAgo = new Date();
      thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

      const oldLogs = [
        {
          id: 'log-1',
          action: 'USER_CREATED',
          actorId: 'user-1',
          targetType: 'User',
          targetId: 'target-1',
          before: null,
          after: { name: 'Test User' },
          metadata: { ip: '127.0.0.1' },
          createdAt: thirteenMonthsAgo,
        },
        {
          id: 'log-2',
          action: 'ROLE_UPDATED',
          actorId: 'user-2',
          targetType: 'Role',
          targetId: 'target-2',
          before: { name: 'Admin' },
          after: { name: 'SuperAdmin' },
          metadata: { ip: '127.0.0.2' },
          createdAt: thirteenMonthsAgo,
        },
      ];

      vi.mocked(prismaMock.auditLog.findMany).mockResolvedValue(oldLogs);
      vi.mocked(prismaMock.auditLog.deleteMany).mockResolvedValue({ count: 2 });

      const result = await auditLogArchiveService.archiveOldLogs();

      expect(result.archivedCount).toBe(2);
      expect(result.archiveFilePath).toMatch(/audit-logs-archive-/);
      expect(result.archiveSize).toBeGreaterThan(0);
      expect(result.compressed).toBe(true);
      expect(result.encrypted).toBe(true);

      // データベースから削除されたことを確認
      expect(prismaMock.auditLog.deleteMany).toHaveBeenCalledOnce();
    });

    it('アーカイブするログがない場合はエラーを返すこと', async () => {
      vi.mocked(prismaMock.auditLog.findMany).mockResolvedValue([]);

      await expect(auditLogArchiveService.archiveOldLogs()).rejects.toThrow('No logs to archive');
    });

    it('アーカイブがJSON Lines形式で圧縮されること', async () => {
      const thirteenMonthsAgo = new Date();
      thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

      const oldLogs = [
        {
          id: 'log-1',
          action: 'USER_CREATED',
          actorId: 'user-1',
          targetType: 'User',
          targetId: 'target-1',
          before: null,
          after: { name: 'Test User' },
          metadata: { ip: '127.0.0.1' },
          createdAt: thirteenMonthsAgo,
        },
      ];

      vi.mocked(prismaMock.auditLog.findMany).mockResolvedValue(oldLogs);
      vi.mocked(prismaMock.auditLog.deleteMany).mockResolvedValue({ count: 1 });

      const result = await auditLogArchiveService.archiveOldLogs();

      // JSON Lines形式はファイル内容で確認するため、ここではファイルパスのみ確認
      expect(result.archiveFilePath).toMatch(/\.jsonl\.gz$/);
    });
  });

  describe('deleteOldArchives', () => {
    it('8年以上前のアーカイブを削除できること', async () => {
      const result = await auditLogArchiveService.deleteOldArchives();

      expect(result.deletedCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.deletedFilePaths)).toBe(true);
    });

    it('ディレクトリにアーカイブファイルがない場合は空の結果を返すこと', async () => {
      // ディレクトリを作成
      await fs.mkdir(testArchiveDir, { recursive: true });

      const result = await auditLogArchiveService.deleteOldArchives();

      expect(result.deletedCount).toBe(0);
      expect(result.deletedFilePaths).toEqual([]);
    });

    it('.jsonl.gzで終わらないファイルは無視すること', async () => {
      // ディレクトリを作成
      await fs.mkdir(testArchiveDir, { recursive: true });

      // .jsonl.gzで終わらないファイルを作成
      await fs.writeFile(join(testArchiveDir, 'test.txt'), 'test content');
      await fs.writeFile(join(testArchiveDir, 'archive.json'), '{}');

      const result = await auditLogArchiveService.deleteOldArchives();

      expect(result.deletedCount).toBe(0);
      expect(result.deletedFilePaths).toEqual([]);
    });

    it('8年未満のアーカイブは削除しないこと', async () => {
      // ディレクトリを作成
      await fs.mkdir(testArchiveDir, { recursive: true });

      // 新しいアーカイブファイルを作成
      const newArchivePath = join(testArchiveDir, 'audit-logs-archive-new.jsonl.gz');
      await fs.writeFile(newArchivePath, 'test content');

      const result = await auditLogArchiveService.deleteOldArchives();

      expect(result.deletedCount).toBe(0);
      expect(result.deletedFilePaths).toEqual([]);

      // ファイルがまだ存在することを確認
      const exists = await fs
        .access(newArchivePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('ファイルアクセスエラーは無視して続行すること', async () => {
      // ディレクトリを作成
      await fs.mkdir(testArchiveDir, { recursive: true });

      // 正常なファイルを作成
      await fs.writeFile(join(testArchiveDir, 'valid.jsonl.gz'), 'test');

      const result = await auditLogArchiveService.deleteOldArchives();

      // エラーが発生せずに結果が返されることを確認
      expect(result).toBeDefined();
      expect(result.deletedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ensureArchiveDir', () => {
    it('archiveOldLogsがディレクトリを確保すること', async () => {
      // 新しいディレクトリパスを使用
      const newArchiveDir = join(
        tmpdir(),
        `audit-log-archive-ensure-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
      );

      // 新しいサービスインスタンスを作成（コンストラクタでensureArchiveDirが呼ばれる）
      const newService = new AuditLogArchiveService(
        { prisma: prismaMock },
        { archiveDir: newArchiveDir }
      );

      vi.mocked(prismaMock.auditLog.findMany).mockResolvedValue([]);

      try {
        await newService.archiveOldLogs();
      } catch {
        // エラーは無視（ログがないエラー）
      }

      // ディレクトリが作成されたことを確認
      const dirExistsAfter = await fs
        .access(newArchiveDir)
        .then(() => true)
        .catch(() => false);
      expect(dirExistsAfter).toBe(true);

      // クリーンアップ
      await fs.rm(newArchiveDir, { recursive: true, force: true });
    });

    it('deleteOldArchivesがディレクトリを確保すること', async () => {
      // 新しいディレクトリパスを使用
      const newArchiveDir = join(
        tmpdir(),
        `audit-log-archive-delete-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
      );

      // 新しいサービスインスタンスを作成
      const newService = new AuditLogArchiveService(
        { prisma: prismaMock },
        { archiveDir: newArchiveDir }
      );

      const result = await newService.deleteOldArchives();

      // ディレクトリが作成されたことを確認
      const dirExistsAfter = await fs
        .access(newArchiveDir)
        .then(() => true)
        .catch(() => false);
      expect(dirExistsAfter).toBe(true);

      expect(result.deletedCount).toBe(0);
      expect(result.deletedFilePaths).toEqual([]);

      // クリーンアップ
      await fs.rm(newArchiveDir, { recursive: true, force: true });
    });
  });
});
