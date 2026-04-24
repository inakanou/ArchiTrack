# Implementation Plan

## Task Overview

現場調査機能の実装タスク一覧です。全20要件をカバーし、データベース層からバックエンド、フロントエンド、統合テストまで段階的に実装します。

本計画は、以下の新規/更新要件を反映して再生成されました:
1. プロジェクト詳細画面の現場調査セクション - 直近2件+総数表示（要件2.1）
2. 画像削除機能（要件4.7、10.11、10.12）
3. 保存方式変更 - オートセーブからボタン保存+ページ離脱警告へ（要件9.1、9.3、10.9、10.10）
4. ナビゲーション削除 - ブレッドクラムのみに統一
5. R2孤立ファイル処理 - orphaned/プレフィックス+Lifecycle Rule（要件4.8）
6. localStorage QuotaExceededError対応 - LRU戦略、プライベートモード対応（要件15.7-15.10）
7. 画像順序変更 - ドラッグ&ドロップ、上へ/下へボタン、ローカル状態管理、保存時一括更新（要件4.10-4.13、10.5-10.9）
8. ブレッドクラムナビゲーション更新 - 全画面で「ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査 > 画像」階層に統一（要件2.5-2.10）
9. 画面タイトル変更 - 一覧画面を「現場調査一覧」に変更（要件2.11）
10. 戻るリンク削除 - 画像プレビュー画面から「← 現場調査に戻る」リンクを削除（要件2.12）
11. 注釈のサムネイル・プレビュー表示 - サーバーサイドサムネイル生成+クライアントサイドフォールバック（要件20.1-20.4）
12. 画像アップロード時の拡張子不一致許容 - マジックバイトのみで形式判定、拡張子・MIMEタイプチェック廃止（要件21.1-21.8）
13. 注釈エディタでの画像回転機能 - 90度単位回転、描画済み注釈非追従、Undo/Redo対応（要件22.1-22.8）

---

## Tasks

### Phase 1: データベース基盤

- [x] 1. データベーススキーマの実装
- [x] 1.1 (P) 現場調査・画像・注釈のPrismaモデルを定義する
  - SiteSurvey、SurveyImage、ImageAnnotationの3モデルを追加
  - プロジェクトとの関連付け（外部キー制約）を設定
  - インデックス（projectId、surveyDate、deletedAt、displayOrder）を定義
  - カスケード削除の設定を行う
  - _Requirements: 1.1, 1.4, 1.6_

- [x] 1.2 マイグレーションを作成・適用する
  - Prismaマイグレーションファイルを生成
  - 開発環境・テスト環境への適用を確認
  - 1.1の完了後に実行
  - _Requirements: 1.1_

### Phase 2: ストレージ基盤

- [x] 2. Cloudflare R2ストレージ統合
- [x] 2.1 (P) R2クライアント設定を実装する
  - S3Clientのシングルトン初期化を実装
  - 環境変数（R2_ENDPOINT、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY、R2_BUCKET_NAME）の設定
  - 接続テストユーティリティを追加
  - _Requirements: 4.1, 14.6_

- [x] 2.2 (P) 署名付きURL生成・検証機能を実装する
  - getSignedUrlによる一時的なアクセスURL生成（有効期限15分）
  - オリジナル画像用とサムネイル用の両方に対応
  - 署名付きURLの有効期限検証機能
  - リクエストユーザーのプロジェクトアクセス権限検証機能
  - _Requirements: 4.1, 12.4, 14.6_

### Phase 3: バックエンドサービス層

- [x] 3. 現場調査サービスの実装
- [x] 3.1 現場調査の作成機能を実装する
  - プロジェクト存在確認のバリデーション
  - 必須フィールド（名前、調査日）の検証
  - 監査ログへの記録
  - _Requirements: 1.1, 1.6, 12.5_

- [x] 3.2 現場調査の詳細取得機能を実装する
  - 関連する画像一覧の取得を含む
  - プロジェクト基本情報の取得
  - 論理削除されたレコードの除外
  - _Requirements: 1.2_

- [x] 3.3 現場調査の更新機能を実装する
  - 楽観的排他制御（expectedUpdatedAt）の実装
  - 競合時のエラーレスポンス
  - 監査ログへの記録
  - _Requirements: 1.3, 1.5, 12.5_

- [x] 3.4 現場調査の削除機能を実装する
  - 論理削除（deletedAtの設定）
  - 関連画像の連動削除処理
  - 監査ログへの記録
  - _Requirements: 1.4, 12.5_

- [x] 3.5 現場調査の一覧・検索機能を実装する
  - プロジェクト単位でのページネーション
  - キーワード検索（名前・メモの部分一致）
  - 調査日によるフィルタリング
  - ソート機能（調査日・作成日・更新日）
  - サムネイル画像URLの取得
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. 画像サービスの実装
- [x] 4.1 画像アップロード機能を実装する
  - Multerによるファイル受信（メモリストレージ）
  - ファイル形式バリデーション（JPEG、PNG、WEBP）
  - MIMEタイプとマジックバイトの二重検証
  - ファイル名サニタイズ
  - _Requirements: 4.1, 4.5, 4.8_

- [x] 4.2 画像圧縮・サムネイル生成機能を実装する
  - Sharpによる画像処理
  - 300KB超過時の段階的圧縮（品質を10%ずつ下げながらリサイズ、250KB〜350KB範囲に収める）
  - サムネイル生成（200x200px）
  - 画像メタデータ（幅・高さ・サイズ）の取得
  - _Requirements: 4.4, 4.6_

- [x] 4.3 バッチアップロード機能を実装する
  - 複数ファイルの同時選択対応
  - 5件を超える場合は5件ずつキュー処理して順次アップロード
  - 表示順序の自動設定
  - 進捗状況の追跡
  - _Requirements: 4.2, 4.3_

- [x] 4.4 画像順序変更機能を実装する
  - ドラッグアンドドロップによる順序変更のバックエンド対応
  - 一括更新処理
  - _Requirements: 4.9, 4.10_

- [x] 4.5 画像削除機能を実装する
  - データベースからのメタデータ削除
  - R2からのファイル削除（原画像・サムネイル両方）
  - 関連する注釈データの削除
  - 削除失敗時の孤立ファイルログ記録
  - _Requirements: 4.7_

- [x] 5. 注釈サービスの実装
- [x] 5.1 注釈データの保存機能を実装する
  - Fabric.js JSON形式での保存
  - バージョン管理（スキーマバージョン1.0）
  - 楽観的排他制御の実装
  - _Requirements: 9.1, 9.4_

- [x] 5.2 注釈データの取得・復元機能を実装する
  - 画像IDによる注釈データ取得
  - JSONデータの検証
  - _Requirements: 9.2_

- [x] 5.3 注釈データのJSONエクスポート機能を実装する
  - Fabric.jsフォーマット準拠のJSONエクスポート
  - ダウンロード用レスポンス生成
  - _Requirements: 9.6_

### Phase 4: バックエンドAPI層

- [x] 6. APIルーティングの実装
- [x] 6.1 (P) 現場調査CRUDエンドポイントを実装する
  - POST /api/projects/:projectId/site-surveys（作成）
  - GET /api/projects/:projectId/site-surveys（一覧）
  - GET /api/site-surveys/:id（詳細）
  - PUT /api/site-surveys/:id（更新）
  - DELETE /api/site-surveys/:id（削除）
  - Zodスキーマによるリクエストバリデーション
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1_

- [x] 6.2 (P) 画像管理エンドポイントを実装する
  - POST /api/site-surveys/:id/images（アップロード、multipart/form-data）
  - GET /api/site-surveys/:id/images（一覧）
  - PUT /api/site-surveys/:id/images/order（順序変更）
  - DELETE /api/site-surveys/images/:imageId（削除）
  - _Requirements: 4.1, 4.2, 4.7, 4.9, 4.10_

- [x] 6.3 (P) 注釈管理エンドポイントを実装する
  - GET /api/site-surveys/images/:imageId/annotations（取得）
  - PUT /api/site-surveys/images/:imageId/annotations（保存）
  - GET /api/site-surveys/images/:imageId/annotations/export（JSONエクスポート）
  - _Requirements: 9.1, 9.2, 9.6_

- [x] 6.4 アクセス制御ミドルウェアを適用する
  - 認証ミドルウェアの適用
  - プロジェクト単位の権限チェック
  - site_survey:create、site_survey:read、site_survey:update、site_survey:delete権限の確認
  - _Requirements: 12.1, 12.2, 12.3_

### Phase 5: フロントエンドAPI層

- [x] 7. フロントエンドAPIクライアントの実装
- [x] 7.1 (P) 現場調査APIクライアントを実装する
  - 現場調査CRUD操作のAPI呼び出し
  - 型安全なレスポンス型定義
  - エラーハンドリング
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1_

- [x] 7.2 (P) 画像管理APIクライアントを実装する
  - 画像アップロード（FormData対応）
  - バッチアップロード対応
  - 画像削除・順序変更API呼び出し
  - _Requirements: 4.1, 4.2, 4.7, 4.10_

- [x] 7.3 (P) 注釈管理APIクライアントを実装する
  - 注釈データの取得・保存API呼び出し
  - JSONエクスポートAPI呼び出し
  - _Requirements: 9.1, 9.2, 9.6_

### Phase 6: フロントエンド基盤コンポーネント

- [x] 8. 現場調査一覧ページの実装
- [x] 8.1 現場調査一覧表示コンポーネントを実装する
  - プロジェクト配下の現場調査一覧表示
  - サムネイル画像表示
  - ページネーションUI
  - _Requirements: 3.1, 3.5_

- [x] 8.2 検索・フィルタリングUIを実装する
  - キーワード検索フォーム
  - 調査日範囲フィルター
  - ソート切り替え（調査日・作成日・更新日）
  - _Requirements: 3.2, 3.3, 3.4_

- [x] 8.3 レスポンシブ対応を実装する
  - デスクトップ・タブレット・スマートフォン対応
  - グリッド/リスト表示切り替え
  - _Requirements: 13.1_

- [x] 9. 現場調査詳細ページの実装
- [x] 9.1 現場調査基本情報表示を実装する
  - 調査名、調査日、メモの表示
  - 編集ボタン・削除ボタン
  - プロジェクトへの戻り導線
  - _Requirements: 1.2_

- [x] 9.2 画像一覧グリッド表示を実装する
  - サムネイルによる画像一覧
  - 固定の表示順序
  - ドラッグアンドドロップによる順序変更
  - 画像クリックでビューア/エディタ起動
  - _Requirements: 4.9, 4.10_

- [x] 9.3 画像アップロードUIを実装する
  - ファイル選択ダイアログ
  - 複数ファイル選択対応
  - ドラッグアンドドロップアップロード
  - アップロード進捗表示
  - エラー表示（形式不正、サイズ超過）
  - モバイル環境でのカメラ連携
  - _Requirements: 4.1, 4.2, 4.5, 4.6, 13.3_

- [x] 9.4 現場調査作成・編集フォームを実装する
  - 調査名（必須、最大200文字）入力
  - 調査日選択
  - メモ（最大2000文字）入力
  - バリデーションエラー表示
  - _Requirements: 1.1, 1.3_

- [x] 10. 画面遷移・ナビゲーションの実装
- [x] 10.1 プロジェクト詳細から現場調査への導線を実装する
  - プロジェクト詳細画面に「現場調査」タブまたはセクションを追加
  - 現場調査一覧への遷移
  - _Requirements: 2.1, 2.2_

- [x] 10.2 ブレッドクラムナビゲーションを実装する
  - 「プロジェクト名 > 現場調査一覧 > 現場調査名」の階層表示
  - 各項目のクリックで対応画面へ遷移
  - _Requirements: 2.5, 2.6, 2.7_

- [x] 10.3 現場調査詳細から画像ビューアへの導線を実装する
  - 現場調査一覧から詳細画面への遷移
  - 詳細画面から画像ビューア/エディタへの遷移
  - _Requirements: 2.3, 2.4_

- [x] 11. 競合検出・エラーハンドリングの実装
- [x] 11.1 楽観的排他制御の競合ダイアログを実装する
  - 競合検出時の確認ダイアログ
  - 再読み込み促進メッセージ
  - _Requirements: 1.5_

- [x] 11.2 エラー表示の実装
  - バリデーションエラー表示
  - ネットワークエラー表示
  - Sentryへのエラーログ送信
  - _Requirements: 14.8_

### Phase 7: 画像ビューアの実装

- [x] 12. 画像ビューアコンポーネントの実装
- [x] 12.1 基本ビューア機能を実装する
  - モーダル/専用画面での画像表示
  - Fabric.js Canvasの初期化
  - 画像の読み込みと表示
  - _Requirements: 5.1_

- [x] 12.2 ズーム機能を実装する
  - マウスホイールによるズームイン/ズームアウト
  - ズームボタンUI
  - ズーム範囲制限（0.1x-10x）
  - _Requirements: 5.2_

- [x] 12.3 回転機能を実装する
  - 90度単位の回転ボタン
  - 回転状態の保持
  - _Requirements: 5.3_

- [x] 12.4 パン機能を実装する
  - ドラッグによる表示領域移動
  - 拡大時のスクロール対応
  - _Requirements: 5.4_

- [x] 12.5 タッチ操作対応を実装する
  - ピンチズーム
  - 2本指によるパン操作
  - タッチイベントのハンドリング
  - _Requirements: 5.5, 13.2_

- [x] 12.6 表示状態の共有機能を実装する
  - ズーム・回転・位置の状態管理
  - 注釈エディタとの状態同期
  - _Requirements: 5.6_

### Phase 8: 注釈エディタ基盤の実装

- [x] 13. 注釈エディタ基盤コンポーネントの実装
- [x] 13.1 Fabric.js Canvas統合を実装する
  - useRef + useEffectによるCanvas初期化
  - dispose処理の実装（クリーンアップ）
  - 背景画像の設定
  - _Requirements: 6.1, 7.1, 8.1_

- [x] 13.2 ツール切り替えUIを実装する
  - ツールバーコンポーネント
  - 選択ツール、寸法線、矢印、円、四角形、多角形、折れ線、フリーハンド、テキストの切り替え
  - アクティブツールの視覚的フィードバック
  - _Requirements: 6.1, 7.1, 8.1_

- [x] 13.3 オブジェクト選択・操作機能を実装する
  - クリックによるオブジェクト選択
  - 選択オブジェクトのハイライト表示
  - ドラッグによる移動
  - ハンドルによるリサイズ
  - Deleteキーによる削除
  - _Requirements: 6.4, 6.5, 6.6, 7.7, 7.8, 7.9_

