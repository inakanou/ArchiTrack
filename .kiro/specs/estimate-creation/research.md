# ギャップ分析: estimate-creation

## 対象スコープ

本分析は新規 **Requirement 41（値引きプリセット行）** に限定する。estimate-creation スペックの他要件（Req 1〜40）は実装完了済み（structure.md上「全76タスク完了」）であり、本要件は完成済みインフラへの増分追加として扱う。

値引き行の特性:
- 見積金額行（ESTIMATE）のみで構成し、実行金額行（EXECUTION）・業者金額行（VENDOR）を持たない
- プリセット値（名称：値引き、規格：空白、単位：式、数量：1）でルートレベルに追加
- 単価にマイナス値（負数）を許容、金額＝単価×数量（負数のまま表示）
- 自動計算機能なし（手入力）。合計・見積金額合計に負数として加算
- NET案分・利益率適用の対象外

---

## 1. 現状調査サマリー（既存資産）

| 領域 | 既存資産 | 値引き行への適用可否 |
|------|----------|----------------------|
| 行タイプenum | `EstimateItemLineType` = {ESTIMATE, EXECUTION, VENDOR}（schema.prisma 1112-1116） | 見積のみ行を作る基盤。種別識別の方式は要決定（下記Constraint） |
| 項目データモデル | `EstimateItemLine`（schema.prisma 1238-1260）。quantity Decimal(15,4)/unitPrice Decimal(15,2)/amount Decimal(15,2)、いずれも負数制約なし | マイナス単価・負数金額をスキーマ変更なしで格納可 |
| ユニーク制約 | `(estimateItemId, lineType)` で1項目につき各タイプ1行 | 見積1行のみの項目も制約に抵触しない |
| プリセット行（諸経費） | `OverheadCostType` enum（overhead-cost.service.ts 41-48）、`getPresetValues()`（199-223）、POST `/overhead-items`（estimates.routes.ts 1857-1920） | 値引きプリセットの実装テンプレートとして流用可 |
| 項目追加UI | `EstimateItemToolbar.tsx`（項目追加/子項目追加/複製/削除/階層移動ボタン）、`OverheadCostPanel.tsx`（諸経費プリセットUI） | 「値引き行追加」ボタンの追加先 |
| 項目生成 | `estimate-item.service.ts createItem()`。入力 `CreateItemInput { parentId?, displayOrder, lines: CreateLineInput[] }` | linesに見積1行のみ渡せばAPIレベルで1行項目を生成可能（下記Constraint） |
| 合計・集計 | FE `estimate-calculation.ts`（calculateSubtotal/calculateHierarchyAmounts）、BE `estimate-calculation.service.ts`（99-144）。Decimal加算で負数を正しく減算 | 負数金額の集計はロジック変更なしで成立 |
| NET案分/利益率 | `estimate-calculation.service.ts`。VENDOR/EXECUTION行のみ対象、ESTIMATEは保持 | 値引きは実行・業者行が無いため自動的に対象外 |
| バリデーション | FE `numeric-range-validation.ts`（quantity min=-999999.99で負数許容）、BE `estimate.schema.ts`（unitPrice `z.number()` 下限なし） | 負数は概ね許容済。値引き単価の負数許容を明示確認すべき |
| API | items CRUD、`/items/batch`（差分一括保存）、`/overhead-items`、`/calculate-net`、`/apply-profit-rate`（estimates.routes.ts） | `/overhead-items` パターンに倣う |
| E2E | `e2e/specs/estimate/`（features/toolbar/profit-rate/net-allocation/reorder-overhead 等） | 値引き行用に新規 spec 追加 |

---

## 2. 要件→資産マッピングとギャップ

