# Implementation Plan

## Task Format Template

> Major + Sub-task structure with `(P)` markers for parallel-capable tasks.

- [x] 1. データベーススキーマとマイグレーション
- [x] 1.1 実行予算関連テーブルのPrismaスキーマ定義とマイグレーション作成
  - ExecutionBudget、ExecutionBudgetItem、Order、OrderItem、ProgressRecord、ProgressRecordItem、MonthlyCloseHistoryの各モデルを定義する
  - OrderStatusとAmendmentStatusのenum型を定義する
  - 各テーブルのインデックス、ユニーク制約、外部キー制約、カスケード削除設定を行う
  - 金額フィールドにDecimal(15,0)、単価にDecimal(15,2)、数量にDecimal(15,4)を設定する
  - 楽観的排他制御用のversionフィールド、論理削除用のdeletedAtフィールドを含める
  - マイグレーションを作成し、開発環境のデータベースに適用する
  - _Requirements: 19.1, 19.8_

- [x] 1.2 (P) Zodバリデーションスキーマの定義
  - 実行予算作成・更新、発注作成・更新・ステータス変更、出来高入力、原価入力、月次締めの各API入力に対するZodスキーマを定義する
  - 金額フィールドの文字列受け取りとDecimal変換のバリデーションロジックを含める
  - targetMonth（YYYY-MM形式）のカスタムバリデーションを定義する
  - _Requirements: 19.7_

- [x] 2. 実行予算のバックエンドサービスとAPI
- [x] 2.1 実行予算の作成サービス実装
  - 契約書IDからEstimate → EstimateItem → EstimateItemLine（EXECUTION行）を取得し、実行予算項目として初期化するロジックを実装する
  - EstimateItemLineのVENDOR行からsourceVendorNameを取得し、取引先マスタから名前完全一致でplannedVendorIdを設定する（不一致時はnull）
  - プロジェクトに対する実行予算の存在チェック（ユニーク制約）を実装する
  - 見積項目の階層構造（parentId）をコピーし、displayOrderを保持する
  - トランザクション内でExecutionBudgetとExecutionBudgetItemsを一括作成する
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 2.2 実行予算の取得・削除・編集サービス実装
  - 実行予算の取得（項目一覧含む）で階層構造を保持したデータを返却する
  - 親項目の各金額列（見積金額、実行金額、変更金額、発注金額、累計支出、出来高金額）の合計値を計算する
  - 合計行データ（全金額列の合計）と利益見込額（契約金額 - 実行金額合計）を算出する
  - 発注進捗率（発注済み項目数 / 全項目数）を計算する
  - 実行単価の更新時に実行金額（数量 x 実行単価）を自動計算し、楽観的排他制御を適用する
  - 備考フィールドの更新を実装する
  - 削除時に発注済みの発注が存在する場合は削除を阻止するロジックを実装する
  - 論理削除（deletedAtフィールド設定）を実装する
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 2.3 実行予算のルーター実装
  - POST /api/projects/:projectId/execution-budget（作成）、GET（取得）、DELETE（削除）、PATCH items/:itemId（編集）のエンドポイントを実装する
  - Router({ mergeParams: true })でprojectIdを取得する
  - authenticate + requirePermissionミドルウェアでアクセス制御を適用する
  - validateミドルウェアでZodスキーマバリデーションを適用する
  - 適切なHTTPステータスコード（201, 200, 204, 400, 404, 409）を返却する
  - _Requirements: 17.1, 17.2, 19.2, 19.9_

- [x] 3. 発注管理のバックエンドサービスとAPI
- [x] 3.1 発注の作成・取得・編集・削除サービス実装
  - 取引先IDを指定して発注を作成し、発注予定取引先が一致するExecutionBudgetItemにchecked=trueでOrderItemを作成する
  - 発注一覧取得（チェック済み項目数、合計実行金額、確定発注金額を含むサマリー）を実装する
  - 発注詳細取得（OrderItem一覧含む）を実装する
  - 発注ステータスが「発注前」「発注金額検討中」の場合のみ、取引先変更・チェック状態変更・確定発注金額変更を許可する
  - 発注ステータスが「発注済」の場合の編集禁止（取消のみ許可）を実装する
  - 発注削除時に「発注前」「発注金額検討中」のみ許可し、「発注済」の場合はエラーを返却する
  - チェック済み項目の合計実行金額を自動計算するロジックを実装する
  - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 3.2 発注金額確定・案分計算・発注取消サービス実装
  - ステータスを「発注済」に変更する際、確定発注金額の入力必須チェックを行う
  - チェック済み項目の各実行金額の比率で確定発注金額を案分するロジックを、decimal.jsで高精度に実装する
  - 案分端数処理として、1円未満の端数を最も金額の大きい項目に加算する
  - 案分結果をOrderItem.orderAmountに一括保存し、トランザクション内で処理する
  - 発注取消操作時に案分済みの各項目のorderAmountをクリアし、ステータスを「発注取消」に変更する
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 18.1, 18.3_

- [x] 3.3 発注のルーター実装
  - GET /orders（一覧）、POST /orders（作成）、GET /orders/:orderId（詳細）、PATCH /orders/:orderId（編集）、PUT /orders/:orderId/items（項目更新）、PATCH /orders/:orderId/status（ステータス変更）、DELETE /orders/:orderId（削除）のエンドポイントを実装する
  - アクセス制御とバリデーションミドルウェアを適用する
  - _Requirements: 17.3, 19.3, 19.9_

- [x] 4. 出来高管理のバックエンドサービスとAPI
- [x] 4.1 (P) 出来高入力・履歴管理サービス実装
  - 施工日と各項目の出来高金額を受け取り、ProgressRecord + ProgressRecordItemsとして保存する
  - 同一施工日に対する上書き保存（upsert）を実装する
  - 出来高金額が0円未満にならないバリデーションを実装する
  - 出来高率（出来高金額 / 実行金額 x 100）を自動計算する
  - 全項目の出来高合計金額と出来高合計率を算出する
  - 出来高履歴一覧を施工日の降順で取得する機能を実装する
  - 過去の出来高レコードの取得（施工日指定）を実装する
  - 出来高レコードの削除を実装する
  - 最新施工日における各項目の出来高金額を取得し、実行予算一覧の出来高金額列に反映するためのデータを返却する
  - _Requirements: 11.1, 11.2, 11.9, 11.10, 11.11, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

- [x] 4.2 (P) 月別出来高集計サービス実装
  - 出来高入力データを月別に集計し、対象月・当月出来高金額・累計出来高金額・累計出来高率を算出する
  - 特定月の項目別出来高明細を取得する機能を実装する
  - SQLレベルのGROUP BY集計で月別データを効率的に取得する
  - _Requirements: 16.1, 16.2, 16.3_

- [x] 4.3 出来高のルーター実装
  - POST /progress（保存）、GET /progress（履歴一覧）、GET /progress/:date（施工日指定取得）、DELETE /progress/:progressRecordId（削除）、GET /progress/monthly（月別集計）、GET /progress/monthly/:yearMonth（月別明細）のエンドポイントを実装する
  - アクセス制御とバリデーションミドルウェアを適用する
  - _Requirements: 17.4, 19.4, 19.9_

- [x] 5. 原価管理・月次締めのバックエンドサービスとAPI
- [x] 5.1 (P) 原価管理サービス実装
  - 各実行予算項目の「今月の支出」を入力・更新する機能を実装する
  - 累計支出（先月までの支出 + 今月の支出）を自動計算する
  - 残予算（実行金額 - 累計支出）を自動計算する
  - 累計支出が実行金額を超過した場合の警告フラグを設定する
  - 出来高金額と累計支出の比率（出来高対支出比率）を算出する
  - _Requirements: 13.1, 13.2, 13.5, 13.6, 13.7, 13.8_

