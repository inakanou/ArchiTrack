/**
 * @fileoverview 数量表編集画面 型定義ファイル
 *
 * Task 5.1: 数量表編集画面のレイアウト用の型定義
 *
 * Requirements:
 * - 3.1: 数量表編集画面を表示する
 * - 3.2: 数量グループ一覧と各グループ内の数量項目を階層的に表示する
 * - 3.3: 該当写真の注釈付きサムネイルを関連写真表示エリアに表示する
 * - 4.1: 数量表編集画面で数量グループ追加操作を行う
 * - 4.2: 同一プロジェクトの注釈付き現場調査写真選択機能を提供する
 * - 5.1: 数量グループ内で行追加操作を行う
 */

// ============================================================================
// 計算方法関連
// ============================================================================

/**
 * 計算方法
 */
export type CalculationMethod = 'STANDARD' | 'AREA_VOLUME' | 'PITCH';

/**
 * 計算パラメータ（面積・体積モード）
 */
export interface AreaVolumeParams {
  width?: number;
  depth?: number;
  height?: number;
  weight?: number;
}

/**
 * 計算パラメータ（ピッチモード）
 */
export interface PitchParams {
  rangeLength?: number;
  endLength1?: number;
  endLength2?: number;
  pitchLength?: number;
  length?: number;
  weight?: number;
}

/**
 * 計算パラメータ統合型
 */
export type CalculationParams = AreaVolumeParams | PitchParams | null;

// ============================================================================
// 数量項目関連
// ============================================================================

/**
 * 数量項目（編集用）
 *
 * Requirements: 5.1, 5.2
 */
export interface QuantityItemEdit {
  /** 項目ID */
  id: string;
  /** 所属グループID */
  quantityGroupId: string;
  /** 大項目（必須） */
  majorCategory: string;
  /** 中項目 */
  middleCategory: string | null;
  /** 小項目 */
  minorCategory: string | null;
  /** 任意分類 */
  customCategory: string | null;
  /** 工種（必須） */
  workType: string;
  /** 名称（必須） */
  name: string;
  /** 規格 */
  specification: string | null;
  /** 単位（必須） */
  unit: string;
  /** 計算方法 */
  calculationMethod: CalculationMethod;
  /** 計算パラメータ */
  calculationParams: CalculationParams;
  /** 調整係数（デフォルト: 1.00） */
  adjustmentFactor: number;
  /** 丸め設定（デフォルト: 0.01） */
  roundingUnit: number;
  /** 数量（必須） */
  quantity: number;
  /** 備考 */
  remarks: string | null;
  /** 表示順序 */
  displayOrder: number;
  /** 作成日時 */
  createdAt: string;
  /** 更新日時 */
  updatedAt: string;
  /** バリデーションエラー */
  validationErrors?: Record<string, string>;
}

// ============================================================================
// 現場調査画像関連
// ============================================================================

/**
 * 現場調査画像情報（簡易）
 *
 * Requirements: 3.3, 4.2
 */
export interface SurveyImageSummary {
  /** 画像ID */
  id: string;
  /** サムネイルURL */
  thumbnailUrl: string;
  /** 元画像URL */
  originalUrl: string;
  /** ファイル名 */
  fileName: string;
  /** 注釈の有無 */
  hasAnnotations: boolean;
}

// ============================================================================
// 数量グループ関連
// ============================================================================

/**
 * 数量グループ（編集用）
 *
 * Requirements: 3.2, 4.1
 */
export interface QuantityGroupEdit {
  /** グループID */
  id: string;
  /** 所属数量表ID */
  quantityTableId: string;
  /** グループ名 */
  name: string | null;
  /** 紐付け現場調査画像ID */
  surveyImageId: string | null;
  /** 紐付け現場調査画像情報 */
  surveyImage: SurveyImageSummary | null;
  /** 表示順序 */
  displayOrder: number;
  /** 数量項目一覧 */
  items: QuantityItemEdit[];
  /** 作成日時 */
  createdAt: string;
  /** 更新日時 */
  updatedAt: string;
  /** 展開状態 */
  isExpanded: boolean;
}

// ============================================================================
// 数量表詳細関連
// ============================================================================

/**
 * プロジェクト情報（簡易）
 */
export interface ProjectSummary {
  /** プロジェクトID */
  id: string;
  /** プロジェクト名 */
  name: string;
}

/**
 * 数量表詳細（編集用）
 *
 * Requirements: 3.1
 */
