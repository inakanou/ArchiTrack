# Research & Design Decisions

---
**Purpose**: 契約書管理機能の設計にあたり、既存システムの分析結果と設計判断の根拠を記録する。
---

## Summary
- **Feature**: `contract-management`
- **Discovery Scope**: Extension（既存システムへの機能追加）
- **Key Findings**:
  - 既存のCRUDパターン（Estimate、EstimateRequest等）を踏襲可能
  - TradingPartnerSelectコンポーネントが監理者選択UIとして再利用可能
  - 変更契約の変更前後比較表示は新規UIパターンだが、既存フォームコンポーネントの拡張で対応可能

## Research Log

### 既存CRUDパターンの分析
- **Context**: 契約書管理は見積書・見積依頼と類似のCRUDパターンを持つため、既存実装を調査
- **Sources Consulted**: `backend/src/routes/estimates.routes.ts`, `backend/src/services/`, `frontend/src/pages/`, Prismaスキーマ
- **Findings**:
  - Backendルーティング: `app.use('/api/projects/:projectId/[resource]', routes)` + `app.use('/api/[resource]', routes)` のデュアルマウントパターンが標準
  - サービス層: Prisma Clientをコンストラクタ注入するパターンが標準
  - バリデーション: Zodスキーマ + `validate`ミドルウェアパターン
  - フロントエンドページ: `[Resource]ListPage`, `[Resource]CreatePage`, `[Resource]DetailPage`, `[Resource]EditPage` の4ページ構成が標準
  - 論理削除: `deletedAt`フィールドによるソフトデリートパターンが標準
  - パンくずナビゲーション: `Breadcrumb`共通コンポーネントが利用可能
- **Implications**: 契約書機能も同一パターンで実装し、学習コストとメンテナンスコストを最小化する

### 見積書（Estimate）モデルの参照
- **Context**: 契約書は見積書の金額を参照するため、見積書モデルの構造を分析
- **Sources Consulted**: Prismaスキーマ `model Estimate`
- **Findings**:
  - Estimateモデルは`projectId`でプロジェクトに紐付く
  - 見積項目（EstimateItem）に金額情報（estimateAmount等）が格納される
  - 見積書全体の税込金額はサービス層で集計される
- **Implications**: 契約書の請負代金額は見積書の集計値を参照する設計とする

### 取引先選択UI（TradingPartnerSelect）の再利用性
- **Context**: 要件3.3で「監理者となる取引先の入力UIをプロジェクト新規作成時の取引先選択UIと同一のものとする」と指定
- **Sources Consulted**: `frontend/src/components/projects/TradingPartnerSelect.tsx`
- **Findings**:
  - TradingPartnerSelectはオートコンプリート検索+選択のUIを提供
  - `onSelect`コールバックで選択結果を親コンポーネントに通知
  - プロジェクト作成・見積依頼作成の両方で既に利用されている
- **Implications**: 監理者選択にそのまま再利用可能。追加の型定義のみ必要

### 変更契約の比較表示パターン
- **Context**: 変更契約では変更前後の値を並べて表示する必要がある
- **Sources Consulted**: 既存コードベースに類似パターンなし
- **Findings**:
  - 既存システムに差分比較表示のUIパターンは存在しない
  - 各入力フィールドの横に「変更前」の値をread-onlyで並べて表示する方式が要件に合致
  - CSSグリッドまたはFlexboxで2カラムレイアウトを実現可能
- **Implications**: 新規UIパターンとして契約書フォーム内に比較カラムを追加する設計とする

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 既存パターン踏襲 | Estimate/EstimateRequestと同一のCRUDアーキテクチャ | 一貫性、学習コスト低、実績あり | なし | 採用 |
| 独立マイクロサービス | 契約書を独立サービスとして分離 | 独立デプロイ可能 | オーバーエンジニアリング、既存構成と不整合 | 不採用 |

## Design Decisions

### Decision: 契約書のステータス管理方式
- **Context**: 契約書には「契約前」「契約済」の2つのステータスがあり、双方向遷移が可能
- **Alternatives Considered**:
  1. Enumフィールド + 直接更新
  2. ステータス履歴テーブル + 遷移バリデーション
- **Selected Approach**: Enumフィールド + 直接更新
- **Rationale**: ステータスが2種類のみで双方向遷移可能なため、履歴テーブルは不要。シンプルなEnum更新で十分
- **Trade-offs**: 履歴追跡はできないが、要件に履歴表示の要求なし
- **Follow-up**: 将来的に履歴が必要になった場合はProjectStatusHistoryパターンを参考に拡張

