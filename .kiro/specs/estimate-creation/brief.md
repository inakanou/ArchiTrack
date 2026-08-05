# Brief: estimate-creation — 行操作とネスト構造の再設計

本書は既存spec `estimate-creation` に対する**改訂ディスカバリー**の結果である。新規specは作らず、本specの requirements / design / tasks を改訂して対応する。

改訂の柱は2つ。

1. **行操作とネスト構造の再設計** — サーバーリクエストの削減とローカル完結型の編集モデルへの移行
2. **PDF出力書式の刷新** — 実案件の見積書と同等の書式への準拠

参照資料は別ファイルに分離して記録した。

- `estimation-software-reference.md` — 行操作・階層構造の参照モデル（建設業向け積算ソフト）
- `pdf-format-reference.md` — PDF出力の目標書式（実案件の見積書PDFから抽出した寸法・配置・書式ルール）

## Problem

積算担当者が見積明細を編集する際、行の並び替えや階層の上げ下げのたびに画面が待たされる。1操作ごとにサーバーへ書き込みリクエストを送り、その直後に明細全件を再取得しているためで、**↑↓ボタンを10回押すだけで20リクエスト**が発生する。

さらに深刻なのはデータ喪失と不整合である。

- **未保存の編集が黙って消える**: 階層操作・並び替え・諸経費追加・転記系3ダイアログの計5経路が、完了後に明細をフル再取得して編集状態を上書きする。
- **DnD並び替えが永続化されない**: 保存処理から弾かれており、保存ボタンを押しても反映されない。
- **ロストアップデートが起きうる**: `batch` 更新APIが楽観ロック用の `updatedAt` を受け取りながら検証せずに捨てている。
- **画面のプレビューと実際の結果が食い違う**: NET案分・利益率適用は、プレビューをクライアントの編集中stateから計算する一方、実行はサーバーがDBから再取得した値で計算し直す。同じ計算が2箇所に実装されている。

また、階層構造を持つにもかかわらず折りたたみもツリー俯瞰も無く、行数が多い見積書では現在位置を見失う。行操作の起点がツールバーとDnDに限られ、キーボードだけで入力を完結できない。操作の取り消し手段も無い。

## Current State

### データモデル（`prisma/schema.prisma`）
- `EstimateItem`（`:1202-1226`）: `parentId` 自己参照（`onDelete: Cascade`）＋ `displayOrder: Int`（兄弟スコープ内、`@@unique` 無しで重複・歯抜けを許容）。`level` / `path` 等のマテリアライズド列は無い。`deletedAt` も無く物理削除。
- `EstimateItemLine`（`:1257-1280`）: `@@unique([estimateItemId, lineType])`。STANDARD は3行（ESTIMATE/EXECUTION/VENDOR）、DISCOUNT は ESTIMATE 1行のみ。**1項目 = 最大4レコード**。
- `Estimate`（`:1157-1175`）に `version` 列は無く、楽観ロックは `updatedAt` 比較方式。
- `ExecutionBudgetItem`（`:1586-1635`）が `estimateItemId` を `onDelete: SetNull` で参照。

### フロントエンド
- `frontend/src/hooks/useEstimateEditor.ts`(871行): `useState` ベースの編集状態と `pendingChanges: Map` による差分記録。**reducer / context / 状態管理ライブラリは不使用**。
- セル編集はローカル更新のみで通信ゼロ（この点は良好）。
- 一方、以下5経路は保存ボタンを経由せず即時にサーバーへ送り、直後に明細をフル再取得する:
  - `EstimateDetailPage.tsx:673-674` — `moveEstimateItem()` → `fetchData()`（階層上げ）
  - `EstimateDetailPage.tsx:723-724` — 同上（階層下げ）
  - `EstimateDetailPage.tsx:789-790` — `reorderEstimateItems()` → `fetchData()`（並び替え）
  - `EstimateDetailPage.tsx:843-844` — `addOverheadItem()` → `fetchData()`（諸経費行追加）
  - `EstimateDetailPage.tsx:886-888` — `handleTransferComplete()` → `fetchData()`。**受領見積書転記・NET案分・利益率適用の3ダイアログすべてがこれを `onComplete` に渡す**（`:1212`, `:1222`, `:1231`）