- [x] 5.2 (P) 月次締めサービス実装
  - 月次締め処理として、全項目のcurrentMonthExpenseをpreviousMonthExpenseに累積し、currentMonthExpenseを0にリセットする
  - トランザクション内で一括更新とMonthlyCloseHistory作成を行う
  - 同一月に対する重複締めを阻止するバリデーションを実装する
  - 月次締め履歴の一覧取得を実装する
  - _Requirements: 13.3, 13.4, 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 5.3 原価・月次締めのルーター実装
  - PATCH /items/:itemId/cost（原価入力）、POST /monthly-close（月次締め）、GET /monthly-close（履歴一覧）のエンドポイントを実装する
  - アクセス制御とバリデーションミドルウェアを適用する
  - _Requirements: 17.5, 19.5, 19.6, 19.9_

- [x] 6. エクスポート機能のバックエンドサービスとAPI
- [x] 6.1 (P) 発注一覧エクスポートサービス実装
  - チェック済み項目一覧（項目名、規格、単位、数量、実行単価、実行金額）と合計金額をExcelファイル（.xlsx形式）で出力する
  - 同じデータをPDFファイルで出力する
  - ヘッダー情報（発注取引先名、発注日、確定発注金額）を出力に含める
  - 発注済ステータスの場合に発注金額列を追加出力する
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 6.2 (P) 月別出来高エクスポートサービス実装
  - 月別出来高データをExcelファイル（.xlsx形式）で出力する
  - 月別出来高データをPDFファイルで出力する
  - _Requirements: 16.4, 16.5_

- [x] 6.3 エクスポートのルーター実装
  - GET /orders/:orderId/export（発注エクスポート）、GET /progress/monthly/export（月別出来高エクスポート）のエンドポイントを実装する
  - format（xlsx/pdf）クエリパラメータによる出力形式切り替えを実装する
  - バイナリファイルレスポンスの適切なContent-Type設定を行う
  - _Requirements: 19.9_

- [x] 7. 契約変更反映のバックエンドサービス
- [x] 7.1 契約変更反映サービス実装
  - 同一プロジェクト内の未反映変更契約一覧を取得する機能を実装する
  - 変更契約に紐づく見積書の項目差分（追加・変更）を算出し表示データを返却する
  - 新規項目の追加と既存項目の数量・金額更新を実行予算に反映する
  - 変更削除対象項目が発注済みまたは出来高入力済みの場合、AMENDMENT_DELETEDステータスを付与する
  - 変更削除対象項目が未発注かつ出来高未入力の場合、論理削除する
  - 変更反映履歴（適用日時、変更契約名）を記録する
  - 変更前後の契約金額を並べて表示するデータを返却する
  - 実行予算一覧の「変更金額」列に変更契約による金額差分を設定する
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8_

- [x] 7.2 契約変更反映のルーター実装
  - POST /api/projects/:projectId/execution-budget/apply-amendment のエンドポイントを実装する
  - アクセス制御とバリデーションミドルウェアを適用する
  - _Requirements: 19.2, 19.9_

- [x] 8. フロントエンド: 実行予算メインページ
- [x] 8.1 実行予算の作成・表示・削除UI実装
  - プロジェクト詳細画面に実行予算セクションカードを追加し、実行予算ページへのリンクを提供する
  - 実行予算の存在有無に応じた表示切り替え（作成ボタン / 既存予算情報表示）を実装する
  - 契約書選択ダイアログ（既存ContractListAPI再利用）を実装する
  - 実行予算に紐づく契約書名、契約金額、作成日時を表示する
  - 既に実行予算が存在する場合は作成ボタンを非活性にし、メッセージを表示する
  - 削除確認ダイアログと発注済み発注が存在する場合のエラー表示を実装する
  - _Requirements: 1.1, 1.2, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3_

- [x] 8.2 実行予算項目一覧のツリー表示と編集UI実装
  - 見積書の階層構造を保持したツリーテーブルを実装する（折り畳み・展開操作対応）
  - 予算関連列（項目名、規格、単位、数量、見積単価、見積金額、実行単価、実行金額、変更金額、備考）を表示する
  - 発注関連列（発注予定取引先、発注金額、発注ステータス）を表示する
  - 原価関連列（先月までの支出、今月の支出、累計支出、残予算）を表示する
  - 出来高関連列（出来高金額、出来高率）を表示する
  - 親項目の各金額列に子項目の合計値を表示する
  - 全項目の合計行を表示する
  - 契約金額と実行金額合計の差額（利益見込額）を表示する
  - 発注進捗率（発注済み項目数 / 全項目数）を表示する
  - 実行単価のインライン編集と実行金額の自動計算を実装する
  - 備考のインライン編集を実装する
  - 発注予定取引先を読み取り専用で表示する
  - 楽観的排他制御による競合エラー表示と再取得促進を実装する
  - 発注済み項目に「発注済」アイコンを表示し、発注金額を表示する
  - 未発注項目の発注金額列を空欄表示する
  - 金額を3桁区切りカンマ付き整数形式で表示する
  - 出来高率を小数点以下1桁で表示する
  - 負の金額値を赤色で表示する
  - 累計支出が実行金額を超過した項目の残予算を赤色で警告表示する
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 4.1, 4.2, 4.3, 4.4, 4.5, 9.1, 9.2, 9.3, 13.1, 13.7, 18.2, 18.4, 18.5_

- [x] 8.3 発注一覧セクションと原価入力UI実装
  - 実行予算画面に発注一覧セクションを表示し、発注取引先名・ステータス・チェック済み項目数・合計実行金額・確定発注金額・作成日時を一覧表示する
  - 発注一覧の行選択による発注詳細画面への遷移を実装する
  - 各実行予算項目の「今月の支出」をインライン編集で入力する機能を実装する
  - 累計支出の自動計算表示を実装する
  - 出来高対支出比率を表示する
  - _Requirements: 5.1, 5.2, 5.3, 13.2, 13.8_

- [x] 8.4 月次締めUIと変更契約反映UI実装
  - 月次締めボタンと確認ダイアログ（締め対象月・処理内容）を実装する
  - 月次締め履歴の一覧表示を実装する
  - 重複締め時のエラーメッセージ表示を実装する
  - 「変更契約の反映」ボタンと未反映変更契約一覧表示を実装する
  - 変更契約の項目差分表示と確認・適用UIを実装する
  - 変更前後の契約金額の並列表示を実装する
  - 変更反映履歴の表示を実装する
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 15.1, 15.2, 15.3, 15.6, 15.7, 15.8_

- [x] 9. フロントエンド: 発注詳細ページ
- [x] 9.1 発注の作成・編集・削除UI実装
  - 発注作成画面で取引先マスタからの検索・選択コンボボックス（既存TradingPartnerSelectコンポーネント再利用）を実装する
  - 見積項目のチェックボックスによる選択UIを実装する（発注予定取引先が一致する項目にデフォルトチェック）
  - チェック済み項目の合計実行金額の自動計算表示を実装する
  - 確定発注金額の入力欄を実装する
  - ステータス遷移UI（発注前 → 発注金額検討中 → 発注済 → 発注取消）を実装する
  - 発注済ステータスでのチェック状態・確定発注金額・取引先変更の編集ロックを実装する
  - 発注済ステータスへの変更時に確認ダイアログを表示する
  - 確定発注金額未入力時のエラー表示を実装する
  - 案分結果（各項目の発注金額）の表示を実装する
  - 発注取消時の確認ダイアログ（案分済み発注金額クリア警告含む）を実装する
  - 削除確認ダイアログと発注済ステータスでの削除エラー表示を実装する
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.6, 8.7, 8.8, 8.9_

