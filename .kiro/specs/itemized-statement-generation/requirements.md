# Requirements Document

## Introduction

本ドキュメントは「内訳書作成機能」の要件定義書です。本機能は、プロジェクト配下に実装済みの数量表機能の項目を集計し、指定した分類軸でピボット集計した内訳書を作成します。内訳書は作成時点の数量表スナップショットを保持し、以降の数量表更新による自動再計算は行いません。

## Requirements

### Requirement 1: 内訳書の新規作成

**Objective:** As a プロジェクト担当者, I want プロジェクト詳細画面から数量表を指定して内訳書を作成する, so that 数量拾い出し結果を分類別に集計した帳票を得られる

#### Acceptance Criteria

1. When ユーザーが内訳書セクションの新規作成ボタンをクリックする, the システム shall 内訳書新規作成画面に遷移する
2. When ユーザーが数量表を1つ選択する, the 内訳書作成フォーム shall 選択された数量表の項目数を表示する
3. When ユーザーが内訳書名を入力して作成を確定する, the システム shall 選択された数量表の全項目を集計して内訳書レコードを作成する
4. If 数量表が選択されていない状態で作成を試行する, then the システム shall 「数量表を選択してください」エラーメッセージを表示する
5. The 数量表選択 shall 1つの数量表のみ選択可能とする
6. If 内訳書名が未入力の状態で作成を試行する, then the システム shall 「内訳書名を入力してください」エラーメッセージを表示する
7. The 内訳書名フィールド shall 最大200文字の入力制限を適用する
8. When プロジェクトに数量表が存在しない場合, the 内訳書セクション shall 「まず数量表を作成してください」メッセージを表示し新規作成ボタンを非表示とする
9. If 選択された数量表の項目数が0件の場合, then the システム shall 「選択された数量表に項目がありません」エラーメッセージを表示し作成を中止する
10. If 同一プロジェクト内に同名の内訳書が既に存在する場合, then the システム shall 「同名の内訳書が既に存在します」エラーメッセージを表示し作成を中止する

### Requirement 2: ピボット集計ロジック

**Objective:** As a システム, I want 数量表項目を分類軸でグループ化して数量を合計する, so that 同一分類の項目が1行に集約された内訳書が生成される

#### Acceptance Criteria

1. When 内訳書が作成される, the システム shall 「任意分類」「工種」「名称」「規格」「単位」の5項目の組み合わせをキーとしてグループ化する
2. When 同一キーの項目が複数存在する, the システム shall 該当項目の「数量」フィールドの値を合計する
3. When グループ化を行う, the システム shall null または空文字の値を同一グループとして扱う
4. The 合計数量 shall 小数点以下2桁の精度で計算する
5. If 数量の合計結果が -999999.99 未満または 9999999.99 を超える場合, then the システム shall オーバーフローエラーを発生させ内訳書作成を中止する

### Requirement 3: 内訳書一覧表示

~~→ project-management/Requirement 26 に全AC移動~~

**Objective:** As a プロジェクト担当者, I want プロジェクト詳細画面で作成済み内訳書の一覧を確認する, so that 必要な内訳書に素早くアクセスできる

#### Acceptance Criteria

1. ~~→ project-management/Requirement 26 AC 1 に移動~~
2. ~~→ project-management/Requirement 26 AC 3 に移動~~
3. ~~→ project-management/Requirement 26 AC 4 に移動~~
4. ~~→ project-management/Requirement 26 AC 5 に移動~~
5. ~~→ project-management/Requirement 26 AC 6 に移動~~
6. ~~→ project-management/Requirement 26 AC 7 に移動~~

### Requirement 4: 内訳書詳細画面

**Objective:** As a プロジェクト担当者, I want 内訳書の集計結果を一覧で確認する, so that 分類別の数量を把握できる

#### Acceptance Criteria

