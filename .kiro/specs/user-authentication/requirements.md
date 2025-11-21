# 要件定義書

## はじめに

本ドキュメントは、ArchiTrackプロジェクトにおけるユーザー認証機能の要件を定義します。この機能により、管理者が承認したユーザーのみが安全にシステムへアクセスし、個人のアーキテクチャ決定記録（ADR）を管理できるようになります。

JWT（JSON Web Token）ベースの認証方式を採用し、招待制のユーザー登録とロールベースアクセス制御（RBAC）を組み合わせた、セキュアで拡張性の高い認証基盤を構築します。

**セキュリティポリシー:**
- ユーザー登録は管理者による招待制のみ
- 初期管理者アカウントはデータベースシーディングまたは管理コマンドで作成
- ロールベースアクセス制御により、管理者機能へのアクセスを制限

## 用語集

- **招待トークン**: 管理者が新規ユーザーを招待する際に生成される一意の文字列（有効期限: 7日間）
- **アクセストークン**: 短期間有効な認証トークン（JWT形式、EdDSA署名、デフォルト有効期限: 15分）
- **リフレッシュトークン**: 長期間有効な認証トークン（JWT形式、EdDSA署名、デフォルト有効期限: 7日間）
- **リセットトークン**: パスワードリセット時に生成される一意の文字列（有効期限: 24時間）
- **RBAC**: Role-Based Access Control（ロールベースアクセス制御）
- **EARS**: Easy Approach to Requirements Syntax（要件記述形式）
- **システム管理者ロール**: 全ての権限を持つ最高権限ロール（削除不可）
- **一般ユーザーロール**: 自分が作成したリソースのみアクセス可能な基本ロール（削除不可）
- **Argon2id**: OWASP推奨のパスワードハッシュアルゴリズム（メモリハード関数、GPU攻撃耐性）
- **EdDSA**: Edwards-curve Digital Signature Algorithm（Ed25519曲線使用、NIST FIPS 186-5推奨）
- **HIBP**: Have I Been Pwned（漏洩パスワードデータベース、7億件以上）
- **Bloom Filter**: 確率的データ構造（HIBP Pwned Passwordsの効率的チェック用）
- **Race Condition**: 複数スレッドまたはリクエストの同時実行による予期しない動作（トークンリフレッシュ時の重複処理など）
- **Broadcast Channel API**: ブラウザタブ間通信API（マルチタブでのトークン更新同期用）

## 環境変数

本仕様で使用される環境変数の一覧です。

### Backend Service

| 変数名 | 説明 | デフォルト値 | 必須/任意 | 形式・制約 |
|--------|------|--------------|-----------|-----------|
| `ACCESS_TOKEN_EXPIRY` | アクセストークンの有効期限 | `15m` | 任意 | 時間文字列（例: 15m, 1h） |
| `REFRESH_TOKEN_EXPIRY` | リフレッシュトークンの有効期限 | `7d` | 任意 | 時間文字列（例: 7d, 30d） |
| `TWO_FACTOR_ENCRYPTION_KEY` | 2FA秘密鍵暗号化用のAES-256-GCM鍵 | なし | 必須（2FA有効時） | 256ビット16進数文字列（64文字） |
| `INITIAL_ADMIN_EMAIL` | 初期管理者のメールアドレス | なし | 任意 | 有効なメールアドレス形式 |
| `INITIAL_ADMIN_PASSWORD` | 初期管理者のパスワード | なし | 任意 | 12文字以上、複雑性要件を満たす |
| `INITIAL_ADMIN_DISPLAY_NAME` | 初期管理者の表示名 | `System Administrator` | 任意 | 任意の文字列 |
| `DATABASE_CONNECTION_TIMEOUT` | データベース接続タイムアウト | `5000ms` | 任意 | ミリ秒単位の数値 |
| `DATABASE_RETRY_COUNT` | データベース接続リトライ回数 | `3` | 任意 | 整数値（0-10） |

### Frontend Service

| 変数名 | 説明 | デフォルト値 | 必須/任意 | 形式・制約 |
|--------|------|--------------|-----------|-----------|
| `VITE_API_BASE_URL` | Backend API のベースURL | `http://localhost:3000` | 必須 | 有効なURL形式 |
| `VITE_TOKEN_REFRESH_THRESHOLD` | トークン自動リフレッシュの閾値（有効期限前） | `5m` | 任意 | 時間文字列（例: 5m, 10m） |

## 要件

### 要件1: 管理者によるユーザー招待

**目的:** 管理者として、新規ユーザーを招待したい。そうすることで、承認されたユーザーのみがシステムにアクセスできるようになる。

#### 受入基準

1. WHEN 管理者が有効なメールアドレスを提供する THEN Authentication Serviceは一意の招待トークンを生成しなければならない
2. WHEN 招待トークンが生成される THEN Authentication Serviceは7日間の有効期限を設定しなければならない
3. WHEN 招待トークンが生成される THEN Authentication Serviceは招待メールを対象メールアドレスに送信しなければならない
4. IF 招待メールアドレスが既に登録済みである THEN Authentication Serviceはエラーメッセージを返さなければならない
5. IF リクエスト送信者が管理者ロールを持たない THEN Authentication Serviceは403 Forbiddenエラーを返さなければならない
6. WHEN 招待メールを送信する THEN Authentication Serviceは招待URL（トークン含む）をメール本文に含めなければならない
7. WHEN 管理者が招待一覧を取得する THEN Authentication Serviceは招待ステータス（未使用、使用済み、期限切れ）を返さなければならない
8. WHEN 管理者が未使用の招待を取り消す THEN Authentication Serviceは招待を無効化しなければならない

### 要件2: 招待を受けたユーザーのアカウント作成

**目的:** 招待されたユーザーとして、アカウントを作成したい。そうすることで、システムを利用してADRを管理できるようになる。

#### 受入基準

1. WHEN ユーザーが有効な招待トークン、パスワード、表示名を提供する THEN Authentication Serviceは新しいユーザーアカウントを作成しなければならない
2. IF 招待トークンが無効または存在しない THEN Authentication Serviceはエラーメッセージを返さなければならない
3. IF 招待トークンが期限切れである THEN Authentication Serviceはエラーメッセージを返さなければならない
4. IF 招待トークンが既に使用済みである THEN Authentication Serviceはエラーメッセージを返さなければならない
5. IF パスワードが12文字未満である THEN Authentication Serviceは登録を拒否しなければならない
6. IF パスワードが複雑性要件（大文字、小文字、数字、特殊文字のうち3種類以上含む）を満たさない THEN Authentication Serviceは登録を拒否しなければならない
7. IF パスワードが禁止パスワードリスト（HIBP Pwned Passwords、Bloom Filter実装、偽陽性率0.001）に含まれる THEN Authentication Serviceは「このパスワードは過去のデータ漏洩で使用されています」というエラーメッセージを返さなければならない
8. IF パスワードにユーザーのメールアドレスまたは表示名が含まれる THEN Authentication Serviceは登録を拒否しなければならない
9. WHEN ユーザー登録が成功する THEN Authentication ServiceはパスワードをArgon2idアルゴリズム（メモリコスト: 64MB、時間コスト: 3、並列度: 4）でハッシュ化しなければならない
10. WHEN ユーザー登録が成功する THEN Authentication Serviceは招待トークンを使用済みとしてマークしなければならない
11. WHEN ユーザー登録が成功する THEN Authentication Serviceはアクセストークンとリフレッシュトークンを発行しなければならない
12. WHEN ユーザー登録が成功する THEN Authentication Serviceはユーザーロール（user）を割り当てなければならない

