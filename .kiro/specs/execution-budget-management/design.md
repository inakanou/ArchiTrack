# 技術設計書: 実行予算管理機能

## Overview

本機能は、ArchiTrackのプロジェクト管理ワークフローにおいて、契約金額に基づく工事の実行予算を管理するための機能を提供する。工事担当者は、契約書に紐づく見積書の項目を基盤として実行予算を策定し、発注管理・出来高管理・原価管理を一元的に行う。

**Purpose**: 契約金額と実際の工事コストの差異を可視化し、利益見込額の把握と原価超過の早期検知を実現する。
**Users**: 工事担当者が予算策定・発注・出来高入力・原価追跡のワークフローで利用する。システム管理者がロール別アクセス制御を管理する。
**Impact**: 既存の契約書管理機能・見積書管理機能と連携し、プロジェクト詳細画面に実行予算セクションを追加する。

### Goals
- 契約書に紐づく見積項目から実行予算を作成し、階層構造を保持した一覧表示を提供する
- 協力業者への発注管理（取引先指定、項目選択、金額案分、ステータス管理）を実現する
- 施工日ごとの出来高入力と月別集計を提供する
- 月次締め処理による原価管理を実現する
- Excel/PDFエクスポートで帳票出力をサポートする

### Non-Goals
- 請求書発行機能（将来スコープ）
- 自動仕訳・会計連携
- 月次締めの取り消し機能
- 複数の実行予算を同一プロジェクトに紐付ける機能

### 設計判断
- **出来高金額の意味**: 出来高金額は「その施工日時点での累計進捗金額」を表す。施工日ごとの差分入力ではなく、各項目の到達金額を入力する方式とする。実行予算一覧に表示する出来高金額は、最新施工日のレコードにおける各項目の値を反映する
- **発注取消ステータス**: 発注済ステータスからの取消を可能とする。OrderStatusに「CANCELLED（発注取消）」を追加し、取消時は案分された発注金額をクリアする

## Architecture

> 詳細な調査結果は `research.md` を参照。

### Existing Architecture Analysis

既存の契約書管理機能（Contract → Estimate → EstimateItem → EstimateItemLine）のデータフローを活用する。実行予算作成時に、ContractのestimateIdからEstimateを取得し、EstimateItemの階層構造とEstimateItemLine（EXECUTION行）のデータを実行予算項目として初期化する。

既存パターンとして踏襲する要素:
- Service + Router + Prisma の3層構造
- Router({ mergeParams: true }) によるネストされたプロジェクトルート
- Zodスキーマによるバリデーション + validateミドルウェア
- authenticate + requirePermission ミドルウェアによるアクセス制御
- versionフィールドによる楽観的排他制御
- deletedAtフィールドによる論理削除

### Architecture Pattern & Boundary Map

```mermaid
graph TB
    subgraph Frontend
        PD[ProjectDetailPage]
        EBP[ExecutionBudgetPage]
        ODP[OrderDetailPage]
        PIP[ProgressInputPage]
    end

    subgraph Backend API
        EBR[ExecutionBudget Routes]
        OR[Order Routes]
        PR[Progress Routes]
        CR[Cost Routes]
        MCR[MonthlyClose Routes]
        EXR[Export Routes]
    end

    subgraph Services
        EBS[ExecutionBudgetService]
        OS[OrderService]
        PS[ProgressService]
        CS[CostService]
        MCS[MonthlyCloseService]
        EXS[ExportService]
    end

    subgraph Database
        DB[(PostgreSQL)]
    end

    subgraph Existing
        ContractSvc[ContractService]
        EstimateSvc[EstimateService]
    end

    PD --> EBR
    EBP --> EBR
    EBP --> OR
    EBP --> CR
    EBP --> MCR
    ODP --> OR
    ODP --> EXR
    PIP --> PR

    EBR --> EBS
    OR --> OS
    PR --> PS
    CR --> CS
    MCR --> MCS
    EXR --> EXS

    EBS --> DB
    OS --> DB
    PS --> DB
    CS --> DB
    MCS --> DB
    EXS --> DB

    EBS --> ContractSvc
    EBS --> EstimateSvc
```

**Architecture Integration**:
- Selected pattern: 既存の Service + Router + Prisma 3層構造を踏襲
- Domain boundaries: 実行予算・発注・出来高・原価の4つのドメインでサービスを分離
- Existing patterns preserved: mergeParams、Zod validation、authenticate/authorize、楽観的排他制御、論理削除
- New components rationale: 各ドメインの責務分離とテスタビリティ確保のため個別サービスを作成
- Steering compliance: TypeScript型安全性、Prisma ORMによる型安全データアクセス、RESTful API設計

### Technology Stack

| Layer | Choice / Version | Role in Feature | Notes |
|-------|------------------|-----------------|-------|
| Frontend | React 19 + TypeScript 5.9 | 実行予算UI、発注UI、出来高入力UI | 既存スタック |
| Backend | Express 5 + TypeScript 5.9 | RESTful API | 既存スタック |
| ORM | Prisma 7.3 | データアクセス・マイグレーション | 既存スタック |
| Data | PostgreSQL 15 | メインデータストア | Decimal(15,0)で金額管理 |
| Validation | Zod 4.3 | API入力バリデーション | 既存スタック |
| 金額計算 | decimal.js 10.6 | 高精度10進数演算・案分計算 | 既存導入済み |
| PDF生成 | jsPDF 4.x | 発注一覧・出来高PDF出力 | 既存導入済み |
| Excel生成 | xlsx 0.20 (SheetJS) | 発注一覧・出来高Excel出力 | 既存導入済み |

## System Flows

### 実行予算作成フロー

```mermaid
sequenceDiagram
    actor User as 工事担当者
    participant UI as ExecutionBudgetPage
    participant API as ExecutionBudget API
    participant SVC as ExecutionBudgetService
    participant DB as PostgreSQL

    User->>UI: 実行予算作成ボタン押下
    UI->>API: GET /api/projects/:projectId/contracts
    API-->>UI: 契約済み契約書一覧
    User->>UI: 契約書選択・確定
    UI->>API: POST /api/projects/:projectId/execution-budget
    API->>SVC: create(projectId, contractId)
    SVC->>DB: 既存実行予算の存在チェック
    SVC->>DB: Contract + Estimate + EstimateItems取得
    SVC->>SVC: EstimateItemLine EXECUTION行から項目初期化
    SVC->>SVC: VENDOR行のsourceVendorNameから発注予定取引先設定
    SVC->>DB: ExecutionBudget + ExecutionBudgetItems一括作成
    DB-->>SVC: 作成結果
    SVC-->>API: ExecutionBudget
    API-->>UI: 201 Created
```

### 発注金額確定・案分フロー

```mermaid
sequenceDiagram
    actor User as 工事担当者
    participant UI as OrderDetailPage
    participant API as Order API
    participant SVC as OrderService
    participant DB as PostgreSQL

    User->>UI: ステータスを発注済に変更
    UI->>API: PATCH /api/projects/:projectId/execution-budget/orders/:orderId/status
    API->>SVC: updateStatus(orderId, ORDERED)
    SVC->>DB: 確定発注金額の入力チェック
    SVC->>SVC: チェック済み項目の実行金額比率で案分計算
    SVC->>SVC: 端数を最大金額項目に加算
    SVC->>DB: OrderItems.orderAmount一括更新
    SVC->>DB: Order.status = ORDERED更新
    DB-->>SVC: 更新結果
    SVC-->>API: Order
    API-->>UI: 200 OK
```

