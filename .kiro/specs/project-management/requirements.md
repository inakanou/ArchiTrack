# Requirements Document

## Introduction

本ドキュメントは、ArchiTrackシステムにおけるプロジェクト機能の要件を定義します。プロジェクトとは、工事の案件が発生した際に最初に作成されるエンティティであり、当該工事における現場調査や見積などの業務は、プロジェクト配下にぶら下がる形で管理されます。

プロジェクト機能は、以下の2つの画面で構成されます：
- **プロジェクト一覧画面**: 全プロジェクトの閲覧・検索・フィルタリング
- **プロジェクト詳細画面**: 個別プロジェクトの詳細情報表示・編集・関連データの管理

### 既存機能との連携

本機能は、ArchiTrackの既存機能を活用します：
- **認証・認可基盤**: 認証済みユーザーのみがアクセス可能
- **監査ログ機能**: プロジェクト操作を記録
- **ユーザー管理機能**: 担当者選択時にユーザー情報を参照
- **共通UIコンポーネント**: 既存のナビゲーション、レイアウト、通知機能を使用

### 依存する機能

本機能は、以下の機能に依存します：
- **取引先管理機能**: 顧客名選択時に取引先マスタを参照

### Data Entities（概要）

- **プロジェクト**: 工事案件の基本情報（名称、顧客、担当者、現場住所、ステータス等）
- **ステータス変更履歴**: プロジェクトの状態遷移の記録（変更前後のステータス、変更日時、変更者、遷移種別、差し戻し理由）

## Requirements

### Requirement 1: プロジェクト作成

**Objective:** As a ユーザー, I want 新規プロジェクトを作成する, so that 工事案件の管理を開始できる

#### Acceptance Criteria

1. When ユーザーがプロジェクト一覧画面で「新規作成」ボタンをクリックする, the ArchiTrackシステム shall プロジェクト作成フォームを表示する
2. The ArchiTrackシステム shall プロジェクト作成フォームに以下の入力フィールドを表示する: プロジェクト名（必須）、顧客名（任意）、営業担当者（必須）、工事担当者（任意）、現場住所（任意）、概要（任意）
3. When ユーザーが顧客名フィールドで検索テキストを入力する, the ArchiTrackシステム shall 取引先管理機能で登録された取引先を検索フィルタリングして表示する
4. When ユーザーがドロップダウンまたはオートコンプリート候補から顧客を選択する, the ArchiTrackシステム shall 選択された取引先IDをフォームに設定する
5. The ArchiTrackシステム shall 営業担当者フィールドのデフォルト値としてログインユーザーの表示名を設定する
6. The ArchiTrackシステム shall 工事担当者フィールドのデフォルト値としてログインユーザーの表示名を設定する
7. When ユーザーが必須項目（プロジェクト名、営業担当者）を入力して「作成」ボタンをクリックする, the ArchiTrackシステム shall 新規プロジェクトをデータベースに保存する
8. When プロジェクトが正常に保存される, the ArchiTrackシステム shall プロジェクト詳細画面に遷移する
9. If ユーザーが必須項目を入力せずに「作成」ボタンをクリックする, then the ArchiTrackシステム shall 入力エラーメッセージを該当フィールドに表示する
10. If プロジェクト名が未入力の場合, then the ArchiTrackシステム shall 「プロジェクト名は必須です」というバリデーションエラーを表示する
11. If プロジェクト名が255文字を超える場合, then the ArchiTrackシステム shall 「プロジェクト名は255文字以内で入力してください」というバリデーションエラーを表示する
12. If 営業担当者が未選択の場合, then the ArchiTrackシステム shall 「営業担当者は必須です」というバリデーションエラーを表示する
13. When プロジェクトが正常に作成される, the ArchiTrackシステム shall 作成日時と作成者を自動的に記録する
14. The ArchiTrackシステム shall プロジェクトに一意のIDを自動付与する
15. If 既に同じプロジェクト名が登録されている場合, then the ArchiTrackシステム shall 「このプロジェクト名は既に使用されています」というバリデーションエラーを表示する
16. The ArchiTrackシステム shall プロジェクト名の一意性チェックを作成時に実行する

### Requirement 2: プロジェクト一覧表示

