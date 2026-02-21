# Implementation Plan

## 既存実装タスク（完了済み）

> 以下のタスクは初期実装時に完了済みです。差分実装タスクは「差分実装タスク」セクションを参照してください。

<details>
<summary>Task 1〜20: 既存タスク（クリックで展開）</summary>

## Task 1: データベーススキーマとモデル基盤

- [x] 1.1 (P) プロジェクトステータスとトランジション種別のEnum定義
  - ProjectStatus Enum（12種類: PREPARING, SURVEYING, ESTIMATING, APPROVING, CONTRACTING, CONSTRUCTING, DELIVERING, BILLING, AWAITING, COMPLETED, CANCELLED, LOST）を定義
  - TransitionType Enum（4種類: initial, forward, backward, terminate）を定義
  - ステータスの日本語ラベルマッピングを実装
  - _Requirements: 10.1, 10.11_

- [x] 1.2 (P) Projectモデルのスキーマ定義
  - プロジェクトテーブル（id, name, tradingPartnerId, salesPersonId, constructionPersonId, siteAddress, description, status, createdAt, updatedAt, deletedAt, createdById）を定義
  - Userモデルとのリレーション（salesPerson, constructionPerson, createdBy）を設定
  - TradingPartnerモデルとのリレーション（外部キー参照）を設定
  - 検索・フィルタリング・ソート用インデックスを追加
  - 論理削除フィールド（deletedAt）を設定
  - _Requirements: 1.14, 9.7, 13.1, 13.2, 13.4, 13.6, 13.8, 22.8_

- [x] 1.3 ProjectStatusHistoryモデルのスキーマ定義
  - ステータス履歴テーブル（id, projectId, fromStatus, toStatus, transitionType, reason, changedById, changedAt）を定義
  - Projectモデルとのリレーション（onDelete: Cascade）を設定
  - Userモデルとのリレーション（changedBy）を設定
  - 履歴検索用インデックスを追加
  - 1.2のProjectモデルが必要
  - _Requirements: 10.10, 10.11, 10.15_

- [x] 1.4 データベースマイグレーションの実行
  - Prismaマイグレーションファイルを生成
  - Prisma Clientを再生成
  - 1.1〜1.3のスキーマ定義が完了している必要がある
  - _Requirements: 1.14_

## Task 2: 権限設定

- [x] 2.1 プロジェクト権限の追加
  - 既存Permissionテーブルに「project:create」「project:read」「project:update」「project:delete」権限を追加
  - シードデータまたはマイグレーションで権限を登録
  - 適切なロールに権限を割り当て
  - _Requirements: 12.5_

## Task 3: バックエンドサービス層の実装

- [x] 3.1 (P) プロジェクト用カスタム例外クラスの実装
  - ProjectNotFoundError（プロジェクト未存在時）を実装
  - ProjectValidationError（バリデーションエラー時）を実装
  - ProjectConflictError（楽観的排他制御エラー時）を実装
  - InvalidStatusTransitionError（無効なステータス遷移時）を実装
  - ReasonRequiredError（差し戻し理由未入力時）を実装
  - _Requirements: 8.6, 10.9, 10.14_

- [x] 3.2 (P) プロジェクト用バリデーションスキーマの実装
  - CreateProjectInput用Zodスキーマを実装（name: 1-255文字必須、tradingPartnerId: UUID任意、salesPersonId: UUID必須、constructionPersonId: UUID任意、siteAddress: 最大500文字任意、description: 最大5000文字任意）
  - UpdateProjectInput用Zodスキーマを実装
  - ProjectFilter用Zodスキーマを実装（search, status, createdFrom, createdTo）
  - PaginationInput用Zodスキーマを実装（page: 1以上、limit: 1-100）
  - SortInput用Zodスキーマを実装（field, order）
  - _Requirements: 13.1, 13.2, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10, 13.11_

- [x] 3.3 ProjectStatusServiceの実装
  - ステータス遷移ルールマップ（順方向・差し戻し・終端遷移）を定義
  - getAllowedTransitions: 現在のステータスから遷移可能なステータス一覧を取得
  - getTransitionType: 遷移種別（forward, backward, terminate）を判定
  - transitionStatus: ステータス遷移を実行し履歴を記録（トランザクション処理）
  - 差し戻し遷移時の理由必須チェックを実装
  - getStatusHistory: プロジェクトのステータス変更履歴を取得
  - 監査ログ連携（PROJECT_STATUS_CHANGED）を実装
  - 1.4のマイグレーション完了が必要
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.14, 10.15, 12.6_

- [x] 3.4 ProjectServiceの実装
  - createProject: プロジェクト作成（初期ステータス履歴含む、トランザクション処理）を実装
  - getProjects: プロジェクト一覧取得（ページネーション、検索、フィルタリング、ソート対応）を実装
  - getProject: プロジェクト詳細取得を実装
  - updateProject: プロジェクト更新（楽観的排他制御）を実装
  - deleteProject: プロジェクト論理削除を実装
  - getRelatedCounts: 関連データ件数取得（機能フラグ対応）を実装
  - 担当者ID（salesPersonId, constructionPersonId）のバリデーション（admin以外の有効ユーザー確認）を実装
  - 監査ログ連携（PROJECT_CREATED, PROJECT_UPDATED, PROJECT_DELETED）を実装
  - 3.2のバリデーションスキーマと3.3のStatusServiceに依存
  - _Requirements: 1.7, 1.8, 1.13, 1.14, 2.1, 2.2, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.5, 7.1, 8.2, 8.3, 8.6, 9.2, 9.6, 11.5, 11.6, 12.4, 12.6, 13.3, 13.5, 13.7, 22.9, 22.10_

## Task 4: バックエンドAPI層の実装

- [x] 4.1 (P) 担当者候補取得APIの実装
  - GET /api/users/assignable エンドポイントを実装
  - admin以外の有効なユーザー一覧を取得（id, displayName）
  - 認証ミドルウェアを適用
  - Swagger JSDocコメントを追加
  - _Requirements: 17.3, 17.4, 17.5, 17.11, 17.12_

- [x] 4.2 プロジェクトCRUD APIの実装
  - GET /api/projects: 一覧取得（ページネーション、検索、フィルタリング、ソートのクエリパラメータ対応）を実装
  - GET /api/projects/:id: 詳細取得を実装
  - POST /api/projects: 作成を実装
  - PUT /api/projects/:id: 更新（expectedUpdatedAtによる楽観的排他制御）を実装
  - DELETE /api/projects/:id: 論理削除を実装
  - 認証・認可ミドルウェア（project:create, project:read, project:update, project:delete）を適用
  - バリデーションミドルウェアを適用
  - Swagger JSDocコメントを追加
  - 3.4のProjectServiceが必要
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 12.1, 12.2, 12.3_

- [x] 4.3 ステータス遷移APIの実装
  - PATCH /api/projects/:id/status: ステータス変更（status, reason）を実装
  - GET /api/projects/:id/status-history: ステータス変更履歴取得を実装
  - 差し戻し遷移時の理由必須バリデーションを実装
  - 無効なステータス遷移時のエラーレスポンス（422）を実装
  - 認証・認可ミドルウェアを適用
  - Swagger JSDocコメントを追加
  - 3.3のProjectStatusServiceが必要
  - _Requirements: 10.8, 10.9, 10.13, 10.14, 14.7_

- [x] 4.4 (P) OpenAPI仕様書の更新
  - 新規エンドポイントをSwagger仕様に反映
  - リクエスト・レスポンススキーマを文書化
  - エラーレスポンス（400, 401, 403, 404, 409, 422）を文書化
  - _Requirements: 14.7_

## Task 5: フロントエンド共通基盤

- [x] 5.1 (P) プロジェクト用型定義の実装
  - ProjectStatus型（12種類のステータス）を定義
  - TransitionType型（4種類の遷移種別）を定義
  - ProjectInfo型（一覧表示用）を定義
  - ProjectDetail型（詳細表示用）を定義
  - PaginatedProjects型を定義
  - StatusHistoryResponse型を定義
  - AllowedTransition型を定義
  - AssignableUser型を定義
  - _Requirements: 10.1, 10.11_

- [x] 5.2 (P) プロジェクト用APIクライアントの実装
  - getProjects: 一覧取得（クエリパラメータ対応）を実装
  - getProject: 詳細取得を実装
  - createProject: 作成を実装
  - updateProject: 更新を実装
  - deleteProject: 削除を実装
  - transitionStatus: ステータス変更を実装
  - getStatusHistory: ステータス履歴取得を実装
  - getAssignableUsers: 担当者候補取得を実装
  - エラーハンドリング（ネットワークエラー、サーバーエラー）を実装
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 17.12, 18.1, 18.2, 18.3_

- [x] 5.3 (P) ステータス表示ユーティリティの実装
  - ステータスラベルマップ（日本語表示）を定義
  - ステータスカラーマップ（12色）を定義
  - 遷移種別スタイルマップ（アイコン、色、背景色）を定義
  - _Requirements: 10.12, 10.16_

## Task 6: フロントエンドフォームコンポーネント

- [x] 6.1 (P) TradingPartnerSelectコンポーネントの実装
  - ドロップダウン+オートコンプリート選択UIを実装
  - 取引先種別に「顧客」を含む取引先一覧をフィルタリング表示
  - 入力文字列に基づく取引先候補の非同期取得を実装
  - ローディングインジケータを表示
  - 空の候補時のメッセージ表示を実装
  - キーボード操作（上下キー選択、Enter確定）を実装
  - アクセシビリティ属性を設定
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 16.10, 16.11, 16.12, 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 20.2_

- [x] 6.2 (P) UserSelectコンポーネントの実装
  - ドロップダウン選択UIを実装
  - 担当者候補一覧の取得・表示を実装
  - ローディングインジケータを表示
  - 空の候補時のメッセージ表示を実装
  - ログインユーザーのデフォルト選択を実装
  - アクセシビリティ属性を設定
  - 5.2のAPIクライアントが必要
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.10, 17.11, 20.2_

- [x] 6.3 ProjectFormコンポーネントの実装
  - 作成・編集モード切り替えを実装
  - フォームフィールド（プロジェクト名、取引先、営業担当者、工事担当者、現場住所、概要）を実装
  - クライアントサイドバリデーション（Zodスキーマ）を実装
  - 即時バリデーションエラー表示を実装
  - 送信処理とエラーハンドリングを実装
  - キャンセル処理を実装
  - 担当者のデフォルト値（ログインユーザー）設定を実装
  - アクセシビリティ属性を設定
  - 6.1と6.2のコンポーネントに依存
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.9, 1.10, 1.11, 1.12, 8.1, 8.4, 8.5, 13.10, 20.1, 20.2, 20.4_

