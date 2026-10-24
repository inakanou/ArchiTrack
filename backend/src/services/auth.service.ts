/**
 * @fileoverview 認証サービス（統合）
 *
 * Requirements:
 * - 2.1-2.12: ユーザー登録機能（招待経由、パスワード検証、トランザクション管理）
 * - 4.1-4.7: ログイン機能（メールアドレス・パスワード検証、JWT発行、連続失敗検知）
 * - 5.1-5.7: トークン管理
 * - 8.1-8.5: セッション管理
 * - 9.1-9.5: ユーザー情報取得
 *
 * ログアウト・全デバイスのログアウトの失効と、リフレッシュトークンの再利用の検知（要件33.4〜33.6）を
 * SessionService へ委ねる。
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import { InvitationService } from './invitation.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import tokenServiceInstance from './token.service.js';
import { TwoFactorService } from './two-factor.service.js';
import { SessionService } from './session.service.js';
import { AuditLogService, snapshotAuditActor } from './audit-log.service.js';
import { TwoFactorChallengeService } from './two-factor-challenge.service.js';
import { AuthenticatedUserStateService } from './authenticated-user-state.service.js';
import redisConnection from '../redis.js';
import type {
  IAuthService,
  RegisterData,
  AuthResponse,
  AuthUserView,
  LoginResponse,
  UserProfile,
  AuthError,
  RequestContext,
  TwoFactorProof,
} from '../types/auth.types.js';
import { Ok, Err, type Result } from '../types/result.js';
import { addTimingAttackDelay } from '../utils/timing.js';
import { SECURITY_CONFIG } from '../config/security.constants.js';
import logger from '../utils/logger.js';
import { connectBudgetTransactionOptions } from '../utils/db-connect-budget.js';
import { rethrowIfDatabaseConnectionTimeout } from '../utils/db-connection-timeout.js';
import { captureException } from '../utils/sentry.js';
import {
  AUDIT_IP_ADDRESS_MAX_LENGTH,
  AUDIT_USER_AGENT_MAX_LENGTH,
  boundAuditText,
} from '../utils/audit-text.js';
import type { AuditLogAction } from '../types/audit-log.types.js';

/** 認証の監査の実行者（記録時に写す。要件40.7） */
interface AuthAuditActor {
  id: string;
  email: string | null;
  displayName: string | null;
}

/** 認証の監査の一件 */
interface AuthAuditEntry {
  action: AuditLogAction;
  /** 実行者。失敗・ロックは null（ログインの失敗は実行者を持たない。design.md の AuditLogService の節） */
  actor: AuthAuditActor | null;
  targetType: string;
  targetId: string;
  /** 結果・メールアドレス・理由など（送信元 IP とユーザーエージェントは要求の文脈から足す） */
  details: Record<string, string | boolean>;
}

/** 存在しないメールアドレスのログインの失敗・資格を照会できない 2FA の失敗の対象の種別 */
const UNKNOWN_LOGIN_TARGET_TYPE = 'Email';
const UNKNOWN_CHALLENGE_TARGET_TYPE = 'TwoFactorChallenge';
const UNKNOWN_CHALLENGE_TARGET_ID = 'unknown';

