# Gap Analysis: construction-photo（工事写真）

要件（requirements.md 13要件）と既存コードベースの実装ギャップ分析。設計フェーズの実装戦略決定を目的とする。

## 分析サマリ
- **グリーンフィールド確認済み**: 工事写真・工事看板に該当するモデル／ルート／サービス／コンポーネントはリポジトリ全体で **0件**。ただしブラウンフィールドの既存資産（site-survey＝現場調査）がほぼ完全な雛形として存在する。
- **再利用可能な基盤が厚い**: ストレージ `copy()`、Sharp合成（`annotated-thumbnail.service`）、バッチ署名URL、jsPDF＋日本語フォント＋3枚/ページレンダラ、fabric矩形ツール、カメラ入力（`capture="environment"`）、二重マウント＋モジュールDIのルート規約、一覧のResponsive/Table/Card/Filter部品群。
- **新規構築（GAP）の中心**: 3モデル、2ルータ＋サービス、**工事看板SVG生成＋オーバーレイ合成**、**台帳PDF（表紙＋通しNo.）**、看板配置UI（fabric）、`constructionPhotos` サマリ結線、現調写真コピーフロー。
- **推奨アプローチ**: **Option C（ハイブリッド）** — ドメイン層は site-survey から複製・派生した独立実装（安定性優先）、基盤層（ストレージ／Sharp／署名URL／フォント／fabric primitives／multer）は直接再利用。
- **総合見積**: 規模 **XL（2週間超）**、リスク **中**（パターンは既存だが、看板SVG／PDF台帳の書式再現とプレビュー→原本→PDFの座標変換が要検証）。

---

## 1. 要件 → 資産マッピング（GAPタグ: 再利用 / 新規 / 制約 / 要調査）

| 要件 | 既存資産（再利用） | GAP（新規構築） |
|---|---|---|
| **R1 アルバムCRUD** | `SiteSurveyService`(site-survey.service.ts)、楽観的排他=`updatedAt`、論理削除=`deletedAt` | **新規**: `ConstructionPhotoAlbum` モデル＋サービス |
| **R2 ナビ/パネル** | `ProjectDetailPage.tsx` パネル群、Breadcrumb、`routes.tsx` 二重ルート規約 | **新規**: `ConstructionPhotoSectionCard`（**工程表=`ScheduleSectionCard` の直下**に挿入。現状 Schedule が最終カード ≒ L797-802 の後、L804 の Dialog 前）、サマリ結線 |
| **R3 一覧・検索** | `SiteSurveyResponsiveView/ListTable/ListCard/SearchFilter`、ページ`limit=50` | **新規**: 上記4部品のクローン、`getConstructionPhotos` API |
| **R4 ローカルUP** | `ImageUploadService.upload/uploadBatch`、`ImageProcessorService`(Sharp)、`utils/image-compression.ts` | **制約**: 既存は `surveyId` キー固定 → `albumId` へ汎用化（新規サービスとして複製） |
| **R5 カメラ撮影** | `ImageUploader.tsx` の `cameraInputRef`（`type=file accept=image/* capture="environment"` L518-525）そのまま流用可 | **新規**: アップロード先アルバムの結線のみ |
| **R6 現調コピー** | `StorageProvider.copy(src,dst)`（interface に既存）でバイト複製可（DL/再UP不要） | **新規**: コピー元選択UI（同一プロジェクトの `SurveyImage` 読取）＋新キー命名＋独立`ConstructionPhoto` insert |
| **R7 項目管理** | `ImageMetadataService.updateMetadataBatch`、`ImageOrderService.updateImageOrder`、`PhotoManagementPanel.tsx`（コメント500msデバウンス／未保存→手動保存／並び替え） | **新規**: パネル・APIのクローン |
| **R8 看板マスタ** | CRUDの型は `company-info`/`trading-partner`（プロジェクト/会社スコープmaster）を参考 | **新規**: `ConstructionSignboard` モデル（工事件名/工事場所＋自由項目行JSON＋下部固定テキスト）、CRUD ルート/サービス、一覧UI、**電子小黒板SVGレンダラ**（`generateSvgFromAnnotation` の類似実装） |
| **R9 看板配置** | fabric 矩形ツール群（`tools/RectangleTool.ts`、`AnnotationEditor.tsx`、`useCanvasViewport.ts`）で可動・拡縮 Rect 実現可 | **新規**: 看板配置コンポーネント（1枚の緑ボードRect限定）、`ConstructionPhoto` 側に nullable `signboardId` ＋配置geometry(JSON) 保持 |
| **R10 PDF台帳** | `PdfReportService`（`renderCoverPage` L248 / `renderImagesSection3PerPage` L554 / `renderComment` L517）、`PdfFontService`（NotoSansJP埋込, `initializePdfFonts` L171）、Sharp合成で看板焼込 | **新規**: 台帳サービス（**表紙: 「工事写真」＋工事名＋工事施工者**、**No.通し番号**、**1ページ3枠・左写真/右No.+コメント欄**、余白枠、看板合成）。**制約**: 既存3枚/ページの版組と参考台帳のセル構成に差 → 版組の作り込み要 |
| **R11 リクエスト効率** | 既存 site-survey の実装がそのまま体現（ページ50、写真一覧＋署名URL一括取得＝N+1回避、サムネ優先、保存=メタ一括+順序の最大2req、UP並列5、署名URL TTL=900s） | 低GAP: 新サービスでも同方針を踏襲するだけ |
| **R12 UP制約** | multer `upload.array('images',10)`＋`fileSize 10MB`、magic-byte検証(`validateFile`) | **新規**: 新ルートへ同設定適用 |
| **R13 アクセス制御** | 認証ミドルウェア、プロジェクトスコープ確認、署名URL配信（公開パス禁止） | **新規**: 新リソースへプロジェクトスコープ検証適用 |

---

## 2. 主要な統合ポイント（具体）

### データモデル（`backend/prisma/schema.prisma`）
- 雛形: `SiteSurvey`(L452-470)／`SurveyImage`(L500-523)／`ImageAnnotation`(L540-551, `imageId @unique` の1:1)。
- 規約: `id String @id @default(uuid())`、`projectId` は `@relation(..., onDelete: Cascade)`、`deletedAt DateTime?` 論理削除、`displayOrder Int`、`comment String?`、`includeInReport Boolean @default(false)`、`@@index` 複数、`@@map("snake_case")`。
- 新規3モデル案: `ConstructionPhotoAlbum`(≒SiteSurvey)／`ConstructionPhoto`(≒SurveyImage＋`signboardId String?`＋`signboardPlacement Json?`)／`ConstructionSignboard`(projectId、`workName`/`workLocation`、`freeItems Json`、`footerText String?`)。

