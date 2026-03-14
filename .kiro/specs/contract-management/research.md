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

## References
- Prismaスキーマ: `backend/prisma/schema.prisma`
- 見積書ルート: `backend/src/routes/estimates.routes.ts`
- TradingPartnerSelect: `frontend/src/components/projects/TradingPartnerSelect.tsx`
- パンくずナビゲーション: `frontend/src/components/common/Breadcrumb.tsx`
