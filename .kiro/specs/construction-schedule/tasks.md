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

## タスク20: 工程表あたり最大 200 項目の上限が実装されていない状態を正す（機能レベル検証の NO-GO。利用者の判断で起票、2026-10-09）

**経緯**: Task 19.1 の完了後の機能レベル検証（2026-10-09、HEAD `218951e6`、NO-GO）が、要件 12 の受入基準 1（1 つの工程表あたり最大 200 項目までの登録をサポートする）の上限が実装されていないことを実測で確かめた。テスト・関門・E2E はすべて緑で、19.1 による後退ではない（初期実装から残っている）。

**測った事実**（2026-10-09、HEAD `218951e6`）:

- tasks.md の Task 2（「items配列に最大200項目の制約」）・3.3（「超過時はバリデーションエラーを返す」）・5.1 / 5.2（「最大200項目制約のテスト」）と design.md の「バルク保存: … 最大200項目（Req 12.1）」が上限を約束し、いずれも `[x]` である
- `backend/src/schemas/schedule.schema.ts` の 200 行付近の `items: z.array(bulkSaveScheduleItemSchema)` に `.max(200)` が無く、`schedule.service.ts` と `schedules.routes.ts` にも項目数の確かめが無い。`bulkSaveScheduleItemsSchema.safeParse` は 200 件・201 件・1000 件のいずれも `success: true` を返した
- `schedule.schema.test.ts` と `schedule.service.test.ts` に項目数の上限の検証が無い（「201」の当たりは name / labelText の文字数の検証だけ）
- `ScheduleService` の数量表からの作成は、数量表の項目をそのまま写す。数量表の項目が 200 を超える場合の扱いは設計に定めが無い
- 除外一覧 `e2e/requirement-exclusions.json` の `construction-schedule/REQ-12.1` は代替検証の道具を「k6 / Artillery」と名乗るが、リポジトリに無い（Task 17.1 が 12.3 / 12.4 で是正したのと同じ型）。200 項目を保存できることの検証も無い
- 同じく `REQ-6.7` と `REQ-12.2` の代替検証は「Chrome DevTools / Lighthouse」の手動の計測で、リポジトリの中に検証が無い（検証の警告）

- [x] 20.1 バルク保存の項目数に 200 の上限を設け、超過を 400 で拒む
  - `bulkSaveScheduleItemsSchema` の `items` を `.max(200, <メッセージ>)` にし、メッセージは `SCHEDULE_VALIDATION_MESSAGES` に足す。`PUT /api/schedules/:id/bulk-save` が 201 件で 400 とそのメッセージを返すこと
  - 挙動の変更であるため RED → GREEN で進める。単体（schema の 200 件は成功・201 件は失敗）と統合（201 件で 400、200 件を保存して GET で 200 件が表示順のまま返る）で主張し、現状で赤になることを先に示す
  - 統合の検証で REQ-12.1 を被覆できる場合は、除外一覧の `construction-schedule/REQ-12.1` を取り下げて `@requirement` の印を掲げる。取り下げない場合は道具名を実体の走者へ揃える（Task 17.1 の前例）。いずれも `check:req-coverage`・`check:req-exclusions`・`check:design-measurement-freshness` を名指しで回す
  - _Requirements: 12.1_
  - _Boundary: 工程表のバルク保存の項目数の検証（schema・route）とその検証、除外一覧の REQ-12.1_

- [x] 20.2 画面の工程項目の追加を 200 で止め、上限に達したことを示す
  - design.md の要件対応表は 12.1 の担い手に `useScheduleState` を挙げる。編集画面で 200 項目に達したら項目の追加の操作を止め（無効化）、上限に達した旨を示す。保存の 400 を受けた場合もメッセージを表示する
  - 挙動の追加であるため RED → GREEN で進め、単体（200 項目で追加できない・199 項目で追加できる）と E2E（上限の表示）で主張する。表示の文言と位置は design.md へ規約 (a) の形で併記する
  - _Requirements: 12.1_
  - _Boundary: 工程表の編集画面の項目の追加の上限とその表示_
  - _Depends: 20.1_

- [x] 20.3 数量表の項目が 200 を超える場合の工程表の作成の扱いを決めて実装する（着手時に利用者の判断を得る）
  - 数量表からの作成は項目をそのまま写すため、200 を超える数量表から作ると上限を超えた工程表ができる。扱い（例: 作成を 400 で拒む / 先頭 200 件だけを写して残りを知らせる / 作成画面で選んだ数量表の項目数を示して作成を止める）を**着手時に利用者に確かめ**、design.md へ規約 (a) の形で記録してから実装する
  - 挙動の変更であるため RED → GREEN で進め、201 項目の数量表からの作成を単体・統合で主張する
  - **利用者の判断（2026-10-09）**: 200 を超える数量表からの作成は **400 で拒む**（作成画面にエラーを表示する）。先頭 200 件だけを写す形と作成画面で事前に止める形は採らない
  - _Requirements: 12.1_
  - _Boundary: 数量表からの工程表の作成の項目数の扱い_
  - _Depends: 20.1_

