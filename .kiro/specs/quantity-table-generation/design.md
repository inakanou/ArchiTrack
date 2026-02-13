# Design Document: 数量表作成機能

## Overview

**Purpose**: 本機能は、積算担当者が現場調査結果に基づいて数量を拾い出し、調査写真と紐づけながら数量表を作成するための機能を提供する。

**Users**: 積算担当者が、プロジェクトに紐付く数量表の作成・編集・管理、コピーによる効率的な再利用、および計算機能（面積・体積、ピッチ）を使用して効率的な積算作業を実施する。

**Impact**: プロジェクト詳細画面に数量表セクションを追加し、新たにQuantityTable、QuantityGroup、QuantityItemエンティティを導入する。数量表コピー機能の追加およびタイトル行表示最適化によるUI改善を含む。

### Goals

- プロジェクトに対して複数の数量表を作成・管理可能にする
- 数量グループと現場調査写真の紐づけによるトレーサビリティ確保
- 計算方法（標準・面積体積・ピッチ）による効率的な数量算出
- オートコンプリートによる入力支援と一貫性確保
- 自動保存による作業継続性の保証
- 厳密なフィールド仕様に基づく入力制御と統一された表示書式
- 数量表コピーによる類似案件での作業効率化
- タイトル行表示最適化による画面の視認性向上

### Non-Goals

- 見積書・請求書の自動生成（別機能として計画）
- 単価マスタとの連携（将来の拡張）
- リアルタイム共同編集（WebSocket同期は対象外）
- 数量表のインポート・エクスポート（将来対応）

## Architecture

### Existing Architecture Analysis

現行システムはSiteSurvey機能で確立されたパターンを踏襲する:

- **サービス層**: 依存性注入パターン（PrismaClient、AuditLogService）
- **ルーティング**: プロジェクト配下のネストルート構造
- **UI統合**: プロジェクト詳細画面へのセクションカード統合
- **楽観的排他制御**: updatedAtフィールドによるバージョンチェック

### Architecture Pattern & Boundary Map

```mermaid
graph TB
    subgraph Frontend
        PDP[ProjectDetailPage]
        QTL[QuantityTableListPage]
        QTE[QuantityTableEditPage]
        QTS[QuantityTableSectionCard]
        QGC[QuantityGroupComponent]
        QIC[QuantityItemComponent]
        CE[CalculationEngine]
        FV[FieldValidator]
        ACS[AutocompleteCandidateStore]
    end

    subgraph Backend
        QTR[QuantityTableRoutes]
        QTSV[QuantityTableService]
        QGSV[QuantityGroupService]
        QISV[QuantityItemService]
        QVS[QuantityValidationService]
        ACSV[AutocompleteCandidatesEndpoint]
    end

    subgraph Database
        PJ[Project]
        QT[QuantityTable]
        QG[QuantityGroup]
        QI[QuantityItem]
        SI[SurveyImage]
    end

    PDP --> QTS
    QTS --> QTL
    QTL --> QTE
    QTE --> QGC
    QTE --> ACS
    QGC --> QIC
    QIC --> CE
    QIC --> FV
    QIC --> ACS

    QTE --> QTR
    QTE --> ACSV
    QTR --> QTSV
    QTSV --> QGSV
    QGSV --> QISV
    QISV --> QVS

    QTSV --> QT
    QGSV --> QG
    QISV --> QI
    QG --> SI
    QT --> PJ
    ACSV --> QI
```

**Architecture Integration**:

- 選択パターン: 階層型サービス（QuantityTable → QuantityGroup → QuantityItem）
- ドメイン境界: 数量表管理は独立したドメインとして分離、プロジェクトとの関連はIDリレーションのみ
- 既存パターン: SiteSurveyパターンを継承（CRUD、一覧、詳細、楽観的排他制御）
- 新規コンポーネント: 計算エンジン（フロントエンド・バックエンド両方で共有）、フィールドバリデーター、AutocompleteCandidateStore（フロントエンド初回一括読み込み＋クライアントサイド管理）
- 追加コンポーネント（REQ-17, 18）: コピー機能（QuantityTableService.copy）、CopyQuantityTableDialog、QuantityGroupTitleRow
- Steering準拠: 型安全性、テスト駆動、コンポーネント分離原則を維持

### Technology Stack

| Layer | Choice / Version | Role in Feature | Notes |
|-------|------------------|-----------------|-------|
| Frontend | React 19.2 + TypeScript 5.9 | 数量表編集UI、計算プレビュー | 既存スタック |
| Frontend | decimal.js ^10.5.0 | 高精度数値計算 | 新規追加 |
| Frontend | @dnd-kit/core ^6.x | ドラッグ&ドロップ操作 | 新規追加（アクセシブル） |
| Backend | Express 5.2 + TypeScript 5.9 | REST API | 既存スタック |
| Backend | Prisma 7.0 | データアクセス | 既存スタック |
| Backend | Zod 4.1 | バリデーション | 既存スタック |
| Data | PostgreSQL 15 | データ永続化 | 既存スタック |

## System Flows

### 数量計算フロー（面積・体積モード）

```mermaid
sequenceDiagram
    participant User
    participant QuantityItemComponent
    participant FieldValidator
    participant CalculationEngine
    participant API
    participant QuantityItemService

    User->>QuantityItemComponent: 計算方法「面積・体積」選択
    QuantityItemComponent->>QuantityItemComponent: 計算用列表示（W/D/H/重量）
    User->>QuantityItemComponent: 計算用列に値入力
    QuantityItemComponent->>FieldValidator: 入力値検証（範囲・書式）
    FieldValidator-->>QuantityItemComponent: 検証結果
    alt 入力エラー
        QuantityItemComponent->>QuantityItemComponent: エラー表示
    else 入力OK
        QuantityItemComponent->>CalculationEngine: 計算リクエスト
        CalculationEngine->>CalculationEngine: Decimal.jsで精度保証計算
        CalculationEngine->>CalculationEngine: 調整係数適用
        CalculationEngine->>CalculationEngine: 丸め設定適用
        CalculationEngine-->>QuantityItemComponent: 計算結果
        QuantityItemComponent->>QuantityItemComponent: 数量フィールド更新（小数2桁表示）
        Note over QuantityItemComponent: 1500msデバウンス後
        QuantityItemComponent->>API: 自動保存
        API->>QuantityItemService: 検証・保存
        QuantityItemService-->>API: 保存結果
        API-->>QuantityItemComponent: 保存完了通知
    end
```

### 数量表コピーフロー

```mermaid
sequenceDiagram
    participant User
    participant QTL as QuantityTableListPage
    participant Dialog as CopyQuantityTableDialog
    participant API
    participant QTSV as QuantityTableService
    participant DB as PostgreSQL

    User->>QTL: 数量表のコピーボタンをクリック
    QTL->>Dialog: コピーダイアログ表示（デフォルト名「{元の名前}のコピー」）
    User->>Dialog: 数量表名を入力して作成を確定
    Dialog->>Dialog: 処理中インジケーター表示・重複操作防止
    Dialog->>API: POST /api/quantity-tables/:id/copy { name }
    API->>QTSV: copy(id, name, actorId)
    QTSV->>DB: BEGIN TRANSACTION
    QTSV->>DB: 元の数量表を取得（グループ・項目含む）
    QTSV->>DB: 新しい数量表を作成
    QTSV->>DB: 全グループを複製（surveyImageIdも維持）
    QTSV->>DB: 各グループの全項目を複製
    QTSV->>DB: COMMIT
    QTSV-->>API: コピーされた数量表の情報
    API-->>Dialog: 201 Created + QuantityTableInfo
    Dialog->>QTL: コピー完了
    QTL->>QTL: コピーされた数量表の編集画面に遷移

    alt エラー発生時
        QTSV->>DB: ROLLBACK
        QTSV-->>API: エラー
        API-->>Dialog: エラーレスポンス
        Dialog->>Dialog: エラーメッセージ表示・インジケーター解除
    end
```

### オートコンプリート候補取得・利用フロー（初回一括読み込み方式）

```mermaid
sequenceDiagram
    participant User
    participant QTE as QuantityTableEditPage
    participant ACS as AutocompleteCandidateStore
    participant API
    participant DB as PostgreSQL

    Note over QTE: 数量表編集画面を初回表示
    QTE->>API: GET /api/projects/:projectId/quantity-items/autocomplete-candidates
    API->>DB: GROUP BY 各対象フィールドで重複排除取得
    DB-->>API: フィールド別の候補値マップ
    API-->>QTE: AutocompleteCandidatesResponse
    QTE->>ACS: 候補値マップをステートに保持

    Note over User: テキストフィールドにフォーカス
    User->>QTE: 対象フィールドにフォーカス
    QTE->>ACS: クライアントサイドで候補取得（空入力時は全候補、入力値ありは前方一致フィルタリング）
    ACS-->>QTE: 候補リスト（50音順）
    QTE->>QTE: ドロップダウンで候補表示

    Note over User: テキスト入力でリアルタイムフィルタリング
    User->>QTE: 対象フィールドに文字入力
    QTE->>ACS: 入力値で前方一致フィルタリング
    ACS-->>QTE: フィルタリング済み候補リスト（50音順）
    QTE->>QTE: ドロップダウンを更新表示

    User->>QTE: 候補を選択 or 直接入力後にフォーカスを外す
    QTE->>ACS: blur時に確定値を候補リストに追加（重複排除）
    Note over ACS: APIリクエストは発生しない
```

## Requirements Traceability

