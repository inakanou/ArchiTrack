# Research & Design Decisions Log

---
**Feature**: `estimate-request`
**最新更新**: 2026-04-27（Requirements 36-38 追加に伴う Light Discovery）
**Discovery Scope**: Extension（既存スペックへの3点追加：プレビュー縦幅リサイズ、明細行並び順保持＋上下移動、セッション切れ時の編集状態保護）
---

## Summary

本ファイルは Requirements 36-38（受領見積書登録/編集ダイアログ改善2）の追加に伴って実施した Light Discovery の結果と設計判断を記録する。Requirements 1-35 については本追記前の設計判断を `design.md` 本体に直接記載しているため、本ファイルは Req 36-38 に対する記録から開始する。

### Key Findings

- **Req 38 の主要インフラは既存実装を再利用可能**: `SessionExpiredModal`（user-authentication/REQ-30 で実装済み、`ProtectedLayout` で global mount）、`AuthContext.sessionExpiredDuringOperation`、`apiClient` の 401 自動トークンリフレッシュ＋ `sessionExpiredCallback` 通知が既に稼働中。Req 38 の新規実装範囲は「保存処理の自動リトライ」と「未保存変更ガード」に限定される
- **Req 37 のデータ層は変更不要**: `LineItemInput.sortOrder` / `LineItemInfo.sortOrder` は既存の API スキーマ・DB スキーマに存在。フロントエンドの `LineItemFormData` への sortOrder 追加と並び替え操作の実装のみで成立する
- **Req 36 は新規依存導入なしで実装可能**: 既存の `package.json` にリサイズ系ライブラリは存在しないが、ブラウザ標準 Pointer Events と Web Storage API のみで実装でき、新規ライブラリ追加は不要

## Research Log

### Topic: 受領見積書ダイアログの現状実装

- **Context**: Req 36-38 の対象となる UI コンポーネントの実装位置と現状挙動を把握する必要があった
- **Sources Consulted**:
  - `frontend/src/pages/EstimateRequestDetailPage.tsx`（ダイアログ本体、行 1167-1196）
  - `frontend/src/components/estimate-requests/FileInlinePreview.tsx`（PDFプレビュー、行 137-145）
  - `frontend/src/components/estimate-requests/LineItemEditor.tsx`（明細行エディタ、行 22-300+）
  - `frontend/src/components/estimate-requests/ReceivedQuotationForm.tsx`
  - `frontend/src/api/received-quotations.ts`（APIスキーマ）
- **Findings**:
  - 受領見積書ダイアログは `EstimateRequestDetailPage` 内のモーダルとして実装されている
  - PDFプレビュー: `maxHeight: '300px'` 固定。画像プレビュー: `maxHeight: '500px'` 固定。Excelプレビュー: `maxHeight: '400px'` 固定。リサイズ機構なし
  - 明細行は配列順で表示。`LineItemFormData` には `sortOrder` フィールドが存在しない（API 入出力型 `LineItemInput`/`LineItemInfo` には既に存在する）
  - 保存 mutation は `EstimateRequestDetailPage` の handler（行 763-794）内で `createReceivedQuotation()`/`updateReceivedQuotation()` を呼び出し、`updatedAt` ベースの楽観的排他制御に対応済み
- **Implications**:
  - リサイズ機能の追加は各プレビューコンテナの `maxHeight` 固定値を `useResizableHeight` フック経由の動的 `height` に置き換えるだけで実現できる
  - 明細行の sortOrder 保持はフロントエンド型 `LineItemFormData` 拡張のみで API 互換が確保される
  - 保存処理は単一 handler に集約されているため、リトライ機構の差し込み位置が明確

### Topic: 既存セッションエラーハンドリング

- **Context**: Req 38 の「再認証モーダル方式」を採用するにあたり、既存インフラの状態を確認する必要があった
- **Sources Consulted**:
  - `frontend/src/api/client.ts`（HTTP クライアント、行 99-407）
  - `frontend/src/contexts/AuthContext.tsx`（認証状態管理、行 50-68, 460-494）
  - `frontend/src/components/SessionExpiredModal.tsx`（再認証モーダル、行 1-80）
  - `frontend/src/components/ProtectedLayout.tsx`（モーダルのグローバルマウント箇所、行 36-48）
- **Findings**:
  - `apiClient` は 401 検知時に `TokenRefreshManager` でリフレッシュを試行し、失敗時に `sessionExpiredCallback` を呼び出して `AuthContext.setSessionExpiredDuringOperation(true)` をトリガーする
  - `SessionExpiredModal` は `ProtectedLayout` でグローバルに mount されており、`sessionExpiredDuringOperation` フラグで isOpen を制御する
  - `handleReauthSuccess()`: モーダル内認証成功時にコールされ、`setSessionExpiredDuringOperation(false)` のみ実行（`sessionExpired` は触らない）
  - `navigateToLogin()`: モーダル内「ログイン画面へ移動」選択時にコールされ、`setSessionExpiredDuringOperation(false)` ＋ `setSessionExpired(true)`、トークンクリア
  - 既存のフォーム/ダイアログには「保存処理の自動リトライ」機構は実装されていない
- **Implications**:
  - Req 38 は新規モーダル不要。`useAuth().sessionExpiredDuringOperation` を購読して true → false の遷移を検知し、`pendingSaveOperationRef` を再実行するカスタムフック `usePendingSaveAfterReauth` を `ReceivedQuotationForm` に追加するだけで成立する
  - キャンセル相当の判定は `sessionExpired === true` で識別可能（ログイン画面遷移時のみ true になる）

### Topic: 並び替え UI の既存パターン

- **Context**: Req 37 のボタン配置に関するユーザー方針（quantity-table と統一＝アクションメニュー集約）の実装先例を確認する必要があった
- **Sources Consulted**:
  - `frontend/src/components/quantity-table/SortOrderButtons.tsx`（先例UI、行 1-115）
  - `quantity-table-generation` spec の数量項目アクションボタン統合方針
- **Findings**:
  - quantity-table は `SortOrderButtons`（縦三角▲▼ボタン）をアクションメニュー内に統合している
  - ボタンは `currentIndex` と `totalCount` で disabled 制御、`onMoveUp`/`onMoveDown` コールバック型インターフェース
  - 既存の共通フック・ヘルパは存在しない（move ロジックは各コンポーネント内に散在）
- **Implications**:
  - 受領見積書側では `SortOrderButtons` を直接流用せず、`LineItemActionMenu`（メニューパネル形式）の中に項目として組み込むのが UI 一貫性として最適と判断
  - 共通フック化は YAGNI 観点で本追記では行わず、`LineItemEditor` 内部に `handleMoveUp`/`handleMoveDown`/`reassignSortOrder` を実装する

### Topic: リサイズ可能 UI の既存実装と外部ライブラリ

- **Context**: Req 36 のリサイズ実装方針を決めるため、既存先例とライブラリ可用性を確認した
- **Sources Consulted**:
  - `frontend/package.json`
  - フロントエンド全体のスプリッター/リサイズ実装の grep