- `fetchData()`（`:627-643`）は見積書＋全明細＋全行をフル取得し、`editor.setItems()`（`:637`）で `pendingChanges` を全消去する。**上記5経路すべてで未保存の編集が消える。**
- 保存時は追加行を `for` ループ内 `await` で直列POST（`EstimateDetailPage.tsx:477-505`）。削除は子孫を個別DELETE（`useEstimateEditor.ts:688-693`）するが、サーバーは `onDelete: Cascade` のため親1件で足りる過剰送信。
- 保存後に必ず全件GET（`EstimateDetailPage.tsx:801-805`）。
- **DnD並び替えが永続化されない**: `useEstimateEditor.ts:768-769` が `recordChange(sourceId, 'update')` を `data` 引数なしで呼ぶため、保存側（`EstimateDetailPage.tsx:526-528`）の `if (latestItem)` で弾かれる。加えて `displayOrder` は batch スキーマに含まれていない。
- 明細グリッド `components/estimate/EstimateItemTable.tsx`(385行) は全階層をインデント表示。**展開／折りたたみは未実装**（REQ-2.5 が未達）。ツリー俯瞰・キーボードショートカット・Undo/Redo・範囲選択はいずれも存在しない。

### バックエンド
- `backend/src/routes/estimates.routes.ts`(2218行、**コントローラ層なしでルートに直書き**)、`backend/src/services/estimate-item.service.ts`(885行)
- 明細系エンドポイントは13個。`PUT /items/batch` は既存行の値更新のみで、作成・削除・親変更・`displayOrder` を扱えない。**フル状態同期エンドポイントが存在しない**。
- **`batch` の楽観ロック不発**: スキーマ `backend/src/schemas/estimate.schema.ts:248` は `updatedAt` を必須で受け取るが、ハンドラ `estimates.routes.ts:1021` が `const { items } = req.validatedBody` で読み捨てている。
- **`displayOrder` の再採番ロジックがサーバー側に無い**。`reorderItems`（`estimate-item.service.ts:571-593`）はクライアントの値をそのまま格納。`moveItem`（`:494-539`）は親を変えるだけで `displayOrder` を再計算しないため移動先の兄弟と重複する。
- **ループUPDATEによるN+1**: `estimate-item.service.ts:631-654`（明細100件で最大300 UPDATE）、`:584-588`（reorder）、`:541-560`（`getDescendantIds` のBFS `findMany`）、`:717/735/755`（転記ループ内の3クエリ×N）、`:773-790`（新規作成ループ）、`estimates.routes.ts:1568/1593/1606`（利益率適用のループ内 `findUnique`+`update`）。
- `batchUpdateItemsSchema` に配列長上限が無い（`estimate.schema.ts:228-249`）。
- `POST /items/:itemId/duplicate`（`estimates.routes.ts:925`）はフロントから未使用のデッドエンドポイント。

### 転記系4機能（本改訂の最大の統合リスク）

| 機能 | ルート | 書き込み | `Estimate.updatedAt` 更新 |
|---|---|---|---|
| 受領見積書転記 | `estimates.routes.ts:1250` → `estimate-item.service.ts:663-800` | あり（VENDOR行更新＋新規項目作成） | あり |
| NET案分 | `estimates.routes.ts:1386-1461`（ルート内直書き） | あり（EXECUTION行更新） | あり（`:1456-1459`） |
| 利益率適用 | `estimates.routes.ts:1526-1622`（ルート内直書き） | あり（ESTIMATE行更新） | あり（`:1618-1621`） |
| 諸経費計算 | `estimates.routes.ts:1701` | **なし（計算のみ）** | なし |
| 諸経費行追加 | `estimates.routes.ts:1859` | あり | あり |
| 値引き行追加 | `estimates.routes.ts:1961` | あり | あり |

- **`POST /:id/calculate-overhead`（`:1701`）は既に「計算のみ・書き込みなし」であり、本改訂が目指す形の前例になっている。**
- ダイアログは props で `items`（**編集中のクライアント state**）を受け取り、`line.id`（DB UUID）を収集してサーバーへ送る（`NetAllocationDialog.tsx:31/169-176/217/271-276`、`ProfitRateDialog.tsx:151-158`、`TransferQuotationDialog.tsx:203-207`）。
- `NetAllocationDialog.tsx:234-259` が**クライアント側に案分計算を実装**している（比率 = 行金額 ÷ 対象合計、`ROUND_HALF_UP`）。サーバー `estimates.routes.ts:1403-1420` は DB から再取得して計算し直す。**同じ計算が2箇所にある。**

