/**
 * @fileoverview セキュリティ上の異常の検知と通知（SecurityAnomalyMonitor）
 *
 * user-authentication タスク55.4（要件39.7、43.1〜43.7）、タスク60.1（要件43.8、43.9）。
 * design.md の SecurityAnomalyMonitor の節。
 * - 認証・権限の検査・閲覧範囲・回数制限・エラー応答・出力の記録から観測を受け、Redis の分単位の桶
 *   （`anomaly:<signal>:<分>` の INCR と EXPIRE）で数え、時間窓の合計が閾値を超えたら全システム管理者へ通知する
 * - 権限の拒否（403）と閲覧範囲外のアクセスは合算して数える。データの出力は利用者ごとの桶で数える
 * - 通知の抑止は `SET anomaly:notified:<signal> NX EX <抑止の秒数>` で行い、同じ種類の通知を重複させない。
 *   データの出力は利用者ごとの `anomaly:notified:data_export:user:<利用者 ID>` で抑止し、利用者 A の抑止の
 *   時間内でも利用者 B の急増は通知する（要件43.8）
 * - 送る通知の総数は固定の時間窓の計数 `anomaly:notify-budget:<窓の番号>` で上限を設け、超えた通知は送らずに
 *   溢れ分（`anomaly:overflow:*`）へ数える。溢れ分は次に送る通知の末尾に添えて消し、次の通知が無いまま
 *   時間窓が明けたときは定期処理が要約を 1 通送る（要件43.9。sendOverflowSummary）
 * - 通知には検知の種類・期間・件数・上位 5 件の送信元 IP と利用者 ID を含める（桶ごとのソート済み集合で数える）
 * - observe は計数を待たずに戻り、要求の応答を待たせない。Redis が使えないときは計数を捨てて警告ログを残す
 *   （検知の欠落は要求の失敗にしない）
 */

import type { default as RedisType } from 'ioredis';
import redisConnection from '../redis.js';
import logger from '../utils/logger.js';
import {
  SECURITY_ALERT_GROUPS,
  loadSecurityAlertConfig,
  type SecurityAlertConfig,
  type SecurityAlertGroup,
} from '../config/security-alert.js';
import type { IAdminNotificationService } from './admin-notification.service.js';

/** 観測の種類 */
export type AnomalySignal =
  | 'login_failed'
  | 'permission_denied'
  | 'scope_denied'
  | 'rate_limited'
  | 'server_error'
  | 'data_export';

/** 一件の観測 */
export interface AnomalyObservation {
  signal: AnomalySignal;
  sourceIp: string | null;
  userId: string | null;
}

export interface ISecurityAnomalyMonitor {
  /** 非同期に計数し、要求の応答を待たせない */
  observe(observation: AnomalyObservation): void;
}

/** 一件の観測の処理の結果（検証で使う） */
export type AnomalyRecordOutcome = 'dropped' | 'counted' | 'notified' | 'suppressed' | 'capped';

/**
 * 溢れ分の要約の処理の結果
 * - sent: 要約を 1 通送った
 * - none: 溢れ分が無い（または他の実行が取り出した）
 * - pending: 溢れ分の最初の溢れの属する上限の時間窓がまだ明けていない
 * - unavailable: Redis が使えない
 */
export type OverflowSummaryOutcome = 'sent' | 'none' | 'pending' | 'unavailable';

/** 計数に使う Redis の操作 */
export type AnomalyRedisClient = Pick<
  RedisType,
  'status' | 'incr' | 'expire' | 'zincrby' | 'mget' | 'set' | 'zrange' | 'get' | 'del' | 'multi'
>;

type AdminNotifier = Pick<IAdminNotificationService, 'notifyAllAdmins'>;