- **Findings**:
  - `react-resizable`/`react-resizable-panels`/`react-rnd`/`re-resizable` 等のリサイズ系ライブラリは未導入
  - フロントエンド全体にスプリッター/パネル分割の先例なし
  - ダイアログは `maxWidth: 95vw`/`width: 1400px`、`maxHeight: 90vh`、`overflow: auto` で内部スクロール対応
- **Implications**:
  - 新規ライブラリ導入は不要（要件 36 の挙動はブラウザ標準の Pointer Events で十分実装可能）
  - 既存の `maxHeight: 90vh` 制約は維持し、プレビュー単体の最大高は `min(800px, 70vh)` 程度の保守的な上限を設定する

## Architecture Pattern Evaluation

### リサイズ実装手段（Req 36）

| Option | 説明 | 強み | リスク・制約 | 採否 |
|--------|------|------|--------------|------|
| react-resizable / re-resizable 導入 | 既製ライブラリで縦リサイズを実装 | 実装速度、四方向リサイズの拡張性 | 新規依存追加（バンドルサイズ）、実質的に Pointer Events のラッパーで本ケースに過剰 | 不採用 |
| Pointer Events で自前実装 | カスタムフック `useResizableHeight` をプロジェクト内に実装 | 依存追加なし、要件に合致した最小実装 | 自前実装のメンテ責務（ただしロジックは ~80 行と限定的） | **採用** |
| CSS `resize: vertical` | CSS のみで縦リサイズハンドルを表示 | 実装極小 | localStorage への永続化が困難（読み取り専用に近い）、ハンドル位置・スタイルのカスタマイズが制限的、3 種類のプレビューに対する統一スタイル制御が困難 | 不採用 |

### セッション切れ時の編集保護方式（Req 38）

| Option | 説明 | 強み | リスク・制約 | 採否 |
|--------|------|------|--------------|------|
| (A) 再認証モーダル方式 | 401 検知 → SessionExpiredModal → 再認証成功 → 保存自動リトライ | 既存インフラの再利用率が高い（`SessionExpiredModal`、`AuthContext` を流用）。実装範囲が小さい | ナビゲート離脱・タブクローズには対応不可（→ 未保存変更ガードでブロック） | **採用** |
| (B) ローカルドラフト方式 | 編集中状態を localStorage 等に逐次保存し、復元 UI を提供 | ナビゲート離脱でも復元可能 | 並行編集との衝突管理（楽観的排他制御 Req 14.6 との整合）が複雑、復元確認 UI 増、ファイル（File オブジェクト）の永続化が困難 | 不採用（YAGNI / スコープ過大） |
| (C) ハイブリッド | A + B 両立 | 全シナリオ対応 | 実装・テスト・要件範囲が一番大きく、本追記スコープを超える | 不採用（将来検討） |

### 明細行アクションメニュー UI（Req 37）

| Option | 説明 | 強み | リスク・制約 | 採否 |
|--------|------|------|--------------|------|
| 行末トグル＋ポップオーバー | 三点リーダー（︙）アイコンで小メニューを開閉 | 表示密度が高く、quantity-table の方向と一致 | アクセシビリティ（フォーカス制御・Esc）の実装が必要 | **採用** |
| 行内に上下＋削除を直接配置 | itemized-statement-generation Req 17 と同様 | クリック数が少ない | 列が増え視認性が悪化（Req 33 で文字サイズも縮小予定のため特に問題） | 不採用（ユーザー Q2 で a を選択） |
| ドラッグ＆ドロップ | 行ヘッダ等を掴んで並び替え | 直感的 | アクセシビリティが弱い、誤操作リスク、要件 37 の明示「↑↓ボタン」要求と乖離 | 不採用 |

## Design Decisions

### Decision: localStorage キーの命名規約

- **Context**: Req 36 の縦幅永続化で localStorage キーの衝突を避ける必要があった
- **Alternatives Considered**:
  1. `previewHeight`（短い）
  2. `architrack:received-quotation:preview-height`（ドメイン階層付き）
- **Selected Approach**: `architrack:received-quotation:preview-height`
- **Rationale**: アプリ識別子＋機能ドメインを含めることで他機能・他アプリとの衝突を防ぐ。将来別画面（数量表など）に同種機能を追加する際もキー設計が一貫する
- **Trade-offs**: キーが長くなるが実用上の影響なし
- **Follow-up**: 他の永続化要素を追加する際も同じ規約（`architrack:<domain>:<key>`）を適用する

### Decision: pendingSaveOperation の保持方法（Req 38）

- **Context**: 再認証成功時に「直前の保存処理」を再実行する必要がある
- **Alternatives Considered**:
  1. `useState` で関数を保持
  2. `useRef` で関数を保持
  3. グローバルな保存キューを context に追加
- **Selected Approach**: `useRef<PendingSaveOperation | null>(null)` をフォーム内で保持
- **Rationale**:
  - useState で関数を保持すると render-on-set でアプリが再描画される一方、保存リトライは副作用なので ref で十分
  - グローバルキューは複数フォーム同時編集が想定されない本ユースケースでは過剰
  - 単一フォームに局所化することでスコープが明確
- **Trade-offs**: 他コンポーネント（OcrDataExtractor）からの保存リトライには対応しないが、要件範囲では保存以外の処理は再開不要（Req 38.11 注釈）
- **Follow-up**: 将来的に他のフォームで同パターンが必要になれば、本実装をコピー＆改名するか、`usePendingOperationAfterReauth` の汎用フックに昇格させる

### Decision: 上下移動時の sortOrder 採番方式（Req 37）

- **Context**: 配列を再順序化する際、sortOrder 値の付け方には「インデックス連番（0,1,2,...）」と「スパース（10, 20, 30...）」の選択肢がある
- **Alternatives Considered**:
  1. インデックス連番（0,1,2,3,...）
  2. スパース採番（10, 20, 30,...）で隙間に挿入
  3. 浮動小数点（小数を間に挿入）
- **Selected Approach**: インデックス連番（操作後に必ず `reassignSortOrder` で 0,1,2,... に正規化）
- **Rationale**: 受領見積書の明細行は通常 数十行未満で、毎回の配列全体を再採番してもパフォーマンス影響は無視できる。スパース採番や浮動小数は連続移動時の値の偏りや小数精度問題を引き起こすリスクがあり、シンプルさを優先
- **Trade-offs**: 1 行の移動でもサーバー送信時に lineItems 全体を更新する形になるが、既存の API 設計（受領見積書の lineItems は丸ごと送信して一括更新）と整合する
- **Follow-up**: 大量明細行（1000+）が現実的に発生する場合は再評価する

## Risks & Mitigations

