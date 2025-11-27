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
import { TwoFactorService } from '../services/two-factor.service.js';
import { PasswordService } from '../services/password.service.js';
// import { SessionService } from '../services/session.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { loginLimiter, refreshLimiter } from '../middleware/rateLimit.middleware.js';
import logger from '../utils/logger.js';
import { SECURITY_CONFIG } from '../config/security.constants.js';
import { PasswordViolation } from '../types/password.types.js';

const router = Router();
const prisma = getPrismaClient();
const authService = new AuthService(prisma);
const twoFactorService = new TwoFactorService();
const passwordService = new PasswordService(prisma);
// const sessionService = new SessionService(prisma);

// パスワードバリデーション違反を人間が読めるメッセージに変換
function getPasswordViolationMessage(violations: PasswordViolation[]): string {
  const messages: string[] = [];

  if (violations.includes(PasswordViolation.TOO_SHORT)) {
    messages.push(`パスワードは${SECURITY_CONFIG.PASSWORD.MIN_LENGTH}文字以上である必要があります`);
  }
  if (violations.includes(PasswordViolation.NO_UPPERCASE)) {
    messages.push('パスワードは大文字を1文字以上含む必要があります');
  }
  if (violations.includes(PasswordViolation.NO_LOWERCASE)) {
    messages.push('パスワードは小文字を1文字以上含む必要があります');
  }
  if (violations.includes(PasswordViolation.NO_DIGIT)) {
    messages.push('パスワードは数字を1文字以上含む必要があります');
  }
  if (violations.includes(PasswordViolation.NO_SPECIAL_CHAR)) {
    messages.push('パスワードは記号を1文字以上含む必要があります');
  }
  if (violations.includes(PasswordViolation.COMMON_PASSWORD)) {
    messages.push('このパスワードは過去に漏洩が確認されています。別のパスワードを選択してください');
  }
  if (violations.includes(PasswordViolation.CONTAINS_USER_INFO)) {
    messages.push('パスワードにユーザー情報を含めることはできません');
  }

  return messages.length > 0 ? messages.join('; ') : 'パスワードが要件を満たしていません';
}

// Zodバリデーションスキーマ
const registerSchema = z.object({
  invitationToken: z.string().min(1, 'Invitation token is required'),
  displayName: z.string().min(1, 'Display name is required').max(100),
  password: z
    .string()
    .min(
      SECURITY_CONFIG.PASSWORD.MIN_LENGTH,
      `パスワードは${SECURITY_CONFIG.PASSWORD.MIN_LENGTH}文字以上である必要があります`
    ),
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
  token: z
    .string()
    .length(
      SECURITY_CONFIG.TWO_FACTOR.CODE_LENGTH,
      `TOTP token must be ${SECURITY_CONFIG.TWO_FACTOR.CODE_LENGTH} digits`
    ),
  email: z.string().email('Invalid email format').optional(),
  tempToken: z.string().optional(),
});

const enableTwoFactorSchema = z.object({
  totpCode: z
    .string()
    .length(
      SECURITY_CONFIG.TWO_FACTOR.CODE_LENGTH,
      `TOTP code must be ${SECURITY_CONFIG.TWO_FACTOR.CODE_LENGTH} digits`
    ),
});

const disableTwoFactorSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z
    .string()
    .min(
      SECURITY_CONFIG.PASSWORD.MIN_LENGTH,
      `パスワードは${SECURITY_CONFIG.PASSWORD.MIN_LENGTH}文字以上である必要があります`
    ),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(
      SECURITY_CONFIG.PASSWORD.MIN_LENGTH,
      `パスワードは${SECURITY_CONFIG.PASSWORD.MIN_LENGTH}文字以上である必要があります`
    ),
  newPasswordConfirm: z.string().min(1, 'Password confirmation is required'),
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
        } else if (error.type === 'EMAIL_ALREADY_REGISTERED') {
          res.status(400).json({
            error: 'このメールアドレスは既に登録されています',
            code: error.type,
            errors: ['EMAIL_ALREADY_REGISTERED'],
          });
          return;
        } else if (error.type === 'WEAK_PASSWORD') {
          const detailedMessage = getPasswordViolationMessage(error.violations);
          res.status(400).json({
            error: detailedMessage,
            detail: detailedMessage,
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
  loginLimiter,
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;
      const userAgent = req.headers['user-agent'];

      const result = await authService.login(email, password, userAgent);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'INVALID_CREDENTIALS') {
          res.status(401).json({ error: 'Invalid credentials', code: error.type });
          return;
        } else if (error.type === 'ACCOUNT_LOCKED') {
          res.status(429).json({
            error: 'Account is locked due to too many failed login attempts',
            detail: 'アカウントがロックされています (Account locked)',
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
        } else if (error.type === 'DATABASE_ERROR') {
          logger.error({ error: error.message }, 'Database error during login');
          res.status(500).json({
            error: 'Internal server error',
            code: error.type,
            detail: error.message,
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
  refreshLimiter,
  validate(refreshSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      const result = await authService.refreshToken(refreshToken);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'INVALID_REFRESH_TOKEN') {
          res.status(401).json({
            error: 'Invalid refresh token',
            detail: '無効なトークンです (Invalid token)',
            code: error.type,
          });
          return;
        } else if (error.type === 'REFRESH_TOKEN_EXPIRED') {
          res.status(401).json({
            error: 'Refresh token expired',
            detail: 'トークンの有効期限が切れています (Token expired)',
            code: error.type,
          });
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

      // データベースを更新
      await prisma.user.update({
        where: { id: req.user.userId },
        data: { displayName },
      });

      logger.info({ userId: req.user.userId }, 'User profile updated');

      // ベストプラクティス: getCurrentUserを使用して一貫したレスポンス形式を返す
      // これにより、rolesを含む完全なUserProfileが返される
      const result = await authService.getCurrentUser(req.user.userId);

      if (!result.ok) {
        res.status(500).json({ error: 'Failed to get updated user', code: 'GET_USER_ERROR' });
        return;
      }

      res.status(200).json(result.value);
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
      const userAgent = req.headers['user-agent'];
      const result = await authService.verify2FA(userId, token, userAgent);

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

/**
 * @swagger
 * /api/v1/auth/2fa/setup:
 *   post:
 *     summary: 2FA設定開始
 *     description: TOTP秘密鍵、QRコード、バックアップコードを生成して返す
 *     tags:
 *       - Two-Factor Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA設定データ生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 secret:
 *                   type: string
 *                   description: Base32エンコード済みTOTP秘密鍵
 *                 qrCodeDataUrl:
 *                   type: string
 *                   description: QRコード（Data URL形式）
 *                 backupCodes:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: 10個のバックアップコード
 *       400:
 *         description: 既に2FAが有効化されている
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/2fa/setup',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }

      const result = await twoFactorService.setupTwoFactor(req.user.userId);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'USER_NOT_FOUND') {
          res.status(404).json({ error: 'User not found', code: error.type });
          return;
        } else if (error.type === 'TWO_FACTOR_ALREADY_ENABLED') {
          res.status(400).json({ error: '2FA is already enabled', code: error.type });
          return;
        }

        res.status(500).json({ error: '2FA setup failed', code: '2FA_SETUP_ERROR' });
        return;
      }

      const setupData = result.value;

      logger.info({ userId: req.user.userId }, '2FA setup started');

      res.status(200).json(setupData);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/2fa/enable:
 *   post:
 *     summary: 2FA有効化
 *     description: TOTPコードを検証して2FAを有効化する
 *     tags:
 *       - Two-Factor Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - totpCode
 *             properties:
 *               totpCode:
 *                 type: string
 *                 description: 6桁のTOTPコード
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: 2FA有効化成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 backupCodes:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: バックアップコード（最後の表示機会）
 *       400:
 *         description: 無効なTOTPコード
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/2fa/enable',
  authenticate,
  validate(enableTwoFactorSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }

      const { totpCode } = req.body;

      const result = await twoFactorService.enableTwoFactor(req.user.userId, totpCode);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'USER_NOT_FOUND') {
          res.status(404).json({ error: 'User not found', code: error.type });
          return;
        } else if (error.type === 'TWO_FACTOR_ALREADY_ENABLED') {
          res.status(400).json({ error: '2FA is already enabled', code: error.type });
          return;
        } else if (error.type === 'INVALID_TOTP_CODE') {
          res.status(400).json({ error: 'Invalid TOTP code', code: error.type });
          return;
        }

        res.status(500).json({ error: '2FA enable failed', code: '2FA_ENABLE_ERROR' });
        return;
      }

      const enabledData = result.value;

      logger.info({ userId: req.user.userId }, '2FA enabled successfully');

      res.status(200).json(enabledData);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/2fa/disable:
 *   post:
 *     summary: 2FA無効化
 *     description: パスワードを確認して2FAを無効化する
 *     tags:
 *       - Two-Factor Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 description: ユーザーの現在のパスワード
 *     responses:
 *       200:
 *         description: 2FA無効化成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "2FA disabled successfully"
 *       400:
 *         description: 無効なパスワードまたは2FAが未有効化
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/2fa/disable',
  authenticate,
  validate(disableTwoFactorSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }

      const { password } = req.body;

      const result = await twoFactorService.disableTwoFactor(req.user.userId, password);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'USER_NOT_FOUND') {
          res.status(404).json({ error: 'User not found', code: error.type });
          return;
        } else if (error.type === 'TWO_FACTOR_NOT_ENABLED') {
          res.status(400).json({ error: '2FA is not enabled', code: error.type });
          return;
        } else if (error.type === 'INVALID_PASSWORD') {
          res.status(400).json({ error: 'Invalid password', code: error.type });
          return;
        }

        res.status(500).json({ error: '2FA disable failed', code: '2FA_DISABLE_ERROR' });
        return;
      }

      logger.info({ userId: req.user.userId }, '2FA disabled successfully');

      res.status(200).json({ message: '2FA disabled successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/2fa/backup-codes/regenerate:
 *   post:
 *     summary: バックアップコード再生成
 *     description: 既存のバックアップコードを削除して新しいコードを生成する
 *     tags:
 *       - Two-Factor Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: バックアップコード再生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 backupCodes:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: 10個の新しいバックアップコード
 *       400:
 *         description: 2FAが未有効化
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/2fa/backup-codes/regenerate',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }

      const result = await twoFactorService.regenerateBackupCodes(req.user.userId);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'USER_NOT_FOUND') {
          res.status(404).json({ error: 'User not found', code: error.type });
          return;
        } else if (error.type === 'TWO_FACTOR_NOT_ENABLED') {
          res.status(400).json({ error: '2FA is not enabled', code: error.type });
          return;
        }

        res
          .status(500)
          .json({ error: 'Backup codes regeneration failed', code: 'BACKUP_CODES_ERROR' });
        return;
      }

      const backupCodes = result.value;

      logger.info({ userId: req.user.userId }, 'Backup codes regenerated successfully');

      res.status(200).json({ backupCodes });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/password/reset-request:
 *   post:
 *     summary: Request password reset
 *     description: Request a password reset email with a reset token
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
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email address
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Password reset email sent (always returns 200 for security)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "If an account exists, a password reset email has been sent"
 *       400:
 *         description: Validation error
 */
router.post(
  '/password/reset-request',
  validate(passwordResetRequestSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body;

      const result = await passwordService.requestPasswordReset(email);

      // セキュリティのため、成功/失敗に関わらず同じレスポンスを返す
      if (!result.ok) {
        logger.warn({ email, error: result.error.type }, 'Password reset request failed');
      } else {
        logger.info({ email }, 'Password reset request processed');
      }

      res.status(200).json({
        message: 'If an account exists, a password reset email has been sent',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/password/verify-reset:
 *   get:
 *     summary: Verify password reset token
 *     description: Verify if a password reset token is valid and not expired
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Password reset token
 *     responses:
 *       200:
 *         description: Token is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid or expired token
 */
router.get(
  '/password/verify-reset',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        res.status(400).json({ error: 'Token is required', code: 'MISSING_TOKEN' });
        return;
      }

      // トークンの存在と有効期限をチェック
      const passwordResetToken = await prisma.passwordResetToken.findUnique({
        where: { token },
      });

      if (!passwordResetToken) {
        res.status(400).json({ error: 'Invalid reset token', code: 'INVALID_RESET_TOKEN' });
        return;
      }

      if (passwordResetToken.usedAt !== null) {
        res.status(400).json({ error: 'Reset token already used', code: 'TOKEN_USED' });
        return;
      }

      if (passwordResetToken.expiresAt < new Date()) {
        res.status(400).json({ error: 'Reset token expired', code: 'TOKEN_EXPIRED' });
        return;
      }

      res.status(200).json({ valid: true });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/password/reset:
 *   post:
 *     summary: Reset password
 *     description: Reset user password using a valid reset token
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *                 description: Password reset token
 *                 example: "abc123def456"
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: New password (min 12 characters, complexity requirements)
 *                 example: "NewSecurePassword123!"
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Password reset successfully"
 *       400:
 *         description: Invalid token or weak password
 */
router.post(
  '/password/reset',
  validate(resetPasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token, newPassword } = req.body;

      const result = await passwordService.resetPassword(token, newPassword);

      if (!result.ok) {
        const error = result.error;

        if (error.type === 'RESET_TOKEN_INVALID') {
          res.status(400).json({ error: 'Invalid reset token', code: error.type });
          return;
        } else if (error.type === 'RESET_TOKEN_EXPIRED') {
          res.status(400).json({ error: 'Reset token has expired', code: error.type });
          return;
        } else if (error.type === 'WEAK_PASSWORD') {
          const detailedMessage = getPasswordViolationMessage(error.violations);
          res.status(400).json({
            error: detailedMessage,
            detail: detailedMessage,
            code: error.type,
            violations: error.violations,
          });
          return;
        } else if (error.type === 'PASSWORD_REUSED') {
          res.status(400).json({
            error: 'Password has been used recently. Please choose a different password',
            code: error.type,
          });
          return;
        }

        res.status(500).json({ error: 'Password reset failed', code: 'PASSWORD_RESET_ERROR' });
        return;
      }

      logger.info({ token: token.substring(0, 8) + '...' }, 'Password reset successfully');

      res.status(200).json({ message: 'Password reset successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/password/change:
 *   post:
 *     summary: Change password
 *     description: Change the password for the authenticated user
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
 *               - currentPassword
 *               - newPassword
 *               - newPasswordConfirm
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 description: Current password
 *               newPassword:
 *                 type: string
 *                 description: New password (min 12 characters)
 *               newPasswordConfirm:
 *                 type: string
 *                 description: New password confirmation
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request (weak password, password mismatch, etc.)
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/password/change',
  authenticate,
  validate(changePasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }

      const { currentPassword, newPassword, newPasswordConfirm } = req.body;

      // パスワード確認チェック
      if (newPassword !== newPasswordConfirm) {
        res.status(400).json({
          error: 'New password and confirmation do not match',
          code: 'PASSWORD_MISMATCH',
        });
        return;
      }

      // パスワード変更サービス呼び出し
      const result = await passwordService.changePassword(
        req.user.userId,
        currentPassword,
        newPassword
      );

      if (!result.ok) {
        const error = result.error;

        if (error.type === 'RESET_TOKEN_INVALID') {
          // changePasswordではUSER_NOT_FOUNDまたはINVALID_PASSWORDの意味
          res.status(400).json({
            error: 'Current password is incorrect',
            code: 'INVALID_CURRENT_PASSWORD',
          });
          return;
        } else if (error.type === 'WEAK_PASSWORD') {
          const detailedMessage = getPasswordViolationMessage(error.violations);
          res.status(400).json({
            error: detailedMessage,
            detail: detailedMessage,
            code: error.type,
            violations: error.violations,
          });
          return;
        } else if (error.type === 'PASSWORD_REUSED') {
          res.status(400).json({
            error: 'Password has been used recently. Please choose a different password',
            code: error.type,
          });
          return;
        }

        res.status(500).json({ error: 'Password change failed', code: 'PASSWORD_CHANGE_ERROR' });
        return;
      }

      logger.info({ userId: req.user.userId }, 'Password changed successfully');

      res.status(200).json({ message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