## Task 7: ステータス遷移UIコンポーネント

- [x] 7.1 (P) 差し戻し理由入力ダイアログの実装
  - モーダルダイアログUIを実装
  - 理由入力テキストエリアを実装
  - 確認・キャンセルボタンを実装
  - 入力必須バリデーションを実装
  - アクセシビリティ対応（フォーカストラップ、Escapeキー）を実装
  - _Requirements: 10.14, 20.1_

- [x] 7.2 StatusTransitionUIコンポーネントの実装
  - 現在のステータスバッジを表示（カラーコード付き）
  - 遷移可能なステータス一覧を表示
  - 順方向遷移と差し戻し遷移を視覚的に区別（アイコン、色）
  - 終端遷移（完了、中止、失注）の視覚的表現を実装
  - 差し戻し遷移選択時に理由入力ダイアログを表示
  - ステータス変更履歴の表示（遷移種別、差し戻し理由含む）を実装
  - ローディング状態の表示を実装
  - アクセシビリティ属性を設定
  - 7.1の差し戻しダイアログに依存
  - _Requirements: 10.8, 10.12, 10.13, 10.14, 10.16, 20.2, 20.3_

## Task 8: プロジェクト一覧ページ

- [x] 8.1 プロジェクト一覧テーブルコンポーネントの実装
  - テーブル形式での一覧表示（ID、プロジェクト名、取引先名、ステータス、更新日）を実装
  - 行クリックで詳細ページ遷移を実装
  - ソート機能（ヘッダークリック、昇順/降順切り替え、アイコン表示）を実装
  - ステータスバッジのカラー表示を実装
  - テーブルヘッダーとデータセルの関連付け（アクセシビリティ）を実装
  - 5.3のステータスユーティリティが必要
  - _Requirements: 2.2, 2.3, 6.1, 6.2, 6.3, 6.4, 6.5, 20.6_

- [x] 8.2 プロジェクト一覧カード表示の実装
  - モバイル向けカード形式表示を実装
  - 768px未満でカード表示に切り替え（useMediaQuery）を実装
  - タップ操作に最適化されたUI（タップターゲット44x44px以上）を実装
  - _Requirements: 15.1, 15.3, 15.4_

- [x] 8.3 (P) 検索・フィルタUIの実装
  - 検索フィールド（Enterキー/ボタンで実行）を実装
  - 2文字以上の入力バリデーションを実装
  - ステータスフィルタ（ドロップダウン）を実装
  - フィルタクリアボタンを実装
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4_

- [x] 8.4 (P) ページネーションUIの実装
  - ページネーションコントロールを実装
  - 現在のページ番号、総ページ数、総件数の表示を実装
  - 表示件数変更（10/20/50件）を実装
  - ページ遷移処理を実装
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 8.5 ProjectListPageの実装
  - 一覧データの取得・表示を実装
  - URLパラメータとの状態同期を実装
  - ローディングインジケータの表示を実装
  - 空状態メッセージ（「プロジェクトがありません」）の表示を実装
  - 検索結果0件メッセージの表示を実装
  - 新規作成ボタンからフォーム表示への遷移を実装
  - デバウンスによる連続リクエスト抑制を実装
  - デフォルトソート（更新日時降順）を設定
  - エラー時の再試行ボタン表示を実装
  - 8.1〜8.4のコンポーネントに依存
  - _Requirements: 2.1, 2.4, 2.5, 2.6, 5.6, 18.1, 18.2, 19.1, 19.4, 19.5_

## Task 9: プロジェクト詳細ページ

- [x] 9.1 (P) 削除確認ダイアログの実装
  - 削除確認モーダルを実装
  - 関連データ存在時の警告メッセージ表示を実装
  - 削除/キャンセルボタンを実装
  - アクセシビリティ対応を実装
  - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.6, 20.1_

- [x] 9.2 ProjectDetailPageの実装
  - プロジェクト詳細情報（プロジェクト名、取引先名、営業担当者、工事担当者、説明、ステータス、住所、作成日、更新日）の表示を実装
  - 担当者の表示名表示を実装
  - 編集ページへの遷移（編集ボタンで/projects/:id/editへ遷移）を実装
  - 削除ボタンと確認ダイアログ表示を実装
  - ステータス遷移UIの組み込みを実装
  - ステータス変更履歴の表示を実装
  - 「一覧に戻る」リンクの表示を実装
  - 関連データ件数表示（機能フラグ対応、将来実装予定）を実装
  - ローディングインジケータの表示を実装
  - 404/403エラーページへの遷移を実装
  - 削除成功後の一覧画面遷移とメッセージ表示を実装
  - 6.3、7.2、9.1のコンポーネントに依存
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.1, 9.2, 9.3, 9.4, 9.7, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 18.4, 18.5, 19.2, 22.9, 22.10_

## Task 10: ナビゲーション統合

- [x] 10.1 (P) AppHeaderへのプロジェクトリンク追加
  - ナビゲーションに「プロジェクト」リンクを追加
  - プロジェクトアイコンを追加
  - 「ダッシュボード」リンクの右側に配置
  - リンク先を /projects に設定
  - _Requirements: 21.1, 21.2, 21.3, 21.4_

- [x] 10.2 (P) Dashboardへのプロジェクト管理カード追加
  - クイックアクセスセクションに「プロジェクト管理」カードを追加
  - セクション先頭に配置
  - 「工事案件の作成・管理」説明文を表示
  - リンク先を /projects に設定
  - _Requirements: 21.5, 21.6, 21.7, 21.8_

- [x] 10.3 ルーティング設定
  - /projects ルートを追加（ProjectListPage）
  - /projects/:id ルートを追加（ProjectDetailPage）
  - /projects/new ルートを追加（ProjectCreatePage）
  - /projects/:id/edit ルートを追加（ProjectEditPage）
  - ProtectedRoute/ProtectedLayoutでラップ
  - 10.1と10.2の後にルーティングを設定
  - _Requirements: 21.9, 21.10, 21.11, 21.12, 21.26, 21.27, 21.28, 21.29_

## Task 11: レスポンシブ対応

- [x] 11.1 画面幅対応の実装
  - 320px〜1920pxの画面幅に対応
  - ブレークポイント設定（768px未満でモバイル）を実装
  - レスポンシブユーティリティクラスを適用
  - _Requirements: 15.5, 15.1, 15.2_

## Task 12: アクセシビリティ対応

- [x] 12.1 キーボードナビゲーションの実装
  - すべての操作をキーボードで実行可能にする
  - フォーカス状態を視覚的に明確に表示
  - Tabキーによるフォーカス移動を実装
  - Enter/Spaceキーによる操作実行を実装
  - _Requirements: 20.1, 20.4_

- [x] 12.2 スクリーンリーダー対応
  - aria-label属性をフォーム要素に設定
  - aria-live属性でエラーメッセージを通知
  - コントラスト比をWCAG 2.1 Level AA準拠（通常テキスト4.5:1以上、大きいテキスト3:1以上）に調整
  - 12.1のキーボードナビゲーション実装後に対応
  - _Requirements: 20.2, 20.3, 20.5_

## Task 13: エラーハンドリングとフィードバック

- [x] 13.1 トースト通知の統合
  - 操作成功時のToastNotification表示を実装（作成完了、更新完了、削除完了、ステータス変更完了）
  - 操作失敗時のToastNotification表示を実装
  - 既存のToastNotificationコンポーネントを使用
  - _Requirements: 18.4, 18.5_

- [x] 13.2 ネットワークエラー対応
  - ネットワークエラー時のエラーメッセージ表示を実装
  - 再試行ボタンの表示と機能を実装
  - サーバーエラー（5xx）時のメッセージ表示を実装
  - セッション期限切れ時のリダイレクトを実装
  - _Requirements: 18.1, 18.2, 18.3, 18.6_

## Task 14: バックエンドテスト

- [x] 14.1 (P) ProjectStatusServiceのユニットテスト
  - getAllowedTransitions: 各ステータスからの遷移可能先を検証
  - getTransitionType: 遷移種別判定を検証
  - transitionStatus: 正常遷移、無効遷移、差し戻し理由必須チェックを検証
  - getStatusHistory: 履歴取得を検証
  - _Requirements: 10.1, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.14_

- [x] 14.2 (P) ProjectServiceのユニットテスト
  - createProject: 正常作成、バリデーションエラー、初期ステータス履歴を検証
  - getProjects: ページネーション、検索、フィルタリング、ソートを検証
  - getProject: 正常取得、未存在エラーを検証
  - updateProject: 正常更新、楽観的排他制御エラーを検証
  - deleteProject: 論理削除を検証
  - 担当者ID検証を検証
  - _Requirements: 1.7, 1.14, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.2, 8.6, 9.2, 13.3, 13.5, 13.7_

- [x] 14.3 (P) プロジェクトAPIルートのユニットテスト
  - 各エンドポイントのリクエスト/レスポンス検証
  - 認証・認可ミドルウェアの動作検証
  - バリデーションエラーレスポンスの検証
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 12.1, 12.2, 12.3_

- [x] 14.4 バックエンド統合テスト
  - プロジェクトCRUDフローの統合テスト
  - ステータス遷移フローの統合テスト
  - 楽観的排他制御の統合テスト
  - 監査ログ記録の検証
  - 14.1〜14.3のユニットテスト完了後に実施
  - _Requirements: 12.4, 12.6, 19.3_

## Task 15: フロントエンドテスト

- [x] 15.1 (P) フォームコンポーネントのユニットテスト
  - ProjectForm: 入力バリデーション、送信処理、エラー表示を検証
  - TradingPartnerSelect: 取引先候補表示、選択処理を検証
  - UserSelect: 候補表示、選択処理を検証
  - _Requirements: 1.9, 1.10, 1.11, 1.12, 13.10_

- [x] 15.2 (P) StatusTransitionUIのユニットテスト
  - ステータスバッジ表示を検証
  - 遷移可能ステータス表示を検証
  - 差し戻し理由ダイアログを検証
  - 履歴表示を検証
  - _Requirements: 10.12, 10.13, 10.14, 10.16_

- [x] 15.3 (P) 一覧・詳細ページのユニットテスト
  - ProjectListPage: テーブル/カード表示、ページネーション、検索、フィルタリング、ソートを検証
  - ProjectDetailPage: 情報表示、編集モード、削除確認を検証
  - _Requirements: 2.1, 2.2, 7.1, 8.1, 9.1_

## Task 16: E2Eテスト

