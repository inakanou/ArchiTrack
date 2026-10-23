/**
 * @fileoverview 担当者候補 API（GET /api/users/assignable）を有効な利用者の ID と表示名に限るテスト
 *
 * タスク49.7: 担当者候補は is_active=true の利用者の { id, displayName } だけを返す。
 * 無効化された利用者は候補に含めず、メールアドレスやロールなど他の項目を応答に載せない。
 *
 * Requirements (user-authentication):
 * - REQ-38.5: 担当者の選択肢は有効なユーザーの ID と表示名だけで、メールアドレスとロールを含めない
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';

const mockPrisma = vi.hoisted(() => ({
  user: {
    findMany: vi.fn(),
  },
}));

vi.mock('../../../db', () => ({
  default: vi.fn(() => mockPrisma),
}));

vi.mock('../../../middleware/authenticate.middleware', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      userId: 'test-user-id',
      email: 'test@example.com',
      roles: ['user'],
    };
    next();
  },
}));

import usersRouter from '../../../routes/users.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

interface FindManyArgs {
  where: Record<string, unknown>;
  select: Record<string, unknown>;
}

function lastFindManyArgs(): FindManyArgs {
  const calls = mockPrisma.user.findMany.mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0]?.[0] as FindManyArgs;
}

describe('GET /api/users/assignable — 有効な利用者の ID と表示名だけ（38.5）', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/users', usersRouter);
    app.use(errorHandler);
  });

  it('候補の検索条件に isActive=true を含め、無効化された利用者を候補から除く', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    await request(app).get('/api/users/assignable').expect(200);

    const args = lastFindManyArgs();
    expect(args.where.isActive).toBe(true);
    // 既存の条件（admin の除外・ロック中の除外、要件17.3）は保つ
    expect(args.where).toMatchObject({
      userRoles: { none: { role: { name: 'admin' } } },
      isLocked: false,
    });
  });

  it('取得する列は id と displayName だけである', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    await request(app).get('/api/users/assignable').expect(200);

    expect(lastFindManyArgs().select).toEqual({ id: true, displayName: true });
  });

  it('データ層が他の項目を返しても、応答は id と displayName だけに限る', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        displayName: '山田太郎',
        email: 'yamada@example.com',
        roles: ['user'],
        userRoles: [{ role: { name: 'user' } }],
        isActive: true,
      },
    ]);

    const response = await request(app).get('/api/users/assignable').expect(200);

    expect(response.body).toEqual([{ id: 'user-1', displayName: '山田太郎' }]);
  });
});