| Requirement | Summary | Components | Interfaces | Flows |
|-------------|---------|------------|------------|-------|
| 1.1-1.7 | プロジェクト詳細画面の数量表セクション | QuantityTableSectionCard, ProjectDetailPage | GET /api/projects/:id/quantity-tables/summary | - |
| 2.1-2.5 | 数量表の作成・管理 | QuantityTableListPage, QuantityTableForm | QuantityTableService, QuantityTable API | - |
| 3.1-3.3 | 数量表編集画面の表示 | QuantityTableEditPage, QuantityGroupComponent | GET /api/quantity-tables/:id | - |
| 4.1-4.5 | 数量グループの作成・管理 | QuantityGroupComponent, PhotoSelector | QuantityGroupService | - |
| 5.1-5.4 | 数量項目の追加・編集 | QuantityItemComponent, QuantityItemRow | QuantityItemService | - |
| 6.1-6.5 | 数量項目のコピー・移動 | QuantityItemComponent, DragDropContext | QuantityItemService | - |
| 7.1 | 初回表示時に候補値を一括取得 | QuantityTableEditPage, AutocompleteCandidateStore | GET /api/projects/:projectId/quantity-items/autocomplete-candidates | オートコンプリートフロー |
| 7.2 | APIリクエストは初回表示時の1回のみ | AutocompleteCandidateStore | - | オートコンプリートフロー |
| 7.3 | フォーカス時に候補をドロップダウン表示（空入力時は全候補、入力値ありは前方一致フィルタリング） | AutocompleteInput, AutocompleteCandidateStore | - | オートコンプリートフロー |
| 7.3a | 入力中にリアルタイムで前方一致フィルタリング更新 | AutocompleteInput, AutocompleteCandidateStore | - | オートコンプリートフロー |
| 7.4 | 候補選択時の自動入力 | AutocompleteInput | - | オートコンプリートフロー |
| 7.5 | blur時にクライアントサイドで候補追加 | AutocompleteInput, AutocompleteCandidateStore | - | オートコンプリートフロー |
| 7.6 | blur時の候補追加はAPIリクエスト不要 | AutocompleteCandidateStore | - | オートコンプリートフロー |
| 7.7 | 候補を50音順に表示 | AutocompleteInput | - | - |
| 8.1-8.11 | 計算方法の選択 | CalculationMethodSelector, CalculationFields | CalculationEngine | 数量計算フロー |
| 9.1-9.7 | 調整係数 | AdjustmentFactorInput | CalculationEngine, FieldValidator | - |
| 10.1-10.7 | 丸め設定 | RoundingSettingInput | CalculationEngine, FieldValidator | - |
| 11.1-11.5 | 数量表の保存 | useAutoSave Hook, SaveIndicator | QuantityTableService | - |
| 12.1-12.5 | パンくずナビゲーション | Breadcrumb | - | - |
| 13.1-13.4 | テキストフィールドの入力制御 | FieldValidator, TextFieldConstraints | QuantityValidationService | - |
| 14.1-14.5 | 数値フィールドの表示書式 | NumericFormatter, QuantityItemRow | - | - |
| 15.1-15.3 | 数量フィールドの入力制御 | FieldValidator, NumericInputConstraints | QuantityValidationService | - |
| 17.1 | 数量表コピーダイアログ表示 | QuantityTableListPage, CopyQuantityTableDialog | - | 数量表コピーフロー |
| 17.2 | 数量表の全データ複製 | QuantityTableService.copy | POST /api/quantity-tables/:id/copy | 数量表コピーフロー |
| 17.3 | コピー完了後に編集画面遷移 | QuantityTableListPage | - | 数量表コピーフロー |
| 17.4 | コピーされた数量表の独立性 | QuantityTableService.copy | - | - |
| 17.5 | コピーエラー時のロールバック | QuantityTableService.copy | - | 数量表コピーフロー |
| 17.6 | コピー処理中のインジケーター表示 | CopyQuantityTableDialog | - | - |
| 17.7 | コピー先での写真紐づけ維持 | QuantityTableService.copy | - | - |
| 18.1 | メインタイトル行をグループ先頭にのみ表示 | QuantityGroupCard, QuantityGroupTitleRow | - | - |
| 18.2 | 2行目以降のタイトル行非表示 | QuantityGroupCard | - | - |
| 18.3 | 面積・体積計算用タイトル行は従来通り表示 | EditableQuantityItemRow, CalculationFields | - | - |
| 18.4 | ピッチ計算用タイトル行は従来通り表示 | EditableQuantityItemRow, CalculationFields | - | - |
| 18.5 | 再展開時のタイトル行表示ルール維持 | QuantityGroupCard | - | - |

## Field Specifications

### テキストフィールド仕様

| フィールド | 必須 | 配置 | 最大文字数 | デフォルト値 | 備考 |
|-----------|------|------|------------|--------------|------|
| 大項目 | - | 左寄せ | 全角25/半角50 | 空白 | - |
| 中項目 | - | 左寄せ | 全角25/半角50 | 空白 | - |
| 小項目 | - | 左寄せ | 全角25/半角50 | 空白 | - |
| 任意分類 | - | 左寄せ | 全角25/半角50 | 空白 | - |
| 工種 | 必須 | 左寄せ | 全角8/半角16 | 空白 | - |
| 名称 | 必須 | 左寄せ | 全角25/半角50 | 空白 | - |
| 規格 | - | 左寄せ | 全角25/半角50 | 空白 | - |
| 単位 | 必須 | 左寄せ | 全角3/半角6 | 式 | - |
| 計算方法 | 必須 | 左寄せ | 全角25/半角50 | 標準 | - |
| 備考 | - | 左寄せ | 全角25/半角50 | 空白 | - |

### 数値フィールド仕様（計算パラメータ）

| フィールド | 必須 | 配置 | 入力可能範囲 | デフォルト値 | 表示書式 | 空白時動作 |
|-----------|------|------|--------------|--------------|----------|------------|
| 調整係数 | 必須 | 右寄せ | -9.99〜9.99 | 1.00 | 小数2桁常時表示 | デフォルト値を自動入力 |
| 丸め設定 | 必須 | 右寄せ | -99.99〜99.99 | 0.01 | 小数2桁常時表示 | 0または空白でデフォルト値を自動入力 |
| 数量 | 必須 | 右寄せ | -999999.99〜9999999.99 | 0 | 小数2桁常時表示 | デフォルト値を自動入力 |

### 寸法フィールド仕様（面積・体積計算用）

| フィールド | 必須 | 配置 | 入力可能範囲 | デフォルト値 | 表示書式 |
|-----------|------|------|--------------|--------------|----------|
| 幅(W) | - | 右寄せ | 0.01〜9999999.99または空白 | 空白 | 数値入力時は小数2桁、空白時は表示なし |
| 奥行き(D) | - | 右寄せ | 0.01〜9999999.99または空白 | 空白 | 数値入力時は小数2桁、空白時は表示なし |
| 高さ(H) | - | 右寄せ | 0.01〜9999999.99または空白 | 空白 | 数値入力時は小数2桁、空白時は表示なし |
| 重量（面積・体積用） | - | 右寄せ | 0.01〜9999999.99または空白 | 空白 | 数値入力時は小数2桁、空白時は表示なし |

**制約**: 計算方法が「面積・体積」の場合、幅(W)、奥行き(D)、高さ(H)のうち最低1つの入力が必須

### ピッチ計算フィールド仕様

| フィールド | 必須 | 配置 | 入力可能範囲 | デフォルト値 | 表示書式 |
|-----------|------|------|--------------|--------------|----------|
| 範囲長 | 必須 | 右寄せ | 0.01〜9999999.99または空白 | 空白 | 数値入力時は小数2桁、空白時は表示なし |
| 端長1 | 必須 | 右寄せ | 0.01〜9999999.99または空白 | 空白 | 数値入力時は小数2桁、空白時は表示なし |
| 端長2 | 必須 | 右寄せ | 0.01〜9999999.99または空白 | 空白 | 数値入力時は小数2桁、空白時は表示なし |
| ピッチ長 | 必須 | 右寄せ | 0.01〜9999999.99または空白 | 空白 | 数値入力時は小数2桁、空白時は表示なし |
| 長さ（ピッチ用） | - | 右寄せ | 0.01〜9999999.99または空白 | 空白 | 数値入力時は小数2桁、空白時は表示なし |
| 重量（ピッチ用） | - | 右寄せ | 0.01〜9999999.99または空白 | 空白 | 数値入力時は小数2桁、空白時は表示なし |

**制約**: 計算方法が「ピッチ」の場合、範囲長、端長1、端長2、ピッチ長の4項目すべてが必須

## Components and Interfaces

### Component Summary

| Component | Domain/Layer | Intent | Req Coverage | Key Dependencies | Contracts |
|-----------|--------------|--------|--------------|------------------|-----------|
| QuantityTableService | Backend/Service | 数量表のCRUD操作・コピー | 2.1-2.5, 11.1-11.5, 17.1-17.7 | PrismaClient (P0), AuditLogService (P1) | Service, API |
| QuantityGroupService | Backend/Service | 数量グループのCRUD操作と画像紐付け | 3.1-3.3, 4.1-4.5 | PrismaClient (P0) | Service, API |
| QuantityItemService | Backend/Service | 数量項目のCRUD・計算検証 | 5.1-5.4, 6.1-6.5, 8.1-8.11, 9.1-9.7, 10.1-10.7 | PrismaClient (P0), CalculationEngine (P0), QuantityValidationService (P0) | Service, API |
| QuantityValidationService | Backend/Service | フィールドバリデーション | 8.3, 8.4, 8.7, 8.10, 9.3-9.5, 10.3-10.5, 13.1-13.4, 14.1-14.5, 15.1-15.3 | - | Service |
| AutocompleteCandidatesEndpoint | Backend/Route | プロジェクト単位のオートコンプリート候補一括取得 | 7.1, 7.2 | PrismaClient (P0) | API |
| CalculationEngine | Shared/Utility | 数量計算ロジック | 8.1-8.11, 9.1-9.7, 10.1-10.7 | decimal.js (P0) | Service |
| QuantityTableEditPage | Frontend/Page | 数量表編集画面 | 3.1-3.3, 7.1 | QuantityGroupComponent (P0), AutocompleteCandidateStore (P0) | State |
| QuantityTableSectionCard | Frontend/Component | プロジェクト詳細の数量表セクション | 1.1-1.7 | - | - |
| AutocompleteCandidateStore | Frontend/State | オートコンプリート候補のクライアントサイド管理 | 7.1, 7.2, 7.3, 7.5, 7.6 | - | State |
| AutocompleteInput | Frontend/Component | オートコンプリート対応テキスト入力 | 7.3, 7.4, 7.5, 7.6, 7.7 | AutocompleteCandidateStore (P0) | - |
| CopyQuantityTableDialog | Frontend/Component | 数量表コピーダイアログ | 17.1, 17.3, 17.6 | - | - |
| QuantityGroupTitleRow | Frontend/Component | 数量グループのメインタイトル行 | 18.1, 18.2, 18.5 | - | - |
| FieldValidator | Frontend/Utility | フィールド入力制御・書式 | 13.1-13.4, 14.1-14.5, 15.1-15.3 | - | Service |