- [x] 16.1 プロジェクトCRUD E2Eテスト
  - プロジェクト作成フロー（フォーム入力→送信→詳細画面遷移）をテスト
  - プロジェクト編集フロー（編集ボタン→フォーム表示→保存→成功メッセージ）をテスト
  - プロジェクト削除フロー（削除ボタン→確認ダイアログ→削除→一覧遷移）をテスト
  - 14.4と15.3のテスト完了後に実施
  - _Requirements: 1.1, 1.7, 1.8, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3_

- [x] 16.2 プロジェクト一覧操作 E2Eテスト
  - 検索→フィルタ→ソート→ページ遷移フローをテスト
  - レスポンシブ表示（デスクトップ→モバイル切り替え）をテスト
  - _Requirements: 2.1, 3.3, 4.1, 5.1, 6.1, 15.3_

- [x] 16.3 ステータス遷移 E2Eテスト
  - 順方向遷移フロー（ステータスボタン→遷移選択→確認）をテスト
  - 差し戻し遷移フロー（ステータスボタン→差し戻し選択→理由入力→確認）をテスト
  - 無効遷移時のエラー表示をテスト
  - 遷移UIの視覚的区別（色分け）をテスト
  - _Requirements: 10.8, 10.9, 10.12, 10.14, 10.16_

- [x] 16.4 アクセシビリティ E2Eテスト
  - キーボードナビゲーション（Tab, Enter, Escape操作）をテスト
  - axe-playwrightによる自動アクセシビリティチェックを実行
  - _Requirements: 20.1, 20.4_

## Task 17: パフォーマンス検証

- [x] 17.1 パフォーマンス要件の検証
  - プロジェクト一覧画面の初期表示時間（2秒以内）を測定
  - プロジェクト詳細画面の初期表示時間（1秒以内）を測定
  - CRUD操作のAPI応答時間（500ミリ秒以内）を測定
  - 検索・フィルタリング操作の結果表示時間（1秒以内）を測定
  - 担当者選択APIのレスポンス時間（500ミリ秒以内）を測定
  - 1000件以上のデータでのページネーション動作を検証
  - 16.1〜16.4のE2Eテスト完了後に実施
  - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 17.9_

## Task 18: パンくずナビゲーション統合

- [x] 18.1 (P) ProjectListPageへのパンくずナビゲーション追加
  - 既存のBreadcrumbコンポーネントをインポートして使用
  - 「ダッシュボード > プロジェクト一覧」のパンくずを表示
  - ダッシュボードリンクは / へ遷移可能に設定
  - 「プロジェクト一覧」は現在ページとしてリンクなしで表示
  - アクセシビリティ属性（aria-label、aria-current）を確認
  - _Requirements: 21.14, 21.18_

- [x] 18.2 (P) ProjectDetailPageへのパンくずナビゲーション追加
  - 既存のBreadcrumbコンポーネントをインポートして使用
  - 「ダッシュボード > プロジェクト一覧 > [プロジェクト名]」のパンくずを表示
  - ダッシュボードリンクは / へ遷移可能に設定
  - プロジェクト一覧リンクは /projects へ遷移可能に設定
  - プロジェクト名は現在ページとしてリンクなしで表示
  - プロジェクト名はAPIから取得したデータを動的に表示
  - アクセシビリティ属性を確認
  - _Requirements: 21.15, 21.18_

- [x] 18.3 (P) ProjectCreatePageへのパンくずナビゲーション追加
  - 既存のBreadcrumbコンポーネントをインポートして使用
  - 「ダッシュボード > プロジェクト一覧 > 新規作成」のパンくずを表示
  - ダッシュボードリンクは / へ遷移可能に設定
  - プロジェクト一覧リンクは /projects へ遷移可能に設定
  - 「新規作成」は現在ページとしてリンクなしで表示
  - アクセシビリティ属性を確認
  - _Requirements: 21.16, 21.18_

- [x] 18.4 ProjectEditPageの実装とパンくずナビゲーション追加
  - /projects/:id/edit ルートを追加
  - ProjectEditPageコンポーネントを新規作成
  - 既存プロジェクトデータの取得と編集フォーム表示を実装
  - ProjectFormコンポーネントを編集モードで使用
  - 楽観的排他制御による競合検出を実装
  - 保存成功時の詳細ページへの遷移を実装
  - 「ダッシュボード > プロジェクト一覧 > [プロジェクト名] > 編集」のパンくずを表示
  - ダッシュボードリンクは / へ遷移可能に設定
  - プロジェクト一覧リンクは /projects へ遷移可能に設定
  - プロジェクト名リンクは /projects/:id へ遷移可能に設定
  - 「編集」は現在ページとしてリンクなしで表示
  - ProtectedRoute/ProtectedLayoutでラップ
  - ローディング状態とエラー状態を適切に表示
  - アクセシビリティ属性を確認
  - 6.3のProjectFormコンポーネントに依存
  - _Requirements: 21.12, 21.17, 21.18, 21.21, 21.23, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 18.5 ProjectDetailPageの編集ボタン遷移先更新
  - 編集ボタンクリック時に /projects/:id/edit へ遷移するよう変更
  - インラインフォーム表示から独立ページ遷移パターンに変更
  - 取引先管理機能（TradingPartnerDetailPage）と同一パターンを適用
  - _Requirements: 21.21_

## Task 19: パンくずナビゲーションE2Eテスト

- [x] 19.1 パンくずナビゲーション表示E2Eテスト
  - 一覧ページで「ダッシュボード > プロジェクト一覧」の表示を確認
  - 詳細ページで「ダッシュボード > プロジェクト一覧 > [プロジェクト名]」の表示を確認
  - 新規作成ページで「ダッシュボード > プロジェクト一覧 > 新規作成」の表示を確認
  - 編集ページで「ダッシュボード > プロジェクト一覧 > [プロジェクト名] > 編集」の表示を確認
  - プロジェクト名が動的に反映されることを確認
  - 18.1〜18.4の実装完了後に実施
  - _Requirements: 21.14, 21.15, 21.16, 21.17_

- [x] 19.2 パンくずナビゲーション遷移E2Eテスト
  - パンくずのダッシュボードリンクをクリックし、ダッシュボードページへ遷移することを確認
  - パンくずのプロジェクトリンクをクリックし、プロジェクト一覧ページへ遷移することを確認
  - 編集ページのパンくずからプロジェクト名リンクをクリックし、詳細ページへ遷移することを確認
  - 現在ページ項目がクリック不可（リンクなし）であることを確認
  - 遷移後も適切なパンくずが表示されることを確認
  - 19.1完了後に実施
  - _Requirements: 21.18_

- [x] 19.3 パンくずナビゲーションアクセシビリティE2Eテスト
  - aria-label="パンくずナビゲーション"の存在を確認
  - 現在ページにaria-current="page"が設定されていることを確認
  - キーボード操作でパンくずリンクをフォーカス・選択できることを確認
  - axe-playwrightによるアクセシビリティチェックを実行
  - _Requirements: 21.18, 20.1, 20.2_

## Task 20: 取引先連携E2Eテスト

- [x] 20.1 取引先選択機能E2Eテスト
  - プロジェクト作成時の取引先選択UIが表示されることを確認
  - 取引先オートコンプリート検索が動作することを確認
  - 取引先種別「顧客」のみが候補として表示されることを確認
  - 選択した取引先がフォームに正しく設定されることを確認
  - プロジェクト詳細画面で取引先名が表示されることを確認
  - プロジェクト一覧画面で取引先名が表示されることを確認
  - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.9, 22.10_

</details>

---

## 差分実装タスク（2025-12-13要件変更対応）

以下のタスクは、2025-12-13の要件更新に対応するための差分実装です。

### 変更概要

1. **一覧表示の列構成変更**: ID列削除、営業担当者・工事担当者列追加（2.2）
2. **検索対象の拡張**: 営業担当者・工事担当者を検索対象に追加（4.1a, 4.1b）
3. **フリガナ検索のひらがな・カタカナ両対応**: 取引先検索でひらがな・カタカナどちらの入力でも検索可能（16.3, 22.5）
4. **プロジェクト名一意性チェック**: 作成・更新時に重複チェックを実行、409エラーを返却（1.15, 1.16, 8.7, 8.8）
5. **ソートフィールドの拡張**: 営業担当者・工事担当者でのソートを追加（6.5）

---

## Task 21: バックエンド差分実装

- [x] 21.1 (P) プロジェクト名重複エラークラスの追加
  - DuplicateProjectNameErrorクラスをprojectError.tsに追加
  - PROBLEM_TYPES.PROJECT_NAME_DUPLICATEを追加
  - ERROR_CODES.PROJECT_NAME_DUPLICATEを追加
  - エラーメッセージ「このプロジェクト名は既に使用されています」を設定
  - _Requirements: 1.15, 8.7_

- [x] 21.2 (P) ソートフィールド拡張のZodスキーマ更新
  - SORTABLE_FIELDSから'id'を削除
  - SORTABLE_FIELDSに'salesPersonName', 'constructionPersonName'を追加
  - 'customerName'（既存の'tradingPartnerId'からエイリアス）を追加
  - _Requirements: 6.5_

- [x] 21.3 ProjectServiceにプロジェクト名一意性チェックを追加
  - checkProjectNameUniquenessプライベートメソッドを追加
  - 論理削除されていないプロジェクトのみを対象にチェック
  - createProjectメソッド内でプロジェクト名重複チェックを呼び出し
  - updateProjectメソッド内でプロジェクト名重複チェックを呼び出し（自身を除外）
  - 21.1のエラークラスが必要
  - _Requirements: 1.15, 1.16, 8.7, 8.8_

- [x] 21.4 (P) ProjectServiceに検索対象拡張を追加
  - getProjectsメソッドの検索クエリに営業担当者の表示名を追加
  - getProjectsメソッドの検索クエリに工事担当者の表示名を追加
  - Prismaのincludeでリレーション取得済みであることを確認
  - _Requirements: 4.1a, 4.1b_

- [x] 21.5 (P) ProjectServiceにソートロジック拡張を追加
  - buildOrderByメソッドに'customerName'ケースを追加（tradingPartner.name）
  - buildOrderByメソッドに'salesPersonName'ケースを追加（salesPerson.displayName）
  - buildOrderByメソッドに'constructionPersonName'ケースを追加（constructionPerson.displayName）
  - 21.2のスキーマ更新が必要
  - _Requirements: 6.5_

