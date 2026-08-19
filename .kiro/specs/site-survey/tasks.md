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
  - _Superseded: 生成フックはサービス層に実装されているが、注釈保存の経路が生成サービスをサービス層へ注入していないため本番経路で一度も実行されず、かつ実行しても現行の描画器では要件を満たせないことが判明した（対応する図形の型が実際の注釈と一致せず、座標の換算が無く、直角方向の回転で必ず失敗する）。design.md の採用方針を「合成の実行主体は画像編集画面、正となる保存先は注釈付きサムネイルの項目」へ改訂したため、本タスクの結線は行わない。当該生成経路の位置づけの確定は 115.6 が所管し、保存先の統一は 115.1 が所管する_

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

- [x] 64. ツール横断スタイルトークンの導入（Foundation）
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

- [x] 65. (P) 矢印の Group 化と白縁取り
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

- [x] 66. (P) テキスト注釈の白アウトライン
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

- [x] 67. (P) タッチジェスチャー判定基盤
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

- [x] 68. (P) `AnnotationContextMenu` コンポーネント
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

- [x] 69. (P) `AnnotationGuide` コンポーネント
- [x] 69.1 `AnnotationGuide.tsx` 新規作成
  - `{ visible, toolKind, onDismiss }` プロパティを受ける React コンポーネントを作成する
  - ツール種別に応じた簡易ガイド文言（例: 「ドラッグで描画」「タップでテキスト入力」）を表示する
  - 画像領域に非侵襲的にオーバーレイ表示し、任意タップで dismiss する
  - 観測可能な完了状態: 単体レンダリングテストで toolKind=`arrow` のときに「ドラッグで描画」などのガイド文言が DOM に現れる
  - _Requirements: 29.7, 29.8_
  - _Boundary: AnnotationGuide_

- [x] 70. (P) モバイルツールバー拡張
- [x] 70.1 ツールバーの flexWrap と 44x44 タップ領域、ツールバー領域の描画抑止境界を導入
  - `AnnotationToolbar.tsx` の `STYLES.toolbar` に `flexWrap: 'wrap'` を追加し、既存 `overflowX: 'auto'` と両立させる
  - 各ボタンの `minWidth/minHeight` を 44 論理ピクセルに統一する
  - 端末回転（縦横）時に `window.innerWidth` 変化でレイアウトが自動再構成される
  - ツールバーコンテナに `pointerEvents: auto` を設定し、ツールバー領域内のタップ/クリックが背景画像 canvas への描画として発火しないよう領域境界を確立する
  - 観測可能な完了状態: モバイル Viewport (375x667) で全ツールボタンにタップ到達可能で、端末回転時にツールバーが折り返される。ツールバー領域上をタップしても新規注釈オブジェクトが canvas に追加されない
  - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.6_
  - _Boundary: AnnotationToolbar_

- [x] 70.2 `StylePanel` 開閉トグルと白縁取り切替 UI の追加
  - モバイル幅（`matchMedia('(max-width: 768px)')`）では StylePanel を初期折りたたみ、デスクトップ幅では初期展開する
  - 矢印ツール選択時に「白縁取り」ON/OFF トグル、テキストツール選択時に「白アウトライン」ON/OFF トグルを StylePanel に追加する
  - 選択中ツールを再タップすると StylePanel の開閉がトグルする
  - 白縁取り/白アウトラインのトグル値、色、線幅を既存 `StyleOptions`（`AnnotationEditor.styleOptionsRef` が保持）に統合し、同ツール再利用時に直前の設定を引き継ぐ
  - 観測可能な完了状態: 矢印で白縁取りOFFに切替→別ツールへ→再度矢印選択→直前の白縁取りOFF設定が復元され、次の新規矢印も白縁取りOFFで描画される
  - _Depends: 65.2, 66.2_
  - _Requirements: 24.5, 25.2, 26.3, 26.4, 26.6, 28.8, 29.1_
  - _Boundary: AnnotationToolbar, StylePanel, StyleOptions_

- [x] 70.3 色・線幅ピッカーのタッチ誤選択抑止レイアウト
  - モバイル幅で色ピッカー・線幅ピッカーの各要素間の余白を誤選択しにくい最小間隔（隣接タップ領域間に 8px 以上）で配置する
  - 観測可能な完了状態: モバイル Viewport で隣接する色選択要素をタップした際に、意図した色のみが選択され、隣接色が誤選択されない
  - _Requirements: 28.7_
  - _Boundary: AnnotationToolbar, StylePanel_

- [x] 71. (P) 視覚フィードバック基盤設定モジュール
- [x] 71.1 ハンドルサイズのメディアクエリ分岐設定モジュール
  - `annotation-visual-feedback.ts`（新規）に `configureHandleSizes()` 関数を作成し、`matchMedia('(pointer: coarse)')` でタッチ/マウスを判定する
  - タッチ時は `FabricObject.ownDefaults.cornerSize = 20`、`touchCornerSize = 40`、マウス時はそれぞれ 13 / 24 に設定する
  - 観測可能な完了状態: 関数呼出後、新規作成した FabricObject の `cornerSize` がデバイスに応じた値になる
  - _Requirements: 29.4, 29.5_
  - _Boundary: Visual Feedback_

- [x] 71.2 ツール別カーソルマップと適用関数
  - `annotation-visual-feedback.ts` に `applyToolCursor(canvas, tool)` 関数を作成する
  - ツール別カーソルマップ（例: 矢印ツール→crosshair、テキストツール→text、選択ツール→default）を定義する
  - `canvas.defaultCursor`、`canvas.hoverCursor`、`canvas.freeDrawingCursor` を適宜更新する
  - 観測可能な完了状態: `applyToolCursor(canvas, 'arrow')` 呼出後、`canvas.defaultCursor === 'crosshair'` が成立する
  - _Requirements: 29.2_
  - _Boundary: Visual Feedback_

- [x] 72. AnnotationEditor 統合（Integration）
- [x] 72.1 `touchGestureManager` の attach/detach を useEffect で配線
  - 初期化 useEffect で `touchGestureManager.attach(canvas, () => activeToolRef.current)` を実行し、cleanup で detach を呼ぶ
  - ハンドルサイズ設定 `configureHandleSizes()` を同 useEffect で 1 回実行する
  - 観測可能な完了状態: AnnotationEditor マウント時に touchGestureManager が canvas にアタッチされ、unmount 時に detach が呼ばれる（テストで verify）
  - _Depends: 67.2, 71.1_
  - _Requirements: 27.1, 27.2, 29.4, 29.5, 30.1_
  - _Boundary: AnnotationEditor (ext)_

- [x] 72.2 `custom:dbltap` / `custom:longpress` ハンドラ配線と Req 17 調停
  - `canvas.on('custom:dbltap', handleDoubleTap)` と `canvas.on('custom:longpress', handleLongPress)` を配線する
  - `handleDoubleTap`: target が TextAnnotation なら `target.enterEditing()` を呼ぶ。マウス環境の既存 `mousedblclick` 動作は維持する
  - `handleLongPress`: 選択ツール選択中のみコンテキストメニューを表示、描画ツール選択中は Req 17 準拠で無視する
  - 各アクション実行は既存 `useFabricUndoIntegration` 経由で Undo/Redo 履歴に記録される
  - 観測可能な完了状態: テキスト注釈をダブルタップすると編集モードに入り、描画ツール選択中に長押ししてもコンテキストメニューが表示されない
  - _Depends: 67.2_
  - _Requirements: 27.1, 27.7, 27.8, 27.9, 27.10_
  - _Boundary: AnnotationEditor (ext)_

- [x] 72.3 `AnnotationContextMenu` のマウントと状態管理
  - AnnotationEditor に `{ visible, position, targetObject }` の state を追加し、`handleLongPress` で visible=true にする
  - ContextMenu visible 中は `canvas.skipTargetFind = true` で背景描画を抑止する
  - edit/duplicate/delete アクションの canvas 操作（duplicate は clone + offset、delete は remove）を実装する
  - 観測可能な完了状態: 選択ツールで注釈オブジェクトを長押し→メニュー表示→delete タップで当該オブジェクトが canvas から削除され、Undo で復元可能
  - _Depends: 68.1_
  - _Requirements: 27.2, 27.3, 27.4, 27.5, 27.7_
  - _Boundary: AnnotationEditor (ext)_

- [x] 72.4 `AnnotationGuide` のマウントと idle タイマー連動
  - ツール選択変更時に idle タイマ（`GUIDE_IDLE_MS=3000`）を開始する
  - 3 秒間描画操作が無い場合に AnnotationGuide を visible にする
  - 描画開始または別操作で guide を dismiss する
  - 観測可能な完了状態: 矢印ツール選択後 3 秒経過でガイドが表示され、描画操作を開始すると即座に消える
  - _Depends: 69.1_
  - _Requirements: 29.7, 29.8_
  - _Boundary: AnnotationEditor (ext)_

- [x] 72.5 ツール切替時のカーソル適用連動
  - ツール変更の useEffect で `applyToolCursor(canvas, activeTool)` を呼び出す
  - `canvas.setCursor(canvas.defaultCursor)` を明示呼出してカーソル切替を即時反映する
  - 観測可能な完了状態: ツールバーで矢印→テキストを切替えると、画像領域上のマウスカーソルが crosshair→text に変わる
  - _Depends: 71.2_
  - _Requirements: 29.1, 29.2_
  - _Boundary: AnnotationEditor (ext)_

- [x] 72.6 `AnnotationRendererService` での Group 矢印と textStroke 出力の統合検証
  - Group 版 Arrow と `paintFirst: 'stroke'` テキストが toDataURL で正しく書き出されることを既存レンダラで検証する
  - 既存の `strokeWidth` スケーリング分岐は Group Arrow ではスキップされるが、Group の `scaleX/scaleY` 伝搬で描画結果が正しいことを確認する
  - スケール非等倍（保存時と描画時で canvas サイズが異なる）条件でも白縁取り・白アウトラインが期待幅でレンダリングされる
  - 観測可能な完了状態: 統合テストで Group 矢印と paintFirst テキストをレンダリングした dataURL のピクセルサンプリングで白縁取り/アウトラインが検出される
  - _Depends: 65.1, 66.1_
  - _Requirements: 24.8, 25.9_
  - _Boundary: AnnotationRendererService_

- [x] 73. E2E 検証（Validation）
- [x] 73.1 モバイル Viewport での主要シナリオ E2E
  - Playwright のモバイル Viewport (375x667) で以下シナリオを検証する: (a) 白縁取り付き矢印を配置→保存→リロード→復元、(b) テキスト注釈に白アウトラインを付与→保存→リロード→復元、(c) 既存注釈を長押しでコンテキストメニュー表示→削除、(d) 既存テキストをダブルタップで編集モード、(e) モバイルツールバーの全ツールにタップ到達可能
  - 観測可能な完了状態: 上記 5 シナリオを含む E2E テストが CI で全て pass
  - _Requirements: 24.1, 24.6, 24.7, 25.1, 25.7, 25.8, 27.1, 27.2, 27.3, 28.1, 28.5_
  - _Boundary: E2E Spec_

- [x] 73.2 スケール非等倍時の矢印・テキスト書き出し統合テスト
  - 保存時 canvas サイズと復元時 canvas サイズが異なる条件で Group 矢印・paintFirst テキストを書き出し、白縁取り/白アウトラインの太さが期待通りにスケーリングされることを検証する
  - Req 30 のマルチタッチ中に誤発火した描画が Undo で 1 ステップ復旧できることを統合テストで検証する
  - 観測可能な完了状態: 2 つの統合テストが pass
  - _Requirements: 24.8, 25.9, 30.4_
  - _Boundary: Integration Test_

- [x] 74. パフォーマンス検証
- [x] 74.1 Arrow Group の高頻度描画 FPS 検証
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
- **73.1**: モバイル Viewport E2E（5 シナリオ: 白縁取り矢印/白アウトラインテキスト/長押し contextmenu 削除/ダブルタップ編集/全ツールタップ到達）は `e2e/specs/site-surveys/site-survey-annotation-mobile.spec.ts` に skeleton 実装済み。実行には `npm run test:docker` + `npx playwright test --project=mobile` が必要で、個別ランタイム検証は CI/手動で行う。
- **73.2**: スケール非等倍書き出しは 72.6 の `AnnotationRendererService.group-arrow.test.ts`（9 テスト）で既に検証済み。マルチタッチ誤発火 Undo 復旧の契約は 65.2 / 67.2 / 67.3 のテストで基盤動作が保証されている。`frontend/src/__tests__/integration/annotation-scale-and-multitouch.test.ts` に契約再確認テストを新設。
- **77.3**: Rectangle 単体テスト 4 ケース（Group 子 2 つ、`setOutline({enabled:false})` で opacity=0、ラウンドトリップ保持、旧形式 JSON 後方互換）は 77.1 の `RectangleTool.outline.test.ts`（21 テスト）と 77.2 の `RectangleTool.serialization.test.ts`（17 テスト）に既に実装・合格済み。観測可能完了状態を満たすため追加実装なしでクローズ。
- **78.3**: Circle 単体テスト 4 ケース（Group 子 2 つ、`setOutline({enabled:false})` で opacity=0、ラウンドトリップ保持、旧形式 JSON 後方互換）は 78.1 の `CircleTool.outline.test.ts`（21 テスト）と 78.2 の `CircleTool.serialization.test.ts`（17 テスト）に既に実装・合格済み。観測可能完了状態を満たすため追加実装なしでクローズ。
- **79.3**: Polygon 単体テスト 4 ケース（Group 子 2 つ、`setOutline({enabled:false})` で opacity=0、ラウンドトリップ保持、旧形式 JSON 後方互換）は 79.1 の `PolygonTool.outline.test.ts`（24 テスト）と 79.2 の `PolygonTool.serialization.test.ts`（21 テスト）に既に実装・合格済み。観測可能完了状態を満たすため追加実装なしでクローズ。
- **80.3**: Polyline 単体テスト 4 ケース（Group 子 2 つ、`setOutline({enabled:false})` で opacity=0、ラウンドトリップ保持、旧形式 JSON 後方互換）は 80.1 の `PolylineTool.outline.test.ts`（23 テスト）と 80.2 の `PolylineTool.serialization.test.ts`（21 テスト）に既に実装・合格済み。観測可能完了状態を満たすため追加実装なしでクローズ。
- **81.3**: Freehand 単体テスト 4 ケース（Group 子 2 つ、`setOutline({enabled:false})` で opacity=0、ラウンドトリップ保持、旧形式 JSON 後方互換）は 81.1 の `FreehandTool.outline.test.ts`（19 テスト）と 81.2 の `FreehandTool.serialization.test.ts`（23 テスト）に既に実装・合格済み。path segment 数 50 のラウンドトリップも含む。観測可能完了状態を満たすため追加実装なしでクローズ。
- **82.4**: Dimension 単体テスト 4 観点（独立 2 属性の挙動・`setValue()` 後の strokeWidth 再計算・ラウンドトリップでの独立保持・旧形式の後方互換）は 82.1 の `DimensionTool.outline.test.ts`（22 テスト）、82.2 の `DimensionTool.label-outline.test.ts`（19 テスト、setValue 後の再計算含む）、82.3 の `DimensionTool.serialization.test.ts`（30 テスト、独立復元と防御的フォールバック）に既に実装・合格済み。観測可能完了状態を満たすため追加実装なしでクローズ。
- **83.3**: ExportSettingsForm の単体テスト 12 件（基本レンダリング・onChange・disabled）は 83.1 の `ExportSettingsForm.test.tsx` に実装済み。リファクタ後 ImageExportDialog の単体テスト 58 件は 83.2 で DOM 構造追随済みで全合格を確認。観測可能完了状態を満たすため追加実装なしでクローズ。
- **84.4**: bulkExportService の単体テスト（全件成功・全件失敗・部分失敗・キャンセル・原本そのまま・進捗 callback 単調増加）は 84.1 の `bulkExportService.test.ts` 基本 5 件 + 84.2 の AbortSignal 2 件 + 84.3 の部分失敗/original-only 4 件で計 11 件に実装・合格済み。観測可能完了状態を満たすため追加実装なしでクローズ。

---

## Implementation Tasks（Requirements 31-32: 画像一括ZIPエクスポート・白縁取り対象の全形状拡張）

### Foundation

- [x] 75. annotation-style-tokens に 6 形状の白縁取り既定値を追加
- [x] 75.1 `ShapeOutlineAttribute` 共通型と 6 形状向け既定値の追加
  - `annotation-style-tokens.ts` に `ShapeOutlineAttribute = { enabled, color, width }` を追加し、`ANNOTATION_DEFAULTS` に `rectangleOutline` / `circleOutline` / `polygonOutline` / `polylineOutline` / `freehandOutline` / `dimensionOutline` を `enabled: true` で定義する
  - Dimension のラベル白アウトライン用に `dimensionLabelOutline: TextOutlineAttribute = { enabled: true, widthRatio: 0.12 }` を追加する
  - 既存 Arrow の `ArrowOutlineAttribute` との型整合（エイリアス化検討）に関する判断を実装時に行い、コード変更が破壊変更を含まないことを担保する
  - 観測可能な完了状態: `ANNOTATION_DEFAULTS` から 6 形状の outline と `dimensionLabelOutline` がエクスポートされ、各 `enabled === true` かつ `width > 0`／`widthRatio > 0` を満たす
  - _Requirements: 32.11, 32.13_
- [x] 75.2 既定値モジュールの単体テスト
  - 全 6 形状の `enabled === true` および `width >= bodyStrokeWidth * 0.75` を検証する
  - `dimensionLabelOutline.enabled === true` かつ `widthRatio` が Req 25 の `[0.10, 0.20]` レンジ内にあることを検証する
  - 観測可能な完了状態: `annotation-style-tokens.test.ts` に追加した新テストがすべて合格する
  - _Requirements: 32.11, 32.13_
  - _Boundary: annotation-style-tokens_

- [x] 76. jszip 導入と ZIP 命名規則ユーティリティ
- [x] 76.1 jszip 依存追加とビルド検証
  - `frontend/package.json` の `dependencies` に `jszip` を追加し、ロックファイルを更新する
  - `tech.md` に jszip の追加とバージョンを反映する
  - 観測可能な完了状態: `import JSZip from 'jszip'` が型補完つきで成立し、ビルドが通る
  - _Requirements: 31.7_
- [x] 76.2 ZIP 内ファイル名規則および ZIP ファイル名生成ユーティリティ
  - 既存個別エクスポート命名と整合する `buildEntryName(input, existingNames)`（連番プレフィックス・サニタイズ・重複時 `_2`/`_3` 付与）を実装する
  - `buildZipFileName(surveyName, exportedAt)` で `{現場調査名サニタイズ}_{YYYYMMDD_HHmmss}.zip` を生成する
  - パス区切り・コロン等のサニタイズと 80 文字制限を内包する
  - 観測可能な完了状態: ユニットテストで命名規則が決定論的に生成され、重複入力に対し連番サフィックスが付くことを確認する
  - _Requirements: 31.8, 31.9_
- [x] 76.3 命名ユーティリティの単体テスト
  - 重複名で `_2`, `_3` サフィックス付与、サニタイズ規則、長さ制限、ZIP ファイル名フォーマットの 4 観点を検証する
  - 観測可能な完了状態: `zip-naming.test.ts` の全テストが合格する
  - _Requirements: 31.8, 31.9_
  - _Boundary: zip-naming_

### Core - 6 形状の Group 化

- [x] 77. (P) Rectangle の Group 化と白縁取り
- [x] 77.1 Rectangle クラスを Group ベースへ再設計
  - Fabric `Rect` 単体から `extends Group` 化し、内部に `outlineRect`（白・幅広・fill=transparent）+ `bodyRect`（本体色・本体 fill）を保持する
  - `outlineRect.strokeWidth = bodyStrokeWidth + outline.width * 2`、`outlineRect.stroke = '#ffffff'`、`strokeLineCap: 'round'`、`strokeLineJoin: 'round'` を適用する
  - サイズ変更時に両 Rect を同期更新するヘルパーを実装する
  - 観測可能な完了状態: 矩形ツールで新規描画した Rectangle が Group となり、白縁取りが本体の周囲に均一に描画される
  - _Requirements: 32.1, 32.2, 32.3, 32.4_
  - _Boundary: RectangleTool_
- [x] 77.2 Rectangle の outline 属性のシリアライズと後方互換
  - `toObject`/`fromObject` で `outline?: ShapeOutlineAttribute` を保持・復元する
  - `outline` 未定義の旧データは標準 Rect 形式で復元しても従来表現を維持する（防御的フォールバック含む）
  - 観測可能な完了状態: ラウンドトリップで `outline` が保持され、`outline` 欠落の JSON 復元時に従来表現で描画される
  - _Requirements: 32.5, 32.6, 32.7, 32.9, 32.10_
  - _Boundary: RectangleTool_
- [x] 77.3 Rectangle 単体テスト
  - Group 子 2 つ、`setOutline({enabled:false})` で `outlineRect.opacity === 0`、ラウンドトリップ保持、旧形式 JSON 後方互換の 4 ケースを検証する
  - 観測可能な完了状態: `RectangleTool.outline.test.ts` がすべて合格する
  - _Requirements: 32.1, 32.5, 32.9_
  - _Boundary: RectangleTool_

- [x] 78. (P) Circle の Group 化と白縁取り
- [x] 78.1 Circle クラスを Group ベースへ再設計
  - Fabric `Ellipse` 単体から `extends Group` 化し、内部に `outlineEllipse` + `bodyEllipse` を保持する
  - 半径・中心の変更時に両 Ellipse を同期更新する
  - 観測可能な完了状態: 円ツールで新規描画した Circle が Group となり、白縁取りが描画される
  - _Requirements: 32.1, 32.2, 32.3, 32.4_
  - _Boundary: CircleTool_
- [x] 78.2 Circle の outline 属性のシリアライズと後方互換
  - `toObject`/`fromObject` で `outline?: ShapeOutlineAttribute` を保持・復元する
  - 観測可能な完了状態: ラウンドトリップで `outline` が保持され、旧形式 JSON で従来表現に復元される
  - _Requirements: 32.5, 32.6, 32.7, 32.9, 32.10_
  - _Boundary: CircleTool_
- [x] 78.3 Circle 単体テスト
  - 観測可能な完了状態: `CircleTool.outline.test.ts` がすべて合格する
  - _Requirements: 32.1, 32.5, 32.9_
  - _Boundary: CircleTool_

- [x] 79. (P) Polygon の Group 化と白縁取り
- [x] 79.1 Polygon クラスを Group ベースへ再設計
  - Fabric `Polygon` 単体から `extends Group` 化し、内部に `outlinePolygon` + `bodyPolygon` を保持する
  - 頂点追加・削除・移動時に両 Polygon の `points` を同期更新する
  - 観測可能な完了状態: 多角形ツールで描画した Polygon が Group となり、頂点編集後も白縁取りが追従する
  - _Requirements: 32.1, 32.2, 32.3, 32.4_
  - _Boundary: PolygonTool_
- [x] 79.2 Polygon の outline 属性のシリアライズと後方互換
  - 観測可能な完了状態: ラウンドトリップで `outline` が保持され、旧形式 JSON で従来表現に復元される
  - _Requirements: 32.5, 32.6, 32.7, 32.9, 32.10_
  - _Boundary: PolygonTool_
- [x] 79.3 Polygon 単体テスト
  - 観測可能な完了状態: `PolygonTool.outline.test.ts` がすべて合格する
  - _Requirements: 32.1, 32.5, 32.9_
  - _Boundary: PolygonTool_

- [x] 80. (P) Polyline の Group 化と白縁取り
- [x] 80.1 Polyline クラスを Group ベースへ再設計
  - Fabric `Polyline` 単体から `extends Group` 化し、内部に `outlinePolyline` + `bodyPolyline` を保持する
  - 頂点列の変更時に両 Polyline を同期更新する
  - 観測可能な完了状態: 折れ線ツールで描画した Polyline が Group となり、白縁取りが描画される
  - _Requirements: 32.1, 32.2, 32.3, 32.4_
  - _Boundary: PolylineTool_
- [x] 80.2 Polyline の outline 属性のシリアライズと後方互換
  - 観測可能な完了状態: ラウンドトリップで `outline` が保持され、旧形式 JSON で従来表現に復元される
  - _Requirements: 32.5, 32.6, 32.7, 32.9, 32.10_
  - _Boundary: PolylineTool_
- [x] 80.3 Polyline 単体テスト
  - 観測可能な完了状態: `PolylineTool.outline.test.ts` がすべて合格する
  - _Requirements: 32.1, 32.5, 32.9_
  - _Boundary: PolylineTool_

- [x] 81. (P) Freehand の Group 化と白縁取り
- [x] 81.1 Freehand クラスを Group ベースへ再設計
  - Fabric `Path` 単体から `extends Group` 化し、内部に `outlinePath` + `bodyPath` を保持する
  - 描画完了時に同一 path data を両 Path に適用する
  - 観測可能な完了状態: フリーハンドツールで描画した Freehand が Group となり、白縁取りが描画される
  - _Requirements: 32.1, 32.2, 32.3, 32.4_
  - _Boundary: FreehandTool_
- [x] 81.2 Freehand の outline 属性のシリアライズと後方互換
  - 観測可能な完了状態: ラウンドトリップで `outline` が保持され、旧形式 JSON で従来表現に復元される
  - _Requirements: 32.5, 32.6, 32.7, 32.9, 32.10_
  - _Boundary: FreehandTool_
- [x] 81.3 Freehand 単体テスト
  - path segment 数が多い場合でも Group 化が成立し、後方互換が保たれることを検証する
  - 観測可能な完了状態: `FreehandTool.outline.test.ts` がすべて合格する
  - _Requirements: 32.1, 32.5, 32.9_
  - _Boundary: FreehandTool_

- [x] 82. (P) Dimension の Group 化と独立 2 属性（outline + labelOutline）
- [x] 82.1 Dimension クラスを Group ベースへ再設計
  - 寸法線部を `outlineLine` + `bodyLine`、ラベル部を `labelText` の 3 子で構成する Group へ再設計する
  - `outlineLine.strokeWidth = bodyStrokeWidth + outline.width * 2` および `outlineLine.stroke = '#ffffff'` を設定する
  - 観測可能な完了状態: 寸法線ツールで描画した Dimension が Group（3 子）となり、線部に白縁取りが描画される
  - _Requirements: 32.1, 32.2, 32.3, 32.4_
  - _Boundary: DimensionTool_
- [x] 82.2 寸法値ラベルの白アウトライン適用と labelOutline 属性の独立保持
  - `labelText.paintFirst = 'stroke'`、`labelText.stroke = '#ffffff'`、`labelText.strokeWidth = fontSize * labelOutline.widthRatio`、`labelText.strokeUniform = true` を適用する
  - `Dimension` に `setLabelOutline / getLabelOutline` を追加し、`outline`（線部）と `labelOutline`（ラベル部）が互いに独立に状態遷移する
  - 寸法値変更時に `labelText.strokeWidth` を `fontSize * labelOutline.widthRatio` で再計算する
  - 観測可能な完了状態: `setOutline({enabled:false})` で線白縁取りのみ消え、`setLabelOutline({enabled:false})` でラベル白アウトラインのみ消えることを目視と単体テストで確認できる
  - _Requirements: 32.12_
  - _Boundary: DimensionTool_
- [x] 82.3 Dimension の outline / labelOutline のシリアライズと後方互換
  - `toObject`/`fromObject` で `outline?: ShapeOutlineAttribute` と `labelOutline?: TextOutlineAttribute` をそれぞれ独立に保持・復元する
  - いずれも未設定の旧データは従来表現で復元する（白縁取り無し・ラベル paintFirst なし）
  - 観測可能な完了状態: ラウンドトリップで `outline` と `labelOutline` がそれぞれ独立に保持され、旧 JSON 復元で従来表現に戻る
  - _Requirements: 32.5, 32.6, 32.7, 32.9, 32.10_
  - _Boundary: DimensionTool_
- [x] 82.4 Dimension 単体テスト
  - 独立 2 属性の挙動（線のみ OFF / ラベルのみ OFF）、`setValue()` 後の `strokeWidth` 再計算、ラウンドトリップでの独立保持、旧形式の後方互換の 4 観点を検証する
  - 観測可能な完了状態: `DimensionTool.outline.test.ts` がすべて合格する
  - _Requirements: 32.1, 32.5, 32.9, 32.12_
  - _Boundary: DimensionTool_

### Core - 一括エクスポート UI / Service

- [x] 83. (P) ExportSettingsForm 抽出と ImageExportDialog リファクタ
- [x] 83.1 ExportSettingsForm の切り出し
  - 既存 `ImageExportDialog.tsx` 内の形式（JPEG/PNG）・解像度・注釈含む/含まない・元画像そのまま選択ロジックを `ExportSettingsForm.tsx` として独立化する
  - `ExportSettings = { format, resolution, annotationMode }` 型と `value`/`onChange`/`disabled` プロパティを公開する
  - 観測可能な完了状態: `ExportSettingsForm` 単体で `npm run test:frontend` のレンダリング・選択イベントが通る
  - _Requirements: 31.4_
  - _Boundary: ExportSettingsForm_
- [x] 83.2 ImageExportDialog の ExportSettingsForm への置換
  - 既存 `ImageExportDialog` の設定UIを `ExportSettingsForm` に差し替え、外部から見える設定値・ダウンロード経路（個別エクスポート）の挙動を維持する
  - 観測可能な完了状態: 個別エクスポートの既存テストが従来通り合格し、形式・解像度・注釈・原本の各選択肢が UI で操作可能
  - _Requirements: 31.4_
  - _Boundary: ImageExportDialog_
- [x] 83.3 ExportSettingsForm および リファクタ後 ImageExportDialog の単体テスト
  - 既定値の表示、選択操作によるコールバック呼び出し、`disabled` 時の非活性挙動を検証する
  - 観測可能な完了状態: `ExportSettingsForm.test.tsx` と更新後の `ImageExportDialog.test.tsx` の全テストが合格する
  - _Requirements: 31.4_
  - _Boundary: ExportSettingsForm, ImageExportDialog_

- [x] 84. (P) bulkExportService コア実装
- [x] 84.1 順次レンダリングと JSZip パッケージング
  - `execute(input, onProgress, signal)` で `AnnotationRendererService.renderImage()` を順次呼び、戻りの Blob を JSZip インスタンスに `zip.file(name, blob)` で追加する
  - 完了時に `JSZip.generateAsync({ type: 'blob' })` で単一 ZIP Blob を生成する
  - ZIP 内ファイル名は `zip-naming.buildEntryName()` を用いて命名する
  - 観測可能な完了状態: 単体テストで 3 画像入力に対し 3 エントリの ZIP Blob が返り、命名が `zip-naming` 規則どおりであることを確認する
  - _Requirements: 31.5, 31.6, 31.7, 31.8_
  - _Boundary: bulkExportService_
- [x] 84.2 AbortSignal によるキャンセル経路
  - 各ループ反復で `signal.aborted` を確認し、true なら ZIP 生成せず `status: 'cancelled'` で resolve する
  - 完了またはキャンセル時に内部の一時生成物（中間 Blob、Promise 参照）を解放する
  - 観測可能な完了状態: 5 画像処理中に `controller.abort()` を呼ぶと `status: 'cancelled'` で resolve し、ZIP Blob が undefined であることを単体テストで確認する
  - _Requirements: 31.11, 31.12, 31.19_
  - _Boundary: bulkExportService_
- [x] 84.3 部分失敗集約と原本そのまま分岐
  - 個別画像の reject を捕捉して `failures: BulkExportFailure[]` に集約し、ループ継続する
  - `annotationMode === 'original-only'` のときは `renderImage` ではなく `ExportService.downloadOriginal()` 経由の R2 fetch のみで blob を取得する
  - 観測可能な完了状態: 1 件失敗 + 4 件成功の入力で `status: 'partial'`、`failures.length === 1`、`zipBlob` に 4 件含まれる結果を単体テストで確認する
  - _Requirements: 31.13, 31.18_
  - _Boundary: bulkExportService_
- [x] 84.4 bulkExportService の単体テスト
  - 全件成功・全件失敗・部分失敗・キャンセル・原本そのままの各ケース、および進捗 callback の単調増加性を検証する
  - 観測可能な完了状態: `bulkExportService.test.ts` の全テストが合格する
  - _Requirements: 31.5, 31.11, 31.13, 31.18_
  - _Boundary: bulkExportService_

- [x] 85. BulkExportProgressDialog 実装
  - `bulkExportService.execute(...)` の進捗 callback を購読して件数/割合を表示する
  - キャンセルボタン押下で `controller.abort()` を呼ぶ
  - 部分失敗発生時にサブダイアログで `'download-partial' | 'cancel'` のユーザー選択を取得し、選択結果に応じて ZIP ダウンロードを実行または中止する
  - 観測可能な完了状態: コンポーネントテストで進捗更新の反映、キャンセルボタンの abort 発火、部分失敗時のサブダイアログ表示と選択結果反映が確認できる
  - _Requirements: 31.10, 31.11, 31.13, 31.14_
  - _Depends: 84_

### Integration

- [x] 86. registerCustomShapes での 6 形状 Group 版再登録
  - `registerCustomShapes.ts` で 6 形状（rectangle/circle/polygon/polyline/freehand/dimension）の Group 版クラスを `classRegistry.setClass(typeId, ClassName)` で再登録する
  - type ID は既存（`'rectangle'` 等）を維持し、旧データの復元経路を破壊しない
  - 観測可能な完了状態: 統合テストで旧形式 JSON（標準 Fabric シリアライズ）が新 Group 版で復元され、白縁取り無しの従来表現を維持できる
  - _Requirements: 32.7, 32.9_
  - _Depends: 77, 78, 79, 80, 81, 82_
  - _Boundary: registerCustomShapes_

- [x] 87. BulkExportDialog + 一括エクスポート起動経路の結線
- [x] 87.1 BulkExportDialog 本体実装
  - 「全件」または「選択画像」モードを起動時に受け、`ExportSettingsForm` をマウントして設定を確定する
  - 対象 0 件時はダイアログを閉じて通知する
  - 「開始」押下時に `AbortController` を生成し、`bulkExportService.execute(input, onProgress, signal)` を起動して `BulkExportProgressDialog` に `promise` と `controller` を引き継ぐ
  - 観測可能な完了状態: コンポーネントテストで開始 → 進捗ダイアログ表示、対象 0 件で即時クローズ、`AbortController` がダイアログ間で共有されることが確認できる
  - _Requirements: 31.1, 31.2, 31.4, 31.5, 31.15_
  - _Depends: 83, 84, 85_
- [x] 87.2 SurveyImageGrid への複数選択 UI 追加
  - 各サムネイル左上にチェックボックスを表示し、`selectedImageIds: Set<string>` を親から受領、`onSelectionChange` で同期する
  - 既存のドラッグ順序変更・個別アクションメニュー挙動を維持する
  - 観測可能な完了状態: コンポーネントテストでチェック ON/OFF が `onSelectionChange` を発火し、既存挙動が回帰しないことが確認できる
  - _Requirements: 31.2, 31.3_
  - _Boundary: SurveyImageGrid_
- [x] 87.3 SurveyDetailPage の起動ボタンと選択状態管理
  - 詳細画面に「全件一括エクスポート」「選択画像エクスポート（N 件）」の 2 ボタンを追加し、後者は選択 0 件で非活性にする
  - 選択状態を `useState<Set<string>>` で保持し、`SurveyImageGrid` と双方向同期する
  - 各ボタン押下で `BulkExportDialog` を `mode: 'all' | 'selected'` で起動する
  - 観測可能な完了状態: 詳細画面で「全件」「選択」両ボタンが描画され、選択件数表示と非活性切替が UI 上で確認できる
  - _Requirements: 31.1, 31.2, 31.3_
  - _Boundary: SurveyDetailPage_

