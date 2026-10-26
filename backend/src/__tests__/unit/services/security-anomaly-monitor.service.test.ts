/**
 * @fileoverview SecurityAnomalyMonitor の単体テスト（user-authentication タスク55.4、60.1）
 *
 * Requirements (user-authentication):
 * - REQ-39.7: 閲覧範囲外へのアクセスの観測を権限の拒否と合わせて数える
 * - REQ-43.1: ログインの失敗の件数が時間窓で閾値を超えると全システム管理者へ通知する
 * - REQ-43.2: 権限の拒否と閲覧範囲外へのアクセスの件数が閾値を超えると通知する
 * - REQ-43.3: 429 と 5xx の件数が閾値を超えると通知する
 * - REQ-43.4: 同一利用者のデータ出力の件数が閾値を超えると通知する
 * - REQ-43.5: 通知に検知の種類・期間・件数・主な送信元と利用者を含める
 * - REQ-43.6: 同じ種類の通知を抑止の時間内に重複して送らない
 * - REQ-43.7: 閾値・時間窓・抑止の時間を環境変数で変えられる
 *
 * Redis は分単位の桶・ソート済み集合・NX EX の SET・ハッシュ・MULTI を解釈する最小の擬似で代え、
 * 時刻は注入で進める（MULTI は他の操作と交わらずに一度に適用する）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SecurityAnomalyMonitor,
  anomalyGroupOf,
  type AnomalyObservation,
  type AnomalyRecordOutcome,
  type AnomalyRedisClient,
} from '../../../services/security-anomaly-monitor.service.js';
import {
  DEFAULT_SECURITY_ALERT_CONFIG,
  loadSecurityAlertConfig,
  type SecurityAlertConfig,
} from '../../../config/security-alert.js';
import type { AdminNotification } from '../../../services/admin-notification.service.js';
import logger from '../../../utils/logger.js';

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../redis.js', () => ({
  default: { getClient: vi.fn(() => null) },
}));

/** 擬似の時計（ミリ秒） */
function createClock(start = Date.UTC(2026, 9, 25, 0, 0, 0)) {
  let current = start;
  return {
    now: () => current,
    advanceSeconds: (seconds: number) => {
      current += seconds * 1000;
    },
  };
}

