/**
 * @fileoverview 契約書フォームコンポーネント（新規契約/変更契約/編集共通）
 *
 * Task 5.1: 契約種類選択と新規契約用入力フォームを実装する
 * Task 5.2: 見積書選択時の金額自動計算とプロジェクト情報の自動表示を実装する
 * Task 5.3: 変更契約用の基契約書選択とデフォルト値設定を実装する
 * Task 5.4: 変更契約の変更前後比較表示パネルを実装する
 *
 * Requirements (contract-management):
 * - REQ-2.1: 契約種類選択UI（ラジオボタン）
 * - REQ-2.2: 新規契約フォーム表示
 * - REQ-3.1: 新規契約入力フィールド
 * - REQ-3.2: 消費税率デフォルト10%
 * - REQ-3.3: 監理者取引先選択UI（TradingPartnerSelectの再利用）
 * - REQ-3.4: 見積書選択UI
 * - REQ-4.1: 請負代金額自動表示
 * - REQ-4.2: 工事価格自動表示
 * - REQ-4.3: 消費税額自動計算
 * - REQ-4.4: 発注者自動表示
 * - REQ-4.5: 請負者自動表示
 * - REQ-4.6: 工事名自動表示
 * - REQ-4.7: 工事場所自動表示
 * - REQ-5.1: 基となる契約書選択
 * - REQ-5.2: デフォルト値設定
 * - REQ-5.3: 変更契約入力フィールド
 * - REQ-6.1: 変更前の値表示
 * - REQ-6.2: 変更前後比較表示
 *
 * @module components/contract/ContractForm
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ContractType, ContractDetail, CreateContractInput } from '../../api/contracts';
import { getContracts, getContractDetail } from '../../api/contracts';
import type { ContractsResponse } from '../../api/contracts';
import { getEstimates, getEstimateDetail } from '../../api/estimates';
import type { EstimatesResponse, EstimateDetail } from '../../api/estimates';
import { getCompanyInfo } from '../../api/company-info';
import type { CompanyInfo } from '../../types/company-info.types';
import { EstimateCalculator } from '../../utils/estimate-calculation';
import type { EstimateItemWithLines, EstimateItemLineType } from '../../utils/estimate-calculation';
import TradingPartnerSelect from '../projects/TradingPartnerSelect';
import ComparisonPanel from './ComparisonPanel';

// ============================================================================
// 型定義
// ============================================================================

/**
 * プロジェクト情報（ContractFormに必要な最小情報）
 */
export interface ContractFormProjectInfo {
  id: string;
  name: string;
  siteAddress: string | null;
  tradingPartner: { id: string; name: string } | null;
}

/**
 * ContractFormコンポーネントのプロパティ
 */
export interface ContractFormProps {
  /** フォームモード */
  mode: 'create' | 'edit';
  /** プロジェクトID */
  projectId: string;
  /** プロジェクト情報 */
  projectInfo: ContractFormProjectInfo;
  /** 送信時コールバック */
  onSubmit: (data: CreateContractInput) => void;
  /** キャンセル時コールバック */
  onCancel: () => void;
  /** 編集時の初期データ */
  initialData?: ContractDetail;
  /** 送信中かどうか */
  isSubmitting?: boolean;
}

/**
 * フォームデータの型
 */
interface FormData {
  contractType: ContractType;
  parentContractId: string;
  estimateId: string;
  contractDate: string;
  constructionStartDate: string;
  constructionEndDate: string;
  deliveryDate: string;
  taxRate: string;
  paymentTerms: string;
  separateConstruction: string;
  otherNotes: string;
  supervisorTradingPartnerId: string;
}

// ============================================================================
// 定数
// ============================================================================

const DEFAULT_TAX_RATE = '10';

