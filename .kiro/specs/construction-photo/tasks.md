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

- [x] 15.5 全単体スイートを実行し陳腐化を解消する
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
- 15.5の結果(2026-08-09): 陳腐化テストはゼロでファイル変更なし。フロント全件 510ファイル/11390件・カバレッジ 93.2/85.75/95.13/94.64(閾値いずれも80)・`coverage:check` 378/378、バックエンド単体178/5354・統合44/812、いずれも exit 0。タスク14の挙動変更は他テストを壊していない。15.1の `vi.mock(image-compression)` と15.2の `vi.unstubAllGlobals()` は `pool: 'forks'`+`isolate: true` により他ファイルへ漏れない（設定で裏付け済み）。
- 15.5の申し送り(非ブロッキング): `PhotoUploader.tsx` の per-file branch カバレッジは75%。`check-coverage-gaps.cjs` のゲート指標は `Math.min(statements, lines)` のみでbranchesを除外しているため違反ではないが、将来の改善候補。
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

## Task 16: タップ領域の下限（44 論理ピクセル）の出所を確定させる

**経緯**: site-survey の Task 115.217 が同スペックのタップ領域の下限を単一の出所へ集約した際、そのレビューが `frontend/src/components/construction-photos/` にも同じ下限の複製があることを**別スペックの所管**として検出した。site-survey の Task 115.249 が「115.217 が確立した切り分けを工事写真へそのまま適用できるか」を判断し、その帰結を本節へ起票した。**所有権は本スペックにある。** site-survey 側は実装コードを一行も変更していない。

**115.217 が確立した切り分け**（理由の全文は `frontend/src/components/site-surveys/tap-target.constants.ts` の冒頭にある）: **実装側は単一の出所へ一本化し、検証側は 44 を自前で持ち続ける**。後者の理由は「44 は外部の権威（WCAG 2.2 SC 2.5.5）が定めた下限であり、実装が調整する値ではない。外部の権威が定めた下限は、実装から独立した立会人が測らなければ検証にならない」である。

**判断（Task 115.249）**: **検証側については適用できる。実装側については、そのままでは適用できない。** 理由は下の実測にある。

**測った事実**（いずれもコミット `b41c93a6`、2026-09-03 にリポジトリルートで実測）:

- **母集団**: `grep -rnE "(^|[^0-9])44([^0-9]|$)" --include=*.ts --include=*.tsx frontend/src/components/construction-photos` の当たりが `29` 行。内訳は `PhotoItemPanel.test.tsx` が 17 行、`PhotoItemPanel.tsx` が 10 行、`ConstructionPhotoImageViewer.tsx` が 2 行である
- **宣言の箇所**: `grep -rnE "min(Width|Height): *'44px'" --include=*.ts --include=*.tsx frontend/src/components/construction-photos` の当たりが `10` 行。`PhotoItemPanel.tsx` に 8 行（`checkboxMobile` / `orderButtonMobile` / `deleteButtonMobile` / `dragHandleMobile` の四つ）、`ConstructionPhotoImageViewer.tsx` に 2 行（`rotationButton` の一つ）である
- **本スペックの要件は 44 という数値を一度も綴らない**: `grep -c "44" .kiro/specs/construction-photo/requirements.md` の出力が `0` である。受入基準 19.3 の逐語は「The 工事写真機能 shall 写真項目の操作コントロール（チェックボックス・並び替え・削除・ドラッグハンドル等）をモバイルでもタップ可能な操作領域で表示する」であり、**「タップ可能」とだけ述べて寸法を課さない**（`grep -n "^3\. The 工事写真機能 shall 写真項目の操作コントロール" .kiro/specs/construction-photo/requirements.md` で取り出せる）
- **したがって 44 の帰属先は本スペックの受入基準ではない**。site-survey の要件28.3 は「最小44x44論理ピクセル以上」と数値を条文で運ぶが、本スペックの 19.3 にはその条文が無い。**帰属先は `.kiro/steering/tech.md` の「レスポンシブ・ビューポート方針」＞「モバイルの下限値」**（操作系コントロールのタップ領域は最小 44×44 論理ピクセル。WCAG 2.2 SC 2.5.5 Target Size (Enhanced)）**という横断ルールである**。同方針は「新規画面・コンポーネントも同じ方針に従う」と明記する。同じ結論を site-survey が自スペック内の二部品について先に出しており（同スペックの Task 115.246。`.kiro/specs/site-survey/requirements.md` の要件28.3 の注記）、**横断的な表示標準を個別要件の受入基準へ複製しないという判断もそこで下されている**
- **本スペックの設計文書もタップ領域を扱っていない**: `grep -c "44\|タップ" .kiro/specs/construction-photo/design.md` の出力が `0` である。追跡表の `| 19 | 詳細画面モバイル | useMediaQuery, responsive, DetailPage, PhotoItemPanel | - | - |` が担い手を挙げるのみである
- **10 箇所は均質ではない**。`PhotoItemPanel.tsx` の 8 箇所は `R19.3: 操作系コントロールのタップ領域を44px以上に拡大` の注釈を持ち、`...(isMobile ? styles.checkboxMobile : {})` の形で**モバイル幅でのみ**合成される（`grep -n "isMobile ? styles" frontend/src/components/construction-photos/PhotoItemPanel.tsx`）。一方 `ConstructionPhotoImageViewer.tsx` の 2 箇所は**注釈を持たず、要件番号を名乗らず、`style={STYLES.rotationButton}` として画面幅によらず適用される**（同ビューアは R14 の所管であり、R14 はタップ領域の条項を持たない）
- **同じビューアの中で、隣り合う操作群が下限を別々の場所から得ている**: `ConstructionPhotoImageViewer.tsx:628` は `components/site-surveys/ZoomControls` を描画し、同部品は `TAP_TARGET_MIN_PX` を `./tap-target.constants` から取り込んでいる（`grep -n "TAP_TARGET_MIN_PX" frontend/src/components/site-surveys/ZoomControls.tsx`）。**つまり工事写真のズーム操作手段の下限は既に site-survey の単一の出所から来ており、同じビューアの中の回転ボタン（同ファイル `:638` / `:662`）だけが `'44px'` を直に綴っている。** しかも `ZoomControls` 側の注釈は `Req 34.5`（site-survey の受入基準）を名乗っており、**本スペックの画面に、本スペックの要件が課していない番号の根拠が持ち込まれている**

**実装側を「そのまま」一本化できない理由**（上の実測から導かれる二点）:

1. **115.217 が作った単一の出所は `components/site-surveys/` に在り、そのモジュール自身が工事写真を射程外と宣言している**（`frontend/src/components/site-surveys/tap-target.constants.ts` 冒頭）。取り込むこと自体は設計制約に反しない——`design.md` の R20 の制約は `components/construction-photos/* → components/site-surveys/*` の一方向のみを許し、既に `ConstructionPhotoImageViewer.tsx` が `image-viewer.constants` と `ZoomControls` を取り込む先例がある。**しかし横断ルール（steering）由来の下限を、一機能のフォルダに置いた定数から借りる形は、出所の名前が根拠を偽って伝える。** `.kiro/steering/tech.md` はブレークポイントの単一情報源を `utils/responsive.ts` と定めており、横断的な下限の置き場所も同じ層が自然である。**置き場所の移設は site-survey スペックの所有物にも触れるため、本スペック単独では決められない**
2. **10 箇所のうち 2 箇所は帰属が付いていない**。均さずに一本化すると、要件 19.3 の対象ではない回転ボタンが 19.3 の名前で下限を得ているように読める状態を固定してしまう。**帰属の記録が先である**（site-survey が Task 115.246 で先に踏んだ順序と同じ）

**検証側については適用できる**（複製を残す側の理由は工事写真でもそのまま成立する。44 は WCAG が定める外部の下限であり、本スペックの実装が調整する値ではない）。**ただし現状は「複製を残す」以前に、2 箇所について検証が一つも無い**:

- **変異で実測した**（同コミット・同日）。基線は `npm --prefix frontend run test -- --run src/components/construction-photos src/pages/ConstructionPhotoImageViewerPage.test.tsx` が 16 ファイル 208 件すべて緑である
  - `PhotoItemPanel.tsx` の `minWidth`/`minHeight` を `'44px'` から `'20px'` へ変えて `PhotoItemPanel.test.tsx` だけを走らせると、**37 件中 5 件が落ちる**（落ちるのは `R19.3:` を名乗る 5 件である）。実装を変えれば検証が追随する
  - **同じ置換を `ConstructionPhotoImageViewer.tsx` の 2 箇所へ当てると、16 ファイル 208 件が全て緑のまま通る。** さらに `grep -rnE "(^|[^0-9])44([^0-9]|$)" e2e/specs/construction-photos` の当たりが `0` 行であり、**E2E にも当該下限を測る主張が一つも無い**
  - 変異はいずれも `git checkout --` で復元し、`sha256sum -c` で復元を照合した
- **つまり回転ボタンの下限は、要件にも設計にも根拠が書かれておらず、単体検証にも E2E にも立会人がいない。** 誰かが値を下げても何も赤くならない

**一件を直して「完全になった」と書かないこと**: 本節が挙げるのは上の二本の `grep` が捕まえた範囲だけである。**走査根は `frontend/src/components/construction-photos` と `e2e/specs/construction-photos` の二つであり、その外の工事写真関連ファイル（`frontend/src/pages/ConstructionPhoto*`、共有部品の側）は保証しない。** また `44` という綴りを持たない形で下限を課す実装（`2.75rem` 等）は上の網に掛からない。

- [x] 16.1 タップ領域の下限の帰属を本スペックの文書へ記録する
  - **受入基準を足さないこと**。横断的な表示標準を個別要件へ複製すると、標準を改定する際に追随漏れが生じる。site-survey が同じ判断を Task 115.246 で下しており、その注記（`.kiro/specs/site-survey/requirements.md` の要件28.3 の注記）が先例である
  - 記録すべき内容: (a) 19.3 が課すのは「タップ可能な操作領域」であって数値ではないこと、(b) 実装が採る 44 という値の根拠は `.kiro/steering/tech.md` の「レスポンシブ・ビューポート方針」＞「モバイルの下限値」であること、(c) `ConstructionPhotoImageViewer` の回転ボタンは 19.3 の対象外（R14 の所管であり R14 はタップ領域の条項を持たない）であり、その下限の根拠も同じ横断ルールであること
  - **着手時に上の実測を取り直すこと。** 本節が引く件数は 2026-09-03・コミット `b41c93a6` の値である
  - **steering の節名・箇条名への参照は行番号で書かないこと**（改名を検出する機構がリポジトリに無い。site-survey の Task 115.246 のレビューが確認済み）
  - _Depends: site-survey スペックの Task 115.249（下限の出所の判断と申し送り）_
  - _Boundary: 本スペックの文書におけるタップ領域の下限の帰属_

- [x] 16.2 帰属の無い 2 箇所に立会人を置く
  - 対象は `frontend/src/components/construction-photos/ConstructionPhotoImageViewer.tsx` の `rotationButton` の `minWidth` / `minHeight` である。**現状は変異を当てても 16 ファイル 208 件が緑のまま通る**（上の実測）
  - **検証側は 44 を自前で綴ること**（site-survey の Task 115.217 が確立した切り分け。理由は `frontend/src/components/site-surveys/tap-target.constants.ts` の冒頭にある）。実装から定数を取り込むと、主張が「実装は実装に等しい」へ弱まる
  - **是正後は同じ置換の変異を当てて、実際に赤くなることを実測すること**
  - 既存の `PhotoItemPanel.test.tsx` の 5 件と同じ形（`tapWidth` / `tapHeight` による実寸の下限主張）に揃えること
  - _Depends: 16.1_
  - _Boundary: `ConstructionPhotoImageViewer` の回転操作のタップ領域の検証_

- [x] 16.3 実装側の下限を単一の出所から得る形にするかを決める
  - **16.1 の後に着手すること。** 帰属が記録されていない状態で一本化すると、要件 19.3 の対象でない箇所まで 19.3 の名前で下限を得ているように読める状態が固定される
  - 選択肢は三つある。(a) `frontend/src/components/site-surveys/tap-target.constants.ts` を取り込む（設計の R20 制約が許す向きであり、`image-viewer.constants` / `ZoomControls` の取り込みという先例もある。ただし同モジュールは自身を site-survey の所有物と宣言しており、横断ルール由来の下限を一機能のフォルダから借りる形になる）、(b) 横断ルールにふさわしい層（`frontend/src/utils/` — `.kiro/steering/tech.md` がブレークポイントの単一情報源をこの層に定めている）へ移設し、site-survey / 工事写真の双方がそこを参照する、(c) 現状のまま複製を残し、複製してよい理由を一箇所へ書く
  - **(b) を選ぶ場合は site-survey スペックの所有物（`tap-target.constants.ts` とその参照元 6 ファイル）に触れるため、本スペック単独では決められない。** site-survey 側と調整すること
  - **どれを選んでも、`ZoomControls` の注釈が本スペックの画面に対して `Req 34.5`（site-survey の受入基準）を名乗っている状態をどう扱うかを併せて決めること**
  - **`_Requirements:` を持たないのは意図である。** 本節は受入基準を実装せず、実装が既に満たしている下限の出所を整えるだけである。19.3 を挙げると「当該受入基準を本節が被覆した」という偽の申告になり、被覆の集計にも入りうるため、依存と境界だけを書く
  - _Depends: 16.1_
  - _Boundary: 工事写真のタップ領域の下限の実装側の出所_

## Task 17: 工事写真の現調コピーが親の現場調査の論理削除を見ない状態を解消する

**経緯**: site-survey の Task 115.124 が同スペックの5経路を `assertSurveyNotDeleted` で塞ぎ、Task 115.172 の実装とレビューが全8ルートを一件ずつ辿って**残る2経路が他スペックの所管であること**を確認した。同スペックは Task 115.214 を `_Blocked:_` に置いたが、**本スペックへ起票されないまま滞留していた**。site-survey の機能レベル検証がその断絶を検出し、申し送りを実行して本節を起こした。**所有権は本スペックにある。** site-survey 側は実装コードを一行も変更していない。

**もう一方の経路は数量表生成スペックが所管する。** 起票は `.kiro/specs/quantity-table-generation/tasks.md` の `## Task 81: 数量表の経路が親の現場調査の論理削除を見ない状態を解消する` に置いた。**両スペックへ別々に起票したのは、二つの欠陥が別のサービス・別の所有者に属し、互いに依存しないためである**——片方を主として他方を参照だけに留めると、参照する側の所有者の作業キューに何も載らず、**この一連の是正が解消しようとしている「行き止まりの申し送り」をそのまま再現する**。共有するのは是正の道具（`assertSurveyNotDeleted`）だけであり、それは site-survey が既に提供している。

**測った事実**（いずれもコミット `c3f3e9f6`、2026-09-08 にリポジトリルートで実測）:

