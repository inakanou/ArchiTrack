# Implementation Plan

- [x] 1. データベーススキーマとPrismaモデルの定義
- [x] 1.1 ConstructionScheduleおよびScheduleItemのPrismaモデルを追加する
  - ConstructionScheduleモデル: id, projectId, name, quantityTableId(nullable), version, createdAt, updatedAt, deletedAt を定義
  - ScheduleItemモデル: id, scheduleId, sourceType, sourceQuantityItemId(nullable), itemName, labelText, detailText, startDate, duration, displayOrder, isExportTarget を定義
  - ProjectモデルにconstructionSchedulesリレーションを追加
  - QuantityTableモデルにconstructionSchedulesリレーションを追加
  - QuantityItemモデルにscheduleItemsリレーションを追加
  - 適切なインデックス（project_id, deleted_at, schedule_id, display_order）を設定
  - _Requirements: 1.1, 1.3, 2.3, 3.1, 3.2, 4.2, 5.3, 9.1, 9.2, 10.1, 10.4, 11.1, 11.4_

- [x] 1.2 Prismaマイグレーションを作成して適用する
  - construction_schedulesテーブルとschedule_itemsテーブルの作成マイグレーション
  - 外部キー制約（ON DELETE CASCADE、ON DELETE SET NULL）の設定
  - isExportTargetのデフォルト値true、sourceTypeのデフォルト値'MANUAL'を設定
  - _Requirements: 1.3, 9.2_

- [x] 2. バックエンドZodバリデーションスキーマの定義
  - 工程表作成スキーマ: name(必須、1-200文字)、quantityTableId(任意)のバリデーション
  - 工程表更新スキーマ: name(必須、1-200文字)、version(必須)のバリデーション
  - バルク保存スキーマ: version(必須)、items配列（itemName必須1-500文字、labelText 0-200文字、detailText 0-500文字、startDate ISO日付形式null許可、duration正の整数null許可、displayOrder 0以上整数、isExportTarget boolean）のバリデーション
  - バルク保存スキーマのitems配列に最大200項目の制約を追加
  - エクスポートクエリスキーマ: format(xlsx|pdf)のバリデーション
  - 一覧クエリスキーマ: page, limit, sortBy, sortOrderのバリデーション
  - _Requirements: 1.3, 1.6, 3.4, 3.5, 12.1_

- [x] 3. バックエンド工程表サービスの実装
- [x] 3.1 工程表のCRUD操作を実装する
  - プロジェクトIDに基づく工程表一覧取得（ページネーション、ソート対応、論理削除除外）
  - 工程表IDに基づく詳細取得（項目一覧をdisplayOrder順で含む）
  - 工程表の新規作成（数量表なしの場合は空の工程表を作成）
  - 工程表の更新（名称変更、楽観的排他制御によるバージョンチェック）
  - 工程表の論理削除（deletedAtの設定、確認ロジック）
  - バージョン競合時のConflictエラーハンドリング
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 2.2, 5.4_

- [x] 3.2 数量表連携による項目自動取得を実装する
  - 工程表作成時にquantityTableIdが指定された場合、数量表のQuantityItemを取得
  - QuantityItemの情報をScheduleItemにスナップショットコピー（sourceType='QUANTITY_TABLE'、sourceQuantityItemId設定、itemNameコピー）
  - 数量表の項目順序（displayOrder）を保持してScheduleItemを生成
  - isExportTargetの初期値をtrueに設定
  - 指定された数量表が同一プロジェクトに属しない場合のバリデーションエラー
  - _Requirements: 2.1, 2.3, 2.4, 9.2_

- [x] 3.3 バルク保存（全項目一括更新）を実装する
  - 楽観的排他制御（version照合）
  - id=nullの項目は新規作成、既存IDの項目は更新
  - リクエストに含まれない既存項目は削除（差分削除方式）
  - トランザクション内でバッチ処理
  - 各項目のdisplayOrder、isExportTarget、labelText、detailText、startDate、durationを保存
  - 最大200項目までの登録を許可し、超過時はバリデーションエラーを返す
  - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 5.3, 9.5, 10.4, 11.4, 12.1_

- [x] 4. バックエンドAPIルートとカスタムエラーの実装
  - GET /api/projects/:projectId/schedules: 工程表一覧取得エンドポイント
  - POST /api/projects/:projectId/schedules: 工程表作成エンドポイント
  - GET /api/schedules/:id: 工程表詳細取得エンドポイント
  - PUT /api/schedules/:id: 工程表更新エンドポイント
  - PUT /api/schedules/:id/bulk-save: バルク保存エンドポイント
  - DELETE /api/schedules/:id: 工程表削除エンドポイント
  - GET /api/schedules/:id/export: エクスポートエンドポイント
  - authenticate + requirePermissionミドルウェアの適用（schedule:read/create/update/delete）
  - Zodバリデーションミドルウェアの適用
  - ScheduleNotFoundError、ScheduleConflictErrorのカスタムエラークラス定義
  - app.tsへのルート登録
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3_

