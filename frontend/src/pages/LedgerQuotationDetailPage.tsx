/**
 * @fileoverview 単価台帳の見積の詳細の画面（/unit-price-ledger/quotations/:id）
 *
 * unit-price-ledger タスク4.1: 経路と枠だけを置く。詳細と修正は 4.4、案件の受領見積書の印の編集は 4.5 が作る。
 *
 * 経路は認証済みの経路で、ProtectedRoute はロールしか確かめない。画面の中で台帳の管理の権限
 * （`unit_price_ledger:manage`）を確かめ、無ければ内容を出さない（design.md の UnitPriceLedgerPage と同じ）。
 *
 * Requirements (unit-price-ledger):
 * - 10.1: 台帳の画面を台帳の管理の権限を持つ利用者だけに許す
 * - 10.4: 権限の無い利用者には内容を出さない
 */

import type { ReactElement } from 'react';
import { usePermission } from '../hooks/usePermission';
import { UNIT_PRICE_LEDGER_MANAGE_PERMISSION } from '../api/unit-price-ledger';

/** 権限の無い利用者に出す文言 */
const NO_PERMISSION_MESSAGE = '単価台帳を表示する権限がありません';

const STYLES = {
  container: { maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' },
  title: { fontSize: '24px', fontWeight: 700, color: '#111827', margin: 0 },
  alert: {
    padding: '12px 16px',
    borderRadius: '6px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#991b1b',
  },
  loading: { color: '#4b5563' },
} as const;

export default function LedgerQuotationDetailPage(): ReactElement {
  const { hasPermission, isLoading } = usePermission();

  if (isLoading) {
    return (
      <div style={STYLES.container}>
        <p role="status" style={STYLES.loading}>
          読み込み中...
        </p>
      </div>
    );
  }

  if (!hasPermission(UNIT_PRICE_LEDGER_MANAGE_PERMISSION)) {
    return (
      <div style={STYLES.container}>
        <p role="alert" style={STYLES.alert}>
          {NO_PERMISSION_MESSAGE}
        </p>
      </div>
    );
  }

  return (
    <div style={STYLES.container}>
      <header>
        <h1 style={STYLES.title}>見積の詳細</h1>
      </header>
    </div>
  );
}