### 要件3: 初期管理者アカウントのセットアップ

**目的:** システム管理者として、初回セットアップ時に管理者アカウントを作成したい。そうすることで、招待制システムを開始できるようになる。

#### 受入基準

1. WHEN Backend Serviceが初回起動される AND 環境変数に初期管理者情報が設定されている THEN Authentication Serviceは管理者アカウントを自動作成しなければならない
2. WHEN データベースシーディングコマンドが実行される THEN Authentication Serviceは管理者アカウントを作成しなければならない
3. WHEN 初期管理者を作成する THEN Authentication Serviceは管理者ロール（admin）を割り当てなければならない
4. IF 初期管理者のメールアドレスが既に登録済みである THEN Authentication Serviceはスキップしなければならない
5. WHEN 初期管理者が作成される THEN Authentication Serviceはログに記録しなければならない

### 要件4: ログイン

**目的:** 登録済みユーザーとして、システムにログインしたい。そうすることで、自分のADRにアクセスできるようになる。

#### 受入基準

1. WHEN ユーザーが有効なメールアドレスとパスワードを提供する THEN Authentication Serviceはアクセストークンとリフレッシュトークンを発行しなければならない
2. IF メールアドレスが登録されていない THEN Authentication Serviceは認証エラーを返さなければならない
3. IF パスワードが正しくない THEN Authentication Serviceは認証エラーを返さなければならない
4. WHEN ログインが成功する THEN Authentication Serviceは環境変数ACCESS_TOKEN_EXPIRY（デフォルト: 15分）で設定された有効期限を持つアクセストークンを発行しなければならない
5. WHEN ログインが成功する THEN Authentication Serviceは環境変数REFRESH_TOKEN_EXPIRY（デフォルト: 7日間）で設定された有効期限を持つリフレッシュトークンを発行しなければならない
6. WHEN 連続して5回ログインに失敗する THEN Authentication Serviceはアカウントを15分間ロックしなければならない
7. WHEN トークンを発行する THEN Authentication Serviceはユーザーロール情報をトークンペイロードに含めなければならない

### 要件5: トークン管理

**目的:** システムユーザーとして、セキュアなトークンベースの認証を利用したい。そうすることで、安全にAPIにアクセスできるようになる。

#### 受入基準

1. WHEN アクセストークンの有効期限が切れる THEN Authentication Serviceはリフレッシュトークンを使用して新しいアクセストークンを発行しなければならない
2. IF リフレッシュトークンが無効または期限切れである THEN Authentication Serviceは再ログインを要求しなければならない
3. WHEN ユーザーがログアウトする THEN Authentication Serviceはリフレッシュトークンを無効化しなければならない
4. WHEN 保護されたAPIエンドポイントにアクセスする THEN Authentication Serviceは有効なアクセストークンを検証しなければならない
5. IF アクセストークンが改ざんされている THEN Authentication Serviceはリクエストを拒否しなければならない
6. WHEN トークンにユーザー情報を含める THEN Authentication ServiceはユーザーID、メールアドレス、ロール情報を含めなければならない
7. WHEN トークンを生成する THEN Authentication ServiceはEdDSA（Ed25519）署名アルゴリズムを使用しなければならない
8. WHEN JWTトークンをヘッダーに含める THEN Authentication Serviceは"alg": "EdDSA"フィールドを設定しなければならない
9. WHEN アクセストークンを発行する THEN Authentication Serviceは環境変数ACCESS_TOKEN_EXPIRY（デフォルト: 15分）で設定された有効期限を適用しなければならない
10. WHEN リフレッシュトークンを発行する THEN Authentication Serviceは環境変数REFRESH_TOKEN_EXPIRY（デフォルト: 7日間）で設定された有効期限を適用しなければならない

### 要件6: 拡張可能なロールベースアクセス制御（RBAC）

**目的:** システムとして、細粒度かつ拡張可能なロールベースアクセス制御を実装したい。そうすることで、組織の職務に応じた柔軟な権限管理と、管理機能への不正アクセス防止を両立できるようになる。

**RBACモデル:** NIST RBAC標準のCore RBAC + Hierarchical RBACに準拠し、Role（ロール）、Permission（権限）、User-Role紐付け、Role-Permission紐付けの4つのエンティティで構成する。

#### 受入基準

1. WHEN 保護されたAPIエンドポイントにアクセスする THEN Authentication Serviceは必要な権限（Permission）を検証しなければならない
2. IF ユーザーが必要な権限を持たない THEN Authentication Serviceは403 Forbiddenエラーを返さなければならない
3. WHEN ユーザーアカウントが作成される THEN Authentication Serviceはデフォルトロール（例: 一般ユーザー）を割り当てなければならない
4. WHEN ユーザーに複数のロールが割り当てられている THEN Authentication Serviceは全てのロールの権限を統合して評価しなければならない
5. WHEN システム管理者が他のユーザーのロールを変更する THEN Authentication Serviceはロール変更を監査ログに記録しなければならない
6. IF 最後のシステム管理者ロールを持つユーザーのロールを変更しようとする THEN Authentication Serviceは変更を拒否しなければならない
7. WHEN 権限チェックを実行する THEN Authentication Serviceはリソースタイプとアクションの組み合わせで判定しなければならない
8. WHEN リソースレベルの権限チェックを実行する THEN Authentication Serviceは所有者情報を考慮しなければならない

### 要件7: パスワード管理

**目的:** ユーザーとして、パスワードを安全に管理したい。そうすることで、アカウントのセキュリティを維持できるようになる。

#### 受入基準

1. WHEN ユーザーがパスワードリセットを要求する THEN Authentication Serviceはメールアドレスにリセットトークンを送信しなければならない
2. WHEN ユーザーが有効なリセットトークンと新しいパスワードを提供する THEN Authentication Serviceはパスワードを更新しなければならない
3. IF リセットトークンが24時間の有効期限を超過している THEN Authentication Serviceはトークンを無効として扱わなければならない
4. WHEN ユーザーがパスワードを変更する THEN Authentication Serviceは現在のパスワードの確認を要求しなければならない
5. WHEN パスワードが更新される THEN Authentication Serviceは全ての既存リフレッシュトークンを無効化しなければならない
6. WHEN ユーザーがパスワードを変更する THEN Authentication Serviceは過去3回のパスワード履歴を保持しなければならない
7. IF 新しいパスワードが過去3回のパスワード（Argon2idハッシュ比較）と一致する THEN Authentication Serviceは「過去に使用したパスワードは使用できません」というエラーメッセージを返さなければならない
8. WHEN パスワード履歴を保持する THEN Authentication Serviceは最新3件のみ保持し、古いパスワード履歴を自動削除しなければならない

### 要件8: セッション管理

**目的:** システム管理者として、ユーザーのセッションを管理したい。そうすることで、セキュリティとユーザー体験を最適化できるようになる。

#### 受入基準