### 月次締めフロー

```mermaid
sequenceDiagram
    actor User as 工事担当者
    participant UI as ExecutionBudgetPage
    participant API as MonthlyClose API
    participant SVC as MonthlyCloseService
    participant DB as PostgreSQL

    User->>UI: 月次締めボタン押下
    UI->>API: POST /api/projects/:projectId/execution-budget/monthly-close
    API->>SVC: close(executionBudgetId, targetMonth)
    SVC->>DB: 同月の締め済みチェック
    SVC->>DB: 全項目のcurrentMonthExpenseをpreviousMonthExpenseに累積
    SVC->>DB: 全項目のcurrentMonthExpenseを0にリセット
    SVC->>DB: MonthlyCloseHistory作成
    DB-->>SVC: 完了
    SVC-->>API: MonthlyCloseHistory
    API-->>UI: 201 Created
```

## Requirements Traceability

| Requirement | Summary | Components | Interfaces | Flows |
|-------------|---------|------------|------------|-------|
| 1.1-1.7 | 実行予算の作成 | ExecutionBudgetService, ExecutionBudgetPage | POST /execution-budget | 実行予算作成フロー |
| 2.1-2.3 | 実行予算の削除 | ExecutionBudgetService | DELETE /execution-budget | - |
| 3.1-3.10 | 実行予算項目一覧表示 | ExecutionBudgetPage, ExecutionBudgetService | GET /execution-budget | - |
| 4.1-4.5 | 実行予算項目の編集 | ExecutionBudgetService | PATCH /execution-budget/items | - |
| 5.1-5.3 | 発注一覧表示 | OrderListSection, OrderService | GET /orders | - |
| 6.1-6.8 | 発注の作成と取引先指定 | OrderDetailPage, OrderService | POST /orders | - |
| 7.1-7.5 | 発注の編集と削除 | OrderDetailPage, OrderService | PATCH/DELETE /orders | - |
| 8.1-8.7 | 発注金額の確定と案分 | OrderService | PATCH /orders/:id/status | 発注金額確定・案分フロー |
| 9.1-9.3 | 発注ステータスの実行予算反映 | ExecutionBudgetPage | GET /execution-budget | - |
| 10.1-10.4 | 発注一覧のエクスポート | ExportService | GET /orders/:id/export | - |
| 11.1-11.11 | 出来高入力機能 | ProgressInputPage, ProgressService | POST /progress | - |
| 12.1-12.7 | 出来高の履歴管理 | ProgressService | GET/PUT/DELETE /progress | - |
| 13.1-13.8 | 原価管理 | CostService, ExecutionBudgetPage | PATCH /items/:id/cost | - |
| 14.1-14.5 | 月次締め処理 | MonthlyCloseService | POST /monthly-close | 月次締めフロー |
| 15.1-15.8 | 契約変更への対応 | ExecutionBudgetService | POST /apply-amendment | - |
| 16.1-16.5 | 月別出来高集計 | ProgressService, ExportService | GET /progress/monthly | - |
| 17.1-17.6 | アクセス制御（Requirement 20 の案件の閲覧範囲で読む。2026-10-27 改訂） | authorize middleware | requirePermission | - |
| 18.1-18.5 | 数値計算の精度と表示 | decimal.js, フロントエンドフォーマッタ | - | - |
| 19.1-19.9 | データ永続化とAPI設計 | 全Service, 全Route | 全API | - |
| 20.1-20.8 | 案件の閲覧範囲と出力の記録 | 実行予算・発注・出来高・原価・月次締め・出力の経路, 子リソースの所属の照合, 出力の記録, 出力のエラー表示 | requireProjectScope, ExportAuditService | - |

> **改訂（2026-10-27、利用者の判断。タスク17）**: 17.1〜17.6 の条文は、ロールによる許可が user-authentication の要件39 の案件の閲覧範囲に含まれるプロジェクトについて働き、範囲外は存在しない場合と同じ 404 とするよう改訂した（requirements.md の Requirement 17 の改訂の記録を参照）。設計上の読み方は「Requirement 20: 案件の閲覧範囲と出力の記録の適用」章の「要件 17.1〜17.6 の読み替え」節に記す。

## Components and Interfaces

| Component | Domain/Layer | Intent | Req Coverage | Key Dependencies (P0/P1) | Contracts |
|-----------|--------------|--------|--------------|--------------------------|-----------|
| ExecutionBudgetService | Backend/Service | 実行予算のCRUD・契約変更反映 | 1, 2, 3, 4, 15 | ContractService (P0), Prisma (P0) | Service, API |
| OrderService | Backend/Service | 発注のCRUD・案分計算・ステータス管理 | 5, 6, 7, 8, 9 | ExecutionBudgetService (P0), Prisma (P0), decimal.js (P1) | Service, API |
| ProgressService | Backend/Service | 出来高入力・履歴管理・月別集計 | 11, 12, 16 | Prisma (P0) | Service, API |
| CostService | Backend/Service | 原価（支出実績）のCRUD | 13 | Prisma (P0) | Service, API |
| MonthlyCloseService | Backend/Service | 月次締め処理・履歴管理 | 14 | Prisma (P0), CostService (P1) | Service, API |
| ExportService | Backend/Service | Excel/PDFエクスポート | 10, 16 | jsPDF (P1), xlsx (P1) | API |
| ExecutionBudgetPage | Frontend/Page | 実行予算一覧・編集・発注一覧・原価表示 | 3, 4, 5, 9, 13 | API Client (P0) | State |
| OrderDetailPage | Frontend/Page | 発注詳細・項目選択・ステータス変更 | 6, 7, 8 | API Client (P0) | State |
| ProgressInputPage | Frontend/Page | 出来高入力UI | 11, 12 | API Client (P0) | State |

### Backend / Service Layer

#### ExecutionBudgetService

| Field | Detail |
|-------|--------|
| Intent | プロジェクトに紐づく実行予算のライフサイクル管理（作成・表示・編集・削除・契約変更反映） |
| Requirements | 1.1-1.7, 2.1-2.3, 3.1-3.10, 4.1-4.5, 15.1-15.8 |

**Responsibilities & Constraints**
- 実行予算の作成（Contract → Estimate → EstimateItem → EstimateItemLine EXECUTION行からの初期化）
- プロジェクトに対して1つの実行予算のみ存在可能（ユニーク制約）
- 実行予算項目の階層構造保持（見積書のparentId構造をコピー）
- 楽観的排他制御による同時編集防止
- 論理削除（発注済みの発注が存在する場合は削除不可）
- 変更契約の反映（項目差分の追加・更新・論理削除）

**Dependencies**
- Inbound: execution-budget.routes — HTTP API (P0)
- Outbound: Prisma Client — データアクセス (P0)
- Outbound: ContractService — 契約書データ取得 (P0)
- External: decimal.js — 金額計算 (P1)

