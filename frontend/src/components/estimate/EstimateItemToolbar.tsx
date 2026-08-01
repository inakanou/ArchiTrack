/**
 * @fileoverview EstimateItemToolbar - 見積項目操作ツールバー
 *
 * Task 26.1: EstimateItemToolbarコンポーネントの実装
 *
 * Requirements (estimate-creation):
 * - REQ-23.1: 見積項目テーブルの上部に項目操作ツールバーを表示する
 * - REQ-23.2: 「項目追加」ボタンを提供し、クリック時にルートレベルに新規3行1セットを追加する
 * - REQ-23.3: 選択項目に対する操作ボタン（子項目追加・削除・複製）を有効化する
 * - REQ-23.4: 「子項目追加」ボタンを提供し、選択中の項目の子として新規3行1セットを追加する
 * - REQ-23.5: 「削除」ボタンを提供し、選択中の項目を削除する
 * - REQ-23.6: 「複製」ボタンを提供し、選択中の項目を複製する
 * - REQ-23.8: 未選択時は選択必須ボタンをdisabled状態で表示する
 * - REQ-23.9: 「上の階層へ移動」ボタンを提供する
 * - REQ-23.10: 「下の階層へ移動」ボタンを提供する
 * - REQ-12.2: 「↑移動」「↓移動」ボタンで同一階層内の表示順序を入れ替える
 * - REQ-41.1: 見積項目操作ツールバーに「値引き行追加」ボタンを提供する（常に有効）
 * - REQ-41.7: 値引き行は自動計算を持たず、押下で直接ルート末尾に追加する（専用ダイアログなし）
 * - 55.1, 55.3: 注記行を任意の階層の任意の位置に追加可能とする
 * - 45.1: 明細の階層表示モードとして「ツリー表示」と「ドリルダウン表示」を提供する（Task 54.4）
 * - 45.2: 階層表示モードのデフォルトを「ツリー表示」とする（Task 54.4）
 * - 47.3: キーボード操作の割り当て一覧を画面上で参照可能とする（Task 54.7 / 入口を置く）
 * - 48.1, 48.2: 取り消し・やり直しの操作を提供する（Task 54.8）
 * - 48.4: 取り消し可能な履歴が存在しない場合、取り消し操作を無効状態で表示する（Task 54.8）
 * - 23.7: 見積項目をクリックした場合、選択状態にし視覚的にハイライト表示する（Task 54.10）
 * - 23.11: ツールバーの各操作に対応するキーボード操作を提供する（Task 54.10）
 * - 44.3: 削除・複写・階層の上げ下げを選択範囲全体に適用する（Task 54.10）
 * - 44.4: 階層下げは選択範囲の先頭行を親とし、残りをその子として配置する（Task 54.10）
 * - 44.8: 複数行が選択されている場合、選択中の行数を画面上に表示する（Task 54.10）
 *
 * design.md `#### File Structure Plan`:
 * `EstimateItemToolbar.tsx  # 改修: 範囲選択・モード切替・取り消しを追加`
 * に従い、階層表示モードの切替操作を明細テーブル上部のツールバーに置く。
 * 表示モード自体の所有者は `useEstimateNavigation` で、本コンポーネントは
 * 現在のモードを受け取って切替を通知するだけで state を持たない。
 * （範囲選択の統合は 54.10、キー割当は 54.6 の担当）
 * 取り消し・やり直し（48.1, 48.2, 48.4）は 54.8 で追加。選択の所有者を表示状態
 * フックへ一本化する 54.10 でも、この2つは選択状態に依存しない操作のままとする。
 *
 * ## 選択の受け取り方（Task 54.10）
 *
 * 選択は「単一の項目ID」ではなく**表示順に並んだ選択範囲**（`selectedKeys`）として
 * 受け取る。所有者は `useEstimateNavigation` ただ1つで、本コンポーネントは範囲の
 * 先頭行を「主たる選択項目」として扱う（44.4 の「先頭行」と同じ基準）。
 *
 * - 削除・複製・階層の上げ下げ: **選択範囲全体**へ適用する（44.3）
 * - 子項目追加・並び替え: 範囲全体へ適用する規定がどの要件にも無いため先頭行のみ
 *
 * ## キー操作との対応（23.11）
 *
 * 各操作ボタンは自分に対応する {@link EstimateCommand} を `data-estimate-command`
 * として名乗り、説明（`title`）に対応キーの表記を載せる。表記はキー割当の単一定義
 * から生成するため、割当を変えるとボタンの説明も自動的に追随する。
 * 対応コマンドを持たない操作ボタンはツールバーに置けない（テストが固定）。
 *
 * @module components/estimate/EstimateItemToolbar
 */

