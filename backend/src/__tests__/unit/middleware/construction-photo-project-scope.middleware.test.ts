/**
 * @fileoverview アルバム・写真項目・工事看板の ID から案件 ID を引く解決関数と、一括の要求・現調コピーの
 * コピー元の範囲の判定部品の単体テスト（construction-photo タスク30.2）
 *
 * 判定は ProjectScopeService の偽物で与え、応答は本番のエラーハンドラーで組み立てる。
 * 本物の経路への適用は統合テスト（construction-photo-project-scope.api.integration.test.ts）が確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type { ProjectAccessDecision } from '../../../services/project-scope.service.js';

const mockPrisma = vi.hoisted(() => ({
  constructionPhotoAlbum: { findUnique: vi.fn() },
  constructionPhoto: { findUnique: vi.fn(), findMany: vi.fn() },
  constructionSignboard: { findUnique: vi.fn() },
  surveyImage: { findMany: vi.fn() },
}));

vi.mock('../../../db.js', () => ({
  default: () => mockPrisma,
}));

import {
  idsFromBodyObjectArray,
  idsFromBodyStringArray,
  requireAddressedAlbumProjectScope,
  requireAlbumProjectScope,
  requirePhotoProjectScope,
  requirePhotosProjectScope,
  requireProjectParamScope,
  requireSignboardProjectScope,
  requireSurveyImagesProjectScope,
} from '../../../middleware/construction-photo-project-scope.middleware.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';

const USER_ID = 'user-1';
const DECISIONS: Record<string, ProjectAccessDecision> = {
  'project-in-scope': 'allowed',
  'project-other-in-scope': 'allowed',
  'project-out-of-scope': 'out_of_scope',
};

function fakeScope() {
  return {
    evaluateProjectAccess: vi.fn(
      async (_userId: string, projectId: string): Promise<ProjectAccessDecision> =>
        DECISIONS[projectId] ?? 'not_found'
    ),
  };
}

function buildApp(
  method: 'get' | 'patch' | 'post',
  paths: string[],
  guard: express.RequestHandler
): { app: express.Express; reached: ReturnType<typeof vi.fn> } {
  const reached = vi.fn();
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = { userId: USER_ID, email: 'user@example.com' } as Request['user'];
    next();
  });
  app[method](paths, guard, (_req: Request, res: Response) => {
    reached();
    res.status(200).json({ ok: true });
  });
  app.use(errorHandler);
  return { app, reached };
}

const audit = { createLog: vi.fn().mockResolvedValue({}) };

beforeEach(() => {
  vi.clearAllMocks();
});

/** 範囲外の 404 が不在の 404 と同じ汎用の本文で、案件 ID を含まないことを確かめる */
function expectGenericNotFound(body: Record<string, unknown>): void {
  expect(body.code).toBe('NOT_FOUND');
  // 要求の経路を写す instance を除いて、案件 ID を含まない
  const { instance: _instance, ...rest } = body;
  expect(JSON.stringify(rest)).not.toContain('project-');
}