- [x] 20.4 REQ-6.7 / 12.2 の手動計測の除外の扱いを決める（着手時に利用者の判断を得る）
  - `construction-schedule/REQ-6.7`（入力から 200ms 以内の表示更新）と `REQ-12.2`（200 項目でのスムーズな描画）の代替検証は「Chrome DevTools / Lighthouse」の手動の計測で、リポジトリの中に検証が無い。リポジトリの中で計測する検証（例: 200 項目の GanttChartPanel の再描画時間を単調時計で測る単体、または E2E の Performance API）を置くか、手動の計測のまま残すかを**利用者に確かめる**
  - 検証を置く場合は Task 18.3 の前例（単調時計で測る・変異で赤くなることを示す・通常の `npm test` の所要時間を大きく延ばさない）に従い、除外を取り下げるか道具名を実体へ揃える。手動のまま残す場合は、その判断を除外の `description` と design.md へ記録する
  - **利用者の判断（2026-10-09）**: **リポジトリの中に計測の検証を置く**（手動の計測のまま残す形は採らない）
  - _Requirements: 6.7, 12.2_
  - _Boundary: REQ-6.7 / 12.2 の検証と除外一覧の記述_
  - **止めた経緯（2026-10-09）**: 実ブラウザの計測（Playwright・Chromium、200 項目・日付列約 1 年・td 71,800 個）で、日数の入力から表示更新までが 169〜416ms（中央値 約 218ms）と 200ms を超え、編集中に 126〜530ms の長いフレームが毎回 6〜9 件出た（20 項目では 12〜48ms・0 件）。GanttChartPanel が入力ごとに全セルをインラインスタイル付きで作り直し（行のメモ化なし、セルごとに getDayType）、design.md が対策に挙げる CSS containment も実装に無い。閾値を弱めずに検証を置くと E2E が常に赤になるため、性能の修正の扱いについて利用者の判断を待った。利用者の判断（2026-10-09）で性能の修正を 21.1 に起票した。計測の下書きは 2026-10-09 のセッションの scratchpad の `construction-schedule-gantt-performance.spec.ts`
  - **申し送り（21.1 から、2026-10-10）**: 計測の spec はファイル直下で `test.use({ trace: 'off', video: 'off' })` とすること（Playwright のトレースの DOM スナップショットが長いフレームを作る）。長いフレームの判定の仕方（全実行で 0 件か、帰属しない揺れの扱い）は着手時に利用者に確かめる
  - **利用者の判断（2026-10-10、着手時）**: 6.7 は各打鍵の入力から描画までが 200ms 以内であることを厳密に主張する。12.2 のフレーム落ちは「100ms を超えるフレームが 0 件」で主張し、50ms を超えるフレームの件数は記録だけにする（WSL2 の headless と CI の揺れを考え、修正前の 81〜412ms の長いフレームは確実に赤になる閾値として選ぶ）
  - _Depends: 21.1_

## タスク21: ガントチャートの性能と作成画面のエラー表示を正す（利用者の判断で起票、2026-10-09）

**経緯**: Task 20.4 の計測（2026-10-09）で、200 項目のガントチャートが要件 6.7 / 12.2 を満たさないことが分かった（20.4 の記録を参照）。また Task 20.3 の独立レビューが、作成画面が 400 のサーバーの detail を一律に表示するため、端のケース（存在しないプロジェクトの指定による外部キー違反）で errorHandler の英語の「Database operation failed」が利用者に見えることを指摘した。利用者の判断（2026-10-09）により両方を起票し、今回の実行に加える