**Objective:** As a ユーザー, I want プロジェクト一覧を閲覧する, so that 管理しているプロジェクトの全体像を把握できる

#### Acceptance Criteria

1. When ユーザーがプロジェクト一覧画面にアクセスする, the ArchiTrackシステム shall 認可されたプロジェクトの一覧をテーブル形式で表示する
2. The ArchiTrackシステム shall 各プロジェクトのプロジェクト名、顧客名、営業担当者、工事担当者、ステータス、作成日、更新日を一覧に表示する（列順序: プロジェクト名、顧客名、営業担当者、工事担当者、ステータス、作成日、更新日）
3. When ユーザーがプロジェクト行をクリックする, the ArchiTrackシステム shall 該当プロジェクトの詳細画面に遷移する
4. While プロジェクト一覧のデータを取得中, the ArchiTrackシステム shall ローディングインジケータを表示する
5. If プロジェクトが0件の場合, then the ArchiTrackシステム shall 「プロジェクトがありません。新規作成してください。」というメッセージを表示する
6. The ArchiTrackシステム shall プロジェクト一覧を更新日時の降順でデフォルト表示する

### Requirement 3: プロジェクト一覧のページネーション

**Objective:** As a ユーザー, I want プロジェクト一覧をページ分割して閲覧する, so that 大量のプロジェクトを効率的に閲覧できる

#### Acceptance Criteria

1. The ArchiTrackシステム shall 1ページあたりのデフォルト表示件数を20件とする
2. If プロジェクト総数がページサイズを超える場合, then the ArchiTrackシステム shall ページネーションコントロールを表示する
3. When ユーザーがページ番号をクリックする, the ArchiTrackシステム shall 該当ページのプロジェクトを表示する
4. The ArchiTrackシステム shall 現在のページ番号、総ページ数、総プロジェクト数を表示する
5. When ユーザーが表示件数を変更する, the ArchiTrackシステム shall 選択された件数で一覧を再表示する

### Requirement 4: プロジェクト検索

**Objective:** As a ユーザー, I want プロジェクトを検索する, so that 目的のプロジェクトを素早く見つけられる

#### Acceptance Criteria

1a. When ユーザーが検索フィールドにキーワードを入力してEnterキーを押す, the ArchiTrackシステム shall プロジェクト名、顧客名、営業担当者、工事担当者を対象に部分一致検索を実行する
1b. When ユーザーが検索フィールドにキーワードを入力して検索ボタンをクリックする, the ArchiTrackシステム shall プロジェクト名、顧客名、営業担当者、工事担当者を対象に部分一致検索を実行する
2. If 検索結果が0件の場合, then the ArchiTrackシステム shall 「該当するプロジェクトが見つかりませんでした。」というメッセージを表示する
3. When ユーザーが検索キーワードをクリアする, the ArchiTrackシステム shall 全プロジェクト一覧を再表示する
4a. When ユーザーが検索ボタンをクリックする, the ArchiTrackシステム shall 2文字以上の検索キーワードを要求する
4b. When ユーザーがEnterキーを押す, the ArchiTrackシステム shall 2文字以上の検索キーワードを要求する
5. If 検索キーワードが1文字以下の場合, then the ArchiTrackシステム shall 「2文字以上で入力してください」というメッセージを表示し、検索を実行しない

### Requirement 5: プロジェクトフィルタリング

**Objective:** As a ユーザー, I want プロジェクトをステータスや期間でフィルタリングする, so that 必要なプロジェクトのみを効率的に表示できる

#### Acceptance Criteria

1. When ユーザーがステータスフィルタで値を選択する, the ArchiTrackシステム shall 選択されたステータスのプロジェクトのみを表示する
2. The ArchiTrackシステム shall 期間フィルタで「作成日」を基準とした日付範囲フィルタリングを提供する
3. When ユーザーが期間フィルタで日付範囲を指定する, the ArchiTrackシステム shall 指定された期間内に作成されたプロジェクトのみを表示する
4. When ユーザーが複数のフィルタを適用する, the ArchiTrackシステム shall AND条件で絞り込みを実行する
5. When ユーザーが「フィルタをクリア」をクリックする, the ArchiTrackシステム shall すべてのフィルタを解除し、全プロジェクトを表示する
6. The ArchiTrackシステム shall フィルタの選択状態をURLパラメータに反映する