- **Risk**: localStorage 容量不足/プライベートブラウジング/無効化により縦幅復元が機能しない
  - **Mitigation**: `try/catch` でアクセス失敗をトラップし、`RESIZE_DEFAULT_HEIGHT (400)` でサイレントフォールバック（Req 36.11）。エラー通知は出さない（UX 阻害防止）
- **Risk**: 保存リトライ時のペイロード不整合（再認証中に他クライアントが楽観的更新したケース）
  - **Mitigation**: HTTP 409 競合は再認証フローと別ハンドリング（Req 38.10）。`updatedAt` を含むエラーレスポンスから「最新読込」UI を提供
- **Risk**: アクションメニューのキーボード操作が不十分でアクセシビリティ低下
  - **Mitigation**: `role="menu"`/`role="menuitem"` の付与、フォーカス制御（展開時は最初の有効項目、Esc 閉じでトグルへ復帰）、ユニットテストでキーボード経路を確認
- **Risk**: `beforeunload` の警告ダイアログがブラウザ仕様変化により表示されない場合がある
  - **Mitigation**: 主要ガードはアプリ内 `confirm()`（Req 38.12）。`beforeunload` は補助ガードとして `e.preventDefault()` ＋ `e.returnValue = ''` を設定する標準パターンを踏襲
- **Risk**: 再認証中に複数の保存リトライが二重起動する
  - **Mitigation**: `isReauthInProgress` フラグで `handleSave` を早期 return（Req 38.4）。`pendingRef` は単一保持で、useEffect 内で実行後に必ず null クリア

## References

- 受領見積書ダイアログの現状実装: `frontend/src/components/estimate-requests/`
- 既存再認証モーダル: `frontend/src/components/SessionExpiredModal.tsx`、`frontend/src/components/ProtectedLayout.tsx`
- 既存認証コンテキスト: `frontend/src/contexts/AuthContext.tsx`
- 既存並び替え先例: `frontend/src/components/quantity-table/SortOrderButtons.tsx`
- 関連スペック: `.kiro/specs/itemized-statement-generation/requirements.md`（Requirement 17 内訳項目並び替え）、`.kiro/specs/quantity-table-generation/`（数量項目並び順とアクションメニュー集約）
- 関連スペック: `.kiro/specs/user-authentication/`（REQ-30 セッション切れ時のモーダル再認証）

---

# Gap Analysis（kiro-validate-gap, 2026-04-27）

**対象**: Requirements 36-38（受領見積書ダイアログ改善2）の実装着手前ギャップ分析
**目的**: design.md 追記6（design review Issue 1-3 修正済み）に対し、tasks 生成前に実装上の盲点・先例の活用可否・マイグレーション要否を整理する
**スコープ外**: Requirements 1-35（既に tasks-generated 段階で実装パターン確立済み）は対象外

## Current State Investigation

### 1.1 Domain assets 棚卸し（Req 36-38 関連）

| 領域 | 既存資産 | 場所 | 再利用形態 |
|------|----------|------|-----------|
| 受領見積書ダイアログ | EstimateRequestDetailPage 内のモーダル | `frontend/src/pages/EstimateRequestDetailPage.tsx:1167-1196` | 拡張（横幅・状態管理は維持） |
| ファイルプレビュー | FileInlinePreview コンポーネント | `frontend/src/components/estimate-requests/FileInlinePreview.tsx:1-746` | 拡張（`maxHeight` 固定値 → 動的 `height`） |
| 明細行エディタ | LineItemEditor コンポーネント | `frontend/src/components/estimate-requests/LineItemEditor.tsx:1-300+` | 拡張（sortOrder 追加、削除ボタン → アクションメニュー集約） |
| 受領見積書フォーム | ReceivedQuotationForm コンポーネント | `frontend/src/components/estimate-requests/ReceivedQuotationForm.tsx` | 拡張（保存リトライ・isDirty・未保存ガード） |
| 保存 mutation | EstimateRequestDetailPage 内ハンドラ | `frontend/src/pages/EstimateRequestDetailPage.tsx:763-794` | 既存 `createReceivedQuotation()`/`updateReceivedQuotation()` を呼び出す page-level ハンドラ |
| API クライアント | apiClient シングルトン（401 自動リフレッシュ＋ sessionExpiredCallback） | `frontend/src/api/client.ts:99-407` | そのまま再利用（拡張不要） |
| 認証コンテキスト | AuthContext | `frontend/src/contexts/AuthContext.tsx:50-68, 460-494` | `sessionExpiredDuringOperation`/`sessionExpired`/`handleReauthSuccess`/`navigateToLogin` を購読 |
| 再認証モーダル | SessionExpiredModal | `frontend/src/components/SessionExpiredModal.tsx:1-80+` | グローバルマウント済（ProtectedLayout）、改修不要 |
| 並び替えボタン UI 先例 | quantity-table の SortOrderButtons | `frontend/src/components/quantity-table/SortOrderButtons.tsx:1-115` | 設計時の参照（コピー流用ではなく LineItemActionMenu 内に再構成） |
| データモデル | Prisma `ReceivedQuotationLineItem.sortOrder: number \| null` | `backend/src/generated/prisma/models/ReceivedQuotationLineItem.ts:52, 59, 68, 83, 98` | スキーマ変更不要（型はすでに NULL 許容） |
| API 入出力型 | LineItemInput.sortOrder / LineItemInfo.sortOrder | `frontend/src/api/received-quotations.ts:33, 51, 61, 97, 112` | 既存（追加変更不要） |

### 1.2 テストインフラ

- **テストフレームワーク**: `vitest` + `@testing-library/react` + `@testing-library/user-event`
- **既存テストファイル**: `ReceivedQuotationForm.test.tsx`、`FileInlinePreview.test.tsx`、`LineItemEditor.test.tsx`、`OcrDataExtractor.test.tsx` が揃っている
- **モックパターン**: `ReceivedQuotationForm.test.tsx` は `FileInlinePreview` と `OcrDataExtractor` を `vi.mock()` で置換し、フォーム単体の振る舞いを検証する手法を確立済み
- **ユーザー操作シミュレーション**: `userEvent` ベース（`fireEvent` も併用）

### 1.3 規約・コード方針

- 各コンポーネントは関数コンポーネント＋ TypeScript（`export interface ComponentProps` を必須）
- スタイルはインラインの `React.CSSProperties` オブジェクトベース（CSS Modules や styled-components ではない）
- カスタムフックは同一ファイル内またはローカルに切り出して使用
- テストファイルは対象コンポーネントと同じディレクトリに `*.test.tsx` で配置

## Requirements Feasibility Analysis

### 2.1 Req 36（プレビュー縦幅リサイズ）

| 技術ニーズ | 現状 | 状態 |
|------------|------|------|
| ハンドルドラッグ実装 | リサイズ系ライブラリなし／先例なし | **Missing**（自前実装） |
| Pointer Events 利用 | ブラウザ標準 API、別箇所での先例なし | Constraint（jsdom テスト互換性に注意） |
| localStorage 永続化 | 他機能で使用例なし、Web Storage API 標準 | Missing（新規実装） |
| 動的高さ制御 | プレビューコンテナは `maxHeight: 固定px` | Constraint（既存スタイルを書き換え） |