- [x] 21.1 200 項目のガントチャートの入力から表示更新までを 200ms 以内にし、編集中の長いフレームを無くす
  - **事実**: `frontend/src/components/schedule/GanttChartPanel.tsx` は入力ごとに 200 行 × 日付列（約 1 年で td 71,800 個）をインラインスタイル付きで作り直し、行のメモ化が無く、セルごとに `getDayType` を呼ぶ。design.md が対策に挙げる CSS containment も無い。フォーカス中は入力が無くても 130〜530ms のフレームが続く
  - 修正の案: 行の `React.memo` と日付ごとの区分の一度だけの計算・共有、曜日・祝日の背景を列ごとの層か CSS の gradient にして td を減らす、`contain` の指定、必要なら行の仮想化。採った方式と理由を design.md へ規約 (a) の形で記録する
  - 修正の前後を Task 20.4 の計測（実ブラウザ、単調時計、Event Timing・Long Animation Frame）で測り、200 項目で 200ms 以内・長いフレーム 0 件になることを示す。表示（土日祝の色分け・バー・ラベル）とキー操作・入力（IME）を変えないこと、既存の単体と E2E が緑のままであることを確かめる
  - **利用者の判断（2026-10-10）**: 着手後の計測で、入力から描画までは全実行で 200ms 以内になったが、編集中の 50ms 超のフレームが一部の実行に残り、原因が項目一覧（`SortableScheduleList` / `ScheduleItemRow` が入力ごとに全行を描き直す）にあった。**境界を項目一覧の描画まで広げて直す**
  - _Requirements: 6.7, 12.2_
  - _Boundary: ガントチャートと工程の項目一覧の描画の性能（2026-10-10 に利用者の判断で項目一覧を加えた）_
  - **利用者の判断（2026-10-10、2 回目）**: 項目一覧の memo 化の後の計測（200 項目・トレースと録画なし、中ほど 10 回・最後 20 回）で、入力から描画までは全 30 回で 200ms 以内（最大 80ms）、静止中の長いフレームは 0 件、編集中は 30 回中 29 回で 0 件となり、最後の項目を打ち変える 1 回に 54ms（スクリプト 21ms・描画の更新 4ms・帰属しない約 29ms）が 1 件残った。**この状態で受け入れ**、長いフレームの判定の仕方は 20.4 の着手時に利用者と決める

- [x] 21.2 工程表の作成画面で、サーバーの detail を見せる 400 を上限超過と入力エラーに限る
  - `frontend/src/pages/ScheduleCreatePage.tsx` の作成の失敗の表示を、`SCHEDULE_ITEMS_LIMIT_EXCEEDED` と検証エラー（ValidationError）のときだけサーバーの detail を出し、それ以外は日本語の汎用の文言「工程表の作成に失敗しました」にする
  - 挙動の変更であるため RED → GREEN で進め、単体（上限超過・検証エラーは detail、Prisma 由来の 400 は汎用の文言）で主張する。Task 19.1 の E2E（`e2e/specs/schedules/construction-schedule-focus-visible.spec.ts`）の作成の失敗の期待値への影響を確かめる
  - _Requirements: 1.6, 12.1_
  - _Boundary: 工程表の作成画面の失敗の表示_

## タスク22: 案件の閲覧範囲（user-authentication の要件39）と出力の記録（同 要件40）を本スペックの API と出力へ適用する（user-authentication の機能検証からの起票。利用者の判断で起票、2026-10-25）

**経緯**: IPA の注意喚起（2026-10-09）の是正で、user-authentication が要件39（案件単位の閲覧範囲）と要件40（認証・アカウント操作とデータ出力の監査記録）を設け、判定の部品（backend/src/services/project-scope.service.ts の `evaluateProjectAccess`・`buildProjectScopeWhere`、backend/src/middleware/project-scope.middleware.ts の `requireProjectScope`）と出力の記録の手段（backend/src/services/export-audit.service.ts の `ExportAuditService`）を実装した（同スペックのタスク52.1・53.3）。同スペックが適用したのは案件そのもの（`/api/projects`、タスク52.3）だけである。同スペックの design.md の Boundary Commitments の Out of Boundary は、各業務機能の API への `requireProjectScope` の適用と子リソースから案件 ID を引く解決関数、出力処理からの記録の呼び出しを各 spec の所管と定め、是正計画（docs/security/ipa-alert-20261009-remediation-plan.md）の §5.10 が本スペックの項目（Excel・PDF 出力の記録、閲覧範囲の適用）を挙げる。同スペックの機能検証（2026-10-25、HEAD `b85b8124`）が、どの所管 spec にも適用のタスクが無く、本スペックの API が案件の範囲を判定しない（担当外の利用者が ID 指定で他の案件の工程表を読み書きできる）ことと、出力が記録を経ないこと（`ExportAuditService.record` の呼び出し元は監査ログの経路だけ）を確かめた。利用者の判断（2026-10-25、案 A）で各所管 spec へ起票する（site-survey の Task 115.347 と同じく、上流の user-authentication からの起票）

