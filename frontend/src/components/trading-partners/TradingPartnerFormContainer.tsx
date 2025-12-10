/**
 * @fileoverview 取引先フォームコンテナコンポーネント
 *
 * Task 8.2: フォーム送信とエラーハンドリングの実装
 *
 * 取引先作成・編集フォームのコンテナコンポーネントです。
 * API呼び出し、成功時のトースト表示と画面遷移、
 * エラーハンドリング（バリデーションエラー、重複エラー、競合エラー、ネットワークエラー）を管理します。
 *
 * Requirements:
 * - 2.7: 有効なデータを入力して保存ボタンクリックで新しい取引先レコードを作成
 * - 2.8: 取引先作成成功時に成功メッセージを表示し一覧ページに遷移
 * - 2.11: 同一の取引先名が既に存在する場合のエラー表示
 * - 4.5: 変更を保存時に取引先レコードを更新
 * - 4.6: 更新成功時に成功メッセージを表示し詳細ページに遷移
 * - 4.8: 別の取引先と重複する取引先名に変更しようとした場合のエラー表示
 * - 8.1: ネットワークエラー時の再試行ボタン表示
 * - 8.2: サーバーエラー（5xx）時のメッセージ表示
 * - 8.4: ToastNotificationでエラー通知
 *
 * @example
 * ```tsx
 * // 作成モード
 * <TradingPartnerFormContainer mode="create" />
 *
 * // 編集モード
 * <TradingPartnerFormContainer mode="edit" tradingPartnerId="123" />
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import TradingPartnerForm, { TradingPartnerFormData } from './TradingPartnerForm';
import NetworkErrorDisplay from '../NetworkErrorDisplay';
import { useToast } from '../../hooks/useToast';
import { useNetworkError } from '../../hooks/useNetworkError';
import { ApiError } from '../../api/client';
import {
  createTradingPartner,
  updateTradingPartner,
  getTradingPartner,
} from '../../api/trading-partners';
import type { TradingPartnerInfo } from '../../types/trading-partner.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * TradingPartnerFormContainerのプロパティ
 */
export interface TradingPartnerFormContainerProps {
  /** フォームモード */
  mode: 'create' | 'edit';
  /** 編集対象の取引先ID（編集モード時必須） */
  tradingPartnerId?: string;
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 取引先フォームコンテナコンポーネント
 *
 * API呼び出し、成功時のトースト表示と画面遷移、
 * エラーハンドリングを管理します。
 */
function TradingPartnerFormContainer({ mode, tradingPartnerId }: TradingPartnerFormContainerProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const { error: networkError, isRetrying, handleError, retry, clearError } = useNetworkError();

  // 状態管理
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(mode === 'edit');
  const [initialData, setInitialData] = useState<TradingPartnerFormData | undefined>(undefined);
  const [tradingPartner, setTradingPartner] = useState<TradingPartnerInfo | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

  // 最後に送信したデータを保持（再試行用）
  const lastSubmitDataRef = useRef<TradingPartnerFormData | null>(null);

  // ============================================================================
  // データ取得（編集モード）
  // ============================================================================

  /**
   * 取引先データをフェッチする
   */
  const fetchTradingPartner = useCallback(async () => {
    if (mode !== 'edit' || !tradingPartnerId) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await getTradingPartner(tradingPartnerId);
      setTradingPartner(data);
      setInitialData({
        name: data.name,
        nameKana: data.nameKana,
        types: data.types,
        address: data.address,
        branchName: data.branchName,
        branchNameKana: data.branchNameKana,
        representativeName: data.representativeName,
        representativeNameKana: data.representativeNameKana,
        phoneNumber: data.phoneNumber,
        faxNumber: data.faxNumber,
        email: data.email,
        billingClosingDay: data.billingClosingDay,
        paymentMonthOffset: data.paymentMonthOffset,
        paymentDay: data.paymentDay,
        notes: data.notes,
      });
    } catch (err) {
      setLoadError(err as Error);
      handleError(err, fetchTradingPartner);
    } finally {
      setIsLoading(false);
    }
  }, [mode, tradingPartnerId, handleError]);

  // 編集モード時にデータをフェッチ
  useEffect(() => {
    if (mode === 'edit' && tradingPartnerId) {
      fetchTradingPartner();
    }
  }, [mode, tradingPartnerId, fetchTradingPartner]);

  // ============================================================================
  // フォーム送信
  // ============================================================================

