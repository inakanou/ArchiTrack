/**
 * @fileoverview 利用者単位のリフレッシュトークンの変更の直列化（タスク45.2）
 *
 * ローテーション（SessionService.rotate）と、系列・利用者単位の失効（ログアウト・全デバイスのログアウト・
 * パスワードの変更とリセット・2FA の無効化）は、どれもこの取引ロックを行の変更より前に取る。
 * SessionService（TokenService を読み込む）に依存しないよう、独立したモジュールに置く。
 *
 * @module utils/refresh-token-lock
 */

import type { Prisma } from '../generated/prisma/client.js';
import type { RefreshTokenClient } from '../types/session.types.js';

/**
 * 利用者単位のリフレッシュトークンの変更を直列化する取引ロックの名前空間（pg_advisory_xact_lock の第1キー）
 */
export const REFRESH_TOKEN_LOCK_NAMESPACE = 45_002;

/**
 * 同じ利用者のリフレッシュトークンへの変更（ローテーション・系列の失効・利用者単位の失効）を
 * 取引の終わりまで直列化する。
 *
 * 取引は READ COMMITTED のため、ロックが無いと、ローテーションが後継を作ってコミットする前に
 * 始まった削除の文は、その後継を見ずに前の行だけを消し、後継が失効を逃れて残る。
 * 利用者単位の取引ロック（pg_advisory_xact_lock）を、各操作で行を変える前に取る。
 * 行ロックでなく取引ロックにするのは、まだ存在しない後継の行や、利用者の全ての行を一つの単位で
 * 守るためであり、users の行の FOR UPDATE のように他の表の外部キーの検査を待たせないためでもある。
 *
 * @param tx - 呼び出し元のトランザクション
 * @param userId - 利用者 ID
 */
export async function lockUserRefreshTokens(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
  userId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REFRESH_TOKEN_LOCK_NAMESPACE}::int, hashtext(${userId}))`;
}

/**
 * 利用者の全てのリフレッシュトークンを、取引ロックを取ってから消す（要件33.5）
 *
 * パスワードの変更・リセットや 2FA の無効化のように、他の更新と同じ取引で失効させる経路が使う。
 *
 * @param tx - 呼び出し元のトランザクション
 * @param userId - 利用者 ID
 * @returns 消した行の数
 */
export async function revokeAllRefreshTokensForUser(
  tx: RefreshTokenClient,
  userId: string
): Promise<number> {
  await lockUserRefreshTokens(tx, userId);
  const { count } = await tx.refreshToken.deleteMany({ where: { userId } });
  return count;
}