- [x] 21.6 プロジェクトルートに409エラーハンドリングを追加
  - POST /api/projectsハンドラでDuplicateProjectNameErrorをキャッチ
  - PUT /api/projects/:idハンドラでDuplicateProjectNameErrorをキャッチ
  - RFC 7807形式のエラーレスポンスを返却（type, title, status, detail, code, projectName）
  - 21.1と21.3が必要
  - _Requirements: 1.15, 8.7_

## Task 22: フロントエンド差分実装

- [x] 22.1 (P) SortField型定義の更新
  - SortFieldから'id'を削除
  - SortFieldに'salesPersonName', 'constructionPersonName'を追加
  - ProjectListPageの状態管理に反映
  - GetProjectsOptions.sortフィールドも同様に更新
  - ProjectListTableのCOLUMS配列も同時に更新（ID列削除、営業担当者・工事担当者列追加）
  - 既存テストを新しい列構成に対応するよう更新
  - SortField.test.tsを新規作成して型テストを追加
  - _Requirements: 6.5_
  - _Completed: 2025-12-13_

- [x] 22.2 ProjectListTableコンポーネントの列構成変更
  - COLUMNS配列からID列を削除
  - COLUMNS配列に営業担当者列を追加（key: 'salesPersonName'）
  - COLUMNS配列に工事担当者列を追加（key: 'constructionPersonName'）
  - テーブルセルのレンダリングで担当者の表示名を表示
  - 工事担当者はnullableなのでオプショナルチェイン（project.constructionPerson?.displayName ?? '-'）
  - 22.1の型更新が必要
  - _Requirements: 2.2, 6.5_
  - _Note: 22.1と併せて実装済み（同時に変更しないと型エラーが発生するため）_
  - _Completed: 2025-12-13_

- [x] 22.3 (P) ProjectListCardコンポーネントの表示項目更新
  - カード表示に営業担当者を追加
  - カード表示に工事担当者を追加
  - モバイル表示時のレイアウト調整
  - _Requirements: 2.2_
  - _Completed: 2025-12-13_

- [x] 22.4 (P) プロジェクトAPIクライアントに409エラーハンドリング追加
  - createProject関数で409エラーを識別
  - updateProject関数で409エラーを識別
  - DuplicateProjectNameErrorResponse型を定義
  - isDuplicateProjectNameErrorResponse型ガード関数を追加
  - エラー情報を呼び出し元に伝播
  - _Requirements: 1.15, 8.7_
  - _Completed: 2025-12-13_

- [x] 22.5 ProjectFormコンポーネントにプロジェクト名重複エラー表示を追加
  - submitError propsでサーバーエラーを受け取り
  - 409エラー時にプロジェクト名フィールドにエラーメッセージを表示
  - 「このプロジェクト名は既に使用されています」メッセージを表示
  - 22.4のエラーハンドリングが必要
  - _Requirements: 1.15, 8.7_
  - _Completed: 2025-12-13_

- [x] 22.6 ProjectCreatePageに409エラーハンドリングを追加
  - createProject呼び出し時の409エラーをキャッチ
  - ProjectFormにsubmitErrorを渡す
  - エラー発生時のUIフィードバック（トースト通知）
  - 22.4と22.5が必要
  - _Requirements: 1.15_
  - _Completed: 2025-12-13_

- [x] 22.7 ProjectEditPageに409エラーハンドリングを追加
  - updateProject呼び出し時の409エラーをキャッチ
  - ProjectFormにsubmitErrorを渡す
  - エラー発生時のUIフィードバック（トースト通知）
  - 22.4と22.5が必要
  - _Requirements: 8.7_
  - _Completed: 2025-12-13_

## Task 23: フリガナ検索ひらがな・カタカナ両対応

- [x] 23.1 取引先サービスのひらがな・カタカナ変換確認
  - trading-partner.service.tsのひらがな⇔カタカナ変換ロジックが実装済みか確認
  - 実装済みでない場合は変換関数を追加
  - 検索時にhiraganaToKatakana、katakanaToHiragana両方で検索
  - _Requirements: 16.3, 22.5_
  - _Completed: 2025-12-13_

## Task 24: 差分実装のテスト

- [x] 24.1 (P) プロジェクト名一意性チェックのユニットテスト
  - createProject: 重複プロジェクト名でDuplicateProjectNameErrorを検証
  - updateProject: 重複プロジェクト名（自身除外）でエラーを検証
  - updateProject: 同名でも自身の場合はエラーなしを検証
  - 論理削除されたプロジェクト名は重複チェック対象外を検証
  - _Requirements: 1.15, 1.16, 8.7, 8.8_

- [x] 24.2 (P) 検索対象拡張のユニットテスト
  - getProjects: 営業担当者名での検索を検証
  - getProjects: 工事担当者名での検索を検証
  - getProjects: 複数フィールド（プロジェクト名、顧客名、担当者名）の部分一致を検証
  - _Requirements: 4.1a, 4.1b_
  - _Completed: 2025-12-13_

- [x] 24.3 (P) ソート拡張のユニットテスト
  - getProjects: salesPersonNameでの昇順・降順ソートを検証
  - getProjects: constructionPersonNameでの昇順・降順ソートを検証
  - getProjects: customerNameでの昇順・降順ソートを検証
  - _Requirements: 6.5_
  - _Completed: 2025-12-13_

- [x] 24.4 (P) フロントエンド一覧表示のユニットテスト
  - ProjectListTable: 営業担当者列の表示を検証
  - ProjectListTable: 工事担当者列の表示を検証
  - ProjectListTable: ID列が表示されないことを検証
  - ProjectListTable: 工事担当者null時の「-」表示を検証
  - _Requirements: 2.2_
  - _Completed: 2025-12-13_

- [x] 24.5 (P) プロジェクト名重複エラー表示のユニットテスト
  - ProjectForm: 409エラー時のエラーメッセージ表示を検証
  - ProjectCreatePage: 作成時の重複エラーハンドリングを検証
  - ProjectEditPage: 更新時の重複エラーハンドリングを検証
  - _Requirements: 1.15, 8.7_
  - _Completed: 2025-12-13_

## Task 25: 差分実装のE2Eテスト

- [x] 25.1 プロジェクト名一意性チェックE2Eテスト
  - プロジェクト作成時に重複プロジェクト名でエラーメッセージが表示されることを確認
  - プロジェクト編集時に重複プロジェクト名でエラーメッセージが表示されることを確認
  - 重複エラー後にプロジェクト名を変更して正常に保存できることを確認
  - 24.1完了後に実施
  - _Requirements: 1.15, 1.16, 8.7, 8.8_
  - _Completed: 2025-12-13_

- [x] 25.2 一覧表示の列構成変更E2Eテスト
  - 一覧画面でID列が表示されないことを確認
  - 一覧画面で営業担当者列が表示されることを確認
  - 一覧画面で工事担当者列が表示されることを確認
  - 営業担当者・工事担当者の表示名が正しく表示されることを確認
  - 工事担当者未設定時に「-」が表示されることを確認
  - _Requirements: 2.2_
  - _Completed: 2025-12-13_

- [x] 25.3 検索対象拡張E2Eテスト
  - 営業担当者名での検索結果が正しいことを確認
  - 工事担当者名での検索結果が正しいことを確認
  - 複数フィールドにまたがる検索が動作することを確認
  - 24.2完了後に実施
  - _Requirements: 4.1a, 4.1b_
  - _Completed: 2025-12-13_

- [x] 25.4 ソート拡張E2Eテスト
  - 営業担当者列のヘッダークリックでソートが動作することを確認
  - 工事担当者列のヘッダークリックでソートが動作することを確認
  - 昇順・降順の切り替えが正しく動作することを確認
  - ソートアイコンが適切に表示されることを確認
  - 24.3完了後に実施
  - _Requirements: 6.5_
  - _Completed: 2025-12-13_

## Task 26: 統合テストと動作確認

- [x] 26.1 差分実装の統合テスト
  - バックエンドAPIの一貫性を確認（検索、ソート、一意性チェック）
  - フロントエンドUIの整合性を確認
  - 既存機能への影響がないことを確認
  - エラーハンドリングの動作確認
  - 25.1〜25.4完了後に実施
  - _Requirements: 1.15, 1.16, 2.2, 4.1a, 4.1b, 6.5, 8.7, 8.8, 16.3, 22.5_
  - _Completed: 2025-12-13_

---

## 差分実装タスク（2025-12-15要件変更対応）

以下のタスクは、2025-12-15のgap analysis結果に基づく差分実装です。

### 変更概要

1. **フィールドラベル変更**: 「取引先」→「顧客名」（TradingPartnerSelect.tsx、ProjectDetailPage.tsx）
2. **プロジェクト検索でのひらがな・カタカナ両対応**: 既存のkana-converter.tsを再利用（project.service.ts）

---

## Task 27: UIラベル変更

- [x] 27.1 (P) TradingPartnerSelectコンポーネントのラベル変更
  - labelタグのテキストを「取引先」から「顧客名」に変更
  - aria-label属性を「取引先」から「顧客名」に変更
  - 候補リスト関連のaria-label（「取引先候補」等）は内部的な取引先マスタを指すため維持
  - 関連テストファイル（screenreader.test.tsx, ProjectCreatePage.test.tsx, ProjectEditPage.test.tsx, ProjectForm.test.tsx）を更新
  - _Requirements: 8.4, 16_
  - _Completed: 2025-12-15_

- [x] 27.2 (P) ProjectDetailPageのフィールドラベル変更
  - 詳細表示セクションの「取引先」ラベルを「顧客名」に変更
  - スタイル定義のfieldLabelは既存を維持
  - _Requirements: 8.4, 22_
  - _Completed: 2025-12-15_

## Task 28: プロジェクト検索のひらがな・カタカナ両対応

- [x] 28.1 ProjectServiceの検索ロジックにかな変換を追加
  - 既存のkana-converter.ts（toKatakana、toHiragana）をインポート
  - 検索キーワードをひらがな・カタカナ両方に変換
  - 取引先名・フリガナ検索でカタカナ変換後のキーワードを適用
  - 取引先管理機能（trading-partner.service.ts）と同一パターンを採用
  - _Requirements: 8.4, 16.3, 22.5_
  - _Completed: 2025-12-15_

## Task 29: 差分実装のテスト

- [x] 29.1 (P) UIラベル変更のユニットテスト
  - TradingPartnerSelectコンポーネントのラベルが「顧客名」であることを検証
  - ProjectDetailPageの詳細表示ラベルが「顧客名」であることを検証
  - aria-label属性の変更を検証
  - _Requirements: 8.4, 16, 22_
  - _Completed: 2025-12-15_
  - _Note: Task 27.1, 27.2のTDD実装時に関連テストは既に更新済み。screenreader.test.tsx, ProjectForm.test.tsx, ProjectCreatePage.test.tsx, ProjectEditPage.test.tsx, ProjectDetailPage.test.tsxで「顧客名」ラベルの検証を実施。全176テストがパス。_