- [x] 13.4 スタイル設定パネルを実装する
  - 色選択（線色、塗りつぶし色）
  - 線の太さ設定
  - フォントサイズ設定（テキスト用）
  - _Requirements: 6.7, 7.10, 8.5_

### Phase 9: 注釈ツールの実装

- [x] 14. 寸法線ツールの実装
- [x] 14.1 寸法線描画機能を実装する
  - 2点クリックによる寸法線描画
  - 端点間の直線と垂直線（エンドキャップ）
  - カスタムFabric.jsオブジェクト実装
  - _Requirements: 6.1_

- [x] 14.2 寸法値入力機能を実装する
  - 寸法線描画後のテキストフィールド表示
  - 数値と単位の入力
  - 寸法線上への値表示
  - _Requirements: 6.2, 6.3_

- [x] 14.3 寸法線編集機能を実装する
  - 端点のドラッグによる位置調整
  - 寸法値の再編集
  - スタイル変更（色、線の太さ）
  - _Requirements: 6.4, 6.5, 6.7_

- [x] 15. マーキングツール（図形）の実装
- [x] 15.1 (P) 矢印ツールを実装する
  - ドラッグによる矢印描画
  - 矢印の方向（開始点→終了点）
  - _Requirements: 7.1_

- [x] 15.2 (P) 円・楕円ツールを実装する
  - ドラッグによる円/楕円描画
  - 中心点と半径の計算
  - _Requirements: 7.2_

- [x] 15.3 (P) 四角形ツールを実装する
  - ドラッグによる長方形描画
  - _Requirements: 7.3_

- [x] 15.4 (P) 多角形ツールを実装する
  - クリックによる頂点追加
  - ダブルクリックで閉じる
  - _Requirements: 7.4_

- [x] 15.5 (P) 折れ線ツールを実装する
  - クリックによる点追加
  - ダブルクリックで終了
  - _Requirements: 7.5_

- [x] 15.6 (P) フリーハンドツールを実装する
  - Fabric.js PencilBrushの活用
  - 描画の滑らかさ調整
  - _Requirements: 7.6_

- [x] 16. テキストツールの実装
- [x] 16.1 テキスト入力機能を実装する
  - クリック位置へのテキストフィールド表示
  - 日本語を含むマルチバイト文字対応
  - _Requirements: 8.1, 8.7_

- [x] 16.2 テキスト編集機能を実装する
  - ダブルクリックによる編集モード
  - フォントサイズ・色・背景色の変更
  - _Requirements: 8.2, 8.3, 8.5_

- [x] 16.3 吹き出し形式を実装する
  - 吹き出しスタイルの選択UI
  - テキストを囲む吹き出し図形の描画
  - _Requirements: 8.6_

### Phase 10: 編集支援機能の実装

- [x] 17. Undo/Redo機能の実装
- [x] 17.1 UndoManagerを実装する
  - コマンドパターンによる操作履歴管理
  - 最大50件の履歴保持、超過時は最古の履歴から削除（FIFO）
  - execute/undo/redoメソッド
  - _Requirements: 11.1, 11.2, 11.4_

- [x] 17.2 Fabric.jsイベント連携を実装する
  - object:added、object:modified、object:removedイベントのキャプチャ
  - コマンドオブジェクトの生成
  - _Requirements: 11.1, 11.2_

- [x] 17.3 キーボードショートカットを実装する
  - Ctrl/Cmd+Z（Undo）
  - Ctrl/Cmd+Shift+Z（Redo）
  - _Requirements: 11.3_

- [x] 17.4 履歴クリア処理を実装する
  - 保存時の履歴クリア
  - canUndo/canRedoの状態更新
  - _Requirements: 11.5_

- [x] 18. 自動保存・状態復元機能の実装
- [x] 18.1 AutoSaveManagerを実装する
  - 30秒間隔のdebounce自動保存
  - localStorageへの注釈データ保存
  - 画像ID・調査ID・保存時刻の管理
  - _Requirements: 13.4_

- [x] 18.2 localStorage容量管理を実装する
  - LRU方式での古いキャッシュ削除
  - 最大4MBの容量制限
  - QuotaExceededError時のエラーハンドリング
  - _Requirements: 13.5_

- [x] 18.3 状態復元機能を実装する
  - ページリロード時のlocalStorageチェック
  - 未保存データ復元確認ダイアログ
  - サーバーデータとの比較・選択
  - _Requirements: 13.5_

- [x] 18.4 ネットワーク状態監視を実装する
  - navigator.onLineによる接続状態監視
  - オフライン時の警告表示
  - 保存操作のブロック
  - オンライン復帰時の通知
  - _Requirements: 13.6_

- [x] 19. 未保存変更の検出を実装する
  - isDirtyフラグの管理
  - ページ離脱時の確認ダイアログ（beforeunload）
  - _Requirements: 9.3_

### Phase 11: エクスポート機能の実装

- [x] 20. 画像エクスポート機能の実装
- [x] 20.1 注釈付き画像のエクスポートを実装する
  - Fabric.js toDataURLによる画像生成
  - JPEG/PNG形式選択
  - 解像度（品質）選択
  - _Requirements: 10.1, 10.2, 10.3_

- [x] 20.2 元画像ダウンロード機能を実装する
  - 注釈なしの原画像ダウンロード
  - 署名付きURLからのダウンロード
  - _Requirements: 10.4_

- [x] 20.3 日本語テキストのレンダリング対応を実装する
  - Canvasへの日本語フォント適用
  - エクスポート画像での日本語表示確認
  - _Requirements: 10.5_

- [x] 21. PDF報告書生成機能の実装
- [x] 21.1 日本語フォント埋め込みを実装する
  - Noto Sans JPフォントのサブセット化（約500KB）
  - jsPDFへのフォント登録
  - Base64エンコードによるバンドル
  - _Requirements: 10.6_

- [x] 21.2 PDF報告書レイアウトを実装する
  - 表紙（調査名、調査日、プロジェクト名）
  - 基本情報セクション（メモ含む）
  - 画像一覧セクション（注釈付き画像）
  - ページ番号
  - _Requirements: 10.6, 10.7_

- [x] 21.3 PDF生成・ダウンロードを実装する
  - jsPDFによるクライアントサイド生成
  - プログレス表示（大量画像時）
  - ダウンロードトリガー
  - _Requirements: 10.6_

### Phase 12: 統合と最適化

- [x] 22. フロントエンド統合
- [x] 22.1 ルーティング設定を実装する
  - /projects/:projectId/site-surveys（一覧）
  - /projects/:projectId/site-surveys/new（作成）
  - /site-surveys/:id（詳細）
  - /site-surveys/:id/edit（編集）
  - /site-surveys/:id/images/:imageId（ビューア/エディタ）
  - _Requirements: 1.1, 1.2, 1.3, 3.1_

- [x] 22.2 プロジェクト詳細画面との連携を実装する
  - プロジェクト詳細から現場調査一覧へのナビゲーション
  - パンくずナビゲーション
  - _Requirements: 2.1_

- [x] 22.3 アクセス権限によるUI制御を実装する
  - 閲覧権限のみの場合の編集ボタン非表示
  - 操作拒否時のエラーメッセージ
  - _Requirements: 12.1, 12.2, 12.3_

- [x] 23. パフォーマンス最適化
- [x] 23.1 画像遅延読み込みを実装する
  - IntersectionObserverによる遅延読み込み
  - サムネイル優先表示
  - _Requirements: 14.1_

- [x] 23.2 Canvas描画最適化を実装する
  - オブジェクトキャッシングの有効化
  - 不要な再描画の抑制
  - 大量オブジェクト時の描画パフォーマンス確保
  - _Requirements: 14.2_

### Phase 13: テスト

- [x] 24. バックエンド単体テストの実装
- [x] 24.1 (P) SurveyServiceの単体テストを実装する
  - CRUD操作のテスト
  - 楽観的排他制御のテスト
  - プロジェクト存在確認のテスト
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 24.2 (P) ImageServiceの単体テストを実装する
  - 画像アップロードのテスト
  - 圧縮・サムネイル生成のテスト
  - ファイル形式バリデーションのテスト
  - バッチアップロードのキュー処理テスト
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

- [x] 24.3 (P) AnnotationServiceの単体テストを実装する
  - 注釈保存・取得のテスト
  - JSONエクスポートのテスト
  - _Requirements: 9.1, 9.2, 9.6_

- [x] 25. フロントエンド単体テストの実装
- [x] 25.1 (P) 現場調査関連コンポーネントのテストを実装する
  - 一覧表示コンポーネントのテスト
  - フォームコンポーネントのテスト
  - _Requirements: 1.1, 1.3, 3.1_

- [x] 25.2 (P) 画像関連コンポーネントのテストを実装する
  - アップロードUIのテスト
  - 画像グリッドのテスト
  - _Requirements: 4.1, 4.2_

- [x] 25.3 (P) 注釈エディタのテストを実装する
  - ツール切り替えのテスト
  - Undo/Redoのテスト
  - 自動保存のテスト
  - _Requirements: 11.1, 11.2, 13.4_

- [x] 26. 統合・E2Eテストの実装
- [x] 26.1 バックエンド統合テストを実装する
  - APIエンドポイントの統合テスト
  - 認証・認可フローのテスト
  - R2連携のテスト（モック使用）
  - _Requirements: 12.1, 12.2, 12.3, 12.5_

- [x] 26.2 E2Eテストを実装する
  - 現場調査作成・編集・削除フローのテスト
  - 画像アップロード・削除フローのテスト
  - 注釈編集・保存フローのテスト
  - PDF出力のテスト
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 4.1, 4.7, 9.1, 10.6_

---

### Phase 14: 写真一覧管理とPDF出力設定の実装（要件10対応）

- [x] 27. 写真一覧管理機能の実装
- [x] 27.1 画像メタデータサービスを実装する
  - 画像単位でのコメント保存・取得機能を追加
  - 報告書出力フラグ（includeInReport）の管理機能を追加
  - コメント最大2000文字のバリデーション
  - includeInReportのデフォルト値をfalseに設定
  - 既存のImageServiceと連携して画像メタデータを管理
  - _Requirements: 10.4, 10.8_

- [x] 27.2 画像メタデータ更新エンドポイントを実装する
  - PATCH /api/site-surveys/images/:imageId エンドポイントを追加
  - comment（string | null）とincludeInReport（boolean）の更新対応
  - Zodスキーマによるリクエストバリデーション
  - 画像存在確認とアクセス権限検証
  - _Requirements: 10.2, 10.3, 10.4_

- [x] 27.3 (P) 画像メタデータAPIクライアントを実装する
  - フロントエンドから画像メタデータ更新APIを呼び出す
  - コメント更新時のデバウンス処理（500ms）
  - 報告書出力フラグ変更時の即時保存
  - _Requirements: 10.4, 10.8_

- [x] 27.4 写真一覧管理パネルコンポーネントを実装する
  - 写真ごとに報告書出力フラグ（チェックボックス）を表示
  - 中解像度画像（800x600px程度）でサムネイルではない実際の写真を表示
  - コメント入力用テキストエリアを各写真に配置
  - 保存された表示順序で写真一覧を表示
  - _Requirements: 10.1, 10.7_

- [x] 27.5 ドラッグアンドドロップによる写真順序変更を実装する
  - 写真のマウスドラッグ操作による並び替え
  - 並び替え操作完了時にデータベースへ表示順序を保存
  - 順序変更操作のアニメーション・視覚的フィードバック
  - _Requirements: 10.5, 10.6_

- [x] 27.6 現場調査詳細画面への写真一覧管理パネル統合
  - SurveyDetailPageに写真一覧管理パネルを統合
  - 従来のサムネイル一覧と報告書用一覧管理の切り替え
  - 編集権限に応じた操作可否の制御
  - _Requirements: 10.1_

### Phase 15: 調査報告書PDF出力の実装（要件11対応）

- [x] 28. 調査報告書PDF出力機能の実装
- [x] 28.1 報告書出力対象画像の取得機能を実装する
  - includeInReport=trueの画像のみを取得するサービスメソッドを追加
  - 表示順序（displayOrder）の昇順でソート
  - 画像に紐付けられたコメントを取得
  - _Requirements: 11.2, 11.3_

- [x] 28.2 PDF報告書1ページ3組レイアウトを実装する
  - 1ページ目に現場調査の基本情報（調査名、調査日、メモ等）を配置
  - 2ページ目以降に写真とコメントの組み合わせを1ページあたり3組で配置
  - 画像の左側配置、コメントの右側配置レイアウト
  - コメント最大行数制限とオーバーフロー処理
  - _Requirements: 11.4, 11.5, 11.6_

- [x] 28.3 調査報告書出力UIを実装する
  - 現場調査詳細画面に「調査報告書出力」ボタンを追加
  - 報告書出力対象の写真が0件の場合のエラー表示
  - PDF生成中のプログレス表示
  - PDF生成完了後のダウンロードトリガー
  - _Requirements: 11.1, 11.8_

- [x] 28.4 (P) AnnotationRendererServiceを拡張して報告書用画像をレンダリングする
  - 各画像の注釈をFabric.js Canvasでレンダリング
  - 注釈付き画像をdataURL形式で取得
  - 日本語を含むテキスト注釈の正しいレンダリング
  - _Requirements: 11.7_

### Phase 16: 個別画像エクスポートの実装（要件12対応）

- [x] 29. 個別画像エクスポート機能の実装
- [x] 29.1 ImageExportDialogコンポーネントを実装する
  - エクスポート形式選択UI（JPEG/PNG）
  - 品質（解像度）選択UI（低/中/高の3段階）
  - 注釈あり/なし選択オプション
  - エクスポート実行ボタンとキャンセルボタン
  - _Requirements: 12.1, 12.2, 12.3_

- [x] 29.2 元画像ダウンロード機能を実装する
  - 注釈なしの元画像をダウンロード可能にする
  - 署名付きURLからの画像取得とダウンロードトリガー
  - _Requirements: 12.4_

- [x] 29.3 画像ビューアへのエクスポートボタン統合
  - ImageViewerのツールバーにエクスポートボタンを追加
  - ボタン押下でImageExportDialogを表示
  - 選択オプションに基づいてエクスポート実行
  - _Requirements: 12.1_

- [x] 29.4 (P) 日本語テキスト注釈の正確なレンダリング検証
  - 個別画像エクスポート時の日本語テキスト表示確認
  - Fabric.js Canvas上のテキスト注釈がエクスポート画像に正しく含まれることを検証
  - _Requirements: 12.5_

### Phase 17: 要件10〜12のテスト

