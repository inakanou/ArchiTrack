# 実装タスク

本ドキュメントは、ユーザー認証機能（user-authentication）の実装タスクを定義します。要件定義書（requirements.md）と技術設計書（design.md）に基づいて、段階的に実装を進めます。

## タスク一覧

- [ ] 1. プロジェクト基盤整備とデータモデル構築

- [x] 1.1 ユーザー情報とアクセス制御のデータモデル構築
  - 招待制ユーザー登録に必要なデータ構造を定義
  - ロールベースアクセス制御のデータ関係を確立
  - セッション管理と二要素認証のデータ保存機能を準備
  - データ検索性能を最適化するインデックス戦略を実装
  - データベーススキーマをマイグレーションで適用
  - _Requirements: 1-27（全要件の基盤）_
  - _Details: design.md「Data Model」セクション参照_
  - _Completion Criteria:_
    - Prismaマイグレーション実行成功
    - 全テーブルがスキーマ定義通り作成されている
    - インデックスが正しく適用されている
    - `npm run prisma:studio`でデータモデル確認可能

- [x] 1.2 JWT署名鍵の生成と公開鍵配布機能の準備
  - EdDSA署名用の鍵ペアを生成
  - 秘密鍵と公開鍵を環境変数用に準備
  - 公開鍵をJWKS形式で配布するエンドポイントを実装
  - _Requirements: 5.7, 5.8, 5.9, 5.10_
  - _Details: design.md「Token Management」セクション参照_
  - _Completion Criteria:_
    - 鍵ペア生成スクリプトが動作する
    - 環境変数に設定可能な形式で出力される
    - `/.well-known/jwks.json`が正しいJWKS形式を返す

- [x] 1.3 認証機能に必要な依存関係のインストール
  - JWT署名・検証ライブラリを追加
  - パスワードハッシュライブラリを追加
  - メール送信とキュー管理ライブラリを追加
  - 二要素認証とパスワード強度評価ライブラリを追加
  - 型定義ファイルを含むすべての依存関係を設定
  - _Requirements: 2.6, 2.7, 5.7, 7.2, 27.2, 27.3_
  - _Details: design.md「Dependencies」セクション参照_
  - _Completion Criteria:_
    - `npm install`が成功する
    - 型定義ファイルが正しくインストールされている
    - TypeScript型チェックがエラーなく通る

- [x] 1.4 環境変数の設定とパスワード強度チェック準備
  - トークン有効期限の環境変数を設定
  - 二要素認証暗号化鍵の環境変数を設定
  - 初期管理者アカウント情報の環境変数を設定
  - 漏洩パスワードデータベースをBloom Filterに変換
  - Frontend APIベースURLとトークンリフレッシュ設定を追加
  - _Requirements: 2.7, 3.1, 5.9, 5.10, 27C.4, 27C.5_
  - _Details: design.md「Environment Variables」「Password Security」セクション参照_
  - _Completion Criteria:_
    - `.env.example`ファイルが全環境変数を含む
    - Bloom Filterデータが正しく生成されている
    - 環境変数のバリデーションが動作する

- [ ] 2. 認証システムのコア機能実装
  - _Dependencies: タスク1完了（データモデル、依存関係、環境変数）_

- [x] 2.1 JWTトークンの生成・検証機能の実装
  - EdDSA署名によるアクセストークンを発行する機能を実装
  - EdDSA署名によるリフレッシュトークンを発行する機能を実装
  - トークンの署名検証とペイロード抽出機能を実装
  - トークンのデコード機能を実装（検証なし）
  - _Requirements: 5.1, 5.2, 5.4, 5.6, 5.7, 5.8, 5.9, 5.10_
  - _Details: design.md「Token Management」セクション参照_
  - _Completion Criteria:_
    - トークン生成がEdDSA署名で動作する
    - トークン検証が正しく署名をチェックする
    - 有効期限が環境変数に従って設定される

- [x] 2.2 セキュアなパスワード管理機能の実装
  - パスワードのハッシュ化機能を実装
  - ハッシュ化されたパスワードの検証機能を実装
  - パスワード強度の評価機能を実装（長さ、複雑性、漏洩チェック）
  - パスワード履歴の管理機能を実装（過去3回の再利用防止）
  - _Requirements: 2.6, 2.7, 2.8, 2.9, 7.2, 7.6, 7.7, 7.8, 10.2_
  - _Details: design.md「Password Security」セクション参照_
  - _Completion Criteria:_
    - ✅ Argon2idハッシュが正しいパラメータで動作する
    - ✅ 漏洩パスワードがBloom Filterで検出される（簡易実装、Bloom Filter統合は将来タスク）
    - ✅ パスワード履歴が自動的に管理される
    - ✅ テストカバレッジ100%達成（Statements, Functions, Lines）
    - ✅ 全22テストが成功

