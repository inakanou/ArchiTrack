/**
 * @fileoverview 見積書の編集セッション（在席情報）サービス
 *
 * 見積書詳細画面は常時編集の画面（REQ-27.1）であり、開いている間がそのまま「編集中」である。
 * 画面は開いている間、一定間隔（`ESTIMATE_EDIT_SESSION_HEARTBEAT_INTERVAL_SECONDS`）で
 * 在席を通知し、本サービスは利用者ごとの最終通知時刻（`lastSeenAt`）を記録する。
 * 通知の応答として、TTL（`ESTIMATE_EDIT_SESSION_TTL_SECONDS`）以内に通知のあった
 * **自分以外の**利用者を返し、画面はそれを「他のユーザーが編集中」の警告として表示する。
 *
 * 画面を離れたときは退出（`leave`）で行を消す。タブを閉じる・通信が途絶えるなどで
 * 退出が届かない場合も、TTL を過ぎた行は編集中と数えない（期限切れの行は次の通知で掃除する）。
 *
 * 保存の競合の検出（REQ-11.6、`expectedUpdatedAt` と 409）とは独立した仕組みであり、
 * 本サービスは見積書の `updatedAt` を進めない。
 *
 * Requirements (estimate-creation):
 * - REQ-11.7: 見積書が他のユーザーによって編集中の場合、編集中であることを警告表示する
 *
 * @module services/estimate-edit-session
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import { EstimateNotFoundError } from '../errors/estimateError.js';

/** 編集中とみなす期間（秒）。最終通知からこの秒数を過ぎた利用者は編集中と数えない */
export const ESTIMATE_EDIT_SESSION_TTL_SECONDS = 90;

/**
 * 画面が在席を通知する間隔（秒）
 *
 * TTL はこの間隔の 3 倍以上とする。バックグラウンドのタブではブラウザがタイマーを
 * 最大 1 分間隔まで間引くため、間引かれても TTL 内に次の通知が届くようにする。
 */
export const ESTIMATE_EDIT_SESSION_HEARTBEAT_INTERVAL_SECONDS = 20;

/** 編集中の他の利用者 */
export interface EstimateOtherEditor {
  userId: string;
  displayName: string;
  lastSeenAt: Date;
}

export interface EstimateEditSessionServiceDependencies {
  prisma: PrismaClient;
  /** 現在時刻（テストで差し替える） */
  now?: () => Date;
}

/**
 * 見積書の編集セッションサービス
 */
export class EstimateEditSessionService {
  private readonly prisma: PrismaClient;
  private readonly now: () => Date;

  constructor(deps: EstimateEditSessionServiceDependencies) {
    this.prisma = deps.prisma;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * 在席を通知し、編集中の他の利用者を返す
   *
   * @throws EstimateNotFoundError 見積書が存在しない、または論理削除済みの場合
   */
  async heartbeat(estimateId: string, userId: string): Promise<EstimateOtherEditor[]> {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id: estimateId, deletedAt: null },
      select: { id: true },
    });
    if (!estimate) {
      throw new EstimateNotFoundError(estimateId);
    }

    const now = this.now();
    const threshold = new Date(now.getTime() - ESTIMATE_EDIT_SESSION_TTL_SECONDS * 1000);

    await this.prisma.estimateEditSession.upsert({
      where: { estimateId_userId: { estimateId, userId } },
      create: { estimateId, userId, lastSeenAt: now },
      update: { lastSeenAt: now },
    });

    // 退出が届かなかった期限切れの行を掃除する（表示の判定は下の絞り込みが担う）
    await this.prisma.estimateEditSession.deleteMany({
      where: { estimateId, lastSeenAt: { lt: threshold } },
    });

    const sessions = await this.prisma.estimateEditSession.findMany({
      where: {
        estimateId,
        userId: { not: userId },
        lastSeenAt: { gte: threshold },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        userId: true,
        lastSeenAt: true,
        user: { select: { displayName: true } },
      },
    });

    return sessions.map((session) => ({
      userId: session.userId,
      displayName: session.user.displayName,
      lastSeenAt: session.lastSeenAt,
    }));
  }

  /**
   * 編集画面を離れたことを記録する（自分の在席を消す）
   *
   * 既に消えている場合も成功とする（冪等）。
   */
  async leave(estimateId: string, userId: string): Promise<void> {
    await this.prisma.estimateEditSession.deleteMany({
      where: { estimateId, userId },
    });
  }
}
