/**
 * @fileoverview 項目選択パネルコンポーネント（改訂版: Task 30）
 *
 * Task 5.4: ItemSelectionPanelコンポーネントを実装する
 * Task 30: クライアントサイド状態管理・保存ボタン方式への改修
 *
 * Requirements:
 * - 4.2: 見積依頼詳細画面に内訳書項目の一覧を表示する
 * - 4.3: 各項目行にチェックボックスを表示する
 * - 4.4: チェックボックス変更時にクライアントサイドの状態のみを更新する
 * - 4.5: チェックボックス変更時にサーバーへのリクエストを送信しない
 * - 4.6: 項目選択セクションに「保存」ボタンを表示する
 * - 4.7: 保存ボタンクリック時に全項目の選択状態をサーバーに一括送信する
 * - 4.8: 保存成功時のフィードバックを表示し未保存フラグをリセットする
 * - 4.9: 保存失敗時にエラーメッセージを表示し選択状態をサーバー状態に復元する
 * - 4.10: 他の見積依頼で選択済みの項目の背景色を変更する（bg-orange-50）
 * - 4.11: 他の見積依頼の依頼先取引先名を表示する
 * - 4.12: 複数の見積依頼で選択されている場合の取引先名をカンマ区切りで表示する
 * - 4.14: 見積依頼方法ラジオボタンのクライアントサイド管理
 * - 4.19: 未保存の変更がある場合に保存ボタンを視覚的に強調表示する
 * - 4.20: 未保存の変更がある状態でのページ離脱確認ダイアログ
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import type {
  ItemWithSelectionInfo,
  EstimateRequestMethod,
  ItemSelectionInput,
} from '../../types/estimate-request.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ItemSelectionPanelコンポーネントのProps
 */
export interface ItemSelectionPanelProps {
  /** 項目一覧 */
  items: ItemWithSelectionInfo[];
  /** 見積依頼方法 */
  method: EstimateRequestMethod;
  /** 内訳書を本文に含める */
  includeBreakdownInBody: boolean;
  /** 項目選択変更時のコールバック（保存ボタンクリック時に呼ばれる） */
  onItemSelectionChange: (items: ItemSelectionInput[]) => Promise<void> | void;
  /** 見積依頼方法変更時のコールバック（保存ボタンクリック時に呼ばれる） */
  onMethodChange: (method: EstimateRequestMethod) => void;
  /** 内訳書を本文に含める変更時のコールバック */
  onIncludeBreakdownChange: (value: boolean) => void;
  /** ローディング状態 */
  loading?: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  optionsSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  },
  optionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#374151',
    cursor: 'pointer',
  },
  radioGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '14px',
    color: '#374151',
    cursor: 'pointer',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
  },
  th: {
    padding: '12px 8px',
    textAlign: 'left' as const,
    borderBottom: '2px solid #e5e7eb',
    backgroundColor: '#f9fafb',
    fontWeight: 600,
    color: '#374151',
  },
  thCheckbox: {
    width: '40px',
    textAlign: 'center' as const,
  },
  td: {
    padding: '10px 8px',
    borderBottom: '1px solid #e5e7eb',
    color: '#1f2937',
  },
  tdCheckbox: {
    textAlign: 'center' as const,
  },
  rowNormal: {
    backgroundColor: '#ffffff',
  },
  rowOtherSelected: {
    backgroundColor: 'rgb(255, 247, 237)', // bg-orange-50
  },
  otherRequestsCell: {
    fontSize: '12px',
    color: '#c2410c', // orange-700 (WCAG AA contrast ratio)
  },
  emptyMessage: {
    padding: '32px',
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: '14px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  checkboxDisabled: {
    cursor: 'not-allowed',
  },
  saveButtonSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  saveButton: {
    padding: '8px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    transition: 'background-color 0.2s',
    backgroundColor: '#2563eb',
    color: '#ffffff',
  } as React.CSSProperties,
  saveButtonHighlight: {
    backgroundColor: '#1d4ed8',
    boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.3)',
  } as React.CSSProperties,
  saveButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  saveButtonSaving: {
    backgroundColor: '#6b7280',
    cursor: 'wait',
  } as React.CSSProperties,
  feedbackMessage: {
    fontSize: '13px',
    fontWeight: 500,
  } as React.CSSProperties,
  feedbackSuccess: {
    color: '#059669',
  } as React.CSSProperties,
  feedbackError: {
    color: '#dc2626',
  } as React.CSSProperties,
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 項目選択パネル（改訂版）
 *
 * 見積依頼詳細画面で内訳書項目の選択状態をクライアントサイドで管理するコンポーネント。
 * チェックボックスによる項目選択は即時にはサーバーに送信されず、
 * 「保存」ボタンクリック時に一括送信されます。
 */