### 参照すべき既存の理想形（同一リポジトリ内）
数量表機能が同じ課題を解決済み。
- `backend/src/services/quantity-table.service.ts:945-1107` `saveDraft()` — トランザクション前の全件バリデーション（`:951`）、`expectedUpdatedAt` 楽観ロック→409（`:982-991`）、ペイロードに無い既存の `deleteMany`（`:1000-1004`, `:1051-1057`）、既存 `update` ＋ `id:null` の `create`、**配列順を正とする `displayOrder` 再採番**（`:1015`, `:1062`）、単一 `$transaction`（`:955`）、保存後の最新詳細を返却（`:1103`）。
- `frontend/src/pages/quantityTableEditReducer.ts` — 全行操作が0リクエストの純粋reducer（アクション定義 `:179-200`、`copyItem` `:343`、`duplicateDraftItem` `:607`）。
- `frontend/src/pages/QuantityTableEditPage.tsx:1367, 1424` — 保存は1回だけ呼び出す。

### 反面教師
実行予算機能は1セル1リクエスト方式（`backend/src/routes/execution-budget.routes.ts:189`、`frontend/src/api/execution-budget.ts:281`）。今回のモデルにはしない。

### PDF出力（現行は backend 生成: `backend/src/services/estimate-export.service.ts`、jsPDF 4.1.0）
- **日本語フォントが未埋め込み**。`addFont` / `addFileToVFS` の呼び出しが無く、バックエンド側にフォント資産も存在しない。jsPDF の標準フォントは WinAnsi のみのため、**現状の日本語PDF出力は文字化けまたは空白になる**。
- 一方で**フロントエンドには Noto Sans JP が埋め込み済み**（`frontend/src/services/export/fonts/noto-sans-jp-base64.ts`、バイナリ 2,255,812 bytes の TrueType）。`PdfFontService.ts:120-126` が `addFileToVFS` → `addFont` → `setFont` を実行する。**日本語PDFを出せる資産は既にフロントエンドだけにある。**
- 用紙は `orientation: 'portrait'`（A4縦、`:173`）。目標書式は **A4横**。
- 列は 名称60 / 規格40 / 単位15 / 数量20 / 単価25（mm、`:100-105`）の5列で、**金額・備考の幅定義が無い**。目標は7列。
- **罫線を一切描画していない**（`doc.text` のみ）。
- ページ構成は 表紙 → 項目一覧 → 階層ごとの詳細（`:179-186`）。目標は 表紙 → 内訳書 → 明細書。
- 表紙は表題・プロジェクト名・見積名・日付・合計のみ（`:444-472`）。目標書式は宛先・網掛け表題・全角金額・工事件名/場所・別途工事欄・自社情報ブロックを持つ。
- 数量は `toString()` そのまま（`:596`）、文字は固定文字数で切り詰め（`truncateText(name,20)` / `(spec,15)`、`:587-591`）。
- 合計行・フッタ・値引行・注記行・単位の `〃` 置換はいずれも未実装。

### 参照すべき既存の理想形（PDF出力）
現場調査報告書・数量表・見積依頼はいずれも**フロントエンドで jsPDF を使う構成**で、目標書式に必要な部品が揃っている。

- `frontend/src/services/export/PdfFontService.ts` — Noto Sans JP の jsPDF 登録（`PDF_FONT_FAMILY = 'NotoSansJP'`）
- `frontend/src/services/export/QuantityTablePdfExportService.ts` — `TABLE_COLUMNS`（`:92`）、`doc.rect`（`:240, :302`）・`doc.line`（`:316, :368`）による**罫線描画**、改ページ判定（`:280-281`）
- `frontend/src/services/export/PdfReportService.ts` — `renderCoverPage`（`:248`）等のページ単位レンダリング
- `frontend/src/services/export/PdfExportService.ts` — `downloadPdf` / `generateDefaultFilename` / 進捗通知
- 呼び出し元の前例: `SiteSurveyDetailInfo.tsx:323`、`QuantityTableEditPage.tsx:40, 43`、`EstimateRequestDetailPage.tsx:57`

詳細な寸法・配置・実装方式・現行とのギャップ一覧は `pdf-format-reference.md` を参照。

## Desired Outcome

- 見積明細の編集セッション中、**行操作によるサーバーリクエストがゼロ**になる。挿入・削除・複写・並び替え・DnD・階層上げ下げ・範囲選択がすべてクライアントのメモリ内で完結する。
- **保存は1リクエスト**で完了する。保存レスポンスが最新の明細階層を返すため、保存後の追加GETが不要になる。
- 転記系4機能もサーバーへ書き込まず、結果はクライアント編集stateへ反映され通常の保存で永続化される。**未保存の新規行も転記対象にできる**。
- どの操作でも未保存の編集が消えない。DnD並び替えが保存で永続化される。複数人編集は後勝ちで黙って上書きされるのではなく409で検知される。
- **画面のプレビューと実際に反映される結果が常に一致する**。
- 明細グリッドの階層表示を**ツリー表示とドリルダウン表示で切り替えられる**。常にツリーパネルで全体構造を俯瞰でき、目的の行へジャンプできる。
- **キーボードだけで行操作と階層移動が完結する**。誤操作は Undo/Redo で取り消せる。
- サーバー側の明細更新が明細件数に比例した個別UPDATEではなく一括処理になる。明細の書き込み経路が新エンドポイント1本に集約される。

