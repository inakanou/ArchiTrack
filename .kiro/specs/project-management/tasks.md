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
  - テーブル形式での一覧表示（ID、プロジェクト名、取引先名、ステータス、作成日、更新日）を実装
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
  - 期間フィルタ（作成日範囲）を実装
  - フィルタクリアボタンを実装
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5_

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
  - 「ダッシュボード > プロジェクト」のパンくずを表示
  - ダッシュボードリンクは / へ遷移可能に設定
  - 「プロジェクト」は現在ページとしてリンクなしで表示
  - アクセシビリティ属性（aria-label、aria-current）を確認
  - _Requirements: 21.14, 21.18_

- [x] 18.2 (P) ProjectDetailPageへのパンくずナビゲーション追加
  - 既存のBreadcrumbコンポーネントをインポートして使用
  - 「ダッシュボード > プロジェクト > [プロジェクト名]」のパンくずを表示
  - ダッシュボードリンクは / へ遷移可能に設定
  - プロジェクトリンクは /projects へ遷移可能に設定
  - プロジェクト名は現在ページとしてリンクなしで表示
  - プロジェクト名はAPIから取得したデータを動的に表示
  - アクセシビリティ属性を確認
  - _Requirements: 21.15, 21.18_

- [x] 18.3 (P) ProjectCreatePageへのパンくずナビゲーション追加
  - 既存のBreadcrumbコンポーネントをインポートして使用
  - 「ダッシュボード > プロジェクト > 新規作成」のパンくずを表示
  - ダッシュボードリンクは / へ遷移可能に設定
  - プロジェクトリンクは /projects へ遷移可能に設定
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
  - 「ダッシュボード > プロジェクト > [プロジェクト名] > 編集」のパンくずを表示
  - ダッシュボードリンクは / へ遷移可能に設定
  - プロジェクトリンクは /projects へ遷移可能に設定
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
  - 一覧ページで「ダッシュボード > プロジェクト」の表示を確認
  - 詳細ページで「ダッシュボード > プロジェクト > [プロジェクト名]」の表示を確認
  - 新規作成ページで「ダッシュボード > プロジェクト > 新規作成」の表示を確認
  - 編集ページで「ダッシュボード > プロジェクト > [プロジェクト名] > 編集」の表示を確認
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

- [ ] 22.1 (P) SortField型定義の更新
  - SortFieldから'id'を削除
  - SortFieldに'salesPersonName', 'constructionPersonName'を追加
  - ProjectListPageの状態管理に反映
  - _Requirements: 6.5_

- [ ] 22.2 ProjectListTableコンポーネントの列構成変更
  - COLUMNS配列からID列を削除
  - COLUMNS配列に営業担当者列を追加（key: 'salesPersonName'）
  - COLUMNS配列に工事担当者列を追加（key: 'constructionPersonName'）
  - テーブルセルのレンダリングで担当者の表示名を表示
  - 工事担当者はnullableなのでオプショナルチェイン（project.constructionPerson?.displayName ?? '-'）
  - 22.1の型更新が必要
  - _Requirements: 2.2, 6.5_

- [ ] 22.3 (P) ProjectListCardコンポーネントの表示項目更新
  - カード表示に営業担当者を追加
  - カード表示に工事担当者を追加
  - モバイル表示時のレイアウト調整
  - _Requirements: 2.2_

- [ ] 22.4 (P) プロジェクトAPIクライアントに409エラーハンドリング追加
  - createProject関数で409エラーを識別
  - updateProject関数で409エラーを識別
  - DuplicateProjectNameErrorResponse型を定義
  - エラー情報を呼び出し元に伝播
  - _Requirements: 1.15, 8.7_

- [ ] 22.5 ProjectFormコンポーネントにプロジェクト名重複エラー表示を追加
  - submitError propsでサーバーエラーを受け取り
  - 409エラー時にプロジェクト名フィールドにエラーメッセージを表示
  - 「このプロジェクト名は既に使用されています」メッセージを表示
  - 22.4のエラーハンドリングが必要
  - _Requirements: 1.15, 8.7_

- [ ] 22.6 ProjectCreatePageに409エラーハンドリングを追加
  - createProject呼び出し時の409エラーをキャッチ
  - ProjectFormにsubmitErrorを渡す
  - エラー発生時のUIフィードバック（トースト通知）
  - 22.4と22.5が必要
  - _Requirements: 1.15_

- [ ] 22.7 ProjectEditPageに409エラーハンドリングを追加
  - updateProject呼び出し時の409エラーをキャッチ
  - ProjectFormにsubmitErrorを渡す
  - エラー発生時のUIフィードバック（トースト通知）
  - 22.4と22.5が必要
  - _Requirements: 8.7_

