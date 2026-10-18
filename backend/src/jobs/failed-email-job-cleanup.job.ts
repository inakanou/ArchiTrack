/**
 * メールキューの失敗のジョブの掃除（user-authentication 要件45.3）
 *
 * 定期処理の実行基盤（scheduled-job-runner.ts）から毎時 45 分に呼ばれる。メールキューの失敗の
 * 集合から、失敗してから猶予（1 時間）を過ぎたジョブを消す。
 *
 * 最終の失敗のジョブは、通常は EmailService の failed の受け手が記録してすぐに消す。その判定や
 * 記録が例外になったジョブは消されずに失敗の集合に残り、宛先とトークンを含んだままになる。
 * この掃除はその安全網で、例外の経路でも失敗から 2 時間以内（猶予 + 周期）に消す。
 *
 * - 猶予の基準は Bull の clean と同じく失敗の時刻（finishedOn）。通常の後始末は失敗の直後に
 *   走るため、1 時間の猶予はそれと競合しない
 * - 対象は失敗の集合だけで、待機中・遅延・実行中のジョブには触れない（実行中のロックを持つ
 *   ジョブは Bull の clean も消さない）
 * - 何度実行しても、猶予を過ぎた失敗のジョブが無くなる以外に結果は変わらない（冪等）
 */

import type { Queue } from 'bull';
import { createEmailQueue } from '../services/email.service.js';
import logger from '../utils/logger.js';

/** 定期処理のジョブ名（繰り返しジョブの識別子を兼ねる） */
export const FAILED_EMAIL_JOB_CLEANUP_JOB_NAME = 'failed-email-job-cleanup';

/** 毎時 45 分（Asia/Tokyo）。トークンの消去（毎時 15 分）と時刻をずらす */
export const FAILED_EMAIL_JOB_CLEANUP_CRON = '45 * * * *';

/** 失敗してから掃除の対象になるまでの猶予（1 時間） */
export const FAILED_EMAIL_JOB_GRACE_MS = 60 * 60 * 1000;

export interface FailedEmailJobCleanupResult {
  /** 消した失敗のジョブの件数 */
  failedEmailJobsRemoved: number;
}

/**
 * メールキューの失敗の集合から、猶予を過ぎたジョブを消す
 *
 * 実行ごとにメールキューへ接続し、終わったら閉じる（送信の処理は登録しない）。
 *
 * @param createQueue - メールキューを作る（既定は REDIS_URL で接続する本番のキュー）
 * @param graceMs - 失敗してから対象になるまでの猶予（既定は 1 時間）
 */
export async function cleanupFailedEmailJobs(
  createQueue: () => Queue = () => createEmailQueue(),
  graceMs: number = FAILED_EMAIL_JOB_GRACE_MS
): Promise<FailedEmailJobCleanupResult> {
  const queue = createQueue();
  // 接続の失敗の通知を受けずに漏らすと、プロセスの未処理のエラーになる
  queue.on('error', (error: Error) => {
    logger.warn({ err: error }, 'Email queue error during the failed job cleanup');
  });
  try {
    const removed = await queue.clean(graceMs, 'failed');
    return { failedEmailJobsRemoved: removed.length };
  } finally {
    await queue.close();
  }
}