## Approach

数量表の `saveDraft` パターンを横展開し、その上に建設業向け積算ソフトのナビゲーション体系を重ねる。実装は3段階に分け、tasks.md 内でフェーズ見出しにより区別する（spec は分割しない）。

### 段階1: ローカル完結編集とバッチ保存

**バックエンド**
1. `PUT /api/estimates/:id/save` を新設。ペイロードは明細ツリーのフル状態（新規は `id: null` ＋ `tempId`、既存はUUID）。
2. トランザクション開始前に全件バリデーション（書き込みゼロで中断可能）。
3. `expectedUpdatedAt` と `Estimate.updatedAt` を比較し、不一致なら409。
4. 単一 `$transaction` 内で差分適用: ペイロードに無い既存項目を `deleteMany`（子孫は `onDelete: Cascade` に委ねる）→ 既存を更新 → `id: null` を作成。**`ExecutionBudgetItem` の紐付けを切らないよう既存IDは維持する**。
5. `displayOrder` は**ペイロードの配列順を正として再採番**。`parentId` の解決は `tempId` → 生成IDのマップで行う。
6. 更新は `updateMany` / `$executeRaw` の VALUES 一括UPDATEでN+1を解消。
7. 保存後の最新階層を返却。
8. 旧エンドポイント（`POST /items`、`DELETE /items/:itemId`、`PATCH /items/:itemId/move`、`PUT /items/reorder`、`PUT /items/batch`、未使用の `POST /items/:itemId/duplicate`）を撤去。

**フロントエンド**
1. `useEstimateEditor` を `quantityTableEditReducer.ts` 相当の**純粋reducer**へ置換。アクション: `insertRow` / `deleteRow` / `duplicateRow` / `moveRow` / `indentRow` / `outdentRow` / `reorderByDnd` / `updateLineField` / `selectRange` / `setItems`。
   - **段階2の Undo/Redo が成立するよう、全アクションを副作用のない純粋関数として実装する。**
2. `EstimateDetailPage.tsx:651/683/738` の即時API呼び出し＋`fetchData()` を撤去しローカルディスパッチへ置換。
3. 保存は `saveEstimateDraft()` を1回呼ぶだけにし、レスポンスの最新階層で状態を差し替える（追加GETなし）。
4. 親項目の集計金額（`recalculateParentAmounts`）をローカル再計算し保存ペイロードに含める。現状は編集対象1項目しか変更記録に載らず親の集計がDBに反映されない問題も解消する。

### 段階2: 階層ナビゲーションとキーボード操作

1. **表示状態の分離**: 「編集状態（明細ツリー）」とは別に「表示状態（表示モード・現在階層・選択範囲・展開状態・カーソル位置）」を持つ。表示状態は保存ペイロードに含めない。
2. **表示モード切替**: 同一ツリーに対する2つのビューとして実装する。
   - ツリー表示: 現行の全階層インデント表示 ＋ 展開／折りたたみ（REQ-2.5 の実装）
   - ドリルダウン表示: 現在階層の子ノード配列のみを描画。パンくずで現在位置を示し上位へ戻れる
3. **階層ナビゲーション**: 階層上／階層下／前の階層／次の階層／階層内の先頭行・最終行。
4. **ツリーパネル**: 全体構造の俯瞰、展開／折りたたみ、全て開く／全て閉じる、ジャンプ。
5. **キーボードショートカット体系**: 建設業向け積算ソフトの割当を土台に、ブラウザ標準機能と衝突しないキーへ調整して定義する。キー割当をコンポーネントに散らさず単一のキーマップ定義に集約し、フォーカス文脈ごとに解決する。
6. **範囲選択**: 連続する複数行の選択と、選択範囲に対する削除・複写・階層上げ下げ。
7. **Undo/Redo**: 有限リングバッファ（建設業向け積算ソフト準拠で10件）。サーバー通信は発生しない。

### 段階3: 転記系機能の統合