**Contracts**: Service [x] / API [x] / Event [ ] / Batch [ ] / State [ ]

##### Service Interface
```typescript
interface ExecutionBudgetService {
  create(projectId: string, contractId: string): Promise<ExecutionBudget>;
  findByProjectId(projectId: string): Promise<ExecutionBudget | null>;
  getWithItems(executionBudgetId: string): Promise<ExecutionBudgetWithItems>;
  updateItem(itemId: string, data: UpdateExecutionBudgetItemInput, version: number): Promise<ExecutionBudgetItem>;
  delete(executionBudgetId: string): Promise<void>;
  applyAmendment(executionBudgetId: string, contractId: string): Promise<ExecutionBudgetWithItems>;
}
```
- Preconditions: projectIdに紐づくProjectが存在する。create時に既存実行予算が存在しない
- Postconditions: 作成後、全EstimateItemに対応するExecutionBudgetItemが生成される
- Invariants: プロジェクトに対して実行予算は最大1つ

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| POST | /api/projects/:projectId/execution-budget | { contractId } | ExecutionBudget | 400, 404, 409 |
| GET | /api/projects/:projectId/execution-budget | - | ExecutionBudgetWithItems | 404 |
| DELETE | /api/projects/:projectId/execution-budget | - | 204 | 400, 404 |
| PATCH | /api/projects/:projectId/execution-budget/items/:itemId | { executionUnitPrice?, remarks?, version } | ExecutionBudgetItem | 400, 404, 409 |
| POST | /api/projects/:projectId/execution-budget/apply-amendment | { contractId } | ExecutionBudgetWithItems | 400, 404 |

**Implementation Notes**
- Integration: 契約書選択ダイアログのUI実装はフロントエンド側で既存ContractListAPIを再利用
- Validation: contractIdの存在チェック、契約ステータスが「契約済」であることの検証
- Risks: 大量のEstimateItem（数百項目）の一括作成時のパフォーマンス。トランザクション内でcreateMany使用

#### OrderService

| Field | Detail |
|-------|--------|
| Intent | 発注のライフサイクル管理（作成・編集・削除・ステータス遷移・案分計算） |
| Requirements | 5.1-5.3, 6.1-6.8, 7.1-7.5, 8.1-8.7, 9.1-9.3 |

**Responsibilities & Constraints**
- 発注の作成（取引先指定、発注予定取引先が一致する項目の自動チェック）
- 発注項目のチェック追加・削除
- ステータス管理（BEFORE_ORDER → UNDER_REVIEW → ORDERED → CANCELLED）
- 発注済時の案分計算（確定発注金額をチェック済み項目の実行金額比率で配分）
- 案分端数処理（最大金額項目に1円未満の端数を加算）
- 発注取消時の案分済み発注金額クリア
- 発注済ステータスでの編集禁止（取消のみ可能）

**Dependencies**
- Inbound: order.routes — HTTP API (P0)
- Outbound: Prisma Client — データアクセス (P0)
- External: decimal.js — 案分計算 (P0)

**Contracts**: Service [x] / API [x] / Event [ ] / Batch [ ] / State [x]

##### Service Interface
```typescript
interface OrderService {
  create(executionBudgetId: string, tradingPartnerId: string): Promise<Order>;
  findByExecutionBudgetId(executionBudgetId: string): Promise<OrderSummary[]>;
  getWithItems(orderId: string): Promise<OrderWithItems>;
  update(orderId: string, data: UpdateOrderInput): Promise<Order>;
  updateItems(orderId: string, itemIds: string[]): Promise<OrderWithItems>;
  updateStatus(orderId: string, status: OrderStatus, confirmedAmount?: Decimal): Promise<Order>;
  delete(orderId: string): Promise<void>;
}
```
- Preconditions: create時にexecutionBudgetIdに紐づく実行予算が存在する
- Postconditions: ステータスORDERED変更後、全チェック済み項目にorderAmountが設定される
- Invariants: 確定発注金額 = 全チェック済み項目のorderAmount合計

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| GET | /api/projects/:projectId/execution-budget/orders | - | OrderSummary[] | 404 |
| POST | /api/projects/:projectId/execution-budget/orders | { tradingPartnerId } | Order | 400, 404 |
| GET | /api/projects/:projectId/execution-budget/orders/:orderId | - | OrderWithItems | 404 |
| PATCH | /api/projects/:projectId/execution-budget/orders/:orderId | { tradingPartnerId?, confirmedAmount? } | Order | 400, 404, 409 |
| PUT | /api/projects/:projectId/execution-budget/orders/:orderId/items | { itemIds: string[] } | OrderWithItems | 400, 404, 409 |
| PATCH | /api/projects/:projectId/execution-budget/orders/:orderId/status | { status, confirmedAmount? } | Order | 400, 404, 409, 422 |
| DELETE | /api/projects/:projectId/execution-budget/orders/:orderId | - | 204 | 400, 404, 409 |

##### State Management
- State model: OrderStatus enum (BEFORE_ORDER, UNDER_REVIEW, ORDERED, CANCELLED)
- Persistence: Prismaで永続化、statusフィールド
- Concurrency: 楽観的排他制御（versionフィールド）

**Implementation Notes**
- Integration: TradingPartnerSelectコンポーネント（既存）を発注取引先選択で再利用
- Validation: ステータスORDERED変更時にconfirmedAmountの必須チェック。発注済ステータスでの編集操作拒否（取消のみ許可）
- Risks: 案分計算の端数処理テストを網羅的に実施する必要がある。発注取消時の金額クリア処理の整合性確認

#### ProgressService

| Field | Detail |
|-------|--------|
| Intent | 施工日ごとの出来高入力・履歴管理・月別集計 |
| Requirements | 11.1-11.11, 12.1-12.7, 16.1-16.5 |

**Responsibilities & Constraints**
- 施工日ごとの出来高レコード管理（作成・更新・削除）
- 同一施工日への上書き保存
- 出来高率の自動計算（出来高金額 / 実行金額 x 100）
- 出来高金額の下限制約（0円未満にならない）
- 月別出来高集計

**Dependencies**
- Inbound: progress.routes — HTTP API (P0)
- Outbound: Prisma Client — データアクセス (P0)

**Contracts**: Service [x] / API [x] / Event [ ] / Batch [ ] / State [ ]

##### Service Interface
```typescript
interface ProgressService {
  save(executionBudgetId: string, data: SaveProgressInput): Promise<ProgressRecord>;
  findByExecutionBudgetId(executionBudgetId: string): Promise<ProgressRecordSummary[]>;
  getByDate(executionBudgetId: string, constructionDate: Date): Promise<ProgressRecordWithItems>;
  delete(progressRecordId: string): Promise<void>;
  getMonthlyAggregation(executionBudgetId: string): Promise<MonthlyProgressSummary[]>;
  getMonthlyDetail(executionBudgetId: string, yearMonth: string): Promise<ProgressRecordWithItems[]>;
}
```

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| POST | /api/projects/:projectId/execution-budget/progress | { constructionDate, items: [{itemId, amount}] } | ProgressRecord | 400, 404 |
| GET | /api/projects/:projectId/execution-budget/progress | ?sort=desc | ProgressRecordSummary[] | 404 |
| GET | /api/projects/:projectId/execution-budget/progress/:date | - | ProgressRecordWithItems | 404 |
| DELETE | /api/projects/:projectId/execution-budget/progress/:progressRecordId | - | 204 | 404 |
| GET | /api/projects/:projectId/execution-budget/progress/monthly | - | MonthlyProgressSummary[] | 404 |
| GET | /api/projects/:projectId/execution-budget/progress/monthly/:yearMonth | - | ProgressRecordWithItems[] | 404 |

