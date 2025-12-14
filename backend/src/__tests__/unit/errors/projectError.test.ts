import { describe, it, expect } from 'vitest';
import {
  ProjectNotFoundError,
  ProjectValidationError,
  ProjectConflictError,
  InvalidStatusTransitionError,
  ReasonRequiredError,
  DuplicateProjectNameError,
} from '../../../errors/projectError.js';
import { ApiError } from '../../../errors/apiError.js';
import { PROBLEM_TYPES } from '../../../types/problem-details.js';
import type { ProjectStatus, TransitionType } from '../../../types/project.types.js';

describe('Project Error Classes', () => {
  describe('ProjectNotFoundError', () => {
    it('should have 404 status code', () => {
      const error = new ProjectNotFoundError('test-project-id');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ProjectNotFoundError');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('PROJECT_NOT_FOUND');
      expect(error.problemType).toBe(PROBLEM_TYPES.NOT_FOUND);
    });

    it('should include projectId in message', () => {
      const projectId = 'uuid-123-456';
      const error = new ProjectNotFoundError(projectId);

      expect(error.message).toBe(`Project not found: ${projectId}`);
    });

    it('should include projectId in details', () => {
      const projectId = 'uuid-123-456';
      const error = new ProjectNotFoundError(projectId);

      expect(error.details).toEqual({ projectId });
    });

    it('should capture stack trace', () => {
      const error = new ProjectNotFoundError('test-id');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('projectError.test.ts');
    });

    it('toJSON() should return correct format', () => {
      const error = new ProjectNotFoundError('test-id');
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Project not found: test-id',
        code: 'PROJECT_NOT_FOUND',
        details: { projectId: 'test-id' },
      });
    });
  });

  describe('ProjectValidationError', () => {
    it('should have 400 status code', () => {
      const error = new ProjectValidationError({ name: 'プロジェクト名は必須です' });

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ProjectValidationError');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('PROJECT_VALIDATION_ERROR');
      expect(error.problemType).toBe(PROBLEM_TYPES.VALIDATION_ERROR);
    });

    it('should have default validation failed message', () => {
      const error = new ProjectValidationError({ name: '必須' });

      expect(error.message).toBe('Validation failed');
    });

    it('should store validation errors in details', () => {
      const validationErrors = {
        name: 'プロジェクト名は必須です',
        customerName: '顧客名は255文字以内で入力してください',
      };
      const error = new ProjectValidationError(validationErrors);

      expect(error.details).toEqual(validationErrors);
    });

    it('should handle single field validation error', () => {
      const error = new ProjectValidationError({ salesPersonId: '営業担当者は必須です' });

      expect(error.details).toEqual({ salesPersonId: '営業担当者は必須です' });
    });

    it('toJSON() should return correct format', () => {
      const validationErrors = { name: '必須です' };
      const error = new ProjectValidationError(validationErrors);
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Validation failed',
        code: 'PROJECT_VALIDATION_ERROR',
        details: validationErrors,
      });
    });
  });

  describe('ProjectConflictError', () => {
    it('should have 409 status code', () => {
      const error = new ProjectConflictError('他のユーザーにより更新されました');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ProjectConflictError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('PROJECT_CONFLICT');
      expect(error.problemType).toBe(PROBLEM_TYPES.CONFLICT);
    });

    it('should use provided message', () => {
      const message = 'プロジェクトは別のユーザーにより更新されました';
      const error = new ProjectConflictError(message);

      expect(error.message).toBe(message);
    });

    it('should store additional conflict details', () => {
      const error = new ProjectConflictError('競合が発生しました', {
        expectedUpdatedAt: '2025-12-01T00:00:00Z',
        actualUpdatedAt: '2025-12-06T00:00:00Z',
      });

      expect(error.details).toEqual({
        expectedUpdatedAt: '2025-12-01T00:00:00Z',
        actualUpdatedAt: '2025-12-06T00:00:00Z',
      });
    });

    it('should work without details', () => {
      const error = new ProjectConflictError('競合が発生しました');

      expect(error.details).toBeUndefined();
    });

    it('toJSON() should return correct format with details', () => {
      const error = new ProjectConflictError('競合エラー', { field: 'updatedAt' });
      const json = error.toJSON();

      expect(json).toEqual({
        error: '競合エラー',
        code: 'PROJECT_CONFLICT',
        details: { field: 'updatedAt' },
      });
    });

    it('toJSON() should return correct format without details', () => {
      const error = new ProjectConflictError('競合エラー');
      const json = error.toJSON();

      expect(json).toEqual({
        error: '競合エラー',
        code: 'PROJECT_CONFLICT',
      });
    });
  });

  describe('InvalidStatusTransitionError', () => {
    const fromStatus: ProjectStatus = 'PREPARING';
    const toStatus: ProjectStatus = 'COMPLETED';
    const allowedTransitions: Array<{ status: ProjectStatus; type: TransitionType }> = [
      { status: 'SURVEYING', type: 'forward' },
      { status: 'CANCELLED', type: 'terminate' },
    ];

    it('should have 422 status code', () => {
      const error = new InvalidStatusTransitionError(fromStatus, toStatus, allowedTransitions);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('InvalidStatusTransitionError');
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('should have descriptive message', () => {
      const error = new InvalidStatusTransitionError(fromStatus, toStatus, allowedTransitions);

      expect(error.message).toBe(`Invalid transition from ${fromStatus} to ${toStatus}`);
    });

    it('should store transition details', () => {
      const error = new InvalidStatusTransitionError(fromStatus, toStatus, allowedTransitions);

      expect(error.details).toEqual({
        fromStatus,
        toStatus,
        allowed: allowedTransitions,
      });
    });

    it('should expose fromStatus property', () => {
      const error = new InvalidStatusTransitionError(fromStatus, toStatus, allowedTransitions);

      expect(error.fromStatus).toBe(fromStatus);
    });

    it('should expose toStatus property', () => {
      const error = new InvalidStatusTransitionError(fromStatus, toStatus, allowedTransitions);

      expect(error.toStatus).toBe(toStatus);
    });

    it('should expose allowed transitions property', () => {
      const error = new InvalidStatusTransitionError(fromStatus, toStatus, allowedTransitions);

      expect(error.allowed).toEqual(allowedTransitions);
    });

    it('should handle empty allowed transitions', () => {
      const terminalFromStatus: ProjectStatus = 'COMPLETED';
      const error = new InvalidStatusTransitionError(terminalFromStatus, 'PREPARING', []);

      expect(error.allowed).toEqual([]);
      expect(error.details).toEqual({
        fromStatus: terminalFromStatus,
        toStatus: 'PREPARING',
        allowed: [],
      });
    });

    it('toJSON() should return correct format', () => {
      const error = new InvalidStatusTransitionError(fromStatus, toStatus, allowedTransitions);
      const json = error.toJSON();

      expect(json).toEqual({
        error: `Invalid transition from ${fromStatus} to ${toStatus}`,
        code: 'INVALID_STATUS_TRANSITION',
        details: {
          fromStatus,
          toStatus,
          allowed: allowedTransitions,
        },
      });
    });

    it('should have problem type for unprocessable entity', () => {
      const error = new InvalidStatusTransitionError(fromStatus, toStatus, allowedTransitions);

      // 422 Unprocessable Entity uses VALIDATION_ERROR type in our system
      expect(error.problemType).toBe(PROBLEM_TYPES.VALIDATION_ERROR);
    });
  });

  describe('ReasonRequiredError', () => {
    it('should have 422 status code', () => {
      const error = new ReasonRequiredError();

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ReasonRequiredError');
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('REASON_REQUIRED');
    });

    it('should have default message', () => {
      const error = new ReasonRequiredError();

      expect(error.message).toBe('Reason is required for backward transition');
    });

    it('should not have details', () => {
      const error = new ReasonRequiredError();

      expect(error.details).toBeUndefined();
    });

    it('toJSON() should return correct format', () => {
      const error = new ReasonRequiredError();
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Reason is required for backward transition',
        code: 'REASON_REQUIRED',
      });
    });

    it('should have problem type for unprocessable entity', () => {
      const error = new ReasonRequiredError();

      // 422 Unprocessable Entity uses VALIDATION_ERROR type in our system
      expect(error.problemType).toBe(PROBLEM_TYPES.VALIDATION_ERROR);
    });
  });

  describe('Error inheritance chain', () => {
    it('all project errors should inherit from ApiError', () => {
      expect(new ProjectNotFoundError('id')).toBeInstanceOf(ApiError);
      expect(new ProjectValidationError({ name: 'test' })).toBeInstanceOf(ApiError);
      expect(new ProjectConflictError('test')).toBeInstanceOf(ApiError);
      expect(new InvalidStatusTransitionError('PREPARING', 'COMPLETED', [])).toBeInstanceOf(
        ApiError
      );
      expect(new ReasonRequiredError()).toBeInstanceOf(ApiError);
      expect(new DuplicateProjectNameError('test')).toBeInstanceOf(ApiError);
    });

    it('all project errors should inherit from Error', () => {
      expect(new ProjectNotFoundError('id')).toBeInstanceOf(Error);
      expect(new ProjectValidationError({ name: 'test' })).toBeInstanceOf(Error);
      expect(new ProjectConflictError('test')).toBeInstanceOf(Error);
      expect(new InvalidStatusTransitionError('PREPARING', 'COMPLETED', [])).toBeInstanceOf(Error);
      expect(new ReasonRequiredError()).toBeInstanceOf(Error);
      expect(new DuplicateProjectNameError('test')).toBeInstanceOf(Error);
    });
  });

  describe('DuplicateProjectNameError', () => {
    it('should have 409 status code', () => {
      const error = new DuplicateProjectNameError('テストプロジェクト');

      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('DuplicateProjectNameError');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('PROJECT_NAME_DUPLICATE');
      expect(error.problemType).toBe(PROBLEM_TYPES.PROJECT_NAME_DUPLICATE);
    });

    it('should have error message in Japanese', () => {
      const projectName = 'テストプロジェクト';
      const error = new DuplicateProjectNameError(projectName);

      expect(error.message).toBe('このプロジェクト名は既に使用されています');
    });

    it('should include projectName in details', () => {
      const projectName = '重複プロジェクト名';
      const error = new DuplicateProjectNameError(projectName);

      expect(error.details).toEqual({ projectName });
    });

    it('should expose projectName property', () => {
      const projectName = 'マイプロジェクト';
      const error = new DuplicateProjectNameError(projectName);

      expect(error.projectName).toBe(projectName);
    });

    it('toJSON() should return correct format', () => {
      const projectName = 'テストプロジェクト';
      const error = new DuplicateProjectNameError(projectName);
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'このプロジェクト名は既に使用されています',
        code: 'PROJECT_NAME_DUPLICATE',
        details: { projectName },
      });
    });

    it('toProblemDetails() should return RFC 7807 format', () => {
      const projectName = 'テストプロジェクト';
      const error = new DuplicateProjectNameError(projectName);
      const problemDetails = error.toProblemDetails('/api/projects');

      expect(problemDetails).toMatchObject({
        type: PROBLEM_TYPES.PROJECT_NAME_DUPLICATE,
        title: 'PROJECT_NAME_DUPLICATE',
        status: 409,
        detail: 'このプロジェクト名は既に使用されています',
        instance: '/api/projects',
        details: { projectName },
      });
    });

    it('should capture stack trace', () => {
      const error = new DuplicateProjectNameError('test');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('projectError.test.ts');
    });
  });

  describe('toProblemDetails()', () => {
    it('ProjectNotFoundError should return RFC 7807 format', () => {
      const error = new ProjectNotFoundError('test-id');
      const problemDetails = error.toProblemDetails('/api/projects/test-id');

      expect(problemDetails).toMatchObject({
        type: PROBLEM_TYPES.NOT_FOUND,
        title: 'PROJECT_NOT_FOUND',
        status: 404,
        detail: 'Project not found: test-id',
        instance: '/api/projects/test-id',
        details: { projectId: 'test-id' },
      });
    });

    it('ProjectValidationError should return RFC 7807 format', () => {
      const error = new ProjectValidationError({ name: '必須です' });
      const problemDetails = error.toProblemDetails('/api/projects');

      expect(problemDetails).toMatchObject({
        type: PROBLEM_TYPES.VALIDATION_ERROR,
        title: 'PROJECT_VALIDATION_ERROR',
        status: 400,
        detail: 'Validation failed',
        instance: '/api/projects',
        details: { name: '必須です' },
      });
    });

    it('InvalidStatusTransitionError should return RFC 7807 format', () => {
      const error = new InvalidStatusTransitionError('PREPARING', 'COMPLETED', []);
      const problemDetails = error.toProblemDetails('/api/projects/123/status');

      expect(problemDetails).toMatchObject({
        type: PROBLEM_TYPES.VALIDATION_ERROR,
        title: 'INVALID_STATUS_TRANSITION',
        status: 422,
        detail: 'Invalid transition from PREPARING to COMPLETED',
        instance: '/api/projects/123/status',
        details: {
          fromStatus: 'PREPARING',
          toStatus: 'COMPLETED',
          allowed: [],
        },
      });
    });
  });
});
