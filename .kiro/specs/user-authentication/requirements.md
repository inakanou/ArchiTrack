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
- **リセットトークン**: パスワードリセット時に生成される一意の文字列（有効期限: 1時間。2026-10-16 に24時間から改訂。要件7の改訂の記録を参照）
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

| 変数名                        | 説明                             | デフォルト値           | 必須/任意         | 形式・制約                      |
| ----------------------------- | -------------------------------- | ---------------------- | ----------------- | ------------------------------- |
| `ACCESS_TOKEN_EXPIRY`         | アクセストークンの有効期限       | `15m`                  | 任意              | 時間文字列（例: 15m, 1h）       |
| `REFRESH_TOKEN_EXPIRY`        | リフレッシュトークンの有効期限   | `7d`                   | 任意              | 時間文字列（例: 7d, 30d）       |
| `TWO_FACTOR_ENCRYPTION_KEY`   | 2FA秘密鍵暗号化用のAES-256-GCM鍵 | なし                   | 必須（2FA有効時） | 256ビット16進数文字列（64文字） |
| `INITIAL_ADMIN_EMAIL`         | 初期管理者のメールアドレス       | なし                   | 任意              | 有効なメールアドレス形式        |
| `INITIAL_ADMIN_PASSWORD`      | 初期管理者のパスワード           | なし                   | 任意              | 12文字以上、複雑性要件を満たす  |
| `INITIAL_ADMIN_DISPLAY_NAME`  | 初期管理者の表示名               | `System Administrator` | 任意              | 任意の文字列                    |
| `DATABASE_CONNECTION_TIMEOUT` | データベース接続タイムアウト     | `5000ms`               | 任意              | ミリ秒単位の数値                |
| `DATABASE_RETRY_COUNT`        | データベース接続リトライ回数     | `3`                    | 任意              | 整数値（0-10）                  |

### Frontend Service

| 変数名                         | 説明                                         | デフォルト値            | 必須/任意 | 形式・制約                |
| ------------------------------ | -------------------------------------------- | ----------------------- | --------- | ------------------------- |
| `VITE_API_BASE_URL`            | Backend API のベースURL                      | `http://localhost:3000` | 必須      | 有効なURL形式             |
| `VITE_TOKEN_REFRESH_THRESHOLD` | トークン自動リフレッシュの閾値（有効期限前） | `5m`                    | 任意      | 時間文字列（例: 5m, 10m） |

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
3. IF リセットトークンが1時間の有効期限を超過している THEN Authentication Serviceはトークンを無効として扱わなければならない
4. WHEN ユーザーがパスワードを変更する THEN Authentication Serviceは現在のパスワードの確認を要求しなければならない
5. WHEN パスワードが更新される THEN Authentication Serviceは全ての既存リフレッシュトークンを無効化しなければならない
6. WHEN ユーザーがパスワードを変更する THEN Authentication Serviceは過去3回のパスワード履歴を保持しなければならない
7. IF 新しいパスワードが過去3回のパスワード（Argon2idハッシュ比較）と一致する THEN Authentication Serviceは「過去に使用したパスワードは使用できません」というエラーメッセージを返さなければならない
8. WHEN パスワード履歴を保持する THEN Authentication Serviceは最新3件のみ保持し、古いパスワード履歴を自動削除しなければならない

**受入基準3の有効期限を24時間から1時間へ改めた（2026-10-16、IPA注意喚起（2026-10-09）に基づくセキュリティ是正。`docs/security/ipa-alert-20261009-remediation-plan.md` §5.1）**:

- リセットトークンはメールを受け取れる者にパスワードの再設定を許す資格であり、有効期間が長いほど、メールボックスや記録から入手したトークンを使われる機会が増える。リセットの手続きは要求の直後に行われるのが通常であり、1時間で利用者の操作を妨げない
- 実装はセキュリティ定数として1時間を定義しながら、実際の判定には24時間を用いており、定義が二重になっていた。条文を1時間へ改め、判定を一つの定義に揃える
- 改めたのは有効期限の値だけであり、条件節（有効期限の超過）と応答（無効として扱う）は改訂の対象外である

**採らなかった案**: 30分——メールの到着の遅延や受信の確認に要する時間を見込むと余裕が小さく、再要求が増えるため採らない。

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

### 要件16A: 認証状態初期化時のUIチラつき防止

**目的:** ユーザーとして、認証状態の初期化中にチラつきのないスムーズなUI体験を得たい。そうすることで、ページ遷移時の視覚的な違和感を排除できるようになる。

**背景:** 認証状態が不明な期間（ページロード直後、セッション復元中）にUIが不適切に判断してリダイレクトを実行すると、ログイン画面が一瞬表示される「チラつき」が発生します。これは業界標準パターン（Auth0、Firebase、NextAuth.js等）に反するUX問題です。

#### 受入基準

##### ローディング状態管理

1. WHEN システムがページをロードする THEN システムは認証状態を確認するまでローディング状態を維持しなければならない
2. WHEN 保存された認証情報が存在する THEN システムはセッション復元処理を開始しなければならない（タイムアウト: 5秒）
3. WHILE 認証状態確認が進行中である THE システムはローディング状態を維持しなければならない
4. WHEN 認証状態確認が完了する THEN システムはローディング状態を終了しなければならない
5. IF 保存された認証情報が存在しない THEN システムは即座にローディング状態を終了しなければならない
6. WHEN 認証状態確認が失敗する THEN システムは認証情報を破棄し、ローディング状態を終了しなければならない
7. WHILE 認証状態確認が進行中である THE システムは認証状態に反する画面を表示してはならない
8. IF 認証済みユーザーがページをリロードする THEN システムはセッション復元中にログイン画面を表示してはならない
9. IF 未認証ユーザーが保護されたページにアクセスする THEN システムはローディング中に保護されたコンテンツを表示してはならない
10. IF ローディング状態が200ms以上継続する THEN システムはローディングインジケーターを表示しなければならない
11. WHEN ローディングインジケーターが表示される THEN システムは説明テキスト（例: 「認証状態を確認中...」）を含めなければならない
12. WHEN ローディングインジケーターが表示される THEN システムはアクセシビリティ属性（aria-label, role="status", aria-live="polite"）を設定しなければならない
13. WHILE ローディング状態が有効である THE システムは認証保護されたページへのリダイレクトを実行してはならない
14. WHEN ローディング状態が終了する THEN システムは認証状態に基づいて適切な画面を表示しなければならない

#### 業界標準パターンとの整合性

本要件は以下の業界標準パターンに準拠します：

- **Auth0**: 初期ローディング状態から認証状態確認後に遷移
- **Firebase**: 認証状態確認完了まで待機
- **NextAuth.js**: セッション状態が"loading"から"authenticated"/"unauthenticated"へ遷移

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
4. ~~WHEN ユーザーが2FAを無効化する THEN Frontend Serviceはパスワード入力確認ダイアログを表示しなければならない~~ → 要件34 へ置き換え（2FA全ユーザー必須化により撤廃）
5. ~~WHEN 2FA無効化を実行する THEN Authentication Serviceはパスワード検証後、トランザクション内で秘密鍵とバックアップコードを削除しなければならない~~ → 要件34.7 へ置き換え
6. ~~WHEN 2FA無効化が完了する THEN Authentication Serviceは全ての既存リフレッシュトークンを無効化し、全デバイスからユーザーをログアウトさせなければならない~~ → 要件34.7 へ置き換え

**受入基準4〜6を撤廃した（2026-10-16、利用者の判断「2FAは全ユーザー必須」（2026-10-15））**: ユーザー自身による2FAの無効化は、全ユーザー必須化と両立しない。端末の紛失などで第二要素を失った場合の復旧は、管理者による2FAの再設定（要件34.7〜34.10）で行い、端末の交換は現在のTOTPコードによる再登録（要件34.11）で行う。番号は後続をずらさないために取り消し線で残す。

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

### 要件28: 画面遷移とナビゲーション

**目的:** ユーザーとして、すべての画面に直感的にアクセスしたい。そうすることで、迷うことなくシステムを操作できるようになる。

#### 受入基準

##### 初期画面とルーティング

1. WHEN 未認証ユーザーがアプリケーションのルートURLにアクセスする THEN Frontend Serviceはログイン画面を表示しなければならない
2. WHEN 認証済みユーザーがアプリケーションのルートURLにアクセスする THEN Frontend Serviceはダッシュボード画面を表示しなければならない
3. WHEN 未認証ユーザーが保護されたURLに直接アクセスする THEN Frontend Serviceはログイン画面へリダイレクトし、元のURLをredirectUrlパラメータとして保存しなければならない

