/**
 * @fileoverview `resolveUpdatedAt` の単体検証
 *
 * Requirements (trading-partner-management):
 * - REQ-11.12: 各取引先レコードに作成日時と更新日時を自動記録する
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveUpdatedAt } from '../../../utils/timestamps.js';
import logger from '../../../utils/logger.js';

/**
 * `logger` は `vitest.setup.ts` の全域モックで `vi.fn()` に差し替わっており、
 * 同一ファイル内の検証をまたいで呼び出し履歴が積み上がる。件数を見る検証が
 * 実行順に左右されないよう、各検証の前に履歴を空にする。
 */
describe('resolveUpdatedAt (trading-partner-management/REQ-11.12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createdAt = new Date('2026-08-28T18:27:48.496Z');

  it('現在時刻が作成日時より後なら現在時刻をそのまま返す', () => {
    const now = new Date(createdAt.getTime() + 1234);
    expect(resolveUpdatedAt(createdAt, now).getTime()).toBe(now.getTime());
  });

  it('現在時刻が作成日時と同じならその値を返す', () => {
    const now = new Date(createdAt.getTime());
    expect(resolveUpdatedAt(createdAt, now).getTime()).toBe(createdAt.getTime());
  });

  it('現在時刻が作成日時より前なら作成日時まで押し上げる', () => {
    // E2E で実測された逆転幅（444ms）をそのまま当てる
    const now = new Date(createdAt.getTime() - 444);
    expect(resolveUpdatedAt(createdAt, now).getTime()).toBe(createdAt.getTime());
  });

  it('押し上げた結果は実時刻より先へ進めない（作成日時を超えない）', () => {
    const now = new Date(createdAt.getTime() - 5000);
    expect(resolveUpdatedAt(createdAt, now).getTime()).toBeLessThanOrEqual(createdAt.getTime());
  });

  it('第2引数を省略したときは壁時計を使う', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = new Date(createdAt.getTime() + 7000);
    vi.setSystemTime(now);
    expect(resolveUpdatedAt(createdAt).getTime()).toBe(now.getTime());
  });

  it('押し上げたときは後退の幅を添えて警告を残す', () => {
    const warn = vi.mocked(logger.warn);
    const now = new Date(createdAt.getTime() - 444);

    resolveUpdatedAt(createdAt, now);

    expect(warn).toHaveBeenCalledTimes(1);
    const [payload] = warn.mock.calls[0] as unknown as [Record<string, unknown>, string];
    expect(payload.rollbackMs).toBe(444);
    expect(payload.createdAt).toBe(createdAt.toISOString());
    expect(payload.wallClockNow).toBe(now.toISOString());
  });

  it('押し上げが起きないときは警告を残さない', () => {
    const warn = vi.mocked(logger.warn);

    resolveUpdatedAt(createdAt, new Date(createdAt.getTime() + 1234));
    resolveUpdatedAt(createdAt, new Date(createdAt.getTime()));

    expect(warn).not.toHaveBeenCalled();
  });

  it('引数として渡した Date を書き換えない', () => {
    const now = new Date(createdAt.getTime() - 1000);
    const nowSnapshot = now.getTime();
    resolveUpdatedAt(createdAt, now);
    expect(now.getTime()).toBe(nowSnapshot);
    expect(createdAt.toISOString()).toBe('2026-08-28T18:27:48.496Z');
  });
});
