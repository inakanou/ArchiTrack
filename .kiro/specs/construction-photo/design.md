# Technical Design: construction-photo（工事写真）

## Overview

本機能は、工事案件のプロジェクトに紐付く工事写真（写真＋コメント＝「写真項目」）をアルバム単位で管理し、印刷対象を選別して工事看板を重畳した工事写真台帳PDFを出力する機能を提供する。写真項目は3系統（ローカルアップロード／カメラ撮影／同一プロジェクトの現場調査写真のコピー）で追加でき、並び替え・印刷対象チェック・工事看板の配置ができる。

**Users**: 施工管理担当者が、現場写真の整理と提出用台帳作成のワークフローで利用する。

**Impact**: 既存の現場調査（site-survey）機能を改変せず、その実装パターン（画像パイプライン・署名付きURL・fabric・jsPDF台帳）を再利用した独立ドメインを新設する。プロジェクト詳細画面に工事写真パネルを工程表パネルの直下へ追加する。

### Goals
- 工事写真アルバムのCRUD・一覧・詳細と、写真項目の3系統追加・管理を提供する。
- プロジェクト単位の工事看板（電子小黒板調・構造化テキスト）を写真項目へ任意で配置し、PDFに重畳する。
- 参考書式（表紙＋1ページ3枠・No.通し番号）に準拠した台帳PDFを出力する。
- 多数写真でもサーバーリクエストが過大にならない（一覧50件ページング・一括取得・保存最大2リクエスト・アップロード並列5）。
- 詳細画面の運用機能を site-survey と同等に拡充する: 画像フルスクリーンビューア（ズーム・回転・パン）、ZIP一括エクスポート、アルバム編集・削除導線、権限に応じたUI出し分け、未保存離脱警告、モバイル対応（R14〜R19）。
- 写真項目のアップロードが失敗しても撮影・選択した画像を画面に保持し、再圧縮せずその場で再送できるようにする。認証期限切れからは無操作で復帰し、到達前の通信障害は自動再試行する（R20）。

### Non-Goals
- site-survey 機能自体の仕様変更（読取・コピー元参照のみ）。
- 工事看板の画像アップロード形式（構造化テキスト描画のみ）、会社横断の看板共有。
- 現調写真のリンク（共有参照）方式（コピー＝独立複製のみ）。
- サーバサイドPDF生成への移行（クライアント jsPDF を踏襲）。
- 未送信画像の端末ローカル保存（画面リロード・タブ再起動をまたぐ復旧）、およびオフライン中の自動キュー送信（R20 の Out of scope）。
- 未送信保持・再送機構そのものの実装および共通レイヤへの移設。当該機構は site-survey spec の Requirement 37 が所有し、本 spec は利用のみを行う。
- 画像アップロードのサイズ上限値（フロント50MB／サーバー10MB）の乖離の是正。本 spec は乖離を前提に失敗を区分・提示するにとどめる。

## Boundary Commitments

### This Spec Owns
- データ: `ConstructionPhotoAlbum` / `ConstructionPhoto` / `ConstructionSignboard` の3モデルと関連ストレージオブジェクト（`construction-photos/` プレフィックス）。
- API: `/api/(projects/:projectId/)construction-photos*`、`/api/construction-photos/:id/images*`、`/api/(projects/:projectId/)construction-signboards*`。
- 電子小黒板SVGの版組と、看板を原本へ焼き込む合成（印字用画像生成）。
- 台帳PDF（表紙レンダラ＋3枠版組＋No.通し番号）のクライアント生成ロジック。
- プロジェクト詳細サマリへの `constructionPhotos` セクション寄与（自セクションのデータのみ）。
- 工事写真詳細の画像ビューア（ズーム/回転/パン, 閲覧専用）と、写真項目画像のZIP一括エクスポート（クライアント生成, 形式/解像度/看板重畳モード/選択/進捗/中断）。
- 工事写真詳細・一覧のアルバム編集/削除導線、権限（`construction_photo:*`）に応じたUI出し分け、未保存離脱警告、詳細画面のモバイルレイアウト。
- 看板配置有無に関わらず**非合成の原本画像をオンデマンド配信するエンドポイント**（ビューア表示・ZIPの `plain`/`original` モード用）。一覧DTOには `originalUrl` を含めない（既存の効率・非公開方針を維持し、原本は専用エンドポイントで必要時のみ取得）。
- 工事写真の**アップロード送信アダプタ**（`PhotoUploader`）— 並列ウェーブ送信の集約結果に失敗画像の実体（`File`）と再送可否区分を含めて返す責務、および 207（部分失敗）応答を再送可否判定へ渡せる形へ組み立てる責務（R20.1, R20.16, R20.21）。
- 工事写真画面における R20 の受入検証（写真項目追加経路の単体テストと E2E シナリオ）。

### Out of Boundary
- site-survey の `SiteSurvey`/`SurveyImage`/`ImageAnnotation`（読取のみ。書込・スキーマ変更は行わない）。
- `CompanyInfo`（会社名は読取のみ）、`Project`（`name` 読取・パネル結線のみ）。
- 共通画像基盤（`ImageProcessorService`/`SignedUrlService`/`StorageProvider`/`PdfFontService`）の内部実装（利用のみ、拡張しない）。
- **未送信画像の保持・再送・破棄の機構本体**: `components/site-surveys/ImageUploader`（保持と再送・破棄の結線）、`hooks/usePendingUploads`（保持・重複排除・プレビューURL生存管理）、`components/site-surveys/PendingUploadPanel`（一覧表示と操作面）、`utils/upload-failure`（恒久／一時の分類）、`types/upload.types`（共有型）。所有は site-survey spec の Requirement 37。本 spec は利用のみで改変しない。
- **multipart 送信の再試行方針・送信猶予・401 リフレッシュ・セッション切れ通知**: `api/client.ts` の `ApiClient.request`／`sendFormData`／`UPLOAD_TIMEOUT_MS`／`UPLOAD_RETRYABLE_STATUS_CODES`。所有は site-survey spec Requirement 37。本 spec は `apiClient.sendFormData` を呼ぶのみ。
- 未送信保持部品を `components/common/` 等の共通レイヤへ移設する構造リファクタ（受入基準を変えず、完了済み実装への回帰リスクのみを生むため本 spec では扱わない）。

### Allowed Dependencies
- 基盤（利用可）: `StorageProvider.copy/upload/getSignedUrl`、`ImageProcessorService.processImage`、`SignedUrlService.generateBatchSignedUrls`、`CompanyInfoService.getCompanyInfo`、`PdfFontService.initializePdfFonts`、fabric primitives、multer 設定、`authenticate`/`requirePermission`/`validate`。
- フロント基盤（利用可・流用）: `hooks/useCanvasViewport`・`components/site-surveys/ZoomControls`・`components/site-surveys/gestures/*`・`utils/imageFitScale`・`ImageViewer` の回転定数/`normalizeRotation`（ビューアR14）、`hooks/useUnsavedChanges`＋`components/common/UnsavedChangesDialog`（離脱警告R18）、`hooks/useMediaQuery`＋`utils/responsive`（モバイルR19）、`hooks/usePermission`（権限R17）、JSZip（ZIP生成R15）。site-survey の `services/export/bulkExportService` は**流用せず独立クローン**（安定性優先）。
- フロント基盤（利用可・R20）: `types/upload.types`（`FailedUpload`/`UploadOutcome`/`PendingUpload`/`UploadFailureKind`）、`utils/upload-failure`（`toFailedUpload`/`classifyUploadFailure`/`isUnsupportedFormatMessage`）、`components/site-surveys/ImageUploader`（保持・再送・破棄の結線を内包）、`api/client.ts` の `apiClient.sendFormData`。いずれも**利用のみ**で、これらのファイルを本 spec の実装で変更しない。
- 依存方向: Types → Prisma → Storage/Infra → Service → Route → API(client) → UI。左方向のみ import 可、上方向禁止。R20 の追加経路も `types/upload.types → utils/upload-failure → api/construction-photo-images → components/construction-photos/PhotoUploader` の順で左方向のみに従う（`utils` は `api` を import しない）。
- 制約: site-survey のサービス／モデルへ書込依存しない。現調写真は Prisma 読取＋`storage.copy` のみ。
- 制約（R20）: 工事写真から共有部品への依存は `components/construction-photos/* → components/site-surveys/*` の一方向のみ。`components/site-surveys/*` が工事写真の型・API・画面を参照することは禁止（既存の `ConstructionPhotoImageViewer → site-surveys/ZoomControls` と同じ向き）。

### Revalidation Triggers
- `constructionPhotos` サマリDTO形状の変更 → `project-management`（詳細画面）に再検証。
- 画像リスト／メタ更新／並び替えのAPIコントラクト変更 → フロントUI再検証。
- `signboardPlacement` JSON形状・座標系の変更 → プレビュー・合成・PDFの再検証。
- 署名付きURLの取得方式／TTL変更 → 一覧・詳細・PDFの表示再検証。
- `SurveyImage` 読取形状に依存する現調コピーは、site-survey スキーマ変更時に再検証。
- 画像ビューアのルート（`/construction-photos/:albumId/photos/:photoId`）／表示状態契約の変更 → 詳細画面の写真クリック導線を再検証。
- ZIP エクスポートの看板モード（composited/plain/original）と画像取得元（print-image/原本）の対応変更 → エクスポート結果を再検証。
- `construction_photo:*` 権限とUI出し分けのマッピング変更 → 詳細/一覧の操作導線・`readOnly` 挙動を再検証。
- `UploadOutcome`／`FailedUpload` の契約形状の変更（site-survey 側） → `PhotoUploader.handleUpload` の返却と工事写真 E2E を再検証。
- `UPLOAD_RETRYABLE_STATUS_CODES`／`UPLOAD_TIMEOUT_MS`／再試行回数・バックオフ係数の変更 → R20.13〜R20.15・R20.19・R20.20 を再検証。
- **バックエンドの画像形式エラー文言の変更**（`surveyImageService.validateFile` が投げる 3 種のメッセージ） → 207 応答の恒久／一時分類（R20.16, R20.21）が静かに壊れるため、`utils/upload-failure` の判定文言と工事写真の再送不可 E2E を再検証。
- `construction-photo-images` のアップロード応答形状（201/207 と `{successful, failed}`）の変更 → `PhotoUploader.uploadFilesInWaves` の集約と再送可否判定を再検証。