##### ログイン画面からの遷移

4. WHEN ログイン画面で「パスワードを忘れた場合」リンクがクリックされる THEN Frontend Serviceはパスワードリセット要求画面へ遷移しなければならない
5. WHEN ログインが成功する AND redirectUrlパラメータが存在する THEN Frontend Serviceは保存されたURLへリダイレクトしなければならない
6. WHEN ログインが成功する AND redirectUrlパラメータが存在しない THEN Frontend Serviceはダッシュボード画面へリダイレクトしなければならない
7. WHEN 2FA有効ユーザーがログインに成功する THEN Frontend Serviceは2FA検証画面へ遷移しなければならない

##### パスワードリセットフロー

8. WHEN パスワードリセット要求画面が表示される THEN Frontend UIはメールアドレス入力フィールド、送信ボタン、ログイン画面へ戻るリンクを表示しなければならない
9. WHEN パスワードリセット要求が成功する THEN Frontend UIは「リセットメールを送信しました」メッセージを表示しなければならない
10. WHEN ユーザーがパスワードリセットメールのリンクをクリックする THEN Frontend Serviceはリセットトークン付きのパスワード再設定画面を表示しなければならない
11. WHEN パスワード再設定画面が表示される THEN Frontend UIは新しいパスワード入力フィールド、パスワード確認フィールド、変更ボタンを表示しなければならない
12. IF リセットトークンが無効または期限切れである THEN Frontend UIはエラーメッセージと「パスワードリセットを再度申請する」リンクを表示しなければならない
13. WHEN パスワード再設定が成功する THEN Frontend UIは成功メッセージを表示し、ログイン画面へリダイレクトしなければならない

##### 2FA検証画面からの遷移

14. WHEN 2FA検証画面が表示される THEN Frontend UIは6桁のTOTPコード入力フィールド、検証ボタン、「バックアップコードを使用する」リンクを表示しなければならない
15. WHEN 「バックアップコードを使用する」リンクがクリックされる THEN Frontend Serviceはバックアップコード入力画面へ遷移しなければならない
16. WHEN 2FA検証が成功する THEN Frontend Serviceはダッシュボード画面（またはredirectUrlが存在する場合は保存されたURL）へリダイレクトしなければならない
17. WHEN バックアップコード入力画面で「TOTPコードを使用する」リンクがクリックされる THEN Frontend Serviceは2FA検証画面へ戻らなければならない

##### ユーザー登録画面（招待リンク経由）からの遷移

18. WHEN 招待トークン付きURLにアクセスする THEN Frontend Serviceはユーザー登録画面を表示しなければならない
19. WHEN 登録が成功する THEN Frontend Serviceはダッシュボード画面へリダイレクトしなければならない
20. IF 招待トークンが無効である THEN Frontend UIはエラーメッセージと「管理者に連絡する」案内を表示しなければならない

##### 認証済みユーザー向け共通ナビゲーション

21. WHEN 認証済みユーザーが任意の保護された画面にアクセスする THEN Frontend UIは共通ヘッダーナビゲーションを表示しなければならない
22. WHEN 共通ヘッダーナビゲーションが表示される THEN Frontend UIはダッシュボードへのリンク、プロフィールへのリンク、ログアウトボタンを含めなければならない
23. WHEN 共通ヘッダーナビゲーションが表示される THEN Frontend UIはログイン中のユーザー表示名を表示しなければならない
24. WHEN 管理者ユーザーがナビゲーションを表示する THEN Frontend UIは「管理メニュー」ドロップダウンを追加しなければならない
25. WHEN 管理メニューが展開される THEN Frontend UIはユーザー管理、招待管理、ロール管理、権限管理、監査ログへのリンクを表示しなければならない

##### ダッシュボードからの遷移

26. WHEN ダッシュボード画面が表示される THEN Frontend UIは主要機能へのクイックアクセスリンクを提供しなければならない
27. WHEN ダッシュボードのプロフィールリンクがクリックされる THEN Frontend Serviceはプロフィール画面へ遷移しなければならない

##### プロフィール画面からの遷移

28. WHEN プロフィール画面が表示される THEN Frontend UIは2FA設定セクションへのリンクを含めなければならない
29. WHEN 2FA設定リンクがクリックされる THEN Frontend Serviceは2FA設定画面へ遷移しなければならない
30. WHEN セッション管理リンクがクリックされる THEN Frontend Serviceはセッション管理画面へ遷移しなければならない
31. WHEN プロフィール画面が表示される THEN Frontend UIはセッション管理へのリンクを含めなければならない

##### 2FA設定画面からの遷移

32. WHEN 2FA設定が完了する THEN Frontend Serviceはプロフィール画面へリダイレクトしなければならない
33. WHEN 2FA設定画面でキャンセルボタンがクリックされる THEN Frontend Serviceはプロフィール画面へ戻らなければならない

##### セッション管理画面

34. WHEN セッション管理画面が表示される THEN Frontend UIはアクティブなセッション一覧と「他のデバイスからログアウト」ボタンを表示しなければならない
35. WHEN セッション管理画面で戻るリンクがクリックされる THEN Frontend Serviceはプロフィール画面へ遷移しなければならない

##### 管理者専用画面への遷移

36. WHEN 招待管理リンクがクリックされる THEN Frontend Serviceは招待管理画面へ遷移しなければならない
37. WHEN ユーザー管理リンクがクリックされる THEN Frontend Serviceはユーザー管理画面へ遷移しなければならない
38. WHEN ロール管理リンクがクリックされる THEN Frontend Serviceはロール管理画面へ遷移しなければならない
39. WHEN 権限管理リンクがクリックされる THEN Frontend Serviceは権限管理画面へ遷移しなければならない
40. WHEN 監査ログリンクがクリックされる THEN Frontend Serviceは監査ログ画面へ遷移しなければならない

##### ログアウト

41. WHEN ログアウトボタンがクリックされる THEN Frontend Serviceはログアウト処理を実行し、ログイン画面へリダイレクトしなければならない
42. WHEN ログアウトが完了する THEN Frontend UIは「ログアウトしました」というメッセージをログイン画面に表示しなければならない

##### 画面遷移時の共通動作

43. WHEN 画面遷移が発生する THEN Frontend Serviceはブラウザの履歴（History API）を適切に更新しなければならない
44. WHEN ブラウザの戻るボタンが押される THEN Frontend Serviceは前の画面を適切に表示しなければならない
45. WHEN 未認証状態で保護された画面のURLに直接アクセスする THEN Frontend Serviceはログイン画面へリダイレクトし、認証後に元のURLへ戻らなければならない

### 要件29: パスワードリセット画面のUI/UX

**目的:** ユーザーとして、パスワードを忘れた場合に簡単にリセットしたい。そうすることで、アカウントへのアクセスを迅速に復旧できるようになる。

#### パスワードリセット要求画面

##### 受入基準

1. WHEN パスワードリセット要求画面が表示される THEN Frontend UIはメールアドレス入力フィールド、送信ボタン、ログイン画面へ戻るリンクを表示しなければならない
2. WHEN パスワードリセット要求画面が読み込まれる THEN Frontend UIはメールアドレスフィールドに自動フォーカスしなければならない
3. IF メールアドレス形式が無効である THEN Frontend UIはリアルタイムバリデーションエラーを表示しなければならない
4. WHEN 送信ボタンがクリックされる AND フォームが未入力である THEN Frontend UIは必須フィールドエラーを表示しなければならない
5. WHILE リセットメール送信処理が進行中である THE Frontend UIはローディングスピナーとボタンの無効化を表示しなければならない
6. WHEN リセットメール送信が成功する THEN Frontend UIは「入力されたメールアドレスにパスワードリセットのリンクを送信しました」というメッセージを表示しなければならない
7. WHEN リセットメール送信が成功する THEN Frontend UIはセキュリティ上、メールアドレスが登録されているかどうかを示唆してはならない
8. WHEN デバイス画面幅が768px未満である THEN Frontend UIはモバイル最適化されたレイアウトを表示しなければならない
9. WHEN ログイン画面へ戻るリンクがクリックされる THEN Frontend Serviceはログイン画面へ遷移しなければならない

#### パスワード再設定画面

##### 受入基準

