/**
 * @fileoverview 受領見積書登録・編集フォームコンポーネント（改訂版）
 *
 * Task 14.1: ReceivedQuotationFormの実装
 * Task 26.1: ReceivedQuotationFormの改訂統合
 *
 * Requirements:
 * - 11.1: 受領見積書登録ボタン表示
 * - 11.2: 受領見積書登録フォーム
 * - 11.3: 受領見積書名（必須）
 * - 11.4: 提出日（必須）
 * - 11.5: ファイルアップロードフィールド表示
 * - 11.6: ドラッグ&ドロップによるファイル選択のサポート
 * - 11.7: ファイル形式制限（PDF、Excel、画像）
 * - 11.8: ファイルサイズ上限10MB
 * - 11.9: 構造化データ入力エリア表示
 * - 11.14: フォーム初期表示時に1行の空明細行表示
 * - 11.22: ファイルまたは明細行データのいずれか入力で保存可能
 * - 11.23: 必須項目バリデーション
 * - 11.24: ファイル未アップロード・全明細行空の場合のエラー表示
 * - 11.25: 受領見積書の編集機能
 */

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  Suspense,
  lazy,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import type {
  ReceivedQuotationInfo,
  CreateReceivedQuotationInput,
  UpdateReceivedQuotationInput,
  LineItemInput,
} from '../../api/received-quotations';
import { ApiError } from '../../api/client';
import {
  LineItemEditor,
  createEmptyLineItem,
  calculateTotalAmount,
  ensureSortOrders,
  reassignSortOrder,
  sortBySortOrder,
  type LineItemFormData,
} from './LineItemEditor';
import { FileInlinePreview } from './FileInlinePreview';
import { formatQuantity, formatUnitPrice } from './number-format';
import { useAuth } from '../../hooks/useAuth';
import { usePendingSaveAfterReauth } from './usePendingSaveAfterReauth';
import { isFormDirty, useUnsavedChangesGuard, type FormSnapshot } from './useUnsavedChangesGuard';

// OcrDataExtractorを遅延ロード（バンドルサイズ影響回避）
const OcrDataExtractor = lazy(() => import('./OcrDataExtractor'));

// ============================================================================
// 一括転記用の型定義
// ============================================================================

/**
 * 一括転記用の選択済み項目データ
 *
 * Requirements: 15.2
 */
