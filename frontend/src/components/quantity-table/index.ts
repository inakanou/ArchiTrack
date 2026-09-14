/**
 * @fileoverview 数量表コンポーネントのエクスポート
 *
 * Task 5: 数量表編集画面の実装
 * Task 6: 計算機能UIの実装
 * Task 7: 入力支援機能の実装
 */

// Task 5: 基本コンポーネント
export { default as QuantityGroupCard } from './QuantityGroupCard';
export { default as QuantityItemRow } from './QuantityItemRow';
export { default as ItemCopyMoveDialog } from './ItemCopyMoveDialog';
export type { QuantityGroupCardProps } from './QuantityGroupCard';
export type { QuantityItemRowProps } from './QuantityItemRow';
export type { ItemCopyMoveDialogProps, ItemCopyMoveMode } from './ItemCopyMoveDialog';

// Task 6: 計算機能UIコンポーネント
export { default as CalculationMethodSelect } from './CalculationMethodSelect';
export { default as CalculationFields } from './CalculationFields';
export type { CalculationMethodSelectProps } from './CalculationMethodSelect';
export type { CalculationFieldsProps } from './CalculationFields';

// Task 7: 入力支援機能コンポーネント
export { default as AutocompleteInput } from './AutocompleteInput';
export { default as EditableQuantityItemRow } from './EditableQuantityItemRow';
export type { AutocompleteInputProps } from './AutocompleteInput';
export type { EditableQuantityItemRowProps } from './EditableQuantityItemRow';

// Task 21: 数量表コピー機能
export { default as CopyQuantityTableDialog } from './CopyQuantityTableDialog';
export type { CopyQuantityTableDialogProps } from './CopyQuantityTableDialog';

// Task 23: タイトル行表示最適化
export { default as QuantityGroupTitleRow } from './QuantityGroupTitleRow';
export type { QuantityGroupTitleRowProps } from './QuantityGroupTitleRow';
export { QUANTITY_ITEM_GRID_COLUMNS } from './gridConstants';

// Task 12: フィールドバリデーション
export { default as TextFieldInput } from './TextFieldInput';
export { default as NumericFieldInput } from './NumericFieldInput';
export type { TextFieldInputProps } from './TextFieldInput';
export type {
  NumericFieldInputProps,
  NumericFieldInputMeta,
  NumericFieldType,
} from './NumericFieldInput';