const INITIAL_FORM_DATA: FormData = {
  contractType: 'NEW',
  parentContractId: '',
  estimateId: '',
  contractDate: '',
  constructionStartDate: '',
  constructionEndDate: '',
  deliveryDate: '',
  taxRate: DEFAULT_TAX_RATE,
  paymentTerms: '',
  separateConstruction: '',
  otherNotes: '',
  supervisorTradingPartnerId: '',
};

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  form: {
    maxWidth: '800px',
  } as React.CSSProperties,
  section: {
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: '16px',
    paddingBottom: '8px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  fieldGroup: {
    marginBottom: '16px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    marginBottom: '4px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  select: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  textarea: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    minHeight: '80px',
    resize: 'vertical' as const,
  } as React.CSSProperties,
  radioGroup: {
    display: 'flex',
    gap: '24px',
    marginBottom: '16px',
  } as React.CSSProperties,
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    cursor: 'pointer',
  } as React.CSSProperties,
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  } as React.CSSProperties,
  infoItem: {
    padding: '8px 12px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  infoLabel: {
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '4px',
  } as React.CSSProperties,
  infoValue: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
  } as React.CSSProperties,
  amountGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '16px',
  } as React.CSSProperties,
  amountItem: {
    padding: '12px',
    backgroundColor: '#f0f9ff',
    borderRadius: '6px',
    border: '1px solid #bae6fd',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  amountLabel: {
    fontSize: '12px',
    color: '#0369a1',
    marginBottom: '4px',
  } as React.CSSProperties,
  amountValue: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#0c4a6e',
  } as React.CSSProperties,
  dateGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  } as React.CSSProperties,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 金額をフォーマットする
 */
function formatAmount(amount: number): string {
  return new Intl.NumberFormat('ja-JP').format(amount);
}

/**
 * CompanyInfoかどうか判定する型ガード
 */