**Implementation Notes**
- Integration: カレンダー選択はフロントエンド側のHTML date inputまたはカスタムコンポーネント
- Validation: 出来高金額 >= 0 の制約。constructionDateの妥当性チェック
- Risks: 大量の出来高履歴データの月別集計パフォーマンス。日付インデックスで対応

#### CostService

| Field | Detail |
|-------|--------|
| Intent | 各実行予算項目の支出実績（今月の支出）を管理 |
| Requirements | 13.1-13.8 |

**Responsibilities & Constraints**
- 今月の支出の入力・更新
- 累計支出の自動計算（先月までの支出 + 今月の支出）
- 残予算の自動計算（実行金額 - 累計支出）
- 支出超過時の警告フラグ

**Dependencies**
- Inbound: cost.routes — HTTP API (P0)
- Outbound: Prisma Client — データアクセス (P0)

**Contracts**: Service [x] / API [x] / Event [ ] / Batch [ ] / State [ ]

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| PATCH | /api/projects/:projectId/execution-budget/items/:itemId/cost | { currentMonthExpense } | ExecutionBudgetItem | 400, 404, 409 |

**Implementation Notes**
- Integration: 実行予算一覧画面のインライン編集として提供
- Validation: currentMonthExpense >= 0

#### MonthlyCloseService

| Field | Detail |
|-------|--------|
| Intent | 月次締め処理の実行と履歴管理 |
| Requirements | 14.1-14.5 |

**Responsibilities & Constraints**
- 月次締め処理（currentMonthExpenseをpreviousMonthExpenseに累積、currentMonthExpenseをリセット）
- 同一月の重複締め防止
- 月次締め履歴の記録と一覧表示
- トランザクション内での一括更新

**Dependencies**
- Inbound: monthly-close.routes — HTTP API (P0)
- Outbound: Prisma Client — データアクセス (P0)

**Contracts**: Service [x] / API [x] / Event [ ] / Batch [ ] / State [ ]

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| POST | /api/projects/:projectId/execution-budget/monthly-close | { targetMonth: "YYYY-MM" } | MonthlyCloseHistory | 400, 404, 409 |
| GET | /api/projects/:projectId/execution-budget/monthly-close | - | MonthlyCloseHistory[] | 404 |

**Implementation Notes**
- Integration: 実行予算画面の月次締めボタンから呼び出し
- Validation: targetMonthの形式チェック、重複締めチェック
- Risks: 大量項目の一括更新。Prisma updateManyでトランザクション内実行

#### ExportService

| Field | Detail |
|-------|--------|
| Intent | 発注一覧・月別出来高のExcel/PDFエクスポート |
| Requirements | 10.1-10.4, 16.4-16.5 |

**Responsibilities & Constraints**
- 発注チェック済み項目一覧のExcel/PDF出力
- ヘッダー情報（発注取引先名、発注日、確定発注金額）の出力
- 発注済ステータス時の発注金額列追加
- 月別出来高データのExcel/PDF出力

**Dependencies**
- Inbound: export.routes — HTTP API (P0)
- External: jsPDF — PDF生成 (P1)
- External: xlsx (SheetJS) — Excel生成 (P1)

**Contracts**: Service [ ] / API [x] / Event [ ] / Batch [ ] / State [ ]

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| GET | /api/projects/:projectId/execution-budget/orders/:orderId/export | ?format=xlsx\|pdf | Binary file | 400, 404 |
| GET | /api/projects/:projectId/execution-budget/progress/monthly/export | ?format=xlsx\|pdf | Binary file | 400, 404 |

### Frontend / Page Layer

#### ExecutionBudgetPage

| Field | Detail |
|-------|--------|
| Intent | 実行予算の一覧表示・編集・発注一覧・原価表示を統合するメインページ |
| Requirements | 1.1-1.7, 3.1-3.10, 4.1-4.5, 5.1-5.3, 9.1-9.3, 13.1-13.8, 14.1-14.5 |

**Responsibilities & Constraints**
- 実行予算項目のツリー表示（折り畳み・展開）
- 各列の表示（予算関連・発注関連・原価関連・出来高関連）
- 親項目の合計値自動計算（フロントエンド側で計算）
- 合計行表示
- 実行単価のインライン編集
- 契約金額と実行金額の差額（利益見込額）表示
- 金額の3桁区切りカンマ付き表示、負値の赤色表示

**Dependencies**
- Outbound: API Client — 全API呼び出し (P0)

**Contracts**: Service [ ] / API [ ] / Event [ ] / Batch [ ] / State [x]

##### State Management
- State model: React useState/useReducerによるローカルステート。ツリー展開状態、編集中フラグ、フィルタ条件
- Persistence: APIからの取得データをステートに保持。編集はPATCHで即時保存
- Concurrency: 楽観的排他制御（version）。競合時はエラー表示と再取得

**Implementation Notes**
- Integration: プロジェクト詳細画面にExecutionBudgetSectionCardを追加し、実行予算ページへのリンクを提供
- Validation: 実行単価は0以上の数値。金額フォーマッタでDecimal表示
- Risks: 数百項目のツリー表示パフォーマンス。仮想スクロール（将来対応）またはページネーション検討

#### OrderDetailPage

| Field | Detail |
|-------|--------|
| Intent | 発注詳細の表示・項目選択・ステータス変更 |
| Requirements | 6.1-6.8, 7.1-7.5, 8.1-8.7 |

**Responsibilities & Constraints**
- 発注取引先の選択（TradingPartnerSelectコンポーネント再利用）
- 見積項目のチェックボックスによる選択
- チェック済み項目の合計実行金額自動計算
- 確定発注金額の入力
- ステータス遷移UI
- 発注済ステータスでの編集ロック

**Implementation Notes**
- Integration: TradingPartnerSelectを再利用。チェック状態はローカルステートで管理し、保存ボタンでAPI送信
- Risks: 発注済ステータスへの変更は確認ダイアログを表示。発注取消時も確認ダイアログを表示し、案分済み発注金額がクリアされる旨を警告

#### ProgressInputPage

| Field | Detail |
|-------|--------|
| Intent | 施工日ごとの出来高入力UI |
| Requirements | 11.1-11.11, 12.1-12.7 |

**Responsibilities & Constraints**
- 施工日のカレンダー選択
- 各項目の出来高金額入力（即0%/50%/100%ボタン、+5%/-5%ボタン、直接入力）
- 出来高率の自動計算表示
- 出来高合計金額・合計率の表示
- 出来高履歴一覧と過去レコードの読み込み

**Implementation Notes**
- Integration: 出来高入力ボタン群はカスタムコンポーネントとして実装。実行金額を基準に%計算
- Risks: 出来高金額の0円下限制約のフロントエンドバリデーション

