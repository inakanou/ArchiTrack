/**
 * @fileoverview 単価台帳の誤りの定義の単体試験（unit-price-ledger タスク1.4）
 *
 * design.md「Error Handling > Error Categories and Responses」の 413 `LEDGER_IMPORT_TOO_LARGE`・
 * 409 `LEDGER_CONFLICT`・409 `LEDGER_PROJECT_QUOTATION_READ_ONLY` に対応することを確かめる。
 */
import { describe, it, expect } from 'vitest';
import {
  LEDGER_CONFLICT_MESSAGE,
  LedgerConflictError,
  LedgerImportTooLargeError,
  LedgerProjectQuotationReadOnlyError,
} from '../../../errors/unitPriceLedgerError.js';
import { ApiError } from '../../../errors/apiError.js';
import { PROBLEM_TYPES } from '../../../types/problem-details.js';

describe('unitPriceLedgerError', () => {
  describe('LedgerImportTooLargeError', () => {
    it('413 LEDGER_IMPORT_TOO_LARGE で、超えた上限を details に持つ', () => {
      const error = new LedgerImportTooLargeError('ZIP_SIZE', 50 * 1024 * 1024);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('LedgerImportTooLargeError');
      expect(error.statusCode).toBe(413);
      expect(error.code).toBe('LEDGER_IMPORT_TOO_LARGE');
      expect(error.problemType).toBe(PROBLEM_TYPES.BUSINESS_RULE_VIOLATION);
      expect(error.details).toEqual({ limit: 'ZIP_SIZE', max: 50 * 1024 * 1024 });
      expect(error.message).toBe('zip のファイルの大きさが上限（50MB）を超えています');
    });

    it('上限の種類ごとに上限の値を文言に示す', () => {
      expect(new LedgerImportTooLargeError('ENTRY_COUNT', 2000).message).toBe(
        'zip の中の項目の数が上限（2000 個）を超えています'
      );
      expect(new LedgerImportTooLargeError('ENTRY_SIZE', 1024 * 1024).message).toBe(
        'zip の中の項目の展開後の大きさが上限（1MB）を超えています'
      );
      expect(
        new LedgerImportTooLargeError('TOTAL_UNCOMPRESSED_SIZE', 200 * 1024 * 1024).message
      ).toBe('zip の展開後の合計の大きさが上限（200MB）を超えています');
      expect(new LedgerImportTooLargeError('FILE_COUNT', 2000).message).toBe(
        '取り込むファイルの数が上限（2000 個）を超えています'
      );
      expect(new LedgerImportTooLargeError('FILE_SIZE', 1024 * 1024).message).toBe(
        'JSON のファイルの大きさが上限（1MB）を超えています'
      );
    });

    it('Problem Details の status・code に対応する', () => {
      const problem = new LedgerImportTooLargeError('FILE_COUNT', 2000).toProblemDetails(
        '/api/unit-price-ledger/imports'
      );

      expect(problem.status).toBe(413);
      expect(problem.code).toBe('LEDGER_IMPORT_TOO_LARGE');
    });
  });

  describe('LedgerConflictError', () => {
    it('409 LEDGER_CONFLICT で、要件 5.6 の文言を持つ', () => {
      const error = new LedgerConflictError({ expectedUpdatedAt: '2026-11-16T00:00:00.000Z' });

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('LedgerConflictError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('LEDGER_CONFLICT');
      expect(error.problemType).toBe(PROBLEM_TYPES.CONFLICT);
      expect(error.message).toBe('ほかの利用者が更新しました。最新の内容を読み込み直してください');
      expect(LEDGER_CONFLICT_MESSAGE).toBe(error.message);
      expect(error.details).toEqual({ expectedUpdatedAt: '2026-11-16T00:00:00.000Z' });
    });

    it('Problem Details の status・code に対応する', () => {
      const problem = new LedgerConflictError().toProblemDetails();

      expect(problem.status).toBe(409);
      expect(problem.code).toBe('LEDGER_CONFLICT');
    });
  });

  describe('LedgerProjectQuotationReadOnlyError', () => {
    it('修正の拒否は 409 LEDGER_PROJECT_QUOTATION_READ_ONLY で、見積の ID と操作を持つ', () => {
      const error = new LedgerProjectQuotationReadOnlyError('q-1', 'update');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('LedgerProjectQuotationReadOnlyError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('LEDGER_PROJECT_QUOTATION_READ_ONLY');
      expect(error.problemType).toBe(PROBLEM_TYPES.CONFLICT);
      expect(error.details).toEqual({ quotationId: 'q-1', operation: 'update' });
      expect(error.message).toBe(
        '案件の受領見積書は台帳の画面で修正できません。受領見積書の画面で修正してください'
      );
    });

    it('削除の拒否も同じ code で、削除できない旨を示す', () => {
      const error = new LedgerProjectQuotationReadOnlyError('q-1', 'delete');

      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('LEDGER_PROJECT_QUOTATION_READ_ONLY');
      expect(error.details).toEqual({ quotationId: 'q-1', operation: 'delete' });
      expect(error.message).toBe(
        '案件の受領見積書は台帳の画面で削除できません。受領見積書の画面で削除してください'
      );
    });
  });
});
