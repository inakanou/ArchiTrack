/**
 * @fileoverview 認証APIルート
 *
 * Requirements (user-authentication):
 * - REQ-2: ユーザー登録（招待経由）
 * - REQ-4: ログイン
 * - REQ-5: トークン管理（リフレッシュ、ログアウト）
 * - REQ-9: ユーザー情報取得・更新
 * - REQ-27A: 2FA検証
 * - 要件32: 2FA を伴うログインの完全性（2FA 待ちの資格）
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service.js';
import { TwoFactorService } from '../services/two-factor.service.js';
import { PasswordService } from '../services/password.service.js';
import { getSharedAuthenticatedUserStateService } from '../services/authenticated-user-state.service.js';
// import { SessionService } from '../services/session.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { csrfProtection } from '../middleware/csrf.middleware.js';
import { loginLimiter, refreshLimiter } from '../middleware/rateLimit.middleware.js';
import { getClientIp } from '../middleware/client-ip.js';
import logger from '../utils/logger.js';
import { SECURITY_CONFIG } from '../config/security.constants.js';
import { PasswordViolation } from '../types/password.types.js';
import { updateProfileSchema } from '../schemas/auth-update.schema.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../errors/apiError.js';
import type { AuthError, AuthUserView } from '../types/auth.types.js';

/**
 * リフレッシュトークンの Cookie の Path（リフレッシュとログアウトの経路にだけ送られるよう認証の経路に限る）
 */
const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';

/**
 * Path を認証の経路に限る前に Path=/ で発行した Cookie を消す
 *
 * 同じ名前の Cookie が二つ送られると、ブラウザは Path の長い方を先に並べるため新しい方が読まれるが、
 * 古い方が残ると期限まで送られ続ける。発行・消去のたびにあわせて消す。
 */
function clearLegacyRootRefreshTokenCookie(res: Response): void {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
}

/**
 * リフレッシュトークンをHTTPOnly Cookieに設定する
 * @requirement user-authentication/REQ-26.5: トークンをCookieに保存する際にHttpOnly、Secure、SameSite=Strict属性を設定
 */
function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  clearLegacyRootRefreshTokenCookie(res);
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: REFRESH_TOKEN_COOKIE_PATH,
  });
}

/**
 * リフレッシュトークンの Cookie を消す（発行と同じ属性で消す）
 */
function clearRefreshTokenCookie(res: Response): void {
  clearLegacyRootRefreshTokenCookie(res);
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: REFRESH_TOKEN_COOKIE_PATH,
  });
}

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

/**
 * リフレッシュとログアウトで提示されたリフレッシュトークンを Cookie から読み、`res.locals.refreshToken` に置く
 *
 * 全ての要求に CSRF の二重送信と Origin の照合を課す（要件33.12）。本文は読まない
 * （本文に `refreshToken` があっても CSRF を免れず、本文の値は使わない）。Cookie が無ければ 400。
 */
function readRefreshTokenCredential(req: Request, res: Response, next: NextFunction): void {
  csrfProtection(req, res, () => {
    const cookieToken: unknown = req.cookies?.refreshToken;
    if (typeof cookieToken !== 'string' || cookieToken === '') {
      next(new ValidationError('Refresh token is required'));
      return;
    }
    res.locals.refreshToken = cookieToken;
    next();
  });
}

/**
 * 認証の成功の応答本文からリフレッシュトークンを外す（要件33.9。リフレッシュトークンは Set-Cookie だけで渡す）
 */
function withoutRefreshToken<T extends { refreshToken?: string }>(
  authResponse: T
): Omit<T, 'refreshToken'> {
  const { refreshToken: _refreshToken, ...body } = authResponse;
  return body;
}

/**
 * 応答に載せる利用者と状態（AuthUserView）を読む（タスク47.5）
 *
 * 操作そのものは成功しているため、読めないときは応答を失敗にせず、`user` を省いて警告を残す。
 */
async function readAuthUserView(userId: string): Promise<{ user?: AuthUserView }> {
  const view = await authService.getAuthUserView(userId);
  if (!view.ok) {
    logger.warn({ userId, errorType: view.error.type }, 'Failed to read user state for response');
    return {};
  }
  return { user: view.value };
}

/**
 * 2FA 待ちの資格の保存先（Redis）が使えないときの 503（2FA の検証を素通りさせない。要件32）
 */
