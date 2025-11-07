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

### 要件6: 拡張可能なロールベースアクセス制御（RBAC）

**目的:** システムとして、細粒度かつ拡張可能なロールベースアクセス制御を実装したい。そうすることで、組織の職務に応じた柔軟な権限管理と、管理機能への不正アクセス防止を両立できるようになる。

**RBACモデル:** NIST RBAC標準のCore RBAC + Hierarchical RBACに準拠し、Role（ロール）、Permission（権限）、User-Role紐付け、Role-Permission紐付けの4つのエンティティで構成する。

#### 受入基準

1. WHERE 保護されたAPIエンドポイントにアクセスする THE Authorization Serviceは必要な権限（Permission）を検証しなければならない
2. IF ユーザーが必要な権限を持たない THEN Authorization Serviceは403 Forbiddenエラーを返さなければならない
3. WHEN ユーザーアカウントが作成される THEN Authorization Serviceはデフォルトロール（例: 一般ユーザー）を割り当てなければならない
4. WHEN ユーザーに複数のロールが割り当てられている THEN Authorization Serviceは全てのロールの権限を統合して評価しなければならない
5. WHERE システム管理者が他のユーザーのロールを変更する THE Authorization Serviceはロール変更を監査ログに記録しなければならない
6. IF 最後のシステム管理者ロールを持つユーザーのロールを変更しようとする THEN Authorization Serviceは変更を拒否しなければならない
7. WHEN 権限チェックを実行する THEN Authorization Serviceはリソースタイプとアクションの組み合わせで判定しなければならない
8. WHERE リソースレベルの権限チェックを実行する THE Authorization Serviceは所有者情報を考慮しなければならない

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

## UI/UX要件

### 要件11: ログイン画面のUI/UX

**目的:** ユーザーとして、直感的で使いやすいログイン画面を利用したい。そうすることで、スムーズにシステムにアクセスできるようになる。

#### 受入基準

1. WHEN ログイン画面が表示される THEN UIはメールアドレス入力フィールド、パスワード入力フィールド、ログインボタンを表示しなければならない
2. WHERE パスワード入力フィールドがある THE UIはパスワードの表示/非表示切り替えボタンを提供しなければならない
3. WHEN ユーザーが入力フィールドにフォーカスする THEN UIは視覚的なフィードバック（アウトライン表示）を提供しなければならない
4. IF メールアドレス形式が無効である THEN UIはリアルタイムバリデーションエラーを表示しなければならない
5. WHEN ログインボタンがクリックされる AND フォームが未入力である THEN UIは必須フィールドエラーを表示しなければならない
6. WHILE ログインAPIリクエストが処理中である THE UIはローディングスピナーとボタンの無効化を表示しなければならない
7. IF ログインに失敗する THEN UIは汎用的なエラーメッセージ（「メールアドレスまたはパスワードが正しくありません」）を表示しなければならない
8. WHERE アカウントがロックされている THE UIはロック解除までの残り時間を表示しなければならない
9. WHEN ログイン画面が表示される THEN UIは「パスワードを忘れた場合」リンクを提供しなければならない
10. WHERE デバイス画面幅が768px未満である THE UIはモバイル最適化されたレイアウトを表示しなければならない
11. WHEN ログイン画面が読み込まれる THEN UIはメールアドレスフィールドに自動フォーカスしなければならない

### 要件12: ユーザー登録画面のUI/UX（招待リンク経由）

**目的:** 招待されたユーザーとして、わかりやすい登録画面でアカウントを作成したい。そうすることで、簡単にシステムを利用開始できるようになる。

#### 受入基準

1. WHEN 招待URLにアクセスする THEN UIは招待トークンを自動的に検証し、結果を表示しなければならない
2. IF 招待トークンが無効または期限切れである THEN UIはエラーメッセージと管理者への連絡手段を表示しなければならない
3. WHEN 有効な招待トークンが確認される THEN UIは招待者のメールアドレス（読み取り専用）、表示名入力フィールド、パスワード入力フィールド、パスワード確認フィールド、登録ボタンを表示しなければならない
4. WHERE パスワード入力フィールドに入力される THE UIはパスワード強度インジケーター（弱い/普通/強い）を表示しなければならない
5. WHEN パスワードが入力される THEN UIはパスワード要件（8文字以上、英数字、特殊文字）の達成状況をチェックリストで表示しなければならない
6. IF パスワードとパスワード確認が一致しない THEN UIはリアルタイムバリデーションエラーを表示しなければならない
7. WHEN 登録ボタンがクリックされる THEN UIは利用規約とプライバシーポリシーへの同意確認を要求しなければならない
8. WHILE 登録APIリクエストが処理中である THE UIはローディングスピナーとボタンの無効化を表示しなければならない
9. WHEN 登録が成功する THEN UIは成功メッセージを表示し、3秒後に自動的にダッシュボードへリダイレクトしなければならない
10. WHERE デバイス画面幅が768px未満である THE UIはモバイル最適化されたレイアウトを表示しなければならない

### 要件13: 管理者ユーザー招待画面のUI/UX