### Requirement 6: プロジェクト一覧のソート

**Objective:** As a ユーザー, I want プロジェクト一覧をソートする, so that 目的に応じた順序でプロジェクトを確認できる

#### Acceptance Criteria

1. When ユーザーがテーブルヘッダーをクリックする, the ArchiTrackシステム shall 該当カラムで昇順ソートを実行する
2. When ユーザーが同じテーブルヘッダーを再度クリックする, the ArchiTrackシステム shall 降順ソートに切り替える
3. The ArchiTrackシステム shall 現在のソート状態をヘッダーにアイコン（昇順: 上矢印、降順: 下矢印）で表示する
4. The ArchiTrackシステム shall ソート対象外のカラムヘッダーにはソートアイコンを表示しない
5. The ArchiTrackシステム shall プロジェクト名、顧客名、営業担当者、工事担当者、ステータス、作成日、更新日のカラムでソート可能とする

### Requirement 7: プロジェクト詳細表示

**Objective:** As a ユーザー, I want プロジェクトの詳細情報を閲覧する, so that プロジェクトの現状を正確に把握できる

#### Acceptance Criteria

1. When ユーザーがプロジェクト詳細画面にアクセスする, the ArchiTrackシステム shall プロジェクトの全情報（プロジェクト名、顧客名、営業担当者、工事担当者、説明、ステータス、住所、作成日、更新日）を表示する
2. While プロジェクト詳細データを取得中, the ArchiTrackシステム shall ローディングインジケータを表示する
3. If 指定されたプロジェクトIDが存在しない, then the ArchiTrackシステム shall 「プロジェクトが見つかりません」というエラーメッセージを表示する
4. If ユーザーがプロジェクトへのアクセス権限を持たない, then the ArchiTrackシステム shall 「アクセス権限がありません」というエラーメッセージを表示する
5. The ArchiTrackシステム shall 営業担当者フィールドにユーザーの表示名を表示する
6. If 工事担当者が設定されている場合, then the ArchiTrackシステム shall 工事担当者フィールドにユーザーの表示名を表示する

### Requirement 8: プロジェクト編集

**Objective:** As a ユーザー, I want プロジェクト情報を編集する, so that プロジェクトの最新情報を維持できる

#### Acceptance Criteria

1. When ユーザーがプロジェクト詳細画面で「編集」ボタンをクリックする, the ArchiTrackシステム shall プロジェクト編集フォームを表示する
2. When ユーザーがフォームを編集して「保存」ボタンをクリックする, the ArchiTrackシステム shall 変更内容をデータベースに保存する
3. When プロジェクトが正常に更新される, the ArchiTrackシステム shall 更新日時を自動的に記録し、成功メッセージを表示する
4. If バリデーションエラーが発生した場合, then the ArchiTrackシステム shall エラーメッセージを該当フィールドに表示する
5. When ユーザーが「キャンセル」ボタンをクリックする, the ArchiTrackシステム shall 編集内容を破棄し、詳細表示に戻る
6. If 編集中に他のユーザーがプロジェクトを更新した場合, then the ArchiTrackシステム shall 競合エラーを表示し、最新データの確認を促す
7. If プロジェクト名を変更して既に同じプロジェクト名が登録されている場合, then the ArchiTrackシステム shall 「このプロジェクト名は既に使用されています」というバリデーションエラーを表示する
8. The ArchiTrackシステム shall プロジェクト名の一意性チェックを更新時に実行する（自身のプロジェクトは除外）

### Requirement 9: プロジェクト削除

**Objective:** As a ユーザー, I want 不要なプロジェクトを削除する, so that 管理対象を整理できる

#### Acceptance Criteria

