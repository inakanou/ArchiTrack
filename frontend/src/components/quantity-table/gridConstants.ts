/**
 * @fileoverview 数量項目グリッドレイアウトの共有定数
 *
 * Task 23.1: 数量グループのメインタイトル行コンポーネントを実装する
 *
 * EditableQuantityItemRow と QuantityGroupTitleRow で共通のグリッドレイアウトを使用するための
 * 定数をここで定義する（設計レビュー推奨：gridTemplateColumns の一元管理）。
 *
 * フィールド幅:
 * - 大項目(76px)・中項目(76px)・小項目(76px)・任意分類(76px)・工種(88px)
 * - 名称(202px)・規格(202px)・計算方法(90px)・数量(80px)・単位(46px)・備考(76px)・操作(80px)
 */

/**
 * 数量項目行のグリッドテンプレートカラム定義
 *
 * EditableQuantityItemRow と QuantityGroupTitleRow で共有。
 * カラム位置を一致させるための単一の真実の源。
 */
export const QUANTITY_ITEM_GRID_COLUMNS =
  '76px 76px 76px 76px 88px 202px 202px 90px 80px 46px 76px 80px';