10. WHEN パスワード再設定画面が表示される THEN Frontend UIは新しいパスワード入力フィールド、パスワード確認フィールド、変更ボタンを表示しなければならない
11. WHEN パスワード再設定画面が読み込まれる THEN Frontend UIはリセットトークンを自動的に検証しなければならない
12. IF リセットトークンが無効または期限切れである THEN Frontend UIはエラーメッセージと「パスワードリセットを再度申請する」リンクを表示しなければならない
13. WHEN 新しいパスワード入力フィールドに入力される THEN Frontend UIはパスワード強度インジケーター（弱い/普通/強い）を表示しなければならない
14. WHEN 新しいパスワードが入力される THEN Frontend UIはパスワード要件の達成状況をチェックリストで表示しなければならない
15. IF 新しいパスワードとパスワード確認が一致しない THEN Frontend UIはリアルタイムバリデーションエラーを表示しなければならない
16. WHILE パスワード変更処理が進行中である THE Frontend UIはローディングスピナーとボタンの無効化を表示しなければならない
17. WHEN パスワード変更が成功する THEN Frontend UIは「パスワードが正常に変更されました。新しいパスワードでログインしてください。」というメッセージを表示しなければならない
18. WHEN パスワード変更が成功する THEN Frontend Serviceは3秒後に自動的にログイン画面へリダイレクトしなければならない
19. WHEN デバイス画面幅が768px未満である THEN Frontend UIはモバイル最適化されたレイアウトを表示しなければならない

### 要件30: セッション切れ時のモーダル再認証

**目的:** ユーザーとして、フォーム入力中にセッションが切れた場合でも、入力内容を失うことなく再認証したい。そうすることで、長時間の入力作業が無駄にならず、スムーズに作業を続行できるようになる。

**背景:** 現在の実装では、操作中にトークンリフレッシュが失敗した場合、ユーザーはログイン画面にリダイレクトされ、入力中のフォームデータが失われる。PCスリープからの復帰後やタブを長時間放置した後に保存ボタンを押すと、この問題が顕著に発生する。業界ベストプラクティス（Auth0、Firebase等）に基づき、モーダルダイアログによるインプレース再認証を実装することで、ユーザー体験とデータ保全性を両立する。

**既存要件との関係:**
- 要件15.13および要件16.6の動作を拡張する。ページ初期ロード時の既存のリダイレクト動作は維持しつつ、操作中（API呼び出し中）のセッション切れではモーダル再認証を優先する。

#### 受入基準

##### セッション切れ検知とモーダル表示

1. WHEN ユーザーがAPI呼び出しを伴う操作（保存、更新、削除等）を実行する AND アクセストークンが期限切れである AND トークンリフレッシュが失敗する THEN Frontend Serviceはセッション切れモーダルを表示しなければならない
2. WHEN セッション切れモーダルが表示される THEN Frontend UIは現在のページをそのまま背景に保持し、フォームの入力データを維持しなければならない
3. WHEN セッション切れモーダルが表示される THEN Frontend UIはページ遷移（リダイレクト）を実行してはならない

##### モーダルの構成と動作

4. WHEN セッション切れモーダルが表示される THEN Frontend UIは「セッションの有効期限が切れました」というメッセージ、メールアドレス入力フィールド（前回のログイン情報で自動入力）、パスワード入力フィールド、再ログインボタンを表示しなければならない
5. WHEN セッション切れモーダルが表示される THEN Frontend UIはモーダル外の画面操作を無効化（オーバーレイ）しなければならない
6. WHEN セッション切れモーダルが表示される THEN Frontend UIはEscキーによるモーダルクローズを無効化しなければならない（意図しないデータ損失防止のため）
7. WHEN セッション切れモーダルのパスワードフィールドが表示される THEN Frontend UIはパスワードフィールドに自動フォーカスしなければならない

##### 再認証フロー

8. WHEN ユーザーがセッション切れモーダルで有効な認証情報を入力する THEN Frontend Serviceは再認証APIを呼び出し、新しいトークンを取得しなければならない
9. WHEN 再認証が成功する THEN Frontend Serviceはモーダルを閉じ、アクセストークンとリフレッシュトークンを更新し、TokenRefreshManagerを再初期化しなければならない
10. WHEN 再認証が成功する THEN Frontend Serviceはユーザーが操作していた画面をそのまま表示し、入力データが保持されていることを保証しなければならない
11. IF 再認証でメールアドレスまたはパスワードが正しくない THEN Frontend UIはモーダル内にエラーメッセージを表示し、モーダルを閉じてはならない
12. IF 再認証対象ユーザーが2FA有効である THEN Frontend UIはモーダル内で2FA検証フィールドを追加表示しなければならない

##### セッション切れモーダルのコールバック機構

13. WHEN API Clientがトークンリフレッシュ失敗を検知する THEN API ClientはAuthContextに通知するためのコールバック（onSessionExpired）を呼び出さなければならない
14. WHEN AuthContextがonSessionExpiredコールバックを受信する THEN AuthContextはsessionExpired状態をtrueに設定し、セッション切れモーダルの表示をトリガーしなければならない
15. WHEN AuthContextがsessionExpired状態を管理する THEN AuthContextはページ初期ロード時のセッション切れ（リダイレクト方式）と操作中のセッション切れ（モーダル方式）を区別しなければならない

##### エラーハンドリングとフォールバック

16. IF 再認証が3回連続で失敗する THEN Frontend UIは「ログイン画面へ移動」ボタンを表示し、ユーザーにログイン画面への遷移オプションを提供しなければならない
17. IF ネットワークエラーにより再認証APIに到達できない THEN Frontend UIは「ネットワーク接続を確認してください」というメッセージとリトライボタンを表示しなければならない

##### アクセシビリティ

18. WHEN セッション切れモーダルが表示される THEN Frontend UIはフォーカストラップを実装し、Tab/Shift+Tabでモーダル内の要素のみをナビゲートしなければならない
19. WHEN セッション切れモーダルが表示される THEN Frontend UIはrole="dialog"、aria-modal="true"、aria-labelledby（モーダルタイトル）を設定しなければならない
20. WHEN セッション切れメッセージが表示される THEN Frontend UIはaria-live="assertive"でスクリーンリーダーに即座に通知しなければならない

##### レスポンシブ対応

21. WHEN デバイス画面幅が768px未満である THEN Frontend UIはセッション切れモーダルをフルスクリーンに近いレイアウトで表示しなければならない

---

### 要件31: 公開鍵の配布（JWKS）とキャッシュ制御

**目的:** JWTの検証者として、署名検証用の公開鍵を標準的な形式で取得し、検証のたびに取得し直さずに済むようにしたい。そうすることで、検証の負荷と遅延を抑えつつ、鍵の入れ替えにも追随できるようになる。

**背景:** 公開鍵を配布するエンドポイント `/.well-known/jwks.json` は既に実装されている（`backend/src/routes/jwks.routes.ts`）が、**本仕様に記述が無く要件として決められていなかった**。E2E には「適切なCache-Controlヘッダーが設定されていること」を確かめる検証が置かれていたが、実装がヘッダーを設定していないにもかかわらず、観測結果で主張を包む構造のため恒久的に緑になっていた（site-survey の Task 115.127 段6 で顕在化）。**誰も決めていない仕様を検証している状態**であったため、要件として明記する。

**既存要件との関係:**
- 要件18（トークン発行）で用いるEdDSA署名の検証手段を提供する。
- 旧公開鍵の併載は鍵の入れ替え時の猶予期間に用いる（環境変数 `JWT_PUBLIC_KEY_OLD`）。キャッシュの有効期間はこの猶予期間より十分に短くなければならない。

#### 受入基準

##### 公開鍵の配布

1. WHEN 検証者が公開鍵配布エンドポイントへ要求する THEN Backend Serviceは現在の公開鍵をRFC 7517準拠のJWKS形式で応答しなければならない
2. WHEN 環境変数 `JWT_PUBLIC_KEY_OLD` が設定されている THEN Backend Serviceは旧公開鍵を同一の応答に併載しなければならない
3. WHEN 公開鍵をJWKS形式で応答する THEN Backend Serviceは各鍵に `alg`、`use`、`kid` を含めなければならない

##### キャッシュ制御

4. WHEN 検証者が公開鍵配布エンドポイントへ要求する THEN Backend Serviceは `Cache-Control` ヘッダーを設定しなければならない
5. WHEN `Cache-Control` ヘッダーを設定する THEN Backend Serviceはキャッシュの有効期間を300秒（5分）としなければならない
6. WHERE キャッシュの有効期間を定める THE Backend Serviceは鍵の入れ替えの猶予期間より十分に短い値を用いなければならない

---

### 要件32: 二要素認証を伴うログインの完全性

**目的:** 2FAを利用するユーザーとして、第二要素の検証がパスワード認証の代わりにならないことを保証されたい。そうすることで、メールアドレスを知られただけではアカウントに侵入されないようになる。