1. When ユーザーがプロジェクト詳細画面で「削除」ボタンをクリックする, the ArchiTrackシステム shall 削除確認ダイアログを表示する
2. When ユーザーが削除確認ダイアログで「削除」を選択する, the ArchiTrackシステム shall プロジェクトを論理削除し、プロジェクト一覧画面に遷移する
3. When プロジェクトが正常に削除される, the ArchiTrackシステム shall 「プロジェクトを削除しました」という成功メッセージを表示する
4. When ユーザーが削除確認ダイアログで「キャンセル」を選択する, the ArchiTrackシステム shall ダイアログを閉じ、詳細画面に留まる
5. If プロジェクトに関連データ（現場調査、見積書等）が存在する, then the ArchiTrackシステム shall 「関連データがあります。本当に削除しますか？」という警告メッセージを表示し、「削除する」「キャンセル」の選択肢を提供する
6. When ユーザーが関連データ警告ダイアログで「削除する」を選択する, the ArchiTrackシステム shall 関連データを含めてプロジェクトを論理削除する
7. The ArchiTrackシステム shall 削除されたプロジェクトは一覧に表示しない

### Requirement 10: プロジェクトステータス管理

**Objective:** As a ユーザー, I want プロジェクトのステータスを管理する, so that プロジェクトの進捗を追跡できる

#### Acceptance Criteria

1. The ArchiTrackシステム shall プロジェクトステータスとして以下の12種類を提供する: 「準備中」「調査中」「見積中」「決裁待ち」「契約中」「工事中」「引渡中」「請求中」「入金待ち」「完了」「中止」「失注」
2. The ArchiTrackシステム shall 新規作成時のデフォルトステータスを「準備中」とする
3. The ArchiTrackシステム shall 以下のメインワークフロー順方向遷移を許可する: 準備中 → 調査中 → 見積中 → 決裁待ち → 契約中 → 工事中 → 引渡中 → 請求中 → 入金待ち → 完了
4. The ArchiTrackシステム shall 以下の差し戻し遷移を許可する: 調査中 → 準備中、見積中 → 調査中、決裁待ち → 見積中、契約中 → 決裁待ち、工事中 → 契約中、引渡中 → 工事中、請求中 → 引渡中、入金待ち → 請求中
5. The ArchiTrackシステム shall 以下の中止遷移を許可する: 準備中 → 中止、調査中 → 中止、見積中 → 中止
6. The ArchiTrackシステム shall 以下の失注遷移を許可する: 決裁待ち → 失注、契約中 → 失注
7. The ArchiTrackシステム shall 終端ステータス（完了、中止、失注）からの遷移を禁止する
8. When ユーザーが許可されたステータス遷移を実行する, the ArchiTrackシステム shall 新しいステータスをデータベースに保存する
9. If ユーザーが許可されていないステータス遷移を実行しようとする, then the ArchiTrackシステム shall エラーメッセージを表示し、遷移を拒否する
10. When ステータスが変更される, the ArchiTrackシステム shall ステータス変更履歴（変更前ステータス、変更後ステータス、変更日時、変更したユーザー、遷移種別）を記録する
11. The ArchiTrackシステム shall 遷移種別として以下の3種類を定義する: 「順方向遷移」「差し戻し遷移」「終端遷移（完了・中止・失注）」
12. The ArchiTrackシステム shall 各ステータスを視覚的に区別できる色分けで表示する
13. The ArchiTrackシステム shall ステータス変更履歴をプロジェクト詳細画面で閲覧可能にする
14. When ユーザーが差し戻し遷移を実行する, the ArchiTrackシステム shall 差し戻し理由の入力を必須とする
15. The ArchiTrackシステム shall ステータス変更履歴に差し戻し理由を記録する
16. The ArchiTrackシステム shall ステータス変更UIで順方向遷移と差し戻し遷移を視覚的に区別して表示する

### Requirement 11: プロジェクト関連データの参照

**Objective:** As a ユーザー, I want プロジェクトに関連するデータを参照する, so that プロジェクト全体の状況を把握できる

**備考:** 現場調査機能・見積機能は将来実装予定のため、Whereパターン（オプショナル機能）で定義する。

#### Acceptance Criteria

1. Where 現場調査機能が有効化されている, the ArchiTrackシステム shall プロジェクト詳細画面に関連する現場調査の件数を表示する
2. Where 見積機能が有効化されている, the ArchiTrackシステム shall プロジェクト詳細画面に関連する見積書の件数を表示する
3. Where 現場調査機能が有効化されている, when ユーザーが「現場調査一覧」リンクをクリックする, the ArchiTrackシステム shall 該当プロジェクトの現場調査一覧画面に遷移する
4. Where 見積機能が有効化されている, when ユーザーが「見積書一覧」リンクをクリックする, the ArchiTrackシステム shall 該当プロジェクトの見積書一覧画面に遷移する
5. The ArchiTrackシステム shall 関連データがない場合は「0件」と表示する
6. If 関連機能が未実装の場合, then the ArchiTrackシステム shall 該当セクションを非表示にする