1. WHEN ユーザーがログインする THEN Authentication Serviceはセッション情報を永続化しなければならない
2. WHILE ユーザーがアクティブである THE Authentication Serviceはセッションの有効期限を延長しなければならない
3. WHEN ユーザーが複数デバイスからログインする THEN Authentication Serviceは各デバイスで独立したセッションを管理しなければならない
4. WHEN ユーザーがログアウトする THEN Authentication Serviceは対象デバイスのセッションのみを削除しなければならない
5. WHEN 管理者が全デバイスログアウト機能を使用する THEN Authentication Serviceは全てのセッションを削除しなければならない

### 要件9: ユーザー情報取得・管理

**目的:** 認証済みユーザーとして、自分のプロフィール情報を取得したい。そうすることで、アカウント情報を確認・更新できるようになる。

#### 受入基準

1. WHEN 認証済みユーザーがプロフィール取得APIを呼び出す THEN Authentication Serviceはユーザーの基本情報（ID、メールアドレス、表示名、ロール、作成日時）を返さなければならない
2. IF アクセストークンが無効または期限切れである THEN Authentication Serviceは401 Unauthorizedエラーを返さなければならない
3. WHEN ユーザーが表示名を更新する THEN Authentication Serviceは更新後の情報を返さなければならない
4. WHEN 管理者がユーザー一覧を取得する THEN Authentication Serviceは全ユーザーの情報（パスワードを除く）を返さなければならない
5. IF 一般ユーザーがユーザー一覧取得を試みる THEN Authentication Serviceは403 Forbiddenエラーを返さなければならない

### 要件10: セキュリティとエラーハンドリング

**目的:** システム全体として、セキュアで堅牢な認証システムを提供したい。そうすることで、ユーザーデータを保護し、信頼性の高いサービスを実現できるようになる。

#### 受入基準

1. WHEN 認証エラーが発生する THEN Authentication Serviceは詳細なエラー情報（メールアドレスの存在有無など）を返してはならない
2. WHEN パスワードを保存する THEN Authentication ServiceはArgon2idアルゴリズム（メモリコスト: 64MB、時間コスト: 3、並列度: 4）を使用しなければならない
3. WHEN トークンを生成する THEN Authentication ServiceはEdDSA（Ed25519）署名アルゴリズムを使用しなければならない
4. IF データベース接続エラーが発生する THEN Authentication Serviceは適切なエラーメッセージとHTTPステータス500を返さなければならない
5. WHEN APIリクエストのバリデーションが失敗する THEN Authentication Serviceは詳細なバリデーションエラーメッセージを返さなければならない
6. WHEN センシティブな操作（パスワード変更、ロール変更、ユーザー招待）を実行する THEN Authentication Serviceはログに記録しなければならない
7. WHEN 招待トークンまたはリセットトークンを生成する THEN Authentication Serviceは暗号学的に安全なランダム文字列を使用しなければならない

## UI/UX要件

### 要件11: ログイン画面のUI/UX

**目的:** ユーザーとして、直感的で使いやすいログイン画面を利用したい。そうすることで、スムーズにシステムにアクセスできるようになる。

#### 受入基準

1. WHEN ログイン画面が表示される THEN Frontend UIはメールアドレス入力フィールド、パスワード入力フィールド、ログインボタンを表示しなければならない
2. WHEN パスワード入力フィールドが表示される THEN Frontend UIはパスワードの表示/非表示切り替えボタンを提供しなければならない
3. WHEN ユーザーが入力フィールドにフォーカスする THEN Frontend UIは視覚的なフィードバック（アウトライン表示）を提供しなければならない
4. IF メールアドレス形式が無効である THEN Frontend UIはリアルタイムバリデーションエラーを表示しなければならない
5. WHEN ログインボタンがクリックされる AND フォームが未入力である THEN Frontend UIは必須フィールドエラーを表示しなければならない
6. WHILE ログイン処理が進行中である THE Frontend UIはローディングスピナーとボタンの無効化を表示しなければならない
7. IF ログインに失敗する THEN Frontend UIは汎用的なエラーメッセージ（「メールアドレスまたはパスワードが正しくありません」）を表示しなければならない
8. WHEN アカウントがロックされている THEN Frontend UIはロック解除までの残り時間を表示しなければならない
9. WHEN ログイン画面が表示される THEN Frontend UIは「パスワードを忘れた場合」リンクを提供しなければならない
10. WHEN デバイス画面幅が768px未満である THEN Frontend UIはモバイル最適化されたレイアウトを表示しなければならない
11. WHEN ログイン画面が読み込まれる THEN Frontend UIはメールアドレスフィールドに自動フォーカスしなければならない

### 要件12: ユーザー登録画面のUI/UX（招待リンク経由）

**目的:** 招待されたユーザーとして、わかりやすい登録画面でアカウントを作成したい。そうすることで、簡単にシステムを利用開始できるようになる。

#### 受入基準

1. WHEN 招待URLにアクセスする THEN Frontend UIは招待トークンを自動的に検証し、結果を表示しなければならない
2. IF 招待トークンが無効または期限切れである THEN Frontend UIはエラーメッセージと管理者への連絡手段を表示しなければならない
3. WHEN 有効な招待トークンが確認される THEN Frontend UIは招待者のメールアドレス（読み取り専用）、表示名入力フィールド、パスワード入力フィールド、パスワード確認フィールド、登録ボタンを表示しなければならない
4. WHEN パスワード入力フィールドに入力される THEN Frontend UIはパスワード強度インジケーター（弱い/普通/強い）を表示しなければならない
5. WHEN パスワードが入力される THEN Frontend UIはパスワード要件の達成状況をチェックリストで表示しなければならない
6. IF パスワードとパスワード確認が一致しない THEN Frontend UIはリアルタイムバリデーションエラーを表示しなければならない
7. WHEN 登録ボタンがクリックされる THEN Frontend UIは利用規約とプライバシーポリシーへの同意確認を要求しなければならない
8. WHILE 登録処理が進行中である THE Frontend UIはローディングスピナーとボタンの無効化を表示しなければならない
9. WHEN 登録が成功する THEN Frontend UIは成功メッセージを表示し、自動的にダッシュボードへリダイレクトしなければならない
10. WHEN デバイス画面幅が768px未満である THEN Frontend UIはモバイル最適化されたレイアウトを表示しなければならない

### 要件13: 管理者ユーザー招待画面のUI/UX

**目的:** 管理者として、効率的に新規ユーザーを招待し、招待状況を管理したい。そうすることで、チームメンバーの追加をスムーズに行えるようになる。

#### 受入基準