| Req41 AC | 必要な技術要素 | 既存資産 | ギャップ |
|----------|----------------|----------|----------|
| AC1 ツールバーに「値引き行追加」ボタン | Toolbarボタン追加 | EstimateItemToolbar | **Missing**（ボタン・ハンドラ追加） |
| AC2 プリセット値でルート追加 | プリセット定数 + 追加API | overhead getPresetValues / createItem | **Missing**（値引きプリセット定数・追加経路） |
| AC3 見積金額行のみで構成 | 1行のみの項目生成 | createItem は lines 任意 | **Constraint**（FE/UIが3行1セット前提。1行項目の表示・編集・整合性確認が必要） |
| AC4/5 単価手入力・マイナス許容 | 負数入力許容 | unitPrice 制約なし | **Unknown**（FE入力フォーマッタ/バリデーションが負数を弾かないか要確認） |
| AC6 金額＝単価×数量、負数表示 | 計算・表示 | EstimateCalculator + 丸め規則(Req22) | **Unknown**（負数の四捨五入表示・桁区切り表示の挙動確認） |
| AC7 自動計算機能なし | UI上で自動計算を出さない | 諸経費は自動計算あり | **Missing**（値引きダイアログは単価手入力のみ） |
| AC8 合計・見積金額合計に負数加算 | 集計 | Decimal加算 | 既存で成立（変更不要見込み） |
| AC9 NET案分・利益率の対象外 | 対象選定 | 行タイプで判定 | 既存で成立（見積のみ行は自動除外）。**要回帰確認** |
| AC10 名称等を手入力変更可 | 行編集 | 既存編集UI | 既存で成立見込み |

ギャップ集計: **Missing 4 / Constraint 1 / Unknown 2**。残りは既存実装で充足見込み（要回帰確認）。

---

## 3. 実装アプローチ案

### Option A: 諸経費プリセットの仕組みを拡張（種別フィールド追加）
**概要**: 値引きを既存プリセット機構の追加種別として実装。`OverheadCostType` を一般化する／または `EstimateItem` に `presetType`（DISCOUNT等）を追加。`/overhead-items` に倣い `/discount-items` か、既存エンドポイントへ種別引数を追加。値引き行は見積1行のみ生成。

- ✅ 諸経費プリセットの実装パターンをほぼ踏襲でき学習コストが低い
- ✅ プリセット種別を明示的に識別でき、出力・サマリーで特別扱いしやすい
- ❌ スキーマ変更（マイグレーション）が発生し得る
- ❌ 「3行1セット前提」のFE/UIを1行項目に対応させる改修が残る

### Option B: 行タイプenumに DISCOUNT を追加
**概要**: `EstimateItemLineType` に `DISCOUNT` を追加し、値引きを独立行タイプとして扱う。

- ✅ 行タイプで一意に判別でき、案分/利益率/出力フィルタの分岐が明快
- ❌ 「3行1セット（ESTIMATE/EXECUTION/VENDOR）」という中核モデル前提が崩れ、影響範囲が広い（表示フィルタReq28、出力Req32/38、ユニーク制約等の広域回帰）
- ❌ 既存ロジックの広範な条件追加が必要でリスク大

### Option C: 通常項目の特殊ケースとして実装（見積1行＋識別フラグ最小）
**概要**: 値引きを「見積金額行のみを持つ通常項目」として `createItem` で生成。種別識別は最小限（プリセット名称＝値引き、または軽量フラグ）。マイナス単価を許容。集計・案分除外は既存の行タイプ判定で自然に成立。UIは値引き専用の追加ボタン＋単価入力のみ。

- ✅ スキーマ変更を最小化（フラグ要否は設計で判断）、中核モデルを壊さない
- ✅ 案分・利益率からの除外は「実行・業者行が無い」ことで自動成立
- ✅ 合計減算は Decimal 加算で成立
- ❌ 「見積のみ1行項目」をFEが正しく描画・編集・保存（batch差分）できるか検証が必要
- ❌ プリセット種別を持たない場合、出力やサマリーで値引き行を特別扱いしたい将来要求に弱い

**推奨**: **Option A と C のハイブリッド**。実装の足場は Option C（見積1行＋既存 createItem/batch を活用、中核モデル維持）を取りつつ、識別の堅牢性が必要な箇所（出力・サマリー・並び順制御）のみ Option A 流の軽量な種別識別（presetType もしくは安定した識別子）を導入する。Option B（行タイプ追加）は影響範囲が広く非推奨。

---

## 4. 工数・リスク

- **工数: M（3〜7日）** — 既存プリセット/項目追加パターンの流用が効くが、(1)「見積のみ1行項目」のFE対応、(2)種別識別の有無判断、(3)集計・案分除外・出力の回帰確認、(4)E2E追加 が必要。
- **リスク: Medium** — 中核の「3行1セット」前提に対する例外導入が主リスク。Option C基調なら影響を局所化できるが、batch保存の差分処理・表示フィルタ・出力フィルタでの値引き行の扱いに回帰漏れが生じ得る。

---