### Requirement 12: アクセス制御

**Objective:** As a システム管理者, I want プロジェクトへのアクセスを制御する, so that 情報セキュリティを確保できる

#### Acceptance Criteria

1. The ArchiTrackシステム shall 認証済みユーザーのみがプロジェクト機能にアクセスできるようにする
2. The ArchiTrackシステム shall ロールベースのアクセス制御でプロジェクトへのアクセス権限を判定する
3. If ユーザーが権限のない操作を実行しようとする, then the ArchiTrackシステム shall アクセス拒否エラーを返却する
4. The ArchiTrackシステム shall プロジェクト操作を監査ログに記録する
5. The ArchiTrackシステム shall プロジェクトの作成、参照、更新、削除に対する権限を定義する
6. The ArchiTrackシステム shall 監査ログに記録する操作を以下とする: プロジェクト作成、更新、削除、ステータス変更

### Requirement 13: データバリデーション

**Objective:** As a 開発者, I want 入力データのバリデーションを実装する, so that データの整合性を確保できる

#### Acceptance Criteria

1. The ArchiTrackシステム shall プロジェクト名を必須かつ1〜255文字とする
2. The ArchiTrackシステム shall 取引先を任意とする（取引先IDまたは未設定）
3. If 取引先が指定された場合, then the ArchiTrackシステム shall 取引先IDが有効な取引先マスタのIDであることを検証する
4. The ArchiTrackシステム shall 営業担当者を必須とする
5. The ArchiTrackシステム shall 営業担当者の値が管理者以外の有効なユーザーIDであることを検証する
6. The ArchiTrackシステム shall 工事担当者を任意とする
7. If 工事担当者が指定された場合, then the ArchiTrackシステム shall 工事担当者の値が管理者以外の有効なユーザーIDであることを検証する
8. The ArchiTrackシステム shall 現場住所を任意かつ最大500文字とする
9. The ArchiTrackシステム shall 概要を任意かつ最大5000文字とする
10. If フロントエンドでバリデーションエラーが発生する, then the ArchiTrackシステム shall エラーメッセージを即座に表示する
11. If バックエンドでバリデーションエラーが発生する, then the ArchiTrackシステム shall エラーレスポンスとエラー詳細を返却する

### Requirement 14: API設計

**Objective:** As a 開発者, I want APIを通じてプロジェクトデータにアクセスする, so that フロントエンドとバックエンドを分離できる

#### Acceptance Criteria

1. The ArchiTrackシステム shall プロジェクト一覧取得機能をAPIとして提供する
2. The ArchiTrackシステム shall プロジェクト詳細取得機能をAPIとして提供する
3. The ArchiTrackシステム shall プロジェクト作成機能をAPIとして提供する
4. The ArchiTrackシステム shall プロジェクト更新機能をAPIとして提供する
5. The ArchiTrackシステム shall プロジェクト削除機能をAPIとして提供する
6. The ArchiTrackシステム shall 一覧取得APIでページネーション、検索、フィルタリング、ソートをサポートする
7. The ArchiTrackシステム shall すべてのAPIをAPI仕様書に文書化する

### Requirement 15: レスポンシブデザイン

**Objective:** As a ユーザー, I want さまざまなデバイスでプロジェクト機能を使用する, so that 場所を選ばず業務を遂行できる

#### Acceptance Criteria

1. The ArchiTrackシステム shall プロジェクト一覧画面をデスクトップ、タブレット、モバイルに対応する
2. The ArchiTrackシステム shall プロジェクト詳細画面をデスクトップ、タブレット、モバイルに対応する
3. If 画面幅がモバイルサイズの場合, then the ArchiTrackシステム shall テーブルをカード形式に切り替えて表示する
4. The ArchiTrackシステム shall タッチ操作に最適化されたUIを提供する（適切なタップターゲットサイズ、十分な要素間スペース）
5. The ArchiTrackシステム shall 一般的なモバイルからデスクトップまでの画面幅に対応する

