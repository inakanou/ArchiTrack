# Implementation Plan

## Tasks

- [x] 1. データベーススキーマとPrisma設定
- [x] 1.1 (P) EstimateRequestモデルの定義
  - 見積依頼のマスターデータを管理するテーブルを作成
  - プロジェクト、取引先、内訳書へのリレーションを設定
  - 見積依頼方法（EMAIL/FAX）のEnum型を定義
  - 論理削除（deletedAt）と楽観的排他制御（updatedAt）を実装
  - インデックス設定（projectId、tradingPartnerId、deletedAt、createdAt）
  - _Requirements: 8.1, 8.3, 8.4, 8.5_

- [x] 1.2 (P) EstimateRequestItemモデルの定義
  - 見積依頼で選択された内訳書項目の参照を保持するテーブルを作成
  - 見積依頼と内訳書項目へのリレーションを設定
  - 選択状態（selected）フラグを実装
  - ユニーク制約（estimateRequestId + itemizedStatementItemId）を設定
  - _Requirements: 8.2_

- [x] 1.3 マイグレーションの実行と検証
  - Prismaマイグレーションを作成して実行
  - 既存のItemizedStatementモデルにEstimateRequestリレーションを追加
  - 参照整合性制約（RESTRICT）の設定を確認
  - _Requirements: 8.1, 8.2_

- [x] 2. バックエンドサービス実装
- [x] 2.1 EstimateRequestServiceの基本CRUD操作
  - 見積依頼の作成機能を実装（内訳書項目の自動初期化を含む）
  - 見積依頼の取得機能を実装（単一取得・一覧取得）
  - 見積依頼の更新機能を実装（楽観的排他制御を含む）
  - 見積依頼の削除機能を実装（論理削除）
  - プロジェクト別のページネーション対応一覧取得を実装
  - 監査ログの記録を統合
  - _Requirements: 3.6, 8.1, 8.2, 8.3, 8.4, 8.5, 9.6_

- [x] 2.2 EstimateRequestServiceの項目選択管理
  - 項目の選択状態更新機能を実装
  - 他の見積依頼での選択状態を含む項目一覧取得を実装
  - 複数の見積依頼で選択されている場合の依頼先取引先名一覧を取得
  - _Requirements: 4.4, 4.5, 4.10, 4.11, 4.12_

- [x] 2.3 EstimateRequestTextServiceの実装
  - 見積依頼文（宛先、表題、本文）の生成機能を実装
  - 見積依頼方法（メール/FAX）に応じた宛先の出し分け
  - 表題のフォーマット（[プロジェクト名] 御見積依頼）
  - 本文の所定フォーマット生成
  - 「内訳書を本文に含める」オプションに応じた内容セクションの切り替え
  - 現場住所の表示
  - 連絡先未登録時のエラーハンドリング
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

- [x] 2.4 内訳書削除制約の追加
  - ItemizedStatementServiceに見積依頼紐付けチェックを追加
  - 見積依頼が紐付いている内訳書の削除を禁止
  - 適切なエラーメッセージを返却
  - _Requirements: 8.1_

- [x] 3. バックエンドAPI実装
- [x] 3.1 (P) Zodバリデーションスキーマの定義
  - 見積依頼作成・更新リクエストのバリデーションスキーマを定義
  - 項目選択更新リクエストのバリデーションスキーマを定義
  - 見積依頼方法のEnum型バリデーションを実装
  - _Requirements: 3.7_

- [x] 3.2 estimate-requests.routesの基本エンドポイント実装
  - POST /api/projects/:projectId/estimate-requests（作成）
  - GET /api/projects/:projectId/estimate-requests（一覧取得）
  - GET /api/estimate-requests/:id（詳細取得）
  - PUT /api/estimate-requests/:id（更新）
  - DELETE /api/estimate-requests/:id（削除）
  - 認証・認可ミドルウェアの適用
  - _Requirements: 3.6, 8.1, 9.3, 9.5, 9.6, 10.1, 10.2, 10.3, 10.4_

- [x] 3.3 estimate-requests.routesの追加エンドポイント実装
  - PATCH /api/estimate-requests/:id/items（項目選択更新）
  - GET /api/estimate-requests/:id/items-with-status（他依頼選択状態付き項目一覧）
  - GET /api/estimate-requests/:id/text（見積依頼文生成）
  - GET /api/estimate-requests/:id/excel（Excel出力）
  - _Requirements: 4.4, 4.5, 4.10, 5.1, 5.2, 6.1_