## Architecture

### Existing Architecture Analysis
- バックエンドは Express 5 + Prisma 7.8、ルートは二重マウント（nested `/api/projects/:projectId/...` ＋ flat `/api/.../:id`）、DIはルートファイル内モジュールシングルトン。
- 画像は multer→Sharp→StorageProvider（local/R2）保存、配信は署名付きURL（公開パス禁止, TTL 900s）。合成は SVG→`sharp.composite` の実績パターン（`annotated-thumbnail.service`）。
- フロントは React 19 + react-router 7、状態はローカル＋context、PDFは jsPDF（`PdfReportService` に3枚/ページ版組が既存）、注釈は fabric。
- 認可は RBAC 権限（`requirePermission('<resource>:<action>')`）。プロジェクトメンバーシップ専用ガードは存在しない。

### Architecture Pattern & Boundary Map

```mermaid
graph TB
    subgraph UI
        ListPage[ConstructionPhotoListPage]
        DetailPage[ConstructionPhotoDetailPage]
        SignboardPage[ConstructionSignboardListPage]
        SectionCard[ConstructionPhotoSectionCard]
        LedgerPdf[ConstructionPhotoLedgerService]
    end
    subgraph ApiClient
        PhotoApi[construction-photos api]
        ImageApi[construction-photo-images api]
        SignboardApi[construction-signboards api]
    end
    subgraph Routes
        PhotoRoutes[construction-photos routes]
        ImageRoutes[construction-photo-images routes]
        SignboardRoutes[construction-signboards routes]
    end
    subgraph Services
        AlbumSvc[ConstructionPhotoAlbumService]
        PhotoImgSvc[ConstructionPhotoImageService]
        MetaSvc[ConstructionPhotoMetadataService]
        SignboardSvc[ConstructionSignboardService]
        SvgSvc[SignboardSvgService]
        CompositeSvc[SignboardCompositeService]
        SummarySvc[ConstructionPhotoSummaryService]
    end
    subgraph Infra
        Processor[ImageProcessorService]
        Signed[SignedUrlService]
        Storage[StorageProvider]
        Company[CompanyInfoService]
        Prisma[Prisma models]
    end

    ListPage --> PhotoApi --> PhotoRoutes --> AlbumSvc
    DetailPage --> ImageApi --> ImageRoutes --> PhotoImgSvc
    DetailPage --> ImageApi --> ImageRoutes --> MetaSvc
    SignboardPage --> SignboardApi --> SignboardRoutes --> SignboardSvc
    SectionCard --> PhotoApi
    LedgerPdf --> ImageApi

    PhotoImgSvc --> Processor
    PhotoImgSvc --> Storage
    PhotoImgSvc --> CompositeSvc
    CompositeSvc --> SvgSvc
    CompositeSvc --> Storage
    SvgSvc --> SignboardSvc
    AlbumSvc --> Prisma
    PhotoImgSvc --> Prisma
    MetaSvc --> Prisma
    SignboardSvc --> Prisma
    SummarySvc --> Prisma
    ImageRoutes --> Signed
    LedgerPdf --> Company
```

**Architecture Integration**:
- 選択パターン: レイヤードモノリス内の独立ドメインモジュール（Option C ハイブリッド）。ドメイン層は新規、基盤層（Infra）は直接再利用。
- 境界分離: 工事写真ドメインは site-survey と別テーブル・別ルート・別サービス。共有は Infra 層のみ（読取・利用）。
- 依存方向: `Types → Prisma → Infra → Service → Route → API → UI`（左方向のみ）。
- Steering準拠: 二重マウント／モジュールDI／署名付きURL配信／RBAC権限 を踏襲。

### アップロード失敗の保持と再送の分担（R20）

R20 は site-survey の Requirement 37 と同一の問題（画像送信の失敗を、送信元機能に依らず画像の実体ごと保持して再送する）である。requirements.md の Adjacent expectations が「site-survey と共通のアップロードUIで提供され、挙動が一致する」ことを前提としているため、**機構は共有部品を採用し、工事写真は送信アダプタのみを所有する**。

```mermaid
graph TB
    subgraph Owned_by_this_spec
        DetailPage[ConstructionPhotoDetailPage]
        PhotoUploader[PhotoUploader 送信アダプタ]
        ImageApi[construction-photo-images api]
    end
    subgraph Owned_by_site_survey_Req37
        ImageUploader[ImageUploader 保持と再送の結線]
        PendingHook[usePendingUploads 保持機構]
        PendingPanel[PendingUploadPanel 表示と操作面]
        Classifier[upload failure 恒久と一時の分類]
        UploadTypes[upload types 共有型]
        ApiClientCore[ApiClient sendFormData 再試行と猶予と401更新]
    end

    DetailPage --> PhotoUploader
    PhotoUploader --> ImageUploader
    PhotoUploader --> ImageApi
    PhotoUploader --> Classifier
    ImageApi --> ApiClientCore
    ImageUploader --> PendingHook
    ImageUploader --> PendingPanel
    ImageUploader --> Classifier
    PendingHook --> UploadTypes
    Classifier --> UploadTypes
```

**Key Decisions**:
- **境界の切り方**: `ImageUploader` が「保持・再送・破棄」を所有し、送信そのものは注入された `onUpload` に委ねる。工事写真は `PhotoUploader.handleUpload` としてこのアダプタを実装するのみで、保持ロジックを持たない（No Hidden Shared Ownership）。
- **再送可否の確定位置**: 分類は「送信例外が手元にある」アダプタ層（`uploadFilesInWaves`）で確定させ、上位へは区分済みの `FailedUpload` を渡す。文字列の失敗理由だけを上げると 413（サイズ上限超過）が文言判定にかからず再送可へ倒れるためである。
- **207 の扱い**: `uploadConstructionPhotos` は部分失敗を例外化せず `{successful, failed}` を返すため、アダプタが `ApiError(207, item.error)` として組み立て直して分類器へ渡す。207 は「ストレージ障害・画像処理失敗・DBエラー」も含むため一律 permanent とはせず、画像形式の非対応のみ permanent とする（R20.21）。
- **バックエンド変更なし**: `constructionPhotoImageService` は `surveyImageService.validateFile()` を再利用しており、形式エラーの文言が分類器の判定集合と一致する。R20 に伴うバックエンド／スキーマ／API コントラクトの変更は発生しない。
- **現調コピーは対象外**: `handleSurveySelect` は画像バイトを送信せずサーバー側の複製を要求するだけであるため、保持・再送の対象としない（requirements.md 備考1）。失敗時は従来どおり通知のみを行う。

### Technology Stack

| Layer | Choice / Version | Role in Feature | Notes |
|-------|------------------|-----------------|-------|
| Frontend | React 19 / react-router-dom 7 / fabric 7 / jspdf | 一覧・詳細・看板配置プレビュー・台帳PDF生成 | 既存踏襲。fabricは配置プレビューのみ |
| Backend | Express 5 / Prisma 7.8 / multer / sharp | ルート・サービス・アップロード・看板合成 | `construction_photo:*` 権限を追加 |
| Data / Storage | Postgres / StorageProvider(local, R2) | 3モデル・`construction-photos/` オブジェクト | 署名付きURL配信（TTL 900s） |
| Infrastructure | 既存 Docker/entrypoint | 変更なし | 新規ランタイム前提なし |

## Data Models

### Domain Model
- **集約1: ConstructionPhotoAlbum**（集約ルート）— 配下に `ConstructionPhoto`（写真項目）を持ち、写真の追加・並び替え・削除・印刷対象・コメントを一貫性境界とする。論理削除でアルバムと写真を一括無効化。
- **集約2: ConstructionSignboard**（集約ルート・プロジェクト単位マスタ）— 写真項目から `signboardId` で参照される。看板削除時は参照側を `SetNull`（R9.7）。
- 写真↔看板の**配置情報**（位置・大きさ）は参照側 `ConstructionPhoto.signboardPlacement`（写真の所有物）に保持。看板本体は配置情報を持たない（No Hidden Shared Ownership）。

```mermaid
erDiagram
    Project ||--o{ ConstructionPhotoAlbum : has
    Project ||--o{ ConstructionSignboard : has
    ConstructionPhotoAlbum ||--o{ ConstructionPhoto : contains
    ConstructionSignboard |o--o{ ConstructionPhoto : placed_on
    SurveyImage |o..o{ ConstructionPhoto : copied_from
```

### Logical Data Model（Prisma, snake_case マップ）

**ConstructionPhotoAlbum**（`@@map("construction_photo_albums")`）
- `id String @id @default(uuid())`、`projectId String`、`name String`、`memo String?`
- `createdAt`、`updatedAt @updatedAt`、`deletedAt DateTime?`（論理削除）
- rel: `project @relation(onDelete: Cascade)`、`photos ConstructionPhoto[]`
- index: `@@index([projectId])`、`@@index([deletedAt])`、`@@index([name])`