**目的:** 管理者として、効率的に新規ユーザーを招待し、招待状況を管理したい。そうすることで、チームメンバーの追加をスムーズに行えるようになる。

#### 受入基準

1. WHEN 招待画面が表示される THEN UIは招待フォーム（メールアドレス入力、招待ボタン）と招待一覧テーブルを表示しなければならない
2. WHERE 招待一覧テーブルがある THE UIは招待メールアドレス、招待日時、ステータス（未使用/使用済み/期限切れ）、有効期限、アクションボタン（取り消し/再送信）を表示しなければならない
3. WHEN 招待ボタンがクリックされる AND メールアドレスが有効である THEN UIは招待成功メッセージと招待URLのコピーボタンを表示しなければならない
4. IF 招待メールアドレスが既に登録済みである THEN UIはエラーメッセージ（「このメールアドレスは既に登録されています」）を表示しなければならない
5. WHEN 招待URLコピーボタンがクリックされる THEN UIはクリップボードにURLをコピーし、「コピーしました」というトーストメッセージを表示しなければならない
6. WHERE 招待ステータスが「未使用」である THE UIは「取り消し」ボタンを有効化しなければならない
7. WHERE 招待ステータスが「期限切れ」である THE UIは「再送信」ボタンを有効化しなければならない
8. WHEN 取り消しボタンがクリックされる THEN UIは確認ダイアログを表示しなければならない
9. WHERE 招待一覧が10件以上ある THE UIはページネーションまたは無限スクロールを提供しなければならない
10. WHEN 招待一覧が読み込まれる THEN UIは招待ステータスに応じた視覚的な区別（色、アイコン）を提供しなければならない
11. WHERE デバイス画面幅が768px未満である THE UIはテーブルをカード形式のレイアウトに変換しなければならない

### 要件14: プロフィール画面のUI/UX

**目的:** ユーザーとして、自分のプロフィール情報を確認・編集したい。そうすることで、アカウント情報を最新の状態に保てるようになる。

#### 受入基準

1. WHEN プロフィール画面が表示される THEN UIはユーザー情報セクション（メールアドレス、表示名、ロール、作成日時）とパスワード変更セクションを表示しなければならない
2. WHERE ユーザー情報セクションがある THE UIはメールアドレス（読み取り専用）、表示名（編集可能）、保存ボタンを表示しなければならない
3. WHEN 表示名が変更される THEN UIは保存ボタンを有効化しなければならない
4. WHEN 保存ボタンがクリックされる THEN UIは更新成功のトーストメッセージを表示しなければならない
5. WHERE パスワード変更セクションがある THE UIは現在のパスワード、新しいパスワード、パスワード確認の入力フィールドを表示しなければならない
6. WHEN 新しいパスワードが入力される THEN UIはパスワード強度インジケーターとパスワード要件チェックリストを表示しなければならない
7. WHEN パスワード変更ボタンがクリックされる THEN UIは確認ダイアログ（「全デバイスからログアウトされます」）を表示しなければならない
8. IF パスワード変更が成功する THEN UIは成功メッセージを表示し、5秒後にログイン画面へリダイレクトしなければならない
9. WHERE 管理者ユーザーがプロフィール画面にアクセスする THE UIは「ユーザー管理」リンクを表示しなければならない
10. WHERE デバイス画面幅が768px未満である THE UIはモバイル最適化されたレイアウトを表示しなければならない

### 要件15: 共通UI/UXガイドライン

**目的:** 全画面で一貫性のある、アクセシブルなユーザー体験を提供したい。そうすることで、ユーザビリティとアクセシビリティを向上できるようになる。

#### 受入基準

1. WHERE 全ての画面がある THE UIはレスポンシブデザイン（モバイル: 320px-767px、タブレット: 768px-1023px、デスクトップ: 1024px以上）を実装しなければならない
2. WHEN フォーム送信エラーが発生する THEN UIは最初のエラーフィールドにスクロールし、フォーカスしなければならない
3. WHERE 全てのボタンとリンクがある THE UIはキーボード操作（Tab、Enter、Space）をサポートしなければならない
4. WHEN ページが読み込まれる THEN UIは適切なaria-label、aria-describedby、role属性を提供しなければならない
5. WHERE カラー情報を使用する THE UIは色だけに依存せず、テキストやアイコンで補完しなければならない
6. WHEN フォームバリデーションエラーが発生する THEN UIはエラーメッセージをaria-liveリージョンで通知しなければならない
7. WHERE 全ての画面がある THE UIは最低コントラスト比4.5:1（WCAG 2.1 AA準拠）を維持しなければならない
8. WHEN APIリクエストが5秒以上かかる THEN UIはプログレスバーまたは進捗メッセージを表示しなければならない
9. IF APIリクエストがネットワークエラーで失敗する THEN UIは「ネットワーク接続を確認してください」というエラーメッセージとリトライボタンを表示しなければならない
10. WHERE トーストメッセージが表示される THE UIは3-5秒後に自動的に非表示にしなければならない
11. WHEN モーダルダイアログが開かれる THEN UIはフォーカストラップを実装し、Escキーで閉じられるようにしなければならない
12. WHERE 全ての入力フィールドがある THE UIは適切なautocomplete属性（email、current-password、new-password）を設定しなければならない
13. WHEN セッションが期限切れになる THEN UIは自動的にログイン画面へリダイレクトし、「セッションの有効期限が切れました。再度ログインしてください。」というメッセージを表示しなければならない（詳細は要件17を参照）

