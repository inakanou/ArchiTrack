# Requirements Document

## Introduction
現場調査機能は、工事案件のプロジェクトに紐付く形で現場調査データを管理するための機能です。現場調査時に撮影した写真や図面に対して、寸法・マーキング・コメント等の注釈を追加し、工事計画の基礎資料として活用します。作成された注釈付き画像は、今後追加予定の数量表作成機能から参照されることを想定しています。

## Requirements

### Requirement 1: 現場調査CRUD操作
**Objective:** As a プロジェクト担当者, I want プロジェクトに紐付く現場調査を作成・編集・削除できること, so that 工事に必要な現場情報を体系的に管理できる

#### Acceptance Criteria
1. When ユーザーが現場調査作成フォームを送信する, the Site Survey Service shall プロジェクトに紐付く新規現場調査レコードを作成する
2. When ユーザーが現場調査詳細画面を表示する, the Site Survey Service shall 現場調査の基本情報と関連する画像一覧を表示する
3. When ユーザーが現場調査情報を編集して保存する, the Site Survey Service shall 楽観的排他制御を用いて現場調査レコードを更新する
4. When ユーザーが現場調査を削除する, the Site Survey Service shall 現場調査と関連する画像データを論理削除する
5. If 同時編集による競合が検出される, then the Site Survey Service shall 競合エラーを表示して再読み込みを促す
6. While プロジェクトが存在しない, the Site Survey Service shall 現場調査の作成を許可しない

### Requirement 2: 画面遷移・ナビゲーション
**Objective:** As a プロジェクト担当者, I want 現場調査機能への画面遷移が分かりやすいこと, so that 目的の画面に迷わずたどり着ける

#### Acceptance Criteria
1. When ユーザーがプロジェクト詳細画面を表示する, the Site Survey Service shall 「現場調査」セクションに直近2件の現場調査への参照リンクと現場調査の総数を表示する
2. When ユーザーが現場調査セクションで「すべて表示」リンクをクリックする, the Site Survey Service shall 当該プロジェクトの現場調査一覧を表示する
3. When ユーザーが現場調査一覧で項目をクリックする, the Site Survey Service shall 現場調査詳細画面に遷移する
4. When ユーザーが現場調査詳細画面で画像をクリックする, the Site Survey Service shall 画像ビューア/注釈エディタを開く
5. The Site Survey Service shall 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
6. The Site Survey Service shall ブレッドクラムで「プロジェクト名 > 現場調査一覧 > 現場調査名」の階層を表示する
7. When ユーザーがブレッドクラムの各項目をクリックする, the Site Survey Service shall 対応する画面に遷移する

### Requirement 3: 現場調査一覧・検索
**Objective:** As a プロジェクト担当者, I want プロジェクト配下の現場調査を一覧表示・検索できること, so that 必要な現場調査を素早く見つけられる

#### Acceptance Criteria
1. When ユーザーが現場調査一覧画面を表示する, the Site Survey Service shall 当該プロジェクトに紐付く現場調査をページネーション付きで表示する
2. When ユーザーが検索キーワードを入力する, the Site Survey Service shall 現場調査名・メモでの部分一致検索結果を表示する
3. When ユーザーが調査日でフィルタリングする, the Site Survey Service shall 指定期間内の現場調査のみを表示する
4. When ユーザーが並び替えを変更する, the Site Survey Service shall 調査日・作成日・更新日でソートした結果を表示する
5. The Site Survey Service shall 一覧画面でサムネイル画像（代表画像）を表示する

### Requirement 4: 画像アップロード・管理
**Objective:** As a 現場調査担当者, I want 現場写真や図面をアップロードして管理できること, so that 現場の状況を視覚的に記録できる

#### Acceptance Criteria
1. When ユーザーが画像ファイルを選択してアップロードする, the Site Survey Service shall 画像をストレージに保存し現場調査に紐付ける
2. When ユーザーが複数の画像を同時に選択する, the Site Survey Service shall バッチアップロードを実行する
3. If 同時選択ファイル数が5件を超える, then the Site Survey Service shall 5件ずつキュー処理して順次アップロードを実行する
4. When 画像アップロードが完了する, the Site Survey Service shall サムネイルを自動生成する
5. If アップロードされたファイルが許可された形式でない, then the Site Survey Service shall エラーメッセージを表示してアップロードを拒否する
6. If ファイルサイズが上限（300KB）を超える, then the Site Survey Service shall 画像サイズと品質を段階的に下げて250KB〜350KBの範囲に圧縮した上で登録する
7. When ユーザーが画像を削除する, the Site Survey Service shall 画像と関連する注釈データを削除する
8. The Site Survey Service shall JPEG、PNG、WEBP形式の画像ファイルをサポートする
9. The Site Survey Service shall 画像一覧を固定の表示順序で表示する
10. When ユーザーが画像をドラッグアンドドロップする, the Site Survey Service shall 画像の表示順序を変更して保存する