- [x] 5. バックエンドサービスとAPIの単体テスト・統合テスト
- [x] 5.1 (P) ScheduleServiceの単体テストを作成する
  - 工程表CRUD操作のテスト（作成、取得、更新、削除）
  - 数量表連携テスト（数量表指定あり/なし）
  - バルク保存テスト（新規追加、更新、差分削除）
  - 楽観的排他制御テスト（バージョン競合時のエラー）
  - 論理削除テスト（deletedAtの設定と除外確認）
  - 最大200項目制約のバリデーションテスト
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 2.2, 2.3, 3.1, 3.2, 5.3, 9.2, 9.5, 12.1_

- [x] 5.2 (P) Zodバリデーションスキーマの単体テストを作成する
  - 各スキーマの正常系・異常系テスト
  - name文字数制限、duration正の整数、startDate形式、displayOrder範囲のバリデーション確認
  - items配列の最大200項目制約テスト
  - _Requirements: 1.6, 3.4, 3.5, 12.1_

- [x] 5.3 APIルートの統合テストを作成する
  - 全エンドポイント（GET/POST/PUT/DELETE）の統合テスト
  - 認証・認可エラーケースのテスト
  - 数量表連携を含む作成フローの統合テスト
  - バルク保存の統合テスト
  - 5.1, 5.2のテスト完了後に実施（サービスとスキーマの正当性を前提とする）
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4_

- [x] 6. フロントエンドAPI関数と状態管理フックの実装
- [x] 6.1 工程表API関数を実装する
  - 工程表一覧取得、詳細取得、作成、更新、削除のAPI関数
  - バルク保存API関数
  - 数量表一覧取得API関数（既存APIの利用）
  - エクスポートAPI関数（ファイルダウンロード対応）
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1, 8.1_

- [x] 6.2 useScheduleState フックを実装する
  - 工程表項目のState管理（追加、削除、更新、並び替え）
  - 着工日と日数から完了日を自動算出するロジック
  - 着工日未入力時のバリデーション、日数0以下のバリデーション
  - dirty state管理（未保存変更の追跡）
  - 保存ボタン押下時のバルク保存API呼び出し
  - useReducerによる最適化で200項目時のstate更新パフォーマンスを確保
  - _Requirements: 3.3, 4.1, 4.2, 4.3, 4.4, 5.2, 6.1, 6.6, 12.1_

- [x] 6.3 (P) useHolidayCalendar フックを実装する
  - @holiday-jp/holiday_jpの依存関係追加
  - 指定期間の祝日データ取得とHolidayMapの生成
  - 土曜日・日曜日・祝日の判定関数
  - useMemoによる祝日データのメモ化
  - _Requirements: 6.2, 6.3, 6.4_

- [x] 7. フロントエンド工程表一覧画面の実装
  - ScheduleListPageの作成（既存ContractListPageパターン踏襲）
  - プロジェクトに紐付く工程表一覧の表示（名称、数量表名、項目数、作成日時）
  - 新規作成ボタンの配置
  - 工程表選択による詳細画面へのナビゲーション
  - 削除ボタンと確認ダイアログの実装
  - ルーティング設定の追加
  - _Requirements: 1.1, 1.2, 1.4, 1.5_

- [x] 8. フロントエンド工程表作成フォームの実装
  - ScheduleFormダイアログの作成
  - 工程表名称の入力フォーム
  - 同一プロジェクトの数量表選択肢の表示（数量表なしの選択も可能）
  - 作成ボタン押下時のAPI呼び出しと工程表詳細画面への遷移
  - 保存失敗時のエラーメッセージ表示と入力内容保持
  - _Requirements: 1.2, 1.3, 1.6, 2.1, 2.2, 2.3_

- [x] 9. フロントエンド工程表詳細・編集画面の実装
- [x] 9.1 ScheduleDetailPageと項目入力行を実装する
  - 工程表詳細画面のレイアウト（項目一覧エリアとガントチャートエリアの並列配置）
  - ScheduleItemRow: 項目名、ラベル文字、詳細文字、着工日、日数、出力対象チェックボックスの入力欄
  - 数量表由来項目と任意項目の混在表示
  - 着工日未入力時のバリデーションメッセージ、日数0以下のバリデーションエラー表示
  - 任意項目の追加ボタンと削除ボタン
  - 保存ボタンによるバルク保存呼び出し
  - _Requirements: 1.4, 2.4, 3.1, 3.2, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 9.1, 9.2, 10.1, 11.1_

