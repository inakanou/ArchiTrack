import { describe, it, expect } from 'vitest';
import {
  TradingPartnerNotFoundError,
  TradingPartnerValidationError,
  DuplicatePartnerNameError,
  PartnerInUseError,
  TradingPartnerConflictError,
} from '../../../errors/tradingPartnerError.js';
import { ApiError } from '../../../errors/apiError.js';
import { PROBLEM_TYPES } from '../../../types/problem-details.js';

/**
 * @fileoverview 取引先管理機能のエラークラスのテスト
 *
 * Requirements:
 * - 2.11: 同一の取引先名が既に存在する場合のエラー（DuplicatePartnerNameError）
 * - 4.8: 別の取引先と重複する取引先名に変更しようとした場合のエラー（DuplicatePartnerNameError）
 * - 4.10: 楽観的排他制御で競合が検出された場合のエラー（TradingPartnerConflictError）
 * - 5.5: 取引先がプロジェクトに紐付いている場合の削除拒否エラー（PartnerInUseError）
 * - 8.1, 8.2: ネットワークエラー、サーバーエラー時の適切なエラー表示
 */
describe('TradingPartner Error Classes', () => {
  describe('TradingPartnerNotFoundError', () => {
    it('should have 404 status code', () => {
      const error = new TradingPartnerNotFoundError('test-partner-id');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('TradingPartnerNotFoundError');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('TRADING_PARTNER_NOT_FOUND');
      expect(error.problemType).toBe(PROBLEM_TYPES.NOT_FOUND);
    });

    it('should include partnerId in message', () => {
      const partnerId = 'uuid-123-456';
      const error = new TradingPartnerNotFoundError(partnerId);

      expect(error.message).toBe(`取引先が見つかりません: ${partnerId}`);
    });

    it('should include partnerId in details', () => {
      const partnerId = 'uuid-123-456';
      const error = new TradingPartnerNotFoundError(partnerId);

      expect(error.details).toEqual({ partnerId });
    });

    it('should capture stack trace', () => {
      const error = new TradingPartnerNotFoundError('test-id');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('tradingPartnerError.test.ts');
    });

    it('toJSON() should return correct format', () => {
      const error = new TradingPartnerNotFoundError('test-id');
      const json = error.toJSON();

      expect(json).toEqual({
        error: '取引先が見つかりません: test-id',
        code: 'TRADING_PARTNER_NOT_FOUND',
        details: { partnerId: 'test-id' },
      });
    });
  });

  describe('TradingPartnerValidationError', () => {
    it('should have 400 status code', () => {
      const error = new TradingPartnerValidationError({ name: '取引先名は必須です' });

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('TradingPartnerValidationError');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TRADING_PARTNER_VALIDATION_ERROR');
      expect(error.problemType).toBe(PROBLEM_TYPES.VALIDATION_ERROR);
    });

    it('should have default validation failed message', () => {
      const error = new TradingPartnerValidationError({ name: '必須' });

      expect(error.message).toBe('バリデーションに失敗しました');
    });

    it('should store validation errors in details', () => {
      const validationErrors = {
        name: '取引先名は必須です',
        nameKana: 'フリガナはカタカナで入力してください',
      };
      const error = new TradingPartnerValidationError(validationErrors);

      expect(error.details).toEqual(validationErrors);
    });

    it('should handle single field validation error', () => {
      const error = new TradingPartnerValidationError({
        email: '有効なメールアドレスを入力してください',
      });

      expect(error.details).toEqual({ email: '有効なメールアドレスを入力してください' });
    });

    it('toJSON() should return correct format', () => {
      const validationErrors = { name: '必須です' };
      const error = new TradingPartnerValidationError(validationErrors);
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'バリデーションに失敗しました',
        code: 'TRADING_PARTNER_VALIDATION_ERROR',
        details: validationErrors,
      });
    });
  });

  describe('DuplicatePartnerNameError', () => {
    it('should have 409 status code', () => {
      const error = new DuplicatePartnerNameError('株式会社テスト');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('DuplicatePartnerNameError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('DUPLICATE_PARTNER_NAME');
      expect(error.problemType).toBe(PROBLEM_TYPES.CONFLICT);
    });

    it('should have correct message', () => {
      const partnerName = '株式会社サンプル';
      const error = new DuplicatePartnerNameError(partnerName);

      expect(error.message).toBe(
        'この取引先名と部課/支店/支社名の組み合わせは既に登録されています'
      );
    });

    it('should include partner name and branchName in details (branchName defaults to null)', () => {
      const partnerName = '株式会社サンプル';
      const error = new DuplicatePartnerNameError(partnerName);

      expect(error.details).toEqual({ name: partnerName, branchName: null });
    });

    it('should include partner name and branchName in details (branchName specified)', () => {
      const partnerName = '株式会社サンプル';
      const branchName = '大阪支店';
      const error = new DuplicatePartnerNameError(partnerName, branchName);

      expect(error.details).toEqual({ name: partnerName, branchName: branchName });
    });

    it('should expose partnerName property', () => {
      const partnerName = '株式会社テスト';
      const error = new DuplicatePartnerNameError(partnerName);

      expect(error.partnerName).toBe(partnerName);
    });

    it('should expose branchName property', () => {
      const partnerName = '株式会社テスト';
      const branchName = '東京本社';
      const error = new DuplicatePartnerNameError(partnerName, branchName);

      expect(error.branchName).toBe(branchName);
    });

    it('should expose branchName property as null when not specified', () => {
      const partnerName = '株式会社テスト';
      const error = new DuplicatePartnerNameError(partnerName);

      expect(error.branchName).toBeNull();
    });

    it('toJSON() should return correct format (branchName defaults to null)', () => {
      const error = new DuplicatePartnerNameError('株式会社テスト');
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'この取引先名と部課/支店/支社名の組み合わせは既に登録されています',
        code: 'DUPLICATE_PARTNER_NAME',
        details: { name: '株式会社テスト', branchName: null },
      });
    });

    it('toJSON() should return correct format (branchName specified)', () => {
      const error = new DuplicatePartnerNameError('株式会社テスト', '大阪支店');
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'この取引先名と部課/支店/支社名の組み合わせは既に登録されています',
        code: 'DUPLICATE_PARTNER_NAME',
        details: { name: '株式会社テスト', branchName: '大阪支店' },
      });
    });
  });

  describe('PartnerInUseError', () => {
    it('should have 409 status code', () => {
      const error = new PartnerInUseError('partner-id-123');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('PartnerInUseError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('PARTNER_IN_USE');
      expect(error.problemType).toBe(PROBLEM_TYPES.CONFLICT);
    });

    it('should have correct message', () => {
      const error = new PartnerInUseError('partner-id-123');

      expect(error.message).toBe('この取引先は現在プロジェクトに使用されているため削除できません');
    });

    it('should include partnerId in details', () => {
      const partnerId = 'uuid-123-456';
      const error = new PartnerInUseError(partnerId);

      expect(error.details).toEqual({ partnerId });
    });

    it('should include projectIds when provided', () => {
      const partnerId = 'uuid-123-456';
      const projectIds = ['project-1', 'project-2'];
      const error = new PartnerInUseError(partnerId, projectIds);

      expect(error.details).toEqual({ partnerId, projectIds });
    });

    it('should expose partnerId property', () => {
      const partnerId = 'partner-id-123';
      const error = new PartnerInUseError(partnerId);

      expect(error.partnerId).toBe(partnerId);
    });

    it('toJSON() should return correct format without projectIds', () => {
      const error = new PartnerInUseError('partner-id');
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'この取引先は現在プロジェクトに使用されているため削除できません',
        code: 'PARTNER_IN_USE',
        details: { partnerId: 'partner-id' },
      });
    });

    it('toJSON() should return correct format with projectIds', () => {
      const error = new PartnerInUseError('partner-id', ['proj-1', 'proj-2']);
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'この取引先は現在プロジェクトに使用されているため削除できません',
        code: 'PARTNER_IN_USE',
        details: { partnerId: 'partner-id', projectIds: ['proj-1', 'proj-2'] },
      });
    });
  });

  describe('TradingPartnerConflictError', () => {
    it('should have 409 status code', () => {
      const error = new TradingPartnerConflictError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('TradingPartnerConflictError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('TRADING_PARTNER_CONFLICT');
      expect(error.problemType).toBe(PROBLEM_TYPES.CONFLICT);
    });

    it('should have default message', () => {
      const error = new TradingPartnerConflictError();

      expect(error.message).toBe('他のユーザーによって更新されました。画面を更新してください');
    });

    it('should use custom message when provided', () => {
      const customMessage = 'カスタムエラーメッセージ';
      const error = new TradingPartnerConflictError(customMessage);

      expect(error.message).toBe(customMessage);
    });

    it('should store additional conflict details', () => {
      const error = new TradingPartnerConflictError(undefined, {
        expectedUpdatedAt: '2025-12-01T00:00:00Z',
        actualUpdatedAt: '2025-12-06T00:00:00Z',
      });

      expect(error.details).toEqual({
        expectedUpdatedAt: '2025-12-01T00:00:00Z',
        actualUpdatedAt: '2025-12-06T00:00:00Z',
      });
    });

    it('should work without details', () => {
      const error = new TradingPartnerConflictError();

      expect(error.details).toBeUndefined();
    });

    it('toJSON() should return correct format with details', () => {
      const error = new TradingPartnerConflictError(undefined, { field: 'updatedAt' });
      const json = error.toJSON();

      expect(json).toEqual({
        error: '他のユーザーによって更新されました。画面を更新してください',
        code: 'TRADING_PARTNER_CONFLICT',
        details: { field: 'updatedAt' },
      });
    });

    it('toJSON() should return correct format without details', () => {
      const error = new TradingPartnerConflictError();
      const json = error.toJSON();

      expect(json).toEqual({
        error: '他のユーザーによって更新されました。画面を更新してください',
        code: 'TRADING_PARTNER_CONFLICT',
      });
    });
  });

  describe('Error inheritance chain', () => {
    it('all trading partner errors should inherit from ApiError', () => {
      expect(new TradingPartnerNotFoundError('id')).toBeInstanceOf(ApiError);
      expect(new TradingPartnerValidationError({ name: 'test' })).toBeInstanceOf(ApiError);
      expect(new DuplicatePartnerNameError('name')).toBeInstanceOf(ApiError);
      expect(new PartnerInUseError('id')).toBeInstanceOf(ApiError);
      expect(new TradingPartnerConflictError()).toBeInstanceOf(ApiError);
    });

    it('all trading partner errors should inherit from Error', () => {
      expect(new TradingPartnerNotFoundError('id')).toBeInstanceOf(Error);
      expect(new TradingPartnerValidationError({ name: 'test' })).toBeInstanceOf(Error);
      expect(new DuplicatePartnerNameError('name')).toBeInstanceOf(Error);
      expect(new PartnerInUseError('id')).toBeInstanceOf(Error);
      expect(new TradingPartnerConflictError()).toBeInstanceOf(Error);
    });
  });

  describe('toProblemDetails()', () => {
    it('TradingPartnerNotFoundError should return RFC 7807 format', () => {
      const error = new TradingPartnerNotFoundError('test-id');
      const problemDetails = error.toProblemDetails('/api/trading-partners/test-id');

      expect(problemDetails).toEqual({
        type: PROBLEM_TYPES.NOT_FOUND,
        title: 'TRADING_PARTNER_NOT_FOUND',
        status: 404,
        detail: '取引先が見つかりません: test-id',
        instance: '/api/trading-partners/test-id',
        details: { partnerId: 'test-id' },
      });
    });

    it('TradingPartnerValidationError should return RFC 7807 format', () => {
      const error = new TradingPartnerValidationError({ name: '必須です' });
      const problemDetails = error.toProblemDetails('/api/trading-partners');

      expect(problemDetails).toEqual({
        type: PROBLEM_TYPES.VALIDATION_ERROR,
        title: 'TRADING_PARTNER_VALIDATION_ERROR',
        status: 400,
        detail: 'バリデーションに失敗しました',
        instance: '/api/trading-partners',
        details: { name: '必須です' },
      });
    });

    it('DuplicatePartnerNameError should return RFC 7807 format (branchName defaults to null)', () => {
      const error = new DuplicatePartnerNameError('株式会社テスト');
      const problemDetails = error.toProblemDetails('/api/trading-partners');

      expect(problemDetails).toEqual({
        type: PROBLEM_TYPES.CONFLICT,
        title: 'DUPLICATE_PARTNER_NAME',
        status: 409,
        detail: 'この取引先名と部課/支店/支社名の組み合わせは既に登録されています',
        instance: '/api/trading-partners',
        details: { name: '株式会社テスト', branchName: null },
      });
    });

    it('DuplicatePartnerNameError should return RFC 7807 format (branchName specified)', () => {
      const error = new DuplicatePartnerNameError('株式会社テスト', '大阪支店');
      const problemDetails = error.toProblemDetails('/api/trading-partners');

      expect(problemDetails).toEqual({
        type: PROBLEM_TYPES.CONFLICT,
        title: 'DUPLICATE_PARTNER_NAME',
        status: 409,
        detail: 'この取引先名と部課/支店/支社名の組み合わせは既に登録されています',
        instance: '/api/trading-partners',
        details: { name: '株式会社テスト', branchName: '大阪支店' },
      });
    });

    it('PartnerInUseError should return RFC 7807 format', () => {
      const error = new PartnerInUseError('partner-id', ['proj-1']);
      const problemDetails = error.toProblemDetails('/api/trading-partners/partner-id');

      expect(problemDetails).toEqual({
        type: PROBLEM_TYPES.CONFLICT,
        title: 'PARTNER_IN_USE',
        status: 409,
        detail: 'この取引先は現在プロジェクトに使用されているため削除できません',
        instance: '/api/trading-partners/partner-id',
        details: { partnerId: 'partner-id', projectIds: ['proj-1'] },
      });
    });

    it('TradingPartnerConflictError should return RFC 7807 format', () => {
      const error = new TradingPartnerConflictError(undefined, {
        expectedUpdatedAt: '2025-12-01T00:00:00Z',
      });
      const problemDetails = error.toProblemDetails('/api/trading-partners/123');

      expect(problemDetails).toEqual({
        type: PROBLEM_TYPES.CONFLICT,
        title: 'TRADING_PARTNER_CONFLICT',
        status: 409,
        detail: '他のユーザーによって更新されました。画面を更新してください',
        instance: '/api/trading-partners/123',
        details: { expectedUpdatedAt: '2025-12-01T00:00:00Z' },
      });
    });
  });
});
