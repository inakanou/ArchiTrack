/**
 * @fileoverview 見積明細の一括保存の上限の超過を利用者へ伝える文言の組み立て（単体検証）
 *
 * Task 68.1: 保存の上限の超過の 422 と 400 を判定し、上限のメッセージを表示する
 *
 * @requirement estimate-creation/REQ-42.13
 *
 * 応答の本文は、一括保存の経路の 2 つの形を写す。
 * - 件数・深さの上限の 422: `EstimateDraftValidationError`（`code` が `ESTIMATE_DRAFT_VALIDATION_ERROR`、
 *   `details.issues` が `path`・`message` の組。要素は `code` を持たない）
 * - 備考の文字数の上限の 400: 本文の検証（`validate`）の 400（`code` が `VALIDATION_ERROR`、
 *   `details` が問題ごとの `path`・`message`・`code` の配列）
 *
 * 期待値の文言は逐語で書く。
 */

import { describe, it, expect } from 'vitest';
import { ApiError } from '../api/client';
import {
  describeEstimateCreateLimitFailure,
  describeEstimateSaveLimitFailure,
} from './estimate-save-limit-feedback';

const ITEMS_TOO_MANY = '見積明細は合計2000件以内で保存してください';
const ITEMS_TOO_DEEP = '見積項目の階層は100段以内で保存してください';
const REMARKS_TOO_LONG = '備考は2000文字以内で入力してください';
const DRAFT_SUMMARY = '見積明細の入力内容に不備があるため保存できません';

/** 一括保存の 422（EstimateDraftValidationError）と同じ形の例外を作る */
function draftValidationError(
  issues: Array<{ path: string; message: string }>,
  code = 'ESTIMATE_DRAFT_VALIDATION_ERROR',
  statusCode = 422
): ApiError {
  return new ApiError(statusCode, DRAFT_SUMMARY, {
    type: 'https://architrack.example.com/problems/validation-error',
    title: 'Unprocessable Entity',
    status: statusCode,
    detail: DRAFT_SUMMARY,
    code,
    details: { issues },
  });
}

/** 経路の本文の検証の 400 と同じ形の例外を作る */
function validationError(
  details: Array<{ path: string; message: string; code: string }>,
  code = 'VALIDATION_ERROR',
  statusCode = 400
): ApiError {
  return new ApiError(statusCode, details[0]?.message ?? 'Validation failed', {
    type: 'https://architrack.example.com/problems/validation-error',
    title: 'Bad Request',
    status: statusCode,
    detail: details[0]?.message,
    code,
    details,
  });
}