export interface SecurityAnomalyMonitorDependencies {
  /** キャッシュ基盤の接続（null や未接続なら計数を捨てる） */
  getRedisClient: () => AnomalyRedisClient | null;
  /** 全システム管理者への通知の手段（通知のときに初めて得る） */
  getNotifier: () => AdminNotifier | Promise<AdminNotifier>;
  /** 閾値・時間窓・抑止の時間（省略時は環境変数から読む） */
  config?: SecurityAlertConfig;
  /** 現在時刻（ミリ秒） */
  now?: () => number;
  /** Redis の鍵の接頭辞（既定 `anomaly:`。検証は他と混ざらない接頭辞を使う） */
  keyPrefix?: string;
}

/** 通知に載せる上位の件数 */
export const ANOMALY_TOP_ENTRIES = 5;

/** 桶の長さ（秒） */
const BUCKET_SECONDS = 60;

/** Redis が使えない警告を出す間隔（ミリ秒）。障害の間に要求ごとの警告で記録を埋めない */
const UNAVAILABLE_WARNING_INTERVAL_MS = 60_000;

/** 要約の処理の排他の鍵の有効期限（秒）。複数のインスタンスの同時の実行で要約を重ねない */
const OVERFLOW_SUMMARY_LOCK_SECONDS = 60;

/** 溢れ分の記録（上限により送らなかった通知） */
interface OverflowRecord {
  /** 送らなかった通知の件数 */
  count: number;
  /** 群ごとの件数 */
  groups: Record<string, number>;
  /** 最初の溢れの時刻（ミリ秒） */
  since: number;
  /** 最後の溢れの時刻（ミリ秒） */
  last: number;
}

/** MULTI の結果を検め、各操作の結果を返す（どれかが失敗していれば投げる） */
function execResults(results: [Error | null, unknown][] | null): unknown[] {
  if (!results) {
    throw new Error('Redis transaction was aborted');
  }
  return results.map(([error, value]) => {
    if (error) {
      throw error;
    }
    return value;
  });
}

/** 検知の種類の表示名 */
const GROUP_LABELS: Record<SecurityAlertGroup, string> = {
  login_failed: 'ログインの失敗',
  permission_denied: '権限の拒否（403）と閲覧範囲外のアクセス',
  rate_limited: '試行回数の制限による拒否（429）',
  server_error: 'サーバーエラー（5xx）',
  data_export: '同一利用者のデータ出力',
};

/** 観測の種類を閾値の単位へ写す（権限の拒否と範囲外のアクセスは合算する） */
export function anomalyGroupOf(signal: AnomalySignal): SecurityAlertGroup {
  return signal === 'scope_denied' ? 'permission_denied' : signal;
}

interface RankedEntry {
  member: string;
  count: number;
}

/**
 * 時間窓の件数で異常を検知し、重複を抑えて管理者へ通知する
 */
