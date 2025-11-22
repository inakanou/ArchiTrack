/**
 * @fileoverview 認証サービス（統合）
 *
 * Requirements:
 * - 2.1-2.12: ユーザー登録機能（招待経由、パスワード検証、トランザクション管理）
 * - 4.1-4.7: ログイン機能（メールアドレス・パスワード検証、JWT発行、連続失敗検知）
 * - 5.1-5.7: トークン管理
 * - 8.1-8.5: セッション管理
 * - 9.1-9.5: ユーザー情報取得
 */

import type { PrismaClient } from '@prisma/client';
import { InvitationService } from './invitation.service.js';
import { PasswordService } from './password.service.js';
import { TokenService, type TokenPayload } from './token.service.js';
import tokenServiceInstance from './token.service.js';
import { TwoFactorService } from './two-factor.service.js';
import { SessionService } from './session.service.js';
import type {
  IAuthService,
  RegisterData,
  AuthResponse,
  LoginResponse,
  UserProfile,
  AuthError,
} from '../types/auth.types.js';
import { Ok, Err, type Result } from '../types/result.js';
import { addTimingAttackDelay } from '../utils/timing.js';
import { SECURITY_CONFIG } from '../config/security.constants.js';

/**
 * 認証サービス
 *
 * 責任と境界:
 * - 主要責任: 認証フロー（登録、ログイン、ログアウト）の統合
 * - ドメイン境界: 認証ドメイン
 * - データ所有権: なし（他のサービスを統合）
 * - トランザクション境界: ユーザー登録時のトランザクション管理
 *
 * 依存関係:
 * - インバウンド: AuthController
 * - アウトバウンド: InvitationService, PasswordService, TokenService
 * - 外部: Prisma Client
 */
export class AuthService implements IAuthService {
  private readonly invitationService: InvitationService;
  private readonly passwordService: PasswordService;
  private readonly tokenService: TokenService;
  private readonly twoFactorService: TwoFactorService;
  private readonly sessionService: SessionService;

  constructor(
    private readonly prisma: PrismaClient,
    invitationService?: InvitationService,
    passwordService?: PasswordService,
    tokenService?: TokenService,
    twoFactorService?: TwoFactorService,
    sessionService?: SessionService
  ) {
    this.invitationService = invitationService || new InvitationService(prisma);
    this.passwordService = passwordService || new PasswordService(prisma);
    this.tokenService = tokenService || tokenServiceInstance;
    this.twoFactorService = twoFactorService || new TwoFactorService();
    this.sessionService = sessionService || new SessionService(prisma);
  }

