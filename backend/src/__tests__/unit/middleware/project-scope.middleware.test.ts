/**
 * @fileoverview ID 指定の要求の閲覧範囲の判定部品（requireProjectScope）の単体テスト（user-authentication タスク52.1）
 *
 * Requirements (user-authentication):
 * - REQ-39.2: 閲覧範囲外の案件への ID 指定のアクセスに、存在しない案件と同じ 404 を返す
 * - REQ-39.7: 閲覧範囲外の案件へのアクセスの拒否を、利用者・対象・日時とともに記録する
 *
 * 判定は ProjectScopeService の偽物で与え、応答は本番のエラーハンドラーで組み立てる。
 * 案件の API（/api/projects）への適用は 52.3 で行う。
 */

import { describe, it, expect, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import {
  requireProjectScope,
  projectIdFromParam,
} from '../../../middleware/project-scope.middleware.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';
import type {
  ProjectAccessDecision,
  ProjectScopeService,
} from '../../../services/project-scope.service.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';

const USER_ID = 'user-1';
const EXISTING_OUT_OF_SCOPE = 'project-out-of-scope';
const MISSING = 'project-missing';
const IN_SCOPE = 'project-in-scope';

const DECISIONS: Record<string, ProjectAccessDecision> = {
  [EXISTING_OUT_OF_SCOPE]: 'out_of_scope',
  [MISSING]: 'not_found',
  [IN_SCOPE]: 'allowed',
};

function fakeScope() {
  return {
    evaluateProjectAccess: vi.fn(
      async (_userId: string, projectId: string): Promise<ProjectAccessDecision> =>
        DECISIONS[projectId] ?? 'not_found'
    ),
  };
}

function fakeAudit(createLog = vi.fn().mockResolvedValue({})) {
  return { createLog };
}

function buildApp(
  scope: ReturnType<typeof fakeScope>,
  audit: ReturnType<typeof fakeAudit>,
  options: { authenticated?: boolean; resolver?: Parameters<typeof requireProjectScope>[0] } = {}
) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (options.authenticated !== false) {
      req.user = { userId: USER_ID, email: 'user@example.com' } as Request['user'];
    }
    next();
  });
  const guard = requireProjectScope(options.resolver ?? projectIdFromParam('id'), {
    scopeService: scope as unknown as Pick<ProjectScopeService, 'evaluateProjectAccess'>,
    auditLogService: audit as unknown as Pick<IAuditLogService, 'createLog'>,
  });
  app.get('/api/projects/:id', guard, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe('requireProjectScope', () => {
  it('範囲内の案件は次の処理へ進み、監査に記録しない', async () => {
    const scope = fakeScope();
    const audit = fakeAudit();

    const res = await request(buildApp(scope, audit)).get(`/api/projects/${IN_SCOPE}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, IN_SCOPE);
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  /**
   * @requirement user-authentication/REQ-39.2
   */
  it('範囲外の案件の 404 の本文は、存在しない案件の 404 の本文と同じになる', async () => {
    const app = buildApp(fakeScope(), fakeAudit());
    // 同じ経路の文字列で比べるため、経路の値を同じにした二つの判定を作る
    const scopeOut = fakeScope();
    scopeOut.evaluateProjectAccess.mockResolvedValue('out_of_scope');
    const scopeMissing = fakeScope();
    scopeMissing.evaluateProjectAccess.mockResolvedValue('not_found');

    const outOfScope = await request(buildApp(scopeOut, fakeAudit())).get('/api/projects/same-id');
    const missing = await request(buildApp(scopeMissing, fakeAudit())).get('/api/projects/same-id');

    expect(outOfScope.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(outOfScope.body).toEqual(missing.body);
    expect(outOfScope.headers['content-type']).toBe(missing.headers['content-type']);
    // 汎用の NOT_FOUND で、案件の有無や ID を推測できる情報を含めない
    expect(outOfScope.body.code).toBe('NOT_FOUND');
    const { instance: _instance, ...withoutInstance } = outOfScope.body as Record<string, unknown>;
    expect(JSON.stringify(withoutInstance)).not.toMatch(/project|scope|same-id/i);

    // 別の経路でも本文の形は同じ（instance だけが経路に従う）
    const other = await request(app).get(`/api/projects/${EXISTING_OUT_OF_SCOPE}`);
    const otherMissing = await request(app).get(`/api/projects/${MISSING}`);
    const strip = (body: Record<string, unknown>) => ({ ...body, instance: undefined });
    expect(strip(other.body)).toEqual(strip(otherMissing.body));
  });

  /**
   * @requirement user-authentication/REQ-39.2
   */
  it('解決関数が null（対象の不在）を返すと判定を呼ばずに同じ 404 を返す', async () => {
    const scope = fakeScope();
    const audit = fakeAudit();
    const app = buildApp(scope, audit, { resolver: async () => null });

    const res = await request(app).get('/api/projects/same-id');
    const outScope = fakeScope();
    outScope.evaluateProjectAccess.mockResolvedValue('out_of_scope');
    const outOfScope = await request(buildApp(outScope, fakeAudit())).get('/api/projects/same-id');

    expect(res.status).toBe(404);
    expect(res.body).toEqual(outOfScope.body);
    expect(scope.evaluateProjectAccess).not.toHaveBeenCalled();
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  /**
   * @requirement user-authentication/REQ-39.7
   */
  it('範囲外のときだけ監査 PROJECT_SCOPE_DENIED に利用者・対象・要求の識別を記録する', async () => {
    const audit = fakeAudit();
    const app = buildApp(fakeScope(), audit);

    await request(app)
      .get(`/api/projects/${EXISTING_OUT_OF_SCOPE}?token=secret`)
      .set('User-Agent', 'scope-test-agent');

    expect(audit.createLog).toHaveBeenCalledTimes(1);
    const [input] = audit.createLog.mock.calls[0] as [Record<string, unknown>];
    expect(input).toMatchObject({
      action: 'PROJECT_SCOPE_DENIED',
      actorId: USER_ID,
      targetType: 'Project',
      targetId: EXISTING_OUT_OF_SCOPE,
    });
    const metadata = input.metadata as Record<string, unknown>;
    expect(metadata).toMatchObject({
      method: 'GET',
      path: `/api/projects/${EXISTING_OUT_OF_SCOPE}`,
      userAgent: 'scope-test-agent',
    });
    expect(typeof metadata.ipAddress).toBe('string');
    // 経路は問い合わせの文字列を含めない（トークンなどを記録に残さない）
    expect(JSON.stringify(metadata)).not.toContain('secret');

    // 存在しない案件では記録しない
    await request(app).get(`/api/projects/${MISSING}`);
    expect(audit.createLog).toHaveBeenCalledTimes(1);
  });

  /**
   * @requirement user-authentication/REQ-39.7
   */
  it('監査の記録に失敗しても応答は同じ 404 のまま', async () => {
    const audit = fakeAudit(vi.fn().mockRejectedValue(new Error('db down')));
    const app = buildApp(fakeScope(), audit);

    const res = await request(app).get(`/api/projects/${EXISTING_OUT_OF_SCOPE}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(audit.createLog).toHaveBeenCalledTimes(1);
  });

  it('判定が失敗したときはエラーハンドラーへ渡す（404 にしない）', async () => {
    const scope = fakeScope();
    scope.evaluateProjectAccess.mockRejectedValue(new Error('boom'));

    const res = await request(buildApp(scope, fakeAudit())).get(`/api/projects/${IN_SCOPE}`);

    expect(res.status).toBe(500);
  });

  it('認証されていない要求は 401 にし、判定を呼ばない', async () => {
    const scope = fakeScope();

    const res = await request(buildApp(scope, fakeAudit(), { authenticated: false })).get(
      `/api/projects/${IN_SCOPE}`
    );

    expect(res.status).toBe(401);
    expect(scope.evaluateProjectAccess).not.toHaveBeenCalled();
  });
});