### バックエンド結線（`backend/src/app.ts`）
- 二重マウント規約（L331/332, L335/336）: `/api/projects/:projectId/construction-photos` ＋ `/api/construction-photos`、`/api/construction-photos/:id/images` ＋ `/api/construction-photos/images` を追加（import ~L33、mount ~L337）。
- DIはルートファイル内モジュール単位シングルトン（`getPrismaClient()`、`getStorageProvider()`、各サービス `new`）。

### 画像基盤（`backend/src/services/`）
- `signed-url.service.ts`: `generateBatchSignedUrls(imageIds, userId, 'original'|'thumbnail', expiresIn=900)`（L280, TTL既定900s）。
- `annotated-thumbnail.service.ts`（**看板合成の直接雛形**）: `sharp(originalBuffer).rotate(r).composite([{input: svgBuffer, top:0, left:0}]).jpeg().toBuffer()`（L308-316）。SVG文字列を `Buffer.from` して合成 → 看板は「SVGで電子小黒板を生成し指定位置に composite」で実現可能。

### ストレージ（`backend/src/storage/`）
- `StorageProvider` に `copy(sourceKey, destinationKey)` が既存（孤立ファイル移動用に追加済）。現調写真コピーは `copy(original), copy(thumbnail)` ＋ 新規行 insert で完結。

### フロント
- カメラ: `ImageUploader.tsx` L518-525 をそのまま流用。
- PDF: `PdfReportService.ts`（`renderCoverPage`/`renderImagesSection3PerPage`/`renderComment`）＋`PdfFontService.ts`。画像は `doc.addImage(dataUrl,'JPEG',...)`。
- 配置プレビュー: `components/site-surveys/` の fabric 群（`AnnotationEditor.tsx`, `tools/RectangleTool.ts`, `useCanvasViewport.ts`）。
- サマリ: `backend/src/routes/projects.routes.ts` `GET /:id/detail-summary`(L432, 返却 L357-382)に `constructionPhotos` 節を追加。frontend `api/projects.ts` `ProjectDetailSummary.sections`(L405-411) に型追加。
- ルート/一覧: `routes.tsx` site-survey ブロック(L165-196)を `/construction-photos` で複製。部品群 `SiteSurveyResponsiveView/ListTable/ListCard/SearchFilter` をクローン。

---

## 3. 実装アプローチ（A/B/C）

### Option A: 既存サービスを拡張（surveyId→汎用化）
既存 image-*.service を `surveyId` から汎用エンティティIDへ拡張し、site-survey と共用。
- ✅ 新規ファイル最小、真の重複が少ない
- ❌ 安定稼働中の site-survey へ広範な変更＝回帰リスク大（メモリ: 「挙動変更後は全単体スイート」）。2スペックが密結合し境界が曖昧化。**非推奨**

### Option B: 完全新規（clone）
モデル・サービス・UIすべてを site-survey から複製して独立実装。
- ✅ site-survey に手を入れず回帰ゼロ、境界が明快
- ❌ 画像パイプライン等の真の基盤まで重複

### Option C: ハイブリッド（**推奨**）
- ドメイン層（3モデル、2ルータ＋サービス、一覧/詳細/管理UI、台帳PDF、看板SVG）＝ **新規（Bを踏襲）**。
- 基盤層（`StorageProvider`、`ImageProcessorService`/Sharp、`SignedUrlService`、`PdfFontService`、fabric primitives、multer設定）＝ **直接再利用（拡張なし or 薄い共有ヘルパ）**。
- ✅ 回帰リスク最小＋真の重複回避のバランス。境界クリーン。
- ❌ 計画の粒度管理が必要（どこまで共有ヘルパ化するかの線引き）。

---

## 4. 見積（Effort / Risk）

| 領域 | Effort | Risk | 根拠 |
|---|---|---|---|
| 3モデル＋マイグレーション | S | 低 | 既存規約の複製 |
| アルバム/写真 CRUD・一覧・詳細（R1,3,7） | M | 低 | site-survey 複製 |
| アップロード3系統（R4,5,6） | M | 中 | カメラは流用可、現調コピーはキー命名/metadata再取得の検証要 |
| 工事看板マスタ＋SVGレンダラ（R8） | L | 中 | 電子小黒板の版組をSVGで新規作成 |
| 看板配置UI＋geometry（R9） | M | 中 | fabric流用だが座標系設計が要 |
| 台帳PDF（表紙/通しNo./3枠/看板合成）（R10） | L | 中 | 参考書式の再現と座標変換 |
| サマリ結線・パネル・アクセス制御（R2,11,12,13） | S–M | 低 | 既存パターン適用 |
| **総合** | **XL** | **中** | 単体は既存パターン、統合広範＋書式再現に検証コスト |

---

## 5. 設計フェーズへの申し送り

### 推奨する主要決定
1. **アプローチ = Option C**。基盤は再利用、ドメインは独立新規。site-survey は改変しない（読取のみ）。
2. **看板の関係**: `ConstructionPhoto` に nullable `signboardId` ＋ 配置 `Json`（位置・サイズ）。看板本体はプロジェクト単位master（`ConstructionSignboard`）。
3. **看板合成の場所**: PDF/焼込は **サーバ Sharp composite**（原本高解像度・高品質、`annotated-thumbnail` 方式）を推奨。プレビューは **クライアント fabric**。→ **SVG生成ロジックをサーバ/クライアントで共有できる形**にする設計を検討。
4. **写真項目コメント と 看板下部欄は独立**: コメント=PDF右欄（R10）、看板下部＝マスタ登録の固定テキスト（R8）。混同しない。

### 要調査（Research Needed）— 設計で確定
- **台帳PDFの正確な版組**: A4寸法、写真枠と右カラム（No.見出し＋点線罫線コメント欄）の座標・比率、余白枠の描画、既存 `renderImagesSection3PerPage` との差分。
- **電子小黒板SVGの版組**: 濃緑地・白罫線・「工事件名/工事場所」行＋自由項目行＋下部固定テキスト欄のレイアウトとフォント。
- **座標変換**: プレビュー座標 → 原本画像座標 → PDF座標 のスケール変換方式（看板位置・サイズの再現）。
- **現調写真コピー**: 新ストレージキー命名規則、`copy()` 後の `width/height/fileSize` 再取得要否（バイト複製のみでmetadataは既存値流用可か）。
- **表紙「工事施工者」**: `company-info`（会社名）→ プロジェクト → 表紙 の取得経路。「工事名」の出所（プロジェクト名 or アルバム名）。
- **入力制限**: 看板下部固定テキストの最大長・改行、自由項目の最大行数。