- [x] 30. 写真一覧管理・PDF出力・個別画像エクスポートのテスト
- [x] 30.1 (P) ImageMetadataServiceの単体テストを実装する
  - コメント更新のテスト
  - 報告書出力フラグ更新のテスト
  - コメント最大長バリデーションのテスト
  - 報告書出力対象画像取得のテスト
  - _Requirements: 10.2, 10.3, 10.4, 10.8, 11.2_

- [x] 30.2 (P) PhotoManagementPanelの単体テストを実装する
  - 写真一覧表示のテスト
  - チェックボックス操作のテスト
  - コメント入力のテスト
  - ドラッグアンドドロップ順序変更のテスト
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [x] 30.3 (P) PDF報告書生成の単体テストを実装する
  - 3組レイアウトのテスト
  - コメント表示のテスト
  - ページ分割のテスト
  - 日本語テキストレンダリングのテスト
  - _Requirements: 11.4, 11.5, 11.6, 11.7_

- [x] 30.4 (P) ImageExportDialogの単体テストを実装する
  - 形式選択のテスト
  - 品質選択のテスト
  - 注釈有無選択のテスト
  - エクスポート実行のテスト
  - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 30.5 E2Eテストを追加する
  - 写真コメント入力・報告書出力フラグ切り替えフローのテスト
  - 調査報告書PDF出力フローのテスト（3組レイアウト確認）
  - 個別画像エクスポートフローのテスト（形式・品質・注釈オプション）
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 12.1, 12.2, 12.3, 12.4, 12.5_

---

### Phase 18: 追加要件対応（要件2.1、4.8、9.1、9.3、10.8-10.12、15.7-15.10）

- [x] 31. プロジェクト詳細画面の現場調査セクション実装（要件2.1）
- [x] 31.1 (P) 現場調査直近N件取得APIエンドポイントを実装する
  - GET /api/projects/:projectId/site-surveys/latest エンドポイントを追加
  - クエリパラメータでlimit（デフォルト2）を指定可能にする
  - 直近N件の現場調査と総数（totalCount）を返却する
  - SurveyServiceにfindLatestByProjectIdメソッドを追加
  - _Requirements: 2.1_

- [x] 31.2 SiteSurveySectionCardコンポーネントを実装する
  - プロジェクト詳細画面に「現場調査」セクションとして配置
  - 直近2件の現場調査への参照リンクを表示
  - 現場調査の総数（N件）を表示
  - 「すべて表示」リンクで現場調査一覧ページへ遷移
  - 現場調査が0件の場合は「新規作成」リンクを表示
  - ローディングスケルトン表示
  - _Requirements: 2.1, 2.2_

- [x] 31.3 ProjectDetailPageへのSiteSurveySectionCard統合
  - 既存のプロジェクト詳細画面にセクションカードを組み込む
  - 適切な配置位置の決定（他セクションとのバランス）
  - _Requirements: 2.1_

- [x] 32. R2孤立ファイル処理機能の実装（要件4.8）
- [x] 32.1 ImageDeleteServiceに孤立ファイル移動ロジックを追加する
  - R2削除失敗時に孤立ファイルをorphaned/プレフィックスにコピー
  - CopyObjectCommandによる移動処理
  - 移動成功後のログ記録（Sentry警告レベル）
  - 移動失敗時のエラーログとSentryアラート
  - _Requirements: 4.8_

- [x] 32.2 R2 Object Lifecycle Rule設定ドキュメントを作成する
  - Cloudflare R2ダッシュボードでの設定手順
  - orphaned/プレフィックスに対して7日後自動削除ルールを設定
  - 設定確認用のテストケース
  - _Requirements: 4.8_

- [x] 33. 保存方式変更の実装（オートセーブ → ボタン保存、要件9.1、9.3、10.9、10.10）
  - [x] バックエンド: ImageMetadataService.updateMetadataBatch メソッド追加
  - [x] バックエンド: PATCH /api/site-surveys/images/batch エンドポイント追加
- [x] 33.1 写真一覧管理パネルを手動保存方式に変更する
  - コメント入力・報告書出力フラグ変更を未保存状態（isDirty）としてマーク
  - 「保存」ボタン追加と一括保存機能の実装
  - PATCH /api/site-surveys/images/batch APIを使用した一括更新
  - useUnsavedChangesフックとの統合
  - _Requirements: 10.9_

- [x] 33.2 ページ離脱時の確認ダイアログを実装する
  - PhotoManagementPanelでbeforeunloadイベントを設定
  - 未保存変更がある場合に確認ダイアログを表示
  - React Routerとの連携（ルート遷移時の確認）
  - _Requirements: 9.3, 10.10_

- [x] 33.3 注釈エディタを手動保存方式に変更する
  - 注釈編集時にisDirtyフラグを更新
  - 「保存」ボタンクリックでサーバーに保存
  - 保存成功時にisDirtyフラグをリセット
  - useUnsavedChangesフックとの統合
  - _Requirements: 9.1, 9.3_

- [x] 33.4 「プロジェクトに戻る」「現場調査一覧に戻る」ボタンを削除する
  - PhotoManagementPanelからナビゲーションボタンを削除
  - SurveyDetailPageから該当ボタンを削除
  - ブレッドクラムのみでナビゲーションを行う設計に統一
  - _Requirements: 2.5, 2.6, 2.7_

- [x] 34. 画像削除機能の拡充（要件10.11、10.12）
- [x] 34.1 画像削除確認ダイアログを実装する
  - 削除ボタンクリック時に確認ダイアログを表示
  - 「画像と関連する注釈データも削除される」旨の警告文を表示
  - キャンセル/削除ボタンの配置
  - _Requirements: 10.11_

- [x] 34.2 PhotoManagementPanelに削除機能を統合する
  - 各写真に削除ボタンを追加
  - 削除確認ダイアログの呼び出し
  - 削除実行後の画像リストからの除去
  - 削除成功時のフィードバック表示
  - _Requirements: 10.11, 10.12_

- [x] 35. localStorage QuotaExceededError対応の実装（要件15.7-15.10）
- [x] 35.1 (P) クロスブラウザQuotaExceededError検出ユーティリティを実装する
  - isQuotaExceededError関数の実装
  - code===22（Chrome、Safari、Edge）対応
  - code===1014（Firefox）対応
  - name===QuotaExceededError対応
  - name===NS_ERROR_DOM_QUOTA_REACHED対応
  - _Requirements: 15.10_

- [x] 35.2 (P) プライベートブラウジングモード検出機能を実装する
  - isPrivateBrowsingMode関数の実装
  - SecurityError検出（プライベートモードでのlocalStorage制限）
  - Safari Private ModeのQuotaExceededError検出
  - _Requirements: 15.9_

- [x] 35.3 AutoSaveManagerにLRUリトライ機能を追加する
  - QuotaExceededError発生時にLRU戦略で古いキャッシュを削除
  - clearOldestEntries関数の実装
  - リトライ後も失敗した場合のエラーハンドリング
  - _Requirements: 15.7_

- [x] 35.4 QuotaExceededError時のユーザー警告UIを実装する
  - QuotaWarningDialogコンポーネントの実装
  - 「自動保存に失敗しました」メッセージ表示
  - 「今すぐ保存」ボタンで手動保存を促進
  - _Requirements: 15.8_

- [x] 35.5 プライベートブラウジングモード時の警告UIを実装する
  - 初回アクセス時に警告バナーを表示
  - 「自動保存が無効です」メッセージ
  - 「今後表示しない」オプション
  - 自動保存を無効化し手動保存のみで動作
  - _Requirements: 15.9_

- [x] 35.6 AutoSaveManagerの設定を拡張する
  - isAutoSaveAvailable()メソッドの追加
  - onQuotaExceeded()コールバック設定
  - プライベートブラウジングモード時の動作設定
  - _Requirements: 15.7, 15.8, 15.9, 15.10_

### Phase 19: Phase 18のテスト

- [x] 36. 追加要件のテスト実装
- [x] 36.1 (P) プロジェクト詳細画面の現場調査セクションのテストを実装する
  - SiteSurveySectionCardコンポーネントの単体テスト
  - 直近N件取得APIの単体テスト
  - 0件・1件・複数件の表示パターンテスト
  - _Requirements: 2.1, 2.2_

- [x] 36.2 (P) R2孤立ファイル処理のテストを実装する
  - ImageDeleteServiceのorphaned/移動ロジックの単体テスト
  - 削除失敗シミュレーションテスト
  - _Requirements: 4.8_

- [x] 36.3 (P) 手動保存方式のテストを実装する
  - isDirtyフラグの状態管理テスト
  - 保存ボタンクリック時の一括保存テスト
  - ページ離脱時の確認ダイアログテスト
  - _Requirements: 9.1, 9.3, 10.9, 10.10_

- [x] 36.4 (P) 画像削除確認ダイアログのテストを実装する
  - 削除確認ダイアログの表示テスト
  - キャンセル/削除操作のテスト
  - 削除後のリスト更新テスト
  - _Requirements: 10.11, 10.12_

- [x] 36.5 (P) localStorage QuotaExceededError対応のテストを実装する
  - isQuotaExceededError関数のクロスブラウザテスト
  - isPrivateBrowsingMode関数のテスト
  - LRUリトライ機能のテスト
  - 警告UI表示のテスト
  - _Requirements: 15.7, 15.8, 15.9, 15.10_

- [x] 36.6 E2Eテストを追加する
  - プロジェクト詳細画面の現場調査セクション表示テスト
  - 手動保存フローのE2Eテスト
  - ページ離脱時確認ダイアログのE2Eテスト
  - 画像削除（確認ダイアログ付き）のE2Eテスト
  - _Requirements: 2.1, 4.8, 9.1, 9.3, 10.9, 10.10, 10.11, 10.12, 15.7, 15.8, 15.9, 15.10_

---

### Phase 20: 画像順序変更機能の拡充（要件4.10-4.13、10.5-10.9）

- [x] 37. 画像順序変更のローカル状態管理実装
- [x] 37.1 (P) PhotoManagementPanelに「上へ移動」「下へ移動」ボタンを追加する
  - 各写真カードに「上へ移動」「下へ移動」ボタンを配置
  - 先頭画像の「上へ移動」ボタンを無効化
  - 末尾画像の「下へ移動」ボタンを無効化
  - ボタンクリック時にローカル状態のみ更新（即時保存しない）
  - useUnsavedChangesフックでisDirty状態をマーク
  - _Requirements: 4.12, 4.13, 10.6, 10.7_

- [x] 37.2 (P) ドラッグ&ドロップ順序変更をローカル状態のみに変更する
  - 既存のドラッグ&ドロップ実装の即時保存を削除
  - 順序変更完了時にローカル状態のみ更新
  - useUnsavedChangesフックでisDirty状態をマーク
  - 視覚的フィードバック（並び替え中のハイライト）を維持
  - _Requirements: 4.11, 10.5_

- [x] 37.3 pendingOrderRefパターンを実装する
  - SurveyDetailPageにpendingOrderRef（useRef）を追加
  - 順序変更時にpendingOrderRefに変更内容を記録
  - 保存ボタンクリック時にpendingOrderRefの内容をAPIリクエストに含める
  - 保存成功後にpendingOrderRefをクリア
  - _Requirements: 4.11, 4.12, 4.13, 10.5, 10.6, 10.7_

- [x] 37.4 画像削除時のpendingOrderRef/pendingChangesクリアを実装する
  - handleImageDelete内で削除対象imageIdをpendingOrderRefから除外
  - pendingChanges（メタデータ変更）からも削除対象を除外
  - 削除後の順序を再計算してローカル状態を更新
  - _Requirements: 10.11, 10.12_

- [x] 38. サーバーサイドdisplayOrder正規化の実装
- [x] 38.1 バッチ更新APIでdisplayOrderを連番に再計算する
  - ImageMetadataService.batchUpdateMetadataでdisplayOrder重複チェック
  - 送信された相対順序を1, 2, 3...の連番に正規化
  - 欠番や重複があっても正しくソート・再番号付け
  - 大量リクエスト回避のためバッチAPI使用を強制
  - _Requirements: 10.9_

- [x] 38.2 displayOrder正規化の単体テストを実装する
  - 重複displayOrder時の正規化テスト
  - 欠番displayOrder時の正規化テスト
  - 順序保持の確認テスト
  - _Requirements: 10.9_

- [x] 39. 画像順序変更のE2Eテスト実装
- [x] 39.1 「上へ移動」「下へ移動」ボタンのE2Eテストを実装する
  - ボタンクリックでUI上の順序が変更されることを確認
  - 保存前はサーバーに反映されないことを確認
  - 保存後にサーバーの順序が更新されることを確認
  - _Requirements: 4.12, 4.13, 10.6, 10.7_

- [x] 39.2 ドラッグ&ドロップ順序変更のE2Eテストを実装する
  - ドラッグ&ドロップでUI上の順序が変更されることを確認
  - 保存前はサーバーに反映されないことを確認
  - 保存後にサーバーの順序が更新されることを確認
  - _Requirements: 4.11, 10.5_

- [x] 39.3 順序変更と画像削除の組み合わせテストを実装する
  - 順序変更後に画像削除した場合の動作確認
  - 削除した画像のpendingChangesからの除外確認
  - 保存時に正しい順序が反映されることを確認
  - _Requirements: 4.11, 4.12, 4.13, 10.5, 10.6, 10.7, 10.11, 10.12_

### Phase 11: 描画ツール使用中のオブジェクト選択防止

- [x] 40. 描画ツール使用中のオブジェクト選択防止の実装（要件17）
- [x] 40.1 AnnotationEditorのmouse:down/mouse:upハンドラからcontainsPointチェックを除去する
  - `mouse:down`ハンドラ（行671-689）: 描画ツール使用中の既存オブジェクトcontainsPointループを削除
  - `mouse:down`ハンドラ（行691-700）: activeObjectチェックを削除（handleToolChangeでdiscardActiveObject済み）
  - `mouse:up`ハンドラ（行928-942）: 既存オブジェクト上でのマウスアップ時のcontainsPointチェックを削除
  - handleToolChangeの`evented: false`/`selectable: false`設定は維持（変更不要）
  - 選択ツールでの既存オブジェクト選択が引き続き正常に動作することを確認
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

- [x] 40.2 描画ツール使用中のオブジェクト選択防止のテストを実装する
  - 描画ツール使用中に既存オブジェクト上でドラッグ開始しても描画が実行されることのテスト
  - 描画ツール使用中にマウスアップが既存オブジェクト上でも図形が作成されることのテスト
  - 多角形・折れ線ツールで既存オブジェクト上に頂点追加できることのテスト
  - テキストツールで既存オブジェクト上にテキスト配置できることのテスト
  - 選択ツールでのオブジェクト選択が引き続き正常に動作することのテスト
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

---

### Phase 21: PDF報告書出力時の写真リクエスト最適化（要件18対応）

