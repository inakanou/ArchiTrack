/**
 * @fileoverview 数量表の保存の件数の上限の超過を利用者へ伝える文言の組み立て（単体検証）
 *
 * Task 109.1: 件数の上限を超えた保存の 400 を判定し、上限のメッセージを表示する
 *
 * @requirement quantity-table-generation/REQ-42.12
 *
 * 応答の本文は経路の本文の検証（`validate`）の 400 の形（`code` が `VALIDATION_ERROR`、
 * `details` が問題ごとの `path`・`message`・`code`）を写す。期待値の文言は逐語で書く。
 */

import { describe, it, expect } from 'vitest';
import { ApiError } from '../api/client';
import { describeQuantityTableSaveLimitFailure } from './quantity-table-save-limit-feedback';

const GROUPS_TOO_MANY = '数量グループは1000件以内で保存してください';
const ITEMS_PER_GROUP_TOO_MANY = '一つの数量グループの数量項目は2000件以内で保存してください';
const TOTAL_ITEMS_TOO_MANY = '数量項目は合計5000件以内で保存してください';

/** 経路の本文の検証の 400 と同じ形の例外を作る */
function validationError(
  details: Array<{ path: string; message: string; code: string }>,
  code = 'VALIDATION_ERROR'
): ApiError {
  return new ApiError(400, details[0]?.message ?? 'Validation failed', {
    type: 'https://architrack.example.com/problems/validation-error',
    title: 'Bad Request',
    status: 400,
    detail: details[0]?.message,
    code,
    details,
  });
}

describe('describeQuantityTableSaveLimitFailure', () => {
  describe('件数の上限の超過（42.11 の 3 つの上限）', () => {
    it('数量グループの数（path groups・too_big）の上限のメッセージを返す', () => {
      const error = validationError([
        { path: 'groups', message: GROUPS_TOO_MANY, code: 'too_big' },
      ]);

      expect(describeQuantityTableSaveLimitFailure(error)).toBe(
        '保存できません: 数量グループは1000件以内で保存してください'
      );
    });

    it('一つの数量グループの数量項目の数（path groups.<i>.items・too_big）の上限のメッセージを返す', () => {
      const error = validationError([
        { path: 'groups.3.items', message: ITEMS_PER_GROUP_TOO_MANY, code: 'too_big' },
      ]);

      expect(describeQuantityTableSaveLimitFailure(error)).toBe(
        '保存できません: 一つの数量グループの数量項目は2000件以内で保存してください'
      );
    });

    it('数量項目の総数（path groups・custom）の上限のメッセージを返す', () => {
      const error = validationError([
        { path: 'groups', message: TOTAL_ITEMS_TOO_MANY, code: 'custom' },
      ]);

      expect(describeQuantityTableSaveLimitFailure(error)).toBe(
        '保存できません: 数量項目は合計5000件以内で保存してください'
      );
    });

    it('当たった要素のメッセージを重複なく details の順に並べ、当たらない要素は含めない', () => {
      const error = validationError([
        { path: 'groups.0.items', message: ITEMS_PER_GROUP_TOO_MANY, code: 'too_big' },
        { path: 'name', message: '名前は200文字以内', code: 'too_big' },
        { path: 'groups.5.items', message: ITEMS_PER_GROUP_TOO_MANY, code: 'too_big' },
        { path: 'groups', message: TOTAL_ITEMS_TOO_MANY, code: 'custom' },
      ]);

      expect(describeQuantityTableSaveLimitFailure(error)).toBe(
        '保存できません: 一つの数量グループの数量項目は2000件以内で保存してください、数量項目は合計5000件以内で保存してください'
      );
    });
  });

  describe('件数の上限の超過でない失敗（従来の表示へ委ねる）', () => {
    it('サービスの検証の 400（QUANTITY_TABLE_VALIDATION_ERROR）は当てない', () => {
      const error = validationError(
        [{ path: 'groups', message: GROUPS_TOO_MANY, code: 'too_big' }],
        'QUANTITY_TABLE_VALIDATION_ERROR'
      );

      expect(describeQuantityTableSaveLimitFailure(error)).toBeNull();
    });

    it('42.13 の上限の 400（groups.<i>.items.<j>.* の too_big・custom）は path の前方一致で当てない', () => {
      const error = validationError([
        {
          path: 'groups.0.items.0.tempId',
          message: '仮IDは1文字以上100文字以内で指定してください',
          code: 'too_big',
        },
        {
          path: 'groups.0.items.1.remarks',
          message: '備考は全角25文字/半角50文字以内で入力してください',
          code: 'too_big',
        },
        {
          path: 'groups.0.items.2.calculationParams',
          message: '計算用パラメータは10項目以内で指定してください',
          code: 'custom',
        },
        {
          path: 'groups.1.tempId',
          message: '仮IDは1文字以上100文字以内で指定してください',
          code: 'too_big',
        },
      ]);

      expect(describeQuantityTableSaveLimitFailure(error)).toBeNull();
    });

    it('path が当たっても code が上限の種別でなければ当てない（groups の型の違い、items の custom）', () => {
      const error = validationError([
        { path: 'groups', message: 'Invalid input: expected array', code: 'invalid_type' },
        { path: 'groups.0.items', message: '別の検証', code: 'custom' },
      ]);

      expect(describeQuantityTableSaveLimitFailure(error)).toBeNull();
    });

    it('groups.<数字>.items の数字の部分が数字でなければ当てない', () => {
      const error = validationError([
        { path: 'groups.x.items', message: ITEMS_PER_GROUP_TOO_MANY, code: 'too_big' },
      ]);

      expect(describeQuantityTableSaveLimitFailure(error)).toBeNull();
    });

    it('409・404・500 は当てない', () => {
      const details = [{ path: 'groups', message: GROUPS_TOO_MANY, code: 'too_big' }];
      for (const status of [409, 404, 500]) {
        const error = new ApiError(status, 'failed', { code: 'VALIDATION_ERROR', details });
        expect(describeQuantityTableSaveLimitFailure(error)).toBeNull();
      }
    });

    it('details を持たない 400 と ApiError でない例外は当てない', () => {
      expect(
        describeQuantityTableSaveLimitFailure(
          new ApiError(400, 'Validation error', { code: 'VALIDATION_ERROR' })
        )
      ).toBeNull();
      expect(
        describeQuantityTableSaveLimitFailure(new ApiError(400, 'Validation error'))
      ).toBeNull();
      expect(describeQuantityTableSaveLimitFailure(new Error(GROUPS_TOO_MANY))).toBeNull();
    });
  });
});