1. The 内訳書詳細画面 shall 集計結果をテーブル形式で表示する
2. The テーブル shall 「任意分類」「工種」「名称」「規格」「数量」「単位」の順でカラムを表示する
3. The 数量カラム shall 小数点以下2桁で表示し、桁が足りない場合は0で埋める（例: 1 → 1.00）
4. While 内訳書詳細画面を表示中, the システム shall パンくずナビゲーションで上位階層（ダッシュボード、プロジェクト一覧、プロジェクト詳細、内訳書一覧）への戻りリンクを提供する
5. The 内訳書詳細画面 shall 内訳書名と作成日時をヘッダーに表示する
6. The テーブル shall 最大2000件の内訳項目を表示可能とする
7. When 内訳項目が50件を超える場合, the テーブル shall ページネーションを表示する
8. The ページネーション shall 1ページあたり50件の項目を表示する
9. The ページネーション shall 現在のページ番号と総ページ数を表示する

### Requirement 5: 内訳項目の並び替え

**Objective:** As a プロジェクト担当者, I want 内訳書の項目を任意の順序で並び替える, so that 用途に応じた表示順で確認できる

#### Acceptance Criteria

1. The 内訳書詳細画面 shall 各カラムヘッダーにソートボタンを表示する
2. When ユーザーがカラムヘッダーをクリックする, the テーブル shall 当該カラムで昇順ソートする
3. When ユーザーが同じカラムヘッダーを再度クリックする, the テーブル shall 当該カラムで降順ソートに切り替える
4. When ソートが適用されている, the カラムヘッダー shall 現在のソート方向を示すアイコンを表示する
5. The デフォルトのソート順 shall 「任意分類」「工種」「名称」「規格」の優先度で昇順とする

### Requirement 6: 内訳項目のフィルタリング

**Objective:** As a プロジェクト担当者, I want 内訳書の項目を条件で絞り込む, so that 必要な項目のみを表示できる

#### Acceptance Criteria

1. The 内訳書詳細画面 shall フィルタ入力エリアを提供する
2. The フィルタ shall 「任意分類」「工種」「名称」「規格」「単位」の全カラムに対応する
3. When ユーザーがフィルタに値を入力する, the テーブル shall 該当カラムが部分一致する項目のみを表示する
4. When 複数のフィルタが設定されている, the テーブル shall 全条件をAND結合して絞り込む
5. When フィルタ結果が0件の場合, the テーブル shall 「該当する項目はありません」メッセージを表示する
6. The フィルタ shall クリアボタンで全フィルタを一括解除できる
7. When フィルタが適用されている状態でページネーションを使用する, the システム shall フィルタ結果に対してページネーションを適用する

### Requirement 7: 内訳書の削除

**Objective:** As a プロジェクト担当者, I want 不要な内訳書を削除する, so that 内訳書一覧を整理できる

#### Acceptance Criteria

1. The 内訳書詳細画面 shall 削除ボタンを表示する
2. When ユーザーが削除ボタンをクリックする, the システム shall 確認ダイアログを表示する
3. When ユーザーが確認ダイアログで削除を確定する, the システム shall 内訳書を論理削除してプロジェクト詳細画面に遷移する
4. If 削除処理中にエラーが発生する, then the システム shall エラーメッセージを表示し内訳書を削除しない

### Requirement 8: スナップショット独立性

**Objective:** As a システム, I want 内訳書を元データから独立したスナップショットとして保持する, so that 数量表の変更が既存内訳書に影響しない

#### Acceptance Criteria

1. When 内訳書が作成される, the システム shall 集計時点の数量項目データを内訳書に保存する
2. When 元の数量表が更新される, the 作成済み内訳書 shall 影響を受けない
3. When 元の数量表が削除される, the 作成済み内訳書 shall 影響を受けない
4. The 内訳書詳細画面 shall 集計元の数量表名を参照情報として表示する

### Requirement 9: パンくずナビゲーション

**Objective:** As a ユーザー, I want パンくずナビゲーションで現在位置を把握し上位階層に移動する, so that 画面間のナビゲーションがスムーズになる

#### Acceptance Criteria

1. The 内訳書一覧画面 shall パンくずナビゲーション「ダッシュボード > プロジェクト一覧 > {プロジェクト名} > 内訳書一覧」を表示する
2. The 内訳書新規作成画面 shall パンくずナビゲーション「ダッシュボード > プロジェクト一覧 > {プロジェクト名} > 内訳書一覧 > 新規作成」を表示する
3. The 内訳書詳細画面 shall パンくずナビゲーション「ダッシュボード > プロジェクト一覧 > {プロジェクト名} > 内訳書一覧 > {内訳書名}」を表示する
4. When ユーザーがパンくずの「ダッシュボード」をクリックする, the システム shall ダッシュボード画面に遷移する
5. When ユーザーがパンくずの「プロジェクト一覧」をクリックする, the システム shall プロジェクト一覧画面に遷移する
6. When ユーザーがパンくずの「{プロジェクト名}」をクリックする, the システム shall プロジェクト詳細画面に遷移する
7. When ユーザーがパンくずの「内訳書一覧」をクリックする（新規作成画面・詳細画面のみ）, the システム shall 内訳書一覧画面に遷移する