- [x] 41. バッチ注釈取得バックエンドの実装
- [x] 41.1 (P) AnnotationServiceにバッチ注釈取得メソッドを追加する
  - 複数の画像IDを受け取り、対応する注釈データをまとめて取得する機能を追加
  - 注釈データが存在しない画像IDに対しては空（null）を返却
  - WHERE IN句による一括クエリでデータベースアクセスを最適化
  - レスポンス形式を個別取得APIと互換にする
  - _Requirements: 18.1, 18.3, 18.4, 18.8_

- [x] 41.2 バッチ注釈取得エンドポイントを実装する
  - POST /api/site-surveys/annotations/batch エンドポイントを追加
  - surveyIdとimageIds配列を受け取るZodスキーマバリデーション
  - 当該現場調査に対するアクセス権限の検証
  - エラーレスポンス（400: バリデーション不正、403: 権限不足）の実装
  - 41.1のバッチ取得メソッドを呼び出してレスポンスを返却
  - _Requirements: 18.1, 18.3, 18.6_

- [x] 42. フロントエンドバッチ注釈取得の実装
- [x] 42.1 (P) 注釈管理APIクライアントにバッチ取得関数を追加する
  - getBatchAnnotations関数を追加（surveyIdとimageIds配列を引数に取る）
  - バッチ注釈取得エンドポイントへのPOSTリクエストを送信
  - レスポンスをimageIdをキーとするMapに変換して返却
  - エラー時のハンドリング（ネットワークエラー、権限エラー等）
  - _Requirements: 18.1, 18.2, 18.7_

- [x] 42.2 AnnotationRendererServiceをバッチ注釈取得に対応させる
  - renderImagesForReportメソッドで個別注釈取得ループをバッチ一括取得に変更
  - バッチ取得した注釈データをメモリ内Mapから参照して各画像をレンダリング
  - バッチAPI失敗時に従来の個別注釈取得へフォールバックする処理を追加
  - フォールバック時にconsole.warnとSentryでログ出力
  - _Requirements: 18.2, 18.5, 18.7_

- [x] 43. バッチ注釈取得のテスト実装
- [x] 43.1 (P) AnnotationServiceバッチ取得メソッドの単体テストを実装する
  - 正常系: 複数画像IDに対する注釈データ一括取得
  - 注釈なし画像に対して空データ（null）が返却されることの確認
  - 空の画像ID配列に対する動作確認
  - 不正な画像IDが含まれる場合の動作確認
  - レスポンス形式が個別取得APIと互換であることの確認
  - _Requirements: 18.1, 18.3, 18.4, 18.8_

- [x] 43.2 (P) バッチ注釈取得エンドポイントの単体テストを実装する
  - Zodスキーマバリデーション（surveyId未指定、imageIds不正形式等）のテスト
  - 権限検証（アクセス権なしの場合に403が返却される）のテスト
  - 正常系レスポンスの形式・内容のテスト
  - _Requirements: 18.1, 18.6_

- [x] 43.3 (P) フロントエンドgetBatchAnnotations関数の単体テストを実装する
  - 正常系: バッチ取得成功時のレスポンス変換テスト
  - エラー系: ネットワークエラー時のハンドリングテスト
  - _Requirements: 18.1, 18.7_

- [x] 43.4 (P) AnnotationRendererServiceバッチ対応の単体テストを実装する
  - バッチAPI使用時に個別リクエストが発行されないことの確認
  - バッチAPI失敗時にフォールバックで個別取得が実行されることの確認
  - フォールバック時もレンダリング結果が正しいことの確認
  - _Requirements: 18.2, 18.5, 18.7_

- [x] 43.5 E2Eテストを追加する
  - PDF報告書出力フローでバッチ注釈取得エンドポイントが使用されることの確認
  - DevToolsでリクエスト数がN回から1回に削減されていることの確認
  - バッチ取得後にPDF報告書が正常に生成・ダウンロードされることの確認
  - _Requirements: 18.1, 18.2, 18.5_

---

### Phase 22: 調査報告書PDFファイル名の変更（要件11.9対応）

- [x] 44. 調査報告書PDFファイル名を「現場調査報告書_YYYYMMDD.pdf」形式に変更する
- [x] 44.1 PdfExportService.generateDefaultFilename()を修正する
  - 固定プレフィックス「現場調査報告書」を使用する
  - 調査日（survey.surveyDate）をYYYYMMDD形式でフォーマットする
  - ファイル名形式: `現場調査報告書_YYYYMMDD.pdf`
  - _Requirements: 11.9_
- [x] 44.2 SiteSurveyDetailInfo.tsxのhandleExportPdf内のファイル名生成を修正する
  - 独自ファイル名生成（`site-survey-${survey.id}-${date}.pdf`）を削除する
  - PdfExportService.generateDefaultFilename()を使用するか、直接「現場調査報告書_YYYYMMDD.pdf」形式を使用する
  - _Requirements: 11.9_
- [x] 44.3 既存のPdfExportService単体テストを更新する
  - generateDefaultFilenameのテストケースを更新して新しいファイル名形式を検証する
  - exportAndDownloadPdfのデフォルトファイル名テストを更新する
  - _Requirements: 11.9_
- [x] 44.4 E2Eテストでファイル名を検証する
  - PDFダウンロード時のファイル名が「現場調査報告書_YYYYMMDD.pdf」形式であることを確認する
  - _Requirements: 11.9_

---

### Phase 23: 画像アップロードバリデーション修正とエラー通知改善（要件19対応）

- [x] 45. (P) JPEGマジックバイト検証を3バイトプレフィックス方式に変更する
  - SurveyImageServiceのJPEGマジックバイト検証ロジックを、4バイトのホワイトリスト方式から先頭3バイト（FF D8 FF）のみで判定するプレフィックス方式に変更する
  - MAGIC_BYTES定義のjpegエントリを3バイトプレフィックスに修正し、validateJpegMagicBytesメソッドの比較ロジックを更新する
  - PNG形式（89 50 4E 47）およびWEBP形式（52 49 46 46 + WEBP識別子）の検証ロジックには一切手を加えない
  - 先頭3バイトがFF D8 FFでないファイルに対しては従来通りInvalidMagicBytesErrorをスローする
  - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.8, 19.9_

- [x] 46. バッチアップロードのエラー伝搬とユーザー通知を実装する
- [x] 46.1 (P) BatchUploadResult型を定義し、uploadSurveyImagesの戻り値型を変更する
  - 成功結果（SurveyImageInfo配列）とエラー情報（BatchUploadError配列）を含むBatchUploadResult型をsite-survey.types.tsに定義する
  - uploadSurveyImages関数の戻り値型をSurveyImageInfo[]からBatchUploadResultに変更する
  - バッチ処理完了後、成功分と失敗分の両方を含む結果オブジェクトを返却するようにする
  - 5件ずつのキュー処理ロジックとonProgressコールバックの動作は維持する
  - _Requirements: 19.10, 19.12, 19.16_

- [x] 46.2 SiteSurveyDetailPageでアップロードエラーをユーザーに表示する
  - handleImageUpload内でBatchUploadResult.errorsを検査し、エラーがある場合にユーザーに通知する
  - エラーカテゴリを判定する: ファイル形式不一致（「サポートされていないファイル形式」「MIMEタイプと一致しません」を含む）はfile_type、それ以外はserverとして分類する
  - 部分成功時は「{成功件数}件のアップロードに成功しました。{エラー件数}件のアップロードに失敗しました。」と各ファイルのエラー詳細を表示する
  - 全件失敗時は「全{件数}件のアップロードに失敗しました。」と各ファイルのエラー詳細を表示する
  - 全件成功時はエラーメッセージを表示せず、既存の画像一覧再取得動作を維持する
  - 既存のerrorステート（string | null）を使用してメッセージを設定する
  - _Requirements: 19.11, 19.13, 19.14, 19.15, 19.16_

- [x] 47. バックエンドの単体テストでJPEGマジックバイト検証の修正を検証する
  - 先頭3バイトFF D8 FFに様々な4バイト目（0xE0, 0xE1, 0xE2, 0xDA, 0xDB, 0xC0, 0xC4等）を組み合わせたバッファで検証成功となることをテストする
  - 先頭3バイトがFF D8 FFでないバッファでInvalidMagicBytesErrorがスローされることをテストする
  - PNG・WEBPの既存テストが変更なく通過することを確認する
  - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.8, 19.9_

- [x] 48. フロントエンドの単体テストでエラー伝搬と表示を検証する
- [x] 48.1 uploadSurveyImagesの戻り値がBatchUploadResultとなることをテストする
  - 部分失敗時にresultsとerrorsの両方が返却されることを検証する
  - 全件成功時にerrorsが空配列であることを検証する
  - _Requirements: 19.10, 19.12, 19.16_

- [x] 48.2 SiteSurveyDetailPageのエラー表示をテストする
  - エラーあり時にsetErrorが呼ばれ適切なエラーメッセージが生成されることを検証する
  - 部分成功時のメッセージフォーマットを検証する
  - 全件失敗時のメッセージフォーマットを検証する
  - ファイル形式不一致エラーとサーバーエラーで異なる理由メッセージが含まれることを検証する
  - 全件成功時にエラーメッセージが設定されないことを検証する
  - _Requirements: 19.11, 19.13, 19.14, 19.15, 19.16_

- [x]* 49. 統合テスト・E2Eテストで回帰防止を確認する
  - ICCプロファイル付きJPEG（4バイト目0xE2）のアップロードAPIが201を返却することをテストする
  - 不正マジックバイトのファイルがアップロード拒否されることをテストする
  - 混在ファイルのバッチアップロードで部分成功結果が返却されることをテストする
  - 画像アップロード画面で不正ファイルアップロード時にエラーメッセージが表示されることをE2Eで確認する
  - 全件成功時にエラーメッセージが表示されないことをE2Eで確認する
  - _Requirements: 19.1, 19.2, 19.7, 19.10, 19.11, 19.12, 19.14, 19.16_

---

### Phase 24: ブレッドクラムナビゲーション更新・画面タイトル変更・戻るリンク削除（要件2 AC5-12対応）

- [x] 50. ブレッドクラムユーティリティの更新と画像プレビュー用関数の新設
- [x] 50.1 (P) 既存ブレッドクラム生成関数のラベルを更新する
  - buildSiteSurveyListBreadcrumbの階層を「ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧」に変更
  - buildSiteSurveyDetailBreadcrumbの階層を「ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査」に変更
  - buildSiteSurveyCreateBreadcrumb、buildSiteSurveyEditBreadcrumbも同様に更新
  - 各項目のリンク先パスが正しい画面に遷移することを保証
  - _Requirements: 2.5, 2.6, 2.7, 2.10_

- [x] 50.2 (P) 画像プレビュー画面用ブレッドクラム生成関数を新設する
  - buildSiteSurveyImageBreadcrumb関数を追加
  - 階層:「ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査 > 画像」
  - 閲覧モード・編集モード共通で使用
  - SiteSurveyImageViewerPageのローカルブレッドクラム関数を新ユーティリティに置換
  - _Requirements: 2.8, 2.9, 2.10_

- [x] 51. (P) 一覧画面タイトル変更と戻るリンク削除
- [x] 51.1 (P) 現場調査一覧画面の画面タイトルを「現場調査一覧」に変更する
  - SiteSurveyListPageのh1タグ内テキストを「現場調査」から「現場調査一覧」に変更
  - _Requirements: 2.11_

- [x] 51.2 (P) 画像プレビュー画面から「← 現場調査に戻る」リンクを削除する
  - SiteSurveyImageViewerPageから戻るリンク要素を削除
  - handleBackClickコールバック関数を削除
  - ResourceNotFoundコンポーネントのreturnLabelも適切に調整
  - ブレッドクラムナビゲーションが代替ナビゲーションとして機能する
  - _Requirements: 2.12_

- [x] 52. ブレッドクラム更新・タイトル変更・戻るリンク削除のテスト
- [x] 52.1 (P) ブレッドクラムユーティリティの単体テストを実装する
  - 各ブレッドクラム生成関数が更新されたラベル（「プロジェクト一覧」「現場調査一覧」）を生成することを検証
  - buildSiteSurveyImageBreadcrumbが正しい階層構造を生成することを検証
  - 各階層のパスが正しい画面に対応することを検証
  - _Requirements: 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

- [x] 52.2 (P) 一覧画面タイトルと戻るリンク削除の単体テストを実装する
  - SiteSurveyListPageの画面タイトルが「現場調査一覧」であることを検証
  - SiteSurveyImageViewerPageに「← 現場調査に戻る」リンクが表示されないことを検証
  - SiteSurveyImageViewerPageのブレッドクラムが正しい階層構造で表示されることを検証
  - _Requirements: 2.11, 2.12_

- [x]* 52.3 E2Eテストでブレッドクラム・タイトル・戻るリンクの動作を検証する
  - 現場調査一覧画面のブレッドクラムに「ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧」が表示されること
  - 現場調査詳細画面のブレッドクラムに「ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査」が表示されること
  - 画像プレビュー画面のブレッドクラムに「ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査 > 画像」が表示されること
  - ブレッドクラムの各項目クリックで対応する画面に遷移すること
  - 一覧画面のタイトルが「現場調査一覧」であること
  - 画像プレビュー画面に「← 現場調査に戻る」リンクが表示されないこと
  - _Requirements: 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12_

---

### Phase 25: 注釈のサムネイル・プレビュー表示（要件20対応）

- [x] 53. 注釈付きサムネイルのデータモデルとバックエンド実装
- [x] 53.1 SurveyImageモデルにannotatedThumbnailPathフィールドを追加する
  - Prismaスキーマにannotated_thumbnail_path（String?）カラムを追加
  - マイグレーションを作成・適用
  - SurveyImageInfo型にannotatedThumbnailUrl、annotatedThumbnailPath、hasAnnotationsフィールドを追加
  - _Requirements: 20.4_

- [x] 53.2 AnnotatedThumbnailServiceを実装する
  - Fabric.js JSON注釈データからSVGを生成する機能を実装（基本図形・矢印・円・四角形・線・テキスト・寸法線に対応）
  - Sharpのcomposite機能でオリジナル画像にSVGオーバーレイを合成する機能を実装
  - 合成画像を400x300pxにリサイズしてサムネイル生成
  - 生成したサムネイルをR2のannotated-thumbnails/プレフィックスに保存
  - SurveyImage.annotatedThumbnailPathを更新
  - 注釈が全削除された場合はannotatedThumbnailPathをnullに更新しR2から削除
  - 日本語テキスト注釈のフォント対応（Noto Sans JPフォールバック）
  - _Requirements: 20.4_

