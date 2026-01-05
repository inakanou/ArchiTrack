# Research & Design Decisions

## Summary

- **Feature**: quantity-table-generation
- **Discovery Scope**: Complex Integration（新規エンティティ + 既存パターン拡張）
- **Key Findings**:
  - 循環参照検出にはDFSベースのアルゴリズムが適切（O(V+E)時間複雑度）
  - 浮動小数点精度にはDecimal.jsライブラリを使用
  - 自動保存にはデバウンス + キュー方式でレースコンディションを回避

## Research Log

### 循環参照検出アルゴリズム

- **Context**: 参照合計機能（Requirement 11）で数量項目間の循環参照を検出する必要がある
- **Sources Consulted**:
  - [GeeksforGeeks - Detect Cycle in a Directed Graph](https://www.geeksforgeeks.org/dsa/detect-cycle-in-a-graph/)
  - [HackerNoon - Javascript Developer's Guide to Graphs and Detecting Cycles](https://hackernoon.com/the-javascript-developers-guide-to-graphs-and-detecting-cycles-in-them-96f4f619d563)
  - [GitHub - js-incremental-cycle-detect](https://github.com/blutorange/js-incremental-cycle-detect)
- **Findings**:
  - DFSベースの検出がO(V+E)で最も効率的
  - 参照追加時にリアルタイム検出が必要
  - 再帰スタックを追跡して同一パス内の訪問済みノードを検出
  - インクリメンタル検出ライブラリ（Pearce-Kellyアルゴリズム）も選択肢
- **Implications**:
  - フロントエンドで参照選択時にクライアントサイドで事前検証
  - バックエンドでも保存時に二重検証
  - 依存グラフをメモリ内で保持してリアルタイム更新

### 浮動小数点精度

- **Context**: 積算計算で正確な数値計算が必要（Requirements 8, 9, 10）
- **Sources Consulted**:
  - [Medium - Decimal.js vs BigNumber.js](https://medium.com/@josephgathumbi/decimal-js-vs-c1471b362181)
  - [decimal.js API](https://mikemcl.github.io/decimal.js/)
  - [npm - decimal.js](https://www.npmjs.com/package/decimal.js)
- **Findings**:
  - JavaScript標準のNumber型は0.1 + 0.2 = 0.30000000000000004問題あり
  - Decimal.jsは無制限精度をデフォルトでサポート
  - 丸めモード（ROUND_UP, ROUND_DOWN, ROUND_HALF_UP等）を細かく制御可能
  - TypeScript型定義ファイル（decimal.d.ts）同梱
  - bignumber.jsより高機能（三角関数、累乗など対応）
- **Implications**:
  - Decimal.jsを採用（バージョン: ^10.5.0）
  - すべての計算をDecimalインスタンスで実行
  - 表示時のみNumber型に変換
  - 丸め設定（Requirement 10）はRounding Mode APIを使用

### 自動保存戦略

- **Context**: 数量表の自動保存（Requirement 12.5）でデータ喪失を防止
- **Sources Consulted**:
  - [Patient - Avoiding Race Conditions When Autosaving](https://www.pz.com.au/avoiding-race-conditions-and-data-loss-when-autosaving-in-react-query)
  - [CodeSandbox - React Final Form Auto-Save with Debounce](https://codesandbox.io/s/5w4yrpyo7k)
  - [GitHub - use-form-auto-save](https://github.com/damyantjain/use-form-auto-save)
- **Findings**:
  - デバウンス間隔は1000-2000msが適切
  - レースコンディション回避にはキューイング方式が有効
  - 楽観的更新でUIの即時反映を実現
  - `beforeunload`イベントで未保存警告を表示
  - 保存状態のフィードバック（「保存中...」「保存完了」）が必須
- **Implications**:
  - 1500msデバウンスで自動保存をトリガー
  - 変更キューをバッチ処理
  - 保存失敗時はリトライ（最大3回）
  - ローカルストレージにドラフト保存（ブラウザクラッシュ対策）

### 既存パターン分析

- **Context**: SiteSurvey機能の実装パターンを数量表に適用
- **Sources Consulted**: コードベース内の既存実装
- **Findings**:
  - サービス層: 依存性注入パターン（PrismaClient, AuditLogService）
  - ルーティング: プロジェクト配下のネストルート（/projects/:projectId/site-surveys）
  - パンくず: 共通Breadcrumbコンポーネント使用
  - セクションカード: SiteSurveySectionCardパターンで詳細画面に統合
  - 楽観的排他制御: updatedAtを使用したバージョンチェック
- **Implications**:
  - 同じパターンを数量表に適用
  - QuantityTableService, QuantityGroupService, QuantityItemServiceを実装
  - ルート: /projects/:projectId/quantity-tables
  - QuantityTableSectionCardでプロジェクト詳細に統合

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 階層型サービス | QuantityTable → QuantityGroup → QuantityItem の階層構造 | 責務分離、再利用性 | 複雑なトランザクション管理 | 既存のSiteSurvey → SurveyImageパターンに準拠 |
| 単一サービス | QuantityTableServiceで全操作を管理 | シンプル、一貫性 | 肥大化リスク | 小規模機能向け |
| **選択: 階層型サービス** | 既存パターンとの一貫性を優先 | - | - | - |

## Design Decisions

### Decision: 計算エンジンの実装場所

- **Context**: 計算ロジック（面積・体積、ピッチ、参照合計）の実装場所を決定
- **Alternatives Considered**:
  1. フロントエンドのみ — リアルタイム計算、サーバー負荷軽減
  2. バックエンドのみ — 信頼性、一貫性
  3. 両方 — リアルタイム表示 + サーバー検証
- **Selected Approach**: 両方（フロントエンド計算 + バックエンド検証）
- **Rationale**: ユーザー体験（即時フィードバック）と信頼性（サーバー検証）のバランス
- **Trade-offs**: コード重複、同期コスト vs ユーザー体験と信頼性
- **Follow-up**: 計算ロジックを共有パッケージに抽出することを検討

### Decision: 参照合計の循環参照検出タイミング

- **Context**: 循環参照をいつ検出・報告するか
- **Alternatives Considered**:
  1. 参照選択時（即時） — ユーザーフレンドリー
  2. 保存時（遅延） — 実装シンプル
  3. 両方 — 完全な保護
- **Selected Approach**: 両方（参照選択時の事前検証 + 保存時の最終検証）
- **Rationale**: ユーザーが無効な参照を選択する前に警告、保存時に最終チェック
- **Trade-offs**: 計算コスト vs ユーザー体験
- **Follow-up**: 大量の数量項目（100+）でのパフォーマンステスト

### Decision: オートコンプリートの実装方式

- **Context**: 入力支援のオートコンプリート候補をどこから取得するか（Requirement 7）
- **Alternatives Considered**:
  1. クライアントサイドのみ — 現在の数量表データから抽出
  2. サーバーサイド — API経由で候補を取得
  3. ハイブリッド — クライアント優先、サーバー補完
- **Selected Approach**: クライアントサイドのみ
- **Rationale**: 同一数量表内の入力履歴のみが対象（Requirements 7.1-7.5）、リアルタイム性重視
- **Trade-offs**: 他の数量表からの候補は取得不可 vs シンプルな実装とリアルタイム性
- **Follow-up**: 将来的にグローバル候補が必要になった場合はサーバーサイド追加

### Decision: 数量項目のコピー・移動UIパターン

- **Context**: 数量項目のコピー・移動操作のUI（Requirement 6）
- **Alternatives Considered**:
  1. ドラッグ&ドロップ — 直感的
  2. コンテキストメニュー — 精密な操作
  3. 両方 — 完全なアクセシビリティ
- **Selected Approach**: 両方（ドラッグ&ドロップ + コンテキストメニュー）
- **Rationale**: マウス操作とキーボード操作の両方をサポート（アクセシビリティ）
- **Trade-offs**: 実装複雑度 vs ユーザビリティ
- **Follow-up**: @dnd-kit/coreの使用を検討（React用のアクセシブルなDnDライブラリ）

## Risks & Mitigations

- **大規模数量表でのパフォーマンス** — 仮想スクロール（react-window）で対応、100項目以上は遅延読み込み
- **計算結果の精度不一致** — Decimal.jsで統一、小数点以下の桁数をプロジェクト設定で管理
- **参照合計の整合性** — 参照先削除時に警告表示、孤立参照の自動検出
- **同時編集の競合** — 楽観的排他制御（updatedAt）、リアルタイム同期は将来対応
- **自動保存のデータ喪失** — ローカルストレージバックアップ、保存失敗時のリトライ

## References

- [decimal.js - Arbitrary-precision Decimal type for JavaScript](https://mikemcl.github.io/decimal.js/)
- [GeeksforGeeks - Detect Cycle in a Directed Graph](https://www.geeksforgeeks.org/dsa/detect-cycle-in-a-graph/)
- [React Query - Avoiding Race Conditions](https://www.pz.com.au/avoiding-race-conditions-and-data-loss-when-autosaving-in-react-query)
- [@dnd-kit/core - Drag and Drop toolkit](https://dndkit.com/)
- [react-window - React virtualization library](https://react-window.vercel.app/)
