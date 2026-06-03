# Gap Analysis: quantity-table-generation (REQ-37 / REQ-38 追加分)

対象要件:
- **REQ-37**: 計算用フィールドの行内水平配置（面積・体積／ピッチ選択時の追加フィールドをメイン行の操作列右側に同一行で水平配置、ラベル+テキストボックス交互、行高さ不変、画面右側へのはみ出し許容）
- **REQ-38**: 数量グループのコピー機能（各グループパネル表題部のコピーボタン、同一数量表内に丸ごと複製、元グループの直下に挿入、名前は「{元名}のコピー」）
- **整合更新**: REQ-8/9/10（配置参照付け）、REQ-18 AC3/AC4（計算用フィールド専用タイトル行廃止）

調査日: 2026-05-13
spec phase: requirements-generated

---

## 1. Current State Investigation

### 1.1 計算用フィールド描画の現状（REQ-37 関連）

**レイアウト機構: CSS Grid ベースの 2 段構成**

| 場所 | ファイル:行 | 内容 |
|------|------------|------|
| メイン行 | `frontend/src/components/quantity-table/EditableQuantityItemRow.tsx:396-600` | 12列グリッド（大項目〜操作、`gridTemplateColumns` 合計 1180px） |
| 計算用フィールド行（別行） | `EditableQuantityItemRow.tsx:602-616` | `calculationFieldsRow` div でメイン行の下にラップ表示 |
| 計算用フィールド内部 | `frontend/src/components/quantity-table/CalculationFields.tsx:85-95, 419-456` | grid(repeat(auto-fill, 80px)) でラベル+入力を縦ペア配置 |
| グループタイトル行 | `frontend/src/components/quantity-table/QuantityGroupTitleRow.tsx` | メイン行のヘッダー（大項目〜操作）を表示 |
| グリッド定数 | `frontend/src/components/quantity-table/gridConstants.ts` | 列幅・gap 定数集約 |

**行高さ仕様（メイン行のみで完結）:**
- ラベル: 14px + gap 1px + input 22px = 37px
- メイン行 padding: `2px 4px`
- 計算用フィールド行 padding: `0 4px 4px 4px`

**スクロール挙動:**
- ページ全体（ブラウザネイティブ）で水平スクロール
- インラインスクロールバーは禁止（REQ-25.1/25.2 既存実装）
- メイン行幅 1180px は viewport を超えると水平スクロール発生

**現状で既にラベルは各フィールドに付随**（タイトル行ではなく `<label>` 要素を `CalculationFields` 内で個別表示）。REQ-37 AC 2 の「ラベル+テキストボックス交互」仕様は現コンポーネント実装と整合する。

### 1.2 グループパネル表題部の現状（REQ-38 関連）

**ファイル**: `frontend/src/components/quantity-table/QuantityGroupCard.tsx`

**現在のボタン配置:**
```
[展開/折りたたみ ChevronIcon] [グループ名(編集可)] [項目数] [SortOrderButtons↑↓] [削除ボタン TrashIcon]
```

**主要箇所:**
- 展開/折りたたみ: L579-590（`ChevronIcon` SVG）
- グループ名インライン編集: L608-627（`onRenameGroup` プロップ、最大文字数 `GROUP_NAME_MAX_WIDTH = 50`）
- 並び順変更ボタン: L631-643（`<SortOrderButtons>` コンポーネント）
- 削除ボタン: L646-656（`TrashIcon` SVG、赤系スタイル `#fef2f2 / #b91c1c`、ラベル "グループを削除"）
- 写真エリア: L667-752（紐づけ時 640x480px、未紐づけ時 80x60px プレースホルダー）

### 1.3 数量表コピー（REQ-17）実装の構造

REQ-38 は REQ-17 の同パターンを流用できる。

**フロント→API→サービス→DB の流れ:**

| 層 | ファイル:行 | 内容 |
|----|------------|------|
| UI（ダイアログ） | `frontend/src/components/quantity-table/CopyQuantityTableDialog.tsx:1-243` | デフォルト名 `${sourceTable.name}のコピー` (L153)、入力バリデーション、スピナー表示 |
| API クライアント | `frontend/src/api/quantity-tables.ts:505-510` | `copyQuantityTable(tableId, input)` |
| バックエンドルート | `backend/src/routes/quantity-tables.routes.ts:740-834` | `POST /:id/copy`, 権限 `quantity_table:create`, バリデーション `copyQuantityTableSchema` |
| サービス | `backend/src/services/quantity-table.service.ts:910-1014` | トランザクション内で元データ取得→複製、`displayOrder` と `surveyImageId` を保持、監査ログ記録 |

### 1.4 グループ単位 CRUD エンドポイントの既存状況

**ファイル**: `backend/src/routes/quantity-groups.routes.ts`

| 操作 | パス | REQ-38 における再利用可能性 |
|------|------|---|
| Create | `POST /api/quantity-tables/{quantityTableId}/groups` (L127) | 高（複製用の新エンドポイントから内部利用） |
| Update | `PUT /api/quantity-groups/{id}` (L458) | 高（displayOrder/name/surveyImageId 個別更新） |
| Delete | `DELETE /api/quantity-groups/{id}` (L561) | 中 |
| DisplayOrder 一括更新 | `PUT /api/quantity-tables/{quantityTableId}/groups/order` (L295) | **高**（複製後の順序再採番に流用可） |
| **Copy** | **無し** | **要新規追加（`POST /api/quantity-groups/{id}/copy`）** |

### 1.5 データモデル（QuantityGroup）

`backend/prisma/schema.prisma:624-638`

```prisma
model QuantityGroup {
  id              String @id @default(uuid())
  quantityTableId String
  name            String?              // 上限は schema 未明記、実装は GROUP_NAME_MAX_WIDTH=50
  surveyImageId   String?              // 写真紐づけ（中間テーブルなし、直接 FK）
  displayOrder    Int                  // 0始まり連番
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  quantityTable   QuantityTable @relation(...)
  surveyImage     SurveyImage? @relation(...)
  items           QuantityItem[]
  @@index([quantityTableId, displayOrder])
}
```

**displayOrder 採番:**
- 既存の新規作成は「末尾追加」（`maxDisplayOrder` を割当）
- REQ-38 は「元グループの直下挿入」なので、**既存の末尾追加パターンを流用できず、後続グループの displayOrder をシフト（+1）するロジックが必要**

