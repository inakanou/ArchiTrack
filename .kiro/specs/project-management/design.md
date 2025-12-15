# 技術設計書

## Overview

本ドキュメントは、ArchiTrackシステムにおけるプロジェクト管理機能の技術設計を定義します。プロジェクトとは、工事案件が発生した際に最初に作成されるエンティティであり、当該工事における現場調査や見積などの業務は、プロジェクト配下にぶら下がる形で管理されます。

**Purpose**: ユーザーが工事案件のプロジェクトを作成・管理し、ステータスを追跡できるようにすることで、業務の可視化と効率化を実現します。

**Users**: 一般ユーザー（プロジェクトの作成・編集・閲覧）、システム管理者（アクセス制御・監査）

**Impact**: 既存の認証・認可基盤、監査ログ基盤、UIコンポーネント（AppHeader、Dashboard、ProtectedLayout）を拡張し、新しいプロジェクト管理ドメインを導入します。

### Goals

- プロジェクトのCRUD操作を実現し、工事案件の一元管理を可能にする
- 12段階のステータスワークフロー（順方向遷移・差し戻し遷移・終端遷移）により、プロジェクトの進捗を正確に追跡する
- 既存のRBAC基盤を活用した権限ベースのアクセス制御を実装する
- 取引先管理機能との連携により、取引先IDによる外部キー参照でデータ整合性を確保する
- レスポンシブデザインによりデスクトップ・タブレット・モバイルに対応する
- WCAG 2.1 Level AA準拠のアクセシビリティを確保する
- **プロジェクト名の一意性を確保し、重複を防止する**（1.15, 1.16, 8.7, 8.8）

### Non-Goals

- 現場調査機能の実装（プロジェクト詳細画面からのリンクのみ、機能フラグで制御）
- 見積書機能の実装（プロジェクト詳細画面からのリンクのみ、機能フラグで制御）
- 取引先管理機能の実装（別仕様`trading-partner-management`として定義）
- プロジェクトの一括インポート・エクスポート機能
- プロジェクトのアーカイブ・復元機能

**注記**: 取引先連携機能（Requirement 22）は本仕様のスコープに含まれ、取引先管理機能（`trading-partner-management`仕様）実装後に`customerName`フィールドから`tradingPartnerId`外部キーへ移行しました（2025-12-12マイグレーション完了）。プロジェクトは取引先テーブルへの外部キー参照により取引先情報を取得します。

---

**実装状態（2025-12-15更新）**:
- フェーズ: **要件更新対応** - 既存実装は完了済み、要件変更に対応するための差分設計
- 主要変更（2025-12-15 gap analysis結果）:
  - ~~フィールドラベル変更:「取引先」→「顧客名」（TradingPartnerSelect、ProjectDetailPage）~~（実装済み）
  - ~~プロジェクト検索でのひらがな・カタカナ両対応（project.service.ts）~~（実装済み）
  - **TradingPartnerSelectのクライアントサイドフィルタリングでひらがな・カタカナ両対応**（未実装・要対応）
  - フロントエンドに`kana-converter.ts`を新規作成（バックエンドから移植）
- 主要変更（2025-12-13要件更新）:
  - 一覧画面からID列を削除、営業担当者・工事担当者列を追加（2.2）
  - 検索対象に営業担当者・工事担当者を追加（4.1a, 4.1b）
  - フリガナ検索でひらがな・カタカナ両対応（16.3, 22.5）
  - プロジェクト名の一意性チェックを追加（1.15, 1.16, 8.7, 8.8）
- 既存実装（2025-12-12）:
  - `customerName`（文字列フィールド）→ `tradingPartnerId`（外部キー）への移行完了
  - `TradingPartnerSelect`コンポーネントによる取引先選択UI実装
  - E2Eテスト、統合テスト、単体テスト全て合格
- マイグレーション: `20251212021700_replace_customer_name_with_trading_partner_id`

---

## Architecture

### Existing Architecture Analysis

ArchiTrackは、フロントエンド（React 19 + TypeScript）とバックエンド（Express 5 + Prisma 7）を分離したモノレポ構成を採用しています。

**既存パターン**:
- **認証・認可**: JWT認証（EdDSA署名）、RBACサービス（`rbac.service.ts`）、権限ミドルウェア（`authorize.middleware.ts`）
- **監査ログ**: `audit-log.service.ts`によるセンシティブ操作の記録
- **UIレイアウト**: `ProtectedLayout`による認証済み画面の共通レイアウト、`AppHeader`によるナビゲーション
- **ルーティング**: React Router v7による宣言的ルーティング
- **データアクセス**: Prisma ORMによる型安全なデータアクセス、Driver Adapter Pattern

**既存実装状況**（差分設計の基盤）:
- `backend/src/routes/projects.routes.ts`: プロジェクトCRUD APIルート（実装済み）
- `backend/src/services/project.service.ts`: プロジェクトサービス（実装済み）
- `backend/src/services/project-status.service.ts`: ステータス遷移サービス（実装済み）
- `backend/src/schemas/project.schema.ts`: Zodバリデーションスキーマ（実装済み）
- `frontend/src/pages/ProjectListPage.tsx`: プロジェクト一覧ページ（実装済み）
- `frontend/src/pages/ProjectDetailPage.tsx`: プロジェクト詳細ページ（実装済み）
- `frontend/src/components/projects/ProjectListTable.tsx`: 一覧テーブル（実装済み）

**拡張ポイント**:
- Prismaスキーマに`Project`および`ProjectStatusHistory`モデルを追加
- `AppHeader`に「プロジェクト」ナビゲーションリンクを追加
- `Dashboard`にプロジェクト管理カードを追加
- 新しいAPI routes（`projects.routes.ts`）を追加
- 新しいPermissionレコード（`project:create/read/update/delete`）を追加

### Architecture Pattern & Boundary Map

```mermaid
graph TB
    subgraph Frontend[Frontend Layer]
        AppHeader[AppHeader]
        Dashboard[Dashboard]
        ProjectList[ProjectListPage]
        ProjectDetail[ProjectDetailPage]
        ProjectForm[ProjectForm]
        StatusTransitionUI[StatusTransitionUI]
    end

    subgraph Backend[Backend Layer]
        ProjectRoutes[projects.routes]
        UserRoutes[users.routes]
        ProjectService[ProjectService]
        ProjectStatusService[ProjectStatusService]
        RBACService[RBACService]
        AuditLogService[AuditLogService]
    end

    subgraph Data[Data Layer]
        Prisma[Prisma Client]
        PostgreSQL[(PostgreSQL)]
        Redis[(Redis Cache)]
    end

    AppHeader --> ProjectList
    Dashboard --> ProjectList
    ProjectList --> ProjectDetail
    ProjectDetail --> ProjectForm
    ProjectDetail --> StatusTransitionUI

    ProjectList --> ProjectRoutes
    ProjectDetail --> ProjectRoutes
    ProjectForm --> ProjectRoutes
    ProjectForm --> UserRoutes
    StatusTransitionUI --> ProjectRoutes

    ProjectRoutes --> ProjectService
    ProjectRoutes --> RBACService
    ProjectService --> ProjectStatusService
    ProjectService --> AuditLogService

    ProjectService --> Prisma
    RBACService --> Redis
    Prisma --> PostgreSQL
```

**Architecture Integration**:
- **Selected pattern**: Service Layer Pattern（既存のサービス層パターンを踏襲）
- **Domain boundaries**: プロジェクト管理ドメインは独立したサービス層を持ち、認証・認可ドメインとは明確に分離
- **Existing patterns preserved**: RBACによる権限チェック、監査ログ記録、Cache-Aside Pattern
- **New components rationale**: プロジェクト固有のビジネスロジック（ステータス遷移、バリデーション）を担当
- **Steering compliance**: TypeScript strict mode、Prisma型安全なデータアクセス、Conventional Commits

### Technology Stack

| Layer | Choice / Version | Role in Feature | Notes |
|-------|------------------|-----------------|-------|
| Frontend | React 19.2.0, TypeScript 5.9.3 | プロジェクト一覧・詳細画面、フォームコンポーネント | 既存スタック |
| Routing | React Router v7.9.6 | `/projects`ルーティング | 既存スタック |
| Backend | Express 5.2.0, TypeScript 5.9.3 | RESTful API提供 | 既存スタック |
| ORM | Prisma 7.0.0 | Project/ProjectStatusHistoryモデル管理 | 既存スタック |
| Database | PostgreSQL 15 | プロジェクトデータ永続化 | 既存スタック |
| Cache | Redis 7, ioredis 5.3.2 | 権限キャッシュ | 既存スタック |
| Validation | Zod 4.1.12 | リクエストバリデーション | 既存スタック |

## System Flows

### プロジェクト作成フロー（一意性チェック追加）

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as Backend API
    participant PS as ProjectService
    participant AL as AuditLogService
    participant DB as PostgreSQL

    U->>FE: 新規作成ボタンクリック
    FE->>FE: フォーム表示
    U->>FE: フォーム入力・送信
    FE->>FE: クライアントバリデーション
    FE->>API: POST /api/projects
    API->>API: JWT認証・権限チェック
    API->>PS: createProject(data)
    PS->>PS: サーバーバリデーション
    PS->>DB: SELECT (name重複チェック)
    alt プロジェクト名重複
        PS-->>API: DuplicateProjectNameError
        API-->>FE: 409 Conflict
        FE->>FE: エラー表示
    else プロジェクト名ユニーク
        PS->>DB: INSERT Project
        PS->>DB: INSERT ProjectStatusHistory
        PS->>AL: 監査ログ記録
        PS-->>API: Project
        API-->>FE: 201 Created
        FE->>FE: 詳細画面に遷移
    end
```

### ステータス遷移フロー

```mermaid
stateDiagram-v2
    [*] --> 準備中: 新規作成

    %% Forward transitions (順方向遷移)
    準備中 --> 調査中: forward
    調査中 --> 見積中: forward
    見積中 --> 決裁待ち: forward
    決裁待ち --> 契約中: forward
    契約中 --> 工事中: forward
    工事中 --> 引渡中: forward
    引渡中 --> 請求中: forward
    請求中 --> 入金待ち: forward
    入金待ち --> 完了: forward

    %% Backward transitions (差し戻し遷移)
    調査中 --> 準備中: backward
    見積中 --> 調査中: backward
    決裁待ち --> 見積中: backward
    契約中 --> 決裁待ち: backward
    工事中 --> 契約中: backward
    引渡中 --> 工事中: backward
    請求中 --> 引渡中: backward
    入金待ち --> 請求中: backward

    %% Terminate transitions (終端遷移)
    準備中 --> 中止: terminate
    調査中 --> 中止: terminate
    見積中 --> 中止: terminate
    決裁待ち --> 失注: terminate
    契約中 --> 失注: terminate

    完了 --> [*]
    中止 --> [*]
    失注 --> [*]
