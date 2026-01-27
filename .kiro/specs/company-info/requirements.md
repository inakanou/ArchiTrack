# Requirements Document

## Introduction

自社情報登録機能は、ArchiTrackを利用する企業が自社の基本情報を登録・管理するための機能です。登録された自社情報は、見積書や請求書などの帳票出力時に利用されます。

本機能により、ユーザーは会社名、住所、代表者、連絡先、適格請求書発行事業者登録番号などの基本情報を一元管理できます。自社情報は1件のみ登録可能であり、初回は新規登録、2回目以降は更新操作となります。

**注記:** 自社情報は削除機能を提供しません。一度登録された自社情報は更新のみ可能です。

## Requirements

### Requirement 1: 自社情報登録画面表示

**Objective:** As a ユーザー, I want 自社情報の登録・編集画面にアクセスしたい, so that 自社の基本情報を登録・更新できる

#### Acceptance Criteria

1. When ユーザーが自社情報ページにアクセスしたとき, the 自社情報管理サービス shall 自社情報登録フォームを表示する
2. The 自社情報管理サービス shall 以下の入力欄を提供する: 会社名（必須）、住所（必須）、代表者（必須）、電話番号（任意）、FAX番号（任意）、メールアドレス（任意）、適格請求書発行事業者登録番号（任意）
3. If 自社情報が既に登録されている場合, then the 自社情報管理サービス shall 登録済みの情報をフォームにプリセットして表示する
4. If 自社情報が未登録の場合, then the 自社情報管理サービス shall 空のフォームを表示する
5. The 自社情報管理サービス shall フォームの上部に「自社情報」という見出しを表示する

### Requirement 2: 自社情報の保存

**Objective:** As a ユーザー, I want 自社情報を保存したい, so that 見積書や請求書に自社情報を反映できる

#### Acceptance Criteria

1. When ユーザーが有効なデータを入力して保存ボタンをクリックしたとき, the 自社情報管理サービス shall 自社情報をデータベースに保存する
2. If 自社情報が未登録の場合, then the 自社情報管理サービス shall 新規レコードを作成する
3. If 自社情報が既に登録されている場合, then the 自社情報管理サービス shall 既存レコードを更新する
4. When 保存に成功したとき, the 自社情報管理サービス shall 「自社情報を保存しました」という成功メッセージをToastNotificationで表示する
5. If 必須項目（会社名、住所、代表者）が未入力の場合, then the 自社情報管理サービス shall バリデーションエラーメッセージを各項目に表示する
6. The 自社情報管理サービス shall 保存処理中はローディングインジケーターを表示し、保存ボタンを無効化する
7. The 自社情報管理サービス shall 楽観的排他制御（versionフィールド）を実装し、同時更新による競合を検出する
8. If 楽観的排他制御で競合が検出された場合, then the 自社情報管理サービス shall 「他のユーザーによって更新されました。画面を更新してください」というエラーを表示する

### Requirement 3: フォーム操作

**Objective:** As a ユーザー, I want フォームの入力をリセットしたい, so that 入力ミスを簡単に取り消せる

#### Acceptance Criteria

1. The 自社情報管理サービス shall 「リセット」ボタンを保存ボタンの横に表示する
2. When ユーザーがリセットボタンをクリックしたとき, the 自社情報管理サービス shall フォームの内容を最後に保存された状態に戻す
3. If 自社情報が未登録の状態でリセットボタンをクリックした場合, then the 自社情報管理サービス shall フォームを空の状態にリセットする
4. When フォームに未保存の変更がある状態でページを離れようとしたとき, the 自社情報管理サービス shall 「変更が保存されていません。ページを離れますか？」という確認ダイアログを表示する

### Requirement 4: データバリデーション

**Objective:** As a システム運用者, I want 自社情報の入力値を検証したい, so that 正しい形式のデータのみを保存できる

#### Acceptance Criteria

1. The 自社情報管理サービス shall 会社名の最大文字数を200文字に制限する
2. The 自社情報管理サービス shall 住所の最大文字数を500文字に制限する
3. The 自社情報管理サービス shall 代表者名の最大文字数を100文字に制限する
4. The 自社情報管理サービス shall 電話番号の形式バリデーション（数字、ハイフン、括弧のみ許可、最大20文字）を実行する
5. The 自社情報管理サービス shall FAX番号の形式バリデーション（数字、ハイフン、括弧のみ許可、最大20文字）を実行する
6. If メールアドレスが入力されている場合, then the 自社情報管理サービス shall メールアドレスの形式バリデーションを実行する
7. If メールアドレスの形式が不正な場合, then the 自社情報管理サービス shall 「有効なメールアドレスを入力してください」というエラーを表示する
8. The 自社情報管理サービス shall メールアドレスの最大文字数を254文字に制限する
9. The 自社情報管理サービス shall 適格請求書発行事業者登録番号の形式バリデーション（T + 13桁の数字）を実行する
10. If 適格請求書発行事業者登録番号の形式が不正な場合, then the 自社情報管理サービス shall 「適格請求書発行事業者登録番号は「T」+ 13桁の数字で入力してください」というエラーを表示する

### Requirement 5: ナビゲーション