### 1.6 既存テスト・Storybook の前提

| ファイル | 行 | 前提 |
|---------|----|----|
| `EditableQuantityItemRow.stories.tsx` | 50-60 | `overflowX:'auto'` で行下の計算フィールド対応 |
| `EditableQuantityItemRow.test.tsx` | 60-85 | メイン行フィールドのみ検証（計算用は未カバー） |
| `CalculationFields.test.tsx` | 30-87 | 「フィールド群を行下に配置」を前提 |
| `QuantityTableEditPage.scrollbar.test.tsx` | 104-140 | インラインスクロール禁止を検証（行下配置を暗黙前提） |
| `e2e/specs/quantity-tables/quantity-table-copy.spec.ts` | 1-243 | 数量表コピーの e2e パターン（REQ-38 のテンプレート流用元） |

---

## 2. Requirements Feasibility Analysis

### 2.1 Requirement-to-Asset Map

| REQ | AC 概要 | 関連既存資産 | ギャップ種別 |
|-----|---------|-------------|-------------|
| REQ-37 AC1, AC4, AC5 | メイン行操作列の右側に計算用フィールド群を水平配置 | `EditableQuantityItemRow.tsx:396-616`, `CalculationFields.tsx` | **Constraint**: 既存 CSS Grid の `gridTemplateColumns` を拡張、`calculationFieldsRow` 別行 div の削除 |
| REQ-37 AC2 | ラベル+テキストボックス交互配置 | `CalculationFields.tsx` (既に label+input ペア) | **Reusable**: 縦ペア→横ペアへの flex 配置変更で対応可能 |
| REQ-37 AC3 | 行高さ不変 | 既存メイン行 37px | **Constraint**: ラベルを inline で配置すると現在の縦積みより縦サイズが小さくなる必要あり |
| REQ-37 AC6 | 水平スクロール対応 | REQ-25 既存実装（ページ全体スクロール） | **Reusable**: 既存のページレベル水平スクロールがそのまま機能 |
| REQ-37 AC9 | バリデーション・計算挙動不変 | `CalculationFields.tsx` の入力ハンドラ、`useQuantityTableSave` | **Reusable**: 配置変更のみで動作ロジックはそのまま |
| REQ-37 AC12 | 計算用専用タイトル行廃止 | `QuantityGroupTitleRow.tsx`（計算用列のヘッダー定義なし／メイン行のみ） | **Reusable**: 既に専用タイトル行はないため、影響は REQ-18 AC3/AC4 の要件側更新のみ |
| REQ-38 AC1 | グループパネル表題部にコピーボタン | `QuantityGroupCard.tsx:646-656`（削除ボタン横） | **Missing**: コピーボタンと `onCopyGroup` プロップ追加 |
| REQ-38 AC2, AC3, AC4 | 同一数量表内に丸ごと複製（項目・写真紐づけ含む） | `quantity-table.service.ts:910-1014` の `copy()` メソッド | **Reusable パターン**: 同じトランザクション構造を `QuantityGroupService.copy()` に展開 |
| REQ-38 AC5, AC6 | 名前「{元名}のコピー」、超過時切り詰め | `CopyQuantityTableDialog.tsx:153`、`GROUP_NAME_MAX_WIDTH=50` | **Reusable**: 命名規則は同パターン、切り詰めロジックは新規（既存実装は最大文字数超過を許容しない） |
| REQ-38 AC7 | 元グループの直下挿入 | `quantity-group.service.ts` の displayOrder 採番（末尾追加） | **Missing**: 後続グループの displayOrder シフト（+1）または `PUT /groups/order` 一括更新 API 経由での再採番が必要 |
| REQ-38 AC8 | 独立データ管理 | Prisma の標準的な新規レコード作成 | **Reusable**: REQ-17 と同じパターン |
| REQ-38 AC9, AC10 | ローディング表示・重複防止・ロールバック | `CopyQuantityTableDialog.tsx` のスピナー、Prisma `$transaction` | **Reusable**: 同パターン |
| REQ-38 AC11 | 複製先を画面表示、続けて編集可 | `QuantityTableEditPage` の state 更新ハンドラ | **Reusable**: 既存の `handleRenameGroup` 等と同様のパターン |
| REQ-38 AC12 | 既存表題部要素と視覚干渉なし | `QuantityGroupCard.tsx` 表題部の現状レイアウト | **Constraint**: コピーボタンの配置位置（削除ボタンの左／右、SortOrderButtons との順序）の UX 判断が必要 |
| REQ-18 AC3, AC4 整合更新 | 計算用専用タイトル行を別行レンダしない | 既に専用タイトル行のレンダリングは無いため、実装側は問題なし。要件側のみ整合 | **Already satisfied** |

### 2.2 Complexity Signals

| REQ | 複雑度シグナル |
|-----|---------------|
| REQ-37 | UI レイアウト変更（CSS Grid 拡張）・既存テストの広範な書き換え・行高さ不変制約の物理的検証 |
| REQ-38 | 算法ロジック（displayOrder 再採番）+ ワークフロー（UI→API→Service→DB）+ 既存パターン高い再利用性 |

---

## 3. Implementation Approach Options

### Option A: Extend Existing Components

**REQ-37 への適用:**

- 変更ファイル:
  - `EditableQuantityItemRow.tsx` — `calculationFieldsRow` 別行 div を削除し、`CalculationFields` をメイン行の操作列の右側に inline 配置
  - `CalculationFields.tsx` — `container` / `fieldsGrid` の縦ペア→横ペア配置に変更（flex-row + label-input をペア単位で連続配置）
  - `gridConstants.ts` — メイン行 `gridTemplateColumns` の右端に計算用フィールド領域は追加せず、計算用フィールドは Grid 外（操作列右の自由領域）として配置
  - 既存テスト・Story の更新

- ✅ Pros: 既存コンポーネントの API（プロップ、`item.calculationMethod` 等）をそのまま流用、Grid 構造の理解が継続される
- ❌ Cons: `EditableQuantityItemRow` の行構造に「Grid 外の inline 計算フィールド領域」が追加されるため、視覚的構造の理解難度がやや上がる

**REQ-38 への適用:**

