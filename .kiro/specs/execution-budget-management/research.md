# Research & Design Decisions

---
**Purpose**: 実行予算管理機能の設計ディスカバリーで得られた調査結果と設計判断の根拠を記録する。
---

## Summary
- **Feature**: `execution-budget-management`
- **Discovery Scope**: Extension（既存システムの拡張）
- **Key Findings**:
  - 見積書の3行1セット構造（ESTIMATE/EXECUTION/VENDOR）から実行予算項目を初期化する設計が自然
  - 契約書モデルとの連携（contractId指定）で実行予算を作成する
  - 発注の案分計算では高精度10進数演算（decimal.js + Decimal(15,0)）が必須

## Research Log

### 実行予算管理の業界標準的な列構成
- **Context**: 要件定義で参照された外部記事（pooloyolo.blog）の分析
- **Sources Consulted**: https://pooloyolo.blog/construction-management/running-budget/
- **Findings**:
  - 実行予算項目には計画フェーズ（見積金額・実行金額）と追跡フェーズ（先月までの支出・今月の支出・累計支出）の二層がある
  - 出来高率 = 累計出来高金額 / 契約金額 x 100 で算出
  - 直接工事費、共通仮設費、現場管理費、一般管理費の分類が一般的
- **Implications**: requirements.mdで定義済みの列構成（要件3）は業界標準と合致しており、追加列は不要

### 既存の見積書データモデルとの連携
- **Context**: 実行予算項目の初期化元となるEstimateItem / EstimateItemLineの構造分析
- **Sources Consulted**: `backend/prisma/schema.prisma`（EstimateItem, EstimateItemLine, Contract）
- **Findings**:
  - EstimateItemは階層構造（parentId自己参照）で管理されている
  - EstimateItemLineは3行1セット（ESTIMATE/EXECUTION/VENDOR）
  - EXECUTION行のamount/unitPrice/quantityが実行予算の初期値として利用可能
  - VENDOR行のsourceVendorNameが発注予定取引先の初期値として利用可能
  - ContractモデルはestimateIdでEstimateと紐付いている
- **Implications**: 実行予算作成時にContract → Estimate → EstimateItem → EstimateItemLine（EXECUTION行）の経路でデータを取得し、実行予算項目を初期化する

### 既存ルーティング・サービスパターン
- **Context**: 既存コードベースのアーキテクチャパターン分析
- **Sources Consulted**: `backend/src/routes/contracts.routes.ts`、その他既存ルートファイル
- **Findings**:
  - ルートはRouter({ mergeParams: true })でネストされたプロジェクトルートからprojectIdを取得
  - サービスクラスはPrismaClientをコンストラクタで受け取るパターン
  - Zodスキーマによるバリデーション + validateミドルウェア
  - authenticate + requirePermissionミドルウェアによるアクセス制御
  - 楽観的排他制御はversionフィールドで実装
  - 論理削除はdeletedAtフィールドで実装
- **Implications**: 実行予算管理も同じパターンに従う。新規エラークラス、Zodスキーマ、サービスクラス、ルートファイルを作成

### 金額計算の精度要件
- **Context**: 案分計算・出来高計算における端数処理
- **Sources Consulted**: 既存のdecimal.js使用パターン、EstimateItemLineのDecimal(15,2)定義
- **Findings**:
  - バックエンドにdecimal.js ^10.6.0が既に導入済み
  - EstimateItemLineはDecimal(15,2)で金額を管理
  - 案分計算の端数（1円未満）は最大金額項目に加算する要件
- **Implications**: 実行予算の金額フィールドはDecimal(15,0)（整数精度）を使用。計算はdecimal.jsで実施し、端数は最大金額項目に寄せる

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 既存パターン踏襲 | Service + Router + Prisma の既存3層構造を踏襲 | 一貫性、学習コスト低、既存テストパターン再利用可 | 大量の新テーブルでサービスが肥大化する可能性 | 採用。ドメイン分割でサービスを適切に分離 |
| CQRS分離 | 読み取りと書き込みを分離 | 複雑な集計クエリの最適化 | 過剰な複雑性、既存パターンとの乖離 | 不採用。現時点の規模では不要 |

## Design Decisions

### Decision: 実行予算項目のデータソース
- **Context**: 実行予算項目をどのデータから初期化するか
- **Alternatives Considered**:
  1. 見積書のEXECUTION行から直接コピー
  2. 内訳書項目から初期化