- [x] 9.2 発注エクスポートUI実装
  - Excel出力ボタンとPDF出力ボタンを実装する
  - エクスポートAPIを呼び出しファイルダウンロードを実行する
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 10. フロントエンド: 出来高入力ページ
- [x] 10.1 出来高入力UI実装
  - 施工日のカレンダー選択入力を実装する
  - 各見積項目の出来高金額入力欄を表示する
  - 即0%・即50%・即100%のクイック入力ボタンを実装する（実行金額を基準に金額を設定）
  - +5%・-5%の増減ボタンを実装する（現在値に実行金額の5%を加減算）
  - 出来高金額の直接入力を実装する
  - 出来高金額が0円未満にならないようフロントエンドバリデーションを実装する
  - 各項目の出来高率（出来高金額 / 実行金額 x 100）を自動計算表示する
  - 全項目の出来高合計金額と出来高合計率を表示する
  - 保存操作でAPIを呼び出し、施工日と各項目の出来高金額を送信する
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11_

- [x] 10.2 出来高履歴管理UI実装
  - 出来高履歴一覧（施工日の降順）を表示する
  - 過去の出来高レコード選択による編集画面への読み込みを実装する
  - 出来高レコードの削除確認ダイアログと削除操作を実装する
  - _Requirements: 12.3, 12.4, 12.5, 12.6_

- [x] 10.3 月別出来高集計UI実装
  - 月別出来高一覧画面（対象月、当月出来高金額、累計出来高金額、累計出来高率）を表示する
  - 特定月選択による項目別出来高明細の表示を実装する
  - Excel・PDFエクスポートボタンを実装する
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [x] 11. アクセス制御とパーミッション設定
- [x] 11.1 実行予算関連のパーミッション定義とミドルウェア適用
  - execution_budget:read、execution_budget:write、order:read、order:write、progress:read、progress:write、cost:write、monthly_close:writeの各パーミッションを定義する
  - VIEWER以上のロールに閲覧系パーミッションを許可する
  - EDITOR以上のロールに作成・編集・削除系パーミッションを許可する
  - 全ルーターのエンドポイントにrequirePermissionミドルウェアを適用する
  - 権限不足時に403 Forbiddenとエラーメッセージを返却する
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

- [x] 12. バックエンド単体テスト
- [x] 12.1 (P) 実行予算サービスの単体テスト
  - 実行予算の作成ロジック（EstimateItem/EstimateItemLine連携、階層構造コピー、発注予定取引先設定）のテストを作成する
  - 実行予算の削除ロジック（発注済み存在チェック、論理削除）のテストを作成する
  - 実行予算項目の編集ロジック（実行金額自動計算、楽観的排他制御）のテストを作成する
  - 契約変更反映ロジック（項目差分追加・更新・論理削除・AMENDMENT_DELETEDステータス付与）のテストを作成する
  - _Requirements: 1.3, 1.4, 2.3, 4.1, 4.4, 4.5, 15.3, 15.4, 15.5_

- [x] 12.2 (P) 発注サービスの単体テスト
  - 発注作成ロジック（取引先一致項目の自動チェック）のテストを作成する
  - 案分計算の精度テスト（端数処理、最大金額項目への端数加算、合計金額一致）を網羅的に作成する
  - ステータス遷移バリデーション（確定発注金額必須チェック、発注済ステータスでの編集禁止）のテストを作成する
  - 発注取消ロジック（orderAmountクリア）のテストを作成する
  - Zodスキーマバリデーションテストを作成する
  - _Requirements: 6.3, 8.3, 8.4, 8.9, 18.1, 18.3_

- [x] 12.3 (P) 出来高・原価・月次締めサービスの単体テスト
  - 出来高保存・上書き保存のテストを作成する
  - 出来高率計算のテストを作成する
  - 月別出来高集計の計算ロジックテストを作成する
  - 原価入力・累計支出自動計算のテストを作成する
  - 月次締め処理（累積・リセット）のテストを作成する
  - 重複締め防止ロジックのテストを作成する
  - _Requirements: 11.10, 12.1, 12.2, 13.2, 13.5, 14.3, 14.5_

- [x] 13. バックエンド統合テスト
- [x] 13.1 実行予算CRUD APIの統合テスト
  - 実行予算の作成・取得・編集・削除のAPI統合テストを作成する（Contract → Estimate連携含む）
  - 楽観的排他制御の競合テストを作成する
  - 契約変更反映APIの統合テストを作成する
  - _Requirements: 1.3, 2.2, 4.4, 15.3, 19.2_

- [x] 13.2 (P) 発注CRUD + ステータス遷移 + 案分計算の統合テスト
  - 発注の作成・取得・編集・削除のAPI統合テストを作成する
  - ステータス遷移とそれに伴う案分計算の統合テストを作成する
  - 発注取消による金額クリアの統合テストを作成する
  - _Requirements: 6.3, 8.3, 8.9, 19.3_

- [x] 13.3 (P) 出来高・原価・月次締めの統合テスト
  - 出来高入力・履歴取得・月別集計のAPI統合テストを作成する
  - 原価入力と月次締め処理の統合テストを作成する
  - アクセス制御（VIEWER/EDITOR権限）の統合テストを作成する
  - _Requirements: 12.1, 13.3, 14.3, 17.6, 19.4, 19.5, 19.6_

- [x] 13.4 (P) エクスポートの統合テスト
  - 発注一覧のExcel/PDFエクスポートAPIの統合テストを作成する
  - 月別出来高のExcel/PDFエクスポートAPIの統合テストを作成する
  - _Requirements: 10.1, 10.2, 16.4, 16.5_

- [x] 14. ルーティング統合と最終結合
- [x] 14.1 アプリケーションへのルーター統合
  - 実行予算・発注・出来高・原価・月次締め・エクスポートの全ルーターをExpressアプリケーションに登録する
  - プロジェクト詳細画面への実行予算セクションカードの統合を確認する
  - フロントエンドのルーティング（実行予算ページ、発注詳細ページ、出来高入力ページ）を設定する
  - 全機能の画面遷移フローが正常に動作することを確認する
  - _Requirements: 1.1, 5.3, 19.2, 19.3, 19.4, 19.5, 19.6_

## タスク15: 除外一覧が名乗る検証道具名を実体へ揃える

**経緯**: site-survey の Task 115.213 が設計文書に滞留していた未起票の提案を台帳化し、その `### 判定の一覧` の行7「他機能スペックの除外一覧の Jest 道具名」を**後続タスクへ送る**と裁定した。site-survey の Task 115.238 が申し送りを実行して本節を起こした。**所有権は本スペックにある。** site-survey は自機能分 32 件を Task 115.121 で既に Vitest へ改めており、現場調査スペックの所管は 0 件である。

**測った事実**（いずれもコミット `9e63637`、2026-09-02 にリポジトリルートで実測）:

