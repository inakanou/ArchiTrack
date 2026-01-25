/**
 * @fileoverview 見積依頼APIにステータス・受領見積書数を追加するテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 12.1: ステータスを表示する
 * - 12.4: 初期ステータスは「依頼前」
 * - 12.12: 一覧画面にステータスを表示する
 *
 * Task 13.4: 見積依頼一覧・詳細APIにステータス情報を追加
 *
 * @module __tests__/unit/services/estimate-request-status-extension
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock PrismaClient
const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();

vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({
    estimateRequest: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      count: mockCount,
    },
    receivedQuotation: {
      count: vi.fn().mockResolvedValue(0),
    },
  })),
}));

vi.mock('../../../services/audit-log.service.js', () => ({
  AuditLogService: class {
    createLog = vi.fn();
  },
}));

import { EstimateRequestService } from '../../../services/estimate-request.service.js';
import getPrismaClient from '../../../db.js';
import { AuditLogService } from '../../../services/audit-log.service.js';

describe('EstimateRequestService - Status Extension (Task 13.4)', () => {
  let service: EstimateRequestService;
  const prisma = getPrismaClient();
  const auditLogService = new AuditLogService({ prisma });

  const validUUID = '550e8400-e29b-41d4-a716-446655440000';
  const projectId = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EstimateRequestService({
      prisma,
      auditLogService,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findById - with status and receivedQuotationCount', () => {
    it('should return estimate request with status and receivedQuotationCount', async () => {
      const mockEstimateRequest = {
        id: validUUID,
        projectId,
        tradingPartnerId: '550e8400-e29b-41d4-a716-446655440002',
        itemizedStatementId: '550e8400-e29b-41d4-a716-446655440003',
        name: 'テスト見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        status: 'BEFORE_REQUEST',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        deletedAt: null,
        tradingPartner: { id: '550e8400-e29b-41d4-a716-446655440002', name: 'テスト取引先' },
        itemizedStatement: { id: '550e8400-e29b-41d4-a716-446655440003', name: 'テスト内訳書' },
        _count: {
          receivedQuotations: 2,
        },
      };

      mockFindUnique.mockResolvedValue(mockEstimateRequest);

      const result = await service.findById(validUUID);

      expect(result).not.toBeNull();
      expect(result!.status).toBe('BEFORE_REQUEST');
      expect(result!.receivedQuotationCount).toBe(2);
    });

    it('should return status REQUESTED when set', async () => {
      const mockEstimateRequest = {
        id: validUUID,
        projectId,
        tradingPartnerId: '550e8400-e29b-41d4-a716-446655440002',
        itemizedStatementId: '550e8400-e29b-41d4-a716-446655440003',
        name: 'テスト見積依頼',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        status: 'REQUESTED',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        deletedAt: null,
        tradingPartner: { id: '550e8400-e29b-41d4-a716-446655440002', name: 'テスト取引先' },
        itemizedStatement: { id: '550e8400-e29b-41d4-a716-446655440003', name: 'テスト内訳書' },
        _count: {
          receivedQuotations: 0,
        },
      };

      mockFindUnique.mockResolvedValue(mockEstimateRequest);

      const result = await service.findById(validUUID);

      expect(result).not.toBeNull();
      expect(result!.status).toBe('REQUESTED');
      expect(result!.receivedQuotationCount).toBe(0);
    });
  });

  describe('findByProjectId - with status', () => {
    it('should return estimate requests list with status', async () => {
      const mockRequests = [
        {
          id: validUUID,
          projectId,
          tradingPartnerId: '550e8400-e29b-41d4-a716-446655440002',
          itemizedStatementId: '550e8400-e29b-41d4-a716-446655440003',
          name: 'テスト見積依頼1',
          method: 'EMAIL',
          includeBreakdownInBody: false,
          status: 'BEFORE_REQUEST',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
          deletedAt: null,
          tradingPartner: { id: '550e8400-e29b-41d4-a716-446655440002', name: 'テスト取引先' },
          itemizedStatement: { id: '550e8400-e29b-41d4-a716-446655440003', name: 'テスト内訳書' },
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440004',
          projectId,
          tradingPartnerId: '550e8400-e29b-41d4-a716-446655440005',
          itemizedStatementId: '550e8400-e29b-41d4-a716-446655440003',
          name: 'テスト見積依頼2',
          method: 'FAX',
          includeBreakdownInBody: true,
          status: 'QUOTATION_RECEIVED',
          createdAt: new Date('2024-01-02T00:00:00Z'),
          updatedAt: new Date('2024-01-02T00:00:00Z'),
          deletedAt: null,
          tradingPartner: { id: '550e8400-e29b-41d4-a716-446655440005', name: '別の取引先' },
          itemizedStatement: { id: '550e8400-e29b-41d4-a716-446655440003', name: 'テスト内訳書' },
        },
      ];

      mockFindMany.mockResolvedValue(mockRequests);
      mockCount.mockResolvedValue(2);

      const result = await service.findByProjectId(projectId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.status).toBe('BEFORE_REQUEST');
      expect(result.data[1]!.status).toBe('QUOTATION_RECEIVED');
    });

    it('should return empty list with no status fields', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      const result = await service.findByProjectId(projectId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });
});