### Requirement 16: 顧客名選択（ドロップダウン+オートコンプリート）

**Objective:** As a ユーザー, I want 顧客名をドロップダウンから選択または検索して選択したい, so that 既存の取引先を素早く正確に選択できる

#### Acceptance Criteria

1. The ArchiTrackシステム shall 顧客名フィールドにドロップダウン選択UIとオートコンプリート機能を併用したUIを提供する
2. When ユーザーが顧客名フィールドにテキストを入力する, the ArchiTrackシステム shall 入力文字列に部分一致する取引先候補をフィルタリング表示する
3. When ユーザーが顧客名フィールドにフリガナを入力する, the ArchiTrackシステム shall ひらがな・カタカナどちらの入力でも取引先候補を検索する
4. The ArchiTrackシステム shall 取引先候補の表示形式を「名前 / 部課・支店・支社名 / 代表者名」の組み合わせとする
5. If 部課・支店・支社名が未設定の場合, then the ArchiTrackシステム shall 「名前 / 代表者名」の形式で表示する
6. If 代表者名が未設定の場合, then the ArchiTrackシステム shall 「名前 / 部課・支店・支社名」または「名前」のみで表示する
7. While 取引先候補を検索中, the ArchiTrackシステム shall ローディングインジケータを表示する
8. If 該当する取引先候補が存在しない場合, then the ArchiTrackシステム shall 「該当する顧客がありません」というメッセージを表示する
9. When ユーザーがキーボードの上下キーで候補を選択してEnterキーを押す, the ArchiTrackシステム shall 選択された顧客を設定する
10. When ユーザーがマウスで候補をクリックする, the ArchiTrackシステム shall 選択された顧客を設定する
11. The ArchiTrackシステム shall 取引先マスタに登録されていない顧客の自由入力を許可しない
12. The ArchiTrackシステム shall 顧客名選択機能が標準的な使用条件下で快適に動作するレスポンス時間を実現する
13. The ArchiTrackシステム shall 取引先種別に「顧客」を含む取引先のみを候補として表示する

### Requirement 17: 担当者ユーザー選択

**Objective:** As a ユーザー, I want 営業担当者・工事担当者を選択できる, so that プロジェクトに適切な担当者を割り当てられる

#### Acceptance Criteria

1. The ArchiTrackシステム shall 営業担当者フィールドにドロップダウン選択UIを提供する
2. The ArchiTrackシステム shall 工事担当者フィールドにドロップダウン選択UIを提供する
3. When ユーザーが営業担当者ドロップダウンを開く, the ArchiTrackシステム shall 管理者以外の有効なユーザー一覧を候補として表示する
4. When ユーザーが工事担当者ドロップダウンを開く, the ArchiTrackシステム shall 管理者以外の有効なユーザー一覧を候補として表示する
5. The ArchiTrackシステム shall 各ユーザー候補にユーザーの表示名を表示する
6. The ArchiTrackシステム shall 営業担当者フィールドのデフォルト選択値としてログインユーザーを設定する
7. The ArchiTrackシステム shall 工事担当者フィールドのデフォルト選択値としてログインユーザーを設定する
8. When ユーザーがドロップダウンから担当者を選択する, the ArchiTrackシステム shall 選択されたユーザーIDをフォームに設定する
9. The ArchiTrackシステム shall 担当者選択機能が標準的な使用条件下で快適に動作するレスポンス時間を実現する
10. While 担当者候補を取得中, the ArchiTrackシステム shall ローディングインジケータを表示する
11. If 有効なユーザーが存在しない場合, then the ArchiTrackシステム shall 「選択可能なユーザーがありません」というメッセージを表示する
12. The ArchiTrackシステム shall 担当者として割り当て可能なユーザー一覧を取得する機能を提供する

### Requirement 18: エラー回復とフィードバック

**Objective:** As a ユーザー, I want エラー発生時に適切なフィードバックと回復手段を得る, so that 操作を中断せずに業務を継続できる

#### Acceptance Criteria