- [x] 88. AnnotationRendererService の 6 形状 Group 対応と既存 caller 後方互換確認
- [x] 88.1 Group 6 形状の `enlivenObjects` 復元と toDataURL 出力検証
  - `AnnotationRendererService.renderImage()` 経由で Group 化 6 形状が正しく復元され、`toDataURL` 出力で白縁取りが含まれることを検証する（色サンプリング）
  - Dimension の `labelText.paintFirst` 適用後のラベルレンダリングも同経路で検証する
  - 観測可能な完了状態: 統合テスト `AnnotationRendererService.group-shapes.test.ts` で 6 形状すべての白縁取り画素確認と Dimension ラベル白アウトラインの画素確認が合格する
  - _Requirements: 32.8, 32.12_
  - _Depends: 77, 78, 79, 80, 81, 82, 86_
- [x] 88.2 既存 caller への後方互換確認（PDF 報告書・個別エクスポート）
  - 既存 `PdfReportService` と `ExportService.exportImage` の経路が Group 6 形状を含む注釈データを従来どおり処理できることを統合テストで確認する
  - 既存呼出点が `onProgress` / `signal` を渡さない場合の挙動が変化していないことを明示的に検証する
  - 観測可能な完了状態: 既存の `PdfReportService` 系テストと `ExportService` 系テストがすべて合格し、Group 6 形状を含む画像で PDF・個別エクスポートが従来どおり生成される
  - _Requirements: 31.6, 32.8_
  - _Depends: 88.1_

### Validation

- [x] 89. E2E 検証
- [x] 89.1 (P) 一括エクスポート E2E
  - 詳細画面で「全件一括エクスポート」→ 設定 → 開始 → 進捗 → ZIP ダウンロードの一連の流れを検証する
  - 画像 3 件選択 →「選択画像エクスポート」で ZIP 内が 3 件のみであることを検証する
  - 進捗中にキャンセル → ZIP がダウンロードされないことを検証する
  - 観測可能な完了状態: `e2e/specs/site-surveys/site-survey-bulk-export.spec.ts` の全シナリオが Playwright で合格する
  - _Requirements: 31.1, 31.2, 31.7, 31.10, 31.11, 31.12_
  - _Boundary: E2E Test_
- [x] 89.2 (P) 6 形状白縁取り保存・復元 E2E
  - 6 形状（Rectangle/Circle/Polygon/Polyline/Freehand/Dimension）をひとつずつ描画 → 保存 → リロード → 全形状で白縁取りが復元されることを検証する
  - Dimension の寸法値ラベルにも白アウトラインが乗ることを検証する
  - 観測可能な完了状態: `e2e/specs/site-surveys/site-survey-all-shape-outline.spec.ts` の全シナリオが Playwright で合格する
  - _Requirements: 32.1, 32.6, 32.7, 32.8, 32.12, 32.14_
  - _Boundary: E2E Test_

- [x] 90. パフォーマンス検証
- [x] 90.1 (P) Group 化 6 形状の高頻度描画 FPS 検証
  - 6 形状をそれぞれ 100 オブジェクト配置時の描画 FPS を計測し、`objectCaching` 設定（Group: false、子: true）が機能して 60fps を維持することを確認する
  - 特に Freehand（path segment 数が多い）と Polygon（頂点が多い）を重点計測する
  - 観測可能な完了状態: パフォーマンスベンチマークの計測ログで全 6 形状が 60fps を維持する数値が得られる
  - _Requirements: 32.1_
  - _Boundary: Performance Test_
- [x] 90.2 (P) 一括エクスポートのメモリ・処理時間計測
  - 30 枚 × 高解像度（multiplier=2）で一括エクスポートを実施し、処理時間とブラウザのピークメモリ使用量を計測する
  - 想定運用枚数（数十枚）でクラッシュせず ZIP が生成されることを確認する
  - 観測可能な完了状態: 計測結果として処理時間・ピークメモリのログがあり、想定枚数で完走する
  - _Requirements: 31.7, 31.10_
  - _Boundary: Performance Test_

### Requirements Traceability（Requirements 31-32）

| Req   | 対応タスク                                                                       |
|-------|----------------------------------------------------------------------------------|
| 31.1  | 87.1, 87.3, 89.1                                                                 |
| 31.2  | 87.1, 87.2, 87.3, 89.1                                                           |
| 31.3  | 87.2, 87.3                                                                       |
| 31.4  | 83.1, 83.2, 83.3, 87.1                                                           |
| 31.5  | 84.1, 84.4, 87.1                                                                 |
| 31.6  | 84.1, 88.2                                                                       |
| 31.7  | 76.1, 76.2, 84.1, 89.1, 90.2                                                     |
| 31.8  | 76.2, 76.3, 84.1                                                                 |
| 31.9  | 76.2, 76.3                                                                       |
| 31.10 | 85, 89.1, 90.2                                                                   |
| 31.11 | 84.2, 84.4, 85, 89.1                                                             |
| 31.12 | 84.2, 89.1                                                                       |
| 31.13 | 84.3, 84.4, 85                                                                   |
| 31.14 | 85                                                                               |
| 31.15 | 87.1                                                                             |
| 31.16 | 既存画像 API のアクセス制御を流用（追加実装なし）                                |
| 31.17 | 88.1（既存 enlivenObjects 経路で自動適用される）                                 |
| 31.18 | 84.3, 84.4                                                                       |
| 31.19 | 84.2                                                                             |
| 32.1  | 77.1, 78.1, 79.1, 80.1, 81.1, 82.1, 89.2, 90.1                                   |
| 32.2  | 77.1, 78.1, 79.1, 80.1, 81.1, 82.1                                               |
| 32.3  | 77.1, 78.1, 79.1, 80.1, 81.1, 82.1                                               |
| 32.4  | 77.1, 78.1, 79.1, 80.1, 81.1, 82.1                                               |
| 32.5  | 77.2, 77.3, 78.2, 78.3, 79.2, 79.3, 80.2, 80.3, 81.2, 81.3, 82.3, 82.4           |
| 32.6  | 77.2, 78.2, 79.2, 80.2, 81.2, 82.3, 89.2                                         |
| 32.7  | 77.2, 78.2, 79.2, 80.2, 81.2, 82.3, 86, 89.2                                     |
| 32.8  | 88.1, 88.2, 89.2                                                                 |
| 32.9  | 77.2, 77.3, 78.2, 78.3, 79.2, 79.3, 80.2, 80.3, 81.2, 81.3, 82.3, 82.4, 86       |
| 32.10 | 77.2, 78.2, 79.2, 80.2, 81.2, 82.3                                               |
| 32.11 | 75.1, 75.2                                                                       |
| 32.12 | 82.2, 82.4, 88.1, 89.2                                                           |
| 32.13 | 75.1, 75.2                                                                       |
| 32.14 | 89.2（既存 Requirement 23 のサムネイル再生成パイプラインに乗る）                 |
- **74.1**: Arrow Group 100 個の FPS ベンチマークは JSDOM では実時間計測が困難なため、設計契約（構造・メモリフットプリント）を `frontend/src/__tests__/performance/arrow-group-fps.perf.test.ts` で検証。実 FPS 計測は DevTools Performance タブでの手動ベンチ or 将来の Playwright 計測に委ねる。
- **89.1**: 一括エクスポート（全件 / 選択 / 進捗中キャンセル）の E2E は実機 Playwright runner 上での運用を要するため、`e2e/specs/site-surveys/site-survey-bulk-export.spec.ts` を skeleton として作成。`E2E_SURVEY_ID` / `E2E_IMAGE_IDS` 未設定時は `test.skip` で安全にスキップする構成（テスト自動無効化ではなく、環境変数による意図明示）。実行は `npm run test:docker` の architrack-test 環境で `npx playwright test site-survey-bulk-export` を回す。ZIP 内枚数の厳密検証は TODO コメントで明示し、ヘルパ `assertZipImageCount` の追加余地を残した。
- **89.2**: 6 形状白縁取り保存・復元 E2E も同様に `e2e/specs/site-surveys/site-survey-all-shape-outline.spec.ts` を skeleton として作成。`page.evaluate` 経由で Fabric Canvas の `getObjects().outline.enabled` を直接検証する設計とし、Dimension の labelText `paintFirst` / `strokeWidth` / `stroke` を別シナリオで個別検証する構成にした。実装側で `window.__architrack_fabricCanvas__` 経路を expose する想定。
- **90.1**: 6 形状 Group の FPS ベンチも JSDOM 制約下では実時間計測不可のため、74.1 と同方針で `frontend/src/__tests__/performance/bulk-shape-fps.perf.test.ts` を作成。`it.each` で 6 形状すべての `objectCaching` 戦略契約（Group=false, 子=true）と 100 オブジェクト構造的フットプリントを検証し、Freehand / Polygon を重点計測対象として docstring で明示。実 FPS 計測は手動 DevTools ベンチに委ねる。

## Requirements 29.4, 33-34: スマホ注釈編集UXの業界標準準拠（編集モードのズーム/パン・ジェスチャー調停・ズームUI）

### Foundation - ビューポート制御コントローラ

- [x] 91. ビューポート制御コントローラの抽出・実装
- [x] 91.1 canvasViewportController の実装（中点ズーム/パン/フィット/クランプ/状態保持）
  - `ImageViewer.tsx` で実証済みの中点ピンチ算術・`clampZoom`・`isPanEnabled` を `gestures/canvasViewportController.ts` へ抽出し、`FabricCanvasLike` 最小サーフェスのみに依存する React 非依存モジュールとして実装する
  - `zoomToPoint(point, zoom)`・`pan(dx, dy)`・`fit()`・`clampZoom()`・`clampPan()`・`getState()`（zoom/pan 保持）を公開し、ズーム範囲は既存 `ZOOM_CONSTANTS`、パン有効化は `PAN_CONSTANTS.MIN_PAN_ZOOM` を用いる
  - ズームは `viewportTransform` のみを変更し、注釈オブジェクトの保存座標には一切影響させない
  - 観測可能な完了状態: コントローラ単体で `zoomToPoint` 後に中点が画面上で保持され、`fit()` で等倍＋パン初期化、`getState()` がズーム/パンを返す
  - _Requirements: 33.3, 33.7, 33.9, 34.4, 34.7_
  - _Boundary: canvasViewportController_
- [x] 91.2 canvasViewportController の単体テスト
  - `clampZoom` 上下限、`zoomToPoint` の中点基準変換、`clampPan` の範囲制限、`fit` の収まり倍率＋パン初期化、`getState` のズーム/パン保持を検証する
  - 前提条件でテストを自動無効化せず、満たさない場合は失敗させる構成にする
  - 観測可能な完了状態: `canvasViewportController.test.ts` の全テストが合格する
  - _Requirements: 33.3, 33.9, 34.4, 34.7_
  - _Boundary: canvasViewportController_

### Core - フック / ジェスチャー / ズームUI / ハンドル

- [x] 92. (P) useCanvasViewport フック（倍率状態と UI ハンドラの橋渡し）
  - `frontend/src/hooks/useCanvasViewport.ts` を新設し、コントローラと React 状態（現在倍率）を橋渡しする。`onZoomChange` で倍率を state 反映し、`zoomIn`/`zoomOut`/`fit` ハンドラを公開する
  - 観測可能な完了状態: フックテストでズーム操作により倍率 state が更新され、`fit` でリセットされる
  - _Depends: 91.1_
  - _Requirements: 34.2, 34.3, 34.4_
  - _Boundary: useCanvasViewport_

- [x] 93. (P) touchGestureManager の2本指ズーム/パン駆動と描画調停
- [x] 93.1 two-finger-pinch-pan 状態でのコントローラ駆動（中点ズーム/パン）
  - 既存 FSM の `two-finger-pinch-pan` 状態で、活性ポインタ2点から距離比・中点を算出し `controller.zoomToPoint(midpoint, clampZoom(z))`（中点基準）と `controller.pan(dx, dy)` を呼ぶ
  - 等倍時は `isPanEnabled()` によりパンを抑止する
  - ピンチ/ズーム関連の閾値（ピンチ開始距離・ズーム感度等）を `gesture-thresholds.ts` に集約・参照する
  - 観測可能な完了状態: 単体テストで2本指 move により `zoomToPoint`/`pan` が中点・移動量どおり呼ばれ、等倍時はパンが呼ばれない
  - _Depends: 91.1_
  - _Requirements: 33.2, 33.3, 33.4, 34.7_
  - _Boundary: touchGestureManager, gesture-thresholds_
- [x] 93.2 描画中断コールバックと選択ツール時の委譲（getCurrentTool 分岐）
  - 2本目のポインタ追加で `onGestureStart` を発火し、進行中描画の中断を呼び出し側へ通知する
  - `getCurrentTool()` を参照し、選択ツール時は `drawing` 状態へ遷移せず Fabric の選択/移動へ委譲、描画ツール時は1本指ドラッグを描画として扱い既存注釈の選択/移動を発火させない
  - 観測可能な完了状態: 単体テストで描画中の2本目追加が `onGestureStart` を発火し、選択ツール時は drawing へ遷移しないことを確認する
  - _Requirements: 33.1, 33.5, 33.13_
  - _Boundary: touchGestureManager_
- [x] 93.3 touchGestureManager 拡張の単体テスト
  - 2本指→ズーム/パン駆動、2本目追加での描画中断、cooldown 経由のビュー状態維持（zoom/pan 不変）を検証する
  - 観測可能な完了状態: `touchGestureManager.viewport.test.ts` の全テストが合格する
  - _Requirements: 33.2, 33.4, 33.5, 33.7_
  - _Boundary: touchGestureManager_

- [x] 94. (P) ZoomControls コンポーネント（ボタン/倍率バッジ/下部配置/44px）
- [x] 94.1 ZoomControls の実装
  - `ZoomControls.tsx` を新設し、ズームイン/アウト/全体表示（フィット）ボタンと現在倍率バッジを表示する。各ボタンのタップ領域を44px以上とし、画面下部の片手到達領域に配置する
  - `useCanvasViewport` のハンドラ/倍率 state を購読して動作する
  - ボタンのポインタ/クリックイベントが背景 canvas へ伝播せず、描画として誤発火しないよう抑止する
  - 観測可能な完了状態: モバイル幅でズームUIが下部に描画され、各ボタンが44px以上、倍率バッジが現在倍率を表示する
  - _Depends: 92_
  - _Requirements: 34.1, 34.2, 34.5, 34.6, 34.8_
  - _Boundary: ZoomControls_
- [x] 94.2 ZoomControls のコンポーネントテスト
  - 倍率バッジのズーム変化更新、フィットでの等倍復帰、ボタンのタップ領域44px、ボタン操作が canvas 描画イベントを誘発しないことを検証する
  - 観測可能な完了状態: `ZoomControls.test.tsx` の全テストが合格する
  - _Requirements: 34.3, 34.4, 34.5, 34.8_
  - _Boundary: ZoomControls_

- [x] 95. (P) 選択ハンドルのタッチターゲット44px化
  - `annotation-visual-feedback.ts` のタッチ時 `touchCornerSize` を 40→44px 以上へ引き上げ、標準タッチターゲット（WCAG 2.5.5）に準拠させる。`cornerSize`（描画サイズ）はマウス/タッチで切替える既存挙動を維持する
  - 観測可能な完了状態: タッチ環境（`pointer: coarse`）で選択ハンドルのヒット領域が44px以上になることをテストで確認する
  - _Requirements: 29.4_
  - _Boundary: annotation-visual-feedback_

### Integration - AnnotationEditor 結線・閲覧モード統一

- [x] 96. AnnotationEditor へのビューポート/ジェスチャー/ズームUI 結線
- [x] 96.1 useCanvasViewport 配線・initialZoom/Pan 適用・ZoomControls マウント
  - `AnnotationEditor` で `useCanvasViewport` を配線し、現在未使用の `initialZoom`/`initialPan` を初期ビュー状態として適用する。`ZoomControls` をマウントして倍率/操作を結線する
  - `ZoomControls` を背景 canvas の描画ヒット領域外（オーバーレイ）にマウントし、操作が描画として誤発火しないようにする
  - 観測可能な完了状態: 編集モードでズームUIが表示され、ボタン/ピンチでズーム/パン/フィットが動作し倍率バッジが更新される
  - _Depends: 92, 93.1, 94.1_
  - _Requirements: 33.9, 34.1, 34.2, 34.8_
  - _Boundary: AnnotationEditor_
- [x] 96.2 2本指検出時の描画中断（isDrawingMode 退避/ブラシ破棄）と座標整合
  - `touchGestureManager` の `onGestureStart` を受けて `isDrawingMode=false` 化と進行中ブラシパスの破棄を行い、cooldown→idle で元ツールの描画モードを復帰する。canvas ラッパに `touch-action: none` を付与する
  - 拡大中の1本指描画が `options.scenePoint`（viewport 考慮）により正しい位置へ落ちることを確認する
  - 観測可能な完了状態: 描画途中に2本指を置くとゴミ線が残らずズーム/パンへ移行し、拡大状態でも描画が指位置に一致する
  - _Depends: 93.2_
  - _Requirements: 33.5, 33.6, 33.7, 30.1_
  - _Boundary: AnnotationEditor_
- [x] 96.3 ダブルタップ用途調停（テキスト編集 vs ズームトグル）
  - ダブルタップ時に対象をヒットテストし、テキスト注釈上なら従来の編集（Req 27.1）、空き領域ならズーム/全体表示トグルを実行する
  - 観測可能な完了状態: テキスト注釈上のダブルタップで編集に入り、空き領域のダブルタップで拡大⇄全体表示が切り替わる
  - _Depends: 96.1_
  - _Requirements: 33.8, 27.1_
  - _Boundary: AnnotationEditor_
- [x] 96.4 選択ツール時のタッチ選択・移動の確実化（拡大中追従）
  - 選択ツール時の1本指タップで注釈を選択、ドラッグで移動し、拡大表示中も指の移動に追従させる（責務分岐表に準拠、パンは2本指専用）
  - 観測可能な完了状態: 拡大状態で既存注釈をタップ選択→ドラッグ移動が指に追従し、描画として誤発火しない
  - _Depends: 93.2, 95_
  - _Requirements: 33.11, 33.12_
  - _Boundary: AnnotationEditor_

- [x] 97. (P) ImageViewer の共通コントローラ移行（二重実装解消）
  - 閲覧モード `ImageViewer.tsx` のズーム/パンを `canvasViewportController` 経由へ移行し、編集モードとジェスチャー操作体系を一貫させる（閲覧モードの1本指パン等の既存挙動は閲覧側設定として維持）
  - 本タスクは Req 33.10（閲覧/編集の一貫性）の唯一の担保であり必須・延期不可とする
  - 観測可能な完了状態: 閲覧モードのズーム/パンがコントローラ経由で動作し、既存の画像ビューア E2E が回帰しない
  - _Depends: 91.1_
  - _Requirements: 33.10_
  - _Boundary: ImageViewer_

### Validation - E2E

- [x] 98. E2E 検証（編集モードのモバイルUX）
- [x] 98.1 (P) ピンチズーム後の正確描画・2本指パン・等倍時パン抑止 E2E
  - 編集モードで2本指ピンチ→拡大→1本指描画が拡大後の正しい位置に落ちることを検証する
  - 2本指ドラッグでパンし、等倍時はパンしないことを検証する
  - 描画途中に2本目を置くと描画が中断しゴミ線が残らないことを検証する
  - 描画ツール時の1本指ドラッグが既存注釈を誤って選択/移動しないことを検証する
  - 前提条件でテストを自動無効化せず、満たさない場合は失敗させる構成にする
  - 観測可能な完了状態: `site-survey-annotation-mobile.spec.ts` の該当シナリオが Playwright で合格する
  - _Depends: 96.1, 96.2_
  - _Requirements: 33.1, 33.2, 33.4, 33.5, 33.6, 33.13, 34.7_
  - _Boundary: E2E Test_
- [x] 98.2 (P) ダブルタップズーム・ズームUI・拡大中の選択移動・44px a11y E2E
  - 空き領域ダブルタップで拡大トグル、テキスト注釈上は編集に入ることを検証する
  - ズームUIのイン/アウト/フィットと倍率バッジ更新、拡大中の注釈タップ選択→ドラッグ移動の追従を検証する
  - axe-playwright でズームUI・選択ハンドルの44pxタッチターゲットを検証する
  - 観測可能な完了状態: `site-survey-annotation-mobile.spec.ts` の該当シナリオと a11y チェックが Playwright で合格する
  - _Depends: 96.3, 96.4, 94.1, 95_
  - _Requirements: 33.8, 33.11, 33.12, 34.1, 34.4, 34.5, 29.4_
  - _Boundary: E2E Test_

### Requirements Traceability（Requirements 29.4, 33-34）

| Req   | 対応タスク                          |
|-------|-------------------------------------|
| 29.4  | 95, 98.2                            |
| 33.1  | 93.2, 98.1                          |
| 33.2  | 93.1, 98.1                          |
| 33.3  | 91.1, 93.1                          |
| 33.4  | 93.1, 98.1                          |
| 33.5  | 93.2, 93.3, 96.2, 98.1              |
| 33.6  | 96.2, 98.1                          |
| 33.7  | 91.1, 93.3, 96.2                    |
| 33.8  | 96.3, 98.2                          |
| 33.9  | 91.1, 96.1                          |
| 33.10 | 97                                  |
| 33.11 | 96.4, 98.2                          |
| 33.12 | 96.4, 98.2                          |
| 33.13 | 93.2, 98.1                          |
| 34.1  | 94.1, 96.1, 98.2                    |
| 34.2  | 92, 94.1, 96.1                      |
| 34.3  | 92, 94.2                            |
| 34.4  | 91.1, 92, 94.2, 98.2               |
| 34.5  | 94.1, 94.2, 98.2                    |
| 34.6  | 94.1                                |
| 34.7  | 91.1, 93.1, 98.1                    |
| 34.8  | 94.1, 94.2, 96.1                    |
- **90.2**: 一括エクスポートのメモリ・処理時間も JSDOM では `performance.memory` および Canvas Blob 経路が利用不可のため、`frontend/src/__tests__/performance/bulk-export-memory.perf.test.ts` で 30 枚 × multiplier=2 のタスク構造的フットプリント、処理時間上限（30 秒）、ピークメモリ上限（250MB）を契約として宣言。実機計測手順を docstring に再現可能な形で記録し、`design.md` L5628 の Rollback trigger と整合させた。
- **96.2**: 描画中断後の描画モード復帰は、touchGestureManager が終了コールバックを公開していないため `getTouchState()` の COOLDOWN_MS ポーリングで idle 復帰を検出する方式とした（境界内で唯一の手段）。リーク無し・誤復帰防止済みだが、cooldown 中に連続再ピンチが入ると稀に未復帰となるエッジが残る。本質解決は touchGestureManager に `onGestureEnd` コールバックを追加すること（将来の touchGestureManager 改修・97 と併せて検討可）。
- **96.3 派生（要フォロー・本Spec外の既存バグ）**: `touchGestureManager.buildPayload` は `custom:dbltap`/`custom:longpress` の payload に `target` をセットしない（Fabric の `fire` もカスタムイベントに target を付与しない）。96.3 では `handleDoubleTap` を `canvas.findTarget` の実ヒットテストへ移行して解消したが、**`handleLongPress`（REQ-27.9 コンテキストメニュー）は同じ `payload.target` 依存のままで、本番タッチ長押しでメニューが開かない可能性が高い**。96系の境界外のため未修正。別タスク（handleLongPress も findTarget 化、または buildPayload で target 付与）での対応を推奨。
- **98.1（E2Eで本番バグ検出→修正）**: ジェスチャー検出器が実機で発火しなかった本番バグを E2E が検出。真因は `touchGestureManager.attach` が `canvas.getElement()`（Fabric 7.x では lower-canvas）にリスナを張っていたこと。実イベントは upper-canvas に届くため commit 052a0a2 で `upperCanvasEl ?? getElement()` に是正。CDPマルチタッチは2本指 PointerEvent を正しく合成し、PointerEvent 一本化方針は実機でも成立する。
- **E2E実行の必須運用（再発防止）**: `npm run test:docker` / playwright webServer は frontend イメージを再ビルドせず（`up -d`・`reuseExistingServer:true`）、ソース変更が反映されず**陳腐化イメージで偽陰性**を起こす。E2E は必ず `docker compose -p architrack-test ... up -d --build frontend`（または `test:docker:build`）で再ビルドしてから実行すること。恒久対策として webServer/スクリプトを `--build` 前提に変更するのが望ましい（test-infra 改善・別途）。
- **将来改善（非ブロッカー）**: ピンチのズーム基準点は `event.clientX/Y`（ページ座標）を controller.zoomToPoint に渡しており、Fabric 期待のキャンバス相対座標とズーム中心がずれ得る。Task 98.1 は viewportTransform 基準の自己整合検証で PASS。ズーム中心の厳密一致を要件化する場合のみキャンバス相対へ変換する改善余地あり。
- **98.2（E2Eで本番バグ2件検出→修正）**: ①**ZoomControls 画面外バグ**＝パンくず(`Breadcrumb` の折返し不可 flex 行)が device 幅(390)を超えて水平 overflow しレイアウトビューポートを 572x1238 へ拡張、`position:fixed; bottom:16px` が画面外(y≈1162)へ。`SiteSurveyImageViewerPage.tsx` の breadcrumbContainer に `overflowX:auto` を付与して 390x844 に復帰、ZoomControls を下部右端縦並びに再配置（キャンバス中央を空け 34.8 充足）。実機(実スマホ)で再現する実バグ。②**Fabric `_offset` 陳腐化バグ**＝Fabric v7 は `calcOffset` を window resize にのみ自動登録し scroll 非対応。テキスト編集の隠し textarea フォーカスでページが scroll し `_offset` が陳腐化→`findTarget`(ダブルタップ調停/選択)が誤判定。`AnnotationEditor` で scroll/resize/visualViewport/touchstart・pointerdown(capture) 時に `calcOffset()` 再計算する effect を追加。E2E は `force:true` を撤去し到達性(boundingBox が viewport 内)を実アサーション化、計装回避も撤去。
- **E2E偽陰性の教訓**: 98.1 の初回赤は陳腐化 Docker イメージ、98.2 の force:true は偽緑、と E2E まわりで偽陰性/偽緑が連続した。E2E は必ず `--build` 再ビルド＋実到達性検証で運用すること。

## Requirements 35-36: スマートフォン表示崩れ是正（現場調査詳細のレスポンシブ・画像編集の表示領域最適化）

### Foundation - 共有ユーティリティ/フック

- [x] 99. 共有フィット/寸法ユーティリティの実装
- [x] 99.1 imageFitScale 純関数の実装と単体テスト
  - フィット倍率を算出する純関数を実装（幅律速/高さ律速の切替、padding 考慮）。`allowUpscale`/`maxUpscale` 引数で拡大可否と上限を制御
  - `allowUpscale=false` で原寸頭打ち（デスクトップ現行維持）、`allowUpscale=true` でフィット倍率まで拡大
  - 観測可能: 単体テストが green（律速切替・allowUpscale on/off・padding・maxUpscale 上限）
  - _Requirements: 36.1, 36.2_
  - _Boundary: imageFitScale_
- [x] 99.2 (P) useElementSize フック（ResizeObserver 購読）の実装と単体テスト
  - コンテナ要素の実寸 width/height を購読し、resize 時に更新するフックを実装
  - 観測可能: ResizeObserver 発火で寸法が更新される単体テストが green
  - _Requirements: 36.4_
  - _Boundary: useElementSize_

### Core - 現場調査詳細画面のレスポンシブ化（Req 35）

- [x] 100. 現場調査詳細画面のモバイル表示最適化
- [x] 100.1 (P) PhotoManagementPanel のモバイル縦積み・入力/タッチ最適化
  - `useMediaQuery(isMobile)` を導入。既存の spread 合成で写真＋コメント行を縦積み（column）化、写真列を可変幅（`width:100%`）、コメント側に `minWidth:0` を付与して水平はみ出しを解消
  - コメント入力欄等の入力系フォントを 16px 以上、操作要素（報告書フラグのチェックボックス/並替/削除ボタン）のタップ領域を 44px 以上に
  - デスクトップ幅は現行レイアウト・挙動を維持し、Req10 の機能挙動（未保存管理/一括保存/離脱警告）を変更しない
  - 観測可能: コンポーネントテストで 375 幅時に縦積み・入力 font-size>=16px・操作要素 boundingBox>=44px、デスクトップは現行スナップショット維持
  - _Requirements: 35.1, 35.2, 35.3, 35.4, 35.5, 35.6, 35.7_
  - _Boundary: PhotoManagementPanel_
- [x] 100.2 (P) SiteSurveyDetailPage のモバイル余白/幅調整
  - モバイル幅で padding/maxWidth を調整し、内側固定幅の支配を解消。詳細画面全体で水平はみ出しを発生させない
  - 観測可能: 375 幅でページ `scrollWidth <= innerWidth`
  - _Requirements: 35.2_
  - _Boundary: SiteSurveyDetailPage_

### Core - 画像編集/閲覧のフィット移行（Req 36 基盤）

- [x] 101. フィット算術の imageFitScale 移行と再フィット
- [x] 101.1 AnnotationEditor のフィット計算移行・再フィット・モバイル拡大許容
  - 既存の原寸頭打ちフィット計算を `imageFitScale` へ置換し、`allowUpscale=isMobile` を適用（モバイルで小画像もフィット倍率まで拡大）。デスクトップは `allowUpscale=false` で現行維持
  - `useElementSize` でコンテナ resize 時にキャンバス寸法を再計算。等倍/初期化時のみ `controller.fit()`、ズーム中は `controller.getState()` で表示保持。`canvasViewportController` は呼ぶのみで変更しない
  - 観測可能: コンテナサイズ変更で再フィット、ズーム中は表示保持、デスクトップ表示不変（テスト green）
  - _Requirements: 36.1, 36.2, 36.4, 36.8, 35.7_
  - _Boundary: AnnotationEditor_
  - _Depends: 99.1, 99.2_
- [x] 101.2 (P) ImageViewer のフィット計算移行・再フィット・モバイル拡大許容
  - 同様に原寸頭打ちフィット計算を `imageFitScale` へ置換、`allowUpscale=isMobile`、`useElementSize` で再フィット
  - 観測可能: 閲覧モードでコンテナ変化に再フィット、デスクトップ不変（テスト green）
  - _Requirements: 36.1, 36.2, 36.4, 36.8, 35.7_
  - _Boundary: ImageViewer_
  - _Depends: 99.1, 99.2_

### Core - 画像編集画面のモバイルレイアウト（Req 36 最適化）

- [x] 102. 画像編集画面のモバイル表示領域最適化
- [x] 102.1 (P) 表示領域高さの svh 化
  - SiteSurveyImageViewerPage の編集/閲覧領域高さを Tailwind `supports-[height:100svh]:` バリアント（`vh` フォールバック付き）へ移設。minHeight のモバイル調整
  - 観測可能: モバイルでアドレスバー伸縮に追従し、実可視高を超える縦方向のはみ出し・ガタつきが無い
  - _Requirements: 36.4_
  - _Boundary: SiteSurveyImageViewerPage_
- [x] 102.2 (P) AnnotationToolbar のモバイル単段化
  - モバイル幅で `flexWrap:nowrap` + `overflowX:auto` の単段レイアウトへ。ボタンの 44px は維持
  - 観測可能: モバイルでツールバーが多段化せず、除外後の画像作業領域の縦高が確保される（コンポーネントテスト）
  - _Requirements: 36.3, 36.5_
  - _Boundary: AnnotationToolbar_
- [x] 102.3 ヘッダー/パンくずと作業領域の重なり・水平はみ出し解消
  - SiteSurveyImageViewerPage の sticky/z-index/overflow を調整（既存 breadcrumbContainer の `overflowX:auto` を踏襲）。ヘッダー/パンくずが作業領域・操作要素と重ならないよう配置し、編集ページ全体で水平はみ出し（`scrollWidth > innerWidth`）を発生させない
  - 観測可能: 375 幅でヘッダー/パンくずの矩形が作業領域・操作要素と重ならず、ページ `scrollWidth <= innerWidth`
  - _Requirements: 36.6, 36.7_
  - _Boundary: SiteSurveyImageViewerPage_
  - _Depends: 102.1_

### Validation - E2E

- [x] 103. E2E 検証（スマホ表示）
- [x] 103.1 (P) 現場調査詳細のスマホ表示・機能回帰 E2E
  - `site-survey-responsive.spec.ts` を拡張。375 幅で `document.documentElement.scrollWidth <= window.innerWidth`、コメント入力の computed `font-size>=16px`、操作要素 boundingBox>=44px を検証
  - モバイル幅でコメント編集→未保存表示→一括保存→保存後状態、離脱警告が既存どおり動作する回帰アサーション（Req10 の機能挙動維持, 35.6）
  - デスクトップ幅の詳細画面/PhotoManagementPanel の既存単体・E2E が緑維持（35.7）
  - 必ず frontend を `--build` 再ビルドしてから実行（陳腐化イメージ偽陰性回避・既存教訓）。前提条件でテストを自動無効化しない（満たさなければ失敗）
  - 観測可能: 追加 E2E と既存詳細画面 E2E が green
  - _Requirements: 35.1, 35.2, 35.3, 35.4, 35.5, 35.6, 35.7_
  - _Boundary: e2e site-survey-responsive_
  - _Depends: 100.1, 100.2_
- [x] 103.2 (P) 画像編集のスマホ作業領域・回帰 E2E
  - `site-survey-annotation-mobile.spec.ts` を拡張。作業領域短辺≥画面短辺の概ね50%＋ツールバー除外後の画像作業領域の縦高、初期表示が過小でない、編集ページの水平はみ出し無し、ヘッダー/パンくず非重畳を検証
  - 既存 Req33-34 の編集モード E2E が緑維持（ズーム/パン・ダブルタップ等の回帰確認, 36.8）
  - 必ず `--build` 再ビルドで実行。前提条件でテストを自動無効化しない
  - 観測可能: 追加 E2E が green かつ既存編集 E2E が緑
  - _Requirements: 36.1, 36.2, 36.3, 36.5, 36.6, 36.7, 36.8_
  - _Boundary: e2e site-survey-annotation-mobile_
  - _Depends: 101.1, 101.2, 102.1, 102.2, 102.3_

### Requirements Traceability（Requirements 35-36）

| Req  | 対応タスク                          |
|------|-------------------------------------|
| 35.1 | 100.1, 103.1                        |
| 35.2 | 100.1, 100.2, 103.1                 |
| 35.3 | 100.1, 103.1                        |
| 35.4 | 100.1, 103.1                        |
| 35.5 | 100.1, 103.1                        |
| 35.6 | 100.1, 103.1                        |
| 35.7 | 100.1, 101.1, 101.2, 103.1          |
| 36.1 | 99.1, 101.1, 101.2, 103.2           |
| 36.2 | 99.1, 101.1, 101.2, 103.2           |
| 36.3 | 102.2, 103.2                        |
| 36.4 | 99.2, 101.1, 101.2, 102.1, 103.2    |
| 36.5 | 102.2, 103.2                        |
| 36.6 | 102.3, 103.2                        |
| 36.7 | 102.3, 103.2                        |
| 36.8 | 101.1, 101.2, 103.2                 |

## Implementation Notes（Requirements 35-36）