- **本スペックの未検査の経路**: `backend/src/services/construction-photo-image.service.ts` の `addFromSurveyImage` は、参照候補を `prisma.surveyImage.findMany` で読む際に `survey: { select: { projectId: true } }` しか置かず、**親の現場調査の `deletedAt` を読まない**。入口は `grep -nF 'async addFromSurveyImage(' backend/src/services/construction-photo-image.service.ts` で求め、続く50行を読むこと。当該の綴りの当たりは `grep -cF 'survey: { select: { projectId: true } },' backend/src/services/construction-photo-image.service.ts` の出力が `1` である
- **拒否の条件はプロジェクト不一致と不存在の二つだけである**: 拒否集合は `!src || src.survey.projectId !== album.projectId` で作られる（入口は `grep -nF 'const rejected = surveyImageIds.filter((id) => {' backend/src/services/construction-photo-image.service.ts`）。**アルバム自身の論理削除は同じメソッドの冒頭で検査されているのに**（`grep -cF 'if (!album || album.deletedAt !== null) {' backend/src/services/construction-photo-image.service.ts` の出力は `3` で、本メソッドのものは `addFromSurveyImage` の入口と上の拒否集合の行に挟まれた一件である）、**参照元の現場調査の論理削除は検査されない**
- **外部からの入口**: `backend/src/routes/construction-photo-images.routes.ts` の `POST /:id/from-surveys`（`construction_photo:update` 権限）である。入口は `grep -nF "'/from-surveys'," backend/src/routes/construction-photo-images.routes.ts`
- **したがって、論理削除した現場調査の画像を工事写真アルバムへ今も取り込める**。同一プロジェクトでありさえすれば通る
- **本スペックで現場調査画像を直接読むのはこの一箇所である**: `grep -c 'prisma\.surveyImage' backend/src/services/construction-photo-image.service.ts` の出力が `1`、`grep -c 'prisma\.surveyImage' backend/src/routes/construction-photo-images.routes.ts` の出力が `0`（終了コードは1）である。**総数を併記するのは、`0` だけでは「走査根を読めていない」場合と区別できないためである**（**走査根は `backend/src/services/construction-photo*.ts` と `backend/src/routes/construction-photo*.ts` の二つであり、その外は保証しない**）
- **site-survey 側は塞がれている**: `grep -rn 'assertSurveyNotDeleted(' backend/src --include=*.ts | grep -v '__tests__' | grep -v 'survey-deleted-guard.ts'` の当たりが **5行**（`image-metadata.service.ts` 2件・`survey-images.routes.ts` 2件・`image-delete.service.ts` 1件）。**是正には `backend/src/utils/survey-deleted-guard.ts` の `assertSurveyNotDeleted` / `sendSurveyDeletedProblem` をそのまま使える**
- **破れているのは他スペックの受入基準である**: site-survey の REQ-1.5（`grep -nE '^5\. When ユーザーが現場調査を削除する' .kiro/specs/site-survey/requirements.md` で取り出せる）が課す論理削除の意味が、本スペックの入口で破れている
- **機械保証は無い。断定でなく現況で示す**: site-survey/REQ-1.5 は `e2e/specs/site-surveys/site-survey-crud.spec.ts` の被覆印を持つ（`grep -cF 'site-survey/REQ-1.5' e2e/specs/site-surveys/site-survey-crud.spec.ts` の出力が `2`）ため、**`npm run check:req-coverage` は当該受入基準を被覆済みと数える**（同検査は基線から既に終了コード1だが、未カバー一覧に site-survey/REQ-1.5 は挙がらない。2026-09-08 に実測）。**被覆の集計は「削除の画面操作が通ること」を見ており、他スペックの入口が同じ不変条件を守っているかは見ない**

**着手前に測り直すこと**: 本節が引く所在と件数は 2026-09-08・コミット `c3f3e9f6` の値である。**起票が挙げた所在は、着手時には既に直っていることがある**（site-survey の Task 115.155 の実例）。

- [x] 17.1 現調コピーの参照候補の検証に親の論理削除の検査を加える
  - 対象は `backend/src/services/construction-photo-image.service.ts` の `addFromSurveyImage` である。参照候補の `select` へ `survey: { select: { projectId: true, deletedAt: true } }` を加え、親が論理削除済みの候補を拒否すること
  - **道具は既に在る。新たに判定を書き起こさないこと**——`backend/src/utils/survey-deleted-guard.ts` を取り込むこと。site-survey の5経路と同じ不変条件であることが、道具の共有で示せる
  - **部分失敗の扱いを決めること。** 本経路は入力順を保ちつつ複製し、部分失敗を `failed` へ積んで継続する形である。一方でプロジェクト不一致・不存在は `SurveyImageCopyNotAllowedError` で**一件でもあれば全体を拒否**する。**論理削除済みの参照をどちらの扱いに寄せるかを、理由つきで決めること**。既存の拒否集合へ足すのが素直だが、応答の形（`surveyImageIds` を返す）と利用者への伝わり方を確かめてから決めること
  - **応答が site-survey の経路と食い違わないこと**を確かめること。`sendSurveyDeletedProblem` を使うか本スペックの既存のエラー変換に載せるかは、上の判断と併せて決める
  - **変異検証**: 検査を外すと当該の検証が落ちることを実測し、当てた変異と実出力を報告に書くこと。**「塞いだ」を検証なしで書かないこと**
  - **`_Requirements:` を持たないのは意図である。** 本節が守る不変条件は site-survey の REQ-1.5 であって本スペックの受入基準ではない。本スペックの番号を挙げると偽の被覆申告になり、他スペックの番号を挙げると本スペックの分母に無い番号を名乗ることになる（Task 16.3 と同じ扱いである）
  - _Depends: site-survey スペックの Task 115.172（全8ルートの走査と申し送り）_
  - _Boundary: 工事写真の現調コピーにおける親の論理削除の検査_

_申し送り元: site-survey スペックの Task 115.214（同スペックでは所管外としてブロック。数量表生成スペックとの共同所管）_

## Task 18: 未保存離脱警告の設計記述が撤去済みの共有フック API を名指す状態を解消する

**経緯**: 数量表生成スペックの Task 100.24（利用者の裁定「(b) API を一本化する」、2026-09-24）が共有フック `frontend/src/hooks/useUnsavedChanges.ts` を `useUnsavedChanges({ isDirty, message? }): void` へ改め、`enabled` と戻り値（`markAsChanged` / `markAsSaved` 等）を撤去した。**本スペックの画面 `ConstructionPhotoDetailPage` の呼び出しは同タスクが追随させた**——画面側に `useState` の `isDirty` と `markAsChanged` / `markAsSaved`（useCallback）を持たせ、`useUnsavedChanges({ isDirty: canEdit && isDirty })` と呼ぶ。旧条件「`enabled=canEdit` かつ内部 dirty」と同値であり、変更2箇所・保存成功1箇所の呼び出し点がすべて保たれていることを同タスクの独立レビューが確認した。`useBlocker(isDirty)` の引数は不変。**同タスクは本スペックの `design.md` を一行も書き換えていない**。

**測った事実**（2026-09-24、下流の独立レビュー）: `.kiro/specs/construction-photo/design.md` の R18 の説明（L668 付近）が `const uc = useUnsavedChanges({ enabled: canEdit });` と `uc.markAsChanged()` / `uc.markAsSaved()` を名指したままである。機械の関門は赤くならない。

- [x] 18.1 R18 の未保存離脱警告の設計記述を現況の API へ揃える
  - 規約 (a)（歴史の記述は書き換えず現況を併記する）に照らし、併記か改訂かを決めること。着手時に当該行を測り直すこと
  - **`_Requirements:` を持たないのは意図である**（挙動は変わらず、記述の鮮度のみを扱う）
  - _Boundary: 本スペックの `design.md` の R18 の記述_

_申し送り元: quantity-table-generation スペックの Task 100.24_

## Task 19: 機能レベル検証の no-go の被覆の穴を埋める

**経緯**: Task 16〜18 の完了後に行った機能レベル検証（2026-10-01、コミット `d6690d07`）は NO-GO を返した。今回の変更が原因の失敗は 0 件で、原因は E2E の被覆印を持たない既存の受入基準 2 件だけである。機械検査は全件緑だった（backend 単体 6190 件、frontend 単体 11926 件、工事写真の統合 66 件、E2E の construction-photos 28 件）。`npm run check:req-coverage` の本機能分は、要件 20/20、受入基準 143/145 である。`e2e/requirement-exclusions.json` に本機能の除外は無い。

- [x] 19.1 編集権限の無い利用者に操作手段を表示しないことを E2E で主張する
  - 編集権限の無いロールで工事写真の詳細画面を開き、要件 17.1 が列挙する操作手段が表示されないことを主張すること。列挙の正本は requirements.md の Requirement 17 とし、着手時に読み直すこと
  - 被覆印は `@requirement construction-photo/REQ-17.1` とする。権限のあるロールでは同じ操作手段が表示されることも併せて主張し、偽の緑（画面が描かれていないだけ）を排すること
  - _Requirements: 17.1_
  - _Boundary: 工事写真の詳細画面の権限連動の E2E_

- [x] 19.2 モバイル幅でブレッドクラムが水平にはみ出さないことを E2E で主張する
  - 375 幅で工事写真の画面を開き、ブレッドクラムの `scrollWidth` が `clientWidth` を超えないこと（または文書全体に水平スクロールが生じないこと）を主張すること。対象画面は requirements.md の Requirement 19 の 4 を読んで確定すること
  - 被覆印は `@requirement construction-photo/REQ-19.4` とする。長いプロジェクト名・アルバム名を与え、はみ出しうる条件で測ること
  - _Requirements: 19.4_
  - _Boundary: 工事写真のモバイル幅のブレッドクラムの E2E_
  - **【完了時の注記（2026-10-01）】E2E は書いた時点で赤だった**（375 幅で nav の scrollWidth 389 / clientWidth 319。区切りの無い語の最小幅の和が折り返さない flex 行を押し広げていた）。`ConstructionPhotoDetailPage.tsx` の `breadcrumbWrapper` に `overflowWrap: 'anywhere'` を1行加えて是正し、共通の Breadcrumb には触れていない。文書全体の scrollWidth は共通ヘッダが 400/375 ではみ出すため主張に使っていない

## Task 20: 区切りの無い長いアルバム名で詳細画面が水平にはみ出す状態を解消する

**経緯**: Task 19 の完了後の機能レベル再検証（2026-10-01、コミット `63693ff4`）が NO-GO を返した。機械検査は全件緑で、Task 19 が原因の失敗は 0 件だった。しかし 375 幅の実ブラウザで、詳細画面の見出しを英数字一語の長いアルバム名にすると、main と文書全体の scrollWidth が 375 から 860 へ増え、横スクロールが生じた。原因は、詳細画面の見出し（`ConstructionPhotoDetailPage.tsx` の `styles.title`）に折り返しの指定が無いことである。アルバム名は最大 200 文字まで入力でき、正当な入力で要件 19.1 が破れる。19.2 が是正したブレッドクラムと同じ型の欠陥が、19.1 の側に残っていた。

- [x] 20.1 詳細画面の見出しが区切りの無い長い名前で水平にはみ出さないようにする
  - `styles.title` に折り返しの指定を加えること。同じ見出し領域の `styles.memo` も併せて測り、はみ出すなら同じ扱いにすること
  - 要件 19.1 の E2E に、英数字一語の長いアルバム名の条件を足すこと。前提として、名前の自然幅が main の幅を超えることを主張する。そのうえで、main に水平のはみ出しが無いことを主張する（許容誤差 1px）。是正前に赤、是正後に緑になることを実測すること
  - _Requirements: 19.1_
  - _Boundary: 工事写真の詳細画面の見出し領域のモバイル表示_

- [x] 20.2 ブレッドクラムの短い項目がモバイル幅で縦長になる状態を扱う
  - 375 幅では、普通の名前でも「ダッシュボード」が幅 32px・高さ 80px の縦長になり、ブレッドクラム全体の高さが 160px になる（同再検証の実測）。原因は、共通の Breadcrumb の ol に flex-wrap が無く、各項目が一行の中で縮められることである。要件 19.4 の「水平にはみ出さない」は満たしている
  - 是正するには共通部品 `frontend/src/components/common/Breadcrumb.tsx` を変える必要があり、ブレッドクラムを持つ全画面に及ぶ。本スペック単独では決められないため、利用者の判断を待つ
  - **利用者の判断（2026-10-02）**: 共通部品を直す。是正は Breadcrumb を導入した trading-partner-management の Task 30.1 が行う。本項は、その後に本スペックの画面（詳細・一覧・作成・編集。375 幅と 320 幅）を測り直し、短い項目が縦長にならないことを確かめて閉じる。測り直しは 20.6 と同じ巡で行う
  - _Depends: trading-partner-management の Task 30.1_
  - _Boundary: 共通 Breadcrumb のモバイル幅での折返し_
  - **【完了時の注記（2026-10-02）】** 共通の Breadcrumb は trading-partner-management の Task 30.1（コミット `6533ce34`）が是正した。本スペックの画面の側に足した是正は無い。20.6 と同じ巡で測り直し、一覧・作成・編集・詳細の 375 幅と 320 幅、3 通りの名前（普通・英数字一語 200 文字・長い和文）の 24 状態すべてで、固定の文言の項目（ダッシュボード・プロジェクト一覧・工事写真一覧・新規アルバム・アルバムを編集）が一行に収まることを実測した（文字列の高さ 16.0 / 一行の実測 16.0、項目の箱は 98×20 など）。nav は一覧・作成・編集が 311/311（320 幅で 256/256）、詳細が 319/319（264/264）、main は 343/343（288/288）、文書全体は 375/375（320/320）である。独立レビューも別の手段（項目の箱と行数）で 16 状態を測り、同じ結果を得た。この結果は 20.6 が足したブレッドクラムの E2E が固定する

- [x] 20.3 写真項目のファイル名がモバイル幅で詳細画面を水平にはみ出させないようにする
  - **経緯**: 20.1 の後の機能レベル再検証（2026-10-01、コミット `764f6888`）が NO-GO を返した。機械検査は全件緑だったが、375 幅の実ブラウザで、写真項目のファイル名の見出し（`PhotoItemPanel.tsx` の `styles.fileName`）に折り返しの指定が無く、main を押し広げていた。アンダースコアは折り返し位置にならないため、カメラ由来のファイル名は一語として扱われる。現実的な名前 `IMG_20261001_143052_foundation_rebar_<stamp>.jpg` で main が 489/375 になり、`PXL_20261001_053012345.MP.jpg`（自然幅 219px）でも見出しの幅 203px を超える。既存の E2E は短い固定ファイル名しか与えないため、検出できない
  - `styles.fileName` に折り返しの指定を加えること。削除確認ダイアログでファイル名を出す本文（同ファイル内）も、同じ型ではみ出す（scrollWidth 427 / clientWidth 290）ため、併せて扱うこと
  - 要件 19.1 の E2E に、現実的な長さの区切りの無いファイル名の画像を与える条件を足すこと。前提として、名前の自然幅が見出しの幅を超えることを主張する。そのうえで、main に水平のはみ出しが無いこと（許容誤差 1px）と、見出しの右端が画面幅の内側にあることを主張する。是正前に赤、是正後に緑になることを実測すること
  - _Requirements: 19.1_
  - _Boundary: 工事写真の写真項目パネルと削除確認ダイアログのファイル名表示_

- [x] 20.4 看板配置ダイアログの操作列が長い工事件名でボタンを画面外へ押し出さないようにする
  - 同じ再検証の探査で判明した。工事件名が英数字の長い一語のとき、`SignboardPlacementEditor.tsx` の `styles.toolbar` に flexWrap が無く、`styles.badge` に折り返しの指定も無いため、次のようになる。バッジは 607px に広がり、案内文は幅 24px の縦長に潰れ、「保存」ボタンは right=741 の画面外へ押し出される。ダイアログ内は横スクロールでき、ボタンには到達できる。現実的な名前や和文では起きない
  - 操作列を折り返せるようにし、バッジに折り返しの指定を加えること。375 幅で「保存」ボタンが画面幅の内側にあることを E2E か単体で主張し、是正前に赤になることを実測すること
  - _Requirements: 19.1_
  - _Boundary: 看板配置ダイアログの操作列のモバイル表示_

