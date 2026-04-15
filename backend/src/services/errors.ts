/**
 * Service-layer error definitions.
 *
 * This module holds strongly-typed Error subclasses shared across services.
 * Each error carries a stable string `code` so upper layers (routes, loggers,
 * API error handlers) can branch deterministically without relying on message
 * string matching.
 */

/**
 * Stable error code constant for thumbnail regeneration failures.
 * Exported separately so callers can reference the code without importing
 * the class itself (e.g. when pattern-matching on serialized errors).
 */
export const THUMBNAIL_REGENERATION_FAILED = 'THUMBNAIL_REGENERATION_FAILED';

/**
 * Thrown when regenerating an image thumbnail fails (e.g. during image edit
 * re-processing). Preserves the original failure via the standard `cause`
 * option so root-cause diagnostics stay intact.
 *
 * @see Requirement 23.6 — 画像編集時のサムネイル再生成確実化
 */
export class ThumbnailRegenerationError extends Error {
  readonly code = THUMBNAIL_REGENERATION_FAILED;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ThumbnailRegenerationError';
  }
}