- [x] 2.3 招待制ユーザー登録の管理機能実装
  - 管理者による新規ユーザー招待機能を実装
  - 招待トークンの検証機能を実装（有効期限、使用済みチェック）
  - 招待の取り消し機能を実装
  - 招待一覧の取得機能を実装（ステータス別フィルタリング対応）
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_
  - _Details: design.md「Invitation Service」セクション参照_
  - _Completion Criteria:_
    - ✅ 招待トークンが暗号学的に安全に生成される
    - ✅ 有効期限が7日間で設定される
    - ✅ ステータス管理が正しく動作する
    - ✅ テストカバレッジ100%達成（Statements, Functions, Lines, Branch）
    - ✅ 全16テストが成功

- [x] 2.4 メール送信の非同期処理基盤実装
  - メール送信の基盤を実装（SMTP設定、テンプレート対応）
  - 非同期メール送信キューを実装
  - 招待メールの送信機能を実装
  - パスワードリセットメールの送信機能を実装
  - メール送信の自動リトライ機能を実装
  - _Requirements: 1.3, 1.6, 7.1, 24.3_
  - _Details: design.md「Email Service」セクション参照_
  - _Completion Criteria:_
    - ✅ メールがキュー経由で送信される（Bull キュー統合）
    - ✅ リトライがエクスポネンシャルバックオフで動作する（5回、1分/5分/15分/1時間/6時間）
    - ✅ テンプレートが正しくレンダリングされる（Handlebars テンプレート）
    - ✅ テストカバレッジ100%達成（Statements, Functions, Lines）
    - ✅ 全8テストが成功

- [x] 2.5 ユーザー認証フローの統合実装
  - ユーザー登録機能を実装（招待経由、パスワード検証、トランザクション管理）
  - ログイン機能を実装（メールアドレス・パスワード検証、JWT発行、連続失敗検知）
  - ログアウト機能を実装（リフレッシュトークン無効化）
  - 全デバイスログアウト機能を実装
  - 現在のユーザー情報取得機能を実装
  - _Requirements: 2.1-2.12, 3.1-3.5, 4.1-4.7, 8.1-8.5, 9.1-9.5_
  - _Details: design.md「Authentication Service」セクション参照_
  - _Completion Criteria:_
    - ユーザー登録がトランザクション内で完結する
    - ログインが連続失敗でアカウントをロックする
    - JWTトークンが正しく発行される
  - _Implemented:_
    - AuthService完全実装 (`backend/src/services/auth.service.ts`)
    - register(): 招待トークン検証、パスワード強度チェック、トランザクション管理
    - login(): アカウントロック（5回失敗で15分）、パスワード検証、2FA対応
    - logout/logoutAll(): リフレッシュトークン無効化
    - getCurrentUser(): ユーザー情報とロール取得
    - 単体テスト4ケース追加 (`backend/src/__tests__/unit/services/auth.service.test.ts`)
    - 全227テストパス、型チェック成功

- [ ] 2.6 パスワードリセット機能の実装
  - パスワードリセット要求機能を実装（リセットトークン生成、メール送信）
  - リセットトークン検証機能を実装（24時間有効期限チェック）
  - パスワードリセット実行機能を実装（新パスワード設定、全トークン無効化）
  - パスワード変更機能を実装（現在のパスワード確認、履歴チェック）
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_
  - _Details: design.md「Password Reset」セクション参照_
  - _Completion Criteria:_
    - リセットトークンが暗号学的に安全に生成される
    - 有効期限が24時間で設定される
    - パスワード変更後に全トークンが無効化される

- [x] 2.7 JWT認証ミドルウェアの実装
  - JWTトークン検証ミドルウェアを実装
  - トークン期限切れエラーハンドリングを実装
  - _Requirements: 5.4, 5.5, 16.1, 16.2, 16.18_
  - _Details: design.md「Authentication Middleware」セクション参照_
  - _Completion Criteria:_
    - ✅ Authorizationヘッダーからトークンを抽出する
    - ✅ EdDSA署名を検証する
    - ✅ `req.user`にユーザー情報を設定する
    - ✅ テストカバレッジ100%達成（Statements, Functions, Lines）
    - ✅ 全9テストが成功

- [ ] 2.8 マルチデバイスセッション管理機能の実装
  - デバイスごとの独立したセッション管理機能を実装
  - セッション有効期限の自動延長機能を実装
  - セッション一覧の取得機能を実装
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - _Details: design.md「Session Management」セクション参照_
  - _Completion Criteria:_
    - 各デバイスが独立したリフレッシュトークンを持つ
    - アクティブユーザーの有効期限が自動延長される
    - セッション一覧がデバイス情報付きで取得できる

- [ ] 3. 認可システムの実装
  - _Dependencies: タスク2完了（認証サービス、トークン管理）_