- 変更ファイル:
  - `QuantityGroupCard.tsx` — 削除ボタンの左 or 右に「コピー」ボタン追加、`onCopyGroup` プロップを追加
  - `QuantityTableEditPage.tsx` — `handleCopyGroup` ハンドラ追加、`QuantityGroupCard` への配線
  - `frontend/src/api/quantity-groups.ts`（または既存 API クライアント） — `copyQuantityGroup(groupId)` 追加
  - `backend/src/routes/quantity-groups.routes.ts` — `POST /:id/copy` ルート追加
  - `backend/src/services/quantity-group.service.ts` — `copy()` メソッド追加（`quantity-table.service.ts:910-1014` パターンを参考に縮小実装）
  - `backend/src/schemas/quantity-table.schema.ts` または分離 — copy 用バリデーション（リクエストボディ無し、または name override の任意フィールドのみ）

- ✅ Pros: 既存 REQ-17 のパターン流用率高（コピーアルゴリズムは確立済み）、新規ファイル数を最小化
- ❌ Cons: `QuantityGroupCard.tsx` 表題部のボタン数が増加（既に展開/名前/項目数/並替/削除 → コピー追加で 6 要素）

### Option B: Create New Components

**REQ-37 への適用:**

- 新規ファイル: 例 `InlineCalculationFields.tsx` を作成し、横配置専用のラベル+input ペアコンポーネントを提供
- 既存 `CalculationFields.tsx` は廃止 or 互換ラッパーとして残す

- ✅ Pros: 縦配置と横配置の責務を分離、既存の縦配置テストを温存できる
- ❌ Cons: 縦配置は使われなくなるため `CalculationFields.tsx` の dead code 化、二重メンテのリスク

**REQ-38 への適用:**

- 新規 `CopyQuantityGroupDialog.tsx` を作成し、グループ名編集ダイアログを表示する形にする
- ただしユーザーは「コピーボタン押下のみ」を希望（ダイアログ無し）→ Option B はユーザー要件と乖離するため非推奨

### Option C: Hybrid Approach

**推奨案: REQ-37 は Option A、REQ-38 は Option A（Hybrid 不要）**

- REQ-37 は既存 `CalculationFields` を横配置に書き換える Option A が最も適合
- REQ-38 は新規 Dialog 不要のため Option A 一択
- 両者を組み合わせる Hybrid の意味が無い

---

## 4. Implementation Complexity & Risk

| 項目 | Effort | Risk | 一行説明 |
|------|--------|------|----------|
| REQ-37 | **M (3–7 日)** | **Medium** | CSS Grid 構造変更と既存テスト/Story の広範な書き換え、行高さ不変制約の物理検証、`QuantityGroupTitleRow` の整合維持 |
| REQ-38 | **S–M (2–5 日)** | **Low** | 既存 REQ-17 copy パターンの高い再利用、displayOrder 再採番ロジックのみ追加新規 |
| 既存テスト整合更新（両REQ波及） | **S (1–3 日)** | **Medium** | `CalculationFields.test.tsx`, `EditableQuantityItemRow.test.tsx`, `QuantityTableEditPage.scrollbar.test.tsx`, e2e の書き換え範囲を要精査 |

**全体 Effort: M（5–10 日相当）、Risk: Medium（REQ-37 のレイアウト回帰）**

---

## 5. Research Needed (Design フェーズへ持ち越し)

1. **REQ-37 行高さ不変の達成方法**: ラベル(14px) + input(22px) を横並びに置く際、行高さを 37px から増やさず inline 化するための CSS 設計（label を input の前に縦書き相当の inline-flex でラップする、もしくは label を visually-hidden にして tooltip/title 属性で代替するか）。**ラベル可視性は要件（AC2）で必須なので、後者は不可。** 縦寸法を抑えつつラベルを可視化する具体的 CSS 戦略を design で確定する。
2. **REQ-37 操作列の右側の領域**: 現在のメイン行 grid は 1180px で右端は操作列。計算用フィールド群を Grid に追加列として組み込むか、Grid の外側（grid-template の外）に絶対配置/flex で隣接させるか。各方式の Storybook/scrollbar test への影響度を design で評価する。
3. **REQ-37 行ごとの計算用フィールド長の差異**: 同一数量グループ内で「面積・体積」（6 フィールド）と「ピッチ」（8 フィールド）と「標準」（0 フィールド）が混在する場合、各行の右端位置が揃わない。視覚的整合性に問題ないか、設計でユーザー想定を再確認。
4. **REQ-38 displayOrder 再採番戦略**: 元グループの直下に挿入する際、(a) 後続グループの displayOrder を一括 +1 する個別 UPDATE、または (b) 既存の `PUT /groups/order` API を呼び出して一括再採番、または (c) displayOrder を疎な値（10刻み等）に変更してギャップ挿入を可能にする。既存実装に合わせた最小変更案を design で決定する。
5. **REQ-38 ボタン配置の UX**: コピーボタンを削除ボタンの左／右どちらに置くか、テキスト「グループをコピー」とアイコンの組み合わせ、色（破壊的でないため neutral カラー）を design で確定する。
6. **REQ-38 認可とレート制限**: コピー操作で大量の数量項目が複製されると DB 負荷が増加する。既存 REQ-17（テーブル全体コピー）と同等の `quantity_table:create` 権限要件・レート制限要否を design で確認する。
7. **REQ-38 監査ログのアクション名**: 既存パターン（例: `QUANTITY_TABLE_COPIED`, `QUANTITY_ITEM_COPIED`）に合わせ `QUANTITY_GROUP_COPIED` を採用するかを design で確定する。
8. **既存 e2e/specs のテスト前提**: 「行下表示」を暗黙前提にしている可能性のあるテスト（scrollbar test、項目編集 e2e）を design 段階で洗い出し、書き換え対象を明確化する。

---

## 6. Recommendations for Design Phase

### 6.1 Preferred Approach

- **REQ-37**: Option A（既存 `EditableQuantityItemRow.tsx` / `CalculationFields.tsx` の拡張）
- **REQ-38**: Option A（既存 `QuantityGroupCard.tsx` / `quantity-group.service.ts` 等の拡張、REQ-17 のサービス層パターンを縮小流用）

### 6.2 Key Decisions for Design

