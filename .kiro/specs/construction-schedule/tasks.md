# Implementation Plan

- [x] 1. データベーススキーマとPrismaモデルの定義
- [x] 1.1 ConstructionScheduleおよびScheduleItemのPrismaモデルを追加する
  - ConstructionScheduleモデル: id, projectId, name, quantityTableId(nullable), version, createdAt, updatedAt, deletedAt を定義
  - ScheduleItemモデル: id, scheduleId, sourceType, sourceQuantityItemId(nullable), itemName, labelText, detailText, startDate, duration, displayOrder, isExportTarget を定義
  - ProjectモデルにconstructionSchedulesリレーションを追加
  - QuantityTableモデルにconstructionSchedulesリレーションを追加
  - QuantityItemモデルにscheduleItemsリレーションを追加
  - 適切なインデックス（project_id, deleted_at, schedule_id, display_order）を設定
  - _Requirements: 1.1, 1.3, 2.3, 3.1, 3.2, 4.2, 5.3, 9.1, 9.2, 10.1, 10.4, 11.1, 11.4_

- [x] 1.2 Prismaマイグレーションを作成して適用する
  - construction_schedulesテーブルとschedule_itemsテーブルの作成マイグレーション
  - 外部キー制約（ON DELETE CASCADE、ON DELETE SET NULL）の設定
  - isExportTargetのデフォルト値true、sourceTypeのデフォルト値'MANUAL'を設定
  - _Requirements: 1.3, 9.2_

- [x] 2. バックエンドZodバリデーションスキーマの定義
  - 工程表作成スキーマ: name(必須、1-200文字)、quantityTableId(任意)のバリデーション
  - 工程表更新スキーマ: name(必須、1-200文字)、version(必須)のバリデーション
  - バルク保存スキーマ: version(必須)、items配列（itemName必須1-500文字、labelText 0-200文字、detailText 0-500文字、startDate ISO日付形式null許可、duration正の整数null許可、displayOrder 0以上整数、isExportTarget boolean）のバリデーション
  - バルク保存スキーマのitems配列に最大200項目の制約を追加
  - エクスポートクエリスキーマ: format(xlsx|pdf)のバリデーション
  - 一覧クエリスキーマ: page, limit, sortBy, sortOrderのバリデーション
  - _Requirements: 1.3, 1.6, 3.4, 3.5, 12.1_

- [x] 3. バックエンド工程表サービスの実装
- [x] 3.1 工程表のCRUD操作を実装する
  - プロジェクトIDに基づく工程表一覧取得（ページネーション、ソート対応、論理削除除外）
  - 工程表IDに基づく詳細取得（項目一覧をdisplayOrder順で含む）
  - 工程表の新規作成（数量表なしの場合は空の工程表を作成）
  - 工程表の更新（名称変更、楽観的排他制御によるバージョンチェック）
  - 工程表の論理削除（deletedAtの設定、確認ロジック）
  - バージョン競合時のConflictエラーハンドリング
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 2.2, 5.4_

- [x] 3.2 数量表連携による項目自動取得を実装する
  - 工程表作成時にquantityTableIdが指定された場合、数量表のQuantityItemを取得
  - QuantityItemの情報をScheduleItemにスナップショットコピー（sourceType='QUANTITY_TABLE'、sourceQuantityItemId設定、itemNameコピー）
  - 数量表の項目順序（displayOrder）を保持してScheduleItemを生成
  - isExportTargetの初期値をtrueに設定
  - 指定された数量表が同一プロジェクトに属しない場合のバリデーションエラー
  - _Requirements: 2.1, 2.3, 2.4, 9.2_

- [x] 3.3 バルク保存（全項目一括更新）を実装する
  - 楽観的排他制御（version照合）
  - id=nullの項目は新規作成、既存IDの項目は更新
  - リクエストに含まれない既存項目は削除（差分削除方式）
  - トランザクション内でバッチ処理
  - 各項目のdisplayOrder、isExportTarget、labelText、detailText、startDate、durationを保存
  - 最大200項目までの登録を許可し、超過時はバリデーションエラーを返す
  - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 5.3, 9.5, 10.4, 11.4, 12.1_

