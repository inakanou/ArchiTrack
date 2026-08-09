# Implementation Plan

- [ ] 1. Foundation: データモデル・権限・共有型
- [x] 1.1 Prisma に3モデルを追加しマイグレーションを作成
  - `ConstructionPhotoAlbum` / `ConstructionPhoto` / `ConstructionSignboard` を既存規約（uuid・`@@map` snake_case・`@@index`）で定義
  - `signboardId` は nullable ＋ `onDelete: SetNull`、`albumId`/`projectId` は `onDelete: Cascade`、`displayOrder`/`comment`/`includeInReport`/`deletedAt` を配置
  - `signboardPlacement Json?`、`sourceSurveyImageId String?`（FKにはしない）、`ConstructionSignboard` に `workName`/`workLocation`/`freeItems Json`/`footerText String?`
  - 完了: `prisma migrate` で3テーブルが作成され `prisma generate` が成功する
  - _Requirements: 1.1, 8.1, 9.1_
- [x] 1.2 RBAC 権限の定義とロール割当シード
  - `construction_photo:{create,read,update,delete}`、`construction_signboard:{create,read,update,delete}` を権限定義に追加
  - 既存ロールへ付与するシード/マイグレーションを用意
  - 完了: 付与ロールは操作でき、未付与ユーザーは403になる
  - _Requirements: 13.1, 13.3_
- [x] 1.3 共有型とバリデーションスキーマ
  - DTO・`SignboardPlacement`・`SignboardFreeItem`、アップロード制約（最大10件/10MB/許可形式）、コメント最大2000、`footerText`/`freeItems` の長さ制限を定義
  - 完了: 不正形式・サイズ・件数・長さ超過を境界スキーマで拒否できる
  - _Requirements: 7.2, 8.3, 12.1, 12.2, 12.4_

- [ ] 2. Core: アルバム・写真バックエンド
- [x] 2.1 (P) アルバムCRUD・一覧サービス＋ルート
  - 二重マウント、ページ最大50、名称検索・作成日/更新日ソート、楽観的排他（`updatedAt`）、論理削除
  - 取得系は対象が要求プロジェクト配下であることをサービスで検証
  - 完了: 一覧が50件ページングで返り、作成/更新/削除/取得が動作し、他プロジェクトのアルバムは取得できない
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.1, 3.3, 3.4, 11.1, 13.2_
  - _Boundary: ConstructionPhotoAlbumService_
- [x] 2.2 写真アップロード（ローカル/カメラ）サービス＋ルート
  - multer 最大10件/10MB、sharp で圧縮・寸法取得・サムネ生成、末尾 `displayOrder`、マジックバイト検証、部分失敗は成功分維持
  - 完了: multipart で複数画像を写真項目として登録・サムネ生成し、不正形式/超過を拒否する
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 12.3, 12.5_
  - _Boundary: ConstructionPhotoImageService_
- [x] 2.3 現調写真コピー機能
  - `storage.copy` で original＋thumbnail を複製、寸法/サイズは複製元 `SurveyImage` から流用、`sourceSurveyImageId` 記録、site-survey へは書込まない
  - 完了: 選択した同一プロジェクトの現調写真が独立写真項目として複製され、元の変更・削除の影響を受けない
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - _Depends: 2.2_
  - _Boundary: ConstructionPhotoImageService_
- [x] 2.4 写真一覧取得（署名URL一括）
  - `displayOrder` 昇順で全写真＋サムネ/印字画像URLをまとめて返し、写真項目ごとの個別リクエストを発生させない
  - 取得は対象アルバムが要求プロジェクト配下であることを検証
  - 完了: 詳細1回のリクエストで全写真項目と署名付きURLを取得できる
  - _Requirements: 7.8, 11.2, 11.3, 13.2_
  - _Depends: 2.2_
  - _Boundary: ConstructionPhotoImageService_
- [x] 2.5 メタ一括更新・並び替え・削除
  - コメント/印刷対象/`signboardId`/`signboardPlacement` のバッチ更新（`displayOrder` 1..n正規化、合成は行わない）＋順序更新＋写真削除（関連ストレージも削除）
  - 完了: コメント/印刷対象/配置のバッチ＋順序の最大2リクエストで確定し、削除で写真と関連データが消える
  - _Requirements: 7.1, 7.3, 7.4, 7.5, 7.6, 7.7, 9.1, 9.5, 11.4, 13.2_
  - _Depends: 2.4_
  - _Boundary: ConstructionPhotoMetadataService_

- [ ] 3. Core: 工事看板バックエンド
- [x] 3.1 (P) 看板マスタCRUD・一覧サービス＋ルート
  - プロジェクト単位、工事件名/工事場所＋自由項目行＋固定テキスト、使用中削除は使用件数を返す、当該プロジェクト配下でのみ選択・参照可
  - 完了: 看板の作成/編集/削除/一覧が動作し、使用中削除で件数>0を返し、他プロジェクトの看板は参照できない
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 8.7, 8.8, 8.9, 8.10, 13.2_
  - _Boundary: ConstructionSignboardService_