- **本リポジトリに Jest は存在しない。** `find . -name 'jest.config*' -not -path '*/node_modules/*' | wc -l` の出力が `0`。`package.json` / `backend/package.json` / `frontend/package.json` の依存に `jest` は無く、名前に jest を含むのは `frontend/package.json` の `@testing-library/jest-dom`（Vitest から使う照合子の集まりであって走者ではない）だけである
- **単体・統合の走者は backend / frontend とも Vitest である。** 両者の `npm test` はいずれも `vitest run` であり、`backend/vitest.config.ts` / `backend/vitest.integration.config.ts` / `frontend/vitest.config.ts` が実在する
- **利用の実測**: `grep -rlE "from ['\"]vitest['\"]" backend/src frontend/src --include=*.ts --include=*.tsx | wc -l` の出力が `757` である。**同じ走査根・同じ glob** で `grep -rlE "from ['\"]@jest/globals['\"]|\bjest\.(fn|mock|spyOn)\(" backend/src frontend/src --include=*.ts --include=*.tsx | wc -l` を測ると出力は `0` である。**総数 `757` を併記するのは、`0` だけでは「走査根を読めていない」場合と区別できないためである**——同じ式を実在しないパスへ当てても出力は同じく `0` になる（2026-09-02 に実測）
- **提案が生きていること**: `node -e "const j=require('./e2e/requirement-exclusions.json');const k=j.exclusions.filter(e=>/Jest/.test(e.alternativeVerification.tool));console.log(k.length, k.filter(e=>e.id.startsWith('site-survey/')).length)"` の出力が `64 0`（後の `0` が現場調査スペックの分）
- **機械保証は無い。断定でなく変異で示す**（115.235 の作法）: `e2e/requirement-exclusions.schema.json` は `tool` を `{ "type": "string", "minLength": 1 }` としか定めず、道具の実在を見ない。実在しない道具名 `Kaboomtest 9000 / Nonexistent Runner` へ一件を差し替える変異を当てても `npm run check:req-exclusions` は 205 件を検査して終了コード 0 のままである（2026-09-02 に実測。変異は複製からの書き戻しで復元し、blob ハッシュが `HEAD` と一致することで確かめた）

**是正すると別の関門が赤くなる。着手前に読むこと**: 上の `node -e` の出力 `64 0` は `scripts/design-measurements.json` の宣言 `jest-alternative-verification-exclusions` に固定されており、`.kiro/specs/site-survey/design.md` の台帳の再現コマンド 5 の行と双方向で突き合わされる。**一件でも道具名から Jest を落とすと `npm run check:design-measurement-freshness` が「expected=`64 0` actual=`63 0`」として終了コード 1 で落ちる**（`company-info/REQ-6.9` の道具名を実在しない `Kaboomtest 9000 / Nonexistent Runner` へ差し替える変異を実際に当てて実測。2026-09-02、コミット `9e63637` にリポジトリルートで実測。変異は事前複製からの `cp` で復元し、`git hash-object e2e/requirement-exclusions.json` が `HEAD` の blob `77d4bb8443f19bc5c2de768c866eae1943175a6d` と一致することで確かめた）。宣言の解除と台帳の追随は**現場調査スペックの Task 115.280 が所管する**。

**同じ変異を当てたまま測った他の関門の実測**（走査の範囲は日本語でなくコマンドで宣言する。2026-09-02、コミット `9e63637` にリポジトリルートで実測）: 測ったのは `npm run` に与える名で `check:req-exclusions` / `check:req-exclusions:selftest` / `check:req-coverage` / `check:trace-coverage` / `check:design-refs` / `check:design-code-refs` / `check:design-path-refs` / `check:cf-evidence` / `check:steering-refs` / `check:steering-idents` / `check:steering-test-tree` / `lint` / `type-check` / `format:check` の **14 本**である。**いずれも基線と同じ終了コードのままであった。ただし `check:req-coverage` は基線から既に終了コード 1 であり（到達被覆 2632/2684 = 98.1%、未カバー 215 件）、変異の前後で変わらない**——「14 本が緑のままであった」のではない。**終了コードが動かないことと出力が動かないことも別である**: 14 本のうち 13 本は基線と出力まで一致したが、`check:req-coverage` だけは除外一覧の監査の内訳が「リポジトリ外の代替検証: 32件 / リポジトリ内検証あり: 22件」から「33件 / 21件」へ変わる（差分はこの 2 行のみで、終了コードも被覆率も動かない）。**着手時にはこの 14 本と `check:design-measurement-freshness` を自分で測り直し、実測日とコミットハッシュを添えること**（115.212 の規約）。

**是正先**:

1. `e2e/requirement-exclusions.json` の下表の `alternativeVerification.tool`
2. 本スペックの設計文書——**ただし実測では該当が 0 件である。** `for f in .kiro/specs/*/design.md; do printf '%s %s\n' "$f" "$(grep -c Jest "$f")"; done` を走らせると、`Jest` を挙げる設計文書は 13 スペックのうち `site-survey` の 1 件（6 箇所）だけで、他の 12 スペックはいずれも `0` である（2026-09-02 に実測）。台帳の行7 は是正先に「各機能スペックの設計文書」を挙げているが、起票の時点で当たりが無い。**この `0` は着手時に測り直すこと**

**本スペックの所管は 9 件で、全件を次に挙げる**（2026-09-02 に実測。抜き取りではない）:

| id | 現在の `alternativeVerification.tool` |
|---|---|
| `execution-budget-management/REQ-18.1` | `Jest / Vitest` |
| `execution-budget-management/REQ-18.3` | `Jest / Vitest` |
| `execution-budget-management/REQ-19.2` | `Jest / Supertest` |
| `execution-budget-management/REQ-19.3` | `Jest / Supertest` |
| `execution-budget-management/REQ-19.4` | `Jest / Supertest` |
| `execution-budget-management/REQ-19.5` | `Jest / Supertest` |
| `execution-budget-management/REQ-19.6` | `Jest / Supertest` |
| `execution-budget-management/REQ-19.7` | `Jest / Vitest` |
| `execution-budget-management/REQ-19.9` | `Jest / Supertest` |

- [x] 15.1 除外一覧の道具名を実体へ揃える
  - 上表 9 件の `alternativeVerification.tool` から、実在しない `Jest` を取り除く
  - **先例に揃えること**: site-survey は Task 115.121 で自機能分 32 件を「道具名の先頭 `Jest` を `Vitest` へ置換し、`React Testing Library` / `Supertest` などの併記部分は据え置く」形で是正した。`.kiro/specs/site-survey/design.md` の `**あわせて是正した除外一覧の記述**` に続く項が、その形を逐語で記録している
  - **`Jest / Vitest` の 3 件（`REQ-18.1` / `REQ-18.3` / `REQ-19.7`）は、`Jest` を落とすだけで `Vitest` になる。** 先頭を置換すると `Vitest / Vitest` という重複になるため、置換ではなく除去であること
  - **`Jest / Supertest` の 6 件は併記の `Supertest` が実在する**（`backend/package.json` に `supertest@^7.1.4`。2026-09-02 に実測）ため据え置いてよい
  - **道具名だけを機械的に置換して終えないこと。** 除外は受入基準を分母から丸ごと外すため、`description` が約束する代替検証が現に存在するかを一件ずつ確かめること。存在しないなら道具名の是正ではなく除外の取り下げが要る
  - **JSON の整形は `npm run format:check` では見られない。** リポジトリルートの `format:check` は `prettier --check "e2e/**/*.{js,ts}" "playwright.config.{js,ts}" "scripts/**/*.ts"` であって JSON を含まず、`lint-staged` も `*.{js,ts}` だけを対象とする（2026-09-02 に実測）。`npx prettier --check e2e/requirement-exclusions.json` を直接走らせること（現況は整形済みで終了コード 0。同日に実測）
  - **検証**: `npm run check:req-exclusions` が緑であること、および上の `node -e` の出力の第一値が本スペックの件数だけ減っていること
  - **本節が `_Requirements:` を持たないのは意図である。** 本スペックの tasks.md は HEAD（コミット `9e63637`）で `_Requirements:` を 37 件持ち、`_Depends:` と `_Boundary:` はいずれも 0 件である（`git show HEAD:.kiro/specs/execution-budget-management/tasks.md | grep -c '_Requirements:'` ほか。2026-09-02 にリポジトリルートで実測）。**本節は受入基準を実装せず、除外一覧の記録の道具名を実体へ揃えるだけである。** 上表の id を `_Requirements:` に挙げると「当該受入基準を本タスクが被覆した」という偽の申告になり、被覆の集計にも入りうるため、依存と境界だけを書く
  - _Depends: site-survey スペックの Task 115.280（`64 0` の宣言の解除と台帳の追随）、16.1、16.2_
  - **16 の完了後に着手すること**（2026-09-29 の起票で追加）。着手時（HEAD `cb04eeb5`）の確認で、9 件のうち 8 件（18.3、19.2〜19.7、19.9）は代替検証の実在を確かめた。REQ-18.1 は 16.1 が補う
  - _Boundary: 本スペックが所管する除外項目の `alternativeVerification.tool`_