export interface SelectedItemForTranscription {
  customCategory: string | null;
  workType: string | null;
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: number;
  remarks: string | null;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 許可されるファイル形式
 */
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

/**
 * 許可されるファイル拡張子（accept属性用）
 */
const ALLOWED_FILE_EXTENSIONS = '.pdf,.xls,.xlsx,.jpg,.jpeg,.png';

/**
 * ファイルサイズ上限（10MB）
 */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// ============================================================================
// 型定義
// ============================================================================

/**
 * 受領見積書情報をAPIクライアントから再エクスポート
 */
export type {
  ReceivedQuotationInfo,
  CreateReceivedQuotationInput,
  UpdateReceivedQuotationInput,
} from '../../api/received-quotations';

/**
 * ReceivedQuotationFormコンポーネントのProps
 */
export interface ReceivedQuotationFormProps {
  /** フォームモード */
  mode: 'create' | 'edit';
  /** 見積依頼ID */
  estimateRequestId: string;
  /** 編集時の初期データ */
  initialData?: ReceivedQuotationInfo;
  /** 送信時のコールバック */
  onSubmit: (data: CreateReceivedQuotationInput | UpdateReceivedQuotationInput) => Promise<void>;
  /** キャンセル時のコールバック */
  onCancel: () => void;
  /** 送信中フラグ */
  isSubmitting?: boolean;
  /** 項目選択セクションの選択済み項目データ（一括転記用） */
  selectedItems?: SelectedItemForTranscription[];
  /** 既存ファイルのプレビューURL（編集時のOCR再実行用） */
  existingFilePreviewUrl?: string | null;
}

/**
 * フォームエラー状態
 */
interface FormErrors {
  name?: string;
  submittedAt?: string;
  content?: string;
  file?: string;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
  },
  required: {
    color: '#dc2626',
    marginLeft: '4px',
  },
  input: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  inputError: {
    borderColor: '#dc2626',
  },
  errorText: {
    fontSize: '12px',
    color: '#dc2626',
    marginTop: '4px',
  },
  buttonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '8px',
  },
  button: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    transition: 'background-color 0.2s',
  },
  submitButton: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
  },
  submitButtonDisabled: {
    backgroundColor: '#6b7280',
    cursor: 'not-allowed',
  },
  cancelButton: {
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
  },
  cancelButtonDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
    cursor: 'not-allowed',
  },
  loadingWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  fileUploadArea: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    borderWidth: '2px',
    borderStyle: 'dashed',
    borderColor: '#d1d5db',
    borderRadius: '8px',
    backgroundColor: '#f9fafb',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  fileUploadAreaDragOver: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  fileUploadAreaError: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  fileUploadText: {
    fontSize: '14px',
    color: '#6b7280',
    marginTop: '8px',
  },
  fileUploadHint: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  },
  selectedFile: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#f3f4f6',
    borderRadius: '6px',
    marginTop: '8px',
  },
  selectedFileName: {
    fontSize: '14px',
    color: '#374151',
    fontWeight: 500,
  },
  selectedFileSize: {
    fontSize: '12px',
    color: '#4b5563', // Changed from #6b7280 for better contrast on #f3f4f6 background
  },
  removeFileButton: {
    marginLeft: 'auto',
    padding: '4px 8px',
    fontSize: '12px',
    color: '#b91c1c', // Changed from #dc2626 for better contrast on #f3f4f6 background
    backgroundColor: 'transparent',
    border: '1px solid #b91c1c',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  hiddenInput: {
    display: 'none',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    marginTop: '16px',
    marginBottom: '8px',
  },
  previewSection: {
    marginTop: '16px',
  },
  ocrSection: {
    marginTop: '16px',
  },
  // Requirement 40: OCRセクション折りたたみ機能 — セクションヘッダ用スタイル
  ocrSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    width: '100%',
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    textAlign: 'left',
  } as React.CSSProperties,
  ocrSectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
  } as React.CSSProperties,
  ocrSectionChevron: {
    transition: 'transform 150ms ease',
  } as React.CSSProperties,
  // Requirement 40 AC 16: フォーカス時の視覚的明示（OS 非依存・テスト検証可能）
  ocrSectionHeaderFocus: {
    outline: '2px solid #2563eb',
    outlineOffset: '2px',
    boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.2)',
  } as React.CSSProperties,
  lineItemsSection: {
    marginTop: '16px',
  },
  transcriptionSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  } as React.CSSProperties,
  transcriptionButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#ffffff',
    backgroundColor: '#7c3aed',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  transcriptionButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  transcriptionMessage: {
    fontSize: '13px',
    fontWeight: 500,
  } as React.CSSProperties,
  transcriptionSuccess: {
    color: '#059669',
  } as React.CSSProperties,
  transcriptionError: {
    color: '#dc2626',
  } as React.CSSProperties,
  confirmDialog: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  } as React.CSSProperties,
  confirmDialogContent: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '400px',
    width: '100%',
  } as React.CSSProperties,
  confirmDialogTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: '12px',
  } as React.CSSProperties,
  confirmDialogMessage: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '20px',
  } as React.CSSProperties,
  confirmDialogButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  } as React.CSSProperties,
  confirmDialogCancel: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    cursor: 'pointer',
  } as React.CSSProperties,
  confirmDialogConfirm: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  suspenseFallback: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    color: '#6b7280',
    fontSize: '14px',
  },
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * ファイルサイズを人間が読める形式にフォーマット
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * ファイル形式をバリデート
 */
function isValidFileType(file: File): boolean {
  return ALLOWED_MIME_TYPES.includes(file.type);
}

/**
 * ファイルサイズをバリデート
 */
function isValidFileSize(file: File): boolean {
  return file.size <= MAX_FILE_SIZE_BYTES;
}

/**
 * 日付をyyyy-MM-dd形式にフォーマット
 */
function formatDateForInput(date: Date | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 明細行が有効なデータを持つか判定
 */
function hasValidLineItemData(items: LineItemFormData[]): boolean {
  return items.some((item) => item.name.trim() !== '');
}

/**
 * LineItemFormDataをLineItemInputに変換
 */
function convertToLineItemInput(items: LineItemFormData[]): LineItemInput[] {
  return items
    .filter((item) => item.name.trim() !== '')
    .map((item, index) => ({
      name: item.name.trim(),
      customCategory: item.customCategory.trim() || undefined,
      workType: item.workType.trim() || undefined,
      specification: item.specification.trim() || undefined,
      unit: item.unit.trim() || undefined,
      quantity: item.quantity ? parseFloat(item.quantity) : undefined,
      unitPrice: item.unitPrice ? parseFloat(item.unitPrice) : undefined,
      amount: item.amount ?? undefined,
      remarks: item.remarks.trim() || undefined,
      sortOrder: index,
    }));
}

/**
 * ReceivedQuotationInfoのlineItemsをLineItemFormDataに変換
 *
 * Task 79.3: サーバー応答 lineItems を `LineItemFormData[]` に変換する際に、
 * sortOrder の NULL/undefined を `ensureSortOrders` で配列インデックスに補完し、
 * `sortBySortOrder` で昇順整列してから返す（Req 37.3）。
 */
function convertToLineItemFormData(
  items: ReceivedQuotationInfo['lineItems'] | undefined
): LineItemFormData[] {
  if (!items || items.length === 0) {
    return [createEmptyLineItem(0)];
  }
  // sortOrder 欠落補完用の中間配列（id を含めて ensureSortOrders に渡す）
  const intermediate = items.map((item) => {
    const rawQuantity = item.quantity !== null ? String(item.quantity) : '';
    const rawUnitPrice = item.unitPrice !== null ? String(item.unitPrice) : '';
    const rawSortOrder = (item as { sortOrder?: number | null }).sortOrder;
    return {
      id: item.id,
      customCategory: item.customCategory ?? '',
      workType: item.workType ?? '',
      name: item.name,
      specification: item.specification ?? '',
      unit: item.unit ?? '',
      quantity: formatQuantity(rawQuantity),
      unitPrice: formatUnitPrice(rawUnitPrice),
      amount: item.amount,
      remarks: item.remarks ?? '',
      sortOrder: typeof rawSortOrder === 'number' ? rawSortOrder : null,
    };
  });
  // Req 37.3: NULL/undefined 補完 → 昇順ソート
  return sortBySortOrder(ensureSortOrders(intermediate));
}

// ============================================================================
// ローディングスピナー
// ============================================================================

function LoadingSpinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ animation: 'spin 1s linear infinite' }}
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
}

