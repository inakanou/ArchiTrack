# Technical Design Document

## Overview

**Purpose**: 見積書作成機能は、建設工事における見積書の作成・管理を効率化し、業者からの見積金額を元に実行予算を策定し、顧客へ提出する見積書を生成するための機能を提供する。見積項目は3行1セット（見積金額行・実行金額行・業者金額行）の構造を持ち、階層的なネスト構造により建設工事特有の工事区分に対応する。

**Users**: 積算担当者が、業者見積の取りまとめ、実行予算の策定、顧客提出用見積書の作成に使用する。

**Impact**: プロジェクト管理機能に見積書セクションを追加し、内訳書・見積依頼・受領見積書エンティティと連携する新規機能を実装する。

### Goals

- 3行1セット（見積・実行・業者金額行）の見積項目構造による建設業界標準の見積管理を実現する
- 階層的なネスト構造で工事区分（建築工事、電気設備工事等）に沿った見積書を作成できる
- 内訳書を参照した見積書の初期作成機能を提供する
- 受領見積書から業者金額行への転記機能を提供する
- NET金額計算と案分機能により実行予算を効率的に策定できる
- 利益率適用による見積金額への一括反映機能を提供する
- 国土交通省の公共建築工事共通費積算基準に準じた諸経費（共通仮設費・現場管理費・一般管理費）の自動計算機能を提供する
- 建設工事見積書形式でのPDF/Excel出力機能を提供する
- 高精度な10進数計算（Decimal.js）により丸め誤差を最小化する
- 見積書一覧画面と見積書詳細画面により見積書を効率的に閲覧・管理できる
- パンくずナビゲーションによりアプリケーション内の現在位置を把握しスムーズに移動できる
- プロジェクト詳細画面の見積書セクションにより関連する見積書への素早いアクセスを提供する

### Non-Goals

- 見積書のテンプレート管理機能
- 複数プロジェクトへの見積書一括適用
- 見積書の承認ワークフロー機能
- 見積書のバージョン管理・差分比較機能
- 外部会計システムとの連携
- OCRによる紙見積書の自動読み取り

## Architecture

### Existing Architecture Analysis

本機能は既存のArchiTrackアーキテクチャを踏襲し、以下のパターンに従う:

- **バックエンド**: Express 5.2 + Prisma 7 + TypeScript（サービス層パターン）
- **フロントエンド**: React 19 + Vite 7 + TypeScript
- **データベース**: PostgreSQL 15（論理削除、楽観的排他制御）
- **認証・認可**: JWT認証 + RBAC権限管理

**既存パターンの活用**:
- 内訳書機能（`itemized-statement`）のCRUDパターンを参考に実装
- 数量表機能（`quantity-table`）の階層データ管理パターンを参考に実装
- 計算エンジン（`calculation-engine.ts`）のDecimal.js高精度計算パターンを再利用・拡張
- Excel出力（`export-excel.ts`）のSheetJSパターンを見積書形式に拡張
- PDF出力は既存の`jspdf`ライブラリを建設工事見積書形式に拡張
- 見積依頼機能（`estimate-request`）の受領見積書連携パターンを活用

**連携データモデル**:
- `ItemizedStatement`: 見積書の初期作成時に内訳書から項目を参照
- `ReceivedQuotation` / `ReceivedQuotationLineItem`: 業者金額行への転記元
- `Project`: 見積書の親エンティティ

### Architecture Pattern & Boundary Map

```mermaid
graph TB
    subgraph Frontend_Pages[Frontend - Pages]
        ProjectDetailPage[ProjectDetailPage]
        EstimateListPage[EstimateListPage]
        EstimateCreatePage[EstimateCreatePage]
        EstimateDetailPage[EstimateDetailPage]
        EstimateEditPage[EstimateEditPage]
    end

    subgraph Frontend_SectionComponents[Frontend - Section Components]
        EstimateSectionCard[EstimateSectionCard]
        EstimateCard[EstimateCard]
        Breadcrumb[Breadcrumb]
    end

    subgraph Frontend_EstimateComponents[Frontend - Estimate Components]
        EstimateItemTable[EstimateItemTable]
        EstimateItemRow[EstimateItemRow]
        NetCalculationPanel[NetCalculationPanel]
        ProfitRatePanel[ProfitRatePanel]
        OverheadCostPanel[OverheadCostPanel]
        EstimateExportDialog[EstimateExportDialog]
    end

    subgraph Backend
        EstimateRoutes[estimate.routes]
        EstimateService[estimate.service]
        EstimateItemService[estimate-item.service]
        EstimateCalculationService[estimate-calculation.service]
        OverheadCostService[overhead-cost.service]
        EstimateExportService[estimate-export.service]
    end

    subgraph Database
        Estimate[Estimate Model]
        EstimateItem[EstimateItem Model]
        EstimateItemLine[EstimateItemLine Model]
        Project[Project Model]
        ItemizedStatement[ItemizedStatement Model]
        ReceivedQuotation[ReceivedQuotation Model]
    end

    ProjectDetailPage --> EstimateSectionCard
    EstimateSectionCard --> EstimateCard
    EstimateSectionCard --> EstimateListPage
    EstimateListPage --> EstimateCard
    EstimateListPage --> Breadcrumb
    EstimateListPage --> EstimateCreatePage
    EstimateListPage --> EstimateDetailPage
    EstimateDetailPage --> Breadcrumb
    EstimateDetailPage --> EstimateEditPage

    EstimateDetailPage --> EstimateItemTable
    EstimateDetailPage --> NetCalculationPanel
    EstimateDetailPage --> ProfitRatePanel
    EstimateDetailPage --> OverheadCostPanel
    EstimateDetailPage --> EstimateExportDialog

    EstimateItemTable --> EstimateItemRow

    EstimateCreatePage --> EstimateRoutes
    EstimateDetailPage --> EstimateRoutes
    EstimateEditPage --> EstimateRoutes

    EstimateRoutes --> EstimateService
    EstimateRoutes --> EstimateItemService
    EstimateRoutes --> EstimateCalculationService
    EstimateRoutes --> OverheadCostService
    EstimateRoutes --> EstimateExportService

    EstimateService --> Estimate
    EstimateItemService --> EstimateItem
    EstimateItemService --> EstimateItemLine
    EstimateItemService --> ReceivedQuotation

    Estimate --> Project
    Estimate --> ItemizedStatement
```

**Architecture Integration**:
- Selected pattern: レイヤードアーキテクチャ（既存パターン踏襲）
- Domain boundaries: 見積書はプロジェクトドメインの拡張として配置
- Existing patterns preserved: サービス層パターン、論理削除、楽観的排他制御、Decimal.js高精度計算
- New components rationale: 3行1セット構造、ネスト階層管理、NET金額案分計算、諸経費自動計算は見積書固有のビジネスロジック
- Steering compliance: TypeScript strict mode、Prisma 7 Driver Adapter

### Technology Stack

| Layer | Choice / Version | Role in Feature | Notes |
|-------|------------------|-----------------|-------|
| Frontend | React 19.2 + TypeScript 5.9 | UI/UX実装 | 既存パターン踏襲 |
| Backend | Express 5.2 + TypeScript 5.9 | API実装 | 既存パターン踏襲 |
| Data | PostgreSQL 15 + Prisma 7 | データ永続化 | 新規テーブル追加（Estimate, EstimateItem, EstimateItemLine） |
| Calculation | Decimal.js 10.6 | 高精度10進数計算 | 既存パターン拡張（NET金額案分、諸経費計算） |
| Excel | xlsx 0.20.3 (SheetJS) | Excel出力 | 既存パターン拡張（見積書形式） |
| PDF | jsPDF 4.0.0 | PDF出力 | 既存パターン拡張（見積書形式） |

## System Flows

### 見積書新規作成フロー

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant UI as 見積書作成画面
    participant API as Backend API
    participant DB as PostgreSQL

    User->>UI: 新規作成ボタンクリック
    UI->>API: GET /api/projects/:projectId/itemized-statements
    API->>DB: プロジェクトの内訳書取得
    DB-->>API: 内訳書一覧
    API-->>UI: 内訳書一覧
    User->>UI: 内訳書選択（任意）
    User->>UI: 見積書名入力
    User->>UI: 作成ボタンクリック
    UI->>API: POST /api/projects/:projectId/estimates
    API->>DB: 見積書作成
    alt 内訳書選択あり
        API->>DB: 内訳書項目から見積金額行を初期作成
    end
    DB-->>API: 作成結果
    API-->>UI: 201 Created
    UI->>UI: 詳細画面へ遷移
```

### 受領見積書転記フロー

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant UI as 見積書編集画面
    participant API as Backend API
    participant DB as PostgreSQL

    User->>UI: 転記ボタンクリック
    UI->>API: GET /api/projects/:projectId/received-quotations
    API->>DB: プロジェクトの受領見積書取得
    DB-->>API: 受領見積書一覧
    API-->>UI: 受領見積書一覧（明細行含む）
    User->>UI: 受領見積書選択
    User->>UI: 転記先見積項目選択（任意）
    User->>UI: 転記実行ボタンクリック
    UI->>API: POST /api/estimates/:id/transfer-quotation
    API->>DB: 業者金額行に受領見積書明細を転記
    alt 転記先未指定
        API->>DB: 新規見積項目作成
    end
    DB-->>API: 転記結果
    API-->>UI: 200 OK（更新後の見積項目）
    UI->>UI: 見積項目テーブル再描画
```

### NET金額計算・案分フロー

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant UI as NET金額計算パネル
    participant ClientCalc as EstimateCalculator（Client）
    participant API as Backend API
    participant DB as PostgreSQL

    User->>UI: 対象業者選択
    User->>UI: 案分対象行選択
    User->>UI: 除外諸経費行指定
    User->>UI: NET金額入力
    UI->>ClientCalc: プレビュー計算（API呼び出しなし）
    ClientCalc->>ClientCalc: 除外行を除いた合計算出
    ClientCalc->>ClientCalc: 各行の按分率計算
    ClientCalc->>ClientCalc: 按分後単価計算（Decimal.js）
    ClientCalc-->>UI: プレビュー結果
    UI->>UI: プレビュー表示（案分率・金額）
    User->>UI: 案分実行ボタンクリック
    UI->>API: POST /api/estimates/:id/calculate-net
    API->>DB: 実行金額行を一括更新
    DB-->>API: 更新結果
    API-->>UI: 200 OK（更新後の見積項目）
    UI->>UI: 確定結果表示
```

**ポイント**: NET金額入力時のプレビューはクライアントサイドで即時計算。「案分実行」ボタン押下時のみバックエンドAPIを呼び出し、一括更新を実行。

### 諸経費自動計算フロー

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant UI as 諸経費計算パネル
    participant Calc as OverheadCostService
    participant API as Backend API
    participant DB as PostgreSQL

    User->>UI: 諸経費行追加ボタンクリック
    UI->>UI: 諸経費種別選択（共通仮設費/現場管理費/一般管理費）
    UI->>UI: 計算パラメータ入力（直接工事費P、工期T等）
    User->>UI: 自動計算ボタンクリック
    UI->>API: POST /api/estimates/:id/calculate-overhead
    API->>Calc: 諸経費計算
    Calc->>Calc: 国土交通省基準の計算式適用
    Calc->>Calc: 共通仮設費率: Kr = Exp(a - b * loge(P) + c * loge(T))
    Calc->>Calc: 現場管理費率: Jo = Exp(a - b * loge(Np))
    Calc->>Calc: 一般管理費等率: Gp = Exp(a - b * loge(Cp))
    Calc-->>API: 計算結果
    API->>DB: 諸経費行を作成/更新
    DB-->>API: 更新結果
    API-->>UI: 200 OK（計算結果）
    UI->>UI: 諸経費行表示更新
```

### 見積書出力フロー

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant UI as 見積書詳細画面
    participant Export as EstimateExportService
    participant API as Backend API

    User->>UI: 出力ボタンクリック
    UI->>UI: 出力対象チェックボックス選択（見積/実行/業者、複数選択可）
    UI->>UI: 出力形式選択（Excel/PDF、デフォルトExcel）
    User->>UI: 出力実行ボタンクリック
    UI->>API: GET /api/estimates/:id/export?format=xlsx&lineTypes=ESTIMATE,EXECUTION
    API->>Export: 見積書出力生成（選択行タイプの列を横1列に結合）
    Export->>Export: P1: 表紙生成
    Export->>Export: P2: 第1階層項目一覧（行タイプ別プレフィックス付き列名）
    Export->>Export: P3以降: 各階層の子項目一覧
    Export-->>API: ファイルバイナリ
    API-->>UI: ファイルダウンロード
    UI->>UI: ファイル保存ダイアログ
