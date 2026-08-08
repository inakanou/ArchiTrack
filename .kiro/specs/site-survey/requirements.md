# Requirements Document

## Introduction
現場調査機能は、工事案件のプロジェクトに紐付く形で現場調査データを管理するための機能です。現場調査時に撮影した写真や図面に対して、寸法・マーキング・コメント等の注釈を追加し、工事計画の基礎資料として活用します。作成された注釈付き画像は、今後追加予定の数量表作成機能から参照されることを想定しています。

## Requirements

### Requirement 1: 現場調査CRUD操作
**Objective:** As a プロジェクト担当者, I want プロジェクトに紐付く現場調査を作成・編集・削除できること, so that 工事に必要な現場情報を体系的に管理できる

#### Acceptance Criteria
1. When ユーザーが現場調査作成フォームを表示する, the Site Survey Service shall 調査名欄にデフォルト値「現場調査」を設定する
2. When ユーザーが現場調査作成フォームを送信する, the Site Survey Service shall プロジェクトに紐付く新規現場調査レコードを作成する
3. When ユーザーが現場調査詳細画面を表示する, the Site Survey Service shall 現場調査の基本情報と関連する画像一覧を表示する
4. When ユーザーが現場調査情報を編集して保存する, the Site Survey Service shall 楽観的排他制御を用いて現場調査レコードを更新する
5. When ユーザーが現場調査を削除する, the Site Survey Service shall 現場調査と関連する画像データを論理削除する
6. If 同時編集による競合が検出される, then the Site Survey Service shall 競合エラーを表示して再読み込みを促す
7. While プロジェクトが存在しない, the Site Survey Service shall 現場調査の作成を許可しない

### Requirement 2: 画面遷移・ナビゲーション
**Objective:** As a プロジェクト担当者, I want 現場調査機能への画面遷移が分かりやすいこと, so that 目的の画面に迷わずたどり着ける

#### Acceptance Criteria
1. ~~→ project-management/Requirement 24 AC 1 に移動~~
2. ~~→ project-management/Requirement 24 AC 2 に移動~~
3. When ユーザーが現場調査一覧で項目をクリックする, the Site Survey Service shall 現場調査詳細画面に遷移する
4. When ユーザーが現場調査詳細画面で画像をクリックする, the Site Survey Service shall 画像ビューア/注釈エディタを開く
5. The Site Survey Service shall 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
6. When ユーザーが現場調査一覧画面を表示する, the Site Survey Service shall ブレッドクラムに「ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧」を表示する
7. When ユーザーが現場調査詳細画面を表示する, the Site Survey Service shall ブレッドクラムに「ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査」を表示する
8. When ユーザーが画像プレビュー画面（閲覧モード）を表示する, the Site Survey Service shall ブレッドクラムに「ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査 > 画像」を表示する
9. When ユーザーが画像プレビュー画面（編集モード）を表示する, the Site Survey Service shall ブレッドクラムに「ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査 > 画像」を表示する
10. When ユーザーがブレッドクラムの各項目をクリックする, the Site Survey Service shall 対応する画面に遷移する
11. The Site Survey Service shall 現場調査一覧画面の画面タイトルを「現場調査一覧」として表示する
12. The Site Survey Service shall 画像プレビュー画面（閲覧モード・編集モード共通）において「← 現場調査に戻る」リンクを表示しない

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
8. If R2ストレージからのオブジェクト削除に失敗する, then the Site Survey Service shall 孤立ファイルとして専用プレフィックス（orphaned/）に移動し、Object Lifecycle Ruleにより7日後に自動削除する
9. The Site Survey Service shall JPEG、PNG、WEBP形式の画像ファイルをサポートする
10. The Site Survey Service shall 画像一覧を固定の表示順序で表示する
11. When ユーザーが画像をドラッグアンドドロップする, the Site Survey Service shall 画像の表示順序を変更する（未保存状態になる）
12. When ユーザーが画像の「上へ移動」ボタンをクリックする, the Site Survey Service shall 当該画像を1つ上の位置に移動する（未保存状態になる）
13. When ユーザーが画像の「下へ移動」ボタンをクリックする, the Site Survey Service shall 当該画像を1つ下の位置に移動する（未保存状態になる）

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
5. When ユーザーが写真をマウスドラッグで移動する, the Site Survey Service shall 写真の表示順序を変更する（未保存状態になる）
6. When ユーザーが写真の「上へ移動」ボタンをクリックする, the Site Survey Service shall 当該写真を1つ上の位置に移動する（未保存状態になる）
7. When ユーザーが写真の「下へ移動」ボタンをクリックする, the Site Survey Service shall 当該写真を1つ下の位置に移動する（未保存状態になる）
8. The Site Survey Service shall 写真一覧を保存された表示順序の通りに表示する
9. When ユーザーが「保存」ボタンをクリックする, the Site Survey Service shall 各写真のコメント、報告書出力フラグ、表示順序の状態をデータベースに一括保存する
10. While 未保存の変更がある状態でユーザーがページを離れようとする, the Site Survey Service shall 確認ダイアログを表示して変更が失われることを警告する
11. When ユーザーが写真の削除ボタンをクリックする, the Site Survey Service shall 確認ダイアログを表示する
12. When ユーザーが削除確認ダイアログで削除を確定する, the Site Survey Service shall 当該写真と関連する注釈データを削除する

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
9. When PDFファイルがダウンロードされる, the Site Survey Service shall ファイル名を「現場調査報告書_YYYYMMDD.pdf」形式とする（YYYYMMDDは調査日）

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
7. If localStorageへの保存時にQuotaExceededErrorが発生する, then the Site Survey Service shall LRU（Least Recently Used）戦略で古いキャッシュを削除してリトライする
8. If QuotaExceededErrorのリトライ後も保存に失敗する, then the Site Survey Service shall ユーザーに警告を表示し、手動で「今すぐ保存」を促す
9. The Site Survey Service shall プライベートブラウジングモードでのlocalStorage制限（SecurityError）を検出し、自動保存機能を無効化して手動保存のみで動作する
10. The Site Survey Service shall localStorageのエラー検出にクロスブラウザ対応（code===22, code===1014, name===QuotaExceededError, name===NS_ERROR_DOM_QUOTA_REACHED）を実装する

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

### Requirement 17: 描画ツール使用中のオブジェクト選択防止
**Objective:** As a 現場調査担当者, I want 描画ツール使用中に既存オブジェクト上でも描画を継続できること, so that 既存の注釈と重なる位置にも自由に描画できる

#### Acceptance Criteria
1. When ユーザーが選択ツール以外の描画ツール（寸法線・矢印・円・四角形・多角形・折れ線・フリーハンド・テキスト）を使用中に既存オブジェクト上でマウスダウンする, the Site Survey Service shall 既存オブジェクトの選択を行わず描画操作を開始する
2. When ユーザーが選択ツールで既存オブジェクトをクリックする, the Site Survey Service shall 従来通りオブジェクトを選択状態にして編集可能にする
3. When ユーザーが描画ツールで描画中にマウスアップ位置が既存オブジェクト上にある, the Site Survey Service shall 描画した図形を正常に作成・確定する
4. When ユーザーが多角形・折れ線ツールで既存オブジェクト上の位置に頂点を追加する, the Site Survey Service shall 頂点の追加を正常に実行する
5. When ユーザーがテキストツールで既存オブジェクト上をクリックする, the Site Survey Service shall テキスト注釈を配置する
6. The Site Survey Service shall 描画ツール使用中はFabric.jsのオブジェクト選択機能を完全に無効化し、描画操作のみを受け付ける

