/**
 * @fileoverview タイミング攻撃対策ユーティリティ
 *
 * Requirements:
 * - 26.9: 複数回のログイン失敗が検出される際、タイミング攻撃を防ぐため、一定時間の遅延を挿入
 */

/**
 * タイミング攻撃対策の遅延を挿入
 *
 * ログイン失敗時に一定の遅延を挿入することで、
 * ユーザー存在有無の判別をタイミングから推測できないようにします。
 *
 * 推奨遅延時間: 100-200ms
 * - 100ms未満: タイミング差が検出される可能性がある
 * - 300ms以上: ユーザー体験に悪影響を与える可能性がある
 *
 * @param minMs - 最小遅延時間（ミリ秒、デフォルト: 100ms）
 * @param maxMs - 最大遅延時間（ミリ秒、デフォルト: 200ms）
 * @returns Promise<void> - 遅延完了後に解決される
 */
export async function addTimingAttackDelay(minMs = 100, maxMs = 200): Promise<void> {
  // ランダムな遅延時間を生成（minMs～maxMsの範囲）
  const delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

  // Promise.resolveでPromiseチェーンを作成し、遅延を挿入
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