**複雑度シグナル**: UI Affordance 系。算出可能で副作用少。**Effort: S（1-2日）／Risk: Low**。

**Research Needed**:
- jsdom 環境での Pointer Events シミュレーション手法（`fireEvent.pointerDown/pointerMove/pointerUp` 互換性）の確認 → 必要なら `@testing-library/user-event` の最新版で setPointerCapture 対応を確認

### 2.2 Req 37（明細行並び順保持・上下移動）

| 技術ニーズ | 現状 | 状態 |
|------------|------|------|
| sortOrder DB 列 | Prisma `sortOrder: number \| null` 既存 | **既存／NULL 許容**（防御要） |
| sortOrder API I/O | LineItemInput/Info に既存 | 既存 |
| sortOrder Form 内部型 | `LineItemFormData` に未追加 | Missing（型拡張） |
| 上下移動コールバック | LineItemEditor に未実装 | Missing（handleMoveUp/Down） |
| アクションメニュー UI | 行内に直接削除ボタン（既存）／メニュー化先例は quantity-table | Missing（LineItemActionMenu 新規） |
| 既存データの sortOrder 連続性 | Prisma 型が NULL 許容のため未保証 | **Constraint**（マイグレーション要検討） |

**複雑度シグナル**: 既存型・既存スキーマがあり、追加するのは UI ＋クライアント並び替えロジック。**Effort: M（3-5日）／Risk: Low-Medium**（NULL 既存データの扱いで実装段階で迷い得る）。

**Research Needed**:
- 既存の `received_quotation_line_items` テーブルに `sort_order` が NULL のレコードが実際に存在するか確認（DB クエリ）。存在する場合は (a) バックエンド取得時に配列インデックスから 0,1,2,... を補完する、または (b) one-shot マイグレーションで NULL を埋める、のどちらを採るか決定
- design review 時に決めた「フロントエンド側でも防御的に sortBySortOrder を呼ぶ」方針に対し、NULL を扱うソート関数の挙動を実装段階で確定する（NULL は「先頭扱い」「末尾扱い」「補完して順番」のどれか）

### 2.3 Req 38（編集中セッション切れ時の編集状態保護）

| 技術ニーズ | 現状 | 状態 |
|------------|------|------|
| 401 検知＋トークンリフレッシュ | apiClient に既存 | 既存（再利用） |
| 再認証モーダル UI | SessionExpiredModal 既存（ProtectedLayout で global mount） | 既存（再利用、改修不要） |
| sessionExpiredDuringOperation フラグ | AuthContext に既存 | 既存（購読のみ） |
| 保存処理の自動リトライ | 該当機構なし | **Missing**（usePendingSaveAfterReauth フック新規） |
| isDirty 算出 | 既存コンポーネントに未実装 | Missing（純粋関数 isFormDirty 新規） |
| ダイアログクローズ時の確認 | 該当機構なし | Missing（useUnsavedChangesGuard 新規） |
| beforeunload ハンドリング | 他機能に先例なし（要確認） | Missing（新規実装） |
| OCR/アップロード中 401 中断 | apiClient 経由なら自動。Tesseract.js（純クライアント）は対象外 | **Partial**（要件記述に注意） |

**複雑度シグナル**: 既存インフラ豊富で実装規模は小。ただし状態境界（フォーム state vs page state）と useEffect 依存の取り回しでバグが出やすい領域。**Effort: M（3-5日）／Risk: Medium**（再認証成功→自動リトライの useEffect 動線で取りこぼしがあると編集破棄事故に直結）。

**Research Needed**:
- ReceivedQuotationForm の現状の state 配置を再確認: `selectedFile`/`lineItems`/`name`/`submittedAt`/`netAmount` がフォーム内 state か、page から props 経由か。useEffect 配置箇所が決まる
- OcrDataExtractor が Claude Vision API 呼び出し時に `apiClient` 経由か、直接 fetch かを確認（後者なら 401 ハンドリングが効かない）
- beforeunload の `e.preventDefault()` ＋ `e.returnValue = ''` のブラウザ別挙動確認（最新 Chrome は returnValue 廃止予定の警告あり）

## Implementation Approach Options

### Option A: Extend Existing Components（採用）

各コンポーネントを拡張してサブフック・サブコンポーネント追加で対応。

**配分**:
- `FileInlinePreview` を拡張（`useResizableHeight` カスタムフック追加）
- `LineItemEditor` を拡張（`LineItemActionMenu` サブコンポーネント追加、sortOrder 関連ロジック追加）
- `ReceivedQuotationForm` を拡張（`usePendingSaveAfterReauth`、`useUnsavedChangesGuard` カスタムフック追加、isDirty 算出追加）
- `OcrDataExtractor` を拡張（sessionExpiredDuringOperation 購読＋ボタン disabled）

**Trade-offs**:
- ✅ 既存テスト・スタイル・モックパターンをそのまま活用可能
- ✅ コンポーネント数の増加が最小（新規追加は LineItemActionMenu 1点のみ）
- ✅ 影響範囲の特定とロールバックが容易
- ❌ `ReceivedQuotationForm` のサイズが膨らむ（既存も比較的大きい）— ただし responsibility はフォーム集約という単一目的内に収まる

### Option B: Create New Components

並び替え・リサイズ・セッション保護をそれぞれ独立した HOC やコンテナコンポーネントに切り出す。

**Trade-offs**:
- ✅ テスト容易性向上、責務分離明確
- ❌ プロジェクトの既存パターン（同一ファイル内のフック共置）と不整合
- ❌ 既存の単一ファイル方針から逸脱、レビュー認知コスト増
- ❌ 過剰抽象化（YAGNI）

### Option C: Hybrid（中間案）

並び替えだけ独立コンポーネント化し、その他は拡張。

**Trade-offs**:
- 並び替えは既に LineItemActionMenu として独立しているため、追加で切り出すべきものはなし
- 結局 Option A と同じ結果に収束する

**推奨: Option A**。design.md 追記6 が既に Option A を前提に組まれており、本ギャップ分析でも妥当性を確認できた。

## Out-of-Scope for Gap Analysis（design 段階で対応済み）

design.md 追記6 で既にカバー済みのため再分析不要:
- 各コンポーネントの内部 State Management 構造
- useResizableHeight / usePendingSaveAfterReauth / useUnsavedChangesGuard のフック設計
- ZOOM/RESIZE 定数値（min 200 / max min(800, 70vh) / default 400）
- localStorage キー仕様（`architrack:received-quotation:preview-height`）

## Implementation Complexity & Risk Summary