## タスク16: 除外一覧が約束する金額精度の検証の欠落と、案分の丸めの誤差を正す

**経緯**: Task 15.1 の着手時（2026-09-29、HEAD `cb04eeb5`）に、除外 9 件の代替検証を一件ずつ確かめたところ、`execution-budget-management/REQ-18.1`（`description`「金額計算で Decimal 型が使われ、浮動小数点誤差が起きないことを確認」、threshold `decimal_precision: exact`）の検証が**一部しか無い**ことが分かった。あわせて、案分の検証が**誤差を含む値を正解として固定している**ことが分かった。利用者の判断（2026-09-29）により、検証を補い、案分の誤差を調査して不具合なら直す。

**測った事実**（2026-09-29、HEAD `cb04eeb5`）:

- REQ-18.1: 列の型が Decimal であることは `backend/src/__tests__/unit/models/execution-budget.model.test.ts` と `execution-budget.migration.test.ts` が検証するが、**浮動小数点誤差が起きないことを主張する検証が無い**。`execution-budget.service.ts` の実行金額の計算を `Number` の掛け算に替える変異を当てても、`execution-budget.service.test.ts` は全件が緑のまま通る。誤差が表に出る入力は取りうる（数量は Decimal(15,4)。数量 `0.145` × 単価 `100` は Number で 14.499999999999998、Decimal で 14.5）
- 案分: `backend/src/__tests__/unit/services/order.service.test.ts` の「確定発注金額をチェック済み項目の実行金額比率で案分する」は、実行金額 100000 / 200000・確定発注金額 270000 に対して `89999` / `180001` を正解として固定している。注記は「floor(100000/300000 * 270000) = floor(89999.999...) = 89999」。**正確な比率の案分は 90000 / 180000 で割り切れる**。比率を先に有限桁（decimal.js の既定 20 桁）で丸めてから掛けるため、誤差が生じていると推定される。Requirement 8 の受入基準 3（実行金額の比率で案分）・4（1 円未満の端数は最大の項目に加算）と Requirement 18 の受入基準 1・3 に照らして疑わしい

- [x] 16.1 金額計算で浮動小数点誤差が起きないことを検証する
  - 実行金額（数量 × 単価）など、本スペックの金額計算が Decimal で行われ、浮動小数点では誤差が出る入力（例: 数量 `0.145` × 単価 `100`）でも正確な値になることを主張する検証を置く
  - 検証が意味を持つことを実測すること（計算を `Number` に替える変異で赤くなること）。既存の実装が既に正しければ検証の追加だけでよい
  - _Requirements: 18.1_
  - _Boundary: 本スペックの金額計算の精度の検証_

- [x] 16.2 案分計算の丸めの誤差を調査し、不具合なら正す
  - `order.service.ts` の案分が比率を先に丸めてから掛けているかをコードで確かめる。不具合であれば、掛け算を先に行い最後に割る（または同等に誤差の出ない）形へ改め、上の例で 90000 / 180000 となるようにする。端数の加算（Requirement 8 の受入基準 4）と合計の一致（Requirement 18 の受入基準 3）を保つこと
  - 挙動の修正となる場合は RED → GREEN で進めること。誤差を含む値を固定している既存の検証は、正確な値の主張へ改める（検証を消さないこと）
  - 同じ形（比率を先に丸める）の計算が本スペックの他の箇所（出来高・原価・月次締めなど）にあれば併せて確かめ、報告すること
  - _Requirements: 8.3, 8.4, 18.1, 18.3_
  - _Boundary: 本スペックの案分計算とその検証_

- [x] 16.3 出来高入力画面の出来高率を backend と同じ精度で算出する
  - **経緯**: 16.1 の実装とレビュー（2026-09-29、HEAD `6f37f358`）が、`frontend/src/pages/ProgressInputPage.tsx` の `calcProgressRate`（67 行付近）・合計の `reduce`（318 行付近）・`totalProgressRate`（323 行付近）が `Number` で計算していることを確かめた。出来高 23000 ÷ 実行金額 80000 で、画面は `'28.7'`、backend は `'28.8'` を返し、**同じ値の表示が画面と応答で食い違う**（node で実測）
  - Requirement 18 の受入基準 1（金額計算に高精度 10 進数演算を使う）と受入基準 4（出来高率を小数点以下 1 桁で表示）に照らし、backend と同じ規則（decimal.js の既定の ROUND_HALF_UP、`toFixed(1)`）で算出すること。frontend で decimal.js が使えるか（依存にあるか）を確かめ、無ければ依存の追加の是非を報告すること（lockfile のずれの前例に注意）
  - 挙動の修正であるため RED → GREEN で進めること。単体で `'28.8'` を主張するとともに、画面の表示を E2E で確かめること。計算順に左右されない入力（例 15 / 10000 → `'0.2'`）も併用する
  - 同じページの `Math.round(executionAmount * 0.5 / 0.05)`（392・409・418 行付近）も同じ観点で確かめ、報告すること
  - _Requirements: 18.1, 18.4_
  - _Boundary: 出来高入力画面の出来高率の算出とその検証_

## タスク17: 案件の閲覧範囲（user-authentication の要件39）と出力の記録（同 要件40）を本スペックの API と出力へ適用する（user-authentication の機能検証からの起票。利用者の判断で起票、2026-10-25）

**経緯**: IPA の注意喚起（2026-10-09）の是正で、user-authentication が要件39（案件単位の閲覧範囲）と要件40（認証・アカウント操作とデータ出力の監査記録）を設け、判定の部品（backend/src/services/project-scope.service.ts の `evaluateProjectAccess`・`buildProjectScopeWhere`、backend/src/middleware/project-scope.middleware.ts の `requireProjectScope`）と出力の記録の手段（backend/src/services/export-audit.service.ts の `ExportAuditService`）を実装した（同スペックのタスク52.1・53.3）。同スペックが適用したのは案件そのもの（`/api/projects`、タスク52.3）だけである。同スペックの design.md の Boundary Commitments の Out of Boundary は、各業務機能の API への `requireProjectScope` の適用と子リソースから案件 ID を引く解決関数、出力処理からの記録の呼び出しを各 spec の所管と定め、是正計画（docs/security/ipa-alert-20261009-remediation-plan.md）の §5.7 が本スペックの項目（発注と月別出来高のエクスポートの記録、閲覧範囲の適用）を挙げる。同スペックの機能検証（2026-10-25、HEAD `b85b8124`）が、どの所管 spec にも適用のタスクが無く、本スペックの API が案件の範囲を判定しない（担当外の利用者が他の案件の実行予算・発注・出来高・原価を読み書きできる）ことと、出力が記録を経ないこと（`ExportAuditService.record` の呼び出し元は監査ログの経路だけ）を確かめた。利用者の判断（2026-10-25、案 A）で各所管 spec へ起票する（site-survey の Task 115.347 と同じく、上流の user-authentication からの起票）