1. **計算ロジックの単一化**: 案分・利益率・諸経費の計算を1実装に統一する。**Decimal の丸め挙動（`ROUND_HALF_UP`、`toDecimalPlaces(0)`）を既存と完全に一致させることが必須**。
2. **入力を行IDからクライアント行データへ変更**: `targetLineIds`（DB UUID）ではなく、クライアントが保持する行の値と識別子（`id` または `tempId`）を渡す。これにより未保存の編集値と新規行が対象に含まれる。
3. **反映をreducerアクション化**: 転記結果を明細ツリーへ適用するアクションを追加する。純粋関数として実装し Undo/Redo の対象にする。
4. **受領見積書の読み取りはサーバーのまま**: 外部データのため取得（GET）は必要。ただし**見積側への反映はクライアントで行い書き込みはしない**。
5. **書き込み系エンドポイントの撤去**: `POST /:id/transfer-quotation`、`POST /:id/calculate-net`、`POST /:id/apply-profit-rate`、`POST /:id/overhead-items`、`POST /:id/discount-items` の書き込み処理を廃止する。
6. **`fetchData()` 呼び出しの撤去**: `handleTransferComplete`（`:886-888`）と `handleAddOverheadItem`（`:843-844`）を reducer ディスパッチへ置換する。
7. **上書きオプションの維持**: 利益率適用の `overwriteOption`（`all` / `empty_only` / `unit_price_only`、`estimates.routes.ts:1580-1620`）の3分岐をクライアント側で完全に再現する。

> **段階1と段階3は同一リリースで揃える必要がある。** 転記系がサーバー側で `Estimate.updatedAt` を更新している限り、段階1が導入する `expectedUpdatedAt` 楽観ロックは転記実行のたびに陳腐化して409を返す。段階1のみを先行リリースする場合は、未保存変更がある間は転記系ダイアログの起動を抑止する暫定ガードが必須。

### テスト
- E2Eに **Playwright の `page.route` によるリクエスト回数アサーション**を導入する。行操作を複数回行っても書き込みリクエストが0件、保存で1件であることを検証する。
- 現在E2Eが無い「行削除」「行複写」「DnD並び替えの永続化」を追加する。
- `e2e/specs/estimate/estimate-hierarchy-move-e2e.spec.ts` の旧API直叩きテストを新APIへ移行し、UI操作経由の検証を追加する。
- 転記系5経路について、(a) 適用時に書き込みリクエストが0件、(b) 未保存編集がある状態で適用しても編集が消えない、(c) 未保存の新規行が対象に含まれる、(d) 適用後の保存が1リクエストで成功し409にならない、(e) プレビュー表示値と保存後のDB値が一致する、を検証する。

## Scope

- **In**:
  - 見積明細の全行操作（挿入・削除・複写・並び替え・DnD・階層上げ下げ・範囲選択）のクライアントローカル完結
  - `PUT /api/estimates/:id/save`（フル状態同期・事前バリデーション・`expectedUpdatedAt` 楽観ロック・差分適用・配列順による `displayOrder` 再採番・`tempId` による親子解決・最新状態返却）
  - サーバー側ループUPDATEの一括化と `getDescendantIds` のBFS解消
  - 旧明細APIエンドポイント6本の撤去
  - 保存後の追加GET撤廃
  - 階層表示のモード切替（ツリー表示 ⇔ ドリルダウン表示）とモードの永続化
  - ツリー表示における展開／折りたたみ（REQ-2.5 の実装）
  - ドリルダウン表示とパンくずによる現在位置表示・上位階層への復帰
  - 階層ナビゲーション操作（階層上／下／前／次／階層内先頭行・最終行）
  - ツリーパネル（全体構造表示、展開／折りたたみ、ジャンプ）
  - キーボードショートカット体系の定義と実装
  - 複数行の範囲選択と、選択範囲に対する削除・複写・階層上げ下げ
  - Undo/Redo（10回のリングバッファ）
  - 転記系5経路（受領見積書転記・NET案分・利益率適用・諸経費追加・値引き追加）の書き込みを保存経路へ一本化
  - 案分・利益率・諸経費の計算ロジックの単一実装化
  - 既存不具合の修正: DnD非永続化（`useEstimateEditor.ts:768`）、`batch` 楽観ロック不発（`estimates.routes.ts:1021`）、5経路による未保存編集の消失、親項目の集計金額がDBに反映されない問題、案分プレビューと実行結果の食い違い
  - リクエスト回数アサーションを含むE2E拡充
  - **PDF出力書式の刷新**（`pdf-format-reference.md` に準拠）: A4横、7列の罫線グリッド（17明細行＋合計行の固定18行）、表紙／内訳書／明細書の3種ページ、合計行・フッタ・値引行・注記行、数量の小数点位置揃え、単位の `〃` 置換、全角金額表記
  - **PDF生成をバックエンドからフロントエンドへ移行**: 現場調査報告書・数量表と同じ構成（`PdfFontService` / `QuantityTablePdfExportService` / `PdfExportService` の再利用）。バックエンドの PDF 生成部（`estimate-export.service.ts` の `exportToPdf` / `exportToPdfWithLineTypes` / `generateCoverPage` / `generateSummaryPage` / `generateDetailPages` / `drawTableHeader` / `drawTableRow`）とその単体テストを撤去