export interface QuantityTableEdit {
  /** 数量表ID */
  id: string;
  /** プロジェクトID */
  projectId: string;
  /** プロジェクト情報 */
  project: ProjectSummary;
  /** 数量表名 */
  name: string;
  /** グループ数 */
  groupCount: number;
  /** 項目数 */
  itemCount: number;
  /** 数量グループ一覧 */
  groups: QuantityGroupEdit[];
  /** 作成日時 */
  createdAt: string;
  /** 更新日時 */
  updatedAt: string;
}

// ============================================================================
// 編集画面の状態管理
// ============================================================================

/**
 * 保存ステータス
 *
 * Requirements: 11.5
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * 数量表編集画面の状態
 *
 * Requirements: 3.1
 */
export interface QuantityTableEditState {
  /** 数量表データ */
  quantityTable: QuantityTableEdit | null;
  /** ローディング中 */
  isLoading: boolean;
  /** 保存中 */
  isSaving: boolean;
  /** 保存ステータス */
  saveStatus: SaveStatus;
  /** 最終保存日時 */
  lastSavedAt: string | null;
  /** 未保存の変更あり */
  hasUnsavedChanges: boolean;
  /** バリデーションエラー */
  validationErrors: ValidationError[];
  /** 選択中の項目ID */
  selectedItemIds: string[];
  /** 展開中のグループID */
  expandedGroupIds: string[];
}

/**
 * バリデーションエラー
 */
export interface ValidationError {
  /** エラー対象のフィールドパス（例: groups[0].items[1].majorCategory） */
  path: string;
  /** エラーメッセージ */
  message: string;
}

// ============================================================================
// 編集画面のアクション
// ============================================================================

/**
 * 数量表編集画面のアクション
 */
export interface QuantityTableEditActions {
  /** 数量表の読み込み */
  loadQuantityTable: (id: string) => Promise<void>;
  /** グループ追加 */
  addGroup: () => void;
  /** グループ削除 */
  removeGroup: (groupId: string) => void;
  /** グループ名更新 */
  updateGroupName: (groupId: string, name: string) => void;
  /** グループの画像紐付け */
  linkGroupImage: (groupId: string, surveyImageId: string) => void;
  /** グループの画像紐付け解除 */
  unlinkGroupImage: (groupId: string) => void;
  /** 項目追加 */
  addItem: (groupId: string) => void;
  /** 項目更新 */
  updateItem: (itemId: string, updates: Partial<QuantityItemEdit>) => void;
  /** 項目削除 */
  removeItem: (itemId: string) => void;
  /** 項目コピー */
  copyItems: (itemIds: string[]) => void;
  /** 項目移動 */
  moveItems: (itemIds: string[], targetGroupId: string, position: number) => void;
  /** 項目選択切り替え */
  toggleItemSelection: (itemId: string) => void;
  /** 全項目選択解除 */
  clearItemSelection: () => void;
  /** グループ展開切り替え */
  toggleGroupExpansion: (groupId: string) => void;
  /** 保存 */
  save: () => Promise<void>;
  /** 自動保存トリガー */
  triggerAutoSave: () => void;
}

// ============================================================================
// 現場調査画像選択モーダル関連
// ============================================================================

/**
 * 現場調査画像選択モーダルのProps
 */
export interface SurveyImageSelectorProps {
  /** プロジェクトID */
  projectId: string;
  /** モーダル表示状態 */
  isOpen: boolean;
  /** モーダルを閉じる */
  onClose: () => void;
  /** 画像選択時のコールバック */
  onSelect: (image: SurveyImageSummary) => void;
  /** 選択済みの画像ID（除外用） */
  excludeImageIds?: string[];
}

// ============================================================================
// ユーティリティ型
// ============================================================================

/**
 * 新規数量項目の初期値
 */
export function createDefaultQuantityItem(
  groupId: string,
  displayOrder: number
): Omit<QuantityItemEdit, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    quantityGroupId: groupId,
    majorCategory: '',
    middleCategory: null,
    minorCategory: null,
    customCategory: null,
    workType: '',
    name: '',
    specification: null,
    unit: '',
    calculationMethod: 'STANDARD',
    calculationParams: null,
    adjustmentFactor: 1.0,
    roundingUnit: 0.01,
    quantity: 0,
    remarks: null,
    displayOrder,
  };
}

/**
 * 新規数量グループの初期値
 */
export function createDefaultQuantityGroup(
  tableId: string,
  displayOrder: number
): Omit<QuantityGroupEdit, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    quantityTableId: tableId,
    name: null,
    surveyImageId: null,
    surveyImage: null,
    displayOrder,
    items: [],
    isExpanded: true,
  };
}
