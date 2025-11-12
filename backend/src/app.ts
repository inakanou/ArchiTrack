import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import getPrismaClient from './db.js';
import redis from './redis.js';
import { httpLogger } from './middleware/logger.middleware.js';
import { apiLimiter, healthCheckLimiter } from './middleware/rateLimit.middleware.js';
import { validateEnv } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.middleware.js';
import { httpsRedirect, hsts } from './middleware/httpsRedirect.middleware.js';
import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import { createInvitationRoutes } from './routes/invitation.routes.js';
import rolesRoutes from './routes/roles.routes.js';
import permissionsRoutes from './routes/permissions.routes.js';
import userRolesRoutes from './routes/user-roles.routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// Trust proxy - Railway等のプロキシ環境で必須
// X-Forwarded-* ヘッダーを信頼する
app.set('trust proxy', true);

// Middleware
// HTTPS強制（本番環境のみ）
app.use(httpsRedirect);
app.use(hsts);

// HTTPロギングを適用
app.use(httpLogger);

// 環境変数を検証して取得
const env = validateEnv();

// セキュリティヘッダーの設定
app.use(
  helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    // Cross-Origin-Embedder-Policy
    crossOriginEmbedderPolicy: false, // フロントエンドとの連携のため無効化
    // Cross-Origin-Resource-Policy
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 86400, // 24 hours - preflight cache
  })
);

// 圧縮ミドルウェア（レスポンスサイズを削減）
app.use(
  compression({
    // 1KB以上のレスポンスのみ圧縮
    threshold: 1024,
    // 圧縮レベル（0-9、6がデフォルト）
    level: 6,
  })
);

app.use(express.json());

// Swagger UI setup (development環境のみ有効)
if (env.NODE_ENV !== 'production') {
  try {
    const swaggerSpec = JSON.parse(readFileSync(join(__dirname, '../docs/api-spec.json'), 'utf-8'));
    app.use(
      '/docs',
      swaggerUi.serve,
      swaggerUi.setup(swaggerSpec, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'ArchiTrack API Documentation',
        swaggerOptions: {
          persistAuthorization: true,
          displayOperationId: false,
        },
      })
    );

    // Swagger JSON spec endpoint
    app.get('/docs/json', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerSpec);
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.warn('Swagger spec not available:', err.message);
  }
}

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Check the health status of the API and its dependencies (Database, Redis)
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 services:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       enum: [connected, disconnected]
 *                     redis:
 *                       type: string
 *                       enum: [connected, disconnected]
 */
// Health check endpoint with timeout
app.get('/health', healthCheckLimiter, async (req: Request, res: Response) => {
  const services: Record<string, string> = {};
  const CHECK_TIMEOUT = 2000; // 2秒でタイムアウト

  // Helper function to add timeout to promises
  const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs)),
    ]);
  };

  // PostgreSQL チェック（オプショナル）
  try {
    const prisma = getPrismaClient();
    await withTimeout(prisma.$queryRaw`SELECT 1`, CHECK_TIMEOUT);
    services.database = 'connected';
  } catch (error) {
    req.log.warn({ err: error }, 'PostgreSQL not available');
    services.database = 'disconnected';
    // DB接続がない場合でもサーバーは稼働可能
  }

  // Redis チェック（オプショナル）
  try {
    await withTimeout(redis.ping(), CHECK_TIMEOUT);
    services.redis = 'connected';
  } catch (error) {
    req.log.warn({ err: error }, 'Redis not available');
    services.redis = 'disconnected';
    // Redis接続がない場合でもサーバーは稼働可能
  }

  // サーバー自体が起動していればOK
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services,
  });
});

// Favicon handler - ブラウザのfaviconリクエストに対応
app.get('/favicon.ico', (_req: Request, res: Response) => {
  res.status(204).end(); // No Content
});

/**
 * @swagger
 * /api:
 *   get:
 *     summary: API Information
 *     description: Returns API version and basic information
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: API information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: ArchiTrack API
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 */
// API routes
// 全APIエンドポイントにレート制限を適用
app.use('/api', apiLimiter);

app.get('/api', (_req: Request, res: Response) => {
  res.json({
    message: 'ArchiTrack API',
    version: '1.0.0',
  });
});

// Admin routes (TODO: 認証ミドルウェアを追加)
app.use('/admin', adminRoutes);

// Authentication routes
app.use('/api/v1/auth', authRoutes);

// Invitation routes
const prisma = getPrismaClient();
app.use('/api/v1/invitations', createInvitationRoutes(prisma));

// RBAC routes
app.use('/api/v1/roles', rolesRoutes);
app.use('/api/v1/permissions', permissionsRoutes);
app.use('/api/v1/users', userRolesRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