**Objective:** As a ユーザー, I want 自社情報ページに素早くアクセスしたい, so that 効率的に自社情報を管理できる

#### Acceptance Criteria

##### ヘッダーナビゲーション

1. The 自社情報管理サービス shall AppHeaderのメインナビゲーションに「自社情報」リンクを表示する
2. The 自社情報管理サービス shall 「自社情報」リンクを「取引先」リンクの右側に配置する
3. When 認証済みユーザーがAppHeaderの「自社情報」リンクをクリックしたとき, the 自社情報管理サービス shall 自社情報ページ（/company-info）に遷移する
4. The 自社情報管理サービス shall 「自社情報」リンクにアイコン（ビルディングアイコン）を付与して視認性を高める

##### パンくずナビゲーション

5. The 自社情報管理サービス shall 自社情報ページに「ダッシュボード > 自社情報」のパンくずナビゲーションを表示する
6. When ユーザーがパンくずナビゲーションの「ダッシュボード」をクリックしたとき, the 自社情報管理サービス shall ダッシュボードページに遷移する

##### URL構造

7. The 自社情報管理サービス shall 自社情報ページを `/company-info` のURLで提供する

### Requirement 6: アクセス制御

**Objective:** As a システム管理者, I want 自社情報機能へのアクセスを制御したい, so that 適切な権限を持つユーザーのみが操作できる

#### Acceptance Criteria

1. The 自社情報管理サービス shall 認証済みユーザーのみに自社情報ページへのアクセスを許可する
2. The 自社情報管理サービス shall 自社情報ページをProtectedRouteで保護する
3. The 自社情報管理サービス shall 自社情報ページにProtectedLayout（AppHeader付き）を適用する
4. If 未認証ユーザーが自社情報ページにアクセスした場合, then the 自社情報管理サービス shall ログインページにリダイレクトする
5. When ログイン後, the 自社情報管理サービス shall 元のページ（/company-info）に遷移する
6. The 自社情報管理サービス shall 「company-info:read」「company-info:update」の権限をシステムに定義する
7. The 自社情報管理サービス shall 自社情報の閲覧に「company-info:read」権限を要求する
8. The 自社情報管理サービス shall 自社情報の保存に「company-info:update」権限を要求する
9. If 権限のないユーザーが操作を試みた場合, then the 自社情報管理サービス shall 403 Forbiddenエラーを返却する
10. The 自社情報管理サービス shall 自社情報の保存操作を監査ログに記録する

### Requirement 7: エラー回復とフィードバック

**Objective:** As a ユーザー, I want エラー発生時に適切なフィードバックを受けたい, so that 問題を理解し対処できる

#### Acceptance Criteria

1. If ネットワークエラーが発生した場合, then the 自社情報管理サービス shall 「通信エラーが発生しました。再試行してください。」というエラーメッセージと再試行ボタンを表示する
2. If サーバーエラー（5xx）が発生した場合, then the 自社情報管理サービス shall 「システムエラーが発生しました。しばらくしてからお試しください。」というエラーメッセージを表示する
3. If セッションが期限切れの場合, then the 自社情報管理サービス shall ログインページにリダイレクトする
4. When エラーメッセージを表示するとき, the 自社情報管理サービス shall ToastNotificationコンポーネントを使用してエラーを通知する

### Requirement 8: パフォーマンス

**Objective:** As a ユーザー, I want 画面が素早く表示される, so that ストレスなく業務を遂行できる

#### Acceptance Criteria

1. The 自社情報管理サービス shall 自社情報ページの初期表示を1秒以内に完了する
2. The 自社情報管理サービス shall 自社情報の保存操作のAPI応答を500ミリ秒以内に完了する

### Requirement 9: API設計

**Objective:** As a 開発者, I want RESTful APIで自社情報を操作したい, so that フロントエンドと一貫性のあるデータ連携ができる

#### Acceptance Criteria

1. The 自社情報管理サービス shall `GET /api/company-info` エンドポイントで自社情報取得機能を提供する
2. When 自社情報が登録されている場合, the 自社情報管理サービス shall 自社情報オブジェクトを返却する
3. If 自社情報が未登録の場合, then the 自社情報管理サービス shall 空のオブジェクト `{}` とHTTPステータス200 OKを返却する
4. The 自社情報管理サービス shall `PUT /api/company-info` エンドポイントで自社情報の作成・更新機能を提供する
5. When 自社情報が存在しない状態でPUTリクエストを受信したとき, the 自社情報管理サービス shall 新規レコードを作成する
6. When 自社情報が存在する状態でPUTリクエストを受信したとき, the 自社情報管理サービス shall 既存レコードを更新する
7. The 自社情報管理サービス shall APIレスポンスに以下のフィールドを含める: id, companyName, address, representative, phone, fax, email, invoiceRegistrationNumber, version, createdAt, updatedAt
8. The 自社情報管理サービス shall PUTリクエストのボディにversionフィールドを含め、楽観的排他制御を実行する
9. If versionが一致しない場合, then the 自社情報管理サービス shall 409 Conflictエラーを返却する
10. The 自社情報管理サービス shall 自社情報の削除APIを提供しない