### Requirement 10: 楽観的排他制御

**Objective:** As a システム, I want 同時編集時のデータ競合を検知する, so that データの整合性が保たれる

#### Acceptance Criteria

1. The 内訳書 shall updatedAtフィールドを持つ
2. When 削除リクエストを受信する, the システム shall リクエストのupdatedAtと現在値を比較する
3. If updatedAtが一致しない, then the システム shall 409 Conflictエラーを返却する
4. When 409エラーが返却される, the クライアント shall 「他のユーザーにより更新されました。画面を再読み込みしてください」メッセージを表示する

### Requirement 11: プロジェクト詳細画面への統合

~~→ project-management/Requirement 26 に全AC移動~~

**Objective:** As a ユーザー, I want プロジェクト詳細画面から内訳書機能にアクセスする, so that 数量表機能と同じ操作感で内訳書を管理できる

#### Acceptance Criteria

1. ~~→ project-management/Requirement 26 AC 1 に移動~~
2. ~~→ project-management/Requirement 26 AC 2 に移動~~
3. ~~→ project-management/Requirement 26 AC 8 に移動~~
4. ~~→ project-management/Requirement 26 AC 9 に移動~~
5. ~~→ project-management/Requirement 26 AC 10 に移動~~
6. ~~→ project-management/Requirement 26 AC 11 に移動~~

### Requirement 12: ローディング表示

**Objective:** As a ユーザー, I want 処理中にローディング表示を確認する, so that システムが動作中であることを把握できる

#### Acceptance Criteria

1. While 内訳書作成の集計処理中, the システム shall ローディングインジケーターを表示する
2. While 内訳書詳細データの取得中, the システム shall ローディングインジケーターを表示する
3. While 内訳書削除処理中, the システム shall ローディングインジケーターを表示する
4. While ローディング中, the 操作ボタン shall 無効化される
5. When ローディングが完了する, the システム shall ローディングインジケーターを非表示にする

### Requirement 13: Excel出力機能

**Objective:** As a プロジェクト担当者, I want 内訳書をExcelファイルとしてダウンロードする, so that 外部ツールでの編集や他システムへのデータ連携が容易になる

#### Acceptance Criteria

1. The 内訳書詳細画面 shall Excelダウンロードボタンを表示する
2. When ユーザーがExcelダウンロードボタンをクリックする, the システム shall 内訳書データを含むExcelファイル（.xlsx形式）を生成する
3. The 生成されるExcelファイル shall 「任意分類」「工種」「名称」「規格」「数量」「単位」のカラムを含む
4. The Excelファイルのファイル名 shall 「{内訳書名}_{YYYYMMDD}.xlsx」形式とする
5. The 数量カラム shall 数値として出力し、小数点以下2桁の精度を維持する
6. When フィルタが適用されている状態でExcelダウンロードを実行する, the システム shall フィルタ後のデータのみを出力する
7. While Excelファイル生成中, the システム shall ローディングインジケーターを表示する
8. If Excelファイル生成中にエラーが発生する, then the システム shall エラーメッセージを表示しダウンロードを中止する

### Requirement 14: クリップボード出力機能（タブ区切り形式）

**Objective:** As a プロジェクト担当者, I want 内訳書のデータをクリップボードにコピーする, so that 表計算ソフトへの貼り付けが素早くできる

#### Acceptance Criteria