  /**
   * フォーム送信処理
   */
  const handleSubmit = useCallback(
    async (data: TradingPartnerFormData) => {
      // 再試行用にデータを保存
      lastSubmitDataRef.current = data;
      setIsSubmitting(true);
      clearError();

      try {
        if (mode === 'create') {
          // 作成モード
          await createTradingPartner({
            name: data.name,
            nameKana: data.nameKana,
            types: data.types,
            address: data.address,
            branchName: data.branchName,
            branchNameKana: data.branchNameKana,
            representativeName: data.representativeName,
            representativeNameKana: data.representativeNameKana,
            phoneNumber: data.phoneNumber,
            faxNumber: data.faxNumber,
            email: data.email,
            billingClosingDay: data.billingClosingDay,
            paymentMonthOffset: data.paymentMonthOffset,
            paymentDay: data.paymentDay,
            notes: data.notes,
          });

          // 成功時: トースト表示と一覧ページへ遷移 (Requirement 2.8)
          toast.success('取引先を作成しました');
          navigate('/trading-partners');
        } else {
          // 編集モード
          if (!tradingPartnerId || !tradingPartner) {
            throw new Error('取引先IDまたはデータがありません');
          }

          await updateTradingPartner(
            tradingPartnerId,
            {
              name: data.name,
              nameKana: data.nameKana,
              types: data.types,
              address: data.address,
              branchName: data.branchName,
              branchNameKana: data.branchNameKana,
              representativeName: data.representativeName,
              representativeNameKana: data.representativeNameKana,
              phoneNumber: data.phoneNumber,
              faxNumber: data.faxNumber,
              email: data.email,
              billingClosingDay: data.billingClosingDay,
              paymentMonthOffset: data.paymentMonthOffset,
              paymentDay: data.paymentDay,
              notes: data.notes,
            },
            tradingPartner.updatedAt
          );

          // 成功時: トースト表示と詳細ページへ遷移 (Requirement 4.6)
          toast.success('取引先を更新しました');
          navigate(`/trading-partners/${tradingPartnerId}`);
        }
      } catch (err) {
        // エラーハンドリング
        if (err instanceof ApiError) {
          // ネットワークエラー（statusCode: 0）またはサーバーエラー（5xx）
          if (err.statusCode === 0 || (err.statusCode >= 500 && err.statusCode < 600)) {
            // NetworkErrorDisplayで表示するためhandleErrorを呼び出す
            const retryFn = async () => {
              if (lastSubmitDataRef.current) {
                await handleSubmit(lastSubmitDataRef.current);
              }
            };
            handleError(err, retryFn);
          } else {
            // クライアントエラー（4xx）: トーストでエラーメッセージを表示 (Requirement 8.4)
            toast.error(err.message);
          }
        } else {
          // その他のエラー
          toast.error('予期せぬエラーが発生しました');
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [mode, tradingPartnerId, tradingPartner, navigate, toast, clearError, handleError]
  );

  // ============================================================================
  // キャンセル
  // ============================================================================

  /**
   * キャンセル処理
   */
  const handleCancel = useCallback(() => {
    if (mode === 'create') {
      // 作成モード: 一覧ページへ遷移
      navigate('/trading-partners');
    } else {
      // 編集モード: 詳細ページへ遷移
      navigate(`/trading-partners/${tradingPartnerId}`);
    }
  }, [mode, tradingPartnerId, navigate]);

  // ============================================================================
  // レンダリング
  // ============================================================================

  // ローディング中
  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '200px',
        }}
      >
        <span
          role="status"
          aria-label="読み込み中"
          style={{
            display: 'inline-block',
            width: '2rem',
            height: '2rem',
            border: '3px solid #e5e7eb',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>
          {`
            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
          `}
        </style>
      </div>
    );
  }

  // データ取得エラー（編集モード）
  if (loadError && mode === 'edit') {
    return (
      <NetworkErrorDisplay
        error={networkError}
        onRetry={retry}
        onDismiss={clearError}
        isRetrying={isRetrying}
      />
    );
  }

  return (
    <div>
      {/* ネットワークエラー表示 */}
      {networkError && (
        <NetworkErrorDisplay
          error={networkError}
          onRetry={retry}
          onDismiss={clearError}
          isRetrying={isRetrying}
        />
      )}

      {/* フォーム */}
      <TradingPartnerForm
        mode={mode}
        initialData={initialData}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

export default TradingPartnerFormContainer;