  /**
   * ユーザー登録（招待経由）
   *
   * トランザクション内で以下を実行:
   * 1. 招待トークン検証
   * 2. パスワード強度検証
   * 3. ユーザー作成
   * 4. 招待トークンを使用済みにマーク
   * 5. デフォルトロール (user) 割り当て
   * 6. JWT生成
   */
  async register(
    invitationToken: string,
    data: RegisterData
  ): Promise<Result<AuthResponse, AuthError>> {
    try {
      // 1. 招待トークン検証
      const invitationResult = await this.invitationService.validateInvitation(invitationToken);
      if (!invitationResult.ok) {
        // InvitationErrorをAuthErrorに変換
        const invitationError = invitationResult.error;
        if (invitationError.type === 'INVALID_TOKEN') {
          return Err({ type: 'INVITATION_INVALID' });
        } else if (invitationError.type === 'EXPIRED_TOKEN') {
          return Err({ type: 'INVITATION_EXPIRED' });
        } else if (invitationError.type === 'USED_TOKEN') {
          return Err({ type: 'INVITATION_ALREADY_USED' });
        }
        return Err({ type: 'INVITATION_INVALID' });
      }

      const invitation = invitationResult.value;

      // 2. メールアドレス重複チェック（防御的プログラミング）
      const existingUser = await this.prisma.user.findUnique({
        where: { email: invitation.email },
      });
      if (existingUser) {
        return Err({ type: 'EMAIL_ALREADY_REGISTERED' });
      }

      // 3. パスワード強度検証
      const passwordValidationResult = await this.passwordService.validatePasswordStrength(
        data.password,
        [invitation.email, data.displayName]
      );
      if (!passwordValidationResult.ok) {
        const passwordError = passwordValidationResult.error;
        if (passwordError.type === 'WEAK_PASSWORD') {
          return Err({
            type: 'WEAK_PASSWORD',
            violations: passwordError.violations,
          });
        }
        // その他のパスワードエラー（HISTORY_REUSEなど）
        return Err({ type: 'WEAK_PASSWORD', violations: [] });
      }

      // 4. パスワードハッシュ化
      const passwordHash = await this.passwordService.hashPassword(data.password);

      // 5. トランザクション内でユーザー作成、招待使用済みマーク、ロール割り当て
      const user = await this.prisma.$transaction(async (tx) => {
        // ユーザー作成
        const newUser = await tx.user.create({
          data: {
            email: invitation.email,
            displayName: data.displayName,
            passwordHash,
          },
        });

        // 招待トークンを使用済みにマーク
        await tx.invitation.update({
          where: { id: invitation.id },
          data: {
            status: 'used',
            usedAt: new Date(),
            userId: newUser.id,
          },
        });

        // デフォルトロール (user) を割り当て
        const userRole = await tx.role.findUnique({
          where: { name: 'user' },
        });

        if (userRole) {
          await tx.userRole.create({
            data: {
              userId: newUser.id,
              roleId: userRole.id,
            },
          });
        }

        // ユーザーとロール情報を返す
        return await tx.user.findUnique({
          where: { id: newUser.id },
          include: {
            userRoles: {
              include: {
                role: true,
              },
            },
          },
        });
      });

      if (!user) {
        return Err({ type: 'DATABASE_ERROR', message: 'Failed to create user' });
      }

      // 6. JWT生成
      const payload = {
        userId: user.id,
        email: user.email,
        roles: user.userRoles.map((ur) => ur.role.name),
      };

      const accessToken = await this.tokenService.generateAccessToken(payload);
      const refreshToken = await this.tokenService.generateRefreshToken(payload);

      // 7. リフレッシュトークンをDBに保存
      await this.sessionService.createSession(user.id, refreshToken);

      // 8. AuthResponse返却
      const userProfile: UserProfile = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.userRoles.map((ur) => ur.role.name),
        createdAt: user.createdAt,
        twoFactorEnabled: user.twoFactorEnabled,
      };

      return Ok({
        accessToken,
        refreshToken,
        user: userProfile,
      });
    } catch (error) {
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * ログイン
   *
   * 処理フロー:
   * 1. メールアドレスでユーザー検索
   * 2. アカウントロック確認
   * 3. パスワード検証
   * 4. 連続失敗時のアカウントロック処理
   * 5. 2FA有効チェック
   * 6. トークン生成（2FA無効の場合のみ）
   */
  async login(email: string, password: string): Promise<Result<LoginResponse, AuthError>> {
    try {
      // 1. Fetch user with only necessary fields (optimized query)
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          displayName: true,
          loginFailures: true,
          isLocked: true,
          lockedUntil: true,
          twoFactorEnabled: true,
          createdAt: true,
          userRoles: {
            select: {
              role: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      // ユーザーが存在しない場合
      // 要件26.9: タイミング攻撃対策の遅延を挿入
      if (!user) {
        await addTimingAttackDelay();
        return Err({ type: 'INVALID_CREDENTIALS' });
      }

      // 2. アカウントロック確認
      if (user.isLocked && user.lockedUntil && user.lockedUntil > new Date()) {
        return Err({
          type: 'ACCOUNT_LOCKED',
          unlockAt: user.lockedUntil,
        });
      }

      // ロック期限切れの場合はロック解除
      if (user.isLocked && user.lockedUntil && user.lockedUntil <= new Date()) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            isLocked: false,
            lockedUntil: null,
            loginFailures: 0,
          },
        });
      }

      // 3. パスワード検証
      const passwordValid = await this.passwordService.verifyPassword(password, user.passwordHash);

      if (!passwordValid) {
        // パスワード不正の場合、ログイン失敗回数をインクリメント
        const newFailures = user.loginFailures + 1;
        const isLocked = newFailures >= SECURITY_CONFIG.LOGIN.MAX_FAILURES;
        const lockedUntil = isLocked
          ? new Date(Date.now() + SECURITY_CONFIG.LOGIN.LOCK_DURATION_MS)
          : null;

        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            loginFailures: newFailures,
            isLocked,
            lockedUntil,
          },
        });

        if (isLocked && lockedUntil) {
          return Err({
            type: 'ACCOUNT_LOCKED',
            unlockAt: lockedUntil,
          });
        }

        // 要件26.9: タイミング攻撃対策の遅延を挿入
        await addTimingAttackDelay();
        return Err({ type: 'INVALID_CREDENTIALS' });
      }

      // 4. ログイン成功時、ログイン失敗回数をリセット
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          loginFailures: 0,
          isLocked: false,
          lockedUntil: null,
        },
      });

      // 5. 2FA有効チェック
      if (user.twoFactorEnabled) {
        // 2FA有効の場合、2FA検証画面へ
        return Ok({
          type: '2FA_REQUIRED',
          userId: user.id,
        });
      }

      // 6. トークン生成（2FA無効の場合）
      const payload = {
        userId: user.id,
        email: user.email,
        roles: user.userRoles.map((ur) => ur.role.name),
      };

      const accessToken = await this.tokenService.generateAccessToken(payload);
      const refreshToken = await this.tokenService.generateRefreshToken(payload);

      // リフレッシュトークンをDBに保存
      await this.sessionService.createSession(user.id, refreshToken);

      // UserProfile作成
      const userProfile: UserProfile = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.userRoles.map((ur) => ur.role.name),
        createdAt: user.createdAt,
        twoFactorEnabled: user.twoFactorEnabled,
      };

      return Ok({
        type: 'SUCCESS',
        accessToken,
        refreshToken,
        user: userProfile,
      });
    } catch (error) {
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 2FA検証（ログイン時）
   *
   * 処理フロー:
   * 1. ユーザー検索（ロール情報も取得）
   * 2. 2FAアカウントロック確認
   * 3. ロック期限切れの場合はロック解除
   * 4. TOTP検証
   * 5. 検証成功時: JWT生成、失敗カウンターリセット
   * 6. 検証失敗時: 失敗カウンターインクリメント、5回で5分間ロック
   */
  async verify2FA(userId: string, totpCode: string): Promise<Result<AuthResponse, AuthError>> {
    try {
      // 1. Fetch user with only necessary fields (optimized query)
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          createdAt: true,
          twoFactorEnabled: true,
          twoFactorFailures: true,
          twoFactorLockedUntil: true,
          userRoles: {
            select: {
              role: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      // ユーザーが存在しない場合
      if (!user) {
        return Err({ type: 'USER_NOT_FOUND' });
      }

      // 2. 2FAアカウントロック確認
      if (user.twoFactorLockedUntil && user.twoFactorLockedUntil > new Date()) {
        return Err({
          type: 'ACCOUNT_LOCKED',
          unlockAt: user.twoFactorLockedUntil,
        });
      }

      // 3. ロック期限切れの場合はロック解除
      if (user.twoFactorLockedUntil && user.twoFactorLockedUntil <= new Date()) {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            twoFactorFailures: 0,
            twoFactorLockedUntil: null,
          },
        });
      }

      // 4. TOTP検証
      const verifyResult = await this.twoFactorService.verifyTOTP(userId, totpCode);

      if (!verifyResult.ok) {
        // TwoFactorServiceエラーをAuthErrorに変換
        return Err({ type: 'INVALID_2FA_CODE' });
      }

      const isValid = verifyResult.value;

      if (!isValid) {
        // 検証失敗: 失敗カウンターをインクリメント
        const newFailures = user.twoFactorFailures + 1;
        const isLocked = newFailures >= SECURITY_CONFIG.TWO_FACTOR.MAX_FAILURES;
        const lockedUntil = isLocked
          ? new Date(Date.now() + SECURITY_CONFIG.TWO_FACTOR.LOCK_DURATION_MS)
          : null;

        await this.prisma.user.update({
          where: { id: userId },
          data: {
            twoFactorFailures: newFailures,
            ...(isLocked && { twoFactorLockedUntil: lockedUntil }),
          },
        });

        if (isLocked && lockedUntil) {
          return Err({
            type: 'ACCOUNT_LOCKED',
            unlockAt: lockedUntil,
          });
        }

        return Err({ type: 'INVALID_2FA_CODE' });
      }

      // 5. 検証成功: 失敗カウンターをリセット
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorFailures: 0,
          twoFactorLockedUntil: null,
        },
      });

      // 6. JWT生成
      const payload = {
        userId: user.id,
        email: user.email,
        roles: user.userRoles.map((ur) => ur.role.name),
      };

      const accessToken = await this.tokenService.generateAccessToken(payload);
      const refreshToken = await this.tokenService.generateRefreshToken(payload);

      // リフレッシュトークンをDBに保存
      await this.sessionService.createSession(user.id, refreshToken);

      // UserProfile作成
      const userProfile: UserProfile = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.userRoles.map((ur) => ur.role.name),
        createdAt: user.createdAt,
        twoFactorEnabled: user.twoFactorEnabled,
      };

      return Ok({
        accessToken,
        refreshToken,
        user: userProfile,
      });
    } catch (error) {
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * ログアウト（単一デバイス）
   *
   * Note: SessionServiceは将来実装予定のため、現在は簡易実装
   */
  async logout(userId: string, refreshToken: string): Promise<Result<void, AuthError>> {
    try {
      // リフレッシュトークンを無効化
      // TODO: SessionService実装後、セッション削除も追加
      await this.prisma.refreshToken.deleteMany({
        where: {
          userId,
          token: refreshToken,
        },
      });

      return Ok(undefined);
    } catch (error) {
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 全デバイスからログアウト
   *
   * Note: SessionServiceは将来実装予定のため、現在は簡易実装
   */
  async logoutAll(userId: string): Promise<Result<void, AuthError>> {
    try {
      // 全てのリフレッシュトークンを無効化
      // TODO: SessionService実装後、全セッション削除も追加
      await this.prisma.refreshToken.deleteMany({
        where: {
          userId,
        },
      });

      return Ok(undefined);
    } catch (error) {
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 現在のユーザー情報取得
   */
  async getCurrentUser(userId: string): Promise<Result<UserProfile, AuthError>> {
    try {
      // Fetch user with only necessary fields (optimized query)
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          createdAt: true,
          twoFactorEnabled: true,
          userRoles: {
            select: {
              role: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      // User not found
      if (!user) {
        return Err({ type: 'USER_NOT_FOUND' });
      }

      // Convert to UserProfile format
      const userProfile: UserProfile = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.userRoles.map((ur) => ur.role.name),
        createdAt: user.createdAt,
        twoFactorEnabled: user.twoFactorEnabled,
      };

      return Ok(userProfile);
    } catch (error) {
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * トークンリフレッシュ
   * 要件5.1: リフレッシュトークンを使用して新しいアクセストークンを発行
   */
  async refreshToken(refreshToken: string): Promise<Result<AuthResponse, AuthError>> {
    try {
      // 1. リフレッシュトークンを検証
      const verifyResult = await this.tokenService.verifyToken(refreshToken, 'refresh');

      if (!verifyResult.ok) {
        return Err({ type: 'INVALID_REFRESH_TOKEN' });
      }

      // 2. データベースでリフレッシュトークンの存在と有効性を確認
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: {
          user: {
            include: {
              userRoles: {
                include: {
                  role: true,
                },
              },
            },
          },
        },
      });

      // リフレッシュトークンが存在しない
      if (!storedToken) {
        return Err({ type: 'INVALID_REFRESH_TOKEN' });
      }

      // 有効期限が切れている
      if (storedToken.expiresAt < new Date()) {
        return Err({ type: 'REFRESH_TOKEN_EXPIRED' });
      }

      // 3. 新しいアクセストークンとリフレッシュトークンを発行
      const tokenPayload: TokenPayload = {
        userId: storedToken.user.id,
        email: storedToken.user.email,
        roles: storedToken.user.userRoles.map((ur) => ur.role.name),
      };

      const newAccessToken = await this.tokenService.generateAccessToken(tokenPayload);
      const newRefreshToken = await this.tokenService.generateRefreshToken(tokenPayload);

      // 4. 古いリフレッシュトークンを削除（トークンローテーション）
      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });

      // 5. 新しいリフレッシュトークンをデータベースに保存
      await this.sessionService.createSession(
        storedToken.user.id,
        newRefreshToken,
        storedToken.deviceInfo || undefined
      );

      // 6. ユーザー情報を返却
      const userProfile: UserProfile = {
        id: storedToken.user.id,
        email: storedToken.user.email,
        displayName: storedToken.user.displayName,
        roles: storedToken.user.userRoles.map((ur) => ur.role.name),
        createdAt: storedToken.user.createdAt,
        twoFactorEnabled: storedToken.user.twoFactorEnabled,
      };

      return Ok({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: userProfile,
      });
    } catch (error) {
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