1. REQ-37: 計算用フィールド群を「Grid 内追加列」とするか「Grid 外 inline 領域」とするか
2. REQ-37: ラベル可視を保ちつつ行高さを変えない CSS 戦略の確定（横ペア vs 縦ペア vs Tooltip）
3. REQ-38: displayOrder 再採番戦略（個別 UPDATE / 一括 reorder API / 疎な番号付け）
4. REQ-38: コピーボタンの UI 配置位置（並び順変更ボタンの右 / 削除ボタンの左 等）
5. REQ-38: 新規 API パス（`POST /api/quantity-groups/{id}/copy`）の権限スコープ（既存 `quantity_table:create` 流用 or 新規 `quantity_group:create`）

### 6.3 Design 段階で持ち越す研究項目

上記 Section 5（Research Needed）の項目 1–8 をすべて design.md の Discovery セクションで解消する。

### 6.4 Out of Scope for This Iteration

- 数量項目（QuantityItem）単位のコピー（REQ-6 で既実装）
- 別の数量表へのグループ移動（user 確認済み、本イテレーションでは同一数量表内のみ）
- 数量グループ名前変更（REQ-22 既実装）

---

## 7. Design Phase Synthesis (2026-05-13)

`/kiro-spec-design` 実行時の synthesis 結果を記録する。

### 7.1 Generalization

- REQ-38（グループコピー）は REQ-17（数量表コピー）の縮小特殊ケースとして扱う。サービス層は同一の `$transaction` + displayOrder保持 + 監査ログ記録のパターンを流用
- REQ-37 と REQ-18 AC3/AC4 は同一の "calculation fields 配置" 問題の表裏。要件側で整合更新済み、設計側では REQ-37 を主要件として扱い REQ-18 は計算用専用タイトル行廃止のみの参照関係に整理

### 7.2 Build vs Adopt

- **Adopt**: 既存 `QuantityTableService.copy()` のロジック構造（`$transaction` + sourceデータ取得 + 新規挿入 + 監査ログ）を `QuantityGroupService.copy()` で踏襲
- **Adopt**: 既存 `auditLogService.createLog()` を `QUANTITY_GROUP_COPIED` アクションで再利用
- **Adopt**: 既存の CSS Grid メイン行レイアウト（`gridConstants.ts` の 12列定義）はそのまま維持し、計算用フィールド群のみ Grid 外 inline 配置に変更
- **Build**: グループ名文字数超過時の切り詰めユーティリティ `truncateForCopy()` を `QuantityValidationService` に新設（既存実装になし）

### 7.3 Simplification

- **Skip CopyQuantityGroupDialog**: ユーザー要件（コピーボタン押下のみ・ダイアログ無し）に従い、新規 Dialog コンポーネントを作成しない
- **Skip name input override**: API リクエストボディに `name` フィールドを置かず、サーバー側で自動的に「{元名}のコピー」を生成する（簡素化）
- **Skip separate route file**: グループコピー API は既存 `quantity-groups.routes.ts` に追記し、新規ルートファイルを作成しない
- **Skip calculation field title row**: REQ-37 の新レイアウトでは inline ラベルが各フィールドに付随するため、計算用フィールド専用タイトル行（別行）は不要（既に未実装）

### 7.4 設計時の決定事項（research.md Section 5 の解消状況）

| Research Item | 解消方針 |
|---------------|---------|
| #1 行高さ不変の CSS 戦略 | ラベル高さ 14px + 入力高さ 22px の縦ペアを横ペアに変更。ラベルは visually-hidden ではなく可視のまま縦パディングを縮小して 37px 以下に収める |
| #2 操作列右側の領域 | 実装段階で 2 案（操作列セル `display: contents` 解除 / EditableQuantityItemRow 最上位を flex 化）を試し、回帰影響が小さい方を選択（design.md 内で明記） |
| #3 行ごとの計算用フィールド長の差異 | REQ-37 AC8 で「各行が独立して描画される（右端不揃いは許容）」と明示済み |
| #4 displayOrder 再採番戦略 | `prisma.quantityGroup.updateMany({ where: { displayOrder: { gt: src } }, data: { displayOrder: { increment: 1 } } })` を `$transaction` 内で実行する個別 UPDATE 方式を採用 |
| #5 コピーボタン配置 | 並替ボタン↑↓と削除ボタンの間に挿入（Open Question として実装段階の UI レビューで最終確定） |
| #6 認可スコープ | 既存 `quantity_table:create` 権限を流用（REQ-17 と同等） |
| #7 監査ログアクション名 | `QUANTITY_GROUP_COPIED` を新設（既存パターンに合わせる） |
| #8 e2e テストの前提 | `CalculationFields.test.tsx` および `QuantityTableEditPage.scrollbar.test.tsx` の書き換えを Implementation Notes に明記 |

### 7.4.1 Design Review Outcomes (2026-05-13)

`/kiro-validate-design` で抽出された 3 件の Critical Issue を design.md に反映済み。

| Issue | 対応内容 | design.md 反映箇所 |
|-------|----------|-------------------|
| #1 REQ-37 Layout Strategy が2案残置 | 採用案（操作列セル wrapper 拡張）を default、contingency 案（最上位 flex 化）を採用条件付きで併記。理由を明示 | Layout Strategy セクション |
| #2 REQ-38 並行 displayOrder 競合制御未定義 | `SELECT ... FOR UPDATE` で親 QuantityTable 行ロックを取得し serialize する方針を Concurrency Control セクションで明文化。`isolationLevel: 'Serializable'` を代替案として検討して不採用とした理由も記載 | Concurrency Control セクション、Implementation Notes |
| #3 Service Interface と API Contract のエラー型不整合 | Service Interface に `@throws OptimisticLockError` を追加。API Contract で 404/403/409 と Service 例外型のマッピングを明示し、フロント側 409 ハンドリングも記述 | Service Interface, API Contract |

### 7.5 Boundary Commitments

- **Owns**: 数量表編集画面の数量項目行レイアウト、数量グループコピー機能（フロント UI + API + Service）、計算用フィールドの配置仕様
- **Out of Boundary**: 数量項目単位のコピー（REQ-6 既実装）、別数量表へのグループ移動、写真注釈エディタの変更、数量グループ削除確認 UI の変更
- **Allowed Dependencies**:
  - 既存 `CalculationEngine`, `FieldValidator`, `QuantityValidationService`, `auditLogService` を呼び出し可能
  - 既存 `prisma.quantityGroup` / `prisma.quantityItem` テーブルへの read/write
  - 既存の `requirePermission('quantity_table:create')` ミドルウェアの再利用