- [x] 29.2 (P) かな検索のユニットテスト
  - ひらがな入力で取引先（カタカナフリガナ）が検索されることを検証
  - カタカナ入力で取引先（ひらがなフリガナ）が検索されることを検証
  - 混合かな入力での検索動作を検証
  - _Requirements: 8.4, 16.3, 22.5_
  - _Completed: 2025-12-15_
  - _Note: Task 28.1のTDD実装時に関連テストは既に追加済み。project.service.test.tsの「getProjects - ひらがな・カタカナ両対応検索 (16.3, 22.5)」describeブロックに5つのテストケース（ひらがな入力検索、カタカナ入力検索、混合かな入力検索、漢字入力検索、担当者検索かな変換なし）を実装。全1659テストがパス。_

## Task 30: E2Eテスト

- [x] 30.1 ラベル変更E2Eテスト
  - プロジェクト作成画面で「顧客名」ラベルが表示されることを確認
  - プロジェクト詳細画面で「顧客名」ラベルが表示されることを確認
  - プロジェクト編集画面で「顧客名」ラベルが表示されることを確認
  - 29.1完了後に実施
  - _Requirements: 8.4, 16, 22_
  - _Completed: 2025-12-15_
  - _Test file: e2e/specs/projects/project-customer-label.spec.ts_
  - _Note: 7テスト実装（作成・編集・詳細画面での「顧客名」ラベル表示確認、「取引先」ラベル非表示確認）_

- [x] 30.2 かな検索E2Eテスト
  - ひらがな入力で取引先が検索されることを確認
  - カタカナ入力で取引先が検索されることを確認
  - プロジェクト一覧の検索結果が正しいことを確認
  - 29.2完了後に実施
  - _Requirements: 8.4, 16.3, 22.5_
  - _Completed: 2025-12-15_
  - _Test file: e2e/specs/projects/project-kana-search.spec.ts_
  - _Note: 7テスト実装（ひらがな入力検索、カタカナ入力検索、部分一致検索、ひらがな・カタカナ同一結果、混合入力検索、検索ボタン動作、取引先フリガナ検索結果表示）_

## Task 31: 統合テストと動作確認

- [x] 31.1 差分実装の統合テスト
  - UIラベル変更の一貫性を確認
  - かな検索機能の動作確認
  - 既存機能への影響がないことを確認
  - 30.1、30.2完了後に実施
  - _Requirements: 8.4, 16, 16.3, 22, 22.5_
  - _Completed: 2025-12-15_
  - _Test results:_
    - _Backend unit tests: 1659 passed (61 files)_
    - _Frontend unit tests: 1868 passed (87 files)_
    - _Customer label E2E tests: 7 passed (project-customer-label.spec.ts)_
    - _Kana search E2E tests: 7 passed (project-kana-search.spec.ts)_
  - _Verified: UIラベル変更「取引先」→「顧客名」が全画面で一貫、かな検索がひらがな・カタカナ両対応で正常動作、既存機能への影響なし_

---

## 差分実装タスク（2025-12-15 gap analysis追加対応）

以下のタスクは、2025-12-15のgap analysis結果で特定された残りの未実装項目への対応です。

### 変更概要

1. **TradingPartnerSelectのクライアントサイドフィルタリングでひらがな・カタカナ両対応**（16.3）
   - フロントエンドに`kana-converter.ts`を新規作成（バックエンドから移植）
   - `matchesSearchQuery`関数にかな変換ロジックを追加

---

## Task 32: フロントエンドかな変換ユーティリティ追加

- [x] 32.1 (P) フロントエンド用kana-converter.tsの作成
  - `frontend/src/utils/kana-converter.ts`を新規作成
  - バックエンドの`backend/src/utils/kana-converter.ts`と同一ロジックを移植
  - `toKatakana`関数を実装（ひらがな→カタカナ変換）
  - `toHiragana`関数を実装（カタカナ→ひらがな変換）
  - Unicode code point定数を定義（HIRAGANA_START, HIRAGANA_END, KATAKANA_START, KATAKANA_END, KANA_OFFSET）
  - JSDocコメントを追加し、Requirement 16.3への対応を明記
  - _Requirements: 16.3_
  - _Completed: 2025-12-15_
  - _Test file: frontend/src/__tests__/utils/kana-converter.test.ts (47 tests)_

- [x] 32.2 (P) kana-converter.tsのユニットテスト
  - `frontend/src/__tests__/utils/kana-converter.test.ts`を新規作成
  - ひらがな→カタカナ変換のテストケースを追加
  - カタカナ→ひらがな変換のテストケースを追加
  - 混合文字列（漢字、数字、英字、記号を含む）のテストケースを追加
  - 空文字列の処理テストを追加
  - _Requirements: 16.3_
  - _Completed: 2025-12-15_
  - _Note: Task 32.1のTDD実装時に同時完了（テスト先行で実装）_

## Task 33: TradingPartnerSelectコンポーネントの修正

- [x] 33.1 matchesSearchQuery関数にかな変換ロジックを追加
  - `frontend/src/components/projects/TradingPartnerSelect.tsx`を修正
  - `kana-converter.ts`から`toKatakana`、`toHiragana`をインポート
  - 検索クエリをカタカナとひらがなの両方に変換
  - 名前フィールドで元のクエリ、カタカナ変換後、ひらがな変換後で検索
  - フリガナフィールド（`nameKana`）でカタカナ変換後で検索
  - 部課名、代表者名の検索にも同様にかな変換を適用
  - 32.1の完了が必要（完了済み）
  - _Requirements: 1.4, 8.4, 16.3, 22.5_
  - _Completed: 2025-12-15_
  - _Modified file: frontend/src/components/projects/TradingPartnerSelect.tsx (matchesSearchQuery function)_
  - _Note: TDD実装（テスト先行）、19テストケース全パス_

- [x] 33.2 TradingPartnerSelectのユニットテスト更新
  - `frontend/src/__tests__/components/projects/TradingPartnerSelect.test.tsx`を新規作成
  - ひらがな入力で取引先（カタカナフリガナ）が検索されることを検証
  - カタカナ入力で取引先（ひらがなフリガナ）が検索されることを検証
  - 部課名フリガナ検索を検証
  - 代表者名フリガナ検索を検証
  - 混合かな入力での検索動作を検証
  - 検索結果0件のメッセージ表示を検証
  - キーボード操作テストを追加
  - アクセシビリティ（aria-*属性）テストを追加
  - 33.1と同時実装（TDD）
  - _Requirements: 16.3, 22.5_
  - _Completed: 2025-12-15_
  - _Test file: frontend/src/__tests__/components/projects/TradingPartnerSelect.test.tsx (19 tests)_

## Task 34: E2Eテスト

- [x] 34.1 TradingPartnerSelectのひらがな・カタカナ検索E2Eテスト
  - プロジェクト作成画面で取引先選択時、ひらがな入力で候補がフィルタリングされることを確認
  - プロジェクト作成画面で取引先選択時、カタカナ入力で候補がフィルタリングされることを確認
  - プロジェクト編集画面でも同様に動作することを確認
  - 33.1、33.2完了後に実施（完了済み）
  - _Requirements: 1.4, 8.4, 16.3, 22.5_
  - _Completed: 2025-12-15_
  - _Test file: e2e/specs/projects/trading-partner-select-kana.spec.ts_
  - _Note: 11テスト実装（事前準備2件、プロジェクト作成画面でのかな検索6件、プロジェクト編集画面でのかな検索3件）。ひらがな入力、カタカナ入力、部分一致、混合かな入力、候補なしメッセージ、取引先選択後の保存動作をテスト。全239件のプロジェクト関連E2Eテストがパス。_

## Task 35: 統合テストと動作確認

- [x] 35.1 差分実装の統合テスト
  - TradingPartnerSelectのクライアントサイドフィルタリングでひらがな・カタカナ両対応が動作することを確認
  - 既存機能への影響がないことを確認
  - 全テストスイートの実行と合格を確認
  - 34.1完了後に実施
  - _Requirements: 1.4, 8.4, 16.3, 22.5_
  - _Completed: 2025-12-15_
  - _Test Results:_
    - _Backend Unit Tests: 61ファイル、1659テスト - 全パス_
    - _Frontend Unit Tests: 89ファイル、1934テスト - 全パス_
    - _TradingPartnerSelect Unit Tests: 19テスト - 全パス_
    - _kana-converter Unit Tests: 47テスト - 全パス_
    - _Project E2E Tests: 213テスト - 全パス_
    - _TradingPartnerSelect かな検索E2E Tests: 11テスト - 全パス_
  - _Note: ひらがな・カタカナ両対応検索がTradingPartnerSelectのクライアントサイドフィルタリングで正常動作。既存機能への影響なし。_

---

## 差分実装タスク（2026-02-08要件変更対応）

以下のタスクは、2026-02-08の要件更新に対応するための差分実装です。

### 変更概要

1. **顧客選択時の現場住所自動入力**: 顧客をドロップダウン/オートコンプリートから選択した際、現場住所フィールドが空欄であれば取引先の住所を自動入力する。既に値がある場合は上書きしない（1.6, 1.7）

---

## Task 36: 顧客選択時の現場住所自動入力

- [x] 36.1 (P) TradingPartnerSelectコンポーネントにonSelectコールバックを追加
  - コンポーネントのプロパティに、選択された取引先オブジェクト全体を返すオプショナルなコールバックを追加
  - 取引先が選択された際に、既存のID変更通知に加えて取引先情報オブジェクトをコールバックで通知
  - 選択解除時にはnullをコールバックで通知
  - 既存のonChangeコールバック（ID文字列のみ）との後方互換性を維持
  - _Requirements: 1.6, 1.7_

- [x] 36.2 ProjectFormコンポーネントに住所自動入力ロジックを追加
  - 顧客選択時のコールバックハンドラを実装し、現場住所フィールドの現在値を判定
  - 現場住所フィールドが空欄（空文字列またはスペースのみ）の場合、選択された取引先の住所を現場住所に自動設定
  - 現場住所フィールドに既に値が入力されている場合は既存値を保持し、上書きしない
  - TradingPartnerSelectコンポーネントにコールバックを接続
  - 36.1の完了が必要
  - _Requirements: 1.6, 1.7_

## Task 37: 住所自動入力のテスト