- [ ] 3.1 ロールと権限の初期データ作成
  - 事前定義ロールを作成するシーディングスクリプトを実装
  - 事前定義権限を作成するシーディングスクリプトを実装
  - ロールと権限の紐付けを設定
  - 初期管理者アカウントを作成する機能を実装
  - _Requirements: 3.1, 3.2, 3.3, 6.3, 17（事前定義ロール）, 18（権限定義）_
  - _Details: design.md「RBAC Setup」セクション参照_
  - _Completion Criteria:_
    - シーディングスクリプトが冪等性を持つ
    - システム管理者ロールが全権限を持つ
    - 一般ユーザーロールが基本権限を持つ
    - 初期管理者アカウントが作成される

- [ ] 3.2 ロールベースの権限チェック機能実装
  - ユーザーの権限チェック機能を実装（ワイルドカード対応）
  - ユーザーの全権限取得機能を実装（複数ロールの権限統合）
  - リソースレベルの権限チェック機能を実装（所有者フィルタリング）
  - _Requirements: 6.1, 6.2, 6.4, 6.7, 6.8, 21.1-21.10_
  - _Details: design.md「RBAC Service」セクション参照_
  - _Completion Criteria:_
    - `resource:action`形式で権限をチェックできる
    - ワイルドカード（`*:read`, `adr:*`, `*:*`）が動作する
    - N+1問題が発生しない（DataLoader使用）

- [ ] 3.3 動的ロール管理機能の実装
  - ロール作成機能を実装（名前、説明、優先順位設定）
  - ロール更新機能を実装（監査ログ記録、変更履歴追跡）
  - ロール削除機能を実装（使用中チェック、システムロール保護）
  - ロール一覧取得機能を実装（割り当てユーザー数、権限数を含む）
  - _Requirements: 17.1-17.9_
  - _Details: design.md「Role Management」セクション参照_
  - _Completion Criteria:_
    - 動的にロールを作成・更新・削除できる
    - システム管理者ロールは削除できない
    - 使用中のロールは削除できない

- [ ] 3.4 権限の管理機能実装
  - 権限一覧取得機能を実装（リソースタイプ、アクション、説明）
  - カスタム権限作成機能を実装（`resource:action`形式の検証）
  - ワイルドカード権限評価機能を実装
  - _Requirements: 18.1-18.7_
  - _Details: design.md「Permission Management」セクション参照_
  - _Completion Criteria:_
    - 権限が`resource:action`形式で管理される
    - ワイルドカード権限が正しく評価される

- [ ] 3.5 ロールと権限の紐付け管理機能実装
  - ロールへの権限追加機能を実装（重複チェック、トランザクション管理）
  - ロールからの権限削除機能を実装（システム管理者保護）
  - ユーザーへのロール追加機能を実装（マルチロール対応）
  - ユーザーからのロール削除機能を実装（最後の管理者チェック）
  - _Requirements: 19.1-19.8, 20.1-20.9_
  - _Details: design.md「Role-Permission Assignment」セクション参照_
  - _Completion Criteria:_
    - ロール・権限の紐付けがトランザクション内で完結する
    - システム管理者ロールの`*:*`権限は削除できない
    - 最後の管理者のロールは削除できない

- [ ] 3.6 権限チェックミドルウェアの実装
  - 権限チェックミドルウェアを実装（RBAC統合、必要な権限の検証）
  - 権限不足時のエラーハンドリングを実装（403 Forbidden、監査ログ記録）
  - _Requirements: 6.1, 6.2, 21.1, 21.2, 21.7_
  - _Details: design.md「Authorization Middleware」セクション参照_
  - _Completion Criteria:_
    - 必要な権限を指定してミドルウェアを適用できる
    - 権限不足時に403エラーを返す
    - 監査ログに権限チェック失敗を記録する

- [ ] 3.7 権限情報のキャッシング戦略実装
  - ユーザー権限のRedisキャッシング機能を実装（Cache-Asideパターン）
  - キャッシュ無効化機能を実装（ロール・権限変更時、ユーザー・ロール変更時）
  - Redis障害時のフォールバック機能を実装（Graceful Degradation）
  - _Requirements: 23.4, 24.2, 24.7_
  - _Details: design.md「Caching Strategy」セクション参照_
  - _Completion Criteria:_
    - 権限情報がRedisにキャッシュされる（TTL: 15分）
    - ロール・権限変更時にキャッシュが無効化される
    - Redis障害時にDBフォールバックが動作する

- [ ] 4. 二要素認証（2FA）の実装
  - _Dependencies: タスク2完了（認証サービス）_

