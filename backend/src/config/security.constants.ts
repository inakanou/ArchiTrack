/**
 * Security Configuration Constants
 *
 * Centralized security-related configuration values to avoid magic numbers
 * and make security policies easily adjustable.
 */

/**
 * Login security settings
 */
export const LOGIN_SECURITY = {
  /** Maximum number of consecutive login failures before account lock */
  MAX_FAILURES: 5,
  /** Account lock duration in milliseconds (15 minutes) */
  LOCK_DURATION_MS: 15 * 60 * 1000,
  /** Account lock duration in minutes (for display) */
  LOCK_DURATION_MINUTES: 15,
} as const;

/**
 * Two-Factor Authentication security settings
 */
export const TWO_FACTOR_SECURITY = {
  /** Maximum number of consecutive 2FA failures before account lock */
  MAX_FAILURES: 5,
  /** Account lock duration in milliseconds (5 minutes) */
  LOCK_DURATION_MS: 5 * 60 * 1000,
  /** Account lock duration in minutes (for display) */
  LOCK_DURATION_MINUTES: 5,
  /** TOTP code length */
  CODE_LENGTH: 6,
} as const;

/**
 * Password policy settings
 */
export const PASSWORD_POLICY = {
  /** Minimum password length */
  MIN_LENGTH: 12,
  /** Number of previous passwords to check for reuse */
  HISTORY_SIZE: 5,
} as const;

/**
 * Session and token settings
 */
export const SESSION_CONFIG = {
  /** Access token expiry (15 minutes) */
  ACCESS_TOKEN_EXPIRY: '15m',
  /** Refresh token expiry (7 days) */
  REFRESH_TOKEN_EXPIRY: '7d',
  /** Password reset token expiry (1 hour) */
  PASSWORD_RESET_TOKEN_EXPIRY_MS: 60 * 60 * 1000,
} as const;

/**
 * Rate limiting settings
 */
export const RATE_LIMIT = {
  /** General API rate limit (requests per window) */
  API_MAX_REQUESTS: 100,
  /** API rate limit window in milliseconds (15 minutes) */
  API_WINDOW_MS: 15 * 60 * 1000,
  /** Login rate limit (requests per window) */
  LOGIN_MAX_REQUESTS: 5,
  /** Login rate limit window in milliseconds (15 minutes) */
  LOGIN_WINDOW_MS: 15 * 60 * 1000,
  /** Refresh token rate limit (requests per window) */
  REFRESH_MAX_REQUESTS: 10,
  /** Refresh token rate limit window in milliseconds (15 minutes) */
  REFRESH_WINDOW_MS: 15 * 60 * 1000,
} as const;

/**
 * All security constants combined for easy export
 */
export const SECURITY_CONFIG = {
  LOGIN: LOGIN_SECURITY,
  TWO_FACTOR: TWO_FACTOR_SECURITY,
  PASSWORD: PASSWORD_POLICY,
  SESSION: SESSION_CONFIG,
  RATE_LIMIT,
} as const;