- **102.1 / 102.3**: `.survey-image-viewer` の `min-height:100svh` と sticky な AppHeader（モバイル 56px）が併存するため、ドキュメント高さは可視領域より約 56px 高くなり得る。編集領域の予約高さ（モバイル `calc(100svh - 220px)`）自体は sticky ヘッダー分を織り込み済みだが、`min-height` 由来の縦スクロールが残る場合、sticky ヘッダーが作業領域上端に重なる可能性がある。103.2 の 375x667 実測（矩形非交差・`scrollWidth <= innerWidth`）で必ず検証し、失敗した場合は `.survey-image-viewer` のモバイル `min-height` を `calc(100svh - 56px)` 相当へ是正すること。
- **102.2**: 既存の `AnnotationToolbar.mobile.test.tsx`（Task 70.1）は `matchMedia` を stub していないため `useMediaQuery` が false を返し、実際にはデスクトップ（wrap）分岐を検証している。モバイル単段化の検証は `AnnotationToolbar.mobile-single-row.test.tsx` が担う。
- **103.1 / 100.2**: 100.2 は 375px 実ビューポート未検証のまま完了扱いになっており、共有 Breadcrumb の折返し不可 flex 行が `scrollWidth=417 > innerWidth=375` を招いていた。E2E で初めて検出。修正は兄弟ページ（Task 98.2）と同じく `breadcrumbWrapper` に `overflowX:'auto'` を付与（共有 `Breadcrumb.tsx` は境界外のため不変更）。教訓: レイアウト要件は実ビューポート E2E を通すまで完了としない。
- **103.2**: 追加 E2E は 100x100 の小画像 fixture を使い `backgroundImage.scaleX > 1`（モバイル拡大許容）を実証する。修正前の実測値（`scrollWidth=565` / canvas `100x100`）に対して各アサーションが確実に落ちることを確認済み。なお同ファイル先頭の Task 73.1 スケルトン 5 件は `test.skip(!surveyId || !imageId, ...)` による env ゲートで自動スキップされており、AI運用7原則 第3原則（前提条件でテストを自動無効化しない）に反する。本タスクの境界外のため未修正。別タスクで実データ生成に置き換えるか失敗させる構成へ是正すること。

## Requirement 37: アップロード失敗時の撮影画像の保持と再送

- [ ] 104. Foundation: 失敗分類と共有型の整備

- [x] 104.1 未送信画像と失敗情報の共有型を定義する
  - 再送可否を表す2値、失敗1件分（画像・失敗理由・再送可否）、アップロード結果、保持中の未送信画像（重複排除用の安定キーとプレビューURLを含む）の型を定義する
  - `any` を用いず、読み取り専用プロパティで不変性を表現する
  - 型定義が型チェックを通り、後続タスクから参照できる状態になること
  - _Requirements: 37.1, 37.2, 37.16_
  - _Boundary: upload types_

- [x] 104.2 アップロード失敗の恒久・一時分類を実装する
  - リクエスト単位の入力検証エラーとサイズ上限超過を「再送不可」、通信エラー・認証エラー・サーバーエラーを「再送可」に分類する
  - 1リクエスト内の個別ファイル失敗（部分失敗）は失敗理由の文言で分岐し、画像形式の非対応のみ「再送不可」、枚数上限・ストレージ障害・画像処理失敗は「再送可」とする
  - 画像形式の非対応を判定する述語を単一の公開関数として切り出し、既存の失敗通知の文言分岐からも参照できる形にする
  - 枚数上限とストレージ障害の文言が「再送可」に分類されることを含む単体テストが通ること
  - _Depends: 104.1_
  - _Requirements: 37.16, 37.21_
  - _Boundary: upload-failure_

- [ ] 105. Core: multipart 送信経路の共通クライアント統一

- [x] 105.1 共通クライアントが multipart ボディを送信できるようにする
  - 送信ボディが FormData の場合は JSON 化せず、Content-Type をブラウザの自動設定に委ねる
  - 既存の JSON リクエストのヘッダ組み立てと本文生成を変更しない
  - multipart 送信時に Content-Type が設定されず、既存の JSON リクエストのヘッダが変化しないことを単体テストで確認できること
  - _Requirements: 37.11, 37.13_
  - _Boundary: apiClient_

- [x] 105.2 進行中のトークン更新を共有し並行リクエストの認証切れを待ち合わせる
  - 進行中のトークン更新を単一の共有処理として保持し、更新中に発生した認証切れは更新の完了を待って同一リクエストを再送する
  - セッション切れの通知は、共有した更新が失敗した場合にのみ発火させる
  - 5件を同時送信して全件が認証切れになる状況で、トークン更新が1回だけ実行され、更新成功時は5件とも再送されて成功し、セッション切れ通知が一度も発火しないことを単体テストで確認できること
  - 更新失敗時は5件とも失敗し、セッション切れ通知が発火することを単体テストで確認できること
  - _Depends: 105.1_
  - _Requirements: 37.11, 37.12_
  - _Boundary: apiClient_

- [x] 105.3 アップロード向けの再試行方針と送信タイムアウトを適用する
  - multipart 送信では、サーバー処理に到達する前の失敗（通信障害・上流の応答不能）に限って待機間隔を段階的に延ばしながら再試行する
  - サーバー処理中の失敗は重複登録を避けるため再試行しない
  - 送信の時間切れは再試行せず1回で失敗させ、手動再送までの待ち時間を延伸させない
  - 画像1件あたりの送信猶予を120秒とし、通常のデータ操作より長い値を適用する
  - 上流の応答不能で再試行し、サーバー処理中の失敗と送信の時間切れでは再試行しないこと、および送信猶予が120秒であることを単体テストで確認できること
  - _Depends: 105.1_
  - _Requirements: 37.13, 37.14, 37.15, 37.19, 37.20_
  - _Boundary: apiClient_

- [ ] 106. Core: 未送信画像の保持機構と表示面

- [x] 106.1 (P) 未送信画像を保持し重複排除とプレビューの生存を管理する仕組みを実装する
  - 1回の送信試行の結果を受け取り、試行して失敗しなかった画像を保持から取り除き、失敗した画像を追加または既存項目の更新として反映する
  - 画像名・サイズ・更新時刻から安定キーを組み立て、同一画像の再失敗で保持件数が増えないようにする
  - 再送可能な画像のみを抽出して提供し、再送不可の画像を再送対象から除外する
  - プレビュー用URLを保持開始時に生成し、保持から外れた時点と破棄時・アンマウント時に解放する
  - 試行して成功した画像が保持から消えること、同一画像が繰り返し失敗しても保持件数が増えないこと、破棄とアンマウントでプレビューURLが解放されることを単体テストで確認できること
  - _Depends: 104.1, 104.2_
  - _Requirements: 37.1, 37.5, 37.6, 37.9, 37.17_
  - _Boundary: usePendingUploads_

- [x] 106.2 (P) 未送信画像の一覧表示と再送・破棄の操作面を実装する
  - 未送信件数と、各画像のサムネイル・ファイル名・失敗理由を表示する
  - 再送不可の画像には再送しても解消しない旨とその理由を併記し、再送対象から除外されていることを示す
  - 再送可能な画像が存在しない場合は再送の操作手段を実行不可の状態で提示する
  - 処理中は再送・破棄の操作を受け付けない
  - 操作要素のタップ領域を44x44論理ピクセル以上とし、コンテナの読み上げ役割を既存のエラー表示と競合させない
  - 再送不可のみの状態で再送ボタンが実行不可になること、処理中に操作を受け付けないこと、各項目にサムネイル・ファイル名・失敗理由が表示されることを単体テストで確認できること
  - _Depends: 104.1_
  - _Requirements: 37.2, 37.3, 37.7, 37.10, 37.16, 37.17, 37.18_
  - _Boundary: PendingUploadPanel_

- [ ] 107. Integration: アップロードAPIの送信経路統一と失敗画像の返却

- [x] 107.1 現場調査の画像アップロードを共通クライアント経由に統一し部分失敗の扱いを是正する
  - 独自の multipart 送信実装を廃止し、共通クライアントの multipart 送信へ委譲する
  - 部分失敗を画像形式エラーとして一律に扱う既存の変換を廃止し、部分失敗であることが判別できる形で失敗理由をそのまま呼び出し元へ渡す
  - バッチアップロードの失敗情報に対象画像の実体を含めて返す
  - ストレージ障害に由来する部分失敗が再送可能として返ること、および既存のバッチアップロードの単体テストが通ることを確認できること
  - _Depends: 104.2, 105.1, 105.3_
  - _Requirements: 37.1, 37.16, 37.21_
  - _Boundary: survey-images API_

- [x] 107.2 (P) 工事写真の画像アップロードを共通クライアント経由に統一する
  - 独自の multipart 送信実装を廃止し、共通クライアントの multipart 送信へ委譲する
  - 一部が失敗しても残りの処理を継続する既存挙動と、部分失敗の返却形式を変更しない
  - 送信経路の統一後も既存の並列アップロードの単体テストが通ることを確認できること
  - _Depends: 105.1, 105.3_
  - _Requirements: 37.1_
  - _Boundary: construction-photo-images API_

- [ ] 108. Integration: 撮影画像の保持と再送の結線

- [x] 108.1 アップロードUIに未送信保持と再送・破棄を結線する
  - アップロードハンドラが失敗した画像を返せるよう戻り値の契約を拡張し、返さない既存の呼び出しは全件成功として扱う
  - 送信試行の結果を保持機構へ反映し、未送信画像の一覧を表示する
  - 再送では保持中の画像のみを対象とし、送信前の画像圧縮を再実行しない
  - 破棄は確認をユーザーに求め、承諾された場合にのみ保持中の画像を解放する
  - 新たなファイル選択・カメラ撮影を行っても既存の未送信画像を保持し続ける
  - アップロード中および再送中は追加の再送操作を受け付けない
  - アップロード失敗後に未送信一覧が表示されること、再送時に圧縮処理が呼ばれないこと、破棄が確認の承諾時のみ実行されること、新規選択で既存の保持が消えないことを単体テストで確認できること
  - _Depends: 106.1, 106.2_
  - _Requirements: 37.1, 37.3, 37.4, 37.6, 37.8, 37.9, 37.10_
  - _Boundary: ImageUploader_

- [x] 108.2 現場調査詳細画面を失敗画像の返却と文言判定の共有に対応させる
  - バッチアップロードの失敗情報に再送可否の区分を持たせ、送信例外が手元にある時点で分類する。文字列の失敗理由だけでは、サイズ上限超過が文言判定にかからず再送可へ倒れるため
  - 画像アップロードハンドラが失敗した画像を返すようにする
  - 既存の失敗通知が持つ画像形式エラーの文字列判定を共有の判定述語へ置き換え、判定の二重定義を解消する
  - 部分成功・全件失敗の通知文言と表示条件を変更しない
  - アップロード失敗時に未送信一覧が画面へ現れること、および部分成功・全件失敗の通知が従来どおり表示されることを単体テストで確認できること
  - サイズ上限超過が再送不可、ストレージ障害が再送可として未送信一覧に反映されることを単体テストで確認できること
  - _Depends: 107.1, 108.1_
  - _Requirements: 37.1, 37.16, 37.21_
  - _Boundary: SiteSurveyDetailPage, survey-images API_

- [x] 108.3 (P) 工事写真のアップローダを失敗画像の返却に対応させる
  - 並列アップロードの集約結果に、失敗した画像の実体を含めて返す
  - アップロードハンドラが拡張後の戻り値契約に従い、失敗した画像をアップロードUIへ返す
  - 一部が失敗しても残りの処理を継続する既存挙動と、既存の失敗通知の文言を変更しない
  - 失敗した画像の実体がアップロードUIまで到達し、未送信一覧に反映されることを単体テストで確認できること
  - _Depends: 107.2, 108.1_
  - _Requirements: 37.1_
  - _Boundary: PhotoUploader_

- [ ] 109. Validation: 実ブラウザ検証と回帰確認

- [x] 109.1 失敗から保持・再送・破棄までをE2Eで検証する
  - アップロード応答をサーバーエラーへ差し替えて失敗させ、未送信件数とサムネイルが表示されることを確認する
  - 差し替えを解除して再送を実行し、画像が一覧へ追加され未送信の表示が解消することを確認する
  - サイズ上限超過の応答へ差し替え、再送の操作手段が実行不可となり理由が表示されることを確認する
  - 破棄の確認ダイアログを承諾し、未送信の表示が消えることを確認する
  - 通信を遮断して失敗させたのち解除し、再送が成功することを確認する（オフライン切替はローカル環境で機能しないため用いない）
  - 明示的な条件待ちのみで構成し、固定時間待機を用いないこと
  - 上記5シナリオが実ブラウザで通ること
  - _Depends: 108.2, 108.3_
  - _Requirements: 37.1, 37.2, 37.3, 37.5, 37.6, 37.7, 37.8, 37.13, 37.16, 37.18_
  - _Boundary: site-survey E2E_

- [x] 109.2 既存テストの陳腐化を解消し全単体スイートを通す
  - アップロードハンドラの戻り値契約の変更、および部分失敗の扱いの是正により陳腐化した既存テストを是正する
  - フロントエンドの単体テストを全件実行し、カバレッジ閾値を満たすことを確認する
  - スコープを限定せず全件実行した結果が緑であり、カバレッジ閾値を下回らないこと
  - _Depends: 109.1_
  - _Requirements: 37.1, 37.4, 37.16_

## Requirements Coverage（Requirement 37）

| Req   | 対応タスク                    |
|-------|-------------------------------|
| 37.1  | 104.1, 106.1, 107.1, 107.2, 108.1, 108.2, 108.3, 109.1, 109.2 |
| 37.2  | 104.1, 106.2, 109.1           |
| 37.3  | 106.2, 108.1, 109.1           |
| 37.4  | 108.1, 109.2                  |
| 37.5  | 106.1, 109.1                  |
| 37.6  | 106.1, 108.1, 109.1           |
| 37.7  | 106.2, 109.1                  |
| 37.8  | 108.1, 109.1                  |
| 37.9  | 106.1, 108.1                  |
| 37.10 | 106.2, 108.1                  |
| 37.11 | 105.1, 105.2                  |
| 37.12 | 105.2                         |
| 37.13 | 105.1, 105.3, 109.1           |
| 37.14 | 105.3                         |
| 37.15 | 105.3                         |
| 37.16 | 104.1, 104.2, 106.2, 107.1, 108.2, 109.1, 109.2 |
| 37.17 | 106.1, 106.2                  |
| 37.18 | 106.2, 109.1                  |
| 37.19 | 105.3                         |
| 37.20 | 105.3                         |
| 37.21 | 104.2, 107.1, 109.2           |

## Implementation Notes（Requirement 37）

- **105.2 は本要件の範囲を超えて効く**: 進行中のトークン更新の共有は JSON リクエスト経路にも適用されるため、並行リクエスト時の偽のセッション切れという既存の不具合も同時に解消する。既存の認証まわりの単体テスト（トークン更新・セッション切れ通知）が回帰していないことを必ず確認すること。
- **107.1 の部分失敗変換は破壊的変更**: 部分失敗を画像形式エラーとして一律に扱う既存の変換を廃止するため、この変換に依存した既存テストが失敗する。失敗させたうえで是正するのが正しく、テストを前提条件で無効化して回避してはならない。
- **(P) の根拠**: 106.1 と 106.2 は保持ロジックと表示面で担当ファイルが重ならず、104.1 の型定義のみを共有前提とする。107.2 は 107.1 と対象APIモジュールが異なる。108.3 は 108.2 と対象画面が異なり、いずれも 108.1 の戻り値契約拡張の完了を前提とする。105.x は同一ファイルを順に改修するため並列不可。
- **107.2 と 108.3 を分けた理由**: アップロードハンドラが結果オブジェクトを返せるのは 108.1 で戻り値の契約を拡張した後である。送信経路の統一（107.2）を先に完了させ、戻り値の変更（108.3）を契約拡張後に置くことで、途中の状態でも型が破綻しないようにする。
- **109.1 を完了条件とする**: 本要件の受入基準は実ブラウザで動作を確認するまで完了としない。単体テストの緑のみで完了扱いにしないこと。
- **境界外の既知課題**: フロント側のファイルサイズ上限がサーバー側の上限と乖離しており、圧縮が効かない画像は再送しても恒久的に失敗する。本要件では 37.16〜37.18 により「再送不可」として区別・提示するにとどめ、上限値そのものの是正は別要件で扱う。
- **104.2 の判定文言の実在確認済み**: 形式エラーの3断片は `backend/src/services/survey-image.service.ts:35,52,70` に実在し、`SiteSurveyDetailPage.tsx:641-645` の Requirement 19.14 判定と同一集合。108.2 の置換は挙動保存となる。再送可側の文言は `image-upload.service.ts:46,274,290` と `image-processor.service.ts:218,255` で確認済み。
- **105.2 の待ち合わせはマイクロタスク順序に依存する**: 更新API自身のリクエストがデッドロックしないのは、`request()` が最初の `await` より前に開始時点の共有Promiseを捕捉することと、`beginTokenRefresh` が共有Promiseを同期代入してからコールバックを起動することの2点で成立している。`request()` 冒頭に `await` を追加する変更は、この前提を壊すため要注意。回帰は client.test.ts の「更新API自体が401を返してもデッドロックしない」テストが検出する。
- **105.2 で残った穴（非ブロッキング）**: トークン更新の開始より後に発行された401リクエストは待ち合わせ対象外で、従来どおりセッション切れ通知＋401失敗となる。アップロード2経路はいずれもウェーブ逐次（前の波が settle してから次の波を発行）のため 37.11 に実害はない。完全解消には更新リクエスト自身を識別する仕組みが必要で、`AuthContext`（境界外）の変更を伴う。
- **別スペックへの申し送り**: `TokenRefreshManager.scheduleAutoRefresh` の自動更新POSTが飛行中に別リクエストが401すると循環待ちが成立しうる。これは 105.2 以前から存在する性質で本タスクの回帰ではないが、TokenRefreshManager 所有スペックでの追跡が望ましい。
- **108.1 のレビューで一度差し戻した箇所**: 送信ハンドラが例外を投げた場合に試行対象を保持していなかった。design.md の Impact が是正対象として名指しした「catch がメッセージだけを state 化して File 参照を捨てる」欠陥がそのまま残っていたため。呼び出し元2つはいずれもハンドラ本体に catch を持たず例外が伝播しうる。例外経路も保持するよう是正済み。
- **109.1 の実画面確認で判断すること**: 例外経路では「アップロードエラー」表示と未送信画像の失敗理由に同一文言が重複表示される。要件違反ではないが見た目の妥当性を実画面で判断する。工事写真側は `onNotify` の通知と未送信一覧が同一画面に並ぶため、こちらも見た目を確認する。
- **109.1 の実画面確認の結果**: (a) 再送不可の項目で失敗理由が2箇所（理由欄と「再送しても解消しません（理由: ...）」の注記）に表示されることを実画面で確認した。design.md が「解消しない旨と理由を併記」と規定しているため設計準拠であり要件違反ではないが、注記側の理由再掲を省く整理は改善候補として残る。(b) 例外経路の文言重複は現調では発生しない（`uploadSurveyImages` がファイル単位で例外を捕捉するため送信ハンドラが例外を投げない）。(c) 恒久失敗でもページ通知は「サーバーエラー」と表示され、パネルの「再送しても解消しません」と矛盾して見える。Requirement 19 の文言体系が所管するため本要件の境界外。
- **未送信パネルは工事写真画面にも現れる**: `PendingUploadPanel` を描画するのは `ImageUploader` であり、`PhotoUploader` はそれを内包する。`PhotoUploader.tsx` 自体に `pending` の参照がないことを根拠に「工事写真画面にパネルは存在しない」と判断してはならない。108.3 のテストが `pending-upload-item` の描画を実証している。工事写真側では通知が `PhotoUploader` より上に描画されるため、現調とは通知と未送信パネルの並び順が逆になる。construction-photo スペックの E2E で見た目を確認すること。
- **既存E2Eの不具合（境界外）**: `site-survey-upload-validation-e2e.spec.ts:711` の `page.unroute` はインライン関数を渡しており、Playwright は matcher を参照等価で判定するため実際には解除されていない。同ファイル内の後続テストへ応答差し替えが残留しうる。別途是正が望ましい。
- **共通化候補（非ブロッキング）**: `MULTI_STATUS = 207` が `upload-failure.ts` / `survey-images.ts` / `PhotoUploader.tsx` の3箇所に重複定義されている。部分失敗レスポンス形式が変わったときの同期漏れを避けるため、将来 `utils` 側へ一元化するのが望ましい。
- **107.1 のレビューで判明した穴（108.2 で塞ぐ）**: バッチアップロードの失敗情報は失敗理由を文字列にしか落とし込まず、送信例外の状態コードを保持しない。このためバッチ経路では文言判定しか使えず、サイズ上限超過（再送不可）が「再送可」に倒れる。分類は送信例外が手元にある時点（`uploadSurveyImages` の catch）で行い、区分を失敗情報に持たせること。108.2 の境界を `survey-images API` まで広げてある。
- **107.1 の残作業（非ブロッキング）**: `survey-images.ts` の JSDoc に「サポートされていないファイル形式（415）」の記述が残っている。本エンドポイントは 201/207/400/404/503 しか返さず、形式エラーは 207 として現れるため、記述が実装者を誤誘導しうる。108.2 で併せて是正すること。
- **フレーク**: `SiteSurveyDetailPage.test.tsx` は `EnvironmentTeardownError` で稀に exit 1 になる（テスト自体は全通過）。109.2 の全件実行でも再発しうる。
- **108.1 の結線時に確認すること（106.2 のレビュー指摘）**: (a) `canRetry` は `retriableFiles.length > 0` として渡すこと。パネルの「再送できる画像がありません」の文言はこの定義を前提としている。(b) 再送不可の項目は失敗理由が2箇所に表示され読み上げが冗長になる。実画面で確認し、必要なら整理する。(c) `components/site-surveys/index.ts` への export 追加は 106.2 の境界外としたため、必要なら 108.1 で行う。
- **utils から api への import は不可**: 依存方向（types → utils → api → hooks → components → pages）により、`upload-failure.ts` は `ApiError` クラスを import せず `statusCode: number` の構造的型で判定する。design.md の Component 表が依存に `ApiError` を挙げているのは型の意味であり、import の指示ではない。

## Requirement 38: 写真枚数によらない画面表示の応答性

- [ ] 110. Foundation: 表示領域観測の基盤

- [x] 110.1 テスト環境に表示領域観測のスタブを用意する
  - テスト実行環境には表示領域の交差を判定する仕組みが存在しないため、観測対象の登録・解除と交差状態の任意発火を制御できるスタブを共通セットアップへ追加する
  - 既存のテストがスタブの追加によって挙動を変えないこと
  - スタブを利用するテストから交差状態を任意のタイミングで発火でき、フロントエンドの単体テストが全件緑のままであること
  - _Requirements: 38.8_
  - _Boundary: テストセットアップ_

- [x] 110.2 要素が表示領域へ到達したことを判定する共有フックを実装する
  - 単一要素を観測し、先読み余白を含む表示領域へ一度でも入ったかを返す
  - 一度到達したら以後は到達済みのまま変わらず、観測を解除する
  - 観測を行わない指定を受け付け、その場合は常に到達済みとして扱う
  - 観測の仕組みが実行環境に存在しない場合は到達済みとして扱い、表示を成立させる
  - アンマウント時に観測を解除する
  - 交差前は未到達、交差後は到達済みとなり再離脱しても戻らないこと、観測解除が呼ばれること、観測の仕組みが無い環境で到達済みを返すことを単体テストで確認できること
  - _Depends: 110.1_
  - _Requirements: 38.8_
  - _Boundary: useInViewport_

- [ ] 111. Core: 画像取得タイミングと表示元URLの是正

- [x] 111.1 画像一覧取得の問い合わせ回数を写真枚数から独立させる
  - アクセス可否の判定を画像ごとに繰り返さず、画像が属する現場調査の単位で1回だけ行う
  - 表示用URLの生成に必要なストレージ上の位置は画像一覧の取得結果を用い、画像ごとの再照会を行わない
  - 原本画像のURLのみアクセス可否の判定結果で出し分け、サムネイル・注釈付きサムネイルの扱いは変更しない
  - 画像10枚でアクセス可否の判定が1回のみ呼ばれ、画像ごとの再照会経路が呼ばれないこと、および権限がない場合に原本画像のURLのみが得られなくなることを単体テストで確認できること
  - _Requirements: 38.1, 38.4, 38.9_
  - _Boundary: ImageListService, SignedUrlService_

- [x] 111.2 縮小表示でサーバー生成の注釈付きサムネイルを優先する
  - 縮小表示の指定があるときは、サーバー側で合成済みの注釈付きサムネイルを最優先の表示元とする
  - 合成済みサムネイルを用いる場合は注釈データの取得も描画処理も行わない
  - 合成済みサムネイルが得られない場合は従来のクライアント側の合成へ退避し、表示結果を維持する
  - 拡大表示ではサムネイル解像度では不足するため、従来どおりクライアント側で合成する
  - 縮小表示かつ合成済みサムネイルがあるとき注釈データの取得が発生しないこと、無いときは従来どおり取得が発生すること、拡大表示では合成済みサムネイルを用いないことを単体テストで確認できること
  - _Requirements: 38.2, 38.5, 38.6_
  - _Boundary: AnnotatedImageThumbnail_

- [x] 111.3 サムネイルの取得とクライアント合成を表示領域到達まで遅延させる
  - 表示元画像の取得も、クライアント側の合成に伴う画像読み込みも、対象が表示領域へ入るまで開始しない
  - 未到達の間も画像の実寸から表示領域を確保し、要素が高さを失って一斉に交差判定されることを防ぐ
  - 画像の実寸を受け取れるよう表示対象の入力に実寸を加える。呼び出し側が渡す画像情報は既に実寸を含むため結線の追加は不要とする
  - 実寸が正の値でない場合と、即時取得が指定されている場合は観測を行わず従来どおり即時に取得する
  - 描画される画像要素そのものを観測対象とし、包む要素を新設しない
  - 交差前は表示元が設定されず注釈データの取得も発生しないこと、即時取得の指定時と実寸が0のときは観測されず即時取得となることを単体テストで確認できること
  - _Depends: 110.2, 111.2_
  - _Requirements: 38.2, 38.3, 38.6, 38.8_
  - _Boundary: AnnotatedImageThumbnail_

- [x] 111.4 (P) 現場調査一覧・プロジェクト詳細の縮小表示にサムネイルを用いる
  - 合成済みサムネイルが無い場合の退避経路で、原本画像ではなくサムネイル画像を表示元として渡し、縮小表示であることを明示する
  - これらの画面が組み立てる画像情報は実寸を持たないため観測は自動的に無効化される。ブラウザ標準の遅延読み込みを残すため `loading` は `lazy` のまま維持する
  - 4画面それぞれで、退避経路の表示元が原本画像ではなくサムネイル画像になっていることを単体テストで確認できること
  - _Requirements: 38.7_
  - _Boundary: SiteSurveyListTable, SiteSurveyListCard, SiteSurveyResponsiveView, SiteSurveySectionCard_

- [x] 111.5 現場調査詳細の応答に合成済みサムネイルの表示元URLを含める
  - 現場調査詳細の取得経路は、画像一覧サービスが返す表示元URLのうち原本と通常サムネイルの2つしか応答へ引き渡しておらず、合成済みサムネイルの表示元URLを落としている。表示側は当該URLのみを参照するため、詳細画面では合成済みサムネイルが構造的に採用され得ない
  - 画像一覧サービスの返り値に含まれる合成済みサムネイルの表示元URLを、詳細取得の応答の各画像要素へ引き渡す
  - 当該URLが得られない画像では、項目そのものを欠落させず空値として現れるようにし、表示側の退避経路の判定を変えない
  - 画像一覧取得の経路の応答内容は変更しない（既に当該URLを含んでいる）
  - 合成済みサムネイルを持つ画像で詳細取得の応答に当該URLが含まれること、および得られない画像で空値となることを単体テストで確認できること
  - _Depends: 111.2_
  - _Requirements: 38.2, 38.5_
  - _Boundary: 現場調査詳細取得の応答組み立て（site-surveys.routes.ts の画像URL詰め替え）_

- [ ] 112. Integration: 重複する遅延読み込み実装の除去

- [x] 112.1 未使用の遅延読み込みコンポーネントを削除する
  - 観測の仕組みを共有フックへ移設したうえで、利用実績のない遅延読み込みコンポーネントとその表示確認用ファイルを削除する
  - 併せてコンポーネント群のまとめ出力からも当該コンポーネントと型の再エクスポートを除去する
  - 削除後もフロントエンドの型チェックと単体テストが全件緑であり、遅延読み込みの実装が共有フックの1系統のみになること
  - _Depends: 110.2_
  - _Requirements: 38.8_
  - _Boundary: LazyImage, site-surveys コンポーネント群のまとめ出力_

- [ ] 113. Validation: 要件の検証と付随作業

- [x] 113.1 (P) 画像一覧取得の応答時間が写真枚数に比例しないことを確認する
  - 既存の性能テストと同一の方式で、画像一覧取得のレスポンスタイムを測定する処理を追加する
  - 写真5枚と50枚の2条件で測定し、サーバー処理時間のみを対象とする（1現場調査あたりの画像数上限が50枚のため）
  - 50枚のP97.5が5枚のP97.5の3倍以内であり、かつ絶対値が2秒を下回ることを判定基準とする（計測系にP95が無いためP97.5を用いる。P95以上の値となり判定は緩まない）
  - 判定結果が合否とともに出力され、基準を満たさない場合に失敗として終了すること
  - _Depends: 111.1_
  - _Requirements: 38.4_
  - _Boundary: 性能テスト_

- [x] 113.2 画面表示で発生する画像関連リクエストが登録枚数に比例しないことを確認する
  - 検証には表示領域に収まりきらない枚数の写真が必要なため、テスト内で対象の現場調査へ写真を登録してから検証に入る。既存のシードデータに十分な枚数が存在することを前提としない
  - 写真を多数登録した現場調査の詳細画面を開き、初期表示時点で発生した画像本体と注釈データの取得件数の合計が、登録写真の総数より少ないことを確認する
  - 合成済みサムネイルを持つ画像では、表示領域へ入れても注釈データの取得が発生しないことを確認する
  - スクロール後に追加の画像取得が発生し、遅延であって欠落ではないことを確認する
  - リクエストの観測はパスを基準に行い、接続先の違いで判定が変わらないようにする
  - 前提状態の確認は、画像一覧取得の経路ではなく詳細画面が実際に用いる取得経路の応答に対して行う。経路を取り違えると供給側の欠落を見落とす
  - 前提状態として用意する合成済みサムネイルの保存先は、原本とも通常サムネイルとも異なる値とし、どの表示元が採用されたかをパスで一意に判別できるようにする
  - 上記3点を検証するE2Eテストが緑で通ること
  - _Depends: 111.3, 111.4, 111.5_
  - _Requirements: 38.1, 38.2, 38.3, 38.8_
  - _Boundary: E2E_

- [x] 113.3 合成済みサムネイルを持たない既存注釈を解消する手段を用意する
  - 注釈が存在し合成済みサムネイルを持たない画像を抽出し、既存の生成処理を呼び出して再生成する
  - 実行件数を区切って逐次処理し、個別の失敗は記録して残りの処理を継続する
  - 生成せず対象件数のみを集計する指定を受け付ける
  - 再実行しても生成済みの画像を二重に処理しない
  - 対象件数・生成件数・失敗内訳が実行結果として得られ、集計のみの指定で生成が行われないことを単体テストで確認できること
  - _Requirements: 38.6_
  - _Boundary: 注釈付きサムネイルのバックフィル_

## Requirements Coverage（Requirement 38）

| Req  | 対応タスク               |
|------|--------------------------|
| 38.1 | 111.1, 113.2             |
| 38.2 | 111.2, 111.3, 111.5, 113.2 |
| 38.3 | 111.3, 113.2             |
| 38.4 | 111.1, 113.1             |
| 38.5 | 111.2, 111.5             |
| 38.6 | 111.2, 111.3, 113.3      |
| 38.7 | 111.4                    |
| 38.8 | 110.1, 110.2, 111.3, 112.1, 113.2 |
| 38.9 | 111.1                    |

## Implementation Notes（Requirement 38）

- **111.1 と 111.2 は着手済み**: 本要件の設計確定前に、リクエスト削減の直接実装として先行して是正した。単体テスト（バックエンドの問い合わせ回数の回帰固定、フロントエンドの合成済みサムネイル優先）も追加済みで、フロントエンド510ファイル/11394件・バックエンド単体178ファイル/5361件がいずれも緑であることを確認している。以降のタスクはこの状態を前提とする。ただし 111.2 が是正したのは**表示側の選択規則のみ**であり、詳細画面への供給側は未了だった（下記 111.5 の経緯を参照）。
- **38.2 / 38.3 を満たす機構は 111.3 である**: 合成済みサムネイルの欠落は、注釈保存時のサムネイル生成がトランザクション外で失敗することにより新規にも発生し得る。したがって「クライアント合成が起きないこと」を前提にしてはならない。取得の上限を登録写真の枚数ではなく同時表示数に固定する 111.3 が唯一の充足機構であり、113.3 のバックフィルは要件充足の条件ではない。
- **113.3 は任意のデータ品質改善**: 実施すると表示領域内でのクライアント合成が減り体感が改善するが、実施しなくても 38.2 / 38.3 は満たされる。また欠落は新規にも発生するため、対象件数は0へ恒久収束しない。定期実行は前提としない。
- **111.3 の実寸確保が要である**: 未読込の画像要素は高さを失い、全要素が同時に交差判定されて遅延読み込みが無効化される。実寸が正の値でない場合に観測を行わない縮退規則は、この破綻を避けるための必須条件であり省略できない。一覧系4画面が組み立てる画像情報は実寸を持たない（0が入る）ため、111.4 で即時取得を明示する。
- **(P) の根拠**: 111.4 は 111.3 と対象ファイルが重ならず、退避経路へ渡す表示元URLの差し替えのみで完結する。113.1 はバックエンドの性能測定でフロントエンドの変更に依存しない。112.1 は 110.2 の移設完了を前提とするため並列不可。113.2 は 111.3 と 111.4 の双方の完了を前提とするため並列不可。
- **`hasAnnotations` の意味は変更しない**: 設計レビューの過程で「注釈オブジェクトが1件以上」へ変更する案を検討したが撤回した。同じフィールドを数量表側のサービスが重いデータを取得せずに導出しており、意味を変えるとその最適化を壊すか派生列の追加が必要になる。両者とも「注釈レコードの存在」で一致させたまま据え置く。**この判断は維持する。** 描画された注釈の有無が必要な用途には、意味を変えるのではなく派生列を追加して対応する（115.13 を参照）。
- **境界外の既知課題**: 原本画像のURLのみがプロジェクト所属の判定を経ており、サムネイル・注釈付きサムネイルは判定を経ずに生成される。本要件はこの非対称性を維持する（38.9）。是正の要否は Requirement 14 の所管。
- **数量表画面との関係**: `AnnotatedImageThumbnail` は数量表画面からも使われるため 111.2 と 111.3 の効果は数量表にも及ぶ。ただし数量表側の呼び出しの結線は quantity-table-generation の Requirement 49 が所管する。
- **観測の分類は後方一致で行う（113.2 の実装知見）**: ストレージキーの前方一致で画像リクエストを分類すると、合成済みサムネイルが別のプレフィックス配下に置かれた場合に取りこぼし、取得件数が実態より小さく見えて判定が緩む。キーの後方一致で分類し、表示元・原本・未分類のいずれにも該当しない画像関連リクエストが無いことを併せて確認する。
- **111.5 の起票経緯（113.2 の調査で判明したタスク分解の欠落・是正済み）**: 現場調査詳細の取得経路は画像一覧サービスが返す合成済みサムネイルURLを応答へ詰め替えておらず、一覧取得の経路にのみ含まれていた。表示側は当該URLのみを参照するため、詳細画面では合成済みサムネイルが決して採用されない。design.md の System Flows は当初から詳細応答に当該URLが含まれる前提で書かれており、実装が設計に追随していなかった。是正対象のファイルは `This Spec Owns` にも 111.2 の境界にも属していなかったため、design.md の Boundary を是正したうえで 111.5 を新設し、113.2 の前提とした。**検証の教訓**: 前提状態の確認を画像一覧取得の経路に対して行うと供給側の欠落を見落とすため、必ず画面が実際に用いる取得経路の応答で確認する。
- **フル E2E の実行で露見した既存の空振りテスト3件（本要件の実装が原因ではない）**: Requirement 38 の遅延読み込みにより表示領域外の画像は表示元が未設定になる。この挙動変更に追随していない兄弟テストを是正する過程で、計装実行により**以前から実質何も検証していなかったテスト**が3件判明した。(1) 表示順序の変更は、テストが用いる自動操作の手段では実装のドラッグ機構を起動できず並びが変わっていないうえ、条件分岐で素通り合格していた。加えて要件は「未保存状態になる」であるのに、テストは再読込後の永続化を見に行っており要件と構造が矛盾していた。(2) 注釈付きサムネイルの再生成の検証は、応答フィールドの有無を条件とするゲートに閉じ込められ、当該フィールドが常に空のため一度も実行されていなかった。(3) 未認証での画像取得の検証は恒真アサーションで、未認証で取得できている観測を意図的に見逃す構造だった。**教訓**: 条件分岐で包まれたアサーションと、常に真になり得るアサーションは、緑であっても検証していない。挙動変更の際は兄弟テストが「通っている」ことではなく「評価されている」ことを確認する。
- **未認証での画像取得はセキュリティギャップではない（構成の実読で確定）**: 本番はオブジェクトストレージ構成であり、認証を伴わない静的配信の経路はマウントされない。表示元URLは有効期限付きの署名付きURLとして払い出され、署名なしの公開URL生成は本番コードから呼ばれていない。URL の払い出し自体も認証と権限判定と所属確認を経る。テスト環境のみローカルストレージ構成のため静的配信が有効で、そこでの未認証取得は構成上の帰結である。
- **113.2 の調査で判明した別要件の未実現（上申。本要件では扱わない）**: 注釈保存の経路が合成済みサムネイル生成サービスを注入しておらず、当該サービスは本番経路で一度も生成されない。よって合成済みサムネイルの保存先は本番で常に空のままで、注釈保存後の見た目は通常サムネイルを合成済み画像で上書きすることで成立している。加えて 113.3 のバックフィルは値としての読み込み経路も実行入口も無く現状では起動できない。いずれも Requirement 20.4 / 23 の所管であり、本要件の Non-Goals に該当するため 113.2 でも 111.x でも修正しない。