- [ ] 4.1 TOTP二要素認証の基盤実装
  - TOTP秘密鍵生成機能を実装（RFC 6238準拠）
  - 秘密鍵の暗号化・復号化機能を実装（AES-256-GCM）
  - QRコード生成機能を実装（Google Authenticator互換）
  - バックアップコード生成機能を実装（10個、8文字英数字）
  - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7, 27.8_
  - _Details: design.md「Two-Factor Authentication」セクション参照_
  - _Completion Criteria:_
    - TOTP秘密鍵が32バイトの暗号学的乱数で生成される
    - AES-256-GCMで暗号化してデータベースに保存される
    - QRコードが`otpauth://totp/ArchiTrack:{email}`形式で生成される

- [ ] 4.2 TOTP検証とバックアップコード管理機能の実装
  - TOTP検証機能を実装（30秒ウィンドウ、±1ステップ許容）
  - バックアップコード検証機能を実装（未使用コード確認、使用済みマーク）
  - 2FA有効化機能を実装（TOTP検証後、トランザクション管理）
  - 2FA無効化機能を実装（パスワード確認、秘密鍵・バックアップコード削除）
  - _Requirements: 27.9, 27.10, 27A.3, 27A.6, 27A.7, 27B.4, 27B.5, 27B.6_
  - _Details: design.md「2FA Verification」セクション参照_
  - _Completion Criteria:_
    - TOTPコードが±1ステップ（90秒）で検証される
    - バックアップコードがArgon2idハッシュで保存される
    - 使用済みバックアップコードがマークされる

- [ ] 4.3 2FAログインフローの統合
  - 2FA有効ユーザーのログイン処理を実装（2段階認証フロー）
  - TOTP検証後のJWT発行機能を実装
  - 連続TOTP検証失敗時のアカウントロック機能を実装（5回失敗で5分間ロック）
  - _Requirements: 27A.1, 27A.2, 27A.4, 27A.8_
  - _Details: design.md「2FA Login Flow」セクション参照_
  - _Completion Criteria:_
    - メールアドレス・パスワード検証後に2FA_REQUIRED応答を返す
    - TOTP検証成功でJWTトークンを発行する
    - 5回連続失敗でアカウントをロックする

- [ ] 4.4 バックアップコード管理機能の実装
  - バックアップコード再生成機能を実装（既存コード削除、新規10個生成）
  - 使用済みバックアップコードの視覚化機能を実装
  - 残りバックアップコード数の警告機能を実装（3個以下で警告）
  - _Requirements: 27B.1, 27B.2, 27B.3_
  - _Details: design.md「Backup Codes Management」セクション参照_
  - _Completion Criteria:_
    - バックアップコードを再生成できる
    - 使用済みコードが`usedAt`フィールドで管理される
    - 残り3個以下で警告が表示される

- [ ] 5. 監査ログシステムの構築
  - _Dependencies: タスク2-3完了（認証・認可サービス）_

- [ ] 5.1 監査ログの記録・取得機能実装
  - 監査ログ記録機能を実装（実行者、対象、アクション、タイムスタンプ、変更前後の値）
  - 監査ログ取得機能を実装（フィルタリング: ユーザー、日付範囲、アクションタイプ）
  - 監査ログエクスポート機能を実装（JSON形式ダウンロード）
  - _Requirements: 22.1-22.11_
  - _Details: design.md「Audit Log Service」セクション参照_
  - _Completion Criteria:_
    - 監査ログが構造化形式で記録される
    - フィルタリングが高速に動作する（インデックス活用）
    - JSON形式でエクスポートできる

- [ ] 5.2 監査ログのアーカイブ機能実装
  - 月次バッチジョブを実装（13ヶ月以上前のログをアーカイブ）
  - アーカイブストレージ統合を実装（S3/GCS、AES-256暗号化）
  - 8年以上前のアーカイブ削除機能を実装
  - _Requirements: 22（保持期間・ローテーション）_
  - _Details: design.md「Audit Log Archiving」セクション参照_
  - _Completion Criteria:_
    - 月次バッチジョブが自動実行される
    - アーカイブがJSON Lines形式で圧縮される
    - 8年以上前のアーカイブが自動削除される

- [ ] 5.3 センシティブ操作のアラート機能実装
  - システム管理者ロール変更時のアラート通知機能を実装
  - 権限変更時の監査ログ記録を実装
  - 2FA有効化・無効化時の監査ログ記録を実装
  - _Requirements: 5.5, 6.5, 17.3, 19.5, 20.5, 22.9, 27C.6_
  - _Details: design.md「Audit Alerts」セクション参照_
  - _Completion Criteria:_
    - システム管理者ロール変更でアラートが送信される
    - 全ての権限変更が監査ログに記録される
    - 2FA有効化・無効化が監査ログに記録される

- [ ] 6. Frontend認証UIの実装
  - _Dependencies: タスク7.1-7.7完了（認証・認可・2FA APIエンドポイント）_