### 要件16: Storybookによるビジュアル要件管理

**目的:** 開発チームとステークホルダーとして、実装前にUIコンポーネントを視覚的に確認・検証したい。そうすることで、要件の認識齟齬を早期に発見し、効率的な開発を実現できるようになる。

#### 受入基準

1. WHERE 全ての認証画面コンポーネントがある THE Storybookは個別のストーリーを提供しなければならない
2. WHEN ログインフォームストーリーが表示される THEN Storybookは以下の状態バリアントを提供しなければならない
   - デフォルト状態（空のフォーム）
   - 入力中状態（フォーカス、入力値あり）
   - バリデーションエラー状態（メール形式エラー、必須フィールドエラー）
   - ローディング状態（ログイン処理中）
   - 認証エラー状態（ログイン失敗）
   - アカウントロック状態（ロック解除までの時間表示）
3. WHEN ユーザー登録フォームストーリーが表示される THEN Storybookは以下の状態バリアントを提供しなければならない
   - 招待トークン検証中
   - 招待トークン有効（フォーム表示）
   - 招待トークン無効/期限切れ
   - パスワード強度表示（弱い/普通/強い）
   - パスワード要件チェックリスト
   - バリデーションエラー状態
   - 登録処理中
   - 登録成功
4. WHEN 管理者招待画面ストーリーが表示される THEN Storybookは以下の状態バリアントを提供しなければならない
   - 招待一覧（0件、1-9件、10件以上）
   - 招待ステータス別表示（未使用、使用済み、期限切れ）
   - 招待成功モーダル（URLコピー機能付き）
   - 招待エラー状態
   - 取り消し確認ダイアログ
5. WHEN プロフィール画面ストーリーが表示される THEN Storybookは以下の状態バリアントを提供しなければならない
   - 一般ユーザー表示
   - 管理者ユーザー表示
   - 編集モード
   - パスワード変更モード
   - 更新処理中
6. WHERE 全てのストーリーがある THE Storybookはインタラクティブコントロール（Controls addon）を提供しなければならない
7. WHEN Storybookコントロールが提供される THEN 以下のプロパティを調整可能にしなければならない
   - テキスト入力値
   - ローディング状態（true/false）
   - エラーメッセージ
   - ユーザーロール（admin/user）
   - ブレークポイント（モバイル/タブレット/デスクトップ）
8. WHERE 全てのストーリーがある THE Storybookはアクセシビリティアドオン（a11y addon）を有効化しなければならない
9. WHEN a11yアドオンが実行される THEN 以下の項目を自動検証しなければならない
   - コントラスト比（最低4.5:1）
   - ARIA属性の適切性
   - キーボードナビゲーション
   - フォーカス管理
   - セマンティックHTML
10. WHERE Storybookドキュメントがある THE 各ストーリーは対応する要件番号と受入基準を明記しなければならない
11. WHEN ストーリーがレンダリングされる THEN レスポンシブデザインを検証するためのビューポートアドオンを提供しなければならない
12. WHERE ビューポートアドオンがある THE 以下のプリセットを提供しなければならない
    - モバイル（375px）
    - タブレット（768px）
    - デスクトップ（1280px）
13. WHEN コンポーネントの視覚的な変更が発生する THEN Storybookはビジュアルリグレッションテスト用のスナップショットを生成できなければならない
14. WHERE 全てのフォームコンポーネントがある THE Storybookはユーザーインタラクションをシミュレートする「Play function」を提供しなければならない
15. WHEN Play functionが実行される THEN 以下のユーザーアクションをシミュレートしなければならない
    - フォーム入力
    - バリデーショントリガー
    - ボタンクリック
    - キーボード操作（Tab、Enter、Escape）

#### ストーリー構成例

各画面コンポーネントは以下の構造でストーリーを定義します：

**ログインフォーム (`LoginForm.stories.tsx`)**
- Default - デフォルト状態
- Filled - 入力済み状態
- ValidationError - バリデーションエラー
- Loading - ローディング中
- AuthenticationError - 認証エラー
- AccountLocked - アカウントロック

**ユーザー登録フォーム (`SignupForm.stories.tsx`)**
- ValidatingToken - トークン検証中
- ValidToken - 有効なトークン
- InvalidToken - 無効なトークン
- ExpiredToken - 期限切れトークン
- WeakPassword - 弱いパスワード
- StrongPassword - 強いパスワード
- ValidationError - バリデーションエラー
- Submitting - 送信中
- Success - 登録成功

**管理者招待画面 (`InvitationManager.stories.tsx`)**
- EmptyList - 招待なし
- WithInvitations - 招待あり
- PendingInvitations - 未使用の招待
- UsedInvitations - 使用済みの招待
- ExpiredInvitations - 期限切れの招待
- SuccessModal - 招待成功モーダル
- CancelDialog - 取り消し確認ダイアログ