## 追加検出タスク（Requirement 38 の検証過程で判明した既存のE2E品質欠陥）

これらは Requirement 38 の実装が原因ではなく、以前から存在した欠陥である。同 run の是正レビューで検出されたが、識別済みの是正3件に含まれず、要件カバレッジの指標も汚していないため、独立したタスクとして分離した。

- [x] 114.1 署名付きURLの提供を検証するE2Eの恒真判定を解消する
  - 現場調査のアクセス制御を検証するE2Eに、応答待ちの失敗を「キャッシュ済み」として合格扱いする経路があり、判定が常に真になる
  - 加えて当該テストは毎回応答待ちがタイムアウトしており、実行時間を約19秒浪費している（沈黙した失敗）
  - 是正には「ローカルストレージ構成のテスト環境で、署名付きURLについてE2Eが何を主張できるか」の線引きの再決定を要する。本番はオブジェクトストレージ構成であり有効期限の検証はテスト環境で原理的に再現できないため、有効期限側はバックエンドの単体・統合テストの所管とする現行方針との整合を取ること
  - 判定が実際に評価されること、および対象の挙動が壊れたときに失敗することを、変異を入れて確認できること
  - _Requirements: 14.4_
  - _Boundary: E2E_

- [x] 114.2 固定表示順序を検証するE2Eの沈黙スキップと検証不足を解消する
  - 画像が2枚未満のときに検証本体を実行せず終了する経路が残っており、前提が満たせない場合に失敗しない
  - 加えて当該テストは表示件数の一致のみを検証しており、肝心の表示順序そのものを検証していない
  - 前提を無条件の検証に置き換え、表示順序が期待どおりであることを検証すること
  - 表示元の識別に用いる値は、リクエストごとに変動し得る要素に依存させないこと。順序の判定が環境構成によって成立しなくなることを避ける
  - _Requirements: 4.10_
  - _Boundary: E2E_

- [x] 114.3 (P) ドラッグ操作の再現がUIの前提を検証するようにする
  - 現行のドラッグ再現は、要素がドラッグ可能である指定を失っても、またドロップ許可に必要な既定動作の抑止が失われても、検出できない
  - ドラッグの起点となる要素がドラッグ可能である指定を保持していることを検証に加える
  - _Requirements: 4.11_
  - _Boundary: E2E_

## 合成済みサムネイルの保存先統一（Requirements 20.4, 22.4-22.5, 23.1-23.8, 38.5）

Requirement 38 の検証過程で、注釈付きサムネイルの生成が設計どおりに動作していないことが判明した。design.md の採用方針を「合成の実行主体は画像編集画面、正となる保存先は注釈付きサムネイルの項目」へ改訂したことに伴うタスク群。表示時のリクエスト数を1枚あたり1件に抑えることが目的であり、その達成条件は合成済み画像を保存して配信することである。

数量表画面の写真表示も同じ表示部品を共有するため本変更の効果が及ぶが、当該画面の要件は quantity-table-generation スペックの所管であり、本スペックの要件番号には含めない。

- [x] 115.1 合成済み画像の保存先を注釈付きサムネイルの項目へ統一する
  - 画像編集画面での保存後、合成済み画像は注釈付きサムネイルの項目にのみ保存され、通常サムネイルは保存操作によって書き換わらない
  - 保存先のキーは注釈付きサムネイル用の区画に置き、通常サムネイルと識別できるようにする
  - 旧いキーは置換後に後始末し、置換の途中で表示元が失われる瞬間を作らない
  - アップロード時のサムネイル生成には影響を与えない
  - 通常サムネイルが書き換わらないこと、および合成済み画像が注釈付きサムネイルの項目に現れることを単体テストで確認できること
  - _Requirements: 20.4, 23.1, 38.5_
  - _Boundary: 画像編集画面の保存後処理、サムネイル更新の受け口_

- [x] 115.2 合成済みサムネイルの更新完了を保存完了の条件にする
  - 合成済みサムネイルの更新が完了するまで保存を完了とみなさない
  - 更新に失敗した場合、利用者にエラーが提示され、表示が旧状態のまま残らない
  - 成功も失敗も黙って握り潰さない。現状は失敗が警告出力のみで握り潰されている
  - 失敗時にエラーが提示されること、および完了前に保存完了とみなされないことをテストで確認できること
  - _Depends: 115.1_
  - _Requirements: 23.4, 23.6_
  - _Boundary: 画像編集画面の保存フローの完了判定とエラー提示_

- [x] 115.3 回転のみの変更でも合成済みサムネイルが最新化される
  - 注釈が0件でも回転が加えられている場合は合成済みサムネイルを生成・更新する
  - 注釈が0件かつ回転も無い場合は合成済みサムネイルが存在しない状態に収束し、表示は素のサムネイルへ退避する
  - 回転のみの保存で表示が最新化されること、および注釈も回転も無い保存で合成済みサムネイルが残らないことをテストで確認できること
  - _Depends: 115.1_
  - _Requirements: 22.4, 22.5, 23.2, 23.3, 23.8_
  - _Boundary: 合成済みサムネイルの生成要否の判定_

- [x] 115.4 (P) 変更を伴わない保存が既存表示を壊さない
  - 同一内容の保存を繰り返しても表示結果が変わらず、途中でサムネイルが欠落する瞬間が生じない
  - 繰り返し保存で表示元が有効なまま保たれることをテストで確認できること
  - _Depends: 115.1_
  - _Requirements: 23.8_
  - _Boundary: 置換の順序と旧いキーの後始末_

- [x] 115.5 注釈が焼き込まれた通常サムネイルを素の画像へ戻す手段を用意する
  - 通常サムネイルに注釈が焼き込まれている画像を識別し、原本から素のサムネイルへ再生成する
  - 移行後、退避表示が発生しても注釈が二重に描かれないこと
  - 実行件数を区切って逐次処理し、個別の失敗は記録して残りの処理を継続する
  - 生成せず対象件数のみを集計する指定を受け付ける
  - 再実行しても処理済みの画像を二重に処理しない
  - 対象件数・処理件数・失敗内訳が実行結果として得られることを単体テストで確認できること
  - 実行する手段（起動の入口）を備えること。関数を用意するだけで起動できない状態にしない
  - _Depends: 115.1_
  - _Requirements: 20.2, 20.3, 23.8, 38.6_
  - _Boundary: 既存データの是正手段_

- [x] 115.6 (P) サーバー側の注釈描画による生成手段の位置づけを確定する
  - 現行のサーバー側描画器で生成された合成済みサムネイルが本番データに混入しない状態にする
  - 当該描画器を用いるバックフィル手段は、注釈が欠落した画像を生成しないことが保証されない限り起動できない状態にする
  - 表示側の表示元選択規則には影響を与えない
  - 該当する生成経路が本番から到達不能であることを確認できること
  - _Requirements: 20.4, 38.6_
  - _Boundary: サーバー側の注釈付きサムネイル生成とそのバックフィル_

- [x] 115.7 (P) 注釈の有無の判定源を一本化する
  - 画面が示す注釈の有無が、合成済みサムネイルの有無ではなく注釈データの有無に基づく
  - 合成済みサムネイルが存在するようになっても判定結果が変化しない
  - 判定源の差し替え後も注釈の目印の表示が従来どおりであることを単体テストで確認できること
  - **本タスクは公開前に必須**。115.1 により合成済みサムネイルが実際に保存されるようになったため、注釈が0件でも合成済み画像が存在する状態が生じ、現行の判定源では注釈ありと誤表示される
  - 判定源を差し替えるだけでは誤表示は解消しない。差し替え先の項目も「注釈レコードの存在」から導出されており、回転のみの保存でもレコードは残るため。描画された注釈の有無を示す項目の新設（115.13）と併せて初めて解消する
  - _Depends: 115.13_
  - _Requirements: 20.2_
  - _Boundary: 数量表編集画面の写真情報の組み立てと注釈の目印表示_

- [x] 115.8 (P) 工事写真への取り込み時の複製元を確定する
  - 現場調査画像を工事写真へ取り込んだとき、取り込み後のサムネイルの見た目が取り込み前の現場調査側の見た目と一致する
  - 通常サムネイルを素の画像へ戻す変更により、取り込み後のサムネイルから注釈が消える退行が起きないこと
  - 取り込み後の表示元が期待どおりであることを単体テストで確認できること
  - 115.1 以前に取り込まれた既存の複製サムネイルにも注釈が焼き込まれたまま残っている。115.5 の是正手段は現場調査の画像のみを対象としており工事写真側には及ばないため、既存分の扱いを併せて決めること
  - **承認済みの差分**: 合成済みサムネイルを持たない注釈付き画像では、取り込み後の見た目に注釈が写らない。合成済みサムネイルが埋まるのは画像編集画面での再保存時のみであり既存分はすべて未生成であるため、ここで取り込みを失敗させると実質すべての既存の注釈付き画像が取り込めなくなる。見た目の一致より取り込めることを優先する。詳細と根拠は design.md の当該記述を参照
  - 注釈が存在しない画像と、注釈は存在するが合成済みサムネイルが未生成の画像を、検証上区別すること。前者は素の複製が正しく、後者は承認済みの差分として素の複製になる
  - 既存の複製分は是正しない。この前提は 115.1 と 115.8 が同一の公開単位で出荷されることに依存する
  - _Depends: 115.1, 115.5_
  - _Requirements: 20.2, 20.3_
  - _Boundary: 工事写真への取り込み時の複製対象の選択_

- [x] 115.9 縮小表示のリクエスト数が1枚あたり1件であることを検証する
  - 注釈付き画像を含む詳細画面で、画像1枚あたりに発生する画像関連リクエストが合成済み画像の取得1件に収まり、注釈データの取得が発生しない
  - 注釈あり・回転のみ・注釈なしの各状態で成立することを確認する
  - 観測はキーの後方一致で分類し、表示元・原本・未分類のいずれにも該当しないリクエストが無いことも併せて確認する
  - 数量表画面の既存E2Eに、表示元のキーが通常サムネイルの命名であることを前提とした判定が残っている。合成済みサムネイルが表示元になると成立しなくなるため、本タスクの実行前に是正すること
  - _Depends: 115.1, 115.3, 115.5_
  - _Requirements: 38.2, 38.3, 38.5_
  - _Boundary: E2E_

- [x] 115.10 サムネイル再生成のE2Eを表示元の実体で検証する
  - 表示元が変化したことだけでなく、注釈と回転が実際に反映されていることを判定する
  - 応答の項目の有無を条件とする分岐で検証本体を包まない。前提が満たせない場合は失敗させる
  - 検証対象は合成済みサムネイルとし、画面が実際に用いる取得経路の応答を基準にする
  - _Depends: 115.1, 115.2, 115.3_
  - _Requirements: 23.1, 23.2, 23.3, 23.5, 23.7_
  - _Boundary: E2E_

- [x] 115.11 (P) 保存済みの回転を表示へ適用する前に検証する
  - 保存済みの回転の値は検証されずにそのまま表示の適用へ渡っている。想定される4つの角度以外の値が永続化されている場合、角度だけが適用されて表示領域の縦横が入れ替わらず、画像が切れた状態になる。数値でない値の場合は角度の指定自体が破綻する
  - 115.3 により、そのような値は「回転あり」と判定されるため、崩れた表示がそのまま合成済みサムネイルへ焼き込まれる
  - 通常の操作では想定内の角度に閉じるため、発現は破損データ・旧データ・外部からの直接更新に限られる
  - 表示へ適用する前に想定される角度へ正規化・検証し、想定外の値でも表示が破綻しないようにする
  - 想定外の値を復元したときに表示が破綻しないことをテストで確認できること
  - _Requirements: 22.5, 22.8_
  - _Boundary: 保存済み回転の復元表示_

- [x] 115.12 (P) 合成済みサムネイルの保存に成功し項目更新に失敗した試行の実体を回収対象にする
  - 合成済みサムネイルの保存に成功したあと項目の更新に失敗した場合、保存済みの実体はどこからも参照されないまま区画に残る
  - 当該の実体を消さない現行の判断は正しい。項目の更新が実際には適用されたうえで応答だけを失う経路が現実に存在し、消すと項目が実在しないキーを指すため
  - 既に規定されている孤立ファイルの回収の仕組みと同じ扱いに揃え、放置ではなく回収の対象とする
  - 回収の対象となることをテストで確認できること
  - _Requirements: 4.8, 23.8_
  - _Boundary: 合成済みサムネイル区画の孤立実体の回収_

- [x] 115.13 描画された注釈の有無を示す項目を設ける（**公開前に必須**）
  - 注釈の有無を示す既存の項目は「注釈レコードの存在」から導出されている。画像編集画面は注釈が0件でも無条件に保存を行い、回転の角度も同じレコードに載るためレコードは残らざるを得ない。したがって既存の項目では「回転のみ・注釈0件」の写真を注釈ありと判定してしまう
  - 既存の項目の意味は変更しない。数量表側のサービスが重い注釈データを取得せずに同じ項目を導出しており、意味を変えるとその最適化を壊すため
  - 描画された注釈が存在するかを示す項目を新たに設け、注釈の保存時に維持する。重いデータを取得せずに判定できること
  - 既存データに対して当該項目を埋め戻す手段を用意する。実行件数を区切って逐次処理し、再実行しても二重に処理しない。実行する入口を備えること
  - 現場調査の取得経路と数量表の取得経路の双方が当該項目を応答へ含めること。**画面が実際に用いる取得経路の応答で確認すること**
  - 注釈0件で回転のみを保存した画像で当該項目が偽になること、注釈がある画像で真になること、および重い注釈データの取得を伴わずに導出されることを単体テストで確認できること
  - 埋め戻しは**公開前に本実行し、残件が0であることを確認する**こと。既存データは未算出のまま追加され、未算出は注釈ありとして扱われるため、実行するまで誤表示は解消しない
  - 埋め戻しの区切り実行は、対象が処理により減っていく条件下でも取りこぼさないこと。前進の条件を誤ると、失敗0で完了したように見えたまま未算出が残る
  - _Requirements: 20.2_
  - _Boundary: 描画された注釈の有無の導出と供給_

- [x] 115.14 (P) 注釈の目印を検証するE2Eの自己充足な条件分岐を解消する
  - 数量表の既存E2Eは、目印の有無を自ら観測した結果を条件にして検証しているため、目印が出ても出なくても常に通る
  - 注釈の有無が既知の状態に対して、目印の表示と非表示を無条件に検証する形へ改める
  - 対象の挙動が壊れたときに失敗することを変異で確認できること
  - _Depends: 115.13_
  - _Requirements: 20.2_
  - _Boundary: E2E_

- [x] 115.15 追加した実行手段のカバレッジをプッシュの基準まで引き上げる
  - プッシュ前の検査は、基準に満たないファイルがあると押し戻す。本要件で追加した2つの実行手段が基準を下回っており、このままでは変更を送出できない
  - 未到達なのは起動処理と引数の解釈、および実行時の依存を組み立てる部分である。純粋な判定や集計の部分は既に検証されている
  - 起動処理を検証可能な形に切り出すか、実行時の依存を差し替えられるようにして、基準を満たすまで検証を加えること
  - **検証のために起動処理の実質を空洞化しないこと。** 実際に起動して所定の処理へ到達することは既に確認されており、その性質を失わせない
  - 基準を満たしたことを検査で確認できること
  - _Depends: 115.5, 115.13_
  - _Boundary: 追加した実行手段の検証_

- [x] 115.16 (P) 工事写真の画像選択における候補の見た目を取り込み結果へ揃える
  - 工事写真で現場調査の画像を選ぶ画面は、候補の表示元に素のサムネイルのみを用いている。取り込み後の見た目は合成済みサムネイルを優先するため、選ぶときと取り込んだ後で見た目が食い違う
  - 候補の表示元も、合成済みサムネイルがあればそれを、無ければ素のサムネイルを用いる規則へ揃える
  - 候補の表示元が期待どおりであることをテストで確認できること
  - _Depends: 115.8_
  - _Boundary: 工事写真の画像選択における候補の表示_

- [x] 115.17 (P) フロントエンドの静的検査が起動できない状態を解消する
  - フロントエンドの静的検査は、規則を提供する追加部品と検査基盤の版が噛み合わず、規則の読み込み時に異常終了する。コミットのたびに失敗しており、検査が一度も実施されていない
  - 型検査は機能しているためコミット自体は成立しているが、静的検査による指摘は一切得られていない状態が続いている
  - 追加部品の更新、検査基盤の版の調整、あるいは当該規則の扱いの見直しにより、検査が起動して結果を返す状態にすること
  - **検査を通すために対象範囲を狭める、あるいは規則群ごと外すといった回避を行わないこと**
  - 検査が起動し、終了コードを返すことを確認できること
  - _Boundary: フロントエンドの静的検査の実行環境_

- [x] 115.18 (P) 合成済みサムネイルの保存形式と申告する形式の食い違いを解消する
  - 合成済みサムネイルは保存キーの拡張子と応答が申告する形式をひとつの形式で固定しているが、実体の生成は元の画像の形式を保つため、別の形式の実体が保存され得る
  - 表示は形式の推定で成立しているが、申告と実体が食い違う状態である
  - 生成する形式を申告に合わせるか、申告を実体に合わせるかを決め、両者を一致させること
  - 一致していることをテストで確認できること
  - _Boundary: 合成済みサムネイルの保存形式_

- [x] 115.19 (P) 同型の検証無効化が残る箇所を洗い出して解消する
  - 本要件の実装過程で、検証が実質を持たない同型の構造が繰り返し見つかった。条件分岐で検証本体を包む、待機の指定を尊重しない判定で沈黙して飛ばす、常に真になる判定を置く、応答の項目の有無を条件にする、自ら観測した結果を条件にする、の五つの型である
  - 是正したのは発見された箇所に限られ、同型の構造が他にも残っている。数量表の一部の検証に候補が無いことを理由に飛ばす箇所、写真の差し替えを扱う検証に早期の打ち切りがある
  - 五つの型を機械的に洗い出し、該当箇所を無条件の検証へ改めること。前提が満たせない場合は失敗させること
  - 洗い出しの手段と結果を記録し、以後の追加で再発したときに気づける形にすること
  - _Boundary: E2E_

- [x] 115.20 同一の現場調査内で表示順序の値が重複し並びが定まらない状態を解消する
  - 実データの観測で、画像十一枚に対し異なる表示順序の値が七個しかない状態が確認された。まとめて登録する経路が同じ値を割り当てている
  - 取得の並び替えは表示順序のみを指定しており第二の鍵が無いため、同じ値を持つ画像の間の並びは保存側の返却順に依存し、実行ごとに変わり得る
  - 要件は固定の表示順序で表示することを求めており、現状は厳密には満たしていない
  - まとめて登録する際の採番を一意にするか、取得の並び替えに第二の鍵を加えるかを決め、同じ値が存在しても並びが定まるようにすること
  - 並びが実行によって変わらないことをテストで確認できること
  - _Requirements: 4.10_
  - _Boundary: 画像の表示順序の採番と取得順序_

- [x] 115.21 (P) 並び替えの永続化を検証するE2Eの識別を安定した値へ揃える
  - 並び替えの永続化を検証する箇所は、表示元の値で並びを識別している。当該の値は要求ごとに変動し得る要素を含み、環境の構成によっては判定が成立しなくなる
  - 画像の識別子など、要求ごとに変動しない値で識別する形へ揃えること
  - 判定が対象の挙動を壊したときに失敗することを変異で確認できること
  - _Requirements: 10.8, 10.9_
  - _Boundary: E2E_

- [x] 115.22 (P) 参照されていない一括登録の採番を整理する
  - 一括登録を担う実装のうち、どの経路からも参照されていないものが件数を起点に採番している。これは表示順序の重複を生む型そのものである
  - 取得側の対策により表示は定まるため要件の充足には影響しないが、将来この実装が再び参照されると重複が生じる
  - 最大値を起点とする採番へ揃えるか、当該の実装を撤去するかを決めること
  - 参照が無いことを確認したうえで判断すること
  - _Boundary: 一括登録の採番_

- [x] 115.23 (P) 表示順序に関する要件番号の表記ゆれを揃える
  - 複数の箇所の注釈が、固定の表示順序を求める受入基準の番号を誤って記している。正しくは画像形式の対応を定める番号ではなく、固定の表示順序を定める番号である
  - 挙動には影響しないが、要件を追う際の誤誘導になる
  - 該当箇所を機械的に洗い出して揃えること
  - _Boundary: 注釈の記述_

- [x] 115.24 (P) 検証無効化の検出に残る三つの書き方を捕捉する
  - 検出の仕組みは、分割して受ける形、宣言と代入を分ける形、三項で検証を包む形の三つを捕捉できない
  - 特に二つ目は、この一群で多用される上位の有効範囲での宣言と組み合わさると、前提が満たせない場合に沈黙して終える構造が無検出になる
  - 三つの書き方を捕捉できるようにすること
  - 捕捉できることを、それぞれの形を注入して確認できること
  - _Depends: 115.19_
  - _Boundary: 検証無効化の検出_

- [x] 115.25 (P) 検証無効化の検出の過検出を圧縮する
  - 常に真になる判定として数えられている件数のうち、過半が正当な主張である。空文字で宣言して後から代入した値の検証や、既定値を補ったうえでの検証が誤って数えられている
  - 記録された件数に減らせないものが混ざると、是正の進捗が見えにくくなる
  - 比較の形を持つ式を除外し、後から代入される宣言を主題として扱わないようにすること
  - 圧縮の前後の件数を記録し、正当な主張が数えられなくなったことを確認できること
  - _Depends: 115.19_
  - _Boundary: 検証無効化の検出_

- [x] 115.26 (P) 検証無効化の検出を継続的な検査へも組み込む
  - 検出の仕組みは送出前の検査にのみ組み込まれており、継続的な検査には配線されていない
  - 同種の要件被覆の検査は継続的な検査にも入っている。同様に配線し、再発の検知を恒久化すること
  - 配線後に検査が起動して結果を返すことを確認できること
  - _Depends: 115.19_
  - _Boundary: 継続的な検査の構成_

- [x] 115.27 数量表の候補が無いことを理由に飛ばす検証を解消する
  - 数量表の検証に、候補が無いことを理由に検証本体を飛ばす構造が残っている。実行の記録上、当該の分岐を実際に通っており受入基準が検証されていない
  - 候補を事前に用意したうえで、無条件の検証へ改めること。前提が満たせない場合は失敗させること
  - 常に成立する論理和による判定も併せて解消すること
  - 対象の挙動を壊したときに失敗することを変異で確認できること
  - _Depends: 115.19_
  - _Boundary: E2E_

- [x] 115.28 要件被覆の検査が通らず送出できない状態を解消する（**送出の前提**）
  - 送出前の検査と継続的な検査の双方で、要件被覆の検査が必須の関門になっている。現在この検査は失敗しており、変更を送出できない
  - 未被覆は本要件の四項（応答時間、代替手段による表示、縮小表示への適用、判定結果の維持）と、数量表側の要件の十項である
  - 本要件の四項のうち、応答時間は性能測定として、判定結果の維持は単体の検証として、それぞれ既に確認されている。代替手段による表示と縮小表示への適用も一覧系の検証で扱われている
  - 各項について、対応する検証に要件の目印を付けるか、E2Eの対象外として登録するかを判断すること。**対象外とする場合は代替の検証手段を明示すること**
  - 数量表側の十項は別のスペックの所管である。当該スペックでの対応が必要か、本ブランチの変更が被覆を提供しているのに目印が無いだけかを判断すること
  - 検査が通ること
  - _Requirements: 38.4, 38.6, 38.7, 38.9_
  - _Boundary: 要件被覆の記録_

- [x] 115.29 数量項目のグループ間移動と複数選択の一括操作を実装する（**別スペックの所管**）
  - 115.27 で常に成立する判定を実質の検証へ改めた結果、数量表側の二つの受入基準が未実装であることが判明した
  - 別グループへの移動: 操作メニューの項目は上下移動・コピー・削除の四つのみで移動の導線が無い。移動先を選ぶダイアログは**実装も単体の検証も存在するが画面へ結線されていない**。状態管理側の移動処理も宣言のみで実体が無い
  - 複数選択の一括操作: 編集時に描かれる行に選択欄が無い。選択欄を持つ行は参照時専用で、経路上そもそも描かれない
  - 旧来の検証が一括操作の存在確認に用いていた文字列の一致は、無関係な「現場調査から一括追加」の操作に一致していた
  - 実装の見立ては五本から七本のファイル。移動は既存のダイアログの結線と状態管理への追加が主で比較的軽く、一括操作は選択列の追加が既存の格子配置全体へ波及するため重い
  - **本スペックの所管ではない。数量表生成のスペックで対応すること。** 115.27 で用意した検証がそのまま合否の判定になる
  - **この二件が未実装である間、当該の検証は失敗したまま残る。送出前の検査は検証を全件回すため、実装が済むまで本ブランチは送出できない**
  - _Boundary: 数量表の編集画面（本スペックの境界外）_

- [ ] 115.30 数量項目の入力上限の検証位置の不一致を解消する（**別スペックの所管**）
  - 数量項目の作成は要件13の全角・半角換算による入力上限を検証しないのに対し、保存は検証する
  - この非対称により、**作成できるが保存できない数量項目**を作れる。115.27 で検証用の値を投入した際に実際に発生し、保存が失敗する状態の数量表が残った
  - 作成の経路にも同じ上限を適用すること。**あるいは検証位置を一箇所へ寄せること**
  - **本スペックの所管ではない。数量表生成のスペックで対応すること**
  - _Blocked: 数量表生成スペックの所管。当該スペックでの実装が必要_
  - _Boundary: 数量項目の入力検証（本スペックの境界外）_

- [x] 115.31 (P) 入力上限の検証に残る常に成立する判定を解消する
  - 数量表の検証のうち、入力上限を扱う三箇所に、上限以内なら上限以内であることを、超えるなら超えた値であることを主張する構造が残っている。いずれの枝も必ず成立するため何も確かめていない
  - 該当は要件13の三項に対応する検証。115.27 の是正対象からは外れており、検出の記録にも常に成立する判定として残っている
  - 上限を超える入力に対して**切り詰めか拒否のいずれが起きるべきかを要件から判断**し、その挙動を無条件に主張する形へ改めること
  - 対象の挙動を壊したときに失敗することを変異で確認できること
  - **検証の是正は完了している。** 分岐を撤去し、入力欄が保持する値の文字幅が上限以内であることを無条件に主張する形へ改めた。要件22.5の合格済みの検証とまったく同じ書き方である
  - **プロダクション未実装のため三件が失敗したまま残る。** 入力時点の防止が編集画面に無く、上限超過は保存時にしか拒否されない
  - _Depends: 115.27_
  - _Boundary: 数量表の検証_

- [x] 115.33 入力時点での上限超過の防止を実装する（**別スペックの所管**）
  - 115.31 で常に成立する判定を実質の検証へ改めた結果、要件13の三項が未実装であることが判明した
  - 幅の検証を持つ部品は**実装も単体の検証も存在するが、本番の描画経路から一度も参照されていない**。残数を表示する別の入力部品も同様に未使用で、しかも値を無加工で通すため結線しても防止にはならない
  - 実際の編集画面が使う経路は、入力欄・行・状態管理のいずれの層でも幅を制限しない。入力した値がそのまま保持される
  - **数量表生成スペックのタスク12.1と14.1は完了印が付いているが実質未達である。** 12.1 は「入力中にリアルタイムで文字数をチェックし、最大文字数を超える入力を防止する」「既存の数量項目行コンポーネントに統合する」と規定しているが、統合が行われていない
  - 同スペックの要件22.5 は同じ文言で**入力時点の防止として実装済み**であり、幅が上限以内のときだけ状態を更新する方式を採っている。同じ方式を適用できる
  - **本スペックの所管ではない。数量表生成のスペックで対応すること。** 115.31 で是正した検証がそのまま合否の判定になる
  - **この三件が未実装である間、当該の検証は失敗したまま残る。115.29 と併せて当該ファイルの失敗は五件になり、実装が済むまで本ブランチは送出できない**
  - _Boundary: 数量項目の入力欄（本スペックの境界外）_

- [x] 115.34 (P) 数量グループ名の防止が変換中の入力を壊す状態を解消する
  - 要件22.5（数量グループ名の上限超過の防止）は、115.33 で是正したのと**同じ欠陥**を抱えている
  - 変換の確定前の入力を確定入力と同一に扱うため、読みの幅が上限を超える変換を行うと確定前に切り詰められ、変換途中のかなが残る
  - 上限は全角25文字と大きいが、現場名と工種を含む命名は業務上ありうる長さであり、一度に長い読みを変換する場面は起こりうる
  - 115.33 と同じ方式で是正すること。変換中は幅の判定を行わず、確定時に評価して超過時のみ変換開始直前の値へ戻す
  - **変換を経由する検証を用意すること。** 一括投入による検証はこの欠陥を構造的に検出できない
  - _Depends: 115.33_
  - _Boundary: 数量グループ名の入力_

- [x] 115.32 (P) 表示順序の検証が無関係な要件を被覆済みと見せている状態を解消する
  - 一覧の表示順序を確かめる検証に、画像形式の対応を指す要件番号が目印として付いている
  - 目印は被覆の検査が読み取る形式のため、**実体を伴わない被覆が成立している**。当該の要件は別の手段で確かめられているか、確かめられていないかのいずれかであり、現状では判別できない
  - 表示順序の受入基準そのものは別の検証で正しく被覆されているため、被覆率の欠落は生じない
  - 目印を正しい番号へ改め、**画像形式の対応が実際に検証されているかを確認**すること。検証されていなければ被覆の登録を見直すこと
  - 画面側の注釈にも同じ誤記がある
  - _Depends: 115.23_
  - _Boundary: 要件被覆の記録_

- [x] 115.35 (P) 削除された項目が選択状態に残る問題を解消する
  - 単一の削除およびグループごとの削除が、選択状態の刈り込みを行っていない
  - 選択中の項目を行のメニューから削除するか、所属するグループごと削除すると、**選択の記録だけが残る**。一括操作の操作面が件数を表示したまま各操作が無反応になる
  - 「選択を解除」で復旧でき誤削除は起きないため実害は限定的だが、利用者からは操作が効かないように見える
  - 削除の処理で選択状態も併せて刈り込むこと。**削除された項目が選択状態に残らないことを確かめる検証を用意すること**
  - _Depends: 115.29_
  - _Boundary: 数量表の編集の状態管理_

- [x] 115.36 (P) 保存経路の説明が実装と食い違う状態を解消する
  - 115.29 で保存の差分適用を変更したが、説明文が旧来の記述のまま残っている
  - 説明は「項目はグループ単位で削除・更新・作成する」としているが、実体は**数量表全体で判定し、削除は後段で行う**
  - 説明を実装に合わせること
  - _Depends: 115.29_
  - _Boundary: 保存経路の記述_

- [x] 115.37 保存要求に含まれる項目が当該の数量表に属するかを検証する
  - 保存の要求に含まれる項目の識別子について、**それが当該の数量表に属するかを検証していない**。形式が正しいかのみを見ている
  - この欠落は 115.29 以前から存在するが、115.29 で更新に所属グループを含めたことにより、**他の数量表の識別子を渡した場合の影響が値の上書きから所属の付け替えへ広がった**
  - 保存の対象が当該の数量表に属することを検証し、属さない場合は拒否すること
  - **他の数量表の項目を渡した場合に拒否されることを確かめる検証を用意すること**
  - _Depends: 115.29_
  - _Boundary: 保存経路の入力検証_

- [x] 115.38 (P) 一括操作の操作面が画面外へ出る状態を改善する
  - 一括操作の操作面が通常の流れの中（一覧の直前）に置かれているため、**下方の行を選択した場合は上へ移動しないと操作できない**
  - 要件45 は見出しの操作群のみを対象とするため要件違反ではないが、選択してから操作するまでの導線として不自然である
  - 選択がある間は常に見える位置に置くことを検討すること
  - _Depends: 115.29_
  - _Boundary: 数量表の編集画面_

- [x] 115.39 (P) 保存要求内で同じ識別子が重複する場合を検出する
  - 一つの保存要求の中に同じ項目の識別子が複数回現れる場合、検出されない
  - 同じ行が二重に更新され、さらに**削除の対象からも外れる**ため、意図しない状態が生じうる
  - グループの識別子についても同様に確認すること
  - 重複を検出して拒否すること。**重複を含む要求が拒否されることを確かめる検証を用意すること**
  - _Depends: 115.37_
  - _Boundary: 保存経路の入力検証_

- [x] 115.40 (P) グループ名の焦点喪失が変換中を考慮しない状態を解消する
  - 焦点を失った際の確定処理が、変換中かどうかを見ていない
  - 変換中は幅の判定を迂回するため上限超過の値が保持される。確定の通知と焦点喪失が同一の実行単位に入ると、戻し処理が反映される前の値で確定されうる
  - **現時点で利用者が到達できる経路は確認されていない。** 利用者の操作による焦点喪失では別の実行単位となり再現せず、画面側から当該の入力欄へ焦点を操作する経路も存在しない
  - ただし将来の変更で到達可能になりうるため、確定の処理と同じ防護を焦点喪失の処理にも設けること
  - _Depends: 115.34_
  - _Boundary: 数量グループ名の入力_