- [x] 53.3 AnnotationService.save()に注釈付きサムネイル生成フックを追加する
  - 注釈保存成功後にAnnotatedThumbnailService.generateAnnotatedThumbnailを非同期で呼び出す
  - サムネイル生成失敗時はログ出力のみでエラーを伝播させない（注釈保存自体は成功扱い）
  - annotatedThumbnailPathがnullの場合はクライアントサイドフォールバックに依存
  - _Requirements: 20.4_

- [x] 53.4 画像一覧・現場調査一覧APIレスポンスを拡張する
  - 画像一覧API（GET /api/site-surveys/:id/images）のレスポンスにannotatedThumbnailUrl（署名付きURL）とhasAnnotationsを追加
  - 現場調査一覧API（findByProjectId、findLatestByProjectId）のレスポンスに代表画像のannotatedThumbnailUrlとrepresentativeImageIdを追加
  - 代表画像はdisplayOrder最小の画像とする
  - _Requirements: 20.2, 20.3, 20.4_

- [x] 54. フロントエンドの注釈付きサムネイル・プレビュー表示実装
- [x] 54.1 (P) 画像プレビュー画面（閲覧モード）で注釈表示を保証する
  - 閲覧モードでAnnotationEditorがreadOnlyプロップで注釈データをレンダリングする動作を確認・保証
  - 注釈データの自動読み込みと表示を明示的に担保
  - _Requirements: 20.1_

- [x] 54.2 (P) 詳細画面サムネイルに注釈付き画像を表示する
  - PhotoManagementPanelの画像表示部分にAnnotatedImageThumbnailコンポーネントを統合
  - hasAnnotationsフラグに応じてクライアントサイドFabric.jsレンダリングで注釈を表示
  - 注釈なしの場合は従来通り中解像度画像またはオリジナルを表示
  - _Requirements: 20.2_

- [x] 54.3 (P) 一覧画面の代表画像サムネイルに注釈付きサムネイルを表示する
  - SiteSurveyListTable、SiteSurveyListCard、SiteSurveySectionCardのサムネイル表示を更新
  - annotatedThumbnailUrlが存在する場合はサーバーサイド生成済みサムネイルを表示
  - 存在しない場合はAnnotatedImageThumbnailでクライアントサイドレンダリングにフォールバック
  - _Requirements: 20.3_

- [x] 55. 注釈付きサムネイル・プレビュー表示のテスト
- [x] 55.1 (P) AnnotatedThumbnailServiceの単体テストを実装する
  - generateAnnotatedThumbnail正常系テスト（SVG生成、Sharp合成、R2保存、DB更新）
  - generateAnnotatedThumbnail異常系テスト（R2保存失敗時にnullを返す）
  - removeAnnotatedThumbnail正常系テスト（R2削除、DB更新）
  - generateSvgFromAnnotationの各注釈タイプ（矢印、円、四角形、テキスト、寸法線）変換テスト
  - AnnotationService.save後にサムネイル生成が呼ばれることを検証
  - 一覧APIレスポンスにannotatedThumbnailUrlが含まれることを検証
  - _Requirements: 20.4_

- [x] 55.2 (P) フロントエンドの注釈付き表示の単体テストを実装する
  - PhotoManagementPanelがAnnotatedImageThumbnailで注釈付き画像を表示することを検証
  - SiteSurveyListTableが代表画像の注釈付きサムネイルを表示することを検証
  - SiteSurveyListCardが代表画像の注釈付きサムネイルを表示することを検証
  - SiteSurveySectionCardが代表画像の注釈付きサムネイルを表示することを検証
  - SiteSurveyImageViewerPageの閲覧モードで注釈がレンダリングされた状態で表示されることを検証
  - _Requirements: 20.1, 20.2, 20.3_

- [x]* 55.3 E2Eテストで注釈付き表示の動作を検証する
  - 注釈を編集モードで保存後、プレビュー画面で注釈が表示されること
  - 注釈保存後、詳細画面のサムネイルに注釈が反映されること
  - 注釈保存後、一覧画面の代表画像サムネイルに注釈が反映されること
  - 注釈が存在しない画像は素のサムネイルが表示されること
  - _Requirements: 20.1, 20.2, 20.3, 20.4_

---

### Phase 26: 画像アップロード拡張子不一致許容（要件21対応）

- [x] 56. マジックバイトのみによる画像形式判定の実装
- [x] 56.1 (P) detectMimeTypeByMagicBytesメソッドとUnsupportedImageFormatErrorを実装する
  - ファイルバッファの先頭バイトからJPEG/PNG/WEBPを自動検出するメソッドを新設する
  - サポート対象外の形式の場合にスローする専用エラークラスを追加する
  - JPEG判定は3バイトプレフィックス（FF D8 FF）、PNG判定は8バイトシグネチャ、WEBP判定は12バイトRIFFヘッダーで行う
  - 空バッファやサポート対象外バイナリでエラーをスローする
  - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.8_

- [x] 56.2 validateFileメソッドを変更しContent-Type設定をマジックバイト準拠にする
  - validateFileからMIMEタイプチェックとマジックバイト個別検証の呼び出しを廃止する
  - validateFileの戻り値をvoidからstringに変更し、detectMimeTypeByMagicBytesの結果を返却する
  - アップロード処理の呼び出し元でContent-Typeをマジックバイト判定結果に基づいて設定する
  - validateMimeTypeメソッドに@deprecatedアノテーションを付与する
  - ALLOWED_EXTENSIONSの参照を廃止する（ファイル名サニタイズ処理は維持）
  - 56.1の完了後に実行
  - _Requirements: 21.1, 21.7, 21.8_

- [x] 57. 拡張子不一致許容のバックエンド単体テストを実装する
- [x] 57.1 (P) detectMimeTypeByMagicBytesの単体テストを実装する
  - FF D8 FF + 各種4バイト目パターンでJPEGとして検出されることを検証する
  - PNGシグネチャでimage/pngとして検出されることを検証する
  - RIFFヘッダー+WEBPでimage/webpとして検出されることを検証する
  - 空バッファでUnsupportedImageFormatErrorがスローされることを検証する
  - 非画像バイナリでUnsupportedImageFormatErrorがスローされることを検証する
  - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.6_

- [x] 57.2 (P) validateFileの拡張子不一致許容テストを実装する
  - 拡張子.pngだが中身がJPEGのファイルでimage/jpegが返却されることを検証する
  - 拡張子.jpgだが中身がPNGのファイルでimage/pngが返却されることを検証する
  - 拡張子.txtだが中身がJPEGのファイルでimage/jpegが返却されることを検証する
  - MIMEタイプtext/plainだが中身がWEBPのファイルでimage/webpが返却されることを検証する
  - 中身がサポート対象外のファイルでUnsupportedImageFormatErrorがスローされることを検証する
  - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8_

- [x]* 57.3 (P) フロントエンドの拡張子不一致アップロード成功テストを実装する
  - handleImageUploadで拡張子不一致ファイルのアップロードが成功することを検証する
  - バリデーションエラー時にエラーメッセージが表示されることを検証する
  - _Requirements: 21.1, 21.5, 21.6_

### Phase 27: 注釈エディタ画像回転機能（要件22対応）

- [x] 58. 注釈エディタに画像回転機能を実装する
- [x] 58.1 回転状態管理と回転ハンドラを実装する
  - 背景画像の累積回転角度（0/90/180/270度）を管理するRefを追加する
  - 回転ボタン押下で背景画像を90度ずつ時計回りに回転するハンドラを実装する
  - 回転時にキャンバスサイズを画像の回転後サイズに合わせて調整する
  - 描画済みの注釈オブジェクトの位置・サイズを維持し回転に追従させない
  - 4回回転で元の角度（0度）に戻る循環的な回転角度管理を行う
  - _Requirements: 22.1, 22.2, 22.3, 22.8_

- [x] 58.2 回転操作のUndo/Redo対応を実装する
  - 回転操作をUndoManagerの履歴に記録する
  - Undo実行で前の回転角度に戻り、Redo実行で再度回転する
  - 回転操作の未保存フラグを立てる
  - 58.1の完了後に実行
  - _Requirements: 22.6_

- [x] 58.3 回転状態の保存と復元を実装する
  - 保存時に注釈データのメタデータとして回転角度を含めて永続化する
  - 注釈データ復元時に保存された回転角度を読み込んで背景画像を回転表示する
  - 回転角度が未定義の場合は0度（回転なし）として処理する
  - 閲覧モードでも回転状態が復元されることを保証する
  - 58.1の完了後に実行
  - _Requirements: 22.4, 22.5_

- [x] 58.4 ツールバーに回転ボタンを配置する
  - 注釈ツール群とは別の画像操作グループとして回転ボタンを配置する
  - Undo/Redoボタンの近くに配置し画像操作と注釈操作を視覚的に分離する
  - 保存中は回転ボタンを無効化する
  - 58.1の完了後に実行
  - _Requirements: 22.7_

- [x] 58.5 (P) サムネイル・PDF出力への回転反映を実装する
  - AnnotatedThumbnailServiceで注釈データのimageRotationを読み取りSharpで回転してからSVGオーバーレイを合成する
  - AnnotationRendererServiceでPDF報告書生成時に背景画像の回転を適用してからレンダリングする
  - imageRotationが0度または未定義の場合は回転処理をスキップする
  - _Requirements: 22.4, 22.5_

- [x] 59. 画像回転機能のテストを実装する
- [x] 59.1 (P) 回転ハンドラとキャンバスサイズ調整の単体テストを実装する
  - 0度から90度/180度/270度/0度への循環的な回転が正しく動作することを検証する
  - 90度回転後にキャンバスの幅と高さが入れ替わることを検証する
  - 回転後に描画済み注釈オブジェクトの位置・サイズが変わらないことを検証する
  - _Requirements: 22.1, 22.2, 22.3, 22.8_

- [x] 59.2 (P) Undo/Redo・保存・復元の単体テストを実装する
  - 回転操作がUndoManagerに記録されることを検証する
  - Undo実行で前の回転角度に戻ることを検証する
  - 保存データにimageRotationフィールドが含まれることを検証する
  - imageRotation付き注釈データの復元で背景画像が回転表示されることを検証する
  - imageRotationが未定義の場合は0度で表示されることを検証する
  - _Requirements: 22.4, 22.5, 22.6_

- [x] 59.3 (P) サムネイル・PDF出力での回転反映の単体テストを実装する
  - AnnotatedThumbnailServiceでimageRotationが90度の場合にSharp.rotateが呼ばれることを検証する
  - AnnotatedThumbnailServiceでimageRotationが0度または未定義の場合にSharp.rotateが呼ばれないことを検証する
  - _Requirements: 22.4, 22.5_

- [x]* 59.4 E2Eテストで画像回転機能の動作を検証する
  - 注釈エディタで回転ボタンクリックにより画像が90度回転すること
  - 回転後に既存の注釈が同じ位置に表示されること
  - 回転して保存後に再表示で回転状態が復元されること
  - 回転操作のUndo/Redoが正しく動作すること
  - 4回回転で元に戻ること
  - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 22.8_

### Phase 22: 画像編集画面での変更に伴うサムネイル再生成の確実化（要件23）

- [x] 60. バックエンド: サムネイル再生成の同期化と冪等性保証
- [x] 60.1 ThumbnailRegenerationError クラスを追加する
  - `backend/src/services/errors.ts`（既存エラー定義ファイルが無ければ新規作成）に `ThumbnailRegenerationError` クラスを定義
  - `code = 'THUMBNAIL_REGENERATION_FAILED'` 定数、`cause` オプション対応
  - export して他サービスから import 可能にする
  - 完了条件: `ThumbnailRegenerationError` を throw するテストがコンパイル・実行可能
  - _Boundary: errors.ts_
  - _Requirements: 23.6_

- [x] 60.2 AnnotatedThumbnailService.generateAnnotatedThumbnail を冪等化する
  - `backend/src/services/annotated-thumbnail.service.ts` を変更
  - 新サムネイルをタイムスタンプ付きキー `annotated-thumbnails/{imageId}.{Date.now()}.jpg` で R2 に PUT
  - DB の `annotatedThumbnailPath` を新キーに更新
  - 更新成功後に旧キーを best-effort で R2 から DELETE（失敗はログのみ）
  - R2 PUT 失敗時は DB 更新を行わず例外を throw
  - 完了条件: 連続呼び出しで既存サムネイルが破損せず、毎回新キーが返却される
  - _Depends: 60.1_
  - _Boundary: annotated-thumbnail.service.ts_
  - _Requirements: 23.8_

- [x] 60.3 AnnotationService.save のサムネイル生成を同期化する
  - `backend/src/services/annotation.service.ts:250-258` の fire-and-forget を `await` に変更
  - try/catch で失敗時に `ThumbnailRegenerationError` を throw
  - 再生成成功時に `result.annotatedThumbnailPath` を新 path で更新してから return
  - `imageRotation` のみの変更時も同じフローを通ることを保証
  - 完了条件: 単体テストで `save()` 実行後に同期的に最新 `annotatedThumbnailPath` が返却される
  - _Depends: 60.1, 60.2_
  - _Boundary: annotation.service.ts_
  - _Requirements: 23.1, 23.2, 23.3, 23.4_

- [x] 60.4 AnnotationService の単体テストを追加する
  - `backend/src/services/__tests__/annotation.service.test.ts` にテストケース追加
  - 注釈編集保存時にサムネイル再生成が完了するまで待機することを検証
  - `imageRotation` 単独変更でも再生成が呼ばれることを検証
  - 回転+注釈編集併用時に最終状態で再生成されることを検証
  - サムネイル再生成失敗時に `ThumbnailRegenerationError` が throw されることを検証
  - 完了条件: `pnpm test annotation.service` が新規テストを含めて全て pass
  - _Depends: 60.3_
  - _Boundary: annotation.service.test.ts_
  - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.6_

- [x] 60.5 (P) AnnotatedThumbnailService の単体テストを追加する
  - `backend/src/services/__tests__/annotated-thumbnail.service.test.ts` にテストケース追加
  - 連続呼び出しで異なる path が返ることを検証（冪等性）
  - R2 PUT 失敗時に DB 更新されないことを検証
  - DB 更新後に旧キー削除が best-effort で呼ばれることを検証
  - 完了条件: `pnpm test annotated-thumbnail.service` が新規テストを含めて全て pass
  - _Depends: 60.2_
  - _Boundary: annotated-thumbnail.service.test.ts_
  - _Requirements: 23.8_