## 5. 設計フェーズへの申し送り（Research Needed）

1. **種別識別方式の決定**: `presetType` 列追加（マイグレーション要）か、軽量フラグ／規約か、識別なしか。出力（Req32/38）・サマリー（Req39）・並び順での値引き行の扱い要求と合わせて決定。
2. **「見積のみ1行項目」のFEレンダリング**: 表示行フィルタ（Req28）で実行/業者を非表示にした場合との整合、空の実行/業者行を作らない方針の確認。batch差分保存（Req34）で1行項目が正しく追加/更新/削除されるか。
3. **マイナス値の入力UX**: 単価入力フォーマッタ（Req22 フォーカスアウト整数化）が負数を保持するか。負数の桁区切り・四捨五入表示の確認。
4. **集計・案分・利益率の回帰範囲**: 値引き行の負数が合計・見積金額合計・サマリー（Req39 見積金額合計・利益額）へ与える影響と、案分/利益率対象から確実に除外されることの確認。
5. **出力（PDF/Excel）での値引き行**: 見積のみ行が Req38（空欄行を詰める）と整合して出力されるか。
6. **値引き行の複数追加・並び順**: 端数調整と出精値引きを別行で複数追加する運用を許容するか、合計直前への配置をどうするか。

---

_本分析は Requirement 41 承認前のドラフト要件に基づく。要件確定後、設計フェーズ（/kiro-spec-design）で上記 Research Needed を解消すること。_

---

## 設計フェーズ（Light Discovery）の合成結果

ディスカバリ種別: **Light（Extension）**。新規依存なし、外部サービス連携なし。実装完了済みインフラへの増分。

### Research Needed の解消

1. **種別識別方式** → `EstimateItem.itemType`（enum `STANDARD`/`DISCOUNT`、default `STANDARD`）を新設。Option A（種別フィールド）× Option C（見積1行の特殊ケース）のハイブリッドを採用。Option B（行タイプ enum に DISCOUNT 追加）は3行1セット中核モデルへの影響が広く却下。
2. **見積のみ1行項目のFEレンダリング** → `itemType==='DISCOUNT'` を描画分岐の単一スイッチとし、見積行のみ描画。バッチ保存（REQ-34）は `itemType`＋単一行を差分送信。
3. **マイナス値入力UX** → 単価は `z.number()` 下限なしで負数許容（既存）。REQ-22 のフォーカスアウト整数化は符号保持。
4. **集計・案分・利益率の回帰範囲** → 集計はDecimal加算で負数減算が成立（ロジック変更なし）。案分/利益率は構造的除外＋`DISCOUNT`防御ガード。
5. **出力での値引き行** → 新規分岐なし。REQ-38 の空欄行詰めで自然処理。
6. **複数追加・並び順** → 通常項目同様に複数追加・ドラッグ並び替え可（既存REQ-12/23で充足）。末尾追加をデフォルトとする。

### Build-vs-Adopt / 簡素化の決定
- **Adopt**: `/overhead-items` エンドポイント構造、`createItem`、集計・案分サービス、ツールバー/エディタ/行コンポーネントを拡張。
- **簡素化**: 自動計算がないため諸経費のような専用パラメータ入力ダイアログは作らず、ボタン直接追加＋インライン手入力とする。

### 主要リスクと緩和
- リスク（Medium）: 「3行1セット前提」への単一行例外導入。緩和: `itemType` を唯一の判別軸に集約し、表示フィルタ・出力・バッチ保存の回帰をUnit/Integration/E2Eで担保。
- マイグレーション: `itemType @default(STANDARD)` で既存データ後方互換。

---

# ギャップ分析（第2回）: 行操作・ネスト構造・帳票書式の再設計

対象要件: Requirement 42〜56（新設15件）および改訂19件（REQ-2 / 4〜10 / 12 / 17〜19 / 22 / 23 / 27 / 29〜34 / 38 / 39 / 41）、撤廃1件（REQ-24）。
参照資料: `brief.md`、`estimation-software-reference.md`、`pdf-format-reference.md`。

## 1. 現状調査サマリー（既存資産）

### 再利用できる資産（想定以上に揃っている）

