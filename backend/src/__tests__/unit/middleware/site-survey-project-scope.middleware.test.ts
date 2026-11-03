/**
 * @fileoverview 現場調査・画像の ID から案件 ID を引く解決関数と、一括の要求の範囲の判定部品の単体テスト
 * （site-survey タスク119.1）
 *
 * 判定は ProjectScopeService の偽物で与え、応答は本番のエラーハンドラーで組み立てる。
 * 本物の経路への適用は統合テスト（site-survey-project-scope.api.integration.test.ts）が確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type { ProjectAccessDecision } from '../../../services/project-scope.service.js';

const mockPrisma = vi.hoisted(() => ({
  siteSurvey: { findUnique: vi.fn() },
  surveyImage: { findUnique: vi.fn(), findMany: vi.fn() },
}));

vi.mock('../../../db.js', () => ({
  default: () => mockPrisma,
}));

import {
  imageIdsFromBodyArray,
  requireImageProjectScope,
  requireImagesProjectScope,
  requireSurveyProjectScope,
  requireBodySurveyProjectScope,
} from '../../../middleware/site-survey-project-scope.middleware.js';
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
  path: string,
  guard: express.RequestHandler
): { app: express.Express; reached: ReturnType<typeof vi.fn> } {
  const reached = vi.fn();
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = { userId: USER_ID, email: 'user@example.com' } as Request['user'];
    next();
  });
  app[method](path, guard, (_req: Request, res: Response) => {
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

describe('現場調査・画像の ID からの解決関数', () => {
  it('現場調査の ID から引いた案件が範囲内なら通し、範囲外・現場調査の不在は同じ汎用の 404 にする', async () => {
    const scope = fakeScope();
    const { app, reached } = buildApp(
      'get',
      '/surveys/:id',
      requireSurveyProjectScope('id', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.siteSurvey.findUnique.mockResolvedValueOnce({ projectId: 'project-in-scope' });
    await request(app).get('/surveys/s-1').expect(200);
    expect(mockPrisma.siteSurvey.findUnique).toHaveBeenCalledWith({
      where: { id: 's-1' },
      select: { projectId: true },
    });

    mockPrisma.siteSurvey.findUnique.mockResolvedValueOnce({ projectId: 'project-out-of-scope' });
    const outOfScope = await request(app).get('/surveys/s-2').expect(404);
    mockPrisma.siteSurvey.findUnique.mockResolvedValueOnce(null);
    const missing = await request(app).get('/surveys/s-3').expect(404);

    expect(outOfScope.body.code).toBe('NOT_FOUND');
    expect(missing.body.code).toBe('NOT_FOUND');
    expect(JSON.stringify(outOfScope.body)).not.toContain('project-out-of-scope');
    expect(reached).toHaveBeenCalledTimes(1);
    // 不在のときは判定（案件の読み出し）まで進まない
    expect(scope.evaluateProjectAccess).toHaveBeenCalledTimes(2);
  });

  it('画像の ID から現場調査を経て案件を引く', async () => {
    const scope = fakeScope();
    const { app } = buildApp(
      'get',
      '/images/:imageId',
      requireImageProjectScope('imageId', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.surveyImage.findUnique.mockResolvedValueOnce({
      survey: { projectId: 'project-out-of-scope' },
    });
    await request(app).get('/images/i-1').expect(404);
    expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, 'project-out-of-scope');

    mockPrisma.surveyImage.findUnique.mockResolvedValueOnce(null);
    await request(app).get('/images/i-2').expect(404);
  });

  it('本文の現場調査の ID から案件を引く', async () => {
    const scope = fakeScope();
    const { app } = buildApp(
      'post',
      '/batch',
      requireBodySurveyProjectScope('surveyId', { scopeService: scope, auditLogService: audit })
    );

    mockPrisma.siteSurvey.findUnique.mockResolvedValueOnce({ projectId: 'project-in-scope' });
    await request(app).post('/batch').send({ surveyId: 's-1' }).expect(200);

    // 本文に現場調査の ID が無いときは不在と同じ 404
    await request(app).post('/batch').send({}).expect(404);
    expect(mockPrisma.siteSurvey.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('一括の要求の範囲の判定（39.4）', () => {
  function batchApp(scope: ReturnType<typeof fakeScope>) {
    return buildApp(
      'patch',
      '/batch',
      requireImagesProjectScope(imageIdsFromBodyArray('updates'), {
        scopeService: scope,
        auditLogService: audit,
      })
    );
  }

  it('対象の全件の案件が範囲内なら通す（同じ案件は 1 回だけ判定する）', async () => {
    const scope = fakeScope();
    const { app, reached } = batchApp(scope);
    mockPrisma.surveyImage.findMany.mockResolvedValueOnce([
      { id: 'i-1', survey: { projectId: 'project-in-scope' } },
      { id: 'i-2', survey: { projectId: 'project-in-scope' } },
      { id: 'i-3', survey: { projectId: 'project-other-in-scope' } },
    ]);

    await request(app)
      .patch('/batch')
      .send({ updates: [{ id: 'i-1' }, { id: 'i-2' }, { id: 'i-3' }, { id: 'i-1' }] })
      .expect(200);

    expect(reached).toHaveBeenCalledTimes(1);
    expect(mockPrisma.surveyImage.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['i-1', 'i-2', 'i-3'] } },
      select: { id: true, survey: { select: { projectId: true } } },
    });
    expect(scope.evaluateProjectAccess).toHaveBeenCalledTimes(2);
  });

  it('範囲外の案件の画像が 1 件でも混じると要求全体を 404 にし、後続へ進めない', async () => {
    const scope = fakeScope();
    const { app, reached } = batchApp(scope);
    mockPrisma.surveyImage.findMany.mockResolvedValueOnce([
      { id: 'i-1', survey: { projectId: 'project-in-scope' } },
      { id: 'i-2', survey: { projectId: 'project-out-of-scope' } },
    ]);

    const response = await request(app)
      .patch('/batch')
      .send({ updates: [{ id: 'i-1' }, { id: 'i-2' }] })
      .expect(404);

    expect(response.body.code).toBe('NOT_FOUND');
    expect(JSON.stringify(response.body)).not.toContain('project-out-of-scope');
    expect(reached).not.toHaveBeenCalled();
    // 範囲外の記録は判定部品が行う
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PROJECT_SCOPE_DENIED', targetId: 'project-out-of-scope' })
    );
  });

  it('不在の画像が混じると範囲外と同じ 404 にし、判定まで進まない', async () => {
    const scope = fakeScope();
    const { app, reached } = batchApp(scope);
    mockPrisma.surveyImage.findMany.mockResolvedValueOnce([
      { id: 'i-1', survey: { projectId: 'project-in-scope' } },
    ]);

    const response = await request(app)
      .patch('/batch')
      .send({ updates: [{ id: 'i-1' }, { id: 'i-missing' }] })
      .expect(404);

    expect(response.body.code).toBe('NOT_FOUND');
    expect(reached).not.toHaveBeenCalled();
    expect(scope.evaluateProjectAccess).not.toHaveBeenCalled();
  });

  it('対象が読み取れないときは 404 にする', async () => {
    const scope = fakeScope();
    const { app, reached } = batchApp(scope);
    await request(app).patch('/batch').send({ updates: 'x' }).expect(404);
    expect(reached).not.toHaveBeenCalled();
    expect(mockPrisma.surveyImage.findMany).not.toHaveBeenCalled();
  });
});