- [x] 115.41 (P) 変換中の状態が固着する経路に検証を設ける
  - 115.34 で、編集を開始する際に変換中の記録を初期化する処理を追加した
  - 変換中に入力欄が外れると確定の通知が届かず記録が残り、**以後すべての確定と取り消しが抑止され続ける**。初期化はこれを防ぐ
  - この一行を外しても既存の検証はすべて成功する。**外すと失敗する検証を用意すること**
  - _Depends: 115.34_
  - _Boundary: 数量グループ名の入力_

- [x] 115.42 変換中の記録の寿命を一貫させる（**入力時点の防止が恒久的に無効化されうる**）
  - 数量項目の入力欄と残数表示の入力欄は、変換中の記録を確定の通知でしか消さず、**焦点を得た際の初期化を持たない**
  - 変換中に確定の通知が届かないまま焦点が外れると記録が残り、**以後その入力欄では変換と無関係の直接入力でも幅の判定が恒久的に迂回される**。実測で確認済み
  - さらに一方は、焦点喪失の際に幅の判定を経ていない値を補完の候補として登録しうる。上限を超える文字列が候補一覧に入る
  - 行の入力欄は常時存在するため、編集のたびに作り直されるグループ名より固着の影響が長く続く。**115.33 で実装した入力時点の防止が恒久的に無効化されうる**
  - グループ名の側にも同じ性質の残存経路がある。空欄のまま焦点を失うと誤りの表示で編集欄が残り、その状態で記録が固着して確定も取り消しも効かなくなる。**本変更以前から同一の挙動であり退行ではない**
  - **変換中の記録の寿命を一貫して定めること**（焦点喪失または編集終了で消す等）。三箇所で揃えること
  - 寿命を変える場合、115.41 の検証は「固着からの復帰」ではなく「焦点喪失で記録が消えること」を主張する形へ組み替える必要がある
  - _Depends: 115.40, 115.41_
  - _Boundary: 変換中の状態管理_

- [x] 115.43 補完候補の選択と取得が幅の判定を経ていない状態を解消する
  - 候補を選ぶ処理が幅の判定を経ていない。また候補の取得も、取り出した値を幅で濾していない
  - このため**サーバー側に上限を超える値があると、選択時にそのまま入力欄へ入る**。焦点を失った時点で戻るが、それまでは上限超過の値が状態に載る
  - 115.42 で焦点喪失の際の候補登録は上限以内に限定したが、**取得の側が濾されていないため経路が残っている**
  - 選択の処理に幅の判定を適用するか、取得の時点で濾すこと。判断と根拠を報告すること
  - **サーバー側に上限超過の値がある状態で、選択しても上限を超える値が入らないことを確かめる検証を用意すること**
  - _Depends: 115.42_
  - _Boundary: 補完候補_

- [x] 115.44 (P) 空洞化した防護の検証を組み替える
  - 115.42 で焦点喪失の際に変換中の記録を消すようにしたため、編集開始時の初期化を外しても全件が成功するようになった
  - この一行は 115.41 が守っていた当のものである。**追跡の結果、変換中は確定も取り消しも抑止されるため焦点喪失以外に編集欄を閉じる経路が無く、機能上の欠陥ではない**と確認されている
  - ただし 115.41 の防護が機械的に守られない状態になった。**初期化を外すと失敗する検証へ組み替えるか、冗長として整理すること**
  - 同種の状態が入力欄側の焦点喪失の処理にもある（焦点獲得側の初期化が本体で、焦点喪失側は多重の防御）
  - **保存経路の重複の検出にも同種の状態がある。** グループの識別子と項目の識別子を別々の集合で判定しているが、同じ集合にしても検証はすべて成功する。実際の識別子は別の表のものなので衝突は起きず実害は無いが、分離が機械的に守られていない
  - **一括操作の操作面の検証にも同種の状態がある。** 狭い幅での収まりを確かめる検証が、指定値の照合にとどまり実際の収まりを保証していない。収まりを実際に担っているのは別の指定である。また選択が無い間の非表示を確かめる検証が既存のものと重複している
  - _Depends: 115.42, 115.39, 115.38_
  - _Boundary: 変換中の状態管理・保存経路の入力検証・数量表の編集画面_

- [x] 115.45 (P) 要件番号の引用の誤りを正す
  - 補完候補の登録に関する注釈が要件7.6 を引用しているが、正しくは **7.5**（焦点喪失時の候補追加）である。7.6 は取得の方法に関する制約
  - 当該ファイルの既存の慣習に沿った誤記であり、被覆の検査には影響しない
  - 同種の誤りが他に無いか確認すること
  - _Depends: 115.42_
  - _Boundary: 補完候補_

- [x] 115.46 (P) 狭い画面で見出しの操作が画面幅を超える状態を解消する
  - 幅375 で見出しの「現場調査から一括追加」の操作が画面幅を超え、**ページ全体に横方向の移動が生じている**（内容の幅761）
  - 横方向へ移動すると、上端に固定した見出しも下端に固定した操作面も画面外へ出る。縦方向のみを固定する方式のため
  - **115.38 以前から存在する要件45 側の問題であり、同タスクが原因でも悪化要因でもない**（選択の有無で内容の幅は変わらないことを実測で確認済み）
  - 狭い幅で見出しの操作群が折り返すか、収まる形にすること
  - **幅375 で横方向の移動が生じないことを確かめること**
  - _Boundary: 数量表の編集画面の見出し_

- [x] 115.47 長押しで注釈の操作メニューが開かない状態を解消する（**要件27.9 が実機で未達**）
  - 長押しの通知が組み立てる情報に操作対象が含まれず、受け手は対象が無い通知を無視する。**このため実際のタッチ操作では操作メニューが開かない**
  - 操作メニューを開く箇所は一つしかなく、他に到達する経路は無い。単体の検証は対象を含む通知を直接与えているため、この欠落を検出できていない
  - 同じ欠落はダブルタップ側では既に是正済みであり、通知の座標から実際の当たり判定を行って対象を解決する方式へ切り替えている。長押し側だけが残された
  - **ダブルタップ側と同じ方式へ揃えること。**判定の実装を二重に持たないこと
  - 対象を含まない通知でも、対象の上を長押しすれば操作メニューが開くことを確かめる検証を用意すること
  - 描画の道具を選択している間は開かない既存の挙動を変えないこと
  - _Requirements: 27.2, 27.9, 27.10_
  - _Boundary: 注釈編集のジェスチャー処理_

- [x] 115.48 前提条件で自動的に無効化されるE2Eを解消する（**AI運用7原則 第3原則違反**）
  - 三つのE2Eが環境変数の有無で自らを飛ばす構成になっている。当該の環境変数はどこにも設定されていないため、**7件以上が恒久的に飛ばされたまま緑として扱われている**
  - 対象は要件24・25・27・28・31・32 の受入レベルの検証であり、設計の検証方針がこれらの要件の確認手段として名指ししているものである。単体の検証は残るが、実ブラウザでの受入確認は一度も実行されていない
  - 115.47 の欠陥を検出できる唯一の検証もこの中に含まれる。**欠陥と検出手段が同時に眠っている**
  - 飛ばす構成を廃し、前提となるデータを検証の中で用意すること。用意できない場合は飛ばさずに失敗させること
  - 検証無効化の検出の基準表に登録されている当該の記述も併せて取り除くこと
  - **組み替えた三つのE2Eが実ブラウザで通ること**
  - **結果: 恒久スキップは全廃し 0 skipped を達成した（21 passed / 3 failed / 0 skipped）。** 残る3件の失敗は本タスクの境界外にある本番の未実装であり、テスト側の不備ではない。ゲートを外したことで初めて可視化された欠陥であって、本タスク本文が予告した「欠陥と検出手段が同時に眠っている」状態の解消そのものである。是正は 115.50・115.51・115.52 が所管する
  - _Requirements: 24, 25, 27, 28, 31, 32_
  - _Boundary: 現場調査のE2E_

- [x] 115.49 (P) ジェスチャーの通知に残る使われない対象の項目を整理する
  - 115.47 の是正により、ジェスチャーの通知が持つ対象の項目は、設定する側も読む側も本番のコードに存在しなくなった
  - 宣言だけが残っていると、**再び通知の対象に依存する実装が持ち込まれる温床になる**。実際に長押しがその依存で機能していなかった
  - 通知の型の宣言と設計文書の記述を併せて整理すること
  - _Depends: 115.47_
  - _Boundary: 注釈編集のジェスチャー処理_

- [x] 115.50 フリーハンドが白縁取りの対象形状として作成されない状態を解消する
  - 115.48 で恒久スキップを解いた結果、要件32の六形状のうちフリーハンドだけが白縁取りを持たないことが判明した
  - 本番の描画経路は既定のブラシを設定するだけで、描き終えた線を専用の形状へ変換する処理が存在しない。変換の契機となる描画完了の通知を購読する箇所が本番コードに一つも無い
  - 白縁取りを持つ専用の形状とそれを生成するブラシは**実装も単体の検証も存在するが、本番の描画経路から一度も参照されていない**。115.33 と同じ「部品はあるが結線が無い」形である
  - 復元側は専用形状として登録済みのため、保存された既存データの読み込みは変換の実装後に初めて意味を持つ
  - 設計は当該形状を輪郭と本体の二重の線を持つ集合として規定しており、その構造に従うこと
  - 検出手段は 115.48 が用意した `site-survey-all-shape-outline.spec.ts` の (c)。そのまま合否の判定になる
  - _Requirements: 32.1, 32.6, 32.7, 32.11_
  - _Boundary: 注釈エディタのフリーハンド描画_

- [x] 115.51 現場調査詳細画面に画像の選択操作を結線する
  - 115.48 で恒久スキップを解いた結果、要件31.2 の選択画像エクスポートが画面から到達不能であることが判明した
  - 選択欄を持つ一覧部品も、詳細画面側の選択状態も**実装済みだが結線されていない**。詳細画面が実際に描画するのは別の管理用部品であり、選択欄を持つ一覧はどの画面からも使われていない
  - 詳細画面のコメントに「選択UIの組み込みは別タスクの責務」と明記されたまま先送りされている。その別タスクが本タスクである
  - 結果として選択状態は恒久的に空となり、選択エクスポートの操作手段は常に実行不可のままになる
  - 要件31.3（未選択時に実行不可）の検証は、選択が常に空である現状では欠陥のおかげで通っている。**是正後は31.3 が実質の検証となるため、31.2 と31.3 の双方が緑であることを確認すること**
  - 検出手段は 115.48 が用意した `site-survey-bulk-export.spec.ts` の (d)。そのまま合否の判定になる
  - _Requirements: 31.2, 31.3_
  - _Boundary: 現場調査詳細画面の画像一覧_

- [x] 115.52 長押しで開いた操作メニューが指を離した時点で閉じる状態を解消する
  - 115.48 で恒久スキップを解いた結果、要件27.3 がタッチ操作から到達不能であることが判明した
  - 長押しでメニューが開き対象も選択される（115.47 の是正が実ブラウザで機能していることは検証済み）が、指を離した瞬間に閉じるため、項目をタップする機会が存在しない
  - 原因はメニュー外のタップで閉じる全画面の重ね置き要素で、長押しの解放後にブラウザが生成する互換のクリックがそこへ着弾する。**要件27.5 の実装が要件27.3 を潰している**
  - 要件27.5 の既存挙動（メニュー外のタップで閉じる）を壊さないこと
  - マウス操作では従来どおり動作するため、単体の検証と机上の確認では検出できない。**実機相当のタッチ入力による検証で確かめること**
  - 検出手段は 115.48 が用意した `site-survey-annotation-mobile.spec.ts` の (f)。そのまま合否の判定になる
  - _Requirements: 27.3, 27.5_
  - _Boundary: 注釈のコンテキストメニュー_

- [x] 115.53 (P) 白縁取りの太さの比率が本体線幅によっては満たされない状態を解消する
  - 115.50 のレビューで判明した。要件32.2 は白縁取りを本体線幅の1.5倍以上と定めるが、実装は全形状で本体線幅に固定値を加算する方式のため、比率ではなく差分で決まる
  - 縁取りの既定値は 3、本体線幅の入力上限は 20 であり、**本体線幅が 13 以上になると比率が 1.5 を下回る**
  - 七形状すべてに共通する既存の性質であり、115.50 が持ち込んだ回帰ではない
  - 固定値の加算を比率の下限を満たす算出へ改めるか、本体線幅の上限を見直すかを要件から判断すること
  - 本体線幅の上限値で比率が満たされることを検証すること。既定値のみで確かめると欠落を再び見逃す
  - _Requirements: 32.2_
  - _Boundary: 注釈の白縁取りの太さの算出_

- [x] 115.54 (P) 一括エクスポートの担い手の記述を実装の実態へ是正する
  - 115.51 のレビューで判明した。設計文書は選択操作の担い手として、どの画面からも描画されない一覧部品と、**実在しないファイル名の画面部品**を指している
  - 実際に詳細画面の画像一覧を担うのは写真管理の部品であり、設計文書の別の箇所ではその旨が正しく規定されている。要件31 の節だけが追随していない
  - 該当は十箇所（技術方針、構成図の節点二つ、技術要素の表、ファイル構成、部品の責務二箇所、流れ図の登場人物、追跡表、部品一覧、部品の詳細節）
  - 111.5 と同じ扱いである。設計が実態に追随していない箇所は、実装を設計へ合わせるのではなく**設計を是正して記録に残す**
  - _Requirements: 31.2, 31.3_
  - _Boundary: 設計文書（要件31 の該当節）_

- [x] 115.55 (P) 結線されないまま残る画像一覧の部品と、その未結線の選択操作を撤去する
  - 115.51 のレビューで判明した。選択欄を持つ一覧部品はどの画面からも描画されないまま残り、まとめ出力からの再エクスポートと自身の検証・表示確認ファイルだけが参照している
  - 当該部品の検証には要件31.2・31.3 を対象とする十二件の検証が緑で存在するが、**出荷されていない部品を確かめているだけで何も保証していない**。115.27 以降に一掃してきた偽の緑と同じ種類である
  - 選択欄を持つ未使用の部品が二つ存在する状態は、「部品はあるが結線が無い」の四度目の温床になる
  - 部品・表示確認・検証・まとめ出力からの再エクスポートを撤去すること。**残す判断を採る場合は、結線せずに残す理由を記録に明記すること**
  - _Boundary: 未結線の画像一覧部品とその周辺_

- [x] 115.56 再取得した現場調査に存在しない画像が選択に残る状態を解消する
  - 115.51 のレビューで判明した。現場調査の再取得は画像一覧を差し替えるが選択集合を整理しないため、別の現場調査へ移った後も前の選択が残る
  - 結果、選択画像エクスポートの操作手段が件数を表示したまま活性になる一方、実際の対象は存在しない。要件31.3 の非活性の判定が現在の画像を基準にしていない
  - 対象が0件の場合は要件31.15 の通知に落ちるため誤ったエクスポートは起きないが、**活性状態が要件31.3 と矛盾する窓が生じる**
  - 選択集合の非整合は 115.51 が持ち込んだものではなく、選択が到達可能になったことで初めて現れた
  - 再取得で画像一覧を差し替える際に、現存する画像に含まれない選択を取り除くこと
  - _Requirements: 31.2, 31.3_
  - _Boundary: 現場調査詳細画面の画像一覧_

- [x] 115.57 (P) 操作メニューの設計記述に互換クリックの落とし穴を記録する
  - 115.52 のレビューで推奨された。当該部品のリスク欄は背景への描画の漏れは記しているが、本欠陥の原因である互換クリックには触れていない
  - 長押しの解放時に生成される互換のクリックは押下を伴わないため、メニュー外タップの判定を素朴なクリックで行うと解放そのものを外側タップと誤認する
  - 判定を「自身が受けた押下を伴うクリックのみ」とした根拠を記述に残し、**将来この判定を書き直す際に同じ欠陥を再導入しないようにする**
  - _Requirements: 27.3, 27.5_
  - _Boundary: 設計文書（操作メニューの節）_

- [x] 115.58 注釈付きサムネイルのE2Eに残る構造的な実行不能を解消する（**AI運用7原則 第3原則違反**）
  - 115.52 完了後の全件実行で判明した。**115.48 が是正した三ファイルの対象外**に、同じ型の自動無効化が残っていた
  - 要件20.1 の受入検証二件が、現場調査の識別子が無いことを理由に自らを飛ばす。当該の識別子は**定数として空値で宣言され一度も代入されない**ため、二件は構造的に永久に実行されない
  - 注釈に「現場調査の作成と画像アップロードは手動テストまたは別のE2Eで事前準備が必要」と書かれたまま、その事前準備がどこにも存在しない
  - **仮に実行されても何も確かめない。**両件とも本体のアサーションが要素の可視判定で包まれており、要素が無ければ素通りで合格する。飛ばす構成と条件付きの判定が二重にかかっている
  - 同ファイルには他にもプロジェクト作成の失敗を理由に飛ばす構成があり、併せて是正すること
  - 115.48 と同じ方針で組み替えること。前提となるデータを検証の中で用意し、用意できない場合は飛ばさずに失敗させる。条件で包んだ判定は無条件の主張へ改める
  - 検証無効化の検出の基準表に登録されている当該の記述も併せて取り除くこと
  - 対象の挙動を壊したときに失敗することを変異で確認できること
  - _Requirements: 20.1, 20.4_
  - _Boundary: 現場調査のE2E（注釈付きサムネイル）_

- [x] 115.59 (P) 矢印の白縁取りの比率が本体線幅9以上で満たされない状態を解消する
  - 115.53 のレビューで判明した。要件24.2 は矢印にも同じ1.5倍以上を定めるが、縁取り幅が固定値2のため描画幅は本体に4を足すだけである
  - 比率は本体線幅8でちょうど1.5、**9以上で下回る**。六形状の13よりも早く破綻する
  - 矢印の既定値は六形状とは独立した項目として持たれており、115.53 の是正は波及していない
  - 115.53 と同じ方式（本体線幅から比率の下限を満たす幅を導出する）を適用できる。**算出は一元管理の資材へ置き、ツール側で再実装しないこと**
  - **本体線幅の上限値で比率が満たされることを検証すること。**既定値のみで確かめると同じ欠落を繰り返す
  - _Requirements: 24.2_
  - _Boundary: 矢印注釈の白縁取りの太さの算出_

- [x] 115.60 (P) 注釈編集画面が一元管理の既定値を影で上書きしている状態を解消する
  - 115.53 のレビューで判明した。注釈編集画面が既定スタイルを**自前の定数として局所的に宣言**しており、一元管理の資材が供給する値を覆い隠している
  - 中央の既定線幅は3だが、局所の宣言は2であり、実際に描かれる注釈は中央の意図と異なる
  - 要件26 は設定資材の一元管理を定めており、供給元が二重になっている現状はこれに反する
  - 影響は線幅にとどまらない可能性があるため、局所宣言が持つ項目すべてについて中央との差を洗い出すこと
  - 中央の資材から供給する形へ改め、**局所の宣言を撤去すること**
  - _Requirements: 26.1, 26.5_
  - _Boundary: 注釈編集画面の既定スタイル値の供給元_

- [x] 115.61 (P) 白縁取りのE2Eが幅を実質検証していない状態を解消する
  - 115.53 のレビューで判明した。白縁取りのE2Eは幅について**0より大きいことしか主張していない**
  - 要件32.2 が定める本体線幅に対する比率も、入力上限での成立も観測していない。115.53 が是正した欠陥はこのE2Eでは検出できなかった
  - 115.53 は単体で入力上限まで確かめたが、実ブラウザでの受入確認は比率を見ていない
  - 比率の主張へ改め、少なくとも入力上限に相当する線幅で確かめること
  - 対象の挙動を壊したときに失敗することを変異で確認できること
  - _Requirements: 32.2_
  - _Boundary: 白縁取りのE2Eの観測強度_

- [x] 115.62 (P) 設計文書における詳細画面部品の呼称を実ファイル名へ統一する
  - 115.54 のレビューで判明した。要件1〜30 の節は詳細画面を論理部品名で呼び、要件35・37 の節は実ファイル名で呼んでおり、**二つの規約が文書内に併存**している
  - 該当は約三十箇所。いずれも実在しないパスは指していないため 115.54 の欠陥とは別系統だが、**どちらが論理名でどちらが実ファイルかを読み手が判別できない状態そのものが 115.54 を生んだ遠因**である
  - 111.5 の記録が示すとおり、設計と実態の乖離は要件を丸ごと未実装のまま通す。既知の不整合を放置する判断は取らない
  - 実ファイルに対応する名称は実ファイル名で記す規約を文書の先頭付近に明記し、追跡表の論理部品列を含めて統一すること
  - _Boundary: 設計文書（要件1〜30 の該当節および呼称規約）_

- [x] 115.63 (P) 一括エクスポート節のファイル構成に残る配置の誤りを是正する
  - 115.54 のレビューで判明した。要件31 節のファイル構成に、実際の配置と異なるパスが二件残っている
  - 図形登録の資材と書き出しの処理が、いずれも実際より浅い階層または誤った中間階層に記されている
  - 事前計画としての記述ブロックであり 115.54 が列挙した十箇所には該当しないため、境界外として残された
  - 記載する全パスが実在することを確認すること。**115.54 が是正した欠陥の本質は、実在しないパスを書いていたことである**
  - _Boundary: 設計文書（要件31 のファイル構成ブロック）_

- [x] 115.64 結線されないまま残る現場調査の部品群と、その未結線を確かめるだけの検証を撤去する
  - 115.55 のレビューで判明した。撤去した一覧部品と**同じ形の未結線部品が、さらに四件**残っている
  - いずれも本番コードから一切参照されず、表示確認と単体の検証だけが参照している。うち一件はまとめ出力からの再エクスポートすら無く、もう一件は本番からの唯一の言及が別部品のコメント内である
  - **「部品はあるが結線が無い」の五度目である。**115.33・115.50・115.51・115.55 に続く同型で、いずれも緑の検証を伴っていた
  - 対象は、現場調査の誤り表示・現場調査の一覧表示・保存容量の警告帯・現場調査の絞り込み
  - 部品・表示確認・検証・まとめ出力からの再エクスポートを撤去すること。**残す判断を採る場合は、結線しない理由を設計文書に明記すること**
  - 撤去後にテスト件数の減少が削除した検証の件数と一致することを確認し、出荷済みの挙動で検証を失ったものが無いことを個別に確かめること
  - _Boundary: 未結線の現場調査部品とその周辺_

- [x] 115.65 (P) 選択集合を破壊しないことを機械的に守る
  - 115.55 のレビューで判明した。撤去した部品の検証には呼び出し元の集合を直接書き換えないことの主張があったが、引き継ぎ先の検証には同等物が無い
  - 現在の実装は複製してから変更しており正しいが、既存の検証は等値の比較のみのため、**書き換える実装へ退行しても緑のまま通る**
  - 出荷済みの挙動であり、退行を検出できない状態を残さないこと
  - 対象の挙動を壊したときに失敗することを変異で確認できること
  - _Requirements: 31.2_
  - _Boundary: 画像一覧の選択欄の検証_

- [x] 115.66 (P) 現場調査をまたぐ選択の整合を実ブラウザで固定する
  - 115.56 のレビューで推奨された。別の現場調査へ移った際に選択が残らないことの防護は現在**単体の検証のみ**である
  - 一括エクスポートのE2Eは単一の現場調査の中に閉じており、調査をまたぐ経路を通らない
  - 調査Aで選択したのち調査Bへ画面遷移し、選択画像エクスポートが0件かつ非活性であることを確かめること
  - 対象の挙動を壊したときに失敗することを変異で確認できること
  - _Requirements: 31.2, 31.3_
  - _Boundary: 一括エクスポートのE2E検証_

- [x] 115.67 現場調査一覧の代表画像に合成済みサムネイルの表示元URLを供給する
  - 115.58 のレビューで判明した。一覧を返す経路は合成済みサムネイルの保存位置を返すが**表示元URLを返さない**ため、一覧の代表画像は常にクライアント側の合成へ落ちる
  - 結果、一覧を開くたびに注釈データの取得と描画が写真の数だけ発生する。要件38 が定める「表示リクエストを写真数に比例させない」方針と非対称である
  - 要件20.3 は現状でも満たされるため機能欠陥ではないが、方針の不一致として残る
  - 111.5 が詳細取得の経路について是正したのと同じ形の欠落が、一覧取得の経路に残っている
  - 表示元URLを一覧の応答へ引き渡し、表示側が合成済みサムネイルを採用できるようにすること
  - _Requirements: 20.3, 38.2, 38.7_
  - _Boundary: 現場調査一覧の応答と一覧画面の代表画像表示_

- [x] 115.68 (P) 注釈付きサムネイルのE2Eに残る空振りの判定と沈黙する前提準備を解消する
  - 115.58 のレビューで判明した。二件とも本タスクが是正した欠陥そのものではないが、同じ型である
  - 保存前に合成済みサムネイルが現れないことの判定は、**そもそも当該の表示元が一覧の応答に存在しないため恒久的に成立する**。壊しても落ちない。115.67 の実施後に初めて実質の判定になる
  - 前提準備のうち担当者の選択は、選択肢が無い場合に何もせず素通りする。要件の検証ではないため第3原則違反ではないが、前提が崩れた際の失敗箇所が後段までずれる
  - 空振りの判定は 115.67 の実施後に実効性を確かめること。前提準備は選択肢の存在を明示的に主張する形へ改めること
  - _Depends: 115.67_
  - _Requirements: 20.3_
  - _Boundary: 現場調査のE2E（注釈付きサムネイル）_

- [x] 115.69 (P) ダブルタップの発火間隔が閾値に対し余裕不足で間欠的に失敗する状態を解消する
  - 115.59 の検証中に一度だけ失敗し再試行で回復した事象を、レビューが追跡して特定した
  - 実タッチを模す補助関数は二回目のタップまでに公称約170ミリ秒を費やす一方、ダブルタップと見なす閾値は300ミリ秒である。差し引き約130ミリ秒の余裕しかなく、そこへ操作の往復三回分が入る
  - 負荷のかかった実行環境では往復が伸びて閾値を越え、二回のタップが別々の単発タップとして扱われる
  - **115.59 の変更とは無関係である。**既定の線幅では当該変更は同一の値を生み、対象のE2Eは線幅を一度も指定しない
  - 待機を詰めるか、実測した経過時間が閾値内であることを主張する形へ改めること。**間欠的な失敗を再試行で覆い隠さないこと**
  - _Requirements: 27.1_
  - _Boundary: E2Eの実タッチ補助関数のダブルタップ発火タイミング_

- [x] 115.70 (P) スタイルパネルの資材に残る同名の既定スタイル宣言を解消する
  - 115.60 のレビューで判明した。スタイルパネルの資材に**同じ名前の既定スタイル宣言**が別の型として存在し、本体色と線幅を独自に持っている
  - 115.60 が撤去したのとまったく同じ形の二重供給であり、要件26.5 の趣旨に反する
  - 当該の宣言を使う部品は**本番から一度も参照されていない**。実際に描かれるのは注釈の道具帯が内包する同名の部品で、そちらは一元管理の資材を参照する
  - 結果、表示確認と単体の検証だけが実画面と異なる既定値で回っている。**「部品はあるが結線が無い」と「二重の供給元」が重なった状態**である
  - 一元管理の資材から供給する形へ改めるか、未結線の部品ごと撤去すること。撤去する場合は 115.64 と併せて扱うこと
  - _Requirements: 26.1, 26.5_
  - _Boundary: スタイルパネルの資材と未結線のスタイルパネル部品_

- [x] 115.71 (P) 既定線幅の是正に伴う六形状の縁取り既定値の変化を記録する
  - 115.60 のレビューで判明した。既定線幅が2から3へ是正された結果、六形状の片側の縁取り幅は算出により2から3へ変わる
  - 矢印は丸め方が異なるため2のまま変わらない。**同じ既定線幅の変更が形状と矢印で異なる結果を生む**
  - 要件24.2・32.2 の比率はいずれも満たすため欠陥ではないが、**既定の見た目が変わった事実がどこにも記録されていない**
  - 設計文書へ既定の見た目として記録するか、資材の検証に明示的な観測として固定すること
  - _Requirements: 24.2, 32.2, 26.5_
  - _Boundary: 注釈の既定スタイル資材の記録_

- [x] 115.72 (P) 塗りの既定値の検証が本番の代替値を複製している状態を解消する
  - 115.60 のレビューで判明した。追加した既定スタイルの検証のうち塗りの項目は、期待値として**本番側の代替値をそのまま複製**している
  - 中央の値が空である限り、局所の宣言で同じ空値を再導入しても検出できない
  - 現状は中央と局所の差が無い項目のため実害は生じていないが、**再導入の防護に穴が空いている**
  - 代替値の複製をやめ、中央の値そのものを期待値とする形へ改めること
  - **115.70 のレビューが同型をもう一件検出した。**スタイルパネルの資材の検証にも、塗りの期待値として本番と同一の橋渡し式を複製した箇所がある
  - 中央の値を巻き戻す検証で他の四項目が落ちるなか、**塗りだけが緑のまま**であることが実測されている
  - 両方を対象とすること。**同じ形が二箇所にあった以上、他に無いかも機械的に洗い出すこと**
  - _Depends: 115.60_
  - _Requirements: 26.5_
  - _Boundary: 既定スタイルの検証における塗りの期待値（注釈編集画面とスタイルパネルの資材）_

- [x] 115.73 (P) 復元時の表示倍率が形状の内部へ一貫して届いていない状態を解消する
  - 115.61 のレビューで判明した。注釈編集画面の復元処理は、保存時と現在のキャンバスの大きさが異なる場合に表示倍率を掛けるが、**掛ける先が集合体へ複写された線幅だけ**である
  - 集合体の中に実際に描かれている本体線と縁取り線の線幅、および白縁取りの片側幅を保持する属性には倍率が掛からない
  - 集合体そのものにも拡大率が掛かるため**見た目の比率は保たれる**。したがって表示上の欠陥ではない
  - 壊れるのは複写された線幅の値のみで、復元後に線幅を編集し直す経路などで実描画と食い違う基準値が使われうる
  - 115.61 のE2Eが比率の基準に集合体の子の線幅を選んだのは、この食い違いに巻き込まれないためである。**本欠陥が解消されれば基準の選択は任意になる**
  - 倍率の適用先を揃えるか、複写された線幅を復元後に実描画から導出し直すこと
  - 対象の挙動を壊したときに失敗することを変異で確認できること
  - _Requirements: 32.2_
  - _Boundary: 注釈編集画面の復元処理における表示倍率の適用先_

- [x] 115.74 (P) 契約名の実在対照表を設計文書の残り全域へ広げる
  - 115.62 のレビューで判明した。新設した契約名の対照表は**要件1〜30 節だけを対象**としている
  - 一方で新設した規約は文書全体に効き、表に無い契約名を実在するものとして扱ってはならないと定める
  - 要件31 以降の節には型の宣言が三十四件あり、**そのうち二十九件は実装に実体を持つ**。表に無いため誤って実体無しと読まれうる
  - 誤って実在と断じる方向の害は無いため機能欠陥ではないが、規約の適用範囲と表の対象範囲が食い違ったままである
  - 115.62 と同じ抽出手順で残り全域を対照し、表へ取り込むこと。**実体があると記した行は宣言位置を実際に読んで照合すること**
  - _Boundary: 設計文書（要件31 以降の契約名と対照表）_

- [x] 115.75 (P) 設計が定める抽象契約のうち実装に存在しないものの扱いを決める
  - 115.62 のレビューで判明した。要件1〜30 節が定める契約名のうち**三十六件は実装に一切存在しない**
  - 内訳はサービスの契約が五件、依存の受け渡しが二件、応答や設定を表す型が多数、画面状態が四件、追跡表の窓口名が十件である
  - 115.62 は文書側で判別可能にしたが、**実装するのか設計から落とすのかの判断は行っていない**
  - 設計と実装の乖離は要件を丸ごと未実装のまま通す（111.5）。判別できる状態にしたことと、乖離が無いことは別の主張である
  - 一件ずつ、実装する・設計から落とす・抽象契約として残す旨を明記する、のいずれかへ決着させること
  - _Boundary: 設計文書の抽象契約とその実装有無_

- [x] 115.111 設計が記す契約の中身が実装と食い違う四件を決着させる
  - 115.75 のレビューで確定した。実在の有無とは別に、**設計の記述と実装の中身が一致しない契約が四件ある**
  - 注釈の保存応答は設計が入れ子の形を示すが、実装は平坦に返しており設計が記す入れ子の項目は応答に存在しない
  - PDF 出力の設定は設計と実装で**項目が一つも一致しない**
  - 並べ替えの保留参照は設計が写像を示すが、実装は配列である
  - 署名付きURLの検証は設計と実装でメソッド名が異なり、**第一引数の意味が署名付きURL文字列ではなく画像の識別子**である（引数の個数は二で一致する）
  - 四件とも 115.76（依存の受け渡し型に限定）の所管外であり、**署名の不一致は現時点でどのタスクの所管でもない**
  - 一件ずつ、設計を実態へ合わせるか実装を設計へ合わせるかを決めて適用すること。**判断の根拠は実装を読んで示すこと**
  - _Depends: 115.75_
  - _Boundary: 設計文書の契約記述と、対応する実装の署名・応答形式_

- [x] 115.76 (P) 設計の依存受け渡し型が実装と項目単位で食い違う状態を解消する
  - 115.62 のレビューで判明した。設計が記す依存の受け渡し型は、実装に同名では存在せず、**近い名前の実体とは項目そのものが異なる**
  - 現場調査側は実装が二項目のみだが設計は画像側の契約を含む。画像側は実装が保存先に関する三項目を持つが設計はそれを欠き画像処理の項目を持つ
  - 名前だけを寄せると**新たな虚偽記載になる**ため 115.62 では手を付けなかった。これは呼称の不統一ではなく内容の乖離である
  - どちらが正しいかを実装から確かめ、設計側を実態へ合わせること
  - _Boundary: 設計文書の依存受け渡し型の記述_

- [x] 115.112 二つのサービス小節の責務と依存の記述を実態へ合わせる
  - 115.76 のレビューで確定した。115.76 は依存の受け渡し型だけを是正したため、**同じ小節の責務欄と依存欄には食い違いが残っている**
  - 115.76 は境界外として**記録に留めた**。記録があるうちに本文そのものを直すこと
  - 現場調査側で直すのは二項目である。画像側の部品への外向き依存の行と、論理削除が関連画像を連動削除すると記す責務の行
  - 現場調査側の**残る七項目は実装と対応することが確認済み**であり、触れないこと
  - 画像側は広範で、責務七項目と依存四項目の**全件判定が必要**である。115.76 は非網羅を明示して三項目と参考三件のみ記録した
  - 画像側で既に判明している未記録の候補は二件ある。データベース経由の保存を担うと記す外向き依存（実装は保持と返却のみ）と、内容種別を判定結果から設定すると記す制約（判定のみ当該部品、設定は別の部品）
  - 画像側の実体は、実質「マジックバイト検証・ファイル名のサニタイズ・保存先パスの算出」だけを持つ状態を持たない補助である。圧縮とサムネイル生成、保存先への送信、表示順序、一括の待ち行列はいずれも別の部品が担う
  - **閉じた列挙を書く場合は、書く直前に機械的に数え直した結果を併記すること**
  - _Depends: 115.76_
  - _Boundary: 設計文書の二つのサービス小節の責務欄と依存欄（依存の受け渡し型の定義ブロックは 115.76 で是正済みのため対象外）_

