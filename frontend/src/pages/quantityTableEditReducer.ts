/**
 * @fileoverview 数量表編集ドラフト reducer・型定義・仮ID採番
 *
 * Task 60.1: 数量表編集ドラフトの reducer と仮ID採番を実装する
 *
 * 編集対象データを単一の `useReducer` で「サーバースナップショット」と
 * 「編集ドラフト」に分離管理する。すべての編集アクションは `dispatch` で
 * ドラフトのみを更新し `isDirty=true` とする。永続化APIは保存操作時のみで、
 * `saveSync` は採番済み `QuantityTableDetail` でスナップショット/ドラフトを
 * 置換し `isDirty=false` とする（REQ-42）。
 *
 * 本ファイルは純粋関数のみを提供する（副作用・API呼び出しなし。
 * 画面結線・API呼び出しは Task 61.x が担当）。
 *
 * Requirements:
 * - 42.1: グループ/項目の追加・削除・コピー・並び替えはクライアント編集状態にのみ反映
 * - 42.2: グループ名・数量表名の変更はクライアント編集状態にのみ反映
 * - 42.3: 写真紐づけ・変更はクライアント編集状態にのみ反映
 * - 42.4: 現場調査一括生成・インポート取り込みはクライアント編集状態にのみ反映
 * - 42.6: 保存操作前は永続化目的のサーバーアクセスを発生させない（reducer は純粋）
 * - 42.8: 保存完了時にサーバー最新データでスナップショット/ドラフトを同期し isDirty=false
 *
 * Design: design.md L1062-1131（State Management）, L2150（File Structure Plan）
 *
 * @module pages/quantityTableEditReducer
 */

import type { ImportQuantityItem } from '../types/quantity-import.types';
import type {
  CalculationMethod,
  CalculationParams,
  QuantityGroupDetail,
  QuantityItemDetail,
  QuantityTableDetail,
} from '../types/quantity-table.types';
import { calculateStringWidth } from '../utils/field-validation';

// ============================================================================
// 命名定数
// ============================================================================

/** グループコピー時に元名へ付与するサフィックス（REQ-38.5） */
const GROUP_COPY_SUFFIX = 'のコピー';

/**
 * グループ名の最大文字幅（半角換算）。
 * バックエンド `QuantityValidationService.GROUP_NAME_MAX_WIDTH` と同値（REQ-22 AC4 / 38.6）。
 */
const GROUP_NAME_MAX_WIDTH = 50;

// ============================================================================
// 型定義（design.md L1068-1119 準拠）
// ============================================================================

/**
 * ドラフト行の識別子。
 * 新規行はサーバー採番前のため `id: null` + クライアント仮ID（tempId）で管理し、
 * 既存行はサーバー採番済みの `id` を保持する。
 */
export type DraftId = { id: string; tempId?: undefined } | { id: null; tempId: string };

/**
 * 数量項目ドラフト。
 * 編集対象フィールドは画面の入力値（文字列）として保持する。
 * サーバー詳細との相互変換は {@link itemDetailToDraft}／保存同期で行う。
 */
export interface DraftItem {
  /** サーバー採番済みID（新規は null） */
  id: string | null;
  /** 新規行のクライアント仮ID（既存行は undefined） */
  tempId?: string;
  majorCategory: string | null;
  middleCategory: string | null;
  minorCategory: string | null;
  customCategory: string | null;
  workType: string;
  name: string;
  specification: string | null;
  calculationMethod: CalculationMethod;
  /** 計算パラメータ（面積・体積／ピッチ等） */
  calculationParams: CalculationParams | null;
  /** 調整係数（文字列入力値） */
  adjustmentFactor: string;
  /** 丸め設定（文字列入力値） */
  roundingUnit: string;
  /** 数量（文字列入力値） */
  quantity: string;
  unit: string;
  remarks: string | null;
  displayOrder: number;
}

/**
 * 数量グループドラフト。
 */
export interface DraftGroup {
  /** サーバー採番済みID（新規は null） */
  id: string | null;
  /** 新規行のクライアント仮ID（既存行は undefined） */
  tempId?: string;
  name: string | null;
  /** 写真紐づけ（参照のみ、blob複製なし） */
  surveyImageId: string | null;
  displayOrder: number;
  items: DraftItem[];
}

/**
 * 数量表ドラフト（画面表示・編集対象）。
 */
export interface QuantityTableDraft {
  id: string;
  name: string;
  groups: DraftGroup[];
}

/** バリデーションエラー */
export interface ValidationError {
  path: string;
  message: string;
}

