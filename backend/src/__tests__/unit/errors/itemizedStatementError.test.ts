import { describe, it, expect } from 'vitest';
import {
  ItemizedStatementNotFoundError,
  QuantityTableNotFoundForItemizedStatementError,
  EmptyQuantityItemsError,
  DuplicateItemizedStatementNameError,
  QuantityOverflowError,
  ItemizedStatementConflictError,
  ItemizedStatementItemLimitExceededError,
} from '../../../errors/itemizedStatementError.js';
import { ApiError, NotFoundError } from '../../../errors/apiError.js';
import { PROBLEM_TYPES } from '../../../types/problem-details.js';

describe('Itemized Statement Error Classes', () => {
  describe('ItemizedStatementNotFoundError', () => {
    it('should have 404 status code', () => {
      const error = new ItemizedStatementNotFoundError('test-itemized-statement-id');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ItemizedStatementNotFoundError');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('ITEMIZED_STATEMENT_NOT_FOUND');
      expect(error.problemType).toBe(PROBLEM_TYPES.NOT_FOUND);
    });

    it('should include itemizedStatementId in message', () => {
      const itemizedStatementId = 'uuid-123-456';
      const error = new ItemizedStatementNotFoundError(itemizedStatementId);

      expect(error.message).toBe(`内訳書が見つかりません: ${itemizedStatementId}`);
    });

    it('should capture stack trace', () => {
      const error = new ItemizedStatementNotFoundError('test-id');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('itemizedStatementError.test.ts');
    });

    it('toJSON() should return correct format', () => {
      const error = new ItemizedStatementNotFoundError('test-id');
      const json = error.toJSON();

      expect(json).toEqual({
        error: '内訳書が見つかりません: test-id',
        code: 'ITEMIZED_STATEMENT_NOT_FOUND',
      });
    });

    it('toProblemDetails() should return RFC 7807 format', () => {
      const error = new ItemizedStatementNotFoundError('test-id');
      const problemDetails = error.toProblemDetails('/api/itemized-statements/test-id');

      expect(problemDetails).toMatchObject({
        type: PROBLEM_TYPES.NOT_FOUND,
        title: 'ITEMIZED_STATEMENT_NOT_FOUND',
        status: 404,
        detail: '内訳書が見つかりません: test-id',
        instance: '/api/itemized-statements/test-id',
      });
    });
  });

  describe('QuantityTableNotFoundForItemizedStatementError', () => {
    it('should have 404 status code', () => {
      const error = new QuantityTableNotFoundForItemizedStatementError('test-quantity-table-id');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('QuantityTableNotFoundForItemizedStatementError');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('QUANTITY_TABLE_NOT_FOUND');
      expect(error.problemType).toBe(PROBLEM_TYPES.NOT_FOUND);
    });

    it('should include quantityTableId in message', () => {
      const quantityTableId = 'uuid-789-abc';
      const error = new QuantityTableNotFoundForItemizedStatementError(quantityTableId);

      expect(error.message).toBe(`数量表が見つかりません: ${quantityTableId}`);
    });

    it('should expose quantityTableId property', () => {
      const quantityTableId = 'uuid-789-abc';
      const error = new QuantityTableNotFoundForItemizedStatementError(quantityTableId);

      expect(error.quantityTableId).toBe(quantityTableId);
    });

    it('should capture stack trace', () => {
      const error = new QuantityTableNotFoundForItemizedStatementError('test-id');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('itemizedStatementError.test.ts');
    });

    it('toJSON() should return correct format', () => {
      const error = new QuantityTableNotFoundForItemizedStatementError('test-id');
      const json = error.toJSON();

      expect(json).toEqual({
        error: '数量表が見つかりません: test-id',
        code: 'QUANTITY_TABLE_NOT_FOUND',
      });
    });

    it('toProblemDetails() should return RFC 7807 format', () => {
      const error = new QuantityTableNotFoundForItemizedStatementError('test-id');
      const problemDetails = error.toProblemDetails('/api/itemized-statements');

      expect(problemDetails).toMatchObject({
        type: PROBLEM_TYPES.NOT_FOUND,
        title: 'QUANTITY_TABLE_NOT_FOUND',
        status: 404,
        detail: '数量表が見つかりません: test-id',
        instance: '/api/itemized-statements',
      });
    });
  });

  describe('EmptyQuantityItemsError', () => {
    it('should have 400 status code', () => {
      const error = new EmptyQuantityItemsError('test-quantity-table-id');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('EmptyQuantityItemsError');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('EMPTY_QUANTITY_ITEMS');
      expect(error.problemType).toBe(PROBLEM_TYPES.VALIDATION_ERROR);
    });

    it('should have correct error message', () => {
      const error = new EmptyQuantityItemsError('test-id');

      expect(error.message).toBe('選択された数量表に項目がありません');
    });

    it('should expose quantityTableId property', () => {
      const quantityTableId = 'uuid-456-def';
      const error = new EmptyQuantityItemsError(quantityTableId);

      expect(error.quantityTableId).toBe(quantityTableId);
    });

    it('should include quantityTableId in details', () => {
      const quantityTableId = 'uuid-456-def';
      const error = new EmptyQuantityItemsError(quantityTableId);

      expect(error.details).toEqual({ quantityTableId });
    });

    it('should capture stack trace', () => {
      const error = new EmptyQuantityItemsError('test-id');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('itemizedStatementError.test.ts');
    });

    it('toJSON() should return correct format', () => {
      const error = new EmptyQuantityItemsError('test-id');
      const json = error.toJSON();

      expect(json).toEqual({
        error: '選択された数量表に項目がありません',
        code: 'EMPTY_QUANTITY_ITEMS',
        details: { quantityTableId: 'test-id' },
      });
    });

    it('toProblemDetails() should return RFC 7807 format', () => {
      const error = new EmptyQuantityItemsError('test-id');
      const problemDetails = error.toProblemDetails('/api/itemized-statements');

      expect(problemDetails).toMatchObject({
        type: PROBLEM_TYPES.VALIDATION_ERROR,
        title: 'EMPTY_QUANTITY_ITEMS',
        status: 400,
        detail: '選択された数量表に項目がありません',
        instance: '/api/itemized-statements',
        details: { quantityTableId: 'test-id' },
      });
    });
  });

  describe('DuplicateItemizedStatementNameError', () => {
    it('should have 409 status code', () => {
      const error = new DuplicateItemizedStatementNameError('テスト内訳書', 'project-123');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('DuplicateItemizedStatementNameError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('DUPLICATE_ITEMIZED_STATEMENT_NAME');
      expect(error.problemType).toBe(PROBLEM_TYPES.CONFLICT);
    });

    it('should have correct error message', () => {
      const error = new DuplicateItemizedStatementNameError('重複名', 'project-123');

      expect(error.message).toBe('同名の内訳書が既に存在します');
    });

    it('should expose duplicateName property', () => {
      const duplicateName = '内訳書A';
      const error = new DuplicateItemizedStatementNameError(duplicateName, 'project-123');

      expect(error.duplicateName).toBe(duplicateName);
    });

    it('should expose projectId property', () => {
      const projectId = 'project-456';
      const error = new DuplicateItemizedStatementNameError('テスト', projectId);

      expect(error.projectId).toBe(projectId);
    });

    it('should include name and projectId in details', () => {
      const duplicateName = '内訳書B';
      const projectId = 'project-789';
      const error = new DuplicateItemizedStatementNameError(duplicateName, projectId);

      expect(error.details).toEqual({ name: duplicateName, projectId });
    });

    it('should capture stack trace', () => {
      const error = new DuplicateItemizedStatementNameError('test', 'project-id');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('itemizedStatementError.test.ts');
    });

    it('toJSON() should return correct format', () => {
      const error = new DuplicateItemizedStatementNameError('テスト', 'project-123');
      const json = error.toJSON();

      expect(json).toEqual({
        error: '同名の内訳書が既に存在します',
        code: 'DUPLICATE_ITEMIZED_STATEMENT_NAME',
        details: { name: 'テスト', projectId: 'project-123' },
      });
    });

    it('toProblemDetails() should return RFC 7807 format', () => {
      const error = new DuplicateItemizedStatementNameError('テスト', 'project-123');
      const problemDetails = error.toProblemDetails(
        '/api/projects/project-123/itemized-statements'
      );

      expect(problemDetails).toMatchObject({
        type: PROBLEM_TYPES.CONFLICT,
        title: 'DUPLICATE_ITEMIZED_STATEMENT_NAME',
        status: 409,
        detail: '同名の内訳書が既に存在します',
        instance: '/api/projects/project-123/itemized-statements',
        details: { name: 'テスト', projectId: 'project-123' },
      });
    });
  });

  describe('QuantityOverflowError', () => {
    it('should have 422 status code', () => {
      const error = new QuantityOverflowError('10000000.00');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('QuantityOverflowError');
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('QUANTITY_OVERFLOW');
      expect(error.problemType).toBe(PROBLEM_TYPES.BUSINESS_RULE_VIOLATION);
    });

    it('should have correct error message with default range', () => {
      const actualValue = '10000000.00';
      const error = new QuantityOverflowError(actualValue);

      expect(error.message).toBe(
        `数量の合計が許容範囲を超えています（許容範囲: -999999.99 〜 9999999.99、実際の値: ${actualValue}）`
      );
    });

    it('should have correct error message with custom range', () => {
      const actualValue = '50000.00';
      const minAllowed = '-10000.00';
      const maxAllowed = '10000.00';
      const error = new QuantityOverflowError(actualValue, minAllowed, maxAllowed);

      expect(error.message).toBe(
        `数量の合計が許容範囲を超えています（許容範囲: ${minAllowed} 〜 ${maxAllowed}、実際の値: ${actualValue}）`
      );
    });

    it('should expose actualValue property', () => {
      const actualValue = '12345678.00';
      const error = new QuantityOverflowError(actualValue);

      expect(error.actualValue).toBe(actualValue);
    });

    it('should expose minAllowed property with default value', () => {
      const error = new QuantityOverflowError('10000000.00');

      expect(error.minAllowed).toBe('-999999.99');
    });

    it('should expose maxAllowed property with default value', () => {
      const error = new QuantityOverflowError('10000000.00');

      expect(error.maxAllowed).toBe('9999999.99');
    });

    it('should expose minAllowed property with custom value', () => {
      const error = new QuantityOverflowError('50000.00', '-5000.00', '5000.00');

      expect(error.minAllowed).toBe('-5000.00');
    });

    it('should expose maxAllowed property with custom value', () => {
      const error = new QuantityOverflowError('50000.00', '-5000.00', '5000.00');

      expect(error.maxAllowed).toBe('5000.00');
    });

    it('should include actualValue, minAllowed, maxAllowed in details', () => {
      const actualValue = '10000000.00';
      const error = new QuantityOverflowError(actualValue);

      expect(error.details).toEqual({
        actualValue,
        minAllowed: '-999999.99',
        maxAllowed: '9999999.99',
      });
    });

    it('should capture stack trace', () => {
      const error = new QuantityOverflowError('10000000.00');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('itemizedStatementError.test.ts');
    });

    it('toJSON() should return correct format', () => {
      const error = new QuantityOverflowError('10000000.00');
      const json = error.toJSON();

      expect(json).toEqual({
        error:
          '数量の合計が許容範囲を超えています（許容範囲: -999999.99 〜 9999999.99、実際の値: 10000000.00）',
        code: 'QUANTITY_OVERFLOW',
        details: {
          actualValue: '10000000.00',
          minAllowed: '-999999.99',
          maxAllowed: '9999999.99',
        },
      });
    });

    it('toProblemDetails() should return RFC 7807 format', () => {
      const error = new QuantityOverflowError('10000000.00');
      const problemDetails = error.toProblemDetails('/api/itemized-statements/123/items');

      expect(problemDetails).toMatchObject({
        type: PROBLEM_TYPES.BUSINESS_RULE_VIOLATION,
        title: 'QUANTITY_OVERFLOW',
        status: 422,
        detail:
          '数量の合計が許容範囲を超えています（許容範囲: -999999.99 〜 9999999.99、実際の値: 10000000.00）',
        instance: '/api/itemized-statements/123/items',
        details: {
          actualValue: '10000000.00',
          minAllowed: '-999999.99',
          maxAllowed: '9999999.99',
        },
      });
    });
  });

  describe('ItemizedStatementConflictError', () => {
    it('should have 409 status code', () => {
      const error = new ItemizedStatementConflictError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ItemizedStatementConflictError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('ITEMIZED_STATEMENT_CONFLICT');
      expect(error.problemType).toBe(PROBLEM_TYPES.CONFLICT);
    });

    it('should have correct error message', () => {
      const error = new ItemizedStatementConflictError();

      expect(error.message).toBe('他のユーザーにより更新されました。画面を再読み込みしてください');
    });

    it('should work without conflict details', () => {
      const error = new ItemizedStatementConflictError();

      expect(error.details).toBeUndefined();
    });

    it('should store conflict details when provided', () => {
      const conflictDetails = {
        expectedUpdatedAt: '2025-12-01T00:00:00Z',
        actualUpdatedAt: '2025-12-06T00:00:00Z',
      };
      const error = new ItemizedStatementConflictError(conflictDetails);

      expect(error.details).toEqual(conflictDetails);
    });

    it('should capture stack trace', () => {
      const error = new ItemizedStatementConflictError();

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('itemizedStatementError.test.ts');
    });

    it('toJSON() should return correct format without details', () => {
      const error = new ItemizedStatementConflictError();
      const json = error.toJSON();

      expect(json).toEqual({
        error: '他のユーザーにより更新されました。画面を再読み込みしてください',
        code: 'ITEMIZED_STATEMENT_CONFLICT',
      });
    });

    it('toJSON() should return correct format with details', () => {
      const conflictDetails = { field: 'updatedAt' };
      const error = new ItemizedStatementConflictError(conflictDetails);
      const json = error.toJSON();

      expect(json).toEqual({
        error: '他のユーザーにより更新されました。画面を再読み込みしてください',
        code: 'ITEMIZED_STATEMENT_CONFLICT',
        details: conflictDetails,
      });
    });

    it('toProblemDetails() should return RFC 7807 format', () => {
      const error = new ItemizedStatementConflictError();
      const problemDetails = error.toProblemDetails('/api/itemized-statements/123');

      expect(problemDetails).toMatchObject({
        type: PROBLEM_TYPES.CONFLICT,
        title: 'ITEMIZED_STATEMENT_CONFLICT',
        status: 409,
        detail: '他のユーザーにより更新されました。画面を再読み込みしてください',
        instance: '/api/itemized-statements/123',
      });
    });

    it('toProblemDetails() should include details when provided', () => {
      const conflictDetails = { expectedVersion: 1, actualVersion: 2 };
      const error = new ItemizedStatementConflictError(conflictDetails);
      const problemDetails = error.toProblemDetails('/api/itemized-statements/123');

      expect(problemDetails).toMatchObject({
        type: PROBLEM_TYPES.CONFLICT,
        title: 'ITEMIZED_STATEMENT_CONFLICT',
        status: 409,
        detail: '他のユーザーにより更新されました。画面を再読み込みしてください',
        instance: '/api/itemized-statements/123',
        details: conflictDetails,
      });
    });
  });

  describe('ItemizedStatementItemLimitExceededError', () => {
    it('should have 422 status code', () => {
      const error = new ItemizedStatementItemLimitExceededError(2500);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ItemizedStatementItemLimitExceededError');
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('ITEMIZED_STATEMENT_ITEM_LIMIT_EXCEEDED');
      expect(error.problemType).toBe(PROBLEM_TYPES.BUSINESS_RULE_VIOLATION);
    });

    it('should have correct error message with default limit', () => {
      const actualCount = 2500;
      const error = new ItemizedStatementItemLimitExceededError(actualCount);

      expect(error.message).toBe(
        `内訳項目数が上限を超えています（上限: 2000件、実際: ${actualCount}件）`
      );
    });

    it('should have correct error message with custom limit', () => {
      const actualCount = 1500;
      const maxLimit = 1000;
      const error = new ItemizedStatementItemLimitExceededError(actualCount, maxLimit);

      expect(error.message).toBe(
        `内訳項目数が上限を超えています（上限: ${maxLimit}件、実際: ${actualCount}件）`
      );
    });

    it('should expose actualCount property', () => {
      const actualCount = 3000;
      const error = new ItemizedStatementItemLimitExceededError(actualCount);

      expect(error.actualCount).toBe(actualCount);
    });

    it('should expose maxLimit property with default value', () => {
      const error = new ItemizedStatementItemLimitExceededError(2500);

      expect(error.maxLimit).toBe(2000);
    });

    it('should expose maxLimit property with custom value', () => {
      const error = new ItemizedStatementItemLimitExceededError(1500, 1000);

      expect(error.maxLimit).toBe(1000);
    });

    it('should include actualCount and maxLimit in details', () => {
      const actualCount = 2500;
      const error = new ItemizedStatementItemLimitExceededError(actualCount);

      expect(error.details).toEqual({
        actualCount,
        maxLimit: 2000,
      });
    });

    it('should capture stack trace', () => {
      const error = new ItemizedStatementItemLimitExceededError(2500);

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('itemizedStatementError.test.ts');
    });

    it('toJSON() should return correct format', () => {
      const error = new ItemizedStatementItemLimitExceededError(2500);
      const json = error.toJSON();

      expect(json).toEqual({
        error: '内訳項目数が上限を超えています（上限: 2000件、実際: 2500件）',
        code: 'ITEMIZED_STATEMENT_ITEM_LIMIT_EXCEEDED',
        details: {
          actualCount: 2500,
          maxLimit: 2000,
        },
      });
    });

    it('toProblemDetails() should return RFC 7807 format', () => {
      const error = new ItemizedStatementItemLimitExceededError(2500);
      const problemDetails = error.toProblemDetails('/api/itemized-statements');

      expect(problemDetails).toMatchObject({
        type: PROBLEM_TYPES.BUSINESS_RULE_VIOLATION,
        title: 'ITEMIZED_STATEMENT_ITEM_LIMIT_EXCEEDED',
        status: 422,
        detail: '内訳項目数が上限を超えています（上限: 2000件、実際: 2500件）',
        instance: '/api/itemized-statements',
        details: {
          actualCount: 2500,
          maxLimit: 2000,
        },
      });
    });
  });

  describe('Error inheritance chain', () => {
    it('all itemized statement errors should inherit from ApiError', () => {
      expect(new ItemizedStatementNotFoundError('id')).toBeInstanceOf(ApiError);
      expect(new QuantityTableNotFoundForItemizedStatementError('id')).toBeInstanceOf(ApiError);
      expect(new EmptyQuantityItemsError('id')).toBeInstanceOf(ApiError);
      expect(new DuplicateItemizedStatementNameError('name', 'projectId')).toBeInstanceOf(ApiError);
      expect(new QuantityOverflowError('value')).toBeInstanceOf(ApiError);
      expect(new ItemizedStatementConflictError()).toBeInstanceOf(ApiError);
      expect(new ItemizedStatementItemLimitExceededError(2500)).toBeInstanceOf(ApiError);
    });

    it('all itemized statement errors should inherit from Error', () => {
      expect(new ItemizedStatementNotFoundError('id')).toBeInstanceOf(Error);
      expect(new QuantityTableNotFoundForItemizedStatementError('id')).toBeInstanceOf(Error);
      expect(new EmptyQuantityItemsError('id')).toBeInstanceOf(Error);
      expect(new DuplicateItemizedStatementNameError('name', 'projectId')).toBeInstanceOf(Error);
      expect(new QuantityOverflowError('value')).toBeInstanceOf(Error);
      expect(new ItemizedStatementConflictError()).toBeInstanceOf(Error);
      expect(new ItemizedStatementItemLimitExceededError(2500)).toBeInstanceOf(Error);
    });

    it('NotFound errors should inherit from NotFoundError', () => {
      expect(new ItemizedStatementNotFoundError('id')).toBeInstanceOf(NotFoundError);
      expect(new QuantityTableNotFoundForItemizedStatementError('id')).toBeInstanceOf(
        NotFoundError
      );
    });
  });
});