- [x] 20.5 アルバムの削除確認ダイアログが長いアルバム名でモバイル幅を水平にはみ出さないようにする
  - **経緯**: 是正の最終巡（3巡目）の機能レベル再検証（2026-10-01、コミット `7d32e596`）が NO-GO を返した。機械検査は全件緑で、20.3・20.4 の是正も3通りの名前で効いていた。残った所見はこの1件である。`AlbumDeleteDialog.tsx` の `styles.albumName` に折り返しの指定が無く、375 幅で英数字一語の長いアルバム名を与えると、ダイアログの scrollWidth が 1018 / clientWidth 338、名前の文字列の右端が 1037 になる。詳細画面と一覧画面の双方から開く。20.1・20.3 と同じ型である。是正の上限（3巡）に達したため、利用者の判断を待って着手する
  - `styles.albumName` に折り返しの指定を加えること。要件 19.1 の E2E に条件を足すこと。前提として名前の自然幅がダイアログ幅を超えることを主張し、そのうえでダイアログとパネルの scrollWidth と、文字列（Range）の右端を主張すること。是正前に赤になることを実測すること
  - _Requirements: 19.1_
  - _Boundary: アルバムの削除確認ダイアログのアルバム名表示_

- [x] 20.6 要件の受入基準に当たらないモバイル幅の表示崩れを扱う
  - 同じ再検証の探査で判明した。いずれも受入基準の違反ではない
  - (a) 一覧画面のブレッドクラム: 長い英数字一語のプロジェクト名で main が 913/375 になる。19.2 と同じ対処が使える。R3 のモバイルの受入基準は 3.2（カード形式）だけで、これは満たしている
  - (b) 看板マスタの表: 長い英数字一語の工事件名・工事場所で main が 1857/375 になる。R8 はモバイルの受入基準を持たない
  - (c) ビューアの操作部品: 375 幅で「全体表示」ボタンの中心を「右に回転」ボタンが覆う。名前の種類によらず起きる。R14 はタップ領域の条項を持たず、19.3 の注記もビューアを対象外とする
  - (d) 作成画面・編集画面のブレッドクラム: 長い英数字一語のプロジェクト名で main が 959/375 になり、「工事写真一覧」のリンクが right=913 で画面外へ出る。R1/R2 はモバイルの受入基準を持たない。20.7 の後の機能レベル検証（2026-10-02、コミット `8b1ada24`）で判明した
  - (e) 一覧・看板マスタ・ビューアの取得エラーの表示: 英数字一語の長い応答文言で、一覧（`ConstructionPhotoListPage.tsx` の `STYLES.errorText`）は main が 983/343・文字列の右端 998.7、看板マスタ（`ConstructionSignboardListPage.tsx` の `styles.errorText`）は main が 975/343・右端 990.7 になる。ビューア（`ConstructionPhotoImageViewer.tsx` の `STYLES.errorContainer`）は left -376 / right 751 で両端が切れる。20.8 が詳細画面で是正した `errorText` と同じ型である。20.8 の後の機能レベル検証（2026-10-02、コミット `2503b7d3`）で判明した
  - (f) 看板マスタの表（長い和文）: 工事場所の列が幅 38 / 高さ 4226 に潰れ、main が 356/343 になる（`ConstructionSignboardListPage.tsx` の `styles.td`）。同検証で判明した
  - (g) 320 幅の詳細画面: ブレッドクラムの現在項目が 40×180 の縦長になる（20.2 と同型）。同検証で判明した
  - **利用者の判断（2026-10-02）**: 一行の是正で済むものだけを行う。対象は (a)・(d)・(e)・(g) である。(a)・(d)・(g) は共通の Breadcrumb の是正（trading-partner-management の Task 30.1）の後に測り直し、残る分だけを本スペックの画面の側で直す。(e) は 3 画面の取得エラーの表示に折り返しの指定を加える。**(b)・(f)（看板マスタの表）と (c)（ビューアの操作部品の重なり）は見送る**——表のモバイル表示と操作部品の配置は設計が要り、受入基準にも当たらない
  - 是正した箇所ごとに、375 幅の E2E か単体で、前提（文字列の自然幅が箱を超える）と水平のはみ出しが無いこと（文字列の右端は Range）を主張し、是正前に赤になることを実測すること。被覆印は、受入基準を持つ画面に限って掲げる
  - _Depends: trading-partner-management の Task 30.1_
  - _Boundary: 工事写真の一覧・作成・編集・看板マスタ・ビューアのモバイル表示_
  - **【完了時の注記（2026-10-02）】** 6 つのスタイルに `overflowWrap: 'anywhere'` を加えた。(e) が名指した 3 箇所は、一覧の `STYLES.errorText`、看板マスタの `styles.errorText`、ビューアの `STYLES.errorContainer` である。**加えて、同じ巡の全画面の探査で同じ型の一行の抜けが 3 箇所見つかり、併せて直した**——作成画面と編集画面の `styles.errorText`（取得エラー。英数字一語で main 1444/343）、一覧の `STYLES.notice`（アルバムを取り除けなかったときの通知。同 1444/343）。この 3 箇所は (e) の名指しにも当初の境界の文言（一覧・看板マスタ・ビューア）にも入っていなかったため、上の `_Boundary:_` に作成・編集を足した（作成・編集は (d) が名指す画面で、是正は一宣言ずつ、普通の文言では描画が変わらない。20.8 の完了時の注記と同じ扱い）。375 幅で英数字一語の文言を与えたときの是正の前後は、一覧の取得エラーが main 1452/343 から 343/343（文字列の右端 1467.7 から 317.6）、ビューアが表示領域 1019/375 から 375/375（文字列 -618.6〜993.6 から 25.6〜349.4）である。ビューアは一行の指定だけで足り、max-width は要らなかった。長い文言でビューアの枠が画面の端から端（0〜375）になるのは是正前からの挙動で、変えていない。取得エラーの文言はサーバー応答由来で、利用者の文字列が入る現実の経路は確認しておらず、20.8 と同じく防御的な是正である
  - (a)・(d)・(g) は、共通の Breadcrumb の是正の後に測り直して残りが 0 件だった（20.2 の完了時の注記）。本スペックの画面の側には何も足していない
  - E2E を 2 件足した。**どちらも受入基準の印を掲げていない**（対象の画面がモバイルの水平のはみ出しの受入基準を持たないため）。取得エラーと通知のテストは是正前のバンドルで 28 件の主張が赤になり、独立レビューが 6 つの指定を 2 回のビルドに分けて外し、対応する表示だけが赤になること（13 件と 15 件）を実測した。ブレッドクラムのテスト（24 状態）は**本項の是正に依存せず、HEAD では最初から緑である**——上流の是正の退行を検出する番として置き、検出力は Breadcrumb を是正前へ戻す変異（142 件が赤）と `flex-wrap` だけを外す変異（84 件が赤）で実測した
  - 短い文言・現実的な文言と 1280 幅では、6 表示の枠・文字列・コンテナの矩形が是正の前後で一致する（独立レビューの 24 状態）。**見送った (b)・(f)・(c) には触れていない**——看板マスタの表は英数字 200 文字の行で main 3065/343 のままである。探査した残りの状態（一覧の通常・空・読み込み中・削除確認、作成・編集の通常と入力エラー、看板マスタの行・空・登録と編集のフォーム・削除確認、ビューアの通常・読み込み中・写真なし、送信失敗のトースト）は 3 通りの文字列で水平のはみ出しが無かった。作成・編集・看板マスタの送信失敗の文言が出る共有のトーストは、本スペックの所有ではない
  - site-survey が所有する宣言 `t13-anchor-references-after-115303` が 1464 から 1466 へ動いたため、同じコミットで貼り直した

- [x] 20.7 現場調査の写真の選択ダイアログで長い調査名が枚数表示を押し出さないようにする
  - **経緯**: 20.5 の独立レビュー（2026-10-01、コミット `16a317b7`）の漏れ探査で判明した。`SurveyImagePicker.tsx` は調査名の `<span>` に折り返しの指定が無く、ボタンは flex で並ぶ。375 幅の詳細画面から開き、英数字一語の長い調査名を与えると、ダイアログ自体は 338/338 に収まる。しかし中身の body が 764/290 に広がり、文字列の右端は 792.5 になる。名前の右の「N 枚」は見えない位置へ押し出され、ダイアログ内に横スクロールが出る。20.1・20.3・20.5 と同じ型で、要件 19.1（および 6.1 の選択候補の表示）を損ないうる
  - 調査名に折り返しの指定を加えること。要件 19.1 の E2E で次を主張すること: 前提として名前の自然幅が body を超えること、body の scrollWidth、調査名の文字列（Range）の右端、枚数表示の右端。是正前に赤になることを実測すること
  - 同じ探査では、ほかに2件を測った。看板の選択（SignboardAssignDialog の option）ははみ出さない（select は幅 295 に収まり、末尾は省略表示）。一覧の表のアルバム名はデスクトップ専用で、表の外枠の中で横スクロールするにとどまる（20.6 と同じ扱い）
  - _Requirements: 19.1_
  - _Boundary: 現場調査の写真の選択ダイアログの調査名表示_

- [x] 20.8 アップロード失敗の通知が長いファイル名で詳細画面を水平にはみ出させないようにする
  - **経緯**: 20.7 の後の機能レベル検証（2026-10-02、コミット `8b1ada24`）が NO-GO を返した。今回は最初の一巡で全画面・全ダイアログを網羅して探査し、20.5・20.7 の是正が3通りの名前で効いていることを確かめた。残ったのは、これまでの探査で測っていなかった状態の1件である
  - 症状: アップロードが失敗すると、詳細画面の通知に失敗したファイル名が並ぶ（本文は `PhotoUploader.tsx` の `buildNotice` が組み立てる）。通知のスタイル（`ConstructionPhotoDetailPage.tsx` の `styles.notice`）は `whiteSpace: 'pre-line'` だけで、折り返しの指定が無い。375 幅で長い英数字のファイル名を与えると、main が 764/375 になる。`IMG_20261001_143052_foundation_rebar.jpg` でも、文字は通知の枠（305/267）を越えて描かれる。20.1・20.3・20.5・20.7 と同じ型で、要件 19.1 を破る。同じ画面の未送信パネル（要件 20）のファイル名は折り返されている
  - `styles.notice` に折り返しの指定を加えること。同じ詳細画面で、利用者の文字列を流し込む領域（role="alert" の通知、エラー表示、成功通知）を一巡して点検すること
  - 要件 19.1 の E2E に条件を足すこと。375 幅でアップロードの POST を `page.route` で失敗させ、現実的な長さのファイル名を与える。前提として名前の自然幅が通知の幅を超えることを主張し、そのうえで main と通知の scrollWidth、ファイル名の文字列（Range）の右端を主張する。是正前に赤になることを実測すること
  - _Requirements: 19.1_
  - _Boundary: 工事写真の詳細画面の通知の表示_
  - **【完了時の注記（2026-10-02）】** `ConstructionPhotoDetailPage.tsx` の `styles.notice` に `overflowWrap: 'anywhere'` を加えた。点検で同じ詳細画面の2箇所が同型ではみ出したため、併せて是正した。(a) `styles.uploaderWrapper`: 共有の ImageUploader が出すサイズ超過の表示（「<ファイル名>: ファイルサイズが50MBを超えています。」）が、現実的な名前で main 397/343 になっていた。共有部品には触れず、包む側の指定を継承させた（19.2 のブレッドクラムと同じ手法）。(b) `styles.errorText`: アルバム取得失敗の表示。文言はサーバー応答由来で、利用者の文字列が入る現実の経路は確認しておらず、防御的な是正である。未送信パネルは既に折り返されており変更していない。保存エラー・部分成功・PDF 出力・ZIP エクスポート・現調コピー失敗の文言は同じ通知の枠に出る。E2E は是正前に赤（通知: main 453/343、通知 415/267、文字列の右端 469.4）、是正後に緑（343/343、267/267、303.0）。独立レビューが3つの指定を1つずつ外す変異で、対応する表示だけが赤になることを実測した。デスクトップ幅での継承の副作用は、実装者が 375 幅と 1280 幅でアップローダ配下の要素の位置・寸法の差分 0 を測っている。site-survey が所有する宣言 `t13-anchor-references-after-115303` が 1453 から 1454 へ動いたため、同じコミットで貼り直した（増えたのは取得エラーの表示の button「再試行」の参照）。**範囲外の同型（未測定・未処置）**: site-survey の画面が使う ImageUploader の `validation-errors` / `upload-error` には同じ欠陥が残りうる

## Task 21: 機能レベル検証（2026-10-02、HEAD `2503b7d3`、NO-GO）で残った所見（起票のみ。着手は利用者の判断による）

**経緯**: Task 20.8 の後の機能レベル検証が NO-GO を返した。機械検査は緑である（frontend 単体 525 ファイル 11930 件、backend 単体 200 ファイル 6190 件、backend 統合 68 ファイル 1032 件、E2E construction-photos 36 件、型検査と lint は exit 0、スモークはコンソールエラー 0）。関門は 19 本中 17 本が緑で、赤の 2 本（`check:design-measurement-freshness` の `[nonexistent-paths-by-git-index]` 16 対 18、`check:req-coverage` の 3 行）は他スペックの所有である。375 幅の実ブラウザ探査は、詳細画面の 44 状態を 3 通りの文字列（現実的・英数字一語 200 文字・長い和文 200 文字）で測り、**内側の `<main>` とダイアログについては受入基準 19.1〜19.5 の違反が 0 件だった**（`<main>` は全件 343/343、文字列の右端は全件 375 以内）。詳細以外の画面は 29 状態を同じ 3 通りで測り、20.2・20.6 に既載の崩れを再現した。NO-GO の理由は、本スペックの実装の是正では解けない次の 2 点である。(1) 共通ヘッダ由来の文書全体の水平スクロール（21.1）。(2) 20.2・20.6 が利用者の判断待ちで開いていること。生の測定は検証時のスクラッチに置かれ、リポジトリには残していない。測れなかった状態は、未送信の破棄確認とブラウザ離脱確認（ネイティブのダイアログ）、セッション切れの通知（共通部品）、ImageUploader の `upload-error` である