| 資産 | 場所 | 提供機能 | 転用先 |
|---|---|---|---|
| **フル状態同期保存** | `backend/src/services/quantity-table.service.ts:945-1107` `saveDraft()` | 事前全件バリデーション（`:951`）→ `expectedUpdatedAt` 楽観ロック409（`:982-991`）→ ペイロードに無い既存の `deleteMany`（`:1000-1004`, `:1051-1057`）→ 既存 `update` ＋ `id:null` の `create` → **配列順を正とする並び順再採番**（`:1015`, `:1062`）→ 単一トランザクション（`:955`）→ 最新詳細を返却（`:1103`） | REQ-42 |
| **純粋reducer** | `frontend/src/pages/quantityTableEditReducer.ts`（アクション定義 `:179-200`、`copyItem` `:343`、`duplicateDraftItem` `:607`） | 全行操作が0リクエスト | REQ-43 |
| **明示保存の呼び出し規律** | `frontend/src/pages/QuantityTableEditPage.tsx:1367, 1424` | 保存を1回だけ呼ぶ | REQ-27, REQ-42 |
| **Undoマネージャ** | `frontend/src/services/UndoManager.ts` | コマンドパターン（`UndoCommand` `:16`、`execute` `:115`、`pushWithoutExecute` `:147`、`undo` `:176`、`redo` `:206`、`canUndo/canRedo` `:232`、`clear` `:64`）。**履歴上限はコンストラクタ引数**（`:101` 既定50） | REQ-48（`maxHistorySize=10` で AC3 を充足） |
| **Undo状態のReact連携** | `frontend/src/hooks/useUndoState.ts:76` | `canUndo`/`canRedo` の state 化、`clearOnSave` | REQ-48 AC4, AC7 |
| **Undoのキー割当** | `frontend/src/hooks/useUndoKeyboardShortcuts.ts:104` | Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z、Ctrl+Y。**`isTextInputElement`（`:45`）で入力中は発火させない** | REQ-48, **REQ-47 AC5 をそのまま満たす判定ロジック** |
| **キーボードナビゲーション基盤** | `frontend/src/hooks/useKeyboardNavigation.ts`、`frontend/src/utils/keyboard-navigation.ts` | リスト/メニュー/グリッドのフォーカス移動、`isActivationKey`/`isNavigationKey` | REQ-47 AC2（部分的） |
| **帳票の日本語描画** | `frontend/src/services/export/PdfFontService.ts:120-126` | Noto Sans JP 登録（`addFileToVFS`→`addFont`→`setFont`）。資産は `fonts/noto-sans-jp-base64.ts`（バイナリ 2,255,812 bytes の TrueType） | REQ-10 AC8 |
| **罫線付き表の描画** | `frontend/src/services/export/QuantityTablePdfExportService.ts` | 列定義（`:92`）、行高（`:82`）、`doc.rect`（`:240, :302`）・`doc.line`（`:316, :368`）、改ページ判定（`:280-281`） | REQ-52, REQ-50 AC9 |
| **表紙ページ描画** | `frontend/src/services/export/PdfReportService.ts:248, 347, 402` | ページ単位のレンダリング分割 | REQ-51 |
| **ダウンロード共通処理** | `frontend/src/services/export/PdfExportService.ts` | `downloadPdf` / `generateDefaultFilename` / `PdfExportProgress` | REQ-10 AC7, REQ-32 AC6 |
| **フロントエンドのExcel生成** | `frontend/package.json:40` `xlsx@0.20.3`（SheetJS）、`frontend/src/utils/export-excel.ts:151` `exportToExcel()` | `XLSX.utils.json_to_sheet` → `book_append_sheet` → `writeFile` | REQ-10 AC2 |
| **E2Eのリクエスト計測** | `e2e/specs/estimate/estimate-features-e2e.spec.ts` ほか（`page.route` 使用実績あり） | リクエスト回数アサーションの下地 | REQ-43 AC2 の検証 |

### 変更対象となる既存実装