```

**Key Decisions**:
- ステータス遷移は4種類: initial（初期）、forward（順方向）、backward（差し戻し）、terminate（終端）
- プロジェクト作成時はtransitionType='initial'、fromStatus=nullの履歴を記録
- 差し戻し遷移（backward）は1つ前のステータスへのみ許可、理由入力を必須とする
- 「完了」「中止」「失注」は終端ステータス（いずれの遷移も禁止）
- すべてのステータス変更は履歴として記録（遷移種別と差し戻し理由を含む）

### ステータス遷移UIフロー

```mermaid
sequenceDiagram
    participant U as User
    participant UI as StatusTransitionUI
    participant API as Backend API
    participant PSS as ProjectStatusService
    participant DB as PostgreSQL

    U->>UI: ステータス変更ボタンクリック
    UI->>UI: 遷移可能ステータス表示

    U->>UI: 新ステータス選択

    alt backward transition
        UI->>UI: 差し戻し理由入力ダイアログ表示
        U->>UI: 理由入力・確認
    end

    UI->>API: PATCH /api/projects/:id/status
    API->>PSS: transitionStatus(id, status, reason)
    PSS->>PSS: 遷移ルール検証
    PSS->>DB: UPDATE Project.status
    PSS->>DB: INSERT ProjectStatusHistory
    PSS-->>API: ProjectInfo
    API-->>UI: 200 OK
    UI->>UI: ステータス更新・履歴反映
```

## Requirements Traceability

| Requirement | Summary | Components | Interfaces | Flows |
|-------------|---------|------------|------------|-------|
| 1.1-1.14 | プロジェクト作成 | ProjectForm, ProjectService | POST /api/projects | プロジェクト作成フロー |
| 1.15, 1.16 | **プロジェクト名一意性チェック（作成時）** | ProjectService | POST /api/projects | プロジェクト作成フロー |
| 2.1-2.6 | プロジェクト一覧表示（**ID列削除、営業担当者・工事担当者列追加**） | ProjectListPage, ProjectListTable, ProjectService | GET /api/projects | - |
| 3.1-3.5 | ページネーション | ProjectListPage, ProjectService | GET /api/projects?page,limit | - |
| 4.1a, 4.1b | 検索（**プロジェクト名・顧客名・営業担当者・工事担当者**） | ProjectListPage, ProjectService | GET /api/projects?search | - |
| 5.1-5.6 | フィルタリング | ProjectListPage, ProjectService | GET /api/projects?status,from,to | - |
| 6.1-6.5 | ソート（**営業担当者・工事担当者追加**） | ProjectListPage, ProjectService | GET /api/projects?sort,order | - |
| 7.1-7.6 | 詳細表示 | ProjectDetailPage, ProjectService | GET /api/projects/:id | - |
| 8.1-8.6 | 編集 | ProjectForm, ProjectService | PUT /api/projects/:id | - |
| 8.7, 8.8 | **プロジェクト名一意性チェック（更新時）** | ProjectService | PUT /api/projects/:id | - |
| 9.1-9.7 | 削除 | ProjectDetailPage, ProjectService | DELETE /api/projects/:id | - |
| 10.1-10.16 | ステータス管理 | StatusTransitionUI, ProjectStatusService | PATCH /api/projects/:id/status | ステータス遷移フロー |
| 11.1-11.6 | 関連データ参照 | ProjectDetailPage, ProjectService, FeatureFlags | GET /api/projects/:id | - |
| 12.1-12.6 | アクセス制御 | authorize middleware, RBACService | - | - |
| 13.1-13.11 | バリデーション | ProjectSchema, ProjectService | - | - |
| 14.1-14.7 | API | ProjectRoutes | RESTful API全般 | - |
| 15.1-15.5 | レスポンシブ | 全UIコンポーネント | - | - |
| 16.1-16.13 | 取引先オートコンプリート（**ひらがな・カタカナ両対応（差分8）、ラベル「顧客名」**） | TradingPartnerSelect, kana-converter | GET /api/trading-partners | - |
| 17.1-17.12 | 担当者選択 | UserSelect | GET /api/users/assignable | - |
| 18.1-18.6 | エラー回復 | ErrorBoundary, ToastNotification | - | - |
| 19.1-19.5 | パフォーマンス | 全コンポーネント | - | - |
| 20.1-20.6 | アクセシビリティ | 全UIコンポーネント | - | - |
| 21.1-21.13 | ナビゲーション | AppHeader, Dashboard | - | - |
| 21.14-21.18 | パンくずナビゲーション | Breadcrumb, ProjectListPage, ProjectDetailPage, ProjectCreatePage, ProjectEditPage | - | - |
| 22.1-22.11 | 取引先連携（**ひらがな・カタカナ両対応、ラベル「顧客名」**） | ProjectForm, TradingPartnerSelect, ProjectDetailPage, ProjectService | GET /api/trading-partners, GET /api/projects | - |

## Components and Interfaces

### Component Summary

| Component | Domain/Layer | Intent | Req Coverage | Key Dependencies (P0/P1) | Contracts |
|-----------|--------------|--------|--------------|--------------------------|-----------|
| ProjectListPage | UI/Page | プロジェクト一覧表示・検索・フィルタ・ソート・パンくず | 2, 3, 4, 5, 6, 21.14 | ProjectService (P0), useAuth (P0), Breadcrumb (P1) | State |
| ProjectListTable | UI/Component | **一覧テーブル（ID列削除、営業担当者・工事担当者列追加）** | 2.2 | ProjectListPage (P0) | - |
| ProjectDetailPage | UI/Page | プロジェクト詳細表示・編集・削除・パンくず | 7, 8, 9, 10, 11, 21.15, 21.17, 22 | ProjectService (P0), ProjectStatusService (P1), Breadcrumb (P1) | State |
| ProjectCreatePage | UI/Page | プロジェクト新規作成画面・パンくず | 1, 21.16 | ProjectForm (P0), Breadcrumb (P1) | State |
| ProjectForm | UI/Component | プロジェクト作成・編集フォーム | 1, 8, 13, 16, 17, 22 | TradingPartnerSelect (P1), UserSelect (P1) | Service |
| TradingPartnerSelect | UI/Component | 取引先選択（**ひらがな・カタカナ両対応、ラベル「顧客名」**） | 16, 22 | TradingPartnerAPI (P1), kana-converter (P1) | API |
| kana-converter | Frontend/Utility | ひらがな・カタカナ変換ユーティリティ（**差分8で追加**） | 16.3 | - | - |
| UserSelect | UI/Component | 担当者ドロップダウン選択 | 17 | UserAPI (P1) | API |
| StatusTransitionUI | UI/Component | ステータス遷移・差し戻しUI | 10 | ProjectStatusService (P1) | State, Service |
| Breadcrumb | UI/Component | パンくずナビゲーション（既存再利用） | 21.14-21.18 | react-router-dom (P0) | - |
| ProjectService | Backend/Service | プロジェクトCRUD + **一意性チェック + かな検索両対応** | 1-9, 11, 13, 14, 16.3, 22.5 | Prisma (P0), AuditLogService (P1), kana-converter (P1) | Service, API |
| ProjectStatusService | Backend/Service | ステータス遷移ロジック | 10 | Prisma (P0), AuditLogService (P1) | Service |
| ProjectRoutes | Backend/Route | RESTful APIエンドポイント | 14 | ProjectService (P0), authorize (P0) | API |

---

## 要件変更対応の差分設計

以下のセクションでは、2025-12-13の要件更新に対応するための差分設計を記述します。

### 差分1: 一覧表示の列構成変更（2.2）

**変更内容**:
- ID列を削除
- 営業担当者列を追加
- 工事担当者列を追加

**影響ファイル**:
- `frontend/src/components/projects/ProjectListTable.tsx`

**現在の列構成**:
```typescript
const COLUMNS = [
  { key: 'id', label: 'ID', sortable: true },
  { key: 'name', label: 'プロジェクト名', sortable: true },
  { key: 'customerName', label: '顧客名', sortable: true },
  { key: 'status', label: 'ステータス', sortable: true },
  { key: 'createdAt', label: '作成日', sortable: true },
  { key: 'updatedAt', label: '更新日', sortable: true },
];
```

**変更後の列構成**:
```typescript
const COLUMNS = [
  { key: 'name', label: 'プロジェクト名', sortable: true },
  { key: 'customerName', label: '顧客名', sortable: true },
  { key: 'salesPersonName', label: '営業担当者', sortable: true },
  { key: 'constructionPersonName', label: '工事担当者', sortable: true },
  { key: 'status', label: 'ステータス', sortable: true },
  { key: 'createdAt', label: '作成日', sortable: true },
  { key: 'updatedAt', label: '更新日', sortable: true },
];
```

**SortFieldの変更**:
```typescript
// 変更前
export type SortField = 'id' | 'name' | 'customerName' | 'status' | 'createdAt' | 'updatedAt';

// 変更後
export type SortField = 'name' | 'customerName' | 'salesPersonName' | 'constructionPersonName' | 'status' | 'createdAt' | 'updatedAt';
```

---

### 差分2: 検索対象の拡張（4.1a, 4.1b）

**変更内容**:
- 検索対象に営業担当者の表示名を追加
- 検索対象に工事担当者の表示名を追加

**影響ファイル**:
- `backend/src/services/project.service.ts`
- `backend/src/schemas/project.schema.ts`

**現在の検索ロジック**:
```typescript
// プロジェクト名・顧客名（取引先名）の部分一致
where: {
  OR: [
    { name: { contains: search, mode: 'insensitive' } },
    { tradingPartner: { name: { contains: search, mode: 'insensitive' } } },
  ]
}
```

**変更後の検索ロジック**:
```typescript
// プロジェクト名・顧客名・営業担当者・工事担当者の部分一致
where: {
  OR: [
    { name: { contains: search, mode: 'insensitive' } },
    { tradingPartner: { name: { contains: search, mode: 'insensitive' } } },
    { salesPerson: { displayName: { contains: search, mode: 'insensitive' } } },
    { constructionPerson: { displayName: { contains: search, mode: 'insensitive' } } },
  ]
}
```

---

### 差分3: フリガナ検索のひらがな・カタカナ両対応（16.3, 22.5）

**変更内容**:
- 取引先検索時、ひらがな入力をカタカナに変換して検索
- カタカナ入力をひらがなに変換して検索

**影響ファイル**:
- `backend/src/services/trading-partner.service.ts`（既存実装済み）
- `frontend/src/components/projects/TradingPartnerSelect.tsx`

**バックエンドのひらがな・カタカナ変換ロジック**（既存実装を確認）:
```typescript
/**
 * ひらがなをカタカナに変換
 */
function hiraganaToKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) + 0x60)
  );
}

/**
 * カタカナをひらがなに変換
 */
function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) - 0x60)
  );
}

// 検索時の処理
const searchKatakana = hiraganaToKatakana(search);
const searchHiragana = katakanaToHiragana(search);

where: {
  OR: [
    { name: { contains: search, mode: 'insensitive' } },
    { nameKana: { contains: searchKatakana, mode: 'insensitive' } },
    { nameKana: { contains: searchHiragana, mode: 'insensitive' } },
  ]
}
```

---

### 差分4: プロジェクト名一意性チェック（1.15, 1.16, 8.7, 8.8）

**変更内容**:
- プロジェクト作成時にプロジェクト名の重複チェックを実行
- プロジェクト更新時にプロジェクト名の重複チェックを実行（自身を除外）

**影響ファイル**:
- `backend/src/services/project.service.ts`
- `backend/src/errors/projectError.ts`
- `backend/src/routes/projects.routes.ts`

**新規エラークラス**:
```typescript
// backend/src/errors/projectError.ts に追加

/**
 * プロジェクト名重複エラー
 * Requirements: 1.15, 8.7
 */
export class DuplicateProjectNameError extends ApiError {
  public readonly projectName: string;
  public readonly problemType = PROBLEM_TYPES.PROJECT_NAME_DUPLICATE;
  public readonly code = ERROR_CODES.PROJECT_NAME_DUPLICATE;

  constructor(projectName: string) {
    super(`このプロジェクト名は既に使用されています: ${projectName}`, 409);
    this.projectName = projectName;
  }
}
```

**PROBLEM_TYPES/ERROR_CODESへの追加**:
```typescript
// backend/src/types/problem-details.ts に追加
export const PROBLEM_TYPES = {
  // ... 既存のエントリ
  PROJECT_NAME_DUPLICATE: 'https://architrack.example.com/problems/project-name-duplicate',
};

export const ERROR_CODES = {
  // ... 既存のエントリ
  PROJECT_NAME_DUPLICATE: 'PROJECT_NAME_DUPLICATE',
};
```

**ProjectServiceへの追加**:
```typescript
// backend/src/services/project.service.ts

/**
 * プロジェクト名の重複チェック
 * @param name プロジェクト名
 * @param excludeId 除外するプロジェクトID（更新時に自身を除外）
 * @throws DuplicateProjectNameError 重複する場合
 */
private async checkProjectNameUniqueness(
  tx: PrismaTransactionClient,
  name: string,
  excludeId?: string
): Promise<void> {
  const existingProject = await tx.project.findFirst({
    where: {
      name: name,
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });

  if (existingProject) {
    throw new DuplicateProjectNameError(name);
  }
}

// createProject メソッド内で呼び出し
async createProject(input: CreateProjectInput, actorId: string): Promise<ProjectInfo> {
  return await this.prisma.$transaction(async (tx) => {
    // 1. プロジェクト名の重複チェック
    await this.checkProjectNameUniqueness(tx, input.name);

    // 2. 担当者IDのバリデーション
    await this.validateAssignableUser(tx, input.salesPersonId, 'salesPersonId');
    // ... 既存の処理
  });
}

// updateProject メソッド内で呼び出し
async updateProject(
  id: string,
  input: UpdateProjectInput,
  actorId: string,
  expectedUpdatedAt: Date
): Promise<ProjectInfo> {
  return await this.prisma.$transaction(async (tx) => {
    // 1. プロジェクト存在確認
    const project = await tx.project.findUnique({ where: { id } });
    if (!project || project.deletedAt) {
      throw new ProjectNotFoundError(id);
    }

    // 2. プロジェクト名の重複チェック（名前が変更される場合のみ）
    if (input.name && input.name !== project.name) {
      await this.checkProjectNameUniqueness(tx, input.name, id);
    }

    // ... 既存の処理
  });
}
```

**ルートハンドラでのエラーレスポンス**:
```typescript
// backend/src/routes/projects.routes.ts

import { DuplicateProjectNameError } from '../errors/projectError.js';

// POST /api/projects ハンドラ内
if (error instanceof DuplicateProjectNameError) {
  res.status(409).json({
    type: error.problemType,
    title: 'Duplicate Project Name',
    status: 409,
    detail: error.message,
    code: error.code,
    projectName: error.projectName,
  });
  return;
}

// PUT /api/projects/:id ハンドラ内（同様）
```

---

### 差分5: ソートフィールドの拡張（6.5）

**変更内容**:
- ソート可能フィールドに営業担当者・工事担当者を追加

**影響ファイル**:
- `backend/src/schemas/project.schema.ts`
- `backend/src/services/project.service.ts`

**現在のソートフィールド**:
```typescript
export const SORTABLE_FIELDS = [
  'id',
  'name',
  'tradingPartnerId',
  'status',
  'createdAt',
  'updatedAt',
] as const;
```

**変更後のソートフィールド**:
```typescript
export const SORTABLE_FIELDS = [
  'name',
  'customerName',       // 顧客名（tradingPartner.name）
  'salesPersonName',    // 営業担当者（salesPerson.displayName）
  'constructionPersonName', // 工事担当者（constructionPerson.displayName）
  'status',
  'createdAt',
  'updatedAt',
] as const;
```

**ソートロジックの変更**:
```typescript
// backend/src/services/project.service.ts

private buildOrderBy(sort: SortInput): Prisma.ProjectOrderByWithRelationInput {
  const { field, order } = sort;

  switch (field) {
    case 'customerName':
      return { tradingPartner: { name: order } };
    case 'salesPersonName':
      return { salesPerson: { displayName: order } };
    case 'constructionPersonName':
      return { constructionPerson: { displayName: order } };
    default:
      return { [field]: order };
  }
}
```

---

### 差分6: フィールドラベル変更「取引先」→「顧客名」（2025-12-15 gap analysis結果）

**ステータス**: ✅ **実装済み**

**変更内容**:
- UIラベルを「取引先」から「顧客名」に統一
- 以下のファイルで既に変更済み

**実装済みファイル**:
1. `frontend/src/components/projects/TradingPartnerSelect.tsx` (362行目): `<label>顧客名</label>`
2. `frontend/src/pages/ProjectDetailPage.tsx` (520行目): `<div style={styles.fieldLabel}>顧客名</div>`
3. `frontend/src/components/projects/TradingPartnerSelect.tsx`: `aria-label="顧客名"`

**注記**: `aria-label="取引先候補"`など候補リストに関するラベルはそのまま維持（内部的な取引先マスタを指すため）

---

### 差分7: プロジェクト検索でのひらがな・カタカナ両対応（2025-12-15 gap analysis結果）

**ステータス**: ✅ **実装済み**

**変更内容**:
- プロジェクト検索時、取引先名（フリガナ）検索でひらがな・カタカナを区別しない
- 既存の`kana-converter.ts`を使用
- 取引先管理機能（`trading-partner.service.ts`）と同じパターンを適用

**実装済みファイル**:
- `backend/src/services/project.service.ts`（300-324行目）

**実装済みの検索ロジック**:
```typescript
import { toKatakana, toHiragana } from '../utils/kana-converter.js';

// 検索キーワード（プロジェクト名・取引先名・営業担当者・工事担当者の部分一致）
// Requirements: 16.3, 22.5 - ひらがな・カタカナ両対応検索
if (filter.search) {
  const searchKatakana = toKatakana(filter.search);
  const searchHiragana = toHiragana(filter.search);

  where.OR = [
    { name: { contains: filter.search, mode: 'insensitive' as const } },
    { tradingPartner: { name: { contains: searchKatakana, mode: 'insensitive' as const } } },
    { tradingPartner: { name: { contains: searchHiragana, mode: 'insensitive' as const } } },
    { tradingPartner: { nameKana: { contains: searchKatakana, mode: 'insensitive' as const } } },
    { salesPerson: { displayName: { contains: filter.search, mode: 'insensitive' as const } } },
    { constructionPerson: { displayName: { contains: filter.search, mode: 'insensitive' as const } } },
  ];
}
```

---

### 差分8: TradingPartnerSelectのクライアントサイドフィルタリングでひらがな・カタカナ両対応（2025-12-15 gap analysis結果）

**ステータス**: ❌ **未実装・要対応**

**変更内容**:
- `TradingPartnerSelect`コンポーネントのクライアントサイドフィルタリング（`matchesSearchQuery`関数）にかな変換を追加
- フロントエンドに`kana-converter.ts`を新規作成（バックエンドから移植）

**影響ファイル**:
1. `frontend/src/utils/kana-converter.ts`（新規作成）
2. `frontend/src/components/projects/TradingPartnerSelect.tsx`（96-106行目を修正）

**新規ファイル: `frontend/src/utils/kana-converter.ts`**:
```typescript
/**
 * かな変換ユーティリティ（フロントエンド版）
 *
 * ひらがな⇔カタカナの相互変換を提供し、フリガナ検索でひらがな・カタカナ両方の入力を許容する。
 *
 * @module kana-converter
 * @requirement 16.3 フリガナ検索でひらがな・カタカナ両対応
 */

// Unicode code point constants
const HIRAGANA_START = 0x3041;
const HIRAGANA_END = 0x3096;
const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const KANA_OFFSET = 0x60;

/**
 * ひらがなをカタカナに変換する
 */
export function toKatakana(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const codePoint = str.charCodeAt(i);
    if (codePoint >= HIRAGANA_START && codePoint <= HIRAGANA_END) {
      result += String.fromCharCode(codePoint + KANA_OFFSET);
    } else {
      result += str[i];
    }
  }
  return result;
}

/**
 * カタカナをひらがなに変換する
 */
export function toHiragana(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const codePoint = str.charCodeAt(i);
    if (codePoint >= KATAKANA_START && codePoint <= KATAKANA_END) {
      result += String.fromCharCode(codePoint - KANA_OFFSET);
    } else {
      result += str[i];
    }
  }
  return result;
}
```

**TradingPartnerSelect.tsx の変更**:

現在の`matchesSearchQuery`関数（96-106行目）:
```typescript
function matchesSearchQuery(partner: TradingPartnerInfo, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return (
    partner.name.toLowerCase().includes(lowerQuery) ||
    partner.nameKana.toLowerCase().includes(lowerQuery) ||
    (partner.branchName?.toLowerCase().includes(lowerQuery) ?? false) ||
    (partner.branchNameKana?.toLowerCase().includes(lowerQuery) ?? false) ||
    (partner.representativeName?.toLowerCase().includes(lowerQuery) ?? false) ||
    (partner.representativeNameKana?.toLowerCase().includes(lowerQuery) ?? false)
  );
}
```

**変更後**:
```typescript
import { toKatakana, toHiragana } from '../../utils/kana-converter';

