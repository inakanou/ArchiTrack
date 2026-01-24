/**
 * @fileoverview EstimateRequestStatusHistoryモデルとEstimateRequestStatus拡張のスキーマ定義テスト
 *
 * TDD: RED Phase - Prismaスキーマで定義するEstimateRequestStatus関連モデルの型検証
 *
 * Requirements (estimate-request):
 * - REQ-12.1-12.12: 見積依頼ステータス管理機能
 *   - 見積依頼のステータスを管理し、進捗状況を把握できる
 *   - ステータス: 依頼前、依頼済、見積受領済
 *   - ステータス変更履歴の記録
 *
 * Design Specification:
 * - EstimateRequestStatusEnum: BEFORE_REQUEST, REQUESTED, QUOTATION_RECEIVED
 * - EstimateRequestStatusHistoryテーブル: 変更履歴の永続化
 * - EstimateRequestモデルにstatusフィールドを追加
 */

import { describe, it, expect } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client.js';
import { EstimateRequestStatus } from '../../../generated/prisma/client.js';

describe('EstimateRequestStatus Enum', () => {
  it('should have BEFORE_REQUEST status', () => {
    // REQ-12.2: 依頼前ステータス
    expect(EstimateRequestStatus.BEFORE_REQUEST).toBe('BEFORE_REQUEST');
  });

  it('should have REQUESTED status', () => {
    // REQ-12.2: 依頼済ステータス
    expect(EstimateRequestStatus.REQUESTED).toBe('REQUESTED');
  });

  it('should have QUOTATION_RECEIVED status', () => {
    // REQ-12.2: 見積受領済ステータス
    expect(EstimateRequestStatus.QUOTATION_RECEIVED).toBe('QUOTATION_RECEIVED');
  });
});

describe('EstimateRequest Model with Status', () => {
  describe('EstimateRequest status field', () => {
    it('should have status field', () => {
      // REQ-12.1: 見積依頼詳細画面にステータス表示エリアを表示する
      const requestSelect: Prisma.EstimateRequestSelect = {
        status: true,
      };
      expect(requestSelect.status).toBe(true);
    });

    it('should allow creating with default status (BEFORE_REQUEST)', () => {
      // REQ-12.3: 新規作成時の見積依頼のデフォルトステータスを「依頼前」とする
      const validInput: Prisma.EstimateRequestCreateInput = {
        name: 'テスト見積依頼',
        project: { connect: { id: 'project-id' } },
        tradingPartner: { connect: { id: 'trading-partner-id' } },
        itemizedStatement: { connect: { id: 'itemized-statement-id' } },
        // status is optional with default value
      };

      expect(validInput.name).toBe('テスト見積依頼');
      // status will default to BEFORE_REQUEST when not specified
    });

    it('should allow creating with explicit status', () => {
      // ステータスを明示的に指定して作成
      const validInput: Prisma.EstimateRequestCreateInput = {
        name: 'テスト見積依頼',
        status: EstimateRequestStatus.BEFORE_REQUEST,
        project: { connect: { id: 'project-id' } },
        tradingPartner: { connect: { id: 'trading-partner-id' } },
        itemizedStatement: { connect: { id: 'itemized-statement-id' } },
      };

      expect(validInput.status).toBe('BEFORE_REQUEST');
    });

    it('should allow filtering by status', () => {
      // REQ-12.12: 見積依頼一覧画面に各見積依頼のステータスを表示する
      const where: Prisma.EstimateRequestWhereInput = {
        status: EstimateRequestStatus.REQUESTED,
      };
      expect(where.status).toBe('REQUESTED');
    });

    it('should allow updating status', () => {
      // REQ-12.9: ユーザーがステータス遷移ボタンをクリックしたとき、ステータスを更新する
      const updateInput: Prisma.EstimateRequestUpdateInput = {
        status: EstimateRequestStatus.QUOTATION_RECEIVED,
      };
      expect(updateInput.status).toBe('QUOTATION_RECEIVED');
    });
  });

  describe('EstimateRequest receivedQuotations relation', () => {
    it('should have receivedQuotations relation', () => {
      // REQ-11.11: 1つの見積依頼に対して複数の受領見積書の登録を許可する
      const requestSelect: Prisma.EstimateRequestSelect = {
        receivedQuotations: true,
      };
      expect(requestSelect.receivedQuotations).toBe(true);
    });
  });

  describe('EstimateRequest statusHistory relation', () => {
    it('should have statusHistory relation', () => {
      // REQ-12.11: ステータス変更履歴を記録する
      const requestSelect: Prisma.EstimateRequestSelect = {
        statusHistory: true,
      };
      expect(requestSelect.statusHistory).toBe(true);
    });
  });
});

