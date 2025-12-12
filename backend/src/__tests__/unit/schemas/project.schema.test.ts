/**
 * @fileoverview プロジェクト用バリデーションスキーマのテスト
 *
 * TDD RED phase: テストを先に書く
 *
 * Requirements:
 * - 13.1: プロジェクト名は必須かつ1〜255文字
 * - 13.2: 顧客名は必須かつ1〜255文字
 * - 13.3: 営業担当者は必須
 * - 13.4: 営業担当者の値がadmin以外の有効なユーザーIDであることを検証
 * - 13.5: 工事担当者は任意
 * - 13.6: 工事担当者が指定された場合、admin以外の有効なユーザーIDであることを検証
 * - 13.7: 現場住所は任意かつ最大500文字
 * - 13.8: 概要は任意かつ最大5000文字
 * - 13.10: フロントエンドでバリデーションエラーが発生する場合、エラーメッセージを即座に表示
 * - 13.11: バックエンドでバリデーションエラーが発生する場合、400 Bad Requestエラーとエラー詳細を返却
 */

import { describe, it, expect } from 'vitest';
import {
  createProjectSchema,
  updateProjectSchema,
  projectFilterSchema,
  paginationSchema,
  sortSchema,
  statusChangeSchema,
  projectIdParamSchema,
  PROJECT_VALIDATION_MESSAGES,
} from '../../../schemas/project.schema.js';
import { PROJECT_STATUSES } from '../../../types/project.types.js';

