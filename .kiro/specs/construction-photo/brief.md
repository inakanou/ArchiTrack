# Brief: construction-photo（工事写真）

## Problem
現場の工事写真（施工前・施工中・施工後などの写真とコメント）を、プロジェクトごとに整理・管理し、印刷対象を選別して工事看板付きのPDF（工事写真台帳）として出力する手段が ArchiTrack に存在しない。現状は現場調査（site-survey）機能で写真管理はできるが、工事写真台帳としての出力（工事看板の重畳、印刷対象の選別、台帳向けPDF）には対応していない。

## Current State
- 写真＋コメント＋並び替え＋印刷対象チェック＋PDF出力の完全な雛形として `site-survey`（現場調査）機能が稼働中。工事写真機能はこれを踏襲できる。
- 画像アップロード（ローカル/カメラ/ドラッグ&ドロップの3系統）、サムネイル生成、署名付きURL配信、写真並び替え、コメント編集、印刷対象フラグ（`includeInReport`）は site-survey で実装済み・再利用可能。
- 画像への重畳（オーバーレイ）合成パスも既存: サーバ側 `sharp().composite()`（`annotated-thumbnail.service.ts`）、クライアント側 fabric canvas 合成の両方が存在。工事看板の写真への重畳に流用できる。
- プロジェクト詳細画面のサブ機能パネル（`XxxSectionCard`）＋一覧画面（`XxxResponsiveView`＝Table/Card切替）パターンが確立済み。
- 工事写真・工事看板に該当するコード/スペックは未存在（グリーンフィールド）。

## Desired Outcome
- プロジェクト詳細画面に工事写真パネルが表示され、工事写真一覧画面へ遷移できる。
- 工事写真一覧画面は他機能と同一UI（レスポンシブなTable/Card切替、検索フィルタ、ページング）を持つ。
- 工事写真詳細画面で、写真項目（写真＋コメント）の一覧表示、並び替え、印刷対象チェックボックスによる選別、チェックされた項目のPDF出力ができる。
- 写真項目を「ローカルアップロード」「カメラ撮影」「同一プロジェクトの現場調査写真の参照（コピー）」の3系統で追加できる。
- プロジェクト単位で登録した工事看板を、写真項目ごとに選択し、大きさと表示位置を指定でき、PDF出力時に指定位置へ看板が重畳される（看板指定は任意）。

## Approach
実績のある `site-survey` の垂直スライスをほぼ踏襲し、工事写真ドメインとして複製・拡張する。工事看板は同一スペック内の独立モジュールとして実装する。

- **モデル**: `ConstructionPhotoAlbum`（≒`SiteSurvey`: projectId/name/soft-delete）＋ `ConstructionPhoto`（≒`SurveyImage`: displayOrder/comment/includeInReport/paths）。工事看板は `ConstructionSignboard`（projectId スコープの構造化テキスト項目マスタ）。写真への看板配置は `ConstructionPhoto` 側の nullable FK（signboardId）＋座標/サイズJSON（表示位置・大きさ）で保持（site-survey 写真が `ImageAnnotation` を参照するのと同型の接合）。
- **アップロード**: `ImageUploader`（3系統）を再利用。現場調査写真の参照は**コピー（独立複製）**とし、参照時に元画像を工事写真側ストレージへ複製して以降は独立管理する（元画像の変更・削除の影響を受けない）。
- **工事看板**: 構造化テキスト項目（工事名・施工者・工期・場所等）を登録し、システムが看板画像を描画（SVG/canvas）してPDF出力時に写真へ合成。合成は site-survey 既存の合成パス（クライアント fabric / サーバ sharp）を流用。
- **PDF出力**: site-survey と同じく**クライアントサイド jspdf**（`PdfReportService` パターン、日本語フォント `PdfFontService`）。`includeInReport` の写真項目のみ出力し、看板指定があれば指定位置に重畳。
- **画面/導線**: 一覧は `XxxResponsiveView` パターン、詳細は `SiteSurveyDetailPage` パターン、プロジェクト詳細パネルは `ConstructionPhotoSectionCard` を追加し `getProjectDetailSummary` にサマリを追加、ルートは `/projects/:projectId/construction-photos` の nested パターンで登録。