- **Revalidation Triggers**:
  - 計算用フィールドの種類（W/D/H/重量/調整係数/丸め設定／範囲長/端長1/端長2/ピッチ長/長さ/重量/調整係数/丸め設定）が追加・削除された場合
  - グループ名の最大文字数仕様（REQ-22 AC4）が変更された場合
  - 別数量表へのグループ移動／コピーがスコープに加わった場合
  - 行高さ仕様（37px）が他要件で変更された場合

---

# ギャップ分析: Requirement 39〜41（数量表画面の機能追加・不具合修正）

_作成日: 2026-06-03 / 対象: 写真選択ダイアログの重なり修正（Req39）、現場調査からの数量グループ一括生成（Req40）、水平スクロール時の画像・コメント固定表示（Req41）_

## 0. 現状調査サマリ

- フロントは React 19 + TypeScript 6 + Vite。状態管理は各ページ内 `useState`/`useCallback`、APIは `frontend/src/api/*.ts` の薄いクライアント（`apiClient`）。
- バックは Express 5 + Prisma 7（Driver Adapter）。数量グループは `QuantityGroupService`（`backend/src/services/quantity-group.service.ts`）。
- スタイルはインラインの `React.CSSProperties` オブジェクト（数量表画面は Tailwind ではなくインラインstyle主体）。
- 既存E2E: `e2e/specs/quantity-tables/`（photo-comment / photo-preview / quantity-group-copy / group-sort 等）。新規3要件に対応するE2Eは未整備。

## 1. Requirement-to-Asset マップ

### Req 39: 写真選択・変更ダイアログの重なり修正
- **重要発見（Constraint）**: 実際に表示される「写真選択ダイアログ」は **`frontend/src/pages/QuantityTableEditPage.tsx` 内のインライン実装**（styles定義 283-339、描画 1830-1918、`availablePhotos.map` 1866）。写真変更（「別の写真を選択」1985-1988）も同じ `handleSelectImage` を経由し、**選択・変更とも同一のインラインダイアログ**を使う。よって Req39 の両ダイアログ対応はこのインライン1箇所の修正で満たせる。
- **Constraint（要確認）**: `frontend/src/components/quantity-table/PhotoChangeDialog.tsx` というコンポーネントは存在するが、**本番コードからは未import（参照は単体テストのみ）**。レガシー/未使用の可能性が高い。Req39の修正対象は本体（インライン）であり、PhotoChangeDialog.tsx を残す/直す/削除するかは設計判断事項。
- 現状レイアウト: `photoGrid = { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px,1fr))', gap:'12px', overflowY:'auto', flex:1 }`、`photoItem = { aspectRatio:'1', overflow:'hidden' }`、`photoImage = { width:'100%', height:'100%', objectFit:'cover' }`。
- **Gap（Missing）**: 枚数増加時の「重なり」を確実に防ぐ行高さ制御（`gridAutoRows` 未指定で `aspectRatio` 由来の高さがロウに正しく伝わらないケース）。重なり根本原因の特定は設計/実装フェーズで実機確認が必要（Research Needed）。
- データ取得は実装済（`handleSelectImage` 746-792: `getSiteSurveys()` → 各 `getSiteSurvey()` をバッチ取得 → `setAvailablePhotos`）。レイアウトのみが論点。

### Req 40: 現場調査からの数量グループ一括生成（新規）
- **データモデル（Asset）**: `backend/prisma/schema.prisma` の `QuantityGroup` … `name?`、`surveyImageId?`、`displayOrder`（`@@index([quantityTableId, displayOrder])`）。1グループ＝写真1枚（`surveyImageId` 単一）で Req40 と整合。
- **既存API（Asset）**:
  - 単一作成: `createQuantityGroup(tableId, {name, surveyImageId?, displayOrder})`（`api/quantity-tables.ts` 288、`CreateQuantityGroupInput` 261）。
  - 一括複製の参考: `copyQuantityGroup` / `QuantityGroupService.copy()`（トランザクション＋`displayOrder`シフト＋`createMany`）→ Req40 の**原子的な複数作成＋ロールバック（Req40 AC12）**の実装パターンとして流用可能。
  - 一括保存: `bulkSaveQuantityTable`（`/api/quantity-tables/{id}/bulk-save`）も複数グループ同時更新の参考。
- **現場調査側（Asset）**: `getSiteSurveys()`（プロジェクトの現場調査一覧）、`getSiteSurvey()`（`images` 配列、`displayOrder` 付き）。「全写真（注釈有無問わず）」を写真順に取得可能。
- **UI追加先（Asset）**: `QuantityTableEditPage.tsx` の「グループを追加」ボタン近辺（427 / 1729-1734）。隣に「現場調査から一括追加」ボタン＋現場調査選択ダイアログを新設。
- **Gap（Missing）**:
  - グループ名「{現場調査名} 連番」生成＋最大文字数切り詰め（Req22 AC4）ロジック。
  - 既存末尾追加（`max(displayOrder)+1` 起点）の連番採番。
  - 写真0枚時のメッセージ（AC10）、進捗インジケーター・重複防止（AC11）、エラーロールバック（AC12）。

### Req 41: 水平スクロール時の画像・コメント固定表示
- **DOM/CSS（Constraint）**: `frontend/src/components/quantity-table/QuantityGroupCard.tsx` … カード（`styles.card`、103-114付近）に `overflowX:'auto'` が掛かり、`photoArea`（画像＋コメント、`display:flex`、292-298 / 793-856）と数量項目テーブル行群が**同一の水平スクロールコンテナ内**にある。これが「右スクロールで画像・コメントが左へ消える」根本原因。
- `PhotoCommentDisplay.tsx`（画像右に表示、25-36 は `overflowY:auto` のみ、水平固定なし）。
- グリッド: `gridConstants.ts` の `QUANTITY_ITEM_GRID_COLUMNS`（合計≈1264px、常に横はみ出し→水平スクロール必須。Req37 計算用フィールドで更に拡大）。
- **Gap（Missing）**: 水平スクロール対象を「数量項目テーブルのみ」に限定し、`photoArea`（画像＋コメント＋写真変更ボタン）をスクロール外へ。折りたたみ（Req3 AC4 / Req21 AC5、content の `maxHeight` 制御 248-263）との両立が必要。