- [x] 37.1 (P) TradingPartnerSelectのonSelectコールバックのユニットテスト
  - 取引先を選択した際にonSelectコールバックが取引先オブジェクト付きで呼び出されることを検証
  - 選択解除時にonSelectコールバックがnull付きで呼び出されることを検証
  - onSelectが未指定の場合でも正常に動作することを検証（後方互換性）
  - _Requirements: 1.6, 1.7_

- [x] 37.2 (P) ProjectFormの住所自動入力のユニットテスト
  - 現場住所が空欄の状態で顧客を選択した場合、取引先の住所が現場住所に自動入力されることを検証
  - 現場住所に既に値が入力されている状態で顧客を選択した場合、既存値が保持されることを検証
  - スペースのみの現場住所は空欄として扱い、自動入力が行われることを検証
  - _Requirements: 1.6, 1.7_

## Task 38: 住所自動入力のE2Eテスト

- [x] 38.1 顧客選択時の住所自動入力E2Eテスト
  - プロジェクト新規作成画面で現場住所が空の状態で顧客を選択し、取引先の住所が現場住所に自動入力されることを確認
  - プロジェクト新規作成画面で現場住所に値を入力した後に顧客を選択し、既存の住所が上書きされないことを確認
  - 自動入力された住所でプロジェクトが正常に保存されることを確認
  - 37.1、37.2完了後に実施
  - _Requirements: 1.6, 1.7_

---

## 差分実装タスク（2026-02-13要件変更対応）

以下のタスクは、2026-02-13の要件更新に対応するための差分実装です。

### 変更概要

1. **新規APIエンドポイント GET /api/projects/status-counts**: ステータス別プロジェクト件数をDBの全プロジェクト（論理削除を除く）から集計して返却（23.1-23.6）
2. **excludeTerminalStatusesクエリパラメータ追加**: ステータスフィルタ未指定時に終端ステータス（完了・中止・失注）をデフォルトで除外（2.7, 2.8, 5.5, 5.7, 5.8）
3. **デフォルト表示件数の変更**: バックエンド・フロントエンド両方で20件から100件に変更（3.1）
4. **StatsSummaryコンポーネントの変更**: 画面表示中のプロジェクトではなく新規status-counts APIからのデータを使用（23.1-23.6）

---

## Task 39: バックエンド - ステータス別件数集計API

- [x] 39.1 (P) ProjectServiceにgetStatusCountsメソッドを追加
  - Prisma groupByで全プロジェクト（deletedAt IS NULL）のステータス別件数を集計
  - 全12ステータスの初期値を0に設定し、groupBy結果で上書き
  - 合計件数を算出して返却
  - 検索条件・フィルタ条件は一切適用しない
  - _Requirements: 23.2, 23.3, 23.4, 23.5, 23.6_

- [x] 39.2 (P) GET /api/projects/status-countsエンドポイントを追加
  - /api/projects/:id より前にルートを定義してExpressルートマッチング競合を回避
  - 認証ミドルウェア（authenticate）を適用
  - 権限チェック（project:read）を適用
  - Swagger JSDocコメントを追加
  - _Requirements: 23.1, 12.1, 12.2, 14.7_

## Task 40: バックエンド - 終端ステータス除外とデフォルト件数変更

- [x] 40.1 (P) excludeTerminalStatusesパラメータをバリデーションスキーマに追加
  - projectFilterSchemaにexcludeTerminalStatusesフィールド（'true'/'false'のenum、booleanへ変換、オプショナル）を追加
  - _Requirements: 2.7, 2.8_

- [x] 40.2 ProjectServiceのgetProjectsメソッドに終端ステータス除外ロジックを追加
  - TERMINAL_STATUSES定数（COMPLETED, CANCELLED, LOST）を定義
  - ステータスフィルタが指定されている場合は既存ロジック（status in）を適用
  - ステータスフィルタが未指定かつexcludeTerminalStatuses=trueの場合、status notInで終端ステータスを除外
  - 40.1のスキーマ更新が必要
  - _Requirements: 2.7, 2.8_

- [x] 40.3 (P) paginationSchemaのデフォルト表示件数を100件に変更
  - limitフィールドのdefault値を20から100に変更
  - max(100)の上限は維持
  - _Requirements: 3.1_

## Task 41: フロントエンド - ステータス別件数APIクライアントと終端ステータス除外

- [x] 41.1 (P) プロジェクトAPIクライアントにステータス別件数取得関数を追加
  - getProjectStatusCounts関数を実装（GET /api/projects/status-counts）
  - StatusCountsResponse型（counts: Record<ProjectStatus, number>, total: number）を定義
  - エラーハンドリングを実装
  - _Requirements: 23.1_

- [x] 41.2 (P) プロジェクトAPIクライアントにexcludeTerminalStatusesパラメータ送信を追加
  - getProjects関数のクエリパラメータ構築にexcludeTerminalStatuses対応を追加
  - ProjectFilter型にexcludeTerminalStatusesフィールドを追加
  - _Requirements: 2.7, 2.8_

- [x] 41.3 (P) デフォルト表示件数を100件に変更
  - ProjectListPageのDEFAULT_LIMIT定数を20から100に変更
  - _Requirements: 3.1_

## Task 42: フロントエンド - ProjectListPageの統合変更

- [x] 42.1 ProjectListPageにステータス別件数取得と終端ステータス除外を統合
  - statusCounts状態とfetchStatusCounts関数を追加
  - 初回マウント時にステータス別件数を取得
  - ステータスフィルタ未指定時にexcludeTerminalStatuses=trueを付与
  - ステータスフィルタで終端ステータスが明示選択された場合はexcludeTerminalStatusesを送信しない
  - StatsSummaryコンポーネントのデータソースを画面表示中のプロジェクト配列からstatusCounts APIレスポンスに変更
  - フィルタクリア時にデフォルト状態（終端ステータス除外）に復帰する動作を確認
  - 41.1、41.2、41.3の完了が必要
  - _Requirements: 2.7, 2.8, 3.1, 5.5, 5.7, 5.8, 23.1, 23.2, 23.3, 23.4, 23.5, 23.6_

## Task 43: 差分実装のユニットテスト

- [x] 43.1 (P) getStatusCountsメソッドのユニットテスト
  - 全12ステータスの件数が正しく集計されることを検証
  - 論理削除されたプロジェクトがカウント対象外であることを検証
  - 0件のステータスも0として返却されることを検証
  - 合計件数が正しく算出されることを検証
  - _Requirements: 23.2, 23.3, 23.4, 23.5, 23.6_

- [x] 43.2 (P) excludeTerminalStatuses動作のユニットテスト
  - excludeTerminalStatuses=trueで終端ステータスのプロジェクトが除外されることを検証
  - ステータスフィルタとexcludeTerminalStatusesの両方が指定された場合、ステータスフィルタが優先されることを検証
  - excludeTerminalStatuses未指定時は全ステータスのプロジェクトが返却されることを検証
  - _Requirements: 2.7, 2.8_

- [x] 43.3 (P) status-countsエンドポイントのルートテスト
  - 認証済みユーザーがステータス別件数を取得できることを検証
  - 未認証リクエストが401を返却することを検証
  - 権限不足のリクエストが403を返却することを検証
  - _Requirements: 23.1, 12.1, 12.2_

- [x] 43.4 (P) フロントエンドStatsSummaryコンポーネントのユニットテスト
  - APIレスポンスのstatusCountsデータに基づいて全12ステータスの件数が表示されることを検証
  - 合計件数が表示されることを検証
  - statusCountsがnullの場合にコンポーネントが非表示になることを検証
  - _Requirements: 23.1, 23.4, 23.5, 23.6_

- [x] 43.5 (P) デフォルト表示件数変更のユニットテスト
  - バックエンドpaginationSchemaのデフォルトlimitが100であることを検証
  - フロントエンドDEFAULT_LIMITが100であることを検証
  - _Requirements: 3.1_

## Task 44: 差分実装のE2Eテスト

- [x] 44.1 ステータス別件数表示E2Eテスト
  - プロジェクト一覧画面でステータス別件数が表示されることを確認
  - 全12ステータスの件数が表示されていることを確認
  - 合計件数が表示されていることを確認
  - 検索・フィルタ操作後もステータス別件数が変化しないことを確認
  - 43.1、43.4完了後に実施
  - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6_

- [x] 44.2 終端ステータス除外E2Eテスト
  - プロジェクト一覧画面のデフォルト表示で完了・中止・失注ステータスのプロジェクトが表示されないことを確認
  - ステータスフィルタで「完了」を選択した場合に完了ステータスのプロジェクトが表示されることを確認
  - フィルタクリア後に再び終端ステータスのプロジェクトが非表示になることを確認
  - 43.2完了後に実施
  - _Requirements: 2.7, 2.8, 5.5, 5.7, 5.8_

- [x] 44.3 デフォルト表示件数E2Eテスト
  - プロジェクト一覧画面のデフォルト表示で最大100件まで表示されることを確認
  - ページネーションのデフォルト表示件数が100件であることを確認
  - 43.5完了後に実施
  - _Requirements: 3.1_

## Task 45: 統合テストと動作確認

- [x] 45.1 差分実装の統合テスト
  - ステータス別件数APIが全プロジェクトの件数を正しく返却することを確認
  - 終端ステータス除外が一覧取得APIで正しく動作することを確認
  - デフォルト表示件数100件が正しく反映されていることを確認
  - StatsSummaryが新規APIからデータを取得して表示していることを確認
  - 既存機能（検索、ソート、フィルタリング、ページネーション、CRUD）への影響がないことを確認
  - 44.1〜44.3完了後に実施
  - _Requirements: 2.7, 2.8, 3.1, 5.5, 5.7, 5.8, 23.1, 23.2, 23.3, 23.4, 23.5, 23.6_

---

## 差分実装タスク（2026-02-13要件変更対応）: プロジェクト詳細セクション集約とAPI効率化

> Requirements 24-29 に基づく差分実装。プロジェクト詳細画面の5セクション要件を集約し、7つの個別APIリクエストを1つの一括取得APIに統合する。

### 変更概要

1. **セクション要件の集約**（Requirements 24-28）: 各機能specに分散していた現場調査・数量表・内訳書・見積依頼・見積書セクションの表示要件をproject-management specに集約
2. **プロジェクト詳細API効率化**（Requirement 29）: 7つの個別APIリクエストを1つの一括取得API（`GET /api/projects/:id/detail-summary`）に統合
3. **既存セクションカードコンポーネント**: SiteSurveySectionCard、QuantityTableSectionCard、ItemizedStatementSectionCard、EstimateRequestSectionCard、EstimateSectionCardは実装済み。一括取得API経由のデータ供給に切り替える