**ConstructionPhoto**（`@@map("construction_photos")`）
- `id`、`albumId String`、`originalPath String`、`thumbnailPath String`
- `fileName String`、`fileSize Int`、`width Int`、`height Int`、`displayOrder Int`
- `comment String?`（最大2000）、`includeInReport Boolean @default(false)`
- `signboardId String?`、`signboardPlacement Json?`（`{left,top,width,height}` 画像ピクセル座標）
- `sourceSurveyImageId String?`（現調コピー由来の来歴。FKにはせず値保持のみ＝site-survey非依存）
- `createdAt`
- rel: `album @relation(onDelete: Cascade)`、`signboard ConstructionSignboard? @relation(onDelete: SetNull)`
- index: `@@index([albumId])`、`@@index([displayOrder])`、`@@index([includeInReport])`、`@@index([signboardId])`

**ConstructionSignboard**（`@@map("construction_signboards")`）
- `id`、`projectId String`、`workName String`（工事件名の値）、`workLocation String`（工事場所の値）
- `freeItems Json`（自由項目 `Array<{label:string,value:string}>`、既定 `[]`）
- `footerText String?`（下部記入欄の固定テキスト、複数行可）
- `createdAt`、`updatedAt @updatedAt`、`deletedAt DateTime?`
- rel: `project @relation(onDelete: Cascade)`、`photos ConstructionPhoto[]`
- index: `@@index([projectId])`、`@@index([deletedAt])`

### Data Contracts（主要DTO・型）

```typescript
// 配置ジオメトリ（画像ピクセル座標系）
interface SignboardPlacement {
  left: number; top: number; width: number; height: number;
}

// 看板の自由項目
interface SignboardFreeItem { label: string; value: string; }

// 画像リストDTO（署名付きURL同梱、写真項目ごと個別リクエスト不要）
interface ConstructionPhotoWithUrls {
  id: string; albumId: string; fileName: string; fileSize: number;
  width: number; height: number; displayOrder: number;
  comment: string | null; includeInReport: boolean;
  signboardId: string | null; signboardPlacement: SignboardPlacement | null;
  thumbnailUrl: string | null;   // 一覧・詳細のサムネ優先表示
  printImageUrl: string;         // PDF用: 印字画像取得エンドポイント。看板ありはサーバでオンデマンド合成、なしは原本を返す
  createdAt: string;
}

// --- 追加機能 (Req 14-19) の型 ---

// ZIP一括エクスポート設定 (R15)
type ConstructionPhotoExportFormat = 'jpeg' | 'png';
type ConstructionPhotoExportResolution = 'low' | 'medium' | 'high';
// 看板重畳モード: composited=看板重畳(サーバ print-image), plain=看板なし加工(原本を解像度変換), original=原本そのまま
type SignboardExportMode = 'composited' | 'plain' | 'original';
interface ConstructionPhotoExportSettings {
  format: ConstructionPhotoExportFormat;
  resolution: ConstructionPhotoExportResolution;
  signboardMode: SignboardExportMode;
}
interface ConstructionPhotoExportProgress { completed: number; total: number; failed: number; }

// 権限UI (R17) — usePermission('construction_photo:*') を包む
type ConstructionPhotoPermissionAction = 'view' | 'create' | 'edit' | 'delete';
interface ConstructionPhotoPermission {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
  isLoading: boolean;
  getPermissionError: (action: ConstructionPhotoPermissionAction) => string | null;
}

// ビューア表示状態 (R14) — ImageViewer の RotationAngle を流用
interface ConstructionPhotoViewerState { zoom: number; rotation: 0 | 90 | 180 | 270; panX: number; panY: number; }

// --- アップロード失敗の保持と再送 (R20) の型 ---
// 定義の所有は site-survey spec Req37（frontend/src/types/upload.types.ts）。
// 本 spec は利用のみで、形状を変更しない。参照の便宜のため再掲する。

// 再送で解消しうるか否か。permanent はサーバーの受入条件違反による確定的な拒否 (R20.16)
type UploadFailureKind = 'retriable' | 'permanent';

// アップロードに失敗した1件。再圧縮せず再送するため実体を File のまま保持する (R20.4)
interface FailedUpload {
  readonly file: File;
  readonly error: string;      // ユーザーへ提示する失敗理由 (R20.2)
  readonly kind: UploadFailureKind;
}

// onUpload の戻り値。void を返した場合は全件成功とみなす（既存呼び出しとの後方互換）
interface UploadOutcome {
  readonly failed: readonly FailedUpload[];
}

// 保持中の未送信画像。id は name:size:lastModified 由来の安定キー（同一画像の重複保持を防ぐ）
interface PendingUpload extends FailedUpload {
  readonly id: string;
  readonly previewUrl: string;  // ObjectURL。生成・解放は usePendingUploads が唯一の責任者
}
```

## File Structure Plan

### Directory Structure（新規, backend）
```
backend/src/
├── routes/
│   ├── construction-photos.routes.ts          # アルバムCRUD/一覧 (dual mount)
│   ├── construction-photo-images.routes.ts     # 画像 upload/list/reorder/metadata/delete/copy
│   └── construction-signboards.routes.ts        # 看板CRUD/一覧 (dual mount)
├── services/
│   ├── construction-photo-album.service.ts      # アルバムCRUD・ページング (R1,R3)
│   ├── construction-photo-image.service.ts      # addFromUpload/addFromSurveyImage/list/delete (R4,R5,R6,R12)
│   ├── construction-photo-metadata.service.ts   # コメント/印刷対象/看板配置 batch + 並び替え (R7,R9)
│   ├── construction-signboard.service.ts        # 看板CRUD (R8)
│   ├── signboard-svg.service.ts                 # 電子小黒板SVG生成 (R8,R9,R10)
│   ├── signboard-composite.service.ts           # SVG→sharp composite で印字用画像生成 (R9,R10)
│   └── construction-photo-summary.service.ts    # findLatestByProjectId (R2)
├── schemas/
│   ├── construction-photo.schema.ts             # zod/validate スキーマ
│   └── construction-signboard.schema.ts
└── types/construction-photo.types.ts            # 共有型（DTO/Placement/FreeItem）
```

### Directory Structure（新規, frontend）
```
frontend/src/
├── pages/
│   ├── ConstructionPhotoListPage.tsx            # 一覧 (R2,R3)
│   ├── ConstructionPhotoDetailPage.tsx          # 詳細: 写真項目管理+保存+PDF (R1,R7,R9,R10)
│   ├── ConstructionPhotoCreatePage.tsx          # アルバム作成 (R1)
│   └── ConstructionSignboardListPage.tsx        # 看板マスタ一覧+編集 (R8)
├── components/construction-photos/
│   ├── ConstructionPhotoResponsiveView.tsx      # Table/Card切替（clone）(R3)
│   ├── ConstructionPhotoListTable.tsx / ListCard.tsx / SearchFilter.tsx  # clone (R3)
│   ├── PhotoItemPanel.tsx                        # コメント/印刷対象/並び替え（PhotoManagementPanel clone）(R7)
│   ├── PhotoUploader.tsx                         # 3系統追加UI（ImageUploader踏襲, 現調選択追加）(R4,R5,R6)
│   ├── SurveyImagePicker.tsx                     # 現調写真選択モーダル (R6)
│   ├── SignboardPlacementEditor.tsx             # fabric 1枚Rect配置プレビュー (R9)
│   └── SignboardForm.tsx                         # 看板 標準項目+自由項目+固定テキスト (R8)
├── components/projects/
│   └── ConstructionPhotoSectionCard.tsx         # 工程表パネル直下パネル (R2)
├── services/export/
│   └── ConstructionPhotoLedgerService.ts        # 台帳PDF: 表紙+3枠+No.連番 (R10)
├── api/
│   ├── construction-photos.ts / construction-photo-images.ts / construction-signboards.ts
└── types/construction-photo.types.ts
```

### 追加機能ファイル（Req 14〜19）

**新規（frontend）**
- `pages/ConstructionPhotoImageViewerPage.tsx` — 画像ビューアページ（ズーム/回転/パン, 閲覧専用）(R14)
- `components/construction-photos/ConstructionPhotoImageViewer.tsx` — ビューア本体。`useCanvasViewport`/`ZoomControls`/`gestures/*`/`imageFitScale` と回転状態（`ImageViewer` の `normalizeRotation`/`ROTATION_CONSTANTS` 流用）を合成。注釈ツールは持たない (R14)
- `components/construction-photos/BulkExportDialog.tsx` / `BulkExportProgressDialog.tsx` / `ExportSettingsForm.tsx` — ZIP設定（形式/解像度/看板モード）・進捗・中断UI（site-survey同名部品のクローン, CP型対応）(R15)
- `services/export/ConstructionPhotoBulkExportService.ts` — JSZip束ね・解像度/形式変換（canvas再エンコード）・看板モード分岐（composited=print-image取得, plain/original=原本取得）・進捗callback/AbortSignal (R15)
- `services/export/constructionPhotoZipNaming.ts` — ZIPエントリ命名（`zip-naming` 相当のクローン）(R15)
- `components/construction-photos/AlbumDeleteDialog.tsx` — アルバム削除確認（FocusManagerパターン踏襲）(R16)
- `hooks/useConstructionPhotoPermission.ts` — `usePermission('construction_photo:*')` を包む canView/canCreate/canEdit/canDelete/getPermissionError (R17)

