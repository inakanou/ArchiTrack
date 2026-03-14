# Research & Design Decisions

## Summary
- **Feature**: `construction-schedule`
- **Discovery Scope**: Extension（既存プロジェクト管理システムへの工程表機能追加）
- **Key Findings**:
  - ガントチャートは外部ライブラリを使用せずカスタム実装が最適（要件のリアルタイムフロントエンド完結、土日祝色分け、バー上テキスト表示等の細かな要件に対応するため）
  - 日本の祝日判定には`@holiday-jp/holiday_jp`ライブラリが最適（積極的にメンテナンスされ、2026年以降の祝日データを含む）
  - Excel/PDF出力は既存の`xlsx`（SheetJS）と`jsPDF`ライブラリで実現可能（新規依存関係の追加は最小限）

## Research Log

### ガントチャートライブラリの選定
- **Context**: フロントエンドでのガントチャートリアルタイム表示方法の調査
- **Sources Consulted**: SVAR React Gantt、Frappe Gantt、gantt-task-react、DHTMLX Gantt等の比較
- **Findings**:
  - 外部ライブラリは汎用的だが、本機能の細かな要件（土日祝色分け、バー上詳細文字、出力対象チェックボックス等）への対応にカスタマイズコストが大きい
  - 要件はシンプルなバーチャート表示であり、複雑な依存関係管理やクリティカルパス計算は不要
  - カスタムCanvasまたはHTMLテーブルベースの実装で十分対応可能
- **Implications**: カスタムReactコンポーネントとして実装し、外部ガントチャートライブラリは使用しない

### 日本の祝日ライブラリ
- **Context**: ガントチャート上で日本の祝日を色分け表示するための祝日判定方法
- **Sources Consulted**: `@holiday-jp/holiday_jp`（v2.5.1）、`japanese-holidays`、`@sway11466/holiday-jp-npm`
- **Findings**:
  - `@holiday-jp/holiday_jp` v2.5.1が最もアクティブにメンテナンスされている
  - `between(startDate, endDate)`メソッドで期間内の祝日を一括取得可能
  - TypeScript型定義が提供されている
  - 2026年以降の祝日データを含む
- **Implications**: `@holiday-jp/holiday_jp`をフロントエンド依存関係として追加する

### Excel/PDF出力方式
- **Context**: 工程表のExcel/PDF出力実現方式の調査
- **Sources Consulted**: プロジェクト内既存実装（`xlsx` 0.20.3、`jsPDF` ^4.0.0）
- **Findings**:
  - 既存プロジェクトで`xlsx`（SheetJS）がExcel出力に使用されている（内訳書、見積書等）
  - `jsPDF`が既にPDF出力に使用されている（現場調査報告書、見積書等）
  - ガントチャートのExcel再現はセル結合・背景色でバーを表現可能
  - PDF出力はjsPDFのテーブル描画機能とカスタム描画でガントチャートを再現
- **Implications**: 新規ライブラリ追加不要。既存ライブラリのパターンに従って実装

### 数量表連携パターン
- **Context**: 数量表の項目を工程表に取り込む方式の調査
- **Sources Consulted**: 既存Prismaスキーマ（QuantityTable、QuantityGroup、QuantityItem）、フロントエンドAPI
- **Findings**:
  - 数量表はProject→QuantityTable→QuantityGroup→QuantityItemの階層構造
  - 工程表作成時に数量表を指定すると、QuantityItemの情報を参照して工程表項目を生成
  - 数量表との連携は作成時の1回のみ（スナップショット方式）で、以後は独立管理
- **Implications**: 工程表項目は数量表からコピーされた独立エンティティとして管理