- [x] 3.2 (P) 電子小黒板SVGジェネレータ
  - 濃緑地・白罫線、上部に工事件名/工事場所＋自由項目行、下部に固定テキスト欄を画像ピクセル座標で描画
  - 完了: 看板データと配置から画像実寸のSVG文字列を生成する
  - _Requirements: 8.5, 9.3, 9.4_
  - _Boundary: SignboardSvgService_
- [x] 3.3 看板合成＋印字画像エンドポイント（オンデマンド）
  - 看板ありは SVG を原本へ sharp composite（指定位置・大きさ）、なしは原本を返す。保存はしない
  - 完了: 印字画像エンドポイントが看板あり写真に看板を重畳して返し、看板削除済み写真は看板なしとして返す
  - _Requirements: 9.6, 9.7, 10.8, 10.9_
  - _Depends: 3.2, 2.2_
  - _Boundary: SignboardCompositeService, ConstructionPhotoImageService_

- [ ] 4. Integration: プロジェクトサマリ
- [x] 4.1 (P) detail-summary に工事写真セクションを追加
  - `ConstructionPhotoSummaryService.findLatestByProjectId` を用意し、`constructionPhotos: {totalCount, latest...}` を既存セクションと同型で `allSettled` に組み込む
  - 完了: プロジェクト詳細サマリAPIに `constructionPhotos` が含まれる
  - _Depends: 2.1_
  - _Requirements: 2.3_
  - _Boundary: ConstructionPhotoSummaryService, projects.routes detail-summary_

- [ ] 5. Core: フロントAPIクライアント
- [x] 5.1 API クライアントと型の実装
  - 一覧/CRUD/アップロード/現調コピー/一覧取得/メタ更新/並び替え/看板CRUD/印字画像 の各呼び出しを型付きで用意
  - 完了: 各エンドポイントを型安全に呼び出せるクライアントが揃う
  - _Depends: 2.1, 2.5, 3.1, 3.3_
  - _Requirements: 1.1, 3.1, 4.1, 6.1, 7.1, 8.1_

- [ ] 6. Core: 画面
- [x] 6.1 (P) 工事写真一覧画面
  - 他機能同様のレスポンシブUI（表/カード切替）、検索・ソート・ページング、タイトル「工事写真一覧」、代表サムネ優先表示
  - 完了: 一覧がデスクトップ表/モバイルカードで表示され、検索・ページングが動作する
  - _Depends: 5.1_
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 2.4, 11.3_
  - _Boundary: ConstructionPhotoListPage_
- [x] 6.2 (P) アルバム作成/編集画面
  - 完了: 作成フォーム送信で新規アルバムが作成され一覧に反映される
  - _Depends: 5.1_
  - _Requirements: 1.1, 1.3_
  - _Boundary: ConstructionPhotoCreatePage_
- [x] 6.3 詳細画面：写真項目管理＋3系統アップロード
  - 写真項目パネル（コメント・並び替え・印刷対象チェック、未保存→保存で最大2リクエスト）、3系統アップローダ（ローカル/カメラ/現調選択モーダル）、アップロードは最大5並列・部分失敗継続、サムネ優先表示
  - 完了: 3系統で写真項目を追加し、並び替え・印刷対象・コメントを1保存操作で確定できる
  - _Depends: 5.1_
  - _Requirements: 4.1, 4.2, 5.1, 5.3, 6.1, 7.1, 7.3, 7.4, 7.5, 7.6, 7.8, 11.3, 11.4, 11.5_
  - _Boundary: ConstructionPhotoDetailPage_
- [x] 6.4 (P) 看板配置エディタ
  - fabric で写真背景に1枚の緑ボードRectをドラッグ・拡縮し、表示座標を画像ピクセル座標へ換算して保存、看板未指定を許容
  - 完了: プレビュー上で看板の位置・大きさを指定して保存でき、未指定も可能
  - _Depends: 5.1_
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  - _Boundary: SignboardPlacementEditor_
- [x] 6.5 (P) 看板マスタ管理画面
  - 標準項目＋自由項目行＋固定テキストの登録・編集・削除・一覧、使用中削除は確認ダイアログ、当該プロジェクト配下のみ
  - 完了: 看板の登録/編集/削除/一覧がUIで完結し、使用中削除時に確認が出る
  - _Depends: 5.1_
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 8.8, 8.9, 8.10_
  - _Boundary: ConstructionSignboardListPage_

- [ ] 7. Integration: ナビ・パネル・ルート
- [x] 7.1 ルート登録とブレッドクラム
  - `routes.tsx` に一覧/詳細/作成/看板の各ルートを site-survey 順序規約で追加、各画面のブレッドクラム表示
  - 完了: 各URLへ遷移でき、ブレッドクラムが規定の階層表示になる
  - _Depends: 6.1, 6.2, 6.3, 6.5_
  - _Requirements: 2.5, 2.6, 2.7, 2.8, 2.9_