### Requirement 18: PDF報告書出力時の写真リクエスト最適化
**Objective:** As a 現場調査担当者, I want PDF報告書出力時のAPIリクエスト数を最小化できること, so that 写真枚数が多い場合でも高速に報告書を生成できる

#### Acceptance Criteria
1. When フロントエンドが複数画像の注釈データを取得する必要がある, the Site Survey Service shall 一括注釈取得エンドポイント（バッチAPI）を提供し、単一リクエストで複数画像の注釈データを返却する
2. When ユーザーが調査報告書出力ボタンを押す, the Site Survey Service shall 個別の注釈取得リクエストではなくバッチ注釈取得エンドポイントを使用して注釈データを取得する
3. The Site Survey Service shall バッチ注釈取得エンドポイントにおいて、リクエストされた全画像IDに対応する注釈データをまとめて返却する
4. If バッチ注釈取得リクエストに含まれる画像IDに対応する注釈データが存在しない, then the Site Survey Service shall 当該画像IDに対して空の注釈データを返却する
5. The Site Survey Service shall PDF報告書出力時の合計APIリクエスト数を、従来のN件個別リクエスト方式と比較して大幅に削減する
6. When バッチ注釈取得エンドポイントにアクセスする, the Site Survey Service shall 当該現場調査に対するアクセス権限を検証する
7. If バッチ注釈取得リクエストが失敗する, then the Site Survey Service shall エラーメッセージを表示してユーザーに通知する
8. The Site Survey Service shall バッチ注釈取得エンドポイントの既存の個別注釈取得エンドポイントとのレスポンス形式の互換性を維持する

### Requirement 19: 画像アップロードバリデーション修正とエラー通知改善
**Objective:** As a 現場調査担当者, I want ICCプロファイル付きJPEGを含む全ての正規JPEGファイルをアップロードでき、アップロード失敗時にはエラーメッセージが表示されること, so that 現場で撮影した写真が形式の違いにより拒否されることなく登録でき、失敗時にも原因を把握して対処できる

#### Acceptance Criteria
1. When ユーザーがJPEGファイルをアップロードする, the Site Survey Service shall マジックバイトの先頭3バイト（FF D8 FF）のみでJPEG形式を判定する
2. When ユーザーがICCプロファイル付きJPEG（4バイト目が0xE2）をアップロードする, the Site Survey Service shall ファイルを正常に受け付けて保存する
3. When ユーザーがEXIF付きJPEG（4バイト目が0xE1）をアップロードする, the Site Survey Service shall ファイルを正常に受け付けて保存する
4. When ユーザーがJFIF形式JPEG（4バイト目が0xE0）をアップロードする, the Site Survey Service shall ファイルを正常に受け付けて保存する
5. When ユーザーがSOSマーカー付きJPEG（4バイト目が0xDA）をアップロードする, the Site Survey Service shall ファイルを正常に受け付けて保存する
6. When ユーザーがDQTマーカー付きJPEG（4バイト目が0xDB）をアップロードする, the Site Survey Service shall ファイルを正常に受け付けて保存する
7. If アップロードされたファイルの先頭3バイトがFF D8 FFでない, then the Site Survey Service shall JPEGとして認識せずアップロードを拒否する
8. The Site Survey Service shall PNG形式（先頭バイト: 89 50 4E 47）の検証を従来通り維持する
9. The Site Survey Service shall WEBP形式（先頭バイト: 52 49 46 46 + WEBP識別子）の検証を従来通り維持する
10. When バッチアップロード処理で1件以上のファイルアップロードが失敗する, the Survey Images API shall エラー情報を含む結果を呼び出し元に返却する
11. When バッチアップロード結果にエラーが含まれる, the Site Survey Detail Page shall ユーザーにエラーメッセージを表示する
12. When バッチアップロードで一部のファイルが成功し一部が失敗する, the Survey Images API shall 成功したファイルの処理結果を保持しつつ、失敗したファイルのエラー情報も返却する
13. When バッチアップロードで全てのファイルが失敗する, the Site Survey Detail Page shall 全件失敗を示すエラーメッセージを表示する
14. If アップロードエラーがファイル形式の不一致による拒否である, then the Site Survey Detail Page shall どのファイルがどの理由で拒否されたかを含むエラーメッセージを表示する
15. If アップロードエラーがサーバーエラーまたはネットワークエラーである, then the Site Survey Detail Page shall サーバーエラーが発生した旨のエラーメッセージを表示する
16. When 全てのファイルが正常にアップロードされる, the Site Survey Detail Page shall エラーメッセージを表示しない

### Requirement 20: 注釈のサムネイル・プレビュー表示
**Objective:** As a 現場調査担当者, I want 編集モードで追加した注釈がプレビュー画面やサムネイルにも反映されること, so that 注釈の内容を各画面で確認できる

#### Acceptance Criteria
1. When ユーザーが画像プレビュー画面（閲覧モード）を表示する, the Site Survey Service shall 保存済みの注釈をレンダリングした状態で画像を表示する
2. When ユーザーが現場調査詳細画面を表示する, the Site Survey Service shall 各画像のサムネイルに保存済みの注釈をレンダリングした状態で表示する
3. When ユーザーが現場調査一覧画面を表示する, the Site Survey Service shall 代表画像のサムネイルに保存済みの注釈をレンダリングした状態で表示する
4. When 注釈が編集モードで保存される, the Site Survey Service shall 注釈をレンダリングしたサムネイル画像を生成・更新する

### Requirement 21: 画像アップロード時の拡張子不一致許容
**Objective:** As a 現場調査担当者, I want ファイル拡張子と実際の画像形式が一致しなくてもアップロードできること, so that 拡張子が変更された画像ファイルでも問題なく現場写真を登録できる

#### Acceptance Criteria
1. When ユーザーがファイル拡張子と実際の画像形式（マジックバイト判定結果）が異なるファイルをアップロードする, the Site Survey Service shall マジックバイトによる画像形式判定結果がサポート対象形式（JPEG/PNG/WEBP）であればアップロードを許可する
2. When ユーザーが拡張子が`.png`だが実際の画像形式がJPEGであるファイルをアップロードする, the Site Survey Service shall マジックバイトによりJPEGと判定しアップロードを許可する
3. When ユーザーが拡張子が`.jpg`だが実際の画像形式がPNGであるファイルをアップロードする, the Site Survey Service shall マジックバイトによりPNGと判定しアップロードを許可する
4. When ユーザーが拡張子が`.jpeg`だが実際の画像形式がWEBPであるファイルをアップロードする, the Site Survey Service shall マジックバイトによりWEBPと判定しアップロードを許可する
5. When ユーザーが画像ファイル以外の拡張子（例: `.txt`, `.pdf`）だが実際の画像形式がサポート対象であるファイルをアップロードする, the Site Survey Service shall マジックバイトによる画像形式判定結果に基づきアップロードを許可する
6. If マジックバイトによる画像形式判定結果がサポート対象形式（JPEG/PNG/WEBP）のいずれにも該当しない, then the Site Survey Service shall ファイル拡張子に関わらずアップロードを拒否してエラーメッセージを表示する
7. The Site Survey Service shall アップロードされたファイルのContent-Typeをマジックバイトによる実際の画像形式に基づいて設定する
8. The Site Survey Service shall 拡張子ベースのバリデーションを行わず、マジックバイトによる画像形式判定のみでファイル形式の可否を決定する