describe('project.schema', () => {
  describe('createProjectSchema', () => {
    describe('name field', () => {
      it('should accept a valid name', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(true);
      });

      it('should reject an empty name', () => {
        const result = createProjectSchema.safeParse({
          name: '',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(PROJECT_VALIDATION_MESSAGES.NAME_REQUIRED);
        }
      });

      it('should reject a name with only whitespace', () => {
        const result = createProjectSchema.safeParse({
          name: '   ',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(false);
      });

      it('should reject a name exceeding 255 characters', () => {
        const result = createProjectSchema.safeParse({
          name: 'a'.repeat(256),
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(PROJECT_VALIDATION_MESSAGES.NAME_TOO_LONG);
        }
      });

      it('should accept a name with exactly 255 characters', () => {
        const result = createProjectSchema.safeParse({
          name: 'a'.repeat(255),
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(true);
      });

      it('should reject missing name field', () => {
        const result = createProjectSchema.safeParse({
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('tradingPartnerId field', () => {
      it('should accept a valid UUID', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          tradingPartnerId: '550e8400-e29b-41d4-a716-446655440000',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440001',
        });
        expect(result.success).toBe(true);
      });

      it('should accept null', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          tradingPartnerId: null,
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(true);
      });

      it('should accept undefined (optional field)', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(true);
      });

      it('should reject an invalid UUID', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          tradingPartnerId: 'invalid-uuid',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            PROJECT_VALIDATION_MESSAGES.TRADING_PARTNER_ID_INVALID_UUID
          );
        }
      });
    });

    describe('salesPersonId field', () => {
      it('should accept a valid UUID', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(true);
      });

      it('should reject an invalid UUID', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: 'invalid-uuid',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            PROJECT_VALIDATION_MESSAGES.SALES_PERSON_INVALID_UUID
          );
        }
      });

      it('should reject an empty salesPersonId', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            PROJECT_VALIDATION_MESSAGES.SALES_PERSON_REQUIRED
          );
        }
      });

      it('should reject missing salesPersonId field', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('constructionPersonId field (optional)', () => {
      it('should accept without constructionPersonId', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(true);
      });

      it('should accept a valid UUID for constructionPersonId', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
          constructionPersonId: '550e8400-e29b-41d4-a716-446655440001',
        });
        expect(result.success).toBe(true);
      });

      it('should reject an invalid UUID for constructionPersonId', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
          constructionPersonId: 'invalid-uuid',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            PROJECT_VALIDATION_MESSAGES.CONSTRUCTION_PERSON_INVALID_UUID
          );
        }
      });

      it('should accept null for constructionPersonId', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
          constructionPersonId: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe('siteAddress field (optional)', () => {
      it('should accept without siteAddress', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(true);
      });

      it('should accept a valid siteAddress', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
          siteAddress: '東京都渋谷区1-2-3',
        });
        expect(result.success).toBe(true);
      });

      it('should reject a siteAddress exceeding 500 characters', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
          siteAddress: 'a'.repeat(501),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            PROJECT_VALIDATION_MESSAGES.SITE_ADDRESS_TOO_LONG
          );
        }
      });

      it('should accept a siteAddress with exactly 500 characters', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
          siteAddress: 'a'.repeat(500),
        });
        expect(result.success).toBe(true);
      });
    });

    describe('description field (optional)', () => {
      it('should accept without description', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(true);
      });

      it('should accept a valid description', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
          description: 'This is a test project description.',
        });
        expect(result.success).toBe(true);
      });

      it('should reject a description exceeding 5000 characters', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
          description: 'a'.repeat(5001),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            PROJECT_VALIDATION_MESSAGES.DESCRIPTION_TOO_LONG
          );
        }
      });

      it('should accept a description with exactly 5000 characters', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
          description: 'a'.repeat(5000),
        });
        expect(result.success).toBe(true);
      });
    });

    describe('complete valid input', () => {
      it('should accept a complete valid input with all fields', () => {
        const result = createProjectSchema.safeParse({
          name: 'Test Project',
          salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
          constructionPersonId: '550e8400-e29b-41d4-a716-446655440001',
          siteAddress: '東京都渋谷区1-2-3',
          description: 'This is a test project description.',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({
            name: 'Test Project',
            salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
            constructionPersonId: '550e8400-e29b-41d4-a716-446655440001',
            siteAddress: '東京都渋谷区1-2-3',
            description: 'This is a test project description.',
          });
        }
      });
    });
  });

  describe('updateProjectSchema', () => {
    it('should accept partial updates', () => {
      const result = updateProjectSchema.safeParse({
        name: 'Updated Project Name',
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty object (no updates)', () => {
      const result = updateProjectSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should validate name field when provided', () => {
      const result = updateProjectSchema.safeParse({
        name: 'a'.repeat(256),
      });
      expect(result.success).toBe(false);
    });

    it('should validate tradingPartnerId field when provided', () => {
      const result = updateProjectSchema.safeParse({
        tradingPartnerId: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should validate salesPersonId field when provided', () => {
      const result = updateProjectSchema.safeParse({
        salesPersonId: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should validate constructionPersonId field when provided', () => {
      const result = updateProjectSchema.safeParse({
        constructionPersonId: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all valid fields for update', () => {
      const result = updateProjectSchema.safeParse({
        name: 'Updated Name',
        tradingPartnerId: '550e8400-e29b-41d4-a716-446655440002',
        salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
        constructionPersonId: '550e8400-e29b-41d4-a716-446655440001',
        siteAddress: 'Updated Address',
        description: 'Updated description',
      });
      expect(result.success).toBe(true);
    });

    it('should allow null for optional fields in update', () => {
      const result = updateProjectSchema.safeParse({
        constructionPersonId: null,
        siteAddress: null,
        description: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('projectFilterSchema', () => {
    it('should accept empty filter', () => {
      const result = projectFilterSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept valid search keyword', () => {
      const result = projectFilterSchema.safeParse({
        search: 'test',
      });
      expect(result.success).toBe(true);
    });

    it('should reject search keyword shorter than 2 characters', () => {
      const result = projectFilterSchema.safeParse({
        search: 'a',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(PROJECT_VALIDATION_MESSAGES.SEARCH_TOO_SHORT);
      }
    });

    it('should accept single status filter', () => {
      const result = projectFilterSchema.safeParse({
        status: 'PREPARING',
      });
      expect(result.success).toBe(true);
    });

    it('should accept comma-separated status filter', () => {
      const result = projectFilterSchema.safeParse({
        status: 'PREPARING,SURVEYING,ESTIMATING',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const result = projectFilterSchema.safeParse({
        status: 'INVALID_STATUS',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid date range filter', () => {
      const result = projectFilterSchema.safeParse({
        createdFrom: '2025-01-01',
        createdTo: '2025-12-31',
      });
      expect(result.success).toBe(true);
    });

    it('should accept ISO8601 datetime format', () => {
      const result = projectFilterSchema.safeParse({
        createdFrom: '2025-01-01T00:00:00Z',
        createdTo: '2025-12-31T23:59:59Z',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid date format', () => {
      const result = projectFilterSchema.safeParse({
        createdFrom: 'invalid-date',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all filter options combined', () => {
      const result = projectFilterSchema.safeParse({
        search: 'test project',
        status: 'PREPARING,SURVEYING',
        createdFrom: '2025-01-01',
        createdTo: '2025-12-31',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('paginationSchema', () => {
    it('should accept default values when empty', () => {
      const result = paginationSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it('should accept valid page number', () => {
      const result = paginationSchema.safeParse({
        page: '5',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(5);
      }
    });

    it('should reject page number less than 1', () => {
      const result = paginationSchema.safeParse({
        page: '0',
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative page number', () => {
      const result = paginationSchema.safeParse({
        page: '-1',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid limit', () => {
      const result = paginationSchema.safeParse({
        limit: '50',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it('should reject limit less than 1', () => {
      const result = paginationSchema.safeParse({
        limit: '0',
      });
      expect(result.success).toBe(false);
    });

    it('should reject limit greater than 100', () => {
      const result = paginationSchema.safeParse({
        limit: '101',
      });
      expect(result.success).toBe(false);
    });

    it('should accept limit of exactly 100', () => {
      const result = paginationSchema.safeParse({
        limit: '100',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(100);
      }
    });

    it('should handle numeric inputs as well as string inputs', () => {
      const result = paginationSchema.safeParse({
        page: 3,
        limit: 30,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(3);
        expect(result.data.limit).toBe(30);
      }
    });
  });

  describe('sortSchema', () => {
    it('should accept default values when empty', () => {
      const result = sortSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sort).toBe('updatedAt');
        expect(result.data.order).toBe('desc');
      }
    });

    it('should accept valid sort field: id', () => {
      const result = sortSchema.safeParse({
        sort: 'id',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid sort field: name', () => {
      const result = sortSchema.safeParse({
        sort: 'name',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid sort field: tradingPartnerId', () => {
      const result = sortSchema.safeParse({
        sort: 'tradingPartnerId',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid sort field: status', () => {
      const result = sortSchema.safeParse({
        sort: 'status',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid sort field: createdAt', () => {
      const result = sortSchema.safeParse({
        sort: 'createdAt',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid sort field: updatedAt', () => {
      const result = sortSchema.safeParse({
        sort: 'updatedAt',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid sort field', () => {
      const result = sortSchema.safeParse({
        sort: 'invalidField',
      });
      expect(result.success).toBe(false);
    });

    it('should accept asc order', () => {
      const result = sortSchema.safeParse({
        order: 'asc',
      });
      expect(result.success).toBe(true);
    });

    it('should accept desc order', () => {
      const result = sortSchema.safeParse({
        order: 'desc',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid order', () => {
      const result = sortSchema.safeParse({
        order: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid sort and order combination', () => {
      const result = sortSchema.safeParse({
        sort: 'createdAt',
        order: 'asc',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sort).toBe('createdAt');
        expect(result.data.order).toBe('asc');
      }
    });
  });

  describe('statusChangeSchema', () => {
    it('should accept valid status change without reason', () => {
      const result = statusChangeSchema.safeParse({
        status: 'SURVEYING',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid status change with reason', () => {
      const result = statusChangeSchema.safeParse({
        status: 'PREPARING',
        reason: 'Need to re-check the requirements',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const result = statusChangeSchema.safeParse({
        status: 'INVALID_STATUS',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing status', () => {
      const result = statusChangeSchema.safeParse({
        reason: 'some reason',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all valid status values', () => {
      for (const status of PROJECT_STATUSES) {
        const result = statusChangeSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('should accept optional null reason', () => {
      const result = statusChangeSchema.safeParse({
        status: 'SURVEYING',
        reason: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('projectIdParamSchema', () => {
    it('should accept valid UUID', () => {
      const result = projectIdParamSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = projectIdParamSchema.safeParse({
        id: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty id', () => {
      const result = projectIdParamSchema.safeParse({
        id: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing id', () => {
      const result = projectIdParamSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('type inference', () => {
    it('should provide correct type inference for createProjectSchema', () => {
      const validData = {
        name: 'Test Project',
        salesPersonId: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = createProjectSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        // Type inference check - these should compile without errors
        const _name: string = result.data.name;
        const _tradingPartnerId: string | null | undefined = result.data.tradingPartnerId;
        const _salesPersonId: string = result.data.salesPersonId;
        const _constructionPersonId: string | null | undefined = result.data.constructionPersonId;
        const _siteAddress: string | null | undefined = result.data.siteAddress;
        const _description: string | null | undefined = result.data.description;

        // Suppress unused variable warnings
        void _name;
        void _tradingPartnerId;
        void _salesPersonId;
        void _constructionPersonId;
        void _siteAddress;
        void _description;
      }
    });
  });
});