---

## Task 46: バックエンド - プロジェクト詳細一括取得APIエンドポイント

- [x] 46.1 (P) ProjectDetailSummaryレスポンス型の定義
  - ProjectDetailSummaryインターフェースを定義し、project（基本情報）、statusHistory（ステータス変更履歴）、sections（5つのセクションサマリー）を含める
  - sectionsオブジェクトの各セクション型（siteSurveys、quantityTables、itemizedStatements、estimateRequests、estimates）を定義
  - 各セクション型にtotalCountとlatest配列を含め、既存の個別APIレスポンス型との互換性を確保
  - _Requirements: 29.3, 29.6_

- [x] 46.2 (P) getProjectSectionsヘルパー関数の実装
  - 5つの既存サービスメソッド（SiteSurveyService.findLatestByProjectId、QuantityTableService.findLatestByProjectId、ItemizedStatementService.findLatestByProjectId、EstimateRequestService.findLatestByProjectId、EstimateService.findLatestByProjectId）をPromise.allSettled()で並列呼び出し
  - 個別セクションの取得エラー時はデフォルト値（totalCount: 0、latest配列: 空配列）にフォールバックし、他セクションの正常返却を妨げない
  - EstimateServiceの返却型のフィールド名をestimatesからlatestEstimatesに変換
  - 46.1の型定義が必要
  - _Requirements: 29.1, 29.4_

- [x] 46.3 GET /api/projects/:id/detail-summary エンドポイントの実装
  - projects.routes.tsに新規ルートハンドラを追加
  - 認証ミドルウェア（authenticateToken）と権限チェック（project:read）を適用
  - プロジェクト基本情報とステータス履歴をPromise.all()で並列取得（必須データ: 取得失敗時は404/403エラー返却）
  - 5セクションサマリーをgetProjectSectionsで並列取得し、project、statusHistory、sectionsを一括返却
  - Swagger JSDocコメントを追加
  - 46.2の完了が必要
  - _Requirements: 29.1, 29.2, 29.3, 29.5_

## Task 47: フロントエンド - API統合とProjectDetailPageリファクタリング

- [x] 47.1 (P) getProjectDetailSummary API関数とProjectDetailSummary型の追加
  - APIクライアントにgetProjectDetailSummary関数を追加（GET /api/projects/:id/detail-summary）
  - ProjectDetailSummary型（project、statusHistory、sections）を定義
  - sections内の各セクションサマリー型を定義
  - 既存の個別API関数（getProject、getStatusHistory等）は削除せず残す（他画面からの利用可能性を考慮）
  - 46.3の完了が必要
  - _Requirements: 29.2, 29.6_

- [x] 47.2 ProjectDetailPageのfetchProject関数リファクタリング
  - 7つの個別APIリクエスト（getProject、getStatusHistory + 5セクション逐次取得）をgetProjectDetailSummaryの1リクエストに置換
  - レスポンスからproject、statusHistory、各セクションサマリーを分解して各状態変数にセット
  - 5つの個別セクション用ローディング状態を1つのisLoading状態に統合
  - 既存のセクションカードコンポーネントへのprops受け渡しは変更なし
  - 47.1の完了が必要
  - _Requirements: 29.2, 29.5_

- [x] 47.3 不要なローディング状態の整理
  - isSurveyLoading、isQuantityTableLoading、isItemizedStatementLoading、isEstimateRequestLoading、isEstimateLoadingの5つの個別ローディング状態を削除
  - 各セクションカードのローディング表示をisLoading（メインのローディング状態）に統一
  - 47.2の完了が必要
  - _Requirements: 29.5_

## Task 48: バックエンドユニットテスト - プロジェクト詳細一括取得API

- [x] 48.1 (P) detail-summaryエンドポイントのルートテスト
  - 認証済みユーザーがプロジェクト詳細一括データを取得できることを検証
  - レスポンスにproject、statusHistory、sections（5セクション）が含まれることを検証
  - 未認証リクエストが401を返却することを検証
  - 権限不足のリクエストが403を返却することを検証
  - 存在しないプロジェクトIDでの404エラーを検証
  - _Requirements: 29.1, 29.3_

- [x] 48.2 (P) getProjectSectionsヘルパーのユニットテスト
  - 全5セクションが正常に取得できた場合のレスポンス構造を検証
  - 個別セクション（例: SiteSurveyService）がエラーをスローした場合、当該セクションがデフォルト値（totalCount: 0、空配列）にフォールバックし、他セクションは正常値を返却することを検証
  - 全セクションがエラーの場合でも全セクションがデフォルト値で返却されることを検証
  - EstimateServiceのフィールド名変換（estimates→latestEstimates）を検証
  - _Requirements: 29.4, 29.6_

## Task 49: フロントエンドユニットテスト - プロジェクト詳細一括取得

- [x] 49.1 (P) getProjectDetailSummary API関数のテスト
  - 正常なAPIレスポンスの取得とパースを検証
  - ネットワークエラー時の例外伝播を検証
  - 404/403エラー時のハンドリングを検証
  - _Requirements: 29.2_

- [x] 49.2 (P) ProjectDetailPageの一括取得動作テスト
  - fetchProject関数がgetProjectDetailSummaryを1回だけ呼び出すことを検証
  - レスポンスのproject、statusHistory、各セクションサマリーが正しく状態変数にセットされることを検証
  - isLoading状態がリクエスト開始時にtrue、完了時にfalseになることを検証
  - API失敗時のエラー表示を検証
  - _Requirements: 29.2, 29.5_

## Task 50: E2Eテスト - プロジェクト詳細セクション表示とAPI効率化

- [x] 50.1 現場調査セクション表示E2Eテスト
  - プロジェクト詳細画面に現場調査セクションが表示されることを確認
  - 直近2件の現場調査への参照リンクと総数が表示されることを確認
  - 「すべて表示」リンクをクリックして現場調査一覧画面に遷移することを確認
  - _Requirements: 24.1, 24.2_

- [x] 50.2 数量表セクション表示E2Eテスト
  - プロジェクト詳細画面に数量表セクションが表示されることを確認
  - 数量表の総数とヘッダーが表示されることを確認
  - 数量表が存在する場合、直近の数量表カード（名称・更新日時・数量項目数）が表示されることを確認
  - 「すべて見る」リンクをクリックして数量表一覧画面に遷移することを確認
  - 数量表カードをクリックして編集画面に遷移することを確認
  - 数量表が存在しない場合、「数量表はまだありません」メッセージと新規作成ボタンが表示されることを確認
  - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7_

- [x] 50.3 内訳書セクション表示E2Eテスト
  - プロジェクト詳細画面に内訳書セクションが数量表セクションの下に表示されることを確認
  - 数量表が存在しない場合、「まず数量表を作成してください」メッセージが表示されることを確認
  - 数量表はあるが内訳書がない場合、「内訳書はまだありません」メッセージが表示されることを確認
  - 内訳書が存在する場合、各行に内訳書名・作成日時・集計元数量表名・合計項目数が表示されることを確認
  - 内訳書行クリックで詳細画面に遷移することを確認
  - 数量表が存在する場合に新規作成ボタンが表示されることを確認
  - 一覧画面へのリンクが表示されることを確認
  - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8, 26.9, 26.10, 26.11_

- [x] 50.4 見積依頼セクション表示E2Eテスト
  - プロジェクト詳細画面に見積依頼セクションが内訳書セクションの下に表示されることを確認
  - 見積依頼が存在しない場合、「見積依頼はまだありません」メッセージとメッセージ下の「新規作成」ボタンが表示されることを確認
  - 見積依頼が存在しない場合、セクション右上の「新規作成」ボタンと「すべて見る」リンクが非表示であることを確認
  - 見積依頼が存在する場合、セクション内に一覧が表示され、セクション右上に「新規作成」ボタンと「すべて見る」リンクが表示されることを確認
  - 「新規作成」ボタンクリックで見積依頼作成画面に遷移することを確認
  - 「すべて見る」リンククリックで見積依頼一覧画面に遷移することを確認
  - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7, 27.8_

- [x] 50.5 見積書セクション表示E2Eテスト
  - プロジェクト詳細画面に見積書セクションが見積依頼セクションの下に表示されることを確認
  - セクションタイトル「見積書」と総数が表示されることを確認
  - 見積書が存在する場合、直近の見積書カード（見積書名・作成日時・合計金額）が表示されることを確認
  - 見積書カードクリックで見積書画面に遷移することを確認
  - 「すべて見る」リンクと新規作成ボタンが表示されることを確認
  - 見積書が存在しない場合、「見積書はまだありません」メッセージと新規作成ボタンが表示されることを確認
  - ローディング中にスケルトンローダーが表示されることを確認
  - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7, 28.8, 28.9, 28.10, 28.11, 28.12, 28.13_

- [x] 50.6 プロジェクト詳細API効率化E2Eテスト
  - プロジェクト詳細画面の初期表示で全セクションが正しく表示されることを確認
  - ネットワークリクエスト数が削減されていることを確認（detail-summary APIが1リクエストで返却）
  - 各セクションのリンク・ボタンが正常に動作することを確認
  - _Requirements: 29.1, 29.2, 29.3, 29.5, 29.6_

## Task 51: 統合テストと動作確認

- [x] 51.1 差分実装の統合テスト
  - detail-summary APIが全セクションデータを正しく一括返却することを確認
  - 個別セクションエラー時に他セクションが正常に表示されることを確認
  - 既存の個別APIエンドポイント（site-surveys/latest等）が引き続き動作することを確認
  - ProjectDetailPageが1リクエストで全データを取得し全セクションをレンダリングすることを確認
  - 既存機能（プロジェクトCRUD、ステータス遷移、検索・フィルタ）への影響がないことを確認
  - E2Eテスト要件カバレッジタグが移動先の要件ID（24-29）に更新されていることを確認
  - 50.1〜50.6完了後に実施
  - _Requirements: 24.1, 24.2, 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7, 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8, 26.9, 26.10, 26.11, 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7, 27.8, 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7, 28.8, 28.9, 28.10, 28.11, 28.12, 28.13, 29.1, 29.2, 29.3, 29.4, 29.5, 29.6_

---

## Task 52: detail-summary APIのサムネイルURL変換修正（Requirement 30）