## Data Models

### Domain Model

実行予算ドメインは以下の集約で構成される:

- **ExecutionBudget（集約ルート）**: プロジェクトに1つだけ存在する実行予算
- **ExecutionBudgetItem（エンティティ）**: 見積項目に対応する実行予算の各行
- **Order（集約ルート）**: 実行予算に紐づく発注
- **OrderItem（エンティティ）**: 発注に含まれる見積項目の選択状態
- **ProgressRecord（集約ルート）**: 施工日ごとの出来高レコード
- **ProgressRecordItem（エンティティ）**: 出来高レコードの項目別金額
- **MonthlyCloseHistory（エンティティ）**: 月次締め履歴

**Business Rules & Invariants**:
- プロジェクト : 実行予算 = 1 : 0..1
- 実行予算 : 契約書 = 1 : 1
- 実行金額 = 数量 x 実行単価
- 累計支出 = 先月までの支出 + 今月の支出
- 残予算 = 実行金額 - 累計支出
- 出来高率 = 出来高金額 / 実行金額 x 100
- 確定発注金額 = SUM(チェック済み項目のorderAmount)
- 発注済ステータスの発注は編集不可（取消のみ可能）
- 発注取消時は案分済み発注金額をクリアし、ステータスをCANCELLEDに変更
- 発注済の発注が存在する実行予算は削除不可

```mermaid
erDiagram
    Project ||--o| ExecutionBudget : has
    Contract ||--|| ExecutionBudget : source
    ExecutionBudget ||--|{ ExecutionBudgetItem : contains
    ExecutionBudgetItem ||--o| EstimateItem : references
    ExecutionBudgetItem }o--o| TradingPartner : plannedVendor
    ExecutionBudget ||--o{ Order : has
    Order }o--|| TradingPartner : orderedTo
    Order ||--|{ OrderItem : contains
    OrderItem }o--|| ExecutionBudgetItem : references
    ExecutionBudget ||--o{ ProgressRecord : has
    ProgressRecord ||--|{ ProgressRecordItem : contains
    ProgressRecordItem }o--|| ExecutionBudgetItem : references
    ExecutionBudget ||--o{ MonthlyCloseHistory : has
```

### Logical Data Model

**Structure Definition**:
- ExecutionBudget → ExecutionBudgetItem: 1対多（カスケード削除）
- ExecutionBudgetItem → EstimateItem: 参照（見積書削除時はSetNull）
- ExecutionBudget → Order: 1対多（カスケード削除）
- Order → OrderItem: 1対多（カスケード削除）
- OrderItem → ExecutionBudgetItem: 参照
- ExecutionBudget → ProgressRecord: 1対多（カスケード削除）
- ProgressRecord → ProgressRecordItem: 1対多（カスケード削除）

**Consistency & Integrity**:
- 実行予算の作成・削除はトランザクション内で実行
- 発注ステータス変更と案分計算はトランザクション内で実行
- 月次締め処理はトランザクション内で一括更新
- 楽観的排他制御（versionフィールド）で同時編集を検出

### Physical Data Model

#### execution_budgets テーブル

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT uuid() | 実行予算ID |
| projectId | UUID | FK → projects.id, UNIQUE | プロジェクトID |
| contractId | UUID | FK → contracts.id | 契約書ID |
| version | INT | DEFAULT 0 | 楽観的排他制御用バージョン |
| createdAt | TIMESTAMP | DEFAULT now() | 作成日時 |
| updatedAt | TIMESTAMP | @updatedAt | 更新日時 |
| deletedAt | TIMESTAMP | NULLABLE | 論理削除日時 |

Indexes: projectId (UNIQUE), contractId

#### execution_budget_items テーブル

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT uuid() | 項目ID |
| executionBudgetId | UUID | FK → execution_budgets.id, CASCADE | 実行予算ID |
| estimateItemId | UUID | FK → estimate_items.id, SET NULL, NULLABLE | 参照元見積項目ID |
| parentId | UUID | FK → self, CASCADE, NULLABLE | 親項目ID |
| displayOrder | INT | NOT NULL | 表示順序 |
| name | VARCHAR(200) | NULLABLE | 項目名 |
| specification | VARCHAR(500) | NULLABLE | 規格 |
| unit | VARCHAR(50) | NULLABLE | 単位 |
| quantity | DECIMAL(15,4) | NULLABLE | 数量 |
| estimateUnitPrice | DECIMAL(15,2) | NULLABLE | 見積単価 |
| estimateAmount | DECIMAL(15,0) | NULLABLE | 見積金額 |
| executionUnitPrice | DECIMAL(15,2) | NULLABLE | 実行単価 |
| executionAmount | DECIMAL(15,0) | NULLABLE | 実行金額 |
| amendmentAmount | DECIMAL(15,0) | DEFAULT 0 | 変更金額 |
| previousMonthExpense | DECIMAL(15,0) | DEFAULT 0 | 先月までの支出 |
| currentMonthExpense | DECIMAL(15,0) | DEFAULT 0 | 今月の支出 |
| plannedVendorId | UUID | FK → trading_partners.id, SET NULL, NULLABLE | 発注予定取引先ID |
| amendmentStatus | ENUM | NULLABLE | 変更ステータス（AMENDMENT_DELETED等） |
| remarks | TEXT | NULLABLE | 備考 |
| createdAt | TIMESTAMP | DEFAULT now() | 作成日時 |
| updatedAt | TIMESTAMP | @updatedAt | 更新日時 |

Indexes: executionBudgetId, parentId, estimateItemId, plannedVendorId

#### orders テーブル

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT uuid() | 発注ID |
| executionBudgetId | UUID | FK → execution_budgets.id, CASCADE | 実行予算ID |
| tradingPartnerId | UUID | FK → trading_partners.id | 発注取引先ID |
| status | ENUM | DEFAULT BEFORE_ORDER | 発注ステータス |
| confirmedAmount | DECIMAL(15,0) | NULLABLE | 確定発注金額 |
| version | INT | DEFAULT 0 | 楽観的排他制御用 |
| createdAt | TIMESTAMP | DEFAULT now() | 作成日時 |
| updatedAt | TIMESTAMP | @updatedAt | 更新日時 |
| deletedAt | TIMESTAMP | NULLABLE | 論理削除日時 |

Indexes: executionBudgetId, tradingPartnerId, status

#### order_items テーブル

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT uuid() | 発注項目ID |
| orderId | UUID | FK → orders.id, CASCADE | 発注ID |
| executionBudgetItemId | UUID | FK → execution_budget_items.id | 実行予算項目ID |
| checked | BOOLEAN | DEFAULT false | チェック状態 |
| orderAmount | DECIMAL(15,0) | NULLABLE | 案分後の発注金額 |
| createdAt | TIMESTAMP | DEFAULT now() | 作成日時 |
| updatedAt | TIMESTAMP | @updatedAt | 更新日時 |

Indexes: orderId, executionBudgetItemId, UNIQUE(orderId, executionBudgetItemId)

#### progress_records テーブル

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT uuid() | 出来高レコードID |
| executionBudgetId | UUID | FK → execution_budgets.id, CASCADE | 実行予算ID |
| constructionDate | DATE | NOT NULL | 施工日 |
| createdAt | TIMESTAMP | DEFAULT now() | 作成日時 |
| updatedAt | TIMESTAMP | @updatedAt | 更新日時 |

