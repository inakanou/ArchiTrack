/**
 * セキュリティ上の異常の検知の閾値・時間窓・抑止の時間（user-authentication タスク55.4、要件43.7）
 *
 * 環境変数 `SECURITY_ALERT_<SIGNAL>_THRESHOLD`・`_WINDOW_SECONDS`・`_COOLDOWN_SECONDS` で環境ごとに変える。
 * 権限の拒否（403）と閲覧範囲外のアクセスは合算して一つの閾値で数える（design.md の SecurityAnomalyMonitor）。
 * 試験・CI の環境は E2E と統合テストの全件の実行で超えない閾値を設定し、途中で通知が流れないようにする。
 *
 * 環境変数の検証（config/env.ts）と検知の部品（SecurityAnomalyMonitor）の両方が同じ規則で読むため、
 * env.ts から切り出して置く（env.ts を部分的に差し替える単体の検証に左右されないようにする）。
 */

import { z } from 'zod';

/** 閾値を数える単位（権限の拒否と範囲外のアクセスは permission_denied に合算する） */
export type SecurityAlertGroup =
  'login_failed' | 'permission_denied' | 'rate_limited' | 'server_error' | 'data_export';

export const SECURITY_ALERT_GROUPS: readonly SecurityAlertGroup[] = [
  'login_failed',
  'permission_denied',
  'rate_limited',
  'server_error',
  'data_export',
];

/** 閾値・時間窓・抑止の時間 */
export interface AnomalyThreshold {
  /** 時間窓の秒数 */
  windowSeconds: number;
  /** 時間窓の件数がこの値を超えたら通知する */
  threshold: number;
  /** 同じ種類の通知を抑止する秒数 */
  cooldownSeconds: number;
}

export type SecurityAlertConfig = Record<SecurityAlertGroup, AnomalyThreshold>;

/** 抑止の時間の既定（全種類で共通） */
export const DEFAULT_SECURITY_ALERT_COOLDOWN_SECONDS = 1800;

/** 既定の閾値と時間窓（design.md の SecurityAnomalyMonitor の節） */
export const DEFAULT_SECURITY_ALERT_CONFIG: SecurityAlertConfig = {
  login_failed: {
    threshold: 20,
    windowSeconds: 300,
    cooldownSeconds: DEFAULT_SECURITY_ALERT_COOLDOWN_SECONDS,
  },
  permission_denied: {
    threshold: 30,
    windowSeconds: 300,
    cooldownSeconds: DEFAULT_SECURITY_ALERT_COOLDOWN_SECONDS,
  },
  rate_limited: {
    threshold: 100,
    windowSeconds: 300,
    cooldownSeconds: DEFAULT_SECURITY_ALERT_COOLDOWN_SECONDS,
  },
  server_error: {
    threshold: 20,
    windowSeconds: 300,
    cooldownSeconds: DEFAULT_SECURITY_ALERT_COOLDOWN_SECONDS,
  },
  data_export: {
    threshold: 50,
    windowSeconds: 3600,
    cooldownSeconds: DEFAULT_SECURITY_ALERT_COOLDOWN_SECONDS,
  },
};

/**
 * 正の整数の秒数・件数の検証スキーマ（未設定・空は既定値）
 */
function positiveIntegerSchema(name: string, defaultValue: number) {
  return z
    .string()
    .optional()
    .transform((val) => (val === undefined || val.trim() === '' ? String(defaultValue) : val))
    .refine((val) => /^[1-9][0-9]*$/.test(val.trim()), {
      message: `${name} must be a positive integer`,
    })
    .transform((val) => parseInt(val, 10));
}

/**
 * 環境変数のスキーマ（env.ts の検証へ組み込む）
 *
 * 変数名は読み手を検索できるよう、組み立てずに字句のまま書く。
 */