/** 保存ステータス */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** オートコンプリート対象フィールド名 */
export type AutocompleteFieldName =
  | 'majorCategory'
  | 'middleCategory'
  | 'minorCategory'
  | 'customCategory'
  | 'workType'
  | 'name'
  | 'specification'
  | 'unit'
  | 'remarks';

/**
 * 数量表編集画面の状態。
 */
export interface QuantityTableEditState {
  /** 最後にロード/保存したサーバー状態（差分計算・リセット用の基準） */
  serverSnapshot: QuantityTableDetail | null;
  /** 編集中のドラフト（画面表示・編集対象） */
  draft: QuantityTableDraft | null;
  isLoading: boolean;
  isSaving: boolean;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** 未保存変更フラグ（REQ-43 離脱ガード／REQ-44 インジケーターの起点） */
  isDirty: boolean;
  validationErrors: ValidationError[];
  selectedItems: string[];
  expandedGroups: string[];
  autocompleteCandidates: Record<AutocompleteFieldName, string[]>;
  isAutocompleteCandidatesLoading: boolean;
  isImportDialogOpen: boolean;
}

// ============================================================================
// アクション定義
// ============================================================================

/** 上下移動方向 */
export type ReorderDirection = 'up' | 'down';

/**
 * 数量表編集 reducer のアクション。
 *
 * `groupKey`／`itemKey` は対象行の識別子で、既存行は `id`、新規行は `tempId` を渡す。
 */
export type QuantityTableEditAction =
  // load: サーバー詳細でスナップショット+ドラフトを設定（isDirty=false）
  | { type: 'load'; detail: QuantityTableDetail }
  // saveSync: 採番済み詳細でスナップショット+ドラフトを置換（isDirty=false）
  | { type: 'saveSync'; detail: QuantityTableDetail }
  // グループ操作
  | { type: 'addGroup' }
  | { type: 'removeGroup'; groupKey: string }
  | { type: 'copyGroup'; groupKey: string }
  | { type: 'reorderGroup'; groupKey: string; direction: ReorderDirection }
  | { type: 'renameGroup'; groupKey: string; name: string }
  | { type: 'linkGroupImage'; groupKey: string; surveyImageId: string | null }
  // 数量表名変更
  | { type: 'renameTable'; name: string }
  // 項目操作
  | { type: 'addItem'; groupKey: string }
  | { type: 'removeItem'; groupKey: string; itemKey: string }
  | { type: 'copyItem'; groupKey: string; itemKey: string }
  | { type: 'reorderItem'; groupKey: string; itemKey: string; direction: ReorderDirection }
  | { type: 'updateItemField'; groupKey: string; itemKey: string; updates: Partial<DraftItem> }
  // 現場調査一括生成（REQ-40）
  | { type: 'generateGroupsFromSurvey'; surveyName: string; surveyImageIds: string[] }
  // インポート取り込み（REQ-31）
  | { type: 'importItems'; groupKey: string; items: ImportQuantityItem[] };

// ============================================================================
// 初期状態
// ============================================================================

/** 編集状態の初期値（未ロード） */
export const initialQuantityTableEditState: QuantityTableEditState = {
  serverSnapshot: null,
  draft: null,
  isLoading: false,
  isSaving: false,
  saveStatus: 'idle',
  saveError: null,
  isDirty: false,
  validationErrors: [],
  selectedItems: [],
  expandedGroups: [],
  autocompleteCandidates: {
    majorCategory: [],
    middleCategory: [],
    minorCategory: [],
    customCategory: [],
    workType: [],
    name: [],
    specification: [],
    unit: [],
    remarks: [],
  },
  isAutocompleteCandidatesLoading: false,
  isImportDialogOpen: false,
};

// ============================================================================
// 仮ID採番
// ============================================================================

/**
 * クライアント仮IDを採番する。
 *
 * `crypto.randomUUID()` に `temp-` 接頭辞を付与し、React key およびドラフト内参照に
 * 使用する。保存レスポンス（採番済み `QuantityTableDetail`）でドラフト/スナップショットを
 * 置換して解決するため idMap は不要（REQ-42 AC8）。
 *
 * @returns `temp-` 接頭辞付きの一意なID
 */
export function createTempId(): string {
  return `temp-${crypto.randomUUID()}`;
}

/**
 * 行の識別キー（既存は id、新規は tempId）を取得する。
 */
function rowKey(row: { id: string | null; tempId?: string }): string {
  return row.id ?? row.tempId ?? '';
}

// ============================================================================
// サーバー詳細 ↔ ドラフト 変換
// ============================================================================