- [x] 22.1 本スペックの API に案件の閲覧範囲（user-authentication の要件39）を適用する
  - 対象（2026-10-25、HEAD `b85b8124` の実測。行は経路の定義の行。着手時に測り直すこと）:
    - backend/src/routes/schedules.routes.ts（`/api/projects/:projectId/schedules` と `/api/schedules`）: `GET /`（105）、`GET /:id`（165）、`POST /`（231）、`PUT /:id`（312）、`PUT /:id/bulk-save`（390）、`DELETE /:id`（461）、`GET /:id/export`（527）
  - 工程表の ID から案件 ID を引く解決関数を本スペックが持ち、`requirePermission` の後に `requireProjectScope` を置く（user-authentication の design.md の「ProjectScopeGuard（`requireProjectScope`）」の節。前に置くと権限なしの 403 を主張する既存の統合テストが 404 で落ちる〔同スペックの tasks.md の Implementation Notes の 52.2 の区分 D〕）。範囲外と不在は同じ汎用の 404（`NOT_FOUND`）にし、本文に案件 ID など存在を推測できる情報を含めない（39.2）。案件をまたぐ一覧・検索・件数があれば `buildProjectScopeWhere` の条件で絞る（39.3）
  - 挙動の変更であるため RED → GREEN で進める。統合テストで、担当外の利用者の ID 指定が不在と同じ 404 になり DB が変わらないこと、一覧に出ないこと、担当者・作成者・全案件閲覧の権限では従来どおりであることを主張する。E2E で担当外の利用者が工程表の URL を直接開くと見つからない扱いになることを確かめる
  - 本スペックの受入基準として持つか（是正計画 §4 は、各業務 spec が自分の適用箇所を受入基準として持つとする）は requirements.md の改訂と被覆の印を伴うため、着手時に利用者の判断を得る
    - **判断の結果（2026-10-27、利用者の判断）**: 本スペックの受入基準として持つ。requirements.md に Requirement 13（案件の閲覧範囲と出力の記録の適用）を新設した。本タスクの適用は 13.1〜13.5 が受ける。工程表の作成の要求が指す数量表（`quantityTableId`）は経路の案件との所属を照合しているが、属さない場合と存在しない場合で 422 の本文が分かれ他の案件の数量表の実在を推測させるため、経路のプロジェクトに属さなければ数量表の不在と同じ応答で工程表を作成しない（13.4）と条文に定めた（ステータスは既存の 422 のまま揃える。404 へ改める案を採らない理由は design.md の同章の「作成の数量表」）。一括保存は一つの工程表の工程項目を全件差し替え、要求の工程項目の `id` で既存の行を引かないため（2026-10-27 の実測）、子リソースの所属の照合と全件か無しかの受入基準は置かず、範囲外の工程表への一括保存を 13.2 の 404・書き込みなしで受ける。案件をまたぐ一覧・検索・件数・カレンダーの横断表示の経路は無く（2026-10-27 の実測）、工程表の一覧は経路の `projectId` の判定で範囲内に限られる（13.5）。本スペックはファイルの署名付きURLを発行しない。案件の範囲を含意する既存の条文を requirements.md で検めたが、ロールや権限だけで閲覧・操作を許すと読める条文は無く（該当は Requirement 1 の目的の文と、1.1・1.3・2.1・2.3 の当該プロジェクト・同一プロジェクトの一覧の語だけ）、既存の条文は改訂していない。design.md は「Requirement 13: 案件の閲覧範囲と出力の記録の適用」章を足し、Existing Architecture Analysis の「認証・認可」と Error Categories and Responses・API Contract の当初の記述は記録として残して置き換えを書き添えた。被覆の印は本タスクの統合テスト・E2E が名乗る（新設時点では未被覆）
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_
  - _Boundary: 本スペックの API の案件の範囲の判定_

- [x] 22.2 工程表の出力に記録（user-authentication の要件40）を適用する
  - 対象（2026-10-25 の実測）: サーバーで生成する backend/src/routes/schedules.routes.ts の `GET /:id/export`（527。Excel と PDF。画面は frontend/src/components/schedule/ExportDialog.tsx から呼ぶ）。種別 `schedule_export`
  - ハンドラーが生成の前に `ExportAuditService.record`（実行者・種別・案件・対象・件数）を呼ぶ（40.9。user-authentication の design.md の「ExportAuditService と ExportAuditClient」の節の、サーバー側で生成する出力は各業務 spec がハンドラーから直接呼ぶ、の定め）。記録が失敗したときの応答（出力を返さない）は同節に照らして決める
  - 挙動の変更であるため RED → GREEN で進め、統合テストで出力のたびに監査 `DATA_EXPORTED` が種別・案件つきで 1 件記録されること、記録の失敗時の応答を主張し、E2E で画面からの出力が記録を残すことを確かめる
  - **判断の結果（2026-10-27、利用者の判断。22.1 の判断と同じ）**: 本タスクの適用は Requirement 13 の 13.6・13.7 が受ける。出力はサーバーで生成することを実装で確かめた（2026-10-27。`GET /:id/export` のハンドラーが `ScheduleExportService` の `exportToExcel`・`exportToPdf` で生成して送り、画面の `ExportDialog` は応答を受け取って保存するだけ）。そのため記録はハンドラーがファイルの生成の前に 1 回行い（13.6）、記録の失敗ではファイルを生成せず返さずにエラーを返し、画面はダウンロードを始めず「出力を記録できなかったため中止しました」を表示する（13.7）と条文に定めた。応答の形（500・`detail`・識別子）と、ブラウザ側の包み（`runRecordedExport`）を使わない理由は design.md の同章の「記録の失敗の応答」に記した。被覆の印は本タスクの統合テスト・E2E が名乗る（新設時点では未被覆）
  - _Requirements: 13.6, 13.7_
  - _Boundary: 工程表の出力の経路の記録_
  - _Depends: 22.1_