**背景:** IPA注意喚起（2026-10-09）に基づく監査（`docs/security/ipa-alert-20261009-remediation-plan.md`）で、2FA検証の要求がメールアドレスとTOTPコード（またはバックアップコード）だけで受理され、パスワード認証の成功を前提としていないことが判明した。2FAを有効にしたアカウントほど、パスワードを省いた一要素の認証で侵入できる状態であった。

**既存要件との関係:**
- 要件27A（2FAログイン機能）の受入基準1・6・8を補強する。2FA検証画面へ進む条件（パスワード認証の成功）を、検証を受理する側の条件として明文化する。

#### 受入基準

1. WHEN 2FA有効ユーザーのメールアドレスとパスワードの検証が成功する THEN Authentication Serviceはそのログイン試行に限って有効な2FA検証の資格を発行しなければならない
2. IF 2FA検証の要求がパスワード検証の成功によって発行された資格を伴わない THEN Authentication Serviceはトークンを発行せず認証エラーを返さなければならない
3. WHEN 2FA検証の資格を発行する THEN Authentication Serviceは資格の有効期間を5分以内とし、期限を過ぎた資格による検証を拒否しなければならない
4. WHEN 2FA検証の資格による検証が一度成功する THEN Authentication Serviceは同じ資格による以後の検証を拒否しなければならない
5. IF 2FA検証の資格の代わりにアクセストークンまたはリフレッシュトークンが提示される THEN Authentication Serviceは検証を拒否しなければならない
6. WHEN バックアップコードによる2FA検証を受け付ける THEN Authentication ServiceはTOTPコードによる検証と同じ資格を要求しなければならない
7. IF 同一のTOTPコードが有効期間内に二度目に提示される THEN Authentication Serviceは二度目の検証を拒否しなければならない

---

### 要件33: トークンの種別の区別と失効

**目的:** システムユーザーとして、ログアウトやパスワード変更をした時点で、それ以前に発行されたトークンが使えなくなることを保証されたい。そうすることで、盗まれたトークンによる不正利用の期間を最小にできるようになる。

**背景:** 同監査で、アクセストークンとリフレッシュトークンが同じ内容で発行されて種別を区別できず、有効期限7日のリフレッシュトークンをアクセストークンとして使ってAPIを呼べることが判明した。この経路はログアウト・全デバイスログアウト・パスワード変更のいずれでも失効しなかった。あわせて、リフレッシュトークンがブラウザの永続ストレージと応答本文で扱われており、要件26.7の意図（XSSによる窃取の防止）を満たしていなかった。

**既存要件との関係:**
- 要件5（トークン管理）、要件7.5（パスワード更新時の失効）、要件8（セッション管理）、要件26.5・26.7（Cookie属性とXSS対策）を補強する。

#### 受入基準

##### 種別の区別

1. IF 保護されたAPIエンドポイントへの要求がアクセストークン以外のトークンを提示する THEN Authentication Serviceは401 Unauthorizedエラーを返さなければならない
2. IF リフレッシュの要求がリフレッシュトークン以外のトークンを提示する THEN Authentication Serviceはリフレッシュを拒否しなければならない
3. WHEN トークンを検証する THEN Authentication Serviceは発行者と想定利用者が本システムであることを確認し、一致しないトークンを拒否しなければならない

##### 失効

4. WHEN ユーザーがログアウトする THEN Authentication Serviceはそのセッションのリフレッシュトークンを直ちに使用不能にしなければならない
5. WHEN ユーザーが全デバイスからログアウトする、またはパスワードが変更・リセットされる THEN Authentication Serviceはそのユーザーの全てのリフレッシュトークンを直ちに使用不能にしなければならない
6. IF 既にローテーションで置き換えられたリフレッシュトークンが再び提示される THEN Authentication Serviceはそのトークンから派生した全てのリフレッシュトークンを失効させ、再ログインを要求しなければならない
7. WHEN リフレッシュトークンを保存する THEN Authentication Serviceは保存された値だけからは元のトークンを復元できない形式で保存しなければならない

##### ブラウザでの取り扱い

8. WHEN Frontend Serviceがリフレッシュトークンを受け渡す THEN Frontend ServiceはHttpOnly Cookieのみを用い、スクリプトから読み取れる場所に保存してはならない
9. WHEN Authentication Serviceがログイン・登録・2FA検証・リフレッシュの応答を返す THEN Authentication Serviceは応答本文にリフレッシュトークンを含めてはならない
10. WHEN Frontend Serviceがアクセストークンを保持する THEN Frontend Serviceはブラウザの永続ストレージに保存してはならない
11. WHEN ユーザーがページを再読み込みする AND 有効なリフレッシュトークンのCookieが存在する THEN Frontend Serviceは再ログインを求めずに認証状態を復元しなければならない
12. WHEN Cookieで認証情報を受け付ける状態変更の要求を処理する THEN Authentication Serviceは要件26.3に従いCSRFトークンを検証しなければならない

---

### 要件34: 二要素認証の全ユーザー必須化

**目的:** システム管理者として、全てのユーザーが二要素認証を使うことを保証したい。そうすることで、パスワードが漏洩してもアカウントへの不正アクセスを防げるようになる。

**背景:** IPA注意喚起は外部公開アプリケーションの認証強化（多要素認証）を求めている。従来の2FAは任意であり、管理者にも強制できなかった。利用者の判断（2026-10-15）により、全ユーザーで必須とし、未登録者は次回ログイン時に直ちに登録を求める。

**既存要件との関係:**
- 要件27（2FA設定機能）の設定手順をそのまま用いる。
- 要件27B の受入基準4〜6（ユーザー自身による2FAの無効化）は、必須化と両立しないため撤廃し、本要件の受入基準6〜9（管理者による2FAの再設定）で置き換える。

#### 受入基準

1. WHEN 2FA未登録のユーザーのメールアドレスとパスワードの検証が成功する THEN Frontend Serviceは2FA設定画面へ遷移させなければならない（初回のパスワード変更を要するユーザーは、要件37.7の変更を完了して再びログインした後に遷移させる）
2. WHILE ユーザーが2FA未登録である THE Authentication Serviceは2FAの設定とログアウト以外のAPI要求（初回のパスワード変更を要するユーザーによるパスワード変更の要求を除く）を403 Forbiddenエラーで拒否しなければならない
3. WHILE ユーザーが2FA未登録である THE Frontend UIは2FA設定画面以外の画面（初回のパスワード変更を要するユーザーのパスワード変更画面を除く）へ遷移させてはならない
4. WHEN 2FA未登録のユーザーが2FAの設定を完了する THEN Frontend Serviceはログイン後の通常の遷移先へ遷移させなければならない
5. WHEN 招待経由で新規ユーザーがアカウントを作成する THEN Frontend Serviceは利用開始前に2FA設定画面へ遷移させなければならない
6. IF ユーザーが自身の2FAを無効化しようとする THEN Authentication Serviceは要求を拒否しなければならない
7. WHEN 管理者が他のユーザーの2FAを再設定する THEN Authentication Serviceはそのユーザーの秘密鍵とバックアップコードを削除し、全てのリフレッシュトークンを失効させ、再設定より前に発行されたアクセストークンによる以後の要求を拒否しなければならない
8. WHEN 2FAを再設定されたユーザーが次にログインする THEN Frontend Serviceは2FA設定画面へ遷移させなければならない
9. IF 管理者が自分自身の2FAを再設定しようとする THEN Authentication Serviceは要求を拒否しなければならない
10. WHEN 2FAが再設定される THEN Authentication Serviceは監査ログに実行者と対象ユーザーを記録しなければならない
11. WHEN ユーザーが2FA設定画面で現在のTOTPコードによる再登録を行う THEN Authentication Serviceは新しい秘密鍵とバックアップコードに置き換えなければならない

**受入基準1〜3に初回のパスワード変更の例外を加えた（2026-10-16、設計レビュー）**:

- 初期管理者の初回ログインでは、要件37.7（パスワード変更画面へ遷移させ、変更まで他の画面へ遷移させない）と本要件の受入基準1〜3（2FA設定画面へ遷移させ、2FAの設定とログアウト以外を拒否する）が同時に成り立ち、いずれの手続きも完了できなかった
- 初期のパスワードは環境変数を参照できる者に知られうるため、先にパスワードを変えてから2FAを登録する順とする（利用者の判断、2026-10-16）。パスワードの変更は全てのリフレッシュトークンを失効させる（要件7.5）ため、再びログインした後に2FA設定画面へ遷移させる
- 例外は初回のパスワード変更を要するユーザーのパスワード変更に限り、その他の要求の拒否と遷移の制限は改訂の対象外である