```

## Requirements Traceability

| Requirement | Summary | Components | Interfaces | Flows |
|-------------|---------|------------|------------|-------|
| 1.1-1.6 | 見積書基本構造 | EstimateItem, EstimateItemLine, EstimateItemTable, EstimateItemRow | GET/POST /api/estimates/:id/items | 項目CRUD |
| 2.1-2.6 | 見積項目ネスト構造 | EstimateItem (parentId), EstimateItemTable | GET /api/estimates/:id/items?hierarchy=true | 階層表示 |
| 3.1-3.5 | 見積書新規作成と内訳書連携 | EstimateCreatePage, EstimateService | POST /api/projects/:id/estimates | 作成フロー |
| 4.1-4.5 | 受領見積書転記 | TransferQuotationDialog, EstimateItemService | POST /api/estimates/:id/transfer-quotation | 転記フロー |
| 5.1-5.7 | NET金額計算と案分 | NetCalculationPanel, EstimateCalculationService | POST /api/estimates/:id/calculate-net | NET計算フロー |
| 6.1-6.6 | 利益率による見積金額反映 | ProfitRatePanel, EstimateCalculationService | POST /api/estimates/:id/apply-profit-rate | 利益率適用 |
| 7.1-7.6 | 共通仮設費プリセット | OverheadCostPanel, OverheadCostService | POST /api/estimates/:id/calculate-overhead | 諸経費計算フロー |
| 8.1-8.6 | 現場管理費プリセット | OverheadCostPanel, OverheadCostService | POST /api/estimates/:id/calculate-overhead | 諸経費計算フロー |
| 9.1-9.6 | 一般管理費プリセット | OverheadCostPanel, OverheadCostService | POST /api/estimates/:id/calculate-overhead | 諸経費計算フロー |
| 10.1-10.14 | 見積書出力 | EstimateExportDialog, EstimateExportService | GET /api/estimates/:id/export | 出力フロー |
| 11.1-11.7 | 見積書CRUD操作 | EstimateListPage, EstimateDetailPage, EstimateService | CRUD APIs | データ管理 |
| 12.1-12.6 | 見積項目操作 | EstimateItemTable, EstimateItemRow, EstimateItemService | /api/estimates/:id/items/* | 項目操作 |
| 13.1-13.6 | データ検証 | バリデーションスキーマ, EstimateCalculationService | 全API | バリデーション |
| 14.1-14.10 | 画面構成 | EstimateListPage, EstimateDetailPage, EstimateCard | GET /api/projects/:id/estimates, GET /api/estimates/:id | 画面遷移 |
| 15.1-15.12 | パンくずナビゲーション | Breadcrumb（共通コンポーネント利用）, EstimateListPage, EstimateCreatePage, EstimateDetailPage | - | ナビゲーション |
| 16.1-16.13 | プロジェクト詳細画面の見積書セクション | EstimateSectionCard, ProjectDetailPage | GET /api/projects/:id/estimates/latest | セクション表示 |

## Components and Interfaces

| Component | Domain/Layer | Intent | Req Coverage | Key Dependencies (P0/P1) | Contracts |
|-----------|--------------|--------|--------------|--------------------------|-----------|
| Estimate (Model) | Data | 見積書マスターデータの永続化 | 11.1-11.7 | Project (P0), ItemizedStatement (P1) | State |
| EstimateItem (Model) | Data | 見積項目（階層構造）の永続化 | 1.1-1.6, 2.1-2.6, 12.1-12.6 | Estimate (P0), EstimateItem (self, P1) | State |
| EstimateItemLine (Model) | Data | 見積項目行（見積/実行/業者）の永続化 | 1.2-1.6 | EstimateItem (P0), ReceivedQuotationLineItem (P1) | State |
| EstimateService | Backend | 見積書CRUD操作 | 11.1-11.7, 3.1-3.5, 16.3-16.5 | Prisma (P0), ItemizedStatementService (P1) | Service |
| EstimateItemService | Backend | 見積項目CRUD・転記操作 | 1.1-1.6, 4.1-4.5, 12.1-12.6 | Prisma (P0), ReceivedQuotationService (P1) | Service |
| EstimateCalculationService | Backend | NET金額案分・利益率計算 | 5.1-5.7, 6.1-6.6, 13.6 | Decimal.js (P0) | Service |
| OverheadCostService | Backend | 諸経費自動計算 | 7.1-7.6, 8.1-8.6, 9.1-9.6 | Decimal.js (P0) | Service |
| EstimateExportService | Backend | PDF/Excel出力生成 | 10.1-10.8 | jsPDF (P0), xlsx (P0) | Service |
| estimate.routes | Backend | API エンドポイント | All API reqs | Services (P0), Middleware (P0) | API |
| EstimateCalculator | Frontend | クライアントサイド金額計算 | 1.3, 2.3, 13.6 | Decimal.js (P0) | Utility |
| useEstimateEditor | Frontend | 見積書編集状態管理フック | All edit reqs | EstimateCalculator (P0), React (P0) | State |
| EstimateListPage | Frontend | 見積書一覧画面 | 14.1-14.7 | EstimateCard (P0), Breadcrumb (P0), PaginationUI (P0) | State |
| EstimateCreatePage | Frontend | 見積書作成画面 | 3.1-3.5, 15.5-15.7, 15.11 | ItemizedStatementSelect (P1), Breadcrumb (P0) | - |
| EstimateDetailPage | Frontend | 見積書詳細画面 | 14.8-14.10, 15.8-15.11 | EstimateItemTable (P0), Panels (P0), Breadcrumb (P0) | State |
| EstimateCard | Frontend | 見積書カード表示 | 14.3-14.4, 16.4-16.6 | - | - |
| EstimateSectionCard | Frontend | プロジェクト詳細画面の見積書セクション | 16.1-16.13 | EstimateCard (P0) | State |
| EstimateItemTable | Frontend | 見積項目テーブル | 1.1-1.6, 2.1-2.6 | EstimateItemRow (P0) | State |
| EstimateItemRow | Frontend | 見積項目行（3行表示） | 1.2-1.6 | - | State |
| NetCalculationPanel | Frontend | NET金額計算UI | 5.1-5.7 | EstimateCalculationService (P0) | State |
| ProfitRatePanel | Frontend | 利益率適用UI | 6.1-6.6 | EstimateCalculationService (P0) | State |
| OverheadCostPanel | Frontend | 諸経費計算UI | 7.1-9.6 | OverheadCostService (P0) | State |
| EstimateExportDialog | Frontend | 出力形式選択UI | 10.1-10.8, 32.1-32.4 | EstimateExportService (P0) | - |
| LineTypeFilter | Frontend | 行タイプ表示/非表示フィルター | 28.1-28.4 | EstimateItemTable (P0) | State |
| EstimateItemToolbar | Frontend | 見積項目操作ツールバー | 23.1-23.10 | useEstimateEditor (P0) | Props |

### Data Layer

#### Estimate (Prisma Model)

| Field | Detail |
|-------|--------|
| Intent | 見積書のマスターデータを永続化 |
| Requirements | 11.1-11.7, 3.1-3.5 |

**Responsibilities & Constraints**
- プロジェクトに紐付く見積書データの管理
- 論理削除（deletedAt）による削除管理
- 楽観的排他制御（updatedAt）による同時更新防止
- 内訳書参照情報の保持（sourceItemizedStatementId）

**Dependencies**
- Inbound: EstimateItem — 見積項目の親 (P0)
- Outbound: Project — プロジェクトへの紐付け (P0)
- Outbound: ItemizedStatement — 参照内訳書（任意） (P1)

**Contracts**: State [x]

##### State Management

```typescript
interface Estimate {
  id: string;
  projectId: string;
  name: string; // 見積書名（必須、最大200文字）
  sourceItemizedStatementId: string | null; // 参照内訳書ID（任意）
  sourceItemizedStatementName: string | null; // 参照内訳書名（スナップショット）
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null; // 論理削除
}
```

#### EstimateItem (Prisma Model)

| Field | Detail |
|-------|--------|
| Intent | 見積項目（階層構造）を永続化 |
| Requirements | 1.1-1.6, 2.1-2.6, 12.1-12.6 |

**Responsibilities & Constraints**
- 見積項目の階層構造（parentId によるself-reference）
- 表示順序（displayOrder）の管理
- 子項目を持つ場合は金額が子項目の合計として自動計算される

**Dependencies**
- Inbound: EstimateItemLine — 3行1セットの行データ (P0)
- Inbound: EstimateItem (children) — 子項目 (P1)
- Outbound: Estimate — 見積書への紐付け (P0)
- Outbound: EstimateItem (parent) — 親項目（任意） (P1)

**Contracts**: State [x]

##### State Management

```typescript
interface EstimateItem {
  id: string;
  estimateId: string;
  parentId: string | null; // 親項目ID（ルート項目はnull）
  displayOrder: number; // 表示順序
  createdAt: Date;
  updatedAt: Date;
}
```

#### EstimateItemLine (Prisma Model)

| Field | Detail |
|-------|--------|
| Intent | 見積項目の3行1セット（見積/実行/業者金額行）を永続化 |
| Requirements | 1.2-1.6 |

**Responsibilities & Constraints**
- 行タイプ（ESTIMATE/EXECUTION/VENDOR）による区分
- 金額は数量×単価の自動計算（保存時に計算）
- 高精度10進数（Decimal(15, 2)）による金額精度保証
- 業者金額行は受領見積書明細行への参照を保持可能

**Dependencies**
- Outbound: EstimateItem — 見積項目への紐付け (P0)
- External: ReceivedQuotationLineItem — 転記元の受領見積書明細行（任意） (P1)

**Contracts**: State [x]

##### State Management

```typescript
enum EstimateItemLineType {
  ESTIMATE = 'ESTIMATE', // 見積金額行
  EXECUTION = 'EXECUTION', // 実行金額行
  VENDOR = 'VENDOR', // 業者金額行
}

interface EstimateItemLine {
  id: string;
  estimateItemId: string;
  lineType: EstimateItemLineType;
  name: string | null; // 名称（最大200文字）
  specification: string | null; // 規格（最大500文字）
  unit: string | null; // 単位（最大50文字）
  quantity: Decimal | null; // 数量（Decimal(15, 4)）※表示は小数2桁固定
  unitPrice: Decimal | null; // 単価（Decimal(15, 2)）※REQ-22により常に整数値（.00）として保存
  amount: Decimal | null; // 金額（自動計算、Decimal(15, 2)）※REQ-22により常に整数値（.00）として保存
  remarks: string | null; // 備考
  sourceReceivedQuotationLineItemId: string | null; // 転記元の受領見積書明細行ID
  sourceVendorName: string | null; // 転記元業者名（スナップショット）
  createdAt: Date;
  updatedAt: Date;
}
```

### Backend Services

#### EstimateService

| Field | Detail |
|-------|--------|
| Intent | 見積書のCRUD操作を提供 |
| Requirements | 11.1-11.7, 3.1-3.5 |

**Responsibilities & Constraints**
- 見積書の作成・取得・更新・削除
- 内訳書からの見積金額行初期作成
- 楽観的排他制御による同時更新防止

**Dependencies**
- Inbound: estimate.routes — APIルートから呼び出し (P0)
- Outbound: Prisma — データベースアクセス (P0)
- Outbound: ItemizedStatementService — 内訳書項目取得 (P1)
- Outbound: AuditLogService — 監査ログ記録 (P1)

**Contracts**: Service [x]

##### Service Interface

```typescript
interface EstimateServiceInterface {
  create(params: CreateEstimateParams): Promise<Result<Estimate, EstimateError>>;
  findById(id: string): Promise<Result<EstimateWithItems, EstimateError>>;
  findByProjectId(projectId: string, options?: FindOptions): Promise<Result<Estimate[], EstimateError>>;
  update(id: string, params: UpdateEstimateParams): Promise<Result<Estimate, EstimateError>>;
  delete(id: string, updatedAt: Date): Promise<Result<void, EstimateError>>;
}

interface CreateEstimateParams {
  projectId: string;
  name: string;
  sourceItemizedStatementId?: string;
}

interface UpdateEstimateParams {
  name: string;
  updatedAt: Date; // 楽観的排他制御
}
```

#### EstimateItemService

| Field | Detail |
|-------|--------|
| Intent | 見積項目のCRUD・転記操作を提供 |
| Requirements | 1.1-1.6, 4.1-4.5, 12.1-12.6 |

**Responsibilities & Constraints**
- 見積項目の作成・取得・更新・削除
- 階層構造の管理（親子関係）
- 受領見積書からの業者金額行への転記
- 表示順序の管理

**Dependencies**
- Inbound: estimate.routes — APIルートから呼び出し (P0)
- Outbound: Prisma — データベースアクセス (P0)
- Outbound: ReceivedQuotationService — 受領見積書明細行取得 (P1)

**Contracts**: Service [x]

##### Service Interface

```typescript
interface EstimateItemServiceInterface {
  createItem(estimateId: string, params: CreateItemParams): Promise<Result<EstimateItemWithLines, EstimateItemError>>;
  updateItem(id: string, params: UpdateItemParams): Promise<Result<EstimateItemWithLines, EstimateItemError>>;
  deleteItem(id: string): Promise<Result<void, EstimateItemError>>;
  reorderItems(estimateId: string, itemOrders: ItemOrder[]): Promise<Result<void, EstimateItemError>>;
  moveItem(id: string, newParentId: string | null): Promise<Result<void, EstimateItemError>>;
  duplicateItem(id: string): Promise<Result<EstimateItemWithLines, EstimateItemError>>;
  transferFromQuotation(params: TransferQuotationParams): Promise<Result<EstimateItemWithLines[], EstimateItemError>>;
  getHierarchy(estimateId: string): Promise<Result<EstimateItemHierarchy[], EstimateItemError>>;
}

interface CreateItemParams {
  parentId?: string;
  displayOrder: number;
  lines: CreateLineParams[];
}

interface TransferQuotationParams {
  estimateId: string;
  receivedQuotationId: string;
  lineItemIds: string[];
  targetEstimateItemId?: string; // 未指定時は新規項目作成
}
```

#### EstimateCalculationService

| Field | Detail |
|-------|--------|
| Intent | NET金額案分・利益率計算を提供 |
| Requirements | 5.1-5.7, 6.1-6.6, 13.6 |

**Responsibilities & Constraints**
- NET金額に基づく案分計算（Decimal.jsによる高精度計算）
- 諸経費行の除外処理
- 利益率適用による見積金額行の一括更新
- 上書きオプション（全て/空のみ/単価のみ）の処理

**Dependencies**
- Inbound: estimate.routes — APIルートから呼び出し (P0)
- Outbound: Prisma — データベースアクセス (P0)
- External: Decimal.js — 高精度10進数計算 (P0)

**Contracts**: Service [x]

##### Service Interface

```typescript
interface EstimateCalculationServiceInterface {
  calculateNet(params: CalculateNetParams): Promise<Result<CalculationResult, CalculationError>>;
  applyProfitRate(params: ApplyProfitRateParams): Promise<Result<void, CalculationError>>;
}

interface CalculateNetParams {
  estimateId: string;
  vendorName: string; // 対象業者
  targetLineIds: string[]; // 案分対象の業者金額行ID
  excludeLineIds: string[]; // 除外する諸経費行ID
  netAmount: Decimal; // NET金額
}