**変更（frontend）**
- `pages/ConstructionPhotoDetailPage.tsx` — `onPhotoClick`→ビューア遷移結線(R14)、ZIP起動＋対象選択(R15)、アルバム編集/削除導線(R16)、`useConstructionPhotoPermission` で `readOnly`/ボタン出し分け(R17)、独自 `isDirty` state を `useUnsavedChanges` へ置換(R18)、`useMediaQuery` でモバイル分岐(R19)
- `components/construction-photos/PhotoItemPanel.tsx` — エクスポート対象の選択チェック(R15)、モバイルスタイル分岐(R19)、`readOnly` 結線の実効化(R17)
- `pages/ConstructionPhotoListPage.tsx` / `components/construction-photos/ConstructionPhotoListTable.tsx` / `ConstructionPhotoListCard.tsx` — アルバム編集/削除の行導線（権限連動）(R16,R17)
- `routes.tsx` — CPビューアルート `/construction-photos/:albumId/photos/:photoId` を追加 (R14)

### アップロード失敗の保持と再送のファイル（Req 20）

**利用のみ・本 spec では変更しない（所有は site-survey spec Req37）**
- `frontend/src/types/upload.types.ts` — `FailedUpload`/`UploadOutcome`/`PendingUpload`/`UploadFailureKind`
- `frontend/src/utils/upload-failure.ts` — `toFailedUpload`/`classifyUploadFailure`/`isUnsupportedFormatMessage`
- `frontend/src/hooks/usePendingUploads.ts` — 保持・重複排除・ObjectURL 生存管理
- `frontend/src/components/site-surveys/PendingUploadPanel.tsx` — 未送信一覧の表示と再送・破棄の操作面
- `frontend/src/components/site-surveys/ImageUploader.tsx` — 保持と再送・破棄の結線、圧縮の有無の切替
- `frontend/src/api/client.ts` — `sendFormData`／`UPLOAD_TIMEOUT_MS`／`UPLOAD_RETRYABLE_STATUS_CODES`／401 リフレッシュ待ち合わせ

**本 spec が所有する送信アダプタ（結線済み・回帰時の修正対象）**
- `frontend/src/components/construction-photos/PhotoUploader.tsx` — `uploadFilesInWaves` が失敗画像の実体と再送可否を集約し、`handleUpload` が `UploadOutcome` として返す (R20.1, R20.16, R20.21)
- `frontend/src/api/construction-photo-images.ts` — `uploadConstructionPhotos` が `apiClient.sendFormData` へ委譲（R20.11〜R20.15, R20.19, R20.20 の適用経路）
- `frontend/src/pages/ConstructionPhotoDetailPage.tsx` — `PhotoUploader` を `canEdit` 配下に描画。未送信一覧は `ImageUploader` 内部に描画されるため詳細画面側の追加結線は不要

**新規（検証）**
- `e2e/specs/construction-photos/construction-photo-upload-retry.spec.ts` — 失敗→保持→再送→解消／再送不可の区別／破棄確認の E2E (R20.1〜R20.3, R20.5〜R20.8, R20.16〜R20.18)。R20.13 は「リクエスト回数2回以上」を観測した場合にのみラベルへ含める（Testing Strategy の検証責務の切り分けを参照）
- `frontend/src/components/construction-photos/PhotoUploader.test.tsx` — 既存ファイルへ再送・破棄・実行中抑止・全件再送不可のケースを追加（工事写真経路での要件トレースを成立させる）

### Modified Files
- `backend/prisma/schema.prisma` — 3モデル追加＋`Project`に逆リレーション追加（migration生成）。
- `backend/src/app.ts` — import＋二重マウント4行（photos/images）＋signboardルート登録。
- `backend/src/routes/projects.routes.ts` — `getProjectSections` の `allSettled` に工事写真を追加、返却に `constructionPhotos:{totalCount,latest...}`。
- `backend/src/middleware/authorize.middleware.ts`（または権限定義箇所）— `construction_photo:*` / `construction_signboard:*` 権限を追加。
- `frontend/src/routes.tsx` — `/construction-photos` ルート群を site-survey 順序規約に倣い追加。
- `frontend/src/pages/ProjectDetailPage.tsx` — `ConstructionPhotoSectionCard` を `ScheduleSectionCard` の直後に挿入。
- `frontend/src/api/projects.ts` — `ProjectDetailSummary.sections` に `constructionPhotos` 型追加。
- `backend/src/routes/construction-photo-images.routes.ts` — 非合成原本配信ルート `GET /images/:imageId/original` を追加（`construction_photo:read`＋プロジェクト境界検証＋原本ストリーム, 看板合成なし）。
- `backend/src/services/construction-photo-image.service.ts` — `getOriginalImage(photoId): Promise<Buffer>`（看板を合成せず原本を返す）を追加。
- `frontend/src/api/construction-photo-images.ts` — `getConstructionPhotoOriginalImage(imageId): Promise<Blob>` を追加（一覧DTOは不変, 原本は必要時のみ取得）。

## System Flows

### 写真項目の追加（3系統）

```mermaid
flowchart TD
    Start[写真項目を追加] --> Kind{追加種別}
    Kind -->|ローカル/カメラ| Up[multipart upload]
    Kind -->|現調コピー| Pick[現調写真を選択]
    Up --> Proc[ImageProcessor sharp で圧縮・サムネ・寸法取得]
    Proc --> StoreU[storage.upload original+thumb]
    StoreU --> RowU[ConstructionPhoto 追加 末尾 displayOrder]
    Pick --> Copy[storage.copy original+thumb を新キーへ]
    Copy --> RowC[ConstructionPhoto 追加 寸法は複製元流用 sourceSurveyImageId 記録]
    RowU --> Done[署名付きURL付きで返却]
    RowC --> Done
```

現調コピーはバイト複製のため `width/height/fileSize` を複製元 `SurveyImage` 行からそのまま流用し、Sharp再処理を行わない。site-survey へは書込まない。

### 看板配置の保存とPDF出力（オンデマンド合成）

```mermaid
sequenceDiagram
    participant UI as DetailPage
    participant API as images api
    participant Meta as MetadataService
    participant Comp as CompositeService
    participant Svg as SvgService
    participant Store as StorageProvider
    UI->>API: PATCH metadata batch (comment/includeInReport/signboardId/placement)
    API->>Meta: updateMetadataBatch(inputs)
    Meta-->>UI: 更新結果 (合成はここでは行わない)
    UI->>API: PUT order (並び替え) ※メタ保存と合わせ最大2リクエスト
    Note over UI: PDF出力時のみ (低頻度)
    UI->>API: GET images/:id/print-image (印刷対象の写真ごと)
    API->>Comp: 看板指定ありは合成要求
    Comp->>Svg: 電子小黒板SVG生成 (signboard, placement, w, h)
    Comp->>Store: 原本取得し sharp composite (保存せずストリーム返却)
    Comp-->>UI: 印字用画像 (看板なしは原本)
    UI->>UI: jsPDF 表紙+3枠+No.連番で addImage
```

看板合成は**サーバ権威かつオンデマンド**（保存しない）。看板マスタ編集・配置変更でも常に最新内容で焼き込まれ、キャッシュ無効化が不要（Critical Issue 1 の解消）。プレビューはクライアント fabric でライブ編集。看板未指定の写真は原本をそのまま返す。

### ZIP一括エクスポート（クライアント生成・中断可能）

```mermaid
flowchart TD
    Start[一括エクスポート実行] --> Scope{対象}
    Scope -->|全件| All[アルバム全写真項目]
    Scope -->|選択| Sel[選択済み写真項目]
    All --> Loop[写真項目ごとに逐次処理]
    Sel --> Loop
    Loop --> Abort{AbortSignal?}
    Abort -->|中断| Cancel[処理中断・通知]
    Abort -->|継続| Mode{看板モード}
    Mode -->|composited| Print[GET print-image 看板重畳画像Blob]
    Mode -->|plain/original| Orig[原本Blob取得]
    Print --> Enc[canvas で解像度スケール＋形式変換]
    Orig --> Enc
    Enc --> Add[JSZip にエントリ追加＋進捗通知]
    Add --> More{残あり?}
    More -->|Yes 部分失敗は継続| Loop
    More -->|No| Zip[ZIP Blob 生成→ダウンロード]
```

ZIP自体はクライアント（JSZip）で生成する。看板重畳モード（composited）は既存 `GET print-image`（サーバ合成）を、`plain`/`original` は**新設の非合成原本エンドポイント `GET .../original`** を取得元とする（看板配置済み写真でも生原本を取得できる）。解像度（低/中/高）と形式（JPEG/PNG）変換は canvas 再エンコードで一元化し、`original` は設定を適用せず原本バイトをそのまま格納、`plain` は看板なしのまま解像度/形式を適用する。1件の取得・加工失敗は当該項目のみ失敗として継続し、成功分での続行をユーザーが選べる（R15.10）。対象0件は非実行で通知（R15.11）。

### 画像ビューア（閲覧専用）

```mermaid
flowchart LR
    Thumb[詳細で写真サムネをクリック] --> Nav[/construction-photos/:albumId/photos/:photoId へ遷移/]
    Nav --> Fetch[原本の署名付きURL取得]
    Fetch --> View[ConstructionPhotoImageViewer]
    View --> Z[ズームイン/アウト]
    View --> R[90度回転]
    View --> P[拡大時ドラッグでパン]
    View --> Close[閉じる→詳細へ戻る]
```

ビューアは注釈編集を持たない閲覧専用で、`useCanvasViewport`/`ZoomControls`/`gestures/*`/`imageFitScale` と回転状態を合成する。表示する原本は**新設の `GET .../original`**（看板を焼き込まない生原本）を必要時にのみ取得する（R11.3, R14.6）。