## タスク23: プロジェクトの配下の経路の食い違いの記録（user-authentication の要件39.8 の適用。利用者の判断で起票、2026-10-29）

**経緯**: user-authentication が要件39.8 を加え、経路の案件と対象の実際の案件が食い違う要求のうち、実際の案件が閲覧範囲外のものを要件39.7 の記録の対象とした（利用者の判断、2026-10-29「推奨案で進める」。同 spec の design.md の ProjectScopeGuard の節の「各業務 spec への起票先」の construction-schedule の行）。本スペックの判定部品（backend/src/middleware/construction-schedule-project-scope.middleware.ts の `requireScheduleProjectScope`、70〜74 行付近。行は同日の実測で、着手時に測り直すこと）は、二重マウント（`/api/projects/:projectId/schedules/:id` とその配下。出力の `GET /:id/export` を含む）の食い違いを不在として null を返し、範囲を判定せず記録しない。工程表そのものの食い違いの条文が無かったため、requirements.md に 13.8 を加え（応答と記録の両方）、design.md の末尾の章「2026-10-29 の追加: 食い違いの記録・不在の表示」に設計を置いた。作成の要求が指す数量表の所属（13.4）は、`ScheduleService.create` の照合が既に要件39.8 の振る舞いを満たすため変えない（同章の「決定」）

- [x] 23.1 プロジェクトの配下の経路の食い違いで、工程表の実際の案件が範囲外なら記録する
  - `requireScheduleProjectScope` の解決関数が、経路の `projectId` と工程表の案件が食い違うとき、null ではなく上流の `projectMismatch`（工程表の案件 ID）を返すよう切り替える。応答は範囲の内外にかかわらず不在と同じ汎用の 404 のまま、データを変えずファイルを生成しない。工程表の不在と論理的な取り除きは従来どおり null で記録しない（`findProjectIdOfSchedule` の定めを保つ。design.md の同章の「決定」）。同ファイルの冒頭の注釈の食い違いの記述を改める。作成の要求が指す数量表（13.4）の照合は変えない
  - **既存のテストの書き換え**（条文どおりに。主張を消さない）: 単体テスト（`backend/src/__tests__/unit/middleware/construction-schedule-project-scope.middleware.test.ts`）の「二重マウントで経路の案件 ID と工程表の案件が食い違うときは、範囲を判定せずに不在と同じ 404 にする」は、工程表の案件が範囲外なら記録 1 件で 404、範囲内なら記録なしで 404 の二通りへ改め、題名も改める。論理的に取り除かれた工程表の食い違いが範囲を判定せず記録なしの 404 になることを足す。統合テスト（`backend/src/__tests__/integration/construction-schedule-project-scope.api.integration.test.ts`）の「二重マウントの経路で、経路の案件と工程表の案件が食い違うと工程表の不在と同じ 404 にし、データを変えず、記録しない」（範囲内どうしの食い違い）は条文どおりで変えず、記録しない理由の注釈を範囲内どうしの食い違いであるためと改め、範囲外の案件の工程表を範囲内の案件の経路で指すと詳細・更新・一括保存・論理的な取り除き・出力が 404 でデータが変わらずファイルを返さず `PROJECT_SCOPE_DENIED` が増える（対象は工程表の実際の案件。出力の記録は増えない）テストを足す
  - E2E（`e2e/specs/schedules/construction-schedule-project-scope.spec.ts` に新しいテスト）で、範囲外の案件の工程表を範囲内の案件の経路で指す要求が 404 になり監査の記録が 1 件増えることを主張し、`@requirement construction-schedule/REQ-13.8` と上流の 39.8 の被覆の印（user-authentication のタスク63.2 の申し送り）を置く
  - 挙動の変更であるため RED → GREEN で進める。上流の 63.1 が入る前に着手しない
  - 単体・統合・E2E で、食い違いの要求が範囲外のときだけ記録され、どの場合も不在と同じ 404 でデータが変わらずファイルを生成しない状態になる
  - _Depends: user-authentication の Task 63.1_
  - _Requirements: 13.8_
  - _Boundary: requireScheduleProjectScope の解決関数と、食い違いの記録を主張する本スペックのテスト_

