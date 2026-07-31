/**
 * @fileoverview estimateEditReducer.types - 編集状態（State / Action）の型定義
 *
 * 見積明細の編集状態に関する型を1箇所に集約します。
 * 依存方向（design.md `#### Dependency Direction`）における最下層であり、
 * このモジュールは他のいかなるモジュールにも依存しません。
 *
 * ```
 * estimateEditReducer.types → estimateTree → estimateEditReducer → hooks → components → pages
 * ```
 *
 * Requirements (estimate-creation):
 * - 43.1: 新規行は識別子を持たず一時識別子（`tmp-` 接頭辞）で表現する
 * - 54.6: 別途工事・有効期限・提出日を見積書ごとに保持する
 * - 55.1: 注記行は名称のみを持つ
 *
 * Design: design.md `#### Frontend Domain` > `##### estimateEditReducer` > `###### State Management`
 *
 * @module domain/estimate/estimateEditReducer.types
 */

// ============================================================================
// 識別子
// ============================================================================

/** 永続化済み見積項目の識別子 */
export type EstimateItemId = string;

/**
 * 未保存の新規項目に付与する一時識別子
 *
 * 保存ペイロード（design.md `SaveEstimateItemNode`）では `id: null` ＋ `tempId` の組で送出され、
 * サーバー側が親子関係の解決に用いる。
 */
export type TempId = `tmp-${string}`;

/** ツリー上のノードを一意に指すキー */
export type NodeKey = EstimateItemId | TempId;

// ============================================================================
// 明細の構造
// ============================================================================

/**
 * 見積項目行の行タイプ
 *
 * `api/estimates.ts` の `EstimateItemLineType` と構造互換。
 * ドメイン層を API 層から独立させるためここで定義する。
 */
export type EstimateLineType = 'ESTIMATE' | 'EXECUTION' | 'VENDOR';

/**
 * 見積項目の種別
 *
 * - STANDARD: 通常の見積項目
 * - DISCOUNT: 値引き行（見積金額行のみ・負数を許容し集計に加算される / 41.8）
 * - NOTE: 注記行（金額の集計対象から除外される / 55.2）
 */
export type EstimateEditItemType = 'STANDARD' | 'DISCOUNT' | 'NOTE';

/** 編集中の見積項目行 */
export interface EditableLine {
  readonly id: string | null;
  readonly lineType: EstimateLineType;
  readonly name: string | null;
  readonly specification: string | null;
  readonly unit: string | null;
  readonly quantity: string | null;
  readonly unitPrice: string | null;
  readonly amount: string | null;
  readonly remarks: string | null;
  readonly sourceVendorName: string | null;
}

/**
 * 編集中の見積項目（ツリーノード）
 *
 * 不変条件: `id` と `tempId` はいずれか一方のみ非 null。
 * `itemType` が `DISCOUNT` / `NOTE` の項目は子を持たない。
 */
export interface EditableItem {
  readonly id: EstimateItemId | null;
  readonly tempId: TempId | null;
  readonly itemType: EstimateEditItemType;
  readonly lines: readonly EditableLine[];
  readonly children: readonly EditableItem[];
}

/** `updateLineField` で更新できる明細セル（`id` / `lineType` は対象外） */
export type EditableLineField = Exclude<keyof EditableLine, 'id' | 'lineType'>;

// ============================================================================
// 帳票用の追加入力項目（54.1〜54.3, 54.6）
// ============================================================================

/**
 * 帳票用の追加入力項目
 *
 * ワイヤ形式は design.md `SaveEstimateDraftRequest.reportFields` と同一。
 * 別途工事の5件上限は保存経路（52.3 / 53.5 / 56.8）が担当するため、
 * 遷移関数側では件数を検証しない（tasks.md Implementation Notes 52.2）。
 */
export interface EstimateReportFields {
  /** 提出日（`YYYY-MM-DD`） */
  readonly submissionDate: string | null;
  /** 有効期限（最大100文字） */
  readonly validityPeriod: string | null;
  /** 別途工事（最大5件・各最大200文字） */
  readonly separateWorks: readonly string[];
}

// ============================================================================
// 編集状態
// ============================================================================