- [x] 21.1 共通ヘッダによる文書全体の水平スクロールと要件 19.1 の判定範囲を確定する
  - admin で 375 幅の詳細画面を開くと、文書が 400/375 になり横へ 25px 動く（320 幅では 80px、400 幅以上で解消）。user ロールは 375 幅で 375/375、320 幅で 350/320 である。はみ出すのは `frontend/src/components/Navigation/AppHeader.tsx` の利用者メニューで、詳細画面の `<main>` 自体は収まっている。Implementation Notes が「工事写真範囲外・共有レイアウト側の別課題」と記録しているが、どのスペックにも起票が無い
  - 要件 19.1 の E2E は内側の `<main>` で測っており、文書全体の横スクロールは主張の外にある（19.2 の完了時の注記も同じ理由で文書全体を主張に使っていない）
  - 選択肢は二つある。(a) AppHeader を所有するスペック（検証は user-authentication と見立てた）へ起票して直し、その後に 19.1 を文書全体で再検証する。(b) 19.1 の判定範囲を詳細画面の `<main>` と定める注記を requirements.md に加える（19.3 の注記と同じ形）
  - _Requirements: 19.1_
  - **利用者の判断（2026-10-02）**: (a) を採る。共通ヘッダの所有は user-authentication である（同スペックの design.md が定義し、導入はコミット `058aa97c`。同スペックの要件 15 の受入基準 1 が全画面に 320〜767px のレスポンシブ対応を課す）。是正は同スペックの Task 39.1 が行う。本項は、その後に要件 19.1 の E2E へ、admin と user の双方で 375 幅と 320 幅の文書全体（`document.documentElement`）に水平のはみ出しが無いことの主張を足して閉じる。主張が共通ヘッダの是正に依存することを、ヘッダの是正を外す変異で赤になる実測で示すこと
  - _Depends: user-authentication の Task 39.1_
  - _Boundary: 要件 19.1 の判定範囲と共通ヘッダのモバイル表示_
  - **【完了時の注記（2026-10-02）】** 共通ヘッダは user-authentication の Task 39.1（コミット `d7701b08`）が是正した。本項は要件 19.1 の E2E へ、詳細画面の文書全体（`document.documentElement`）に水平のはみ出しが無いことを主張するテストを 1 件足した。測る状態は 5 つである（admin の 375 幅・320 幅・375 幅で区切りの無い長いアルバム名、user の 375 幅・320 幅）。共通ヘッダの是正だけを外したビルドでは、admin が 400/375・400/320・400/375（長い名前）、user の 320 幅が 350/320 で赤になり、`<main>` の主張（343/343・288/288）は通る。是正を戻すと 5 状態とも一致する。**user の 375 幅は是正前から 375/375 で、この状態の主張は是正への依存を示さない**（回帰の番として置く）。変更は spec 1 件だけで、本番のコードは変えていない。同じ spec の「共通ヘッダがはみ出すため文書全体は測らない」という 8 箇所の注記を現況へ改めた（主張とコードは不変）。**文書全体を主張するのは上の 5 状態だけである**——長いファイル名・通知・各ダイアログ・長いプロジェクト名のブレッドクラムの状態は、兄弟のテストが `<main>` とダイアログの右端を主張するにとどまり、文書全体は測っていない（独立レビューの指摘。兄弟のテストの注記の「文書全体の主張は末尾のテストが担う」はこの範囲で読むこと）。肯定側から指す参照は 1464 件のまま動かず、site-survey の宣言の貼り直しは要らなかった

- [x] 21.2 「看板を配置 / 看板を変更」ボタンのタップ領域を要件 19.3 に含めるかを決める
  - 375 幅で 78×28 である（`PhotoItemPanel.tsx` の `styles.assignSignboardButton`。モバイル用の上書きが無い）。写真項目の操作部品で 44×44 に満たないのはこれだけである。19.3 の条文は数値を持たず違反とは断定できないが、19.3 の注記が充足寸法として引く下限には届かない。詳細画面の他のボタン（編集・削除・PDF出力・保存など）も高さ 37〜39 である
  - 含めるなら、他の 4 部品と同じく `TAP_TARGET_MIN_PX` のモバイル用の上書きを足し、19.3 の単体テストに 1 件加える
  - _Requirements: 19.3_
  - **利用者の判断（2026-10-02）**: 19.3 の対象に含めて是正する。詳細画面の他のボタン（高さ 37〜39）は本項の対象にしない
  - _Boundary: 写真項目パネルの看板の操作ボタンのタップ領域_
  - **【完了時の注記（2026-10-03）】** `PhotoItemPanel.tsx` に `styles.assignSignboardButtonMobile`（`minWidth`・`minHeight` が `TAP_TARGET_MIN_PX`）を足し、兄弟の四つと同じ `isMobile` の合成で当てた。375・320・767 幅で、ボタンは二つの文言のどちらでも 78×28 から 78×44 になった（幅は文言の内容で 78 あり、動いたのは高さだけである）。768・1280 幅は 78×28 のまま変わらない。隣の部品の矩形は是正の前後で一致する（操作の行は取り除くボタンで元から 44 の高さがあり、写真項目の高さも変わらない）。独立レビューが箱を 2px の格子でヒットテストし、3 幅 × 2 状態のすべてで 858/858 点がボタン自身だった。実際のクリックは 375 幅の 2 状態と 320 幅の「看板を配置」で確かめた（320 幅の「看板を変更」は探査の不備で取れておらず、根拠は格子のヒットテストだけである）
  - 単体に 1 件、E2E に 1 件を足した。モバイル用の合成を外す変異で、単体は足した 1 件だけが、E2E は看板の操作ボタンの主張だけが 4 状態とも 78×28 で赤になる。**要件 19.3 を主張する E2E はこれまで無く、新設した**。同じ E2E は写真項目の他の 6 つの操作部品（ドラッグハンドル・上下の移動・二つのチェックボックス・取り除くボタン）の 44×44 も主張する——これらは是正前から 44×44 で、赤の実測は無い（回帰の番）。E2E が測るのは外接矩形で、覆われていないことは主張していない
  - requirements.md の受入基準 19.3 の注記へ、日付付きの追記を 1 項足した（受入基準の文と既存の項は変えていない）。`frontend/src/utils/tap-target.ts` の冒頭の「現況」の記述（モバイル用の上書きが四つ、ほか）は本項で古くなったが、境界の外のため 21.5 に起票した。詳細画面の他のボタン（編集・取り除く・エクスポート・PDF出力・保存など、高さ 37〜39）は利用者の判断により本項の対象にしていない
  - site-survey が所有する宣言 `t13-anchor-references-after-115303` が 1466 から 1474 へ動いたため、同じコミットで貼り直した

- [x] 21.3 写真項目の削除が失敗したときに何も表示されない状態を扱う
  - `PhotoItemPanel.handleDeleteConfirm` は「エラーは呼び出し元で処理」として握りつぶすが、`ConstructionPhotoDetailPage.handleDelete` は捕捉も表示もしない。DELETE を 500 にすると、確認ダイアログが開いたまま通知は 0 件である。site-survey の同型は呼び出し側で報告している。受入基準 7.7 と design.md は失敗時の表示を定めていないため違反ではなく、タスク間の継ぎ目の欠落である
  - 扱うなら挙動の変更であるため RED → GREEN で進め、失敗時の通知を E2E で主張すること
  - _Requirements: 7.7_
  - **利用者の判断（2026-10-02）**: 失敗時に通知を出す。文言と表示の場所は、同じ詳細画面の既存の失敗の通知（`styles.notice` の枠）に揃える
  - _Boundary: 写真項目の削除の失敗時の通知_
  - **【完了時の注記（2026-10-03）】** `ConstructionPhotoDetailPage.handleDelete` は、失敗をアルバム削除の失敗と同じ状態（`error`）に同じ形で載せ、詳細画面の既存の通知の枠（role=alert）へ表示する。文言はサーバーが返した理由で、無ければ「写真項目の削除に失敗しました」である。`PhotoItemPanel` は成功・失敗のどちらでも確認ダイアログを閉じる（同じ画面のアルバム削除の確認ダイアログと同じ扱い。開いたままでは通知がモーダルの背後に隠れる）。写真項目・未保存の変更・選択は変わらず、同じ操作でやり直せる。削除の開始時に `notice` と `error` の両方を消す
  - **利用者の判断の文面に無い、見える挙動が 1 つある（利用者へ報告済み。是非は利用者の判断による）**: 失敗時に通知の枠を画面の中央へ送る（`scrollIntoView({ block: 'center' })`）。写真項目は通知の枠より下に並ぶため、送らないと 375・320・1280 のどの幅でも通知が画面の外になる（独立レビューの実測。写真項目 5 件で見出しの top は −3559・−3546・−1571）。上端へ寄せる形は sticky の共通ヘッダに覆われた。**代償として、操作した削除ボタンは画面の外へ出る**——375 幅の写真項目 5 件では、やり直しに約 3,700px 戻る必要がある
  - **是正の 1 巡目で直した 2 点**: (1) 初稿はセッション切れ（401）のときだけ通知を出さなかった。利用者の判断は例外を定めておらず、同じ画面の保存・アルバム削除は 401 でも共通のセッション切れの表示と通知の両方を出す（レビューの実測）ため、区別をやめた。(2) 初稿は失敗を `notice` に載せたため、削除の失敗の後に保存が別の理由で失敗すると、古い削除の失敗が残って保存の失敗がどこにも出なかった（描画が `notice ?? error` で、保存は `error` しか消さない。変更前は表示されていた退行）。`error` へ載せ替えて解消した。実ブラウザの 3 幅で、削除の失敗 → 保存の失敗で保存の文言へ置き換わり、保存の成功で通知が 0 件になることをレビューが測っている
  - 単体 11 件（ページ 10 件・パネル 1 件）と E2E 1 件を足した。E2E は 375 幅で、失敗時にダイアログが閉じ、通知が 1 件で画面内にあり覆われておらず、写真項目と DB の行が残ること、やり直しで写真項目と看板の指定・配置の行が消えて読み込み直しても戻らないことを主張する（やり直しの成功が受入基準 7.7 そのものであるため、印 `REQ-7.7` を掲げる。失敗時の表示は 7.7 の外である）。検出力は変異で実測した——失敗の表示の設定を外すと E2E の通知の主張と単体 10 件が、画面内へ送る処理を外すと E2E の画面内の主張が、開始時の `notice` の消去を外すと「アップロードの失敗の通知の後の削除の失敗」の単体が、開始時の `error` の消去を外すとやり直しの単体が赤になる。**401 と「削除の失敗 → 保存の失敗」は単体だけで、E2E は無い。画面内の主張は 375 幅だけである**
  - 削除の開始時に、先に出ていた通知（アップロードの失敗の一覧、PDF・ZIP の通知）と失敗の表示（保存の失敗など）も消える。要件が保持を求める情報は失われない——R20.2 の件数・ファイル名・理由は未送信画像の表示が担い（残ることを実測）、R18 の未保存の状態は表示と離脱の確認が担う。通知の文言はどの操作の失敗かを含まない（同じ画面の既存の通知と同じ性質）。境界の外で判明した既存の問題は Task 22 に起票した
  - site-survey が所有する宣言 `t13-anchor-references-after-115303` が 1474 から 1477 へ動いたため、同じコミットで貼り直した

- [x] 21.6 本日の E2E が持ち込んだ条件付きの主張 5 件を解消し `check:e2e-guards` を緑へ戻す
  - **経緯**: 21.4 の実装者が pre-push の関門 19 本を変更の前後で回し、`check:e2e-guards` が HEAD の時点で赤であることを見つけた（2026-10-03）。`[T1-conditional-expect]`（条件分岐の内側に置いた主張）が基準 0 件に対して 5 件ある。5 件とも 2026-10-02〜03 の本実行が足した E2E である。各タスクの独立レビューは場合分けとして妥当と判断したが、関門は形そのものを禁じる。親が各タスクの完了時にこの関門を回していなかったために通過した
  - 対象（`npm run check:e2e-guards:verbose` の実測）: `e2e/specs/construction-photos/construction-photo-additional.spec.ts` の 3 件（条件は `nameKind === '区切りの無い長い名前'`・`s.screen === '詳細'`・`kind !== '普通の名前'`。20.6 が足した）、`e2e/specs/navigation/app-header.spec.ts` の 1 件（`role.isAdmin`。user-authentication の 39.1 が足した）、`e2e/specs/trading-partners/trading-partner-navigation.spec.ts` の 1 件（`index === 0`。trading-partner-management の 30.1 が足した）
  - 主張を条件の外へ出すこと。**基準の更新（`check:e2e-guards:update`）で通してはならない**。主張の強さを落とさないこと——場合ごとに期待値を決めて無条件に主張する、対象の集合を先に絞ってから無条件に回す、場合ごとにテストを分ける、のいずれかの形にする。書き換えた各主張が今も検出力を持つことを、対応する是正を外したビルドか、期待値を壊す変異で示すこと
  - 他スペックの E2E 2 件は、持ち込んだタスクの後始末として本項で併せて直す（所有スペックの tasks.md の完了時の注記へは親が追記する）
  - _Requirements: 19.1_
  - _Boundary: 上記 3 つの E2E の spec の、条件付きの主張 5 箇所_
  - **【完了時の注記（2026-10-03）】** 5 箇所とも主張を条件の外へ出した。基準は変えていない。`check:e2e-guards` は exit 0（`T1-conditional-expect` が 5 件から 0 件、13 の型すべて 0 件、自己検査 210/210）で、pre-push の関門 19 本は変更の前後で、この 1 本が赤から緑へ変わった以外は同じである（赤のまま残るのは以前からの `check:design-measurement-freshness` と `check:req-coverage`）。テストの題名と印は変えておらず、3 つの spec は 26・34・25 件で件数も変わらない。肯定側から指す参照は 1477 件のまま動かない
  - 書き換えの形: (1) 取引先のパンくずの補助は、先頭の項目と二番目以降を分けて取り、「二番目以降が 1 件以上」を主張してから同じ主張を無条件に回す。(2) 共通ヘッダは、管理メニューのボタンの集合を取り、件数を役割ごとの期待値（管理者 1・一般ユーザー 0）で主張してから同じ本体を回す。(3)(5) 自然幅の前提は、場合ごとの下限（長い名前は枠の幅、普通の名前は 0）を決めて無条件に主張する。(4) モバイルの配置が確定したことの待ちは、画面ごとの `<main>` の maxWidth の期待値（一覧 1200px、作成・編集 768px、詳細 100%）を表に持って無条件に主張する
  - **弱めていないことと残る性質（独立レビューの判断）**: 5 件とも元の形より弱くなっておらず、(1)(3)(4) は強くなっている。(3)(5) の普通の名前の側は「自然幅を測れている」ことだけを課す——普通のアルバム名の自然幅は 364.7 で 375 幅の `<main>` の 343 を超えるため、「普通の名前は収まる」という主張は偽になり採れない。(5) の普通の名前の側は直前の主張と重なり、何も足さない（元の形はその場合に何も主張していなかった）。期待値に三項演算子を置く形は関門が禁じる形（主張そのものを包む形）ではなく、同じ spec に先例がある。**(4) により、ブレッドクラムのテストが一覧・作成・編集のコンテナの maxWidth の定数を固定する**——これらの画面にモバイルの分岐を足すときは、この表の更新が要る
  - 検出力は、実装者とレビューがそれぞれテストの側の変異（期待値を壊す、集合を空にする、名前を短くする等）で確かめ、書き換えた主張がすべて状態の名前つきで赤になった。是正を外した本番のビルドでの再実測はしていない（主張の本体は変えておらず、囲みだけを変えたため）

- [x] 21.5 `tap-target.ts` の冒頭の現況の記述を 21.2 の後の実測へ揃える
  - `frontend/src/utils/tap-target.ts` の冒頭の「現況」の節は、PhotoItemPanel のモバイル用の上書きを「四つ」と述べ、変異で落ちる単体の件数（「58 件中 7 件」「`R19.3:` を名乗る 5 件」）を引く。21.2 が上書きを五つにし、単体を 1 件足したため古くなった。読む関門とテストは無い（独立レビューの確認）
  - 既存の記述は 2026-10-01 の実測の記録として残し、日付付きの追記で現況を並べること。件数は着手時に測り直すこと（変異を当てて数える。写さない）。コメントだけの変更で、実行されるコードは変えない
  - _Requirements: 19.3_
  - _Depends: 21.2_
  - _Boundary: `frontend/src/utils/tap-target.ts` の冒頭の注釈_
  - **【完了時の注記（2026-10-03）】** 冒頭の注釈へ日付付きの追記を 31 行足した（取り除いた行は 0 行。2026-10-01 の節は書き換えていない。実行されるコードは不変で、注釈を除いた出力は前後で同じである）。実測は、モバイル用の上書きが五つ、`TAP_TARGET_MIN_PX}px` の当たりが 12 行（Panel 10・Viewer 2）、44 → 20 の変異で 61 件中 8 件が赤（回転ボタン 2 件と `R19.3:` 6 件。変異前は 61 件すべて緑）である。**本項の本文の「単体を 1 件足した」は 21.2 についての記述で、母数は 58 から 61 へ 3 件動いている**——`PhotoItemPanel.test.tsx` が 37 → 40 で、`5d22661d`・`3c1b875e`（21.2）・`d8286a0c`（21.3）が 1 件ずつ足し、下限の検証は 21.2 の 1 件だけである。site-survey の側の同じ変異（89 ファイル 2473 件のうち 8 ファイル 27 件）は測り直していない。**本文の「読む関門とテストは無い」は正確でない**——`check:cf-evidence` が本ファイルを読み、追記の変異の文を索引して照合の件数が 256 から 257 へ動いた（exit 0。この件数を固定する宣言は無い）。独立レビューが全数値を測り直して一致を確かめた