// ============================================================================
// OCRセクションヘッダ用のシェブロンアイコン（Requirement 40）
// ============================================================================

/**
 * OCRセクションヘッダの展開/折りたたみ状態を視覚的に示すシェブロンアイコン
 *
 * Requirements:
 * - 40.3: セクションの名称ラベルと、現在の展開状態または折りたたみ状態を示す視覚的な指示子を表示
 *
 * `▶` 文字を CSS `transform: rotate` で 0deg ↔ 90deg に切り替えて状態を表現する。
 * `aria-hidden="true"` で支援技術には冗長表現として読み上げさせない
 * （状態は `<button>` の `aria-expanded` で伝達）。
 */
function OcrChevronIcon({ isExpanded }: { isExpanded: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '12px',
        height: '12px',
        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 150ms ease',
        userSelect: 'none',
      }}
      aria-hidden="true"
    >
      ▶
    </span>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 受領見積書登録・編集フォーム（改訂版）
 *
 * ファイルアップロードと構造化データ入力（明細行）の共存UIを提供する。
 * ファイルまたは明細行データのいずれかが入力されていれば保存可能。
 *
 * @example
 * ```tsx
 * <ReceivedQuotationForm
 *   mode="create"
 *   estimateRequestId="er-123"
 *   onSubmit={handleSubmit}
 *   onCancel={() => setShowForm(false)}
 * />
 * ```
 */