---

# Design Discovery (light) & Synthesis — 2026-07-27

## 追加調査で確定した具体インターフェース
- **PDF寸法**: jsPDF A4縦・mm単位（`PdfExportService.ts:196-200`）。`renderImagesSection3PerPage`(L554) は既に「左写真(幅比0.45)＋右コメント欄(幅比0.45)、No.見出し＋下線＋点線8本(6.5mm間隔)、行高75mm」で参考台帳と一致。`renderComment`(L517) は最大5行。
- **表紙**: 既存 `renderCoverPage`(L248) は枠線・施工者行なし → **新規カバーレンダラを実装**（外枠＋「工事写真」＋工事名＋工事施工者）。
- **工事施工者/工事名の出所**: `Project` に会社FKなし。工事施工者=会社名は `CompanyInfoService.getCompanyInfo()`（シングルトン自社, `companyName`）。工事名=`Project.name`（またはアルバム名）。
- **アップロード**: `ImageUploadService.upload({surveyId,file,displayOrder?})`→`UploadResult`。width/height/fileSize は `ImageProcessorService.processImage()`（Sharp metadata）由来。キー `surveys/${id}/${ts}_...` / `..._thumb_...`。→ 工事写真は `construction-photos/${albumId}/...`。
- **メタ/並び替え**: `updateMetadataBatch(inputs)`（comment/includeInReport/displayOrder, MAX_COMMENT_LENGTH=2000, 正規化1..n, トランザクション）＋ `updateImageOrder(id, orders[])`。→ 保存は最大2リクエスト（R11.4）。
- **署名URL**: `generateBatchSignedUrls(ids,userId,'original'|'thumbnail',expiresIn=900)`。
- **看板SVG雛形**: `generateSvgFromAnnotation(data,w,h)`（画像ピクセル座標で `<rect .../>` 生成, viewBox=画像実寸）→ sharp `composite([{input:svgBuffer,top:0,left:0}])`。**看板SVGジェネレータはこの版組を流用**。
- **配置座標**: fabric Rect は絶対 `left/top/width/height`（画像ピクセル空間, scale/angle は非永続）。→ `signboardPlacement = {left,top,width,height}` を画像ピクセル座標で保持。
- **ストレージcopy**: `StorageProvider.copy(src,dst)`（local=`fs.copyFile`, 原本保持, dst自動作成）。現調コピーは copy(original)+copy(thumbnail)＋独立行insert。width/height/fileSize は複製元をそのまま流用可（バイト同一）。
- **detail-summary**: `getProjectSections()` の `Promise.allSettled([...x7, executionBudget])` に `constructionPhotoService.findLatestByProjectId` を追加、返却に `constructionPhotos:{totalCount,latest...}` を同型で追加。
- **認可**: `authenticate` + `requirePermission('<resource>:<action>')` + `validate()`。プロジェクトメンバーシップ専用ガードは**無い**（RBAC権限ベース）。→ `construction_photo:*` / `construction_signboard:*` 権限を定義。

## シンセシス（3レンズ）
1. **一般化**: (a) ローカル/カメラは同一アップロード経路（`ImageUploader` の file/camera input）で1経路に集約。現調コピーのみ別経路（`storage.copy`）。→ `ConstructionPhotoImageService` に `addFromUpload()` と `addFromSurveyImage()` の2メソッド。(b) 看板の描画版組は1箇所（SVGジェネレータ）に集約し、サムネ合成とPDF印字画像の双方が同一SVGを使う。
2. **Build vs Adopt**: Adopt=jsPDF 3枚/ページ版組・PdfFontService・sharp composite・fabric primitives・multer・署名URL。Build=電子小黒板SVGジェネレータ（既製なし）、台帳カバーレンダラ（枠付）、看板配置エディタ（1枚の緑Rect限定）。
3. **簡素化**: 汎用オーバーレイエンジンは作らない（写真1枚に看板0..1）。配置は full fabric JSON でなく `{left,top,width,height}` のみ。site-survey サービスは**拡張せず独立クローン**（安定性優先）。看板は写真1:0..1（`signboardId` nullable, `onDelete: SetNull`）。

## 主要設計判断
- **看板合成はサーバ権威かつオンデマンド**（validate-design の Critical Issue 1 で確定）: `compositedPath` は保存しない。PDF出力時のみ、写真ごとに `GET images/:id/print-image` を呼び、サーバが原本へSVGを sharp composite（看板なしは原本）してストリーム返却。看板マスタ編集・配置変更でも常に最新、キャッシュ無効化不要。プレビューはクライアント fabric でライブ編集（近似表示）、SVG版組はサーバ権威。
- **座標系**: プレビュー表示座標→画像ピクセル座標（scale=naturalWidth/renderedWidth）で保存。合成・PDFは画像ピクセル座標のまま（原本に焼込むためPDF側の追加変換不要）。

---

# ギャップ分析: 追加7機能（Requirement 14〜19）

_作成: 2026-07-28 / `/kiro-validate-gap` による。既存 construction-photo 実装（一巡済）に対し、要件追記分（Req14〜19＋Req1/16の導線）を対象とする。_

## 1. 現状サマリ

- バックエンドは CP の CRUD・print画像（看板重畳オンデマンド）・RBAC（`construction_photo:read/create/update/delete`）が整備済み。**新規バックエンド作業が原則不要**（機能2のみ後述の判断あり）。
- site-survey に本7機能の**参照実装がほぼ完備**（ビューア・ZIP・権限フック・離脱警告・レスポンシブ）。
- `PhotoItemPanel.tsx` は `readOnly` / `onPhotoClick` / `isDirty` を**プロップとして受理する設計**であり、多くが「ページ側の結線漏れを埋める」作業に帰着する。

## 2. 要件↔資産マップ（ギャップタグ: Missing / Constraint / Research）

