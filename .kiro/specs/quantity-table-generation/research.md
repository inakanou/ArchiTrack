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