**採らなかった案**: 2FAの登録を先にする順——初期のパスワードを知る第三者が先に2FAを登録できる余地が残るため採らない。

**受入基準7に再設定より前のアクセストークンの拒否を加えた（2026-10-22、利用者の判断）**:

- 改訂前の受入基準7はリフレッシュトークンの失効だけを求めており、アクセストークン（有効期限15分）は再設定の後も有効だった
- 2FAが未登録の状態では2FAの設定の要求が許される（受入基準2）ため、端末を奪った第三者が残ったアクセストークンで、正規のユーザーより先に自分の認証アプリを登録できた（タスク47.8の独立レビューの指摘）
- 改訂後は、再設定より前に発行されたアクセストークンによる要求を2FAの設定を含めて拒否し、ユーザーは再びログインしてから2FAを登録する

**採らなかった案**: 改訂しない（アクセストークンの有効期限の15分を許容する）——上記の先取りの登録を防げないため採らない。

---

### 要件35: 認証系の試行制限とクライアントの識別

**目的:** システムとして、総当たりや大量送信を試行回数で抑止したい。そうすることで、パスワード・2FAコード・リセット手続きへの攻撃を防げるようになる。

**背景:** 同監査で、試行回数の制限が、利用者が自由に指定できる送信元情報をそのまま送信元の識別に用いていることが判明した。要求ごとに送信元情報を変えれば回数制限を回避でき、監査ログに残る送信元IPアドレスも偽装できた。また、2FA検証・パスワードリセット・登録には専用の制限が無かった。

**既存要件との関係:**
- 要件26.4（同一IPからの短時間の複数ログイン試行のブロック）と要件26.12（レート制限）を、識別の信頼性と対象の範囲について補強する。

#### 受入基準

1. WHEN 試行回数の制限のために送信元を識別する THEN Authentication Serviceは本システムが信頼する中継装置が付与した情報だけを用い、利用者が指定した送信元情報によって識別を変えてはならない
2. WHEN 監査ログやセキュリティログに送信元IPアドレスを記録する THEN Authentication Serviceは受入基準1と同じ方法で識別したIPアドレスを記録しなければならない
3. IF 同一の送信元から2FA検証（TOTPコードまたはバックアップコード）の要求が短時間に規定回数を超える THEN Authentication Serviceは一定時間429 Too Many Requestsエラーを返さなければならない
4. IF 同一の送信元または同一のメールアドレスに対するパスワードリセット要求が短時間に規定回数を超える THEN Authentication Serviceは一定時間要求を受け付けず、リセットメールを送信してはならない
5. IF 同一の送信元からパスワードリセットの実行または招待経由の登録の要求が短時間に規定回数を超える THEN Authentication Serviceは一定時間429 Too Many Requestsエラーを返さなければならない
6. WHILE 本番環境で動作している THE Authentication Serviceは試行回数の制限を無効化する設定を無視しなければならない
7. IF パスワードリセット要求を受理しない THEN Authentication Serviceは登録の有無を推測できない応答を返さなければならない

---

### 要件36: アカウントの無効化と棚卸し

**目的:** システム管理者として、退職者や不要になったアカウントを削除せずに止め、全アカウントの利用状況を把握したい。そうすることで、作成していないアカウントや無効化したはずのアカウントの利用を発見できるようになる。

**背景:** IPA注意喚起は不審なアカウント（作成していないアカウント、無効化されたはずのアカウントの有効化）の確認と、アカウント棚卸しの運用見直しを求めている。従来はアカウントを止める手段が削除しかなく、最終ログイン日時も記録されていなかった。利用者の判断（2026-10-15）により、最終ログインから90日で自動的に無効化する。

**既存要件との関係:**
- 要件9（ユーザー情報取得・管理）と要件8（セッション管理）を拡張する。
- 要件4.6（ログイン失敗によるロック）は一時的な状態であり、本要件の無効化とは別のものとして扱う（ログイン成功や時間経過で解除されない）。

#### 受入基準

##### 無効化と再有効化

1. WHEN 管理者がユーザーを無効化する THEN Authentication Serviceはそのユーザーの全てのリフレッシュトークンを失効させ、以後のログイン・リフレッシュ・API要求を拒否しなければならない
2. IF 無効化されたユーザーがログインを試みる THEN Authentication Serviceはパスワードの正否に関わらず認証エラーを返さなければならない
3. WHEN 管理者が無効化されたユーザーを再有効化する THEN Authentication Serviceはそのユーザーのログインを再び許可しなければならない
4. WHEN ユーザーが無効化または再有効化される THEN Authentication Serviceは全てのシステム管理者へ通知し、監査ログに実行者・対象・理由を記録しなければならない
5. IF 管理者が自分自身を無効化しようとする、または最後の有効なシステム管理者を無効化しようとする THEN Authentication Serviceは要求を拒否しなければならない
6. WHEN 無効化されたユーザーが担当者として設定された既存データを表示する THEN Frontend UIはそのユーザーの表示名を引き続き表示しなければならない

##### 利用状況の記録と自動無効化

7. WHEN ログインが成功する THEN Authentication Serviceはそのユーザーの最終ログイン日時を記録しなければならない
8. WHEN 有効なユーザーの最終ログイン日時・アカウント作成日時・最後の再有効化日時のうち最も新しい日時から90日が経過する THEN Authentication Serviceはそのユーザーを自動的に無効化しなければならない
9. WHEN ユーザーが自動的に無効化される THEN Authentication Serviceは全てのシステム管理者へ通知し、監査ログに自動無効化であることを記録しなければならない

##### 棚卸し画面

10. WHEN 管理者がユーザー棚卸し画面を表示する THEN Frontend UIは全ユーザーについて表示名、メールアドレス、ロール、状態（有効・無効）、2FA登録の有無、最終ログイン日時、作成日時、招待者を表示しなければならない
11. WHEN 管理者がユーザー棚卸し画面で状態または最終ログインからの経過日数で絞り込む THEN Frontend UIは条件に合うユーザーだけを表示しなければならない
12. IF 一般ユーザーがユーザー棚卸し画面またはその情報の取得を試みる THEN Authentication Serviceは403 Forbiddenエラーを返さなければならない

**受入基準8の起点に最後の再有効化日時を加えた（2026-10-22、利用者の判断）**:

- 改訂前の起点は最終ログイン日時（ログイン実績が無い場合はアカウント作成日時）だけだった。再有効化は最終ログイン日時を変えないため、長くログインしていなかったユーザーを再有効化しても、翌日の自動無効化で再び無効化された（タスク49.2の独立レビューの指摘）
- 改訂後は再有効化した時点から90日を数え直す。最終ログイン日時は書き換えず、再有効化の日時を別に記録する（最終ログイン日時は棚卸し画面に表示する事実の記録のため）

**採らなかった案**: 改訂しない（再有効化したユーザーに翌日までのログインを求める運用で対応する）——利用者の判断により採らない。

---

### 要件37: 招待・パスワードリセットのトークンと初期管理者の保護

**目的:** システム管理者として、招待やパスワードリセットのトークンが第三者の手に渡らないことを保証したい。そうすることで、記録や一覧からトークンを入手した者にアカウントを作成・乗っ取りされないようになる。

**背景:** 同監査で、招待とパスワードリセットのトークンが保存時に元の値のまま保持され、招待一覧の応答に含まれ、検証時にアクセスログへ平文で残ることが判明した。使用済み・期限切れのトークンも削除されていなかった。また、招待を取り消せるのは作成者本人だけであり、初期管理者のパスワードにはパスワードポリシーが適用されていなかった。

**既存要件との関係:**
- 要件1（招待）、要件2（アカウント作成）、要件3（初期管理者）、要件7（パスワード管理）、要件13（招待画面）を補強する。
- 要件13.3・13.5（招待成功時の招待URLのコピー）は、招待を作成した直後の一度に限って維持する。

#### 受入基準

