/**
 * @fileoverview ログインと同意で共通の 2FA の検証（タスク74.1）
 *
 * コードの照合・失敗の計数・ロック・監査を受け持つ。2FA 待ちの資格の消費、最終ログインの更新、
 * ログインの成功時の失敗回数のリセット、トークンの発行はログイン（AuthService）に残す。
 *
 * TOTP の時間ステップとバックアップコードは、TwoFactorService の照合の中で条件付きの更新により
 * 使用済みになる。照合と使用済みの記録を分けないので、同じ値がログインと同意をまたいで二度通ることはない。
 *
 * Requirements: 47.2, 47.3（35.3 の試行制限と 40.2・40.3 の監査を同意にも適用する）, 32.7
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import { SECURITY_CONFIG } from '../config/security.constants.js';
import type { RequestContext } from '../types/auth.types.js';
import { Err, Ok, type Result } from '../types/result.js';
import { rethrowIfDatabaseConnectionTimeout } from '../utils/db-connection-timeout.js';
import logger from '../utils/logger.js';
import { recordAuthAuditEntry } from './auth-audit-recorder.js';
import type { TwoFactorService } from './two-factor.service.js';

export type SecondFactorCode =
  | { readonly type: 'totp'; readonly code: string }
  | { readonly type: 'backup'; readonly code: string };

export type SecondFactorPurpose = 'login' | 'oauth_consent';

/** ロックの応答に解除の時刻が要るので、設計の失敗の種別に `unlockAt` を持たせる */
export type SecondFactorFailure =
  { readonly type: 'INVALID_CODE' } | { readonly type: 'ACCOUNT_LOCKED'; readonly unlockAt: Date };

/** 検証に要る利用者の値（ログインは読み込み済みの行を渡し、DB の読み取りを増やさない） */
export interface SecondFactorSubject {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly twoFactorFailures: number | null;
  readonly twoFactorLockedUntil: Date | null;
}