**プロフィール画面 (`ProfilePage.stories.tsx`)**
- UserProfile - 一般ユーザー
- AdminProfile - 管理者
- EditMode - 編集モード
- PasswordChangeMode - パスワード変更モード
- Updating - 更新中

#### ベストプラクティス

1. **Component Story Format (CSF) 3.0** を使用して、TypeScriptで型安全なストーリーを定義
2. **Storybook Docs** を活用して、要件定義とストーリーを自動的にドキュメント化
3. **Interaction Testing** により、ユーザーインタラクションを自動テスト
4. **Visual Regression Testing** により、意図しないビジュアル変更を検出
5. **Accessibility Testing** により、WCAG 2.1 AA準拠を自動検証

### 要件17: セッション有効期限切れ時の自動リダイレクト

**目的:** システム全体として、セッション有効期限切れを統一的に処理したい。そうすることで、ユーザーはスムーズに再ログインでき、セキュリティとユーザー体験を両立できるようになる。

#### 受入基準

1. WHEN アクセストークンの有効期限が切れる AND ユーザーが保護されたAPIを呼び出す THEN Backend Serviceは401 Unauthorizedレスポンスを返さなければならない
2. WHERE Backend Serviceが401レスポンスを返す THE レスポンスボディに統一的なエラーコード（"TOKEN_EXPIRED"）を含めなければならない
3. WHEN Frontend Serviceがバックエンドから401レスポンスを受信する THEN HTTPインターセプターで自動的に検知しなければならない
4. IF 401エラーの原因がアクセストークン有効期限切れである THEN Frontend Serviceはリフレッシュトークンを使用して自動トークンリフレッシュを試みなければならない
5. IF トークンリフレッシュが成功する THEN Frontend Serviceは元のAPIリクエストを自動的に再実行しなければならない
6. IF トークンリフレッシュが失敗する OR リフレッシュトークンが存在しない THEN Frontend Serviceはユーザーをログイン画面へリダイレクトしなければならない
7. WHEN ログイン画面へリダイレクトされる THEN Frontend Serviceは現在のページURLをクエリパラメータ（redirectUrl）として保存しなければならない
8. WHEN ログイン画面が表示される AND redirectUrlが存在する THEN UIは「セッションの有効期限が切れました。再度ログインしてください。」というメッセージを表示しなければならない
9. WHEN ユーザーが再ログインに成功する AND redirectUrlが存在する THEN Frontend Serviceは保存されたURLへユーザーを自動的にリダイレクトしなければならない
10. WHERE HTTPインターセプターが401エラーを処理する THE Frontend Serviceは複数の同時401エラーに対してリフレッシュ処理を1回のみ実行しなければならない
11. WHEN リフレッシュトークンリクエストが処理中である THEN Frontend Serviceは他のAPIリクエストをキューに保持しなければならない
12. WHEN トークンリフレッシュが完了する THEN Frontend Serviceはキューに保持された全てのリクエストを新しいトークンで再実行しなければならない
13. IF ユーザーが明示的にログアウトする THEN Frontend ServiceはredirectUrlパラメータを設定せずにログイン画面へリダイレクトしなければならない
14. WHERE セッション有効期限切れメッセージが表示される THE メッセージはアクセシビリティ（aria-live="polite"）をサポートしなければならない
15. WHEN アクセストークンが5分以内に有効期限切れになる THEN Frontend Serviceはバックグラウンドで自動的にトークンをリフレッシュしなければならない
16. IF バックグラウンドリフレッシュが失敗する THEN Frontend Serviceは次のAPIリクエスト時に401エラーハンドリングフローを実行しなければならない
17. WHERE Backend Serviceが401レスポンスを返す THE レスポンスヘッダーにWWW-Authenticate: Bearer realm="ArchiTrack", error="invalid_token"を含めなければならない
18. WHEN HTTPインターセプターが401エラーを検知する THEN Frontend Serviceはローカルストレージまたはクッキーから認証トークンを削除しなければならない
19. IF ログイン画面以外の公開ページで401エラーが発生する THEN Frontend Serviceはエラーをサイレントに処理し、ユーザーをリダイレクトしてはならない
20. WHERE 開発環境である THE Frontend Serviceはトークン有効期限切れをコンソールにログ出力しなければならない

#### 技術的考慮事項

- **RFC 6750準拠**: Bearer Token仕様に従い、WWW-Authenticateヘッダーを使用
- **トークンリフレッシュ戦略**: プロアクティブ（5分前）＋リアクティブ（401エラー時）のハイブリッド方式
- **同時リクエスト対策**: トークンリフレッシュ中の重複リクエストをキューイング
- **セキュリティ**: リフレッシュトークンはHttpOnly Cookieで保存（XSS攻撃対策）
- **ユーザー体験**: 元のページへの自動復帰により、シームレスな再認証を実現
- **エラー分類**: 401エラーの原因を細分化（TOKEN_EXPIRED、TOKEN_INVALID、TOKEN_MISSING）

### 要件18: 動的ロール管理

**目的:** システム管理者として、組織の職務構造に合わせてロールを柔軟に作成・管理したい。そうすることで、現場の実態に即した権限管理を実現できるようになる。

