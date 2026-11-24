/**
 * @fileoverview 画面用アクセストークンの世代を進める（user-authentication タスク76.1）
 *
 * パスワードの変更・リセットと全デバイスのログアウトは、接続の失効と同じトランザクションで
 * `users.access_token_generation` を 1 進め、発行済みの画面用アクセストークンを直ちに使えなくする
 * （design.md の「アクセストークンの即失効」。2026-11-24 の利用者の判断）。
 * 認証ミドルウェアは利用者の状態のキャッシュの世代と比べるため、呼び出し元はコミットの後に
 * 状態のキャッシュを無効化する。
 *
 * @module utils/access-token-generation
 */

import type { Prisma } from '../generated/prisma/client.js';

/**
 * 利用者の画面用アクセストークンの世代を 1 進める
 *
 * 利用者の更新日時は変えない（プロフィールの楽観的な排他に使うため）。行の更新は users の行を
 * 非キーの更新の強さでロックするので、呼び出し元はリフレッシュトークンの取引ロックを先に取る
 * （「リフレッシュトークンの取引ロック → users の行 → 失効の取引ロック」の順。タスク45.2・72.3）。
 *
 * @param tx - 呼び出し元のトランザクション
 * @param userId - 利用者 ID
 */
export async function advanceAccessTokenGeneration(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
  userId: string
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "users"
    SET "access_token_generation" = "access_token_generation" + 1
    WHERE "id" = ${userId}`;
}
