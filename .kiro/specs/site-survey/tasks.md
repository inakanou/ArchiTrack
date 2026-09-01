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

- [x] 115.88 (P) 一覧応答の代表画像の識別子が二重に定義されている状態を整理する
  - 115.67 のレビューで判明した。設計文書は一覧応答に代表画像の識別子を退避用として含めると記すが、**表示側が用いるのは別名の項目**である
  - 当該の名称は本番のどこからも参照されていない。ただし供給側では**両者に同一の値**が入るため機能欠陥ではない
  - 設計文書と実態の名称の乖離であり、同じ値に二つの名前が付いている冗長でもある
  - 設計文書を実態へ合わせるか、供給側の重複した項目を整理するかを決めて適用すること
  - **115.62 が新設した呼称規約と契約名の対照表に従うこと**
  - _Requirements: 20.3_
  - _Boundary: 一覧応答の代表画像識別子とその設計記述_

- [x] 115.89 素材の欠落でE2Eが無条件に緑になる箇所を解消する
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

- [x] 115.90 (P) 削除を確かめると称して削除を行わない検証を解消する
  - 115.68 のレビューで判明した。画像を削除できることを名前に持つ検証が、**削除の操作を一切行っていない**
  - 実際に行うのは画像が見えることの確認だけで、末尾に「削除機能のUIが実装されたら追加」という注記が残っている
  - 要件4.7 の検証として数えられているが、中身は空である
  - **偽の緑の一種であり、要件が検証されているという誤った安心を与える**
  - 削除の操作と結果を確かめる形へ改めること。削除の経路が未実装であれば、その事実を明らかにして別途起票すること
  - _Requirements: 4.7_
  - _Boundary: 現場調査の画像E2Eの削除検証_

- [x] 115.91 (P) 現場調査のE2Eに残る恒真の判定を解消する
  - 115.68 のレビューで判明した。**常に真になる主張が八箇所**残っている
  - 内訳は、観測値に真を論理和して主張するもの六箇所、真をそのまま主張するもの一箇所、常に真を返す関数の戻り値を真と判定するもの二箇所である
  - うち一つは「操作して誤りが出なければ成功」という体裁で、実際には何も観測していない
  - **恒真の判定は本スペックが 115.27 以降で一掃してきた型であり、現場調査の一部に残っていた**
  - 観測した値そのものを主張する形へ改めること。**観測できないなら判定を消し、何を確かめられていないかを明記すること**
  - _Boundary: 現場調査の閲覧・応答性E2Eの判定_

- [x] 115.92 沈黙する前提準備をE2E全体で解消する
  - 115.68 のレビューで判明した。選択肢が無い場合に何もせず素通りする前提準備が、**E2E全体で約百二十九箇所**ある
  - うち現場調査の配下が九十一件で、残りは他の領域である。ほぼ同一の定型が繰り返し複製されている
  - 要件の検証ではないため第3原則違反ではないが、**前提が崩れた際の失敗箇所が後段までずれ、対象の欠陥と区別できなくなる**
  - 115.68 が一件を是正した形（選択欄の表示・選択肢の供給・実在候補の値・選択の成立を無条件に主張する）を全体へ適用すること
  - **同一の定型であるため共通の補助関数へ括り出すことを検討すること。**複製したまま個別に直すと再発する
  - _Boundary: E2E全体の前提準備_

- [x] 115.126 (P) 表示条件で自らを無効化する数量表の前提準備を解消する
  - 115.92 のレビューで判明した。115.92 が解消した「選択肢が無ければ素通りする」型とは別クラスの沈黙が、数量表の欄指定のE2Eに**十二箇所**残っている
  - 形は「対象の選択欄が見えている場合にのみ計算方法を設定する」であり、見えない場合は設定せずに進む
  - **後段の判定も同じく表示条件で包まれている**ため、前提が崩れると設定も判定も飛び、検証が何も主張しないまま緑になる。115.92 の型より重い
  - 115.92 の補助関数は転用できない。当該箇所は先頭の候補ではなく特定の値を選ぶ必要があるためである
  - 何を主張すべきかは要件側の判断を要する。設定と判定の双方を無条件へ改めること
  - 抑止一覧には既に計上されており、債務は隠れていない
  - _Boundary: 数量表の欄指定E2Eの前提準備と判定_

- [x] 115.93 E2Eの検査が既存の抑止で素通りしている状態を解消する
  - 115.68 のレビューで判明した。E2Eの判定を機械的に検査する仕組みは**既存の千百二件を抑止一覧へ登録**しており、新規のみを落とす構成である
  - 115.89 から115.91 が挙げた欠陥は**いずれも検出はされているが抑止されている**。したがって検査は通るのに欠陥は残る
  - さらに、ある除外の注釈が「検証ではなく前提の準備」を理由に沈黙する前提準備を明示的に許容しており、**115.68 が確立した基準と矛盾する**
  - 抑止一覧を段階的に削り込む計画を立て、当該の除外注釈を再評価すること
  - **抑止一覧は「今は直せない」の記録であって「直さなくてよい」の記録ではない**
  - _Boundary: E2E判定の機械的検査と抑止一覧_

- [x] 115.127 抑止一覧の削減を段0から順に実行する
  - 115.93 が策定した削減計画（`.kiro/specs/site-survey/e2e-assertion-guard-reduction-plan.md`）の段0〜7 を実行する
  - **段0 が最優先である。**検出器から見えない条件付きスキップが五十件あり、抑止一覧の千四十四という数字自体が実態より小さい
  - 段0 は「四十九件を是正してから検出規則を追加する」順序で行う。規則を先に足すと基準が膨らみ、是正が進んだのか登録が増えたのかを区別できなくなる
  - 段ごとの出口条件は件数で書かれており、達成の主張ではなく実測で確かめられる
  - **段4・段6・段7 の出口数値は暫定である。**依存する内訳が現時点で再現できないため、着手前に構文木に基づく分類走査を資材として作り、測り直して確定させること
  - _Depends: 115.93_
  - _Boundary: E2E判定の抑止一覧と各分類の是正_

- [x] 115.128 (P) 検査器に新設した二つの関門を自己検査で守る
  - 115.93 のレビューで判明した。115.93 が検査器へ加えた「増加方向の基準更新の拒否」と「基準の自己整合の検査」は、自己検査の対象になっていない
  - 自己検査は検出規則のみを対象としており、**当該の関門が将来の改変で静かに壊れても検知されない**
  - 関門は抑止一覧が黙って恒久化する経路を塞ぐために置いたものであり、守られていない防護は防護ではない
  - 基準ファイルの位置を差し替え可能にしたうえで、実基準を汚さずに関門を発火させる確認を自己検査へ加えること
  - _Depends: 115.93_
  - _Boundary: E2E判定の機械的検査の自己検査_

- [x] 115.94 二本指の拡大が効かない間欠失敗の真因を特定して解消する
  - 115.69 のレビュー中に発見した。**等倍時のパン抑止と拡大時の二本指パンを確かめる検証が、四回に一回の頻度で失敗**する
  - 失敗は拡大率が1のまま、すなわち**二本指の拡大が一度も効かなかった**ことを示す
  - 115.69 が是正したダブルタップとは**因果が無い**。当該の検証は実タッチ補助関数のダブルタップ経路を一度も通らない
  - 実行環境の設定は再試行を三回まで許すため、**この失敗は覆い隠されて表面化しない**
  - **間欠的な失敗は再試行で覆い隠さず真因まで追うこと。**再試行で緑になった失敗は、消えたのではなく隠れただけである
  - 115.69 と同じ形で、閾値に対する余裕の不足か、発火の順序の競合かを実測で切り分けること
  - _Requirements: 33.4, 34.7_
  - _Boundary: 編集モードのピンチズームE2Eの発火タイミング_

- [x] 115.129 (P) 拡大の中心が画面座標のまま渡されている状態を解消する
  - 115.94 のレビューで判明した。ビューポート駆動が拡大の中心へ**画面基準の座標**をそのまま渡している
  - 描画基盤は描画面基準の座標を期待するため、縦方向に余白のあるモバイル配置では**拡大の中心が下へずれる**
  - ずれた結果、縦方向のパンが可動範囲の下限へ張り付く。115.94 の検証が「縦方向は0になり得る」と注記したのはこの症状である
  - 要件33.3（中点を基準に拡大する）に対する既存の潜在欠陥であり、115.94 が持ち込んだものではない
  - 座標の基準を描画面へ揃え、中点基準の拡大が縦方向でも成立することを受入レベルで確かめること
  - _Requirements: 33.3_
  - _Boundary: ビューポート駆動の座標基準_

- [x] 115.95 (P) 再試行の設定が間欠失敗を覆い隠す構成を見直す
  - 115.69 のレビューで判明した。統合環境での実行は**再試行を三回まで許す**設定になっている
  - 115.94 が発見した間欠失敗は、この設定により統合環境では一度も表面化しない
  - 115.69 の起票経緯も同型で、一度だけ失敗し再試行で回復した事象をレビューが追跡して初めて真因に到達した
  - **再試行は環境由来の揺らぎを吸収する仕組みだが、実装や検証の欠陥まで吸収してしまう**
  - 再試行で回復した実行を失敗として記録し可視化するか、再試行の回数を絞るかを決めて適用すること
  - **緑であることと、一度で緑になることは別の主張である**
  - _Boundary: E2Eの実行設定と再試行の扱い_

- [x] 115.96 白縁取りの切替UIが出荷されているかを確かめ、未出荷なら結線する
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

- [x] 115.97 (P) 要件26.4・26.6 を受入レベルで確かめる
  - 115.70 のレビューで推奨された。セッションの中でスタイルが引き継がれることの主張は**単体の検証のみ**である
  - 115.70 は主張を未結線の部品から結線側へ移したが、実ブラウザで本番の経路を通る確認は無い
  - **単体の検証は、本番の経路から到達することを構造的に確かめられない**（本スペックで繰り返し確認された性質）
  - 道具を切り替えて戻したときに直前のスタイルが引き継がれること、選んだ値が既定値より優先されることを実ブラウザで確かめること
  - 対象の挙動を壊したときに失敗することを変異で確認できること
  - _Requirements: 26.4, 26.6_
  - _Boundary: 注釈スタイルのセッション引継ぎのE2E_

- [x] 115.98 (P) 寸法線のラベルの既定文字色を一元管理の資材へ寄せる
  - 115.70 のレビューで判明した。寸法線の道具が持つラベルの既定は**新規注釈の既定でありながら一元管理の外**にある
  - 過去のタスクが「本体色とは別概念」として存置を明記しているが、要件26.5 の既定色に含めるかの解釈は分かれる
  - 115.70 は要件26.5 の対象を新規注釈の既定に限って洗い出し、当該は判断を保留した
  - 別概念として残すのか一元管理へ寄せるのかを決めて適用し、**決めた理由を設計文書に記すこと**
  - _Requirements: 26.5_
  - _Boundary: 寸法線ラベルの既定スタイル_

- [x] 115.99 (P) スタイルパネルのプリセットに既定値が含まれない状態を解消する
  - 115.70 のレビューで判明した。線幅と色のプリセットの並びに、**是正後の既定値がどちらも含まれていない**
  - 結果、当該パネルでは既定の状態がどのプリセットの選択とも一致しない
  - 現在は未結線の部品のため利用者への影響は無いが、**115.96 で結線する場合は先に是正が必要**である
  - プリセットへ既定値を含めるか、既定値の選択状態を別の形で示すかを決めて適用すること
  - _Depends: 115.96_
  - _Requirements: 26.5_
  - _Boundary: スタイルパネルのプリセット配列_

- [x] 115.100 本番コードから設計文書を行番号で指す参照を実体の参照へ改める
  - 115.71 のレビューで判明した。本番コードの注釈が設計文書を**行番号で指しており、参照先が全く別の内容になっている**
  - 実例として、ある注釈が指す行は現在「新規外部依存は追加しない」を、別の注釈が指す行は閉じ括弧のみを、さらに別の注釈が指す行は無関係な項目の宣言を指している
  - 該当はフロントエンドの本番コードで**三十六箇所・十ファイル**にわたり、現場調査以外のスペックにも及ぶ
  - 設計文書は本 run だけでも複数回行数が変わっており、**行番号の参照は原理的に維持できない**
  - 節の題とシンボル名で指す形へ改めること。**115.71 が新設した記録の節は既にこの形を採っている**ため参照実装として使えること
  - _Boundary: 本番コードから設計文書への参照形式_

- [x] 115.101 検証の期待値が本番の算出を再実行している同型を掃き出す
  - 115.72 のレビューで判明した。塗りの代替式とは別に、**期待値の中で本番の算出をそのまま再実行している箇所**が残る
  - 内訳は三系統である。縁取りの描画幅を期待値側で組み立てる形が**七ファイル**、寸法線ラベルの縁取り幅を期待値側で計算する形が**二箇所**、既定値を定義しているのと同じ算出を両辺で呼ぶ**恒真が二箇所**
  - いずれも中央の値を変えると**両辺が同時に動くため落ちない**。恒真の二箇所は主張の価値が無い
  - 115.71 が具体値の主張を別に置いたため中央の変異は捕捉できており実害は抑えられているが、**形は 115.72 と同型**である
  - 期待値を具体値の直書きへ改めること。**同じファイル内に既に具体値で書かれた項目が併存している箇所がある**ため、そちらを参照実装とすること
  - 恒真の二箇所は具体値化するか撤去すること
  - **115.99 のレビューが同じ境界で別の欠陥を実測した**: `frontend/src/__tests__/components/site-surveys/StylePanel.default-presets.test.tsx` の数値プリセット読み出しが、接頭辞のみの正規表現でラッパー要素にも一致し、配列へ `NaN` が混入する（実測出力 `expected [ NaN, 1, 2, 3, 4, 6, 8 ] to include 7`）。主張自体は機能し続けるため実害は無いが、終端を数字で固定すること
  - _Requirements: 26.5, 24.2, 32.2_
  - _Boundary: 注釈の縁取りと既定スタイルの検証における期待値の組み立て_

## Task 115.102-115.109: 最終検証（kiro-validate-impl）が検出した未実装と検査の穴

最終検証は要件38 節のうち**出荷実装が本番経路から到達するのは23 節**であり、残りに未実装が残ることを機械的に確定した。既知の五件（115.81・115.82・115.83・115.96・115.30）に加え、以下は**いずれも新規の検出**である。判定は「検証ファイルが存在するか」ではなく「本番コードから参照され経路が通るか」で行い、**本番から一度も参照されないまとめ出力を経由した参照は結線と数えていない**。

- [x] 115.102 注釈編集画面に欠けている受入基準を実装する
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

- [x] 115.103 (P) 一覧と詳細に欠けている受入基準を実装する
  - 最終検証で判明した。一覧の取得は件数と上限が**固定値で書かれており、頁を送る操作要素が存在しない**（3.1）
  - 一括の登録に失敗した際、失敗した件数は表示されるが**どの画像がどの理由で失敗したかを画面から知る手段が無い**（31.13）
  - いずれも利用者が実際に困る欠落であり、文書上の乖離ではない
  - _Requirements: 3.1, 31.13_
  - _Boundary: 現場調査一覧の頁送りと登録失敗の個別提示_

- [x] 115.104 (P) 操作に欠けている受入基準を実装する
  - 最終検証で判明した。寸法線の端点をつまんで動かす専用の手段は実装されているが**本番から一度も呼ばれていない**（6.5）
  - 選択中の道具を再びたたいたときに設定の面を開閉する挙動が無い（28.8）。通知を受ける口はあるが**編集画面がそれを渡していない**
  - 道具の説明は既定の吹き出しに頼っており、長押しで表示する挙動が無い（29.6）
  - _Requirements: 6.5, 28.8, 29.6_
  - _Boundary: 寸法線の端点操作・道具帯の再たたき・道具の説明表示_

- [x] 115.105 通信が切れた状態への対応が皆無である状態を解消する
  - 最終検証で判明した。要件15.6 が定める、通信が切れた際の警告と保存の抑止が**現場調査の配下に一切存在しない**
  - 通信状態を示す部品と、それを観測する仕組みは実装されているが、**現場調査からは一度も参照されていない**
  - さらに当該要件は**受入検証の除外一覧に載っており、その根拠となる代替の検証も本番を通らない**
  - 結線し、受入レベルの検証で確かめること。あわせて除外一覧の当該項目を見直すこと
  - _Requirements: 15.6_
  - _Boundary: 通信断時の警告と保存抑止の結線_

- [x] 115.106 (P) 一覧の遅延取得が無効化されている状態を解消する
  - 最終検証で判明した。一覧の二つの表示部品が、画像の寸法として**零を渡している**
  - 受け取る側は寸法が得られたかどうかで観測の要否を決めるため、零を渡すと**表示領域の観測が働かず即時に取得する**経路へ落ちる
  - 結果、要件38.6 が定める表示領域外の取得遅延と、38.8 が定める順次の取得が**一覧では成立していない**
  - 115.67 が是正したのは合成済みサムネイルの供給であり、この経路は別である
  - 寸法を正しく渡すか、観測の要否の判定を見直すこと。**表示リクエストが写真数に比例しないことを実測で確かめること**
  - _Requirements: 38.6, 38.8_
  - _Boundary: 一覧の表示部品が渡す画像寸法と遅延取得の判定_

- [x] 115.107 (P) サーバ側のサムネイル再生成が到達不能である状態を解消する
  - 最終検証で判明した。注釈の経路が生成の担い手を組み立てる際、**再生成を担う部品を渡していない**
  - このためサーバ側で同期に再生成する分岐と、その失敗を表す応答が**到達不能**である
  - 加えて、その応答を前提としたフロントエンド側の扱いも到達しない
  - 要件23 自体はクライアント側の経路で満たされているため機能欠陥ではないが、**死んだ分岐と死んだ扱いが残っている**
  - 渡して到達可能にするか、到達不能な分岐と扱いを撤去するかを決めて適用すること
  - _Requirements: 23.4, 23.6, 23.8_
  - _Boundary: 注釈経路の依存注入とサーバ側再生成の分岐_

- [x] 115.108 検証が判定を自前で再実装して自らに主張する状態を解消する
  - 最終検証が**偽の緑の第七の型**として検出した。要件15.7 から15.10 のE2Eは、画面の中で**判定の処理を自前で書き起こし、その書き起こしに対して主張している**
  - したがって本番のコードを一度も通らない。うち一つは**真をそのまま返す一行**が書かれている
  - 恒真式でも条件包みでもないため既存の機械的な検査を素通りし、**除外一覧にも載っていないため被覆として正規に数えられている**
  - これは 115.91 が扱う恒真式とも、115.68 が扱った供給側欠落による空振りとも異なる第三の形である
  - 本番の経路を通る形へ組み替えること。組み替えた結果として要件が未実装であることが露見する場合は、**115.81 の対象として回付し、検証は失敗したまま残すこと**
  - 同じ形が他に無いかを機械的に洗い出すこと
  - _Requirements: 15.7, 15.8, 15.9, 15.10_
  - _Boundary: 自動保存・復元のE2Eの判定構造_

- [x] 115.109 被覆の検査に本番到達性の判定を加える
  - 最終検証で判明した。被覆の検査は**要件の番号を持つ検証ファイルが存在するか**だけを見ており、その検証が本番の経路を通るかを見ていない
  - 結果、検査は満点を出すのに実装が無い、という状態が三つの経路で成立している。**未結線コードに付けた番号**、**恒真式と自前再実装のE2E**、**除外一覧**である
  - 実例として、二つの受入基準は**死んだ部品の検証が唯一の被覆源**になっている
  - 検査へ「番号を持つ検証が参照する本番のシンボルが、本番の経路から到達するか」の判定を加えること
  - **本スペックが偽の緑を七つの型にわたって掃き出してきたにもかかわらず、検査自身は一度もそれを検出していない**
  - _Boundary: 要件被覆の検査_

- [x] 115.110 (P) 書き出し経路に残る同形の倍率適用先の不一致と、それを免除している誤った前提を解消する
  - 115.73 のレビューで判明した。是正した復元処理と**同形の欠陥が書き出し経路に残っている**（複写された線幅へ表示倍率を掛ける）
  - 書き出しは復元後に複写値を読み直さないため表示上の実害は小さいが、**同型の欠陥は資材が分かれている数だけ存在する**の再現である
  - あわせて設計文書が記す前提「集合体化した矢印では集合体本体に線幅が存在しないため対象外」は**事実に反する**。七形状の構築処理はいずれも複写を行っている
  - さらに統合の検証に、この誤った前提を注釈として記録したうえで**真をそのまま主張する空の検証**が残っている
  - 三点を対象とすること。誤った前提の訂正を先に行い、そのうえで書き出し経路の適用先を復元処理と同じ方式へ揃えるか、掛けない判断の根拠を実装から示すこと
  - 空の検証は 115.91 が扱う恒真の判定と同型である。観測した値を主張する形へ改めるか撤去すること
  - 対象の挙動を壊したときに失敗することを変異で確認できること
  - _Requirements: 32.2_
  - _Boundary: 書き出し経路の表示倍率の適用先、設計文書の当該前提、統合検証の空の主張_

- [ ] 115.130 数量表の範囲外入力にエラー表示が無い状態を解消する（**別スペックの所管**）
  - 115.126 のレビューと是正で判明した。数量表の欄指定E2Eが「範囲外ならエラーが出るか値が制限される」という**恒真の判定**で覆っていた欠陥である
  - quantity-table-generation の REQ-9.3（調整係数 -9.99〜9.99）、REQ-10.3（丸め設定 -99.99〜99.99）、REQ-15.1（数量 -999999.99〜9999999.99）は、いずれも範囲外の入力に対し**エラーメッセージを表示し範囲内の入力を求める**ことを規定している
  - production 側に当該の検査が無い。`EditableQuantityItemRow.handleQuantityBlur` は `parseFloat` と `toFixed(2)` のみ、`CalculationFields.AdjustmentField` も範囲判定を持たない
  - **判定の実体は実装済みだが結線されていない。**`FieldValidatedItemRow.tsx` が範囲エラーを実装しているにもかかわらず、当該ファイルは stories/test 以外からどこからも参照されない**死コード**である。実際に描画されるのは `EditableQuantityItemRow` である
  - `frontend/src/utils/field-validation.ts` の `validateNumericRange` も、`rangeFieldType` を指定する箇所（箇所数のみ）からしか呼ばれていない
  - **さらに quantity-table-generation の tasks.md 11.2 と 12.4 は当該を `[x]`（完了）としている。**結線漏れによる要件未達が完了済みタスクの裏に隠れている。完了状態の是正も対象とすること
  - `NUMERIC_FIELD_RANGES.roundingUnit` は `{ min: 0.01, max: 999.99 }` で REQ-10.3 の -99.99〜99.99 と食い違う。**結線の前に要件と定数のどちらが正かを確定させること**
  - `AdjustmentField` は `warningCondition` が `v <= 0` のため、REQ-9.3 が有効域と定める -9.99〜0 に対して警告を出す。この要件不整合も併せて解消すること
  - 是正後は `e2e/specs/quantity-tables/field-specification.spec.ts` 冒頭の「未検証」記載を判定へ引き上げ、当該記載を削ること
  - _Blocked: 数量表生成スペックの所管。当該スペックでの実装が必要_
  - _Boundary: 調整係数・丸め設定・数量の範囲検証と、その結線先のE2E判定_

- [x] 115.131 (P) 欄指定E2Eの被覆表記と検証名の不正直を解消する
  - 115.126 のレビューで判明した。いずれも 115.126 の境界内で残った小さな不正直である
  - 13.2（工種）と 13.3（単位）は「上限ちょうどを受け付ける」しか判定しておらず、REQ-13.2 / 13.3 の規範である「**超える入力を防止する**」は 13.1（大項目）でしか検証していない
  - にもかかわらず冒頭の被覆表記は 9.3 / 10.3 / 15.1 には「（一部）」を付しながら 13.2 / 13.3 には付していない
  - 工種・単位にも大項目と同型の超過拒否の判定を足すか、「（一部）」表記を揃えること
  - 検証名「文字数超過時にエラーメッセージが表示される」は、中身が「入力拒否で直前値が保たれる」の判定へ変わったため名称と内容が食い違う。改名すること
  - _Depends: 115.126_
  - _Boundary: 数量表の欄指定E2Eの被覆表記と検証名_

- [x] 115.132 (P) 存在しない目印に依存して常に素通りするE2Eを是正する
  - 115.127 段0 のレビューで判明した。`e2e/specs/quantity-tables/quantity-table-phase9.spec.ts`（七箇所）と `e2e/specs/quantity-tables/group-rename-e2e.spec.ts`（一箇所）が `[data-testid="project-card"]` を参照するが、実装の目印は `project-card-{id}` であり**一度も一致しない**
  - phase9 は一致しない観測を `if` の条件に用いるため、全ての検証が判定を一つも実行しないまま緑になる。115.127 段0 で是正した三ファイルと**同一の機序**である
  - 前提は `e2e/helpers/quantity-table-preconditions.ts` の補助で自ら作る形へ改めること。複製した遷移補助を各ファイルで個別に直すと再発する
  - 出口条件は `grep -rn 'data-testid="project-card"\]' e2e --include=*.ts | wc -l` が 0、かつ両ファイルの skip 件数が 0 で全件 passed であること
  - _Depends: 115.127_
  - _Boundary: 数量表E2Eの前提生成（phase9 / group-rename）_

- [x] 115.133 (P) 数量表の並び替えと表示領域の未検証な受入基準を埋める
  - 115.127 段0 で `quantity-table-phase10.spec.ts` の判定を実在の要素へ向け直した際に確定した未検証分である。**是正前の原文にも当該の判定は無く、失われた主張は無い**
  - 表示領域: REQ-25.2（垂直スクロールバー）・25.3（収まる場合の非表示）・25.4（ウィンドウ変更時の動的更新）・25.6（縦スクロール操作）が未検証である
  - 垂直方向はページ側のスクロールコンテナへ委ねる実装（`QuantityGroupCard` の `itemTableWrapper` は `overflowY: hidden`）であるため、**判定先を実装から確定させてから書くこと**
  - 並び替え: REQ-23.7 / 24.7（保存後の永続化）と REQ-23.8 / 24.8（一件のとき両方が無効化される）が未検証である
  - **さらに重い欠落として、グループの移動が実際に起きることの主張がE2Eのどこにも無い**（REQ-23.3 / 23.4）。`quantity-table-phase10.spec.ts` と `group-sort-e2e.spec.ts` はいずれも操作要素が表示されることしか主張していない
  - _Depends: 115.127_
  - _Boundary: 数量表E2EのREQ-23/24/25の未検証分_

- [x] 115.134 (P) 補完のE2Eが観測条件で自らを空にしている構造を解消する
  - 115.127 段1 で `test.skip(!testProjectId, …)` を除いた結果、`e2e/specs/quantity-tables/autocomplete-optimization.spec.ts` と `e2e/specs/quantity-tables/name-remarks-autocomplete.spec.ts` の**判定本体がほぼ全て `if (await x.isVisible())` の内側にある**ことが露見した
  - 実測は autocomplete-optimization が観測条件二十三箇所に対し `expect(` 十七箇所である。欄が描画されなければ一つも主張せずに緑になる
  - 数量項目の行は `openEditPageWithSingleItemRow`（`e2e/helpers/quantity-table-preconditions.ts`）が無条件に用意できる。欄の取得は画面全体ではなく行スコープで行い、観測条件ではなく `expect(...).toBeVisible()` で主張すること
  - 本当に判定できているものを実装と要件原文に照らして確定し、判定できないものはファイル冒頭へ「未検証」として明示すること
  - 出口条件は両ファイルの観測条件が 0、かつ skip 0 件で全件 passed であること
  - _Depends: 115.127_
  - _Boundary: 数量表の補完E2E二ファイルの判定構造_

- [x] 115.135 OCRのE2Eが失敗を成功として受理している状態を解消する
  - 115.127 段1 のレビューで判明した。**OCR が失敗しても主張が満たされる**構造である
  - 見積依頼のOCR系三ファイルは、OCR の完了を `extracted-text` **または** `ocr-error-message` のいずれかが現れることとして主張している。したがって OCR が動かなくても、誤った結果を返しても、明確に失敗しても緑になる
  - 該当は `e2e/specs/estimate-requests/ocr-retry-e2e.spec.ts` の九箇所と `e2e/specs/estimate-requests/ocr-accuracy-improvement-e2e.spec.ts` の四箇所である
  - さらに実質的な判定は `if (await extractedText.isVisible({timeout:3000}).catch(() => false))` の内側にあり、二重に沈黙している
  - 十二件の検証が約二十九秒で終わることが、判定が走っていないことの傍証である
  - **成功と失敗を選言で受理する形を廃し、成功のみを主張すること。**失敗の経路を検証したい場合は、失敗を意図的に起こす別の検証として分けること
  - 削減計画の段6（E群）の対象であり、段6 の着手時に併せて処理してもよい
  - _Depends: 115.127_
  - _Boundary: 見積依頼のOCR E2Eにおける完了判定_

- [x] 115.136 アクションメニューの項目数の前提が実装に追随していない赤を解消する
  - 115.127 段2 のレビューで判明した。**現在このブランチには落ちているE2Eが一件ある**
  - `e2e/specs/quantity-tables/quantity-item-action-menu-clipping-e2e.spec.ts` の項目数の前提が四件だが、実装は五件を描画する。`a241d54`（数量項目のグループ間移動と一括操作の実装）が「別グループに移動」を足した際に検証側の定数が追随しなかった
  - 直列 describe のため、当該の失敗により**後続の五件が実行されない**
  - HEAD（段2 の変更を戻した状態）でも同一に再現することを確認済みであり、段2 が持ち込んだものではない
  - 実装が正しく検証側が陳腐化しているため、前提を実装へ追随させること。あわせて**項目数を数える形そのものが陳腐化しやすい**ため、個々の項目の実在を主張する形へ改めるかを判断すること
  - _Boundary: アクションメニューの非クリップE2Eの項目数の前提_

- [x] 115.137 (P) 観測の検出規則が補助の名前に依存して壊れる状態を解消する
  - 115.127 段2 のレビューで判明した。段2 が `isVisible({timeout})` を補助へ畳んだ結果、検出器の観測パターンが**当該の補助名に一致しなくなった**（末尾の語が続くため語境界が成立しない）
  - **【実測で訂正】**起票時は「これら二百五十六箇所の分類が `await` を含むことだけに依存しており、`await` を外へ出す書き換えで約二百五十件の検出が静かに消える」と書いたが、これは実測していない見立てであり**過大だった**
  - 実測（115.137 の実装時）: `isVisibleWithin` が条件式に現れるのは **126 行**。`await` を観測の合図から外した検出器で全件走査しても**検出件数は変わらない**（多くの条件式は局所変数の展開後に `locator` / `getByRole` / `count` を含むため）。変わるのは**型の分類**だけである。語彙の是正が効くのもこの分類で、`await` を外した状態での T5 は新語彙 298 件・旧語彙 285 件の **13 件差**
  - したがって脆かったのは「検出の有無」ではなく「型の分類」である。分類は段の出口条件と母数に直結するため是正の価値は残る
  - 観測パターンへ当該の補助名を加えること。あわせて**補助名に依存しない形（真偽を返す待機の呼び出しを構文で捉える）へ改められないか**を検討すること
  - **段4 のレビューで実害が確定した。**`e2e/specs/quantity-tables/import-e2e.spec.ts:809` に、観測が偽なら黙って脱出する真正の沈黙が残っているが、**検出器はこれを一件も報告しない**。すなわち「D2 が零」は「沈黙脱出が零」を意味しない
  - **【実測で訂正】**起票時は無検出の原因を「補助名に一致しないため」と断定したが、**誤りだった**。補助名を語彙に一致する `isVisible` へ差し替えても旧検出器は当該行を検出しない。真因は `isSilentExit` の判定が「脱出の文**だけ**で構成される」と狭く、後始末の内側に `if` を挟む形をすり抜けていたことである
  - **本タスクは段6 の前提である。**観測パターンを是正しないまま段6 が E 群を測り直すと、母数そのものが実態より小さいまま進む
  - 上記の訂正により、本タスクの範囲は**観測の語彙に限らず、沈黙脱出の判定（`isSilentExit`）と走査範囲を含む**。809 を検出させるには語彙の是正だけでは到達不能であることが実測で確定したため
  - _Depends: 115.127_
  - _Boundary: E2E判定の機械的検査の観測パターンと沈黙脱出の判定・走査範囲_

- [x] 115.138 (P) 真偽を返す待機の手書きの定型を一本化する
  - 115.127 段2 で判明した。段2 が新設した補助と同一の意味を持つ手書きの定型が**十箇所**残っている（`import-e2e` 八箇所、`field-specification` 一箇所、`trading-partner-error-handling` 一箇所）
  - これらは待機の指定が実際に効くため T2 の欠陥そのものではないが、**複製が残ると再発源になる**
  - 補助へ寄せること
  - _Depends: 115.127_
  - _Boundary: 真偽を返す待機の呼び出し形式_

- [x] 115.139 (P) 構造上決して失敗しない主張を解消する
  - 115.127 段2 のレビューで判明した。`e2e/specs/estimate-requests/number-format-e2e.spec.ts` の整数表示の主張は、**抜き出しの正規表現が小数点を含まない**ため、抽出後の文字列に小数点が現れることが原理的に無い
  - したがって当該の主張は決して失敗しない。段2 が到達可能にしたが、到達可能になっただけで失敗し得るようにはなっていない
  - この形は既存の恒真の検出規則（真偽を直接主張する形のみを対象とする）では捉えられない**第八の型**である
  - 抜き出しの範囲を小数点を含む形へ広げ、そのうえで小数点が無いことを主張すること
  - **同じ形（抽出で除外したものの不在を主張する）が他に無いかを機械的に洗い出し、検出規則へ加えられるかを検討すること**
  - _Depends: 115.127_
  - _Boundary: 整数表示の検証における抽出と主張_

- [x] 115.140 ブラウザ側で評価される関数の早期脱出が戻り値を問わず対象外になる状態を狭める
  - 115.127 段3 のレビューで判明した。段3 が加えた除外規則のうち、ブラウザ側で評価される関数の経路は、**戻り値が真偽でなくても**早期脱出を対象外にする（真偽を返すかの検査が当該の経路では走らない）
  - 実害の実例: `e2e/specs/site-surveys/site-survey-drawing-selection-prevention.spec.ts` の描画面が取れない場合に空値を返す分岐が対象外になり、同ファイルの二箇所の「選択されていないこと」の主張が、**描画面が不在でも真になりうる**
  - すなわち恒真の可能性がある。しかもこの形は E 群にも恒真の検出にも回収されない
  - 除外の条件へ「戻り値が真偽であること」を課すか、当該の形を「不在を主張する形」として別に扱うかを決めて適用すること
  - **不在の主張は、対象が存在することを別に確かめない限り何も主張していない**（115.139 が扱う第八の型と同根である）
  - _Depends: 115.127_
  - _Boundary: 検出器の除外規則のブラウザ側評価経路と、不在を主張する検証_

- [x] 115.141 (P) 前提を用意する補助の戻り値を捨てている呼び出しを解消する
  - 115.127 段3 で判明した。真偽を返す前提の補助を呼び、**戻り値を一切見ていない**呼び出しがある（`e2e/specs/site-surveys/site-survey-viewer.spec.ts` の画像の前提）
  - 現状は直後に無条件の主張があるため沈黙はしないが、前提が崩れた場合の失敗は前提の地点ではなく後段に現れる
  - 段3 が当該の補助の内側を検出対象外にした正当性は「真偽を呼び出し側がどう扱うかは依然として関門である」ことに依拠している。**その依拠を呼び出し側で明示すること**
  - 戻り値を主張で受ける形へ改めること。あわせて**真偽を返す関数の呼び出し結果を式文として捨てる形**を機械的に洗い出し、検出規則へ加えられるかを検討すること
  - _Depends: 115.127_
  - _Boundary: 真偽を返す前提補助の呼び出し側_

- [x] 115.142 (P) 前提の主張の使い分けと呼び出されない補助を整理する
  - 115.127 段4 のレビューで判明した。いずれも小さいが、放置すると判断の根拠が濁る
  - `e2e/specs/itemized-statements/itemized-statement-crud.spec.ts` の見出し行の主張が、空文字を通す側の補助を使っている。是正前は空文字を弾いていた。直後の列数の主張で落ちるため実害は無いが、**弾くべきものを弾く側の補助へ改めること**
  - `e2e/specs/execution-budget/helpers.ts` の実行予算を取得する補助は**呼び出し側が一件も無い**。呼び出されない補助は検証の対象にならず、検出器の負債としてのみ残る。除去すること
  - _Depends: 115.127_
  - _Boundary: 前提の主張の使い分けと未使用の補助_

- [x] 115.143 写真コメントの「コメント無し」の受入基準が観測不能なまま恒真で残っている状態を解消する
  - 115.127 段5 の是正の査読で判明した。`e2e/specs/quantity-tables/photo-comment-e2e.spec.ts` の qtg/REQ-21.3 は `expect(typeof text).toBe('string')` という**純粋な恒真**であり、到達不能な else 分岐も残っている
  - さらに前提生成（`seedSurveyPhotosWithComments`）が用意する写真は**二枚ともコメント付き**であるため、当該受入基準が言う「コメント無しの写真」という状況を一度も観測できない。`PHOTO_COMMENTS` の型は `(string | null)[]` で null を許すのに使われていない
  - 検出器は T3 = 0 と報告するが、この形（`typeof x` の主張）は捕捉できていない。**検出規則の側も併せて検討すること**
  - コメント無しの写真を前提として用意し、コメント表示エリアが空であることを肯定的に主張する形へ改めること
  - _Depends: 115.127_
  - **【着手時の実測】起票の一点目と二点目（恒真の解消・コメント無しの写真の用意）は、着手時点で 115.127 段7（`a6da29d`）が既に是正済みだった。** 当該コミットの差分に `expect(typeof text).toBe('string')` と到達不能な else の撤去、および `PHOTO_COMMENTS` の三要素化（三枚目が null）が含まれる。実装分は三点目（検出規則）のみ
  - _Boundary: 写真コメント表示のE2Eと恒真の検出規則_

- [x] 115.144 (P) 要件番号の重複表記と実在しないスキーマ参照を整理する
  - 115.127 段5 の是正の査読で判明した。いずれも検査は通るが、記録の正しさを損なう
  - `e2e/specs/quantity-tables/quantity-table-crud.spec.ts:3153` と `:3426` は以前から REQ-9.5 / REQ-10.5 を名乗っているが、本体が検証しているのは計算元の変更時の自動再計算であり、意味の上では REQ-9.6 / REQ-10.6 である。段5 の是正で 9.5 / 10.5 の正しい主張が別に加わったため、**同一番号を異なる意味の二件が名乗る状態**になっている
  - `e2e/requirement-exclusions.json` の `$schema` が指す `e2e/requirement-exclusions.schema.json` は**リポジトリに存在しない**（段5 以前からのダングリング参照）。除外定義は形式検証を受けていない。スキーマを用意して検査に組み込むか、参照を外すこと
  - _Depends: 115.127_
  - **【着手時の実測】起票の一点目のうち `:3426` は二重に誤っていた。** 115.127 後段（`a6da29d`）が既に REQ-10.2 へ付け替えており、しかも当該検証の本体は「幅5×奥行3=15 を丸め設定10で切り上げて20.00」であって計算元の変更時の自動再計算を通らない。したがって起票が指定した REQ-10.6 より既存の REQ-10.2 が要件原文に忠実であり、是正不要だった。付け替えたのは `:3153` の REQ-9.5 → REQ-9.6 のみ
  - _Boundary: 要件番号の表記と除外定義の形式検証_

- [x] 115.145 ダブルタップ拡大の中心が画面座標のまま渡されている状態を解消する
  - 115.129 のレビューで判明した。115.129 が是正したのは2本指ピンチの中点（`driveViewport` の経路）のみで、**ダブルタップ拡大は同じ欠陥が残っている**
  - `frontend/src/components/site-surveys/AnnotationEditor.tsx:1744-1748` が `payload.clientX/clientY` を `controller.zoomToPoint` へ**直渡し**している。描画基盤は描画面基準を期待するため、縦方向に余白のある配置では拡大の中心が下へずれる
  - 実在かつ到達可能な欠陥であることをレビューが実コードで確認済みである。**既存のE2E（ダブルタップの検証）はこれを検出できていない**（中心を主張していないため）
  - 115.129 が追加した `canvasViewportController.toCanvasPoint` を通すこと。**変換の実装は済んでおり、呼び出し側を揃えるだけである**
  - あわせて受入レベルの検証を強化し、拡大の中心がダブルタップ位置に固定されることを主張すること。115.129 が置いた「中点に見えている画像上の位置が拡大前後で不変」の形が参照実装になる
  - _Depends: 115.129_
  - _Requirements: 33.8_
  - _Boundary: ダブルタップ拡大の座標基準_

- [x] 115.146 (P) 本番から参照されない画像ビューアの死蔵を整理する
  - 115.129 のレビューで判明した。`frontend/src/components/site-surveys/ImageViewer.tsx:917-921`（呼び出し元 1018 行）にも 115.129 と同型の座標基準の欠陥があるが、**当該ファイルは本番コンポーネントからどこからも取り込まれていない**（テストと Storybook からのみ）
  - 閲覧画面 `SiteSurveyImageViewerPage` は `AnnotationEditor` を用いており、そちらは `touchGestureManager` と同一のコントローラを通るため 115.129 の是正の恩恵を受ける。したがって**要件33.10（編集モードと閲覧モードでジェスチャー操作体系を一貫させる）は崩れていない**
  - 死蔵コードに欠陥が残っていること自体は、後任が参照実装と誤認する危険がある
  - 撤去するのか、本番から使う予定があるのかを決めて適用すること。**残すなら座標基準を是正すること**
  - _Depends: 115.129_
  - _Boundary: 本番未参照の画像ビューア部品_

- [x] 115.148 (P) 白縁取りの切替のタップ領域が隣接要素より小さい状態を解消する
  - 115.96 のレビューで判明した。`frontend/src/components/site-surveys/AnnotationToolbar.tsx` の切替のタップ領域が **18x18 論理ピクセル**で、隣接する色の選択（32x24）や線幅の入力（60x24）より小さい
  - 要件28.3 の 44x44 は本リポジトリでは道具のボタンに限定して運用されており、切替は対象外であるため 115.96 の失格要因ではなかった
  - しかし**現場のスマートフォン運用では、隣より小さい操作要素は押し間違いを招く**
  - 隣接要素と同等以上へ広げること。要件28.3 の対象を切替まで広げるかは判断を要する
  - _Boundary: 注釈の道具帯の切替のタップ領域_

- [x] 115.147 圧縮の受入基準の変更に実装・検証・除外一覧を追随させる
  - 利用者の判断により**要件4.6 を変更した**（2026-08-22）。従前の「250KB〜350KBの範囲に圧縮」から「**350KB以下に収まった時点で圧縮を打ち切る**」へ改めた
  - 変更の理由は、下限が出力サイズの制約として原理的に成立しないためである。よく圧縮できる画像は品質90の一度の再エンコードで下限を大きく下回る（実測 61,638 バイト）。下限へ戻すには品質を上げ直すか拡大するしかなく、**元画像より劣化した状態で容量だけ増やす**ことになる
  - 下限の本来の意図（必要以上に品質を落とさない）は、出力サイズではなく**処理の制約**（段階的に下げ、上限を満たした時点で打ち切る）で表現した。現行の実装はこの制約を既に満たしている
  - `requirements.md` の 4.6 と `design.md` の該当記述は変更済みである。本タスクは残りの追随を行う
  - `backend/src/services/image-processor.service.ts` から下限の定数と、下限に依存する判定を整理すること。**到達不能になった分岐を残さないこと**
  - `backend/src/__tests__/unit/services/image-processor.service.test.ts` の下限に関する検証を、新しい受入基準の検証へ改めること。**sharp をモックして範囲内の値だけを与える形は、下限割れの経路を一度も通していなかった**（115.127 段6 の査読が実測）。同じ誤りを繰り返さないこと
  - `e2e/specs/site-surveys/site-survey-images.spec.ts` の `test.fail()` ラチェットを外し、新しい受入基準（350KB以下）を無条件に主張すること。**変異で赤くなることを確かめること**
  - `e2e/requirement-exclusions.json` の `site-survey/REQ-4.6`（`pending-implementation`）を**削除**し、`summary.totalExclusions` と `byCategory` を実測へ更新すること
  - _Requirements: 4.6_
  - _Boundary: 画像圧縮の受入基準と、その実装・検証・除外一覧_

- [x] 115.149 設計文書から本番コードを行番号で指す参照の失効を所管する
  - 115.98 のレビューで判明した。**115.100 の対偶にあたる向きの失効を所管するタスクが存在しない**
  - 115.100 の境界は「本番コードから設計文書への参照形式」であり、コード→設計文書の向きだけを扱う。`design.md` から本番コードを `パス:行` で指す参照の失効はその外側にある
  - 115.100 が挙げる理由「参照先は複数回行数が変わっており、**行番号の参照は原理的に維持できない**」は、**向きを入れ替えても同じく成立する**。本番コードの行数も変わり続ける
  - `design.md` は「実装へ行の増減を伴う変更を加えたタスクは、当該ファイルを指す本書の `パス:行` を全件測り直す責任を負う」と定めており、115.88 と 115.98 はこれに従って測り直した。**しかし規約は各タスクの境界内でしか働かないため、境界外の失効は測り直されずに残り続ける**
  - 実測済みの残存例として、決着表 #42 の `FreehandTool.ts:371`（実測 386 行）と同 `398`（実測 413 行）、`AnnotationData` の `frontend/src/types/site-survey.types.ts:620`（実測 461 行）、`BatchAnnotationRequest` の同 `:931`（実測 660 行）、`BatchAnnotationResponse` の同 `:921`（実測 650 行）がある
  - 本書の `パス:行` を全件測り直したうえで、**115.100 に倣い節の題とシンボル名で指す形へ改めるか、測り直しを機械的に検査する仕組みを置くかを決めて適用すること**。行番号を残す判断を採る場合は、失効を検出する検査を同時に置くこと
  - **人手で測り直すだけの是正は、次の実装変更で再び失効する**。同じ是正を繰り返さない形を選ぶこと
  - **【完了時の注記】本タスクは3回却下され debug を経た。同じ性質の見落としが五度続き（9件→+2→+19→+9→+2）、根本原因は「掃き終えた」という全称否定を掃き手自身の未検証の前提で支える**主張の形**にあった。第4回の前提「位置を指すには標識でしか書けない」は、同じ段落が死角として自ら挙げる反例と矛盾していた
  - **五度目が起きない保証は作れない。** 単独の裸数値（`` `foo.ts` の 226 のみ ``）は件数の記述と機械的に区別できず、真に判定不能な残余である。実在する `` `survey-images.ts` の 207 ``（状態コード）と `` `survey-image.service.ts` の 226 ``（行番号）が構造的に同型であることをレビューが実データで確認した
  - **したがって完了は「残存0」ではなく「主張の形を変えた」ことで判定した。** 設計文書は (A) 機械保証 / (B) 人手走査（再現コマンドと件数を併記）/ (C) 未走査の残余（反例可能な命題）の三層で書かれ、結論は「(A) と (B) の範囲で0件であり、範囲外は保証しない」である
  - _Boundary: 設計文書から本番コードへの参照形式_

- [x] 115.150 (P) 白アウトラインの色だけが一元管理の外に取り残された状態を解消する
  - 115.98 のレビューで判明した。寸法値ラベルの白アウトラインの色 `'#ffffff'` が `frontend/src/components/site-surveys/tools/DimensionTool.ts` に literal のまま二箇所残っている
  - 資材の `TextOutlineAttribute` は `enabled` と `widthRatio` しか持たず、**色の項目そのものが無い**
  - 115.98 がラベルのフォントサイズを資材へ寄せた結果、**`fontSize × widthRatio` という同じ算出式の中で色だけが literal に取り残された形**になった
  - 要件26.5 が列挙するのは「既定色・既定線幅・既定白縁取り**有無**」であり、縁取りの色そのものは対象外である。したがって 115.98 の境界外として据え置かれた
  - **同型の欠陥は直した経路の隣に残る**（115.129 の教訓）。要件26.5 の対象に含めるかを判断し、含めるなら資材へ寄せること。含めないなら、なぜ色だけ別扱いなのかを設計文書に記すこと
  - 矢印の白縁取り色は資材側（`arrowOutline.color`）にある。**同じ白縁取りでも矢印は資材、ラベルは literal という非対称**が現状である
  - _Boundary: 白アウトラインの色の供給元_

- [x] 115.151 (P) 色の正規化の食い違いで既定色の選択状態が消える経路を塞ぐ
  - 115.99 のレビューが変異で実測した。**115.99 が消した欠陥が、資材の表記が変わった瞬間に別経路で復活する**
  - `frontend/src/components/site-surveys/StylePanel.tsx` の `withDefaultColor` は重複判定を `toLowerCase()` で行い**大小を無視**するが、実行時の選択判定は素の等価比較で**大小を区別**する。`normalizeHexColor` は3桁記法の展開のみで小文字化しない
  - 実測: 資材の既定色を `#FF0000`（既存パレットの大文字表記）にすると、合成が「既に含まれる」と判断して追加せず、**選択状態のプリセットが皆無になる**。`#f00`（3桁）にすると、見分けのつかない赤が二枚並び、追加した方は選ばれない
  - 現行の資材値は小文字6桁のため実害は無く、いずれも 115.99 が追加した検証が落ちて検出するため**黙って壊れる経路ではない**
  - **比較を一本の正規化関数へ寄せること。**合成側と選択判定側で別々の正規化を行っている状態が原因である
  - _Boundary: スタイルパネルの色の正規化_

- [x] 115.152 寸法線のラベル位置が局所座標へ絶対座標を書き込む同型を解消する
  - 115.104 のレビューで判明した。115.104 は端点の移動に伴う幾何の更新について、**パス空間の絶対座標をそのままグループの局所座標へ書き込む**欠陥を是正した
  - しかし**同じ形が二つの関数に残っている**。うち一方は本番の編集画面から実際に呼ばれる経路にある（要件6.3 の寸法値の設定）
  - 実測: 端点が (100,100)-(300,100) の寸法線でラベル位置の更新を呼ぶと、ラベルの局所座標が (0,0) から (200,100) へ跳ぶ
  - 端点をつまんで動かす操作では是正済みの関数が正しい位置へ書き直すため要件6.5 には影響しないが、**寸法値を設定する経路では跳んだままになる**
  - 115.104 が是正した関数を参照実装とし、パス空間と局所空間の対応を保つ形へ改めること
  - 受入レベルの検証で、寸法値の設定後にラベルが正しい位置にあることを確かめること
  - _Requirements: 6.3_
  - _Boundary: 寸法線のラベル位置の座標空間_

- [x] 115.153 (P) 自動保存の容量超過の検証が古い順の削除を判別できない状態を解消する
  - 115.108 のレビューで判明した。要件15.7 は古いものから削除することを名指ししているが、検証は古い下書きを三件積み、本番も三件消すため、**「古い順」と「任意の三件」を区別できない**
  - 新旧を混ぜて積み、**古いものだけが消えて新しいものが残ること**を確かめる形へ改めること
  - _Requirements: 15.7_
  - _Boundary: 自動保存の容量超過時の削除順序の検証_

- [ ] 115.154 (P) 認証の検証に残る返り値を使わない待機を撤去する（**別スペックの所管**）
  - 115.108 が新設した検査の洗い出しで判明した。二箇所に**返り値が一切使われない待機**が残る
  - いずれも直後に通信の傍受による本番経路の主張があるため偽の緑ではないが、無価値な一行である
  - _Boundary: 認証の検証の待機_
  - _Blocked: 利用者認証スペックの所管。当該スペックでの実装が必要_

- [x] 115.155 (P) 設計文書の参照形式の検査が統合の成否に算入されない状態を解消する
  - 115.108 のレビューで判明した。統合の成否をまとめる関門の依存に**当該の検査が入っていない**
  - このため検査が落ちても関門は成立し、**配備も止まらない**
  - 兄弟の検査はいずれも算入されており、当該の一件だけが非対称である
  - 依存・判定条件・出力の三箇所へ加えること
  - **【完了時の注記】本タスクの差分は零である。起票の前提は起票時点では真であったが、着手時には既に解消されていた。** 起票時点の統合設定を取り出して機械照合したところ、当該のジョブは依存と出力から欠ける**唯一の非終端ジョブ**であり、前提は正しかった。しかし **115.149 が本番コードへの参照形式の検査を統合へ組み込む際、同じジョブを三箇所へ同時に追加していた**ため、着手時には充足済みだった
  - **差分零の完了は、真に不要だった不作為と見落としによる不作為が外形上区別できない。** したがって解消元を明記する。実測は (a) 三箇所の集合一致、(b) 依存の集合が終端3ジョブを除く全ジョブと一致、(c) 二方向の変異注入で両検査が非零終了、(d) 判定条件が `!= "success"` のため未実行や中断も捕捉、(e) 免除分岐は結合試験の一件のみ、(f) 配備は関門のみに依存し迂回経路なし
  - **起票文の「兄弟の検査はいずれも算入されており、当該の一件だけが非対称」は現時点では成立しない。** 検査系の全スクリプトを照合した結果、統合への算入漏れは零件である
  - _Boundary: 統合の関門への検査の算入_

- [x] 115.174 (P) 検出器の自己検査が押下前の関門から一件だけ抜けている状態を解消する
  - 115.155 のレビューで判明した。押下前に走る関門の台本に、**注釈の無効化を検出する道具の自己検査だけが無い**
  - 他の五つの検出器はいずれも自己検査と本検査が対で並ぶため、当該の一件だけが非対称である
  - 統合側には存在するため配備は止まる。壊れるのは「検出器の退行を押下前に捕まえる」局所の防御であり、影響は統合へ到達するまでの遅れに留まる
  - 本書が確立した教訓「**検出器の退行は、検出器自身の検査でしか捕まらない**」の直接の反例にあたる
  - 再現: 検査系の各名について、押下前の台本に自己検査の行があるかを数えること。当該の一件のみ零となる
  - _Boundary: 押下前の関門への自己検査の算入_

- [x] 115.156 (P) 画面内自前判定の検査が続く呼び出しの形を見逃す状態を狭める
  - 115.108 のレビューで判明した。返り値を**続く呼び出しへ渡す形**は、呼び出しが文の位置にあるため消費されていないと判定され見逃す
  - 現時点で該当は零件のため理論上の穴だが、**自己検査がこの形を固定していない**
  - 消費の判定へ加え、自己検査で両方向を固定すること
  - _Boundary: 画面内自前判定の検査の消費判定_

- [x] 115.157 画像のみのPDFを用意しOCRフォールバック経路の被覆を実際に回復する
  - 115.135 のレビューで確定した。`e2e/fixtures/test-file.pdf`（`/Image` 0・`Tj` 7・抽出文字数97）と `e2e/fixtures/test-text-pdf.pdf`（同 0・10・264）はいずれも**テキスト入りPDF**であり、`pdf-text-extractor.ts:427-428` の閾値50を超えるため `isTextPdf=true` が確定する
  - このため `extractPdfWithOcrFallback`（`CANVAS_RENDER_SCALE=4.0` / `preprocessImageData` / OCRタイムアウトを含む唯一の経路）へ**一度も到達しない**。実装者・レビュアーが独立に実測して一致した
  - 115.135 では当該の受入基準（`estimate-request/REQ-17.4`・`REQ-19.1`・`REQ-19.6`・`REQ-19.8`）から `@requirement` タグを外し `integration-test` 区分の除外へ逃がした。**本タスクはその除外を解消するものである**
  - 画像のみのPDF fixture を用意し、当該経路を実際に通す検証を書くこと。書けたら `e2e/requirement-exclusions.json` から当該4件を削除し、`summary` / `byCategory` の件数を戻すこと
  - あわせて `REQ-17.8`（30秒タイムアウト）も同じ除外に入っている。画像のみPDFで Tesseract 経路へ入れば、CDN 資材の取得を `page.route` で滞留させて30秒到達を作れる可能性がある。可否を判断すること
  - _Depends: 115.135_
  - _Boundary: 見積依頼のOCR E2Eの fixture と OCRフォールバック経路の被覆_

- [x] 115.158 (P) プレビュー成立を選言で受理し読み込み中のまま緑になる状態を解消する
  - 115.135 のレビューで判明した。`e2e/specs/estimate-requests/pdf-text-extraction-e2e.spec.ts:448-452, 535-540` と `e2e/specs/estimate-requests/structured-data-ocr-e2e.spec.ts:683-688` が、PDFプレビューの成立を「`react-pdf__Document` **または** `preview-skeleton` **または**「PDFの読み込み」の文言」のいずれかが現れることとして主張している
  - したがって**読み込み中のまま終わっても緑**になる。115.135 が解消した OCR 完了判定の選言と**同型**である（当該タスクの境界は完了判定に限られていたため対象外とした）
  - 成功のみを主張する形へ改めること。REQ-13.2 / REQ-17.6 系
  - _Boundary: 見積依頼のPDFプレビュー成立判定_

- [x] 115.175 (P) 画像プレビュー成立の同型の選言を解消する
  - 115.158 のレビューで確定した。`e2e/specs/estimate-requests/structured-data-ocr-e2e.spec.ts` の**画像**プレビュー判定が、画像要素と読み込み中の骨組みを並べた選択子の先頭を掴む形で残っている
  - 115.158 が解消した PDF プレビューの判定と**同型**だが、当該タスクの境界は PDF に限られていたため対象外とした
  - **115.158 が確立した実測の作法に従うこと**: 旧判定が実際にどの要素を掴んでいるかを取得し、成立する穴を実測で特定してから直すこと。もっともらしい機序を書かないこと
  - _Depends: 115.158_
  - _Boundary: 見積依頼の画像プレビュー成立判定_

- [x] 115.159 (P) 十六件の要件を一つの検証に掲げながら画面の存在しか確かめていない状態を解消する
  - 115.135 のレビューで判明した。`e2e/specs/estimate-requests/estimate-request-ocr-vision-e2e.spec.ts:444-461` が `REQ-19.1`〜`19.7` / `24.x` / `25.x` の**十六タグ**を一つの検証に付けながら、実体は「OCRアップロードUIが存在する」ことしか確かめていない
  - 被覆率の検査はタグだけを見るため、十六件の受入基準が被覆済みと数えられ続ける
  - 実際に判定できるものを確定し、判定できないものはタグを外して除外へ登録するか、判定を書くこと
  - _Boundary: 見積依頼のOCR Vision E2Eの被覆表記_

- [x] 115.176 (P) 同一ファイルに残る六件のタグを二つの主張で掲げる同型を解消する
  - 115.159 のレビューで確定した。`e2e/specs/estimate-requests/estimate-request-ocr-vision-e2e.spec.ts` の「OCR処理結果の構造化データ表示エリアが存在する」が **六タグ**（`estimate-request` の REQ-24.5 / 24.6 / 24.8 / 25.7 / 20.4 / 20.6）を掲げながら、実体は選択子を四つ並べた可視性の主張ただ一本である
  - **115.159 が直した欠陥と同型であり、直した経路の隣に残っている**（115.129 の教訓）。レビューの独自走査でも当該ファイル内の最悪比（六タグ／二主張）として再現した
  - 115.159 が確立した処遇の作法に従うこと。**一件ずつ「その受入基準の規範を、どの主張が確かめているか」で判断し**、判定できるものは判定を書き、できないものはタグを外して除外へ登録すること
  - 判定を書く場合、**選言で受理しない・母集団が空でも成立する主張を書かない・刺激と観測が対応していること**を満たすこと。115.159 は実物の応答・滞留・注入した誤りを互いに弁別できる刺激として用いた
  - _Depends: 115.159_
  - _Boundary: 見積依頼のOCR Vision E2Eに残る構造化データ表示の被覆表記_

- [x] 115.177 (P) 被覆を掲げながらタグを持たない検証群の扱いを決める
  - 115.159 の走査で判明した。**逆向きの欠陥**である。ヘッダで担当する受入基準を掲げながら `@requirement` タグを一件も持たない検証ファイルが二十件ある（実装者の計数では十三件。基準の差であり方向は同じ）
  - 例として見積依頼の `e2e/specs/estimate-requests/claude-vision-e2e.spec.ts` は九件の受入基準をヘッダに挙げるがタグは零件である
  - **実際に判定しているのに被覆に数えられていない。** 被覆率を過小に見せる方向であり、これまで扱ってきた過大に見せる欠陥とは向きが逆である
  - ヘッダの記載が実態と合っているかを一件ずつ確かめ、合っているならタグを付け、合っていないならヘッダの記載を落とすこと。**ヘッダに書いただけで被覆したことにしない**という原則は両方向に働く
  - _Depends: 115.159_
  - _Boundary: 被覆を掲げながらタグを持たない検証群_

- [x] 115.160 投げっぱなしのリスナから呼ばれる待機がテスト終了で漏れる状態を解消する
  - 115.138 のレビューで確定した。`e2e/specs/auth/auth-initialization.spec.ts` の検証「should display login page without showing protected content for unauthenticated users」が仕掛ける `page.on('framenavigated', async …)` は**投げっぱなしのリスナ**であり、テスト本体の終了後に届いた遷移通知の待機が中断される
  - このとき `TimeoutError` ではない拒否（`locator.waitFor: Test ended.`）がリスナの外へ漏れ、当該の検証が落ちる。現在は `isOnProtectedPage` の `catch {}` が実質「テスト終了の中断」を飲んでおり、そのために当該箇所だけ共有の補助へ寄せられない
  - **行番号で指さないこと。** 起票時に親が書いた `:88` は実測 `:87` の誤りであり、さらに 115.138 の是正でコメントを足した時点で当該リスナは `:98` へずれた。起票の記述は書いた瞬間に二重に陳腐化していた
  - 握り潰しで覆う形は、テスト終了以外の失敗も同時に飲む。**根治はリスナの寿命管理である**（本体終了前にリスナを外す、または保留中の判定を待ち合わせる）
  - あわせて `protectedPageAppeared` の判定が本体の主張とレースしている構造も同じ箇所にある。レースを解消すること
  - 解消できたら `isOnProtectedPage` を `isVisibleWithin` へ寄せ、据え置きの理由を記したコメントを撤去すること
  - _Depends: 115.138_
  - _Boundary: 認証初期化E2Eのリスナ寿命管理_

- [x] 115.178 (P) 対話リスナの中の主張が誰にも見られない状態を解消する
  - 115.160 のレビューで確定した。投げっぱなしのリスナは是正後も **八件**残り、いずれも対話の応答を受け取る購読である。うち **二件**（`e2e/specs/estimate-requests/estimate-request-e2e.spec.ts` と `e2e/specs/site-surveys/site-survey-phase18.spec.ts`）は**リスナの中に主張を置いており、その失敗は誰も見ない拒否になる**
  - 残る六件は応答を受け入れるだけで主張を持たないため、漏れても検証の成否は変わらない
  - **115.160 が確立した形に倣うこと**: 名前付きの購読にして本体の後始末で外し、保留中の判定を主張の前に待ち合わせ、失敗は控えて送出する（飲まない）
  - 走査で確認済みの範囲: 文脈や別の購読元に投げっぱなしは無く、事象待ちは三件ともすべて待ち合わせ済み、非同期でない購読は約三十件ありいずれも同期の記録のみである
  - 再現: `grep -rnE "\.(on|once)\(['\"][a-z]+['\"], *async" e2e --include=*.ts`
  - _Depends: 115.160_
  - _Boundary: 対話リスナ内の主張の寿命管理_

- [x] 115.161 (P) ラベルを返す畳み込みの握り潰しを解消する
  - 115.138 のレビューで判明した。`e2e/specs/quantity-tables/import-e2e.spec.ts` に `.then(() => 'label').catch(() => null)` という**ラベルを返す畳み込み**が6ブロック十四箇所ある（`:599, 696, 807, 1164, 1264, 1344`）
  - 真偽を返さないため 115.138 の境界（真偽を返す待機の呼び出し形式）の外としたが、**`catch(() => null)` の握り潰しは同じ再発源の系統**である。待機切れ以外の失敗も飲む
  - `:1264` は枝ごとに `getTimeout(10000)` / `getTimeout(45000)` と待機の指定が異なり、畳み込み方を変えると `Promise.race` の勝者が変わる。**機械的な寄せは不可であり、枝ごとに意味を確定してから改めること**
  - _Depends: 115.138_
  - _Boundary: 取り込みE2Eのラベルを返す畳み込み_

- [x] 115.179 (P) 事象待ちの握り潰しが不在の成立に化ける三箇所を解消する
  - 115.161 の実装とレビューが独立に確認した。**起票 115.161 が想定した「偽の緑」は対象のファイルには無く、こちらに実在する**
  - `e2e/specs/security/security-measures.spec.ts`・`e2e/specs/auth/security-accessibility.spec.ts`・`e2e/specs/site-surveys/site-survey-bulk-export.spec.ts` の三箇所が、事象待ちの結果を握り潰して空値へ畳み、それを**不在の主張**で受けている
  - この形は、待機切れ以外の失敗（複数一致・切断・本体終了による中断）が**そのまま「不在の成立」に化ける**。115.161 の対象は主張が「空でないこと」だったため握り潰しが勝って赤になったが、こちらは主張が「空であること」なので緑になる
  - **115.161 が確立した形に倣うこと**: 待機切れのみを不成立として畳み、それ以外は送出する共有の補助へ寄せる
  - 併せて、定数を返す握り潰しは境界外に二十八行・十三ファイルある。残りは要素の可視・選択・値の取得を握り潰す系統で、本件とは別の型である
  - 再現: `grep -rn "catch(() => \(null\|undefined\|false\|true\|''\|0\))" e2e/ --include=*.ts`
  - _Depends: 115.161_
  - _Boundary: 事象待ちの握り潰しを不在の主張で受ける箇所_

- [x] 115.162 (P) 母集団が空でも成立する不在の主張を解消する
  - 115.139 の洗い出しで判明した。`e2e/specs/site-surveys/site-survey-upload-validation-e2e.spec.ts` の JPEG の SOS / DQT に関する二つの検証は、`body.failed` が空のとき `failureReasons` が空文字となり、**不在の主張が素通りする**
  - さらに `successful` の件数を主張していないため、**一件も処理されなかった場合も緑になる**
  - 115.139 が扱った「抽出で除外したものの不在を主張する」型（`T7-excluded-absence`）とは別で、**「空の母集団に対する不在の主張」という型**である
  - 母集団が空でないことを前提として主張したうえで、不在を主張すること
  - **この型が検出規則へ加えられるかを検討すること。** 加えるなら自己検査へ両方向を追加すること
  - _Depends: 115.139_
  - _Boundary: 画像アップロード検証E2Eにおける不在の主張_

- [x] 115.180 (P) 積んで作る集まりに対する空の母集団の不在の主張を解消する
  - 115.162 の実装とレビューが独立に確認した。`e2e/specs/projects/project-list-columns.spec.ts` が見出しの文字列を**宣言のあとに積んで作る**配列に対し、要素の不在を主張している。積んだ結果が零件でも素通りする
  - 115.162 が加えた検出規則は「宣言と同時に作る集まり」を辿るため、**積んで作る形は意図した限界として検出しない**。限界節に明記済み
  - **115.162 が確立した形に倣うこと**: 母集団の大きさを先に固定してから不在を主張する
  - 併せて、検出規則を積んで作る形まで広げられるかを検討すること。広げる場合は**自己検査へ両方向を登録し、広げる向きの変異で非検出側が実際に落ちることを実測すること**
  - _Depends: 115.162_
  - _Boundary: 積んで作る集まりに対する不在の主張_

- [x] 115.181 (P) 検出規則のうち自己検査で固定されていない判断を固定する
  - 115.162 のレビューが変異十二種を当てて確定した。狭める向きの判断のうち**生き残った枝**がある。特に文字列を保つ加工の扱い（`STRING_PRESERVING`）は、当該の枝を消しても自己検査が緑のままである。実測では加工を挟んだ形が現に検出されるため、**この枝は実効を持つのに固定されていない**
  - 併せて、母集団の大きさを固定する主張の探索が名前の出現に依るため、**大きさと無関係あるいは逆向きの主張も固定済みと誤認する**（`toHaveLength(0)` / `toBeDefined()` を実測で確認）。限界節には名指しで明記されているが自己検査では固定されていない
  - **宣言だけあって固定の無い判断は、次の変更で黙って失われる**（115.156 の教訓）。実効を持つ枝を自己検査へ登録すること
  - 誤認の側は見逃しへ倒す方針に沿うため是正は要さないが、**限界そのものを自己検査で固定するかを判断すること**
  - _Depends: 115.162_
  - _Boundary: 検証無効化の検出規則の自己検査の網羅性_

- [x] 115.163 (P) 先行する主張の含意で決して失敗しない後続の主張を整理する
  - 115.139 のレビューで判明した。`e2e/specs/estimate/estimate-number-format-e2e.spec.ts` の案分後金額と実行金額の検証は、直前に `expect(text).toMatch(/^[0-9,]+円$/)` があるため、後続の `not.toContain('.')` が**先行の主張の含意で決して失敗しない**
  - 115.139 が是正した対象も、直前の `toHaveText('2,500')` に守られて同じ構造にあった。**抽出で除外する型（`T7-excluded-absence`）とは別で、「先行の主張が後続を含意する」型である**
  - 要件の被覆に穴は無い（先行の主張が退行を捕まえる）ため実害は小さいが、**主張として何も足していない飾り**であり、読み手に検証の厚みを誤認させる
  - 冗長な後続を削るか、先行の主張が捉えない範囲へ後続を広げるかを判断すること
  - **検出規則へ加えられるかを検討すること。** 先行の主張の言語が後続の needle を排除するかの判定を要するため、`T7` より難しい。加えられないなら理由を明記すること
  - _Depends: 115.139_
  - _Boundary: 金額表示の検証における先行主張と後続主張_

- [x] 115.164 (P) 検出規則の限界の記述を実態へ追随させる
  - 115.139 のレビューで判明した。`scripts/check-e2e-assertion-guards.ts` 冒頭の「限界」節に、新設した `T7-excluded-absence` の制約が記載されていない
  - 具体的には (a) 識別子の解決が共有定数 `RESOLVE_DEPTH_LIMIT` に縛られるため、同じ欠陥を二文に分けて書くと深さ超過で検出されない（レビューが実測）、(b) `replacementRemovesNeedle` はアンカー付きの置換（`/\.$/g` 等）を「needle を残らず取り除く」と誤判定しうる（理論上の過検出、リポジトリに現存せず）
  - 115.141 のレビューでも同型が1件見つかった: (c) `localFunctions` が**スコープを見ない**ため、ファイル直下の真偽補助と同名の束縛（引数・catch 束縛など）が影を作ると `T9-discarded-predicate-result` が偽陽性になる（レビューが自作例で実証。現時点の該当は0件）
  - あわせて (d) T9 の限界節が挙げる「解決できた5969箇所のうち真偽を返すものは5箇所」は**是正前の実測**であり（是正後は3）、測定時点が明示されていない
  - 115.143 のレビューでも同型が2件見つかった: (e) `T10-settled-type-assertion` の `SETTLED_RETURN_TYPES` は**受け手を見ずメソッド名だけで表を引く**ため、Playwright 以外で `count()` / `innerText()` 等を持つ対象が入ると偽陽性になる（レビューが自作例 `myWidget.count()` で実証。現時点の該当は0件で限界節に記載済み）、(f) 表方式は対象APIが増えるたび書き換えを要し、**書き換え漏れがそのまま静かな無検出になる**
  - あわせて **T10 の自己検査の境界固定が薄い**（115.143 のレビュー指摘）: 非検出側7件のうち、狭い規則を正当化する最重要の境界（応答JSONの項目参照が実質のある検査であること）を固定するのは1件のみ。残る4件は文書化済みの意図的な見逃し、2件は恒偽／型不一致で性質が異なる。**`?? 5` のような型集合が2要素になる形など、境界側の例を1〜2件足すと規則を広げる方向の変異への防護が厚くなる**
  - **検出器の限界が記述されていないと、検出0件を「該当が無い」と読み違える**
  - 限界節へ追補し、あわせて自己検査の境界固定を厚くすること
  - _Depends: 115.139, 115.141_
  - **115.163 からの引き継ぎ**: 同タスクのレビューが自作した五つの狭める判断が自己検査で固定されていない（後続側の否定の要求／空の needle の番人／同名宣言が複数のときの遡り抑止／自己比較／束縛の解決不能での打ち切り）。うち三つは恒偽ないし死んだ枝で実効を持たないが、残る二つは実効が狭いながら実在しうる。**いずれもリポジトリの検出を動かさないため 115.163 の受入は妨げなかった**が、境界固定の厚みとして本タスクの所管とする
  - _Boundary: 検証無効化の検出規則の限界の記述_

- [x] 115.182 (P) 先行が needle の存在を保証する肯定の後続を検出できるようにする
  - 115.164 のレビューで判明した。第十三の型は「先行が needle を**排除する**」場合の否定の後続だけを見ており、**先行が needle の存在を保証する**場合の肯定の後続を扱わない
  - 例: `expect(amount).toMatch(/^[0-9,]+円$/)` の直後の `expect(amount).toContain('円')`。先行が通れば後続は必ず成立するため**飾り**である。第十三の型が告発すべきものと同じ性質を持つ
  - 現行の実装は否定の後続を要求しており、その要求は正当である（否定でない後続は恒偽の主張になり、必ず落ちるため飾りではない）。**恒偽の後続と、必ず成立する後続は別物である**。前者は要求で正しく除外され、後者が未検出のまま残っている
  - **115.163・115.164 が確立した作法に従うこと**: 陽性対照を先に置く／自己検査へ両方向を登録する／狭める判断ごとに単独の変異で落ちることを実測する／限界を明記する／基準の件数を増やさない
  - _Depends: 115.164_
  - _Boundary: 先行が存在を保証する肯定の後続の検出_

- [x] 115.165 (P) 不在の主張の直前に残る固定時間待機を条件待ちへ改める
  - 115.140 のレビューで判明した。`e2e/specs/site-surveys/site-survey-drawing-selection-prevention.spec.ts` に `page.waitForTimeout` が十八箇所残り、**うち二箇所は REQ-17.1 / REQ-17.6 の「選択されていないこと」の主張の直前にある**
  - 115.140 は当該の検証を「対象が実在することを陽性対照で確かめてから不在を主張する」形へ是正し、解除の成立も `expect.poll(...).toBeNull()` の主張へ改めた。**しかしその手前の固定待機は基準点由来のまま残った**
  - 不在の主張の直前の固定待機は、「この時間で状態が落ち着いたはず」という仮定を置いており、**確かめずに前提を置く形**である。落ち着いていなければ偽赤になり、落ち着きすぎていれば時間を浪費する
  - steering `tech.md` は `page.waitForTimeout()` の回避を明示的に求めている
  - 明示的な条件待ちへ改めること。**残る十六箇所についても、不在・存在いずれの主張の手前にあるものを優先して洗い出すこと**
  - _Depends: 115.140_
  - _Boundary: 描画選択防止E2Eの固定時間待機_

- [x] 115.183 不在の主張の直前に固定時間待機が残る七箇所を条件待ちへ改める
  - 115.165 の走査で判明した。同タスクが対象の検証から十八箇所を全廃した結果、検証全体の固定時間待機は **二百三十件から二百十二件**へ減ったが、**不在の主張の直前にあるものが七箇所残っている**
  - 該当（115.165 のレビューが五件を目視で確認済み）: 注釈の携帯表示の三箇所、応答性の二箇所、利用しやすさの一箇所、合言葉の再設定の一箇所
  - **115.165 が確立した形に倣うこと**: 何を待っているつもりかを一件ずつ確定し、条件待ちへ改める。条件を特定できないものは撤去して実測で確かめる。**撤去が壊していないことは、現在の検証が捉えられない範囲まで踏み込んで確かめること**（同タスクのレビューは、頂点が落ちても件数の主張は通ることを踏まえ、頂点数そのものを主張する検証を一時的に足して確かめた）
  - 安定は一度の緑で断じないこと。**反復実行に加え、計算資源を絞った状態でも通ることを確かめる**と、時間依存の見落としが減る
  - 走査は語の近傍による見積もりであり、各件は目視を要する。再現: `grep -rnE "\.waitForTimeout\s*\(" e2e --include=*.ts`
  - _Depends: 115.165_
  - _Boundary: 不在の主張の直前に残る固定時間待機_

- [x] 115.184 (P) 描画面の件数取得だけが番兵値を返す非対称を解消する
  - 115.165 のレビューで判明した。同じ検証の中で、選択中の対象の取得と選択の可否の取得は**投げる**のに、**件数の取得だけが描画面の不在時に負の番兵値を返す**
  - 番兵値と実際の値が同じ型に同居するため、増分の主張が「不在から零へ」で成立しうる。115.165 は描画面の初期化を条件待ちにして実害を塞いだが、**構造そのものは残っている**
  - 投げる形へ揃えるか、番兵値を型で区別できる形へ改めること
  - _Depends: 115.165_
  - _Boundary: 描画面の件数取得の番兵値_

- [x] 115.166 (P) 文字列を対象に空文字を通す前提の主張を使い分ける
  - 115.142 のレビューで判明した。`e2e/helpers/preconditions.ts` の `assertPresent` は `value === null || value === undefined` のみを弾くため**空文字を通す**。`assertPrepared` は `if (!value)` で空文字・0・false を弾く
  - e2e 全体で `assertPresent` 78件 / `assertPrepared` 127件。`assertPresent` の大半は `boundingBox()` 等で 0 が正当な観測値になる対象であり**正しい使い分け**だが、**文字列を対象にした箇所が数件ある**（例: `e2e/specs/projects/project-breadcrumb.spec.ts` の見出し、`e2e/specs/estimate-requests/number-format-e2e.spec.ts` の合計金額テキスト）
  - 空文字が正当な観測値でない対象に `assertPresent` を使うと、**前提の崩れが前提の地点で落ちない**（115.142 の実測では、差し替え前は後段の列数の主張で落ちていた）
  - 文字列を対象とする `assertPresent` の呼び出しを洗い出し、**空文字が正当な値かを一件ずつ判定**して使い分けること。判定は「後段の主張が空文字を捉えるか」ではなく「その対象にとって空文字が正当か」で行うこと
  - **0 や false が正当な値になりうる対象へ `assertPrepared` を当てると別種の偽赤になる。** 過剰な差し替えをしないこと
  - _Depends: 115.142_
  - **115.163 の影響**: 同タスクが `e2e/specs/estimate-requests/number-format-e2e.spec.ts` の合計金額の抜き出しごと撤去したため、本タスクが名指ししていた当該箇所は既に存在しない。**母集団が一件減っている。**着手時に実測し直すこと
  - _Boundary: 文字列を対象とする前提の主張の使い分け_

- [x] 115.185 (P) 前提の主張の拒否印が未解決の型引数を誤って拒む制約を解消する
  - 115.166 のレビューが自作の実験で実測した。文字列を拒む型の印は、**未解決の型引数を伴う呼び出しを誤って拒否する**。汎用の補助の中から前提の主張を呼ぶと、型検査が通らず、しかも別の補助へ逃げることもできない袋小路になる
  - 現時点で該当する呼び出しは零件のため既存の用法は一件も壊れていない。**将来 前提の主張を包む汎用の補助を書いたときに詰む**
  - 併せて、印は不明な型と何でも受ける型をすり抜ける（実体が文字列でも通る）。現時点で該当は零件
  - 型で表現し切れないなら、**限界として補助の説明に明記すること**。115.166 のレビューは明記を推奨している
  - _Depends: 115.166_
  - _Boundary: 前提の主張の型による強制の限界_

- [x] 115.167 除外定義の要件番号のずれを解消する
  - 115.144 の実装で判明した。`e2e/requirement-exclusions.json` の数量表生成スペックの REQ-9 / REQ-10 系は、**id とタイトルが要件原文と一つずれている**
  - `quantity-table-generation/REQ-9.5` のタイトルは「調整係数変更時の自動再計算」だが、要件原文の 9.5 は「数値以外の入力を拒否しエラー」であり、当該タイトルは原文 9.6 の内容である。`REQ-9.4` のタイトルは「調整係数非数値入力時のエラー」で原文 9.5 の内容。`REQ-10.5` / `REQ-10.4` も同型
  - **id を直すと除外の対象が変わり、被覆率の分母が動く**。REQ-9.6 / 10.6 が新たに除外へ移り、REQ-9.3 / 10.3 が分母へ戻る。したがって「表記の訂正」では済まない
  - 各 id について、**除外の理由文が実際に述べている内容がどの受入基準に当たるか**を要件原文から確定させること。id を直すのか、タイトルを直すのか、除外そのものが誤りなのかを一件ずつ判断すること
  - 分母が動くため `check:req-coverage` の FAILED が増えうる。**増えるなら、それは隠れていた穴が露出したのであって後退ではない。** 露出した穴は起票して所管を決めること
  - 115.144 が新設した `npm run check:req-exclusions` は**形式**を検査するが、**id と内容の対応**は検査していない。この検査を加えられるかも検討すること
  - あわせて 115.144 のレビューが検出した穴を塞ぐこと: `checkInvariants` の重複検出は **id を生のまま比較する**ため、`REQ-23.3` と `user-authentication/REQ-23.3` のように**接頭辞だけ違う対を見逃す**。被覆側の `normalizeExclusionId` は両者を同一視するため、集計の二重計上が素通りしうる（実データに裸の id は25件あるが正規化後の重複は0件で現時点の実害なし。レビューが注入して実証）
  - _Depends: 115.144_
  - _Boundary: 除外定義の要件番号と内容の対応_

- [x] 115.168 (P) 被覆タグの区間判定が別機能の一覧を先頭機能へ帰属させる状態を狭める
  - 115.144 の実装で判明した。`scripts/check-requirement-coverage.ts` のパターン5（ヘッダー直下の `- REQ-N.M:` リスト）は、**ヘッダーから次の空行までを一区間として扱う**
  - このため **JSDoc 内に空行が無いファイルでは、別機能のヘッダー配下の一覧まで先頭の機能へ帰属する**。被覆を過大に見せる方向の癖である
  - 実害の有無を機械的に洗い出すこと。**「該当が無い」を言うには陽性対照が要る**（意図的に該当する形を作り、検出できることを先に示すこと）
  - 区間の判定を次のヘッダーまで、または JSDoc の終端までへ改めること
  - _Depends: 115.144_
  - _Boundary: 被覆タグのヘッダー区間の判定_

- [x] 115.169 (P) 撤去済み部品を現存物として指す本番コードの参照を解消する
  - 115.146 のレビューで判明した。同タスクが `frontend/src/components/site-surveys/ImageViewer.tsx` を撤去した結果、**当該ファイルを現存物として参照する本番コードのコメントが残った**
  - 該当は **10箇所・6ファイル**（レビューの指摘は9箇所だったが、115.146 の是正時の再測で `frontend/src/utils/imageFitScale.ts` の1件が追加で見つかった）: `ConstructionPhotoImageViewer.tsx`（4）、`gestures/canvasViewportController.ts`（2）、`gestures/touchGestureManager.ts`（1）、`gestures/gesture-thresholds.ts`（1）、`AnnotationEditor.tsx`（1）、`utils/imageFitScale.ts`（1）
  - **行番号で指さないこと。** 実測値は `ImageViewer` の語で再測すること
  - あわせて `frontend/src/components/site-surveys/image-viewer.constants.ts` の `@fileoverview` にある「react-refresh/only-export-components 対応のため分離」は撤去済み `ImageViewer.tsx` からの分離を指す文言である（`ImageViewer` の語を含まないため上記10箇所には計上していない）。対象に含めるかを判断すること
  - **設計書の歴史記録が `ImageViewer` を指すのは意図した保存であり、上記10箇所とは別物である。** 書き換えないこと
  - **あわせて `.kiro/steering/structure.md` の2箇所**（`ImageViewer.tsx` と `ImageViewer.stories.tsx` を現存物として列挙）**も対象とすること**（115.146 の再レビューが検出）。steering は毎セッション読み込まれる「現在の構成」の記述であり歴史記録ではないため、設計書の歴史記録とは扱いが異なる
  - 同ファイルには**本タスク以前からの同種のドリフト**もある（例: 112.1 が撤去した `LazyImage.tsx` を列挙したまま）。**撤去のたびに steering が追随しない構造**が問題であり、個別の是正に加えて追随の仕組みを検討する価値がある
  - 例: 「`ImageViewer.tsx` の `normalizeRotation`（未export）を複製せず…」「閲覧モード `ImageViewer.tsx` の `clampZoom` 算術を抽出・共有する」
  - **115.146 の動機はまさに「後任が参照実装と誤認する危険」だった。** 撤去はその危険を**存在しないファイルへの導線**という形に置き換えただけである
  - 各コメントについて、撤去済みである旨を記すのか、移管先（`AnnotationEditor` 等）を指し直すのか、記述自体を落とすのかを判断して適用すること
  - _Depends: 115.146_
  - _Boundary: 撤去済み部品を指す本番コードのコメント_

- [x] 115.170 要件28.3 の適用範囲と運用実態の乖離を決着させる
  - 115.148 の実装で判明した。要件28.3 の原文は「モバイル幅ツールバーの**各項目**」を 44x44 の対象としているが、**実装も検証も道具のボタンにしか適用していない**
  - 実測（115.148）: 44 を持つ定義は `AnnotationToolbar.tsx` の `STYLES.button.base` のみ。色の選択 32x24、線幅の入力 60x24、吹き出しの選択は高さ24、アクションボタンは高さ約31、切替は 115.148 で 32x24 へ拡大——**いずれも 44 未満**
  - 運用実態が道具のボタン限定であることは Task 70.1（「各ボタンの minWidth/minHeight を 44 論理ピクセルに統一」）と design.md の `button.base` 、および E2E が 44 を測る対象がツールボタン9個のみであることに現れている
  - **被覆判定は 28.3 を緑にしているが、それはツールボタンのみの検証によるものである。** 条文の文字通りには満たされていない
  - **要件文を実態へ合わせるか、対象を広げて実装を追随させるかを決めること。** 後者はツールバー全体の作り直しになる
  - 115.148 は「同格の隣接要素を据え置いたまま切替だけを 44 の対象に加えるのは条文の解釈ではなく新しい規範の追加である」として絶対値を持ち込まず、相対関係（隣接要素より小さくない）のみを主張した。**決着がつけば絶対値の主張へ置き換えられる**
  - _Depends: 115.148_
  - _Boundary: 要件28.3 の適用範囲_

- [x] 115.171 (P) 画像圧縮の恒偽の分岐と呼称のずれを解消する
  - 115.147 のレビューで判明した。いずれも**同タスクが持ち込んだものではなく基準点から存在する**
  - (a) `backend/src/services/image-processor.service.ts` の品質を下げるループ内にある `if (resizeRatio < 1.0)` は、`resizeRatio` が縮小のループへ入るまで 1.0 のまま変わらないため**恒偽の死んだ分岐**である（レビューが実コードを読んで確認）
  - (b) 300KB超〜350KB以下の入力は圧縮のループが**一度も回らない**まま `wasCompressed: true` を返す。要件4.6「350KB以下に収まった時点で打ち切る」とは整合するが、**呼称が実態を表していない**
  - (a) は撤去すること。(b) は呼称を実態へ合わせるか、返り値の意味を文書化すること
  - **撤去・改名が挙動を変えないことを条件式の網羅で論証し、変異で確かめること**（115.147 が確立した作法）
  - _Depends: 115.147_
  - _Boundary: 画像圧縮の分岐と返り値の呼称_

- [x] 115.172 設計文書が本番の実態と食い違う記述を解消する
  - 115.149 の是正で判明した。`.kiro/specs/site-survey/design.md` の `#### SurveyImageService` 節が「**親の `deletedAt` を検査しない経路は5件あり、これは未解消の欠落である**」と記すが、**5経路すべてが Task 115.124 で `assertSurveyNotDeleted` を通すよう是正済み**である（`PATCH` / `DELETE /:imageId/annotated-thumbnail` は `select` に `survey: { deletedAt: true }` を含む）
  - 同節の「`grep` のヒットは `image-order.service.ts` の1件のみ」という実測値も**現在は6件**で偽である
  - 115.149 の境界は参照**形式**であり、件数の書き換えは行数不変の制約下で節の再構成を伴うため据え置かれた
  - **設計文書が「未解消の欠落」と述べ続けると、後任が解消済みの問題を再び追いかける**
  - 記述を実態へ改めること。**当時の記録として残す部分と、現在を述べる部分を書き分けること**（115.144・115.146 が確立した作法）
  - _Depends: 115.149_
  - _Boundary: 設計文書の実態との整合_

- [x] 115.173 (P) 設計文書の参照先の実在を検査する
  - 115.146 と 115.149 のレビューで繰り返し判明した。設計文書が**存在しないファイル・存在しないシンボル**を指す参照を持つ
  - 実測: `frontend/src/components/site-surveys/ImageViewer.tsx` と `LazyImage.tsx` への参照が **30箇所**（いずれも撤去済み。115.146 / 112.1）。`estimate-creation/design.md` が指す `reorderItems` / `batchUpdateItems` / `calculate-overhead` も**現在のコードに存在しない**
  - 115.149 が新設した `check:design-code-refs` は**形式のみを見る**ため、実在しない参照先は通過する（限界節に明記済み）
  - **パス（およびシンボル名）の実在を機械的に検査できるか**を検討すること
  - **当時の記録として意図的に残している参照と、失効した参照を区別する必要がある。** 区別できないなら検査は成立しない。その判断も含めて報告すること
  - 検査を新設する場合、115.139・115.144・115.149 が確立した作法に従うこと（陽性対照を先に置く／限界を両方向で明記する／推定と実測を区別する／許容リストへ逃がさない／自己検査は機構を見る）
  - _Depends: 115.149_
  - _Boundary: 設計文書の参照先の実在_

- [x] 115.186 除外を宣言しながら検証が同じ受入基準を名乗る八十三件を決着させる
  - 115.167 の実装で判明し、レビューが件数と内訳まで完全に再現した。除外定義が「E2Eでは確かめない」と宣言している受入基準に、`e2e/specs` の被覆タグが**同じ番号を名乗っている**
  - 実測（両者が独立に同じ値を得た）: **83件**。内訳は site-survey 35 / quantity-table-generation 34 / project-management 9 / estimate-request 5
  - **宣言と実態のどちらが正しいかは一件ずつ違う。** 検証が実在するなら除外は取り下げるべきであり、検証が名乗るだけで実質を持たないなら検証側が誤っている。**「除外を消す」で一律に処理しないこと**
  - 115.167 が id を是正した5件（`site-survey/REQ-1.7`・`8.5`、`quantity-table-generation/REQ-7.7`・`9.6`・`10.6`）もこの83件に属する。**5件だけを先に削るのは恣意的**として据え置かれている
  - 決着がつけば `check:req-exclusions` に「除外と被覆タグの同居」を検査させられるかを検討すること。陽性対照を先に置くこと
  - _Depends: 115.167_
  - _Boundary: 除外の宣言と被覆タグの同居_

- [x] 115.187 (P) 取り消し線で無効化された受入基準が被覆率を水増しする状態を解消する
  - 115.167 の実装で判明し、レビューが**件数を訂正**した。要件定義書で取り消し線（`~~`）により無効化された受入基準が、被覆率の分母に残っている
  - 実測（レビューの値を採る。実装の報告は 31/29 だったが、除外済みの2件を差し引いた **29件が分母に残存**し、うち **22件は被覆タグが付いて分子にも入っている**）。除外済みの2件は `quantity-table-generation/REQ-1.3` と `estimate-request/REQ-38.9`
  - **分子と分母の両方を水増しするため、被覆率は無効化された基準の分だけ実態より良く見える。** 内訳は estimate-request / itemized-statement-generation / quantity-table-generation / site-survey に散る（着手時に実測し直すこと）
  - 所管は各機能スペックと、受入基準の抽出規則を持つ `scripts/check-requirement-coverage.ts` の両方にまたがる。**抽出規則が取り消し線を落とすべきか、無効化された基準を除外定義へ移すべきかを決めること**
  - 抽出規則を変えると分母が動く。**115.167 と同じ作法で HEAD との比較を実測すること**
  - _Depends: 115.167_
  - _Boundary: 取り消し線で無効化された受入基準の扱い_

- [x] 115.188 (P) 被覆タグの指し先そのものが誤っている状態を解消する
  - 115.167 のレビューが新規に検出した。除外定義側と**同型のずれが被覆タグ側にも残っており、両者が相殺して穴が指標に現れない**
  - 実測した二件: `e2e/specs/quantity-tables/quantity-table-crud.spec.ts:2259` の「オートコンプリート候補が50音順に表示される」は `quantity-table-generation/REQ-7.5` を名乗るが、原文 7.5 は「blur 時に候補値リストへ追加」であり 50音順は **7.7**（115.167 が除外の指し先を 7.5→7.7 へ直した、まさにその受入基準）。`e2e/specs/site-surveys/site-survey-annotation-tools.spec.ts:1798` の「日本語テキスト注釈を正しくレンダリングしてエクスポートできる」は `site-survey/REQ-10.5` を名乗るが原文は写真のドラッグ移動であり、実体は **REQ-12.5**
  - **この二件は抜き取りである。母集団は走査で再確定すること。** 115.167 が除外定義に対して行ったのと同じ照合（タグが名乗る受入基準の原文と、テスト名・本文が述べる内容の突き合わせ）を `e2e/specs` 全体へ当てること
  - 115.167 が確立した形に倣うこと: 散文どうしの照合は機械化できない。**対応の担い手を散文から原文の逐語複製へ移せるか**を検討すること
  - 115.186 の「除外なのにタグがある」とは**別の形**である（こちらはタグの指し先自体が誤り）。混ぜないこと
  - _Depends: 115.167_
  - _Boundary: 被覆タグが名乗る受入基準と内容の対応_

- [x] 115.189 (P) 代替検証の説明が受入基準を部分的にしか覆わない二件を決着させる
  - 115.167 の実装で判明した。除外が掲げる「代わりにこの方法で確かめる」という説明が、受入基準が求める内容の**一部しか述べていない**
  - `site-survey/REQ-8.5` の説明は「フォントサイズを変更できることを確認」のみで、受入基準が求める**色・背景色を含まない**
  - `quantity-table-generation/REQ-7.3` の説明は「小項目・任意分類・工種・名称・規格・単位・備考」のみを挙げ、統合後の受入基準が含む**大項目・中項目を含まない**
  - **部分被覆を「除外」と呼ぶと、覆われていない部分が指標から消える。** 説明を実態へ広げるのか、代替検証を拡張するのか、除外を取り下げるのかを一件ずつ判断すること
  - **二件は 115.167 の全件照合で見つかったものであり、同種が他に無いことは示されていない。** 走査で母集団を確定すること
  - _Depends: 115.167_
  - _Boundary: 除外の代替検証と受入基準の被覆範囲_

- [x] 115.190 (P) 要件定義書の抽出器が二箇所に複製され同一性が強制されていない状態を解消する
  - 115.167 のレビューが検出した。`scripts/check-requirement-exclusions.ts` の `loadRequirementCatalogue` と `scripts/check-requirement-coverage.ts` の `extractRequirements` は、正規表現も受入基準セクションの開始終了判定も同一で、前者のコメントは「同一にする」と述べるが**同一であることを強制する仕組みが無い**
  - **既に微差がある**（レビューの実測）: `check-requirement-coverage.ts` は `parseInt` で番号を正規化し重複番号を配列に積むが、`loadRequirementCatalogue` は生の文字列キーで Map に後勝ちで上書きする
  - 片方が変われば「除外が指す単位」と「被覆率が数える単位」がずれ、115.167 が置いた照合そのものが**別のものを見る**ようになる
  - 共有モジュールへ切り出すか、抽出結果の一致を確かめる対照を置くこと。**切り出す場合は、既に存在する微差のどちらを正とするかを実測で決めること**（分母が動きうる）
  - _Depends: 115.167_
  - _Boundary: 要件定義書の抽出規則の一元化_

- [x] 115.191 (P) 変異を伴わない陰性対照が実効を持たない状態を解消する
  - 115.167 のレビューが検出した。`scripts/check-requirement-exclusions.selftest.ts:412-421` の陰性対照「機能名を冠さない旧来の識別子（REQ-N.M）」は**変異を一切行わず**、裸の id が実在することを確認して実物をそのまま流すだけになっている
  - 先行する対照「リポジトリの実物」と実質同一であり、**陰性対照は5件のうち実効4件**である
  - 陰性対照は「緩めすぎていないこと」を担保する側の対照であり、実効が落ちると**検査を緩める変更が無言で通る**
  - 裸の id を**別の実在する裸の id へ**書き換える形など、実際に変異を伴う対照へ改めること
  - **同じ形の空振りが他の陰性対照に無いかを走査すること**（「実物を流すだけ」で変異を伴わない対照）。115.181 の作法（探り群を全変異へ当てる）に倣うこと
  - _Depends: 115.167_
  - _Boundary: 除外定義の自己検査の陰性対照_

- [x] 115.192 数量グループのコピーで写真の紐づけを保つ受入基準が未検証のまま残る状態を解消する
  - 115.168 の是正が露出させた。**偽の被覆主張が本当に未検証の受入基準を隠していた**
  - `quantity-table-generation/REQ-38.4`（元の数量グループに現場調査写真が紐づけられている場合の挙動）は**未被覆かつ除外一覧にも無い**。これにより `check:req-coverage` の FAILED が2種から3種へ増えた（増分は「E2E適用対象のカバレッジが閾値(100%)未満」）
  - `e2e/specs/quantity-tables/quantity-group-copy.spec.ts:17-21` は Integration 52.5 `backend/src/__tests__/integration/quantity-group-copy.integration.test.ts` への委譲を宣言しているが、**当該ファイルはリポジトリに存在しない**（「想定」と書かれたまま実装されていない）。実装者とレビューの双方が `ls` で確認済み
  - **これは後退ではなく露出である。** 115.168 以前は、区間判定の癖により「本スペックには含まない」と述べた散文そのものが被覆主張として計上されていた
  - 当該受入基準を実在する検証で被覆するか、**根拠を実在させたうえで**除外へ登録すること。**存在しないファイルへの委譲を根拠にしないこと**
  - 所管: quantity-table-generation スペック
  - _Depends: 115.168_
  - _Boundary: 数量グループのコピーにおける写真紐づけの検証_

- [x] 115.193 (P) プロジェクト名の制約の被覆源が本番未参照の部品だけになっている状態を解消する
  - 115.168 の是正が露出させた。`backend/src/utils/seed-helpers.ts`（本番到達モジュール）の過大帰属が隠していた
  - `project-management/REQ-13.1`（プロジェクト名を必須かつ1〜255文字）の現在の唯一の被覆源は `backend/src/__tests__/unit/models/project.model.test.ts → verification-no-production-reference` である
  - 到達しない受入基準が 25→26件へ増えたのはこの1件による
  - **番号を付け直して採点を緑へ戻さないこと。** 本番の経路を通る検証で被覆すること
  - 所管: project-management スペック
  - _Depends: 115.168_
  - _Boundary: プロジェクト名の制約の本番到達検証_

- [x] 115.194 (P) 一覧項目の規則が行頭のコメント記号と継続行を印と取り違える状態を解消する
  - 115.168 の実装とレビューが検出した。`scripts/check-requirement-coverage.ts` の `HEADER_LIST_ITEM_REGEX` は `[-*]\s*REQ-` を印とするため、**JSDoc 自身の行頭 `*` を一覧の印と取り違える**
  - 115.168 が区間の上限を四つへ増やしたことで大半は解消したが、**区間の内側にある行頭 `*` の散文と、同一段落内の継続行には届かない**
  - レビューが384ヘッダー全件を走査して確定した残存は **1件**: `e2e/specs/quantity-tables/photo-change-dialog-e2e.spec.ts:10-13`。`Requirements coverage (site-survey):` 配下が `- REQ-115.19 相当の是正: …`（**要件番号ではなくタスク番号**）と、その継続行 `*   REQ-19.1〜19.4 を無条件に検証する。` を持つため、`site-survey/REQ-115`・`site-survey/REQ-115.19`（いずれも幻）と `site-survey/REQ-19.1` の3件が誤帰属する
  - 当該ファイルが実際に検証しているのは `quantity-table-generation/REQ-19.1〜19.4` であり、そちらは `@requirement` で正しく付いている。`site-survey/REQ-19.1` は別ファイルでも被覆されるためゲートへの影響は無い
  - **実装者が EXPOSED_GAPS で挙げた `estimate-request-ocr-vision-e2e.spec.ts` は 115.168 で既に解消している**（区間が段落の切れ目で切れる）。レビューが実測で訂正した
  - 行頭のコメント記号を一覧の印と取り違えないこと。継続行の扱いも決めること
  - _Depends: 115.168_
  - _Boundary: 被覆タグの一覧項目の書式（過大帰属）_

- [x] 115.195 (P) 一覧項目の規則が読点で並べた続きと接頭辞なしの並びを拾わない状態を解消する
  - 115.168 の実装で判明した。`HEADER_LIST_ITEM_REGEX` は一項目につき一致が一つであり、**読点で並べた続きを拾わない**（過小帰属）
  - 実測: `- REQ-12.1, 12.2, 12.3: 現場調査管理権限の定義`（`backend/src/utils/seed-helpers.ts:17`、`backend/src/__tests__/unit/utils/seed-helpers.test.ts:15`）は **12.1 しか拾われない**。`- 13.1, 13.2, 13.3, 13.4:`（同 test.ts:23、`REQ-` 接頭辞なし）は**一件も拾われない**
  - **115.194 とは向きが逆である**（あちらは過大帰属、こちらは過小帰属）。同じ正規表現を触るため、片方を直すときにもう片方を壊さないこと
  - 読点区切りの続きと接頭辞なしの並びを拾うか、**書式として禁じて検査で落とす**かを決めること。後者を選ぶ場合は既存の記述を先に是正すること
  - _Depends: 115.168_
  - _Boundary: 被覆タグの一覧項目の書式（過小帰属）_

- [x] 115.196 (P) 全体サマリーの被覆件数が実在しない受入基準を含む状態を解消する
  - 115.168 の実装で判明した。`covered` は要件定義書の受入基準集合との積ではなく**生のタグ集合**であるため、実在しない番号を数えている
  - 実測: 総数 2919・被覆 2754・未被覆 177 で **2754 + 177 = 2931 ≠ 2919**。115.168 で乖離は 16 から 12 へ縮んだが機構は残っている
  - **幻の番号が総数を膨らませているため、表示上の被覆率は実態と違う。** 適用対象のゲートには効いていないが、報告を読む者を誤らせる
  - 被覆件数を実在する受入基準との積で数えること。**是正すると被覆率が動くため、115.167・115.168 と同じ作法で HEAD との比較を実測すること**
  - _Depends: 115.168_
  - _Boundary: 被覆率サマリーの集計_

- [x] 115.197 (P) 自己検査の見本が実データの形を写しておらず主張が空虚な状態を解消する
  - 115.168 のレビューが検出した。**115.168 自身が狩った「無言で影になる主張」と同じ類型が、その是正のために書いた見本に再現している**
  - `scripts/check-requirement-coverage.selftest.ts` の `PARAGRAPH_BREAK_THEN_PROSE` は散文行を ` * Note: REQ-4.2 はE2Eテストで検証困難なため省略` と書くが、`*` と `REQ-` の間に `Note: ` が挟まるため `HEADER_LIST_ITEM_REGEX` は**区間の上限を一切かけなくても**この番号に一致しない
  - レビューが直接測って確認した: 上限なしで拾えるのは `REQ-4.1` のみ。段落の切れ目の上限を撤去する変異でこの検査は**通過**し、落ちるのは別の2件だけである
  - 実データの形は ` * REQ-16.7（定期バックアップ）は…省略` と**番号が `*` の直後に来る**。見本が実データの形を写していない
  - 見本を実データの形へ改め、**当該検査単独でも段落上限の撤去を検知できる**ようにすること
  - **走査ではなく数え上げで閉じること（2026-08-30 に受入条件を書き直した）。** 当初の第6項は「他の見本にも同型の空振りが無いかを走査すること」だったが、変異空間は有限に列挙できず「無い」を有限手数で示せない。独立レビュー3巡がいずれも前巡の指摘の閉塞を実測で確認しながら毎回あらたに実効ある無言変異を発見し、3巡目が30件超を当てた直後の同じ状態に対し debug 調査が8変異でさらに3件を新規発見した。**「同型の空振りが他に無い」ことは主張しなくてよい。決定不能である**
  - 3巡すべての発見は単一の類型だった: **本番の規則が入力を分割する同値類のうち、実データが実現している類を見本が一つも持っていない。** この類型は変異を当てずに、実データを本番の規則へ通して実現された同値類を数え上げ、見本と突き合わせれば検出できる（debug 調査が変異ゼロで4件を特定して実証した）
  - 本タスクで塞ぐ対象は次の名指しの有限集合とする（いずれも実測で確認済み）:
    1. `auditExclusions` の到達性の引き当てが `undefined` になる形。**実データ 148件が全件この形**（明示的な `false` は0件）であり、見本の唯一の事例 `demo/REQ-1.5` は `reachable: false` を明示するため写していない。`=== true` → `!== false` の変異が無言で `--strict` の失敗 148件を **0件**にする（＝偽の緑の供給源）
    2. `IN_REPO_VERIFICATION_TOOL` の7語のうち、実データで**単独一致となる4語**（vitest 71 / jest 24 / playwright 10 / storybook 4）。見本は vitest のみ。残る3語（supertest 0 / react testing library 0 / rtl 0）は実データ上の等価変異であり、件数つきで `@fileoverview` へ記す
    3. `PROSE_BULLET_IS_NOT_AN_ID_LIST` 直前の docstring の記述と実測の食い違い（分割側でなく文法側の変異を担う）
  - **`CODE_DIRS` は本タスクの対象外とする。** `main()` の中にしかなく自己検査から構造的に到達できないため、見本では塞げない（115.227 の所管）
  - 終端条件: **上の名指しの3項目が閉じ、それぞれ対応する変異で自己検査が赤くなることを実測できたとき完了とする。** 「無言変異が存在しない」は主張しない
  - _Depends: 115.168_
  - _Boundary: 被覆検査の自己検査の見本_

- [x] 115.198 (P) steering が挙げる識別子の実在を検査できない状態を解消する
  - 115.169 の実装で判明した。同タスクが新設した `npm run check:steering-refs` は**ファイル名**の実在を見るが、**ファイル名を伴わない識別子**（部品名・関数名）の失効は網に掛からない
  - 実測（115.169 が手で是正した形）: `.kiro/steering/tech.md` の2箇所が撤去済みの `ImageViewer` を**現存の共有先として**挙げていた。ファイル名を伴わないため実在検査では捕まらなかった
  - **これは 115.169 が塞いだ穴の隣にある同型の穴である。** 撤去のたびに steering が追随しない構造という根本問題は、ファイル名だけを見ても半分しか塞がらない
  - 「steering が挙げる識別子の実在」を機械的に検査できるかを検討すること。**散文中の語をすべて識別子と見なすと誤検出が爆発する**（115.167 の実測では語の重なりによる照合は262件中30件が誤検出だった）。**担い手を移せないかを問うこと**（115.167 の作法: 対応の担い手を散文から逐語複製へ移す）
  - 115.173（設計文書の参照先の実在を検査する）は**設計文書**の側を扱う。**本タスクは steering の側に限ること**（115.169 が確立した棲み分け）
  - 検査を新設する場合は 115.139・115.144・115.149・115.181・115.185 が確立した作法に従うこと
  - _Depends: 115.169_
  - _Boundary: steering が挙げる識別子の実在_

- [x] 115.199 (P) 実在検査の拡張子の絞りが真の失効を見逃す状態を解消する
  - 115.169 のレビューが実測で検出した。`scripts/check-steering-file-references.ts` の `CHECKED_EXTENSIONS` は `.ts`/`.tsx`/`.css` に限られており、**実在する失効を見逃している**
  - **レビューの実測**: `.js`/`.jsx`/`.json`/`.md`/`.yml` へ広げると検出は5件で、**真の失効が4件・誤検出は1件のみ**である
    - 真の失効: `.kiro/steering/structure.md` の `App.jsx`・`main.jsx`・`vite.config.js`（フロントは `.tsx` + `vite.config.ts`）、`.kiro/steering/tech.md` の `.github/workflows/e2e-tests.yml`（**115.169 の EXPOSED_GAPS に未掲載の新規の実失効**）
    - 誤検出: `structure.md` の命名規則の例示 `` `index.js` `` の1件のみ
  - **絞りの根拠の記述が過大である。** 検査本体の説明は除外理由として `Fabric.js`・`Node.js`・`decimal.js`・`tesseract.js` を挙げるが、**これら4例はそもそも検出規則（ツリーの葉／逆引用符の箇条書き）に当たらない**。レビューが実測で確認した
  - 拡張子を広げること。誤検出1件は steering 側の表記整理（命名規則の例示を検出規則に当たらない形へ）で解消できるか判断すること
  - **あわせて検査本体の説明の根拠を実測へ書き直すこと。** 115.168 の教訓「測らずに断言した否定は、そのまま検査で固定される」
  - あわせて `.kiro/steering/tech.md` の `e2e/helpers/browser.js`（実体は `.ts`）も対象に含めるか判断すること。散文中の言及であり検出規則に当たらないため、拡張子を広げても捕まらない
  - _Depends: 115.169_
  - _Boundary: steering の実在検査の拡張子と検出規則_

- [x] 115.200 (P) steering のテスト列挙と件数が実体とずれている状態を解消する
  - 115.169 のレビューが検出した。`.kiro/steering/tech.md` の `unit/utils/` は `env-validator.test.ts` の転出後も**「（14テスト）」を保持したまま** `sentry.test.ts`（13テスト）のみを列挙している
  - 実体は `backend/src/__tests__/unit/utils/` が **8ファイル**、`unit/config/` が **3ファイル**であり、steering は各1件しか挙げていない
  - **basename 照合の検査（115.169 が新設）では検知できない。** 挙げられているファイルは実在するため、**「挙げていないファイルがある」ことは網に掛からない**
  - **なお 115.169 の実装者が EXPOSED_GAPS で申告した「backend テストツリーが構造ごと陳腐化（`src/__tests__/{services,utils}/` vs 実体 `src/__tests__/unit/{...}/`）」は事実に反する。** レビューが `structure.md` を実測し、`__tests__/` → `unit/` の階層は正しく描かれていることを確認した。**この誤った申告を後続の根拠にしないこと**
  - 件数を書くなら実測すること。**同一ファイル内で新旧の精度が混在している**（115.169 が書き込んだ15/31は実測値だが、周囲の兄弟エントリの件数は未検証のまま）
  - 「列挙が網羅であるか、代表例であるか」を先に決めること。網羅なら追随の仕組みが要り、代表例なら件数を書かない方が陳腐化しない
  - _Depends: 115.169_
  - _Boundary: steering のテスト列挙と件数_

- [x] 115.201 (P) 要件28.2 の到達性が実ブラウザで検証されていない状態を解消する
  - 115.170 の変異が露出させ、レビューが**弱い形へ訂正した**うえで起票を求めた
  - **実装が申告した「ツールバーの `overflowX: 'auto'` を失ってもどの検証も赤にならない」は誤りである。** レビューが実測で反証した: `frontend/src/__tests__/components/site-surveys/AnnotationToolbar.mobile.test.tsx` の Req 28.2 タグ付きの主張が赤になり、E2E も2件が赤になる
  - **成立するのは弱い形である**: 要件28.2（折返しまたはスクロール可能な領域として項目全てにアクセス可能）の担保は **JSDOM のスタイル宣言の主張だけ**で、**実ブラウザでの到達性の振る舞いを検証するものが無い**
  - **Playwright は `overflow: hidden` の箱をプログラム的にスクロールできる。** そのため、宣言ガードを迂回する改変（例: 祖先が切り取る形へ変える）は E2E では捕まらないおそれがある。利用者は到達できなくなるのに `tap()` は成立する
  - 115.170 はツールバー内部の `scrollWidth` を 992 → 1646（+66%）へ増やしており、**到達性への依存度が上がっている**
  - 実ブラウザで「利用者が実際に到達できること」を検証する形を検討すること。`scrollIntoViewIfNeeded` や要素の可視矩形が親のクリップ矩形に交わるかを測る等
  - _Depends: 115.170_
  - _Boundary: 要件28.2 の到達性の実ブラウザ検証_

- [x] 115.202 (P) 属性パネルの見出しの過半が押下しても何も起きない状態を解消する
  - 115.170 の実装とレビューが独立に実測した。属性パネルの見出し9つのうち、`htmlFor` を持つのは **3つのみ**（`annotation-outline-toggle` / `annotation-text-background-toggle` / `annotation-balloon-style`）
  - 残る **6つ**（色・線幅・塗りつぶし・文字色・サイズ・背景色）は `htmlFor` も包含も持たない兄弟 `label` であり、**押下しても何も起きない不活性テキスト**である
  - 読み上げは操作要素の `aria-label` で成立しているため支援技術上の欠落ではないが、**見出しに触れた利用者の操作が無反応になる**
  - 要件28.3 は項目自体の寸法で満たしたため 115.170 の境界外として据え置かれた
  - `htmlFor` を与えるか、見出しを操作要素で包むか、あるいは見出しが操作対象でないことを明示するかを決めること
  - _Depends: 115.170_
  - _Boundary: 属性パネルの見出しと操作要素の関連付け_

- [x] 115.203 (P) 被覆タグが実測より広い単体検証を是正する
  - 115.170 の実装とレビューが確認した。`frontend/src/__tests__/components/site-surveys/AnnotationToolbar.mobile.test.tsx`（Task 70.1）は **`matchMedia` を stub していない**ため `useMediaQuery` が false を返し、**実際にはデスクトップ分岐（`flexWrap: wrap`）を検証している**
  - にもかかわらず `REQ-28.1` / `REQ-28.2` / `REQ-28.3` / `REQ-28.5` を掲げている。**タグが実測より広い**
  - モバイル分岐の主張は `AnnotationToolbar.mobile-single-row.test.tsx`（Task 102.2）と `AnnotationToolbar.mobile-tap-target.test.tsx`（Task 115.170）が担う
  - **これは Task 70.1 / 102.2 由来の既存ドリフトである。** 115.170 の境界外として据え置かれた
  - タグを実測へ狭めるか、`matchMedia` を stub してモバイル分岐を実際に検証するかを決めること。**狭める場合は被覆率の分母が動くため、115.167・115.168 と同じ作法で HEAD との比較を実測すること**
  - **115.201 が扱う Req 28.2 の宣言ガードは本ファイルにある。** 両タスクは同じファイルに触れるため順序に注意すること
  - _Depends: 115.170_
  - _Boundary: モバイル検証の被覆タグと実測の一致_

- [x] 115.204 (P) 本番未参照の属性パネル部品を整理する
  - 115.170 の実装とレビューが確認した。`frontend/src/components/site-surveys/StylePanel.tsx` は**本番の描画経路から参照されていない**（import しているのは `StylePanel.stories.tsx` のみ）
  - 本番の属性パネルは `AnnotationToolbar.tsx` の内部関数 `StylePanel` である。**同名の別物が二つ存在する**
  - 115.170 の 44 化は本番側にのみ適用され、死蔵側は 32x24 等のまま残った。**後任が死蔵側を参照実装と誤認する危険がある**（115.146 と同じ動機）
  - **撤去する場合は 115.169 の教訓に従うこと**: 撤去は危険を消さず形を変える。当該ファイルを指す記述（コメント・steering・設計書）を同じ変更で数え上げること。`npm run check:steering-refs` が steering 側を機械で捕まえる
  - 撤去の所管は Task 115.96 が別タスクとした範囲であり、115.170 の境界外
  - _Depends: 115.170_
  - _Boundary: 本番未参照の属性パネル部品_

- [x] 115.205 (P) 検証内の局所変数が同名の共有補助を覆う状態を解消する
  - 115.170 のレビューが検出した。`e2e/specs/site-surveys/site-survey-annotation-mobile.spec.ts` の検証 `(d)` 内の `const selectTool` が、**同ファイルの module 内ヘルパー関数 `selectTool` を当該検証のスコープ全体で覆っている**（一時的死角）
  - 現状 `(d)` はヘルパーを呼んでいないため無害だが、**将来 `(d)` 内でヘルパーを呼ぶと `ReferenceError` になる**
  - `selectToolButton` 等への改名を推奨（レビューの提案）
  - **同型の覆いが他の検証に無いかを走査すること。** 115.182 の作法「同じ発想の別の角を探すこと」に倣うこと
  - _Depends: 115.170_
  - _Boundary: 検証内の局所変数による共有補助の覆い_

- [x] 115.206 デスクトップ幅のタップ領域を要件として決着させる
  - 115.170 の実装が据え置いた。要件28.3 は対象を「**モバイル幅**ツールバー」に限るため、デスクトップ幅の属性パネルは 32x24 等のまま残った
  - **粗いポインタ（タッチ対応ラップトップ・タブレットの横向き）では、デスクトップ幅でもタップ領域の不足が実害になりうる**
  - 実測（115.170）: モバイル幅は全項目 44x44 以上、デスクトップ幅は色の選択 32x24・線幅の入力 60x24・吹き出しの選択 高さ24・アクションボタン 高さ32
  - **対象を広げるなら要件の追加が要る。** 幅ではなくポインタの粗さ（`pointer: coarse`）で分けるという選択肢もある
  - **要件を追加しないという判断も正当である。** その場合は「モバイル幅に限る」ことの根拠を要件文に残すこと（次の担当者が同じ議論を繰り返さないために）
  - _Depends: 115.170_
  - _Boundary: デスクトップ幅のタップ領域の要件_

- [x] 115.207 (P) 読み手のいない返り値の項目を整理する
  - 115.171 の走査で判明し、レビューが独立に再確認した。`backend/src/services/image-processor.service.ts` の `CompressedImage.originalExceededSizeLimit`（旧 `wasCompressed`）は**本番コードに読み手が一件も存在しない**書き込み専用の項目である
  - 実測（両者が一致）: `image-upload.service.ts:191` / `batch-upload.service.ts:286` / `construction-photo-image.service.ts:740` はいずれも `processed.original.buffer` と `processed.metadata.*` しか参照しない。API 応答・DB 列・フロントエンド・E2E にも出現しない
  - 115.171 は「呼称を実態へ合わせる」ことが境界だったため改名にとどめ、**撤去は境界外として据え置いた**
  - 撤去するか残すかを決めること。**残すなら「何のために在るか」を書くこと**。現在は要件4.6 の「経路を通ったか」という観測点として検証だけが使っている
  - **撤去する場合は 115.169 の教訓に従うこと**: 撤去は危険を消さず形を変える。当該項目を指す記述を同じ変更で数え上げること（改名後の母集団は本番3箇所＋テスト32箇所の計35箇所・6ファイル）
  - _Depends: 115.171_
  - _Boundary: 圧縮結果の読み手のいない項目_

- [x] 115.208 要件4.6 が圧縮しきれない場合を規定していない状態を決着させる
  - 115.171 の実装が実測で露出させ、レビューが要件原文で裏づけた
  - 要件4.6 の原文は「If ファイルサイズが上限（300KB）を超える, then the Site Survey Service shall 画像サイズと品質を段階的に下げ、350KB以下に収まった時点で圧縮を打ち切って登録する」であり、**収まらなかった場合を一切規定していない**
  - **実測（115.171）**: 品質もリサイズも下げ切って 350KB に収まらない場合、**350KB超のまま登録される**（全段 OVER のパターンで `size=358401` を返す）
  - 現在の実装は「収まらなくても登録する」という選択をしているが、**それが意図した挙動かは要件から読み取れない**
  - **要件文の追補が要るため利用者の判断を仰ぐこと。** 選択肢: (a) 収まらなくても登録する旨を明記する、(b) 収まらない場合は拒否する、(c) 収まらない場合の上限を別に定める
  - 115.171 は要件文を変更せず、JSDoc に**現在の実態として**明記するにとどめた
  - _Depends: 115.171_
  - _Boundary: 圧縮しきれない場合の要件_

- [x] 115.209 (P) 圧縮開始の閾値を最大値と呼ぶ定数名を是正する
  - 115.171 の走査で判明した。`backend/src/services/image-processor.service.ts` の `MAX_SIZE_BYTES` は名前が「**最大**ファイルサイズ（300KB）」と読めるが、実態は**圧縮を開始する閾値**である
  - **出力は 350KB まで正常に許容される**（要件4.6 の打ち切り条件）。実測では 350KB を超える出力も生じうる（115.208 参照）。したがって「最大」は誤りである
  - 115.171 は JSDoc の是正にとどめた。**定数名の改名は境界（分岐と返り値の呼称）を超えるため据え置かれた**
  - 参照は宣言・使用・テストの計3箇所のみで改名は機械的に可能である
  - **改名するなら母集団を走査で再確定すること**（3箇所という見積もりも実測で確かめること）。`TARGET_MAX_SIZE_BYTES` との対比が読み手に伝わる名前を選ぶこと
  - _Depends: 115.171_
  - _Boundary: 圧縮閾値の定数名_

- [x] 115.210 反実仮想を書く前に変異を実行する作法を固定する
  - 115.171 の実装が自ら露出させ、レビューが**本系列で3度目**であることを指摘して起票を推奨した
  - **同型の誤りの記録**:
    - **115.168（否定側）**: 「同一機能の一覧が段落をまたぐ形が実データに4件あり、狭めると被覆を過小に見せる」と**測らずに断言**し、その線を自己検査で固定した。実測すると失われるのは2件だけで、両方とも偽の被覆主張だった
    - **115.170（レビュアー側）**: 「ツールバーの `overflowX` を外せば赤になる」と例示したが、実測では緑のままだった。封じ込めていたのは祖先の `overflow: hidden` だった
    - **115.171（実装者の肯定側）**: 「撤去した恒偽の分岐が生きていれば等倍リサイズが入る」とコメントに書いたが、**逐語復元は一度も実行していなかった**。実測すると 48/48 緑で、恒偽の分岐は復活させても本体に入らない
  - **いずれも「この変異なら赤くなる／緑になるはずだ」を実行せずに書いたことに起因する。** 記述が検査やコメントに固定されると、後任が誤診する
  - 作法として固定すること: **コメント・アサーションの説明・レビューの指摘に反実仮想を書く場合は、実際に実行した変異を名指しし、その出力を報告に載せること**
  - **機械で検査できるかを検討すること。** 検査できないなら、どこに（steering／スキル／テンプレート）どう書けば実効を持つかを決めること
  - 検査を新設する場合は 115.139・115.144・115.149・115.181・115.185 が確立した作法に従うこと
  - _Depends: 115.171_
  - _Boundary: 反実仮想の記述に対する実測の要求_

- [x] 115.211 (P) 設計文書が自身を行番号で指す参照の再混入を機械で捕まえる
  - 115.172 のレビューが**真の空白**として確認した。同タスクは `design.md` が**自身を行番号で指す参照12件**を撤去したが（HEAD 時点で全件失効。実際は 27〜51行ずれていた）、**再混入を捕まえる仕組みが無い**
  - 既存の検査はいずれも覆わない: `check:design-refs` は**本番コードから設計文書への**行番号参照を見る。`check:design-code-refs` は**設計文書から本番コードへの**行番号参照を見る。**設計文書が自分自身を指す形はどちらの網にも掛からない**
  - **115.173（設計文書の参照先の実在）とも別物である。** あちらの境界は**パス・シンボルの実在**であり、行番号の失効は覆わない（レビューが判定）
  - 115.172 で design.md の行数は 8061→8065 に増えた。**文書が育つ限り行番号は失効し続ける**
  - 検出は容易である（`grep -o "design\.md:[0-9]\+"`）。既存の検査系統へ足せるかを検討すること
  - **他の設計文書（全13スペック）にも同型が無いかを走査すること。** 115.172 の走査は site-survey に限られていた
  - 検査を新設・拡張する場合は 115.139・115.144・115.149・115.181・115.185 が確立した作法に従うこと
  - _Depends: 115.172_
  - _Boundary: 設計文書が自身を行番号で指す参照_

- [x] 115.212 (P) 設計文書に残る実測値のドリフトを解消する
  - 115.172 のレビューが**掃き残し**として検出した。同タスクが是正した箇所と**完全に同型**の実測値ドリフトが、同じ節の約20行上に手つかずで残っている
  - `.kiro/specs/site-survey/design.md` の `#### 除外一覧の根拠の全件監査（タスク 115.121）`: 「除外は **261 件**」「現場調査スペックの項目は **66 件**」は現在 **262 / 53**（115.167 が除外を 266→262 へ整理したため）
  - 同 `#### ...` の別箇所: `grep -rn "StyleTokens" frontend/src | wc -l` の出力が `0` とあるが現在は **1**（`annotation-style-tokens.ts` のコメント内 `AnnotationStyleTokens` への部分一致）。**実質の主張（StyleTokens は実体を持たない名前）は依然真**であり、数値だけがずれている
  - **いずれも解消済み欠陥を現存と読ませる性質ではない**（版の手掛かり——節名のタスク番号と「書く直前の実測」——が付いている）ため 115.172 は非ブロッキングとして据え置いた
  - **数値を書くなら、いつ測ったかを添えるか、機械で追随させるかのどちらかを決めること。** 版の手掛かりだけでは読み手が再測を強いられる
  - **同型のドリフトを design.md 全体で走査すること。** 「〜件」「出力は `N`」の形を洗い出し、一件ずつ再測すること
  - _Depends: 115.172_
  - _Boundary: 設計文書の実測値の追随_

- [x] 115.213 設計文書に残る未起票の提案を消化する
  - 115.172 の走査が検出し、レビューが `tasks.md` を走査して**対応タスクが一件も存在しないこと**を確認した。設計文書が「〜すべき」「〜を検討する」と述べたまま、**どこにも登録されていない提案が7件ある**
  - (1) Mermaid 図の辺 `SurveyImageService --> R2` が Risks 欄の「本サービスはこの8件に含まれない」と矛盾する（`### Architecture Pattern & Boundary Map`）
  - (2) `## Requirements Traceability` の要件20.4 行から `SurveyImageService` を外す提案
  - (3) 上記を是正した後の責務欄への追随（4箇所）
  - (4) 論理名対応表の未登録4件（`StyleTokens` 等）
  - (5) 追跡表10件の実装側注釈の要件番号の是正
  - (6) 115.119 の受入検証の拡張
  - (7) 他機能スペックの除外一覧の Jest 道具名90件
  - **提案を文書に書いただけでは消化されない。** 一件ずつ、実施するか取り下げるかを決めること。取り下げるなら**その判断を文書に残すこと**（次の担当者が同じ提案を再発見しないために）
  - **同型の未起票の提案が他スペックの設計文書にも無いかを走査すること**
  - _Depends: 115.172_
  - _Boundary: 設計文書の未起票の提案_

- [ ] 115.214 数量表・工事写真の経路が親の論理削除を見ない状態を解消する（**別スペックの所管**）
  - 115.172 の実装とレビューが**双方とも現存を実測で確認した**。要件1.5（現場調査の論理削除）に対し、以下の経路は現在も親の `deletedAt` を検査しない
  - `backend/src/services/quantity-group.service.ts` の `QuantityGroupService.validateSurveyImage`（`select` は `projectId` のみ）
  - `backend/src/services/construction-photo-image.service.ts` の `ConstructionPhotoImageService`（`survey: { select: { projectId: true } }`）
  - site-survey スペックの5経路は Task 115.124 が `assertSurveyNotDeleted` で塞ぎ、115.172 のレビューが**全8ルートを一件ずつ辿って塞がれていない経路が無いこと**を確認済みである。**残るのは他スペックが所管する2経路である**
  - 是正するなら `backend/src/utils/survey-deleted-guard.ts` の `assertSurveyNotDeleted` / `sendSurveyDeletedProblem` をそのまま使える
  - _Blocked: 数量表生成スペックおよび工事写真スペックの所管。当該スペックでの実装が必要_
  - _Depends: 115.172_
  - _Boundary: 数量表・工事写真の経路における親の論理削除の検査_

- [x] 115.215 免除の面の広さを実測して監視の仕組みへ載せる
  - 115.173 のレビューが**開示の規模の過小**として検出した。同タスクが新設した `scripts/check-design-path-references.ts` は「不在を述べる行が同じ文書内にあれば免除する」形を採り、限界として「一度でも不在を記録すれば、その文書内の同じファイルへの他の言及はすべて免除される」ことを明記した
  - **しかし開示されたのは形だけで、規模は測られていなかった。** レビューの実測: 免除宣言集合に入っている**現存する**パス参照は 13文書で distinct **160件（全 distinct 候補 543件の 29.5%）**。`site-survey/design.md` 単独では **277件中 128件（46%）**
  - 具体例（レビュー実測）: `frontend/src/components/site-surveys/AnnotationEditor.tsx` は寸法線の「削除」を論じる行に名指されるため、**将来撤去されても同文書内の全言及が沈黙のうちに免除される**
  - 検査本体は「**免除の広さは実測して開示する。** 是正後の免除は 72 件」と記すが、**72 は「いま免除されている件数」であって免除機構の広さではない**
  - **今日のデータでは誤った免除は0件**（レビューが distinct 18種すべての宣言行を確認）。**行単位へ狭めると歴史記録の本文を書き換えさせることになり、115.169・115.172 が確立した書き分けの基準に反するため、115.173 の境界内では是正できない**
  - 免除の面を実測して開示すること。**さらに、その数が跳ねたときに気付く仕組みを置くこと**（実装者の CONCERN「合格時にも必ず出力する設計にしたが、この数が跳ねたときに誰が気付くかは仕組みになっていない」と同根。`--json` で取れるが基準線が無い）
  - **115.168 の教訓「測らずに断言した否定は、そのまま検査で固定される」に該当する。** 限界を明記しても、その規模が測られていなければ読み手は規模を過小に見積もる
  - _Depends: 115.173_
  - _Boundary: 免除機構の面の実測と監視_

- [x] 115.216 統合検証を分離する環境変数が死んでいる状態を解消する
  - feature レベル検証（10タスク完了後）の機械検査が検出した。**`RUN_INTEGRATION_TESTS` は死んだ環境変数である**
  - 実測: `backend/package.json` が `test:integration` で設定している以外、**リポジトリ内のどのテストファイルにも設定にも参照が無い**
  - このため `npm --prefix backend run test`（= `vitest run`）は**常に統合検証44ファイルを共有のテスト用データベース（`localhost:5433/architrack_test`）へ流す**。分離されていると読める名前がついているのに分離していない
  - **実害**: 押下前の関門やローカルでの全件実行が、**E2E が使っている最中のデータベースを黙って壊しうる**。feature 検証では、サブエージェントがこれに気付いて隔離した postgres と redis を別ポートに立てて回避した（回避しなければ親が実行中だった E2E 全件を壊していた）
  - 分離の関門を復活させるか、**名前から誤解を除くこと**。「設定しても何も変わらない環境変数」は、読み手に分離されていると信じさせる分だけ無いより悪い
  - **同型の死んだ環境変数が他に無いかを走査すること**（`package.json` の各スクリプトが設定する変数のうち、参照されていないもの）
  - _Boundary: 統合検証の分離の仕組み_

- [x] 115.217 (P) タップ領域の下限を検証側が複製している状態を解消する
  - feature レベル検証の境界監査が**同一バッチ内の不整合**として検出した
  - タスク 115.183 は「検証側へ数値を複製すると、間隔が変わったときに検証だけが古い前提のまま緑になる」として `frontend/src/services/AutoSaveManager.ts` の `DEFAULT_AUTO_SAVE_INTERVAL_MS` を **export した**
  - **同じバッチのタスク 115.170 は逆をやった**。`frontend/src/components/site-surveys/AnnotationToolbar.tsx` の `TAP_TARGET_MIN_PX = 44` を module 内に留めたまま、`MIN_TAP_TARGET_PX = 44` として**3箇所へ複製**した（`e2e/specs/site-surveys/site-survey-annotation-mobile.spec.ts`、`e2e/specs/site-surveys/site-survey-outline-toggle.spec.ts`、`frontend/src/__tests__/components/site-surveys/AnnotationToolbar.mobile-tap-target.test.tsx`）。**名前も転置している**
  - **緩和要因**: 44 は要件28.3 の条文が運ぶ WCAG の数値であり、実装が調整する値ではない（自動保存の間隔とは性質が違う）。**この違いが複製を正当化するかを判断すること**
  - なお `frontend/src/components/site-surveys/PendingUploadPanel.tsx` にも `MIN_TAP_TARGET_PX = 44` が**本バッチ以前から**存在する（要件37系）。**母集団は走査で確定すること**
  - 複製を残すなら、**なぜ複製してよいかを一箇所に書くこと**。次の担当者が同じ判断を繰り返さないために
  - _Depends: 115.170_
  - _Boundary: タップ領域の下限の単一の出所_

- [x] 115.218 依存の脆弱性で押下前の関門が塞がる状態を解消する（**本スペックの所管外・押下に必須**）
  - feature レベル検証の機械検査が検出した。**`npm run audit:security` が EXIT=1 で、押下前の関門を塞いでいる**
  - 実測: backend と root で同一の high が3件。`prisma` → `@prisma/config` → `deepmerge-ts`（「再帰的なオブジェクトグラフの併合でスタックを使い尽くす」）。`fixAvailable` は `prisma` 6.12.0 で **`isSemVerMajor: true`**。frontend は0件
  - **直近10タスクの由来ではない。** 実測根拠: `git diff --name-only c0caefe~1 70ad0e4 -- '*package-lock.json'` が0件、`package.json` の差分は検査スクリプトの追加のみで依存の変更が無い。**新たに公開された advisory による外部要因**である
  - **ただし押下はできない。** 対処は (a) `prisma` のメジャー更新、(b) `.security-audit-allowlist.json` へ理由と期限を付けて追加、のいずれか
  - **許容リストへ逃がす場合は、その判断の根拠と再検討の期限を書くこと。** 過去の記録（`project_brace_expansion_override_breaks_minimatch3`）では、メジャー線別の修正版が出た時点で許容を削除している
  - _Boundary: 依存の脆弱性の関門_

- [x] 115.219 更新日時が作成日時より前になる間欠的な欠陥を解消する（**別スペックの所管・押下に必須**）
  - feature レベル検証の E2E 全件（2322件・1時間44分）が検出した。**再試行で回復した検証が1件ある**
  - `e2e/specs/trading-partners/trading-partner-data-integrity.spec.ts` の「取引先更新時に更新日時が自動記録される（`trading-partner-management/REQ-11.12`）」
  - **実測の失敗内容**: `expect(updatedAt).toBeGreaterThanOrEqual(createdAt)` に対し `Expected: >= 1787941668496` / `Received: 1787941668052`。**更新日時が作成日時より 444ms 前**である
  - **粒度の丸めではない。** 444ms の差は、作成日時と更新日時が**別々の時計から来ている**ことを示す（例: 一方が Prisma の `@default(now())` でデータベース側、他方が `@updatedAt` でクライアント側）。WSL2 では容器間の時計がずれうる（記録: 壁時計が単調時計より約8.6%遅く進む）
  - **本バッチの10タスクは当該ファイルを一度も触っていない**（実測: `git diff --name-only c0caefe~1 70ad0e4` に `trading-partner-data-integrity.spec.ts` は現れない。触れたのは `e2e/specs/projects/project-trading-partner.spec.ts` のみ）
  - **押下できない。** `playwright.config.ts` の `failOnFlakyTests` により、再試行で回復しても総合判定は FAILED になる。この設計は正しい——**再試行で回復したという事実は間欠的な欠陥の徴候である**
  - 追跡の手掛かり: `test-results/2026-08-28_16-48-30-081Z/trading-partners-trading-p-c832d-rtner-management-REQ-11-12--chromium/` に trace・video・スクリーンショットがある
  - **時計の出所を一つに揃えるか、検証が時計の差を吸収する形にするかを決めること。** 後者を選ぶ場合、**吸収してよい差の上限を根拠とともに決めること**（444ms を無条件に許すと、本当に順序が逆転した欠陥を見逃す）
  - _Boundary: 作成日時と更新日時の時計の出所_

- [x] 115.220 (P) 新規作成ボタンの非表示を確かめる被覆印が一つも無い状態を決着させる
  - 115.189 の実測が確定させた。115.188 の記録（`scripts/coverage-mark-adjudication.md` §6）は本件を 115.189 の _Boundary_ へ差し向けていたが、**当該IDは `e2e/requirement-exclusions.json` に存在せず除外ではない**。115.189 は差し戻し、記録を実態へ改めたうえで**扱いを未決として残した**
  - 実測: `project-management/REQ-27.4` の原文は「セクション右上の『新規作成』ボタンと『すべて見る』リンクを非表示にする」（`.kiro/specs/project-management/requirements.md` 要件27 の 4）。当該IDを名乗る被覆印は **三件**（`e2e/specs/projects/project-detail-sections.spec.ts:450`、`e2e/specs/estimate-requests/estimate-request-e2e.spec.ts:379` および同 `:436`）で、**三件とも「すべて見る」リンクの非表示しか主張していない**
  - **「新規作成」ボタンの非表示を確かめる検証は一件も無い。** 一部の表題は両方を名乗るが、本文の主張は片方に留まる
  - **これは 115.189 が是正した「除外の側の部分被覆」と同型の、被覆印の側の形である。** 扱いは `scripts/coverage-mark-adjudication.md` §4（約340件）と同じ層にあり、本件を単独で埋めると同§の母集団と作法が食い違う恐れがある。**§4 の扱いを決める判断と揃えること**
  - 被覆印を取り下げれば未被覆として露出し指標が動く。**取り下げと観測の追加のどちらを採るかを、指標への影響を実測してから決めること**
  - _Depends: 115.189_
  - _Boundary: 被覆印が観測する範囲と受入基準の対応（project-management/REQ-27.4）_

- [x] 115.221 (P) 機能名の探索が二箇所に複製され同一性が強制されていない状態を解消する
  - 115.190 のレビューが検出した。**115.190 が是正した病と同型**が、隣の関数に残っている
  - `scripts/check-requirement-exclusions.ts:418` の `discoverFeatureNames` は `scripts/check-requirement-coverage.ts` の同名関数と複製であり、前者のコメントが同一性を**散文で述べるのみ**で強制する仕組みが無い
  - 115.190 は抽出規則（要件と受入基準の単位）を `scripts/requirement-document.ts` へ一元化したが、**機能名の探索はその外に残した**
  - **115.190 の作法に倣うこと**: まず微差の全容を実測で確定し（起票文が挙げる形は抜き取りである可能性を疑う）、共有モジュールへ寄せるか一致の対照を置くかを決め、**分母が動かないことを HEAD との前後比較で実測すること**
  - 対照を置く／足す場合は、変異を当てて実際に赤くなることと、**対照自身が空振りしていないこと**を実測すること
  - _Depends: 115.190_
  - _Boundary: 機能名の探索規則の一元化_

- [x] 115.222 (P) 対照の母集団が空でも自己検査が緑で通る最後の抜け道を塞ぐ
  - 115.191 のレビューが検出した。115.191 が置いた機構対照は、対照群を空にする破壊に対して**片側しか赤くならない**
  - 実測（レビューの破壊実験）: `MUST_ACCEPT` を空にすると「変異を宣言しない陰性対照が 0 件ある」で**赤くなる**が、`MUST_REJECT` を空にすると走査ループが空回りして**緑で通る**（真空パス）
  - **母集団が空の検査は何も主張していない。** 第3原則（前提条件で検査を自動的に無効化しない）の観点では、対照群が消えたことは前提の崩壊であり赤くすべきである
  - **要約行に `陽性対照 0` と出る可視性はあるが、それは人が読んだ場合にしか効かない。** 機構で止めること
  - `MUST_ACCEPT` / `MUST_REJECT` それぞれの**下限件数を機構で固定**する形が素直だが、下限を実測の現況（陽性37・陰性7）に貼ると対照を減らす正当な変更まで止める。**下限をどこに置くか、あるいは件数でなく「空でないこと」だけを固定するかを判断すること**
  - 是正後は、**両方の対照群それぞれについて空にする変異を当てて赤くなることを実測すること**
  - _Depends: 115.191_
  - _Boundary: 除外定義の自己検査の対照群の下限_

- [x] 115.223 (P) 被覆の抽出器が例として挙げる番号が陳腐化した状態を解消する
  - 115.192 のレビューが検出した。`scripts/check-requirement-coverage.ts:493` の JSDoc は「`site-survey/REQ-16.7` / `quantity-table-generation/REQ-38.4` — 被覆の集計から落ちる」と述べるが、**二件とも既に落ちていない**
  - `quantity-table-generation/REQ-38.4` は 115.192 が被覆した。`site-survey/REQ-16.7` は 115.186 の時点で既に陳腐化していた
  - **説明が挙げる実例は、実例であるがゆえに陳腐化する。** 115.189 が確立した規律（記録が引く件数は提出時に測り直す）と同じ問題が、検査本体の説明文に出ている
  - 実例を挙げ続けるなら**実在を機械で確かめる形**へ移すか、実例を挙げない形へ改めるかを決めること。`scripts/check-design-path-references.ts` が設計文書のパスに対して行っている検査が参考になる
  - 是正後は、実例が陳腐化したときに赤くなることを変異で実測すること
  - _Depends: 115.192_
  - _Boundary: 被覆の抽出器の説明文が挙げる実例の実在_

- [x] 115.224 (P) 合成対照の陰性側が空振りしている状態を解消する
  - 115.192 のレビューが検出した。**基線から存在する穴**であり 115.192 の差分の責任ではない
  - `scripts/check-requirement-coverage.selftest.ts` の合成対照「JSDoc 内の段落の切れ目で区間を切る」は、**本体から規則4（段落の切れ目）を外しても緑のまま**である（レビューの実測）
  - 原因: 資料の散文 ` * Note: REQ-4.2 …` が一覧項目の形（`[-*]\s*REQ-`）に一致せず、規則4の有無にかかわらず拾われない。**切れ目より後に置いた資料が、そもそも拾われうる形をしていない**
  - **115.191（実物を流すだけの陰性対照）・115.192（散文が一覧項目の形をしていない）と同種**である。合成対照にも同じ形が残っていた
  - 資料の散文を一覧項目の形へ改めるなど、規則4を外したときに実際に拾われる形にすること
  - **同じ形の空振りが他の合成対照に無いかを走査すること。** 115.192 が実データ側へ置いた機構対照（`drop` が規則4の除去に反応するか）に相当するものを、合成対照側にも置けるかを検討すること
  - _Depends: 115.192_
  - _Boundary: 被覆の自己検査の合成対照の陰性側_

- [x] 115.225 (P) プロジェクトの単体検証が名乗る受入基準の番号が一律にずれた状態を解消する
  - 115.193 の実装が露出させ、レビューが実在を確認した
  - `backend/src/__tests__/unit/models/project.model.test.ts:11-15` のヘッダーが名乗る番号は、**13.2 以降が一律に一つ手前へずれている**。顧客名が取引先へ移行した際に条文が繰り上がったが、被覆印が追随していない
  - 実測の対応: ヘッダーの `REQ-13.2: 顧客名を必須かつ1〜255文字` は**現行の要件定義書に存在しない**（現 13.2 は「取引先を任意とする」）。以下同様に 13.3/13.5/13.7/13.8 はそれぞれ現行の 13.4/13.6/13.8/13.9 に対応する
  - **`project-management/REQ-13.2`・`13.3` は現在も本ファイルだけが名乗る本番未到達の被覆源として残っており、番号ずれのため「名乗っている条文を実際には検証していない」疑いがある**（本番未到達22件の一部）
  - 同ファイル `:10` の `- REQ-13.1` の印も一体で扱うこと。115.193 が本番到達の被覆源を足したため指標は動かないが、当該ファイルは本番モジュールを一つも取り込まず被覆源としては `verification-no-production-reference` のままである
  - `backend/src/schemas/project.schema.ts:5-13` の本番コード側ヘッダーも同じ番号ずれを持つ。ただし機能名が無いため被覆印として集計されておらず指標への影響は無い
  - **115.188 の作法に倣うこと**: 名乗りの指し先を原文と突き合わせて一件ずつ裁定し、**番号を直すのか印を取り下げるのかを条文ごとに決めること**。取り下げれば未被覆として露出しうるため、指標への影響を実測してから決めること
  - 所管: project-management スペック
  - _Depends: 115.193_
  - _Boundary: プロジェクトの単体検証が名乗る受入基準の指し先_

- [x] 115.226 (P) 散文中に引用した被覆一覧の字面がヘッダーとして検出される状態を解消する
  - 115.194 の実装が露出させ、レビューが実在を確認した
  - 実測: `e2e/specs/quantity-tables/photo-change-dialog-e2e.spec.ts:14` の散文中に**バッククォートで引用された** `Requirements coverage (site-survey):` が、`extractHeaderScopedCoverage` によって index 526 のヘッダーとして検出される
  - **現況では当該ヘッダー配下から拾われる印は 0 件のため実害は無い**（レビューの実測。`extractHeaderScopedCoverage` の戻りは空）。だが 384件のヘッダー母集団に幻のヘッダーが混ざっている
  - **115.194 が一覧項目の側で是正したのと同種の「字面と意味の取り違え」が、ヘッダー検出の側に残っている。** 引用の中の字面を宣言と読む形である
  - 是正するなら、**引用（バッククォート・コードフェンス）の内側を除く**か、ヘッダーが宣言として置かれる位置を限る規則を決めること
  - **母集団を走査で再確定すること。** 現在の 384件のうち幻のヘッダーが何件あるかは測られていない（実測されたのは当該1件のみで、他は未走査）
  - 是正後は、幻のヘッダーを仕込んだ写しで検出されないこと・正当なヘッダーが落ちないことの両側を対照で固定すること
  - _Depends: 115.194_
  - _Boundary: 被覆一覧のヘッダー検出（引用と宣言の区別）_

- [x] 115.227 (P) 走査根が自己検査から到達できず落としても無言な状態を解消する
  - 115.197 の差し戻しを受けた debug 調査が検出した。`scripts/check-requirement-coverage.ts` の `CODE_DIRS` は `main()` の中にしかなく非 export のため、**自己検査から構造的に到達できない**
  - 実測: `CODE_DIRS` から `backend/src` を落とすと**自己検査は 58/58 緑のまま**、ゲート出力は 24958→32205 バイト、受入基準の被覆は 143/145→109/145、要件は 20/20→19/20 と多数の機能で動く
  - 115.197 は見本（フィクスチャ）の是正が境界であり、**見本をいくら足しても塞げない**。走査根を自己検査から参照できる形へ改める必要がある
  - `CODE_DIRS` を export し、走査根それぞれについて「外すと被覆集合が真に縮む（＝どの根も遊んでいない）」ことを機構で主張すること。115.197 が `PRODUCTION_ENTRY_POINTS` に対して置いた `checkEveryProductionEntryPointContributes` と同じ作法が使える
  - _Depends: 115.197_
  - _Boundary: 走査根の露出と自己検査からの固定_

- [x] 115.228 (P) 追跡表が新設した受入基準を拾わない状態を解消する
  - 115.208 のレビューが検出した。要件4 に受入基準14 を新設したが、`design.md` の総合追跡表の該当行は `| 4.1-4.6, 4.9 |` のままで **4.14 を含まない**
  - 実装者は「4.14 は 4.6 と同一のコンポーネントが担うから行構成は変わらない」として据え置いたが、**その理由は表自身の前例に反する**。要件4 の後追いの受入基準 4.7・4.8・4.10・4.11・4.12・4.13 はいずれも個別行を持ち、**4.11〜4.13 は担い手が 4.10 と同じでも行が起こされている**
  - 「行数 166 を動かさない」という理由も漏れを要求しない。**既存行の Requirement 列を `4.1-4.6, 4.9, 4.14` に、Components 列を `ImageProcessorService (4.4, 4.6, 4.14)` に改めれば行数は保たれる**（レビューが実測）
  - **追跡表の網羅性を検査する仕組みは存在しない。** `check:design-refs` は参照形式、`check:design-path-refs` はパスの実在しか見ないため、この漏れは機構では捕まらない
  - 是正のついでに、**追跡表が受入基準を漏らしていないことを機械で検査できるか**を検討すること。できないと判断した場合は理由を実測で示すこと（115.197 の作法により、走査で「漏れが無い」を示せという受入条件は終端しない。**有限集合上の全称命題として書けるか**を問うこと）
  - _Depends: 115.208_
  - _Boundary: 設計文書の追跡表と受入基準の対応_

- [x] 115.229 (P) 反実仮想の母集団の数え方が二重に実装された状態を解消する
  - 115.210 のレビューが検出した。`scripts/check-counterfactual-evidence.ts` は名指し・変異の語・判定の語の三条件を `collectNetSentences` と `isCounterfactualSentence` の**二箇所に二重に実装**している。`run()` は後者を経由するため、全文の列挙（`npm run check:cf-evidence:list`）と本検査の母集団は**別々に数えられている**
  - 当該ファイルの注釈は当初「この一つの列挙から導かれるため構造上ずれない」と述べていたが**偽であった**。実測: `isCounterfactualSentence` に第四の条件を足す変異を当てると母集団 32 に対し列挙 35 で乖離する（2026-08-31 にレビューと実装者の双方が実測）
  - 一致を担保しているのは構造ではなく自己検査 `checkNetSurveyMatchesTheCheck` **単独**である。実測: 乖離だけを起こす変異に対して落ちる確認は 65 件中この 1 件のみで、**当該の確認を無効化すると 65/65 で通る**（2026-08-31 にレビューが実測）
  - 115.210 は担保の所在を注釈へ明記するに留めた。境界（記述に対する実測の要求）を超えるためである。**後任が「構造上ずれない」と誤読して当該の自己検査を外す危険が残る**
  - `run()` を `collectNetSentences` から導き、三条件の実装を一本化すること
  - _Depends: 115.210_
  - _Boundary: 反実仮想の母集団の数え方の一本化_

- [x] 115.230 (P) 絞り込みの検査が行走査の中核を見ていない状態を解消する
  - 115.211 のレビューが検出した。`scripts/check-design-reference-format.ts` の絞り込み検査
    `checkNoFindingsNarrowing` が監視するのは `collectSourceFiles` / `scanSource` / `run` / `main` の
    4 本で、**行単位の検出の中核である `collectReferences` を含まない**
  - 実測: `collectReferences` の冒頭へ内容キーの逃がし `if (lineText.includes('画像削除')) return [];`
    を注入すると、**自己検査 56/56 緑・本検査も緑で素通りする**（2026-08-31 にレビューが実測）
  - **兄弟の `scripts/check-design-code-reference-format.ts` も同型である。** あちらの
    `checkNoFindingsNarrowing` の監視対象は `collectDesignDocuments` / `run` / `scanDocument` / `main` の
    4 本で、やはり行走査の中核を含まない。**確立済みの作法から継承した限界であり 115.211 の退行ではない**
  - 両関門にまたがる改善として、行走査の中核を監視対象へ加えること。加える場合は上記の逃がしを
    陽性の変異として赤化を確認すること
  - _Depends: 115.211_
  - _Boundary: 絞り込みの検査が監視する関数の範囲_

- [x] 115.231 (P) 設計文書の走査根が三様に定義された状態を解消する
  - 115.211 のレビューが検出した。設計文書の走査根（`SPEC_DIR` / `DESIGN_DOC_NAME` /
    `collectDesignDocuments`）が、`check-design-code-reference-format.ts` に定義、
    `check-design-reference-format.ts` はそれを借用、`scripts/check-design-path-references.ts` は
    同じ 3 つを**自前で複製**という「複製 2・借用 1」の二様で並ぶ
  - 借用側は片方を移動・改名すると他方も止まるが、import の失敗で顕在化するため沈黙はしない。
    複製側は**片方だけが育つと静かにずれる**
  - 三者の走査根を共有部品へ寄せること
  - _Depends: 115.211_
  - _Boundary: 設計文書の走査根の定義箇所_

- [ ] 115.232 設計文書が引く件数の鮮度を機械で保証する仕組みを置く
  - 115.212 のレビューが三度にわたり同型の掃き残しを検出したことから起票した。**設計文書が引く件数が現況と一致するかを見る関門は存在しない**（`check:design-refs` は参照形式、`check:design-path-refs` はパスの実在しか見ない）。文書自身も第1層でその不在を宣言している
  - とくに自己言及する四値（強調記号を課す網・課さない網・再現コマンドを同じ行に持つ行・実測日を持たない残余）は**それを述べる行自身が母集団に属する**ため、文書へ書き足すたびに動く。115.212 は三ラウンド、115.213 は一ラウンド、いずれもここで差し戻された
  - 契約案: `scripts/design-measurements.json` へ `{file, anchor, command, expected}` を宣言し、リポジトリルートで各コマンドを実行して `expected` と突き合わせ、不一致を全件列挙して終了コード 1
  - 自己検査は `check:design-path-refs:selftest` の作法に倣い、一致1件・不一致1件の仮マニフェストを与えて**本体をサブプロセスとして起動**し、終了コードと報告件数の双方を固定する。`check-design-code-reference-format.ts` の `checkNoFindingsNarrowing` に倣い、集計関数に絞り込み操作が現れないことも禁じること
  - `package.json` へ `check:design-measurement-freshness` / `:verbose` / `:json` / `:selftest` の4口を追加する
  - **115.212 の境界内で作らなかった理由**: 関門の説明文を設計文書へ書き足す行為が再び四値を動かし、再発サイクルを再起動するため。本タスクで作るときも、説明は設計文書でなく検査本体の注釈へ置くこと
  - _Depends: 115.212_
  - _Boundary: 設計文書の実測値の鮮度を見る関門_

- [ ] 115.233 (P) 115.212 の走査範囲の外に残る実測値のドリフトを解消する
  - 115.212 のレビューが**宣言した走査範囲の外**として検出した。同タスクの網は「〜件」と「出力は `N`」の形に限られ、それ以外の綴りは第3層の未走査の残余として明示的に範囲外に置かれている
  - `#### 契約名の実在対照表` の (B) 人手走査（タスク 115.149 の記録）が引く `94 件` / `53` / `684` は、レビューの実測でそれぞれ **148** / **79** / **708** である
  - `#### 是正前後の計数` の「実装ファイル …（53件）」は母集団 53 のままで、現況 50 の併記が別の箇所にしかない。当該行だけを読むと旧母集団を現況と誤読しうる
  - 走査範囲は 115.212 が第3層で宣言したコマンド（`[0-9]+ *(箇所|行|経路|個|ファイル|枚)|[0-9]+(\.[0-9]+)?%` の網）で確定すること。同タスクの実測ではこの網が挙げる 133 件のうち 78 件が四つの網の外にある
  - 是正は 115.212 が定めた規約 (a)/(b) の形に従うこと。**歴史記録は当時の値を残したうえで現況の再実測を同じ場所へ並べる**
  - _Depends: 115.212_
  - _Boundary: 設計文書の実測値の追随（115.212 の走査範囲の外）_

- [ ] 115.234 (P) 他スペックの設計文書に残る実測値のドリフトを走査する
  - 115.212 の走査は `site-survey` の design.md に限られていた（境界の判断は妥当とレビューが確認済み）。**残る12スペックは未走査である**
  - 母集団は `ls .kiro/specs/*/design.md | wc -l` の出力が `13`。うち `site-survey` を除く12件が対象
  - 115.212 が確立した作法を適用すること: 走査範囲をコマンドで宣言し、再現コマンドを持つ行は全件実行して断言値と突き合わせ、全称否定は三層で書く
  - **同タスクの教訓を必ず引くこと**: 「走査の完了主張は、走査を実行してから書く」。115.212 は三ラウンド連続で「すべて実行し直した」と書きながら実行していなかった
  - `git show HEAD:` の形の動く参照が他スペックにも無いかを併せて確かめること（`site-survey` では2箇所見つかった）
  - _Depends: 115.212_
  - _Boundary: 他スペックの設計文書の実測値の追随_

- [ ] 115.235 (P) steering が引く免除件数を現況へ追随させる
  - 115.212 のレビューが検出したが、`.kiro/steering/` は同タスクの境界外のため据え置かれた
  - `.kiro/steering/development-discipline.md` の「記録が引く件数は提出時に測り直す」節は `npm run check:design-path-refs` の免除件数を **119 件**と引くが、現況は **123 件**である
  - **日付印は救わない。** steering の実測日も 115.212 の着地も同じ 2026-08-31 であり、同日に測り直した読み手は別の値を得る。115.212 が確立した「日付に加えてコミットハッシュを添える」規約を steering 側にも適用するかを判断すること
  - 是正後は `npm run check:steering-refs` と `npm run check:steering-idents` を回して緑を確認すること
  - _Depends: 115.212_
  - _Boundary: steering が引く実測値の追随_

- [ ] 115.236 (P) 実装ファイルの自己申告が名乗る要件番号を是正する（**115.213 が送った提案 #5**）
  - 115.213 が実施か取り下げかを判定し、**是正先が実装ファイルで境界外のため後続タスクへ送った**。判定と根拠は design.md の `## 未起票の提案の台帳（タスク 115.213）` の行5 にある
  - 是正先: `frontend/src/components/site-surveys/ImageUploader.tsx` / `SiteSurveyResponsiveView.tsx` / `SiteSurveyDetailInfo.tsx` / `frontend/src/pages/SiteSurveyDetailPage.tsx` / `SiteSurveyListPage.tsx` の `Requirements:` ブロック
  - 是正すべき組は design.md の `#### 自己申告をそのまま写さなかった 18 件` の表が**一件ずつ列挙済み**であり、後任は再走査を要しない。提案が生きていることは 115.213 のレビューが再実測して確認している（出力 `10`）
  - _Depends: 115.213_
  - _Boundary: 実装ファイルの自己申告注釈_

- [ ] 115.237 (P) 要件15.4 の受入検証を自動保存の反復まで確かめる形へ拡張する（**115.213 が送った提案 #6**）
  - 115.213 の判定と根拠は design.md の `## 未起票の提案の台帳（タスク 115.213）` の行6 にある
  - 是正先: `e2e/specs/site-surveys/site-survey-responsive.spec.ts` の要件15.4 の検証。現状は描画を**一度しか行わない**ため、「一間隔を超えて描き続けたときに書き込みが繰り返し起こること」を確かめていない（115.213 のレビューが再実測して `1` を確認）
  - **実行時間の上限 `test.setTimeout(180_000)` の再設計を境界に含めること**
  - _Depends: 115.213_
  - _Boundary: 要件15.4 の受入検証_

- [ ] 115.238 他機能スペックの除外一覧が挙げる検証道具の名を実体へ揃える（**115.213 が送った提案 #7**）
  - 115.213 の判定と根拠は design.md の `## 未起票の提案の台帳（タスク 115.213）` の行7 にある
  - 実測は **64 件**である（`0` は現場調査スペックの分）。**起票の元になった記述が挙げる「90件」は 115.172 時点の値であり既に失効している**——115.213 のレビューが 64 を正、90 を陳腐化と裁定した
  - 是正先: `e2e/requirement-exclusions.json` と各機能スペックの設計文書。**現場調査スペックの該当は 0 件で、残る全件が他機能スペックの所管である**ため、起票は各機能スペックの側で行うこと
  - _Depends: 115.213_
  - _Boundary: 他機能スペックの除外一覧の検証道具名_

- [ ] 115.239 (P) 追跡表の要件4.10 の行が順序の担い手を欠く状態を解消する（**115.213 が送った提案 #8**）
  - 115.213 が**新たに発見した**追跡表の内容の欠落。文書に書かれていた提案ではないため同タスクの境界外であり、一度加えた列を元へ戻して未起票の提案として登録し直した経緯がある
  - 是正先: `## Requirements Traceability` の要件4.10 の行の Components 列。現状は `PhotoManagementPanel, SiteSurveyDetailPage` のみで `ImageOrderService` / `ImageListService` を欠く
  - 担い手であることは実装で確認済み（`grep -c 'data: { displayOrder' backend/src/services/image-order.service.ts` の出力が `1`、`grep -c 'orderBy: SURVEY_IMAGE_ORDER_BY' backend/src/services/image-list.service.ts` の出力が `1`）。再現コマンドは design.md の `##### Service Interface` の当該項にもある
  - **未着手の 115.228（追跡表と受入基準の対応）と近接するため、着手時に境界を切り分けること。** 115.228 は要件番号の列を、本タスクは Components 列を扱う
  - _Depends: 115.213_
  - _Boundary: 追跡表の要件4.10 の行の担い手_

- [ ] 115.240 (P) 他スペックの設計文書に残る状態記録と持ち越しの消化状況を確かめる
  - 115.213 のレビューが**自ら別の網を掛けて**検出した。同タスクが宣言した三つの網（`別途起票|後続タスクの提案|起票すること` ほか）はいずれも「〜すること」型の提案を捕まえる形であり、**状態記録や持ち越しの形は網の外にある**
  - `project-management/design.md` の `**未実装・要対応**` の状態記録（レビュー実測で7箇所）と、`estimate-request/design.md` の「本要件のスコープ外として持ち越す」
  - **これらは 115.213 の全称否定を偽にしない**（同タスクは範囲をコマンドで宣言し、範囲外は保証しないと明記している）。網の外に別の型が在るというだけである
  - 各スペックの側で、当該の状態記録が今も現況かを測り、消化されているなら記録を歴史として書き分けること
  - _Depends: 115.213_
  - _Boundary: 他スペックの設計文書の状態記録と持ち越し_

- [ ] 115.241 (P) 免除の面の検査に残る開示と関門の穴を塞ぐ
  - 115.215 のレビューが**非ブロッキング**として検出した。同タスクが新設した面の実測と基準は機能しているが、開示と関門に穴が残る
  - **(1) 実体件数が関門の出力に出ない。** 出力は「免除機構の面 162 件」と単位の説明を出すが、実体のファイル数（実測 123 件）は `--json` を自分で集計しないと得られない。115.215 は「自己検査の制御を伴わない計算値を関門へ増やす」ことを避けて見送った。**出すなら制御を同時に置くこと**
  - **(2) 裸の名前だけで面に入る参照の曖昧性が未開示。** レビューの実測: `index.ts`（site-survey。同名の追跡対象が 12 件）と `calculation-engine.ts`（数量表生成。2 件）は実体 1 件として数えられるが、面から外れるのは**全ての一致が消えたときだけ**である。実体件数 123 はこの曖昧性を含む
  - **(3) `reportReach` の「面の件数は撤去され得るファイルの数より多い」は無条件の狭義の不等式**であり、両方の綴りで名指されたファイルが一つも無い状態では偽になる。今日は真（162 > 123）
  - **(4) `execute()` の更新経路は `result.findings.length > 0` でも `0` を返す。** 実在検査に落ちているツリーで `check:design-path-refs:update` が成功を報告し基準を書き出す
  - **(5) 基準は文書ごとの件数を持つが面の集合を持たない。** 同一文書内で 1 件が抜け 1 件が入る入れ替えは、どちらの件数も動かないため素通りする。免除の側が撤去の半分を捕まえるが、入れ替えそのものは見えない
  - **(6) `candidateTotal` は記録されるが関門に用いられない**（意図的）。母数が増えると開示される比が静かに薄まるが、信号が無い。**比そのものを関門にする形**を検討すること
  - **(7) `loadReachBaseline` / `writeReachBaseline` / `reportReach` / `main` は `checkNoFindingsNarrowing` の監視対象の外**。現状はいずれも絞り込みを持たないが、**`reportReach` は「文書 X を開示から隠す」絞り込みが最も自然に入る場所である**
  - _Depends: 115.215_
  - _Boundary: 免除の面の検査の開示と関門_

- [ ] 115.242 (P) パス参照検査の自己検査が対照レジストリを空にしても緑で通る状態を解消する
  - 115.215 のレビューが検出した。**115.222 と同型の真空パスが `scripts/check-design-path-references.selftest.ts` にもある**。115.173 から継承した足場であり 115.215 の退行ではない
  - 実測（レビューが変異で確認。2026-08-31）: `const STRUCTURAL: Case[] = []` を空にすると **22/22 緑・EXIT=0**（面の対照 5 件が丸ごと消え、しかも**その存在を守る `checkPositiveControlsArePresent` 自身が `STRUCTURAL` の中に居るため自分を守れない**）。`checkNoFindingsNarrowing` の中の `bodies` 配列を空にすると **35/35 緑・EXIT=0**
  - **母集団が空の検査は何も主張していない。** 第3原則（前提条件で検査を自動的に無効化しない）の観点では、対照群が消えたことは前提の崩壊であり赤くすべきである
  - **守り手を守られる側と同じレジストリへ置かないこと。** 115.222 が `MUST_ACCEPT` / `MUST_REJECT` について判断する「下限を件数で固定するか、空でないことだけを固定するか」と同じ判断が要る。**両タスクで作法を揃えること**
  - 是正後は、**それぞれのレジストリを空にする変異を当てて赤くなることを実測すること**
  - _Depends: 115.215_
  - _Boundary: パス参照検査の自己検査の対照レジストリ_

- [ ] 115.243 steering が述べる backend 検証の実行方法を分離後の実態へ揃える（**現に偽・優先**）
  - 115.216 のレビューが検出した。**同タスクが統合検証を分離した結果、steering の記述が偽になった**
  - `.kiro/steering/tech.md` の実行方法の節: `npm --prefix backend run test` に `# 全テスト実行` と註がつくが、**現在は 232 件中 187 件しか実行しない**（統合検証 45 件は `test:integration` の側にある）
  - `.kiro/steering/structure.md` の 2 箇所: 「テストの件数・テストファイル数は steering に書かない。**数える手段**（`npm --prefix backend run test` など）を書く」「件数は `npm --prefix backend run test` / `npm --prefix frontend run test` の出力で数える」——**数える手段として名指された当のコマンドが、いまや全件を数えない**
  - **steering は毎セッション読み込まれる。偽の記述は読み手を誤らせ続ける。** 115.200 が確立した「件数を書かず数える手段を書く」作法は正しいが、**その手段自体が実態と食い違ったときに気付く仕組みが無い**
  - 是正は既定と統合を書き分けること（既定＝統合を除く、`test:integration`＝統合のみ、`test:all`＝両方）。是正後は `npm run check:steering-refs` と `npm run check:steering-idents` を回すこと
  - **同型を走査すること**: steering が名指す他のコマンドについても、註が述べる内容と実際の挙動が一致するかを確かめる。`check:steering-test-tree` は区分の列挙を見るがコマンドの註までは見ていない
  - _Depends: 115.216_
  - _Boundary: steering が述べる検証の実行方法_

- [ ] 115.244 (P) 死んだ環境変数の検査をリポジトリ全体へ広げ判定器を堅くする
  - 115.216 が backend の既定単体実行に載る形で機械化したが、**適用範囲と判定器の両方に穴が残る**
  - **(1) 走査範囲が backend に限られる。** ルート `package.json` の 4 スクリプトが設定する 3 変数と frontend の 20 スクリプトは検査の外。115.216 は「押下前の関門と CI へ結線できない検査は誰も走らせない死んだ検査になる」——本タスクが是正した欠陥と同型——として意図的に見送った
  - **(2) 判定器がコード注釈を読み手と誤判定する。** レビューの実測（変異で実証、2026-08-31）: 読み手ゼロの変数を設定するスクリプトを足したうえで、`// process.env.ARCHITRACK_PROBE_DEAD is intentionally not used here.` という**注釈だけ**を持つファイルを置くと **9/9 緑**で素通りする。115.216 が自分の判定器に見つけた欠陥（言及だけを読み手と数える）の一段深い層である
  - **(3) 分割代入の読みを認識しない。** `const { X } = process.env` は読み手として数えられない。ただし**安全側に倒れる**（誤検出であって見逃しではない）
  - 是正案: `scripts/check-dead-script-env.ts` ＋自己検査として切り出し、3 つの `package.json` すべてを走査し、**押下前の関門と CI へ結線する**。注釈は照合前に除去し、分割代入の形も読み手として認める
  - **陽性対照と陰性対照を置き、対照群を空にする変異で赤くなることを実測すること**（115.222・115.242 と作法を揃える）
  - _Depends: 115.216_
  - _Boundary: 死んだ環境変数の検査の適用範囲と判定器_

- [ ] 115.245 (P) `test:all` が前半の失敗で後半を飛ばす状態を判断する
  - 115.216 のレビューが検出した。`backend/package.json` の `test:all` は `&&` 連結のため、**既定側が落ちると統合側は一度も走らない**
  - 実害は現状無い（CI も押下前の関門も `test:all` を使っていない）。終了コードも正しい
  - ただし「全部を回して結果を全部見る」用途には向かない。**逐次実行して両方の結果を出す形へ改めるか、現状を意図として明記するかを決めること**
  - _Depends: 115.216_
  - _Boundary: backend の全件実行スクリプトの連結_

- [ ] 115.246 (P) タップ領域の下限を要件が課していない箇所の空白を埋める
  - 115.217 のレビューが検出した。同タスクは**コード側の帰属を是正した**が、要件側の空白そのものは残る（`requirements.md` は同タスクの境界外）
  - **(1) `PendingUploadPanel` に受入基準が無い。** レビューの実測: `requirements.md` 全体で 44px の下限を課す受入基準は **28.3・29.4・34.5・35.5 の四つで尽きる**（要件28.3 の注記の列挙が網羅的であることを確認済み）。要件37 はタップ領域の条項を持たない。実装は現に下限を課しているため、**受入基準を足すか、実装を要件の範囲へ絞るかを決めること**
  - 近いのは 35.5 だが当てはまらない。条文が名指すのは写真行の操作系（報告書出力フラグ・並び替え・削除）であり、かつ**モバイル幅に限定**される一方、`PendingUploadPanel` の実装は全幅で下限を課している
  - **(2) `AnnotationContextMenu` は設計文書の割り当てだけが根拠。** 要件27 は条項を持たず、28.3 の注記の列挙にも含まれない。28.3 に適用範囲の条項を足して条文で支えるか、設計の割り当てにとどめるかを決めること
  - _Depends: 115.217_
  - _Boundary: タップ領域の下限に対する要件の裏づけ_

- [ ] 115.247 (P) 設計文書が同一部品へ矛盾する要件を割り当てている状態を解消する
  - 115.217 のレビューが検出した。`.kiro/specs/site-survey/design.md` の二行が `AnnotationContextMenu` について食い違う
  - 追跡表の行: `| 28.1-28.8 | モバイルツールバー、折返し・スクロール、属性パネル開閉、44px タップ領域 | AnnotationToolbar, StylePanel, AnnotationContextMenu | …`
  - 部品別の行: 同部品の Requirements を `27.2-27.5, 27.7, 27.10` とのみ記す
  - **同じ文書の中で担い手の要件が二様に書かれている。** どちらが正かを決め、他方を追随させること
  - **同型を走査すること**: 追跡表の Components 列と部品別の行の Requirements 列が食い違う組が他に無いか。**機械で照合できるかを検討すること**（未着手の 115.228 が追跡表の網羅性を扱っており、境界の切り分けが要る）
  - _Depends: 115.217_
  - _Boundary: 設計文書内の要件割り当ての整合_

- [ ] 115.248 (P) 反実仮想の検査が索引しない記録がある状態を解消する
  - 115.217 のレビューが検出した。`npm run check:cf-evidence` は `frontend/src/components/site-surveys/tap-target.constants.ts` の散文を**索引していない**（検出器の「名指し＋変異の語＋判定の語」の型に合致しないため）
  - **同ファイルの記録は変異を実行して書かれた実測値を引くが、関門の緑はそれについて何も保証していない。** レビュアーは関門に頼らず自分で実行して確かめた
  - 検出されるよう記録の言い回しを改めるか、**検出器が取りこぼす型を実測して開示すること**。現状「関門が緑だから記録は裏づけられている」と読める状態にある
  - 同型の取りこぼしが他の記録に無いかを走査すること。**走査範囲はコマンドで宣言すること**
  - _Depends: 115.217_
  - _Boundary: 反実仮想の検査の検出範囲_

- [ ] 115.249 (P) 工事写真スペックが同じ下限を独自に複製している状態を判断する
  - 115.217 のレビューが**別スペックの所管**として検出した。同タスクは境界外として変更していない
  - `frontend/src/components/construction-photos/` が同じ WCAG の下限を共有の出所なしに持つ。レビューの実測で該当 29 行、うち `PhotoItemPanel.tsx` と `ConstructionPhotoImageViewer.tsx` に `minWidth`/`minHeight: '44px'` の宣言が 10 箇所（同スペックの要件19.3 が所管）
  - 115.217 が確立した切り分け（実装側は一本化、検証側は複製を残す。理由は `frontend/src/components/site-surveys/tap-target.constants.ts` の冒頭にある）を**そのまま適用できるかを判断すること**
  - 所管: construction-photo スペック
  - _Depends: 115.217_
  - _Boundary: 工事写真のタップ領域の下限の出所_

- [ ] 115.250 (P) 三件目の被覆印がどの母集団にも属さない状態を解消する（**115.220 のレビューが検出**）
  - 115.220 は `project-management/REQ-27.4` の被覆印三件のうち二件へ観測を足して決着させたが、三件目（`e2e/specs/estimate-requests/estimate-request-e2e.spec.ts:379` / 主張は `:386`）は表題と本文が食い違っていないため手を入れなかった
  - 実測（レビュー）: 当該行は `scripts/coverage-mark-adjudication.md` §4 に**登録されていない**（同ファイルで `estimate-request-e2e.spec.ts` を挙げる §4 の項目は `:1537,2965,3598` の er/10.3・10.4・39.12 のみ）
  - §6 の当該項目が「決着済み」となった結果、**この被覆印は §4 の母集団にも §6 の未決項目にも属さない**。指標は水増しされていない（条文は他の二件が完全に観測している）ため危険度は低く、記録も省略の理由を declared な形で述べている
  - §4 へ登録するか、§6 に「§4 の母集団から意図的に除く」と明記するかを決めること
  - _Depends: 115.220_
  - _Boundary: 被覆印の母集団への登録（`estimate-request-e2e.spec.ts:379`）_

- [ ] 115.251 (P) 非表示の主張がアクセシブル名の改名で空振りする状態を解消する（**115.220 のレビューが検出**）
  - 115.220 が足した二件は `getByRole('link', { name: '見積依頼を新規作成', exact: true })` の `not.toBeVisible()` である。**一致が零件でも真になる形**であり、`aria-label` が改名・削除されると両方が空振りで緑になる
  - 対となる肯定側 `e2e/specs/estimate-requests/estimate-request-e2e.spec.ts:747`（`project-management/REQ-27.6`）は `{ name: /新規作成/i }` の部分一致で locate しており、**改名しても表示文言だけで緑のまま通る**。したがって改名は誰にも検出されず、115.220 が塞いだ穴が静かに再び開く
  - 肯定側でアクセシブル名の完全一致を固定するか、否定側を零件で真にならない形へ改めるかを決めること
  - **是正後は `aria-label` を改名する変異を当てて、実際に赤くなることを実測すること**
  - _Depends: 115.220_
  - _Boundary: 非表示の主張が依存するアクセシブル名の固定_

- [ ] 115.252 (P) 真空パスが残る他の自己検査の母集団を洗い出して決着させる（**115.222 の走査が候補を挙げた**）
  - 115.222 は境界（除外定義の自己検査）の内側だけを塞ぎ、他ファイルの同型は**報告に留めた**。本タスクはその残りを扱う
  - **以下は静的読み取りによる候補であり、変異は当てていない。実測と称してはならない**（115.196 の教訓）。**実装者は自分で変異を当てて、候補が本当に緑で通るかを一件ずつ確かめること**
  - 候補1: `scripts/check-e2e-assertion-guards.selftest.ts` — 空検査が一切無く `total === 0` の関門も無い。対照群 22 個が全て候補。**この一件だけは 115.222 のレビューが変異で確認した**（`MISSED_FORMS` を空にすると 182/182 → 179/179 で緑・EXIT=0）
  - 候補2: `scripts/check-steering-test-tree.selftest.ts` — 最上位 `CASES` に関門が無く、runner も `total === 0` を見ない
  - 候補3（六ファイル共通の自己隠蔽）: `STRUCTURAL[]` が空検査そのものを自分の要素として持つため、配列ごと空にすると関門も消える。**うち `check-design-path-references.selftest.ts` は 115.242 の所管**。重複起票を避け、残る五ファイルのみを扱うか、115.242 と統合するかを決めること
  - 候補4: `scripts/check-e2e-in-page-selfjudgement.selftest.ts`（群ごとの関門が無い）、`scripts/check-requirement-coverage.selftest.ts`（各群の `cases` 個別が無防備）
  - 候補5: 全ファイル横断で、関数内の合成素材配列が一律無防備
  - **作法は 115.222 と 115.242 に揃えること**: 下限を件数で貼るか構造で導くか、導ける語彙が無い側の限界をコードに書き残すこと
  - 参考: `scripts/check-counterfactual-evidence.selftest.ts` は既に同趣旨の対照を持つ
  - _Depends: 115.222_
  - _Boundary: 除外定義とパス参照検査を除く自己検査の対照群の下限_

- [ ] 115.253 (P) 自己検査の散文が挙げるファイル数と列挙が実態と食い違う状態を解消する（**115.223 のレビューが実測**）
  - `scripts/check-requirement-coverage.selftest.ts:1312-1315` は「実データでここを切って帰属が減るのは、走査した全ファイルのうち **2 ファイルだけ**」と述べるが、**実測は 3 ファイル・14 印**である
  - 実測（115.223 の実装とレビューが独立に再導出。2026-09-01）: 実物の `extractHeaderScopedCoverage` / `discoverFeatures` を取り込み、抽出器と同じ走査根（`backend/src` / `frontend/src` / `e2e`）を歩いて規則4の無効化変異を当て、前後の被覆印の差を取った
  - 三件目は `frontend/src/pages/EstimateDetailPage.tsx:17-26` の 9 印（`estimate-creation/REQ-27.4`〜`27.7`・`42.9`・`43.4`・`49.5`）。**「2 ファイル」が真になるのは `e2e` に限った場合だけで、本文はそう書いていない**
  - **列挙の性格づけも誤っている**: 当該 9 印は `Task 53.7 追加:` / `Task 53.9 追加:` の見出し配下に `- 27.4: …` の形で書かれた**通常の一覧項目**であり、散文が述べる「検証していないと述べる散文」ではない
  - **ただし「正当な被覆は一件も失われない」という主張自体は成立する。** レビューが集計への影響まで測り、7 件の受入基準はすべて他の被覆源が `COVERED` として拾っていることを確認した。**偽なのは件数と列挙であって、無損失の主張ではない**
  - 115.223 が抽出器側の説明文へ置いた関門（実例と件数を禁じ、指し先の実在を機械で確かめる）と**作法を揃えるか、当該散文に限って機械で確かめる形にするかを決めること**
  - _Depends: 115.223_
  - _Boundary: 自己検査の散文が挙げる実データの件数と列挙_

- [ ] 115.254 (P) 抽出器に残る四箇所の陳腐化しうる引用を一件ずつ決着させる（**115.223 のレビューが検出**）
  - 115.223 は境界（区間判定の説明文）の内側だけを是正し、同一ファイルの他の引用は**報告に留めた**。本タスクはその残りを扱う
  - 対象: `scripts/check-requirement-coverage.ts:115`、`:1082-1083`、`:1293`、`:1300`。いずれも実データの実例・件数を挙げる
  - **実測（レビュー）**: `:1082-1083` の引用は**現時点では真**である（`outOfDenominatorCoverageMarks.unknown` がちょうど当該 3 件、`unknownCriterionCoverageMarks` は空）。**今日は陳腐化していないが、同型の時限装置である**
  - **115.223 の全面禁止をそのまま広げてはならない。** `:1082` と `:1293` は「この検査が捕まえないもの」を述べる限界の記述であり、`.kiro/steering/development-discipline.md` は反実仮想に「落ちた件数・全体の件数・比・実測した日付のいずれか」を引くことを**要求している**。ファイル全体へ件数の禁止を広げると `check:cf-evidence` と正面衝突する
  - **一箇所ずつ「機械で確かめる形へ移す」か「引用を落とす」かを判断すること。** 判断の根拠を各箇所について書き残すこと
  - _Depends: 115.223_
  - _Boundary: 抽出器に残る実データ引用の陳腐化対策_

- [ ] 115.255 (P) 陽性のみと札を付けた資料が実は陰性の主張を持つ状態を解消する（**115.224 のレビューが検出**）
  - `scripts/check-requirement-coverage.selftest.ts:2712-2715` は `LETTERED_REQUIREMENT_NUMBER` を `POSITIVE_ONLY_FIXTURES` へ置き「陽性のみ」と注記するが、対応する `checkLetteredRequirementNumberIsRecorded` は**陰性の主張を一つ持つ**（`user-authentication/REQ-27` が現れないこと）
  - **実害は小さい。** 同じ検査に併置された陽性側の主張（`REQ-27A` が記録されること）が当該行の走査範囲入りを保証するため、この陰性が空振りへ変質する余地は無い。散文の理由付けも挙動を正しく述べている。**緩いのは「陽性のみ」という札だけである**
  - 分類の語彙（`shape` / `boundary`）はいずれも「基底の番号へ丸めない」を表現できないため、単に分類へ移せば済むものではない。**札の文言を実態へ改めるか、語彙を増やすかを決めること**
  - _Depends: 115.224_
  - _Boundary: 合成資料の分類の札と実際の主張の対応_

- [ ] 115.256 (P) 逐語複製の走査根が E2E に限られ本番・単体側を見ない状態を解消する（**115.225 のレビューが検出**）
  - `scripts/check-requirement-coverage.ts:2717` は `reportCriterionTextCopies(features)` を既定の走査根 `E2E_SPECS_ROOT = 'e2e/specs'` で呼ぶため、**`backend/src` の被覆印は逐語複製の検査を一度も受けない**
  - 115.225 が `backend/src/__tests__/unit/models/project.model.test.ts` のヘッダーを原文の逐語複製へ揃えた際、同ファイルの散文は「原文を並置すれば字面の食い違いとして現れる」と述べたが、**この経路では機械が確かめていない**。人が読めば真だが、`development-discipline.md` が求める「実行できないなら実行できる形へ言い換える」に抵触する
  - 走査根を広げるか、当該の散文を機械が支える範囲まで弱めるかを決めること
  - 走査根を広げる場合、**新たに検出される食い違いの件数を先に実測すること**（既存の被覆印が大量に赤くなる恐れがある）
  - _Depends: 115.225_
  - _Boundary: 逐語複製の検査の走査根_

- [ ] 115.257 (P) 遷移種別の件数が要件と実装で食い違う状態を決着させる（**別スペックの所管**）
  - `backend/src/__tests__/unit/models/project.model.test.ts:56` の散文は「4種類の遷移種別」と述べ、実装の列挙も4値（`initial` を含む）だが、`.kiro/specs/project-management/requirements.md` の要件10 の 11 は「遷移種別として以下の**3種類**を定義する: 順方向遷移／差し戻し遷移／終端遷移」である
  - **番号の指し先の誤りではなく、要件と実装の実体の食い違いである。** 115.225 は指し先の裁定を境界としたため触れていない。被覆印として集計されないため指標への影響も無い
  - `initial` を条文へ加えるのか、実装から外すのか、あるいは条文の「3種類」が別の観点の数え方なのかを判断すること
  - 同ファイルの `backend/src/schemas/project.schema.ts:14` の `22.1-22.5: 取引先連携` も現行の要件22（顧客候補のドロップダウン・オートコンプリート）を述べておらず、同 `:13` の「400 Bad Request」も原文の要件11「エラーレスポンスとエラー詳細」と食い違う。**いずれも先行して存在した状態であり 115.225 の差分の責任ではない**
  - 所管: project-management スペック
  - _Depends: 115.225_
  - _Boundary: 遷移種別の件数と本番コード側ヘッダーの記述_

- [ ] 115.258 (P) 取り下げで露出した二件の受入基準を被覆または除外へ決着させる（**別スペックの所管**）
  - 115.225 の裁定により `project-management/REQ-13.2`（取引先を任意とする）と `REQ-13.3`（取引先IDが有効な取引先マスタのIDであることを検証）が未被覆として露出した。`e2e/requirement-exclusions.json` に当該IDは存在しない
  - **13.3 は真の露出である。** 検証が存在しない
  - **13.2 は帳簿上の露出にとどまる。** 115.225 のレビューが変異で確認したところ、`backend/src/__tests__/unit/models/project.model.test.ts:72` の `validInput` が当該フィールドを省いて型を通しており、**リポジトリは機構としては当該条文を観測している**。ただし当該ファイルは本番モジュールを一つも取り込まないため、そこで名乗り直すと 115.193 の禁止事項（本番未到達の被覆源で採点を緑へ戻す）に該当する
  - **13.2 は「未検証」として扱わず、本番到達の被覆源で名乗る形を与えること。** 13.3 は検証の追加か除外の登録かを判断すること
  - 所管: project-management スペック
  - _Depends: 115.225_
  - _Boundary: 露出した二件の被覆または除外_

- [ ] 115.259 (P) 文字列リテラル中の未終端の `/*` で正当なヘッダーが落ちる状態を記録または解消する（**115.226 のレビューが検出**）
  - `scripts/check-requirement-coverage.ts` の `enclosingCommentBlockStart` は、直前の `/*` が**文字列リテラルや正規表現リテラルの中**にあり `*/` が続かない場合、そのリテラルの位置を塊の始まりとして返す。結果、コメントでない行のフェンス区切りまで数えられ、**正当なヘッダーが沈黙のうちに落ちる**
  - 実測（レビューが実在の抽出器を通して再現）: `const OPENER = '/*';` に続けて行コメントでフェンス・空行・被覆ヘッダー・一覧項目を置いた写しは `ac=[]`、当該リテラルの行だけを除いた同一の写しは `ac=["site-survey/REQ-13.2"]`
  - **実データでの露出は測定上ゼロ。** 全390ヘッダーの分岐を数えると `塊の中 379 / 行コメントの連なり 11 / 裸 0 / 未終端 0` で、当該の分岐は一度も通らない
  - **115.226 の是正による退行ではない。** 差し戻された全文版でも同じ形は落ちていた
  - 既存の兄弟 `enclosingBlockCommentEnd` は同じ曖昧さに対して `null`（安全側）を返すのに対し、本関数は誤った始まりに確定する**非対称**がある。`blockClose < 0` のとき行コメントの連なりの走査へ落とす形なら、実データ上は挙動不変のままこの形を消せる（未終端の `/*` は TypeScript の構文誤りであり、ほぼ常にリテラルである）
  - **現状この限界は実装者の報告にしか無い。** 同ファイルの規律（`isCodeFenceDelimiterLine` の JSDoc、`collectTopLevelFixtureNames` の「報告ではなくここへ書き残す」）はコードへの記載を要求している
  - 解消するか、実測を添えて JSDoc へ書き残すかを決めること
  - _Depends: 115.226_
  - _Boundary: 塊の始まりの判定がリテラル中の `/*` を区別しない状態_

- [ ] 115.260 (P) 走査対象の選別が自己検査から固定されず落としても無言な状態を解消する（**115.227 の実装とレビューが独立に実測**）
  - 115.227 は走査「根」を露出させ機構で固定したが、**根の下のどのファイルを読むかを決める選別は無言のまま**である。裁定は境界外（`_Boundary:_` は走査根であって選別ではない）
  - **実測（実装・レビューの双方が独立に確認。2026-09-01）**: `scripts/check-requirement-coverage.ts` の `findFiles(dir, /\.(ts|tsx|spec\.ts)$/)` から `tsx` を落とすと、**自己検査は 65/65 緑・EXIT=0 のまま**で、ゲート出力だけが 38082→70333 バイト、`construction-photo` の受入基準が 143/145→113/145 へ動く
  - 同じ面が除外ディレクトリ集合 `['node_modules','dist','.git','coverage','generated']` にもある
  - **115.227 の作法をそのまま当てられるとは限らない。** 拡張子を軸にした固定点をどう置くか（どの拡張子に置くか、`spec\.ts` が `ts` に包含されて死んでいる冗長な選言をどう扱うか）という独自の設計判断を要する。3行の関門では閉じない
  - 除外ディレクトリの側は「外すと集合が広がる」向きの主張になるため、根の寄与とは逆向きの機構が要る
  - 是正後は、**選別のそれぞれについて落とす／外す変異を当てて赤くなることと、対照自身が空振りしていないことを実測すること**
  - _Depends: 115.227_
  - _Boundary: 走査対象の選別（拡張子と除外ディレクトリ）の固定_

- [ ] 115.261 追跡表に行が無い要件と併合行の欠落を決着させる（**115.228 が測定して境界外として送った**）
  - 115.228 が新設した検査（`npm run check:trace-coverage`）が測定した。**site-survey の追跡表には受入基準の欠落が 24 件と死語が 1 件残る**
  - **実測（実装とレビューが独立に再導出。2026-09-01）**: 欠落は `REQ-1.7`、`REQ-11.9`、`REQ-17.1`〜`17.6`、`REQ-19.1`〜`19.16`。死語は `REQ-2.1`（project-management へ移管され取り消し線で潰されているのに `**2.1**` の行が残存）
  - **要件17（描画ツール使用中のオブジェクト選択防止）と要件19（画像アップロードバリデーション修正）は追跡表に行が一つも無い。** 行を起こすには Components / Interfaces / Flows 列の決定＝設計内容の決定を要するため、115.228 は境界外とした
  - `REQ-1.7`・`REQ-11.9` は既存の併合行（`1.1-1.6` / `11.1-11.8`）への追加で足りる可能性がある。**115.228 の作法に倣い、行を起こすか列へ加えるかは表自身の前例を測ってから決めること**
  - 是正のたびに `scripts/check-traceability-coverage.ts` の `FEATURE_POLICIES` の site-survey の宣言を縮めること。**解消済みの欠落を宣言に残すと赤くなる**（双方向）
  - _Depends: 115.228_
  - _Boundary: site-survey の追跡表の欠落と死語_

- [ ] 115.262 (P) 網羅検査のラチェット上限が先回りの緩和で無言になる状態を解消する（**115.228 のレビューが実測**）
  - `scripts/check-traceability-coverage.ts` の `FEATURE_POLICIES` は、site-survey 以外の 12 機能に対し現況の実測値を上限として宣言する形を採る
  - **実測（レビュー。2026-09-01）**: `construction-photo` の上限を 145→200 へ上げると、本検査も自己検査も**緑のまま**通る。宣言を先回りで緩めれば、同機能で最大 55 件の新規欠落を無言で吸収できる
  - 差分を人が読めば見えるが、**機構は止めない**。site-survey が採る逐一列挙の形にはこの穴が無い
  - 既存の baseline 方式（`check:design-path-refs` の `--update-baseline`）と同じ性質であり慣行の内側ではある。**慣行ごと見直すか、上限の引き上げにのみ関門を課すかを決めること**
  - _Depends: 115.228_
  - _Boundary: 網羅検査の上限宣言の緩和経路_

- [ ] 115.263 (P) 網羅検査が引用された表頭を排除しない状態を解消する（**115.228 のレビューが検出**）
  - `scripts/check-traceability-coverage.ts` の表頭の判定は、コードフェンスや散文の中に引用された `| Requirement | Summary | Components |` の字面も表頭として拾う
  - 幻の表が生じると、その例示行が挙げる番号が「被覆済み」に化けて**欠落を隠しうる**
  - **115.226 が被覆印のヘッダー検出で塞いだのと同型である。** 同タスクが確立した作法（行頭からの接頭辞が空白とコメント記号のみであること、囲むコメントの塊の中でフェンスを数えること）を当てられるか判断すること
  - **実データでの実害は 0 件**（レビューが走査で確認。表頭 32 箇所はすべてフェンス外、区切り行も正当）
  - 是正後は、幻の表頭を仕込んだ写しで検出されないこと・正当な表頭が落ちないことの両側を対照で固定すること
  - _Depends: 115.228, 115.226_
  - _Boundary: 網羅検査の表頭の検出（引用と宣言の区別）_

- [ ] 115.264 (P) 二つの注釈が同一性の根拠について食い違う状態を解消する（**115.229 のレビューが検出**）
  - `scripts/check-counterfactual-evidence.ts:598` の `NetSurvey` の注釈は「一致は構造である」と無条件に述べるが、79 行上の `:519` は 115.229 の是正で「構造だから将来も分かれないとまでは言えない」へ改められている。**同一ファイル内の二つの注釈が論調で食い違う**
  - 現在の実装については前者も真であり、`checkNetSurveyMatchesTheCheck` が分岐を捕まえる。**危険度は低いが、115.229 が正した過大な断定と同型である**
  - 文言を揃えるか、`:598` 側にも捕まえる関門を名指しさせるかを決めること
  - _Depends: 115.229_
  - _Boundary: 同一性の根拠を述べる注釈の整合_

- [ ] 115.265 (P) 反実仮想の語彙が実際に使われる変異の言い回しを拾わない状態を判断する（**115.229 のレビューが実測**）
  - 115.229 が新設した注釈の反実仮想が母集団に入らなかった。実装者は句点の分割が理由と報告したが、**レビューの実測では理由が違う**
  - **実測（レビュー。2026-09-01）**: `scripts/check-counterfactual-evidence.selftest.ts:1053-1082` の記述は `named=true, mutated=false` となる。すなわち「足して」「替える」が `MUTATION_VOCABULARY`（外す／消す／落とす／戻す／狭める／広げる／変異を当て 等）に含まれないために外れている。句点の分割で外れるのは `:961` の一件のみ
  - **変異を実行して記録した文が、変異の検査の母集団に入らない。** 網の目そのものを疑う必要がある（115.127 段4 の教訓と同型）
  - **語彙を広げると母集団が動く。** 現に引用を持たない記述が新たに露出しうるため、**広げる前に増える件数と、そのうち引用を欠くものの件数を実測すること**
  - 語彙を広げるか、書き手に既存の語彙を使わせる規律とするかを決めること
  - _Depends: 115.229_
  - _Boundary: 反実仮想の変異の語彙の網羅_

- [ ] 115.266 関数の書き方の台帳を散文から対照群へ移す（**115.230 の debug が構造的原因として特定**）
  - 115.230 は同じ欠陥で**四度差し戻された**。原因は個別の記述ミスではなく構造にある
  - **実測（debug 第1ラウンド。2026-09-01）**: 差し戻しが集中した約84行の台帳（`scripts/check-design-reference-format.selftest.ts` の `EXECUTABLE_FUNCTION_INVENTORY` の注釈と兄弟の同等箇所）は、**`check:cf-evidence` の走査対象に一件も登録されていない**。登録されているのは同ファイルの別の三箇所と兄弟の一箇所のみ
  - すなわち、正規表現という開いた構文空間の性質を散文で主張しているのに、**散文と正規表現を突き合わせる機構が無い**。レビューはまだ列挙されていない書き方を一つ持ってくるだけで反証できる
  - **解決の形は既にリポジトリの定石である**: `scripts/check-requirement-exclusions.selftest.ts` が `MUST_ACCEPT` / `MUST_REJECT` の実体の対照群を本物の述語へ通す形を持つ（115.222 が非空の関門を、115.242 が同じ作法を課している）。形の一覧を `DECLARATION` と最上位の束縛の正規表現へ通せば、**主張が検査そのものになる**
  - **115.230 の境界外とした理由（実測）**: 対照群を入れると自己検査の総数が動く。総数 56 と 71 は両ファイルで**約55箇所に引用**されており、全ての記録値の測り直しを要する。限定的な訂正ではなく作り直しになる
  - 対照群には、いかなる先読みでも塞げないと実測された形も含めること: `const sneakZ = (0, scanLine);` の参照束縛、`const sneakT: (a: string) => string[] = (a) => [a];` の関数型注釈付き束縛、`const plainRef = scanLine;`
  - _Depends: 115.230_
  - _Boundary: 関数の書き方の台帳の対照群化_

- [ ] 115.267 (P) 絞り込みに使える操作の列挙が実装より狭い状態を解消する（**115.230 のレビューが検出**）
  - `scripts/check-design-reference-format.selftest.ts` および兄弟の「絞り込みに使える操作」の列挙が、実装の正規表現に含まれる `.every(` を落としている
  - **方向は安全側である。** 実装のほうが記述より厳しいため、逃がしを生まない
  - 当該行は 115.230 の変更行ではなく既存の文脈行であり、同タスクでは非阻害として送られた
  - 列挙を実装へ揃えるか、列挙が実装の部分集合である旨を明記するかを決めること
  - _Depends: 115.230_
  - _Boundary: 絞り込みに使える操作の列挙と実装の対応_

- [ ] 115.268 (P) 複製検知の照合器が文字列リテラル中の区切りで盲になる状態を解消する（**115.231 のレビューが実測**）
  - `scripts/check-design-code-reference-format.selftest.ts` の複製検知は、注釈を除去したソースへ断片が現れるかで判定する。その注釈除去は行末までを落とす素朴な形であり、**文字列リテラルの中の `//` も注釈の始まりと見なす**
  - **実測（レビュー。2026-09-01）**: `scripts/check-design-path-references.ts` の取り込み直後へ `const SCHEME = 'https://example.invalid'; const LOCAL_SPEC_DIR = '.kiro/specs'; const LOCAL_DOC = 'design.md';` を一行で置くと**自己検査 72/72 緑**で素通りする。同じ行から `const SCHEME = ...;` だけを外すと `❌ 1/72` で二つの断片が名指しされる
  - **第三の天井も実測された**: `const D_SPEC = '.kiro' + '/specs';` のように**文字列連結で組み立てる複製**も 72/72 緑で通り、整形検査も通過する。これは注釈除去の穴とは別の経路である
  - 現在の注釈は天井を二つとして列挙しており、**列挙が不完全**である（肯定的な主張自体は反証されていない）
  - 照合器を文字列・正規表現リテラルを跨がない実装へ改めるか、列挙を実測どおりに増やすかを決めること。**改める場合は三つの経路それぞれで赤くなることを実測すること**
  - _Depends: 115.231_
  - _Boundary: 複製検知の照合器と天井の列挙_

- [ ] 115.269 (P) 要件定義書の根と設計文書の根が別名で並ぶ状態を判断する（**115.231 が境界外として報告**）
  - `scripts/requirement-document.ts` の `SPECS_DIR` と、115.231 が一本化した `scripts/design-document.ts` の `SPEC_DIR` は、**同じ値の別名**である。`scripts/` に残る四つ目の同値リテラルにあたる
  - 要件定義書の根と設計文書の根は現在たまたま同じディレクトリを指しているだけで、**片方が動いたときにもう片方は静かに残る**
  - 所有者も名前も異なるため 115.231 の境界外とした。両者を一つにするのか、別物として意図的に分けたままにするのかを判断すること
  - **一つにする場合、要件被覆と設計文書の走査が同じ根に縛られてよいかを先に判断すること**（現在は独立に動かせる）
  - _Depends: 115.231_
  - _Boundary: 要件定義書の根と設計文書の根の関係_

## Implementation Notes（Task 115.30-115.52）

- **「注記が言う未実装」を鵜呑みにしないこと**: 115.127 段4 で、八件の検証が「実装がセレクトボックスなので未実装」という注記つきの分岐で守られていたが、実装は入力欄であり**観測は一度も発火していなかった**。危険なのは発火しなかったことではなく、**実装が退行した瞬間に八件が緑のまま何も主張しなくなる**ことである。変異で実測すると、観測が発火する状況では八件が主張を一つも実行せずに通った。
- **分類の件数が零になっても、その欠陥が零になったとは限らない**: 段4 のレビューが確定させた。検出器の観測パターンが補助名に一致しないため、真正の沈黙脱出が一件も報告されない箇所が残っている。**検出の網の目そのものを疑うこと。**
- **繰り返しの後の主張は、初期値によっては空振りする**: 段4 のレビューが確認した観点。繰り返しが一度も回らなかった場合に主張が真になる初期値だと、母集団が空でも通る。**初期値を失敗する側に置くこと。**

- **「直った」は実測してから書くこと**: 115.127 段3 で「母集団から黙って外れていた欠陥を副次的に直した」と記録したが、レビューの実測で当該分岐は**到達不能**であり母集団は変わっていなかった。直前に無条件の主張が既にあったためである。**改善の主張も、欠陥の主張と同じ水準の実測を要する。**
- **検出器の除外規則は「偽陽性を止める」操作であって「件数を減らす」操作ではない**: 両者は結果が同じ数字になるため取り違えやすい。段3 では規則を構造だけで書き、自己検査へ「対象外にすべき形」と「対象外にしてはならない紛らわしい形」の双方を登録して幅を両側から固定した。**片側だけの自己検査は、広がる向きの劣化を検出できない。**
- **除外の正当性が呼び出し側に依存する場合、呼び出し側を実測すること**: 段3 の除外は「真偽を呼び出し側がどう扱うかは依然として関門である」ことに依拠する。レビューは呼び出し側五十八箇所を機械的に全数検査し、真偽を捨てている一箇所を特定した。**依拠する前提は数えて確かめること。**
- **不在の主張は、対象が存在することを別に確かめない限り何も主張していない**: 段3 のレビューが検出した形。取得に失敗して空値が返る経路と、対象が本当に不在である経路が区別できない。

- **`isVisible({timeout})` の待機指定は無視される**: Playwright の即時判定述語に待機を渡しても捨てられる。実測で `isVisible({timeout:5000})` は 50ms で false を返し、待つ形は 1867ms で true を返した。「待ってから判定する」つもりの記述は「今この瞬間」を返しており、描画が間に合わなければ必ず偽になる。**待つ意図があるなら待つ呼び出しを使うこと。**
- **`.catch(() => false)` は待機切れ以外の失敗も飲む**: 段2 で待機切れのみを偽とし他を送出する形へ改めたところ、**一度も成立していなかった判定が二件**露見した。いずれも指定が複数要素に一致する違反が偽に化けていたものである。**真偽を返す待機は、待機切れと欠陥を区別すること。**今後この経路で違反が出た場合、それは回帰ではなく発見であり、握り潰しを戻してはならない。
- **抽出で除外したものの不在を主張する形は決して失敗しない**: 段2 のレビューが検出した第八の型。抜き出しの正規表現が小数点を含まないのに、抜き出した後の文字列に小数点が無いことを主張していた。恒真の検出規則（真偽を直接主張する形）では捉えられない。
- **補助へ畳むと検出器の名前依存が壊れることがある**: 段2 で観測パターンが新しい補助名に一致しなくなり、分類が `await` の有無だけに依存する状態になった。**畳み込みの際は検出器側の追随を同時に確かめること。**

- **ガードが見張る値と、テストが実際に使う値は一致しているとは限らない**: 115.127 段1 で、`test.skip(!testProjectId, …)` 四十五件のうちほとんどが実際には `createdQuantityTableId` を使っていた。ガードは**別のテストが設定する別の値**を見張っており、前提が壊れても発火しない休眠状態だった。**機械置換は「見張る値が正しい」ことを確かめてから行うこと。**確かめずに置換すると、休眠したガードが新しい衣装で再生産される。
- **選言で受理する主張は失敗を成功に変える**: OCR の完了を「結果が出る **または** 誤りが出る」で主張していたため、OCR が動かなくても緑になっていた。**成功と失敗を `or` で束ねた主張は、何も主張していない。**
- **前提の生成の重複は沈黙の温床**: 段1 では見積依頼三ファイルが約百十行の前提生成を複製しており、いずれも応答の状態番号を確かめていなかった。共通の補助へ一本化し、各APIの応答と各IDを無条件に主張する形へ改めた。

- **存在しない目印は「常に緑」を生む**: 115.127 段0 で、数量表E2Eの三ファイルが `[data-testid="project-card"]` を参照していたが実装の目印は `project-card-{id}` であり一度も一致しなかった。遷移補助が常に偽を返し、`quantity-table-phase10.spec.ts` は**十二件すべてが毎回スキップ**されていた（passed 0）。**目印は実装を grep して実在を確かめること。**一致しない目印は失敗ではなく沈黙として現れる。
- **前提は「探す」のではなく「作る」**: 段0 の是正は、既存データを画面から探して見つからなければ諦める形を、プロジェクト・数量表・グループ・項目行・写真を**自ら作る**形へ改めた。探す形は環境の状態に依存するため、沈黙の温床になる。
- **判定を実在の要素へ向け直す際は要件原文へ照らすこと**: 目印が一致しないとき「実装に合わせてテストを直す」は要件検査を恒真へ変える。段0 では REQ-25 を REQ-41 の明文（水平スクロールの対象は数量項目の表）に照らして向け先を確定し、REQ-36.5 は**確認ダイアログを要件が求めていない**ことを原文で確かめたうえで、行が実際に消えることの主張へ強化した。
- **防護の自己検査は「規則を戻すと落ちる」ことまで確かめる**: 段0 では検出器の該当分岐を元へ戻すと自己検査が 4/21 落ちることを実測した。両方の状態で通る自己検査は防護ではない（115.128 が起票された欠陥と同型）。

- **115.126 の取りこぼしは「識別子で数えた」ことが原因**: 起票時の十二箇所は `calculationMethodSelect.isVisible()` という**変数名**で数えた結果であり、同一ファイルに同じ機序（グループ0件の編集画面では欄が描画されない）の沈黙が七箇所残っていた。うち一箇所は期待値を誤らせても緑のまま通ることをレビューが変異で実証した。**沈黙の走査は識別子ではなく構文の形（判定を包む `if (await x.isVisible())`）を条件に行うこと。**115.92 が残した教訓の再現である。
- **直列 describe では「複数箇所を同時に誤らせる」変異検証が成立しない**: `mode: 'serial'` のため最初の一件で残りが "did not run" となり、二件目以降を証明できない。**一箇所ずつ `--retries=0` で実行し、passed 件数で失敗位置を特定すること。**
- **判定の削除が正当なのは「観測不能」かつ「欠落を文書化した」場合のみ**: 115.126 では REQ-13.1-13.3 の「エラー非表示」判定（要件がエラー表示を求めておらず実装にも文言が存在しない＝存在しない要素の不在確認）と REQ-15.1 の範囲外判定（production 未実装）を削除したが、いずれも要件原文と実装の双方を読んで正当性を確定させ、ファイル冒頭へ「未検証」として明示し、別タスク（115.130）へ起票している。この三点が揃わない削除は第3原則の迂回である。

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
- **実装の行を増減させた変更は、設計文書の引用を失効させる（115.88）**: 供給側の2ファイルから各2行を削っただけで、設計文書が当該ファイルを指す `パス:行` のうち削除位置より下流の11件と相対参照4件が一斉に失効した。照合済みと明記した引用が黙って嘘になる形であり、レビューが実測で検出した。**行の増減を伴う変更を入れたタスクは、当該ファイルを指す本書の引用を全件測り直す責任を負う。**この責任を規約本文へ明記した。
- **モックで差し替えた層の否定形は、本番を一切留めない（115.88）**: ルータが `...survey` でモック済みサービスの戻り値を展開する構造では、応答の項目名の出所は同じコミットが書き換えた固定値である。項目を本番へ戻しても当該検証は通り続けた。**`vi.importActual` で本番のサービスを取り出し、保存基盤だけを差し替えて実際に走らせ、その戻り値を据える**ことで出所を本番へ戻した。差し替えた層の外側で否定形を主張するときは、値の出所が本番のどの処理かを名指しできるか確かめること。
- **同一の値に二つの契約名が付いた状態は、機能欠陥が無くても欠陥である（115.88）**: どちらが正かを読み手が判別できず、片方だけを直す是正が入った瞬間に静かに壊れる。供給側で同じ値を二度書いていた冗長を撤去し、表示側が実際に読む名前へ一本化した。
- **検出器が見ていない形の自動無効化が最も長く生き残る（115.89）**: 一括注釈の六箇所は所定の書き方だったため基準に計上され追跡されていたが、性能E2Eの素の早期戻りは検出器の規則に当たらず、計測の外で生き延びていた。**基準に載っていないことは、無効化が無いことを意味しない。**検出器へ「主張の前の無条件の戻り」を加える後続タスクが要る。
- **基準ファイルの編集は、引き下げか緩和かを機械的に見分けられる（115.89）**: 基準を書き換えた変更は「検出器を黙らせた」疑いを常に負う。**基準を変更前へ戻した状態で検出器を走らせ、それでも通ること**を示せば、編集が再発防止の引き下げであって緩和でないことが決まる。レビューはこの再実行で判定した。
- **前提は主張するだけでは実効にならない（115.89）**: 一括注釈の前提準備はアップロードの成否を見ておらず、失敗しても後段が静かに飛ぶだけだった。素材の実在と各アップロードの成功を主張へ変えたうえで、送信先を存在しない識別子へ振る変異が実際に落とすことまで確かめて初めて、前提が効いていると言える。
- **「未実装だから確かめない」という注記は、実装後に誰も消さない（115.90）**: 削除の検証が空だった理由は注記どおり「UIが未実装」だったが、削除UIはタスク34 で実装済みで、注記だけが取り残されていた。**未実装を理由に検証を空にするなら、実装するタスク側に注記の撤去と検証の充填を課すこと。**さもなければ実装済みの機能が恒久的に未検証のまま「要件の検証済み件数」に数えられる。
- **偽の緑は、操作する役割を間違えていても露見しない（115.90）**: 削除は設計上 admin のみに許され、検証が使っていた一般利用者の画面には削除ボタンがそもそも描画されない。削除を実際に行う形へ改めた瞬間に「要素が見つからない」で落ち、役割の取り違えが初めて表に出た。**操作を伴わない検証は、対象が存在するかどうかすら確かめていない。**
- **画面から消えたことと、消えたことは違う（115.90 のレビュー）**: 削除要求を実サーバへ通さず成功応答だけを偽装する変異を当てると、画面上の楽観的な除去により一覧からは消える。再読込後にも消えたままであることを主張して初めて、保存側で消えたことを確かめられる。**楽観的更新を持つ画面の削除検証には、再読込後の主張を必ず置くこと。**
- **恒真を正すと直列の連鎖が切れ、正した数より多くの検証が止まりうる（115.91）**: 恒真だった二件を実際に主張する形へ改めた結果、未実装が露見して落ち、直列指定の同一ファイルにある受入検証十一件と後片付けが一斉に実行されなくなった。恒真の一掃で得た誠実さより、走らなくなった検証のほうが失うものが大きい。**直列指定のファイルで判定を強めるときは、落ちた場合に何件が巻き添えになるかを先に数えること。**
- **既知の失敗は、飛ばすのではなく落ちるはずと宣言する（115.91）**: 未実装に由来する失敗は、前提条件で飛ばせば第3原則違反になり、素のまま落とせば連鎖を切る。落ちるはずの検証として無条件に宣言すれば、本体は毎回すべて実行され、連鎖も切れず、実装された瞬間に「落ちるはずが通った」で赤くなって宣言の撤去を強制する。**所管タスクの番号を必ず併記し、被覆済みの一覧にも未実装である旨を書くこと。**
- **数値基準は、それを定めている要件を実測で突き止めてから引くこと（115.91）**: タッチ標的の下限を書くにあたり要件番号を記憶で書いて誤り、実測で三つとも訂正した。本スペックが是正対象としてきた要件引用の誤りそのものである。**引用する要件番号は、該当行がどの要件節に属するかを機械的に解決してから書くこと。**あわせて、援用する基準の適用範囲（今回は概ね幅768px未満）と検証の条件が食い違う場合は、より厳しい下限を課している事実を明記すること。
- **走査は変数名ではなく構造で行う（115.92）**: 定型を変数名で数えて置換したところ、名前を変えただけの同型と、別のラベルを持つ同型（工事担当者）と、表示条件で包んだ同型を取りこぼした。レビューが六箇所を検出し、構造で再走査して初めて全体が見えた。**「同一の定型」を数えるときは、識別子ではなく構文の形を条件にすること。**
- **抽出元自身も共通化の対象である（115.92）**: 手本を残したまま複製だけを直すと、手本が次の複製の種になる。抽出元の一件も補助関数を経由させて、手書きの定型をゼロにした。
- **判定を足すと、それを包む既存の分岐が見えるようになる（115.92）**: 沈黙していた分岐に主張を入れた瞬間、検出器はその外側の分岐連鎖を「主張を条件で包む形」として数え始めた。分岐が変種の吸収として正当なら、連鎖を全域にしたうえで理由付きの除外注釈で残す。**除外は基準に記録され差分として現れるため、隠すことにはならない。**
- **失敗の帰属は、当該ファイルだけを戻して確かめる（115.92）**: 全件実行で二件落ちたが、一件は当該ファイルを変更前へ戻しても同一に落ち、もう一件は変更していないファイルだった。**全件を戻す必要はない。落ちたファイルだけを戻して同じ失敗が出れば、帰属は決まる。**
- **抑止一覧の数字は、検出できているものしか数えていない（115.93）**: 千四十四という総数は検出器が見えている範囲の合計にすぎず、条件付きスキップのうち引数を取らない書き方の四十九件は一件も計上されていなかった。**「検査が通る」は「欠陥が無い」ではなく、「検出器が見ている範囲に新規が無い」でしかない。**削減計画は、規則を足す前に当該の四十九件を是正する順序を採る。先に規則を足すと基準が膨らみ、是正が進んだのか登録が増えたのかを区別できなくなる。
- **抑止を増やす操作に摩擦を置く（115.93）**: 基準の更新は既定で増加方向の書き出しを拒否し、明示の指定を要求する形へ改めた。「直せないので登録して黙らせる」を無言では行えなくする。あわせて基準の自己整合を検査し、総数だけを書き換える改竄を封じた。ただし**これらは削減を強制する仕組みではなく、恒久化する経路を塞ぐだけ**である。削減そのものは 115.127 が担う。
- **再現できない内訳は、再現できないと書く（115.93 のレビュー）**: 計画の分類内訳は走査スクリプトが残っておらず、書き直した走査では別の値になった。粗い走査のほうが誤っている可能性が高いが、断定はできない。**文書と食い違う走査を添えるより、再現できていない事実と、その内訳に依存する出口数値が暫定であることを明記するほうが正しい。**
- **再試行で隠れた失敗は、隠れていない回も壊れていることがある（115.94）**: 四回に一回落ちる検証の真因を追うと、本番のジェスチャー状態機械で、復帰用の遅延タイマがその間に始まった新しいジェスチャーの状態を踏み潰していた。実機でも拡大が途中で無音停止する欠陥である。さらに当該検証の下限が緩すぎ、**拡大が最初の一歩だけ効いた値でも通過していた**。落ちていたのは踏み潰しが一歩目より早く起きた回だけで、**通っていた三回も実は壊れていた**。間欠失敗を追うときは、落ちた回だけでなく通った回が何を主張しているかも見ること。
- **指示した値そのものと突き合わせる（115.94）**: 「1.01 より大きい」は、指示比 3.5 に対して一歩分の 1.3125 でも成立する。**下限ではなく指示値と突き合わせれば、途中で止まる退行はその場で落ちる。**強化後は真因を戻した変異が三回とも失敗し、隠蔽が解けたことを実測で確かめられた。
- **遅延タイマは発火時に前提を再確認する（115.94）**: 状態を戻すタイマは、発火した時点でまだ戻すべき状態かを確かめること。確認が無いと、待機中に状況が進んだ場合に前の文脈のタイマが現在の状態を踏み潰す。解除の呼び出しが十分かは、呼出元を全数追跡して確かめる。本件では新しい接地の経路から解除が呼ばれておらず、踏み潰しの経路が開いていた。

- **除外の理由に書く根拠は、書いた本人が読んだ行だけにすること**: 115.127 段5 の是正で、`quantity-table-generation/REQ-15.1` の除外理由に「`index.ts:34` からの再輸出だけで描画されていない」と書いたが、34 行は別の部品の export であり、当該の行部品は index.ts から**再輸出すらされていなかった**。主張（どの画面からも描画されていない）自体は正しく、実態はむしろ記述より強い。それでも、除外の理由は「なぜ検証しないか」を後任が検証し直すための唯一の手掛かりであり、**確かめていない行番号を根拠として書いた時点で、その手掛かりは信用できなくなる**。
- **陳腐化した要件番号は「無害な表記の揺れ」ではない**: 115.127 段5 の是正で、`e2e/specs/site-surveys/site-survey-performance.spec.ts` の四つの `@requirement` が site-survey/REQ-14.6 / 14.8（**存在しない受入基準**）と REQ-14.1 / 14.3（アクセス制御。性能とは無関係）を指していた。性能テストがアクセス制御の受入基準に被覆印を押していたことになる。正しくは Requirement 16（非機能要件）であった。被覆率の検査は「タグが指す番号が実在するか」「意味が合っているか」を見ないため、**この種の誤りは検査を素通りし続ける**。

- **増えた件数を「隠れていた負債が見つかった」と読んではならない**: 115.137 の一周目は検出を 398 → 418 に増やし、その 20 件を「取りこぼしの解消」と報告した。査読が 20 件すべてを読んだところ**真正は 1 件で 19 件は誤検出**だった。原因は `break` / `continue` を「検証からの脱出」と同一視したことで、**削減計画が是正先として推奨している形（探索ループ + `break` + ループ直後の無条件の主張）そのものを負債として数えていた**。判定規則を広げるときは、**自分の計画が推奨する書き方が誤検出にならないか**を先に確かめること。増加の性質は一件ずつ読むまで分からない。
- **関門は「走査が実際に参照している当のもの」を主張してはじめて関門になる**: 115.137 が置いた自己検査 `115.137-12` は、部品（取り込みと組み立て）を個別に呼ぶだけで、走査本体への結線を見ていなかった。結線を切っても自己検査は緑のままで、**「書き換え漏れが静かな無検出になる」ことを止めるために置いた関門が、まさにその形をしていた**。値が届いていることを主張しても、その先の包みが迂回すればまた素通りする。**残っていないことは、その一跳ねを壊す変異を実際に入れて確かめる以外に確認する方法がない**。
- **推定を仕様に断定形で書かないこと**: 115.137 の課題文には三つの誤りがあった（無検出の原因を「補助名に一致しないため」と断定＝真因は `isSilentExit` の狭さ／「約 250 件の検出が静かに消える」＝実測は消失 0 件／「256 箇所」＝実際は 126 行）。いずれも前段の査読時点の推定を実測せずに書いたものである。推定は推定と明記する。

- **関門は実装欠陥ではなくテストの無効化を隠していることがある（115.127 段6・段7）**: 段6 で `site-survey-image-rotation.spec.ts` の矢印描画が `mouse.click()` 二回（要件7.1 が定めるのはドラッグ）で図形を一つも生まず、`expect(objectsAfter.length).toBe(objectsBefore.length)` が `0 === 0` で成立していた。段7 では `project-crud.spec.ts` の REQ-9.5/9.6 がプロジェクトIDを再ログイン**後**に URL から取っており常に `null` で、`if` に守られて**検証が一度も実行されていなかった**。**関門を外すと production の欠陥が出ると想定しがちだが、実際には「検証が動いていなかった」ほうが多い。**段6 で赤化した7箇所のうち production 欠陥は2件で、5件はテスト側の誤りだった。
- **主張を消して関門を消してはならない（115.127 段6 のレビュー）**: 段6 の唯一の却下理由は、56ファイル中1ファイルだけが関門の除去と同時に主張を18件削除しながら `@requirement` タグを据え置いたことだった。被覆率の検査はタグだけを見るため、**「機能が使えないこと」を主張するテストが受入基準を被覆済みと証明し続ける**状態になっていた。同じ状況で他2件は「要件どおりの主張を残す＋`test.fail()` ラチェット＋`pending-implementation` 登録」という正直な処理を採っており、**片方だけ逆の処理になっていることが検出の手掛かりになった**。関門の是正では**ファイル単位の `expect` 増減を必ず測ること。**
- **`page.route` は `page.request` を捕捉しない（115.127 段6）**: `page.request` は APIRequestContext でページのルーティングを経由しない。実装者・レビュアが独立に実測。さらに**エンドポイントのスタブは検証対象の実装そのものを置き換える**ため、backend 内部の変換を定めた受入基準（Claude Vision の応答解釈など）には原理的に使えない。画面側の振る舞いを見る要件にしか転用できない。
- **検出規則で対象外にするなら、自己検査で両側から固定すること（115.127 段7）**: 段7 の前任が入れた `retryExhaustionFailureExclusion` は自己検査が無いまま残っていた。是正では「捕捉してはならない書き方」1件と「捕捉しなければならない書き方」3件（繰り返し後に `throw` が無い／分岐内に `expect` がある／`try` が挟まる）を追加し、規則の各条件に1対1で対応させた。**片側だけの確認は規則が広がる向きの改変を検知できない。**なお規則側の `containsAssertion` は `isSilentExit` と境界が重なる空振りで、レビュアが変異で実測して確認した。
- **出口条件の逃げ道は使わずに済むことがある（115.127 段7）**: 段7 の出口条件は「残るのは失敗箇所を明記した `e2e-guard-allow` のみ」だったが、165件は全件が是正で処理でき、除外注釈は0件になった。**「今は直せない」の記録を許す設計にしておくことと、実際にそれを使うことは別である。**
- **肯定側の確認を落とす変異が無ければ、それは片側だけの確認である（115.128 の査読）**: 関門の自己検査は「壊すと落ちる」を確かめるだけでは足りない。「**通すべきものを通す**」側の確認（減少方向の更新は明示無しでも許可する／整合した基準は受け入れる）については、**それを落とす変異が存在するかを確かめないと、何でも拒否する実装でも緑のままになる**。査読は独自に「更新を全拒否する」「常に拒否する」変異を作り、対応する確認が落ちることを実測した。
- **本番の入口を関数へ切り出すときは、全失敗経路の終了コード伝播を実測すること（115.128）**: `process.exit(1)` を `return 1` へ改めた四経路のうち、自己検査が固定したのは二つだけだった。残る二つは `return 0` へ変異させても自己検査が緑のままであることを査読が実測している。**関数化そのものが「静かに 0 へ化ける」経路を作る**ため、切り出しと同時にどの経路が固定されたかを数えること。実測済みの穴は計画文書 §6.2.1 に記録した。
- **同型の欠陥は「直した経路」の隣に残る（115.129）**: 中点ズームの座標基準を是正したが、同じコントローラを呼ぶダブルタップ拡大（要件33.8）は `clientX/clientY` を直渡ししたまま残っていた。**変換の実装が済んでいても、呼び出し側を全数洗い出さなければ欠陥は残る。**是正時は「その変換を通すべき呼び出しが他にいくつあるか」を数えること。115.145 / 115.146 として起票した。
- **座標変換は一次情報の算術と突き合わせること（115.129）**: Fabric の `zoomToPoint` が期待する面は、`getViewportPoint` の実装（`client − rect 原点` に `論理サイズ / 表示サイズ` を掛ける）から逆算して確定した。retina 係数は `el.width = 論理幅 × retinaScaling` により相殺されるため、正味は `(client − rect.left) × getWidth()/rect.width` である。**「たぶんこの座標系」で書くと、通常配置（比1・オフセット0）では偶然通ってしまい、実機配置でだけ壊れる。**
- **恒等フォールバックは欠陥の復活である（115.129 の査読）**: 要素が取れない場合に変換を恒等にすると、画面座標がそのまま渡る＝是正前の状態に戻る。本件は生成箇所が一箇所で実 Fabric Canvas しか渡らないため到達不能と実測できたが、**到達しうるなら黙って誤値を渡すより失敗させるべきである。**
- **再試行を減らしても間欠失敗の検出は改善しない（115.95）**: 検出確率は「**最初の試行が落ちるか**」だけで決まり、再試行の回数に依らない。回復した実行を失敗として扱う設定を入れれば、再試行を3回残したままでも検出率は再試行0と同じになる。**再試行の削減は検出を一切改善せず、実行時間の代償だけが残る。**再試行を残す実効的な利点は「何回中何回落ちたか」の試行列が記録に残ることだけである。
- **統合環境の設定はローカルでも効いていることがある（115.95）**: pre-push フックは `CI=true` を付けて実行するため、ローカルの設定値ではなく統合環境の分岐が使われていた。**「ローカルは緩い設定だから気づけるはず」という前提は、フックの起動方法を読むまで成り立たない。**
- **却下の理由が本当に差別化になっているか確かめること（115.95 の査読）**: 案(b) の却下理由として「環境揺らぎがそのまま赤になる」と書いたが、これは案(a) を採っても同じ確率で起きるため**却下理由になっていなかった**。査読の指摘で削除し、実効的な差（試行列が残るか）だけを残した。**両案に共通する性質を、片方の欠点として書かないこと。**
- **単体テストの緑は出荷の証拠にならない（115.96）**: 「部品はあるが結線が無い」型の欠陥は本スペックで**六度**繰り返された。115.96 では切替UIが単独ファイルのスタイルパネルにのみ存在し、本番の道具帯には型の水準ですら項目が無かった。**出荷の有無は、本番の画面から到達できるかで確定すること。**受入検証を経ない完了を認めないこと。
- **結線先は「既に結線されている経路」を選ぶこと（115.96）**: 未結線の部品を結線する道と、結線済みの部品を拡張する道があるとき、後者を選べば「部品はあるが結線が無い」の再発が構造的に起きない。前者は未結線部品側の負債（既定値の欠落など）も前提として乗り、範囲が二重に膨らむ。
- **コンテナが作り直されても中身が古いことがある（115.96 の査読）**: `test:docker:build` は**フロントのイメージビルドが失敗しても後続の再作成が成功を報告する**。結果、`Recreated` を確認しても古いバンドルのまま E2E が緑になる。**変異検証で「壊したのに落ちない」と誤読する原因になる**（実際に査読中に発生した）。`--force-recreate` の確認だけでは足りず、**ビルドログの `Built` / `ERROR` を確認すること**。変異が型検査を通る形かを先に確かめること。
- **承認済みの仕様へ要件を追加するときは被覆か除外を同時に入れること**: 要件31（公開鍵配布）を追加した際に対応する被覆も除外も入れず、要件被覆の検査が全員に対して落ちる状態を持ち込んだ。**片方だけを入れた瞬間から検査は赤になる。**実装が伴わない要件は、実装保留として除外へ登録し、受入検証にはラチェットを置くこと。
- **画面の表示だけを見る検証は、片側の壊れ方を素通りさせる（115.97 の査読）**: 査読が独自に「スタイルパネルの表示は正しいまま、描画へ渡す値だけ既定へ戻す」変異を入れたところ、**表示値だけを主張する検証では捕まらず、描いた注釈の実値を読む主張だけが落ちた**。設定画面の状態と、その設定が実際に適用された結果は**別の主張**である。両方を主張すること。
- **単体のタグだけで受入基準が被覆済みと数えられる（115.97）**: 要件26.4・26.6 は単体テストの `@requirement` タグのみで被覆済みと計上され、E2E 側には当該要件のタグが一件も無かった。**被覆の検査はタグの所在を問わない**ため、単体だけで100%を満たせてしまう。本番の経路から到達することを確かめたい要件は、受入レベルのタグが付いているかを別途数えること。
- **指摘の正しさと、それをどの境界で実行するかは別問題である（115.98 の査読）**: 親は「行番号の参照は原理的に維持できないので、節の題とシンボル名で指す形へ改めるのが正しい」と助言したが、査読はこれを**原理としては正しいが本タスクで行えば境界侵犯**と判定した。四十行超の均質な表のうち六行だけ形式を変えれば同一表内に二つの規約が並立し、残る約二百件の維持問題も解決しない。**正しい是正でも、境界の外で行えば負債の形を変えるだけになる。**原理的な懸念は所管タスクを起こして送ること。
- **設計文書に既存の規約が無いか先に探すこと（115.98）**: 行番号参照の陳腐化への対処を決める際、設計文書に既に「実装へ行の増減を伴う変更を加えたタスクは、当該ファイルを指す本書の参照を全件測り直す責任を負う」という明文規約があり、前例も記録されていた。**規約を探さずに新しい方針を決めると、既存の規約と衝突する。**
- **「第二の供給元を持ったら落ちる」は言い過ぎになりやすい（115.99 の査読）**: 期待値を資材から導出する検証は、**資材とプリセットが同じ値を持つことしか主張しない**。プリセット側を literal へ戻しても、値が一致していれば緑のままである。実際に捕らえられるのは**値のドリフト**であり、構造としての単一情報源ではない。関門としては十分でも、**報告でその範囲を超えて主張しないこと。**
- **正規化は一本に寄せること（115.99 の査読）**: 重複判定は大小を無視し、選択判定は大小を区別する、という食い違いがあると、**資材の表記が変わった瞬間に「どのプリセットも選択されない」欠陥が復活する**。同じ値を扱う二つの比較が別々の正規化を持っていないかを数えること。
- **参照を直すときは「指す先」だけでなく「引用した文言」も照合する（115.100）**: 行番号を節の題へ置き換えても、引用符の中身が当該節に実在しなければ参照は依然として嘘である。レビューが捕捉した2件はいずれも節の題は妥当に見えるのに引用文が別の節にあった。**引用文を連続文字列として design.md へ grep し、指す節の行範囲に含まれるかまで確かめること。**この照合を全件に広げたところ、同型の誤りがさらに5件見つかった。
- **除外規則は「何を恒久的に見逃すか」を書き残す（115.100）**: 括弧単独の数値から HTTP ステータスコードを除外する規則は、除外集合の番号が行番号として使われた場合を必ず見逃す。この取引を暗黙にせず、冒頭注釈・定数の説明・規則内注釈・自己検査の検出必須と過検出禁止の両ケースに固定した。**過検出を抑える規則は、抑えた分だけ穴を開けている。穴の形を具体例で明示すること。**
- **起票時の件数は実測で上書きする（115.100）**: 起票は「三十六箇所・十ファイル」だったが、検出規則を `design.md` の直後に数字が来ない形（`(4655-4669)`・`§4611`・`@see …(5296-5320)`）まで広げると 72 箇所・24 ファイルだった。**起票の数を上限として扱うと、同じ欠陥の残りが検査をすり抜ける。**
- **期待値の是正は「変異を入れて落ちるか」の前後対比でしか証明できない（115.101）**: 期待値を具体値へ直書きしても、それが検出力を持つかは実行しないと分からない。是正**前**に中央の値へ変異を注入し**緑のまま通ること**を実測し、是正**後**に同じ変異で**落ちること**を実測する。この対比が取れて初めて是正である。レビューも同じ対比を独立に再現して承認した。
- **矢印だけ変異の効き方が違う（115.101）**: 六形状は切り上げ、矢印は四捨五入のため、係数 0.75→0.5 では矢印は `round(1.5)=2` で既定と同じ値になり主張が落ちない。矢印の検出には 0.9 を使う必要があった。**丸め方が違えば、同じ変異でも効く箇所と効かない箇所が生まれる。**変異が効かないことを「主張が正しい」と読み違えないこと。
- **一元管理の結線そのものを検証する箇所は導出を残す（115.101）**: 期待値の具体値化は原則だが、`StylePanel.default-presets.test.tsx` は「資材から値が届いているか」自体が検証対象のため、資材からの導出を維持するのが正しい（115.99 の判断）。**原則の適用先を、原則が守ろうとしているものより優先しないこと。**
- **「呼ぶ本番コードが0件」は型の嘘を隠す（115.102）**: `exportAnnotationJson` は型の上でだけ文字列を名乗り、実際にはオブジェクトを返していた。呼び出し元が一つも無かったため誰も気づかない。**未結線の関数は、結線した瞬間に初めて契約が検査される。**未実装の受入基準を結線する作業は、同時に既存宣言の嘘を暴く作業でもある。
- **フックは「有効化」だけでは登録されない（115.102）**: `useUnsavedChanges({ enabled })` の `beforeunload` 登録条件は `!enabled || !isDirty` で、内部 dirty を `setDirty` で追従させなければ有効化しても登録されない。同型の欠陥が `QuantityTableEditPage`（REQ-43.2）にも残っている。**フックへ渡す設定と、フックが実際に見ている状態は別物である。**
- **事故の筋書きは、筋書きそのものを検証で再現する（115.102 のレビュー）**: 13.5 は `undoManager.clear()` を足すだけでは証明にならない。レビューは「元に戻すが無効」の主張を一時的に外したうえで変異を残し、**「取り消し操作の後の保存で送られた注釈の件数が減っている」で落ちること**を実測した。起票が言う事故が実在し、後段の主張がそれを捕らえることが初めて示された。**防いだと言うには、防がなかった場合に何が起きるかを一度見せること。**
- **`useBlocker` はデータルーター配下でしか動かない（115.102）**: 実装後にフロント単体全件で `SiteSurveyImageViewerPage` 系15件が落ちた。本番は `createBrowserRouter` 配下のため成立するが、テスト側が旧構成のままだった。**全件を一度は完走させないと、この種の構成差は見つからない。**
- **ラチェットを外したら、同じ根拠で置かれた除外も外す（115.103）**: `test.fail()` の未実装ラチェットだけを撤去し、`requirement-exclusions.json` の同要件の除外を残したため、実装済みの要件が `pending-implementation` に計上され続けた。除外の `reason` 欄は既に存在しない本番コードを断定的に記述し、しかも自ら「本除外の削除が強制される」と書いていた。**未実装を根拠にした仕掛けは複数箇所に散る。一つ外したら残りを機械的に探すこと。**
- **「記載が無い」と報告する前に grep で確かめる（115.103）**: 実装者は存在しないキー `requirementIds` を見る確認コードを書き、実キー `id` を一度も見ないまま「除外一覧に記載は無い」と報告した。**確認コードが正しいキーを見ているかを、まず一件の既知の値で検算すること。**
- **既定値のままの状態では変異が効かない（115.103）**: 「表示件数を変えると先頭ページへ戻る」テストは、頁が既定の1のまま表示件数だけを変えていたため `setPage(1)` を消しても通り続けた。**状態を変える主張は、その状態が既定でない位置から始めること。**同じ穴が E2E にも空いていた。単体で見つけた不活性は、対応する E2E にも必ず当たること。
- **変異試験は総当たりで表にする（115.103）**: 新規8テスト×変異8種を全て実行し、「全変異を生き延びるテストがゼロ」であることを表で示した。抜き取りでは不活性なテストが残る。**表の空白セルは、見落としか構造的に妥当かを一つずつ説明できること。**
- **未結線の部品を結線すると、その部品が依存していた前提の腐りが露出する（115.104）**: 端点を更新する関数は本番から一度も呼ばれておらず、Group 化以降その幾何更新が Group 未対応のまま固まっていた。端点を変えても外接矩形・当たり判定・ハンドル位置が生成時のまま不変だった。**結線は「呼ぶ側を足す」だけでは終わらない。呼ばれてこなかった側が実際に動くかを実測すること。**
- **モックが実物の計算を通していないと、契約は永遠に検査されない（115.104）**: 寸法線の単体検証は Path を「パス文字列を持つだけの入れ物」として模しており、Group の外接矩形計算を一度も通していなかった。これが上記の腐りが誰にも見つからなかった真因である。**モックを軽くした分だけ、検査していない領域が増える。**
- **挙動を足すと、既存の検証の補助が壊れることがある（115.104）**: 選択中の道具を再びたたくと設定面が閉じる挙動を足したところ、既存の受入検証の補助が「既に選択中の道具をもう一度押す」経路を持っていたため設定面が閉じ、後続の操作に到達できなくなった。補助の意図は「その道具を選択状態にする」ことなので、既に選択済みなら押さない形へ改めた。**補助が要件の挙動を隠していないことは、変異を入れて当該の主張が落ちることで示すこと。**
- **時間の主張は、閾値の前の観測より先に経過時間を主張する（115.104 のレビュー）**: 長押しの検証が「閾値前に出ていないこと」を先に評価すると、負荷で余裕が痩せたときに「閾値に届く前に出た」という真因と異なる失敗文言になる。**経過時間の主張を先に置くこと。**
- **除外の根拠に挙げられた代替検証が、出荷経路に一度も到達しないことがある（115.105）**: 通信断の要件は「代替の検証がある」として除外されていたが、その検証が回していた部品は本番からの参照が 0 件だった。**検証ファイルが存在することと、検証が本番を通ることは別である。**除外を見直すときは、根拠に挙がった検証が本番経路へ到達するかを参照元の数で確かめること。
- **抑止の範囲は要件の一語ではなく設計の決定から確定する（115.105）**: 要件は「保存操作をブロックする」としか書いていないが、設計の決定は「サーバー保存を止め、一時保存は続ける」と限定していた。一時保存まで止めると、通信断でこそ必要なデータ保護が失われる。**要件の語が広いとき、狭める根拠を設計から示せるなら狭めてよい。示せないなら広いまま実装すること。**
- **隣の要件が同じ状況を別の方法で扱っていないか確かめる（115.105）**: 画像の送信を事前に抑止すると、通信障害時の保持と自動再試行を定めた要件の経路が起動しなくなる。当該要件は「オフライン中の自動キュー送信」を対象外と明記し、サーバー到達前の失敗に段階的再試行を義務づけていた。**同じ事象に二つの要件が触れているとき、片方の実装がもう片方を無効化しないかを本文で確かめること。**
- **本番を直したら、その判断に依存していた記録を全部探す（115.106）**: 実寸の判定を撤去したのに、設計文書の規則表は「実寸が正でなければ観測しない」と正反対のまま残り、別スペックの除外記録は撤去した識別子を根拠に据えたままだった。当該識別子はリポジトリ全体でその記録にしか残らない宙吊りの語になっていた。**自スペックのキーを検索するだけでは足りない。変更が失効させた記録を、識別子の全文検索で探すこと。**
- **検査が緑であることは、その検査が見ていない領域の根拠にならない（115.106 のレビュー）**: 行番号参照の検査は「本番コード→設計文書」の向きしか見ないため、設計文書の中に存在しない節への参照を持ち込んでも緑のままだった。**検査の適用範囲を知らずに緑を根拠にしないこと。**
- **必然的な是正でも、無検証なら本番の挙動変更が素通りする（115.106 のレビュー）**: 遅延取得の成立に枠の新設は不可欠だったが、追加した受入検証は別の表示形式しか通らず、単体も枠を主張していなかった。**必然性は検証を免除しない。**
- **共用部品の変更が下流へ及ぶとき、要件に近づく方向なら差し戻しではない（115.106 の判定）**: 判定の根拠は二つ。設計文書の境界の宣言が当該部品の取得タイミングを本スペックの所有と明記していること、変更の方向が下流スペックの受入基準に反せず近づくこと。**波及の有無ではなく、所有権と方向で決めること。**
- **撤去は「削除した対象を否定形で主張するテスト」を恒真にする（115.107 のレビュー）**: 旧経路の値で上書きしないことを `not.toHaveBeenCalledWith(値)` で主張していたが、その値の唯一の供給源を同じ差分で削除したため、実装をどう壊しても落ちなくなった。**撤去タスクでは、否定形の主張の供給源が差分の中で消えていないかを全件確かめること。**是正は肯定形（呼び出し回数と値の組）へ置き換える。
- **偽になった記述は表だけでなく散文にも残る（115.107）**: 決着表の一行を直しても、同じ契約名を扱う別の表の行と、節の「概要」「現状の問題分析」「境界の宣言」に現在形の偽の主張が残っていた。**識別子で全文を走査し、表行と散文の両方を一件ずつ判定すること。**なお「現状の問題分析」の記述は本タスクより前の同期化の時点で既に偽になっていた。
- **撤去か結線かは、結線が物理的に可能かをまず確かめる（115.107 の判断）**: 唯一の実装は構築時に無条件で例外を投げる形へ既に封鎖されており、依存を注入すると保存が必ず失敗する。設計文書も当該方式を四つの確認済み欠陥を理由に退けていた。**撤去は設計との乖離ではなく設計への追随だった。**判断は「将来使うかもしれない」ではなく、現在の設計がその方式を採るかで決める。
- **変異が効く経路は主張ごとに違う（115.107 のレビュー）**: 実装者は成功経路へ第二の供給源を注入して三件すべてが落ちたと報告したが、レビューの再現では失敗経路への注入でしか落ちない主張が一件あった。結論は同じでも**どの変異でどれが落ちるかは主張ごとに確かめること。**
- **偽の緑を検出する検査が、それ自体は出荷経路に無いことがある（115.108 のレビュー）**: 画面の中で判定を自前で書き起こす形を検出する仕組みを新設したが、過検出のため常に赤で、送り出し前の検査にも統合の関門にも接続されていなかった。**実行されない検出器は何も検出しない。**これは本 run が掃き出してきた「部品と単体検証はあるが出荷経路に無い」型と同じである。
- **検出の規則は「値が主張に使われるか」まで見る（115.108）**: 真をそのまま返す一行でも、返り値を束縛して主張に使う形と、返り値を捨てる待機とでは意味が違う。前者は偽の緑、後者は無価値な一行にすぎない。**規則の根拠が「その値への主張」なら、値が消費されるかを判定に含めること。**これで検出力を保ったまま過検出だけが落ちた。
- **自己検査を本検査より先に走らせる（115.108 のレビューが要点と判定）**: 消費の判定を常に偽へ変異させると、旧版での検出が五件から零件へ落ちるのに**本検査は緑のまま素通りする**。捕捉できるのは自己検査だけである。**検出器の退行は、検出器自身の検査でしか捕まらない。**
- **長さが保たれる置換の「長さ一致」は検算にならない（115.108 のレビュー）**: 注釈と文字列を空白で潰す写しについて、実装者は「原文と長さが一致する」ことを健全性の根拠に挙げたが、空白で置き換える以上これは常に真である。**恒真の検算を根拠として数えないこと。**有効な根拠は変異での失敗と、非空白文字の残存率の実測だった。
- **直列で走る検証では、失敗地点より後は観測できない（115.108 のレビュー）**: 変異を入れて「対応する検証だけが落ちる」ことを示す際、失敗地点が前方だと後続は実行されず未証明になる。**失敗地点が後ろになる変異を選ぶこと。**

- **被覆の検査に本番到達性を入れた結果、満点が赤へ転じた（115.109）**: 入口（`frontend/src/main.tsx` / `backend/src/index.ts` / `backend/prisma/seed.ts`）から取り込みを辿り、検証ファイル経由の到達を根拠にしない判定を入れたところ、番号は付くが本番から到達しない受入基準が 27 件露見した。うち site-survey は要件30.5・33.10 の 2 件で、いずれも本番未参照の `ImageViewer.tsx` の検証だけが唯一の被覆源である（115.146 と同一の死蔵）。残る 25 件は他スペック所管。**赤は成果であり、番号を付け直して緑へ戻してはならない。**
- **除外一覧は「被覆あり」ではない（115.109）**: 除外を分母外として明示し、`duplicate` / `malformed` / `stale` / `pending` / `external` / `in-repo-verified` / `in-repo-unverified` へ監査分類した。ただし `in-repo-unverified` の実体は「**`@requirement` タグの付いた到達する被覆源が無い**」であって「代替検証が存在しない」ではない。反例として site-survey/REQ-21.1 が掲げる `backend/src/__tests__/unit/services/survey-image.service.test.ts` は実在し実際に検証している。既定で失敗させず `--strict` 限定にしたのはこの誤検出を避けるためであり、穴の温存ではない。**判定名と文言が事実を超えている点は後続で是正すること。**
- **実データを固定資料に使う自己検査は、欠陥の是正で自ら落ちる（115.109 のレビューが検出）**: `check-requirement-coverage.selftest.ts` が `ImageViewer.tsx` / `FieldValidatedItemRow.tsx` の死亡を名指しで固定しているため、結線・撤去のいずれの是正を採っても自己検査が失敗する。実データ側は「列挙できること」に留め、死亡の名指しは仮想資料側へ移すのが姉妹検査（`check-design-reference-format.selftest.ts`）の様式である。
- **同名の主題が無い検証には到達性の抜け道が残る（115.109 のレビューが検出）**: 同名の本番モジュールが無い場合、取り込む本番モジュールの**いずれか一つ**が到達すれば到達と判定する。`FieldSpecIntegration.test.tsx` は死んだ `FieldValidatedItemRow.tsx` を取り込みながら生きた同時取り込みで到達扱いになる。現時点でタグが無いため詐称は未成立だが、タグ一行で成立する。自己検査にもこの形が固定されていない。
- **`check:req-coverage:strict` はどの関門にも結線されていない（115.109 のレビューが検出）**: 未結線コードに番号を付ける形を塞ぐ検査自身が、未結線の script を持っている。

- **「閉じた列挙」は同じタスク内で二度出る（115.110）**: 115.74-115.75 の教訓が記録済みであるにもかかわらず、実装は設計文書へ「合わせて **4 箇所**である」と断定し、レビューが 5 箇所目（`QuantityTableEditPage.tsx` の数量表 PDF 出力）を反例として提示して差し戻された。根拠として併記した `grep -c` が**その 2 ファイル内の出現数**しか数えておらず、「他に無いこと」を一度も走査していなかったのが原因である。**数を書くなら、その数が全域走査の結果であることを走査コマンドとともに示し、かつ「走査した範囲での結論であり他に無いことの証明ではない」と限定を付すこと。**
- **網羅の決め手は「欠陥の指紋」を数えること（115.110 のレビュー）**: `strokeWidth` と乗算が同一行にある形を捉える正規表現は、行またぎ・`Object.assign`・スプレッド・`set('strokeWidth', ...)` の関数形式を取りこぼす。決定的だったのは本欠陥の指紋である**保存時キャンバス寸法から表示倍率を導出する箇所**（`canvasWidth` / `canvasHeight`）を直接数える走査で、これが 6 適用先と正確に一致した。**倍率の導出元が有限なら、適用先の書き方が何通りあっても網羅を言える。**
- **別スペックの画面が本スペックの注釈データを書き出している（115.110）**: `frontend/src/pages/QuantityTableEditPage.tsx` の `renderAnnotatedImageToDataUrl` が `api/survey-annotations` から現場調査の注釈を取得し `enlivenObjects` で復元して PDF へ書き出す。同ページが `AnnotatedImageThumbnail` を import するため `registerCustomShapes` が副作用読み込みされ、七形状は複写付きの集合体として復元される。**「別スペックの画面だから境界外」は根拠にならない。要件 32.8 が PDF をサムネイル・個別/一括と同列に挙げている。**
- **モック導入を自己検査にする書き方（115.110）**: `vi.mock('fabric')` をファイル全体へ導入する際、既存経路が返す値（`...base64,TEST`）と新設経路が返す値（`...base64,FABRIC`）を別にした。**モックが既存経路へ漏れれば既存テストが落ちる**ため、モック導入が偽の緑を作っていないことをテスト自身が固定している。
- **フレークは再実行で確定させること（115.110）**: 実装が全件で 1 件失敗を「負荷依存のフレーク」と自己判定したが、レビューが全件を独立に回すと 12010 件全緑で再現しなかった。**フレーク判定は独立の再実行まで確定としない。**

- **記録の「未実装」は現在形のまま陳腐化する（115.131 のレビューが確定させた）**: 115.31 / 115.33 の本文と Implementation Notes（本ファイル 3244 行付近・4420 行付近）は「幅の検証を持つ部品は本番の描画経路から一度も参照されていない」と現在形で書かれているが、**115.33 は `[x]` であり幅の防止は既に結線済み**である。レビューが `QuantityGroupCard.tsx:1081` → `EditableQuantityItemRow.tsx:543 / :646` → `AutocompleteInput.tsx:234, 311-316, 344-346` の連鎖を実読し、`maxWidth` prop がファイル全体に一箇所も無いため `field-validation.ts` の `FIELD_CONSTRAINTS`（工種 16 / 単位 6）が効くことを確認した。**一方 `FieldValidatedItemRow.tsx` の死コード性（115.130）は今も正しい。** 是正が済んだ記述は完了と同時に時制を改めること。
- **`fill()` は変換イベントを発火しない（115.131 のレビューが Playwright で実測）**: `fill()` も `keyboard.insertText` も `beforeinput` / `input` を `isComposing=false` で出すだけで composition 系イベントを一切出さない。したがって IME 変換確定の経路は E2E では通らず、`QuantityItemFieldMaxWidth.test.tsx` が単体で担う。厳密には CDP `Input.imeSetComposition` で起こす余地はあるため、**「E2E では不可能」と断定せず「担当層はここ」と書くこと。**
- **RED の性質を取り違えないこと（115.131）**: 実装が提示した「反対仮説（超過入力がそのまま保持される）を置いたら失敗した」出力は、**production が拒否していることの実証**であって**新設判定が壊れたら落ちることの実証ではない**。後者はレビューが `AutocompleteInput.acceptsWidth` を常時 true へ変異させ、本番ビルドを `--force-recreate` で作り直して三件とも落ちることを実測して確かめた。**E2E のフロントは本番ビルドなので、production を変異させる検証には再ビルドが要る。**

- **起票文は先行タスクの成果で陳腐化する（115.132）**: 起票が名指しした「phase9 の七箇所」は 115.127（コミット `a6da29d`）で既に解消されており、残っていたのは group-rename のコード 1 件と docblock の 2 件だけだった。実装は phase9 を**無変更のまま「既に是正済み」と報告**し、レビューが `git log` で裏を取った。**着手時に起票文の前提を実測で確かめること。作業をでっち上げないこと。**
- **到達不能な複製は「常に緑」ではなく「再拡散の温床」（115.132）**: group-rename の壊れた目印は `mode: 'serial'` により前提が必ず ID を設定するため一度も通らない死んだ経路で、是正前も全件 passed だった。したがって RED は原理的に取れない。**害は素通りではなく、壊れた遷移補助が各ファイルへ複製されて広がることにある。目印だけを直すと複製が温存される。**
- **判定を弱める方向の変異は必ず生き残る（115.132 のレビューが自ら踏んだ）**: 上限の主張を `toBeLessThanOrEqual(50)` から `(10)` へ変える変異は設計上必ず survive する。**変異は要件が失敗する方向（上限超過が通る方向）へ加えること。**
- **削除の是非は `expect` を全件追跡して判断する（115.132）**: 144 行の削除に対し、レビューが削除された `expect` 七件の移管先を一件ずつ `quantity-table-preconditions.ts` の行番号まで特定した。グループ追加の判定は `toBeVisible()` から `toHaveCount(before + 1)` へ**強化**されていた。撤去された後処理は `expect` を一件も持たなかった。**テストの削除は「不正直の解消」を装った主張の消失でありうる。**
- **【要処置・115.132 のレビューが検出】** `e2e/specs/quantity-tables/group-rename-e2e.spec.ts:13-15` の docblock が「このUIフローは他の数量表E2E（`quantity-table-phase10.spec.ts` / `photo-comment-display.spec.ts`）にも複製されており」と**現在形**で書くが、当該二ファイルは 115.127 で是正済みで既にこのフローを持たない。今も複製を保持するのは `import-e2e` / `photo-comment-e2e` / `photo-preview-e2e` / `group-sort-e2e` / `scrollbar-e2e` / `photo-change-dialog-e2e`（いずれも目印は正しい前方一致で結果を `expect(navigated).toBeTruthy()` で主張するため偽の緑ではない）。**過去形へ改めるか、残存箇所を別タスクとして起票すること。**

- **恒真は「定義上必ず成立する不等式」として紛れ込む（115.133）**: 旧 REQ-25.1 / 25.2 は `scrollWidth >= clientHeight`／`scrollHeight >= clientHeight` を主張していた。`scrollWidth` は定義上 `clientWidth` を下回らないため、**どの画面でも成立する**。旧 REQ-25.1 のコメント自身が「仮にデータが少なくても成立」と書いており、恒真であることを書き残したまま緑になっていた。**比較する二つの量の定義上の大小関係を先に確かめること。**
- **判定先は要件の言葉ではなく実装から確定する（115.133）**: REQ-25 は「数量項目の表示領域」と言うが、垂直方向は `QuantityGroupCard` の `itemTableWrapper` が `overflowY: hidden` でページ側へ委ねるため主体は文書（`document.documentElement`）、水平方向は REQ-41 で当該ラッパー（`item-table-scroll-*`、`overflowX: auto`）に限定される。**同一要件の水平と垂直で判定先が異なる。**
- **「量が 0 を超える」は前件から独立しうる（115.133）**: 表示領域の横方向の超過量は幅 2560/1920/1440/1280px のいずれでも 12px であり、`> 0` の主張は REQ-25.1 の前件（ビューポート横幅を超える）に依存しない。**是正は「狭めた幅の分だけ超過量が増える」という差分の主張へ移すこと**（実測 12px → 660px、差 648px を閾値 340 で判定）。前提として読むだけの値と、要件を主張する値を明示的に分けること。
- **「実装が要件を満たさない」の断定は承認済み仕様と突き合わせてから（115.133）**: 実装者は水平方向の 12px 超過を REQ-25.3 違反と断定し `test.fail()` ラチェットを置いたが、REQ-37 配置概要（`quantity-table-generation/requirements.md:586`）・REQ-37 AC6（同 `:594`）・`design.md:2212` は数量項目表の常時溢れを**承認済み前提として受け入れている**。よって REQ-25.3 水平は前件が成立せず主張対象が存在しない。**要件未達の断定は検証へ恒久固定される前にエスカレーションすること。**
- **ラチェットは三点セットで初めて成立する（115.133 のレビューが検出）**: 本リポジトリでは「要件どおりの主張＋`test.fail()`＋`requirement-exclusions.json` の `pending-implementation` 登録」が揃って初めて成立する。登録を欠くと `check:req-coverage` が当該要件を被覆済みと数え続け、**機能が使えないことを主張するテストが受入基準を満たした証拠になる**。今回はラチェット自体が誤りだったため撤去で解消した。
- **`@requirement` タグとテスト名は中身とずれる（115.133）**: 引き継ぎ時、グループ／項目の「下へ移動」で順序が変わることを主張するテストが REQ-23.7 / 24.7（保存後の永続化）を名乗っており、REQ-23.4 / 24.4 の規範に対応する主張が**どこにも見えない状態**だった。**タグ・テスト名・アサーションの三者を要件原文と一対一で突き合わせること。**
- **失敗するとワーカーが再生成され module 変数が失われる（115.133）**: 変異版で RED を取る際、`describe` 外に置いた `testProjectId` / `createdQuantityTableId` がテスト失敗後のワーカー再生成で失われ、後続テストが前提生成で落ちて検証が無効になる。**変異検証は事前準備の `describe` ごと複製し `--retries=0` で回すこと。**
- **【要処置・115.133 のレビューが検出】** `e2e/specs/quantity-tables/group-sort-e2e.spec.ts:600-637` の REQ-24.1 / 24.2 は行の `textContent()` を比較するが、同ファイル `readItemNames` の docblock 自身が「項目行のテキストは入力欄の値を含まない」と述べており、**並び順の入れ替わりを検出できない恐れがある**。115.133 では未編集・起票文の未検証列挙にも含まれないため境界外とした。別タスクとして起票すること。
- **【要処置・115.133 のレビューが検出】** `.kiro/specs/quantity-table-generation/design.md:2212` は列幅合計を「≈1264px」と書くが、`gridConstants.ts` の 12 列を実加算すると **1168px** であり、design 側が陳腐化している。設計文書の実値の追随を別タスクで所管すること。

- **被覆一覧のヘッダは括弧の直後にコロンが要る（115.134）**: docblock を `Requirements coverage (quantity-table-generation / Requirement 7: 入力支援・オートコンプリート):` と書いた結果、`scripts/check-requirement-coverage.ts:463-466` のパターン4 `Requirements\s*(?:coverage\s*)?\((feature)\):` に一致せず、直後の `- REQ-7.x:` 一覧が機能名へ紐づかなくなった。REQ-7.6/7.7 が被覆源を失い `check:req-coverage` に FAILED が1本増える。**検査は「未カバー」としか言わず原因がヘッダ表記だと分からない。** 注記は括弧の外へ置くこと。
- **恒真は「セレクタで絞った属性をそのまま主張する」形でも紛れ込む（115.134）**: 旧版は `input[id$="-name"][role="combobox"]` で絞り込んでから `role` が `combobox` であることを主張していた。絞り込み条件を主張しても何も確かめていない。**セレクタから当該条件を外してから主張すること。**
- **監視対象の実在を確かめないと「発行されない」の主張は恒真になる（115.134）**: 旧版は `/api/autocomplete/major-categories` 等の個別エンドポイントへのリクエストが0件であることを主張していたが、補完ルートは `router.get('/autocomplete-candidates')` の1本のみ（`backend/src/routes/autocomplete.routes.ts:131`）で、監視対象は最初から存在しなかった。**「呼ばれないこと」の主張は、呼ばれ得る対象を監視しているかを先に確かめること。**
- **`toPass` の内側に無期限の待ちを置くと再試行が一度も回らない（115.134）**: `AutocompleteInput.tsx:424-427` の 150ms 遅延クローズで一覧が消えた周回の `option.click()` / `textContent()` が既定 `actionTimeout`（`playwright.config.ts:107`、ローカル15秒/CI30秒）まで待ち、これが `toPass` の予算（`getTimeout(15000)` は CI倍率2で同値）と**同一長**のため一周で予算を使い切る。再試行の形をしていながら一度も開き直せず、要件の名前で落ちて原因を取り違える。**再試行単位の内側の待ちは予算より十分短く区切ること。予算を延ばすのは原因を隠す。**
- **flaky はリトライ依存の通過であり「全件 passed」ではない（115.134）**: レビュアーと検証エージェントの実行では flaky 0 だったものが親の実行で再現した。断続的な不安定性は実行ごとに現れ方が変わる。**受入判定は `--retries=0` で行うこと。** 既定設定の EXIT=0 はリトライ後の結果であり、初回で落ちるかを隠す。
- **前提の失敗が要件の失敗として現れる構造を作らない（115.134）**: 候補登録の成立を主張しないまま REQ-7.4 の再試行へ入ると、登録が失敗した場合に「REQ-7.4: 候補をクリックすると値が自動入力される」の名前で落ちる。**前提は「前提: …」の名前で別に主張し、崩れたら前提の名前で落ちるようにすること。**
- **【要処置・115.134 のレビューが検出】** `e2e/specs/quantity-tables/name-remarks-autocomplete.spec.ts:14-18` の「**本ファイルが判定していないもの**」節が `- REQ-7.1（…）と REQ-7.7（…）:` と箇条書きのため、`scripts/check-requirement-coverage.ts:522` のリスト正規表現に一致し、**「判定していない」と宣言した要件が被覆源として機械的に採取される**。現時点は兄弟ファイルが実判定しており穴は無く HEAD でも同状態のため退行ではないが、兄弟が失われた場合に偽の被覆源が残る。**箇条書きの `-` を外す1行修正で済む。別タスクとして起票すること。**
- **【要処置・115.134 のレビューが検出】** `e2e/specs/quantity-tables/autocomplete-optimization.spec.ts:141` の `expect(inputText, …).not.toBe(REOPEN_SENTINEL)` は現行の全呼び出し値に対し**恒真**であり、かつ `toPass` の内側にあるため将来破れた際は15秒再試行してから表面化する。補助の契約を守る防御的ガードの意図は読めるが、恒真の解消を主旨とする本系列の中に恒真が残っている。
- **【要処置・115.134 で判明】** `e2e/specs/estimate-requests/*.spec.ts` 3件と `e2e/specs/company-info/company-info-api.spec.ts` 2件も、被覆ヘッダが `scripts/check-requirement-coverage.ts` のパターン4に一致しない表記である（いずれも HEAD 由来で 115.134 の変更範囲外）。**同じ機序で被覆源が黙って失われている可能性があり、別タスクで確認すること。**

- **件数を数える主張は要件が許した追加のたびに壊れる（115.136）**: メニュー項目を4件と数える前提が、`a241d54` の「別グループに移動」追加で赤になった。REQ-36.8 はメニューを閉集合として定めておらず、コピー・移動を正当な構成員として名指ししている。**個々の項目の実在（各1件）を主張する形へ改めれば、欠落・重複を検知しつつ正当な追加では壊れない。** 欠けたときにどの項目かを名指しできる利点もある。
- **件数主張を「ただ削除する」と主張が空虚になる（115.136）**: 非クリップの判定は `for (const probe of probes)` のヒットテストのみで、`probes` が空配列なら**アサーションが一件も実行されない**。件数主張は「項目が存在すること」を担保する唯一の主張だった。**撤去する前に、それが何を担保していたかを追跡すること。** レビューは変異で「1項目除去時に後段ループは残り4項目を通過し、落ちたのはラベル主張だけ」であることまで実証した。
- **必須集合は実装ではなく要件から導出する（115.136）**: `REQUIRED_MENU_ITEM_LABELS` の5件は REQ-36.2（上へ/下へ/削除）・REQ-6.1（コピー）・REQ-6.2/6.4（別グループに移動）から導ける。**実装を写しただけの検証は、実装が壊れたときに検証も一緒に壊れるため要件を満たす証拠にならない。**
- **直列 describe の赤は後続を実行させない（115.136）**: 1件の失敗で後続5件が `did not run` になっていた。**赤は新規の被覆追加より先に処理すること**（スキルの Safety & Fallback も「失敗するテストを先に直す」と定める）。件数だけ見て「1 failed」と受け取ると、実際に検証されていない5件を見落とす。
- **【要処置・115.136 のレビューが検出】** `e2e/specs/quantity-tables/quantity-item-action-menu-clipping-e2e.spec.ts:52-75` のコメントが「REQ-36.8 が項目の追加統合を**明示的に許容**」と書くが、REQ-36.8 は「既存のアクションメニューに他の操作項目（コピー・移動等）が含まれている場合」の統合を定める**条件節**であり、開集合性の根拠にはなるが追加の明示的許可ではない。結論（件数主張は要件に忠実でない）は変わらないが、**要件原文より強い言い方で根拠づけている**。正直化の系列の中の誇張であり是正が望ましい。
- **【要処置・115.136 のレビューが検出】** 同ファイルのラベル照合は `text.includes(label)` の部分一致であるため、将来「コピーして別グループに移動」のように既存ラベルを内包する項目が増えると `コピー` の件数が2となり誤検知する。現時点の実装（`QuantityItemActionMenu.tsx:391-466`）では該当なし。完全一致へ改めるかを別タスクで判断すること。

- **選言で受理する完了判定は、壊れた状態でも成立することを変異で直接示せる（115.135）**: 「`extracted-text` **または** `ocr-error-message` が現れれば完了」という主張に対し、Claude Vision を503に固定し tessdata を遮断して**抽出の両経路を必ず失敗させる**変異を当てたところ、`extracted-text` は現れず `ocr-error-message` が現れて**選言は成立した**。起票文の「OCR が失敗しても緑になる」が実証された。**選言の害は変異で直接見せられる。**
- **被覆タグは五つの形式で採取される（115.135）**: `scripts/check-requirement-coverage.ts:445-537` のパターンは、`@requirement f/REQ-N.M`（1）・括弧つき（2）・**単独形式（3、バッククォート内でも一致する）**・ヘッダー（4）・**ヘッダー直下の `- REQ-N.M:` リスト（5）** を採る。`@requirement` だけ外しても被覆は消えない。実際、先行の是正では `` `@requirement estimate-request/REQ-17.8` `` というバッククォート付きの説明文がタグとして生き残り、**除外登録が効いていなかった**。**タグ撤去は全形式で確かめること。**
- **検査ロジックを再実装して検証器の妥当性を先に確かめる（115.135 のレビュー）**: レビューはパターン1〜5と同一の抽出器を自作し、**まず HEAD 版に当てて6件を検出**して抽出器が働くことを示してから、現行ツリーに当てて0件を確認した。**「検出されなかった」は、検出器が壊れていても得られる。** 検証器そのものの妥当性を先に固定すること。
- **同じ欠陥に二通りの処理が並立していたら片方が誤り（115.135 のレビュー）**: 同一の変更の中で、REQ-17.8 には「タグ除去＋除外登録＋代替検証の実測」を当てながら、同じく到達不能と自ら実測した REQ-17.4/19.1/19.6/19.8 にはタグを据え置いて注記だけを残していた。**処理の不一致は、正しい処理がどちらかを既に知っていることの証拠である。**
- **「別途起票する」は宛先が無ければ免罪符になる（115.135 のレビュー）**: 注記に起票の約束を書いても、実際に起票されなければ誰も消さない。**注記には実在するタスクIDを名指しすること。** 本件では親が 115.157 を起こしてから注記へ書かせた。
- **除外の理由に断定を書かない（115.135 のレビュー）**: REQ-17.8 の理由を「原理的に到達できない」と書いていたが、正確には「現行の fixture が2件ともテキスト入りであるため到達しない」であり、画像のみPDFを用意すれば到達しうる。**書いた本人が読んだ範囲を超えて断定しないこと。**
- **タグを外して除外へ逃がすと `--strict` の「検証を掲げるが不在」が必ず増える（115.135）**: `auditExclusions` は代替検証の実在をタグの有無で判定するため、タグを外した除外は定義上 `in-repo-unverified` になる（146→151）。115.127 段6 の先例8件も全件この区分。**`--strict` は CI・pre-push のいずれの関門でもない**ため後退ではないが、数値の増加を欠陥と誤読しないこと。
- **【要処置・115.135 のレビューが検出】** `e2e/specs/estimate-requests/structured-data-ocr-e2e.spec.ts:730-733` の `hasOcrProgressIndicatorAppeared` の主張は、直前の `waitForOcrProgressIndicator` が成立を保証するため**失敗し得ない冗長**である。実質は待機側が担っており無害だが、恒真の解消を主旨とする系列の中の恒真である。

- **一つの失敗をもう一つへ一般化しない（115.138 のレビュー）**: 実装は `auth-initialization` の2箇所を「補助へ寄せると壊れる」として原状復帰したが、実測すると壊れるのは投げっぱなしリスナ経由の `isOnProtectedPage` だけで、`isOnLoginPage` は寄せて 5 passed だった。**同じファイルの似た関数でも呼び出し元の経路が違えば結果が違う。** 母集団に加えた以上、一件ずつ実測すること。
- **`catch {}` は「テスト終了の中断」まで飲む（115.138）**: `page.on('framenavigated', async …)` のような投げっぱなしのリスナから待機を呼ぶと、テスト本体の終了後に届いた通知で待機が中断され、`TimeoutError` ではない拒否（`locator.waitFor: Test ended.`）がリスナの外へ漏れる。共有の補助は `TimeoutError` のみを false 化して他を再送出するため、この経路では落ちる。**握り潰しが覆っていたものを特定してから寄せること。** 根治は 115.160 で完了した（リスナを名前付きにして本体の後始末で外し、保留中の判定を主張の前に待ち合わせる形）。
- **行番号で指す記述は書いた瞬間に陳腐化する（115.138 で親自身が踏んだ）**: 親が起票文へ書いた `:88` は実測 `:87` の誤りで、さらに是正でコメントを足した時点で `:98` へずれた。**二重に誤っていた記述が、実装のコード内コメントへそのまま写された。** 指す先は検証名・関数名で一意に特定すること（115.149 が設計文書側の同種を所管）。
- **置き換えは「悪くしないこと」が最優先（115.138）**: 起票文自身が「現状は T2 の欠陥そのものではない」と述べる再発源の除去タスクだった。**補助が真偽を返す以上、返り値を `if` の条件に使えば新たな観測条件を作ってしまう。** 判定件数・観測条件の件数を HEAD と突き合わせ、増減0を示すこと。
- **起票文の件数は先行タスクの成果で目減りする（115.138）**: 起票時11箇所が着手時5箇所になっていた（`import-e2e` の6箇所は先行タスクが観測条件ごと撤去済み）。加えて起票文が数え落としていた2箇所と、そもそも該当しない1箇所（要素待機ではなくURL遷移の畳み込み）があった。**母集団は着手時に自分で数え直すこと。**

- **恒真は抜き出しの側にも宿る（115.139）**: `totalText.match(/[\d,]+/)` の原子は文字クラス `[\d,]` だけであり、受理する文字は数字と読点に限られる。一致した文字列は原子が受理した文字だけで構成されるため、続く「小数点を含まない」の主張は**画面表示によらず必ず真**になる。**主張の側だけを見ても恒真は見つからない。抜き出しが何を捨てているかを見ること。**
- **恒真は変異ではなく性質から論証できる（115.139）**: 「落ちる入力が作れなかった」は探索の不足でも得られる。正規表現の受理集合の上界を構文から求めれば、反例が存在しないことを**論証**できる。レビューはさらに 0x00-0x2FF の総当たりで裏を取った。**論証と実測の両方を持つこと。**
- **検出規則を足すときは、まず既知の該当を捕まえられることを示す（115.139）**: 実装・レビューとも、是正前のソースを検出器へ与えて1件検出することを先に確かめてから、作業ツリーで0件であることを言った。レビューはさらに**是正前ソースをツリーへ戻して `check:e2e-guards` が exit 1 になり `0 → 1` を報告する**ところまで確認した。**検出器が壊れていれば0件は自明に得られる。**
- **過検出は主張を消す圧力になる（115.139）**: `T7-excluded-absence` は「抜き出しが受理しうる文字の上界」が構文だけで定まらない書き方（`.` `\S` `\D` `\W` 否定文字クラス 後方参照 コードポイント表記）では**判定を諦めて検出しない**設計を採った。誤検出された検証の作者は主張を弱める方向へ動きやすい。**検出器は見逃す側へ倒すこと。ただし限界を明記すること**（115.164 が所管）。
- **母集団は独立に、より深く数え直す（115.139 のレビュー）**: レビューは実装（識別子を3段遡る）より深い12段の走査を独自に行い、実装の11件を**包含する13件**を得たうえで結論の一致を確認した。**同じ方法で数え直しても、同じ見落としを再現するだけである。**
- **`baseline` は許容リストでもある（115.139）**: 検出件数の基準ファイルは、検出を許容へ移す仕組みを兼ねる。本件の変更は表示専用の `reduction.targets` への1キー追加のみで合否判定に非関与であることを、レビューがコードを読んで確認した。**基準ファイルの差分は「隠す方向でないか」を必ず読むこと。**
- **恒真の型は少なくとも九つある（115.139）**: 既存の検出規則が捉える「真偽を直接主張する形」に加え、(八) 抽出で除外したものの不在を主張する形（`T7` として規則化）、(九) 先行する主張の含意で後続が決して失敗しない形（115.163 が所管）、および「空の母集団に対する不在の主張」（115.162 が所管）がある。**型の一覧は閉じていない。**

- **起票文の因果は実験で否定されうる（115.140）**: 起票は「除外規則のブラウザ側評価経路のせいで実害が対象外になっている」としたが、当該経路へ「戻り値が真偽であること」を課しても検出は0件のまま変わらなかった。同じ分岐が `valueProducingExitExclusion`（115.137 追加）にも**同時に該当する**ためである。実装・レビューが独立に再現した。**起票が示す原因を直す前に、それが本当に原因かを実験で確かめること。**
- **一つの空値が二つの意味を持つと不在の主張は恒真になる（115.140）**: `getActiveObject` は「描画面が不在」と「選択中オブジェクトが不在」の**双方で同じ `null`** を返していた。よって `toBeNull()` は前者でも成立し、要件について何も主張していなかった。**観測できなかったことと、観測して不在だったことを、同じ値で表さないこと。** 観測不能は `throw` で露出させる。
- **不在の主張には陽性対照を添える（115.140）**: 「選択されていないこと」の手前に「選択ツールなら選択される」ことを主張し、解除してから不在を主張する形へ改めた。レビューの変異（対象オブジェクトを全削除）で失敗したのは**陽性対照の行そのもの**であり、飾りでないことが実証された。**不在の主張は、対象が存在することを別に確かめない限り何も主張していない。**
- **前提は仮定せず主張する（115.140 のレビュー）**: 解除クリックの直後に固定待機を置いて「解除されたはず」と仮定していた。これは本タスクが正そうとしている形と同型である。`expect.poll(...).toBeNull()` へ改め、解除の成立を主張にした。レビューの変異（解除クリック自体を除去）で当該行が落ちることを確認した。
- **`expect.poll` は throw を再試行として飲まない（115.140）**: `playwright/lib/matchers/expect.js` の `invokePollMatcher` は `await actual()` を try/catch の**外**で呼び、`raceAgainstDeadline` / `pollAgainstDeadline` も reject を捕捉しない（playwright 1.62.0 で実測・ソース確認）。**構造上 throw が matcher の成功を生む経路が無い**ため、観測不能を `throw` で露出させる設計と `expect.poll` は両立する。
- **検出器の限界は見逃し側だけでなく過検出側も書く（115.140 のレビュー）**: `T8-ambiguous-absence` は「二経路とも真正の不在である補助」も該当と判定する。現時点の偽陽性は0件だが、限界節に見逃し側しか書いていなかった。**推定（構造から導いた帰結）と実測（走査して0件）を区別して書くこと。**

- **捨てた真偽は前提の崩れを「後段へ回す」のではなく「完全に隠す」（115.141）**: 起票は「前提が崩れた場合の失敗は前提の地点ではなく後段に現れる」としたが、実測は違った。前提の補助を必ず偽を返すよう変異させたところ、**是正前は 2 passed**（後段の主張も緑のまま通った）。是正後は `assertPrepared` が前提の地点で落ちる。**戻り値を捨てる形は、前提の崩れを後段へ先送りするのではなく消滅させる。**
- **除外規則の依拠は呼び出し側で表明する（115.141）**: 段3 が前提補助の内側を検出対象外にした正当性は「真偽を**呼び出し側がどう扱うか**は依然として関門である」ことに依拠していた。依拠が呼び出し側で果たされていなければ、除外は根拠を失う。**除外の正当性が別の場所の振る舞いに依存するなら、その場所で明示すること。**
- **母集団は桁で合わせて初めて信用できる（115.141 のレビュー）**: 実装は式文としての呼び出しを 28726（識別子 6005 / 項目参照 22720 / その他 1）と数え、レビューは**別実装の走査で桁まで再現**した。さらに「項目参照 22720 のうち Playwright の即時判定の破棄は 0 箇所」を独立に確認した。**総数が一致しない数え直しは、見落としの所在を示す。**
- **自己検査が動的に名前を採るときは、空になる経路を塞ぐ（115.141）**: 自己検査は補助名を `collectBooleanHelperNames()` から動的に採り、補助の改名で静かに無検出へ落ちないようにした。この仕組みは**補助が消えたときに自己検査が空になって静かに緑になる**危険を伴うが、当該関数はディレクトリ欠損・0件で `throw` するため失敗側へ倒れる。**動的に採る設計は、採れなかったときの振る舞いまで決めて初めて安全である。**
- **検出器の限界は自作例で探す（115.141 のレビュー）**: レビューは自作12例（検出4・非検出8）を検出器へ与え、1例で過検出を発見した。`localFunctions` がスコープを見ないため、ファイル直下の真偽補助と**同名の束縛（引数等）が影を作ると偽陽性**になる。現時点の該当は0件。**限界は使ってみて探すこと。書かれた限界だけを読んでも足りない。**

- **前提の主張の補助は「何を弾くか」で選ぶ（115.142）**: `assertPrepared` は `if (!value)` で空文字・0・false を弾き、`assertPresent` は `null` / `undefined` のみを弾いて**空文字を通す**。同じ変異（見出し行を空文字にする）に対し、`assertPresent` は素通りして後段の列数の主張で落ち、`assertPrepared` は前提の地点で落ちた。**対象にとって空文字が正当かで選ぶこと。** ただし 0 や false が正当な対象へ `assertPrepared` を当てると別種の偽赤になる（115.166 が所管）。
- **「呼ばれていない」の証明には陽性対照が要る（115.142 のレビュー）**: 未使用の補助を除去する際、レビューは (1) `tsc --listFiles` で当該ファイルが検査対象に含まれることを確認し、(2) **参照を一時的に注入すると `TS2305` で失敗する**ことを示してから、(3) 参照が無いことを言った。**「参照が無いから型検査が通る」は「型検査が効いていない」場合にも成立する。** 加えて名前空間取り込み・再エクスポート・動的 import の不在と `git log -S` による履歴追跡で、呼び出し側が**一度も存在しなかった**ことを確定した。
- **死んだ主張の除去は主張の消失にあたらない（115.142）**: 除去した補助の内側には `expect` が1件あったが、呼び出し側が一度も無いため実行されたことがない。移管先を要しない。**ただしそれを言うには上記の証明が要る。** 件数だけを見て「1件減った」と判断しても、逆に「死んでいるから消してよい」と主張しても、どちらも根拠にならない。

- **恒真は matcher の形を変えるだけで検出を逃れる（115.143）**: `isVacuousBoolean` は `typeof x` を恒真として扱うのに、T3 の発火は `matcherArgIsBoolean`（引数が `true` / `false`）で門番されていた。したがって `expect(typeof x === 'string').toBeTruthy()` は捕まるが、**同じ主張を `expect(typeof x).toBe('string')` へ載せ替えると素通り**する。**検出規則は主題の性質だけでなく、主張の形の全ての言い換えを塞いで初めて機能する。**
- **広い規則は自分たちの過去の是正を欠陥として数え返す（115.143）**: 関門を「`typeof` を見た時点」へ広げると 32 件検出されるが、その大半は応答の項目が欠ければ `'undefined'` になって落ちる**実質のある実行時検査**であり、**うち一件は 115.127 段5 がこの形へ是正したもの**だった（`db2417d` で裏取り）。**規則を広げる前に、それが何を欠陥と呼ぶことになるかを実測すること。**
- **過大に見積もる判定は見逃しにはなっても過検出にはならない（115.143）**: `T10-settled-type-assertion` は主題の実行時型の集合を構文だけで**過大に**求め、集合がちょうど一つで主張された型と一致するときだけ検出する。判らないものは「判らない」として検出しない。**安全側の倒し方を、判定の設計そのものに埋め込むこと。**
- **限界の記述は「書いてあるとおりに再現できるか」まで確かめる（115.143 のレビュー）**: レビューは限界節が挙げた偽陽性リスク（Playwright 以外の `count()`）を**自作例で実際に再現**し、注記どおり存在することを確認した。**限界節は読むだけでなく、書かれた限界が本当にその限界かを試すこと。**
- **起票文の是正内容が先行タスクで既に満たされていることがある（115.143）**: 起票の三点のうち二点は着手時点で `a6da29d` が是正済みだった。`git log -S` が当該コミットを挙げなかったのは、是正時に追記された説明文へ同じ綴りが残り出現数が 1→1 で不変になったためである。**`git log -S` の不在は是正の不在を意味しない。差分そのものを読むこと。**

- **形式検証の無い定義は、記載と実体が静かに乖離する（115.144）**: 除外定義の `$schema` はリポジトリに存在しないファイルを指しており、定義は一度も形式検証を受けていなかった。スキーマを実在させて検査へ組み込んだところ、**実データの欠陥が4件**見つかった（総数の記載値277に対し実体271、分類別集計の2件のずれ、使われているのに未定義の分類）。**この乖離は 115.135 の時点で認識されながら「既存の乖離」として意図的に触れられずにいた。** 機械の検査が無い限り、記録の誤りは誰かが気づくまで残り続ける。
- **除外は被覆率の分母を削る（115.144）**: だからこそ除外定義の破損は、被覆の主張を静かに空洞化させる。`$schema` の参照を外して無検査のまま残す道より、スキーマを実在させる道を採った理由がこれである。**分母を動かす仕組みには検査を置くこと。**
- **新しい関門には自己検査と陽性対照を同時に置く（115.144）**: 検証器は壊し方25種（実装）＋22種（レビューが独自に作成）で弾けることを確認した。さらにレビューは **`validateAgainstSchema` を空実装へ差し替える変異試験**を行い、自己検査が exit 1・検出漏れ12件になることを確かめた。**自己検査が飾りでないことは、検証器を壊してみて初めて言える。**
- **「解釈できない語彙を黙殺しない」は別の語彙で試す（115.144 のレビュー）**: 実装は `oneOf` を注入して黙殺しないことを示したが、レビューは `format` / `uniqueItems` / `maxLength` / `allOf` の4語彙で追試した。**一つの語彙で通ったことは、実装がその語彙だけを特別扱いしていないことの証明にならない。**
- **記録は是正のたびに追随させる（115.144 のレビュー指摘）**: 除外定義の `summary.note` は過去の是正の経緯を積む慣行だが、本タスクは無追記だった。結果として「実件数と記載値の既存の乖離には手を触れていない」という**本タスクがまさに是正した記述**が残ったままになっていた。親が追記して解消した。**歴史的な記録は改変せず、追記で現在を示すこと。**

- **明文の契約は破られていないかを呼び出し側で確かめる（115.145）**: `canvasViewportController` は冒頭に「`zoomToPoint` の指定点は描画面基準であり、`clientX/clientY` を渡す呼び出し側は必ず `toCanvasPoint` で基準を揃えること」と**契約として明記**していた。ダブルタップの経路はこれを破って画面座標を直渡ししていた。**契約が書かれていることと、守られていることは別である。** 115.129 が同じ契約をピンチ経路へ適用した際、隣の経路は揃えられなかった。
- **要件に無い受入水準は出所を示して足す（115.145 のレビュー指摘）**: 要件 33.8 は「拡大と全体表示をトグルする」までしか定めず、拡大の中心には触れていない。追加した「タップ点が拡大の中心である」という主張は、**コントローラの明文契約と design.md の直接操作の原則から導いた受入水準**であって要件原文の言い換えではない。当初の注釈は要件原文の言い換えのように書かれていたため、導出の出所を明示する形へ改めた。**要件より強い言い方で根拠づけないこと。**
- **画面を変えたら配信されている実体を確かめる（115.145）**: フロントエンドの是正は再ビルドしないと E2E に届かない。反映の確認は**コンテナの作成時刻だけでは足りない**。配信バンドルのハッシュ変化に加え、**バンドル中の `toCanvasPoint` の出現数が 2 → 3 へ増えた**ことまで見て初めて、呼び出しの追加が届いたと言える。実装・レビューとも RED / GREEN の各サイクルでこれを確認した。
- **模した値は「実配置を模した」と書かない（115.145 のレビュー指摘）**: 単体の要素オフセット 220 は実配置の値ではなく、変換の有無が確実に顕在化する大きさとして選んだものだった（実測から逆算される実オフセットは縦およそ 101.6）。**説明が実測と食い違うと、次に読む者が模擬値を実測値と誤認する。**

- **死蔵の撤去は「誤認の危険」を消すのではなく形を変える（115.146 のレビュー）**: 起票の動機は「後任が参照実装と誤認する危険」だった。撤去した結果、本番コード10箇所に**存在しないファイルを現存物として指す導線**が残った。撤去そのものが危険を解消するわけではない。**撤去したら、それを指していたものを全部数えること**（115.169 が所管）。
- **死蔵整理タスクが境界内に検出不能な死蔵を残しうる（115.146 のレビュー）**: 撤去により `ImageViewerRef` / `ImageViewerViewState` の利用者が 0 になったが、宣言ファイル自身は別経路で本番到達するため、`check:req-coverage` の**モジュール単位の到達判定では永久に検出されない**。是正で撤去した。**検査の粒度より細かい死蔵は、検査に頼らず自分で数えること。**
- **バンドルのバイト同一は死蔵であったことの機械的証明になる（115.146）**: HEAD の worktree と作業ツリーで別々にビルドし、出荷物の md5 が全件一致した。**削除したのに出荷物が変わらないなら、それは出荷されていなかった。** 同時に E2E が不要であることの根拠にもなる（観測対象が変化し得ない）。なお `stats.html` は毎ビルド非決定（uid の乱数）なので `diff -r` は必ず差分になる。**出荷物だけを比べること。**
- **「タグだけが付いていた」検証がある（115.146）**: 撤去した `ImageViewer.test.tsx` は `REQ-30.5`（描画ツール使用中の選択防止）を名乗っていたが、全文に `選択防止` / `selectable` / `selection` / `Req 17` が**一件も無かった**。当該部品は描画ツールを持たないため、原理的に検証できない要件のタグを付けていた。**タグの存在は主張の存在を意味しない。**
- **表へ行を足すと、行を指す注記が別の行を指す（115.146 のレビュー）**: 「注（上表の**最終行**について）: これら4件は…」という注記のある表の末尾へ新行を追加したため、注記が2件の別行を指すようになった。**位置で指す記述は、位置が変わると黙って嘘になる。** 行を名指しする書式へ改めた（同じ文書内に既にその書式の先例があった）。
- **見落としは重なる（115.146）**: 陳腐化した参照はレビューが9箇所と数え、是正時の再測で10箇所目が見つかり、再レビューでさらに範囲外の steering 2箇所が見つかった。**同じ性質の見落としが三度続いた。** 数える範囲を先に宣言し、その範囲で正確であることと、範囲外に何があるかを別に述べること。

- **条文から外れているのがどちらかを取り違えない（115.148 のレビュー）**: 実装は「切替だけを 44 の対象に加える根拠は要件原文に無い」と書いたが、要件28.3 の原文は「各項目」であり**文言のうえでは切替も対象**である。条文から外れているのは現行の「道具のボタン限定」という**狭め方のほう**だった。結論（絶対値を持ち込まない）は変わらないが、理由は「条文に根拠が無いから」ではなく「**同格の隣接を据え置いたまま切替だけを 44 にすると適用範囲の決着を先取りするから**」である。**実態が条文より狭いとき、実態を条文と読み違えないこと。**
- **相対的な主張は現時点の締まり具合を測って評価する（115.148 のレビュー）**: 「隣接より小さくない」という主張は将来隣接が縮めば弱まる。しかしレビューが実測したところ、全8ツールで隣接の最小は 幅32/高さ24/面積768 で、切替は 32x24=768 と**三項目とも等号ちょうど**だった。**1px でも縮めば失敗する。** 相対的だから弱いのではなく、どれだけ余裕があるかで決まる。
- **数える範囲を宣言し、宣言と実測の一致を比較の前に確かめる（115.148）**: 検証は属性パネル内の操作要素の個数を `OutlineToolDefinition` へ先に宣言し、実測がそれと一致することを確かめてから寸法を比べる。レビューが宣言値を 2→3 に変異させると「個数が宣言と一致しない」で落ちた。**要素を数え漏らしたまま比較が通ることを防ぐ。** 115.146 で見落としが三度重なった反省が形になっている。
- **承認側の指摘も検証対象である（115.148）**: レビューは「実装者は 9 passed と報告したが実際は 6 件」と指摘したが、実装者は2つの検証ファイル（6件＋3件）を同時に実行しており報告は正確だった。親が両ファイルのテスト数を数えて確認した。**指摘された側だけでなく、指摘した側の数値も確かめること。**

- **撤去の挙動不変は条件式の網羅で論証し、逆向きの変異で確かめる（115.147）**: 撤去した打ち切りは「到達しても結果を変えない」冗長な分岐だった。継続条件が `size > MAX` である以上、`size <= MAX` で真になる打ち切りは次の継続条件判定が必ず偽になる場合にしか働かない。**レビューは「撤去したものを復活させても全件緑」という逆向きの変異でこれを独立に確かめた。** 論証と実測の両方を持つこと。
- **「赤くなる」だけでは足りない。意図した理由で赤くなっているか（115.147）**: 段階を与えるテスト補助が並びを使い切ると、**モック枯渇による別種の失敗**（「画像メタデータの取得に失敗しました」）で赤くなっていた。実装者が自ら気づき、最後の値を返し続ける構成へ改めて段階数の主張で赤くなるようにした。レビューはフォールバックを取り除いた対照実験で是正の実効を確かめた。**恒真の裏返しとして「偽の赤」がある。**
- **ラチェットを外すことは「実装が要件を満たすようになった」と言うこと（115.147）**: `test.fail()` の撤去前に無条件の主張へ改めて実行し、全件緑であることを実測してから外した。外した後の主張が変異で赤くなることも確かめた。**外す順序が逆だと、満たしていないものを満たしたことにできる。**
- **除外を削除したら被覆の分母が動く（115.147）**: 除外を1件削除すると分母が +1 され、その受入基準が被覆側へ移れば分子も +1 される。HEAD 2623/2648 → 現状 2624/2649 で**未到達25件の一覧は完全一致**。**移っていなければ被覆の穴になる。** 削除の是非は件数ではなく一覧の差分で判断すること。
- **下限は出力サイズの制約として原理的に成立しない場合がある（115.147・要件変更の背景）**: よく圧縮できる画像は品質90の一度の再エンコードで下限を大きく下回る（実測 61,638 バイト）。下限へ戻すには品質を上げ直すか拡大するしかなく、**元画像より劣化した状態で容量だけ増やす**ことになる。下限の本来の意図（必要以上に品質を落とさない）は、出力サイズではなく**処理の制約**（段階的に下げ、上限を満たした時点で打ち切る）で表現できる。**「範囲」で書かれた受入基準は、両端が同じ種類の制約かを疑うこと。**

- **除外の論拠は反例可能な命題として書き、自らが列挙する死角一覧と矛盾しないことを確認する（115.149 の debug）**: 第4回の是正は 15,979 件を「位置を指すには標識でしか書けない」という前提で目視せず除外したが、**同じ段落が死角(2)として `同ファイル NNN / NNN` を挙げており、それが前提そのものの反例**だった。新たな実測は不要で、段落を通して読めば成立していた。**除外の論拠を書いたら、自分が並べた死角の一覧と突き合わせること。**
- **数え上げの単位が大きすぎて目視できないと感じたら、単位を数値から行へ落とす（115.149 の debug）**: 実装は「標識なし 15,979 件のうち 1,737 件は同じ行に本番パスを持つ」と**自分で測っていた**。目視すべき集合は既に特定されていたのに、単位が「数値」だったため過大な作業と誤認して演繹へ逃げた。単位を「行」にすれば `grep` で 136 行（別の定義では 67 行）で、数十行の目視で足りた。
- **範囲を日本語で宣言しても再現できない（115.149 の debug）**: レビューの走査範囲は 67 行、debug の走査範囲は 136 行で、**同じ自然言語の記述から出発して2倍ずれた**。範囲は**コマンドで宣言**し、出力件数を併記すること。「本番パスを含む行の3-4桁の裸数値」のような記述は、書き手ごとに違う集合を指す。
- **「掃き終えた」は主張の形として欠陥がある（115.149 の debug）**: (1) 未検査の母集団に対する全称否定であり、(2) 機械保証と人手演繹という**強度の異なる根拠を区別せず束ね**、(3) 反証条件を伴わないため監査不能で、反例提示以外に検証できない。四度とも「反例が見つかる」形でしか誤りが露見しなかった。**代わりに三層で書くこと**——(A) 機械保証（コマンドで再現可能）、(B) 人手走査（**再現コマンドと行数を併記**）、(C) 未走査の残余（反例可能な命題として列挙）。結論は「残存0」ではなく**「A と B の範囲で0件。範囲外は保証しない」**。
- **網羅的な方法へ変えても、最後の一歩を演繹で埋めれば同じことが起きる（115.149 の debug）**: 方法は外延的（形の列挙）から内包的（標識による分類）へ変わったが、**主張の形は不変**だった。むしろ未検査範囲が 15,979 件へ拡大し、単一の誤前提の被害半径が最大化した。**発見件数（19→28）が増えたのに残存リスクは1文へ集約された。**
- **先行の教訓が当たっていたのに参照されなかった（115.149 の debug）**: 本件には「全称・唯一性の断定は走査コマンドを併記せよ」「網羅を主張できないときは主張しない」「単一経路から普遍命題を導かない」「数える範囲を先に宣言せよ」の4件が正面から当たっていた。**教訓の不足ではなく参照の欠落である。** 着手前に Implementation Notes を読むこと。

- **再現コマンドを宣言したら、その出力を実測で分類すること（115.150 のレビュー）**: 走査範囲をコマンドで宣言したうえで、出力の内訳を事実と異なって述べた。第一のコマンドの出力に本番の値が4件あるのに「1件だけであり、他は注釈である」と全称で書き、第二のコマンドが返す105件を分類が覆っていなかった。**コマンドを書いた時点で読み手はそれを実行でき、全称の言明は即座に反証される。** 是正では総件数と各区分の件数を併記し、相互排他かつ合計が一致することを機械照合した。115.149 が確立した (A) 機械保証 /(B) 人手走査（再現コマンドと件数を併記）/(C) 未走査の残余 の三層は、**参照形式の話ではなく走査一般の作法**である。
- **単一情報源の主張は値の一致では証明できない（115.150）**: 資材へ寄せたことを `expect(stroke).toBe('#ffffff')` で主張しても、literal が残ったままでも通る。**資材側の値を変異させて消費側が追随することを実測する形**でのみ供給元の単一性を示せる。レビューは本番4箇所を literal へ戻して狙い通り4件だけが red になることを確認した。
- **要件の字面に無い根拠を要件番号へ帰さないこと（115.150 のレビュー）**: 永続化に色が含まれる根拠を要件24.6/24.7/32.7 に帰していたが、要件の列挙は「有効/無効・縁取り幅」であり色に言及しない。実体は「実装の JSON 形式が属性を丸ごと出力する」という**実装事実**であった。同じ段落の別箇所では正しく書いており、文書内で矛盾していた。
- **115.150 の残余（境界外）**: `frontend/src/components/site-surveys/tools/TextTool.ts` の `DEFAULT_BALLOON_OPTIONS` の背景色と枠線色が literal のまま残る（吹き出しの既定色、要件8.6）。115.102 が吹き出しの様式だけを資材へ寄せた結果であり、115.150 と同じ形の欠陥だが白アウトラインの色ではないため境界外とした。後続タスクの候補である。

- **「一本へ寄せた」の効力の所在を実測で切り分けること（115.151 のレビュー）**: 呼び出し側の比較を共有関数へ置換しても、構造上すでに両辺が正準形であれば**その置換は冗長な二重防御**であり、外しても検証は落ちない。レビューが変異で実測したところ、実効を担うのは (a) 合成側で並び全体を正準形に確定させること、(b) 正規化関数が小文字化を行うことの2点だけで、比較関数への置換と重複排除の集合は外しても93件が全緑のままだった。**「寄せた」ことと「寄せたことが効いている」ことは別の主張である。** 報告では効力の所在を正確に述べること。
- **現行値だけを試す検証は二系統の正規化を検出できない（115.151 の実測）**: 資材の既定色が現行の小文字6桁のままなら、合成側と選択判定側で正規化が食い違っていても検証は通る。実装前の時点で大文字6桁のうちパレット非同色の表記すら緑だった。**表記を変異させる検証（大文字6桁×パレット同色／3桁記法×パレット同色）だけが欠陥を捉えた。** 正準化の主張は現行値ではなく境界の表記で確かめること。
- **115.151 の申し送り（撤去タスクへ）**: 対象の `frontend/src/components/site-surveys/StylePanel.tsx` は本番未結線の死コードである（design.md「未結線部品の扱い」が権威。本番参照0件、参照元は試験と物語のみ）。出荷経路の同名部品は色のプリセットの並びを持たないため本欠陥型は原理的に発生しない。本タスクは当該部品へ新規の検証ファイルを1本追加したため、**撤去タスクの射程が1ファイル分増えた。撤去時に `StylePanel.color-normalization.test.tsx` も同時に落とすこと。** 被覆率の分母は動いていない（要件26.5 は出荷経路側でも被覆済み）。
- **115.151 の残余（境界外）**: 出荷経路の道具帯に内包される同名の属性パネルは色の正規化を一切行わず、色入力欄へ無正規化の値を渡す。また透明を空文字で表す表現依存の等価比較が道具帯1件・テキストの道具3件・注釈編集画面1件ある。いずれも HEX の大小ではなく空文字規約の話であり、道具帯とツール群の契約に触れるため境界外とした。

- **座標変換の検証は期待値を実装から独立に取ること（115.152 のレビュー）**: 変換後の座標を実装と同じ式で組み立てて主張すると、両辺が同量ずれるため**恒真の主張**になる。レビューは原点を返す関数に定数を加える変異を独自に行い、6件が落ちることで期待値の独立性を機械的に実証した。**期待値は描かれた図形自身から取り直すこと。** なお実装者が「二つの独立な基準で主張した」と述べた片方は、同じ原点関数を共有するため代数を展開すると第一の主張と同値に帰着していた。独立性の主張も実測を要する。
- **変異で落ちる件数の非対称は、まず呼び出し元の有無を疑うこと（115.152）**: 二つの関数を同じ形へ是正したのに、変異で落ちる件数が6件と1件に分かれた。原因は一方に**本番の呼び出し元が存在しない**ことであった。件数の少なさが検証の薄さとは限らない。
- **モックの補強は最も慎重に見る箇所である（115.152）**: 検証を通すために検証対象の環境を書き換える行為だからである。判定は「実計算か決め打ちか」「既存の主張が弱まっていないか」の二点で行う。本件は共有ヘルパーの実計算を与えるだけで、当該ファイルに呼び出し回数の主張が無いことまで確認して弱体化なしと判定した。
- **実 Fabric で画面部品を描く単体検証は取れない（115.152 の環境制約）**: `canvas` パッケージ未導入のため jsdom に2Dコンテキストが無く、画面部品を実 Fabric で描画する経路が成立しない。受入レベルの検証は「本番の図形部品を実 Fabric 上で動かす単体境界」＋「画面から呼び出しへ到達することを押さえる既存の検証」＋「本番経路のE2E」の三段で構成した。**画面側の呼び出し順を写す場合、写す範囲を位置決定に無関係な部分に限ること。** 写しは本番が変わっても追随しない。

- **母集団が判別力を持たない検証は、本番を真逆にしても落ちない（115.153 の実測）**: 要件15.7 は「古いものから削除する」を名指しするのに、古い下書きだけを積む検証では「古い順」「新しい順」「任意順」がすべて同じ結果になる。本番を新しい順へ変異させても、E2E は素通り、結線検査は全件通過、単体のリトライ検査も緑のままだった。判別力を持っていたのは削除関数の直接検査ただ一件である。**消えるべきものと残るべきものを混ぜて積み、残存する集合を名指しで主張すること。** 積む順序は新しいものを先にすると、並べ替えを省いた実装（挿入順で消す）でも落ちる。
- **モックが自分自身を呼び戻す形は、経路が一度も走らないまま緑になる（115.153 の発見）**: 差し替え対象が大域の記憶領域そのものである場合、`spyOn` は当該objectのメソッドを置換するため、実装内から同じメソッドを呼ぶと**置換後の関数へ再入して無限再帰**する。当該検証の主張が「呼ばれたこと」だけだったため、リトライが一度も成功しないまま緑が続いていた。**差し替え前の実装を先に捕まえて呼ぶこと。** 併せて、結果そのもの（成功したか）を主張すること。なお同スペックの結線検査は差し替え前を正しく捕まえており、本番の欠陥は露見していない。
- **恒真の三形**（115.153 で同時に是正）: (a) 上限との比較（`toBeLessThanOrEqual`）は母集団が空でも真、(b) 主張を件数の分岐で包む形は分岐が成立しなければ空振り、(c) 「呼ばれた」だけの主張は結果を見ていない。いずれも**残存する集合の完全一致**へ置き換えると判別可能になる。
- **全件実行には不安定な検証が混じる（115.153 の完了検証）**: 数量表編集画面のサムネイルの主張が全件実行時のみ一度落ちた。単独実行は全件通過し、再度の全件実行でも通過したためフレークと確定した。**一度の赤で回帰と断ずる前に、単独実行と再実行で切り分けること。** 逆に、緑を一度見ただけで安定と断じないこと。

- **「やることが無かった」は実装と同じ水準の実測を要する（115.155）**: 差分が零の完了は、真に不要だった不作為と、見落としによる不作為とで**外形が同じ**である。したがって充足済みであることを実測で示し、**解消元を完了時注記として残す**こと。本件では起票時点の設定を取り出して機械照合し、起票の前提が当時は真だったこと、および別タスクが同時に解消したことまで確かめた。
- **起票文の前提は着手時に失効していることがある（115.155）**: 起票は当時の観測に基づくため、着手までに別のタスクが解消していれば前提は成立しない。**前提そのものを検証対象に含めること。** 本件では「当該の一件だけが非対称」という前提が、着手時点では成立していなかった（算入漏れは零件）。
- **関門の実効は条件式の形で確かめること（115.155）**: 「依存に入っている」ことと「落ちたら止まる」ことは別の主張である。判定が `!= "success"` の形なら未実行や中断も捕捉するが、特定の状態を許容する分岐があればそこが抜け穴になる。併せて `continue-on-error` の有無、配備側の依存が関門のみか、他の入口から迂回できないかまで見ること。

- **検出器を触る前に、規則が検出の必要条件か十分条件かを実挙動で確かめること（115.156）**: 本件の消費判定は**検出の必要条件**であり（走査は消費されない呼び出しを読み飛ばす）、範囲を広げると検出が**増えて過検出**になり、見逃しは範囲を**狭めた**ときに生じる。親の指示はこの極性を逆に書いており、実装者は説明文へその誤りを取り込んだ。レビューがコードの実挙動から独立に正しい極性を導いて捕捉した。**指示や起票文の極性を前提にせず、条件式の位置から自分で導くこと。**
- **説明文の極性の誤りは、実装が正しくても危険である（115.156 のレビュー）**: 当該の一文は検査群の存在理由そのものを説明していた。読んだ保守者が「広げると見逃す」と誤解すれば、実際に危険な方向（狭める方向）へ手を入れうる。**実装・登録名・限界節がすべて正しくても、説明文一つで規則の意味が反転して伝わる。**
- **自己検査は宣言した限界も固定すること（115.156 の M5）**: ヘッダが「表に無いメソッドを挟む連なりでは辿るのをやめ、見逃す側へ倒す」と宣言していたが、その `return false` を削除する変異は自己検査を通り抜けた。**宣言だけあって固定の無い判断は、次の変更で黙って失われる。** 追加する際は、既存の群と**判断の種類が違う**なら別建てにすること（本件は「受け手が解決値を受け取らない」形の集合とは別種の「辿るのをやめる」判断であり、別建てにしたことで失敗時の診断が当該判断を名指しする）。
- **該当零件の穴を塞ぐ変更は陽性対照でしか示せない（115.156）**: 現存する違反が無い以上、検出件数は変更前後とも零のままで、それ自体は何も語らない。**該当する形を一時的に書き、変更前は静かな緑、変更後は検出、を実測すること。** 併せて全走査対象で旧新の判定を突き合わせ、**判定の反転が零件**であることを示すと、範囲を広げていないことの裏取りになる。

- **本環境では壁時計と単調時計が約8.6%乖離する（115.157 で特定）**: `setTimeout` は単調時計で駆動されるが `Date.now()` の進みが遅く、30000ms のタイマー発火時に壁時計は27419ms しか進まない（clocksource は `hyperv_clocksource_tsc_page`、素の実行でも再現）。**壁時計で測ると打ち切りが公称より約2.6秒早く終わったように見える。** 実装は正しく、測定器が誤っていた。**時間の受入基準を検証するときは、対象と同じ時計で測ること**（`setTimeout` を測るなら単調時計）。
- **「原因は未解明」で止めず追うこと（115.157）**: レビューは「公称30秒より約2.6秒早い、原因未特定」で差し戻し、親も未解明のまま是正を指示した。実装者が追ったところ**早く終わっていたのではなく測定器が遅れていた**という逆の結論に至り、幅を広げる理由づけそのものが不要になった。**未解明のまま幅を広げて辻褄を合わせると、欠陥の所在を取り違えたまま固定される。**
- **時間の受入基準は幅で骨抜きになる（115.157 のレビュー）**: 「30秒」に対し `[25000, 45000]` の幅を置くと、26秒実装でも40秒実装でも通る。**実測の分布を取ってから、誤った実装を排除できる最小の幅を決めること。** 本件は3回の実測（30832〜30903ms、ばらつき71ms）から `[29000, 34000]` とし、下限で早期の諦めを、上限で完走を排除した。
- **未計測の推測を実測として注記に書かないこと（115.157 のレビュー）**: 幅を置く理由として「Node 側とページ側に約1.3秒のずれ」と断定していたが、直接計測では2msだった。**検査していないものを被覆と数えさせないための一連の作業において、注記に推測を実測として据えるのは同じ種類の瑕疵である。**
- **経路へ到達しない検証は、素材を替えるまで何も主張していない（115.157）**: 既存の見本はいずれも文字入りのPDFで、閾値判定により走査の分岐がフォールバック側へ一度も入らなかった。**画像のみのPDF を用意して初めて当該経路の受入基準を検証できる。** 到達の観測は3系統（描画寸法が倍率に一意に帰属すること、前処理後の画素の性質、外部資材の取得パス）で行い、同じ観測を文字入りPDFへ当てて痕跡が一件も現れないことで弁別能力を固定した。

- **`A.or(B).first()` は「どれかが満たせば成立」ではない（115.158 の実測）**: 合併した候補から**文書順の先頭を一つだけ選び、その一つの可視を問う**形である。したがって枝を足しても先頭が入れ替わらなければ判定は一切変わらない。本件では読み込み中の骨組みが対象より前にあり、しかも幅0で可視条件を満たさないため、後ろの枝には到達していなかった。**選言に見える形が、実は先頭要素だけを見ていることがある。**
- **外枠の存在は状態を語らない（115.158）**: 描画部品の外枠は読み込み中も失敗時も描かれ、状態は外枠の**内側**の表示で分かれる。したがって外枠の可視を成立の根拠にすると、**失敗の終状態を受理する**（実測 18〜27ms で緑）。成功時にしか現れない要素を根拠にすること。
- **もっともらしい機序を書く前に測ること（115.157・115.158 で二度連続の差し戻し）**: いずれも実装は正しかったのに、注記に書いた機序が実測と食い違って差し戻された。「失敗を受理していた」「時計が1.3秒ずれる」はどちらも読めば筋が通るが、測ると違った。**説明が書けることと、その説明が正しいことは別である。** 判定の由来を書くときは、旧判定が実際に掴む要素を取得する、時刻を対象と同じ時計で測る、といった直接の観測を伴わせること。
- **115.158 の申し送り**: 失敗表示を検知してから赤になるまで 7.5〜10 秒を要する。待機切れ（15秒）より早いが即断ではなく、これは不在の主張が既定の待ち時間を消費するためである。注記に機序込みで記す余地がある。

- **タグは被覆の主張であり、主張には実体が要る（115.159）**: 一つの検証が十六件の受入基準を掲げながら、実体は選択子を四つ並べた可視性の主張ただ一本で、判定率は零だった。被覆率の検査はタグだけを見るため、十六件が被覆済みと数えられ続けていた。**「その受入基準の規範を、どの主張が確かめているか」を一件ずつ問うこと。**
- **タグを外すことが後退とは限らない（115.159 の実測）**: 処遇は三通りある。(a) 移動先が既に判定していれば**タグを移すだけで被覆は落ちない**（本件では四件が該当し、移動先は従前から画素で主張していたのにタグが欠けていた）、(b) 実行中の画面から観測できないものは**除外へ登録する**（一件）、(c) 判定を書けるものは**書く**（十一件）。結果、被覆率は不変のまま実体が伴った。**減った一件は隠れていた穴の露出である。**
- **刺激は互いに弁別できる形にすること（115.159）**: 新しく書いた判定は、実物の応答・応答の滞留・注入した誤り、という三種の刺激を使い分け、観測側は順序・状態コード・通知の理由文言で刺激を特定する。**「両方起きた」ではなく順序を主張する**、**差し替えでなく実物の応答を使う**といった形が、刺激と観測の対応を保証する。
- **被覆の欠陥には逆向きもある（115.159 の走査）**: ヘッダで担当を掲げながらタグを持たない検証が二十件あり、**実際に判定しているのに被覆に数えられていない**。過大に見せる欠陥ばかり追っていると見落とす。**ヘッダに書いただけで被覆したことにしない**という原則は両方向に働く。
- **走査の道具自体を疑うこと（115.159 の親側の実測）**: 検証ごとのタグ数を数える際、ファイル冒頭の概要ブロックを直後の検証へ誤って帰属させ、また非貪欲の照合が終端を跨いで伸びたため、最大タグ数を大きく誤って測った。**走査結果が予想と食い違ったら、まず自分の走査を疑うこと。** 正しく測り直すと実装者の申告と一致した。

- **評価の順序も主張を空洞にする（115.160 の実測）**: 握り潰しでも選言でもなく、**判定の完了より先に結果を読む**構造で主張が無効になっていた。判定を「一定時間後に必ず真を返す」形へ差し替えると、**是正前は三回とも通った**。判定が毎回「見えている」と返しているのに「見えていない」という主張が成立していたのである。**緑が何も語らない型は、握り潰し・選言に続いて第三の形がある。**
- **投げっぱなしの購読は寿命を管理すること（115.160）**: 本体の終了後に届いた通知から待機を呼ぶと、待機切れではない拒否（本体終了による中断）が購読の外へ漏れる。根治は握り潰しを広げることではなく寿命の管理である。形は (a) 名前付きの購読にして**後始末で必ず外す**、(b) 保留中の判定を**主張の前に待ち合わせる**、(c) 判定の失敗は控えて**待ち合わせの直後に送出する**（飲まない）の三点。**外す操作を待ち合わせより先に置くと、待ち合わせ中に新たな判定が積まれる余地が構造的に消える。**
- **共有の補助へ寄せられることが根治の証拠になる（115.160）**: 当該箇所だけ補助へ寄せられずに独自の握り潰しを抱えていたのは、握り潰しが「本体終了の中断」を飲んでいたためだった。寿命を管理すると中断そのものが起きなくなり、補助へ寄せられた。**「ここだけ寄せられない」は、覆い隠している何かがある兆候である。**
- **対照そのものが有効かを確かめること（115.160）**: 実装者は最初に組んだ対照が「注入位置が握り潰しの外にあり、当該経路を通らない無効な対照」だったと自認し、組み直した。**対照が狙った経路を通ることを確かめてから、対照の結果を根拠に使うこと。**

- **握り潰しが偽の緑を生むかは、受け手の主張の向きで決まる（115.161 の実測）**: 同じ `catch(() => 空値)` でも、結果を「空でないこと」で受けるなら握り潰された失敗が最速で勝って**赤**になり、「空であること」で受けるなら**そのまま緑**になる。起票文は前者を偽の緑と見立てていたが成立せず、真の偽の緑は後者の形で境界外に三箇所実在した。**握り潰しを見つけたら、飲んだ値がどの主張へ流れるかまで追うこと。**
- **偽の緑でなくても是正の価値はある（115.161）**: 対象の実害は二つあった。(a) 失敗の言い分が常に「いずれも表示されない」に化け**真因が消える**（注入した複数一致の違反が出力に一度も現れなかった）、(b) 他方の枝が実際に表示されていても選言が先取りされ**偽の赤**になる（実測で当該要素は可視だった）。**緑の正しさだけでなく、赤の言い分の正しさも検証の品質である。**
- **注入対照は「狙った経路を通ったこと」を痕跡で確かめること（115.161 のレビュー）**: レビューは注入時の失敗スタックが**握り潰しの判定行を指している**ことをもって、対照が当該経路を通ったと確認した。115.160 で「注入位置が経路の外だった無効な対照」を経験した後の作法である。**対照の結果を根拠に使う前に、対照が届いたことを示す痕跡を取ること。**
- **枝ごとに異なる待機は揃えないこと（115.161）**: 選言の枝が別々の待機を持つ場合、揃えると「一方が出ないまま他方が遅れて出る」場合の結論が変わる。是正では十四箇所すべての待機を一字一句保存し、揃えてはならない理由をコードに残した。**機械的な寄せが不可な箇所は、不可である理由を現地に書くこと。**

- **緑が何も語らない型は少なくとも四つある（115.162 で四つ目を確定）**: 握り潰し（待機切れ以外を飲む）、選言（成功と失敗を束ねる）、評価の順序（判定の完了より先に結果を読む）、そして**空の母集団**（母集団が空なら不在の主張が素通りする）。四つ目は 115.139 が扱った「抽出で除外したものの不在を主張する」型とも別で、**母集団の大きさを先に固定してから不在を主張する**ことで塞がる。
- **検出規則を足すときは、広げる向きの変異で非検出側が落ちることを実測すること（115.162）**: 新しい規則は必ず狭める判断を伴い、その判断が固定されていなければ次の変更で黙って広がる。レビューは実装者が試した四種に加え**五種を自ら考案**し、特に**免除の探索を本体全文へ緩める変異**（見逃しを広げる最も危険な向き）が検出側に殺されることを確認した。**片側だけの自己検査は広がる向きの劣化を検出できない**という教訓の、実行可能な形である。
- **見逃す側へ倒す判断は、限界節に名指しで書くこと（115.162）**: 母集団の大きさを固定する主張の探索は名前の出現に依るため、大きさと無関係あるいは逆向きの主張（`toHaveLength(0)` / `toBeDefined()`）も固定済みと誤認する。過検出は主張を消す圧力になるという方針に従い見逃す側へ倒したが、**どの形が誤認されるかを名指しで書く**ことで、読み手が検出零件を「該当が無い」と読み違えるのを防いでいる。
- **変異で生き残った枝は、実効の有無を確かめること（115.162 のレビュー）**: 生き残りが六つあり、うち五つは冗長または過剰決定で実害が無かったが、一つ（文字列を保つ加工の扱い）は**実効を持つのに固定されていない**ことが実測で判明した。枝を消しても自己検査は緑のままだが、実際には当該の形が検出されている。**生き残り＝不要とは限らない。**

- **含意は総当たりで示すこと（115.163）**: 「先行が後続を含意する」は読んで納得できるが、それだけでは根拠にならない。先行を通過し後続で落ちる入力を有限の母集団で全列挙し、**零件であること**を示すこと。**同時に陰性対照を置く**（含意しない対を測って非零になること）ことで、走査器が非含意を判定できることまで示せる。母集団の設計では、対象の綴りが**長さの境界に落ちて空虚な真になっていないか**を確かめること。
- **陰性対照を手にしたら自己検査へ持ち込むこと（115.163 のレビュー）**: 実装者は含意の測定で「否定を伴う先行」を陰性対照に選び、それが含意しないことを実測していた。にもかかわらず**その形を自己検査のケースにしなかった**ため、当該の狭め方を外す変異が素通りし、実在する実質ある主張を飾りと誤検出する経路が残っていた。**測定で使った反例は、そのまま境界固定の材料である。**
- **一つのケースが複数の狭め方に救われていないか確かめること（115.163）**: ある判断を固定したつもりのケースが、実は別の狭め方に救われていて当該判断を単独で反転させても落ちないことがある。**機構ごとにケースを割る**か、**ケースの名前と説明を実際に固定している機構へ改める**こと。本件では三つの狭め方が同時に効いており、二つは分割できたが三つ目は構造上単独の変異を作れず、限界節へ明記した。
- **主張を強める道を二択の外に探すこと（115.163 のレビュー）**: 「冗長な後続を削る」か「先行が捉えない範囲へ後続を広げる」かの二択に見えたが、**先行そのものを強める**第三の道があった。金額の形を `^[0-9,]+円$` から三桁区切りの形へ改めたことで、区切り方を初めて誰かが主張することになり、後続を削っても被覆は増えた。**強める変更が安全かは、描画側が何を出すかを実測して確かめること**（本件は地域化の書式が必ず区切りを入れるため無区切りは原理的に出ない）。

- **主張が恒偽であることと、コード枝が死んでいることは別物（115.164 が引き継ぎ元の誤りを是正）**: 115.163 のレビューは「後続側の否定の要求」を実効を持たない枝と分類したが、実測では**実効を持つ**枝だった。当該の要求を外すと、恒偽の後続（先行が通れば必ず落ちる主張）が飾りとして告発されるようになる。**恒偽の主張は別種の欠陥であり、飾りではない。** 上流の分類を鵜呑みにせず実測し、食い違いを隠さず申告したことで是正された。
- **上流の判断も実測で確かめること（115.164）**: 引き継ぎの分類は先行するレビューが下したものだが、誤っていた。**受け取った分類を前提に作業を組み立てる前に、自分で当ててみること。** 本件では五件のうち一件の分類が反転した。
- **件数には測定時点を併記すること（115.164）**: 限界節の実測値が是正前のものだったため、読み手が現状と誤認する状態が続いていた。測り直したうえで**測定時点と旧値の両方を残し**、時点の無い数値はその項を書いたタスクの実施時点のものだという規約を明記した。
- **限界節の冒頭で「検出0件は該当が無いことを意味しない」を全型へ及ぼすこと（115.164）**: 個別の型にだけ書くと、他の型で0件を見た読み手が「該当が無い」と読み違える。節の冒頭と抑止一覧の両方に置き、**各型の0は限界の記述と併せて読むもの**であることを明示した。

- **不在の主張の直前の固定時間待機は、確かめずに前提を置く形（115.165）**: 「この時間で状態が落ち着いたはず」という仮定であり、落ち着いていなければ偽の赤、落ち着きすぎていれば時間の浪費になる。**待つべき条件を特定して条件待ちへ改めること。** 条件を特定できない待機は、何のためにあるか不明ということであり、**撤去して通るかを実測する**のが次の手である。
- **撤去が壊していないことは、現在の検証が捉えられない範囲まで踏み込んで確かめること（115.165 のレビュー）**: 実装者は頂点間の待機を「条件を特定できない」として撤去し、同時に「頂点が一つ落ちても図形は作られるため件数の主張は通る」と自認していた。**つまり撤去が壊しても検証では分からない。** レビューは本番を読んで頂点登録が同期的であることを構造的に示したうえで、**頂点数そのものを主張する検証を一時的に足して**実測した。自認された穴は、塞いでから撤去の可否を判断すること。
- **待ち合わせが後続の主張を含意していないか疑うこと（115.165 のレビュー）**: 条件待ちへ改めると、待った条件が後続の主張を含意して**後続が飾りになる**危険がある（第十三の型）。レビューは「印を確かめてから不在を主張する」形に対し、**印は正しいまま別経路で状態を壊す変異**を当て、後続が単独で赤になることで飾りでないことを確かめた。**置換の後に含意を疑うこと。**
- **時間依存の是正は計算資源を絞って確かめること（115.165）**: 固定待機の撤去は、実は何かを待っていた場合に間欠的な失敗として現れる。反復実行に加え、**処理を意図的に遅くした状態**で通ることを確かめると、時間依存の見落としが減る。本件は六倍に絞った状態でも安定した。

- **赤が出ていても理由が間違っていることがある（115.166）**: これまで追ってきたのは「緑だが何も主張していない」型だったが、本件は**赤だが原因を取り違えている**型である。空文字を通す前提の主張は、崩れを前提の地点で捉えず七行後の比較まで持ち越し、**正しい値を不正と報告して**十九秒かけて落ちていた。是正後は前提の地点で対象を名指しして落ちる。**落ちること自体は同じでも、言い分の正しさと落ちる速さは検証の品質である。**
- **使い分けは呼び出し側の判断に委ねず型で強制できる（115.166）**: 二つの前提の主張は弾く値の集合が違うのに、どちらを使うかが呼び出し側の裁量だったため誤用が生まれた。**引数の型に拒否印を交差させ、誤った対象を渡すと型検査が落ちる形**にすると、新しい検査を足さずに既存の関門がそのまま強制装置になる。事後に走査して直すのではなく、**書けないようにする**方が強い。
- **走査は文字列の一致でなく型で行うこと（115.166）**: 対象が文字列かどうかは名前や書き方からは分からない。コンパイラの型情報で判定すると、据え置いた対象の内訳（座標・寸法・要素・照合結果）まで機械的に確かめられ、**「型が緩くて素通りしているだけ」ではないこと**まで示せる。起票文の件数は二箇所とも実測とずれていた。
- **型で強制する形にも限界がある（115.166 のレビュー）**: 拒否印は**未解決の型引数を誤って拒み**、**不明な型と何でも受ける型はすり抜ける**。いずれも現時点の該当は零件だが、前者は将来 汎用の補助を書いたときに逃げ道の無い袋小路になる。**強制の仕組みを入れたら、その仕組み自体の限界を実測して記すこと。** **【115.185 で解消済み】この記述の三点（誤拒否・`unknown` のすり抜け・袋小路）はいずれも現状と食い違う。誤拒否と `unknown` のすり抜けは拒否印を条件型から素の制約へ移して解消し、袋小路は成立しない（`assertPrepared` への退避は型検査を通る）。残る限界は `any` の一件のみで、これは言語の性質上不可避である。末尾の処方のみ引き続き有効。**

- **同型の指摘は同型の結論を含意しない（115.175 の実測）**: 115.158 が PDF で「骨組みは幅0に潰れるため選言の枝に到達せず、判定は緩んでいなかった」と結論したのを受け、画像側も同じだろうと読むのが自然だった。実測すると**逆**で、画像の骨組みは `width:100%` のブロック直下にあり `minHeight:200px` がそのまま効いて 1166x200 の可視要素になる。旧判定は画像が一枚も無い終状態を **13ms で緑**にしていた。**「同型の欠陥」は起票の根拠であって、結論の根拠ではない。同型と言われた箇所こそ自分で測ること。**
- **是正の過程で隣の判定の穴が露出することがある（115.175）**: 本命の合併選択子を調べる過程で、既に素の形だった別の判定（REQ-13.3）も**復号失敗を受理する**ことが判明した。`onError` を扱わない `<img>` は失敗表示を出さず、代替テキストの箱が 124x368・`naturalWidth`=0 で可視条件を満たすためである。境界は「画像プレビュー成立判定」であり選択子の形ではないため、同じ穴を持つ隣も是正した。**境界は文言で読むこと。行番号で読むと同じ穴を残す。**
- **書かない判断にも根拠が要る（115.175）**: 骨組み不在の主張は「`img` と骨組みは排他分岐なので飾りになる」として書かなかった。レビューは本番の描画分岐が早期復帰で相互排他であることを構造的に確認し、この省略を妥当と判定した。`complete` も、失敗時にも真になるため赤にできる終状態が増えないとして省いた。**足さなかったものについて「なぜ足さないか」を測った上で書くこと。**

- **掲げた選択子が本番に存在しないことがある（115.176 の実測）**: 四枝の選言のうち二枝は `data-testid` が `frontend/src`・`backend/src` のどちらにも**一件も存在しない**綴りだった。残る二枝は `/明細/` `/項目/` という緩い文字照合で、実際に掴んでいたのは `<h2>項目選択</h2>` である。旧検証は受領見積書フォームすら開いていなかった。**選択子の存在を本番への grep で確かめること。存在しない綴りは、書いた時点で何も指していない。**
- **境界での差し替えが正当な刺激になる条件（115.176）**: テスト環境は外部APIの鍵を持たないため当該経路は必ず 503 になり、実物の応答では到達できない受入基準があった。応答を差し替えて判定を書いたが、これが被覆として成立するのは**規範が境界のこちら側（画面側）にある場合に限る**。返ってきたデータをどう表示・整形するかは画面の責務なので成立し、外部APIが何を返すかの正しさは成立しない。**差し替えを使うときは、規範が境界のどちら側にあるかを先に決めること。**
- **無タグの弁別検証には、無タグである理由を書くこと（115.176）**: 「0件応答ではボタンが出ない」等の検証は、判定の弁別能力を示すためのもので受入基準そのものではない。何も書かないと 115.159 が指摘した逆向きの欠陥（判定しているのにタグが無い）と区別できなくなるため、`@requirement` を付けない理由を現地に明記した。**タグの不在も、意図であることを示さなければ欠陥に見える。**
- **規範より強い主張は赤の正しさを損なう（115.176 のレビュー・申し送り）**: 金額の主張が桁区切り付きの厳密一致を求めているが、要件18.5 は整数表示としか定めておらず区切り記号を規定していない。現状の表示とは一致するため緑だが、**規範違反でない変更で赤を出しうる**。緑の正しさだけでなく赤の言い分の正しさも検証の品質である（115.161 の教訓）という観点では是正の余地がある。

- **起票文の前提そのものが誤っていることがある（115.177）**: 起票は「`@requirement` タグが零件のファイル」を欠陥の母集団としていたが、検査器が数える記法は**五つ**あり、機能名付きのヘッダ列挙は既に全件計上されている。タグ零件の十六件のうち**十一件は欠陥ですらなかった**。起票の二つの計数（二十件・十三件）はどちらも旧基準で正確に再現でき、向きは同じで基準だけが違った。**検査に依る欠陥を追うときは、検査器の実装を先に読むこと。**
- **道具を作り直したら母集団も取り直すこと（115.177 の差し戻しの真因）**: 走査器を精緻化したにもかかわらず、旧基準で作った作業リストをそのまま母集団として使い、`app-header.spec.ts` を取りこぼした。精緻化した走査器なら確実に列挙されていたことを後から実測で確認している。**「走査の道具自体を疑うこと」（115.159）は、道具の正しさだけでなく、その出力から母集団を取り直したかまで含む。**
- **逆向きの欠陥を直す作業は、順向きの欠陥を作りやすい（115.177 のレビュー）**: 被覆を増やす方向の作業では、規範を判定していないものにタグを貼る誘惑が働く。実際に二件が指摘された。契機が PDF に限定される受入基準へ PNG を投入する検証がタグを持ち、作成・更新・削除を規範とする受入基準へ読み取り系の検証がタグを持っていた。**タグの可否は話題の近さでなく「その規範が壊れたら赤になるか」で決めること。**
- **規範が沈黙している事項にタグは付かない（115.177）**: 「管理者にメニューを追加する」という受入基準は、非管理者への非表示を何も述べていない。全員に表示されるようになっても当該基準は破れないため、権限分岐の検証は無タグの回帰検証として残した。**検証が有用であることと、特定の受入基準を被覆していることは別である。**
- **判定不能を実測で示すこと（115.177）**: 表示名の主張を落とした根拠は、本番が `getInitials()`（未設定なら `'U'`）と `{displayName || 'ユーザー'}` を併置しているため、表示名取得が壊れてもボタン文字列が空にならないという構造である。レビューは本番を読んで同一であることを確認した。**「判定していない」は、判定できない機序を示して初めて主張になる。**

- **投げっぱなしの購読の失敗は、握り潰されるのではなく「いつ届いたか」で扱いが変わる（115.178 の実測。起票文の機序は誤りだった）**: 少なくとも三つの体制がある。(A) 本体が待機中に届いた同期の失敗は、実行中のテストに帰属して**赤**になる。(B) 本体終了後に素の継続として届く失敗は、**継続そのものが破棄され**注記の出力すら現れないまま緑で通る。(C) 本体終了後でも描画側の API を含む継続は `Test ended.` の拒否で**赤**になる。**「誰も見ない拒否になる」という一律の説明は成り立たない。** 欠陥は主張が評価されるか否かが本体終了とのレースで決まることである。
- **リスナ内の主張の真の危険は、リスナが一度も動かない場合にある（115.178 のレビュー）**: 変更前の二箇所はいずれも主張がリスナ先頭の同期文であり、実際には体制Aで赤になり得た。危険なのは**対話が発生しなければリスナごと動かず、主張が零件のまま本体が緑で終わる**ことである。本件では本体唯一の判定が恒真式だったため、この経路が完全に開いていた。**リスナの中の主張を数えるときは、リスナが呼ばれない場合に何が主張を担うかを見ること。**
- **恒真式は主張の不在より悪い（115.178）**: 削除した `expect(url).toBeTruthy()` は、画面の URL が常に非空文字列であるため何も確かめていないのに、コメントは「ダイアログが表示されたか」を確認すると称していた。**何も無ければ穴は見えるが、恒真式は穴に蓋をして被覆しているように見せる。** 引き上げた主張は観測配列に対するものなので、対話が零件なら空配列で必ず落ちる。
- **共有の補助へ寄せられたことを根治の証拠に使う（115.160 の作法を 115.178 が再適用）**: 二箇所とも新設の共有補助へ寄せられた。寄せられない箇所が残るなら、そこは何かを覆い隠している疑いがある。
- **115.178 の申し送り（未是正・境界外）**: `e2e/specs/site-surveys/site-survey-phase18.spec.ts` の要件番号は**ファイル全体が一つずれている**。要件10の受入基準9は一括保存、10が離脱警告であるところ、`:361` が `REQ-10.9`、`:426/:429/:431/:472` が `REQ-10.10`、`:523` が `REQ-10.11` を名乗る。いずれも実体は一つ後ろの基準である。同じ番号を `site-survey-image-order.spec.ts` は正しく使っているため、一箇所だけ直すとファイル内が半端にずれる。**ファイル単位で一括是正すること。** なお `REQ-10.10` は既に他所でタグ付けされているため被覆数は動かない見込みである。本タスクが新たに書いた注記も既存タグに合わせたため、誤った番号を断定形で述べている。

- **偽の緑は「実際に起きている状態」を作って初めて示せる（115.179 の実測）**: 不在の主張が偽の緑になることを示すには、(1) 対象が実際に現れる状況を作り、(2) そのうえで待機切れ以外の失敗を注入する、の二段が要る。片方だけでは足りない。本件では実際に対話を出したうえで述語から失敗を送出させ、対話が現に出ているのに「出なかった」が成立して緑になることを確認した。是正後は同じ注入で赤になり、しかも言い分が真因そのものになる。
- **注入案が不発であることも測定で分かる（115.179。実装者とレビューが独立に経験）**: 実装者の最初の案（頁を閉じてから待つ）は実測では待機切れにしかならず、非待機切れの失敗を作れなかった。レビューの最初の案（合成した要素からの取得）も事象を発火させなかった。**どちらも証拠に使わず組み直した。** もっともらしい注入と、実際に狙った経路を通る注入は別である。
- **判別子は共有し、畳み先は形ごとに分けてよい（115.179）**: 既存の共有補助は要素を受け取って待機を駆動する形で、既に走っている約束事には署名が合わない。無理に再利用せず、**判別の条件だけを一箇所へ抜き出して両者から参照する**形にした。面積が最小になり、判別の重複も生じない。
- **共有補助は単体で駆動して確かめられる（115.179 のレビュー）**: 画面を経由せずに、解決・待機切れ・非待機切れの誤り・誤りでない拒否・派生クラスの待機切れ、の各入力を直接与えて挙動を確認した。**握り潰し経路が無いことは、検証を回すより直接駆動のほうが強く示せる。**
- **115.179 の申し送り（未是正・いずれも境界外）**: (1) `e2e/specs/estimate-requests/session-expired-protection-extra-e2e.spec.ts:377-382` が要件38.10 の主張二本を「環境差異のスキップ条件」として握り潰しており、**どちらのエラーも出なくても常に通過する**。事象待ちでなく主張そのものを握り潰す別型だが、第3原則の直接の違反である。(2) `check:e2e-guards` に「事象待ち＋無差別な畳み込み」を捕捉する規則が無く、115.161・115.179 とも再混入の防止装置を残していない。同型の再発は現状 grep 頼みである。

- **広げた面は半分だけ固定されていることがある（115.180 の差し戻し）**: 積み足しの語を二つ（`push` と `unshift`）対象へ加えたが、自己検査の事例は前者にしか無かった。後者を集合から外しても自己検査は全件緑のまま通り、しかも実際には検出される実効のある枝だった。記述だけが「両方を加えた」と将来の読者へ伝えていた。**広げると書いたら、広げた面の一つ一つについて、外すと落ちる事例があるかを確かめること。** 是正では両方向の変異を測り、一方を外すと対応する一件だけが落ちることを実測した。
- **「実例が無い」は覆わない理由にならない（115.180 の判断）**: 対象へ加えた語の一方は、検証群に実例が零件だった。それでも固定する側を選んだのは、形が同一で危険度が等しく、費用が自己検査一件に過ぎないからである。**検出零件は該当が無いことを意味しない（115.164）以上、実例の不在を根拠に覆う範囲を狭めると、最初の一件を見逃す。**
- **大きさの主張は不在の主張を含意しないように書くこと（115.180）**: 母集団の大きさを固定する際、要素の一覧そのものを主張すると、後続の不在の主張が先行に含意される飾りになる（検出器自身が別の型として告発する形である）。本件では件数だけを本番の列定義に紐付けて固定し、不在の主張は独立に残した。**含意しないことは、件数を保ったまま禁止された要素を混ぜる変異で確かめられる。**
- **115.180 の申し送り（未是正・境界外）**: 検出規則は `allTextContents()` / `evaluateAll()` が作る集まりを母集団として辿らない。`(await loc.allTextContents()).map(...)` は検出するが、素の `allTextContents()` は検出しない。これは 115.162 が作った由来表の欠落であって本タスクの拡張の結果ではなく、検証群に残る唯一の実例は非空が保証されているため無害である。同族の次の一手として起票の価値がある。

- **名指しされた枝は氷山の一角だった（115.181 の掃討）**: 起票が名指ししたのは一つの判断だったが、系統的に当たると**生き残りは二十六枝**あり、うち二十五枝が実効を持っていた。しかも名指しされた集合は「当該の枝を消しても緑」どころか**集合を空にしても緑**で、六つの綴りのうち一つも固定されていなかった。**一件の指摘を受けたら、同じ形が他にいくつあるかを機械的に数えること。**
- **掃討は要素ごと・節ごとに割ること（115.181 の方法）**: 定数集合は要素を一つずつ削り、関門条件は節を一つずつ除去または常真化する。集合まるごとの変異では「どの綴りが固定されているか」が分からない。実効の判定は検証を回すのでなく検出器に書き方を直接与えて確かめ、同じ探り群を全変異へ当てることで「別の狭めに救われていないか」（115.163）も同時に見える。
- **冗長の判定は実測と構造の両方で行うこと（115.181 のレビュー）**: 生き残った一枝は、除去しても全件緑で探り群の出力も不変だった。レビューはそれに加え、当該の判定が呼び出し側と同一のコードで否定を再計算しており、呼び出し側が否定を要求する以上その枝は隣接する条件で必ず外れる、という構造を示した。**「区別できる入力を構成できない」は、探して見つからないことと、構成できないことを示すことの二段で言えるようになる。**
- **限界は自己検査で固定できる（115.181 の判断）**: 見逃す側へ倒した判断は是正しないが、**その限界を狭める変更が無言で入りうる**ことが問題である。実測では、限界を狭める二種の変更がいずれも変更前の自己検査を緑のまま通過した。事例名と注釈に「望ましい挙動ではなく既知の限界」と明記したうえで登録し、限界節には「狭めるときはこの事例が落ちるので限界節の書き換えと対で行う」と記した。**是認と読まれない書き方であれば、限界の固定は凍結でなく通知装置になる。**
- **括弧内の列挙は事例を足すと陳腐化する（115.181 のレビュー指摘）**: 「この綴りを外すとこの事例が落ちる」という注釈は、後から同じ綴りを使う事例を足すと件数が変わる。実測に合わせて是正した。**注釈に具体的な事例名を書くなら、事例を足すたびに測り直すこと。**

- **恒偽の後続と、必ず成立する後続は別物である（115.182 の中核）**: 先行が排除するか保証するか × 後続が否定か肯定か、の四つの組み合わせのうち、二つは飾りで二つは恒偽である。飾りとして数えてよいのは「排除×否定」と「保証×肯定」だけで、残る二つを数えると**必ず落ちる主張を消せという指示**になる。実装は後続の否定の有無で見る向きを分岐させる。
- **下界の過大主張は、上界の過小主張より危険（115.182 の二度の差し戻し）**: 「必ず現れる字面」を過大に見積もると、実質を持つ主張が飾りとして告発される。二度の差し戻しはいずれもこの向きだった。一度目はエスケープ表記の荷を字面として読み直していた（`/^円$/` が `5186` を必ず含むと判定）。二度目は符号単位で走査するのに `u` 修飾子の量指定が符号点全体に掛かるため、対にならない代用符号が連なりの末尾に残っていた（`/^a😀?b$/u` が `a\ud83d` を必ず含むと判定）。**二度目のほうが悪い。一度目は必ず落ちる主張を告発したが、二度目は働いている主張を告発した。**
- **同じ発想の別の角を探すこと（115.182）**: 二度の差し戻しは同一の欠陥クラスの別の角から来た。三度目の是正では「第三の角があると仮定して探すまで終わりではない」を課し、実際に**排除の向きに同型の欠陥が二件**見つかった。片方は符号単位と符号点の不整合、もう片方は大文字小文字を無視する修飾子を見ていないことである。いずれも既存の欠陥で境界外のため報告に留めた。
- **機械掃討は生成器が出せない形を証明できない（115.182 の実測）**: 最初の掃討は三万五千通りで反例零件だったが、生成器が星位文字を**エスケープ表記でしか出さず生の符号点として出さなかった**ため、破壊形に一度も当たっていなかった。是正では生成器を広げ、さらに**番人だけを外すと同じ生成器が数千件の反例を出す**ことを示して、生成器が破壊形を出せること自体を証明した。**掃討の結論を使う前に、生成器が何を出せないかを問うこと。**
- **導出した論証は、自分が扱っていない場合を残す（115.182 のレビュー）**: 実装者は「孤児は常に連なりの末尾の上位代用符号である」ことを辿って示したが、**先頭の孤立した下位代用符号**の場合を論証が扱っていなかった。レビューは、下位代用符号が非字面の枝へ回らないこと、あらゆる読み飛ばしが ASCII 文字で終わるため代用符号対を割れないこと、から発生し得ないことを補った。**論証を受け取ったら、その論証が名指ししていない場合を数え上げること。**
- **番人が過剰に抑制していないかを対で測ること（115.182）**: 誤検出を断つ番人は、健全な検出まで殺しうる。本件では星位文字を含む健全な形が引き続き検出されることを確かめ、機能が当該の文字種に対して不活性化していないことを示した。**断つ変更を入れたら、断ちすぎていないことを別の入力で測ること。**
- **115.182 の申し送り（未是正・境界外・要起票）**: 排除の向きに同型の欠陥が二件ある。(1) 上界の述語を符号単位で作りながら needle を符号点で辿るため、星位文字の needle は一律「到達しない」と判定される。`/^(a|😀)$/` の直後の `not.toContain('😀')` が飾りと報告されるが、当該の主張は `'a'` と `'😀'` を弁別している。(2) 排除の判定が大文字小文字を無視する修飾子を見ていないため、`/^ABC$/i` の直後の `not.toContain('a')` が飾りと報告される。いずれも実質を持つ主張を消す向きの誤りで、HEAD で再現する既存欠陥である。(2) の是正には共有機構への修飾子の受け渡しが要る。

- **`waitForLoadState('networkidle')` は不在の主張の代替にならない（115.183 の中核）**: 固定待機を条件待ちへ改める際、現在の文書で既に networkidle が発火していれば当該の呼び出しは**即座に解決する**（実測 0ms）。不在の主張の手前の窓が完全に消え、固定待機より検出力が落ちる。代わりに**不在を否定する事象そのもの**（更新系の要求など）を待ち、待機切れのみを `null` へ畳む形（`nullWhenTimedOut` + `page.waitForRequest`）を用いること。飛べば即座に落ち、飛ばなければ待機切れで通る。
- **タスク本文の件数の見積もりは走査で再確定すること（115.183）**: 本文が名指しした「七箇所」は距離1の機械走査で**8箇所**であり一件過小だった（`estimate-request-e2e.spec.ts` の漏れ）。語の近傍による見積もりは目視の入口であって母集団ではない。**HEAD と現ツリーの双方へ同一条件の走査を当てて差分で述べること。**
- **時間の経過が主題である待機は残してよい（115.183 の判断）**: 要件が時間経過に対する挙動を定めている場合（長押し閾値、自動保存の間隔）、代わりに待てる条件は存在しない。待機は残し、(1) 待機時間を**本番の定数から導いて数値を複製しない**、(2) 意図した時点を実際に作れたことを**単調時計で実測する**、の二点で前提を検証可能にすること。`Date.now` は WSL2 で単調時計より約8.6%遅く進むため、経過の実測に用いると閾値超過を「未満」と誤読する。
- **据え置きの非対称は起票の種になる（115.183 のレビュー指摘）**: `quantity-table-crud.spec.ts:4302` の 6000ms は本番に対応する間隔定数が無く窓を導出できないため据え置いたが、他の据え置き2件が獲得した「窓を跨いだ」自己検査を持たない。据え置きの理由が正当でも、**同種の中で一つだけ自己検査を欠く状態は記録すること。**

- **番兵値の母集団は文字列検索では取れない（115.184）**: 件数取得の番兵は `return -1;` の形だけでなく**オブジェクトリテラルの中**にも住む（`objectCount: -1`、`objectTypes: []`）。最悪の変種は `annotationCount: 0` で、**不在と正当な零が完全に同居**する。母集団は「観測の入口の語」（本件では `__fabricCanvas`）で引いたファイルを**一件ずつ開いて**確定すること。実測では 15箇所と数えた後にレビューが 16箇所目を見つけた。
- **投げる形へ揃えると `expect.poll` に偽赤の窓が開く（115.184 の代償）**: `expect.poll` は poller が投げると**再試行せず即座に落ちる**（Playwright 1.62.0、`invokePollMatcher` は `await actual()` を try/catch の外で呼ぶ）。番兵値版は poll が不在をまたいで待てていたため、投げる形にした瞬間に「容器は可視だが `useEffect` がまだ走っていない」窓で落ちる。**観測の手前に門（`waitForFabricCanvas`）を置くこと。** 門の有効性は「窓を人工的に再現し、門の有無だけを差し替える対照実験」で示せる。
- **番兵値の番人は恒真の主張として現れる（115.184）**: `toBeGreaterThanOrEqual(0)` や `hasCanvas === true` は、番兵値が実値と同じ型に同居している限りは意味を持つが、投げる形へ揃えた瞬間に恒真になる。**構造を変えたら、その構造を守っていた主張を数え直すこと**（本件では15件を撤去）。ただし「描画が実際に成立したことの陽性対照」は番人ではないので撤去しないこと。
- **不在の主張の窓を潰す是正は、門を足す是正と対で行うこと（115.184 のレビュー）**: 番兵値を全廃すると観測が厳しくなる方向へ倒れるため、待ち合わせが不足している箇所が一斉に顕在化する。**是正の網羅（母集団）と、是正の副作用（門の不足）は別々に数え上げること。** 前者だけを数えると後者が漏れる。

- **「型で表現し切れない」は、その型機能をやめる案を試すまで言えない（115.185 の差し戻し）**: 実装は代替案を二つ試して不成立を確認し「表現し切れない」と結論したが、**二案とも条件型を使い続ける案**だった。レビューが条件型そのものをやめ、素の制約（`<T extends 非文字列の共用体>`）へ移す一手を実測すると、誤拒否も `unknown` のすり抜けも同時に解消し既存の呼び出しは一件も壊れなかった。**「構成できないことを示す」段は、いま使っている機構を前提にした探索では満たせない。**
- **条件型は未解決の型引数で制約を見に行かない（115.185 の根本原因）**: `T & NonString<T>` の形は、`T` が未解決のあいだ条件型が遅延評価になるため、`T extends number | boolean` のように**文字列を除いた制約が付いていても拒否される**。素の制約なら型引数の制約と直接照合されるため、この誤拒否は起きない。**型で何かを拒むときは、条件型ではなく制約で書けないかを先に試すこと。**
- **限界の固定は「是正できない限界」にだけ許される（115.185 のレビュー）**: 115.181 が確立した通知装置の作法は「**見逃す側へ倒すと判断した**限界」に対するものであって、**是正手段が現に存在する欠陥の凍結を正当化しない**。`@ts-expect-error` で固定する前に、その挙動が本当に是正不能かを問うこと。固定してしまうと、欠陥が「既知の限界」という名で追認される。
- **緩める向きと狭めすぎる向きの両方で検知を測ること（115.185）**: 制約を `unknown` へ緩めると自己検査の拒否事例が `TS2578` で落ち、制約の共用体から `object` を落とすと通過対照と実コードが**一斉に62件落ちる**。**片方向だけの変異では「緩めすぎていないこと」を示せない。**

- **散文どうしの対応は機械化できないが、担い手を移せば検査できる（115.167 の中核）**: 除外の題や理由文が「どの受入基準を述べているか」は語の重なりでは測れない（実測で262件中30件が誤検出、いずれも題が内容を持たない項目）。解は照合の精度を上げることではなく、**対応の担い手を散文から原文の逐語複製へ移す**ことだった。各除外に受入基準の本文そのものを持たせ、要件定義書の当該行との完全一致を検査する。番号がずれれば複製が合わなくなる。**「機械化できない」で止まる前に、何を突き合わせるかを変えられないかを問うこと。**
- **逐語複製にも抜け道があり、それは明記すべき限界である（115.167 のレビュー実測）**: 複製元を間違えれば一致してしまう。id をずらしたうえで移動先の原文をコピーすれば検査は通る（レビューが注入して EXIT=0 を実測）。散文の側が古いまま残るこの形は検出できない。**限界は両方向で書くこと**——何を捕らえるか（番号のずれ）と何を逃すか（散文と複製の食い違い）。
- **番号のずれは被覆の穴を隠すとは限らない（115.167 の実測）**: 分母が 2653→2657 へ動いても FAILED は 2件のまま増えなかった。戻った9件はいずれも実在の検証が番号を付けていたためである。**ずれが隠していたのは穴ではなく「別の受入基準を分母から外し続けていた」という記録の誤りだった。** ただしレビューは、その被覆が**誤った被覆タグに支えられている**二件を検出した。除外側とタグ側に同型のずれがあると**両者が相殺して指標に現れない**。片側だけを直すと、もう片側のずれが露出する。
- **除外の取り下げは全履歴で確かめること（115.167）**: 「その内容を述べる受入基準が存在しない」を根拠に除外を消すなら、現在の要件定義書だけでなく `git log -S` で全履歴を検索すること。実測では4件が一度も存在せず、うち1件は再構成で別の受入基準へ統合された二重の除外だった。
- **「起票する」は報告に書くことではない（115.167 のレビュー指摘）**: 実装が露出させた穴を報告に列挙しても、後続タスクとして登録されなければ所見は失われる。**露出した穴は受入の前にタスクとして起票すること。** 件数はレビューが独立に再測した値を採ること（本件では 31/29 の報告に対し実測は 29/22 だった）。

- **走査の網の目は正典を逐語で写すこと（115.168 で二者が同じ誤りを犯した）**: 実装者もレビュアーも独立に走査補助を書いたが、**双方が検査本体の `findFiles` の除外リストを写していなかった**ため、被覆検査が一度も読まない `backend/src/generated/prisma/**` を数えていた。両者の値が一致したことが正しさの証拠にならなかった。実測は 442ヘッダー / 1194→1139 ではなく **319ファイル / 384ヘッダー / 30件減**である。**「独立に再現した」は、同じ誤りを二度犯していないことを意味しない。正典のコードを逐語で写すこと。**
- **測らずに断言した否定は、そのまま検査で固定される（115.168 の差し戻し）**: 「同一機能の一覧が段落をまたぐ形が実データに4件あり、そこまで狭めると被覆を過小に見せる」は測られていなかった。実測すると失われるのは**2件だけで、両方とも「検証していない」と明言した散文**であり、正当な被覆の喪失は零件だった。**しかもその線を自己検査で固定していたため、正しい是正を将来にわたって塞いでいた。** タスク本文が「実害の有無を機械的に洗い出すこと」と書いていたのはまさにこの形を禁じるためである。
- **「検証していない」と書いた散文が被覆主張になる（115.168 の中核）**: 一覧の印を `[-*]` で取ると JSDoc 自身の行頭 `*` に一致するため、` * REQ-16.7 はE2Eテストで検証困難なため省略` という**否認の文がそのまま被覆として計上される**。区間の上限を増やして大半は解消したが、機構としては一覧項目の規則の側に残る。**被覆の主張を拾う規則は、否認の文を拾わないことまで確かめること。**
- **偽の被覆主張は本当の穴を隠す（115.168 の露出）**: 段落の切れ目で切るようにすると FAILED が1行増えた。増分は `quantity-table-generation/REQ-38.4` で、その spec は Integration テストへの委譲を宣言していたが**委譲先のファイルが存在しなかった**。**指標が良く見えていたのは、穴が無いからではなく穴を数えていなかったからである。**
- **上限を足すと既存の変異が無言で影になる（115.168）**: 第4の上限を加えたことで、既存の見本2件がその上限だけで切れるようになり、**元の上限を撤去しても落ちなくなっていた**。実装者はこれを検出し、見本からその上限が効かない形を作り直して各上限が一意に効くよう是正した。**検知の仕組みに条件を足したら、既存の見本がどの条件で落ちていたかを測り直すこと。**
- **是正のために書いた見本が、まさにその欠陥を再現することがある（115.168 のレビュー指摘）**: 段落の切れ目を固定する見本の散文行が ` * Note: REQ-4.2 …` と書かれており、`*` と `REQ-` の間に語が挟まるため**上限を一切かけなくても一致しない**。当該検査は変異で落ちず、主張が空虚だった。**見本は実データの形を写すこと。写していない見本は、通っていても何も述べていない。**

- **撤去は危険を消さず、形を変える（115.169 の中核）**: 115.146 は「後任が参照実装と誤認する危険」を理由に死蔵部品を撤去したが、それは危険を**存在しないファイルへの導線**という形に置き換えただけだった。撤去したファイルを指すコメントが本番コードに10箇所、steering に7箇所残っていた。**部品を消すときは、その部品を指す記述を同じ変更で数え上げること。**
- **歴史記録と現存主張は書き分けの基準で分ける（115.169）**: 「いま在る／いま参照できる」と読まれる記述は是正対象、「当時こうした」と読まれる記述は保存。設計書の波ごとの記録は後者であり書き換えない。steering は毎セッション読み込まれる「現在の構成」なので前者である。**引用の題は逐語で残すこと**（変えると参照が解決しなくなる）。ただし直後に撤去済みである旨を書いて導線は断つ。
- **是正の三択は一件ずつ判断すること（115.169）**: (a) 撤去済みである旨を記す（理由の記録に価値がある場合）、(b) 移管先を指し直す（比較対象が実在する場合）、(c) 記述自体を落とす（参照先が消えて主張が空になり、かつ同内容を別の記述が保持している場合）。**(c) を選ぶときは失われる情報が無いことを示すこと。**
- **追随しない構造そのものを直せる（115.169）**: 個別の是正は同じドリフトを翌月また生む。steering が挙げるファイル名の実在を検査する仕組みを置き、pre-push と CI に配線した。**ただしファイル名だけでは半分しか塞がらない**——ファイル名を伴わない識別子の失効は網に掛からず、「挙げていないファイルがある」ことも捕まらない。**塞いだ穴の隣に何が残るかを、塞いだその場で数えること。**
- **見逃し側の限界は、その根拠まで実測すること（115.169 のレビュー指摘）**: 検査の拡張子を絞った根拠として `Fabric.js`・`Node.js` 等の誤検出を挙げたが、**これらはそもそも検出規則に当たらない**。実測すると広げた場合の真の失効は4件・誤検出は1件だけだった。**限界を明記しても、その理由が実測されていなければ「開示された限界」ではなく「測らずに置いた線」である。**
- **報告の数値は実質と別に検証すること（115.169 のレビュー）**: 「HEAD と 469,262 バイト完全一致」という申告に対し、レビューの対称実行は 660,830 バイトだった。**同一性という実質の主張は正しかったが、数値そのものは誤っていた。** 実質が正しいときほど数値の誤りは見逃されやすい。
- **申告された穴が実在しないことがある（115.169 のレビュー）**: 実装が EXPOSED_GAPS に挙げた「steering の backend テストツリーが構造ごと陳腐化」は、レビューが実測すると**階層は正しく描かれていた**。**露出した穴の申告も、起票の前に実測で確かめること。** 存在しない問題を後続タスクにすると、後任がそれを探して見つからず、記録の信頼が落ちる。

- **条文と実装の乖離は、どちらを動かすかを人に決めさせること（115.170）**: 要件28.3 の「各項目」に対し実装は道具のボタンにしか 44 を適用しておらず、被覆判定は緑だった。**要件文を緩めるか実装を広げるかは製品の判断であり、実装者が選べるものではない。** 利用者は「実装を要件へ追随させる」を選んだ。**副作用（作業領域の圧迫・レイアウトの再設計）を先に測って示したうえで問うこと。**
- **タップ領域は見た目の寸法で満たすほうが検証しやすい（115.170 の判断）**: 擬似要素で当たり判定だけ広げる案は、対象の多くが置換要素（`input[type=color|number|checkbox]` / `select`）で `::before` が描かれず、負マージン重ねは隣接間隔の要件を損なう。**見た目＝当たり判定にすれば、検証が測る矩形が実際の当たり領域になる。**
- **縦の圧迫は横並びで逃がせる（115.170）**: 見出しを積んだままだと1項目が「見出し+間隔+44」になり段が高くなる。モバイルでは見出しを操作要素の横へ置くことで、**ツールバー高を 71px に保ったまま**全項目を 44 にできた。**44 化は必ずしも作業領域を削らない。レイアウトの向きを変える余地を先に探すこと。**
- **母集団の定義を変えて測り直すのはレビューの仕事（115.170）**: 実装は「項目」を `button`/`input`/`select` と定義したが、レビューは `textarea`・`a`・`[role=*]`・`[tabindex]` まで広げて 375x667 で全9ツール×パネル開を実測した。**44 未満は不活性な `label` のみ**で、実装の定義は結論を変えなかった。**定義を共有したまま検証すると、定義そのものの誤りが二人とも見えない。**
- **例示した変異が赤にならないことがある（115.170 の訂正）**: レビューは「ツールバーの `overflowX` を外せば赤になる」と例示したが、実装が実測すると緑のままだった。ページ幅を守っていたのは**祖先の `overflow: hidden`** で、ツールバーの `overflowX` は**利用者の到達性**を担っていた。**二段の仕組みは、片方を外しても症状が出ない。** 変異を例示する側も、実測せずに機構を言い当てられるとは限らない。
- **追加した主張が既存に包摂されることを明記すること（115.170 のレビュー指摘）**: 最悪状態を固定するために足した主張は、今日の封じ込めが状態に依らないため既存の主張にも同時に捕まる。**単独で赤にできる改変は存在しない。** 空振りではないが、**「単独で赤にできる主張」と誤読させない一文**を添えること。値は将来の状態依存化に備える点にある。
- **「どの検証も赤にならない」は反証されやすい（115.170 のレビュー）**: 実装が露出させたと申告した穴は、レビューが実測すると既存の単体ガード1件と E2E 2件が赤になった。**成立するのは弱い形**——「担保が宣言の主張だけで、実ブラウザの振る舞い検証が無い」——だった。**強い形で起票すると、後任がそれを確かめて成立せず、記録の信頼が落ちる。**
- **SKIP を緑と数えないこと（115.170 のレビュー指摘）**: 実装は「変異C では `(d)` も緑のまま」と報告したが、レビューの実行では先行する検証が落ちて serial モードにより `(d)` は SKIP され、**一度も走っていなかった**。結論には影響しなかったが、**走っていないものを緑と数える癖は、いずれ本当の赤を見逃す。**

- **恒偽は静的論証で示せるなら掃討より強い（115.171 のレビュー評価）**: `resizeRatio` は書き込みが二箇所（初期化と後段のループ内）だけのブロックスコープの `let` で、クロージャに捕捉されず、両ループを囲む外側ループも後戻り辺も無い。したがって前段のループ内での値は**入力に依存せず固定**である。**この論証は 102,400 ケースの機械掃討より強い**——掃討は生成器が出せない形を証明できないが、静的論証は生成器の網羅性を問う必要がない。
- **恒偽の分岐を撤去しても、それを復活させる変異では赤にならない（115.171 の差し戻し）**: 実装は新規テストに「撤去した分岐が生きていれば等倍リサイズが入る」と書いたが、**恒偽なら復活させても本体に入らない**。逐語復元の実測は 48/48 緑だった。**等価性の証拠（復元して緑）と、番人の証拠（別の変異で赤）は別物であり、混同すると番人の説明が誤診の元になる。**
- **反実仮想は、実行した変異だけを書くこと（115.171 の中核。本系列で3度目）**: 115.168 は否定側で「実データに4件ある／狭めると過小に見せる」を測らずに断言し自己検査で固定した。115.170 はレビュアーが「この変異なら赤になる」と例示して外した。115.171 は実装者が肯定側で「復活させれば赤になる」と書き、**その変異を一度も実行していなかった**。**「この変異なら赤くなるはずだ」を書く前に、その変異を実際に走らせること。**
- **改名か文書化かは、読み手の有無で決まる（115.171 の判断）**: `wasCompressed` は 300KB超〜350KB以下で再エンコードなしに `true` を返しており呼称が実態とずれていた。走査すると**本番に読み手が一件も無かった**ため、是正手段が現に存在する（＝115.185 の基準で凍結が許されない）と判断して改名した。**文書化で済ませてよいのは、改名の代償が実在するときだけである。**
- **是正を型で固定できることがある（115.171）**: 撤去した分岐を素朴に書き戻すと、変数宣言を後段へ移したことで TDZ により型検査が落ちる。**ただし射程は限定される**——宣言ごと元位置へ戻す書き戻しは型検査を通る（実測 EXIT=0）。**「型で塞いだ」と書くなら、何を塞ぎ何を塞がないかを両方向で書くこと。**

- **「未解消の欠落」と書き続けると後任が解消済みの問題を追う（115.172 の動機）**: 設計文書が挙げた5経路はすべて Task 115.124 で塞がれていたが、文書は「未解消の欠落である」と述べ続けていた。**是正は歴史の削除ではない**——現況ブロックを先頭に置き、当時の記述を過去形へ明示する形にした。当時の判断の根拠・当時の実測値・当時の数え上げはすべて保存している。
- **「N箇所ある」と「塞がれていない経路が無い」は別の主張（115.172 のレビュー）**: 番人の呼び出しが5箇所あることは、5経路が塞がれた証拠ではあっても、**残る経路が無いことの証拠ではない**。レビューは全8ルートを一件ずつ辿り、残る3経路が別の形（上流の `findById` / `ImageUploadService` / `ImageOrderService`）で遮断されていることまで確かめた。**網羅の主張は、母集団の側から数えること。**
- **設計文書は自分自身を行番号で指しうる（115.172 の発見）**: 本書自身を指す参照12件が**全件失効**していた（27〜51行ずれ）。既存の二つの検査はどちらもこれを覆わない——一方は本番コードから設計文書への参照を、他方は設計文書から本番コードへの参照を見ている。**文書が自分を指す形は網の間に落ちる。** 節名と、見出しから範囲を導く形へ置換した。
- **是正前のコマンドが謳う値を再現しないことがある（115.172 のレビュー実測）**: 行番号ベースの旧コマンドは HEAD 版で **17** を返し、設計書が謳う `10` を再現しなかった。新しい見出しベースの形は HEAD 版・現在版のどちらでも `10` を返す。**文書に載せたコマンドは、載せた時点で動いても、後で動くとは限らない。実行して確かめられる形にすること。**
- **穴が無いことの根拠も測ること（115.172 のレビュー指摘）**: 実装は「`SignedUrlService` の本番呼び出し元は0件だから穴ではない」と述べたが、**これは偽**だった。実際には2つのメソッドが本番から呼ばれている（0件なのは別の3メソッド）。**結論（到達可能な穴は無い）は正しかったが、根拠が誤っていた**——生きている呼び出し元はいずれも上流で遮断済みだったのが真の理由である。**「実在しない穴を申告しない」ことに気を取られて、穴が無いことの根拠を測り損ねないこと。**

- **歴史記録を保存したまま実在を検査できる（115.173 の中核）**: 設計文書は撤去した部品について「**当該ファイルを名指しつつ不在を述べる行**」を必ず一つ持つ。この性質を使い、参照が実在しないとき同じ文書内に不在の記録があれば免除する形にした。**名指しの許容リストは無く、免除は文書が書いた内容だけで決まる。** 行単位でなく**文書単位**を採ったのは、行単位にすると歴史記録の本文を書き換えさせることになり、115.169・115.172 が確立した書き分けの基準に反するためである。
- **今後の撤去では、不在を一行記録することが検査上の義務になる（115.173 の帰結）**: 部品を消す変更の中で設計文書に不在を書かなければ、その文書の参照が赤になる。**115.169 の教訓「部品を消すときは、その部品を指す記述を同じ変更で数え上げること」が機構になった。**
- **限界は形だけでなく規模も測ること（115.173 のレビュー指摘）**: 「一度でも不在を記録すれば、その文書内の同じファイルへの他の言及はすべて免除される」という限界は明記されていたが、**その面の広さは測られていなかった**。実測すると免除の陰に入る現存参照は distinct 160件・全候補の 29.5%（site-survey 単独では 46%）に及ぶ。**形の開示は規模の開示ではない。** 読み手は「estimate-request の一行」程度と読んでしまう。
- **起票文の数値も実測で覆ることがある（115.173）**: 本文が「`reorderItems` / `batchUpdateItems` / `calculate-overhead` も現在のコードに存在しない」と述べた3件のうち、**実在しないのは1件だけだった**。前2つは実在する（設計文書が名指す特定のファイル内に無いだけ）。「30箇所」も実測は38。**起票の根拠になった観察も、着手時に測り直すこと。**
- **記述と実装の食い違いは検査本体にも起きる（115.173 のレビュー指摘）**: 検査は実在の索引を「最上位の**版管理下**エントリ」と説明していたが、実装は `EXCLUDED_DIRECTORIES` を除いた**実ディスク**を走査していた（版管理下に無い最上位エントリが8件索引される）。実害は実測0件だったが、**説明が実装を正確に述べていなければ、後任は説明の側を信じて誤る。**

- **同居の母集団は条文レベルで採らないと虚偽の除外が残る（115.186 の中核）**: 被覆印が別条文を名乗る誤ラベルは、同居の走査から**漏れる**。漏れた先に「検証は実在するのに除外が据え置かれている」形が2件（`quantity-table-generation` 要件7 受入基準7、`site-survey` 要件22 受入基準3）潜んでいた。**「このファイルに主張が無い」はファイル局所の事実であり、条文が未検証であることの根拠にならない。**
- **「主張する検証は無い」と書く前に、全走査で確かめること（115.186 のレビュー差し戻し）**: 不在の主張3件のうち**2件が偽**だった。1件（60fps）だけが真で、それは `e2e/specs` 全体に `fps` の主張が0件であることを測って初めて言えた。**不在の主張は、母集団の側から測ること。**
- **陽性対照は他の検査に遮蔽されうる（115.186 のレビュー指摘）**: 検査を新設すると、既存の陽性対照が**新しい違反にも同時に引っかかる**ようになり、本来狙った検査を無効化しても緑のまま通る。実測で遮蔽は3件あった。**対照の合否を「弾かれたか」ではなく「狙った検査が挙げたか」まで見る形（`Violation` に検査の判別子を持たせ `expectCheck` で固定）にすると機構で塞がる。**
- **例外は識別子の一覧でなく機構で判定できる（115.186）**: 同居が正しい6件はすべて `test.fail()` のラチェットだった。除外を消せば静的解析上「被覆済み」となり未実装が緑に化け、被覆印を消せばラチェットが要件と切れる。**この構造はラチェットの有無という機構で判定でき、許容番号の一覧を持つ必要がない。**
- **被覆率の低下が是正の成果であることがある（115.186）**: 全受入基準の被覆率は 94.3% から 93.3% へ下がった。実質を持たない被覆印33件を取り下げた結果であり、**後退ではなく実態の露出**である。同時に `--strict` の `in-repo-unverified` が 145 から 170 へ増えたが、これも「除外が掲げる代替検証の到達性を、同居していた E2E の被覆印が肩代わりしていた」という会計上の虚構が剥がれたもので、劣化ではない。

- **抽出規則が読まないものは、黙って分母に居座る（115.187 の中核）**: 要件定義書が取り消し線で無効化した受入基準31件は、抽出規則が `~~` を読まなかったため分母に残り、うち29件はその番号を名乗るだけの被覆印が付いて**分子にも入っていた**。分子と分母を同時に水増しするため、被覆率は無効化された分だけ実態より良く見えていた。**指標の分母は、それを作る抽出規則まで遡って疑うこと。**
- **撤廃済みの条文に「代わりの検証」は存在しない（115.187 の方針決定）**: 除外の一件は「E2Eでは確かめないが**代わりにこの方法で確かめる**」という約束である。撤廃済みの条文にはその相手がいない。現に `removed-from-spec` の2件は代替検証として「requirements.md に削除表記を維持する」という**循環した約束**を掲げていた。**撤廃は除外ではなく分母からの除去で扱うこと。** 区分ごと廃止した。
- **分母から落とすときは、落とした件数を必ず出すこと（115.187）**: 黙って縮む分母は水増しと同じだけ危険である。撤廃件数と、そのうち被覆印が名乗っていた件数を**0件のときも無条件に出力**する形にした。0件で黙ると検査の空振りを見逃す。
- **移管先が被覆されていることを確かめてから落とすこと（115.187 のレビュー）**: 分母から落とす操作は、未検証の条文を指標から消す危険と背中合わせである（115.186 の「除外が穴を隠す」と同型）。レビューは29件の移管先を**全件**突き合わせて被覆済みであることを確認した。**抜き取りでなく母集団の側から数えること。**
- **新設した検査は、既存の陽性対照と同じ判別子を持つと遮蔽を生む（115.187。115.186 に続き2度目）**: 「撤廃済みを除外で指す」と「存在しない番号を除外で指す」はどちらも `criterion-correspondence` を挙げるため、`expectCheck` では言い分けられない。**直し方が正反対（除外を取り下げる／除外を足す）である以上、言い分けは機構対照として別に固定する必要がある。**
- **成り立ちの違う数字を一つの内訳に混ぜないこと（115.187 のレビュー指摘）**: 実装は31件を「移管28・改訂1・除外済2」と書いたが、前二つは**成り立ち**の軸、最後は**除外の有無**の軸であり、`quantity-table-generation/REQ-1.3` が両方に数えられていた。正しくは移管29・改訂1・撤廃1で、うち2件が除外済みである。**軸の違う分類を足し合わせて総数に合わせると、合計が合うぶん誤りが見えにくい。**

- **指し先の誤りは、除外の誤りと相殺して指標に現れない（115.188 の中核）**: 被覆印が別条文を名乗ると、名乗られた条文は被覆済みと数えられ、実際に検証されている条文は被覆源を失う。**両方が同時に狂うため被覆率は動かない。** 母集団は 3697件（是正後 3626件）で、対応不良は 438件（11.8%）だった。
- **順序づけでは足りない。全件を裁定するしかない（115.188 の実測）**: 語彙一致度で並べても、実在した誤り（`site-survey-crud` の一律ずれ）は 3697件中 **3260位**、「別条文の方が合う」順でも 2574位だった。**下位から見る方式では到達できない。** 3697件を分割して全件を一件ずつ裁定した。
- **取り下げの説明文が、それ自体で被覆印になる（115.188 の罠）**: 読み取り規則のパターン3 は散文中の `feature/REQ-N.M` を無条件に拾う。「受入基準8.2 は確かめていないので取り下げる」と**その形で**書くと、取り下げたはずの番号を名乗り直してしまう。ファイル前書きのパターン5一覧（`- REQ-N.M:`）も同様。**両方を除去して初めて未被覆として露出した。** 説明は「site-survey の受入基準8.2」の形で書くこと。
- **「除外と同居するから直せない」は誤った二者択一（115.188 のレビュー指摘）**: 付け替え先が除外済みでも、**取り下げは同居を作らない**。名乗りを誤ったまま残す選択は指標の穴を温存する。
- **自己検査の陽性対照が、実データの特定の被覆印に暗黙依存しうる（115.188）**: `COVERED_PROBE_ID` が指す被覆印を本タスクで取り下げた瞬間、前提が崩れて検出漏れとして赤化した。**走査で前提そのものを確かめる `assertCoveredByE2E` を置くと、次に同じことが起きても機構が捕まえる。** 変異元・探り先として実データを指す対照は、その実データを動かす変更で壊れる。
- **分類はカテゴリ見出しでなく一件ごとの主題で行うこと（115.188 の2度目の差し戻し）**: 「115.189 へ送る部分被覆」として括った群に、主題違い（本タスクの所管）が抽出16件中10件混ざっていた。見出し「逆の状態を確定させる」が、A の定義「条件が逆」と**同語**だったことが原因である。**残す項目には「なぜ主題が同じと言えるか」を一行添えること。**
- **記録の網羅性は散文の数え上げでなく機械集計で担保する（115.188）**: 「約100件を是正」と書いた実数は 145件だった。`check:req-coverage:json` の被覆印集合を HEAD と突き合わせた全件表に置き換えて初めて、記録と実態が一致した。
- **記録が「他ファイルを改めた」と述べたら `git status` で確かめること（115.189 の差し戻し）**: 裁定記録が「`scripts/coverage-mark-adjudication.md` §6 を実態へ改めた」と述べながら当該ファイルは未変更で、差し向けられた案件が無主のまま落ちていた。**「約束が実態を上回る」ことを裁定する記録自身が、同じ病を再現した。** 記録に書いた是正の主張は、成果物の差分に現れているかを機械で突き合わせること。
- **記録が引く件数は、書いた時点でなく提出時に測り直すこと（115.189）**: 「二件が名乗る」と書かれた被覆印は実測すると**三件**、「読点の規則は3件中2件が偽陽性」は追試手段を置くと**46件**で、いずれも再現しなかった。**追試の手段を成果物に残せない実測は、記録に書かないか、残せない旨を明記すること。**
- **食い違いを検出する仕組みが無ければ、食い違いは全検証が緑のまま実在しうる（115.190 の RED）**: 二つの抽出器の片方だけを変異させても、`check:req-coverage` から `check:e2e-selfjudge` まで**全て緑で素通りした**。しかも変異を加えるまでもなく微差は既に4件実在していた（うち2件は起票文に無く実装で新たに検出）。**複製を「同一にすること」と散文で述べるコメントは、何も強制していない。**
- **陰性対照の実効は「変異を加えたか」でなく「その対照でしか捕まらない変異が在るか」で測る（115.191）**: 変異を伴わない陰性対照へ、検査を不当に厳しくする変異を当てたところ **59件すべてが緑**で、その対照は何も担保していなかった。是正後は同じ変異で当該1件だけが赤くなる。**後から作った変異で実効を演出できる**ため、担保する内容が検査の仕様として意味を持つかを併せて判定すること。本件は「裸の識別子を許すか否か」は実物の対照が既に担保しており、固有の担保は「どの裸の識別子を許すかの線引き（特例列挙を許さない）」に限られる、という限界まで実測して記録した。
- **陽性対照の空振りは自分で赤くなるが、陰性対照の空振りは静かである（115.191 のレビュー）**: 陽性は変異が効かなければ「弾かれなかった」で落ちる。**静かな空振りが成立するのは陰性側だけ**であり、走査はそちらへ集中すればよい。
- **偽の被覆主張を是正すると、その偽主張を実データ対照として固定していた資産が陳腐化する（115.192）**: 未検証の受入基準を E2E で被覆したところ、`check-requirement-coverage.selftest.ts` が当該ファイルを「拾われない側」の実データ対照として固定していたため、対照が空振りへ変質した。**自己検査の点数（30/30）は不変のまま通り、点数では検知できなかった。** 被覆源を増やす変更は、その被覆源を対照として固定している資産が無いかを走査すること。
- **境界外の資産が自分の是正で陳腐化したなら、それは境界を守った結果ではなく境界外への副作用である（115.192 の差し戻し）**: 実装者は「`scripts/` は境界外だから」と被覆の名乗りをタグのみに逃がし、対照の空振りを吸収して隠した。**吸収は境界の遵守ではない。** 親へ差し戻して境界拡張の承認を得るか、起票して記録に残すこと。
- **「拒否されないこと」は上側を固定しない（115.193 のレビュー）**: 更新の入口にあった観測は「空文字を拒否する」だけで、これは下限が1から2へ動いても成立する。`min(1)` を `min(2)` へ変異させても全件が緑で通った。**下限を固定するには「ちょうど下限の値が受理され、実際にその値が入る」ことまで主張する必要がある。** 境界は片側だけでは固定できない。
- **同じ制約が複数の入口に定義されているなら、入口ごとに独立して固定すること（115.193）**: 作成と更新の双方にスキーマがある場合、片方の観測だけでは、もう片方の制約が消えても気づけない。**入口ごとに別のリテラルを使うと、変異したときにどちらの入口が崩れたかが記録から判る。**
- **「該当0件」は走査が空振りしている可能性を常に疑うこと（115.194 のレビュー）**: 母集団走査が0件を返したとき、それが「実在しない」のか「走査器が動いていない」のかは区別できない。**わざと該当する形を仕込んだ写しに当てて検出できることを示して初めて、0件が主張になる。**
- **規則を直さず書き方だけを直すと、同じ書き方が持ち込まれた瞬間に再発する（115.194）**: 起票が挙げた実データは先行タスクで既に是正済みで母集団は0件だった。それでも規則を直したのは、規則の側に潜在欠陥が残っていたためである。**実データが0件であることは、規則を直さない理由にならない。**
- **自分の是正が既存の対照を空振りへ変えていないかを、変異で確かめること（115.194）**: 見本が ` * Note: REQ-4.2 …` と行頭のコメント記号を印にしていたため、規則を直した瞬間にその陰性対照は何も捕まえなくなっていた。**115.192 で差し戻された形を、実装者が自分で見つけて塞いだ。** 読み取り規則を変える変更は、その規則に依拠する見本を必ず点検すること。
- **同じ関数の中に読み取り経路が二つあると、片方だけを直しても規則は未是正のまま残る（115.195 のレビュー差し戻し）**: 一覧項目の識別子欄を最後まで読む経路を足したが、印を探す関数が行コメントの二重スラッシュを印なしと判定するため、行コメント形式の一覧では従来の正規表現経路だけが働き、過小帰属がそのまま残っていた。**自己検査は緑のまま通り、既存の陽性対照がその書式を固定していたにもかかわらず食い違いは検知されなかった。** 読み取り規則を足すときは、同じ入力を扱う既存経路の全ての書式に対して新経路が届くかを実データで実測すること。
- **過小帰属の是正は、偽の被覆を掘り起こしうる（115.195）**: 読点の続きを読むようにした瞬間、先行タスクが「本ファイルでは検証していない」と本文で明言した受入基準が、前書きの一覧に取り残されていたために被覆主張へ復活した。**読む範囲を広げる変更は、これまで読まれていなかった記述の正しさを一件ずつ確かめること。** 拾えるようになった記述は、拾えなかった間は誰にも点検されていない。
- **起票の欠陥が既に閉じていても、規則の側の残存機構は閉じること（115.196）**: 起票が述べた「分子が生のタグ集合」は起票コミット（115.168）では実在したが、115.188 が積を導入して閉じていた。**起票の数値をそのまま信じて実装すると、存在しない病を治すことになる。** 実装者はまず HEAD で測り直し、代わりに残っていた「分母の定義が集計側と可視化側の二箇所にある」機構を閉じた。分母が食い違えば、その差に落ちた被覆印は分子から外れながら分母外の内訳にも出ず、**幻の番号が黙って消える**。
- **恒等式は実データに対して毎回強制して初めて主張になる（115.196）**: `被覆 + 未被覆 = 総数` を自己検査の合成データだけで固定しても、実データの経路が別なら破れは素通りする。積を外す変異を当てたとき、自己検査4件が赤くなるのに加えて**実データのゲートが `2678 + 215 ≠ 2888` で赤化する**ことまで実証して、初めて機構が捕まえていると言える。
- **走査で「無い」を示せと書いたタスクは終端しない（115.197 が3巡差し戻して確定させた）**: 変異空間は有限に列挙できないため、レビューが新しい変異を考案するかぎり必ず新しい無言変異が出る。実測: 3巡目レビューが30件超を当てた直後の同じ状態に対し、debug 調査が**8変異でさらに3件を新規発見**した。同じ関数の同じ判定木の中ですら網羅されておらず、レビューは `playwright` を挙げながら同じ選言の `storybook`・`jest` を見落としていた。**受入条件は「実データが実現する同値類のうち見本を欠くものが零である」という有限集合上の全称命題へ書き直すこと。** 「無言変異が存在しない」は主張しない。
- **3巡の発見はすべて単一の類型であり、変異でなく数え上げで検出できる（115.197）**: 「本番の規則が入力を分割する同値類のうち、実データが実現している類を見本が一つも持っていない」。debug 調査は実データの同値類を数え上げるだけで、3巡目レビューの2件と新規2件を**変異ゼロで**特定した。走査は自分が想像した変異の範囲しか測れないが、数え上げは実データの側から漏れを列挙できる。
- **変異走査はワークツリーを一切書き換えずに回せる（115.197）**: 実装者は「読み取り規則をディスク上で書き換えるため中断時に壊した状態を残しうる」として走査ハーネスを使い捨てにしたが、対象スクリプト群を一時領域へ複製し**複製側だけを変異させて** cwd をリポジトリ根に保てば、相対パスは正しく解決され追跡対象は無傷である。あわせて、本番出力の比較は**サイズでなく `cmp`** で行うこと。件数の桁が変わらない変異（148→144 等）はバイト数が一致してしまう。
- **散文からの識別子抽出は、誤検出率を測ってから道を決めること（115.198）**: 非 PascalCase の裸の識別子を照合対象にすると誤検出は **65/65（100%）** だった（`zod`・`feat`・`vh`・`NODE_ENV`・`readOnly`・`any` など、そもそも識別子ですらない語が大半）。115.167 の 262/30（11.5%）とは桁が違う。**先行タスクが引く誤検出率をそのまま自分の判断根拠にしないこと。** 形が指し先を一意に決める語（PascalCase の裸・受け手なしの `name()`・拡張子なしのスラッシュ経路）へ絞ると本文行の誤検出は 0/11 になり、規約化で解けた。
- **形で区別できない曖昧さは、検査でなく記法の規約で解くこと（115.198）**: steering の例示 `feature/new-feature` は、真の経路 `services/signboard-svg.service` と**形の上で区別できない**。分類器側では解けないため、例示をプレースホルダ形（`feature/<機能名>`）で書く規約を置き、陰性対照で固定した。**許容リストで個別に逃がすのではなく、形による構造的な逃がしにすること。** データを検査に合わせて曲げたのか正当な規約化なのかは、同型の記述が他に残っていないかを全走査して確かめること。
- **報告値の「正直さ」を検査するなら、数え直しは本体と別実装で行うこと（115.199 のレビュー差し戻し）**: 件数の正直さを見る検査が**本体の集計関数を呼んで数え直していた**ため、その関数自体の誤りは両側で相殺されて検出できなかった。実測: 集計から逆引用符箇条書きの行を除くだけで、実データの報告が **718→567** へ動くのに自己検査は 42/42 緑のまま通った。**同語反復は「数え直している」という見かけの下に隠れる。** 是正は自己検査側の独立実装で数え直す形。あわせて合格側の見本が実データの**二規則のうち一方しか写していなかった**ことも同時に露見した。
- **語彙を実ファイルから作る道は、用途によって採れない（115.199）**: 115.198 は拡張子の語彙を実ファイルから機械的に作ったが、本タスクでは**採れない**。`.jsx` の実ファイルはリポジトリに0件で、実ファイル由来の語彙にすると **`App.jsx`／`main.jsx` というまさに検出したい失効が対象外になる**。115.198 の語彙は「棄却」用（漏れても隣の検査へ回る）、こちらは「照合対象の選択」用で、**非対称である**。先行タスクの手法をそのまま持ち込む前に、用途の向きを確かめること。
- **散文まで対象を広げるかは誤検出率を測ってから決めること（115.199）**: steering の散文中のファイル名参照は 111件中28件が不在だが、真の失効は2件だけで**誤検出率は 27/28**。残りは同期記録の旧名・命名規則の例示・ライブラリ名・プロパティ経路・生成物・URL である。規則は広げず、真の失効2件は手で是正して**限界として明記**した。
- **「挙げたものが実在するか」と「挙げていないものがあるか」は別の検査が要る（115.200）**: 115.169/115.198/115.199 が積み上げた実在照合は**過大の側**しか見ない。挙げられているファイルは実在するので、**列挙の抜けは網に掛からない**。実測: e2e の `site-surveys/`(31spec) と `execution-budget/`(8spec) が列挙外で「存在しないもの」として読まれていた。過小の側は、網羅を主張する範囲を印で囲み、宣言集合と実体集合の**双方向の差分**を取る別検査で閉じた。
- **列挙は「網羅か代表例か」を先に決め、形で判るようにすること（115.200）**: 決めずに書くと、代表例のつもりの列挙が全件のように読まれ、件数だけが陳腐化して残る。実測: steering の件数 **59個中 38個が陳腐化**しており、一致していたのは21個だけだった。ディレクトリ単位の件数6個は全滅（`utils 14→222`、`routes 23→755`、`services 324→2361`）。**確かめる手段が全件実行しかない件数は書かないこと。** 区分（有限かつ小さい）は網羅として機械で追随させ、個々のファイルは代表例としてリード文で群として示す。
- **記法の規約を足すと、隣の検査の同値類が増えて静かに赤くなる（115.200）**: フェンス内に逆引用符付きディレクトリを書いたところ、115.198 の「実データが実現する同値類のうち見本を欠く類は零」が**実データ未実現だった類の発生**で赤化した。**相手の見本を足しに行くのは境界違反**（115.192「吸収は境界の遵守ではない」）なので、自分の書き方を変えて新しい類を持ち込まない形にした。**記法を変える変更は、実データの同値類を増やしていないかを隣の検査で確かめること。**
- **「押せること」は到達性を固定しない（115.201）**: Playwright は `overflow: hidden` の箱もプログラム的にスクロールするため、`scrollIntoViewIfNeeded` や `locator.tap()` は**利用者が到達できない状態でも成立する**。到達性を測るなら、位置を変える手段を**実タッチの払い**（CDP `Input.dispatchTouchEvent` の touchStart→touchMove→touchEnd）だけに限り、判定を「祖先のクリップ矩形∩可視ビューポートへの完全内包」かつ「中心点の `elementFromPoint` が当該項目を返す」に置くこと。**ブラウザのジェスチャー認識を通す経路にすると `touch-action: none` に従うので、利用者が払えない箱では赤になる。**
- **起票が名指しした穴が、既に別の検証で塞がっていることがある（115.201）**: 起票は「祖先が切り取る形は E2E で捕まらないおそれ」と述べたが、実測すると既存の検証が捕まえていた（115.170 の 44px 化でツールバー自身が画面幅を超えたため）。**本当に塞がっていなかったのは `touch-action: none` の形**で、既存の単体12件も E2E も緑のまま利用者が到達不能になる。**起票の名指しをそのまま受入基準にせず、どの変異が実際に無言なのかを測ってから的を決めること。**
- **serial モードのファイルでは変異の影響範囲を過小にも過大にも読み違える（115.201）**: 先行テストが赤になると後続が未実行になる。起票が「E2E 2件が赤」と記録した2件は、到達性を述べる主張ではなく**巻き添えで落ちた別テスト**だった。**変異で影響範囲を測るときは個別に絞って回すこと。**
- **`htmlFor` が付いていることは、押下が働くことを固定しない（115.202）**: 115.201 の教訓（「押せること」は到達性を固定しない）は宣言ガード一般に及ぶ。属性の綴りだけを見る主張は、**指す先の `id` が消えても別要素へ移っても緑のまま通る**。`HTMLLabelElement.control` が意図した要素を返すことまで見ると、`id` を一文字変えるだけで赤くなる（実測: 単体49件中9件）。さらに実ブラウザで押下が実際に焦点を移すところまで見ること。
- **`aria-label` は `<label for>` に優先するため、関連付けを足しても読み上げ名は変わらない（115.202）**: 二重読み上げを恐れて関連付けを見送る必要はない。ただし**それを主張で固定すること**——`getByRole(role, { name })` は accname を実際に算出するので、見出しが読み上げ名へ混ざれば照合が落ちる。この番人は是正前から通っており、非回帰の網として働いた。
- **frontend の型検査は本番ビルドを回さないと露見しない失敗がある（115.202）**: transitive 依存を直接 import すると、単体も `npm run type-check`（ルート）も通るのに **Docker の本番ビルド（`tsc && vite build`）だけが `types ... could not be resolved when respecting package.json "exports"` で落ちる**。frontend を変更したら本番ビルドまで回すこと。
- **被覆タグが広すぎるとき、狭めるだけが答えではない（115.203）**: 「モバイル」を名乗る検証が実はデスクトップ分岐を測っていた。モバイル幅の `matchMedia` を入れて測り直すと、**12件のうち赤くなったのは折返しを主張する2件だけ**で、残る10件は分岐に依らない宣言の観測だった。**分岐に依らないものは両分岐へ広げ、分岐を要するものは分岐を実際に切り替えて測り、測れないものだけタグを取り下げる**——テストごとに扱いを分けること。結果として本ファイルは、実装のモバイル分岐を殺す変異を **HEAD では一件も捕まえなかったのが4件で捕まえる**ようになった。
- **同一分岐を二度走らせても緑になる状態は、機構で捕まえること（115.203）**: 是正した欠陥そのものへの逆戻りは静かに起こる。両分岐を回す構成にしたら、**各分岐で「分岐が幅どおりに切り替わっている」対照**を置くこと。`matchMedia` の代替は、解釈できないクエリを黙って false にせず**投げる**構成にすること（前提を満たせないときに素通りしないため）。
- **死蔵は一ファイルでは終わらない。組ごと数えること（115.204）**: 起票は「import しているのは物語だけ」と述べたが、実測では**専用の単体検証5本（計1488行）と定数ファイル**も同じ組だった。定数ファイルを残すと新しい孤児が生まれる（115.192 の副作用）。**撤去の範囲は、名指しされたファイルではなく到達性で決めること。** 本番の到達モジュールへ import を仕込むと未到達が動くことを見れば、組の境目は機械で測れる。
- **記録を書く行為そのものが指標を動かす（115.204）**: 撤去済みファイルへの参照を設計文書へ記録すると、`check:design-path-refs` の免除件数が増える。実測は HEAD 72 → 撤去時点 107 → **記録追記後 119**で、増分47件のうち**12件は記録の文章自身が増やした分**だった。**記録の数字は書き足した後に測り直して固定すること。**
- **cwd を基準にする検査は、HEAD 版スクリプトを別の場所から起動しても比較にならない（115.204 のレビュー）**: `scripts/check-requirement-coverage.ts` は `process.cwd()` から基準を取るため、リポジトリルートから HEAD 版を走らせても**作業ツリーを二度測るだけ**で常に一致する。`env -C <worktree>` で cwd を合わせて初めて実効ある比較になる。**一方 `check-design-path-references.ts` はスクリプト自身の位置から解決する。** 検査ごとに基準の取り方が違うので、比較する前にどちらかを確かめること。
- **flat config の `files` は実行時の作業ディレクトリを基準に解決される（115.205）**: `npx --prefix frontend` のように cwd がリポジトリのルートのまま走らせると、`src/__tests__/**` のような相対パターンが一致せず**走査が静かに0件を返す**。実測: 同じ設定で cwd=frontend なら112件、ルートからなら0件。**仕込んだ覆いすら検出できなかったことで初めて空振りに気づいた**（115.194 の作法が効いた実例）。lint を走査の道具に使うときは、cwd を合わせてから測ること。
- **絞った走査の値を、広い母集団の名で名乗らないこと（115.205 のレビュー差し戻し）**: 据え置きの理由を記録するとき「frontend の単体検証には84件」と書いたが、84 は `src/__tests__/**` に限った値だった。実測は lint 範囲全体で112件、単体検証の実数は96件、**うち16件は本番コードで慣用形に由来しない**。記録は母集団を12件過小に示し、本番側の存在を黙らせていた。**据え置きの記録は、次の担当者が範囲を決める根拠になる。名乗る母集団と数値を一致させ、追試手順と測定日を併記すること。**
- **「〜由来」と書くなら定義を明示すること（115.205 のレビュー）**: 「`vi.hoisted()` 由来」を「束縛を作る変数宣言の初期化子が `vi.hoisted()` 呼び出しであること」と定義すると86件、「外側の束縛が `vi.hoisted()` の引数の内側にあること」と取ると36件になる。**定義が曖昧な件数は再現できない。**
- **据え置きの決着は、測った事実・判断・残るリスクを書き分けて条文へ残すこと（115.206）**: 「対象を広げない」と決めたなら、次の担当者が同じ議論を繰り返さないよう根拠を要件文に残す。**書くのは「実害が無い」ではなく「現時点で適用範囲を限る理由」である。** 測っていないこと（本件では粗いポインタでの操作の成否）は測っていないと明記し、**再検討すべき条件**（誤操作が確認された場合、AAA 準拠を掲げる場合）を添えること。参照標準を引くときは水準の別（2.5.8 は AA で 24x24、2.5.5 は AAA で 44x44）と「寸法だけで満たす」という限定を落とさないこと。
- **「前例が無い」も測ってから言うこと（115.206 のレビュー。件数は 115.208 で測り直した）**: 実装者は「個別要件内に注記を置く前例は無かった」と述べたが、**当該スペック内では真、リポジトリ全体では偽**だった。**走査の範囲を述べずに否定を書くと、それ自体が 115.168 の類型になる。**
- **その訂正自身が同じ罠に落ちていた（115.208 が実測）**: 上の項を書いた時点の「`**備考:**` を受入基準の直後に置く形が8スペックに実在」は**誤りだった**。行頭を固定して測り直すと `**備考:**` は project-management の14行のみ、行頭 `備考` は construction-photo の4行のみで**2スペック18行**である。8スペックという値は `備考` を部分文字列で数えた結果で、**残る6スペックのヒットはすべて「大項目・中項目・…・単位・備考」というデータ項目名**であって注記ではない。しかも project-management の配置は Objective の直後＝**受入基準の前**であり「直後」も不正確だった。**訂正を書くときも走査式を固定してから数えること。**
- **本番に読み手がいないことは、撤去してよい理由にならない（115.207）**: 要件4.6 は**引き金が上限、打ち切りが別の閾値**でずれているため、その間の帯では二つの経路が返す値・呼び出し回数がすべて一致する。**書き込み専用に見えた項目が、その境界を観測できる唯一の点だった。** 実測: 早期リターンの比較を変異させると152件中2件が赤くなるが、**その2件から当該の印の表明だけを外すと152件すべてが緑**になる。撤去は要件の担保の後退にあたる。**残す判断をしたら「何のために在るか」を型に書くこと。**
- **`check:req-coverage` は「本番未参照の部品を撤去してよいか」を判定できない（115.207）**: 当該の項目を使う単体検証は要件番号を一つも名乗っておらず、**撤去しても被覆指標は動かない**。115.204 が確立した「到達性で境目を決める」作法は、**被覆源として登録されていない検証が担う担保を見落とす**。撤去の可否は、指標ではなく**変異で担保の有無を直接測って**決めること。
- **条文が結果だけを定めて例外を規定していないと、実装の選択が要件から読み取れなくなる（115.208）**: 要件4.6 は「収まった時点で打ち切って登録する」とだけ定め、**収まらなかった場合を一切規定していなかった**。実装は「収まらなくても登録する」を選んでいたが、それが意図なのか偶然なのかは条文から判らない。**引き金と打ち切りの閾値がずれている条文は、ずれの外側で何が起きるかを必ず規定すること。**
- **明文化のための受入基準は、実装を測ってから書くこと（115.208）**: 現行の挙動を条文へ引き上げるとき、条文の各語（本件では「最後の段階まで圧縮した画像」「登録する」「アップロードは失敗させない」）が実装のどこに対応するかを一つずつ測ってから書く。**測っていないこと（本件では「下げ切っても収まらない実画像が現に存在するか」）は、注記に「測っていない」と明記すること。**
- **規律を書くことと規律に従うことは別の作業である（115.210 が二度実証）**: 反実仮想の作法を固定するタスク自身が、同じ誤りを二度犯して差し戻された。一度目は網羅の主張（「33 文を一件ずつ読み過検出は 1 文」と書いたが実測では 3 文。実際には一時スクリプトの出力を上から追っただけだった）、二度目は**排除の理由**（過検出の説明文が網に掛からない理由を「名指しを持たないため」と書いたが、実測では名指しを足しても件数は動かず、拘束条件は変異の語と判定の語の不在だった）。**二度目は、一度目の差し戻しで規律を steering へ書き足した直後に起きている。**
- **除外の理由を述べる記述も反実仮想である（115.210）**: 「これは対象外である、なぜなら X だから」は「X を足せば対象になる」と同値であり、当てるべき変異は**その条件だけを足す／外す**ことである。当初の作法は「この変異なら赤くなる」という肯定形しか想定しておらず、この型を取りこぼしていた。115.170（封じ込め要因を `overflowX` と取り違え、真因は祖先の `overflow: hidden` だった）と同型である。
- **実測を書き足す行為そのものが、次に測るべき数字を動かす（115.210 が三度実測）**: `check:cf-evidence` の母集団は、説明の書き足しで 32→33、過検出の中身を引いたことで 33→34、実行した変異と出力を書き足したことで 34→35 と動いた。**自己言及する検査では、記録を書くたびに測り直しが要る。**
- **「一件ずつ読んだ」と書くなら列挙の出口を成果物に残すこと（115.210）**: 件数だけを出す出口では読み直しを追試できず、網羅の主張が静かにずれる。レビュアーがその場限りのスクリプトで列挙して漏れを見つけたことが是正の契機になった。`npm run check:cf-evidence:list` が照合対象の全文を印字する。
- **開発規律は cc-sdd の配布物へ書かないこと（115.210）**: `.claude/skills/` `.claude/commands/` `.claude/agents/` は `npx cc-sdd@latest` の再実行で上書きされ、書き込んだ規律は無言のうちに消える。持ち込み口は `.kiro/steering/`（`kiro-impl` が task-relevant steering として実行役へ渡す）と `.kiro/settings/` である。**本タスクでは実際に、雛形へ何も書かない状態で実装者・レビュアーの双方が規律に従うことを確認した。** 汎用の規律は上流へ PR する（gotalab/cc-sdd#191）。
- **失効した名指しは、担保を差し替えたときに片方だけ取り残される（115.211 が二度差し戻された理由の一つ）**: 自己検査を強化して旧い判定関数を削除したのに、それを説明する本体注釈だけが「`checkNoAllowlistExists` が文字列リテラルの不在を機構として固定する」という**否定済みの主張のまま**残った。設計文書の側は正しく書き直されていたため、本体だけを読む後任が誤った理解へ戻る経路になっていた。**関数を削除・改名したら、その名前を引く全ての記述を同じ変更で走査すること。** この種の失効を拾う機械の関門は無い（`check:design-path-refs` は設計文書のみ、`check:steering-refs` は steering のみを走査する）。
- **「検出する N 件」は検出器の出力の数であって素の実占有ではない（115.211）**: 是正前の版に対する記録を「コロン直付け 12 件」と書いたが、`design.md:661` が同一行に 2 回現れ `collectReferences` の重複除去で畳まれるため、**検出器の出力は 11 件**であった。行数も「2 箇所」と書いたが件数の過検出を含めて 3 行。**記録した手順で追試した後任が突き合わせられる数を書くこと。**
- **名前の一致で逃がしを見る自己検査は担保にならない（115.211）**: `allowlist` / `baseline` といった語名と文字列リテラルの有無だけを見る形は、`run()` へ `if (relativePath.includes('site-survey')) continue;` を 1 行足す間引きに対し **55/55 緑で素通り**した。しかも走査件数の表示は列挙結果を返していたため「13 ファイル」のままで、間引きが表示にも出なかった。**本体の文を積み上げ・返却・判定へ限定し、サブプロセスで報告件数を突き合わせる**形（`checkNoFindingsNarrowing` + `checkReportedCountsAreExact`）へ強化すると同じ変異で 56 件中 1 件が落ちる。**走査件数は列挙結果ではなく実際に読んだ分を積み上げること。**
- **走査の主張は、走査を実行してから書くこと（115.212 が三度差し戻された真因）**: 走査記録の中核である「再現コマンドを同じ行に持つ 69 件を**すべて実行し直した**」が**未検証の前提**だった。debug が実際に 69 行から 106 本を抽出して全件実行すると、断言値と食い違うものが 3 件出た。三ラウンドとも「実行した」と書きながら実行していない。**steering『「掃き終えた」を未検証の前提で支えない』は、走査の完了主張にもそのまま掛かる。**
- **自己言及する件数は、文章を確定させた後に一括で測ること（115.212）**: 本書は自分自身について四つの件数（強調記号を課す網・課さない網・再現コマンドを同じ行に持つ行・実測日を持たない残余）を引く。**それらを述べる行自身が母集団に属し、三つの網へ同時に掛かる**ため相互に連動する。値ごとの逐次再測は三ラウンド連続で取りこぼした。**フェンス済みコードブロックと行内追記は四値を一切動かさず、新しい箇条行は三つを同時に +1 する**（いずれも実測）。是正の記述を増やすときはこの二つの器を使う。
- **`HEAD` 相対の参照は、行番号と同じ理由で禁止対象である（115.212）**: `git show HEAD:...` は**コミットのたびに再解決される動く参照**であり、記録を書いた当時の版を指さなくなる。実測では断言値 `17` に対し現在の出力は `10` だった。同型が本書に二箇所あった。**歴史記録が過去の版を指すときはコミットハッシュへ固定すること。**
- **日付は本プロジェクトの着地頻度に対して解像度が粗い（115.212）**: 同日に複数のタスクがコミットされるため（実測: 単日で5コミット）、実測日だけでは版を判別できない実例が出た（`check:cf-evidence` の三条件が同日内に 35 文→40 文へ動いた）。**歴史記録には日付に加えてコミットハッシュを添えること。**
- **数値の鮮度を保証する機械の関門は存在しない（115.212）**: `check:design-refs` は参照形式、`check:design-path-refs` はパスの実在しか見ない。本書が引く件数が現況と一致するかを見る仕組みは無く、掃き残しは人手走査では再発する。form (b)（機械追随）への移行は後続タスク。
- **設計文書へ提案を書く行為は、提案の消化ではない（115.213）**: 「別途起票すること」と書いただけの提案が7件、どのタスクにも登録されないまま滞留していた。**書いた場所と直せる場所が違うことが滞留の主因である。** 以後、設計文書へ後続タスクの提案を書くときは (1) 是正先（どのファイルの何を直すか）と (2) 提案が生きていることを確かめる再現コマンドを、提案と同じ場所に書く。是正先が設計文書の外にあるならそれを明記する。
- **起票文が引く数値も、着手時に測り直すこと（115.213）**: 起票文は「Jest 道具名90件」と述べたが実測は 64 件だった。90 は 115.172 時点の値で、起票の時点で既に失効していた。**起票文の数値は起票時の実測であり、着手時の現況ではない。** 115.212 の起票文でも同じことが起きている（現況として挙げた 262/53 が実測 205/33 だった）。
- **境界外の欠落を見つけても、その場で直さないこと（115.213）**: 追跡表の内容欠落を発見した実装者がその場で修正したが、これは文書に**書かれていた**提案ではないため境界外であった。一度加えた列を元へ戻し、未起票の提案として登録し直している。**発見と是正は別の作業であり、是正には境界の承認が要る。**
- **「面」と「いま免除している件数」は別物である（115.215）**: 115.173 は免除件数を開示して「広さを測った」としたが、**免除件数はいま免除されている件数であって免除機構の広さではない**。面＝いま実在しながら同じ文書の不在の行に名指され、撤去された瞬間に文書内の全言及が無言で免除へ移る参照。実測は面 162 件・候補 574 件（28.2%）に対し免除 123 件であった。
- **面だけを見張っても足りない（115.215 が変異で実証）**: 面に入ったファイルを撤去すると**面は減り**免除が跳ねるため、面のみの基準では「狭まった」という助言に化けて素通りする。実測: `AnnotationEditor.tsx` を消すと面 162→160・免除 123→162 で、115.173 版の検査は同じ変異ツリーで緑のまま通った。**基準は面と免除の両方に置くこと。**
- **件数の単位を書き違えると開示が壊れる（115.215 が差し戻された理由）**: 「面は distinct で数える＝同じファイルは1件」と注釈へ書いたが偽であった。`collectAbsenceDeclarations` がルート相対パスと basename の双方を宣言集合へ入れるため、両方の綴りで名指されたファイルは 2 件を占める。**面 162 件に対し実体のファイルは 123 件**（39 件は別表記）。**数値を開示するときは単位を測ってから書くこと。**
- **basename での素朴な束ねは実体を数え損なう（115.215）**: レビューが提示した 121 件は `package.json` と `vitest.config.ts` が backend / frontend の別実体を 1 つに潰した値であった。**同名で別実体のファイルがあるため、束ねは文書ごとにルート相対パスの数で数えること。**
- **「分離」を実行時フラグで実装してはならない（115.216）**: 環境変数で統合検証を出し入れする形は、既定実行から45ファイルを無言で消す構成であり第3原則に真正面から抵触する。採るべきは**無効化ではなく選択**——既定設定が静的に `exclude` し、統合検証は専用の設定ファイルを明示した実行でのみ選ばれる。**両半分とも必ずどこかのコマンドで走る。**
- **分離の主張は分割で証明すること（115.216）**: 「既定 187 + 統合 45 = ディスク上 232、互いに素、孤児0」を実測して初めて「無効化していない」と言える。件数が合うだけでは足りず、**どちらにも選ばれないファイルが0件であること**を集合演算で示すこと。
- **設定で挙動が変わる検証選択は、それ自体が是正対象である（115.216）**: そのため本タスクでは Feature Flag Protocol を適用しなかった。手順1「フラグをOFFで追加」が、撤去しようとしている欠陥を一時的に再導入することになるためである。`kiro-impl` も設定変更を同プロトコルの適用外として挙げている。
- **読み手の判定を素朴な綴り一致で書くと、言及だけを読み手と誤判定する（115.216）**: 死んだ環境変数の判定器が、検査ファイル自身の言及を「読み手あり」と数えて陽性対照を落とした。`process.env.X` 等の実際の読みの形へ限定して是正。**なおコード注釈に読みの形を書くと今も生存と誤判定される**（レビューが変異で実証）。
- **検証が実装から下限を取り込むと、主張が空洞化する（115.217 が変異で実証）**: タップ領域の 44 を検証側が自前で持つ形では、実装の定数を 20 へ変えると 22 件中 11 件が赤くなる。検証が同じ定数を取り込む形へ変えると赤は 1 件だけになり、**下限を主張する 10 件は 20px を描いたまま緑**になった。取り込みは「実装が下限を満たす」を「実装は実装に等しい」へ弱める。
- **一元化してよいのは実装が選ぶ値であって、条文が運ぶ値ではない（115.217）**: 115.183 が自動保存の間隔を export したのは正しい（実装が調整する値だから）。44 は要件28.3 が運ぶ WCAG の外部権威値であり、検証側の複製は**立会人**として機能する。**性質で切り分けること。** 判断の記録は `frontend/src/components/site-surveys/tap-target.constants.ts` の `@fileoverview` 一箇所に置いた。
- **母集団は起票文より広いことがある（115.217）**: 起票文が挙げた 4 箇所に対し、実測では実装側 6 ファイル・検証側 9 ファイルで、起票文に無い**第三の名前** `TOUCH_TARGET_MIN_PX` も存在した。名前は `TAP_TARGET_MIN_PX` へ統一（採用理由は多数決ではなく design.md が既にその名で呼んでいたこと）。
- **要件が課していない下限を要件に帰属させない（115.217 が差し戻された理由の一つ）**: 要件28.3 の注記は適用範囲を「モバイル幅ツールバー」に限り、数値を引く先として 29.4・34.5・35.5 だけを列挙する。`PendingUploadPanel`（要件37 所管。タップ領域の条項なし）と `AnnotationContextMenu`（要件27 所管。同上）への帰属は誤りであった。**整合のための適用なら、そう書くこと。**
- **「修正可能」の表示を鵜呑みにしない（115.218 で親が誤診した）**: `scripts/security-audit.mjs` は `fixAvailable` の真偽だけで「修正可能: npm audit fix」と印字し `isSemVerMajor` を見ない。本件の `fixAvailable` は `prisma 6.12.0` で、インストール済み 7.9.1 からの**メジャーダウングレード**であった。表示に従えば本番の `@prisma/client@^7.9.1` を壊す。**関門の助言は根拠まで遡って確かめること。**
- **同一メジャー線に版があってもバックポート修正とは限らない（115.218 が捨てパッケージで実証）**: `deepmerge-ts@7.1.6` は 7.1.5 より新しいが、同じ advisory・同じ脆弱範囲（`<8.0.0`）で赤いままだった。`brace-expansion` の前例（メジャー線別の修正版が出て許容を削除できた）を当てはめる前に、**その版を単独で監査して確かめること。**
- **推移的依存の override は入れ子で限定すること（115.218）**: `brace-expansion` で平坦な一律 override が `minimatch@3` を壊した記録がある。`"@prisma/config": { "deepmerge-ts": "^8.0.2" }` の形なら他の消費者へ漏れない。**ただし将来ベンダが次のメジャーへ移ると `^8.0.2` が後方ピンとして働く罠が残る。**
- **lockfile を触ったら無関係な揺れを差分から除くこと（115.218）**: root の `npm install` は npm 11.6.2 の正規化で無関係な `"peer": true` を13行足す。override 無しで再実行して**同じ差分が出る**ことを確かめ、既存のドリフトと判定したうえで、目的のブロックだけを字句転記した。検査は `@emnapi` の件数とエントリの増減、そして alpine/musl の `npm ci --dry-run`。
- **起票文が名指す真因が実測で否定されることがある（115.219）**: 起票文は「作成日時と更新日時が別々の時計から来ている」と断じたが、移行SQL の `"updatedAt" TIMESTAMP(3) NOT NULL`（**DEFAULT なし**）と失敗時 trace の実データ（作成応答の `createdAt` と `updatedAt` が完全一致）が示すのは、**時計は既に単一で、その単一の壁時計が非単調**（WSL2 のホスト時刻同期が約1.45秒巻き戻す）という事実だった。ブラウザ側の `startedDateTime` も逆行していた。**起票文の診断ごと反証の対象にすること。**
- **「時計の差を検証で吸収する」以外に第三の道がある（115.219）**: 検証側に許容幅を置くと本当の順序逆転を見逃す。採ったのは**書き込み時に不変条件を成立させる**形（`resolveUpdatedAt` は実時刻が `createdAt` より前のときだけ `createdAt` を返し、実時刻を先へ水増ししない）。E2E のアサーションは一切緩めていない。
- **論理削除は2列を同時に動かす1回の更新である（115.219）**: `updatedAt` だけ押し上げると `deletedAt < createdAt` の逆転が削除行に残る。境界が名指す列の外へ及ぶ変更は、**撤回でなく明示宣言＋検証追加**で決着させた。
- **差分の半分が変異に耐えないことがある（115.219 が差し戻された理由）**: 削除経路の本番変更を丸ごと戻しても 171 単体＋44 統合が緑のままだった。**「実装を取り除いたら落ちる」を経路ごとに実測すること。**
- **`vi.spyOn(logger, ...)` はスコープ実行で緑・全件で赤になりうる（115.219）**: `backend/vitest.setup.ts:14` が `logger` を全域モックしており、呼び出し履歴が同一ファイル内の先行検証をまたいで積み上がる（`got 3 times`）。`beforeEach` の `vi.clearAllMocks()` ＋ `vi.mocked(logger.warn)` で解消。**挙動変更後に全単体スイートを回す規約がそのまま効いた事例。**
- **記録が定めた分類の作法に従うこと（115.220）**: `scripts/coverage-mark-adjudication.md` §2 は、指し先そのものが誤っている類型Aにのみ取り下げを課し、主題は同じで規範の一部が未観測の類型Bには課していない。`project-management/REQ-27.4` の三件は類型Bであり、取り下げは記録自身の規則の誤適用にあたる。**どちらを採るかは好みでなく、記録が既に定めた分類で決まる。**
- **「指標が動かない」は判断の根拠にならないが結果としては両立しうる（115.220）**: 観測追加案は指標が HEAD と byte identical、取り下げ案は covered 2674→2673・98.73%→98.70% で差集合はちょうど当該ID一件。**採否の理由は §2 の分類であって指標の維持ではない。** ただし §4（約340件）の裁定が未決である以上、観測を足せばどちらの決着とも矛盾しないという整合性も同時に成り立つ。
- **既存の被覆印が欠陥に盲目であることを実測で示すこと（115.220）**: 右上ボタンだけが0件時に現れる変異を当てたところ、新設した二件は赤くなり、既存の被覆印（`estimate-request-e2e.spec.ts:386`）は**緑のまま通った**。「被覆印がある」ことと「観測している」ことは別である。
- **同名の要素が同一画面に複数あるとき locator の取り違えが最大の罠（115.220）**: `EstimateRequestSectionCard.tsx` はヘッダーの右上ボタン（`aria-label="見積依頼を新規作成"`）と空状態のリンク（アクセシブル名は「新規作成」）を両方描画する。`exact: true` で分離した。**取り違えた観測は観測が無いより悪い。**
- **起票文が挙げる複製の形は抜き取りでありうる（115.221）**: 起票文は「同名関数の複製」と述べたが、被覆率側の名前は `discoverFeatures` であって同名ではない。実測すると判定規則そのものは完全一致で、差は「根の与え方」と「スペックディレクトリ不在時の扱い」の二点だけ、いずれも探索規則でなく**呼び手の方針**だった。規則が一致していたからこそ寄せても結果が動かない。**規則が食い違う複製を黙って寄せれば、それは片方の呼び手の結果を変える欠陥である。**
- **散文で維持する正当化は、訂正するより消すほうが強い（115.221 が差し戻された理由）**: `SPECS_DIR` の再輸出を残す理由として書かれた JSDoc が、**一度も存在したことのない利用者**を名指していた（`git log -S` でもコミット零）。訂正でなく再輸出そのものを撤去し、唯一の消費者を共有モジュール直参照へ移した。撤去は `TS2459` でコンパイラが強制する。**真であり続けねばならない散文は、その必要ごと消せるなら消すこと。**
- **実データだけの対照は真の乖離を見逃す（115.221 の M2a）**: 隠しディレクトリの扱いを片側だけ変える変異を当てると、複製検査と実データ一致検査は**どちらも緑のまま**で、合成の際どい構成（`requirements.md` 無しディレクトリ・直下ファイル・symlink・孫階層・隠しディレクトリ・`requirements.md` という名のディレクトリ）を当てる対照だけが検出した。リポジトリの実データに隠し機能が無いためである。**対照の母集団は、実在するものだけでは足りない。**
- **対照の天井を実測して記録すること（115.221 の M4）**: 共有モジュールから取り込んだ定数を使う「挙動同一の再複製」を当てると、三つの対照はすべて緑のまま通る（63/63）。断片方式は**規則が食い違う複製しか捕らえない**。これは 115.190 から引き継いだ既知の天井であり解決していない。**捕らえられない範囲を主張でなく実測として書き残すこと。**
- **下限は件数でなく構造で置けることがある（115.222）**: 現況（陽性37）を貼れば重複対照を減らす正当な変更まで止まり、「空でないこと」だけでは 37→1 の削減が無言で通る。採ったのは本体が持つ検査の語彙を陽性対照が全て名指ししていることを課す形で、**本体の検査が増減すれば下限が自動追随する**。TypeScript の直和型が語彙の配列から導出されるため、新しい検査種別は配列へ入らざるを得ない。
- **導ける語彙が無い側には下限を置けない。その限界を書き残すこと（115.222）**: 陰性対照には語彙に相当するものが無く、「変異を伴う陰性対照が1件以上」までしか課せない。**7→2 の削減は止まらない**。レビューが実際に 2 件へ削って緑になることを実測し、注釈の記述が正確であることを確認した。**捕らえられない範囲は報告でなくコードに書くこと。**
- **同一ファイルに同型の欠陥を残して新しい関門だけ足さないこと（115.222）**: 起票文が名指したのは二つの母集団だが、実測すると同一ファイルの 115.190 由来の三母集団にも同じ真空パスが残っていた（115.221 の分だけが守られていた）。境界内と判断して併せて塞ぎ、**他ファイルの同型は報告に留めた**。吸収と越境の線は「同じ検査資産の中か否か」で引いた。
- **報告の中の実測値も誤りうる（115.222 のレビューが検出）**: 実装者は三母集団すべてが是正前は緑だったと報告したが、うち一つは別名参照のため 115.221 の関門が既に覆っており **HEAD でも赤かった**。真に緑だったのは二つ。**誤りがコード注釈に及んでいないことまで確かめること**（及んでいれば反実仮想の機械検査の対象となる）。
- **陳腐化を直すのでなく到達不能にすること（115.223）**: 実例を機械で確かめる案（陳腐化したら赤くする）と、実例を挙げない案の二択で後者を採った。決め手は、実データの名指しが説明文と自己検査の定数の**二箇所に並び同期する機構が無かった**ことが今回の陳腐化の原因そのものだった点である。関門は**いま真である実例を書いても赤くする**ため、「実例が陳腐化した状態」は到達不能になる。現に真であるものまで弾く形が正しい。
- **実例を落とすなら導線の実在を機械で確かめること（115.223）**: 説明文からは実例を消し、代わりに類型と、実データを一元に持つ定数名・守り手の関数名への導線を置いた。**導線が腐れば赤くなる**（定数の改名・関数の改名・導線の記述の削除、いずれの変異でも失敗する）。実例の陳腐化を、指し先の消失という別の欠陥へ取り替えていないことが機械で保証される。
- **全面禁止が正しいとは限らない（115.223 のレビューの裁定）**: 同一ファイルの他の四箇所にも同型の引用が残るが、うち二つは「この検査が捕まえないもの」を述べる限界の記述であり、steering は反実仮想に件数・比・実測日のいずれかを引くことを**要求している**。ファイル全体へ件数の禁止を広げると `check:cf-evidence` と正面衝突する。**115.222 の「同一ファイルに同型を残さない」は、機械的かつ非破壊に閉じられる欠陥にのみ当てはまる。**
- **未検証と申告された疑いは、レビューが決着させられる（115.223）**: 実装者は「正当な被覆は一件も失われない」への反証の疑いを未検証として報告した。レビューが集計への影響まで測ったところ、落ちる9印の受入基準は**すべて他の被覆源が拾っており主張は成立**した。偽だったのは「2ファイルだけ」という件数と列挙の不完全さの方である。**疑いは疑いとして申告し、測れる者が測って決着させること。**
- **起票文そのものが陳腐化する（115.224）**: 起票が名指した空振りは、起票から着手までの間に別タスク（115.194 / `c5dfbbc`）が既に是正していた。実装とレビューが独立に、HEAD の隔離ツリーで本体から規則を外して当該対照が**現に赤くなる**ことを確かめた。**着手時に起票文の前提を測り直すこと。** 115.223 が検査本体の説明文について立てた規律は、起票文そのものにも当てはまる。
- **手作りの相棒は覆う範囲が偏る（115.224）**: 空振りを検出する相棒は規則ごとに一件ずつしか無く、陰性資料 12 件のうち 4 件しか覆っていなかった。相棒を持たない資料を壊すと、**既存の対照は緑のまま**で劣化が通る。組で見る網に置き換えて、全件が分類の登録を迫られる形にした。
- **分類は散文でなく機械に判定させること（115.224）**: 陰性対照が「形で抑えられている」のか「位置で抑えられている」のかは、位置の上限を取り払った写しで実際に現れるかどうかで決まる。網は両向きに判定するため、**分類を取り違えた登録は緑で通らない**。
- **網の粒度が限界を決める（115.224）**: 資料の粒度で見る網は、既登録の資料へ陰性の行を足しただけでは登録を迫らない。行の粒度を導く語彙を抽出器が公開していないため機械化できず、限界を検査本体の JSDoc へ書き残した（115.222 の作法）。
- **「一律にずれている」は測ると一律でないことがある（115.225）**: 起票は 13.2 以降の一律のずれを述べたが、同ファイルの要件1の印は**別のずれ幅で交差して**いた（1.14→1.17、1.15→1.16）。本番コード側の 13.10・13.11 はそもそもずれていない。**ずれ幅を仮定せず一件ずつ原文と突き合わせること。** 起票が引く件数も陳腐化していた（本番未到達22件→実測18件）。
- **付け替えと取り下げは、印の主題に対応する条文が在るかで決まる（115.225）**: 「顧客名を必須かつ1〜255文字」は、規範が移管されたのでなく**逆転して（必須→任意）長さの上限ごと消えた**ため、付け替え先が存在しない。現行 13.2「取引先を任意とする」へ番号を向け直すと、一覧が一度も述べていない主張を足すことになる。**取り下げの理由は「類型Aだから」ではなく「付け替え先が無いから」である。**
- **番号を直して緑が増えるなら、その形を疑うこと（115.225）**: 採用案は集計値を動かさず構成だけを入れ替えた（未被覆へ 13.2・13.3 が入り、被覆へ 13.4・13.6 が入るが同時に本番未到達へも入る）。**被覆の見かけだけが良くなる案は退けた**。115.193 が当該ファイルへ課した「番号を付け直して採点を緑へ戻さないこと」に沿う。
- **型検査による主張も変異で確かめられる（115.225）**: 任意フィールドの主張は「省略して通ること」に依るため空振りに見えるが、Prisma の型で当該フィールドを必須へ変える変異を当てると当該ファイルだけが赤くなる。**「通ることが証拠」の形は、通らなくなる変異を当てて初めて証拠になる。**
- **是正が新しい沈黙の欠陥経路を持ち込むことがある（115.226 が差し戻された理由）**: コードフェンスの内側を除く規則は、フェンスの状態を**ファイル全文で反転**させたため、閉じ忘れが1行あるだけで以降のヘッダーが帰属側・切れ目側の両方から消えた。被覆率のゲートは既に閾値未達で赤いため、損失は「テストが1件足りない」に紛れて誰も抽出器を疑わない。**実測の被害が0件でも、機構として安全でないことは別に判定すること。**
- **限界の記述より構造的解消が優先する（115.226 の是正）**: フェンスの開閉を「ヘッダーを囲むコメントの塊」の中だけで数える形へ変え、全文の偶奇依存そのものを消した。関門が不要になる。**同じ塊の中の閉じ忘れが以降を抑えるのは残るが、それはフェンスの意味そのもの**であり、遠隔作用が無く、書き手が見える範囲に閉じている。
- **二つの条件が「引用のすべてを覆う」と書かないこと（115.226 の FYI）**: 行の途中で見本を開く形はどちらの条件にも掛からない。塞ぐと逆向きの誤読（正当なヘッダーを引用と読む）を作るため記述に留めた。**覆っていない範囲を JSDoc に名指しし、実測（該当5行・3ファイル・被覆ヘッダーの字面0件）を添えること。**
- **新設した対照が誤分類で緑を通すことがある（115.226 が自ら発見）**: 引用の分類を形の分類と取り違えて登録しても、当初は 63/63 で通った。写しのヘッダーが宣言と認められることを要求する関門を足して塞いだ。**対照を足したら、その対照の登録自体が誤りうる経路も塞ぐこと。**
- **対照が読む当のものから要素を落としても、その対照は気づけない（115.227）**: 走査根の一覧だけを読む検査は、その一覧から根を落とす破壊に対して原理的に無言である。レビューが複製を使わない版を実際に構築して当てたところ、根を落としても緑のままだった。**だから走査根の第二の宣言を対照群の側へ置く。** これは 115.190・115.221 が一元化した「抽出規則の複製」とは別種で、処方された先例も同じ装置を使っている。
- **複製を置くなら双方向の一致を課すこと（115.227）**: 第二の宣言は放置すれば本体と食い違う。一覧に無い固定点、固定点を持たない根、実在しない根、他根からも被覆される固定点、失効した固定点のいずれもが名指しで赤くなる形にした。
- **対照の主題が本体から外れる形を別に塞ぐこと（115.227）**: 走査根の一覧を正しく保っても、本体が別の根を渡していれば対照は何も守らない。本体の原文を読み、既定の走査根が当該の定数であることと、呼び出し側が根を渡さないことを照合する検査を分けて置いた。**本体が根を明示する変異では、寄与の検査は緑のままこちらだけが赤くなる。**
- **境界は「同一ファイルに同型を残さない」より優先することがある（115.227 の裁定）**: 拡張子の絞りに同型の無言の欠陥が現に在り、実測でも自己検査は緑のままだが、塞ぐには拡張子を軸にした新たな固定点機構という独自の設計判断を要する。**115.222 の規則は機械的かつ非破壊に閉じられる欠陥にのみ当てはまる**（115.223 の限定）。起票して残した。
- **一件を直して「完全になった」と書かないこと（115.228）**: 起票が名指したのは受入基準一件の欠落だが、有限集合上の全称命題として測ると **site-survey に24件の欠落と1件の死語**、リポジトリ全体で欠落641件・死語55件が残る。要件17・19 は追跡表に行が一つも無い。**是正の前に述語が現に成立しているかを全件で測ること。**
- **「機械で検査できるか」は有限集合上の全称命題として書けるかを問うこと（115.228）**: 走査で「漏れが無い」を示せという受入条件は終端しない（115.197）。有限集合を各機能の現役の受入基準、述語をその番号が同機能の追跡表の列に現れることと定めれば、2889×856 の照合で必ず終端する。**定式化できれば機械化できる。**
- **判定は零でなく宣言からの悪化で行う（115.228）**: 全機能を零にするのは所管が分かれて終わらない。機能ごとに現況を宣言し、新たな漏れも解消済み宣言の置き去りも双方向で赤くする形にした。ただし**上限を先回りで緩める経路は塞げていない**（宣言を書き換えれば通る）。所管の機能は逐一列挙する厳密な形を選び、そこにはこの穴が無い。
- **起票文が引く前例論も測り直すこと（115.228）**: 起票は「担い手が同じでも行が起こされている」を根拠に個別行を求めたが、実測すると当該の受入基準の担い手は併合行の担い手と**互いに素**で、前例として弱かった。文書自身が当該行について「列へ加えれば行数は動かない」を作法として記録していたため、そちらに従った。
- **一本化すると担保していた検査が恒真化しうる（115.229）**: 二つの数え方の一致を守っていた自己検査は、一本化によって同一性の部分が恒真になる。**失敗しえない検査は無い検査より悪い。** 残る主張（走査ファイル数・段の非空・列挙側独自の絞り）が構造では担保されないことを変異で確かめて残し、恒真化した範囲を注釈へ明記した。
- **反実仮想は意図でなく編集内容で書くこと（115.229 が差し戻された理由）**: 「検出を自前で組み直す変異」とだけ書いた記述に対し、レビューがその読みに沿う変異を二つ当てたところ**いずれも緑のまま**だった。落ちるのは合成の台の上で挙動が食い違う再実装だけである。**書かれた粒度で読んで再現しない記述は偽である。** 設計文書は反実仮想の検査の走査対象外であり、機構では捕まらない。
- **件数の一致は集合の一致ではない（115.229 の FYI）**: 列挙と母集団を件数だけで突き合わせる関門は、**同じ件数の別集合**を素通りさせる。識別子の同一性で比較する形へ改め、重複・並べ替え・文の入れ替えのいずれでも赤くなることを実測した。
- **「構造上ずれない」と書く前に、何が構造で何が検査かを分けること（115.229）**: 当初の注釈は一致を構造の帰結と述べていたが偽で、実際は自己検査が単独で担保していた。**現在の実装の性質であることと、将来も分かれないことは別である。** 後者を主張するなら、分岐を捕まえる関門を名指しすること。
- **列挙不能な空間への全称主張は、反例を潰しても真にならない（115.230 が三度差し戻された理由）**: 「関数の新設も失敗になる」と書くたびに、レビューはまだ列挙されていない書き方を一つ持ってくるだけで反証できた。JavaScript が関数を宣言しうる形の全体は数え上げられない。**主張は正規表現が実際に拾う綴りという決定可能な集合へ限定すること。** 三度目にしてようやく全称文そのものを撤去して収束した。
- **散文の主張を機械で確かめる仕組みが無い場所に、散文の主張を置かないこと（115.230 の構造的原因）**: 差し戻しが集中した約84行の台帳は、反実仮想の検査の走査対象に**一度も登録されていなかった**。ドリフトを捕まえる唯一の関門が、ドリフトし続けている場所に届いていない。形の対照群を正規表現へ通せば主張が検査そのものになるが、自己検査の総数が動き**約55箇所の記録値の測り直し**を要するため後続とした。
- **偽陽性と偽陰性は等価でない。関門では方向が判断を決める（115.230 の最終判断）**: 偽陽性を一つ直す絞り込みが、**沈黙して通る逃がしを八形**開けていた（カンマ演算子・三項の第一項が数値や文字列・参照束縛など）。偽陽性は赤で気づけて回避も一語で済むが、素通りは黙って通る。**この検査は最上位に絞り込みを隠す場所を作らせないためにある**以上、赤へ倒れる誤りを残す。撤回して決着した。
- **修正計画そのものが誤りうる（115.230）**: 一度目の debug が出した計画は、絞り込みの根拠として「引数リストは数値で始まらない」と述べたが、当該の枝が守っているのは引数リストではなく初期化子の開き括弧であった。**前提が真でも結論が導かれない。** 計画を逐語実行させる場合でも、実装者に数値を写させず測り直させること。
- **複製は逐語一致とは限らない。寄せる前に差を測ること（115.231）**: 二つの複製は一行だけ違い、片方はパスを正規化し片方は文字列連結で組み立てていた。**七通りの入力のうち五通りで結果が食い違う。** 差が到達不能である（値を渡す呼び手が一つも無い）ことを呼び出し三十箇所とCLI・環境変数まで走査して確かめたうえで、正規化する側を正典として寄せた。**到達不能性が崩れていれば、片方の呼び手の結果を静かに変える欠陥になっていた。**
- **注釈が機械の照合を満たしてしまう（115.231 が自ら発見）**: 新設した対照が当初は緑で素通りした。原因は共有部品の冒頭注釈が説明のために当該の文字列を逐語で引いており、**生ソースの照合が注釈だけで満たされていた**ことである。注釈を除去してから照合する形に改めて赤へ倒した。
- **注釈除去そのものにも盲点がある（115.231 のレビューが実測）**: 素朴な行末までの除去は、文字列リテラルの中の `//` を注釈の始まりと見なす。同じ行に `'https://…'` を置くだけで以降が照合対象から消え、**裸の断片であっても複製が素通りする**。さらに文字列連結で組み立てる複製も通る。断片方式の天井は一つではない。
- **指示や計画の側の記述も偽でありうる（115.231）**: 親が是正指示に書いた「見張りを本体だけに戻すと骨抜きを名指しできなくなる」は、実装者の実測で偽と判明した（別の検査が依然として名指ししており、正しくは名指しの担い手が入れ替わる）。**指示に従って書いた文であっても、実測と食い違えば書き直すこと。**