/**
 * 検索クエリに一致するかどうか判定
 * 名前、フリガナ、部課名、代表者名で部分一致
 * Requirements: 16.3 - ひらがな・カタカナ両対応検索
 */
function matchesSearchQuery(partner: TradingPartnerInfo, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  // ひらがな・カタカナ両対応: 入力をカタカナとひらがなの両方に変換して検索
  const queryKatakana = toKatakana(query).toLowerCase();
  const queryHiragana = toHiragana(query).toLowerCase();

  // 名前（元のクエリ、カタカナ変換後、ひらがな変換後で検索）
  const nameMatches =
    partner.name.toLowerCase().includes(lowerQuery) ||
    partner.name.toLowerCase().includes(queryKatakana) ||
    partner.name.toLowerCase().includes(queryHiragana);

  // フリガナ（カタカナで登録されているため、カタカナ変換後で検索）
  const nameKanaMatches = partner.nameKana.toLowerCase().includes(queryKatakana);

  // 部課名
  const branchMatches =
    partner.branchName?.toLowerCase().includes(lowerQuery) ?? false;
  const branchKanaMatches =
    partner.branchNameKana?.toLowerCase().includes(queryKatakana) ?? false;

  // 代表者名
  const repMatches =
    partner.representativeName?.toLowerCase().includes(lowerQuery) ?? false;
  const repKanaMatches =
    partner.representativeNameKana?.toLowerCase().includes(queryKatakana) ?? false;

  return (
    nameMatches ||
    nameKanaMatches ||
    branchMatches ||
    branchKanaMatches ||
    repMatches ||
    repKanaMatches
  );
}
```

**設計根拠**:
- バックエンドの取引先検索API（`trading-partner.service.ts`）は既にひらがな・カタカナ両対応
- ただし、`TradingPartnerSelect`コンポーネントはクライアントサイドでフィルタリングを実行
- バックエンドから取得した候補一覧をクライアントサイドでフィルタリングする際にも、同じかな変換ロジックが必要
- バックエンドの`kana-converter.ts`と同一ロジックをフロントエンドに移植

---

## Backend / Services

### ProjectService

| Field | Detail |
|-------|--------|
| Intent | プロジェクトのCRUD操作とビジネスロジック + **プロジェクト名一意性チェック + かな検索両対応** |
| Requirements | 1.1-1.16, 2.1-2.6, 3.1-3.5, 4.1a-4.5, 5.1-5.6, 6.1-6.5, 7.1-7.6, 8.1-8.8, 9.1-9.7, 11.1-11.6, 13.1-13.11, 16.3, 22.5 |
| Owner / Reviewers | Backend Team |

**Responsibilities & Constraints**
- プロジェクトの作成・取得・更新・削除のビジネスロジック
- **プロジェクト名の一意性チェック（作成時・更新時）**（1.15, 1.16, 8.7, 8.8）
- **検索時のひらがな・カタカナ両対応**（16.3, 22.5）- 取引先名/フリガナ検索でかな変換を適用
- 論理削除の実装（`deletedAt`フィールドによる管理）
- ページネーション、検索（**営業担当者・工事担当者含む、かな両対応**）、フィルタリング、ソートのサポート
- 楽観的排他制御（`updatedAt`フィールドによる競合検出）
- 関連データ（現場調査、見積書）の件数取得（機能フラグで制御）

**Dependencies**
- Inbound: ProjectRoutes — API呼び出し (P0)
- Outbound: Prisma — データアクセス (P0)
- Outbound: AuditLogService — 監査ログ記録 (P1)
- Outbound: ProjectStatusService — ステータス遷移 (P1)
- Outbound: kana-converter — ひらがな・カタカナ変換 (P1)

**Contracts**: Service [x] / API [ ] / Event [ ] / Batch [ ] / State [ ]

##### Service Interface

**エラーハンドリング**: 既存コードベースのパターンに準拠し、例外ベースのエラーハンドリングを採用します。エラーはカスタム例外クラスをスローし、ルートレイヤーでキャッチして適切なHTTPレスポンスに変換します。

```typescript
// カスタム例外クラス
class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = 'ProjectNotFoundError';
  }
}

class ProjectValidationError extends Error {
  constructor(public details: Record<string, string>) {
    super('Validation failed');
    this.name = 'ProjectValidationError';
  }
}

class ProjectConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectConflictError';
  }
}

// 新規追加（1.15, 8.7）
class DuplicateProjectNameError extends Error {
  constructor(public projectName: string) {
    super(`このプロジェクト名は既に使用されています: ${projectName}`);
    this.name = 'DuplicateProjectNameError';
  }
}

interface IProjectService {
  /**
   * プロジェクト作成
   * @throws ProjectValidationError バリデーションエラー
   * @throws DuplicateProjectNameError プロジェクト名重複（1.15）
   */
  createProject(
    input: CreateProjectInput,
    actorId: string
  ): Promise<ProjectInfo>;

  /**
   * プロジェクト一覧取得
   * 検索対象: プロジェクト名、顧客名、営業担当者、工事担当者（4.1a, 4.1b）
   */
  getProjects(
    filter: ProjectFilter,
    pagination: PaginationInput,
    sort: SortInput
  ): Promise<PaginatedProjects>;

  /**
   * プロジェクト詳細取得
   * @throws ProjectNotFoundError プロジェクトが存在しない
   */
  getProject(id: string): Promise<ProjectDetail>;

  /**
   * プロジェクト更新
   * @throws ProjectNotFoundError プロジェクトが存在しない
   * @throws ProjectValidationError バリデーションエラー
   * @throws ProjectConflictError 楽観的排他制御エラー
   * @throws DuplicateProjectNameError プロジェクト名重複（8.7）
   */
  updateProject(
    id: string,
    input: UpdateProjectInput,
    actorId: string,
    expectedUpdatedAt: Date
  ): Promise<ProjectInfo>;

  /**
   * プロジェクト削除（論理削除）
   * @throws ProjectNotFoundError プロジェクトが存在しない
   */
  deleteProject(
    id: string,
    actorId: string
  ): Promise<void>;

  /**
   * 関連データ件数取得
   * @throws ProjectNotFoundError プロジェクトが存在しない
   */
  getRelatedCounts(id: string): Promise<RelatedCounts>;
}

interface CreateProjectInput {
  name: string;
  tradingPartnerId?: string | null;  // 取引先ID（外部キー）
  salesPersonId: string;
  constructionPersonId?: string;
  siteAddress?: string;
  description?: string;
}

interface UpdateProjectInput {
  name?: string;
  tradingPartnerId?: string | null;  // 取引先ID（外部キー）
  salesPersonId?: string;
  constructionPersonId?: string;
  siteAddress?: string;
  description?: string;
}

interface ProjectFilter {
  search?: string;           // プロジェクト名・取引先名・営業担当者・工事担当者の部分一致（4.1a, 4.1b）
  status?: ProjectStatus[];  // ステータスフィルタ
  createdFrom?: Date;        // 作成日開始
  createdTo?: Date;          // 作成日終了
  tradingPartnerId?: string; // 取引先ID（外部キー）
}

interface PaginationInput {
  page: number;    // 1-indexed
  limit: number;   // デフォルト20
}

interface SortInput {
  field: 'name' | 'customerName' | 'salesPersonName' | 'constructionPersonName' | 'status' | 'createdAt' | 'updatedAt';
  order: 'asc' | 'desc';
}
```

- Preconditions: 有効なユーザーIDが提供されること
- Postconditions: 成功時はプロジェクトデータを返却、失敗時は例外をスロー
- Invariants: 論理削除されたプロジェクトは一覧に表示されない。プロジェクト名は一意（deletedAt=nullの範囲内）

**Implementation Notes**
- Integration: 既存のPrisma Clientパターンを踏襲、N+1問題回避のためincludeを使用
- Validation: Zodスキーマによるバリデーション、`validate.middleware.ts`と連携
- **プロジェクト名一意性**: deletedAt=nullのプロジェクトに対して重複チェックを実行
- Risks: 楽観的排他制御の競合エラー発生時のUX検討が必要

---

### ProjectStatusService

| Field | Detail |
|-------|--------|
| Intent | プロジェクトステータスの遷移ロジックと履歴管理を担当 |
| Requirements | 10.1-10.16 |
| Owner / Reviewers | Backend Team |

**Responsibilities & Constraints**
- ステータス遷移の妥当性検証（順方向・差し戻し・終端遷移の許可判定）
- 差し戻し遷移時の理由入力必須チェック
- ステータス変更履歴の記録（遷移種別と差し戻し理由を含む）
- ステータス遷移ルールの一元管理

**Dependencies**
- Inbound: ProjectService, ProjectRoutes — ステータス変更呼び出し (P0)
- Outbound: Prisma — データアクセス (P0)
- Outbound: AuditLogService — 監査ログ記録 (P1)

**Contracts**: Service [x] / API [ ] / Event [ ] / Batch [ ] / State [ ]

##### Service Interface

```typescript
/**
 * プロジェクトステータス
 */
type ProjectStatus =
  | 'PREPARING'    // 準備中
  | 'SURVEYING'    // 調査中
  | 'ESTIMATING'   // 見積中
  | 'APPROVING'    // 決裁待ち
  | 'CONTRACTING'  // 契約中
  | 'CONSTRUCTING' // 工事中
  | 'DELIVERING'   // 引渡中
  | 'BILLING'      // 請求中
  | 'AWAITING'     // 入金待ち
  | 'COMPLETED'    // 完了
  | 'CANCELLED'    // 中止
  | 'LOST';        // 失注

/**
 * ステータス遷移種別
 */
type TransitionType =
  | 'initial'    // 初期遷移（プロジェクト作成時、fromStatusなし）
  | 'forward'    // 順方向遷移（ワークフロー進行）
  | 'backward'   // 差し戻し遷移（1つ前のステータスへ戻る）
  | 'terminate'; // 終端遷移（完了・中止・失注）

// ステータス遷移用カスタム例外クラス
class InvalidStatusTransitionError extends Error {
  constructor(
    public fromStatus: ProjectStatus,
    public toStatus: ProjectStatus,
    public allowed: AllowedTransition[]
  ) {
    super(`Invalid transition from ${fromStatus} to ${toStatus}`);
    this.name = 'InvalidStatusTransitionError';
  }
}