- [x] 21.4 design.md の File Structure Plan に載っていない本番ファイル 4 件を追記する
  - `SignboardAssignDialog.tsx`・`signboard-placement-geometry.ts`・`ConstructionPhotoLedgerExportService.ts`・`loadConstructionPhotoLedgerExportService.ts`。いずれも本番から到達しており孤児ではない。計画に載る全ファイルは実在する
  - **利用者の判断（2026-10-02）**: 追記する。21.3 が削除失敗時の通知を足すなら、その設計の記述も同じ文書へ反映する
  - _Boundary: 本スペックの design.md の File Structure Plan_
  - **【完了時の注記（2026-10-03）】** File Structure Plan へ **5 件**を追記した。起票が名指した 4 件に加え、計画と `git ls-files` の突き合わせ（名前に construction-photo / signboard を含む本番ファイル 46 件）で `frontend/src/pages/ConstructionPhotoEditPage.tsx` が計画に無いと分かり、併せて追記した（Requirements Traceability の 16 の行に名前があるだけだった）。各ファイルの責務と要件番号は、冒頭の注釈・取り込み元・テストの印から導いた（`SignboardAssignDialog.tsx` と `signboard-placement-geometry.ts` は R9、`ConstructionPhotoLedgerExportService.ts` とその動的 import の境界 `loadConstructionPhotoLedgerExportService.ts` は R10、編集ページは R1）。動的 import の境界は estimate-creation のタスク 56.13 が導入したもので、その旨を行に書いた。独立レビューが別の突き合わせ（backend 13 件・frontend 33 件と、工事写真の識別子を参照する非テストのファイル）で、ほかに漏れが無いことを確かめた。`ConstructionPhotoSearchFilter.tsx` は既存の行に省略形で載っている。`frontend/src/utils/tap-target.ts` は site-survey が作った横断の出所で、本機能のファイルとして載せていない
  - 利用者の判断に従い、21.3 の挙動を「Error Handling > Error Categories and Responses」へ 1 項足し、該当 2 ファイルの変更の項へ 21.2・21.3 の変更を足した。親が渡した文面のうちコードと食い違う 3 節は、コードに合わせて直してある（文言の規則は `ApiError` でない例外も既定の文言になる、後の保存が `error` を消すのは未保存の変更があるときだけ、取り除く操作のボタンが画面の外へ出るかは写真項目の数による）。パスを名指す行では不在の語を避けた（`check:design-path-refs` の面は 189 件のまま、自己検査は 53/53）。Requirements Traceability は部品名の粒度のため変えていない——9 の行に `SignboardAssignDialog`、10 の行に `ConstructionPhotoLedgerExportService` を足す余地はあるが、`check:design-component-reqs` がこの表を読むため、足すなら影響を測って別タスクにすること（レビューの勧め）

## Task 22: Task 21.3 の独立レビューで判明した、詳細画面の失敗の表示の既存の問題（起票のみ。着手は利用者の判断による）

**経緯**: Task 21.3 の独立レビュー（2026-10-03、起点 `3c1b875e`）が、同タスクの境界の外に既存の問題を実測した。いずれも 21.3 が持ち込んだものではない

- [ ] 22.1 通知と失敗の表示が二つの状態に分かれていて、片方がもう片方を隠す状態を扱う（起票のみ）
  - 詳細画面の通知の枠は `notice ?? error` を描く。PDF・ZIP・アップロードの通知（`notice`）が出ている間、保存・アルバム削除・写真項目の削除の失敗（`error`）は隠れ、通知が消えると古い失敗が再び現れる（コードの読みによる。21.3 が直したのは、写真項目の削除の失敗が保存の失敗を隠す経路だけである）
  - _Requirements: 18, 20_
  - **利用者の判断（2026-10-04）**: 通知と失敗を一つの状態にまとめ、新しいものが前のものを置き換える形にする（後から出た通知が古い失敗を、後から出た失敗が古い通知を置き換え、消えた後に古いものが再び現れない）。22.2 と同じ箇所のため、22.2 はこの後に続けて行う
  - _Boundary: 詳細画面の通知と失敗の表示の状態_

- [ ] 22.2 保存の失敗の通知が、保存ボタンを押した直後に見えない状態を扱う（起票のみ）
  - 保存の失敗の通知は、押した直後の位置では 375 幅で top −16〜39（共通ヘッダの下）、1280 幅で 9〜64（共通ヘッダに覆われる）、320 幅で −156（画面の外）になる（レビューの実測。スクロール位置は Playwright のクリック時の自動スクロールによる値）。21.3 は写真項目の削除の失敗だけを画面内へ送る
  - _Requirements: 18_
  - **利用者の判断（2026-10-04）**: 23.9 と同じ考え方で、保存の失敗を保存ボタンの近くにも表示する（上部の通知の枠の表示は 22.1 の形のまま残す）。表示は role=alert で読み上げられ、モバイル幅（375・320）ではみ出さず、長い文言でも破れないこと
  - _Depends: 22.1_
  - _Boundary: 詳細画面の保存の失敗の通知の可視性_

- [x] 22.3 削除確認ダイアログが削除の実行中も外側のクリックで閉じられる状態を扱う
  - 削除の実行中にオーバーレイをクリックするとダイアログが閉じる。その間に別の写真項目の確認を開くと、先行する削除の完了がそれを閉じる。失敗時にも起きるようになった点だけが 21.3 で新しい
  - _Requirements: 7.7_
  - **利用者の判断（2026-10-04）**: 削除の実行中はダイアログを閉じられないようにする（オーバーレイのクリック・Esc・キャンセルを実行中は受け付けない）
  - **【完了時の注記（2026-10-04）】** 確認ダイアログは共通部品ではなく、`PhotoItemPanel.tsx` が全写真項目で一つを共有する本スペックの部品である。`isDeletingRef` を削除の開始で真、`finally` で偽にし、`handleDeleteCancel`（オーバーレイのクリックとキャンセルが共に通る）と `handleDeleteClick`（各写真項目の取り除く操作のボタン）を実行中は無視する。表示は従来どおり `isDeleting` の状態に従い、実行中はキャンセルが無効になる。Esc で閉じる処理は元から無く、実行中も実行中でないときも Esc では閉じない。実行中に背後の別の写真項目の取り除く操作をキーボード（Tab と Enter）で押すと確認の対象が入れ替わる経路が是正前は到達可能だったが、押下の無視で塞いだため、先行する削除の完了が別の写真項目の確認を閉じる経路は無くなった。23.9 の挙動（写真項目の中の role=alert、フォーカスの復帰、画面の下端での移動）は保つ
  - 単体 4 件と E2E 1 件を足した。E2E は 375 幅で DELETE を止めた間に、オーバーレイの隅のクリック・Esc・キャンセル・背後のボタンの Enter をしてもダイアログと対象が残り、失敗（500）でも成功（204）でも完了後に閉じることを主張する。独立レビューが各ガードを外す変異で単体と E2E が赤になることを確かめた。新しい E2E に要件の印は付けていない（7.7 の文はダイアログの実行中の挙動を含まず、7.7 の印は既存の取り除く操作の E2E が持つ）。新しい E2E で肯定側から指す参照が 1538 から 1543 へ動いたため、site-survey が所有する宣言 `t13-anchor-references-after-115303` を同じコミットで貼り直した
  - 残る性質（起票していない）: ダイアログは焦点を閉じ込めないため、写真項目の取り除く操作以外の背後の操作（保存など）は実行中もキーボードで届く
  - _Boundary: 写真項目の削除確認ダイアログの実行中の操作_

**所有が本スペックに無いもの（測定のみ・未起票）**: `frontend/src/api/client.ts` の 401 の扱い。他のリクエストが始めたトークンの更新に相乗りした経路では、再送が 401 でも共通のセッション切れの表示が出ない。更新を始めた経路では、再送が 401 以外（500 など）で失敗しても共通の表示が出て 401 の失敗に化ける。どちらもレビューのコードの読みによる

## Task 23: 機能レベル検証（2026-10-03、HEAD `c8609dc4`、NO-GO）が見つけた受入基準の未達

**経緯**: Task 20.2・20.6・21.1〜21.6 と上流（user-authentication の 39.1、trading-partner-management の 30.1）の完了後の機能レベル検証が NO-GO を返した。前回（`2503b7d3`）の NO-GO の理由 2 点は解消した——文書全体のはみ出しは admin / user × 375 / 320 / 1280 × 3 通りの名前 × 6 画面の 126 状態で、見送り済みの看板マスタの表を除き 0 件、写真項目の削除の失敗の通知は 57 状態で違反 0 件である。機械検査は緑である（frontend 単体 525 ファイル 11944 件、backend 単体 200 ファイル 6190 件、backend 統合 68 ファイル 1032 件、E2E は 23 回の実行で 588 件、型検査と lint は exit 0、スモークはコンソールエラー 0）。pre-push の関門は 19 本中 17 本が緑で、赤の 2 本は他スペックの所有である。**今回の NO-GO の理由は、全要件を実挙動と突き合わせて見つかった下記の未達である。いずれも初回実装（`c349890a`、2026-07-29）からある既存のもので、本実行が持ち込んだものは 0 件である。22.1〜22.3 は受入基準の文言に反しないことを検証が確かめており、それらを除いても下記が GO を妨げる。** 被覆の検査（145/145）は緑のままで、既存の E2E と統合はこれらを検出しない

- [x] 23.1 プロジェクトへのアクセスの判定が機能の中で食い違う状態を解消する
  - `canAccessProject`（作成者・営業担当・工事担当・admin だけを通す）は `construction-photo-image.service.ts` と `construction-photo-metadata.service.ts` にだけあり、写真一覧・メタの一括更新・並び替え・写真項目の削除・印字画像・原本に掛かる。アルバムの CRUD・アップロード・現調コピー・看板の全ルートには掛からない
  - 検証の実測（`user@example.com`、admin が作成し営業担当が別人のプロジェクト）: `GET /api/projects/:id`・アルバムの一覧と取得・看板の一覧・`POST …/images`（アップロード）は 200 / 201、`GET …/images`・`PATCH …/images/batch`・`GET …/original` は 404。詳細画面は全幅で role=alert に英語の not found の文言が出て写真項目 0 件になる。同じ利用者・同じプロジェクトで site-survey の `GET /api/site-surveys/:id/images` は 200 である
  - **どちらの方針でも違反が残る**: 権限の表（RBAC）だけが正なら、写真の側の拒否が 1.2 と要件 17 の権限の表（user は閲覧・作成・編集）を破る。担当者に限るのが正なら、アルバム・看板・アップロードの側が 13.3 を破る（担当でない利用者へ代表サムネイルの署名付き URL も返る）。design.md は「プロジェクトメンバーシップ専用ガードは存在しない」と「他プロジェクトの写真は 404」の両方を述べる
  - 方針を決めたうえで全ルートを揃え、担当でない一般ユーザーで一覧 → 詳細 → アップロード → 保存を通す（または拒否される）E2E と統合テストを足すこと。design.md の該当の記述も揃える
  - _Requirements: 1.2, 13.2, 13.3, 17.1_
  - **利用者の判断（2026-10-03）**: 権限の表（RBAC）だけで判定する。写真の一覧・メタの一括更新・並び替え・写真項目の削除・印字画像・原本に掛かっている担当者の限定（`canAccessProject`）を外し、アルバム・アップロード・看板と同じくロールの権限だけで判定する。design.md の「プロジェクトメンバーシップ専用ガードは存在しない」と site-survey の挙動に揃う。担当でない一般ユーザーも、権限の表が許す操作は全プロジェクトの工事写真に対して行える。受入基準 13.2・13.3 の「アクセス可能なプロジェクト」は、権限の表が許すプロジェクト（＝実在し取り除かれていないプロジェクト）と読む。プロジェクトの境界の検証（別のプロジェクトの id で他のプロジェクトのリソースを指せないこと）は保つこと。design.md の「他プロジェクトの写真は 404」の記述を、この判断に合わせて改める
  - _Boundary: 工事写真の backend のサービスのプロジェクトへのアクセスの判定_
  - **【完了時の注記（2026-10-04）】** 担当者の限定（`canAccessProject`）を写真の 2 サービスから外し、工事写真と工事看板の全ルートを同じ規則で判定する形へ揃えた: 認証（401）→ ロールの権限の表（403）→ 対象と所属プロジェクトが実在し論理削除されていないこと、およびプロジェクト（アルバム）の配下として指したときの所属（404 / 400）。判定は新しいモジュール `backend/src/services/construction-photo-availability.ts` の 1 か所にまとめ、アルバム・看板・写真・メタの 4 サービスが使う（どのサービスにも依存せず、呼び出し側が必要な項目を読み忘れると拒否する側に倒れる。レビューが直接確かめた）。担当でない一般ユーザーは、権限の表が許す閲覧・作成・編集を全プロジェクトの工事写真と工事看板に対して行える。写真項目の削除は user の権限に無く 403 である
  - **是正の途中で塞いだ既存の穴（担当者の限定に隠れていたもの）**: 写真の操作のルーターはアルバムの配下にも載っており、存在しない・別のアルバムの id を経由しても、他のアルバムの写真の原本・印字画像が取れ、写真項目の削除とメタの一括更新も通っていた（テスト環境の API で実測）。配下として指したときの所属を確かめる形で塞いだ。**是正の 1 巡目で直した点（独立レビューの差し戻し）**: 初稿は写真のルートだけを揃え、アルバムと看板の側を境界の外として残していた。取り除かれた（論理削除された）プロジェクトのアルバム一覧が 200 で写真のサムネイルの署名付き URL を返し、アルバムの名前と看板が書き換えられた。プロジェクトの取り除きはアルバムと看板へ波及しないため、画面からプロジェクトを取り除くだけでこの状態になる。アルバムの配下の PATCH・DELETE はプロジェクトを照合せず、別のプロジェクトの配下として指しても書き換わった。いずれも 404 にし、何も書き込まない形へ揃えた
  - **挙動の変化**: 取り除かれたプロジェクトへのアップロードと現調コピーは 201 から 404 に、存在しないプロジェクトのアルバム一覧と看板一覧は 200 の空の一覧から 404 に変わった。画面は、取り除かれたプロジェクトでは `getProject` の時点で 404 になるため通常の操作では届かない。URL を直接開いたときは是正前から失敗の表示で、アルバムの編集画面だけが「編集できた」から「見つからない」へ変わる。旧方針（部外者は 404）を前提にした既存のテストは、200 と DB・バイト列の一致を主張する形へ書き換えた（削除した主張は担当者の判定そのものを主張していたものだけである）
  - 統合テストのファイル `construction-photo-access.api.integration.test.ts`（42 件）を新設した。担当でない user の各操作、未認証 401・ロール無し 403（書き込み無し）、境界の 404 / 400、取り除かれたプロジェクトとアルバムの 404（DB の値が変わらないこと、本文に署名付き URL や保存先のパスが含まれないこと）を主張する。同ファイルの beforeAll は、共有の DB で他のファイルが user ロールへ足したままにする削除の権限を、シードの定義へ戻す。E2E を 1 件足し（担当でない一般ユーザーが一覧から他の利用者のアルバムを開き、写真項目を見て、アップロード・コメント・並び替えを保存でき、削除の操作手段は表示されない。`REQ-1.2`・`REQ-17.2`）、閲覧専用のロールの E2E から「閲覧者を工事担当に据える」回避策を外した。検出力は独立レビューが変異で測った——担当者の限定を戻すと 9 件、配下の所属の照合を外すと 2 件（アルバムの配下の照合では 5 件）、写真・アルバム・看板のそれぞれでプロジェクトの取り除きの判定を外すと 3・4・3 件が赤になる。レビューは test API へ一般ユーザーと admin で攻撃的な要求を送り、拒否された要求で DB の差分が 0 件、404 の本文に URL やパスの漏れが無いことを確かめた
  - design.md への反映は 23.10 で行う（「他プロジェクトの写真は 404」などの記述を改め、新しいモジュールを File Structure Plan へ足す）。site-survey が所有する宣言 `t13-anchor-references-after-115303` が 1477 から 1481 へ動いたため、同じコミットで貼り直した