- [ ] 6.1 認証コンテキストとトークン管理の実装
  - React AuthContextを実装（認証状態管理、トークン管理）
  - TokenRefreshManagerクラスを実装（Race Condition対策、マルチタブ同期）
  - Axios Interceptorを実装（Authorizationヘッダー、401エラーハンドリング）
  - 自動リフレッシュスケジュール機能を実装（有効期限5分前に自動リフレッシュ）
  - マルチタブ同期機能を実装（Broadcast Channel API）
  - _Requirements: 16.4, 16.5, 16.6, 16.10, 16.11, 16.12, 16.13, 16.16, 16.17, 16.19_
  - _Details: design.md「Frontend Authentication Context」セクション参照_
  - _Completion Criteria:_
    - 認証状態がReact Contextで管理される
    - トークンリフレッシュがRace Conditionなく動作する
    - マルチタブでトークン更新が同期される
    - 401エラーで自動的にトークンリフレッシュを試行する

- [ ] 6.2 認証フロー画面の実装
  - ログイン画面を実装（メールアドレス・パスワード入力、バリデーション、エラー表示）
  - ユーザー登録画面を実装（招待トークン検証、パスワード強度インジケーター、利用規約同意）
  - パスワードリセット画面を実装（リセット要求、トークン検証、新パスワード設定）
  - _Requirements: 11, 12, 7_
  - _Details: design.md「Authentication UI」セクション参照_
  - _Completion Criteria:_
    - リアルタイムバリデーションが動作する
    - パスワード強度インジケーターが5段階で表示される
    - モバイル最適化レイアウトが適用される
    - アクセシビリティ属性が設定される

- [ ] 6.3 プロフィール・セッション管理画面の実装
  - プロフィール画面を実装（ユーザー情報表示・編集、パスワード変更）
  - セッション管理画面を実装（アクティブデバイス一覧、個別ログアウト、全デバイスログアウト）
  - _Requirements: 14, 8_
  - _Details: design.md「Profile & Session UI」セクション参照_
  - _Completion Criteria:_
    - ユーザー情報が編集できる
    - パスワード変更後に全デバイスからログアウトされる
    - アクティブデバイス一覧が表示される

- [ ] 6.4 管理者機能画面の実装
  - ユーザー招待画面を実装（招待フォーム、招待一覧、ステータス管理）
  - ロール・権限管理画面を実装（ロールCRUD、権限割り当て、ユーザー・ロール紐付け）
  - 監査ログ画面を実装（フィルタリング、エクスポート）
  - _Requirements: 13, 17, 18, 19, 20, 22_
  - _Details: design.md「Admin UI」セクション参照_
  - _Completion Criteria:_
    - 招待一覧がステータス別フィルタリングできる
    - 招待URLがクリップボードにコピーできる
    - ロール・権限管理がトランザクション内で完結する
    - 監査ログがフィルタリング・エクスポートできる

- [ ] 6.5 二要素認証（2FA）画面の実装
  - 2FA設定画面を実装（QRコード表示、TOTP検証、バックアップコード保存）
  - 2FAログイン画面を実装（TOTP入力、バックアップコード代替、カウントダウンタイマー）
  - 2FA管理画面を実装（バックアップコード表示、再生成、無効化）
  - _Requirements: 27D, 27A, 27B_
  - _Details: design.md「2FA UI」セクション参照_
  - _Completion Criteria:_
    - QRコードがGoogle Authenticator互換形式で表示される
    - 6桁TOTP入力フィールドが自動タブ移動する
    - 30秒カウントダウンタイマーが動作する
    - バックアップコードがダウンロード・印刷・コピーできる

- [ ] 6.6 共通UI/UXコンポーネントの実装
  - レスポンシブデザインを実装（モバイル・タブレット・デスクトップ）
  - アクセシビリティ属性を実装（aria-label、role、aria-live）
  - エラーハンドリングを実装（フォーカス、スクロール、トーストメッセージ）
  - _Requirements: 15_
  - _Details: design.md「UI/UX Guidelines」セクション参照_
  - _Completion Criteria:_
    - WCAG 2.1 AA準拠のコントラスト比（4.5:1以上）
    - キーボード操作（Tab、Enter、Space）をサポート
    - モーダルダイアログのフォーカストラップが動作する
    - トーストメッセージが自動的に非表示になる

- [ ] 7. Backend API実装
  - _Dependencies: タスク2-5完了（認証・認可・2FA・監査ログサービス）_

- [ ] 7.1 認証関連APIエンドポイントの実装
  - ユーザー登録APIを実装（招待経由）
  - ログインAPIを実装
  - 2FA検証APIを実装
  - ログアウトAPIを実装（単一デバイス、全デバイス）
  - トークンリフレッシュAPIを実装
  - ユーザー情報取得・更新APIを実装
  - _Requirements: 2, 4, 5, 8, 9, 27A_
  - _Details: design.md「Authentication API」セクション参照_
  - _Completion Criteria:_
    - 全エンドポイントが`/api/v1/auth/...`形式で実装される
    - Zodバリデーションが全エンドポイントに適用される
    - OpenAPI仕様書が自動生成される

