# Brief: quantity-table-generation（追加スコープ）

Discovery 実施日: 2026-07-14
判定パス: **Path A**（既存スペック `quantity-table-generation` が全項目をカバー。新規スペック不要）

対象は既存スペック（REQ-1〜45、タスク257件すべて完了済み）への追加要件3件。

---

## Problem

積算担当者が数量表画面で以下3点に困っている。

1. **数量項目のアクションボタンを押してもメニューが出ない**（REQ-36 の機能が実質使えない回帰）
2. **メニューがインライン領域からはみ出た部分は表示されない**（1と同一の根本原因）
3. **計算方法「ピッチ」では箇所数が自動計算されるが、箇所数を直接手入力したいケースに対応できない**

## Current State

### 不具合1・2（アクションメニュー）— 根本原因を特定済み

- `frontend/src/components/quantity-table/QuantityItemActionMenu.tsx:65-76` のドロップダウンは
  `position: absolute; top: 100%; zIndex: 10`。包含ブロックは同ファイル `:48-50` の `wrapper { position: relative }`。
- 祖先の `frontend/src/components/quantity-table/QuantityGroupCard.tsx:271-281` `itemTableWrapper` が
  `overflowX: 'auto'` / `overflowY: 'hidden'`（REQ-41 の水平スクロール実装）でスクロールコンテナ化しており、
  行の下に開くドロップダウンが**縦方向にクリップされる**。`card`(`:108-114`) の `overflowY:'hidden'` も外側で二重にクリップ。
- state 自体は正常に `true` になる（`EditableQuantityItemRow.tsx:217, 405-407`）。
  **「開いているが見えない」状態**であり、ユーザーには「押しても出ない」「はみ出た部分が切れる」の2症状として観測される。
- **これは既知の同一事象**。オートコンプリート候補が同じ `itemTableWrapper` にクリップされる回帰は
  PR #647（`e6d7edd`）で Portal 化により解決済み（`AutocompleteInput.tsx:115-130` のコメントに REQ-41 回帰として明記）。
  アクションメニューだけ同じ修正が適用されていない。
- 副次リスク: `QuantityTableEditPage.tsx:70-73` の sticky ヘッダーが `zIndex: 50`（ドロップダウンの 10 より上位）。
- 副次リスク: `QuantityItemActionMenu.tsx:178-182` と `EditableQuantityItemRow.tsx:419-423` が
  **二重に `onBlur` → `onClose`** を張っており、閉じ処理の競合温床。
- jsdom は overflow クリップを再現しないため既存ユニットテストをすり抜けている
  （`QuantityItemActionMenu.test.tsx` / `EditableQuantityItemRow.actionMenu.test.tsx`）。
  **実ブラウザでの E2E 検証が完了条件に必須。**

### 機能追加3（計算方法「箇所数」）— 現状の実装構造

現在の計算方法は3種のみ: `STANDARD` / `AREA_VOLUME` / `PITCH`。

ピッチの箇所数算出（`backend/src/services/calculation-engine.ts:129-159`、
フロント `frontend/src/utils/calculation-engine.ts:140-175` に同一ロジック）:

```
effectiveRange = rangeLength - endLength1 - endLength2
count = effectiveRange <= 0 ? 1 : floor(effectiveRange / pitchLength) + 1
result = count * length? * weight?
→ adjustedValue = result * adjustmentFactor
→ finalValue = applyRounding(adjustedValue, roundingUnit)   // 切り上げ
```

「箇所数」方式は、この `count` を**手入力値に置き換える**だけで以降は同一。

構造上の注意点:
- 計算パラメータは DB の個別カラムではなく `quantity_items.calculationParams`（JSON）に格納。
  `adjustmentFactor` / `roundingUnit` のみ独立カラム（`backend/prisma/schema.prisma:685-689`）。
- **実際に数量を確定しているのはフロントエンドのみ**。backend の `CalculationEngine` クラスは
  プロダクションコードから import されておらず（参照はユニットテストのみ）、API は送られた `quantity` をそのまま永続化する。
