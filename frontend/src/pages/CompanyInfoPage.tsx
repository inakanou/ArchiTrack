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
import { useBlocker, useNavigate } from 'react-router-dom';
import { getCompanyInfo, updateCompanyInfo } from '../api/company-info';
import CompanyInfoForm from '../components/company-info/CompanyInfoForm';
import Breadcrumb from '../components/common/Breadcrumb';
import ConflictDialog from '../components/common/ConflictDialog';
import UnsavedChangesDialog from '../components/common/UnsavedChangesDialog';
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
const BREADCRUMB_ITEMS = [{ label: 'ダッシュボード', path: '/' }, { label: '自社情報' }];

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
  const [isDirty, setIsDirty] = useState(false);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  const toast = useToast();
  const navigate = useNavigate();

  // ============================================================================
  // 未保存確認ダイアログ（Task 6.5: Requirement 3.4）
  // ============================================================================

  /**
   * ページ離脱時のナビゲーションブロッカー
   * フォームに未保存の変更がある場合、ナビゲーションをブロックする
   */
  const blocker = useBlocker(isDirty);

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
      // ネットワークエラーの判別（fetch APIはネットワークエラー時にTypeErrorをスロー）
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('通信エラーが発生しました。再試行してください。');
      } else {
        setError('通信エラーが発生しました。再試行してください。');
      }
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

        // ApiErrorのstatusCodeプロパティでエラータイプを判別
        if (err && typeof err === 'object' && 'statusCode' in err) {
          const statusCode = (err as { statusCode: number }).statusCode;
          if (statusCode === 401) {
            // 401認証エラーの場合、ログインページにリダイレクト
            navigate('/login?redirectUrl=' + encodeURIComponent('/company-info'));
          } else if (statusCode === 409) {
            // 409 Conflictエラーの場合
            setIsConflictDialogOpen(true);
          } else if (statusCode >= 500) {
            // 5xxサーバーエラーの場合
            toast.error('システムエラーが発生しました。しばらくしてからお試しください。');
          } else {
            toast.error('保存に失敗しました');
          }
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

  /**
   * 未保存確認ダイアログの「ページを離れる」ハンドラ
   */
  const handleUnsavedLeave = useCallback(() => {
    blocker.proceed?.();
  }, [blocker]);

  /**
   * 未保存確認ダイアログの「このページにとどまる」ハンドラ
   */
  const handleUnsavedStay = useCallback(() => {
    blocker.reset?.();
  }, [blocker]);

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
      {error && !isLoading && (
        <div style={STYLES.error}>
          <p style={{ margin: 0 }}>{error}</p>
          <button
            type="button"
            onClick={fetchCompanyInfo}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            再試行
          </button>
        </div>
      )}

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

      {/* 未保存確認ダイアログ (Task 6.5: Requirement 3.4) */}
      <UnsavedChangesDialog
        isOpen={blocker.state === 'blocked'}
        onLeave={handleUnsavedLeave}
        onStay={handleUnsavedStay}
      />
    </div>
  );
}

export default CompanyInfoPage;