interface ApplyProfitRateParams {
  estimateId: string;
  profitRate: Decimal; // 利益率（0.00〜500.00%）
  overwriteOption: 'all' | 'empty_only' | 'unit_price_only';
}
```

#### OverheadCostService

| Field | Detail |
|-------|--------|
| Intent | 国土交通省基準に準じた諸経費自動計算を提供 |
| Requirements | 7.1-7.6, 8.1-8.6, 9.1-9.6 |

**Responsibilities & Constraints**
- 共通仮設費の計算（Kr = Exp(a - b * loge(P) + c * loge(T))）
- 現場管理費の計算（Jo = Exp(a - b * loge(Np))）
- 一般管理費等の計算（Gp = Exp(a - b * loge(Cp))）
- プリセット値の設定（名称、規格=空白、単位=式、数量=1）
- 手入力での上書き許可

**Dependencies**
- Inbound: estimate.routes — APIルートから呼び出し (P0)
- Outbound: Prisma — データベースアクセス (P0)
- External: Decimal.js — 高精度10進数計算 (P0)

**Contracts**: Service [x]

##### Service Interface

```typescript
enum OverheadCostType {
  COMMON_TEMPORARY = 'COMMON_TEMPORARY', // 共通仮設費
  SITE_MANAGEMENT = 'SITE_MANAGEMENT', // 現場管理費
  GENERAL_ADMIN = 'GENERAL_ADMIN', // 一般管理費
}

interface OverheadCostServiceInterface {
  calculateOverheadCost(params: CalculateOverheadParams): Promise<Result<OverheadCostResult, CalculationError>>;
  addOverheadCostItem(params: AddOverheadCostParams): Promise<Result<EstimateItemWithLines, EstimateItemError>>;
}

interface CalculateOverheadParams {
  costType: OverheadCostType;
  directCost: Decimal; // 直接工事費（P）（千円単位）
  pureConstructionCost?: Decimal; // 純工事費（Np）（千円単位）
  constructionCost?: Decimal; // 工事原価（Cp）（千円単位）
  constructionPeriod?: number; // 工期（T）（月）
  isRenovation?: boolean; // 改修工事フラグ
}

interface OverheadCostResult {
  costType: OverheadCostType;
  rate: Decimal; // 算定率（%）
  amount: Decimal; // 計算金額
  formula: string; // 計算式（トレーサビリティ用）
}
```

**Implementation Notes**
- 国土交通省「公共建築工事共通費積算基準」（令和7年改定）に準拠
- 共通仮設費率: Kr = Exp(3.346 - 0.282 * loge(P) + 0.625 * loge(T))（新営建築）
- 共通仮設費率: Kr = Exp(3.962 - 0.315 * loge(P) + 0.531 * loge(T))（改修建築）
- 各率は小数点以下第3位を四捨五入
- 金額は1,000円未満を切捨て

#### EstimateExportService

| Field | Detail |
|-------|--------|
| Intent | 見積書のPDF/Excel出力を提供（複数行タイプの同時出力対応） |
| Requirements | 10.1-10.14, 32.1-32.8 |

**Responsibilities & Constraints**
- PDF形式の見積書生成（jsPDF）
- Excel形式の見積書生成（xlsx/SheetJS）
- ページ構成: P1=表紙、P2=第1階層一覧、P3以降=子項目一覧
- 複数行タイプ（見積・実行・業者）の同時出力対応
- チェックされた行タイプの列を横1列に並べて出力
- 行タイプごとのプレフィックス付き列名で出力（見積名称、実行名称、業者名称等）
- チェックされていない行タイプの列は出力しない
- デフォルト出力形式はExcel（.xlsx）

**列名マッピング**:
- 見積: 見積名称、見積規格、見積単位、見積数量、見積単価、見積金額、見積備考
- 実行: 実行名称、実行規格、実行単位、実行数量、実行単価、実行金額、実行備考
- 業者: 業者名称、業者規格、業者単位、業者数量、業者単価、業者金額、業者備考

**Dependencies**
- Inbound: estimate.routes — APIルートから呼び出し (P0)
- Outbound: EstimateService — 見積書データ取得 (P0)
- External: jsPDF — PDF生成 (P0)
- External: xlsx — Excel生成 (P0)

**Contracts**: Service [x], API [x]

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| GET | /api/estimates/:id/export | format: 'pdf' \| 'xlsx', lineTypes: string (カンマ区切り, 例: 'ESTIMATE,EXECUTION') | File binary | 400, 404, 500 |

### API Routes

#### estimate.routes

| Field | Detail |
|-------|--------|
| Intent | 見積書関連のRESTful APIエンドポイントを提供 |
| Requirements | All API requirements |

**Contracts**: API [x]

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| GET | /api/projects/:projectId/estimates | query: page, limit, search | EstimateList | 400, 404 |
| GET | /api/projects/:projectId/estimates/latest | - | EstimateSummary | 404 |
| POST | /api/projects/:projectId/estimates | CreateEstimateRequest | Estimate | 400, 404, 409 |
| GET | /api/estimates/:id | - | EstimateWithItems | 404 |
| PUT | /api/estimates/:id | UpdateEstimateRequest | Estimate | 400, 404, 409 |
| DELETE | /api/estimates/:id | updatedAt: Date | - | 404, 409 |
| GET | /api/estimates/:id/items | hierarchy?: boolean | EstimateItem[] | 404 |
| POST | /api/estimates/:id/items | CreateItemRequest | EstimateItem | 400, 404 |
| PUT | /api/estimates/:id/items/:itemId | UpdateItemRequest | EstimateItem | 400, 404 |
| DELETE | /api/estimates/:id/items/:itemId | - | - | 404 |
| POST | /api/estimates/:id/items/:itemId/duplicate | - | EstimateItem | 404 |
| PUT | /api/estimates/:id/items/reorder | ItemOrder[] | - | 400, 404 |
| PUT | /api/estimates/:id/items/batch | BatchUpdateItemsRequest | EstimateItem[] | 400, 404, 409 |
| POST | /api/estimates/:id/transfer-quotation | TransferQuotationRequest | EstimateItem[] | 400, 404 |
| POST | /api/estimates/:id/calculate-net | CalculateNetRequest | CalculationResult | 400, 404 |
| POST | /api/estimates/:id/apply-profit-rate | ApplyProfitRateRequest | - | 400, 404 |
| POST | /api/estimates/:id/calculate-overhead | CalculateOverheadRequest | OverheadCostResult | 400, 404 |
| POST | /api/estimates/:id/overhead-items | AddOverheadItemRequest | EstimateItem | 400, 404 |
| GET | /api/estimates/:id/export | format: 'pdf' \| 'xlsx', lineTypes: string (カンマ区切り) | File | 400, 404, 500 |

### Frontend Utilities

#### EstimateCalculator (Client-Side Calculation Module)

| Field | Detail |
|-------|--------|
| Intent | クライアントサイドでの高精度金額計算を提供し、API呼び出しを最小化 |
| Requirements | 1.3, 2.3, 13.6（金額自動計算、高精度計算） |

**Responsibilities & Constraints**
- 金額計算（数量×単価）のクライアントサイド即時計算
- 合計金額（子項目合計）のクライアントサイド計算
- NET金額案分のプレビュー計算
- 利益率適用のプレビュー計算
- Decimal.jsによる高精度10進数計算（バックエンドと同一精度）

**Dependencies**
- External: Decimal.js 10.6 — 高精度10進数計算 (P0)

**Contracts**: Utility [x]

##### Utility Interface

```typescript
// frontend/src/utils/estimate-calculation.ts
interface EstimateCalculatorInterface {
  calculateAmount(quantity: string | null, unitPrice: string | null): Decimal | null;
  calculateSubtotal(items: EstimateItemWithLines[]): Decimal;
  calculateHierarchyAmounts(hierarchy: EstimateItemHierarchy[]): EstimateItemHierarchy[];
  previewNetAllocation(targetLines: VendorLineInfo[], excludeIds: string[], netAmount: string): AllocationPreview[];
  previewProfitRate(executionLines: ExecutionLineInfo[], profitRate: string): ProfitRatePreview[];
}
```

### Frontend Components

#### EstimateItemTable

| Field | Detail |
|-------|--------|
| Intent | 見積項目の階層テーブル表示とインタラクション |
| Requirements | 1.1-1.6, 2.1-2.6, 12.1-12.6 |

**Responsibilities & Constraints**
- 3行1セット（見積/実行/業者金額行）の表示
- 階層構造のツリー表示（展開/折りたたみ）
- 金額の自動計算表示
- ドラッグ&ドロップによる順序変更

**Dependencies**
- Inbound: EstimateDetailPage — 親コンポーネント (P0)
- Outbound: EstimateItemRow — 行コンポーネント (P0)
- External: estimate.routes — API通信 (P0)

**Contracts**: State [x]

##### State Management

```typescript
interface EstimateItemTableState {
  items: EstimateItemHierarchy[];
  expandedIds: Set<string>;
  selectedItemId: string | null;
  editingLineId: string | null;
  isDragging: boolean;
  isDirty: boolean; // 未保存の変更があるか
  pendingChanges: Map<string, ItemChange>; // 変更差分の追跡
}

interface EstimateItemTableProps {
  estimateId: string;
  onItemSelect: (itemId: string) => void;
  onItemsChange: () => void;
  onSaveRequest: () => Promise<void>; // バッチ保存トリガー
}
```

**Client-Side Calculation Integration**:
- 数量/単価の変更時は`EstimateCalculator.calculateAmount()`でローカル計算
- 子項目変更時は`EstimateCalculator.calculateSubtotal()`で親の合計を再計算
- すべての計算はクライアントサイドで即時実行（API呼び出しなし）
- 保存ボタン押下時のみ`PUT /api/estimates/:id/items/batch`で一括送信

#### NetCalculationPanel

| Field | Detail |
|-------|--------|
| Intent | NET金額計算と案分のUI |
| Requirements | 5.1-5.7 |

**Responsibilities & Constraints**
- 対象業者の選択
- 案分対象行の選択
- 除外諸経費行の指定
- NET金額の入力
- 計算処理中のインジケーター表示

**Dependencies**
- Inbound: EstimateDetailPage — 親コンポーネント (P0)
- External: estimate.routes — API通信 (P0)

**Contracts**: State [x]

##### State Management

```typescript
interface NetCalculationPanelState {
  selectedVendor: string | null;
  targetLineIds: string[];
  excludeLineIds: string[];
  netAmount: string;
  isCalculating: boolean;
  previewResults: AllocationPreview[] | null; // クライアント計算結果
}

interface NetCalculationPanelProps {
  estimateId: string;
  vendorLines: VendorLineInfo[];
  onCalculationComplete: () => void;
}
```

**Client-Side Preview Strategy**:
- NET金額入力変更時は`EstimateCalculator.previewNetAllocation()`でプレビュー計算（API呼び出しなし）
- プレビュー結果をUIに即時反映（案分率、案分後金額の表示）
- 「適用」ボタン押下時のみ`POST /api/estimates/:id/calculate-net`でバックエンド確定処理

#### ProfitRatePanel

| Field | Detail |
|-------|--------|
| Intent | 利益率適用のUI |
| Requirements | 6.1-6.6 |

**Responsibilities & Constraints**
- 利益率の入力（0.00〜500.00%）
- 上書きオプションの選択（全て/空のみ/単価のみ）
- プレビュー表示（クライアント計算）
- 適用処理の実行

**Dependencies**
- Inbound: EstimateDetailPage — 親コンポーネント (P0)
- External: estimate.routes — API通信 (P0)

**Contracts**: State [x]

##### State Management

```typescript
interface ProfitRatePanelState {
  profitRate: string;
  overwriteOption: 'all' | 'empty_only' | 'unit_price_only';
  previewResults: ProfitRatePreview[] | null; // クライアント計算結果
  isApplying: boolean;
}

interface ProfitRatePanelProps {
  estimateId: string;
  executionLines: ExecutionLineInfo[];
  onApplyComplete: () => void;
}
```

**Client-Side Preview Strategy**:
- 利益率入力変更時は`EstimateCalculator.previewProfitRate()`でプレビュー計算（API呼び出しなし）
- プレビュー結果をUIに即時反映（適用後の単価表示）
- 「適用」ボタン押下時のみ`POST /api/estimates/:id/apply-profit-rate`でバックエンド確定処理

#### OverheadCostPanel

| Field | Detail |
|-------|--------|
| Intent | 諸経費（共通仮設費/現場管理費/一般管理費）計算のUI |
| Requirements | 7.1-9.6 |

**Responsibilities & Constraints**
- 諸経費種別の選択
- 計算パラメータの入力（直接工事費、工期等）
- 自動計算の実行（諸経費計算式は複雑なためバックエンドで実行）
- 計算結果の表示
- 手入力での上書き

**Dependencies**
- Inbound: EstimateDetailPage — 親コンポーネント (P0)
- External: estimate.routes — API通信 (P0)

**Contracts**: State [x]

##### State Management

```typescript
interface OverheadCostPanelState {
  costType: OverheadCostType;
  directCost: string;
  constructionPeriod: string;
  isRenovation: boolean;
  calculatedAmount: string | null;
  manualOverride: boolean;
  isCalculating: boolean;
}

interface OverheadCostPanelProps {
  estimateId: string;
  onItemAdded: () => void;
}
```

**Note**: 諸経費計算（国土交通省基準）は計算式が複雑かつ係数テーブルを参照するため、バックエンドAPIで計算を行う。ただし、計算ボタン押下時のみAPI呼び出しとし、パラメータ入力中はAPI呼び出しを行わない。

### Frontend Pages (Requirements 14, 15, 16)

#### EstimateListPage

| Field | Detail |
|-------|--------|
| Intent | 見積書一覧画面: プロジェクトに紐付く見積書の一覧表示とナビゲーション |
| Requirements | 14.1-14.7, 15.1-15.4, 15.11, 15.12 |

**Responsibilities & Constraints**
- プロジェクトに紐付く見積書一覧をカード形式で表示
- 見積書名、作成日時、合計金額の表示
- ページネーション機能の提供
- 見積書が存在しない場合の空状態表示
- パンくずナビゲーション（ダッシュボード > プロジェクト一覧 > プロジェクト > 見積書一覧）
- 「← プロジェクト詳細に戻る」リンクを表示しない

**Dependencies**
- Inbound: ProjectDetailPage — プロジェクト詳細からの遷移 (P0)
- Outbound: EstimateDetailPage — 見積書詳細への遷移 (P0)
- Outbound: EstimateCreatePage — 見積書作成への遷移 (P0)
- Outbound: Breadcrumb — パンくずナビゲーション (P0)
- External: estimate.routes — API通信 (P0)

**Contracts**: State [x]

##### State Management

```typescript
interface EstimateListPageState {
  estimates: EstimateInfo[];
  pagination: PaginationInfo;
  isLoading: boolean;
  error: string | null;
}