function sendTwoFactorChallengeUnavailable(res: Response): void {
  res.status(503).json({
    error: 'Service temporarily unavailable',
    code: 'SERVICE_UNAVAILABLE',
  });
}

/**
 * 2FA の検証（TOTP・バックアップコード）に共通の失敗を応答する。応答したら true
 *
 * - 資格の不在・期限切れ・消費済み、資格に結び付いた利用者の不在: 401 INVALID_CHALLENGE（区別しない。要件32.2〜32.5）
 * - 資格の保存先が使えない: 503 SERVICE_UNAVAILABLE
 * - 2FA のロック: 429
 * - DB の障害: 500
 */
function sendTwoFactorLoginError(
  res: Response,
  error: AuthError,
  databaseError: { log: string; message: string }
): boolean {
  if (error.type === 'CHALLENGE_INVALID' || error.type === 'USER_NOT_FOUND') {
    res.status(401).json({
      error: '認証の有効期限が切れました。もう一度ログインしてください',
      code: 'INVALID_CHALLENGE',
    });
    return true;
  }
  if (error.type === 'SERVICE_UNAVAILABLE') {
    sendTwoFactorChallengeUnavailable(res);
    return true;
  }
  if (error.type === 'ACCOUNT_LOCKED') {
    res.status(429).json({
      error: 'アカウントが一時的にロックされました。5分後に再試行してください',
      detail: 'アカウントがロックされています',
      code: error.type,
      unlockAt: error.unlockAt,
    });
    return true;
  }
  if (error.type === 'DATABASE_ERROR') {
    logger.error({ error }, databaseError.log);
    res.status(500).json({ error: databaseError.message, code: '2FA_ERROR' });
    return true;
  }
  return false;
}

/**
 * 2FA 待ちの資格（ログインの応答の challengeToken）
 *
 * 欠けた要求も検証の段で 401 にする（要件32.2）ため、形式の検証では必須にしない。
 * メールアドレス・JWT などの他の項目は資格として読まない（要件32.5）。
 */
const challengeTokenField = z.string().max(4096).optional();

const verify2FASchema = z.object({
  challengeToken: challengeTokenField,
  code: z
    .string()
    .length(
      SECURITY_CONFIG.TWO_FACTOR.CODE_LENGTH,
      `TOTP code must be ${SECURITY_CONFIG.TWO_FACTOR.CODE_LENGTH} digits`
    ),
});