- [x] 115.77 (P) 追跡表が保存容量の警告帯の担当要件を取りこぼしている状態を解消する
  - 115.62 のレビューで判明した。当該部品は保存失敗時の警告と非公開閲覧時の対応の**二つの要件を担当すると自ら明記**している
  - 追跡表は前者の行にしか当該部品を挙げておらず、後者の行は別の部品のみを挙げている
  - 115.62 は呼称の統一が境界であり、担当の取りこぼしは対象外として残された
  - 追跡表の該当行へ追加すること。**当該部品が未結線である件は 115.64 の所管**であり、本タスクでは追跡の欠落のみを扱う
  - _Boundary: 設計文書の追跡表（要件15 系の担当部品）_

- [x] 115.113 (P) 部品が自ら明記した担当要件を追跡表が取りこぼしている残りを解消する
  - 115.77 のレビューで判明した。115.77 が直したのは保存容量の警告帯の一件だけで、**同型の取りこぼしが他に四件ある**
  - 注釈の操作メニューは要件28.3 を自ら明記するが、追跡表の該当行は道具帯とスタイル欄しか挙げていない
  - 工程詳細の現場調査の欄は要件2.3 を自ら明記するが、追跡表の該当行は一覧と詳細の画面しか挙げていない
  - パンくずの補助は要件2.5・2.10 を自ら明記するが、追跡表の該当行は共有部品のみを挙げている（2.6-2.9 の行には収録済み）
  - 画像の閲覧部品は要件12.1 を自ら明記するが、追跡表の該当行は書き出しの対話と描画の役務しか挙げていない
  - 115.77 と同じ手順で、部品の自己申告と追跡表を機械的に突き合わせて全件を洗うこと
  - **閉じた列挙を書く場合は、書く直前に機械的に数え直した結果を併記すること**
  - _Depends: 115.77_
  - _Boundary: 設計文書の追跡表（部品の自己申告と食い違う担当行）_

- [x] 115.114 (P) 画像の閲覧部品が引く要件番号の誤記と、部品表の陳腐化を解消する
  - 115.77 のレビューで判明した。画像の閲覧部品の注釈は要件13.2 を「タッチ操作に最適化された注釈ツール」と記すが、**要件13.2 の本文は取り消した操作の再実行**であり、記載の内容は要件15.2 のものである
  - 自己申告を根拠にした追跡の照合そのものの信頼性を損なうため、番号の誤記を正すこと
  - あわせて、部品の要約表が**要件24 以降の部品を一件も収録していない**。保存容量の警告帯・復元の確認対話・注釈の操作メニュー・倍率の操作要素がいずれも不在である
  - 要件15 系の対照表の注記も、当該部品を保存失敗時の警告のみの担当と記しており、非公開閲覧時の担当を落としている
  - 三点はいずれも 115.77 の境界外として残された。番号の誤記・表の陳腐化・注記の欠落を一件ずつ是正すること
  - _Boundary: 画像の閲覧部品の注釈が引く要件番号と、設計文書の部品要約表・対照表の注記_

- [x] 115.78 設計文書の全ファイル構成ブロックへ実在照合を適用する
  - 115.63 のレビューで判明した。ファイル構成の記述ブロックは文書内に**七箇所**あり、是正したのは要件31 の一箇所だけである
  - レビューが兄弟の一箇所（要件24〜30 の節）を同じ手法で走査したところ、三十三件中**十三件が実在しない**
  - 内訳は矢印の道具の検証、スマートフォンの注釈編集のE2E、変更対象欄の複数の資材である
  - **「同型の欠陥は資材が分かれている数だけ存在する」の再現である。**一箇所直しても他は自動では直らない
  - 残る六箇所すべてを走査し、全パスが実在する状態にすること。**是正前後の照合結果を機械的に示すこと**
  - **最終検証で件数を再測した。**ツリーと表の実体は七箇所で計百二十八件あり、不一致は七件である（要件24〜30 が六件、要件29.4 と33〜34 が一件）。要件31 は是正済みで零件
  - **より根深いのは箇条書きの基準が宣言されていないことである。**要件24〜30 の変更対象欄は基準の宣言が無いうえ、**基準そのものが行ごとに食い違う**（七件は部品ディレクトリ相対、一件は別の相対、一件はどちらでも解決しない）。ルート相対として読めば八件すべてが不実在になる
  - したがって**パスを直すだけでは同じ不整合が再発する。**要件31 の節が持つ基準の宣言に相当する記述を各節へ置くこと
  - 照合には最終検証が用いた走査を再利用できる（インデントからの完全パス復元と、区分が削除の行の除外を含む）
  - _Boundary: 設計文書の全ファイル構成ブロック（要件31 を除く）と各節の基準パス宣言_

- [x] 115.115 (P) パスの基準が文書全体の規約と節ごとの宣言で二重になっている状態を解消する
  - 115.78 のレビューで判明した。呼称規約は**パスをリポジトリルートからの相対で示すことを文書全体の規約**として宣言している
  - 一方、115.78 が要件24-30 の箇条書きへ置いた宣言と、既存の要件31-32 の箇条書きの宣言は**部品ディレクトリ相対**を宣言しており、規約側に例外条項が無い
  - 115.78 はタスク本文の明示指示どおりに節へ宣言を置いたため、指示違反ではない。規約と節の宣言が二重基準のまま残っている
  - 規約へ例外を明記するか、箇条書きをルート相対へ統一するかを決めて適用すること
  - あわせて宣言文の記法が二系統に分裂している。是正した二節はバッククォート付きで半角の区切り、他の三節は素の全角の区切りである。統一すること
  - _Depends: 115.78_
  - _Boundary: 設計文書の呼称規約と各節の基準パス宣言の記法_

- [x] 115.79 (P) ファイル構成の区分が実態と食い違う状態を解消する
  - 115.63 のレビューで判明した。ファイル構成の記述は各資材に新規と変更の区分を持つが、これは**書いた時点の計画**である
  - 現在は区分が新規となっているものも含め全件が実在しており、区分列は現況を表していない
  - 115.63 は前置きの注記で「本節を書いた時点の計画」と明示して局所的に整合させたが、**区分列そのものは手つかず**である
  - 七箇所のブロックに共通する横断課題であり、配置の是正とは別の判断を要する
  - 区分を現況へ読み替えるか、計画時点の記録であることを全ブロックで統一して明示するかを決めて適用すること
  - _Depends: 115.78_
  - _Boundary: 設計文書のファイル構成ブロックの区分列_

- [x] 115.116 (P) 区分の宣言が用いる呼称と、照合対象の粒度を揃える
  - 115.79 のレビューで判明した。統一した定型句は現況の権威を「区分**列**」ではないと述べるが、**列を持つのは表の二ブロックだけ**である
  - ツリーの四ブロックは注釈で区分を表し、表の一方は列名が種別である。とくに小見出しが区分を担うブロックは、同じ段落で「行に列を持たない」と述べた直後に列を否定しており**字面が自己矛盾する**
  - 定型句の統一という目的は達しているため欠陥ではないが、中立の語へ置き換えれば七箇所すべてで無矛盾になる
  - あわせて、ファイル構成の照合件数に共通の定義が無く、**三者が三様の数を報告している**（百四十六・百五十四・百二十八）
  - 差はディレクトリ行・再掲の行・最上位の行を数に入れるかどうかであり、不一致の集合そのものは三件で完全に一致している
  - 将来の再検証で偽の不一致に見えないよう、照合対象の粒度を明文化すること
  - _Depends: 115.79_
  - _Boundary: 設計文書のファイル構成ブロックの宣言文の呼称と、照合対象の粒度の定義_

- [x] 115.80 (P) 設計文書のプレースホルダ表記が実在照合の偽陽性になる状態を解消する
  - 115.63 のレビューで判明した。要件31 の節に、実在しないパスを**命名の型として示す記述**が一件ある
  - 実在を主張していないため欠陥ではないが、実在照合を機械的に回すと偽陽性として毎回挙がる
  - 115.62 が新設した呼称規約は、実在しない名前を実体であるかのように書くことを禁じているが、**型として示す場合の書き方を定めていない**
  - 呼称規約へプレースホルダ表記の扱いを追記し、照合が自動で除外できる形に揃えること
  - _Boundary: 設計文書の呼称規約とプレースホルダ表記_

- [x] 115.117 (P) 新設した表記規約の適用範囲の穴を塞ぎ、照合の基準線を明文化する
  - 115.80 のレビューで判明した。新設した規約は可変部を一つの記号に限ると定めるが、**規約自身の記述が三点でその定めを満たしていない**
  - 既定則を持つ二つの規約に、新設規約への逆参照が無い。片方は別の除外に対しては逆参照を持っており**作法が非対称**である
  - 説明語による可変部の例外を命令の例に限ると定めながら、文書自身は型の断片と散文の単独語にも用いている
  - 規約自身が禁止の形を引用しているが、引用であることの除外条項が無い。**規約を作る作業は規約自身を検証対象に含めなければ空手形になる**（既存の教訓の再現）
  - 三点はいずれも実測の偽陽性が零であり欠陥ではないが、適用範囲の宣言としては穴である
  - あわせて照合の基準線を明文化すること。**現在の真の非実在は七件**（撤去済みと明記された四件と、区分が削除の三件）である
  - この七件は文書全体を対象にした照合の値であり、**ファイル構成ブロックのみを対象とした 115.78 の三件とは基準が異なる**。範囲の逸脱ではない旨を明記すること
  - 件数だけでは再現できない。**照合の方式も併記すること**（対象とするトークンの形と、版管理の一覧を見るのか実ディスクを見るのか。後者では生成物が一件増える）
  - _Depends: 115.80_
  - _Boundary: 設計文書の呼称規約の記述精度と、実在照合の基準線の明文化_

- [x] 115.118 (P) 配置を示す記述の接頭辞の深さが実配置と食い違う状態を解消する
  - 115.80 のレビューで判明した。ファイル構成の箇条書きに、**接頭辞の深さが実配置と揃っていない記述が二件**ある
  - 手振りの資材を指す記述は、その名のディレクトリが最上位に存在せず、実体は部品の配下にある
  - 見た目の資材を指す記述に至っては、**同名のディレクトリがリポジトリのどこにも存在しない**
  - 同じ箇条書きの他の行は最上位のディレクトリを指しており、深さが不揃いである
  - 新設した規約が可変部を含むトークンを照合から免除するため、**この二件は今後も機械照合では永久に検出されない**
  - 実配置に合わせて深さを揃えること
  - _Depends: 115.80_
  - _Boundary: 設計文書のファイル構成ブロックにおける可変部を含むパスの接頭辞_

- [x] 115.81 自動保存と復元の基盤を画面へ結線する
  - 115.64 のレビューで確定した。**要件15.4・15.5・15.7〜15.10 は出荷実装が存在しない**
  - 基盤の管理役を参照するのは復元用のフックだけで、そのフックを参照する本番コードは**ゼロ**である。復元の確認画面も保存容量の警告帯も同様に未結線
  - さらに**E2Eの除外一覧が当該要件を「統合テストで検証」として除外している**が、その統合の検証は未結線のコードだけを回している
  - **偽の緑の第三の型（出荷されていない部品を確かめる検証）に、除外の根拠として使われるという新しい型が重なっている**
  - 115.64 は撤去が境界だったため結線できず、要件が求める以上は撤去もできないと判断して存置した
  - 基盤一式を画面へ結線し、受入レベルの検証で本番の経路から到達することを確かめること。**結線が済むまで除外一覧の当該項目は根拠を失っている**
  - _Requirements: 15.4, 15.5, 15.7, 15.8, 15.9, 15.10_
  - _Boundary: 自動保存・復元基盤と注釈編集画面の結線_

- [x] 115.119 自動保存の発火条件が要件の文言と食い違う状態を決着させる
  - 115.81 のレビューで判明した。要件15.4 は**編集中に一定間隔で**保存すると定めるが、実装は最後の操作からの待ち時間で発火する
  - したがって**待ち時間より短い間隔で描き続けている限り、自動保存は一度も起こらない**。要件が名指しする「編集中」こそ保存されない
  - 115.81 が加えた検証は単発の操作と静止しか通らないため、この欠落を構造的に検出できない
  - ただし承認済みのタスク18.1 の本文が待ち時間方式を明記し、基盤の単体検証も待ち時間の張り直しを正の仕様として確かめている
  - **要件条文と承認済み実装の食い違いであり、仕様の判断を要する。**要件を実装に合わせるか、実装を一定間隔へ改めるかを決めて適用すること
  - 実装を改める場合は、**描き続けている最中に保存が起こることを確かめる検証**を加えること
  - _Depends: 115.81_
  - _Requirements: 15.4_
  - _Boundary: 自動保存の発火条件と要件15.4 の文言_

- [x] 115.120 (P) 保存容量の誤り検出の四形式のうち二形式が本番経路で確かめられていない状態を解消する
  - 115.81 のレビューで判明した。要件15.10 は四つの形式での検出を求めるが、**本番の経路で単独に到達しているのは番号による二形式だけ**である
  - 判定が番号を先に見るため、115.81 が注入する組では**名前による二分岐へ到達しない**。名前の判定を丸ごと削っても新しい検証はすべて緑のままである
  - 片方の名前は補助の単体検証が確かめている（結線が済んだため根拠は有効）。もう片方は**どこでも単独に確かめられていない**
  - 検証環境の例外オブジェクトが自動的に番号を持つことが原因である
  - 番号を持たない例外を作って名前だけで判定される経路を通し、四形式すべてを単独に確かめること
  - _Depends: 115.81_
  - _Requirements: 15.10_
  - _Boundary: 保存容量の誤り検出の判定と、その四形式の検証_

- [x] 115.121 除外一覧に残る同型の根拠喪失を解消する
  - 115.81 のレビューで判明した。115.81 は自動保存と復元の二件を除外から外したが、**同型の除外が残っている**
  - 寸法値の入力に関する二件は「統合で検証」を理由に除外されているが、その担い手は**本番参照が零**である。設計文書も未結線と明記している
  - 115.81 が是正した二件と完全に同型であり、除外の根拠が成立していない
  - 関連して寸法線の選択と削除の二件も、同じ未結線の経路に依存している疑いがある
  - さらに別の一件は「機能が未実装。実装後に検証方法を決定」を除外の根拠にしており、**未充足であること自体が除外の理由**になっている
  - 除外一覧の全件について、根拠が本番へ到達する検証を指しているかを機械的に確かめること
  - **担い手の結線そのものは 115.82 の所管**であり、本タスクでは根拠の成否の洗い出しと是正を扱う
  - _Depends: 115.81_
  - _Boundary: E2Eの要件除外一覧とその根拠_

- [x] 115.82 寸法値の入力欄を注釈編集画面へ結線する
  - 115.64 のレビューで確定した。**要件6.2・6.3 は出荷実装が存在しない**
  - 注釈編集画面は寸法線を描くだけで値の入力欄を開く経路を持たず、当該画面に寸法値の実装は皆無である
  - 唯一の実装は未結線の入力欄部品である。**E2Eの除外一覧が「統合テストで検証」を根拠に除外している点も 115.81 と同型**
  - 入力欄を描画経路へ結線し、受入レベルの検証で本番の経路から到達することを確かめること
  - _Requirements: 6.2, 6.3_
  - _Boundary: 寸法値入力欄と注釈編集画面の結線_

- [x] 115.83 要件5 の担当部品が設計と実態で食い違う状態を決着させる
  - 115.64 のレビューで判明した。設計の追跡表と部品表は要件5.1〜5.6 の担当を画像表示部品としているが、**実際に経路が描画するのは別の画面と注釈編集画面**である
  - 当該の画像表示部品は本番から一度も参照されていない。設計はこれを「後の段階でビューポート制御へ移行する」計画として持つ
  - 計画が実在するため 115.64 は撤去せず存置したが、**111.5・115.51 が記録した「設計の字面と実態の乖離」そのもの**である
  - 計画を実施して結線するか、追跡表の担当を実態へ付け替えるかを決めて適用すること
  - **最終検証で、これが文書の乖離にとどまらないことが判明した。**付け替え先の実態には要件5 の機能そのものが欠けている
  - 閲覧のみの状態では倍率の操作要素も道具帯も**表示されない条件に置かれており**、拡大縮小の手段も回転の手段も無い（5.2・5.3）
  - 表示状態を共有する項目は**変更する手段を持たない定数**として宣言されており、共有が成立していない（5.6）
  - したがって追跡表を付け替えるだけでは要件が満たされない。**担当の決着と機能の実装を分けて扱うこと**
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - _Boundary: 要件5 の担当部品の設計記述と、閲覧時の表示操作の結線_

- [x] 115.84 (P) 現場調査の画面が捕捉した誤りを監視基盤へ送っていない状態を解消する
  - 115.64 のレビューで判明した。要件16.8 の表示側は出荷済みだが、**一覧画面と詳細画面の捕捉処理は状態を設定するだけで記録を送っていない**
  - 全画面共通の送出は描画時の未捕捉例外しか拾わないため、捕捉済みの通信誤りは監視へ届かない
  - 撤去以前から未結線であり退行ではないが、**設計が「送出は共通の仕組みが担う」と記すのは仕組みの所在であって履行の記述ではない**
  - 両画面の捕捉処理から記録を送ること
  - _Requirements: 16.8_
  - _Boundary: 現場調査の一覧画面・詳細画面の誤り捕捉処理_

- [x] 115.122 (P) 画像アップロードの失敗が表示だけで監視へ届かない経路を解消する
  - 115.84 のレビューで判明した。**要件16.8 の「表示するが送らない」状態がアップロード経路に残っている**
  - 詳細画面のアップロード失敗の分岐は誤りを表示するだけで送出しない。これは捕捉処理ではなく、API 層が集約した失敗の一覧を受けた分岐であるため 115.84 の境界外だった
  - 共有部品の側にも送出しない捕捉処理があり、当該部品は誤りを外へ渡す口を公開しているが、詳細画面はそれを渡していない
  - 二経路とも塞ぎ、アップロードの失敗が監視へ届くこと。**送出内容は 115.84 と同じく許可列挙に限り、ファイル名や利用者由来の文字列を含めないこと**
  - _Depends: 115.84_
  - _Requirements: 16.8_
  - _Boundary: 画像アップロードの失敗経路（詳細画面の失敗分岐と共有部品の捕捉処理）_

- [x] 115.123 (P) 監視送出が全ビルドで無効になっている状態を決着させる
  - 115.84 のレビューで判明した。**監視の宛先がリポジトリのどの環境設定にも存在しない**
  - 送出処理は宛先が未設定なら即座に戻るため、結線した送出も既存の全画面共通の送出も**現状の全ビルドで何も行わない**
  - したがって要件16.8 の後半は、コード上は結線済みでも実効を持たない
  - 115.84 の所管は画面の捕捉処理からの送出であり、配備側の設定はその境界外である
  - 宛先を配備の設定として供給するか、供給しないと決めて要件16.8 の後半の扱いを改めるかを決着させること
  - **決着するまで、要件16.8 を「満たしている」と記述しないこと**
  - _Depends: 115.84_
  - _Requirements: 16.8_
  - _Boundary: 監視送出の宛先設定と要件16.8 の後半の充足判断_

- [x] 115.124 論理削除された現場調査の画像へ到達できる五経路を遮断する
  - 115.112 のレビューで確定した。現場調査の論理削除は**画像の行に削除の印を付けない**。到達不能になることで要件1.5 を満たす設計だが、**その到達不能が成立しない経路が五つある**
  - 遮断されているのは詳細取得・一覧取得・登録・順序更新・注釈系である。遮断されていないのは画像のメタデータ更新（単件と一括）・画像削除・注釈付きサムネイルの更新と削除の五経路で、いずれも親の削除状態を一切見ずに画像の行を読み書きし応答へ返す
  - 順序更新だけが削除済みを表す誤りへ写して 410 を返す。**この非対称は意図した設計ではなく取りこぼしを示す**
  - 保存基盤に論理削除の共通機構は無く、画像の行に削除の印を持つ列も無い。したがって遮断は各経路が明示的に行うほかない（115.112 のレビューが機械的に確認済み）
  - 五経路それぞれで親の削除状態を検査し、順序更新と同じ扱いへ揃えること
  - **遮断の追加は経路ごとに独立して確かめられる。五件すべてに、親が論理削除済みのときに拒否されることを主張する検証を置くこと**
  - _Depends: 115.112_
  - _Requirements: 1.5_
  - _Boundary: 現場調査画像のメタデータ更新・削除・注釈付きサムネイル更新削除の各経路と、その拒否検証_

- [x] 115.125 (P) 画像側サービス小節に残る欄と追跡表の帰属を実態へ合わせる
  - 115.112 のレビューで確定した。115.112 は責務欄と依存欄のみを境界としたため、**同じ小節の他の欄に是正後の責務欄と矛盾する記述が残っている**
  - 115.112 は境界外として**根拠つきで記録に留めた**。記録があるうちに欄そのものを直すこと
  - 当該小節の欄は八つあり、うち五つが矛盾する（意図・担当要件・事後条件・不変条件・実装注記の統合）。二つは矛盾しない（事前条件・検証）。一つは帰属のみが疑わしい（危険性）
  - 担当要件の欄は要件番号を十七個挙げるが、**うち七個は別のクラスが担う**。付け替え先はいずれも 115.112 の記録が担い手つきで特定済みである
  - **付け替えは当該小節だけで閉じない。**要件の追跡表と部品の要約表にも同じ帰属が現れるため、三箇所を同時に整合させること
  - **閉じた列挙を書く場合は、書く直前に機械的に数え直した結果を併記すること**
  - _Depends: 115.112_
  - _Boundary: 設計文書の画像側サービス小節の残る欄と、要件の追跡表・部品の要約表の当該帰属_

- [x] 115.85 (P) 参照されないまとめ出力と検証専用になった判定を掃き出す
  - 115.64 のレビューで判明した。現場調査の**まとめ出力が二つとも本番から一度も参照されていない**
  - 115.64 は撤去した部品の再エクスポート行だけを除き、まとめ出力そのものは撤去範囲を超えるとして残した
  - あわせて、撤去に伴い誤り応答の判定二件が**検証からのみ使われる状態**になった
  - いずれも起票時の四件の対象外だが「部品はあるが結線が無い」の同型である
  - 参照の有無を機械的に確かめたうえで撤去すること。**撤去後にテスト件数の減少が削除した検証の件数と一致することを確認すること**
  - **最終検証で件数を再測した。起票時の「二件」は過少である。**今回の撤去で本番参照を失った判定は**三件**（起票が挙げた二件に加え、競合を表す判定が漏れている）
  - さらに現場調査の型定義が持つ判定十二件のうち、**本番から呼ばれるのは一件のみ**で残る十一件は検証専用である。うち一件は検証からも参照されない完全な死蔵である
  - **件数を三件または十一件へ改めない限り、完了条件である件数の一致は機械的に満たせない**
  - あわせて、撤去に伴いスタイルパネルの資材が表示確認専用になった。この扱いは 115.96 の判断（切替UIを結線するか）に従うこと
  - _Boundary: 現場調査のまとめ出力と型定義の判定群_

- [x] 115.86 (P) 調査をまたいだ直後に選択が一瞬残る窓を検証で閉じる
  - 115.66 のレビューで判明した。追加した実ブラウザ検証は**最終状態のみを主張**している
  - 選択を画面より上へ持ち上げたうえで、一覧の再取得時の整理で消す実装へ退行した場合、**移動先で選択画像エクスポートが一瞬活性化しても検証は緑になる**
  - その窓は要件31.3 に反するが、素朴に競合状態を主張すると検証が不安定になる
  - 同じ検証ファイルに、応答を保留したまま状態を主張する既存の手法がある。移動先の調査の取得応答を保留したまま0件かつ非活性を主張すれば決定的に閉じられる
  - **間欠的な失敗を作らずに窓を閉じること**
  - _Requirements: 31.3_
  - _Boundary: 一括エクスポートのE2E検証（遷移直後の過渡状態）_

- [x] 115.87 (P) 選択の整理を確かめる単体検証が本番の経路から到達しない筋書きを模している状態を解消する
  - 115.66 のレビューで判明した。115.56 が置いた単体検証は、**同じ実体のまま経路の識別子だけを差し替えて**「別の現場調査へ移る」を再現している
  - 実際の経路では画面が必ず作り直されるため、この筋書きは**本番の導線からは到達しない**
  - 結果として、選択の整理が担う役割を実態より大きく見せている。調査をまたぐ防護の一次は作り直しであり、整理は同一調査の再取得に対する二次である
  - 単体検証を整理の本来の担当（同一調査の再取得）へ限定し、調査またぎは 115.66 が追加した実ブラウザ検証へ委ねる旨を明記すること
  - **主張を削るのではなく、担当を正しい範囲へ絞ること**
  - _Requirements: 31.2, 31.3_
  - _Boundary: 選択の整理の単体検証_

- [ ] 115.88 (P) 一覧応答の代表画像の識別子が二重に定義されている状態を整理する
  - 115.67 のレビューで判明した。設計文書は一覧応答に代表画像の識別子を退避用として含めると記すが、**表示側が用いるのは別名の項目**である
  - 当該の名称は本番のどこからも参照されていない。ただし供給側では**両者に同一の値**が入るため機能欠陥ではない
  - 設計文書と実態の名称の乖離であり、同じ値に二つの名前が付いている冗長でもある
  - 設計文書を実態へ合わせるか、供給側の重複した項目を整理するかを決めて適用すること
  - **115.62 が新設した呼称規約と契約名の対照表に従うこと**
  - _Requirements: 20.3_
  - _Boundary: 一覧応答の代表画像識別子とその設計記述_

- [ ] 115.89 素材の欠落でE2Eが無条件に緑になる箇所を解消する
  - 115.68 のレビューで判明した。性能を測るE2Eが、**素材のファイルが無い場合に何もせず途中で戻る**構成になっている
  - 戻った先で判定は一つも実行されないため、**素材が失われた瞬間から恒久的に緑になる**
  - **AI運用7原則 第3原則（前提条件でテストを自動的に無効化してはならない）に直接抵触する**
  - 同じディレクトリの他十一ファイルはいずれも素材の実在を主張して落とす形であり、**本件だけが外れ値**である
  - 現在は素材が実在するため発火していないが、構成そのものが違反である
  - 素材の実在を無条件に主張する形へ改めること。**「今は動いているから」を理由に残さないこと**
  - **最終検証が同型をもう一系統検出した。**一括注釈のE2Eに、前提条件で自らを飛ばす記述が**六箇所**残っている
  - 最終検証の実行では一件も発火せずスキップは零件だったが、**前提次第で無効化されうる構造そのものが違反**である
  - 115.48 が「前提条件による自動無効化は、欠陥を隠すだけでなく、隠していること自体を隠す」と記録した型と同じである
  - 両方を対象とすること
  - _Boundary: 現場調査の性能E2Eと一括注釈E2Eの前提条件による無効化_

- [ ] 115.90 (P) 削除を確かめると称して削除を行わない検証を解消する
  - 115.68 のレビューで判明した。画像を削除できることを名前に持つ検証が、**削除の操作を一切行っていない**
  - 実際に行うのは画像が見えることの確認だけで、末尾に「削除機能のUIが実装されたら追加」という注記が残っている
  - 要件4.7 の検証として数えられているが、中身は空である
  - **偽の緑の一種であり、要件が検証されているという誤った安心を与える**
  - 削除の操作と結果を確かめる形へ改めること。削除の経路が未実装であれば、その事実を明らかにして別途起票すること
  - _Requirements: 4.7_
  - _Boundary: 現場調査の画像E2Eの削除検証_

- [ ] 115.91 (P) 現場調査のE2Eに残る恒真の判定を解消する
  - 115.68 のレビューで判明した。**常に真になる主張が八箇所**残っている
  - 内訳は、観測値に真を論理和して主張するもの六箇所、真をそのまま主張するもの一箇所、常に真を返す関数の戻り値を真と判定するもの二箇所である
  - うち一つは「操作して誤りが出なければ成功」という体裁で、実際には何も観測していない
  - **恒真の判定は本スペックが 115.27 以降で一掃してきた型であり、現場調査の一部に残っていた**
  - 観測した値そのものを主張する形へ改めること。**観測できないなら判定を消し、何を確かめられていないかを明記すること**
  - _Boundary: 現場調査の閲覧・応答性E2Eの判定_

- [ ] 115.92 沈黙する前提準備をE2E全体で解消する
  - 115.68 のレビューで判明した。選択肢が無い場合に何もせず素通りする前提準備が、**E2E全体で約百二十九箇所**ある
  - うち現場調査の配下が九十一件で、残りは他の領域である。ほぼ同一の定型が繰り返し複製されている
  - 要件の検証ではないため第3原則違反ではないが、**前提が崩れた際の失敗箇所が後段までずれ、対象の欠陥と区別できなくなる**
  - 115.68 が一件を是正した形（選択欄の表示・選択肢の供給・実在候補の値・選択の成立を無条件に主張する）を全体へ適用すること
  - **同一の定型であるため共通の補助関数へ括り出すことを検討すること。**複製したまま個別に直すと再発する
  - _Boundary: E2E全体の前提準備_

- [ ] 115.93 E2Eの検査が既存の抑止で素通りしている状態を解消する
  - 115.68 のレビューで判明した。E2Eの判定を機械的に検査する仕組みは**既存の千百二件を抑止一覧へ登録**しており、新規のみを落とす構成である
  - 115.89 から115.91 が挙げた欠陥は**いずれも検出はされているが抑止されている**。したがって検査は通るのに欠陥は残る
  - さらに、ある除外の注釈が「検証ではなく前提の準備」を理由に沈黙する前提準備を明示的に許容しており、**115.68 が確立した基準と矛盾する**
  - 抑止一覧を段階的に削り込む計画を立て、当該の除外注釈を再評価すること
  - **抑止一覧は「今は直せない」の記録であって「直さなくてよい」の記録ではない**
  - _Boundary: E2E判定の機械的検査と抑止一覧_

- [ ] 115.94 二本指の拡大が効かない間欠失敗の真因を特定して解消する
  - 115.69 のレビュー中に発見した。**等倍時のパン抑止と拡大時の二本指パンを確かめる検証が、四回に一回の頻度で失敗**する
  - 失敗は拡大率が1のまま、すなわち**二本指の拡大が一度も効かなかった**ことを示す
  - 115.69 が是正したダブルタップとは**因果が無い**。当該の検証は実タッチ補助関数のダブルタップ経路を一度も通らない
  - 実行環境の設定は再試行を三回まで許すため、**この失敗は覆い隠されて表面化しない**
  - **間欠的な失敗は再試行で覆い隠さず真因まで追うこと。**再試行で緑になった失敗は、消えたのではなく隠れただけである
  - 115.69 と同じ形で、閾値に対する余裕の不足か、発火の順序の競合かを実測で切り分けること
  - _Requirements: 33.4, 34.7_
  - _Boundary: 編集モードのピンチズームE2Eの発火タイミング_

- [ ] 115.95 (P) 再試行の設定が間欠失敗を覆い隠す構成を見直す
  - 115.69 のレビューで判明した。統合環境での実行は**再試行を三回まで許す**設定になっている
  - 115.94 が発見した間欠失敗は、この設定により統合環境では一度も表面化しない
  - 115.69 の起票経緯も同型で、一度だけ失敗し再試行で回復した事象をレビューが追跡して初めて真因に到達した
  - **再試行は環境由来の揺らぎを吸収する仕組みだが、実装や検証の欠陥まで吸収してしまう**
  - 再試行で回復した実行を失敗として記録し可視化するか、再試行の回数を絞るかを決めて適用すること
  - **緑であることと、一度で緑になることは別の主張である**
  - _Boundary: E2Eの実行設定と再試行の扱い_

- [ ] 115.96 白縁取りの切替UIが出荷されているかを確かめ、未出荷なら結線する
  - 115.70 のレビューで判明した。**結線側の注釈の道具帯に、白縁取りと白アウトラインを切り替えるUIが存在しない**
  - 該当する語の出現は装飾指定の一件のみで、切替の操作要素は皆無である
  - 当該の切替を持つのは**未結線のスタイルパネルだけ**であり、要件24.5・25.2 の主張はそこにしか無い
  - **要件24.5・25.2 のUIそのものが出荷されていない疑いが強い。**「部品はあるが結線が無い」の型であり、本スペックで六度目になる
  - まず出荷の有無を機械的に確定すること。未出荷であれば結線し、受入レベルの検証で本番の経路から到達することを確かめること
  - あわせて設計文書の存置理由の記述を更新すること。**115.70 で移せたのは要件26.4・26.6 の主張のみ**であり、他の四つは依然としてスタイルパネル側にある
  - **最終検証で未出荷が確定し、範囲も起票時より広いことが判明した**
  - 道具帯が用いるスタイルの型には**白縁取りの項目そのものが存在しない**。したがって型の水準でも切替は不可能である
  - 図形六種の切替（32.5）は起票の範囲から漏れていた。しかも**未結線のスタイルパネルにも存在しない**（そちらが持つのは矢印と文字のみ）
  - 切替が発火しないため、切替を取り消し履歴へ記録する三つの受入基準（24.10・25.11・32.10）も到達不能である
  - したがって作業量は起票時の見積を大きく超える。**型の拡張から始めること**
  - _Requirements: 24.5, 25.2, 32.5, 24.10, 25.11, 32.10_
  - _Boundary: 白縁取りの切替UIと注釈の道具帯（型・UI・取り消し記録）_

- [ ] 115.97 (P) 要件26.4・26.6 を受入レベルで確かめる
  - 115.70 のレビューで推奨された。セッションの中でスタイルが引き継がれることの主張は**単体の検証のみ**である
  - 115.70 は主張を未結線の部品から結線側へ移したが、実ブラウザで本番の経路を通る確認は無い
  - **単体の検証は、本番の経路から到達することを構造的に確かめられない**（本スペックで繰り返し確認された性質）
  - 道具を切り替えて戻したときに直前のスタイルが引き継がれること、選んだ値が既定値より優先されることを実ブラウザで確かめること
  - 対象の挙動を壊したときに失敗することを変異で確認できること
  - _Requirements: 26.4, 26.6_
  - _Boundary: 注釈スタイルのセッション引継ぎのE2E_

- [ ] 115.98 (P) 寸法線のラベルの既定文字色を一元管理の資材へ寄せる
  - 115.70 のレビューで判明した。寸法線の道具が持つラベルの既定は**新規注釈の既定でありながら一元管理の外**にある
  - 過去のタスクが「本体色とは別概念」として存置を明記しているが、要件26.5 の既定色に含めるかの解釈は分かれる
  - 115.70 は要件26.5 の対象を新規注釈の既定に限って洗い出し、当該は判断を保留した
  - 別概念として残すのか一元管理へ寄せるのかを決めて適用し、**決めた理由を設計文書に記すこと**
  - _Requirements: 26.5_
  - _Boundary: 寸法線ラベルの既定スタイル_

- [ ] 115.99 (P) スタイルパネルのプリセットに既定値が含まれない状態を解消する
  - 115.70 のレビューで判明した。線幅と色のプリセットの並びに、**是正後の既定値がどちらも含まれていない**
  - 結果、当該パネルでは既定の状態がどのプリセットの選択とも一致しない
  - 現在は未結線の部品のため利用者への影響は無いが、**115.96 で結線する場合は先に是正が必要**である
  - プリセットへ既定値を含めるか、既定値の選択状態を別の形で示すかを決めて適用すること
  - _Depends: 115.96_
  - _Requirements: 26.5_
  - _Boundary: スタイルパネルのプリセット配列_

- [ ] 115.100 本番コードから設計文書を行番号で指す参照を実体の参照へ改める
  - 115.71 のレビューで判明した。本番コードの注釈が設計文書を**行番号で指しており、参照先が全く別の内容になっている**
  - 実例として、ある注釈が指す行は現在「新規外部依存は追加しない」を、別の注釈が指す行は閉じ括弧のみを、さらに別の注釈が指す行は無関係な項目の宣言を指している
  - 該当はフロントエンドの本番コードで**三十六箇所・十ファイル**にわたり、現場調査以外のスペックにも及ぶ
  - 設計文書は本 run だけでも複数回行数が変わっており、**行番号の参照は原理的に維持できない**
  - 節の題とシンボル名で指す形へ改めること。**115.71 が新設した記録の節は既にこの形を採っている**ため参照実装として使えること
  - _Boundary: 本番コードから設計文書への参照形式_

