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
