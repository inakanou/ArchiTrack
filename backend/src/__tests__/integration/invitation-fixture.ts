/**
 * @fileoverview 統合テストの前提データとして、招待の行を DB へ直接作る補助（タスク50.1）
 *
 * 保存の形式は本番の InvitationService と同じ（原文の SHA-256 の 16 進。要件37.1）。
 * 原文を返し、DB にはハッシュだけを書く。
 */

import { randomBytes } from 'crypto';
import type { Invitation, PrismaClient } from '../../generated/prisma/client.js';
import { hashInvitationToken } from '../../services/invitation.service.js';

export interface StoredInvitationOptions {
  email: string;
  inviterId: string;
  expiresAt: Date;
  /** 状態（省略時は pending） */
  status?: 'pending' | 'used' | 'expired' | 'revoked';
  usedAt?: Date | null;
  /** 原文（省略時は無作為の 32 バイトの 16 進） */
  rawToken?: string;
}

/**
 * 招待の行を作り、原文と作った行を返す
 *
 * @param prisma - データベースのクライアント
 * @param options - 行の属性
 */
export async function createStoredInvitation(
  prisma: PrismaClient,
  options: StoredInvitationOptions
): Promise<{ rawToken: string; invitation: Invitation }> {
  const rawToken = options.rawToken ?? randomBytes(32).toString('hex');
  const invitation = await prisma.invitation.create({
    data: {
      email: options.email,
      tokenHash: hashInvitationToken(rawToken),
      inviterId: options.inviterId,
      expiresAt: options.expiresAt,
      status: options.status ?? 'pending',
      usedAt: options.usedAt ?? null,
    },
  });
  return { rawToken, invitation };
}