| Req | 参照資産（既存パス） | CP側の現状 | ギャップ |
|---|---|---|---|
| 14 ビューア/ズーム/回転/パン | `pages/SiteSurveyImageViewerPage.tsx`, `components/site-surveys/ImageViewer.tsx`(90度回転内蔵), `ZoomControls.tsx`, `gestures/`, `hooks/useCanvasViewport.ts`, `utils/imageFitScale.ts` | `PhotoItemPanel` は `onPhotoClick` prop 保持済／DetailPage が未結線 | CPビューアルート無 **(Missing)**、onPhotoClick未結線 **(Missing)**、ImageViewerが注釈編集前提か＝閲覧専用流用可否 **(Constraint/Research)** |
| 15 ZIP一括エクスポート | `services/export/bulkExportService.ts`(JSZip/形式/解像度/annotationMode/進捗/AbortController), `zip-naming.ts`, `BulkExportDialog.tsx`/`BulkExportProgressDialog.tsx`/`ExportSettingsForm.tsx` | UI/サービス無。`api/construction-photo-images.ts#getConstructionPhotoPrintImage`(看板重畳Blob)は有 | `bulkExportService`が`SurveyImageInfo`型依存 **(Constraint)**、看板重畳/非重畳/原本の3モードとCP画像APIの対応 **(Research)** |
| 16 アルバム編集導線 | `pages/ConstructionPhotoEditPage.tsx`(実装済), route `/construction-photos/:id/edit`(定義済), `api#updateConstructionPhotoAlbum` | 一覧/詳細から編集画面への導線無 | 導線ボタン **(Missing／軽微)** |
| 16 アルバム削除導線 | `api#deleteConstructionPhotoAlbum`(有), backend `construction_photo:delete`(有) | 一覧/詳細にアルバム削除UI無（既存 `handleDelete` は写真項目削除） | 削除UI+確認ダイアログ **(Missing)**、共通 `DeleteConfirmDialog` が `common/` に無く `contracts/DeleteConfirmDialog.tsx` 等の流用可否 **(Constraint)** |
| 17 権限出し分け | `hooks/useSiteSurveyPermission.ts`(admin=全/ user=削除不可), `hooks/usePermission.ts`, backend RBAC 確立済 | CP用権限フック無・CPページで権限判定皆無。`PhotoItemPanel` は `readOnly` ガード実装済 | `useConstructionPhotoPermission` 新規 **(Missing)**、CPロール→権限の正確なマッピング **(Research)** |
| 18 未保存離脱警告 | `hooks/useUnsavedChanges.ts`(beforeunload+enabled), `components/common/UnsavedChangesDialog.tsx`。`SiteSurveyDetailPage` で `enabled: canEdit` 利用 | DetailPage は独自 `useState` で `isDirty` 追跡、beforeunloadガード無 | 既存isDirtyを `useUnsavedChanges` へ置換 **(Missing／軽微)** |
| 19 詳細画面モバイル | `utils/responsive.ts`(MEDIA_QUERIES), `hooks/useMediaQuery.ts`。一覧は `ConstructionPhotoResponsiveView.tsx` で対応済 | DetailPage/PhotoItemPanel は `useMediaQuery` 未使用（分岐無） | DetailPage/PhotoItemPanel にモバイル分岐 **(Missing)** |

## 3. 実装アプローチ（A/B/C）

### Option A: 既存資産へ結線・置換中心
site-survey資産とCP側の未結線プロップ（`onPhotoClick`/`readOnly`/`isDirty`）を繋ぎ込む最小改修。
- ✅ 最小差分・既存パターン踏襲・低リスク。導線(16)/離脱警告(18)/モバイル(19)/権限結線(17)に最適
- ❌ ビューア(14)・ZIP(15)は survey サービスが survey型に密結合で「結線だけ」では届かない

### Option B: CP専用に新規実装（独立クローン）
ビューア・ZIP・権限を CP 用に新規作成（survey実装をクローンして型差し替え）。
- ✅ survey側への影響ゼロ・CP要件に最適化。既存specの「site-surveyサービスは拡張せず独立クローン（安定性優先）」方針と整合
- ❌ 重複コード増。ZIPサービスの二重メンテ

### Option C: ハイブリッド（推奨）
- **結線で足りるもの（A）**: 16編集/削除導線、17権限（`readOnly`結線）、18離脱警告（フック置換）、19モバイル（`useMediaQuery`導入）
- **薄い新規＋汎用化（B）**: 14ビューア（`ImageViewer`を閲覧専用モードで流用し、CPビューアルート＋ページを新規）、15ZIP（`bulkExportService`の画像ソースをインターフェース抽象化 or CP専用サービスを新設し `zip-naming`/JSZip/進捗/中断は流用）、17は`useSiteSurveyPermission`を雛形に`useConstructionPhotoPermission`を新規
- ✅ 流用最大化＋survey安定性維持のバランス。既存設計判断（独立クローン方針）と一致
- ❌ ZIP画像ソース抽象化の設計判断が必要

## 4. 工数・リスク

| # | 機能 | 工数 | リスク | 根拠 |
|---|---|---|---|---|
| 14 | ビューア/ズーム/回転/パン | S〜M | 中 | ImageViewerがFabric注釈前提のため閲覧専用流用の切り分けが要検証。ルート/ページ追加は定型 |
| 15 | ZIP一括エクスポート | M | 中 | 画像ソース抽象化＋看板3モードとCP画像API（print/原本/非重畳）の対応設計が必要。UI一式は流用可 |
| 16 | 編集・削除導線 | S | 低 | EditPage/API/route完成済。導線ボタン＋削除確認のみ |
| 17 | 権限出し分け | S | 低 | 雛形あり。backend RBAC完備。ロールマッピング確認のみ |
| 18 | 未保存離脱警告 | S | 低 | 既存フック置換。survey で実績あるパターン |
| 19 | 詳細画面モバイル | S〜M | 低 | `useMediaQuery`導入とスタイル分岐。survey詳細の手本あり |

**全体感**: 集約で **M（3〜7日規模）**、主要リスクは 14/15 の2点に集中。

## 5. 設計フェーズへの申し送り（Research Needed）

1. **ZIP看板3モードのソース定義**: 「看板を重畳した画像」=`getConstructionPhotoPrintImage`（サーバ合成）／「原本そのまま」=原本Blob／「看板を重畳しない加工画像」=解像度変換した原本。**「非重畳の加工画像」に新規バックエンドパラメータが要るか、フロント再エンコードで足りるか**を設計で確定。
2. **ZIPアーキ判断**: `bulkExportService`を汎用画像ソースIF（`{id,name,getBlob(mode,resolution)}`等）へ抽象化して共有するか、CP専用サービスを新設するか。既存spec方針（独立クローン）との整合を取る。
3. **ビューア流用範囲**: `ImageViewer.tsx` を注釈非表示の閲覧専用モードで流用可能か、専用の軽量ビューアにするか。CPビューアのルート設計（例 `/construction-photos/:albumId/photos/:photoId`）。ビューアで看板重畳を表示するか（原本のみか）も要決定。
4. **CP権限マッピング確定**: `construction_photo:delete` が admin限定か（site-survey は user=削除不可）。seed/RBAC定義で確認し `useConstructionPhotoPermission` に反映。
5. **削除確認ダイアログの共通化**: `contracts/DeleteConfirmDialog.tsx` の流用可否、または `common/` へ汎用削除ダイアログを新設するか。