- [x] 61. バックエンド: 保存レスポンスへのサムネイル URL 追加
- [x] 61.1 注釈保存 API レスポンスに annotatedThumbnailUrl を含める
  - `backend/src/routes/survey-annotations.routes.ts` の保存エンドポイントを変更
  - `AnnotationService.save` の戻り値から `annotatedThumbnailPath` を取得し署名付き URL を生成
  - レスポンス型 `SaveAnnotationResponse` に `annotatedThumbnailUrl: string | null` を追加
  - `ThumbnailRegenerationError` 捕捉時に HTTP 500 + エラーコード `THUMBNAIL_REGENERATION_FAILED` + メッセージを返却
  - 完了条件: API を手動で叩いた際に再生成後の新サムネイル URL がレスポンスに含まれる
  - _Depends: 60.3_
  - _Boundary: survey-annotations.routes.ts_
  - _Requirements: 23.5, 23.6_

- [x] 62. フロントエンド: 保存後のサムネイル反映
- [x] 62.1 注釈エディタの保存ハンドラでレスポンスの annotatedThumbnailUrl を反映する
  - `frontend/src/pages/SiteSurveyAnnotationEditorPage.tsx`（または該当保存ハンドラ）を変更
  - 保存成功時に TanStack Query の `['surveyImages', surveyId]` キャッシュを新 `annotatedThumbnailUrl` で更新、または `invalidateQueries` で再取得
  - 完了条件: 注釈保存後、別遷移なしで詳細画面サムネイルが新状態で表示される
  - _Depends: 61.1_
  - _Boundary: SiteSurveyAnnotationEditorPage.tsx_
  - _Requirements: 23.5, 23.7_

- [x] 62.2 ThumbnailRegenerationError 受信時のエラー通知を実装する
  - 保存ハンドラで `code === 'THUMBNAIL_REGENERATION_FAILED'` を判定
  - エラー Toast に「注釈は保存されましたがサムネイル再生成に失敗しました。画面を再読み込みしてください。」を表示
  - `invalidateQueries` で画像一覧を強制再取得し旧状態残留を防止
  - 完了条件: 意図的にサムネイル生成を失敗させた場合にエラー Toast が表示され、画像一覧が再取得される
  - _Depends: 61.1_
  - _Boundary: SiteSurveyAnnotationEditorPage.tsx_
  - _Requirements: 23.6_

- [x] 63. 統合テスト・E2E テスト
- [x] 63.1 E2E テスト: サムネイル再生成シナリオを追加する
  - `e2e/specs/site-survey-thumbnail-regeneration.spec.ts` を新規作成
  - シナリオ1: 注釈追加→保存→詳細画面で新サムネイル表示
  - シナリオ2: 画像回転のみ→保存→詳細画面で回転後サムネイル表示
  - シナリオ3: 回転+注釈追加→保存→詳細画面で両方反映されたサムネイル表示
  - シナリオ4: 保存→ページリロード→保存直後と同じサムネイルが表示される
  - 完了条件: `pnpm test:e2e site-survey-thumbnail-regeneration` が全シナリオ pass
  - _Depends: 60.3, 61.1, 62.1_
  - _Boundary: e2e/specs/site-survey-thumbnail-regeneration.spec.ts_
  - _Requirements: 23.1, 23.2, 23.3, 23.5, 23.7_

---

## Requirements Coverage

| 要件 | タスク                                               |
| ---- | ---------------------------------------------------- |
| 1.1  | 1.1, 1.2, 3.1, 6.1, 7.1, 9.4, 22.1, 24.1, 25.1, 26.2 |
| 1.2  | 3.2, 6.1, 9.1, 22.1, 26.2                            |
| 1.3  | 3.3, 6.1, 9.4, 22.1, 25.1, 26.2                      |
| 1.4  | 1.1, 3.4, 6.1, 26.2                                  |
| 1.5  | 3.3, 11.1, 24.1                                      |
| 1.6  | 1.1, 3.1, 24.1                                       |
| 2.1  | 10.1, 22.2, 31.1, 31.2, 31.3, 36.1, 36.6             |
| 2.2  | 10.1, 31.2, 36.1                                     |
| 2.3  | 10.3                                                 |
| 2.4  | 10.3                                                 |
| 2.5  | 10.2, 33.4, 50.1, 52.1, 52.3                        |
| 2.6  | 10.2, 33.4, 50.1, 52.1, 52.3                        |
| 2.7  | 10.2, 33.4, 50.1, 52.1, 52.3                        |
| 2.8  | 50.2, 52.1, 52.3                                    |
| 2.9  | 50.2, 52.1, 52.3                                    |
| 2.10 | 50.1, 50.2, 52.1, 52.3                              |
| 2.11 | 51.1, 52.2, 52.3                                    |
| 2.12 | 51.2, 52.2, 52.3                                    |
| 3.1  | 3.5, 6.1, 7.1, 8.1, 22.1, 25.1                       |
| 3.2  | 3.5, 8.2                                             |
| 3.3  | 3.5, 8.2                                             |
| 3.4  | 3.5, 8.2                                             |
| 3.5  | 3.5, 8.1                                             |
| 4.1  | 2.1, 4.1, 6.2, 7.2, 9.3, 24.2, 25.2, 26.2            |
| 4.2  | 4.3, 6.2, 7.2, 9.3, 24.2, 25.2                       |
| 4.3  | 4.3, 24.2                                            |
| 4.4  | 4.2, 24.2                                            |
| 4.5  | 4.1, 9.3, 24.2                                       |
| 4.6  | 4.2, 9.3, 24.2                                       |
| 4.7  | 4.5, 6.2, 7.2, 24.2, 26.2, 34.1, 34.2                |
| 4.8  | 4.1, 24.2, 32.1, 32.2, 36.2                          |
| 4.9  | 4.4, 9.2                                             |
| 4.10 | 4.4, 6.2, 7.2, 9.2                                   |
| 4.11 | 37.2, 37.3, 39.2, 39.3                               |
| 4.12 | 37.1, 37.3, 39.1, 39.3                               |
| 4.13 | 37.1, 37.3, 39.1, 39.3                               |
| 5.1  | 12.1                                                 |
| 5.2  | 12.2                                                 |
| 5.3  | 12.3                                                 |
| 5.4  | 12.4                                                 |
| 5.5  | 12.5                                                 |
| 5.6  | 12.6                                                 |
| 6.1  | 13.1, 13.2, 14.1                                     |
| 6.2  | 14.2                                                 |
| 6.3  | 14.2                                                 |
| 6.4  | 13.3, 14.3                                           |
| 6.5  | 13.3, 14.3                                           |
| 6.6  | 13.3                                                 |
| 6.7  | 13.4, 14.3                                           |
| 7.1  | 13.1, 13.2, 15.1                                     |
| 7.2  | 15.2                                                 |
| 7.3  | 15.3                                                 |
| 7.4  | 15.4                                                 |
| 7.5  | 15.5                                                 |
| 7.6  | 15.6                                                 |
| 7.7  | 13.3                                                 |
| 7.8  | 13.3                                                 |
| 7.9  | 13.3                                                 |
| 7.10 | 13.4                                                 |
| 8.1  | 13.1, 13.2, 16.1                                     |
| 8.2  | 16.2                                                 |
| 8.3  | 16.2                                                 |
| 8.4  | 13.3                                                 |
| 8.5  | 13.4, 16.2                                           |
| 8.6  | 16.3                                                 |
| 8.7  | 16.1                                                 |
| 9.1  | 5.1, 6.3, 7.3, 24.3, 26.2, 33.3, 36.3, 36.6          |
| 9.2  | 5.2, 6.3, 7.3, 24.3                                  |
| 9.3  | 19, 33.2, 33.3, 36.3, 36.6                           |
| 9.4  | 5.1                                                  |
| 9.5  | 11.2                                                 |
| 9.6  | 5.3, 7.3, 24.3                                       |
| 10.1 | 27.4, 27.6, 30.2, 30.5                               |
| 10.2 | 27.2, 30.1, 30.2, 30.5                               |
| 10.3 | 27.2, 30.1, 30.2, 30.5                               |
| 10.4 | 27.1, 27.2, 27.3, 30.1, 30.2, 30.5                   |
| 10.5 | 37.2, 37.3, 39.2, 39.3                               |
| 10.6 | 37.1, 37.3, 39.1, 39.3                               |
| 10.7 | 37.1, 37.3, 39.1, 39.3                               |
| 10.8 | 27.1, 27.4, 30.1, 30.5                               |
| 10.9 | 33.1, 37.3, 38.1, 38.2, 36.3, 36.6                   |
| 10.10| 33.2, 36.3, 36.6                                     |
| 10.11| 34.1, 34.2, 37.4, 36.4, 36.6, 39.3                   |
| 10.12| 34.2, 37.4, 36.4, 36.6, 39.3                         |
| 11.1 | 28.3, 30.5                                           |
| 11.2 | 28.1, 30.1, 30.5                                     |
| 11.3 | 28.1, 30.5                                           |
| 11.4 | 28.2, 30.3, 30.5                                     |
| 11.5 | 28.2, 30.3, 30.5                                     |
| 11.6 | 28.2, 30.3, 30.5                                     |
| 11.7 | 28.4, 30.3, 30.5                                     |
| 11.8 | 28.3, 30.5                                           |
| 11.9 | 44.1, 44.2, 44.3, 44.4                               |
| 12.1 | 29.1, 29.3, 30.4, 30.5                               |
| 12.2 | 29.1, 30.4, 30.5                                     |
| 12.3 | 29.1, 30.4, 30.5                                     |
| 12.4 | 29.2, 30.4, 30.5                                     |
| 12.5 | 29.4, 30.5                                           |
| 13.1 | 8.3                                                  |
| 13.2 | 12.5                                                 |
| 13.3 | 9.3                                                  |
| 13.4 | 18.1, 25.3                                           |
| 13.5 | 18.2, 18.3                                           |
| 13.6 | 18.4                                                 |
| 14.1 | 23.1                                                 |
| 14.2 | 23.2                                                 |
| 14.3 | 4.2                                                  |
| 14.4 | (インフラレベル、タスク対象外)                       |
| 14.5 | (インフラレベル、タスク対象外)                       |
| 14.6 | 2.1, 2.2                                             |
| 14.7 | (運用レベル、タスク対象外)                           |
| 14.8 | 11.2                                                 |
| 15.1 | 8.3                                                  |
| 15.2 | 12.5                                                 |
| 15.3 | 9.3                                                  |
| 15.4 | 18.1, 25.3                                           |
| 15.5 | 18.2, 18.3                                           |
| 15.6 | 18.4                                                 |
| 15.7 | 35.3, 35.6, 36.5, 36.6                               |
| 15.8 | 35.4, 35.6, 36.5, 36.6                               |
| 15.9 | 35.2, 35.5, 35.6, 36.5, 36.6                         |
| 15.10| 35.1, 35.6, 36.5, 36.6                               |
| 16.1 | 23.1                                                 |
| 16.2 | 23.2                                                 |
| 16.3 | 4.2                                                  |
| 16.4 | (インフラレベル、タスク対象外)                       |
| 16.5 | (インフラレベル、タスク対象外)                       |
| 16.6 | 2.1, 2.2                                             |
| 16.7 | (運用レベル、タスク対象外)                           |
| 16.8 | 11.2                                                 |
| 17.1 | 40.1                                                 |
| 17.2 | 40.1                                                 |
| 17.3 | 40.1                                                 |
| 17.4 | 40.1                                                 |
| 17.5 | 40.1                                                 |
| 17.6 | 40.1                                                 |
| 18.1 | 41.1, 41.2, 42.1, 43.1, 43.2, 43.3, 43.5            |
| 18.2 | 42.1, 42.2, 43.4, 43.5                               |
| 18.3 | 41.1, 41.2, 43.1                                     |
| 18.4 | 41.1, 43.1                                           |
| 18.5 | 42.2, 43.4, 43.5                                     |
| 18.6 | 41.2, 43.2                                           |
| 18.7 | 42.1, 42.2, 43.3, 43.4                               |
| 18.8 | 41.1, 43.1                                           |
| 19.1 | 45, 47, 49                                           |
| 19.2 | 45, 47, 49                                           |
| 19.3 | 45, 47                                               |
| 19.4 | 45, 47                                               |
| 19.5 | 45, 47                                               |
| 19.6 | 45, 47                                               |
| 19.7 | 45, 47, 49                                           |
| 19.8 | 45, 47                                               |
| 19.9 | 45, 47                                               |
| 19.10| 46.1, 48.1, 49                                       |
| 19.11| 46.2, 48.2, 49                                       |
| 19.12| 46.1, 48.1, 49                                       |
| 19.13| 46.2, 48.2                                           |
| 19.14| 46.2, 48.2, 49                                       |
| 19.15| 46.2, 48.2                                           |
| 19.16| 46.1, 46.2, 48.1, 48.2, 49                           |
| 20.1 | 54.1, 55.2, 55.3                                    |
| 20.2 | 53.4, 54.2, 55.2, 55.3                              |
| 20.3 | 53.4, 54.3, 55.2, 55.3                              |
| 20.4 | 53.1, 53.2, 53.3, 53.4, 55.1, 55.3                  |
| 21.1 | 56.1, 56.2, 57.1, 57.2, 57.3                        |
| 21.2 | 56.1, 57.1, 57.2                                    |
| 21.3 | 56.1, 57.1, 57.2                                    |
| 21.4 | 56.1, 57.1, 57.2                                    |
| 21.5 | 56.1, 57.2, 57.3                                    |
| 21.6 | 56.1, 57.1, 57.2, 57.3                              |
| 21.7 | 56.2, 57.2                                          |
| 21.8 | 56.1, 56.2, 57.2                                    |
| 22.1 | 58.1, 59.1, 59.4                                    |
| 22.2 | 58.1, 59.1, 59.4                                    |
| 22.3 | 58.1, 59.1, 59.4                                    |
| 22.4 | 58.3, 58.5, 59.2, 59.3, 59.4                        |
| 22.5 | 58.3, 58.5, 59.2, 59.3, 59.4                        |
| 22.6 | 58.2, 59.2, 59.4                                    |
| 22.7 | 58.4, 59.4                                          |
| 22.8 | 58.1, 59.1, 59.4                                    |
| 23.1 | 60.3, 60.4, 63.1                                    |
| 23.2 | 60.3, 60.4, 63.1                                    |
| 23.3 | 60.3, 60.4, 63.1                                    |
| 23.4 | 60.3, 60.4                                          |
| 23.5 | 61.1, 62.1, 63.1                                    |
| 23.6 | 60.1, 60.3, 60.4, 61.1, 62.2                        |
| 23.7 | 62.1, 63.1                                          |
| 23.8 | 60.2, 60.5                                          |

---

## Requirements 24-30: 画像注釈の視認性向上・モバイル操作性強化

Requirements 24 以降の実装タスク。design.md の `## Requirements 24-30` セクションに対応。既存 Requirement 1〜23 の責務境界は維持し、新規ファイル追加と既存ファイルの最小変更で構成する。