class ReasonRequiredError extends Error {
  constructor() {
    super('Reason is required for backward transition');
    this.name = 'ReasonRequiredError';
  }
}

interface IProjectStatusService {
  /**
   * ステータス遷移
   * @param projectId プロジェクトID
   * @param newStatus 新ステータス
   * @param actorId 実行者ID
   * @param reason 差し戻し理由（backward遷移時は必須）
   * @throws ProjectNotFoundError プロジェクトが存在しない
   * @throws InvalidStatusTransitionError 無効なステータス遷移
   * @throws ReasonRequiredError 差し戻し理由が未入力
   */
  transitionStatus(
    projectId: string,
    newStatus: ProjectStatus,
    actorId: string,
    reason?: string
  ): Promise<ProjectInfo>;

  /**
   * 許可された遷移先を取得
   * @returns 遷移可能なステータスと遷移種別のマップ
   */
  getAllowedTransitions(currentStatus: ProjectStatus): AllowedTransition[];

  /**
   * ステータス変更履歴取得
   * @throws ProjectNotFoundError プロジェクトが存在しない
   */
  getStatusHistory(projectId: string): Promise<ProjectStatusHistory[]>;

  /**
   * 遷移種別を判定
   */
  getTransitionType(fromStatus: ProjectStatus, toStatus: ProjectStatus): TransitionType | null;
}

interface AllowedTransition {
  status: ProjectStatus;
  type: TransitionType;
  requiresReason: boolean;
}

interface ProjectStatusHistory {
  id: string;
  projectId: string;
  fromStatus: ProjectStatus | null;  // 初期遷移時はnull
  toStatus: ProjectStatus;
  transitionType: TransitionType;    // 初期遷移時は'initial'
  reason: string | null;
  changedBy: string;
  changedAt: Date;
}
```

- Preconditions: プロジェクトが存在し、現在のステータスからの遷移が許可されていること。差し戻し遷移時は理由が必須
- Postconditions: ステータスが更新され、履歴が記録される（遷移種別と差し戻し理由を含む）。失敗時は例外をスロー
- Invariants: 終端ステータス（完了、中止、失注）からの遷移は禁止

**Implementation Notes**
- Integration: ステータス遷移マップをconstで定義し、型安全性を確保
- Validation: 遷移前に許可チェックを実施、差し戻し時は理由の存在チェック
- Risks: 遷移ルールの変更時は既存データとの整合性確認が必要

---

### ProjectRoutes

| Field | Detail |
|-------|--------|
| Intent | プロジェクト関連のRESTful APIエンドポイントを提供 |
| Requirements | 14.1-14.7 |
| Owner / Reviewers | Backend Team |

**Responsibilities & Constraints**
- HTTPリクエストの受信とレスポンスの返却
- 認証・認可ミドルウェアの適用
- バリデーションミドルウェアの適用
- Swagger/OpenAPIドキュメントの生成

**Dependencies**
- Inbound: Express Router — HTTPリクエスト (P0)
- Outbound: ProjectService — ビジネスロジック (P0)
- Outbound: authenticate/authorize middleware — 認証・認可 (P0)
- Outbound: validate middleware — バリデーション (P0)

**Contracts**: Service [ ] / API [x] / Event [ ] / Batch [ ] / State [ ]

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| GET | /api/projects | ProjectListQuery | PaginatedProjects | 400, 401, 403 |
| GET | /api/projects/:id | - | ProjectDetail | 400, 401, 403, 404 |
| POST | /api/projects | CreateProjectRequest | ProjectInfo | 400, 401, 403, **409** |
| PUT | /api/projects/:id | UpdateProjectRequest | ProjectInfo | 400, 401, 403, 404, **409** |
| DELETE | /api/projects/:id | - | - | 400, 401, 403, 404 |
| PATCH | /api/projects/:id/status | StatusChangeRequest | ProjectInfo | 400, 401, 403, 404, 422 |
| GET | /api/projects/:id/status-history | - | StatusHistory[] | 400, 401, 403, 404 |
| GET | /api/users/assignable | - | AssignableUser[] | 400, 401, 403 |

**Request/Response Schemas**:

```typescript
// GET /api/projects クエリパラメータ
interface ProjectListQuery {
  page?: number;        // デフォルト: 1
  limit?: number;       // デフォルト: 20, 最大: 100
  search?: string;      // 最小2文字（プロジェクト名・顧客名・営業担当者・工事担当者）
  status?: string;      // カンマ区切り複数指定可
  createdFrom?: string; // ISO8601形式
  createdTo?: string;   // ISO8601形式
  sort?: string;        // name|customerName|salesPersonName|constructionPersonName|status|createdAt|updatedAt
  order?: string;       // asc|desc
}

// POST /api/projects リクエストボディ
interface CreateProjectRequest {
  name: string;                    // 1-255文字（一意）
  tradingPartnerId?: string | null; // UUID（任意、取引先外部キー）
  salesPersonId: string;           // UUID
  constructionPersonId?: string;   // UUID（任意）
  siteAddress?: string;            // 最大500文字
  description?: string;            // 最大5000文字
}

// PUT /api/projects/:id リクエストボディ
interface UpdateProjectRequest {
  name?: string;                   // 一意（自身を除く）
  tradingPartnerId?: string | null; // UUID（任意、取引先外部キー）
  salesPersonId?: string;
  constructionPersonId?: string;
  siteAddress?: string;
  description?: string;
  expectedUpdatedAt: string;       // 楽観的排他制御用
}

// PATCH /api/projects/:id/status リクエストボディ
interface StatusChangeRequest {
  status: ProjectStatus;
  reason?: string;                 // backward遷移時は必須
}

// レスポンス: プロジェクト情報
interface ProjectInfo {
  id: string;
  name: string;
  tradingPartnerId: string | null;      // 取引先ID（外部キー）
  tradingPartner: TradingPartnerSummary | null;  // 取引先情報
  salesPerson: UserSummary;
  constructionPerson?: UserSummary;
  siteAddress?: string;
  description?: string;
  status: ProjectStatus;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
}

// 取引先サマリー情報
interface TradingPartnerSummary {
  id: string;
  name: string;
  nameKana: string;
}