export class SecurityAnomalyMonitor implements ISecurityAnomalyMonitor {
  private readonly config: SecurityAlertConfig;
  private readonly now: () => number;
  private readonly keyPrefix: string;
  private readonly pending = new Set<Promise<AnomalyRecordOutcome>>();
  private lastUnavailableWarningAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly deps: SecurityAnomalyMonitorDependencies) {
    this.config = deps.config ?? loadSecurityAlertConfig();
    this.now = deps.now ?? Date.now;
    this.keyPrefix = deps.keyPrefix ?? 'anomaly:';
  }

  observe(observation: AnomalyObservation): void {
    const task = this.record(observation);
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }

  /** 受け付けた観測の処理を全て待つ（検証と停止の前に使う） */
  async flush(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
  }

  /**
   * 一件の観測を数え、閾値を超えたら通知する。例外を投げない
   */
  async record(observation: AnomalyObservation): Promise<AnomalyRecordOutcome> {
    const group = anomalyGroupOf(observation.signal);
    try {
      if (group === 'data_export' && !observation.userId) {
        // 利用者ごとに数える種類は、利用者の分からない観測を数えない
        return 'dropped';
      }
      const redis = this.deps.getRedisClient();
      if (!redis || redis.status !== 'ready') {
        this.warnUnavailable(group, redis ? `status: ${redis.status}` : 'not configured');
        return 'dropped';
      }
      return await this.countAndCheck(redis, group, observation);
    } catch (error) {
      logger.warn(
        { err: error, signal: observation.signal },
        'Failed to record security anomaly observation; the observation was dropped'
      );
      return 'dropped';
    }
  }

  private async countAndCheck(
    redis: AnomalyRedisClient,
    group: SecurityAlertGroup,
    observation: AnomalyObservation
  ): Promise<AnomalyRecordOutcome> {
    const setting = this.config[group];
    const nowMs = this.now();
    const minute = Math.floor(nowMs / (BUCKET_SECONDS * 1000));
    const bucketCount = Math.max(1, Math.ceil(setting.windowSeconds / BUCKET_SECONDS));
    // 桶は時間窓の間と、最も古い桶が時間窓から外れるまでの 1 桶分を残す
    const ttl = setting.windowSeconds + BUCKET_SECONDS;
    const base = this.counterBase(group, observation.userId);

    const countKey = `${base}:${minute}`;
    await redis.incr(countKey);
    await redis.expire(countKey, ttl);
    await this.rank(redis, `${countKey}:ip`, observation.sourceIp, ttl);
    await this.rank(redis, `${countKey}:user`, observation.userId, ttl);
    await this.rank(redis, `${countKey}:signal`, observation.signal, ttl);

    const minutes = Array.from({ length: bucketCount }, (_, i) => minute - i);
    const counts = await redis.mget(...minutes.map((m) => `${base}:${m}`));
    const total = counts.reduce((sum, value) => sum + (value ? parseInt(value, 10) || 0 : 0), 0);
    if (total <= setting.threshold) {
      return 'counted';
    }

    const acquired = await redis.set(
      this.suppressionKey(group, observation.userId),
      String(nowMs),
      'EX',
      setting.cooldownSeconds,
      'NX'
    );
    if (acquired !== 'OK') {
      return 'suppressed';
    }

    // 通知の総数の上限（要件43.9）。抑止の鍵は取ったまま残し、同じ種類の再送は抑止の時間の間止める
    if (!(await this.takeNotificationBudget(redis, nowMs))) {
      await this.recordOverflow(redis, group, nowMs);
      logger.warn(
        { anomaly: group, count: total, threshold: setting.threshold },
        'Security anomaly notification was not sent because the notification limit was reached'
      );
      return 'capped';
    }

    const [ips, users, signals] = await Promise.all([
      this.topEntries(redis, base, minutes, 'ip'),
      this.topEntries(redis, base, minutes, 'user'),
      this.topEntries(redis, base, minutes, 'signal'),
    ]);
    const periodStart = new Date((minute - bucketCount + 1) * BUCKET_SECONDS * 1000);
    const periodEnd = new Date(nowMs);
    const label = GROUP_LABELS[group];

    const lines = [
      `検知の種類: ${label}（${group}）`,
      ...(signals.length > 1 ? [`内訳: ${formatEntries(signals)}`] : []),
      ...(group === 'data_export' && observation.userId
        ? [`対象の利用者 ID: ${observation.userId}`]
        : []),
      `期間: ${periodStart.toISOString()} 〜 ${periodEnd.toISOString()}（時間窓 ${setting.windowSeconds} 秒）`,
      `件数: ${total} 件（閾値 ${setting.threshold} 件）`,
      `主な送信元 IP: ${formatEntries(ips)}`,
      `主な利用者 ID: ${formatEntries(users)}`,
      group === 'data_export'
        ? `同じ利用者の同じ種類の通知は ${setting.cooldownSeconds} 秒間送らない`
        : `同じ種類の通知は ${setting.cooldownSeconds} 秒間送らない`,
    ];

    logger.warn(
      { anomaly: group, count: total, threshold: setting.threshold },
      'Security anomaly detected'
    );
    await this.sendWithOverflow(redis, {
      subject: `【重要】セキュリティ上の異常の検知: ${label}`,
      lines,
    });
    return 'notified';
  }

  /**
   * 溢れ分の要約を送る（定期処理 `security-anomaly-overflow-summary` から呼ぶ。要件43.9）
   *
   * 溢れ分が残り、最初の溢れの属する上限の時間窓が明けていれば、件数・期間・種類ごとの内訳の要約を
   * 1 通送り、溢れ分を消す。要約は上限の計数に含めない。取り出しと消去は一つの MULTI で行うため、
   * 複数の実行が重なっても要約は 1 通になる。送信の失敗は溢れ分へ戻して投げる（定期処理の再試行に任せる）
   */
  async sendOverflowSummary(): Promise<OverflowSummaryOutcome> {
    const redis = this.deps.getRedisClient();
    if (!redis || redis.status !== 'ready') {
      logger.warn(
        { reason: redis ? `status: ${redis.status}` : 'not configured' },
        'Redis is unavailable; the security anomaly overflow summary was skipped'
      );
      return 'unavailable';
    }
    const sinceRaw = await redis.get(this.overflowKey('since'));
    if (sinceRaw === null) {
      return 'none';
    }
    const windowMs = this.config.notificationLimit.windowSeconds * 1000;
    const nowMs = this.now();
    if (Math.floor(Number(sinceRaw) / windowMs) >= Math.floor(nowMs / windowMs)) {
      return 'pending';
    }

    const lockKey = this.overflowKey('summary-lock');
    const locked = await redis.set(
      lockKey,
      String(nowMs),
      'EX',
      OVERFLOW_SUMMARY_LOCK_SECONDS,
      'NX'
    );
    if (locked !== 'OK') {
      return 'none';
    }
    try {
      const overflow = await this.drainOverflow(redis);
      if (!overflow) {
        return 'none';
      }
      const { maxNotifications, windowSeconds } = this.config.notificationLimit;
      const lines = [
        `異常の通知の総数の上限（${windowSeconds} 秒あたり ${maxNotifications} 通）により送らなかった通知の要約`,
        formatOverflow(overflow),
      ];
      await this.sendOrRestore(redis, overflow, {
        subject: '【重要】セキュリティ上の異常の検知: 上限により送らなかった通知の要約',
        lines,
      });
      logger.warn({ overflowCount: overflow.count }, 'Security anomaly overflow summary was sent');
      return 'sent';
    } finally {
      await redis.del(lockKey);
    }
  }

  /** 抑止の鍵（データの出力は利用者ごと。要件43.8） */
  private suppressionKey(group: SecurityAlertGroup, userId: string | null): string {
    return group === 'data_export'
      ? `${this.keyPrefix}notified:${group}:user:${userId}`
      : `${this.keyPrefix}notified:${group}`;
  }

  private overflowKey(name: 'count' | 'groups' | 'since' | 'last' | 'summary-lock'): string {
    return `${this.keyPrefix}overflow:${name}`;
  }

  /**
   * 上限の時間窓の計数を進め、上限の内なら true を返す（INCR は原子的で、同時の観測でも上限を超えて送らない）
   */
  private async takeNotificationBudget(redis: AnomalyRedisClient, nowMs: number): Promise<boolean> {
    const { maxNotifications, windowSeconds } = this.config.notificationLimit;
    const windowIndex = Math.floor(nowMs / (windowSeconds * 1000));
    const key = `${this.keyPrefix}notify-budget:${windowIndex}`;
    const [used] = execResults(
      await redis
        .multi()
        .incr(key)
        .expire(key, windowSeconds + BUCKET_SECONDS)
        .exec()
    );
    return Number(used) <= maxNotifications;
  }

  /** 上限により送らなかった通知を溢れ分へ数える（一つの MULTI で、取り出しと交わらない） */
  private async recordOverflow(
    redis: AnomalyRedisClient,
    group: SecurityAlertGroup,
    nowMs: number
  ): Promise<void> {
    execResults(
      await redis
        .multi()
        .incr(this.overflowKey('count'))
        .hincrby(this.overflowKey('groups'), group, 1)
        .set(this.overflowKey('since'), String(nowMs), 'NX')
        .set(this.overflowKey('last'), String(nowMs))
        .exec()
    );
  }

  /** 溢れ分を読み出して消す（一つの MULTI。同時の取り出しの片方だけが中身を得る） */
  private async drainOverflow(redis: AnomalyRedisClient): Promise<OverflowRecord | null> {
    const keys = [
      this.overflowKey('count'),
      this.overflowKey('groups'),
      this.overflowKey('since'),
      this.overflowKey('last'),
    ] as const;
    const [countRaw, groupsRaw, sinceRaw, lastRaw] = execResults(
      await redis
        .multi()
        .get(keys[0])
        .hgetall(keys[1])
        .get(keys[2])
        .get(keys[3])
        .del(...keys)
        .exec()
    );
    const count = parseInt(String(countRaw ?? '0'), 10) || 0;
    if (count <= 0) {
      return null;
    }
    const groups: Record<string, number> = {};
    for (const [name, value] of Object.entries((groupsRaw ?? {}) as Record<string, string>)) {
      groups[name] = parseInt(value, 10) || 0;
    }
    const since = Number(sinceRaw ?? NaN);
    const last = Number(lastRaw ?? NaN);
    const fallback = this.now();
    return {
      count,
      groups,
      since: Number.isFinite(since) ? since : fallback,
      last: Number.isFinite(last) ? last : fallback,
    };
  }

  /** 取り出した溢れ分を戻す（送信の失敗のとき。取り出しの後の溢れより最初の溢れは前、最後の溢れは後） */
  private async restoreOverflow(
    redis: AnomalyRedisClient,
    overflow: OverflowRecord
  ): Promise<void> {
    const transaction = redis.multi().incrby(this.overflowKey('count'), overflow.count);
    for (const [name, count] of Object.entries(overflow.groups)) {
      transaction.hincrby(this.overflowKey('groups'), name, count);
    }
    transaction
      .set(this.overflowKey('since'), String(overflow.since))
      .set(this.overflowKey('last'), String(overflow.last), 'NX');
    execResults(await transaction.exec());
  }

  /** 送る前に溢れ分を取り出して末尾に添え、通知する（要件43.9） */
  private async sendWithOverflow(
    redis: AnomalyRedisClient,
    message: { subject: string; lines: string[] }
  ): Promise<void> {
    const overflow = await this.drainOverflow(redis);
    const lines = overflow ? [...message.lines, formatOverflow(overflow)] : message.lines;
    await this.sendOrRestore(redis, overflow, { subject: message.subject, lines });
  }

  private async sendOrRestore(
    redis: AnomalyRedisClient,
    overflow: OverflowRecord | null,
    message: { subject: string; lines: string[] }
  ): Promise<void> {
    try {
      const notifier = await this.deps.getNotifier();
      await notifier.notifyAllAdmins({ kind: 'SECURITY_ANOMALY', ...message });
    } catch (error) {
      if (overflow) {
        try {
          await this.restoreOverflow(redis, overflow);
        } catch (restoreError) {
          logger.error(
            { err: restoreError, overflowCount: overflow.count },
            'Failed to restore the security anomaly overflow after a failed notification'
          );
        }
      }
      throw error;
    }
  }

  /** 桶の鍵の共通部分（データの出力は利用者ごと） */
  private counterBase(group: SecurityAlertGroup, userId: string | null): string {
    return group === 'data_export'
      ? `${this.keyPrefix}${group}:user:${userId}`
      : `${this.keyPrefix}${group}`;
  }

  private async rank(
    redis: AnomalyRedisClient,
    key: string,
    member: string | null,
    ttl: number
  ): Promise<void> {
    if (!member) {
      return;
    }
    await redis.zincrby(key, 1, member);
    await redis.expire(key, ttl);
  }

  /** 時間窓の桶のソート済み集合を合わせ、多い順の上位を得る */
  private async topEntries(
    redis: AnomalyRedisClient,
    base: string,
    minutes: number[],
    dimension: 'ip' | 'user' | 'signal'
  ): Promise<RankedEntry[]> {
    const totals = new Map<string, number>();
    for (const m of minutes) {
      const flat = await redis.zrange(`${base}:${m}:${dimension}`, 0, -1, 'WITHSCORES');
      for (let i = 0; i + 1 < flat.length; i += 2) {
        const member = flat[i]!;
        totals.set(member, (totals.get(member) ?? 0) + (Number(flat[i + 1]) || 0));
      }
    }
    return [...totals.entries()]
      .map(([member, count]) => ({ member, count }))
      .sort((a, b) => b.count - a.count || a.member.localeCompare(b.member))
      .slice(0, ANOMALY_TOP_ENTRIES);
  }

  private warnUnavailable(group: SecurityAlertGroup, reason: string): void {
    const nowMs = this.now();
    if (nowMs - this.lastUnavailableWarningAt < UNAVAILABLE_WARNING_INTERVAL_MS) {
      return;
    }
    this.lastUnavailableWarningAt = nowMs;
    logger.warn(
      { anomaly: group, reason },
      'Redis is unavailable; security anomaly observations are dropped'
    );
  }
}

