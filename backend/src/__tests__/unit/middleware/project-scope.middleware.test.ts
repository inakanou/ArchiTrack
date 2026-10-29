/**
 * @fileoverview ID 指定の要求の閲覧範囲の判定部品（requireProjectScope）の単体テスト（user-authentication タスク52.1）
 *
 * Requirements (user-authentication):
 * - REQ-39.2: 閲覧範囲外の案件への ID 指定のアクセスに、存在しない案件と同じ 404 を返す
 * - REQ-39.7: 閲覧範囲外の案件へのアクセスの拒否を、利用者・対象・日時とともに記録する
 *
 * 経路の案件と対象の実際の案件の食い違い（要件39.8、タスク63.1）の判定と記録もここで確かめる。
 * 39.8 の被覆の印は本 spec に入れ子の経路が無いため置かず、最初に切り替える業務 spec の E2E が担う（タスク63.2）。
 * 判定は ProjectScopeService の偽物で与え、応答は本番のエラーハンドラーで組み立てる。
 * 案件の API（/api/projects）への適用は 52.3 で行う。
 */

import { describe, it, expect, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import {
  requireProjectScope,
  projectIdFromParam,
  projectMismatch,
  recordProjectMismatchIfOutOfScope,
  type ProjectIdResolver,
} from '../../../middleware/project-scope.middleware.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';
import { NotFoundError } from '../../../errors/apiError.js';
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

/** 経路の案件（:id）と食い違う実際の案件を返す解決関数（入れ子の経路の子のデータを模す） */
const mismatchTo =
  (ownerProjectId: string): ProjectIdResolver =>
  async () =>
    projectMismatch(ownerProjectId);

describe('requireProjectScope の食い違い（要件39.8）', () => {
  /** 不在の 404 の本文（解決関数が null を返したとき）を同じ経路で得る */
  async function missingBody(path: string) {
    const res = await request(
      buildApp(fakeScope(), fakeAudit(), { resolver: async () => null })
    ).get(path);
    return res.body as Record<string, unknown>;
  }

  it('食い違いの実際の案件が範囲外なら、実際の案件を対象に 1 件記録し、不在と同じ 404 で本体へ進めない', async () => {
    const scope = fakeScope();
    const audit = fakeAudit();
    const handler = vi.fn();
    const app = buildApp(scope, audit, { resolver: mismatchTo(EXISTING_OUT_OF_SCOPE) });
    app.get('/never', handler);

    const res = await request(app).get(`/api/projects/${IN_SCOPE}?token=secret`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual(await missingBody(`/api/projects/${IN_SCOPE}?token=secret`));
    expect(res.body).not.toEqual({ ok: true });
    // 判定するのは実際の案件だけで、経路の案件は判定しない
    expect(scope.evaluateProjectAccess).toHaveBeenCalledTimes(1);
    expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, EXISTING_OUT_OF_SCOPE);
    expect(audit.createLog).toHaveBeenCalledTimes(1);
    const [input] = audit.createLog.mock.calls[0] as [Record<string, unknown>];
    expect(input).toMatchObject({
      action: 'PROJECT_SCOPE_DENIED',
      actorId: USER_ID,
      targetType: 'Project',
      targetId: EXISTING_OUT_OF_SCOPE,
    });
    const metadata = input.metadata as Record<string, unknown>;
    // 経路の ID は path に残る（問い合わせの文字列は含めない）
    expect(metadata).toMatchObject({ method: 'GET', path: `/api/projects/${IN_SCOPE}` });
    expect(JSON.stringify(metadata)).not.toContain('secret');
  });

  it.each([
    ['範囲内（経路の誤り）', IN_SCOPE],
    ['不在・論理削除', MISSING],
  ])(
    '食い違いの実際の案件が%sなら記録せず、不在と同じ 404 で本体へ進めない',
    async (_label, owner) => {
      const scope = fakeScope();
      const audit = fakeAudit();
      const app = buildApp(scope, audit, { resolver: mismatchTo(owner) });

      const res = await request(app).get(`/api/projects/${IN_SCOPE}`);

      expect(res.status).toBe(404);
      expect(res.body).toEqual(await missingBody(`/api/projects/${IN_SCOPE}`));
      expect(res.body).not.toEqual({ ok: true });
      expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, owner);
      expect(audit.createLog).not.toHaveBeenCalled();
    }
  );

  it('食い違いの記録に失敗しても応答は不在と同じ 404 のまま', async () => {
    const audit = fakeAudit(vi.fn().mockRejectedValue(new Error('db down')));
    const app = buildApp(fakeScope(), audit, { resolver: mismatchTo(EXISTING_OUT_OF_SCOPE) });

    const res = await request(app).get(`/api/projects/${IN_SCOPE}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual(await missingBody(`/api/projects/${IN_SCOPE}`));
    expect(audit.createLog).toHaveBeenCalledTimes(1);
  });

  it('食い違いの実際の案件の判定が失敗したときはエラーハンドラーへ渡す（404 にしない）', async () => {
    const scope = fakeScope();
    scope.evaluateProjectAccess.mockRejectedValue(new Error('boom'));
    const audit = fakeAudit();

    const res = await request(
      buildApp(scope, audit, { resolver: mismatchTo(EXISTING_OUT_OF_SCOPE) })
    ).get(`/api/projects/${IN_SCOPE}`);

    expect(res.status).toBe(500);
    expect(audit.createLog).not.toHaveBeenCalled();
  });
});

describe('recordProjectMismatchIfOutOfScope（要件39.8）', () => {
  /** 解決関数を通らない下流の独自の判定を模す: 食い違いを見つけたら記録を頼み、自分で 404 を返す */
  function buildCustomGuardApp(
    scope: ReturnType<typeof fakeScope>,
    audit: ReturnType<typeof fakeAudit>,
    ownerProjectId: string
  ) {
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = { userId: USER_ID, email: 'user@example.com' } as Request['user'];
      next();
    });
    app.get(
      '/api/projects/:id/children/:childId',
      async (req: Request, _res: Response, next: NextFunction) => {
        try {
          await recordProjectMismatchIfOutOfScope(req, ownerProjectId, {
            scopeService: scope as unknown as Pick<ProjectScopeService, 'evaluateProjectAccess'>,
            auditLogService: audit as unknown as Pick<IAuditLogService, 'createLog'>,
          });
          next(new NotFoundError());
        } catch (error) {
          next(error);
        }
      },
      (_req, res) => {
        res.status(200).json({ ok: true });
      }
    );
    app.use(errorHandler);
    return app;
  }

  it('実際の案件が範囲外なら、実際の案件を対象に判定部品と同じ形で 1 件記録する', async () => {
    const scope = fakeScope();
    const audit = fakeAudit();

    const res = await request(buildCustomGuardApp(scope, audit, EXISTING_OUT_OF_SCOPE)).get(
      `/api/projects/${IN_SCOPE}/children/child-1`
    );

    expect(res.status).toBe(404);
    expect(scope.evaluateProjectAccess).toHaveBeenCalledTimes(1);
    expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, EXISTING_OUT_OF_SCOPE);
    expect(audit.createLog).toHaveBeenCalledTimes(1);
    const [input] = audit.createLog.mock.calls[0] as [Record<string, unknown>];
    expect(input).toMatchObject({
      action: 'PROJECT_SCOPE_DENIED',
      actorId: USER_ID,
      targetType: 'Project',
      targetId: EXISTING_OUT_OF_SCOPE,
    });
    expect(input.metadata).toMatchObject({
      method: 'GET',
      path: `/api/projects/${IN_SCOPE}/children/child-1`,
    });
  });

  it.each([
    ['範囲内（経路の誤り）', IN_SCOPE],
    ['不在・論理削除', MISSING],
  ])('実際の案件が%sなら記録しない', async (_label, owner) => {
    const scope = fakeScope();
    const audit = fakeAudit();

    const res = await request(buildCustomGuardApp(scope, audit, owner)).get(
      `/api/projects/${IN_SCOPE}/children/child-1`
    );

    expect(res.status).toBe(404);
    expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(USER_ID, owner);
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  it('記録の失敗は投げず、判定の失敗は投げる（呼び出し側がエラーハンドラーへ渡す）', async () => {
    const failingAudit = fakeAudit(vi.fn().mockRejectedValue(new Error('db down')));
    const recordFailed = await request(
      buildCustomGuardApp(fakeScope(), failingAudit, EXISTING_OUT_OF_SCOPE)
    ).get(`/api/projects/${IN_SCOPE}/children/child-1`);
    expect(recordFailed.status).toBe(404);
    expect(failingAudit.createLog).toHaveBeenCalledTimes(1);

    const brokenScope = fakeScope();
    brokenScope.evaluateProjectAccess.mockRejectedValue(new Error('boom'));
    const evaluateFailed = await request(
      buildCustomGuardApp(brokenScope, fakeAudit(), EXISTING_OUT_OF_SCOPE)
    ).get(`/api/projects/${IN_SCOPE}/children/child-1`);
    expect(evaluateFailed.status).toBe(500);
  });
});