#### 受入基準

1. WHEN システム管理者が新しいロールを作成する THEN Authorization Serviceはロール名、説明、優先順位を保存しなければならない
2. IF ロール名が既に存在する THEN Authorization Serviceは409 Conflictエラーを返さなければならない
3. WHEN システム管理者がロール情報を更新する THEN Authorization Serviceは変更履歴を監査ログに記録しなければならない
4. WHERE システム管理者がロール一覧を取得する THE Authorization Serviceは全てのロール（名前、説明、割り当てユーザー数、権限数）を返さなければならない
5. WHEN システム管理者がロールを削除する AND ロールが少なくとも1人のユーザーに割り当てられている THEN Authorization Serviceは削除を拒否しなければならない
6. IF システム管理者が事前定義ロール（システム管理者）を削除しようとする THEN Authorization Serviceは削除を拒否しなければならない
7. WHEN ロールを作成する THEN Authorization Serviceは一意のロールIDを生成しなければならない
8. WHERE ロール優先順位を設定する THE Authorization Serviceは整数値（高い値が高優先度）を受け入れなければならない
9. WHEN 新しいロールを作成する THEN Authorization Serviceはデフォルトで空の権限セットを割り当てなければならない

#### 事前定義ロール

以下のロールはシステムインストール時に自動作成されます：

- **システム管理者（System Administrator）**: 全ての権限を持つ最高権限ロール、削除不可
- **経営（Executive）**: 最終承認権限、全ADRの閲覧・エクスポート、経営ダッシュボードへのアクセス
- **営業（Sales）**: 見積もりADRの作成・編集、顧客情報管理、売上レポート閲覧
- **積算担当（Cost Estimator）**: ADRの作成・編集・閲覧、見積もり関連機能へのアクセス、積算ワークフロー承認
- **購買担当（Procurement）**: 購買関連ADRの閲覧・作成、ベンダー情報の管理、購買承認権限
- **現場担当（Site Manager）**: 現場関連ADRの閲覧・更新、現場データの管理、進捗報告
- **経理担当（Accounting）**: 全ADRの閲覧（編集不可）、経理レポートの生成・エクスポート、支払い承認権限
- **一般ユーザー（General User）**: 自分が作成したADRの閲覧・編集のみ

### 要件19: 権限（Permission）管理

**目的:** システム管理者として、細粒度な権限を定義し、リソースとアクションの組み合わせで制御したい。そうすることで、最小権限の原則に基づいた安全なアクセス制御を実現できるようになる。

#### 受入基準

1. WHEN システムが初期化される THEN Authorization Serviceは事前定義権限を自動作成しなければならない
2. WHERE 権限を定義する THE Authorization Serviceは `resource:action` 形式（例: `adr:read`, `user:delete`）を使用しなければならない
3. WHEN システム管理者が権限一覧を取得する THEN Authorization Serviceは全ての権限（リソースタイプ、アクション、説明）を返さなければならない
4. WHERE 権限チェックを実行する THE Authorization Serviceはワイルドカード権限（例: `adr:*`, `*:read`）をサポートしなければならない
5. IF ユーザーが `*:*` 権限を持つ THEN Authorization Serviceは全てのリソースへの全てのアクションを許可しなければならない
6. WHEN 権限を評価する THEN Authorization Serviceは最も具体的な権限を優先しなければならない
7. WHERE システム管理者がカスタム権限を作成する THE Authorization Serviceは権限の名前、リソースタイプ、アクション、説明を保存しなければならない

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

### 要件20: ロールへの権限割り当て

**目的:** システム管理者として、ロールに権限を割り当てたい。そうすることで、職務に応じた適切なアクセス権限を定義できるようになる。

#### 受入基準

1. WHEN システム管理者がロールに権限を追加する THEN Authorization Serviceはロール・権限の紐付けを保存しなければならない
2. IF 権限が既にロールに割り当てられている THEN Authorization Serviceは重複を無視しなければならない
3. WHEN システム管理者がロールから権限を削除する THEN Authorization Serviceは紐付けを削除しなければならない
4. WHERE システム管理者がロールの権限一覧を取得する THE Authorization Serviceは全ての割り当てられた権限を返さなければならない
5. WHEN ロールの権限を変更する THEN Authorization Serviceは変更履歴を監査ログに記録しなければならない
6. IF システム管理者ロールから `*:*` 権限を削除しようとする THEN Authorization Serviceは削除を拒否しなければならない
7. WHEN 複数の権限を一括で割り当てる THEN Authorization Serviceはトランザクション内で処理しなければならない
8. WHERE ロールに権限を割り当てる THE Authorization Serviceは権限の存在を事前に検証しなければならない

#### 事前定義ロールの権限セット

**システム管理者:**
- `*:*` - 全ての権限

**経営:**
- `adr:read` - 全ADRの閲覧
- `adr:approve` - 最終承認権限（金額制限なし）
- `adr:delegate` - 承認権限の委譲
- `report:read`, `report:export` - 経営レポートの閲覧・エクスポート
- `settings:read` - システム設定の閲覧