// レスポンス: ページネーション付き一覧
interface PaginatedProjects {
  data: ProjectInfo[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// レスポンス: ステータス変更履歴
interface StatusHistoryResponse {
  id: string;
  fromStatus: ProjectStatus;
  fromStatusLabel: string;
  toStatus: ProjectStatus;
  toStatusLabel: string;
  transitionType: TransitionType;
  transitionTypeLabel: string;
  reason: string | null;
  changedBy: UserSummary;
  changedAt: string;
}

// レスポンス: 担当者候補
interface AssignableUser {
  id: string;
  displayName: string;
}

// エラーレスポンス: プロジェクト名重複（409）
interface DuplicateProjectNameErrorResponse {
  type: string;       // "https://architrack.example.com/problems/project-name-duplicate"
  title: string;      // "Duplicate Project Name"
  status: 409;
  detail: string;     // "このプロジェクト名は既に使用されています: {projectName}"
  code: string;       // "PROJECT_NAME_DUPLICATE"
  projectName: string;
}
```

**Implementation Notes**
- Integration: 既存の`roles.routes.ts`パターンを踏襲、Swagger JSDocコメント付き
- Validation: Zodスキーマを使用、`validate.middleware.ts`と連携
- **409エラー**: プロジェクト名重複時はDuplicateProjectNameErrorResponse形式で返却
- Risks: レート制限の設定が必要（既存の`express-rate-limit`を使用）

---

## Frontend / Pages

### ProjectListPage

| Field | Detail |
|-------|--------|
| Intent | プロジェクト一覧の表示、検索、フィルタリング、ソート機能を提供 |
| Requirements | 2.1-2.6, 3.1-3.5, 4.1a-4.5, 5.1-5.6, 6.1-6.5, 15.1-15.5 |
| Owner / Reviewers | Frontend Team |

**Responsibilities & Constraints**
- プロジェクト一覧のテーブル/カード表示（レスポンシブ対応）
- **ID列なし、営業担当者・工事担当者列あり**（2.2）
- ページネーション、検索、フィルタリング、ソートのUI提供
- URLパラメータによる状態管理
- ローディング・エラー・空状態の表示

**Dependencies**
- Inbound: Router — ページ遷移 (P0)
- Outbound: ProjectService API — データ取得 (P0)
- Outbound: ToastNotification — エラー通知 (P1)

**Contracts**: Service [ ] / API [ ] / Event [ ] / Batch [ ] / State [x]

##### State Management

```typescript
interface ProjectListState {
  projects: ProjectInfo[];
  pagination: PaginationInfo;
  isLoading: boolean;
  error: string | null;
  filters: {
    search: string;
    status: ProjectStatus[];
    createdFrom: Date | null;
    createdTo: Date | null;
  };
  sort: {
    field: SortField;  // 'name' | 'customerName' | 'salesPersonName' | 'constructionPersonName' | 'status' | 'createdAt' | 'updatedAt'
    order: 'asc' | 'desc';
  };
}
```

- State model: React useState + useSearchParams（URLパラメータ同期）
- Persistence: URLパラメータによる状態永続化
- Concurrency: デバウンスによる連続リクエスト抑制

**Implementation Notes**
- Integration: 768px未満でカード表示に切り替え（`useMediaQuery`フック使用）
- Validation: 検索キーワード2文字以上のバリデーション
- Risks: 大量データ時のパフォーマンス（仮想スクロールの検討が必要な場合あり）
- Breadcrumb: 既存の`Breadcrumb`コンポーネント（`frontend/src/components/common/Breadcrumb.tsx`）を再利用し、「ダッシュボード > プロジェクト」のパンくずを表示（21.14）

---

### ProjectDetailPage

| Field | Detail |
|-------|--------|
| Intent | プロジェクト詳細情報の表示、編集、削除、ステータス変更機能を提供 |
| Requirements | 7.1-7.6, 8.1-8.8, 9.1-9.7, 10.1-10.16, 11.1-11.6 |
| Owner / Reviewers | Frontend Team |

**Responsibilities & Constraints**
- プロジェクト詳細情報の表示（読み取り専用）
- 編集ページへの遷移（編集ボタン押下で`/projects/:id/edit`へ遷移）
- 削除確認ダイアログ
- ステータス遷移UI（順方向・差し戻しの視覚的区別）
- 関連データ（現場調査・見積書）の件数表示とリンク（機能フラグで制御）

**Dependencies**
- Inbound: Router — ページ遷移 (P0)
- Outbound: ProjectService API — データ取得・削除 (P0)
- Outbound: ProjectStatusService API — ステータス遷移 (P1)
- Outbound: ToastNotification — 通知 (P1)

**Contracts**: Service [ ] / API [ ] / Event [ ] / Batch [ ] / State [x]

##### State Management

```typescript
interface ProjectDetailState {
  project: ProjectDetail | null;
  statusHistory: ProjectStatusHistory[];
  isLoading: boolean;
  isDeleting: boolean;
  error: string | null;
}
```

**Implementation Notes**
- Integration: 削除時の関連データ確認（警告ダイアログ表示）
- Risks: 楽観的排他制御失敗時のUX（ユーザーへの明確な説明が必要）
- Breadcrumb: 「ダッシュボード > プロジェクト > [プロジェクト名]」のパンくずを表示（21.15）
- 設計方針: 取引先管理機能と同様に、詳細ページは読み取り専用とし、編集は独立した`ProjectEditPage`（`/projects/:id/edit`）で行う

---

### ProjectEditPage

| Field | Detail |
|-------|--------|
| Intent | プロジェクト情報の編集機能を提供 |
| Requirements | 8.1-8.8, 21.12, 21.17, 21.21 |
| Owner / Reviewers | Frontend Team |

**Responsibilities & Constraints**
- 既存プロジェクトデータの編集フォーム表示
- クライアントサイドバリデーション
- 楽観的排他制御による競合検出
- **プロジェクト名重複エラーの表示**（8.7）
- 保存成功時の詳細ページへの遷移

**Dependencies**
- Inbound: Router — ページ遷移 (P0)
- Outbound: ProjectService API — データ取得・更新 (P0)
- Outbound: ProjectForm — フォームUI (P0)
- Outbound: ToastNotification — 通知 (P1)

**Contracts**: Service [ ] / API [ ] / Event [ ] / Batch [ ] / State [x]

##### State Management

```typescript
interface ProjectEditState {
  project: ProjectDetail | null;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  conflictError: ConflictError | null;
  duplicateNameError: string | null;  // プロジェクト名重複エラー
}
```

**Implementation Notes**
- Integration: 編集時の競合検出と再読み込み誘導
- Validation: ProjectFormコンポーネントでクライアントサイドバリデーション実行
- **409エラー処理**: プロジェクト名重複時は「このプロジェクト名は既に使用されています」を表示
- Risks: 楽観的排他制御失敗時のUX（ユーザーへの明確な説明が必要）
- Breadcrumb: 「ダッシュボード > プロジェクト > [プロジェクト名] > 編集」のパンくずを表示（21.17）
- 設計方針: 取引先管理機能の`TradingPartnerEditPage`と同一パターン

---

## Frontend / Components

### ProjectListTable（差分設計）

| Field | Detail |
|-------|--------|
| Intent | プロジェクト一覧テーブルを表示（**ID列削除、営業担当者・工事担当者列追加**） |
| Requirements | 2.2, 6.1-6.5 |
| Owner / Reviewers | Frontend Team |

**変更内容**:
- 列構成の変更（ID列削除、営業担当者・工事担当者列追加）
- SortField型の更新
- テーブルセルのレンダリング変更

**変更後の列定義**:
```typescript
const COLUMNS: Array<{
  key: SortField;
  label: string;
  sortable: boolean;
}> = [
  { key: 'name', label: 'プロジェクト名', sortable: true },
  { key: 'customerName', label: '顧客名', sortable: true },
  { key: 'salesPersonName', label: '営業担当者', sortable: true },
  { key: 'constructionPersonName', label: '工事担当者', sortable: true },
  { key: 'status', label: 'ステータス', sortable: true },
  { key: 'createdAt', label: '作成日', sortable: true },
  { key: 'updatedAt', label: '更新日', sortable: true },
];
```

**担当者列のレンダリング**:
```typescript
// 営業担当者列
<td>{project.salesPerson.displayName}</td>

// 工事担当者列（nullableなのでオプショナルチェイン）
<td>{project.constructionPerson?.displayName ?? '-'}</td>
```

---

### ProjectForm

| Field | Detail |
|-------|--------|
| Intent | プロジェクト作成・編集フォームを提供 |
| Requirements | 1.1-1.16, 8.1-8.8, 13.1-13.11, 16.1-16.13, 17.1-17.12 |
| Owner / Reviewers | Frontend Team |

**Responsibilities & Constraints**
- フォームフィールドのレンダリング
- クライアントサイドバリデーション
- 担当者デフォルト値の設定
- 送信処理とエラーハンドリング
- **プロジェクト名重複エラーの表示**（1.15, 8.7）

**Dependencies**
- Inbound: ProjectListPage, ProjectDetailPage — フォーム表示 (P0)
- Outbound: TradingPartnerSelect — 取引先選択 (P1)
- Outbound: UserSelect — 担当者選択 (P1)
- Outbound: useAuth — ログインユーザー取得 (P0)

**Contracts**: Service [x] / API [ ] / Event [ ] / Batch [ ] / State [ ]

##### Service Interface

```typescript
interface ProjectFormProps {
  mode: 'create' | 'edit';
  initialData?: Partial<ProjectFormData>;
  onSubmit: (data: ProjectFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  submitError?: string | null;  // サーバーエラー（409等）
}

interface ProjectFormData {
  name: string;
  tradingPartnerId?: string | null;  // 取引先ID（外部キー）
  salesPersonId: string;
  constructionPersonId?: string;
  siteAddress?: string;
  description?: string;
}
```

**Implementation Notes**
- Integration: 既存のフォームパターン（React Hook Form等）の検討
- Validation: Zodスキーマでクライアント・サーバー共通バリデーション
- **409エラー処理**: プロジェクト名重複時はnameフィールドにエラーメッセージを表示
- TradingPartner連携: TradingPartnerSelectで取引先選択機能を提供（外部キー連携実装済み）

---

### TradingPartnerSelect（取引先選択コンポーネント）

| Field | Detail |
|-------|--------|
| Intent | 取引先の選択UIを提供（ドロップダウン + オートコンプリート、**ひらがな・カタカナ両対応、ラベル「顧客名」**） |
| Requirements | 16.1-16.13, 22.1-22.11 |
| Owner / Reviewers | Frontend Team |

**Responsibilities & Constraints**
- **UIラベル「顧客名」**（「取引先」から変更）✅ 実装済み
- 取引先管理機能（`trading-partner-management`）との外部キー連携 ✅ 実装済み
- 取引先種別に「顧客」を含む取引先一覧を候補として表示 ✅ 実装済み
- 取引先名またはフリガナで部分一致検索（オートコンプリート） ✅ 実装済み
- **ひらがな入力でもカタカナフリガナを検索（16.3, 22.5）** ❌ **クライアントサイドフィルタリング未対応（差分8で対応）**
- 入力文字列に部分一致する取引先を最大10件まで候補表示 ✅ 実装済み
- 任意選択（null許容） ✅ 実装済み
- キーボード操作（上下キー選択、Enter確定）とマウス操作の両方に対応 ✅ 実装済み

**Dependencies**
- Inbound: ProjectForm — 取引先選択 (P0)
- Outbound: TradingPartnerAPI — 取引先検索（オートコンプリート候補取得）(P1)
- Outbound: kana-converter — ひらがな・カタカナ変換（**差分8で追加**）(P1)

**Contracts**: Service [ ] / API [x] / Event [ ] / Batch [ ] / State [ ]

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| GET | /api/trading-partners | ?search=string&types=CUSTOMER | TradingPartner[] | 400, 401, 403 |

**Implementation Notes**
- Integration: 取引先管理機能と連携、取引先IDを外部キーとして保存
- Validation: 選択された取引先IDの存在確認（サーバーサイド）
- **ひらがな・カタカナ変換**: バックエンドで変換処理（既存実装済み）、**クライアントサイドフィルタリング（差分8で対応）**
- UX: 500ミリ秒以内のレスポンス、ローディングインジケータ表示、候補なし時のメッセージ表示

**アーキテクチャ決定（2025-12-12）**:
- `customerName`フリーテキストフィールドから`tradingPartnerId`外部キーへ移行完了
- 取引先未選択時は`null`を許容（任意フィールド）
- Prismaスキーマ: `tradingPartnerId String?`、`@relation(fields: [tradingPartnerId], references: [id])`

**2025-12-15 ギャップ対応（差分8）**:
- `frontend/src/utils/kana-converter.ts`を新規作成（バックエンドから移植）
- `matchesSearchQuery`関数にかな変換ロジックを追加
- 詳細は「差分8: TradingPartnerSelectのクライアントサイドフィルタリングでひらがな・カタカナ両対応」を参照

---

### UserSelect

| Field | Detail |
|-------|--------|
| Intent | 担当者選択ドロップダウンを提供 |
| Requirements | 17.1-17.12 |
| Owner / Reviewers | Frontend Team |

**Responsibilities & Constraints**
- admin以外の有効なユーザー一覧の表示
- ログインユーザーのデフォルト選択
- 500ms以内のレスポンス

**Dependencies**
- Inbound: ProjectForm — 担当者選択 (P0)
- Outbound: UserAPI — ユーザー一覧取得 (P1)

**Contracts**: Service [ ] / API [x] / Event [ ] / Batch [ ] / State [ ]

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| GET | /api/users/assignable | - | AssignableUser[] | 401, 403 |

**Implementation Notes**
- Integration: 既存のUserモデルを活用、adminユーザーを除外
- Validation: 選択されたユーザーIDの存在確認
- Risks: ユーザー数が多い場合のパフォーマンス

---

### StatusTransitionUI

| Field | Detail |
|-------|--------|
| Intent | ステータス遷移UI（順方向・差し戻し・終端の視覚的区別）を提供 |
| Requirements | 10.1-10.16 |
| Owner / Reviewers | Frontend Team |

**Responsibilities & Constraints**
- 現在のステータスと遷移可能なステータスの表示
- 順方向遷移と差し戻し遷移の視覚的区別
- 差し戻し時の理由入力ダイアログ
- ステータス変更履歴の表示（遷移種別と差し戻し理由を含む）

**Dependencies**
- Inbound: ProjectDetailPage — ステータス表示・遷移 (P0)
- Outbound: ProjectStatusService API — ステータス遷移 (P1)

**Contracts**: Service [x] / API [ ] / Event [ ] / Batch [ ] / State [x]

##### Service Interface

```typescript
interface StatusTransitionUIProps {
  projectId: string;
  currentStatus: ProjectStatus;
  allowedTransitions: AllowedTransition[];
  statusHistory: ProjectStatusHistory[];
  onTransition: (newStatus: ProjectStatus, reason?: string) => Promise<void>;
  isLoading: boolean;
}

interface AllowedTransition {
  status: ProjectStatus;
  type: TransitionType;
  requiresReason: boolean;
}
```

##### State Management

ステータス遷移UI視覚区別:
```typescript
const TRANSITION_TYPE_STYLES: Record<TransitionType, { icon: string; color: string; bgColor: string }> = {
  initial: {
    icon: 'plus-circle',      // 初期作成アイコン
    color: 'text-blue-700',
    bgColor: 'bg-blue-50'
  },
  forward: {
    icon: 'arrow-right',      // 順方向矢印
    color: 'text-green-700',
    bgColor: 'bg-green-50'
  },
  backward: {
    icon: 'arrow-left',       // 差し戻し矢印
    color: 'text-orange-700',
    bgColor: 'bg-orange-50'
  },
  terminate: {
    icon: 'x-circle',         // 終端アイコン
    color: 'text-red-700',
    bgColor: 'bg-red-50'
  },
};

// ステータスカラーマップ
const STATUS_COLORS: Record<ProjectStatus, { bg: string; text: string }> = {
  PREPARING: { bg: 'bg-gray-100', text: 'text-gray-800' },
  SURVEYING: { bg: 'bg-blue-100', text: 'text-blue-800' },
  ESTIMATING: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  APPROVING: { bg: 'bg-orange-100', text: 'text-orange-800' },
  CONTRACTING: { bg: 'bg-purple-100', text: 'text-purple-800' },
  CONSTRUCTING: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  DELIVERING: { bg: 'bg-cyan-100', text: 'text-cyan-800' },
  BILLING: { bg: 'bg-teal-100', text: 'text-teal-800' },
  AWAITING: { bg: 'bg-lime-100', text: 'text-lime-800' },
  COMPLETED: { bg: 'bg-green-100', text: 'text-green-800' },
  CANCELLED: { bg: 'bg-red-100', text: 'text-red-800' },
  LOST: { bg: 'bg-rose-100', text: 'text-rose-800' },
};
```

**Implementation Notes**
- Integration: Tailwind CSSのカラークラスを使用、アイコンはHeroicons
- Validation: 差し戻し時の理由入力必須チェック（クライアント・サーバー両方）
- Risks: カラーコントラストのアクセシビリティ確認が必要（WCAG 2.1 Level AA準拠）

---

### Breadcrumb Integration

#### Breadcrumb（パンくずナビゲーション - 既存コンポーネント再利用）

| Field | Detail |
|-------|--------|
| Intent | 階層構造を示すナビゲーションを提供し、ユーザーが現在位置を把握・任意の階層へ遷移できるようにする |
| Requirements | 21.14, 21.15, 21.16, 21.17, 21.18 |
| Owner / Reviewers | Frontend Team |

**既存コンポーネントの再利用**

プロジェクト管理機能では、取引先管理機能（`trading-partner-management`）で実装済みの`Breadcrumb`コンポーネント（`frontend/src/components/common/Breadcrumb.tsx`）をそのまま再利用します。

**既存Breadcrumbコンポーネントの仕様**:

```typescript
// frontend/src/components/common/Breadcrumb.tsx

/**
 * パンくずナビゲーションの項目
 */
interface BreadcrumbItem {
  /** 表示テキスト */
  label: string;
  /** リンク先パス（省略時はリンクなし） */
  path?: string;
}

/**
 * Breadcrumbコンポーネントのprops
 */
interface BreadcrumbProps {
  /** パンくず項目の配列 */
  items: BreadcrumbItem[];
}
```

**アクセシビリティ対応**（既存実装済み）:
- `aria-label="パンくずナビゲーション"`: スクリーンリーダー対応
- `aria-current="page"`: 現在ページの識別
- `aria-hidden="true"`: 区切り文字の非読み上げ

**プロジェクト管理ページでの使用パターン**:

```typescript
// 1. プロジェクト一覧ページ（21.14）
const listBreadcrumb: BreadcrumbItem[] = [
  { label: 'ダッシュボード', path: '/' },
  { label: 'プロジェクト' }  // 現在ページ（リンクなし）
];

// 2. プロジェクト詳細ページ（21.15）
const detailBreadcrumb: BreadcrumbItem[] = [
  { label: 'ダッシュボード', path: '/' },
  { label: 'プロジェクト', path: '/projects' },
  { label: project.name }  // 現在ページ（リンクなし）
];

// 3. プロジェクト新規作成ページ（21.16）
const createBreadcrumb: BreadcrumbItem[] = [
  { label: 'ダッシュボード', path: '/' },
  { label: 'プロジェクト', path: '/projects' },
  { label: '新規作成' }  // 現在ページ（リンクなし）
];

// 4. プロジェクト編集ページ（21.17） - 独立ページ方式
// ProjectEditPage.tsx で使用
const editBreadcrumb: BreadcrumbItem[] = [
  { label: 'ダッシュボード', path: '/' },
  { label: 'プロジェクト', path: '/projects' },
  { label: project.name, path: `/projects/${project.id}` },  // 詳細ページへのリンク
  { label: '編集' }  // 現在ページ（リンクなし）
];
```

**設計方針：独立ページ方式（パターンB）**

取引先管理機能との一貫性を重視し、詳細ページと編集ページを独立したページコンポーネントとして分離します：

| ページ | URL | コンポーネント | パンくず |
|--------|-----|---------------|---------|
| 詳細 | `/projects/:id` | `ProjectDetailPage` | ダッシュボード > プロジェクト > [プロジェクト名] |
| 編集 | `/projects/:id/edit` | `ProjectEditPage` | ダッシュボード > プロジェクト > [プロジェクト名] > 編集 |

```typescript
// ProjectDetailPage.tsx - 詳細ページ（読み取り専用）
const detailBreadcrumbItems: BreadcrumbItem[] = [
  { label: 'ダッシュボード', path: '/' },
  { label: 'プロジェクト', path: '/projects' },
  { label: project.name }  // 現在ページ（リンクなし）
];

// ProjectEditPage.tsx - 編集ページ
const editBreadcrumbItems: BreadcrumbItem[] = [
  { label: 'ダッシュボード', path: '/' },
  { label: 'プロジェクト', path: '/projects' },
  { label: project.name, path: `/projects/${project.id}` },  // 詳細ページへのリンク
  { label: '編集' }  // 現在ページ（リンクなし）
];
```

**Implementation Notes**
- Integration: 既存の`Breadcrumb`コンポーネントをインポートして使用（`import { Breadcrumb } from '../components/common'`）
- 取引先管理機能と同一パターン: `TradingPartnerListPage`, `TradingPartnerDetailPage`, `TradingPartnerEditPage`の実装を参照
- ルーティング: `routes.tsx`に`/projects/:id/edit`ルートを追加し、`ProjectEditPage`にマッピング

---

### Navigation Integration

#### AppHeader Extension (Summary Only)

既存の`AppHeader`コンポーネントを拡張し、「プロジェクト」リンクを追加します。

- 配置: 「ダッシュボード」リンクの右側
- アイコン: プロジェクトを表すフォルダアイコン
- リンク先: `/projects`

**Implementation Note**: 既存の`Icons`オブジェクトに`Project`アイコンを追加し、ナビゲーションリンクを挿入

---

#### Dashboard Extension (Summary Only)

既存の`Dashboard`コンポーネントを拡張し、「プロジェクト管理」カードを追加します。

- 配置: クイックアクセスセクションの先頭
- 説明文: 「工事案件の作成・管理」
- リンク先: `/projects`

**Implementation Note**: 既存のカードパターンを踏襲

## Data Models

### Domain Model

```mermaid
erDiagram
    Project ||--o{ ProjectStatusHistory : has
    Project }o--|| User : salesPerson
    Project }o--o| User : constructionPerson
    Project }o--|| User : createdBy
    Project }o--o| TradingPartner : tradingPartner

    Project {
        string id PK
        string name UK
        string tradingPartnerId FK
        string salesPersonId FK
        string constructionPersonId FK
        string siteAddress
        string description
        ProjectStatus status
        datetime createdAt
        datetime updatedAt
        datetime deletedAt
        string createdById FK
    }

    TradingPartner {
        string id PK
        string name
        string nameKana
    }

    ProjectStatusHistory {
        string id PK
        string projectId FK
        ProjectStatus fromStatus
        ProjectStatus toStatus
        TransitionType transitionType
        string reason
        string changedById FK
        datetime changedAt
    }