- [x] 17.1 本スペックの API に案件の閲覧範囲（user-authentication の要件39）を適用し、子リソースの所属を照合する
  - 対象（2026-10-25、HEAD `b85b8124` の実測。行は経路の定義の行。いずれも `/api/projects/:projectId/execution-budget` の配下に載る。着手時に測り直すこと）:
    - backend/src/routes/execution-budget.routes.ts: `POST /`（53）、`GET /`（105）、`DELETE /`（143）、`PATCH /items/:itemId`（189）、`GET /unreflected-amendments`（230）、`GET /amendment-diff/:contractId`（266）、`POST /apply-amendment`（319）
    - backend/src/routes/order.routes.ts（`…/orders`）: `GET /`（68）、`POST /`（107）、`GET /:orderId`（157）、`PATCH /:orderId`（188）、`PUT /:orderId/items`（229）、`PATCH /:orderId/status`（270）、`DELETE /:orderId`（321）
    - backend/src/routes/progress.routes.ts（`…/progress`）: `GET /monthly`（56）、`GET /monthly/:yearMonth`（103）、`POST /`（154）、`GET /`（214）、`GET /:date`（253）、`DELETE /:progressRecordId`（303）
    - backend/src/routes/cost-monthly-close.routes.ts: `PATCH /items/:itemId/cost`（63）、`POST /monthly-close`（104）、`GET /monthly-close`（166）
    - backend/src/routes/export.routes.ts: `GET /orders/:orderId/export`（66）、`GET /progress/monthly/export`（116）
  - 経路の `projectId` を `projectIdFromParam` で読み、`requirePermission` の後に `requireProjectScope` を置く（user-authentication の design.md の「ProjectScopeGuard（`requireProjectScope`）」の節。前に置くと権限なしの 403 を主張する既存の統合テストが 404 で落ちる〔同スペックの tasks.md の Implementation Notes の 52.2 の区分 D〕）。範囲外と不在は同じ汎用の 404（`NOT_FOUND`）にし、本文に案件 ID など存在を推測できる情報を含めない（39.2）
  - **子リソースの所属の照合**: 経路の `itemId`・`orderId`・`progressRecordId`・`contractId` が経路の `projectId` の案件に属するかを確かめ、属さない組み合わせは不在と同じ 404 にする（contract-management の是正計画 §5.11 と同じ形。範囲内の案件の ID を経由して範囲外の子を操作できないようにする）
  - 挙動の変更であるため RED → GREEN で進める。統合テストで、担当外の利用者の要求と所属しない子の ID が不在と同じ 404 になり DB が変わらないこと、担当者・作成者・全案件閲覧の権限では従来どおりであることを主張する。E2E で担当外の利用者が実行予算の URL を直接開くと見つからない扱いになることを確かめる
  - 本スペックの受入基準として持つか（是正計画 §4 は、各業務 spec が自分の適用箇所を受入基準として持つとする）は requirements.md の改訂と被覆の印を伴うため、着手時に利用者の判断を得る
    - **判断の結果（2026-10-27、利用者の判断）**: 本スペックの受入基準として持つ。requirements.md に Requirement 20（案件の閲覧範囲と出力の記録の適用）を新設した。本タスクの適用は 20.1〜20.6 が受ける。子リソース（`itemId`・`orderId`・`progressRecordId`・`contractId`）が経路の案件に属さなければ不在と同じ 404 でデータを変えない（20.4）、一括の要求（発注のチェック済み項目の更新、出来高の保存）は属さない項目が一つでも含まれれば要求全体を 404 で書き込みなし（20.5）と条文に定めた。案件の範囲を含意する既存の条文として要件 17.1〜17.6（ロールだけで許可を定めていた）を改訂し、改訂の記録（採らなかった案: 条文を変えず design.md だけで読み替える案）を requirements.md の Requirement 17 の下に残した。design.md は「Requirement 20: 案件の閲覧範囲と出力の記録の適用」章を足し、Security Considerations の当初の記述は記録として残して置き換えを書き添えた。被覆の印は本タスクの統合テスト・E2E が名乗る（新設時点では未被覆）
  - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_
  - _Boundary: 本スペックの API の案件の範囲の判定と子リソースの所属の照合_

- [x] 17.2 発注と月別出来高の出力に記録（user-authentication の要件40）を適用する
  - 対象（2026-10-25 の実測）: サーバーで生成する backend/src/routes/export.routes.ts の `GET /orders/:orderId/export`（66。画面は frontend/src/pages/OrderDetailPage.tsx の `handleExport`）と `GET /progress/monthly/export`（116。画面は frontend/src/pages/ProgressInputPage.tsx の `handleExportExcel`・`handleExportPdf`）。種別 `order_export`・`progress_export`
  - ハンドラーが生成の前に `ExportAuditService.record`（実行者・種別・案件・対象・件数）を呼ぶ（40.9。user-authentication の design.md の「ExportAuditService と ExportAuditClient」の節の、サーバー側で生成する出力は各業務 spec がハンドラーから直接呼ぶ、の定め）。記録が失敗したときの応答（出力を返さない）は同節に照らして決める
  - 挙動の変更であるため RED → GREEN で進め、統合テストで出力のたびに監査 `DATA_EXPORTED` が種別・案件つきで 1 件記録されること、記録の失敗時の応答を主張し、E2E で画面からの出力が記録を残すことを確かめる
  - **判断の結果（2026-10-27、利用者の判断。17.1 の判断と同じ）**: 本タスクの適用は Requirement 20 の 20.7・20.8 が受ける。出力はサーバーで生成するため、記録はハンドラーがファイルの生成の前に 1 回行い（20.7）、記録の失敗ではファイルを生成せず返さずにエラーを返し、画面はダウンロードを始めず「出力を記録できなかったため中止しました」を表示する（20.8）と条文に定めた。応答の形（500・`detail`・識別子）は design.md の同章の「記録の失敗の応答」に記した。被覆の印は本タスクの統合テスト・E2E が名乗る（新設時点では未被覆）
  - _Requirements: 20.7, 20.8_
  - _Boundary: 発注と月別出来高の出力の経路の記録_
  - _Depends: 17.1_

## タスク18: 子・契約・一括の項目の食い違いの記録（user-authentication の要件39.8 の適用。利用者の判断で起票、2026-10-29）

**経緯**: user-authentication が要件39.8 を加え、経路の案件（または親のデータ）と対象の実際の案件（または親のデータ）が食い違う要求のうち、実際の案件が閲覧範囲外のものを要件39.7 の記録の対象とした（利用者の判断、2026-10-29「推奨案で進める」。同 spec の design.md の ProjectScopeGuard の節の「各業務 spec への起票先」の execution-budget-management の行）。本スペックの子リソースの所属の照合（backend/src/middleware/execution-budget-project-scope.middleware.ts の `requireChildInProject`〔89〜108 行付近、食い違いの分岐は 99 行付近〕）と一括の照合（同ファイルの `requireBodyExecutionBudgetItemsInProject`〔151〜178 行付近、件数の照合は 166〜172 行付近〕）、契約の所属の照合（backend/src/services/execution-budget.service.ts の `create`〔290〜297 行付近〕・`getAmendmentDiff`〔909〜915 行付近〕・`applyAmendment`〔1043〜1050 行付近〕）は、食い違いを不在として扱い、実際の案件を判定せず記録しない。行は同日の実測で、着手時に測り直すこと。requirements.md に 20.9 を加え（20.4・20.5 の条文は改訂しない。理由は design.md の末尾の章の「受入基準の置き場所の判断」）、design.md の末尾の章「2026-10-29 の追加: 食い違いの記録・不在の表示」に設計を置き、Requirement 20 章の「適用の決定」の記録しないとする項に改訂の注記を置いた