- [x] 9.2 SortableScheduleListによる並び順管理を実装する
  - HTML5 Drag and Dropまたは軽量ライブラリによるドラッグ&ドロップ並び替え
  - 数量表由来・任意項目を問わず全項目の並び順変更
  - 並び順変更時のリアルタイム画面反映
  - 保存時に並び順をデータベースに永続化
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 10. ガントチャートコンポーネントの実装
  - GanttChartPanelのカスタムReactコンポーネント実装（HTML/CSSベース、外部ライブラリ不使用）
  - 全項目の着工日〜完了日範囲から表示期間を自動算出
  - 日付列ヘッダー（年月日表示）の生成
  - 各項目のバーをCSS positionで配置
  - 土曜日・日曜日・祝日をそれぞれ異なる背景色で色分け表示
  - ラベル文字を左列に表示
  - 詳細文字をバーの上に表示
  - 着工日・日数の入力変更時にフロントエンド処理のみでリアルタイム更新（サーバー通信なし）
  - 入力変更から表示更新までを200ミリ秒以内に完了する
  - ラベル文字・詳細文字の変更時もリアルタイムで表示更新
  - 出力対象チェックがOFFの項目もガントチャート上に表示を維持
  - CSS containment + useMemoによる差分計算で200項目時のスムーズ描画を実現
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 9.6, 10.2, 10.3, 11.2, 11.3, 12.2_

- [x] 11. Excel出力機能の実装
- [x] 11.1 ScheduleExportServiceのExcel出力ロジックを実装する
  - xlsxライブラリを使用した.xlsx形式ファイル生成
  - ヘッダーにプロジェクト名と自社名（CompanyInfoから取得）を含める
  - isExportTarget=trueの項目のみ出力対象としてフィルタ
  - 各項目の着工日・日数・完了日をセルに出力
  - ラベル文字を左列セルに配置
  - 日付列をセルとして展開し、バー期間に該当するセルに背景色を設定してガントチャートを再現
  - 詳細文字をバー先頭セルにテキストとして配置
  - 土日祝に対応するセルの背景色を変更
  - 出力処理失敗時はエラーメッセージをフロントエンドに返却する
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 9.3, 9.4, 10.5, 11.5, 12.3_

- [x] 11.2 (P) Excel出力エンドポイントとの統合
  - GET /api/schedules/:id/export?format=xlsxからScheduleExportServiceの呼び出し
  - Bufferをレスポンスとして返却し、フロントエンドでファイルダウンロード
  - _Requirements: 7.1_

- [x] 12. PDF出力機能の実装
- [x] 12.1 ScheduleExportServiceのPDF出力ロジックを実装する
  - jsPDFライブラリを使用したPDF形式ファイル生成
  - A4横向き（ランドスケープ）レイアウト
  - ヘッダーにプロジェクト名と自社名（CompanyInfoから取得）を含める
  - isExportTarget=trueの項目のみ出力対象としてフィルタ
  - 各項目の着工日・日数・完了日をテーブル行として出力
  - ラベル文字をバー左側のテキスト領域に配置
  - rect()による矩形描画でガントチャートのバーを再現（1日あたりの幅を定数で定義、着工日からのオフセットでX座標算出）
  - 詳細文字をバー矩形の上にtext()で配置
  - 土日祝列に薄い背景色の矩形を全行にわたって描画
  - 日本語フォントの対応（既存見積書PDF出力パターンに従う）
  - 出力処理失敗時はエラーメッセージをフロントエンドに返却する
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.3, 9.4, 10.5, 11.5, 12.4_

- [x] 12.2 (P) PDF出力エンドポイントとの統合
  - GET /api/schedules/:id/export?format=pdfからScheduleExportServiceの呼び出し
  - Bufferをレスポンスとして返却し、フロントエンドでファイルダウンロード
  - _Requirements: 8.1_

- [x] 13. フロントエンド出力ダイアログの実装
  - ExportDialogコンポーネントの作成（Excel/PDF形式選択）
  - Excel出力ボタンとPDF出力ボタンの配置
  - ボタン押下時のエクスポートAPI呼び出しとファイルダウンロード処理
  - 出力中のローディング表示
  - 出力失敗時のエラーメッセージ表示と再試行ボタンの提供
  - _Requirements: 7.1, 7.6, 8.1, 8.6_

- [x] 14. エクスポートサービスの単体テスト
- [x] 14.1 (P) Excel出力ロジックの単体テストを作成する
  - プロジェクト名・自社名のヘッダー出力確認
  - 出力対象フィルタ（isExportTarget=true/false）の動作確認
  - 項目情報（着工日・日数・完了日・ラベル文字・詳細文字）の出力確認
  - ガントチャート再現（セル背景色、項目名・バー・土日祝色分け）の確認
  - 出力失敗時のエラーハンドリング確認
  - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 9.3, 9.4, 10.5, 11.5_

- [x] 14.2 (P) PDF出力ロジックの単体テストを作成する
  - プロジェクト名・自社名のヘッダー出力確認
  - 出力対象フィルタ（isExportTarget=true/false）の動作確認
  - 項目情報（着工日・日数・完了日・ラベル文字・詳細文字）の出力確認
  - ランドスケープレイアウトの確認
  - ガントチャート再現（項目名・バー・土日祝色分け）の確認
  - 出力失敗時のエラーハンドリング確認
  - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 9.3, 9.4, 10.5, 11.5_