| 場所 | 現状 |
|---|---|
| `frontend/src/hooks/useEstimateEditor.ts`（871行） | `useState` ＋ `pendingChanges: Map`。reducer 不使用。DnDが `recordChange` に `data` を渡さず永続化されない（`:768-769`） |
| `frontend/src/pages/EstimateDetailPage.tsx`（1265行） | 即時API＋全件再取得が5経路（`:673`, `:723`, `:789`, `:843`, `:886`）。`fetchData()`（`:627-643`）が `setItems()`（`:637`）で未保存変更を全消去 |
| `backend/src/routes/estimates.routes.ts`（2218行） | 明細系13エンドポイント。コントローラ層なしでルートに直書き。`batch` が `updatedAt` を読み捨て（`:1021`） |
| `backend/src/services/estimate-item.service.ts`（885行） | ループUPDATE（`:584-588`, `:631-654`）、BFS `findMany`（`:541-560`）、転記ループ（`:717/735/755`, `:773-790`） |
| `backend/src/services/estimate-export.service.ts`（32,625 bytes） | jsPDF、**日本語フォント未埋め込み**、A4縦（`:173`）、5列（`:100-105`）、罫線なし |
| `frontend/src/components/estimate/EstimateItemTable.tsx`（385行） | 全階層インデント表示。展開/折りたたみなし |

### データモデルの現状

| モデル | 現状 | 参照 |
|---|---|---|
| `EstimateItem` | `parentId` 隣接リスト（`onDelete: Cascade`）＋ `displayOrder`（`@@unique` なし、重複・歯抜け許容）。`level`/`path` なし。物理削除 | `prisma/schema.prisma:1202-1226` |
| `EstimateItemLine` | `@@unique([estimateItemId, lineType])`。STANDARD は3行、DISCOUNT は1行。**1項目=最大4レコード** | `:1257-1280` |
| `Estimate` | `id/projectId/name/sourceItemizedStatementId/sourceItemizedStatementName/createdAt/updatedAt/deletedAt`。**`version` なし** | `:1157-1175` |
| `EstimateItemType` | **`STANDARD` / `DISCOUNT` の2値のみ** | `:1128-1131` |
| `ExecutionBudgetItem` | `estimateItemId` を `onDelete: SetNull` で参照 | `:1586-1635` |
| `CompanyInfo` | `companyName/address/representative/phone/fax/email/invoiceRegistrationNumber`。**郵便番号フィールドなし** | — |
| `Project` / `TradingPartner` | `Project.name`（工事件名）、`Project.siteAddress`（工事場所）、`TradingPartner.name`（宛先）、`TradingPartner.representativeName`（代表者名、任意） | — |

マイグレーションは32件運用中（直近 `20260727042529_add_construction_photo_models`）。`20260521005902_add_estimate_item_type` が `itemType` 追加の先例。

## 2. 要件→資産マッピングとギャップ

タグ: **[充足]** 既存資産で満たせる / **[拡張]** 既存を改造 / **[新規]** 新規作成 / **[Missing]** データモデル不足 / **[Constraint]** 既存構造による制約 / **[Unknown]** 要調査

### W1: 編集基盤（REQ-12 / 27 / 34 / 42 / 43 / 44）

| 要件 | 資産 | タグ |
|---|---|---|
| REQ-42 一括保存・競合検出・並び順の権威 | `quantity-table.service.ts:945` `saveDraft()` が全ACの雛形 | **[新規]** 見積用の同等エンドポイントを新設 |
| REQ-42 AC9 実行予算からの参照維持 | `ExecutionBudgetItem.estimateItemId` は `onDelete: SetNull` | **[Constraint]** 差分適用は既存IDを維持すること（削除→再作成は不可） |
| REQ-42 AC5 楽観ロック | `Estimate` に `version` なし | **[Constraint]** `updatedAt` 比較方式を継続 |
| REQ-43 行操作のローカル完結 | `quantityTableEditReducer.ts` が前例 | **[拡張]** `useEstimateEditor` を純粋reducerへ置換 |
| REQ-43 AC5 親集計の即時再計算 | `useEstimateEditor.ts:418` `recalculateParentAmounts` が存在するが未メモ化（`:527`） | **[拡張]** |
| REQ-44 範囲選択 | 該当資産なし（現行は単一選択前提） | **[新規]** |
| REQ-44 AC7 循環参照の禁止 | サーバー側 `getDescendantIds`（`:541-560`）はBFSでN+1 | **[拡張]** クライアント側ツリーで判定し、サーバーは受領時検証のみ |
| REQ-12 AC8 DnDの永続化 | `useEstimateEditor.ts:768-769` のバグ | **[拡張]** |
| REQ-27 AC5〜7 未保存表示・離脱ガード | 数量表・工事写真台帳に離脱ガードの実績あり | **[充足]** パターン流用 |

### W2: ナビゲーション（REQ-2 / 23 / 45 / 46 / 47 / 48）

