/**
 * @fileoverview 自社情報ページコンポーネント
 *
 * Task 6.2: CompanyInfoPageコンポーネントの実装
 *
 * 自社情報の閲覧・編集機能を提供するページコンポーネントです。
 * データ取得、保存、エラーハンドリング、競合ダイアログの管理を行います。
 *
 * Requirements:
 * - 1.1: サイドバーから「自社情報」をクリックで自社情報ページを表示
 * - 1.2: 入力欄表示
 * - 1.3: 登録済み情報のプリセット表示
 * - 1.4: 未登録時の空フォーム表示
 * - 2.4: 保存成功時のToast表示
 * - 5.1: ページ遷移時の未保存確認
 * - 7.1-7.3: エラーハンドリング
 * - 8.1: 楽観的排他制御の競合ダイアログ表示
 *
 * @example
 * ```tsx
 * <Route path="/company-info" element={<CompanyInfoPage />} />
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import { getCompanyInfo, updateCompanyInfo } from '../api/company-info';
import CompanyInfoForm from '../components/company-info/CompanyInfoForm';
import Breadcrumb from '../components/common/Breadcrumb';
import ConflictDialog from '../components/common/ConflictDialog';
import { useToast } from '../hooks/useToast';
import type { CompanyInfo, CompanyInfoFormData } from '../types/company-info.types';
import {
  isCompanyInfo,
  companyInfoToFormData,
  formDataToUpdateInput,
  EMPTY_COMPANY_INFO_FORM_DATA,
} from '../types/company-info.types';

// ============================================================================
// 定数
// ============================================================================

/** パンくずナビゲーション項目 */
const BREADCRUMB_ITEMS = [
  { label: 'ダッシュボード', path: '/' },
  { label: '自社情報' },
];

/** スタイル定数 */
const STYLES = {
  container: {
    padding: '24px',
    maxWidth: '800px',
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    marginTop: '16px',
    marginBottom: '16px',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '200px',
    fontSize: '16px',
    color: '#6b7280',
  },
  error: {
    padding: '16px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    color: '#991b1b',
  },
} as const;

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 自社情報ページコンポーネント
 *
 * 自社情報の閲覧・編集機能を提供します。
 *
 * Requirements:
 * - 1.1: サイドバーから「自社情報」をクリックで自社情報ページを表示
 * - 1.2: 入力欄表示
 * - 1.3: 登録済み情報のプリセット表示
 * - 1.4: 未登録時の空フォーム表示
 * - 2.4: 保存成功時のToast表示
 * - 5.1: ページ遷移時の未保存確認
 * - 7.1-7.3: エラーハンドリング
 * - 8.1: 楽観的排他制御の競合ダイアログ表示
 */
function CompanyInfoPage() {
  // ============================================================================
  // 状態管理
  // ============================================================================

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [_isDirty, setIsDirty] = useState(false);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  const toast = useToast();

  // ============================================================================
  // データ取得
  // ============================================================================

  /**
   * 自社情報を取得する
   */
  const fetchCompanyInfo = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getCompanyInfo();

      if (isCompanyInfo(response)) {
        setCompanyInfo(response);
      } else {
        // 未登録時は空
        setCompanyInfo(null);
      }
    } catch (err) {
      console.error('Failed to fetch company info:', err);
      setError('データの取得に失敗しました。再度お試しください。');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 初回データ取得
   */
  useEffect(() => {
    fetchCompanyInfo();
  }, [fetchCompanyInfo]);

  // ============================================================================
  // イベントハンドラ
  // ============================================================================

  /**
   * フォーム送信ハンドラ
   */
  const handleSubmit = useCallback(
    async (formData: CompanyInfoFormData) => {
      setIsSubmitting(true);

      try {
        const input = formDataToUpdateInput(formData);
        const result = await updateCompanyInfo(input);

        setCompanyInfo(result);
        setIsDirty(false);
        toast.success('自社情報を保存しました');
      } catch (err) {
        console.error('Failed to save company info:', err);

        // 409 Conflictエラーの場合
        if (err && typeof err === 'object' && 'status' in err && err.status === 409) {
          setIsConflictDialogOpen(true);
        } else {
          toast.error('保存に失敗しました');
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [toast]
  );

  /**
   * リセットハンドラ
   */
  const handleReset = useCallback(async () => {
    await fetchCompanyInfo();
    setIsDirty(false);
  }, [fetchCompanyInfo]);

  /**
   * 変更状態変更ハンドラ
   */
  const handleDirtyChange = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  /**
   * 競合ダイアログの再読み込みハンドラ
   */
  const handleConflictReload = useCallback(async () => {
    setIsReloading(true);

    try {
      await fetchCompanyInfo();
      setIsConflictDialogOpen(false);
    } finally {
      setIsReloading(false);
    }
  }, [fetchCompanyInfo]);

  /**
   * 競合ダイアログの閉じるハンドラ
   */
  const handleConflictClose = useCallback(() => {
    setIsConflictDialogOpen(false);
  }, []);

  // ============================================================================
  // フォームデータ変換
  // ============================================================================

  const initialFormData: CompanyInfoFormData = companyInfo
    ? companyInfoToFormData(companyInfo)
    : EMPTY_COMPANY_INFO_FORM_DATA;

  // ============================================================================
  // レンダリング
  // ============================================================================

  return (
    <div style={STYLES.container}>
      {/* ヘッダー */}
      <header style={STYLES.header}>
        <Breadcrumb items={BREADCRUMB_ITEMS} />
        <h1 style={STYLES.title}>自社情報</h1>
      </header>

      {/* ローディング表示 */}
      {isLoading && <div style={STYLES.loading}>読み込み中...</div>}

      {/* エラー表示 */}
      {error && !isLoading && <div style={STYLES.error}>{error}</div>}

      {/* フォーム */}
      {!isLoading && !error && (
        <CompanyInfoForm
          initialData={initialFormData}
          onSubmit={handleSubmit}
          onReset={handleReset}
          onDirtyChange={handleDirtyChange}
          isSubmitting={isSubmitting}
        />
      )}

      {/* 競合ダイアログ */}
      <ConflictDialog
        isOpen={isConflictDialogOpen}
        onReload={handleConflictReload}
        onClose={handleConflictClose}
        resourceName="自社情報"
        isReloading={isReloading}
      />
    </div>
  );
}

export default CompanyInfoPage;