- [x] 15. フロントエンドコンポーネントの単体テスト
- [x] 15.1 (P) useScheduleStateフックの単体テストを作成する
  - 項目追加・削除・更新のState変更テスト
  - 完了日自動算出ロジックのテスト
  - dirty state管理のテスト
  - バリデーションロジック（着工日未入力、日数0以下）のテスト
  - _Requirements: 3.3, 3.4, 3.5, 4.1, 4.3_

- [x] 15.2 (P) useHolidayCalendarフックの単体テストを作成する
  - 祝日判定の正確性テスト
  - 土曜日・日曜日判定のテスト
  - メモ化動作の確認
  - _Requirements: 6.2, 6.3, 6.4_

- [x] 15.3 (P) GanttChartPanelの単体テストを作成する
  - バー位置の描画テスト
  - 土日祝の色分け表示テスト
  - ラベル文字・詳細文字の表示テスト
  - 表示期間の自動調整テスト
  - 出力対象チェックOFFの項目もガントチャート上に表示されることの確認
  - _Requirements: 6.1, 6.5, 6.7, 9.6, 10.2, 11.2_

- [x] 16. エクスポート統合テストとE2Eテスト
- [x] 16.1 エクスポートAPIの統合テストを作成する
  - GET /api/schedules/:id/export?format=xlsx のテスト
  - GET /api/schedules/:id/export?format=pdf のテスト
  - 認証・認可エラーケースのテスト
  - 出力対象フィルタリングの統合確認
  - 出力失敗時のエラーレスポンス確認
  - _Requirements: 7.1, 7.6, 8.1, 8.6, 9.3_

- [x] 16.2 E2Eテストを作成する
  - 工程表一覧の表示・ナビゲーション
  - 工程表の新規作成（数量表連携あり/なし）
  - 項目入力（着工日、日数）とガントチャートリアルタイム更新の確認
  - 任意項目の追加・削除
  - 並び順の変更と保存
  - 出力対象チェックボックスの操作
  - ラベル文字・詳細文字の入力と表示確認
  - Excel/PDF出力のダウンロード
  - 出力失敗時のエラーメッセージ表示と再試行操作の確認
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 7.1, 7.6, 8.1, 8.6, 9.1, 9.3, 10.1, 10.2, 11.1, 11.2_

## タスク17: 除外一覧が名乗る検証道具名を実体へ揃える

**経緯**: site-survey の Task 115.213 が設計文書に滞留していた未起票の提案を台帳化し、その `### 判定の一覧` の行7「他機能スペックの除外一覧の Jest 道具名」を**後続タスクへ送る**と裁定した。site-survey の Task 115.238 が申し送りを実行して本節を起こした。**所有権は本スペックにある。** site-survey は自機能分 32 件を Task 115.121 で既に Vitest へ改めており、現場調査スペックの所管は 0 件である。

**測った事実**（いずれもコミット `9e63637`、2026-09-02 にリポジトリルートで実測）:

- **本リポジトリに Jest は存在しない。** `find . -name 'jest.config*' -not -path '*/node_modules/*' | wc -l` の出力が `0`。`package.json` / `backend/package.json` / `frontend/package.json` の依存に `jest` は無く、名前に jest を含むのは `frontend/package.json` の `@testing-library/jest-dom`（Vitest から使う照合子の集まりであって走者ではない）だけである
- **単体・統合の走者は backend / frontend とも Vitest である。** 両者の `npm test` はいずれも `vitest run` であり、`backend/vitest.config.ts` / `backend/vitest.integration.config.ts` / `frontend/vitest.config.ts` が実在する
- **利用の実測**: `grep -rlE "from ['\"]vitest['\"]" backend/src frontend/src --include=*.ts --include=*.tsx | wc -l` の出力が `757` である。**同じ走査根・同じ glob** で `grep -rlE "from ['\"]@jest/globals['\"]|\bjest\.(fn|mock|spyOn)\(" backend/src frontend/src --include=*.ts --include=*.tsx | wc -l` を測ると出力は `0` である。**総数 `757` を併記するのは、`0` だけでは「走査根を読めていない」場合と区別できないためである**——同じ式を実在しないパスへ当てても出力は同じく `0` になる（2026-09-02 に実測）
- **提案が生きていること**: `node -e "const j=require('./e2e/requirement-exclusions.json');const k=j.exclusions.filter(e=>/Jest/.test(e.alternativeVerification.tool));console.log(k.length, k.filter(e=>e.id.startsWith('site-survey/')).length)"` の出力が `64 0`（後の `0` が現場調査スペックの分）
- **機械保証は無い。断定でなく変異で示す**（115.235 の作法）: `e2e/requirement-exclusions.schema.json` は `tool` を `{ "type": "string", "minLength": 1 }` としか定めず、道具の実在を見ない。実在しない道具名 `Kaboomtest 9000 / Nonexistent Runner` へ一件を差し替える変異を当てても `npm run check:req-exclusions` は 205 件を検査して終了コード 0 のままである（2026-09-02 に実測。変異は複製からの書き戻しで復元し、blob ハッシュが `HEAD` と一致することで確かめた）