## 設計判断（追加7機能・Research項目の解決）

_`/kiro-spec-design` シンセシスで確定。design.md に反映済み。_

1. **ZIP看板3モードのソース定義**: `composited`=既存 `GET print-image`（サーバ合成）／`plain`=非合成原本を解像度変換／`original`=原本そのまま。解像度（低/中/高）・形式（JPEG/PNG）変換はフロント canvas 再エンコードで一元化。**訂正（task-graphサニティレビュー由来）**: 看板配置済み写真の生原本を得る配信路が既存に無い（DTOは `thumbnailUrl`/`printImageUrl` のみ、`originalUrl` は単体テストで明示禁止、`print-image` は看板ありだと必ず合成）ため、**非合成原本エンドポイント `GET .../original` を新設**（署名/権限/プロジェクト境界検証、一覧DTOは不変＝`originalUrl` を増やさない）。当初の「バックエンド変更ゼロ」前提は誤りで、この1エンドポイント追加が必要。R14（ビューア原本表示）とR15.4（plain/original）はこれで成立。
2. **ZIPアーキ判断**: `bulkExportService` は汎用化せず **CP専用 `ConstructionPhotoBulkExportService` を新設（独立クローン）**。既存spec方針「site-surveyサービスは拡張せず独立クローン（安定性優先）」と整合。JSZip・進捗callback・AbortSignal・zip命名はパターン流用。
3. **ビューア流用範囲**: `ImageViewer.tsx`（fabric注釈搭載・大型）はそのまま流用せず、**閲覧専用の薄い `ConstructionPhotoImageViewer` を新設**し、`useCanvasViewport`/`ZoomControls`/`gestures/*`/`imageFitScale` と回転ヘルパ（`normalizeRotation`/`ROTATION_CONSTANTS`）を合成。ルートは `/construction-photos/:albumId/photos/:photoId`。ビューアは**原本のみ表示**（看板重畳は印字/エクスポート時の関心事）。
4. **CP権限マッピング確定**: `useConstructionPhotoPermission` は**ロール直書きせず `usePermission('construction_photo:<action>')` で判定**（RBAC権限駆動）。canEdit=`:update`、canDelete=`:delete`。site-survey同様に user は削除不可となるが、判定はロールでなくバックエンド付与権限に従う。
5. **削除確認ダイアログ**: `projects/DeleteConfirmationDialog`（survey/estimate件数依存）・`contracts/DeleteConfirmDialog`（契約特化命名）とも汎用性不足のため、**FocusManagerパターンを踏襲した薄い `AlbumDeleteDialog` を新設**。

---

# Gap Analysis 追補③: Requirement 20（アップロード失敗時の撮影画像の保持と再送）

対象は 2026-08-08 に requirements.md へ追加された **Requirement 20**（および Boundary Context の In scope 3行・Out of scope 3行の追記）。既存の追補①（R1–13）・追補②（R14–19）は対象外とする。

## 分析サマリ

- **本要件のロジックは既に実装済み**。ブランチ `fix/photo-upload-retain-on-failure` で site-survey 側の同等要件（Requirement 37）が完了しており、その実装は**工事写真が内包する共有部品（`ImageUploader` / `usePendingUploads` / `PendingUploadPanel` / `apiClient.sendFormData`）に置かれている**ため、工事写真は結線済みのまま受益している。
- **工事写真固有の結線も完了済み**。`PhotoUploader` は失敗画像の実体（`File`）と再送可否区分を `UploadOutcome` として `ImageUploader` へ返しており（site-survey tasks 108.3）、`construction-photo-images.ts` の multipart 送信も共通クライアントへ統一済み（同 107.2）。
- **残る GAP は「検証」と「仕様文書」に限られる**。工事写真側の E2E が 0 件、design.md / tasks.md に Requirement 20 の記述が皆無（両ドキュメントは 7/29 生成で要件追加より前）。
- **推奨アプローチ**: **Option A（既存共有実装の追認＋検証・文書の追補）**。新規コードはほぼ不要で、E2E シナリオと要件トレース表の追加が主作業。
- **総合見積**: **S（1〜3日）／リスク 低**。ただし E2E は test 環境ビルドを伴うため実時間コストが支配的。

---

## 1. 要件 → 資産マッピング（GAPタグ: 再利用済 / 未検証 / 制約 / 要調査）