### Decision: 変更契約のベース契約書参照方式
- **Context**: 変更契約は基となる契約書を参照し、デフォルト値を引き継ぐ
- **Alternatives Considered**:
  1. 自己参照外部キー（parentContractId）
  2. 中間テーブルによるリレーション
- **Selected Approach**: 自己参照外部キー（parentContractId）
- **Rationale**: 1対1の親子関係であり、既存のEstimateItemのparentIdパターンと同一。シンプルで効率的
- **Trade-offs**: 複数の基契約書を持つケースには非対応だが、要件上は1つの基契約書のみ

### Decision: 見積書金額の参照方式
- **Context**: 契約書は見積書の税込金額を請負代金額として参照する
- **Alternatives Considered**:
  1. 見積書IDのみ保持し、表示時に都度計算
  2. 契約書作成時にスナップショットとして金額を保存
- **Selected Approach**: 見積書IDを保持 + 金額フィールドをスナップショットとして保存
- **Rationale**: 契約書は法的文書の性質を持つため、作成時点の金額を不変として保持すべき。見積書が後から変更されても契約金額は変わらない
- **Trade-offs**: データ冗長性は発生するが、契約の整合性が保証される

## Risks & Mitigations
- 変更契約の比較表示UIは新規パターンのため、実装時にUXの検証が必要 — Storybookでのプロトタイピングで対応
- 見積書の金額集計ロジックの再利用 — 既存サービスのメソッドを呼び出す形で実装
- 消費税率変更時の既存契約への影響 — 契約書ごとに消費税率を独立して保持することで回避済み

## Research Log (Req 10-13 追加分)

### フロントエンドバリデーションパターンの分析
- **Context**: Req 10（データバリデーション）でフロントエンド側のバリデーションが未実装
- **Sources Consulted**: `frontend/src/components/contract/ContractForm.tsx`, `backend/src/schemas/contract.schema.ts`
- **Findings**:
  - バックエンドにはZodスキーマによる包括的なバリデーションが既に存在する（createContractSchema, updateContractSchema）
  - フロントエンドのContractFormにはクライアントサイドバリデーションが未実装（エラーメッセージ表示なし）
  - 消費税率はバックエンド側で0-1（小数）で管理されており、フロントエンドではUIで0-100%表示に変換する必要がある
  - バリデーションメッセージ定数がバックエンドの`CONTRACT_VALIDATION_MESSAGES`に定義済み
- **Implications**: フロントエンドにもバリデーションロジックを追加し、送信前にユーザーにフィードバックを提供する

### エラーハンドリング・フィードバックパターンの分析
- **Context**: Req 11（エラー回復とフィードバック）で成功メッセージ、5xxエラー区別、再試行ボタンが未実装
- **Sources Consulted**: `frontend/src/types/toast.types.ts`, `frontend/src/pages/ContractCreatePage.tsx`, `frontend/src/pages/ContractDetailPage.tsx`
- **Findings**:
  - プロジェクト全体でトースト通知システム（ToastType: success/error/warning/info）が既に確立されている
  - 契約書の作成・編集・削除成功時のトースト通知が未実装
  - ネットワークエラーと5xxサーバーエラーの区別がフロントエンド側で行われていない
  - 楽観的排他制御の競合エラー（409）はバックエンドで実装済みだが、フロントエンドでの特別なハンドリングがない
- **Implications**: 既存のトーストシステムを活用し、成功・エラーメッセージを統合的に管理する

### 削除制約パターンの分析
- **Context**: Req 12（契約書削除の制約）で子契約チェックとステータスチェックがサービス層で未実装
- **Sources Consulted**: `backend/src/services/contract.service.ts`, `backend/prisma/schema.prisma`
- **Findings**:
  - 現在のdelete()メソッドは存在チェック後に即座に論理削除を実行しており、制約チェックがない
  - Prismaスキーマに`childContracts Contract[] @relation("ContractAmendments")`が既に定義されている
  - 子契約の存在確認は`childContracts`リレーションを用いたクエリで実現可能
  - ステータスチェックは既存の`status`フィールドを参照するだけで実現可能
  - フロントエンドの詳細画面に削除ボタン・確認ダイアログが未実装
- **Implications**: ContractService.delete()にビジネスルール検証を追加し、フロントエンドにDeleteConfirmDialogを追加する