### Requirement 5: 画像ビューア
**Objective:** As a 現場調査担当者, I want アップロードした画像を拡大・縮小・回転して閲覧できること, so that 画像の詳細を確認できる

#### Acceptance Criteria
1. When ユーザーが画像をクリックする, the Site Survey Service shall 画像ビューアをモーダルまたは専用画面で開く
2. When ユーザーがズームイン/ズームアウト操作を行う, the Site Survey Service shall 画像を拡大/縮小表示する
3. When ユーザーが回転ボタンを押す, the Site Survey Service shall 画像を90度単位で回転表示する
4. When ユーザーがパン操作を行う, the Site Survey Service shall 拡大時の表示領域を移動する
5. When ユーザーがピンチ操作を行う（タッチデバイス）, the Site Survey Service shall ズームレベルを変更する
6. The Site Survey Service shall 画像の表示状態（ズーム・回転・位置）を注釈編集モードと共有する

### Requirement 6: 注釈機能 - 寸法線
**Objective:** As a 現場調査担当者, I want 画像上に寸法線を追加できること, so that 現場の実測値を図面に記録できる

#### Acceptance Criteria
1. When ユーザーが寸法線ツールを選択して2点をクリックする, the Site Survey Service shall 2点間に寸法線を描画する
2. When 寸法線が描画される, the Site Survey Service shall 寸法値入力用のテキストフィールドを表示する
3. When ユーザーが寸法値を入力する, the Site Survey Service shall 寸法線上に数値とオプションの単位を表示する
4. When ユーザーが既存の寸法線をクリックする, the Site Survey Service shall 寸法線を選択状態にして編集可能にする
5. When ユーザーが寸法線の端点をドラッグする, the Site Survey Service shall 寸法線の位置を調整する
6. When ユーザーが選択中の寸法線を削除する, the Site Survey Service shall 寸法線を画像から除去する
7. The Site Survey Service shall 寸法線の色・線の太さをカスタマイズ可能にする

### Requirement 7: 注釈機能 - マーキング（図形）
**Objective:** As a 現場調査担当者, I want 画像上に図形（矢印・円・四角形・多角形・折れ線・フリーハンド）を追加できること, so that 注目箇所を視覚的に示せる

#### Acceptance Criteria
1. When ユーザーが矢印ツールを選択してドラッグする, the Site Survey Service shall 開始点から終了点へ矢印を描画する
2. When ユーザーが円ツールを選択してドラッグする, the Site Survey Service shall 円または楕円を描画する
3. When ユーザーが四角形ツールを選択してドラッグする, the Site Survey Service shall 長方形を描画する
4. When ユーザーが多角形ツールを選択して頂点をクリックする, the Site Survey Service shall 多角形を描画する
5. When ユーザーが折れ線ツールを選択して点をクリックする, the Site Survey Service shall 折れ線を描画する
6. When ユーザーがフリーハンドツールを選択して描画する, the Site Survey Service shall フリーハンドの線を描画する
7. When ユーザーが既存の図形をクリックする, the Site Survey Service shall 図形を選択状態にして編集可能にする
8. When ユーザーが選択中の図形をドラッグする, the Site Survey Service shall 図形の位置を移動する
9. When ユーザーが選択中の図形のハンドルをドラッグする, the Site Survey Service shall 図形のサイズを変更する
10. The Site Survey Service shall 図形の色・線の太さ・塗りつぶしをカスタマイズ可能にする

### Requirement 8: 注釈機能 - コメント（テキスト）
**Objective:** As a 現場調査担当者, I want 画像上にテキストコメントを追加できること, so that 補足説明や注意事項を記録できる