- [ ] 18.1 子リソースの所属の照合と一括の照合で、実際の案件が範囲外なら記録する
  - `requireChildInProject` は、子が実在し経路の `projectId` と異なる案件に属するとき、汎用の 404 を返す前に上流の `recordProjectMismatchIfOutOfScope(req, 子の案件 ID)` を待つ。子が無いときは従来どおり記録しない。3 つの照合の部品（`requireExecutionBudgetItemInProject`・`requireOrderInProject`・`requireProgressRecordInProject`）は上流の `ProjectScopeGuardOptions` を受け取れるようにする
  - `requireBodyExecutionBudgetItemsInProject` は、件数の照合で欠けたときだけ、属さない項目が実際に属する案件の ID を重複なく引き、案件ごとに一度ずつ `recordProjectMismatchIfOutOfScope` を呼んでから汎用の 404 を返す。存在しない項目は記録しない。通る要求の問い合わせと、対象 0 件を照合せずに通すことは変えない
  - 子・項目と親の実行予算の論理削除は区別しない（design.md の同章の「決定」）。応答は範囲の内外にかかわらず従来どおり汎用の 404 で、データを変えない。同ファイルの冒頭の注釈（`@fileoverview`）の、所属しない子を記録しないとする記述を改める
  - **既存のテストの書き換え**（条文どおりに。主張を消さない）: 単体テスト（backend/src/__tests__/unit/middleware/execution-budget-project-scope.middleware.test.ts）の「…他の案件に属するか不在なら同じ汎用の 404 にして記録しない」（142 行付近。実行予算項目・発注・出来高記録の 3 通り）を、他の案件が範囲外なら記録 1 件（対象は子の実際の案件）で 404、範囲内なら記録なしで 404、不在なら記録なしで 404 へ改め、題名も改める。一括の照合のテスト（168・204 行付近）に、範囲外の案件ごとに 1 件の記録と不在の項目で記録の無いことを足す。統合テスト（backend/src/__tests__/integration/execution-budget-project-scope.api.integration.test.ts）の「経路の案件に属さない実行予算項目・発注・出来高記録は、存在しない ID と同じ 404 になり」（717 行付近）は、案件 other を範囲外とする工事担当者と範囲内とする全案件閲覧の権限の利用者の両方で記録 0 件を主張しており（791〜795 行付近）、工事担当者の分は範囲外の食い違いで 20.9 と直接に矛盾する（2026-10-29 に現物で確かめた。fixture は案件 other の営業担当者・作成者を担当外の利用者とし、工事担当者は案件 other の関係者でない）。工事担当者は食い違いの要求の数だけ記録が増え（対象は案件 other）、全案件閲覧の権限の利用者は増えないことの主張へ改める。一括の要求のテスト（878 行付近の describe）に同じ二人の記録の増減の主張を足す。記録の数は利用者ごとの前後の差で数える
  - E2E（e2e/specs/execution-budget/execution-budget-project-scope.spec.ts の「自分の案件の経路で他の案件の発注・項目を指すと」〔401 行付近〕）に、範囲外の案件の発注・項目・出来高記録と一括の項目を指す要求で監査の記録が増えることの主張を足し、`@requirement execution-budget-management/REQ-20.9` と上流の 39.8 の被覆の印（user-authentication のタスク63.2 の申し送り）を置く
  - 挙動の変更であるため RED → GREEN で進める。上流の 63.1 が入る前に着手しない
  - 単体・統合・E2E で、子と一括の項目の食い違いが範囲外のときだけ記録され、どの場合も従来どおり汎用の 404 でデータが変わらない状態になる
  - _Depends: user-authentication の Task 63.1_
  - _Requirements: 20.9_
  - _Boundary: requireChildInProject と requireBodyExecutionBudgetItemsInProject と、それらの記録を主張する本スペックのテスト_

- [ ] 18.2 契約の所属の照合で、他の案件の契約の案件が範囲外なら記録する
  - `ExecutionBudgetService` に注入できる `projectScope`（既定は user-authentication の共有のインスタンスの `evaluateProjectAccess`）と監査の記録の手段を足し、`create`・`getAmendmentDiff`・`applyAmendment` が実行者の ID と要求の識別（経路が `projectScopeDenialContextOf` で切り出す）を受け取るようにする。呼び出し元の経路（backend/src/routes/execution-budget.routes.ts の実行予算の作成・変更契約の項目差分・変更契約の反映）が渡す
  - 契約が実在し論理削除されておらず、契約の案件が経路の `projectId` と食い違うときだけ契約の案件を判定し、範囲外なら処理の後に `withSurveyScopeDenialRecording` で 1 回記録する（トランザクションの外で書く）。応答は判定の結果に関わらず従来どおりの契約の不在の例外（`ContractNotFoundForBudgetError`・`AmendmentContractNotFoundError`）とし、何も書き込まない。契約の不在・論理削除は記録しない。契約の種別と見積書の有無は記録の条件に含めない（design.md の同章の「決定」）
  - 既存の単体テスト（backend/src/__tests__/unit/services/execution-budget.service.test.ts）の他の案件の契約の扱いの主張が判定の模擬を要するかを着手時に確かめ、要すれば主張を消さずに模擬を足す。統合テストの「経路・要求本文の契約が経路の案件に属さなければ、存在しない契約と同じ 404 になり」（800 行付近）に、工事担当者で記録が 3 件増え（対象は案件 other）、全案件閲覧の権限の利用者と存在しない契約で増えないことの主張を足し、範囲外の案件の論理削除済みの契約で増えないことを足す。被覆の印 `@requirement execution-budget-management/REQ-20.9` を置く
  - 挙動の変更であるため RED → GREEN で進める。上流の 63.1 には依存しない（既存の判定と記録の部品を使う）
  - 単体・統合で、他の案件の契約を指す要求が範囲外のときだけ記録され、応答と DB が従来どおりである状態になる
  - _Requirements: 20.9_
  - _Boundary: ExecutionBudgetService の create・getAmendmentDiff・applyAmendment の契約の所属の照合と、その呼び出し元の経路_

## タスク19: 実行予算の画面が 404 を受けたときの不在の表示（利用者の判断で起票、2026-10-29）

**経緯**: 利用者の判断（2026-10-29「推奨案で進める」）で起票する。Requirement 20.2 により閲覧範囲外のプロジェクトの実行予算・発注への要求は不在と同じ 404 になるが、画面は 404 を分類しない（2026-10-29 の調査。行は同日の実測で、着手時に測り直すこと）: `frontend/src/api/execution-budget.ts` の `getExecutionBudget`（237〜251 行付近）が 404 を null に変えるため、`ExecutionBudgetPage.tsx` は閲覧できない案件や存在しない案件でも実行予算が未作成である旨と作成の釦を出す（722〜740 行付近）。同画面のエラーの状態は値を捨てており（580 行付近）、作成・月次締め・契約書の一覧の取得の失敗（641・696・709 行付近）はどこにも表示されず、削除・原価の入力は `ApiError` の `message` をそのまま表示する（655・675 行付近）。`ExecutionBudgetAmendmentPage.tsx` は同じ関数で未作成と扱い未反映の変更契約が無い旨を出し、項目差分の取得と反映の失敗で `message` を表示する（262・290 行付近）。`OrderDetailPage.tsx` は発注の取得の失敗で `message`（汎用の 404 では英語の文言）を既定の発注が見つからない旨より優先して表示し（344・629 行付近）、作成・ステータスの変更・削除は `message` を表示し（545・430・457・472・497 行付近）、取得の後の編集・チェック済み項目の更新・取引先の変更の失敗（384・399・560 行付近）は表示されない状態に入れる。`ProgressInputPage.tsx` は読み込みの失敗のトーストと実行予算が見つからない旨を出し（384・597 行付近）、保存・取り除きの失敗は汎用の文言を出す（480・532 行付近）。サーバーの応答は変えない（user-authentication の要件39.2）。requirements.md に Requirement 21（21.1・21.2）を加え、design.md の末尾の章「2026-10-29 の追加: 食い違いの記録・不在の表示」に設計を置いた