Indexes: executionBudgetId, UNIQUE(executionBudgetId, constructionDate)

#### progress_record_items テーブル

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT uuid() | 出来高項目ID |
| progressRecordId | UUID | FK → progress_records.id, CASCADE | 出来高レコードID |
| executionBudgetItemId | UUID | FK → execution_budget_items.id | 実行予算項目ID |
| amount | DECIMAL(15,0) | DEFAULT 0 | 出来高金額 |
| createdAt | TIMESTAMP | DEFAULT now() | 作成日時 |
| updatedAt | TIMESTAMP | @updatedAt | 更新日時 |

Indexes: progressRecordId, executionBudgetItemId, UNIQUE(progressRecordId, executionBudgetItemId)

#### monthly_close_histories テーブル

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT uuid() | 月次締め履歴ID |
| executionBudgetId | UUID | FK → execution_budgets.id, CASCADE | 実行予算ID |
| targetMonth | VARCHAR(7) | NOT NULL | 締め対象月（YYYY-MM） |
| closedById | UUID | FK → users.id | 実行者ID |
| closedAt | TIMESTAMP | DEFAULT now() | 締め日時 |

Indexes: executionBudgetId, UNIQUE(executionBudgetId, targetMonth)

### Data Contracts & Integration

**API Data Transfer**:
- Request/Response: JSON形式
- 金額フィールド: 文字列として送受信（JavaScriptの数値精度問題を回避）
- バリデーション: Zodスキーマで入力検証

**Enumeration Types**:
```typescript
enum OrderStatus {
  BEFORE_ORDER = 'BEFORE_ORDER'       // 発注前
  UNDER_REVIEW = 'UNDER_REVIEW'       // 発注金額検討中
  ORDERED = 'ORDERED'                 // 発注済
  CANCELLED = 'CANCELLED'             // 発注取消
}

enum AmendmentStatus {
  AMENDMENT_DELETED = 'AMENDMENT_DELETED'  // 変更削除
}
```

## Error Handling

### Error Strategy
既存のApiErrorクラスを拡張し、実行予算ドメイン固有のエラークラスを定義する。

### Error Categories and Responses

**User Errors (4xx)**:
- 400 Bad Request: バリデーションエラー（Zodスキーマ不適合、金額フォーマット不正）
- 404 Not Found: 実行予算・発注・出来高レコードが存在しない
  - **追記（2026-10-27、タスク17）**: 閲覧範囲外のプロジェクトの指定と、経路で指定したプロジェクトに属さない実行予算項目・発注・出来高記録・契約の指定も、存在しない場合と区別しない汎用の 404 とする（Requirement 20.2〜20.5）。範囲外を 403 で返す経路は無い
- 409 Conflict: 楽観的排他制御の競合、既存実行予算との重複、同月の重複締め

**Business Logic Errors (422)**:
- 発注済ステータスでの編集試行（取消以外）
- 確定発注金額未入力での発注済ステータス変更
- 発注済発注が存在する実行予算の削除試行

**System Errors (5xx)**:
- データベース接続エラー → 500 Internal Server Error
- トランザクション失敗 → 自動ロールバック、500返却

### Monitoring
- 既存のPinoロガーでAPIリクエスト・エラーをログ出力
- 既存のSentry統合でエラートラッキング

## Testing Strategy

### Unit Tests
- ExecutionBudgetService: 作成・削除・編集・契約変更反映のロジック
- OrderService: 案分計算の精度テスト（端数処理含む）、ステータス遷移バリデーション
- ProgressService: 出来高保存・月別集計の計算ロジック
- MonthlyCloseService: 累積処理・重複締め防止ロジック
- Zodスキーマバリデーションテスト

### Integration Tests
- 実行予算CRUD APIの統合テスト（Contract → Estimate連携含む）
- 発注CRUD + ステータス遷移 + 案分計算の統合テスト
- 出来高入力 + 月別集計の統合テスト
- 月次締め処理の統合テスト
- アクセス制御（VIEWER/EDITOR権限）の統合テスト

### E2E Tests
- 実行予算作成フロー（契約書選択 → 項目一覧表示）
- 発注作成 → 項目選択 → 発注確定 → 案分結果表示
- 出来高入力（ボタン操作 + 直接入力）→ 保存 → 履歴確認
- 月次締め → 支出累積確認
- Excel/PDFエクスポートのダウンロード確認

## Security Considerations

- アクセス制御: 既存のRBACミドルウェア（requirePermission）を使用
  - VIEWER以上: 実行予算・発注・出来高の閲覧
  - EDITOR以上: 実行予算・発注・出来高・原価のCRUD操作、月次締め
- 権限不足時は403 Forbiddenを返却
  - **改訂（2026-10-27、タスク17）**: 上の 3 項は当初の設計の記録として残す。実装はこれをロールの権限の表（`requirePermission`）だけで読み、担当外の利用者もID指定で他の案件の実行予算・発注・出来高・原価を読み書きでき、発注一覧と月別出来高の出力は記録を経ずに生成された（user-authentication の機能検証、2026-10-25）。2026-10-27 の判断（要件 17.1〜17.6 の改訂と Requirement 20 の新設）で、データ分離は案件の閲覧範囲（user-authentication の要件39）とロールの権限の表の両方で判定する。範囲外は不在と同じ汎用の 404 とし、403 は閲覧範囲内で権限を持たない操作に限る。出力はファイルの生成の前に記録する（詳細は「Requirement 20: 案件の閲覧範囲と出力の記録の適用」章）
- 新規パーミッション: `execution_budget:read`, `execution_budget:write`, `order:read`, `order:write`, `progress:read`, `progress:write`, `cost:write`, `monthly_close:write`

## Performance & Scalability

- 実行予算項目一覧: DataLoaderパターンで子項目のN+1問題を防止
- 大量項目（200+）: フロントエンドでの折り畳みによる初期レンダリング最適化
- 月別出来高集計: SQLレベルでGROUP BY集計し、アプリケーション層の計算負荷を軽減
- エクスポート処理: 非同期処理は不要（項目数が限定的）。同期レスポンスでファイルを返却

## Requirement 20: 案件の閲覧範囲と出力の記録の適用

### Overview

**Purpose**: user-authentication の要件39（案件単位の閲覧範囲）と要件40.9〜40.11（データ出力の記録）を本機能の API と出力へ適用する。上流は判定の部品（`ProjectScopeService` の `evaluateProjectAccess`・`buildProjectScopeWhere`、`canAccessProject`、`requireProjectScope`）と出力の記録の手段（`ExportAuditService`）を実装済みであり、各業務機能への適用は各 spec の所管と定めている（user-authentication の design.md の Boundary Commitments の Out of Boundary）。本章は本機能の適用箇所を設計として固定する。

**Users**: 担当外の案件の実行予算と原価を閲覧・操作させたくないシステム管理者と、出力の経緯を追跡する監査の担当者。

**Impact（既存前提の是正）**: user-authentication の機能検証（2026-10-25、HEAD `b85b8124`）で次の二点が確かめられた（タスク17 の経緯）。