### フロントエンド権限制御パターンの分析
- **Context**: Req 13（アクセス制御）でバックエンドのミドルウェアは存在するが、フロントエンドUI権限制御が未実装
- **Sources Consulted**: `frontend/src/contexts/AuthContext.tsx`, `frontend/src/hooks/useAuth.ts`, `backend/src/routes/contracts.routes.ts`, `backend/src/utils/seed-helpers.ts`
- **Findings**:
  - バックエンドの全エンドポイントにrequirePermission()ミドルウェアが適用済み（contract:read, contract:create, contract:update, contract:delete）
  - AuthContextのUser型には`roles?: string[]`があるが、`permissions`フィールドは直接保持されていない
  - フロントエンドでの権限ベースUI制御の確立パターンが存在しない（権限はバックエンドで強制されるのみ）
  - フロントエンドでのUI権限制御は、ユーザーのロールに紐付く権限をAPIで取得するか、ログイン時に権限一覧をレスポンスに含める方式が考えられる
- **Implications**: usePermissionカスタムフックを新設し、ユーザー権限に基づくUI要素の表示/非表示制御を実現する。権限情報はAuthContextに統合するか、別途APIから取得する

## Design Decisions (Req 10-13 追加分)

### Decision: フロントエンドバリデーションの実装方式
- **Context**: Req 10でフロントエンド側のバリデーションが必要
- **Alternatives Considered**:
  1. React Hook Formなどのフォームライブラリ導入
  2. Zodスキーマをフロントエンドでも共有（monorepo共有パッケージ）
  3. ContractForm内にカスタムバリデーションロジックを実装
- **Selected Approach**: ContractForm内にカスタムバリデーションロジックを実装
- **Rationale**: 既存のContractFormがすでにReact stateベースで構築されており、フォームライブラリの導入は既存実装との乖離が大きい。バリデーションルールはバックエンドのZodスキーマと対応するが、UIに特化したメッセージとインラインエラー表示に最適化する
- **Trade-offs**: バックエンドとフロントエンドのバリデーションルールの二重管理が発生するが、消費税率の表示変換（0-1 vs 0-100%）など、レイヤ固有のロジックがあるため妥当

### Decision: 権限情報のフロントエンド取得方式
- **Context**: Req 13でフロントエンドUI要素の権限ベース制御が必要
- **Alternatives Considered**:
  1. ログイン時のレスポンスにpermissions配列を含める（AuthContext拡張）
  2. 別途 GET /api/v1/users/me/permissions APIを新設
  3. ロール名に基づくハードコードされた権限マッピング
- **Selected Approach**: ログイン時のレスポンスにpermissions配列を含め、AuthContextのUser型にpermissionsフィールドを追加。usePermissionカスタムフックで権限チェックユーティリティを提供
- **Rationale**: 認証フロー内で権限情報も同時に取得することで追加APIコールを回避。既存のAuthContext機構を自然に拡張可能
- **Trade-offs**: ユーザーの権限変更が即座にUIに反映されない（次回ログインまたはトークンリフレッシュ時に更新）が、契約書管理のユースケースでは許容範囲内

### Decision: 削除制約のエラー区分方式
- **Context**: Req 12で子契約存在チェックとステータスチェックのエラーが必要
- **Alternatives Considered**:
  1. 422 Unprocessable Entity（ビジネスルール違反）
  2. 409 Conflict（リソース状態の競合）
  3. 400 Bad Request
- **Selected Approach**: 422 Unprocessable Entity
- **Rationale**: 削除リクエスト自体の形式は正しいが、ビジネスルール上の制約により処理できない状態を示す。既存のError Handlingセクションでもビジネスロジックエラーに422を使用しており一貫性がある
- **Trade-offs**: なし

## References
- Prismaスキーマ: `backend/prisma/schema.prisma`
- 見積書ルート: `backend/src/routes/estimates.routes.ts`
- TradingPartnerSelect: `frontend/src/components/projects/TradingPartnerSelect.tsx`
- パンくずナビゲーション: `frontend/src/components/common/Breadcrumb.tsx`
- トースト通知型定義: `frontend/src/types/toast.types.ts`
- 契約書バリデーションスキーマ: `backend/src/schemas/contract.schema.ts`
- 認証コンテキスト: `frontend/src/contexts/AuthContext.tsx`
- 契約書サービス: `backend/src/services/contract.service.ts`