/** 溢れ分の添え書き（件数・期間・種類ごとの内訳） */
function formatOverflow(overflow: OverflowRecord): string {
  const known = SECURITY_ALERT_GROUPS.filter((group) => (overflow.groups[group] ?? 0) > 0);
  const unknown = Object.keys(overflow.groups)
    .filter((name) => !(SECURITY_ALERT_GROUPS as readonly string[]).includes(name))
    .sort();
  const breakdown = [
    ...known.map((group) => `${GROUP_LABELS[group]}（${group}）: ${overflow.groups[group]} 件`),
    ...unknown.map((name) => `${name}: ${overflow.groups[name]} 件`),
  ];
  return (
    `上限により送らなかった通知: ${overflow.count} 件（期間 ${new Date(overflow.since).toISOString()} 〜 ` +
    `${new Date(overflow.last).toISOString()}、内訳 ${breakdown.length > 0 ? breakdown.join(', ') : 'なし'}）`
  );
}

function formatEntries(entries: RankedEntry[]): string {
  return entries.length === 0
    ? 'なし'
    : entries.map((entry) => `${entry.member}（${entry.count} 件）`).join(', ');
}

/** 共有の通知の手段（初めて通知するときに組み立てる。読み込みの連鎖を軽く保つ） */
async function createSharedNotifier(): Promise<AdminNotifier> {
  const [{ AdminNotificationService }, { EmailService }, { default: getPrismaClient }] =
    await Promise.all([
      import('./admin-notification.service.js'),
      import('./email.service.js'),
      import('../db.js'),
    ]);
  return new AdminNotificationService(getPrismaClient(), new EmailService());
}