| AC | 充足状況 | 実装資産 |
|---|---|---|
| 20.1 失敗画像を未送信画像として保持 | **再利用済** | `ImageUploader.submitFiles` → `usePendingUploads.record`（`ImageUploader.tsx:345-383`）。工事写真側は `PhotoUploader.handleUpload` が `{failed}` を返却（`PhotoUploader.tsx:232-262`） |
| 20.2 件数・サムネ・ファイル名・失敗理由の表示 | **再利用済** | `PendingUploadPanel.tsx`（`pending-upload-count` / `-thumbnail` / `-filename` / `-reason`） |
| 20.3 再送可能分の一括再送 | **再利用済** | `ImageUploader.handleRetry`（`retriableFiles` のみ対象） |
| 20.4 同一画像データで再送（再圧縮しない） | **再利用済** | `submitFiles(files, compress=false)`。保持しているのは圧縮後 `File`（`attempted = filesToSend`） |
| 20.5 部分成功で成功分のみ除去 | **再利用済** | `usePendingUploads.record` の差分更新（`attempted` かつ非 `failed` を解放） |
| 20.6 全成功で表示解消 | **再利用済** | 同上 |
| 20.7 破棄の操作手段 | **再利用済** | `PendingUploadPanel` の `pending-upload-discard-button` |
| 20.8 破棄は確認の承諾時のみ | **再利用済** | `ImageUploader.handleDiscardAll` の `window.confirm(DISCARD_CONFIRM_MESSAGE)` |
| 20.9 新規選択・撮影でも既存保持を維持 | **再利用済** | `record` が「今回の試行に含まれない保持」を温存 |
| 20.10 実行中は追加の再送を受け付けない | **再利用済** | `isBusy = isUploading \|\| isRetrying`。工事写真は `PhotoUploader` が `isUploading` を伝播 |
| 20.11 認証期限切れは無操作で更新して継続 | **再利用済** | `ApiClient.request` の 401 リフレッシュ＋`refreshInFlight` 待ち合わせ。工事写真は `apiClient.sendFormData` 経由（`construction-photo-images.ts:120-123`） |
| 20.12 更新失敗は他機能と同一手段で通知 | **再利用済** | `sessionExpiredCallback` / `triggerSessionExpired`（`client.ts`） |
| 20.13 到達前失敗は段階的バックオフで自動再試行 | **再利用済** | `UPLOAD_RETRYABLE_STATUS_CODES = [0, 502, 503, 504]`＋`backoffMultiplier: 2`（1s→2s→4s） |
| 20.14 サーバー処理中の失敗は自動再試行しない | **再利用済** | 再試行対象を上記ステータスに限定（重複登録回避） |
| 20.15 1件あたり 120 秒の完了猶予 | **再利用済** | `UPLOAD_TIMEOUT_MS = 120000`（`sendFormData` の既定 timeout） |
| 20.16 受入条件違反を再送不可として区別 | **再利用済** | `classifyUploadFailure`（400/413=permanent、207 は文言分岐）。工事写真は応答 `failed[]` を `new ApiError(207, item.error)` へ組み立てて渡す（`PhotoUploader.tsx:116-121`）。**バックエンドは `constructionPhotoImageService` が `surveyImageService.validateFile()` を再利用（`construction-photo-image.service.ts:702`）しているため、`upload-failure.ts` が参照する形式エラー文言と一致する** |
| 20.17 再送不可は再送対象に含めない | **再利用済** | `usePendingUploads.retriableFiles`（`kind === 'retriable'` のみ） |
| 20.18 全件再送不可なら再送手段を実行不可で提示 | **再利用済** | `canRetry = retriableFiles.length > 0` ＋ `pending-upload-retry-unavailable` |
| 20.19 時間切れは自動再試行せず保持 | **再利用済** | `request()` が FormData ボディから再試行方針を導出し、タイムアウトは再試行対象外 |
| 20.20 時間切れ後の再送開始待ちを延伸させない | **再利用済** | 同上（自動再試行を回さないため待ち時間が積み上がらない） |
| 20.21 ストレージ保存失敗は再送可として保持 | **再利用済** | 207 の文言分岐で形式エラー以外は `retriable`（`upload-failure.ts:134-136`） |
| **全AC 横断** | **未検証（GAP）** | `e2e/specs/construction-photos/` に Requirement 20 のシナリオが **0件**（`未送信` / `再送` の grep ヒット無し）。site-survey 側は `site-survey-upload-retry-e2e.spec.ts`（594行）で 5 シナリオ検証済み |
| **全AC 横断** | **文書欠落（GAP）** | `design.md` / `tasks.md` に Requirement 20 の記述が **0件**。両ファイルは 2026-07-29 生成で、要件追加（08-08）より前 |

### 未充足 GAP の一覧

| # | GAP | 種別 | 内容 |
|---|---|---|---|
| G1 | 工事写真 E2E 未整備 | 未検証 | 失敗→保持→再送→解消／サイズ超過で再送不可／破棄確認の各シナリオが工事写真詳細画面で未検証。プロジェクト方針（要件はE2Eで動作確認するまで完了としない）に未達 |
| G2 | design.md に Requirement 20 の節が無い | 文書 | 共有部品への委譲・工事写真側の責務境界・現調コピー経路を対象外とする判断が設計として残っていない |
| G3 | tasks.md に Requirement 20 のタスク／カバレッジ表が無い | 文書 | 実装済みであること自体がトレースできない。`spec.json` は `phase: requirements-generated` のまま（design/tasks は `generated: true` だが要件追加以前の内容） |
| G4 | 要件番号の相互参照が無い | 文書 | 同一実装が site-survey 37.x と工事写真 20.x の2系統にマップされる。コード内コメントは 37.x のみを引用しており、工事写真の要件から実装へ辿れない |
| G5 | 工事写真経路の単体テスト範囲 | 未検証 | `PhotoUploader.test.tsx` は「失敗画像が未送信一覧に反映される」（20.1/20.16/20.21）まで。再送（20.3/20.4）・破棄（20.7/20.8）・実行中抑止（20.10）・全件 permanent（20.18）は `ImageUploader.test.tsx` 側の検証に依存し、工事写真の要件トレースとしては記録が無い |

### 制約・注意点

- **C1（構造）**: `ImageUploader` / `PendingUploadPanel` / `usePendingUploads` は `components/site-surveys/` 配下にあり、工事写真から cross-feature import している。`ConstructionPhotoImageViewer` が `site-surveys/ZoomControls` 等を import している前例と同型のため既存慣行とは整合するが、「site-survey 機能の部品を工事写真が使う」依存が1本増える。
- **C2（デッドパス）**: `uploadFilesInWaves` は 1リクエスト1ファイルで送信するため、R12.1（1リクエスト10件上限）による 400 は工事写真 UI からは到達しない。20.16 が挙げる「件数上限」条項は工事写真では実質デッドパスであり、E2E で再現できない。
- **C3（既知の脆さ）**: 207 の permanent/retriable 分岐はバックエンドのメッセージ文言に依存する（`upload-failure.ts` 冒頭に明記済み）。現時点では工事写真バックエンドが `surveyImageService.validateFile` を共有するため一致するが、工事写真が独自の検証メッセージを持ち始めた時点で静かに壊れる。
- **C4（権限との相互作用）**: 工事写真詳細画面は `canEdit` のときのみ `PhotoUploader` を描画する（`ConstructionPhotoDetailPage.tsx:846-855`）。編集権限を失って再描画されると `usePendingUploads` のアンマウント解放が走り、保持中の未送信画像が失われる。要件 20 と要件 17 の相互作用として明文化されていない。
- **C5（前段バリデーション）**: フロントの `MAX_FILE_SIZE_MB = 50` はサーバーの 10MB より緩い。したがって 10〜50MB の画像はサーバーへ到達して 413 となり、`permanent` として保持・提示される（20.16 が到達可能）。一方 50MB 超はフロントで弾かれ `validationErrors` 表示となり、未送信画像としては保持されない（20.1 の対象外）。この線引きは要件に書かれていない。

---

## 2. 統合ポイント（具体）

