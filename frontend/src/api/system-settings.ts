/**
 * @fileoverview システムの設定の API クライアント（外部の AI での読み取りの停止・再開）
 *
 * estimate-request の design.md の章「Requirements 43-50」の D8（タスク117.1）。
 * `GET/PUT /api/v1/admin/settings/external-ai-reading` は `settings:update` の権限を求める。
 * 変更は読んだ版を送る楽観的排他で、版が違えば 409 `SYSTEM_SETTING_CONFLICT`
 * （本文の `details: { expectedVersion, actualVersion }`）を返す。
 *
 * @module api/system-settings
 */

import { apiClient, ApiError } from './client';

/** 外部の AI での読み取りの設定の経路 */
const EXTERNAL_AI_READING_PATH = '/api/v1/admin/settings/external-ai-reading';

/** 設定の変更の競合の `code` */
export const SYSTEM_SETTING_CONFLICT_CODE = 'SYSTEM_SETTING_CONFLICT';

/**
 * 外部の AI での読み取りの設定（49.5）
 *
 * `version` は楽観的排他の版（行が無いとき 0、作成で 1、変更のたびに 1 ずつ上がる）
 */
export interface ExternalAiReadingSetting {
  enabled: boolean;
  version: number;
}

/**
 * 設定の変更の競合（409 `SYSTEM_SETTING_CONFLICT`）
 *
 * 画面で読んだ後に他の管理者が設定を変えたときに返る。`ApiError`（statusCode 409）を継ぐ。
 * `actualVersion` は今の版で、行の無い状態からの同時の作成がぶつかったときは分からず null
 */
export class SystemSettingConflictError extends ApiError {
  readonly code = SYSTEM_SETTING_CONFLICT_CODE;
  readonly expectedVersion: number | null;
  readonly actualVersion: number | null;

  constructor(
    message: string,
    expectedVersion: number | null,
    actualVersion: number | null,
    response?: unknown
  ) {
    super(409, message, response);
    this.name = 'SystemSettingConflictError';
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

/** 設定の変更の競合か */
export function isSystemSettingConflictError(error: unknown): error is SystemSettingConflictError {
  return error instanceof SystemSettingConflictError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 409 `SYSTEM_SETTING_CONFLICT` を競合の誤りに変える（それ以外はそのまま返す） */
function toSystemSettingError(error: unknown): unknown {
  if (
    error instanceof ApiError &&
    error.statusCode === 409 &&
    isRecord(error.response) &&
    error.response.code === SYSTEM_SETTING_CONFLICT_CODE
  ) {
    const details = isRecord(error.response.details) ? error.response.details : {};
    return new SystemSettingConflictError(
      error.message,
      numberOrNull(details.expectedVersion),
      numberOrNull(details.actualVersion),
      error.response
    );
  }
  return error;
}

/**
 * 外部の AI での読み取りの設定を取得する
 *
 * @returns 有効か否かと版
 * @throws ApiError 権限なし（403）など
 */
export async function getExternalAiReadingSetting(): Promise<ExternalAiReadingSetting> {
  return apiClient.get<ExternalAiReadingSetting>(EXTERNAL_AI_READING_PATH);
}

/**
 * 外部の AI での読み取りを全体で停止・再開する（49.5。変更はサーバーが監査ログに記録する）
 *
 * @param enabled - 有効にするか
 * @param version - 画面で読んだ設定の版
 * @returns 変更後の設定（新しい版）
 * @throws SystemSettingConflictError 読んだ後に他の管理者が変えた（409）
 * @throws ApiError 権限なし（403）・検証の誤り（400）など
 */
export async function updateExternalAiReadingSetting(
  enabled: boolean,
  version: number
): Promise<ExternalAiReadingSetting> {
  try {
    return await apiClient.put<ExternalAiReadingSetting>(EXTERNAL_AI_READING_PATH, {
      enabled,
      version,
    });
  } catch (error) {
    throw toSystemSettingError(error);
  }
}