export const securityAlertEnvSchema = {
  SECURITY_ALERT_LOGIN_FAILED_THRESHOLD: positiveIntegerSchema(
    'SECURITY_ALERT_LOGIN_FAILED_THRESHOLD',
    DEFAULT_SECURITY_ALERT_CONFIG.login_failed.threshold
  ),
  SECURITY_ALERT_LOGIN_FAILED_WINDOW_SECONDS: positiveIntegerSchema(
    'SECURITY_ALERT_LOGIN_FAILED_WINDOW_SECONDS',
    DEFAULT_SECURITY_ALERT_CONFIG.login_failed.windowSeconds
  ),
  SECURITY_ALERT_LOGIN_FAILED_COOLDOWN_SECONDS: positiveIntegerSchema(
    'SECURITY_ALERT_LOGIN_FAILED_COOLDOWN_SECONDS',
    DEFAULT_SECURITY_ALERT_CONFIG.login_failed.cooldownSeconds
  ),
  SECURITY_ALERT_PERMISSION_DENIED_THRESHOLD: positiveIntegerSchema(
    'SECURITY_ALERT_PERMISSION_DENIED_THRESHOLD',
    DEFAULT_SECURITY_ALERT_CONFIG.permission_denied.threshold
  ),
  SECURITY_ALERT_PERMISSION_DENIED_WINDOW_SECONDS: positiveIntegerSchema(
    'SECURITY_ALERT_PERMISSION_DENIED_WINDOW_SECONDS',
    DEFAULT_SECURITY_ALERT_CONFIG.permission_denied.windowSeconds
  ),
  SECURITY_ALERT_PERMISSION_DENIED_COOLDOWN_SECONDS: positiveIntegerSchema(
    'SECURITY_ALERT_PERMISSION_DENIED_COOLDOWN_SECONDS',
    DEFAULT_SECURITY_ALERT_CONFIG.permission_denied.cooldownSeconds
  ),
  SECURITY_ALERT_RATE_LIMITED_THRESHOLD: positiveIntegerSchema(
    'SECURITY_ALERT_RATE_LIMITED_THRESHOLD',
    DEFAULT_SECURITY_ALERT_CONFIG.rate_limited.threshold
  ),
  SECURITY_ALERT_RATE_LIMITED_WINDOW_SECONDS: positiveIntegerSchema(
    'SECURITY_ALERT_RATE_LIMITED_WINDOW_SECONDS',
    DEFAULT_SECURITY_ALERT_CONFIG.rate_limited.windowSeconds
  ),
  SECURITY_ALERT_RATE_LIMITED_COOLDOWN_SECONDS: positiveIntegerSchema(
    'SECURITY_ALERT_RATE_LIMITED_COOLDOWN_SECONDS',
    DEFAULT_SECURITY_ALERT_CONFIG.rate_limited.cooldownSeconds
  ),
  SECURITY_ALERT_SERVER_ERROR_THRESHOLD: positiveIntegerSchema(
    'SECURITY_ALERT_SERVER_ERROR_THRESHOLD',
    DEFAULT_SECURITY_ALERT_CONFIG.server_error.threshold
  ),
  SECURITY_ALERT_SERVER_ERROR_WINDOW_SECONDS: positiveIntegerSchema(
    'SECURITY_ALERT_SERVER_ERROR_WINDOW_SECONDS',
    DEFAULT_SECURITY_ALERT_CONFIG.server_error.windowSeconds
  ),
  SECURITY_ALERT_SERVER_ERROR_COOLDOWN_SECONDS: positiveIntegerSchema(
    'SECURITY_ALERT_SERVER_ERROR_COOLDOWN_SECONDS',
    DEFAULT_SECURITY_ALERT_CONFIG.server_error.cooldownSeconds
  ),
  SECURITY_ALERT_DATA_EXPORT_THRESHOLD: positiveIntegerSchema(
    'SECURITY_ALERT_DATA_EXPORT_THRESHOLD',
    DEFAULT_SECURITY_ALERT_CONFIG.data_export.threshold
  ),
  SECURITY_ALERT_DATA_EXPORT_WINDOW_SECONDS: positiveIntegerSchema(
    'SECURITY_ALERT_DATA_EXPORT_WINDOW_SECONDS',
    DEFAULT_SECURITY_ALERT_CONFIG.data_export.windowSeconds
  ),
  SECURITY_ALERT_DATA_EXPORT_COOLDOWN_SECONDS: positiveIntegerSchema(
    'SECURITY_ALERT_DATA_EXPORT_COOLDOWN_SECONDS',
    DEFAULT_SECURITY_ALERT_CONFIG.data_export.cooldownSeconds
  ),
};

const securityAlertEnvObject = z.object(securityAlertEnvSchema);

/**
 * 環境変数から閾値・時間窓・抑止の時間を読む
 *
 * @param source 読む環境変数（既定は process.env）
 * @throws 正の整数でない値があるとき（起動時の env.ts の検証が先に止める）
 */