### アップロード失敗時の保持と再送（R20）

```mermaid
flowchart TD
    Pick[ファイル選択またはカメラ撮影] --> Val{フロント前段検証 50MB}
    Val -->|超過| VErr[validationErrors として提示 保持しない]
    Val -->|通過| Comp[初回のみ圧縮]
    Comp --> Wave[1ファイル1リクエストで最大5並列送信]
    Wave --> Res{送信結果}
    Res -->|全件成功| Added[写真項目を一覧へ追加]
    Res -->|到達前の通信障害 0 502 503 504| Auto[段階的バックオフで自動再試行]
    Auto --> Res
    Res -->|401 認証期限切れ| Refresh[トークン更新を待ち合わせて継続]
    Refresh --> Res
    Res -->|更新失敗| Session[セッション切れを共通手段で通知]
    Res -->|400 または 413| Perm[permanent として保持]
    Res -->|207 の形式非対応| Perm
    Res -->|207 のその他 5xx タイムアウト| Retri[retriable として保持]
    Session --> Retri
    Perm --> Panel[未送信一覧に件数 サムネ ファイル名 理由を表示]
    Retri --> Panel
    Panel --> Act{ユーザー操作}
    Act -->|再送| Resend[retriable のみを再圧縮せず送信]
    Resend --> Res
    Act -->|破棄| Confirm{破棄の確認}
    Confirm -->|承諾| Free[保持を解放しプレビューURLを破棄]
    Confirm -->|取消| Panel
    Act -->|全件 permanent| Disabled[再送手段を実行不可で提示]
```

**Key Decisions**:
- **自動再試行の対象**: サーバー処理に到達する前の失敗（`0`/`502`/`503`/`504`）に限る。`500` は永続化が完了した後の失敗を含み、再送が同一画像の重複登録を生むため対象外とする（R20.13, R20.14）。
- **時間切れは自動再試行しない**: 1件あたり120秒の猶予を与えたうえで、時間切れは保持へ回してユーザー操作に委ねる。自動再試行を重ねると再送を開始できるまでの待ち時間が積み上がるためである（R20.15, R20.19, R20.20）。
- **前段検証との線引き**: フロントの上限（50MB）で弾かれた画像は**送信を試行していない**ため未送信画像として保持せず、従来どおり `validationErrors` として提示する。サーバー上限（10MB）超過はサーバーが 413 を返し、`permanent` として保持・提示する（R20.16）。
- **件数上限は到達不能**: `uploadFilesInWaves` は1リクエスト1ファイルで送信するため、R12.1 の件数上限に起因する 400 は工事写真 UI から発生しない。R20.16 が挙げる 3 条件のうち、工事写真で到達するのは「サイズ上限」と「画像形式」の 2 経路である。到達不能な経路の検証は行わない。
- **並行送信の抑止**: 保持の反映は「試行対象のうち失敗しなかったものを取り除く」差分更新であるため、送信が同時に走ると後から解決した試行が先行試行の結果を上書きする。実行中は新規選択・カメラ・D&D も含めて送信系操作を抑止する（R20.10 が求める範囲を上回る意図的な選択）。

## Requirements Traceability

| Requirement | Summary | Components | Interfaces | Flows |
|-------------|---------|------------|------------|-------|
| 1 | アルバムCRUD | ConstructionPhotoAlbumService, construction-photos.routes | AlbumService, API | - |
| 2 | ナビ/パネル(工程表直下) | ConstructionPhotoSectionCard, SummaryService, routes.tsx, ProjectDetailPage | Summary API | - |
| 3 | 一覧・検索(50件) | ResponsiveView/Table/Card/SearchFilter, AlbumService | list API | - |
| 4 | ローカルUP | ConstructionPhotoImageService.addFromUpload, PhotoUploader | upload API | 追加フロー |
| 5 | カメラ撮影 | PhotoUploader(camera input) | upload API | 追加フロー |
| 6 | 現調コピー | ImageService.addFromSurveyImage, SurveyImagePicker | copy API | 追加フロー |
| 7 | 項目管理 | MetadataService, PhotoItemPanel | metadata/order API | 保存フロー |
| 8 | 看板マスタ | ConstructionSignboardService, SignboardForm, SvgService | signboard API | - |
| 9 | 看板配置 | SignboardPlacementEditor, CompositeService, MetadataService | metadata API | 配置/PDFフロー |
| 10 | PDF台帳 | ConstructionPhotoLedgerService, CompositeService, CompanyInfoService | 印字URL, PdfFont | PDFフロー |
| 11 | リクエスト効率 | AlbumService(ページ50), ImageService(一括署名URL), MetadataService(batch) | list/batch API | 保存フロー |
| 12 | UP制約 | construction-photo-images.routes(multer), ImageService.validate | upload API | - |
| 13 | アクセス制御 | authenticate/requirePermission, SignedUrlService | 全API | - |
| 14 | 画像ビューア(ズーム/回転/パン) | ConstructionPhotoImageViewer(Page), useCanvasViewport, ZoomControls, gestures, routes.tsx, DetailPage(onPhotoClick), ImageService.getOriginalImage | GET .../original | ビューアフロー |
| 15 | ZIP一括エクスポート | ConstructionPhotoBulkExportService, BulkExportDialog/BulkExportProgressDialog/ExportSettingsForm, PhotoItemPanel(選択), ImageService.getOriginalImage | print-image/original, JSZip | エクスポートフロー |
| 16 | アルバム編集/削除導線 | DetailPage/ListPage/ListTable/ListCard, ConstructionPhotoEditPage(既存), AlbumDeleteDialog | PATCH/DELETE album API | - |
| 17 | 権限UI出し分け | useConstructionPhotoPermission, usePermission, DetailPage/ListPage, PhotoItemPanel(readOnly) | construction_photo:* | - |
| 18 | 未保存離脱警告 | useUnsavedChanges, UnsavedChangesDialog, DetailPage | - | - |
| 19 | 詳細画面モバイル | useMediaQuery, responsive, DetailPage, PhotoItemPanel | - | - |
| 20 | アップロード失敗時の保持と再送 | PhotoUploader（送信アダプタ）, ImageUploader, usePendingUploads, PendingUploadPanel, upload-failure, ApiClient.sendFormData | UploadOutcome, FailedUpload, PendingUploadPanelProps, sendFormData | 保持・再送フロー |

### Requirement 20 と site-survey Requirement 37 の対応

R20 の機構は site-survey spec の Requirement 37 が所有する。共有部品のコードコメントは `37.x` のみを引用しているため、工事写真の要件から実装へ辿るには本表を経由する。コードコメントに両番号を併記することはしない（所有が曖昧になるため）。

| 工事写真 | site-survey | 内容 | 実装の所在 |
|---|---|---|---|
| 20.1 | 37.1 | 失敗画像を未送信画像として保持 | `ImageUploader.submitFiles` ＋ `PhotoUploader.handleUpload` |
| 20.2 | 37.2 | 件数・サムネ・ファイル名・失敗理由の表示 | `PendingUploadPanel` |
| 20.3 | 37.3 | 再送可能分の一括再送 | `ImageUploader.handleRetry` |
| 20.4 | 37.4 | 同一画像データで再送（再圧縮しない） | `submitFiles(files, compress=false)` |
| 20.5 / 20.6 | 37.5 / 37.6 | 部分成功で成功分のみ除去／全成功で解消 | `usePendingUploads.record` |
| 20.7 / 20.8 | 37.7 / 37.8 | 破棄の操作手段／破棄の確認 | `PendingUploadPanel` ＋ `ImageUploader.handleDiscardAll` |
| 20.9 | 37.9 | 新規選択・撮影でも既存保持を維持 | `usePendingUploads.record` の差分更新 |
| 20.10 | 37.10 | 実行中は追加の再送を受け付けない | `ImageUploader` の `isBusy` |
| 20.11 / 20.12 | 37.11 / 37.12 | 401 の無操作復帰／セッション切れ通知 | `ApiClient.request` の `refreshInFlight` ／ `sessionExpiredCallback` |
| 20.13 / 20.14 | 37.13 / 37.14 | 到達前失敗の自動再試行／処理中失敗は再試行しない | `UPLOAD_RETRYABLE_STATUS_CODES` |
| 20.15 | 37.15 | 1件あたり120秒の送信猶予 | `UPLOAD_TIMEOUT_MS` |
| 20.16 / 20.17 / 20.18 | 37.16 / 37.17 / 37.18 | 恒久／一時の区別・再送対象外・実行不可提示 | `classifyUploadFailure` ＋ `retriableFiles` ＋ `canRetry` |
| 20.19 / 20.20 | 37.19 / 37.20 | 時間切れは自動再試行せず保持／待ち時間を延伸させない | `isRetryableApiError` の FormData 分岐 |
| 20.21 | 37.21 | ストレージ保存失敗は再送可として保持 | 207 の文言分岐（形式非対応以外は `retriable`） |

## Components and Interfaces