- **Out**:
  - **行属性（小計・中計・大計・値引・経費・積上合計 等19種）の導入**
  - **アプリ内カットバッファ**（追加切り取り／追加コピーによる複数階層からの寄せ集め）
  - **テンプレート**（サブツリーの永続スニペット）
  - **階層単位のテキスト／クリップボード入出力**
  - 明細入力制御3モード、IME制御、表示行数モード切替、入力順のカスタマイズ
  - 階層ごとのページ書式割当、隠れ階層
  - 同一見積書の複数ウィンドウ同時編集
  - 自動下書き保存、未保存状態のローカル永続化（IndexedDB等）
  - 案分・利益率・諸経費の**業務ルールそのものの変更**（比率算出方法、丸め桁、プリセット料率）。挙動は現行と一致させる
  - 受領見積書機能（`estimate-request` spec）側の変更。読み取りのみ利用する
  - 実行予算機能（`execution-budget-management`）の1セル1リクエスト方式の是正
  - 数量表機能（`quantity-table-generation`）側の変更
  - Excel出力の書式変更（参照PDFはPDF出力の書式のみを規定する）
  - サマリーパネル、画面上の数値表示形式への変更

## Boundary Candidates

- **保存ペイロードのスキーマ**: クライアントの編集状態表現とサーバーの差分適用ロジックの契約点。最初に確定させる。
- **reducerのアクション体系**: UI（ツールバー・DnD・キーボード・転記ダイアログ）とドメインロジックの境界。UIが何であれ同じアクションに落ちる。
- **編集状態と表示状態の分離**: 表示状態はサーバーへ送らない。この線引きが段階2の前提。
- **ビューとデータの分離**: ツリー表示・ドリルダウン表示・ツリーパネルは同一ツリーに対する3つの投影。データ変換関数として切り出す。
- **`displayOrder` の権威**: サーバー側（ペイロード配列順）に一元化する。クライアントは順序を持つ配列だけを保証する。
- **行の識別子**: `id`（既存）と `tempId`（新規）を統一的に扱う表現。保存ペイロードと転記ダイアログで同じ表現を使う。
- **計算と適用の分離**: 「計算結果を得る」と「明細ツリーへ適用する」を分ける。前者は純粋計算、後者は reducer アクション。
- **ツリー構造の検証**: 循環参照・孤児ノード・深さの検証はクライアント（操作を禁止）とサーバー（受領時に検証）の両方で持つ。

## Out of Boundary

- 行の意味論（行属性による集計の打ち切りなど）を導入しない。集計ルールは現行のまま。
- 業務計算の仕様変更は行わない。丸め・比率算出・プリセット料率は現行と一致させ、差分が出たら不具合として扱う。
- 印刷・出力レイアウトに階層表示モードを反映させない。
- 明細セル内の入力挙動（IME、入力順、フォーカス遷移テーブル）は現行のまま維持する。
- 転記系ダイアログのUIレイアウト・操作フローの再設計は行わない（入力元とデータの渡し方のみ変える）。
- 見積書本体（名称・プロジェクト紐付け）のCRUDには手を入れない。

## Upstream / Downstream

- **Upstream**:
  - `quantity-table-generation` spec — `saveDraft` パターンの実装リファレンス（機能的な依存はなく設計の参照のみ）。変更しない
  - `estimate-request` spec — 受領見積書の明細データ供給元。読み取りのみ利用し変更しない
  - `prisma/schema.prisma` の `Estimate` / `EstimateItem` / `EstimateItemLine` モデル
- **Downstream**:
  - `execution-budget-management` — `ExecutionBudgetItem.estimateItemId`（`onDelete: SetNull`）の参照が切れないことが前提。将来、同じフル状態同期パターンとナビゲーション体系の横展開候補
  - `itemized-statement-generation` — `Estimate.sourceItemizedStatementId` はFKではなく参照情報スナップショットのみ。影響なし
  - 将来の拡張候補（今回スコープ外）: 行属性、カットバッファ、テンプレート、階層単位のテキスト入出力。いずれも本改訂が定義するナビゲーション基盤と選択モデルの上に載る