### Backend Services

#### QuantityTableService

| Field | Detail |
|-------|--------|
| Intent | 数量表のライフサイクル管理とCRUD操作、コピー機能を担当 |
| Requirements | 2.1, 2.2, 2.3, 2.4, 2.5, 11.1, 11.2, 11.3, 11.4, 11.5, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7 |

**Responsibilities & Constraints**

- 数量表の作成・更新・削除・一覧取得・コピー
- プロジェクトとの関連付け検証
- 楽観的排他制御（updatedAt）
- トランザクション境界の管理
- コピー時の全データ（グループ・項目・写真紐づけ）のディープコピー

**Dependencies**

- Inbound: QuantityTableRoutes (P0)
- Outbound: QuantityGroupService (P1)
- External: PrismaClient (P0), AuditLogService (P1)

**Contracts**: Service [x] / API [x]

##### Service Interface

```typescript
interface QuantityTableService {
  create(input: CreateQuantityTableInput, actorId: string): Promise<QuantityTableInfo>;
  findById(id: string): Promise<QuantityTableDetail | null>;
  findByProjectId(
    projectId: string,
    filter: QuantityTableFilter,
    pagination: PaginationInput,
    sort: SortInput
  ): Promise<PaginatedQuantityTables>;
  findLatestByProjectId(projectId: string, limit?: number): Promise<ProjectQuantityTableSummary>;
  update(
    id: string,
    input: UpdateQuantityTableInput,
    actorId: string,
    expectedUpdatedAt: Date
  ): Promise<QuantityTableInfo>;
  delete(id: string, actorId: string): Promise<void>;
  copy(id: string, input: CopyQuantityTableInput, actorId: string): Promise<QuantityTableInfo>;
}

interface CreateQuantityTableInput {
  projectId: string;
  name: string;
}

interface UpdateQuantityTableInput {
  name?: string;
}

interface CopyQuantityTableInput {
  name: string;  // コピー先の数量表名（デフォルト: 「{元の名前}のコピー」）
}

interface QuantityTableInfo {
  id: string;
  projectId: string;
  name: string;
  groupCount: number;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface QuantityTableDetail extends QuantityTableInfo {
  project: { id: string; name: string };
  groups: QuantityGroupInfo[];
}

interface ProjectQuantityTableSummary {
  totalCount: number;
  latestTables: QuantityTableInfo[];
}
```

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| POST | /api/projects/:projectId/quantity-tables | CreateQuantityTableInput | QuantityTableInfo | 400, 404, 409 |
| GET | /api/projects/:projectId/quantity-tables | QueryParams | PaginatedQuantityTables | 400, 404 |
| GET | /api/projects/:projectId/quantity-tables/summary | - | ProjectQuantityTableSummary | 404 |
| GET | /api/quantity-tables/:id | - | QuantityTableDetail | 404 |
| PUT | /api/quantity-tables/:id | UpdateQuantityTableInput | QuantityTableInfo | 400, 404, 409 |
| DELETE | /api/quantity-tables/:id | - | 204 No Content | 404 |
| POST | /api/quantity-tables/:id/copy | CopyQuantityTableInput | QuantityTableInfo | 400, 404, 500 |

**Implementation Notes**

- Integration: 既存のSiteSurveyServiceパターンを踏襲
- Validation: Zodスキーマによる入力検証
- Copy: `copy`メソッドは単一トランザクション内で数量表・全グループ・全項目をディープコピーする。写真紐づけ（surveyImageId）はコピー先でも維持する。エラー時はROLLBACKにより不完全なコピーデータが残らないことを保証する
- Risks: 大量のグループ・項目を持つ数量表の取得パフォーマンス、コピー時の大量データ挿入パフォーマンス

---

#### QuantityGroupService

| Field | Detail |
|-------|--------|
| Intent | 数量グループのCRUD操作と現場調査画像との紐付け管理を担当 |
| Requirements | 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5 |

**Responsibilities & Constraints**

- 数量グループの作成・更新・削除
- 現場調査画像との紐付け・解除
- グループの表示順序管理
- グループ内の数量項目の集約取得

**Dependencies**

- Inbound: QuantityTableRoutes (P0), QuantityTableService (P1)
- Outbound: QuantityItemService (P1)
- External: PrismaClient (P0)

**Contracts**: Service [x]

##### Service Interface

```typescript
interface QuantityGroupService {
  create(input: CreateQuantityGroupInput): Promise<QuantityGroupInfo>;
  findById(id: string): Promise<QuantityGroupDetail | null>;
  findByQuantityTableId(quantityTableId: string): Promise<QuantityGroupInfo[]>;
  update(
    id: string,
    input: UpdateQuantityGroupInput,
    expectedUpdatedAt: Date
  ): Promise<QuantityGroupInfo>;
  delete(id: string): Promise<void>;
  linkSurveyImage(id: string, surveyImageId: string): Promise<QuantityGroupInfo>;
  unlinkSurveyImage(id: string): Promise<QuantityGroupInfo>;
  reorder(quantityTableId: string, orderedIds: string[]): Promise<QuantityGroupInfo[]>;
}

interface CreateQuantityGroupInput {
  quantityTableId: string;
  name?: string;
  surveyImageId?: string;
}

interface UpdateQuantityGroupInput {
  name?: string;
  surveyImageId?: string | null;
}

interface QuantityGroupInfo {
  id: string;
  quantityTableId: string;
  name: string | null;
  surveyImageId: string | null;
  displayOrder: number;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface QuantityGroupDetail extends QuantityGroupInfo {
  surveyImage: SurveyImageSummary | null;
  items: QuantityItemInfo[];
}

interface SurveyImageSummary {
  id: string;
  url: string;
  thumbnailUrl: string;
  annotations: Annotation[];
}

interface Annotation {
  id: string;
  type: string;
  coordinates: object;
  label: string;
}
```

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| POST | /api/quantity-tables/:tableId/groups | CreateQuantityGroupInput | QuantityGroupInfo | 400, 404 |
| GET | /api/quantity-tables/:tableId/groups | - | QuantityGroupInfo[] | 404 |
| GET | /api/quantity-groups/:id | - | QuantityGroupDetail | 404 |
| PUT | /api/quantity-groups/:id | UpdateQuantityGroupInput | QuantityGroupInfo | 400, 404, 409 |
| DELETE | /api/quantity-groups/:id | - | 204 No Content | 404 |
| PUT | /api/quantity-groups/:id/survey-image | { surveyImageId: string } | QuantityGroupInfo | 400, 404 |
| DELETE | /api/quantity-groups/:id/survey-image | - | QuantityGroupInfo | 404 |
| PUT | /api/quantity-tables/:tableId/groups/reorder | { orderedIds: string[] } | QuantityGroupInfo[] | 400, 404 |

**Implementation Notes**

- Integration: 既存のSiteSurveyServiceパターンを踏襲
- Validation: 存在しない現場調査画像への紐付けは400エラー
- Cascade: グループ削除時は配下の数量項目も削除（ON DELETE CASCADE）
- Risks: 大量の項目を持つグループの詳細取得パフォーマンス

---

#### QuantityItemService

| Field | Detail |
|-------|--------|
| Intent | 数量項目のCRUD、計算検証を担当 |
| Requirements | 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 8.1-8.11, 9.1-9.7, 10.1-10.7 |

**Responsibilities & Constraints**

- 数量項目の作成・更新・削除・コピー・移動
- 計算方法に応じた数量算出
- 調整係数・丸め設定の適用
- フィールド仕様に基づく入力値検証

**Dependencies**

- Inbound: QuantityTableRoutes (P0)
- Outbound: CalculationEngine (P0), QuantityValidationService (P0)
- External: PrismaClient (P0), decimal.js (P0)

**Contracts**: Service [x]

##### Service Interface