| Component | Layer | Intent | Req | Key Deps | Contracts |
|-----------|-------|--------|-----|----------|-----------|
| ConstructionPhotoAlbumService | Service | アルバムCRUD・ページング | 1,3 | Prisma (P0) | Service |
| ConstructionPhotoImageService | Service | 3系統追加・list・delete・印字画像 | 4,5,6,10,12 | Processor(P0), Storage(P0), SignedUrl(P1), Composite(P1) | Service, API |
| ConstructionPhotoMetadataService | Service | コメント/印刷/配置 batch・並び替え | 7,9 | Prisma(P0) | Service, Batch |
| ConstructionSignboardService | Service | 看板マスタCRUD | 8 | Prisma(P0) | Service, API |
| SignboardSvgService | Service | 電子小黒板SVG生成 | 8,9,10 | SignboardService(P1) | Service |
| SignboardCompositeService | Service | 印字用画像合成 | 9,10 | Svg(P0), Storage(P0), sharp(P0) | Service |
| ConstructionPhotoSummaryService | Service | サマリ寄与 | 2 | Prisma(P0), SignedUrl(P1) | Service |
| ConstructionPhotoLedgerService | UI | 台帳PDF生成 | 10 | PdfFont(P0), Company(P1) | Service |
| PhotoItemPanel / ResponsiveView 等 | UI | 表示・編集（clone） | 3,7 | api(P0) | State |
| ConstructionPhotoImageViewer(Page) | UI | 閲覧専用ビューア(ズーム/回転/パン) | 14 | useCanvasViewport(P0), ZoomControls(P0), gestures(P1), imageFitScale(P1) | State |
| ConstructionPhotoBulkExportService | UI | ZIP生成(形式/解像度/看板モード/進捗/中断) | 15 | ImageApi(P0), JSZip(P0), canvas(P0) | Service |
| BulkExportDialog / ProgressDialog / ExportSettingsForm | UI | エクスポート設定・進捗・中断UI(clone) | 15 | ExportService(P0) | State |
| useConstructionPhotoPermission | UI(hook) | 権限出し分け(canView/Create/Edit/Delete) | 17 | usePermission(P0) | Hook |
| AlbumDeleteDialog | UI | アルバム削除確認 | 16 | album API(P0) | State |
| PhotoUploader | UI | 3系統追加＋**送信アダプタ**（失敗画像の実体と再送可否を返す） | 4,5,6,20 | ImageUploader(P0), ImageApi(P0), upload-failure(P0) | State |
| ImageUploader（借用） | UI | 未送信保持・再送・破棄の結線 | 20 | usePendingUploads(P0), PendingUploadPanel(P0) | State |
| usePendingUploads（借用） | UI(hook) | 保持・重複排除・ObjectURL 生存管理 | 20 | upload.types(P0) | Hook |
| PendingUploadPanel（借用） | UI | 未送信一覧の表示と操作面 | 20 | upload.types(P0) | State |
| ApiClient.sendFormData（借用） | API(client) | multipart 送信の再試行・猶予・401更新 | 20 | ApiClient(P0) | Service |

### Backend Service Interfaces

```typescript
interface ConstructionPhotoAlbumService {
  create(input: { projectId: string; name: string; memo?: string }): Promise<AlbumDto>;
  update(id: string, input: { name?: string; memo?: string; updatedAt: string }): Promise<AlbumDto>; // 楽観排他
  softDelete(id: string): Promise<void>;
  findByProject(projectId: string, opts: { page?: number; limit?: number; filter?: AlbumFilter; sort?: AlbumSort; order?: 'asc' | 'desc' }): Promise<Paginated<AlbumDto>>; // limit 既定50
  findById(id: string): Promise<AlbumDto>;
}

interface ConstructionPhotoImageService {
  addFromUpload(albumId: string, files: UploadFile[]): Promise<ConstructionPhotoWithUrls[]>; // 末尾 displayOrder
  addFromSurveyImage(albumId: string, surveyImageIds: string[]): Promise<ConstructionPhotoWithUrls[]>; // storage.copy 独立複製
  listWithUrls(albumId: string, userId: string): Promise<ConstructionPhotoWithUrls[]>; // 一括署名URL, displayOrder asc
  getPrintImage(photoId: string): Promise<Buffer>; // 看板ありはオンデマンド合成, なしは原本 (PDF用)
  getOriginalImage(photoId: string): Promise<Buffer>; // 看板配置有無に関わらず非合成の原本 (ビューア/ZIP用)
  delete(photoId: string): Promise<void>; // 関連ストレージ(original/thumbnail)も削除
}

interface ConstructionPhotoMetadataService {
  updateMetadataBatch(inputs: Array<{
    id: string; comment?: string | null; includeInReport?: boolean;
    signboardId?: string | null; signboardPlacement?: SignboardPlacement | null; displayOrder?: number;
  }>): Promise<ConstructionPhotoWithUrls[]>; // 配置情報を保持するのみ。合成はPDF出力時にオンデマンド
  updateOrder(albumId: string, orders: Array<{ id: string; order: number }>): Promise<void>;
}

interface ConstructionSignboardService {
  create(input: SignboardInput & { projectId: string }): Promise<SignboardDto>;
  update(id: string, input: SignboardInput & { updatedAt: string }): Promise<SignboardDto>;
  delete(id: string): Promise<{ inUseCount: number }>; // 使用中は呼び出し側で確認 (R8.8)
  findByProject(projectId: string): Promise<SignboardDto[]>;
}

interface SignboardSvgService {
  // 画像ピクセル座標系で電子小黒板を描画したSVG文字列を返す
  generate(signboard: SignboardDto, placement: SignboardPlacement, imageWidth: number, imageHeight: number): string;
}

interface SignboardCompositeService {
  // 原本へ看板SVGを sharp.composite し、印字用画像バッファを生成
  composite(originalBuffer: Buffer, signboard: SignboardDto, placement: SignboardPlacement): Promise<Buffer>;
}
```
- Preconditions: `signboardPlacement` は画像内に収まる非負矩形。`updateMetadataBatch` は全idが同一アルバムに属すること。
- Postconditions: `displayOrder` は1..nに正規化。看板配置（`signboardId`/`signboardPlacement`）は保持のみ（合成はPDF出力時にオンデマンド）。
- Invariants: site-survey テーブルへ書込まない。写真配信は署名付きURLのみ。

### Frontend Interfaces（追加機能 R14〜R19）

```typescript
// ZIP一括エクスポート (R15) — CP専用サービス (site-survey bulkExportService は流用せず独立クローン)
interface ConstructionPhotoBulkExportService {
  export(
    photos: ConstructionPhotoWithUrls[],           // 全件 or 選択済み
    settings: ConstructionPhotoExportSettings,      // format/resolution/signboardMode
    handlers: {
      onProgress: (p: ConstructionPhotoExportProgress) => void;
      signal: AbortSignal;                          // 中断 (R15.9)
    },
  ): Promise<{ blob: Blob; failed: string[] }>;      // failed=取得/加工失敗の写真id (R15.10)
}
// signboardMode='composited' は GET print-image、'plain'/'original' は GET .../original（非合成原本）を取得元とし、
// resolution/format は canvas 再エンコードで適用する（original は設定を適用せず原本バイトをそのまま格納）。

// 権限フック (R17)
function useConstructionPhotoPermission(): ConstructionPhotoPermission;
// canView=read, canCreate=create, canEdit=update, canDelete=delete を
// usePermission('construction_photo:<action>') で判定（RBAC権限駆動）。

// 未保存離脱警告 (R18) — 既存フックを利用（新規IFなし）
// DetailPage で const uc = useUnsavedChanges({ enabled: canEdit }); を用い、
// 変更発生で uc.markAsChanged()、保存成功で uc.markAsSaved()。
```
- Preconditions: `export()` は `photos.length>0`（0件は呼び出し側で非実行・通知 R15.11）。ビューアは対象写真が要求プロジェクト配下であること。
- Postconditions: `export()` は ZIP Blob とダウンロードをもたらし、`failed` を通知に反映。`useConstructionPhotoPermission` は権限ロード完了まで全 `false`（安全側 R17.5）。

### Frontend Interfaces（R20 送信アダプタ）

本 spec が所有するのは以下の 2 つの契約のみである。保持機構側の契約（`usePendingUploads`/`PendingUploadPanelProps`）は site-survey spec Req37 が所有するため、ここでは接続点のみを規定する。

```typescript
// 工事写真のアップロード送信アダプタ (R20.1, R20.16, R20.21)
// 1ファイル=1リクエストで最大5並列（R11.5）。失敗は File の実体ごと集約して返す。
interface UploadWavesResult {
  successful: ConstructionPhotoWithUrls[];
  failed: FailedUpload[];                       // 再送可否は本関数内で確定済み
}
function uploadFilesInWaves(
  albumId: string,
  files: File[],
  options?: { concurrency?: number; onProgress?: (p: UploadProgress) => void },
): Promise<UploadWavesResult>;

// ImageUploader へ注入するハンドラ。UploadOutcome を返すことで保持が成立する (R20.1)
// PhotoUploaderProps は既存のまま（albumId/projectId/onPhotosAdded/onNotify/disabled）。
type PhotoUploadHandler = (files: File[]) => Promise<UploadOutcome>;
```