1. WHEN 招待画面が表示される THEN Frontend UIは招待フォーム（メールアドレス入力、招待ボタン）と招待一覧テーブルを表示しなければならない
2. WHEN 招待一覧テーブルが表示される THEN Frontend UIは招待メールアドレス、招待日時、ステータス（未使用/使用済み/期限切れ）、有効期限、アクションボタン（取り消し/再送信）を表示しなければならない
3. WHEN 招待ボタンがクリックされる AND メールアドレスが有効である THEN Frontend UIは招待成功メッセージと招待URLのコピーボタンを表示しなければならない
4. IF 招待メールアドレスが既に登録済みである THEN Frontend UIはエラーメッセージ（「このメールアドレスは既に登録されています」）を表示しなければならない
5. WHEN 招待URLコピーボタンがクリックされる THEN Frontend UIはクリップボードにURLをコピーし、「コピーしました」というトーストメッセージを表示しなければならない
6. WHEN 招待ステータスが「未使用」である THEN Frontend UIは「取り消し」ボタンを有効化しなければならない
7. WHEN 招待ステータスが「期限切れ」である THEN Frontend UIは「再送信」ボタンを有効化しなければならない
8. WHEN 取り消しボタンがクリックされる THEN Frontend UIは確認ダイアログを表示しなければならない
9. WHEN 招待一覧が10件以上ある THEN Frontend UIはページネーションまたは無限スクロールを提供しなければならない
10. WHEN 招待一覧が読み込まれる THEN Frontend UIは招待ステータスに応じた視覚的な区別（色、アイコン）を提供しなければならない
11. WHEN デバイス画面幅が768px未満である THEN Frontend UIはテーブルをカード形式のレイアウトに変換しなければならない

### 要件14: プロフィール画面のUI/UX

**目的:** ユーザーとして、自分のプロフィール情報を確認・編集したい。そうすることで、アカウント情報を最新の状態に保てるようになる。

#### 受入基準

1. WHEN プロフィール画面が表示される THEN Frontend UIはユーザー情報セクション（メールアドレス、表示名、ロール、作成日時）とパスワード変更セクションを表示しなければならない
2. WHEN ユーザー情報セクションが表示される THEN Frontend UIはメールアドレス（読み取り専用）、表示名（編集可能）、保存ボタンを表示しなければならない
3. WHEN 表示名が変更される THEN Frontend UIは保存ボタンを有効化しなければならない
4. WHEN 保存ボタンがクリックされる THEN Frontend UIは更新成功のトーストメッセージを表示しなければならない
5. WHEN パスワード変更セクションが表示される THEN Frontend UIは現在のパスワード、新しいパスワード、パスワード確認の入力フィールドを表示しなければならない
6. WHEN 新しいパスワードが入力される THEN Frontend UIはパスワード強度インジケーターとパスワード要件チェックリストを表示しなければならない
7. WHEN パスワード変更ボタンがクリックされる THEN Frontend UIは確認ダイアログ（「全デバイスからログアウトされます」）を表示しなければならない
8. IF パスワード変更が成功する THEN Frontend UIは成功メッセージを表示し、自動的にログイン画面へリダイレクトしなければならない
9. WHEN 管理者ユーザーがプロフィール画面にアクセスする THEN Frontend UIは「ユーザー管理」リンクを表示しなければならない
10. WHEN デバイス画面幅が768px未満である THEN Frontend UIはモバイル最適化されたレイアウトを表示しなければならない

### 要件15: 共通UI/UXガイドライン

**目的:** 全画面で一貫性のある、アクセシブルなユーザー体験を提供したい。そうすることで、ユーザビリティとアクセシビリティを向上できるようになる。

#### 受入基準

1. WHEN 全ての画面が表示される THEN Frontend UIはレスポンシブデザイン（モバイル: 320px-767px、タブレット: 768px-1023px、デスクトップ: 1024px以上）を実装しなければならない
2. WHEN フォーム送信エラーが発生する THEN Frontend UIは最初のエラーフィールドにスクロールし、フォーカスしなければならない
3. WHEN 全てのボタンとリンクが表示される THEN Frontend UIはキーボード操作（Tab、Enter、Space）をサポートしなければならない
4. WHEN ページが読み込まれる THEN Frontend UIは適切なaria-label、aria-describedby、role属性を提供しなければならない
5. WHEN カラー情報を使用する THEN Frontend UIは色だけに依存せず、テキストやアイコンで補完しなければならない
6. WHEN フォームバリデーションエラーが発生する THEN Frontend UIはエラーメッセージをaria-liveリージョンで通知しなければならない
7. WHEN 全ての画面が表示される THEN Frontend UIは最低コントラスト比4.5:1（WCAG 2.1 AA準拠）を維持しなければならない
8. WHEN 処理が長時間かかる THEN Frontend UIはプログレスバーまたは進捗メッセージを表示しなければならない
9. IF 処理がネットワークエラーで失敗する THEN Frontend UIは「ネットワーク接続を確認してください」というエラーメッセージとリトライボタンを表示しなければならない
10. WHEN トーストメッセージが表示される THEN Frontend UIは自動的に非表示にしなければならない
11. WHEN モーダルダイアログが開かれる THEN Frontend UIはフォーカストラップを実装し、Escキーで閉じられるようにしなければならない
12. WHEN 全ての入力フィールドが表示される THEN Frontend UIは適切なautocomplete属性（email、current-password、new-password）を設定しなければならない
13. WHEN セッションが期限切れになる THEN Frontend UIは自動的にログイン画面へリダイレクトし、「セッションの有効期限が切れました。再度ログインしてください。」というメッセージを表示しなければならない

### 要件16: セッション有効期限切れ時の自動リダイレクト

**目的:** システム全体として、セッション有効期限切れを統一的に処理したい。そうすることで、ユーザーはスムーズに再ログインでき、セキュリティとユーザー体験を両立できるようになる。

#### 受入基準

1. WHEN アクセストークンの有効期限が切れる AND ユーザーが保護されたリソースにアクセスする THEN Authentication Serviceは401 Unauthorizedレスポンスを返さなければならない
2. WHEN Authentication Serviceが401レスポンスを返す THEN レスポンスボディに統一的なエラーコード（"TOKEN_EXPIRED"）を含めなければならない
3. WHEN Frontend Serviceがバックエンドから401レスポンスを受信する THEN 自動的に検知しなければならない
4. IF 401エラーの原因がアクセストークン有効期限切れである THEN Frontend Serviceはリフレッシュトークンを使用して自動トークンリフレッシュを試みなければならない
5. IF トークンリフレッシュが成功する THEN Frontend Serviceは元のリクエストを自動的に再実行しなければならない
6. IF トークンリフレッシュが失敗する OR リフレッシュトークンが存在しない THEN Frontend Serviceはユーザーをログイン画面へリダイレクトしなければならない
7. WHEN ログイン画面へリダイレクトされる THEN Frontend Serviceは現在のページURLをクエリパラメータ（redirectUrl）として保存しなければならない
8. WHEN ログイン画面が表示される AND redirectUrlが存在する THEN UIは「セッションの有効期限が切れました。再度ログインしてください。」というメッセージを表示しなければならない
9. WHEN ユーザーが再ログインに成功する AND redirectUrlが存在する THEN Frontend Serviceは保存されたURLへユーザーを自動的にリダイレクトしなければならない
10. WHEN 複数のAPIリクエストが同時に401エラーを受信する THEN Frontend Serviceは単一のトークンリフレッシュPromiseを共有し、全てのリクエストを同期しなければならない
11. WHEN マルチタブ環境でトークンリフレッシュが実行される THEN Frontend ServiceはBroadcast Channel APIを使用してタブ間でトークン更新を通知しなければならない
12. WHILE トークンリフレッシュ処理が進行中である THE Frontend Serviceは他のリクエストをキューに保持しなければならない
13. WHEN トークンリフレッシュが完了する THEN Frontend Serviceはキューに保持された全てのリクエストを新しいトークンで再実行しなければならない
14. IF ユーザーが明示的にログアウトする THEN Frontend ServiceはredirectUrlパラメータを設定せずにログイン画面へリダイレクトしなければならない
15. WHEN セッション有効期限切れメッセージが表示される THEN メッセージはアクセシビリティ（aria-live="polite"）をサポートしなければならない
16. WHEN アクセストークンが有効期限切れに近づく THEN Frontend Serviceはバックグラウンドで自動的にトークンをリフレッシュしなければならない
17. IF バックグラウンドリフレッシュが失敗する THEN Frontend Serviceは次のリクエスト時に401エラーハンドリングフローを実行しなければならない
18. WHEN Authentication Serviceが401レスポンスを返す THEN レスポンスヘッダーにWWW-Authenticate: Bearer realm="ArchiTrack", error="invalid_token"を含めなければならない
19. WHEN 401エラーを検知する THEN Frontend Serviceはローカルストレージからアクセストークンを削除し、HttpOnly Cookieからリフレッシュトークンを削除しなければならない
20. IF ログイン画面以外の公開ページで401エラーが発生する THEN Frontend Serviceはエラーをサイレントに処理し、ユーザーをリダイレクトしてはならない
21. WHEN 開発環境である THEN Frontend Serviceはトークン有効期限切れをコンソールにログ出力しなければならない

