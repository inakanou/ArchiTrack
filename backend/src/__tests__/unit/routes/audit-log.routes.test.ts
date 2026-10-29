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

const mockExportAuditService = vi.hoisted(() => ({
  record: vi.fn(),
}));

// モック: データベース
vi.mock('../../../db', () => ({
  default: vi.fn(() => ({})),
}));

// モック: サービス層
vi.mock('../../../services/audit-log.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/audit-log.service.js')>()),
  AuditLogService: class {
    constructor() {
      return mockAuditLogService;
    }
  },
}));

// モック: データ出力の記録（種別の一覧などの定数は本物を使う）
vi.mock('../../../services/export-audit.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/export-audit.service.js')>()),
  ExportAuditService: class {
    constructor() {
      return mockExportAuditService;
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
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

describe('Audit Log Routes', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();

    mockExportAuditService.record.mockResolvedValue({ ok: true, value: { recordId: 'rec-1' } });

    app = express();
    app.use(express.json());
    app.use('/api/v1/audit-logs', auditLogRouter);
    app.use(errorHandler);
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
    const exportedLogs = [
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
      {
        id: 'log-2',
        action: 'LOGIN_SUCCESS',
        actorId: 'user-123',
        targetType: 'User',
        targetId: 'user-123',
        before: null,
        after: null,
        metadata: { ipAddress: '192.168.1.1' },
        createdAt: '2025-01-02T00:00:00.000Z',
      },
    ];

    it('should export audit logs as JSON', async () => {
      (mockAuditLogService.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue(exportedLogs);

      const response = await request(app).get('/api/v1/audit-logs/export');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-disposition']).toContain(
        'attachment; filename="audit-logs-'
      );
      expect(response.text).toBe(JSON.stringify(exportedLogs, null, 2));
    });

    it('should export filtered audit logs', async () => {
      (mockAuditLogService.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue([
        exportedLogs[1],
      ]);

      const response = await request(app).get(
        '/api/v1/audit-logs/export?actorId=user-123&action=LOGIN_SUCCESS'
      );

      expect(response.status).toBe(200);
      expect(mockAuditLogService.getLogs).toHaveBeenCalledWith({
        actorId: 'user-123',
        action: 'LOGIN_SUCCESS',
      });
    });

    it('records the export as audit_log_json with the exported log ids and count', async () => {
      (mockAuditLogService.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue(exportedLogs);

      await request(app)
        .get('/api/v1/audit-logs/export')
        .set('User-Agent', 'route-test-agent')
        .expect(200);

      expect(mockExportAuditService.record).toHaveBeenCalledTimes(1);
      expect(mockExportAuditService.record).toHaveBeenCalledWith(
        'admin-user-id',
        { kind: 'audit_log_json', projectId: null, targetIds: ['log-1', 'log-2'], itemCount: 2 },
        expect.objectContaining({ userAgent: 'route-test-agent' })
      );
    });

    it('does not send the export when recording fails', async () => {
      (mockAuditLogService.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue(exportedLogs);
      mockExportAuditService.record.mockResolvedValue({
        ok: false,
        error: { type: 'RECORD_FAILED' },
      });

      const response = await request(app).get('/api/v1/audit-logs/export');

      expect(response.status).toBe(500);
      expect(response.headers['content-disposition']).toBeUndefined();
      expect(response.text).not.toContain('log-1');
    });
  });

  describe('POST /api/v1/audit-logs/exports', () => {
    const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
    const validBody = {
      kind: 'site_survey_report_pdf',
      projectId: PROJECT_ID,
      targetIds: ['survey-1'],
      itemCount: 1,
    };

    it('records the export and returns 201 with the record id', async () => {
      const response = await request(app)
        .post('/api/v1/audit-logs/exports')
        .set('User-Agent', 'route-test-agent')
        .send(validBody);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ recordId: 'rec-1' });
      expect(mockExportAuditService.record).toHaveBeenCalledWith(
        'admin-user-id',
        validBody,
        expect.objectContaining({ userAgent: 'route-test-agent' })
      );
    });

    it('accepts the itemized statement clipboard copy as a project export', async () => {
      const body = { ...validBody, kind: 'itemized_statement_clipboard', targetIds: ['stmt-1'] };

      const response = await request(app).post('/api/v1/audit-logs/exports').send(body);

      expect(response.status).toBe(201);
      expect(mockExportAuditService.record).toHaveBeenCalledWith(
        'admin-user-id',
        body,
        expect.any(Object)
      );
    });

    it('returns the generic 404 when the project is out of scope', async () => {
      mockExportAuditService.record.mockResolvedValue({
        ok: false,
        error: { type: 'PROJECT_OUT_OF_SCOPE' },
      });

      const response = await request(app).post('/api/v1/audit-logs/exports').send(validBody);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(JSON.stringify(response.body)).not.toContain(PROJECT_ID);
    });

    it('returns 500 when recording fails', async () => {
      mockExportAuditService.record.mockResolvedValue({
        ok: false,
        error: { type: 'RECORD_FAILED' },
      });

      const response = await request(app).post('/api/v1/audit-logs/exports').send(validBody);

      expect(response.status).toBe(500);
    });

    it.each([
      ['an unknown kind', { ...validBody, kind: 'secret_dump' }],
      ['a negative count', { ...validBody, itemCount: -1 }],
      ['a fractional count', { ...validBody, itemCount: 1.5 }],
      ['a project export without a project', { ...validBody, projectId: null }],
      ['an audit log export with a project', { ...validBody, kind: 'audit_log_json' }],
      [
        'an itemized statement clipboard copy without a project',
        { ...validBody, kind: 'itemized_statement_clipboard', projectId: null },
      ],
      ['a malformed project id', { ...validBody, projectId: 'not-a-uuid' }],
      ['non-string target ids', { ...validBody, targetIds: [1, 2] }],
      ['missing target ids', { kind: 'audit_log_json', projectId: null, itemCount: 0 }],
    ])('rejects %s with 400 without recording', async (_label, body) => {
      const response = await request(app).post('/api/v1/audit-logs/exports').send(body);

      expect(response.status).toBe(400);
      expect(mockExportAuditService.record).not.toHaveBeenCalled();
    });
  });
});