- **フロント結線（変更不要）**: `ConstructionPhotoDetailPage.tsx:846-855` → `PhotoUploader`（`albumId`/`projectId`/`onPhotosAdded`/`onNotify`）→ `ImageUploader`（`onUpload=handleUpload`, `isUploading`, `uploadProgress`, `compact`）。未送信画像パネルは `ImageUploader` の内部に描画されるため、詳細画面側の追加結線は不要。
- **API 層（変更不要）**: `uploadConstructionPhotos` → `apiClient.sendFormData('/api/construction-photos/:albumId/images', formData)`。20.11〜20.15/20.19/20.20 はここで自動的に効く。
- **バックエンド（変更不要）**: `construction-photo-images.routes.ts` は 全件成功 201 / 部分失敗 207（L359, L459）、`LIMIT_FILE_SIZE` → 413（L167-171）、件数超過等 → 400（L178）。`upload-failure.ts` の分類規則と噛み合っている。
- **E2E の追加先**: `e2e/specs/construction-photos/`（既存2ファイル）。雛形は `e2e/specs/site-surveys/site-survey-upload-retry-e2e.spec.ts`。観測用の testid は `pending-upload-panel` / `-count` / `-item` / `-thumbnail` / `-filename` / `-reason` / `-permanent-note` / `-retry-button` / `-discard-button` / `-retry-unavailable` が既に付与済み。

---

## 3. 実装アプローチ（Options）

### Option A: 既存共有実装の追認＋検証・文書の追補（推奨）
実装は現状のまま（工事写真は共有部品経由で 20.1〜20.21 を充足）とし、(1) 工事写真 E2E の追加、(2) design.md への Requirement 20 節の追補、(3) tasks.md への検証タスクと Requirements Coverage 表の追加、(4) 工事写真経路の単体テスト補強（G5）を行う。

- ✅ 新規プロダクトコードがほぼ不要。site-survey と挙動が一致するという Adjacent expectations（requirements.md L35）をそのまま満たす
- ✅ 共有部品の二重メンテを増やさない
- ❌ 工事写真の要件が site-survey 配下の部品に依存し続ける（C1）

### Option B: 保持・再送部品を共通レイヤへ移設してから検証
`ImageUploader` / `PendingUploadPanel` / `usePendingUploads` を `components/common/` 等へ移設し、site-survey・工事写真の双方から対等に参照する構造へ整える。

- ✅ 「site-survey の部品を工事写真が借りている」という依存の非対称を解消（C1）
- ❌ site-survey 側の広範なテスト・Storybook・import の書き換えが発生し、完了済み実装への回帰リスクを新たに作る
- ❌ 本要件の受入基準は1つも変わらない（純粋な構造リファクタ）

### Option C: 工事写真専用の保持・再送機構を新設（独立クローン）
既存 spec の「site-survey サービスは拡張せず独立クローン」方針を UI 層にも適用し、`ConstructionPhotoPendingUploads` 等を新設する。

- ✅ site-survey への影響ゼロ
- ❌ 「site-survey 側の同等要件と挙動が一致することを前提とする」（requirements.md L35）に真っ向から反し、挙動が乖離する温床になる
- ❌ 工数・二重メンテが最大。**非推奨**

---

## 4. 工数・リスク

| # | 作業 | 工数 | リスク | 根拠 |
|---|---|---|---|---|
| G1 | 工事写真 E2E（失敗→保持→再送→解消／再送不可／破棄） | S | 中 | 雛形（site-survey 594行）とtestidが揃っており記述は定型。リスクはE2E環境側（test環境ビルド必須・route差し替えのオリジン一致） |
| G2/G3/G4 | design.md / tasks.md / spec.json の追補 | S | 低 | 文書のみ。site-survey design.md の Requirement 37 節を工事写真の要件番号へ写像する |
| G5 | 工事写真経路の単体テスト補強 | S | 低 | `PhotoUploader.test.tsx` に再送・破棄・実行中抑止のケースを追加。既存 mock 構成をそのまま利用 |
| C4 | 権限喪失時の保持解放の扱いを設計で明記（必要なら是正） | S | 低 | まず設計判断。是正する場合も `canEdit` 判定箇所の局所変更 |

**全体**: **S（1〜3日）／リスク 低**。E2E の実行時間（pre-push は全件で約1.6時間）が実時間の支配要因。

---

## 5. 設計フェーズへの申し送り（Research Needed）

1. **要件番号の対応表をどこに置くか**: 同一実装が site-survey 37.x と工事写真 20.x にマップされる。design.md に「20.x ⇔ 37.x 対応表」を置き、コード内コメントの `37.x` 引用を工事写真から辿れるようにするか、コメント側に両番号を併記するかを決める。
2. **共有部品の置き場所（C1）**: Option A のまま `site-surveys/` に置き続けるか、`components/common/` へ移すか。移す場合は本要件の外（別要件）として切り出すのが安全。
3. **権限喪失時の未送信画像の扱い（C4）**: 編集権限を失った際に保持中の画像を解放してよいか、警告して残すか。要件 17.1（編集権限なしは操作手段を表示しない）と 20.1（保持する）のどちらを優先するかを設計で確定する。
4. **フロント 50MB / サーバー 10MB の乖離（C5）**: 「フロントで弾かれた画像は未送信画像として保持しない」を仕様として明記するか、保持対象に含めるか。site-survey 側では「上限値そのものの是正は別要件」と整理済みのため、工事写真も同じ整理を踏襲するかを確認する。
5. **現調コピー経路を対象外とする根拠の明記（G5関連）**: 備考1 のとおり Requirement 6 は対象外だが、`PhotoUploader.handleSurveySelect` は失敗時に保持を行わない設計であることを design.md に明記し、将来「コピーも保持すべき」という誤った回帰修正が入らないようにする。
6. **E2E 実装時の環境前提**: E2E は test 環境（フロント 5174 / API 3100）を用い、フロントは本番ビルドのため `test:docker:build` が必須。応答差し替えの観測はオリジンではなく**パス基準**で行う（CI は `VITE_API_URL=localhost:3000`、`API_BASE_URL=127.0.0.1:3000` でオリジンが食い違い、オリジン依存の観測は全件素通りする）。固定時間待機は用いず明示的な条件待ちのみで構成する。

## 設計判断（Requirement 20・Research項目の解決）

_`/kiro-spec-design` シンセシスで確定。design.md に反映済み。_

**シンセシスの3レンズ**