- 計算方法のユニオン型が frontend 3箇所・backend 4箇所に**独立してベタ書き**されており、追加漏れリスクが高い。
- `CalculationFields.tsx:440` が `method === 'AREA_VOLUME' ? AREA_VOLUME_FIELDS : PITCH_FIELDS` の**三項演算子**のため、
  新方式を追加すると**黙って PITCH のフィールドにフォールバックする**。switch/マップ化が必須。
- `frontend/src/hooks/useMemoizedCalculation.ts:105-120` の PITCH 分岐が `calculation-engine.ts` と**別ロジック**
  （端長・floor・+1・length・weight を無視）。既存の隠れ不整合であり、設計時に扱いを決める必要がある。

## Desired Outcome

1. 数量項目のアクションボタンをクリックすると、メニューが**全項目見える状態で**表示される。
   グループ最終行・項目1件のみのグループ・水平スクロール中でもクリップされない。
2. 計算方法に「箇所数」を選択でき、追加フィールド
   「箇所数」「長さ」「重量」「調整係数」「丸め設定」が行内に水平表示される。
   数量 = 丸め(箇所数 × 長さ × 重量 × 調整係数)。

## Approach

- **不具合1・2**: `AutocompleteInput.tsx` の Portal パターンを踏襲する。
  `createPortal(document.body)` + `position: fixed` + `getBoundingClientRect()` による座標算出 +
  `window.addEventListener('scroll', handler, true)`（capture: true で祖先の水平スクロールに追従）+ `resize` 追従。
  `zIndex` は sticky ヘッダー（50）を上回る 1000 相当。あわせて二重 `onBlur` を整理する。
- **機能追加3**: `PITCH` の実装を横展開し、`count` を入力値として受け取る新方式を追加する。
  計算エンジン・zod・Prisma enum・フィールド定義・UI 分岐を上記の網羅リストに沿って追加。

## Scope

- **In**:
  - アクションメニューの Portal 化（表示不能・クリップの解消）
  - 計算方法「箇所数」の追加（enum・DBマイグレーション・zod・計算エンジン・バリデーション・UI・PDF出力）
  - 実ブラウザでの E2E 検証（jsdom では検出不能なため必須）
- **Out**:
  - `useMemoizedCalculation.ts` と `calculation-engine.ts` のロジック不整合の全面修正
    （別途切り出す。ただし「箇所数」追加で新たな不整合を作らないことは In）
  - 計算方法ユニオン型の共有ソース化リファクタ（発見事項として記録するに留める）
  - インポート機能への「箇所数」対応（現状インポートは `STANDARD` 固定）

## Boundary Candidates

- 表示層のクリッピング解消（Portal 化）— UI 単独で閉じる
- 計算方法の追加 — DB/型/計算エンジン/UI を縦断する垂直スライス

## Out of Boundary

- 数量表以外の画面のドロップダウン（見積・受領見積書等）の Portal 化
- backend `CalculationEngine` をプロダクション経路に組み込む設計変更

## Upstream / Downstream

- **Upstream**: REQ-36（アクションボタン統合）、REQ-41（水平スクロール）、REQ-8/9/10（計算方法・調整係数・丸め設定）、REQ-37（計算用フィールドの行内水平配置）
- **Downstream**: 数量表 PDF 出力（REQ-26）、数量表インポート（REQ-27〜34）への「箇所数」波及

## Existing Spec Touchpoints

- **Extends**: `quantity-table-generation`（REQ-46 以降として追加）
- **Adjacent**: `estimate-creation`（`LineItemEditor.tsx` に同種のアクションメニュー実装あり。同じクリップ問題を抱える可能性）

## Constraints

- 既存のクライアントサイド編集＋明示保存モデル（REQ-42）を壊さないこと
- `calculationParams` は JSON カラムのため、DB スキーマ変更は enum 値追加のみで済む
- Prisma enum への値追加は `ALTER TYPE ... ADD VALUE` の新規マイグレーションが必要