- [x] 23.2 看板マスタの画面へ画面の操作だけで到達できるようにする
  - `/projects/:projectId/construction-signboards` へのリンクは、プロジェクト詳細・アルバムの一覧・作成・編集・詳細・ダッシュボードのいずれにも無い（本番のコードでこのパスを含むのはルートの定義・ページ自身・API クライアントだけである。親も grep で確かめた）。看板が 0 件のプロジェクトで「看板を配置」を開くと、選択肢は「未指定」だけで案内もリンクも無い。E2E はすべて `page.goto` で直接入っている
  - URL を知らない利用者は看板を登録できず、看板の配置（要件 9）と PDF への重畳（10.8）も実質使えない
  - 導線を足すこと。置き場所は requirements.md と design.md の記述（要件 8 と、ナビ・パネル・ルートの節）から導き、定めが無ければ、写真項目から看板を指定する場面で必要になることを踏まえて決める。クリックだけで看板の登録 → 配置まで到達する E2E を足すこと（RED → GREEN）。モバイル幅で導線が水平にはみ出さず、タップ領域の下限を満たすことも確かめる
  - _Requirements: 8.1, 8.6, 8.7, 8.10_
  - _Boundary: 工事写真の画面から看板マスタへの導線_
  - **【完了時の注記（2026-10-04）】** 導線を二つ足した。常設の導線は工事写真一覧の見出しの行のリンク「工事看板マスタ」で、看板マスタのブレッドクラムが一覧の配下に位置し看板がプロジェクト単位であることから一覧に置いた（要件と設計は置き場所を定めていない）。文脈の導線は「看板を配置」のダイアログのリンク「工事看板マスタを開く」で、看板を指定する場面は利用者が登録の必要に気付く場面であるため置いた。どちらも `construction_signboard:read` を持つときだけ示す（権限のロード中は示さない）。ダイアログのリンクは未保存の変更の確認（`useBlocker`）を経て移動し、モバイル幅で 44 のタップ領域を持つ。プロジェクト詳細の工事写真のパネルには足していない（「すべて見る」で一覧へ一手で届く）。クリックだけでプロジェクト詳細 → 一覧 → 看板マスタ → 登録 → アルバム → 配置 → 保存まで到達する E2E を足した（`REQ-8.1`・`REQ-8.10`）
  - **是正の 1 巡目（独立レビューの差し戻し）**: 初稿は看板が 0 件のときに「このプロジェクトには工事看板が登録されていません」と案内したが、詳細画面は看板の一覧の取得の失敗を黙って空の一覧として扱っており、看板が 1 件あるプロジェクトで取得を失敗させると偽の案内が出て、既存の看板の重複登録を促した（実ブラウザで確認）。閲覧の権限が無い利用者でも同じ偽の文言が出た。取得の状態（`loaded` / `loading` / `failed` / `not-permitted`）を分け、取得に成功して 0 件のときだけ案内し、失敗には「工事看板を読み込めませんでした。時間をおいて再度お試しください。」を role=alert で示し、権限が無ければ取得しない形へ改めた
  - **是正の 2 巡目（同）**: 1 巡目で看板の一覧の取得を写真項目の取得から分けた結果、写真項目が先に表示され一覧は取得中という時間ができた（一時的な 500 では自動の再試行で約 7 秒）。その間に配置済みの写真項目の「看板を変更」を開いて保存すると、利用者が触れていない配置が null で上書きされた（実ブラウザと DB で確認。取得の失敗時にも同じ消え方が以前からあった）。一覧が取得済みでない間は、選択を無効にし配置のエディタを描画せず（「キャンセル」は押せる）、選択は「未指定」を装わず現在の看板を指す形へ改めた。取得済みの一覧に現在の看板が無いときも黙って解除せず、利用者が別の看板か「未指定」を明示的に選ぶまで保存できない。レビューが、取得中・失敗・一覧に無い場合のいずれでも、あらゆる保存の経路で配置を消す要求が 0 件で DB が変わらないこと、正規の変更・解除・新規の指定は従来どおり保存されることを確かめた
  - 詳細画面の看板の一覧は写真項目の取得とは別の effect で取得するようになったため、アルバムの取得の失敗時に出る「再試行」は看板の一覧を取り直さない（画面の読み込み直しで取り直す）。看板マスタの画面そのものは権限で操作を出し分けておらず、本項で到達できるようになったことで、閲覧だけの利用者が実行できない操作に触れうる——23.8 に追記した。site-survey が所有する宣言 `t13-anchor-references-after-115303` が 1481 から 1507 へ動いたため、同じコミットで貼り直した

- [x] 23.3 使用中の工事看板を取り除いたときに写真項目の看板の指定を解除する
  - 看板マスタで使用中の看板を取り除くと、確認「1件の写真項目で使用中です」が出て成功する。その後も `GET …/images` は取り除いた看板の `signboardId` と `signboardPlacement` を返し、詳細画面は「看板あり」のバッジと「看板を変更」を表示し続ける（検証の実測）。原因は、取り除く処理が `deletedAt` を立てる論理削除で、スキーマの `onDelete: SetNull` が発火しないことである。「看板なし」として扱うのは印字画像の生成だけで、被覆印 `REQ-9.7` も印字画像の統合テストにしか無い。design.md は「看板削除時は参照側を SetNull（R9.7）」と定める
  - `backend/src/services/construction-signboard.service.ts` の `delete` のトランザクションの中で、参照する写真項目の看板の指定と配置を解除すること（design.md の定めに合わせる）。挙動の修正であるため RED → GREEN で進め、写真一覧の API の統合テストと、詳細画面でバッジと文言が「看板なし」の側へ変わることの E2E を足す。楽観的排他（写真項目の `updatedAt`）と未保存の変更への影響を確かめること
  - _Requirements: 9.7_
  - _Boundary: 工事看板の論理削除と、参照する写真項目の看板の指定_
  - **【完了時の注記（2026-10-03）】** `ConstructionSignboardService.delete` が、既存のトランザクションの中で看板を論理削除したあと、参照する写真項目の `signboardId` と `signboardPlacement` を null にし、解除した件数を `inUseCount` として返す（値は従来と同じ件数である。画面の「N件の写真項目で使用中です」は一覧の `inUseCount` から出ており、画面から見た挙動は変わらない）。加えて、論理削除済みの看板を指したままの行（本修正より前の行、後述の競合）に備え、写真一覧とメタの一括更新の応答は、参照先の看板が生きているときだけ指定を有効として返す（`resolveSignboardAssignment`。一覧の同じ問い合わせの中で看板の `deletedAt` を読み、件数に比例する問い合わせは足さない）。データの移行はしておらず、宙吊りの行は DB に残る。印字画像の生成は従来から自前で判定しており、PDF の台帳と ZIP はその経路を通る。独立レビューが写真の DTO を出す経路と看板の指定を使う経路を全件たどり、漏れが無いことを確かめた。画面のコードは変えていない
  - **本項の本文の「楽観的排他（写真項目の `updatedAt`）」は実在しない仕組みを指している**——`ConstructionPhoto` に更新日時の列は無く、メタの一括更新は版の照合をせず、送られた項目だけを書く（実装者とレビューがスキーマとコードで確かめた。親が検証の報告の記述を確かめずに起票文へ写した誤りである）。看板の取り除きをまたいだ保存の挙動は統合テストで固定した: 看板に触れない未保存の変更は成功して解除が保たれ、取り除いた看板を指定する保存は 404（`SIGNBOARD_NOT_ALLOWED`）で、同じ保存の他の変更も書き込まれない
  - 単体 7 件・統合 4 件・E2E 1 件（`@requirement construction-photo/REQ-9.7`）を足し、いずれも是正前に赤だった。検出力はレビューが変異で測り直した——書き込みの側（解除を件数の取得へ戻す）で単体 3 件と統合 2 件、読み出しの側（常に行を信頼する）で単体 3 件と統合 1 件が赤になる。**E2E は、書き込みの側と読み出しの側の片方だけの退行では赤にならない**（もう片方が覆う）。書き込みの側の退行を検出するのは統合テストの DB の行の主張である。トランザクションの巻き戻しを直接主張するテストは無い。`- 9.7: …` の形の注釈を機能名の無いヘッダーの下へ足すと `check:req-coverage` の自己検査の上限を超えたため、被覆は `@requirement` の印だけで主張している
  - 残る性質（受入基準の違反ではない。Task 24 に起票）: メタの一括更新の看板の検証がトランザクションの外にあり、検証と書き込みの間に取り除きが確定すると宙吊りの行が再びできうる（コードの読みによる。読み出しの側が全経路で吸収する）。取り除きの前から開いていた詳細画面は読み込み直すまで「看板あり」を示し、取り除かれた看板への配置を保存すると英語の文言で保存全体が拒否される。backend の統合の全件で `estimate-request.schema.integration.test.ts` が 1 回だけ赤になった（壁時計の比較による既存の不安定さで、本変更と無関係。単独では緑）
  - design.md への反映は 23.10 で、本ラウンドの他の変更と併せて行う

- [x] 23.4 ZIP の一括エクスポートの一部失敗で、利用者が継続を選べるようにするかを決める
  - 3 件中 1 件の原本・印字画像を 404 にして全件エクスポートすると、ZIP が自動でダウンロードされる。進捗のダイアログは「失敗 1 件 / 閉じる」、通知は「一部の写真項目（1件）のエクスポートに失敗しました。成功した項目のみでZIPをダウンロードしました。」である。継続の選択は無く、失敗した項目の特定も件数だけである（検証の実測）。受入基準 15.10 は「失敗した項目を通知し、成功した項目のみでのダウンロード継続をユーザーが選択できるようにする」と定める。Implementation Notes が「未実装…要フォロー、最終検証で要否判断」と記録したままで、判断の記録が無い
  - _Requirements: 15.10_
  - **利用者の判断（2026-10-03）**: 受入基準 15.10 のとおりに実装する。一部の画像の取得・加工が失敗したら、失敗した項目を利用者が特定できる形（ファイル名など）で示し、成功した項目だけでダウンロードを続けるか、やめるかを利用者が選べるようにする。自動ではダウンロードしない。挙動の変更であるため RED → GREEN で進め、続ける・やめるの両方と、全件成功・全件失敗の場合を E2E で主張する。モバイル幅でダイアログが水平にはみ出さず、長いファイル名でも破れないこと
  - _Boundary: ZIP の一括エクスポートの一部失敗時の継続の選択_
  - **【完了時の注記（2026-10-04）】** 一部の写真項目の取得・加工が失敗したら、ZIP を自動ではダウンロードせず、進捗のダイアログの結果の段で、失敗した写真項目をファイル名と順番（「（N番目）」）で一覧に示し、件数を添えて「成功した項目だけでダウンロードする」と「ダウンロードしない」を選ばせる。続けると成功した項目だけの ZIP を従来の名前で 1 回ダウンロードし、従来の通知を出す。やめる・Escape で閉じるとダウンロードしない。全件の失敗はダウンロードせず、失敗の一覧と「閉じる」だけを示す。全件の成功と中断は従来どおりである。結果の段が現れるとフォーカスはその見出しへ移り、Tab はダイアログの中で循環する。待つ間に保持する ZIP は、閉じる・次のエクスポートの開始・画面の破棄で手放し、オブジェクト URL は待つ間に作らない。サービスは失敗した写真項目の id しか返さないため、理由は一律の「画像を取得または加工できませんでした」である（サービスは変えていない）。375・320 幅で長い区切りの無いファイル名でも水平にはみ出さず、一覧はダイアログの中でスクロールし、二つの操作は 44 以上である
  - **指示の範囲を超えた挙動の変更（利用者へ報告済み）**: エクスポートの実行中に詳細画面を離れると、エクスポートを中断する。以前は離れた後も続いて、後からダウンロードされた。新しい形では、画面を離れた後に一部が失敗すると選ぶ場所が無く、中断しなければ自動でダウンロードする（判断に反する）か黙って捨てるしかないためで、独立レビューは「残す」を勧めた。要件 15 はバックグラウンドで続けることを定めていない。全件の成功が見込まれる大きなエクスポートを始めて画面を離れた利用者には、以前は届いたダウンロードが届かなくなる
  - 単体 17 件と E2E 6 件（続ける・やめる・全件の成功・全件の失敗・モバイル幅。続けた場合は ZIP の中身が成功した 2 件だけであることを主張する）を足し、`REQ-15.10` を掲げた。検出力は独立レビューが変異で測った（一部の失敗でも自動でダウンロードすると 5 件、画面の破棄で中断しないと 1 件、続けてもダウンロードしないと 1 件が赤）。**閉じるときに保持した ZIP を手放す処理を守るテストは無い**（変異が検出されない。実害は次の開始か破棄までのメモリだけ）。320×568 では主の操作がダイアログの中の縦のスクロールの先にあり、初期表示では見えない（水平のはみ出しは無い）
  - Implementation Notes の 15.10 の「未実装…要フォロー」の記述は本項で解消した（記録は当時のまま残す）。requirements.md の 19.3 の注記が記録する `TAP_TARGET_MIN_PX}px` の当たりの件数（12 行）は、23.2 と本項の追加で 16 行になって古い（読む関門は無い）。site-survey が所有する宣言が二つ動いたため、同じコミットで貼り直した——`t13-anchor-references-after-115303` が 1515 から 1529 へ、`featureless-headers-resolvable-by-own-feature-after-115308` が 588 から 589 へ（機能名を欠く見出しを持つ単体検証のファイルへ本項の被覆印を足したため。見出しへ機能名を書き足す形は `check:req-coverage` の自己検査のラチェットを赤にするため採っていない）

