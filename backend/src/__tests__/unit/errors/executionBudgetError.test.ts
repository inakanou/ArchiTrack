/**
 * @fileoverview 実行予算エラークラスのユニットテスト
 *
 * @module tests/unit/errors/executionBudgetError
 */

import { describe, it, expect } from 'vitest';
import {
  ExecutionBudgetNotFoundError,
  ExecutionBudgetAlreadyExistsError,
  ContractNotFoundForBudgetError,
  ExecutionBudgetConflictError,
  ExecutionBudgetDeletionBlockedError,
  AmendmentContractNotFoundError,
  AmendmentAlreadyAppliedError,
  MonthlyCloseAlreadyExistsError,
} from '../../../errors/executionBudgetError.js';
import { ApiError } from '../../../errors/apiError.js';

describe('executionBudgetError', () => {
  describe('ExecutionBudgetNotFoundError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new ExecutionBudgetNotFoundError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ExecutionBudgetNotFoundError');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('EXECUTION_BUDGET_NOT_FOUND');
    });

    it('カスタムメッセージを受け付ける', () => {
      const error = new ExecutionBudgetNotFoundError('カスタムメッセージ');
      expect(error.message).toBe('カスタムメッセージ');
    });
  });

  describe('ExecutionBudgetAlreadyExistsError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new ExecutionBudgetAlreadyExistsError('project-1');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ExecutionBudgetAlreadyExistsError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('EXECUTION_BUDGET_ALREADY_EXISTS');
    });
  });

  describe('ContractNotFoundForBudgetError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new ContractNotFoundForBudgetError('contract-1');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ContractNotFoundForBudgetError');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('CONTRACT_NOT_FOUND_FOR_BUDGET');
    });
  });

  describe('ExecutionBudgetConflictError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new ExecutionBudgetConflictError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ExecutionBudgetConflictError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('EXECUTION_BUDGET_CONFLICT');
    });
  });

  describe('ExecutionBudgetDeletionBlockedError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new ExecutionBudgetDeletionBlockedError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ExecutionBudgetDeletionBlockedError');
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('EXECUTION_BUDGET_DELETION_BLOCKED');
    });
  });

  describe('AmendmentContractNotFoundError', () => {
    it('contractIdありの場合、detailsにcontractIdを含む', () => {
      const error = new AmendmentContractNotFoundError('contract-1');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('AmendmentContractNotFoundError');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('AMENDMENT_CONTRACT_NOT_FOUND');
      expect(error.details).toEqual({ contractId: 'contract-1' });
    });

    it('contractIdなしの場合、detailsはundefined', () => {
      const error = new AmendmentContractNotFoundError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('AmendmentContractNotFoundError');
      expect(error.statusCode).toBe(404);
      expect(error.details).toBeUndefined();
    });
  });

  describe('AmendmentAlreadyAppliedError', () => {
    it('contractIdありの場合、detailsにcontractIdを含む', () => {
      const error = new AmendmentAlreadyAppliedError('contract-1');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('AmendmentAlreadyAppliedError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('AMENDMENT_ALREADY_APPLIED');
      expect(error.details).toEqual({ contractId: 'contract-1' });
    });

    it('contractIdなしの場合、detailsはundefined', () => {
      const error = new AmendmentAlreadyAppliedError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('AmendmentAlreadyAppliedError');
      expect(error.statusCode).toBe(409);
      expect(error.details).toBeUndefined();
    });
  });

  describe('MonthlyCloseAlreadyExistsError', () => {
    it('正しいプロパティを持つ', () => {
      const error = new MonthlyCloseAlreadyExistsError('2026-03');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('MonthlyCloseAlreadyExistsError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('MONTHLY_CLOSE_ALREADY_EXISTS');
      expect(error.message).toContain('2026-03');
    });
  });
});
