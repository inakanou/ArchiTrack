/**
 * @fileoverview システムの設定の管理の経路の単体テスト（タスク116.1）
 *
 * design の章「Requirements 43-50」の D8 と Error Handling（設定の変更の競合は 409）。
 * `GET/PUT /api/v1/admin/settings/external-ai-reading` が settings:update を求めること、
 * 既定の有効の取得、停止と再開、版の競合の 409、権限なしの 403、本文の検証の 400 を主張する。
 *
 * @requirement estimate-request/REQ-49.5 管理者が外部 AI の読み取りを止め・戻し、その変更が監査に残る
 *
 * @module __tests__/unit/routes/admin-settings.routes.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type Request, type Response, type NextFunction } from 'express';

const mockSystemSettingService = vi.hoisted(() => ({
  getExternalAiReading: vi.fn(),
  setExternalAiReading: vi.fn(),
}));

// ルーターの読み込み時に requirePermission へ渡された権限（clearAllMocks で消えないよう配列に持つ）
const requiredPermissions = vi.hoisted((): string[] => []);
// 利用者が持つ権限（テストごとに差し替える）
const grantedPermissions = vi.hoisted(() => ({ value: new Set<string>() }));

vi.mock('../../../db', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../services/audit-log.service', () => ({
  AuditLogService: class {},
}));

vi.mock('../../../services/system-setting.service', () => ({
  SystemSettingService: class {
    constructor() {
      return mockSystemSettingService;
    }
  },
}));

vi.mock('../../../middleware/authenticate.middleware', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      userId: 'admin-user-id',
      email: 'admin@example.com',
      roles: ['admin'],
    };
    next();
  },
}));

vi.mock('../../../middleware/authorize.middleware', async () => {
  const { ForbiddenError } = await import('../../../errors/apiError.js');
  return {
    requirePermission: (permission: string) => {
      requiredPermissions.push(permission);
      return (_req: Request, _res: Response, next: NextFunction) => {
        if (grantedPermissions.value.has(permission)) {
          next();
          return;
        }
        next(new ForbiddenError('Insufficient permissions', 'PERMISSION_DENIED'));
      };
    },
  };
});

import adminSettingsRoutes from '../../../routes/admin-settings.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';
import { SystemSettingConflictError } from '../../../errors/systemSettingError.js';

const PATH = '/api/v1/admin/settings/external-ai-reading';

describe('システムの設定の管理の経路（外部の AI での読み取り）', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/admin/settings', adminSettingsRoutes);
    app.use(errorHandler);
    grantedPermissions.value = new Set(['settings:update']);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('取得と変更の両方に settings:update の権限を求める', () => {
    expect(requiredPermissions).toEqual(['settings:update', 'settings:update']);
  });

  describe('GET', () => {
    it('設定の行が無いときの既定（有効・版 0）を返す', async () => {
      mockSystemSettingService.getExternalAiReading.mockResolvedValue({
        enabled: true,
        version: 0,
      });

      const response = await request(app).get(PATH);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ enabled: true, version: 0 });
    });

    it('権限が無い利用者には 403 を返し、設定を読まない', async () => {
      grantedPermissions.value = new Set(['settings:read']);

      const response = await request(app).get(PATH);

      expect(response.status).toBe(403);
      expect(response.body).not.toHaveProperty('enabled');
      expect(mockSystemSettingService.getExternalAiReading).not.toHaveBeenCalled();
    });
  });

  describe('PUT', () => {
    it('停止を送ると操作した利用者と版を渡して変え、変更後の設定を返す', async () => {
      mockSystemSettingService.setExternalAiReading.mockResolvedValue({
        enabled: false,
        version: 1,
      });

      const response = await request(app).put(PATH).send({ enabled: false, version: 0 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ enabled: false, version: 1 });
      expect(mockSystemSettingService.setExternalAiReading).toHaveBeenCalledWith(
        false,
        0,
        'admin-user-id'
      );
    });

    it('再開を送ると有効に戻した設定を返す', async () => {
      mockSystemSettingService.setExternalAiReading.mockResolvedValue({
        enabled: true,
        version: 2,
      });

      const response = await request(app).put(PATH).send({ enabled: true, version: 1 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ enabled: true, version: 2 });
      expect(mockSystemSettingService.setExternalAiReading).toHaveBeenCalledWith(
        true,
        1,
        'admin-user-id'
      );
    });

    it('版が今の版と違うときは 409 と競合の code を返す', async () => {
      mockSystemSettingService.setExternalAiReading.mockRejectedValue(
        new SystemSettingConflictError({ expectedVersion: 1, actualVersion: 3 })
      );

      const response = await request(app).put(PATH).send({ enabled: false, version: 1 });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('SYSTEM_SETTING_CONFLICT');
      expect(response.body.details).toEqual({ expectedVersion: 1, actualVersion: 3 });
    });

    it('権限が無い利用者には 403 を返し、設定を変えない', async () => {
      grantedPermissions.value = new Set(['settings:read']);

      const response = await request(app).put(PATH).send({ enabled: false, version: 0 });

      expect(response.status).toBe(403);
      expect(mockSystemSettingService.setExternalAiReading).not.toHaveBeenCalled();
    });

    it.each([
      ['enabled が無い', { version: 0 }],
      ['enabled が真偽でない', { enabled: 'false', version: 0 }],
      ['version が無い', { enabled: false }],
      ['version が負', { enabled: false, version: -1 }],
      ['version が整数でない', { enabled: false, version: 1.5 }],
      ['知らない欄がある', { enabled: false, version: 0, extra: 1 }],
    ])('本文が不正（%s）なら 400 を返し、設定を変えない', async (_label, body) => {
      const response = await request(app).put(PATH).send(body);

      expect(response.status).toBe(400);
      expect(mockSystemSettingService.setExternalAiReading).not.toHaveBeenCalled();
    });
  });
});