export function ItemSelectionPanel({
  items,
  method,
  includeBreakdownInBody,
  onItemSelectionChange,
  onMethodChange,
  onIncludeBreakdownChange,
  loading = false,
}: ItemSelectionPanelProps) {
  // サーバーから取得した選択状態を保持（復元用）
  const [serverSelections, setServerSelections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    items.forEach((item) => {
      initial[item.estimateRequestItemId] = item.selected;
    });
    return initial;
  });

  // ローカル選択状態（UI用）
  const [localSelections, setLocalSelections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    items.forEach((item) => {
      initial[item.estimateRequestItemId] = item.selected;
    });
    return initial;
  });

  // ローカル見積依頼方法状態
  const [localMethod, setLocalMethod] = useState<EstimateRequestMethod>(method);

  // 保存中状態
  const [isSaving, setIsSaving] = useState(false);

  // フィードバックメッセージ
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // items変更時にサーバー状態とローカル状態を同期
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    const newSelections: Record<string, boolean> = {};
    items.forEach((item) => {
      newSelections[item.estimateRequestItemId] = item.selected;
    });
    setServerSelections(newSelections);
    setLocalSelections(newSelections);
  }

  // method変更時にローカル状態を同期
  const [prevMethod, setPrevMethod] = useState(method);
  if (method !== prevMethod) {
    setPrevMethod(method);
    setLocalMethod(method);
  }

  // 未保存の変更を検出
  const hasUnsavedChanges = useMemo(() => {
    // 選択状態の変更検出
    for (const itemId of Object.keys(serverSelections)) {
      if (localSelections[itemId] !== serverSelections[itemId]) {
        return true;
      }
    }
    // 見積依頼方法の変更検出
    if (localMethod !== method) {
      return true;
    }
    return false;
  }, [localSelections, serverSelections, localMethod, method]);

  // ページ離脱確認（beforeunload）
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // フィードバック自動消去（3秒後）
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  // 項目選択変更（ローカル状態のみ更新）
  const handleItemSelectionChange = useCallback((itemId: string, selected: boolean) => {
    setLocalSelections((prev) => ({
      ...prev,
      [itemId]: selected,
    }));
    setFeedback(null);
  }, []);

  // 見積依頼方法変更（ローカル状態のみ更新）
  const handleMethodChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalMethod(e.target.value as EstimateRequestMethod);
    setFeedback(null);
  }, []);

  // 内訳書を本文に含める変更（即座にサーバーに反映）
  const handleIncludeBreakdownChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onIncludeBreakdownChange(e.target.checked);
    },
    [onIncludeBreakdownChange]
  );

  // 保存処理
  const handleSave = useCallback(async () => {
    if (isSaving) return;

    setIsSaving(true);
    setFeedback(null);

    try {
      // 全項目の選択状態を一括送信
      const changes: ItemSelectionInput[] = Object.entries(localSelections).map(
        ([itemId, selected]) => ({
          itemId,
          selected,
        })
      );

      await onItemSelectionChange(changes);

      // 見積依頼方法が変更されていれば送信
      if (localMethod !== method) {
        onMethodChange(localMethod);
      }

      // サーバー状態を更新
      setServerSelections({ ...localSelections });

      setFeedback({ type: 'success', message: '保存しました' });
    } catch {
      // エラー時はサーバー状態に復元
      setLocalSelections({ ...serverSelections });
      setLocalMethod(method);
      setFeedback({ type: 'error', message: '保存に失敗しました。元の状態に戻しました。' });
    } finally {
      setIsSaving(false);
    }
  }, [
    isSaving,
    localSelections,
    localMethod,
    method,
    onItemSelectionChange,
    onMethodChange,
    serverSelections,
  ]);

  // 他の見積依頼の取引先名を取得
  const getOtherRequestsText = useCallback((item: ItemWithSelectionInfo): string => {
    if (item.otherRequests.length === 0) return '';
    return item.otherRequests.map((r) => r.tradingPartnerName).join(', ');
  }, []);

  // 保存ボタンのスタイル算出
  const getSaveButtonStyle = (): React.CSSProperties => {
    if (isSaving) {
      return { ...styles.saveButton, ...styles.saveButtonSaving };
    }
    if (!hasUnsavedChanges) {
      return { ...styles.saveButton, ...styles.saveButtonDisabled };
    }
    return { ...styles.saveButton, ...styles.saveButtonHighlight };
  };

  // オプションセクション（共通）
  const optionsSection = (
    <div style={styles.optionsSection}>
      <div style={styles.optionRow}>
        <label style={styles.label}>
          <input
            type="checkbox"
            checked={includeBreakdownInBody}
            onChange={handleIncludeBreakdownChange}
            style={styles.checkbox}
          />
          内訳書を本文に含める
        </label>
      </div>
      <div style={styles.optionRow}>
        <span style={{ fontSize: '14px', color: '#374151' }}>見積依頼方法:</span>
        <div style={styles.radioGroup}>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="method"
              value="EMAIL"
              checked={localMethod === 'EMAIL'}
              onChange={handleMethodChange}
            />
            メール
          </label>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="method"
              value="FAX"
              checked={localMethod === 'FAX'}
              onChange={handleMethodChange}
            />
            FAX
          </label>
        </div>
      </div>
    </div>
  );

  // 保存ボタンセクション
  const saveButtonSection = (
    <div style={styles.saveButtonSection}>
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving || !hasUnsavedChanges}
        style={getSaveButtonStyle()}
        aria-label={isSaving ? '保存中' : '選択状態を保存'}
        data-testid="save-selection-button"
      >
        {isSaving ? '保存中...' : '保存'}
      </button>
      {feedback && (
        <span
          style={{
            ...styles.feedbackMessage,
            ...(feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError),
          }}
          role="status"
          aria-live="polite"
          data-testid="save-feedback"
        >
          {feedback.message}
        </span>
      )}
    </div>
  );

  // 項目がない場合
  if (items.length === 0) {
    return (
      <div style={styles.container}>
        {optionsSection}
        {saveButtonSection}
        <div style={styles.emptyMessage}>項目がありません</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {optionsSection}
      {saveButtonSection}

      {/* 項目テーブル */}
      <table style={styles.table} aria-label="内訳書項目一覧">
        <thead>
          <tr>
            <th style={{ ...styles.th, ...styles.thCheckbox }}>選択</th>
            <th style={styles.th}>任意分類</th>
            <th style={styles.th}>工種</th>
            <th style={styles.th}>名称</th>
            <th style={styles.th}>規格</th>
            <th style={styles.th}>単位</th>
            <th style={styles.th}>数量</th>
            <th style={styles.th}>他の依頼先</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const hasOtherRequests = item.otherRequests.length > 0;
            const rowStyle = hasOtherRequests ? styles.rowOtherSelected : styles.rowNormal;
            const otherRequestsText = getOtherRequestsText(item);

            return (
              <tr key={item.id} style={rowStyle}>
                <td style={{ ...styles.td, ...styles.tdCheckbox }}>
                  <input
                    type="checkbox"
                    checked={localSelections[item.estimateRequestItemId] ?? item.selected}
                    onChange={(e) =>
                      handleItemSelectionChange(item.estimateRequestItemId, e.target.checked)
                    }
                    disabled={loading || isSaving}
                    style={{
                      ...styles.checkbox,
                      ...(loading || isSaving ? styles.checkboxDisabled : {}),
                    }}
                    aria-label={`${item.name}を選択`}
                  />
                </td>
                <td style={styles.td}>{item.customCategory ?? '-'}</td>
                <td style={styles.td}>{item.workType ?? '-'}</td>
                <td style={styles.td}>{item.name ?? '-'}</td>
                <td style={styles.td}>{item.specification ?? '-'}</td>
                <td style={styles.td}>{item.unit ?? '-'}</td>
                <td style={styles.td}>{item.quantity}</td>
                <td style={{ ...styles.td, ...styles.otherRequestsCell }}>
                  {otherRequestsText || '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default ItemSelectionPanel;