/** 計数に使う操作だけを解釈し、有効期限を擬似の時計で判定する Redis */
function createFakeRedis(clock: { now: () => number }) {
  const strings = new Map<string, string>();
  const zsets = new Map<string, Map<string, number>>();
  const hashes = new Map<string, Map<string, number>>();
  const expiresAt = new Map<string, number>();

  const alive = (key: string): boolean => {
    const at = expiresAt.get(key);
    if (at !== undefined && at <= clock.now()) {
      strings.delete(key);
      zsets.delete(key);
      hashes.delete(key);
      expiresAt.delete(key);
      return false;
    }
    return strings.has(key) || zsets.has(key) || hashes.has(key);
  };

  // 同期の中核（MULTI はこれを一度に適用し、他の観測の操作と交わらない）
  const core = {
    incr: (key: string) => core.incrby(key, 1),
    incrby: (key: string, increment: number) => {
      const value = (alive(key) ? parseInt(strings.get(key)!, 10) : 0) + increment;
      strings.set(key, String(value));
      return value;
    },
    expire: (key: string, seconds: number) => {
      if (!alive(key)) return 0;
      expiresAt.set(key, clock.now() + seconds * 1000);
      return 1;
    },
    get: (key: string) => (alive(key) ? (strings.get(key) ?? null) : null),
    set: (key: string, value: string, ...args: (string | number)[]) => {
      const nx = args.includes('NX');
      const exAt = args.indexOf('EX');
      if (nx && alive(key)) return null;
      strings.set(key, value);
      if (exAt >= 0) {
        expiresAt.set(key, clock.now() + Number(args[exAt + 1]) * 1000);
      } else {
        expiresAt.delete(key);
      }
      return 'OK';
    },
    del: (...keys: string[]) => {
      let removed = 0;
      for (const key of keys) {
        if (alive(key)) removed++;
        strings.delete(key);
        zsets.delete(key);
        hashes.delete(key);
        expiresAt.delete(key);
      }
      return removed;
    },
    hincrby: (key: string, field: string, increment: number) => {
      if (!alive(key)) hashes.set(key, new Map());
      const hash = hashes.get(key)!;
      hash.set(field, (hash.get(field) ?? 0) + increment);
      return hash.get(field)!;
    },
    hgetall: (key: string) =>
      alive(key)
        ? Object.fromEntries([...hashes.get(key)!.entries()].map(([f, v]) => [f, String(v)]))
        : {},
  };

  const client = {
    status: 'ready',
    incr: vi.fn(async (key: string) => core.incr(key)),
    expire: vi.fn(async (key: string, seconds: number) => core.expire(key, seconds)),
    zincrby: vi.fn(async (key: string, increment: number, member: string) => {
      if (!alive(key)) zsets.set(key, new Map());
      const set = zsets.get(key)!;
      set.set(member, (set.get(member) ?? 0) + increment);
      return String(set.get(member));
    }),
    mget: vi.fn(async (...keys: string[]) => keys.map((key) => core.get(key))),
    get: vi.fn(async (key: string) => core.get(key)),
    del: vi.fn(async (...keys: string[]) => core.del(...keys)),
    set: vi.fn(async (key: string, value: string, ...args: (string | number)[]) =>
      core.set(key, value, ...args)
    ),
    zrange: vi.fn(async (key: string) => {
      if (!alive(key)) return [];
      return [...zsets.get(key)!.entries()].flatMap(([member, score]) => [member, String(score)]);
    }),
    multi: vi.fn(() => {
      const queued: (() => unknown)[] = [];
      const chain: Record<string, unknown> = {};
      for (const name of Object.keys(core) as (keyof typeof core)[]) {
        chain[name] = (...args: unknown[]) => {
          queued.push(() => (core[name] as (...a: unknown[]) => unknown)(...args));
          return chain;
        };
      }
      chain.exec = async () => queued.map((op) => [null, op()]);
      return chain;
    }),
    /** 検証用: 鍵の中身を覗く */
    peek: (key: string) => (hashes.has(key) ? core.hgetall(key) : core.get(key)),
  };
  return client;
}

function config(overrides: Partial<SecurityAlertConfig> = {}): SecurityAlertConfig {
  return { ...DEFAULT_SECURITY_ALERT_CONFIG, ...overrides };
}

const LOW = { threshold: 3, windowSeconds: 300, cooldownSeconds: 1800 };