- [x] 7.2 プロジェクト詳細への工事写真パネル追加
  - `ScheduleSectionCard`（工程表）の直下に工事写真パネルを挿入、サマリ件数表示と一覧への遷移
  - 完了: プロジェクト詳細で工程表パネルの直下に工事写真パネルが表示され、一覧へ遷移できる
  - _Depends: 4.1, 6.1_
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 8. Integration: 台帳PDF
- [x] 8.1 台帳版組・表紙・写真ページレンダラ
  - A4寸法・写真枠/右カラム比率・点線本数・行高を定数化し参考書式に合わせる。表紙（外枠＋「工事写真」＋工事名＋工事施工者[company-info]）、写真ページ（1ページ3枠・左写真/右No.＋点線コメント欄）、No.通し番号、余白枠、日本語フォント
  - 完了: 表紙付き・1ページ3枠・No.連番の台帳レイアウトが定数化されて描画される
  - _Depends: 6.3_
  - _Requirements: 10.2, 10.4, 10.5, 10.6, 10.7, 10.10, 10.11_
  - _Boundary: ConstructionPhotoLedgerService_
- [x] 8.2 PDF出力結線（印字画像・看板重畳・0件通知）
  - 印刷対象の写真のみを対象に印字画像をオンデマンド取得して重畳、保存順で出力、印刷対象0件は非実行で通知
  - 完了: 印刷対象のみのPDFが出力され看板あり写真に看板が重畳、0件時は通知して出力しない
  - _Depends: 3.3, 6.4, 8.1_
  - _Requirements: 10.1, 10.3, 10.12, 10.13_
  - _Boundary: ConstructionPhotoLedgerService_

- [ ] 9. Validation: テスト
- [x] 9.1 (P) バックエンド単体テスト
  - 現調コピーの複製・独立性、メタの `displayOrder` 正規化と合成非実行、SVG生成、看板使用中削除の件数返却、印字画像のオンデマンド合成
  - 完了: 対象サービスの単体テストが緑になる
  - _Requirements: 6.2, 6.3, 7.6, 8.5, 8.8, 9.5, 10.8_
- [x] 9.2 (P) 統合テスト
  - 画像一覧の一括署名URL（N+1なし）、メタ＋順序が最大2リクエスト、アップロード制約、detail-summary、認可401/403、プロジェクト境界の取得検証
  - 完了: 統合テストが緑で、リクエスト効率・制約・認可・データ分離を検証する
  - _Requirements: 2.3, 11.1, 11.2, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3, 12.4, 12.5, 13.1, 13.2, 13.3, 13.4_
- [x] 9.3 E2E テスト（Playwright）
  - パネル遷移（工程表直下）→3系統追加→並び替え→印刷対象→保存、看板配置→PDF出力で表紙/No.連番/看板重畳、印刷対象0件の通知
  - 完了: 主要ユーザーフローのE2Eが緑になる
  - _Depends: 7.1, 7.2, 8.2_
  - _Requirements: 2.1, 2.2, 4.1, 5.1, 6.1, 7.1, 8.1, 9.1, 10.1, 10.13_

- [ ] 10. Foundation（追加機能）: 非合成原本の配信路
- [x] 10.1 非合成原本エンドポイント＋サービス
  - `getOriginalImage(photoId)` を追加し、看板配置の有無に関わらず看板を合成しない生原本を返す
  - 配信ルート `GET /api/construction-photos/images/:imageId/original` を追加。`authenticate`＋`requirePermission('construction_photo:read')`＋対象が要求プロジェクト配下であることを検証
  - 一覧DTO（`ConstructionPhotoWithUrls`）には `originalUrl` を追加しない（既存の効率・非公開方針を維持）
  - 完了: 看板配置済み写真でも `/original` が非合成の原本をストリーム返却し、権限なし（`construction_photo:read` 非保持）は403・他プロジェクトの写真は404（存在秘匿。既存の print-image/delete/listWithUrls と同一方針）、一覧DTOに `originalUrl` は現れない
  - _Requirements: 14.6, 15.4, 13.2, 13.4_
  - _Boundary: ConstructionPhotoImageService, construction-photo-images.routes_
- [x] 10.2 フロントAPIクライアント：原本取得
  - 非合成原本を取得する呼び出し（Blob返却）を型付きで追加
  - 完了: 画像IDから非合成原本Blobを型安全に取得できる
  - _Depends: 10.1_
  - _Requirements: 14.6, 15.4_
  - _Boundary: construction-photo-images api_

- [ ] 11. Core（追加機能）: フロント基盤・部品
- [x] 11.1 (P) 工事写真権限フック
  - `construction_photo:{read,create,update,delete}` の保持状況から canView/canCreate/canEdit/canDelete と権限エラーメッセージ取得を提供、権限ロード中は全て false（安全側）
  - 完了: 権限保持で canEdit=true・非保持で false、`construction_photo:delete` 非保持で canDelete=false、ロード中は全 false を返す
  - _Requirements: 17.1, 17.2, 17.3, 17.5_
  - _Boundary: useConstructionPhotoPermission_
- [x] 11.2 (P) 閲覧専用画像ビューア＋ビューアページ＋ルート
  - 既存のビューポート/ズーム/ジェスチャ/フィット倍率の基盤と90度単位の回転状態を合成した閲覧専用ビューア（注釈編集は持たない）。表示元は非合成原本を必要時取得
  - ビューアページとルート `/construction-photos/:albumId/photos/:photoId` を追加し、閉じる操作で詳細へ戻る。回転ヘルパが未exportの場合はexportまたは小さく再実装する
  - 完了: 当該URLで原本がフルスクリーン表示され、ズームイン/アウト・90度回転・拡大時パンが機能し、閉じると詳細へ戻る
  - _Depends: 10.2_
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_
  - _Boundary: ConstructionPhotoImageViewer, ConstructionPhotoImageViewerPage, routes.tsx_