**是正すると別の関門が赤くなる。着手前に読むこと**: 上の `node -e` の出力 `64 0` は `scripts/design-measurements.json` の宣言 `jest-alternative-verification-exclusions` に固定されており、`.kiro/specs/site-survey/design.md` の台帳の再現コマンド 5 の行と双方向で突き合わされる。**一件でも道具名から Jest を落とすと `npm run check:design-measurement-freshness` が「expected=`64 0` actual=`63 0`」として終了コード 1 で落ちる**（`company-info/REQ-6.9` の道具名を実在しない `Kaboomtest 9000 / Nonexistent Runner` へ差し替える変異を実際に当てて実測。2026-09-02、コミット `9e63637` にリポジトリルートで実測。変異は事前複製からの `cp` で復元し、`git hash-object e2e/requirement-exclusions.json` が `HEAD` の blob `77d4bb8443f19bc5c2de768c866eae1943175a6d` と一致することで確かめた）。宣言の解除と台帳の追随は**現場調査スペックの Task 115.280 が所管する**。

**同じ変異を当てたまま測った他の関門の実測**（走査の範囲は日本語でなくコマンドで宣言する。2026-09-02、コミット `9e63637` にリポジトリルートで実測）: 測ったのは `npm run` に与える名で `check:req-exclusions` / `check:req-exclusions:selftest` / `check:req-coverage` / `check:trace-coverage` / `check:design-refs` / `check:design-code-refs` / `check:design-path-refs` / `check:cf-evidence` / `check:steering-refs` / `check:steering-idents` / `check:steering-test-tree` / `lint` / `type-check` / `format:check` の **14 本**である。**いずれも基線と同じ終了コードのままであった。ただし `check:req-coverage` は基線から既に終了コード 1 であり（到達被覆 2632/2684 = 98.1%、未カバー 215 件）、変異の前後で変わらない**——「14 本が緑のままであった」のではない。**終了コードが動かないことと出力が動かないことも別である**: 14 本のうち 13 本は基線と出力まで一致したが、`check:req-coverage` だけは除外一覧の監査の内訳が「リポジトリ外の代替検証: 32件 / リポジトリ内検証あり: 22件」から「33件 / 21件」へ変わる（差分はこの 2 行のみで、終了コードも被覆率も動かない）。**着手時にはこの 14 本と `check:design-measurement-freshness` を自分で測り直し、実測日とコミットハッシュを添えること**（115.212 の規約）。

**是正先**:

1. `e2e/requirement-exclusions.json` の下表の `alternativeVerification.tool`
2. 本スペックの設計文書——**ただし実測では該当が 0 件である。** `for f in .kiro/specs/*/design.md; do printf '%s %s\n' "$f" "$(grep -c Jest "$f")"; done` を走らせると、`Jest` を挙げる設計文書は 13 スペックのうち `site-survey` の 1 件（6 箇所）だけで、他の 12 スペックはいずれも `0` である（2026-09-02 に実測）。台帳の行7 は是正先に「各機能スペックの設計文書」を挙げているが、起票の時点で当たりが無い。**この `0` は着手時に測り直すこと**

**本スペックの所管は 4 件で、全件を次に挙げる**（2026-09-02 に実測。抜き取りではない）:

| id | 現在の `alternativeVerification.tool` |
|---|---|
| `construction-schedule/REQ-7.6` | `Jest / Vitest with mock` |
| `construction-schedule/REQ-8.6` | `Jest / Vitest with mock` |
| `construction-schedule/REQ-12.3` | `k6 / Jest with timer` |
| `construction-schedule/REQ-12.4` | `k6 / Jest with timer` |