## 2. 実装アプローチ（A/B/C）

### Req 39
- **Option A（推奨・Extend）**: インライン `photoGrid`/`photoItem` のCSSを修正し重なり解消（`gridAutoRows` 明示、行高さ固定 or `minmax` 見直し）。最小変更・既存パターン踏襲。
  - ✅ 低コスト/低リスク ❌ 実機での重なり再現・原因特定が前提。
- Option B（New）: 写真一覧を専用コンポーネント化（未使用 `PhotoChangeDialog.tsx` を整理して採用）。再利用性向上だが本要件にはオーバースペック。
- **Effort: S / Risk: Low**（CSS修正＋実機確認）。

### Req 40
- **Option B（推奨・New backend endpoint + New frontend UI）**: バックに「現場調査から一括生成」エンドポイント（`POST /api/quantity-tables/{id}/groups/from-survey` 等）を新設し、`copy()` 同様のトランザクションで N グループ＋写真紐づけ＋連番命名を原子的に作成（AC12 ロールバック満たす）。フロントは選択ダイアログ＋一覧再取得。
  - ✅ 原子性・ロールバック・性能（1リクエスト） ❌ 新規API設計・テスト。
- Option A（Extend/フロント主導）: フロントから `createQuantityGroup` を N 回ループ。実装は軽いが**部分失敗時のロールバック（AC12）が困難**で非推奨。
- **Effort: M / Risk: Medium**（新規API＋UI＋トランザクション、既存 `copy()` を流用できるためMedium）。

### Req 41
- **Option A（推奨・Extend）**: `QuantityGroupCard` の構造を分割し、`overflowX:'auto'` を**数量項目テーブルのラッパーへ移動**、`photoArea` はスクロール外（カード直下のflex列）に配置。
  - ✅ 構造が素直・折りたたみと両立しやすい ❌ DOM再構成の影響範囲（ストーリー/テスト）確認要。
- Option B（Extend/sticky）: `photoArea` に `position:sticky; left:0`。変更は小さいが、スクロールコンテナと背景の重なり・z-index調整が必要で崩れやすい。
- **Effort: M / Risk: Medium**（レイアウト再構成＋実機での横スクロール挙動確認）。

## 3. 設計フェーズへの引き継ぎ（Research Needed）

- **[Req39]** 写真「重なり」の実機再現と根本原因の確定（grid行高さ/aspect-ratio/コンテナ高さの相互作用）。修正後はビューポート幅（狭幅含む）で重なりゼロを確認。
- **[Req39]** `PhotoChangeDialog.tsx`（未使用疑い）の扱い（残置/修正/削除）を決定。
- **[Req40]** 一括生成APIの形（エンドポイント・入出力・トランザクション境界・既存 `copy()` ロジック再利用範囲）。現場調査写真の「全写真（注釈有無問わず）」取得経路と写真順序（`displayOrder`）の確定。
- **[Req40]** 連番命名と最大文字数切り詰め規則（Req22 AC4 / Req38 AC6 と整合）。
- **[Req41]** スクロールコンテナ分割後の折りたたみ（content `maxHeight`）・垂直スクロール・Req37 計算用フィールド水平展開との同時成立。
- **共通**: 3要件すべて Req に対応するE2E（`e2e/specs/quantity-tables/`）の新規追加が必要（要件はE2E動作確認まで完了としない方針）。

## 4. 推奨まとめ

| 要件 | 推奨アプローチ | Effort | Risk | 主な再利用資産 |
|------|----------------|--------|------|----------------|
| Req39 | A: インラインダイアログCSS修正 | S | Low | `QuantityTableEditPage` photoGrid/photoItem |
| Req40 | B: 一括生成API新設＋選択UI | M | Medium | `QuantityGroupService.copy()`、`getSiteSurvey(s)` |
| Req41 | A: 水平スクロールをテーブルへ限定 | M | Medium | `QuantityGroupCard` photoArea/content 構造 |

## 5. 設計シンセシス結果（design 反映済み・2026-06-03）

- **採用アプローチ**: Req39=A（インラインダイアログCSS修正）、Req40=B（バックエンド一括生成API新設＋SurveySelectDialog）、Req41=A（水平スクロールをテーブルラッパーへ限定）。
- **一般化（共有化）**: グループ連番命名 `buildGroupNameFromSurvey` は REQ-38 のコピー命名（`truncateForCopy`、REQ-22 AC4 の文字数規則）を汎用化して共有する（重複ロジックを作らない）。
- **Build-vs-Adopt**: Req40 のトランザクション一括生成は新規実装だが、`QuantityGroupService.copy()` の「トランザクション＋createMany＋displayOrderシフト」パターンを踏襲（新パターンを発明しない）。
- **簡素化**: Req41 は `position: sticky` ではなくスクロールコンテナ分割で実現（z-index/背景重なりの複雑性を回避）。Req39 は専用コンポーネント新設せずインライン修正に限定（未使用 `PhotoChangeDialog.tsx` は残置）。

### Boundary Commitments（REQ-39〜41）

- **Owns**: 写真選択インラインダイアログのレイアウト（Req39）、現場調査からの数量グループ一括生成のフロント/API/Service（Req40）、QuantityGroupCard の水平スクロール構造と画像・コメント固定表示（Req41）。
- **Out of Boundary**: 写真取得方式の変更・仮想スクロール化（Req39）、一括生成時の数量項目自動生成（Req40）、縦方向固定/テーブルヘッダー固定（Req41）、`PhotoChangeDialog.tsx` の改修・削除。
- **Allowed Dependencies**: 既存 `getSiteSurveys`/`getSiteSurvey`（写真・displayOrder）、`QuantityGroupService`（copy パターン）、`auditLogService`、`requirePermission('quantity_table:create')`、既存 PhotoCommentDisplay/REQ-21・35 のコメント表示ロジック。
- **Revalidation Triggers**:
  - 写真一覧の取得方式（`handleSelectImage` のバッチ取得）が変更された場合（Req39）。
  - 現場調査写真の順序（`displayOrder`）やモデルが変更された場合（Req40）。
  - グループ名の最大文字数仕様（REQ-22 AC4）や REQ-38 命名ロジックが変更された場合（Req40）。
  - `QuantityGroupCard` の折りたたみ（content `maxHeight`）や REQ-37 計算用フィールドの水平展開仕様が変更された場合（Req41）。