### Requirement 22: 注釈エディタでの画像回転機能
**Objective:** As a 現場調査担当者, I want 注釈エディタ（編集モード）で画像を回転できること, so that 撮影時の向きが正しくない写真を編集中に補正して注釈を追加できる

#### Acceptance Criteria
1. When ユーザーが注釈エディタ（編集モード）で回転ボタンを押す, the Site Survey Service shall 背景画像を90度単位で回転する
2. When 注釈エディタで画像が回転される, the Site Survey Service shall 描画済みの注釈オブジェクトを回転に追従させず、現在の位置・サイズを維持する
3. When 注釈エディタで画像が回転される, the Site Survey Service shall 回転後の画像サイズに合わせてキャンバスのサイズを調整する
4. When ユーザーが回転操作後に保存ボタンを押す, the Site Survey Service shall 回転状態を含む画像データを永続化する
5. When ユーザーが回転済み画像を再度開く, the Site Survey Service shall 保存された回転状態を復元して表示する
6. When ユーザーが回転操作を行う, the Site Survey Service shall 回転操作をUndo/Redo履歴に記録する
7. The Site Survey Service shall 注釈エディタの回転ボタンを既存のツールバーに配置する
8. When ユーザーが注釈エディタで複数回回転操作を行う, the Site Survey Service shall 累積回転角度（0度/90度/180度/270度）を正しく管理する

### Requirement 23: 画像編集画面での変更に伴うサムネイル再生成の確実化
**Objective:** As a 現場調査担当者, I want 画像編集画面で行った画像変更（回転・注釈の追加/編集/削除）を保存した際に、サムネイルが変更後の最終状態で確実に再生成されること, so that 詳細画面や一覧画面で常に最新の画像状態を確認できる

#### Acceptance Criteria
1. When ユーザーが画像編集画面で注釈の追加・編集・削除を行い保存する, the Site Survey Service shall 保存後の注釈をレンダリングしたサムネイル画像を再生成する
2. When ユーザーが画像編集画面で画像を回転して保存する, the Site Survey Service shall 回転後の画像状態を反映したサムネイル画像を再生成する
3. When ユーザーが画像編集画面で回転と注釈編集の両方を行い保存する, the Site Survey Service shall 回転と注釈の両方を反映した最終状態のサムネイル画像を再生成する
4. When 画像編集画面の保存処理が完了する, the Site Survey Service shall サムネイル再生成処理の完了を保証してから保存完了とみなす
5. When サムネイル再生成が完了する, the Site Survey Service shall 現場調査詳細画面および現場調査一覧画面のサムネイル表示を最新の再生成結果に更新する
6. If サムネイル再生成処理に失敗する, then the Site Survey Service shall エラーメッセージを表示し、サムネイルが旧状態のまま残らないよう再試行または明示的なエラー状態を提示する
7. When ユーザーが保存後に画像編集画面を再度開く, the Site Survey Service shall 表示中のサムネイルが保存時に再生成された最新画像と一致することを保証する
8. The Site Survey Service shall 画像変更を伴わない保存操作（例: 変更なしの保存）でもサムネイル再生成処理が冪等に動作し、既存サムネイルを破損させない

### 追加範囲の境界補足（Requirements 24 以降）

Requirements 24 以降は、画像注釈の視認性向上（白縁取り表現）と、スマートフォン現場運用向けの描画操作性強化を対象とする。既存 Requirements 1〜23 の責務境界は維持する。

- **In scope**: 矢印・テキスト注釈の白縁取り/白アウトライン表現、白縁取り前提のデフォルトスタイル調整、ダブルタップ・長押しのタッチジェスチャー、モバイル向けツールバーレイアウト、ツール選択時の視覚フィードバック、マルチタッチ入力時の描画安全性
- **Out of scope**: 番号付きマーカー注釈、ハイライター（半透明マーカー）注釈、ぼかし/モザイク注釈、切り抜き/トリミング、注釈のコピー&ペースト、曲線（カーブ）矢印
- **Adjacent expectations**: 既存の Requirement 5（画像ビューア）、Requirement 7（マーキング図形）、Requirement 8（テキストコメント）、Requirement 13（Undo/Redo）、Requirement 15（レスポンシブ対応）、Requirement 17（描画ツール使用中のオブジェクト選択防止）の挙動は維持し、本追加範囲はこれらを拡張する形で成立する

### Requirement 24: 矢印注釈の白縁取り表示
**Objective:** As a 現場調査担当者, I want 画像の背景色や模様に関わらず矢印注釈を明確に視認できること, so that 暗い写真・明るい写真・柄のある図面のいずれでも矢印が埋もれずに判読できる

#### Acceptance Criteria
1. When ユーザーが矢印ツールで矢印注釈を描画する, the Site Survey Service shall 矢印本体線の両側に白色の縁取り線を付与して表示する
2. The Site Survey Service shall 矢印の白縁取り線幅を本体線幅の1.5倍以上の太さで付与し、本体色との境界を背景色に依らず視認可能にする
3. When ユーザーが矢印の本体色を変更する, the Site Survey Service shall 白縁取り部分の色は常に白のまま維持する
4. When ユーザーが矢印注釈を移動・リサイズ・回転する, the Site Survey Service shall 白縁取りを本体と同期して変形する
5. When ユーザーが矢印の描画設定を切り替える, the Site Survey Service shall 白縁取りの有効/無効をユーザーが任意に切替可能にする
6. When ユーザーが注釈を保存する, the Site Survey Service shall 白縁取り属性（有効/無効・縁取り幅）を注釈データに含めて永続化する
7. When ユーザーが保存済みの矢印注釈を再表示する, the Site Survey Service shall 保存された白縁取り属性を復元して表示する
8. When 注釈付き画像をサムネイル・プレビュー・PDF・個別エクスポートでレンダリングする, the Site Survey Service shall 編集画面と同一の白縁取り表現を適用する
9. If ユーザーが過去に白縁取り属性を持たずに保存した矢印注釈を表示する, then the Site Survey Service shall 当該注釈を白縁取りなしの従来表現のまま表示する（後方互換維持）
10. When ユーザーが白縁取りの有効化/無効化を切替える, the Site Survey Service shall その操作をUndo/Redo履歴に記録する

### Requirement 25: テキスト注釈の白アウトライン表示
**Objective:** As a 現場調査担当者, I want 背景色なしでもテキスト注釈を明確に視認できること, so that 明るい背景と暗い背景の両方で同一の注釈が判読できる