- [x] 17.1 除外一覧の道具名を実体へ揃える
  - 上表 4 件の `alternativeVerification.tool` から、実在しない `Jest` を取り除く
  - **先例に揃えること**: site-survey は Task 115.121 で自機能分 32 件を「道具名の先頭 `Jest` を `Vitest` へ置換し、`React Testing Library` / `Supertest` などの併記部分は据え置く」形で是正した。`.kiro/specs/site-survey/design.md` の `**あわせて是正した除外一覧の記述**` に続く項が、その形を逐語で記録している
  - **`Jest / Vitest with mock` の 2 件は、`Jest` を落とすだけで `Vitest with mock` になる。** 先頭を置換すると `Vitest / Vitest with mock` という重複になるため、置換ではなく除去であること
  - **`k6 / Jest with timer` の 2 件は併記の側も確かめること。** `k6` は npm の依存ではなく単体の実行体であるため、`package.json` に無いことは不在の証明にならない（root / backend / frontend のいずれの依存にも `k6` は無く、backend の負荷試験の走者は `autocannon@^8.0.0` である。2026-09-02 に実測）。**負荷試験を実際に走らせている道具を測ってから書くこと**
  - **道具名だけを機械的に置換して終えないこと。** 除外は受入基準を分母から丸ごと外すため、`description` が約束する代替検証が現に存在するかを一件ずつ確かめること。存在しないなら道具名の是正ではなく除外の取り下げが要る
  - **JSON の整形は `npm run format:check` では見られない。** リポジトリルートの `format:check` は `prettier --check "e2e/**/*.{js,ts}" "playwright.config.{js,ts}" "scripts/**/*.ts"` であって JSON を含まず、`lint-staged` も `*.{js,ts}` だけを対象とする（2026-09-02 に実測）。`npx prettier --check e2e/requirement-exclusions.json` を直接走らせること（現況は整形済みで終了コード 0。同日に実測）
  - **検証**: `npm run check:req-exclusions` が緑であること、および上の `node -e` の出力の第一値が本スペックの件数だけ減っていること
  - **本節が `_Requirements:` を持たないのは意図である。** 本スペックの tasks.md は HEAD（コミット `9e63637`）で `_Requirements:` を 30 件持ち、`_Depends:` と `_Boundary:` はいずれも 0 件である（`git show HEAD:.kiro/specs/construction-schedule/tasks.md | grep -c '_Requirements:'` ほか。2026-09-02 にリポジトリルートで実測）。**本節は受入基準を実装せず、除外一覧の記録の道具名を実体へ揃えるだけである。** 上表の id を `_Requirements:` に挙げると「当該受入基準を本タスクが被覆した」という偽の申告になり、被覆の集計にも入りうるため、依存と境界だけを書く
  - _Depends: site-survey スペックの Task 115.280（`64 0` の宣言の解除と台帳の追随）、18.1、18.2、18.3_
  - **18 の完了後に着手すること**（2026-09-29 の起票で追加）。道具名は 18.1〜18.3 が実際に置いた検証の走者に合わせる。`Jest / Vitest with mock` の 2 件は `Jest` を除去する形を基本とするが、18.1 / 18.2 の検証の実体と食い違うなら実体に合わせること。`k6 / Jest with timer` の 2 件は、18.3 の検証の走者名へ改めること
  - **利用者の判断（2026-09-29）: REQ-7.6 / 8.6 は E2E を追加して除外を取り下げる。REQ-12.3 / 12.4 は除外を残し、道具名を 18.3 の検証の走者（Vitest）へ揃える**
  - **除外理由の見直しが要る（18.1 のレビューの所見。2026-09-29）**: REQ-7.6 / 8.6 の除外は理由を「出力失敗のシミュレーションはE2E範囲外」とするが、Playwright の `page.route` で export API を 500 にすれば E2E で前提を作れる（前例: `e2e/specs/site-surveys/site-survey-bulk-export.spec.ts` の `route.fulfill({ status: 500 })`）。**道具名の是正だけで終えず、`e2e/specs/schedules/construction-schedule-e2e.spec.ts` へ「500 → 再試行ボタン → route 解除 → ダウンロード」の E2E を足して除外を取り下げるかを判断すること**。取り下げるなら道具名の是正は不要になる
  - _Boundary: 本スペックが所管する除外項目の `alternativeVerification.tool`_

## タスク18: 除外一覧が約束する代替検証の欠落を埋める

**経緯**: Task 17.1 の着手時（2026-09-29、HEAD `cab8d05e`）に、除外 4 件の `description` が約束する代替検証を一件ずつ確かめたところ、**道具名の是正では済まない欠落**が見つかった。17.1 の注意書き「存在しないなら道具名の是正ではなく除外の取り下げが要る」に当たる。利用者の判断（2026-09-29）により、除外は残したまま欠けた検証と実装を本節で補い、その後に 17.1 で道具名を実体へ揃える。

**測った事実**（2026-09-29、HEAD `cab8d05e`、リポジトリルート）:

- **REQ-7.6 / 8.6（出力失敗時の再試行の促し）**: `frontend/src/components/schedule/ExportDialog.test.tsx` に失敗時のエラー表示の検証が 2 本ある（fetch の reject と `ok:false`/500。いずれも既定の xlsx 形式）。一方で、
  - `frontend/src/components/schedule/ExportDialog.tsx` に**再試行の操作が無い**（`grep -nE '再試行|retry|Retry'` の当たりが 0）。design.md の ExportDialog の項は「出力失敗時はエラーメッセージを表示し、再試行ボタンを提供（Req 7.6, 8.6）」と定めており、**実装が設計に届いていない**
  - PDF 形式を選んで失敗させる検証が無い
  - backend の出力処理そのものが失敗したときに 500 を返す検証が無い（`schedules.routes.test.ts` の export は 200 / 400 / 404 のみ。design.md の「Export Errors (500)」の項に対応する検証が無い）
- **REQ-12.3 / 12.4（200 項目の Excel / PDF 出力が 30 秒以内）**: **検証がリポジトリに存在しない。** k6 のスクリプト・設定は `git ls-files` に無く、`backend/performance/*.perf.ts`（autocannon、6 本）に工程表の出力を測るものは無い。工程表まわりのテストに `performance.now` / fake timers / 所要時間の閾値による計測は無い

