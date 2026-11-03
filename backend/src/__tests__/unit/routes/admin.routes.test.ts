import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type Request, type Response, type NextFunction } from 'express';

const mockAuditLogService = vi.hoisted(() => ({
  createLog: vi.fn(),
}));

// 認証・認可の判定は単体では通す（拒否の振る舞いは統合テスト admin-log-level で確かめる）
// ルーターの読み込み時に requirePermission へ渡された権限（clearAllMocks で消えないよう配列に持つ）
const requiredPermissions = vi.hoisted((): string[] => []);

vi.mock('../../../db', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../services/audit-log.service', () => ({
  AuditLogService: class {
    constructor() {
      return mockAuditLogService;
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

vi.mock('../../../middleware/authorize.middleware', () => ({
  requirePermission: (permission: string) => {
    requiredPermissions.push(permission);
    return (_req: Request, _res: Response, next: NextFunction) => next();
  },
}));

import adminRoutes from '../../../routes/admin.routes.js';
import { errorHandler } from '../../../middleware/errorHandler.middleware.js';
import logger from '../../../utils/logger.js';

// loggerをモック
vi.mock('../../../utils/logger.js', () => ({
  default: {
    level: 'info',
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));

describe('Admin Routes', () => {
  let app: express.Application;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;

    app = express();
    app.use(express.json());
    app.use('/api/v1/admin', adminRoutes);
    app.use(errorHandler);

    mockAuditLogService.createLog.mockResolvedValue({ id: 'audit-1' });

    // loggerのlevelをリセット
    logger.level = 'info';
  });

  afterEach(() => {
    // テスト環境でのprocess.env操作のため、anyが必要
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.env.NODE_ENV as any) = originalEnv;
    vi.clearAllMocks();
  });

  describe('POST /api/v1/admin/log-level', () => {
    describe('正常系', () => {
      it('有効なログレベルを設定できること (debug)', async () => {
        const response = await request(app)
          .post('/api/v1/admin/log-level')
          .send({ level: 'debug' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          level: 'debug',
          message: 'Log level changed to: debug',
        });
        expect(logger.level).toBe('debug');
      });

      it('有効なログレベルを設定できること (error)', async () => {
        const response = await request(app)
          .post('/api/v1/admin/log-level')
          .send({ level: 'error' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          level: 'error',
          message: 'Log level changed to: error',
        });
        expect(logger.level).toBe('error');
      });

      it('有効なログレベルを設定できること (trace)', async () => {
        const response = await request(app)
          .post('/api/v1/admin/log-level')
          .send({ level: 'trace' });

        expect(response.status).toBe(200);
        expect(logger.level).toBe('trace');
      });

      it('有効なログレベルを設定できること (warn)', async () => {
        const response = await request(app).post('/api/v1/admin/log-level').send({ level: 'warn' });

        expect(response.status).toBe(200);
        expect(logger.level).toBe('warn');
      });

      it('有効なログレベルを設定できること (fatal)', async () => {
        const response = await request(app)
          .post('/api/v1/admin/log-level')
          .send({ level: 'fatal' });

        expect(response.status).toBe(200);
        expect(logger.level).toBe('fatal');
      });

      it('ログレベル変更を記録すること', async () => {
        await request(app).post('/api/v1/admin/log-level').send({ level: 'debug' });

        expect(logger.info).toHaveBeenCalledWith(
          { newLevel: 'debug', userId: 'admin-user-id' },
          'Log level changed successfully'
        );
      });

      it('運用設定の管理の権限（ops:manage）を経路に課すこと', () => {
        expect(requiredPermissions).toEqual(['ops:manage']);
      });

      it('変更を実行者と変更前後のログレベルとともに監査に記録すること', async () => {
        await request(app)
          .post('/api/v1/admin/log-level')
          .set('User-Agent', 'unit-agent')
          .send({ level: 'debug' });

        expect(mockAuditLogService.createLog).toHaveBeenCalledTimes(1);
        expect(mockAuditLogService.createLog).toHaveBeenCalledWith({
          action: 'OPERATIONAL_SETTING_CHANGED',
          actorId: 'admin-user-id',
          targetType: 'OperationalSetting',
          targetId: 'logLevel',
          before: { logLevel: 'info' },
          after: { logLevel: 'debug' },
          metadata: expect.objectContaining({ setting: 'logLevel', userAgent: 'unit-agent' }),
        });
      });

      it('監査の記録に失敗したときは 500 を返しログレベルを変えないこと', async () => {
        mockAuditLogService.createLog.mockRejectedValueOnce(new Error('db down'));

        const response = await request(app)
          .post('/api/v1/admin/log-level')
          .send({ level: 'debug' });

        expect(response.status).toBe(500);
        expect(response.body.code).toBe('OPERATIONAL_SETTING_RECORD_FAILED');
        expect(logger.level).toBe('info');
      });
    });

    describe('異常系', () => {
      it('無効なログレベルを拒否すること', async () => {
        const response = await request(app)
          .post('/api/v1/admin/log-level')
          .send({ level: 'invalid' });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          error: 'Invalid log level',
          code: 'INVALID_LOG_LEVEL',
          details: {
            validLevels: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
          },
        });
        // ログレベルは変更されず、監査にも記録しない
        expect(logger.level).toBe('info');
        expect(mockAuditLogService.createLog).not.toHaveBeenCalled();
      });

      it('levelが空の場合エラーを返すこと', async () => {
        const response = await request(app).post('/api/v1/admin/log-level').send({ level: '' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid log level');
      });

      it('levelが提供されない場合エラーを返すこと', async () => {
        const response = await request(app).post('/api/v1/admin/log-level').send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid log level');
      });

      it('数値のログレベルを拒否すること', async () => {
        const response = await request(app).post('/api/v1/admin/log-level').send({ level: 123 });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid log level');
      });
    });

    describe('本番環境での動作', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'production';
      });

      it('本番環境でログレベル変更時に警告を出すこと', async () => {
        await request(app).post('/api/v1/admin/log-level').send({ level: 'debug' });

        expect(logger.warn).toHaveBeenCalledWith(
          { oldLevel: 'info', newLevel: 'debug', userId: 'admin-user-id' },
          'Changing log level in production environment'
        );
      });

      it('本番環境でもログレベルを変更できること', async () => {
        const response = await request(app)
          .post('/api/v1/admin/log-level')
          .send({ level: 'error' });

        expect(response.status).toBe(200);
        expect(logger.level).toBe('error');
      });
    });
  });

  describe('GET /api/v1/admin/log-level', () => {
    it('現在のログレベルを取得できること', async () => {
      const response = await request(app).get('/api/v1/admin/log-level');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        level: 'info',
        environment: expect.any(String),
      });
    });

    it('ログレベル変更後、新しいレベルを返すこと', async () => {
      // ログレベルを変更
      await request(app).post('/api/v1/admin/log-level').send({ level: 'debug' });

      // 現在のログレベルを取得
      const response = await request(app).get('/api/v1/admin/log-level');

      expect(response.status).toBe(200);
      expect(response.body.level).toBe('debug');
    });

    it('現在の環境を返すこと', async () => {
      process.env.NODE_ENV = 'production';

      const response = await request(app).get('/api/v1/admin/log-level');

      expect(response.status).toBe(200);
      expect(response.body.environment).toBe('production');
    });

    it('NODE_ENVが未設定の場合developmentを返すこと', async () => {
      delete process.env.NODE_ENV;

      const response = await request(app).get('/api/v1/admin/log-level');

      expect(response.status).toBe(200);
      expect(response.body.environment).toBe('development');
    });
  });

  describe('統合シナリオ', () => {
    it('複数回ログレベルを変更できること', async () => {
      // 最初の変更
      await request(app).post('/api/v1/admin/log-level').send({ level: 'debug' });
      expect(logger.level).toBe('debug');

      // 2回目の変更
      await request(app).post('/api/v1/admin/log-level').send({ level: 'warn' });
      expect(logger.level).toBe('warn');

      // 3回目の変更
      await request(app).post('/api/v1/admin/log-level').send({ level: 'error' });
      expect(logger.level).toBe('error');

      // 確認
      const response = await request(app).get('/api/v1/admin/log-level');
      expect(response.body.level).toBe('error');
    });

    it('ログレベル変更後、元に戻せること', async () => {
      const originalLevel = logger.level;

      // 変更
      await request(app).post('/api/v1/admin/log-level').send({ level: 'debug' });
      expect(logger.level).toBe('debug');

      // 元に戻す
      await request(app).post('/api/v1/admin/log-level').send({ level: originalLevel });
      expect(logger.level).toBe(originalLevel);
    });
  });

  describe('エッジケース', () => {
    it('大文字小文字を区別すること', async () => {
      const response = await request(app).post('/api/v1/admin/log-level').send({ level: 'DEBUG' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid log level');
    });

    it('前後の空白を含むログレベルを拒否すること', async () => {
      const response = await request(app)
        .post('/api/v1/admin/log-level')
        .send({ level: ' debug ' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid log level');
    });

    it('nullを拒否すること', async () => {
      const response = await request(app).post('/api/v1/admin/log-level').send({ level: null });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid log level');
    });

    it('配列を拒否すること', async () => {
      const response = await request(app)
        .post('/api/v1/admin/log-level')
        .send({ level: ['debug'] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid log level');
    });

    it('オブジェクトを拒否すること', async () => {
      const response = await request(app)
        .post('/api/v1/admin/log-level')
        .send({ level: { value: 'debug' } });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid log level');
    });
  });
});
