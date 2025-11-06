# 要件定義書

## はじめに

本ドキュメントは、ArchiTrackプロジェクトにおけるユーザー認証機能の要件を定義します。この機能により、管理者が承認したユーザーのみが安全にシステムへアクセスし、個人のアーキテクチャ決定記録（ADR）を管理できるようになります。

JWT（JSON Web Token）ベースの認証方式を採用し、招待制のユーザー登録とロールベースアクセス制御（RBAC）を組み合わせた、セキュアで拡張性の高い認証基盤を構築します。

**セキュリティポリシー:**
- ユーザー登録は管理者による招待制のみ
- 初期管理者アカウントはデータベースシーディングまたは管理コマンドで作成
- ロールベースアクセス制御により、管理者機能へのアクセスを制限

## 要件

### 要件1: 管理者によるユーザー招待

**目的:** 管理者として、新規ユーザーを招待したい。そうすることで、承認されたユーザーのみがシステムにアクセスできるようになる。

#### 受入基準

1. WHEN 管理者が有効なメールアドレスを提供する THEN Authentication Serviceは一意の招待トークンを生成しなければならない
2. WHEN 招待トークンが生成される THEN Authentication Serviceは有効期限（7日間）を設定しなければならない
3. WHEN 招待トークンが生成される THEN Authentication Serviceは招待メールを対象メールアドレスに送信しなければならない
4. IF 招待メールアドレスが既に登録済みである THEN Authentication Serviceはエラーメッセージを返さなければならない
5. IF リクエスト送信者が管理者ロールを持たない THEN Authentication Serviceは403 Forbiddenエラーを返さなければならない
6. WHEN 招待メールを送信する THEN Authentication Serviceは招待URL（トークン含む）をメール本文に含めなければならない
7. WHERE 管理者が招待一覧を取得する THE Authentication Serviceは招待ステータス（未使用、使用済み、期限切れ）を返さなければならない
8. WHEN 管理者が未使用の招待を取り消す THEN Authentication Serviceは招待を無効化しなければならない

### 要件2: 招待を受けたユーザーのアカウント作成

**目的:** 招待されたユーザーとして、アカウントを作成したい。そうすることで、システムを利用してADRを管理できるようになる。

#### 受入基準

1. WHEN ユーザーが有効な招待トークン、パスワード、表示名を提供する THEN Authentication Serviceは新しいユーザーアカウントを作成しなければならない
2. IF 招待トークンが無効または存在しない THEN Authentication Serviceはエラーメッセージを返さなければならない
3. IF 招待トークンが期限切れ（7日以上経過）である THEN Authentication Serviceはエラーメッセージを返さなければならない
4. IF 招待トークンが既に使用済みである THEN Authentication Serviceはエラーメッセージを返さなければならない
5. IF パスワードが8文字未満である THEN Authentication Serviceは登録を拒否しなければならない
6. IF パスワードが英数字と特殊文字を含まない THEN Authentication Serviceは登録を拒否しなければならない
7. WHEN ユーザー登録が成功する THEN Authentication Serviceはパスワードをbcryptでハッシュ化して保存しなければならない
8. WHEN ユーザー登録が成功する THEN Authentication Serviceは招待トークンを使用済みとしてマークしなければならない
9. WHEN ユーザー登録が成功する THEN Authentication Serviceはアクセストークンとリフレッシュトークンを発行しなければならない
10. WHEN ユーザー登録が成功する THEN Authentication Serviceはユーザーロール（user）を割り当てなければならない

### 要件3: 初期管理者アカウントのセットアップ

**目的:** システム管理者として、初回セットアップ時に管理者アカウントを作成したい。そうすることで、招待制システムを開始できるようになる。

#### 受入基準

1. WHEN システムが初回起動される AND 環境変数に初期管理者情報が設定されている THEN Authentication Serviceは管理者アカウントを自動作成しなければならない
2. WHEN データベースシーディングコマンドが実行される THEN Authentication Serviceは管理者アカウントを作成しなければならない
3. WHERE 初期管理者を作成する THE Authentication Serviceは管理者ロール（admin）を割り当てなければならない
4. IF 初期管理者のメールアドレスが既に登録済みである THEN Authentication Serviceはスキップしなければならない
5. WHEN 初期管理者が作成される THEN Authentication Serviceはログに記録しなければならない

### 要件4: ログイン

**目的:** 登録済みユーザーとして、システムにログインしたい。そうすることで、自分のADRにアクセスできるようになる。

#### 受入基準

1. WHEN ユーザーが有効なメールアドレスとパスワードを提供する THEN Authentication Serviceはアクセストークンとリフレッシュトークンを発行しなければならない
2. IF メールアドレスが登録されていない THEN Authentication Serviceは認証エラーを返さなければならない
3. IF パスワードが正しくない THEN Authentication Serviceは認証エラーを返さなければならない
4. WHEN ログインが成功する THEN Authentication Serviceはアクセストークン（有効期限15分）を発行しなければならない
5. WHEN ログインが成功する THEN Authentication Serviceはリフレッシュトークン（有効期限7日）を発行しなければならない
6. WHEN 連続して5回ログインに失敗する THEN Authentication Serviceはアカウントを15分間ロックしなければならない
7. WHEN トークンを発行する THEN Authentication Serviceはユーザーロール情報をトークンペイロードに含めなければならない

### 要件5: トークン管理

**目的:** システムユーザーとして、セキュアなトークンベースの認証を利用したい。そうすることで、安全にAPIにアクセスできるようになる。

#### 受入基準