1. The 内訳書詳細画面 shall クリップボードにコピーボタンを表示する
2. When ユーザーがクリップボードにコピーボタンをクリックする, the システム shall 内訳書データをタブ区切り形式でクリップボードにコピーする
3. The クリップボードにコピーされるデータ shall ヘッダー行（任意分類、工種、名称、規格、数量、単位）を含む
4. The クリップボードにコピーされるデータ shall 各行をタブ文字で区切り、行末を改行文字で終端する
5. When フィルタが適用されている状態でクリップボードコピーを実行する, the システム shall フィルタ後のデータのみをコピーする
6. When クリップボードへのコピーが成功する, the システム shall 「クリップボードにコピーしました」トースト通知を表示する
7. If クリップボードへのコピーに失敗する, then the システム shall 「クリップボードへのコピーに失敗しました」エラーメッセージを表示する
8. The 数量 shall 小数点以下2桁の精度を維持した文字列として出力する

### Requirement 15: 内訳書新規作成画面

**Objective:** As a プロジェクト担当者, I want 専用の内訳書新規作成画面で内訳書を作成する, so that 現場調査や数量表と統一された操作感で内訳書を作成できる

#### Acceptance Criteria

1. The システム shall 内訳書新規作成画面を独立したページとして提供する
2. The 内訳書新規作成画面 shall プロジェクト詳細画面に戻るリンクを表示する
3. The 内訳書新規作成画面 shall 内訳書名入力フィールドを表示する
4. The 内訳書名フィールド shall デフォルト値として「内訳書」を設定する
5. The 内訳書新規作成画面 shall 数量表選択リストを表示する
6. When ユーザーが作成を確定する, the システム shall 内訳書を作成し内訳書詳細画面に遷移する
7. When ユーザーがキャンセルする, the システム shall プロジェクト詳細画面に遷移する
8. The 内訳書一覧画面の新規作成ボタン shall 内訳書新規作成画面に遷移する
9. When 内訳書一覧画面からキャンセルする, the システム shall 内訳書一覧画面に遷移する

### Requirement 16: 内訳項目の初期ソート順序

**Objective:** As a プロジェクト担当者, I want 数量表から内訳書を作成した際に項目が分類順で自動ソートされる, so that 整理された状態で内訳書を確認できる

#### Acceptance Criteria

1. When 内訳書が数量表から作成される, the システム shall ピボット集計結果を「任意分類」「工種」「名称」「規格」「単位」の優先度で昇順ソートする
2. The ソート順序 shall 各項目のdisplayOrderフィールドとして保存される
3. When ソート対象の値がnullまたは空文字の場合, the システム shall 該当値を空文字として扱い、ソート順序の先頭に配置する
4. The 初期ソート順序 shall 内訳書作成時に一度だけ適用され、以降の手動並び替えで上書き可能とする

### Requirement 17: 内訳項目の手動並び替え

**Objective:** As a プロジェクト担当者, I want 内訳書の項目を上下ボタンで任意の順序に並び替える, so that 用途に応じた表示順でデータを整理できる

#### Acceptance Criteria

1. The 内訳書詳細画面 shall 各内訳項目行に上移動ボタンと下移動ボタンを表示する
2. When ユーザーが上移動ボタンをクリックする, the 該当項目 shall 1つ上の位置に移動する
3. When ユーザーが下移動ボタンをクリックする, the 該当項目 shall 1つ下の位置に移動する
4. When 先頭の項目の上移動ボタンをクリックする, the システム shall 何も行わない（ボタンを無効化する）
5. When 末尾の項目の下移動ボタンをクリックする, the システム shall 何も行わない（ボタンを無効化する）
6. The 並び替え操作 shall クライアントサイドのみで状態を管理し、操作ごとにサーバーリクエストを発生させない
7. When 並び替え操作が行われた場合, the 内訳書詳細画面 shall 保存ボタンを表示する
8. When ユーザーが保存ボタンをクリックする, the システム shall 全項目の並び順をサーバーに一括送信して確定する
9. When 並び順の保存が成功する, the システム shall 「並び順を保存しました」トースト通知を表示する
10. When 並び順の保存中にエラーが発生する, the システム shall エラーメッセージを表示し元の並び順を保持する
11. While 並び順の保存処理中, the システム shall ローディングインジケーターを表示し操作ボタンを無効化する
12. When 並び替え操作が行われた未保存の状態でページを離脱しようとする, the システム shall 確認ダイアログを表示する
13. The 手動並び替え shall フィルタやカラムソートが適用されていない状態（デフォルト表示順）でのみ操作可能とする
14. When 並び順の保存リクエストを送信する, the システム shall updatedAtによる楽観的排他制御を適用する
