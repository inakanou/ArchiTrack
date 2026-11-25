/**
 * @fileoverview システム管理者ロールの確認（SystemAdminGuard）の単体テスト（user-authentication タスク 77.1）
 *
 * @requirement user-authentication/REQ-49.9
 */

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireSystemAdmin } from '../../../middleware/require-system-admin.middleware.js';

const shared = vi.hoisted(() => ({
  prisma: { userRole: { findFirst: vi.fn() } },
  createLog: vi.fn(),
  auditLogServiceDeps: vi.fn(),
  observeSecurityAnomaly: vi.fn(),
}));

vi.mock('../../../db.js', () => ({
  default: () => shared.prisma,
}));

vi.mock('../../../services/audit-log.service.js', () => ({
  AuditLogService: class {
    constructor(deps: unknown) {
      shared.auditLogServiceDeps(deps);
    }
    createLog = shared.createLog;
  },
}));

vi.mock('../../../services/security-anomaly-monitor.service.js', () => ({
  observeSecurityAnomaly: shared.observeSecurityAnomaly,
}));

function createResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function createRequest(user?: { userId: string; email: string; roles: string[] }): Request {
  return {
    user,
    ip: '203.0.113.7',
    get: vi.fn((name: string) => (name.toLowerCase() === 'user-agent' ? 'unit-agent' : undefined)),
  } as unknown as Request;
}

describe('requireSystemAdmin', () => {
  const findFirst = vi.fn();
  const createLog = vi.fn();
  const observeAnomaly = vi.fn();
  let next: NextFunction & ReturnType<typeof vi.fn>;

  function guard() {
    return requireSystemAdmin({
      prisma: { userRole: { findFirst } },
      auditLogService: { createLog },
      observeAnomaly,
    });
  }

  beforeEach(() => {
    findFirst.mockReset();
    createLog.mockReset();
    createLog.mockResolvedValue(undefined);
    observeAnomaly.mockReset();
    next = vi.fn() as NextFunction & ReturnType<typeof vi.fn>;
  });

  it('DB でロール admin を持つ利用者は通す', async () => {
    findFirst.mockResolvedValue({ id: 'user-role-1' });
    const res = createResponse();

    await guard()(
      createRequest({ userId: 'u1', email: 'a@example.test', roles: [] }),
      res as unknown as Response,
      next
    );

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', role: { name: 'admin' } },
      select: { id: true },
    });
    expect(createLog).not.toHaveBeenCalled();
  });

  it('トークンの roles に admin があっても、DB でロール admin を持たなければ 403 で監査と異常の検知に送る', async () => {
    findFirst.mockResolvedValue(null);
    const res = createResponse();

    await guard()(
      createRequest({ userId: 'u2', email: 'b@example.test', roles: ['admin'] }),
      res as unknown as Response,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'FORBIDDEN',
      message: 'Insufficient permissions',
      code: 'SYSTEM_ADMIN_REQUIRED',
    });
    expect(createLog).toHaveBeenCalledWith({
      action: 'PERMISSION_CHECK_FAILED',
      actorId: 'u2',
      targetType: 'Role',
      targetId: 'admin',
      metadata: { required: 'role:admin', ip: '203.0.113.7', userAgent: 'unit-agent' },
    });
    expect(observeAnomaly).toHaveBeenCalledWith({
      signal: 'permission_denied',
      sourceIp: '203.0.113.7',
      userId: 'u2',
    });
  });

  it('監査の記録に失敗しても 403 を返す', async () => {
    findFirst.mockResolvedValue(null);
    createLog.mockRejectedValue(new Error('audit down'));
    const res = createResponse();

    await guard()(
      createRequest({ userId: 'u3', email: 'c@example.test', roles: [] }),
      res as unknown as Response,
      next
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('認証の後でなければ 401', async () => {
    const res = createResponse();

    await guard()(createRequest(), res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(findFirst).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('ロールの読み取りの失敗はエラーハンドラーへ渡し、通さない', async () => {
    const failure = new Error('db down');
    findFirst.mockRejectedValue(failure);
    const res = createResponse();

    await guard()(
      createRequest({ userId: 'u4', email: 'd@example.test', roles: [] }),
      res as unknown as Response,
      next
    );

    expect(next).toHaveBeenCalledWith(failure);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('User-Agent と送信元 IP が無い要求の拒否は unknown として監査と異常の検知に送る', async () => {
    findFirst.mockResolvedValue(null);
    const res = createResponse();
    const req = {
      user: { userId: 'u5', email: 'e@example.test', roles: [] },
      ip: undefined,
      get: vi.fn(() => undefined),
    } as unknown as Request;

    await guard()(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u5',
        metadata: { required: 'role:admin', ip: 'unknown', userAgent: 'unknown' },
      })
    );
    expect(observeAnomaly).toHaveBeenCalledWith({
      signal: 'permission_denied',
      sourceIp: 'unknown',
      userId: 'u5',
    });
  });

  describe('依存を省略したとき', () => {
    beforeEach(() => {
      shared.prisma.userRole.findFirst.mockReset();
      shared.createLog.mockReset();
      shared.createLog.mockResolvedValue(undefined);
      shared.auditLogServiceDeps.mockReset();
      shared.observeSecurityAnomaly.mockReset();
    });

    it('共有のクライアントでロールを読み、ロール admin を持つ利用者は通す', async () => {
      shared.prisma.userRole.findFirst.mockResolvedValue({ id: 'user-role-9' });
      const res = createResponse();

      await requireSystemAdmin()(
        createRequest({ userId: 'u6', email: 'f@example.test', roles: [] }),
        res as unknown as Response,
        next
      );

      expect(next).toHaveBeenCalledWith();
      expect(shared.prisma.userRole.findFirst).toHaveBeenCalledWith({
        where: { userId: 'u6', role: { name: 'admin' } },
        select: { id: true },
      });
      expect(shared.auditLogServiceDeps).not.toHaveBeenCalled();
      expect(shared.observeSecurityAnomaly).not.toHaveBeenCalled();
    });

    it('拒否は共有のクライアントで作った監査ログと共有の異常検知へ送り、403 を返す', async () => {
      shared.prisma.userRole.findFirst.mockResolvedValue(null);
      const res = createResponse();

      await requireSystemAdmin()(
        createRequest({ userId: 'u7', email: 'g@example.test', roles: [] }),
        res as unknown as Response,
        next
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(shared.auditLogServiceDeps).toHaveBeenCalledWith({ prisma: shared.prisma });
      expect(shared.createLog).toHaveBeenCalledWith({
        action: 'PERMISSION_CHECK_FAILED',
        actorId: 'u7',
        targetType: 'Role',
        targetId: 'admin',
        metadata: { required: 'role:admin', ip: '203.0.113.7', userAgent: 'unit-agent' },
      });
      expect(shared.observeSecurityAnomaly).toHaveBeenCalledWith({
        signal: 'permission_denied',
        sourceIp: '203.0.113.7',
        userId: 'u7',
      });
    });
  });
});