```

**Aggregates and Boundaries**:
- `Project`はプロジェクト管理ドメインのルートエンティティ
- `ProjectStatusHistory`は`Project`に従属するエンティティ（プロジェクトなしでは存在しない）

**Business Rules & Invariants**:
- プロジェクト名は必須かつ1-255文字、**削除されていないプロジェクト内で一意**（1.15, 1.16, 8.7, 8.8）
- 取引先ID（tradingPartnerId）は任意、指定時は有効な取引先への参照
- 営業担当者は必須
- ステータスは定義された12種類のいずれか
- 遷移種別は4種類: initial, forward, backward, terminate
- プロジェクト作成時の初期履歴はfromStatus=null、transitionType='initial'
- 差し戻し遷移時は理由が必須
- 論理削除されたプロジェクトは一覧に表示されない

### Logical Data Model

**Structure Definition**:

| Entity | Attribute | Type | Constraints |
|--------|-----------|------|-------------|
| Project | id | UUID | PK, auto-generated |
| Project | name | VARCHAR(255) | NOT NULL, **UNIQUE (deletedAt=null)** |
| Project | tradingPartnerId | UUID | FK → trading_partners.id, NULLABLE |
| Project | salesPersonId | UUID | FK → users.id, NOT NULL |
| Project | constructionPersonId | UUID | FK → users.id, NULLABLE |
| Project | siteAddress | VARCHAR(500) | NULLABLE |
| Project | description | TEXT | NULLABLE, max 5000 chars |
| Project | status | ENUM | NOT NULL, default 'PREPARING' |
| Project | createdAt | TIMESTAMP | NOT NULL, auto-generated |
| Project | updatedAt | TIMESTAMP | NOT NULL, auto-updated |
| Project | deletedAt | TIMESTAMP | NULLABLE |
| Project | createdById | UUID | FK → users.id, NOT NULL |
| ProjectStatusHistory | id | UUID | PK, auto-generated |
| ProjectStatusHistory | projectId | UUID | FK → projects.id, NOT NULL |
| ProjectStatusHistory | fromStatus | ENUM | NULLABLE (null for initial transition) |
| ProjectStatusHistory | toStatus | ENUM | NOT NULL |
| ProjectStatusHistory | transitionType | ENUM | NOT NULL |
| ProjectStatusHistory | reason | TEXT | NULLABLE, required for backward |
| ProjectStatusHistory | changedById | UUID | FK → users.id, NOT NULL |
| ProjectStatusHistory | changedAt | TIMESTAMP | NOT NULL |

**Consistency & Integrity**:
- プロジェクト作成時に初期ステータス履歴を同時に作成（トランザクション）
- ステータス変更時に履歴を同時に作成（遷移種別と差し戻し理由を含む、トランザクション）
- 論理削除時はdeletedAtを設定（物理削除は行わない）
- 差し戻し遷移時はreason必須、その他の遷移時はreason任意
- 取引先ID（tradingPartnerId）は外部キー制約で参照整合性を保証
- **プロジェクト名の一意性はサービス層で検証（deletedAt=nullの範囲内）**

### Physical Data Model

**Prisma Schema Definition**:

```prisma
model Project {
  id                   String        @id @default(uuid())
  name                 String        // 一意（deletedAt=nullの範囲内、サービス層で検証）
  tradingPartnerId     String?       // 取引先ID（任意、外部キー）
  salesPersonId        String
  constructionPersonId String?
  siteAddress          String?
  description          String?
  status               ProjectStatus @default(PREPARING)
  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt
  deletedAt            DateTime?
  createdById          String

  // リレーション
  tradingPartner     TradingPartner? @relation(fields: [tradingPartnerId], references: [id])
  salesPerson        User            @relation("SalesPersonProjects", fields: [salesPersonId], references: [id])
  constructionPerson User?           @relation("ConstructionPersonProjects", fields: [constructionPersonId], references: [id])
  createdBy          User            @relation("CreatedProjects", fields: [createdById], references: [id])
  statusHistory      ProjectStatusHistory[]

  @@index([name])
  @@index([tradingPartnerId])
  @@index([status])
  @@index([salesPersonId])
  @@index([createdAt])
  @@index([updatedAt])
  @@index([deletedAt])
  @@map("projects")
}