```typescript
interface QuantityItemService {
  create(groupId: string, input: CreateQuantityItemInput): Promise<QuantityItemInfo>;
  update(id: string, input: UpdateQuantityItemInput, expectedUpdatedAt: Date): Promise<QuantityItemInfo>;
  delete(id: string): Promise<void>;
  copy(id: string): Promise<QuantityItemInfo>;
  move(id: string, targetGroupId: string, position: number): Promise<QuantityItemInfo>;
  batchOperation(operation: BatchOperation): Promise<QuantityItemInfo[]>;
  calculateQuantity(input: CalculationInput): CalculationResult;
}

interface CreateQuantityItemInput {
  majorCategory: string;              // 全角25/半角50文字
  middleCategory?: string;            // 全角25/半角50文字
  minorCategory?: string;             // 全角25/半角50文字
  customCategory?: string;            // 全角25/半角50文字
  workType: string;                   // 全角8/半角16文字、必須
  name: string;                       // 全角25/半角50文字、必須
  specification?: string;             // 全角25/半角50文字
  unit: string;                       // 全角3/半角6文字、必須、デフォルト「式」
  calculationMethod: CalculationMethod; // デフォルト「標準」
  calculationParams?: CalculationParams;
  adjustmentFactor: number;           // -9.99～9.99、デフォルト1.00
  roundingUnit: number;               // -99.99～99.99、デフォルト0.01
  quantity?: number;                  // -999999.99～9999999.99
  remarks?: string;                   // 全角25/半角50文字
}

type CalculationMethod = 'STANDARD' | 'AREA_VOLUME' | 'PITCH';

interface CalculationParams {
  // 面積・体積モード (0.01～9999999.99)
  width?: number;
  depth?: number;
  height?: number;
  weight?: number;
  // ピッチモード (0.01～9999999.99)
  rangeLength?: number;
  endLength1?: number;
  endLength2?: number;
  pitchLength?: number;
  length?: number;
}

interface CalculationInput {
  method: CalculationMethod;
  params: CalculationParams;
  adjustmentFactor: number;
  roundingUnit: number;
}

interface CalculationResult {
  rawValue: number;
  adjustedValue: number;
  finalValue: number;
  formula: string;
}

interface UpdateQuantityItemInput {
  majorCategory?: string;
  middleCategory?: string | null;
  minorCategory?: string | null;
  customCategory?: string | null;
  workType?: string;
  name?: string;
  specification?: string | null;
  unit?: string;
  calculationMethod?: CalculationMethod;
  calculationParams?: CalculationParams | null;
  adjustmentFactor?: number;
  roundingUnit?: number;
  quantity?: number;
  remarks?: string | null;
}

interface QuantityItemInfo {
  id: string;
  quantityGroupId: string;
  majorCategory: string;
  middleCategory: string | null;
  minorCategory: string | null;
  customCategory: string | null;
  workType: string;
  name: string;
  specification: string | null;
  unit: string;
  calculationMethod: CalculationMethod;
  calculationParams: CalculationParams | null;
  adjustmentFactor: number;
  roundingUnit: number;
  quantity: number;
  remarks: string | null;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

interface BatchOperation {
  type: 'delete' | 'copy' | 'move';
  itemIds: string[];
  targetGroupId?: string; // moveの場合に必要
  position?: number; // moveの場合に必要
}
```

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| POST | /api/quantity-groups/:groupId/items | CreateQuantityItemInput | QuantityItemInfo | 400, 404 |
| GET | /api/quantity-groups/:groupId/items | - | QuantityItemInfo[] | 404 |
| PUT | /api/quantity-groups/:groupId/items/reorder | { orderedIds: string[] } | QuantityItemInfo[] | 400, 404 |
| GET | /api/quantity-items/:id | - | QuantityItemInfo | 404 |
| PUT | /api/quantity-items/:id | UpdateQuantityItemInput + expectedUpdatedAt | QuantityItemInfo | 400, 404, 409 |
| DELETE | /api/quantity-items/:id | - | 204 No Content | 404 |
| POST | /api/quantity-items/:id/copy | - | QuantityItemInfo | 404 |
| POST | /api/quantity-items/:id/move | { targetGroupId: string, position: number } | QuantityItemInfo | 400, 404 |
| POST | /api/quantity-items/batch | BatchOperation | QuantityItemInfo[] | 400, 404 |

**Implementation Notes**

- Integration: 計算ロジックはCalculationEngineに委譲
- Validation: 計算方法と入力値の整合性チェック、フィールド仕様準拠チェック
- Pattern: 既存のsite-surveys/survey-imagesパターンに準拠（ネストルート + フラットルート）

---

#### QuantityValidationService

| Field | Detail |
|-------|--------|
| Intent | フィールド仕様に基づく入力値検証を担当 |
| Requirements | 8.3, 8.4, 8.7, 8.10, 9.3, 9.4, 9.5, 10.3, 10.4, 10.5, 13.1, 13.2, 13.3, 13.4, 14.1, 14.2, 14.3, 14.4, 14.5, 15.1, 15.2, 15.3 |

**Responsibilities & Constraints**

- テキストフィールドの文字数制限検証（全角/半角対応）
- 数値フィールドの範囲検証
- 数値フィールドの表示書式設定
- 計算方法と入力値の整合性チェック

**Dependencies**

- Inbound: QuantityItemService (P0)
- External: -

**Contracts**: Service [x]

##### Service Interface

```typescript
interface QuantityValidationService {
  validateTextLength(value: string, maxZenkaku: number, maxHankaku: number): boolean;
  validateNumericRange(value: number, min: number, max: number): ValidationResult;
  validateAdjustmentFactor(value: number): ValidationResult;
  validateRoundingUnit(value: number): ValidationResult;
  validateQuantity(value: number): ValidationResult;
  validateDimensionField(value: number | null): ValidationResult;
  validateCalculationParams(method: CalculationMethod, params: CalculationParams): ValidationResult;
  formatDecimal2(value: number): string;
  formatConditionalDecimal2(value: number | null): string;
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  field: string;
  message: string;
}

interface ValidationWarning {
  field: string;
  message: string;
}

const FIELD_CONSTRAINTS = {
  MAJOR_CATEGORY: { zenkaku: 25, hankaku: 50 },
  MIDDLE_CATEGORY: { zenkaku: 25, hankaku: 50 },
  MINOR_CATEGORY: { zenkaku: 25, hankaku: 50 },
  CUSTOM_CATEGORY: { zenkaku: 25, hankaku: 50 },
  WORK_TYPE: { zenkaku: 8, hankaku: 16 },
  NAME: { zenkaku: 25, hankaku: 50 },
  SPECIFICATION: { zenkaku: 25, hankaku: 50 },
  UNIT: { zenkaku: 3, hankaku: 6 },
  CALCULATION_METHOD: { zenkaku: 25, hankaku: 50 },
  REMARKS: { zenkaku: 25, hankaku: 50 },
  ADJUSTMENT_FACTOR: { min: -9.99, max: 9.99, default: 1.00 },
  ROUNDING_UNIT: { min: -99.99, max: 99.99, default: 0.01 },
  QUANTITY: { min: -999999.99, max: 9999999.99, default: 0 },
  DIMENSION: { min: 0.01, max: 9999999.99 },
} as const;
```

**Implementation Notes**

- Integration: 既存のQuantityValidationServiceを拡張
- Validation: 全角/半角の文字幅を正しくカウント（全角は2、半角は1として計算）
- Risks: 文字幅計算の正確性（Unicode文字の取り扱い）

---

#### AutocompleteCandidatesEndpoint

| Field | Detail |
|-------|--------|
| Intent | プロジェクト単位でオートコンプリート対象フィールドの候補値を一括取得するエンドポイント |
| Requirements | 7.1, 7.2 |

**Responsibilities & Constraints**

- 同一プロジェクト内の全数量項目から対象フィールドのユニーク値をGROUP BYで取得
- 9フィールド（大項目、中項目、小項目、任意分類、工種、名称、規格、単位、備考）の候補を1回のAPIリクエストで返却
- 論理削除済み数量表の項目は除外
- レスポンスはフィールド名をキーとするマップ構造

**Dependencies**

- Inbound: QuantityTableEditPage (P0)
- External: PrismaClient (P0)

**Contracts**: API [x]

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| GET | /api/projects/:projectId/quantity-items/autocomplete-candidates | - | AutocompleteCandidatesResponse | 404 |

```typescript
/**
 * オートコンプリート対象フィールド名
 */
type AutocompleteFieldName =
  | 'majorCategory'
  | 'middleCategory'
  | 'minorCategory'
  | 'customCategory'
  | 'workType'
  | 'name'
  | 'specification'
  | 'unit'
  | 'remarks';

/**
 * オートコンプリート候補一括取得レスポンス
 *
 * 各フィールドに対してGROUP BYで重複排除した候補値の配列を返す。
 * 各配列は50音順（locale: 'ja'）でソート済み。
 */
interface AutocompleteCandidatesResponse {
  candidates: Record<AutocompleteFieldName, string[]>;
}
```

**実装方針**:

バックエンドは対象9フィールドそれぞれに対してPrisma `groupBy`を実行し、フィールド別の候補値マップを構築する。NULL値および空文字は除外する。

```typescript
// 実装概要（設計意図の説明）
// 9フィールドに対してgroupByを並列実行し、1レスポンスで返却
// 各フィールドのgroupByは以下のWHERE条件を使用:
//   - quantityGroup.quantityTable.projectId = :projectId
//   - quantityGroup.quantityTable.deletedAt IS NULL
//   - 当該フィールドがNOT NULLかつ空文字でない
// ソートはlocaleCompare('ja')による50音順
```

**Implementation Notes**

- Integration: 既存の `autocomplete.routes.ts` を置換または拡張。現行の個別エンドポイント（`/api/autocomplete/major-categories` 等）は廃止し、新エンドポイントに統合
- Validation: projectIdの存在チェック
- Performance: 9フィールドのgroupByを`Promise.all`で並列実行し、レスポンスタイムを最小化
- Risks: プロジェクト内の数量項目が極端に多い場合のクエリパフォーマンス。ただし通常の積算業務では1プロジェクトあたり数百〜数千項目程度であり問題ない

---

#### CalculationEngine

| Field | Detail |
|-------|--------|
| Intent | 高精度な数量計算ロジックを提供 |
| Requirements | 8.1-8.11, 9.1-9.7, 10.1-10.7 |

**Responsibilities & Constraints**

- Decimal.jsによる高精度演算
- 計算方法別のロジック実装
- 調整係数・丸め設定の適用
- 計算式の文字列生成（トレーサビリティ用）

**Dependencies**

- Inbound: QuantityItemService (P0), QuantityItemComponent (P0)
- External: decimal.js (P0)

**Contracts**: Service [x]

##### Service Interface

```typescript
interface CalculationEngine {
  calculateAreaVolume(params: AreaVolumeParams): Decimal;
  calculatePitch(params: PitchParams): Decimal;
  applyAdjustmentFactor(value: Decimal, factor: Decimal): Decimal;
  applyRounding(value: Decimal, unit: Decimal): Decimal;
  calculate(input: CalculationInput): CalculationResult;
}

interface AreaVolumeParams {
  width?: Decimal;
  depth?: Decimal;
  height?: Decimal;
  weight?: Decimal;
}

interface PitchParams {
  rangeLength: Decimal;
  endLength1: Decimal;
  endLength2: Decimal;
  pitchLength: Decimal;
  length?: Decimal;
  weight?: Decimal;
}
```

---

### Frontend Components

#### QuantityTableEditPage

| Field | Detail |
|-------|--------|
| Intent | 数量表の編集画面を提供 |
| Requirements | 3.1, 3.2, 3.3, 7.1 |

**Contracts**: State [x]

##### State Management

