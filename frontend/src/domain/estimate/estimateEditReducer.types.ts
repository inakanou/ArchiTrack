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
// 転記・計算結果の適用ペイロード（49.1〜49.4, 49.8）
// ============================================================================

/**
 * 受領見積書から転記する1明細行（4.3）
 *
 * 転記対象は名称・規格・単位・数量・単価のみ（4.3）。備考は対象に含まれず、
 * 金額も転記せず 数量 × 単価 として導出する（22.9）。
 */
export interface QuotationTransferLine {
  readonly name: string | null;
  readonly specification: string | null;
  readonly unit: string | null;
  /** 数量（10進数文字列） */
  readonly quantity: string | null;
  /** 単価（10進数文字列） */
  readonly unitPrice: string | null;
}

/**
 * 受領見積書転記の適用内容（4.1, 4.2, 4.4, 4.6, 30.1, 30.3）
 *
 * 転記する明細行はそれぞれが新しい見積項目になり、その業者金額行へ反映される
 * （4.4「それぞれ別の見積項目行の業者金額行として反映する」）。`parentKey` は
 * その項目を作る**親**を指す。転記ダイアログの選択肢は「新規項目として作成」
 * （`null`）と「＜既存項目名＞の子項目として作成」（当該項目のキー）の2種で、
 * 既存の業者金額行を上書きする選択肢は存在しない（30.1, 30.2, 30.3）。
 */
export interface QuotationTransferPayload {
  /** 転記項目を作る親の見積項目。`null` はルートレベルへ追加する（4.2, 30.1） */
  readonly parentKey: NodeKey | null;
  /** 転記元の業者名。業者金額行の `sourceVendorName` に記録する */
  readonly vendorName: string | null;
  /** 転記する明細行（受領見積書の並び順で渡す） */
  readonly lines: readonly QuotationTransferLine[];
}

/**
 * NET金額案分の適用内容（5.2, 5.3, 5.4, 5.5）
 *
 * 対象・除外はいずれも**見積項目のキー**で指定する。未保存の新規項目も
 * 一時識別子で指定できる（5.9, 49.7）。
 */
export interface NetAllocationPayload {
  /** 案分対象の見積項目キー（業者金額行の値を用いる） */
  readonly targetKeys: readonly NodeKey[];
  /** 案分から除外する見積項目キー（5.2） */
  readonly excludeKeys?: readonly NodeKey[];
  /** 案分するNET金額（10進数文字列） */
  readonly netAmount: string;
}

/**
 * 利益率適用の上書きオプション（6.2〜6.4）
 *
 * `estimateCalculations` の `OverwriteOption` の実体。計算関数と遷移アクションの
 * 双方が同じ列挙を用いるため、依存の最下層である本モジュールで定義する。
 */
export type OverwriteOption = 'all' | 'empty_only' | 'unit_price_only';

/**
 * 利益率適用の適用内容（6.1〜6.4, 6.7）
 */
export interface ProfitRatePayload {
  /**
   * 適用対象の見積項目キー
   *
   * 省略した場合は明細ツリー全体を対象とする（6.1「全実行金額行に対して」）。
   */
  readonly targetKeys?: readonly NodeKey[];
  /** 利益率（百分率の10進数文字列。例: `'12.27'`） */
  readonly rate: string;
  /** 上書きオプション（6.2〜6.4） */
  readonly overwriteOption: OverwriteOption;
}

/**
 * 諸経費の種別（7.1, 8.1, 9.1）
 *
 * バックエンド `OverheadCostService` の `OverheadCostType` と同一の値。
 */
export type OverheadCostType = 'COMMON_TEMPORARY' | 'SITE_MANAGEMENT' | 'GENERAL_ADMIN';

/**
 * 諸経費行追加の適用内容（7.1, 7.7, 8.1, 8.7, 9.1, 9.7）
 */
export interface OverheadItemPayload {
  readonly costType: OverheadCostType;
  /**
   * 見積金額行の単価（10進数文字列）
   *
   * 自動計算の結果でも手入力でもよい（7.5, 8.5, 9.5）。省略時は未入力。
   * 計算そのものは書き込みを伴わない既存経路が担い、本遷移は結果の反映のみを行う。
   */
  readonly unitPrice?: string | null;
}

// ============================================================================
// アクション
// ============================================================================

/**
 * 編集状態の遷移アクション
 *
 * design.md の `EstimateEditAction` のうち、行の挿入・削除・複写・並び替え・
 * セル値の更新・帳票用入力項目の更新（53.2）と、階層の上げ下げ（53.3）、
 * および転記・案分・利益率・諸経費の適用（55.2）に対応する集合を定義する。
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
  /**
   * 選択範囲の階層を1段下げる（12.6, 23.10, 44.3, 44.4）
   *
   * `keys` は表示順（先行順）で受け取り、`keys[0]` を「選択範囲の先頭行」とする（44.4）。
   * 2行以上の選択では先頭行を親へ昇格させ、残りをその子として配置する。
   * 1行のみの選択では直前の兄弟の子とする（23.10）。
   */
  | { type: 'indentRange'; keys: readonly NodeKey[] }
  /**
   * 選択範囲の階層を1段上げる（12.6, 23.9, 44.3, 44.5, 44.6）
   *
   * 各選択行を自身の親項目の直後（＝親の兄弟レベル）へ移動する。
   */
  | { type: 'outdentRange'; keys: readonly NodeKey[] }
  /** 明細セルの値を更新する（22.9 の金額自動計算を含む） */
  | {
      type: 'updateLineField';
      key: NodeKey;
      lineType: EstimateLineType;
      field: EditableLineField;
      value: string | null;
    }
  /** 帳票用入力項目を更新する（54.6, 54.8） */
  | { type: 'updateReportFields'; fields: EstimateReportFields }
  /** 受領見積書の転記結果を業者金額行へ反映する（4.1, 4.2, 4.6, 49.1） */
  | { type: 'applyQuotationTransfer'; payload: QuotationTransferPayload }
  /** NET金額の案分結果を実行金額行へ反映する（5.3, 5.4, 5.5, 49.1） */
  | { type: 'applyNetAllocation'; payload: NetAllocationPayload }
  /** 利益率の適用結果を見積金額行へ反映する（6.1〜6.4, 49.1） */
  | { type: 'applyProfitRate'; payload: ProfitRatePayload }
  /** 諸経費行をルートレベルの末尾へ追加する（7.1, 8.1, 9.1, 49.1） */
  | { type: 'addOverheadItem'; payload: OverheadItemPayload };