#### Acceptance Criteria
1. When ユーザーがテキストツールを選択して画像上をクリックする, the Site Survey Service shall テキスト入力用のフィールドを表示する
2. When ユーザーがテキストを入力して確定する, the Site Survey Service shall 画像上にテキストコメントを配置する
3. When ユーザーが既存のテキストをダブルクリックする, the Site Survey Service shall テキストを編集モードにする
4. When ユーザーがテキストをドラッグする, the Site Survey Service shall テキストの配置位置を移動する
5. The Site Survey Service shall テキストのフォントサイズ・色・背景色をカスタマイズ可能にする
6. When ユーザーが吹き出し形式を選択する, the Site Survey Service shall テキストを吹き出し形式で表示する
7. The Site Survey Service shall 日本語を含むマルチバイト文字の入力・表示をサポートする

### Requirement 9: 注釈データの保存・復元
**Objective:** As a 現場調査担当者, I want 追加した注釈を保存して後から編集できること, so that 作業を中断・再開できる

#### Acceptance Criteria
1. When ユーザーが注釈編集画面で保存ボタンを押す, the Site Survey Service shall 全ての注釈データをデータベースに保存する
2. When ユーザーが注釈付き画像を再度開く, the Site Survey Service shall 保存された注釈データを復元して表示する
3. When ユーザーが注釈を編集中に画面を離れようとする, the Site Survey Service shall 未保存の変更がある場合に確認ダイアログを表示する
4. While 注釈データ保存中, the Site Survey Service shall 保存中インジケーターを表示する
5. If 注釈データの保存に失敗する, then the Site Survey Service shall エラーメッセージを表示してリトライを促す
6. The Site Survey Service shall 注釈データをJSON形式でエクスポート可能にする

### Requirement 10: 写真一覧管理とPDF出力設定
**Objective:** As a 現場調査担当者, I want 現場調査詳細画面で写真ごとに報告書出力対象を選択しコメントを管理できること, so that 必要な写真とコメントを選択的に報告書に含められる

#### Acceptance Criteria
1. When ユーザーが現場調査詳細画面を表示する, the Site Survey Service shall 各写真について報告書出力フラグ（チェックボックス）、フルサイズの写真（サムネイル一覧は表示しない）、コメント入力用テキストエリア、削除ボタンを表示する
2. When ユーザーが報告書出力フラグのチェックボックスをONにする, the Site Survey Service shall 当該写真をPDF出力対象として設定する（未保存状態になる）
3. When ユーザーが報告書出力フラグのチェックボックスをOFFにする, the Site Survey Service shall 当該写真をPDF出力対象から除外する（未保存状態になる）
4. When ユーザーがコメント入力用テキストエリアにテキストを入力する, the Site Survey Service shall 入力内容を当該写真に紐付ける（未保存状態になる）
5. When ユーザーが写真をマウスドラッグで移動する, the Site Survey Service shall 写真の表示順序を変更する
6. When ユーザーが写真の並び替え操作を完了する, the Site Survey Service shall 変更された表示順序をデータベースに保存する
7. The Site Survey Service shall 写真一覧を保存された表示順序の通りに表示する
8. When ユーザーが「保存」ボタンをクリックする, the Site Survey Service shall 各写真のコメントと報告書出力フラグの状態をデータベースに保存する
9. While 未保存の変更がある状態でユーザーがページを離れようとする, the Site Survey Service shall 確認ダイアログを表示して変更が失われることを警告する
10. When ユーザーが写真の削除ボタンをクリックする, the Site Survey Service shall 確認ダイアログを表示する
11. When ユーザーが削除確認ダイアログで削除を確定する, the Site Survey Service shall 当該写真と関連する注釈データを削除する

### Requirement 11: 調査報告書PDF出力
**Objective:** As a 現場調査担当者, I want 注釈を含めた画像を選択的にPDF報告書としてエクスポートできること, so that 報告書や数量表作成に利用できる

#### Acceptance Criteria
1. When ユーザーが調査報告書出力ボタンを押す, the Site Survey Service shall 注釈付き画像一覧を調査結果報告PDFドキュメントとして生成する
2. The Site Survey Service shall PDF出力対象として報告書出力フラグがONの写真のみを含める
3. The Site Survey Service shall PDF出力時に写真を表示順序の通りに配置する
4. The Site Survey Service shall PDFの1ページ目に現場調査の基本情報（調査名、調査日、メモ等）を含める
5. The Site Survey Service shall PDFの2ページ目以降に写真とコメントの組み合わせを1ページあたり3組の形式で配置する
6. The Site Survey Service shall 各写真に紐付けられたコメントを当該写真と共にPDFに含める
7. The Site Survey Service shall 日本語を含むテキスト注釈を正しくレンダリングしてPDF出力する
8. When ユーザーがPDF生成完了後, the Site Survey Service shall PDFファイルをダウンロード可能にする