## Scope
- **In**:
  - 工事写真一覧画面（他機能同様のレスポンシブUI・検索・ページング）
  - 工事写真詳細画面（写真項目一覧、並び替え、印刷対象チェック、PDF出力）
  - 写真項目追加の3系統（ローカル / カメラ撮影 / 現場調査写真のコピー参照）
  - プロジェクト詳細画面の工事写真パネル＋遷移導線
  - 工事看板マスタ（プロジェクト単位・構造化テキスト項目）の登録・管理（CRUD）
  - 写真項目への工事看板の選択・大きさ・表示位置指定（任意）と、PDF出力時の指定位置への重畳
- **Out**:
  - 工事看板の画像アップロード形式（今回は構造化テキスト描画のみ。将来拡張候補）
  - 会社全体・複数プロジェクト横断での看板マスタ共有（プロジェクト単位に限定）
  - 現場調査写真のリンク（共有参照）方式（コピー方式に限定）
  - 現場調査（site-survey）機能側の改修（アノテーション等の既存機能変更は含まない）
  - サーバサイドPDF生成への移行（クライアントサイド jspdf を踏襲）

## Boundary Candidates
- 工事写真アルバム/写真項目 のモデル・API・ストレージ（site-survey 複製）
- 写真項目アップロード（ローカル/カメラ/現場調査コピー参照）
- 工事看板マスタ（プロジェクト単位・構造化テキスト）の CRUD・一覧
- 写真項目↔工事看板の配置（FK＋位置/サイズ）と PDF 重畳合成
- 一覧画面 / 詳細画面 / プロジェクト詳細パネルのフロント結線

## Out of Boundary
- 現場調査（site-survey）機能そのものの仕様変更（読み取り・コピー参照のみ）
- プロジェクト管理（project-management）の中核仕様変更（サマリ項目とパネル追加に限定）
- 会社横断の看板マスタ／看板画像アップロード／PDFのサーバ移行

## Upstream / Downstream
- **Upstream**: `project-management`（プロジェクト配下機能・詳細パネル/サマリ）、`site-survey`（写真コピー参照元・アップロード/合成/PDFの再利用パターン）、共通ストレージ層（local/R2 + 署名付きURL）、認証（user-authentication）。
- **Downstream**: 将来的な工事写真台帳の帳票拡張、看板マスタの会社共有化・画像アップロード対応、他機能への一括エクスポート連携の候補。

## Existing Spec Touchpoints
- **Extends**: なし（新規スペック）。
- **Adjacent**:
  - `site-survey` — 写真管理/アップロード/合成/PDFパターンの参照元。コピー参照で読み取り連携するが、site-survey 側は改修しない（重複・干渉に注意）。
  - `project-management` — 詳細画面パネルとプロジェクトサマリ API を拡張（`getProjectDetailSummary` にフィールド追加）。

## Constraints
- 技術スタックは既存踏襲: Backend = Express 5 + Prisma 7.8(Postgres) + multer + sharp、Frontend = React 19 + Vite + react-router-dom 7 + fabric 7 + jspdf、ストレージ = 署名付きURL配信（local/R2）。
- 言語: 生成物（requirements.md/design.md/tasks.md 等）は日本語（spec.json.language=ja）。
- 画像配信は署名付きURLのみ（公開パス禁止）。既存の site-survey 配信規約に準拠。
- コミット規約: subject は小文字、body は1行100文字以内、Gitフック迂回（--no-verify）禁止。
- 要件はE2E（Playwright）でフロント結線まで検証して初めて完了とする（BE/UI部品単体では未完了扱い）。