- [x] 11.3 (P) ZIP一括エクスポートサービス
  - JSZipで束ね、看板モード別に取得元を切替（composited=印字画像／plain・original=非合成原本）、解像度(低/中/高)・形式(JPEG/PNG)は canvas 再エンコードで適用（original は設定を適用せず原本バイトを格納）、進捗通知、AbortSignalで中断、1件失敗は継続し失敗IDを集約
  - 完了: 設定に応じたZIP Blobが生成され、中断で AbortError により停止、1件失敗時も残りを含むZIPと失敗一覧が得られる
  - _Depends: 10.2_
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.8, 15.9, 15.10_
  - _Boundary: ConstructionPhotoBulkExportService_
- [x] 11.4 (P) エクスポート設定・進捗・中断UI
  - 形式/解像度/看板モードの選択フォーム、進捗（完了/総数）ダイアログ、中断ボタン、対象0件は非実行で通知、写真未選択時は選択エクスポートを無効化
  - 完了: ダイアログで条件を選んで開始でき、進捗表示・中断が機能し、0件時は通知して実行されない
  - _Requirements: 15.7, 15.11_
  - _Boundary: BulkExportDialog, BulkExportProgressDialog, ExportSettingsForm_
- [x] 11.5 (P) アルバム削除確認ダイアログ
  - フォーカストラップ（FocusManager）付きの削除確認ダイアログ部品。関連する写真項目・看板配置も削除される旨を明示
  - 完了: 開くと確認ダイアログが表示され、承認/キャンセルのコールバックがキーボード操作でも実行できる
  - _Requirements: 16.4_
  - _Boundary: AlbumDeleteDialog_

- [ ] 12. Integration（追加機能）: 詳細・一覧への結線
- [x] 12.1 詳細画面に画像ビューア導線を結線
  - 写真項目パネルの画像クリックからビューアページへ遷移する導線を結線
  - 完了: 詳細画面で写真サムネをクリックするとビューアが開く
  - _Depends: 11.2_
  - _Requirements: 14.1_
  - _Boundary: ConstructionPhotoDetailPage_
- [x] 12.2 詳細画面にZIP一括エクスポートを結線
  - エクスポート起動導線、全件/選択の切替、写真項目パネルの選択チェック、進捗/中断表示・ダウンロード確定を結線
  - 完了: 全件および選択でZIPをダウンロードでき、進捗・中断が画面で機能する
  - _Depends: 11.3, 11.4_
  - _Requirements: 15.1, 15.5, 15.6, 15.7, 15.8, 15.9, 15.11_
  - _Boundary: ConstructionPhotoDetailPage, PhotoItemPanel_
- [x] 12.3 アルバム編集・削除導線を結線
  - 詳細画面に編集導線（編集画面へ遷移）と削除導線（確認ダイアログ→削除後に一覧へ遷移）を結線、一覧の各アルバム行にも権限連動の編集/削除導線を追加
  - 完了: 詳細から編集画面へ遷移でき、削除は確認後に実行され一覧へ戻り、一覧行からも編集/削除できる
  - _Depends: 11.5_
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_
  - _Boundary: ConstructionPhotoDetailPage, ConstructionPhotoListPage, ConstructionPhotoListTable, ConstructionPhotoListCard_
- [x] 12.4 権限に基づくUI表示制御を結線
  - 権限フックを用い、編集権限なしは詳細を読み取り専用（追加・コメント・並び替え・印刷対象・看板配置・保存・写真削除を非表示）、削除権限なしはアルバム/写真削除導線を非表示、権限ロード中は安全側で非表示
  - 完了: user（削除権限なし）で削除導線が消え、編集権限なしユーザーで編集系UIが非表示になる
  - _Depends: 11.1, 12.2, 12.3_
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_
  - _Boundary: ConstructionPhotoDetailPage, PhotoItemPanel, ConstructionPhotoListPage_
- [x] 12.5 未保存離脱警告を結線
  - 詳細画面の独自の未保存追跡を共有の未保存フックへ置換し、コメント/印刷対象/並び替え/看板配置の全変更点で未保存化・保存で解消。編集権限がある場合のみ有効
  - 完了: 未保存状態でリロード/アプリ内遷移時に警告が出て、保存後は警告が出ない
  - _Depends: 12.4_
  - _Requirements: 18.1, 18.2, 18.3, 18.4_
  - _Boundary: ConstructionPhotoDetailPage_
- [x] 12.6 詳細画面のモバイルレイアウト対応
  - 画面幅判定で写真とコメント/操作を縦積み、横スクロール抑止、操作コントロールのタップ領域確保、ブレッドクラム水平収め、入力欄フォント16px以上で自動ズーム抑止
  - 完了: モバイル幅で詳細画面が横スクロールせず縦積み表示になり、操作コントロールがタップ可能サイズで表示される
  - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_
  - _Boundary: ConstructionPhotoDetailPage, PhotoItemPanel_

