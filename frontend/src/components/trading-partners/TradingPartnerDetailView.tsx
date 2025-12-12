/**
 * @fileoverview 取引先詳細表示コンポーネント
 *
 * Task 10.1: 取引先詳細表示コンポーネントの実装
 * Task 19.3: 取引先詳細画面からbranchNameKana/representativeNameKana表示を削除
 *
 * 取引先の詳細情報を表示するコンポーネントです。
 * 全フィールドの表示、請求締日・支払日の日本語表記変換、
 * 編集・削除ボタンの配置を提供します。
 *
 * Requirements:
 * - 3.1: ユーザーが一覧から取引先を選択したとき、取引先詳細ページを表示する
 * - 3.2: 以下の情報を詳細ページに表示する: 名前、フリガナ、部課/支店/支社名、
 *        代表者名、種別、住所、電話番号、FAX番号、メールアドレス、請求締日、
 *        支払日、備考、登録日、更新日
 *        ※ 部課/支店/支社フリガナ、代表者フリガナは削除（Task 19.3）
 * - 3.3: 編集ボタンと削除ボタンを詳細ページに表示する
 */

import { memo } from 'react';
import type { TradingPartnerDetail } from '../../types/trading-partner.types';
import { TRADING_PARTNER_TYPE_LABELS } from '../../types/trading-partner.types';
import { formatBillingClosingDay, formatPaymentDate, formatDateTime } from '../../utils/formatters';

// ============================================================================
// 型定義
// ============================================================================

/**
 * TradingPartnerDetailViewコンポーネントのプロパティ
 */
export interface TradingPartnerDetailViewProps {
  /** 取引先詳細データ */
  partner: TradingPartnerDetail;
  /** 編集ボタンクリック時のコールバック */
  onEdit: () => void;
  /** 削除ボタンクリック時のコールバック */
  onDelete: () => void;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
    flexWrap: 'wrap' as const,
    gap: '16px',
  } as React.CSSProperties,
  titleSection: {
    flex: 1,
    minWidth: '200px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '4px',
  } as React.CSSProperties,
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
  actionsContainer: {
    display: 'flex',
    gap: '12px',
  } as React.CSSProperties,
  button: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  editButton: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
  } as React.CSSProperties,
  deleteButton: {
    backgroundColor: '#ffffff',
    color: '#dc2626',
    border: '1px solid #dc2626',
  } as React.CSSProperties,
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
    marginBottom: '24px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '16px',
    paddingBottom: '8px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
  } as React.CSSProperties,
  field: {
    marginBottom: '16px',
  } as React.CSSProperties,
  fieldLabel: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: '4px',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,
  fieldValue: {
    fontSize: '14px',
    color: '#1f2937',
  } as React.CSSProperties,
  notes: {
    whiteSpace: 'pre-wrap' as const,
    fontSize: '14px',
    color: '#374151',
    lineHeight: '1.6',
  } as React.CSSProperties,
  typeBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    fontSize: '12px',
    fontWeight: '500',
    borderRadius: '9999px',
    backgroundColor: '#e5e7eb',
    color: '#374151',
    marginRight: '8px',
  } as React.CSSProperties,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 取引先種別を日本語ラベルの配列に変換
 */
function formatTypes(types: TradingPartnerDetail['types']): string[] {
  return types.map((type) => TRADING_PARTNER_TYPE_LABELS[type] || type);
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * フィールド表示コンポーネント
 */
interface FieldProps {
  label: string;
  value: string | null | undefined;
  className?: string;
}

function Field({ label, value }: FieldProps) {
  return (
    <div style={styles.field}>
      <div style={styles.fieldLabel}>{label}</div>
      <div style={styles.fieldValue}>{value || '-'}</div>
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 取引先詳細表示コンポーネント
 *
 * 取引先の全フィールドを表示し、編集・削除ボタンを提供します。
 * 請求締日と支払日は日本語表記に変換して表示します。
 * React.memoでラップし、propsが変更されない限り再レンダリングを防止します（REQ-9.2対応）。
 *
 * Requirements:
 * - 3.1: 取引先詳細ページを表示する
 * - 3.2: 全フィールドを表示する
 * - 3.3: 編集ボタンと削除ボタンを配置する
 */
const TradingPartnerDetailView = memo(function TradingPartnerDetailView({
  partner,
  onEdit,
  onDelete,
}: TradingPartnerDetailViewProps) {
  // 請求締日を日本語表記に変換
  const billingClosingDayLabel = formatBillingClosingDay(partner.billingClosingDay);

  // 支払日を日本語表記に変換
  const paymentDateLabel = formatPaymentDate(partner.paymentMonthOffset, partner.paymentDay);

  // 種別を日本語ラベルに変換
  const typeLabels = formatTypes(partner.types);

  // 日付をフォーマット
  const createdAtFormatted = formatDateTime(partner.createdAt);
  const updatedAtFormatted = formatDateTime(partner.updatedAt);

  return (
    <div style={styles.container}>
      {/* ヘッダー */}
      <div style={styles.header}>
        <div style={styles.titleSection}>
          <div style={styles.title}>{partner.name}</div>
          <div style={styles.subtitle}>{partner.nameKana}</div>
        </div>
        <div style={styles.actionsContainer}>
          <button type="button" onClick={onEdit} style={{ ...styles.button, ...styles.editButton }}>
            編集
          </button>
          <button
            type="button"
            onClick={onDelete}
            style={{ ...styles.button, ...styles.deleteButton }}
          >
            削除
          </button>
        </div>
      </div>

      {/* 基本情報セクション */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>基本情報</h2>
        <div style={styles.grid}>
          <Field label="取引先名" value={partner.name} />
          <Field label="フリガナ" value={partner.nameKana} />
          <Field label="部課/支店/支社名" value={partner.branchName} />
          <Field label="代表者名" value={partner.representativeName} />
          <div style={styles.field}>
            <div style={styles.fieldLabel}>取引先種別</div>
            <div style={styles.fieldValue}>
              {typeLabels.map((label, index) => (
                <span key={index} style={styles.typeBadge}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 連絡先情報セクション */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>連絡先情報</h2>
        <div style={styles.grid}>
          <Field label="住所" value={partner.address} />
          <Field label="電話番号" value={partner.phoneNumber} />
          <Field label="FAX番号" value={partner.faxNumber} />
          <Field label="メールアドレス" value={partner.email} />
        </div>
      </section>

      {/* 請求・支払情報セクション */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>請求・支払情報</h2>
        <div style={styles.grid}>
          <Field label="請求締日" value={billingClosingDayLabel} />
          <Field label="支払日" value={paymentDateLabel} />
        </div>
      </section>

      {/* 備考セクション */}
      {partner.notes && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>備考</h2>
          <div style={styles.notes}>{partner.notes}</div>
        </section>
      )}

      {/* システム情報セクション */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>システム情報</h2>
        <div style={styles.grid}>
          <Field label="登録日" value={createdAtFormatted} />
          <Field label="更新日" value={updatedAtFormatted} />
        </div>
      </section>
    </div>
  );
});

export default TradingPartnerDetailView;