1. If ネットワークエラーが発生した場合, then the ArchiTrackシステム shall 「通信エラーが発生しました。再試行してください。」というエラーメッセージと再試行ボタンを表示する
2. When ユーザーが再試行ボタンをクリックする, the ArchiTrackシステム shall 失敗したリクエストを再実行する
3. If サーバーエラーが発生した場合, then the ArchiTrackシステム shall 「システムエラーが発生しました。しばらくしてからお試しください。」というエラーメッセージを表示する
4. The ArchiTrackシステム shall 操作成功時にトースト通知で成功メッセージを表示する
5. The ArchiTrackシステム shall 操作失敗時にトースト通知でエラーメッセージを表示する
6. If セッションが期限切れの場合, then the ArchiTrackシステム shall ログインページにリダイレクトし、「セッションが期限切れになりました。再度ログインしてください。」というメッセージを表示する

### Requirement 19: パフォーマンス

**Objective:** As a ユーザー, I want 画面が素早く表示される, so that ストレスなく業務を遂行できる

#### Acceptance Criteria

1. The ArchiTrackシステム shall プロジェクト一覧画面の初期表示を標準的な使用条件下で2秒以内に完了する
2. The ArchiTrackシステム shall プロジェクト詳細画面の初期表示を標準的な使用条件下で1秒以内に完了する
3. The ArchiTrackシステム shall プロジェクト作成・更新・削除操作のAPI応答を標準的な使用条件下で500ミリ秒以内に完了する
4. The ArchiTrackシステム shall 検索・フィルタリング操作の結果表示を標準的な使用条件下で1秒以内に完了する
5. The ArchiTrackシステム shall 大量データでもページネーションにより一覧表示のパフォーマンスを維持する

### Requirement 20: アクセシビリティ

**Objective:** As a ユーザー, I want キーボードやスクリーンリーダーでプロジェクト機能を操作できる, so that 多様な操作方法で業務を遂行できる

#### Acceptance Criteria

1. The ArchiTrackシステム shall すべての操作をキーボードのみで実行可能にする
2. The ArchiTrackシステム shall フォーム要素に適切なラベル属性を設定する
3. The ArchiTrackシステム shall エラーメッセージをスクリーンリーダーに通知する
4. The ArchiTrackシステム shall フォーカス状態を視覚的に明確に表示する
5. The ArchiTrackシステム shall WCAG 2.1 Level AA準拠のコントラスト比を維持する
6. The ArchiTrackシステム shall テーブルヘッダーとデータセルの関連付けを適切に行う

### Requirement 21: 画面遷移・ナビゲーション

**Objective:** As a ユーザー, I want プロジェクト管理機能に素早くアクセスしたい, so that 効率的にプロジェクト情報を管理できる

#### Acceptance Criteria

##### ヘッダーナビゲーション

1. The ArchiTrackシステム shall メインナビゲーションに「プロジェクト」リンクを表示する
2. When 認証済みユーザーがメインナビゲーションの「プロジェクト」リンクをクリックしたとき, the ArchiTrackシステム shall プロジェクト一覧ページに遷移する
3. The ArchiTrackシステム shall 「プロジェクト」リンクにアイコンを付与して視認性を高める
4. The ArchiTrackシステム shall 「プロジェクト」リンクを「ダッシュボード」リンクの次に配置する

##### ダッシュボードクイックアクセス

5. The ArchiTrackシステム shall ダッシュボードのクイックアクセスセクションに「プロジェクト管理」カードを表示する
6. When ユーザーがダッシュボードの「プロジェクト管理」カードをクリックしたとき, the ArchiTrackシステム shall プロジェクト一覧ページに遷移する
7. The ArchiTrackシステム shall 「プロジェクト管理」カードに「工事案件の作成・管理」という説明を表示する
8. The ArchiTrackシステム shall 「プロジェクト管理」カードをクイックアクセスセクションの先頭に配置する

##### URL構造

9. The ArchiTrackシステム shall プロジェクト一覧ページへの直接アクセスを可能にする
10. The ArchiTrackシステム shall プロジェクト新規作成ページへの直接アクセスを可能にする
11. The ArchiTrackシステム shall プロジェクト詳細ページへの直接アクセスを可能にする
12. The ArchiTrackシステム shall プロジェクト編集ページへの直接アクセスを可能にする
13. When ユーザーが存在しないプロジェクトIDにアクセスしたとき, the ArchiTrackシステム shall 「プロジェクトが見つかりません」というエラーメッセージを表示し、プロジェクト一覧への戻るリンクを提供する

