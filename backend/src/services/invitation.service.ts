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
 *
 * タスク50.1 で、トークンを原文の SHA-256 だけで保存し、一覧からトークンと招待 URL を外し、
 * 作成者でない管理者の取り消しと同じ行の再送信を受け付け、作成・取り消し・再送信を監査に残す形へ改めた
 * （user-authentication の要件37・40 の招待の項）。
 */

import crypto from 'crypto';
import type { PrismaClient, Prisma, Invitation } from '../generated/prisma/client.js';
import type { EmailService } from './email.service.js';
import type { RequestContext } from '../types/auth.types.js';
import { snapshotAuditActor } from './audit-log.service.js';
import logger from '../utils/logger.js';
import { buildInvitationUrl, hashInvitationToken } from '../utils/invitation-token.js';
import {
  InvitationStatus,
  type InvitationError,
  type Result,
  Ok,
  Err,
} from '../types/invitation.types.js';

/**
 * 招待メールの送信口（EmailService のうち招待が使う部分）
 */
export type InvitationEmailSender = Pick<EmailService, 'sendInvitationEmail'>;

export { buildInvitationUrl, hashInvitationToken };

/**
 * 招待一覧と作成・再送信の応答に載せる招待（トークンとそのハッシュを含めない。要件37.2）
 */
export interface InvitationSummary {
  id: string;
  email: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  inviter: { id: string; displayName: string };
}

/**
 * 作成・再送信の結果（トークンの原文と招待 URL は、この直後の応答とメールにだけ現れる）
 */
export interface IssuedInvitation {
  invitation: InvitationSummary;
  /** 招待トークンの原文（保存しない） */
  token: string;
  /** サーバーが組み立てた招待 URL */
  invitationUrl: string;
}

/** 招待の要約の読み出しの列（トークンのハッシュを読まない） */
const INVITATION_SUMMARY_SELECT = {
  id: true,
  email: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  inviter: { select: { id: true, displayName: true } },
} as const satisfies Prisma.InvitationSelect;

/** 監査の metadata に載せる送信元の情報 */
function contextMetadata(ctx: RequestContext | undefined): Record<string, string> {
  return {
    ...(ctx?.ipAddress !== undefined && { ipAddress: ctx.ipAddress }),
    ...(ctx?.userAgent !== undefined && { userAgent: ctx.userAgent }),
  };
}

/**
 * 招待管理サービス
 *
 * 招待の作成、検証、取り消し、再送信、一覧取得を提供します。
 */