**営業:**
- `adr:create`, `adr:read`, `adr:update` - 見積もりADRの作成・編集・閲覧
- `project:create`, `project:read`, `project:update` - 顧客プロジェクト管理
- `report:read` - 売上レポート閲覧

**積算担当:**
- `adr:create`, `adr:read`, `adr:update` - ADRの作成・編集・閲覧
- `adr:approve` - 積算承認権限（金額制限あり、例: 500万円以下）
- `project:read` - プロジェクト情報閲覧
- `report:read`, `report:export` - 積算レポートの閲覧・エクスポート

**購買担当:**
- `adr:create`, `adr:read`, `adr:update` - 購買ADRの作成・編集・閲覧
- `adr:approve` - 購買承認権限（金額制限あり、例: 300万円以下）
- `project:read` - プロジェクト情報閲覧

**現場担当:**
- `adr:read`, `adr:update` - 現場ADRの閲覧・更新（自分が担当するプロジェクトのみ）
- `project:read`, `project:update` - プロジェクト進捗管理

**経理担当:**
- `adr:read` - 全ADRの閲覧（編集不可）
- `adr:approve` - 支払い承認権限（金額制限あり）
- `report:read`, `report:export` - 経理レポートの生成・エクスポート

**一般ユーザー:**
- `adr:read` - 自分が作成したADRの閲覧
- `adr:create`, `adr:update` - 自分が作成したADRの作成・編集

### 要件21: ユーザーへのロール割り当て（マルチロール対応）

**目的:** システム管理者として、ユーザーに複数のロールを割り当てたい。そうすることで、兼務や職務変更に柔軟に対応できるようになる。

#### 受入基準

1. WHEN システム管理者がユーザーにロールを追加する THEN Authorization Serviceはユーザー・ロールの紐付けを保存しなければならない
2. IF ロールが既にユーザーに割り当てられている THEN Authorization Serviceは重複を無視しなければならない
3. WHEN システム管理者がユーザーからロールを削除する THEN Authorization Serviceは紐付けを削除しなければならない
4. WHERE ユーザーが複数のロールを持つ THE Authorization Serviceは全てのロールの権限を統合（OR演算）しなければならない
5. WHEN ユーザーのロールを変更する THEN Authorization Serviceは変更履歴を監査ログに記録しなければならない
6. IF ユーザーが最後のシステム管理者ロール保持者である AND システム管理者ロールを削除しようとする THEN Authorization Serviceは削除を拒否しなければならない
7. WHEN ユーザーに新しいロールが割り当てられる THEN Authorization Serviceは次回トークンリフレッシュ時に新しい権限を反映しなければならない
8. WHERE システム管理者がユーザーのロール一覧を取得する THE Authorization Serviceは全ての割り当てられたロール（名前、割り当て日時）を返さなければならない
9. WHEN 複数のロールを一括で割り当てる THEN Authorization Serviceはトランザクション内で処理しなければならない

### 要件22: 権限チェック機能

**目的:** システムとして、リソースとアクションに基づいて権限を検証したい。そうすることで、細粒度なアクセス制御を実現できるようになる。

#### 受入基準

1. WHEN APIエンドポイントにアクセスする THEN Authorization Middlewareは必要な権限を検証しなければならない
2. IF ユーザーが必要な権限を持たない THEN Authorization Middlewareは403 Forbiddenエラーを返さなければならない
3. WHERE 権限チェックを実行する THE Authorization Serviceはユーザーの全てのロールから権限を収集しなければならない
4. WHEN ワイルドカード権限（`*:read`, `adr:*`）が存在する THEN Authorization Serviceは該当する全てのリソース・アクションにマッチさせなければならない
5. IF ユーザーが `*:*` 権限を持つ THEN Authorization Serviceは全ての権限チェックを通過させなければならない
6. WHERE リソースレベルの権限チェックを実行する THE Authorization Serviceは所有者フィルタリングを適用しなければならない
7. WHEN 権限チェックに失敗する THEN Authorization Serviceは失敗理由（必要な権限、ユーザーの権限）を監査ログに記録しなければならない
8. IF ユーザーのロールまたは権限が変更される THEN Authorization Serviceはキャッシュされた権限情報を無効化しなければならない
9. WHERE パフォーマンス最適化が必要な場合 THE Authorization Serviceは権限情報をRedisにキャッシュ（TTL: 5分）しなければならない

#### 権限チェックAPI

```typescript
// 疑似コード例
interface PermissionCheck {
  userId: string;
  resource: string;  // 例: "adr", "user"
  action: string;    // 例: "read", "update"
  resourceId?: string; // リソースレベルチェック用（オプション）
}

function hasPermission(check: PermissionCheck): boolean;
```

### 要件23: 監査ログとコンプライアンス

**目的:** システム管理者として、権限変更の履歴を追跡したい。そうすることで、セキュリティ監査とコンプライアンス要件を満たせるようになる。

#### 受入基準

