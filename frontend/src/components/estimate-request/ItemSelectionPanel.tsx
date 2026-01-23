/**
 * @fileoverview 項目選択パネルコンポーネント
 *
 * Task 5.4: ItemSelectionPanelコンポーネントを実装する
 *
 * Requirements:
 * - 4.2: 見積依頼詳細画面に内訳書項目の一覧を表示する
 * - 4.3: 各項目行にチェックボックスを表示する
 * - 4.4: チェックボックス変更時に自動保存する
 * - 4.5: debounce処理を適用する（500ms）
 * - 4.6: チェックボックスのデフォルト状態は選択済みとする
 * - 4.7: 「内訳書を本文に含める」チェックボックスを表示する
 * - 4.8: 見積依頼方法（メール/FAX）ラジオボタンを表示する
 * - 4.9: 項目が存在しない場合のメッセージを表示する
 * - 4.10: 他の見積依頼で選択済みの項目の背景色を変更する（bg-orange-50）
 * - 4.11: 他の見積依頼の依頼先取引先名を表示する
 * - 4.12: 複数の見積依頼で選択されている場合の取引先名をカンマ区切りで表示する
 */

import { useState, useCallback, useEffect, useRef } from 'react';
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
  /** 項目選択変更時のコールバック */
  onItemSelectionChange: (items: ItemSelectionInput[]) => Promise<void> | void;
  /** 見積依頼方法変更時のコールバック */
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
    color: '#f97316', // orange-500
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
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 項目選択パネル
 *
 * 見積依頼詳細画面で内訳書項目の選択状態を管理するコンポーネント。
 * チェックボックスによる項目選択、見積依頼方法の選択、
 * 内訳書を本文に含めるオプションを提供します。
 *
 * @example
 * ```tsx
 * <ItemSelectionPanel
 *   items={items}
 *   method="EMAIL"
 *   includeBreakdownInBody={false}
 *   onItemSelectionChange={handleSelectionChange}
 *   onMethodChange={handleMethodChange}
 *   onIncludeBreakdownChange={handleIncludeBreakdownChange}
 * />
 * ```
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
  // ローカル選択状態（UI用）
  const [localSelections, setLocalSelections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    items.forEach((item) => {
      initial[item.estimateRequestItemId] = item.selected;
    });
    return initial;
  });

  // debounceタイマー参照
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // items変更時にローカル状態を同期（レンダリング中のstate更新パターン）
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    const newSelections: Record<string, boolean> = {};
    items.forEach((item) => {
      newSelections[item.estimateRequestItemId] = item.selected;
    });
    setLocalSelections(newSelections);
  }

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // 項目選択変更（debounce付き）
  const handleItemSelectionChange = useCallback(
    (itemId: string, selected: boolean) => {
      // ローカル状態を即座に更新（UI反映）
      setLocalSelections((prev) => ({
        ...prev,
        [itemId]: selected,
      }));

      // 既存のタイマーをキャンセル
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // debounce処理（500ms）
      debounceTimerRef.current = setTimeout(() => {
        const changes: ItemSelectionInput[] = [{ itemId, selected }];
        onItemSelectionChange(changes);
      }, 500);
    },
    [onItemSelectionChange]
  );

  // 見積依頼方法変更
  const handleMethodChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onMethodChange(e.target.value as EstimateRequestMethod);
    },
    [onMethodChange]
  );

  // 内訳書を本文に含める変更
  const handleIncludeBreakdownChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onIncludeBreakdownChange(e.target.checked);
    },
    [onIncludeBreakdownChange]
  );

  // 他の見積依頼の取引先名を取得
  const getOtherRequestsText = useCallback((item: ItemWithSelectionInfo): string => {
    if (item.otherRequests.length === 0) return '';
    return item.otherRequests.map((r) => r.tradingPartnerName).join(', ');
  }, []);

  // 項目がない場合
  if (items.length === 0) {
    return (
      <div style={styles.container}>
        {/* オプションセクション */}
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
                  checked={method === 'EMAIL'}
                  onChange={handleMethodChange}
                />
                メール
              </label>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name="method"
                  value="FAX"
                  checked={method === 'FAX'}
                  onChange={handleMethodChange}
                />
                FAX
              </label>
            </div>
          </div>
        </div>

        <div style={styles.emptyMessage}>項目がありません</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* オプションセクション */}
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
                checked={method === 'EMAIL'}
                onChange={handleMethodChange}
              />
              メール
            </label>
            <label style={styles.radioLabel}>
              <input
                type="radio"
                name="method"
                value="FAX"
                checked={method === 'FAX'}
                onChange={handleMethodChange}
              />
              FAX
            </label>
          </div>
        </div>
      </div>

      {/* 項目テーブル */}
      <table style={styles.table} aria-label="内訳書項目一覧">
        <thead>
          <tr>
            <th style={{ ...styles.th, ...styles.thCheckbox }}>選択</th>
            <th style={styles.th}>カテゴリ</th>
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
                    disabled={loading}
                    style={{
                      ...styles.checkbox,
                      ...(loading ? styles.checkboxDisabled : {}),
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
