/**
 * 異常の通知の溢れ分の要約（user-authentication タスク60.1、要件43.9）
 *
 * 定期処理の実行基盤（scheduled-job-runner.ts）から 10 分ごとに呼ばれる。異常の通知の総数の上限で
 * 送らなかった通知（溢れ分）が残り、次の通知が無いまま上限の時間窓が明けていれば、件数・期間・
 * 種類ごとの内訳の要約を全システム管理者へ 1 通送り、溢れ分を消す（SecurityAnomalyMonitor.sendOverflowSummary）。
 *
 * - 溢れ分の取り出しと消去は一つの操作で行い、複数のインスタンスの実行が重なっても二重に送らない
 * - 要約は通知の総数の上限に含めない（1 回の実行で 1 通に限り、溢れ分が無ければ送らない）
 */

import {
  getSharedSecurityAnomalyMonitor,
  type OverflowSummaryOutcome,
  type SecurityAnomalyMonitor,
} from '../services/security-anomaly-monitor.service.js';

/** 定期処理のジョブ名（繰り返しジョブの識別子を兼ねる） */
export const SECURITY_ANOMALY_OVERFLOW_SUMMARY_JOB_NAME = 'security-anomaly-overflow-summary';

/** 10 分ごと（Asia/Tokyo） */
export const SECURITY_ANOMALY_OVERFLOW_SUMMARY_CRON = '*/10 * * * *';

export interface SecurityAnomalyOverflowSummaryResult {
  /** 要約の処理の結果 */
  overflowSummary: OverflowSummaryOutcome;
}

/**
 * 溢れ分の要約を送る
 *
 * @param monitor - 異常の検知の部品（既定は共有の部品）
 */
export async function sendSecurityAnomalyOverflowSummary(
  monitor: Pick<SecurityAnomalyMonitor, 'sendOverflowSummary'> = getSharedSecurityAnomalyMonitor()
): Promise<SecurityAnomalyOverflowSummaryResult> {
  return { overflowSummary: await monitor.sendOverflowSummary() };
}