### 既存CRUDパターンの分析
- **Context**: 既存の契約書管理・数量表管理のパターン踏襲
- **Sources Consulted**: `contracts.routes.ts`、`contract.service.ts`、`frontend/src/api/contracts.ts`
- **Findings**:
  - ルートパターン: `GET/POST /api/projects/:projectId/schedules`、`GET/PUT/DELETE /api/schedules/:id`
  - 認証・認可: `authenticate` + `requirePermission('schedule:read|create|update|delete')`
  - バリデーション: Zodスキーマ + `validate`ミドルウェア
  - エラーハンドリング: カスタムエラークラス（NotFound、Conflict、Validation）
  - 論理削除: `deletedAt`フィールド
  - 楽観的排他制御: `version`フィールド
- **Implications**: 完全に既存パターンに従う

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| カスタムガントチャート | HTML/CSSベースのカスタム実装 | 要件への完全適合、軽量、依存関係なし | 実装工数がライブラリ使用より大きい | 要件がシンプルなため適切 |
| 外部ライブラリ（SVAR等） | OSSガントチャートライブラリの利用 | 初期実装が速い | カスタマイズコスト大、バンドルサイズ増加 | 要件の細かな表示要件に合わない |

## Design Decisions

### Decision: ガントチャートのカスタム実装
- **Context**: ガントチャートの表示方式を選定する必要がある
- **Alternatives Considered**:
  1. 外部ライブラリ（SVAR React Gantt等）の利用
  2. HTML/CSSベースのカスタム実装
- **Selected Approach**: HTML/CSSベースのカスタムReactコンポーネント
- **Rationale**: 要件がシンプルなバー表示に限定されており（依存関係やクリティカルパスは不要）、土日祝色分け・バー上テキスト・出力対象チェックボックス等の細かな要件への対応が容易。外部ライブラリはオーバースペックでカスタマイズコストが高い
- **Trade-offs**: 初期実装工数は若干増えるが、メンテナンス性と軽量性で優位
- **Follow-up**: パフォーマンステスト（100項目以上での描画速度）

### Decision: 数量表連携のスナップショット方式
- **Context**: 数量表の項目を工程表にどのように連携するか
- **Alternatives Considered**:
  1. リアルタイム参照（数量表の変更が工程表に自動反映）
  2. スナップショット方式（作成時にコピー、以後独立管理）
- **Selected Approach**: スナップショット方式
- **Rationale**: 工程表は独立した施工スケジュール管理ツールであり、数量表の後からの変更が自動反映されると混乱を招く。既存の内訳書も同様のスナップショットパターンを採用している
- **Trade-offs**: 数量表変更時の手動同期が必要だが、ユーザーの意図しない変更を防止
- **Follow-up**: なし

### Decision: 並び順管理のdisplayOrderパターン
- **Context**: 工程表項目の並び順変更を永続化する方式
- **Alternatives Considered**:
  1. displayOrder整数フィールド（既存パターン）
  2. Linked Listパターン
- **Selected Approach**: displayOrder整数フィールド
- **Rationale**: 既存の数量表（QuantityGroup、QuantityItem）で同じパターンが採用されており、実装実績がある。バッチ更新APIも既存パターンを踏襲可能
- **Trade-offs**: 並び替え時に複数レコードの更新が必要だが、シンプルで理解しやすい
- **Follow-up**: なし

## Risks & Mitigations
- 大量項目（100+）でのガントチャート描画パフォーマンス -- 仮想スクロールまたは表示範囲制限で対応
- Excel出力でのガントチャート再現精度 -- セル結合と背景色による近似表現とし、完全な再現は求めない
- PDF出力時のA3/A4横向きレイアウト -- jsPDFのカスタム描画でランドスケープ出力に対応

## References
- [@holiday-jp/holiday_jp](https://www.npmjs.com/package/@holiday-jp/holiday_jp) -- 日本の祝日ライブラリ（v2.5.1）
- [SheetJS (xlsx)](https://www.npmjs.com/package/xlsx) -- Excel出力ライブラリ（既存依存関係）
- [jsPDF](https://www.npmjs.com/package/jspdf) -- PDF生成ライブラリ（既存依存関係）
- [SVAR React Gantt](https://svar.dev/react/gantt/) -- ガントチャートライブラリ（検討の結果不採用）