## Existing Spec Touchpoints

新規specは作成せず、本spec内で完結させる。**改訂対象の既存要件**は以下。

### 改訂（Revise）
| REQ | 表題 | 改訂内容 |
|---|---|---|
| REQ-2 | 見積項目ネスト構造 | 2.5 の展開／折りたたみを実装対象化。表示モード切替を追加 |
| REQ-4 | 受領見積書転記 | 書き込み経路をクライアント反映＋通常保存へ変更 |
| REQ-5 | NET金額計算と案分 | 同上。計算ロジックの単一化を明記 |
| REQ-6 | 利益率による見積金額反映 | 同上。`overwriteOption` 3分岐のクライアント再現 |
| REQ-7〜9 | 共通仮設費／現場管理費／一般管理費プリセット | 行追加をクライアント側へ |
| REQ-12 | 見積項目操作 | 全操作をローカル完結に。12.2 DnD の永続化、12.6 親変更の扱いを改訂 |
| REQ-17 | 受領見積書転記UIの改善 | 入力元をクライアント行データへ |
| REQ-18 | NET金額案分ダイアログ | 同上。未保存の新規行を対象化 |
| REQ-19 | 利益率適用ダイアログ | 同上 |
| REQ-23 | 見積項目操作ツールバー | キーボード操作・範囲選択・表示モード切替を追加 |
| REQ-27 | 保存ボタンとクライアントサイド編集 | フル状態同期・1リクエスト保存・楽観ロックを明記 |
| REQ-29 | 親項目の単価自動計算制御 | 親の集計金額がDBへ反映される形に |
| REQ-30 | 受領見積書転記ダイアログの選択肢改善 | 入力元の変更に追従 |
| REQ-31 | NET案分ダイアログの受領見積書情報表示 | 同上 |
| REQ-33 | 案分対象行の合計金額表示 | プレビューと結果の一致を保証 |
| REQ-34 | 保存と再読み込みの整合性 | DnD並び替えの永続化を追加 |
| REQ-36 | NET金額の自動設定 | 入力元の変更に追従 |
| REQ-37 | 利益率のデフォルト値設定 | 同上 |
| REQ-41 | 値引きプリセット行 | 行追加をクライアント側へ。PDF出力の `【値引】` 行と対応付ける |
| REQ-10 | 見積書出力 | **PDF書式を `pdf-format-reference.md` に準拠**。A4横・罫線グリッド・表紙/内訳書/明細書の3種ページ。**生成をバックエンドからフロントエンドへ移行** |
| REQ-32 | 見積書出力の行タイプ選択 | 新書式との整合。実行金額行・業者金額行を出力する場合の表組みを規定 |
| REQ-38 | 出力のデフォルト設定と空欄行処理 | 固定18行グリッドにおける空行の扱いを規定 |

### 撤廃（Remove）
| REQ | 表題 | 理由 |
|---|---|---|
| REQ-24 | 見積項目の階層移動APIエンドポイント | `PATCH /:id/items/:itemId/move` の廃止に伴い撤廃。階層移動はローカル操作となりAPIを持たない |

### 新設（Add — REQ-42 以降）
- 明細のフル状態同期保存（差分適用・楽観ロック・`displayOrder` 再採番・最新状態返却）
- 階層表示モードの切替とドリルダウン表示
- ツリーパネル
- キーボードショートカット体系
- 複数行の範囲選択と範囲操作
- Undo/Redo
- 表紙の記載項目（宛先・工事件名/場所・別途工事欄・自社情報・有効期限・税注記）
- 明細中の注記行

### 影響を確認するが変更しない
REQ-14（画面構成）、REQ-15（パンくずナビゲーション）、REQ-21（画面レイアウトの改善）、REQ-28（表示行フィルター）、REQ-39（サマリーセクション）、REQ-40（テキストフィールドのコンパクト化）

### spec.json の扱い
現在 `phase: tasks-generated`、requirements / design / tasks とも `approved: true`、`tasks.md` は172件すべて完了（未完了0）。要件改訂にあたり承認フラグをリセットし、3フェーズの承認フローを再度通す。`tasks.md` には既存の完了済みタスクを残したまま、新規タスクをフェーズ見出し（段階1／段階2／段階3）配下に追記して区別する。

## Constraints