import { EstimateKeymapHelp } from './EstimateKeymapHelp';
import { formatCommandKeyHint } from './estimateKeymapText';
import type { EstimateCommand } from '../../domain/estimate/estimateKeymap';
import type { EstimateItemHierarchyEdit } from '../../hooks/useEstimateEditor';
import type { EstimateViewMode } from '../../hooks/useEstimateNavigation';

// ============================================================================
// 型定義
// ============================================================================

/**
 * EstimateItemToolbar コンポーネントの Props
 */
export interface EstimateItemToolbarProps {
  /**
   * 選択中の行キー（表示順 / 44.1）
   *
   * 所有者は `useEstimateNavigation`。単一選択は要素1件、未選択は空配列で表す。
   * 44.4 の「先頭行」を決めるため**並び替えずに**表示順のまま受け取る。
   */
  selectedKeys: readonly string[];
  /** 選択範囲の先頭行の項目データ（ボタン制御用） */
  selectedItem: EstimateItemHierarchyEdit | null;
  /** 選択範囲の先頭行に直前の兄弟項目が存在するか（下の階層へボタン制御用） */
  hasPreviousSibling: boolean;
  /** 項目追加（ルートレベル） */
  onAddItem: () => void;
  /** 子項目追加（選択中項目の子として） */
  onAddChildItem: (parentId: string) => void;
  /** 値引き行追加（ルートレベル末尾、常に有効）（REQ-41.1, REQ-41.7） */
  onAddDiscountItem: () => void;
  /**
   * 注記行追加（常に有効）（55.1, 55.3）
   *
   * 選択中の項目がある場合はその直後・同一階層へ、未選択ならルート末尾へ追加する。
   * 挿入位置の解決は呼び出し側が行う。
   */
  onAddNoteItem: () => void;
  /** 項目削除（選択範囲全体 / 23.5, 44.3） */
  onDeleteItems: (itemIds: readonly string[]) => void;
  /** 項目複製（選択範囲全体 / 23.6, 44.3） */
  onDuplicateItems: (itemIds: readonly string[]) => void;
  /** 上の階層へ移動（選択範囲全体を親の兄弟レベルへ / 23.9, 44.3, 44.5） */
  onMoveUpItems: (itemIds: readonly string[]) => void;
  /**
   * 下の階層へ移動（23.10, 44.3, 44.4）
   *
   * 単一選択は直前の兄弟の子へ、複数選択は先頭行を親として残りをその子へ配置する。
   * 規則の適用は受け取り側（遷移関数）が行うため、表示順のまま渡す。
   */
  onMoveDownItems: (itemIds: readonly string[]) => void;
  /** 同一階層内で表示順序を1つ上へ入れ替える（REQ-12.2） */
  onReorderUp: (itemId: string) => void;
  /** 同一階層内で表示順序を1つ下へ入れ替える（REQ-12.2） */
  onReorderDown: (itemId: string) => void;
  /** 直前に兄弟項目が存在するか（↑移動ボタン制御用） */
  canReorderUp: boolean;
  /** 直後に兄弟項目が存在するか（↓移動ボタン制御用） */
  canReorderDown: boolean;
  /**
   * 現在の階層表示モード（45.1, 45.2）
   *
   * 所有者は `useEstimateNavigation`。本コンポーネントは表示に用いるだけ。
   */
  viewMode: EstimateViewMode;
  /** 階層表示モードの切替要求（45.1） */
  onViewModeChange: (mode: EstimateViewMode) => void;
  /**
   * 取り消し可能な履歴があるか（48.4）
   *
   * 履歴の所有者は `useEstimateUndo`。本コンポーネントは可否を受け取って
   * 表示するだけで、履歴そのものを持たない。
   */
  canUndo: boolean;
  /** やり直し可能な履歴があるか（48.4） */
  canRedo: boolean;
  /** 直前の編集を取り消す（48.1） */
  onUndo: () => void;
  /** 取り消した編集をやり直す（48.2） */
  onRedo: () => void;
}