/** サーバー数量項目をドラフト項目へ変換する */
function itemDetailToDraft(item: QuantityItemDetail): DraftItem {
  return {
    id: item.id,
    majorCategory: item.majorCategory ?? null,
    middleCategory: item.middleCategory,
    minorCategory: item.minorCategory,
    customCategory: item.customCategory,
    workType: item.workType,
    name: item.name,
    specification: item.specification,
    calculationMethod: item.calculationMethod,
    calculationParams: item.calculationParams,
    adjustmentFactor: String(item.adjustmentFactor),
    roundingUnit: String(item.roundingUnit),
    quantity: String(item.quantity),
    unit: item.unit,
    remarks: item.remarks,
    displayOrder: item.displayOrder,
  };
}

/** サーバー数量グループをドラフトグループへ変換する */
function groupDetailToDraft(group: QuantityGroupDetail): DraftGroup {
  return {
    id: group.id,
    name: group.name,
    surveyImageId: group.surveyImageId,
    displayOrder: group.displayOrder,
    items: group.items.map(itemDetailToDraft),
  };
}

/** サーバー数量表詳細をドラフトへ変換する */
function detailToDraft(detail: QuantityTableDetail): QuantityTableDraft {
  return {
    id: detail.id,
    name: detail.name,
    groups: detail.groups.map(groupDetailToDraft),
  };
}

// ============================================================================
// ドラフト操作ヘルパー（不変更新）
// ============================================================================

/** 既定の計算パラメータ・係数で空の新規項目を生成する */
function createEmptyDraftItem(displayOrder: number): DraftItem {
  return {
    id: null,
    tempId: createTempId(),
    majorCategory: '',
    middleCategory: null,
    minorCategory: null,
    customCategory: null,
    workType: '',
    name: '',
    specification: null,
    calculationMethod: 'STANDARD',
    calculationParams: null,
    adjustmentFactor: '1.00',
    roundingUnit: '0.01',
    quantity: '0',
    unit: '',
    remarks: null,
    displayOrder,
  };
}

/** 空の新規グループを生成する */
function createEmptyDraftGroup(displayOrder: number): DraftGroup {
  return {
    id: null,
    tempId: createTempId(),
    name: null,
    surveyImageId: null,
    displayOrder,
    items: [],
  };
}

/** 項目を全フィールド保持で複製する（新規 tempId・id=null） */
function duplicateDraftItem(source: DraftItem, displayOrder: number): DraftItem {
  return {
    ...source,
    id: null,
    tempId: createTempId(),
    displayOrder,
  };
}

/** インポート項目をドラフト項目へ変換する（新規 tempId・id=null） */
function importItemToDraft(item: ImportQuantityItem, displayOrder: number): DraftItem {
  return {
    id: null,
    tempId: createTempId(),
    majorCategory: item.majorCategory || null,
    middleCategory: item.middleCategory || null,
    minorCategory: item.minorCategory || null,
    customCategory: item.customCategory || null,
    workType: item.workType,
    name: item.name,
    specification: item.specification || null,
    calculationMethod: item.calculationMethod,
    calculationParams: null,
    adjustmentFactor: String(item.adjustmentFactor),
    roundingUnit: String(item.roundingUnit),
    quantity: String(item.quantity),
    unit: item.unit,
    remarks: item.remarks || null,
    displayOrder,
  };
}

/** グループ配列の displayOrder を 0 始まり連番へ再採番する（不変） */
function renumberGroups(groups: DraftGroup[]): DraftGroup[] {
  return groups.map((group, index) => ({ ...group, displayOrder: index }));
}

/** 項目配列の displayOrder を 0 始まり連番へ再採番する（不変） */
function renumberItems(items: DraftItem[]): DraftItem[] {
  return items.map((item, index) => ({ ...item, displayOrder: index }));
}

/**
 * 配列の2要素を入れ替えた新しい配列を返す（不変）。
 * 呼び出し側で両インデックスが範囲内であることを保証する。
 */
function swap<T>(list: T[], a: number, b: number): T[] {
  const next = [...list];
  const tmp = next[a] as T;
  next[a] = next[b] as T;
  next[b] = tmp;
  return next;
}

/**
 * 元名 + サフィックスが maxWidth を超える場合に元名側を切り詰め、
 * サフィックスを末尾へ必ず付与する（REQ-38.5/38.6, バックエンド truncateNameWithSuffix と同仕様）。
 */
