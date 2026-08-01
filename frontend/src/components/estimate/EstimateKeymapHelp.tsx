/**
 * @fileoverview EstimateKeymapHelp - キー割当一覧
 *
 * Task 54.7: キー割当一覧の表示
 *
 * 見積書画面で使えるキーボード操作の割り当てを一覧で参照できるようにします（47.3）。
 *
 * **一覧の内容はすべて `ESTIMATE_KEYMAP.entries`（キー割当の単一定義）から生成し、
 * このファイルはキーの組み合わせも説明文も一切持ちません**。割当を書き写すと、
 * 定義を変えたときに画面の一覧だけが古いまま残り、「参照可能な一覧」が実際の
 * 操作と食い違います（design.md `##### estimateKeymap` の Implementation Note:
 * 「確定値は本設計の実装時に `entries` として固定し、`EstimateKeymapHelp` が
 * 同じ定義を表示する（47.3）」）。
 *
 * キー表記の整形規則は `estimateKeymapText` が持ち、ツールバーのボタン説明（23.11）と
 * 共有します。表示は定義の各項目から次のように導きます。
 * - キー表記: `modifiers` + `key`（`ArrowUp` → `↑` のように読みやすい記号へ置換）
 * - 操作の説明: `label` の本文（`label` は「キー表記: 説明」の形で書かれている）
 * - 使える場面: `contexts`
 *
 * 一覧は明細領域（`useEstimateKeyboard` の受け口）の**外**に置きます。明細領域では
 * `Esc` が選択解除として横取りされるため、一覧の中に置くと閉じる操作と競合します。
 *
 * 状態は「開いているか」だけを持ちます。表示のみで編集状態には触れません。
 *
 * Requirements (estimate-creation):
 * - 47.3: キーボード操作の割り当て一覧を画面上で参照可能とする
 *
 * Design: design.md `#### File Structure Plan`
 * `EstimateKeymapHelp.tsx  # 新規: キー割当一覧`（:3727）、
 * mapping table「47.1〜47.8 | キーボード操作・入力中の抑止 | estimateKeymap,
 * EstimateKeymapHelp, isTextInputElement(参照) | `KeymapEntry[]`」（:3911）
 *
 * @module components/estimate/EstimateKeymapHelp
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ESTIMATE_KEYMAP } from '../../domain/estimate/estimateKeymap';
import { formatKeymapKey } from './estimateKeymapText';
import type { FocusContext, KeymapEntry } from '../../domain/estimate/estimateKeymap';

// ============================================================================
// 定義 → 表示の変換（表示の語彙だけを持ち、割当そのものは持たない）
// ============================================================================

/** フォーカス文脈の表記（新しい文脈が増えたら型検査で漏れに気づける） */
const CONTEXT_TEXT: Record<FocusContext, string> = {
  cellEditing: 'セル入力中',
  rowSelected: '行選択中',
  rangeSelected: '範囲選択中',
  hierarchyPanel: '階層構造パネル',
};

/**
 * 割当1件の説明（`label` の本文）
 *
 * `label` は「Alt+Insert: 選択行の直後に行を挿入」のようにキー表記を伴う。
 * キーは専用の列に出すため、本文だけを取り出して重複を避ける。
 * 区切りが無い `label` はそのまま表示する（説明が消えるより良い）。
 */
function describeKeymapEntry(entry: KeymapEntry): string {
  const separatorIndex = entry.label.indexOf(': ');
  return separatorIndex === -1 ? entry.label : entry.label.slice(separatorIndex + 2);
}

/** 一覧の1行 */
interface KeymapHelpRow {
  readonly id: string;
  readonly keyText: string;
  readonly description: string;
  readonly contextText: string;
}

/** キー割当の定義から一覧の行を組み立てる */
function buildKeymapHelpRows(entries: readonly KeymapEntry[]): readonly KeymapHelpRow[] {
  return entries.map((entry, index) => ({
    id: `${entry.command}-${index}`,
    keyText: formatKeymapKey(entry),
    description: describeKeymapEntry(entry),
    contextText: entry.contexts.map((context) => CONTEXT_TEXT[context] ?? context).join('・'),
  }));
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#374151',
  } as React.CSSProperties,
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  } as React.CSSProperties,
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
    width: 'min(720px, 100%)',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    outline: 'none',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  title: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#111827',
    margin: 0,
  } as React.CSSProperties,
  closeButton: {
    padding: '4px 10px',
    borderRadius: '4px',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#374151',
    fontSize: '13px',
    cursor: 'pointer',
  } as React.CSSProperties,
  body: {
    overflowY: 'auto',
    padding: '8px 16px 16px',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  } as React.CSSProperties,
  th: {
    textAlign: 'left',
    padding: '8px',
    borderBottom: '1px solid #e5e7eb',
    color: '#6b7280',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  keyCell: {
    padding: '6px 8px',
    borderBottom: '1px solid #f3f4f6',
    whiteSpace: 'nowrap',
    fontFamily: 'monospace',
    color: '#111827',
  } as React.CSSProperties,
  descriptionCell: {
    padding: '6px 8px',
    borderBottom: '1px solid #f3f4f6',
    color: '#374151',
  } as React.CSSProperties,
  contextCell: {
    padding: '6px 8px',
    borderBottom: '1px solid #f3f4f6',
    color: '#6b7280',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/** 一覧の見出し（入口ボタンとダイアログの名前を揃える） */
const KEYMAP_HELP_TITLE = 'キーボード操作の割り当て一覧';

/**
 * キー割当一覧（47.3）
 *
 * 入口のボタンと一覧本体をひとまとめに持つ。画面側は置くだけでよく、
 * 受け渡す状態が無いため結線漏れが起きない。
 */
export function EstimateKeymapHelp() {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // 割当の定義から毎回組み立てる（定義が変われば表示も変わる）
  const rows = useMemo(() => buildKeymapHelpRows(ESTIMATE_KEYMAP.entries), []);

  // 開いたら一覧そのものへフォーカスを移し、`Esc` と読み上げの起点を一覧に置く
  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        data-testid="open-keymap-help"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        style={styles.trigger}
      >
        キーボード操作の一覧
      </button>

      {isOpen && (
        <div
          style={styles.overlay}
          onClick={() => setIsOpen(false)}
          role="presentation"
          data-testid="keymap-help-overlay"
        >
          {/*
            背景クリックで閉じるため、一覧の中のクリックは伝播させない。
            `Esc` は一覧の中で閉じる操作として扱い、外（明細領域の選択解除）へは
            伝えない。
          */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={KEYMAP_HELP_TITLE}
            tabIndex={-1}
            style={styles.dialog}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setIsOpen(false);
              }
            }}
          >
            <div style={styles.header}>
              <h2 style={styles.title}>{KEYMAP_HELP_TITLE}</h2>
              <button
                type="button"
                data-testid="close-keymap-help"
                onClick={() => setIsOpen(false)}
                style={styles.closeButton}
              >
                閉じる
              </button>
            </div>
            <div style={styles.body}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th scope="col" style={styles.th}>
                      キー
                    </th>
                    <th scope="col" style={styles.th}>
                      操作
                    </th>
                    <th scope="col" style={styles.th}>
                      使える場面
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td style={styles.keyCell}>{row.keyText}</td>
                      <td style={styles.descriptionCell}>{row.description}</td>
                      <td style={styles.contextCell}>{row.contextText}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default EstimateKeymapHelp;