- [x] 4. バックエンドAPIルートとカスタムエラーの実装
  - GET /api/projects/:projectId/schedules: 工程表一覧取得エンドポイント
  - POST /api/projects/:projectId/schedules: 工程表作成エンドポイント
  - GET /api/schedules/:id: 工程表詳細取得エンドポイント
  - PUT /api/schedules/:id: 工程表更新エンドポイント
  - PUT /api/schedules/:id/bulk-save: バルク保存エンドポイント
  - DELETE /api/schedules/:id: 工程表削除エンドポイント
  - GET /api/schedules/:id/export: エクスポートエンドポイント
  - authenticate + requirePermissionミドルウェアの適用（schedule:read/create/update/delete）
  - Zodバリデーションミドルウェアの適用
  - ScheduleNotFoundError、ScheduleConflictErrorのカスタムエラークラス定義
  - app.tsへのルート登録
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3_

- [x] 5. バックエンドサービスとAPIの単体テスト・統合テスト
- [x] 5.1 (P) ScheduleServiceの単体テストを作成する
  - 工程表CRUD操作のテスト（作成、取得、更新、削除）
  - 数量表連携テスト（数量表指定あり/なし）
  - バルク保存テスト（新規追加、更新、差分削除）
  - 楽観的排他制御テスト（バージョン競合時のエラー）
  - 論理削除テスト（deletedAtの設定と除外確認）
  - 最大200項目制約のバリデーションテスト
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 2.2, 2.3, 3.1, 3.2, 5.3, 9.2, 9.5, 12.1_

- [x] 5.2 (P) Zodバリデーションスキーマの単体テストを作成する
  - 各スキーマの正常系・異常系テスト
  - name文字数制限、duration正の整数、startDate形式、displayOrder範囲のバリデーション確認
  - items配列の最大200項目制約テスト
  - _Requirements: 1.6, 3.4, 3.5, 12.1_

- [x] 5.3 APIルートの統合テストを作成する
  - 全エンドポイント（GET/POST/PUT/DELETE）の統合テスト
  - 認証・認可エラーケースのテスト
  - 数量表連携を含む作成フローの統合テスト
  - バルク保存の統合テスト
  - 5.1, 5.2のテスト完了後に実施（サービスとスキーマの正当性を前提とする）
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4_

- [x] 6. フロントエンドAPI関数と状態管理フックの実装
- [x] 6.1 工程表API関数を実装する
  - 工程表一覧取得、詳細取得、作成、更新、削除のAPI関数
  - バルク保存API関数
  - 数量表一覧取得API関数（既存APIの利用）
  - エクスポートAPI関数（ファイルダウンロード対応）
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1, 8.1_

- [x] 6.2 useScheduleState フックを実装する
  - 工程表項目のState管理（追加、削除、更新、並び替え）
  - 着工日と日数から完了日を自動算出するロジック
  - 着工日未入力時のバリデーション、日数0以下のバリデーション
  - dirty state管理（未保存変更の追跡）
  - 保存ボタン押下時のバルク保存API呼び出し
  - useReducerによる最適化で200項目時のstate更新パフォーマンスを確保
  - _Requirements: 3.3, 4.1, 4.2, 4.3, 4.4, 5.2, 6.1, 6.6, 12.1_

- [x] 6.3 (P) useHolidayCalendar フックを実装する
  - @holiday-jp/holiday_jpの依存関係追加
  - 指定期間の祝日データ取得とHolidayMapの生成
  - 土曜日・日曜日・祝日の判定関数
  - useMemoによる祝日データのメモ化
  - _Requirements: 6.2, 6.3, 6.4_

- [x] 7. フロントエンド工程表一覧画面の実装
  - ScheduleListPageの作成（既存ContractListPageパターン踏襲）
  - プロジェクトに紐付く工程表一覧の表示（名称、数量表名、項目数、作成日時）
  - 新規作成ボタンの配置
  - 工程表選択による詳細画面へのナビゲーション
  - 削除ボタンと確認ダイアログの実装
  - ルーティング設定の追加
  - _Requirements: 1.1, 1.2, 1.4, 1.5_

- [x] 8. フロントエンド工程表作成フォームの実装
  - ScheduleFormダイアログの作成
  - 工程表名称の入力フォーム
  - 同一プロジェクトの数量表選択肢の表示（数量表なしの選択も可能）
  - 作成ボタン押下時のAPI呼び出しと工程表詳細画面への遷移
  - 保存失敗時のエラーメッセージ表示と入力内容保持
  - _Requirements: 1.2, 1.3, 1.6, 2.1, 2.2, 2.3_