## 6. デザインレビュー反映（2026-06-03 / kiro-validate-design）

GO（条件付き）。指摘3点を design.md に反映済み：
- **[Req40]** 一括生成に REQ-38 と同一の `SELECT FOR UPDATE` 直列化を明記（コンポーネント・フロー・統合テストに追加）。displayOrder 衝突を防止。
- **[Req39]** 実装の最初のステップを「実機での重なり再現＋DevTools 原因特定（root-cause-first）」とし、CSS確定はその結果に従う旨を明記。
- **[Req39]** 重なりの矩形判定（`getBoundingClientRect`）は jsdom 非対応のため E2E（Playwright）へ移動。単体は描画件数・スタイル適用の検証に限定（第3原則: 前提による無効化を回避）。

---

## ギャップ分析: Requirement 42〜45（クライアントサイド編集・離脱ガード・未保存インジケーター・固定ヘッダー）

_実施日: 2026-06-04 / 対象: Requirement 42・43・44・45（数量表編集画面の編集モデル変更とUI改善）_

### 現状サマリー

数量表編集画面の現行アーキテクチャは「**操作即サーバー反映 ＋ 項目フィールドのみ保存ボタンで bulk-save**」というハイブリッド構成。要望は「すべての編集をクライアントサイドで行い、保存ボタン押下時のみサーバー反映」への転換。

- **最重要ブロッカー**: 既存 `PUT /api/quantity-tables/{id}/bulk-save` は**既存項目（item）の更新のみ**対応。グループ/項目の作成・削除、グループ並び替え・名称変更・写真紐づけは非対応。Req 42 実現にはバックエンドの保存エンドポイント拡張（フル状態同期）が必須。
- **離脱ガード/未保存追跡**: 再利用可能な実装が既存（`useUnsavedChanges` フック、`useBlocker`）。Req 43・44 は低リスク。
- **固定ヘッダー**: 既存に `position: fixed/sticky` パターンあり。Req 45 は低リスク。
- **E2E**: 数量表系 E2E が約25本存在。多くが「操作即時反映」を前提としており、編集モデル変更で広範に改修が必要。

### Requirement → 資産マップ（ギャップタグ: Missing / Unknown / Constraint）

| 要件 | 必要な技術要素 | 既存資産 | ギャップ |
|------|----------------|----------|----------|
| Req 42（クライアント編集・明示保存） | フル状態を一括永続化する保存API（グループ/項目の作成・削除・並び替え・名称・写真紐づけ・項目値を差分適用） | `bulk-save`（項目更新のみ）、`prisma.$transaction`、`expectedUpdatedAt` 楽観ロック | **Missing**: グループ作成/削除/並び替え/名称/写真、項目作成/削除を bulk-save が未サポート（`backend/src/services/quantity-table.service.ts` 689–820、`routes/quantity-tables.routes.ts` 663–697、zod schema 81–114） |
| Req 42（フロント） | 全編集をクライアント状態にのみ反映 → 保存時に一括送信。新規行のクライアント仮ID | `QuantityTableEditPage.tsx`（`useState` 中心、`quantityTable` 単一オブジェクト state） | **Missing**: 即時API呼び出しが約11ハンドラ（rename/add item/delete item/copy item/move group/photo select/import/from-survey 等）。**仮ID未導入**（新規行は常にサーバー採番UUID） |
| Req 43（離脱ガード） | 画面遷移/タブクローズ/リロード時の警告 | `useUnsavedChanges`（`hooks/useUnsavedChanges.ts`、beforeunload対応）、`useBlocker(isDirty)`（CompanyInfoPage・ItemizedStatementDetailPage・SiteSurveyDetailPage で実績） | **なし**（パターン流用で実装可能） |
| Req 44（未保存インジケーター） | dirty 状態の可視化 | 同上 `isDirty`/`markAsChanged`/`markAsSaved` | **なし**（インジケーターUIの追加のみ） |
| Req 45（固定ヘッダー） | ヘッダー操作ボタン群の sticky 表示 | `EstimateDetailPage`/`ScheduleListPage`/`SiteSurveyDetailPage` の `position: fixed/sticky` 実績。`QuantityTableEditPage` ヘッダーは inline style（64–117, 1773–1865） | **Constraint**: 祖先に `overflow` を持つスクロールコンテナがあると sticky が効かない点を design で確認（現状 main は padding のみで scroll wrapper なし＝直接 sticky 可） |

### 実装アプローチ（バックエンド保存API — Req 42 の核心）

#### Option A: 既存 bulk-save を「フル状態同期」に拡張（推奨）
`bulk-save` のペイロードを「数量表の全グループ・全項目の最終状態」に拡張し、サーバー側で DB 現状とのdiffを取り、作成/更新/削除/並び替え/名称/写真紐づけをトランザクション内で適用。クライアント仮ID（`temp-` 接頭辞等）を新規行のマーカーとして受理し、レスポンスで採番済みIDを返却。
- ✅ 単一エンドポイント・単一トランザクションで原子性・楽観ロック（`expectedUpdatedAt`）を維持。ネットワーク往復が保存1回に集約され Req 42 の意図に最も忠実
- ✅ 既存の個別エンドポイント（create/delete/copy/reorder）は移行期に温存可能
- ❌ サーバー側 diff/upsert/削除ロジックとスキーマ拡張が必要（zod 全面改訂）。コピー時のサーバー採番ロジック（写真複製等）をクライアント or 保存APIへ移設
- **Effort: L（1〜2週間）／Risk: Medium**（トランザクション境界・楽観ロック・displayOrder衝突・写真複製の移設が要設計）

#### Option B: 既存個別エンドポイントをクライアントがバッチ順次呼び出し（保存時にまとめて）
保存ボタン押下時にクライアントが差分を計算し、既存の create/update/delete/reorder/copy API を順次（または並列）呼び出す。
- ✅ バックエンド改修最小
- ❌ 複数リクエストで原子性・整合性が崩れやすい（途中失敗で部分反映）。Req 42 AC9（失敗時に編集状態を保持して再保存）や AC5（一括永続化）の担保が困難。楽観ロックも分散
- **Effort: M／Risk: High**（部分失敗・整合性が要件と衝突）