interface EstimateInfo {
  id: string;
  name: string;
  createdAt: string;
  totalAmount: string | null; // 見積金額行の合計
}
```

**Implementation Notes**
- パンくずナビゲーションは既存のBreadcrumbコンポーネントを使用（`frontend/src/components/common/Breadcrumb.tsx`）
- パンくず構成: ダッシュボード(`/`) > プロジェクト一覧(`/projects`) > プロジェクト(`/projects/:projectId`) > 見積書一覧（現在位置）
- 「← プロジェクト詳細に戻る」リンクは削除（パンくずナビで代替）
- ルーティング: `/projects/:projectId/estimates`
- EstimateRequestListPageのパターンを踏襲

#### EstimateCard

| Field | Detail |
|-------|--------|
| Intent | 見積書カード表示: 見積書の概要情報をカード形式で表示 |
| Requirements | 14.3-14.4, 16.4-16.6 |

**Responsibilities & Constraints**
- 見積書名、作成日時、合計金額の表示
- クリックで見積書詳細画面へ遷移
- 見積依頼カード（EstimateRequestSectionCard内のRequestCard）と同様のスタイル

**Dependencies**
- Inbound: EstimateListPage, EstimateSectionCard — 親コンポーネント (P0)
- External: react-router-dom — ルーティング (P0)

**Contracts**: -

##### Props Interface

```typescript
interface EstimateCardProps {
  id: string;
  name: string;
  createdAt: string;
  totalAmount: string | null;
}
```

**Implementation Notes**
- 既存のEstimateRequestSectionCard内のRequestCardコンポーネントのパターンを踏襲
- アイコンは見積書を表すドキュメントアイコン（封筒アイコンではない）

#### EstimateSectionCard

| Field | Detail |
|-------|--------|
| Intent | プロジェクト詳細画面の見積書セクション表示 |
| Requirements | 16.1-16.13 |

**Responsibilities & Constraints**
- プロジェクト詳細画面の見積依頼セクションの下に配置
- セクションタイトル「見積書」と総数表示
- 直近の見積書をカード形式で表示
- 「すべて見る」リンク（見積書一覧画面へ遷移）
- 新規作成ボタン（見積書作成画面へ遷移）
- 見積書が存在しない場合の空状態表示
- ローディング中のスケルトンローダー表示
- 既存のEstimateRequestSectionCardと同様のスタイル

**Dependencies**
- Inbound: ProjectDetailPage — 親コンポーネント (P0)
- Outbound: EstimateCard — 見積書カード (P0)
- Outbound: EstimateListPage — 一覧画面への遷移 (P0)
- Outbound: EstimateCreatePage — 作成画面への遷移 (P0)

**Contracts**: State [x]

##### Props Interface

```typescript
interface EstimateSectionCardProps {
  /** プロジェクトID */
  projectId: string;
  /** 見積書の総数 */
  totalCount: number;
  /** 直近N件の見積書 */
  latestEstimates: EstimateInfo[];
  /** ローディング状態 */
  isLoading: boolean;
}

interface EstimateInfo {
  id: string;
  name: string;
  createdAt: string;
  totalAmount: string | null;
}
```

**Implementation Notes**
- 実装パターンは`frontend/src/components/projects/EstimateRequestSectionCard.tsx`を参照
- プロジェクト詳細画面（ProjectDetailPage）で`<EstimateRequestSectionCard />`の直後に配置
- API: `GET /api/projects/:projectId/estimates/latest`でサマリーデータ取得

#### EstimateDetailPage（パンくずナビゲーション拡張）

| Field | Detail |
|-------|--------|
| Intent | 見積書詳細画面: 見積書の詳細情報と編集機能を提供（パンくずナビゲーション対応） |
| Requirements | 14.8-14.10, 15.8-15.11 |

**Responsibilities & Constraints**
- 見積書の詳細情報（見積項目一覧、合計金額等）を表示
- 編集・削除・出力ボタンを提供
- パンくずナビゲーション（ダッシュボード > プロジェクト一覧 > プロジェクト > 見積書一覧 > 見積書）
- 「← 見積書一覧に戻る」リンクを表示しない

**Dependencies**
- Inbound: EstimateListPage — 見積書一覧からの遷移 (P0)
- Outbound: Breadcrumb — パンくずナビゲーション (P0)
- Outbound: EstimateItemTable — 見積項目テーブル (P0)
- Outbound: NetCalculationPanel, ProfitRatePanel, OverheadCostPanel — 計算パネル群 (P0)
- External: estimate.routes — API通信 (P0)

**Contracts**: State [x]

##### Breadcrumb Configuration

```typescript
// EstimateDetailPageのパンくず設定
const breadcrumbItems = [
  { label: 'ダッシュボード', path: '/' },
  { label: 'プロジェクト一覧', path: '/projects' },
  { label: 'プロジェクト', path: `/projects/${estimate.projectId}` },
  { label: '見積書一覧', path: `/projects/${estimate.projectId}/estimates` },
  { label: '見積書' } // 現在位置（リンクなし）
];
```

```typescript
// EstimateCreatePageのパンくず設定
const breadcrumbItems = [
  { label: 'ダッシュボード', path: '/' },
  { label: 'プロジェクト一覧', path: '/projects' },
  { label: 'プロジェクト', path: `/projects/${projectId}` },
  { label: '見積書一覧', path: `/projects/${projectId}/estimates` },
  { label: '新規作成' } // 現在位置（リンクなし）
];
```

```typescript
// EstimateListPageのパンくず設定
const breadcrumbItems = [
  { label: 'ダッシュボード', path: '/' },
  { label: 'プロジェクト一覧', path: '/projects' },
  { label: 'プロジェクト', path: `/projects/${projectId}` },
  { label: '見積書一覧' } // 現在位置（リンクなし）
];
```

**Implementation Notes**
- ルーティング: `/estimates/:id`
- パンくずは既存のBreadcrumbコンポーネントを使用
- 全3画面（一覧・新規作成・詳細）で「← 戻る」リンクを削除
- EstimateRequestDetailPageのパンくず実装を参照

### Backend Extensions (Requirements 16)

#### EstimateService拡張（getLatestByProjectId）

| Field | Detail |
|-------|--------|
| Intent | プロジェクト詳細画面用のサマリーデータ取得 |
| Requirements | 16.3-16.5, 16.12 |

**Responsibilities & Constraints**
- プロジェクトIDに基づく見積書の総数取得
- 直近N件の見積書取得（作成日時降順）
- 各見積書の合計金額計算

**Dependencies**
- Outbound: Prisma — データベースアクセス (P0)

**Contracts**: Service [x]

##### Service Interface Extension

```typescript
interface EstimateServiceInterface {
  // 既存メソッド...

  /**
   * プロジェクト詳細画面用のサマリーデータ取得
   * Requirements: 16.3-16.5, 16.12
   */
  getLatestByProjectId(projectId: string, limit?: number): Promise<Result<EstimateSummary, EstimateError>>;
}

interface EstimateSummary {
  /** 見積書の総数 */
  totalCount: number;
  /** 直近N件の見積書 */
  latestEstimates: EstimateInfo[];
}

interface EstimateInfo {
  id: string;
  name: string;
  createdAt: Date;
  totalAmount: Decimal | null;
}
```

**Implementation Notes**
- 実装パターンは`itemized-statement.service.ts`の`getLatestByProjectId`を参照
- 合計金額は見積金額行（lineType='ESTIMATE'）のamount合計
- 空の場合はtotalCount: 0、latestEstimates: []を返却

## Data Models

### Domain Model

```mermaid
erDiagram
    Estimate ||--o{ EstimateItem : contains
    EstimateItem ||--|| EstimateItem : "parent-child"
    EstimateItem ||--|{ EstimateItemLine : has
    Estimate }o--|| Project : belongs_to
    Estimate }o--o| ItemizedStatement : references
    EstimateItemLine }o--o| ReceivedQuotationLineItem : transferred_from

    Estimate {
        uuid id PK
        uuid projectId FK
        string name
        uuid sourceItemizedStatementId FK
        string sourceItemizedStatementName
        datetime createdAt
        datetime updatedAt
        datetime deletedAt
    }

    EstimateItem {
        uuid id PK
        uuid estimateId FK
        uuid parentId FK
        int displayOrder
        datetime createdAt
        datetime updatedAt
    }

    EstimateItemLine {
        uuid id PK
        uuid estimateItemId FK
        enum lineType
        string name
        string specification
        string unit
        decimal quantity
        decimal unitPrice
        decimal amount
        string remarks
        uuid sourceReceivedQuotationLineItemId FK
        string sourceVendorName
        datetime createdAt
        datetime updatedAt
    }
```

### Physical Data Model

**For PostgreSQL**:

```sql
-- 見積書テーブル
CREATE TABLE estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    source_itemized_statement_id UUID REFERENCES itemized_statements(id),
    source_itemized_statement_name VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_estimates_project_id ON estimates(project_id);
CREATE INDEX idx_estimates_deleted_at ON estimates(deleted_at);
CREATE INDEX idx_estimates_created_at ON estimates(created_at);

-- 見積項目テーブル（階層構造）
CREATE TABLE estimate_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES estimate_items(id) ON DELETE CASCADE,
    display_order INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_estimate_items_estimate_id ON estimate_items(estimate_id);
CREATE INDEX idx_estimate_items_parent_id ON estimate_items(parent_id);
CREATE INDEX idx_estimate_items_display_order ON estimate_items(estimate_id, display_order);

-- 見積項目行テーブル（3行1セット）
CREATE TABLE estimate_item_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_item_id UUID NOT NULL REFERENCES estimate_items(id) ON DELETE CASCADE,
    line_type VARCHAR(20) NOT NULL CHECK (line_type IN ('ESTIMATE', 'EXECUTION', 'VENDOR')),
    name VARCHAR(200),
    specification VARCHAR(500),
    unit VARCHAR(50),
    quantity DECIMAL(15, 4),
    unit_price DECIMAL(15, 2),
    amount DECIMAL(15, 2),
    remarks TEXT,
    source_received_quotation_line_item_id UUID REFERENCES received_quotation_line_items(id),
    source_vendor_name VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_estimate_item_lines_estimate_item_id ON estimate_item_lines(estimate_item_id);
CREATE INDEX idx_estimate_item_lines_line_type ON estimate_item_lines(line_type);
CREATE UNIQUE INDEX idx_estimate_item_lines_unique ON estimate_item_lines(estimate_item_id, line_type);
```

## Error Handling

### Error Categories and Responses

**User Errors (4xx)**:
- 400 Bad Request: バリデーションエラー（数量/単価が数値以外、利益率範囲外）
- 404 Not Found: 見積書/項目が存在しない
- 409 Conflict: 楽観的排他制御による競合検出

**Business Logic Errors (422)**:
- 親項目削除時に子項目が存在する場合の確認要求
- NET金額計算時に案分対象が空の場合
- 金額計算結果のオーバーフロー警告

**System Errors (5xx)**:
- 500 Internal Server Error: PDF/Excel出力の生成失敗

### Monitoring

- 見積書CRUD操作の監査ログ記録
- 計算処理時間のパフォーマンスログ
- 金額オーバーフロー警告のアラート

## Testing Strategy

### Unit Tests

- EstimateCalculationService: NET金額案分計算、利益率適用、Decimal精度検証
- OverheadCostService: 諸経費計算式の正確性、係数値の検証
- EstimateItemService: 階層構造管理、転記処理
- バリデーションスキーマ: 数値範囲、文字数制限

### Integration Tests

- 見積書CRUD API: 正常系/異常系
- 内訳書連携による初期作成
- 受領見積書からの転記フロー
- 楽観的排他制御の動作検証

### E2E Tests

- 見積書作成から出力までの一連のフロー
- 3行1セット構造の表示・編集
- NET金額計算・案分の操作フロー
- 諸経費自動計算の操作フロー

### Performance Tests

- 大量項目（100項目以上）の階層表示パフォーマンス
- PDF/Excel出力の生成時間

## Security Considerations

- 見積書アクセスはプロジェクト所属ユーザーに限定（RBAC）
- 金額データは高精度10進数で保持し丸め誤差を防止
- 楽観的排他制御による同時更新の整合性保証

## Performance & Scalability

### API呼び出し最小化戦略

本機能では、リクエスト数を極力減らし、クライアント側で出来ることは出来るだけクライアント側で行うことを方針とする。

#### 1. クライアントサイド計算（Client-Side Calculation）

金額の自動計算（数量×単価）はフロントエンドでDecimal.jsを使用してローカル計算する。バックエンドAPIは保存時のみ呼び出す。

> **Note（REQ-22適用）**: 以下のコード例はREQ-22（数値表示形式と丸め規則）適用後の仕様です。単価・金額は`toDecimalPlaces(0, ROUND_HALF_UP)`で整数に丸めます。詳細は「数値表示形式と丸め規則の設計（REQ-22対応）」セクションを参照してください。

```typescript
// frontend/src/utils/estimate-calculation.ts
import Decimal from 'decimal.js';

export class EstimateCalculator {
  /**
   * 金額計算（数量 × 単価）
   * REQ-22.3, 22.9: 計算結果を小数第1位で四捨五入して整数にする
   */
  static calculateAmount(quantity: string | null, unitPrice: string | null): Decimal | null {
    if (!quantity || !unitPrice) return null;
    const q = new Decimal(quantity);
    const p = new Decimal(unitPrice);
    return q.mul(p).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  }