### Requirement 12: 個別画像エクスポート
**Objective:** As a 現場調査担当者, I want 個別の注釈付き画像をエクスポートできること, so that 報告書以外の用途にも利用できる

#### Acceptance Criteria
1. When ユーザーが個別画像のエクスポートボタンを押す, the Site Survey Service shall 注釈をレンダリングした画像を生成する
2. When ユーザーがエクスポート形式を選択する, the Site Survey Service shall JPEG、PNG形式でのエクスポートをサポートする
3. The Site Survey Service shall エクスポート画像の解像度（品質）を選択可能にする
4. The Site Survey Service shall 注釈なしの元画像もダウンロード可能にする
5. The Site Survey Service shall 日本語を含むテキスト注釈を正しくレンダリングしてエクスポートする

### Requirement 13: Undo/Redo機能
**Objective:** As a 現場調査担当者, I want 注釈編集操作を取り消し・やり直しできること, so that 誤操作を簡単に修正できる

#### Acceptance Criteria
1. When ユーザーがUndo操作を実行する, the Site Survey Service shall 直前の注釈操作を取り消す
2. When ユーザーがRedo操作を実行する, the Site Survey Service shall 取り消した操作を再実行する
3. When ユーザーがキーボードショートカット（Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z）を押す, the Site Survey Service shall Undo/Redoを実行する
4. The Site Survey Service shall 操作履歴を最大50件まで保持し、超過時は最古の履歴から削除する
5. When 注釈データを保存する, the Site Survey Service shall 操作履歴をクリアする

### Requirement 14: アクセス制御
**Objective:** As a システム管理者, I want 現場調査機能へのアクセスを制御できること, so that 適切な権限を持つユーザーのみが操作できる

#### Acceptance Criteria
1. While ユーザーがプロジェクトへのアクセス権を持つ, the Site Survey Service shall 当該プロジェクトの現場調査を閲覧可能にする
2. While ユーザーがプロジェクトへの編集権限を持つ, the Site Survey Service shall 現場調査の作成・編集・削除を許可する
3. If ユーザーが適切な権限を持たない, then the Site Survey Service shall 操作を拒否してエラーメッセージを表示する
4. When 画像URLへのアクセスリクエストがある, the Site Survey Service shall 署名付きURLの有効期限とアクセス権限を検証する
5. The Site Survey Service shall 現場調査の操作履歴を監査ログに記録する

### Requirement 15: レスポンシブ対応
**Objective:** As a 現場担当者, I want スマートフォンやタブレットでも現場調査機能を利用できること, so that 現場で直接操作できる

#### Acceptance Criteria
1. The Site Survey Service shall デスクトップ・タブレット・スマートフォンの各画面サイズに対応したUIを提供する
2. When タッチデバイスで操作する, the Site Survey Service shall タッチ操作に最適化された注釈ツールを提供する
3. The Site Survey Service shall モバイル環境でのカメラ連携による直接撮影をサポートする
4. While 注釈編集中, the Site Survey Service shall 一定間隔（30秒）で自動保存を実行する
5. When ページをリロードまたは再訪問した場合, the Site Survey Service shall ブラウザのlocalStorageから未保存の編集状態を復元する
6. If ネットワーク接続が切断される, then the Site Survey Service shall 警告を表示し保存操作をブロックする

### Requirement 16: 非機能要件
**Objective:** As a システム管理者, I want 現場調査機能が高いパフォーマンスと信頼性を持つこと, so that ユーザーがストレスなく利用できる

#### Acceptance Criteria
1. The Site Survey Service shall 画像一覧の初期表示を2秒以内に完了する
2. The Site Survey Service shall 注釈の描画・編集操作を60fps以上で応答する
3. The Site Survey Service shall 画像アップロード処理を5秒以内に完了する（300KB以下の場合）
4. The Site Survey Service shall 同時接続ユーザー100人以上をサポートする
5. The Site Survey Service shall 月間稼働率99.9%の可用性を維持する（計画メンテナンスを除く）
6. The Site Survey Service shall 全ての通信をHTTPS/TLSで暗号化する
7. The Site Survey Service shall 画像データを定期的にバックアップする
8. The Site Survey Service shall エラー発生時に適切なエラーメッセージを表示し、Sentryにログを送信する