function isCompanyInfo(data: unknown): data is CompanyInfo {
  return (
    typeof data === 'object' &&
    data !== null &&
    'companyName' in data &&
    typeof (data as CompanyInfo).companyName === 'string'
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 契約書フォームコンポーネント
 *
 * 新規契約・変更契約・編集の共通フォーム。
 * mode prop（'create' | 'edit'）でフォーム動作を切り替えます。
 *
 * Requirements:
 * - REQ-2.1: 契約種類選択UI（ラジオボタン）
 * - REQ-3.1-3.4: 入力フィールド
 * - REQ-4.1-4.7: 自動表示項目
 * - REQ-5.1-5.3: 変更契約
 * - REQ-6.1-6.2: 変更前後比較表示
 */
export default function ContractForm({
  mode,
  projectId,
  projectInfo,
  onSubmit,
  onCancel,
  initialData,
  isSubmitting = false,
}: ContractFormProps) {
  // フォーム状態
  const [formData, setFormData] = useState<FormData>(() => {
    if (initialData) {
      return {
        contractType: initialData.contractType,
        parentContractId: initialData.parentContractId ?? '',
        estimateId: initialData.estimateId,
        contractDate: initialData.contractDate,
        constructionStartDate: initialData.constructionStartDate,
        constructionEndDate: initialData.constructionEndDate,
        deliveryDate: initialData.deliveryDate,
        taxRate: String(initialData.taxRate * 100),
        paymentTerms: initialData.paymentTerms,
        separateConstruction: initialData.separateConstruction,
        otherNotes: initialData.otherNotes,
        supervisorTradingPartnerId: initialData.supervisorTradingPartnerId ?? '',
      };
    }
    return { ...INITIAL_FORM_DATA };
  });

  // データ取得状態
  const [estimates, setEstimates] = useState<EstimatesResponse | null>(null);
  const [estimateDetail, setEstimateDetail] = useState<EstimateDetail | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [existingContracts, setExistingContracts] = useState<ContractsResponse | null>(null);
  const [parentContractDetail, setParentContractDetail] = useState<ContractDetail | null>(null);

  // 金額計算結果
  const [constructionPrice, setConstructionPrice] = useState<number>(
    initialData?.constructionPrice ?? 0
  );
  const [taxAmount, setTaxAmount] = useState<number>(initialData?.taxAmount ?? 0);
  const [contractAmount, setContractAmount] = useState<number>(initialData?.contractAmount ?? 0);

  // ============================================================================
  // データ取得
  // ============================================================================

  // 見積書一覧を取得
  useEffect(() => {
    let mounted = true;
    const fetchEstimates = async () => {
      try {
        const result = await getEstimates(projectId, { limit: 100 });
        if (mounted) setEstimates(result);
      } catch {
        // エラーは握りつぶす（UI上は選択肢が空になる）
      }
    };
    fetchEstimates();
    return () => {
      mounted = false;
    };
  }, [projectId]);

  // 自社情報を取得
  useEffect(() => {
    let mounted = true;
    const fetchCompanyInfo = async () => {
      try {
        const result = await getCompanyInfo();
        if (mounted && isCompanyInfo(result)) {
          setCompanyInfo(result);
        }
      } catch {
        // エラーは握りつぶす
      }
    };
    fetchCompanyInfo();
    return () => {
      mounted = false;
    };
  }, []);

  // 既存契約書一覧を取得（変更契約用）
  useEffect(() => {
    if (formData.contractType !== 'AMENDMENT') return;

    let mounted = true;
    const fetchContracts = async () => {
      try {
        const result = await getContracts(projectId, { limit: 100 });
        if (mounted) setExistingContracts(result);
      } catch {
        // エラーは握りつぶす
      }
    };
    fetchContracts();
    return () => {
      mounted = false;
    };
  }, [projectId, formData.contractType]);

  // 見積書詳細を取得（見積書選択時）
  useEffect(() => {
    if (!formData.estimateId) {
      setEstimateDetail(null);
      setConstructionPrice(0);
      setTaxAmount(0);
      setContractAmount(0);
      return;
    }

    let mounted = true;
    const fetchEstimateDetail = async () => {
      try {
        const result = await getEstimateDetail(formData.estimateId);
        if (mounted) {
          setEstimateDetail(result);
        }
      } catch {
        // エラーは握りつぶす
      }
    };
    fetchEstimateDetail();
    return () => {
      mounted = false;
    };
  }, [formData.estimateId]);

  // ============================================================================
  // ヘルパー
  // ============================================================================

  /**
   * 階層的な見積項目をフラット化する
   */
  const flattenItems = useCallback((items: EstimateDetail['items']): EstimateItemWithLines[] => {
    const result: EstimateItemWithLines[] = [];
    for (const item of items) {
      result.push({
        id: item.id,
        lines: item.lines.map((l) => ({
          lineType: l.lineType as EstimateItemLineType,
          amount: l.amount ?? null,
        })),
      });
      if (item.children?.length > 0) {
        result.push(...flattenItems(item.children));
      }
    }
    return result;
  }, []);

  // 金額計算（見積書詳細取得後、または消費税率変更時）
  useEffect(() => {
    if (!estimateDetail) return;

    // EstimateCalculator.calculateSubtotal() でESTIMATE行の合計を算出
    const flatItems = flattenItems(estimateDetail.items);
    const subtotal = EstimateCalculator.calculateSubtotal(flatItems);
    const price = subtotal.toNumber();
    setConstructionPrice(price);

    // 消費税率
    const taxRateNum = parseFloat(formData.taxRate) / 100;
    if (!isNaN(taxRateNum)) {
      const tax = Math.floor(price * taxRateNum);
      setTaxAmount(tax);
      setContractAmount(price + tax);
    }
  }, [estimateDetail, formData.taxRate, flattenItems]);

  // 基契約書詳細を取得（変更契約の基契約書選択時）
  useEffect(() => {
    if (!formData.parentContractId) {
      setParentContractDetail(null);
      return;
    }

    let mounted = true;
    const fetchParentContract = async () => {
      try {
        const result = await getContractDetail(formData.parentContractId);
        if (mounted) {
          setParentContractDetail(result);
          // デフォルト値を設定 (REQ-5.2)
          setFormData((prev) => ({
            ...prev,
            estimateId: result.estimateId,
            contractDate: result.contractDate,
            constructionStartDate: result.constructionStartDate,
            constructionEndDate: result.constructionEndDate,
            deliveryDate: result.deliveryDate,
            taxRate: String(result.taxRate * 100),
            paymentTerms: result.paymentTerms,
            separateConstruction: result.separateConstruction,
            otherNotes: result.otherNotes,
            supervisorTradingPartnerId: result.supervisorTradingPartnerId ?? '',
          }));
        }
      } catch {
        // エラーは握りつぶす
      }
    };
    fetchParentContract();
    return () => {
      mounted = false;
    };
  }, [formData.parentContractId]);

  // ============================================================================
  // イベントハンドラ
  // ============================================================================

  const handleFieldChange = useCallback((field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleContractTypeChange = useCallback((type: ContractType) => {
    setFormData((prev) => ({
      ...prev,
      contractType: type,
      parentContractId: '',
    }));
    setParentContractDetail(null);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const taxRateDecimal = parseFloat(formData.taxRate) / 100;

      const input: CreateContractInput = {
        contractType: formData.contractType,
        parentContractId: formData.parentContractId || null,
        estimateId: formData.estimateId,
        contractDate: formData.contractDate,
        constructionStartDate: formData.constructionStartDate,
        constructionEndDate: formData.constructionEndDate,
        deliveryDate: formData.deliveryDate,
        taxRate: isNaN(taxRateDecimal) ? 0.1 : taxRateDecimal,
        paymentTerms: formData.paymentTerms,
        separateConstruction: formData.separateConstruction,
        otherNotes: formData.otherNotes,
        supervisorTradingPartnerId: formData.supervisorTradingPartnerId || null,
        contractAmount,
        constructionPrice,
        taxAmount,
      };

      onSubmit(input);
    },
    [formData, contractAmount, constructionPrice, taxAmount, onSubmit]
  );

  // 比較用: 変更前の値を計算
  const comparisonData = useMemo(() => {
    if (!parentContractDetail) return null;
    return {
      estimateId: parentContractDetail.estimateId,
      estimateName: parentContractDetail.estimate?.name ?? '',
      contractDate: parentContractDetail.contractDate,
      constructionStartDate: parentContractDetail.constructionStartDate,
      constructionEndDate: parentContractDetail.constructionEndDate,
      deliveryDate: parentContractDetail.deliveryDate,
      taxRate: String(parentContractDetail.taxRate * 100),
      paymentTerms: parentContractDetail.paymentTerms,
      separateConstruction: parentContractDetail.separateConstruction,
      otherNotes: parentContractDetail.otherNotes,
      supervisorTradingPartnerId: parentContractDetail.supervisorTradingPartnerId ?? '',
      contractAmount: parentContractDetail.contractAmount,
      constructionPrice: parentContractDetail.constructionPrice,
      taxAmount: parentContractDetail.taxAmount,
    };
  }, [parentContractDetail]);

  // 現在のフォーム値（比較用）
  const currentFormValues = useMemo(
    () => ({
      estimateId: formData.estimateId,
      contractDate: formData.contractDate,
      constructionStartDate: formData.constructionStartDate,
      constructionEndDate: formData.constructionEndDate,
      deliveryDate: formData.deliveryDate,
      taxRate: formData.taxRate,
      paymentTerms: formData.paymentTerms,
      separateConstruction: formData.separateConstruction,
      otherNotes: formData.otherNotes,
      supervisorTradingPartnerId: formData.supervisorTradingPartnerId,
      contractAmount,
      constructionPrice,
      taxAmount,
    }),
    [formData, contractAmount, constructionPrice, taxAmount]
  );

  // ============================================================================
  // レンダリング
  // ============================================================================

  return (
    <form onSubmit={handleSubmit} style={styles.form} data-testid="contract-form">
      {/* 契約種類選択 (REQ-2.1) */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>契約種類</h3>
        <div style={styles.radioGroup}>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="contractType"
              value="NEW"
              checked={formData.contractType === 'NEW'}
              onChange={() => handleContractTypeChange('NEW')}
              disabled={mode === 'edit'}
            />
            新規契約
          </label>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="contractType"
              value="AMENDMENT"
              checked={formData.contractType === 'AMENDMENT'}
              onChange={() => handleContractTypeChange('AMENDMENT')}
              disabled={mode === 'edit'}
            />
            変更契約
          </label>
        </div>

        {/* 基契約書選択 (REQ-5.1) - 変更契約時のみ表示 */}
        {formData.contractType === 'AMENDMENT' && (
          <div style={styles.fieldGroup}>
            <label htmlFor="parentContractId" style={styles.label}>
              基となる契約書
            </label>
            <select
              id="parentContractId"
              value={formData.parentContractId}
              onChange={(e) => handleFieldChange('parentContractId', e.target.value)}
              style={styles.select}
              disabled={mode === 'edit'}
            >
              <option value="">-- 選択してください --</option>
              {existingContracts?.contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contractType === 'NEW' ? '新規契約' : '変更契約'} -{' '}
                  {new Date(c.contractDate).toLocaleDateString('ja-JP')}
                  {c.estimateName ? ` (${c.estimateName})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* プロジェクト情報自動表示 (REQ-4.4-4.7) */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>プロジェクト情報</h3>
        <div style={styles.infoGrid}>
          <div style={styles.infoItem}>
            <div style={styles.infoLabel}>発注者</div>
            <div style={styles.infoValue} data-testid="client-name">
              {projectInfo.tradingPartner?.name ?? '未設定'}
            </div>
          </div>
          <div style={styles.infoItem}>
            <div style={styles.infoLabel}>請負者</div>
            <div style={styles.infoValue} data-testid="contractor-name">
              {companyInfo?.companyName ?? '未設定'}
            </div>
          </div>
          <div style={styles.infoItem}>
            <div style={styles.infoLabel}>工事名</div>
            <div style={styles.infoValue} data-testid="project-name">
              {projectInfo.name}
            </div>
          </div>
          <div style={styles.infoItem}>
            <div style={styles.infoLabel}>工事場所</div>
            <div style={styles.infoValue} data-testid="site-address">
              {projectInfo.siteAddress ?? '未設定'}
            </div>
          </div>
        </div>
      </div>

      {/* 見積書選択 (REQ-3.4) */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>見積書・金額</h3>
        <div style={styles.fieldGroup}>
          <label htmlFor="estimateId" style={styles.label}>
            見積書
          </label>
          <select
            id="estimateId"
            value={formData.estimateId}
            onChange={(e) => handleFieldChange('estimateId', e.target.value)}
            style={styles.select}
          >
            <option value="">-- 見積書を選択してください --</option>
            {estimates?.data.map((est) => (
              <option key={est.id} value={est.id}>
                {est.name}
              </option>
            ))}
          </select>
        </div>

        {/* 消費税率 (REQ-3.2) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="taxRate" style={styles.label}>
            消費税率（%）
          </label>
          <input
            type="number"
            id="taxRate"
            value={formData.taxRate}
            onChange={(e) => handleFieldChange('taxRate', e.target.value)}
            style={{ ...styles.input, maxWidth: '120px' }}
            min="0"
            max="100"
            step="0.1"
          />
        </div>

        {/* 金額自動表示 (REQ-4.1-4.3) */}
        <div style={styles.amountGrid}>
          <div style={styles.amountItem}>
            <div style={styles.amountLabel}>工事価格</div>
            <div style={styles.amountValue} data-testid="construction-price">
              {formatAmount(constructionPrice)}
            </div>
          </div>
          <div style={styles.amountItem}>
            <div style={styles.amountLabel}>消費税額</div>
            <div style={styles.amountValue} data-testid="tax-amount">
              {formatAmount(taxAmount)}
            </div>
          </div>
          <div style={styles.amountItem}>
            <div style={styles.amountLabel}>請負代金額</div>
            <div style={styles.amountValue} data-testid="contract-amount">
              {formatAmount(contractAmount)}
            </div>
          </div>
        </div>
      </div>

      {/* 契約条件 (REQ-3.1) */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>契約条件</h3>

        <div style={styles.fieldGroup}>
          <label htmlFor="contractDate" style={styles.label}>
            契約日
          </label>
          <input
            type="date"
            id="contractDate"
            value={formData.contractDate}
            onChange={(e) => handleFieldChange('contractDate', e.target.value)}
            style={{ ...styles.input, maxWidth: '200px' }}
          />
        </div>

        <div style={styles.dateGrid}>
          <div style={styles.fieldGroup}>
            <label htmlFor="constructionStartDate" style={styles.label}>
              工期着手日
            </label>
            <input
              type="date"
              id="constructionStartDate"
              value={formData.constructionStartDate}
              onChange={(e) => handleFieldChange('constructionStartDate', e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label htmlFor="constructionEndDate" style={styles.label}>
              工期完成日
            </label>
            <input
              type="date"
              id="constructionEndDate"
              value={formData.constructionEndDate}
              onChange={(e) => handleFieldChange('constructionEndDate', e.target.value)}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.fieldGroup}>
          <label htmlFor="deliveryDate" style={styles.label}>
            引渡日
          </label>
          <input
            type="date"
            id="deliveryDate"
            value={formData.deliveryDate}
            onChange={(e) => handleFieldChange('deliveryDate', e.target.value)}
            style={{ ...styles.input, maxWidth: '200px' }}
          />
        </div>

        <div style={styles.fieldGroup}>
          <label htmlFor="paymentTerms" style={styles.label}>
            支払条件
          </label>
          <textarea
            id="paymentTerms"
            value={formData.paymentTerms}
            onChange={(e) => handleFieldChange('paymentTerms', e.target.value)}
            style={styles.textarea}
          />
        </div>

        <div style={styles.fieldGroup}>
          <label htmlFor="separateConstruction" style={styles.label}>
            別途工事
          </label>
          <textarea
            id="separateConstruction"
            value={formData.separateConstruction}
            onChange={(e) => handleFieldChange('separateConstruction', e.target.value)}
            style={styles.textarea}
          />
        </div>

        <div style={styles.fieldGroup}>
          <label htmlFor="otherNotes" style={styles.label}>
            その他
          </label>
          <textarea
            id="otherNotes"
            value={formData.otherNotes}
            onChange={(e) => handleFieldChange('otherNotes', e.target.value)}
            style={styles.textarea}
          />
        </div>
      </div>

      {/* 監理者取引先選択 (REQ-3.3) */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>監理者</h3>
        <TradingPartnerSelect
          value={formData.supervisorTradingPartnerId}
          onChange={(v) => handleFieldChange('supervisorTradingPartnerId', v)}
          label="監理者"
          filterTypes={['CUSTOMER', 'SUBCONTRACTOR']}
          showEmptyOption={true}
          placeholder="監理者を検索または選択（任意）"
        />
      </div>

      {/* 変更前後比較表示パネル (REQ-6.1, REQ-6.2) */}
      {formData.contractType === 'AMENDMENT' && parentContractDetail && comparisonData && (
        <ComparisonPanel
          previousValues={comparisonData}
          currentValues={currentFormValues}
          estimates={estimates?.data ?? []}
        />
      )}

      {/* ボタン */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          marginTop: '24px',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          style={{
            padding: '10px 24px',
            fontSize: '14px',
            backgroundColor: '#ffffff',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            padding: '10px 24px',
            fontSize: '14px',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          {mode === 'create' ? '作成' : '保存'}
        </button>
      </div>
    </form>
  );
}