  /**
   * 単価の丸め処理
   * REQ-22.2: 小数第1位で四捨五入して整数にする
   */
  static roundUnitPrice(unitPrice: string | null): Decimal | null {
    if (!unitPrice) return null;
    return new Decimal(unitPrice).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  }

  /**
   * 数量のフォーマット
   * REQ-22.1, 22.7: 小数2桁固定表示
   */
  static formatQuantity(quantity: string | null): string {
    if (!quantity) return '';
    return new Decimal(quantity).toFixed(2);
  }

  /**
   * 合計金額計算（子項目の金額合計）
   * クライアントサイドで階層を走査して計算
   */
  static calculateSubtotal(items: EstimateItemWithLines[]): Decimal {
    return items.reduce((sum, item) => {
      const amount = item.lines.find(l => l.lineType === 'ESTIMATE')?.amount;
      return amount ? sum.add(new Decimal(amount)) : sum;
    }, new Decimal(0));
  }

  /**
   * NET金額案分計算（プレビュー用）
   * REQ-22.4, 22.5: 案分後金額・単価を小数第1位で四捨五入して整数にする
   */
  static previewNetAllocation(
    targetLines: VendorLineInfo[],
    excludeIds: string[],
    netAmount: string
  ): AllocationPreview[] {
    const net = new Decimal(netAmount);
    const activeLines = targetLines.filter(l => !excludeIds.includes(l.id));
    const totalAmount = activeLines.reduce(
      (sum, l) => sum.add(new Decimal(l.amount || 0)), new Decimal(0)
    );

    return activeLines.map(line => {
      const ratio = totalAmount.isZero()
        ? new Decimal(0)
        : new Decimal(line.amount || 0).div(totalAmount);
      const allocatedAmount = net.mul(ratio).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      const allocatedUnitPrice = line.quantity && !new Decimal(line.quantity).isZero()
        ? allocatedAmount.div(new Decimal(line.quantity)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        : new Decimal(0);
      return {
        lineId: line.id,
        originalAmount: line.amount,
        allocatedAmount: allocatedAmount.toString(),
        allocatedUnitPrice: allocatedUnitPrice.toString(),
        ratio: ratio.mul(100).toDecimalPlaces(2).toString() + '%',
      };
    });
  }

  /**
   * 利益率適用プレビュー
   * REQ-22.6: 新しい単価を小数第1位で四捨五入して整数にする
   */
  static previewProfitRate(
    executionLines: ExecutionLineInfo[],
    profitRate: string
  ): ProfitRatePreview[] {
    const rate = new Decimal(profitRate).div(100).add(1); // 例: 10% → 1.10
    return executionLines.map(line => ({
      lineId: line.id,
      originalUnitPrice: line.unitPrice,
      newUnitPrice: new Decimal(line.unitPrice || 0).mul(rate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toString(),
    }));
  }
}
```

#### 2. バッチ保存戦略

見積項目の編集はクライアントサイドで状態管理し、一括保存APIで送信する。

```typescript
// API呼び出しタイミング
// ❌ 悪い例: 各フィールド変更ごとにAPI呼び出し
// onChange → PUT /api/estimates/:id/items/:itemId （毎回呼び出し）

// ✅ 良い例: ローカル状態管理 + 一括保存
// onChange → ローカルstate更新 + クライアント計算
// onSave → PUT /api/estimates/:id/items/batch （一括送信）
```

**バッチ保存API**:
```typescript
// PUT /api/estimates/:id/items/batch
interface BatchUpdateItemsRequest {
  items: {
    id: string;
    lines: {
      id: string;
      lineType: EstimateItemLineType;
      name: string | null;
      specification: string | null;
      unit: string | null;
      quantity: string | null;
      unitPrice: string | null;
      remarks: string | null;
    }[];
  }[];
  updatedAt: Date; // 楽観的排他制御
}
```

#### 3. 階層データ取得の最適化

N+1問題を回避するため、Prismaのeager loadingを使用して単一クエリで階層データを取得する。

```typescript
// EstimateItemService.getHierarchy() 実装戦略
async getHierarchy(estimateId: string): Promise<EstimateItemHierarchy[]> {
  // 単一クエリで全項目を取得（N+1回避）
  const items = await this.prisma.estimateItem.findMany({
    where: { estimateId },
    include: {
      lines: true, // 3行1セットをeager load
    },
    orderBy: [
      { parentId: 'asc' },
      { displayOrder: 'asc' },
    ],
  });

  // クライアントサイドで階層構造を構築
  return this.buildHierarchyTree(items);
}

private buildHierarchyTree(items: EstimateItemWithLines[]): EstimateItemHierarchy[] {
  const itemMap = new Map<string, EstimateItemHierarchy>();
  const roots: EstimateItemHierarchy[] = [];

  // 1パス目: マップ作成
  items.forEach(item => {
    itemMap.set(item.id, { ...item, children: [] });
  });

  // 2パス目: 親子関係構築
  items.forEach(item => {
    const node = itemMap.get(item.id)!;
    if (item.parentId) {
      const parent = itemMap.get(item.parentId);
      parent?.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}
```

#### 4. 一括操作API設計

並び替え、転記、利益率適用などの一括操作は、単一リクエストで処理する。

| 操作 | エンドポイント | リクエスト形式 | 処理方式 |
|------|---------------|---------------|---------|
| 並び替え | PUT /api/estimates/:id/items/reorder | `{ itemOrders: [{id, displayOrder}[]] }` | 単一トランザクション |
| 転記 | POST /api/estimates/:id/transfer-quotation | `{ lineItemIds: string[] }` | 単一トランザクション |
| 利益率適用 | POST /api/estimates/:id/apply-profit-rate | `{ profitRate, overwriteOption }` | 一括計算・一括更新 |
| NET金額案分 | POST /api/estimates/:id/calculate-net | `{ targetLineIds[], excludeLineIds[], netAmount }` | 一括計算・一括更新 |
| バッチ保存 | PUT /api/estimates/:id/items/batch | `{ items: ItemUpdate[] }` | 単一トランザクション |

#### 5. フロントエンド状態管理

編集中のデータはReact状態で管理し、変更の差分のみをAPI送信する。

```typescript
// useEstimateEditor hook
interface UseEstimateEditorReturn {
  // 状態
  items: EstimateItemHierarchy[];
  isDirty: boolean;
  pendingChanges: Map<string, ItemChange>;

  // ローカル操作（API呼び出しなし）
  updateLine: (itemId: string, lineId: string, field: string, value: string) => void;
  reorderItems: (sourceId: string, targetId: string) => void;
  addItem: (parentId?: string) => void;
  deleteItem: (itemId: string) => void;

  // API呼び出し（保存時のみ）
  save: () => Promise<void>; // 変更があるものだけバッチ送信
  discard: () => void; // ローカル変更を破棄
}
```

### リクエスト最小化の効果

| シナリオ | 従来設計 | 最適化後 |
|---------|---------|---------|
| 50項目の数値入力 | 50回 | 1回（バッチ保存） |
| 50項目の並び替え | 50回 | 1回（一括並び替え） |
| NET金額案分プレビュー | 毎回API | 0回（クライアント計算） |
| 利益率プレビュー | 毎回API | 0回（クライアント計算） |
| 階層データ取得 | N+1（項目数×4） | 1回（eager loading） |

### その他のパフォーマンス考慮事項

- 階層データの効率的な取得（Prisma eager loading + クライアントサイド階層構築）
- 大量項目時のページネーション対応（将来拡張）
- 仮想スクロール対応（100項目以上の場合、react-windowを検討）
- PDF/Excel生成は非同期処理を検討（将来拡張）

## 追加設計（REQ-17〜21対応）

### バックエンド追加: プロジェクト単位受領見積書取得API（REQ-17.1, 17.2）

#### 新規エンドポイント

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| GET | /api/projects/:projectId/quotations | - | ReceivedQuotationInfo[] | 404 |

**実装方針**:
- `received-quotation.service.ts`に`findByProjectId(projectId: string)`メソッドを追加
- EstimateRequest経由でReceivedQuotationを取得（EstimateRequest.projectId → ReceivedQuotation.estimateRequestId）
- lineItemsを含めてeager load
- `app.ts`に`/api/projects/:projectId/quotations`ルートを登録

```typescript
// ReceivedQuotationService追加メソッド
async findByProjectId(projectId: string): Promise<ReceivedQuotationInfo[]> {
  const quotations = await this.prisma.receivedQuotation.findMany({
    where: {
      deletedAt: null,
      estimateRequest: {
        projectId: projectId,
        deletedAt: null,
      },
    },
    include: {
      lineItems: { orderBy: { sortOrder: 'asc' } },
      estimateRequest: { select: { tradingPartnerName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return quotations.map(q => this.toInfo(q));
}
```

### フロントエンド変更: EstimateItemTable（REQ-17.3, 17.4）

**見積業者列の追加**:
- ヘッダーに「見積業者」列を追加
- gridTemplateColumnsを`60px 1fr 120px 80px 100px 100px 120px 120px 1fr`に変更（見積業者列120px追加）
- 業者金額行（VENDOR）のsourceVendorNameを見積業者列に表示
- 見積金額行・実行金額行の見積業者列は空欄表示

### フロントエンド変更: EstimateDetailPageレイアウト改善（REQ-20, 21）

**廃止するコンポーネント**:
- サイドバーセクション全体（合計金額パネル、NET金額計算パネル、利益率設定パネル）

**新規追加: サマリーパネル**（基本情報パネルの下）:
```typescript
interface SummaryPanelData {
  estimateTotal: string;    // 見積金額合計
  executionTotal: string;   // 実行金額合計
  vendorTotal: string;      // 業者金額合計
  profitRate: string;       // 利益率（見積金額合計÷実行金額合計）
  discountRate: string;     // 値引率（実行金額合計÷業者金額合計）
}
```

**レイアウト変更**:
- `gridTemplateColumns: '1fr 320px'` → `gridTemplateColumns: '1fr'`（1カラムレイアウト）
- サイドセクション削除
- サマリーパネルをメインセクションに配置（基本情報の直後）

### フロントエンド変更: ヘッダーボタン（REQ-17.5, 18.1, 19.1）

**ボタン構成変更**:
- 「転記」→「受領見積書を業者金額に転記」（TransferQuotationDialog呼出）
- 新規「業者金額を実行金額に転記」（NetAllocationDialogを新規作成、ダイアログ呼出）
- 新規「実行金額を見積金額に転記」（ProfitRateDialogを新規作成、ダイアログ呼出）

### 新規コンポーネント: NetAllocationDialog（REQ-18）

**ダイアログ形式のNET金額案分機能**:

```typescript
interface NetAllocationDialogProps {
  isOpen: boolean;
  estimateId: string;
  items: EstimateItemHierarchyEdit[];
  onClose: () => void;
  onComplete: () => void;
}
```

**UI構成**:
1. 対象業者選択ドロップダウン（業者金額行のsourceVendorNameからユニーク値抽出）
2. 業者金額行一覧（チェックボックス付き、除外選択可能）
3. NET金額入力フィールド
4. プレビュー表示（案分率、案分後金額）
5. 案分実行ボタン

**API連携**: `POST /api/estimates/:id/calculate-net`

### 新規コンポーネント: ProfitRateDialog（REQ-19）

**ダイアログ形式の利益率適用機能**:

```typescript
interface ProfitRateDialogProps {
  isOpen: boolean;
  estimateId: string;
  items: EstimateItemHierarchyEdit[];
  onClose: () => void;
  onComplete: () => void;
}
```

**UI構成**:
1. 利益率入力フィールド（0.00〜500.00%）
2. 上書きオプション（すべて上書き / 空の場合のみ上書き / 単価のみ上書き）
3. プレビュー表示（元の単価→新しい単価）
4. 適用ボタン

**API連携**: `POST /api/estimates/:id/apply-profit-rate`

### 数値表示形式と丸め規則の設計（REQ-22対応）

#### 丸め規則の定義

| フィールド | 内部精度 | 表示形式 | 丸め方法 | 例 |
|-----------|---------|---------|---------|---|
| 数量 | Decimal(15, 4) | 小数2桁固定 | フォーカスアウト時に小数2桁にフォーマット | 1.00, 2.50, 10.25 |
| 単価 | Decimal(15, 2) | 整数 | 小数第1位で四捨五入（ROUND_HALF_UP） | 1234, 5678 |
| 金額 | Decimal(15, 2) | 整数 | 数量×単価の結果を小数第1位で四捨五入 | 12345, 67890 |
| NET案分後金額 | Decimal(15, 2) | 整数 | 案分計算結果を小数第1位で四捨五入 | 100000 |
| NET案分後単価 | Decimal(15, 2) | 整数 | 案分計算結果を小数第1位で四捨五入 | 5000 |
| 利益率適用後単価 | Decimal(15, 2) | 整数 | 利益率適用結果を小数第1位で四捨五入 | 6500 |

#### EstimateCalculator変更（フロントエンド）

```typescript
// frontend/src/utils/estimate-calculation.ts 変更点

export class EstimateCalculator {
  /**
   * 金額計算（数量 × 単価）
   * REQ-22.3, 22.9: 計算結果を小数第1位で四捨五入して整数にする
   */
  static calculateAmount(quantity: string | null, unitPrice: string | null): Decimal | null {
    if (!quantity || !unitPrice) return null;
    const q = new Decimal(quantity);
    const p = new Decimal(unitPrice);
    // 小数第1位で四捨五入 → 整数
    return q.mul(p).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  }

  /**
   * 単価の丸め処理
   * REQ-22.2: 小数第1位で四捨五入して整数にする
   */
  static roundUnitPrice(unitPrice: string | null): Decimal | null {
    if (!unitPrice) return null;
    return new Decimal(unitPrice).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  }

  /**
   * 数量のフォーマット
   * REQ-22.1, 22.7: 小数2桁固定表示
   */
  static formatQuantity(quantity: string | null): string {
    if (!quantity) return '';
    return new Decimal(quantity).toFixed(2);
  }

  /**
   * NET金額案分計算（プレビュー用）- 丸め規則適用版
   * REQ-22.4, 22.5: 案分後金額・単価を小数第1位で四捨五入して整数にする
   */
  static previewNetAllocation(
    targetLines: VendorLineInfo[],
    excludeIds: string[],
    netAmount: string
  ): AllocationPreview[] {
    const net = new Decimal(netAmount);
    const activeLines = targetLines.filter(l => !excludeIds.includes(l.id));
    const totalAmount = activeLines.reduce(
      (sum, l) => sum.add(new Decimal(l.amount || 0)), new Decimal(0)
    );

    return activeLines.map(line => {
      const ratio = totalAmount.isZero()
        ? new Decimal(0)
        : new Decimal(line.amount || 0).div(totalAmount);
      // REQ-22.4: 案分後金額を小数第1位で四捨五入して整数
      const allocatedAmount = net.mul(ratio).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      // REQ-22.5: 案分後単価を小数第1位で四捨五入して整数
      const allocatedUnitPrice = line.quantity && !new Decimal(line.quantity).isZero()
        ? allocatedAmount.div(new Decimal(line.quantity)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        : new Decimal(0);
      return {
        lineId: line.id,
        originalAmount: line.amount,
        allocatedAmount: allocatedAmount.toString(),
        allocatedUnitPrice: allocatedUnitPrice.toString(),
        ratio: ratio.mul(100).toDecimalPlaces(2).toString() + '%',
      };
    });
  }

  /**
   * 利益率適用プレビュー - 丸め規則適用版
   * REQ-22.6: 新しい単価を小数第1位で四捨五入して整数にする
   */
  static previewProfitRate(
    executionLines: ExecutionLineInfo[],
    profitRate: string
  ): ProfitRatePreview[] {
    const rate = new Decimal(profitRate).div(100).add(1);
    return executionLines.map(line => ({
      lineId: line.id,
      originalUnitPrice: line.unitPrice,
      // REQ-22.6: 小数第1位で四捨五入して整数
      newUnitPrice: new Decimal(line.unitPrice || 0).mul(rate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toString(),
    }));
  }
}
```

#### バックエンド計算サービス変更

**EstimateCalculationService変更点**:

```typescript
// backend/src/services/estimate-calculation.service.ts 変更点

// calculateNet: 案分後の単価を小数第1位で四捨五入して整数で保存
// REQ-22.4, 22.5
const allocatedUnitPrice = allocatedAmount.div(quantity).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
const recalculatedAmount = quantity.mul(allocatedUnitPrice).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

// applyProfitRate: 利益率適用後の単価を小数第1位で四捨五入して整数で保存
// REQ-22.6
const newUnitPrice = executionUnitPrice.mul(rate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
const newAmount = quantity.mul(newUnitPrice).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
```

**バッチ保存時の丸め処理（estimate-item.service.ts）**:

```typescript
// バッチ更新時に単価と金額の丸め規則を適用
// REQ-22.2, 22.3, 22.9
const roundedUnitPrice = unitPrice ? new Decimal(unitPrice).toDecimalPlaces(0, Decimal.ROUND_HALF_UP) : null;
const calculatedAmount = quantity && roundedUnitPrice
  ? new Decimal(quantity).mul(roundedUnitPrice).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  : null;
```

#### フロントエンド表示コンポーネント変更

**EstimateItemRow変更点**:

> **データフロー**: onBlurハンドラからフォーマット済み値を`useEstimateEditor`の`updateLine(itemId, lineId, field, formattedValue)`に渡す。`updateLine`はローカルstateを更新し、`pendingChanges`に差分を記録する。保存ボタン押下時のみバッチAPIで送信される。onBlur時のフォーマット適用は表示側の整形であり、`useEstimateEditor.updateLine`の呼び出しによって状態に書き戻される。

```typescript
// REQ-22.1: 数量フィールド - 小数2桁常時表示
// フォーカスアウト時にフォーマット適用
// updateField は useEstimateEditor の updateLine を呼び出すラッパー
const handleQuantityBlur = (value: string) => {
  if (value) {
    const formatted = EstimateCalculator.formatQuantity(value);
    updateField('quantity', formatted); // → useEstimateEditor.updateLine(itemId, lineId, 'quantity', formatted)
  }
};

// REQ-22.2, 22.8: 単価フィールド - 整数表示
// フォーカスアウト時に小数第1位で四捨五入して整数にフォーマット
const handleUnitPriceBlur = (value: string) => {
  if (value) {
    const rounded = EstimateCalculator.roundUnitPrice(value);
    if (rounded) updateField('unitPrice', rounded.toString()); // → useEstimateEditor.updateLine(itemId, lineId, 'unitPrice', rounded.toString())
  }
};

// REQ-22.3: 金額フィールド - 整数表示
// 自動計算結果を整数で表示（toLocaleString等によるカンマ区切りは既存のまま）
const displayAmount = (amount: string | null) => {
  if (!amount) return '';
  return new Decimal(amount).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toString();
};
```

**NetAllocationDialog変更点**:

```typescript
// REQ-22.4, 22.5: プレビュー表示時に整数表示
// 案分後金額と案分後単価を整数で表示
```

**ProfitRateDialog変更点**:

```typescript
// REQ-22.6: プレビュー表示時に新しい単価を整数で表示
```

### Requirements Traceability（追加分）

| Requirement | Summary | Components | Interfaces | Flows |
|-------------|---------|------------|------------|-------|
| 17.1-17.2 | 受領見積書ドロップダウン修正 | TransferQuotationDialog, ReceivedQuotationService | GET /api/projects/:projectId/quotations | 転記フロー |
| 17.3-17.4 | 見積業者列追加 | EstimateItemTable, EstimateItemRow | - | 表示 |
| 17.5 | 転記ボタンラベル変更 | EstimateDetailPage | - | UI |
| 18.1-18.9 | NET金額案分ダイアログ | NetAllocationDialog | POST /api/estimates/:id/calculate-net | NET計算フロー |
| 19.1-19.7 | 利益率適用ダイアログ | ProfitRateDialog | POST /api/estimates/:id/apply-profit-rate | 利益率適用 |
| 20.1-20.6 | サマリーパネル | EstimateDetailPage | - | 表示 |
| 21.1-21.3 | レイアウト改善 | EstimateDetailPage | - | UI |
| 22.1-22.9 | 数値表示形式と丸め規則 | EstimateCalculator, EstimateItemRow, EstimateCalculationService, NetAllocationDialog, ProfitRateDialog | 全計算API | 表示・計算 |
| 23.1-23.10 | 見積項目操作ツールバー | EstimateItemToolbar, EstimateItemTable, EstimateDetailPage | - | UI操作 |
| 24.1-24.5 | 階層移動API | EstimateItemService, estimates.routes | PATCH /api/estimates/:id/items/:itemId/move | 階層移動 |
| 25.1 | 見積書名デフォルト値 | EstimateCreatePage | - | 作成フロー |
| 26.1-26.2 | アクションボタン配置改善 | EstimateDetailPage | - | UI |
| 27.1-27.4 | 保存ボタンとクライアントサイド編集 | EstimateItemTable, useEstimateEditor, EstimateDetailPage | PUT /api/estimates/:id/items/batch | バッチ保存 |
| 28.1-28.4 | 表示行フィルター | LineTypeFilter, EstimateItemTable, EstimateDetailPage | - | 表示 |
| 29.1-29.3 | 親項目の単価自動計算制御 | EstimateItemRow, EstimateItemTable, EstimateCalculator | - | 表示・計算 |
| 30.1-30.3 | 転記ダイアログ選択肢改善 | TransferQuotationDialog | - | 転記フロー |
| 31.1-31.2 | NET案分ダイアログ受領見積書情報表示 | NetAllocationDialog | GET /api/projects/:projectId/quotations | NET計算フロー |
| 32.1-32.8 | 見積書出力の行タイプ複数選択 | EstimateExportDialog, EstimateExportService, estimates.routes | GET /api/estimates/:id/export?lineTypes= | 出力フロー |

## 追加設計（REQ-23〜24対応）

### 新規コンポーネント: EstimateItemToolbar（REQ-23）

| Field | Detail |
|-------|--------|
| Intent | 見積項目の追加・削除・複製・階層移動操作のためのツールバー |
| Requirements | 23.1-23.10, 12.1, 12.3, 12.5, 12.6 |

**Responsibilities & Constraints**
- 見積項目テーブルの上部に配置
- 項目選択状態に応じたボタンの有効/無効制御
- 各操作ボタンのクリックイベントを親コンポーネントに委譲

**Dependencies**
- Inbound: EstimateDetailPage — 親コンポーネント (P0)
- Outbound: useEstimateEditor — 操作関数の呼び出し (P0)

**Contracts**: Props [x]

```typescript
interface EstimateItemToolbarProps {
  /** 選択中の項目ID */
  selectedItemId: string | null;
  /** 選択中の項目データ（ボタン制御用） */
  selectedItem: EstimateItemHierarchyEdit | null;
  /** 項目追加（ルートレベル） */
  onAddItem: () => void;
  /** 子項目追加（選択中項目の子として） */
  onAddChildItem: (parentId: string) => void;
  /** 項目削除 */
  onDeleteItem: (itemId: string) => void;
  /** 項目複製 */
  onDuplicateItem: (itemId: string) => void;
  /** 上の階層へ移動（親の兄弟レベルに移動） */
  onMoveUp: (itemId: string) => void;
  /** 下の階層へ移動（直前の兄弟項目の子に移動） */
  onMoveDown: (itemId: string) => void;
}
```

**ボタン構成と有効/無効制御**:

| ボタン | アイコン | ラベル | 有効条件 |
|--------|---------|--------|---------|
| 項目追加 | + | 項目追加 | 常に有効 |
| 子項目追加 | +↳ | 子項目追加 | 項目選択中 |
| 削除 | ゴミ箱 | 削除 | 項目選択中 |
| 複製 | コピー | 複製 | 項目選択中 |
| 上の階層へ | ↰ | 上の階層へ | 項目選択中 かつ parentId !== null |
| 下の階層へ | ↳ | 下の階層へ | 項目選択中 かつ 直前の兄弟項目が存在する |

**UI配置**:
```
┌──────────────────────────────────────────────────────┐
│ [+項目追加] [+↳子項目追加] [複製] [削除] [↰上階層] [↳下階層] │
├──────────────────────────────────────────────────────┤
│ 種別 │ 見積業者 │ 名称 │ 規格 │ 単位 │ 数量 │ 単価 │ 金額 │ 備考│
│ ─────┼──────────┼──────┼──────┼──────┼──────┼──────┼──────┼─────│
│ ...  │          │      │      │      │      │      │      │     │
└──────────────────────────────────────────────────────┘
```

### EstimateDetailPage変更（REQ-23対応）

**変更点**:
- `selectedItemId`状態を追加し、EstimateItemTableの`onItemSelect`に接続
- EstimateItemToolbarを見積項目テーブルカードの内部、ヘッダー直後に配置
- useEstimateEditorの`addItem`、`deleteItem`、`duplicateItem`をツールバーに接続
- 新規`moveItemUp`、`moveItemDown`関数を実装してツールバーに接続

```typescript
// EstimateDetailPage 追加実装
const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

// 選択中の項目データを取得するヘルパー
const selectedItem = useMemo(
  () => selectedItemId ? findItemById(editor.items, selectedItemId) : null,
  [editor.items, selectedItemId]
);

// 上の階層へ移動: 現在の親から外して、親の兄弟レベルに配置
const handleMoveUp = useCallback(async (itemId: string) => {
  const item = findItemById(editor.items, itemId);
  if (!item || !item.parentId) return;
  const parent = findItemById(editor.items, item.parentId);
  if (!parent) return;

  // API経由で親項目を変更（parent.parentIdに移動）
  await moveItemApi(estimate.id, itemId, parent.parentId);
  await fetchData();
}, [editor.items, estimate, fetchData]);

// 下の階層へ移動: 直前の兄弟項目の子に配置
const handleMoveDown = useCallback(async (itemId: string) => {
  const siblings = getSiblings(editor.items, itemId);
  const currentIndex = siblings.findIndex(s => s.id === itemId);
  if (currentIndex <= 0) return;
  const previousSibling = siblings[currentIndex - 1];

  // API経由で親項目を変更（直前の兄弟の子に移動）
  await moveItemApi(estimate.id, itemId, previousSibling.id);
  await fetchData();
}, [editor.items, estimate, fetchData]);
```

### バックエンド追加: 階層移動APIエンドポイント（REQ-24）

#### 新規エンドポイント

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| PATCH | /api/estimates/:id/items/:itemId/move | `{ parentId: string \| null }` | `{ success: true }` | 400 (循環参照), 404 |

**実装方針**:
- `estimates.routes.ts` に `PATCH /api/estimates/:id/items/:itemId/move` を追加
- 既存の `EstimateItemService.moveItem()` を呼び出し（循環参照防止ロジック実装済み）
- Zodバリデーションスキーマ: `{ parentId: z.string().uuid().nullable() }`

```typescript
// estimates.routes.ts 追加ルート
estimateItemRouter.patch('/:itemId/move', async (c) => {
  const { id, itemId } = c.req.param();
  const { parentId } = await c.req.json();

  // バリデーション
  const schema = z.object({ parentId: z.string().uuid().nullable() });
  const result = schema.safeParse({ parentId });
  if (!result.success) {
    return c.json({ error: 'Invalid request' }, 400);
  }

  try {
    await estimateItemService.moveItem(itemId, result.data.parentId);
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof EstimateItemCircularReferenceError) {
      return c.json({ error: '循環参照が発生するため移動できません' }, 400);
    }
    if (error instanceof EstimateItemNotFoundError) {
      return c.json({ error: '見積項目が見つかりません' }, 404);
    }
    throw error;
  }
});
```

### フロントエンドAPI関数追加（REQ-24）

```typescript
// frontend/src/api/estimates.ts 追加
export async function moveEstimateItem(
  estimateId: string,
  itemId: string,
  parentId: string | null
): Promise<void> {
  const response = await apiClient.patch(
    `/api/estimates/${estimateId}/items/${itemId}/move`,
    { parentId }
  );
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || '項目の移動に失敗しました');
  }
}
```

## 追加設計（REQ-25〜32対応）

### 見積書名デフォルト値（REQ-25）

#### EstimateCreatePage変更

| Field | Detail |
|-------|--------|
| Intent | 見積書作成画面の見積書名フィールドにデフォルト値「見積書」を設定 |
| Requirements | 25.1 |

**変更点**:
- 見積書名入力フィールドの初期値を`'見積書'`に設定

```typescript
// EstimateCreatePage 変更箇所
// 既存: const [name, setName] = useState<string>('');
// 変更: const [name, setName] = useState<string>('見積書');
```

**Implementation Notes**
- 既存のEstimateCreatePageのuseStateの初期値変更のみで対応
- ユーザーはデフォルト値を自由に変更可能
- バリデーションルール（必須、最大200文字）はそのまま適用

### アクションボタン配置改善（REQ-26）

#### EstimateDetailPage変更

| Field | Detail |
|-------|--------|
| Intent | 転記・出力ボタンをサマリーセクションの下に配置し、ヘッダーから除去 |
| Requirements | 26.1, 26.2 |

**変更点**:
- ヘッダー部分から「受領見積書を業者金額に転記」「業者金額を実行金額に転記」「実行金額を見積金額に転記」「出力」ボタンを除去
- サマリーパネルの直後にアクションボタンセクションを新設

**レイアウト変更後**:
```
┌──────────────────────────────────────────────────────┐
│ ヘッダー（見積書名、パンくず、編集・削除ボタンのみ）    │
├──────────────────────────────────────────────────────┤
│ 基本情報パネル                                        │
├──────────────────────────────────────────────────────┤
│ サマリーパネル（見積/実行/業者合計、利益率/値引率）       │
├──────────────────────────────────────────────────────┤
│ アクションボタンセクション                              │
│ [受領見積書を業者金額に転記] [業者金額を実行金額に転記]  │
│ [実行金額を見積金額に転記] [出力]                       │
├──────────────────────────────────────────────────────┤
│ 見積項目セクション（ツールバー + テーブル + 保存ボタン） │
└──────────────────────────────────────────────────────┘
```

**Contracts**: -

```typescript
// アクションボタンセクションの構成
interface ActionButtonsSectionProps {
  onTransferQuotation: () => void; // 受領見積書を業者金額に転記
  onNetAllocation: () => void; // 業者金額を実行金額に転記
  onProfitRate: () => void; // 実行金額を見積金額に転記
  onExport: () => void; // 出力
}
```

**Implementation Notes**
- ボタンは横並びで配置し、画面幅に応じてwrap
- 各ボタンは対応するダイアログを呼び出す既存のハンドラを使用
- ヘッダー部分には編集・削除ボタンのみ残す

### 保存ボタンとクライアントサイド編集（REQ-27）

#### useEstimateEditor拡張 / EstimateDetailPage変更

| Field | Detail |
|-------|--------|
| Intent | 見積項目の編集をクライアントサイドで行い、保存ボタンでまとめてDBに反映 |
| Requirements | 27.1, 27.2, 27.3, 27.4 |

**設計方針**:
- 既存のuseEstimateEditorフックは既にクライアントサイド編集+バッチ保存パターンで設計済み（Performance & Scalabilityセクション参照）
- REQ-27は既存設計の明示的な要件化

**変更点**:

1. **編集モード切替不要化（REQ-27.1）**:
   - 既存の編集モード切り替えを廃止
   - 見積項目の名称・規格・単位・数量・単価・備考を常時インライン編集可能にする
   - EstimateItemRowの入力フィールドを常に有効化（readOnlyを除去）

2. **保存ボタンの追加（REQ-27.2）**:
   - 見積項目セクション内にフローティング保存ボタンを配置
   - ツールバーの右端またはテーブル直下に保存ボタンを表示

3. **バッチ保存の動作（REQ-27.3）**:
   - 既存の`PUT /api/estimates/:id/items/batch` APIを使用
   - `useEstimateEditor.save()`がpendingChangesの差分のみを送信

4. **保存ボタンの無効状態（REQ-27.4）**:
   - `useEstimateEditor.isDirty`がfalseの場合、保存ボタンをdisabled状態で表示

```typescript
// EstimateDetailPage 見積項目セクション内の保存ボタン
interface SaveButtonState {
  isDirty: boolean; // 未保存変更の有無（useEstimateEditor.isDirty）
  isSaving: boolean; // 保存処理中フラグ
}

// 保存ボタンの表示制御
// isDirty === false → disabled
// isSaving === true → ローディング表示
```

**Implementation Notes**
- 既存のuseEstimateEditorフックの`isDirty`と`save()`をそのまま利用
- 保存ボタンのスタイルは既存のプロジェクトのボタンコンポーネントパターンを踏襲
- 保存完了後はisDirtyがfalseにリセットされ、保存ボタンが自動的にdisabledになる

### 表示行フィルター（REQ-28）

#### 新規コンポーネント: LineTypeFilter

| Field | Detail |
|-------|--------|
| Intent | 見積・実行・業者行の表示/非表示を個別に切り替えるフィルターUI |
| Requirements | 28.1, 28.2, 28.3, 28.4 |

**Responsibilities & Constraints**
- 「見積」「実行」「業者」の3つのチェックボックスを提供
- デフォルト値はすべてON
- チェック状態の変更でEstimateItemTableの表示行をフィルタリング

**Dependencies**
- Inbound: EstimateDetailPage — 親コンポーネント (P0)
- Outbound: EstimateItemTable — フィルター状態の受け渡し (P0)

**Contracts**: State [x]

##### State Management

```typescript
interface LineTypeFilterState {
  showEstimate: boolean; // 見積行の表示（デフォルト: true）
  showExecution: boolean; // 実行行の表示（デフォルト: true）
  showVendor: boolean; // 業者行の表示（デフォルト: true）
}

interface LineTypeFilterProps {
  visibleLineTypes: LineTypeFilterState;
  onChange: (state: LineTypeFilterState) => void;
}
```

**UI配置**:
```
┌──────────────────────────────────────────────────────┐
│ 見積項目                                              │
│ [✓見積] [✓実行] [✓業者]               [保存ボタン]   │
├──────────────────────────────────────────────────────┤
│ [+項目追加] [+子項目追加] [複製] [削除] [↰上階層] [↳下]│
├──────────────────────────────────────────────────────┤
│ 種別 │ 見積業者 │ 名称 │ 規格 │ 単位 │ 数量 │ 単価 ...│
│ ─────┼──────────┼──────┼──────┼──────┼──────┼──── ...│
│ ...  │          │      │      │      │      │     ...│
└──────────────────────────────────────────────────────┘
```

#### EstimateItemTable変更

**追加Props**:
```typescript
interface EstimateItemTableProps {
  // 既存props...
  visibleLineTypes: LineTypeFilterState; // 追加: 表示行タイプフィルター
}
```

**フィルタリングロジック**:
- `visibleLineTypes.showEstimate === false` の場合、lineType='ESTIMATE'の行を非表示
- `visibleLineTypes.showExecution === false` の場合、lineType='EXECUTION'の行を非表示
- `visibleLineTypes.showVendor === false` の場合、lineType='VENDOR'の行を非表示
- EstimateItemRowに`visibleLineTypes`を渡し、該当行のレンダリングをスキップ

**Implementation Notes**
- フィルター状態はEstimateDetailPageで管理し、LineTypeFilterとEstimateItemTableの両方に渡す
- 非表示の行のデータ自体は保持し、表示のみ制御（バッチ保存時は全行が対象）
- チェックボックスのUI配置は見積項目セクションのヘッダー部分（ツールバーの上）

### 親項目の単価自動計算制御（REQ-29）

#### EstimateItemRow / EstimateItemTable変更

| Field | Detail |
|-------|--------|
| Intent | 子項目を持つ親項目の単価フィールドを編集不可にし、金額を子項目の合計として自動計算 |
| Requirements | 29.1, 29.2, 29.3 |

**変更点**:

1. **単価フィールドの編集不可化（REQ-29.1）**:
   - EstimateItemRowで`hasChildren`プロパティを追加
   - `hasChildren === true` の場合、3行すべて（見積/実行/業者）の単価フィールドと数量フィールドを`readOnly`にする

2. **子項目合計の自動計算（REQ-29.2）**:
   - 既存のEstimateCalculator.calculateHierarchyAmounts()で対応済み
   - 子項目の金額合計を親項目の金額として表示
   - 親項目の行タイプ別に子項目の同じ行タイプの金額を合算

3. **手動編集可能フィールドの制限（REQ-29.3）**:
   - 子項目を持つ親項目では、名称・規格・単位・備考のみ手動編集可能
   - 数量・単価・金額は自動計算/編集不可

```typescript
// EstimateItemRow 追加props
interface EstimateItemRowProps {
  // 既存props...
  hasChildren: boolean; // 追加: 子項目を持つかどうか
}

// hasChildren === true の場合の動作
// - quantity: readOnly、表示は既存値（又は空白）
// - unitPrice: readOnly、表示は既存値（又は空白）
// - amount: 子項目のamount合計を表示（自動計算）
// - name, specification, unit, remarks: 編集可能
```

**Implementation Notes**
- EstimateItemTableで各項目のchildren.lengthを確認し、hasChildrenフラグを算出
- hasChildren切替時（子項目追加/削除時）に即座にUI状態を更新
- 既存のEstimateCalculator.calculateHierarchyAmounts()の計算結果を表示に使用

### 受領見積書転記ダイアログの選択肢改善（REQ-30）

#### TransferQuotationDialog変更

| Field | Detail |
|-------|--------|
| Intent | 転記先の選択肢を「新規項目として作成」と「既存項目名の子項目として作成」に改善 |
| Requirements | 30.1, 30.2, 30.3 |

**現状分析**:
- 既存のTransferQuotationDialogには転記先見積項目のドロップダウンが実装済み
- 現在は`<option value="">新規項目として作成</option>`と既存項目名のフラットリストを表示

**変更点**:

1. **「新規項目として作成」選択肢（REQ-30.1）**:
   - 既存の実装を維持（ドロップダウンの先頭オプション）

2. **「既存項目名の子項目として作成」選択肢（REQ-30.2）**:
   - 既存項目のドロップダウン表示を「<項目名>の子項目として作成」形式に変更
   - 階層構造を反映したインデントまたはプレフィックスで視覚的に区別

3. **転記動作の変更（REQ-30.3）**:
   - 「<既存項目名>の子項目として作成」選択時、当該項目のparentIdに選択した既存項目IDを設定して転記

```typescript
// TransferQuotationDialog 転記先ドロップダウンの変更
// 既存:
//   <option value="">新規項目として作成</option>
//   <option value="item-1">建築工事</option>
//   <option value="item-2">電気設備工事</option>

// 変更後:
//   <option value="">新規項目として作成</option>
//   <option value="item-1">建築工事 の子項目として作成</option>
//   <option value="item-2">  直接仮設工事 の子項目として作成</option>  ← インデントで階層を表現
//   <option value="item-3">電気設備工事 の子項目として作成</option>

// ドロップダウンの表示ロジック
function buildTargetOptions(items: EstimateItemHierarchy[], depth: number = 0): TargetOption[] {
  const options: TargetOption[] = [];
  for (const item of items) {
    const indent = '\u00A0\u00A0'.repeat(depth); // non-breaking space でインデント
    const estimateLine = item.lines.find(l => l.lineType === 'ESTIMATE');
    const label = `${indent}${estimateLine?.name || '（名称なし）'} の子項目として作成`;
    options.push({ value: item.id, label });
    if (item.children.length > 0) {
      options.push(...buildTargetOptions(item.children, depth + 1));
    }
  }
  return options;
}
```

**Implementation Notes**
- 既存のTransferQuotationDialogの転記先ドロップダウンのオプション生成ロジックを変更
- 階層の深さに応じたインデント表示
- 転記APIの呼び出し時にtargetEstimateItemIdとして選択した項目IDを渡す（既存APIで対応可能）

### NET案分ダイアログの受領見積書情報表示（REQ-31）

#### NetAllocationDialog変更

| Field | Detail |
|-------|--------|
| Intent | NET案分ダイアログに受領見積書の合計金額とNET金額を表示 |
| Requirements | 31.1, 31.2 |

**現状分析**:
- 既存のNetAllocationDialogは受領見積書の合計金額とNET金額の表示を実装済み（コード行377, 399-417に確認済み）
- `quotationTotalAmount`と受領見積書入力値のNET金額が表示されている

**変更点**:

1. **受領見積書合計金額の表示（REQ-31.1）**:
   - 既存実装の確認と表示位置の調整
   - 案分対象業者セクションの下に受領見積書の合計金額を表示

2. **受領見積書のNET金額表示（REQ-31.2）**:
   - 受領見積書登録画面で入力されたNET金額を取得・表示
   - `GET /api/projects/:projectId/quotations` レスポンスから対応する受領見積書のlineItemsのnetAmountフィールドを参照

**データ取得**:
```typescript
// NetAllocationDialog 受領見積書情報取得
// 既存のreceivedQuotationsデータから対象業者の受領見積書を特定
// relatedQuotation.totalAmount: 受領見積書の合計金額
// relatedQuotation.lineItems[].netAmount: 各明細行のNET金額
// 表示: 受領見積書全体のNET金額合計

interface ReceivedQuotationDisplayInfo {
  totalAmount: string | null; // 受領見積書合計金額
  netAmountTotal: string | null; // NET金額合計（各lineItemのnetAmountの合計）
}
```

**Implementation Notes**
- 既存実装では受領見積書の合計金額表示が実装済みであるため、表示位置・フォーマットの確認が主な対応
- NET金額の合計計算は、受領見積書のlineItemsのnetAmountフィールドを合算して算出
- 受領見積書のlineItemsにnetAmountが設定されていない場合は「-」表示

### 見積書出力の行タイプ複数選択（REQ-32, REQ-10更新）

#### EstimateExportDialog変更

| Field | Detail |
|-------|--------|
| Intent | 出力対象の行タイプ（見積/実行/業者）をチェックボックスで複数選択可能にし、選択された行タイプの列を横1列に並べて出力する |
| Requirements | 32.1-32.8, 10.7, 10.9-10.14 |

**現状分析**:
- バックエンド側は既にlineTypeクエリパラメータに対応済み（estimates.routes.tsにlineTypeラベルに基づくファイル名生成ロジックが存在）
- 現行はラジオボタンによる単一選択だが、チェックボックスによる複数選択に変更が必要
- 出力形式のデフォルトがPDFだがExcelに変更が必要
- 列名に行タイプのプレフィックスを付ける必要がある

**変更点**:

1. **チェックボックスへの変更（REQ-32.1）**:
   - ラジオボタンをチェックボックスに変更
   - 「見積」「実行」「業者」の3つのチェックボックスを提供
   - デフォルト値は「見積」のみON（REQ-32.5）
   - 複数選択可能

2. **チェックされた行タイプの出力制御（REQ-32.2, REQ-10.7）**:
   - チェックされた行タイプの列のみを出力対象とする
   - チェックされた行タイプの列を横1列に並べて出力（REQ-10.9）

3. **行タイプ別プレフィックス付き列名（REQ-32.7, REQ-10.10-10.12）**:
   - 見積: 見積名称、見積規格、見積単位、見積数量、見積単価、見積金額、見積備考
   - 実行: 実行名称、実行規格、実行単位、実行数量、実行単価、実行金額、実行備考
   - 業者: 業者名称、業者規格、業者単位、業者数量、業者単価、業者金額、業者備考

4. **チェックされていない列の非表示（REQ-10.13, REQ-32.2）**:
   - チェックされていない行タイプの列は出力しない

5. **出力ファイル名への行タイプラベル含有（REQ-32.3）**:
   - 複数選択時はアンダースコア区切りで結合（例：`_見積_実行`）

6. **APIパラメータの変更（REQ-32.4）**:
   - `lineType`（単一）から`lineTypes`（カンマ区切り複数）に変更
   - 例：`lineTypes=ESTIMATE,EXECUTION`

7. **出力ボタンの無効化（REQ-32.6）**:
   - いずれのチェックボックスもチェックされていない場合、出力ボタンを無効化

8. **デフォルト出力形式の変更（REQ-32.8, REQ-10.14）**:
   - デフォルト出力形式をExcel（.xlsx）に変更

```typescript
// EstimateExportDialog 変更
interface EstimateExportDialogState {
  format: 'pdf' | 'xlsx'; // 既存: 出力形式（デフォルト: 'xlsx' に変更）
  selectedLineTypes: {
    estimate: boolean; // 見積（デフォルト: true）
    execution: boolean; // 実行（デフォルト: false）
    vendor: boolean; // 業者（デフォルト: false）
  };
  isExporting: boolean; // 既存: 出力処理中
}

// 列名定義
const LINE_TYPE_COLUMNS = {
  ESTIMATE: ['見積名称', '見積規格', '見積単位', '見積数量', '見積単価', '見積金額', '見積備考'],
  EXECUTION: ['実行名称', '実行規格', '実行単位', '実行数量', '実行単価', '実行金額', '実行備考'],
  VENDOR: ['業者名称', '業者規格', '業者単位', '業者数量', '業者単価', '業者金額', '業者備考'],
};

// API呼び出し変更
// 既存: GET /api/estimates/:id/export?format=pdf&lineType=ESTIMATE
// 変更: GET /api/estimates/:id/export?format=xlsx&lineTypes=ESTIMATE,EXECUTION
```

##### API Contract変更

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| GET | /api/estimates/:id/export | format: 'pdf' \| 'xlsx', lineTypes: string (カンマ区切り, 例: 'ESTIMATE,EXECUTION') | File binary | 400, 404, 500 |

**ダイアログUI**:
```
┌─────────────────────────────────┐
│ 見積書出力                       │
│                                 │
│ 出力対象:                       │
│   ☑ 見積  ☐ 実行  ☐ 業者       │
│                                 │
│ 出力形式:                       │
│   ○ PDF  ◉ Excel               │
│                                 │
│        [キャンセル] [出力]       │
└─────────────────────────────────┘
```

**出力時の列構成例**（見積＋実行がチェックされた場合）:
```
| 見積名称 | 見積規格 | 見積単位 | 見積数量 | 見積単価 | 見積金額 | 見積備考 | 実行名称 | 実行規格 | 実行単位 | 実行数量 | 実行単価 | 実行金額 | 実行備考 |
```

**出力時の列構成例**（見積のみチェックされた場合）:
```
| 見積名称 | 見積規格 | 見積単位 | 見積数量 | 見積単価 | 見積金額 | 見積備考 |
```

**Implementation Notes**
- バックエンドのlineTypeパラメータを複数対応（lineTypes、カンマ区切り）に拡張が必要
- EstimateExportServiceのExcel/PDF出力ロジックを複数行タイプの列結合に対応させる
- チェックボックスのデフォルト値は「見積」のみON
- 出力形式のデフォルトはExcel（.xlsx）
- いずれもチェックされていない場合は出力ボタンをdisabledに
- 出力処理中インジケーター表示は既存実装を維持

### 案分対象行の合計金額表示（REQ-33）

#### NetAllocationDialog変更

| Field | Detail |
|-------|--------|
| Intent | 案分対象行セクションの一番下に選択済み行の合計金額を表示する |
| Requirements | 33.1, 33.2, 33.3 |

**現状分析**:
- NetAllocationDialog（`frontend/src/components/estimate/NetAllocationDialog.tsx`）は案分対象行をチェックボックス付きリストで表示（Line 319-353）
- 現在は個別行の金額のみ表示し、合計金額の表示がない
- `targetLines`はuseMemoで業者名によりフィルタ済み
- `excludeLineIds`で除外行を管理

**変更点**:

1. **合計金額の算出（REQ-33.1, 33.2）**:
   - `targetLines`から`excludeLineIds`に含まれない行の`amount`を合計
   - useMemoで算出（targetLines, excludeLineIds依存）

2. **合計金額の表示（REQ-33.1）**:
   - 案分対象行リストの下に合計金額行を追加
   - スタイルは太字で背景色付き（目立つ表示）

3. **即座の再計算（REQ-33.2, 33.3）**:
   - チェックボックスの変更によりexcludeLineIdsが更新されると、useMemoが再計算
   - 全チェックOFF時はDecimal(0)が表示される

```typescript
// NetAllocationDialog内に追加するuseMemo
const selectedLinesTotal = useMemo(() => {
  const activeLines = targetLines.filter((l) => !excludeLineIds.includes(l.lineId));
  return activeLines.reduce(
    (sum, l) => sum.add(new Decimal(l.amount || 0)),
    new Decimal(0)
  );
}, [targetLines, excludeLineIds]);
```

**UI追加位置**:
```
┌─────────────────────────────────────┐
│ 案分対象行（除外する行のチェック...）│
│ ☑ 直接仮設工事     100,000円        │
│ ☑ 土工事           200,000円        │
│ ☐ 共通仮設費        50,000円        │
│─────────────────────────────────────│
│ 選択済み合計:       300,000円        │ ← 新規追加
└─────────────────────────────────────┘
```

### NET案分ダイアログの受領見積書情報表示レイアウト変更（REQ-31更新）

#### NetAllocationDialog変更

| Field | Detail |
|-------|--------|
| Intent | 受領見積書合計金額の下にNET金額を縦並びで表示する |
| Requirements | 31.1, 31.2 |

**現状分析**:
- NetAllocationDialog（Line 356-419）は受領見積書の合計金額とNET金額を横並び（grid 2列）で表示
- `gridTemplateColumns: hasNetAmount ? 'repeat(2, 1fr)' : '1fr'` で制御

**変更点**:

1. **レイアウトを縦並びに変更（REQ-31.2）**:
   - `gridTemplateColumns`を常に`'1fr'`に変更
   - 受領見積書合計金額の下にNET金額を表示

```
変更前:
┌──────────────────────────────┐
│ 受領見積書合計金額 │ NET金額   │ ← 横並び
│ 1,000,000円        │ 800,000円│
└──────────────────────────────┘

変更後:
┌──────────────────────────────┐
│ 受領見積書合計金額            │ ← 縦並び
│ 1,000,000円                  │
│ 受領見積書NET金額             │
│ 800,000円                    │
└──────────────────────────────┘
```

### 見積項目の保存と再読み込みの整合性（REQ-34）

#### バグ分析

| Field | Detail |
|-------|--------|
| Intent | 見積項目の追加・削除・編集を保存後に画面再読み込みしても変更が反映されるようにする |
| Requirements | 34.1, 34.2, 34.3, 34.4 |

**根本原因**:

1. **追加・削除が保存されない（REQ-34.1, 34.2, 34.4）**:
   - `EstimateDetailPage.tsx`の`onSave`コールバック（Line 419-457）が`change.type === 'update'`のみ処理
   - `change.type === 'add'`（新規追加）と`change.type === 'delete'`（削除）が完全に無視されている
   - フロントエンドAPI（`frontend/src/api/estimates.ts`）に見積項目の個別作成・削除関数が存在しない

2. **編集内容が保存されない（REQ-34.3）**:
   - `useEstimateEditor.ts`の`updateLine`メソッド（Line 504-549）で、`recordChange`呼び出し時にReactの`items`ステートのクロージャ参照がステール（古い状態）
   - `setItems`はコールバック形式で最新の`prevItems`を使用するが、`recordChange`に渡す`item`は`findItemById(items, itemId)`で取得しており、`items`はクロージャ内の古い値
   - 結果として、変更データが常に1つ前の編集状態で記録される

**修正設計**:

#### 1. フロントエンドAPI関数の追加

```typescript
// frontend/src/api/estimates.ts に追加

/**
 * 見積項目を作成
 */
export async function createEstimateItem(
  estimateId: string,
  item: {
    parentId?: string | null;
    displayOrder: number;
    lines: Array<{
      lineType: string;
      name?: string | null;
      specification?: string | null;
      unit?: string | null;
      quantity?: number | null;
      unitPrice?: number | null;
      remarks?: string | null;
    }>;
  }
): Promise<void> {
  await apiClient.post(`/api/estimates/${estimateId}/items`, item);
}

/**
 * 見積項目を削除
 */
export async function deleteEstimateItem(
  estimateId: string,
  itemId: string
): Promise<void> {
  // NOTE: バックエンドはreq.bodyからforceDeleteを読み取るため、リクエストボディで送信する
  await apiClient.delete(`/api/estimates/${estimateId}/items/${itemId}`, {
    data: { forceDelete: true },
  });
}
```

#### 2. onSaveコールバックの修正（EstimateDetailPage）

```typescript
// EstimateDetailPage.tsx onSave修正
onSave: async (changes) => {
  if (!id) return;

  // 削除処理（先に実行）
  for (const [, change] of changes) {
    if (change.type === 'delete') {
      // temp-で始まるIDはサーバーに存在しないためスキップ
      if (!change.itemId.startsWith('temp-')) {
        await deleteEstimateItem(id, change.itemId);
      }
    }
  }

  // 追加処理
  for (const [, change] of changes) {
    if (change.type === 'add' && change.data) {
      await createEstimateItem(id, {
        parentId: change.data.parentId,
        displayOrder: change.data.displayOrder,
        lines: change.data.lines.map((line) => ({
          lineType: line.lineType,
          name: line.name,
          specification: line.specification,
          unit: line.unit,
          quantity: line.quantity ? parseFloat(line.quantity) || null : null,
          unitPrice: line.unitPrice ? parseFloat(line.unitPrice) || null : null,
          remarks: line.remarks,
        })),
      });
    }
  }

  // 更新処理（items stateから最新データを取得）
  const updateItems = [];
  for (const [, change] of changes) {
    if (change.type === 'update') {
      // editor.itemsから最新データを取得
      const currentItem = findItemInHierarchy(editor.items, change.itemId);
      if (currentItem && !currentItem.id.startsWith('temp-')) {
        updateItems.push({
          id: currentItem.id,
          lines: currentItem.lines.map((line) => ({
            id: line.id,
            lineType: line.lineType,
            name: line.name,
            specification: line.specification,
            unit: line.unit,
            quantity: line.quantity ? parseFloat(line.quantity) || null : null,
            unitPrice: line.unitPrice ? parseFloat(line.unitPrice) || null : null,
            remarks: line.remarks,
          })),
        });
      }
    }
  }

  if (updateItems.length > 0) {
    await batchUpdateEstimateItems(id, updateItems, estimate?.updatedAt ?? '');
  }
},
```

#### 3. useEstimateEditorの修正（updateLineのステールデータ問題）

```typescript
// useEstimateEditor.ts updateLine修正
const updateLine = useCallback(
  (itemId, lineId, field, value) => {
    setItems((prevItems) => {
      const updatedItems = updateItemInHierarchy(prevItems, itemId, (item) => {
        // ... 既存の更新ロジック ...
      });
      const recalculatedItems = recalculateParentAmounts(updatedItems);

      // setItems内で最新データを使ってrecordChangeを呼ぶ
      const updatedItem = findItemById(recalculatedItems, itemId);
      if (updatedItem) {
        // 次のマイクロタスクでrecordChangeを呼ぶ（setItems完了後）
        queueMicrotask(() => recordChange(itemId, 'update', updatedItem));
      }

      return recalculatedItems;
    });
  },
  [recordChange]  // itemsを依存から除去
);
```

**代替案**: `recordChange`を`setItems`のコールバック内に移動するのが最もクリーン:

```typescript
const updateLine = useCallback(
  (itemId, lineId, field, value) => {
    setItems((prevItems) => {
      const updatedItems = updateItemInHierarchy(prevItems, itemId, (item) => {
        // ... 既存の更新ロジック ...
      });
      const recalculatedItems = recalculateParentAmounts(updatedItems);

      // コールバック内で最新データを取得してrecordChangeを呼ぶ
      const updatedItem = findItemById(recalculatedItems, itemId);
      if (updatedItem) {
        recordChange(itemId, 'update', updatedItem);
      }

      return recalculatedItems;
    });
  },
  [recordChange]  // itemsを依存から除去
);
```

**注意**: `recordChange`はsetStateを呼ぶため、`setItems`のコールバック内から呼ぶとReactのバッチ更新に依存する。React 18+ではsetState内でのsetStateは安全にバッチ処理される。