- [x] 9. フロントエンド工程表詳細・編集画面の実装
- [x] 9.1 ScheduleDetailPageと項目入力行を実装する
  - 工程表詳細画面のレイアウト（項目一覧エリアとガントチャートエリアの並列配置）
  - ScheduleItemRow: 項目名、ラベル文字、詳細文字、着工日、日数、出力対象チェックボックスの入力欄
  - 数量表由来項目と任意項目の混在表示
  - 着工日未入力時のバリデーションメッセージ、日数0以下のバリデーションエラー表示
  - 任意項目の追加ボタンと削除ボタン
  - 保存ボタンによるバルク保存呼び出し
  - _Requirements: 1.4, 2.4, 3.1, 3.2, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 9.1, 9.2, 10.1, 11.1_

- [x] 9.2 SortableScheduleListによる並び順管理を実装する
  - HTML5 Drag and Dropまたは軽量ライブラリによるドラッグ&ドロップ並び替え
  - 数量表由来・任意項目を問わず全項目の並び順変更
  - 並び順変更時のリアルタイム画面反映
  - 保存時に並び順をデータベースに永続化
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 10. ガントチャートコンポーネントの実装
  - GanttChartPanelのカスタムReactコンポーネント実装（HTML/CSSベース、外部ライブラリ不使用）
  - 全項目の着工日〜完了日範囲から表示期間を自動算出
  - 日付列ヘッダー（年月日表示）の生成
  - 各項目のバーをCSS positionで配置
  - 土曜日・日曜日・祝日をそれぞれ異なる背景色で色分け表示
  - ラベル文字を左列に表示
  - 詳細文字をバーの上に表示
  - 着工日・日数の入力変更時にフロントエンド処理のみでリアルタイム更新（サーバー通信なし）
  - 入力変更から表示更新までを200ミリ秒以内に完了する
  - ラベル文字・詳細文字の変更時もリアルタイムで表示更新
  - 出力対象チェックがOFFの項目もガントチャート上に表示を維持
  - CSS containment + useMemoによる差分計算で200項目時のスムーズ描画を実現
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 9.6, 10.2, 10.3, 11.2, 11.3, 12.2_

- [x] 11. Excel出力機能の実装
- [x] 11.1 ScheduleExportServiceのExcel出力ロジックを実装する
  - xlsxライブラリを使用した.xlsx形式ファイル生成
  - ヘッダーにプロジェクト名と自社名（CompanyInfoから取得）を含める
  - isExportTarget=trueの項目のみ出力対象としてフィルタ
  - 各項目の着工日・日数・完了日をセルに出力
  - ラベル文字を左列セルに配置
  - 日付列をセルとして展開し、バー期間に該当するセルに背景色を設定してガントチャートを再現
  - 詳細文字をバー先頭セルにテキストとして配置
  - 土日祝に対応するセルの背景色を変更
  - 出力処理失敗時はエラーメッセージをフロントエンドに返却する
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 9.3, 9.4, 10.5, 11.5, 12.3_

- [x] 11.2 (P) Excel出力エンドポイントとの統合
  - GET /api/schedules/:id/export?format=xlsxからScheduleExportServiceの呼び出し
  - Bufferをレスポンスとして返却し、フロントエンドでファイルダウンロード
  - _Requirements: 7.1_

- [x] 12. PDF出力機能の実装
- [x] 12.1 ScheduleExportServiceのPDF出力ロジックを実装する
  - jsPDFライブラリを使用したPDF形式ファイル生成
  - A4横向き（ランドスケープ）レイアウト
  - ヘッダーにプロジェクト名と自社名（CompanyInfoから取得）を含める
  - isExportTarget=trueの項目のみ出力対象としてフィルタ
  - 各項目の着工日・日数・完了日をテーブル行として出力
  - ラベル文字をバー左側のテキスト領域に配置
  - rect()による矩形描画でガントチャートのバーを再現（1日あたりの幅を定数で定義、着工日からのオフセットでX座標算出）
  - 詳細文字をバー矩形の上にtext()で配置
  - 土日祝列に薄い背景色の矩形を全行にわたって描画
  - 日本語フォントの対応（既存見積書PDF出力パターンに従う）
  - 出力処理失敗時はエラーメッセージをフロントエンドに返却する
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.3, 9.4, 10.5, 11.5, 12.4_

