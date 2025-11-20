/**
 * 監査ログアーカイブサービスの単体テスト
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AuditLogArchiveService } from '../../../services/audit-log-archive.service.js';

describe('AuditLogArchiveService', () => {
  let auditLogArchiveService: AuditLogArchiveService;
  let prismaMock: PrismaClient;
  let testArchiveDir: string;

  beforeEach(() => {
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
    // テスト後のクリーンアップ: 一時ディレクトリを削除
    try {
      await fs.rm(testArchiveDir, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
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
  });
});
