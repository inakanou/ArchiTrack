/**
 * @fileoverview 取引先新規作成ページ
 *
 * Task 12.4: TradingPartnerCreatePageの実装
 *
 * TradingPartnerFormContainerコンポーネントを新規作成モードで使用。
 * パンくずナビゲーション、作成成功時の一覧ページ遷移を提供。
 *
 * Requirements:
 * - 2.1: 「新規作成」ボタンで取引先作成フォームを表示する
 * - 2.8: 取引先作成成功時に成功メッセージを表示し一覧ページに遷移
 * - 12.10: 取引先新規作成ページを /trading-partners/new のURLで提供する
 * - 12.16: パンくず: ダッシュボード > 取引先 > 新規作成
 * - 12.19: 一覧で「新規作成」ボタンクリックで新規作成ページに遷移
 * - 12.21: 作成成功時は一覧ページへ遷移
 */

import { Breadcrumb } from '../components/common';
import TradingPartnerFormContainer from '../components/trading-partners/TradingPartnerFormContainer';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1024px',
    margin: '0 auto',
    padding: '32px 16px',
  } as React.CSSProperties,
  breadcrumbContainer: {
    marginBottom: '24px',
  } as React.CSSProperties,
  header: {
    marginBottom: '24px',
  } as React.CSSProperties,
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#111827',
    margin: 0,
  } as React.CSSProperties,
  formSection: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    padding: '24px',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 取引先新規作成ページ
 *
 * TradingPartnerFormContainerを新規作成モードで表示し、
 * パンくずナビゲーションで現在位置を示す。
 *
 * Requirements:
 * - 2.1: 取引先作成フォームを表示
 * - 2.8: 作成成功時に成功メッセージ表示と一覧ページ遷移
 * - 12.10: /trading-partners/new のURLで提供
 * - 12.16: パンくず: ダッシュボード > 取引先 > 新規作成
 * - 12.19: 一覧から新規作成ページへの遷移をサポート
 * - 12.21: 作成成功時は一覧ページへ遷移（FormContainerが処理）
 */
export default function TradingPartnerCreatePage() {
  // パンくずナビゲーション項目 (Requirement 12.16)
  const breadcrumbItems = [
    { label: 'ダッシュボード', path: '/' },
    { label: '取引先', path: '/trading-partners' },
    { label: '新規作成' },
  ];

  return (
    <main role="main" style={styles.container}>
      {/* パンくずナビゲーション (Requirement 12.16) */}
      <div style={styles.breadcrumbContainer}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* ページヘッダー */}
      <header style={styles.header}>
        <h1 style={styles.title}>取引先の新規作成</h1>
      </header>

      {/* フォームセクション */}
      <section style={styles.formSection}>
        {/*
          TradingPartnerFormContainer (Requirement 2.1, 2.8, 12.21)
          - mode="create" で新規作成モード
          - 作成成功時は自動的に一覧ページへ遷移
          - キャンセル時も一覧ページへ遷移
        */}
        <TradingPartnerFormContainer mode="create" />
      </section>
    </main>
  );
}
