/**
 * Claude Vision API固有のエラークラス
 *
 * Requirements:
 * - 23.1: タイムアウトエラー（30秒）
 * - 23.2: レート制限エラー（429）
 * - 23.3: 認証エラー（401）
 * - 23.4: レスポンスパースエラー
 * - 23.5: 汎用エラー
 * - 23.7: エラー種別レスポンス
 *
 * @module errors/claudeVisionError
 */
import { ApiError } from './apiError.js';
import type { ProblemDetails } from '../types/problem-details.js';

/**
 * Claude Vision APIのエラー種別
 */
export type ClaudeVisionErrorType =
  'timeout' | 'rate_limit' | 'auth_error' | 'parse_error' | 'service_unavailable' | 'unknown';

/**
 * Claude Vision API固有のエラークラス
 * 既存のApiErrorを拡張し、errorTypeプロパティを追加
 *
 * コンストラクタの引数順序は既存ApiError（statusCode, message, code?, details?, problemType?）に合わせる
 */
export class ClaudeVisionError extends ApiError {
  readonly errorType: ClaudeVisionErrorType;

  constructor(
    statusCode: number,
    message: string,
    errorType: ClaudeVisionErrorType,
    code?: string,
    details?: unknown,
    problemType?: string
  ) {
    super(statusCode, message, code, details, problemType);
    this.errorType = errorType;
    this.name = 'ClaudeVisionError';
  }

  /**
   * タイムアウトエラーを生成
   * Requirements: 23.1
   */
  static timeout(): ClaudeVisionError {
    return new ClaudeVisionError(
      504,
      'Claude Vision APIリクエストがタイムアウトしました（30秒）',
      'timeout',
      'CLAUDE_VISION_TIMEOUT'
    );
  }

  /**
   * レート制限エラーを生成
   * Requirements: 23.2
   */
  static rateLimit(): ClaudeVisionError {
    return new ClaudeVisionError(
      429,
      'Claude Vision APIのレート制限に達しました。しばらく待ってからリトライしてください',
      'rate_limit',
      'CLAUDE_VISION_RATE_LIMIT'
    );
  }

  /**
   * 認証エラーを生成
   * Requirements: 23.3
   */
  static authError(): ClaudeVisionError {
    return new ClaudeVisionError(
      401,
      'Claude Vision APIの認証に失敗しました。APIキーが無効です',
      'auth_error',
      'CLAUDE_VISION_AUTH_ERROR'
    );
  }

  /**
   * パースエラーを生成
   * Requirements: 23.4
   */
  static parseError(): ClaudeVisionError {
    return new ClaudeVisionError(
      422,
      'Claude Vision APIのレスポンスから構造化データを抽出できませんでした',
      'parse_error',
      'CLAUDE_VISION_PARSE_ERROR'
    );
  }

  /**
   * サービス利用不可エラーを生成
   * Requirements: 22.6
   */
  static serviceUnavailable(): ClaudeVisionError {
    return new ClaudeVisionError(
      503,
      'Claude Vision機能は無効です（ANTHROPIC_API_KEY未設定）',
      'service_unavailable',
      'CLAUDE_VISION_SERVICE_UNAVAILABLE'
    );
  }

  /**
   * 汎用エラーを生成
   * Requirements: 23.5
   */
  static unknown(originalMessage: string): ClaudeVisionError {
    return new ClaudeVisionError(
      500,
      `Claude Vision APIで予期しないエラーが発生しました: ${originalMessage}`,
      'unknown',
      'CLAUDE_VISION_UNKNOWN'
    );
  }

  /**
   * RFC 7807形式でエラー情報を返す
   * errorTypeフィールドを含む
   * Requirements: 23.7
   */
  override toProblemDetails(instance?: string): ProblemDetails {
    const problemDetails = super.toProblemDetails(instance);
    problemDetails.errorType = this.errorType;
    return problemDetails;
  }

  /**
   * JSON形式でエラー情報を返す
   * errorTypeフィールドを含む
   * Requirements: 23.7
   */
  override toJSON(): Record<string, unknown> {
    const json = super.toJSON();
    json.errorType = this.errorType;
    return json;
  }
}
