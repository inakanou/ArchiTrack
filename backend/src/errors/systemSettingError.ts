/**
 * @fileoverview システムの設定のエラークラス
 *
 * estimate-request の design の章「Requirements 43-50」の D8 と Error Handling（設定の変更の競合は 409）。
 */

import { ApiError } from './apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';

/** 競合の詳細（送られた版と今の版。行の作成がぶつかったときは今の版が分からない） */
export interface SystemSettingConflictDetails {
  expectedVersion: number;
  actualVersion?: number;
}

/**
 * システムの設定の楽観的排他の競合（409）
 *
 * 画面で読んだ後に他の管理者が設定を変えたときに返し、再読み込みを促す。
 */
export class SystemSettingConflictError extends ApiError {
  constructor(details: SystemSettingConflictDetails) {
    super(
      409,
      '他の管理者が設定を変更しました。画面を再読み込みしてください',
      'SYSTEM_SETTING_CONFLICT',
      details,
      PROBLEM_TYPES.CONFLICT
    );
    this.name = 'SystemSettingConflictError';
  }
}