#### Acceptance Criteria
1. When ユーザーがテキスト注釈を配置する, the Site Survey Service shall 文字の外側に白色のアウトラインを付与して表示する
2. The Site Survey Service shall テキストの白アウトラインの有効/無効をユーザーが任意に切替可能にする
3. The Site Survey Service shall テキストの白アウトラインを、既存の背景色（Requirement 8）とは独立して設定可能にする
4. When ユーザーがテキスト色を変更する, the Site Survey Service shall 白アウトライン部分の色は常に白のまま維持する
5. When ユーザーがテキスト注釈のフォントサイズを変更する, the Site Survey Service shall 白アウトライン幅をフォントサイズの概ね10〜20%の比率で自動調整する
6. When ユーザーがテキスト注釈を編集・移動・リサイズする, the Site Survey Service shall 白アウトラインを本体と同期して更新する
7. When ユーザーが注釈を保存する, the Site Survey Service shall 白アウトライン属性（有効/無効・幅）を注釈データに含めて永続化する
8. When ユーザーが保存済みのテキスト注釈を再表示する, the Site Survey Service shall 保存された白アウトライン属性を復元して表示する
9. When 注釈付き画像をサムネイル・プレビュー・PDF・個別エクスポートでレンダリングする, the Site Survey Service shall 編集画面と同一の白アウトライン表現を適用する
10. If ユーザーが過去に白アウトライン属性を持たずに保存したテキスト注釈を表示する, then the Site Survey Service shall 当該注釈を白アウトラインなしの従来表現のまま表示する（後方互換維持）
11. When ユーザーが白アウトラインの有効化/無効化を切替える, the Site Survey Service shall その操作をUndo/Redo履歴に記録する
12. The Site Survey Service shall 日本語を含むマルチバイト文字に対しても白アウトラインを正しくレンダリングする

### Requirement 26: 注釈ツールのデフォルトスタイル調整
**Objective:** As a 現場調査担当者, I want 新規注釈のデフォルトスタイルが屋外現場写真でも視認できる初期値であること, so that 毎回色・線幅を手動調整せずとも十分な視認性が得られる

#### Acceptance Criteria
1. The Site Survey Service shall 矢印・寸法線・罫線系注釈の初期線幅を、モバイル画面でも明瞭に視認できる太さ（概ね3論理ピクセル以上）に設定する
2. The Site Survey Service shall 新規矢印・テキスト注釈の初期本体色を、白縁取り/白アウトラインと組み合わせた際に暗/明両方の背景で視認可能な有彩色（赤系またはオレンジ系）に設定する
3. When ユーザーが初回に矢印ツールまたはテキストツールを選択する, the Site Survey Service shall 白縁取り/白アウトラインが有効な初期状態でツールを起動する
4. When ユーザーが注釈ツールのスタイル（色・線幅・白縁取り有無等）を変更して注釈を描画する, the Site Survey Service shall 当該編集セッション内の同ツール再利用時に直前のスタイル設定を引き継ぐ
5. The Site Survey Service shall 各ツールの既定色・既定線幅・既定白縁取り有無を設定資材として一元管理する
6. When 既存の注釈エディタ設定にユーザーが明示的に選択した色・線幅が存在する, the Site Survey Service shall 当該セッション中はユーザー選択値を優先する

### Requirement 27: タッチジェスチャーによる注釈編集操作性向上
**Objective:** As a 現場担当者, I want スマートフォンの指操作のみで注釈の編集・複製・削除が行えること, so that 現場で手袋や片手操作でも注釈運用が完結する

#### Acceptance Criteria
1. When ユーザーが既存のテキスト注釈をタッチデバイスでダブルタップする, the Site Survey Service shall 当該テキスト注釈を編集モードに遷移させる
2. When ユーザーが既存の注釈オブジェクトをタッチデバイスで長押しする, the Site Survey Service shall 当該オブジェクトを選択状態に遷移させたうえで、編集・複製・削除を含むコンテキストメニューを表示する
3. When ユーザーがコンテキストメニューの各項目をタップする, the Site Survey Service shall 対応する操作（編集・複製・削除 等）を実行する
4. While コンテキストメニューが表示中, the Site Survey Service shall 背景画像への新規描画操作を受け付けない
5. When ユーザーがコンテキストメニュー外の領域をタップする, the Site Survey Service shall コンテキストメニューを閉じる
6. The Site Survey Service shall ダブルタップの有効タップ間隔を一般的なタッチUI慣習値（概ね300ms以内）、長押しの有効保持時間を同慣習値（概ね500ms以上）に設定する
7. When ユーザーが長押しまたはダブルタップで実行した操作（編集・複製・削除等）を行う, the Site Survey Service shall その操作をUndo/Redo履歴に記録する
8. When マウス環境でユーザーが既存のテキスト注釈をダブルクリックする, the Site Survey Service shall タッチジェスチャー導入後も従来通り編集モードへ遷移する（Requirement 8との後方互換を維持）
9. If ユーザーが描画ツール選択中に既存オブジェクトを長押しする, then the Site Survey Service shall Requirement 17 の「描画ツール使用中のオブジェクト選択防止」仕様を優先し、コンテキストメニューを表示しない
10. When ユーザーが選択ツール選択中に既存オブジェクトを長押しする, the Site Survey Service shall コンテキストメニューを表示する

### Requirement 28: モバイル向けツールバーレイアウト
**Objective:** As a 現場担当者, I want スマートフォン画面でも全ての注釈ツール・属性設定にアクセスできること, so that モバイル単独で注釈作業が完結する

#### Acceptance Criteria
1. When ユーザーがモバイル幅（概ね幅768px未満）の画面で注釈エディタを表示する, the Site Survey Service shall ツールバーの項目が画面幅に収まるようレイアウトする
2. If ツールバー項目が画面幅に収まらない, then the Site Survey Service shall 折返しまたはスクロール可能な領域として項目全てにアクセス可能にする
3. The Site Survey Service shall モバイル幅ツールバーの各項目のタップ領域を最小44x44論理ピクセル以上のサイズで提供する
4. When ユーザーが端末の向き（縦/横）を変更する, the Site Survey Service shall ツールバーのレイアウトを新しい画面幅に合わせて再構成する
5. The Site Survey Service shall モバイル幅であっても、デスクトップ幅で提供している注釈ツール・色・線幅・白縁取り設定・Undo/Redoの全操作にアクセス可能にする
6. When ユーザーがツールバー領域を操作する, the Site Survey Service shall ツールバー操作が背景画像への描画として誤って発火しないようにする
7. The Site Survey Service shall モバイル幅ツールバーの色ピッカー・線幅ピッカーを、タッチ操作で誤選択しにくい間隔で配置する
8. When ユーザーがツールバー上で現在選択中のツールをタップする, the Site Survey Service shall 選択状態を維持しつつ、利用可能な場合は当該ツールの詳細属性パネル（色・線幅・白縁取り有無等）を表示/非表示トグルする

### Requirement 29: ツール選択・操作時の視覚フィードバック
**Objective:** As a 現場担当者, I want 今どのツールがどの状態で選択されているかが一目で分かること, so that 誤ったツールで操作して注釈を破壊することがない