describe('SecurityAnomalyMonitor', () => {
  let clock: ReturnType<typeof createClock>;
  let redis: ReturnType<typeof createFakeRedis>;
  let notifications: AdminNotification[];
  const notifier = {
    notifyAllAdmins: vi.fn(async (n: AdminNotification) => {
      notifications.push(n);
    }),
  };

  function createMonitor(cfg: SecurityAlertConfig): SecurityAnomalyMonitor {
    return new SecurityAnomalyMonitor({
      getRedisClient: () => redis as unknown as AnomalyRedisClient,
      getNotifier: () => notifier,
      config: cfg,
      now: clock.now,
      keyPrefix: 'anomaly:',
    });
  }

  async function observeTimes(
    monitor: SecurityAnomalyMonitor,
    times: number,
    observation: AnomalyObservation
  ): Promise<void> {
    for (let i = 0; i < times; i++) {
      monitor.observe(observation);
      await monitor.flush();
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    clock = createClock();
    redis = createFakeRedis(clock);
    notifications = [];
  });

  /**
   * @requirement user-authentication/REQ-43.1
   */
  it('ログインの失敗が閾値を超えた時点で一度だけ全システム管理者へ通知する', async () => {
    const monitor = createMonitor(config({ login_failed: LOW }));
    const failure: AnomalyObservation = {
      signal: 'login_failed',
      sourceIp: '192.0.2.10',
      userId: null,
    };

    await observeTimes(monitor, 3, failure);
    expect(notifier.notifyAllAdmins).not.toHaveBeenCalled();

    await observeTimes(monitor, 1, failure);
    expect(notifier.notifyAllAdmins).toHaveBeenCalledTimes(1);
    expect(notifications[0]!.kind).toBe('SECURITY_ANOMALY');
    expect(notifications[0]!.subject).toContain('ログインの失敗');
  });

  /**
   * @requirement user-authentication/REQ-43.6
   */
  it('同じ種類の通知は抑止の時間内に再送せず、抑止の時間が過ぎて続いていれば再び通知する', async () => {
    const monitor = createMonitor(
      config({ login_failed: { threshold: 3, windowSeconds: 600, cooldownSeconds: 120 } })
    );
    const failure: AnomalyObservation = {
      signal: 'login_failed',
      sourceIp: '192.0.2.11',
      userId: null,
    };

    await observeTimes(monitor, 4, failure);
    expect(notifier.notifyAllAdmins).toHaveBeenCalledTimes(1);

    // 抑止の時間内は超過が続いても送らない
    await observeTimes(monitor, 10, failure);
    clock.advanceSeconds(119);
    await observeTimes(monitor, 1, failure);
    expect(notifier.notifyAllAdmins).toHaveBeenCalledTimes(1);

    // 抑止の時間が過ぎ、時間窓の件数がまだ閾値を超えていれば再び通知する
    clock.advanceSeconds(2);
    await observeTimes(monitor, 1, failure);
    expect(notifier.notifyAllAdmins).toHaveBeenCalledTimes(2);
  });

  /**
   * @requirement user-authentication/REQ-43.1
   */
  it('時間窓の外へ出た件数は数えない', async () => {
    const monitor = createMonitor(config({ login_failed: LOW }));
    const failure: AnomalyObservation = {
      signal: 'login_failed',
      sourceIp: '192.0.2.12',
      userId: null,
    };

    await observeTimes(monitor, 3, failure);
    clock.advanceSeconds(LOW.windowSeconds + 60);
    await observeTimes(monitor, 3, failure);
    expect(notifier.notifyAllAdmins).not.toHaveBeenCalled();

    await observeTimes(monitor, 1, failure);
    expect(notifier.notifyAllAdmins).toHaveBeenCalledTimes(1);
  });

  /**
   * @requirement user-authentication/REQ-43.2
   * @requirement user-authentication/REQ-39.7
   */
  it('権限の拒否と閲覧範囲外のアクセスは合算して数える', async () => {
    expect(anomalyGroupOf('scope_denied')).toBe('permission_denied');
    const monitor = createMonitor(config({ permission_denied: LOW }));

    await observeTimes(monitor, 2, {
      signal: 'permission_denied',
      sourceIp: '192.0.2.13',
      userId: 'user-a',
    });
    await observeTimes(monitor, 1, {
      signal: 'scope_denied',
      sourceIp: '192.0.2.13',
      userId: 'user-a',
    });
    expect(notifier.notifyAllAdmins).not.toHaveBeenCalled();

    await observeTimes(monitor, 1, {
      signal: 'scope_denied',
      sourceIp: '192.0.2.14',
      userId: 'user-b',
    });
    expect(notifier.notifyAllAdmins).toHaveBeenCalledTimes(1);
    const lines = notifications[0]!.lines.join('\n');
    expect(lines).toContain('内訳: permission_denied（2 件）, scope_denied（2 件）');
  });

  /**
   * @requirement user-authentication/REQ-43.3
   */
  it.each([
    ['rate_limited', '試行回数の制限による拒否（429）'],
    ['server_error', 'サーバーエラー（5xx）'],
  ] as const)('%s の件数が閾値を超えると通知する', async (signal, label) => {
    const monitor = createMonitor(config({ [signal]: LOW }));
    await observeTimes(monitor, 3, { signal, sourceIp: '192.0.2.15', userId: null });
    expect(notifier.notifyAllAdmins).not.toHaveBeenCalled();
    await observeTimes(monitor, 1, { signal, sourceIp: '192.0.2.15', userId: null });
    expect(notifier.notifyAllAdmins).toHaveBeenCalledTimes(1);
    expect(notifications[0]!.subject).toContain(label);
  });

  /**
   * @requirement user-authentication/REQ-43.4
   */
  it('データの出力は利用者ごとに数え、閾値を超えた利用者を通知に含める', async () => {
    const monitor = createMonitor(config({ data_export: LOW }));

    await observeTimes(monitor, 3, {
      signal: 'data_export',
      sourceIp: '192.0.2.16',
      userId: 'user-a',
    });
    await observeTimes(monitor, 3, {
      signal: 'data_export',
      sourceIp: '192.0.2.16',
      userId: 'user-b',
    });
    // 利用者を合わせると 6 件でも、利用者ごとには閾値 3 を超えていない
    expect(notifier.notifyAllAdmins).not.toHaveBeenCalled();

    await observeTimes(monitor, 1, {
      signal: 'data_export',
      sourceIp: '192.0.2.16',
      userId: 'user-a',
    });
    expect(notifier.notifyAllAdmins).toHaveBeenCalledTimes(1);
    const lines = notifications[0]!.lines.join('\n');
    expect(lines).toContain('対象の利用者 ID: user-a');
    expect(lines).toContain('件数: 4 件（閾値 3 件）');
    expect(lines).not.toContain('user-b');
  });

  /**
   * @requirement user-authentication/REQ-43.5
   */
  it('通知に検知の種類・期間・件数・上位 5 件の送信元 IP と利用者 ID を含める', async () => {
    const monitor = createMonitor(
      config({ permission_denied: { threshold: 20, windowSeconds: 300, cooldownSeconds: 1800 } })
    );
    // 送信元 6 か所・利用者 6 名。多い順の上位 5 件だけが載る
    const counts = [6, 5, 4, 3, 2, 1];
    for (const [i, count] of counts.entries()) {
      await observeTimes(monitor, count, {
        signal: 'permission_denied',
        sourceIp: `198.51.100.${i + 1}`,
        userId: `user-${i + 1}`,
      });
    }
    expect(notifier.notifyAllAdmins).toHaveBeenCalledTimes(1);
    const { lines } = notifications[0]!;
    const start = new Date(clock.now() - 4 * 60 * 1000);
    start.setUTCSeconds(0, 0);

    expect(lines).toEqual([
      '検知の種類: 権限の拒否（403）と閲覧範囲外のアクセス（permission_denied）',
      `期間: ${start.toISOString()} 〜 ${new Date(clock.now()).toISOString()}（時間窓 300 秒）`,
      '件数: 21 件（閾値 20 件）',
      '主な送信元 IP: 198.51.100.1（6 件）, 198.51.100.2（5 件）, 198.51.100.3（4 件）, 198.51.100.4（3 件）, 198.51.100.5（2 件）',
      '主な利用者 ID: user-1（6 件）, user-2（5 件）, user-3（4 件）, user-4（3 件）, user-5（2 件）',
      '同じ種類の通知は 1800 秒間送らない',
    ]);
  });

  /**
   * @requirement user-authentication/REQ-43.6
   */
  it('抑止は種類ごとで、別の種類の超過は抑止されない', async () => {
    const monitor = createMonitor(config({ login_failed: LOW, server_error: LOW }));
    await observeTimes(monitor, 4, {
      signal: 'login_failed',
      sourceIp: '192.0.2.17',
      userId: null,
    });
    await observeTimes(monitor, 4, {
      signal: 'server_error',
      sourceIp: '192.0.2.17',
      userId: null,
    });
    expect(notifications.map((n) => n.subject)).toEqual([
      '【重要】セキュリティ上の異常の検知: ログインの失敗',
      '【重要】セキュリティ上の異常の検知: サーバーエラー（5xx）',
    ]);
  });

  /**
   * @requirement user-authentication/REQ-43.7
   */
  it('閾値・時間窓・抑止の時間を環境変数で変えられ、未設定は既定値になる', async () => {
    expect(loadSecurityAlertConfig({})).toEqual(DEFAULT_SECURITY_ALERT_CONFIG);
    expect(DEFAULT_SECURITY_ALERT_CONFIG).toEqual({
      login_failed: { threshold: 20, windowSeconds: 300, cooldownSeconds: 1800 },
      permission_denied: { threshold: 30, windowSeconds: 300, cooldownSeconds: 1800 },
      rate_limited: { threshold: 100, windowSeconds: 300, cooldownSeconds: 1800 },
      server_error: { threshold: 20, windowSeconds: 300, cooldownSeconds: 1800 },
      data_export: { threshold: 50, windowSeconds: 3600, cooldownSeconds: 1800 },
      // 通知の総数の上限（要件43.9）
      notificationLimit: { maxNotifications: 10, windowSeconds: 3600 },
    });

    const fromEnv = loadSecurityAlertConfig({
      SECURITY_ALERT_LOGIN_FAILED_THRESHOLD: '2',
      SECURITY_ALERT_LOGIN_FAILED_WINDOW_SECONDS: '120',
      SECURITY_ALERT_LOGIN_FAILED_COOLDOWN_SECONDS: '60',
      SECURITY_ALERT_DATA_EXPORT_THRESHOLD: '1000000',
    });
    expect(fromEnv.login_failed).toEqual({ threshold: 2, windowSeconds: 120, cooldownSeconds: 60 });
    expect(fromEnv.data_export.threshold).toBe(1000000);

    // 閾値 2 では 3 件目で通知する（既定の 20 なら通知しない件数）
    const monitor = createMonitor(fromEnv);
    const failure: AnomalyObservation = {
      signal: 'login_failed',
      sourceIp: '192.0.2.18',
      userId: null,
    };
    await observeTimes(monitor, 2, failure);
    expect(notifier.notifyAllAdmins).not.toHaveBeenCalled();
    await observeTimes(monitor, 1, failure);
    expect(notifier.notifyAllAdmins).toHaveBeenCalledTimes(1);
  });

  /**
   * @requirement user-authentication/REQ-43.7
   */
  it.each(['0', '-1', '1.5', 'abc'])('正の整数でない設定値 %s を拒否する', (value) => {
    expect(() => loadSecurityAlertConfig({ SECURITY_ALERT_SERVER_ERROR_THRESHOLD: value })).toThrow(
      /SECURITY_ALERT_SERVER_ERROR_THRESHOLD must be a positive integer/
    );
  });

  /**
   * @requirement user-authentication/REQ-43.1
   */
  it('observe は計数を待たずに戻る', async () => {
    let release!: () => void;
    redis.incr.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          release = () => resolve(1);
        })
    );
    const monitor = createMonitor(config({ login_failed: LOW }));
    expect(
      monitor.observe({ signal: 'login_failed', sourceIp: '192.0.2.19', userId: null })
    ).toBeUndefined();
    expect(redis.incr).toHaveBeenCalledTimes(1);
    release();
    await monitor.flush();
    expect(redis.expire).toHaveBeenCalled();
  });

  /**
   * @requirement user-authentication/REQ-43.1
   */
  it('Redis が使えないときは計数を捨てて警告ログを残し、例外を投げない', async () => {
    const monitor = new SecurityAnomalyMonitor({
      getRedisClient: () => null,
      getNotifier: () => notifier,
      config: config({ login_failed: { threshold: 1, windowSeconds: 300, cooldownSeconds: 1800 } }),
      now: clock.now,
    });
    await observeTimes(monitor, 3, {
      signal: 'login_failed',
      sourceIp: '192.0.2.20',
      userId: null,
    });
    expect(notifier.notifyAllAdmins).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ anomaly: 'login_failed', reason: 'not configured' }),
      'Redis is unavailable; security anomaly observations are dropped'
    );
    // 障害の間は要求ごとに警告を重ねない
    expect(logger.warn).toHaveBeenCalledTimes(1);

    redis.incr.mockRejectedValueOnce(new Error('connection lost'));
    const failing = createMonitor(config({ login_failed: LOW }));
    await observeTimes(failing, 1, {
      signal: 'login_failed',
      sourceIp: '192.0.2.20',
      userId: null,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ signal: 'login_failed' }),
      'Failed to record security anomaly observation; the observation was dropped'
    );
  });
});

