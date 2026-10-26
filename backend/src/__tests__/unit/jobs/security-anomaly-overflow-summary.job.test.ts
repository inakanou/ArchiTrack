/**
 * 異常の通知の溢れ分の要約のジョブの単体検証（user-authentication タスク60.1）
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../redis.js', () => ({
  default: { getClient: vi.fn(() => null) },
}));

import {
  SECURITY_ANOMALY_OVERFLOW_SUMMARY_CRON,
  SECURITY_ANOMALY_OVERFLOW_SUMMARY_JOB_NAME,
  sendSecurityAnomalyOverflowSummary,
} from '../../../jobs/security-anomaly-overflow-summary.job.js';

describe('sendSecurityAnomalyOverflowSummary', () => {
  /**
   * @requirement user-authentication/REQ-43.9
   */
  it('渡された部品の要約の処理を呼び、その結果を返す', async () => {
    const monitor = { sendOverflowSummary: vi.fn(async () => 'sent' as const) };
    await expect(sendSecurityAnomalyOverflowSummary(monitor)).resolves.toEqual({
      overflowSummary: 'sent',
    });
    expect(monitor.sendOverflowSummary).toHaveBeenCalledTimes(1);
    expect(SECURITY_ANOMALY_OVERFLOW_SUMMARY_JOB_NAME).toBe('security-anomaly-overflow-summary');
    expect(SECURITY_ANOMALY_OVERFLOW_SUMMARY_CRON).toBe('*/10 * * * *');
  });

  /**
   * @requirement user-authentication/REQ-43.9
   */
  it('既定では共有の部品を使い、Redis が無ければ要約を送らずに戻る', async () => {
    await expect(sendSecurityAnomalyOverflowSummary()).resolves.toEqual({
      overflowSummary: 'unavailable',
    });
  });
});