- [x] 4. TradingPartnerSelectコンポーネントの拡張
- [x] 4.1 filterTypesプロパティの追加
  - TradingPartnerSelectにfilterTypesプロパティを追加
  - 指定された取引先種別でフィルタリング可能にする
  - 既存の使用箇所への影響がないことを確認
  - _Requirements: 3.4_

- [x] 5. フロントエンドコンポーネント実装
- [x] 5.1 (P) EstimateRequestSectionCardの実装
  - プロジェクト詳細画面の見積依頼セクションを表示
  - 「新規作成」ボタンの表示と遷移処理
  - 「すべて見る」リンクの表示と遷移処理
  - QuantityTableSectionCardと同様のレイアウトを踏襲
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 5.2 (P) EstimateRequestListPageの実装
  - 見積依頼一覧画面のレイアウトを実装
  - パンくずナビゲーションの表示
  - 「新規作成」ボタンの配置
  - ページネーションの実装
  - 空リスト時のメッセージ表示
  - ItemizedStatementListPageと同様のパターンを踏襲
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [x] 5.3 EstimateRequestFormの実装
  - 見積依頼の作成・編集フォームを実装
  - 名前入力フィールドの実装
  - 宛先（取引先）選択フィールドの実装（協力業者のみ表示）
  - 参照内訳書選択フィールドの実装
  - 取引先検索機能の統合
  - 内訳書の項目数表示と項目0件の内訳書は選択不可
  - 必須項目のバリデーションとエラー表示
  - 協力業者/内訳書が存在しない場合のメッセージ表示
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 5.4 ItemSelectionPanelの実装
  - 内訳書項目の一覧表示とチェックボックスによる選択UI
  - チェックボックス変更時の自動保存（debounce処理）
  - 他の見積依頼で選択済みの項目の背景色変更（bg-orange-50）
  - 他の見積依頼の依頼先取引先名の表示（一番右の列）
  - 複数の見積依頼で選択されている場合の取引先名カンマ区切り表示
  - 「内訳書を本文に含める」チェックボックスの表示
  - 見積依頼方法（メール/FAX）ラジオボタンの表示
  - 項目が存在しない場合のメッセージ表示
  - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13_

- [x] 5.5 EstimateRequestTextPanelの実装
  - 見積依頼文（宛先、表題、本文）の表示UI
  - メールアドレス/FAX番号未登録時のエラー表示
  - Clipboard APIが利用不可の場合のフォールバック
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

- [x] 5.6 (P) ClipboardCopyButtonの実装
  - 宛先・表題・本文それぞれのコピーボタンを実装
  - クリップボードへのコピー処理
  - コピー完了のフィードバック表示
  - Clipboard API非対応時のフォールバック（テキスト選択状態）
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 5.7 (P) ExcelExportButtonの実装
  - Excel出力ボタンの実装
  - チェックした項目のみを含むExcelファイル生成
  - ファイルダウンロード処理
  - 項目未選択時のエラー表示
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 6. フロントエンドページ実装
- [x] 6.1 EstimateRequestCreatePageの実装
  - 見積依頼作成ページのレイアウトを実装
  - EstimateRequestFormの統合
  - 作成成功時の詳細画面への遷移
  - パンくずナビゲーションの表示
  - _Requirements: 3.6_

- [x] 6.2 EstimateRequestDetailPageの実装
  - 見積依頼詳細画面のレイアウトを実装
  - パンくずナビゲーションの表示
  - ItemSelectionPanelの統合
  - 「見積依頼文表示」ボタンとEstimateRequestTextPanelの統合
  - ExcelExportButtonの統合
  - 編集・削除ボタンの表示
  - 削除確認ダイアログの実装
  - _Requirements: 4.1, 9.1, 9.2, 9.4, 9.5_

- [x] 6.3 EstimateRequestEditPageの実装
  - 見積依頼編集ページのレイアウトを実装
  - EstimateRequestFormの統合（編集モード）
  - 更新成功時の詳細画面への遷移
  - _Requirements: 9.3, 9.6_

- [x] 7. ルーティングとナビゲーション統合
- [x] 7.1 フロントエンドルーティングの設定
  - 見積依頼関連のルートを追加
  - /projects/:projectId/estimate-requests（一覧）
  - /projects/:projectId/estimate-requests/new（作成）
  - /estimate-requests/:id（詳細）
  - /estimate-requests/:id/edit（編集）
  - _Requirements: 1.4, 1.5, 2.5_