let sharedNotifier: Promise<AdminNotifier> | null = null;
let sharedMonitor: SecurityAnomalyMonitor | null = null;

/**
 * 認証・権限の検査・閲覧範囲・回数制限・エラー応答・出力の記録が観測を送る共有の部品
 *
 * 初めて使うときに環境変数の閾値で組み立てる。
 */
export function getSharedSecurityAnomalyMonitor(): SecurityAnomalyMonitor {
  if (!sharedMonitor) {
    sharedMonitor = new SecurityAnomalyMonitor({
      getRedisClient: () => redisConnection.getClient(),
      getNotifier: () => {
        sharedNotifier ??= createSharedNotifier();
        return sharedNotifier;
      },
    });
  }
  return sharedMonitor;
}

/**
 * 共有の部品を差し替える（検証で閾値を下げた部品を使うため）。null で既定に戻す
 */
export function setSharedSecurityAnomalyMonitor(monitor: SecurityAnomalyMonitor | null): void {
  sharedMonitor = monitor;
}

/**
 * 観測を共有の部品へ送る。観測の失敗は呼び出し元へ伝えない
 */
export function observeSecurityAnomaly(observation: AnomalyObservation): void {
  try {
    getSharedSecurityAnomalyMonitor().observe(observation);
  } catch (error) {
    logger.warn(
      { err: error, signal: observation.signal },
      'Failed to observe security anomaly; the observation was dropped'
    );
  }
}