| Requirement | Effort | Risk | 主理由 |
|-------------|--------|------|--------|
| Req 36（プレビュー縦幅リサイズ） | **S（1-2日）** | **Low** | Pointer Events ＋ localStorage の標準 API のみ。useResizableHeight は ~80 行の小フック |
| Req 37（明細行並び順・上下移動） | **M（3-5日）** | **Low-Medium** | UI 追加 ＋ sortOrder 整合ロジック。既存データの NULL 値処理で迷う可能性あり |
| Req 38（セッション切れ時編集保護） | **M（3-5日）** | **Medium** | 既存インフラを使うが useEffect 依存と再認証成功検知の取り回しでバグが出やすい。Issue 3 と同種のリスク |
| **合計** | **M（合算 7-12日）** | **Low-Medium** | - |

## Recommendations for Tasks Phase

### 推奨アプローチ
- **Option A（既存コンポーネント拡張）** で進める。design.md 追記6 と整合
- タスクは Req 単位でグルーピングし、Req 37 の sortOrder 整合性ロジック（NULL 防御 + reassignSortOrder + 一括取り込み連携）を独立タスクとして切り出すと品質を担保しやすい
- Req 38 の自動リトライ機構は単体テスト可能なフック単位（`usePendingSaveAfterReauth`）でタスク化する

### Tasks 生成時に追加で確認すべき決定事項
1. **`sort_order` NULL データの扱い**: タスク内で「DB に対し既存データを 0,1,2,... に補完するマイグレーションを発行する」か「フロントエンド/バックエンドで読み取り時に補完する」のどちらかを決定（前者推奨：データ整合性が高まる）
2. **OcrDataExtractor の Claude Vision API 呼び出し経路**: タスク着手前に該当ファイルを確認し、`apiClient` 経由か否かを確定。Tesseract.js は純クライアント実行のため 401 検知不要、Claude Vision API は apiClient 経由なら sessionExpiredCallback 自動連鎖
3. **beforeunload の returnValue 設定方法**: 最新ブラウザの仕様変化を踏まえ、`e.preventDefault()` ＋ `e.returnValue = ''` の組み合わせで全主要ブラウザ（Chrome/Firefox/Safari/Edge）で確認警告が出ることをタスクの受入条件に含める
4. **Pointer Events のテスト方針**: jsdom + vitest で `fireEvent.pointerDown/pointerMove/pointerUp` が要求どおりに発火するか、タスクのユニットテスト時に挙動を確認。setPointerCapture が jsdom 未対応の場合はテストでスタブする

### Research Items to Carry Forward
- **R-1**: 既存 `received_quotation_line_items.sort_order` の NULL 件数調査（タスク段階で確認、必要に応じてマイグレーション SQL 起票）
- **R-2**: OcrDataExtractor の Claude Vision API 呼び出し実装の経路確認（apiClient 経由か直接 fetch か）
- **R-3**: jsdom + vitest 環境での Pointer Events シミュレーション挙動確認
- **R-4**: 既存 ReceivedQuotationForm の state 所有関係の最終確認（page 渡し vs 内部 state）

### Output Checklist 充足

- ✅ Requirement-to-Asset Map（1.1 表）
- ✅ Missing/Constraint タグ付き（2.1-2.3 表中の状態列）
- ✅ Options A/B/C と選定理由
- ✅ Effort（S/M/L）と Risk（Low/Medium）の justification
- ✅ Recommendations for next phase（Tasks 段階）
- ✅ Research Items（R-1 〜 R-4）

---

## Gap Analysis: Requirement 39 — 見積依頼における内訳書の任意化（2026-05-08）

### スコープ

数量表（内訳書）作成前に電話などの手段で取り急ぎ協力業者へ見積依頼を行うユースケースを成立させるため、見積依頼作成時の内訳書選択を必須から任意に変更する。受領見積書は従来通り紐付け可能とし、後段の見積書作成機能は受領見積書の内訳を活用する想定（本要件のスコープ外）。

### 1. Requirement-to-Asset Map（既存資産との対応）

| Req 39 AC | 既存資産（変更対象） | 状態 | 変更概要 |
|-----------|---------------------|------|----------|
| AC 1, AC 4（任意化＋NULL許容） | `backend/prisma/schema.prisma:875` `itemizedStatementId String` | Constraint | `String?` 化＋マイグレーション発行 |
| AC 1, AC 2（任意入力） | `backend/src/schemas/estimate-request.schema.ts:83-86` Zod `itemizedStatementId` 必須 | Constraint | `.optional()` 付与＋メッセージ調整 |
| AC 2, AC 3（保存ロジック分岐） | `backend/src/services/estimate-request.service.ts:51,79,190-282` `EstimateRequestService.create()` | Missing | 内訳書未紐付け分岐（ItemizedStatement findUnique・items 0 件チェック・EstimateRequestItem 自動初期化を条件付き化） |
| AC 1, AC 5（フォーム挙動） | `frontend/src/components/estimate-request/EstimateRequestForm.tsx:317,365-384,466-468,520(★),526,544,576-583` | Missing | `*` 必須マーカー削除、`hasNoItemizedStatements` を提出ボタン disabled 条件から除外、validate 関数の `itemizedStatementId` 必須チェック削除、内訳書未登録メッセージを「（任意）」に変更 |
| AC 6（一覧画面の「-」表示） | `frontend/src/pages/EstimateRequestListPage.tsx:312` `{request.itemizedStatementName}` | Missing | NULL 時に「-」表示する条件分岐 |
| AC 7（詳細画面の項目選択セクション非表示） | `frontend/src/pages/EstimateRequestDetailPage.tsx`（項目選択セクション）/ `frontend/src/components/estimate-request/ItemSelectionPanel.tsx` | Missing | `itemizedStatementId` 不在時にセクション非表示。「保存」ボタン（method変更）への動線は維持 |
| AC 8（Excel出力・本文含めるチェック非表示） | `frontend/src/components/estimate-request/ExcelExportButton.tsx` / `frontend/src/components/estimate-request/EstimateRequestTextPanel.tsx`（`includeBreakdownInBody` チェックボックス） | Missing | `itemizedStatementId` 不在時に非表示 |
| AC 9（本文【内容】の固定文言） | `backend/src/services/estimate-request-text.service.ts:249-298,303-360` `generateEmailBody`/`generateFaxBody` | Constraint＋Unknown | 現状実装は `includeBreakdownInBody=false` 時に項目セクションを単に省略する挙動。Req 6 AC 9 が指定する「添付内訳書の通り」表示は未実装（既存の仕様⇄実装ギャップ）。Req 39 AC 9 でも同 Req 6 AC 9 を参照しているため、本実装の前に仕様⇄実装の整合確認が必要（R-1） |
| AC 10（method 保存可能） | 既存の `update` フロー | OK | 内訳書未紐付けでも `updateEstimateRequestSchema` は影響なし（method・name のみ更新可能） |
| AC 11（受領見積書セクション利用可） | 既存の `received_quotations` リレーション・受領見積書系コンポーネント | OK | `EstimateRequest` の `receivedQuotations` リレーションは内訳書とは独立しているため変更不要 |
| AC 12（既存データ無変更） | 既存マイグレーション・データ | OK | `String?` 化は NULL 許容化のみで、既存行の `itemizedStatementId` は維持 |
| 編集画面の読み取り専用表示 | `frontend/src/pages/EstimateRequestEditPage.tsx:410-414` 「内訳書（読み取り専用）」 | Missing | 内訳書未紐付け時は当該ブロックを非表示またはプレースホルダ表示 |
| 型定義 | `frontend/src/types/estimate-request.types.ts`（`EstimateRequestInfo.itemizedStatementId` 等）/ backend types | Missing | nullable 化に追従（FE 型・BE 型両方） |
| API ドキュメント | `backend/src/routes/estimate-requests.routes.ts:92-105`（OpenAPI required リスト） | Missing | `required` から `itemizedStatementId` を除外、説明追記 |