## タスク24: 工程表の画面が 404 を受けたときの不在の表示（利用者の判断で起票、2026-10-29）

**経緯**: 利用者の判断（2026-10-29「推奨案で進める」）で起票する。Requirement 13.2 により閲覧範囲外の工程表・プロジェクトへの要求は不在と同じ 404 になるが、画面は 404 を分類しない（2026-10-29 の調査。行は同日の実測で、着手時に測り直すこと）: `ScheduleDetailPage.tsx` は読み込みの失敗で `ApiError` の `message`（汎用の 404 では英語の文言）をそのまま表示する（355 行付近）。`ScheduleListPage.tsx` は読み込みの失敗を一律に取得の失敗の固定の文言と再試行の釦にし（357 行付近、415 行付近）、削除の失敗も一律に削除の失敗の固定の文言で一覧を置き換える（380 行付近）。`ScheduleForm.tsx` は数量表の選択肢の読み込みの失敗を無視し（197 行付近）、`ScheduleCreatePage.tsx` は作成の失敗を 400 の利用者向けの符号を除き一律に作成の失敗の固定の文言にする（116 行付近）。`useScheduleState.ts` の保存は失敗で `ApiError` の `message` をそのまま表示に渡す（285 行付近）。`ExportDialog.tsx` は記録の失敗以外の失敗の応答を一律に出力の失敗の文言と再試行の釦にする（243 行付近）。サーバーの応答は変えない（user-authentication の要件39.2）。requirements.md に Requirement 14（14.1・14.2）を加え、design.md の末尾の章「2026-10-29 の追加: 食い違いの記録・不在の表示」に設計を置いた

- [x] 24.1 工程表の一覧・新規作成・詳細の画面と作成・保存・削除・出力の操作で、404 を見つからない旨の表示にする
  - 404 を見つからない種別に分類し対象ごとの日本語の文言を返す部品を足す（置き場所は実装時に決める）。読み込みの 404 では共通部品 `ResourceNotFound`（`frontend/src/components/common/ResourceNotFound.tsx`）で見つからない旨と戻り先のリンク（いずれの画面もプロジェクトの一覧）を表示し、応答の英語の文言・取得の失敗の文言と再試行の釦を出さない。新規作成の画面は数量表の選択肢の読み込みの 404 でプロジェクトが見つからない旨を表示し、404 以外の失敗は従来どおり無視する。作成・保存・削除の 404 では見つからない旨のメッセージを表示し（作成の汎用の 404 はプロジェクト、保存・削除は工程表）、出力のダイアログは出力の応答の 404 で出力の失敗の文言と再試行の釦に代えて工程表が見つからない旨を表示する。記録の失敗（13.7）、409 と 404 以外の失敗の従来の文言は保つ。文言の逐語は詳細の画面の工程表が無い場合の既存の表示を流儀として design.md の同章の「決定」へ記す
  - 挙動の変更であるため RED → GREEN で進め、現状で赤になることを先に示す。単体（404 の分類、各画面の読み込みの 404 の表示、作成・保存・削除と出力のダイアログの 404 のメッセージ。404 以外の失敗の従来の文言と、出力のダイアログの記録の失敗の文言は保つ）と E2E（担当外の利用者が工程表の詳細の URL を開くと見つからない旨とプロジェクトの一覧へのリンクが出て存在しない工程表と同じ表示になる、範囲外のプロジェクトの一覧・新規作成の URL でプロジェクトが見つからない旨が出る、開いた後に論理的に取り除かれた工程表の保存・出力と、一覧を開いた後に論理的に取り除かれた工程表の削除で見つからない旨のメッセージが出る）で主張し、`@requirement construction-schedule/REQ-14.1`・`REQ-14.2` の印を置く
  - 既存の E2E（`e2e/specs/schedules/construction-schedule-project-scope.spec.ts` の「担当外の利用者が工程表の URL を直接開くと存在しない工程表と同じ表示になり」）は `main` の本文を存在しない工程表と比べており、比較の主張は消さず、見つからない旨の表示どうしの比較として緑であることを確かめる。`construction-schedule-e2e.spec.ts` と `construction-schedule-export-audit.spec.ts` の出力の失敗と再試行のテスト（500 で差し替え）、`construction-schedule-focus-visible.spec.ts` の取得の失敗・作成の失敗・出力の失敗の本文のテスト（400 で差し替え）は、404 以外の従来の表示として緑のままであることを確かめる。ほかに、変えた表示（取得の失敗・削除の失敗・作成の失敗・出力の失敗の文言、再試行の釦、見つからない旨の文言、英語の Not found）を e2e/ 全体で grep して既存の E2E を選び、流す。frontend を変えたらテスト環境の frontend を作り直してから流す
  - 単体と E2E で、404 を受けた画面が見つからない旨を表示し、応答の英語の文言と取得・操作の失敗の汎用の文言を出さない状態になる
  - _Requirements: 14.1, 14.2_
  - _Boundary: ScheduleListPage, ScheduleCreatePage, ScheduleForm, ScheduleDetailPage, useScheduleState, ExportDialog_