/**
 * 操作が無効化された理由
 *
 * `CANNOT_OUTDENT_ROOT` / `NO_PRECEDING_SIBLING` は階層の上げ下げ（53.3）で用いる。
 */
export type EditError =
  | { readonly kind: 'CYCLIC_MOVE'; readonly key: NodeKey }
  | { readonly kind: 'CANNOT_OUTDENT_ROOT' }
  | { readonly kind: 'NO_PRECEDING_SIBLING'; readonly key: NodeKey }
  | {
      readonly kind: 'INVALID_PARENT_TYPE';
      readonly key: NodeKey;
      readonly itemType: 'DISCOUNT' | 'NOTE';
    };

/**
 * 見積明細の編集状態
 *
 * 保存対象のみを保持し、表示状態（モード・選択・展開・カーソル）は保持しない。
 *
 * `reportFields` は design.md の State Management ブロックには現れないが、
 * 同ブロックが `updateReportFields` アクションを定義しており、かつ
 * 54.8「帳票用入力項目の変更を未保存の変更として扱い保存操作で確定する」および
 * tasks.md 53.4「帳票用入力項目の編集も同じ状態に含める」が保持先を要求するため、
 * 本モジュールで State に加えている（設計の欠落を補う追加）。
 */
export interface EstimateEditState {
  readonly items: readonly EditableItem[];
  readonly reportFields: EstimateReportFields;
  readonly isDirty: boolean;
  readonly lastError: EditError | null;
}

// ============================================================================
// アクション
// ============================================================================

/**
 * 編集状態の遷移アクション
 *
 * design.md の `EstimateEditAction` のうち、行の挿入・削除・複写・並び替え・
 * セル値の更新・帳票用入力項目の更新（53.2）に対応する集合を定義する。
 * 階層の上げ下げ（`indentRange` / `outdentRange`）は 53.3、
 * 転記・案分・利益率・諸経費（`apply*` / `addOverheadItem`）は段階3で追加する。
 */
export type EstimateEditAction =
  /**
   * 明細（と任意で帳票用入力項目）を差し替える
   *
   * 読み込み・保存応答の反映に用い、未保存状態を解消する。
   * `reportFields` は design.md には無い追加で、保存応答が明細と帳票用入力項目を
   * 同時に返す（`SaveEstimateDraftRequest` と対の応答）ため、
   * 1アクションで未保存状態を解消できるようにしている。
   */
  | {
      type: 'setItems';
      items: readonly EditableItem[];
      reportFields?: EstimateReportFields;
    }
  /** 通常項目（3行1セット）を挿入する（12.1） */
  | { type: 'insertRow'; afterKey: NodeKey | null; parentKey: NodeKey | null }
  /** 注記行（見積金額行1行）を挿入する（55.1, 55.3） */
  | { type: 'insertNoteRow'; afterKey: NodeKey | null; parentKey: NodeKey | null }
  /** 値引き行をルートレベルの末尾へ追加する（41.2, 41.3） */
  | { type: 'insertDiscountRow' }
  /** 指定した項目とその子孫を削除する（12.3, 12.4, 43.6） */
  | { type: 'deleteRows'; keys: readonly NodeKey[] }
  /** 指定した項目を部分木ごと複写する（12.5, 44.3） */
  | { type: 'duplicateRows'; keys: readonly NodeKey[] }
  /** 同一階層内で1つ上/下へ移動する */
  | { type: 'moveRow'; key: NodeKey; direction: 'up' | 'down' }
  /** ドラッグ&ドロップによる並び替え・親の変更（12.2, 12.6） */
  | {
      type: 'reorderByDnd';
      sourceKey: NodeKey;
      targetKey: NodeKey;
      position: 'before' | 'after';
    }
  /** 明細セルの値を更新する（22.9 の金額自動計算を含む） */
  | {
      type: 'updateLineField';
      key: NodeKey;
      lineType: EstimateLineType;
      field: EditableLineField;
      value: string | null;
    }
  /** 帳票用入力項目を更新する（54.6, 54.8） */
  | { type: 'updateReportFields'; fields: EstimateReportFields };