describe('describeEstimateSaveLimitFailure', () => {
  describe('上限の超過（42.10〜42.12）', () => {
    it('件数の上限の 422（path items）は上限のメッセージを返し、要約の文言を含めない', () => {
      const error = draftValidationError([{ path: 'items', message: ITEMS_TOO_MANY }]);

      expect(describeEstimateSaveLimitFailure(error)).toBe(
        '保存できません: 見積明細は合計2000件以内で保存してください'
      );
    });

    it('深さの上限の 422（path items）は上限のメッセージを返す', () => {
      const error = draftValidationError([{ path: 'items', message: ITEMS_TOO_DEEP }]);

      expect(describeEstimateSaveLimitFailure(error)).toBe(
        '保存できません: 見積項目の階層は100段以内で保存してください'
      );
    });

    it('備考の文字数の上限の 400（根の見積項目の行の remarks・too_big）は上限のメッセージを返す', () => {
      const error = validationError([
        { path: 'items.0.lines.1.remarks', message: REMARKS_TOO_LONG, code: 'too_big' },
      ]);

      expect(describeEstimateSaveLimitFailure(error)).toBe(
        '保存できません: 備考は2000文字以内で入力してください'
      );
    });

    it('備考の文字数の上限の 400 は子孫の節点（children を重ねた path）でも当て、重複を除く', () => {
      const error = validationError([
        {
          path: 'items.2.children.0.children.13.lines.0.remarks',
          message: REMARKS_TOO_LONG,
          code: 'too_big',
        },
        { path: 'items.0.children.4.lines.2.remarks', message: REMARKS_TOO_LONG, code: 'too_big' },
      ]);

      expect(describeEstimateSaveLimitFailure(error)).toBe(
        '保存できません: 備考は2000文字以内で入力してください'
      );
    });

    it('422 の当たった問題のメッセージを重複なく応答の順に「、」でつなぎ、当たらない問題は含めない', () => {
      const error = draftValidationError([
        { path: 'items', message: ITEMS_TOO_DEEP },
        { path: 'items.0.children', message: '別の構造の問題' },
        { path: 'items', message: ITEMS_TOO_MANY },
        { path: 'items', message: ITEMS_TOO_DEEP },
      ]);

      expect(describeEstimateSaveLimitFailure(error)).toBe(
        '保存できません: 見積項目の階層は100段以内で保存してください、見積明細は合計2000件以内で保存してください'
      );
    });

    it('400 の当たった問題だけを並べ、他の欄の問題は含めない', () => {
      const error = validationError([
        { path: 'items.0.lines.0.name', message: '名称は200文字以内', code: 'too_big' },
        { path: 'items.0.lines.0.remarks', message: REMARKS_TOO_LONG, code: 'too_big' },
      ]);

      expect(describeEstimateSaveLimitFailure(error)).toBe(
        '保存できません: 備考は2000文字以内で入力してください'
      );
    });
  });

  describe('上限の超過でない失敗（従来の表示へ委ねる）', () => {
    it('属さない ID（items.<uuid>）・仮 ID の解決の失敗（items.<tempId>）・構造の検証の 422 は当てない', () => {
      const error = draftValidationError([
        {
          path: 'items.6f1c2a3b-0000-4000-8000-000000000001',
          message: 'この見積書に属さない見積項目が含まれています',
        },
        { path: 'items.temp-1', message: '仮IDを解決できません' },
        { path: 'items.0.children.1.id', message: '見積項目のIDが重複しています' },
        { path: 'items.0.lines', message: '行の種別が不正です' },
        { path: 'itemsX', message: ITEMS_TOO_MANY },
      ]);

      expect(describeEstimateSaveLimitFailure(error)).toBeNull();
    });

    it('422 でもコードが ESTIMATE_DRAFT_VALIDATION_ERROR でなければ当てない', () => {
      const error = draftValidationError(
        [{ path: 'items', message: ITEMS_TOO_MANY }],
        'VALIDATION_ERROR'
      );

      expect(describeEstimateSaveLimitFailure(error)).toBeNull();
    });

    it('422 の形（details.issues）を 400 で受けても当てない', () => {
      const error = draftValidationError(
        [{ path: 'items', message: ITEMS_TOO_MANY }],
        'ESTIMATE_DRAFT_VALIDATION_ERROR',
        400
      );

      expect(describeEstimateSaveLimitFailure(error)).toBeNull();
    });

    it('他の欄の too_big の 400（名称・規格・単位・業者名・仮 ID）は当てない', () => {
      const error = validationError([
        { path: 'items.0.lines.0.name', message: '名称は200文字以内', code: 'too_big' },
        { path: 'items.0.lines.0.specification', message: '規格は200文字以内', code: 'too_big' },
        { path: 'items.0.lines.0.unit', message: '単位は50文字以内', code: 'too_big' },
        {
          path: 'items.0.lines.0.sourceVendorName',
          message: '業者名は200文字以内',
          code: 'too_big',
        },
        { path: 'items.0.tempId', message: '仮IDは100文字以内', code: 'too_big' },
      ]);

      expect(describeEstimateSaveLimitFailure(error)).toBeNull();
    });

    it('備考の path でも code が too_big でなければ当てない', () => {
      const error = validationError([
        {
          path: 'items.0.lines.0.remarks',
          message: 'Invalid input: expected string',
          code: 'invalid_type',
        },
      ]);

      expect(describeEstimateSaveLimitFailure(error)).toBeNull();
    });

    it('備考の path の形が完全一致しなければ当てない（数字でない番号、前後の付け足し）', () => {
      const error = validationError([
        { path: 'items.x.lines.0.remarks', message: REMARKS_TOO_LONG, code: 'too_big' },
        { path: 'items.0.lines.0.remarks.extra', message: REMARKS_TOO_LONG, code: 'too_big' },
        { path: 'prefix.items.0.lines.0.remarks', message: REMARKS_TOO_LONG, code: 'too_big' },
        { path: 'items.0.children.lines.0.remarks', message: REMARKS_TOO_LONG, code: 'too_big' },
      ]);

      expect(describeEstimateSaveLimitFailure(error)).toBeNull();
    });

    it('400 でもコードが VALIDATION_ERROR でなければ当てない', () => {
      const error = validationError(
        [{ path: 'items.0.lines.0.remarks', message: REMARKS_TOO_LONG, code: 'too_big' }],
        'ESTIMATE_DRAFT_VALIDATION_ERROR'
      );

      expect(describeEstimateSaveLimitFailure(error)).toBeNull();
    });

    it('409・404・500 は当てない', () => {
      for (const status of [409, 404, 500]) {
        expect(
          describeEstimateSaveLimitFailure(
            draftValidationError([{ path: 'items', message: ITEMS_TOO_MANY }], undefined, status)
          )
        ).toBeNull();
        expect(
          describeEstimateSaveLimitFailure(
            validationError(
              [{ path: 'items.0.lines.0.remarks', message: REMARKS_TOO_LONG, code: 'too_big' }],
              undefined,
              status
            )
          )
        ).toBeNull();
      }
    });

    it('本文を持たない 422・400、details の形が違う応答、ApiError でない例外は当てない', () => {
      expect(describeEstimateSaveLimitFailure(new ApiError(422, DRAFT_SUMMARY))).toBeNull();
      expect(describeEstimateSaveLimitFailure(new ApiError(400, 'Validation error'))).toBeNull();
      expect(
        describeEstimateSaveLimitFailure(
          new ApiError(422, DRAFT_SUMMARY, {
            code: 'ESTIMATE_DRAFT_VALIDATION_ERROR',
            details: [{ path: 'items', message: ITEMS_TOO_MANY }],
          })
        )
      ).toBeNull();
      expect(
        describeEstimateSaveLimitFailure(
          new ApiError(400, REMARKS_TOO_LONG, {
            code: 'VALIDATION_ERROR',
            details: { issues: [{ path: 'items.0.lines.0.remarks', message: REMARKS_TOO_LONG }] },
          })
        )
      ).toBeNull();
      expect(describeEstimateSaveLimitFailure(new Error(ITEMS_TOO_MANY))).toBeNull();
    });
  });
});