- **Selected Approach**: 見積書のEstimateItem + EstimateItemLine（EXECUTION行）からコピー
- **Rationale**: 契約書はEstimateと直接紐付いており、見積書の階層構造・実行金額行がそのまま実行予算の基盤となる。内訳書は集計ビューであり元データではない
- **Trade-offs**: 見積書に実行金額行が存在しない場合のフォールバック処理が必要
- **Follow-up**: EXECUTION行が存在しないEstimateItemの処理方針を実装時に確認

### Decision: 発注予定取引先の初期値設定
- **Context**: 要件1.4で「見積書の業者金額行に設定されている取引先を自動適用」とある
- **Alternatives Considered**:
  1. VENDOR行のsourceVendorNameを文字列としてコピー
  2. TradingPartnerへの外部キー参照を保持
- **Selected Approach**: TradingPartnerへの外部キー参照。VENDOR行にsourceVendorNameが存在する場合、取引先マスタから名前検索してIDを紐付ける。見つからない場合はnullとし、手動設定を促す
- **Rationale**: 発注機能で取引先マスタとの連携が必要であり、文字列コピーでは不整合が発生するリスクがある
- **Trade-offs**: 名前による曖昧マッチングの精度リスク。完全一致で検索し、不一致時はnull
- **Follow-up**: 実装時にVENDOR行のsourceVendorNameの精度を検証

### Decision: 発注と見積項目の関連管理
- **Context**: 発注は見積項目を選択してグルーピングする機能
- **Alternatives Considered**:
  1. 中間テーブル（OrderItem）で多対多管理
  2. 実行予算項目に発注IDを直接保持
- **Selected Approach**: 中間テーブル（OrderItem）で管理
- **Rationale**: 1つの見積項目が複数の発注に含まれる可能性を考慮（ただし発注済みの項目は他の発注に含められない制約あり）。中間テーブルにより柔軟な選択管理が可能
- **Trade-offs**: テーブル数の増加
- **Follow-up**: なし

### Decision: 出来高データの管理方式
- **Context**: 施工日ごとの出来高をどう保存するか
- **Alternatives Considered**:
  1. 出来高ヘッダー（施工日）+ 出来高明細（項目別金額）の正規化構造
  2. JSON型で1レコードに全項目の出来高を格納
- **Selected Approach**: 正規化構造（ProgressHeader + ProgressItem）
- **Rationale**: 個別項目の検索・集計が容易。Prismaの型安全性を最大限活用可能。JSON型は型チェックが効かず保守性が低下する
- **Trade-offs**: レコード数が増加するが、インデックスで十分対応可能
- **Follow-up**: なし

### Decision: 月次締め処理の実装方式
- **Context**: 月次締めで「今月の支出」を「先月までの支出」に累積する処理
- **Alternatives Considered**:
  1. 実行予算項目テーブルに直接フィールドを持つ（previousMonthExpense, currentMonthExpense）
  2. 月次支出テーブルを別途作成し、月別に支出を記録
- **Selected Approach**: 実行予算項目テーブルにpreviousMonthExpense, currentMonthExpenseフィールドを持ち、月次締め履歴テーブルで締め処理を記録
- **Rationale**: 現在の支出状況は常に実行予算項目から即座に取得可能。月次締め処理は一括バッチ更新で実現。履歴テーブルで重複締め防止と監査証跡を確保
- **Trade-offs**: 月別の詳細な支出推移を後から確認するには月次締め履歴と組み合わせる必要がある
- **Follow-up**: なし

## Risks & Mitigations
- 大量の見積項目（数百項目）での実行予算一覧表示のパフォーマンス — フロントエンドでの仮想スクロールまたはページネーション検討
- 案分計算の端数処理による金額不整合 — decimal.jsによる高精度計算と端数調整ロジックの厳密なテスト
- 楽観的排他制御の競合頻度 — 実行予算は通常1名が編集するため、競合は稀。UIで適切なエラーハンドリングを実装
- 月次締めの取り消し機能未定義 — 要件に含まれないため初期スコープ外とするが、将来的な要望に備えて月次締め履歴に締め前の値を保持

## References
- [実行予算管理の基礎](https://pooloyolo.blog/construction-management/running-budget/) — 実行予算の列構成と管理方法の参考
- ArchiTrack Prisma Schema — `backend/prisma/schema.prisma`（EstimateItem, EstimateItemLine, Contract モデル）
- ArchiTrack 契約書ルート — `backend/src/routes/contracts.routes.ts`（既存パターンの参考）