#### Acceptance Criteria
1. When ユーザーが注釈ツールを選択する, the Site Survey Service shall 選択中ツールをツールバー上で視覚的にハイライト表示する
2. While ユーザーが特定の注釈ツールを選択中, the Site Survey Service shall 当該ツール用のカーソル表現（マウス環境）またはタッチ時のガイド表示（タッチデバイス）を画像領域上で提供する
3. When ユーザーが描画操作を開始する, the Site Survey Service shall 描画中の仮表示（プレビュー）を画像上に表示する
4. When ユーザーがタッチデバイスで注釈オブジェクトを選択する, the Site Survey Service shall 選択中オブジェクトのハンドルを、タップで操作可能な標準タッチターゲットサイズ（最小44x44論理ピクセル以上。Requirement 28.3 と整合）で表示する
5. The Site Survey Service shall 選択中オブジェクトのハンドルサイズを、タッチ操作時（拡大）とマウス操作時（通常）で切替える
6. Where 初見で用途が分かりにくいツール項目がある, the Site Survey Service shall ツールバー項目のツールヒント（名称・短い説明）をマウスホバーまたは長押しで表示する
7. When ユーザーがツールを選択後、一定時間内に描画操作を開始しない, the Site Survey Service shall 選択中ツールに対する簡易ガイド（例: 「ドラッグで描画」「タップでテキスト入力」等）を画像領域に非侵襲的に提示する
8. The Site Survey Service shall 視覚フィードバック要素（ハイライト・カーソル・プレビュー・ハンドル・ツールヒント・簡易ガイド）がコンテキストメニュー表示中およびマルチタッチ入力中でも互いに競合しないよう制御する

### Requirement 30: マルチタッチ入力の安全性
**Objective:** As a 現場担当者, I want タッチ操作中に複数本の指が触れても注釈が破壊されないこと, so that ピンチズーム/パン中の意図しない描画発火や注釈崩壊を回避できる

#### Acceptance Criteria
1. When ユーザーが画面に2本指でタッチする, the Site Survey Service shall 進行中の描画操作を中断し、ピンチズーム/パンモード（Requirement 5, 15）に遷移する
2. If ユーザーが3本以上の指を同時にタッチする, then the Site Survey Service shall 新規描画操作を受け付けず、全ての指が離れるまで描画コミットを抑止する
3. When ユーザーがマルチタッチ中に指を1本残して他の指を離す, the Site Survey Service shall 描画再開を短時間（誤タップ抑止のため概ね150ms以上）抑止する
4. If マルチタッチ中に描画操作が誤発火した場合, then the Site Survey Service shall Undoによる即時復旧を可能にする（当該誤発火分を1ステップで取り消せる）
5. When 描画ツール使用中にマルチタッチが発生する, the Site Survey Service shall Requirement 17 の「描画ツール使用中のオブジェクト選択防止」仕様を維持する
6. While マルチタッチ入力中, the Site Survey Service shall Requirement 5 のピンチズーム・パン操作の従来挙動を阻害しない
7. When マルチタッチから1本指に戻り描画再開が許可される, the Site Survey Service shall 直前のピンチ/パンによるビュー状態（ズーム倍率・表示位置）を維持したまま描画を再開する
8. The Site Survey Service shall マルチタッチ中に誤って描画確定されないよう、描画コミット条件（単一指のドラッグ継続）を内部判定基準として維持する

### 追加範囲の境界補足（Requirements 31 以降）

Requirements 31 以降は、現場調査画像の一括エクスポートと、白縁取り対象形状の全形状拡張を対象とする。既存 Requirements 1〜30 の責務境界は維持する。

- **In scope**: 1 現場調査配下の全画像または選択画像をまとめて単一の ZIP ファイルとしてエクスポートする機能、寸法線・円・四角形・多角形・折れ線・フリーハンド注釈に対する白縁取り表現の拡張（Requirement 24 の矢印・Requirement 25 のテキストと同等仕様）
- **Out of scope**: 一括エクスポートにおける PDF 単一ファイル出力（既存 Requirement 11 のスコープを維持）、ブラウザの個別ダウンロードを連続発火する疑似一括方式、白縁取り対象形状ごとの個別カスタマイズパラメータ化（縁取り幅倍率の形状別調整等）、一括エクスポート進捗の永続化・中断レジューム
- **Adjacent expectations**: 既存の Requirement 12（個別画像エクスポート）の設定仕様と単一画像レンダリング基盤を再利用する前提で成立する。Requirement 24（矢印の白縁取り）および Requirement 25（テキストの白アウトライン）の振る舞いを参照仕様として、白縁取り対象を 6 形状に拡張する形で成立する。Requirement 13（Undo/Redo）、Requirement 14（アクセス制御）、Requirement 20（注釈サムネイル・プレビュー）、Requirement 23（サムネイル再生成）、Requirement 26（既定スタイル一元管理）の挙動は維持する

### Requirement 31: 現場調査画像の一括エクスポート

**Objective:** As a 現場調査担当者, I want 現場調査内の全画像または選択した複数画像を一括でエクスポートできること, so that 数十枚規模の現場写真を 1 枚ずつ操作することなく報告書以外の用途にも配布・保存できる

#### Acceptance Criteria

1. When ユーザーが現場調査詳細画面で「全件一括エクスポート」操作を実行する, the Site Survey Service shall 当該現場調査配下の全画像を対象として一括エクスポートを開始する
2. When ユーザーが画像一覧で 1 件以上の画像を選択した状態で「選択画像エクスポート」操作を実行する, the Site Survey Service shall 選択された画像のみを対象として一括エクスポートを開始する
3. While ユーザーが画像を 1 件も選択していない, the Site Survey Service shall 「選択画像エクスポート」操作を非活性として表示する
4. When ユーザーが一括エクスポートを開始する, the Site Survey Service shall Requirement 12 と同一のエクスポート設定（画像形式（JPEG/PNG）、解像度（品質）、注釈含む/含まない、元画像そのまま出力）をユーザーに選択させる
5. When ユーザーが一括エクスポート設定を確定する, the Site Survey Service shall 選択された設定を対象画像すべてに一括適用してエクスポート処理を実行する
6. The Site Survey Service shall 一括エクスポートにおける個別画像レンダリング（注釈描画、形式変換、解像度変換）に Requirement 12 と同一のレンダリング仕様を適用する
7. When 一括エクスポート処理が完了する, the Site Survey Service shall 対象画像群を単一の ZIP ファイルにまとめてダウンロード可能にする
8. The Site Survey Service shall ZIP 内に含まれる各画像ファイル名規則を Requirement 12 の個別画像エクスポートと整合する命名規則に統一する
9. The Site Survey Service shall ZIP ファイル名を、現場調査名と一括エクスポート実行日時を識別可能な形式で生成する
10. While 一括エクスポート処理が進行中, the Site Survey Service shall 処理の進捗状況（処理中の件数または全体に対する割合）をユーザーに可視化する
11. While 一括エクスポート処理が進行中, the Site Survey Service shall ユーザーが当該処理をキャンセル可能にする
12. If ユーザーが一括エクスポートをキャンセルする, then the Site Survey Service shall 進行中の処理を中断し ZIP ファイルを生成しない
13. If 一括エクスポート対象に含まれる一部の画像のレンダリングまたは取得が失敗する, then the Site Survey Service shall どの画像がどの理由で失敗したかを明示するエラー情報をユーザーに通知する
14. When 一括エクスポート対象に一部失敗が発生する, the Site Survey Service shall 成功した画像分のみを含む ZIP を取得するか処理を中止するかをユーザーが選択可能にする
15. If 一括エクスポート対象画像が 0 件である, then the Site Survey Service shall 対象画像が存在しない旨を通知し ZIP を生成しない
16. When ユーザーが一括エクスポートを実行する, the Site Survey Service shall Requirement 14 のアクセス制御を適用し、当該現場調査へのアクセス権限を検証する
17. The Site Survey Service shall 一括エクスポートにおいて「注釈含む」設定時に、Requirement 24・Requirement 25 および Requirement 32 の白縁取り表現を編集画面と同一に適用する
18. The Site Survey Service shall 一括エクスポートにおいて「元画像そのまま出力」設定時に、注釈・回転・サムネイル再生成結果を反映せず、アップロード時の原本画像を出力する
19. When 一括エクスポートが完了またはキャンセルされる, the Site Survey Service shall 当該処理のために生成した一時ファイル等の中間生成物を残存させない