export function loadSecurityAlertConfig(
  source: NodeJS.ProcessEnv = process.env
): SecurityAlertConfig {
  const env = securityAlertEnvObject.parse({
    SECURITY_ALERT_LOGIN_FAILED_THRESHOLD: source.SECURITY_ALERT_LOGIN_FAILED_THRESHOLD,
    SECURITY_ALERT_LOGIN_FAILED_WINDOW_SECONDS: source.SECURITY_ALERT_LOGIN_FAILED_WINDOW_SECONDS,
    SECURITY_ALERT_LOGIN_FAILED_COOLDOWN_SECONDS:
      source.SECURITY_ALERT_LOGIN_FAILED_COOLDOWN_SECONDS,
    SECURITY_ALERT_PERMISSION_DENIED_THRESHOLD: source.SECURITY_ALERT_PERMISSION_DENIED_THRESHOLD,
    SECURITY_ALERT_PERMISSION_DENIED_WINDOW_SECONDS:
      source.SECURITY_ALERT_PERMISSION_DENIED_WINDOW_SECONDS,
    SECURITY_ALERT_PERMISSION_DENIED_COOLDOWN_SECONDS:
      source.SECURITY_ALERT_PERMISSION_DENIED_COOLDOWN_SECONDS,
    SECURITY_ALERT_RATE_LIMITED_THRESHOLD: source.SECURITY_ALERT_RATE_LIMITED_THRESHOLD,
    SECURITY_ALERT_RATE_LIMITED_WINDOW_SECONDS: source.SECURITY_ALERT_RATE_LIMITED_WINDOW_SECONDS,
    SECURITY_ALERT_RATE_LIMITED_COOLDOWN_SECONDS:
      source.SECURITY_ALERT_RATE_LIMITED_COOLDOWN_SECONDS,
    SECURITY_ALERT_SERVER_ERROR_THRESHOLD: source.SECURITY_ALERT_SERVER_ERROR_THRESHOLD,
    SECURITY_ALERT_SERVER_ERROR_WINDOW_SECONDS: source.SECURITY_ALERT_SERVER_ERROR_WINDOW_SECONDS,
    SECURITY_ALERT_SERVER_ERROR_COOLDOWN_SECONDS:
      source.SECURITY_ALERT_SERVER_ERROR_COOLDOWN_SECONDS,
    SECURITY_ALERT_DATA_EXPORT_THRESHOLD: source.SECURITY_ALERT_DATA_EXPORT_THRESHOLD,
    SECURITY_ALERT_DATA_EXPORT_WINDOW_SECONDS: source.SECURITY_ALERT_DATA_EXPORT_WINDOW_SECONDS,
    SECURITY_ALERT_DATA_EXPORT_COOLDOWN_SECONDS: source.SECURITY_ALERT_DATA_EXPORT_COOLDOWN_SECONDS,
  });

  return {
    login_failed: {
      threshold: env.SECURITY_ALERT_LOGIN_FAILED_THRESHOLD,
      windowSeconds: env.SECURITY_ALERT_LOGIN_FAILED_WINDOW_SECONDS,
      cooldownSeconds: env.SECURITY_ALERT_LOGIN_FAILED_COOLDOWN_SECONDS,
    },
    permission_denied: {
      threshold: env.SECURITY_ALERT_PERMISSION_DENIED_THRESHOLD,
      windowSeconds: env.SECURITY_ALERT_PERMISSION_DENIED_WINDOW_SECONDS,
      cooldownSeconds: env.SECURITY_ALERT_PERMISSION_DENIED_COOLDOWN_SECONDS,
    },
    rate_limited: {
      threshold: env.SECURITY_ALERT_RATE_LIMITED_THRESHOLD,
      windowSeconds: env.SECURITY_ALERT_RATE_LIMITED_WINDOW_SECONDS,
      cooldownSeconds: env.SECURITY_ALERT_RATE_LIMITED_COOLDOWN_SECONDS,
    },
    server_error: {
      threshold: env.SECURITY_ALERT_SERVER_ERROR_THRESHOLD,
      windowSeconds: env.SECURITY_ALERT_SERVER_ERROR_WINDOW_SECONDS,
      cooldownSeconds: env.SECURITY_ALERT_SERVER_ERROR_COOLDOWN_SECONDS,
    },
    data_export: {
      threshold: env.SECURITY_ALERT_DATA_EXPORT_THRESHOLD,
      windowSeconds: env.SECURITY_ALERT_DATA_EXPORT_WINDOW_SECONDS,
      cooldownSeconds: env.SECURITY_ALERT_DATA_EXPORT_COOLDOWN_SECONDS,
    },
  };
}