- [ ] 13. Validation（追加機能）: テスト
- [x] 13.1 (P) ZIPエクスポートサービス単体テスト
  - 看板モード別の取得元切替、解像度/形式変換、original の原本バイト維持、進捗通知、AbortSignalでの中断（AbortError）、1件失敗時の継続と失敗集約を検証
  - 完了: 対象サービスの単体テストが緑になる
  - _Requirements: 15.2, 15.3, 15.4, 15.9, 15.10_
  - _Boundary: ConstructionPhotoBulkExportService_
- [x] 13.2 (P) 権限フック単体テスト
  - 権限保持有無での canEdit/canDelete、権限ロード中の全 false を検証
  - 完了: 権限フックの単体テストが緑になる
  - _Requirements: 17.1, 17.2, 17.5_
  - _Boundary: useConstructionPhotoPermission_
- [x] 13.3 E2E テスト（追加機能）
  - ビューアのズーム/回転/パン、ZIPの形式/解像度/看板モード/全件/選択/進捗/中断/0件、アルバム編集・削除導線、権限出し分け（user で削除導線非表示）、未保存離脱警告、モバイル縦積みを検証
  - 非合成原本エンドポイントが看板配置済み写真でも原本を返すことを併せて確認
  - 完了: 追加機能の主要ユーザーフローのE2Eが緑になる
  - _Depends: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_
  - _Requirements: 14.1, 15.1, 16.1, 16.5, 17.2, 18.1, 19.1_

- [x] 14. Core（R20）: 送信アダプタの不変条件の是正
  - 成功した写真項目の親への通知と、部分失敗・全件失敗の通知の呼び出しを個別に保護し、通知で例外が起きても送信の失敗として扱わない
  - 送信そのものは各リクエストを個別に捕捉して失敗へ集約するため例外を投げない。したがって保護すべき例外経路は通知に限られる
  - 部分失敗でも残りの処理を継続する既存挙動と、失敗通知の文言・表示条件は変更しない
  - 完了: 通知処理が例外を投げても、失敗した画像だけが未送信一覧に残り、サーバー登録済みの画像は未送信一覧に現れない
  - _Requirements: 20.5, 20.14_
  - _Boundary: PhotoUploader_

- [ ] 15. Validation（R20）: 工事写真経路の検証
- [x] 15.1 (P) 未送信画像の保持・再送・破棄・抑止を単体テストで検証
  - 再送では送信前の画像圧縮が再実行されず、初回送信と同一の画像データが送られること
  - 再送で成功した画像のみが保持から取り除かれ、失敗した画像は保持され続けること
  - 破棄は確認の承諾時にのみ実行され、取消では保持が維持されること
  - アップロードおよび再送の実行中は、追加の再送・破棄の操作を受け付けないこと
  - 保持中の画像が全て再送不可の場合、再送の操作手段が実行不可の状態で提示されること
  - 未送信画像を保持したまま新規のファイル選択を行っても、既存の保持が消えないこと
  - 通知処理が例外を投げても、成功した画像が未送信画像として保持されないこと
  - 完了: 工事写真アップローダの単体テストが緑になり、上記7件が観測される
  - _Requirements: 20.2, 20.3, 20.4, 20.5, 20.7, 20.8, 20.9, 20.10, 20.14, 20.17, 20.18_
  - _Boundary: PhotoUploader_

- [x] 15.2 (P) 共通クライアントへの送信経路の固定を単体テストで検証
  - 工事写真の画像アップロードが独自の送信実装ではなく、共通クライアントの multipart 送信経路を通ること
  - 経路が固定されることで、認証の有効期限切れからの無操作復帰・セッション切れ通知・サーバー到達前の失敗に対する自動再試行・1件あたりの送信猶予・時間切れ時に自動再試行しない方針が、工事写真にも適用される
  - 共通クライアント自体の再試行方針・送信猶予・認証更新の挙動は現場調査側の単体テストが担保するため、ここでは重複して検証しない
  - 完了: 送信経路の単体テストが緑になり、共通クライアント以外の送信手段へ差し替えると失敗する
  - _Requirements: 20.11, 20.12, 20.13, 20.15, 20.19, 20.20_
  - _Boundary: construction-photo-images APIクライアント_

- [x] 15.3 (P) 形式エラー文言の契約を統合テストで固定
  - 不正な画像形式の写真をアップロードした際、部分失敗応答の失敗理由が画像検証エラーの定義が生成する文言と一致すること
  - 照合に用いる文言はバックエンドの画像検証エラー定義から取得し、テスト内に文字列を書き下ろさない
  - 既存の統合テストは失敗したファイル名のみを検証しており、文言を変更しても失敗しない。この穴を塞ぐ
  - 完了: 工事写真の画像アップロード統合テストが緑になり、画像検証エラーの文言を変更すると当該テストが失敗する
  - _Requirements: 20.16, 20.17, 20.18, 20.21_
  - _Boundary: construction-photo-images ルート, ConstructionPhotoImageService_