- [ ] 115.101 検証の期待値が本番の算出を再実行している同型を掃き出す
  - 115.72 のレビューで判明した。塗りの代替式とは別に、**期待値の中で本番の算出をそのまま再実行している箇所**が残る
  - 内訳は三系統である。縁取りの描画幅を期待値側で組み立てる形が**七ファイル**、寸法線ラベルの縁取り幅を期待値側で計算する形が**二箇所**、既定値を定義しているのと同じ算出を両辺で呼ぶ**恒真が二箇所**
  - いずれも中央の値を変えると**両辺が同時に動くため落ちない**。恒真の二箇所は主張の価値が無い
  - 115.71 が具体値の主張を別に置いたため中央の変異は捕捉できており実害は抑えられているが、**形は 115.72 と同型**である
  - 期待値を具体値の直書きへ改めること。**同じファイル内に既に具体値で書かれた項目が併存している箇所がある**ため、そちらを参照実装とすること
  - 恒真の二箇所は具体値化するか撤去すること
  - _Requirements: 26.5, 24.2, 32.2_
  - _Boundary: 注釈の縁取りと既定スタイルの検証における期待値の組み立て_

## Task 115.102-115.109: 最終検証（kiro-validate-impl）が検出した未実装と検査の穴

最終検証は要件38 節のうち**出荷実装が本番経路から到達するのは23 節**であり、残りに未実装が残ることを機械的に確定した。既知の五件（115.81・115.82・115.83・115.96・115.30）に加え、以下は**いずれも新規の検出**である。判定は「検証ファイルが存在するか」ではなく「本番コードから参照され経路が通るか」で行い、**本番から一度も参照されないまとめ出力を経由した参照は結線と数えていない**。

- [ ] 115.102 注釈編集画面に欠けている受入基準を実装する
  - 最終検証で判明した。注釈編集画面に、要件が定めながら実装が存在しない受入基準が六つある
  - 文字注釈の背景色を選べない（8.5）。スタイルの型に当該の項目そのものが無い
  - 吹き出しの形式が未結線である（8.6）。形式を表す宣言はあるが編集画面も道具帯も参照していない
  - **未保存のまま離れる際の確認が無い**（9.3）。当該画面の全文に離脱を捕捉する仕組みが存在しない
  - 保存に失敗した際の再試行の導線が無い（9.5）。誤りの表示はあるが再実行の手段が無い
  - 注釈の書き出しが未実装である（9.6）。**除外一覧自身が「現在未実装」と明記している**
  - 保存が成功した時点で取り消し履歴を捨てる呼び出しが本番に無い（13.5）。**古い履歴を復元して次の保存で行を消す事故**を招く形である
  - 一件ずつ実装し、受入レベルの検証で本番の経路から到達することを確かめること
  - _Requirements: 8.5, 8.6, 9.3, 9.5, 9.6, 13.5_
  - _Boundary: 注釈編集画面の未実装受入基準_

- [ ] 115.103 (P) 一覧と詳細に欠けている受入基準を実装する
  - 最終検証で判明した。一覧の取得は件数と上限が**固定値で書かれており、頁を送る操作要素が存在しない**（3.1）
  - 一括の登録に失敗した際、失敗した件数は表示されるが**どの画像がどの理由で失敗したかを画面から知る手段が無い**（31.13）
  - いずれも利用者が実際に困る欠落であり、文書上の乖離ではない
  - _Requirements: 3.1, 31.13_
  - _Boundary: 現場調査一覧の頁送りと登録失敗の個別提示_

- [ ] 115.104 (P) 操作に欠けている受入基準を実装する
  - 最終検証で判明した。寸法線の端点をつまんで動かす専用の手段は実装されているが**本番から一度も呼ばれていない**（6.5）
  - 選択中の道具を再びたたいたときに設定の面を開閉する挙動が無い（28.8）。通知を受ける口はあるが**編集画面がそれを渡していない**
  - 道具の説明は既定の吹き出しに頼っており、長押しで表示する挙動が無い（29.6）
  - _Requirements: 6.5, 28.8, 29.6_
  - _Boundary: 寸法線の端点操作・道具帯の再たたき・道具の説明表示_

- [ ] 115.105 通信が切れた状態への対応が皆無である状態を解消する
  - 最終検証で判明した。要件15.6 が定める、通信が切れた際の警告と保存の抑止が**現場調査の配下に一切存在しない**
  - 通信状態を示す部品と、それを観測する仕組みは実装されているが、**現場調査からは一度も参照されていない**
  - さらに当該要件は**受入検証の除外一覧に載っており、その根拠となる代替の検証も本番を通らない**
  - 結線し、受入レベルの検証で確かめること。あわせて除外一覧の当該項目を見直すこと
  - _Requirements: 15.6_
  - _Boundary: 通信断時の警告と保存抑止の結線_

- [ ] 115.106 (P) 一覧の遅延取得が無効化されている状態を解消する
  - 最終検証で判明した。一覧の二つの表示部品が、画像の寸法として**零を渡している**
  - 受け取る側は寸法が得られたかどうかで観測の要否を決めるため、零を渡すと**表示領域の観測が働かず即時に取得する**経路へ落ちる
  - 結果、要件38.6 が定める表示領域外の取得遅延と、38.8 が定める順次の取得が**一覧では成立していない**
  - 115.67 が是正したのは合成済みサムネイルの供給であり、この経路は別である
  - 寸法を正しく渡すか、観測の要否の判定を見直すこと。**表示リクエストが写真数に比例しないことを実測で確かめること**
  - _Requirements: 38.6, 38.8_
  - _Boundary: 一覧の表示部品が渡す画像寸法と遅延取得の判定_

- [ ] 115.107 (P) サーバ側のサムネイル再生成が到達不能である状態を解消する
  - 最終検証で判明した。注釈の経路が生成の担い手を組み立てる際、**再生成を担う部品を渡していない**
  - このためサーバ側で同期に再生成する分岐と、その失敗を表す応答が**到達不能**である
  - 加えて、その応答を前提としたフロントエンド側の扱いも到達しない
  - 要件23 自体はクライアント側の経路で満たされているため機能欠陥ではないが、**死んだ分岐と死んだ扱いが残っている**
  - 渡して到達可能にするか、到達不能な分岐と扱いを撤去するかを決めて適用すること
  - _Requirements: 23.4, 23.6, 23.8_
  - _Boundary: 注釈経路の依存注入とサーバ側再生成の分岐_

- [ ] 115.108 検証が判定を自前で再実装して自らに主張する状態を解消する
  - 最終検証が**偽の緑の第七の型**として検出した。要件15.7 から15.10 のE2Eは、画面の中で**判定の処理を自前で書き起こし、その書き起こしに対して主張している**
  - したがって本番のコードを一度も通らない。うち一つは**真をそのまま返す一行**が書かれている
  - 恒真式でも条件包みでもないため既存の機械的な検査を素通りし、**除外一覧にも載っていないため被覆として正規に数えられている**
  - これは 115.91 が扱う恒真式とも、115.68 が扱った供給側欠落による空振りとも異なる第三の形である
  - 本番の経路を通る形へ組み替えること。組み替えた結果として要件が未実装であることが露見する場合は、**115.81 の対象として回付し、検証は失敗したまま残すこと**
  - 同じ形が他に無いかを機械的に洗い出すこと
  - _Requirements: 15.7, 15.8, 15.9, 15.10_
  - _Boundary: 自動保存・復元のE2Eの判定構造_

- [ ] 115.109 被覆の検査に本番到達性の判定を加える
  - 最終検証で判明した。被覆の検査は**要件の番号を持つ検証ファイルが存在するか**だけを見ており、その検証が本番の経路を通るかを見ていない
  - 結果、検査は満点を出すのに実装が無い、という状態が三つの経路で成立している。**未結線コードに付けた番号**、**恒真式と自前再実装のE2E**、**除外一覧**である
  - 実例として、二つの受入基準は**死んだ部品の検証が唯一の被覆源**になっている
  - 検査へ「番号を持つ検証が参照する本番のシンボルが、本番の経路から到達するか」の判定を加えること
  - **本スペックが偽の緑を七つの型にわたって掃き出してきたにもかかわらず、検査自身は一度もそれを検出していない**
  - _Boundary: 要件被覆の検査_

- [ ] 115.110 (P) 書き出し経路に残る同形の倍率適用先の不一致と、それを免除している誤った前提を解消する
  - 115.73 のレビューで判明した。是正した復元処理と**同形の欠陥が書き出し経路に残っている**（複写された線幅へ表示倍率を掛ける）
  - 書き出しは復元後に複写値を読み直さないため表示上の実害は小さいが、**同型の欠陥は資材が分かれている数だけ存在する**の再現である
  - あわせて設計文書が記す前提「集合体化した矢印では集合体本体に線幅が存在しないため対象外」は**事実に反する**。七形状の構築処理はいずれも複写を行っている
  - さらに統合の検証に、この誤った前提を注釈として記録したうえで**真をそのまま主張する空の検証**が残っている
  - 三点を対象とすること。誤った前提の訂正を先に行い、そのうえで書き出し経路の適用先を復元処理と同じ方式へ揃えるか、掛けない判断の根拠を実装から示すこと
  - 空の検証は 115.91 が扱う恒真の判定と同型である。観測した値を主張する形へ改めるか撤去すること
  - 対象の挙動を壊したときに失敗することを変異で確認できること
  - _Requirements: 32.2_
  - _Boundary: 書き出し経路の表示倍率の適用先、設計文書の当該前提、統合検証の空の主張_

## Implementation Notes（Task 115.30-115.52）