### 要件16A: 認証初期化時のローディング状態管理

**目的:** ユーザーとして、認証状態の初期化中にチラつきのないスムーズなUI体験を得たい。そうすることで、ページ遷移時の視覚的な違和感を排除できるようになる。

**背景:** 認証状態が不明な期間（ページロード直後、セッション復元中）にUIが不適切に判断してリダイレクトを実行すると、ログイン画面が一瞬表示される「チラつき」が発生します。これは業界標準パターン（Auth0、Firebase、NextAuth.js等）に反するUX問題です。

#### 受入基準

1. WHEN AuthContext が初期化される THEN Frontend Service は isLoading の初期値を true に設定しなければならない
2. WHEN ページがロードされる AND localStorageにリフレッシュトークンが存在する THEN Frontend Serviceはセッション復元処理を開始しなければならない（タイムアウト: 5秒）
3. WHILE セッション復元処理が進行中である THE Frontend Serviceは isLoading を true に維持しなければならない
4. WHEN セッション復元が完了する THEN Frontend Service は isLoading を false に設定し、ユーザー情報を Context に保存しなければならない
5. IF リフレッシュトークンが存在しない THEN Frontend Service は即座に isLoading を false に設定しなければならない
6. WHEN セッション復元が失敗する THEN Frontend Service はリフレッシュトークンを削除し、isLoading を false に設定しなければならない
7. WHEN isLoading が true である THEN Frontend UI はローディングインジケーター（スピナー + メッセージ）を表示しなければならない
8. WHILE isLoading が true である THE Frontend Service はログイン画面へのリダイレクトを実行してはならない
9. WHEN isLoading が false に変更される THEN ProtectedRoute は認証状態（isAuthenticated）に基づいて適切な画面を表示しなければならない
10. WHEN ローディングインジケーターが表示される THEN 「認証状態を確認中...」などの説明テキストを含めなければならない
11. WHEN ローディングインジケーターが表示される THEN アクセシビリティ属性（aria-label="認証状態を確認中"、role="status"、aria-live="polite"）を設定しなければならない
12. WHEN セッション復元が200ms未満で完了する THEN ローディングインジケーターの最小表示時間（200ms以上）を設けてチラつきを防止してもよい

#### 業界標準パターンとの整合性

本要件は以下の業界標準パターンに準拠します：

- **Auth0**: `const { isLoading, isAuthenticated, user } = useAuth0();` で初期値 `isLoading=true`
- **Firebase**: `const [loading, setLoading] = useState(true);` で認証状態確認後に `false`
- **NextAuth.js**: `const { data: session, status } = useSession();` で初期値 `status="loading"`

### 要件17: 動的ロール管理

**目的:** システム管理者として、組織の職務構造に合わせてロールを柔軟に作成・管理したい。そうすることで、現場の実態に即した権限管理を実現できるようになる。

#### 受入基準

1. WHEN システム管理者が新しいロールを作成する THEN Authentication Serviceはロール名、説明、優先順位を保存しなければならない
2. IF ロール名が既に存在する THEN Authentication Serviceは409 Conflictエラーを返さなければならない
3. WHEN システム管理者がロール情報を更新する THEN Authentication Serviceは変更履歴を監査ログに記録しなければならない
4. WHEN システム管理者がロール一覧を取得する THEN Authentication Serviceは全てのロール（名前、説明、割り当てユーザー数、権限数）を返さなければならない
5. WHEN システム管理者がロールを削除する AND ロールが少なくとも1人のユーザーに割り当てられている THEN Authentication Serviceは削除を拒否しなければならない
6. IF システム管理者が事前定義ロール（システム管理者）を削除しようとする THEN Authentication Serviceは削除を拒否しなければならない
7. WHEN ロールを作成する THEN Authentication Serviceは一意のロールIDを生成しなければならない
8. WHEN ロール優先順位を設定する THEN Authentication Serviceは整数値（高い値が高優先度）を受け入れなければならない
9. WHEN 新しいロールを作成する THEN Authentication Serviceはデフォルトで空の権限セットを割り当てなければならない

#### 事前定義ロール

以下のロールはシステムインストール時に自動作成されます：

- **システム管理者（System Administrator）**: 全ての権限を持つ最高権限ロール（削除不可）
- **一般ユーザー（General User）**: 自分が作成したリソースのみアクセス可能な基本ロール（削除不可）

### 要件18: 権限（Permission）管理

**目的:** システム管理者として、細粒度な権限を定義し、リソースとアクションの組み合わせで制御したい。そうすることで、最小権限の原則に基づいた安全なアクセス制御を実現できるようになる。

#### 受入基準

1. WHEN システムが初期化される THEN Authentication Serviceは事前定義権限を自動作成しなければならない
2. WHEN 権限を定義する THEN Authentication Serviceは `resource:action` 形式（例: `adr:read`, `user:delete`）を使用しなければならない
3. WHEN システム管理者が権限一覧を取得する THEN Authentication Serviceは全ての権限（リソースタイプ、アクション、説明）を返さなければならない
4. WHEN 権限チェックを実行する THEN Authentication Serviceはワイルドカード権限（例: `adr:*`, `*:read`）をサポートしなければならない
5. IF ユーザーが `*:*` 権限を持つ THEN Authentication Serviceは全てのリソースへの全てのアクションを許可しなければならない
6. WHEN 権限を評価する THEN Authentication Serviceは最も具体的な権限を優先しなければならない
7. WHEN システム管理者がカスタム権限を作成する THEN Authentication Serviceは権限の名前、リソースタイプ、アクション、説明を保存しなければならない

#### 権限の構造

**リソースタイプ:**
- `adr`: アーキテクチャ決定記録
- `user`: ユーザー管理
- `role`: ロール管理
- `permission`: 権限管理
- `project`: プロジェクト管理（将来的な拡張）
- `report`: レポート生成（将来的な拡張）
- `settings`: システム設定