## タスク25: 論理的に取り除かれた工程表・論理削除済みの数量表の範囲外の記録（user-authentication の要件39.8 の改訂の適用。利用者の判断で起票、2026-10-30）

**経緯**: 利用者の判断（2026-10-30「推奨案で進める」）で起票する。user-authentication が要件39.8 を改め、記録しない「論理削除」を案件そのものの論理削除に限り、対象のデータが論理削除済みでも実在して実際の案件が範囲外なら記録すると定めた（同 spec の requirements.md の要件39 の改訂の記録、design.md の ProjectScopeGuard の節の「対象のデータの論理削除の扱い」とその起票先の一覧の construction-schedule の行）。本スペックは、解決関数 `findProjectIdOfSchedule` が論理的に取り除かれた工程表で null を返し、`ScheduleService` の `createWithin` が論理削除済みの数量表を所属の照合より先に 422 で弾くため、範囲外の案件のものでも記録しない（2026-10-30 の調査。行は着手時に測り直すこと）。requirements.md の 13.8 を改め（改訂の記録を同要件に残した）、13.9・13.10 を加え、design.md の末尾の章「2026-10-30 の追加: 論理的に取り除かれた工程表・論理削除済みの数量表の範囲外の記録」に設計を置いた。応答とデータと画面は変えない

- [x] 25.1 解決関数が論理的に取り除かれた工程表にも実際の案件を返し、範囲外なら記録されるようにする
  - backend/src/middleware/construction-schedule-project-scope.middleware.ts の `findProjectIdOfSchedule` を、行が無いときだけ null を返し、行が実在すれば論理的に取り除かれているかどうかを添えて案件 ID を返す形へ改める。`requireScheduleProjectScope` の解決関数は、論理的に取り除かれた工程表では経路の形（`/api/schedules/:id`、同じ案件の配下の経路、食い違いの経路）を問わず `projectMismatch(工程表の案件 ID)` を返す（同じ案件の経路と `/api/schedules` のマウントで取り除かれた工程表を指したときの従来の汎用の 404 を保つための切り分け。design.md の同章の「決定」の表）。取り除かれていない工程表の振る舞い（一致なら案件 ID、食い違いなら `projectMismatch`）は変えない。同ファイルの冒頭の注釈と関数の注釈を改める
  - backend/src/routes/schedules.routes.ts の出力の経路が記録に添える案件を `findProjectIdOfSchedule` で引く箇所を新しい戻り値に合わせ、行が無いときと論理的に取り除かれているときは従来の競合の扱い（`NotFoundError` の汎用の 404。出力の記録も生成もしない）とする
  - **既存のテストの書き換え**（条文どおりに。主張を消さない）: 単体（`backend/src/__tests__/unit/middleware/construction-schedule-project-scope.middleware.test.ts`）の「工程表の ID から案件 ID を引き、工程表が無いか論理的に取り除かれていれば null を返す」「論理的に取り除かれた工程表は、案件が範囲外でも範囲を判定せずに不在と同じ 404 にし、記録しない」「二重マウントで論理的に取り除かれた工程表を指すと、工程表の案件が範囲外で経路の案件と食い違っても、範囲を判定せずに不在と同じ 404 にし、記録しない（13.8）」の 3 本。統合（`backend/src/__tests__/integration/construction-schedule-project-scope.api.integration.test.ts`）の「論理的に取り除かれた工程表は、範囲の内外を問わず存在しない工程表と同じ汎用の 404 を返す」（範囲外の利用者で記録の差 0）と「二重マウントの経路で、範囲外の案件の論理的に取り除かれた工程表を範囲内の案件の経路で指すと、不在と同じ 404 になり、記録せず、データを変えずファイルを生成しない」の 2 本。改め方は design.md の同章の「既存のテストの書き換え」のとおり（範囲外なら記録 1 件、範囲内と案件そのものの論理削除では記録なし、どれも存在しない工程表と同じ汎用の 404 で本体へ進まずデータが変わらず、出力の経路でファイルと `DATA_EXPORTED` が増えない）。題名と記録しない理由の注釈も改める
  - E2E（`e2e/specs/schedules/construction-schedule-project-scope.spec.ts`）で、担当外の利用者が範囲外の案件の論理的に取り除かれた工程表を `/api/schedules/:id` の詳細と範囲内の案件の配下の経路で指すと、存在しない工程表と同じ 404 になり監査ログの `PROJECT_SCOPE_DENIED` が 1 件ずつ増えることを主張し、`@requirement construction-schedule/REQ-13.8`・`REQ-13.9` と上流の 39.8 の改訂の被覆の印（user-authentication のタスク66.1 の申し送り）を置く。被覆の印を足したら `check:design-measurement-freshness` を名指しで流す
  - 振る舞いを変えるため、変えた応答の経路（工程表の詳細・更新・一括保存・取り除き・出力の 404、`PROJECT_SCOPE_DENIED` と `DATA_EXPORTED` の件数）を e2e/ 全体で grep して既存の E2E を選び、流す（同ファイルの 13.8 の二重マウントのテスト、14.2 の開いた後に論理的に取り除かれた工程表の保存・出力・削除のテスト、`construction-schedule-export-audit.spec.ts` を含む）
  - 挙動の変更であるため RED → GREEN で進め、書き換えたテストが現状で赤になることを先に示す。上流の 66.1 が入る前に着手しない
  - 単体・統合・E2E で、論理的に取り除かれた工程表の ID 指定が範囲外のときだけ記録され、どの場合も存在しない工程表と同じ汎用の 404 でデータが変わらずファイルを生成しない状態になる
  - _Depends: user-authentication の Task 66.1_
  - _Requirements: 13.8, 13.9_
  - _Boundary: findProjectIdOfSchedule, requireScheduleProjectScope の解決関数, 出力の経路の記録の案件の引き当てと、論理的に取り除かれた工程表の記録を主張する本スペックのテスト_

