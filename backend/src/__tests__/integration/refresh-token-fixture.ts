/**
 * @fileoverview 統合テストの前提データとして、リフレッシュトークンの行を DB へ直接作る補助（タスク45.2）
 *
 * 保存の形式は本番の SessionService と同じ（原文の SHA-256 の 16 進。要件33.7）。
 * 原文を返し、DB にはハッシュだけを書く。原文の列へ直接書かない。
 */

import { randomBytes, randomUUID } from 'crypto';
import type { PrismaClient, RefreshToken } from '../../generated/prisma/client.js';
import { hashRefreshToken } from '../../services/session.service.js';

export interface StoredRefreshTokenOptions {
  userId: string;
  expiresAt: Date;
  /** 系列 ID（省略時は新しい系列） */
  familyId?: string;
  replacedAt?: Date | null;
  deviceInfo?: string | null;
}

/**
 * リフレッシュトークンの行を作り、原文と作った行を返す
 *
 * @param prisma - データベースのクライアント
 * @param options - 行の属性
 */
export async function createStoredRefreshToken(
  prisma: PrismaClient,
  options: StoredRefreshTokenOptions
): Promise<{ rawToken: string; row: RefreshToken }> {
  const rawToken = randomBytes(32).toString('hex');
  const row = await prisma.refreshToken.create({
    data: {
      userId: options.userId,
      tokenHash: hashRefreshToken(rawToken),
      familyId: options.familyId ?? randomUUID(),
      replacedAt: options.replacedAt ?? null,
      deviceInfo: options.deviceInfo ?? null,
      expiresAt: options.expiresAt,
    },
  });
  return { rawToken, row };
}