/** 監査に書く利用者由来のメールアドレスの上限（RFC 5321 の経路の上限。タスク53.1 のレビュー） */
export const AUDIT_EMAIL_MAX_LENGTH = 254;
/** 監査に書くユーザーエージェントの上限（共有の定義を再公開する） */
export { AUDIT_USER_AGENT_MAX_LENGTH };

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
  private readonly twoFactorChallengeService: TwoFactorChallengeService;
  private readonly userStateService: AuthenticatedUserStateService;

  constructor(
    private readonly prisma: PrismaClient,
    invitationService?: InvitationService,
    passwordService?: PasswordService,
    tokenService?: TokenService,
    twoFactorService?: TwoFactorService,
    sessionService?: SessionService,
    twoFactorChallengeService?: TwoFactorChallengeService,
    userStateService?: AuthenticatedUserStateService
  ) {
    this.invitationService = invitationService || new InvitationService(prisma);
    this.passwordService = passwordService || new PasswordService(prisma);
    this.tokenService = tokenService || tokenServiceInstance;
    this.twoFactorService = twoFactorService || new TwoFactorService();
    this.sessionService = sessionService || new SessionService(prisma);
    this.twoFactorChallengeService = twoFactorChallengeService || new TwoFactorChallengeService();
    this.userStateService =
      userStateService ||
      new AuthenticatedUserStateService(prisma, () => redisConnection.getClient());
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
   * 6. 招待経由のアカウント作成の監査（INVITATION_ACCEPTED。要件40.5）
   * 7. JWT生成
   */
  async register(
    invitationToken: string,
    data: RegisterData,
    ctx?: RequestContext
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
            // 招待者は招待の行の取り消し・削除に左右されない利用者の属性として写す（要件36.10）
            invitedById: invitation.inviterId,
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

        // 招待経由のアカウント作成を、作成された利用者を実行者として記録する（要件40.5）。
        // 記録の失敗はトランザクションごと登録を中止する
        await tx.auditLog.create({
          data: {
            action: 'INVITATION_ACCEPTED',
            actorId: newUser.id,
            actorEmail: newUser.email,
            actorDisplayName: newUser.displayName,
            targetType: 'Invitation',
            targetId: invitation.id,
            metadata: {
              email: invitation.email,
              userId: newUser.id,
              inviterId: invitation.inviterId,
              ...(ctx?.ipAddress !== undefined && { ipAddress: ctx.ipAddress }),
              ...(ctx?.userAgent !== undefined && { userAgent: ctx.userAgent }),
            },
          },
        });

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
      }, connectBudgetTransactionOptions());

      if (!user) {
        return Err({ type: 'DATABASE_ERROR', message: 'Failed to create user' });
      }

      // 6. JWT生成
      const payload = {
        userId: user.id,
        email: user.email,
        roles: user.userRoles.map((ur) => ur.role.name),
        // 発行時の利用者のアクセストークンの世代（要件34.7）
        accessTokenGeneration: user.accessTokenGeneration,
      };

      const accessToken = await this.tokenService.generateAccessToken(payload);

      // 7. 新しい系列でリフレッシュトークンを発行し、ハッシュをDBに保存
      const { refreshToken } = await this.sessionService.createSession(user.id);

      // 8. AuthResponse返却
      const userProfile: UserProfile = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.userRoles.map((ur) => ur.role.name),
        createdAt: user.createdAt,
        twoFactorEnabled: user.twoFactorEnabled,
        mustChangePassword: user.mustChangePassword,
      };

      return Ok({
        accessToken,
        refreshToken,
        user: userProfile,
      });
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
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
   * 1. メールアドレスでユーザー検索（無効化された利用者は通常の認証エラー。要件36.2）
   * 2. アカウントロック確認
   * 3. パスワード検証
   * 4. 連続失敗時のアカウントロック処理
   * 5. 2FA有効チェック
   * 6. トークン生成（2FA無効の場合のみ。最終ログイン日時を記録する。要件36.7）
   */
  async login(
    email: string,
    password: string,
    ctx: RequestContext = {}
  ): Promise<Result<LoginResponse, AuthError>> {
    const deviceInfo = ctx.userAgent;
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
          isActive: true,
          twoFactorEnabled: true,
          mustChangePassword: true,
          accessTokenGeneration: true,
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
      // @requirement user-authentication/REQ-26.9: タイミング攻撃対策の遅延を挿入
      if (!user) {
        // 存在しないメールアドレスの失敗は実行者も利用者の ID も無いため、入力されたメールアドレスを対象にする
        // （要件40.1）。パスワードの誤りと同じく記録を待ってから遅延を入れ、応答時間に差を作らない
        await this.recordAuthAudit(ctx, {
          action: 'LOGIN_FAILED',
          actor: null,
          targetType: UNKNOWN_LOGIN_TARGET_TYPE,
          targetId: email,
          details: { result: 'failure', reason: 'unknown_email', email },
        });
        await addTimingAttackDelay();
        return Err({ type: 'INVALID_CREDENTIALS' });
      }

      // 無効化された利用者はパスワードの正否に関わらず通常の認証エラーで拒否する（要件36.2）。
      // ロックの判定と失敗回数の加算より前に行い状態を推測させず、ハッシュの照合と遅延でパスワードの誤りと
      // 応答時間をそろえる（照合の結果は使わない）
      if (user.isActive === false) {
        await this.passwordService.verifyPassword(password, user.passwordHash);
        await this.recordLoginFailure(ctx, user.id, email, 'account_disabled');
        await addTimingAttackDelay();
        return Err({ type: 'INVALID_CREDENTIALS' });
      }

      // 2. アカウントロック確認
      if (user.isLocked && user.lockedUntil && user.lockedUntil > new Date()) {
        await this.recordLoginFailure(ctx, user.id, email, 'account_locked');
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

        await this.recordLoginFailure(ctx, user.id, email, 'invalid_password');

        // アカウントがロックされた場合は即座にACCOUNT_LOCKEDを返す（ロックを監査する。要件40.2）
        if (isLocked && lockedUntil) {
          await this.recordAuthAudit(ctx, {
            action: 'LOGIN_LOCKED',
            actor: null,
            targetType: 'User',
            targetId: user.id,
            details: {
              trigger: 'login_failures',
              email,
              lockedUntil: lockedUntil.toISOString(),
            },
          });
          return Err({
            type: 'ACCOUNT_LOCKED',
            unlockAt: lockedUntil,
          });
        }

        // @requirement user-authentication/REQ-26.9: タイミング攻撃対策の遅延を挿入
        await addTimingAttackDelay();
        return Err({ type: 'INVALID_CREDENTIALS' });
      }

      // 4. ログイン成功時、ログイン失敗回数をリセット。2FA 未登録の利用者はここでトークンを発行するため
      // 最終ログイン日時も記録する（要件36.7。2FA 登録済みの利用者は 2FA の検証の成功で記録する）
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          loginFailures: 0,
          isLocked: false,
          lockedUntil: null,
          ...(!user.twoFactorEnabled && { lastLoginAt: new Date() }),
        },
      });

      // 5. 2FA有効チェック
      if (user.twoFactorEnabled) {
        // 2FA有効の場合、パスワードの成功に結び付いた 2FA 待ちの資格を発行し、2FA検証画面へ
        // （要件32.1）。応答に利用者 ID を含めない（要件42.7）
        const challenge = await this.twoFactorChallengeService.issue(user.id);
        if (!challenge.ok) {
          return Err({ type: 'SERVICE_UNAVAILABLE' });
        }
        return Ok({
          type: '2FA_REQUIRED',
          challengeToken: challenge.value.challengeToken,
          expiresIn: challenge.value.expiresIn,
        });
      }

      // 6. トークン生成（2FA無効の場合）
      const payload = {
        userId: user.id,
        email: user.email,
        roles: user.userRoles.map((ur) => ur.role.name),
        // 発行時の利用者のアクセストークンの世代（要件34.7）
        accessTokenGeneration: user.accessTokenGeneration,
      };

      const accessToken = await this.tokenService.generateAccessToken(payload);

      // 新しい系列でリフレッシュトークンを発行し、ハッシュをDBに保存
      const { refreshToken } = await this.sessionService.createSession(user.id, deviceInfo);

      // トークンを発行したログインの成功を監査する（要件40.1）
      await this.recordAuthAudit(ctx, {
        action: 'LOGIN_SUCCESS',
        actor: user,
        targetType: 'User',
        targetId: user.id,
        details: { result: 'success', email, method: 'password' },
      });

      // UserProfile作成
      const userProfile: UserProfile = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.userRoles.map((ur) => ur.role.name),
        createdAt: user.createdAt,
        twoFactorEnabled: user.twoFactorEnabled,
        mustChangePassword: user.mustChangePassword,
      };

      return Ok({
        type: 'SUCCESS',
        accessToken,
        refreshToken,
        user: userProfile,
      });
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 2FA の検証を完了する（ログイン時）
   *
   * Requirements:
   * - 27A.5: 「バックアップコードを使用する」選択時にバックアップコード入力フィールドを表示
   * - 27A.6: バックアップコード検証（未使用のコードとbcrypt比較）
   * - 27A.7: バックアップコード使用後、usedAtフィールドを更新
   * - 27A.8: ログイン成功後、ダッシュボードへリダイレクト
   *
   * 2FA 待ちの資格（要件32.1〜32.6）: ログインで発行した資格に結び付いた利用者だけを検証し、
   * メールアドレスや JWT を資格として受理しない。期限切れ・消費済みの資格を拒否し、成功で資格を
   * 消費する。消費に失敗したとき（同時の二重成功）はトークンを発行しない。TOTP とバックアップコードは
   * 同じ資格を要求する。
   *
   * 処理フロー:
   * 1. 資格を照会して利用者を決める（照会できなければ CHALLENGE_INVALID、保存先が使えなければ SERVICE_UNAVAILABLE）
   * 2. 2FAアカウントロック確認、ロック期限切れの場合はロック解除
   * 3. TOTP またはバックアップコードの検証
   * 4. 検証失敗時: 失敗カウンターインクリメント、5回で5分間ロック（資格は消費しない）
   * 5. 検証成功時: 資格を消費し、失敗カウンターをリセットしてトークンを発行する
   */
  async completeTwoFactorLogin(
    challengeToken: string,
    proof: TwoFactorProof,
    ctx: RequestContext = {}
  ): Promise<Result<AuthResponse, AuthError>> {
    const challenge = await this.twoFactorChallengeService.peek(challengeToken);
    if (!challenge.ok) {
      // 資格の不在・期限切れ・消費済みは 2FA の検証の失敗として記録する（保存先の不在は 503 で記録しない）
      if (challenge.error.type !== 'CHALLENGE_STORE_UNAVAILABLE') {
        await this.recordAuthAudit(ctx, {
          action: 'TWO_FACTOR_FAILED',
          actor: null,
          targetType: UNKNOWN_CHALLENGE_TARGET_TYPE,
          targetId: UNKNOWN_CHALLENGE_TARGET_ID,
          details: { result: 'failure', reason: 'challenge_invalid', method: proof.kind },
        });
      }
      return Err(
        challenge.error.type === 'CHALLENGE_STORE_UNAVAILABLE'
          ? { type: 'SERVICE_UNAVAILABLE' }
          : { type: 'CHALLENGE_INVALID' }
      );
    }
    return this.verifySecondFactor(challenge.value.userId, challengeToken, proof, ctx);
  }

  /**
   * 資格に結び付いた利用者の第二要素を検証し、成功で資格を消費してトークンを発行する
   */
  private async verifySecondFactor(
    userId: string,
    challengeToken: string,
    proof: TwoFactorProof,
    ctx: RequestContext
  ): Promise<Result<AuthResponse, AuthError>> {
    const deviceInfo = ctx.userAgent;
    const kindLabel = proof.kind === 'totp' ? '2FA検証失敗' : '2FAバックアップコード検証失敗';
    try {
      // 1. Fetch user with only necessary fields (optimized query)
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          createdAt: true,
          isActive: true,
          twoFactorEnabled: true,
          mustChangePassword: true,
          twoFactorFailures: true,
          twoFactorLockedUntil: true,
          accessTokenGeneration: true,
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
        await this.recordTwoFactorFailure(ctx, userId, proof, 'user_not_found');
        return Err({ type: 'USER_NOT_FOUND' });
      }

      // パスワードの段階の後に無効化された利用者は、資格の不正と同じ結果で拒否する（要件36.2）。
      // コードを検証せず失敗も数えない
      if (user.isActive === false) {
        await this.recordTwoFactorFailure(ctx, userId, proof, 'account_disabled', user.email);
        return Err({ type: 'CHALLENGE_INVALID' });
      }

      // 2. 2FAアカウントロック確認
      if (user.twoFactorLockedUntil && user.twoFactorLockedUntil > new Date()) {
        await this.recordTwoFactorFailure(ctx, userId, proof, 'account_locked', user.email);
        return Err({
          type: 'ACCOUNT_LOCKED',
          unlockAt: user.twoFactorLockedUntil,
        });
      }

      // ロック期限切れの場合はロック解除
      if (user.twoFactorLockedUntil && user.twoFactorLockedUntil <= new Date()) {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            twoFactorFailures: 0,
            twoFactorLockedUntil: null,
          },
        });
      }

      // 3. TOTP またはバックアップコードの検証
      const verifyResult =
        proof.kind === 'totp'
          ? await this.twoFactorService.verifyTOTP(userId, proof.code)
          : await this.twoFactorService.verifyBackupCode(userId, proof.backupCode);

      // 検証失敗（エラーまたは無効なコード）の場合、失敗カウンターをインクリメント
      const isValid = verifyResult.ok && verifyResult.value;

      if (!isValid) {
        // 4. 検証失敗: 失敗カウンターをインクリメント（資格は消費せず、期限内の再試行を認める）
        const currentFailures = user.twoFactorFailures ?? 0;
        const newFailures = currentFailures + 1;
        const isLocked = newFailures >= SECURITY_CONFIG.TWO_FACTOR.MAX_FAILURES;
        logger.info(
          {
            userId,
            currentFailures,
            newFailures,
            isLocked,
            maxFailures: SECURITY_CONFIG.TWO_FACTOR.MAX_FAILURES,
          },
          `${kindLabel}: 失敗カウンターをインクリメント`
        );
        const lockedUntil = isLocked
          ? new Date(Date.now() + SECURITY_CONFIG.TWO_FACTOR.LOCK_DURATION_MS)
          : null;

        try {
          await this.prisma.user.update({
            where: { id: userId },
            data: {
              twoFactorFailures: newFailures,
              ...(isLocked && { twoFactorLockedUntil: lockedUntil }),
            },
          });
        } catch (updateError) {
          // 接続のタイムアウトは検証の失敗として扱わず、エラーハンドラーの 503 へ届ける（要件24.1）
          rethrowIfDatabaseConnectionTimeout(updateError);
          logger.error({ err: updateError, userId, newFailures }, '2FA失敗カウンター更新に失敗');
          // 接続のタイムアウト以外の更新の失敗は、検証失敗として処理を続行
        }

        // コードの誤りと、同じ時間ステップのコードの再利用（metadata.reason='replay'）を区別して記録する（要件40.3）
        const reason =
          !verifyResult.ok && verifyResult.error.type === 'CODE_ALREADY_USED'
            ? 'replay'
            : 'invalid_code';
        await this.recordTwoFactorFailure(ctx, userId, proof, reason, user.email);

        if (isLocked && lockedUntil) {
          // 2FA の検証の失敗によるロックを監査する（要件40.2）
          await this.recordAuthAudit(ctx, {
            action: 'LOGIN_LOCKED',
            actor: null,
            targetType: 'User',
            targetId: userId,
            details: {
              trigger: 'two_factor_failures',
              email: user.email,
              lockedUntil: lockedUntil.toISOString(),
            },
          });
          return Err({
            type: 'ACCOUNT_LOCKED',
            unlockAt: lockedUntil,
          });
        }

        return Err({ type: proof.kind === 'totp' ? 'INVALID_2FA_CODE' : 'INVALID_BACKUP_CODE' });
      }

      // 5. 検証成功: 資格を消費する。消費できなければ（同時の二重成功・期限切れ）トークンを発行しない
      const consumed = await this.twoFactorChallengeService.consume(challengeToken);
      if (!consumed.ok) {
        if (consumed.error.type !== 'CHALLENGE_STORE_UNAVAILABLE') {
          await this.recordTwoFactorFailure(ctx, userId, proof, 'challenge_consumed', user.email);
        }
        return Err(
          consumed.error.type === 'CHALLENGE_STORE_UNAVAILABLE'
            ? { type: 'SERVICE_UNAVAILABLE' }
            : { type: 'CHALLENGE_INVALID' }
        );
      }

      // 失敗カウンターをリセットし、トークンを発行するため最終ログイン日時を記録する（要件36.7）
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorFailures: 0,
          twoFactorLockedUntil: null,
          lastLoginAt: new Date(),
        },
      });

      // JWT生成
      const payload = {
        userId: user.id,
        email: user.email,
        roles: user.userRoles.map((ur) => ur.role.name),
        // 発行時の利用者のアクセストークンの世代（要件34.7）
        accessTokenGeneration: user.accessTokenGeneration,
      };

      const accessToken = await this.tokenService.generateAccessToken(payload);

      // 新しい系列でリフレッシュトークンを発行し、ハッシュをDBに保存
      const { refreshToken } = await this.sessionService.createSession(user.id, deviceInfo);

      // 2FA の検証の成功と、それによるログインの成功を監査する（要件40.1、40.3）
      await this.recordAuthAudit(ctx, {
        action: 'TWO_FACTOR_VERIFIED',
        actor: user,
        targetType: 'User',
        targetId: user.id,
        details: { result: 'success', method: proof.kind, email: user.email },
      });
      await this.recordAuthAudit(ctx, {
        action: 'LOGIN_SUCCESS',
        actor: user,
        targetType: 'User',
        targetId: user.id,
        details: { result: 'success', email: user.email, method: proof.kind },
      });

      // UserProfile作成
      const userProfile: UserProfile = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.userRoles.map((ur) => ur.role.name),
        createdAt: user.createdAt,
        twoFactorEnabled: user.twoFactorEnabled,
        mustChangePassword: user.mustChangePassword,
      };

      return Ok({
        accessToken,
        refreshToken,
        user: userProfile,
      });
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * ログアウト（単一デバイス）
   *
   * 提示されたリフレッシュトークンの系列（そのセッション）の全てを失効させる（要件33.4）。
   */
  async logout(
    userId: string,
    refreshToken: string,
    ctx: RequestContext = {}
  ): Promise<Result<void, AuthError>> {
    try {
      await this.sessionService.revokeByToken(refreshToken, userId);
      await this.recordSessionEnd(ctx, 'LOGOUT', userId);

      return Ok(undefined);
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 全デバイスからログアウト
   *
   * 利用者の全てのリフレッシュトークンを失効させる（要件33.5）。
   */
  async logoutAll(userId: string, ctx: RequestContext = {}): Promise<Result<void, AuthError>> {
    try {
      await this.sessionService.revokeAllForUser(userId);
      await this.recordSessionEnd(ctx, 'LOGOUT_ALL', userId);

      return Ok(undefined);
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
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
      // permissions も含めて取得（フロントエンドの権限ベースUI制御で使用）
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          createdAt: true,
          updatedAt: true,
          userRoles: {
            select: {
              role: {
                select: {
                  name: true,
                  rolePermissions: {
                    select: {
                      permission: {
                        select: {
                          resource: true,
                          action: true,
                        },
                      },
                    },
                  },
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

      // 利用者の状態はキャッシュを経由して読む（認証ミドルウェアの照合と同じ値を返す。タスク47.5）
      const state = await this.userStateService.getState(userId);
      if (!state) {
        return Err({ type: 'USER_NOT_FOUND' });
      }

      // Extract unique permissions from all roles (resource:action format)
      const permissionSet = new Set<string>();
      for (const ur of user.userRoles) {
        for (const rp of ur.role.rolePermissions) {
          permissionSet.add(`${rp.permission.resource}:${rp.permission.action}`);
        }
      }

      // Convert to UserProfile format
      const userProfile: UserProfile = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.userRoles.map((ur) => ur.role.name),
        permissions: Array.from(permissionSet),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        twoFactorEnabled: state.twoFactorEnabled,
        mustChangePassword: state.mustChangePassword,
      };

      return Ok(userProfile);
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 画面へ返す利用者と状態を取得する（2FA の有効化・パスワード変更の応答に載せる。タスク47.5）
   *
   * 状態は AuthenticatedUserStateService を経由して読む。状態を変えた処理は、これを呼ぶ前に
   * キャッシュを無効化する。
   */
  async getAuthUserView(userId: string): Promise<Result<AuthUserView, AuthError>> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          userRoles: { select: { role: { select: { name: true } } } },
        },
      });
      if (!user) {
        return Err({ type: 'USER_NOT_FOUND' });
      }
      const state = await this.userStateService.getState(userId);
      if (!state) {
        return Err({ type: 'USER_NOT_FOUND' });
      }
      return Ok({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.userRoles.map((ur) => ur.role.name),
        twoFactorEnabled: state.twoFactorEnabled,
        mustChangePassword: state.mustChangePassword,
      });
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 楽観的ロック付きのプロフィール更新
   *
   * 条件付きの更新（updatedAt が expectedUpdatedAt と一致する行に限る）で競合を検出する。
   * 読んでから比べる方式は、READ COMMITTED では同じ版から並行する2件がどちらも比較を通りうるため採らない。
   * 条件を UPDATE の WHERE に置けば、後続は先行のコミットを待ってから最新の行で条件を評価し直し、0 件になる。
   *
   * @param userId ユーザーID
   * @param data 更新内容（表示名）
   * @param expectedUpdatedAt 取得時の updatedAt
   * @returns 成功、USER_NOT_FOUND、PROFILE_CONFLICT のいずれか
   */
  async updateProfileIfUnchanged(
    userId: string,
    data: { displayName?: string },
    expectedUpdatedAt: Date
  ): Promise<Result<void, AuthError>> {
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, updatedAt: expectedUpdatedAt },
      data,
    });
    if (count > 0) {
      return Ok(undefined);
    }
    // 0 件の理由（ユーザーが無いか、版が古いか）を読み直して区別する
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { updatedAt: true },
    });
    if (!current) {
      return Err({ type: 'USER_NOT_FOUND' });
    }
    return Err({
      type: 'PROFILE_CONFLICT',
      expectedUpdatedAt,
      actualUpdatedAt: current.updatedAt,
    });
  }

  /**
   * トークンリフレッシュ
   *
   * リフレッシュトークンを検証し、SessionService でローテーションする（置き換えの記録と後継の作成は一つの取引）。
   * 置き換え済みのトークンの再提示は系列の全てを失効させ、監査 REFRESH_TOKEN_REUSE_DETECTED を記録する（要件33.6）。
   * @requirement user-authentication/REQ-5.1: リフレッシュトークンを使用して新しいアクセストークンを発行
   *
   * @param refreshToken 提示されたリフレッシュトークン
   * @param ctx 要求の送信元（再利用の監査の記録に使う）
   */
  async refreshToken(
    refreshToken: string,
    ctx: RequestContext = {}
  ): Promise<Result<AuthResponse, AuthError>> {
    try {
      // 1. リフレッシュトークンを検証（種別 refresh 以外のトークンはここで拒否する。要件33.2）
      const verifyResult = await this.tokenService.verifyToken(refreshToken, 'refresh');

      if (!verifyResult.ok) {
        return Err({ type: 'INVALID_REFRESH_TOKEN' });
      }

      // 2. アクセストークンに載せる利用者とロールを読む（ローテーションの後に失敗して後継を失わないよう先に読む）
      const user = await this.prisma.user.findUnique({
        where: { id: verifyResult.value.userId },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      });

      // 無効化された利用者のリフレッシュは拒否する（要件36.1。ローテーションの前に拒否し、後継を作らない）
      if (user && user.isActive === false) {
        return Err({ type: 'ACCOUNT_DISABLED' });
      }

      // 3. ローテーション（保存の照合・置き換えの記録・後継の作成、または再利用による系列の失効）
      const rotation = await this.sessionService.rotate(refreshToken);

      if (!rotation.ok) {
        const error = rotation.error;
        if (error.type === 'REUSE_DETECTED') {
          await this.recordRefreshTokenReuse(error.userId, error.familyId, ctx);
          return Err({ type: 'TOKEN_REUSE_DETECTED' });
        }
        if (error.type === 'EXPIRED') {
          return Err({ type: 'REFRESH_TOKEN_EXPIRED' });
        }
        return Err({ type: 'INVALID_REFRESH_TOKEN' });
      }

      // 保存の行の利用者がトークンの利用者と異なることは起きない（行は発行時のトークンのハッシュで引く）
      if (!user || user.id !== rotation.value.userId) {
        return Err({ type: 'INVALID_REFRESH_TOKEN' });
      }

      // 4. 新しいアクセストークンを発行（ロールは発行の時点の利用者から読む）

      const roles = user.userRoles.map((ur) => ur.role.name);
      const newAccessToken = await this.tokenService.generateAccessToken({
        userId: user.id,
        email: user.email,
        roles,
        // 発行時の利用者のアクセストークンの世代（要件34.7）
        accessTokenGeneration: user.accessTokenGeneration,
      });

      // 5. ユーザー情報を返却
      const userProfile: UserProfile = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles,
        createdAt: user.createdAt,
        twoFactorEnabled: user.twoFactorEnabled,
        mustChangePassword: user.mustChangePassword,
      };

      return Ok({
        accessToken: newAccessToken,
        refreshToken: rotation.value.refreshToken,
        user: userProfile,
      });
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 認証の監査を記録する（要件40.1〜40.4）
   *
   * 記録の失敗はログイン・ログアウトの結果を変えず、エラーログと Sentry へ送る（design.md の AuthService の節）。
   * 送信元 IP は `getClientIp` で得た値を、ユーザーエージェントとともに `metadata` に書く。
   */
  private async recordAuthAudit(ctx: RequestContext, entry: AuthAuditEntry): Promise<void> {
    try {
      // 利用者が与える値（入力のメールアドレス・ユーザーエージェント）は上限までに切り詰め、切り詰めたことを残す
      const details: Record<string, string | boolean> = { ...entry.details };
      if (typeof details.email === 'string') {
        const email = boundAuditText(details.email, AUDIT_EMAIL_MAX_LENGTH);
        details.email = email.value;
        if (email.truncated) {
          details.emailTruncated = true;
        }
      }
      const targetId = boundAuditText(entry.targetId, AUDIT_EMAIL_MAX_LENGTH).value;
      const userAgent =
        ctx.userAgent === undefined
          ? undefined
          : boundAuditText(ctx.userAgent, AUDIT_USER_AGENT_MAX_LENGTH);
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          actorId: entry.actor?.id ?? null,
          // 実行者の写しは読み込み済みの利用者から書く（要件40.7）
          actorEmail: entry.actor?.email ?? null,
          actorDisplayName: entry.actor?.displayName ?? null,
          targetType: entry.targetType,
          targetId,
          metadata: {
            ...details,
            ...(ctx.ipAddress !== undefined && {
              ipAddress: boundAuditText(ctx.ipAddress, AUDIT_IP_ADDRESS_MAX_LENGTH).value,
            }),
            ...(userAgent !== undefined && { userAgent: userAgent.value }),
            ...(userAgent?.truncated && { userAgentTruncated: true }),
          },
        },
      });
    } catch (error) {
      logger.error(
        { err: error, action: entry.action, targetType: entry.targetType },
        'Failed to record authentication audit log'
      );
      captureException(error instanceof Error ? error : new Error(String(error)), {
        action: entry.action,
        targetType: entry.targetType,
        ...(entry.targetType === 'User' && { userId: entry.targetId }),
      });
    }
  }

  /** パスワードの段階のログインの失敗を記録する（実行者なし。要件40.1） */
  private recordLoginFailure(
    ctx: RequestContext,
    userId: string,
    email: string,
    reason: 'invalid_password' | 'account_locked' | 'account_disabled'
  ): Promise<void> {
    return this.recordAuthAudit(ctx, {
      action: 'LOGIN_FAILED',
      actor: null,
      targetType: 'User',
      targetId: userId,
      details: { result: 'failure', reason, email },
    });
  }

  /** 2FA の検証の失敗を記録する（実行者なし。要件40.3） */
  private recordTwoFactorFailure(
    ctx: RequestContext,
    userId: string,
    proof: TwoFactorProof,
    reason: string,
    email?: string
  ): Promise<void> {
    return this.recordAuthAudit(ctx, {
      action: 'TWO_FACTOR_FAILED',
      actor: null,
      targetType: 'User',
      targetId: userId,
      details: {
        result: 'failure',
        reason,
        method: proof.kind,
        ...(email !== undefined && { email }),
      },
    });
  }

  /** ログアウト・全デバイスのログアウトを、本人を実行者として記録する（要件40.4） */
  private async recordSessionEnd(
    ctx: RequestContext,
    action: 'LOGOUT' | 'LOGOUT_ALL',
    userId: string
  ): Promise<void> {
    let actor: AuthAuditActor | null = null;
    try {
      const snapshot = await snapshotAuditActor(this.prisma, userId);
      actor = { id: userId, email: snapshot.actorEmail, displayName: snapshot.actorDisplayName };
    } catch (error) {
      // 写しの読み取りの失敗も記録の失敗として扱い、ログアウトの結果を変えない
      logger.error({ err: error, userId, action }, 'Failed to read audit actor for logout');
      captureException(error instanceof Error ? error : new Error(String(error)), {
        action,
        userId,
      });
      return;
    }
    await this.recordAuthAudit(ctx, {
      action,
      actor,
      targetType: 'User',
      targetId: userId,
      details: { result: 'success' },
    });
  }

  /**
   * リフレッシュトークンの再利用の検知を監査に記録する（要件33.6）
   *
   * 系列の失効は記録より前に確定している。記録の失敗はリフレッシュの結果（401）を変えず、
   * エラーログと Sentry へ送る。
   */
  private async recordRefreshTokenReuse(
    userId: string,
    familyId: string,
    ctx: RequestContext
  ): Promise<void> {
    try {
      await new AuditLogService({ prisma: this.prisma }).createLog({
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        actorId: userId,
        targetType: 'User',
        targetId: userId,
        metadata: {
          familyId,
          ...(ctx.ipAddress !== undefined && { ipAddress: ctx.ipAddress }),
          ...(ctx.userAgent !== undefined && { userAgent: ctx.userAgent }),
        },
      });
    } catch (error) {
      logger.error(
        { err: error, userId, familyId },
        'Failed to record refresh token reuse audit log'
      );
      captureException(error instanceof Error ? error : new Error(String(error)), {
        userId,
        familyId,
      });
    }
  }
}