describe('SecurityAnomalyMonitor の利用者ごとの抑止と通知の総数の上限（タスク60.1）', () => {
  let clock: ReturnType<typeof createClock>;
  let redis: ReturnType<typeof createFakeRedis>;
  let notifications: AdminNotification[];
  const notifier = {
    notifyAllAdmins: vi.fn(async (n: AdminNotification) => {
      notifications.push(n);
    }),
  };

  /** 上限 2 通 / 3600 秒、各群は 1 件を超えると通知する */
  const ONE = { threshold: 1, windowSeconds: 300, cooldownSeconds: 1800 };
  const LIMITED: SecurityAlertConfig = {
    login_failed: ONE,
    permission_denied: ONE,
    rate_limited: ONE,
    server_error: ONE,
    data_export: { threshold: 1, windowSeconds: 3600, cooldownSeconds: 1800 },
    notificationLimit: { maxNotifications: 2, windowSeconds: 3600 },
  };

  function createMonitor(cfg: SecurityAlertConfig = LIMITED): SecurityAnomalyMonitor {
    return new SecurityAnomalyMonitor({
      getRedisClient: () => redis as unknown as AnomalyRedisClient,
      getNotifier: () => notifier,
      config: cfg,
      now: clock.now,
      keyPrefix: 'anomaly:',
    });
  }

  const exportBy = (userId: string): AnomalyObservation => ({
    signal: 'data_export',
    sourceIp: '192.0.2.60',
    userId,
  });

  /** 2 件目で閾値 1 を超える（1 件目は数えるだけ） */
  async function exceed(
    monitor: SecurityAnomalyMonitor,
    observation: AnomalyObservation
  ): Promise<AnomalyRecordOutcome> {
    await monitor.record(observation);
    return monitor.record(observation);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // 上限の時間窓（3600 秒）の始まりちょうどから始める
    clock = createClock(Date.UTC(2026, 9, 26, 0, 0, 0));
    redis = createFakeRedis(clock);
    notifications = [];
  });

  /**
   * @requirement user-authentication/REQ-43.8
   * @requirement user-authentication/REQ-43.6
   */
  it('利用者 A の通知の抑止の時間内でも利用者 B のデータ出力の急増は通知し、A の再度の超過は送らない', async () => {
    const monitor = createMonitor({
      ...LIMITED,
      notificationLimit: { maxNotifications: 100, windowSeconds: 3600 },
    });

    expect(await exceed(monitor, exportBy('user-a'))).toBe('notified');
    clock.advanceSeconds(60);
    expect(await exceed(monitor, exportBy('user-b'))).toBe('notified');
    expect(await monitor.record(exportBy('user-a'))).toBe('suppressed');
    expect(await monitor.record(exportBy('user-b'))).toBe('suppressed');

    expect(notifications).toHaveLength(2);
    expect(notifications[0]!.lines).toContain('対象の利用者 ID: user-a');
    expect(notifications[1]!.lines).toContain('対象の利用者 ID: user-b');
    expect(notifications[1]!.lines).toContain('同じ利用者の同じ種類の通知は 1800 秒間送らない');
    // 抑止の鍵は利用者ごと
    expect(redis.peek('anomaly:notified:data_export:user:user-a')).not.toBeNull();
    expect(redis.peek('anomaly:notified:data_export:user:user-b')).not.toBeNull();
    expect(redis.peek('anomaly:notified:data_export')).toBeNull();
  });

  /**
   * @requirement user-authentication/REQ-43.6
   * @requirement user-authentication/REQ-43.8
   */
  it('データ出力以外の種類の抑止は利用者を問わず種類ごとのまま', async () => {
    const monitor = createMonitor({
      ...LIMITED,
      notificationLimit: { maxNotifications: 100, windowSeconds: 3600 },
    });
    expect(
      await exceed(monitor, { signal: 'permission_denied', sourceIp: null, userId: 'user-a' })
    ).toBe('notified');
    expect(
      await exceed(monitor, { signal: 'permission_denied', sourceIp: null, userId: 'user-b' })
    ).toBe('suppressed');
    expect(notifications).toHaveLength(1);
  });

  /**
   * @requirement user-authentication/REQ-43.9
   */
  it('上限を超えた通知は送らずに溢れ分へ数え、次の時間窓の最初の通知に件数・期間・内訳を添えて溢れ分を消す', async () => {
    const monitor = createMonitor();
    const start = clock.now();

    expect(await exceed(monitor, exportBy('user-a'))).toBe('notified');
    expect(await exceed(monitor, exportBy('user-b'))).toBe('notified');
    clock.advanceSeconds(120);
    expect(await exceed(monitor, exportBy('user-c'))).toBe('capped');
    clock.advanceSeconds(60);
    expect(
      await exceed(monitor, { signal: 'login_failed', sourceIp: '192.0.2.61', userId: null })
    ).toBe('capped');
    expect(notifications).toHaveLength(2);
    expect(redis.peek('anomaly:overflow:count')).toBe('2');

    // 溢れた利用者 C の抑止の鍵は取ったまま（抑止の時間の間は再送しない）
    expect(await monitor.record(exportBy('user-c'))).toBe('suppressed');

    // 次の時間窓の最初の通知に添える
    clock.advanceSeconds(3600);
    expect(await exceed(monitor, exportBy('user-d'))).toBe('notified');
    expect(notifications).toHaveLength(3);
    const appended = notifications[2]!.lines.at(-1)!;
    expect(appended).toBe(
      `上限により送らなかった通知: 2 件（期間 ${new Date(start + 120_000).toISOString()} 〜 ` +
        `${new Date(start + 180_000).toISOString()}、内訳 ログインの失敗（login_failed）: 1 件, ` +
        '同一利用者のデータ出力（data_export）: 1 件）'
    );
    expect(notifications[2]!.lines).toContain('対象の利用者 ID: user-d');

    // 添えた溢れ分は消え、その次の通知には添えない
    expect(redis.peek('anomaly:overflow:count')).toBeNull();
    expect(redis.peek('anomaly:overflow:since')).toBeNull();
    expect(await exceed(monitor, exportBy('user-e'))).toBe('notified');
    expect(notifications[3]!.lines.join('\n')).not.toContain('上限により送らなかった通知');
  });

  /**
   * @requirement user-authentication/REQ-43.9
   */
  it('同時に多数の利用者が急増しても上限の数だけ送り、残りを溢れ分として失わずに数える', async () => {
    const monitor = createMonitor();
    for (let i = 0; i < 12; i++) {
      await monitor.record(exportBy(`user-${i}`));
    }
    const outcomes = await Promise.all(
      Array.from({ length: 12 }, (_, i) => monitor.record(exportBy(`user-${i}`)))
    );
    expect(outcomes.filter((o) => o === 'notified')).toHaveLength(2);
    expect(outcomes.filter((o) => o === 'capped')).toHaveLength(10);
    expect(notifications).toHaveLength(2);
    // 溢れ分は、並行して送られた通知に添えた件数と残りの件数を合わせて 10 件（失わず、二重にも数えない）
    const appended = notifications
      .flatMap((n) => n.lines)
      .map((line) => /^上限により送らなかった通知: (\d+) 件/.exec(line)?.[1])
      .filter((count): count is string => count !== undefined)
      .reduce((sum, count) => sum + Number(count), 0);
    const remaining = Number(redis.peek('anomaly:overflow:count') ?? 0);
    expect(appended + remaining).toBe(10);
    // 残りは次の時間窓の要約で知らせる
    clock.advanceSeconds(3600);
    expect(await monitor.sendOverflowSummary()).toBe(remaining > 0 ? 'sent' : 'none');
    expect(redis.peek('anomaly:overflow:count')).toBeNull();
  });

  /**
   * @requirement user-authentication/REQ-43.9
   */
  it('次の通知が無いまま上限の時間窓が明けると、要約を 1 通だけ送り、要約は上限に数えない', async () => {
    const monitor = createMonitor();
    const start = clock.now();
    await exceed(monitor, exportBy('user-a'));
    await exceed(monitor, exportBy('user-b'));
    clock.advanceSeconds(600);
    expect(await exceed(monitor, exportBy('user-c'))).toBe('capped');

    // 時間窓が明けるまでは送らない
    clock.advanceSeconds(1200);
    expect(await monitor.sendOverflowSummary()).toBe('pending');
    expect(notifications).toHaveLength(2);

    // 時間窓が明けたら 1 通。同時の実行（複数のインスタンス）が重なっても 1 通
    clock.advanceSeconds(1800);
    const outcomes = await Promise.all([
      monitor.sendOverflowSummary(),
      monitor.sendOverflowSummary(),
      monitor.sendOverflowSummary(),
    ]);
    expect(outcomes.filter((o) => o === 'sent')).toHaveLength(1);
    expect(notifications).toHaveLength(3);
    const summary = notifications[2]!;
    expect(summary.kind).toBe('SECURITY_ANOMALY');
    expect(summary.subject).toBe(
      '【重要】セキュリティ上の異常の検知: 上限により送らなかった通知の要約'
    );
    const at = new Date(start + 600_000).toISOString();
    expect(summary.lines).toEqual([
      '異常の通知の総数の上限（3600 秒あたり 2 通）により送らなかった通知の要約',
      `上限により送らなかった通知: 1 件（期間 ${at} 〜 ${at}、内訳 同一利用者のデータ出力（data_export）: 1 件）`,
    ]);

    // 溢れ分は消え、再度の実行では送らない
    expect(await monitor.sendOverflowSummary()).toBe('none');
    expect(notifications).toHaveLength(3);

    // 要約は上限に数えない（この時間窓でも 2 通まで送れる）
    expect(await exceed(monitor, exportBy('user-x'))).toBe('notified');
    expect(await exceed(monitor, exportBy('user-y'))).toBe('notified');
    expect(await exceed(monitor, exportBy('user-z'))).toBe('capped');
  });

  /**
   * @requirement user-authentication/REQ-43.9
   */
  it('溢れ分が無ければ要約を送らない', async () => {
    const monitor = createMonitor();
    await exceed(monitor, exportBy('user-a'));
    clock.advanceSeconds(7200);
    expect(await monitor.sendOverflowSummary()).toBe('none');
    expect(notifications).toHaveLength(1);
  });

  /**
   * @requirement user-authentication/REQ-43.9
   */
  it('添え書きや要約の送信が失敗したときは溢れ分を戻し、件数を失わない', async () => {
    const monitor = createMonitor();
    await exceed(monitor, exportBy('user-a'));
    await exceed(monitor, exportBy('user-b'));
    await exceed(monitor, exportBy('user-c'));
    clock.advanceSeconds(3600);

    notifier.notifyAllAdmins.mockRejectedValueOnce(new Error('notify failed'));
    expect(await exceed(monitor, exportBy('user-d'))).toBe('dropped');
    expect(redis.peek('anomaly:overflow:count')).toBe('1');

    notifier.notifyAllAdmins.mockRejectedValueOnce(new Error('notify failed'));
    await expect(monitor.sendOverflowSummary()).rejects.toThrow('notify failed');
    expect(redis.peek('anomaly:overflow:count')).toBe('1');
    expect(redis.peek('anomaly:overflow:groups')).toEqual({ data_export: '1' });

    expect(await monitor.sendOverflowSummary()).toBe('sent');
    expect(notifications.at(-1)!.lines[1]).toContain('上限により送らなかった通知: 1 件');
  });

  /**
   * @requirement user-authentication/REQ-43.9
   */
  it('Redis が使えないときは要約を送らずに戻る', async () => {
    const monitor = new SecurityAnomalyMonitor({
      getRedisClient: () => null,
      getNotifier: () => notifier,
      config: LIMITED,
      now: clock.now,
    });
    expect(await monitor.sendOverflowSummary()).toBe('unavailable');
    expect(notifier.notifyAllAdmins).not.toHaveBeenCalled();
  });

  /**
   * @requirement user-authentication/REQ-43.9
   * @requirement user-authentication/REQ-43.7
   */
  it('通知の総数の上限と時間窓を環境変数で変えられ、正の整数でない値を拒否する', async () => {
    const fromEnv = loadSecurityAlertConfig({
      SECURITY_ALERT_DATA_EXPORT_THRESHOLD: '1',
      SECURITY_ALERT_NOTIFICATION_LIMIT: '1',
      SECURITY_ALERT_NOTIFICATION_WINDOW_SECONDS: '600',
    });
    expect(fromEnv.notificationLimit).toEqual({ maxNotifications: 1, windowSeconds: 600 });

    // 上限 1 では 2 通目を送らず、600 秒の時間窓が明けると送る
    const monitor = createMonitor(fromEnv);
    expect(await exceed(monitor, exportBy('user-a'))).toBe('notified');
    expect(await exceed(monitor, exportBy('user-b'))).toBe('capped');
    clock.advanceSeconds(600);
    expect(await exceed(monitor, exportBy('user-c'))).toBe('notified');

    for (const value of ['0', '-1', '1.5', 'abc']) {
      expect(() => loadSecurityAlertConfig({ SECURITY_ALERT_NOTIFICATION_LIMIT: value })).toThrow(
        /SECURITY_ALERT_NOTIFICATION_LIMIT must be a positive integer/
      );
      expect(() =>
        loadSecurityAlertConfig({ SECURITY_ALERT_NOTIFICATION_WINDOW_SECONDS: value })
      ).toThrow(/SECURITY_ALERT_NOTIFICATION_WINDOW_SECONDS must be a positive integer/);
    }
  });
});