1. WHEN アクセストークンの有効期限が切れる THEN Authentication Serviceはリフレッシュトークンを使用して新しいアクセストークンを発行しなければならない
2. IF リフレッシュトークンが無効または期限切れである THEN Authentication Serviceは再ログインを要求しなければならない
3. WHEN ユーザーがログアウトする THEN Authentication Serviceはリフレッシュトークンを無効化しなければならない
4. WHERE 保護されたAPIエンドポイントにアクセスする THE Authentication Serviceは有効なアクセストークンを検証しなければならない
5. IF アクセストークンが改ざんされている THEN Authentication Serviceはリクエストを拒否しなければならない
6. WHEN トークンにユーザー情報を含める THEN Authentication ServiceはユーザーID、メールアドレス、ロール（admin/user）を含めなければならない

### 要件6: ロールベースアクセス制御（RBAC）

**目的:** システムとして、ロールに基づいてアクセス権限を制御したい。そうすることで、管理機能への不正アクセスを防止できるようになる。

#### 受入基準

1. WHERE 管理者専用APIエンドポイントにアクセスする THE Authentication Serviceはユーザーが管理者ロール（admin）を持つことを検証しなければならない
2. IF ユーザーが必要なロールを持たない THEN Authentication Serviceは403 Forbiddenエラーを返さなければならない
3. WHEN ユーザーアカウントが作成される THEN Authentication Serviceはデフォルトで一般ユーザーロール（user）を割り当てなければならない
4. WHERE 管理者が他のユーザーのロールを変更する THE Authentication Serviceはロール変更をログに記録しなければならない
5. IF 最後の管理者アカウントのロールを変更しようとする THEN Authentication Serviceは変更を拒否しなければならない

### 要件7: パスワード管理

**目的:** ユーザーとして、パスワードを安全に管理したい。そうすることで、アカウントのセキュリティを維持できるようになる。

#### 受入基準

1. WHEN ユーザーがパスワードリセットを要求する THEN Authentication Serviceはメールアドレスにリセットトークンを送信しなければならない
2. WHEN ユーザーが有効なリセットトークンと新しいパスワードを提供する THEN Authentication Serviceはパスワードを更新しなければならない
3. IF リセットトークンが30分以上経過している THEN Authentication Serviceはトークンを無効として扱わなければならない
4. WHEN ユーザーがパスワードを変更する THEN Authentication Serviceは現在のパスワードの確認を要求しなければならない
5. WHEN パスワードが更新される THEN Authentication Serviceは全ての既存リフレッシュトークンを無効化しなければならない

### 要件8: セッション管理

**目的:** システム管理者として、ユーザーのセッションを管理したい。そうすることで、セキュリティとユーザー体験を最適化できるようになる。

#### 受入基準

1. WHEN ユーザーがログインする THEN Authentication Serviceはセッション情報をRedisに保存しなければならない
2. WHILE ユーザーがアクティブである THE Authentication Serviceはセッションの有効期限を延長しなければならない
3. WHEN ユーザーが複数デバイスからログインする THEN Authentication Serviceは各デバイスで独立したセッションを管理しなければならない
4. WHEN ユーザーがログアウトする THEN Authentication Serviceは対象デバイスのセッションのみを削除しなければならない
5. WHERE 管理者が全デバイスログアウト機能を使用する THE Authentication Serviceは全てのセッションを削除しなければならない

### 要件9: ユーザー情報取得・管理

**目的:** 認証済みユーザーとして、自分のプロフィール情報を取得したい。そうすることで、アカウント情報を確認・更新できるようになる。

#### 受入基準

1. WHEN 認証済みユーザーがプロフィール取得APIを呼び出す THEN Authentication Serviceはユーザーの基本情報（ID、メールアドレス、表示名、ロール、作成日時）を返さなければならない
2. IF アクセストークンが無効または期限切れである THEN Authentication Serviceは401 Unauthorizedエラーを返さなければならない
3. WHEN ユーザーが表示名を更新する THEN Authentication Serviceは更新後の情報を返さなければならない
4. WHERE 管理者がユーザー一覧を取得する THE Authentication Serviceは全ユーザーの情報（パスワードを除く）を返さなければならない
5. IF 一般ユーザーがユーザー一覧取得を試みる THEN Authentication Serviceは403 Forbiddenエラーを返さなければならない

### 要件10: セキュリティとエラーハンドリング

**目的:** システム全体として、セキュアで堅牢な認証システムを提供したい。そうすることで、ユーザーデータを保護し、信頼性の高いサービスを実現できるようになる。

#### 受入基準

1. WHEN 認証エラーが発生する THEN Authentication Serviceは詳細なエラー情報（メールアドレスの存在有無など）を返してはならない
2. WHERE パスワードを保存する THE Authentication Serviceはbcryptアルゴリズム（saltラウンド10以上）を使用しなければならない
3. WHEN JWTトークンを生成する THEN Authentication ServiceはHS256アルゴリズムを使用しなければならない
4. IF データベース接続エラーが発生する THEN Authentication Serviceは適切なエラーメッセージとHTTPステータス500を返さなければならない
5. WHEN APIリクエストのバリデーションが失敗する THEN Authentication Serviceは詳細なバリデーションエラーメッセージを返さなければならない
6. WHERE センシティブな操作（パスワード変更、ロール変更、ユーザー招待）を実行する THE Authentication Serviceはログに記録しなければならない
7. WHEN 招待トークンまたはリセットトークンを生成する THEN Authentication Serviceは暗号学的に安全なランダム文字列（32バイト以上）を使用しなければならない