/** 階層表示モードの選択肢（45.1） */
const VIEW_MODE_OPTIONS: readonly { readonly mode: EstimateViewMode; readonly label: string }[] = [
  { mode: 'tree', label: 'ツリー表示' },
  { mode: 'drilldown', label: 'ドリルダウン表示' },
];

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 0',
    borderBottom: '1px solid #e5e7eb',
    marginBottom: '12px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  button: {
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
    transition: 'background-color 0.15s, opacity 0.15s',
  } as React.CSSProperties,
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } as React.CSSProperties,
  addButton: {
    backgroundColor: '#eff6ff',
    borderColor: '#93c5fd',
    color: '#1d4ed8',
  } as React.CSSProperties,
  dangerButton: {
    color: '#dc2626',
    borderColor: '#fca5a5',
  } as React.CSSProperties,
  separator: {
    width: '1px',
    height: '24px',
    backgroundColor: '#d1d5db',
    margin: '0 4px',
  } as React.CSSProperties,
  viewModeGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    overflow: 'hidden',
  } as React.CSSProperties,
  viewModeOption: {
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: '#ffffff',
    color: '#374151',
  } as React.CSSProperties,
  viewModeOptionSelected: {
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
  } as React.CSSProperties,
  selectedCount: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: '999px',
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    fontSize: '12px',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
};

// ============================================================================
// キー操作との対応（23.11）
// ============================================================================

/**
 * 操作ボタンに「対応コマンドの宣言」と「キー表記付きの説明」を与える props を作る
 *
 * 対応の宣言（`data-estimate-command`）と利用者向けの表記（`title`）を1か所で
 * 組み立てることで、片方だけが書き換わって対応が崩れることを防ぐ。
 */