- [x] 18.1 出力ダイアログに再試行の操作を実装し、失敗時の促しを形式ごとに検証する
  - design.md の ExportDialog の項どおり、出力失敗時にエラーメッセージとともに**再試行ボタン**を提示する。再試行は直前に選んだ形式で出力をやり直すこと
  - 挙動の追加であるため、RED（再試行の検証が落ちる）→ GREEN の順に進めること
  - Excel と PDF の**両形式**で、失敗時にエラーメッセージと再試行の操作が現れ、再試行で出力が再度要求されることを検証する
  - 既存の 2 本（エラー表示）の検証を消さないこと
  - _Requirements: 7.6, 8.6_
  - _Boundary: `frontend/src/components/schedule/ExportDialog.tsx` とその検証_

- [x] 18.2 (P) backend の出力処理が失敗したときに 500 を返すことを検証する
  - design.md の「Export Errors (500)」の項に対応する。Excel / PDF の生成処理が失敗したとき、export のエンドポイントが 500 とエラーの応答を返すことを検証する
  - 現状の実装が既に 500 を返すなら検証の追加だけでよい。返さないなら実装を設計へ揃えること（その場合は RED → GREEN）
  - _Requirements: 7.6, 8.6_
  - _Boundary: 工程表の export ルートの失敗経路とその検証_

- [x] 18.3 (P) 200 項目の工程表の Excel / PDF 出力が 30 秒以内に完了することを計測で検証する
  - 200 項目の工程表を用意し、Excel 出力・PDF 出力それぞれの所要時間を**単調時計**（`performance.now()` 等）で測り、30 秒以内であることを主張する検証を置く。WSL2 では壁時計が単調時計より遅れるため `Date.now()` で測らないこと
  - 置き場所（サービス単位の Vitest か、統合テストか、`backend/performance/` の負荷試験か）は、既存の検証の構成と実行時間を見て決め、理由を報告に書くこと。**通常の `npm test` の所要時間を大きく延ばさないこと**
  - 検証が意味を持つこと（例: 閾値を極端に小さくする変異で赤くなること）を実測で示すこと
  - **設計の記述との食い違いを併せて扱うこと（18.2 のレビューの所見。2026-09-29）**: design.md の Performance & Scalability の節は Excel / PDF 出力を「バックエンドでのストリーミング生成」とするが、実装（`backend/src/routes/schedules.routes.ts` の export）は `Promise<Buffer>` の一括生成である。真にストリーミングにするとヘッダー送信後の失敗で 500 を返せず「Export Errors (500)」と両立しないため、**実装ではなく設計の記述を現況へ揃える**のが妥当。規約 (a)（歴史の記述は書き換えず現況を併記）に従うこと
  - _Requirements: 12.3, 12.4_
  - _Boundary: 工程表の出力の所要時間の検証_

- [x] 18.4 PDF 出力を複数ページに対応させ、全工程項目とガントチャートの全期間を含める
  - **経緯**: 18.3 の実装とレビュー（2026-09-29、HEAD `de2472f1`）が、PDF の描画の欠落を実測で確かめた。`backend/src/services/schedule-export.service.ts` の `drawPdfItemRows` は 1 ページに収まる行で `break` し（注記「本バージョンでは1ページに収まる範囲のみ描画」）、`addPage` を持たない。200 項目の工程表を本物の jsPDF で出力すると **1 ページ・17 項目（ITEM-001〜ITEM-017）** だけが描かれる。**横方向も切れる**: 固定列 111mm・日付列 5mm/日のため A4 横に入るのは約 35 日分で、それを超える期間の列とバーはページの外に描かれる
  - **要件との食い違い**: Requirement 8 の受入基準 4（PDF に全工程項目の着工日・日数・完了日を含める）と受入基準 5（ガントチャートを含める）に反する。18.3 の PDF の所要時間の計測は、現状は 1 ページ分の描画時間でしかない
  - 縦方向: ページの下端で改ページし、改ページ後に表のヘッダーと土日祝の背景をページごとに描き直すこと
  - 横方向: **利用者の判断（2026-09-29）により、全期間が 1 ページ幅に収まるよう日付列の幅（縮尺）を合わせる**。期間でページを分割しない。design.md へ規約 (a) の形で併記すること
  - 挙動の修正であるため RED → GREEN で進めること。200 項目の PDF から ITEM-001〜ITEM-200 がすべて抽出できること・ページ数が 2 以上であること・全期間のバーが描かれることを主張し、現状の実装で赤になることを先に示す
  - **18.3 の PDF の計測を強めること**: 同じ検証で 200 項目すべてが含まれることを主張したうえで 30 秒以内を測り直し、テストの注記「本検証の範囲外として別途扱う」を外す。design.md の「PDF の実測は 1 ページ分」の併記にも現況を再実測して並べる
  - _Requirements: 8.4, 8.5, 12.4_
  - _Boundary: `schedule-export.service.ts` の PDF 描画とその検証、design.md の PDF 出力の記述_