1. WHEN 招待トークンまたはパスワードリセットトークンを保存する THEN Authentication Serviceは保存された値だけからは元のトークンを復元できない形式で保存しなければならない
2. WHEN 管理者が招待一覧を取得する THEN Authentication Serviceは応答に招待トークンおよび招待URLを含めてはならない
3. WHEN 招待トークンまたはパスワードリセットトークンの検証要求を記録する THEN Authentication Serviceはアクセスログその他の記録にトークンの値を残してはならない
4. WHEN 招待トークンまたはパスワードリセットトークンが使用済みになる、または有効期限を過ぎる THEN Authentication Serviceは24時間以内にそのトークンを削除しなければならない
5. WHEN 管理者が未使用の招待を取り消す THEN Authentication Serviceは招待の作成者でない管理者による取り消しも受け付けなければならない
6. WHEN 初期管理者を作成する THEN Authentication Serviceは要件2.5〜2.8のパスワードポリシーを適用し、満たさない場合は作成を中止しなければならない
7. WHEN 初期管理者が初めてログインする THEN Frontend Serviceはパスワード変更画面へ遷移させ、変更を完了するまで他の画面へ遷移させてはならない
8. WHEN 有効期限の切れたリフレッシュトークンが存在する THEN Authentication Serviceは24時間以内にそのトークンを削除しなければならない

---

### 要件38: 権限付与の上限と既定の権限

**目的:** システム管理者として、権限を管理できる利用者でも自分を超える権限を作り出せないことを保証したい。そうすることで、一つのアカウントの乗っ取りが全権限の奪取に広がらないようになる。

**背景:** 同監査で、ユーザー更新の権限を持つ利用者が管理者ロールを付与でき、ロール更新の権限を持つ利用者が任意のロールへ全権限（`*:*`）を追加できることが判明した。また、一般ユーザーロールの既定権限に全ユーザーの一覧の閲覧が含まれ、要件9.5（一般ユーザーによるユーザー一覧の取得の拒否）を満たしていなかった。受入基準1〜3の実装（タスク51.1）の後に、次の抜け道が残っていることが判明した。ロール更新の権限で既存のロールの優先度を上げられ、ユーザー更新の権限と併せれば受入基準1の上限を実質的に外せる。ロール作成の権限で自分より優先度の高いロールを作れる。システム管理者でない利用者が全権限以外の自分の持たない権限をロールへ追加できる。自分より優先度の高いロールの割り当てを他のユーザーから外せる。システム管理者がその優先度を超えるロールを作ると、誰も割り当てられないロールが生じる。利用者の判断（2026-10-26）により受入基準6〜10を加えた。続けて、受入基準6が止めるのは優先度の引き上げだけであり、自分より優先度の高いロールの優先度を上限以下へ下げてから割り当てれば、そのロールの権限を渡せることが判明した。同じ判断（2026-10-26）により、自分より優先度の高いロールの変更・削除の拒否（受入基準11）と、システムロールの優先度の変更の拒否（受入基準12）を加えた。受入基準12により、受入基準10の基準のシステム管理者ロールの優先度は変わらない値になる。さらに最終検証（2026-10-26）で、ユーザーの削除・無効化・再有効化と2FAの再設定が対象のユーザーの優先度を見ておらず、これらの権限を持つ利用者が自分より優先度の高い利用者のアカウントを消す・止める・戻す、またはその第二要素を外せることが判明した。2FAの再設定は対象の第二要素を外すため、パスワードを知る者による乗っ取りの足掛かりにもなる。受入基準9（ロールの割り当ての解除）と同じく上位の利用者の権限を奪う操作であるため、利用者の判断（2026-10-26）により受入基準13を加えた。

**既存要件との関係:**
- 要件17〜20（ロール・権限・割り当て）に付与の上限を加える。
- 受入基準1・6・7・9・11・13の上限は、利用者の保有するロールの優先度の最大値とする。上限と同じ優先度は上限を超えない。受入基準8の保有する権限は、要件21の権限チェックと同じワイルドカードの照合で判定する。
- 受入基準6は変更後の優先度を、受入基準11は対象のロールの現在の優先度を判定する。どちらも残す（上限以下のロールを上限より上へ上げる変更は受入基準6が、上限より上のロールを変える・下げる・削除する操作は受入基準11が拒否する）。受入基準11は受入基準8より先に判定する。
- 受入基準13の対象のユーザーの優先度は、そのユーザーの保有するロールの優先度の最大値とする（ロールを持たないユーザーは上限を超えない）。自分自身への操作は受入基準13の対象外とし、要件34.9・36.5とユーザーの削除の自己の拒否が従来どおり拒否する。最後のシステム管理者の保護（要件36.5・ユーザーの削除の保護）は受入基準13の後に判定する。
- 受入基準3（システムロールの名前の変更）と受入基準12（システムロールの優先度の変更）は、利用者の優先度によらず拒否する。
- 要件9.4・9.5（ユーザー一覧）を、担当者選択に必要な最小限の情報の取得と区別する。

#### 受入基準

1. IF 利用者が自分の保有するロールより優先度の高いロールを他のユーザーへ割り当てようとする THEN Authentication Serviceは403 Forbiddenエラーを返さなければならない
2. IF システム管理者ロールを持たない利用者がロールへ全権限を追加しようとする、またはシステム管理者ロールを割り当てようとする THEN Authentication Serviceは403 Forbiddenエラーを返さなければならない
3. IF 利用者がシステムロールの名前を変更しようとする THEN Authentication Serviceは要求を拒否しなければならない
4. WHEN 一般ユーザーロールの既定権限を定める THEN Authentication Serviceはユーザー一覧の閲覧権限を含めてはならない
5. WHEN 認証済みユーザーが担当者の選択肢を取得する THEN Authentication Serviceは有効なユーザーのIDと表示名だけを返し、メールアドレスとロールを含めてはならない
6. IF 利用者が既存のロールの優先度を、自分の保有するロールの最高の優先度より高い値へ変更しようとする THEN Authentication Serviceは403 Forbiddenエラーを返さなければならない
7. IF 利用者が自分の保有するロールの最高の優先度より高い優先度のロールを作成しようとする THEN Authentication Serviceは403 Forbiddenエラーを返さなければならない
8. IF システム管理者ロールを持たない利用者が自分の保有しない権限をロールへ追加しようとする THEN Authentication Serviceは403 Forbiddenエラーを返さなければならない
9. IF 利用者が自分の保有するロールの最高の優先度より高い優先度のロールの割り当てを他のユーザーから外そうとする THEN Authentication Serviceは403 Forbiddenエラーを返さなければならない
10. IF 利用者がロールの作成または変更でシステム管理者ロールの優先度を超える優先度を指定する THEN Authentication Serviceは400 Bad Requestの検証エラーを返さなければならない
11. IF 利用者が自分の保有するロールの最高の優先度より高い優先度のロールを変更（優先度の変更、権限の追加・削除）または削除しようとする THEN Authentication Serviceは403 Forbiddenエラーを返さなければならない
12. IF 利用者がシステムロール（システム管理者・一般ユーザー）の優先度を変更しようとする THEN Authentication Serviceは要求を拒否しなければならない
13. IF 利用者が自分の保有するロールの最高の優先度より高い優先度のロールを持つ他のユーザーを削除・無効化・再有効化しようとする、またはそのユーザーの2FAを再設定しようとする THEN Authentication Serviceは403 Forbiddenエラーを返さなければならない

---

### 要件39: 案件単位の閲覧範囲

**目的:** システム管理者として、利用者が関係する案件のデータだけを閲覧・操作できるようにしたい。そうすることで、一つのアカウントが乗っ取られても全社の案件データが漏れないようになる。

**背景:** 同監査で、一般ユーザーの既定権限で、担当外を含む全案件の見積・契約・原価・写真をID指定でも一覧でも取得できることが判明した。要件21.6（リソースレベルの権限チェックにおける所有者フィルタリング）が案件に対して実装されていなかった。利用者の判断（2026-10-15）により、関係者を営業担当者・工事担当者・作成者とし、全案件を閲覧できる権限を別に設け、範囲外の案件は存在しないものとして扱う。

**既存要件との関係:**
- 要件21.6の「所有者フィルタリング」を案件について具体化する。
- 本要件は判定の規則と共通の振る舞いを定める。各業務機能（プロジェクト管理、現場調査、数量表、内訳書、見積依頼、見積書、契約、工程表、実行予算、工事写真）への適用は、それぞれの仕様が受入基準として持つ。

#### 受入基準