### 2. 整合制約・既存パターン

- **マイグレーションパターン**: `backend/prisma/migrations/` は連番タイムスタンプ命名規則（例: `20260318200001_add_amendment_apply_history`）。ALTER COLUMN 系の単純変更は単独マイグレーションで実施するのが慣例。
- **Service 層**: `EstimateRequestService.create()` はトランザクション内で「取引先確認 → 内訳書確認 → 項目0件チェック → EstimateRequest 作成 → EstimateRequestItem 自動初期化 → 監査ログ」の6ステップ構成。本要件では2-4を条件付き化する形が最小侵襲。
- **監査ログ**: `auditLogService.createLog()` の `after.itemizedStatementId`/`after.itemCount` は nullable 化が必要（後者は 0 で代替可）。
- **テスト境界**: backend は service unit + routes integration、frontend は component test、e2e は Playwright spec。Req 39 では下記4箇所のテストに既存「内訳書必須」前提の assertion が含まれるため更新が必要。
  - `backend/src/__tests__/integration/routes/estimate-requests.routes.test.ts:246-266`（404/422 の前提）
  - `frontend/src/components/estimate-request/EstimateRequestForm.test.tsx:282-301, 324-333`（必須バリデーション、内訳書未登録時の挙動）
  - `e2e/specs/estimate-requests/estimate-request-e2e.spec.ts:569-582, 1529-1578`（内訳書選択フィールド表示／未登録メッセージ）

### 3. 実装アプローチオプション

#### Option A: 既存コンポーネント拡張（推奨）

- 既存の `EstimateRequest` モデル・サービス・コンポーネントに `itemizedStatementId` nullable パスを追加。
- 各画面コンポーネントで `itemizedStatementId` / `itemizedStatementName` の null チェックによる条件レンダリングを追加。
- フォームの validate / disabled / required マーカーから内訳書必須を除外。

**Trade-offs**
- ✅ 最小侵襲。既存パターン・既存テスト構造を踏襲できる
- ✅ Option A は CLAUDE.md「Don't add features beyond what the task requires」に整合
- ❌ 条件分岐が複数コンポーネントに散在するため、null パスのテストカバレッジを意識的に確保する必要あり

#### Option B: 内訳書なしモード専用画面/フォームの分離

- `EstimateRequestCreatePage` に「クイック見積依頼（内訳書なし）」モードを追加し、専用フォームを切り替え表示。

**Trade-offs**
- ✅ 各モードのフォーム責務が明確
- ❌ ユースケース差は「内訳書フィールドの有無のみ」なので過剰分離。コード重複が増える
- ❌ 既存テスト構造との不整合が発生

#### Option C: ハイブリッド（DB nullable + 仮想内訳書）

- DB は nullable 化するが、UI レイヤでは「空内訳書（items 0 件）」を自動生成して見かけ上必須を保つ。

**Trade-offs**
- ❌ ユーザーが意図しないダミー内訳書がデータとして残る（前回ユーザー回答「DBの itemizedStatementId nullable に変更する」で明示的に却下済み）
- ❌ 受領見積書の内訳を活用するフローと整合しない

→ **Option A を推奨**（前回のユーザー意思決定とも整合）。

### 4. Effort / Risk

| 項目 | 評価 | 根拠 |
|------|------|------|
| **総合 Effort** | **M（3〜5日）** | DB 1 マイグレーション + BE service/schema/route 3ファイル + FE 6〜7コンポーネント/ページ + 既存テスト更新（unit×3、integration×1、E2E×2）。新規パターン導入なし、既存マイグレーション・分岐パターン踏襲 |
| **総合 Risk** | **Low-Medium** | 既存の内訳書必須前提テストが多いため、`null` パスの assertion 漏れと、レスポンス型互換性（`itemizedStatementName` を `string` から `string | null` に変える際のフロント参照箇所網羅）に注意。マイグレーション自体は `DROP NOT NULL` 単一操作で低リスク |

### 5. Research Items（design 段階で確定）

| ID | テーマ | 内容 |
|----|------|------|
| R-39-1 | 本文【内容】セクションの仕様⇄実装整合 | Req 6 AC 9 が「添付内訳書の通り」表示を要求している一方、`estimate-request-text.service.ts` の現行実装は `includeBreakdownInBody=false` 時に項目セクションを完全省略している。Req 39 AC 9 が Req 6 AC 9 を参照しているため、design 段階で「仕様に合わせて実装変更する」か「実装に合わせて仕様を調整する」かを決定する。本要件のスコープを最小化するなら後者（Req 39 AC 9 を実装現状に合わせる）が無難 |
| R-39-2 | `EstimateRequestInfo.itemizedStatementId` / `itemizedStatementName` の型 | `string` から `string | null` に変える必要がある。フロント側の参照箇所（`EstimateRequestListPage.tsx:312`、`EstimateRequestDetailPage.tsx:1071-1072`、`EstimateRequestEditPage.tsx:413` 等）の null セーフ化を網羅 |
| R-39-3 | `includeBreakdownInBody` の制約 | 内訳書未紐付け時の `includeBreakdownInBody` の扱い。①保存時に強制 false、②UIで非表示・送信時 false、③DB の Boolean default false のままで実害なし、のいずれを採るか design で確定 |
| R-39-4 | 編集画面の挙動 | `EstimateRequestEditPage` は現状内訳書を変更不可（読み取り専用）。本要件で「内訳書なし→あり」を許可するか／既存通り変更不可とするか確定。ユーザー回答「後付け不要」より、編集での後付けは想定しない方針 |
| R-39-5 | EstimateRequestItem 自動初期化のスキップ | 内訳書未紐付け時は `EstimateRequestItem` を作成しないことを確定。後で内訳書を紐付ける機能はスコープ外（ユーザー回答）なので、`EstimateRequestItem` のレコードは「最初に内訳書ありで作成された見積依頼」に対してのみ生成される運用となる |
| R-39-6 | 監査ログ | `ESTIMATE_REQUEST_CREATED` の `after` ペイロードで `itemizedStatementId` / `itemCount` を nullable 化。監査ログ閲覧側の互換性（既存ログとの差分表現）を確認 |
| R-39-7 | EstimateRequestStatus の影響 | `BEFORE_REQUEST` / `REQUESTED` / `QUOTATION_RECEIVED` の遷移ロジックは内訳書非依存と仮定。design で確認 |