- [ ] 64. ツール横断スタイルトークンの導入（Foundation）
- [x] 64.1 `annotation-style-tokens.ts` を新規作成しツール横断の既定値を一元化
  - 既定本体色、既定線幅、既定フォントサイズ、矢印白縁取り既定（enabled=true）、テキスト白アウトライン既定（enabled=true）を保持する
  - 既定線幅は 3 論理ピクセル以上、既定本体色は赤系/橙系の視認性確保カラーを採用する
  - 観測可能な完了状態: `ANNOTATION_DEFAULTS` を import すると矢印/テキスト用の既定値が取得でき、各値がユニットテストで検証可能
  - _Requirements: 26.1, 26.2, 26.3, 26.5_
  - _Boundary: AnnotationStyleTokens_

- [x] 64.2 `annotation-toolbar.constants.ts` をトークン参照へ移行
  - 既存 `DEFAULT_STYLE_OPTIONS` の値を `annotation-style-tokens` から import する形に置換する
  - トークン側と重複していた値はトークンを単一情報源とし、定数ファイルからは撤去する
  - 観測可能な完了状態: `DEFAULT_STYLE_OPTIONS` が `ANNOTATION_DEFAULTS` を展開した形になっており、既存 import 元は変更不要で同値を取得できる
  - _Requirements: 26.5_
  - _Boundary: AnnotationStyleTokens_

- [x] 64.3 各ツール側の既定値定数をトークン参照へ差し替え
  - `ArrowTool.ts`、`TextTool.ts`、`RectangleTool.ts`、`CircleTool.ts`、`PolygonTool.ts`、`PolylineTool.ts`、`FreehandTool.ts`、`DimensionTool.ts` のツール別 `DEFAULT_*_OPTIONS` をトークン参照に置換する
  - 既定本体色の不整合（Arrow の黒固定など）をトークンの既定に統一する
  - 観測可能な完了状態: 各ツールのツール別定数を検査すると、重複していた色/線幅ハードコードが削除され `ANNOTATION_DEFAULTS` を参照する形になっている
  - _Requirements: 26.1, 26.2, 26.5_
  - _Boundary: Tools Layer_

- [x] 64.4 トークンの単体テスト
  - 既定線幅が視認性要件を満たすこと、矢印/テキストの白縁取り既定が enabled=true であることを検証する
  - 観測可能な完了状態: テストスイートで `ANNOTATION_DEFAULTS.strokeWidth >= 3`、`arrowOutline.enabled === true`、`textOutline.enabled === true` が全て pass
  - _Requirements: 26.1, 26.2, 26.3_
  - _Boundary: AnnotationStyleTokens_

- [ ] 65. (P) 矢印の Group 化と白縁取り
- [x] 65.1 Arrow クラスを Group ベースへ再設計
  - 既存 `generateArrowPath` を流用し、Group の子として白い外側 Path（縁取り）と本体色の内側 Path を持つ構成に変更する
  - 外側 Path の線幅は本体線幅の 1.5 倍以上、ストロークは白固定、`strokeLineCap: 'round'`、`strokeLineJoin: 'round'` を適用する
  - 本体色変更・リサイズ・回転・移動時に Group の scale 伝搬で白縁取りが本体と同期して変形する
  - 観測可能な完了状態: Canvas に矢印を配置するとデベロッパーツール上で Group が 2 つの Path（outlinePath, bodyPath）を持ち、白縁取りが目視確認できる
  - _Requirements: 24.1, 24.2, 24.3, 24.4_
  - _Boundary: Arrow_

- [x] 65.2 矢印 outline 属性のシリアライズと防御的フォールバック
  - `outline: { enabled, color, width }` 属性を `toObject` に含め、`enabled=false` 時は `outlinePath.opacity=0` で非表示化する
  - `fromObject` で `outline` 未定義データは白縁取り無しの従来表現でフォールバックし、必須フィールド欠落時は安全な既定（座標 (0,0)、stroke 黒、strokeWidth 2、arrowheadSize 10）で復元し warning ログを送出する
  - 白縁取りの有効化/無効化操作が Undo/Redo 履歴に記録される
  - 観測可能な完了状態: 保存→再ロードで outline が復元され、outline 属性欠落 JSON を読み込んでも例外にならず従来表現で表示される
  - _Requirements: 24.5, 24.6, 24.7, 24.9, 24.10_
  - _Boundary: Arrow_

- [x] 65.3 `registerCustomShapes` で Group 版 Arrow を再登録
  - `classRegistry.setClass('arrow', Arrow)` の対象クラスを Group 版に差し替える
  - `type: 'arrow'` の文字列 ID は維持し、既存データの `enlivenObjects` 経路を壊さない
  - 観測可能な完了状態: 旧 Path 形式で保存された `{type: 'arrow', ...}` JSON を `util.enlivenObjects` に渡すと新 Group 版 Arrow として復元される
  - _Requirements: 24.9_
  - _Boundary: Arrow_

- [x] 65.4 矢印の単体テスト（白縁取り・後方互換）
  - 白縁取り有効時に Group の子が 2 つになること、`setOutline({enabled:false})` で outlinePath の opacity が 0 になること、`toObject`→`fromObject` ラウンドトリップで outline が保持されることを検証する
  - outline 未定義の旧形式 JSON から白縁取り無しとして復元されることを検証する
  - 観測可能な完了状態: 上記 4 ケースを含む単体テストが全て pass
  - _Requirements: 24.1, 24.5, 24.7, 24.9_
  - _Boundary: Arrow_

- [ ] 66. (P) テキスト注釈の白アウトライン
- [x] 66.1 IText に `paintFirst: 'stroke'` と白ストローク設定を導入
  - テキスト生成時に `paintFirst: 'stroke'`、`stroke: '#ffffff'`、`strokeWidth = fontSize × widthRatio`、`strokeUniform: true` を設定する
  - 既存の `splitByGrapheme: true` と `backgroundColor` 設定は維持し、白アウトラインと背景色を独立制御可能にする
  - 観測可能な完了状態: 背景色なしのテキスト注釈を配置すると、明背景/暗背景の両方で白アウトラインにより文字が視認可能
  - _Requirements: 25.1, 25.3, 25.12_
  - _Boundary: TextAnnotation_

- [x] 66.2 textOutline 属性のシリアライズとフォントサイズ連動
  - `textOutline: { enabled, widthRatio }` 属性を `toObject` に含め、`enabled=false` 時は `stroke: ''` で無効化する
  - フォントサイズ変更時に `strokeWidth = fontSize × widthRatio`（既定 widthRatio=0.12、範囲 0.10〜0.20）を `object:modified` で自動再計算する
  - `textOutline` 未定義の旧データは白アウトライン無しの従来表現でフォールバックする
  - 白アウトライン有効化/無効化操作が Undo/Redo 履歴に記録される
  - 観測可能な完了状態: フォントサイズ 16→32 に変更するとアウトライン幅も比例して更新され、旧形式 JSON 読込で例外が発生しない
  - _Requirements: 25.2, 25.4, 25.5, 25.6, 25.7, 25.8, 25.10, 25.11_
  - _Boundary: TextAnnotation_

- [x] 66.3 テキスト注釈の単体テスト（白アウトライン・マルチバイト・後方互換）
  - `setTextOutline({enabled:true, widthRatio:0.15})` で `paintFirst==='stroke'` かつ `strokeWidth===fontSize*0.15` を検証する
  - 日本語を含むマルチバイト文字のレンダリングで白アウトラインが正しく適用されることを検証する
  - `backgroundColor` と `textOutline` が独立に変更可能なことを検証する
  - `textOutline` 未定義の旧形式 JSON から従来表現で復元されることを検証する
  - 観測可能な完了状態: 上記 4 ケースを含む単体テストが全て pass
  - _Requirements: 25.1, 25.3, 25.5, 25.10, 25.12_
  - _Boundary: TextAnnotation_

- [ ] 67. (P) タッチジェスチャー判定基盤
- [x] 67.1 `gesture-thresholds.ts` 閾値定数モジュール
  - `DOUBLE_TAP_MS = 300`、`LONG_PRESS_MS = 500`、`COOLDOWN_MS = 150`、`DRAG_THRESHOLD_PX = 8`、`GUIDE_IDLE_MS = 3000` を定義する
  - 観測可能な完了状態: 各閾値定数が import 可能で、touchGestureManager およびガイド表示から参照される
  - _Requirements: 27.6_
  - _Boundary: Gestures Layer_

- [x] 67.2 `touchGestureManager` の state machine と custom イベント emitter 実装
  - `attach(canvas, getCurrentTool): detachFn` 形式で Fabric Canvas にアタッチする
  - `enablePointerEvents: true` を初手採用し、canvas element の `pointerdown/pointermove/pointerup/pointercancel` を listen する
  - state machine（`idle → one-finger-down → drawing | long-press | double-tap | two-finger-pinch-pan | three-plus-suspend → cooldown → idle`）を実装する
  - ダブルタップ検出時に `canvas.fire('custom:dbltap', payload)`、長押し検出時に `canvas.fire('custom:longpress', payload)` を発火する
  - payload には `pointerType, clientX, clientY, target?, currentTool` を含める
  - 観測可能な完了状態: 300ms 以内の 2 連続 down で `custom:dbltap` が、500ms 保持で `custom:longpress` が発火する
  - _Requirements: 27.1, 27.2, 27.6, 30.1, 30.2, 30.3, 30.6, 30.7, 30.8_
  - _Boundary: touchGestureManager_

- [x] 67.3 `ImageViewer.tsx` 側の 3 本指抑止と cooldown 連携
  - `handleTouchStart` / `handleTouchMove` で `touches.length >= 3` を検出し、touchGestureManager に `three-plus-suspend` 遷移を通知、進行中のズーム/パンを中止する
  - `touchend` で `touches.length === 0` かつ前状態が `three-plus-suspend` の場合、150ms の cooldown タイマで `idle` 復帰する
  - 既存 1 本指パン / 2 本指ピンチズームの Req 5 挙動は変更しない
  - 観測可能な完了状態: 3 本指でタッチするとズーム/パン動作が停止し、全指離脱後 150ms 待ってから新規描画が受け付けられる
  - _Requirements: 30.1, 30.2, 30.3, 30.5, 30.6, 30.8_
  - _Boundary: ImageViewer (touch ext)_

- [x] 67.4 `touchGestureManager` の単体テスト
  - Jest の fake timers で各 state 遷移と閾値（300ms/500ms/150ms）を検証する
  - 2 本指タッチで `two-finger-pinch-pan` へ、3 本指で `three-plus-suspend` へ遷移することを確認する
  - 3 本指中は新規描画コミットが抑止されることを確認する
  - 観測可能な完了状態: state machine の全遷移パスを含む単体テストが全て pass
  - _Requirements: 27.6, 30.2, 30.3, 30.4, 30.8_
  - _Boundary: touchGestureManager_

- [ ] 68. (P) `AnnotationContextMenu` コンポーネント
- [x] 68.1 `AnnotationContextMenu.tsx` 新規作成
  - `{ visible, position, targetObject, onAction, onClose }` プロパティを受ける React コンポーネントを作成する
  - アクション項目: 編集（テキストのみ有効）、複製、削除を表示する
  - メニュー外タップ検知のため透明オーバーレイ `<div>` を背景に配置する
  - タップ領域は最小 44x44 論理ピクセル以上とする
  - 観測可能な完了状態: Storybook または単体テストで props を与えて描画するとメニュー項目が視覚的に表示され、各項目のクリック/タップで `onAction` が対応する `ContextMenuAction` を返す
  - _Requirements: 27.2, 27.3, 27.4, 27.5_
  - _Boundary: AnnotationContextMenu_

- [x] 68.2 `AnnotationContextMenu` の単体コンポーネントテスト
  - `visible=true` で表示され、`visible=false` で非表示になることを検証する
  - 各アクション（edit / duplicate / delete）のタップで対応する action 値が onAction に渡されることを検証する
  - メニュー外タップで onClose が呼ばれることを検証する
  - 観測可能な完了状態: 上記 3 ケースを含む React Testing Library ベースのテストが全て pass
  - _Requirements: 27.2, 27.3, 27.5_
  - _Boundary: AnnotationContextMenu_

- [ ] 69. (P) `AnnotationGuide` コンポーネント
- [x] 69.1 `AnnotationGuide.tsx` 新規作成
  - `{ visible, toolKind, onDismiss }` プロパティを受ける React コンポーネントを作成する
  - ツール種別に応じた簡易ガイド文言（例: 「ドラッグで描画」「タップでテキスト入力」）を表示する
  - 画像領域に非侵襲的にオーバーレイ表示し、任意タップで dismiss する
  - 観測可能な完了状態: 単体レンダリングテストで toolKind=`arrow` のときに「ドラッグで描画」などのガイド文言が DOM に現れる
  - _Requirements: 29.7, 29.8_
  - _Boundary: AnnotationGuide_

- [ ] 70. (P) モバイルツールバー拡張
- [ ] 70.1 ツールバーの flexWrap と 44x44 タップ領域、ツールバー領域の描画抑止境界を導入
  - `AnnotationToolbar.tsx` の `STYLES.toolbar` に `flexWrap: 'wrap'` を追加し、既存 `overflowX: 'auto'` と両立させる
  - 各ボタンの `minWidth/minHeight` を 44 論理ピクセルに統一する
  - 端末回転（縦横）時に `window.innerWidth` 変化でレイアウトが自動再構成される
  - ツールバーコンテナに `pointerEvents: auto` を設定し、ツールバー領域内のタップ/クリックが背景画像 canvas への描画として発火しないよう領域境界を確立する
  - 観測可能な完了状態: モバイル Viewport (375x667) で全ツールボタンにタップ到達可能で、端末回転時にツールバーが折り返される。ツールバー領域上をタップしても新規注釈オブジェクトが canvas に追加されない
  - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.6_
  - _Boundary: AnnotationToolbar_

- [ ] 70.2 `StylePanel` 開閉トグルと白縁取り切替 UI の追加
  - モバイル幅（`matchMedia('(max-width: 768px)')`）では StylePanel を初期折りたたみ、デスクトップ幅では初期展開する
  - 矢印ツール選択時に「白縁取り」ON/OFF トグル、テキストツール選択時に「白アウトライン」ON/OFF トグルを StylePanel に追加する
  - 選択中ツールを再タップすると StylePanel の開閉がトグルする
  - 白縁取り/白アウトラインのトグル値、色、線幅を既存 `StyleOptions`（`AnnotationEditor.styleOptionsRef` が保持）に統合し、同ツール再利用時に直前の設定を引き継ぐ
  - 観測可能な完了状態: 矢印で白縁取りOFFに切替→別ツールへ→再度矢印選択→直前の白縁取りOFF設定が復元され、次の新規矢印も白縁取りOFFで描画される
  - _Depends: 65.2, 66.2_
  - _Requirements: 24.5, 25.2, 26.3, 26.4, 26.6, 28.8, 29.1_
  - _Boundary: AnnotationToolbar, StylePanel, StyleOptions_