1. WHEN ロールが作成・更新・削除される THEN Authorization Serviceは監査ログに記録しなければならない
2. WHEN 権限がロールに追加・削除される THEN Authorization Serviceは監査ログに記録しなければならない
3. WHEN ユーザーにロールが割り当て・削除される THEN Authorization Serviceは監査ログに記録しなければならない
4. WHERE 監査ログを記録する THE Authorization Serviceは実行者、対象、アクション、タイムスタンプを含めなければならない
5. WHEN システム管理者が監査ログを取得する THEN Authorization Serviceはフィルタリング（ユーザー、日付範囲、アクションタイプ）をサポートしなければならない
6. IF 監査ログの保存に失敗する THEN Authorization Serviceは操作を中断しなければならない
7. WHERE 監査ログを保存する THE Authorization Serviceは変更前後の値を含めなければならない
8. WHEN 権限チェックに失敗する THEN Authorization Serviceは失敗をセキュリティログに記録しなければならない
9. IF センシティブな操作（システム管理者ロールの変更）が実行される THEN Authorization Serviceはアラート通知を送信しなければならない
10. WHERE 監査ログをエクスポートする THE Authorization ServiceはJSON形式でダウンロード可能にしなければならない

#### 監査ログの構造

```json
{
  "id": "uuid",
  "timestamp": "ISO 8601",
  "actor": {
    "userId": "uuid",
    "email": "admin@example.com",
    "role": "システム管理者"
  },
  "action": "ROLE_CREATED | ROLE_UPDATED | ROLE_DELETED | PERMISSION_ASSIGNED | PERMISSION_REVOKED | USER_ROLE_ASSIGNED | USER_ROLE_REVOKED | PERMISSION_CHECK_FAILED",
  "target": {
    "type": "role | permission | user",
    "id": "uuid",
    "name": "積算担当"
  },
  "changes": {
    "before": { ... },
    "after": { ... }
  },
  "metadata": {
    "ipAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "requestId": "uuid"
  }
}
```

### 要件24: 決裁ワークフロー設計

**目的:** システムとして、業務別の決裁ワークフローを実装したい。そうすることで、組織の承認プロセスを効率化し、適切な意思決定階層を維持できるようになる。

#### 受入基準

1. WHEN システムが初期化される THEN Workflow Serviceは事前定義の決裁ルート（見積もり、購買、支払い）を自動作成しなければならない
2. WHERE 決裁ワークフローを定義する THE Workflow Serviceはワークフロータイプ、承認ステップ、金額閾値を保存しなければならない
3. WHEN 承認ステップを定義する THEN Workflow Serviceは必要なロール、承認順序、並列/直列の区別を含めなければならない
4. IF 金額が閾値を超える THEN Workflow Serviceは自動的に上位承認者（経営層）を追加しなければならない
5. WHERE ワークフローを実行する THE Workflow Serviceは現在のステップ、承認状態、次の承認者を追跡しなければならない
6. WHEN 全ての承認ステップが完了する THEN Workflow Serviceはワークフローを「承認済み」としてマークしなければならない
7. IF 任意のステップで差し戻しが発生する THEN Workflow Serviceはワークフローを「差し戻し」状態にし、起案者に通知しなければならない
8. WHERE 並列承認ステップがある THE Workflow Serviceは全ての並列承認者の承認を待たなければならない
9. WHEN ワークフローが開始される THEN Workflow Serviceは全承認者に通知を送信しなければならない
10. IF 承認が一定期間（例: 3日）行われない THEN Workflow Serviceはリマインダー通知を送信しなければならない

#### 決裁ワークフローの種類

**見積もりワークフロー:**
- **500万円未満**: 営業 → 積算担当
- **500万円以上1,000万円未満**: 営業 → 積算担当 → 購買担当
- **1,000万円以上**: 営業 → 積算担当 → 購買担当 → 経営

**購買ワークフロー:**
- **300万円未満**: 購買担当
- **300万円以上500万円未満**: 購買担当 → 積算担当
- **500万円以上**: 購買担当 → 積算担当 → 経営

**支払いワークフロー:**
- **100万円未満**: 経理担当
- **100万円以上500万円未満**: 経理担当 → 積算担当
- **500万円以上**: 経理担当 → 積算担当 → 経営

**現場変更承認ワークフロー:**
- **軽微な変更（予算影響なし）**: 現場担当
- **中程度の変更（予算影響あり）**: 現場担当 → 積算担当
- **重大な変更（予算10%以上）**: 現場担当 → 積算担当 → 経営

### 要件25: 決裁承認機能

**目的:** 承認者として、決裁ワークフローを承認・差し戻ししたい。そうすることで、組織のガバナンスを維持できるようになる。

#### 受入基準

