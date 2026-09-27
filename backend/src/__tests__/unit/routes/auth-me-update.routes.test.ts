/**
 * @fileoverview PATCH /api/v1/auth/me の楽観的ロック（任意の expectedUpdatedAt）のルート検証
 *
 * 本物の errorHandler を通し、競合（409）と不在（404）が Problem Details で返ること、
 * 版を送らない更新が従来の経路のまま動くことを確かめる。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import { Ok, Err } from '../../../types/result.js';

const mockAuthService = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  updateProfileIfUnchanged: vi.fn(),
}));

const mockPrisma = vi.hoisted(() => ({
  user: { update: vi.fn() },
}));

vi.mock('../../../db', () => ({
  default: vi.fn(() => mockPrisma),
}));

vi.mock('../../../services/auth.service', () => ({
  AuthService: class {
    constructor() {
      return mockAuthService;
    }
  },
}));

vi.mock('../../../services/two-factor.service', () => ({
  TwoFactorService: class {},
}));

vi.mock('../../../services/password.service', () => ({
  PasswordService: class {},
}));

vi.mock('../../../middleware/rateLimit.middleware', () => ({
  loginLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
  refreshLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../middleware/authenticate.middleware', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { userId: 'user-1', email: 'user@example.com', roles: ['user'] };
    next();
  },
}));

import authRouter from '../../../routes/auth.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

const expected = '2026-09-27T01:00:00.000Z';
const actual = '2026-09-27T01:00:05.000Z';
const profile = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'New Name',
  roles: ['user'],
  permissions: [],
  createdAt: new Date(expected),
  updatedAt: new Date(actual),
  twoFactorEnabled: false,
};

describe('PATCH /api/v1/auth/me の楽観的ロック', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/v1/auth', authRouter);
    app.use(errorHandler);
    mockAuthService.getCurrentUser.mockResolvedValue(Ok(profile));
  });

  /**
   * @requirement user-authentication/REQ-25.8
   */
  it('版を送らない更新は従来どおり版を比べずに更新し、応答に新しい版（updatedAt）を含む', async () => {
    mockPrisma.user.update.mockResolvedValue({});

    const response = await request(app).patch('/api/v1/auth/me').send({ displayName: 'New Name' });

    expect(response.status).toBe(200);
    expect(response.body.updatedAt).toBe(actual);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { displayName: 'New Name' },
    });
    expect(mockAuthService.updateProfileIfUnchanged).not.toHaveBeenCalled();
  });

  /**
   * @requirement user-authentication/REQ-25.8
   */
  it('版を送った更新は条件付きの更新へ日時として渡り、成功すれば更新後のプロフィールを返す', async () => {
    mockAuthService.updateProfileIfUnchanged.mockResolvedValue(Ok(undefined));

    const response = await request(app)
      .patch('/api/v1/auth/me')
      .send({ displayName: 'New Name', expectedUpdatedAt: expected });

    expect(response.status).toBe(200);
    expect(response.body.updatedAt).toBe(actual);
    expect(mockAuthService.updateProfileIfUnchanged).toHaveBeenCalledWith(
      'user-1',
      { displayName: 'New Name' },
      new Date(expected)
    );
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  /**
   * @requirement user-authentication/REQ-25.8
   */
  it('版が古いときは 409 と Problem Details（PROFILE_CONFLICT、期待と実際の版）を返す', async () => {
    mockAuthService.updateProfileIfUnchanged.mockResolvedValue(
      Err({
        type: 'PROFILE_CONFLICT',
        expectedUpdatedAt: new Date(expected),
        actualUpdatedAt: new Date(actual),
      })
    );

    const response = await request(app)
      .patch('/api/v1/auth/me')
      .send({ displayName: 'New Name', expectedUpdatedAt: expected });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      type: 'https://api.architrack.com/errors/conflict',
      title: 'PROFILE_CONFLICT',
      status: 409,
      detail: '他の操作によって更新されました。画面を更新してください',
      instance: '/api/v1/auth/me',
      code: 'PROFILE_CONFLICT',
      message: '他の操作によって更新されました。画面を更新してください',
      details: { expectedUpdatedAt: expected, actualUpdatedAt: actual },
    });
    expect(mockAuthService.getCurrentUser).not.toHaveBeenCalled();
  });

  /**
   * @requirement user-authentication/REQ-25.8
   */
  it('版を送ってもユーザーが無ければ 409 ではなく 404 の Problem Details を返す', async () => {
    mockAuthService.updateProfileIfUnchanged.mockResolvedValue(Err({ type: 'USER_NOT_FOUND' }));

    const response = await request(app)
      .patch('/api/v1/auth/me')
      .send({ displayName: 'New Name', expectedUpdatedAt: expected });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      type: 'https://api.architrack.com/errors/not-found',
      status: 404,
      code: 'USER_NOT_FOUND',
    });
  });

  /**
   * @requirement user-authentication/REQ-25.8
   */
  it('日時でない版は 400 で拒否し、更新しない', async () => {
    const response = await request(app)
      .patch('/api/v1/auth/me')
      .send({ displayName: 'New Name', expectedUpdatedAt: 'not-a-date' });

    expect(response.status).toBe(400);
    expect(mockAuthService.updateProfileIfUnchanged).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
