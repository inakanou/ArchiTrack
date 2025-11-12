/**
 * @fileoverview 認証APIルート
 *
 * Requirements:
 * - 2: ユーザー登録（招待経由）
 * - 4: ログイン
 * - 5: トークン管理（リフレッシュ、ログアウト）
 * - 9: ユーザー情報取得・更新
 * - 27A: 2FA検証
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service.js';
// import { SessionService } from '../services/session.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import logger from '../utils/logger.js';

const router = Router();
const prisma = getPrismaClient();
const authService = new AuthService(prisma);
// const sessionService = new SessionService(prisma);

// Zodバリデーションスキーマ
const registerSchema = z.object({
  invitationToken: z.string().min(1, 'Invitation token is required'),
  displayName: z.string().min(1, 'Display name is required').max(100),
  password: z.string().min(12, 'Password must be at least 12 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const updateProfileSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(100).optional(),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const verify2FASchema = z.object({
  token: z.string().length(6, 'TOTP token must be 6 digits'),
  email: z.string().email('Invalid email format').optional(),
  tempToken: z.string().optional(),
});

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Register a new user using a valid invitation token
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - invitationToken
 *               - displayName
 *               - password
 *             properties:
 *               invitationToken:
 *                 type: string
 *                 description: Valid invitation token
 *                 example: "abc123def456"
 *               displayName:
 *                 type: string
 *                 description: User's display name
 *                 example: "John Doe"
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User password (min 12 characters, complexity requirements)
 *                 example: "SecurePassword123!"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     displayName:
 *                       type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.post(
  '/register',
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { invitationToken, displayName, password } = req.body;

      const result = await authService.register(invitationToken, {
        displayName,
        password,
      });

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'INVITATION_INVALID') {
          res.status(400).json({ error: 'Invalid invitation token', code: error.type });
          return;
        } else if (error.type === 'INVITATION_EXPIRED') {
          res.status(400).json({ error: 'Invitation token has expired', code: error.type });
          return;
        } else if (error.type === 'INVITATION_ALREADY_USED') {
          res.status(400).json({ error: 'Invitation token already used', code: error.type });
          return;
        } else if (error.type === 'WEAK_PASSWORD') {
          res.status(400).json({
            error: 'Password is too weak',
            code: error.type,
            violations: error.violations,
          });
          return;
        }

        res.status(500).json({ error: 'Registration failed', code: 'REGISTRATION_ERROR' });
        return;
      }

      const authResponse = result.value;

      logger.info(
        { userId: authResponse.user.id, email: authResponse.user.email },
        'User registered successfully'
      );

      res.status(201).json(authResponse);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login
 *     description: Authenticate a user and return access and refresh tokens
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "SecurePassword123!"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     displayName:
 *                       type: string
 *                 requires2FA:
 *                   type: boolean
 *                   description: True if 2FA is required
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/login',
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;

      const result = await authService.login(email, password);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'INVALID_CREDENTIALS') {
          res.status(401).json({ error: 'Invalid credentials', code: error.type });
          return;
        } else if (error.type === 'ACCOUNT_LOCKED') {
          res.status(403).json({
            error: 'Account is locked due to too many failed login attempts',
            code: error.type,
            unlockAt: error.unlockAt,
          });
          return;
        } else if (error.type === '2FA_REQUIRED') {
          res.status(200).json({
            requires2FA: true,
            userId: error.userId,
          });
          return;
        }

        res.status(500).json({ error: 'Login failed', code: 'LOGIN_ERROR' });
        return;
      }

      const loginResponse = result.value;

      if (loginResponse.user) {
        logger.info(
          { userId: loginResponse.user.id, email: loginResponse.user.email },
          'User logged in'
        );
      }

      res.status(200).json(loginResponse);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: Get a new access token using a valid refresh token
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Valid refresh token
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/refresh',
  validate(refreshSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      const result = await authService.refreshToken(refreshToken);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'INVALID_REFRESH_TOKEN') {
          res.status(401).json({ error: 'Invalid refresh token', code: error.type });
          return;
        } else if (error.type === 'REFRESH_TOKEN_EXPIRED') {
          res.status(401).json({ error: 'Refresh token expired', code: error.type });
          return;
        }

        res.status(500).json({ error: 'Token refresh failed', code: 'REFRESH_ERROR' });
        return;
      }

      const authResponse = result.value;

      logger.info(
        { userId: authResponse.user.id, email: authResponse.user.email },
        'Token refreshed successfully'
      );

      res.status(200).json(authResponse);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current user
 *     description: Get the current authenticated user's information
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 email:
 *                   type: string
 *                 displayName:
 *                   type: string
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }

      const result = await authService.getCurrentUser(req.user.userId);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'USER_NOT_FOUND') {
          res.status(404).json({ error: 'User not found', code: error.type });
          return;
        }

        res.status(500).json({ error: 'Failed to get user', code: 'GET_USER_ERROR' });
        return;
      }

      const user = result.value;

      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/me:
 *   patch:
 *     summary: Update user profile
 *     description: Update the current authenticated user's profile information
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName:
 *                 type: string
 *                 description: Updated display name
 *                 example: "John Smith"
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 email:
 *                   type: string
 *                 displayName:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.patch(
  '/me',
  authenticate,
  validate(updateProfileSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }

      const { displayName } = req.body;

      const updatedUser = await prisma.user.update({
        where: { id: req.user.userId },
        data: { displayName },
        select: {
          id: true,
          email: true,
          displayName: true,
          createdAt: true,
        },
      });

      logger.info({ userId: req.user.userId }, 'User profile updated');

      res.status(200).json(updatedUser);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout
 *     description: Logout the current user from the current device
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Refresh token to invalidate
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/logout',
  authenticate,
  validate(logoutSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }

      const { refreshToken } = req.body;

      const result = await authService.logout(req.user.userId, refreshToken);

      if (!result.ok) {
        const error = result.error;
        res.status(400).json({ error: 'Logout failed', code: error.type });
        return;
      }

      logger.info({ userId: req.user.userId }, 'User logged out');

      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/logout-all:
 *   post:
 *     summary: Logout from all devices
 *     description: Logout the current user from all devices
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out from all devices successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/logout-all',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }

      const result = await authService.logoutAll(req.user.userId);

      if (!result.ok) {
        const error = result.error;
        res.status(400).json({ error: 'Logout failed', code: error.type });
        return;
      }

      logger.info({ userId: req.user.userId }, 'User logged out from all devices');

      res.status(200).json({ message: 'Logged out from all devices successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/verify-2fa:
 *   post:
 *     summary: Verify 2FA token
 *     description: Verify a TOTP token for two-factor authentication
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: 6-digit TOTP token
 *                 example: "123456"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email (for login flow)
 *               tempToken:
 *                 type: string
 *                 description: Temporary token from login
 *     responses:
 *       200:
 *         description: 2FA verification successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 user:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/verify-2fa',
  validate(verify2FASchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token, email, tempToken } = req.body;

      // ログイン時の2FA検証の場合、emailまたはtempTokenからuserIdを取得
      let userId: string;

      if (tempToken) {
        // tempTokenからuserIdを抽出（実装はシンプルにJWTデコードを想定）
        const verifyResult = await authService['tokenService'].verifyToken(tempToken, 'access');
        if (!verifyResult.ok) {
          res.status(401).json({ error: 'Invalid temporary token', code: 'INVALID_TEMP_TOKEN' });
          return;
        }
        userId = verifyResult.value.userId;
      } else if (email) {
        // emailからユーザーを検索
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
          return;
        }
        userId = user.id;
      } else {
        res.status(400).json({ error: 'Email or tempToken is required', code: 'MISSING_PARAM' });
        return;
      }

      // 2FA検証を実行
      const result = await authService.verify2FA(userId, token);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'INVALID_2FA_CODE') {
          res.status(401).json({ error: 'Invalid 2FA code', code: error.type });
          return;
        } else if (error.type === 'USER_NOT_FOUND') {
          res.status(404).json({ error: 'User not found', code: error.type });
          return;
        }

        res.status(500).json({ error: '2FA verification failed', code: '2FA_ERROR' });
        return;
      }

      const authResponse = result.value;

      logger.info({ userId: authResponse.user.id }, '2FA verification successful');

      res.status(200).json(authResponse);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