- 新規ライブラリの導入は行わない。既存の React + Vite / Express + Prisma / Playwright / `decimal.js` の範囲で実装する。
- `EstimateItem` は隣接リスト表現を維持する（`level` / `path` の追加は行わない）。深さ・パンくず・祖先はクライアント側でツリーを走査して算出する。**行数が多い見積書での再計算コストに配慮する。**
- 楽観ロックは `Estimate.updatedAt` 比較方式（`EstimateItem` に `version` 列は無い）。
- 差分適用は既存IDを維持する方針とし、`ExecutionBudgetItem.estimateItemId`（`onDelete: SetNull`）の紐付けを切らないこと。
- 1項目 = 最大4レコード（item + 3 lines）のため、更新は必ず一括化する。
- `EstimateItemLine` は `@@unique([estimateItemId, lineType])` の制約を持つ。DISCOUNT 項目は ESTIMATE 行のみを持つため、転記対象から適切に除外する。
- **転記系の計算結果は現行と完全に一致させること**。`ROUND_HALF_UP` / `toDecimalPlaces(0)` の丸め、比率算出時のゼロ除算回避（`totalAmount.isZero()` の分岐）、数量がゼロまたは未設定の場合の単価算出（`estimates.routes.ts:1436-1441` の分岐）を含む。
- **サーバー側で `Estimate.updatedAt` を更新するのは保存経路のみとすること。**
- 保存モデルは**明示保存のみ**。自動保存は導入しない。Undo/Redo はサーバー通信を伴わない。
- **ブラウザ標準ショートカットとの衝突を回避する。** 建設業向け積算ソフトのファンクションキー割当（F1 等）をそのままは使えないため調整版キーマップを定義し、画面上に一覧を提示する。
- 表示モードの導入により既存E2Eのセレクタが影響を受ける場合は、**既定モードを現行のツリー表示として互換を保つ**。
- 既存E2E資産（`e2e/specs/estimate/` 約8,500行）を壊さない。旧API直叩きテストは新APIへ移行する。
- 挙動変更を伴うため、スコープ限定テストではなくバックエンド・フロントエンド双方の**全単体スイートとE2E**で検証する。

## 要件定義で決める論点

1. **計算ロジックの単一化の方向**: (a) 計算をクライアントへ寄せサーバーの計算系エンドポイントを廃止 / (b) サーバーを純粋計算APIにしプレビューと適用の両方でそれを使う。`POST /:id/calculate-overhead` は既に (b) の前例。一方 NET案分は既にクライアント側に計算がある。
2. **`empty_only` の判定基準**: 「単価がnullかどうか」をDBの値ではなくクライアントの編集後の値で判定することになるため、挙動が変わる点を明示する。
3. **`Ctrl+↑↓` のモード依存**: 建設業向け積算ソフトは「行選択中は階層移動、非選択時はカーソル移動」と意味が変わる。踏襲するか別キーに分離するか。
4. **ネスト化時の親名称の自動生成**: 建設業向け積算ソフトは「下階層に移動」時に選択範囲の先頭行の名称を親ノードの名称へ昇格させる。踏襲するか。
5. **Undo/Redo の単位**: アクション単位かスナップショット単位か。
6. **最大階層数**: 建設業向け積算ソフトの参照資料に明示なし（書式側の間接情報で階層6、ページ書式9）。本システムで上限を設けるか。
7. **段階1と段階3のリリース単位**: 同一リリースで揃えるか、段階1のみ先行し暫定ガードで凌ぐか。
8. **明細が17行を超える場合**の継続ページの扱い（合計行の出し方、`Page.N` の連番、フッタの親項目名）。
9. **第3階層以降のPDF表現**: 参照PDFは2階層のみで実例が無い。
10. **表紙の固定文言・自社情報のデータ供給元**: `company-info` spec との連携。別途工事①〜⑤・有効期限・注記行に対応するフィールドが現在のデータモデルに無い。
11. **Excel出力も同時にフロントエンドへ移すか**: `GET /:id/export` は `format=pdf|xlsx` の両対応。PDFのみ移すと出力経路が2系統に分かれる。
12. **フォント登録失敗時の挙動**: 現行 `PdfReportService` は helvetica へフォールバックする（`:725-728`, `:790-794`）。見積書は文字化けPDFを出すべきでないため中断とするか。
13. **フォントのサブセット化**: コメントは「約500KB」だが実体は 2.25 MB。既存3機能と共有する資産のため変更は他機能へ波及する。
14. **未保存状態でのプレビュー出力**を提供するか。フロントエンド生成なら技術的に可能になる。

> 日本語フォントの選定と PDF 生成ライブラリの継続可否は、フロントエンドに既存資産があることが判明したため**論点から除外した**（`pdf-format-reference.md` §10 参照）。