#### Option C: ハイブリッド（保存API拡張 ＋ フロント仮ID ＋ 段階移行）
Option A の保存API拡張を軸に、フロントは `useReducer` で編集状態（draft）と dirty を集中管理。仮ID導入。Req 43/44 は `useUnsavedChanges`+`useBlocker` を流用、Req 45 は sticky 追加。E2E は段階的に「保存押下後に検証」へ移行。
- ✅ 要件全体（42〜45）を一貫実装。フロント状態の集中管理でテスト容易性も向上
- ❌ 計画・調整が最も大きい
- **Effort: XL（2週間+）／Risk: Medium**

### Effort / Risk まとめ

| 項目 | Effort | Risk | 一言根拠 |
|------|--------|------|----------|
| 保存API拡張（フル状態同期） | L | Medium | diff/削除/並び替え/写真複製の移設と楽観ロック維持 |
| フロント編集状態のドラフト化＋仮ID | L | Medium | 約11ハンドラの即時API除去＋単一 state を draft/dirty へ再設計 |
| 離脱ガード（Req43） | S | Low | `useBlocker(isDirty)` 流用 |
| 未保存インジケーター（Req44） | S | Low | `useUnsavedChanges` 流用＋UI追加 |
| 固定ヘッダー（Req45） | S | Low | sticky 付与（祖先 overflow のみ確認） |
| E2E 改修（約25本） | M〜L | High | 「即時反映」前提の検証を「保存後反映」へ全面見直し |

### 設計フェーズへの申し送り（Research Needed）

1. **保存ペイロード契約の確定**（Option A 前提）: グループ/項目の作成・更新・削除・並び替え・名称・写真紐づけを表現するスキーマ。新規行の仮ID表現とレスポンスでのID解決方式。
2. **コピー/一括生成のサーバー処理移設**: 現行サーバー側のグループコピー（写真複製含む）・現場調査一括生成のロジックを、クライアント仮ID生成＋保存API側の確定処理へどう分割するか（写真の参照は surveyImageId 紐づけのみで複製不要か要確認）。
3. **楽観ロック整合**: 編集中の長時間化で `expectedUpdatedAt` 競合が増える。保存失敗時の編集状態保持（Req42 AC9）と再取得・マージ方針。
4. **dirty 判定の粒度**: フィールド単位の deep compare か、操作発生フラグか（`useUnsavedChanges` の `markAsChanged` 流用範囲）。
5. **固定ヘッダーと既存スクロール領域（Req41 の水平スクロール固定、Req25 のスクロールバー）との干渉確認**。
6. **E2E 移行方針**: 既存約25本のうち編集モデル変更の影響範囲を design で列挙し、「保存後に検証」へ統一（第3原則: 前提無効化を避け、失敗で顕在化させる）。

### 推奨

- **保存API**: Option A（bulk-save のフル状態同期化）を軸に、フロントは Option C のドラフト集中管理を採用。Req 42 の原子性・楽観ロック・「保存時のみ永続化」を最も忠実に満たす。
- **Req 43/44/45** は既存パターン流用で低リスク・小工数。先行実装も可能だが、Req 42 のフロント状態再設計（dirty 管理）と密結合のため、design で 42 と一体設計するのが望ましい。

### 設計シンセシス結果（2026-06-04 / kiro-spec-design）

- **一般化（Generalization）**: グループ/項目の add/delete/copy/reorder・名称・写真紐づけ・一括生成・取り込みという多数の編集操作を、「数量表の全状態をドラフトで保持し保存時に1回同期する」単一の書き込みパス（`QuantityTableService.saveDraft`／`PUT /api/quantity-tables/:id/save`）へ一般化。個別ミューテーションAPIは編集フローから不要化。
- **採用 vs 構築（Build vs Adopt）**: 離脱ガード・dirty 追跡は既存 `useUnsavedChanges` フックと React Router v7 `useBlocker` を採用（CompanyInfoPage/ItemizedStatementDetailPage/SiteSurveyDetailPage で実績）。固定ヘッダーは EstimateDetailPage/SiteSurveyDetailPage の sticky/fixed パターンを採用。新規構築は saveDraft の差分同期ロジックとドラフト reducer のみ。
- **単純化（Simplification）**: 二重書き込みパス（即時API＋bulk-save）を解消し、編集画面の書き込みを saveDraft 一本へ統一。tempId→実IDの idMap は持たず、保存レスポンスの全状態でドラフトを置換して解決（状態の単純化）。グループコピー/一括生成のサーバー側ロジックはクライアントのドラフト複製/生成へ移し、写真は surveyImageId 参照のみ（blob複製なし）。
- **設計決定**: saveDraft は `SELECT FOR UPDATE`＋`expectedUpdatedAt` 楽観ロック＋単一 `$transaction` で REQ-38/40 と同一の直列化方針を維持。保存失敗時はドラフト保持で再保存（REQ-42 AC9）。

### デザインレビュー反映（2026-06-04 / kiro-validate-design）

GO（条件付き・指摘は反映済み）。実コード検証（useUnsavedChanges/useBlocker/bulkSave/sticky祖先overflow/権限）の結果、設計の前提は概ね正確だったが2点の事実不一致を検出し design.md を修正：
- **[REQ-42 権限]** 書き込み系の権限は実コードでは `requirePermission('quantity_table:update')`。saveDraft の記載を `quantity_table:write` から `quantity_table:update` へ修正。
- **[REQ-42 並行制御]** 既存 `bulkSave` は FOR UPDATE なし・楽観ロックのみ。REQ-42 で copy/from-survey がクライアント化し saveDraft が唯一の書き込み手段になるため、楽観ロック（`expectedUpdatedAt`）を主とし FOR UPDATE は任意と明記（フロー・サービス・統合テストを整合）。
- **[未対応・申し送り]** 既存 Security セクションの `quantity_table:write` 表記（インポートClaude Vision／オートコンプリートは `:read`）は本変更スコープ外の既存不整合。タスク化時に実権限名と突合すること。
- 検証で確定: useUnsavedChanges は beforeunload のみ（useBlocker 非呼び出し）→ `useBlocker(isDirty)` との二重登録なし。sticky の祖先に overflow コンテナなし（main は padding のみ）。