- [x] 7.2 ProjectDetailPageへのセクション統合
  - EstimateRequestSectionCardをプロジェクト詳細画面に追加
  - 内訳書セクションの下に配置
  - _Requirements: 1.1_

- [x] 8. APIクライアント実装
- [x] 8.1 estimate-requests APIクライアントの実装
  - 見積依頼CRUD操作のAPIクライアント関数を実装
  - 項目選択更新のAPI呼び出し
  - 見積依頼文取得のAPI呼び出し
  - Excel出力のAPI呼び出し
  - エラーハンドリングの統一
  - _Requirements: 3.6, 4.4, 5.1, 6.1, 9.3, 9.5, 9.6_

- [x] 9. バックエンドテスト実装
- [x] 9.1 EstimateRequestServiceの単体テスト
  - 作成・取得・更新・削除の各機能テスト
  - 項目選択更新のテスト
  - 他の見積依頼での選択状態取得のテスト
  - 楽観的排他制御のテスト
  - エラーケースのテスト
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 9.2 EstimateRequestTextServiceの単体テスト
  - テキスト生成のテスト（メール/FAX両方）
  - 内訳書を本文に含める/含めないのテスト
  - 連絡先未登録時のエラーハンドリングテスト
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

- [x] 9.3 API統合テスト
  - 認証・認可フローのテスト
  - CRUD操作の統合テスト
  - 楽観的排他制御（409エラー）のテスト
  - 権限不足時のアクセス拒否テスト
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 10. E2Eテスト実装
- [x] 10.1 見積依頼作成フローのE2Eテスト
  - フォーム入力から保存、詳細画面遷移までのフロー
  - 協力業者/内訳書が存在しない場合のエラー表示確認
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 10.2 項目選択・テキスト表示のE2Eテスト
  - チェックボックス操作と自動保存の確認
  - 見積依頼文表示と各項目の確認
  - 他の見積依頼での選択状態表示の確認
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

- [x] 10.3 Excel出力・クリップボードコピーのE2Eテスト
  - Excel出力ダウンロードの確認
  - 各項目のクリップボードコピー動作確認
  - _Requirements: 5.1, 5.2, 5.3, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 10.4 編集・削除フローのE2Eテスト
  - 見積依頼の編集と保存の確認
  - 削除確認ダイアログと削除処理の確認
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 11. 受領見積書機能のデータベーススキーマ追加
- [x] 11.1 (P) ReceivedQuotationモデルの定義
  - 受領見積書のマスターデータを管理するテーブルを作成
  - 見積依頼へのリレーションを設定
  - テキストまたはファイルの排他的コンテンツ管理を実装
  - ファイル情報フィールド（パス、名前、MIMEタイプ、サイズ）を定義
  - 論理削除（deletedAt）と楽観的排他制御（updatedAt）を実装
  - インデックス設定（estimateRequestId、deletedAt、createdAt）
  - _Requirements: 11.1, 11.3, 11.4, 11.5, 11.6, 11.7, 11.11_

- [x] 11.2 (P) EstimateRequestStatusHistoryモデルの定義
  - ステータス変更履歴を管理するテーブルを作成
  - 見積依頼とユーザーへのリレーションを設定
  - 変更前ステータス（nullable）、変更後ステータス、変更者、変更日時を定義
  - インデックス設定（estimateRequestId、changedAt）
  - _Requirements: 12.11_

- [x] 11.3 EstimateRequestモデルにステータスフィールドを追加
  - EstimateRequestStatusのEnum型を定義（BEFORE_REQUEST、REQUESTED、QUOTATION_RECEIVED）
  - EstimateRequestモデルにstatusフィールドとデフォルト値を追加
  - ReceivedQuotation、EstimateRequestStatusHistoryへのリレーションを追加
  - statusカラムのインデックスを追加
  - Prismaマイグレーションを作成して実行
  - _Requirements: 12.2, 12.3_

- [x] 12. 受領見積書バックエンドサービス実装
- [x] 12.1 ReceivedQuotationServiceの実装
  - 受領見積書の作成機能を実装（テキストまたはファイルの排他的保存）
  - 受領見積書の取得機能を実装（単一取得・見積依頼別一覧取得）
  - 受領見積書の更新機能を実装（楽観的排他制御、ファイル変更時の旧ファイル削除）
  - 受領見積書の削除機能を実装（論理削除後にファイル物理削除）
  - StorageProviderを使用したファイルアップロード・削除
  - 署名付きURL生成（ファイルプレビュー用）
  - contentTypeとcontent（テキスト/ファイル）の整合性検証
  - ファイル形式（PDF、Excel、画像）とサイズ（10MB）のバリデーション
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 11.14, 11.15, 11.16_