```typescript
interface QuantityTableEditState {
  quantityTable: QuantityTableDetail | null;
  isLoading: boolean;
  isSaving: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: Date | null;
  hasUnsavedChanges: boolean;
  validationErrors: ValidationError[];
  selectedItems: string[];
  expandedGroups: string[];
  /** オートコンプリート候補値マップ（初回API取得 + blur時のクライアント追加） */
  autocompleteCandidates: Record<AutocompleteFieldName, string[]>;
  /** オートコンプリート候補の読み込み状態 */
  isAutocompleteCandidatesLoading: boolean;
}

interface QuantityTableEditActions {
  loadQuantityTable(id: string): Promise<void>;
  /** 初回表示時にオートコンプリート候補を一括取得 */
  loadAutocompleteCandidates(projectId: string): Promise<void>;
  /** blur時にフィールド別候補リストへ値を追加（クライアントサイドのみ） */
  addAutocompleteCandidateOnBlur(field: AutocompleteFieldName, value: string): void;
  addGroup(): void;
  removeGroup(groupId: string): void;
  addItem(groupId: string): void;
  updateItem(itemId: string, updates: Partial<QuantityItem>): void;
  removeItem(itemId: string): void;
  copyItems(itemIds: string[]): void;
  moveItems(itemIds: string[], targetGroupId: string, position: number): void;
  save(): Promise<void>;
  triggerAutoSave(): void;
}
```

**Implementation Notes**

- Integration: useAutoSaveフックで1500msデバウンス自動保存。ページマウント時に`loadAutocompleteCandidates`を呼び出し、候補値をステートに保持
- Validation: 保存前に必須フィールドと計算整合性を検証
- Risks: 大量項目での再レンダリングパフォーマンス（react-windowで対応）

---

#### QuantityTableSectionCard

| Field | Detail |
|-------|--------|
| Intent | プロジェクト詳細画面に数量表セクションを表示 |
| Requirements | 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7 |

**Implementation Notes**

- Summary-only: SiteSurveySectionCardと同じパターン
- 表示要素: セクションタイトル、総数、直近N件のカード、「すべて見る」リンク

---

#### FieldValidator

| Field | Detail |
|-------|--------|
| Intent | フロントエンドでのフィールド入力制御と書式設定 |
| Requirements | 13.1, 13.2, 13.3, 13.4, 14.1, 14.2, 14.3, 14.4, 14.5, 15.1, 15.2, 15.3 |

**Responsibilities & Constraints**

- テキストフィールドの最大文字数超過防止
- 数値フィールドの範囲外入力エラー表示
- 数値フィールドの小数2桁常時表示
- 全てのテキストフィールドを左寄せ、数値フィールドを右寄せで表示

**Contracts**: Service [x]

##### Service Interface

```typescript
interface FieldValidator {
  validateTextInput(
    value: string,
    maxZenkaku: number,
    maxHankaku: number
  ): { isValid: boolean; truncated: string };

  validateNumericInput(
    value: number,
    min: number,
    max: number
  ): { isValid: boolean; error?: string };

  formatDecimal2(value: number): string;
  formatConditionalDecimal2(value: number | null): string;
  calculateStringWidth(value: string): number;
}

interface UseFieldFormatterOptions {
  type: 'text' | 'numeric' | 'conditional-numeric';
  maxZenkaku?: number;
  maxHankaku?: number;
  min?: number;
  max?: number;
  decimalPlaces?: number;
  alignment?: 'left' | 'right';
}

function useFieldFormatter(options: UseFieldFormatterOptions): {
  value: string;
  onChange: (newValue: string) => void;
  error: string | null;
  formattedValue: string;
  inputProps: {
    style: { textAlign: 'left' | 'right' };
    maxLength?: number;
  };
};
```

**Implementation Notes**

- Integration: 各入力コンポーネントで使用
- Validation: リアルタイムでの入力制御
- Risks: 全角/半角判定の正確性（文字コード範囲で判定）

---

#### AutocompleteCandidateStore

| Field | Detail |
|-------|--------|
| Intent | オートコンプリート候補値のクライアントサイド管理を担当 |
| Requirements | 7.1, 7.2, 7.3, 7.5, 7.6 |

**Responsibilities & Constraints**

- 初回表示時にAPIから取得した候補値マップをReactステートとして保持
- テキスト入力時にクライアントサイドでフィルタリングして候補を返却
- blur時に確定値をクライアントサイドの候補リストに追加（重複排除、APIリクエストなし）
- APIリクエストは数量表編集画面の初回表示時の1回のみ

**Dependencies**

- Inbound: AutocompleteInput (P0), QuantityTableEditPage (P0)
- External: -

**Contracts**: State [x]

##### State Management / Hook Interface

```typescript
/**
 * オートコンプリート候補ストアのカスタムフック
 *
 * 初回マウント時にAPIから候補を一括取得し、以降はクライアントサイドで管理する。
 * テキスト入力時のフィルタリングとblur時の候補追加はすべてクライアントサイドで実行。
 */
interface UseAutocompleteCandidateStoreOptions {
  /** プロジェクトID */
  projectId: string;
}

interface UseAutocompleteCandidateStoreResult {
  /** 候補の読み込み状態 */
  isLoading: boolean;
  /** 読み込みエラー */
  error: Error | null;

  /**
   * 指定フィールドの候補を入力値でフィルタリングして返す
   * @param field 対象フィールド名
   * @param inputText 入力中のテキスト
   * @returns フィルタリング済み候補リスト（50音順）
   */
  getSuggestions(field: AutocompleteFieldName, inputText: string): string[];

  /**
   * blur時に確定値をフィールドの候補リストに追加する
   * 既に存在する値の場合は重複追加しない。APIリクエストは発行しない。
   * @param field 対象フィールド名
   * @param value 確定された入力値
   */
  addCandidateOnBlur(field: AutocompleteFieldName, value: string): void;
}

function useAutocompleteCandidateStore(
  options: UseAutocompleteCandidateStoreOptions
): UseAutocompleteCandidateStoreResult;
```

##### フィルタリングロジック

```typescript
/**
 * クライアントサイドでの候補フィルタリング
 *
 * 1. 入力テキストが空の場合は全候補を返す（フォーカス時の全候補表示用）
 * 2. 入力テキストがある場合は前方一致する値を抽出
 * 3. 空文字を除外
 * 4. 50音順（locale: 'ja'）でソート
 * 5. 完全一致する入力値自体は候補から除外（入力中の値を重複表示しない）
 */
function filterCandidates(
  candidates: string[],
  inputText: string
): string[] {
  const trimmed = inputText.trim();
  const filtered = candidates.filter((v) => v.trim() !== '');

  if (!trimmed) {
    // 空入力時は全候補を返す（フォーカス時の全候補表示）
    return filtered.sort((a, b) => a.localeCompare(b, 'ja'));
  }

  return filtered
    .filter((v) => v.toLowerCase().startsWith(trimmed.toLowerCase()))
    .filter((v) => v !== inputText)
    .sort((a, b) => a.localeCompare(b, 'ja'));
}
```

##### blur時の候補追加ロジック

```typescript
/**
 * blur時の候補追加処理
 *
 * 対象フィールドの候補リストに確定値を追加する。
 * - 空文字・空白のみの値は追加しない
 * - 既に候補リストに存在する値は重複追加しない
 * - APIリクエストは一切発行しない（クライアントサイドのみの操作）
 */
function addCandidateOnBlur(
  currentCandidates: Record<AutocompleteFieldName, string[]>,
  field: AutocompleteFieldName,
  value: string
): Record<AutocompleteFieldName, string[]> {
  const trimmedValue = value.trim();
  if (!trimmedValue) return currentCandidates;

  const fieldCandidates = currentCandidates[field];
  if (fieldCandidates.includes(trimmedValue)) return currentCandidates;

  return {
    ...currentCandidates,
    [field]: [...fieldCandidates, trimmedValue],
  };
}
```

**Implementation Notes**

- Integration: QuantityTableEditPageのマウント時に`useAutocompleteCandidateStore`を初期化。各AutocompleteInputコンポーネントに`getSuggestions`と`addCandidateOnBlur`をpropsまたはContextで渡す
- Performance: 候補値はReactステートに保持し、フィルタリングはuseMemoで最適化。フィールドごとの候補数は通常数十〜数百件程度であり、クライアントサイドでの処理に十分な規模
- Risks: ページリロードなしで長時間編集した場合、他ユーザーが追加した値は反映されない。ただし数量表編集は個人作業が主であり、実運用上の問題は小さい

---

#### AutocompleteInput（更新）

| Field | Detail |
|-------|--------|
| Intent | クライアントサイド候補ストアに基づくオートコンプリート対応テキスト入力 |
| Requirements | 7.3, 7.4, 7.5, 7.6, 7.7 |

**Responsibilities & Constraints**

- `AutocompleteCandidateStore`から候補をフィルタリングして取得（APIリクエストなし）
- キーボード操作（上下キー選択、Enter確定、Escape閉じ）によるアクセシブルな候補選択
- blur時に確定値をストアに追加（APIリクエストなし）
- 50音順で候補を表示

**Dependencies**

- Inbound: QuantityItemComponent (P0)
- External: AutocompleteCandidateStore (P0)

**Contracts**: -（Props-based UI component）

```typescript
/**
 * AutocompleteInput Props（更新版）
 *
 * 従来のendpointベースの逐次API呼び出しから、
 * クライアントサイド候補ストアベースに変更
 */
interface AutocompleteInputProps {
  /** 現在の入力値 */
  value: string;
  /** 値変更時のコールバック */
  onChange: (value: string) => void;
  /** 対象フィールド名 */
  field: AutocompleteFieldName;
  /** 候補を取得する関数（AutocompleteCandidateStoreから注入） */
  getSuggestions: (field: AutocompleteFieldName, inputText: string) => string[];
  /** blur時に候補を追加する関数（AutocompleteCandidateStoreから注入） */
  onBlurAddCandidate: (field: AutocompleteFieldName, value: string) => void;
  /** プレースホルダー */
  placeholder?: string;
  /** ラベル */
  label?: string;
  /** 入力フィールドのID */
  id?: string;
  /** エラーメッセージ */
  error?: string;
  /** 必須フィールドかどうか */
  required?: boolean;
  /** 無効化フラグ */
  disabled?: boolean;
}
```

