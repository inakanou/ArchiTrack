# Design Document: 数量表作成機能

## Overview

**Purpose**: 本機能は、積算担当者が現場調査結果に基づいて数量を拾い出し、注釈付き調査写真と紐づけながら数量表を作成するための機能を提供する。

**Users**: 積算担当者が、プロジェクトに紐付く数量表の作成・編集・管理、コピーによる効率的な再利用、計算機能（面積・体積、ピッチ）を使用して効率的な積算作業を実施する。さらに、ExcelファイルおよびPDFファイルから数量項目をインポートし、手入力作業を大幅に削減する。

**Impact**: プロジェクト詳細画面に数量表セクションを追加し、QuantityTable、QuantityGroup、QuantityItemエンティティを導入する。数量表コピー機能、タイトル行表示最適化、パンくずナビゲーション改善（「ダッシュボード」起点の階層構造）、注釈付き写真の全画面統一表示、写真変更・プレビューダイアログでの注釈付き写真表示、写真コメント表示によるUI改善を含む。数量グループの名前変更機能、数量グループおよび数量項目の並び順管理（上下ボタンUI）、画面スクロールバー表示、数量表のPDF出力機能を追加する。さらに、ExcelファイルのデータパースおよびPDFファイルのOCR処理（pdfjs-dist + Tesseract.js + Claude Vision API）によるインポート機能を追加し、数量項目の一括取り込みを実現する。加えて、写真コメント表示の不具合修正（写真選択時・初回表示時・写真変更時のコメント取得・表示を修正）および数量項目のアクションボタン統合（並び替えボタン・削除ボタンをアクションメニュー内に集約しUI簡素化）を行う。

### Goals

- プロジェクトに対して複数の数量表を作成・管理可能にする
- 数量グループと現場調査写真の紐づけによるトレーサビリティ確保
- 計算方法（標準・面積体積・ピッチ）による効率的な数量算出
- オートコンプリートによる入力支援と一貫性確保
- クライアントサイド編集と明示保存モデルによる操作応答性の向上とサーバー負荷・ネットワーク往復の削減（REQ-42）
- 未保存変更の離脱ガード（REQ-43）と未保存インジケーター（REQ-44）による編集内容の意図しない消失防止
- ヘッダー操作ボタンの固定表示（REQ-45）による主要操作への常時アクセス確保
- 厳密なフィールド仕様に基づく入力制御と統一された表示書式
- 数量表コピーによる類似案件での作業効率化
- タイトル行表示最適化による画面の視認性向上
- パンくずナビゲーション改善による画面階層の明確化（「ダッシュボード」起点）
- 注釈付き写真の全画面統一表示
- 写真コメント表示による積算作業時の情報参照性向上
- 数量グループ名前変更による柔軟なグループ管理
- 数量グループ・数量項目の並び順の上下ボタンUIによる変更
- 画面スクロールバー表示による小画面環境での操作性確保
- PDF出力機能による数量表の帳票化と関係者への共有・提出の効率化
- インポート機能によるExcel・PDFからの数量項目一括取り込みと手入力作業の大幅削減
- 写真コメント表示の不具合修正によるRequirement 21の受け入れ基準の完全充足
- 数量項目のアクションボタン統合による表の視認性・操作性の向上
- 数量項目アクションメニューの表示不具合解消（REQ-46）。水平スクロール領域の overflow によるクリップを Portal 描画で回避し、REQ-36 で統合した操作を実際に使用可能にする
- 計算方法「箇所数」の追加（REQ-47）。ピッチ計算では表現できない不規則配置・実数え上げケースの数量拾い出しに対応する

### Non-Goals

- 見積書・請求書の自動生成（別機能として計画）
- 単価マスタとの連携（将来の拡張）
- リアルタイム共同編集（WebSocket同期は対象外）
- 編集内容の自動保存（一定間隔での保存）。REQ-42 により永続化は保存操作時のみとし、従来の useAutoSave（1500msデバウンス自動保存）は廃止する
- 編集中のサーバーへの差分逐次反映。REQ-42 により編集はクライアントサイドのドラフト状態に対して行い、保存操作時に一括同期する（参照系のデータ取得は対象外＝許可）
- 数量表のExcel出力（将来対応、PDF出力は本機能で対応）
- インポート時の単価・金額フィールドの取り込み（数量項目フィールドのみ対象）
- 写真選択ダイアログの仮想スクロール化・ページング（REQ-39 はレイアウトの重なり解消のみで、写真取得方式は既存のまま）
- 現場調査からの一括生成時の数量項目の自動生成（REQ-40 はグループ生成と写真1枚紐づけのみ。各グループは数量項目0件の初期状態）
- 写真・コメントの縦方向固定（sticky-top）やテーブルヘッダー固定（REQ-41 は水平スクロール時の画像・コメント固定のみが対象）
- Portal ドロップダウンの共通化（REQ-46 は `QuantityItemActionMenu` 単体の修正に限定し、`AutocompleteInput` の既存 Portal 実装には手を入れない）
- 数量表インポートへの「箇所数」取り込みマッピング（REQ-47 でスコープ外と明記。`field-mapping.ts` の `calculationMethod: 'STANDARD'` 固定を維持）
- backend `CalculationEngine` をプロダクション経路へ組み込む設計変更（現状フロントのみが数量を確定する構造を維持する）

## Boundary Commitments

本セクションは REQ-46・REQ-47 の追加スコープに対する責務境界を定義する（REQ-1〜45 の既存境界は実装済みであり本節では再定義しない）。

### This Spec Owns

- **数量項目アクションメニューの描画位置と可視性**（REQ-46）。`QuantityItemActionMenu` のドロップダウンをどの DOM ツリーへ、どの座標系で描画するか、およびその開閉判定。
- **計算方法の値域とその意味論**（REQ-47）。`CalculationMethod` の取りうる値、各値に対応する計算用フィールド定義、計算式、バリデーション規則、表示ラベル。
- **`quantity_items.calculationParams`（JSON）のスキーマ**。計算方法ごとのパラメータ形状と、その永続化・復元の契約。
- **計算方法の表示ラベルの単一情報源**。セレクトボックス・PDF出力の双方が参照するラベル定義。

### Out of Boundary

- `AutocompleteInput` の Portal 実装（動作中のため変更しない。参照実装として踏襲するのみ）
- `estimate-requests/LineItemEditor.tsx` の `LineItemActionMenu`（同種のクリップ問題を抱える可能性があるが、本スペックの対象外）
- `frontend/src/hooks/useMemoizedCalculation.ts`（import 元ゼロのデッドコード。PITCH ロジックが `calculation-engine.ts` と乖離しているが、参照されないため実害なし。COUNT 対応も削除も行わない。**「import 元ゼロ」は再実測でも真である**——`grep -rlE 'useMemoizedCalculation' frontend/src e2e --include=*.ts --include=*.tsx` の出力から定義ファイル自身を差し引くと 0 件である。タスク 115.234。コミット `6b84be3`。2026-09-02 にリポジトリルートで実測）
- `frontend/src/components/quantity-table/FieldValidatedItemRow.tsx`（**本番コードからの import がゼロのデッドコード**。テストとストーリーからの import は 4 件あり、「本体以外からの import がゼロ」は本項を書いた時点でも成り立っていなかった——当該のテスト・ストーリー 4 件は、本項を書いたコミット `01b46ca`（2026-07-17）より前に追加されている（3 件が `0ee7c79`（2026-01-16）、`FieldValidatedItemRow.autocomplete.test.tsx` の 1 件が `cf7c165`（2026-02-17）。`git log --diff-filter=A` で一件ずつ確かめた）。再実測は `grep -rlE 'from .*FieldValidatedItemRow' frontend/src e2e` の出力のうち、テスト・ストーリーを除いたものが 0 件、テスト・ストーリーが 4 件である（タスク 115.234。コミット `6b84be3`。2026-09-02 にリポジトリルートで実測）。本項が支えたい主張——実際にレンダリングされる行コンポーネントは 2 つだけ——は本番コードの 0 件の方に依るため、成り立つ。`CalculationMethodSelect` / `CalculationFields` の呼び出しと `!== 'STANDARD'` ガードを多数持つため一見 COUNT 対応が必要に見えるが、実際にレンダリングされる行コンポーネントは `EditableQuantityItemRow`（編集）と `QuantityItemRow`（閲覧）のみである。**COUNT 対応は行わない**）
- 数量表インポート（REQ-27〜34）への「箇所数」マッピング
- `field-validation.ts` の `NUMERIC_FIELD_RANGES` / `validateNumericRange` 重複定義の統合。**「境界外の未解決」は再実測では現況ではない**——統合はタスク 80.1（コミット `ba7040ae`、2026-09-10）が本スペックの中で済ませている。同ファイルが両者を自前で定義する行は、`git show ba7040ae^:frontend/src/utils/field-validation.ts | grep -cE '^export (const|function) (NUMERIC_FIELD_RANGES|validateNumericRange)'` の出力 `2` から、`grep -cE '^export (const|function) (NUMERIC_FIELD_RANGES|validateNumericRange)' frontend/src/utils/field-validation.ts` の出力 `0`（終了コード `1`）へ移った。範囲の判定は正典から取り込む形であり（`grep -cF "from './numeric-range-validation'" frontend/src/utils/field-validation.ts` の出力が `1`）、定数の名が同モジュールの輸出へ戻らないことは単体検証が固定している（`grep -cF "not.toContain('NUMERIC_FIELD_RANGES')" frontend/src/utils/field-validation.test.ts` の出力が `1`）。本書の `### 数値フィールド仕様（計算パラメータ）` も同じ統合を「一本化した」と書いており、本項はそれと食い違っていた。(a) に従い項は残して再実測を併記する。タスク 87.1 の測定範囲は起票の 3 件（本項・`#### PhotoCommentDisplay修正（REQ-35）` の `**Implementation Notes**` の 2 項・Requirement 49 の `ProjectSurveyImage` の定義とファイル変更表の 1 行）に限り、走査は広げていない。タスク 87.1。コミット `cba1233f`。2026-09-12 にリポジトリルートで実測
- REQ-36 で定義したメニュー項目の構成・活性制御・各操作の動作（REQ-46 は表示のみを扱う）

### Allowed Dependencies

- `react-dom` の `createPortal`（`AutocompleteInput.tsx` で既に採用済み。新規依存の追加はない）
- Prisma enum `CalculationMethod` と `quantity_items.calculationParams`（JSON カラム）。**カラム追加は行わない**
- `PUT /api/quantity-tables/:id/save`（saveDraft）。「箇所数」の永続化はこの既存経路のみを使う。新規エンドポイントは追加しない
- 既存の `QuantityValidationService` / `calculation-engine`（フロント・バックエンド双方）

### Revalidation Triggers

以下の変更が生じた場合、下流（内訳書生成・工程表の数量表連携・PDF出力・インポート）は統合を再確認する必要がある。

- `CalculationMethod` の値の追加・削除・リネーム（DB enum と TS ユニオン型の双方）
- `calculationParams` の JSON 形状変更（キー名・必須性の変更）
- 数量算出式の変更（箇所数・調整係数・丸め処理の適用順序）
- `PUT /api/quantity-tables/:id/save` のリクエストスキーマ変更
- 計算方法の表示ラベル変更（PDF出力の表示文字列に直結する）

## Architecture

### Existing Architecture Analysis

現行システムはSiteSurvey機能で確立されたパターンを踏襲する:

- **サービス層**: 依存性注入パターン（PrismaClient、AuditLogService）
- **ルーティング**: プロジェクト配下のネストルート構造
- **UI統合**: プロジェクト詳細画面へのセクションカード統合
- **楽観的排他制御**: updatedAtフィールドによるバージョンチェック
- **OCR/インポートパターン**: 受領見積書登録機能（estimate-request）で確立されたOCRパイプライン（pdfjs-dist + Tesseract.js + Claude Vision API）を再利用

### Architecture Pattern & Boundary Map

```mermaid
graph TB
    subgraph Frontend
        PDP[ProjectDetailPage]
        QTS[QuantityTableSectionCard]
        QTL[QuantityTableListPage]
        CQTD[CopyQuantityTableDialog]
        QTC[QuantityTableCreatePage]
        QTRD[QuantityTableRedirectPage]
        QTE[QuantityTableEditPage]
        RED["quantityTableEditReducer<br/>(クライアント側ドラフト・isDirty)"]
        UCB["UnsavedChangesBadge<br/>(未保存の印)"]
        LG["useBlocker + UnsavedChangesDialog<br/>(画面内遷移の離脱確認)"]
        UUC["useUnsavedChanges<br/>(beforeunload)"]
        ACS[useAutocompleteCandidateStore]
        QGC[QuantityGroupCard]
        QGTR[QuantityGroupTitleRow]
        EQIR[EditableQuantityItemRow]
        QIAM[QuantityItemActionMenu]
        ACI[AutocompleteInput]
        CALC["calculate<br/>(frontend calculation-engine)"]
        AIT[AnnotatedImageThumbnail]
        PPD[PhotoPreviewDialog]
        PCC[PhotoCommentDisplay]
        SOB[SortOrderButtons]
        ICMD[ItemCopyMoveDialog]
        SSD[SurveySelectDialog]
        QTPDF[QuantityTablePdfExportService]
        PDFS[PdfExportService]
        IMP[ImportDialog]
        IMPEXT[useImportDataExtractor]
        IMPMAP["field-mapping<br/>(autoDetectFieldMapping)"]
        IMPPRV[ImportPreviewTable]
        FIP["FileInlinePreview<br/>(受領見積書登録の部品を再利用)"]
        XLS[excel-parser]
        POE[pdf-ocr-extractor]
        PTE["pdf-text-extractor<br/>(pdfjs-dist + Tesseract.js)"]
        APIPJ["api: projects"]
        APIQT["api: quantity-tables"]
        APISS["api: site-surveys / survey-annotations"]
        APICV["api: claude-vision"]
    end

    subgraph Backend
        PRR["projects.routes<br/>GET /:id・GET /:id/detail-summary"]
        QTR["quantity-tables.routes<br/>GET・POST・DELETE・POST /:id/copy<br/>PUT /:id/save"]
        QTSV[QuantityTableService]
        QVS[QuantityValidationService]
        QFVS[QuantityFieldValidationService]
        ACR["autocomplete.routes<br/>GET autocomplete-candidates"]
        SSR["現場調査の既存API<br/>(survey-images / site-surveys / annotations)"]
        CVR["claude-vision.routes<br/>POST /extract"]
        CVSV[ClaudeVisionService]
    end

    subgraph Database
        PJ[Project]
        QT[QuantityTable]
        QG[QuantityGroup]
        QI[QuantityItem]
        SI[SurveyImage]
    end

    PDP --> QTS
    PDP -->|サマリー取得| APIPJ
    QTS --> QTL
    QTS --> QTC
    QTS --> QTRD
    QTL --> QTRD
    QTRD -->|編集画面へリダイレクト| QTE
    QTL --> CQTD
    QTL -->|プロジェクト取得| APIPJ
    QTL -->|一覧取得・削除| APIQT
    CQTD -->|数量表コピー| APIQT
    QTC -->|プロジェクト取得| APIPJ
    QTC -->|数量表作成| APIQT
    QTC -->|作成後に遷移| QTE

    QTE -->|初期読込 getQuantityTableDetail| APIQT
    QTE -->|全編集操作を dispatch| RED
    QTE -->|保存操作時のみ saveQuantityTableDraft| APIQT
    QTE -->|isDirty| UCB
    QTE -->|isDirty| LG
    QTE -->|isDirty| UUC

    QTE --> ACS
    QTE --> QGC
    QTE --> ICMD
    QTE --> SSD
    QTE --> IMP
    QTE --> AIT
    QTE -->|PDF生成| QTPDF
    QTE -->|PDFのダウンロード| PDFS
    QTE -->|写真一覧・調査一覧・調査詳細・注釈の読み取り| APISS

    QGC --> QGTR
    QGC --> EQIR
    QGC --> SOB
    QGC --> AIT
    QGC --> PCC
    QGC --> PPD
    PPD --> AIT
    EQIR --> QIAM
    EQIR --> ACI
    EQIR --> CALC
    AIT -->|注釈の読み取り| APISS
    ACS -->|候補の読み取り| ACR

    IMP --> IMPEXT
    IMP --> IMPMAP
    IMP --> IMPPRV
    IMP -->|ファイルプレビュー| FIP
    IMPEXT --> XLS
    IMPEXT --> POE
    POE -->|優先| APICV
    POE -->|フォールバック| PTE
    APICV --> CVR
    CVR --> CVSV

    APIPJ --> PRR
    APIQT --> QTR
    APISS --> SSR
    PRR -->|detail-summary| QTSV
    QTR --> QTSV
    QTSV -->|saveDraft の検証| QVS
    QTSV -->|saveDraft の検証| QFVS
    QTSV -->|saveDraft: 1トランザクションで差分を反映| QT
    QTSV --> QG
    QTSV --> QI
    QTSV -->|紐づけ可否の確認| SI
    ACR --> QI
    SSR --> SI

    QT --> PJ
    QG --> QT
    QI --> QG
    QG --> SI
```

**本図はタスク 96.9 が 2026-09-15 にコミット `67097fde` の実装から描き直したものである**（51ノード・67辺。本番のコードから到達する辺だけを描く）。保存の明示化（REQ-42）を反映し、編集操作はすべて `quantityTableEditReducer` のクライアント側ドラフトへ入り、永続化は保存操作の `PUT /:id/save` → `QuantityTableService.saveDraft` の1経路に限る。未保存の印と離脱確認は編集画面が `isDirty` から描く。読み取りの取得（初期読込・プロジェクト取得・入力補完候補・現場調査の写真と注釈・取り込みの抽出）は配線どおりに残した。描き直す前の図は `git show 67097fde:.kiro/specs/quantity-table-generation/design.md | sed -n 104,187p` で取り出せる。**その後タスク 96.2 が取り込みダイアログから `FileInlinePreview` への辺を足した（52ノード・68辺）。**
- バックエンドには数量グループ・数量項目の個別ルートと `QuantityGroupService` / `QuantityItemService` が残るが、本番のフロントエンドから呼ぶ経路が無いため図に描かない（API クライアントの対応関数はいずれも本番の呼び出し元を持たない）
- 読み取り専用の枝の `QuantityItemRow` は本番から到達しないため描かない（唯一の本番の呼び出し元である編集画面が常に `isEditable` を渡す。Task 89.1 の記録と同じ）
- `EditableQuantityItemRow` の入力用の子部品（`CalculationMethodSelect` / `CalculationFields` / `FieldValidationTooltip`）は外部の取得を持たないため省いた
- 写真コメントは個別に取得せず、初期読込の詳細と写真選択時の写真一覧の応答に含まれる

**Architecture Integration**:

- 選択パターン: 階層型サービス（QuantityTable → QuantityGroup → QuantityItem）
- ドメイン境界: 数量表管理は独立したドメインとして分離、プロジェクトとの関連はIDリレーションのみ
- 既存パターン: SiteSurveyパターンを継承（CRUD、一覧、詳細、楽観的排他制御）
- 新規コンポーネント: 計算エンジン（フロントエンド・バックエンド両方で共有）、フィールドバリデーター、AutocompleteCandidateStore
- 追加コンポーネント（REQ-17, 18）: コピー機能（QuantityTableService.copy）、CopyQuantityTableDialog、QuantityGroupTitleRow
- 追加コンポーネント（REQ-19, 20, 21）: PhotoChangeDialog、PhotoPreviewDialog、PhotoCommentDisplay
- 追加コンポーネント（REQ-22, 23, 24）: 数量グループ名前変更（既存QuantityGroupCard拡張）、SortOrderButtons
- 追加コンポーネント（REQ-25）: スクロールバー表示（QuantityTableEditPage CSSスタイル調整）
- 追加コンポーネント（REQ-26）: QuantityTablePdfExportService（数量表PDF出力、フロントエンドjsPDF）
- 追加コンポーネント（REQ-27-34）: ImportDialog、ImportDataExtractor、ImportPreviewTable、ImportFieldMapping（数量表インポート機能、受領見積書登録機能のOCRパイプラインを再利用）
- 修正コンポーネント（REQ-35）: PhotoCommentDisplay・QuantityGroupCard・QuantityTableEditPageの写真コメント取得・表示ロジック修正
- 変更コンポーネント（REQ-36）: EditableQuantityItemRow内のアクションセルを再構成。SortOrderButtonsと削除ボタンを個別表示から削除し、アクションメニュー内に「上へ移動」「下へ移動」「削除」を統合。QuantityItemActionMenuを新設
- 変更コンポーネント（REQ-37）: EditableQuantityItemRow および CalculationFields のレイアウト変更。計算用フィールド群（面積・体積／ピッチ）を「メイン行の下に別行表示」から「メイン行の操作列の右側に同一行で水平配置（ラベル+テキストボックス交互、行高さ不変）」へ変更。`calculationFieldsRow` 別行 div を削除し、`CalculationFields` を inline 配置に書き換え
- 追加コンポーネント（REQ-38）: QuantityGroupCard表題部にコピーボタンを追加（ダイアログ無し、押下即実行）、QuantityGroupService.copy（同一数量表内へグループ複製、数量項目・写真紐づけを保持）、`POST /api/quantity-groups/:id/copy` ルートを新設
- 修正コンポーネント（REQ-39）: QuantityTableEditPage 内のインライン写真選択ダイアログ（`photoGrid`/`photoItem` スタイル）のCSSを修正し、写真枚数増加時の重なりを解消。選択・変更とも同一インラインダイアログのため1箇所で両対応。未使用の `PhotoChangeDialog.tsx`（参照は単体テストのみ）は本要件のスコープ外（残置）。**「参照は単体テストのみ」は再実測では偽である**——`PhotoChangeDialog.stories.tsx` も同じ部品を参照する。定義ファイル自身を除く参照は 4 ファイルで、内訳は単体テスト 2 件・ストーリー 1 件・`QuantityTableEditPage.test.tsx` の注釈 1 件である。本行が入ったコミット `628fbe9`（2026-06-06）より前の `d0663e6`（2026-02-26）でストーリーが加わっているため、書かれた時点でも偽であった（`git log --diff-filter=A` で一件ずつ確かめた）。(a) に従い記述は残して再実測を併記する。タスク 115.234。コミット `6b84be3`。2026-09-02 にリポジトリルートで実測
- 追加コンポーネント（REQ-40）: QuantityTableEditPage に「現場調査から一括追加」ボタンと現場調査選択ダイアログ（SurveySelectDialog）を新設、QuantityGroupService.createGroupsFromSurvey（現場調査の全写真の枚数分グループを原子的に生成・写真紐づけ・連番命名）、`POST /api/quantity-tables/:tableId/groups/from-survey` ルートを新設。命名・切り詰めは REQ-38 のグループ名生成ロジックを汎用化して共有
- 変更コンポーネント（REQ-41）: QuantityGroupCard のレイアウトを再構成。カード全体に掛かっていた `overflowX:'auto'` を数量項目テーブルのラッパーへ限定し、画像・コメント（photoArea）を水平スクロール対象外（カード直下のflex列）へ移動して常時固定表示。折りたたみ・垂直スクロール・REQ-37 の水平展開と両立
- アーキテクチャ変更（REQ-42）: 編集画面の書き込みパスを「操作即サーバー反映」から「クライアントサイドのドラフト編集 ＋ 保存操作時のフル状態同期」へ転換。バックエンドは `QuantityTableService.saveDraft`（既存 `bulk-save` を全状態同期へ拡張：グループ/項目の作成・更新・削除・並び替え・グループ名・写真紐づけ・数量表名を単一トランザクション＋楽観ロックで差分適用）を新設。フロントは `QuantityTableEditPage` の state を単一 `useReducer` のドラフトモデル（仮IDによる新規行管理、dirty 追跡）へ再設計。従来の useAutoSave および編集画面からの個別ミューテーションAPI呼び出し（group/item の create/update/delete/copy/reorder、from-survey、編集画面での数量表名 PUT）は廃止し、保存操作時の `saveDraft` 一本に集約（個別エンドポイントは一覧画面の数量表名変更 PUT 等を除き編集フローから未使用化）。グループコピー（REQ-38）・現場調査一括生成（REQ-40）はクライアントサイドのドラフト複製/生成（仮ID・同一 surveyImageId 参照）へ移し、保存時に確定。現場調査写真一覧の取得は参照系GETとして許可
- 追加コンポーネント（REQ-43, 44）: `useUnsavedChanges` フック（既存 `frontend/src/hooks/useUnsavedChanges.ts`）と `useBlocker(isDirty)`（React Router v7、既存 CompanyInfoPage/ItemizedStatementDetailPage/SiteSurveyDetailPage で実績）を流用し、未保存変更時の画面遷移・タブクローズ・リロードに離脱ガードを適用。未保存インジケーター（UnsavedChangesBadge）をヘッダーの保存ボタン付近に表示
- 変更コンポーネント（REQ-45）: `QuantityTableEditPage` の `styles.header` を `position: sticky; top: 0; zIndex` 付きへ変更し、ヘッダー操作ボタン群（インポート/PDF出力/保存/＋グループを追加/現場調査から一括追加）を垂直スクロール時も固定表示。祖先に overflow スクロールコンテナが無いこと（現状 main は padding のみ）を前提とし、既存 EstimateDetailPage/SiteSurveyDetailPage の固定ヘッダーパターンに準拠
- Steering準拠: 型安全性、テスト駆動、コンポーネント分離原則を維持

### Technology Stack

| Layer | Choice / Version | Role in Feature | Notes |
|-------|------------------|-----------------|-------|
| Frontend | React 19.2 + TypeScript 5.9 | 数量表編集UI、計算プレビュー、インポートUI | 既存スタック |
| Frontend | decimal.js ^10.5.0 | 高精度数値計算 | 既存（数量表で使用中） |
| Frontend | @dnd-kit/core ^6.x | ドラッグ&ドロップ操作 | 既存（数量表で使用中） |
| Frontend | xlsx 0.20.3 (SheetJS) | Excelデータパース（インポート） | 既存（内訳書・見積書で使用中） |
| Frontend | pdfjs-dist (react-pdf依存) | PDFテキスト抽出（インポート） | 既存（受領見積書で使用中） |
| Frontend | tesseract.js ^7.0.0 | OCR文字認識（スキャンPDFフォールバック） | 既存（受領見積書で使用中） |
| Frontend | react-pdf ^10.3.0 | PDFインラインプレビュー | 既存（受領見積書で使用中） |
| Frontend | jsPDF ^4.0.0 | PDF出力 | 既存（現場調査・見積書で使用中） |
| Backend | Express 5.2 + TypeScript 5.9 | REST API | 既存スタック |
| Backend | Prisma 7.0 | データアクセス | 既存スタック |
| Backend | Zod 4.1 | バリデーション | 既存スタック |
| Backend | @anthropic-ai/sdk ^0.74.0 | Claude Vision API（高精度PDF抽出） | 既存（受領見積書で使用中） |
| Data | PostgreSQL 15 | データ永続化 | 既存スタック |

## File Structure Plan

本節は REQ-46・REQ-47 の追加スコープで作成・変更するファイルを列挙する（REQ-1〜45 のファイルは実装済みであり、Components and Interfaces 各節に記載済み）。

### 新規作成

```
frontend/src/
└── utils/
    └── calculation-method.ts          # 計算方法の単一情報源: 表示順・表示ラベル・選択肢・
                                       # 有効パラメータキー（PARAM_KEYS_BY_METHOD）。
                                       # Record<CalculationMethod, ...> により、
                                       # 型に値を足すと定義漏れが型エラーになる

backend/prisma/migrations/
└── <timestamp>_add_calculation_method_count/
    └── migration.sql                  # ALTER TYPE "CalculationMethod" ADD VALUE 'COUNT'; の1文のみ

e2e/specs/quantity-tables/
├── quantity-item-action-menu-clipping.spec.ts       # REQ-46: boundingBox ベースのクリップ検証
├── calculation-method-count.spec.ts                 # REQ-47: 箇所数の計算・フィールド表示・入力検証
├── calculation-method-count-persistence.spec.ts     # REQ-47: 保存復元・グループコピー・PDF出力
└── calculation-method-switch.spec.ts                # REQ-48: 切替後に入力した値が保存で失われないこと
```

**注記（上のツリーが挙げる E2E 4本の綴りと実体の対応。Task 95.5 の再実測）**: 上のツリーの4本は計画時点の綴りであり、着地した実体はいずれも別の綴りである。**ツリーの記述は計画の記録として残し、ここへ現況の再実測を併記する**（site-survey の設計文書 `#### 実測値の書き方（タスク 115.212）` の (a)）。

- REQ-46（クリップ検証）の実体: `e2e/specs/quantity-tables/quantity-item-action-menu-clipping-e2e.spec.ts`
- REQ-47 の前段（箇所数の計算・フィールド表示・入力検証）の実体: `e2e/specs/quantity-tables/quantity-count-calculation-e2e.spec.ts`
- REQ-47 の後段（保存復元・グループコピー・PDF出力）の実体: `e2e/specs/quantity-tables/quantity-count-persistence-e2e.spec.ts`
- REQ-48（切替後のパラメータ整合）の実体: `e2e/specs/quantity-tables/quantity-count-method-switch-e2e.spec.ts`

本書 `### Testing Strategy` の REQ-46 / REQ-47 / REQ-48 の各項は、いずれも上の実体の綴りを挙げている。**ツリーの4本は逆引用符を持たずコードフェンスの内側にあるため、`npm run check:design-path-refs` は主張を一つも取り出さない**——同検査はフェンスの内側を読み飛ばし、逆引用符で囲まれたトークンだけを主張とする。Task 95.5。コミット `077f3a1d`。2026-09-14 にリポジトリルートで実測

**注記**: REQ-47 の E2E を2ファイルに分けるのは、前段（計算・表示・入力検証）と後段（永続化・コピー・PDF出力）で依存する実装タスクが異なり、別ファイルにすることで並行実行可能になるためである。

**注記**: Storybook ストーリーは `CalculationFields` / `CalculationMethodSelect` / `QuantityItemActionMenu` / `EditableQuantityItemRow` の**4件とも既に実在する**（新規作成ではなく変更対象）。下表に記載する。

### 変更（REQ-46: アクションメニュー）

| ファイル | 変更内容 |
|---|---|
| `frontend/src/components/quantity-table/QuantityItemActionMenu.tsx` | ドロップダウンを `createPortal(document.body)` + `position: fixed` へ変更。`getBoundingClientRect` による座標算出、capture フェーズの `scroll` / `resize` 追従、`zIndex: 1000`。閉じ判定を `onBlur`/`relatedTarget` から document レベルの outside-click（`mousedown`）+ Escape へ変更 |
| `frontend/src/components/quantity-table/EditableQuantityItemRow.tsx` | 行ラッパーに張られた二重の `onBlur` → `handleCloseMenu` を撤去（Portal 化で DOM ツリーが分離し `relatedTarget` の内外判定が成立しなくなるため） |
| `frontend/src/components/quantity-table/QuantityItemActionMenu.stories.tsx` | **既存**。Portal 描画に追随（メニューが `document.body` 直下へ出るため、ストーリーのデコレータ・アサーションの見直しが必要） |
| `frontend/src/__tests__/components/quantity-table/QuantityItemActionMenu.test.tsx` | Portal 描画（`document.body` 直下）と outside-click / Escape の閉じ挙動を検証。**クリップ検証は jsdom では不可能なため E2E に委譲する** |
| `frontend/src/__tests__/components/quantity-table/EditableQuantityItemRow.actionMenu.test.tsx` | 二重 onBlur 撤去に伴う既存テストの追随 |

### 変更（REQ-47: 計算方法「箇所数」）

**Backend**

| ファイル | 変更内容 |
|---|---|
| `backend/prisma/schema.prisma` の `enum CalculationMethod` | enum `CalculationMethod` に `COUNT` を追加 |
| `backend/src/schemas/quantity-table.schema.ts` | `CALCULATION_METHODS` に `'COUNT'` を追加 |
| `backend/src/schemas/quantity-table.schema.ts` | `countParamsSchema` を新設。**形状推測の `z.union` を廃止し、`calculationMethod` を判別子としてスキーマを選ぶ方式へ変更**（REQ-48。詳細は「計算方法切替時のパラメータ整合」節） |
| `backend/src/routes/quantity-items.routes.ts` | 直接の変更は不要（`createQuantityItemSchema` / `updateQuantityItemSchema` を参照しているため、スキーマ側の判別子化が自動的に適用される）。**適用されていることを統合テストで確認する** |
| `backend/src/routes/quantity-tables.routes.ts` | ハードコードされた `z.enum([...])` を `CALCULATION_METHODS` 参照へ置換（再発防止）。値の追加漏れで保存が 400 になるのを防ぐ |
| `backend/src/services/quantity-validation.service.ts` | `CalculationMethodType` に `'COUNT'` を追加。switch に `case 'COUNT'` と `validateCountMode()` を追加。**未知モードを素通りさせないよう `default` 節を追加** |
| `backend/src/services/calculation-engine.ts` | enum に `COUNT`、`CountParams` 型、`calculateCount()`、`generateCountFormula()`、switch case を追加 |
| `backend/src/services/quantity-table.service.ts` | 3箇所のリテラル直書きユニオン型に `'COUNT'` を追加 |

**上の表の `backend/src/services/quantity-table.service.ts` の欄が数える「3箇所」は着手前の計画の記述であり、欄そのものは書き換えない（タスク 115.234。`site-survey` の design.md「実測値の書き方（タスク 115.212）」の (a) が求める併記をここへ置く。完了した計画の欄へ現況を書き入れると、表の主題である「何を変えるか」と食い違うためである）。同じ数え方の再実測は 0 である**——`git show 01b46ca^:backend/src/services/quantity-table.service.ts` へ `STANDARD` と `AREA_VOLUME` を同じ行に持つ行を数える式を掛けると `3`、現況の同ファイルへの同じ式は `0` を返す（2026-09-02 にリポジトリルートで実測）。計画が `CalculationMethodType` への置換として実施され、リテラルの列挙自体が本文から無くなったためである。

**Frontend**

| ファイル | 変更内容 |
|---|---|
| `frontend/src/types/quantity-edit.types.ts` | `CalculationMethod` に `'COUNT'` を追加、`CountParams` インターフェースを新設。**ここが型の起点**であり、Record 化した箇所の漏れをコンパイラが検出する |
| `frontend/src/types/quantity-table.types.ts` | 重複ユニオン型と `CalculationParams` 合成型に追随 |
| `frontend/src/api/quantity-tables.ts` | ユニオン型に追随 |
| `frontend/src/utils/calculation-engine.ts` | `calculateCount()`、`generateCountFormula()`、switch case を追加 |
| `frontend/src/utils/numeric-range-validation.ts` | `NumericRangeFieldType` に `'count'` を追加。`RangeConfig` を `integer?: boolean` で拡張。`validateNumericRange` に整数チェックを追加 |
| `frontend/src/components/quantity-table/CalculationFields.tsx` | `FieldDefinition` に `integer?: boolean` を追加。`COUNT_FIELDS` を新設。**三項演算子を `Record<Exclude<CalculationMethod,'STANDARD'>, FieldDefinition[]>` へ置換**。`NumberInputField` の blur 整形を `toFixed(2)` 固定から整数分岐へ |
| `frontend/src/components/quantity-table/CalculationMethodSelect.tsx` | ローカルの `CALCULATION_METHOD_OPTIONS` を撤去し、新設の `utils/calculation-method.ts` から import |
| `frontend/src/components/quantity-table/EditableQuantityItemRow.tsx` | **`handleCalculationMethodChange` で `resetParamsForMethod()` を適用**し、切替後の計算方法で使用しないパラメータキーを破棄する（REQ-48 AC1, AC2, AC7） |
| `frontend/src/pages/quantityTableEditReducer.ts` | `CalculationMethod` 型に追随。新規項目のデフォルトは `STANDARD` のまま。計算方法変更のドラフト反映は既存の `onUpdate` 経路をそのまま使う |
| `frontend/src/pages/QuantityTableEditPage.tsx` | **ネスト三項のラベル変換を `CALCULATION_METHOD_LABELS` 参照へ置換**（放置すると PDF に「ピッチ」と誤表示される） |
| `frontend/src/hooks/useQuantityTableSave.ts` | `checkIntegrity` に COUNT の分岐を追加（計算パラメータ未設定の警告） |
| `frontend/src/components/quantity-table/CalculationFields.stories.tsx` | **既存**。COUNT のストーリーを追加 |
| `frontend/src/components/quantity-table/CalculationMethodSelect.stories.tsx` | **既存**。選択肢に「箇所数」が増えることへの追随 |
| `frontend/src/components/quantity-table/EditableQuantityItemRow.stories.tsx` | **既存**。COUNT の行ストーリーを追加 |

**テスト**

| ファイル | 変更内容 |
|---|---|
| `backend/src/__tests__/unit/services/calculation-engine.test.ts` | `describe('calculateCount')` を追加。既存の「未知の計算方法は0を返す」テストと整合させる |
| `backend/src/__tests__/unit/services/quantity-validation.service.test.ts` | モード別 describe に「箇所数」を追加（必須・整数・範囲） |
| `backend/src/__tests__/unit/schemas/quantity-table.schema.test.ts` | `calculationParamsSchema` に「箇所数計算パラメータ」の describe を追加。**union の strip 事故を検知する回帰テストを必ず含める**（`expect(result.data).toEqual(countParams)`） |
| `frontend/src/utils/calculation-engine.test.ts` | `calculateCount` / `generateCountFormula` のテスト |
| `frontend/src/components/quantity-table/CalculationFields.test.tsx` | COUNT 選択時のフィールド順序・整数表示・PITCH へフォールバックしないことの検証 |
| `frontend/src/components/quantity-table/CalculationMethodSelect.test.tsx` | 選択肢に「箇所数」が含まれること |

## System Flows

### 数量計算フロー（箇所数モード・REQ-47）

```mermaid
flowchart TD
    A[計算方法で「箇所数」を選択] --> B[計算用フィールド群を表示<br/>箇所数 / 長さ / 重量 / 調整係数 / 丸め設定]
    B --> C{箇所数が入力されたか}
    C -->|未入力| D[数量を更新しない<br/>保存時に必須エラー]
    C -->|入力あり| E{整数かつ 1〜9999999 か}
    E -->|No| F[入力を拒否しエラー表示]
    E -->|Yes| G[rawValue = 箇所数]
    G --> H{長さが入力あり}
    H -->|Yes| I[rawValue *= 長さ]
    H -->|No| J
    I --> J{重量が入力あり}
    J -->|Yes| K[rawValue *= 重量]
    J -->|No| L
    K --> L[adjustedValue = rawValue × 調整係数]
    L --> M[finalValue = 丸め単位で切り上げ]
    M --> N[item.quantity に設定<br/>ドラフト状態を更新]
```

ピッチとの唯一の差分は `rawValue` の初期値である。ピッチは `floor((範囲長 − 端長1 − 端長2) / ピッチ長) + 1` で箇所数を算出するのに対し、箇所数モードは入力値をそのまま使う。以降の乗算・調整係数・丸めは `calculate()` の共通経路を通るため、ピッチと同一の挙動が構造的に保証される。

### アクションメニューの描画・追従フロー（REQ-46）

```mermaid
sequenceDiagram
    participant U as 積算担当者
    participant B as アクションボタン<br/>(行内 / itemTableWrapper の中)
    participant M as QuantityItemActionMenu
    participant P as Portal (document.body 直下)
    participant D as document

    U->>B: クリック
    B->>M: onToggle → isOpen = true
    M->>M: buttonRef.getBoundingClientRect()
    M->>P: createPortal(メニュー, document.body)
    Note over P: position: fixed / zIndex: 1000<br/>祖先の overflow の影響を受けない
    M->>D: addEventListener('mousedown', outsideClick)
    M->>D: addEventListener('scroll', reposition, {capture: true})
    M->>D: addEventListener('resize', reposition)

    U->>D: 表を水平スクロール
    D-->>M: scroll (capture: 祖先の itemTableWrapper でも発火)
    M->>M: 座標を再計算し fixed 位置を更新
    P-->>U: メニューがボタンに追従して表示され続ける

    U->>D: メニュー外をクリック
    D-->>M: mousedown → containerRef.contains(target) === false
    M->>M: isOpen = false → Portal をアンマウント
```

`scroll` を **capture フェーズ**で購読するのが要点である。`itemTableWrapper` のスクロールイベントは `window` までバブルしないため、capture: true を指定しない限り水平スクロールに追従できない（`AutocompleteInput.tsx` が同じ理由で同じ実装を採っている）。

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
        Note over QuantityItemComponent: ドラフト更新のみ・isDirty=true（REQ-42、自動保存なし）
        QuantityItemComponent->>QuantityItemComponent: 計算結果をドラフトへ反映（永続化は保存操作時）
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

### 数量グループコピーフロー（REQ-38）

> **REQ-42 による更新**: 以下は当初の「コピー押下即サーバー実行（POST /copy）」フロー。REQ-42 適用後、編集画面ではグループコピーをクライアントサイドのドラフト複製（仮ID採番・同一 surveyImageId 参照・直下挿入・displayOrder シフト）として実行し、永続化は保存操作時の `saveDraft` で確定する。サーバー側 `POST /copy` は編集フローから未使用化（命名・切り詰めロジックはクライアントの複製処理で再利用）。

```mermaid
sequenceDiagram
    participant User
    participant QTE as QuantityTableEditPage
    participant QGC as QuantityGroupCard
    participant API
    participant QGSV as QuantityGroupService
    participant DB as PostgreSQL

    User->>QGC: グループ表題部のコピーボタンをクリック
    QGC->>QGC: コピー中インジケーター表示・重複押下防止
    QGC->>API: POST /api/quantity-groups/:id/copy
    API->>QGSV: copy(groupId, actorId)
    QGSV->>DB: BEGIN TRANSACTION
    QGSV->>DB: 元グループと配下の全数量項目を取得
    QGSV->>DB: 元グループの直下のdisplayOrderを算出し後続を+1シフト
    QGSV->>DB: 複製グループを挿入（name="{元名}のコピー"、surveyImageIdを保持）
    QGSV->>DB: 配下の全数量項目を複製（displayOrder・全フィールド値を保持）
    QGSV->>DB: 監査ログ記録（QUANTITY_GROUP_COPIED）
    QGSV->>DB: COMMIT
    QGSV-->>API: 複製されたQuantityGroupInfo
    API-->>QGC: 201 Created + QuantityGroupInfo
    QGC->>QTE: 複製先グループをローカルステートに反映
    QTE->>QTE: 複製先グループを元グループの直下に表示（編集可能状態）

    alt エラー発生時
        QGSV->>DB: ROLLBACK
        QGSV-->>API: エラー
        API-->>QGC: エラーレスポンス
        QGC->>QGC: エラーメッセージ表示・インジケーター解除
    end
```

### 現場調査からの数量グループ一括生成フロー（REQ-40）

> **REQ-42 による更新**: 以下は当初の「実行即サーバー生成（POST /from-survey）」フロー。REQ-42 適用後、編集画面では対象現場調査の写真一覧を参照系GETで取得し、写真枚数分の数量グループをクライアントサイドのドラフトに生成（仮ID・連番命名・写真順 surveyImageId 紐づけ・末尾追加）する。永続化は保存操作時の `saveDraft` で確定し、サーバー側 `POST /from-survey` は編集フローから未使用化。命名・切り詰めロジックはクライアント生成処理で再利用する。

```mermaid
sequenceDiagram
    participant User
    participant QTE as QuantityTableEditPage
    participant Dialog as SurveySelectDialog
    participant SAPI as SiteSurvey API
    participant API
    participant QGSV as QuantityGroupService
    participant DB as PostgreSQL

    User->>QTE: 「現場調査から一括追加」ボタンをクリック
    QTE->>SAPI: getSiteSurveys(projectId)
    SAPI-->>QTE: 現場調査一覧
    QTE->>Dialog: 現場調査選択ダイアログ表示
    User->>Dialog: 対象現場調査を選択して実行を確定
    Dialog->>Dialog: 処理中インジケーター表示・重複実行防止
    Dialog->>API: POST /api/quantity-tables/:tableId/groups/from-survey { siteSurveyId }
    API->>QGSV: createGroupsFromSurvey(tableId, siteSurveyId, actorId)
    QGSV->>DB: BEGIN TRANSACTION
    QGSV->>DB: 現場調査の全写真を写真順（displayOrder）で取得
    alt 写真0枚
        QGSV->>DB: ROLLBACK
        QGSV-->>API: 写真なし（生成0件）
        API-->>Dialog: 200 + { created: 0 }
        Dialog->>Dialog: 「写真が存在しません」メッセージ表示
    else 写真あり
        QGSV->>DB: 当該数量表の数量グループ群を SELECT FOR UPDATE でロック（REQ-38と同一直列化）
        QGSV->>DB: 既存グループの max(displayOrder) を取得
        QGSV->>DB: 写真枚数分のグループを末尾に連番命名で作成（name="{現場調査名} {n}"、surveyImageId紐づけ）
        QGSV->>DB: 監査ログ記録（QUANTITY_GROUPS_CREATED_FROM_SURVEY）
        QGSV->>DB: COMMIT
        QGSV-->>API: 生成された QuantityGroupInfo[]
        API-->>Dialog: 201 Created + QuantityGroupInfo[]
        Dialog->>QTE: 生成グループをローカルステートに反映（末尾追加）
        QTE->>QTE: 生成グループ数を含む完了メッセージ表示
    end

    alt エラー発生時
        QGSV->>DB: ROLLBACK
        QGSV-->>API: エラー
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

### 数量表PDF出力フロー

```mermaid
sequenceDiagram
    participant User
    participant QTE as QuantityTableEditPage
    participant QTPDF as QuantityTablePdfExportService
    participant PFS as PdfFontService

    User->>QTE: PDF出力ボタンをクリック
    QTE->>QTE: PDF生成中インジケーター表示・重複操作防止
    QTE->>QTPDF: generateQuantityTablePdf(quantityTableDetail)
    QTPDF->>PFS: フォント初期化
    PFS-->>QTPDF: フォント準備完了
    QTPDF->>QTPDF: 表紙生成（タイトル、数量表名、工事名、作成日）
    loop 各数量グループ（並び順）
        QTPDF->>QTPDF: 新規ページ追加
        QTPDF->>QTPDF: グループ名表示
        alt 写真紐づけあり
            QTPDF->>QTPDF: 注釈付き写真配置
            QTPDF->>QTPDF: 写真コメント配置
        end
        QTPDF->>QTPDF: 数量項目テーブルヘッダー描画
        loop 各数量項目（並び順）
            alt ページ残り高さ不足
                QTPDF->>QTPDF: 改ページ + テーブルヘッダー繰り返し
            end
            QTPDF->>QTPDF: 数量項目行描画
        end
    end
    QTPDF->>QTPDF: ページ番号追記（表紙除く）
    QTPDF-->>QTE: PDFバイナリデータ
    QTE->>QTE: ダウンロード（ファイル名: {数量表名}.pdf）
    QTE->>QTE: インジケーター解除

    alt エラー発生時
        QTPDF-->>QTE: エラー
        QTE->>QTE: エラーメッセージ表示・インジケーター解除
    end
```

### 数量表インポートフロー

```mermaid
sequenceDiagram
    participant User
    participant QTE as QuantityTableEditPage
    participant IMP as ImportDialog
    participant EXT as ImportDataExtractor
    participant CVR as ClaudeVisionRoutes
    participant CVSV as ClaudeVisionService

    User->>QTE: インポートボタンをクリック
    QTE->>IMP: インポートダイアログ表示
    User->>IMP: ファイルをアップロード（Excel or PDF）
    IMP->>IMP: ファイル形式判定・インラインプレビュー表示

    alt Excelファイル
        IMP->>EXT: Excelデータパース開始
        EXT->>EXT: SheetJS（xlsx）でデータ読み取り
        EXT->>EXT: 列データをフィールドにマッピング
        EXT-->>IMP: 抽出結果（行データ配列）
    else PDFファイル
        IMP->>EXT: OCR処理開始
        alt Claude Vision API利用可能
            EXT->>EXT: PDFページをCanvas経由でBase64画像に変換
            EXT->>CVR: POST /api/claude-vision/extract（Base64画像送信）
            CVR->>CVSV: 数量表構造解析プロンプトで抽出
            CVSV-->>CVR: JSON形式の表データ
            CVR-->>EXT: 抽出結果
        else Claude Vision API利用不可（フォールバック）
            EXT->>EXT: pdfjs-dist getTextContent()でテキスト抽出
            alt テキストPDF
                EXT->>EXT: 抽出テキストを使用
            else スキャンPDF
                EXT->>EXT: Canvas描画（scale 4.0）
                EXT->>EXT: 画像前処理パイプライン
                EXT->>EXT: Tesseract.js OCR実行
            end
            EXT->>EXT: テキストからフィールドマッピング
        end
        EXT-->>IMP: 抽出結果（行データ配列）
    end

    IMP->>IMP: プレビューテーブル表示 + フィールドマッピング調整UI
    User->>IMP: マッピング調整（任意）
    User->>IMP: 「一括取り込み」ボタンクリック
    IMP->>IMP: 取り込み先数量グループ選択UI表示
    User->>IMP: 取り込み先数量グループを選択
    IMP->>QTE: 抽出結果を数量項目として追加
    QTE->>QTE: 完了メッセージ表示
```

### クライアントサイド編集・明示保存フロー（REQ-42）

```mermaid
sequenceDiagram
    participant U as 積算担当者
    participant QTE as QuantityTableEditPage(draft reducer)
    participant API as QuantityTableRoutes
    participant SV as QuantityTableService.saveDraft
    participant DB as PostgreSQL

    Note over QTE: 初回表示（参照系GET=許可）
    QTE->>API: GET /api/quantity-tables/:id
    API-->>QTE: QuantityTableDetail
    QTE->>QTE: serverSnapshot/draft 初期化, isDirty=false

    Note over U,QTE: 以降の編集はクライアントのみ（サーバー永続化アクセスなし）
    U->>QTE: グループ/項目 追加・削除・コピー・並び替え・名称・写真紐づけ・一括生成・取り込み
    QTE->>QTE: draft 更新（新規行は仮ID付与）, isDirty=true, 未保存インジケーター表示

    U->>QTE: 保存ボタン押下
    QTE->>QTE: クライアント検証（必須/計算整合 REQ-11.2/11.3）
    QTE->>API: PUT /api/quantity-tables/:id/save (expectedUpdatedAt, name, groups[全状態])
    API->>SV: saveDraft(input)
    SV->>DB: BEGIN（任意で SELECT ... FOR UPDATE）
    SV->>SV: updatedAt 照合（楽観ロック・不一致→409）, 全状態検証
    SV->>DB: 差分適用（無い行=削除 / id無=作成 / 既存=更新, displayOrder/name/surveyImageId）
    SV->>DB: 数量表 updatedAt 更新; COMMIT; 監査ログ
    SV-->>API: QuantityTableDetail（採番済みID）
    API-->>QTE: 200 QuantityTableDetail
    QTE->>QTE: draft/serverSnapshot を再同期, isDirty=false, 「保存しました」表示

    alt 保存失敗（409 競合 / 検証 / サーバーエラー）
        API-->>QTE: 409 / 400 / 500
        QTE->>QTE: エラー表示, draft（未保存変更）を保持し再保存可能（REQ-42 AC9）
    end
```

**上の図の「任意で SELECT ... FOR UPDATE」は書いた時点の記録である。** Task 88.1 が `saveDraft` に数量表の行ロックを入れ、任意ではなくなった。決着と根拠は `#### QuantityTableService.saveDraft（フル状態同期保存）` の「並行制御の範囲（Task 88.1 の決着）」 に置いた。

### 未保存変更の離脱ガードフロー（REQ-43）

```mermaid
sequenceDiagram
    participant U as 積算担当者
    participant QTE as QuantityTableEditPage
    participant BLK as useBlocker(isDirty)
    participant BRW as Browser(beforeunload)

    alt アプリ内遷移（パンくず/戻る等）
        U->>QTE: 別画面へ遷移操作
        QTE->>BLK: isDirty=true の場合 blocker.state='blocked'
        BLK-->>U: 離脱確認ダイアログ
        alt 取消
            U->>BLK: blocker.reset() → 編集画面・draft 維持
        else 承認
            U->>BLK: blocker.proceed() → 遷移実行, draft 破棄
        end
    else タブクローズ/リロード
        U->>BRW: タブを閉じる/リロード
        BRW->>BRW: isDirty=true の場合 beforeunload で標準確認表示
    end
    Note over QTE: 保存成功で isDirty=false → 以降ガード解除（REQ-43 AC6）
```

## Requirements Traceability

| Requirement | Summary | Components | Interfaces | Flows |
|-------------|---------|------------|------------|-------|
| 1.1-1.7 | プロジェクト詳細画面の数量表セクション | QuantityTableSectionCard, ProjectDetailPage | GET /api/projects/:id/quantity-tables/summary | - |
| 2.1-2.5 | 数量表の作成・管理 | QuantityTableListPage, QuantityTableForm | QuantityTableService, QuantityTable API | - |
| 3.1-3.4 | 数量表編集画面の表示（注釈付き写真表示含む） | QuantityTableEditPage, QuantityGroupComponent, PhotoCommentDisplay | GET /api/quantity-tables/:id | - |
| 4.1-4.5 | 数量グループの作成・管理（注釈付き写真選択） | QuantityGroupComponent, PhotoSelector | QuantityGroupService | - |
| 5.1-5.5 | 数量項目の追加・編集 | QuantityItemComponent, QuantityItemRow | QuantityItemService | - |
| 6.1-6.5 | 数量項目のコピー・移動 | QuantityItemComponent, DragDropContext | QuantityItemService | - |
| 7.1-7.8 | 入力支援・オートコンプリート | AutocompleteInput, AutocompleteCandidateStore | GET /api/projects/:projectId/quantity-items/autocomplete-candidates | オートコンプリートフロー |
| 8.1-8.11 | 計算方法の選択 | CalculationMethodSelector, CalculationFields | CalculationEngine | 数量計算フロー |
| 9.1-9.8 | 調整係数 | AdjustmentFactorInput | CalculationEngine, FieldValidator | - |
| 10.1-10.8 | 丸め設定 | RoundingSettingInput | CalculationEngine, FieldValidator | - |
| 11.1-11.5 | 数量表の保存（明示保存・自動保存廃止） | QuantityTableEditPage(draft reducer), SaveButton, QuantityTableService.saveDraft | PUT /api/quantity-tables/:id/save | クライアントサイド編集・明示保存フロー |
| 12.1-12.5 | パンくずナビゲーション | Breadcrumb, QuantityTableListPage, QuantityTableEditPage | - | - |
| 13.1-13.4 | テキストフィールドの入力制御 | FieldValidator, TextFieldConstraints | QuantityValidationService | - |
| 14.1-14.5 | 数値フィールドの表示書式 | NumericFormatter, QuantityItemRow | - | - |
| 15.1-15.3 | 数量フィールドの入力制御 | FieldValidator, NumericInputConstraints | QuantityValidationService | - |
| 16.1-16.12 | フォーカス時の入力値全選択 | AutocompleteInput, FieldValidatedItemRow | - | - |
| 17.1-17.7 | 数量表コピー機能 | CopyQuantityTableDialog, QuantityTableService.copy | POST /api/quantity-tables/:id/copy | 数量表コピーフロー |
| 18.1-18.5 | 数量項目タイトル行の表示最適化 | QuantityGroupCard, QuantityGroupTitleRow | - | - |
| 19.1-19.4 | 写真変更ダイアログでの注釈付き写真表示 | PhotoChangeDialog | QuantityGroupService.linkSurveyImage | - |
| 20.1-20.3 | 写真プレビューダイアログでの注釈付き写真表示 | PhotoPreviewDialog | - | - |
| 21.1-21.5 | 写真選択時のコメント表示 | PhotoCommentDisplay | - | - |
| 22.1-22.5 | 数量グループの名前変更 | QuantityGroupCard | PUT /api/quantity-groups/:id | - |
| 23.1-23.8 | 数量グループの並び順管理 | SortOrderButtons, QuantityGroupCard | PUT /api/quantity-tables/:tableId/groups/display-order | - |
| 24.1-24.8 | 数量項目の並び順管理 | SortOrderButtons, EditableQuantityItemRow | PUT /api/quantity-groups/:groupId/items/display-order | - |
| 25.1-25.6 | 画面スクロールバー表示 | QuantityTableEditPage | - | - |
| 26.1-26.12 | 数量表のPDF出力 | QuantityTablePdfExportService, QuantityTableEditPage | - | 数量表PDF出力フロー |
| 27.1-27.8 | 数量表インポート（ファイルアップロード・処理起動） | ImportDialog, ImportDataExtractor | - | 数量表インポートフロー |
| 28.1-28.7 | Excelデータパースによる数量項目抽出 | ImportDataExtractor | SheetJS xlsx | 数量表インポートフロー |
| 29.1-29.10 | PDF OCR処理による数量項目抽出 | ImportDataExtractor | pdfjs-dist, tesseract.js | 数量表インポートフロー |
| 30.1-30.7 | Claude Vision API連携による高精度抽出 | ImportDataExtractor | ClaudeVisionService, POST /api/claude-vision/extract | 数量表インポートフロー |
| 31.1-31.9 | 抽出結果から数量項目への一括取り込み | ImportDialog, ImportPreviewTable | QuantityTableEditState | 数量表インポートフロー |
| 32.1-32.6 | フィールドマッピング調整 | ImportFieldMapping, ImportPreviewTable | - | 数量表インポートフロー |
| 33.1-33.5 | OCR再実行・リトライ機能 | ImportDialog, ImportDataExtractor | - | - |
| 34.1-34.5 | インラインプレビュー | ImportDialog | react-pdf, SheetJS xlsx | - |
| 35.1-35.7 | 写真コメント表示の不具合修正 | PhotoCommentDisplay, QuantityGroupCard, QuantityTableEditPage | GET /api/quantity-tables/:id | - |
| 36.1-36.9 | 数量項目のアクションボタン統合 | QuantityItemActionMenu, EditableQuantityItemRow | - | - |
| 37.1-37.12 | 計算用フィールドの行内水平配置（面積・体積／ピッチ） | EditableQuantityItemRow, CalculationFields, gridConstants | - | - |
| 38.1-38.12 | 数量グループのコピー機能（同一数量表内） | QuantityGroupCard, QuantityGroupService.copy | POST /api/quantity-groups/:id/copy | 数量グループコピーフロー |
| 39.1-39.6 | 写真選択・変更ダイアログの写真一覧レイアウト改善（重なり解消） | QuantityTableEditPage（インライン写真選択ダイアログ photoGrid/photoItem） | - | - |
| 40.1-40.13 | 現場調査からの数量グループ一括生成 | QuantityTableEditPage, SurveySelectDialog, QuantityGroupService.createGroupsFromSurvey | POST /api/quantity-tables/:tableId/groups/from-survey, GET /api/projects/:projectId/site-surveys | 現場調査からの数量グループ一括生成フロー |
| 41.1-41.6 | 水平スクロール時の画像・コメント固定表示 | QuantityGroupCard, PhotoCommentDisplay | - | - |
| 42.1-42.10 | クライアントサイド編集と明示保存モデル | QuantityTableEditPage(draft reducer), QuantityTableService.saveDraft | PUT /api/quantity-tables/:id/save | クライアントサイド編集・明示保存フロー |
| 43.1-43.6 | 未保存変更の離脱ガード | QuantityTableEditPage, useUnsavedChanges, useBlocker | - | 未保存変更の離脱ガードフロー |
| 44.1-44.4 | 未保存変更インジケーター | UnsavedChangesBadge, QuantityTableEditPage | - | - |
| 45.1-45.4 | ヘッダー操作ボタンの固定表示 | QuantityTableEditPage（styles.header sticky） | - | - |
| 46.1-46.4 | アクションメニューがクリップされず全項目表示される | QuantityItemActionMenu（Portal 描画） | createPortal(document.body), position: fixed | アクションメニューの描画・追従フロー |
| 46.5-46.6 | 水平・垂直スクロール時のボタン追従 | QuantityItemActionMenu（useDropdownPosition 相当のローカル実装） | getBoundingClientRect, scroll(capture:true) / resize | アクションメニューの描画・追従フロー |
| 46.7 | 固定ヘッダーより前面に表示 | QuantityItemActionMenu | zIndex: 1000（sticky ヘッダーの 50 を上回る） | - |
| 46.8-46.9 | 外側クリック・項目選択でメニューを閉じる | QuantityItemActionMenu, EditableQuantityItemRow（二重 onBlur 撤去） | document mousedown outside-click + Escape | アクションメニューの描画・追従フロー |
| 46.10-46.11 | REQ-36 の動作および REQ-37/41 の水平スクロールを阻害しない | QuantityItemActionMenu, QuantityGroupCard | - | - |
| 47.1-47.2 | 計算方法「箇所数」の選択とフィールド表示 | CalculationMethodSelect, CalculationFields, calculation-method.ts | CALCULATION_METHOD_LABELS/OPTIONS | 数量計算フロー（箇所数モード） |
| 47.3-47.7 | 箇所数の手入力と、ピッチと同一の乗算・調整係数・丸め処理 | CalculationEngine（FE/BE 双方の calculateCount） | calculate(), applyRounding() | 数量計算フロー（箇所数モード） |
| 47.8-47.11 | 箇所数の必須・整数・範囲バリデーション | numeric-range-validation, QuantityValidationService.validateCountMode, countParamsSchema | validateNumericRange（integer 拡張） | - |
| 47.12-47.14 | 値変更時の自動再計算と計算方法切替時のフィールド差し替え | CalculationFields, EditableQuantityItemRow | Record<CalculationMethod, FieldDefinition[]> | 数量計算フロー（箇所数モード） |
| 47.15 | 保存・再読み込みでの値の完全復元 | QuantityTableService.saveDraft, countParamsSchema（union 評価順序） | PUT /api/quantity-tables/:id/save | クライアントサイド編集・明示保存フロー |
| 47.16 | 数量グループコピーでの箇所数の複製 | QuantityGroupCard（クライアントサイド複製） | - | 数量グループコピーフロー |
| 47.17 | PDF出力での「箇所数」表示 | QuantityTableEditPage（ラベル変換）, QuantityTablePdfExportService | CALCULATION_METHOD_LABELS | 数量表PDF出力フロー |
| 47.18 | 箇所数の編集もドラフト状態に対して行う | QuantityTableEditPage(draft reducer) | PUT /api/quantity-tables/:id/save | クライアントサイド編集・明示保存フロー |
| 48.1-48.2, 48.7 | 計算方法切替時に旧方式のパラメータを破棄し、共通フィールドは引き継ぐ | EditableQuantityItemRow.handleCalculationMethodChange, calculation-method.ts (PARAM_KEYS_BY_METHOD) | resetParamsForMethod() | 計算方法切替時のパラメータ整合 |
| 48.3-48.6 | 計算方法を判別子としたパラメータ検証（形状推測の廃止） | quantity-table.schema.ts (PARAMS_SCHEMA_BY_METHOD), quantity-items.routes.ts, quantity-tables.routes.ts | withCalculationParams() superRefine | 計算方法切替時のパラメータ整合 |

**追跡表の Components 列についての注（タスク 89.1）**: 9.1-9.8 の行が挙げる `AdjustmentFactorInput` は、同名の部品が本番の経路から到達しない死コードであったため、同タスクで撤去した。取り込み元は数量表コンポーネントの再輸出だけで、その再輸出を取り込むファイルは一つも無かった（コミット `4e560c7f`、2026-09-12 にリポジトリルートで実測）。調整係数の欄を実際に描画するのは `CalculationFields` である。行は書かれた時点の記述として残す（規約 (a)）。同じ理由で丸め単位入力と数量入力の部品も撤去したが、本表はそれらを名指さない——10.1-10.8 の行の `RoundingSettingInput` は、もとより同名の実装を持たない設計上の名である。

**同じ注の続き（残置の二部品）**: 5.1-5.5 と 14.1-14.5 の行が挙げる `QuantityItemRow` と、16.1-16.12 の行が挙げる `FieldValidatedItemRow` はタスク 89.1 で残置と決めた。前者は `QuantityGroupCard` の読み取り専用の枝からだけ描画され、唯一の本番の呼び出し元が常に編集可能として渡すため本番の画面では描画されない。後者は本番の経路から到達しない。残す理由と実測は、いずれもそれぞれの部品の冒頭の説明に置いた。

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
| 単位 | 必須 | 左寄せ | 全角3/半角6 | 空白 | - |
| 計算方法 | 必須 | 左寄せ | 全角25/半角50 | 標準 | - |
| 備考 | - | 左寄せ | 全角25/半角50 | 空白 | - |

### 数値フィールド仕様（計算パラメータ）

| フィールド | 必須 | 配置 | 入力可能範囲 | デフォルト値 | 表示書式 | 空白時動作 |
|-----------|------|------|--------------|--------------|----------|------------|
| 調整係数 | 必須 | 右寄せ | -9.99〜9.99 | 1.00 | 小数2桁常時表示 | デフォルト値を自動入力 |
| 丸め設定 | 必須 | 右寄せ | 0.01〜99.99 | 0.01 | 小数2桁常時表示 | 0または空白でデフォルト値を自動入力 |
| 数量 | 必須 | 右寄せ | -999999.99〜9999999.99 | 0 | 小数2桁常時表示 | デフォルト値を自動入力 |

**この表の範囲の出所は `frontend/src/utils/numeric-range-validation.ts` の `FIELD_RANGE_CONFIG` 一つである**（タスク 80.1）。同ファイルが数量表の数値欄の範囲の正典であり、範囲の定数を他所へ書き写さないこと。`frontend/src/utils/field-validation.ts` は同名の `validateNumericRange` と独自の範囲定数を併せ持っており、**丸め設定の上限が `99.99` と `999.99` へ静かに割れていた**。タスク 80.1 で同ファイルから範囲の定数と範囲の判定を取りやめ、正典へ委譲する形へ一本化した。二系統を残す案は、現に食い違いが起きていた事実をもって採らなかった。逆に `field-validation.ts` へ寄せる案も採らなかった——正典の側だけが本番経路（`CalculationFields`）から呼ばれ、寸法・箇所数も扱い、箇所数で `COUNT_MIN` / `COUNT_MAX` を参照する単一情報源の作法を既に持つためである。

**丸め設定の下限を `0.01` としたのは、条文（REQ-10.3 が改訂前に書いていた `-99.99〜99.99`）の側を改めた結果である。** REQ-10.2 が丸め設定を切り上げ**単位**と定め、REQ-10.4 が `0` に「未設定」の意味を与え、`applyRounding()` が単位 `0` 以下で例外を投げる以上、負の下限は「範囲判定を通った値が計算で落ちる」領域を作るだけである。改訂の根拠と採らなかった案は `requirements.md` の Requirement 10 の直後と、正典ファイルの `FIELD_RANGE_CONFIG` の説明に置いた。

**値 `0` は範囲判定の層に属さない**: REQ-10.4（0 と空白は既定値 `0.01` へ差し替える）が REQ-10.3（範囲判定）に**優先する**。正典が丸め設定の `0` を範囲外と返すのは意図であり、呼び出し側が差し替えを先に行う。描画される実装は既にこの順序で動いている——`frontend/src/components/quantity-table/CalculationFields.tsx` の `AdjustmentField` が焦点喪失の時点で `0` を既定値へ差し替える。**結線では範囲判定をその差し替えの後に置くこと。** 順序の根拠と採らなかった案は `requirements.md` の Requirement 10 の直後にある。

**受入検証に、改訂によって偽になった主張が一件残っている**: `e2e/specs/quantity-tables/field-specification.spec.ts` の `10.1, 10.3: 面積・体積選択時に丸め設定フィールドが表示され-99.99〜99.99の範囲で入力できる` は、表題も本体も改訂前の範囲を主張しており、丸め設定へ `-99.99` を入れて保持されることを確かめている。結線が無い現状では通るが、範囲判定を結ぶと落ちる。**是正は受入検証の所管であって、本節の正典の確定とは別の作業である。**

**バックエンドは本タスクの境界外であり、二系統が残っている**: `backend/src/services/quantity-field-validation.service.ts` の `FIELD_CONSTRAINTS.ROUNDING_UNIT` が `-99.99〜99.99`、同ファイルの `validateItemFieldSpecs` が直書きの `0.01〜999.99` である。フロントの正典はこの双方より狭いため「保存できない数量表が残る」向きの害は生じないが、バックエンドの正典化は別途起票が要る。**この段はタスク 80.1 時点の記録である。二系統はタスク 85.1 が解消した**——下の「バックエンドの数値欄の範囲を本節の正典へ揃えた」の段を読むこと。

**範囲判定を描画される欄へ結線した（タスク 80.2）。** 結線先は `frontend/src/components/quantity-table/EditableQuantityItemRow.tsx` の数量欄と、`frontend/src/components/quantity-table/CalculationFields.tsx` の調整係数・丸め設定・寸法・ピッチ計算・箇所数計算の各欄である。`frontend/src/components/quantity-table/FieldValidatedItemRow.tsx` は本番の描画経路から参照されないため直していない（そのまま残す判断とその根拠は同ファイルの冒頭の説明に置いた）。層の順序は正典のとおり「既定値差し替え → 範囲判定」であり、差し替えの規則も `frontend/src/utils/numeric-range-validation.ts` の `FIELD_DEFAULT_SUBSTITUTION` へ置いて単一の出所とした。範囲外の値は欄で確定させず、範囲内の値の入力を求める。

**調整係数の `0` は既定値へ差し替えない（同タスク）。** REQ-9.4 は空白だけを既定値「1.00」の対象と定めており、`0` は REQ-9.3 の有効域 `-9.99〜9.99` の内側である。改める前の `AdjustmentField` は `0` も既定値へ差し替えていたが、これは丸め設定（REQ-10.4）のための差し替えが同一部品を使う調整係数へ相乗りしたものであった。**80.1 が確定させた「AC 4 が先」の順序は丸め設定の条文に根拠を持つものであり、調整係数へは横展開しない。** あわせて、両欄に置かれていた `warningCondition={(v) => v <= 0}` を撤去した——同条件は REQ-9.3 が有効域と定める `-9.99〜0` に対して警告を出しており、要件と食い違っていた。丸め設定側の同条件は範囲判定（下限 `0.01`）に包含される。

**保存前の整合性チェック（REQ-11.2）と欄の層は、規則ではなく役割が違う（同タスク）。** `frontend/src/pages/QuantityTableEditPage.tsx` の `handleSave` は丸め設定を検め、以前は `<= 0` を直書きしていた。これを正典の `validateNumericRange` へ委ね、範囲の出所を一つにした。**同層は `0` を既定値へ差し替えず拒否する。** 欄は未設定を繕う層であり、保存前の検査は繕われた後の最終状態を検める層である。ここまで残った `0` は利用者が打った「未設定の印」ではなく、どの欄の層にも触れられずに紛れ込んだ値であり、`applyRounding()` が単位 `0` 以下で例外を投げる以上、REQ-11.2 が保存を中断すべき不整合そのものである。

**数量欄の負の値は範囲外ではない（同タスク）。** REQ-15.1 の有効域 `-999999.99〜9999999.99` は負を含み、REQ-8.3 は計算方法「標準」での負値に対し**警告して確認を求める**ことを課す。結線にあたり両者を分け、範囲外は誤り（赤・確定させない）、負値は警告（黄・確定させる）として提示する。

**「保存できない数量表が残る向きの害は生じない」は丸め設定についての主張であり、調整係数には及ばない（タスク 80.2 の是正）。** 上のバックエンドの段は丸め設定を見て書かれたものであり、記述はそのまま残す。調整係数については次のとおりである——保存経路 `backend/src/routes/quantity-tables.routes.ts` の `saveDraftItemSchema` は `adjustmentFactor` に `z.number().positive()` を課しており、REQ-9.3 の有効域 `-9.99〜9.99` が内側に含む `0` と負値を 400 で拒む。**フロントの正典は保存経路より広い。**

**この食い違いは条文の側の誤りとは読まなかった（同タスク）。** 根拠は三点である。(1) 条文が内部で食い違っていない——REQ-9.2 / REQ-9.3 / REQ-9.4 は整合しており、丸め設定における REQ-10.4 のように `0` へ別の意味を与える条文が無い。(2) 計算が落ちない——`applyAdjustmentFactor()` は単なる乗算であり例外を投げないため、タスク 80.1 が下限拡張を退けた根拠「範囲判定を通った値が計算の時点で落ちる」は調整係数には当てはまらない。(3) 少数派は保存経路の側である——同じバックエンドの `backend/src/services/quantity-field-validation.service.ts` の `FIELD_CONSTRAINTS.ADJUSTMENT_FACTOR` は `-9.99〜9.99` であり、条文および本節の数値フィールド仕様表と一致する。**採らなかった案**: REQ-9.3 の有効域を `0.01〜9.99` へ狭めて条文を保存経路へ合わせる（タスク 80.1 が REQ-10.3 に対して行った形）。上の三点により条文の側に誤りを見いだせず、「実装が要件に合っていないから要件を書き換える」を既定の解にしない作法にも反するため採らなかった。**是正の向きはバックエンドであり、別途の起票を要する。**

**それまでの間、画面が黙って行き止まりへ導かないようにした（同タスク）。** 調整係数の `0` と負値については、範囲エラーとは**別の層・別の文言**で「保存できない」ことを欄の時点で告げ、`handleSave` の整合性チェック（REQ-11.2）でも保存を中断して問題箇所を名指す。範囲外の誤りと混同させないため、文言は範囲を語らない。判定の出所は `frontend/src/utils/numeric-range-validation.ts` の `validateSavePersistability` 一つであり、条文が有効と認める領域を「範囲外」と呼び替えてはいない。**採らなかった案**: 画面では何も告げず保存時の 400 に委ねる。改める前の実装は `0` を既定値へ差し替えていたためこの行き止まりは到達不能であり、相乗りを断つ是正が到達可能にした以上、到達可能にした側で塞ぐ。

**バックエンドの数値欄の範囲を本節の正典へ揃えた（タスク 85.1）。** バックエンド側の唯一の出所は `backend/src/services/quantity-field-validation.service.ts` の `FIELD_CONSTRAINTS` であり、丸め設定 `0.01〜99.99` と調整係数 `-9.99〜9.99` が `frontend/src/utils/numeric-range-validation.ts` の `FIELD_RANGE_CONFIG` と一致する。**数量については保存経路だけが一致しており、作成・更新の経路は一致していない**（下の申し送りの段を読むこと）。判定の文言も同定数から組み立てるため、境界値をどこにも書き写さない。`backend/src/routes/quantity-tables.routes.ts` の `saveDraftItemSchema` は範囲を課さず `z.number()` に留め、範囲判定は `validateDraft` → `validateItemFieldSpecs` の一手に集約する——`quantity` が以前からこの層立てであり、そこへ調整係数と丸め設定を合わせた。`backend/src/schemas/quantity-table.schema.ts` の作成用・更新用スキーマは同じ `FIELD_CONSTRAINTS` から下限・上限を引く（作成経路と保存経路で範囲が食い違うと「作成できるが保存できない数量項目」が生まれる）。**採らなかった案**: ルート層の zod にも `.min()` / `.max()` を課して二重に検める。**位置を名指せるかどうかが理由ではない**——zod も `issues[].path` を持ち、`backend/src/middleware/validate.middleware.ts` がそれを `details[]` へ載せるため `groups.0.items.0.adjustmentFactor` の形で名指せる（2026-09-11、コミット `b7cc19f6` を起点に、同構造のスキーマへ `safeParse` を掛けて実測した）。退けた理由は、同じ不変条件に対して**応答の形とコードが二つになる**こと（zod 違反は `ValidationError` の `code: VALIDATION_ERROR`・`details[]`、サービス層の違反は `QuantityTableValidationError` の `code: QUANTITY_TABLE_VALIDATION_ERROR`・`validationErrors`。どちらが返るかは「どの層が先に走ったか」で決まる）と、**二重に課すと正典を一箇所で動かしても片方が追随しない**ことである（後者は本タスクが `backend/src/services/quantity-validation.service.ts` で現に踏んだ。下の段を読むこと）。**採らなかった案**: 範囲だけを持つ新しいモジュールを起こして三者から取り込む。同サービスは既に 13.1-13.3 の上限の正典として同じ役目を負っており、数値欄だけを別の箇所へ置くと「フィールド仕様の正典」が二つに割れる。**フロントとバックエンドは言語もパッケージも異なり取り込み合えないため、値は一致させてあるが二箇所に書かれている。** 変えるときは双方を同時に動かすこと。両ファイルの当該定数の説明が互いの位置を指している。

**調整係数の食い違いを名指していた暫定の層は、もう無い（同タスク）。** タスク 80.2 が置いた `SAVE_POSITIVE_ONLY_FIELD_TYPES` と `validateSavePersistability`、および `AdjustmentField` の `saveBlockedWarning` と `handleSave` の同判定は、保存経路が REQ-9.3 の有効域の内側（`0` と負値）を拒むあいだだけ、画面が黙って行き止まりへ導かないようにするためのものであった。その前提が消えたので層ごと取り去った——**向きは反転しており、調整係数の `0` と負値はいま何の提示も出さずそのまま保存される。** `handleSave` に残るのは丸め設定と同じ範囲判定（`validateNumericRange`）だけであり、有効域の外は引き続き保存を中断して問題箇所を名指す。反転を固定する検証は単体（欄・行・保存前検査の三層）と受入検証の双方に置いてあり、保存されて読み戻せることはバックエンドの統合検証が確かめる。

**バックエンド内に第六の系統があり、これも畳んだ（同タスク。独立レビューの指摘による是正）。** `backend/src/services/quantity-validation.service.ts` の `validateAdjustmentFactor` と `validateRoundingUnit` が、`adjustmentFactor <= 0` を警告として、`roundingUnit <= 0` を直書きの文言「丸め設定は0より大きい値を入力してください」で報じていた。**これは死コードではなく**、`QuantityTableService.validateDraft` が保存のたびに `validateQuantityItem` を呼ぶ経路で生きていた。表面化しなかったのは、同メソッドが同一フィールドの二件目を採らない重複抑止を持ち、正典側の文言が先に載っていたためである。**正典の値を一箇所で動かしても API 層の挙動が追随しない重複**であったことは変異で測れる——`FIELD_CONSTRAINTS.ROUNDING_UNIT.min` を `-99.99` へ戻す変異を当てても、畳む前は保存経路の `0` と負値が 400 のまま緑で、落ちるのは下限未満の正値の一件だけであった（2026-09-11、コミット `b7cc19f6` を起点にリポジトリルートで `docker exec -e NODE_ENV=test architrack-backend-test npm run test:integration -- src/__tests__/integration/quantity-table-save.api.integration.test.ts` で実測）。是正として同サービスから範囲の判定を外し、**数値であること（NaN / Infinity でないこと）の検査だけを残した**——範囲判定は `value < min || value > max` の形であり NaN はどちらの比較も偽になるため、両者は別の不変条件である。**採らなかった案**: 同サービスから正典を呼んで経由させる。同一フィールドの同じ違反を二度報じることになり、重複抑止に依存して片方が沈黙する構造——いま解消しているもの——を別の綴りで作り直すだけであるため採らなかった。

**数量の範囲は作成・更新の経路でまだ条文と食い違っている（同タスク。申し送り）。** `backend/src/schemas/quantity-table.schema.ts` の作成用スキーマと更新用スキーマは `quantity` に `z.number().nonnegative(...)` を課しており、**REQ-15.1 の有効域 `-999999.99〜9999999.99` が内側に含む負値を 400 で拒む**。一致しているのは保存経路（`saveDraftItemSchema` は `z.number()` で範囲を課さず、`validateItemFieldSpecs` が正典から判定する）だけである。実測は 2026-09-11、コミット `b7cc19f6` を起点にリポジトリルートで `grep -n 'quantity: z.number().nonnegative' backend/src/schemas/quantity-table.schema.ts` を実行し 2 件（作成用・更新用）を確認した。**タスク 85.1 でこれを直さなかったのは、同タスクの `_Requirements:` が 9.3 / 10.3 であり REQ-15.1 が別の受入基準の所管であるためである。** ただし同じスキーマの隣接する行を触っている以上、`## Implementation Notes` の 77.1 の学び（同じ害へ到達する経路を全数で数えること）に照らして書き残す。是正の向きは調整係数でタスク 85.1 が採ったものと同型である——条文の側に誤りを見いだせないため、実装を条文へ揃える。別途の起票を要する。

**タスク 90 の経緯が置く前提の一つは、タスク 85.1 で偽になった（同タスク。申し送り）。** 同節は「バックエンドは `validateItemFieldSpecs` が `0.01〜999.99` を許すため、そうした値が永続化されている可能性がある」と書いているが、**その上限はもう `99.99` である**。したがってタスク 85.1 の後に新しく `(99.99, 999.99]` の丸め設定が永続化されることはない——保存経路も作成・更新の経路も正典の範囲で拒む。**タスク 90.1 が救済すべき対象は、タスク 85.1 より前に永続化された既存行だけに閉じた。** 実測は 2026-09-11、コミット `b7cc19f6` を起点にリポジトリルートで `grep -n 'roundingUnitMin\|roundingUnitMax' backend/src/services/quantity-field-validation.service.ts` が着手時に `530: const roundingUnitMin = 0.01;` / `531: const roundingUnitMax = 999.99;` を返し、是正後は 0 件になることで確かめられる。**袋小路そのものはタスク 85.1 が作ったものではない。** タスク 80.2 以降、`frontend/src/pages/QuantityTableEditPage.tsx` の `handleSave` が正典の範囲判定で保存を中断しており、画面からは既に保存できない。タスク 85.1 が変えたのは API を直接叩く経路が画面と同じ挙動になったことだけで、袋小路の範囲は広がっていない。**テスト環境のデータベースで範囲外の行が 0 件であることは本番を測ったことにならない**ため、実データの有無の確認はタスク 90.1 の箇条が課すとおり同タスクで行うこと。

**範囲外の既存値を持つ項目の保存の出口を設けた（タスク 90.1）。上の段が課した実データの有無は、この環境から到達できる範囲で測った。決定的な測定である本番は測れていない。** 上の段は残し、90.1 の実測と判断をここへ併記する（規約 (a)）。

- **測った事実**（いずれもコミット `9bea407d` の作業ツリー、2026-09-12、リポジトリルートで実行）: テスト環境は `docker exec architrack-postgres-test psql -U postgres -d architrack_test -At -c "select count(*) from quantity_items"` の出力が `0` である。**母集団が空なので、範囲外が 0 件であることは何も示さない。** 開発環境は停止していたコンテナを測定のためだけに起動し、測定後に停止へ戻した（`docker start architrack-postgres-dev` → 問い合わせ → `docker stop architrack-postgres-dev`）。数量項目は 13 件で、丸め設定が `0.01〜99.99` の外・調整係数が `-9.99〜9.99` の外・数量が `-999999.99〜9999999.99` の外の行はいずれも 0 件だった（丸め設定・調整係数は 13 件すべてが既定値のままで、最終更新は 2026-06-08）。**本番のデータベースはこの環境から到達できない**（タスク 86.4 と同じ）。したがって「範囲外の既存値は無い」とは書けない。本番で走らせる読み取り専用の問い合わせは tasks.md の 90.1 の記録に置いた
- **範囲外の値を永続化しえた経路**（`git show` で当時のコードを読んだものであり、経路を実行して確かめてはいない）: (i) 保存経路は、`4ab87da9` から `c557cfa2` の親まで、`saveDraftItemSchema` の `positive()` と `validateItemFieldSpecs` の直書き `0.01〜999.99` で丸め設定を検めていた。**丸め設定の `(99.99, 999.99]` が通った。** 同じ経路の調整係数と数量は正典の内側に収まっていた。(ii) 作成用・更新用スキーマは、`c557cfa2` の親の版で、丸め設定と調整係数には正値であることだけを、数量には非負であることだけを課し、上限を持たなかった（`git show c557cfa2^:backend/src/schemas/quantity-table.schema.ts | grep -cE '\.(positive|nonnegative)\(QUANTITY_TABLE_VALIDATION_MESSAGES\.(ADJUSTMENT_FACTOR_INVALID|ROUNDING_UNIT_INVALID|QUANTITY_INVALID)\)'` の出力が `6`。作成用・更新用の各3欄である）。上限は列の精度（`@db.Decimal(10, 4)` / `@db.Decimal(15, 4)`）だけである。`0ee7c796` から同じ形であったかは一版ずつは確かめていない。画面はコミット `628fbe96`（2026-06-06）の直前の版で、この作成経路を呼んでいた（`git show 628fbe96^:frontend/src/pages/QuantityTableEditPage.tsx | grep -cF 'createQuantityItem'` の出力が `4`）。**丸め設定の上限超過に加え、調整係数の上限超過と数量の上限超過も在りうる。** 数量の上限超過は、保存前の整合性チェックが数量を見ていなかったため保存経路の 400 で初めて止まり、画面は一般の「再度お試しください」を出していた
- **判断——「在るなら移行、無いなら告知の改善」の二択を採らず、実データの有無によらず正しい出口を置いた。** 在った場合も無かった場合も、出口は利用者を誤らせない。在るなら、利用者は名指された項目を直すか、欄の無い項目では既定値へ戻して保存できる。無いなら、告知の改善として働くだけで害は無い。**これは「測らずにどちらかを決める」ことには当たらない**——決めたのは出口であって、実データの有無ではない。本番の件数は未測定のまま残した
- **採った形**: 保存前の整合性チェック（`frontend/src/pages/QuantityTableEditPage.tsx` の `handleSave`）の告知が、項目・欄・現在の値・範囲を名指す。範囲は正典の `FIELD_RANGE_CONFIG` から引く。欄が描画される項目では範囲内の値の入力を求め、欄から直させる（REQ-10.3）。計算方法「標準」の項目の調整係数・丸め設定だけは欄が描画されない（REQ-10.8）ので、告知に既定値へ戻す操作を添える。操作は告知が名指した一項目の一欄だけを既定値（`FIELD_DEFAULT_SUBSTITUTION`）へ戻し、ドラフトを変えるだけで保存はしない（REQ-42.7）。操作は、それを名指した告知が表示されている間だけ出る。数量の範囲判定も同じ層へ加えた。範囲は保存経路と同じ正典の値なので、画面だけが弾く状態は作らない。数量の欄は計算方法によらず描画されるため、既定値へ戻す操作は出さない
- **77.1 の学び（遡及的なデータ是正は入力検証の境界の外）と衝突しない**: 本タスクの境界は入力検証ではなく「範囲外の既存値を持つ数量表の保存の出口」である。値を書き換えるのは、利用者が名指された一件の告知で押す操作だけで、永続化済みの行を一括で書き換える処理は置いていない。欄の入力検証の範囲も、保存経路の範囲も変えていない
- *採らなかった案*: (1) **移行で既存行を正典の範囲へ寄せる**——本番の件数を測れないまま、利用者が入力していない値を書き換えることになる。`250` のような丸め単位は、利用者が意図して置いた値でありうる。出口がある以上、保存できるようにするために移行が要るわけではない。**本番の測定で該当が多数見つかり、一件ずつ直す手間が問題になった場合に再検討すること。** (2) **読み込み時・保存時に黙って既定値へ寄せる**——計算方法の切替は調整係数と丸め設定を引き継ぐ（`frontend/src/components/quantity-table/EditableQuantityItemRow.tsx` の `handleCalculationMethodChange` は両者を `calculate` へ渡し、書き換えない）。そのため「標準」で見えない値も切替後の数量に効き、黙って寄せると利用者の知らないところで数量が変わる。欄が描画される項目では、直ちに数量が変わる。(3) **「標準」でも欄を開いて直させる**——REQ-10.8 は「標準」で丸め設定の欄を表示しないと定める。(4) **「標準」の項目では範囲判定を省く**——保存経路（`validateItemFieldSpecs`）は計算方法によらず範囲を課すので、画面だけ省いても 400 で止まる。保存経路まで緩めると、タスク 85.1 が閉じた「範囲外の値が新たに永続化される」経路を開き直すことになる
- **保証しないこと**: 本番に範囲外の既存値が在るか、在るなら何件か。寸法・ピッチ・箇所数の計算パラメータ（`calculationParams`）の範囲外の既存値は、本タスクの走査に入れていない。保存経路が計算パラメータの範囲をどう検めるかを本タスクは測っていない

**範囲外を拒むときの見え方は欄ごとに揃っていない（同タスク。判断の材料として記録する）。** 数量欄（`EditableQuantityItemRow`）と調整係数・丸め設定（`AdjustmentField`）は小数2桁へ整形してから拒む（REQ-14.2 の常時2桁表示に合わせた）。寸法・ピッチ計算・箇所数計算の各欄（`NumberInputField`）は生の入力を保ったまま拒む（箇所数でタスク 68.2 が定めた既存の作法をそのまま広げた）。**揃えるには箇所数欄の既存の見え方を変えることになるため、本タスクでは揃えていない。** 受入検証（タスク 80.3）が提示の作法を決めるときの材料である。いずれの欄も共通して、拒んだ値を親の状態へ確定させない。

**数値以外の入力の拒否を実装した（タスク 80.3）。** REQ-8.4（数量）・REQ-9.5（調整係数）・REQ-10.5（丸め設定）は「入力を拒否しエラーメッセージを表示する」ことを課すが、タスク 80.2 までは実装が無く、`e2e/specs/quantity-tables/quantity-table-crud.spec.ts` に `test.fail()` のラチェットとして残っていた。**タスク 80.3 の `_Requirements:` はこの3件と範囲外の2件（REQ-15.1 / 15.3）の両方を挙げており、タスク 80 の節そのものも「5件のラチェットが是正の完了を測る」と書いている。** 範囲外の2件だけを外して3件を残す道を採ると、タスク 80 のどの子も 8.4 / 9.5 / 10.5 を実装しないままラチェットだけが残り、被覆の宣言と実態が食い違う。ゆえに実装した。

**空白と数値以外は別の層である（同タスク）。** REQ-9.4 / REQ-10.4 / REQ-15.2 は**空白**に「既定値の自動設定」という帰結を与えており、REQ-8.4 / 9.5 / 10.5 の「拒否」とは別の規範である。改める前の `resolveFieldInput`（`frontend/src/utils/numeric-range-validation.ts`）は空白と数値以外を同じ枝で既定値へ倒しており、呼び出し側から両者を区別できなかった。戻り値を `FieldInputResolution`（`isNumeric` を持つ構造体）へ改め、判別を型で強制した。**数値の部分読み（`Number.parseFloat('12abc')` が `12` を返す形）は採らない**——条文は「数値以外の文字が入力される」ことを拒否の条件としており、先頭が数字であることを免罪符にしない。

**拒否は焦点喪失の時点だけで行う（同タスク。IME）。** 打鍵ごとに値を検査して弾く形は採らなかった。日本語入力の変換中（`compositionstart` 〜 `compositionend`）に値へ手を入れると変換が壊れ、しかも Playwright の `fill()` も `fireEvent.change` も変換を経由しないため、その欠陥は E2E でも単体でも構造的に検出できない（本スペックの `## Implementation Notes（越境して実行された是正）` が単位欄で踏んだ事故である）。焦点喪失は変換確定より後に起きるため、この作法には変換中の面が一切無い。**それでも変換の面が無いことを固定する検証を置いた**——`frontend/src/components/quantity-table/EditableQuantityItemRow.test.tsx` と `frontend/src/components/quantity-table/CalculationFields.test.tsx` に、変換イベントを明示的に起こして変換途中の文字列が書き換わらないことを確かめる検証がある。打鍵ごとの絞り込みを入れる変異を当てるとこれらが落ちる。

**拒否したときは既定値ではなく直前の確定値へ戻す（同タスク）。** 既定値へ倒すと「拒否された」のか「既定値に戻された」のかを利用者も受入検証も区別できない。親の状態が持つ値を欄へ書き戻し、親へは何も渡さない。

**見え方の非対称はタスク 80.3 でも揃えなかった。** 上の段がタスク 80.3 へ委ねた判断への回答である。要件が課すのは「エラーメッセージを表示し、範囲内の値の入力を求める」ことであって、拒んだ値を欄でどう見せるかは条文が定めていない。揃えるには箇所数欄（REQ-47）の既存の見え方を変えることになり、それは本タスクが実装する受入基準のどれも要求していない。**したがって受入検証は欄の文字列を主張の中心に置かない。** 代わりに「親の状態へ確定していないこと」を画面に現れる結果で観測する——数量欄は未保存インジケーター（REQ-44.1）の不在で、寸法欄と丸め設定は自動計算された数量（REQ-8.6 / REQ-10.2）が動かないことで確かめる。**いずれも先に「有効な値なら確かに確定する」ことを同じ経路で示してから不在を主張する**（示さないと、確定の経路がそもそも死んでいるだけで不在の主張が成立してしまう）。

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

### 箇所数計算フィールド仕様（REQ-47）

| フィールド | 必須 | 配置 | 入力可能範囲 | デフォルト値 | 表示書式 |
|-----------|------|------|--------------|--------------|----------|
| 箇所数 | 必須 | 右寄せ | 1〜9999999（**整数のみ**） | 空白 | 整数表示（小数桁を付与しない）、空白時は表示なし |
| 長さ（箇所数用） | - | 右寄せ | 0.01〜9999999.99または空白 | 空白 | 数値入力時は小数2桁、空白時は表示なし |
| 重量（箇所数用） | - | 右寄せ | 0.01〜9999999.99または空白 | 空白 | 数値入力時は小数2桁、空白時は表示なし |

**制約**: 計算方法が「箇所数」の場合、箇所数が必須。小数を含む値は入力を拒否する。

**フィールド順序**: 箇所数 → 長さ → 重量 → 調整係数 → 丸め設定

**書式上の注意**: 既存の `NumberInputField`（`CalculationFields.tsx`）は blur 時に `numValue.toFixed(2)` を**無条件で適用**しており、数量表内に整数専用フィールドの前例が1つも存在しない。本設計では `FieldDefinition` と `NumberInputField` に `integer?: boolean` を追加し、`integer` が真のときのみ `parseInt` による整数整形と `inputMode="numeric"` を適用する。これにより既存の小数フィールドの挙動は一切変わらない。

**この二つの断言（無条件の適用・整数専用フィールドの前例が 1 つも無いこと）は本節を書いた時点の記録であり書き換えない（タスク 115.234。`site-survey` の design.md「実測値の書き方（タスク 115.212）」の (a) に従う）。再実測ではどちらも偽である**——`CalculationFields.tsx` の整形は `formatFieldValue` に集約され `integer` で分岐するため `toFixed(2)` は無条件ではなく、整数専用フィールドは同ファイルの `COUNT_FIELDS` が持つ `count`（箇所数）の 1 件がある。本節の設計がコミット `01b46ca`（2026-07-17）で実装され、同じコミットに本節の記述も入っているため、記述はそのコミットの時点で既に偽であった（`git log -S` と `git show 01b46ca^` で一件ずつ確かめた）。コミット `6b84be3`。2026-09-02 にリポジトリルートで実測。

## Components and Interfaces

### Component Summary

| Component | Domain/Layer | Intent | Req Coverage | Key Dependencies | Contracts |
|-----------|--------------|--------|--------------|------------------|-----------|
| QuantityTableService | Backend/Service | 数量表のCRUD操作・コピー | 2.1-2.5, 11.1-11.5, 17.1-17.7 | PrismaClient (P0), AuditLogService (P1) | Service, API |
| QuantityGroupService | Backend/Service | 数量グループのCRUD操作と画像紐付け | 3.1-3.3, 4.1-4.5, 22.1-22.5, 23.1-23.8 | PrismaClient (P0) | Service, API |
| QuantityItemService | Backend/Service | 数量項目のCRUD・計算検証 | 5.1-5.5, 6.1-6.5, 8.1-8.11, 9.1-9.8, 10.1-10.8, 24.1-24.8 | PrismaClient (P0), CalculationEngine (P0), QuantityValidationService (P0) | Service, API |
| QuantityValidationService | Backend/Service | フィールドバリデーション | 8.3, 8.4, 8.7, 8.10, 9.3-9.5, 10.3-10.5, 13.1-13.4, 14.1-14.5, 15.1-15.3 | - | Service |
| AutocompleteCandidatesEndpoint | Backend/Route | オートコンプリート候補一括取得 | 7.1, 7.2 | PrismaClient (P0) | API |
| CalculationEngine | Shared/Utility | 数量計算ロジック | 8.1-8.11, 9.1-9.8, 10.1-10.8 | decimal.js (P0) | Service |
| QuantityTableEditPage | Frontend/Page | 数量表編集画面 | 3.1-3.3, 7.1, 25.1-25.6, 27.1 | QuantityGroupComponent (P0), AutocompleteCandidateStore (P0), ImportDialog (P1) | State |
| QuantityTableSectionCard | Frontend/Component | プロジェクト詳細の数量表セクション | 1.1-1.7 | - | - |
| AutocompleteCandidateStore | Frontend/State | オートコンプリート候補のクライアントサイド管理 | 7.1-7.4, 7.6-7.8 | - | State |
| AutocompleteInput | Frontend/Component | オートコンプリート対応テキスト入力 | 7.3-7.8, 16.1-16.7 | AutocompleteCandidateStore (P0) | - |
| CopyQuantityTableDialog | Frontend/Component | 数量表コピーダイアログ | 17.1, 17.3, 17.6 | - | - |
| QuantityGroupTitleRow | Frontend/Component | 数量グループのメインタイトル行 | 18.1, 18.2, 18.5 | - | - |
| PhotoChangeDialog | Frontend/Component | 注釈付き写真変更ダイアログ | 19.1-19.4 | QuantityGroupCard (P0) | - |
| PhotoPreviewDialog | Frontend/Component | 注釈付き写真プレビューダイアログ | 20.1-20.3 | QuantityGroupCard (P0) | - |
| PhotoCommentDisplay | Frontend/Component | 写真コメント表示 | 21.1-21.5, 35.1-35.7 | QuantityGroupCard (P0) | - |
| SortOrderButtons | Frontend/Component | 並び順変更ボタンUI | 23.3-23.8 | - | - |
| QuantityItemActionMenu | Frontend/Component | 数量項目アクションメニュー（並び替え・削除・コピー統合／Portal 描画） | 36.1-36.9, 46.1-46.11 | EditableQuantityItemRow (P0), react-dom createPortal (P0) | - |
| CalculationMethodRegistry | Frontend/Utility | 計算方法の表示順・表示ラベル・選択肢の単一情報源（`utils/calculation-method.ts`） | 47.1, 47.17 | - | - |
| CalculationFields | Frontend/Component | 計算方法別の計算用フィールド群の描画（面積・体積／ピッチ／箇所数） | 8.5, 8.8, 8.13, 37.1-37.13, 47.2, 47.12-47.14 | CalculationEngine (P0), numeric-range-validation (P0) | - |
| QuantityTablePdfExportService | Frontend/Service | 数量表PDF出力サービス | 26.1-26.12 | jsPDF (P0), PdfFontService (P0) | Service |
| FieldValidator | Frontend/Utility | フィールド入力制御・書式 | 13.1-13.4, 14.1-14.5, 15.1-15.3 | - | Service |
| ImportDialog | Frontend/Component | 数量表インポートダイアログ | 27.1-27.8, 31.1-31.9, 33.1-33.5, 34.1-34.5 | ImportDataExtractor (P0), ImportPreviewTable (P0), ImportFieldMapping (P0) | State |
| ImportDataExtractor | Frontend/Service | インポートデータ抽出サービス | 28.1-28.7, 29.1-29.10, 30.1-30.7 | SheetJS (P0), pdfjs-dist (P0), tesseract.js (P1), ClaudeVisionAPI (P1) | Service |
| ImportPreviewTable | Frontend/Component | インポート抽出結果プレビューテーブル | 28.4-28.7, 31.1, 32.1-32.6 | ImportFieldMapping (P0) | - |
| ImportFieldMapping | Frontend/Component | インポートフィールドマッピング調整UI | 32.1-32.6 | - | - |

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
  name: string;
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
  // 取得時に紐付けを落としたグループのID（落としていなければ空配列。タスク 86.5）。
  // 他プロジェクトの画像IDは含まない。経緯は「### Error Categories and Responses」を参照
  droppedSurveyImageLinkGroupIds: string[];
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
- **上の `Copy:` の「写真紐づけ（surveyImageId）はコピー先でも維持する」の現況（タスク 91.1）**: 書いた時点の記録として残す（規約 (a)）。**他プロジェクトの現調画像を指す紐づけだけは複製先へ写さない**（複製先の `surveyImageId` は `null` になる）。複製そのものは従来どおり 201 で成功し、応答の形も変えていない。取得経路（タスク 86.3）が同じ紐付けを `surveyImageId` ごと落とすため、利用者から見て「紐づけられている写真」ではなく、REQ-17.7 が維持を求める対象に当たらない。所属の判定に用いる `survey.projectId` は元の数量表を引く既存の1回の問い合わせの取得項目を広げて得るため、グループ数に比例した問い合わせは増えない。親の現場調査が論理削除された画像の紐づけは落とさずに写す。結論・採らなかった案・利用者へ告げない判断は `### Error Categories and Responses` に置いた
- Risks: 大量のグループ・項目を持つ数量表の取得パフォーマンス

---

#### QuantityGroupService

| Field | Detail |
|-------|--------|
| Intent | 数量グループのCRUD操作と現場調査画像との紐付け管理、名前変更、並び順管理、現場調査からの一括生成を担当 |
| Requirements | 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 22.1, 22.2, 22.3, 22.4, 22.5, 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7, 23.8, 40.3, 40.4, 40.5, 40.6, 40.7, 40.9, 40.10, 40.12 |

**Responsibilities & Constraints**

- 数量グループの作成・更新・削除
- 現場調査画像との紐付け・解除
- グループの表示順序管理
- グループ内の数量項目の集約取得

**Dependencies**

- Inbound: QuantityTableRoutes (P0), QuantityTableService (P1)
- Outbound: QuantityItemService (P1)
- External: PrismaClient (P0)

**Contracts**: Service [x] / API [x]

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
  /**
   * 現場調査からの数量グループ一括生成（REQ-40）
   * 対象現場調査の全写真（注釈有無問わず）を写真順に取得し、写真枚数分のグループを
   * 既存グループの末尾に連番命名で原子的に生成する。各グループに写真を1枚ずつ紐づける。
   * 写真0枚の場合は何も生成せず created: 0 を返す。エラー時はトランザクションをロールバックする。
   */
  createGroupsFromSurvey(
    input: CreateGroupsFromSurveyInput,
    actorId: string
  ): Promise<CreateGroupsFromSurveyResult>;
}

interface CreateGroupsFromSurveyInput {
  quantityTableId: string;
  siteSurveyId: string;
}

interface CreateGroupsFromSurveyResult {
  /** 生成された数量グループ（末尾追加、写真順） */
  groups: QuantityGroupInfo[];
  /** 生成件数（写真0枚の場合は 0） */
  created: number;
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
  annotatedThumbnailUrl: string | null;
  comment: string | null;
  annotations: Annotation[];
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
| POST | /api/quantity-tables/:tableId/groups/from-survey | { siteSurveyId: string } | CreateGroupsFromSurveyResult | 400, 404 |

**実体を持たない二つのメソッド名の現況（Task 93.1 の併記）**

上の Service Interface が挙げる `linkSurveyImage(id: string, surveyImageId: string): Promise<QuantityGroupInfo>;` と `unlinkSurveyImage(id: string): Promise<QuantityGroupInfo>;` の2行は、書いた時点の記録として残す。**この2つの名前に対応する実装をバックエンドは持たない。** 実測はいずれもコミット `e37a84b9`（本項の追記より前）の作業ツリーで、2026-09-12 にリポジトリルートから行った。

- **不在の実測**: `grep -rnw -E 'linkSurveyImage|unlinkSurveyImage' backend/src` は当たりを一つも返さない（出力は空、終了コードは 1）
- **挙動が欠けているのではない。実体は `update()` が担っている。** `backend/src/schemas/quantity-table.schema.ts` の `updateQuantityGroupSchema` が `surveyImageId` を nullable かつ optional で受け、`backend/src/routes/quantity-groups.routes.ts` の `PUT /api/quantity-groups/:id` がその値を `quantityGroupService.update` へ渡し、`backend/src/services/quantity-group.service.ts` の `update()` が `input.surveyImageId !== undefined` のときだけ `updateData.surveyImageId` を書く。**画像IDを与えれば紐付けになり、`null` を与えれば紐付けが外れる。** 二つの操作は一つのメソッドへ畳まれており、**設計文書の側の名前が実装と食い違っている**
- **走査は二つのメソッドで打ち切っていない。Service Interface の全9メソッドを一件ずつ測った。** 再現は `for m in create findById findByQuantityTableId update delete linkSurveyImage unlinkSurveyImage reorder createGroupsFromSurvey; do printf '%s %s\n' "$m" "$(grep -cE "^  (async )?${m}\(" backend/src/services/quantity-group.service.ts)"; done` で、実装の側にメソッド定義を持つのは6件、持たないのは `linkSurveyImage` / `unlinkSurveyImage` / `reorder` の3件である。**`reorder` は実体が `updateDisplayOrder()` であることを Task 88.1 の注が本書で既に開示しており、本項の対象外である**
- **`##### API Contract` の表の2行も同じ不在である。** `PUT /api/quantity-groups/:id/survey-image` と `DELETE /api/quantity-groups/:id/survey-image` に対応する経路を `backend/src/routes/quantity-groups.routes.ts` は登録しない。同ファイルが登録する経路は `grep -A 1 -nE '^router\.(get|put|post|delete)\(' backend/src/routes/quantity-groups.routes.ts` が印字する8件（`/` が2件、`/order`、`/:id` が3件、`/:id/copy`、`/from-survey`）であり、`survey-image` を含むものは一つも無い。**この2行は上の2つのメソッドと同じ操作を HTTP の層で述べたものなので、本項の境界に入れて併記する。** 表の行は書いた時点の記録として残す
- **逆向きの食い違いも同じ走査で見えた（測定のみ・未処置）**: `backend/src/services/quantity-group.service.ts` は `copy()` を持つが、上の Service Interface はこれを挙げていない。同メソッドの契約は本書の「数量グループのコピー機能（REQ-38）」の節が別に述べているため、本項では触れていない
- **範囲外の同型（測定のみ・未処置）**: (i) 同じ表の `PUT /api/quantity-tables/:tableId/groups/reorder` は、実装では `/order` で登録されている（`reorder` 系であり Task 88.1 の開示の範囲、本項の対象外）。(ii) 上の Service Interface の `update()` は3引数だが、実装は `actorId` を加えた4引数である。(iii) 上の `interface UpdateQuantityGroupInput` は `name` と `surveyImageId` だけを挙げるが、`updateQuantityGroupSchema` は `displayOrder` も受ける。(ii) と (iii) はメソッド名の不在ではないため、本項では測っただけで触れていない

**並び順の個別 API が displayOrder を重ねない形（Task 92.1 の決着）**

上の Service Interface と `##### API Contract` の表は書いた時点の記録として残す。Task 88.1 が「個別 API は並行させなくても逐次の呼び出しで displayOrder を重ねる」と申し送った3経路について、Task 92.1 が次のとおり決着させた。実測はいずれも HEAD `4a745c07` の作業ツリーで、2026-09-12 にリポジトリルートから行った。

- **決着**: **逐次の呼び出しについて**「同一数量表の2つのグループが同じ displayOrder を持つ状態」を個別 API に作らせない（並行して送られた要求に対する窓は残る。下の「塞いだ範囲」を見よ）。(1) `createQuantityGroupSchema` の displayOrder から既定値を外して任意にし、省略時はサーバーが採番する。(2) 採番は**件数ではなく最大値 + 1** とする（`resolveCreateDisplayOrder`）。(3) 明示された値が既存と重なる要求は 400 で拒む（`assertDisplayOrderNotTaken`）。更新（`update()`）は自分自身を判定から除くため、自分の現在値を指す更新は通る。(4) 並び替え（`updateDisplayOrder()`）は**適用後の全グループの並び**に重なりが生じる要求を 400 で拒む。文言は `QUANTITY_TABLE_VALIDATION_MESSAGES` の `DISPLAY_ORDER_DUPLICATED` 一本で、3経路とも既存の `QuantityTableValidationError` → 400 の写しに乗るため応答の形は変わらない
- **採番に件数を使うと、それ自体が重なりを作る**（起票が挙げていない第4の穴）。`DELETE /api/quantity-groups/:id` は後続グループの displayOrder を詰めないため、0 と 2 が残る数量表では件数 2 が既存の末尾 2 と一致する。最大値 + 1 なら 3 になる
- **ただし、この枝は本変更の前には公開 API から到達しなかった。** `createQuantityGroupSchema` の既定値が displayOrder を必ず補うため `input.displayOrder` が undefined にならず、件数による既定は経路からは使われなかった（`create()` の呼び出し元はルートだけである）。**既定値を外して省略を許した時点で初めて到達可能になり、同じ変更の中で是正が必要になる。** 件数のままで既定値だけを外すと、上の空き番号のある数量表で重なりが現に生じる（M2 がその状態を再現する）
- **画面からの到達の実測**: 関数名ごとに `grep -rlw '<関数名>' frontend/src --include=*.ts --include=*.tsx | grep -v '\.test\.\|\.stories\.\|__tests__' | grep -v 'frontend/src/api/quantity-tables.ts'` を走らせた。`createQuantityGroup` / `updateQuantityGroup` / `updateGroupDisplayOrder` はいずれも 0 ファイルで、Task 88.1 の実測と一致する。画面の永続化は `saveDraft` の1回に畳まれる（REQ-42）

**塞いだ範囲（逐次のみ）と、残る並行の窓**

**Task 92.1 が塞いだのは逐次の呼び出しの側だけである。並行して送られた要求に対する窓は残る。** `assertDisplayOrderNotTaken` も並び替えの適用後の検査も、いずれも**数えてから書く**形である。そして `create()`・`update()`・`updateDisplayOrder()` は数量表の行ロックを取らない——Task 88.1 が `SELECT ... FOR UPDATE` を置いたのは `saveDraft`・`copy()`・`createGroupsFromSurvey()` の3つであり、本項の3経路は含まれない。したがって Read Committed の下では、2本の要求が互いの書き込みを見ないまま同じ検査を通過し、同じ displayOrder を書きうる。

**これはコードを読んだ判断であって実測ではない。** 本項では並行プローブを走らせていない（Task 88.1 が `saveDraft` について用いた `pg_stat_activity` で先行を保留する決定的な形が流用できる）。塞ぐなら、本項の3経路にも同じ数量表の行ロックを取らせるか、遅延一意制約を置くことになる（後者は下のとおり退けた）。**部分的な是正であることを明示しておく**——重なりの主因であった「呼び出し側が渡す値」と「件数による採番」は消えたが、並行の窓は本項では消していない。

**【現況】Task 92.4 がこの窓の実在を実測し、行ロックで塞いだ。** 上の「コードを読んだ判断であって実測ではない」は Task 92.1 の時点の記録として残す。決着・実測・採らなかった案は下の「並行する要求に対する窓を塞いだ形（Task 92.4 の決着）」に置いた。

**採らなかった案**

- **`(quantityTableId, displayOrder)` の一意制約は採らなかった。画面から到達する唯一の経路を壊すことを実測した。** 検証用データベースへ非遅延の一意索引を当てて統合検証を走らせると、`npm --prefix backend run test:integration -- quantity-table-save.api` が 31 件中 3 件落ちた（基線は 31 件すべて緑）。落ちたのは「新規/更新/削除/並び替えが原子的に永続化され、再取得（GET詳細）で反映が保持される」「移動元グループを同時に削除しても移動した数量項目は失われない（Req 6.4）」「後発 save の競合（stale token）で後発が 409 となり、部分反映なし・displayOrder 衝突が起きない」の3件で、いずれも 200 のはずの応答が 500 になった。`saveDraft` は payload の配列順で既存グループの displayOrder を詰め直してから、payload に無いグループをまとめて削除するため、**詰め直しの途中で削除予定のグループと番号が一時的に重なる**
- 同じ当て方で `npm --prefix backend run test:integration -- quantity-table-sort-order.api` も 4 件中 1 件落ちた（「PUT /api/quantity-tables/:tableId/groups/order で並び順が正しく更新される」が 204 のはずのところ 409）。Prisma の出力は「Unique constraint failed on the fields」に続けて quantityTableId と displayOrder の2列を挙げる（逐語は逆引用符を含むため鉤括弧で示す）。並び替えが1件ずつ更新するため、入れ替えの途中で番号が重なるからである。**通すには遅延制約が要るが、Prisma のスキーマ定義では宣言できず、生SQLの migration を置くとスキーマと実体が食い違う。** 索引は実測後に落とし、`quantity_groups` の索引が2本（主キーと既存の複合索引）へ戻ったことを確かめた
- **撤去も採らなかった（81.1 の学び「塞ぐ前にその経路が本番から呼ばれるかを測ること」に従って利用者を先に数えた）。** `POST /api/quantity-tables/:quantityTableId/groups` は画面からは到達しないが、**E2E の前提条件が 35 箇所で呼んでいる**（``grep -rnF '/groups`' e2e --include=*.ts | grep 'quantity-tables' | wc -l`` の出力が 35。共有ヘルパー `e2e/helpers/estimate-request-preconditions.ts` を含む）。撤去すると見積・内訳書・プロジェクト詳細の E2E が前提を作れなくなる。加えて3経路とも `backend/docs/api-spec.json` に載る公開 API である。並び替えと単体更新は E2E からの呼び出しが 0 件だが、単体更新はグループ名変更と写真紐付けを兼ねるため撤去できない
- **「重複を 400 で拒むだけ」で既定値を残す案も採らなかった。** 既定値が 0 である限り、displayOrder を省いた作成が2件目から必ず 400 になり、省略を許す API 契約が事実上使えなくなる
- **行ロックを足す案は Task 88.1 が既に退けている**（**逐次**の重なりについて）。3経路の重なりは並行を含まない逐次の呼び出しで起きるため、直列化では防げない。**この箇条は逐次の重なりだけを述べる。並行の窓については射程が違い、Task 92.4 が行ロックで塞いだ**（下の「並行する要求に対する窓を塞いだ形（Task 92.4 の決着）」を見よ）

**変異の実測**（本項の変更を載せた状態で 2026-09-12 にリポジトリルートで実測。復元は事前複製からの書き戻しで行い `git hash-object` の一致で確かめた）

- M1（作成の重複検査を外す）: `npm --prefix backend run test -- quantity-group.service` が 59 件中 1 件、`npm --prefix backend run test:integration -- quantity-group-display-order` が 11 件中 1 件落ちる
- M2（採番を最大値 + 1 から件数へ戻す）: 同じ2コマンドが 59 件中 1 件・11 件中 1 件落ちる
- M3（更新の重複検査を外す）: 同じ2コマンドが 59 件中 1 件・11 件中 1 件落ちる
- M4（並び替えの適用後の重複検査を外す）: 同じ2コマンドが 59 件中 2 件・11 件中 2 件落ちる

**範囲外の同型（未処置・測定のみ）**: 数量項目側の `backend/src/routes/quantity-items.routes.ts` が持つ並び順の一括更新スキーマと、数量項目作成スキーマの displayOrder の既定値は同じ形である。本項の境界は数量グループの並び順の個別 API なので触れていない

**並行する要求に対する窓を塞いだ形（Task 92.4 の決着）**

Task 92.1 / 92.3 が「コードを読んだ判断」として残した並行の窓について、Task 92.4 が**実在を実測してから**塞いだ。実測はいずれもコミット `82a87a56` を起点に、2026-09-12 にリポジトリルートから行った。

- **まず窓の実在を測った（是正前の状態）。** 是正前の状態とは、`82a87a56` の作業ツリーへ測定用のプローブを1ファイル足しただけで、サービスの実装には一切手を入れていない状態である。決定的にする仕掛けは Task 88.1 の流用で、第三のトランザクションが数量表の行を `SELECT ... FOR UPDATE` で握ると、子行の INSERT が外部キーの KEY SHARE を要して待たされる。**待たされるのは採番・重複検査を終えた後**なので、2本とも検査を通過した状態で停止させられる。観測は次のとおりで、**いずれも重なりが生じた**
  - 数量グループの作成2本（displayOrder 省略）: 両方 201、両方とも採番が `2`。並びは `[0, 1, 2, 2]`
  - 数量グループの作成2本（`displayOrder: 7` を明示）: 両方 201。**`assertDisplayOrderNotTaken` を2本とも通過した。** 並びは `[0, 1, 7, 7]`
  - 数量項目の作成2本（displayOrder 省略）: 両方 201、両方とも採番が `2`。並びは `[0, 1, 2, 2]`
- **関門を使わずに同時に送るだけの形でも重なった。** 10 回中 **10 回**とも `[0, 1, 2, 2]` になった（同じ是正前の状態で実測）。Task 88.1 の学び「`Promise.all` で同時に送るだけの形はロックが無いときに確率的にしか落ちない」に対する本経路での実測値であり、**本経路では確率的どころか毎回再現した**。窓は理論上のものではない
- **決着**: 対象の**全10経路**——数量グループの `create()` / `update()` / `updateDisplayOrder()` と、数量項目の `create` / `update` / `updateDisplayOrder` / `copy` / `move` / `bulkCopy` / `bulkMove`——に、トランザクションの最初で**数量表の行**の `SELECT ... FOR UPDATE` を取らせる。応答の形は変えていない（直列化の結果、後発の明示値の重なりは従来どおり 400 で拒まれる）
- **ロックの対象に「数量表の行」を選んだ理由と、デッドロックが起きない論証**: Task 88.1 が `saveDraft` / `copy()` / `createGroupsFromSurvey()` で取るのと同一の行である。これで本スペックの書き込み経路が取るロックが1種類に揃う。**各経路は「この1行だけを、トランザクションの最初に」取る**ので、或るロックを保持したまま別のロックを待つ状態が生じない。ロック順序の循環＝デッドロックは構造的に起こらない。**唯一の例外は `bulkCopy` で、対象項目が複数の数量表に跨りうるため複数行を取りうる。この経路だけは取得順序を数量表 ID の昇順に固定してある**（全経路が同じ順序で取るため循環は生じない）
- **ロック対象を知るための先読みはロックの外で行う。** 数量項目・数量グループから親の数量表 ID を引く読み取りがそれに当たるが、**グループの所属数量表は変わらない**（数量表をまたぐ移動を許す経路が無く、`move` は異なる数量表への移動を明示的に拒む）ので、先読みの値が後から偽になることはない

**採らなかった案（Task 92.4）**

- **数量グループの行をロックする案**（数量項目の並び順は本来グループ単位の不変条件なので、粒度としてはこちらが細かい）。退けたのは `move` と `bulkMove` が**2つのグループに跨る**ためである。グループ行を対象にすると複数ロックの取得順序を決める必要が生じ、`saveDraft` が取る数量表の行ロックとの間で順序の循環を作りうる。数量表の行なら1行で足り、既存のロックと同一の対象になる
- **遅延一意制約**は Task 92.1 / 92.3 が既に実測で退けている（非遅延の一意索引は `saveDraft` の詰め直しを壊し、Prisma のスキーマ定義では遅延制約を宣言できない）。本項はその結論を覆す材料を持たない
- **「受け入れて記録する」も検討した。** これらの経路は画面からの呼び出しが 0 であり（92.1 / 92.3 の実測）、到達には認証済みの並行要求が要る。それでも塞ぐ側を採ったのは、(i) 関門なしの同時送信で **10 回中 10 回**再現し、悪用の難度が「並行に2本送る」だけである、(ii) 是正が既存のロック対象の再利用で済み、デッドロックの論証が構造的に閉じる、(iii) 受け入れる場合に残せるのは散文だけで、Task 92.2 が開示したとおり**散文は関門が見張らない**——の三点による

**変異の実測（Task 92.4）**（本項の変更を載せた作業ツリーで 2026-09-12 に実測。復元は事前複製からの書き戻しで行い `git hash-object` の一致を2回とも確認した）

- M1（数量グループ `create()` から行ロックの1行を外す）: `npm --prefix backend run test:integration -- quantity-display-order-concurrency` が 5 件中 **3 件**落ちる（数量グループの3件。数量項目の2件は緑のまま）
- M2（数量項目 `create` から行ロックの1行を外す）: 同じコマンドが 5 件中 **2 件**落ちる（数量項目の2件。数量グループの3件は緑のまま）
- **変異ごとに落ちるのが当該経路の検証だけである**ことは、観測器が経路を取り違えていないことの証拠になっている

**本項の限界（開示）**

- **行ロックを固定できるのは実データベースへ接続する統合検証だけである**（Task 88.1 の学びと同じ）。モックの `$queryRaw` は足場にすぎず、単体 5714 件は M1 / M2 のいずれの下でも緑のままである
- **一意制約を置かない選択は変えていないため、Prisma を経由しない直接の SQL 書き込みに対する保証は無い。** 守っているのはサービス層の検査と行ロックだけである
- **ロック待ちの上限は本項でも入れていない。** 先行が長引けば後発は待たされる。これは Task 92.5 の境界である。**【現況】Task 92.5 が上限を入れたのは `saveDraft` のトランザクションだけである**（`SET LOCAL lock_timeout` は当該トランザクションの内側にしか効かない）。本項が10経路へ入れた行ロックには上限が掛からず、先行が長引けば後発は待たされる状態が残る。10経路はいずれも画面から到達しない（Task 92.1 / 92.3 が本番の呼び出し元 0 ファイルを実測）ため Task 92.5 の対象外とされた。決着は `#### QuantityTableService.saveDraft（フル状態同期保存）` の「ロック待ちの上限と上限超過の応答（Task 92.5 の決着）」 に置いた

---

#### QuantityItemService

| Field | Detail |
|-------|--------|
| Intent | 数量項目のCRUD、計算検証、並び順管理を担当 |
| Requirements | 5.1-5.5, 6.1-6.5, 8.1-8.11, 9.1-9.8, 10.1-10.8, 24.1-24.8 |

**Responsibilities & Constraints**

- 数量項目の作成・更新・削除・コピー・移動
- 計算方法に応じた数量算出
- 調整係数・丸め設定の適用
- フィールド仕様に基づく入力値検証

**Dependencies**

- Inbound: QuantityTableRoutes (P0)
- Outbound: CalculationEngine (P0), QuantityValidationService (P0)
- External: PrismaClient (P0), decimal.js (P0)

**Contracts**: Service [x] / API [x]

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

type CalculationMethod = 'STANDARD' | 'AREA_VOLUME' | 'PITCH';

interface CalculationParams {
  width?: number;
  depth?: number;
  height?: number;
  weight?: number;
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

**並び順の個別 API が displayOrder を重ねない形（Task 92.3 の決着）**

上の Service Interface と `##### API Contract` の表は書いた時点の記録として残す。Task 92.1 が数量グループについて決着させた形と同型の穴が数量項目側にも残っており（92.1 の「範囲外の同型（未処置・測定のみ）」が申し送った）、Task 92.3 が次のとおり決着させた。実測はいずれも HEAD `8b19d5b3` の作業ツリーで、2026-09-12 にリポジトリルートから行った。

- **決着**: **逐次の呼び出しについて**「同一グループの2つの項目が同じ displayOrder を持つ状態」を個別 API に作らせない（並行して送られた要求に対する窓は残る。下の「塞いだ範囲」を見よ）。(1) `createQuantityItemBaseSchema` の displayOrder から既定値を外して任意にし、省略時はサーバーが採番する。(2) 採番は**件数ではなく最大値 + 1** とする（`nextDisplayOrder`）。(3) 明示された値が既存と重なる作成・更新・移動は 400 で拒む（`assertDisplayOrderNotTaken`。更新（`update`）と移動（`move`）は自分自身を判定から除くため、自分の現在値を指す要求は通る）。(4) 並び替え（`updateDisplayOrder`）は**適用後の全項目の並び**に重なりが生じる要求を 400 で拒む。(5) 複製（`copy`）・一括複製（`bulkCopy`）・一括移動（`bulkMove`）の採番も件数から最大値 + 1 へ改めた。文言は `QUANTITY_TABLE_VALIDATION_MESSAGES` の `ITEM_DISPLAY_ORDER_DUPLICATED` 一本で、既存の `QuantityTableValidationError` → 400 の写しに乗るため応答の形は変わらない
- **数量グループ側の `DISPLAY_ORDER_DUPLICATED` を流用しなかった**のは、同定数の文言が「他の数量グループと重複」と述べるためである。判定の対象が違うので定数を分けた
- **問い合わせの本数は項目数によらず定数である**: 採番は `aggregate` 1回、重複の判定は `count` 1回、並び替えの適用後の判定は `findMany` 1回を足しただけである（一括系が項目ごとに1回引く形は本変更の前からのもので、増やしていない）
- **数量グループ側と違い、件数による採番は本変更の前から公開 API へ到達していた。** `copy` / `bulkCopy` / `bulkMove` は displayOrder を受け取らず、常に件数で採番する。削除は後続項目の displayOrder を詰めないため、0 と 2 が残るグループでは件数 2 が末尾と重なる。一方 `create` については 92.1 と同じく既定値が値を必ず補っていたため件数の枝は経路から使われず、**既定値を外して省略を許した時点で初めて到達可能になる**。したがって既定値の撤去と採番の是正は不可分である
- **画面からの到達の実測**: 関数名ごとに `grep -rlw '<関数名>' frontend/src --include=*.ts --include=*.tsx | grep -v '\.test\.\|\.stories\.\|__tests__' | grep -v 'frontend/src/api/quantity-tables.ts'` を走らせた。`createQuantityItem` / `updateQuantityItem` / `copyQuantityItem` / `deleteQuantityItem` / `updateItemDisplayOrder` はいずれも 0 ファイルであり、数量グループ側（92.1 の実測）と同じである。移動・一括系はクライアント関数自体が無い。画面の永続化は `saveDraft` の1回に畳まれる（REQ-42）

**塞いだ範囲（逐次のみ）と、残る並行の窓**

**Task 92.3 が塞いだのは逐次の呼び出しの側だけである。並行して送られた要求に対する窓は残る。** `assertDisplayOrderNotTaken` も `nextDisplayOrder` も並び替えの適用後の検査も、いずれも**数えてから書く**形である。そして数量項目の個別 API はいずれも数量表の行ロックを取らない（Task 88.1 が `SELECT ... FOR UPDATE` を置いたのは `saveDraft`・`copy()`・`createGroupsFromSurvey()` の3つで、数量項目の経路は含まれない）。したがって Read Committed の下では、2本の要求が互いの書き込みを見ないまま同じ検査を通過し、同じ displayOrder を書きうる。**これはコードを読んだ判断であって実測ではない**（並行プローブは走らせていない）。**数量グループについて Task 92.4 が受け皿としている窓と同型であり、数量項目側の窓も同じく開いたままである。**

**【現況】Task 92.4 が数量項目側の窓の実在も実測し、行ロックで塞いだ。** 上の「コードを読んだ判断であって実測ではない」は Task 92.3 の時点の記録として残す。実測では、数量項目の作成2本を並行させると両方が採番 `2` を得て並びが `[0, 1, 2, 2]` になった。是正では本項が挙げた**7経路すべて**（`create` / `update` / `updateDisplayOrder` / `copy` / `move` / `bulkCopy` / `bulkMove`）がトランザクションの最初に**数量表の行**の `SELECT ... FOR UPDATE` を取る。**数量グループの行ではなく数量表の行を選んだのは、`move` / `bulkMove` が2つのグループに跨り、グループ行を対象にすると取得順序を決める必要が生じるためである。** 決着・実測・採らなかった案・変異の実測は `#### QuantityGroupService` の「並行する要求に対する窓を塞いだ形（Task 92.4 の決着）」に置いた（数量グループ側と同一の決着であるため、記録を二重に持たない）。

**`saveDraft` は本項の対象外である。** 同経路は payload の配列順で全項目の displayOrder を詰め直すため呼び出し側の値をそのまま書かず、かつ画面から到達する唯一の経路として Task 88.1 が行ロックを入れている。

**採らなかった案**

- **`(quantityGroupId, displayOrder)` の一意制約は採らなかった。画面から到達する唯一の経路を壊すことを実測した。** 検証用データベースへ非遅延の一意索引を当てて統合検証を走らせると、`npm --prefix backend run test:integration -- quantity-table-save.api` が 31 件中 **4 件**落ちた（基線は 31 件すべて緑）。落ちたのは「新規/更新/削除/並び替えが原子的に永続化され、再取得（GET詳細）で反映が保持される」「数量項目を別の数量グループへ移し替えた状態を保存できる（quantity-table-generation Req 6.4）」「新規（id=null）・同一数量表内の更新・グループ間移動は所属検証で拒否されない」「新規（id=null）が複数含まれる保存・更新・グループ間移動は重複検証で拒否されない」の4件である。**数量グループに同じ索引を当てたとき（92.1 の実測）の 3 件より多く、増えた分はいずれもグループ間移動を含む条件である**——`saveDraft` は移動してきた項目を移動先グループの配列順で詰め直すため、移動元の項目がまだ番号を手放していない間に移動先の既存項目と一時的に重なる
- 同じ当て方で `npm --prefix backend run test:integration -- quantity-table-sort-order.api` が 4 件中 1 件（「PUT /api/quantity-groups/:groupId/items/order で並び順が正しく更新される」）、`npm --prefix backend run test:integration -- quantity-item-calculation-params.api` が 16 件中 1 件（「既存3方式（標準・面積体積・ピッチ）の作成が壊れていない（回帰）」）落ちた。後者は**是正前の既定値 `.default(0)` が同一グループへ複数の項目を 0 で作っていたこと**を映している。**通すには遅延制約が要るが、Prisma のスキーマ定義では宣言できない**（92.1 と同じ結論）。索引は実測後に落とし、`quantity_items` の索引が2本（主キーと既存の複合索引）へ戻ったことを `SELECT indexname FROM pg_indexes WHERE tablename='quantity_items'` で確かめた
- **【訂正】上の2箇条は三つの数値を一つの測定として書いているが、実際には二つの異なる状態から得たものである**（独立レビューが検出。2026-09-12 に是正後の作業ツリーで再実測して書き分けた。**数値そのものはいずれも誤っていない**）。「同じ当て方で」は同じ状態で得た組であることを含意するが、`quantity-item-calculation-params.api` の 1 件だけは**是正前のコード**でしか起きない。索引はどの条件でも非遅延の一意索引を検証用データベースへ当てたものである。状態ごとに書き分けると次のとおりである
  - **是正後の作業ツリー＋索引**: `quantity-table-save.api` が 31 件中 4 件（上の箇条が挙げた4件と同一）、`quantity-table-sort-order.api` が 4 件中 1 件（同じ1件）、`quantity-item-calculation-params.api` は **16 件すべて緑で1件も落ちない**
  - **是正前のコード（コミット `8b19d5b3` そのものの状態）＋索引**: 上の save の 4 件・sort-order の 1 件に加えて、`quantity-item-calculation-params.api` が 16 件中 1 件（「既存3方式（標準・面積体積・ピッチ）の作成が壊れていない（回帰）」）落ちる。**上の2箇条の三つの数値はこの状態で測ったものである**
  - **対照（是正前のコード＋索引なし）**: `quantity-item-calculation-params.api` は 16 件すべて緑である。索引の有無だけが違う二条件で結果が分かれるので、当該1件を落としていたのは索引であることが確定する
  - **この差は本項の是正の効き目そのものである。** 当該の検証は同一グループへ displayOrder を省いて複数の項目を作るため、既定値 `.default(0)` があった時期は全件が 0 で作られ、一意索引と衝突していた。既定値を外して最大値+1で採番するようにした後は重なりが生じないので、同じ索引を当てても落ちない
  - **一意制約を退ける根拠は是正後の状態でも成り立つ。** 画面から到達する唯一の経路を壊すこと（save の 4 件）と並び替えを壊すこと（sort-order の 1 件）は、是正後の作業ツリーでも同じく再現するためである
- **撤去も採らなかった**（81.1 の学び「塞ぐ前にその経路が本番から呼ばれるかを測ること」に従って利用者を先に数えた）。`POST /api/quantity-groups/:groupId/items` は画面からは到達しないが、**受入検証の前提条件が 41 箇所で呼んでいる**（``grep -rnF '/items`' e2e --include=*.ts | grep 'quantity-groups' | wc -l`` の出力が 41。共有ヘルパーを含む）。並び順の一括更新の呼び出しは受入検証にも 0 件だが、数量項目の個別 API は 7 経路が公開 API として API 仕様に載る
- **「重複を 400 で拒むだけ」で既定値を残す案も採らなかった。** 既定値が 0 である限り、displayOrder を省いた作成が2件目から必ず 400 になり、省略を許す API 契約が事実上使えなくなる
- **行ロックを足す案は Task 88.1 / 92.1 が既に退けている**（**逐次**の重なりについて）。本項の重なりも並行を含まない逐次の呼び出しで起きるため、直列化では防げない

**変異の実測**（本項の変更を載せた状態で 2026-09-12 にリポジトリルートで実測。復元は事前複製からの書き戻しで行い `git hash-object` の一致（`c00ee356a7b3af92c9e6d57f80a4a2b8c36edca0`）で確かめた）

- M1（作成の重複検査を外す）: `npm --prefix backend run test -- quantity-item.service` が 64 件中 1 件、`npm --prefix backend run test:integration -- quantity-item-display-order` が 14 件中 1 件落ちる
- M2（採番を最大値 + 1 から件数へ戻す）: 同じ2コマンドが 64 件中 **4 件**・14 件中 **2 件**落ちる（`nextDisplayOrder` は作成・複製・一括複製・一括移動が共有するため、1つの変異が4経路を同時に壊す）
- M3（更新の重複検査を外す）: 同じ2コマンドが 64 件中 1 件・14 件中 1 件落ちる
- M4（並び替えの適用後の重複検査を外す）: 同じ2コマンドが 64 件中 2 件・14 件中 2 件落ちる
- M5（移動の重複検査を外す。同一グループ内と別グループの2箇所）: 同じ2コマンドが 64 件中 1 件・14 件中 1 件落ちる

---

#### AutocompleteCandidatesEndpoint

| Field | Detail |
|-------|--------|
| Intent | プロジェクト単位でオートコンプリート対象フィールドの候補値を一括取得するエンドポイント |
| Requirements | 7.1, 7.2 |

**Contracts**: API [x]

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| GET | /api/projects/:projectId/quantity-items/autocomplete-candidates | - | AutocompleteCandidatesResponse | 404 |

```typescript
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

interface AutocompleteCandidatesResponse {
  candidates: Record<AutocompleteFieldName, string[]>;
}
```

---

#### CalculationEngine

| Field | Detail |
|-------|--------|
| Intent | 高精度な数量計算ロジックを提供 |
| Requirements | 8.1-8.11, 9.1-9.8, 10.1-10.8 |

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
| Intent | 数量表の編集画面を提供。編集はクライアントサイドのドラフト状態に対して行い、保存操作時にのみサーバーへ同期（REQ-42） |
| Requirements | 3.1-3.4, 7.1, 25.1-25.6, 27.1, 42.1-42.10, 43.1-43.6, 44.1-44.4, 45.1-45.4 |

**Contracts**: State [x]

##### State Management

編集対象データは単一の `useReducer` で「サーバースナップショット」と「編集ドラフト」を分離管理する。すべての編集アクション（グループ/項目の add/delete/copy/reorder、グループ名・数量表名変更、写真紐づけ、現場調査一括生成、インポート取り込み）は `dispatch` でドラフトのみを更新し、`isDirty=true` とする。永続化APIは保存操作時の `saveDraft` のみ（REQ-42 AC1〜7）。

```typescript
/** 新規行はサーバー採番前のため null id + クライアント仮ID（tempId）で管理 */
type DraftId = { id: string } | { id: null; tempId: string };

interface DraftItem extends DraftId {
  majorCategory: string | null;
  middleCategory: string | null;
  minorCategory: string | null;
  customCategory: string | null;
  workType: string;
  name: string;
  specification: string | null;
  calculationMethod: CalculationMethod;
  // 計算用フィールド（面積・体積／ピッチ）、数量・単位・備考・調整係数・丸め設定 等
  quantity: string;
  unit: string;
  remarks: string | null;
  displayOrder: number;
  // ...（Field Specifications 準拠の全フィールド）
}

interface DraftGroup extends DraftId {
  name: string;
  surveyImageId: string | null; // 写真紐づけ（参照のみ、blob複製なし）
  displayOrder: number;
  items: DraftItem[];
}

interface QuantityTableDraft {
  id: string;
  name: string;
  groups: DraftGroup[];
}

interface QuantityTableEditState {
  /** 最後にロード/保存したサーバー状態（差分計算・リセット用の基準） */
  serverSnapshot: QuantityTableDetail | null;
  /** 編集中のドラフト（画面表示・編集対象） */
  draft: QuantityTableDraft | null;
  isLoading: boolean;
  isSaving: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  saveError: string | null;
  /** 未保存変更フラグ（REQ-43 離脱ガード／REQ-44 インジケーターの起点） */
  isDirty: boolean;
  validationErrors: ValidationError[];
  selectedItems: string[];
  expandedGroups: string[];
  autocompleteCandidates: Record<AutocompleteFieldName, string[]>;
  isAutocompleteCandidatesLoading: boolean;
  isImportDialogOpen: boolean;
}
```

**Implementation Notes**

- 仮ID生成: 新規グループ/項目は `crypto.randomUUID()` を `temp-` 接頭辞付きで採番し、React key およびドラフト内参照に使用。保存レスポンス（採番済み `QuantityTableDetail`）でドラフト/スナップショットを置換して解決（REQ-42 AC8、idMap不要）
- dirty 追跡: 既存 `useUnsavedChanges`（`markAsChanged`/`markAsSaved`）を編集 dispatch と保存成功にフックし、`isDirty` を駆動。`useBlocker(isDirty)` で離脱ガード（REQ-43）、保存ボタン付近に `UnsavedChangesBadge`（REQ-44）を表示
- 保存: `saveDraft` 1回でフル状態を同期。失敗時はドラフトを保持し再保存可能（REQ-42 AC9）
- 廃止: useAutoSave（1500msデバウンス）および編集画面からの個別ミューテーションAPI呼び出しを削除
- Header: `styles.header` を `position: sticky; top: 0` 化（REQ-45）。`UnsavedChangesBadge` は固定ヘッダー内に配置（REQ-45 AC4）
- Scroll: CSS `overflow: auto`による水平・垂直スクロールバー表示（REQ-25）。ヘッダー sticky の祖先に overflow コンテナを作らないこと
- Risks: 大量項目での再レンダリングパフォーマンス（react-windowで対応）。ドラフト更新は対象グループ/項目のみの不変更新で再描画範囲を限定

---

#### AutocompleteCandidateStore

| Field | Detail |
|-------|--------|
| Intent | オートコンプリート候補値のクライアントサイド管理を担当 |
| Requirements | 7.1, 7.2, 7.3, 7.6, 7.7 |

**Contracts**: State [x]

##### State Management / Hook Interface

```typescript
interface UseAutocompleteCandidateStoreOptions {
  projectId: string;
}

interface UseAutocompleteCandidateStoreResult {
  isLoading: boolean;
  error: Error | null;
  getSuggestions(field: AutocompleteFieldName, inputText: string): string[];
  addCandidateOnBlur(field: AutocompleteFieldName, value: string): void;
}

function useAutocompleteCandidateStore(
  options: UseAutocompleteCandidateStoreOptions
): UseAutocompleteCandidateStoreResult;
```

---

#### ImportDialog

| Field | Detail |
|-------|--------|
| Intent | 数量表インポートダイアログを提供し、ファイルアップロード・抽出・プレビュー・一括取り込みの一連のフローを管理する |
| Requirements | 27.1-27.8, 31.1-31.9, 33.1-33.5, 34.1-34.5 |

**Responsibilities & Constraints**

- ファイルアップロードエリアの表示とファイル形式バリデーション（.xlsx, .xls, .pdf）
- アップロード時のファイル種別判定と適切な処理の自動起動
- 処理中インジケーターの表示とUI無効化制御
- 抽出結果プレビューテーブルとインラインプレビューの並列表示
- 一括取り込み先の数量グループ選択UIの提供
- リトライ機能と別ファイル再アップロードの制御
- 取り込み完了メッセージの表示

**Dependencies**

- Inbound: QuantityTableEditPage (P0)
- Outbound: ImportDataExtractor (P0), ImportPreviewTable (P0), ImportFieldMapping (P0)
- External: react-pdf (P1)

**Contracts**: State [x]

##### State Management

```typescript
interface ImportDialogState {
  /** ダイアログの表示状態 */
  isOpen: boolean;
  /** アップロードされたファイル */
  uploadedFile: File | null;
  /** 処理状態 */
  processingStatus: 'idle' | 'processing' | 'completed' | 'error';
  /** エラーメッセージ */
  errorMessage: string | null;
  /** 抽出された行データ */
  extractedRows: ImportExtractedRow[];
  /** フィールドマッピング設定 */
  fieldMapping: ImportFieldMappingConfig;
  /** 取り込み先数量グループID */
  targetGroupId: string | null;
  /** PDFプレビューの現在ページ */
  pdfPreviewCurrentPage: number;
  /** PDFの総ページ数 */
  pdfPreviewTotalPages: number;
}

interface ImportDialogActions {
  openDialog(): void;
  closeDialog(): void;
  uploadFile(file: File): void;
  retryProcessing(): void;
  updateFieldMapping(columnIndex: number, targetField: ImportTargetField): void;
  selectTargetGroup(groupId: string): void;
  importItems(): void;
  setPdfPreviewPage(page: number): void;
}
```

##### Props Interface

```typescript
interface ImportDialogProps {
  /** ダイアログの表示状態 */
  isOpen: boolean;
  /** ダイアログを閉じるコールバック */
  onClose: () => void;
  /** 数量グループ一覧（取り込み先選択用） */
  quantityGroups: QuantityGroupInfo[];
  /** 一括取り込み実行コールバック */
  onImport: (targetGroupId: string, items: ImportQuantityItem[]) => void;
}
```

**Implementation Notes**

- Integration: QuantityTableEditPageのツールバーに「インポート」ボタンを追加。ダイアログはモーダルとして表示
- Validation: ファイル形式チェック（accept属性 + MIME type検証）。サポート対象外の場合はエラーメッセージ表示
- PDFプレビュー: react-pdfのDocumentコンポーネントを使用してインライン表示。ページナビゲーション（前/次ボタン、ページ番号表示）を提供
- Excelプレビュー: SheetJSで読み取ったデータをHTMLテーブルとして表示
- Retry: 処理失敗時に「リトライ」ボタンを表示。別ファイルのアップロードは常に許可
- Layout: インラインプレビュー（左側）と抽出結果プレビューテーブル（右側）を同一ダイアログ内に並列配置
- **インラインプレビューの実体（タスク 96.2、2026-09-15 の利用者裁定「実装する」に基づく追記）**: 受領見積書登録の `FileInlinePreview` を再利用し、`showPageNavigationForSinglePage` に true を渡す。PDF は react-pdf で表示し、ページナビゲーション（「ページ N / M」と前へ/次へ）は総ページ数が1でも出す（1ページでは前へ・次へとも非活性。Requirement 34 の受入基準 4 は例外を設けない）。受領見積書登録は同 props の既定 false により1ページでは出さないまま。Excel は SheetJS のテーブル。種別は受け付けと同じく拡張子で決め、抽出処理には元のファイルを渡す。インラインプレビュー（領域「ファイルプレビュー」）と抽出結果（領域「抽出結果」）は折り返し可能な横並びの行に置き、狭い画面では縦に積む。プレビューの高さの保存キーは受領見積書登録と共有している

---

#### ImportDataExtractor

| Field | Detail |
|-------|--------|
| Intent | ExcelデータパースおよびPDF OCR処理による数量項目データ抽出を担当 |
| Requirements | 28.1-28.7, 29.1-29.10, 30.1-30.7 |

**Responsibilities & Constraints**

- Excelファイル: SheetJS（xlsx）ライブラリで全シートを解析し、列データを数量項目フィールドにマッピング
- PDFファイル: Claude Vision API優先、pdfjs-dist + Tesseract.jsフォールバックのハイブリッドアプローチ
- Claude Vision API使用時: PDFページをCanvas経由でBase64画像に変換し、数量表構造解析用プロンプトで抽出
- pdfjs-distフォールバック: テキストPDF判定→直接テキスト抽出、スキャンPDF判定→Canvas描画(scale 4.0)→画像前処理パイプライン→Tesseract.js OCR
- OCR処理のタイムアウト: 30秒
- 受領見積書登録機能（OcrDataExtractor）の既存パイプラインを再利用

**Dependencies**

- Inbound: ImportDialog (P0)
- External: SheetJS xlsx (P0), pdfjs-dist (P0), tesseract.js (P1), ClaudeVision API (P1)

**Contracts**: Service [x]

##### Service Interface

```typescript
/**
 * インポート抽出結果の行データ
 */
interface ImportExtractedRow {
  /** 元データの列値（抽出されたままの値） */
  columns: string[];
  /** 元データの行インデックス */
  sourceRowIndex: number;
}

/**
 * インポート抽出結果（ヘッダー情報を含む）
 */
interface ImportExtractionResult {
  /** 抽出されたヘッダー名リスト */
  headers: string[];
  /** 抽出された行データ */
  rows: ImportExtractedRow[];
  /** 処理タイプ */
  extractionType: 'excel-parse' | 'pdf-text' | 'pdf-ocr' | 'pdf-claude-vision';
  /** シート名（Excelの場合） */
  sheetNames?: string[];
}

/**
 * インポートデータ抽出フック
 */
interface UseImportDataExtractorOptions {
  file: File | null;
  autoStart?: boolean;
}

interface UseImportDataExtractorResult {
  /** 処理状態 */
  status: 'idle' | 'processing' | 'completed' | 'error';
  /** 進捗率（0-100） */
  progress: number;
  /** 進捗メッセージ */
  progressMessage: string;
  /** 抽出結果 */
  result: ImportExtractionResult | null;
  /** エラーメッセージ */
  error: string | null;
  /** 処理開始 */
  startExtraction(): void;
  /** リトライ */
  retry(): void;
}

function useImportDataExtractor(
  options: UseImportDataExtractorOptions
): UseImportDataExtractorResult;
```

##### Excelパース処理

```typescript
/**
 * Excelファイルをパースして行データを抽出する
 *
 * 1. SheetJS（xlsx）で全シートを読み取り
 * 2. 各シートのデータ範囲を特定
 * 3. ヘッダー行を自動検出（最初の非空行）
 * 4. データ行を抽出し、列値の配列として返却
 *
 * @param file Excelファイル
 * @returns 抽出結果
 */
async function parseExcelFile(file: File): Promise<ImportExtractionResult>;
```

##### PDF OCR処理（Claude Vision API優先）

```typescript
/**
 * PDFファイルからOCR処理でデータを抽出する
 *
 * 処理フロー:
 * 1. Claude Vision APIが利用可能か判定
 * 2. 利用可能: PDFページをBase64画像に変換 → Claude Vision API送信 → JSON抽出
 * 3. 利用不可/エラー: pdfjs-dist + Tesseract.jsフォールバック
 *    a. pdfjs-dist getTextContent()でテキスト抽出
 *    b. テキストPDF（閾値50文字以上）: 抽出テキストを使用
 *    c. スキャンPDF: Canvas描画(scale 4.0) → 画像前処理 → Tesseract.js OCR
 * 4. 抽出テキストから表構造を解析し行データに変換
 *
 * @param file PDFファイル
 * @param onProgress 進捗コールバック
 * @returns 抽出結果
 */
async function extractPdfData(
  file: File,
  onProgress?: ProgressCallback
): Promise<ImportExtractionResult>;
```

**フォールバック経路のプレビューテーブル形式（タスク 96.1、2026-09-15 の利用者裁定に基づく追記）**: 上の処理フロー 4 は、Requirement 30 の受入基準 7（二経路で同一のプレビューテーブル形式）を満たすため次のとおり具体化する。

- ヘッダーは経路を問わず常に10欄（大項目・中項目・小項目・任意分類・工種・名称・規格・数量・単位・備考）の名前付きヘッダーとし、Claude Vision 経路と同じ定数から組み立てる
- 抽出テキストの1行目の各列を `ImportFieldMapping` の見出し語の規則（`autoDetectFieldMapping`）で判定し、**異なる2欄以上**に当たれば見出し行とみなす。同じ欄に複数列が当たっても1欄と数える。1欄だけの一致はデータ中の語でも起こり、見出しと誤判定すると当たらない列を取り込まない規則でデータの大半を失うため、見出しとみなさない
- 見出し行とみなした場合は、各行を判定した欄の並びへ組み替え、見出し行はデータから外す。どの欄にも当たらない列は取り込まない。同じ欄に2列以上が当たった場合は左側の列を採る
- 見出し行とみなさない場合は位置で当てる（第1列を大項目、第10列を備考）。1行目もデータとして扱い、10列を超える列は切り詰め、不足は空欄で埋める
- 判定するのは1行目だけである。表題行が先頭に在り2列以上に分かれる場合、実際の見出し行はデータとして位置で当てられる
- 必須欄の警告（Requirement 32 の受入基準 6）は割り当ての有無で判定するため、PDF の抽出結果では工種・名称・単位が常に割り当て済みとなり、利用者が割り当てを変えない限り警告は出ない。位置で当てた場合に中身が空欄でも同様である（Claude Vision 経路と同じ振る舞い）

**抽出テキスト・失敗時の導線・時間切れ（タスク 96.3、2026-09-15 の利用者裁定「実装する」に基づく追記）**: Requirement 29 の受入基準 7〜10 を取り込み経路で次のとおり満たす。

- `ImportExtractionResult` は `extractedText` を持つ。フォールバック経路は `extractPdfHybrid` が返したテキスト、Claude Vision 経路は抽出した行を整形した JSON テキスト（受領見積書登録の `OcrDataExtractor` と同じ表示）。Excel では持たない
- `ImportDialog` は抽出完了時、`extractedText` を持つ場合に見出し「抽出テキスト」の領域をプレビューテーブルの直前に表示し、テキストを選択・コピーできる状態にする（受入基準 7・8）
- 30秒（`OCR_TIMEOUT_MS`）はフォールバックの `extractPdfHybrid` にのみ課し、計時はフォールバック開始から始める。Claude Vision API の応答待ちには課さない（課すと Requirement 30 の受入基準 6 のフォールバックへ届かない）。時間切れ後の進捗は通知しない。`extractPdfHybrid` は中断手段を持たないため、時間切れ後も OCR の処理は裏で完走しうるが、結果は状態へ反映しない（受入基準 10）
- 失敗時は「OCR処理に失敗しました。手動入力してください」、時間切れ時は「OCR処理がタイムアウトしました（30秒超過）。手動入力してください」で失敗させ、ダイアログの `role="alert"` がリトライボタンと併せて表示する。元の例外文は利用者へ出さない（受入基準 9、受領見積書登録と同じ文言）

##### Claude Vision API連携（数量表インポート用プロンプト）

```typescript
/**
 * Claude Vision APIへの数量表構造解析リクエスト
 *
 * 受領見積書登録機能のextractWithClaudeVision()を再利用するが、
 * プロンプトは数量表のフィールド構造に合わせてカスタマイズする必要がある。
 *
 * バックエンドの既存 POST /api/claude-vision/extract エンドポイントを使用する。
 * 数量表用のプロンプトはバックエンドのClaudeVisionServiceに新規メソッドとして追加する。
 */
interface ClaudeVisionQuantityExtractRequest {
  images: ClaudeVisionImageInput[];
  /** 抽出モード: 'estimate'（見積書）または 'quantity-table'（数量表） */
  mode: 'estimate' | 'quantity-table';
}

/**
 * 数量表用のClaude Vision抽出結果
 */
interface ClaudeVisionQuantityLineItem {
  majorCategory: string | null;
  middleCategory: string | null;
  minorCategory: string | null;
  customCategory: string | null;
  workType: string | null;
  name: string | null;
  specification: string | null;
  quantity: number | null;
  unit: string | null;
  remarks: string | null;
}

interface ClaudeVisionQuantityExtractResponse {
  lineItems: ClaudeVisionQuantityLineItem[];
  pageCount: number;
}
```

**Implementation Notes**

- Integration: 受領見積書登録機能の`pdf-text-extractor.ts`、`OcrDataExtractor.tsx`のパイプラインを再利用。主な変更は出力フィールドのマッピング（見積書: unitPrice/amount → 数量表: majorCategory/middleCategory等）
- Claude Vision API: 既存の`POST /api/claude-vision/extract`エンドポイントを拡張し、`mode`パラメータで見積書用と数量表用のプロンプトを切り替える。バックエンドのClaudeVisionServiceに`extractQuantityTableData`メソッドを追加
- Validation: OCRタイムアウト30秒。ファイル読み取り失敗時はエラーメッセージを表示
- Performance: React.lazy()による動的インポートでバンドルサイズ影響を回避
- Risks: OCR精度はPDFの品質に依存。特にスキャンPDFでは表構造の解析精度が低下する可能性がある

---

#### ImportPreviewTable

| Field | Detail |
|-------|--------|
| Intent | インポート抽出結果のプレビューテーブルを表示し、フィールドマッピング調整UIを提供する |
| Requirements | 28.4-28.7, 31.1, 32.1-32.6 |

**Contracts**: -（Props-based UI component）

```typescript
interface ImportPreviewTableProps {
  /** 抽出結果 */
  extractionResult: ImportExtractionResult;
  /** 現在のフィールドマッピング設定 */
  fieldMapping: ImportFieldMappingConfig;
  /** マッピング変更コールバック */
  onFieldMappingChange: (columnIndex: number, targetField: ImportTargetField) => void;
}
```

**Implementation Notes**

- テキストはユーザーが選択・コピーできる状態で表示（user-select: text）
- 各列ヘッダーにマッピング先フィールドのドロップダウンを表示
- プレビューテーブルの下に「一括取り込み」ボタンを配置

---

#### ImportFieldMapping

| Field | Detail |
|-------|--------|
| Intent | インポートプレビューのフィールドマッピング調整機能を提供する |
| Requirements | 32.1-32.6 |

**Responsibilities & Constraints**

- 抽出結果の列名やデータ内容に基づくマッピング先フィールドの自動推定
- ユーザーによるマッピング変更の即座反映
- 必須フィールド（工種・名称・単位）へのマッピング未設定時の警告表示

**Contracts**: Service [x]

##### Service Interface

```typescript
/**
 * マッピング先フィールド
 */
type ImportTargetField =
  | 'majorCategory'
  | 'middleCategory'
  | 'minorCategory'
  | 'customCategory'
  | 'workType'
  | 'name'
  | 'specification'
  | 'quantity'
  | 'unit'
  | 'remarks'
  | 'skip';  // 「取り込まない」

/**
 * フィールドマッピング設定
 */
interface ImportFieldMappingConfig {
  /** 列インデックスからマッピング先フィールドへのマップ */
  mappings: Record<number, ImportTargetField>;
}

/**
 * 一括取り込み用の数量項目データ
 */
interface ImportQuantityItem {
  majorCategory: string;
  middleCategory: string;
  minorCategory: string;
  customCategory: string;
  workType: string;
  name: string;
  specification: string;
  quantity: number;
  unit: string;
  remarks: string;
  calculationMethod: 'STANDARD';
  adjustmentFactor: number;   // 1.00
  roundingUnit: number;       // 0.01
}

/**
 * フィールドマッピング自動推定
 *
 * ヘッダー名やデータ内容に基づいてマッピング先を推定する。
 *
 * 推定ルール:
 * - 「大項目」「大分類」を含む → majorCategory
 * - 「中項目」「中分類」を含む → middleCategory
 * - 「小項目」「小分類」を含む → minorCategory
 * - 「任意分類」「分類」を含む → customCategory
 * - 「工種」を含む → workType
 * - 「名称」「品名」「品目」を含む → name
 * - 「規格」「仕様」を含む → specification
 * - 「数量」を含む → quantity
 * - 「単位」を含む → unit
 * - 「備考」「摘要」「コメント」を含む → remarks
 * - 上記に該当しない → skip
 *
 * @param headers ヘッダー名リスト
 * @param sampleRows サンプル行データ（推定精度向上用）
 * @returns マッピング設定
 */
function autoDetectFieldMapping(
  headers: string[],
  sampleRows: ImportExtractedRow[]
): ImportFieldMappingConfig;

/**
 * 抽出結果をマッピング設定に基づいて数量項目に変換する
 *
 * @param rows 抽出された行データ
 * @param mapping フィールドマッピング設定
 * @returns 数量項目データの配列
 */
function convertToQuantityItems(
  rows: ImportExtractedRow[],
  mapping: ImportFieldMappingConfig
): ImportQuantityItem[];
```

**Implementation Notes**

- 自動推定結果はユーザーが自由に変更可能
- 必須フィールド（工種・名称・単位）にマッピングされた列がない場合は警告メッセージを表示するが、一括取り込み自体は許可する
- 一括取り込み時の計算方法は「標準」に固定、調整係数1.00、丸め設定0.01をデフォルト適用
- 取り込み先数量グループに既存の数量項目がある場合は末尾に追加（上書きしない）

---

### 不具合修正・UI改善コンポーネント

#### PhotoCommentDisplay修正（REQ-35）

| Field | Detail |
|-------|--------|
| Intent | 写真コメント表示の不具合を修正し、写真選択時・初回表示時・写真変更時にコメントを正しく取得・表示する |
| Requirements | 35.1, 35.2, 35.3, 35.4, 35.5, 35.6, 35.7 |

**不具合分析**

現在の実装では`PhotoCommentDisplay`コンポーネント自体は正しく実装されているが、`QuantityGroupCard`から渡されるcommentプロパティが正しく設定されていない。具体的には以下の問題が存在する:

**この段落と続く 3 箇条の「現在」は書かれた時点の現在であって、読まれる時点の現在ではない。** site-survey の設計文書 `#### 実測値の書き方（タスク 115.212）` の (a) に従い、当時の記述は消さずに残し、現況の再実測を同じ場所へ並べる（各箇条の末尾と直下の表の各行）。**再実測の結果、3 箇条はいずれも現況ではない。** **本タスクが測ったのはこの 3 箇条と直下の `修正対象コンポーネントと変更内容` の表だけであり、本節の他の欄（`Responsibilities & Constraints`・`Implementation Notes`）および本書の他節の状態記録は測っていない。** タスク 79.1。コミット `3aee62b0`。2026-09-10 にリポジトリルートで実測

1. **写真選択時のコメント未取得**: `QuantityGroupCard`で写真を選択（`linkSurveyImage`）した際、レスポンスに含まれる`comment`フィールドをローカルステートに反映していない。**`linkSurveyImage` は再実測では実装にも検証にも一件も見当たらない**——`grep -rn 'linkSurveyImage' frontend/src backend/src e2e` の出力は空（終了コード `1`）であり、絞り込みを外した `grep -rln 'linkSurveyImage' --include=*.ts --include=*.tsx . | grep -v node_modules | wc -l` の出力も `0` でリポジトリ全域に一件も無い。現在の写真選択は永続化APIを呼ばずドラフトへ反映する `handlePhotoSelect`（`frontend/src/pages/QuantityTableEditPage.tsx`）であり、選択した写真の `comment` を描画用サマリへ載せている（`grep -cF 'comment: selectedImage.comment ?? null' frontend/src/pages/QuantityTableEditPage.tsx` の出力が `1`）。**この箇条が名指す欠落も、欠落の主体として名指す API も、現況ではない。** タスク 79.1。コミット `3aee62b0`。2026-09-10 にリポジトリルートで実測
2. **初回表示時のコメント未伝播**: `QuantityTableEditPage`から`QuantityGroupCard`へデータを渡す際、`surveyImage.comment`の値が適切に伝播されていない場合がある。**伝播は再実測では結線済みである**——`grep -cF 'PhotoCommentDisplay comment={group.surveyImage.comment ?? null}' frontend/src/components/quantity-table/QuantityGroupCard.tsx` の出力が `1` であり、`QuantityGroupCard` は写真サマリのローカルステートを持たず props の `group.surveyImage` をそのまま渡す。親側の `surveyImage` は詳細API応答のスナップショットと選択時のサマリから解決される（`grep -cF 'snapshotImages[g.surveyImageId] = g.surveyImage;' frontend/src/pages/QuantityTableEditPage.tsx` の出力が `1`）。タスク 79.1。コミット `3aee62b0`。2026-09-10 にリポジトリルートで実測
3. **写真変更ダイアログでの更新未反映**: `PhotoChangeDialog`で写真を変更した後、変更後の写真のコメントを取得してQuantityGroupCardのステートを更新するフローが欠落している。**`PhotoChangeDialog` は再実測では本番経路から到達できず、この箇条が求める「要修正」は現況ではない**——同部品を参照するのは `grep -rl 'PhotoChangeDialog' frontend/src --include=*.tsx --include=*.ts` の 4 ファイルで、内訳は定義ファイル自身 1・単体検証 2・ストーリー 1 である。取り込みの側から見ても `grep -rn "PhotoChangeDialog'" frontend/src --include=*.tsx --include=*.ts | grep -c import` の出力は `3`（単体検証 2・ストーリー 1）で、画面・経路の部品からの取り込みは一つも無い。写真の変更は同部品ではなく `QuantityGroupCard` の `handleChangePhoto` が `onSelectImage` を呼び、`QuantityTableEditPage` のインライン写真選択ダイアログを開く経路で行われる（`grep -cF 'const handleChangePhoto = useCallback' frontend/src/components/quantity-table/QuantityGroupCard.tsx` の出力が `1`）。すなわち変更後のコメントは選択と同じ `handlePhotoSelect` が載せる。**本書が同じ部品を二通りに扱っていた矛盾はこれで解ける**——`### Architecture Pattern & Boundary Map` の修正コンポーネント（REQ-39）の行と `#### 写真選択・変更ダイアログのレイアウト修正（REQ-39）` が書く「未使用・残置」の側が現況であり、**陳腐化しているのは本箇条の「要修正」の側である**。**参照の件数は起票時の記録（5 ファイル）からも動いている**——`QuantityTableEditPage.test.tsx` の註の中での言及がコミット `b701ad53`（2026-09-10）で消えたためで、`git show b701ad53 -- frontend/src/pages/QuantityTableEditPage.test.tsx | grep -cE '^-.*PhotoChangeDialog'` の出力が `1` である。**「未使用・残置」を書く箇所は 2 箇所ではなく 3 箇所である**——起票文（`tasks.md` の Task 79）は 2 箇所と述べるが、着手時に数え直すと `grep -cE '未使用[の]' .kiro/specs/quantity-table-generation/design.md` の出力が `3` であり、上に挙げた 2 節に加えて `#### 影響ファイル一覧（REQ-39〜41）` が同じ扱いを書いている（本書で `未使用` に `の` が続く行は現在この 3 行だけであり、いずれも同部品の残置を述べる行である）。**綴りを `未使用[の]` と括弧で割るのは、この文自身が同じ字面を引くと素の形が自分を数えるためである**（site-survey の設計文書 `#### 実測値の書き方（タスク 115.212）` が (a) の副作用として警告する自己言及の型）。タスク 79.1。コミット `3aee62b0`。2026-09-10 にリポジトリルートで実測

**修正対象コンポーネントと変更内容**

| コンポーネント | 修正内容 |
|---------------|---------|
| QuantityGroupCard | 写真選択（linkSurveyImage）レスポンスのcommentフィールドをローカルステートに反映する。初回表示時にpropsのsurveyImage.commentを正しくPhotoCommentDisplayに伝播する。**再実測では `linkSurveyImage` は存在せず、伝播は結線済みである**（上の箇条 1・2 の再実測を見よ）。この欄が求める修正は現況では対象を失っている。行は起票時の記述として残す。タスク 79.1。コミット `3aee62b0`。2026-09-10 にリポジトリルートで実測 |
| QuantityTableEditPage | 数量表詳細API（GET /api/quantity-tables/:id）のレスポンスに含まれるsurveyImage.commentをグループステートに正しくマッピングする。**再実測では詳細API応答の写真サマリはグループの表示状態へ解決済みである**（`grep -cF 'snapshotImages[g.surveyImageId] = g.surveyImage;' frontend/src/pages/QuantityTableEditPage.tsx` の出力が `1`）。行は起票時の記述として残す。タスク 79.1。コミット `3aee62b0`。2026-09-10 にリポジトリルートで実測 |
| PhotoChangeDialog | 写真変更確定後、変更後の写真のcommentを含むレスポンスを親（QuantityGroupCard）に返却し、コメント表示を更新する。**再実測では同部品は本番経路から到達できず（参照は定義ファイル自身 1・単体検証 2・ストーリー 1 の 4 ファイルのみ）、この欄が求める修正には担い手が無い**（上の箇条 3 の再実測を見よ）。本書の他の箇所が書く「未使用・残置」が現況である（箇所と数え直しは上の箇条 3 の再実測を見よ。表のセルには縦棒を書けないため再現コマンドはそちらに置く）。行は起票時の記述として残す。タスク 79.1。コミット `3aee62b0`。2026-09-10 にリポジトリルートで実測 |

**Responsibilities & Constraints**

- 既存のPhotoCommentDisplayコンポーネントの実装は変更不要（propsの型・表示ロジックは正しい）
- バックエンドAPI（QuantityTableService、QuantityGroupService）は既にcommentフィールドを返却している（修正不要）
- 修正はフロントエンドのステート管理とデータフロー（コメントの伝播経路）に限定される
- 折りたたみ・展開時のコメント表示制御は既存の`isExpanded`制御に従い、追加対応不要

**Implementation Notes**

- Integration: QuantityGroupCard内の`handleLinkImage`コールバックで、APIレスポンスの`comment`フィールドをローカルステートの`surveyImage`オブジェクトに含める。**`handleLinkImage` は再実測では実装にも検証にも一件も当たらない**——`grep -rn 'handleLinkImage\|onPhotoChanged' frontend/src backend/src e2e` の出力は空（終了コード `1`）である。写真の選択と変更はいずれも `QuantityTableEditPage` の `handlePhotoSelect` がドラフトへ反映し、選んだ写真の `comment` を写真サマリへ載せる（上の `**不具合分析**` の箇条 1 と箇条 3 の再実測を見よ）。この項が名指すコールバックも、それが受け取るとした API レスポンスも、現況の経路には無い。タスク 79.1 が測定範囲外と宣言した欄であり、項は設計時の記述として残す。タスク 87.1。コミット `cba1233f`。2026-09-12 にリポジトリルートで実測
- Integration: PhotoChangeDialogの`onPhotoChanged`コールバックの型を拡張し、変更後の写真のcommentを含める。**`onPhotoChanged` も再実測では実装にも検証にも一件も当たらない**（上の項と同じ `grep -rn` の出力が空）。同部品が持つコールバックは `onClose` と `onSelect` の二つである（`grep -oE '^  on[A-Za-z]+' frontend/src/components/quantity-table/PhotoChangeDialog.tsx | sort -u` の出力が `onClose` と `onSelect` の 2 行）。しかも同部品は本番経路から到達できない（上の `**不具合分析**` の箇条 3 の再実測を見よ）ため、この項が求める型の拡張には担い手が無い。タスク 79.1 が測定範囲外と宣言した欄であり、項は設計時の記述として残す。タスク 87.1 の測定範囲は起票の 3 件に限り、走査は広げていない（範囲の内訳は本書 `### Out of Boundary` の `field-validation.ts` の項に置いた）。タスク 87.1。コミット `cba1233f`。2026-09-12 にリポジトリルートで実測
- Validation: コメントがnullの場合はPhotoCommentDisplayが空白表示を行うため、null安全性を維持する
- Risks: APIレスポンスのcommentフィールドが既に正しく返却されていることが前提。バックエンド側の修正が不要であることを確認済み

---

#### QuantityItemActionMenu（REQ-36）

| Field | Detail |
|-------|--------|
| Intent | 数量項目の行アクション（上へ移動・下へ移動・削除・コピー）を単一のドロップダウンメニューに統合し、表のボタン数を削減する |
| Requirements | 36.1, 36.2, 36.3, 36.4, 36.5, 36.6, 36.7, 36.8, 36.9 |

**Responsibilities & Constraints**

- アクションメニューボタン（三点メニューアイコン）の1つのみを行の右端に表示する
- メニュー内に「上へ移動」「下へ移動」「コピー」「削除」の操作項目を含める
- 最上位の項目では「上へ移動」をdisabled、最下位の項目では「下へ移動」をdisabledにする
- メニュー外クリックでドロップダウンを閉じる
- 既存のSortOrderButtonsコンポーネントを行から削除し、アクションメニュー内の「上へ移動」「下へ移動」に置き換える
- 既存の削除ボタンを行から削除し、アクションメニュー内の「削除」に置き換える
- 「削除」はメニュー内で赤文字スタイルを適用し、視覚的に区別する

**Dependencies**

- Inbound: EditableQuantityItemRow (P0)

**Contracts**: State [x]

##### State Management

```typescript
interface QuantityItemActionMenuProps {
  /** メニュー開閉状態 */
  isOpen: boolean;
  /** メニュー開閉トグルコールバック */
  onToggle: () => void;
  /** メニューを閉じるコールバック */
  onClose: () => void;
  /** 上に移動コールバック */
  onMoveUp: () => void;
  /** 下に移動コールバック */
  onMoveDown: () => void;
  /** コピーコールバック */
  onCopy: () => void;
  /** 削除コールバック */
  onDelete: () => void;
  /** 上に移動可能かどうか（falseの場合はdisabled） */
  canMoveUp: boolean;
  /** 下に移動可能かどうか（falseの場合はdisabled） */
  canMoveDown: boolean;
}
```

**EditableQuantityItemRow変更内容**

| 変更箇所 | Before | After |
|----------|--------|-------|
| アクションセル構成 | SortOrderButtons + 削除ボタン + メニューボタン（コピー・移動） | QuantityItemActionMenuボタンのみ |
| メニュー項目 | コピー、上に移動（条件付き）、下に移動（条件付き） | 上へ移動（disabled対応）、下へ移動（disabled対応）、コピー、削除（赤文字） |
| ボタン数（行表示） | 最大4個（上・下・削除・メニュー） | 1個（メニューボタンのみ） |
| gridTemplateColumns | アクション列80px | アクション列40pxに縮小可能 |

**Implementation Notes**

- Integration: EditableQuantityItemRowのアクションセルからSortOrderButtonsコンポーネントの参照と削除ボタンを除去し、QuantityItemActionMenuに統合する
- Integration: 既存のonMoveUp、onMoveDown、onDelete、onCopyコールバックはそのまま維持し、QuantityItemActionMenuに転送する
- Integration: メニュー外クリック検出はonBlurイベント（`e.currentTarget.contains(e.relatedTarget)`パターン）を維持する
- Validation: canMoveUp=falseの場合は「上へ移動」にdisabled属性を付与、canMoveDown=falseの場合は「下へ移動」にdisabled属性を付与
- Risks: SortOrderButtonsは数量グループの並び順変更（REQ-23）では引き続き使用されるため、コンポーネント自体は削除しない。EditableQuantityItemRowからの参照のみを削除する

---

#### 計算用フィールドの行内水平配置（REQ-37）

| Field | Detail |
|-------|--------|
| Intent | 計算方法「面積・体積」または「ピッチ」選択時の計算用フィールド群を、メイン行の操作列右側に同一行で水平配置し、ラベルとテキストボックスを交互に並べる。行高さは増やさず、画面右側へのはみ出しは水平スクロールで対応する |
| Requirements | 37.1, 37.2, 37.3, 37.4, 37.5, 37.6, 37.7, 37.8, 37.9, 37.10, 37.11, 37.12 |

**Responsibilities & Constraints**

- 計算用フィールド群は CSS Grid メイン行の外側ではなく、メイン行の操作列セルの直右側に inline-flex で水平配置される
- ラベルとテキストボックスはペア単位で `flex-direction: row` 配置（既存の縦ペアから横ペアに変更）
- ラベル幅・高さを縮小し、メイン行高さ（37px）と同等以下に収める
- 計算用フィールド群の表示順序は要件で固定（面積・体積: W → D → H → 重量 → 調整係数 → 丸め設定／ピッチ: 範囲長 → 端長1 → 端長2 → ピッチ長 → 長さ → 重量 → 調整係数 → 丸め設定）
- 計算方法「標準」では計算用フィールド群を一切表示しない
- 計算方法切替時は即時に計算用フィールド群を表示／非表示する（既存の reactive レンダリングを維持）
- 計算用フィールドのバリデーション・自動計算・小数桁表示・デフォルト値は既存実装（REQ-8/9/10）と同等に維持する（配置変更のみで動作変更なし）
- 計算用フィールド群の専用タイトル行（別行）を表示しない（REQ-18 AC3/AC4 と整合）

**Dependencies**

- Inbound: QuantityGroupCard (P0) — itemList を介して EditableQuantityItemRow を描画
- Outbound: CalculationEngine (P0) — 計算ロジックの呼び出しは既存どおり

**Contracts**: State [x]

**修正対象ファイルと変更内容**

| ファイル | 変更内容 |
|---------|---------|
| `frontend/src/components/quantity-table/EditableQuantityItemRow.tsx` | `calculationFieldsRow` 別行 div を削除し、メイン行（`itemRow`）の操作セルの直右側に `<CalculationFields>` を inline 配置。行高さ 37px を維持するため `flex-direction: row` + 縦パディング縮小 |
| `frontend/src/components/quantity-table/CalculationFields.tsx` | `container` / `fieldsGrid` を縦ペア grid から水平 flex（label + input ペアの連続配置）に変更。各 NumberInputField / AdjustmentField のラベル高さを 14px、入力高さを 22px に統一 |
| `frontend/src/components/quantity-table/gridConstants.ts` | 計算用フィールド領域は Grid 内列ではなく Grid 外の inline 領域として扱う方針を定数コメントに記載 |
| `frontend/src/components/quantity-table/QuantityGroupTitleRow.tsx` | 計算用フィールド専用タイトル列は追加しない（REQ-18 整合）。タイトル行はメイン列のみ |

**Layout Strategy**

採用案（デフォルト）と contingency 案を以下のとおり明示する。実装は採用案で着手し、採用案で行高さ不変（37px）が満たせない／既存テスト回帰が許容範囲を超えるなどの実測結果が出た場合に限り contingency 案に切り替える。

- **採用案（操作列セル wrapper 拡張）**:
  - メイン行は既存どおり 12列 CSS Grid（1180px）で描画する
  - 操作列セル（最右列）内に `wrapper` div を新設し、`display: flex; flex-direction: row; align-items: center; gap: 4px` で「既存操作ボタン群 + `<CalculationFields>`」を横並び配置
  - 計算用フィールド群は wrapper 内で `flex-shrink: 0` を指定し、操作ボタンと同列内に水平展開
  - **採用理由**: 既存 Grid メイン行のレイアウト構造（12列定義・gridTemplateColumns・gap）を維持できるため、Storybook デコレータ・scrollbar test の改修範囲が最小化される。回帰影響を局所化できる
- **Contingency 案（最上位 flex 化）**:
  - EditableQuantityItemRow の最上位コンテナを `display: flex; flex-direction: row` に変更し、Grid メイン行と inline 計算用フィールド群を兄弟要素として並べる
  - **採用条件**: 採用案で行高さ 37px を維持できない場合、または操作列セル内に計算用フィールド群を収めると DOM 構造が複雑化しすぎる場合に切り替える
  - 切り替え時は `QuantityTableEditPage.scrollbar.test.tsx` と Storybook デコレータの assertion 全面書き換えが必要になることを Spike タスクで事前確認する
- **共通仕様**:
  - 計算用フィールド群がビューポート右端を超えても表領域は `overflow-x: visible` を維持し、ページ全体（REQ-25）の水平スクロールで閲覧する
  - 行ごとに計算方法が異なる場合（標準／面積・体積／ピッチ混在）、各行の右端位置が揃わない点は許容仕様とする（REQ-37 AC8）

**Implementation Notes**

- Integration: `item.calculationMethod` の値に応じて `<CalculationFields>` を条件レンダリングする既存パターンを継続
- Integration: `onUpdate` コールバック・`calculationParams` の状態管理は既存どおり継続使用
- Validation: 行高さが 37px を超えないこと（DOM 計測テスト）、ラベルが visually-hidden ではないこと（getByLabelText で取得可能なこと）を回帰テストで担保
- Risks: 既存の Storybook デコレータ・スクロールバーテスト（`QuantityTableEditPage.scrollbar.test.tsx`）が「行下表示」を暗黙前提にしている可能性。実装時に当該テストの assertion を新レイアウト前提に書き換える
- Risks: `CalculationFields.test.tsx` の縦ペア前提テストを全面的に書き換える
- Risks: 既存 e2e の数量項目編集シナリオで `getByLabelText('幅(W)')` 等のラベルベースセレクタが引き続き動作することを確認

---

#### 数量グループのコピー機能（REQ-38）

| Field | Detail |
|-------|--------|
| Intent | 各数量グループパネルの表題部にコピーボタンを追加し、押下時に当該グループ（配下の全数量項目および写真紐づけを含む）を同一数量表内に複製する。複製先のグループは元グループの直下に挿入し、名前は「{元名}のコピー」とする |
| Requirements | 38.1, 38.2, 38.3, 38.4, 38.5, 38.6, 38.7, 38.8, 38.9, 38.10, 38.11, 38.12 |

**Responsibilities & Constraints**

- グループパネル表題部に「コピー」ボタンを追加（ダイアログ無し、押下即実行）
- 既存ボタン（展開／グループ名／並替↑↓／削除）との視覚干渉を避ける配置（並替ボタンと削除ボタンの間に挿入）
- コピーボタンのアイコンは Copy 系アイコン（中立色、削除ボタンの赤系とは区別）
- 複製処理はバックエンドで `$transaction` 一括実行（部分書き込み残留を防止）
- 複製先のグループ名は「{元名}のコピー」。最大文字数（全角25/半角50、REQ-22 AC4）を超える場合は元名部分を切り詰めて「のコピー」を末尾に付与
- 複製先の displayOrder は元グループの displayOrder + 1。後続グループの displayOrder を +1 シフトする一括 UPDATE を同一トランザクション内で実行
- 写真紐づけ（surveyImageId）は元グループと同じ値を保持（中間テーブルなし、直接 FK の再利用）
- 数量項目は元グループの全項目をフィールド値・displayOrder ともに複製
- 複製処理中はボタンを disabled 化して重複押下を防止、スピナーを表示
- エラー時は ROLLBACK し、部分的に作成された複製データを残さない
- 監査ログに `QUANTITY_GROUP_COPIED` アクションを記録（既存 `auditLogService.createLog()` を再利用）

**Dependencies**

- Inbound: QuantityTableEditPage (P0) — `handleCopyGroup` ハンドラの配線
- Outbound: QuantityGroupCard (P0) — `onCopyGroup` プロップの追加
- Outbound: QuantityGroupService (P0) — `copy()` メソッドの新設
- Outbound: PostgreSQL via Prisma (P0) — `$transaction` 内で QuantityGroup・QuantityItem を新規 INSERT

**Contracts**: Service [x], API [x]

##### Service Interface

```typescript
// backend/src/services/quantity-group.service.ts
class QuantityGroupService {
  /**
   * 数量グループを同一数量表内に複製する
   * @param groupId 複製元グループID
   * @param actorId 操作ユーザーID（監査ログ用）
   * @returns 複製されたグループの情報
   * @throws QuantityGroupNotFoundError 元グループが存在しない／論理削除済みの場合
   * @throws ForbiddenError 数量表への書き込み権限がない場合
   * @throws OptimisticLockError 並行操作により displayOrder シフトが競合した場合、
   *                              または copy 処理中に元グループが他セッションで削除された場合
   */
  async copy(
    groupId: string,
    actorId: string,
  ): Promise<QuantityGroupInfo>;
}

interface QuantityGroupInfo {
  id: string;
  quantityTableId: string;
  name: string;
  surveyImageId: string | null;
  displayOrder: number;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}
```

##### Concurrency Control

複製先 displayOrder の挿入と後続グループの +1 シフトは、同一数量表に対する別セッションからの並行操作（グループ追加・並び替え・別グループの copy）と競合する可能性がある。これを防ぐため、`$transaction` 開始直後に親 QuantityTable 行へ排他ロックを取得して serialize する。

```typescript
await prisma.$transaction(async (tx) => {
  // 1. 親 QuantityTable に行ロックを取得（並行 displayOrder 操作を serialize）
  await tx.$queryRaw`
    SELECT id FROM "QuantityTable"
    WHERE id = ${quantityTableId} AND "deletedAt" IS NULL
    FOR UPDATE
  `;

  // 2. 元グループの再取得（ロック取得後の最新状態で確認）
  const sourceGroup = await tx.quantityGroup.findUnique({
    where: { id: groupId },
    include: { items: true },
  });
  if (!sourceGroup) throw new QuantityGroupNotFoundError(groupId);

  // 3. 後続グループの displayOrder を +1 シフト
  await tx.quantityGroup.updateMany({
    where: {
      quantityTableId: sourceGroup.quantityTableId,
      displayOrder: { gt: sourceGroup.displayOrder },
    },
    data: { displayOrder: { increment: 1 } },
  });

  // 4. 複製グループの挿入
  // 5. 配下数量項目の複製
  // 6. 監査ログ記録
});
```

- **ロック粒度**: QuantityTable 行単位。同一数量表内の並行 displayOrder 操作のみ serialize し、別の数量表への操作はブロックしない
- **失敗ハンドリング**: ロック取得タイムアウト（既存 Prisma デフォルト 5 秒）または `SELECT FOR UPDATE` で対象行が削除済みの場合、`OptimisticLockError` を投げて API 層で 409 にマップする
- **代替案不採用**: `isolationLevel: 'Serializable'` も検討したが、PostgreSQL の Serializable は実行時にシリアライズ失敗を検出するため、ロック取得時点で失敗させる `FOR UPDATE` の方が動作が予測可能で既存サービス層パターン（`quantity-table.service.ts`）と整合する
- **ロック粒度が及ぶ操作の現況（Task 88.1）**: 上の冒頭の段落が挙げる「グループ追加・並び替え」は、行ロックを取らず直列化されていない。取るのは `copy()`・`createGroupsFromSurvey()`・`saveDraft` である。決着と根拠は `#### QuantityTableService.saveDraft（フル状態同期保存）` の「並行制御の範囲（Task 88.1 の決着）」 に置いた。**【現況】Task 92.4 が「グループ追加・並び替え」にも同じ数量表の行ロックを入れた**ので、この箇条が述べる不在は Task 88.1 / 92.1 の時点の記録である。現在ロックを取るのは、`copy()`・`createGroupsFromSurvey()`・`saveDraft` に加えて数量グループの `create()` / `update()` / `updateDisplayOrder()` と数量項目の7経路である（`#### QuantityGroupService` の「並行する要求に対する窓を塞いだ形（Task 92.4 の決着）」）
- **失敗ハンドリングの現況（Task 92.2 の実測）**: 上の「失敗ハンドリング」の箇条は copy 向けの記述として書いた時点のまま残す。`saveDraft` の時間切れには当てはまらない。先行の保存が数量表の行ロックを Prisma 既定の 5 秒を超えて保持すると、後発は 409 ではなく 500（`code` は `QUANTITY_TABLE_SAVE_ERROR`）を返す。また後発の待機は 5 秒で打ち切られず、先行が終わるまで続く。**【現況】Task 92.5 が `saveDraft` のトランザクションへ `SET LOCAL lock_timeout`（2 秒）を掛けたため、「先行が終わるまで続く」と「後発は 500 になる」はいずれも Task 92.2 の時点の記録である。** 現在は待機が 2 秒で打ち切られ、上限超過は 503（`QUANTITY_TABLE_SAVE_BUSY`）で返る。上限は当該トランザクションの内側だけに効き、`copy()` / `createGroupsFromSurvey()` や Task 92.4 が10経路へ入れた行ロックには掛からない。実測・決着・採らなかった案は `#### QuantityTableService.saveDraft（フル状態同期保存）` の「ロック待ちの時間切れの応答（Task 92.2 の決着）」 に置いた

##### API Contract

| 項目 | 内容 |
|------|------|
| Method / Path | `POST /api/quantity-groups/:id/copy` |
| 認証 | 必須（既存 JWT 認証） |
| 権限 | `quantity_table:create`（REQ-17 の copyQuantityTable と同等） |
| Request Body | 無し（空オブジェクトを許容） |
| Response (201) | `QuantityGroupInfo`（複製先グループ） |
| Response (404) | 元グループが存在しない、または論理削除済み（Service 層の `QuantityGroupNotFoundError` をマッピング） |
| Response (403) | 権限不足（Service 層の `ForbiddenError` をマッピング） |
| Response (409) | 並行制御競合（Service 層の `OptimisticLockError` をマッピング）。原因: ロック取得タイムアウト／ロック後の元グループ削除検出／並行 displayOrder 操作の serialize 失敗 |
| Response (500) | サーバー内部エラー（ROLLBACK 済み、上記以外） |
| Idempotency | 非べき等（押下ごとに新グループが作成される）。フロント側で重複押下をスピナーで防止 |
| 409 ハンドリング（フロント） | ユーザーに「他のユーザーが操作中です。再試行してください」メッセージを表示し、コピーボタンを再有効化（リトライ可能状態に戻す） |

##### Frontend Interface

```typescript
// frontend/src/api/quantity-tables.ts（既存 API クライアントに追記）
export async function copyQuantityGroup(
  groupId: string,
): Promise<QuantityGroupInfo>;

// frontend/src/components/quantity-table/QuantityGroupCard.tsx の拡張プロップ
interface QuantityGroupCardProps {
  // 既存プロップに加えて:
  onCopyGroup?: (groupId: string) => void | Promise<void>;
  isCopying?: boolean;
}
```

**修正対象ファイルと変更内容**

| ファイル | 変更内容 |
|---------|---------|
| `frontend/src/components/quantity-table/QuantityGroupCard.tsx` | 表題部の並替ボタン（`onMoveUp` / `onMoveDown`）と削除ボタン（`onDelete`）の間に「コピー」ボタンを追加。`onCopyGroup` / `isCopying` プロップを追加し、isCopying 中は disabled + スピナー表示 |
| `frontend/src/pages/QuantityTableEditPage.tsx` | `handleCopyGroup(groupId)` ハンドラを追加し `QuantityGroupCard` に配線。API 成功時に複製先グループをローカルステートに反映し、元グループの直下に挿入 |
| `frontend/src/api/quantity-tables.ts`（既存 API クライアントに追記） | `copyQuantityGroup(groupId): Promise<QuantityGroupInfo>` を追加（`POST /api/quantity-groups/:id/copy` を呼び出し） |
| `backend/src/routes/quantity-groups.routes.ts` | `POST /:id/copy` ルートを追加（既存ファイルへ追記）。権限ミドルウェア `requirePermission('quantity_table:create')` を適用 |
| `backend/src/services/quantity-group.service.ts` | `copy(groupId, actorId): Promise<QuantityGroupInfo>` メソッドを追加。`quantity-table.service.ts` の copy パターンを参考に縮小実装 |
| `backend/src/schemas/quantity-table.schema.ts`（または分離ファイル） | リクエストボディは空のため新規スキーマ不要（ルート側で空オブジェクト許容） |

**Implementation Notes**

- Integration: 既存の `quantity-group.service.ts` の `create()` / `update()` メソッドを内部から呼ばず、`copy()` 内で直接 `prisma.quantityGroup.create()` / `prisma.quantityItem.createMany()` を実行する（REQ-17 と同パターン）
- **現調画像の所属の検査（タスク 91.1）**: REQ-38.4（元の写真紐づけを複製先でも維持する）は、**他プロジェクトの現調画像を指す紐づけには掛からない**。当該の紐づけは取得経路（タスク 86.3）が `surveyImageId` ごと落とすため、利用者から見て「紐づけられている写真」ではない。`copy()` は複製先の `surveyImageId` を `null` にし、複製自体は従来どおり 201 で成功する。所属の判定に用いる `survey.projectId` はロック取得後の元グループの取得の項目を広げて得るため、追加の問い合わせは増えない。親の現場調査が論理削除された画像の紐づけは落とさずに写す。結論・採らなかった案は `### Error Categories and Responses` に置いた
- Integration: 後続グループの displayOrder シフトは `prisma.quantityGroup.updateMany({ where: { quantityTableId, displayOrder: { gt: srcGroup.displayOrder } }, data: { displayOrder: { increment: 1 } } })` を `$transaction` 内で実行
- Concurrency: トランザクション開始直後に親 QuantityTable 行への `SELECT ... FOR UPDATE` を取得し、同一数量表に対する並行 displayOrder 操作（追加・並び替え・別グループの copy）を serialize する（詳細: 上記 Concurrency Control セクション）
- Concurrency: ロック取得失敗・タイムアウト・ロック後の元グループ削除検出は `OptimisticLockError` として上位に伝播し、API 層で 409 にマップする
- Concurrency の現況（Task 88.1）: 上の2項と `##### Concurrency Control` が述べる「追加・並び替え・別グループの copy と競合し、serialize する」は書いた時点の記録として残す。数量表の行ロックを取るのは `copy()`・`createGroupsFromSurvey()`・`saveDraft` で、追加（`create()`）と並び替え（`updateDisplayOrder()`）は取らない。決着と根拠は `#### QuantityTableService.saveDraft（フル状態同期保存）` の「並行制御の範囲（Task 88.1 の決着）」 に置いた。**【現況】Task 92.4 が追加（`create()`）と並び替え（`updateDisplayOrder()`）にも同じ数量表の行ロックを入れたため、現在は当初の記述どおり serialize される**（`#### QuantityGroupService` の「並行する要求に対する窓を塞いだ形（Task 92.4 の決着）」）
- Validation: 元グループの存在チェック → 数量表 ID 経由で書き込み権限チェック → トランザクション開始の順
- Validation: 名前文字数超過時の切り詰めロジックは `QuantityValidationService` に `truncateForCopy(originalName: string, suffix: string): string` を新設して再利用可能化
- Risks: 数量項目が大量（数百件）にあるグループのコピーは DB 負荷が増加する。既存 REQ-17（数量表コピー）と同等のサイズ想定（最大 100 項目程度）でテストし、必要に応じてレート制限を後追い検討（design 外 / out of scope）
- Risks: 監査ログのアクション名は既存パターン（`QUANTITY_TABLE_COPIED`, `QUANTITY_ITEM_COPIED`）に合わせ `QUANTITY_GROUP_COPIED` を新設
- Open Question: コピーボタンの配置位置（並替↑↓の右／削除ボタンの左）は実装段階で UI レビューを経て確定（research.md Section 5 #5 と整合）

---

#### 写真選択・変更ダイアログのレイアウト修正（REQ-39）

| Field | Detail |
|-------|--------|
| Intent | 写真選択ダイアログの写真一覧で、写真枚数が増加した際に写真同士が重なる不具合を解消し、各写真を重なりなく表示・選択可能にする |
| Requirements | 39.1, 39.2, 39.3, 39.4, 39.5, 39.6 |

**不具合分析**

写真一覧は専用コンポーネント `PhotoChangeDialog.tsx` ではなく、`QuantityTableEditPage.tsx` 内のインライン実装（`styles.photoGrid` / `styles.photoItem`、描画は `availablePhotos.map`）で表示される。写真選択（グループ追加時）・写真変更（「別の写真を選択」）とも同一の `handleSelectImage` を経由するため、本インラインダイアログ1箇所の修正で両ダイアログに対応できる。現状 `photoGrid` は `gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))'`、`photoItem` は `aspectRatio: '1'` のみで `grid-auto-rows` が未指定。`overflowY:'auto'` + `flex:1` のコンテナ内で行高さが `aspect-ratio` から正しく確定せず、枚数増加時に行が潰れて写真が重なる。

**この「現状」の記述は本節を書いた時点の記録であり書き換えない（タスク 115.234。`site-survey` の design.md「実測値の書き方（タスク 115.212）」の (a) に従う）。再実測では偽である**——`QuantityTableEditPage.tsx` の `styles.photoGrid` は `gridAutoRows: '150px'` を持ち、`styles.photoItem` も `aspectRatio` ではなく `height: '150px'` と `minHeight: '150px'` を持つ。本節が述べる REQ-39 の修正がコミット `628fbe9`（2026-06-06）で実装され、同じコミットに本節の記述も入っているため、記述はそのコミットの時点で既に偽であった（`git log -S` と `git show 628fbe9^` で一件ずつ確かめた）。コミット `6b84be3`。2026-09-02 にリポジトリルートで実測。

**修正対象コンポーネントと変更内容**

| コンポーネント | 修正内容 |
|---------------|---------|
| QuantityTableEditPage（インライン写真選択ダイアログ） | `photoGrid` に `gridAutoRows` を明示（各セルの高さを列幅に追従させる、またはサムネイル固定高を設定）し、行が潰れて写真が重なる事象を解消する。`gap` による間隔を維持し、隣接写真と重複しないことを保証する。写真枚数がコンテナを超える場合は既存の `overflowY:'auto'` で縦スクロール表示する |

**Responsibilities & Constraints**

- 修正対象はレイアウト（CSS）のみ。写真取得方式（`handleSelectImage` の `getSiteSurveys`→`getSiteSurvey` バッチ取得）・注釈付き写真の表示内容・注釈バッジ（REQ-3.3）は変更しない
- 未使用の `PhotoChangeDialog.tsx`（参照は単体テストのみ）は本要件のスコープ外（残置・削除しない）。**「参照は単体テストのみ」は再実測では偽である**——ストーリーからも参照される。再実測の内訳は本書 `### Architecture Pattern & Boundary Map` の修正コンポーネント（REQ-39）の行へ併記した（タスク 115.234。2026-09-02 に実測）
- ビューポート幅が狭い場合も写真が重ならないこと（狭幅でも最低1列で潰れず表示）

**Implementation Notes**

- **根本原因先行（必須・最初のステップ）**: CSS を変更する前に、写真多数枚・複数ビューポート幅で**重なりを実機再現し、DevTools で原因要素・原因プロパティを特定する**（root-cause-first）。下記の `gridAutoRows` 欠如は有力仮説だが確定ではないため、特定結果に基づいて修正内容を確定する。誤った箇所の修正による重なり残存を防ぐ
- Integration: 原因特定後、`styles.photoGrid` / `styles.photoItem` の調整に限定。仮説どおりであれば `gridAutoRows`（明示高、またはセルに `minHeight`）でロウ高さを確定させる
- Validation: 重なりゼロの確認は実機（複数ビューポート幅・多数枚）で行う。重なりの矩形判定（`getBoundingClientRect`）は実レイアウトが必要なため **E2E（Playwright）** で実施する（jsdom 単体テストでは検証不可）
- Risks: `aspect-ratio` とグリッド行高さの相互作用はブラウザ実装差があるため、固定高フォールバックを併用する

---

#### 現場調査からの数量グループ一括生成（REQ-40）

| Field | Detail |
|-------|--------|
| Intent | 対象現場調査を指定し、その現場調査の全写真（注釈有無問わず）の枚数分の数量グループを既存グループ末尾に連番命名で原子的に生成し、各グループに写真を1枚ずつ紐づける |
| Requirements | 40.1, 40.2, 40.3, 40.4, 40.5, 40.6, 40.7, 40.8, 40.9, 40.10, 40.11, 40.12, 40.13 |

**Responsibilities & Constraints**

- バックエンド: `QuantityGroupService.createGroupsFromSurvey` が現場調査の全写真を写真順（`displayOrder`）に取得し、既存グループの `max(displayOrder)+1` から連番でグループを末尾追加する。全処理を単一トランザクションで実行し、エラー時はロールバックする（AC12）
- 並行制御: REQ-38 `copy()` と同一の方針を採用する。当該数量表の数量グループ群に対して `SELECT FOR UPDATE`（行ロック）を取得してから `max(displayOrder)` 算出・末尾追加を行い、同一数量表への add/copy/reorder/一括生成が並行しても displayOrder 衝突・順序破綻が起きないよう直列化する。ロック取得タイムアウト時は `OptimisticLockError` を送出し、API 層で 409 にマップする（design.md「数量グループのコピー機能（REQ-38）」`##### Concurrency Control` と整合）
- 並行制御の現況（Task 88.1）: 上の箇条は書いた時点の記録として残す。`createGroupsFromSurvey()` は数量表の行ロックを取るが、add（`create()`）と reorder（`updateDisplayOrder()`）は取らず、「add/copy/reorder/一括生成が並行しても displayOrder 衝突・順序破綻が起きない」の範囲に入っていない（両者は逐次でも displayOrder を重ねうることを実測した）。数量表の行ロックを取るのは一括生成・copy・`saveDraft` の三つである。決着と根拠は `#### QuantityTableService.saveDraft（フル状態同期保存）` の「並行制御の範囲（Task 88.1 の決着）」 に置いた。**【現況】Task 92.1 が逐次の重なりを、Task 92.4 が並行の窓（add と reorder への行ロック追加）をそれぞれ塞いだため、現在は「add/copy/reorder/一括生成が並行しても displayOrder 衝突が起きない」が成り立つ**（`#### QuantityGroupService` の「並行する要求に対する窓を塞いだ形（Task 92.4 の決着）」）
- グループ名は「{現場調査名} {連番}」（連番1始まり）。最大文字数（全角25/半角50、REQ-22 AC4）超過時は現場調査名部分を切り詰めて連番を付与する（REQ-38 の `truncateForCopy` を汎用化した命名ヘルパーを共有）
- 各グループは数量項目0件の初期状態で作成する（AC9）。数量項目の自動生成は行わない
- 写真0枚の場合はグループを生成せず `created: 0` を返し、フロントで「写真が存在しません」メッセージを表示する（AC10）
- 写真コメント表示は既存の REQ-21・REQ-35 のコメント取得・表示ロジックに委譲する（本コンポーネントはコメントを生成・保持しない、AC8）
- フロントエンド: `QuantityTableEditPage` の「グループを追加」ボタン近傍に「現場調査から一括追加」ボタンを追加し、`SurveySelectDialog`（プロジェクトの現場調査一覧から1件選択）を表示する。実行中はインジケーター表示・重複実行防止（AC11）、完了時は生成グループ数を含むメッセージを表示（AC13）

**Dependencies**

- Inbound: QuantityTableEditPage (P0), SurveySelectDialog (P0)
- Outbound: 現場調査API（`getSiteSurveys` / `getSiteSurvey`、写真と `displayOrder` 取得）(P0)、PrismaClient (P0)、auditLogService (P1)

**Contracts**: Service [x] / API [x] / State [x]

##### Service Interface（命名ヘルパー）

```typescript
/**
 * グループ連番命名ヘルパー（REQ-40）。REQ-38 のコピー命名（truncateForCopy）と
 * 同一の文字数規則（全角25/半角50、REQ-22 AC4）に従って生成する。
 * @param surveyName 現場調査名
 * @param sequence 連番（1始まり）
 * @returns 「{切り詰めた現場調査名} {連番}」
 */
function buildGroupNameFromSurvey(surveyName: string, sequence: number): string;
```

##### State Management（SurveySelectDialog）

```typescript
interface SurveySelectDialogProps {
  /** ダイアログ開閉状態 */
  isOpen: boolean;
  /** 選択肢となる現場調査一覧（当該プロジェクト） */
  siteSurveys: SiteSurveySummary[];
  /** 生成中フラグ（true でボタンdisabled・インジケーター表示） */
  isCreating: boolean;
  /** 実行確定コールバック（選択された現場調査ID） */
  onConfirm: (siteSurveyId: string) => void;
  /** 閉じるコールバック */
  onClose: () => void;
}

interface SiteSurveySummary {
  id: string;
  name: string;
  photoCount: number;
}
```

**Implementation Notes**

- Integration: バックエンドは `QuantityGroupService.copy` のトランザクション + `createMany` パターンを流用し、写真枚数分のグループ生成 + 写真紐づけを一括実行する
- Integration: フロントは生成後 `CreateGroupsFromSurveyResult.groups` をローカルステート末尾に追加し、再フェッチを最小化する
- Validation: 現場調査が当該数量表の属するプロジェクトに属することをバックエンドで検証（403/404）。`siteSurveyId` は Zod で検証
- Risks: 写真枚数が多い場合の生成件数。トランザクション内 `createMany` で1リクエスト・1コミットとし、N回API呼び出しを避ける

---

#### 水平スクロール時の画像・コメント固定表示（REQ-41）

| Field | Detail |
|-------|--------|
| Intent | 数量グループ内の水平スクロール時に、画像と現場調査コメントが左へスクロールアウトして消える不具合を解消し、画像・コメントを水平スクロール対象から外して常時固定表示する |
| Requirements | 41.1, 41.2, 41.3, 41.4, 41.5, 41.6 |

**不具合分析**

`QuantityGroupCard` ではカード全体（`styles.card`）に `overflowX:'auto'` が掛かっており、`photoArea`（画像 + コメント、`display:flex`）と数量項目テーブル行群が同一の水平スクロールコンテナ内に存在する。数量項目テーブルはグリッド列幅合計（`QUANTITY_ITEM_GRID_COLUMNS` ≈ 1264px、REQ-37 でさらに拡大）が常にビューポートを超えるため水平スクロールが発生し、右へスクロールすると `photoArea` も一緒に左へ流れて消える。

**修正対象コンポーネントと変更内容**

| コンポーネント | 修正内容 |
|---------------|---------|
| QuantityGroupCard | カード全体の `overflowX:'auto'` を撤去し、`content` 内を縦flex（`flex-direction: column`）に再構成。`photoArea`（画像・コメント・写真変更ボタン）はスクロール外に配置して固定表示する。数量項目テーブル部分のみを `overflowX:'auto'` のラッパー div で囲み、水平スクロールをテーブルに限定する |
| PhotoCommentDisplay | スクロールコンテナ外に配置されるため水平方向の追加対応は不要（既存の `overflowY:'auto'` を維持）。コメントは画像の右側に固定表示される |

**Responsibilities & Constraints**

- 水平スクロール対象は数量項目テーブル（メイン行 + REQ-37 計算用フィールド群）のみに限定する（AC3）
- 画像・コメントの固定表示は折りたたみ（REQ-3 AC4 / REQ-21 AC5、`content` の `maxHeight` 制御）と両立する。折りたたみ時は画像・コメントも非表示、再展開時は固定表示で再表示する（AC5, AC6）
- 垂直スクロール（REQ-25 AC2）・テーブルの水平スクロール機能（REQ-25 / REQ-37 AC6）を阻害しない（AC4）
- sticky ではなくスクロールコンテナの分割で実現する（背景の重なり・z-index 問題を回避）

**Implementation Notes**

- Integration: `QuantityGroupCard` の DOM 構造を「ヘッダー / photoArea（固定） / itemTableWrapper（`overflowX:'auto'`）」の縦並びに再構成する
- Validation: 右端までスクロールしても画像・コメントが見え続けること、テーブルの右端フィールドが閲覧できることを実機・E2Eで確認
- Risks: 既存の `QuantityGroupCard.stories.tsx` および関連単体テストへの影響。DOM再構成後に回帰確認が必要

---

#### 影響ファイル一覧（REQ-39〜41）

| 区分 | ファイル | 変更種別 | 責務 |
|------|---------|---------|------|
| FE | `frontend/src/pages/QuantityTableEditPage.tsx` | 変更 | REQ-39: 写真選択ダイアログ `photoGrid`/`photoItem` CSS修正 / REQ-40: 「現場調査から一括追加」ボタン・ハンドラ・SurveySelectDialog 統合 |
| FE | `frontend/src/components/quantity-table/SurveySelectDialog.tsx` | 新規 | REQ-40: 現場調査選択ダイアログ |
| FE | `frontend/src/components/quantity-table/QuantityGroupCard.tsx` | 変更 | REQ-41: 水平スクロールをテーブルへ限定し画像・コメントを固定表示 |
| FE | `frontend/src/api/quantity-tables.ts` | 変更 | REQ-40: `createGroupsFromSurvey` クライアント関数追加 |
| FE | `frontend/src/utils/`（命名ヘルパー、既存の命名ロジックがある箇所） | 変更/新規 | REQ-40: `buildGroupNameFromSurvey`（REQ-38 命名規則の汎用化・共有）。配置の現況は表の直下の併記を読むこと（タスク 96.10） |
| BE | `backend/src/services/quantity-group.service.ts` | 変更 | REQ-40: `createGroupsFromSurvey`（トランザクション一括生成） |
| BE | `backend/src/routes/`（数量表/グループのルート定義ファイル） | 変更 | REQ-40: `POST /api/quantity-tables/:tableId/groups/from-survey` |
| TEST | `e2e/specs/quantity-tables/` 配下 | 新規 | REQ-39/40/41 の E2E（重なり・一括生成・スクロール固定） |

- **上の表が命名ヘルパーの置き場として挙げる行の現況（タスク 96.10）**: 行は REQ-39〜41 を設計した時点のファイル計画として残し、ここへ現況の再実測を併記する（site-survey の設計文書 `#### 実測値の書き方（タスク 115.212）` の (a)）。**`buildGroupNameFromSurvey` はフロントエンドの `utils` 配下に置かれていない。** 置き場は次の二つである。
  - フロントエンド: `frontend/src/pages/quantityTableEditReducer.ts` のファイル内の非公開関数（輸出しない）。切り詰めは同ファイル内の `truncateNameWithSuffix` へ委譲し、文字幅の数え方だけを `frontend/src/utils/field-validation.ts` の `calculateStringWidth` から取り込む
  - バックエンド: `backend/src/services/quantity-validation.service.ts` の `QuantityValidationService` のメソッド。`backend/src/services/quantity-group.service.ts` の `createGroupsFromSurvey` が呼ぶ
  - 再現コマンドと出力: `grep -rlF 'buildGroupNameFromSurvey' frontend/src/utils` の出力は空（終了コード `1`）。名前でなく挙動で探す `grep -rlE '連番|WithSuffix|buildGroup' frontend/src/utils --include=*.ts --exclude='*.test.ts'` も空（終了コード `1`）。`grep -rlF 'buildGroupNameFromSurvey' frontend/src backend/src | grep -vE '\.test\.|__tests__'` の出力は上の三つのファイルである
  - 同じく: `grep -cE '^function buildGroupNameFromSurvey\(' frontend/src/pages/quantityTableEditReducer.ts` の出力は `1`、`^export function` で始めた同じ式の出力は `0`（終了コード `1`）。`grep -cE '^  buildGroupNameFromSurvey\(' backend/src/services/quantity-validation.service.ts` の出力は `1`
  - 経緯: 起票文（`tasks.md` の 96.10）は、生成をクライアント側のドラフトへ寄せた REQ-42 で置き場が動いたと読む。履歴からは順序を確かめられない——`git log --oneline -S 'buildGroupNameFromSurvey'` を `frontend/src` と `backend/src/services` のそれぞれへ掛けても、本書の表の行の文言へ掛けても、出力は同じ squash コミット `628fbe96` の1行である
  - 走査範囲: 本書で `buildGroupNameFromSurvey` の置き場を述べるのは上の表の行だけである。`grep -n 'buildGroupNameFromSurvey' .kiro/specs/quantity-table-generation/design.md` の出力は本併記を書き足す前は3行で（`##### Service Interface（命名ヘルパー）` の囲み・上の表の行・テスト計画の単体テストの項）、囲みとテスト計画の項は置き場を述べない。書き足した後は本併記の行が加わる（自己言及のため差し引いて読む）
  - タスク 96.10。コミット `c113b4a9`。2026-09-15 にリポジトリルートで実測

未使用の `frontend/src/components/quantity-table/PhotoChangeDialog.tsx` は本スコープでは変更しない（残置）。

---

### クライアントサイド編集・明示保存・離脱ガード・固定ヘッダー（REQ-42〜45）

#### Boundary Commitments（REQ-42〜45）

- **本spec が所有する範囲**:
  - 数量表編集画面（`QuantityTableEditPage`）の書き込みパスをドラフト編集＋明示保存（フル状態同期）へ再設計すること
  - フル状態同期の保存エンドポイント `PUT /api/quantity-tables/:id/save`（`QuantityTableService.saveDraft`）の新設（既存 `bulk-save` を全状態同期へ拡張・置換）
  - 編集画面の離脱ガード（REQ-43）・未保存インジケーター（REQ-44）・ヘッダー固定表示（REQ-45）
- **Out of Boundary（所有しない）**:
  - 数量表一覧画面の数量表名変更（REQ-2 AC5）は従来どおり即時 PUT を維持（編集画面の明示保存対象外）
  - 参照系API（数量表取得、オートコンプリート候補、写真コメント、現場調査写真一覧、インポートOCR/パース）の挙動変更（REQ-42 AC10 によりスコープ外＝従来どおり随時実行）
  - リアルタイム共同編集・WebSocket同期（Non-Goals）
  - 数量計算ロジック・フィールド仕様・PDF出力・インポート抽出の挙動（REQ-8〜10/26〜34 は不変、配置・保存タイミングのみ整合）
- **Allowed Dependencies**:
  - フロント: `frontend/src/hooks/useUnsavedChanges.ts`、React Router v7 `useBlocker`、`crypto.randomUUID()`、既存 API クライアント `frontend/src/api/quantity-tables.ts`
  - バックエンド: `QuantityTableService`/`QuantityGroupService`/`QuantityItemService`/`QuantityValidationService`、Prisma `$transaction` ＋ `SELECT FOR UPDATE`（REQ-38/40 と同一の直列化方針）、Zod、`AuditLogService`
- **Revalidation Triggers（下流再検証が必要になる変更）**:
  - `saveDraft` のペイロード契約（グループ/項目の作成・削除・並び替え・名称・写真紐づけ・仮ID表現）の変更
  - 楽観ロック方式（`expectedUpdatedAt`）や競合時の挙動の変更
  - `useUnsavedChanges`/`useBlocker` の共有実装の変更
  - REQ-37（計算用フィールド水平展開）・REQ-41（画像・コメント固定）・REQ-25（スクロール）のレイアウト前提が変わり、ヘッダー sticky の祖先 overflow 条件に影響する場合

#### QuantityTableService.saveDraft（フル状態同期保存）

| Field | Detail |
|-------|--------|
| Intent | 数量表のドラフト全状態を単一トランザクションで差分適用して永続化（REQ-42, 11.1-11.4） |
| Requirements | 11.1, 11.2, 11.3, 11.4, 42.5, 42.8, 42.9 |

**Responsibilities & Constraints**

- 受領した「数量表の全グループ・全項目の最終状態」と DB 現状を差分比較し、作成（id=null/tempId）／更新（既存id）／削除（payloadに存在しないDB行）／並び替え（displayOrder）／グループ名・数量表名・写真紐づけ（surveyImageId）を適用
- 並行制御は `expectedUpdatedAt` による楽観的排他制御を主とする（不一致は 409 `QuantityTableConflictError`。既存 `bulkSave` と同一方針）。REQ-42 適用後は saveDraft が編集画面の唯一の書き込み手段となり、並行 save は後発が 409 となるため整合は楽観ロックで担保される。`SELECT ... FOR UPDATE` によるテーブル行ロックは追加の防御として任意（必須ではない）
- 全フィールドを `QuantityValidationService` で検証（文字数・数値範囲・計算整合）。不整合時は保存中断（REQ-11.2/11.3）
- 単一 `$transaction`。失敗時 ROLLBACK で部分反映を残さない。完了後 `updatedAt` 更新・監査ログ記録・最新 `QuantityTableDetail` を返却

**並行制御の範囲（Task 88.1 の決着）**

本節の上の箇条（楽観的排他制御を主とし行ロックは任意とする記述）と、`##### Concurrency Control`（REQ-38）・`#### 現場調査からの数量グループ一括生成（REQ-40）` が述べる並行制御の範囲は、書いた時点の記録として残す。Task 88.1 が実測に基づいて次のとおり決着させた。実測はいずれもコミット `36c816dd` の作業ツリーで、2026-09-12 にリポジトリルートから行った。

- **決着**: 数量グループの displayOrder を書く経路のうち、画面から到達するのは `saveDraft` だけである。そこで (1) `saveDraft` には数量表の行の `SELECT ... FOR UPDATE` を、差分元と `updatedAt` の読み取りより前に取らせる（実装を設計の「並行 save は後発が 409」へ揃える）。(2) 「add / copy / reorder / from-survey の4種を直列化する」という主張は、行ロックを取る `copy()` と `createGroupsFromSurvey()` の2種へ狭める（設計を実装へ揃える）。`saveDraft` のロックは両者と同じ数量表の行に取る
- **画面からの到達の実測**: 関数名ごとに `grep -rlw '<関数名>' frontend/src --include=*.ts --include=*.tsx | grep -v '\.test\.\|\.stories\.\|__tests__' | grep -v 'frontend/src/api/quantity-tables.ts'` を走らせた。`createQuantityGroup` / `updateQuantityGroup` / `updateGroupDisplayOrder` / `createGroupsFromSurvey` は 0 ファイル、`saveQuantityTableDraft` は 3 ファイルである。`copyQuantityGroup` は 1 ファイルに当たるが、次の行のとおり註の中の言及である
  - `frontend/src/pages/QuantityTableEditPage.tsx` の `handleCopyGroup` の JSDoc の註（`grep -n copyQuantityGroup` の当たりはこの1行のみ）。呼び出しではない
  - 画面のグループの追加・コピー・並び替え・一括生成はいずれもドラフトの操作で、永続化は `PUT /api/quantity-tables/:id/save` の1回に畳まれる（REQ-42）
- **行ロックの所在の実測**: `grep -n 'FOR UPDATE' backend/src/services/quantity-group.service.ts` の当たりは `577` / `620` / `626`（`copy()`）と `757` / `797` / `803`（`createGroupsFromSurvey()`）の6行で、起票（コミット `9c4dc21e`）の値と一致した。同じファイルの `create()`・`updateDisplayOrder()`・`update()` は行ロックを取らない
  - `backend/prisma/schema.prisma` の `QuantityGroup` は `@@index([quantityTableId, displayOrder])` を持つだけで、同じ組の一意制約は無い（`grep -n -A25 '^model QuantityGroup ' backend/prisma/schema.prisma | grep '@@'` の出力による）
- **画面から到達する唯一の経路で重なりが起きていた**: 行ロックを入れる前の `saveDraft` へ、同じ版から出た保存2本（どちらも既存2グループの末尾へ新規グループを1件足す）を同時に送る一時プローブを 5 回走らせた。5 回とも両方が 200 を返し（楽観的排他制御の照合を両方が通過した）、displayOrder 2 のグループが2件残った。プローブのファイルは提出物に残していない。同じ形は統合検証「同時並行保存の直列化（Task 88.1）」の2件目が固定しており、下の変異 M1 を当てれば再現できる
- **個別 API は直列化しても重なりを防げない**: 同じ一時プローブで、並行を含まない逐次の要求を実測した。いずれも既存2グループ（displayOrder 0 と 1）の数量表に対して送った
  - `POST /api/quantity-tables/:quantityTableId/groups` を displayOrder 省略で送ると 201 で displayOrder 0 に作られ、既存の先頭と重なった。ルートの zod スキーマ `createQuantityGroupSchema` が displayOrder を `.default(0)` で補うため、`create()` の件数による既定は経路からは使われない
  - `PUT /api/quantity-tables/:quantityTableId/groups/order` に同じ displayOrder を2件送ると 204 で重なった
  - `PUT /api/quantity-groups/:id` に既存の先頭と同じ displayOrder を送ると 200 で重なった
  - 対照として `POST /api/quantity-groups/:id/copy` は後続を +1 して重ならなかった
  - **3件の重なりはどれも並行を含まないので、行ロックを足しても消えない**
- **採らなかった側（4種すべての直列化）を採らなかった理由**: (i) `create()`・`updateDisplayOrder()` は画面から到達しない（上の実測で呼び出しは 0）。(ii) 到達したとしても、重なりの原因は並行ではなく呼び出し側が渡す displayOrder の値そのものであり、上の逐次の実測のとおり直列化では防げない。防ぐには displayOrder をサーバーが採番する契約への変更か、`(quantityTableId, displayOrder)` の一意制約が要り、いずれも本項の境界（数量グループの並び順の並行制御）を超える。(iii) 「4種」は displayOrder を書く第5の経路 `update()`（`PUT /api/quantity-groups/:id`）を数えていなかった
- **採らなかった側（設計の主張を逐次の競合だけへ狭める）を採らなかった理由**: 画面から到達する唯一の経路 `saveDraft` で、上の重なりが実測で起きていた。主張を狭めて記録だけを揃えると、同じ数量表を二つの画面から同時に保存したときの重なりが残る
- **Task 59.4 の問い（`saveDraft` に行ロックが要るか）への答え**: 要る。上の決着 (1) で入れた。59.4 の注は、真の同時並行では両者が読み取り段階を通過しうることを記録したうえで、統合検証を逐次の競合に限っていた
- **変異で確かめたこと**: 次の変異を当て、控えから書き戻して `git hash-object` の一致で復元を確かめた（2026-09-12、コミット `36c816dd` の作業ツリーに本項の変更を載せた状態で実測）
  - M1: `saveDraft` から数量表の行の `SELECT ... FOR UPDATE` を取り除く。`npm --prefix backend run test:integration -- quantity-table-save.api` は 31 件中 2 件落ちる（統合検証「同時並行保存の直列化（Task 88.1）」の2件）
  - M2: 同じロックを、差分元の読み取りと存在確認の後ろへ移す。同じコマンドで同じ 2 件が落ちる
  - M1 の下で `npm --prefix backend run test`（単体）は 5688 件すべて緑のままである。**単体検証はこのロックを固定していない**。固定しているのは上の統合検証だけである
- **残るリスク**: (a) 上の逐次の3件は画面からは到達しないが、認証済みの HTTP クライアントからは今も displayOrder を重ねうる。是正は本項の境界の外である。**【現況】Task 92.1 が塞いだのは、この3経路の逐次の呼び出しの側だけである**（省略時はサーバーが最大値 + 1 で採番し、重なる指定は 400 で拒む）。**【Task 92.1 の時点】並行の窓は残っており、本項の (a) は閉じていなかった**——検査は数えてから書く形であり、`create()`・`update()`・`updateDisplayOrder()` は数量表の行ロックを取らないままであった（ロックを取るのは `saveDraft`・`copy()`・`createGroupsFromSurvey()` の3つで、この3経路は含まれなかった）。Read Committed の下では2本の要求が同じ検査を通過して同じ値を書きうる。**これはコードを読んだ判断であって実測ではなかった**（並行プローブは走らせていなかった）。**【現況】Task 92.4 が実測のうえ塞ぎ、本項の (a) は閉じた。** 是正前の状態で並行プローブを走らせると、関門つきでは数量グループ・数量項目とも2本が同じ displayOrder を書き、**関門を使わない同時送信でも 10 回中 10 回重なった**（コミット `82a87a56` を起点に 2026-09-12 に実測）。是正では対象の全10経路（数量グループの3経路と数量項目の7経路）がトランザクションの最初に数量表の行を `SELECT ... FOR UPDATE` で取る。ロックの対象は本項が `saveDraft` で取るのと**同一の行**であり、各経路がこの1行だけを最初に取るためロック順序の循環は生じない。決着・採らなかった案・変異の実測は `#### QuantityGroupService` の「並行する要求に対する窓を塞いだ形（Task 92.4 の決着）」に置いた。決着・採らなかった案・変異の実測、および残る窓の詳細は `#### QuantityGroupService` の「並び順の個別 API が displayOrder を重ねない形（Task 92.1 の決着）」に置いた。**(b) `saveDraft` の後発はロックを待つ時間も Prisma の対話トランザクションの時間切れに算入される。先行が長引いたときの後発の応答は測っていない**。**【現況】Task 92.2 が実測した**——先行が既定の 5 秒を超えて数量表の行を保持すると、後発は 409 ではなく 500（`QUANTITY_TABLE_SAVE_ERROR`）を返す。待機は 5 秒で打ち切られず先行が終わるまで続くため、所要時間の上限は先行の長さで決まる。決着と根拠は下の「ロック待ちの時間切れの応答（Task 92.2 の決着）」に置いた。**【現況】Task 92.5 が待機そのものに上限（2 秒）を入れ、上限超過を 503（`QUANTITY_TABLE_SAVE_BUSY`）で返す形にしたため、本項の (b) は閉じた**（決着は下の「ロック待ちの上限と上限超過の応答（Task 92.5 の決着）」）

**ロック待ちの時間切れの応答（Task 92.2 の決着）**

`##### Concurrency Control`（REQ-38）の「失敗ハンドリング」が述べる「ロック取得タイムアウトは `OptimisticLockError` を投げて API 層で 409 にマップする」は、copy 向けの記述として書いた時点のまま残す。`saveDraft` については当てはまらないことを Task 92.2 が実測で確かめた。実測はいずれも HEAD `06feaf7b` の作業ツリーで、2026-09-12 にリポジトリルートから行った。取り方は Task 88.1 の統合検証と同じで、先行のトランザクションを保留したまま後発が数量表の行のロック待ちに入ったことを `pg_stat_activity` で見届け、そこから先行の保持時間を変えて後発の応答を読む。プローブは統合検証ファイルへ一時的に足して走らせ、提出物には残していない（復元は控えからの書き戻しで行い `git hash-object` の一致で確認した）。

- **測った三条件と後発の応答**（後発はいずれも先行と同じ版から出た保存で、先行は数量表の行を握ったまま保持する）

  | 先行の保持 | 先行の結末 | 後発の応答 | 後発の所要 |
  |---|---|---|---|
  | 9 秒（既定の 5 秒超） | コミット | 500 / `QUANTITY_TABLE_SAVE_ERROR` | 9082 ms |
  | 9 秒（既定の 5 秒超） | ロールバック | 500 / `QUANTITY_TABLE_SAVE_ERROR` | 9052 ms |
  | 2 秒（既定の 5 秒未満） | コミット | 409 / `QUANTITY_TABLE_CONFLICT` | 2055 ms |

- 三条件目は対照である。**5 秒を挟んで応答が 409 と 500 に分かれる**ことを示し、観測が生きていること（恒真でないこと）の非空証明にもなっている
- **500 の本文は起票の見込みと違った。** Task 88.1 の申し送りは「P2028 は 500『Transaction Timeout』へ写される」と述べていたが、その写しへは到達しない。保存経路のルートが自前の catch を持ち、見知らぬ例外をすべて `QUANTITY_TABLE_SAVE_ERROR` の 500 へ畳むためである（`grep -c QUANTITY_TABLE_SAVE_ERROR backend/src/routes/quantity-tables.routes.ts` の出力は 1）。汎用ハンドラ `backend/src/middleware/errorHandler.middleware.ts` の P2028 の枝は本経路の応答には効かない。実測した本文は `{"type":"https://architrack.example.com/problems/internal-server-error","title":"Internal Server Error","status":500,"detail":"保存処理中にエラーが発生しました","code":"QUANTITY_TABLE_SAVE_ERROR"}` である
- **後発の待機は 5 秒で打ち切られない。** Prisma の対話トランザクションの時間切れは実行中の問い合わせを中断せず、`SELECT ... FOR UPDATE` は先行が終わるまでブロックし続ける。時間切れが表面化するのはロックが解けた後の次の問い合わせで、そこで初めて P2028 が投げられる。先行を 120 秒保持した条件では後発の所要も 120013 ms であった（この 1 条件だけは、先行を自らのトランザクション上限まで握らせたままにして測っている。上の表の三条件は保持時間を明示して解放している）。**この 120 秒のデータ点の出所は、意図して選んだ第4の条件ではない**（Task 92.5 が併記）——初回のプローブが先行の解放を `finally` に置いたため、後発の待機と先行の解放が相互に待ち合って先行自身のトランザクション上限（120 秒）まで膠着し、そこから得られた値である。上の表の三条件は順序を正したプローブで測り直したもので、保持時間を明示して解放している。**値そのものは欠陥の産物ではなく、「待機は先行が終わるまで続く」という同じ性質を先行が 120 秒生き続けた極端な条件で示している**が、後任が「120 秒という保持時間を選んで測った」と読むと再現の手順を誤る。**したがって所要時間の上限を決めるのは先行の長さであり、5 秒ではない**
- **後発は何も書かない。** 三条件とも後発の作成・改名は永続化されず、`displayOrder` の重なりも生じなかった。先行を巻き戻させた条件では数量表は元の状態のままであった

**決着: 現況（500 / `QUANTITY_TABLE_SAVE_ERROR`）を保つ。** 画面は 409 以外を `describeSurveyImageLinkSaveFailure` に掛け、現調画像の紐付けに起因しない失敗では `null` が返るので「保存に失敗しました。再度お試しください。」を表示する（`frontend/src/pages/QuantityTableEditPage.tsx` の `handleSave`）。ロック待ちの時間切れは時間をおけば解消する種類の失敗であり、**再試行を促す案内は利用者にとって正しい**。ドラフトは保持されるため入力も失われない。

- **採らなかった案①（時間切れを 409 へ寄せる）**: 上の表の 2 行目が退ける。先行が巻き戻った条件でも後発は同じ 500 になり、そのとき**誰も何も確定していない**。ここで 409 の「数量表は他のユーザーによって更新されました。最新データを確認してください。」を返すと、起きていない更新を告げ、再読み込みという無意味な行動へ誘導する。しかも後発の側にこの二つを見分ける術が無い——自分のトランザクションが期限切れになった後は `updatedAt` を読み直せないため、先行が確定したかを知れない
- **採らなかった案②（「混雑。時間をおいて再試行」を意味する専用の応答を起こす）**: 同じリポジトリに先例がある（`backend/src/errors/estimateError.ts` の `EstimateSaveTimeoutError`。500 / `ESTIMATE_SAVE_TIMEOUT`）。採らなかったのは、**利用者へ届く文言が現況と変わらない**ためである。画面は一般の文言で既に再試行を促しており、専用の応答が増やすのは運用側の識別だけである。一方で本節が測った本当の穴は応答の見え方ではなく**待機の長さに上限が無いこと**であり、応答を付け替えてもそれは動かない。上限を入れる（`SET LOCAL lock_timeout` などで待機を切る）判断は応答の設計と不可分なので、専用の応答は待機の上限と同じ回で決めるのが筋である。本節の境界（時間切れの応答）を超えるため申し送る
- **残る限界（本節では閉じない）**: 待機の上限は今も無い。先行が長引けば後発の利用者はその間ずっと待たされ、最後に 500 を受け取る。上の 120 秒の実測がその形である。**【現況】Task 92.5 が上限（2 秒）を入れ、上限超過を 503（`QUANTITY_TABLE_SAVE_BUSY`）で返す形にしたので、この限界は閉じた**（下の「ロック待ちの上限と上限超過の応答（Task 92.5 の決着）」）

**ロック待ちの上限と上限超過の応答（Task 92.5 の決着）**

Task 92.2 は、本当の欠陥は応答のコードではなく**待機の長さに上限が無いこと**だと申し送った。Task 92.5 がその上限を入れる。実測はいずれも 2026-09-12、コミット `21d95ac1` の作業ツリー（本タスクの変更を入れる前の状態）で、リポジトリルートから `npm --prefix backend run test:integration` の一時プローブとして行った（プローブは提出物に残していない）。

**決着**: `saveDraft` のトランザクションの冒頭で `SET LOCAL lock_timeout = '2000ms'` を掛けてから数量表の行を `SELECT ... FOR UPDATE` で取る。上限を超えた待機は PostgreSQL が SQLSTATE `55P03` で打ち切り、サービスが `QuantityTableSaveBusyError` へ写し、ルートが **503 / `QUANTITY_TABLE_SAVE_BUSY`** で返す。ルートは同時に `logger.warn` で上限値つきの記録を残す。

- **待機を切る手段は二つ挙がり、切れるのは片方だけだった**（どちらも実測した）

  | 手段 | 実測 | 判定 |
  |---|---|---|
  | `$transaction` の `timeout` / `maxWait` を明示（いずれも 2000 ms） | 先行が 6 秒握る条件で、後発の所要は 6014 ms。例外は P2028（`operation: commit` / `timeout: 2000` / `timeTaken: 6012`） | **待機は切れない。** 時間切れはロックが解けた後の commit で初めて表面化する |
  | `SET LOCAL lock_timeout` | 先行が握り続ける条件で、設定 1000 ms → 待ち 1021 ms、2000 ms → 3125 ms、3000 ms → 3009 ms で打ち切られ、P2010（SQLSTATE `55P03`、`canceling statement due to lock timeout`）が投げられる | **待機を切れる。本項はこちらを採る** |

  対照として競合が無い条件では、同じ `lock_timeout` 付きの取得が 13 ms で成功する（上限は競合が無ければ何も起こさない）。Task 92.2 が「トランザクションの時間切れは実行中の問い合わせを中断しない」と述べたことを、本項は手段の比較として測り直している。

- **上限を 2000 ms にした根拠**
  - 保存そのものの所要は、2グループ×3項目で中央 18 ms（10 回。最小 13 / 最大 73 ms）、10グループ×200項目で中央 237 ms（5 回。最小 196 / 最大 291 ms）である。上限は、実際に競合している先行の保存が終わるのを待つに十分な長さ（大きい保存の 8 倍超）でなければならない
  - 上限はトランザクションの制限時間（Prisma 既定 5 秒）より確実に手前で効かなければならない。効かなければ待機が制限時間を食い潰し、応答は P2028 由来の 500 へ戻って上限超過の識別が失われる。設定値に対する待機の実測は環境の揺らぎで最大 1.56 倍（設定 2000 ms に対し 3125 ms）まで伸びたので、2000 ms なら最悪でも約 3.1 秒で、大きな保存の所要（約 0.3 秒）を足しても 5 秒に届かない。3000 ms では同じ揺らぎで約 4.5 秒となり余裕が無い

- **専用の応答の再審（Task 92.2 の「採らなかった案②」）**: 92.2 は「利用者へ届く文言が現況と変わらない」ことを理由に専用の応答を採らなかった。**その理由は上限が無いことに依っていた**——上限が無ければ「混雑。時間をおいて再試行」は真とは限らず、待たせた末に失敗を告げるだけだった。上限を入れた本項では「混雑しており、時間をおけば解消する」が真になり、かつ**恒久的な失敗（500）と一時的な失敗を運用側が見分けられる**。よって専用の応答を起こす側へ裁定を改めた。状態コードを 503 としたのは、先例 `EstimateSaveTimeoutError`（500 / `ESTIMATE_SAVE_TIMEOUT`）が「件数を減らさない限り再送しても成功しない」終局的な失敗であるのに対し、本エラーは時間をおけば解消する一時的な失敗だからである
- **利用者に届く文言は変えない**: 画面は 409 以外を `describeSurveyImageLinkSaveFailure` に掛け、現調画像の紐付けに起因しない失敗では `null` が返るので「保存に失敗しました。再度お試しください。」を表示する（`frontend/src/pages/QuantityTableEditPage.tsx` の `handleSave`）。上限超過に対して利用者が取るべき行動は「時間をおいて再試行」であり、この文言と一致する。**増やしたのは運用側の識別（応答のコードと `logger.warn` の記録）だけである。** フロントエンドは一行も変更していない
- **開示（画面の自動再試行で体感は伸びる）**: `frontend/src/api/client.ts` は 5xx を最大3回・1/2/4 秒の待ちで自動再試行し、抑止できるのは `NON_RETRYABLE_ERROR_CODES` に載せたコードだけである。`QUANTITY_TABLE_SAVE_BUSY` は載せていない——上限超過は**時間をおけば解消する**種類の失敗であり、再試行こそ正しい行動だからである。その代わり、**サーバー側の待機は 1 回あたり 2 秒で切れるが、画面が諦めるまでの体感は最悪でおよそ 19 秒になりうる**（4 回の試行 × 約 3 秒 ＋ 待ち 7 秒）。**この 19 秒は実測ではなく、上の待ちの実測と再試行設定からの算術である。** 再試行の挙動自体は `frontend/src/__tests__/api/client.test.ts` の `別のコードの 500 は再試行されること（抑止対象を限定している）` と `ESTIMATE_SAVE_TIMEOUT の 500 は再試行せず1回で失敗すること` が固定している
- **採らなかった案①（上限超過を 409 へ寄せる）**: Task 92.2 の裁定を維持する。上限超過の時点では**誰も何も確定していない**ため、「他のユーザーによって更新されました」は起きていない更新を告げる偽の案内になる
- **採らなかった案②（`$transaction` の `timeout` / `maxWait` を明示する）**: 上の表のとおり待機を切れない。既定（5 秒）より長い値を明示しても、上限超過の識別が保たれるだけで待機そのものは動かない。**本項は明示していない**——既定 5 秒は上限 2 秒に対して十分な余裕があり、明示すると「効かない手段を効くように見せる」記述が増える
- **採らなかった案③（上限だけ入れて応答は 500 のままにする）**: 運用側が「混雑」と「故障」を見分けられない。保存経路のルートは見知らぬ例外をすべて `QUANTITY_TABLE_SAVE_ERROR` の 500 へ畳む（Task 92.2 の実測）ため、ログにも区別が残らない
- **本項が上限を掛けたのは `saveDraft` だけである**: `SET LOCAL` は当該トランザクションの内側にしか効かない。`copy()` / `createGroupsFromSurvey()` の行ロックと、Task 92.4 が数量グループ・数量項目の並び順の個別 API（全10経路）へ入れた行ロックには上限が掛からない。いずれも画面から到達しない経路であり（Task 92.1 / 92.3 が本番の呼び出し元 0 ファイルを実測）、利用者が待たされる形にならないため対象外とした

- **変異の実測**（いずれも 2026-09-12、リポジトリルートで実行。復元は控えからの書き戻しで行い `git hash-object` の一致で確認した）
  - M1（`SET LOCAL lock_timeout` の1行を外す）: 単体 `npm --prefix backend run test -- quantity-table.service.test` が 92 件中 1 件落ち、統合 `npm --prefix backend run test:integration -- quantity-table-save.api -t 'ロック待ちの上限'` は 20049 ms 待った末に 1 件落ちる（`ロック待ちの上限が効いていない: 関門を保持したまま 20 秒以内に応答が返らなかった`）
  - M2（`isLockWaitTimeoutError` の先頭へ `return false;` を入れ、判定を常に偽にする）: 単体 92 件中 1 件・統合 1 件が落ちる（統合は `expected 500 to be 503`）
  - M3（ルートの 503 の分岐を `if (false && ...)` で無効化する）: 単体 `quantity-tables.routes` が 48 件中 1 件（`expected 503 "Service Unavailable", got 500 "Internal Server Error"`）、統合が 1 件落ちる
  - M4（一般の 500 の `code` を別名へ変える）: Task 92.2 の決着を固定する単体 1 件が落ちる。92.2 は「新しい検証を一つも足していない」と開示していたが、本項でその一点が機械の側に載った

- **限界（開示）**
  - **上限が実際に待機を切ることを固定できるのは実データベースへ接続する統合検証だけである**（Task 88.1 / 92.4 と同じ）。単体が固定するのは「上限を掛ける文が行ロックより前に在ること」と「`55P03` を専用のエラーへ写すこと」までである
  - **上限の値が適切であることは、どの検証も固定していない。** 値 `2000` を `3000` へ変える変異では単体 1 件（文面に `2000ms` を求める主張）が落ちるが、**統合検証は 1 件とも緑のまま**である（2026-09-12 に実測）。統合が主張するのは「関門を保持したまま 20 秒以内に 503 が返る」ことだけで、2 秒と 3 秒を区別しない。値の妥当性を支えるのは本節の実測だけである
  - 画面の体感（最悪およそ 19 秒）は実測ではなく算術である（上の開示）
  - 上限超過が `logger.warn` に残ることは、どの検証も固定していない

**Dependencies**: Inbound: QuantityTableRoutes (P0) / Outbound: QuantityGroupService, QuantityItemService, QuantityValidationService (P1) / External: PrismaClient (P0), AuditLogService (P1)

**Contracts**: Service [x] / API [x]

##### Service Interface

```typescript
interface QuantityTableService {
  // ... 既存メソッド（create/findById/update/delete/copy 等）に追加 ...
  saveDraft(
    id: string,
    input: SaveQuantityTableDraftInput,
    actorId: string
  ): Promise<QuantityTableDetail>;
}

interface SaveQuantityTableDraftInput {
  expectedUpdatedAt: string;          // ISO8601。楽観ロック
  name: string;                       // 数量表名（編集画面での変更を含む）
  groups: SaveDraftGroupInput[];      // 数量表の全グループ最終状態（表示順）
}

interface SaveDraftGroupInput {
  id: string | null;                  // 既存=UUID / 新規=null
  tempId?: string;                    // 新規グループのクライアント仮ID（任意・トレース用）
  name: string;
  surveyImageId: string | null;       // 写真紐づけ（参照のみ）
  displayOrder: number;
  items: SaveDraftItemInput[];        // 当該グループの全項目最終状態（表示順）
}

interface SaveDraftItemInput {
  id: string | null;                  // 既存=UUID / 新規=null
  tempId?: string;
  // Field Specifications 準拠の全フィールド（大項目〜備考、計算用フィールド、調整係数、丸め設定）
  displayOrder: number;
}
```

##### API Contract

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| PUT | /api/quantity-tables/:id/save | SaveQuantityTableDraftInput | QuantityTableDetail | 400, 403, 404, 409 |

**Implementation Notes**

- 差分アルゴリズム: グループ→DB id 集合と payload id 集合の差分で delete/create/update を決定。項目も各グループ内で同様に処理。`displayOrder` は payload の配列順を正とする
- 既存 `bulk-save`（項目更新のみ）は本エンドポイントへ統合・置換。編集画面はこのエンドポイントのみを書き込みに使用
- グループコピー（REQ-38）・現場調査一括生成（REQ-40）のサーバー側ロジックは編集フローからは不要化（クライアントがドラフトで複製/生成し、`saveDraft` で確定）。既存の `POST .../copy`・`POST .../from-survey` は編集フロー未使用となるが、本spec では削除を必須とせず、二重書き込みパス回避のため編集画面からの呼び出しを停止する（クリーンアップはタスクで扱う）
- 権限: 既存の書き込み系ルートと同一の `requirePermission('quantity_table:update')` を要求（既存RBAC。`bulk-save` ルートと同一）

#### UnsavedChangesBadge / 離脱ガード / 固定ヘッダー（REQ-43, 44, 45）

| Field | Detail |
|-------|--------|
| Intent | 未保存状態の可視化（REQ-44）・離脱ガード（REQ-43）・ヘッダー固定表示（REQ-45）を提供 |
| Requirements | 43.1-43.6, 44.1-44.4, 45.1-45.4 |

**Implementation Notes**

- 離脱ガード: `const blocker = useBlocker(isDirty)`。`blocker.state==='blocked'` で確認UIを表示し、`blocker.proceed()`/`blocker.reset()` で遷移/取消（REQ-43 AC1,3,4）。タブクローズ/リロードは `useUnsavedChanges` の beforeunload ハンドラ（`enabled: isDirty`）で標準確認（REQ-43 AC2）。`isDirty=false` 時はガードしない（AC5,6）
- インジケーター: `isDirty` true の間、保存ボタン付近に `UnsavedChangesBadge`（「未保存の変更があります」/ボタン強調）を表示。編集で表示、保存成功で非表示（REQ-44 AC1-4）
- 固定ヘッダー: `styles.header` に `position: 'sticky' as const, top: 0, zIndex: 50, background` を付与。`UnsavedChangesBadge` を `headerActions` 内に配置（REQ-45 AC4）。既存 `EstimateDetailPage`/`SiteSurveyDetailPage` の固定ヘッダーに準拠

#### File Structure Plan（REQ-42〜45）

| ファイル | 区分 | 責務 |
|---------|------|------|
| `backend/src/services/quantity-table.service.ts` | 変更 | `saveDraft` 追加（フル状態差分同期、FOR UPDATE 直列化、楽観ロック、検証、監査ログ）。既存 `bulkSave` を統合・置換。FOR UPDATE は Task 88.1 の着手時点では実装に無く、88.1 が入れた |
| `backend/src/routes/quantity-tables.routes.ts` | 変更 | `PUT /:id/save` ルート追加＋Zodスキーマ（`saveQuantityTableDraftSchema`）。既存 `/bulk-save` を置換 |
| `frontend/src/api/quantity-tables.ts` | 変更 | `saveQuantityTableDraft(id, input)` 追加（PUT /:id/save）。`bulkSaveQuantityTable` を置換 |
| `frontend/src/pages/QuantityTableEditPage.tsx` | 変更 | state を `useReducer` ドラフトモデルへ再設計。全編集ハンドラをドラフト更新に変更（即時API呼び出し除去）。`useUnsavedChanges`+`useBlocker` 結線、保存ハンドラを `saveDraft` 化。`styles.header` を sticky 化 |
| `frontend/src/pages/quantityTableEditReducer.ts` | 新規 | ドラフト reducer（add/delete/copy/reorder group・item、rename、photo link、from-survey 生成、import 取り込み、save 同期、仮ID採番）と型定義 |
| `frontend/src/components/quantity-table/UnsavedChangesBadge.tsx` | 新規 | 未保存インジケーター（REQ-44） |
| `frontend/src/hooks/useUnsavedChanges.ts` | 流用 | 既存フックを変更なしで利用（isDirty/markAsChanged/markAsSaved/beforeunload） |
| `frontend/src/components/quantity-table/QuantityGroupCard.tsx` | 変更 | グループ操作コールバックをドラフト dispatch 経由へ（即時API呼び出し撤去）。コピー（REQ-38）をクライアント複製に変更 |
| `frontend/src/components/quantity-table/EditableQuantityItemRow.tsx` | 変更 | 項目操作（add/delete/copy/reorder/フィールド編集）をドラフト dispatch 経由へ |

#### 影響を受ける既存E2E（REQ-42 移行）

編集モデル変更により「操作即時反映」を前提とする既存 約25本のうち、CRUD/コピー/並び替え/名称変更/写真紐づけ/一括生成/インポートを検証する spec（`quantity-table-crud`/`quantity-group-copy`/`group-rename-e2e`/`group-sort-e2e`/`create-groups-from-survey-e2e`/`import-e2e` 等）を「編集→保存ボタン→保存後にサーバー反映を検証」へ更新する。前提による無効化（skip）は行わず、未更新で失敗する状態を許容して顕在化させる（第3原則）。

### Backend Extension（インポート機能用）

#### ClaudeVisionService拡張

| Field | Detail |
|-------|--------|
| Intent | Claude Vision APIによる数量表構造解析を追加 |
| Requirements | 30.1-30.7 |

**Responsibilities & Constraints**

- 既存の`ClaudeVisionService`に`extractQuantityTableData`メソッドを追加
- 数量表のフィールド構造に合わせたプロンプトを使用
- 既存の見積書抽出（`extractEstimateData`）との共存

**Dependencies**

- Inbound: ClaudeVisionRoutes (P0)
- External: @anthropic-ai/sdk (P0)

**Contracts**: Service [x] / API [x]

##### API Contract拡張

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| POST | /api/claude-vision/extract | ClaudeVisionQuantityExtractRequest | ClaudeVisionQuantityExtractResponse | 400, 503, 408, 500 |

**Implementation Notes**

- Integration: 既存の`POST /api/claude-vision/extract`エンドポイントに`mode`パラメータを追加。`mode: 'quantity-table'`の場合は数量表用プロンプトを使用
- Fallback: Claude Vision API利用不可時（ANTHROPIC_API_KEY未設定、HTTP 503等）はHTTP 503を返却し、フロントエンドがpdfjs-dist + Tesseract.jsにフォールバック
- Prompt: 数量表の列構成（大項目・中項目・小項目・任意分類・工種・名称・規格・数量・単位・備考）を解析するプロンプトを定義。JSON配列形式でレスポンスを要求

### アクションメニュー表示不具合修正（REQ-46）

#### QuantityItemActionMenu（Portal 描画）

| Field | Detail |
|-------|--------|
| Intent | 数量項目のアクションメニューを、祖先のスクロール領域にクリップされない位置へ描画し、スクロールに追従させる |
| Requirements | 46.1-46.11 |

**Responsibilities & Constraints**

- ドロップダウンの**描画先 DOM ツリーと座標系**を所有する。メニュー項目の構成・活性制御・各操作の動作は REQ-36 の既存実装をそのまま維持し、本コンポーネントの変更対象としない。
- 祖先の `QuantityGroupCard.itemTableWrapper`（`overflowX: auto` / `overflowY: hidden`、REQ-41）および `card`（`overflowY: hidden`）によるクリップを構造的に回避する。

**根本原因と対処方針**

現行の `styles.dropdown` は `position: absolute; top: 100%; zIndex: 10` で、包含ブロックは同コンポーネントの `wrapper { position: relative }` である。この wrapper は水平スクロール領域の内側にあるため、行の下へ開くドロップダウンは**スクロール領域のパディングボックスでクリップされる**。開閉 state は正しく `true` になっており、DOM も存在するが視覚的に切り取られている。したがって症状は「クリックしても表示されない」（メニューが領域外に開くケース＝最下行・項目1件のグループ）と「はみ出た部分が欠ける」（部分的に領域内に収まるケース）として観測される。

対処は CSS では成立しない。祖先に `overflow` が設定されている限り、子孫の `absolute` 要素は必ずクリップされるためである（`overflow: visible` へ戻すと REQ-41 の水平スクロールが壊れる）。**描画ツリーそのものをスクロール領域の外へ出す（Portal）以外に解はない。**

**採用パターン（Build vs. Adopt）**: 同一画面の `AutocompleteInput.tsx` が、**まったく同一の根本原因**（`itemTableWrapper` の overflow による候補リストのクリップ）を Portal 化で解決済みである（PR #647 / `e6d7edd`、実装コメントに「REQ-41 回帰」として経緯が記録されている）。本設計はこの検証済みパターンをそのまま踏襲し、新しい抽象は導入しない。

##### State Management

- State model: `isOpen`（呼び出し元 `EditableQuantityItemRow` が保持、既存のまま）＋ `dropdownRect: { top: number; left: number } | null`（本コンポーネントのローカル state）
- 座標算出: `buttonRef.current.getBoundingClientRect()` を `useLayoutEffect` で実行し、`{ top: rect.bottom + 2, left: rect.right - MENU_WIDTH }`（右揃えを維持）を保持
- 追従: `window.addEventListener('scroll', reposition, true)` — **capture: true が必須**。`itemTableWrapper` のスクロールイベントは `window` までバブルしないため、capture フェーズで購読しない限り水平スクロールに追従できない。あわせて `resize` も購読する
- Concurrency: 同時に開けるメニューは1つ（既存の `isOpen` 管理を維持）

**Implementation Notes**

- 描画: `createPortal(<div role="menu" style={{ ...styles.dropdown, top: dropdownRect.top, left: dropdownRect.left }} />, document.body)`。`styles.dropdown` は `position: 'fixed'`, `zIndex: 1000`（`QuantityTableEditPage.tsx` の sticky ヘッダーが `zIndex: 50` のため、これを上回る必要がある — REQ-46 AC7）
- **閉じ判定の方式変更（重要）**: 現行は `QuantityItemActionMenu.tsx` と `EditableQuantityItemRow.tsx` が**二重に `onBlur` → `onClose`** を張り、`relatedTarget` が自要素の内側かで判定している。Portal 化すると DOM ツリーが分離するため **`relatedTarget` の内外判定が成立しなくなり、この方式は必ず壊れる**。`document.addEventListener('mousedown', ...)` + `containerRef.contains(target)` によるアウトサイドクリック判定＋Escape キーへ移行し、`EditableQuantityItemRow` 側の二重 `onBlur` は撤去する。参照実装は `estimate-requests/LineItemEditor.tsx`
- Portal 先のメニュー項目クリックでボタンの blur が先行しないよう、項目には `onMouseDown={(e) => e.preventDefault()}` を付与する（`AutocompleteInput.tsx` と同じ理由）
- Risks: 閉じ挙動（REQ-36 AC9 / REQ-46 AC8）のデグレが最大のリスク。単体テストで outside-click / Escape / 項目選択後クローズの3経路を固定する

### 計算方法「箇所数」（REQ-47）

#### CalculationMethodRegistry（`frontend/src/utils/calculation-method.ts`）

| Field | Detail |
|-------|--------|
| Intent | 計算方法の表示順・表示ラベル・選択肢を単一情報源として提供し、値の追加漏れを型エラーとして検出させる |
| Requirements | 47.1, 47.17 |

**新設の根拠（Generalization）**: 計算方法のラベルは現在2箇所に独立して存在し、いずれも**型エラーを出さずに壊れる**。`CalculationMethodSelect.tsx` の `CALCULATION_METHOD_OPTIONS` は配列のため値の追加を型的に強制されず、`QuantityTableEditPage.tsx` のネスト三項は最終 else が `'ピッチ'` 固定のため、**新方式が PDF 上で「ピッチ」と誤表示される**（`QuantityTablePdfExportService.ts` は `calculationMethod: string` を受けるだけなので型でも検出されない）。`Record<CalculationMethod, string>` へ集約すれば、ユニオン型に値を足した時点で両方がコンパイルエラーになる。

**上の「現在2箇所」は本節を書いた時点（新設前）の記録であり書き換えない（タスク 115.234。`site-survey` の design.md「実測値の書き方（タスク 115.212）」の (a) に従う）。新設は実施済みで、再実測では独立した2箇所は残っていない**——ラベルの定義は `frontend/src/utils/calculation-method.ts` の `CALCULATION_METHOD_LABELS` の一箇所であり、`grep -rlE 'CALCULATION_METHOD_LABELS' frontend/src --include=*.ts --include=*.tsx | grep -vE '\.test\.|\.stories\.|__tests__'` が挙げる非テストのファイルは 3 件（定義 1・消費 2＝`frontend/src/utils/calculation-params-validation.ts` と `frontend/src/pages/QuantityTableEditPage.tsx`）である。`frontend/src/components/quantity-table/CalculationMethodSelect.tsx` は `CALCULATION_METHOD_OPTIONS` を import して消費する（コミット `6b84be3`。2026-09-02 にリポジトリルートで実測）。**この 3 件はテストとストーリーを除いた数であり、除いていない全件は別の値になる。**

##### Service Interface

```typescript
import type { CalculationMethod } from '../types/quantity-edit.types';

/** セレクトボックスの表示順（標準 → 面積・体積 → ピッチ → 箇所数） */
export const CALCULATION_METHOD_ORDER: readonly CalculationMethod[] = [
  'STANDARD',
  'AREA_VOLUME',
  'PITCH',
  'COUNT',
] as const;

/** 計算方法の表示ラベル（セレクトボックスとPDF出力の共通情報源） */
export const CALCULATION_METHOD_LABELS: Record<CalculationMethod, string> = {
  STANDARD: '標準',
  AREA_VOLUME: '面積・体積',
  PITCH: 'ピッチ',
  COUNT: '箇所数',
};

export interface CalculationMethodOption {
  readonly value: CalculationMethod;
  readonly label: string;
}

export const CALCULATION_METHOD_OPTIONS: readonly CalculationMethodOption[] =
  CALCULATION_METHOD_ORDER.map((value) => ({
    value,
    label: CALCULATION_METHOD_LABELS[value],
  }));
```

- Invariants: `CALCULATION_METHOD_LABELS` は `Record<CalculationMethod, string>` であるため、`CalculationMethod` に値を追加するとラベル未定義がコンパイルエラーになる。

#### CalculationEngine（`calculateCount` の追加）

| Field | Detail |
|-------|--------|
| Intent | 手入力された箇所数から、ピッチと同一の後段処理で最終数量を算出する |
| Requirements | 47.3-47.7, 47.12 |

**Responsibilities & Constraints**

- 「箇所数」はピッチの**箇所数算出部分のみ**を手入力に置き換えたものである。調整係数の適用と丸め処理は `calculate()` の共通経路（`frontend/src/utils/calculation-engine.ts`）を通るため、REQ-47 AC7（ピッチと同一の挙動）は**構造的に保証される**（分岐は `rawValue` の算出方法のみ）。
- 数量を確定するのはフロントエンドのみである（backend の `CalculationEngine` はプロダクションコードから未 import）。ただし既存のユニットテスト資産と実装の対称性を維持するため、backend 側にも同一ロジックを追加する。

##### Service Interface

```typescript
export interface CountParams {
  /** 箇所数（必須・1〜9999999の整数） */
  count: number;
  /** 長さ（任意） */
  length?: number;
  /** 重量（任意） */
  weight?: number;
}

/**
 * 箇所数計算。ピッチ計算（calculatePitch）との差分は rawValue の初期値のみ。
 * ピッチ: count = floor((rangeLength - endLength1 - endLength2) / pitchLength) + 1
 * 箇所数: count = params.count（手入力値）
 */
export function calculateCount(params: CountParams): {
  rawValue: number;
  formula: string;
};
```

- Preconditions: `Number.isInteger(params.count) && params.count >= 1 && params.count <= 9999999`
- Postconditions: `rawValue = count × (length ?? 1) × (weight ?? 1)`。長さ・重量がいずれも未入力なら `rawValue = count`（REQ-47 AC5）
- Invariants: `calculate()` は `finalValue = applyRounding(rawValue × adjustmentFactor, roundingUnit)` を計算方法によらず適用する

**Implementation Notes**

- 計算式文字列: `generateCountFormula()` は `5 x 2.5 x 1.5 = 18.75` の形式で生成する（既存 `generatePitchFormula()` の書式に揃える。同関数は `toFixed` を使わず素の値を埋め込むため、小数2桁で揃えない。小数2桁は入力フィールドの**表示整形**の話であり、計算式文字列とは別物）
- switch 分岐: `frontend/src/utils/calculation-engine.ts` と `backend/src/services/calculation-engine.ts` の双方に `case COUNT` を追加する

#### CalculationFields（フィールド定義の Record 化と整数入力）

| Field | Detail |
|-------|--------|
| Intent | 計算方法ごとの計算用フィールド群を、フォールバックなく正しく描画する |
| Requirements | 47.2, 47.12-47.14, 37.13 |

**Responsibilities & Constraints**

- 現行の `CalculationFields.tsx` は `method === 'AREA_VOLUME' ? AREA_VOLUME_FIELDS : PITCH_FIELDS` という**二値の三項演算子**であり、第4の計算方法を追加すると **`STANDARD` 以外はすべて `PITCH_FIELDS` に無言でフォールバックする**。`Record` 化は「足すだけでは直らない」ため必須の変更である。

##### Service Interface

```typescript
interface FieldDefinition {
  key: string;
  label: string;
  required?: boolean;
  step?: number;
  /** 真の場合、整数のみを受け付け、小数桁を付与せずに表示する（REQ-47 AC8, REQ-14 AC6） */
  integer?: boolean;
}

const COUNT_FIELDS: FieldDefinition[] = [
  { key: 'count', label: '箇所数', required: true, integer: true },
  { key: 'length', label: '長さ', step: 0.01 },
  { key: 'weight', label: '重量', step: 0.01 },
];

/** STANDARD 以外の計算方法に対するフィールド定義。値の追加漏れは型エラーになる */
const FIELDS_BY_METHOD: Record<Exclude<CalculationMethod, 'STANDARD'>, FieldDefinition[]> = {
  AREA_VOLUME: AREA_VOLUME_FIELDS,
  PITCH: PITCH_FIELDS,
  COUNT: COUNT_FIELDS,
};
```

**Implementation Notes**

- `NumberInputField`（`frontend/src/components/quantity-table/CalculationFields.tsx` 内のローカルサブコンポーネント）に `integer?: boolean` を追加する。**`toFixed(2)` は blur 時だけでなく、`useState` の初期値と props 同期時の計3箇所で無条件に適用されている**。3箇所すべてを整数分岐にしないと、保存・再読み込み後に箇所数が「5.00」と表示され REQ-47 AC15 / REQ-14 AC6 を満たさない。`integer` が真のときのみ `String(parseInt(raw, 10))` で整形し、`inputMode` を `"numeric"` にする。既存の小数フィールドの挙動は変更しない

**この「計3箇所で無条件」は本項を書いた時点の記録であり書き換えない（タスク 115.234。`site-survey` の design.md「実測値の書き方（タスク 115.212）」の (a) に従う）。再実測では「無条件」が偽である**——3 経路（`useState` の初期値・props 同期・blur 整形）はいずれも `formatFieldValue` を経由し、`integer` が真のときは `toFixed(2)` を通らない。経路が 3 本であること自体は変わっていない。本項が述べる変更がコミット `01b46ca`（2026-07-17）で実装され、同じコミットに本項の記述も入っているため、記述はそのコミットの時点で既に偽であった（`git log -S` と `git show 01b46ca^` で一件ずつ確かめた）。コミット `6b84be3`。2026-09-02 にリポジトリルートで実測。
- `resetParamsForMethod()` と `PARAM_KEYS_BY_METHOD` はいずれも `utils/calculation-method.ts`（CalculationMethodRegistry）に置き、`EditableQuantityItemRow` は消費するのみとする（単体テストの対象を1箇所に定める）
- Validation: 整数以外・範囲外は入力を拒否しエラー表示（REQ-47 AC10, AC11）
- Risks: `toFixed(2)` の分岐を誤ると既存の面積・体積／ピッチの表示書式が壊れる。`CalculationFields.test.tsx` で既存2方式の書式を回帰テストとして固定する

### 計算方法切替時のパラメータ整合（REQ-48）

#### 根本原因: 「形状推測」による計算パラメータの silent strip

本節は REQ-47 の**前提条件**である。設計レビューで発見し、実測で確認した欠陥を扱う。

**問題の連鎖**:

1. `EditableQuantityItemRow.tsx` の `handleCalculationMethodChange` は `calculationMethod` を差し替えるだけで、**`calculationParams` をクリアしない**
2. `CalculationFields.tsx` の `handleFieldChange` は `{ ...params, [fieldKey]: value }` と**既存キーを spread する**
3. 結果、「ピッチ」→「箇所数」へ切り替えて箇所数を入力すると、`calculationParams` は `{rangeLength, endLength1, endLength2, pitchLength, count}` という**混合状態**になる
4. `quantity-table.schema.ts` の `calculationParamsSchema` は素の `z.union` であり、**パラメータの形状から計算方法を推測する**。`pitchParamsSchema` は必須4キーが揃っているため**正当にマッチし、`count` を strip する**

**実測結果**（プロジェクトの zod で再現）:

| 保存時に送られる `calculationParams` | 永続化される値 |
|---|---|
| `{rangeLength:100, endLength1:10, endLength2:10, pitchLength:5, count:5}` | `{rangeLength:100, endLength1:10, endLength2:10, pitchLength:5}` — **`count` が消失** |
| `{rangeLength:100, endLength1:10, endLength2:10, pitchLength:5, width:3}` | `{rangeLength:100, endLength1:10, endLength2:10, pitchLength:5}` — **`width` が消失（既存バグ）** |

**重要**: union への挿入位置を調整するだけでは解決しない。`pitchParamsSchema` は `countParamsSchema` より前で**正当にマッチする**ため、順序を入れ替えても混合状態では誤判定が残る。**形状推測そのものを廃止する必要がある。**

#### 対処: 判別子ベースの検証 ＋ 切替時のパラメータリセット

**(A) backend: `calculationMethod` を判別子としてスキーマを選ぶ**

`calculationParams` を単独で `union` に通すのをやめ、**数量項目単位で `calculationMethod` に対応するスキーマを適用する**。これにより形状推測が原理的に消え、既存バグ（REQ-48 AC4）も同時に解消する。

```typescript
/** 計算方法ごとのパラメータスキーマ。値の追加漏れは型エラーになる */
const PARAMS_SCHEMA_BY_METHOD: Record<CalculationMethod, z.ZodTypeAny> = {
  STANDARD: z.null(),
  AREA_VOLUME: areaVolumeParamsSchema,
  PITCH: pitchParamsSchema,
  COUNT: countParamsSchema,
};

export const countParamsSchema = z.object({
  count: z.number().int().min(1).max(9999999),
  length: z.number().positive().optional(),
  weight: z.number().positive().optional(),
});

/**
 * 数量項目の calculationParams を calculationMethod に基づいて検証・整形する。
 * 形状からの推測は行わない（REQ-48 AC5）。
 * 指定された計算方法で使用しないキーは zod の既定挙動により破棄される（REQ-48 AC6）。
 */
const withCalculationParams = <T extends z.ZodTypeAny>(itemSchema: T) =>
  itemSchema.superRefine((item, ctx) => {
    const schema = PARAMS_SCHEMA_BY_METHOD[item.calculationMethod];
    const result = schema.safeParse(item.calculationParams ?? null);
    if (!result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['calculationParams'],
        message: `計算方法「${item.calculationMethod}」の計算パラメータが不正です`,
      });
      return;
    }
    item.calculationParams = result.data; // 使用しないキーを除去した結果で置換
  });
```

- 適用先: `createQuantityItemSchema` / `updateQuantityItemSchema`（`quantity-items.routes.ts` が参照）および `saveDraftItemSchema`（`quantity-tables.routes.ts`）
- Invariants: 永続化される `calculationParams` は、必ずその行の `calculationMethod` に対応するキーのみを持つ

**(B) frontend: 計算方法切替時に有効キーのみを残す**

`handleCalculationMethodChange` で、切替後の計算方法で使用するキーのみを残した新しい `calculationParams` を構築する。共通フィールド（「長さ」「重量」）の入力値は引き継ぐ（REQ-48 AC2）。

```typescript
/** 計算方法ごとの有効なパラメータキー。CalculationFields の FIELDS_BY_METHOD から導出する */
const PARAM_KEYS_BY_METHOD: Record<CalculationMethod, readonly string[]> = {
  STANDARD: [],
  AREA_VOLUME: ['width', 'depth', 'height', 'weight'],
  PITCH: ['rangeLength', 'endLength1', 'endLength2', 'pitchLength', 'length', 'weight'],
  COUNT: ['count', 'length', 'weight'],
};

/** 切替後の計算方法で使用するキーのみを残す（共通キーの値は引き継ぐ） */
function resetParamsForMethod(
  params: CalculationParams | null,
  method: CalculationMethod
): CalculationParams | null {
  if (method === 'STANDARD' || !params) return null;
  const allowed = PARAM_KEYS_BY_METHOD[method];
  return Object.fromEntries(
    Object.entries(params).filter(([key]) => allowed.includes(key))
  ) as CalculationParams;
}
```

- 切替直後は新方式の必須パラメータが未入力になるため、`calculate()` は例外を投げ、既存の `catch` により数量は更新されない（REQ-48 AC7）。旧パラメータを流用した誤った数量が表示されることはない
- リセット処理の置き場: `handleCalculationMethodChange`（`EditableQuantityItemRow.tsx`）。ドラフト状態への反映は既存の `onUpdate` 経路（`quantityTableEditReducer.ts`）を通る

**Implementation Notes**

- **回帰テスト必須**: `quantity-table.schema.test.ts` に、混合状態のパラメータ（ピッチ4キー＋`count`）を `calculationMethod: 'COUNT'` で検証すると `count` が保持され、ピッチのキーが破棄されることを確認するテストを追加する。同様に `calculationMethod: 'AREA_VOLUME'` で `width` が保持されることも確認する（既存バグの回帰テスト）
- `quantity-tables.routes.ts` の一括保存スキーマは `CALCULATION_METHODS` を参照せず `z.enum(['STANDARD','AREA_VOLUME','PITCH'])` を**ハードコード**している。ここを更新しないと「箇所数」の保存が 400 で失敗する。再発防止のため `CALCULATION_METHODS` 参照へ置換する
- `quantity-validation.service.ts` の switch には **`default` 節が無く、未知モードが無検証で `isValid: true` を返す**。`case 'COUNT'` と `validateCountMode()` を追加すると同時に、`default` 節で明示的にバリデーションエラーを返すよう変更し、将来の追加漏れを fail-fast にする
- 既存の `calculationParamsSchema`（形状推測の union）は、(A) の導入後は**参照元が無くなる**。削除するか、後方互換のためにエクスポートを残す場合は「新規コードでは使用しない」旨をコメントで明記する

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
- 調整係数の範囲: -9.99〜9.99、デフォルト1.00
- 丸め設定の範囲: 0.01〜99.99、デフォルト0.01
- 数量の範囲: -999999.99〜9999999.99、デフォルト0
- 寸法・ピッチフィールドの範囲: 0.01〜9999999.99または空白
- 計算方法「面積・体積」では幅(W)・奥行き(D)・高さ(H)のうち最低1項目の入力必須
- 計算方法「ピッチ」では範囲長・端長1・端長2・ピッチ長が必須
- インポート時の一括取り込みでは計算方法を「標準」に固定

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
| majorCategory | VARCHAR(50) | NOT NULL | 大項目 |
| middleCategory | VARCHAR(50) | NULL | 中項目 |
| minorCategory | VARCHAR(50) | NULL | 小項目 |
| customCategory | VARCHAR(50) | NULL | 任意分類 |
| workType | VARCHAR(16) | NOT NULL | 工種 |
| name | VARCHAR(50) | NOT NULL | 名称 |
| specification | VARCHAR(50) | NULL | 規格 |
| unit | VARCHAR(6) | NOT NULL | 単位 |
| calculationMethod | ENUM | NOT NULL, DEFAULT 'STANDARD' | 計算方法 |
| calculationParams | JSONB | NULL | 計算用パラメータ |
| adjustmentFactor | DECIMAL(5,2) | NOT NULL, DEFAULT 1.00 | 調整係数 |
| roundingUnit | DECIMAL(6,2) | NOT NULL, DEFAULT 0.01 | 丸め単位 |
| quantity | DECIMAL(12,2) | NOT NULL | 数量 |
| remarks | VARCHAR(50) | NULL | 備考 |
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
  COUNT         // 箇所数（REQ-47）
}
```

**calculationParams（JSONB）の形状**:

計算方法ごとに格納されるキーが異なる。DB 上のカラム追加は不要で、REQ-47 で必要な DB 変更は enum 値の追加のみである。

| 計算方法 | calculationParams のキー |
|---|---|
| STANDARD | `null`（未設定） |
| AREA_VOLUME | `width?`, `depth?`, `height?`, `weight?` |
| PITCH | `rangeLength`, `endLength1`, `endLength2`, `pitchLength`, `length?`, `weight?` |
| COUNT | `count`, `length?`, `weight?` |

`adjustmentFactor` / `roundingUnit` は `quantity_items` の独立カラム（`Decimal(10,4)`）であり、計算方法によらず共通である。

### Migration Strategy（REQ-47）

**実測による裏付け**: 既存29マイグレーションに `ALTER TYPE ... ADD VALUE` の前例がゼロであったため、PostgreSQL 15.17（`postgres:15-alpine`、本番と同一イメージ）上で挙動を実測した。

**この二値（29 と ゼロ）は本節を書いた時点の記録であり書き換えない（タスク 115.234。`site-survey` の design.md「実測値の書き方（タスク 115.212）」の (a) に従う）。同じ二つの数え方の再実測は 34 と 2 である**——`ls -d backend/prisma/migrations/*/ | wc -l` の出力が `34`、`grep -rlE 'ALTER TYPE .* ADD VALUE' backend/prisma/migrations | wc -l` の出力が `2`（コミット `6b84be3`。2026-09-02 にリポジトリルートで実測）。前例が 2 件へ増えた内訳は、本節の設計が生んだ当のマイグレーション（`add_calculation_method_count`）と、別機能のマイグレーション（`add_estimate_item_note_type`）である。**上の設計上の帰結は再実測で動かない**——`ADD VALUE` を単文に限るという制約は前例の有無ではなく PostgreSQL の挙動から導いたものであり、その挙動の実測結果（上の表）は再実測の対象に含めていない。

| 検証ケース | 結果 |
|---|---|
| `BEGIN; ALTER TYPE "CalculationMethod" ADD VALUE 'COUNT'; COMMIT;` を単独実行し、**コミット後**に新値を INSERT | **成功**。PostgreSQL 12 以降、`ADD VALUE` はトランザクション内で実行可能 |
| **同一トランザクション内**で `ADD VALUE` した値を直後に使用（INSERT） | **失敗**（`ERROR: unsafe use of new value "..." of enum type` / `HINT: New enum values must be committed before they can be used.`） |

**設計上の帰結**:

- マイグレーションファイルは `ALTER TYPE "CalculationMethod" ADD VALUE 'COUNT';` の**1文のみ**とし、**同一マイグレーション内で `COUNT` を参照する DEFAULT 変更・UPDATE・INSERT を一切含めない**。この条件下では `prisma migrate deploy`（Docker entrypoint／Railway 自動適用）で安全に適用できる。
- 既存行への影響はない。`calculationMethod` のデフォルトは `STANDARD` のまま変更せず、既存データのバックフィルも不要である。
- enum 値は末尾に追加される（`STANDARD < AREA_VOLUME < PITCH < COUNT`）。アプリケーションは enum の序数に依存していないため影響はない。
- 前方互換性: 旧バージョンのアプリケーションコードが `COUNT` を含む行を読み込むと、TS のユニオン型に存在しない値を受け取ることになる。ただし数量表編集画面は enum 値追加と同一リリースで更新されるため、実運用上のリスクはない。ロールバックが必要な場合、PostgreSQL は enum 値の削除をサポートしないため、**enum 値は残したままアプリケーションコードのみを戻す**（`COUNT` の行が存在すると旧コードでは表示が壊れるため、ロールバック前に該当行の有無を確認する）。

## Error Handling

### Error Categories and Responses

**User Errors (4xx)**:

- `400 BAD_REQUEST`: 入力バリデーションエラー（必須フィールド未入力、計算方法と入力値の不整合、範囲外入力、文字数超過、サポート対象外ファイル形式）
- `404 NOT_FOUND`: 数量表・グループ・項目が存在しない、プロジェクトが存在しない
- `409 CONFLICT`: 楽観的排他制御エラー（他ユーザーによる更新との競合）。saveDraft では `expectedUpdatedAt` 不一致時に返却し、フロントはエラー表示のうえドラフト（未保存変更）を保持して再保存を可能にする（REQ-42 AC9）
- `422 UNPROCESSABLE_ENTITY`: ビジネスロジックエラー
- `500 INTERNAL_SERVER_ERROR`: コピー処理・保存処理中の予期しないエラー。saveDraft 失敗時もドラフトは保持され、編集内容は失われない（REQ-42 AC9）

**保存経路の所属違反の 400 は原因のグループを名指す（タスク 86.4）。** `PUT /api/quantity-tables/:id/save` が他プロジェクトの現調画像を指す payload を拒むとき、応答本文は `detail` に加えて、`groups[i].surveyImageId`（i は payload 上のグループの位置）をキーとする項目を本文の直下に持つ。キーの形は同じ保存経路の所属検証・重複検証が使う `groups[i].id` と揃えてある。違反する全てのグループを名指し、同じ画像を指す複数のグループもそれぞれ名指す。名指しには検査が既に引いた現調画像の行を使うため、問い合わせは増えない。`status` / `code` / `detail` は数量グループの紐付け経路（`POST /api/quantity-tables/:quantityTableId/groups` と `PUT /api/quantity-groups/:id`）と引き続き一致する。両経路は URL で1グループを指すため、位置の名指しを持たない。**画面への提示はタスク 86.5 の領分である。** 画面は現在、保存の失敗のうち 409 以外を一律の文言へ畳んでおり、この項目を読まない。

**現調画像の紐付けの失敗を画面で書き分ける（タスク 86.5）。** 上の段落の末尾の一文（画面が 409 以外を一律の文言へ畳み、名指しの項目を読まない）はタスク 86.4 の時点の記録であり、タスク 86.5 で現況ではなくなった。編集画面の保存ハンドラ（`handleSave`）は、現調画像の紐付けの失敗を `frontend/src/utils/survey-image-link-feedback.ts` の `describeSurveyImageLinkSaveFailure` へ渡して書き分ける。三つの失敗はいずれも恒久的で（再試行しても成功しない）、利用者が取るべき行動も違うため、再試行を促す一般の文言へは畳まない。見分けは状態コードではなく応答の `code` で行う。
- 400 `QUANTITY_TABLE_VALIDATION_ERROR` のうち `groups[i].surveyImageId` の名指しを持つもの（タスク 86.1 / 86.4）: i を、保存要求の構築元であるドラフトのグループの位置へ引き当てる。原因のグループを示し、写真の変更を促す。名指しを持たない 400 は本分岐に入らない。
- 404 `SURVEY_IMAGE_NOT_FOUND`（タスク 86.2）: 応答の `surveyImageId` と同じ写真を持つドラフトのグループをすべて示し、写真の変更を促す。引き当てられないときはグループを名指さずに行動だけを示す。同じ 404 でも `QUANTITY_TABLE_NOT_FOUND` は写真の失敗ではないため、状態コードでは見分けない。
- 410 `SURVEY_DELETED`（タスク 81.1）: 写真の現場調査が削除されたことを告げ、写真の変更を促す。**原因のグループは名指さない。** 応答は `surveyId` しか持たず、ドラフトのグループは写真の現場調査を知らないため、画面の側では引き当てられない。410 の名指しはタスク 90.2 の領分である。
- それ以外の失敗（500 等）は従来どおり一般の文言とする。ドラフトを保持する挙動（REQ-42 AC9）は変えていない。

**410 も原因のグループを名指し、画面に紐付けの解除を置く（タスク 90.2）。** 上の 410 の箇条（「原因のグループは名指さない」「410 の名指しはタスク 90.2 の領分である」）はタスク 86.5 の時点の記録であり、タスク 90.2 で現況ではなくなった。`PUT /api/quantity-tables/:id/save` が親の論理削除で拒むとき、応答本文は `surveyId` に加えて、所属違反の 400 と同じ `groups[i].surveyImageId`（i は payload 上のグループの位置）をキーとする項目を本文の直下に持つ。該当する全てのグループを名指し、同じ画像を指す複数のグループもそれぞれ名指す。**最初に出会った該当で打ち切らない**——打ち切ると利用者は保存のたびに1件ずつ解除することになる。名指しには検査が既に引いた現調画像の行を使うため、問い合わせは増えない。名指しの組み立ては拒むときにだけ走らせる（生存する画像の走査でグループ数に比例した無駄を並べないため、共通機構へ渡すのは値ではなく組み立てである）。
- **兄弟経路の本文は一字も変えていない。** 名指しを持てるのは位置を持つ保存経路だけであり、`POST /api/quantity-tables/:quantityTableId/groups` と `PUT /api/quantity-groups/:id`、および site-survey が同じ共通機構（`backend/src/utils/survey-deleted-guard.ts`）で塞いでいる5経路は、名指しを与えないため従来の6項目のままである。統合検証は3経路で共通の項目を同じ生成子で突き合わせ、保存経路にだけ名指しを足す形で固定している。
- **値の文言に現場調査IDを含めない。** 複数の現場調査が該当しうるため、グループごとの値は `削除された現場調査の画像は紐付けできません` とする。`detail` と `surveyId` は最初に出会った現場調査を指す（従来どおり）。
- **画面には紐付けの解除を置いた（REQ-42.3）。** 数量グループカードの写真領域に「写真の紐付けを解除」を追加し、ドラフトの `surveyImageId` を `null` にする。永続化は保存操作時の1回に畳まれる（REQ-42.7）。**これが袋小路の出口である**——親の現場調査が論理削除された写真は写真選択ダイアログの候補に現れないため「写真を変更」では選び直せず、解除しない限り無関係な編集も含めて当該数量表の保存が 410 で止まったままになる。三つの失敗に添える案内も「写真を変更するか紐付けを解除してから保存してください。」へ改めた（解除を案内しなければ 410 の利用者には出口が無い）。
- **不変条件は緩めていない。** 検査を外す・警告へ落とす向きの是正は採っていない。保存が通るのは、利用者が紐付けを解除して「論理削除された現調画像を指さない payload」を送ったときだけである。
- **採らなかった案 (f)**: 410 の名指しを、`detail` が指す最初の現場調査に属するグループだけに限る。同じ数量表が複数の論理削除済み現場調査の写真を持つ場合に、利用者が保存のたびに1件ずつ解除することになる。
- **採らなかった案 (g)**: 応答に現場調査IDとグループIDの対応表を返す。画面が必要とするのは「どのグループを直すか」だけであり、位置の名指しで足りる。3経路の本文の差も最小で済む。
- **採らなかった案 (h)**: 解除を画面に置かず、取得時に落とす経路（タスク 86.3）を論理削除にも広げる。取得時に落とすと、生きている紐付けと区別できないまま写真が黙って消える。親の論理削除は所属違反と違って利用者の権限の内側で起きた出来事であり、告げたうえで利用者に解除させるほうが、タスク 86.5 が定めた「落としたことを告げる」方針と整合する。

**404 の本文は文言を日本語へ改め、画像IDを構造化した項目で返す（タスク 86.5）。** `SurveyImageNotFoundError` の文言は英語で生の画像IDを含んでいたが、同じ検査の兄弟判定（所属違反・親の論理削除）は日本語であった。文言を「現場調査画像が見つかりません」へ改め、画像IDは例外の `surveyImageId` と応答本文の `surveyImageId` で持つ。画面はこの項目で原因のグループを引き当てる。写しは3経路（`PUT /api/quantity-tables/:id/save`、`POST /api/quantity-tables/:quantityTableId/groups`、`PUT /api/quantity-groups/:id`）で同時に改めた。タスク 86.2 が揃えた3経路の本文の全項目の一致は、統合検証が引き続き突き合わせている。識別子を構造化した項目で返す形には、現場調査の画像削除の経路の 404（`imageId`）と、論理削除の 410（`surveyId`）という先例がある。
- **採らなかった案 (a)**: 文言に画像IDを残す（410 の兄弟判定の文言は `surveyId` を含む）。`detail` は人が読む文言であり、機械が読む識別子は項目で返すほうが、画面が文言を解析せずに済む。
- **採らなかった案 (b)**: 保存経路の 404 にも、400 と同じく `groups[i].surveyImageId` の名指しを置く。紐付け経路は URL で1グループを指すため位置の名指しを持てず、3経路の本文を揃えるには画像IDを返すほかない。画面はドラフトの全グループを持つので、画像IDから引き当てられる。
- **残る限界**: 存在の検査は最初の欠落で打ち切るため、名指すのは1枚の写真と、それを持つ全グループである。別の写真も欠落していれば、次の保存で現れる。

**取得時に落とした紐付けを応答で名指し、画面で告げる（タスク 86.5）。** タスク 86.3 は所属違反の紐付けを取得の時点で `surveyImageId` ごと落とすが、落としたことはサーバのログにしか残らず、利用者から見ると写真が理由もなく消えていた。これは保存の失敗の書き分けとは別の設計である。`QuantityTableService.findById` の写像が、落とした紐付けを持つグループのIDを数量表詳細の直下の `droppedSurveyImageLinkGroupIds` で返す（落としていなければ空配列）。編集画面はこれを読み、`role="status"` の告知（`data-testid="survey-image-link-dropped-notice"`）で当該グループを名指し、保存すると紐付けが解除されることを告げる。取得した内容をそのまま保存すると `surveyImageId: null` が永続化されるためである。保存の応答は `findById` の再読込であり、解除後の状態を名指さないので、告知は保存の成功で消える。編集で写真を選び直したグループと、削除したグループは告げない。告知が偽にならないようにするためである。
- **タスク 86.3 の不変条件は保っている。** 名指すのは当該数量表のグループIDだけで、他プロジェクトの画像IDもプロジェクトも返さない。
- **文言は「他のプロジェクト」と言わない。** タスク 86.3 は、他プロジェクトの画像が紐付いていた事実を画面で告げること自体が、利用者の権限の外にある資源の存在を示唆すると記録している。利用者が取るべき行動（写真を選び直す、またはそのまま保存して解除する）は理由を知らなくても変わらないため、「参照できない写真」とだけ告げる。保存の 400 の文言が「この数量表のプロジェクトに属していない」と告げるのは、その画像IDを送ったのが利用者の側だからである。
- **採らなかった案 (c)**: 落とした件数だけを返す。どのグループの写真が消えたかが分からず、選び直す先を示せない。
- **採らなかった案 (d)**: グループごとに真偽値の項目を足す。落としたという事実は数量表の取得の写像で生じ、表の取得に付随する。グループの型へ足すと、ドラフトの初期化や保存後の同期にまで、この事実を必要としない項目を運ぶことになる。
- **採らなかった案 (e)**: 取得時に紐付けを一括で `null` へ書き換える。タスク 86.4 が退けたとおり、利用者の操作なしに本番データを戻せない形で書き換え、しかも黙って落とした状態を恒久化する。
- フロントの型 `QuantityTableDetail` では本項目を任意とした。理由は二つある。本項目を持たない応答（本項目を足す前の版のバックエンド）でも画面が壊れないようにするため、および既存の単体検証が持つ数量表詳細の固定データへ一律に項目を足すことを避けるためである。バックエンドの型では必須とした。

**複製の2経路は所属違反の紐付けを複製先へ写さない（タスク 91.1）。** `POST /api/quantity-tables/:id/copy`（`QuantityTableService.copy`）と `POST /api/quantity-groups/:id/copy`（`QuantityGroupService.copy`）は、元のグループの紐付けを検めずに複製先へ写していた。所属違反の紐付けを持つ数量表・グループを複製すると、**複製先に新しい所属違反の行が永続化される**。タスク 86.1 が保存経路を塞いだ後も、この2経路だけは新規の混入を作り続けていた。採ったのは**違反した紐付けだけを落とす**形である。複製そのものは従来どおり 201 で成功し、応答の形（`QuantityTableInfo` / `QuantityGroupInfo`）も変えていない。
- **REQ-17.7 / REQ-38.4 との関係**: 両条文は「コピー先でも同じ写真の紐づけを維持する」と述べるが、**所属違反の紐付けは利用者から見て「紐づけられている写真」ではない**。タスク 86.3 が取得の時点で `surveyImageId` ごと落とすため、画面には現れず、保存で送り返されることもない。利用者が見ているとおりに複製するなら、落とすのが条文どおりである。違反しない紐付けは従来どおり維持する。したがって本節は REQ-17.7 を被覆の対象として挙げない。
- **採らなかった案 (i)**: 複製全体を 4xx で拒む。取得経路が落とす向きに倒れている以上、利用者は当該の数量表を開いて編集できる。**開けるのに複製だけできない**という新たな出口の無さを作る。タスク 86.3 が「拒む向きは既存の紐付けを持つ利用者を袋小路へ追い込む」として退けたのと同じ形である。加えて両経路は現在この不変条件に対する応答を持たず（数量表のコピーは 404 と 500、グループのコピーは 404 / 403 / 409）、拒む向きに倒すと兄弟経路との応答の揃えを新たに設計することになる。
- **採らなかった案 (j)**: 写したまま据え置く。取得時に落ちるため表示には届かないが、**複製のたびに違反した行が増える**。これが本節の是正対象そのものであり採らない。
- **落としたことを利用者へ告げない。** タスク 86.5 の提示と食い違わない——同節が告知を置いたのは、**利用者が見ていた写真が取得のたびに黙って消える**ためである。複製元の告知（`droppedSurveyImageLinkGroupIds`）は従来どおり編集画面で出るので、利用者は複製の前から当該グループが「参照できない写真」を指すことを告げられている。複製先にその写真が無いことは、告げられた状態と一致する。告げる側へ倒すと、他プロジェクトの資源の存在を複製の応答でも示唆することになり、タスク 86.3 / 86.5 が保った不変条件を崩す。
- **親の現場調査が論理削除された画像の紐付けは落とさずに写す**（タスク 81.1 の不変条件）。取得経路は所属違反だけを落とし、論理削除の紐付けは落とさない（上の採らなかった案 (h)）。利用者には当該の写真が見えており、画面には紐付けの解除の導線がある（タスク 90.2）。複製で黙って落とすと、**利用者が現に見ている写真が理由もなく消える**——タスク 86.5 が問題として取り上げた状態そのものである。複製先は複製元と同じ状態になり、解除するまで保存が 410 で止まる点も同じである。判定に用いるのは `survey.projectId` だけで、`deletedAt` は読まない。
- **問い合わせをグループ数に比例させない**（タスク 81.1 / 86.1 の作法）。所属の判定に用いる `survey.projectId` は、数量表のコピーでは元の数量表を引く既存の1回の問い合わせ、グループのコピーではロック取得後の元グループの取得の、いずれも取得項目を広げて得る。現調画像を別途引く問い合わせは足さない。

**Business Logic Errors**:

- 計算不整合エラー: 問題のフィールドをハイライト
- 必須項目未入力エラー: 面積・体積やピッチモードでの必須項目チェック
- 範囲外入力エラー: 各フィールドの入力可能範囲を超えた値
- 文字数超過エラー: テキストフィールドの最大文字数超過
- 空白グループ名エラー: 数量グループ名が空白のまま確定された場合
- PDF生成エラー: PDF生成中の予期しないエラー

**インポート関連エラー**:

- ファイル形式エラー: サポート対象外のファイル形式（対応形式: .xlsx, .xls, .pdf）
- Excelパースエラー: SheetJSによるファイル読み取り失敗 → エラーメッセージ表示、手動入力を促す
- OCR処理エラー: pdfjs-dist/Tesseract.js/Claude Vision APIの処理失敗 → エラーメッセージ表示、リトライボタン表示
- OCRタイムアウト: 30秒超過 → タイムアウトエラー表示、リトライボタン表示
- Claude Vision APIフォールバック: API利用不可（ANTHROPIC_API_KEY未設定、HTTP 503、タイムアウト）→ pdfjs-dist + Tesseract.jsで自動フォールバック

**オートコンプリート関連エラー**:

- 初回候補取得失敗: オートコンプリート機能を無効化し手入力のみで運用（graceful degradation）

### Monitoring

- 保存エラー率の監視（saveDraft の失敗率・409競合率）
- saveDraft の成功率・保存所要時間
- 計算エラー発生頻度
- バリデーションエラー分布
- オートコンプリート候補取得APIのレスポンスタイム
- インポートOCR処理のエラー率・フォールバック率
- Claude Vision APIのレスポンスタイム・エラー率（数量表インポート用）

## Testing Strategy

### Unit Tests

- CalculationEngine: 各計算方法（標準、面積・体積、ピッチ、箇所数）のテスト
- CalculationEngine.calculateCount（REQ-47）: 長さ・重量なしで箇所数がそのまま rawValue になること、長さ・重量ありで乗算されること、箇所数が同一のときピッチ計算と最終数量が一致すること、整数以外・範囲外で例外となること
- countParamsSchema（REQ-47）: `calculationMethod: 'COUNT'` の数量項目で `count` / `length` / `weight` が保持されること
- 判別子ベースのパラメータ検証（REQ-48）: **混合状態のパラメータ**（ピッチの4キー＋`count`）を `calculationMethod: 'COUNT'` で検証すると、`count` が保持されピッチのキーが破棄されること。同じ混合状態を `calculationMethod: 'AREA_VOLUME'` ＋ `width` で検証すると `width` が保持されること（既存バグの回帰テスト）。**形状推測の union では両方とも失敗する**ため、判別子化の有無を直接検出する
- resetParamsForMethod（REQ-48）: 「ピッチ」→「箇所数」で `rangeLength` 等が破棄され `length` / `weight` が引き継がれること。「面積・体積」→「ピッチ」で `width` / `depth` / `height` が破棄され `weight` が引き継がれること。`STANDARD` への切替で `null` になること
- QuantityValidationService.validateCountMode（REQ-47）: 箇所数の必須・整数・範囲（1〜9999999）検証。あわせて switch の `default` 節が未知モードをエラーにすること
- CalculationMethodRegistry（REQ-47）: `CALCULATION_METHOD_LABELS` が全計算方法を網羅し、`CALCULATION_METHOD_OPTIONS` が表示順どおりに生成されること
- CalculationFields（REQ-47）: COUNT 選択時に COUNT_FIELDS が描画されること（PITCH_FIELDS へフォールバックしないこと）、箇所数が整数表示され小数桁が付与されないこと、既存の面積・体積／ピッチの小数2桁書式が変わらないこと
- QuantityItemActionMenu（REQ-46）: メニューが `document.body` 直下に Portal 描画されること、outside-click（`mousedown`）と Escape で閉じること、項目選択で操作実行後に閉じること。**クリップ検証は jsdom がレイアウトを再現しないため単体テストでは不可能であり、E2E に委譲する**
- QuantityTableService: CRUD操作、楽観的排他制御のテスト
- QuantityTableService.copy: ディープコピー（全グループ・全項目の複製、写真紐づけ維持）
- QuantityGroupService: CRUD操作、写真紐付けのテスト
- QuantityItemService: 計算検証のテスト
- QuantityValidationService: フィールド仕様バリデーション（文字数制限・数値範囲）
- AutocompleteCandidateStore: フィルタリング・blur時候補追加のテスト
- CopyQuantityTableDialog: デフォルト名設定、処理中インジケーター、エラーメッセージ表示
- QuantityGroupTitleRow: メインタイトル行の全列テキスト表示
- SortOrderButtons: ボタン有効/無効制御、コールバック呼び出し
- QuantityTablePdfExportService: 表紙生成、グループセクション生成、改ページヘッダー繰り返し
- ImportDataExtractor: Excelパース処理のテスト（SheetJSによるデータ読み取り、全シート解析）
- ImportDataExtractor: PDF OCR処理のテスト（テキストPDF/スキャンPDF判定、フォールバック処理）
- ImportFieldMapping: autoDetectFieldMapping（ヘッダー名からの自動推定）のテスト
- ImportFieldMapping: convertToQuantityItems（マッピング適用と変換）のテスト
- ImportDialog: ファイル形式バリデーション、処理状態管理、リトライ機能のテスト
- ImportPreviewTable: プレビューテーブル表示、テキスト選択可能性のテスト
- ClaudeVisionService: 数量表用プロンプトでの抽出テスト
- PhotoCommentDisplay: コメントあり/なし/null時の表示テスト（既存テストで対応済み、修正後の回帰確認）
- QuantityGroupCard: 写真選択時のコメント伝播テスト（linkSurveyImageレスポンスのcommentフィールド反映）
- QuantityItemActionMenu: メニュー開閉、disabled制御（canMoveUp/canMoveDown）、各アクションコールバック呼び出し
- EditableQuantityItemRow (REQ-37): 計算方法切替時の計算用フィールド群の表示/非表示、行高さが37px以下を維持すること、ラベルとテキストボックスが交互配置されること
- CalculationFields (REQ-37): 面積・体積モードでW→D→H→重量→調整係数→丸め設定の順、ピッチモードで範囲長→端長1→端長2→ピッチ長→長さ→重量→調整係数→丸め設定の順で水平配置されること、ラベルが visually-hidden ではないこと
- QuantityValidationService.truncateForCopy (REQ-38): 文字数超過時の元名切り詰めとサフィックス付与
- QuantityGroupService.copy (REQ-38): グループと配下項目の複製、surveyImageId保持、displayOrderの +1 シフト、監査ログ記録、エラー時のロールバック
- QuantityGroupCard (REQ-38): コピーボタンの表示、isCopying中のdisabled・スピナー表示、onCopyGroupコールバック呼び出し
- QuantityTableEditPage 写真選択ダイアログ (REQ-39): 多数枚（例: 30枚以上）が全件レンダリングされること、グリッドレイアウト用スタイル（`gridAutoRows` 等の修正後プロパティ）が適用されること。※写真同士の「重なりゼロ」の矩形判定は実レイアウトを要し jsdom では検証不可のため E2E（Playwright）で実施する（前提による無効化を避ける）
- buildGroupNameFromSurvey (REQ-40): 「{現場調査名} {連番}」生成、文字数超過時の現場調査名切り詰め＋連番付与（REQ-22 AC4 と整合）
- QuantityGroupService.createGroupsFromSurvey (REQ-40): 写真枚数分のグループ生成、写真順（displayOrder）紐づけ、末尾追加（max+1起点の連番）、写真0枚時 created:0、エラー時ロールバック、監査ログ記録
- SurveySelectDialog (REQ-40): 現場調査一覧表示、isCreating中のdisabled・インジケーター表示、onConfirm（選択ID）コールバック呼び出し
- QuantityGroupCard (REQ-41): 画像・コメント（photoArea）が水平スクロールラッパーの外に配置されること、数量項目テーブルのみが overflowX コンテナ内にあること、折りたたみ時に photoArea も非表示・再展開時に再表示されること
- quantityTableEditReducer (REQ-42): 各編集アクション（group/item の add/delete/copy/reorder、rename、photo link、from-survey 生成、import 取り込み）がドラフトのみを更新し `isDirty=true` になること、新規行に仮ID（`temp-`）が採番されること、save 同期アクションでサーバーレスポンスからドラフト/スナップショットが置換され `isDirty=false` になること
- QuantityTableService.saveDraft (REQ-42/11): payload に無いDB行の削除・id=nullの作成・既存idの更新・displayOrder反映・グループ名/数量表名/surveyImageId 反映、検証エラー時の中断、`expectedUpdatedAt` 不一致時の 409、エラー時ロールバック、監査ログ記録
- QuantityTableEditPage 離脱ガード (REQ-43): `isDirty=true` で `useBlocker` がブロック状態となり確認UIが出ること、proceed/reset の挙動、`isDirty=false` ではブロックしないこと、保存成功後にガード解除されること
- UnsavedChangesBadge (REQ-44): `isDirty` true で表示・false で非表示、編集で表示・保存成功で非表示に更新されること
- QuantityTableEditPage ヘッダー (REQ-45): `styles.header` に `position: sticky`/`top:0`/`zIndex` が適用されること、未保存インジケーターがヘッダー内に配置されること（実スクロールでの固定追従は E2E で検証）

### Integration Tests

- 数量表作成 → グループ追加 → 項目追加 → 保存の一連フロー
- saveDraft フル状態同期 (REQ-42): 新規グループ・新規項目の作成、削除されたグループ・項目のDB削除、並び替え（displayOrder）、グループ名・数量表名・写真紐づけの反映が単一 PUT /save で原子的に行われること、`expectedUpdatedAt` 競合で 409・編集状態保持を確認できること、他プロジェクト/権限不足で 403/404、並行 save で後発が 409 となり displayOrder 衝突・部分反映が起きないこと（楽観ロック）
- 計算方法の切り替えと数量再計算の正確性テスト
- 楽観的排他制御の競合シナリオ
- フィールドバリデーションエラー時の保存阻止（saveDraft で全状態検証・保存中断）
- オートコンプリート候補一括取得API: GROUP BYで重複排除された候補値の返却
- 数量表コピーAPI: 全データが正しく複製されること
- 数量グループコピーAPI (REQ-38): 元グループの全項目・写真紐づけが複製されること、displayOrderが元グループ+1の位置に挿入されること、後続グループのdisplayOrderが+1シフトされること、監査ログが記録されること
- 数量グループコピー並行制御 (REQ-38): 同一数量表に対する copy/add/reorder 操作が並行実行された場合、`SELECT FOR UPDATE` ロックにより serialize されること（先発操作完了まで後発操作はブロックされる）、ロック取得タイムアウト時に `OptimisticLockError` が返却され API 層で 409 にマップされること
- Claude Vision API（数量表モード）: 数量表用プロンプトで正しい列マッピングが返却されること
- 現場調査一括生成API (REQ-40): POST /api/quantity-tables/:tableId/groups/from-survey が現場調査の写真枚数分のグループを末尾に連番命名で生成し、各グループに写真が写真順で1枚ずつ紐づくこと、写真0枚時に created:0 を返すこと、他プロジェクトの現場調査指定時に 403/404 となること、トランザクションでエラー時に部分生成が残らないこと
- 現場調査一括生成 並行制御 (REQ-40): 同一数量表に対する from-survey/copy/add/reorder が並行実行された場合、`SELECT FOR UPDATE` ロックにより直列化され displayOrder の衝突・欠番・重複が発生しないこと、ロック取得タイムアウト時に 409 が返却されること（REQ-38 並行制御と同一方針）
- **上の2項（数量グループコピー並行制御・現場調査一括生成 並行制御）の現況（Task 88.1）**: 書いた時点の記録として残す。add（`create()`）と reorder（`updateDisplayOrder()`）は行ロックを取らず、直列化の範囲に入っていない。統合検証が並行で確かめているのは一括生成2本と copy の組み合わせ（Task 56.5）と、`saveDraft` どうしの同時保存（Task 88.1）である。決着と根拠は `#### QuantityTableService.saveDraft（フル状態同期保存）` の「並行制御の範囲（Task 88.1 の決着）」 に置いた。**【現況】Task 92.4 が add と reorder にも行ロックを入れ、並行で確かめる統合検証を1ファイル足した**（`backend/src/__tests__/integration/quantity-display-order-concurrency.api.integration.test.ts`。数量グループの作成2本と数量項目の作成2本を並行させる5件）

### E2E Tests

- 数量表新規作成から編集・保存までのフロー
- 計算方法変更と数量再計算
- コピー・移動操作
- パンくずナビゲーション
- 入力制限の動作確認
- オートコンプリート操作
- 数量表コピー操作
- タイトル行表示最適化
- 数量グループ名前変更操作
- 数量グループ並び順操作
- 数量項目並び順操作
- スクロールバー表示
- PDF出力操作
- インポート操作（Excelファイル）
  - インポートボタンクリック → ダイアログ表示 → Excelファイルアップロード → プレビュー表示 → マッピング調整 → 一括取り込みの一連フロー
  - 取り込まれた数量項目のフィールド値が正しいことの確認
  - 取り込み完了メッセージの表示確認
- インポート操作（PDFファイル）
  - PDFファイルアップロード → OCR処理 → プレビュー表示 → 一括取り込みの一連フロー
  - PDFインラインプレビューとページナビゲーションの動作確認
- 写真コメント表示
  - 数量グループに写真を紐づけた際にコメントが写真の右側に正しく表示されること
  - 数量表編集画面の初回表示時に既存写真のコメントが表示されること
  - 写真変更ダイアログで写真を変更した後、変更後の写真のコメントが表示されること
  - コメントが存在しない写真の場合、コメント表示エリアが空白であること
- 数量項目アクションメニュー
  - アクションメニューボタンのみが行の右端に表示されること
  - メニュー内から「上へ移動」「下へ移動」「コピー」「削除」が実行できること
  - 最上位項目の「上へ移動」がdisabled、最下位項目の「下へ移動」がdisabledであること
  - メニュー外クリックでメニューが閉じること
- 計算用フィールド配置（REQ-37）
  - 計算方法を「面積・体積」「ピッチ」に切り替えると、計算用フィールド群がメイン行の操作列右側に同一行で水平表示されること（行の下に別行として表示されないこと）
  - ラベルとテキストボックスが交互に配置され、すべてのラベルがDOMで可視であること
  - メイン行の行高さがレイアウト変更前と同等であること
  - 計算方法「標準」では計算用フィールド群が表示されないこと
  - 計算用フィールド群がビューポート右端を超えても、ページ全体の水平スクロールで閲覧可能であること
  - 同一グループ内に標準／面積・体積／ピッチが混在しても、各行が独立して正しく描画されること
- 数量グループコピー（REQ-38）
  - グループパネル表題部のコピーボタンをクリックすると、複製先グループが元グループの直下に出現すること
  - 複製先グループの名前が「{元名}のコピー」となること（文字数超過時は元名が切り詰められること）
  - 複製先グループに元グループの全数量項目（フィールド値・並び順を含む）が含まれること
  - 元グループに紐づけられていた写真が複製先グループにも紐づけられていること
  - 後続グループの並び順が +1 シフトされ、表全体の並び順が正しく更新されていること
  - コピー処理中はボタンがdisabled化され、スピナーが表示されること
  - 複製先グループのグループ名が直ちにインライン編集可能であること（既存 REQ-22 と整合）
- インポートエラーハンドリング
  - サポート対象外ファイル形式のエラー表示
  - OCR処理失敗時のリトライ動作確認
  - 別ファイルアップロードによる前回結果のクリア確認
- 写真選択ダイアログのレイアウト（REQ-39）
  - 写真枚数が多い現場調査で写真選択ダイアログを開いた際、写真同士が重ならずに一覧表示されること（隣接サムネイルの `getBoundingClientRect` 矩形が重複しないことを検証）
  - 狭幅ビューポートでも写真が潰れず重ならないこと
  - 写真変更（「別の写真を選択」）からも同じく重なりのない一覧が表示されること
- 現場調査からの数量グループ一括生成（REQ-40）
  - 「現場調査から一括追加」→現場調査選択→実行で、選択した現場調査の写真枚数分の数量グループが既存グループの末尾に生成されること
  - 各生成グループに写真が写真順で1枚ずつ紐づき、グループ名が「{現場調査名} 連番」となること
  - 紐づいた写真にコメントがある場合、写真の右側にコメントが表示されること（REQ-21/35 と整合）
  - 写真が0枚の現場調査を選択した場合、グループが生成されず「写真が存在しません」メッセージが表示されること
  - 生成完了時に生成グループ数を含む完了メッセージが表示されること
- 水平スクロール時の画像・コメント固定表示（REQ-41）
  - 数量グループ内の数量項目テーブルを右端まで水平スクロールしても、画像と現場調査コメントが常に表示され続けること
  - 水平スクロールで右側のはみ出したフィールド（REQ-37 計算用フィールド含む）が閲覧できること
  - 数量グループを折りたたむと画像・コメントも非表示になり、再展開で固定表示が復帰すること
- クライアントサイド編集・明示保存（REQ-42）
  - グループ/項目の追加・削除・コピー・並び替え・グループ名変更・写真紐づけ・現場調査一括生成・インポート取り込みを行っても、保存ボタンを押すまでサーバーへ永続化リクエストが飛ばないこと（ネットワーク監視で確認）
  - 保存ボタン押下で全変更が1回の PUT /save で永続化され、リロード後も反映が保持されること
  - 保存前にリロードすると未保存変更が破棄され、保存後はサーバー状態に一致すること
- 未保存変更の離脱ガード（REQ-43）
  - 未保存変更がある状態でパンくず等の画面遷移を行うと確認ダイアログが表示され、取消で留まり・承認で遷移すること
  - 未保存変更がある状態のリロード/タブクローズでブラウザ標準の離脱確認が出ること
  - 保存後は離脱確認が出ないこと
- 未保存インジケーター（REQ-44）
  - 編集を行うと保存ボタン付近に未保存インジケーターが表示され、保存後に消えること
- ヘッダー固定表示（REQ-45）
  - 編集画面を下方向にスクロールしても、インポート/PDF出力/保存/＋グループを追加ボタンが画面内に常に表示され続けること
  - 固定ヘッダー内に未保存インジケーターが表示されること
- アクションメニューの表示不具合修正（REQ-46）— `e2e/specs/quantity-tables/quantity-item-action-menu-clipping-e2e.spec.ts`
  - **`toBeVisible()` だけでは不十分**: Playwright の `toBeVisible()` は「空でない bounding box を持ち `visibility !== hidden`」の判定であり、**祖先の `overflow` によるクリップを検出しない**。既存の `quantity-item-action-menu.spec.ts` はこの理由で本不具合を素通りさせている（全テスト緑のまま機能は使用不能だった）。以下は `boundingBox()` による幾何検証と Portal 描画の直接確認を用いる
  - グループ**最下行**のアクションボタンを開き、メニューの3項目すべてが `boundingBox()` を持ち、かつ `toBeInViewport()` を満たすこと（REQ-46 AC1, AC3）
  - 数量項目が**1件のみ**のグループでも同様にメニュー全体が表示されること（REQ-46 AC4）
  - メニュー要素が `document.body` の直下に描画されていること（`evaluate((el) => el.parentElement === document.body)`）。これにより祖先クリップが構造的に発生しないことを保証する（REQ-46 AC2）
  - メニューを開いたまま数量項目の表を水平スクロールし、メニューの `x` 座標がアクションボタンの `x` 座標に追従すること（スクロール前後の差分を比較。REQ-46 AC5）
  - メニューを開いたまま画面を垂直スクロールし、メニューの `y` 座標がボタンに追従すること（REQ-46 AC6）
  - 固定ヘッダーと重なる位置でメニューを開き、メニューがヘッダーより前面に表示されること（重なり領域の `elementFromPoint` がメニュー側であること。REQ-46 AC7）
  - メニュー外クリックで閉じること、メニュー項目選択で操作が実行されメニューが閉じること（REQ-46 AC8, AC9 / REQ-36 AC9 の回帰確認）
  - メニューを開閉しても表の水平スクロール位置が保持され、REQ-37/41 の挙動が壊れないこと（REQ-46 AC11）
  - 既存流儀: `boundingBox()` ベースの幾何検証は `e2e/specs/quantity-tables/photo-select-overlap-e2e.spec.ts:66-95` のヘルパーパターンに準拠する
- 計算方法「箇所数」（REQ-47）— `e2e/specs/quantity-tables/quantity-count-calculation-e2e.spec.ts` と `e2e/specs/quantity-tables/quantity-count-persistence-e2e.spec.ts`
  - 計算方法セレクトに「箇所数」が選択肢として存在すること（REQ-47 AC1）
  - 「箇所数」を選択すると計算用フィールドが「箇所数 → 長さ → 重量 → 調整係数 → 丸め設定」の順で行内に水平表示されること。**ピッチのフィールド（範囲長・端長1・端長2・ピッチ長）が表示されないこと**（フォールバック回帰の検出。REQ-47 AC2）
  - 箇所数=5 / 長さ・重量 未入力 → 数量が 5 になること（REQ-47 AC5）
  - 箇所数=5 / 長さ=2.00 / 重量=1.50 / 調整係数=1.00 / 丸め=0.01 → 数量が 15.00 になること（REQ-47 AC4, AC6）
  - 同じ入力値に対し、ピッチ計算（箇所数が5になるパラメータ）と箇所数計算の最終数量が一致すること（REQ-47 AC7 の同一性検証）
  - 箇所数を未入力のまま保存 → 必須エラーが表示され保存されないこと（REQ-47 AC9）
  - 箇所数に小数（例 2.5）を入力 → 拒否されエラーが表示されること（REQ-47 AC10）
  - 箇所数に 0 または 10000000 を入力 → 範囲エラーが表示されること（REQ-47 AC11）
  - 箇所数・長さ・重量・調整係数・丸め設定のいずれかを変更すると数量が自動再計算されること（REQ-47 AC12）
  - 計算方法を「ピッチ」→「箇所数」→ 他方式へ切り替えるとフィールド群が正しく差し替わること（REQ-47 AC13, AC14）
  - **保存 → リロード後に計算方法・箇所数・長さ・重量・調整係数・丸め設定・数量がすべて復元されること**（REQ-47 AC15。zod union の strip 事故を E2E レベルでも検出する）
  - 「箇所数」の数量項目を含むグループをコピーすると、計算方法と全パラメータが複製されること（REQ-47 AC16）
  - 「箇所数」の数量項目を含む数量表を PDF 出力すると、計算方法欄が「ピッチ」ではなく**「箇所数」**と表示されること（REQ-47 AC17。ラベル変換のフォールバック回帰の検出）
- 計算方法切替時のパラメータ整合（REQ-48）— `e2e/specs/quantity-tables/quantity-count-method-switch-e2e.spec.ts`
  - **「ピッチ」で範囲長・端長1・端長2・ピッチ長を入力 →「箇所数」へ切替 → 箇所数を入力 → 保存 → リロード**した後、箇所数が保持されていること（REQ-48 AC3。これが今回の欠陥の直接の再現手順）
  - **「ピッチ」で全パラメータを入力 →「面積・体積」へ切替 → 幅を入力 → 保存 → リロード**した後、幅が保持されていること（REQ-48 AC4。既存バグの回帰テスト）
  - 計算方法を切り替えると、切替前の方式に固有のフィールド（範囲長等）が画面から消え、値も保持されないこと（REQ-48 AC1）
  - 「ピッチ」→「箇所数」の切替で、共通フィールドである「長さ」「重量」の入力値が引き継がれること（REQ-48 AC2）
  - 切替直後（新方式の必須パラメータが未入力）に、旧パラメータを流用した数量が表示されないこと（REQ-48 AC7）

### Performance Tests

- 100項目以上の数量表での操作レスポンス（クライアントサイド編集の応答性）
- saveDraft フル状態同期の保存レスポンスタイム（100項目以上の一括同期）
- オートコンプリート候補一括取得APIのレスポンスタイム
- クライアントサイドフィルタリングの応答時間
- 計算エンジンの大量項目での処理時間
- Excelインポートの処理時間（100行以上のファイル）
- PDF OCR処理の処理時間（5ページ以上のファイル）

## Security Considerations

- 認証済みユーザーのみアクセス可能（既存のProtectedRoute使用）
- プロジェクトへのアクセス権限チェック（既存のRBAC使用）
- オートコンプリート候補一括取得APIは`quantity_table:read`権限を要求
- Claude Vision API（数量表インポート用）は`quantity_table:write`権限を要求
- 入力値のサニタイズ（Zodスキーマ）
- 数値範囲の厳格なバリデーション（オーバーフロー防止）
- インポートファイルのサイズ制限（既存のmulterファイルサイズ制限に準拠）
- アップロードファイルのMIMEタイプ検証

## Performance & Scalability

- 仮想スクロール: react-windowで100項目以上の数量表に対応
- 遅延読み込み: 数量グループの展開時にのみ項目をフェッチ
- メモ化: 計算結果のキャッシュ（useMemo）
- 明示保存: 編集はクライアントサイドのドラフトで完結し、保存操作時に saveDraft で全状態を1回同期（操作ごとのAPI往復を排除、REQ-42）
- バッチ処理: 保存はフル状態を単一トランザクションで適用
- 入力制御の最適化: 文字幅計算のキャッシュ
- オートコンプリート最適化: 初回一括取得によりテキスト入力中のAPIリクエストを完全排除
- 並び順変更: 隣接2要素のdisplayOrderのみを更新（最小限の更新件数）
- PDF出力: 写真のData URL変換はPromise.allで並列実行
- インポート: React.lazy()による動的インポートでバンドルサイズ影響を回避
- OCR処理: Claude Vision API用のCanvas描画スケールは2.0（トークン量削減）、Tesseract.js用は4.0（精度向上）

## Requirement 49: 数量グループ数によらない写真表示の効率

### Overview

**Purpose**: 数量表編集画面と写真選択ダイアログで発生するサーバーリクエストの件数と通信量を、数量グループ数および選択可能な写真の枚数から切り離す。

**Users**: 数量グループが多い数量表を扱う積算担当者と、サーバー負荷を管理するシステム運用者。

**Impact（既存前提の是正）**: 本要件が対象とする経路のうち2点は是正済みである。

1. 数量グループ表題部が縮小表示に原本画像を読み込んでいた（`QuantityGroupCard.tsx`）。**是正済み**。サムネイルを渡し `preferThumbnail` を指定する。
2. 数量表詳細APIが `annotatedThumbnailUrl` を署名付きURLへ変換せず `/api/storage/<path>` の内部パスのまま返していた（`quantity-tables.routes.ts` の `enrichQuantityTableSignedUrls`）。当該パスは配信されないため、合成済みサムネイルは表示に使えずクライアント合成へ退行していた。**是正済み**。

残る差分は、拡大表示が原本を取得しないこと（49.7）、表示領域外の取得抑止（49.8）、写真選択ダイアログの一括取得（49.9）である。

#### Goals
- 数量表編集画面の表示で発生するリクエストを、数量表詳細の取得1回と、表示領域に入った写真の取得のみに限定する
- 拡大表示の操作時点で原本画像を取得し、縮小表示用の画像を引き伸ばさない
- 写真選択ダイアログの写真一覧を、現場調査ごとの個別リクエストに分割せず取得する
- 写真選択ダイアログの対象を Requirement 4.3 / 19.2 が定める注釈付き写真のみへ揃える

**利用者から見える変化**: 写真選択ダイアログに注釈のない写真が表示されなくなる。現行実装は要件の規定に反して全写真を表示していたため、これは要件への追従であり機能の縮小ではない。ただし注釈を付けずに写真を数量グループへ紐づける運用が存在する場合、当該操作は行えなくなる。

#### Non-Goals
- 表示領域到達の観測機構そのもの（共有コンポーネント `AnnotatedImageThumbnail` と `useInViewport` が担い、site-survey スペックの Requirement 38 が所管する）
- 注釈をレンダリングしたサムネイル画像の生成（site-survey の Requirement 20.4 / 23 が所管）
- 2つある拡大表示経路（プレビューと注釈ビューア）の統合。表示要素が異なるため本要件では扱わない
- 未結線の `PhotoChangeDialog` の扱い（Requirement 19・39 の所管）
- 写真選択ダイアログの絞り込み・検索UI（Requirement 4・19 の所管）

### Boundary Commitments

#### This Spec Owns
- `frontend/src/components/quantity-table/QuantityGroupCard.tsx` が `AnnotatedImageThumbnail` へ渡す画像情報（表示元URL・実寸・縮小表示指定）
- `frontend/src/components/quantity-table/PhotoPreviewDialog.tsx` の拡大表示の表示元
- `frontend/src/pages/QuantityTableEditPage.tsx` の写真選択ダイアログにおける写真一覧の取得手段
- 数量表詳細レスポンスの `surveyImage` が持つフィールド（`quantity-table.service.ts` の写真サマリ生成、`quantity-tables.routes.ts` の署名付きURL変換）
- **プロジェクト単位の現場調査写真一覧を返す新規エンドポイントの契約**（後述の「境界をまたぐ変更」を参照）

#### Out of Boundary
- `AnnotatedImageThumbnail` の表示元選択規則と取得タイミングの制御（site-survey の Requirement 38 が所管）。本スペックは**利用者**であり、同コンポーネントを変更しない
- `useInViewport` の実装（同上）
- 注釈をレンダリングしたサムネイルの生成契機と生成結果（site-survey の Requirement 20.4 / 23 が所管）
- `hasAnnotations` の導出規則。現場調査API・数量表APIとも「注釈レコードの存在」で一致しており変更しない
- 未結線の `PhotoChangeDialog.tsx` の存廃。Requirement 19・39 が2つのダイアログを前提としている一方、実装は写真の追加・変更を同一ダイアログで扱う。この不一致の解消は本要件の対象外
- 写真選択ダイアログのレイアウト（Requirement 39 が所管）

#### 境界をまたぐ変更（明示）
49.9 を満たすには、プロジェクト内の現場調査写真をまとめて取得する手段が必要である。この能力は既存のどのスペックにも存在せず、データ自体は現場調査機能が保持する。本設計は次の方針を採る。

- **契約は本スペックが所有する**。当該エンドポイントは写真選択ダイアログのためだけに存在し、他の利用者を想定しない
- **実装は現場調査機能が所有するファイルへ加える**。画像一覧の権限検証と署名付きURL生成の規約（site-survey Requirement 38.4 の問い合わせ回数の契約）を二重に持たないため
- この変更は site-survey の Requirement 38.4 が定める「問い合わせ回数を枚数に比例させない」規約を満たす形で行う。違反した場合は同要件の回帰となる

#### Allowed Dependencies
- 依存方向: `types` → `api` → `components` → `pages`。左方向のみ import 可
- `QuantityGroupCard` → `AnnotatedImageThumbnail`, `PhotoPreviewDialog`。注釈取得APIを直接呼ばない
- `PhotoPreviewDialog` → `AnnotatedImageThumbnail`。Fabric.js を直接扱わない
- `QuantityTableEditPage` → 新規の写真一覧取得API。現場調査詳細取得（`getSiteSurvey`）を写真収集の目的で呼ばない
  - **上の条項が範囲を絞らずに書く「現場調査詳細取得を写真収集の目的で呼ばない」の現況（タスク 96.8）**: 条項は書かれた時点の記録として残し、ここへ現況の再実測を併記する（site-survey の設計文書 `#### 実測値の書き方（タスク 115.212）` の (a)）。**この禁止が及ぶのは写真選択ダイアログおよび写真変更ダイアログの写真一覧の取得に限られ、現場調査からの一括生成（Requirement 40）の写真取得には及ばない。** 根拠は要件の側にある——Requirement 49 のスコープ節は対象を表示に必要なリクエストの発生の仕方と表示に用いる画像の選択に絞り、49.9 はまとめて取得する義務を課す契機を「写真選択ダイアログまたは写真変更ダイアログを開く」場合に限る。一方の Requirement 40 は受入基準 13 件のいずれも写真の取得形態を規定せず、同要件の注記と 42.10 は現場調査写真一覧の取得を参照系として制約の対象外に置く。さらに 40.3 は注釈の有無を問わない全写真を求めるため、注釈付きの写真だけを返す新規の写真一覧取得API（`getProjectSurveyImages`）では満たせない。**実装はこの読みのとおりである**——編集画面で `getSiteSurvey(` を呼ぶ箇所は一括生成の確定ハンドラ `handleConfirmCreateFromSurvey` の1箇所だけで、写真選択ダイアログを開く `handleSelectImage` は `getProjectSurveyImages` の1リクエストへ一本化されている。写真の変更も同じ経路を通る（`QuantityGroupCard` の `handleChangePhoto` が `onSelectImage` を呼び、編集画面はそこへ `handleSelectImage` を渡す）。再現コマンドと出力は次のとおりである: `grep -c 'getSiteSurvey(' frontend/src/pages/QuantityTableEditPage.tsx` の出力は `1`、`awk '/^  const handleSelectImage = useCallback\(/,/^  \);$/' frontend/src/pages/QuantityTableEditPage.tsx | grep -c 'getSiteSurvey('` の出力は `0`、同じ区間へ `grep -c 'getProjectSurveyImages('` を掛けた出力は `1`、`awk '/^  const handleConfirmCreateFromSurvey = useCallback\(/,/^  \);$/' frontend/src/pages/QuantityTableEditPage.tsx | grep -c 'getSiteSurvey('` の出力は `1`、`grep -c 'onSelectImage={handleSelectImage}' frontend/src/pages/QuantityTableEditPage.tsx` の出力は `1`、`awk '/^### Requirement 40:/,/^### Requirement 41:/' .kiro/specs/quantity-table-generation/requirements.md | grep -cE '^[0-9]+\. '` の出力は `13` である。**起票文（`tasks.md` の 96.8）は受入基準を 12 件と書くが、着手時に上の式で数え直すと 13 件である**（Requirement 40 の見出しから Requirement 41 の見出しまでの区間で、行頭が「数字・ピリオド・空白」の行を数えた。作業ツリーのディスク上のファイルへの数えであり、索引は用いていない）。**本書で同じ禁止を書く条項はこの1行だけである**——`grep -n '写真収集の目的で呼ばない' .kiro/specs/quantity-table-generation/design.md` の出力は2行で、上の条項の行と、その文言を引く本併記の行である（本併記を書き足す前の同じ式の出力は条項の行の1行だった。site-survey の設計文書 `#### 実測値の書き方（タスク 115.212）` が警告する自己言及の型のため、件数は本併記の行を差し引いて読む）。直下の `### 設計合成（Design Decisions）` の Simplification の箇条が述べる「中間の現場調査詳細は写真収集のためだけに取得されており」は写真選択ダイアログの取得経路についての記述であり、本併記の読みと食い違わない。タスク 96.8。コミット `05061bfb`。2026-09-15 にリポジトリルートで実測
- バックエンド: 新規エンドポイント → `ImageListService`, `SignedUrlService`。Prisma へ直接問い合わせる経路を新設しない
- 新規の外部ライブラリ依存を追加しない

#### Revalidation Triggers
- site-survey の Requirement 38 が `AnnotatedImageThumbnail` の観測条件（実寸が正の値であること）を変更した場合 → 数量表が渡す画像情報を再検証
- `SurveyImageSummary` の利用箇所（PDF出力・一括生成）が増えた場合 → 実寸フィールド追加の影響を再検証
- プロジェクトあたりの現場調査数・写真枚数が新規エンドポイントの上限を超えるようになった場合 → ページング方針を再設計
- `PhotoChangeDialog` が結線された場合 → 49.9・49.10 の対象範囲を再検証

### 設計合成（Design Decisions）

- **Generalization**: 49.2・49.3・49.8 はいずれも「表示元の選択と取得タイミング」という単一の関心であり、共有コンポーネント `AnnotatedImageThumbnail` が既に所管している。数量表側で独自の遅延読み込みを実装せず、**同コンポーネントが観測を成立させるために必要な入力（実寸）を供給する**ことに作業を絞る。
- **Build vs Adopt（Adopt）**: 拡大表示の注釈反映は、注釈ビューア（`QuantityTableEditPage.tsx`）が既に採っている「原本画像＋クライアント合成」方式を採用する。`PhotoPreviewDialog` の `annotatedThumbnailUrl || originalUrl` は、合成済みサムネイル（縮小解像度）を拡大表示に用いるため 49.7 を満たさない。
- **Build vs Adopt（Adopt）**: 新規エンドポイントの権限検証と署名付きURL生成は `SignedUrlService` / `ImageListService` の既存規約を採用する。プロジェクト単位の権限判定は `SignedUrlService` が内部に持つプロジェクト判定を公開して用い、判定基準を複製しない。
- **Simplification**: 写真一覧の取得を「現場調査一覧の取得 → 各現場調査の詳細取得」の2段構えから、1エンドポイントの1リクエストへ置き換える。中間の現場調査詳細は写真収集のためだけに取得されており、他の情報は使われていない。
- **選択対象を注釈付き写真のみへ絞る（設計レビューでの是正）**: Requirement 4.3 / 19.2 は選択対象を「同一プロジェクトの注釈付き現場写真一覧（注釈エディタで編集済みの画像）」と定めているが、現行実装（`QuantityTableEditPage.tsx`）は絞り込みを行わず全写真を描画し、注釈ありにバッジを付けるのみである。**要件どおりサーバー側で注釈付きのみへ絞る**ことにより、応答件数と通信量が要件の範囲へ収まり、上限到達の可能性も大きく下がる。要件を変更せず実装を要件へ寄せる方向であり、変更範囲が最小となる。
- **Simplification（設計レビューでの是正）**: 一覧が返す表示用の署名付きURLを1件あたり1本（`displayUrl`）に統一する。当初は `thumbnailUrl` / `annotatedThumbnailUrl` / `originalUrl` の3本を返す設計だったが、R2 実装（`r2-storage.provider.ts`）の SigV4 presigned URL は1本あたり数百バイト規模であり、件数に比例して応答が肥大する。Requirement 49 の Objective は「件数**と通信量**」を対象としており、件数削減と引き換えに通信量を増やす設計は目的の半分しか満たさない。優先順位の解決をサーバー側へ寄せることで、呼び出し側の分岐も不要になる。
- **Simplification**: 上限は件数のみで表現し、ページングを導入しない。注釈付きのみへ絞ったことで想定件数が大きく下がるため、既定200・最大500とする。現行実装は現場調査を先頭100件までしか見ておらず既に暗黙の上限がある。上限を応答で明示することで、暗黙の切り捨てを可視化する。
- **Rejected**: 数量表側で `useInViewport` を直接使い `QuantityGroupCard` の描画自体を遅延させる案。遅延読み込みの実装が2箇所に分かれ、同じ問題への対処が重複する。design.md の境界（取得タイミングは共有コンポーネントの所管）にも反する。
- **Rejected**: 既存の現場調査一覧APIへ `includeImages` クエリを追加する案。同APIは一覧表示用に代表画像1枚のURLのみを返す設計であり、全画像を返す責務を持ち込むと応答形状が用途によって変わる。
- **Rejected（設計レビューで検討し不採用）**: 写真選択を「現場調査を選ぶ → その写真を見る」の2段構えへ変更し、新規エンドポイント自体を不要にする案。上限到達と応答サイズの双方を解消できるが、Requirement 4.3 / 19.2 が明示する「同一プロジェクトの写真一覧」と正面から矛盾し、承認済み要件2件の改定と稼働中の操作体験の変更を伴う。注釈付きへの絞り込みで同じ問題が解消できるため採らない。

### Architecture

```mermaid
graph TB
    subgraph Frontend
        EditPage[QuantityTableEditPage]
        GroupCard[QuantityGroupCard]
        Preview[PhotoPreviewDialog]
        Thumb[AnnotatedImageThumbnail]
    end
    subgraph Backend
        TableRoutes[quantity-tables routes]
        TableService[QuantityTableService]
        ProjectImages[project survey-images endpoint]
        ImageList[ImageListService]
        SignedUrl[SignedUrlService]
    end

    EditPage --> TableRoutes
    EditPage --> ProjectImages
    EditPage --> GroupCard
    GroupCard --> Thumb
    GroupCard --> Preview
    Preview --> Thumb
    TableRoutes --> TableService
    TableRoutes --> SignedUrl
    ProjectImages --> ImageList
    ImageList --> SignedUrl
```

**Key Decisions**

- `AnnotatedImageThumbnail` は本スペックの境界外にある共有部品である。図中で数量表側から一方向に依存しており、逆向きの依存や数量表固有の分岐を同コンポーネントへ持ち込まない。
- 写真選択ダイアログの取得先が `ProjectImages` の1経路に集約される。現行の「現場調査一覧 → 現場調査詳細 × N」の経路は廃止する。

### File Structure Plan

| ファイル | 区分 | 責務 |
|---|---|---|
| `backend/src/services/image-list.service.ts` | 変更 | プロジェクト単位で注釈付き現場調査写真を一括取得する経路を追加する。表示用URLを1本へ解決し、問い合わせ回数を写真枚数に比例させない |
| `backend/src/services/signed-url.service.ts` | 変更 | プロジェクト単位のアクセス可否判定を公開する（既存の内部判定を公開するのみで判定基準は変更しない） |
| `backend/src/routes/site-surveys.routes.ts` | 変更 | プロジェクト配下の写真一覧エンドポイントを追加する |
| `backend/src/services/quantity-table.service.ts` | 変更 | 写真サマリへ実寸（幅・高さ）を含める |
| `backend/src/routes/quantity-tables.routes.ts` | 変更なし（実装済み） | `annotatedThumbnailUrl` の署名付きURL変換は是正済み |
| `frontend/src/types/quantity-table.types.ts` | 変更 | 写真サマリの型へ実寸を追加する |
| `frontend/src/api/site-surveys.ts` | 変更 | プロジェクト単位の写真一覧取得を追加する |
| `frontend/src/components/quantity-table/QuantityGroupCard.tsx` | 変更 | 表題部の画像情報へ実寸を渡す |
| `frontend/src/components/quantity-table/PhotoPreviewDialog.tsx` | 変更 | 拡大表示を原本画像＋クライアント合成へ切り替える |
| `frontend/src/pages/QuantityTableEditPage.tsx` | 変更 | 写真選択ダイアログの取得を一括取得へ置き換える。表示元は `displayUrl` を用い、注釈の有無による分岐とバッジ表示は不要になる（全件が注釈付きのため）。**再実測では、この欄のうち「一覧の表示元を分岐しない」は真であり、「注釈の有無による分岐とバッジ表示は不要」をファイル全体について読むのは偽である**——一覧の各写真は `displayUrl` をそのまま表示元とし（`grep -cF '注釈の有無で表示元を分岐しない' frontend/src/pages/QuantityTableEditPage.tsx` の出力が `1`）、一覧には目印も出さない。一方、同じファイルの `handlePhotoSelect` は選択の確定時に `isDisplayUrlAnnotated` で表示元の渡し先を分け（`grep -cF 'const isComposited = selectedImage.isDisplayUrlAnnotated;' frontend/src/pages/QuantityTableEditPage.tsx` の出力が `1`）、`hasDrawnAnnotations` を写真サマリへ載せ（`grep -cF 'hasDrawnAnnotations: selectedImage.hasDrawnAnnotations,' frontend/src/pages/QuantityTableEditPage.tsx` の出力が `1`）、それが数量グループの表題部の注釈の目印を決める（`grep -cF '{hasDrawnAnnotations && (' frontend/src/components/quantity-table/QuantityGroupCard.tsx` の出力が `1`）。括弧の理由「全件が注釈付き」は注釈レコードの有無についてだけ真である。一覧に目印が無いことの再現と、理由の再実測は、下の `ProjectSurveyImage` の定義の直下に置いた（表のセルには縦棒を書けないため）。行は 75.1 以前の設計の記述として残す。タスク 87.1。コミット `cba1233f`。2026-09-12 にリポジトリルートで実測 |

### Components and Interfaces

| Component | Domain | Intent | Requirements | Dependencies | Contracts |
|---|---|---|---|---|---|
| プロジェクト写真一覧エンドポイント | Backend/API | プロジェクト内の注釈付き現場調査写真を表示用URL1本でまとめて返す | 49.9, 49.10 | `ImageListService`（P0）, `SignedUrlService`（P0） | API |
| `ImageListService`（プロジェクト単位） | Backend/Service | 枚数非依存の問い合わせ回数で写真とURLを返す | 49.9 | `SignedUrlService`（P0）, `StorageProvider`（P0） | Service |
| `QuantityTableService` の写真サマリ | Backend/Service | 表示に必要な情報へ実寸を加える | 49.8 | Prisma（P0） | Service |
| `QuantityGroupCard` | Frontend/Component | 表題部の表示元と実寸を供給する | 49.2, 49.3, 49.4, 49.5, 49.6, 49.8 | `AnnotatedImageThumbnail`（P0） | — |
| `PhotoPreviewDialog` | Frontend/Component | 拡大表示で原本を用い注釈を反映する | 49.7 | `AnnotatedImageThumbnail`（P0） | — |
| `QuantityTableEditPage` の写真選択 | Frontend/Page | 選択可能な写真を一括取得する | 49.9, 49.10 | 写真一覧API（P0） | — |

#### プロジェクト写真一覧エンドポイント

```
GET /api/projects/:projectId/survey-images
```

| 項目 | 内容 |
|---|---|
| クエリ | `limit`（既定 200、最大 500） |
| 認可 | `site_survey:read` 権限、およびプロジェクトへのアクセス可否判定 |
| 対象 | **注釈が存在する写真のみ**（Requirement 4.3 / 19.2 が定める「注釈エディタで編集済みの画像」） |
| 並び | 現場調査の調査日降順 → 写真の表示順昇順 |
| 応答 | `{ images: ProjectSurveyImage[]; hasMore: boolean }` |
| エラー | 400（クエリ不正）、401、403、404（プロジェクト不在） |

```typescript
export interface ProjectSurveyImage {
  id: string;
  surveyId: string;
  surveyName: string;
  fileName: string;
  /**
   * 一覧表示に用いる画像（署名付きURL）
   *
   * 注釈をレンダリングしたサムネイルを優先し、無い場合は通常のサムネイルへ解決した
   * 結果を1本だけ返す。呼び出し側が優先順位を再実装する必要をなくし、
   * 応答に含まれる署名付きURLの本数を抑える。
   */
  displayUrl: string | null;
  /** 原本画像（署名付きURL）。選択確定後の拡大表示に用いる */
  originalUrl: string | null;
  comment: string | null;
  /** 画像の実寸（表示領域確保に用いる） */
  width: number;
  height: number;
  displayOrder: number;
}
```

**上の定義は 75.1 の実装に対して陳腐化している（再実測）。** 実装の同名の型はいずれも 12 欄を持ち、上の定義の 10 欄に `isDisplayUrlAnnotated` と `hasDrawnAnnotations` の二つの真偽値を加えている——`awk '/^export interface ProjectSurveyImage \{/,/^\}/' backend/src/services/image-list.service.ts | grep -cE '^  [A-Za-z]+: '` と、同じ式を `frontend/src/types/site-survey.types.ts` および本書へ掛けた出力は、順に `12`・`12`・`10` である。二つの真偽値だけを数える `awk '/^export interface ProjectSurveyImage \{/,/^\}/' backend/src/services/image-list.service.ts | grep -cE '^  (isDisplayUrlAnnotated|hasDrawnAnnotations): boolean;'` の出力は両ファイルとも `2` であり、本併記を書く前の本書は二つの名を一度も持っていなかった（`git show cba1233f:.kiro/specs/quantity-table-generation/design.md | grep -c 'isDisplayUrlAnnotated\|hasDrawnAnnotations'` の出力が `0`）。二つが要る理由は、表示用URLを 1 本へ畳むと呼び出し側が合成済みか否かを値から判別できないこと（前者）と、注釈レコードの有無が描画の有無を意味しないこと（後者。回転のみの保存でもレコードは残る）であり、75.1 のコミット `b701ad53`（2026-09-10）の本文が同じ二点を挙げる（`git show -s --format=%B b701ad53 | grep -cF '真偽値2つで応答へ足す'` の出力が `1`）。**下の契約の第一項は再実測でも真である**——一覧は注釈レコードを持つ写真に限られる（`grep -cF 'annotation: { isNot: null },' backend/src/services/image-list.service.ts` の出力が `1`）。ただしそこで言う「注釈あり」はレコードの有無であって、描画の有無でも合成済みサムネイルの有無でもない。表示用URLは合成済みサムネイルが無ければ通常のサムネイルへ解決される（`grep -cF 'image.annotatedThumbnailPath ?? image.thumbnailPath' backend/src/services/image-list.service.ts` の出力が `1`）。上のファイル変更表の `QuantityTableEditPage.tsx` の行について、一覧の描画は画像要素一つだけで二つの真偽値を読まない（`awk '/projectSurveyImages.map/,/\)\)\}/' frontend/src/pages/QuantityTableEditPage.tsx | grep -c '<img'` の出力が `1`、同じ範囲へ `grep -cE 'hasDrawnAnnotations|isDisplayUrlAnnotated'` を掛けた出力が `0`）。(a) に従い定義は 75.1 以前の設計の記述として残し、再実測を併記する。タスク 87.1 の測定範囲は起票の 3 件に限り、走査は広げていない。タスク 87.1。コミット `cba1233f`。2026-09-12 にリポジトリルートで実測

**契約**

- **注釈が存在しない写真は返さない**。Requirement 4.3 / 19.2 は選択対象を「注釈エディタで編集済みの画像」と定めており、絞り込みをサーバー側で行うことで応答件数と通信量を要件の範囲へ収める
- `hasAnnotations` は返さない。全件が注釈ありであることが本エンドポイントの不変条件であり、常に真となるフィールドを持たせない
- 表示用の署名付きURLは1件あたり1本に限る。優先順位（注釈付きサムネイル > 通常サムネイル）はサーバー側で解決する
- `hasMore` が `true` の場合、上限に達して切り捨てが発生したことを示す。呼び出し側はその旨を利用者へ提示できる
- 問い合わせ回数は写真枚数・現場調査数に比例させない。現場調査の抽出・注釈付き画像の抽出をそれぞれ1回で行い、アクセス可否の判定はプロジェクト単位で1回とする
- 署名付きURLは画像の抽出結果に含まれるストレージキーから生成し、画像ごとの再照会を行わない

#### 写真サマリへの実寸追加

```typescript
export interface SurveyImageSummary {
  // 既存フィールドは変更しない
  /** 画像の実寸（ピクセル）。未読込時に表示領域を確保するために用いる */
  width: number;
  height: number;
}
```

- 実寸が正の値でない場合、共有コンポーネントは表示領域を確保できず観測を行わない（site-survey の設計が定める縮退規則）。したがって本フィールドの供給が 49.8 の成立条件である

#### `PhotoPreviewDialog`（差分）

- 表示元を `annotatedThumbnailUrl || originalUrl` から、共有コンポーネントへの委譲（原本画像＋クライアント合成）へ変更する
- 縮小表示指定を行わず、即時取得を指定する。拡大表示は利用者の明示操作を契機とするため遅延させない
- 注釈の反映結果は Requirement 3.3 の規定を維持する

### System Flows

```mermaid
sequenceDiagram
    participant User
    participant Page as QuantityTableEditPage
    participant API as Backend
    participant Card as QuantityGroupCard
    participant Thumb as AnnotatedImageThumbnail

    User->>Page: 数量表編集画面を開く
    Page->>API: GET 数量表詳細
    API-->>Page: グループ + 写真サマリ（URL・実寸・注釈有無）
    Note over Page,API: リクエストはここまでで1回（49.1）

    Page->>Card: 全グループを描画
    Card->>Thumb: 表示元URL・実寸・縮小表示指定を渡す
    Note over Thumb: 実寸で領域を確保し、表示領域到達まで取得しない（49.8）

    User->>Page: 写真を選択する操作
    Page->>API: GET プロジェクト写真一覧（1回）
    API-->>Page: 写真一覧 + hasMore
    Note over Page,API: 現場調査ごとの個別取得を行わない（49.9）

    User->>Card: 表題部の写真をクリック
    Card->>Thumb: 原本画像・即時取得を指定
    Note over Thumb: この時点で原本を取得しクライアント合成する（49.7）
```

### Requirements Traceability

| Requirement | Summary | Components | Interfaces | Flows |
|---|---|---|---|---|
| 49.1 | 写真の表示情報をまとめて取得 | `QuantityTableService` の写真サマリ, `quantity-tables routes` | 数量表詳細レスポンス | 画面表示 |
| 49.2 | 注釈のためのグループごと追加リクエストなし | `QuantityGroupCard`, `AnnotatedImageThumbnail`（境界外） | 表示元URLの供給 | 画面表示 |
| 49.3 | リクエスト件数をグループ数に比例させない | `QuantityGroupCard` | 実寸の供給 | 画面表示 |
| 49.4 | 表題部はサムネイル | `QuantityGroupCard` | 縮小表示指定 | 画面表示 |
| 49.5 | 合成済みサムネイル優先 | `QuantityGroupCard` | `annotatedThumbnailUrl` の供給 | 画面表示 |
| 49.6 | 利用不可時の表示維持 | `AnnotatedImageThumbnail`（境界外） | フォールバック | 画面表示 |
| 49.7 | 拡大表示時に原本を取得 | `PhotoPreviewDialog` | 原本＋即時取得の指定 | 拡大表示 |
| 49.8 | 表示領域外は取得しない | `QuantityTableService` の写真サマリ, `QuantityGroupCard`, （境界外）`AnnotatedImageThumbnail` | 実寸フィールド | 画面表示 |
| 49.9 | 選択可能な写真をまとめて取得 | プロジェクト写真一覧エンドポイント, `QuantityTableEditPage` | `ProjectSurveyImage` | 写真選択 |
| 49.10 | ダイアログ一覧はサムネイル | プロジェクト写真一覧エンドポイント, `QuantityTableEditPage` | `displayUrl`（サムネイル解像度へ解決済み） | 写真選択 |

### Error Handling

| 失敗 | 挙動 | 根拠 |
|---|---|---|
| 写真一覧の取得に失敗 | ダイアログへ取得失敗を提示し、既存の写真紐づけは変更しない | 49.9。部分的に取得した一覧で選択させない |
| 上限に達して切り捨てが発生 | `hasMore` を真として返し、一覧に全件が含まれない旨を提示する | 49.9。暗黙の切り捨てを可視化する |
| 注釈付き写真が1件も存在しない | 空一覧を返す。ダイアログは「注釈付きの写真がありません」と、注釈エディタでの編集を促す旨を提示する | Requirement 4.3 / 19.2。対象が注釈付きに限られることを利用者へ明示する |
| 実寸が欠落した写真 | 共有コンポーネントが観測を行わず即時取得へ縮退する。表示は成立する | 49.8 の縮退。表示破綻より機能劣化を選ぶ |
| 原本画像の取得に失敗（拡大表示） | 既存のエラー表示を維持する。縮小表示用の画像で代替しない | 49.7 |

### Testing Strategy

**単体（バックエンド）**

- プロジェクト写真一覧: 現場調査3件・写真30枚でアクセス可否の判定が1回のみ呼ばれ、画像ごとの再照会が発生しないこと（49.9）／**注釈のない写真が応答へ含まれないこと**（Requirement 4.3, 19.2）／`displayUrl` が注釈付きサムネイル優先で解決され、応答に表示用URLが1件あたり1本しか含まれないこと（49.9）／上限を超えた場合に `hasMore` が真になり件数が上限で打ち切られること／プロジェクトへのアクセス権がない場合に拒否されること／並びが調査日降順・表示順昇順であること
- 写真サマリ: 数量表詳細の応答に実寸が含まれること（49.8）

**単体（フロントエンド）**

- `QuantityGroupCard`: 表題部へ渡す画像情報に実寸が含まれること（49.8）／サムネイルと合成済みサムネイルの優先順が維持されること（49.4, 49.5、実装済み・回帰固定）
- `PhotoPreviewDialog`: 拡大表示の表示元が合成済みサムネイルではなく原本になること、および即時取得が指定されること（49.7）
- `QuantityTableEditPage`: 写真選択ダイアログを開いたときに写真一覧APIを1回だけ呼び、現場調査詳細の取得が発生しないこと（49.9）／一覧の表示元が `displayUrl`（サムネイル解像度）であること（49.10）／`hasMore` が真のとき切り捨ての旨が提示されること／注釈付き写真が0件のとき注釈エディタでの編集を促す旨が提示されること

**E2E**

- 数量グループを多数持つ数量表の編集画面を開き、初期表示時点で発生した画像関連リクエストの合計がグループ数より少ないこと（49.2, 49.3, 49.8）。観測はパス基準で行う
- 写真選択ダイアログを開いたときに現場調査詳細への個別リクエストが発生しないこと（49.9）
- 注釈のない写真が写真選択ダイアログに現れないこと（Requirement 4.3, 19.2）。注釈を付けた写真のみが選択できることを実操作で確認する

### Migration Strategy

**順序制約**: 49.8 の成立は site-survey の共有コンポーネント改修（同スペック Task 111.3）の完了を前提とする。実寸の供給を先行して行っても表示は変わらず、害はない。

**他スペックへの依存の扱い（設計レビューでの是正）**: 本スペックの作業は実寸の供給のみであり、それだけでは表示領域外の取得は止まらない。したがって **49.8 の検証タスクは site-survey の Task 111.3 完了までブロック扱いとする**。タスク生成時に当該依存を明記し、未完了の間は検証タスクへ `_Blocked:_` を付す。本スペックのタスクをすべて完了しても、この依存が解消されるまで 49.8 は未達であることを、タスク側で可視化する。

1. バックエンドの実寸供給とフロントエンドの受け渡しを先行して反映する（単独で安全）
2. 共有コンポーネントの観測導入が完了した時点で 49.8 が成立する
3. 写真一覧エンドポイントと拡大表示の是正は上記と独立に反映できる

**ロールバック**: 実寸の供給と拡大表示の是正は既存フィールドを削除せず、応答の追加とフロントエンドの表示元変更に留まるため個別にリバート可能である。

**利用者への影響を伴う変更**: 写真選択ダイアログの対象を注釈付きのみへ絞る変更は、利用者から見える挙動が変わる唯一の項目である。注釈を付けずに写真を紐づける運用が存在する場合は影響を受けるため、反映前に運用実態を確認する。要件（4.3 / 19.2）への追従であり、要件側の改定は行わない。