**アクション:**
- `create`: リソースの作成
- `read`: リソースの閲覧
- `update`: リソースの更新
- `delete`: リソースの削除
- `manage`: リソースの完全管理（create + read + update + delete）
- `approve`: リソースの承認（ワークフロー用）
- `reject`: リソースの差し戻し（ワークフロー用）
- `delegate`: リソースの承認権限委譲（ワークフロー用）
- `export`: リソースのエクスポート

**権限の例:**
- `adr:read` - ADRの閲覧権限
- `adr:create` - ADRの作成権限
- `adr:*` - ADRに関する全ての操作権限
- `user:manage` - ユーザーの完全管理権限
- `*:read` - 全てのリソースの閲覧権限
- `*:*` - 全ての権限（システム管理者専用）

### 要件19: ロールへの権限割り当て

**目的:** システム管理者として、ロールに権限を割り当てたい。そうすることで、職務に応じた適切なアクセス権限を定義できるようになる。

#### 受入基準

1. WHEN システム管理者がロールに権限を追加する THEN Authentication Serviceはロール・権限の紐付けを保存しなければならない
2. IF 権限が既にロールに割り当てられている THEN Authentication Serviceは重複を無視しなければならない
3. WHEN システム管理者がロールから権限を削除する THEN Authentication Serviceは紐付けを削除しなければならない
4. WHEN システム管理者がロールの権限一覧を取得する THEN Authentication Serviceは全ての割り当てられた権限を返さなければならない
5. WHEN ロールの権限を変更する THEN Authentication Serviceは変更履歴を監査ログに記録しなければならない
6. IF システム管理者ロールから `*:*` 権限を削除しようとする THEN Authentication Serviceは削除を拒否しなければならない
7. WHEN 複数の権限を一括で割り当てる THEN Authentication Serviceはトランザクション内で処理しなければならない
8. WHEN ロールに権限を割り当てる THEN Authentication Serviceは権限の存在を事前に検証しなければならない

### 要件20: ユーザーへのロール割り当て（マルチロール対応）

**目的:** システム管理者として、ユーザーに複数のロールを割り当てたい。そうすることで、兼務や職務変更に柔軟に対応できるようになる。

#### 受入基準

1. WHEN システム管理者がユーザーにロールを追加する THEN Authentication Serviceはユーザー・ロールの紐付けを保存しなければならない
2. IF ロールが既にユーザーに割り当てられている THEN Authentication Serviceは重複を無視しなければならない
3. WHEN システム管理者がユーザーからロールを削除する THEN Authentication Serviceは紐付けを削除しなければならない
4. WHEN ユーザーが複数のロールを持つ THEN Authentication Serviceは全てのロールの権限を統合（OR演算）しなければならない
5. WHEN ユーザーのロールを変更する THEN Authentication Serviceは変更履歴を監査ログに記録しなければならない
6. IF ユーザーが最後のシステム管理者ロール保持者である AND システム管理者ロールを削除しようとする THEN Authentication Serviceは削除を拒否しなければならない
7. WHEN ユーザーに新しいロールが割り当てられる THEN Authentication Serviceは次回トークンリフレッシュ時に新しい権限を反映しなければならない
8. WHEN システム管理者がユーザーのロール一覧を取得する THEN Authentication Serviceは全ての割り当てられたロール（名前、割り当て日時）を返さなければならない
9. WHEN 複数のロールを一括で割り当てる THEN Authentication Serviceはトランザクション内で処理しなければならない

### 要件21: 権限チェック機能

**目的:** システムとして、リソースとアクションに基づいて権限を検証したい。そうすることで、細粒度なアクセス制御を実現できるようになる。

#### 受入基準

1. WHEN APIエンドポイントにアクセスする THEN Authentication Middlewareは必要な権限を検証しなければならない
2. IF ユーザーが必要な権限を持たない THEN Authentication Middlewareは403 Forbiddenエラーを返さなければならない
3. WHEN 権限チェックを実行する THEN Authentication Serviceはユーザーの全てのロールから権限を収集しなければならない
4. WHEN ワイルドカード権限（`*:read`, `adr:*`）が存在する THEN Authentication Serviceは該当する全てのリソース・アクションにマッチさせなければならない
5. IF ユーザーが `*:*` 権限を持つ THEN Authentication Serviceは全ての権限チェックを通過させなければならない
6. WHEN リソースレベルの権限チェックを実行する THEN Authentication Serviceは所有者フィルタリングを適用しなければならない
7. WHEN 権限チェックに失敗する THEN Authentication Serviceは失敗理由（必要な権限、ユーザーの権限）を監査ログに記録しなければならない
8. IF ユーザーのロールまたは権限が変更される THEN Authentication Serviceはキャッシュされた権限情報を無効化しなければならない
9. WHEN パフォーマンス最適化が必要な場合 THEN Authentication Serviceは権限情報を適切なキャッシュ機構に保存しなければならない
10. WHEN 権限チェックを実行する THEN Authentication ServiceはユーザーID、リソースタイプ、アクション、オプションのリソースIDを受け入れなければならない

### 要件22: 監査ログとコンプライアンス

**目的:** システム管理者として、権限変更の履歴を追跡したい。そうすることで、セキュリティ監査とコンプライアンス要件を満たせるようになる。

#### 受入基準

1. WHEN ロールが作成・更新・削除される THEN Authentication Serviceは監査ログに記録しなければならない
2. WHEN 権限がロールに追加・削除される THEN Authentication Serviceは監査ログに記録しなければならない
3. WHEN ユーザーにロールが割り当て・削除される THEN Authentication Serviceは監査ログに記録しなければならない
4. WHEN 監査ログを記録する THEN Authentication Serviceは実行者、対象、アクション、タイムスタンプを含めなければならない
5. WHEN システム管理者が監査ログを取得する THEN Authentication Serviceはフィルタリング（ユーザー、日付範囲、アクションタイプ）をサポートしなければならない
6. IF 監査ログの保存に失敗する THEN Authentication Serviceは操作を中断しなければならない
7. WHEN 監査ログを保存する THEN Authentication Serviceは変更前後の値を含めなければならない
8. WHEN 権限チェックに失敗する THEN Authentication Serviceは失敗をセキュリティログに記録しなければならない
9. IF センシティブな操作（システム管理者ロールの変更）が実行される THEN Authentication Serviceはアラート通知を送信しなければならない
10. WHEN 監査ログをエクスポートする THEN Authentication ServiceはJSON形式でダウンロード可能にしなければならない
11. WHEN 監査ログを構造化する THEN Authentication Serviceは以下の情報を含めなければならない
    - 一意の監査ログID
    - 操作実行日時（ISO 8601形式）
    - 実行者情報（ユーザーID、メールアドレス、ロール）
    - アクション種別（ROLE_CREATED、ROLE_UPDATED、ROLE_DELETED、PERMISSION_ASSIGNED、PERMISSION_REVOKED、USER_ROLE_ASSIGNED、USER_ROLE_REVOKED、PERMISSION_CHECK_FAILED）
    - 対象リソース情報（タイプ、ID、名前）
    - 変更前後の値
    - メタデータ（IPアドレス、ユーザーエージェント、リクエストID）