### Requirement 32: マーキング図形・寸法線・フリーハンド注釈の白縁取り表示

**Objective:** As a 現場調査担当者, I want 矢印・テキスト以外の注釈（寸法線・円・四角形・多角形・折れ線・フリーハンド）についても白縁取りで視認可能にできること, so that 任意背景の現場写真上で全ての注釈が背景に埋もれず判読できる

#### Acceptance Criteria

1. When ユーザーが寸法線・円・四角形・多角形・折れ線・フリーハンドの各ツールで注釈を描画する, the Site Survey Service shall 当該注釈本体線の外側に白色の縁取り線を付与して表示する
2. The Site Survey Service shall 寸法線・円・四角形・多角形・折れ線・フリーハンドの白縁取り線幅を本体線幅の 1.5 倍以上の太さで付与し、本体色との境界を背景色に依らず視認可能にする
3. When ユーザーがいずれかの対象注釈の本体色を変更する, the Site Survey Service shall 白縁取り部分の色は常に白のまま維持する
4. When ユーザーがいずれかの対象注釈を移動・リサイズ・回転・形状変形（端点移動・頂点追加/削除等）する, the Site Survey Service shall 白縁取りを本体と同期して変形する
5. When ユーザーが対象注釈の描画設定を切り替える, the Site Survey Service shall 白縁取りの有効/無効をユーザーが任意に切替可能にする
6. When ユーザーが対象注釈を保存する, the Site Survey Service shall 白縁取り属性（有効/無効・縁取り幅）を注釈データに含めて永続化する
7. When ユーザーが保存済みの対象注釈を再表示する, the Site Survey Service shall 保存された白縁取り属性を復元して表示する
8. When 注釈付き画像をサムネイル・プレビュー・PDF・個別エクスポート・一括エクスポート（Requirement 31）でレンダリングする, the Site Survey Service shall 編集画面と同一の白縁取り表現を対象注釈に対しても適用する
9. If ユーザーが過去に白縁取り属性を持たずに保存した対象注釈を表示する, then the Site Survey Service shall 当該注釈を白縁取りなしの従来表現のまま表示する（後方互換維持）
10. When ユーザーが白縁取りの有効化/無効化を切替える, the Site Survey Service shall その操作を Undo/Redo 履歴に記録する
11. When ユーザーが初回に対象ツール（寸法線・円・四角形・多角形・折れ線・フリーハンドのいずれか）を選択する, the Site Survey Service shall 白縁取りが有効な初期状態でツールを起動する
12. The Site Survey Service shall 寸法線注釈の寸法値ラベルに対しても、Requirement 25 のテキスト白アウトラインと同等の白アウトライン表現を適用する
13. The Site Survey Service shall 各対象ツールの既定白縁取り有無を、Requirement 26 の設定資材一元管理の枠組みで管理する
14. When ユーザーが画像編集画面で対象注釈を編集して保存する, the Site Survey Service shall Requirement 23 に従って白縁取りを含む最終状態を反映したサムネイルを再生成する

### 追加範囲の境界補足（Requirements 33 以降）

Requirements 33 以降は、スマートフォンでの注釈編集操作性を業界標準に準拠させる抜本改善を対象とする。準拠する参照標準は、Apple Human Interface Guidelines（標準ジェスチャー・ダブルタップ拡大・直接操作）、Material Design（direct manipulation・タッチターゲット）、WCAG 2.5.5 / プラットフォーム標準（タッチターゲット最小44論理ピクセル）、および描画アプリのデファクト操作モデル（1本指=描画・2本指=ズーム&パン）である。既存 Requirements 1〜32 の責務境界は維持する。本範囲は、Requirement 5（画像ビューア）・Requirement 27（タッチジェスチャー）・Requirement 30（マルチタッチ安全性）が前提としていた「注釈編集モードでのピンチズーム/パン」を、編集モード自体の一級機能として明示し検証可能（testable）にするものである。

- **In scope**: 注釈編集モードにおける2本指ピンチズーム・2本指パンと1本指描画の同時両立、ピンチ中点を基準とした拡大/縮小、編集モード上のズーム操作手段（ズームイン/アウト・全体表示・現在倍率表示）、ダブルタップによる拡大/全体表示トグル、タッチ時の注釈選択・移動の確実性向上、選択ハンドルのタッチターゲット標準準拠（Requirement 29.4 の改訂を含む）
- **Out of scope**: 注釈の自由角度回転（既存の90度単位画像回転＝Requirement 22 を維持）、無限キャンバス化、キャンバスの自由回転ジェスチャー、スタイラス筆圧対応、編集モードのビュー状態のサーバー永続化（Requirement 5.6 のクライアント内共有を維持）、ジェスチャー入力処理の内部実装統合方針（設計フェーズで扱う）
- **Adjacent expectations**: Requirement 5（画像ビューアの拡大・縮小・回転・パン・ピンチ仕様）、Requirement 5.6（表示状態の編集モード共有）、Requirement 15（レスポンシブ）、Requirement 27（タッチジェスチャー編集）、Requirement 30（マルチタッチ安全性）を前提・参照仕様として成立する。Requirement 13（Undo/Redo）、Requirement 17（描画ツール使用中の選択防止）、Requirement 28（モバイル向けツールバー）、Requirement 29（視覚フィードバック）の挙動は維持する

### Requirement 33: 注釈編集モードでのピンチズーム・パンと描画ジェスチャーの両立

**Objective:** As a 現場担当者, I want スマートフォンの注釈編集モードでも画像を拡大したまま正確に描画でき、指の本数で描画とズーム/パンを直感的に切り替えられること, so that 細部への注釈付けを現場のスマホ操作だけで完結できる