1. WHEN 承認者がワークフローを承認する THEN Workflow Serviceは承認を記録し、次のステップに進めなければならない
2. IF 承認者が現在のステップの承認権限を持たない THEN Workflow Serviceは403 Forbiddenエラーを返さなければならない
3. WHEN 承認者がワークフローを差し戻す THEN Workflow Serviceは差し戻し理由を記録し、起案者に通知しなければならない
4. WHERE 承認者が代理承認権限を持つ THE Workflow Serviceは他の承認者の代わりに承認できなければならない
5. WHEN 承認が記録される THEN Workflow Serviceは承認者、承認日時、コメントを保存しなければならない
6. IF ワークフローが既に承認済みまたは差し戻し済みである THEN Workflow Serviceは重複承認を拒否しなければならない
7. WHERE 並列承認ステップがある THE Workflow Serviceは各承認者が独立して承認できなければならない
8. WHEN 承認者がコメントを追加する THEN Workflow Serviceはコメントを承認履歴に記録しなければならない
9. IF 承認者が不在である AND 代理承認者が設定されている THEN Workflow Serviceは代理承認者に通知しなければならない
10. WHERE 経営層の承認が必要な場合 THE Workflow Serviceは金額情報、リスク評価、関連ドキュメントを承認画面に表示しなければならない

#### 承認履歴の構造

```json
{
  "workflowId": "uuid",
  "workflowType": "見積もり | 購買 | 支払い | 現場変更",
  "currentStep": 2,
  "totalSteps": 3,
  "status": "進行中 | 承認済み | 差し戻し | キャンセル",
  "approvalHistory": [
    {
      "stepNumber": 1,
      "approver": {
        "userId": "uuid",
        "name": "山田太郎",
        "role": "営業"
      },
      "action": "承認 | 差し戻し",
      "timestamp": "ISO 8601",
      "comment": "承認します。見積もり内容を確認しました。",
      "delegatedBy": null
    },
    {
      "stepNumber": 2,
      "approver": {
        "userId": "uuid",
        "name": "佐藤花子",
        "role": "積算担当"
      },
      "action": "承認",
      "timestamp": "ISO 8601",
      "comment": "原価計算を確認しました。問題ありません。",
      "delegatedBy": null
    }
  ],
  "nextApprovers": [
    {
      "userId": "uuid",
      "name": "鈴木一郎",
      "role": "経営"
    }
  ]
}
```

### 要件26: 業務別決裁ルートの最適化

**目的:** システム管理者として、業務実態に合わせて決裁ルートを最適化したい。そうすることで、効率的かつ適切なガバナンスを実現できるようになる。

#### 受入基準

1. WHEN システム管理者がカスタム決裁ルートを作成する THEN Workflow Serviceはルート名、適用条件（ワークフロータイプ、金額範囲）、承認ステップを保存しなければならない
2. IF カスタムルートが事前定義ルートと競合する THEN Workflow Serviceはカスタムルートを優先しなければならない
3. WHERE 決裁ルートを評価する THE Workflow Serviceは最も具体的な条件にマッチするルートを選択しなければならない
4. WHEN 決裁ルートを更新する THEN Workflow Serviceは既存の進行中ワークフローには影響を与えてはならない
5. IF システム管理者が決裁ルートを削除する AND ルートが進行中のワークフローで使用されている THEN Workflow Serviceは削除を拒否しなければならない
6. WHERE システム管理者が決裁ルート一覧を取得する THE Workflow Serviceは全てのルート（事前定義、カスタム）を返さなければならない
7. WHEN 決裁ルートを作成する THEN Workflow Serviceは承認ステップの循環参照をチェックしなければならない
8. IF 承認ステップに無効なロールが含まれる THEN Workflow Serviceはバリデーションエラーを返さなければならない

#### 業務別ベストプラクティス

**経営:**
- 最終意思決定者として、高額案件（1,000万円以上）の最終承認を担当
- 全ADRへのアクセス権限により、組織全体の状況を把握
- 承認権限の委譲により、不在時も業務継続を保証

**営業:**
- 顧客との接点として、見積もりADRを起案
- 見積もりワークフローの最初の承認者として、顧客要件の妥当性をチェック
- 売上レポート閲覧により、営業実績を追跡

**積算担当:**
- 原価計算の専門家として、見積もりの技術的妥当性を承認
- 中程度の金額（500万円以下）の見積もりを最終承認
- 購買担当と連携し、資材コストを最適化

**購買担当:**
- ベンダー管理の専門家として、購買ADRを起案・承認
- 中程度の金額（300万円以下）の購買を単独で承認
- 積算担当と連携し、資材調達計画を策定

**現場担当:**
- 現場の実態を反映し、進捗報告と変更承認を担当
- リソースレベルの権限チェックにより、自分が担当するプロジェクトのみアクセス
- 軽微な変更（予算影響なし）を単独で承認

**経理担当:**
- 財務管理の専門家として、全ADRの閲覧と支払い承認を担当
- 中程度の金額（100万円以下）の支払いを単独で承認
- 経理レポートのエクスポートにより、外部監査に対応

#### マルチロール対応のベストプラクティス

1. **兼務の例**: 小規模組織では、積算担当と購買担当を兼務するケースがある。マルチロール対応により、両方の権限を一人のユーザーに割り当て可能。
2. **職務変更**: 営業から積算担当への異動時、段階的にロールを追加・削除することで、スムーズな引き継ぎを実現。
3. **代理承認**: 経営層が不在時、積算担当に一時的に経営ロールを追加し、高額案件の承認を継続。
4. **権限の統合**: 複数のロールを持つユーザーは、全てのロールの権限をOR演算で統合。例: 営業 + 積算担当 = 見積もり起案 + 見積もり承認。