| 要件 | 資産 | タグ |
|---|---|---|
| REQ-48 取り消し/やり直し（10回） | `UndoManager`（`maxHistorySize` 引数）＋ `useUndoState` ＋ `useUndoKeyboardShortcuts` | **[充足]** `new UndoManager(10)` で AC3 を満たす |
| REQ-47 AC5 文字入力中は行操作を実行しない | `useUndoKeyboardShortcuts.ts:45` `isTextInputElement` | **[充足]** 判定ロジックを共用 |
| REQ-47 AC1/AC3/AC4 キー割当と一覧表示 | キーマップを集約する仕組みは存在しない | **[新規]** キーマップ定義とヘルプ表示 |
| REQ-47 AC2 セル間移動 | `useKeyboardNavigation` / `utils/keyboard-navigation.ts` | **[拡張]** グリッド用の移動順定義が必要 |
| REQ-45 表示モード切替・ドリルダウン | 該当資産なし | **[新規]** |
| REQ-46 階層構造パネル | **ツリー表示コンポーネントの既存資産なし** | **[新規]** |
| REQ-2 AC5 階層深さ無制限 | `EstimateItem` に `level`/`path` なし | **[Constraint]** 深さ・経路はクライアントで毎回走査。行数の多い見積書での再計算コストに配慮が必要 |

### W3: 転記統合（REQ-4〜9 / 17〜19 / 30 / 31 / 33 / 39 / 49）

| 要件 | 資産 | タグ |
|---|---|---|
| REQ-49 AC3 実行時にDB書き込みを行わない | `POST /:id/calculate-overhead`（`estimates.routes.ts:1701`）が**計算のみ・書き込みなし**の先例 | **[拡張]** 他4経路を同型へ |
| REQ-49 AC5 競合エラーを起こさない | 現行3経路がサーバー側で `Estimate.updatedAt` を更新（`:1456-1459`, `:1618-1621`、転記も同トランザクション内） | **[拡張]** 更新を保存経路のみに限定 |
| REQ-5 AC8 / REQ-6 AC8 プレビューと結果の一致 | 案分計算がクライアント（`NetAllocationDialog.tsx:234-259`）とサーバー（`:1403-1420`）に**二重実装** | **[拡張]** 単一実装化。丸め挙動（`ROUND_HALF_UP` / `toDecimalPlaces(0)` / ゼロ除算回避 / 数量ゼロ時の単価算出 `:1436-1441`）の完全一致が必須 |
| REQ-5 AC9 / REQ-6 AC9 未保存の新規行を対象化 | ダイアログは `line.id`（DB UUID）を送信（`NetAllocationDialog.tsx:271-276`） | **[拡張]** 行データ渡しへ変更 |
| REQ-6 AC7 「空の場合のみ上書き」を編集中の値で判定 | 現行はDBの値で判定（`estimates.routes.ts:1580-1620`） | **[拡張]** 挙動変更を伴う |
| REQ-39 AC10 編集中の内容でサマリー計算 | サマリーは既存 | **[充足]** |

### W4: 帳票（REQ-10 / 22 / 32 / 38 / 41 / 50〜56）

| 要件 | 資産 | タグ |
|---|---|---|
| REQ-10 AC8 日本語描画失敗時の中断 | `PdfFontService` は成功、ただし `PdfReportService:725-728, 790-794` は helvetica へフォールバックする | **[拡張]** 見積書はフォールバックせず中断 |
| REQ-50 用紙・ページ構成 | `QuantityTablePdfExportService` の改ページ判定 | **[新規]** 表紙/内訳書/明細書の3種を新設 |
| REQ-50 AC5/AC6 深さ無制限の入れ子明細書 | 参照PDFは2階層のみ | **[新規]** 深さ優先での再帰出力 |
| REQ-51 表紙 | `PdfReportService.renderCoverPage` が前例 | **[新規]** |
| REQ-51 AC13 自社情報の取得 | `CompanyInfo`（会社名/住所/代表者/電話/FAX） | **[充足]** |
| REQ-51 AC14 郵便番号を独立行にしない | `CompanyInfo` に郵便番号なし | **[充足]**（要件側で出力しないと決定済み） |
| REQ-52 罫線グリッド（PDF） | `doc.rect` / `doc.line` の実績 | **[拡張]** 7列・18行グリッドへ |
| REQ-52 罫線グリッド（Excel） | `export-excel.ts` は `json_to_sheet` のみ。**SheetJS 0.20.3 の書き込み経路が出力する `cellStyles` は既定の `Normal` 1件のみ**（セル単位の罫線・塗りを書き出さない） | **[Constraint]** Excelで罫線を再現する手段が現状ない |
| REQ-53 値の表記規則 | `decimal.js` はクライアントでも使用中 | **[新規]** |
| REQ-54 別途工事5件・有効期限・提出日 | `Estimate` に該当フィールドなし | **[Missing]** マイグレーション必須 |
| REQ-55 注記行 | `EstimateItemType` は `STANDARD`/`DISCOUNT` の2値 | **[Missing]** enum 値追加のマイグレーション必須。`20260521005902_add_estimate_item_type` が先例 |
| REQ-56 未保存プレビュー | フロントエンド生成に移せば技術的に可能 | **[新規]** |
| REQ-32 行タイプごとに独立した一連のページ | 現行は「横1列に並べる」（`estimate-export.service.ts:317-336` `getHeadersForLineTypes`） | **[拡張]** 既存の出力書式とE2Eを置き換える |

