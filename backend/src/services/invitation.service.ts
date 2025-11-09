/**
 * @fileoverview 招待管理サービス
 *
 * Requirements:
 * - 1.1: 管理者が有効なメールアドレスを提供すると一意の招待トークンを生成
 * - 1.2: 招待トークンが生成されると7日間の有効期限を設定
 * - 1.4: 招待メールアドレスが既に登録済みの場合はエラーメッセージを返す
 * - 1.7: 管理者が招待一覧を取得すると招待ステータスを返す
 * - 1.8: 管理者が未使用の招待を取り消すと招待を無効化
 * - 2.2: 招待トークンが無効または存在しない場合はエラーメッセージを返す
 * - 2.3: 招待トークンが期限切れの場合はエラーメッセージを返す
 * - 2.4: 招待トークンが既に使用済みの場合はエラーメッセージを返す
 */

import crypto from 'crypto';
import type { PrismaClient, Invitation } from '@prisma/client';
import {
  InvitationStatus,
  type InvitationError,
  type Result,
  Ok,
  Err,
} from '../types/invitation.types';

/**
 * 招待管理サービス
 *
 * 招待の作成、検証、取り消し、一覧取得を提供します。
 */
export class InvitationService {
  /**
   * 招待トークンの有効期限（日数）
   */
  private readonly INVITATION_EXPIRY_DAYS = 7;

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 招待を作成する
   *
   * @param inviterId - 招待者のユーザーID
   * @param email - 招待するメールアドレス
   * @returns 作成された招待または エラー
   */
  async createInvitation(
    inviterId: string,
    email: string
  ): Promise<Result<Invitation, InvitationError>> {
    // メールアドレスが既に登録済みかチェック
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return Err({ type: 'EMAIL_ALREADY_REGISTERED' });
    }

    // 一意の招待トークンを生成（32バイトのランダムバイト → hex文字列）
    const token = crypto.randomBytes(32).toString('hex');

    // 7日間の有効期限を設定
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.INVITATION_EXPIRY_DAYS);

    // 招待をデータベースに保存
    const invitation = await this.prisma.invitation.create({
      data: {
        email,
        token,
        inviterId,
        status: InvitationStatus.PENDING,
        expiresAt,
      },
    });

    return Ok(invitation);
  }

  /**
   * 招待トークンを検証する
   *
   * @param token - 招待トークン
   * @returns 検証された招待またはエラー
   */
  async validateInvitation(token: string): Promise<Result<Invitation, InvitationError>> {
    // トークンで招待を検索
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
    });

    // 招待が存在しない場合
    if (!invitation) {
      return Err({ type: 'INVALID_TOKEN' });
    }

    // ステータスチェック
    if (invitation.status === InvitationStatus.USED) {
      return Err({ type: 'USED_TOKEN' });
    }

    if (invitation.status === InvitationStatus.REVOKED) {
      return Err({ type: 'REVOKED_TOKEN' });
    }

    // 有効期限チェック
    if (invitation.expiresAt < new Date()) {
      return Err({ type: 'EXPIRED_TOKEN' });
    }

    return Ok(invitation);
  }

  /**
   * 招待を取り消す
   *
   * @param invitationId - 招待ID
   * @param userId - リクエストユーザーID（権限チェック用）
   * @returns 成功またはエラー
   */
  async revokeInvitation(
    invitationId: string,
    userId: string
  ): Promise<Result<void, InvitationError>> {
    // 招待を検索
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });

    // 招待が存在しない場合
    if (!invitation) {
      return Err({ type: 'INVITATION_NOT_FOUND' });
    }

    // 権限チェック（招待を作成した管理者のみ取り消し可能）
    if (invitation.inviterId !== userId) {
      return Err({ type: 'UNAUTHORIZED' });
    }

    // 既に使用済みの場合は取り消せない
    if (invitation.status === InvitationStatus.USED) {
      return Err({ type: 'USED_TOKEN' });
    }

    // ステータスをrevokedに更新
    await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.REVOKED },
    });

    return Ok(undefined);
  }

  /**
   * 招待一覧を取得する
   *
   * @param filters - フィルター条件（オプション）
   * @returns 招待の配列
   */
  async listInvitations(filters?: { status?: InvitationStatus }): Promise<Invitation[]> {
    const where = filters?.status ? { status: filters.status } : {};

    const invitations = await this.prisma.invitation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return invitations;
  }
}