- [ ] 19.1 実行予算・変更契約の反映・発注詳細・出来高入力の画面と各操作で、404 を見つからない旨の表示にする
  - 404 を見つからない種別に分類し対象ごとの日本語の文言を返す部品を足す（置き場所は実装時に決める。汎用の 404 は発注詳細の画面と発注の操作では発注、それ以外ではプロジェクト。本体の 404 の符号はそれぞれの対象。応答の `detail` は表示しない）
  - **未作成と案件の不在の見分け**: 実行予算の取得が 404（`getExecutionBudget` が null）のときに限り案件を取得し（`getProject`）、案件の取得も 404 なら共通部品 `ResourceNotFound`（`frontend/src/components/common/ResourceNotFound.tsx`。対象はプロジェクト、戻り先はプロジェクトの一覧）を表示し、未作成の表示と作成の釦を出さない。案件が取得できれば従来の未作成の表示にする。案件の取得が 404 以外で失敗したら作成の釦を出さず読み込みの失敗を表示する。サーバーの応答と `getExecutionBudget` の振る舞いは変えない。変更契約の反映の画面と出来高入力の画面も同じ見分けを使う（出来高入力の画面は履歴・月別出来高の取得の 404 も見分けに掛け、案件の不在ならトーストを出さない）。見分けの処理は一か所に置く
  - 発注詳細の画面は発注の取得の 404 で `ResourceNotFound`（対象は発注、戻り先はその案件の実行予算の画面）を表示し、応答の文言を既定の文言より優先する表示をやめる
  - 操作（実行予算の作成・削除・原価の入力・月次締め、変更契約の項目差分の取得と反映、発注の作成・編集・チェック済み項目の更新・ステータスの変更・取り除き、出来高の保存・出来高記録の取り除き）の 404 で見つからない旨のメッセージを画面に表示する。実行予算の画面に作成・月次締めの失敗の表示欄を、発注詳細の画面に取得の後の編集・チェック済み項目の更新の失敗の表示欄を設ける（404 以外の失敗も従来コードが設定していた文言で表示されるようになることを許容する。design.md の同章の「決定」）。409・422 と 404 以外の失敗の従来の文言、出力の失敗の表示（20.8 と出力の失敗の文言）、出来高入力の画面の施工日指定の取得・月別明細の取得の失敗の表示は保つ。文言の逐語は `ResourceNotFound` の見出しの形を流儀として design.md の同章の「決定」へ記す
  - 挙動の変更であるため RED → GREEN で進め、現状で赤になることを先に示す。単体（404 の分類、実行予算の画面が案件の 404 で `ResourceNotFound` を出し未作成の表示と作成の釦を出さないこと、案件が取得できれば従来の未作成の表示を出すこと、変更契約の反映・出来高入力・発注詳細の画面の読み込みの 404 の表示、各操作の 404 のメッセージ。404 以外の失敗の従来の文言は保つ）と E2E（担当外の利用者が実行予算の URL を開くとプロジェクトが見つからない旨とプロジェクトの一覧へのリンクが出て存在しない案件と同じ表示になり作成の釦が出ない、担当外の発注詳細の URL で発注が見つからない旨が出て英語の文言が出ない、開いた後に取り除かれた発注の操作で見つからない旨のメッセージが出る）で主張し、`@requirement execution-budget-management/REQ-21.1`・`REQ-21.2` の印を置く
  - **既存の E2E の書き換え**: e2e/specs/execution-budget/execution-budget-project-scope.spec.ts の「担当外の利用者が実行予算の URL を直接開くと存在しない案件と同じ表示になり」（259 行付近）は、存在しない案件と範囲外の案件の両方で実行予算が未作成である旨が見えることを主張している（283〜291 行付近）。21.1 で両方ともプロジェクトが見つからない旨の表示になるため、見える文言の主張をプロジェクトが見つからない旨へ改め、作成の釦が出ないことを足す（存在しない案件と同じ表示である比較の主張は消さない）。ほかに、変えた表示（実行予算が未作成である旨、発注が見つからない旨、実行予算が見つからない旨、データの取得の失敗・読み込みの失敗・出来高の保存の失敗・出来高記録の削除の失敗の文言、英語の Not found）を e2e/ 全体で grep して既存の E2E を選び、流す。単体テスト（`ExecutionBudgetPage.test.tsx`・`ExecutionBudgetAmendmentPage.test.tsx` ほか、各画面の失敗の文言の主張）も確かめる。frontend を変えたらテスト環境の frontend を作り直してから流す
  - 単体と E2E で、404 を受けた画面が見つからない旨を表示し、閲覧できない案件で実行予算の作成へ誘わず、応答の英語の文言と読み込み・操作の失敗の汎用の文言を出さない状態になる
  - _Requirements: 21.1, 21.2_
  - _Boundary: ExecutionBudgetPage, ExecutionBudgetAmendmentPage, OrderDetailPage, ProgressInputPage_

## Implementation Notes
- 16.1（2026-09-29）: 精度の検証の網羅は、design.md の構成要素（Service 6 つ → `execution-budget` / `order` / `progress` / `cost` / `monthly-close` / `order-export` / `progress-export` の 7 ファイル）から対象を決め、固定の grep の全ヒット行を RED / 同値 / 範囲外 / 対象外に理由付きで分類して突き合わせること。機能名の連想で対象を絞った 3 回が、毎回その回の指摘分だけを直す形になり差し戻された。Number の変異が区別できる入力は、2^53 を超える奇数の途中和（999999999999999×10 と 1 の並びの順序に注意）と、真値が二進で表せない比率（例 15/10000）で作る。fixture は案分の結果など実際に到達しうる状態であることを確かめる
- 機能検証 NO-GO の是正（2026-10-29、出力のダウンロード）: 9.2・10.3 が画面から到達できなかった原因は、`exportOrder`・`exportMonthlyProgress` が共通の API クライアントの `get` で応答を受け、JSON 以外の本文が `response.text()` で文字列になって `URL.createObjectURL` が型の誤りで失敗していたこと（発注詳細画面は無反応、出来高入力画面は成功でも失敗のトースト）。共通の API クライアント（frontend/src/api/client.ts）に成功の本文を Blob で受け取る口 `getBlob` を一か所設け（認証・401 の更新と送り直し・時間切れ・失敗の JSON の解析は既存の経路と共有し、`EXPORT_RECORD_FAILED` は `getApiErrorCode` で引き続き判別できる）、両関数と工程表の `exportSchedule` を切り替えた。発注詳細画面は記録の失敗以外の失敗も出力の失敗の表示欄に出す。単体のモックが Blob を返して素通りし、E2E が応答の状態だけを見ていたため検出できなかったので、E2E（出力の記録の spec）は `waitForEvent('download')` でファイル名と形式の先頭の符号を確かめる