- [ ] 70.3 色・線幅ピッカーのタッチ誤選択抑止レイアウト
  - モバイル幅で色ピッカー・線幅ピッカーの各要素間の余白を誤選択しにくい最小間隔（隣接タップ領域間に 8px 以上）で配置する
  - 観測可能な完了状態: モバイル Viewport で隣接する色選択要素をタップした際に、意図した色のみが選択され、隣接色が誤選択されない
  - _Requirements: 28.7_
  - _Boundary: AnnotationToolbar, StylePanel_

- [ ] 71. (P) 視覚フィードバック基盤設定モジュール
- [ ] 71.1 ハンドルサイズのメディアクエリ分岐設定モジュール
  - `annotation-visual-feedback.ts`（新規）に `configureHandleSizes()` 関数を作成し、`matchMedia('(pointer: coarse)')` でタッチ/マウスを判定する
  - タッチ時は `FabricObject.ownDefaults.cornerSize = 20`、`touchCornerSize = 40`、マウス時はそれぞれ 13 / 24 に設定する
  - 観測可能な完了状態: 関数呼出後、新規作成した FabricObject の `cornerSize` がデバイスに応じた値になる
  - _Requirements: 29.4, 29.5_
  - _Boundary: Visual Feedback_

- [ ] 71.2 ツール別カーソルマップと適用関数
  - `annotation-visual-feedback.ts` に `applyToolCursor(canvas, tool)` 関数を作成する
  - ツール別カーソルマップ（例: 矢印ツール→crosshair、テキストツール→text、選択ツール→default）を定義する
  - `canvas.defaultCursor`、`canvas.hoverCursor`、`canvas.freeDrawingCursor` を適宜更新する
  - 観測可能な完了状態: `applyToolCursor(canvas, 'arrow')` 呼出後、`canvas.defaultCursor === 'crosshair'` が成立する
  - _Requirements: 29.2_
  - _Boundary: Visual Feedback_

- [ ] 72. AnnotationEditor 統合（Integration）
- [ ] 72.1 `touchGestureManager` の attach/detach を useEffect で配線
  - 初期化 useEffect で `touchGestureManager.attach(canvas, () => activeToolRef.current)` を実行し、cleanup で detach を呼ぶ
  - ハンドルサイズ設定 `configureHandleSizes()` を同 useEffect で 1 回実行する
  - 観測可能な完了状態: AnnotationEditor マウント時に touchGestureManager が canvas にアタッチされ、unmount 時に detach が呼ばれる（テストで verify）
  - _Depends: 67.2, 71.1_
  - _Requirements: 27.1, 27.2, 29.4, 29.5, 30.1_
  - _Boundary: AnnotationEditor (ext)_

- [ ] 72.2 `custom:dbltap` / `custom:longpress` ハンドラ配線と Req 17 調停
  - `canvas.on('custom:dbltap', handleDoubleTap)` と `canvas.on('custom:longpress', handleLongPress)` を配線する
  - `handleDoubleTap`: target が TextAnnotation なら `target.enterEditing()` を呼ぶ。マウス環境の既存 `mousedblclick` 動作は維持する
  - `handleLongPress`: 選択ツール選択中のみコンテキストメニューを表示、描画ツール選択中は Req 17 準拠で無視する
  - 各アクション実行は既存 `useFabricUndoIntegration` 経由で Undo/Redo 履歴に記録される
  - 観測可能な完了状態: テキスト注釈をダブルタップすると編集モードに入り、描画ツール選択中に長押ししてもコンテキストメニューが表示されない
  - _Depends: 67.2_
  - _Requirements: 27.1, 27.7, 27.8, 27.9, 27.10_
  - _Boundary: AnnotationEditor (ext)_

- [ ] 72.3 `AnnotationContextMenu` のマウントと状態管理
  - AnnotationEditor に `{ visible, position, targetObject }` の state を追加し、`handleLongPress` で visible=true にする
  - ContextMenu visible 中は `canvas.skipTargetFind = true` で背景描画を抑止する
  - edit/duplicate/delete アクションの canvas 操作（duplicate は clone + offset、delete は remove）を実装する
  - 観測可能な完了状態: 選択ツールで注釈オブジェクトを長押し→メニュー表示→delete タップで当該オブジェクトが canvas から削除され、Undo で復元可能
  - _Depends: 68.1_
  - _Requirements: 27.2, 27.3, 27.4, 27.5, 27.7_
  - _Boundary: AnnotationEditor (ext)_

- [ ] 72.4 `AnnotationGuide` のマウントと idle タイマー連動
  - ツール選択変更時に idle タイマ（`GUIDE_IDLE_MS=3000`）を開始する
  - 3 秒間描画操作が無い場合に AnnotationGuide を visible にする
  - 描画開始または別操作で guide を dismiss する
  - 観測可能な完了状態: 矢印ツール選択後 3 秒経過でガイドが表示され、描画操作を開始すると即座に消える
  - _Depends: 69.1_
  - _Requirements: 29.7, 29.8_
  - _Boundary: AnnotationEditor (ext)_

- [ ] 72.5 ツール切替時のカーソル適用連動
  - ツール変更の useEffect で `applyToolCursor(canvas, activeTool)` を呼び出す
  - `canvas.setCursor(canvas.defaultCursor)` を明示呼出してカーソル切替を即時反映する
  - 観測可能な完了状態: ツールバーで矢印→テキストを切替えると、画像領域上のマウスカーソルが crosshair→text に変わる
  - _Depends: 71.2_
  - _Requirements: 29.1, 29.2_
  - _Boundary: AnnotationEditor (ext)_

- [ ] 72.6 `AnnotationRendererService` での Group 矢印と textStroke 出力の統合検証
  - Group 版 Arrow と `paintFirst: 'stroke'` テキストが toDataURL で正しく書き出されることを既存レンダラで検証する
  - 既存の `strokeWidth` スケーリング分岐は Group Arrow ではスキップされるが、Group の `scaleX/scaleY` 伝搬で描画結果が正しいことを確認する
  - スケール非等倍（保存時と描画時で canvas サイズが異なる）条件でも白縁取り・白アウトラインが期待幅でレンダリングされる
  - 観測可能な完了状態: 統合テストで Group 矢印と paintFirst テキストをレンダリングした dataURL のピクセルサンプリングで白縁取り/アウトラインが検出される
  - _Depends: 65.1, 66.1_
  - _Requirements: 24.8, 25.9_
  - _Boundary: AnnotationRendererService_

- [ ] 73. E2E 検証（Validation）
- [ ] 73.1 モバイル Viewport での主要シナリオ E2E
  - Playwright のモバイル Viewport (375x667) で以下シナリオを検証する: (a) 白縁取り付き矢印を配置→保存→リロード→復元、(b) テキスト注釈に白アウトラインを付与→保存→リロード→復元、(c) 既存注釈を長押しでコンテキストメニュー表示→削除、(d) 既存テキストをダブルタップで編集モード、(e) モバイルツールバーの全ツールにタップ到達可能
  - 観測可能な完了状態: 上記 5 シナリオを含む E2E テストが CI で全て pass
  - _Requirements: 24.1, 24.6, 24.7, 25.1, 25.7, 25.8, 27.1, 27.2, 27.3, 28.1, 28.5_
  - _Boundary: E2E Spec_

- [ ] 73.2 スケール非等倍時の矢印・テキスト書き出し統合テスト
  - 保存時 canvas サイズと復元時 canvas サイズが異なる条件で Group 矢印・paintFirst テキストを書き出し、白縁取り/白アウトラインの太さが期待通りにスケーリングされることを検証する
  - Req 30 のマルチタッチ中に誤発火した描画が Undo で 1 ステップ復旧できることを統合テストで検証する
  - 観測可能な完了状態: 2 つの統合テストが pass
  - _Requirements: 24.8, 25.9, 30.4_
  - _Boundary: Integration Test_

- [ ] 74. パフォーマンス検証
- [ ] 74.1 Arrow Group の高頻度描画 FPS 検証
  - 100 個の Group 矢印を canvas に配置し、全体ドラッグ/ズーム時の描画 FPS を計測する
  - `objectCaching` 設定（Group は false、子 Path は true）が期待通りに機能し、Requirement 16.2 の 60fps 目標を維持できるかを検証する
  - 60fps を下回る場合は `objectCaching` 設定を見直すまたは代替戦略を検討する
  - 観測可能な完了状態: パフォーマンスベンチマークで 100 オブジェクト配置時の平均描画 FPS が 60 を維持する計測結果が得られる
  - _Requirements: 24.1_
  - _Boundary: Performance Test_

### Requirements Traceability（Requirements 24-30）

| Req  | 対応タスク                                                         |
|------|------------------------------------------------------------------|
| 24.1 | 65.1, 65.4, 73.1, 74.1                                           |
| 24.2 | 65.1                                                             |
| 24.3 | 65.1                                                             |
| 24.4 | 65.1                                                             |
| 24.5 | 65.2, 65.4, 70.2                                                 |
| 24.6 | 65.2, 73.1                                                       |
| 24.7 | 65.2, 65.4, 73.1                                                 |
| 24.8 | 72.6, 73.2                                                       |
| 24.9 | 65.2, 65.3, 65.4                                                 |
| 24.10| 65.2                                                             |
| 25.1 | 66.1, 66.3, 73.1                                                 |
| 25.2 | 66.2, 70.2                                                       |
| 25.3 | 66.1, 66.3                                                       |
| 25.4 | 66.2                                                             |
| 25.5 | 66.2, 66.3                                                       |
| 25.6 | 66.2                                                             |
| 25.7 | 66.2, 73.1                                                       |
| 25.8 | 66.2, 73.1                                                       |
| 25.9 | 72.6, 73.2                                                       |
| 25.10| 66.2, 66.3                                                       |
| 25.11| 66.2                                                             |
| 25.12| 66.1, 66.3                                                       |
| 26.1 | 64.1, 64.3, 64.4                                                 |
| 26.2 | 64.1, 64.3, 64.4                                                 |
| 26.3 | 64.1, 64.4, 70.2                                                 |
| 26.4 | 70.2                                                             |
| 26.5 | 64.1, 64.2, 64.3                                                 |
| 26.6 | 70.2                                                             |
| 27.1 | 67.2, 72.1, 72.2, 73.1                                           |
| 27.2 | 67.2, 68.1, 68.2, 72.3, 73.1                                     |
| 27.3 | 68.1, 68.2, 72.3, 73.1                                           |
| 27.4 | 68.1, 72.3                                                       |
| 27.5 | 68.1, 68.2, 72.3                                                 |
| 27.6 | 67.1, 67.2, 67.4                                                 |
| 27.7 | 72.2, 72.3                                                       |
| 27.8 | 72.2                                                             |
| 27.9 | 72.2                                                             |
| 27.10| 72.2                                                             |
| 28.1 | 70.1, 73.1                                                       |
| 28.2 | 70.1                                                             |
| 28.3 | 70.1                                                             |
| 28.4 | 70.1                                                             |
| 28.5 | 70.1, 73.1                                                       |
| 28.6 | 70.1                                                             |
| 28.7 | 70.3                                                             |
| 28.8 | 70.2                                                             |
| 29.1 | 70.2, 72.5                                                       |
| 29.2 | 71.2, 72.5                                                       |
| 29.3 | 既存 Fabric ドラッグ中プレビュー挙動を維持                         |
| 29.4 | 71.1, 72.1                                                       |
| 29.5 | 71.1, 72.1                                                       |
| 29.6 | 既存 `title`/`aria-label` 実装を維持                              |
| 29.7 | 69.1, 72.4                                                       |
| 29.8 | 69.1, 72.4                                                       |
| 30.1 | 67.2, 67.3, 72.1                                                 |
| 30.2 | 67.2, 67.3, 67.4                                                 |
| 30.3 | 67.2, 67.3, 67.4                                                 |
| 30.4 | 67.4, 73.2                                                       |
| 30.5 | 67.3                                                             |
| 30.6 | 67.2, 67.3                                                       |
| 30.7 | 67.2                                                             |
| 30.8 | 67.2, 67.4                                                       |

---

## Implementation Notes

- **64.4**: トークン単体テスト（`ANNOTATION_DEFAULTS.strokeWidth >= 3`、`arrowOutline.enabled === true`、`textOutline.enabled === true`）は 64.1 で `annotation-style-tokens.test.ts` に先行実装済み。同ファイル 12 テスト全合格を確認（vitest）して観測可能完了状態を満たすため、差分コード追加なしでクローズ。
- **65.4**: 矢印の単体テスト 4 ケース（Group 2 子、`setOutline({enabled:false})` で opacity=0、toObject→fromObject round-trip、legacy JSON 後方互換）は 65.1 の `ArrowTool.outline.test.ts`（19 テスト）、65.2 の `ArrowTool.serialization.test.ts`（17 テスト）、65.3 の `registerCustomShapes.arrow.test.ts`（6 テスト）に既に実装・合格済み。観測可能完了状態を満たすため追加実装なしでクローズ。
- **66.3**: テキスト注釈の単体テスト 4 ケース（`setTextOutline({widthRatio:0.15})` で strokeWidth=fontSize*0.15、日本語マルチバイト白アウトライン適用、backgroundColor と textOutline の独立性、旧形式 JSON の後方互換復元）は 66.1 の `TextTool.outline.test.ts`（9 テスト、多バイト含む）、66.2 の `TextTool.serialization.test.ts`（25 テスト、widthRatio=0.15 round-trip / backgroundColor 独立 / legacy JSON 含む）に既に実装・合格済み。観測可能完了状態を満たすため追加実装なしでクローズ。
- **67.4**: touchGestureManager 単体テスト（fake timers、300ms/500ms/150ms 閾値、2/3+ 指遷移、描画コミット抑止）は 67.2 の `touchGestureManager.test.ts`（18 テスト、全 state 遷移と payload 検証）に既に実装・合格済み。観測可能完了状態を満たすため追加実装なしでクローズ。
- **68.2**: AnnotationContextMenu 単体テスト 3 ケース（visible トグル、edit/duplicate/delete アクション、外タップ close）は 68.1 の `AnnotationContextMenu.test.tsx`（16 テスト）で既にカバー済み。観測可能完了状態を満たすため追加実装なしでクローズ。
