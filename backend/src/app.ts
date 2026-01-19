import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
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
import { generateCsrfToken } from './middleware/csrf.middleware.js';
import { getStorageType } from './storage/index.js';
import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import { createInvitationRoutes } from './routes/invitation.routes.js';
import rolesRoutes from './routes/roles.routes.js';
import permissionsRoutes from './routes/permissions.routes.js';
import userRolesRoutes from './routes/user-roles.routes.js';
import auditLogRoutes from './routes/audit-log.routes.js';
import sessionRoutes from './routes/session.routes.js';
import jwksRoutes from './routes/jwks.routes.js';
import usersRoutes from './routes/users.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import tradingPartnersRoutes from './routes/trading-partners.routes.js';
import siteSurveysRoutes from './routes/site-surveys.routes.js';
import surveyImagesRoutes from './routes/survey-images.routes.js';
import annotationRoutes from './routes/annotation.routes.js';
import quantityTablesRoutes from './routes/quantity-tables.routes.js';
import quantityGroupsRoutes from './routes/quantity-groups.routes.js';
import quantityItemsRoutes from './routes/quantity-items.routes.js';
import autocompleteRoutes from './routes/autocomplete.routes.js';
import itemizedStatementsRoutes from './routes/itemized-statements.routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// Trust proxy - Required for proxy environments like Railway
// Trust X-Forwarded-* headers
app.set('trust proxy', true);

// Middleware
// Force HTTPS (production only)
app.use(httpsRedirect);
app.use(hsts);

// Apply HTTP logging
app.use(httpLogger);

// Validate and retrieve environment variables
const env = validateEnv();

// Configure security headers
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

// Compression middleware (reduce response size)
app.use(
  compression({
    // Compress only responses larger than 1KB
    threshold: 1024,
    // Compression level (0-9, default is 6)
    level: 6,
  })
);

app.use(express.json({ limit: '5mb' })); // サムネイル更新のBase64画像データ用に制限を増加
app.use(cookieParser());

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

  // PostgreSQL check (optional)
  try {
    const prisma = getPrismaClient();
    await withTimeout(prisma.$queryRaw`SELECT 1`, CHECK_TIMEOUT);
    services.database = 'connected';
  } catch (error) {
    req.log.warn({ err: error }, 'PostgreSQL not available');
    services.database = 'disconnected';
    // Server can run even without DB connection
  }

  // Redis check (optional)
  try {
    await withTimeout(redis.ping(), CHECK_TIMEOUT);
    services.redis = 'connected';
  } catch (error) {
    req.log.warn({ err: error }, 'Redis not available');
    services.redis = 'disconnected';
    // Server can run even without Redis connection
  }

  // Server is OK if it's running
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services,
  });
});

// Favicon handler - respond to browser favicon requests
app.get('/favicon.ico', (_req: Request, res: Response) => {
  res.status(204).end(); // No Content
});

// JWKS endpoint (RFC 7517) - JWT public key distribution
app.use('/.well-known', jwksRoutes);

/**
 * @swagger
 * /csrf-token:
 *   get:
 *     summary: Get CSRF Token
 *     description: Generate and return a CSRF token for subsequent state-changing requests
 *     tags:
 *       - Security
 *     responses:
 *       200:
 *         description: CSRF token generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 csrfToken:
 *                   type: string
 *                   example: a1b2c3d4e5f6...
 */
// CSRF token endpoint
app.get('/csrf-token', (_req: Request, res: Response) => {
  const token = generateCsrfToken();

  // Send as cookie (HttpOnly, Secure, SameSite=Strict)
  res.cookie('csrf-token', token, {
    httpOnly: false, // Accessible from JavaScript (to set X-CSRF-Token header)
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'strict', // CSRF attack protection
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });

  // Also send in response body
  res.json({ csrfToken: token });
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
// Apply rate limiting to all API endpoints
app.use('/api', apiLimiter);

app.get('/api', (_req: Request, res: Response) => {
  res.json({
    message: 'ArchiTrack API',
    version: '1.0.0',
  });
});

// Admin routes (TODO: add authentication middleware)
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

// Audit log routes
app.use('/api/v1/audit-logs', auditLogRoutes);

// Session management routes
app.use('/api/v1/auth/sessions', sessionRoutes);

// User routes (担当者候補取得等)
app.use('/api/users', usersRoutes);

// Project management routes
app.use('/api/projects', projectsRoutes);

// Trading partner management routes
app.use('/api/trading-partners', tradingPartnersRoutes);

// Site survey management routes
app.use('/api/projects/:projectId/site-surveys', siteSurveysRoutes);
app.use('/api/site-surveys', siteSurveysRoutes);

// Survey images management routes
app.use('/api/site-surveys/:id/images', surveyImagesRoutes);
app.use('/api/site-surveys/images', surveyImagesRoutes);

// Annotation management routes
app.use('/api/site-surveys/images', annotationRoutes);

// Quantity table management routes
app.use('/api/projects/:projectId/quantity-tables', quantityTablesRoutes);
app.use('/api/quantity-tables', quantityTablesRoutes);

// Quantity group management routes
app.use('/api/quantity-tables/:quantityTableId/groups', quantityGroupsRoutes);
app.use('/api/quantity-groups', quantityGroupsRoutes);

// Quantity item management routes
app.use('/api/quantity-groups/:groupId/items', quantityItemsRoutes);
app.use('/api/quantity-items', quantityItemsRoutes);

// Autocomplete routes
app.use('/api/autocomplete', autocompleteRoutes);

// Itemized statement management routes
app.use('/api/projects/:projectId/itemized-statements', itemizedStatementsRoutes);
app.use('/api/itemized-statements', itemizedStatementsRoutes);

// Local storage static file serving (development/test only)
if (getStorageType() === 'local' && process.env.LOCAL_STORAGE_PATH) {
  const storagePath = process.env.LOCAL_STORAGE_PATH;
  app.use(
    '/storage',
    express.static(storagePath, {
      maxAge: '1d', // Cache for 1 day
      immutable: true,
    })
  );
}

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