1. 本機能の API はロールの権限の表（`execution_budget:*`・`order:*`・`progress:*`・`cost:write`・`monthly_close:write`）だけを判定し、案件の範囲を判定しない。担当外の利用者が ID 指定で他の案件の実行予算・発注・出来高・原価を読み書きできる。あわせて、経路の `orderId`・`itemId`・`progressRecordId`・`contractId` が経路の `projectId` の案件に属するかを照合しない経路がある（発注一覧の出力は `orderId` だけで発注を引く）
2. 発注一覧と月別出来高の出力はサーバーで生成されるが、`ExportAuditService.record` を経ない（同サービスの呼び出し元は監査ログの経路だけ）

### 要件 17.1〜17.6 の読み替え（2026-10-27、利用者の判断）

利用者は、案件の範囲を含意する既存の条文を改訂して改訂の記録を残すと判断した（採らなかった案は、条文を変えず本書だけで読み替える案）。本機能では Requirement 17（アクセス制御）の受入基準1〜6 が該当した（requirements.md を `アクセス`・`権限`・`閲覧`・`許可` で検め、ほかの該当は画面操作と同一プロジェクトの変更契約の語だけであった。2026-10-27）。改訂の内容と理由は requirements.md の Requirement 17 の改訂の記録が持ち、本書は設計上の読み方だけを記す。

| 条文 | 改訂前の設計上の読み方 | 改訂後の設計上の読み方 |
|---|---|---|
| 17.1 | VIEWER以上のロールなら全プロジェクトの実行予算を閲覧できる | 閲覧範囲に含まれるプロジェクトの実行予算に限りVIEWER以上のロールが閲覧できる。範囲外は不在と同じ 404（20.2） |
| 17.2-17.5 | EDITOR以上のロールなら全プロジェクトの実行予算・発注・出来高・原価・月次締めを操作できる | 閲覧範囲に含まれるプロジェクトに限りEDITOR以上のロールが操作できる |
| 17.6 | 権限の無い操作は範囲の区別なく 403 と権限不足のエラーメッセージ | 403 と権限不足のエラーメッセージは閲覧範囲内で権限を持たない操作に限る。範囲外は不在と同じ汎用の 404（20.2・20.3） |

**読み替えに伴って主張が変わる既存のテスト**: 権限なしの 403 を主張する既存の統合テスト（タスク13.3 のアクセス制御）は、判定の順序を `requirePermission` の後に `requireProjectScope` とすることで従来どおり成り立つ。範囲外の利用者の操作を通すことを主張する既存のテストは無いことを着手時に確かめる（あれば主張を消さず、不在と同じ 404 の主張へ改める）。

### Boundary Commitments

#### This Spec Owns
- 本機能の API の各経路への `requireProjectScope` の適用（`requirePermission` の後に置く）。対象はタスク17.1 の本文が挙げる 5 ルートファイルの 25 経路（20.1-20.3, 20.6）
- 経路の `itemId`・`orderId`・`progressRecordId`、経路と要求本文の `contractId` が経路の `projectId` の案件に属するかの照合（20.4）
- 複数の実行予算項目を一度に指定する要求（発注のチェック済み項目の更新 `itemIds`、出来高の保存 `items[].itemId`）の全件か無しかの扱い（20.5）
- 発注一覧と月別出来高の出力の経路から生成の前に `ExportAuditService.record` を呼ぶことと、記録の失敗の応答（20.7・20.8）
- 発注詳細画面と出来高入力画面の出力の失敗の表示（20.8）

#### Out of Boundary
- 閲覧範囲の判定の規則と判定の部品の実装（user-authentication の要件39 と同 spec の `ProjectScopeService`・`ProjectScopeGuard`）
- 範囲外のアクセスの拒否のセキュリティログ（user-authentication の要件39.7。`requireProjectScope` が記録する）
- 出力の記録の受け口と記録の内容（user-authentication の要件40.9 と `ExportAuditService`）
- プロジェクト詳細画面の実行予算セクションのサマリ（project-management が所管するプロジェクト詳細の取得の閲覧範囲に従う。user-authentication のタスク52.3 で適用済み）
- 発注先の取引先の選択（取引先マスタは案件に属さない。trading-partner-management が所管）
- 署名付きURLの発行の判定（user-authentication の要件39.4）。本機能はファイルの取得用の署名付きURLを発行しない

#### Allowed Dependencies
- 本機能のルート → user-authentication の `requireProjectScope`・`ProjectScopeService`
- 本機能の出力の経路 → `ExportAuditService`
- 本機能の出力の画面 → `EXPORT_RECORD_FAILED_MESSAGE`（`frontend/src/api/export-audit.ts`）

### Components and Interfaces

| Component | Layer | Intent | Req | Key Deps | Contracts |
|-----------|-------|--------|-----|----------|-----------|
| 実行予算・発注・出来高・原価・月次締め・出力の経路 | Routes | 範囲外のプロジェクトの指定を不在と同じ 404 にし、一覧を範囲内へ限る | 20.1, 20.2, 20.3, 20.6 | `requireProjectScope`（P0） | API |
| 子リソースの所属の照合 | Service | 経路・要求本文の実行予算項目・発注・出来高記録・契約が経路の案件に属するかを確かめ、属さなければ不在と同じ 404 にする | 20.4, 20.5 | Prisma（P0） | Service |
| 出力の記録 | Routes | 発注一覧と月別出来高のファイルの生成の前に記録し、記録の失敗では生成しない | 20.7, 20.8 | `ExportAuditService`（P0） | API |
| 出力のエラー表示 | UI | 記録の失敗の応答でダウンロードを始めず、出力を記録できなかった旨を表示する | 20.8 | `EXPORT_RECORD_FAILED_MESSAGE`（P0） | State |

**判定の順序**: 認証（401）→ `requirePermission`（403）→ `requireProjectScope`（範囲外は 404）→ 子リソースの所属の照合（属さなければ 404）→ 本体（不在と論理削除の 404、バリデーションの 400、競合の 409、業務規則の 422）の順とする。逆にすると権限なしの 403 を主張する既存の統合テストが 404 で落ちる（user-authentication の tasks.md の Implementation Notes の 52.2 の区分 D）。

**子リソースの所属**: 実行予算項目は親の実行予算の、発注・出来高記録は所属する実行予算の、契約は契約そのもののプロジェクトを経路の `projectId` と突き合わせる。属さない組み合わせは、存在しない場合と同じ汎用の 404 にしてデータを変えない（20.4）。範囲内のプロジェクトの ID を経由して範囲外の子リソースを閲覧・操作できないようにするためであり、所属しない子リソースが範囲内のプロジェクトに属する場合も同じ 404 とする（範囲の内外で応答を変えると、範囲外の子リソースの実在を推測させる）。契約の照合は、実行予算の作成・変更契約の項目差分・変更契約の反映の三つの経路に置く（contract-management の是正計画 §5.11 と同じ形）。