- [x] 23.5 カメラをサポートしない端末でカメラの導線を出さないようにするかを決める
  - 共有の `ImageUploader`（site-survey の所有）が「カメラで撮影」を無条件に描く。被覆印 `REQ-5.3` を掲げる単体（`PhotoUploader.test.tsx`）は入力要素が在ることを主張している（検証のコードの読みによる。実機では測っていない）。受入基準 5.3 は「カメラ撮影による追加手段を提供せずローカルアップロード手段のみを提示する」と定める。Implementation Notes に「既知の軽微制限」とあるが、受け入れる判断の記録が無い
  - _Requirements: 5.3_
  - **利用者の判断（2026-10-03）**: 工事写真の側で出し分ける。本スペックの `PhotoUploader` の側でカメラの有無を検出し、無い端末ではカメラ撮影の導線を出さずローカルアップロードの手段だけを示す。共有の `ImageUploader`（site-survey の所有）の既定の挙動は変えない——出し分けに共有部品の側の口が要るなら、既定を変えない任意の口の追加に留め、site-survey へ申し送ること。ブラウザの検出は完全ではないため、検出の方法と限界（判定できないときにどちらへ倒すか）を requirements.md の 5.3 の注記と design.md に記録する。被覆印 `REQ-5.3` を掲げる既存の単体（入力要素が在ることを主張する）は、受入基準の文と合う主張へ改める
  - _Boundary: 工事写真のアップロードのカメラの導線の出し分け_
  - **【完了時の注記（2026-10-04）】** 新しいフック `frontend/src/hooks/useCameraAvailability.ts` が `navigator.mediaDevices.enumerateDevices()` の機器の種類で判定する——`videoinput` があれば「ある」、空でない一覧に `videoinput` が無ければ「無い」、一覧が空・API が無い・失敗・判定中は「判定できない」。`devicechange` で判定し直す。本スペックの `PhotoUploader` は「無い」と判定したときだけカメラ撮影の導線（「カメラで撮影」のボタンと `capture` 付きの入力）を出さず、ローカルアップロードの手段だけを示す。判定できないときは出す——導線は `<input type="file" accept="image/*" capture>` で、カメラの無い端末では `capture` が無視されてファイルの選択が開くだけであり、誤って出す代償は小さく、誤って隠すとカメラのある端末から 5.2 を奪うためである
  - **是正の 1 巡目（独立レビューの差し戻し）**: 初稿は限界を「主要なブラウザではカメラだけを列挙から外すことはない」と記していたが、W3C Media Capture and Streams の列挙の手順と MDN によれば、文書の権限ポリシーが `camera` を許さない場合（`Permissions-Policy: camera=()` のヘッダ、`allow="camera"` の無い iframe）は `videoinput` だけが省かれ、カメラのある端末でも導線が消える（`capture` 付きの入力はこのポリシーの対象外で、実際には撮影できる）。権限ポリシーが `camera` を許さないと答えたとき（`document.permissionsPolicy` か以前の名前の `document.featurePolicy` の `allowsFeature('camera')`）は判定できない側へ倒す防御をコードに足し、限界の記述を requirements.md の 5.3 の注記・design.md・フックの注釈の 3 か所で事実へ改めた。権限ポリシーの API を持たないブラウザでは、機器の一覧だけで判定する残りの限界がある。現行の配備はこのヘッダを出していない（後から足すなら `camera=(self)` にするか、この防御を保つこと）。Safari の許可の前の列挙と、OS のカメラの権限が無い Android の Chrome の挙動は、実機で確かめていない
  - **site-survey への申し送り**: 共有の `frontend/src/components/site-surveys/ImageUploader.tsx` へ任意の口 `showCameraCapture?: boolean`（既定 `true`）を足した。`false` のときは「カメラで撮影」のボタンと `capture="environment"` の入力の両方を描かない。site-survey の呼び出し側は口を渡しておらず、挙動は変わらない（site-survey の単体と、モバイルでカメラ撮影のボタンが出ることを含むレスポンシブの E2E が緑）。口の挙動は `ImageUploader.test.tsx` に足した 3 件が守る。site-survey の design.md へこの口を記録することを勧める
  - 単体 22 件（フック 21・`PhotoUploader` の書き直した `REQ-5.3` を含む）と E2E 3 件（カメラの無い端末・カメラのある端末・権限ポリシーが拒否する端末）を足した。`REQ-5.3` の単体は「入力要素が在る」主張から、受入基準の文のとおり「カメラ撮影の手段が無くローカルアップロードの手段がある」主張へ書き直した。検出力はレビューが変異で測った（常に導線を出す・空の一覧を「無い」とする・判定できないときに隠す・権限ポリシーの確かめを外す、のいずれも赤）。Implementation Notes の 5.3 の「既知の軽微制限」は本項で解消した（記録は当時のまま残す）

- [x] 23.6 編集した写真項目を取り除いた後に未保存の状態が解消できなくなる状態を正す
  - 写真項目のコメントを編集し、その写真項目を取り除く（成功）と、未保存の表示が残る。「保存」は押せるが送信は 0 件で未保存のまま、ブレッドクラムを押すと離脱の確認が出続け、読み込み直すまで解消できない（検証の 1280 幅の実測）。原因は、`ConstructionPhotoDetailPage.handleDelete` が保留中の変更を消しても未保存のフラグを戻さず、`handleSave` が保留が空だと冒頭で戻ることである
  - 取り除いた後に保留中の変更が空なら未保存の状態を解消すること。他の写真項目の保留が残るときは未保存のままにする。挙動の修正であるため RED → GREEN で進め、単体と E2E を足す。並び替えなど、保留の表に載らない未保存の変更があるときに誤って解消しないことも主張する
  - _Requirements: 18.3_
  - _Boundary: 詳細画面の写真項目の削除と未保存の状態_
  - **【完了時の注記（2026-10-04）】** 詳細画面の未保存の変更は 2 種類だけである——写真項目ごとのメタの変更（`pendingChangesRef`。コメント・印刷対象・看板の指定と配置）と表示順序の変更（`pendingOrderRef`）。受入基準 18.1 が挙げる 4 つ（コメント・印刷対象・表示順序・看板の配置）と一致する。未保存の状態を、この 2 つの保留が一つでも残っているときに限って真とし、保留を足す・消すすべての箇所（メタの変更・順序の変更・保存の成功・写真項目の削除の成功）で `syncDirtyWithPending()` が保留から決め直す形へ改めた。写真項目の削除が成功すると、その写真項目のメタの変更と順序の行を保留から除き、他の保留が残れば未保存のまま、残らなければ未保存を解消する（表示が消え、「保存」が押せなくなり、離脱の確認も出ない）。削除の失敗は 21.3 のまま、保留も未保存の状態も変えない。並び替えた写真項目をすべて取り除くと空の順序が保留に残って未保存のままだった点も、順序の保留を無くす形で併せて直した
  - 単体 4 件と E2E 1 件（`REQ-18.3`）を足した。編集した写真項目を取り除いて保留が空になる場合と、並び替えた写真項目をすべて取り除く場合は是正前に赤で、他の写真項目の編集や並び替えが残る場合は是正前も緑の番（過剰な是正を検出する）である。独立レビューが変異で検出力を測った——無条件に未保存を解消すると番の 2 件が、取り除いた写真項目の行を順序から除かないと 2 件が、空の順序を残すと 1 件が赤になる。保存の冒頭で戻る経路の決め直しは、「保存」が未保存でない間は押せないため届かない防御で、テストは守っていない
  - 境界の外で判明した既存の問題（Task 24 に起票）: 保存の実行中にコメントを編集すると、保存の成功後の消去がその保留も消し、表示は未編集なのに未保存が解消される。site-survey の詳細画面の写真の削除にも同じ型（保留を消しても未保存の状態を戻さない）があり、所有は site-survey である（測定のみ・未起票）。site-survey が所有する宣言 `t13-anchor-references-after-115303` が 1507 から 1513 へ動いたため、同じコミットで貼り直した

- [x] 23.7 プロジェクト詳細の工事写真のパネルのサムネイルの署名付き URL に 15 分の有効期限を設定する
  - `backend/src/routes/projects.routes.ts` がアルバムのサムネイルの `getSignedUrl` を有効期限の指定なしで呼び、既定の 3600 秒になる（親も該当の行を確かめた。`r2-storage.provider.ts` の既定は 3600）。写真一覧とアルバムの一覧は 900 秒を渡している。受入基準 11.6 は「15分程度」と定める。実行時の URL は測っていない
  - 既存の 900 秒の定数を引いて渡すこと（新しい定数を作らない）。有効期限が渡ることを主張するテストを足す（RED → GREEN）。`projects.routes.ts` は project-management が所有しうるため、変更の前に所有を確かめ、他スペックの所有なら同スペックへ申し送ること
  - _Requirements: 11.6_
  - _Boundary: プロジェクト詳細の工事写真の要約のサムネイルの署名付き URL_
  - **【完了時の注記（2026-10-04）】** `projects.routes.ts` の当該の塊は、本スペックの初回実装（コミット `c349890aa`、Task 4.1 の境界）が足したもので、所有は本スペックである（独立レビューが git blame と design.md で確かめた）。写真一覧の 900 秒の定数 `SIGNED_URL_EXPIRES_IN`（`construction-photo-image.service.ts`）を export し、プロジェクト詳細の要約のアルバムの代表サムネイルの署名付き URL へ `{ expiresIn: 900 }` を渡す形へ改めた（新しい定数は作っていない。読み込みは型だけで重い依存を引かず、循環も無い）。工事写真の `getSignedUrl` の呼び出しはすべて 900 秒になった（写真一覧・メタの一括更新の応答・アルバム一覧は元から 900 秒。原本と印字画像は中身を返す中継で署名付き URL を発行しない）。単体 1 件（`REQ-11.6`）を足し、是正前に赤だった。有効期限の引数を外す変異で赤になる
  - 900 秒の定数は、本スペックの中で `construction-photo-metadata.service.ts` と `construction-photos.routes.ts` に私的な複製が残る（値は揃っている。片方だけ変わると 11.6 を割りうるため、Task 24 に起票した）。他スペックの署名付き URL の有効期限の無い呼び出し（現場調査・数量表）は本スペックの外である

- [ ] 23.8 看板マスタの権限の無い操作の文言を扱う（起票のみ）
  - 一般ユーザー（`construction_signboard:delete` を持たない）にも看板マスタの取り除く操作が表示される。実行すると 403 で、トーストは「FORBIDDEN」である。メッセージは提示されるため 17.4 の違反とは断定しない（検証の判断）。`useConstructionPhotoPermission.getPermissionError` の日本語の文言は本番から呼ばれていない
  - _Requirements: 17.4_
  - **追記（2026-10-04）**: 23.2 が看板マスタへの導線を足したため、閲覧の権限だけを持つ利用者が通常の操作でこの画面に到達し、実行できない「新規登録」「編集」「削除」に触れうるようになった（押すと 403）。これまでは URL を知らなければ到達できず目立たなかった
  - **利用者の判断（2026-10-04）**: 権限の無い操作（新規登録・編集・削除）は表示しない。権限の判定は `useConstructionPhotoPermission`（`usePermission` 経由）に揃え、バックエンドの RBAC が権威であることは変えない
  - _Boundary: 看板マスタの画面の権限に基づく表示と文言_

- [x] 23.9 写真項目の削除の失敗を、その写真項目の近くに表示する形へ改める
  - **利用者の判断（2026-10-03）**: 21.3 は失敗を詳細画面の上部の通知の枠へ出し、画面をそこへ送る形にした。この形は、375 幅・5 件の最後の写真項目で 3,825px 戻され（検証の実測）、どの写真項目の失敗かを示さず、やり直しには対象を探し直す必要がある。利用者は「写真項目の近くに出す」を選んだ（21.3 のときの「既存の通知の枠に揃える」という判断を改める）
  - 失敗の表示を、取り除こうとした写真項目の中（その写真項目の操作の近く）に出すこと。画面を上部へ送る処理（`scrollIntoView`）はやめる。表示は role=alert で読み上げられ、どの写真項目の失敗かが位置で分かり、その場でやり直せること。やり直しの成功・その写真項目の別の操作・画面の離脱で消えること。複数の写真項目で失敗したときは、それぞれの写真項目に出ること。文言の規則（サーバーの理由、無ければ既定の文言）と、セッション切れを区別しないことは 21.3 のまま保つ。上部の通知の枠と失敗の状態（`error`）へは載せない——22.1 の二つの状態の穴へ新しい経路を足さないこと
  - 21.3 が足した単体と E2E を新しい形へ改め、RED → GREEN で進めること。モバイル幅（375・320）で表示が写真項目からはみ出さず、長い文言でも破れないこと、タップ領域の下限を保つことを主張する。design.md の Error Handling の 21.3 の項を新しい挙動へ改める
  - _Requirements: 7.7_
  - _Depends: 21.3_
  - _Boundary: 写真項目の削除の失敗の表示の位置_
  - **【完了時の注記（2026-10-04）】** 失敗は取り除こうとした写真項目の中に、`PhotoItemPanel` が操作の行の直後（取り除く操作のボタンの下）へ role=alert の段落として表示する。ボタンの `aria-describedby` は失敗の間だけその段落を指す。上部の通知の枠と失敗の状態（`error`）には載せない（22.1 の二つの状態の穴へ経路を足さない）。`handleDelete` は失敗を捕捉せず `PhotoItemPanel` へ伝播させ、21.3 が開始時に行っていた `notice` と `error` の消去は外した——その消去は失敗を上部の枠で見せるためだけのもので、アップロードの失敗や保存の失敗の通知は取り除く操作をしても残るようになった（21.3 より前の挙動。21.3 の 1 巡目の退行「古い失敗が後の保存の失敗を隠す」は、失敗が枠に載らないため構造的に起きない）。文言の規則（サーバーの理由、無ければ「写真項目の削除に失敗しました」）と 401 を区別しないことは 21.3 のままで、規則は `PhotoItemPanel` へ移した。通信の失敗は API クライアントが `ApiError(0, 'Network error')` に包むため、写真項目には「Network error」が出る。複数の写真項目の失敗はそれぞれに表示する。表示が消えるのは、その写真項目のやり直しの開始、その写真項目への別の操作（コメントの編集・印刷対象とエクスポート対象の切り替え・上下の移動・ドラッグの開始・「看板を配置」）、画面の離脱である
  - **画面は送らない**。失敗の後、フォーカスはその写真項目の取り除く操作のボタンへ `focus({ preventScroll: true })` で戻る（キーボードの利用者がその場でやり直せる。是正の 1 巡目で、独立レビューの提案を親が取り入れた）。**利用者の判断（2026-10-04）**: 表示が画面の外へ出るとき（ボタンが画面の下端から約 51px 以内のとき）だけ、表示の要素へ `scrollIntoView({ block: 'nearest' })` をかけ、はみ出した量だけ下へ動かす（レビューの実測で 375・320 幅とも +31〜+50px。上へは動かない）。通常の位置では scrollY は変わらない（375・320・1280 幅で実測）
  - **是正の 1 巡目で直した点**: 初稿は design.md を改めていなかった——親が実装者へ「design.md は 23.10 で扱うので編集しない」と指示し、本項の本文と食い違っていたためである。本項の中で design.md の Error Handling の 21.3 の項（21.3・23.9 として）と File Structure Plan の 2 行を新しい挙動へ改め、注釈の「通信の失敗などは既定の文言」という誤りも直した
  - 21.3 が足した単体と E2E は新しい位置へ書き換えた（主張の削除は無い）。単体 36 件が是正前に赤だった。E2E は、通常の位置で表示がその写真項目の中だけにあり scrollY と scroll の発生が 0 であること、画面の下端の場合に表示が完全に見え移動量が表示の高さ以内であること、長い区切りの無い文言と長い和文が 3 幅で写真項目からはみ出さず操作部品のタップ領域が 44 以上であることを主張する。やり直しの成功（受入基準 7.7 そのもの）を主張する E2E は `REQ-7.7` を保つ。検出力はレビューが変異で測った（どの操作でも全項目の表示を消すと 10 件、失敗を `error` にも載せると 7 件、フォーカスの復帰を外すと 2 件、`block: 'center'` にすると 3 件が赤）
  - 残る性質（Task 24 に起票）: 1280 幅では表示が現れるとその写真項目の取り除く操作のボタンが項目の中で約 51px 上へずれ、写真項目が画面の上端の近くにあるとフォーカスのあるボタンが固定ヘッダーの下に入る（表示の中心は見える。モバイル幅では起きない）。`PhotoItemPanel.tsx` の注釈の「ボタンより上に置くと押した位置でやり直せない」は、デスクトップ幅ではこの形でもボタンがずれるため根拠として成り立っていない。site-survey が所有する宣言 `t13-anchor-references-after-115303` が 1513 から 1515 へ動いたため、同じコミットで貼り直した