1. **一般化**: R20（工事写真）と site-survey R37 は「画像送信の失敗を、送信元機能に依らず画像の実体ごと保持して再送する」という同一問題である。一般化は既にコードベースで達成されており、機能非依存の機構（`ImageUploader` / `usePendingUploads` / `PendingUploadPanel` / `upload-failure` / `types/upload.types` / `ApiClient.sendFormData`）と、機能固有の送信アダプタ（`onUpload` が `UploadOutcome` を返す契約）に分離されている。**一般化はインターフェースで達成済みであり、実装の複製は不要**。
2. **Build vs Adopt**: 既存の共有機構を全面採用する。工事写真専用の保持機構を新設すると requirements.md L35（site-survey と挙動が一致することを前提とする）に真っ向から反する。再試行・バックオフ・送信猶予・401 リフレッシュも既存 `ApiClient` が提供しており、外部ライブラリの追加は不要。
3. **簡素化**: R20 に対する新規プロダクトコンポーネントは **ゼロ**。設計作業は「境界の明文化」「検証の追加」「要件番号の対応表」に限られる。共通レイヤへの移設（追補③ Option B）は受入基準を1つも変えず、完了済み実装への回帰リスクのみを生むため本 spec では採らない（Non-Goals へ明記）。

**Research Needed 6項目の解決**

1. **要件番号の対応表の置き場所**: design.md の Requirements Traceability 直下に「Requirement 20 と site-survey Requirement 37 の対応」表を置く。**コードコメントへの両番号併記は行わない**（共有部品の所有は site-survey にあり、併記すると所有が曖昧になる）。工事写真からの追跡は本表を経由する。
2. **共有部品の置き場所**: `components/site-surveys/` に置いたまま利用する（追補③ Option A）。依存の向きは `components/construction-photos/* → components/site-surveys/*` の一方向のみに固定し、逆向きを禁止として Allowed Dependencies に明記。既存の `ConstructionPhotoImageViewer → site-surveys/ZoomControls` と同じ向きで前例と整合する。
3. **権限喪失時の未送信画像の扱い（R17 × R20）**: **R17.1 を優先**し、`canEdit` が false になった時点で `PhotoUploader` がアンマウントされ保持が解放される現行挙動を設計として確定する。根拠は、編集権限のないユーザーが再送してもバックエンドが 403 で拒否するため保持しても再送が成立せず、「再送できるはず」という誤った期待を生むこと。
4. **フロント50MB／サーバー10MB の乖離**: **フロント前段検証で弾かれた画像は「送信を試行していない」ため 20.1 の対象外**とし、従来どおり `validationErrors` として提示する。サーバー上限超過（10MB超〜50MB以下）はサーバーが 413 を返し `permanent` として保持・提示する（20.16 が到達可能）。上限値そのものの是正は Out of Boundary（site-survey 側で「別要件」と整理済みの方針を踏襲）。
5. **現調コピー経路を対象外とする根拠**: `handleSurveySelect` は画像バイトを送信せず、サーバー側の `storage.copy` を要求するだけであるため保持・再送の対象としない（requirements.md 備考1）。将来「コピーも保持すべき」という誤った回帰修正が入らないよう design.md の Key Decisions に明記した。
6. **E2E の環境前提**: テスト環境（frontend 5174 / backend 3100 / postgres 5433）を用い、フロントは本番ビルドのため事前ビルドが必要。応答差し替えの観測は**パス基準**（オリジン基準にすると CI とローカルで API オリジンが食い違い観測が全件素通りする）。固定時間待機は用いない。design.md の E2E 節に前提として記載。

**追加の設計判断**

7. **件数上限の到達不能パス（追補③ C2）**: `uploadFilesInWaves` は1リクエスト1ファイルで送信するため、R12.1 の件数上限に起因する 400 は工事写真 UI から発生しない。20.16 が挙げる3条件のうち工事写真で到達するのは「サイズ上限」「画像形式」の2経路のみであることを design.md に明記し、**到達不能な経路の検証は行わない**（前提条件でテストを無効化する構成を作らないため）。
8. **通知と保持の併存**: R12.5 の失敗通知（画面が生成）と R20 の保持（`ImageUploader` が実施）は独立した関心事として併存させ、片方が他方を代替しない。既存の通知文言・表示条件は変更しない（挙動保存）。
9. **バックエンド変更なしの確認**: `constructionPhotoImageService` が `surveyImageService.validateFile()` を再利用しているため（`construction-photo-image.service.ts:702`）、207 の恒久／一時分類が参照する形式エラー文言が一致する。R20 に伴うバックエンド・スキーマ・API コントラクトの変更は発生しない。ただし当該文言の変更は分類を静かに壊すため Revalidation Trigger に登録した。

## 設計レビュー指摘の反映（Requirement 20）

_`/kiro-validate-design` の Critical Issues 3件を design.md へ反映（2026-08-09）。_

1. **文言依存の permanent 判定に回帰検知がなかった**: `construction-photo-image.api.integration.test.ts:253-254` は `failed[].fileName` しか検証しておらず、207 応答のメッセージ本文がフロントの判定断片（`UNSUPPORTED_FORMAT_MESSAGE_FRAGMENTS`）に一致し続ける保証がなかった。→ Integration Tests に「形式エラー文言の契約」項目を追加。判定断片はフロントを唯一の情報源とし、テスト側で文字列を再定義しない。エラーコード化による恒久解は `survey-image.service` の変更を伴うため Out of Boundary とし、本項目を移行までの回帰検知とする。
2. **E2E の要件ラベルが観測内容を超えていた**: 「通信障害→復旧→再送成功」シナリオに 20.13（段階的バックオフの自動再試行）を付していたが、実際に観測しているのは 20.3（ユーザー操作の再送）。→ ラベルを 20.1/20.3/20.5/20.6 へ訂正し、20.13 を主張する場合はリクエスト回数2回以上の観測を条件とした。あわせて「R20 の検証責務の切り分け」表を追加し、E2E で観測できる基準（20.1〜20.3, 20.5〜20.8, 20.16〜20.18）と、共有クライアントの単体テストでのみ観測できる基準（20.11〜20.15, 20.19, 20.20）を明示的に分離した。
3. **部分成功後の通知例外で重複登録が起こりうる経路が未記述だった**: `ImageUploader.submitFiles` の catch は試行対象の全ファイルを保持へ回すため、`onPhotosAdded` が例外を投げると登録済みの画像まで未送信画像として保持され、再送で重複登録される。`uploadFilesInWaves` 自体は例外を投げないため、`handleUpload` が reject しうるのは通知経路のみ。→ 送信アダプタの Invariants に「通知の例外を送信の失敗として扱わない」を追加し、単体テスト項目（成功画像が保持されないこと）も追加した。現行の `handlePhotosAdded` は純粋な state 更新であり発生確率は低いが、R20.14 の不変条件をアダプタ層でも維持するため明文化した。