const enableTwoFactorSchema = z.object({
  totpCode: z
    .string()
    .length(
      SECURITY_CONFIG.TWO_FACTOR.CODE_LENGTH,
      `TOTP code must be ${SECURITY_CONFIG.TWO_FACTOR.CODE_LENGTH} digits`
    ),
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

      // 要件26.5: リフレッシュトークンをHTTPOnly Cookieに設定
      setRefreshTokenCookie(res, authResponse.refreshToken);

      logger.info(
        { userId: authResponse.user.id, email: authResponse.user.email },
        'User registered successfully'
      );

      res.status(201).json(withoutRefreshToken(authResponse));
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
 *     description: >-
 *       Authenticate a user and return an access token. The refresh token is set only in the
 *       HttpOnly refreshToken cookie, never in the response body.
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
 *                 challengeToken:
 *                   type: string
 *                   description: >-
 *                     Opaque 2FA challenge bound to this successful password verification
 *                     (single use, valid for expiresIn seconds). Present only when requires2FA is true.
 *                     The response never contains the user ID before 2FA succeeds.
 *                 expiresIn:
 *                   type: integer
 *                   description: Lifetime of the challenge in seconds (when requires2FA is true)
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       503:
 *         description: The 2FA challenge store is unavailable
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
        } else if (error.type === 'SERVICE_UNAVAILABLE') {
          // 2FA 待ちの資格を保存できないときは 2FA の検証へ進めない（要件32）
          sendTwoFactorChallengeUnavailable(res);
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

      // 2FA有効ユーザーの場合は、2FA 待ちの資格を返して2FA検証を要求する（要件32.1）。
      // 利用者 ID は含めない（要件42.7）
      if (loginResponse.type === '2FA_REQUIRED') {
        res.status(200).json({
          requires2FA: true,
          challengeToken: loginResponse.challengeToken,
          expiresIn: loginResponse.expiresIn,
        });
        return;
      }

      // 要件26.5: リフレッシュトークンをHTTPOnly Cookieに設定
      setRefreshTokenCookie(res, loginResponse.refreshToken);

      logger.info(
        { userId: loginResponse.user.id, email: loginResponse.user.email },
        'User logged in'
      );

      res.status(200).json(withoutRefreshToken(loginResponse));
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
 *     description: >-
 *       Get a new access token using the refresh token in the refreshToken cookie. The request
 *       body is not read. The request must carry the X-CSRF-Token header matching the csrf-token
 *       cookie and an Origin (or Referer) of FRONTEND_URL; otherwise 403. The rotated refresh
 *       token is returned only in the Set-Cookie header, never in the response body.
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: header
 *         name: X-CSRF-Token
 *         required: true
 *         schema:
 *           type: string
 *         description: CSRF token obtained from GET /csrf-token (must match the csrf-token cookie)
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
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: CSRF token missing or invalid, or request origin not allowed
 */
router.post(
  '/refresh',
  refreshLimiter,
  readRefreshTokenCredential,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const refreshToken = res.locals.refreshToken as string;

      const result = await authService.refreshToken(refreshToken, {
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'TOKEN_REUSE_DETECTED') {
          // 系列の全てを失効させた（要件33.6）。本文は無効なトークンと同じにし、Cookie を消す
          clearRefreshTokenCookie(res);
          res.status(401).json({
            error: 'Invalid refresh token',
            detail: '無効なトークンです (Invalid token)',
            code: 'INVALID_REFRESH_TOKEN',
          });
          return;
        }
        if (error.type === 'INVALID_REFRESH_TOKEN') {
          clearRefreshTokenCookie(res);
          res.status(401).json({
            error: 'Invalid refresh token',
            detail: '無効なトークンです (Invalid token)',
            code: error.type,
          });
          return;
        } else if (error.type === 'REFRESH_TOKEN_EXPIRED') {
          clearRefreshTokenCookie(res);
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

      // 要件26.5: リフレッシュトークンをHTTPOnly Cookieに設定
      setRefreshTokenCookie(res, authResponse.refreshToken);

      logger.info(
        { userId: authResponse.user.id, email: authResponse.user.email },
        'Token refreshed successfully'
      );

      res.status(200).json(withoutRefreshToken(authResponse));
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
 *               expectedUpdatedAt:
 *                 type: string
 *                 format: date-time
 *                 description: 楽観的ロックの版（任意）。GET /api/v1/auth/me の updatedAt。古いときは 409 PROFILE_CONFLICT
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
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                   description: 次の更新で expectedUpdatedAt として送り返す版
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: ユーザーが見つからない（USER_NOT_FOUND、Problem Details）
 *       409:
 *         description: 楽観的ロックの競合（PROFILE_CONFLICT、Problem Details）
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

      const { displayName, expectedUpdatedAt } = req.body as {
        displayName?: string;
        expectedUpdatedAt?: string;
      };

      if (expectedUpdatedAt !== undefined) {
        // 楽観的ロック: 版が送られたときだけ、updatedAt が一致する場合に限って更新する
        const updated = await authService.updateProfileIfUnchanged(
          req.user.userId,
          { displayName },
          new Date(expectedUpdatedAt)
        );
        if (!updated.ok) {
          const error = updated.error;
          if (error.type === 'USER_NOT_FOUND') {
            next(new NotFoundError('User not found', 'USER_NOT_FOUND'));
            return;
          }
          if (error.type === 'PROFILE_CONFLICT') {
            next(
              new ConflictError(
                '他の操作によって更新されました。画面を更新してください',
                'PROFILE_CONFLICT',
                {
                  expectedUpdatedAt: error.expectedUpdatedAt.toISOString(),
                  actualUpdatedAt: error.actualUpdatedAt.toISOString(),
                }
              )
            );
            return;
          }
          res.status(500).json({ error: 'Failed to update profile', code: 'UPDATE_PROFILE_ERROR' });
          return;
        }
      } else {
        // データベースを更新
        await prisma.user.update({
          where: { id: req.user.userId },
          data: { displayName },
        });
      }

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
 *     description: >-
 *       Logout the current user from the current device. The refresh token to invalidate is read
 *       from the refreshToken cookie; the request body is not read. The request must carry the
 *       X-CSRF-Token header matching the csrf-token cookie and an Origin (or Referer) of
 *       FRONTEND_URL; otherwise 403.
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-CSRF-Token
 *         required: true
 *         schema:
 *           type: string
 *         description: CSRF token obtained from GET /csrf-token (must match the csrf-token cookie)
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
 *       403:
 *         description: CSRF token missing or invalid, or request origin not allowed
 */
router.post(
  '/logout',
  authenticate,
  readRefreshTokenCredential,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }

      const refreshToken = res.locals.refreshToken as string;

      const result = await authService.logout(req.user.userId, refreshToken);

      if (!result.ok) {
        const error = result.error;
        res.status(400).json({ error: 'Logout failed', code: error.type });
        return;
      }

      clearRefreshTokenCookie(res);

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
 *     description: >-
 *       Complete a login with a TOTP code. Requires the challengeToken returned by the login
 *       response; an email address or a JWT is never accepted as the challenge. The challenge
 *       is consumed on success.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - challengeToken
 *               - code
 *             properties:
 *               challengeToken:
 *                 type: string
 *                 description: 2FA challenge from the login response
 *               code:
 *                 type: string
 *                 description: 6-digit TOTP code
 *                 example: "123456"
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
 *                 user:
 *                   type: object
 *       401:
 *         description: Missing, expired or consumed challenge (INVALID_CHALLENGE), or invalid code
 *       429:
 *         description: 2FA is locked after too many failures
 *       503:
 *         description: The 2FA challenge store is unavailable
 */
router.post(
  '/verify-2fa',
  validate(verify2FASchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { challengeToken, code } = req.body as { challengeToken?: string; code: string };
      const userAgent = req.headers['user-agent'];

      // ログインの応答の 2FA 待ちの資格に結び付いた利用者だけを検証する（要件32.1〜32.5）
      const result = await authService.completeTwoFactorLogin(
        challengeToken ?? '',
        { kind: 'totp', code },
        userAgent
      );

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'INVALID_2FA_CODE') {
          res.status(401).json({
            error: '認証コードが正しくありません',
            detail: '認証コードが正しくありません',
            code: error.type,
          });
          return;
        }
        if (
          sendTwoFactorLoginError(res, error, {
            log: 'Database error during 2FA verification',
            message: '2FA verification failed',
          })
        ) {
          return;
        }

        // 未知のエラータイプの場合
        logger.error({ errorType: error.type }, 'Unknown 2FA error type');
        res.status(500).json({ error: '2FA verification failed', code: '2FA_ERROR' });
        return;
      }

      const authResponse = result.value;

      // 要件26.5: リフレッシュトークンをHTTPOnly Cookieに設定
      setRefreshTokenCookie(res, authResponse.refreshToken);

      logger.info({ userId: authResponse.user.id }, '2FA verification successful');

      res.status(200).json(withoutRefreshToken(authResponse));
    } catch (error) {
      next(error);
    }
  }
);

// バックアップコード検証用のスキーマ
const verifyBackupCodeSchema = z.object({
  challengeToken: challengeTokenField,
  backupCode: z.string().min(1, 'Backup code is required'),
});

/**
 * @swagger
 * /api/v1/auth/verify-2fa/backup:
 *   post:
 *     summary: Verify 2FA backup code
 *     description: >-
 *       Complete a login with a backup code. Requires the same challengeToken as the TOTP
 *       verification; an email address is never accepted. The challenge is consumed on success.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - challengeToken
 *               - backupCode
 *             properties:
 *               challengeToken:
 *                 type: string
 *                 description: 2FA challenge from the login response
 *               backupCode:
 *                 type: string
 *                 description: 8-character backup code
 *                 example: "ABCD1234"
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
 *                 user:
 *                   type: object
 *       401:
 *         description: Missing, expired or consumed challenge (INVALID_CHALLENGE), or invalid backup code
 *       429:
 *         description: 2FA is locked after too many failures
 *       503:
 *         description: The 2FA challenge store is unavailable
 */
router.post(
  '/verify-2fa/backup',
  validate(verifyBackupCodeSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { challengeToken, backupCode } = req.body as {
        challengeToken?: string;
        backupCode: string;
      };
      const userAgent = req.headers['user-agent'];

      // バックアップコードも TOTP と同じ 2FA 待ちの資格を要求する（要件32.6）
      const result = await authService.completeTwoFactorLogin(
        challengeToken ?? '',
        { kind: 'backup', backupCode },
        userAgent
      );

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'INVALID_BACKUP_CODE') {
          res.status(401).json({
            error: 'バックアップコードが正しくありません',
            detail: 'Invalid backup code',
            code: error.type,
          });
          return;
        }
        if (
          sendTwoFactorLoginError(res, error, {
            log: 'Database error during backup code verification',
            message: 'Backup code verification failed',
          })
        ) {
          return;
        }

        // 未知のエラータイプの場合
        logger.error({ errorType: error.type }, 'Unknown backup code verification error type');
        res.status(500).json({ error: 'Backup code verification failed', code: '2FA_ERROR' });
        return;
      }

      const authResponse = result.value;

      // 要件26.5: リフレッシュトークンをHTTPOnly Cookieに設定
      setRefreshTokenCookie(res, authResponse.refreshToken);

      logger.info({ userId: authResponse.user.id }, 'Backup code verification successful');

      res.status(200).json(withoutRefreshToken(authResponse));
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

      // 2FA の登録で利用者の状態が変わったので、コミットの後に状態のキャッシュを無効化する（タスク47.5）
      await getSharedAuthenticatedUserStateService().invalidate(req.user.userId);

      logger.info({ userId: req.user.userId }, '2FA enabled successfully');

      res.status(200).json({ ...enabledData, ...(await readAuthUserView(req.user.userId)) });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/2fa/disable:
 *   post:
 *     summary: 2FA無効化（拒否）
 *     description: |
 *       2FA は全ユーザーで必須のため、利用者自身による無効化の要求は常に 403 で拒否する（要件34.6）。
 *       第二要素を失った場合の復旧は管理者による 2FA の再設定で、端末の交換は現在の TOTP コードによる
 *       再登録で行う。
 *     tags:
 *       - Two-Factor Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: 2FA の自己の無効化は許可されていない（code は TWO_FACTOR_DISABLE_NOT_ALLOWED）
 */
router.post('/2fa/disable', authenticate, (_req: Request, _res: Response, next: NextFunction) => {
  // 要件34.6: 2FA の全ユーザー必須化により、自己の無効化は本文の内容に関わらず拒否する
  next(
    new ForbiddenError(
      'Disabling two-factor authentication is not allowed',
      'TWO_FACTOR_DISABLE_NOT_ALLOWED'
    )
  );
});

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

      const plainTextCodes = result.value;

      // 再生成後のコードを BackupCodeInfo 形式で返す（全て未使用、マスクなし）
      const backupCodes = plainTextCodes.map((code) => ({
        code,
        isUsed: false,
      }));

      logger.info({ userId: req.user.userId }, 'Backup codes regenerated successfully');

      res.status(200).json({ backupCodes, remainingCount: backupCodes.length });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/2fa/backup-codes:
 *   get:
 *     summary: バックアップコードステータス一覧取得
 *     description: 現在のバックアップコードの使用状況を取得する
 *     tags:
 *       - Two-Factor Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: バックアップコードステータス取得成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 backupCodes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       code:
 *                         type: string
 *                         description: マスク表示用のコード（****-0001形式）
 *                       isUsed:
 *                         type: boolean
 *                         description: 使用済みフラグ
 *                       usedAt:
 *                         type: string
 *                         nullable: true
 *                         description: 使用日時（ISO 8601形式）
 *                 remainingCount:
 *                   type: number
 *                   description: 未使用コード数
 *       400:
 *         description: 2FAが未有効化
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/2fa/backup-codes',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }

      const result = await twoFactorService.getBackupCodesStatus(req.user.userId);

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
          .json({ error: 'Failed to get backup codes status', code: 'BACKUP_CODES_ERROR' });
        return;
      }

      const backupCodes = result.value;
      const remainingCount = backupCodes.filter((code) => !code.isUsed).length;

      logger.debug({ userId: req.user.userId }, 'Backup codes status retrieved successfully');

      res.status(200).json({ backupCodes, remainingCount });
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

      res.status(200).json({
        message: 'Password changed successfully',
        ...(await readAuthUserView(req.user.userId)),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