function truncateNameWithSuffix(originalName: string, suffix: string, maxWidth: number): string {
  if (maxWidth <= 0) {
    return '';
  }
  const suffixWidth = calculateStringWidth(suffix);
  // サフィックスだけで上限超過なら、サフィックスをそのまま返す（末尾付与は必須）
  if (suffixWidth >= maxWidth) {
    return suffix;
  }
  if (calculateStringWidth(originalName) + suffixWidth <= maxWidth) {
    return originalName + suffix;
  }
  // 元名を許容幅まで先頭から貪欲に消費して切り詰める
  const allowedNameWidth = maxWidth - suffixWidth;
  let truncatedName = '';
  let accumulated = 0;
  for (const char of originalName) {
    const charWidth = calculateStringWidth(char);
    if (accumulated + charWidth > allowedNameWidth) {
      break;
    }
    truncatedName += char;
    accumulated += charWidth;
  }
  return truncatedName + suffix;
}

/** グループコピー時の複製名を生成する（REQ-38.5/38.6） */
function buildGroupCopyName(sourceName: string | null): string {
  return truncateNameWithSuffix(sourceName ?? '', GROUP_COPY_SUFFIX, GROUP_NAME_MAX_WIDTH);
}

/** 現場調査一括生成時のグループ名を生成する（REQ-40.5/40.6） */
function buildGroupNameFromSurvey(surveyName: string, sequence: number): string {
  return truncateNameWithSuffix(surveyName, ` ${sequence}`, GROUP_NAME_MAX_WIDTH);
}

/**
 * 指定グループに対する不変更新を適用するヘルパー。
 * 対象グループが見つからなければドラフトを変更せず null を返す。
 */
function updateGroup(
  draft: QuantityTableDraft,
  groupKey: string,
  updater: (group: DraftGroup) => DraftGroup
): QuantityTableDraft | null {
  const index = draft.groups.findIndex((g) => rowKey(g) === groupKey);
  const current = draft.groups[index];
  if (index === -1 || current === undefined) {
    return null;
  }
  const nextGroups = [...draft.groups];
  nextGroups[index] = updater(current);
  return { ...draft, groups: nextGroups };
}

/**
 * dirty 状態でドラフトを差し替えた新しい state を返す。
 */
function withDraft(
  state: QuantityTableEditState,
  draft: QuantityTableDraft
): QuantityTableEditState {
  return { ...state, draft, isDirty: true };
}

// ============================================================================
// reducer
// ============================================================================

/**
 * 数量表編集ドラフト reducer。
 *
 * `load`／`saveSync` を除く全アクションはドラフトのみを更新し `isDirty=true` とする。
 * 純粋関数として実装し、入力 state は変更しない（不変更新）。
 *
 * @param state - 現在の編集状態
 * @param action - 適用するアクション
 * @returns 新しい編集状態
 */