### 6. Recommendations for Design Phase

- **アプローチ**: Option A（既存コンポーネント拡張）を採用。データモデル変更（nullable 化）→ Service 層の条件分岐 → Schema/API ドキュメント → フロント条件レンダリング → テスト更新の順で設計。
- **Foundation タスク候補**: R-39-1〜R-39-7 の確定（特に R-39-1 は文言挙動を変えるため要件側との整合判断が必要、R-39-3 は API スキーマ確定の前提）。
- **データモデル先行**: Prisma スキーマ変更とマイグレーションは独立タスクとして先行実施可。後続の Service / FE タスクは生成後の Prisma 型に依存。
- **テスト更新**: Service unit テスト・Form コンポーネントテスト・E2E spec を「内訳書あり」「内訳書なし」両パスで網羅。既存の必須前提 assertion はリグレッションを避けるため strikethrough ではなく置換更新が望ましい。

### 7. Output Checklist 充足

- ✅ Requirement-to-Asset Map（§1 表、Missing/Constraint タグ付き）
- ✅ Options A/B/C と選定理由（§3）
- ✅ Effort / Risk と一行 justification（§4）
- ✅ Recommendations for next phase（§6、design 段階に持ち越す Research Items §5）
- ✅ Research Items（R-39-1 〜 R-39-7）

---

## Requirement 40 — 受領見積書OCRセクション折りたたみ機能 Gap Analysis (2026-05-11)

### 1. Current State Investigation

#### 対象アセット

| 領域 | パス | 役割 |
|------|------|------|
| 受領見積書 登録/編集フォーム | `frontend/src/components/estimate-requests/ReceivedQuotationForm.tsx` | ダイアログ本体。`selectedFile` または編集モードの `existingFilePreviewUrl` 存在時に `OcrDataExtractor` を `styles.ocrSection` 内に描画 |
| OCR 抽出コンポーネント | `frontend/src/components/estimate-requests/OcrDataExtractor.tsx` | 内部 state（`status` / `progress` / `extractedText` / `parsedLineItems` / `errorMessage` / `importCompleted` / `usedClaudeVision` / `fallbackActivated` / `fallbackReason`）を保持。`useEffect`（行 1128）でファイル変更時に OCR を自動起動 |
| 既存 styles | `ReceivedQuotationForm.tsx:301` `ocrSection: { marginTop: '16px' }` | ヘッダ・トグル領域なし。現状は単純な margin 付き div |
| ユニットテスト | `frontend/src/components/estimate-requests/ReceivedQuotationForm.test.tsx` | 既存テストファイル。Requirement 31-38 関連のテストが追加済み |
| E2E テスト | `e2e/specs/estimate-requests/received-quotation-dialog-improvements-e2e.spec.ts` | Req 31-38 を対象とするダイアログ改善 E2E。Req 40 もここに追加するのが自然 |

#### 既存 UI パターン（再利用候補）

| パス | 内容 |
|------|------|
| `frontend/src/components/estimate/EstimateItemTable.tsx:150-165` | `ChevronIcon({ isExpanded })` — `▶/▼` 風の三角アイコンを `transform: rotate` で表現。`aria-label={item.isExpanded ? '折りたたむ' : '展開する'}` を採用 |
| `frontend/src/components/estimate/EstimateItemTable.tsx:271-291` | 行クリックで `item.isExpanded` をトグル。`aria-label` で展開状態を明示 |
| `frontend/src/components/quantity-table/QuantityItemActionMenu.tsx:190` ほか | `aria-expanded={isOpen}` を多用。トリガー要素の ARIA 標準パターン |

> **所見**: 折りたたみ用の共通コンポーネントは存在しないが、`ChevronIcon` のローカル定義パターンとアクセシビリティ規約は確立済み。今回は独立した state ベースの折りたたみのため、`ReceivedQuotationForm` ローカルで同パターンを踏襲するのが最小コスト。

#### OCR コンポーネントの内部仕様（折りたたみ中 unmount 不可の根拠）

- `OcrDataExtractor` は **内部 state でしか OCR 進行状況・結果を保持しない**（外部 prop / ref に書き戻していない）。
- `useEffect` が `file` の参照変化で OCR を起動するため、unmount → remount すると OCR が **再起動** されるか、`autoStart={false}` 経路では **抽出結果が失われる**。
- 結果として、Req 40 AC 11/12（折りたたみ中も処理継続、結果は内部保持して展開時に表示）を満たすには、折りたたみ時に **コンポーネントを unmount せず CSS で隠す** 実装が必須。

### 2. Requirement-to-Asset Map

| Req 40 AC | 必要技術 | 対応アセット / ギャップタグ |
|-----------|---------|----------------------------|
| AC 1-2: 登録/編集にヘッダ表示 | UI 追加 | `ReceivedQuotationForm.tsx` の `ocrSection` ラッパー直下に新規ヘッダ要素 [Missing] |
| AC 3: ラベル + 視覚的指示子 | UI コンポーネント | `EstimateItemTable.tsx:150` の `ChevronIcon` パターン踏襲 [Constraint: 共通コンポーネント未抽出。ローカル実装で対応] |
| AC 4: クリックトグル | React state | `useState<boolean>` ローカル state [Missing] |
| AC 5: キーボード操作（Enter/Space） | a11y | `onKeyDown` ハンドラ + `role="button"` + `tabIndex={0}`、または `<button>` 要素 [Missing] |
| AC 6-7: 展開/折りたたみで本体表示制御 | スタイル制御 | `display: none` または `hidden` 属性（unmount 不可）[Constraint: §1 の OCR 内部 state 保持要件] |
| AC 8-9: デフォルト展開 | state 初期値 | `useState(true)` [Missing] |
| AC 10: 非永続化 | 仕様（実装するな） | `localStorage`/`sessionStorage` を**使わない**ことを保証 [Constraint] |
| AC 11: 折りたたみ中も OCR 処理継続 | コンポーネントライフサイクル | unmount しない（§1 参照）[Constraint] |
| AC 12: 抽出結果の内部保持 | コンポーネントライフサイクル | 同上 [Constraint] |
| AC 13: 処理中/完了/失敗いずれでも操作可 | 仕様 | ヘッダのトグル動作を `isProcessing` 等で無効化しない [Constraint] |
| AC 14: 表示条件未成立時はヘッダごと非表示 | 条件レンダリング | 既存の `selectedFile` / `existingFilePreviewUrl` 条件ラップを継承 [既存実装で対応可] |
| AC 15: 全ファイル種別対応 | UI 適用範囲 | ファイル種別による分岐は OcrDataExtractor 内部で処理済み。ヘッダ自体は MIME に依存しない [既存実装で対応可] |
| AC 16: フォーカス時の視覚的明示 | a11y / スタイル | `:focus-visible` または focus state スタイル [Missing] |
| AC 17: 既存機能への非影響 | リグレッション抑制 | 純粋に視覚的ラップを追加するだけのため、`selectedFile` / `lineItems` / `OcrDataExtractor` props / 保存ハンドラ等は変更なし [Constraint] |