- [x] 23.10 design.md を Task 23 の是正後の挙動へ揃える
  - 23.1（アクセスの判定を権限の表に揃える。「他プロジェクトの写真は 404」の記述）、23.2（看板マスタへの導線）、23.3（看板の取り除きと参照側の解除、読み出し時の解決、更新日時の列が無いこと）、23.4（ZIP の一部失敗時の選択）、23.5（カメラの検出の方法と限界）、23.6（取り除きと未保存の状態）、23.7（有効期限）の最終の挙動を、該当の節へ反映する。23.9 の Error Handling の項と File Structure Plan の 2 行は 23.9 の中で改めたため扱わない（他の節との整合だけ確かめる）。各タスクの完了時の注記と実装を照合してから書くこと（写さない）。検証が古いと指摘した記述（アップロードの応答の形、原本・印字画像を署名付き URL とする記述）と、宣言の無い依存（`tap-target.ts`・共通 Breadcrumb・AppHeader を Allowed Dependencies / Revalidation Triggers へ）も併せて扱う
  - パスを名指す行に不在の語（「削除」「撤去」「旧」など）を書かないこと。設計文書を読む関門を前後で回すこと
  - _Requirements: 1.2, 5.3, 7.7, 8.1, 9.7, 11.6, 13.2, 15.10, 18.3_
  - _Depends: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7, 23.9_
  - _Boundary: 本スペックの design.md_
  - **【完了時の注記（2026-10-04）】** design.md の 16 か所を、各タスクの完了時の注記と実装に照らして改めた。反映したのは、アクセスの判定（権限の表だけ、共通の判定 `construction-photo-availability`、401 → 403 → 404 / 400 の順、配下の所属の照合）、看板の取り除きと参照する写真項目の解除・読み出し時の解決、写真項目に更新日時の列が無く版を照合しないこと、未保存の状態の `syncDirtyWithPending`、看板マスタへの導線と看板の一覧の取得の状態、エクスポートの部分失敗（23.4 と整合）、サムネイルの 900 秒である。古くなっていた記述（アップロードの応答の形、原本と印字画像を署名付き URL とする記述、存在しない関数名を名指す R18 の塊、サービスの引数）を事実へ改め、宣言の無かった依存（`tap-target.ts`・共通の `Breadcrumb`・`AppHeader`・`useMediaQuery`）を Allowed Dependencies と Revalidation Triggers へ足した。履歴の記述は改めた旨を残して保った。独立レビューが新しい記述を一つずつコードとテストに照らして一致を確かめ、レビューの提案に従って、実在するテストより広く読める単体テストの計画の 2 項目を親が実在のテストに揃えた
  - Requirements Traceability の行は変えていない（行を書き換えると、site-survey が管理する `check:design-component-reqs` の下限が動く。要約にすぎず、現在の挙動について偽の主張はしていない）。設計文書を読む関門の結果は変更の前後で同じである

**検証が記録したその他の事実（起票していない）**: 写真項目の削除の失敗の既定の文言「写真項目の削除に失敗しました」には現実の失敗ではほぼ届かない（空の 500 は「Internal Server Error」、通信断は「Network error」、他者が先に取り除いた 404 は英語の not found）。500 系は共通クライアントが 3 回再試行するため、確認ダイアログは約 7 秒「削除中」のままである。失敗時に画面が戻る距離は 375 幅・5 件の最後の写真項目で 3,825px（320 幅 3,631px、1280 幅 1,839px）、通知はどの写真項目の失敗かを示さず、フォーカスは BODY に落ちる。design.md の Allowed Dependencies / Revalidation Triggers は `tap-target.ts`・共通 Breadcrumb・AppHeader への依存を宣言していない。design.md のアップロードの応答の記述と、原本・印字画像を署名付き URL とする記述は実装より古い。他機能の画面の本体によるモバイル幅のはみ出し（取引先・現場調査・プロジェクト詳細・数量表の一覧）は本スペックの所有ではない

## Task 24: Task 23 の是正の独立レビューで判明した、受入基準の外の残り（起票のみ。着手は利用者の判断による）

- [ ] 24.1 メタの一括更新の看板の検証と、看板の取り除きの競合を塞ぐ（起票のみ）
  - `construction-photo-metadata.service.ts` の一括更新は、看板の検証をトランザクションの外で行う。検証の後・書き込みの前に看板の取り除きが確定すると、論理削除済みの看板を指す行が再びできうる（23.3 のレビューのコードの読みによる。再現はしていない）。23.3 の読み出し時の解決が表示と印字の側で吸収するため、受入基準 9.7 の観測できる違反にはならない。扱うなら、検証をトランザクションの中へ移して看板の行をロックすることと、既存の宙吊りの行の一度きりの掃除である
  - _Requirements: 9.7_
  - _Blocked: 利用者の判断（2026-10-04）により見送る（受入基準の違反ではなく、読み出し時の解決が吸収しているため後回し）_
  - _Boundary: メタの一括更新の看板の検証のトランザクション_

- [ ] 24.2 取り除かれた看板への配置を保存したときの文言と回復の導線を扱う（起票のみ）
  - 看板の取り除きの前から開いていた詳細画面で、取り除かれた看板への配置を保存すると、保存全体が 404 になり、英語の `Signboard not found in the album's project: <id>` が出る。抜けるには「未指定」へ選び直すか読み込み直すしかない（23.3 より前からある挙動。コードの読みによる）。扱うなら、日本語の文言と、該当の写真項目を看板なしへ更新する導線である
  - _Requirements: 9.5_
  - **利用者の判断（2026-10-04）**: 文言だけを日本語にする（取り除かれた看板を指定した保存の失敗に、看板が取り除かれていることと、看板を選び直すか読み込み直すことを示す日本語の文言を出す）。看板なしへ戻す導線は足さない
  - _Boundary: 取り除かれた看板を指定する保存の失敗の表示_

- [x] 24.3 看板の配置のダイアログの「キャンセル」のタップ領域がモバイル幅で下限に届かない状態を扱う
  - 375・320 幅で「キャンセル」は 104×39 で、詳細画面のタップ領域の下限 44 に届かない（23.2 のレビューの実測。スタイルは 23.2 の前から変わっていない）。21.2 が下限の対象を写真項目の操作に限ったのと同じ判断が要る
  - _Requirements: 19.3_
  - **利用者の判断（2026-10-04）**: 19.3 の対象に含め、モバイル幅で「キャンセル」（と同じ行の操作ボタン）のタップ領域を `TAP_TARGET_MIN_PX` 以上にする
  - **【完了時の注記（2026-10-04）】** ダイアログの末尾の行の操作ボタンは「キャンセル」だけで、「保存」はその上の配置のエディタの操作列にある。境界（ダイアログの操作ボタン）に従い両方を対象にした。`SignboardAssignDialog.tsx` に `styles.cancelButtonMobile`、`SignboardPlacementEditor.tsx` に `useMediaQuery(MEDIA_QUERIES.isMobile)` と `styles.saveButtonMobile` を足し、21.2 と同じ `isMobile` の合成で `TAP_TARGET_MIN_PX` の下限を当てた。375・320 幅で「キャンセル」は 104×39 から 104×44、「保存」は 60×33 から 60×44 になった（動いたのは高さだけ）。768・1280 幅は変わらない。看板マスタへのリンクは 23.2 から 140×44 で下限を満たしていた。単体 2 件と E2E 1 件（`REQ-19.3`、4 幅 × 看板の未指定・選択の 2 状態）を足し、モバイル用の合成を外す変異で単体 2 件と E2E のモバイルの 8 件が赤になる。是正の 1 巡目で、E2E のデスクトップ幅の主張をフォントに依存する固定値（104×39・60×33）の一致から、計算済みの min-width・min-height が auto で高さが 44 未満である形へ改めた（CI の和文フォントはローカルと異なるため。上書きを全幅に当てる変異で赤になることをレビューが確かめた）。requirements.md の 19.3 の注記へ日付付きの追記を 1 項足した。肯定側から指す参照が 1543 から 1550 へ動いたため、site-survey が所有する宣言 `t13-anchor-references-after-115303` を同じコミットで貼り直した
  - 残る性質（起票していない。扱いは利用者の判断を待つ）: 実寸の写真（幅 1920 など）では、配置のエディタの画像の枠が `maxDisplayWidth` の既定 600 で描かれ画面の幅に追従しないため、375・320 幅でダイアログの本体に横スクロールが出る（scrollWidth 626 に対して clientWidth 343 / 288。HEAD から既存）。ダイアログは固定配置のため文書全体と `<main>` ははみ出さず 19.1 の既存の E2E には掛からないが、19.1 の趣旨と看板の配置の操作性（9）を損なう。新しい E2E は 100×100 の素材を使い、この性質の外で測っている
  - _Boundary: 看板の配置のダイアログの操作ボタンのタップ領域_

- [ ] 24.4 看板を選んで配置を動かさずに保存すると配置が空のまま残る状態を扱う（起票のみ）
  - 配置のエディタで看板を選び、ドラッグせずに「保存」を押すと、看板の指定だけが保存され配置は null のままになる（23.2 の実装者の観察。既存の挙動）。印字画像と PDF への重畳でどう扱われるか（既定の位置か、重ねないか）は未確認である
  - _Requirements: 9.1, 9.3_
  - **利用者の判断（2026-10-04）**: 看板を選んだときに既定の配置を与える。既定の配置は、配置のエディタが初期配置の無いときに表示している既定の矩形（`defaultDisplayRect`）を画像の座標へ換算したものとする（表示されている位置がそのまま保存される）。印字画像と PDF への重畳がその配置で行われることを確かめること
  - _Boundary: 看板の配置の既定値_

- [x] 24.5 保存の実行中の編集が、保存の成功後に黙って保留から消える状態を扱う
  - 保存の要求の実行中にコメントを編集すると、保存の成功後の保留の消去がその編集も消し、表示は編集されたままなのに未保存が解消される（23.6 のレビューのコードの読みによる。`markAsSaved` の時代からある競合で、23.6 が持ち込んだものではない）。離脱するとその編集は失われる。扱うなら、保存の開始時に送る保留を取り出し、成功後はそれだけを消す形である
  - _Requirements: 18.1, 18.3_
  - **利用者の判断（2026-10-04）**: 直す。保存の開始時に送る保留を取り出し、保存の成功後はそれだけを消す（実行中の編集は未保存として残る）
  - **【完了時の注記（2026-10-04）】** `ConstructionPhotoDetailPage.tsx` の `handleSave` は、保存の開始時に送るメタの変更の写しと順序を取り出し、成功の後は `removeSentFromPending` で送ったものだけを保留から消してから `syncDirtyWithPending()` を呼ぶ。写真項目ごとに、現在の保留が送った内容と同じ（持つ項目の組と各値が一致し、看板の配置は座標と大きさで一致する）なら消し、違えばその項目の保留を丸ごと残す。順序も送った並びと同じときだけ消す。失敗のときは何も消さない（従来どおり）。比べる項目は `satisfies Record<keyof PhotoMetadataChange, true>` で型により網羅させた（項目を足すと型検査が赤になることをレビューが確かめた）
  - 未保存が過剰に残る側に倒れる場合がある（データは失わない）。実行中に写真項目を取り除くと順序が送り直される、一部の項目だけ違うと保存済みの項目も次の保存で送り直される、送らなかった項目を実行中に切り替えて戻すと残る、の 3 つである。送った値へ戻した編集は消える（サーバーの値と表示が一致するため）
  - 単体 8 件と E2E 1 件（`REQ-18.1`・`REQ-18.3`、保存の要求を止めた間にコメントを編集し、成功後の未保存の表示・離脱の警告・遷移の確認と、再保存で実行中の編集だけが送られることを主張）を足した。単体の 3 件と E2E は旧挙動で赤だった。是正の 1 巡目で、独立レビューの変異（順序の比較を外す・比べる項目をコメントだけにする・配置の比較を常に真にする）がすべて緑で通ったため、開始時に順序の保留がある場合・コメントだけを送った写真項目の印刷対象の切り替え・同じ看板のままの配置の変更の 3 件を足し、各変異で赤になることを確かめた。frontend の単体の全件（12054 件）と工事写真の E2E 2 本（36/36・19/19）が緑。新しい E2E で肯定側から指す参照が 1529 から 1538 へ動いたため、site-survey が所有する宣言 `t13-anchor-references-after-115303` を同じコミットで貼り直した
  - _Boundary: 詳細画面の保存と保留の消去の順序_

- [ ] 24.6 デスクトップ幅で写真項目の取り除く操作の失敗の表示が現れるとボタンが項目の中でずれる状態を扱う（起票のみ）
  - 1280 幅では、失敗の表示が現れるとその写真項目の取り除く操作のボタンだけが項目の中で約 51px 上へずれる（scrollY と文書の高さは変わらず、押した位置には表示が来る）。写真項目が画面の上端の近くにあると、フォーカスのあるボタンが固定ヘッダーの下に入る（表示の中心は見える）。モバイル幅では起きない（23.9 のレビューの実測）。`PhotoItemPanel.tsx` の注釈の根拠も実態と合わない。扱うなら、デスクトップ幅の写真項目の配置で表示を足しても操作の行が上がらない形にするか、注釈と design.md へこの性質を書く
  - _Requirements: 7.7, 19.1_
  - **利用者の判断（2026-10-04）**: 配置は変えず、この性質を `PhotoItemPanel.tsx` の注釈と design.md に正しく書く（実態と合わない注釈の根拠を改める）。振る舞いの変更は無い
  - _Boundary: デスクトップ幅の写真項目の失敗の表示と操作の行の配置_

- [x] 24.7 署名付き URL の 900 秒の定数の私的な複製を一つへ寄せる
  - 23.7 が `construction-photo-image.service.ts` の `SIGNED_URL_EXPIRES_IN` を export したが、本スペックの中で `construction-photo-metadata.service.ts` と `construction-photos.routes.ts` に同じ値の私的な複製が残る（23.7 のレビューの確認）。値は今 900 で揃っているが、片方だけ変わると受入基準 11.6 を割りうる。扱うなら、export した定数を引く形へ揃える
  - _Requirements: 11.6_
  - **利用者の判断（2026-10-04）**: 着手する。`construction-photo-image.service.ts` の export 済みの `SIGNED_URL_EXPIRES_IN` を引く形へ揃える
  - **【完了時の注記（2026-10-04）】** `construction-photo-metadata.service.ts` と `construction-photos.routes.ts` の私的な複製を、export された `SIGNED_URL_EXPIRES_IN` の読み込みへ置き換えた。工事写真の `getSignedUrl` の呼び出しは 3 か所ともこの定数を引く（`projects.routes.ts` も別名で同じ定数を引く）。値は 900 のままで振る舞いは変わらない。循環は無く、重い依存も増えていない（メタデータのサービスは元から image service を読み込んでいた）。単体 1 ファイル（`REQ-11.6`）を足した。export された定数を番兵の値へ差し替え、アルバム一覧とメタの一括更新の 2 経路がその値を渡すことを主張する。是正前は 2 件が赤で、独立レビューが直書きへ戻す変異で 2 件とも赤になることを確かめた。`check:design-measurement-freshness`（site-survey の計測値）と `check:req-coverage`（他スペックの被覆）の赤は、新しいテストの有無で変わらない既存の問題である
  - _Boundary: 工事写真の署名付き URL の有効期限の定数_