- [ ] 7.2 二要素認証（2FA）関連APIエンドポイントの実装
  - 2FA設定開始APIを実装
  - 2FA有効化APIを実装
  - 2FA無効化APIを実装
  - バックアップコード再生成APIを実装
  - _Requirements: 27, 27A, 27B_
  - _Details: design.md「2FA API」セクション参照_
  - _Completion Criteria:_
    - 全エンドポイントが`/api/v1/auth/2fa/...`形式で実装される
    - 2FA有効化がTOTP検証後に実行される
    - 2FA無効化がパスワード確認後に実行される

- [ ] 7.3 招待関連APIエンドポイントの実装
  - 招待作成APIを実装
  - 招待一覧取得APIを実装
  - 招待取り消しAPIを実装
  - 招待再送信APIを実装
  - 招待検証APIを実装
  - _Requirements: 1_
  - _Details: design.md「Invitation API」セクション参照_
  - _Completion Criteria:_
    - 全エンドポイントが`/api/v1/invitations/...`形式で実装される
    - 招待作成が管理者権限でのみ実行される
    - 招待一覧がステータス別フィルタリングできる

- [ ] 7.4 パスワード関連APIエンドポイントの実装
  - パスワードリセット要求APIを実装
  - リセットトークン検証APIを実装
  - パスワードリセット実行APIを実装
  - _Requirements: 7_
  - _Details: design.md「Password Reset API」セクション参照_
  - _Completion Criteria:_
    - 全エンドポイントが`/api/v1/auth/password/...`形式で実装される
    - リセットトークンが24時間で期限切れになる
    - パスワードリセット後に全トークンが無効化される

- [ ] 7.5 RBAC関連APIエンドポイントの実装
  - ロールCRUD APIを実装
  - ロール・権限紐付けAPIを実装
  - 権限一覧取得APIを実装
  - ユーザー・ロール紐付けAPIを実装
  - _Requirements: 6, 17, 18, 19, 20_
  - _Details: design.md「RBAC API」セクション参照_
  - _Completion Criteria:_
    - 全エンドポイントが`/api/v1/roles/...`, `/api/v1/permissions/...`形式で実装される
    - システム管理者ロールは削除できない
    - 最後の管理者のロールは削除できない

- [ ] 7.6 監査ログ関連APIエンドポイントの実装
  - 監査ログ取得APIを実装（フィルタリング対応）
  - 監査ログエクスポートAPIを実装
  - _Requirements: 22_
  - _Details: design.md「Audit Log API」セクション参照_
  - _Completion Criteria:_
    - 全エンドポイントが`/api/v1/audit-logs/...`形式で実装される
    - フィルタリングがクエリパラメータで指定できる
    - JSON形式でエクスポートできる

- [ ] 7.7 JWKSエンドポイントの実装
  - JWKS公開鍵エンドポイントを実装
  - _Requirements: 5.7_
  - _Details: design.md「JWKS Endpoint」セクション参照_
  - _Completion Criteria:_
    - `/.well-known/jwks.json`が正しいJWKS形式を返す
    - EdDSA公開鍵が含まれる

- [ ] 8. テスト実装
  - _Dependencies: タスク2-7完了（全実装機能）_

- [ ] 8.1 認証・パスワード管理サービスの単体テスト実装
  - トークン生成・検証機能のテスト（JWT発行、署名検証、有効期限チェック）
  - パスワード管理機能のテスト（ハッシュ化、検証、強度チェック、履歴管理）
  - 認証サービスのテスト（登録、ログイン、ログアウト、トークンリフレッシュ）
  - 招待管理サービスのテスト（招待作成、検証、無効化、再送信）
  - 認証ミドルウェアのテスト（トークン検証、エラーハンドリング）
  - _Requirements: 2, 4, 5, 7, 10_
  - _Details: design.md「Testing Strategy」セクション参照_
  - _Completion Criteria:_
    - カバレッジ80%以上を達成
    - 全テストが独立して実行できる
    - モックが適切に使用されている

- [ ] 8.2 認可・セッション管理サービスの単体テスト実装
  - 権限チェック機能のテスト（ロールベース、リソースレベル、ワイルドカード）
  - ロール・権限管理機能のテスト（CRUD、紐付け、トランザクション）
  - セッション管理機能のテスト（作成、削除、検証、マルチデバイス）
  - 認可ミドルウェアのテスト（権限チェック、エラーハンドリング）
  - _Requirements: 6, 8, 17, 18, 19, 20, 21_
  - _Details: design.md「Testing Strategy」セクション参照_
  - _Completion Criteria:_
    - カバレッジ80%以上を達成
    - DataLoaderのN+1問題対策がテストされている
    - Redisキャッシングのフォールバックがテストされている