#### Acceptance Criteria
1. When ユーザーが注釈編集モードで描画ツール選択中に画像領域を1本指でドラッグする, the Site Survey Service shall 選択中の描画ツールによる描画操作として扱う
2. When ユーザーが注釈編集モードで画像領域を2本指でピンチする, the Site Survey Service shall 画像のズーム倍率を変更する
3. When ユーザーが注釈編集モードで2本指ピンチによりズームする, the Site Survey Service shall 2本指の中点位置を基準に拡大/縮小する
4. When ユーザーが注釈編集モードで2本指をドラッグする, the Site Survey Service shall 表示領域をパン（移動）する
5. When ユーザーが描画操作の途中で2本目の指を追加する, the Site Survey Service shall 進行中の描画を確定せず中断し、ピンチズーム/パン操作へ遷移する（Requirement 30.1 と整合）
6. While 画像が拡大表示されている, the Site Survey Service shall 1本指ドラッグによる描画を、拡大後の座標系に正しく対応した位置へ反映する
7. When ユーザーがマルチタッチによるズーム/パン後に1本指描画へ戻る, the Site Survey Service shall 直前のズーム倍率・表示位置を維持したまま描画を再開する（Requirement 30.7 と整合）
8. When ユーザーが注釈編集モードで画像領域をダブルタップする, the Site Survey Service shall 拡大表示と全体表示（フィット）をトグルで切り替える
9. The Site Survey Service shall 注釈編集モードのズーム可能範囲を画像ビューア（Requirement 5）と一貫した範囲で提供する
10. The Site Survey Service shall 注釈編集モードと閲覧モードとの間でズーム・パンのタッチジェスチャー操作体系を一貫させる
11. When ユーザーが選択ツール選択中にタッチで既存注釈をタップする, the Site Survey Service shall 当該注釈を選択状態にする
12. When ユーザーが選択ツール選択中にタッチで選択中注釈をドラッグする, the Site Survey Service shall 当該注釈を移動し、拡大表示中も指の移動に追従させる
13. While 描画ツールを選択中, the Site Survey Service shall 1本指ドラッグを描画として扱い、既存注釈の移動・選択として誤発火させない（Requirement 17 と整合）

### Requirement 34: 注釈編集モードのズーム操作手段と倍率フィードバック

**Objective:** As a 現場担当者, I want 注釈編集モード上で現在の倍率を確認し、ボタン操作でも拡大・縮小・全体表示できること, so that ピンチが難しい場面でも確実にズームを制御でき、現在の拡大状態を把握できる

#### Acceptance Criteria
1. The Site Survey Service shall 注釈編集モードに、ズームイン・ズームアウト・全体表示（フィット）の操作手段を提供する
2. The Site Survey Service shall 注釈編集モードに、現在のズーム倍率を示す視覚的表示を提供する
3. When ユーザーがズームイン/ズームアウト操作を行う, the Site Survey Service shall 倍率表示を最新のズーム倍率に更新する
4. When ユーザーが全体表示（フィット）操作を行う, the Site Survey Service shall 画像全体が表示領域に収まる倍率に戻し、パン位置を初期化する
5. The Site Survey Service shall ズーム操作手段の各タップ領域を最小44x44論理ピクセル以上で提供する（Requirement 28.3 と整合）
6. When ユーザーがモバイル幅で注釈編集モードを表示する, the Site Survey Service shall ズーム操作手段を画面下部など片手のタッチで届きやすい領域に配置する
7. While 画像が等倍（フィット）で表示されている, the Site Survey Service shall パン操作を抑止し、ズーム時のみパンを有効として扱う（Requirement 5.4 と整合）
8. When ユーザーがズーム操作手段を操作する, the Site Survey Service shall 当該操作が背景画像への描画として誤って発火しないようにする（Requirement 28.6 と整合）

### 追加範囲の境界補足（Requirements 35 以降）

Requirements 35〜36 は、スマートフォン実機の狭幅ビューポートで発生している「現場調査詳細画面（写真＋コメント）の横方向はみ出し・表示崩れ」および「画像編集（注釈エディタ）の作業領域が過小になる問題」を是正する。準拠する参照標準は、WCAG 2.2 Success Criterion 2.5.8 Target Size (Minimum)（タッチターゲット最小24 CSS ピクセル）および 2.5.5 Target Size (Enhanced)（推奨44 CSS ピクセル）、CSS の動的ビューポート単位（small/dynamic viewport height によるモバイル全画面高の適正化）、およびモバイルWebフォームのデファクト（入力欄フォントサイズ16 CSS ピクセル以上によるモバイルブラウザのフォーカス時自動ズーム抑止）である。既存 Requirements 1〜34 の責務境界は維持し、本範囲は Requirement 10（写真一覧管理）・Requirement 15（レスポンシブ対応）・Requirement 34（ズーム操作手段・フィット）が定めた挙動の未達・曖昧箇所を、検証可能（testable）な受入基準として具体化するものである。

- **In scope**: 現場調査詳細画面のモバイル幅における縦積みレイアウトと水平方向のはみ出し防止、写真・コメント入力欄・報告書出力フラグ・並び替え/削除操作の可読な配置、入力系フォントサイズの下限、注釈エディタ初期表示のフィットと作業領域の確保（狭幅で過小にならない）、画像編集・閲覧領域の高さの動的ビューポート追従、モバイル幅でのツールバーの縦占有抑制
- **Out of scope**: デスクトップ幅レイアウトの変更（現行維持）、注釈エディタのズーム/パン操作体系そのもの（Requirement 33/34 を維持）、新規タッチジェスチャーの追加、PDF報告書の出力レイアウト（Requirement 11）、カメラ直接撮影連携（Requirement 15.3 を維持）、具体的なCSS実装手法・ブレークポイント設計の内部方針（設計フェーズで扱う）
- **Adjacent expectations**: Requirement 10（写真ごとのコメント・報告書出力フラグ・並び替え・一括保存・離脱警告の挙動を維持）、Requirement 15（レスポンシブ対応全般）、Requirement 28（モバイル向けツールバーレイアウト）、Requirement 33（ピンチズーム/パンと描画の両立）、Requirement 34（ズーム操作手段・フィット・倍率表示）を前提・参照仕様として成立し、これらの機能挙動は維持する

### Requirement 35: 現場調査詳細画面のスマートフォン表示最適化

**Objective:** As a 現場担当者, I want スマートフォンでも現場調査詳細画面（写真とコメント）が崩れず操作できること, so that 現場のスマートフォンだけで写真ごとのコメント入力と報告書出力設定を完結できる

#### Acceptance Criteria
1. When ユーザーがモバイル幅（概ね幅768px未満、Requirement 28.1 と整合）で現場調査詳細画面を表示する, the Site Survey Service shall 各写真の写真・コメント入力欄・報告書出力フラグ・並び替え/削除操作を、水平方向にあふれない配置（縦積みを含む）で表示する（Requirement 10 の情報項目を維持する）
2. While モバイル幅で現場調査詳細画面を表示している, the Site Survey Service shall ページ全体で水平スクロール（コンテンツ幅がビューポート幅を超える状態）を発生させない
3. The Site Survey Service shall モバイル幅における写真の表示幅を画面幅に収まるよう可変とし、固定幅に起因する見切れ・はみ出しを発生させない
4. The Site Survey Service shall コメント入力欄を含む入力系コントロールのフォントサイズを16 CSS ピクセル以上で表示し、フォーカス時の意図しない自動ズームを回避する
5. The Site Survey Service shall モバイル幅で表示する操作系コントロール（報告書出力フラグのチェックボックス、並び替え・削除ボタン等）のタップ領域を最小44x44論理ピクセル以上で提供する（Requirement 28.3 と整合）
6. When ユーザーがモバイル幅で写真ごとのコメント入力・報告書出力フラグ・並び替え・保存を操作する, the Site Survey Service shall Requirement 10 の各機能挙動（未保存状態管理・一括保存・離脱警告を含む）を維持する
7. The Site Survey Service shall デスクトップ幅における現場調査詳細画面の既存レイアウトおよび操作挙動を維持する