12. WHEN 監査ログテーブルを設計する THEN Authentication Serviceは以下のデータベースインデックスを作成しなければならない
    - 単体インデックス: targetId、actorId、createdAt
    - 複合インデックス: (targetType, targetId)、(actorId, createdAt)

### 要件23: 非機能要件（パフォーマンス・スケーラビリティ）

**目的:** システムとして、高いパフォーマンスとスケーラビリティを維持したい。そうすることで、ユーザー数が増加してもシームレスなサービスを提供できるようになる。

#### 受入基準

1. WHEN ログインAPIリクエストが送信される THEN Authentication Serviceは95パーセンタイルで500ms以内にレスポンスを返さなければならない
2. WHEN 権限チェックAPIが呼び出される THEN Authentication Serviceは99パーセンタイルで100ms以内にレスポンスを返さなければならない
3. WHEN システムが大量の同時ユーザーを処理する THEN Authentication Serviceはレスポンスタイムの劣化率を20%以内に抑えなければならない
4. WHEN 権限情報がキャッシュされる THEN Authentication Serviceは90%以上のキャッシュヒット率を維持しなければならない
5. WHEN データベース接続プールを管理する THEN Authentication Serviceは10-50接続の接続プールサイズを維持しなければならない
6. WHEN トークンリフレッシュAPIが呼び出される THEN Authentication Serviceは95パーセンタイルで300ms以内にレスポンスを返さなければならない
7. WHEN システムが水平スケーリングされる THEN Authentication Serviceはステートレス設計により、複数インスタンス間でセッション共有を可能にしなければならない
8. WHEN データベースクエリを実行する THEN Authentication Serviceは適切なインデックスを使用して、クエリ時間を最小限に維持しなければならない

### 要件24: フォールトトレランス（障害耐性）

**目的:** システムとして、部分的な障害が発生してもサービスを継続したい。そうすることで、可用性を最大化できるようになる。

#### 受入基準

1. IF データベース接続がタイムアウト以内に確立できない THEN Authentication Serviceは503 Service Unavailableエラーを返さなければならない
2. IF キャッシュ接続が失敗する THEN Authentication Serviceはデータベースから直接権限情報を取得しなければならない
3. WHEN 外部メールサービスが応答しない THEN Authentication Serviceはメール送信をキューに保存し、最大5回までリトライ（1分、5分、15分、1時間、6時間後）を実行しなければならない
4. WHEN トークンリフレッシュ中に複数のAPIリクエストが発生する THEN Frontend Serviceはリフレッシュ処理を1回のみ実行し、他のリクエストはその完了を待機しなければならない
5. IF トークンリフレッシュが連続で失敗する THEN Frontend Serviceはユーザーをログイン画面へリダイレクトしなければならない
6. WHEN データベース接続がタイムアウトする THEN Authentication Serviceは最大3回までリトライ（1回目: 1秒後、2回目: 2秒後、3回目: 4秒後のエクスポネンシャルバックオフ）を実行しなければならない
7. IF キャッシュ障害時にフォールバック処理が実行される THEN Authentication Serviceは警告ログを記録しなければならない
8. WHEN 外部サービス（メール送信）が利用不可である THEN Authentication Serviceはユーザー登録・招待処理を非同期キューで処理しなければならない
9. WHEN サービスが部分的な障害から復旧する THEN Authentication Serviceはヘルスチェックエンドポイントで障害状態を報告しなければならない

### 要件25: データ整合性とトランザクション管理

**目的:** システムとして、データの整合性を保証したい。そうすることで、信頼性の高いサービスを提供できるようになる。

#### 受入基準

1. WHEN ユーザー登録が実行される THEN Authentication Serviceはユーザー作成、招待トークン無効化、ロール割り当てを単一トランザクション内で処理しなければならない
2. IF トランザクション内で1つでも処理が失敗する THEN Authentication Serviceは全ての変更をロールバックしなければならない
3. WHEN 複数のロールを一括で割り当てる THEN Authentication Serviceはトランザクション内で処理しなければならない
4. WHEN データベース書き込み操作を実行する THEN Authentication ServiceはACID特性を保証しなければならない
5. IF 監査ログの保存に失敗する THEN Authentication Serviceは元の操作をロールバックしなければならない
6. WHEN パスワードリセット処理が実行される THEN Authentication Serviceはリセットトークン生成、メール送信、ログ記録をトランザクション内で処理しなければならない
7. WHEN ロール・権限の紐付けを変更する THEN Authentication Serviceは変更前後の整合性を検証しなければならない
8. IF 楽観的ロック競合が発生する THEN Authentication Serviceはリトライまたはエラーレスポンスを返さなければならない

### 要件26: セキュリティ対策（脅威モデリング）

**目的:** システムとして、一般的なWeb攻撃から保護したい。そうすることで、ユーザーデータを安全に保護できるようになる。

#### 受入基準

1. WHEN APIリクエストにSQLインジェクションが含まれる THEN Authentication Serviceはパラメータ化クエリで無害化しなければならない
2. WHEN ユーザー入力をHTMLに出力する THEN Frontend Serviceは自動的にエスケープ処理を適用しなければならない
3. WHEN 状態を変更するAPIリクエストが送信される THEN Authentication ServiceはCSRFトークンを検証しなければならない
4. IF 同一IPアドレスから短時間に複数回のログイン試行がある THEN Authentication ServiceはIPアドレスを一時的にブロックしなければならない
5. WHEN トークンをCookieに保存する THEN Authentication ServiceはHttpOnly、Secure、SameSite=Strict属性を設定しなければならない
6. WHEN APIエンドポイントにアクセスする THEN Authentication Serviceは適切なCORSヘッダーを設定しなければならない
7. IF リフレッシュトークンがHttpOnly Cookieで送信される THEN Authentication ServiceはXSS攻撃によるトークン窃取を防止しなければならない
8. WHEN パスワードリセットトークンを生成する THEN Authentication Serviceは暗号学的に安全な乱数生成器を使用しなければならない
9. WHEN 複数回のログイン失敗が検出される THEN Authentication Serviceはタイミング攻撃を防ぐため、一定時間の遅延を挿入しなければならない
10. IF セキュリティ関連のヘッダー（X-Frame-Options、X-Content-Type-Options、Strict-Transport-Security）が設定されていない THEN Authentication Serviceは適切なセキュリティヘッダーを追加しなければならない
11. WHEN 機密情報（パスワード、トークン）をログに記録する THEN Authentication Serviceはマスキング処理を適用しなければならない
12. WHEN APIレート制限を実装する THEN Authentication Serviceはユーザーごとに適切なレート制限を設定しなければならない

### 要件27: 二要素認証（2FA）設定機能

**目的:** ユーザーとして、二要素認証（TOTP）を設定することで、アカウントのセキュリティを強化したい。そうすることで、パスワード漏洩時でも不正アクセスを防止できるようになる。