- [x] 12.2 (P) PDF出力エンドポイントとの統合
  - GET /api/schedules/:id/export?format=pdfからScheduleExportServiceの呼び出し
  - Bufferをレスポンスとして返却し、フロントエンドでファイルダウンロード
  - _Requirements: 8.1_

- [x] 13. フロントエンド出力ダイアログの実装
  - ExportDialogコンポーネントの作成（Excel/PDF形式選択）
  - Excel出力ボタンとPDF出力ボタンの配置
  - ボタン押下時のエクスポートAPI呼び出しとファイルダウンロード処理
  - 出力中のローディング表示
  - 出力失敗時のエラーメッセージ表示と再試行ボタンの提供
  - _Requirements: 7.1, 7.6, 8.1, 8.6_

- [x] 14. エクスポートサービスの単体テスト
- [x] 14.1 (P) Excel出力ロジックの単体テストを作成する
  - プロジェクト名・自社名のヘッダー出力確認
  - 出力対象フィルタ（isExportTarget=true/false）の動作確認
  - 項目情報（着工日・日数・完了日・ラベル文字・詳細文字）の出力確認
  - ガントチャート再現（セル背景色、項目名・バー・土日祝色分け）の確認
  - 出力失敗時のエラーハンドリング確認
  - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 9.3, 9.4, 10.5, 11.5_

- [x] 14.2 (P) PDF出力ロジックの単体テストを作成する
  - プロジェクト名・自社名のヘッダー出力確認
  - 出力対象フィルタ（isExportTarget=true/false）の動作確認
  - 項目情報（着工日・日数・完了日・ラベル文字・詳細文字）の出力確認
  - ランドスケープレイアウトの確認
  - ガントチャート再現（項目名・バー・土日祝色分け）の確認
  - 出力失敗時のエラーハンドリング確認
  - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 9.3, 9.4, 10.5, 11.5_

- [x] 15. フロントエンドコンポーネントの単体テスト
- [x] 15.1 (P) useScheduleStateフックの単体テストを作成する
  - 項目追加・削除・更新のState変更テスト
  - 完了日自動算出ロジックのテスト
  - dirty state管理のテスト
  - バリデーションロジック（着工日未入力、日数0以下）のテスト
  - _Requirements: 3.3, 3.4, 3.5, 4.1, 4.3_

- [x] 15.2 (P) useHolidayCalendarフックの単体テストを作成する
  - 祝日判定の正確性テスト
  - 土曜日・日曜日判定のテスト
  - メモ化動作の確認
  - _Requirements: 6.2, 6.3, 6.4_

- [x] 15.3 (P) GanttChartPanelの単体テストを作成する
  - バー位置の描画テスト
  - 土日祝の色分け表示テスト
  - ラベル文字・詳細文字の表示テスト
  - 表示期間の自動調整テスト
  - 出力対象チェックOFFの項目もガントチャート上に表示されることの確認
  - _Requirements: 6.1, 6.5, 6.7, 9.6, 10.2, 11.2_

- [x] 16. エクスポート統合テストとE2Eテスト
- [x] 16.1 エクスポートAPIの統合テストを作成する
  - GET /api/schedules/:id/export?format=xlsx のテスト
  - GET /api/schedules/:id/export?format=pdf のテスト
  - 認証・認可エラーケースのテスト
  - 出力対象フィルタリングの統合確認
  - 出力失敗時のエラーレスポンス確認
  - _Requirements: 7.1, 7.6, 8.1, 8.6, 9.3_

- [x] 16.2 E2Eテストを作成する
  - 工程表一覧の表示・ナビゲーション
  - 工程表の新規作成（数量表連携あり/なし）
  - 項目入力（着工日、日数）とガントチャートリアルタイム更新の確認
  - 任意項目の追加・削除
  - 並び順の変更と保存
  - 出力対象チェックボックスの操作
  - ラベル文字・詳細文字の入力と表示確認
  - Excel/PDF出力のダウンロード
  - 出力失敗時のエラーメッセージ表示と再試行操作の確認
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 7.1, 7.6, 8.1, 8.6, 9.1, 9.3, 10.1, 10.2, 11.1, 11.2_