1. WHEN 利用者が案件に属するデータへアクセスする THEN Authentication Serviceは利用者がその案件の営業担当者、工事担当者、作成者のいずれかである場合、または全案件閲覧の権限を持つ場合に限り許可しなければならない
2. IF 利用者が閲覧範囲外の案件または案件に属するデータへID指定でアクセスする THEN Authentication Serviceは404 Not Foundエラーを返し、存在の有無を推測できる情報を含めてはならない
3. WHEN 利用者が案件または案件に属するデータの一覧・検索・件数を取得する THEN Authentication Serviceは閲覧範囲内の案件のデータだけを返さなければならない
4. WHEN 利用者が案件に属するファイルの取得用URLを要求する THEN Authentication Serviceは受入基準1と同じ判定を適用しなければならない
5. WHEN システム管理者ロールの既定権限を定める THEN Authentication Serviceは全案件閲覧の権限を含めなければならない
6. WHEN 案件の営業担当者または工事担当者が変更される THEN Authentication Serviceは変更後の担当者に基づいて以後の判定を行わなければならない
7. IF 閲覧範囲外の案件へのアクセスが拒否される THEN Authentication Serviceはセキュリティログに利用者・対象・日時を記録しなければならない
8. IF 利用者が経路で指定した案件（または親のデータ）と、要求の対象のデータが実際に属する案件（または親のデータ）とが食い違う要求を行う THEN Authentication Serviceは対象のデータが存在しない場合と同じ404 Not Foundエラーを返し、対象のデータが実際に属する案件が利用者の閲覧範囲外である場合に限り受入基準7の記録を行わなければならない

**受入基準8を加え、受入基準7の読み方を明確にした（2026-10-29、利用者の判断「推奨案で進める」）**:

- 改訂前は、入れ子や二重マウントの経路（例: 案件の配下に置いた契約書・工程表の経路）で経路の案件と対象の実際の案件が食い違う要求を、各業務機能が対象の不在として扱い、閲覧範囲を判定せずに404を返していた。このため、対象の実際の案件が閲覧範囲外であっても受入基準7の記録が残らなかった。経路の案件に自分の閲覧範囲内の案件を置き、範囲外の案件のデータのIDを総当たりする探りは、応答では範囲外と不在を区別できない（受入基準2）一方で、記録にも検知（要件43.2）にも現れなかった
- 改訂後は、食い違いの要求も受入基準7の「閲覧範囲外の案件へのアクセスの拒否」に含めて読み、対象の実際の案件が範囲外のときに記録する。応答は従来どおり不在と同じ404であり、受入基準2の区別させない振る舞いは変えない
- 閲覧範囲内の案件どうしの食い違い（経路の誤り）は記録しない。範囲内のデータへのアクセスは拒否すべき越権ではなく、記録すると要件43.2の検知の件数を誤って押し上げるため
- 記録の対象は対象のデータが実際に属する案件とし、経路で指定した案件は判定しない（経路の案件のデータは応答に含まれず、食い違いの要求は経路の案件のデータへのアクセスではないため）
- 改めたのは食い違いの要求の記録の有無だけであり、受入基準1〜7の判定の規則・応答・記録の内容は改訂の対象外である
- 各業務機能の食い違いの扱いの切り替えは、それぞれの仕様が受け持つ（本要件の「既存要件との関係」のとおり）

**採らなかった案**: 食い違いを一律に記録する（範囲内の案件どうしの経路の誤りも記録する）——検知の誤報を増やすため採らない。食い違いの応答を範囲外のときだけ変える——受入基準2に反し、範囲外のデータの存在を推測させるため採らない。

---

### 要件40: 認証・アカウント操作とデータ出力の監査記録

**目的:** システム管理者として、ログイン・アカウント操作・データの持ち出しの履歴を確実に追跡したい。そうすることで、不正アクセスの兆候を発見し、事後に影響範囲を調査できるようになる。

**背景:** 同監査で、ログインの成功・失敗、ログアウト、招待の作成・取り消し、招待経由の登録、ユーザーの削除が監査ログに記録されていないことが判明した。また、ユーザーを削除するとそのユーザーが実行者である監査ログも連鎖して削除され、侵害されたアカウントの痕跡が消える状態であった。データの出力・一括ダウンロードも記録されていなかった。

**既存要件との関係:**
- 要件22（監査ログとコンプライアンス）の記録対象を拡張する。要件22.11のアクション種別の列挙に、本要件の記録対象を加える。
- 本要件はデータ出力を記録する共通の手段を定める。どの出力を記録するかは、出力機能を持つ各業務機能の仕様が受入基準として持つ。

#### 受入基準

##### 認証とアカウント操作の記録

1. WHEN ログインが成功する、またはパスワード誤りや存在しないメールアドレスによりログインが失敗する THEN Authentication Serviceは監査ログに結果、対象のメールアドレス、送信元IPアドレス、ユーザーエージェントを記録しなければならない
2. WHEN アカウントがログイン失敗または2FA検証失敗によりロックされる THEN Authentication Serviceは監査ログに記録しなければならない
3. WHEN 2FA検証（TOTPコードまたはバックアップコード）が成功または失敗する THEN Authentication Serviceは監査ログに記録しなければならない
4. WHEN ユーザーがログアウトする、または全デバイスからログアウトする THEN Authentication Serviceは監査ログに記録しなければならない
5. WHEN 招待が作成・取り消し・再送信される、または招待経由でアカウントが作成される THEN Authentication Serviceは監査ログに実行者と対象のメールアドレスを記録しなければならない
6. WHEN ユーザーが削除される THEN Authentication Serviceは削除の完了前に監査ログに実行者と削除対象を記録し、記録に失敗した場合は削除を中止しなければならない

##### 記録の保全

7. WHEN 監査ログの実行者または対象であるユーザーが削除される THEN Authentication Serviceはそのユーザーに関する監査ログを削除せず、実行者・対象を識別できる情報を保持しなければならない
8. IF 監査ログの更新または削除が要求される THEN Authentication Serviceは要求を拒否しなければならない（要件41のアーカイブによる移動を除く）

##### データ出力の記録

9. WHEN 業務機能がデータの出力または一括ダウンロードを記録する THEN Authentication Serviceは実行者、出力の種別、対象の案件・データ、件数、日時を監査ログに記録しなければならない
10. WHEN 出力がブラウザ上で生成される THEN Frontend Serviceは出力の開始時に受入基準9の記録を要求しなければならない
11. IF 受入基準10の記録の要求が失敗する THEN Frontend Serviceは出力を中止し、エラーメッセージを表示しなければならない

##### 記録の表示

12. WHEN 監査ログ画面に招待の操作（作成・取り消し・再送信）の記録を表示する THEN Frontend Serviceは対象の欄に招待先のメールアドレスを表示しなければならない

**受入基準12を加えた（2026-10-26、利用者の判断）**: 招待の操作の記録は対象として招待のIDを持ち、招待先のメールアドレスは記録の付帯情報にだけ持つ。監査ログ画面の対象の欄は招待のIDを表示しており、誰への招待かを画面で確かめられなかった。既に書かれた記録にも同じ表示を適用する（監査ログは改変できないため、記録の書き換えによらない）。

---

### 要件41: 監査ログの保持とアーカイブ

**目的:** システム管理者として、監査ログを決められた期間、改ざんされずに保持したい。そうすることで、長期の事後調査とコンプライアンス要件に対応できるようになる。

**背景:** 設計書「監査ログの保持期間・ローテーション戦略」は、アクティブログ1年、13か月以上前のログの月次アーカイブ、8年以上前のアーカイブの削除、アーカイブの暗号化を定めている。同監査で、アーカイブの処理がどこからも実行されておらず、暗号鍵が未設定の場合は起動のたびに異なる鍵が生成され、アーカイブを復号できなくなることが判明した。本要件は設計書の保持戦略を受入基準として明文化する。

**既存要件との関係:**
- 要件22（監査ログとコンプライアンス）の保持について定める。

#### 受入基準

1. WHEN 月次のアーカイブ処理が実行される THEN Authentication Serviceは作成から13か月以上経過した監査ログを暗号化してアーカイブへ移し、アクティブな監査ログから除かなければならない
2. WHEN アーカイブから8年以上経過する THEN Authentication Serviceはそのアーカイブを削除しなければならない
3. IF 本番環境でアーカイブの暗号鍵が設定されていない THEN Authentication Serviceは起動時にエラーで停止しなければならない
4. WHEN アーカイブを作成する THEN Authentication Serviceは件数と内容の改ざんを検知できる情報をアーカイブに付与しなければならない
5. WHEN システム管理者がアーカイブの復元を要求する THEN Authentication Serviceは指定期間の監査ログを読み取り可能な形式で返さなければならない
6. IF アーカイブ処理が失敗する THEN Authentication Serviceはアクティブな監査ログを削除せず、システム管理者へ通知しなければならない

---

### 要件42: 管理用エンドポイントとログ・エラー応答の機密保護

**目的:** システムとして、運用のための機能や記録・エラー応答から機密情報や攻撃の手がかりが漏れないようにしたい。そうすることで、ログや応答を入手した者による不正利用を防げるようになる。