export function quantityTableEditReducer(
  state: QuantityTableEditState,
  action: QuantityTableEditAction
): QuantityTableEditState {
  switch (action.type) {
    case 'load':
      return {
        ...state,
        serverSnapshot: action.detail,
        draft: detailToDraft(action.detail),
        isLoading: false,
        isDirty: false,
      };

    case 'saveSync':
      return {
        ...state,
        serverSnapshot: action.detail,
        draft: detailToDraft(action.detail),
        isSaving: false,
        saveStatus: 'saved',
        saveError: null,
        isDirty: false,
      };

    default:
      break;
  }

  // 以降の編集アクションはドラフト必須。未ロードなら状態を変更しない（純粋ガード）。
  const draft = state.draft;
  if (draft === null) {
    return state;
  }

  switch (action.type) {
    case 'addGroup': {
      const nextGroups = [...draft.groups, createEmptyDraftGroup(draft.groups.length)];
      return withDraft(state, { ...draft, groups: nextGroups });
    }

    case 'removeGroup': {
      const filtered = draft.groups.filter((g) => rowKey(g) !== action.groupKey);
      if (filtered.length === draft.groups.length) {
        return state; // 対象なし
      }
      return withDraft(state, { ...draft, groups: renumberGroups(filtered) });
    }

    case 'copyGroup': {
      const index = draft.groups.findIndex((g) => rowKey(g) === action.groupKey);
      const source = draft.groups[index];
      if (index === -1 || source === undefined) {
        return state;
      }
      const copy: DraftGroup = {
        id: null,
        tempId: createTempId(),
        name: buildGroupCopyName(source.name),
        surveyImageId: source.surveyImageId,
        displayOrder: source.displayOrder,
        // 配下項目を全フィールド保持で複製（順序維持・新規 tempId）
        items: source.items.map((item, i) => duplicateDraftItem(item, i)),
      };
      // 元の直下へ挿入し、全体を連番へ再採番（後続シフトを含む）
      const nextGroups = [...draft.groups];
      nextGroups.splice(index + 1, 0, copy);
      return withDraft(state, { ...draft, groups: renumberGroups(nextGroups) });
    }

    case 'reorderGroup': {
      const index = draft.groups.findIndex((g) => rowKey(g) === action.groupKey);
      if (index === -1) {
        return state;
      }
      const target = action.direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= draft.groups.length) {
        return state; // 端なら移動不可
      }
      const nextGroups = swap(draft.groups, index, target);
      return withDraft(state, { ...draft, groups: renumberGroups(nextGroups) });
    }

    case 'renameGroup': {
      const next = updateGroup(draft, action.groupKey, (g) => ({ ...g, name: action.name }));
      return next === null ? state : withDraft(state, next);
    }

    case 'linkGroupImage': {
      const next = updateGroup(draft, action.groupKey, (g) => ({
        ...g,
        surveyImageId: action.surveyImageId,
      }));
      return next === null ? state : withDraft(state, next);
    }

    case 'renameTable':
      return withDraft(state, { ...draft, name: action.name });

    case 'addItem': {
      const next = updateGroup(draft, action.groupKey, (g) => ({
        ...g,
        items: [...g.items, createEmptyDraftItem(g.items.length)],
      }));
      return next === null ? state : withDraft(state, next);
    }

    case 'removeItem': {
      let removed = false;
      const next = updateGroup(draft, action.groupKey, (g) => {
        const filtered = g.items.filter((i) => rowKey(i) !== action.itemKey);
        removed = filtered.length !== g.items.length;
        return { ...g, items: renumberItems(filtered) };
      });
      return next === null || !removed ? state : withDraft(state, next);
    }

    case 'copyItem': {
      let copied = false;
      const next = updateGroup(draft, action.groupKey, (g) => {
        const i = g.items.findIndex((it) => rowKey(it) === action.itemKey);
        const source = g.items[i];
        if (i === -1 || source === undefined) {
          return g;
        }
        copied = true;
        const copy = duplicateDraftItem(source, source.displayOrder);
        const nextItems = [...g.items];
        nextItems.splice(i + 1, 0, copy);
        return { ...g, items: renumberItems(nextItems) };
      });
      return next === null || !copied ? state : withDraft(state, next);
    }

    case 'reorderItem': {
      let moved = false;
      const next = updateGroup(draft, action.groupKey, (g) => {
        const i = g.items.findIndex((it) => rowKey(it) === action.itemKey);
        if (i === -1) {
          return g;
        }
        const target = action.direction === 'up' ? i - 1 : i + 1;
        if (target < 0 || target >= g.items.length) {
          return g;
        }
        moved = true;
        return { ...g, items: renumberItems(swap(g.items, i, target)) };
      });
      return next === null || !moved ? state : withDraft(state, next);
    }

    case 'updateItemField': {
      let updated = false;
      const next = updateGroup(draft, action.groupKey, (g) => {
        const i = g.items.findIndex((it) => rowKey(it) === action.itemKey);
        const current = g.items[i];
        if (i === -1 || current === undefined) {
          return g;
        }
        updated = true;
        const nextItems = [...g.items];
        // 識別子（id/tempId）は updates から保護する
        const { id: _id, tempId: _tempId, ...safe } = action.updates;
        void _id;
        void _tempId;
        nextItems[i] = { ...current, ...safe };
        return { ...g, items: nextItems };
      });
      return next === null || !updated ? state : withDraft(state, next);
    }

    case 'generateGroupsFromSurvey': {
      if (action.surveyImageIds.length === 0) {
        return state; // 写真0枚は何もしない（isDirty 不変）
      }
      const base = draft.groups.length;
      const generated: DraftGroup[] = action.surveyImageIds.map((surveyImageId, i) => ({
        id: null,
        tempId: createTempId(),
        name: buildGroupNameFromSurvey(action.surveyName, i + 1),
        surveyImageId,
        displayOrder: base + i,
        items: [],
      }));
      return withDraft(state, { ...draft, groups: [...draft.groups, ...generated] });
    }

    case 'importItems': {
      if (action.items.length === 0) {
        return state; // 取り込み0件は何もしない
      }
      const next = updateGroup(draft, action.groupKey, (g) => {
        const base = g.items.length;
        const imported = action.items.map((item, i) => importItemToDraft(item, base + i));
        return { ...g, items: [...g.items, ...imported] };
      });
      return next === null ? state : withDraft(state, next);
    }

    default:
      return state;
  }
}