### 3. Implementation Approach Options

#### Option A: ReceivedQuotationForm にローカル state + インライン UI を追加（推奨）

- 変更ファイル: `ReceivedQuotationForm.tsx` のみ
- 追加要素:
  - `const [isOcrSectionExpanded, setIsOcrSectionExpanded] = useState(true);`
  - セクションヘッダ JSX（クリック/キーボード対応、`aria-expanded`、`aria-controls`）
  - ヘッダ用 styles（`ocrSectionHeader`, `ocrSectionTitle`, `ocrSectionChevron`）
  - 本体ラッパーに `style={{ display: isOcrSectionExpanded ? 'block' : 'none' }}`
- **トレードオフ**:
  - ✅ 最小コスト、既存パターン（EstimateItemTable の ChevronIcon）と整合
  - ✅ OcrDataExtractor の props/ライフサイクルに一切手を入れない
  - ❌ 折りたたみ UI が他で再利用される未来があれば共通化機会を逸する（現状他に折りたたみ要件は存在しない）

#### Option B: 折りたたみ用の共通 `CollapsibleSection` コンポーネントを新規作成して適用

- 変更ファイル: `frontend/src/components/common/CollapsibleSection.tsx` 新規 + `ReceivedQuotationForm.tsx` で利用
- **トレードオフ**:
  - ✅ 将来 Req 4（項目選択セクション）など他セクションに展開しやすい
  - ❌ 新規コンポーネントぶんの設計・テスト・Storybook が必要で Effort が増える
  - ❌ 現状で他に折りたたみ要件が立っていない（過剰設計のリスク）

#### Option C: HTML `<details>` / `<summary>` 要素ベース

- 変更ファイル: `ReceivedQuotationForm.tsx` のみ。`<details>` で OCR セクション全体をラップ
- **トレードオフ**:
  - ✅ 実装最小、ブラウザ標準で a11y サポート（`open` 属性）
  - ❌ `<details>` の `open` をプログラマティックに `useState` と双方向同期させる必要があり、結局 state 管理が増える
  - ❌ ブラウザ標準スタイルとプロジェクトのデザイントークンの整合に追加スタイル調整が必要
  - ❌ `<details>` は閉じた時に内部 DOM を保持するためライフサイクル要件は満たすが、フォーム内のフォーカス管理（Tab 順）が暗黙的に変わるため Req 38 AC 12-13（未保存ガード）との挙動差分検証が増える

### 4. Effort & Risk

| 項目 | 評価 | 根拠 |
|------|------|------|
| **総合 Effort** | **S（1〜2日）** | UI 1 ファイル + state 1 個 + ユニットテスト 1〜2 件 + E2E 1 シナリオ。新規依存・新規 API・新規 DB なし |
| **総合 Risk** | **Low** | 既存ロジック（OCR/データパース/保存/未保存ガード/セッション保護）に対して読み取り専用のラッパー追加。最大の制約は「OcrDataExtractor を unmount しない」のみで、`display: none` で機械的に担保可能 |

### 5. Research Items（design 段階で確定）

| ID | テーマ | 内容 |
|----|------|------|
| R-40-1 | 折りたたみ実装方式 | `display: none` / `visibility: hidden` / `hidden` 属性 のいずれを採るか。`display: none` は Tab 順から外れるため未保存ガードの Tab 動作に影響なし、`visibility: hidden` は領域確保されるためレイアウト崩れ。`hidden` 属性は `display: none` 相当だが ARIA で隠す意図が明確。design で確定 |
| R-40-2 | アクセシビリティ実装 | ヘッダを `<button type="button">` で実装するか、`<div role="button" tabIndex={0}>` で実装するか。`<button>` がスクリーンリーダー対応とキーボード対応（Enter/Space）を自動取得するため第一候補。既存パターンとの整合（`EstimateItemTable.tsx:268-275` も `<button>` を使用）も確認のうえ design で確定 |
| R-40-3 | ChevronIcon の共通化 | 既存 `EstimateItemTable.tsx` ローカル定義の `ChevronIcon` を共通コンポーネントに抽出するか、`ReceivedQuotationForm.tsx` 内に同等の実装を再定義するか。Req 40 単体では再定義（Option A）が最小だが、抽出機会として design で判断 |
| R-40-4 | ヘッダラベル文言 | 「OCR / データパース」「OCR・データパース取り込み」「OCR セクション」など、ラベル文言を design で確定。ファイル種別（PDF/画像/Excel）に依存しない汎用文言が望ましい |
| R-40-5 | Req 38 AC 5（セッション切れ時の編集状態保持）への影響 | 再認証成功後にダイアログを保持したまま保存リトライする際、折りたたみ state（`isOcrSectionExpanded`）は内部 state なので Req 38 の編集状態保持に含めなくても破棄されない（ダイアログが unmount されないため）。design で念のため確認 |
| R-40-6 | テスト戦略 | ユニットテスト（`ReceivedQuotationForm.test.tsx`）でヘッダの存在・トグル動作・ARIA 属性を検証。E2E（`received-quotation-dialog-improvements-e2e.spec.ts`）で「折りたたみ → 再展開でも抽出結果が保持される」シナリオを検証。design で具体ケース確定 |

### 6. Recommendations for Design Phase

- **アプローチ**: Option A（既存コンポーネント拡張、ローカル state + インライン UI）を推奨。Effort S / Risk Low。
- **必須制約**: OcrDataExtractor を unmount せず、`display: none`（または `hidden` 属性）で隠すこと（R-40-1 で確定）。
- **a11y**: `<button type="button">` ベースのヘッダを推奨（R-40-2）。Enter/Space 自動対応 + `aria-expanded` + `aria-controls`。
- **追加 Boundary**: 本要件はビューの開閉のみを扱い、OCR エンジン・データモデル・API・既存ダイアログ機能（Req 31-38）には触れない。
- **テスト**: 単体「初期展開」「クリックで折りたたみ」「再クリックで再展開」「キーボード（Enter/Space）でトグル」「ARIA 属性」+ E2E「折りたたみ中も OCR 抽出結果が保持される」「ダイアログ再オープン時に展開状態に戻る」。

### 7. Output Checklist 充足

- ✅ Requirement-to-Asset Map（§2 表、Missing/Constraint タグ付き）
- ✅ Options A/B/C と選定理由（§3）
- ✅ Effort / Risk と一行 justification（§4）
- ✅ Recommendations for next phase（§6、design 段階に持ち越す Research Items §5）
- ✅ Research Items（R-40-1 〜 R-40-6）