- [x] 12.2 EstimateRequestStatusServiceの実装
  - ステータス遷移ルールの定義（依頼前→依頼済、依頼済→見積受領済、見積受領済→依頼済）
  - 許可された遷移の取得機能を実装
  - ステータス更新とトランザクション内での履歴記録
  - 無効な遷移に対するエラーハンドリング
  - ステータス変更履歴の取得機能を実装
  - 監査ログの記録を統合
  - _Requirements: 12.2, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11_

- [x] 13. 受領見積書・ステータス管理バックエンドAPI実装
- [x] 13.1 (P) Zodバリデーションスキーマの定義
  - 受領見積書作成・更新リクエストのバリデーションスキーマを定義
  - ステータス遷移リクエストのバリデーションスキーマを定義
  - ファイルアップロード（multipart/form-data）のバリデーションを定義
  - _Requirements: 11.10, 12.9_

- [x] 13.2 受領見積書エンドポイントの実装
  - POST /api/estimate-requests/:id/quotations（受領見積書作成、multipart）
  - GET /api/estimate-requests/:id/quotations（受領見積書一覧取得）
  - GET /api/quotations/:id（受領見積書詳細取得）
  - PUT /api/quotations/:id（受領見積書更新、multipart）
  - DELETE /api/quotations/:id（受領見積書削除）
  - GET /api/quotations/:id/preview（ファイルプレビューURL取得）
  - multerによるファイルアップロード処理
  - 認証・認可ミドルウェアの適用
  - _Requirements: 11.1, 11.2, 11.9, 11.12, 11.13, 11.14, 11.15, 11.16, 11.17_

- [x] 13.3 ステータス管理エンドポイントの実装
  - PATCH /api/estimate-requests/:id/status（ステータス遷移）
  - GET /api/estimate-requests/:id/status-history（ステータス変更履歴取得）
  - 認証・認可ミドルウェアの適用
  - _Requirements: 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11_

- [x] 13.4 見積依頼一覧・詳細APIにステータス情報を追加
  - GET /api/projects/:projectId/estimate-requestsのレスポンスにステータスを含める
  - GET /api/estimate-requests/:idのレスポンスにステータスと受領見積書数を含める
  - _Requirements: 12.1, 12.4, 12.12_

- [x] 14. 受領見積書フロントエンドコンポーネント実装
- [x] 14.1 (P) ReceivedQuotationFormの実装
  - 受領見積書登録・編集フォームのレイアウトを実装
  - 受領見積書名入力フィールドの実装
  - 提出日入力フィールドの実装
  - テキスト入力とファイルアップロードの排他的選択UIを実装
  - ファイル選択時のプレビュー表示（ファイル名、サイズ）
  - ファイル形式（PDF、Excel、画像）とサイズ（10MB）のクライアント側バリデーション
  - 必須項目のバリデーションとエラー表示
  - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.10, 11.15_

- [x] 14.2 (P) ReceivedQuotationListの実装
  - 登録済み受領見積書の一覧表示
  - 「受領見積書登録」ボタンの表示
  - 受領見積書名、提出日、登録日時の表示
  - ファイルタイプに応じたアイコン表示（PDF、Excel、画像）
  - ファイルプレビューリンクの表示と署名付きURLを使用したプレビュー
  - 編集・削除アクションボタンの表示
  - 削除確認ダイアログの実装
  - _Requirements: 11.1, 11.11, 11.12, 11.13, 11.14, 11.16, 11.17_

- [x] 15. ステータス管理フロントエンドコンポーネント実装
- [x] 15.1 (P) StatusBadgeの実装
  - ステータスをバッジ形式で表示
  - ステータスごとの色分け（依頼前: グレー、依頼済: ブルー、見積受領済: グリーン）
  - サイズバリエーション（sm、md、lg）のサポート
  - アクセシビリティ対応（aria-live通知）
  - _Requirements: 12.1, 12.4, 12.12_

- [x] 15.2 (P) StatusTransitionButtonの実装
  - 現在のステータスに応じた遷移ボタンの表示制御
  - 依頼前のとき「依頼済にする」ボタンを表示
  - 依頼済のとき「見積受領済にする」ボタンを表示、「依頼前に戻す」は非表示
  - 見積受領済のとき「依頼済に戻す」ボタンを表示
  - ステータス遷移API呼び出しとローディング状態の管理
  - 更新完了時のトースト通知表示
  - _Requirements: 12.5, 12.6, 12.7, 12.8, 12.9, 12.10_

