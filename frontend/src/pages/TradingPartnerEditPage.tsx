/**
 * @fileoverview 取引先編集ページ
 *
 * Task 12.5: TradingPartnerEditPageの実装
 *
 * TradingPartnerFormContainerコンポーネントを編集モードで使用。
 * パンくずナビゲーション、更新成功時の詳細ページ遷移を提供。
 *
 * Requirements:
 * - 4.1: 編集ボタンクリックで現在の取引先情報がプリセットされた編集フォームを表示
 * - 4.5: 変更を保存時に取引先レコードを更新
 * - 4.6: 更新成功時に成功メッセージを表示し詳細ページに遷移
 * - 12.12: 取引先編集ページを /trading-partners/:id/edit のURLで提供する
 * - 12.17: パンくず: ダッシュボード > 取引先 > [取引先名] > 編集
 * - 12.22: 更新成功時は詳細ページへ遷移（FormContainerが処理）
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getTradingPartner } from '../api/trading-partners';
import type { TradingPartnerDetail } from '../types/trading-partner.types';
import { Breadcrumb, ResourceNotFound } from '../components/common';
import TradingPartnerFormContainer from '../components/trading-partners/TradingPartnerFormContainer';

// ============================================================================
// 型定義
// ============================================================================

/**
 * APIエラーの型
 */
interface ApiErrorLike {
  statusCode?: number;
  message?: string;
}

/**
 * ApiErrorかどうかを判定する型ガード
 */
function isApiError(error: unknown): error is ApiErrorLike {
  return (
    typeof error === 'object' && error !== null && ('statusCode' in error || 'message' in error)
  );
}

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
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 16px',
  } as React.CSSProperties,
  loadingSpinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #2563eb',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  } as React.CSSProperties,
  errorContainer: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '24px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  errorText: {
    color: '#991b1b',
    fontSize: '14px',
    marginBottom: '16px',
  } as React.CSSProperties,
  retryButton: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 取引先編集ページ
 *
 * TradingPartnerFormContainerを編集モードで表示し、
 * パンくずナビゲーションで現在位置を示す。
 *
 * Requirements:
 * - 4.1: 現在の取引先情報がプリセットされた編集フォームを表示
 * - 4.5: 変更を保存時に取引先レコードを更新
 * - 4.6: 更新成功時に成功メッセージ表示と詳細ページ遷移
 * - 12.12: /trading-partners/:id/edit のURLで提供
 * - 12.17: パンくず: ダッシュボード > 取引先 > [取引先名] > 編集
 * - 12.22: 更新成功時は詳細ページへ遷移（FormContainerが処理）
 */
export default function TradingPartnerEditPage() {
  const { id } = useParams<{ id: string }>();

  // データ状態
  const [partner, setPartner] = useState<TradingPartnerDetail | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);

  // エラー状態
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  /**
   * 取引先データを取得（パンくずの取引先名表示用）
   */
  const fetchPartner = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);
    setIsNotFound(false);

    try {
      const data = await getTradingPartner(id);
      setPartner(data);
    } catch (err) {
      if (isApiError(err)) {
        if (err.statusCode === 404) {
          setIsNotFound(true);
          return;
        }
        setError(err.message || 'エラーが発生しました');
      } else {
        setError('エラーが発生しました');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // 初回読み込み
  useEffect(() => {
    fetchPartner();
  }, [fetchPartner]);

  // 存在しない取引先の表示 (Requirement 12.13)
  if (isNotFound) {
    return (
      <main role="main" style={styles.container}>
        <ResourceNotFound
          resourceType="取引先"
          returnPath="/trading-partners"
          returnLabel="取引先一覧に戻る"
        />
      </main>
    );
  }

  // ローディング表示
  if (isLoading) {
    return (
      <main role="main" style={styles.container}>
        <div style={styles.loadingContainer}>
          <div role="status" style={styles.loadingSpinner} />
          <p>読み込み中...</p>
        </div>
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </main>
    );
  }

  // エラー表示（データ未取得の場合）
  if (error && !partner) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button type="button" onClick={fetchPartner} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  // パートナーデータがない場合
  if (!partner || !id) {
    return null;
  }

  // パンくずナビゲーション項目 (Requirement 12.17)
  const breadcrumbItems = [
    { label: 'ダッシュボード', path: '/' },
    { label: '取引先', path: '/trading-partners' },
    { label: partner.name, path: `/trading-partners/${partner.id}` },
    { label: '編集' },
  ];

  return (
    <main role="main" style={styles.container}>
      {/* パンくずナビゲーション (Requirement 12.17) */}
      <div style={styles.breadcrumbContainer}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* ページヘッダー */}
      <header style={styles.header}>
        <h1 style={styles.title}>取引先の編集</h1>
      </header>

      {/* フォームセクション */}
      <section style={styles.formSection}>
        {/*
          TradingPartnerFormContainer (Requirement 4.1, 4.5, 4.6, 12.22)
          - mode="edit" で編集モード
          - tradingPartnerId で編集対象を指定
          - 更新成功時は自動的に詳細ページへ遷移
          - キャンセル時も詳細ページへ遷移
          - 楽観的排他制御用のexpectedUpdatedAtはFormContainer内で処理
        */}
        <TradingPartnerFormContainer mode="edit" tradingPartnerId={id} />
      </section>
    </main>
  );
}