- [x] 52.1 getProjectSections ヘルパー関数にサムネイルURL変換ロジックを追加
  - `backend/src/routes/projects.routes.ts` の `getProjectSections()` 関数を修正
  - `isStorageConfigured()`, `getStorageProvider()` を `../storage/index.js` からインポート
  - `siteSurveys.latestSurveys` の各要素に対して以下を実施:
    - `survey.thumbnailUrl`（ストレージパス）を `storageProvider.getSignedUrl()` で署名付きURLに変換
    - `survey.thumbnailOriginalPath` を `storageProvider.getSignedUrl()` で署名付きURLに変換し `thumbnailOriginalUrl` として返却
  - ストレージ未設定時は `thumbnailUrl`, `thumbnailOriginalUrl` を `null` として返却
  - 個別の署名付きURL生成失敗時は該当フィールドを `null` とし、他のデータ返却を妨げない
  - `site-surveys.routes.ts` の `/latest` エンドポイント（行234-281）と同一のロジックパターンを使用
  - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5_

- [x] 52.2 サムネイルURL変換の単体テスト
  - `backend/src/__tests__/unit/routes/projects.routes.test.ts` にテストケースを追加
  - ストレージ設定済み時: `thumbnailUrl` と `thumbnailOriginalUrl` が署名付きURLに変換されることを検証
  - ストレージ未設定時: `thumbnailUrl` と `thumbnailOriginalUrl` が `null` であることを検証
  - 署名付きURL生成失敗時: 該当フィールドが `null` になり、他のデータが正常に返却されることを検証
  - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5_

## Task 53: プロジェクト詳細画面のUI改善（Requirements 31-34）

- [x] 53.1 パンくずナビゲーション更新
  - `frontend/src/pages/ProjectDetailPage.tsx` の Breadcrumb items を修正
  - 変更前: `['ダッシュボード', 'プロジェクト', project.name]`
  - 変更後: `['ダッシュボード', 'プロジェクト一覧', 'プロジェクト詳細']`
  - 「ダッシュボード」→ `/` へ遷移、「プロジェクト一覧」→ `/projects` へ遷移、「プロジェクト詳細」はリンクなし（現在地）
  - _Requirements: 31.1, 31.2, 31.3, 31.4_

- [x] 53.2 「← 一覧に戻る」リンク削除
  - `frontend/src/pages/ProjectDetailPage.tsx` から `<Link to="/projects">← 一覧に戻る</Link>` を削除
  - 不要になった `styles.backLink` スタイル定義を削除
  - _Requirements: 32.1, 32.2_

- [x] 53.3 基本情報のクリップボードコピーボタン追加
  - `CopyButton` ローカルコンポーネントを `ProjectDetailPage.tsx` 内に実装
  - `navigator.clipboard.writeText()` でテキストをコピー
  - コピー成功時に「コピーしました」フィードバックを2秒間表示
  - コピーボタンにクリップボードアイコン（SVG）を使用、ホバー時にツールチップ「コピー」を表示
  - コピー成功後はチェックマークアイコンに変化
  - プロジェクト名、顧客名、現場住所のフィールドにコピーボタンを追加
  - 顧客名が未設定（null）の場合はコピーボタンを非表示
  - 現場住所が空欄の場合はコピーボタンを非表示
  - _Requirements: 33.1, 33.2, 33.3, 33.4, 33.5, 33.6, 33.7, 33.8, 33.9_

- [x] 53.4 基本情報の作成日時・更新日時フィールド削除
  - `frontend/src/pages/ProjectDetailPage.tsx` の基本情報セクションから作成日時フィールドと更新日時フィールドのJSXブロックを削除
  - `formatDate` 関数が他で使用されていない場合は削除（使用箇所を確認してから判断）
  - _Requirements: 34.1, 34.2_

- [x] 53.5 プロジェクト詳細画面UI改善の単体テスト
  - `frontend/src/__tests__/pages/ProjectDetailPage.test.tsx` にテストケースを追加/更新
  - パンくず: 「ダッシュボード > プロジェクト一覧 > プロジェクト詳細」が表示されることを検証
  - 「一覧に戻る」リンクが表示されないことを検証
  - コピーボタン: プロジェクト名、顧客名、現場住所の各コピーボタンが表示されることを検証
  - コピーボタンクリック時に `navigator.clipboard.writeText()` が呼ばれることを検証
  - 顧客名が未設定時にコピーボタンが非表示であることを検証
  - 作成日時・更新日時が表示されないことを検証
  - _Requirements: 31.1, 31.2, 31.3, 31.4, 32.1, 33.1, 33.2, 33.3, 33.4, 33.5, 33.6, 33.7, 33.8, 34.1, 34.2_

## Task 54: ステータス変更履歴の表示制限と全件表示ダイアログ（Requirement 35）

- [x] 54.1 ステータス変更履歴の表示を直近3件に制限
  - `frontend/src/components/projects/StatusTransitionUI.tsx` を修正
  - `statusHistory` の表示を `statusHistory.slice(0, 3)` で直近3件に制限
  - 既存の履歴アイテムレンダリングロジックを `HistoryItem` サブコンポーネントとして切り出し（ダイアログとの再利用のため）
  - _Requirements: 35.1_

- [x] 54.2 「すべての履歴を表示」リンクを追加
  - `statusHistory.length > 3` の場合に「すべての履歴を表示（全N件）」リンクを表示
  - `statusHistory.length <= 3` の場合はリンクを非表示
  - _Requirements: 35.2, 35.3_

- [x] 54.3 全件表示ダイアログを実装
  - `StatusHistoryDialog` コンポーネントを `StatusTransitionUI.tsx` 内にローカルコンポーネントとして実装
  - モーダルダイアログ: `role="dialog"`, `aria-modal="true"` でアクセシビリティ対応
  - ダイアログタイトル: 「ステータス変更履歴（全N件）」
  - 全件を時系列順（新しい順）で表示（`HistoryItem` サブコンポーネントを再利用）
  - 「閉じる」ボタンでダイアログを閉じる
  - ダイアログ外クリック（オーバーレイ）でダイアログを閉じる
  - ダイアログの最大幅640px、最大高さ80vh（スクロール対応）
  - _Requirements: 35.4, 35.5, 35.6, 35.7, 35.8_

- [x] 54.4 ステータス変更履歴UIの単体テスト
  - `frontend/src/__tests__/components/projects/StatusTransitionUI.test.tsx` にテストケースを追加
  - 履歴3件以下: 全件が表示され、「すべての履歴を表示」リンクが非表示であることを検証
  - 履歴4件以上: 直近3件のみ表示され、「すべての履歴を表示」リンクが表示されることを検証
  - リンクをクリック: ダイアログが開き、全件が表示されることを検証
  - ダイアログの「閉じる」ボタンクリックでダイアログが閉じることを検証
  - _Requirements: 35.1, 35.2, 35.3, 35.4, 35.5, 35.6, 35.7, 35.8_

## Task 55: 統合テストと動作確認

- [x] 55.1 Requirements 30-35 の統合テスト
  - detail-summary APIでサムネイルが署名付きURLとして返却されることを確認
  - プロジェクト詳細画面でパンくずが「ダッシュボード > プロジェクト一覧 > プロジェクト詳細」と表示されることを確認
  - 「一覧に戻る」リンクが表示されないことを確認
  - プロジェクト名、顧客名、現場住所にコピーボタンが表示され、クリップボードにコピーできることを確認
  - 基本情報セクションに作成日時・更新日時が表示されないことを確認
  - ステータス変更履歴が直近3件のみ表示され、4件以上の場合に全件表示ダイアログが動作することを確認
  - 52.1〜54.4完了後に実施
  - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 31.1, 31.2, 31.3, 31.4, 32.1, 32.2, 33.1, 33.2, 33.3, 33.4, 33.5, 33.6, 33.7, 33.8, 33.9, 34.1, 34.2, 35.1, 35.2, 35.3, 35.4, 35.5, 35.6, 35.7, 35.8_

## Task 56: プロジェクト一覧画面の改善（パンくず・作成日列・フィルタ削除）

- [x] 56.1 パンくずナビゲーションの「プロジェクト一覧」表記統一
  - `frontend/src/pages/ProjectListPage.tsx`: パンくずの `{ label: 'プロジェクト' }` を `{ label: 'プロジェクト一覧' }` に変更
  - `frontend/src/pages/ProjectCreatePage.tsx`: パンくずの `{ label: 'プロジェクト', path: '/projects' }` を `{ label: 'プロジェクト一覧', path: '/projects' }` に変更
  - `frontend/src/pages/ProjectEditPage.tsx`: パンくずの `{ label: 'プロジェクト', path: '/projects' }` を `{ label: 'プロジェクト一覧', path: '/projects' }` に変更
  - _Requirements: 21.14, 21.15, 21.16, 21.17_

- [x] 56.2 プロジェクト一覧テーブルから「作成日」列を削除
  - `frontend/src/components/projects/ProjectListTable.tsx`: COLUMNS配列から `{ key: 'createdAt', label: '作成日', sortable: true }` を削除
  - `frontend/src/components/projects/ProjectListTable.tsx`: SortField型から `'createdAt'` を削除
  - `frontend/src/components/projects/ProjectListTable.tsx`: テーブル行の作成日セルレンダリングを削除
  - `frontend/src/components/projects/ProjectListCard.tsx`: モバイルカードの作成日表示を削除
  - _Requirements: 2.2, 6.5_

- [x] 56.3 期間フィルタ（作成日）の削除
  - `frontend/src/components/projects/ProjectSearchFilter.tsx`: 期間フィルタUI（作成日の開始日・終了日）を削除
  - `frontend/src/components/projects/ProjectSearchFilter.tsx`: `handleFromDateChange`/`handleToDateChange` ハンドラを削除
  - `frontend/src/components/projects/ProjectSearchFilter.tsx`: `activeFilterCount` の `createdFrom`/`createdTo` カウントを削除
  - `frontend/src/pages/ProjectListPage.tsx`: `createdFrom`/`createdTo` のURLパラメータ処理を削除
  - `frontend/src/types/project.types.ts`: `ProjectFilter` の `createdFrom`/`createdTo` プロパティを削除
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 56.4 テスト修正
  - パンくずナビゲーションのテストで「プロジェクト」→「プロジェクト一覧」に期待値を更新
  - 作成日列関連のテストを削除または更新
  - 期間フィルタ関連のテストを削除または更新
  - _Requirements: 2.2, 5.1, 5.2, 5.3, 5.4, 6.5, 21.14, 21.15, 21.16, 21.17_

- [x] 56.5 E2Eテスト修正
  - パンくずナビゲーションのE2Eテストで「プロジェクト」→「プロジェクト一覧」に期待値を更新
  - 作成日列・期間フィルタ関連のE2Eテストを更新
  - _Requirements: 2.2, 5.1, 5.2, 5.3, 5.4, 6.5, 21.14, 21.15, 21.16, 21.17_