function commandProps(
  command: EstimateCommand,
  description: string
): { readonly 'data-estimate-command': EstimateCommand; readonly title: string } {
  const hint = formatCommandKeyHint(command);
  return {
    'data-estimate-command': command,
    title: hint === null ? description : `${description} (${hint})`,
  };
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 見積項目操作ツールバー
 *
 * 見積項目テーブルの上部に配置し、項目の追加・削除・複製・階層移動操作を提供する。
 * 項目選択状態に応じてボタンの有効/無効を制御する。
 */
export function EstimateItemToolbar({
  selectedKeys,
  selectedItem,
  hasPreviousSibling,
  onAddItem,
  onAddChildItem,
  onAddDiscountItem,
  onAddNoteItem,
  onDeleteItems,
  onDuplicateItems,
  onMoveUpItems,
  onMoveDownItems,
  onReorderUp,
  onReorderDown,
  canReorderUp,
  canReorderDown,
  viewMode,
  onViewModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: EstimateItemToolbarProps) {
  // 選択範囲の先頭行を「主たる選択項目」とする（44.4 の「先頭行」と同じ基準）
  const primaryItemId = selectedKeys[0] ?? null;
  const isSelected = primaryItemId !== null;
  const selectedCount = selectedKeys.length;
  const canMoveUp = isSelected && selectedItem !== null && selectedItem.parentId !== null;
  // 44.4 の範囲規則は先頭行を親へ昇格させるため、直前の兄弟が無くても成立する。
  // 単一選択のときだけ「直前の兄弟の子へ移す」規則（23.10）が条件になる。
  const canMoveDown = isSelected && (selectedCount >= 2 || hasPreviousSibling);
  const reorderUpEnabled = isSelected && canReorderUp;
  const reorderDownEnabled = isSelected && canReorderDown;

  return (
    <div data-testid="estimate-item-toolbar" style={styles.toolbar}>
      {/* 項目追加 - 常に有効 (REQ-23.2) */}
      <button
        type="button"
        {...commandProps('addRootItem', 'ルートレベルの末尾に項目を追加')}
        onClick={onAddItem}
        style={{ ...styles.button, ...styles.addButton }}
      >
        + 項目追加
      </button>

      {/* 子項目追加 - 項目選択中のみ有効 (REQ-23.4) */}
      <button
        type="button"
        {...commandProps('addChildItem', '選択中の項目の子として項目を追加')}
        onClick={() => primaryItemId !== null && onAddChildItem(primaryItemId)}
        disabled={!isSelected}
        style={{
          ...styles.button,
          ...styles.addButton,
          ...(!isSelected ? styles.buttonDisabled : {}),
        }}
      >
        +↳ 子項目追加
      </button>

      {/* 値引き行追加 - 常に有効 (REQ-41.1, REQ-41.7) */}
      <button
        type="button"
        data-testid="add-discount-button"
        {...commandProps('addDiscountRow', 'ルートレベルの末尾に値引き行を追加')}
        onClick={onAddDiscountItem}
        style={{ ...styles.button, ...styles.addButton }}
      >
        値引き行追加
      </button>

      {/* 注記行追加 - 常に有効。選択中の行の直後・同一階層へ追加する (55.1, 55.3) */}
      <button
        type="button"
        data-testid="add-note-button"
        {...commandProps('addNoteRow', '選択中の行の直後に注記行を追加')}
        onClick={onAddNoteItem}
        style={{ ...styles.button, ...styles.addButton }}
      >
        注記行追加
      </button>

      {/* 複製 - 項目選択中のみ有効。範囲選択中は範囲全体 (REQ-23.6, 44.3) */}
      <button
        type="button"
        {...commandProps('duplicateCell', '選択中の項目（範囲選択中は範囲全体）を複製')}
        onClick={() => isSelected && onDuplicateItems(selectedKeys)}
        disabled={!isSelected}
        style={{
          ...styles.button,
          ...(!isSelected ? styles.buttonDisabled : {}),
        }}
      >
        複製
      </button>

      {/* 削除 - 項目選択中のみ有効。範囲選択中は範囲全体 (REQ-23.5, 44.3) */}
      <button
        type="button"
        {...commandProps('deleteRow', '選択中の項目（範囲選択中は範囲全体）を削除')}
        onClick={() => isSelected && onDeleteItems(selectedKeys)}
        disabled={!isSelected}
        style={{
          ...styles.button,
          ...styles.dangerButton,
          ...(!isSelected ? styles.buttonDisabled : {}),
        }}
      >
        削除
      </button>

      {/* セパレータ */}
      <div style={styles.separator} />

      {/* 上の階層へ - 項目選択中かつ先頭行の parentId !== null (REQ-23.9, 44.3, 44.5) */}
      <button
        type="button"
        {...commandProps('outdent', '選択中の項目（範囲選択中は範囲全体）を親の兄弟レベルへ移動')}
        onClick={() => isSelected && onMoveUpItems(selectedKeys)}
        disabled={!canMoveUp}
        style={{
          ...styles.button,
          ...(!canMoveUp ? styles.buttonDisabled : {}),
        }}
      >
        上の階層へ
      </button>

      {/* 下の階層へ - 単一選択は直前の兄弟が必要、範囲選択は不要 (REQ-23.10, 44.4) */}
      <button
        type="button"
        {...commandProps(
          'indent',
          '選択中の項目（範囲選択中は先頭行を親として範囲全体）の階層を1段下げる'
        )}
        onClick={() => isSelected && onMoveDownItems(selectedKeys)}
        disabled={!canMoveDown}
        style={{
          ...styles.button,
          ...(!canMoveDown ? styles.buttonDisabled : {}),
        }}
      >
        下の階層へ
      </button>

      {/* セパレータ */}
      <div style={styles.separator} />

      {/* ↑移動 - 同一階層内で表示順序を1つ上へ (REQ-12.2) */}
      <button
        type="button"
        data-testid="reorder-up-button"
        aria-label="上へ移動"
        {...commandProps('reorderRowUp', '同じ階層内で1つ上へ移動')}
        onClick={() => primaryItemId !== null && onReorderUp(primaryItemId)}
        disabled={!reorderUpEnabled}
        style={{
          ...styles.button,
          ...(!reorderUpEnabled ? styles.buttonDisabled : {}),
        }}
      >
        ↑ 上へ
      </button>

      {/* ↓移動 - 同一階層内で表示順序を1つ下へ (REQ-12.2) */}
      <button
        type="button"
        data-testid="reorder-down-button"
        aria-label="下へ移動"
        {...commandProps('reorderRowDown', '同じ階層内で1つ下へ移動')}
        onClick={() => primaryItemId !== null && onReorderDown(primaryItemId)}
        disabled={!reorderDownEnabled}
        style={{
          ...styles.button,
          ...(!reorderDownEnabled ? styles.buttonDisabled : {}),
        }}
      >
        ↓ 下へ
      </button>

      {/* セパレータ */}
      <div style={styles.separator} />

      {/*
        取り消し・やり直し (48.1, 48.2, 48.4)

        取り消せる履歴が無い間は無効表示にする（48.4）。項目の選択状態には
        依存しない（削除した行は選択できないため、選択を条件にすると
        「行削除の取り消し」が押せなくなる）。
      */}
      <button
        type="button"
        data-testid="undo-button"
        aria-label="元に戻す"
        {...commandProps('undo', '元に戻す')}
        onClick={onUndo}
        disabled={!canUndo}
        style={{
          ...styles.button,
          ...(!canUndo ? styles.buttonDisabled : {}),
        }}
      >
        ↶ 元に戻す
      </button>
      <button
        type="button"
        data-testid="redo-button"
        aria-label="やり直す"
        {...commandProps('redo', 'やり直す')}
        onClick={onRedo}
        disabled={!canRedo}
        style={{
          ...styles.button,
          ...(!canRedo ? styles.buttonDisabled : {}),
        }}
      >
        ↷ やり直す
      </button>

      {/* セパレータ */}
      <div style={styles.separator} />

      {/*
        階層表示モードの切替 (45.1, 45.2)

        項目の選択状態に依存しない表示操作なので常に有効。切替は表示状態だけを
        変更し、未保存の編集内容には触れない（45.10）。
      */}
      <div role="radiogroup" aria-label="階層表示モード" style={styles.viewModeGroup}>
        {VIEW_MODE_OPTIONS.map((option) => {
          const isCurrent = viewMode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              role="radio"
              aria-checked={isCurrent}
              data-testid={`view-mode-${option.mode}`}
              {...commandProps('toggleViewMode', `${option.label}へ切り替える`)}
              onClick={() => onViewModeChange(option.mode)}
              style={{
                ...styles.viewModeOption,
                ...(isCurrent ? styles.viewModeOptionSelected : {}),
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* セパレータ */}
      <div style={styles.separator} />

      {/*
        キー割当一覧の入口 (47.3)

        キーボードで行える操作の一覧なので、同じ操作を行うボタンの並びの傍らに置く。
        一覧の内容はキー割当の単一定義から生成されるため、ここは配置するだけで
        受け渡す状態を持たない。明細領域（`Esc` を横取りするキー操作の受け口）の
        外側にあたるので、一覧を開いている間の `Esc` は一覧を閉じる操作になる。
        明細への操作ではなく一覧そのものの表示なので、対応するキー割当は持たない。
      */}
      <EstimateKeymapHelp />

      {/*
        選択中の行数 (44.8)

        複数行を選択している間だけ出す。単一選択は行のハイライトで十分に伝わるうえ、
        常時「1行を選択中」と出すと範囲選択との差が読み取れなくなる。
        操作の対象範囲が変わったことを読み上げでも伝えるため `role="status"` とする。
      */}
      {selectedCount >= 2 && (
        <span
          data-testid="selected-row-count"
          role="status"
          aria-live="polite"
          style={styles.selectedCount}
        >
          {selectedCount}行を選択中
        </span>
      )}
    </div>
  );
}