- [ ] 25.2 工程表の作成で、範囲外の案件の論理削除済みの数量表を記録する
  - backend/src/services/schedule.service.ts の `createWithin` の数量表の照合の順を、行が無い（422、記録しない）→ 作成先のプロジェクトに属さない（`evaluateProjectAccess` で範囲外なら `deniedProjectIds` へ入れたうえ 422）→ 作成先のプロジェクトに属し論理削除済み（422、記録しない）へ改める（design.md の同章の「決定」の「数量表の照合の順」）。応答は 3 通りとも 13.4 と同じ 422 の `SCHEDULE_VALIDATION_ERROR` と本文「指定された数量表が見つかりません」のまま、数量項目を読まず工程表と工程項目を作成しない。照合の注釈を改める
  - **既存のテストへの追加**（主張を消さない）: 単体（`backend/src/__tests__/unit/services/schedule.service.test.ts`）の「論理削除された数量表が指定された場合バリデーションエラーになること」は作成先のプロジェクトの論理削除済みの数量表として保ち、判定も記録もしない主張を足す。同ファイルの「作成先のプロジェクトに属さない数量表（Requirement 13.4、タスク22.1）」の表に、論理削除済みの数量表の場合（範囲外は判定して記録 1 回で対象は数量表の案件、範囲内の他のプロジェクト・案件の不在は記録なし。どれも不在と同じ 422 と本文で数量項目を読まず作成しない）を足す。統合（`backend/src/__tests__/integration/construction-schedule-project-scope.api.integration.test.ts` の「作成の要求が指す数量表（13.4）」）に、範囲外の案件の論理削除済みの数量表を指す作成が存在しない数量表と同じ 422 の本文で `PROJECT_SCOPE_DENIED` が 1 件増え、工程表と工程項目が増えないテストを足す。既存の範囲外の数量表の記録のテストに `@requirement construction-schedule/REQ-13.10` の印を足すかは実装時に決める
  - E2E（`e2e/specs/schedules/construction-schedule-project-scope.spec.ts`）で、範囲外の案件の論理削除済みの数量表を指す工程表の作成が存在しない数量表と同じ 422 になり監査ログの `PROJECT_SCOPE_DENIED` が 1 件増え、工程表が作られないことを主張し、`@requirement construction-schedule/REQ-13.10` の印を置く。被覆の印を足したら `check:design-measurement-freshness` を名指しで流す
  - 挙動の変更であるため RED → GREEN で進め、足したテストが現状で赤になることを先に示す。上流の 66.1 が入る前に着手しない
  - 単体・統合・E2E で、範囲外の案件の論理削除済みの数量表を指す作成が不在と同じ 422 で記録され、作成先のプロジェクトの論理削除済みの数量表では記録されない状態になる
  - _Depends: user-authentication の Task 66.1_
  - _Requirements: 13.10_
  - _Boundary: ScheduleService の工程表の作成の数量表の照合と、その記録を主張する本スペックのテスト_
