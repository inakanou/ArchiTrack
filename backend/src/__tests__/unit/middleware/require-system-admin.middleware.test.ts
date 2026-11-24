/**
 * @fileoverview システム管理者ロールの確認（SystemAdminGuard）の単体テスト（user-authentication タスク 77.1）
 *
 * @requirement user-authentication/REQ-49.9
 */

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireSystemAdmin } from '../../../middleware/require-system-admin.middleware.js';

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
});
