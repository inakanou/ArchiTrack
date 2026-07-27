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