export class SecondFactorVerifier {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly twoFactorService: TwoFactorService
  ) {}

  /**
   * 利用者を読み込んで第二要素を検証する
   *
   * 存在しない・無効化された利用者は、照合も計数もせず `INVALID_CODE` を返す。
   * DB の接続の例外は呼び出し側へ伝える（503 へ届けるため）。
   *
   * `oauth_consent` の成功は、失敗の連続を断ち切り（要件27A.4）、成功を監査する（要件40.3）。
   * `login` の成功は、回数のリセットも成功の監査も行わない。どちらもログインの手順の一部で、
   * 資格の消費とトークンの発行の後に AuthService が記録する。ログインを完了させる経路ではこの
   * メソッドでなく `verifyLoadedUser` を使う。
   */
  async verify(
    userId: string,
    code: SecondFactorCode,
    purpose: SecondFactorPurpose,
    ctx: RequestContext = {}
  ): Promise<Result<void, SecondFactorFailure>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        isActive: true,
        twoFactorFailures: true,
        twoFactorLockedUntil: true,
      },
    });

    if (!user) {
      await this.recordFailure(ctx, userId, code, purpose, 'user_not_found');
      return Err({ type: 'INVALID_CODE' });
    }
    if (user.isActive === false) {
      await this.recordFailure(ctx, userId, code, purpose, 'account_disabled', user.email);
      return Err({ type: 'INVALID_CODE' });
    }

    const result = await this.checkLoadedUser(user, code, purpose, ctx);
    if (result.ok && purpose === 'oauth_consent') {
      await this.resetFailuresAfterConsent(user.id);
      await recordAuthAuditEntry(this.prisma, ctx, {
        action: 'TWO_FACTOR_VERIFIED',
        actor: user,
        targetType: 'User',
        targetId: user.id,
        details: { result: 'success', method: code.type, email: user.email, purpose },
      });
    }
    return result;
  }

  /**
   * ログインが読み込み済みの利用者の第二要素を検証する
   *
   * 利用者の存在と有効の確認は呼び出し側（AuthService）が済ませている前提なので、目的を `login` に
   * 限る。同意は状態の確認を通る `verify` だけを使う。成功では何も記録しない。
   */
  verifyLoadedUser(
    user: SecondFactorSubject,
    code: SecondFactorCode,
    purpose: 'login',
    ctx: RequestContext
  ): Promise<Result<void, SecondFactorFailure>> {
    return this.checkLoadedUser(user, code, purpose, ctx);
  }

  /**
   * 同意の成功で失敗の回数を 0 へ戻す
   *
   * 照合の間に並行の失敗が書いたロックを解除しないよう、ロックの無い行だけを更新する。
   * 接続のタイムアウト以外の失敗では、使用済みになったコードの検証の成功を保つ。
   */
  private async resetFailuresAfterConsent(userId: string): Promise<void> {
    try {
      await this.prisma.user.updateMany({
        where: { id: userId, twoFactorLockedUntil: null },
        data: { twoFactorFailures: 0 },
      });
    } catch (resetError) {
      // 接続のタイムアウトはエラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(resetError);
      logger.error({ err: resetError, userId }, '2FA失敗カウンターのリセットに失敗');
    }
  }

  /** ロックの確認 → 期限切れの解除 → 照合 → 失敗の計数 */
  private async checkLoadedUser(
    user: SecondFactorSubject,
    code: SecondFactorCode,
    purpose: SecondFactorPurpose,
    ctx: RequestContext
  ): Promise<Result<void, SecondFactorFailure>> {
    const userId = user.id;

    // 2FAアカウントロック確認
    if (user.twoFactorLockedUntil && user.twoFactorLockedUntil > new Date()) {
      await this.recordFailure(ctx, userId, code, purpose, 'account_locked', user.email);
      return Err({ type: 'ACCOUNT_LOCKED', unlockAt: user.twoFactorLockedUntil });
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

    // TOTP またはバックアップコードの検証（一致した値はここで使用済みになる）
    const verifyResult =
      code.type === 'totp'
        ? await this.twoFactorService.verifyTOTP(userId, code.code)
        : await this.twoFactorService.verifyBackupCode(userId, code.code);

    if (verifyResult.ok && verifyResult.value) {
      return Ok(undefined);
    }

    const kindLabel = code.type === 'totp' ? '2FA検証失敗' : '2FAバックアップコード検証失敗';
    // 検証失敗: 失敗カウンターをインクリメント（資格は消費せず、期限内の再試行を認める）
    // 読んだ値に 1 を足して書くと並行の失敗が数えられないため、DB の上で 1 だけ増やし、
    // 増やした後の回数でロックを決める（要件27A.4）
    const currentFailures = user.twoFactorFailures ?? 0;
    // 加算の更新に失敗したときの見込みの回数（これまでどおり検証失敗として処理を続ける）
    let newFailures = currentFailures + 1;
    let incremented = false;

    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorFailures: { increment: 1 } },
        select: { twoFactorFailures: true },
      });
      newFailures = updated.twoFactorFailures;
      incremented = true;
    } catch (updateError) {
      // 接続のタイムアウトは検証の失敗として扱わず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(updateError);
      logger.error({ err: updateError, userId, newFailures }, '2FA失敗カウンター更新に失敗');
      // 接続のタイムアウト以外の更新の失敗は、検証失敗として処理を続行
    }

    const isLocked = newFailures >= SECURITY_CONFIG.TWO_FACTOR.MAX_FAILURES;
    logger.info(
      {
        userId,
        currentFailures,
        newFailures,
        isLocked,
        maxFailures: SECURITY_CONFIG.TWO_FACTOR.MAX_FAILURES,
        ...(purpose !== 'login' && { purpose }),
      },
      `${kindLabel}: 失敗カウンターをインクリメント`
    );
    const lockedUntil = isLocked
      ? new Date(Date.now() + SECURITY_CONFIG.TWO_FACTOR.LOCK_DURATION_MS)
      : null;

    if (isLocked && incremented) {
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { twoFactorLockedUntil: lockedUntil },
        });
      } catch (lockError) {
        // 接続のタイムアウトは検証の失敗として扱わず、エラーハンドラーの 503 へ届ける（要件24.1）
        rethrowIfDatabaseConnectionTimeout(lockError);
        logger.error({ err: lockError, userId, newFailures }, '2FAロックの記録に失敗');
      }
    }

    // コードの誤りと、同じ時間ステップのコードの再利用（metadata.reason='replay'）を区別して記録する（要件40.3）
    const reason =
      !verifyResult.ok && verifyResult.error.type === 'CODE_ALREADY_USED'
        ? 'replay'
        : 'invalid_code';
    await this.recordFailure(ctx, userId, code, purpose, reason, user.email);

    if (isLocked && lockedUntil) {
      // 2FA の検証の失敗によるロックを監査する（要件40.2）
      await recordAuthAuditEntry(this.prisma, ctx, {
        action: 'LOGIN_LOCKED',
        actor: null,
        targetType: 'User',
        targetId: userId,
        details: {
          trigger: 'two_factor_failures',
          email: user.email,
          lockedUntil: lockedUntil.toISOString(),
          ...purposeDetail(purpose),
        },
      });
      return Err({ type: 'ACCOUNT_LOCKED', unlockAt: lockedUntil });
    }

    return Err({ type: 'INVALID_CODE' });
  }

  /** 2FA の検証の失敗を記録する（実行者なし。要件40.3） */
  private recordFailure(
    ctx: RequestContext,
    userId: string,
    code: SecondFactorCode,
    purpose: SecondFactorPurpose,
    reason: string,
    email?: string
  ): Promise<void> {
    return recordAuthAuditEntry(this.prisma, ctx, {
      action: 'TWO_FACTOR_FAILED',
      actor: null,
      targetType: 'User',
      targetId: userId,
      details: {
        result: 'failure',
        reason,
        method: code.type,
        ...(email !== undefined && { email }),
        ...purposeDetail(purpose),
      },
    });
  }
}

/** ログインの監査の出力を変えないよう、同意のときだけ目的を載せる */
function purposeDetail(purpose: SecondFactorPurpose): { purpose?: string } {
  return purpose === 'login' ? {} : { purpose };
}