#### 受入基準
1. WHEN ユーザーが2FAを有効化する THEN Authentication ServiceはRFC 6238準拠のTOTP秘密鍵を生成しなければならない
2. WHEN TOTP秘密鍵を生成する THEN Authentication Serviceは32バイト（256ビット）の暗号学的に安全な乱数を使用しなければならない
3. WHEN TOTP秘密鍵をデータベースに保存する THEN Authentication ServiceはAES-256-GCM暗号化を適用しなければならない
4. WHEN 2FA設定画面を表示する THEN Frontend ServiceはQRコード（otpauth://totp/ArchiTrack:{email}?secret={secret}&issuer=ArchiTrack形式）を生成して表示しなければならない
5. WHEN 2FA設定画面を表示する THEN Frontend Serviceは手動入力用のBase32エンコード済み秘密鍵を提供しなければならない
6. WHEN ユーザーが2FAを有効化する THEN Authentication Serviceは10個のバックアップコード（8文字英数字）を生成しなければならない
7. WHEN バックアップコードをデータベースに保存する THEN Authentication Serviceはbcrypt（cost=12）でハッシュ化しなければならない
8. WHEN ユーザーが2FAを有効化する THEN Authentication Serviceはユーザーに対してバックアップコードを1回のみ表示しなければならない
9. IF ユーザーがQRコード画面から次に進む THEN Authentication ServiceはTOTPコード検証を要求しなければならない
10. WHEN ユーザーが6桁のTOTPコードを入力する THEN Authentication Serviceはコードを検証し、正しい場合のみ2FAを有効化しなければならない

### 要件27A: 二要素認証（2FA）ログイン機能

**目的:** 2FA有効ユーザーとして、ログイン時に二要素認証を使用したい。そうすることで、より安全にシステムへアクセスできるようになる。

#### 受入基準

1. WHEN 2FA有効ユーザーがログインする THEN Authentication Serviceはメールアドレス・パスワード検証後に2FA検証画面を表示しなければならない
2. WHEN 2FA検証画面を表示する THEN Frontend Serviceは6桁のTOTPコード入力フィールドを提供しなければならない
3. WHEN TOTPコード検証を実行する THEN Authentication Serviceは30秒ウィンドウ、±1ステップ許容（合計90秒）で検証しなければならない
4. IF TOTPコード検証が5回連続で失敗する THEN Authentication Serviceはアカウントを一時的にロック（5分間）しなければならない
5. WHEN ユーザーが「バックアップコードを使用する」を選択する THEN Frontend Serviceはバックアップコード入力フィールドを表示しなければならない
6. WHEN バックアップコードを検証する THEN Authentication Serviceは未使用のバックアップコードとbcryptで比較し、一致する場合のみログインを許可しなければならない
7. IF バックアップコードが使用される THEN Authentication Serviceはそのコードを使用済みとしてマーク（usedAtフィールド更新）しなければならない
8. WHEN 2FA検証に成功する THEN Authentication ServiceはJWTアクセストークンとリフレッシュトークンを発行しなければならない

### 要件27B: 二要素認証（2FA）管理機能

**目的:** ユーザーとして、二要素認証の状態を管理したい。そうすることで、バックアップコードの確認や2FAの無効化ができるようになる。

#### 受入基準

1. WHEN ユーザーがプロフィール画面でバックアップコードを表示する THEN Frontend Serviceは使用済みコードをグレーアウト・取り消し線で表示しなければならない
2. WHEN 残りバックアップコードが3個以下になる THEN Frontend Serviceは警告メッセージと再生成リンクを表示しなければならない
3. WHEN ユーザーがバックアップコードを再生成する THEN Authentication Serviceは既存のバックアップコードを削除し、新しい10個のコードを生成しなければならない
4. WHEN ユーザーが2FAを無効化する THEN Frontend Serviceはパスワード入力確認ダイアログを表示しなければならない
5. WHEN 2FA無効化を実行する THEN Authentication Serviceはパスワード検証後、トランザクション内で秘密鍵とバックアップコードを削除しなければならない
6. WHEN 2FA無効化が完了する THEN Authentication Serviceは全ての既存リフレッシュトークンを無効化し、全デバイスからユーザーをログアウトさせなければならない

### 要件27C: 二要素認証（2FA）セキュリティ要件

**目的:** システムとして、二要素認証を安全に実装したい。そうすることで、業界標準に準拠したセキュアな2FAシステムを提供できるようになる。

#### 受入基準

1. WHEN TOTP設定を実装する THEN Authentication ServiceはSHA-1アルゴリズム（Google Authenticator互換性）を使用しなければならない
2. WHEN QRコードを生成する THEN Frontend Serviceはqrcodeライブラリ（^1.5.3）を使用しなければならない
3. WHEN TOTP検証を実装する THEN Authentication Serviceはotplibライブラリ（^12.0.1）を使用しなければならない
4. WHEN 2FA関連の環境変数を設定する THEN Authentication ServiceはTWO_FACTOR_ENCRYPTION_KEY（256ビット、16進数形式）を要求しなければならない
5. IF 暗号化鍵が設定されていない THEN Authentication Serviceは起動時にエラーをスローしなければならない
6. WHEN 2FA有効化・無効化イベントが発生する THEN Authentication Serviceは監査ログに記録しなければならない

### 要件27D: 二要素認証（2FA）UI/UX要件

**目的:** ユーザーとして、わかりやすい2FA設定画面を利用したい。そうすることで、スムーズに二要素認証を設定できるようになる。

#### 受入基準

1. WHEN 2FA設定画面を表示する THEN Frontend Serviceは3ステップのプログレスバーを表示しなければならない
2. WHEN TOTPコード入力フィールドを表示する THEN Frontend Serviceは6桁の個別入力フィールドを提供し、自動タブ移動を実装しなければならない
3. WHEN 2FA検証画面を表示する THEN Frontend Serviceは30秒カウントダウンタイマーと視覚的プログレスバーを表示しなければならない
4. WHEN バックアップコードを表示する THEN Frontend Serviceはダウンロード（.txt形式）、印刷、クリップボードコピー機能を提供しなければならない
5. WHEN バックアップコード保存確認チェックボックスがオフである THEN Frontend UIは「完了」ボタンを無効化しなければならない
6. WHEN 2FA設定が完了する THEN Frontend Serviceはトーストメッセージ「二要素認証を有効化しました」を表示しなければならない

### 要件27E: 二要素認証（2FA）アクセシビリティ要件

**目的:** すべてのユーザーとして、アクセシブルな2FA画面を利用したい。そうすることで、障害の有無に関わらず二要素認証を設定できるようになる。

#### 受入基準

1. WHEN QRコードを表示する THEN Frontend Serviceはalt属性「二要素認証用QRコード」を設定しなければならない
2. WHEN TOTPコード入力フィールドを表示する THEN Frontend Serviceはaria-label属性とrole="group"を設定しなければならない
3. WHEN 使用済みバックアップコードを表示する THEN Frontend Serviceはaria-label="使用済み"を設定しなければならない
4. WHEN 2FA検証エラーが発生する THEN Frontend Serviceはaria-live="polite"でスクリーンリーダーに通知しなければならない

## 依存仕様

本仕様で定義された認証・認可機能は、以下の仕様の基盤として機能します：

- **approval-workflow**: 決裁ワークフロー機能
  - 本仕様で定義されたRBACシステム（ロール、権限、ユーザー・ロール紐付け）を利用
  - 事前定義ロール（経営、営業、積算担当、購買担当、現場担当、経理担当）を活用して決裁ルートを構築
  - 決裁ワークフローに関する要件は別仕様（approval-workflow）で管理