**Implementation Notes**

- Integration: 従来の`useAutocomplete`フック（逐次API方式）を使用せず、親コンポーネントから注入された`getSuggestions`関数で候補を取得。入力値が変更されるたびに`getSuggestions`を呼び出してクライアントサイドでフィルタリング
- Validation: 入力値の最大長チェック（列ごとの制約に準拠）
- blur時処理: `onBlur`イベントで`onBlurAddCandidate(field, value)`を呼び出し、確定値をクライアントサイドの候補リストに追加。APIリクエストは発行しない
- UX: フォーカス時に候補をドロップダウン表示（空入力時は全候補を表示し、入力値がある場合は前方一致フィルタリング）。入力中はリアルタイムでフィルタリング更新。上下キーで選択、Enterで確定

## Data Models

### Domain Model

```mermaid
erDiagram
    Project ||--o{ QuantityTable : has
    QuantityTable ||--o{ QuantityGroup : contains
    QuantityGroup ||--o{ QuantityItem : contains
    QuantityGroup }o--o| SurveyImage : references

    QuantityTable {
        uuid id PK
        uuid projectId FK
        string name
        datetime createdAt
        datetime updatedAt
        datetime deletedAt
    }

    QuantityGroup {
        uuid id PK
        uuid quantityTableId FK
        uuid surveyImageId FK
        string name
        int displayOrder
        datetime createdAt
        datetime updatedAt
    }

    QuantityItem {
        uuid id PK
        uuid quantityGroupId FK
        string majorCategory
        string middleCategory
        string minorCategory
        string customCategory
        string workType
        string name
        string specification
        string unit
        enum calculationMethod
        json calculationParams
        decimal adjustmentFactor
        decimal roundingUnit
        decimal quantity
        string remarks
        int displayOrder
        datetime createdAt
        datetime updatedAt
    }
```

**Business Rules & Invariants**:

- 数量表名は1-200文字
- 必須フィールド: 工種、名称、単位、計算方法、調整係数、丸め設定、数量
- テキストフィールドの文字数制限:
  - 大項目・中項目・小項目・任意分類・名称・規格・計算方法・備考: 全角25文字/半角50文字
  - 工種: 全角8文字/半角16文字
  - 単位: 全角3文字/半角6文字
- 調整係数の範囲: -9.99～9.99、デフォルト1.00
- 丸め設定の範囲: -99.99～99.99、デフォルト0.01、0または空白でデフォルト値適用
- 数量の範囲: -999999.99～9999999.99、デフォルト0
- 寸法・ピッチフィールドの範囲: 0.01～9999999.99または空白
- 計算方法「面積・体積」では幅(W)・奥行き(D)・高さ(H)のうち最低1項目の入力必須
- 計算方法「ピッチ」では範囲長・端長1・端長2・ピッチ長が必須

### Logical Data Model

**QuantityTable**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT uuid() | 数量表ID |
| projectId | UUID | FK, NOT NULL | プロジェクトID |
| name | VARCHAR(200) | NOT NULL | 数量表名 |
| createdAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |
| updatedAt | TIMESTAMP | NOT NULL, @updatedAt | 更新日時 |
| deletedAt | TIMESTAMP | NULL | 論理削除日時 |

**QuantityGroup**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT uuid() | 数量グループID |
| quantityTableId | UUID | FK, NOT NULL, ON DELETE CASCADE | 数量表ID |
| surveyImageId | UUID | FK, NULL | 紐付け現場調査画像ID |
| name | VARCHAR(200) | NULL | グループ名 |
| displayOrder | INT | NOT NULL | 表示順序 |
| createdAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |
| updatedAt | TIMESTAMP | NOT NULL, @updatedAt | 更新日時 |

**QuantityItem**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT uuid() | 数量項目ID |
| quantityGroupId | UUID | FK, NOT NULL, ON DELETE CASCADE | 数量グループID |
| majorCategory | VARCHAR(50) | NOT NULL | 大項目（全角25/半角50） |
| middleCategory | VARCHAR(50) | NULL | 中項目（全角25/半角50） |
| minorCategory | VARCHAR(50) | NULL | 小項目（全角25/半角50） |
| customCategory | VARCHAR(50) | NULL | 任意分類（全角25/半角50） |
| workType | VARCHAR(16) | NOT NULL | 工種（全角8/半角16） |
| name | VARCHAR(50) | NOT NULL | 名称（全角25/半角50） |
| specification | VARCHAR(50) | NULL | 規格（全角25/半角50） |
| unit | VARCHAR(6) | NOT NULL | 単位（全角3/半角6） |
| calculationMethod | ENUM | NOT NULL, DEFAULT 'STANDARD' | 計算方法 |
| calculationParams | JSONB | NULL | 計算用パラメータ |
| adjustmentFactor | DECIMAL(5,2) | NOT NULL, DEFAULT 1.00 | 調整係数（-9.99～9.99） |
| roundingUnit | DECIMAL(6,2) | NOT NULL, DEFAULT 0.01 | 丸め単位（-99.99～99.99） |
| quantity | DECIMAL(12,2) | NOT NULL | 数量（-999999.99～9999999.99） |
| remarks | VARCHAR(50) | NULL | 備考（全角25/半角50） |
| displayOrder | INT | NOT NULL | 表示順序 |
| createdAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |
| updatedAt | TIMESTAMP | NOT NULL, @updatedAt | 更新日時 |

**Indexes**:

- `@@index([projectId])` on QuantityTable
- `@@index([deletedAt])` on QuantityTable
- `@@index([quantityTableId, displayOrder])` on QuantityGroup
- `@@index([quantityGroupId, displayOrder])` on QuantityItem

**Enum Definition**:

```prisma
enum CalculationMethod {
  STANDARD      // 標準（直接入力）
  AREA_VOLUME   // 面積・体積
  PITCH         // ピッチ
}
```

## Error Handling

### Error Categories and Responses

**User Errors (4xx)**:

- `400 BAD_REQUEST`: 入力バリデーションエラー（必須フィールド未入力、計算方法と入力値の不整合、範囲外入力、文字数超過、コピー先名前の不正）
- `404 NOT_FOUND`: 数量表・グループ・項目が存在しない、またはオートコンプリート候補取得時にプロジェクトが存在しない、コピー元の数量表が存在しない
- `409 CONFLICT`: 楽観的排他制御エラー（他ユーザーによる更新との競合）
- `422 UNPROCESSABLE_ENTITY`: ビジネスロジックエラー
- `500 INTERNAL_SERVER_ERROR`: コピー処理中の予期しないエラー（トランザクションROLLBACKにより不完全データは残らない）

**Business Logic Errors**:

- 計算不整合エラー: 問題のフィールドをハイライト
- 必須項目未入力エラー: 面積・体積やピッチモードでの必須項目チェック
- 範囲外入力エラー: 各フィールドの入力可能範囲を超えた値
- 文字数超過エラー: テキストフィールドの最大文字数超過

**オートコンプリート関連エラー**:

- 初回候補取得失敗: オートコンプリート候補の読み込みエラーが発生しても、数量表編集機能自体は正常に動作する（graceful degradation）。エラー時はオートコンプリート機能を無効化し、手入力のみで運用可能

### Monitoring

- 保存エラー率の監視
- 自動保存の成功率
- 計算エラー発生頻度
- バリデーションエラー分布
- オートコンプリート候補取得APIのレスポンスタイム

## Testing Strategy

### Unit Tests

- CalculationEngine: 各計算方法（標準、面積・体積、ピッチ）のテスト
- QuantityTableService: CRUD操作、楽観的排他制御のテスト
- QuantityTableService.copy: ディープコピー（全グループ・全項目の複製、写真紐づけ維持、トランザクションROLLBACK）
- QuantityGroupService: CRUD操作、写真紐付けのテスト
- QuantityItemService: 計算検証のテスト
- QuantityValidationService: フィールド仕様バリデーションのテスト
  - テキストフィールド文字数制限（全角/半角）
  - 数値フィールド範囲検証
  - 表示書式変換
- AutocompleteCandidateStore: クライアントサイドフィルタリングのテスト
  - `filterCandidates`: 前方一致フィルタリング、50音順ソート、空文字除外
  - `addCandidateOnBlur`: 重複排除、空文字拒否、既存候補との統合
  - 候補取得APIレスポンスの正しいステート格納
- CopyQuantityTableDialog: デフォルト名設定、処理中インジケーター、エラーメッセージ表示
- QuantityGroupTitleRow: メインタイトル行の全列テキスト表示、グリッドレイアウト一致
- QuantityGroupCard: タイトル行が項目存在時にのみ1つ表示されること
- EditableQuantityItemRow: showFieldLabels=falseでラベル非表示、計算用タイトルは影響なし

### Integration Tests

- 数量表作成 → グループ追加 → 項目追加 → 保存の一連フロー
- 計算方法の切り替えと数量再計算の正確性テスト
- 楽観的排他制御の競合シナリオ
- フィールドバリデーションエラー時の保存阻止
- オートコンプリート候補一括取得API: プロジェクト内の複数数量表・項目からフィールド別にGROUP BYで重複排除された候補値が返却されることの検証
- 数量表コピーAPI: 全データが正しく複製されること（グループ数、項目数、各フィールド値の一致、写真紐づけの維持）
- 数量表コピーAPI: コピー先とコピー元が独立していること（一方の編集が他方に影響しない）

### E2E Tests

- 数量表新規作成から編集・保存までのフロー
- 計算方法変更と数量再計算
- コピー・移動操作
- パンくずナビゲーション
- 入力制限の動作確認
  - テキストフィールドの最大文字数入力防止
  - 数値フィールドの範囲外入力エラー表示
  - 小数2桁表示の自動書式設定
- オートコンプリート操作
  - 数量表編集画面表示時に候補が一括取得されること
  - フォーカス時に候補がドロップダウン表示されること（空入力時は全候補、入力値ありはフィルタリング済み）
  - テキスト入力時に候補がリアルタイムでフィルタリング更新されること
  - 候補選択時にフィールドに値が自動入力されること
  - blur時に入力値がクライアントサイドの候補リストに追加されること
  - 候補追加後に同じフィールドで再入力すると追加された値が候補に表示されること