## 3. 実装アプローチ案

### Option A: 既存コンポーネントを拡張する

`useEstimateEditor` の `pendingChanges` 方式を保ちつつアクションを足し、`PUT /items/batch` を差分適用可能に拡張、`estimate-export.service.ts`（バックエンド）に日本語フォントを追加して書式を作り込む。

- ✅ 新規ファイルが少なく、既存の呼び出し元をほぼ変えずに済む
- ✅ 出力経路が1系統のまま（`GET /:id/export`）
- ❌ `pendingChanges` は純粋関数でないため **REQ-48（取り消し）が成立しない**
- ❌ 2.25MB のフォント資産をバックエンドへ複製する必要がある
- ❌ `useEstimateEditor`(871行) / `EstimateDetailPage`(1265行) / `estimates.routes.ts`(2218行) がさらに肥大する
- ❌ REQ-56（未保存プレビュー）はサーバー生成では実現できない

### Option B: 新規コンポーネントで置き換える

見積用の保存エンドポイントを新設し旧6本を撤去、`useEstimateEditor` を純粋reducerへ全面置換、帳票をフロントエンドの新規サービスへ移してバックエンドのPDF生成部を撤去する。

- ✅ REQ-48 の前提（純粋関数）を最初から満たす
- ✅ フォント資産・罫線描画・ダウンロード処理をフロントエンドの既存4サービスから再利用でき、追加調達が不要
- ✅ REQ-56 が自然に成立する
- ✅ 旧APIと旧PDF生成部を撤去でき、二重メンテを避けられる
- ❌ 一度に変わる範囲が広く、E2E（`e2e/specs/estimate/` 約8,500行）の移行が同時に必要
- ❌ 出力経路がPDF/Excelともフロントへ移るため、サーバー側の出力ダウンロードを前提とした運用があれば影響する

### Option C: ハイブリッド＋段階リリース（推奨）

境界ごとに A/B を選び分け、リリース単位を3段に分ける。

- **段階1（編集基盤・W1）**: 保存エンドポイントは**新設**（B）。reducer は**全面置換**（B）。旧6エンドポイントはこの段階で撤去。転記系には未保存時の起動抑止を**暫定ガード**として入れる
- **段階2（ナビゲーション・W2）**: `UndoManager` / `useUndoState` / `useUndoKeyboardShortcuts` / `useKeyboardNavigation` を**拡張再利用**（A）。表示モード・ツリーパネル・キーマップは**新規**（B）
- **段階3（転記統合・W3）**: `calculate-overhead` の「計算のみ」型へ**拡張**（A）。段階1の暫定ガードを撤去
- **段階4（帳票・W4）**: フロントエンドへ**新規**サービスを作成し、バックエンドPDF生成部を撤去（B）

- ✅ 各段階が単独で検証可能。E2Eの移行も段階ごとに分割できる
- ✅ `UndoManager` など再利用可能な資産は作り直さない
- ❌ 段階1と段階3の間は暫定ガードが必要（**段階1のみを先行リリースすると転記後の保存が必ず競合エラーになるため、ガードは省略できない**）
- ❌ 4段階の計画と整合性維持のコストがかかる

## 4. 工数・リスク