describe('アルバム・写真項目・工事看板・案件の ID からの解決関数', () => {
  it('アルバムの ID から引いた案件が範囲内なら通し、範囲外・アルバムの不在は同じ汎用の 404 にする', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      'get',
      ['/albums/:id'],
      requireAlbumProjectScope('id', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.constructionPhotoAlbum.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
    });
    await request(app).get('/albums/a-1').expect(200);
    expect(mockPrisma.constructionPhotoAlbum.findUnique).toHaveBeenCalledWith({
      where: { id: 'a-1' },
      select: { projectId: true },
    });

    mockPrisma.constructionPhotoAlbum.findUnique.mockResolvedValueOnce({
      projectId: 'project-out-of-scope',
    });
    const outOfScope = await request(app).get('/albums/a-2').expect(404);
    mockPrisma.constructionPhotoAlbum.findUnique.mockResolvedValueOnce(null);
    const missing = await request(app).get('/albums/a-3').expect(404);

    expectGenericNotFound(outOfScope.body);
    expect(outOfScope.body.detail).toBe(missing.body.detail);
    expect(reached).toHaveBeenCalledTimes(1);
    // 範囲外だけを記録する（不在は記録しない）
    expect(audit.createLog).toHaveBeenCalledTimes(1);
    expect(audit.createLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'PROJECT_SCOPE_DENIED',
      targetId: 'project-out-of-scope',
    });
  });

  it('写真項目の ID はアルバムを経て案件を引き、工事看板の ID は看板の案件を引く', async () => {
    const scope = fakeScope();
    const photo = buildApp(
      'get',
      ['/images/:imageId'],
      requirePhotoProjectScope('imageId', { scopeService: scope, auditLogService: audit })
    );
    mockPrisma.constructionPhoto.findUnique.mockResolvedValueOnce({
      album: { projectId: 'project-in-scope' },
    });
    await request(photo.app).get('/images/p-1').expect(200);
    expect(mockPrisma.constructionPhoto.findUnique).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      select: { album: { select: { projectId: true } } },
    });
    mockPrisma.constructionPhoto.findUnique.mockResolvedValueOnce({
      album: { projectId: 'project-out-of-scope' },
    });
    expectGenericNotFound((await request(photo.app).get('/images/p-2').expect(404)).body);

    const signboard = buildApp(
      'get',
      ['/signboards/:id'],
      requireSignboardProjectScope('id', { scopeService: scope, auditLogService: audit })
    );
    mockPrisma.constructionSignboard.findUnique.mockResolvedValueOnce({
      projectId: 'project-in-scope',
    });
    await request(signboard.app).get('/signboards/s-1').expect(200);
    mockPrisma.constructionSignboard.findUnique.mockResolvedValueOnce(null);
    expectGenericNotFound((await request(signboard.app).get('/signboards/s-2').expect(404)).body);
  });

  it('案件の ID を経路のパラメータから読んで判定する', async () => {
    const scope = fakeScope();
    const { app } = buildApp(
      'get',
      ['/projects/:projectId'],
      requireProjectParamScope('projectId', { scopeService: scope, auditLogService: audit })
    );
    await request(app).get('/projects/project-in-scope').expect(200);
    expectGenericNotFound(
      (await request(app).get('/projects/project-out-of-scope').expect(404)).body
    );
    expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, 'project-out-of-scope');
  });

  it('アルバムの配下として指したときだけアルバムの範囲を判定し、flat に指したときは判定せずに通す', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      'patch',
      ['/albums/:id/images/batch', '/images/batch'],
      requireAddressedAlbumProjectScope('id', { scopeService: scope, auditLogService: audit })
    );

    await request(app).patch('/images/batch').send({}).expect(200);
    expect(mockPrisma.constructionPhotoAlbum.findUnique).not.toHaveBeenCalled();

    mockPrisma.constructionPhotoAlbum.findUnique.mockResolvedValueOnce({
      projectId: 'project-out-of-scope',
    });
    expectGenericNotFound(
      (await request(app).patch('/albums/a-1/images/batch').send({}).expect(404)).body
    );
    expect(reached).toHaveBeenCalledTimes(1);
  });
});