export function ReceivedQuotationForm({
  mode,
  estimateRequestId: _estimateRequestId,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  selectedItems,
  existingFilePreviewUrl,
}: ReceivedQuotationFormProps) {
  // フォーム状態
  // Requirement 11.3.1: 受領見積書名のデフォルト値を「見積書」とする
  const [name, setName] = useState(initialData?.name ?? '見積書');
  // Requirement 11.4.1: 提出日のデフォルト値を現在日付とする
  const [submittedAt, setSubmittedAt] = useState(
    formatDateForInput(initialData?.submittedAt ?? new Date())
  );

  // ファイル状態
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [existingFileName] = useState<string | null>(initialData?.fileName ?? null);
  const [removeFile, setRemoveFile] = useState(false);

  // NET金額状態（Task 63.1: 受領見積書レベルのNET金額フィールド）
  const [netAmount, setNetAmount] = useState(
    initialData?.netAmount !== null && initialData?.netAmount !== undefined
      ? formatUnitPrice(String(initialData.netAmount))
      : ''
  );

  // 明細行状態（11.14: 初期表示時に1行の空明細行）
  const [lineItems, setLineItems] = useState<LineItemFormData[]>(
    convertToLineItemFormData(initialData?.lineItems)
  );

  // ドラッグ&ドロップ状態
  const [isDragOver, setIsDragOver] = useState(false);

  // エラー状態
  const [errors, setErrors] = useState<FormErrors>({});

  // 楽観的排他制御エラー（Req 38.10: 再認証フローと別系統）
  const [optimisticConflictError, setOptimisticConflictError] = useState<ApiError | null>(null);
  // 一般保存エラー
  const [saveError, setSaveError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================================================
  // Task 79.3: セッション保護・isDirty スナップショット・並び順送信統合
  // ============================================================================

  // 認証状態（Req 38.4: 再認証中操作非活性化、Req 38.6/38.7: 再認証成功/ログイン遷移時の挙動）
  const { sessionExpiredDuringOperation } = useAuth();
  const isReauthInProgress = sessionExpiredDuringOperation;

  // 保存リトライ用フック（Req 38.1, 38.6, 38.7）
  const { setPendingSave, clearPendingSave } = usePendingSaveAfterReauth();

  // 初期スナップショット（design.md 4905-4911: ダイアログ open 時に確定）
  // mount 時に現行 state を初期スナップショットとして保持し、
  // initialData 切替（編集対象切替）時のみ再確定する。
  const buildInitialSnapshot = useCallback((): FormSnapshot => {
    return {
      name: initialData?.name ?? '見積書',
      submittedAt: formatDateForInput(initialData?.submittedAt ?? new Date()),
      netAmount:
        initialData?.netAmount !== null && initialData?.netAmount !== undefined
          ? formatUnitPrice(String(initialData.netAmount))
          : '',
      selectedFile: null,
      lineItems: convertToLineItemFormData(initialData?.lineItems),
    };
    // initialData の参照変化（編集対象切替）でスナップショットを再ビルドするため
    // 内部の各フィールドではなく initialData そのものを依存に含める。
  }, [initialData]);

  const [snapshot, setSnapshot] = useState<FormSnapshot>(() => buildInitialSnapshot());

  // 初期スナップショット確定タイミング（design.md 4909）
  // ダイアログ open 相当のキー（initialData の id 変化 = 編集対象切替）でスナップショットをリセット。
  // 新規作成モードでは initialData=undefined のためマウント時の初期値で確定済み。
  const initialDataId = initialData?.id ?? null;
  useEffect(() => {
    setSnapshot(buildInitialSnapshot());
    // initialDataId 変化時のみ snapshot を再構築する。
    // buildInitialSnapshot 自体は initialData に依存しているため意図通り。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDataId]);

  // isDirty 算出（design.md 4910: useMemo で再評価コスト抑制）
  const isDirty = useMemo(
    () =>
      isFormDirty(
        {
          name,
          submittedAt,
          netAmount,
          selectedFile,
          lineItems,
        },
        snapshot
      ),
    [name, submittedAt, netAmount, selectedFile, lineItems, snapshot]
  );

  // 未保存変更ガード（Req 38.12, 38.13）
  const { confirmCloseIfDirty } = useUnsavedChangesGuard(isDirty);

  // バリデーション
  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!name.trim()) {
      newErrors.name = '受領見積書名を入力してください';
    }

    if (!submittedAt) {
      newErrors.submittedAt = '提出日を入力してください';
    }

    // 11.24: ファイル未アップロード・全明細行空の場合のエラー
    const hasFile = selectedFile !== null || (existingFileName !== null && !removeFile);
    const hasLineItems = hasValidLineItemData(lineItems);

    if (!hasFile && !hasLineItems) {
      newErrors.content = 'ファイルのアップロードまたは明細行データの入力が必要です';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, submittedAt, selectedFile, existingFileName, removeFile, lineItems]);

  // フォーム送信
  // Task 79.3: 保存リトライ・401/409 ハンドリング・isReauthInProgress を統合
  // - performSave: API 呼び出し本体（401: pending 維持で return / 409: 楽観的競合エラーフロー / 成功: snapshot 更新）
  // - handleSave: form submit/handleSubmit から呼ばれるエントリ。setPendingSave で再認証成功時のリトライを準備
  const performSave = useCallback(async (): Promise<void> => {
    // Req 37.13: lineItems を index ベースで sortOrder=0,1,2,... に再採番して送信。
    //   convertToLineItemInput は filter（空名行除外）後に index で sortOrder を割り当てる
    //   ため、画面表示順 = sortOrder 連続値という不変条件を担保する。
    const lineItemInputs = convertToLineItemInput(lineItems);

    // Task 63.2: NET金額をAPIリクエストに含める（空文字列 → null）
    const parsedNetAmount = netAmount.trim() !== '' ? Math.round(parseFloat(netAmount)) : null;
    const netAmountValue =
      parsedNetAmount !== null && !isNaN(parsedNetAmount) ? parsedNetAmount : null;

    const data: CreateReceivedQuotationInput | UpdateReceivedQuotationInput = {
      name: name.trim(),
      submittedAt: new Date(submittedAt),
      ...(selectedFile ? { file: selectedFile } : {}),
      ...(removeFile ? { removeFile: true } : {}),
      ...(lineItemInputs.length > 0 ? { lineItems: lineItemInputs } : {}),
      netAmount: netAmountValue,
    };

    try {
      await onSubmit(data);
      // 保存成功（design.md 4871-4874, 4911）: snapshot を最新化し isDirty=false に戻す。
      // ダイアログクローズ動作は親 (onSubmit 内 setShowQuotationForm(false)) で行われるが、
      // クローズ前に未保存変更ガードが誤発火しないよう snapshot を即時同期する。
      clearPendingSave();
      setSaveError(null);
      setOptimisticConflictError(null);
      setSnapshot({
        name,
        submittedAt,
        netAmount,
        selectedFile,
        lineItems,
      });
    } catch (err) {
      // Req 38.10: 楽観的排他制御競合は再認証フローと別系統で処理
      if (err instanceof ApiError && err.statusCode === 409) {
        clearPendingSave();
        setOptimisticConflictError(err);
        return;
      }
      // Req 38.1, 38.6: 401 はクライアント層で sessionExpiredCallback 経由でモーダル表示中。
      //   pendingSaveOperation を維持して再認証成功時のリトライを待機する。
      if (err instanceof ApiError && err.statusCode === 401) {
        return;
      }
      // それ以外の保存エラー
      setSaveError(err instanceof Error ? err.message : '保存に失敗しました');
      clearPendingSave();
    }
  }, [
    name,
    submittedAt,
    selectedFile,
    removeFile,
    lineItems,
    netAmount,
    onSubmit,
    clearPendingSave,
  ]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Req 38.4: 再認証中は保存処理の二重起動を抑止
      if (isReauthInProgress) return;

      if (!validate()) {
        return;
      }

      // Req 38.1: 保存処理開始時に pendingRef にラップ済み saveFn をセット
      setPendingSave(performSave);
      await performSave();
    },
    [isReauthInProgress, validate, setPendingSave, performSave]
  );

  // 名前変更ハンドラ
  const handleNameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setErrors((prev) => ({ ...prev, name: undefined }));
  }, []);

  // 提出日変更ハンドラ
  const handleDateChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSubmittedAt(e.target.value);
    setErrors((prev) => ({ ...prev, submittedAt: undefined }));
  }, []);

  // ファイル選択ハンドラ
  const handleFileSelect = useCallback((file: File) => {
    // ファイル形式バリデーション
    if (!isValidFileType(file)) {
      setErrors((prev) => ({
        ...prev,
        file: 'PDF、Excel、画像ファイルのみ対応しています',
      }));
      return;
    }

    // ファイルサイズバリデーション
    if (!isValidFileSize(file)) {
      setErrors((prev) => ({
        ...prev,
        file: 'ファイルサイズは10MB以下にしてください',
      }));
      return;
    }

    setSelectedFile(file);
    setRemoveFile(false);
    setErrors((prev) => ({ ...prev, content: undefined, file: undefined }));
  }, []);

  // ファイルinput変更ハンドラ
  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  // ファイル削除ハンドラ
  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    if (mode === 'edit' && existingFileName) {
      setRemoveFile(true);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [mode, existingFileName]);

  // ファイルアップロードエリアクリックハンドラ
  const handleUploadAreaClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ドラッグ&ドロップハンドラ (11.6)
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  // 明細行変更ハンドラ
  const handleLineItemsChange = useCallback((items: LineItemFormData[]) => {
    setLineItems(items);
    setErrors((prev) => ({ ...prev, content: undefined }));
  }, []);

  // OCR一括取り込みハンドラ
  // Task 79.3: Req 37.14 - 取り込んだ lineItems に reassignSortOrder を適用してから state 反映
  const handleImportLineItems = useCallback(
    (items: LineItemFormData[]) => {
      const reordered = reassignSortOrder(items);
      setLineItems(reordered);
      setErrors((prev) => ({ ...prev, content: undefined }));

      // NET金額自動入力ロジック（34.1, 34.2）
      if (netAmount.trim() === '') {
        const totalAmount = calculateTotalAmount(reordered);
        if (totalAmount > 0) {
          // 合計金額をNET金額に設定（34.4: 整数表示、小数第1位で四捨五入）
          const formattedNetAmount = formatUnitPrice(String(totalAmount));
          setNetAmount(formattedNetAmount);
        }
      }
      // NET金額欄に既存値がある場合は変更しない（34.3）
    },
    [netAmount]
  );

  // 転記関連状態
  const [transcriptionMessage, setTranscriptionMessage] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [showTranscriptionConfirm, setShowTranscriptionConfirm] = useState(false);

  // Requirement 40: OCRセクション折りたたみ機能のローカル state
  // - Req 40 AC 8/9: 初期値 true（登録・編集ダイアログのいずれも展開状態で開く）
  // - Req 40 AC 10: 永続化なし（unmount → remount で自動的に初期値に戻る）
  const [isOcrSectionExpanded, setIsOcrSectionExpanded] = useState<boolean>(true);
  // Req 40 AC 16: フォーカス時の視覚的明示を OS 非依存で実現する補助 state
  const [isOcrHeaderFocused, setIsOcrHeaderFocused] = useState<boolean>(false);

  // 既存明細行データが有効か判定（空の1行のみでない場合）
  const hasExistingLineItemData = useCallback((): boolean => {
    if (lineItems.length === 0) return false;
    if (lineItems.length === 1) {
      const item = lineItems[0];
      if (!item) return false;
      return (
        item.name.trim() !== '' || item.customCategory.trim() !== '' || item.workType.trim() !== ''
      );
    }
    return true;
  }, [lineItems]);

  // 転記実行
  const executeTranscription = useCallback(() => {
    if (!selectedItems || selectedItems.length === 0) return;

    const selectedOnly = selectedItems;
    let idCtr = 0;
    const newLineItems: LineItemFormData[] = selectedOnly.map((item, index) => {
      idCtr++;
      // 18.11: 転記時に数量にformatQuantity()を適用して小数2桁固定表示
      const rawQuantity =
        item.quantity !== undefined && item.quantity !== null ? String(item.quantity) : '';
      const formattedQuantity = formatQuantity(rawQuantity);
      return {
        id: `transcription-${Date.now()}-${idCtr}`,
        customCategory: item.customCategory ?? '',
        workType: item.workType ?? '',
        name: item.name ?? '',
        specification: item.specification ?? '',
        unit: item.unit ?? '',
        quantity: formattedQuantity,
        unitPrice: '', // 転記時に単価は空欄
        amount: null,
        remarks: item.remarks ?? '',
        sortOrder: index,
      };
    });

    // Task 79.3: Req 37.14 - 転記後の lineItems に reassignSortOrder を適用してから反映
    const reordered = reassignSortOrder(newLineItems);
    setLineItems(reordered);
    setErrors((prev) => ({ ...prev, content: undefined }));

    // NET金額自動入力ロジック（34.6）
    if (netAmount.trim() === '') {
      const totalAmount = calculateTotalAmount(reordered);
      if (totalAmount > 0) {
        const formattedNetAmount = formatUnitPrice(String(totalAmount));
        setNetAmount(formattedNetAmount);
      }
    }

    setTranscriptionMessage({
      type: 'success',
      message: `${reordered.length}件の項目を転記しました。内容を確認し、必要に応じて修正してください。`,
    });
    setShowTranscriptionConfirm(false);
  }, [selectedItems, netAmount]);

  // 転記ボタンクリックハンドラ
  const handleTranscriptionClick = useCallback(() => {
    setTranscriptionMessage(null);

    if (!selectedItems || selectedItems.length === 0) {
      setTranscriptionMessage({
        type: 'error',
        message: '選択された項目がありません',
      });
      return;
    }

    if (hasExistingLineItemData()) {
      // 既存データがある場合は確認ダイアログ表示
      setShowTranscriptionConfirm(true);
    } else {
      // 既存データがない場合は直接転記
      executeTranscription();
    }
  }, [selectedItems, hasExistingLineItemData, executeTranscription]);

  // 確認ダイアログキャンセル
  const handleTranscriptionCancel = useCallback(() => {
    setShowTranscriptionConfirm(false);
  }, []);

  // 確認ダイアログ確認
  const handleTranscriptionConfirm = useCallback(() => {
    executeTranscription();
  }, [executeTranscription]);

  // Requirement 40: OCRセクション折りたたみ機能のハンドラ
  // Req 40 AC 4/5/13: クリック・Enter・Space で展開/折りたたみをトグル
  // （`<button type="button">` 標準動作により Enter/Space は click を発火）
  // Req 40 AC 13: 処理中/完了/失敗いずれの状態でも disabled 化しない
  const handleToggleOcrSection = useCallback(() => {
    setIsOcrSectionExpanded((prev) => !prev);
  }, []);

  // Req 40 AC 16: フォーカス取得時にヘッダの視覚的明示を有効化
  const handleOcrHeaderFocus = useCallback(() => {
    setIsOcrHeaderFocused(true);
  }, []);

  // Req 40 AC 16: フォーカス喪失時に視覚的明示を解除
  const handleOcrHeaderBlur = useCallback(() => {
    setIsOcrHeaderFocused(false);
  }, []);

  // キャンセル/クローズハンドラ（Req 38.12: 未保存変更ガード介在）
  // ダイアログクローズ要求（×ボタン、背景クリック、Esc 等）のすべての経路から
  // この handler を経由するように上位（EstimateRequestDetailPage）でも onCancel に
  // 渡されるが、本フォーム内のキャンセルボタンクリックパスでも confirmCloseIfDirty を介在させる。
  const handleCancel = useCallback(() => {
    if (!confirmCloseIfDirty()) return;
    onCancel();
  }, [confirmCloseIfDirty, onCancel]);

  const submitButtonText = mode === 'create' ? '登録' : '更新';
  const submitButtonLoadingText = mode === 'create' ? '登録中...' : '更新中...';

  // ファイル表示判定
  const hasCurrentFile = selectedFile !== null || (existingFileName !== null && !removeFile);
  const displayFileName = selectedFile?.name ?? existingFileName;
  const displayFileSize = selectedFile?.size ?? initialData?.fileSize;

  // Req 38.4: 再認証中は内部の操作系（保存・追加・メニュー・ファイル UP・OCR・項目転記）を非活性化
  const isOperationLocked = isSubmitting || isReauthInProgress;

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      {/* 受領見積書名 */}
      <div style={styles.fieldGroup}>
        <label htmlFor="quotation-name" style={styles.label}>
          受領見積書名<span style={styles.required}>*</span>
        </label>
        <input
          id="quotation-name"
          type="text"
          value={name}
          onChange={handleNameChange}
          maxLength={200}
          placeholder="受領見積書名を入力"
          disabled={isOperationLocked}
          style={{
            ...styles.input,
            ...(errors.name ? styles.inputError : {}),
          }}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'name-error' : undefined}
        />
        {errors.name && (
          <p id="name-error" style={styles.errorText} role="alert">
            {errors.name}
          </p>
        )}
      </div>

      {/* 提出日 */}
      <div style={styles.fieldGroup}>
        <label htmlFor="submitted-at" style={styles.label}>
          提出日<span style={styles.required}>*</span>
        </label>
        <input
          id="submitted-at"
          type="date"
          value={submittedAt}
          onChange={handleDateChange}
          disabled={isOperationLocked}
          style={{
            ...styles.input,
            ...(errors.submittedAt ? styles.inputError : {}),
          }}
          aria-invalid={!!errors.submittedAt}
          aria-describedby={errors.submittedAt ? 'date-error' : undefined}
        />
        {errors.submittedAt && (
          <p id="date-error" style={styles.errorText} role="alert">
            {errors.submittedAt}
          </p>
        )}
      </div>

      {/* ファイルアップロード (11.5, 11.6) */}
      <div style={styles.fieldGroup}>
        <span style={styles.label}>ファイル</span>

        {!hasCurrentFile && (
          <div
            onClick={handleUploadAreaClick}
            onKeyDown={(e) => e.key === 'Enter' && handleUploadAreaClick()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            style={{
              ...styles.fileUploadArea,
              ...(isDragOver ? styles.fileUploadAreaDragOver : {}),
              ...(errors.file ? styles.fileUploadAreaError : {}),
            }}
          >
            <svg
              width="32"
              height="32"
              fill="none"
              viewBox="0 0 24 24"
              stroke="#6b7280"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3v11.25"
              />
            </svg>
            <span style={styles.fileUploadText}>ファイルを選択またはドラッグ&ドロップ</span>
            <span style={styles.fileUploadHint}>PDF、Excel、画像（JPEG、PNG）/ 最大10MB</span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          data-testid="file-input"
          accept={ALLOWED_FILE_EXTENSIONS}
          onChange={handleFileChange}
          disabled={isOperationLocked}
          style={styles.hiddenInput}
        />

        {/* 選択されたファイル表示 */}
        {hasCurrentFile && displayFileName && (
          <div style={styles.selectedFile}>
            <div>
              <div style={styles.selectedFileName}>{displayFileName}</div>
              {displayFileSize && (
                <div style={styles.selectedFileSize}>{formatFileSize(displayFileSize)}</div>
              )}
            </div>
            <button
              type="button"
              onClick={handleRemoveFile}
              style={styles.removeFileButton}
              disabled={isOperationLocked}
            >
              削除
            </button>
          </div>
        )}

        {errors.file && (
          <p style={styles.errorText} role="alert">
            {errors.file}
          </p>
        )}
      </div>

      {/* ファイルインラインプレビュー (11.5, 16.12) */}
      {selectedFile ? (
        <div style={styles.previewSection}>
          <FileInlinePreview file={selectedFile} />
        </div>
      ) : (
        mode === 'edit' &&
        existingFileName &&
        !removeFile &&
        existingFilePreviewUrl && (
          <div style={styles.previewSection}>
            <FileInlinePreview
              file={null}
              existingPreviewUrl={existingFilePreviewUrl}
              fileMimeType={initialData?.fileMimeType ?? undefined}
            />
          </div>
        )
      )}

      {/* OcrDataExtractor（遅延ロード） */}
      {/*
        Requirement 40: OCRセクション折りたたみ機能
        - Req 40 AC 1/2: 登録/編集の両ダイアログでヘッダを表示
        - Req 40 AC 14: 表示条件未成立時はヘッダごと非表示（既存条件レンダリングを継承）
        - Req 40 AC 11/12: `hidden` 属性により OcrDataExtractor は unmount されず内部 state を維持
        - Req 40 AC 17: OcrDataExtractor の props は一切変更しない
      */}
      {selectedFile ? (
        <div style={styles.ocrSection}>
          <button
            type="button"
            onClick={handleToggleOcrSection}
            onFocus={handleOcrHeaderFocus}
            onBlur={handleOcrHeaderBlur}
            aria-expanded={isOcrSectionExpanded}
            aria-controls="received-quotation-ocr-section-body"
            style={{
              ...styles.ocrSectionHeader,
              ...(isOcrHeaderFocused ? styles.ocrSectionHeaderFocus : {}),
            }}
            data-testid="ocr-section-header"
          >
            <OcrChevronIcon isExpanded={isOcrSectionExpanded} />
            <span style={styles.ocrSectionTitle}>OCR / データパース</span>
          </button>
          <div id="received-quotation-ocr-section-body" hidden={!isOcrSectionExpanded}>
            <Suspense
              fallback={<div style={styles.suspenseFallback}>OCRエンジンを読み込み中...</div>}
            >
              <OcrDataExtractor file={selectedFile} onImportLineItems={handleImportLineItems} />
            </Suspense>
          </div>
        </div>
      ) : (
        mode === 'edit' &&
        existingFileName &&
        !removeFile &&
        existingFilePreviewUrl && (
          <div style={styles.ocrSection}>
            <button
              type="button"
              onClick={handleToggleOcrSection}
              onFocus={handleOcrHeaderFocus}
              onBlur={handleOcrHeaderBlur}
              aria-expanded={isOcrSectionExpanded}
              aria-controls="received-quotation-ocr-section-body"
              style={{
                ...styles.ocrSectionHeader,
                ...(isOcrHeaderFocused ? styles.ocrSectionHeaderFocus : {}),
              }}
              data-testid="ocr-section-header"
            >
              <OcrChevronIcon isExpanded={isOcrSectionExpanded} />
              <span style={styles.ocrSectionTitle}>OCR / データパース</span>
            </button>
            <div id="received-quotation-ocr-section-body" hidden={!isOcrSectionExpanded}>
              <Suspense
                fallback={<div style={styles.suspenseFallback}>OCRエンジンを読み込み中...</div>}
              >
                <OcrDataExtractor
                  file={null}
                  fileUrl={existingFilePreviewUrl}
                  fileMimeType={initialData?.fileMimeType ?? undefined}
                  autoStart={false}
                  onImportLineItems={handleImportLineItems}
                />
              </Suspense>
            </div>
          </div>
        )
      )}

      {/* 構造化データ入力エリア（明細行エディタ） (11.9) */}
      <div style={styles.lineItemsSection}>
        <div style={styles.sectionTitle}>明細行</div>

        {/* 項目選択から転記ボタン (15.1) */}
        {selectedItems && (
          <div style={styles.transcriptionSection}>
            <button
              type="button"
              onClick={handleTranscriptionClick}
              disabled={isOperationLocked}
              style={{
                ...styles.transcriptionButton,
                ...(isOperationLocked ? styles.transcriptionButtonDisabled : {}),
              }}
              data-testid="transcription-button"
            >
              項目選択から転記
            </button>
            {transcriptionMessage && (
              <span
                style={{
                  ...styles.transcriptionMessage,
                  ...(transcriptionMessage.type === 'success'
                    ? styles.transcriptionSuccess
                    : styles.transcriptionError),
                }}
                role="status"
                aria-live="polite"
                data-testid="transcription-message"
              >
                {transcriptionMessage.message}
              </span>
            )}
          </div>
        )}

        <LineItemEditor
          lineItems={lineItems}
          onLineItemsChange={handleLineItemsChange}
          disabled={isOperationLocked}
        />
      </div>

      {/* NET金額フィールド（Task 63.1: 受領見積書レベル、明細行テーブルの下） */}
      <div style={styles.fieldGroup}>
        <label htmlFor="net-amount" style={styles.label}>
          NET金額
        </label>
        <input
          id="net-amount"
          type="text"
          inputMode="decimal"
          value={netAmount}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNetAmount(e.target.value)}
          onBlur={() => {
            const formatted = formatUnitPrice(netAmount);
            if (formatted !== netAmount) {
              setNetAmount(formatted);
            }
          }}
          placeholder="NET金額"
          disabled={isOperationLocked}
          style={{
            ...styles.input,
            textAlign: 'right' as const,
            maxWidth: '200px',
          }}
          aria-label="NET金額"
        />
      </div>

      {/* コンテンツエラー（ファイルも明細行もない場合） */}
      {errors.content && (
        <p style={styles.errorText} role="alert">
          {errors.content}
        </p>
      )}

      {/* 楽観的排他制御エラー（Req 38.10: 再認証フローと別系統） */}
      {optimisticConflictError && (
        <p style={styles.errorText} role="alert" data-testid="optimistic-conflict-error">
          他のユーザーが編集を反映済みのため保存できませんでした。最新を読み込んでやり直してください。
        </p>
      )}

      {/* 一般保存エラー */}
      {saveError && (
        <p style={styles.errorText} role="alert" data-testid="save-error">
          {saveError}
        </p>
      )}

      {/* ボタングループ */}
      <div style={styles.buttonGroup}>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSubmitting}
          style={{
            ...styles.button,
            ...styles.cancelButton,
            ...(isSubmitting ? styles.cancelButtonDisabled : {}),
          }}
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={isOperationLocked}
          style={{
            ...styles.button,
            ...styles.submitButton,
            ...(isOperationLocked ? styles.submitButtonDisabled : {}),
          }}
        >
          {isSubmitting ? (
            <span style={styles.loadingWrapper}>
              <LoadingSpinner />
              {submitButtonLoadingText}
            </span>
          ) : (
            submitButtonText
          )}
        </button>
      </div>

      {/* 転記上書き確認ダイアログ (15.8) */}
      {showTranscriptionConfirm && (
        <div
          style={styles.confirmDialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="transcription-confirm-title"
          data-testid="transcription-confirm-dialog"
        >
          <div style={styles.confirmDialogContent}>
            <h3 id="transcription-confirm-title" style={styles.confirmDialogTitle}>
              明細行の上書き確認
            </h3>
            <p style={styles.confirmDialogMessage}>
              既存の明細行データが上書きされます。続行しますか？
            </p>
            <div style={styles.confirmDialogButtons}>
              <button
                type="button"
                onClick={handleTranscriptionCancel}
                style={styles.confirmDialogCancel}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleTranscriptionConfirm}
                style={styles.confirmDialogConfirm}
                data-testid="transcription-confirm-button"
              >
                続行
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

export default ReceivedQuotationForm;