- [x] 18.5 PDF 出力に日本語フォントを埋め込み、日本語の文字列が読めることを検証する
  - **経緯**: 機能レベル検証（2026-09-29、HEAD `c141d0e5`、NO-GO）が、実際の API で出力した PDF を画像化して**日本語が文字化けする**ことを確かめた（プロジェクト名「SMOKE-工程表検証」が「S M O K E -]åz ˆhi Š<」になる）。`backend/src/services/schedule-export.service.ts` に `addFileToVFS` / `addFont` が無く、jsPDF の標準フォントのまま描いている。Task 12.1 の注記「日本語フォントの対応（既存見積書PDF出力パターンに従う）」と design.md の Risks 欄が約束する埋め込みが実装されていないまま、12.1 は `[x]` になっていた（`20e673e3` より前の版にもフォント処理は無く、18.4 が起こしたものではない）。Excel は正常
  - **既存の検証が空振りしていた**: `schedule-export.service.test.ts` の REQ-8.2 / 8.3 の検証は `buffer.length > 0` しか主張しておらず、文字化けを検出できない
  - 日本語フォント（Noto Sans JP 等）を埋め込み、プロジェクト名・自社名・表の見出し・項目名・ラベル・詳細文字・日付見出しをそのフォントで描く。フォントの持ち方は既存の見積書 PDF（`frontend/src/services/export/PdfFontService.ts`）のパターンに従う。**backend から frontend のソースを取り込まないこと**（パッケージを越えた読み出しは Docker で壊れる）。backend 側でのフォントの配置と読み込み方（ファイル・バンドルの大きさ・起動時の読み込み）を決め、design.md へ規約 (a) の形で併記すること
  - 挙動の修正であるため RED → GREEN で進めること。PDF からテキストを抽出して（例: pdfjs）日本語のプロジェクト名・自社名・項目名・詳細文字がそのまま読めることを主張し、現状で赤になることを先に示す。REQ-8.2 / 8.3 の空振りの検証をこの主張へ改める
  - 18.3 / 18.4 の PDF の検証（ASCII の `ITEM-nnn` を PDF のバイト列から拾う）が、フォントの埋め込み（文字の符号化の変化）で壊れないか確かめ、壊れるなら抽出方法を併せて改めること。30 秒以内の計測も取り直す
  - 縮尺を合わせた後にバーが短いと詳細文字が「..」に潰れる件（検証の警告）は、本タスクの範囲外とする
  - _Requirements: 8.2, 8.3, 8.4, 10.5, 11.5_
  - _Boundary: `schedule-export.service.ts` の PDF のフォントとその検証、backend のフォントの配置、design.md の PDF 出力の記述_

## タスク19: 部品のインラインの outline の打ち消しを外し、フォーカス表示を steering の方針へ揃える（project-management の Task 75.2 からの申し送り。利用者の判断で起票、2026-10-08）

**経緯**: project-management の Task 73.5 が steering `.kiro/steering/tech.md` に「フォーカス表示方針」を記録した（全画面の既定のフォーカス表示は `frontend/src/index.css` の `@layer base` の `:focus-visible`。部品の側でインラインの `outline: 'none'` を書かない。独自の輪を描く場合は 2px 以上・コントラスト比 3:1 以上。是正は各機能のスペックの責務）。同スペックの Task 75.2（2026-10-08、HEAD `c8036acd`）の実測で、本スペックの部品・ページに、方針から外れたインラインの `outline: 'none'` が 3 か所残っている

- [x] 19.1 本スペックの部品・ページのインラインの `outline: 'none'` を外し、フォーカス表示を 2px 以上・3:1 以上にする
  - 対象（2026-10-08 の実測。着手時に `grep -rnE "outline: ?['\"]none['\"]"` で測り直すこと）:
    - `frontend/src/components/schedule/ScheduleForm.tsx`（3 か所）
  - インラインの `outline: 'none'` を外し、共通の輪に一本化する（project-management の Task 73.6、trading-partner-management の Task 33.1 の前例）。自前の影の輪など、代わりの表示が 3:1 に届かないものも同じ変更で外すか強める。対象の画面のフォーカスを受ける要素を、`e2e/specs/trading-partners/trading-partner-focus-visible.spec.ts` と同じ判定（実線または影の輪が 2px 以上・背景とのコントラスト比 3:1 以上・フォーカスが離れたら消える）で網羅して測り、満たさないものをまとめて直す
  - 挙動（表示）の変更であるため RED → GREEN で進め、単体（インラインで outline を打ち消さないこと）と E2E（対象の画面の Tab の一巡）で主張する。要件にフォーカス表示を定める受入基準が無い場合、`@requirement` の印は掲げない
  - _Boundary: 本スペックの部品・ページのフォーカス時の表示_