### Requirement 36: 画像編集（注釈エディタ）のモバイル表示領域最適化

**Objective:** As a 現場担当者, I want スマートフォンの画像編集画面で画像と作業領域が十分な大きさで表示されること, so that 画像の拡大や注釈の描き込みを狭い作業領域に妨げられず行える

#### Acceptance Criteria
1. When ユーザーがモバイル幅で画像編集（注釈エディタ）を表示する, the Site Survey Service shall 画像を、利用可能な表示領域（ツールバー等を除いた画像表示可能領域）の幅または高さに収まる最大倍率（フィット）で初期表示する
2. When 対象画像の原寸が利用可能な表示領域より小さい, the Site Survey Service shall 画像をフィット倍率まで拡大して表示し、原寸で頭打ちにして極端に小さく表示しない
3. The Site Survey Service shall モバイル幅における画像作業領域（ツールバー等を除いた画像表示可能領域）の短辺を、画面短辺の概ね50%以上確保する
4. The Site Survey Service shall 画像編集および画像閲覧の表示領域の高さを、モバイルブラウザのアドレスバー等の可変UIに追従する形で算出し、実表示可能高さを超えるはみ出し・ガタつきを発生させない
5. While モバイル幅で画像編集を表示している, the Site Survey Service shall ツールバーが縦方向の表示領域を過度に占有せず、画像の作業領域を優先して確保する
6. While モバイル幅で画像編集を表示している, the Site Survey Service shall ページ全体で水平スクロール（コンテンツ幅がビューポート幅を超える状態）を発生させない
7. The Site Survey Service shall 画像編集画面のヘッダー・パンくず等の固定または重畳する要素が、画像作業領域や操作要素と視覚的に重ならないよう配置する
8. The Site Survey Service shall 本要件の表示領域最適化を、Requirement 33（ピンチズーム/パンと描画の両立）および Requirement 34（ズーム操作手段・フィット・倍率表示）の挙動を維持したまま提供する

### Requirement 37: アップロード失敗時の撮影画像の保持と再送

**Objective:** As a 現場調査担当者, I want 画像アップロードが失敗しても撮影・選択した画像が画面に保持され、その場で再送できること, so that 通信状態や認証状態に起因する失敗のたびに現場で写真を撮り直さずに済む

- **In scope**: 現場調査詳細画面を表示している間の未送信画像の保持と再送、未送信画像の内容確認（サムネイル・ファイル名・失敗理由）と明示的な破棄、再送しても解消しない失敗の区別と提示、認証の有効期限切れによる失敗からの無操作での復帰、一時的な通信障害からの自動再試行、重複登録を避けるための自動再試行の抑制、画像1件あたりの送信完了猶予
- **Out of scope**: 画面リロード・タブ再起動・アプリ切り替えをまたぐ端末ローカルへの永続保存と復旧、オフライン中の自動キュー送信、サーバー側の受入上限（件数・サイズ・形式）の変更、Requirement 19 が定める失敗通知の文言体系
- **Adjacent expectations**: Requirement 4（アップロード・バッチ処理・圧縮の挙動を維持する）、Requirement 19（失敗の通知は引き続き Requirement 19 が所管し、本要件は保持と再送のみを規定する）、Requirement 15.3（カメラ連携による直接撮影を前提とする）、ユーザー認証機能（セッションの有効期限管理と、セッション切れをユーザーへ通知する手段を提供することを期待する）

#### Acceptance Criteria
1. When 画像アップロードで1件以上の画像が失敗する, the Site Survey Service shall 失敗した画像を未送信画像として画面に保持する
2. While 未送信画像が保持されている, the Site Survey Service shall 未送信画像の件数と、各画像のサムネイル・ファイル名・失敗理由を表示する
3. While 未送信画像が保持されている, the Site Survey Service shall 保持中の画像のうち再送可能なものをまとめて再送する操作手段を提供する
4. When ユーザーが再送を実行する, the Site Survey Service shall 保持中の画像のみを送信対象とし、初回送信時と同一の画像データを送信することで再圧縮による画質の再劣化を発生させない
5. When 再送で一部の画像が成功する, the Site Survey Service shall 成功した画像を未送信画像から取り除き、失敗した画像のみを保持し続ける
6. When 再送で全ての画像が成功する, the Site Survey Service shall 未送信画像の表示を解消する
7. While 未送信画像が保持されている, the Site Survey Service shall 保持中の画像を破棄する操作手段を提供する
8. When ユーザーが未送信画像の破棄を実行する, the Site Survey Service shall 破棄の確認をユーザーに求め、承諾された場合にのみ保持中の画像を解放する
9. While 未送信画像が保持されている, when ユーザーが新たなファイル選択またはカメラ撮影を行う, the Site Survey Service shall 既存の未送信画像を保持したまま新規画像のアップロードを実行する
10. While アップロードまたは再送の処理が実行中である, the Site Survey Service shall 追加の再送操作を受け付けない
11. If 画像アップロードが認証の有効期限切れにより失敗する, then the Site Survey Service shall ユーザーに再ログインを要求せずに認証を更新し、当該アップロードを継続する
12. If 認証の更新に失敗する, then the Site Survey Service shall 他機能と同一の手段でセッション切れをユーザーに通知する
13. If 画像アップロードがサーバーの処理に到達する前の通信障害または応答不能により失敗する, then the Site Survey Service shall 待機間隔を段階的に延ばしながら自動的に再試行する
14. If 画像アップロードがサーバーの処理中の失敗により終了する, then the Site Survey Service shall 同一画像が重複登録されることを避けるため自動再試行を行わず、当該画像を未送信画像として保持する
15. The Site Survey Service shall 画像1件あたりの送信に少なくとも120秒の完了猶予を与え、モバイル回線での送信を時間切れで打ち切らない
16. If 画像の失敗理由が、サーバーの受入条件（サイズ上限・画像形式）を満たさないことによる確定的な拒否である, then the Site Survey Service shall 当該画像を再送不可として区別し、再送しても解消しない旨とその理由をユーザーに提示する
17. While 再送不可と区別された画像が保持されている, the Site Survey Service shall 当該画像を再送の対象に含めず、破棄の操作手段のみを提供する
18. When 保持中の画像が全て再送不可である, the Site Survey Service shall 再送の操作手段を実行不可の状態で提示する
19. If 画像アップロードが送信の時間切れにより終了する, then the Site Survey Service shall 自動再試行を行わず、当該画像を未送信画像として保持し、ユーザーの操作による再送に委ねる
20. While 未送信画像の再送が可能である, the Site Survey Service shall 1件あたりの送信が時間切れとなってから、ユーザーが再送を開始できる状態になるまでの待ち時間を、自動再試行の繰り返しによって延伸させない
21. If ストレージへの保存失敗または画像処理の失敗により個別の画像の登録が失敗する, then the Site Survey Service shall 当該画像を再送可能な未送信画像として保持する