describe('EstimateRequestStatusHistory Model Schema', () => {
  describe('EstimateRequestStatusHistory CreateInput type structure', () => {
    it('should require mandatory fields', () => {
      // REQ-12.11: ステータス変更履歴の必須フィールドの検証
      const validInput: Prisma.EstimateRequestStatusHistoryCreateInput = {
        toStatus: EstimateRequestStatus.REQUESTED,
        estimateRequest: { connect: { id: 'estimate-request-id' } },
        changedBy: { connect: { id: 'user-id' } },
      };

      expect(validInput.toStatus).toBe('REQUESTED');
    });

    it('should allow optional fromStatus for initial status', () => {
      // 初回ステータス設定時はfromStatusがnull
      const validInput: Prisma.EstimateRequestStatusHistoryCreateInput = {
        fromStatus: null,
        toStatus: EstimateRequestStatus.BEFORE_REQUEST,
        estimateRequest: { connect: { id: 'estimate-request-id' } },
        changedBy: { connect: { id: 'user-id' } },
      };

      expect(validInput.fromStatus).toBeNull();
    });

    it('should allow fromStatus for status transitions', () => {
      // ステータス遷移時はfromStatusを指定
      const validInput: Prisma.EstimateRequestStatusHistoryCreateInput = {
        fromStatus: EstimateRequestStatus.BEFORE_REQUEST,
        toStatus: EstimateRequestStatus.REQUESTED,
        estimateRequest: { connect: { id: 'estimate-request-id' } },
        changedBy: { connect: { id: 'user-id' } },
      };

      expect(validInput.fromStatus).toBe('BEFORE_REQUEST');
      expect(validInput.toStatus).toBe('REQUESTED');
    });
  });

  describe('EstimateRequestStatusHistory fields validation', () => {
    it('should have id field as UUID', () => {
      // 履歴の一意ID
      const historySelect: Prisma.EstimateRequestStatusHistorySelect = {
        id: true,
      };
      expect(historySelect.id).toBe(true);
    });

    it('should have estimateRequestId field', () => {
      // 見積依頼IDフィールド（外部キー）
      const historySelect: Prisma.EstimateRequestStatusHistorySelect = {
        estimateRequestId: true,
      };
      expect(historySelect.estimateRequestId).toBe(true);
    });

    it('should have fromStatus field (nullable)', () => {
      // 変更前ステータス（初回はnull）
      const historySelect: Prisma.EstimateRequestStatusHistorySelect = {
        fromStatus: true,
      };
      expect(historySelect.fromStatus).toBe(true);
    });

    it('should have toStatus field', () => {
      // 変更後ステータス（必須）
      const historySelect: Prisma.EstimateRequestStatusHistorySelect = {
        toStatus: true,
      };
      expect(historySelect.toStatus).toBe(true);
    });

    it('should have changedById field', () => {
      // 変更者ID（外部キー）
      const historySelect: Prisma.EstimateRequestStatusHistorySelect = {
        changedById: true,
      };
      expect(historySelect.changedById).toBe(true);
    });

    it('should have changedAt field', () => {
      // 変更日時（自動設定）
      const historySelect: Prisma.EstimateRequestStatusHistorySelect = {
        changedAt: true,
      };
      expect(historySelect.changedAt).toBe(true);
    });
  });

  describe('EstimateRequestStatusHistory relations', () => {
    it('should have estimateRequest relation', () => {
      // 見積依頼へのリレーション
      const historySelect: Prisma.EstimateRequestStatusHistorySelect = {
        estimateRequest: true,
        estimateRequestId: true,
      };
      expect(historySelect.estimateRequest).toBe(true);
      expect(historySelect.estimateRequestId).toBe(true);
    });

    it('should have changedBy relation (User)', () => {
      // 変更者（ユーザー）へのリレーション
      const historySelect: Prisma.EstimateRequestStatusHistorySelect = {
        changedBy: true,
        changedById: true,
      };
      expect(historySelect.changedBy).toBe(true);
      expect(historySelect.changedById).toBe(true);
    });
  });

  describe('EstimateRequestStatusHistory filter and sort fields', () => {
    it('should allow filtering by estimateRequestId', () => {
      // 見積依頼IDでのフィルタリング
      const where: Prisma.EstimateRequestStatusHistoryWhereInput = {
        estimateRequestId: 'estimate-request-id',
      };
      expect(where.estimateRequestId).toBeDefined();
    });

    it('should allow filtering by toStatus', () => {
      // 変更後ステータスでのフィルタリング
      const where: Prisma.EstimateRequestStatusHistoryWhereInput = {
        toStatus: EstimateRequestStatus.QUOTATION_RECEIVED,
      };
      expect(where.toStatus).toBe('QUOTATION_RECEIVED');
    });

    it('should allow filtering by changedById', () => {
      // 変更者IDでのフィルタリング
      const where: Prisma.EstimateRequestStatusHistoryWhereInput = {
        changedById: 'user-id',
      };
      expect(where.changedById).toBeDefined();
    });

    it('should allow sorting by changedAt', () => {
      // 変更日時でのソート
      const orderBy: Prisma.EstimateRequestStatusHistoryOrderByWithRelationInput = {
        changedAt: 'desc',
      };
      expect(orderBy.changedAt).toBe('desc');
    });
  });
});