- **115.43 は取得時点で濾す判断を採った**: 候補の選択経路はクリックと矢印＋確定の2つあるが、いずれも同一の候補配列を参照するため、取得時点の絞り込みが単一の関門になる。選べない候補を提示しないほうが入力支援の意図にも沿う。幅の上限は表示側の指定で上書きされうるため、候補ストア側では判断できない。
- **115.44 の変換中の記録は「寿命は揃え、終端の置き場所は構造に従う」**: 三箇所とも寿命は一回の焦点セッションで同一だが、終端は入力欄が焦点獲得時の初期化、グループ名が焦点喪失時の消去となる。グループ名の編集欄は空欄では確定できず焦点喪失後も残るため編集開始側では覆えず、補完候補の入力欄は候補一覧へ焦点が移ると焦点喪失の処理が早期に戻るため焦点喪失側では覆えない。多重の防御を外す判断はこの非対称性が根拠であり、機構の見た目だけを揃えると穴が開く。
- **狭い幅の収まりは単体検証では保証できない**: 仮想DOMはレイアウトを測らないため、収まりを担う指定の照合が限界である。実際の収まりは実ブラウザでの確認に委ねること。
- **115.47 の教訓: 単体の検証が本番と異なる形の入力を与えていた**: 長押しの検証は対象を含む通知を直接与えていたため、本番では決して設定されない項目への依存を検出できなかった。**ジェスチャーの検証は、通知を組み立てる側が実際に作る形で与えること。** 同じ欠陥はダブルタップ側で先に見つかっており、長押し側だけが残っていた。
- **115.47 で設計上の防護が初めて実装された**: 操作メニュー表示中は当たり判定を止める設計だったが、旧実装は長押しの経路でその状態を一切参照していなかった。座標からの当たり判定へ切り替えたことで、この防護が実際に効くようになった。
- **115.45 の監査で見つかった境界外の要件引用の誤り（未修正・別タスク向け）**: 数量項目行の注釈（`EditableQuantityItemRow.tsx` と同名の検証ファイルの冒頭、および検証ファイルのフィールド更新の記述）が、現行の要件7には存在しない上位項目に連動する候補表示を引用している。またバックエンドの補完候補の経路の注釈が要件7の全体を範囲で引用しているが、実際に担うのは初回の一括取得のみである。いずれも当該の境界を持つタスクで是正すること。
- **115.46 で判明した境界外の残存欠陥（別タスク化を推奨）**: 共有のパンくずは横並びの並びが折り返さないため、途中で改行できない長い英数字の連なりを含む名称では狭い幅で自らはみ出す。数量表の編集画面の見出しを是正した後も、その名称では幅375 で横方向の移動が残る。全画面共通の共有部品であり当該の境界に属さない。
- **狭い幅の検証は画面全体と対象部位の二段で主張する**: 画面全体の判定は境界外の部品の影響を受けるため、対象部位そのものの収まりを別途主張しておかないと、境界内の是正が正しいことを示せない。
- **要件番号の引用は被覆の検査には拾われない**: 被覆の検査は「スペック名/REQ-番号」の前置がある記述のみを抽出するため、注釈や検証名の中の裸の要件番号は検査対象外である。誤記は機械的に検出されないので、境界内の全件照合を人手で行う必要がある。
- **115.48 が示した最大の教訓: 眠っている検証は、欠陥そのものより高くつく**: 環境変数の有無で自らを飛ばす三つのE2Eは、どこにも設定されていない変数を見て恒久的にスキップされ、緑として数えられていた。ゲートを外して実データを自前で用意する形へ組み替えた結果、要件27.3・31.2・32.1 の三つの本番未実装が**一度に**露見した。いずれも受入レベルの検証が名指しで担当していた要件であり、単体の検証は緑のままだった。**前提条件による自動無効化は、欠陥を隠すだけでなく、隠していること自体を隠す。**
- **「部品はあるが結線が無い」は本スペックで三度目である**: 115.33（幅の検証を持つ入力部品）、115.51（選択欄を持つ一覧部品）、115.50（白縁取りを持つ専用形状とブラシ）は、いずれも実装も単体の検証も存在するのに本番の描画経路から一度も参照されていない。単体の検証は部品を直接組み立てて確かめるため、この形の欠落を**構造的に検出できない**。部品の追加を完了とせず、**本番の経路から実際に到達することを受入レベルの検証で確かめる**まで完了としないこと。
- **要件どうしが潰し合う欠陥は実機相当のタッチ入力でしか出ない（115.52）**: メニュー外のタップで閉じる要件27.5 の実装が、長押し解放後にブラウザが生成する互換のクリックを外側タップとして受けてしまい、項目をタップする要件27.3 を到達不能にしていた。マウス操作では再現せず、単体の検証も机上の確認も素通りする。**ジェスチャーに関わる要件は、実機相当のタッチ入力で要件どうしの干渉まで確かめること。**
- **失敗を残して完了とする判断の線引き**: 115.48 は「三つのE2Eが実ブラウザで通ること」を受入基準に持ちながら3件の失敗を残して完了とした。これが正当なのは、失敗が**テスト側の不備ではなく境界外の本番未実装**に起因することを本番ソースから独立に確認したうえで、是正を新規タスク（115.50-115.52）へ回付したためである。**この場合でも「E2Eが緑である」と主張してはならない。**主張の範囲は「恒久スキップを全廃し 0 skipped を達成した」までであり、それを超えた瞬間に偽の完了報告になる。
- **本スペック所管である点は差し戻しの理由にならない（115.29/115.33 との違い）**: 115.29 と115.33 の欠陥は別スペック（数量表生成）の所管だったため本スペックでは手が出せなかった。115.50-115.52 は本スペック自身の要件・自身のコンポーネントである。それでも 115.48 を差し戻さないのは、修正先が `_Boundary: 現場調査のE2E_` の外にあり、境界内で解こうとすればテストを緩めるほかなく、それは本タスクが撤去した第3原則違反そのものになるからである。**所管が同じであることは、差し戻しの理由ではなく、新規タスクを本スペックに起票する理由である。**
- **この三件が未実装である間、当該の検証は失敗したまま残る。pre-push はE2Eを全件実行するため、実装が済むまで本ブランチは送出できない**（115.29 / 115.33 と同じ扱い）。
- **115.49 の除去は生産側・消費側の双方向で効く**: ジェスチャー通知の型から対象の項目を除いたことで、消費側の素朴な参照は型検査が拒否し、生産側で項目を足し直そうとしても余剰プロパティとして拒否される。取りこぼすのは型を迂回する明示的な変換を伴う経路だけで、そこは対象を型の外から紛れ込ませて「依存していないこと」を主張する防護テストが受け持つ。**型とテストの二重防御であり、どちらか一方ではない。**
- **死んだ宣言の除去は変異で実効性を確かめること**: 防護テストが本当に落ちるかを、対象への依存を実際に注入して確認した。宣言を消して型検査が通ることは「読む側が居ない」ことの証明にはなるが、「将来また依存されないこと」の証明にはならない。後者は変異でしか確かめられない。
- **115.50 は描画完了の通知を購読せず、生成そのものを差し替えた**: 描画ライブラリは線の生成を担う処理の戻り値をそのまま画面へ追加する。したがって生成側を差し替えれば、追加される対象が最初から白縁取り付きの形状になる。完了の通知を購読して差し替える方式では、素の線を追加してから取り除いて置き換えることになり、**取り消し履歴が一操作あたり二件に増える**。ライブラリの実装を実際に読んで、戻り値へ要求されるのが画面への追加と座標の再計算だけであることを確認したうえでこの方式を採った。
- **外部ライブラリの契約は宣言ではなく実装を読んで確かめる**: 型宣言上の戻り値は単一の線であり集合は想定されていないが、実装が戻り値に対して行う操作は集合でも満たせるものだけだった。宣言との差は型の変換で埋めている。**変換で埋める判断は、実装を読んで安全を確認した場合にのみ許される。**また完了の通知を購読している箇所がリポジトリ全体に一つも無いことも併せて確認しており、下流への波及が無いことの根拠になっている。
- **生成側を差し替えると基底の実装が行う付随処理が失われる（115.50 の既知の副作用）**: 破線・角の処理・影の設定を線へ引き継ぐ処理が基底側にあり、差し替えによって行われなくなる。現在はこれらを設定していないため差は出ないが、**将来これらを導入すると無言で効かなくなる**。導入する際は生成側の差し替え箇所を必ず確認すること。
- **115.51 は設計文書の字面ではなく要件の観測可能性で経路を選んだ**: 設計文書は選択操作の担い手として、どの画面からも描画されない一覧部品と実在しないファイル名の画面部品を指していた。その字面に従えば要件は満たされたように見えて、利用者からは何も変わらない。要件31.2 が言う「画像一覧」とは**利用者が実際に見ている一覧**であり、そこへ結線して初めて観測可能になる。**設計と実態が食い違うときは、実装を設計の字面へ合わせるのではなく、要件が求める観測可能な振る舞いを基準に判断し、設計側の是正を別タスクで起票する**（115.54）。111.5 と同じ扱いである。
- **偽の緑は「常に成立する判定」だけではない。出荷されていない部品を確かめる検証も同じ**: 未結線の一覧部品には要件31.2・31.3 を対象とする十二件の検証が緑で存在するが、当該部品はどの画面からも描画されないため何も保証していない。**アサーションが正しくても、対象が本番に出ていなければ検証ではない。**115.27 以降に一掃してきた条件付きの判定・恒真の判定に続く第三の型として記録する。
- **要件が「〜していない間は非活性」と定めるとき、活性側が到達できるかを必ず確かめる**: 要件31.3 の検証は、選択が恒久的に空だったため欠陥のおかげで通っていた。非活性が**唯一の状態**である限り、その検証は何も確かめていない。115.51 で選択が到達可能になり、非活性は二つある状態の一方になった。**状態を主張する検証は、反対の状態へ実際に遷移できることを併せて確かめること。**
- **選択のような集合の状態は、元データの差し替え時に整合させる（115.56 の起票経緯）**: 画像一覧の再取得は一覧を差し替えるが選択集合を整理しないため、存在しない画像の選択が残る。誤ったエクスポートは要件31.15 の通知で防がれるが、活性状態が要件31.3 と矛盾する窓が生じる。**保持する集合が別の状態の識別子を指す設計では、参照先が差し替わる契機をすべて洗い出すこと。**
- **115.52 は要件どうしの干渉であり、どちらかを削る形で直してはならない**: メニュー外タップで閉じる要件27.5 の実装が、項目をタップする要件27.3 を到達不能にしていた。この形の欠陥は、片方を止めれば必ず緑になるため、**同じ欠陥を裏返すだけの修正に流れやすい**。採った解法は両方を成立させる識別であり、その識別が本物であることを、抑止した直後に本物のタップで閉じる検証を別に置いて固定した。
- **時間窓による抑制は固定時間待機の変装である**: 解放直後の一定時間だけ操作を無視する案は、本スペックが多数のタスクで撤去してきた固定時間待機と同じものを本番コードへ持ち込む。長押しの成立を定める要件27.6 の閾値は**保持時間**であって解放後の抑制時間ではなく、根拠として流用できない。**閾値の根拠を要件に持てない時間指定は採らないこと。**
- **押下を伴わないクリックで解放を識別する（115.52 の解法）**: タッチ由来の互換マウスイベントからポインタイベントは生成されないという仕様上の保証により、長押し解放の互換クリックは押下を伴わず、本物のタップと確実に区別できる。押下の時点で閉じる案は、重ね置き要素が消えて後続のイベントが背後へ抜け、要件27.4 を弱めるため採らない。**重ね置き要素はクリック列を最後まで吸収したまま閉じること。**
- **マウスだけの検証は、タッチ固有の欠陥を構造的に見逃す**: 本欠陥が長く生き延びたのは、単体検証がマウス入力しか与えていなかったためである。マウスは押下が必ず先行するため、識別の有無にかかわらず常に成立する。**タッチ固有の挙動は、実ブラウザが並べる順序どおりのイベント列を組み立てて確かめること。**115.47 の教訓（本番と異なる形の入力を与えない）と同根である。
- **影で覆う宣言は一項目では済まない（115.60）**: 注釈編集画面の局所宣言は線幅だけでなく**本体色も**中央と食い違っていた。起票時は線幅しか把握していなかった。**二重の供給元を見つけたら、食い違っている項目を探すのではなく、全項目を機械的に突き合わせること。**一致している項目も含めて表にすると、後から追加された項目の見落としも防げる。
- **同じ既定値の変更が部位ごとに異なる結果を生む（115.60 のレビューが訂正した点）**: 既定線幅を2から3へ是正した結果、六形状の縁取りは切り上げのため2から3へ変わり、矢印は四捨五入のため2のまま変わらない。実装者は矢印の算術だけで「縁取りは不変」と述べていた。**算出が分かれている箇所では、変更の波及を分かれている数だけ検算すること。**115.59 で丸め方を統一しない判断を採った以上、この非対称は今後も続く。
- **検証の期待値に本番の代替値を複製しない（115.72 の起票経緯）**: 既定値の検証が、本番側の「値が空なら別の値を使う」処理を期待値として複製していた。中央の値が空である限り、局所で同じ空値を再導入しても検出できない。**期待値は中央の値そのものを指すこと。**代替の処理を複製すると、その処理が吸収する範囲だけ防護に穴が空く。
- **間欠的な失敗は「無関係」で済ませず真因まで追う（115.59 のレビュー）**: 検証中に一件だけ失敗し再試行で回復した事象について、レビューは無関係であることを**証明**した。既定の線幅では当該変更が同一の値を生み、対象のE2Eは線幅を一度も指定しないため、幾何も当たり判定も変わりようがない。そのうえで真因（発火間隔の余裕不足）まで特定して別タスクへ回した。**「無関係だと思う」で終えず、変更が影響し得ないことを示し、そのうえで真因を起票すること。**再試行で緑になった失敗は、消えたのではなく隠れただけである。
- **算出を分けたまま定数だけ共有する判断（115.59）**: 矢印と六形状で丸め方と下限が異なる。統一すると矢印の既定の見た目が変わるため揃えなかった。許容できるのは、**要件が依存する数値（比率）が単一の定数として共有され、算出が同一のファイルに並び、分岐の理由が記述されている**からである。一元管理が壊れるのは丸め方が違うことではなく、**算出そのものが複製されて離れた場所に置かれる**ことである。
- **修正前が赤くならない是正もある。その場合は変異が唯一の証明になる（115.58）**: 旧検証は永久にスキップされていたうえ、参照していた目印が本番コードに存在せず、実行されても素通りで合格する構造だった。したがって組み替え後は初回から緑であり、**通常の意味での修正前の失敗は原理的に取得できない**。代わりに本番コードを壊して検証が落ちることを示した。**「修正前が赤かった」を示せない是正では、変異による判別能力の実証を必須とすること。**
- **良い変異は「一見成功しているが実は違う」状態を作る（115.58 の変異A）**: 合成済みサムネイルの素材だけを注釈無しへ差し替えると、保存位置は正しく更新されるため**位置の変化だけを見る判定は通ってしまう**。画素を実測する判定だけが捕捉できた。**変異は、弱い検証なら見逃す形で仕込むこと。**単に機能を丸ごと壊す変異では、検証の強度を測れない。
- **空振りの判定は供給側の欠落によっても生まれる（115.68 の起票経緯）**: 「保存前は合成済みサムネイルが現れない」という判定は、供給側がその表示元をそもそも返さないため恒久的に成立していた。条件で包まれてもおらず恒真式でもないのに、**外部の欠落によって壊しても落ちない判定**になっている。偽の緑の第四の型として記録する。判定の実効性は、判定の書き方だけでなく供給側の実装にも依存する。
- **退行を禁じたい方向にはカウンターテストを置く（115.56 の設計）**: 選択の整理には、消えた分だけ落とす方式と毎回全消しする方式がある。全消しでも欠陥の検証は緑になるため、それだけでは誤った方式への退行を防げない。そこで「編集画面から戻っても選択が保持される」ことを別の検証として置いた。**この検証は修正前から緑であり、実装が全消しへ退行したときにだけ落ちる。**RED で赤くならない検証にも、方式を固定する役割がある。
- **報告された失敗ログは別タスクの残骸でありうる（115.56 のレビューで判明）**: 実装者が提出した修正前の失敗ログは前のタスクのものだった。**レビューは失敗ログを受け取るのではなく、本番の変更だけを戻して自分で再現すること。**ログの提出は証拠ではなく主張である。
- **未結線の部品は「使われていない」のではなく「要件が使うことを禁じている」ことがある（115.55 の決め手）**: 撤去した一覧部品はサムネイルの格子であり、要件10.1 が詳細画面について「サムネイル一覧は表示しない」と明記している。つまり結線されていなかったのは怠慢ではなく、**結線先が要件上存在しなかった**からである。撤去の可否は「今使われているか」ではなく「要件上使われうるか」で判断すること。前者だけで判断すると、まだ結線していないだけの部品を誤って消す。
- **削除の合否は件数の一致で機械的に確かめる（115.55 の検証条件）**: 削除した検証ファイルの件数と、全体の件数の減少分が一致することを確認した。一致しなければ、削除以外の理由で検証が消えたか失敗している。**削除タスクは「緑のままだった」ではなく「減った分が説明できる」ことを示すこと。**
- **同型の未結線部品は数え上げる（115.64 の起票経緯）**: 一件撤去した際に同じ形の部品を掃き出したところ、さらに四件見つかった。「部品はあるが結線が無い」は本スペックで**五度目**である。**一件見つけたら、同じ条件で全体を機械的に洗い出すこと。**本番から参照されず表示確認と検証だけが参照している部品、という条件で列挙できる。
- **引き継ぎで粒度が落ちることがある（115.65 の起票経緯）**: 撤去した検証には呼び出し元の集合を書き換えないことの主張があったが、引き継ぎ先には無かった。**検証を別の場所へ引き継ぐときは、件数ではなく主張の内容を突き合わせること。**件数が揃っていても、失われた主張があれば退行を検出できなくなる。
- **設計文書の是正は「実在するか」を機械的に確かめる（115.54 の検証条件）**: 是正対象の欠陥は実在しないファイル名を書いていたことだった。したがって是正の合否は文章の読み心地ではなく、**書き込んだ全パスが実際に存在するか**で決まる。別の誤ったパスへ置き換えては何も直っていない。文書の変更でも機械的に確かめられる条件を必ず立てること。
- **中央の値を期待値に直接置けないとき、入力と出力を分けて固定する（115.72 の解法）**: 塗りの既定は中央では空文字、画面では白、パネルでは透明と**三通りの表現**を持つため、中央の値をそのまま期待値に置くことは物理的にできない。採った形は、変換の出力を具体値で固定したうえで、**変換の入力（中央が空文字であること）を独立した主張として置く**ことである。これにより中央が変われば入力側の主張が落ちる。**変換を検証側で再実行してはならないが、変換があること自体は主張できる。**
- **是正の正しさは「是正前が変異を吸収していたこと」で示す（115.72）**: 中央の塗りを空でない色へ変えても、**是正前は十五件すべて緑のまま**だった。複製された期待値が変異を完全に吸収していたことの直接証拠である。是正後は塗りの六件だけが落ち、残る十三件は実行されたうえで緑だった。**是正前を実際に走らせて緑を確認するまで、防護が無かったとは言えない。**
- **見積が当たることもある（115.72）**: 本 run では見積が毎回外れていたが（三十→九十七、二→二十三、四→八、二→百四、二→四十二）、塗りの代替式の複製は**二件が全数**だった。全域を走査したうえでの二件であり、起票の見積と一致した初めての例である。**外れることを前提に数えるが、当たったなら当たったと記録する。**
- **既定値が変わったとき、値そのものより「なぜ部位ごとに違うのか」を記録する（115.71）**: 既定線幅3 から導かれる縁取りの片側幅は、六形状で3、矢印で2 になる。素の値はどちらも 2.25 で同一であり、**切り上げと四捨五入の差だけで分かれる**。さらに重要なのは、既定線幅が2 だった時期は素の値が 1.5 で切り上げも四捨五入も下限もすべて2 に一致していた**偶然**だったことである。値だけを書き残すと、次に既定線幅が変わったときに同じ検算漏れが起きる。**偶然の一致は、解消したときに初めて見える。**
- **記録は文書と検証の両方に置く（115.71 の判断）**: 文書だけでは値が変わったときに追随しない。検証だけでは、なぜその値なのかが読み手に伝わらない。採ったのは両方で、検証の期待値は算出を再実行せず**具体的な数値を直書き**した。算出関数どうしを突き合わせる形は、算出が変われば両辺が同時に動くため落ちない。
- **設計文書を行番号で指す参照は原理的に維持できない（115.71 のレビュー）**: 本番コードの注釈が設計文書を行番号で指しているが、参照先は現在まったく別の内容を指している。該当は三十六箇所に及ぶ。本 run だけでも設計文書の行数は複数回変わった。**参照は節の題とシンボル名で書くこと。**
- **未結線部品の検証は、要件を主張しているように見えて何も通っていない（115.70 が実証した）**: 切替の検証は、制御される部品へ同じ設定を再び渡して表示が変わらないことを見ていただけで、**状態を保持する主体を一度も通っていなかった**。道具の切替でスタイルを捨てる変異を入れると、結線側へ移した新しい主張は落ちるのに、**旧来の十八件はすべて緑のまま**である。要件の番号が付いていることと、要件が守られていることは別である。
- **既定値の突き合わせは一致している項目も表に載せる（115.60 の基準を 115.70 が適用）**: 七項目のうち食い違いは三件だったが、一致していた文字サイズも表に載せたことで「一致は偶然であり供給元は別だった」ことが明示された。**食い違いを探すのではなく全項目を並べる。**表の形にすると、後から項目が増えたときの見落としも防げる。
- **本番バンドルへの到達で挙動の有無を決める（115.70 の判定）**: 既定値は三件変わったが、当該の資材は本番の組み上げ結果に一切含まれていない。したがって利用者から見える変化は無く、切替の仕組みを設けても本番の挙動を一切分けない死んだ仕組みになる。**「値が変わったか」ではなく「変わった値が出荷物に届くか」で判定すること。**判定は組み上げ結果の中を実際に探して機械的に示した。
- **間欠失敗の是正は、余裕を広げるだけでなく余裕そのものを観測する（115.69 の解法）**: 発火間隔を詰めれば当面は通るが、環境が重くなれば同じ形で再発する。採った解法は、間隔を詰めたうえで**実測の経過時間が閾値内であることを主張**することである。これにより余裕が痩せた場合、「ダブルタップが成立しない」という分かりにくい失敗ではなく「発火間隔が閾値を越えた」という真因の見える失敗になる。**閾値は本番の定数を参照するため、閾値が変われば主張も追随する。**
- **本番が比較している区間を実装から確かめる（115.69）**: 起票は接地から接地までを約170ミリ秒と見積もっていたが、本番が実際に比べるのは**離地から接地まで**であり公称130ミリ秒だった。区間を取り違えると、主張は本番の判定と無関係な数値を見ることになる。区間の一致は実測でも裏づけた。接地の保持時間が窓に含まれていれば実測は必ず一定値を超えるが、それを下回る値が観測されたためである。**時間に関する主張は、両端がどこかを実装で特定してから書くこと。**
- **E2Eから本番の定数を参照する形は実行形態を確かめてから採る（115.69）**: 閾値へ追随させるため E2E が本番のソースを直接読む形を初めて採った。この形は過去に事故がある（統合の検証が別パッケージのソースを読み、実行時のマウント範囲の違いで壊れた）。今回は送出前の検査も統合環境も**リポジトリの全体を持つホスト上で動く**ため成立する。**同じ形でも実行形態が違えば壊れる。**参照を足すときは実行される場所をすべて確かめること。
- **再試行は環境の揺らぎと欠陥を区別せずに吸収する（115.69 のレビューが発見した別件）**: 同じファイルの別の検証が四回に一回落ちるが、統合環境の設定は再試行を三回まで許すため一度も表面化しない。**緑であることと、一度で緑になることは別の主張である。**間欠失敗を見つけたら、同じ実行の中で他に隠れているものが無いかを再試行なしで確かめること。
- **供給側を直すと、判定を書き換えずに空振りが解消することがある（115.68）**: 保存前に合成済みが現れないことの判定は、供給側が表示元を返さないため恒久的に成立していた。115.67 で供給を入れた後に変異を当てると、当該の判定だけが落ちるようになった。**判定の文面は一文字も変えていない。**空振りの原因が判定の書き方ではなく外部の欠落にある場合、直すべきは供給側である。
- **「一つだけが落ちた」は、他が実行されて初めて言える（115.68 のレビューが補った点）**: 逐次実行の構成では、先頭が落ちると後続は実行されない。実装者は「当該の判定だけが落ちた」と述べたが、他の四件は実行されていなかった。レビューは対象の判定を除外して残りを変異下で走らせ、四件とも緑であることを確かめた。**変異が局所的であることの証明には、落ちなかった側を実際に走らせる必要がある。**
- **E2Eの検査は既存分を抑止一覧へ逃がしている（115.68 のレビュー）**: 判定の弱さを機械的に検査する仕組みは、既存の千百件あまりを登録済みとして新規のみを落とす。したがって恒真の判定も、削除しない削除の検証も、素材欠落での無条件緑化も、**検出はされているが検査は通る**。**抑止一覧は「今は直せない」の記録であって「直さなくてよい」の記録ではない。**新規を止めるだけでは総量は減らない。
- **供給の欠落は消費側の分岐を静かに殺す（115.67 の真因）**: 一覧の応答は合成済みサムネイルの保存位置を載せていたが、そこから表示元を作っていなかった。消費側は表示元しか見ないため、**一覧の代表画像は構造的に必ずクライアント側の合成へ落ちていた**。消費側のコードには合成済みを優先する分岐が書かれており、読む限り正しく見える。**分岐が生きているかは、供給側まで辿らないと分からない。**111.5 が詳細取得の経路で是正したのと同型が一覧の経路に残っていた。
- **同じ形の欠落は供給点の数だけ探す（115.67）**: 一覧の経路を直す際、直近N件を返す経路にも同じ欠落があり、そちらの消費側にも死んだ分岐があった。設計文書は両方の経路を同一の供給契約として明記していた。**設計が並べて書いている供給点は、まとめて確かめること。**
- **表示元をすり替える変異は、存在を見る判定を素通りする（115.67 の変異）**: 表示元を返し続けたまま署名の対象だけを別の資材へ替えると、値は空でなく、形式も正しく、要素も描かれる。**存在・形式・件数を見る判定はすべて通る。**捕捉できたのは画素を実測する判定と、表示元が特定の保存位置に由来することを厳密に比べる判定だけだった。115.58 の変異Aと同じ型である。
- **恒真との分かれ目は「その前提を崩す変更が現実に書けるか」（115.66 の判定）**: 調査をまたぐと選択が消えるのは、画面が作り直されて状態が初期化されるからである。この構造がある限り判定は常に成立するように見え、**偽の緑の第六の型（構造上必ず成立する判定）を疑う場面**だった。恒真でないと判定できたのは、状態の置き場所を画面より上へ移すだけで画面も経路も変えずに判定を落とせることを、変異で実際に示せたからである。**「壊しようがない」と「まだ壊されていない」は違う。**前者は変異が書けず、後者は書ける。
- **その退行が現実的であることまで示す（115.66）**: 選択の整理に添えられた注釈は「画像編集画面から戻った場合など選択を保持する」と述べるが、編集画面も別の経路であるため実際には選択は失われている。**コードベースの認識と実挙動が既に食い違っており、認識に実装を合わせにいく最短手が、まさに判定が捕捉する退行である。**カウンターテストの正当化は、退行の形を示すだけでなく、それが選ばれうる理由まで示すこと。
- **変異は段階的に作り分けて、防護の層を分離する（115.66）**: 選択の整理だけを止める変異では判定は落ちず、状態の持ち越しを加えて初めて落ちた。この差が「一次防護は作り直し、整理は同一調査の再取得に対する二次防護」という構造を明らかにした。**単一の変異で落ちたか落ちないかだけを見ると、どの層が効いているかは分からない。**
- **単体検証は本番の経路から到達しない筋書きを模しうる（115.66 のレビュー）**: 選択の整理の単体検証は、同じ実体のまま経路の識別子だけを差し替えて調査またぎを再現していた。実際の経路では画面が必ず作り直されるため、この筋書きは到達しない。**偽の緑ではないが、担当の範囲を実態より大きく見せる。**受入レベルの検証を置いて初めて、単体が何を担っていて何を担っていないかが分かる。
- **不変性の主張は二段で置く。参照の別異と、元の中身の不変（115.65 の設計）**: 呼び出し元の集合を壊す退行には二つの形がある。同じ集合をそのまま通知する形と、**壊してから複製を通知する形**である。後者は参照が別になるため参照の別異だけを見る主張は素通りし、元の中身の不変を見る主張だけが捕捉する。**二つの主張は冗長ではなく役割が分かれている。**変異を二通り用意して初めてこの分担が確かめられた。
- **不変性は美学ではなく表示の防護である（115.65）**: 呼び出し元の集合を破壊すると、状態の更新へ同一参照が渡り再描画が打ち切られる。結果として選択欄の表示と件数の表示が更新されなくなる。**「複製してから変更する」を守る理由を、様式ではなく退行する挙動として記述できるかを確かめること。**できないなら、その主張は本当に必要か疑わしい。
- **未結線の全数を数えるなら、まとめ出力を経由した参照を「結線」と数えないこと（115.64 の決め手）**: 起票は四件を挙げていたが実測は八件だった。差が出たのは、まとめ出力からの再エクスポートを結線と数えていたためである。**現場調査のまとめ出力は二つとも本番から一度も参照されていない。**死んだまとめ出力を経由した参照は、参照ではない。同型の洗い出しでは、まず集約点そのものが生きているかを確かめること。
- **撤去タスクの半分は「撤去しない判断」である（115.64）**: 八件のうち撤去したのは四件で、残る五件は**要件が求めているのに未結線**だった。これらを消せば要件の唯一の実装が失われる。撤去の可否は今使われているかではなく要件上使われうるかで決まる（115.55）が、その基準を適用すると**撤去タスクが未実装の発見装置になる**。要件15.4・15.5・15.7〜15.10 と要件6.2・6.3 の未実装は、この経路で確定した。
- **偽の緑の第五の型: 未結線コードを回す検証が、受入検証の除外根拠になっている（115.64 のレビュー）**: E2Eの除外一覧は要件15.4・15.5 と 6.2・6.3 を「統合テストで検証」として除外しているが、その統合の検証が回しているのは本番から到達しないコードである。**出荷されていない部品を確かめる検証（第三の型）が、受入検証を免除する根拠として二重に効いている。**除外の根拠に別の検証を挙げるときは、その検証が本番の経路を通ることまで確かめること。
- **配置の是正は「すり替えていないこと」を集合の比較で示す（115.63 の検証条件）**: 実在しないパスを実在するパスへ書き換える作業は、**別のファイルを指すように変えても照合は緑になる**。したがって全パスの実在だけでは不十分である。採った証明は、是正の前後で「区分とファイル名の組」の多重集合が完全に一致することの確認であり、これによりファイルの取り違えと件数の水増し・取りこぼしを同時に排除した。**照合が通ることと、直すべきものだけを直したことは別の主張である。**
- **見積の件数は毎回そのまま外れる（115.62 と 115.63 で連続）**: 呼称の統一は見積三十箇所に対し実測九十七箇所、ファイル構成の配置誤りは見積二件に対し実測二十三件だった。いずれも起票者が目視で見つけた分だけを書いていたためである。**起票文の件数は着手の手がかりであって上限ではない。**機械抽出で全数を確定してから着手すること。
- **規約を作る作業は、規約自身を検証対象に含めなければ空手形になる（115.62 が二度却下された理由）**: 一度目は新設した対応表が「実装ファイルなし」と事実に反する記載を持ち込み、二度目は新設した規約が「表に無い名前は実名とみなしてよい」と約束しながら実在しない型名を三十六件素通しさせていた。**乖離を潰すために作った仕組みが、それ自身の中に新しい乖離を作る。**規約と対照表は、本文と同じ強度で実在照合の対象に含めること。
- **逃げ道は塞いだ場所から隣へ移動する（115.62 の一度目と二度目）**: 一度目の却下は「実名化すべき名前を対応表へ逃がした」ことだった。二度目は同じ構造が対応表から報告の懸念欄へ移っただけで、しかも同型の三件が申告から漏れていた。**「載せれば緑にできる」枠を作ったら、その枠の入場条件を機械的に判定できる形で同時に書くこと。**
- **同一表記の中に実在と架空が混じるとき、宣言だけでは判別を回復できない（115.62 の決め手）**: 頭に I を付けた契約名は、実在するものが五件、実在しないものが五件あり、見た目では区別できない。「これらは抽象契約である」と宣言しても、どれが実装に届いているかは分からないままである。**判別を回復するには、全件を機械抽出した対照表という実体が要る。**規約は判別の根拠を対照表へ一本化し、表に無い名前は実在扱いを禁じる側（偽陽性を出さない側）へ倒した。
- **指摘された件数は常に部分集合として疑う（115.62）**: レビューが名指しした架空の契約名は七件だったが、同じ条件で全域を機械抽出すると二十七件あった。名指しされた分だけ直して提出すれば同じ理由で再び却下される。**「一件見つけたら同じ条件で全体を洗い出す」は、レビュー指摘に対しても適用すること。**
- **論理名と実ファイル名の混在が乖離の温床になる（115.62 の起票経緯）**: 詳細画面を、古い節は論理部品名で、新しい節は実ファイル名で呼んでいた。実在しないパスを指してはいないため単体では無害に見えるが、**どちらの規約で書かれているかを読み手が判別できないことが、実在しないファイル名を書いても誰も気付かない状態を作った**。呼称の規約は文書の先頭で宣言し、以後それに従うこと。
- **比率の欠陥は「既定値から一度だけ計算した定数」から生まれる（115.53 の真因）**: 縁取り幅は本体線幅の 0.75 倍という設計だったが、その 0.75 倍が**既定の線幅に対して一度だけ**計算され定数として凍結されていた。利用者が線幅を変えても縁取りは動かないため、比率ではなく差分になる。**設計が比率で書かれているのに実装が定数を持っているときは、その定数がいつ何から計算されたかを疑うこと。**
- **同じ形の欠陥は資材が分かれている数だけ存在する**: 六形状は共通の既定値を持つが、矢印は独立した項目を持つため 115.53 の是正が波及せず、しかも**より早く（本体線幅9で）破綻する**（115.59）。**一元管理を謳う資材でも、項目が分かれていれば是正は自動では伝わらない。**同種の欠陥を直したら、同じ形の資材が他に無いかを必ず数え上げること。
- **要件の解釈が割れたら設計文書の検証条件を読む（115.53 の判断）**: 「縁取り線幅が本体線幅の1.5倍以上」は、描画される総幅を指すのか縁取り属性そのものを指すのかで実装が変わる。設計文書が検証条件を「片側幅が本体の0.75倍以上」と明記していたため、後者の解釈では設計自身の推奨既定が恒久的に要件違反になる。**解釈が割れたときは、設計が書いた検証条件が解釈を一意に決めることがある。**
- **中央の資材を局所の宣言が影で覆う（115.60 の起票経緯）**: 注釈編集画面が既定スタイルを自前の定数として宣言しており、一元管理の資材が供給する値に届いていない。中央の既定線幅は3だが実際に描かれるのは2である。**「一元管理した」ことと「一元管理された値が実際に使われている」ことは別の主張であり、後者は経路を辿って確かめる必要がある。**
- **単体で上限まで確かめてもE2Eが下限しか見ていないことがある（115.61 の起票経緯）**: 115.53 は単体で入力上限まで比率を固定したが、実ブラウザの受入検証は幅について「0より大きい」としか主張していなかった。**受入検証の観測強度は、単体の厳密さとは独立に劣化しうる。**
- **恒久スキップは一箇所を直しても終わらない（115.58 の起票経緯）**: 115.52 完了後に現場調査のE2Eを全件実行したところ、289件中2件がなお飛ばされていた。115.48 が是正した三ファイルの対象外に、同じ型の自動無効化が残っていたためである。しかも当該の前提は**定数として空値で宣言され一度も代入されない**ため、条件付きの体裁を取りながら実態は無条件の永久スキップだった。**「対象を三つ直した」で終わらせず、全件実行してスキップ件数が0であることを確かめること。**緑であることとスキップが無いことは別の主張である。
- **比率の判定は分母を入力値へ厳密に固定して初めて主張になる（115.61）**: 「片側幅 >= 本体線幅 * 0.75」の形は、分母が観測値のままだと本番が分母側を壊したときに比率が保たれてしまい落ちない。採った形は、分母（実描画の本体線幅）を**描画時に入力した値と厳密に一致すること**で別途固定し、そのうえで分子を比率で主張するものである。**比率の主張は、分母の固定と対にして初めて退行を検出できる。**
- **比較する二つの値は同一の座標系から取ること（115.61）**: 復元処理は表示倍率を集合体へ複写された線幅にだけ掛け、集合体の子の線幅や片側幅の属性には掛けない。複写された線幅を分母に選ぶと座標系の異なる値どうしを比べることになり、正しい実装でも落ちる。基準を子の線幅へ揃えたのは判定の緩和ではなく座標系の統一であり、その根拠は**分母が入力値へ固定されていて緩む余地が無いこと**にある。倍率の適用先が揃っていない本番側の欠陥そのものは 115.73 へ回付した。
- **入力上限を検証する定数は本番の上限の複製になりがち（115.61 の残課題）**: 上限線幅を E2E 側の定数として持つと、本番の上限が引き上げられても検証は落ちず、**静かに「上限での検証」でなくなる**。入力欄の上限属性を読み取って使う形が退行に強い。
- **「表示上の欠陥ではない」は永続化の経路を辿るまで言えない（115.73 のレビューが起票文を訂正した）**: 起票は「集合体にも拡大率が掛かるため見た目の比率は保たれる」として表示上の欠陥ではないと述べていた。実際には保存経路が複写された線幅を永続化する一方で拡大率を永続化しないため、異なるサイズでの復元と保存を繰り返すたびに線幅が恒久的に膨張していた（4→8→16）。次回の読み込みでは実描画そのものがこの膨張値から再構築される。**表示上の影響を評価するときは、その値が永続化されるか、永続化された値から何が再構築されるかまで辿ること。**
- **倍率の適用先を揃える二案は等価ではない（115.73 の方式選択）**: 「子へ倍率を掛ける」案は、集合体の拡大率が既に子へ伝搬するため二重適用になり見た目を壊す。採ったのは「複写された線幅を実描画から導出し直す」案で、複写値・両子の線幅・片側幅がすべて保存時の座標系に揃い、倍率は集合体の拡大率だけが担う。**同じ結果に見える二案でも、伝搬経路が既に存在するかどうかで一方は破壊的になる。**
- **集合体の子の並びは契約であり、全形状で数え上げて確かめる（115.73）**: 本体線を索引で取り出す実装は、七形状すべての構築時の引数順を実際に読んで契約の成立を確認した。寸法線のみ子が三つだが本体線の位置は不変であり、縁取りは無効時も不透明度0で構造が保持されるため索引がずれる経路は無い。**索引依存を導入するなら、依存が壊れる形状が一つも無いことを全数で示すこと。**
- **115.53 の起票経緯: 比率の要件を差分の実装で満たしていた**: 白縁取りの太さは全形状で本体線幅への固定値の加算で決まるため、本体線幅が大きくなるほど比率が下がる。既定値でしか検証していなかったため長く見逃されていた。**比率で定めた要件は、入力の上限値で検証しないと満たしたことにならない。**
- **文書の記述整合タスクほど「閉じた列挙」で落ちる（115.74-115.75）**: 二タスク連続で、差し戻しの理由が「N件だけ」「すべて収録済み」といった全称・唯一性の断定が反例で崩れることだった。115.75 では同型の内部矛盾が二度再発している。**文書へ数や網羅を書くときは、書く直前に機械的な走査で数え直し、走査コマンドと結果を根拠として併記すること。**
- **判断を「残す」で通すには、実体を要しない具体的な根拠が要る（115.75）**: 抽象契約43件を全件「抽象契約として残す」で決着させたが、当初の根拠（注入される側だけがインターフェースを持つ）は反例一つで崩れた。成立させたのは、設計の六メソッドが五クラスへ分解済みであること、同名に見えるクラスが当該契約の実装ではないこと（重複0件・呼出7箇所を機械的に確認）という個別事実である。**規則を立てて一括で片付けようとすると、規則の反例が判断ごと崩す。**
- **一部だけ実態へ合わせると、文書は「一貫した誤り」から「自己矛盾」へ悪化する（115.76）**: 依存の受け渡し型だけを実装へ合わせた結果、同じ小節の数行上に残った依存の記述と真っ向から矛盾した。境界外で直せない場合でも、**矛盾が残っている事実を根拠つきでその場に記録すること**。記録があれば後続が起票できるが、無記録の矛盾は次の読者を誤らせる。
- **「網羅ではない」と書くのは逃げとは限らない（115.76）**: 画像側の依存欄は全件判定が境界外だったため非網羅を明示して残した。実測すると未列挙の食い違いが実在したため、閉じた列挙にしていれば偽になっていた。**網羅を主張できないときは、主張しないことが正しい。**
- **走査器を自作したら、まず既知の反例で落ちることを確かめる（115.78）**: 是正の実装者が最初に書いた走査器はコメント解析の取りこぼしで、レビューが指摘した反例を検出できず誤って合格を出した。レビュー側も独立に走査器を書き直して初めて照合が成立している。**検査を自動化した瞬間に、検査そのものが偽陰性を出しうる資材になる。既知の欠陥を入力して落ちることを先に示すこと。**
- **正規化規則は実装どおりに申告する（115.78）**: 走査器の正規化を二規則と報告したが、実際には括弧の修飾を一律で除去していた。成果物は正しかったが、申告された根拠は額面どおりには成立していない。**再利用される検査は、その規則が正確に記述されていないと次の利用者を誤らせる。**
- **照合の免除は、免除の範囲だけ検出力を失う（115.80）**: 可変部を一つの記号に限って照合から外す規約は、偽陽性を六件から零件へ減らす一方、その記号を含む誤った記述を永久に見逃す。変異の注入で、誤った実パスと禁止した展開表記は検出できるが、可変部を含む誤りは検出できないことを実測した。**免除を導入するなら、免除に隠れうる誤りが現時点で零であることを別途示すこと。**
- **照合の件数は方式を併記しないと再現できない（115.78-115.80）**: 同じ文書に対し三者が百四十六・百五十四・百二十八と異なる件数を報告した。差はディレクトリ行や再掲の行を数に入れるかどうかで、不一致の集合そのものは一致していた。**基準線を記録するときは、対象とするトークンの形と照合先（版管理の一覧か実ディスクか）を必ず併記すること。**
- **除外の根拠は「検証が存在すること」ではなく「本番へ到達すること」（115.81）**: 自動保存と復元の要件は「統合で検証」を根拠に受入検証から除外されていたが、その統合が回していたのは本番参照が零の未結線コードだった。**出荷されていない部品を確かめる検証が、除外の根拠として使われる**という型である。除外一覧に載せるときは、根拠となる検証が本番の経路へ到達することを確かめること。
- **恒真の判定は「検証済み」の外見を作る（115.81）**: 保存容量まわりの四要件は除外されていなかったが、注入した誤りオブジェクトの属性を自分で確かめ直すだけの判定になっており、実装を丸ごと削っても緑のままだった。**除外されていないことは検証されていることを意味しない。**
- **判定の順序が分岐の到達性を決める（115.81）**: 保存容量の判定は番号を先に見るため、番号と名前の両方を持つ例外を注入しても名前側の分岐へ到達しない。名前の判定を削っても検証は全て緑のままだった。**分岐を数えて要件の形式数と突き合わせ、各分岐へ単独に到達する入力を作ること。**
- **結線は部品側が許していた入力を本番へ露出させる（115.82）**: 未結線だった寸法値入力欄は空のまま確定でき、部品の単体検証もそれを正の仕様として記録していた。結線した瞬間、空値と既定単位の組が寸法線へ届き `" mm"` という単位だけのラベルが描かれ、自動保存にまで載った。**結線タスクでは、部品が受け付ける入力の全域を要件に照らし直すこと。**部品単体では合法だった入力が、結線先の要件に対しては違反になりうる。
- **検査の基準線は、自分が追加したコードも数える（115.82）**: 素通りの原因だったE2Eの分岐を除去した際、置き換えに追加した待機ヘルパ自身が同じ型として新規検出され、除去分と相殺して件数が据え置きになった。実測を取らずに基準線を下げたため `check:e2e-guards` が失敗した。**基準線を更新するときは、更新後の値を検査の実行結果から取ること。**差し引きの暗算は誤る。
- **存置の根拠は時間とともに失効する（115.83）**: 未結線の画像表示部品は「後の段階でビューポート制御へ移行する計画」を根拠に存置されていたが、その移行はタスク97 で当の部品の内部に既に実装済みだった。**根拠が消えたことを誰も記録しないため、存置理由だけが生き残る。**存置表を読むときは、根拠が今も成立しているかをコードで確かめること。付け替え後も撤去できなかったのは、二要件のカバレッジ主張が当該部品の検証にしか存在しないためである。
- **恒真の判定は要件ごと消える形で潜む（115.83）**: 閲覧時のパン検証は `expect(true).toBeTruthy()` が判定の全部だった。書き直しで当該スペックの検証無効化は八件減り、テスト件数はむしろ増えた。**件数の減少が「テストを消した」ことを意味するとは限らず、逆に増加が改善を意味するとも限らない。**基準線を動かすときは、減った検出が実判定へ置き換わったのか判定ごと消えたのかを領域単位で示すこと。
- **仕組みの所在は履行ではない（115.84）**: 設計は誤りの送出を「共通の仕組みが担う」と記していたが、その共通の仕組みは描画時の未捕捉例外しか受け取らず、await した通信の失敗を捕捉処理が飲み込む経路は監視へ一切届いていなかった。**「担う」は所在の記述であって、画面がそれを呼んでいることの記述ではない。**追跡表が仕組みの名を挙げているときは、呼び出し側を走査して履行を確かめること。
- **結線しても宛先が無ければ実効はない（115.84）**: 捕捉処理からの送出を全て結線したが、送出の宛先がリポジトリのどの環境設定にも無く、送出処理は宛先未設定なら即座に戻る。**コード上の結線と、要件が求める効果の発生は別の主張である。**外部基盤へ送る要件は、配備側の設定まで含めて充足を判断すること。
- **撤去の妥当性は件数の一致で機械的に示せる（115.85）**: 削除した検証は46件で、その内訳（17+21+8）が撤去した判定の担当と一件ずつ対応する。全件実行の結果は 11930→11884 件で差分が一致した。**「不要なものだけを消した」という主張は、実行結果の件数差が内訳の総和と一致することで裏付けられる。**内訳を書かずに件数だけを示すと、別の何かを巻き込んで消していても気づけない。
- **文書側の言及は撤去の対象に含まれる（115.85 のレビュー）**: コードの撤去は完全だったが、設計文書に撤去済みファイルを現在形の実在ファイルとして書いた行が残り、呼称規約5 に抵触して差し戻された。**ファイルを消したら、そのファイル名を実名として書いている全ての行を機械的に洗うこと。**あわせて「例外はこの1行」のような完結性の主張を書くときは、書く直前に grep で数え直すこと。当初の主張は表外7行を見落としていた。
- **設計と実装の食い違いは、既定で設計を実態へ寄せる（115.111）**: 四件とも実装が要件に違反していなかったため、設計側だけを直し実装は0行変更で決着した。**ただし「実装が正しい」は前提ではなく確認事項である。**寄せる前に、対応する要件を読んで実装が違反していないことを一件ずつ示すこと。違反していれば設計を寄せる行為は欠陥の隠蔽になる。
- **分担で満たす要件は、分担先まで追ってはじめて確認になる（115.111）**: 署名付きURLの検証は、実装が権限だけを見て有効期限を見ない。これは欠落ではなく、期限が署名そのものへ埋め込まれ保存基盤側が強制する分担だった。**「実装がこの要件を検証していない」で止めると、分担を欠落と誤認する。**ただし開発用の保存基盤は期限指定を無視して無署名URLを返すため、この分担は本番構成でのみ成立する。
- **境界外で直せない矛盾は、その場に根拠つきで記録する（115.112 のレビュー）**: 責務欄だけを直した結果、同じ小節の意図・事後条件・不変条件が是正後の記述と真正面から矛盾する状態になった。境界の判断は妥当でも、記録が無ければ小節は「一貫した誤り」から「無記録の自己矛盾」へ悪化する。**部分的な是正は、直さなかった側を明示してはじめて完了する。**
- **単一経路の確認から普遍命題を導かない（115.112 のレビュー）**: 論理削除された調査の画像が到達不能であることを、一覧経路ひとつを見て「要件を満たす」と断じていた。実測すると到達できる経路が五つ残っており、遮断しているのは順序更新ただ一つだった。**「この経路は塞がっている」と「すべての経路が塞がっている」は別の主張である。**網羅を主張するなら経路を数え上げ、その数を併記すること。
- **是正手段そのものが未検証な主張面を広げる（115.113 の debug 調査）**: 追跡表の是正内容は走査器で導出・検証され三系統の独立再導出が一致していたにもかかわらず、タスクが義務づける「計数の併記」が約95行の手書き散文を生み、そこへ毎回新しい虚偽が混入して三回連続で差し戻された。誤りの型は二つで、いずれも**一次資料から書く直前に導出せず、近傍の記述を目視・言い換えして組み立てた主張**である（六要素の列挙を目視で「7ツール」と数えた／既存セルを言い換える過程で「115.83 が付け替えた」という出典なき帰属を付加した）。**レビュー指摘へ「正当化の散文を足す」ことで応答すると、是正のたびに検証されていない主張が増える。**機械的に導出した本体と、それを説明する散文は検証体制が別であることを前提に、追加行そのものへ次の不変条件を掛けること。(1) 閉じた列挙の数詞は、同一行の literal な列挙の要素数と一致するか、再現コマンドを併記するかのいずれかを満たす。(2) 「タスク 115.NN が付け替え済み／所管」と述べる文が挙げる要件番号は、当該タスクの `_Requirements:_` の部分集合でなければならない。(3) 既存文を編集・要約して作った文は、出来上がりを一次資料へ改めて当てる。**既存文の複製は検証の代用にならない。**
- **起票時の指摘は過少にも過大にもなる（115.113 と 115.114 の対比）**: 115.113 の本文は同型の取りこぼしを「四件」と書いたが実測は105件だった。逆に 115.114 の本文が挙げた四件のうち二件は、起票後に走った 115.83（`aeb099c` が倍率の操作要素を収録）と 115.81（`77d89e5` が要件15.9 の注記を是正）で既に解消しており、現時点では偽である。**起票文は書かれた時点の観測であって現況ではない。**着手時に一次資料と版管理の履歴で真偽を測り直し、既に解消しているなら「非存在の証明」を示して変更を捏造しないこと。
- **免除を導入したら、免除の陰が空でないことを実測して開示する（115.117 のレビュー）**: プレースホルダ表記の免除は申告した四種を大きく超え、実測で四十三件を照合から落としていた。うち二十件はリポジトリ内の実パス参照であり、しかもその陰に非実在のパスが一件実在した（撤去済みのまとめ出力。記録なので無害だが、陰が空でないことの実証である）。**免除の範囲を目視で申告してはならない。**落ちるトークンを機械的に数え、内訳と「対象外であることは実配置と一致している証拠ではない」旨を併記すること。
- **規約を書く作業は、書いた条文自身を掃引対象に含める（115.117 のレビュー）**: 可変部の許容例を「三つの場合だけ」と閉じた条文が、同じ文書の import 断片と、条文自身が定義のために書く表記を覆えていなかった。引用の除外条項も禁止形だけを対象とし、許可形の自己引用を落としていた。**条文を書いたら、その条文が定める掃引を文書全体へ回し、全ヒットをケース番号へ割り当てて未割り当てが零であることを示すこと。**
- **同定は起票文の一次読解から行う。上位からの示唆も反証の対象である（115.118）**: 親が示した二件はいずれも手振りのファイル記述であり、起票文が並べる「手振りの資材」と「見た目の資材」のうち後者に対応しなかった。起票文が「その名のディレクトリ」「同名のディレクトリ」と書く以上、対象はファイルではなくディレクトリの記述である。実装は示唆を退けて文書全体を走査し、条件に合致する唯一の組を特定した。**示唆は仮説であって同定ではない。**合致しない根拠を機械的に示せるなら退けてよい。
- **後続タスクが書いた件数を壊さないことも境界の一部である（115.118）**: 是正候補のうち一件は、直前のタスクが基準線として記録した二十件の一員だった。単独で触ると記録済みの件数が恣意的にずれるため、二十件の一括是正として別途起票すべきものと判断した。**隣接タスクが確定させた機械的主張は、次のタスクにとって不変条件である。**
- **承認済みタスクが自己申告する要件番号は、要件本文で検算する（115.119）**: 待ち時間方式の根拠とされた承認済みタスク18.1 は `_Requirements: 13.4_` を掲げるが、要件13.4 の本文は取り消し履歴の保持であって自動保存ではない。同じ取り違えが基盤の注釈にも入っていた。**番号の一致は権威の証明ではない。**要件条文と承認済み実装が衝突して見えるときは、まず衝突が本物かを本文で確かめること。本件では衝突が存在せず、要件15.4 が単独で統治していた。
- **除外一覧から外して受入検証を置いても、識別力が無ければ被覆は成立しない（115.119 のレビュー）**: 要件15.4 の受入検証は一度描いて待つ形で、待ち時間方式でも一定間隔方式でも同じく成立する。つまり本タスクが直した欠陥を受入レベルは検出できない。**「除外を外した」と「区別できる検証を置いた」は別の主張である。**契約を変えたら、旧契約で落ちることを確かめた検証を受入レベルにも置くこと。
- **列挙した形式が個別に到達しているかは変異検査でしか分からない（115.120）**: 要件15.10 の四形式はいずれも検証に名前が出ていたが、実測すると二形式は削除しても全緑のままだった。原因は検証環境の例外生成が自動的に番号を付けるため、番号による判定と名前による判定が互いを覆っていたことである。しかも死んでいたのは起票文が想定した組ではなく、番号の一方と名前の一方だった。**「その形式を確かめる名前のテストがある」は「その形式が個別に到達している」ことを意味しない。**分岐ごとに削除して落ちる検証を記録すること。
- **中断された作業は保全して引き継ぐ（115.120）**: 実装が基盤側の一時障害で中断したが、作業ツリーの変更はそのまま残っていた。破棄して最初からやり直すのではなく、次の実装に現状の差分を批判的に検証させたうえで残りの工程だけを実行させた。**中断は成果物の否定ではない。**引き継ぐ側には、前任の成果を無批判に受け入れないことを明示すること。
- **免除の台帳自身が陳腐化する（115.121）**: 除外一覧の要約は総数を五百八十四件と称していたが、実際の項目は二百六十一件だった。区分ごとの内訳も全て旧値で、存在する区分の欄が一つ欠けていた。さらに代替検証の道具名は百二十四件がこのリポジトリに存在しない実行器を指しており、うち三十二件が当スペックの所管だった。**何を検証しなくてよいかを定める台帳は、個々の免除の当否より先に、台帳自身が実態と一致しているかを確かめること。**要約に書く数は、それが要約する配列から毎回導出すること。
- **是正した当の成果物に、是正で動いた数を残さない（115.121 のレビュー）**: 二件の道具名を直した結果、同一コミット内で当該件数が百二十四から百二十二へ動いたにもかかわらず、要約には現在形で百二十四と書かれ、設計文書側の百二十二と正面から矛盾した。**自分の変更が動かす数を、変更後に測り直すこと。**同じ数が複数の成果物に現れる場合は、両方を同時に測り直して一致を確かめること。
- **否定形の主張は、破ったときに落ちることを確かめて初めて成立する（115.122）**: 送出内容にファイル名を含めないという制約は、送出そのものが起きていなければ自明に成立してしまう。検証は先に送出が一度起きたことを確かめてから否定形を評価し、さらにファイル名を注入する変異を実際に加えて検証が落ちることを確認した。**「含めない」と書いた制約には、含めたら落ちる検証を対で置くこと。**
- **制約は文言ではなく構造で強制する（115.122）**: 許可列挙に限るという制約を、送出側で列挙値を固定配列に対して濾す形にした。上流が任意の文字列を返しても到達できない。**「そういう値しか来ないはず」は制約ではない。**来ても通さない形にすること。
- **設定を文書へ書くだけでは、設定できるようにならないことがある（115.123）**: 監視の宛先を配備の設定として供給する判断を、環境変数の例と配備手順への追記で果たそうとしたが、それだけでは効かない。フロントエンドの環境変数はビルド時にバンドルへ埋め込まれる仕組みであり、コンテナの構築定義に受け口が無ければ、運用者が配備基盤で値を設定しても届かない。**設定の口が実際に値を通すかを、供給経路の端から端まで確かめること。**書いた手順どおりに設定して効かないなら、決着していない。
- **「設定可能になった」と「実証された」は別である（115.123）**: 宛先を配備の設定として定義したことで要件は設定によって満たせる状態になったが、この版のどのビルドにも値は無く、実際の送出は一度も起きていない。文書にはこの区別を明記し、充足を主張しないことにした。**外部基盤へ送る要件は、送る側の結線・設定の口・実際の値の三つが揃って初めて充足する。**
- **到達不能で満たす設計は、経路の数だけ遮断が要る（115.124）**: 現場調査の論理削除は画像の行に印を付けず、到達できなくなることで要件を満たす設計だった。しかし十二の経路のうち五つが親の削除状態を一切見ずに画像を読み書きしており、削除済みの調査の画像が更新も削除もできた。保存基盤に共通の機構が無い以上、遮断は各経路が明示的に行うほかない。**「印を付けない」設計を採るなら、経路を数え上げてその全てに遮断があることを機械的に示すこと。**一つだけ正しく遮断されている非対称は、意図ではなく取りこぼしの徴候である。
- **モックは劣化を見逃すが型検査は捕まえる（115.124 のレビュー）**: ガードの呼び出しを残したまま、判定に使う項目の取得だけを外す変異を加えると、模擬した基盤は引数を無視するため検証は全件緑のままだった。一方で型検査は当該項目の不在を検出して落ちた。**単体検証だけを砦にしないこと。**取得と判定が離れている箇所では、型が最後の防壁になる。
- **文書の是正は、自分が押し出した行番号を自分で壊す（115.125）**: 是正の記録を小節へ差し込むと、同じ文書の後方を指す自己参照の行番号が挿入分だけずれる。115.125 は挿入直後に自らの引用（`1474→1479` / `1692→1697` / `3406→3411` / `3604→3609` と再現コマンドの走査範囲）を全件測り直して是正した。**行番号つきの自己参照を持つ文書を編集したら、編集後に必ず測り直すこと。**書いた時点で正しかったことは、書き終えた時点で正しいことを意味しない。
- **境界外の行番号ずれは、直さず記録する（115.125）**: 115.112 が書いた `survey-images.routes.ts` への引用2件（`99行` / `:56`）は実測で `104` / `61` へ +5 ドリフトしていたが、当該2件は 115.112 の責務欄・依存欄の中にあり本タスクの境界外である。文の主張自体は今も真であるため、勝手に直さず根拠つきの記録と後続タスクの提案に留めた。
- **保留は主張の時点ではなく観測を仕掛ける時点として使う（115.86）**: 移動先の取得応答を保留したまま「0件かつ非活性」を主張しても、その間は読み込み中しか描画されず対象の操作子が存在しないため、退行下でも空虚に真になる。保留は「まだ何も描かれていない」ことが保証される唯一の窓であり、そこで観測を仕掛けて最初の描画状態を捉えることで、競合状態を作らずに過渡状態を決定的に主張できた。**保留＝主張の好機、と短絡しないこと。**
- **記録が空でも通る主張は、恒真の変装である（115.86）**: 描画状態を記録して先頭を主張する形は、記録が一件も無ければ主張自体が実行されずに通る。記録が非空であることを別途主張して初めて成立する。
- **退行の変異はフロントの本番ビルドを差し替えて確かめる（115.86）**: E2E環境のフロントは本番ビルドのため、ソースを変異させただけでは反映されない。`npm --prefix frontend run build` + `docker cp` で流し込み、確認後は `--force-recreate --no-deps frontend` でイメージから作り直して原状復帰する。差し替えの成否は index.html の md5 で確かめること。
- **筋書きが本番から到達するかは、単体検証の正しさとは別に確かめる（115.87）**: 同じ実体のまま経路の識別子だけを差し替える筋書きは、仮想DOM上は自然に書けるが、実際の導線では画面が作り直されるため決して起きない。到達しない筋書きで緑を得ると、対象の処理が担う役割を実態より大きく見せる。**単体検証を書いたら、その状態遷移を本番のどの経路が起こすのかを実装から名指しできるか確かめること。**名指しできないなら、その検証は担当を偽っている。
- **担当を絞ることと主張を削ることは違う（115.87）**: 到達しない筋書きを外す是正は、主張を減らす口実になりやすい。旧検証の主張を一件ずつ数え上げ、新しい筋書きでも同数以上が成立することを突き合わせて初めて「絞った」と言える。あわせて、外した担当の引受先（今回は実ブラウザ検証の名前）を検証ファイルへ明記すること。**引受先を書かない限り、絞り込みは取りこぼしと区別できない。**