- 数量表コピー操作
  - 数量表一覧画面でコピーボタンクリック → ダイアログ表示 → 名前入力 → コピー実行 → 編集画面遷移の一連フロー
  - コピーされた数量表のデータが元の数量表と一致することの確認
  - コピー中の重複操作防止の確認
  - デフォルトコピー名「{元の名前}のコピー」が設定されていることの確認
- タイトル行表示最適化
  - 各グループの先頭にメインタイトル行が1つだけ表示されていること
  - 2行目以降の数量項目にメインタイトル行が繰り返し表示されないこと
  - 面積・体積/ピッチ計算用フィールドのタイトル行は各項目に表示されること
  - グループ折りたたみ/再展開後にタイトル行の表示ルールが維持されること

### Performance Tests

- 100項目以上の数量表での操作レスポンス
- 自動保存のデバウンス動作
- オートコンプリート候補一括取得APIのレスポンスタイム（数百項目規模のプロジェクト）
- クライアントサイドフィルタリングの応答時間（数百候補での前方一致フィルタリング）
- 計算エンジンの大量項目での処理時間

## Security Considerations

- 認証済みユーザーのみアクセス可能（既存のProtectedRoute使用）
- プロジェクトへのアクセス権限チェック（既存のRBAC使用）
- オートコンプリート候補一括取得APIは`quantity_table:read`権限を要求
- 入力値のサニタイズ（Zodスキーマ）
- 数値範囲の厳格なバリデーション（オーバーフロー防止）

## Performance & Scalability

- 仮想スクロール: react-windowで100項目以上の数量表に対応
- 遅延読み込み: 数量グループの展開時にのみ項目をフェッチ
- メモ化: 計算結果のキャッシュ（useMemo）
- デバウンス: 自動保存は1500msデバウンス
- バッチ処理: 複数項目の一括操作をトランザクションで実行
- 入力制御の最適化: 文字幅計算のキャッシュ
- オートコンプリート最適化: 初回一括取得によりテキスト入力中のAPIリクエストを完全排除。9フィールドのgroupByを`Promise.all`で並列実行。候補フィルタリングはuseMemoで最適化

## Phase 4: フォーカス時入力値全選択

### 概要

数量表編集画面の対象フィールド（大項目、中項目、小項目、任意分類、工種、名称、規格、数量、単位、備考）にフォーカスが当たった際に、既存の入力値を全選択状態にする機能を追加する。これにより、上書き入力を効率的に行えるようにする。

### 影響範囲分析

#### 対象コンポーネントとフィールドの対応

| フィールド | コンポーネント | 入力要素タイプ | 現在のonFocus動作 | 変更方針 |
|-----------|--------------|--------------|------------------|---------|
| 大項目 | AutocompleteInput | `<input type="text">` | ドロップダウン開放 | `select()`を追加 |
| 中項目 | AutocompleteInput | `<input type="text">` | ドロップダウン開放 | `select()`を追加 |
| 小項目 | AutocompleteInput | `<input type="text">` | ドロップダウン開放 | `select()`を追加 |
| 任意分類 | AutocompleteInput | `<input type="text">` | ドロップダウン開放 | `select()`を追加 |
| 工種 | AutocompleteInput | `<input type="text">` | ドロップダウン開放 | `select()`を追加 |
| 規格 | AutocompleteInput | `<input type="text">` | ドロップダウン開放 | `select()`を追加 |
| 単位 | AutocompleteInput | `<input type="text">` | ドロップダウン開放 | `select()`を追加 |
| 名称 | FieldValidatedItemRow直接 | `<input type="text">` | なし | `onFocus`で`select()`を追加 |
| 数量 | FieldValidatedItemRow直接 | `<input type="number">` | なし | `onFocus`で`select()`を追加 |
| 備考 | FieldValidatedItemRow直接 | `<input type="text">` | なし | `onFocus`で`select()`を追加 |

### 設計方針

#### AutocompleteInputコンポーネントの変更

`AutocompleteInput.tsx`の`handleFocus`コールバック内で`inputRef.current?.select()`を呼び出す。`select()`はブラウザ標準のHTMLInputElement.select()メソッドであり、入力フィールドの全テキストを選択する。

```typescript
/**
 * フォーカス時ハンドラ（変更後）
 */
const handleFocus = useCallback(() => {
  setIsFocused(true);
  // フォーカス時に既存の入力値を全選択
  inputRef.current?.select();
  // フォーカス時に常にドロップダウンを開く（候補がある場合）
  if (suggestions.length > 0) {
    setIsOpen(true);
  }
}, [suggestions.length]);
```

**フォーカス時の候補表示**: フォーカス時に`suggestions.length > 0`であればドロップダウンを開く。`value`の有無に関わらず開くため、空のフィールドにフォーカスした場合も全候補が表示される。`getSuggestions`が空入力時に全候補を返すように変更されているため、空フィールドでも候補リストが表示される。

**オートコンプリートとの共存**: `select()`はテキスト選択状態を設定するだけであり、ドロップダウンの開閉とは独立して動作する。全選択状態でユーザーが文字を入力すると選択範囲が置換されるが、これはブラウザ標準動作であり、入力値の変更→`handleInputChange`→候補フィルタリングの既存フローがそのまま機能する。

#### FieldValidatedItemRowコンポーネントの変更

名称・数量・備考の直接入力フィールドに`onFocus`ハンドラを追加し、`e.target.select()`を呼び出す。

```typescript
/**
 * フォーカス時に全選択するハンドラ
 */
const handleSelectOnFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
  e.target.select();
}, []);
```

各`<input>`要素に`onFocus={handleSelectOnFocus}`を追加する。

### コンポーネント設計詳細

#### AutocompleteInput変更

- **変更点**: `handleFocus`コールバック内に`inputRef.current?.select()`を1行追加
- **影響**: 全てのAutocompleteInputフィールド（大項目、中項目、小項目、任意分類、工種、規格、単位）に一括適用される
- **副作用なし**: `select()`はDOMのテキスト選択状態のみ変更し、React状態やイベントフローに影響しない

#### FieldValidatedItemRow変更

| フィールド | 現在の`onFocus` | 変更後の`onFocus` |
|-----------|----------------|------------------|
| 名称 | なし | `handleSelectOnFocus` |
| 数量 | なし | `handleSelectOnFocus` |
| 備考 | なし | `handleSelectOnFocus` |

### テスト設計

#### 単体テスト

- AutocompleteInputのフォーカス時に`select()`が呼ばれることを検証
- FieldValidatedItemRowの名称・数量・備考フィールドでフォーカス時に`select()`が呼ばれることを検証
- 全選択状態で候補ドロップダウンが正常に表示されることを検証

#### E2Eテスト

- 対象10フィールドそれぞれにフォーカスして全選択状態になることを確認
- 全選択状態で新しい文字を入力すると既存値が置換されることを確認
- オートコンプリート対象フィールドで全選択とドロップダウンが共存することを確認

### Requirements Traceability（追加分）

| Requirement | Summary | Components | Interfaces | Flows |
|-------------|---------|------------|------------|-------|
| 16.1-16.7 | オートコンプリート対象テキストフィールドのフォーカス時全選択 | AutocompleteInput | - | - |
| 16.6 | 名称フィールドのフォーカス時全選択 | FieldValidatedItemRow | - | - |
| 16.8 | 数量フィールドのフォーカス時全選択 | FieldValidatedItemRow | - | - |
| 16.10 | 備考フィールドのフォーカス時全選択 | FieldValidatedItemRow | - | - |
| 16.11 | 全選択状態での上書き入力 | ブラウザ標準動作 | - | - |
| 16.12 | オートコンプリートとの共存 | AutocompleteInput | - | - |

## Phase 5: 数量表コピー機能

### 概要

数量表一覧画面から既存の数量表をコピーして新しい数量表を作成する機能を追加する。コピーは全データ（数量グループ、数量項目、各フィールドの値、写真紐づけ）のディープコピーを行い、元の数量表とは完全に独立したデータとして管理される。

### 影響範囲分析

#### バックエンド変更

| 対象 | 変更内容 | 影響度 |
|------|---------|--------|
| QuantityTableService | `copy`メソッドの追加 | 中（新規メソッド追加、既存変更なし） |
| quantity-table.schema.ts | `CopyQuantityTableInput` Zodスキーマ追加 | 小 |
| quantity-table.routes.ts | `POST /api/quantity-tables/:id/copy` エンドポイント追加 | 小 |
| quantityTableError.ts | コピー関連エラークラス追加（任意） | 小 |

#### フロントエンド変更

| 対象 | 変更内容 | 影響度 |
|------|---------|--------|
| QuantityTableListPage | コピーボタンの追加 | 小 |
| CopyQuantityTableDialog（新規） | コピーダイアログコンポーネント | 中（新規） |
| quantity-tables.ts（API） | `copyQuantityTable` API関数追加 | 小 |

### 設計方針

#### QuantityTableService.copy メソッド

```typescript
/**
 * 数量表をディープコピーする
 *
 * 単一トランザクション内で以下を実行:
 * 1. 元の数量表を全グループ・全項目含めて取得
 * 2. 新しい数量表を作成（指定された名前で）
 * 3. 全グループを複製（displayOrder維持、surveyImageId維持）
 * 4. 各グループ内の全項目を複製（全フィールド値・displayOrder維持）
 *
 * エラー時はトランザクションROLLBACKにより不完全なコピーデータが残らない。
 *
 * @param id コピー元の数量表ID
 * @param input コピー先の名前
 * @param actorId 実行ユーザーID
 * @returns コピーされた新しい数量表の情報
 * @throws QuantityTableNotFoundError コピー元が存在しない場合
 */
async copy(
  id: string,
  input: CopyQuantityTableInput,
  actorId: string
): Promise<QuantityTableInfo>;
```

**ディープコピー対象データ**:

| レベル | コピー対象フィールド | 新規生成フィールド |
|--------|--------------------|--------------------|
| QuantityTable | name（inputから指定）, projectId | id, createdAt, updatedAt |
| QuantityGroup | name, surveyImageId, displayOrder | id, quantityTableId, createdAt, updatedAt |
| QuantityItem | majorCategory, middleCategory, minorCategory, customCategory, workType, name, specification, unit, calculationMethod, calculationParams, adjustmentFactor, roundingUnit, quantity, remarks, displayOrder | id, quantityGroupId, createdAt, updatedAt |

**トランザクション設計**:

```typescript
// 設計意図の説明（擬似コード）
// prisma.$transaction 内で全操作を実行
// 1. findById で元の数量表を include: { groups: { include: { items: true } } } で取得
// 2. 元が見つからない場合は QuantityTableNotFoundError
// 3. create で新しい数量表を作成
// 4. 元の各グループに対して create で新グループを作成（surveyImageId維持）
// 5. 元の各項目に対して create で新項目を作成（全フィールド値をコピー）
// 6. 監査ログに記録
```

#### CopyQuantityTableDialog コンポーネント

```typescript
/**
 * 数量表コピーダイアログ
 *
 * 数量表一覧画面から呼び出されるモーダルダイアログ。
 * コピー先の数量表名を入力し、コピーを実行する。
 */
interface CopyQuantityTableDialogProps {
  /** ダイアログの表示状態 */
  isOpen: boolean;
  /** ダイアログを閉じるコールバック */
  onClose: () => void;
  /** コピー元の数量表情報 */
  sourceTable: {
    id: string;
    name: string;
  };
  /** コピー完了時のコールバック（コピーされた数量表のIDを受け取る） */
  onCopyComplete: (copiedTableId: string) => void;
}
```

**UI仕様**:

- タイトル: 「数量表をコピー」
- 数量表名入力フィールド: デフォルト値「{元の数量表名}のコピー」
- 「キャンセル」ボタンと「コピーを作成」ボタン
- コピー実行中: ボタンを無効化し、スピナー（処理中インジケーター）を表示
- エラー時: エラーメッセージをダイアログ内に表示
- 成功時: `onCopyComplete`でコピー先数量表のIDを返し、呼び出し元がナビゲーションを実行

#### QuantityTableListPage の変更

- 各数量表カードにコピーボタン（アイコン + 「コピー」テキスト）を追加
- コピーボタンクリック時に`CopyQuantityTableDialog`を表示
- `onCopyComplete`でコピーされた数量表の編集画面（`/projects/{projectId}/quantity-tables/{copiedTableId}`）に`navigate`で遷移

#### API関数の追加

```typescript
/**
 * 数量表をコピーするAPI関数
 */
async function copyQuantityTable(
  tableId: string,
  input: CopyQuantityTableInput
): Promise<QuantityTableInfo>;
```

### Zodスキーマ定義

```typescript
const copyQuantityTableSchema = z.object({
  name: z.string().min(1).max(200),
});

type CopyQuantityTableInput = z.infer<typeof copyQuantityTableSchema>;
```

### テスト設計

#### 単体テスト

- QuantityTableService.copy: 正常なディープコピー（全グループ・全項目の複製確認）
- QuantityTableService.copy: 写真紐づけ（surveyImageId）の維持確認
- QuantityTableService.copy: コピー元が存在しない場合のエラー
- QuantityTableService.copy: トランザクションROLLBACKの確認
- CopyQuantityTableDialog: デフォルト名の設定確認
- CopyQuantityTableDialog: 処理中インジケーターの表示確認
- CopyQuantityTableDialog: エラーメッセージの表示確認

#### 統合テスト

- コピーAPI: 全データが正しく複製されること（グループ数、項目数、各フィールド値の一致）
- コピーAPI: コピー先とコピー元が独立していること（一方の編集が他方に影響しない）
- コピーAPI: 大量データ（50グループ、500項目）のコピーパフォーマンス

#### E2Eテスト

- 数量表一覧画面でコピーボタンをクリック → ダイアログ表示 → 名前入力 → コピー実行 → 編集画面遷移の一連フロー
- コピーされた数量表のデータが元の数量表と一致することの確認
- コピー中の重複操作防止の確認

## Phase 6: 数量項目タイトル行の表示最適化

### 概要

数量表編集画面において、メインのタイトル行（大項目・中項目・小項目・任意分類・工種・名称・規格・計算方法・数量・単位・備考）を各数量グループの先頭にのみ表示し、2行目以降の数量項目にはメインのタイトル行を繰り返し表示しないよう最適化する。計算方法固有のフィールドタイトル行（面積・体積用、ピッチ用）は従来通り各項目の計算用フィールド群とセットで表示する。

### 影響範囲分析

#### 現状の実装構造

現在の`EditableQuantityItemRow`は各行内に`fieldLabel`（フィールドラベル）をインラインで持っている。グループレベルでのタイトル行は存在しない。

#### 変更対象コンポーネント

| 対象 | 変更内容 | 影響度 |
|------|---------|--------|
| QuantityGroupTitleRow（新規） | グループ先頭のメインタイトル行コンポーネント | 中（新規） |
| QuantityGroupCard | タイトル行を項目リストの先頭に挿入 | 小 |
| EditableQuantityItemRow | メインフィールドのラベル表示を抑制 | 中 |

### 設計方針

#### QuantityGroupTitleRow コンポーネント（新規）

```typescript
/**
 * 数量グループのメインタイトル行
 *
 * 数量グループ内の項目リストの先頭にのみ表示される。
 * メインの列タイトル（大項目・中項目・小項目・任意分類・工種・名称・規格・計算方法・数量・単位・備考）を表示する。
 *
 * 計算方法固有のタイトル行（面積・体積/ピッチ）はこのコンポーネントの対象外であり、
 * 各EditableQuantityItemRow内のCalculationFieldsコンポーネントが従来通り担当する。
 */
interface QuantityGroupTitleRowProps {
  /** 編集モードかどうか（trueの場合はEditableQuantityItemRowと同じグリッド構造を使用） */
  isEditable?: boolean;
}
```

**表示内容**:

| 列位置 | タイトルテキスト | グリッド幅 |
|--------|----------------|-----------|
| 1 | 大項目 | 76px |
| 2 | 中項目 | 76px |
| 3 | 小項目 | 76px |
| 4 | 任意分類 | 76px |
| 5 | 工種 | 88px |
| 6 | 名称 | 202px |
| 7 | 規格 | 202px |
| 8 | 計算方法 | 90px |
| 9 | 数量 | 80px |
| 10 | 単位 | 46px |
| 11 | 備考 | 76px |
| 12 | 操作 | 80px |

**スタイル仕様**:

- グリッドレイアウト: `EditableQuantityItemRow`の`row`スタイルと同一の`gridTemplateColumns`を使用
- 背景色: `#f3f4f6`（薄いグレー）
- フォント: 11px, fontWeight 600, color `#374151`
- 下線: 1px solid `#d1d5db`

#### QuantityGroupCard の変更

`QuantityGroupCard`の項目リストレンダリング部分で、`items.map`の前に`QuantityGroupTitleRow`を1つ挿入する。

```typescript
// 変更後のレンダリングロジック（設計意図の説明）
<div style={styles.itemList} role="table" aria-label="数量項目一覧">
  {/* REQ-18.1: メインタイトル行をグループ先頭にのみ表示 */}
  {items.length > 0 && (
    <QuantityGroupTitleRow isEditable={isEditable} />
  )}
  <div role="rowgroup">
    {items.map((item, index) =>
      isEditable ? (
        <EditableQuantityItemRow
          key={item.id}
          item={item}
          showFieldLabels={false}  // REQ-18.2: 個別行のラベル非表示
          // ... 既存props
        />
      ) : (
        <QuantityItemRow key={item.id} item={item} />
      )
    )}
  </div>
</div>
```

#### EditableQuantityItemRow の変更

新しいprop `showFieldLabels` を追加し、`false`の場合はメインフィールドのラベル（`fieldLabel`スタイルの要素）を非表示にする。

```typescript
interface EditableQuantityItemRowProps {
  // ... 既存props
  /**
   * メインフィールドのラベル表示フラグ
   * false の場合、大項目〜備考のフィールドラベルを非表示にする。
   * 計算用フィールド（面積・体積/ピッチ）のタイトル行は影響を受けない。
   * @default true（後方互換性のため）
   */
  showFieldLabels?: boolean;
}
```

**変更の詳細**:

- `showFieldLabels`が`false`の場合: メインの行グリッド内の各フィールドラベル要素をレンダリングしない
- `showFieldLabels`が`true`（デフォルト）の場合: 従来通りラベルを表示（後方互換性維持）
- 計算用フィールドのタイトル行（`CalculationFields`コンポーネント内）は`showFieldLabels`の影響を受けず、従来通り各計算用フィールド群とセットで表示される（REQ-18.3, 18.4）

#### 折りたたみ/再展開時の動作（REQ-18.5）

タイトル行表示は`items.length > 0`の条件と`isExpanded`状態に基づいてレンダリングされるため、グループの折りたたみ/再展開時にタイトル行の表示ルールが自動的に維持される。追加のロジックは不要。

### テスト設計

#### 単体テスト

- QuantityGroupTitleRow: メインタイトル行の全11列が正しいテキストで表示されること
- QuantityGroupTitleRow: グリッドレイアウトがEditableQuantityItemRowと一致すること
- QuantityGroupCard: 項目が存在する場合にタイトル行が1つだけ表示されること
- QuantityGroupCard: 項目が存在しない場合にタイトル行が表示されないこと
- EditableQuantityItemRow: showFieldLabels=falseの場合にメインフィールドラベルが非表示になること
- EditableQuantityItemRow: showFieldLabels=falseの場合でも計算用フィールドのタイトルは表示されること
- QuantityGroupCard: 折りたたみ/再展開後にタイトル行が正しく表示されること

#### E2Eテスト

- 数量表編集画面で各グループの先頭にメインタイトル行が1つだけ表示されていること
- 2行目以降の数量項目にメインタイトル行が繰り返し表示されないこと
- 面積・体積/ピッチ計算用フィールドのタイトル行は各項目に表示されること
- グループ折りたたみ/再展開後にタイトル行の表示ルールが維持されること