- [ ] 8.3 二要素認証・監査ログサービスの単体テスト実装
  - TOTP生成・検証機能のテスト（RFC 6238準拠、30秒ウィンドウ）
  - バックアップコード管理機能のテスト（生成、検証、使用済み追跡）
  - メール送信機能のテスト（キュー管理、リトライ）
  - 監査ログ記録・取得機能のテスト（フィルタリング、エクスポート）
  - _Requirements: 22, 27, 27A, 27B_
  - _Details: design.md「Testing Strategy」セクション参照_
  - _Completion Criteria:_
    - カバレッジ80%以上を達成
    - TOTP検証のタイムウィンドウがテストされている
    - メール送信のリトライロジックがテストされている

- [ ] 8.4 Frontend単体テスト・Storybook・統合テスト・E2Eテスト・パフォーマンステストの実装
  - Frontend単体テストの実装（AuthContext、フォームコンポーネント、パスワード強度インジケーター）
  - Storybookストーリーの実装（LoginForm、RegisterForm、2FAフォーム、パスワードインジケーター）
  - 統合テストの実装（認証フロー、権限チェックフロー、招待フロー、監査ログフロー）
  - E2Eテストの実装（招待→登録→ログイン、2FA設定→ログイン、パスワードリセット、マルチタブ同期）
  - パフォーマンステストの実装（ログインAPI、権限チェックAPI、トークンリフレッシュAPI）
  - _Requirements: 全要件のテストカバレッジ_
  - _Details: design.md「Testing Strategy」セクション参照_
  - _Completion Criteria:_
    - Frontend単体テスト65+件、カバレッジ80%以上
    - Storybook 25+ストーリー、アクセシビリティアドオン統合
    - 統合テスト50件、全フロー確認
    - E2Eテスト30件、全シナリオ確認
    - パフォーマンステスト3件、性能要件達成確認

- [ ] 9. セキュリティ対策の実装
  - _Dependencies: タスク2-7完了（全実装機能）_

- [ ] 9.1 セキュリティヘッダーの実装
  - セキュリティヘッダーミドルウェアを統合（CSP、X-Frame-Options、HSTS等）
  - HTTPS強制リダイレクトを実装（本番環境）
  - CSRFトークン検証を実装（状態変更API）
  - _Requirements: 26.3, 26.5, 26.6, 26.10_
  - _Details: design.md「Security Headers」セクション参照_
  - _Completion Criteria:_
    - helmetミドルウェアが適用される
    - HTTPS強制リダイレクトが本番環境で動作する
    - CSRFトークンが状態変更APIで検証される

- [ ] 9.2 レート制限の実装
  - ログインAPIのレート制限を実装（10回/分/IP）
  - トークンリフレッシュAPIのレート制限を実装（20回/分/IP）
  - 招待APIのレート制限を実装（5回/分/ユーザー）
  - IPアドレスベースのブロック機能を実装
  - _Requirements: 26.4, 26.12_
  - _Details: design.md「Rate Limiting」セクション参照_
  - _Completion Criteria:_
    - レート制限がRedisで管理される
    - 制限超過時に429エラーを返す
    - IPアドレスベースのブロックが動作する

- [ ] 9.3 入力検証とエスケープ処理の実装
  - Zodスキーマによるリクエストバリデーションを実装（全APIエンドポイント）
  - SQLインジェクション対策を実装（Prismaパラメータ化クエリ）
  - XSS対策を実装（Frontendでの自動エスケープ処理）
  - _Requirements: 10.5, 26.1, 26.2_
  - _Details: design.md「Input Validation」セクション参照_
  - _Completion Criteria:_
    - 全APIエンドポイントでZodバリデーションが動作する
    - Prismaパラメータ化クエリが使用される
    - Reactの自動エスケープが適用される

- [ ] 9.4 機密情報保護の実装
  - ログマスキング処理を実装（パスワード、トークン、秘密鍵）
  - エラーメッセージの汎用化を実装（メールアドレス存在有無の隠蔽）
  - タイミング攻撃対策を実装（ログイン失敗時の一定時間遅延）
  - _Requirements: 10.1, 26.9, 26.11_
  - _Details: design.md「Sensitive Data Protection」セクション参照_
  - _Completion Criteria:_
    - ログに機密情報が含まれない
    - エラーメッセージが汎用的である
    - タイミング攻撃対策が動作する

- [ ] 10. デプロイ準備と最終検証
  - _Dependencies: タスク1-9完了（全実装・テスト・セキュリティ対策）_

- [ ] 10.1 環境変数とシークレット管理の最終確認
  - Railway環境変数を設定（JWT鍵、2FA暗号化鍵、初期管理者情報等）
  - 開発環境と本番環境の環境変数差分を確認
  - シークレット値のローテーション手順を文書化
  - _Requirements: 全要件の環境変数_
  - _Details: design.md「Environment Variables」セクション参照_
  - _Completion Criteria:_
    - 全環境変数がRailwayに設定されている
    - シークレット値が安全に管理されている
    - ローテーション手順がドキュメント化されている

