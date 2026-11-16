/**
 * @fileoverview 受領見積書の監査ログの metadata の出所（source）の型の単体試験（unit-price-ledger タスク1.4）
 *
 * 取り込みは `ledger_import`、台帳の画面での修正・削除は `unit_price_ledger` を metadata の source に書く
 * （design.md の LedgerImportService・LedgerEditService）。
 */
import { describe, it, expect, expectTypeOf } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  RECEIVED_QUOTATION_AUDIT_SOURCES,
  type ReceivedQuotationAuditMetadata,
  type ReceivedQuotationAuditSource,
} from '../../../types/audit-log.types.js';

describe('受領見積書の監査ログの出所', () => {
  it('出所は取り込みと台帳の画面の 2 つ', () => {
    expect(RECEIVED_QUOTATION_AUDIT_SOURCES).toEqual(['ledger_import', 'unit_price_ledger']);
    expectTypeOf<ReceivedQuotationAuditSource>().toEqualTypeOf<
      'ledger_import' | 'unit_price_ledger'
    >();
  });

  it('metadata は監査ログの metadata（JSON）として渡せる', () => {
    const metadata: ReceivedQuotationAuditMetadata = { source: 'ledger_import' };
    const asJson: Prisma.InputJsonValue = metadata;

    expect(asJson).toEqual({ source: 'ledger_import' });
    expectTypeOf<ReceivedQuotationAuditMetadata>().toEqualTypeOf<{
      source: ReceivedQuotationAuditSource;
    }>();
  });
});