## Task 23: フリガナ検索ひらがな・カタカナ両対応

- [ ] 23.1 取引先サービスのひらがな・カタカナ変換確認
  - trading-partner.service.tsのひらがな⇔カタカナ変換ロジックが実装済みか確認
  - 実装済みでない場合は変換関数を追加
  - 検索時にhiraganaToKatakana、katakanaToHiragana両方で検索
  - _Requirements: 16.3, 22.5_

## Task 24: 差分実装のテスト

- [ ] 24.1 (P) プロジェクト名一意性チェックのユニットテスト
  - createProject: 重複プロジェクト名でDuplicateProjectNameErrorを検証
  - updateProject: 重複プロジェクト名（自身除外）でエラーを検証
  - updateProject: 同名でも自身の場合はエラーなしを検証
  - 論理削除されたプロジェクト名は重複チェック対象外を検証
  - _Requirements: 1.15, 1.16, 8.7, 8.8_

- [ ] 24.2 (P) 検索対象拡張のユニットテスト
  - getProjects: 営業担当者名での検索を検証
  - getProjects: 工事担当者名での検索を検証
  - getProjects: 複数フィールド（プロジェクト名、顧客名、担当者名）の部分一致を検証
  - _Requirements: 4.1a, 4.1b_

- [ ] 24.3 (P) ソート拡張のユニットテスト
  - getProjects: salesPersonNameでの昇順・降順ソートを検証
  - getProjects: constructionPersonNameでの昇順・降順ソートを検証
  - getProjects: customerNameでの昇順・降順ソートを検証
  - _Requirements: 6.5_

- [ ] 24.4 (P) フロントエンド一覧表示のユニットテスト
  - ProjectListTable: 営業担当者列の表示を検証
  - ProjectListTable: 工事担当者列の表示を検証
  - ProjectListTable: ID列が表示されないことを検証
  - ProjectListTable: 工事担当者null時の「-」表示を検証
  - _Requirements: 2.2_

- [ ] 24.5 (P) プロジェクト名重複エラー表示のユニットテスト
  - ProjectForm: 409エラー時のエラーメッセージ表示を検証
  - ProjectCreatePage: 作成時の重複エラーハンドリングを検証
  - ProjectEditPage: 更新時の重複エラーハンドリングを検証
  - _Requirements: 1.15, 8.7_

## Task 25: 差分実装のE2Eテスト

- [ ] 25.1 プロジェクト名一意性チェックE2Eテスト
  - プロジェクト作成時に重複プロジェクト名でエラーメッセージが表示されることを確認
  - プロジェクト編集時に重複プロジェクト名でエラーメッセージが表示されることを確認
  - 重複エラー後にプロジェクト名を変更して正常に保存できることを確認
  - 24.1完了後に実施
  - _Requirements: 1.15, 1.16, 8.7, 8.8_

- [ ] 25.2 一覧表示の列構成変更E2Eテスト
  - 一覧画面でID列が表示されないことを確認
  - 一覧画面で営業担当者列が表示されることを確認
  - 一覧画面で工事担当者列が表示されることを確認
  - 営業担当者・工事担当者の表示名が正しく表示されることを確認
  - 工事担当者未設定時に「-」が表示されることを確認
  - _Requirements: 2.2_

- [ ] 25.3 検索対象拡張E2Eテスト
  - 営業担当者名での検索結果が正しいことを確認
  - 工事担当者名での検索結果が正しいことを確認
  - 複数フィールドにまたがる検索が動作することを確認
  - 24.2完了後に実施
  - _Requirements: 4.1a, 4.1b_

- [ ] 25.4 ソート拡張E2Eテスト
  - 営業担当者列のヘッダークリックでソートが動作することを確認
  - 工事担当者列のヘッダークリックでソートが動作することを確認
  - 昇順・降順の切り替えが正しく動作することを確認
  - ソートアイコンが適切に表示されることを確認
  - 24.3完了後に実施
  - _Requirements: 6.5_

## Task 26: 統合テストと動作確認

- [ ] 26.1 差分実装の統合テスト
  - バックエンドAPIの一貫性を確認（検索、ソート、一意性チェック）
  - フロントエンドUIの整合性を確認
  - 既存機能への影響がないことを確認
  - エラーハンドリングの動作確認
  - 25.1〜25.4完了後に実施
  - _Requirements: 1.15, 1.16, 2.2, 4.1a, 4.1b, 6.5, 8.7, 8.8, 16.3, 22.5_