export class InvitationService {
  /**
   * 招待トークンの有効期限（日数）
   */
  private readonly INVITATION_EXPIRY_DAYS = 7;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailSender?: InvitationEmailSender
  ) {}

  /** 新しいトークンの原文と有効期限 */
  private issueToken(): { token: string; expiresAt: Date } {
    // 一意の招待トークンを生成（32バイトのランダムバイト → hex文字列）
    const token = crypto.randomBytes(32).toString('hex');
    // 7日間の有効期限を設定
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.INVITATION_EXPIRY_DAYS);
    return { token, expiresAt };
  }

  /** 招待の操作の監査ログを、操作と同じトランザクションで記録する（要件40.5） */
  private async recordAudit(
    tx: Prisma.TransactionClient,
    action: 'INVITATION_CREATED' | 'INVITATION_REVOKED' | 'INVITATION_RESENT',
    actorId: string,
    invitation: { id: string; email: string; inviterId: string },
    ctx: RequestContext | undefined,
    change: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue } = {}
  ): Promise<void> {
    const actor = await snapshotAuditActor(tx, actorId);
    await tx.auditLog.create({
      data: {
        action,
        actorId,
        ...actor,
        targetType: 'Invitation',
        targetId: invitation.id,
        ...(change.before !== undefined && { before: change.before }),
        ...(change.after !== undefined && { after: change.after }),
        metadata: {
          email: invitation.email,
          inviterId: invitation.inviterId,
          ...contextMetadata(ctx),
        },
      },
    });
  }

  /**
   * 招待を作成する
   *
   * トークンの原文はハッシュだけを保存し、招待メールと戻り値（作成直後の応答）にだけ渡す（要件37.1）。
   *
   * @param inviterId - 招待者のユーザーID
   * @param email - 招待するメールアドレス
   * @param ctx - 監査に載せる送信元
   * @returns 作成された招待と招待 URL、またはエラー
   */
  async createInvitation(
    inviterId: string,
    email: string,
    ctx?: RequestContext
  ): Promise<Result<IssuedInvitation, InvitationError>> {
    // メールアドレスが既に登録済みかチェック (optimized: only check existence)
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return Err({ type: 'EMAIL_ALREADY_REGISTERED' });
    }

    const { token, expiresAt } = this.issueToken();

    // 招待の保存と作成の監査を一つのトランザクションで行う（要件40.5）
    const invitation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invitation.create({
        data: {
          email,
          tokenHash: hashInvitationToken(token),
          inviterId,
          status: InvitationStatus.PENDING,
          expiresAt,
        },
        select: { ...INVITATION_SUMMARY_SELECT, inviterId: true },
      });
      await this.recordAudit(tx, 'INVITATION_CREATED', inviterId, created, ctx);
      return created;
    });

    // 招待メールをキューへ投入する（要件1.3）。投入の成否は招待の作成の成否に影響しない（要件24.8）
    this.queueInvitationEmail(invitation, token);

    return Ok(this.issued(invitation, token));
  }

  private issued(
    invitation: InvitationSummary & { inviterId?: string },
    token: string
  ): IssuedInvitation {
    const { id, email, status, expiresAt, createdAt, inviter } = invitation;
    return {
      invitation: { id, email, status, expiresAt, createdAt, inviter },
      token,
      invitationUrl: buildInvitationUrl(token),
    };
  }

  /**
   * 招待メールをキューへ投入する（要件1.3・24.8）
   */
  private queueInvitationEmail(invitation: { id: string; email: string }, token: string): void {
    if (!this.emailSender) {
      logger.warn(
        { invitationId: invitation.id },
        'Invitation email sender is not configured; invitation email was not queued'
      );
      return;
    }

    // 投入の完了を待たない。キュー（Redis）が応答しない・失敗するときも招待の作成は成功させ、
    // 失敗は警告ログに残す（要件24.8）
    const emailSender = this.emailSender;
    void (async () => {
      try {
        await emailSender.sendInvitationEmail(invitation.email, token);
      } catch (error) {
        logger.warn(
          // pino の標準シリアライザ（err キー）で message と stack を残す
          { err: error, invitationId: invitation.id },
          'Failed to queue invitation email; invitation was created'
        );
      }
    })();
  }

  /**
   * 招待トークンを検証する
   *
   * @param token - 招待トークン（原文）
   * @returns 検証された招待またはエラー
   */
  async validateInvitation(token: string): Promise<Result<Invitation, InvitationError>> {
    // 原文のハッシュで招待を検索する（要件37.1）。定期処理でハッシュが消された招待（NULL）は
    // どのトークンとも一致しない
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashInvitationToken(token) },
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
   * 招待の権限を持つ利用者なら、招待の作成者でなくても取り消せる（要件37.5）。権限の確認はルートの
   * `requirePermission('user:invite')` が行う。
   *
   * @param invitationId - 招待ID
   * @param actorId - 取り消しを実行する利用者のID（監査の実行者）
   * @param ctx - 監査に載せる送信元
   * @returns 成功またはエラー
   */
  async revokeInvitation(
    invitationId: string,
    actorId: string,
    ctx?: RequestContext
  ): Promise<Result<void, InvitationError>> {
    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({
        where: { id: invitationId },
        select: { id: true, email: true, inviterId: true, status: true },
      });

      // 招待が存在しない場合
      if (!invitation) {
        return Err({ type: 'INVITATION_NOT_FOUND' as const });
      }

      // 既に使用済みの場合は取り消せない
      if (invitation.status === InvitationStatus.USED) {
        return Err({ type: 'USED_TOKEN' as const });
      }

      // ステータスをrevokedに更新
      await tx.invitation.update({
        where: { id: invitationId },
        data: { status: InvitationStatus.REVOKED },
      });
      await this.recordAudit(tx, 'INVITATION_REVOKED', actorId, invitation, ctx, {
        before: { status: invitation.status },
        after: { status: InvitationStatus.REVOKED },
      });

      return Ok(undefined);
    });
  }

  /**
   * 招待を再送信する
   *
   * 新しいトークンを発行し、同じ招待の行のハッシュと有効期限を置き換えて古いトークンを失効させ、
   * 招待メールを送り直す（要件13.7・37.1）。定期処理でハッシュが消された期限切れの招待も再送信できる。
   * 使用済み・取り消し済みの招待は再送信しない。
   *
   * @param invitationId - 招待ID
   * @param actorId - 再送信を実行する利用者のID（監査の実行者）
   * @param ctx - 監査に載せる送信元
   * @returns 再送信した招待と新しい招待 URL、またはエラー
   */
  async resendInvitation(
    invitationId: string,
    actorId: string,
    ctx?: RequestContext
  ): Promise<Result<IssuedInvitation, InvitationError>> {
    const { token, expiresAt } = this.issueToken();

    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.invitation.findUnique({
        where: { id: invitationId },
        select: { id: true, email: true, inviterId: true, status: true, expiresAt: true },
      });

      if (!current) {
        return Err({ type: 'INVITATION_NOT_FOUND' as const });
      }
      if (current.status === InvitationStatus.USED) {
        return Err({ type: 'USED_TOKEN' as const });
      }
      if (current.status === InvitationStatus.REVOKED) {
        return Err({ type: 'REVOKED_TOKEN' as const });
      }

      // 招待の後に別の経路で登録済みになったメールアドレスへは送り直さない（要件1.4）
      const existingUser = await tx.user.findUnique({
        where: { email: current.email },
        select: { id: true },
      });
      if (existingUser) {
        return Err({ type: 'EMAIL_ALREADY_REGISTERED' as const });
      }

      const updated = await tx.invitation.update({
        where: { id: invitationId },
        data: {
          tokenHash: hashInvitationToken(token),
          expiresAt,
          status: InvitationStatus.PENDING,
        },
        select: { ...INVITATION_SUMMARY_SELECT, inviterId: true },
      });
      await this.recordAudit(tx, 'INVITATION_RESENT', actorId, updated, ctx, {
        before: { status: current.status, expiresAt: current.expiresAt.toISOString() },
        after: { status: updated.status, expiresAt: updated.expiresAt.toISOString() },
      });
      return Ok(updated);
    });

    if (!result.ok) {
      return result;
    }

    this.queueInvitationEmail(result.value, token);

    return Ok(this.issued(result.value, token));
  }

  /**
   * 招待一覧を取得する
   *
   * トークンのハッシュと招待 URL を含めない（要件37.2）。
   *
   * @param filters - フィルター条件（オプション）
   * @returns 招待の要約の配列
   */
  async listInvitations(filters?: { status?: InvitationStatus }): Promise<InvitationSummary[]> {
    const where = filters?.status ? { status: filters.status } : {};

    return this.prisma.invitation.findMany({
      where,
      select: INVITATION_SUMMARY_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }
}