- **Preconditions**: `uploadFilesInWaves` に渡す `files` は `ImageUploader` の前段検証（サイズ50MB以下）を通過した圧縮済みファイル。再送時は圧縮を経ずに同一 `File` が渡る。
- **Postconditions**: 戻り値の `failed[]` は送信した `File` を一意に指し、`kind` が確定している。成功分は `onPhotosAdded` で親へ通知し、失敗の通知文言（`buildNotice`）は従来どおりファイル名の一覧で構成する（挙動保存）。
- **Invariants**:
  - 応答の `failed[]` は `ApiError(207, item.error)` として分類器へ渡す。文字列の失敗理由のみを上位へ渡さない（413 が再送可へ倒れるため）。工事写真側で失敗理由から再分類しない（分類の二重定義を作らない）。
  - **成功分の通知（`onPhotosAdded`）および失敗通知（`onNotify`）の例外を、送信の失敗として扱わない**。`ImageUploader.submitFiles` の catch は試行対象の**全ファイル**を保持へ回すため、成功分の通知で例外が伝播すると、サーバー登録済みの画像まで未送信画像として保持され、再送で重複登録される。`handleUpload` は通知の呼び出しを個別に保護し、通知の失敗が `UploadOutcome` の `failed[]` を汚染しないようにする。これは R20.14 が守る「同一画像の重複登録を避ける」不変条件をアダプタ層でも維持するためである。
  - `uploadFilesInWaves` 自体は例外を投げない（各リクエストを個別に捕捉し `failed[]` へ集約する）。したがって `handleUpload` が reject しうるのは通知経路のみであり、上記の保護でアダプタ層の例外経路は塞がれる。
- **決定: 権限喪失時の保持の扱い（R17 との相互作用）** — `PhotoUploader` は `canEdit` 配下に描画されるため、編集権限を失うとアンマウントで保持中の未送信画像が解放される。R17.1（編集権限なしは操作手段を表示しない）を優先する。編集権限のないユーザーが再送してもバックエンドが 403 で拒否するため、保持を続けても再送は成立せず「再送できるはず」という誤った期待を生むからである。

### API Contracts