- [x] 15.4 失敗から保持・再送・破棄までをE2Eで検証
  - アップロード応答をサーバーエラーへ差し替えて失敗させ、未送信件数とサムネイル・ファイル名・失敗理由が表示されることを確認する
  - 差し替えを解除して再送を実行し、写真項目が一覧へ追加され未送信の表示が解消することを確認する
  - サイズ上限超過の応答へ差し替え、当該画像が再送不可として区別され、再送の操作手段が実行不可となり理由が提示されることを確認する
  - 破棄の確認を承諾し、未送信の表示が消えることを確認する
  - 一時的な通信障害の応答で失敗させたのち復旧させ、再送が成功することを確認する。オフライン切替はローカル環境で機能しないため用いない
  - 応答差し替えの一致判定はオリジンではなくパスを基準とし、固定時間待機を用いず明示的な条件待ちのみで構成する
  - 実行前に工事写真のフロント変更を反映したテスト環境のフロントエンドイメージを再ビルド・再作成する（テスト環境は本番ビルド済みイメージを配信するため）
  - 完了: 上記5シナリオが実ブラウザで緑になる
  - _Depends: 14, 15.1_
  - _Requirements: 20.1, 20.2, 20.3, 20.5, 20.6, 20.7, 20.8, 20.16, 20.17, 20.18_

- [ ] 15.5 全単体スイートを実行し陳腐化を解消する
  - 送信アダプタの挙動変更により陳腐化した既存テストを是正する
  - スコープを限定せずフロントエンドの単体テストを全件実行し、カバレッジ閾値を下回らないことを確認する
  - 完了: 全件実行の結果が緑であり、カバレッジ閾値を下回らない
  - _Depends: 14, 15.1_
  - _Requirements: 20.4, 20.14_

## Implementation Notes
- 環境: dev Docker の backend/frontend entrypoint が名前付き node_modules ボリュームへ `npm ci` を npm10.9.7 で実行し @emnapi ドリフトで起動失敗。対処＝ボリュームを `npx -y npm@11.6.2 ci` で seed＋`.package-hash` 記録＋frontend は `@rollup/rollup-linux-arm64-gnu` プレースホルダ作成で entrypoint 回避。BE/FE とも起動確認済み。
- 検証コマンドはコンテナ内で実行: backend=`docker exec architrack-backend-dev npm run <test:unit|test:integration|type-check|prisma:migrate>`、frontend=`docker exec architrack-frontend-dev npm run <test|type-check|build>`。DB は architrack_dev(postgres:5432、既存30マイグレーション適用済み)。
- 統合テスト: `npm run test:integration` は global-setup が `architrack_test`(password test)を強制するが当環境に無く全滅する。個別統合ファイルは `docker exec -e TEST_DATABASE_URL=postgresql://postgres:dev@postgres:5432/architrack_dev architrack-backend-dev npx vitest run <file>` で architrack_dev に対し実行（テストは自己クリーンアップ前提）。
- 設計リファイン(R8.8, 3.1レビュー由来): 看板の「削除前警告」を成立させるため、看板一覧DTO(findByProject)に各看板の使用件数(inUseCount)を露出する必要がある。現状 delete は即削除して inUseCount を後返しするのみ。task 6.5(看板管理UI)の前に、看板サービスの一覧に inUseCount を含める小改修を 6.5 と併せて実施する。
- 追補(R3.5/11.3, 6.1レビュー由来・要最終検証前対応): アルバム一覧APIが代表サムネURLを返さないため一覧のサムネが常にプレースホルダ。バックエンド(2.1域)の ConstructionPhotoAlbumDto/toDto/list に代表画像(先頭ConstructionPhoto.thumbnailPath)のTTL900s署名URLを追加し、フロント ConstructionPhotoAlbum 型へ伝播する小改修が必要。6.1の描画パスは前方互換で対応済み。
- 追補(R3.5/R8.8)対応済み: アルバム一覧に代表サムネ署名URL(TTL900s)、看板一覧に inUseCount(groupBy・N+1なし)を追加し、フロント型へ伝播。BE単体60/統合39・FE型緑、追加のみ非破壊(独立レビューAPPROVED)。6.5はこの inUseCount を用いて削除前確認を実装可能。
- 結線ギャップ(9.3 E2E由来): SignboardPlacementEditor(6.4)が詳細画面に未結線で看板配置UI経路が不在(R9.1到達不能)。詳細画面の各写真項目に「看板を配置」導線(看板選択+SignboardPlacementEditor起動→signboardId/placementを未保存メタに記録→既存2リクエスト保存で確定)を追加する結線タスクを実施後、9.3にplacement/overlayフローを追加する。
- 既知の軽微制限(R5.3, validate-impl由来): カメラ非対応端末でカメラ導線を非提示にするケイパビリティ検出が未実装。現状はHTML `capture` 属性により非対応端末ではファイル選択へグレースフル劣化する(機能的には阻害なし)。当該カメラ導線は設計で再利用指定の共有 ImageUploader(site-survey)由来のため、厳密対応は共有コンポーネント側の改修(境界外・site-surveyにも影響)を要する。推奨: 別途フォローで PhotoUploader 側にケイパビリティ検出を追加。