| 区分 | 工数 | 根拠 | リスク | 根拠 |
|---|---|---|---|---|
| W1 編集基盤 | **L**（1〜2週） | `saveDraft` の移植は型が定まっているが、reducer 全面置換と旧API撤去、E2Eの新API移行が伴う | **Medium** | 同一リポジトリに稼働実績パターンがあり技術的未知は少ない。既存IDの維持（実行予算参照）を外すと影響が広い |
| W2 ナビゲーション | **L**（1〜2週） | Undo系3資産の再利用で軽減されるが、表示モード2種＋ツリーパネル＋キーマップは新規 | **Medium** | 表示モード導入で既存E2Eのセレクタが影響を受ける。既定をツリー表示に固定して緩和可能 |
| W3 転記統合 | **M**（3〜7日） | 5経路の書き込み撤去と計算の単一化。`calculate-overhead` の前例あり | **Medium-High** | 丸め挙動を現行と完全一致させる検証が難しい。差分が金額の誤りとして顧客に出る |
| W4 帳票 | **XL**（2週以上） | 表紙・内訳書・明細書の書式作り込み、Excel移行、マイグレーション2件（`Estimate` の3フィールド、`EstimateItemType` の `NOTE`）、行タイプごとの複数ページ化 | **High** | Excelの罫線に現状の手段がない。第2階層以降の階層記号規則が未定義。書式の作り込み量が大きい |
| 全体 | **XL** | — | **High** | 4段階の同時整合が必要。W4のみでも単独XL |

## 5. 設計フェーズへの申し送り（Research Needed）

1. **Excelにおける罫線の実現手段**: SheetJS 0.20.3（Community）の書き込み経路はセル単位のスタイルを出力しない。(a) Excelは罫線なしで既定のグリッド線に委ねる（要件緩和）、(b) `exceljs` 等の書き込み時スタイル対応ライブラリを追加、(c) Excelは列構成と値の書式のみ揃える。**REQ-10 AC2 と REQ-52 AC3〜AC6 の解釈に影響するため要件側の確認が必要**。
2. **第2階層以降の階層記号**: 参照PDFは第1階層に `Ａ`〜`Ｈ` を用いる例のみ。REQ-50 AC5 で深さ無制限の明細書ページを出すため、第2階層以降の記号体系（`Ａ-1` 形式か連番か無しか）が未定義。REQ-52 AC11 / REQ-53 AC7 に影響。
3. **18行グリッドにおける行数カウント**: 注記行（REQ-55）と値引行（REQ-41）を明細17行の枠に含めるか。継続ページ（REQ-50 AC9）の分割位置にも影響。
4. **単位の `〃` 置換とページ跨ぎ**: 継続ページの先頭行が直前ページ最終行と同一単位の場合、`〃` とするか実単位を出すか（REQ-53 AC6）。
5. **キー割当表の確定**: 参照モデルのファンクションキー割当（F2/F3/F6/F7/F9 等）はブラウザ標準機能と衝突する。REQ-47 AC4 を満たす調整版の具体的な割当。`useUndoKeyboardShortcuts` の Ctrl+Z 系との共存も含める。
6. **表示モードの引き継ぎ範囲**: REQ-45 AC11 の「次回の画面表示時にも引き継ぐ」を、ユーザー単位（サーバー保存）か端末単位（ブラウザ保存）のどちらとするか。
7. **深さ無制限時の再計算コスト**: `level`/`path` を持たない隣接リストで、行数の多い見積書における親集計・経路算出・ツリーパネル再構築の実測が必要。マテリアライズド列の追加を設計で再検討する余地。
8. **計算の単一化の方向**: 案分・利益率の計算を (a) クライアントへ寄せてサーバーの計算エンドポイントを廃止 / (b) サーバーを純粋計算エンドポイントとしプレビューと適用の両方で使う。`calculate-overhead` は (b) の前例、`NetAllocationDialog` は既に (a) の実装を持つ。
9. **フォントのサブセット化**: `PdfFontService.ts:6, 17` のコメントは「約500KB」だが実体は 2.25MB。既存3機能と共有する資産のため、変更は他機能へ波及する。
10. **リリース単位**: 段階1のみ先行する場合の暫定ガードの具体（転記ダイアログの起動抑止か、保存を促す確認ダイアログか）。

_本分析は Requirement 42〜56 を含む改訂要件（未承認、`spec.json` の requirements.approved = false）に基づく。要件の確定または上記1・2の解消により結論が変わる箇所がある。_