- [ ] 10.2 Prismaマイグレーションの検証
  - 開発環境でマイグレーションを実行し、データベーススキーマを確認
  - マイグレーションのロールバック手順を検証
  - 本番環境デプロイ時の自動マイグレーション適用を確認
  - _Requirements: 1.1, 25（データ整合性）_
  - _Details: design.md「Database Migration」セクション参照_
  - _Completion Criteria:_
    - マイグレーションが正しく実行される
    - ロールバック手順が動作する
    - 本番環境で自動適用される

- [ ] 10.3 初期データシーディングの実装
  - 事前定義ロール・権限のシーディングスクリプトを実行
  - 初期管理者アカウントの作成を確認
  - シーディングの冪等性を検証（複数回実行しても安全）
  - _Requirements: 3.1-3.5, 17, 18_
  - _Details: design.md「Seeding」セクション参照_
  - _Completion Criteria:_
    - シーディングスクリプトが冪等性を持つ
    - 初期管理者アカウントが作成される
    - ロール・権限が正しく設定される

- [ ] 10.4 監視とアラートの設定
  - Sentryエラートラッキング統合を確認（Backend/Frontend）
  - システム管理者ロール変更時のアラート通知を設定
  - ヘルスチェックエンドポイントの動作を確認
  - _Requirements: 22.9, 24.9_
  - _Details: design.md「Monitoring & Alerts」セクション参照_
  - _Completion Criteria:_
    - Sentryが正しく統合されている
    - アラート通知が動作する
    - ヘルスチェックエンドポイントが動作する

- [ ] 10.5 ドキュメント更新
  - API仕様書を更新（OpenAPI 3.0、Swagger UI）
  - README.mdを更新（認証・認可機能の説明、環境変数リスト）
  - ステアリングドキュメントを更新（product.md、tech.md、structure.md）
  - _Requirements: 全要件のドキュメント_
  - _Details: design.md「Documentation」セクション参照_
  - _Completion Criteria:_
    - API仕様書が最新である
    - README.mdが更新されている
    - ステアリングドキュメントが更新されている

- [ ] 10.6 全テストスイートの実行と検証
  - Backend単体テストを実行（250+ tests、カバレッジ80%以上確認）
  - Frontend単体テストを実行（65+ tests、カバレッジ80%以上確認）
  - 統合テストを実行（50 tests、全フロー確認）
  - E2Eテストを実行（30 tests、全シナリオ確認）
  - パフォーマンステストを実行（3 tests、性能要件達成確認）
  - _Requirements: 全要件のテストカバレッジ_
  - _Details: design.md「Testing Strategy」セクション参照_
  - _Completion Criteria:_
    - 全テストが成功する
    - カバレッジが80%以上である
    - 性能要件を満たす

- [ ] 10.7 セキュリティレビューと脆弱性スキャン
  - npm auditでセキュリティ脆弱性をスキャン
  - OWASP Top 10チェックリストを検証
  - STRIDE脅威モデルを再確認
  - _Requirements: 10, 26（セキュリティ対策全般）_
  - _Details: design.md「Security Review」セクション参照_
  - _Completion Criteria:_
    - npm auditで重大な脆弱性がない
    - OWASP Top 10対策が完了している
    - STRIDE脅威モデルが対策されている

- [ ] 10.8 本番環境デプロイとスモークテスト
  - Canary deployment戦略でデプロイ（5%→25%→100%）
  - デプロイ後のスモークテストを実行（ログイン、招待、2FA設定、権限チェック）
  - ロールバック手順を確認（Railway環境切り戻し、機能フラグ無効化）
  - _Requirements: 全要件の本番環境動作確認_
  - _Details: design.md「Deployment」セクション参照_
  - _Completion Criteria:_
    - Canary deploymentが成功する
    - スモークテストが全て成功する
    - ロールバック手順が動作する

## 完了条件

すべてのタスクが完了し、以下の条件を満たすこと：

1. **機能要件**: requirements.mdの全32要件（27要件 + 5サブ要件）、583受入基準をすべて実装
2. **テストカバレッジ**: Backend 80%以上、Frontend 80%以上、統合テスト50件、E2Eテスト30件、パフォーマンステスト3件
3. **セキュリティ**: OWASP Top 10対策、STRIDE脅威モデル対策、EdDSA署名、Argon2idハッシュ、2FA/TOTP実装
4. **パフォーマンス**: ログインAPI 95パーセンタイルで500ms以内、権限チェックAPI 99パーセンタイルで100ms以内
5. **本番環境デプロイ**: Railway環境へのデプロイ成功、スモークテスト合格
6. **ドキュメント**: API仕様書、README.md、ステアリングドキュメント更新完了