##### パンくずナビゲーション

14. The ArchiTrackシステム shall プロジェクト一覧ページに「ダッシュボード > プロジェクト」のパンくずナビゲーションを表示する
15. The ArchiTrackシステム shall プロジェクト詳細ページに「ダッシュボード > プロジェクト > [プロジェクト名]」のパンくずナビゲーションを表示する
16. The ArchiTrackシステム shall プロジェクト新規作成ページに「ダッシュボード > プロジェクト > 新規作成」のパンくずナビゲーションを表示する
17. The ArchiTrackシステム shall プロジェクト編集ページに「ダッシュボード > プロジェクト > [プロジェクト名] > 編集」のパンくずナビゲーションを表示する
18. When ユーザーがパンくずナビゲーションの任意の階層をクリックしたとき, the ArchiTrackシステム shall 該当ページに遷移する

##### 画面間遷移

19. When ユーザーがプロジェクト一覧からプロジェクトを選択したとき, the ArchiTrackシステム shall プロジェクト詳細ページに遷移する
20. When ユーザーがプロジェクト一覧で「新規作成」ボタンをクリックしたとき, the ArchiTrackシステム shall プロジェクト新規作成ページに遷移する
21. When ユーザーがプロジェクト詳細ページで「編集」ボタンをクリックしたとき, the ArchiTrackシステム shall プロジェクト編集画面を表示する
22. When プロジェクト作成に成功したとき, the ArchiTrackシステム shall プロジェクト詳細ページに遷移する
23. When プロジェクト更新に成功したとき, the ArchiTrackシステム shall プロジェクト詳細ページに遷移し、成功メッセージを表示する
24. When プロジェクト削除に成功したとき, the ArchiTrackシステム shall プロジェクト一覧ページに遷移する

##### アクセス制御とルート保護

25. The ArchiTrackシステム shall プロジェクト管理ページ群を保護し、認証済みユーザーのみアクセスを許可する
26. The ArchiTrackシステム shall プロジェクト管理ページ群に共通レイアウト（ナビゲーションヘッダー付き）を適用する
27. If 未認証ユーザーがプロジェクト管理ページにアクセスした場合, then the ArchiTrackシステム shall ログインページにリダイレクトする
28. When ログイン後, the ArchiTrackシステム shall 元のページ（リダイレクト元のプロジェクトページ）に遷移する

### Requirement 22: 顧客連携

**Objective:** As a ユーザー, I want プロジェクトに顧客を紐付けたい, so that プロジェクトと顧客の関係を明確に管理できる

#### Acceptance Criteria

1. When ユーザーがプロジェクト作成画面で顧客名を選択するとき, the ArchiTrackシステム shall 取引先種別に「顧客」を含む取引先一覧を候補として提供する
2. When ユーザーがプロジェクト編集画面で顧客名を選択するとき, the ArchiTrackシステム shall 取引先種別に「顧客」を含む取引先一覧を候補として提供する
3. The ArchiTrackシステム shall 顧客名選択時にドロップダウンとオートコンプリート機能を併用したUIを提供する
4. When ユーザーが検索フィールドにテキストを入力する, the ArchiTrackシステム shall 入力文字列に部分一致する顧客を候補としてフィルタリング表示する
5. When ユーザーがフリガナ検索を行う, the ArchiTrackシステム shall ひらがな・カタカナどちらの入力でも顧客を検索する
6. The ArchiTrackシステム shall 顧客候補の表示形式を「名前 / 部課・支店・支社名 / 代表者名」の組み合わせとする
7. If 部課・支店・支社名が未設定の場合, then the ArchiTrackシステム shall 「名前 / 代表者名」の形式で表示する
8. If 代表者名が未設定の場合, then the ArchiTrackシステム shall 「名前 / 部課・支店・支社名」または「名前」のみで表示する
9. The ArchiTrackシステム shall 取引先マスタに登録されていない顧客の自由入力を許可しない
10. While プロジェクトが顧客と紐付いている, the ArchiTrackシステム shall プロジェクト詳細画面に顧客名を表示する
11. While プロジェクトが顧客と紐付いている, the ArchiTrackシステム shall プロジェクト一覧画面に顧客名を表示する