- [ ] 16. フロントエンドページ統合
- [ ] 16.1 EstimateRequestDetailPageへの受領見積書セクション追加
  - 見積依頼詳細画面にReceivedQuotationListを統合
  - 受領見積書登録フォーム（モーダル）の統合
  - 受領見積書の追加・編集・削除操作の統合
  - ファイルプレビュー機能の統合
  - _Requirements: 11.1, 11.2, 11.12, 11.14_

- [ ] 16.2 EstimateRequestDetailPageへのステータス管理追加
  - StatusBadgeによるステータス表示の統合
  - StatusTransitionButtonによるステータス遷移の統合
  - ステータス表示エリアのレイアウト調整
  - _Requirements: 12.1, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10_

- [ ] 16.3 EstimateRequestListTableへのステータス列追加
  - 一覧テーブルにステータス列を追加
  - StatusBadgeによるステータス表示
  - _Requirements: 12.12_

- [ ] 17. APIクライアント実装
- [ ] 17.1 (P) 受領見積書APIクライアントの実装
  - 受領見積書CRUD操作のAPIクライアント関数を実装
  - ファイルアップロード（multipart/form-data）対応
  - プレビューURL取得のAPI呼び出し
  - エラーハンドリングの統一
  - _Requirements: 11.1, 11.2, 11.9, 11.14, 11.15, 11.16_

- [ ] 17.2 (P) ステータス管理APIクライアントの実装
  - ステータス遷移のAPIクライアント関数を実装
  - ステータス変更履歴取得のAPIクライアント関数を実装
  - エラーハンドリングの統一
  - _Requirements: 12.9, 12.11_

- [ ] 18. バックエンドテスト実装
- [ ] 18.1 ReceivedQuotationServiceの単体テスト
  - 作成・取得・更新・削除の各機能テスト
  - テキストコンテンツとファイルコンテンツの排他的バリデーションテスト
  - ファイル形式・サイズバリデーションテスト
  - ファイルアップロード・削除のStorageProvider連携テスト
  - 署名付きURL生成テスト
  - 楽観的排他制御のテスト
  - エラーケースのテスト
  - _Requirements: 11.1, 11.7, 11.8, 11.9, 11.10, 11.14, 11.15, 11.16_

- [ ] 18.2 EstimateRequestStatusServiceの単体テスト
  - ステータス遷移ルールのテスト
  - 許可された遷移の取得テスト
  - ステータス更新と履歴記録のテスト
  - 無効な遷移のエラーテスト
  - ステータス変更履歴取得テスト
  - _Requirements: 12.2, 12.5, 12.6, 12.7, 12.8, 12.9, 12.11_

- [ ] 18.3 受領見積書・ステータスAPI統合テスト
  - 認証・認可フローのテスト
  - 受領見積書CRUD操作の統合テスト
  - ファイルアップロード（multipart）のテスト
  - ステータス遷移の統合テスト
  - 楽観的排他制御（409エラー）のテスト
  - 権限不足時のアクセス拒否テスト
  - _Requirements: 11.9, 11.10, 12.9, 12.10_

- [ ] 19. E2Eテスト実装
- [ ] 19.1 受領見積書登録フローのE2Eテスト
  - 受領見積書登録ボタンクリックからフォーム表示の確認
  - テキスト入力による登録フロー
  - ファイルアップロードによる登録フロー
  - テキストとファイルの排他選択の確認
  - 必須項目バリデーションの確認
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.9, 11.10_

- [ ] 19.2 受領見積書一覧・編集・削除のE2Eテスト
  - 登録済み受領見積書の一覧表示確認
  - ファイルプレビュー動作確認
  - 受領見積書の編集と保存の確認
  - 削除確認ダイアログと削除処理の確認
  - _Requirements: 11.11, 11.12, 11.13, 11.14, 11.15, 11.16, 11.17_

- [ ] 19.3 ステータス管理のE2Eテスト
  - 詳細画面でのステータス表示確認
  - 依頼前から依頼済への遷移確認
  - 依頼済から見積受領済への遷移確認
  - 見積受領済から依頼済への遷移確認
  - 依頼済から依頼前への遷移不可の確認
  - ステータス遷移後のフィードバック表示確認
  - 一覧画面でのステータス表示確認
  - _Requirements: 12.1, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.12_