## 追加機能（Req 14〜19, タスク10〜13）
- 対象: 現場調査詳細画面との比較で判明した不足7機能。site-survey の実証済みパターン（ビューア基盤/JSZipエクスポート/権限フック/未保存フック/レスポンシブ）を独立クローン方針で流用。既存タスク1〜9（実装済）は変更しない。
- 設計差し戻し対応(task-graphサニティレビュー由来): 当初「バックエンド変更ゼロ」としたが、看板配置済み写真の非合成原本を得る配信路が既存に無い（一覧DTOは thumbnailUrl/printImageUrl のみ・originalUrl は単体テストで明示禁止・print-image は看板ありだと必ず合成）ことが判明。R14（ビューア原本表示）・R15.4（plain/original）成立のため、非合成原本エンドポイント `GET .../original` を新設（task 10.1）。ユーザー承認済み方針。
- ZIP看板モード定義: composited=印字画像(サーバ合成)／plain=非合成原本を解像度変換／original=原本バイトそのまま（解像度/形式設定は適用しない）。
- 権限: `useConstructionPhotoPermission` はロール直書きせず `usePermission('construction_photo:<action>')` で判定（RBAC権限駆動）。UIは体験向上でありBE RBACが権威（多重防御）。
- グループ12は全て `ConstructionPhotoDetailPage` 等の既存ファイルを共有改変するため非並列。10.x/11.x/13.x は境界非重複で並列可（routes.tsx を触るのは11.2のみ）。
- 検証コマンドは既存注記と同様にコンテナ内で実行（frontend=`docker exec architrack-frontend-dev npm run <test|type-check|build>`）。要件はE2Eで動作確認するまで完了としない。
- R15.10 UI残課題(12.2由来): 部分失敗時の「成功分のみでダウンロード継続をユーザーが選択」UIは未実装。現状は成功分を自動ダウンロードし失敗件数を通知する劣化対応。サービス層(11.3)の failed[] 返却は実装済。厳密なユーザー選択UIは BulkExportProgressDialog の拡張を要する(要フォロー、最終検証で要否判断)。
- スペック訂正(10.1レビュー由来): /original の認可は「権限なし=403(requirePermission)・他プロジェクト=404(存在秘匿, print-image等と同一)」。tasks/design の該当記述を是正済み。
- E2E(13.3): 新規 `e2e/specs/construction-photos/construction-photo-additional.spec.ts`(12テスト)＋`e2e/fixtures/seed-helpers.ts` に construction_photo/signboard 権限追加(userはdelete除外=R17.2)。**test環境は本番nginxビルド済みイメージ配信のため、フロント変更反映には `architrack-frontend-test` の再ビルド＋再作成が必須**(dev配信ではない)。
- E2Eフレーク是正(13.3): モバイルテストは `useMediaQuery` ハイドレーション(初期false→true)のデスクトップ一瞬フラッシュを稀に測定し `<main>` overflow=25で赤化していた。閾値(≤1)は据え置き、測定を「flexDirection:column 適用後」にゲートして決定化(連続runで緑)。共通ヘッダ(app-header-nav)は375pxで約25px document 級はみ出しあり=工事写真範囲外・共有レイアウト側の別課題。
- R18.1 E2E(13.3): ネイティブreload/close の beforeunload は synthetic `Event('beforeunload',{cancelable:true})` dispatch＋`defaultPrevented` false→true→false で非フレーク検証(site-survey-responsive.spec.ts:874-924 と同手法)。OSネイティブモーダル描画/操作のみ縮退。

