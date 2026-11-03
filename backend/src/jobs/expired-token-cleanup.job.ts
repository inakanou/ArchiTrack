/**
 * 使用済み・期限切れのトークンの消去（user-authentication 要件37.4、37.8）
 *
 * 定期処理の実行基盤（scheduled-job-runner.ts）から毎時 15 分に呼ばれる。毎時の実行で、
 * 使用済み・期限切れになってから 24 時間以内の消去を満たす。
 *
 * - 招待: 使用済み・取り消し・期限切れの行はトークンのハッシュ（token_hash。要件37.1）だけを消して行を残す。状態・期限・作成者を
 *   保ち、招待一覧の状態の表示（要件1.7・13.2）と期限切れの招待の再送信（要件13.7）を維持する
 * - パスワードリセット: 使用済み・期限切れの行を消す
 * - リフレッシュトークン: 期限切れの行を消す
 *
 * いずれも条件による一括の更新・削除で、何度実行しても結果は変わらない（冪等）。
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import { InvitationStatus } from '../types/invitation.types.js';

/** 定期処理のジョブ名（繰り返しジョブの識別子を兼ねる） */
export const EXPIRED_TOKEN_CLEANUP_JOB_NAME = 'expired-token-cleanup';

/** 毎時 15 分（Asia/Tokyo） */
export const EXPIRED_TOKEN_CLEANUP_CRON = '15 * * * *';

export interface ExpiredTokenCleanupResult {
  /** トークンを消した招待の件数（行は残る） */
  invitationTokensCleared: number;
  /** 消したパスワードリセットのトークンの件数 */
  passwordResetTokensDeleted: number;
  /** 消したリフレッシュトークンの件数 */
  refreshTokensDeleted: number;
}

/**
 * 使用済み・期限切れのトークンを消す
 *
 * @param prisma - データベースのクライアント
 * @param now - 期限の判定の基準の時刻（既定は現在）
 */
export async function cleanupExpiredTokens(
  prisma: PrismaClient,
  now: Date = new Date()
): Promise<ExpiredTokenCleanupResult> {
  const invitations = await prisma.invitation.updateMany({
    where: {
      tokenHash: { not: null },
      OR: [
        { status: { in: [InvitationStatus.USED, InvitationStatus.REVOKED] } },
        { expiresAt: { lt: now } },
      ],
    },
    data: { tokenHash: null },
  });

  const passwordResetTokens = await prisma.passwordResetToken.deleteMany({
    where: { OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }] },
  });

  const refreshTokens = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  return {
    invitationTokensCleared: invitations.count,
    passwordResetTokensDeleted: passwordResetTokens.count,
    refreshTokensDeleted: refreshTokens.count,
  };
}