/**
 * Task 69.2: 内訳書からの見積書の作成（`POST /api/projects/:projectId/estimates`）が件数の上限
 * （Requirement 3.6）で拒まれた 422 は、一括保存の件数・深さの 422 と同じ形（同じ例外の
 * `EstimateDraftValidationError`）である。判定は 42.13 の 422 と同じ条件で、書き出しだけが違う。
 *
 * @requirement estimate-creation/REQ-3.7
 */
describe('describeEstimateCreateLimitFailure', () => {
  describe('作成の件数の上限の超過（3.6）', () => {
    it('件数の上限の 422（path items）は「見積書を作成できません: 」に上限のメッセージを続け、要約の文言を含めない', () => {
      const error = draftValidationError([{ path: 'items', message: ITEMS_TOO_MANY }]);

      expect(describeEstimateCreateLimitFailure(error)).toBe(
        '見積書を作成できません: 見積明細は合計2000件以内で保存してください'
      );
    });

    it('当たった問題のメッセージを重複なく応答の順に「、」でつなぎ、当たらない問題は含めない', () => {
      const error = draftValidationError([
        { path: 'items', message: ITEMS_TOO_MANY },
        { path: 'items.0', message: '別の構造の問題' },
        { path: 'items', message: ITEMS_TOO_DEEP },
        { path: 'items', message: ITEMS_TOO_MANY },
      ]);

      expect(describeEstimateCreateLimitFailure(error)).toBe(
        '見積書を作成できません: 見積明細は合計2000件以内で保存してください、見積項目の階層は100段以内で保存してください'
      );
    });
  });

  describe('作成の件数の上限の超過でない失敗（従来の表示へ委ねる）', () => {
    it('path が items に完全一致しない 422 は当てない', () => {
      const error = draftValidationError([
        {
          path: 'items.6f1c2a3b-0000-4000-8000-000000000001',
          message: 'この見積書に属さない見積項目が含まれています',
        },
        { path: 'items.temp-1', message: '仮IDを解決できません' },
        { path: 'itemsX', message: ITEMS_TOO_MANY },
      ]);

      expect(describeEstimateCreateLimitFailure(error)).toBeNull();
    });

    it('422 でもコードが ESTIMATE_DRAFT_VALIDATION_ERROR でなければ当てない', () => {
      const error = draftValidationError(
        [{ path: 'items', message: ITEMS_TOO_MANY }],
        'VALIDATION_ERROR'
      );

      expect(describeEstimateCreateLimitFailure(error)).toBeNull();
    });

    it('備考の文字数の上限の 400 は当てない（作成の要求は備考を送らず、保存の上限だけの判定）', () => {
      const error = validationError([
        { path: 'items.0.lines.0.remarks', message: REMARKS_TOO_LONG, code: 'too_big' },
      ]);

      expect(describeEstimateCreateLimitFailure(error)).toBeNull();
    });

    it('409・404・400・500 は、422 と同じ本文でも当てない', () => {
      for (const status of [409, 404, 400, 500]) {
        expect(
          describeEstimateCreateLimitFailure(
            draftValidationError([{ path: 'items', message: ITEMS_TOO_MANY }], undefined, status)
          )
        ).toBeNull();
      }
    });

    it('本文を持たない 422、details の形が違う応答、ApiError でない例外は当てない', () => {
      expect(describeEstimateCreateLimitFailure(new ApiError(422, DRAFT_SUMMARY))).toBeNull();
      expect(
        describeEstimateCreateLimitFailure(
          new ApiError(422, DRAFT_SUMMARY, {
            code: 'ESTIMATE_DRAFT_VALIDATION_ERROR',
            details: [{ path: 'items', message: ITEMS_TOO_MANY }],
          })
        )
      ).toBeNull();
      expect(describeEstimateCreateLimitFailure(new Error(ITEMS_TOO_MANY))).toBeNull();
    });
  });
});