## アップロード失敗時の保持と再送（Req 20, タスク14〜15）
- 対象: 2026-08-08 に追加された Requirement 20。機構は現場調査（site-survey）の Requirement 37 が所有し、工事写真は**送信アダプタのみを所有**する。借用部品（アップロードUI・保持フック・未送信一覧・失敗分類・共通クライアントの multipart 送信）は本タスク群で**変更しない**ため、実装タスクを持たない。
- 実装状況: 送信アダプタの結線（失敗画像の実体と再送可否の返却、共通クライアントへの送信統一）は site-survey 側のタスク 107.2 / 108.3 で完了済み。したがって本タスク群の主作業は**検証**であり、プロダクトコードの変更はタスク14の1件のみ。
- タスク14の必要性: アップロードUI側の失敗処理は「試行対象の全ファイル」を保持へ回すため、成功分の通知で例外が伝播すると登録済みの画像まで未送信画像として保持され、再送で重複登録が起こりうる。Requirement 20.14 が守る不変条件をアダプタ層でも維持するための是正。
- 到達不能パス: 送信は1リクエスト1ファイルで行うため、1リクエストあたりの件数上限（Requirement 12.1）に起因する拒否は工事写真の画面から発生しない。20.16 が挙げる3条件のうち工事写真で到達するのは「サイズ上限」「画像形式」の2経路のみであり、到達しない経路の検証は行わない。
- 検証責務の切り分け: 画面に現れる状態と操作結果（20.1〜20.3, 20.5〜20.8, 20.16〜20.18）はE2E、再圧縮の有無・保持の温存・実行中抑止（20.4, 20.9, 20.10）は単体テスト、再試行方針・送信猶予・認証更新（20.11〜20.15, 20.19, 20.20）は共通クライアントの単体テストと工事写真側の送信経路の固定で担保する。E2Eに観測しない要件のラベルを付けない。
- 自動再試行（20.13）をE2Eで主張する場合は、差し替え中の同一パスへのリクエストが2回以上発生したことを観測すること。回数を観測しないなら 15.4 のラベルに 20.13 を含めない。
- 権限との相互作用: アップローダは編集権限がある場合のみ描画されるため、編集権限を失うと保持中の未送信画像は解放される。Requirement 17.1 を優先する設計判断であり、本タスク群では是正しない。
- 並列可否: 15.1／15.2／15.3 は編集対象ファイルが重複せず境界も非重複のため並列可。15.4／15.5 はタスク14と15.1の結果に依存するため非並列。
- E2Eの前提: テスト環境（フロント5174／API3100／DB5433）を用いる。工事写真の権限シードはタスク13.3で整備済み（user は削除権限を除く）。
- タスク14実施済み(2026-08-09): 通知の例外保護は `notifySafely()` ヘルパで `onPhotosAdded`/`onNotify` を個別に包む形で実装。**通知例外時に成功画像が保持されないことの単体テスト3件は14のREDとして既に追加済み**のため、15.1では再追加せず残り6観点に集中する。
- 申し送り(14レビュー由来): `components/site-surveys/ImageUploader.tsx` の「PhotoUploader は catch を持たず onPhotosAdded の例外が伝播する」旨のコメントが工事写真については陳腐化した。当該ファイルは境界外のため site-survey Req37 側で追随する。
- 検証環境の実態(2026-08-09時点): docker コンテナは1つも起動していない。フロント単体は `npm --prefix frontend run test` でローカル実行可能（`cd` はフックでブロックされるため `--prefix` 必須）。15.3(バックエンド統合)と15.4(E2E)は docker 環境の起動が前提。
- バックエンド統合テストの起動手順(15.3で確立): test compose の postgres/redis だけを起動すれば**ホストから直接**実行できる。`docker compose -p architrack-test -f docker-compose.yml -f docker-compose.test.yml --env-file .env.test up -d postgres redis` → `DATABASE_URL=postgresql://postgres:test@localhost:5433/architrack_test npm --prefix backend run prisma:migrate:deploy` → `RUN_INTEGRATION_TESTS=true npm --prefix backend run test -- <file>`。global-setup が非docker検出でポート5433/redis6380へ自動解決するためコンテナへ入る必要はない。
- 15.3の設計判断: 「207の失敗理由がバックエンドの検証エラー定義と一致する」だけではトートロジー（期待値と実装が同じ定義由来）で文言変更を検知できないことをレビューが実測確認。フロントの判定断片を `frontend/src/utils/upload-failure.ts` から fs 読み出しして包含を検証する形とした。到達可能なのは `UnsupportedImageFormatError` の1経路のみ（multerに fileFilter が無く `InvalidFileTypeError`/`InvalidMagicBytesError` は非到達）。
- 15.3の申し送り(非ブロッキング): フロント定数を改名した場合の失敗メッセージが `expected 0 to be greater than 0` のみで原因が読み取りにくい。診断メッセージの付与が望ましい。
- 15.4の設計逸脱2件(レビュー承認済み): (a) **20.13のラベルを付与**。503差し替え中の同一パスへのリクエスト回数を実測し `>1` を確認したため、design.mdの条件付き許可を満たす。(b) **20.5に部分再送段階を追加**。設計記載の「単一画像の全件成功」では受入基準20.5の「一部の画像が成功する」が発生せずラベルが過大主張になるため、2件中1件だけ失敗させ続ける段階を挟んだ。
- 15.4の実装メモ: 応答差し替えは `url.pathname` のみで判定しオリジン非依存。`page.unroute` は matcher/handler とも同一参照で解除。再送対象の絞り込みは multipart ボディ先頭4096バイトのファイル名判定で、1リクエスト1ファイル・単一フィールド構成のため境界をまたがない。判定失敗は `routeErrors` に記録し末尾で失敗させる（握り潰しなし）。

### Requirements Coverage（Requirement 20）

| Req | 対応タスク | Req | 対応タスク |
|-----|-----------|-----|-----------|
| 20.1 | 15.4 | 20.12 | 15.2 |
| 20.2 | 15.1, 15.4 | 20.13 | 15.2 |
| 20.3 | 15.1, 15.4 | 20.14 | 14, 15.1, 15.5 |
| 20.4 | 15.1, 15.5 | 20.15 | 15.2 |
| 20.5 | 14, 15.1, 15.4 | 20.16 | 15.3, 15.4 |
| 20.6 | 15.4 | 20.17 | 15.1, 15.3, 15.4 |
| 20.7 | 15.1, 15.4 | 20.18 | 15.1, 15.3, 15.4 |
| 20.8 | 15.1, 15.4 | 20.19 | 15.2 |
| 20.9 | 15.1 | 20.20 | 15.2 |
| 20.10 | 15.1 | 20.21 | 15.3 |
| 20.11 | 15.2 | | |
