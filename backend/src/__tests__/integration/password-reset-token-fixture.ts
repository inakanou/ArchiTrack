/**
 * @fileoverview 統合テストの前提データとして、パスワードリセットのトークンの行を DB へ直接作る補助（タスク50.2）
 *
 * 保存の形式は本番の PasswordService と同じ（原文の SHA-256 の 16 進。要件37.1）。
 * 原文を返し、DB にはハッシュだけを書く。
 */

import { randomBytes } from 'crypto';
import type { PasswordResetToken, PrismaClient } from '../../generated/prisma/client.js';
import { hashPasswordResetToken } from '../../utils/password-reset-token.js';

export interface StoredPasswordResetTokenOptions {
  userId: string;
  expiresAt: Date;
  createdAt?: Date;
  usedAt?: Date | null;
  /** 原文（省略時は無作為の 32 バイトの 16 進） */
  rawToken?: string;
}

/**
 * パスワードリセットのトークンの行を作り、原文と作った行を返す
 *
 * @param prisma - データベースのクライアント
 * @param options - 行の属性
 */
export async function createStoredPasswordResetToken(
  prisma: Pick<PrismaClient, 'passwordResetToken'>,
  options: StoredPasswordResetTokenOptions
): Promise<{ rawToken: string; resetToken: PasswordResetToken }> {
  const rawToken = options.rawToken ?? randomBytes(32).toString('hex');
  const resetToken = await prisma.passwordResetToken.create({
    data: {
      userId: options.userId,
      tokenHash: hashPasswordResetToken(rawToken),
      expiresAt: options.expiresAt,
      ...(options.createdAt !== undefined && { createdAt: options.createdAt }),
      usedAt: options.usedAt ?? null,
    },
  });
  return { rawToken, resetToken };
}
