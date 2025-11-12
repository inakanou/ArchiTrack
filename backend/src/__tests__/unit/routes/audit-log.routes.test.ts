/**
 * @fileoverview 監査ログルートのテスト
 *
 * Requirements:
 * - 22: 監査ログとコンプライアンス
 *
 * TDD: RED phase - テストを先に作成
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';

// vi.hoistedを使用してモックを巻き上げ
const mockAuditLogService = vi.hoisted(() => ({
  createLog: vi.fn(),
  getLogs: vi.fn(),
  exportLogs: vi.fn(),
}));

// モック: データベース
vi.mock('../../../db', () => ({
  default: vi.fn(() => ({})),
}));

// モック: サービス層
vi.mock('../../../services/audit-log.service', () => ({
  AuditLogService: class {
    constructor() {
      return mockAuditLogService;
    }
  },
}));

// モック: 認証・認可ミドルウェア
vi.mock('../../../middleware/authenticate.middleware', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      userId: 'admin-user-id',
      email: 'admin@example.com',
      roles: ['system-admin'],
    };
    next();
  },
}));

vi.mock('../../../middleware/authorize.middleware', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// 実際のルートをインポート（モックの後にインポート）
import auditLogRouter from '../../../routes/audit-log.routes.js';

describe('Audit Log Routes', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/v1/audit-logs', auditLogRouter);
  });

  describe('GET /api/v1/audit-logs', () => {
    it('should return list of audit logs', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          action: 'ROLE_CREATED',
          actorId: 'admin-user-id',
          targetType: 'Role',
          targetId: 'role-1',
          before: null,
          after: { name: 'New Role' },
          metadata: { ipAddress: '127.0.0.1' },
          createdAt: new Date('2025-01-01T00:00:00Z'),
        },
        {
          id: 'log-2',
          action: 'PERMISSION_ASSIGNED',
          actorId: 'admin-user-id',
          targetType: 'RolePermission',
          targetId: 'role-permission-1',
          before: null,
          after: { roleId: 'role-1', permissionId: 'permission-1' },
          metadata: { ipAddress: '127.0.0.1' },
          createdAt: new Date('2025-01-01T01:00:00Z'),
        },
      ];

      (mockAuditLogService.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue(mockLogs);

      const response = await request(app).get('/api/v1/audit-logs');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toMatchObject({
        id: 'log-1',
        action: 'ROLE_CREATED',
        actorId: 'admin-user-id',
      });
    });

    it('should filter audit logs by actorId', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          action: 'ROLE_CREATED',
          actorId: 'user-123',
          targetType: 'Role',
          targetId: 'role-1',
          before: null,
          after: { name: 'New Role' },
          metadata: null,
          createdAt: new Date('2025-01-01T00:00:00Z'),
        },
      ];

      (mockAuditLogService.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue(mockLogs);

      const response = await request(app).get('/api/v1/audit-logs?actorId=user-123');

      expect(response.status).toBe(200);
      expect(mockAuditLogService.getLogs).toHaveBeenCalledWith({
        actorId: 'user-123',
      });
    });

    it('should filter audit logs by targetId', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          action: 'ROLE_UPDATED',
          actorId: 'admin-user-id',
          targetType: 'Role',
          targetId: 'role-123',
          before: { name: 'Old Name' },
          after: { name: 'New Name' },
          metadata: null,
          createdAt: new Date('2025-01-01T00:00:00Z'),
        },
      ];

      (mockAuditLogService.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue(mockLogs);

      const response = await request(app).get('/api/v1/audit-logs?targetId=role-123');

      expect(response.status).toBe(200);
      expect(mockAuditLogService.getLogs).toHaveBeenCalledWith({
        targetId: 'role-123',
      });
    });

    it('should filter audit logs by action', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          action: 'LOGIN_SUCCESS',
          actorId: 'user-123',
          targetType: 'User',
          targetId: 'user-123',
          before: null,
          after: null,
          metadata: { ipAddress: '192.168.1.1' },
          createdAt: new Date('2025-01-01T00:00:00Z'),
        },
      ];

      (mockAuditLogService.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue(mockLogs);

      const response = await request(app).get('/api/v1/audit-logs?action=LOGIN_SUCCESS');

      expect(response.status).toBe(200);
      expect(mockAuditLogService.getLogs).toHaveBeenCalledWith({
        action: 'LOGIN_SUCCESS',
      });
    });

    it('should filter audit logs by date range', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          action: 'ROLE_CREATED',
          actorId: 'admin-user-id',
          targetType: 'Role',
          targetId: 'role-1',
          before: null,
          after: { name: 'New Role' },
          metadata: null,
          createdAt: new Date('2025-01-15T00:00:00Z'),
        },
      ];

      (mockAuditLogService.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue(mockLogs);

      const response = await request(app).get(
        '/api/v1/audit-logs?startDate=2025-01-01T00:00:00Z&endDate=2025-01-31T23:59:59Z'
      );

      expect(response.status).toBe(200);
      expect(mockAuditLogService.getLogs).toHaveBeenCalledWith({
        startDate: '2025-01-01T00:00:00Z',
        endDate: '2025-01-31T23:59:59Z',
      });
    });

    it('should support pagination with skip and take', async () => {
      const mockLogs = [
        {
          id: 'log-11',
          action: 'ROLE_CREATED',
          actorId: 'admin-user-id',
          targetType: 'Role',
          targetId: 'role-11',
          before: null,
          after: { name: 'Role 11' },
          metadata: null,
          createdAt: new Date('2025-01-01T00:00:00Z'),
        },
      ];

      (mockAuditLogService.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue(mockLogs);

      const response = await request(app).get('/api/v1/audit-logs?skip=10&take=10');

      expect(response.status).toBe(200);
      expect(mockAuditLogService.getLogs).toHaveBeenCalledWith({
        skip: 10,
        take: 10,
      });
    });

    it('should return empty array when no logs exist', async () => {
      (mockAuditLogService.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const response = await request(app).get('/api/v1/audit-logs');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('GET /api/v1/audit-logs/export', () => {
    it('should export audit logs as JSON', async () => {
      const mockJsonExport = JSON.stringify(
        [
          {
            id: 'log-1',
            action: 'ROLE_CREATED',
            actorId: 'admin-user-id',
            targetType: 'Role',
            targetId: 'role-1',
            before: null,
            after: { name: 'New Role' },
            metadata: { ipAddress: '127.0.0.1' },
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        null,
        2
      );

      (mockAuditLogService.exportLogs as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonExport
      );

      const response = await request(app).get('/api/v1/audit-logs/export');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-disposition']).toContain(
        'attachment; filename="audit-logs-'
      );
      expect(response.text).toBe(mockJsonExport);
    });

    it('should export filtered audit logs', async () => {
      const mockJsonExport = JSON.stringify(
        [
          {
            id: 'log-1',
            action: 'LOGIN_SUCCESS',
            actorId: 'user-123',
            targetType: 'User',
            targetId: 'user-123',
            before: null,
            after: null,
            metadata: { ipAddress: '192.168.1.1' },
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        null,
        2
      );

      (mockAuditLogService.exportLogs as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonExport
      );

      const response = await request(app).get(
        '/api/v1/audit-logs/export?actorId=user-123&action=LOGIN_SUCCESS'
      );

      expect(response.status).toBe(200);
      expect(mockAuditLogService.exportLogs).toHaveBeenCalledWith({
        actorId: 'user-123',
        action: 'LOGIN_SUCCESS',
      });
    });
  });
});