model ProjectStatusHistory {
  id             String          @id @default(uuid())
  projectId      String
  fromStatus     ProjectStatus?  // nullable: initial遷移時はnull
  toStatus       ProjectStatus
  transitionType TransitionType
  reason         String?
  changedById    String
  changedAt      DateTime        @default(now())

  project        Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  changedBy      User            @relation("StatusChangedByUser", fields: [changedById], references: [id])

  @@index([projectId])
  @@index([changedAt])
  @@index([transitionType])
  @@map("project_status_histories")
}

enum ProjectStatus {
  PREPARING     // 準備中
  SURVEYING     // 調査中
  ESTIMATING    // 見積中
  APPROVING     // 決裁待ち
  CONTRACTING   // 契約中
  CONSTRUCTING  // 工事中
  DELIVERING    // 引渡中
  BILLING       // 請求中
  AWAITING      // 入金待ち
  COMPLETED     // 完了
  CANCELLED     // 中止
  LOST          // 失注
}

enum TransitionType {
  initial   // 初期遷移（プロジェクト作成時）
  forward   // 順方向遷移
  backward  // 差し戻し遷移
  terminate // 終端遷移
}
```

**Indexes**:
- 検索用: `name`（部分一致検索）、取引先名は`tradingPartner`リレーション経由で検索、営業担当者・工事担当者は`salesPerson`/`constructionPerson`リレーション経由で検索
- 外部キー用: `tradingPartnerId`, `salesPersonId`
- フィルタリング用: `status`, `createdAt`
- ソート用: `createdAt`, `updatedAt`
- 論理削除確認用: `deletedAt`
- 履歴フィルタリング用: `transitionType`

## Error Handling

### Error Categories and Responses

**User Errors (4xx)**:
- 400 Bad Request: バリデーションエラー（必須フィールド未入力、文字数超過、無効なステータス等）
- 401 Unauthorized: 未認証アクセス → ログインページへリダイレクト
- 403 Forbidden: 権限不足 → 権限エラーメッセージ表示
- 404 Not Found: プロジェクト不存在 → 404ページ表示
- **409 Conflict**: 楽観的排他制御エラー → 最新データ確認を促すメッセージ表示、**プロジェクト名重複エラー → 「このプロジェクト名は既に使用されています」（1.15, 8.7）**
- 422 Unprocessable Entity: 無効なステータス遷移、差し戻し理由未入力 → 許可された遷移先を表示

**System Errors (5xx)**:
- 500 Internal Server Error: サーバーエラー → 「しばらくしてからお試しください」メッセージ
- 503 Service Unavailable: サービス停止 → メンテナンスメッセージ

**Business Logic Errors (422)**:
- 無効なステータス遷移 → 現在のステータスと許可された遷移先を表示
- 差し戻し理由未入力 → 「差し戻し理由は必須です」エラーメッセージ表示
- 関連データ存在時の削除 → 警告ダイアログ表示

### Monitoring

- エラーログ: Pinoロガーによる構造化ログ出力
- 監査ログ: プロジェクト作成・更新・削除・ステータス変更を記録（差し戻し理由を含む）
- Sentryエラートラッキング: 予期せぬエラーの自動報告

## Testing Strategy

### Unit Tests

- ProjectService: CRUD操作、バリデーション、エラーハンドリング、**プロジェクト名一意性チェック**（1.15, 1.16, 8.7, 8.8）
- ProjectStatusService: ステータス遷移ロジック（順方向・差し戻し・終端）、遷移種別判定、履歴記録、差し戻し理由検証
- ProjectForm: フォームバリデーション、送信処理、**プロジェクト名重複エラー表示**
- TradingPartnerSelect: 取引先検索ロジック、候補表示、**ひらがな・カタカナ変換（差分8）、ラベル「顧客名」**
- kana-converter（フロントエンド版）: toKatakana/toHiragana関数のテスト（差分8）
- UserSelect: ユーザー一覧取得、フィルタリング
- StatusTransitionUI: 遷移種別の視覚的区別、差し戻し理由入力ダイアログ
- **ProjectListTable: 列構成変更（ID列削除、営業担当者・工事担当者列追加）**

### Integration Tests

- POST /api/projects: プロジェクト作成フロー（認証、権限、バリデーション、DB保存、**一意性チェック**）
- GET /api/projects: 一覧取得（ページネーション、**営業担当者・工事担当者検索、かな検索両対応**、フィルタ、ソート）
- PUT /api/projects/:id: 更新フロー（楽観的排他制御、監査ログ、**一意性チェック**）
- PATCH /api/projects/:id/status: ステータス遷移（順方向・差し戻し・終端遷移ルール、差し戻し理由必須チェック、履歴記録）
- DELETE /api/projects/:id: 削除フロー（論理削除、関連データ確認）
- GET /api/projects/:id/status-history: ステータス変更履歴取得（遷移種別・差し戻し理由表示）

### E2E/UI Tests

- プロジェクト作成フロー: フォーム入力 → 送信 → 詳細画面遷移、**重複名でのエラー表示**
- プロジェクト一覧操作: 検索（**営業担当者・工事担当者含む、ひらがな・カタカナ両対応**） → フィルタ → ソート → ページ遷移
- **一覧表示列確認**: ID列なし、営業担当者・工事担当者列あり
- **ラベル表示確認**: TradingPartnerSelectとProjectDetailPageで「顧客名」ラベル表示（実装済み）
- **TradingPartnerSelectかな検索**: ひらがな入力でカタカナフリガナ候補が表示されることを確認（差分8）
- ステータス順方向遷移: ステータスボタン → 順方向遷移選択 → 確認
- ステータス差し戻し遷移: ステータスボタン → 差し戻し遷移選択 → 理由入力 → 確認
- ステータス遷移UIの視覚的区別: 順方向（緑）、差し戻し（オレンジ）、終端（赤）の表示確認
- パンくずナビゲーション（21.14-21.18）:
  - 一覧ページ: 「ダッシュボード > プロジェクト」の表示確認
  - 詳細ページ: 「ダッシュボード > プロジェクト > [プロジェクト名]」の表示確認
  - 新規作成ページ: 「ダッシュボード > プロジェクト > 新規作成」の表示確認
  - 編集モード時: 「ダッシュボード > プロジェクト > [プロジェクト名] > 編集」の動的表示確認
  - パンくずクリック遷移: 各階層クリックで該当ページへ遷移確認
- レスポンシブ表示: デスクトップ → タブレット → モバイル
- キーボードナビゲーション: Tab, Enter, Escape操作

### Performance

- 一覧表示: 1000件以上のデータで2秒以内の表示
- API応答: CRUD操作500ms以内
- 検索・フィルタ: 1秒以内の結果表示

## Security Considerations

### Authentication and Authorization

- 全APIエンドポイントで`authenticate.middleware.ts`による認証必須
- 操作別の権限チェック（`authorize.middleware.ts`）:
  - `project:create`: プロジェクト作成
  - `project:read`: プロジェクト閲覧
  - `project:update`: プロジェクト更新
  - `project:delete`: プロジェクト削除
- 既存のPermissionテーブルへの権限追加（マイグレーション）

### Data Protection

- 担当者IDの検証: admin以外の有効なユーザーIDであることを確認
- 入力サニタイズ: XSS対策（React自動エスケープ）
- SQLインジェクション対策: Prisma ORMによるパラメータ化クエリ
- 差し戻し理由のサニタイズ: XSS対策

### Audit Trail

- 監査対象操作:
  - PROJECT_CREATED: プロジェクト作成
  - PROJECT_UPDATED: プロジェクト更新
  - PROJECT_DELETED: プロジェクト削除
  - PROJECT_STATUS_CHANGED: ステータス変更（遷移種別・差し戻し理由を含む）
- 記録内容: actorId, targetId, before/after, metadata（IPアドレス、User-Agent、transitionType、reason）

## Performance & Scalability

### Target Metrics

| Operation | Target | Measurement |
|-----------|--------|-------------|
| 一覧表示（初期表示） | 2秒以内 | First Contentful Paint |
| 詳細表示 | 1秒以内 | Time to Interactive |
| CRUD操作 | 500ms以内 | API Response Time |
| 検索・フィルタ | 1秒以内 | API Response Time |
| オートコンプリート | 500ms以内 | API Response Time |

### Optimization Techniques

- ページネーション: 1ページ20件でデータ量制限
- インデックス: 検索・フィルタ・ソート対象カラムにインデックス設定
- N+1防止: Prisma includeによる効率的なクエリ
- デバウンス: 検索・オートコンプリートのリクエスト抑制（300ms）
- 仮想スクロール: 大量データ時の検討（将来対応）

### Caching Strategy

- 権限キャッシュ: 既存のRBACキャッシュ（Redis、15分TTL）を活用
- ユーザー一覧キャッシュ: 担当者選択用（将来検討）