**背景:** 同監査で、ログレベルを変更する管理用エンドポイントが認証なしで本番に公開されており、誰でも記録を止める・溢れさせることができると判明した（要件21.1違反）。また、URLのクエリに含まれるトークンがアクセスログに平文で残る、想定外のエラー時に要求本文（パスワードを含みうる）がエラー監視サービスへ送られる、要求識別子を利用者が指定できる、ログインの応答や失敗時の応答に内部の情報が含まれる、といった問題が見つかった。

**既存要件との関係:**
- 要件21.1（全APIエンドポイントでの権限検証）、要件26.11（ログのマスキング）、要件22.11（監査ログのメタデータのリクエストID）を補強する。

#### 受入基準

1. IF 認証されていない、またはシステム管理者権限を持たない利用者が運用設定（ログレベル等）を変更・参照しようとする THEN Backend Serviceは要求を拒否しなければならない
2. WHEN 運用設定が変更される THEN Backend Serviceは監査ログに実行者と変更前後の値を記録しなければならない
3. WHEN アクセスログを記録する THEN Backend ServiceはURLのクエリに含まれるトークン・パスワード等の機密値をマスクしなければならない
4. WHEN 想定外のエラーをエラー監視サービスへ送信する THEN Backend Serviceは要求本文、Cookie、認証ヘッダーの機密値を送信してはならない
5. WHEN 要求を受け付ける THEN Backend Serviceは要求識別子をサーバー側で生成し、利用者が指定した値をそのまま記録の要求識別子として用いてはならない
6. WHEN 認証済みの要求をアクセスログに記録する THEN Backend Serviceは利用者のIDを記録しなければならない
7. WHEN ログインが失敗する THEN Authentication Serviceは応答にユーザーIDを含めてはならない
8. IF 認証処理中にデータベースの障害が発生する THEN Authentication Serviceは障害の詳細を応答に含めず、汎用のエラーメッセージを返さなければならない
9. WHILE 実行環境の指定が無い THE Backend Serviceは開発用の機能（APIドキュメント画面、エラー応答へのスタックトレース付与）を無効にしなければならない

---

### 要件43: セキュリティ上の異常の検知と通知

**目的:** システム管理者として、攻撃や侵害の兆候を早期に知りたい。そうすることで、被害が広がる前に調査と対処を始められるようになる。

**背景:** IPA注意喚起はログの異常（エラー量の急増など）の確認を求めている。従来の通知はシステム管理者ロールの変更（要件22.9）に限られ、認証失敗や権限拒否、過剰な要求の急増を検知する仕組みが無かった。

**既存要件との関係:**
- 要件22.8（権限チェック失敗のセキュリティログ）と要件22.9（センシティブな操作のアラート通知）を拡張する。

#### 受入基準

1. IF ログイン失敗の件数が一定時間内に閾値を超える THEN Authentication Serviceは全てのシステム管理者へ通知しなければならない
2. IF 権限チェックの失敗（403）または閲覧範囲外へのアクセス（要件39.7）の件数が一定時間内に閾値を超える THEN Authentication Serviceは全てのシステム管理者へ通知しなければならない
3. IF 試行回数の制限による拒否（429）またはサーバーエラー（5xx）の件数が一定時間内に閾値を超える THEN Backend Serviceは全てのシステム管理者へ通知しなければならない
4. IF 同一ユーザーによるデータ出力（要件40.9）の件数が一定時間内に閾値を超える THEN Authentication Serviceは全てのシステム管理者へ通知しなければならない
5. WHEN 通知を送信する THEN Authentication Serviceは検知の種類、期間、件数、主な送信元・利用者を通知に含めなければならない
6. WHILE 同じ種類（受入基準4のデータ出力の急増では種類と利用者の組）の異常が継続している THE Authentication Serviceは同じ通知を一定時間内に重複して送信してはならない
7. WHEN 閾値と集計期間を定める THEN Backend Serviceは環境ごとに設定で変更できなければならない
8. WHEN 受入基準4のデータ出力の急増の通知の重複を抑止する THEN Authentication Serviceは種類と利用者の組ごとに抑止し、別の利用者の急増は抑止の時間内でも通知しなければならない
9. IF 一定時間内に送る異常の通知の総数が上限に達する THEN Authentication Serviceは上限を超えた通知を送らず、送らなかった通知の件数と期間を次に送る通知または要約で知らせなければならない

**受入基準6の抑止の単位を改め、受入基準8・9を加えた（2026-10-26、利用者の判断）**:

- 改訂前の受入基準6は抑止の単位を種類だけとしていた。データ出力の急増は利用者ごとに数える（受入基準4）が、抑止は利用者を問わず種類ごとに行われ、ある利用者の急増を通知した後の抑止の時間内に別の利用者の急増が起きても通知されなかった
- 抑止を種類と利用者の組に改めると、多数の利用者が同時に急増した場合に通知が殺到しうる。このため通知の総数に上限を設け、上限を超えた分は件数と期間をまとめて知らせる（受入基準9）。上限と時間窓は受入基準7と同じく設定で変更できる
- 改めたのは抑止の単位だけであり、データ出力以外の種類の抑止（種類ごと）と、抑止の時間内に重複を送らない振る舞いは改訂の対象外である

---

### 要件44: ブラウザ向けのセキュリティヘッダー

**目的:** システムとして、画面を配信する全ての応答に、ブラウザ側の攻撃を緩和するヘッダーを付けたい。そうすることで、XSSやクリックジャッキングによる情報漏洩を防げるようになる。

**背景:** 同監査で、画面の配信元に Content-Security-Policy・Strict-Transport-Security・Referrer-Policy が無く、静的ファイルの応答には既存のセキュリティヘッダーも付いていないこと、配信元のソフトウェアの版が応答に表示されることが判明した。要件26.10はAPIの応答について満たされていたが、画面の配信には適用されていなかった。

**既存要件との関係:**
- 要件26.10（セキュリティヘッダー）の適用範囲を画面の配信へ広げる。

#### 受入基準

1. WHEN 画面（HTML）または静的ファイルを配信する THEN Frontend Serviceはコンテンツの読み込み元を本システムと必要な外部サービスに限定するContent-Security-Policyヘッダーを付与しなければならない
2. WHEN 本番環境で画面または静的ファイルを配信する THEN Frontend ServiceはStrict-Transport-Security、X-Frame-Options、X-Content-Type-Options、Referrer-Policyの各ヘッダーを付与しなければならない
3. WHEN 応答を返す THEN Frontend Serviceは配信元のソフトウェアの版を応答に含めてはならない
4. WHEN Content-Security-Policyを定める THEN Frontend Serviceは本システムの全画面が正常に表示・操作できる範囲で定めなければならない

---

### 要件45: 通知メールの配信とキューの機密保持

**目的:** システム管理者として、招待・パスワードリセット・セキュリティ通知のメールが確実に配信され、配信後にメールの内容が残らないことを保証したい。そうすることで、通知の欠落を防ぎ、キューからのトークン漏洩を防げるようになる。

**背景:** 同監査で、メールの送信キューが認証付きのキャッシュ基盤への接続情報を用いておらず、本番で接続できない可能性があることが判明した。また、送信済み・失敗したメールのジョブが、宛先とトークンを含んだまま保持され続けていた。

**既存要件との関係:**
- 要件24.8（メール送信の非同期化）と要件22.9（管理者への通知）の前提となる配信経路を補強する。

#### 受入基準

1. WHEN メールの送信キューへ接続する THEN Authentication Serviceは本システムのキャッシュ基盤と同じ接続情報（認証情報を含む）を用いなければならない
2. WHEN メールの送信が完了する THEN Authentication Serviceは宛先とトークンを含むジョブの内容を削除しなければならない
3. IF メールの送信が再試行の上限まで失敗する THEN Authentication Serviceはトークンを含まない形で失敗を記録し、ジョブの内容を一定期間内に削除しなければならない
4. IF 本番環境でメールの送信キューへ接続できない THEN Authentication Serviceはエラー監視サービスへ通知しなければならない

---

## 依存仕様

本仕様で定義された認証・認可機能は、以下の仕様の基盤として機能します：

- **approval-workflow**: 決裁ワークフロー機能
  - 本仕様で定義されたRBACシステム（ロール、権限、ユーザー・ロール紐付け）を利用
  - 事前定義ロール（経営、営業、積算担当、購買担当、現場担当、経理担当）を活用して決裁ルートを構築
  - 決裁ワークフローに関する要件は別仕様（approval-workflow）で管理