**一括の経路（全件か無しか）**: 発注のチェック済み項目の更新は `itemIds` の全件を、出来高の保存は `items[].itemId` の全件を、経路の案件の実行予算の項目であるかで判定し、一つでも属さない（不在、または他の案件の実行予算の項目）なら要求全体を不在と同じ汎用の 404 にしてどの行にも書き込まない（20.5）。現状は、発注のチェック済み項目の更新は経路の実行予算に無い ID を黙って捨て、出来高の保存は他の案件の実行予算の項目を指す出来高を書き込める。属さない ID だけを除いて残りを書き込む案は、全件か無しかの契約を部分適用へ変え、他の案件の項目の実在を応答の差から推測させる余地を残すため採らない（site-survey のタスク119.1・construction-photo のタスク30.2・quantity-table-generation のタスク104.1 の決定と同じ）。

**一覧**: 本機能の一覧（発注一覧・出来高履歴・月別出来高・月別明細・月次締め履歴・未反映の変更契約の一覧）はいずれも経路の `projectId` の配下に載り、案件をまたぐ一覧・検索の経路は無い（2026-10-27、`backend/src/app.ts` のマウントと 5 ルートファイルの経路の定義で実測）。そのため一覧を範囲内に限ること（20.6）は経路の `requireProjectScope` で成り立ち、範囲外のプロジェクトを指定した一覧は 404 になる。

**出力の記録**: 発注一覧の出力（`GET /orders/:orderId/export`）は種別 `order_export`、月別出来高の出力（`GET /progress/monthly/export`）は種別 `progress_export` を用い、`projectId` に経路の案件を添える。対象のデータ（`targetIds`）と件数（`itemCount`）は、発注一覧は発注の ID とチェック済み項目の件数、月別出来高は実行予算の ID と対象月の件数を目安とし、実装時に確定する。`record` はファイルの生成（Excel・PDF）の前に一つの要求につき 1 回だけ呼ぶ（20.7）。経路が `requireProjectScope` と子リソースの所属の照合を通った後に呼ぶため、`record` の `PROJECT_OUT_OF_SCOPE` は通常起きないが、起きたときも生成せず不在と同じ 404 とする。

**記録の失敗の応答**: `record` が `RECORD_FAILED` を返したときは、ファイルを生成せず、ファイルを含まない 500 の応答を返す。本文の `detail` は「出力を記録できなかったため中止しました」とし、画面が記録の失敗を他の失敗と区別できる識別子（例 `code: 'EXPORT_RECORD_FAILED'`）を添える。発注詳細画面（`OrderDetailPage` の `handleExport`）と出来高入力画面（`ProgressInputPage` の `handleExportExcel`・`handleExportPdf`）は、この応答でダウンロードを始めず `EXPORT_RECORD_FAILED_MESSAGE` を表示する（20.8）。ほかの失敗の文言（出来高入力画面の Excel・PDF のエクスポートの失敗）は変えない。ブラウザで生成する出力の包み（`runRecordedExport`）は使わない。サーバーが記録する出力をブラウザからも記録すると二重の記録になるため（user-authentication の design.md の「ExportAuditService と ExportAuditClient」の節の、サーバー側で生成する出力は各業務 spec がハンドラーから直接呼ぶ、の定め）。

### Requirements Traceability

| Requirement | Summary | Components | Interfaces | Flows |
|-------------|---------|------------|------------|-------|
| 20.1 | 範囲内（担当者・作成者・全案件閲覧の権限）は従来どおり使える | 実行予算・発注・出来高・原価・月次締め・出力の経路 | `requireProjectScope` | - |
| 20.2 | 範囲外の ID 指定は不在と同じ 404、データを変えない | 実行予算・発注・出来高・原価・月次締め・出力の経路 | `requireProjectScope` | - |
| 20.3 | 404 の本文に存在を推測できる情報を含めない | 実行予算・発注・出来高・原価・月次締め・出力の経路 | 汎用の `NOT_FOUND` | - |
| 20.4 | 経路の案件に属さない実行予算項目・発注・出来高記録・契約は不在と同じ 404 | 子リソースの所属の照合 | 各経路の `itemId`・`orderId`・`progressRecordId`・`contractId` | 実行予算作成フロー |
| 20.5 | 一括の要求は属さない項目が一つでも含まれれば全体を 404、書き込まない | 子リソースの所属の照合 | `PUT /orders/:orderId/items`, `POST /progress` | - |
| 20.6 | 発注一覧・出来高履歴・月別出来高・月次締め履歴・未反映の変更契約は範囲内だけ | 実行予算・発注・出来高・原価・月次締め・出力の経路 | `requireProjectScope` | - |
| 20.7 | ファイルの生成の前に出力の記録を 1 回行う | 出力の記録 | `ExportAuditService.record`, `GET /orders/:orderId/export`, `GET /progress/monthly/export` | - |
| 20.8 | 記録の失敗ではファイルを返さず、画面は出力を記録できなかった旨を表示する | 出力の記録, 出力のエラー表示 | `EXPORT_RECORD_FAILED_MESSAGE` | - |

### Error Handling

| 失敗 | 挙動 | 根拠 |
|---|---|---|
| 範囲外のプロジェクトの実行予算・発注・出来高・原価・月次締め・出力の指定 | 存在しない場合と同じ 404（`NOT_FOUND`）。本文に案件 ID を含めず、データを変えない | 20.2, 20.3 |
| 経路の案件に属さない実行予算項目・発注・出来高記録・契約の指定 | 当該の子リソースが存在しない場合と同じ 404。データを変えない | 20.4 |
| 一括の要求に経路の案件に属さない実行予算項目が一つでも含まれる | 要求全体を 404。どの発注項目・出来高記録にも書き込まない | 20.5 |
| 範囲外のプロジェクトの一覧の要求 | プロジェクトの不在と同じ 404 | 20.2, 20.6 |
| 出力の記録が失敗 | ファイルを生成せず 500（`detail` は出力を記録できなかった旨）。画面はダウンロードを始めずエラーメッセージを表示する | 20.8 |

### Testing Strategy

- **統合（バックエンド）**: 担当外の利用者の ID 指定（実行予算の作成・取得・論理削除、実行予算項目の編集、変更契約の一覧・差分・反映、発注の一覧・作成・詳細・編集・チェック済み項目の更新・ステータス変更、出来高の保存・履歴・施工日指定の取得・月別集計・月別明細、原価の入力、月次締めとその履歴、発注一覧と月別出来高の出力）が不在と同じ 404 になり DB が変わらないこと、本文に案件 ID が出ないこと、他の案件の `itemId`・`orderId`・`progressRecordId`・`contractId` を範囲内の案件の経路で指すと 404 で DB が変わらないこと、一括の要求に属さない項目が一つ混じると全体が 404 でどの行も変わらないこと、担当者・作成者・全案件閲覧の権限では従来どおりであること（20.1-20.6）。出力のたびに監査 `DATA_EXPORTED` が種別・案件つきで 1 件記録されること、記録を失敗させるとファイルを返さず 500 になること（20.7, 20.8）
- **E2E**: 担当外の利用者が実行予算の URL を直接開くと見つからない扱いになること（20.2）。発注詳細画面と出来高入力画面の出力が監査の記録を残すこと、出力の記録の失敗の応答でダウンロードが始まらずエラーメッセージが出ること（20.7, 20.8）
- 挙動の変更であるため RED → GREEN で進める（タスク17.1・17.2）