| Method | Endpoint | Request | Response | Errors |
|--------|----------|---------|----------|--------|
| GET | /api/projects/:projectId/construction-photos | page,limit,filter,sort,order | Paginated<AlbumDto> | 401,403 |
| POST | /api/projects/:projectId/construction-photos | {name,memo?} | AlbumDto | 400,401,403 |
| GET | /api/construction-photos/:id | - | AlbumDto | 401,403,404 |
| PATCH | /api/construction-photos/:id | {name?,memo?,updatedAt} | AlbumDto | 400,401,403,404,409 |
| DELETE | /api/construction-photos/:id | - | 204 | 401,403,404 |
| GET | /api/construction-photos/:id/images | - | ConstructionPhotoWithUrls[] | 401,403,404 |
| GET | /api/construction-photos/images/:imageId/print-image | - | image/jpeg（看板ありはオンデマンド合成） | 401,403,404 |
| GET | /api/construction-photos/images/:imageId/original | - | image/*（看板配置有無に関わらず非合成の原本をストリーム。ビューア/ZIP用） | 401,403,404 |
| POST | /api/construction-photos/:id/images | multipart images[] (≤10, ≤10MB) | ConstructionPhotoWithUrls[] | 400,401,403,413 |
| POST | /api/construction-photos/:id/images/from-surveys | {surveyImageIds[]} | ConstructionPhotoWithUrls[] | 400,401,403,404 |
| PATCH | /api/construction-photos/images/batch | metadata batch | ConstructionPhotoWithUrls[] | 400,401,403 |
| PUT | /api/construction-photos/:id/images/order | {orders[]} | 204 | 400,401,403 |
| DELETE | /api/construction-photos/images/:imageId | - | 204 | 401,403,404 |
| GET/POST/PATCH/DELETE | /api/(projects/:projectId/)construction-signboards(/:id) | SignboardInput | SignboardDto | 400,401,403,404,409 |

**Implementation Notes**
- Integration: ルートは `authenticate` + `requirePermission('construction_photo:<action>')`（看板は `construction_signboard:*`）+ `validate()`。二重マウントで nested/flat を提供。
- Validation: multer `array('images',10)` + `fileSize 10MB`、マジックバイト検証、コメント≤2000、`freeItems`/`footerText` 長制限（設計時定数化）。
- Risks: PDF出力時の写真ごとオンデマンド合成のため、印刷対象が多いと export 時のサーバ処理が増える（低頻度操作のため許容、必要なら将来キャッシュ導入）。合成失敗は当該写真でエラー通知し export を中断。

### UI Components（Summary-only）
`ConstructionPhotoResponsiveView/ListTable/ListCard/SearchFilter` は site-survey 同名部品のクローン。`PhotoItemPanel` は `PhotoManagementPanel`（コメント500msデバウンス＋フォーカス離脱flush、未保存→手動保存、HTML5ドラッグ並び替え）を踏襲。`SignboardPlacementEditor` は fabric キャンバスに写真背景＋1枚の緑Rectを可動・拡縮し、保存時に `{left,top,width,height}` を画像ピクセル座標へ換算。`ConstructionPhotoSectionCard` は `ProjectSurveySummary` 相当のサマリを受けて `ScheduleSectionCard` 直下に描画。

## Error Handling

### Error Strategy
- 入力検証は境界（zodスキーマ/multer）で fail fast。バッチ処理は部分失敗を許容し、成功分は確定・失敗分のみ通知（R12.5, R11.5）。
- アップロードの失敗は**通知と保持を併存**させる。通知（失敗件数と理由の提示）は従来どおり画面が行い、保持（画像の実体を残して再送可能にする）は `ImageUploader` が行う。両者は独立した関心事であり、片方が他方を代替しない（R12.5 と R20 の共存）。

### Error Categories and Responses
- **User (4xx)**: 形式外/サイズ超過/件数超過→413/400 でフィールド単位エラー（R4.5,R12.3）。未認証401・権限なし403（R13）。対象アルバム/写真なし404。楽観排他競合409（R1.5）。
- **System (5xx)**: ストレージ保存失敗→当該写真は未登録として通知し他は維持（R12.5）。合成失敗→当該写真は看板なしにフォールバックせず、エラー通知し保存を中断（データ不整合回避）。
- **Business (422相当)**: 印刷対象0件→PDF実行せず通知（R10.13）。使用中看板の削除→使用件数を返し確認（R8.8）。

### アップロード失敗の分類（R20.16, R20.21）

判定に迷う場合は `retriable` に倒す。`permanent` の誤判定は撮影画像の喪失に直結するのに対し、`retriable` の誤判定は無駄な再送に留まるためである。

| 失敗の形 | 区分 | 挙動 |
|---|---|---|
| `0` / `502` / `503` / `504`（サーバー到達前） | retriable | まず段階的バックオフで自動再試行。尽きたら保持（R20.13） |
| 送信の時間切れ（120秒） | retriable | 自動再試行せず保持し、ユーザー操作の再送に委ねる（R20.19, R20.20） |
| `401` → トークン更新成功 | 失敗としない | 無操作で送信を継続（R20.11） |
| `401` → トークン更新失敗 | retriable | 共通手段でセッション切れを通知したうえで保持（R20.12） |
| `400`（入力検証） / `413`（サイズ上限） | **permanent** | 再送対象から除外し、再送しても解消しない旨と理由を提示（R20.16, R20.17） |
| `207` かつ失敗理由が画像形式の非対応 | **permanent** | 同上 |
| `207` かつストレージ障害・画像処理失敗・DBエラー | retriable | 再送対象として保持（R20.21） |
| `500` その他・`ApiError` でない例外 | retriable | 自動再試行はせず保持（R20.14） |

保持中の画像が全て `permanent` の場合、再送手段は非表示にせず**実行不可の状態で提示**し、破棄の操作手段のみを有効にする（R20.18）。

### Monitoring
- 既存の監査ログ（`AuditLogService`）と Sentry を踏襲。合成・アップロードの失敗はエラーログに写真ID・アルバムIDを記録。

## Testing Strategy

### Unit Tests
- `ConstructionPhotoImageService.addFromSurveyImage`: `storage.copy` が original/thumbnail の2キーを複製し、寸法を複製元から流用、`sourceSurveyImageId` を記録する（R6.2,R6.3）。
- `ConstructionPhotoMetadataService.updateMetadataBatch`: displayOrderの1..n正規化と、signboardId/placementが保持されること。この時点で合成は行わない（R7.6,R9.5）。
- `ConstructionPhotoImageService.getPrintImage`: 看板ありは指定位置・サイズで合成した画像、看板なしは原本を返す（R9,R10.8,R10.9）。
- `SignboardSvgService.generate`: 濃緑地・白罫線・工事件名/工事場所行・自由項目・下部固定テキストを画像ピクセル座標で出力（R8.5）。
- `ConstructionSignboardService.delete`: 使用中の場合 `inUseCount>0` を返す（R8.8）。
- `SignboardCompositeService.composite`: 指定 `placement` 位置・サイズで SVG が合成される（R9）。
- `ConstructionPhotoBulkExportService.export`: signboardMode 別に取得元を切替（composited=print-image, plain/original=原本）、resolution/format を canvas 再エンコードで適用、進捗通知、1件失敗は `failed` に積み継続（R15.2,R15.3,R15.4,R15.10）。
- `ConstructionPhotoBulkExportService.export`: `AbortSignal` abort で AbortError により処理中断し途中生成を破棄する（R15.9）。
- `useConstructionPhotoPermission`: `construction_photo:update` 保持で canEdit、`construction_photo:delete` 保持で canDelete、権限ロード中は全 false（R17.1,R17.2,R17.5）。
- `uploadFilesInWaves`: 送信例外で失敗した画像の `File` 実体と再送可否区分を返す。413 は `permanent`、通信エラーは `retriable`（R20.1,R20.16）。
- `uploadFilesInWaves`: サーバーが 207 で per-file 失敗を返した場合も対応する `File` を返し、画像形式の非対応のみ `permanent`、ストレージ障害は `retriable` に分類する（R20.16,R20.21）。
- `PhotoUploader`: 一部失敗・全件失敗のいずれでも失敗画像が未送信一覧へ反映され、成功分の登録と失敗通知の文言が変わらない（R20.1,R12.5）。
- `PhotoUploader`: 未送信画像を保持した状態で再送を実行すると、圧縮を経ずに同一 `File` が送信され、成功分のみ保持から取り除かれる（R20.3,R20.4,R20.5）。
- `PhotoUploader`: 破棄は確認の承諾時にのみ保持を解放し、アップロード実行中は再送・破棄の操作を受け付けない（R20.8,R20.10）。
- `PhotoUploader`: 保持中の画像が全て `permanent` の場合、再送手段が実行不可の状態で提示される（R20.18）。
- `PhotoUploader`: `onPhotosAdded` が例外を投げても、**成功した画像が未送信画像として保持されない**（登録済み画像の重複登録を招かない）。失敗した画像のみが保持される（R20.5,R20.14）。
- `construction-photo-images`: `uploadConstructionPhotos` が素の `fetch` ではなく `apiClient.sendFormData` へ委譲する（再試行方針・120秒の送信猶予・401 更新の適用経路を工事写真側で固定する。R20.11,R20.13,R20.15,R20.19）。

### Integration Tests
- 画像一覧API: 1リクエストで全写真＋署名付きURLを返し、写真ごとの個別URL取得が発生しない（R11.2）。
- メタ保存＋並び替え: コメント/印刷対象/配置を1バッチ＋順序1リクエスト＝最大2リクエストで確定（R11.4）。
- アップロードAPI: 10件/10MB制限、マジックバイト検証で不正形式を拒否（R12）。
- サマリAPI: `detail-summary` に `constructionPhotos:{totalCount,latest...}` が同型で含まれる（R2.3）。
- 認可: 未認証401・権限なし403（R13.1,R13.3）。
- 非合成原本エンドポイント: 看板配置済み写真でも生原本（非合成）を返し、一覧DTOに `originalUrl` を含めない。権限なし（`construction_photo:read` 非保持）は403・他プロジェクトの写真は404（存在秘匿。既存の print-image/delete/listWithUrls と同一方針）（R14.6,R15.4,R13.2,R13.4）。
- **形式エラー文言の契約**: 不正な画像形式のアップロードに対し、207 応答の `failed[].error` が `utils/upload-failure` の判定断片（`サポートされていないファイル形式` / `サポートされていない画像形式` / `MIMEタイプと一致しません`）のいずれかを**含む**ことを検証する（R20.16,R20.17,R20.18）。
  - 既存の `construction-photo-image.api.integration.test.ts` は `failed[].fileName` のみを検証しており、メッセージ本文を保証していない。工事写真が独自の検証メッセージを持った瞬間に恒久／一時の分類が `retriable` へ倒れ、再送不可の区別が無言で壊れるため、この1項目でフロントとバックエンドの文言契約を固定する。
  - **情報源はバックエンドの検証エラー定義**（`survey-image.service` の `InvalidFileTypeError` / `InvalidMagicBytesError` / `UnsupportedImageFormatError`）とし、統合テストはその定義から得たメッセージで照合する。テスト内に文言を書き下ろさない（二重定義を作らないため）。backend と frontend は別パッケージであり、バックエンドのテストからフロントの定数を import することはできないため、フロントの `UNSUPPORTED_FORMAT_MESSAGE_FRAGMENTS` 側は当該エラー定義に由来することをコメントで示す（記載済み）。
  - 恒久解はバックエンドの per-file 失敗へエラーコードを付与し、文言でなくコードで分類することだが、`survey-image.service` 側の変更を伴うため本 spec の Out of Boundary とする。本項目はその移行までの回帰検知として機能する。

### E2E/UI Tests（Playwright, 要件はE2Eで検証して完了）
- プロジェクト詳細→工事写真パネル（工程表直下）→一覧→詳細への遷移（R2.1,R2.2,R2.4）。
- ローカル/カメラ/現調コピーで写真項目を追加→並び替え→印刷対象チェック→保存（R4,R5,R6,R7）。
- 看板をプレビュー上で配置→保存→PDF出力で表紙＋No.連番＋看板重畳を確認（R8,R9,R10）。
- 印刷対象0件時にPDFが実行されず通知される（R10.13）。
- 写真サムネをクリックしてビューアへ遷移し、ズーム・90度回転・パンが機能し、閉じて詳細へ戻る（R14）。
- ZIP一括エクスポート: 形式/解像度/看板モードを選択し、全件および選択でZIP生成、進捗表示・中断が機能し、0件時は非実行で通知（R15）。
- アルバム編集導線→編集画面遷移、削除導線→確認→削除後に一覧へ遷移（R16）。
- 削除権限を持たないユーザー（user）でアルバム削除・写真削除の導線が非表示、編集権限なしで詳細が読み取り専用（R17）。
- 未保存変更ありでアプリ内遷移/リロード時に離脱警告が出て、保存後は警告が出ない（R18）。
- モバイル幅で詳細画面が横スクロールせず縦積み表示になる（R19）。
- アップロード応答をサーバーエラーへ差し替えて失敗させ、未送信件数とサムネイル・ファイル名・失敗理由が表示される（R20.1,R20.2）。
- 差し替えを解除して再送し、写真項目が一覧へ追加され未送信の表示が解消する（R20.3,R20.5,R20.6）。
- サイズ上限超過（413）の応答へ差し替え、当該画像が再送不可として区別され、再送手段が実行不可となり理由が提示される（R20.16,R20.17,R20.18）。
- 破棄の確認ダイアログを承諾すると未送信の表示が消える（R20.7,R20.8）。
- 一時的な通信障害（`503`）で失敗させたのち復旧させ、再送が成功する（R20.1,R20.3,R20.5,R20.6）。オフライン切替はローカル環境で機能しないため用いず、応答差し替えで再現する。**自動再試行（R20.13）を主張する場合は、差し替え中の同一パスへのリクエストが2回以上発生したことを観測する**。回数を観測しないなら本シナリオのラベルに R20.13 を含めない。

**R20 の検証責務の切り分け**

E2E で観測できる受入基準と、共有クライアントの内部挙動として単体テストでのみ観測できる受入基準を区別する。工事写真の E2E に観測しないラベルを付けない（カバレッジの過大主張を作らないため）。

| 受入基準 | 検証手段 | 備考 |
|---|---|---|
| 20.1〜20.3, 20.5〜20.8, 20.16〜20.18 | 工事写真 E2E | 画面に現れる状態と操作結果として観測可能 |
| 20.4, 20.9, 20.10 | `PhotoUploader` 単体テスト | 再圧縮の有無・保持の温存・実行中抑止は画面から区別しにくい |
| 20.11, 20.12, 20.13, 20.14, 20.15, 20.19, 20.20 | `api/client.ts` の単体テスト（所有は site-survey Req37）＋ `construction-photo-images` 単体テストの `sendFormData` 委譲確認 | 再試行方針・送信猶予・401 更新は共有クライアントの内部挙動。工事写真側は「その経路を通っていること」を確認すれば足りる |
| 20.21 | `PhotoUploader` 単体テスト（207 のストレージ障害が `retriable`）＋ 上記の形式エラー文言の契約テスト | フロントの分類とバックエンドの文言の両側で固定する |

**E2E の前提と観測方針**: テスト環境（frontend 5174 / backend 3100 / postgres 5433）を用い、フロントは本番ビルドのため事前ビルドが必要。応答差し替えの観測は**オリジンではなくパス基準**で行う（CI と ローカルで API オリジンが食い違い、オリジン依存の観測は全件素通りするため）。固定時間待機を用いず明示的な条件待ちのみで構成する。

### Performance
- アルバム50件ページング・一括署名URL取得でリクエスト数が写真数に比例しないこと（R11.1,R11.2）。
- アップロード並列度が最大5に制限されること（R11.5）。

## Security Considerations
- 認可: 新規 RBAC 権限 `construction_photo:{create,read,update,delete}`、`construction_signboard:{create,read,update,delete}`。全ルートで `authenticate`＋`requirePermission`。
- データ分離: アルバム/写真/看板の取得時に対象が要求プロジェクト配下であることをサービスで検証（R13.2）。
- 配信: 原本・サムネ・合成画像はすべて署名付きURL（TTL 900s）で配信し公開パスを用いない（R13.4）。
- UI権限出し分け（R17）はフロントの体験向上であり権威ではない。実際の認可はバックエンド RBAC（`requirePermission`）が権威で、非表示化した操作もサーバ側で403となる（多重防御）。`useConstructionPhotoPermission` は権限ロード完了まで安全側（非表示）に倒す（R17.5）。
- 未送信画像の保持（R20）はブラウザのメモリ上のみで、`File` 実体も `ObjectURL` も永続化しない。端末ローカル保存は Out of scope であり、画面離脱・リロードで保持は失われる（撮影画像が端末に残り続けることによる情報残留を作らない）。`ObjectURL` は保持から外れた時点・破棄時・アンマウント時に必ず解放する。
- 認証期限切れからの復帰（R20.11）はリフレッシュトークンによる既存の更新経路を用い、再送のために資格情報を画面へ保持しない。更新失敗時は共通のセッション切れ通知へ倒し、失敗を握り潰さない（R20.12）。

## Performance & Scalability
- リクエスト効率（R11）は既存 site-survey 方針を踏襲: 一覧`limit=50`、詳細は写真一覧＋署名URLを一括取得（N+1回避）、サムネ優先・原本/印字画像は必要時、保存は最大2リクエスト、アップロード並列5、署名URL TTL 900s。
- 看板合成はPDF出力時（低頻度）にオンデマンド実行し、通常の一覧・詳細・保存フローには合成処理を持ち込まない。
