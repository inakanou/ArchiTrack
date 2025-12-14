/**
 * 監査ログサービスの単体テスト
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaClient } from '../../../generated/prisma/client.js';
import { AuditLogService } from '../../../services/audit-log.service.js';
import {
  CreateAuditLogInput,
  AuditLogFilter,
  AuditLogInfo,
  AuditLogAction,
  TRADING_PARTNER_AUDIT_ACTIONS,
  TradingPartnerAuditAction,
  TRADING_PARTNER_TARGET_TYPE,
} from '../../../types/audit-log.types.js';

// PrismaClientのモック
const mockPrisma = {
  auditLog: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
} as unknown as PrismaClient;

describe('AuditLogService', () => {
  let service: AuditLogService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuditLogService({ prisma: mockPrisma });
  });

  describe('createLog', () => {
    it('監査ログを作成できること', async () => {
      const input: CreateAuditLogInput = {
        action: 'USER_CREATED',
        actorId: 'user-123',
        targetType: 'User',
        targetId: 'user-456',
        before: null,
        after: { email: 'test@example.com', displayName: 'Test User' },
        metadata: { ip: '127.0.0.1', userAgent: 'Test Browser' },
      };

      const mockCreatedLog = {
        id: 'log-123',
        action: 'USER_CREATED',
        actorId: 'user-123',
        targetType: 'User',
        targetId: 'user-456',
        before: null,
        after: { email: 'test@example.com', displayName: 'Test User' },
        metadata: { ip: '127.0.0.1', userAgent: 'Test Browser' },
        createdAt: new Date('2025-11-10T00:00:00Z'),
      };

      (mockPrisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockCreatedLog);

      const result = await service.createLog(input);

      expect(result).toEqual(mockCreatedLog);
    });

    it('メタデータなしで監査ログを作成できること', async () => {
      const input: CreateAuditLogInput = {
        action: 'ROLE_CREATED',
        actorId: 'admin-123',
        targetType: 'Role',
        targetId: 'role-456',
        before: null,
        after: { name: 'New Role', description: 'Test role' },
      };

      const mockCreatedLog = {
        id: 'log-456',
        action: 'ROLE_CREATED',
        actorId: 'admin-123',
        targetType: 'Role',
        targetId: 'role-456',
        before: null,
        after: { name: 'New Role', description: 'Test role' },
        metadata: null,
        createdAt: new Date('2025-11-10T01:00:00Z'),
      };

      (mockPrisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockCreatedLog);

      const result = await service.createLog(input);

      expect(result.metadata).toBeNull();
      expect(result).toEqual(mockCreatedLog);
    });

    it('変更前後の値を記録できること', async () => {
      const input: CreateAuditLogInput = {
        action: 'USER_UPDATED',
        actorId: 'user-123',
        targetType: 'User',
        targetId: 'user-456',
        before: { displayName: 'Old Name' },
        after: { displayName: 'New Name' },
      };

      const mockCreatedLog = {
        id: 'log-789',
        action: 'USER_UPDATED',
        actorId: 'user-123',
        targetType: 'User',
        targetId: 'user-456',
        before: { displayName: 'Old Name' },
        after: { displayName: 'New Name' },
        metadata: null,
        createdAt: new Date('2025-11-10T02:00:00Z'),
      };

      (mockPrisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockCreatedLog);

      const result = await service.createLog(input);

      expect(result.before).toEqual({ displayName: 'Old Name' });
      expect(result.after).toEqual({ displayName: 'New Name' });
    });
  });

  describe('getLogs', () => {
    it('全ての監査ログを取得できること', async () => {
      const mockLogs: AuditLogInfo[] = [
        {
          id: 'log-1',
          action: 'USER_CREATED',
          actorId: 'user-123',
          targetType: 'User',
          targetId: 'user-456',
          before: null,
          after: { email: 'test1@example.com' },
          metadata: null,
          createdAt: new Date('2025-11-10T00:00:00Z'),
        },
        {
          id: 'log-2',
          action: 'USER_UPDATED',
          actorId: 'user-123',
          targetType: 'User',
          targetId: 'user-456',
          before: { displayName: 'Old' },
          after: { displayName: 'New' },
          metadata: null,
          createdAt: new Date('2025-11-10T01:00:00Z'),
        },
      ];

      (mockPrisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockLogs);

      const result = await service.getLogs();

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        select: {
          id: true,
          action: true,
          actorId: true,
          targetType: true,
          targetId: true,
          before: true,
          after: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockLogs);
    });

    it('actorIdでフィルタリングできること', async () => {
      const filter: AuditLogFilter = { actorId: 'user-123' };
      const mockLogs: AuditLogInfo[] = [
        {
          id: 'log-1',
          action: 'USER_CREATED',
          actorId: 'user-123',
          targetType: 'User',
          targetId: 'user-456',
          before: null,
          after: { email: 'test@example.com' },
          metadata: null,
          createdAt: new Date('2025-11-10T00:00:00Z'),
        },
      ];

      (mockPrisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockLogs);

      const result = await service.getLogs(filter);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { actorId: 'user-123' },
        select: {
          id: true,
          action: true,
          actorId: true,
          targetType: true,
          targetId: true,
          before: true,
          after: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockLogs);
    });

    it('targetIdでフィルタリングできること', async () => {
      const filter: AuditLogFilter = { targetId: 'role-123' };
      const mockLogs: AuditLogInfo[] = [
        {
          id: 'log-1',
          action: 'ROLE_UPDATED',
          actorId: 'admin-123',
          targetType: 'Role',
          targetId: 'role-123',
          before: '{"name":"Old Role"}',
          after: '{"name":"New Role"}',
          metadata: null,
          createdAt: new Date('2025-11-10T00:00:00Z'),
        },
      ];

      (mockPrisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockLogs);

      const result = await service.getLogs(filter);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { targetId: 'role-123' },
        select: {
          id: true,
          action: true,
          actorId: true,
          targetType: true,
          targetId: true,
          before: true,
          after: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockLogs);
    });

    it('actionでフィルタリングできること', async () => {
      const filter: AuditLogFilter = { action: 'LOGIN_SUCCESS' };
      const mockLogs: AuditLogInfo[] = [
        {
          id: 'log-1',
          action: 'LOGIN_SUCCESS',
          actorId: 'user-123',
          targetType: 'User',
          targetId: 'user-123',
          before: null,
          after: null,
          metadata: '{"ip":"127.0.0.1"}',
          createdAt: new Date('2025-11-10T00:00:00Z'),
        },
      ];

      (mockPrisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockLogs);

      const result = await service.getLogs(filter);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { action: 'LOGIN_SUCCESS' },
        select: {
          id: true,
          action: true,
          actorId: true,
          targetType: true,
          targetId: true,
          before: true,
          after: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockLogs);
    });

    it('日付範囲でフィルタリングできること', async () => {
      const filter: AuditLogFilter = {
        startDate: '2025-11-10T00:00:00Z',
        endDate: '2025-11-11T00:00:00Z',
      };
      const mockLogs: AuditLogInfo[] = [
        {
          id: 'log-1',
          action: 'USER_CREATED',
          actorId: 'user-123',
          targetType: 'User',
          targetId: 'user-456',
          before: null,
          after: '{"email":"test@example.com"}',
          metadata: null,
          createdAt: new Date('2025-11-10T12:00:00Z'),
        },
      ];

      (mockPrisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockLogs);

      const result = await service.getLogs(filter);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: new Date('2025-11-10T00:00:00Z'),
            lte: new Date('2025-11-11T00:00:00Z'),
          },
        },
        select: {
          id: true,
          action: true,
          actorId: true,
          targetType: true,
          targetId: true,
          before: true,
          after: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockLogs);
    });

    it('複数条件でフィルタリングできること', async () => {
      const filter: AuditLogFilter = {
        actorId: 'user-123',
        action: 'USER_UPDATED',
        startDate: '2025-11-10T00:00:00Z',
      };
      const mockLogs: AuditLogInfo[] = [];

      (mockPrisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockLogs);

      const result = await service.getLogs(filter);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          actorId: 'user-123',
          action: 'USER_UPDATED',
          createdAt: {
            gte: new Date('2025-11-10T00:00:00Z'),
          },
        },
        select: {
          id: true,
          action: true,
          actorId: true,
          targetType: true,
          targetId: true,
          before: true,
          after: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([]);
    });

    it('ページネーションが機能すること（skip/take）', async () => {
      const filter: AuditLogFilter = { skip: 10, take: 5 };
      const mockLogs: AuditLogInfo[] = [
        {
          id: 'log-11',
          action: 'USER_CREATED',
          actorId: 'user-123',
          targetType: 'User',
          targetId: 'user-456',
          before: null,
          after: '{"email":"test11@example.com"}',
          metadata: null,
          createdAt: new Date('2025-11-10T11:00:00Z'),
        },
      ];

      (mockPrisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockLogs);

      const result = await service.getLogs(filter);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        select: {
          id: true,
          action: true,
          actorId: true,
          targetType: true,
          targetId: true,
          before: true,
          after: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 5,
      });
      expect(result).toEqual(mockLogs);
    });
  });

  describe('exportLogs', () => {
    it('監査ログをJSON形式でエクスポートできること', async () => {
      const mockLogs: AuditLogInfo[] = [
        {
          id: 'log-1',
          action: 'USER_CREATED',
          actorId: 'user-123',
          targetType: 'User',
          targetId: 'user-456',
          before: null,
          after: '{"email":"test@example.com"}',
          metadata: '{"ip":"127.0.0.1"}',
          createdAt: new Date('2025-11-10T00:00:00Z'),
        },
        {
          id: 'log-2',
          action: 'USER_UPDATED',
          actorId: 'user-123',
          targetType: 'User',
          targetId: 'user-456',
          before: '{"displayName":"Old"}',
          after: '{"displayName":"New"}',
          metadata: null,
          createdAt: new Date('2025-11-10T01:00:00Z'),
        },
      ];

      (mockPrisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockLogs);

      const result = await service.exportLogs();

      expect(result).toBe(JSON.stringify(mockLogs, null, 2));
    });

    it('フィルタリング条件を適用してエクスポートできること', async () => {
      const filter: AuditLogFilter = { actorId: 'user-123', action: 'LOGIN_SUCCESS' };
      const mockLogs: AuditLogInfo[] = [
        {
          id: 'log-1',
          action: 'LOGIN_SUCCESS',
          actorId: 'user-123',
          targetType: 'User',
          targetId: 'user-123',
          before: null,
          after: null,
          metadata: '{"ip":"127.0.0.1"}',
          createdAt: new Date('2025-11-10T00:00:00Z'),
        },
      ];

      (mockPrisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockLogs);

      const result = await service.exportLogs(filter);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          actorId: 'user-123',
          action: 'LOGIN_SUCCESS',
        },
        select: {
          id: true,
          action: true,
          actorId: true,
          targetType: true,
          targetId: true,
          before: true,
          after: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toBe(JSON.stringify(mockLogs, null, 2));
    });

    it('空のログをエクスポートできること', async () => {
      (mockPrisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.exportLogs();

      expect(result).toBe('[]');
    });
  });

  describe('取引先監査ログアクション', () => {
    it('TRADING_PARTNER_CREATEDがAuditLogAction型に含まれること', () => {
      const action: AuditLogAction = 'TRADING_PARTNER_CREATED';
      expect(action).toBe('TRADING_PARTNER_CREATED');
    });

    it('TRADING_PARTNER_UPDATEDがAuditLogAction型に含まれること', () => {
      const action: AuditLogAction = 'TRADING_PARTNER_UPDATED';
      expect(action).toBe('TRADING_PARTNER_UPDATED');
    });

    it('TRADING_PARTNER_DELETEDがAuditLogAction型に含まれること', () => {
      const action: AuditLogAction = 'TRADING_PARTNER_DELETED';
      expect(action).toBe('TRADING_PARTNER_DELETED');
    });

    it('TRADING_PARTNER_AUDIT_ACTIONSに3つのアクションが含まれること', () => {
      expect(TRADING_PARTNER_AUDIT_ACTIONS).toContain('TRADING_PARTNER_CREATED');
      expect(TRADING_PARTNER_AUDIT_ACTIONS).toContain('TRADING_PARTNER_UPDATED');
      expect(TRADING_PARTNER_AUDIT_ACTIONS).toContain('TRADING_PARTNER_DELETED');
      expect(TRADING_PARTNER_AUDIT_ACTIONS.length).toBe(3);
    });

    it('TradingPartnerAuditAction型がAuditLogActionのサブセットであること', () => {
      // 型の互換性テスト（コンパイル時チェック）
      const created: TradingPartnerAuditAction = 'TRADING_PARTNER_CREATED';
      const updated: TradingPartnerAuditAction = 'TRADING_PARTNER_UPDATED';
      const deleted: TradingPartnerAuditAction = 'TRADING_PARTNER_DELETED';

      // TradingPartnerAuditActionはAuditLogActionに代入可能
      const asAuditLogAction: AuditLogAction = created;
      expect(asAuditLogAction).toBe('TRADING_PARTNER_CREATED');
      expect(updated).toBe('TRADING_PARTNER_UPDATED');
      expect(deleted).toBe('TRADING_PARTNER_DELETED');
    });

    it('TRADING_PARTNER_TARGET_TYPEが正しい定数であること', () => {
      expect(TRADING_PARTNER_TARGET_TYPE).toBe('TradingPartner');
    });

    it('取引先作成の監査ログを記録できること', async () => {
      const input: CreateAuditLogInput = {
        action: 'TRADING_PARTNER_CREATED',
        actorId: 'user-123',
        targetType: 'TradingPartner',
        targetId: 'partner-456',
        before: null,
        after: {
          name: '株式会社テスト',
          nameKana: 'カブシキガイシャテスト',
          types: ['CUSTOMER'],
          address: '東京都渋谷区',
        },
        metadata: { ip: '127.0.0.1', userAgent: 'Test Browser' },
      };

      const mockCreatedLog = {
        id: 'log-tp-1',
        action: 'TRADING_PARTNER_CREATED',
        actorId: 'user-123',
        targetType: 'TradingPartner',
        targetId: 'partner-456',
        before: null,
        after: {
          name: '株式会社テスト',
          nameKana: 'カブシキガイシャテスト',
          types: ['CUSTOMER'],
          address: '東京都渋谷区',
        },
        metadata: { ip: '127.0.0.1', userAgent: 'Test Browser' },
        createdAt: new Date('2025-12-10T00:00:00Z'),
      };

      (mockPrisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockCreatedLog);

      const result = await service.createLog(input);

      expect(result.action).toBe('TRADING_PARTNER_CREATED');
      expect(result.targetType).toBe('TradingPartner');
    });

    it('取引先更新の監査ログを記録できること', async () => {
      const input: CreateAuditLogInput = {
        action: 'TRADING_PARTNER_UPDATED',
        actorId: 'user-123',
        targetType: 'TradingPartner',
        targetId: 'partner-456',
        before: {
          name: '株式会社テスト',
          phoneNumber: null,
        },
        after: {
          name: '株式会社テスト',
          phoneNumber: '03-1234-5678',
        },
        metadata: { ip: '127.0.0.1' },
      };

      const mockCreatedLog = {
        id: 'log-tp-2',
        action: 'TRADING_PARTNER_UPDATED',
        actorId: 'user-123',
        targetType: 'TradingPartner',
        targetId: 'partner-456',
        before: {
          name: '株式会社テスト',
          phoneNumber: null,
        },
        after: {
          name: '株式会社テスト',
          phoneNumber: '03-1234-5678',
        },
        metadata: { ip: '127.0.0.1' },
        createdAt: new Date('2025-12-10T01:00:00Z'),
      };

      (mockPrisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockCreatedLog);

      const result = await service.createLog(input);

      expect(result.action).toBe('TRADING_PARTNER_UPDATED');
      expect(result.before).toEqual({ name: '株式会社テスト', phoneNumber: null });
      expect(result.after).toEqual({ name: '株式会社テスト', phoneNumber: '03-1234-5678' });
    });

    it('取引先削除の監査ログを記録できること', async () => {
      const input: CreateAuditLogInput = {
        action: 'TRADING_PARTNER_DELETED',
        actorId: 'user-123',
        targetType: 'TradingPartner',
        targetId: 'partner-456',
        before: {
          name: '株式会社テスト',
          nameKana: 'カブシキガイシャテスト',
        },
        after: null,
        metadata: { ip: '127.0.0.1' },
      };

      const mockCreatedLog = {
        id: 'log-tp-3',
        action: 'TRADING_PARTNER_DELETED',
        actorId: 'user-123',
        targetType: 'TradingPartner',
        targetId: 'partner-456',
        before: {
          name: '株式会社テスト',
          nameKana: 'カブシキガイシャテスト',
        },
        after: null,
        metadata: { ip: '127.0.0.1' },
        createdAt: new Date('2025-12-10T02:00:00Z'),
      };

      (mockPrisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockCreatedLog);

      const result = await service.createLog(input);

      expect(result.action).toBe('TRADING_PARTNER_DELETED');
      expect(result.before).toEqual({
        name: '株式会社テスト',
        nameKana: 'カブシキガイシャテスト',
      });
      expect(result.after).toBeNull();
    });

    it('取引先アクションでフィルタリングできること', async () => {
      const filter: AuditLogFilter = { action: 'TRADING_PARTNER_CREATED' };
      const mockLogs: AuditLogInfo[] = [
        {
          id: 'log-tp-1',
          action: 'TRADING_PARTNER_CREATED',
          actorId: 'user-123',
          targetType: 'TradingPartner',
          targetId: 'partner-456',
          before: null,
          after: { name: '株式会社テスト' },
          metadata: null,
          createdAt: new Date('2025-12-10T00:00:00Z'),
        },
      ];

      (mockPrisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockLogs);

      const result = await service.getLogs(filter);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { action: 'TRADING_PARTNER_CREATED' },
        select: {
          id: true,
          action: true,
          actorId: true,
          targetType: true,
          targetId: true,
          before: true,
          after: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.action).toBe('TRADING_PARTNER_CREATED');
    });
  });
});