describe('一括の要求の全件の判定（21.4）', () => {
  it('対象の写真項目がすべて範囲内の案件に属すれば通す（案件ごとに一度だけ判定する）', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      'patch',
      ['/batch'],
      requirePhotosProjectScope(idsFromBodyObjectArray('items'), {
        scopeService: scope,
        auditLogService: audit,
      })
    );
    mockPrisma.constructionPhoto.findMany.mockResolvedValueOnce([
      { album: { projectId: 'project-in-scope' } },
      { album: { projectId: 'project-in-scope' } },
      { album: { projectId: 'project-other-in-scope' } },
    ]);

    await request(app)
      .patch('/batch')
      .send({ items: [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }, { id: 'p-1' }] })
      .expect(200);
    expect(mockPrisma.constructionPhoto.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['p-1', 'p-2', 'p-3'] } },
      select: { album: { select: { projectId: true } } },
    });
    expect(scope.evaluateProjectAccess).toHaveBeenCalledTimes(2);
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it('1 件でも範囲外または不在なら、要求全体を同じ汎用の 404 にして後続へ進めない', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      'patch',
      ['/order'],
      requirePhotosProjectScope(idsFromBodyObjectArray('orders'), {
        scopeService: scope,
        auditLogService: audit,
      })
    );
    mockPrisma.constructionPhoto.findMany.mockResolvedValueOnce([
      { album: { projectId: 'project-in-scope' } },
      { album: { projectId: 'project-out-of-scope' } },
    ]);
    const outOfScope = await request(app)
      .patch('/order')
      .send({ orders: [{ id: 'p-1' }, { id: 'p-2' }] })
      .expect(404);

    mockPrisma.constructionPhoto.findMany.mockResolvedValueOnce([
      { album: { projectId: 'project-in-scope' } },
    ]);
    const missing = await request(app)
      .patch('/order')
      .send({ orders: [{ id: 'p-1' }, { id: 'p-missing' }] })
      .expect(404);

    const empty = await request(app).patch('/order').send({ orders: [] }).expect(404);

    for (const body of [outOfScope.body, missing.body, empty.body]) {
      expectGenericNotFound(body);
      expect(body.detail).toBe(missing.body.detail);
    }
    expect(reached).not.toHaveBeenCalled();
  });
});

describe('現調コピーのコピー元の判定（21.5）', () => {
  it('コピー元の現場調査写真の案件がすべて範囲内なら通し、範囲外・不在が混じれば同じ汎用の 404 にする', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      'post',
      ['/from-surveys'],
      requireSurveyImagesProjectScope(idsFromBodyStringArray('surveyImageIds'), {
        scopeService: scope,
        auditLogService: audit,
      })
    );

    mockPrisma.surveyImage.findMany.mockResolvedValueOnce([
      { survey: { projectId: 'project-in-scope' } },
    ]);
    await request(app)
      .post('/from-surveys')
      .send({ surveyImageIds: ['si-1'] })
      .expect(200);
    expect(mockPrisma.surveyImage.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['si-1'] } },
      select: { survey: { select: { projectId: true } } },
    });

    mockPrisma.surveyImage.findMany.mockResolvedValueOnce([
      { survey: { projectId: 'project-in-scope' } },
      { survey: { projectId: 'project-out-of-scope' } },
    ]);
    const outOfScope = await request(app)
      .post('/from-surveys')
      .send({ surveyImageIds: ['si-1', 'si-2'] })
      .expect(404);
    mockPrisma.surveyImage.findMany.mockResolvedValueOnce([]);
    const missing = await request(app)
      .post('/from-surveys')
      .send({ surveyImageIds: ['si-missing'] })
      .expect(404);

    expectGenericNotFound(outOfScope.body);
    expect(outOfScope.body.detail).toBe(missing.body.detail);
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it('本文の ID の読み取りは文字列だけを拾い、形の崩れた本文は空として扱う', () => {
    const asReq = (body: unknown) => ({ body }) as unknown as Request;
    expect(idsFromBodyStringArray('ids')(asReq({ ids: ['a', '', 1, 'b'] }))).toEqual(['a', 'b']);
    expect(idsFromBodyStringArray('ids')(asReq({ ids: 'a' }))).toEqual([]);
    expect(
      idsFromBodyObjectArray('items')(asReq({ items: [{ id: 'a' }, null, { id: 2 }] }))
    ).toEqual(['a']);
    expect(idsFromBodyObjectArray('items')(asReq(null))).toEqual([]);
  });
});
