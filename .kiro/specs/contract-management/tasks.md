# Implementation Plan

- [x] 1. データモデルとマイグレーションの作成
- [x] 1.1 Prismaスキーマに契約書モデルを追加し、マイグレーションを実行する
  - ContractType（NEW/AMENDMENT）とContractStatus（BEFORE_CONTRACT/CONTRACTED）のEnum定義
  - Contractモデルの全フィールド定義（契約日、工期、引渡日、消費税率、支払条件、別途工事、その他、金額スナップショット等）
  - Project、Estimate、TradingPartner、Contract自己参照のリレーション定義
  - 既存モデル（Project、Estimate、TradingPartner）への逆リレーション追加
  - 論理削除（deletedAt）、楽観的排他制御（version）、インデックス定義
  - Prisma Clientの再生成とマイグレーション実行
  - _Requirements: 3.1, 5.1, 5.3, 8.3_

- [x] 2. バックエンドバリデーションとサービス層の実装
- [x] 2.1 契約書のZodバリデーションスキーマを定義する
  - 契約書作成入力（CreateContractInput）のバリデーションスキーマ（contractType、estimateId、contractDate、工期、引渡日、taxRate、paymentTerms、separateConstruction、otherNotes、supervisorTradingPartnerId、金額フィールド）
  - 契約書更新入力（UpdateContractInput）のバリデーションスキーマ（version含む楽観的排他制御）
  - 契約書一覧クエリ（ContractListQuery）のバリデーションスキーマ
  - ステータス更新入力のバリデーションスキーマ
  - 消費税率のデフォルト値10%（0.10）の設定
  - 変更契約時のparentContractId必須化（contractTypeがAMENDMENTの場合）
  - 日付の論理チェック（着手日 <= 完成日等）
  - _Requirements: 3.1, 3.2, 5.1, 5.3, 7.1, 9.2_

- [x] 2.2 契約書サービス層のCRUD操作を実装する
  - プロジェクトスコープの契約書一覧取得（ページネーション、ソート対応、論理削除除外）
  - 契約書詳細取得（リレーション展開：見積書、基契約書、監理者取引先、プロジェクト情報）
  - 契約書作成（新規契約・変更契約の共通処理、ステータスBEFORE_CONTRACTで初期化、金額スナップショット保存）
  - 契約書更新（楽観的排他制御、version検証）
  - 契約書論理削除
  - 変更契約のparentContractIdが同プロジェクトの契約書であることの検証
  - _Requirements: 1.1, 1.2, 7.1, 8.1, 8.3, 9.2_

- [x] 2.3 契約書ステータス遷移ロジックを実装する
  - BEFORE_CONTRACT <-> CONTRACTEDの双方向ステータス遷移
  - ステータス更新後の契約書詳細返却
  - _Requirements: 8.2, 8.3_

- [x] 3. REST APIエンドポイントの実装
- [x] 3.1 契約書ルートを定義し、アプリケーションにマウントする
  - デュアルマウント（/api/projects/:projectId/contracts と /api/contracts）の設定
  - 全エンドポイントにauthenticate、requirePermissionミドルウェアを適用
  - 全エンドポイントにZodバリデーションミドルウェアを適用
  - GET（一覧）、GET（詳細）、POST（作成）、PUT（更新）、PATCH（ステータス更新）、DELETE（論理削除）の各エンドポイント実装
  - ContractServiceへのリクエスト委譲
  - エラーハンドリング（400、401、403、404、409、422）
  - _Requirements: 1.1, 1.2, 3.4, 5.1, 7.1, 8.1, 8.2, 8.3, 9.2_

- [x] 3.2 (P) バックエンドの単体テスト・統合テストを作成する
  - ContractServiceのCRUD操作テスト（作成、取得、更新、削除、一覧）
  - ステータス遷移ロジックのテスト（双方向遷移）
  - バリデーションスキーマの各フィールドテスト（境界値、デフォルト値、条件付きバリデーション）
  - APIエンドポイントの統合テスト（認証・権限込み）
  - 変更契約のparentContractId検証テスト
  - 楽観的排他制御（version競合）テスト
  - _Requirements: 1.1, 1.2, 3.1, 3.2, 5.1, 7.1, 8.3, 9.2_

- [x] 4. 契約書一覧画面の実装
- [x] 4.1 契約書一覧ページコンポーネントを作成する
  - プロジェクトに紐付く契約書リストの表示（契約種類、契約日、ステータスをカラムに含む）
  - 新規作成ボタンの配置と契約書新規作成画面への遷移
  - 契約書行クリック時の詳細画面遷移
  - ローディング・エラー状態のハンドリング
  - パンくずナビゲーションの表示
  - React Routerへのルート登録（/projects/:projectId/contracts）
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 5. 契約書フォームコンポーネントの実装
- [x] 5.1 契約種類選択と新規契約用入力フォームを実装する
  - 新規契約・変更契約の契約種類選択UI（ラジオボタン）
  - 見積書選択セレクトボックス（プロジェクト紐付き見積書一覧からの選択）
  - 契約日、工期着手日、工期完成日、引渡日の日付入力フィールド
  - 消費税率入力（デフォルト10%）
  - 支払条件、別途工事、その他のテキスト入力フィールド
  - 監理者取引先の選択（既存TradingPartnerSelectコンポーネントの再利用）
  - mode prop（create/edit）によるフォーム動作切り替え
  - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4_

- [x] 5.2 見積書選択時の金額自動計算とプロジェクト情報の自動表示を実装する
  - 見積書選択時に既存APIとEstimateCalculator.calculateSubtotal()を利用した工事価格算出
  - 消費税額の自動計算（工事価格 x 消費税率）
  - 請負代金額の自動計算（工事価格 + 消費税額）
  - 発注者（プロジェクトの顧客）の自動表示
  - 請負者（自社情報）の自動表示
  - 工事名（プロジェクト名）の自動表示
  - 工事場所（プロジェクトの住所）の自動表示
  - 消費税率変更時の金額再計算
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 5.3 変更契約用の基契約書選択とデフォルト値設定を実装する
  - 変更契約選択時に同プロジェクトの既存契約書一覧を表示する選択UIの提供
  - 基契約書選択時に全入力フィールドへのデフォルト値設定（見積書、契約日、工期、引渡日、消費税率、支払条件、別途工事、その他、監理者）
  - 新規契約と同一の入力フィールド構成の維持
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 5.4 変更契約の変更前後比較表示パネルを実装する
  - 基契約書の各フィールド値を「変更前」として入力項目に並べて表示
  - 現在の入力値と変更前の値の視覚的な比較表示
  - 値が変更されたフィールドのハイライト表示
  - レスポンシブ対応のレイアウト
  - _Requirements: 6.1, 6.2_

- [x] 6. 契約書新規作成画面の実装
- [x] 6.1 契約書新規作成ページコンポーネントを作成する
  - ContractFormコンポーネントのmode='create'での利用
  - 作成ボタン押下時のAPI呼び出し（POST）と契約書詳細画面への遷移
  - キャンセルボタン押下時の前画面への遷移（何も作成しない）
  - パンくずナビゲーションの表示
  - React Routerへのルート登録（/projects/:projectId/contracts/new）
  - _Requirements: 2.3, 2.4, 7.1, 7.2, 7.3_

- [x] 7. 契約書詳細画面の実装
- [x] 7.1 契約書詳細ページコンポーネントを作成する
  - 契約書の全項目（入力項目+自動表示項目）の表示
  - ステータス遷移ボタン（「契約前」→「契約済」、「契約済」→「契約前」の双方向遷移）の実装
  - 基となった見積書へのリンク表示
  - 変更契約の場合、基となった契約書へのリンク表示
  - 編集ボタンの配置と契約書編集画面への遷移
  - パンくずナビゲーションの表示
  - React Routerへのルート登録（/projects/:projectId/contracts/:contractId）
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

- [x] 8. 契約書編集画面の実装
- [x] 8.1 契約書編集ページコンポーネントを作成する
  - 既存契約書データのフォーム初期値としてのロード
  - ContractFormコンポーネントのmode='edit'での利用（契約種類選択は無効化）
  - 保存ボタン押下時のAPI呼び出し（PUT、楽観的排他制御のversion送信）と契約書詳細画面への遷移
  - キャンセルボタン押下時の契約書詳細画面への遷移（変更破棄）
  - 見積書変更時の金額自動再計算
  - パンくずナビゲーションの表示
  - React Routerへのルート登録（/projects/:projectId/contracts/:contractId/edit）
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 9. フロントエンド統合とE2Eテスト
- [x] 9.1 プロジェクト詳細画面から契約書一覧への導線を追加する
  - プロジェクト詳細ページに契約書管理へのリンク/タブを追加
  - 全画面のルーティング統合と遷移の動作確認
  - _Requirements: 1.4, 1.5_

- [x] 9.2 E2Eテストを作成する
  - 新規契約作成フロー（見積書選択 → 金額自動表示 → 入力 → 作成 → 詳細画面遷移）
  - 変更契約作成フロー（基契約書選択 → デフォルト値設定 → 変更前後比較表示 → 作成）
  - ステータス遷移フロー（契約前 → 契約済 → 契約前の双方向遷移）
  - 編集フロー（詳細画面 → 編集ボタン → フォーム編集 → 保存 → 詳細画面反映）
  - キャンセル操作フロー（新規作成キャンセル、編集キャンセル）
  - パンくずナビゲーション（全画面での表示確認）
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 6.1, 6.2, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 10. usePermissionフックとAuthContext権限拡張の実装
- [x] 10.1 AuthContextにユーザー権限情報を追加し、usePermissionフックを作成する
  - AuthContextのUser型にpermissionsフィールドを追加する
  - ログインAPIまたは/api/v1/users/meのレスポンスから権限一覧を取得してAuthContextに保存する
  - usePermissionフックを作成し、hasPermission、hasAllPermissions、hasAnyPermissionの3つの権限チェック関数を提供する
  - 権限情報が未ロードの場合はデフォルトでfalseを返却する（安全側に倒す）
  - isLoadingフラグにより権限情報のローディング状態を公開する
  - _Requirements: 13.5_

- [x] 11. バックエンド削除制約と権限定義の実装
- [x] 11.1 契約書サービス層に削除制約チェックを追加する
  - 削除時に子契約（deletedAtがnullの変更契約）の存在を確認し、存在する場合はContractDeletionConstraintErrorをスローする
  - 削除時にステータスがCONTRACTEDの場合はContractDeletionConstraintErrorをスローする
  - ContractDeletionConstraintErrorを定義し、子契約存在エラーと契約済エラーを区別するメッセージを持たせる
  - DELETEエンドポイントで422ステータスコードとエラーメッセージを返却するようにルートを拡張する
  - _Requirements: 8.11, 12.1, 12.2_

- [x] 11.2 (P) 契約書操作用の権限をシステムに定義する
  - contract:create、contract:read、contract:update、contract:deleteの4権限をシードデータに追加する
  - 契約書APIの各エンドポイントにrequirePermissionミドルウェアを適用する（GET: contract:read、POST: contract:create、PUT/PATCH: contract:update、DELETE: contract:delete）
  - 権限のないユーザーからのリクエストに対して403 Forbiddenを返却することを確認する
  - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 12. フロントエンドバリデーションの実装
- [x] 12.1 契約書フォームにクライアントサイドバリデーションを実装する
  - 見積書選択、契約日、工期着手日、工期完成日、引渡日、消費税率の必須チェックを実装する
  - 消費税率の範囲チェック（UIでは0-100%、内部では0-1に変換）を実装する
  - 工期着手日が完成日より後の場合のエラーメッセージ「着手日は完成日以前の日付を指定してください」を表示する
  - 変更契約の場合、基となる契約書が未選択のときのエラーメッセージを表示する
  - 送信ボタン押下時にvalidateForm()を実行し、エラーがあるフィールドにインラインエラーメッセージを表示する
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

- [x] 12.2 (P) バックエンドZodスキーマにクロスフィールドバリデーション（.refine）を追加する
  - 作成スキーマに.refine()で着手日<=完成日の論理チェックを追加する
  - 作成スキーマに.refine()で変更契約時のparentContractId必須チェックを追加する
  - 更新スキーマにも同様のクロスフィールドバリデーションを適用する
  - 消費税率の範囲（0以上1以下の小数値）のバリデーションを確認する
  - _Requirements: 10.5, 10.7, 10.8_

- [x] 13. 削除機能のフロントエンド実装
- [x] 13.1 削除確認ダイアログコンポーネントを作成する
  - 「この契約書を削除しますか?」の確認メッセージを表示する
  - 確認ボタンとキャンセルボタンを提供する
  - 削除処理中の二重送信防止（isDeleteingフラグ）を実装する
  - 削除API呼び出し（DELETE /api/contracts/:id）を実行する
  - 削除成功時にダイアログを閉じ、親コンポーネントにonDeleteSuccessコールバックで通知する
  - 422エラー（削除制約）のメッセージをダイアログ内またはトースト通知に表示する
  - _Requirements: 8.10, 8.11, 12.1, 12.2_

- [x] 13.2 契約書詳細画面に削除ボタンと削除フローを統合する
  - 契約書詳細画面に削除ボタンを追加する
  - 削除ボタン押下時にDeleteConfirmDialogを表示する
  - 削除成功時にトースト通知「契約書を削除しました。」を表示し、契約書一覧画面に遷移する
  - 削除制約エラー時にトースト通知でエラーメッセージを表示する（子契約存在/契約済の区別表示）
  - _Requirements: 8.9, 8.10, 8.11, 11.7_

- [x] 14. エラー回復とフィードバックの実装
- [x] 14.1 契約書の作成・編集・削除の成功メッセージをトースト通知で表示する
  - 契約書作成成功時に「契約書を作成しました。」のトースト通知を表示する
  - 契約書編集成功時に「契約書を更新しました。」のトースト通知を表示する
  - ステータス変更成功時に「ステータスを変更しました。」のトースト通知を表示する
  - _Requirements: 11.5, 11.6_

- [x] 14.2 (P) エラー種別に応じたフィードバックを全画面に実装する
  - ネットワークエラー（fetch例外）時に「通信エラーが発生しました。再試行してください。」のトースト通知と再試行ボタンを表示する
  - サーバーエラー（5xx）時に「システムエラーが発生しました。しばらくしてからお試しください。」のトースト通知を表示する
  - セッション期限切れ（401）時にログインページにリダイレクトする（既存AuthContext処理の活用）
  - 楽観的排他制御競合（409）時に「他のユーザーがこの契約書を更新しました。最新データを確認してください。」のトースト通知と再読込の誘導を表示する
  - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 15. 権限ベースUI制御の統合
- [x] 15.1 各画面にusePermissionフックを統合してUI要素を制御する
  - 契約書一覧画面の新規作成ボタンをcontract:create権限がない場合に非表示にする
  - 契約書詳細画面の編集ボタンをcontract:update権限がない場合に非表示にする
  - 契約書詳細画面のステータス遷移ボタンをcontract:update権限がない場合に非表示にする
  - 契約書詳細画面の削除ボタンをcontract:delete権限がない場合に非表示にする
  - タスク10で作成したusePermissionフックを使用する（前提タスク: 10.1）
  - _Requirements: 13.5_

- [x] 16. 新機能の単体テスト・統合テスト・E2Eテスト
- [x] 16.1 バックエンド削除制約と権限の単体テスト・統合テストを作成する
  - ContractServiceの削除制約テスト: 子契約が存在する場合のContractDeletionConstraintErrorスロー
  - ContractServiceの削除制約テスト: ステータスCONTRACTED時のContractDeletionConstraintErrorスロー
  - ContractServiceの正常削除テスト: 制約なしの場合の論理削除成功
  - DELETE APIエンドポイントの統合テスト: 422レスポンス（子契約存在エラー、契約済エラー）
  - DELETE APIエンドポイントの統合テスト: 204レスポンス（正常削除）
  - 権限チェックの統合テスト: 権限なしユーザーによるCRUD操作の403レスポンス
  - _Requirements: 8.11, 12.1, 12.2, 13.1, 13.2, 13.3, 13.4_

- [x] 16.2 (P) フロントエンド新機能の単体テストを作成する
  - usePermissionフックのテスト: hasPermission、hasAllPermissions、hasAnyPermissionの動作確認
  - usePermissionフックのテスト: 権限未ロード時のデフォルトfalse動作
  - DeleteConfirmDialogのテスト: 削除確認表示、削除実行、エラーメッセージ表示、二重送信防止
  - ContractFormバリデーションのテスト: 必須チェック、範囲チェック、論理チェック、条件付きチェック
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 13.5_

- [x] 16.3 E2Eテストに削除・バリデーション・権限フローを追加する
  - 削除フロー: 削除ボタン → 確認ダイアログ → 削除成功 → トースト表示 → 一覧画面遷移
  - 削除制約フロー: 子契約が存在する契約書の削除 → エラーメッセージ表示
  - 削除制約フロー: 契約済ステータスの契約書の削除 → エラーメッセージ表示
  - バリデーションフロー: 必須項目未入力での送信 → エラーメッセージ表示 → 修正 → 送信成功
  - 権限制御フロー: 権限のないユーザーでの新規作成ボタン・編集ボタン・削除ボタンの非表示確認
  - _Requirements: 8.9, 8.10, 8.11, 10.1, 10.6, 10.7, 10.8, 11.5, 11.6, 11.7, 12.1, 12.2, 13.5_

## Task 17: 部品のインラインの outline の打ち消しを外し、フォーカス表示を steering の方針へ揃える（project-management の Task 75.2 からの申し送り。利用者の判断で起票、2026-10-08）

**経緯**: project-management の Task 73.5 が steering `.kiro/steering/tech.md` に「フォーカス表示方針」を記録した（全画面の既定のフォーカス表示は `frontend/src/index.css` の `@layer base` の `:focus-visible`。部品の側でインラインの `outline: 'none'` を書かない。独自の輪を描く場合は 2px 以上・コントラスト比 3:1 以上。是正は各機能のスペックの責務）。同スペックの Task 75.2（2026-10-08、HEAD `c8036acd`）の実測で、本スペックの部品・ページに、方針から外れたインラインの `outline: 'none'` が 3 か所残っている

- [x] 17.1 本スペックの部品・ページのインラインの `outline: 'none'` を外し、フォーカス表示を 2px 以上・3:1 以上にする
  - 対象（2026-10-08 の実測。着手時に `grep -rnE "outline: ?['\"]none['\"]"` で測り直すこと）:
    - `frontend/src/components/contract/ContractForm.tsx`（3 か所）
  - インラインの `outline: 'none'` を外し、共通の輪に一本化する（project-management の Task 73.6、trading-partner-management の Task 33.1 の前例）。自前の影の輪など、代わりの表示が 3:1 に届かないものも同じ変更で外すか強める。対象の画面のフォーカスを受ける要素を、`e2e/specs/trading-partners/trading-partner-focus-visible.spec.ts` と同じ判定（実線または影の輪が 2px 以上・背景とのコントラスト比 3:1 以上・フォーカスが離れたら消える）で網羅して測り、満たさないものをまとめて直す
  - 挙動（表示）の変更であるため RED → GREEN で進め、単体（インラインで outline を打ち消さないこと）と E2E（対象の画面の Tab の一巡）で主張する。要件にフォーカス表示を定める受入基準が無い場合、`@requirement` の印は掲げない
  - _Boundary: 本スペックの部品・ページのフォーカス時の表示_

## Task 18: 機能レベル検証の NO-GO の 4 件を正す（利用者の判断で起票、2026-10-09）

**経緯**: Task 17.1 の完了後の機能レベル検証（2026-10-09、HEAD `77bfad6b`、NO-GO）が、約束されていて実装されていない点と、実際の画面で再現する不具合を確かめた。テスト（backend 単体 6233・frontend 単体 12179・統合 1083・E2E 74）はすべて緑で、既存の検証では検出できていなかった。いずれも初期実装（`db837e5e`）から残っている。

- [x] 18.1 変更契約の編集画面でフォームの値が基契約書の値で上書きされないようにする
  - **事実**: `frontend/src/components/contract/ContractForm.tsx` の 463〜497 行付近の、`formData.parentContractId` を見て基契約書を取得する useEffect に、作成のときに限る条件が無い。編集の初期化で `parentContractId` に `initialData.parentContractId` が入った直後に基契約書を取得し、見積書・日付・税率・文章の欄・監理者をすべて基契約書の値で上書きする。test 環境で、契約日 2026-05-05・税率 8%・支払条件 `AMENDED_TERMS` の変更契約の編集画面を開くと、基契約書の値（`2026-01-01`・`10`・`PARENT_TERMS`）が表示された。このまま保存すると変更契約の内容が基契約書の値で書き換わる。単体（`ContractForm.test.tsx` の編集モードは種類の radio の無効化だけを主張）と E2E（新規契約の編集だけ）はこれを捕まえていない
  - 既定値の上書きは作成のとき（または初期値と異なる基契約書を選び直したとき）に限り、編集のときは変更前を並べるための基契約書の詳細の取得だけを行う
  - 挙動の修正であるため RED → GREEN で進める。単体（編集モードで initialData の値が保たれる）と E2E（変更契約の編集画面に保存済みの変更後の値が表示され、保存しても変わらない）で主張し、現状で赤になることを先に示す
  - _Requirements: 9.1, 9.2_
  - _Boundary: ContractForm の基契約書による既定値の設定と、編集のときの初期化_

- [x] 18.2 契約書の詳細画面に請負者（自社）を表示する
  - **事実**: `frontend/src/pages/ContractDetailPage.tsx` の 565〜575 行付近は工事名・工事場所・発注者だけを表示し、請負者が無く、CompanyInfo も取得していない。フォームの側（`ContractForm.tsx` の 747〜749 行付近）は請負者を表示している。design.md の構成図（90〜91 行付近）は詳細画面が CompanyInfo に依存すると描く
  - 詳細画面で自社情報を取得して「請負者」を表示する。自社情報が未登録・取得の失敗のときの表示も決めて設計へ規約 (a) の形で併記する
  - 挙動の追加であるため RED → GREEN で進め、単体と E2E（詳細の表示に請負者がある）で主張する
  - _Requirements: 8.1, 4.5_
  - _Boundary: 契約書の詳細画面の自動表示項目_

- [x] 18.3 契約書の作成・更新で、プロジェクトと見積書の存在・所属・論理削除を確かめる
  - **事実**: design.md は、見積書は同じプロジェクトのものであること（364 行付近）、論理削除済みの見積書を参照したら 422（922 行付近）、見積書やプロジェクトが無ければ 404（917 行付近）を約束する。`backend/src/services/contract.service.ts` の create（297 行付近〜）と update（343 行付近〜）は estimateId の所属も deletedAt も確かめず、他プロジェクトの見積書や論理削除済みの見積書を指定しても通る。存在しない見積書・プロジェクトは外部キー違反となり、`errorHandler.middleware.ts` の「Other Prisma errors」で 400「Database operation failed」として返る
  - create と update で、プロジェクトが無ければ 404、見積書が無ければ 404、他プロジェクトの見積書または論理削除済みの見積書なら 422 を返す（design.md の約束どおり）。エラーの形は既存の Problem Details に揃える
  - 挙動の変更であるため RED → GREEN で進め、単体と統合（各ケースの状態コードと応答）で主張する
  - _Requirements: 2, 3_
  - _Boundary: 契約書の作成・更新の参照先の検証（service）とその検証_

- [x] 18.4 契約書の一覧にページ送りを付け、21 件目以降に到達できるようにする
  - **事実**: `frontend/src/pages/ContractListPage.tsx` の 30〜33 行付近と 328〜331 行付近が `page=1, limit=20` 固定で、ページ送りの UI が無い。399 行付近の「全{totalCount}件」は総数を出すため、21 件目以降は表示されないのに件数だけは見える
  - **利用者の判断（2026-10-09）**: 全件を取得する形ではなく、**ページ送りを付ける**。他の一覧画面のページ送りの部品・作法に揃える
  - 挙動の追加であるため RED → GREEN で進め、単体と E2E（21 件以上で 2 ページ目へ移り、21 件目が表示される）で主張する。追加の操作のフォーカス表示は steering の「フォーカス表示方針」に従い、Task 17.1 の E2E（`e2e/specs/contracts/contract-management-focus-visible.spec.ts`）の一覧の巡回の期待値も更新する
  - _Requirements: 1.1_
  - _Boundary: 契約書の一覧画面のページ送り_

- [x] 18.5 監理者の選択欄が取引先の一覧を取得できない状態を、画面の側の送り方を正して直す（利用者の判断で起票、2026-10-10）
  - **事実**: Task 18.1 の実装と独立レビュー（2026-10-10）が test 環境で確かめた。`frontend/src/components/contract/ContractForm.tsx` の 976 行付近が `filterTypes={['CUSTOMER','SUBCONTRACTOR']}` を渡し、project-management の部品 `frontend/src/components/projects/TradingPartnerSelect.tsx` が API クライアント（`frontend/src/api/trading-partners.ts` の 96 行付近の `type.join(',')`）を通して `type=CUSTOMER,SUBCONTRACTOR` を送る。backend の `tradingPartnerFilterSchema.type` は単一の値だけを受け付けるため 400「無効な種別です」が返り、新規契約・変更契約・編集のどの画面でも監理者を選べず、編集では選択済みの監理者の名前も表示されない。呼び出しは `db837e5e`（2026-03-14、契約書管理機能の追加）からで、導入時から動いていない。既存の E2E（REQ-3.8）は UI の存在しか見ず、単体は TradingPartnerSelect をモックしていたため検出できなかった
  - **利用者の判断（2026-10-10）**: backend の一覧 API の契約（trading-partner-management の所管）は変えず、**画面の側の送り方を正して直す**（例: 種別ごとに取得してまとめる。他スペックの部品や API クライアントを変える場合は、その利用者への影響を確かめること）
  - 挙動の修正であるため RED → GREEN で進める。単体（モックではなく API クライアントの送る値を確かめる）と E2E（新規契約・変更契約・編集で監理者の候補に顧客と協力業者が出て、選んで保存し、詳細・編集で名前が表示される）で主張し、現状で赤になることを先に示す
  - _Requirements: 3.8, 5.3, 9.1_（起票時は 3.8, 5.1 と書いた。5.1 は基となる契約書の選択で、変更契約の監理者の欄は 5.3、編集画面の表示は 9.1 であることを 2026-10-10 の独立レビューで確かめて正した）
  - _Boundary: 契約書のフォームの監理者の候補の取得_

**検証が記録した警告（起票していない。扱いは利用者の判断を待つ）**: (a) 11.1 の再試行ボタンは読み込みの失敗のときだけで、作成・保存・ステータス変更の失敗はトーストだけ。削除のダイアログは 422 以外をすべて「削除に失敗しました」にする（`DeleteConfirmDialog.tsx` の 147 行付近）。(b) 11.4 に最新データを読み直す導線が無い（`ContractEditPage.tsx` の 198〜202 行付近）。(c) 楽観ロックの確認と更新が別の処理で、同時更新の競合を防げない（`contract.service.ts` の 345〜356 行付近）。(d) 同じ router を 2 か所に割り当て（`app.ts` の 403〜404 行付近）、`/api/projects/:pid/contracts/:id` で URL の projectId と契約書の所属を確かめていない。(e) 金額が整数に限られず、税率の表示が `String(rate*100)` で浮動小数の誤差が出うる。(f) 作成・編集画面は URL を直接開けば権限が無くても表示される。(g) E2E の主張が見出しだけ・無い受入基準がある（4.1〜4.5、11.1〜11.6 のトースト、13.5）

## Task 19: 案件の閲覧範囲（user-authentication の要件39）を本スペックの API へ適用する（user-authentication の機能検証からの起票。利用者の判断で起票、2026-10-25）

**経緯**: IPA の注意喚起（2026-10-09）の是正で、user-authentication が要件39（案件単位の閲覧範囲）を設け、判定の部品（backend/src/services/project-scope.service.ts の `evaluateProjectAccess`・`buildProjectScopeWhere`、backend/src/middleware/project-scope.middleware.ts の `requireProjectScope`）を実装した（同スペックのタスク52.1）。同スペックが適用したのは案件そのもの（`/api/projects`、タスク52.3）だけである。同スペックの design.md の Boundary Commitments の Out of Boundary は、各業務機能の API への `requireProjectScope` の適用と子リソースから案件 ID を引く解決関数を各 spec の所管と定め、是正計画（docs/security/ipa-alert-20261009-remediation-plan.md）の §5.11 が本スペックの項目（入れ子のルートでリソースが親 ID に属するかの照合、閲覧範囲の適用）を挙げる。同スペックの機能検証（2026-10-25、HEAD `b85b8124`）が、どの所管 spec にも適用のタスクが無く、本スペックの API が案件の範囲を判定しない（担当外の利用者が ID 指定で他の案件の契約書を読み書きできる）ことを確かめた。利用者の判断（2026-10-25、案 A）で各所管 spec へ起票する（site-survey の Task 115.347 と同じく、上流の user-authentication からの起票）。本スペックには出力の機能が無いため、要件40 の出力の記録は対象外である

- [x] 19.1 本スペックの API に案件の閲覧範囲（user-authentication の要件39）を適用し、入れ子の経路で契約書の所属を照合する
  - 対象（2026-10-25、HEAD `b85b8124` の実測。行は経路の定義の行。着手時に測り直すこと）:
    - backend/src/routes/contracts.routes.ts（`/api/projects/:projectId/contracts` と `/api/contracts`）: `GET /`（100）、`GET /:id`（160）、`POST /`（226）、`PUT /:id`（307）、`PATCH /:id/status`（389）、`DELETE /:id`（454）
  - 契約書の ID から案件 ID を引く解決関数を本スペックが持ち、`requirePermission` の後に `requireProjectScope` を置く（user-authentication の design.md の「ProjectScopeGuard（`requireProjectScope`）」の節。前に置くと権限なしの 403 を主張する既存の統合テストが 404 で落ちる〔同スペックの tasks.md の Implementation Notes の 52.2 の区分 D〕）。範囲外と不在は同じ汎用の 404（`NOT_FOUND`）にし、本文に案件 ID など存在を推測できる情報を含めない（39.2）。作成の元にする見積書・基となる契約書も同じ案件の範囲で判定する。案件をまたぐ一覧・検索・件数があれば `buildProjectScopeWhere` の条件で絞る（39.3）
  - **入れ子の経路の所属の照合**（是正計画 §5.11、Task 18 の検証が記録した警告 (d)）: 同じ router が 2 か所に載り、`/api/projects/:projectId/contracts/:id` で URL の `projectId` と契約書の所属を確かめていない。所属しない組み合わせは不在と同じ 404 にする（判定は契約書が属する案件で行い、URL の `projectId` だけで範囲を判定しない）
  - **既存のテストの扱い**（user-authentication の 52.2 の記録の区分 B）: 統合 contract.api の `PROJECT_NOT_FOUND` の主張は、404 の本文が `NOT_FOUND` に変わるだけで落ちる。範囲外と不在を同じ本文にする 39.2 に合わせて改める（主張を消さない）
  - 挙動の変更であるため RED → GREEN で進める。統合テストで、担当外の利用者の ID 指定と所属しない入れ子の経路が不在と同じ 404 になり DB が変わらないこと、一覧に出ないこと、担当者・作成者・全案件閲覧の権限では従来どおりであることを主張する。E2E で担当外の利用者が契約書の URL を直接開くと見つからない扱いになることを確かめる
  - 本スペックの受入基準として持つか（是正計画 §4 は、各業務 spec が自分の適用箇所を受入基準として持つとする）は requirements.md の改訂と被覆の印を伴うため、着手時に利用者の判断を得る
    - **判断の結果（2026-10-27、利用者の判断）**: 本スペックの受入基準として持つ。requirements.md に Requirement 14（案件の閲覧範囲の適用）を新設した。本タスクの適用は 14.1〜14.7 が受ける。入れ子の経路（`/api/projects/:projectId/contracts/:id`）で契約書が経路のプロジェクトに属さなければ不在と同じ 404 でデータを変えない（14.4。判定は契約書が属する案件で行う）と条文に定めた。作成・更新の要求が指す見積書は契約書のプロジェクトとの所属を照合しているが、存在しない見積書の 404 と他のプロジェクトの見積書の 422 で応答が分かれ実在を推測させるため、属さなければ見積書の不在と同じ応答で作成・更新しない（14.5）と定めた（不在の側の 404 へ揃える。422 へ揃える案を採らない理由は design.md の同章の「作成・更新の見積書」）。変更契約の基となる契約書は不在と他のプロジェクトの場合が既に同じ 422 と同じ本文であり、これを 14.6 として固定した。複数の契約書を一度に指定する一括の経路は無く（2026-10-27 の実測）、全件か無しかの受入基準は置かない。案件をまたぐ一覧・検索・件数の経路は無く（2026-10-27 の実測）、契約書の一覧は経路の `projectId` の判定で範囲内に限られる（14.7）。本スペックはファイルの署名付きURLを発行せず、出力の機能も無い（2026-10-27 の実測）。案件の範囲を含意する既存の条文を requirements.md で検め、Requirement 13.1（認証済みユーザーのみに一覧・詳細の閲覧を許可する）・13.2（適切な権限チェック）・13.4（権限のないユーザーに 403）が、認証とロールの権限だけで全プロジェクトの契約書の閲覧・操作を許し範囲外も 403 で拒否すると読めたため、閲覧範囲で読む形へ改訂し改訂の記録と採らなかった案（design.md だけで読み替える案）を同要件に残した。design.md は「Requirement 14: 案件の閲覧範囲の適用」章を足し、Requirements Traceability・API Contract・Error Categories and Responses・Security Considerations の当初の記述は記録として残して置き換えを書き添えた。上の「既存のテストの扱い」に加え、他のプロジェクトの見積書を指す作成・更新の 422 を主張する統合テストは 14.5 に合わせて改める（主張を消さない）。被覆の印は本タスクの統合テスト・E2E が名乗る（新設時点では未被覆）
  - _Requirements: 13.1, 13.2, 13.4, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_
  - _Boundary: 本スペックの API の案件の範囲の判定と入れ子の経路の所属の照合_

## Task 20: 論理削除済みの基となる契約書の拒否と、入れ子の経路の食い違いの記録（利用者の判断で起票、2026-10-29）

**経緯**: 利用者の判断（2026-10-29「推奨案で進める」）で起票する。(1) 変更契約の作成が基となる契約書の論理削除を確かめず、同じプロジェクトの論理削除済みの契約書を基に変更契約を作成できる（2026-10-29 の調査。`ContractService` の `create` が基となる契約書を `findUnique` で読み `deletedAt` を見ていない）。(2) user-authentication が要件39.8 を加え、入れ子の経路で経路の案件と対象の実際の案件が食い違う要求のうち、実際の案件が閲覧範囲外のものを要件39.7 の記録の対象とした（同 spec の design.md の ProjectScopeGuard の節の「食い違いの記録の各業務 spec への起票先」の contract-management の行）。本機能の判定部品は食い違いを不在として範囲を判定せず、記録しない。requirements.md に 14.8・14.9 を加え、design.md の末尾の章「2026-10-29 の追加: 基となる契約書の論理削除・食い違いの記録・不在の表示」に設計を置いた

- [x] 20.1 変更契約の作成で、論理削除済みの基となる契約書を不在と同じ応答で拒否する
  - `ContractService` の作成の処理で、基となる契約書が論理削除済みなら、存在しない・経路のプロジェクトに属さない基となる契約書と同じ 422（`CONTRACT_VALIDATION_ERROR`、14.6 と同じ本文）で拒否し、契約書を作成しない。論理削除を所属の不一致より先に確かめ、論理削除済みの基となる契約書は属する案件が範囲外でも範囲外の拒否として記録しない（design.md の同章の「決定」）
  - 挙動の変更であるため RED → GREEN で進める。単体（`ContractService` の作成。同じプロジェクトと範囲外の案件の論理削除済みの基となる契約書で 422 と同じ本文、作成されず記録されない）と統合（存在しない基となる契約書と同じ 422 と本文、契約書の件数が変わらない）で主張し、現状で赤になることを先に示す
  - 統合テストと単体テストで、論理削除済みの基となる契約書を指す変更契約の作成が不在と同じ応答で拒否され、契約書が増えない状態になる
  - _Requirements: 14.8_
  - _Boundary: ContractService の変更契約の作成の基となる契約書の照合_

- [x] 20.2 入れ子の経路の食い違いで、契約書の実際の案件が範囲外なら記録する（user-authentication の要件39.8 の適用）
  - backend/src/middleware/contract-management-project-scope.middleware.ts の `requireContractProjectScope` の解決関数が、経路の `projectId` と契約書の案件が食い違うとき、null ではなく上流の `projectMismatch`（契約書の案件 ID）を返すよう切り替える。応答は範囲の内外にかかわらず不在と同じ汎用の 404 のまま、データを変えない。契約書の不在・論理的な取り除きは従来どおり null で記録しない。同ファイルの冒頭の注釈を改める
  - **既存のテストの書き換え**（条文どおりに。主張を消さない）: 統合テスト（`backend/src/__tests__/integration/contract-management-project-scope.api.integration.test.ts`）の「範囲内の案件の配下の経路で範囲外の案件の契約書を指すと、契約書の不在と同じ 404 にし、データを変えず、記録しない」は、記録の差 0 の主張を `PROJECT_SCOPE_DENIED` が 1 件増える（対象は契約書の実際の案件）主張へ改め、題名も改める。単体テスト（`backend/src/__tests__/unit/middleware/contract-management-project-scope.middleware.test.ts`）の「二重マウントで経路の案件 ID と契約書の案件が食い違うときは、範囲を判定せずに不在と同じ 404 にし、記録しない（14.4）」は、範囲外なら記録 1 件で 404、範囲内なら記録なしで 404 の二通りへ改める。範囲内どうしの食い違いの統合テスト（記録の差 0）は条文どおりで変えない
  - E2E（`e2e/specs/contracts/contract-management-project-scope.spec.ts` の入れ子の経路のテストか新しいテスト）で、範囲外の案件の契約書を範囲内の案件の経路で指す要求が 404 になり監査の記録が 1 件増えることを主張し、`@requirement contract-management/REQ-14.9` と上流の 39.8 の被覆の印（user-authentication のタスク63.2 の申し送り）を置く
  - 挙動の変更であるため RED → GREEN で進める。上流の 63.1 が入る前に着手しない
  - 単体・統合・E2E で、食い違いの要求が範囲外のときだけ記録され、どの場合も不在と同じ 404 でデータが変わらない状態になる
  - _Depends: user-authentication の Task 63.1_
  - _Requirements: 14.9_
  - _Boundary: requireContractProjectScope の解決関数と、食い違いの記録を主張する本機能のテスト_

## Task 21: 契約書の画面が 404 を受けたときの不在の表示（利用者の判断で起票、2026-10-29）

**経緯**: 利用者の判断（2026-10-29「推奨案で進める」）で起票する。Requirement 14.2・14.3 により閲覧範囲外の契約書・プロジェクトへの要求は不在と同じ 404 になるが、画面は 404 を分類しない（2026-10-29 の調査。行は同日の実測で、着手時に測り直すこと）: `frontend/src/utils/contractErrorHandler.ts` の `classifyContractError` に 404 の分岐が無く、予期しないエラーの文言になる（`ContractDetailPage.tsx` の 356・408 行付近、`ContractCreatePage.tsx` の 139・170 行付近）。`ContractEditPage.tsx` の 154 行付近は `err.message === 'Not Found'` で比べており、応答の文言と一致せず分岐に入らない（不具合）。`ContractListPage.tsx` の 339 行付近は失敗を一律に取得の失敗の固定の文言にする。`DeleteConfirmDialog.tsx` の 142 行付近は 422 以外を一律に削除の失敗にする。サーバーの応答は変えない（user-authentication の要件39.2）。requirements.md に 11.8・11.9 を加え、design.md の末尾の章「2026-10-29 の追加: 基となる契約書の論理削除・食い違いの記録・不在の表示」に設計を置いた

- [x] 21.1 契約書の一覧・詳細・作成・編集の画面と削除のダイアログで、404 を見つからない旨の表示にする
  - `classifyContractError` に 404 の分岐を足し、見つからない種別と日本語の文言を返す（見積書の不在 `ESTIMATE_NOT_FOUND` はサーバーの本文を表示する）。読み込みの 404 では共通部品 `ResourceNotFound`（`frontend/src/components/common/ResourceNotFound.tsx`）で見つからない旨と戻り先のリンク（契約書の画面は案件の契約書の一覧、一覧・作成の画面はプロジェクトの一覧）を表示し、予期しないエラー・取得の失敗の文言と再試行の釦を出さない。編集の画面の 404 の見分けを状態コードで行うよう直す。作成・保存・ステータスの変更・削除の 404 では見つからない旨のメッセージを表示する。文言の逐語は design.md の同章の「決定」へ記す
  - 挙動の変更・不具合の修正であるため RED → GREEN で進め、現状で赤になることを先に示す。単体（`classifyContractError` の 404、各画面の 404 の表示、編集の画面の 404、削除のダイアログの 404）と E2E（担当外の利用者が契約書の詳細・編集の URL を開くと見つからない旨と一覧へのリンクが出て存在しない契約書と同じ表示になる、範囲外のプロジェクトの一覧・作成の URL でプロジェクトが見つからない旨が出る、開いた後に論理削除された契約書の操作で見つからない旨のメッセージが出る）で主張し、`@requirement contract-management/REQ-11.8`・`REQ-11.9` の印を置く
  - 振る舞いを変えるため、変えた表示（予期しないエラー・取得の失敗の文言、再試行の釦）を e2e/ 全体で grep して既存の E2E を選び、流す（`contract-management-project-scope.spec.ts` の直接 URL を開くテストは不在と同じ表示の比較を持つ）
  - 単体と E2E で、404 を受けた画面が見つからない旨を表示し、予期しないエラー・取得の失敗の文言を出さない状態になる
  - _Requirements: 11.8, 11.9_
  - _Boundary: ContractListPage, ContractCreatePage, ContractDetailPage, ContractEditPage, DeleteConfirmDialog, classifyContractError_

## Task 22: 論理削除済みの契約書・基となる契約書の範囲外の記録（user-authentication の要件39.8 の改訂の適用。利用者の判断で起票、2026-10-30）

**経緯**: 利用者の判断（2026-10-30「推奨案で進める」）で起票する。user-authentication が要件39.8 を改め、記録しない「論理削除」を案件そのものの論理削除に限り、対象のデータが論理削除済みでも実在して実際の案件が範囲外なら記録すると定めた（同 spec の requirements.md の要件39 の改訂の記録、design.md の ProjectScopeGuard の節の「対象のデータの論理削除の扱い」とその起票先の一覧の contract-management の行）。本機能は、解決関数 `findProjectIdOfContract` が論理削除済みの契約書で null を返し、`ContractService` の `createWithin` が論理削除済みの基となる契約書を所属の照合より先に 422 で弾くため、範囲外の案件のものでも記録しない（2026-10-30 の調査）。requirements.md の 14.8・14.9 を改め（改訂の記録を同要件に残した）、14.10 を加え、design.md の末尾の章「2026-10-30 の追加: 論理削除済みの契約書の範囲外の記録」に設計を置いた。応答とデータと画面は変えない

- [x] 22.1 解決関数が論理削除済みの契約書にも実際の案件を返し、範囲外なら記録されるようにする
  - backend/src/middleware/contract-management-project-scope.middleware.ts の `findProjectIdOfContract` を、行が無いときだけ null を返し、行が実在すれば論理削除済みかどうかを添えて案件 ID を返す形へ改める。`requireContractProjectScope` の解決関数は、論理削除済みの契約書では経路の形（`/api/contracts/:id`、同じ案件の配下の経路、食い違いの経路）を問わず `projectMismatch(契約書の案件 ID)` を返す（同じ案件の経路と `/api/contracts` のマウントで論理削除済みの契約書を指したときの従来の汎用の 404 を保つための切り分け。design.md の同章の「決定」の表）。論理削除済みでない契約書の振る舞い（一致なら案件 ID、食い違いなら `projectMismatch`）は変えない。同ファイルの冒頭の注釈と関数の注釈を改める
  - **既存のテストの書き換え**（条文どおりに。主張を消さない）: 単体（`backend/src/__tests__/unit/middleware/contract-management-project-scope.middleware.test.ts`）の「契約書の ID から案件 ID を引き、契約書が無いか論理的に取り除かれていれば null を返す」と「論理的に取り除かれた契約書は、案件が範囲外でも範囲を判定せずに不在と同じ 404 にし、記録しない」の 2 本。統合（`backend/src/__tests__/integration/contract-management-project-scope.api.integration.test.ts`）の「論理的に取り除かれた契約書は、範囲の内外を問わず存在しない契約書と同じ汎用の 404 を返す」（範囲外の利用者で記録の差 0）と「範囲内の案件の配下の経路で範囲外の案件の論理削除済みの契約書を指すと、…記録しない」の 2 本。改め方は design.md の同章の「既存のテストの書き換え」のとおり（範囲外なら記録 1 件、範囲内と案件そのものの論理削除では記録なし、どれも存在しない契約書と同じ汎用の 404 で本体へ進まずデータが変わらない）
  - E2E（`e2e/specs/contracts/contract-management-project-scope.spec.ts`）で、担当外の利用者が範囲外の案件の論理削除済みの契約書を `/api/contracts/:id` の詳細と範囲内の案件の配下の経路で指すと、存在しない契約書と同じ 404 になり監査ログの `PROJECT_SCOPE_DENIED` が 1 件ずつ増えることを主張し、`@requirement contract-management/REQ-14.9`・`REQ-14.10` と上流の 39.8 の改訂の被覆の印（user-authentication のタスク66.1 の申し送り）を置く。被覆の印を足したら `check:design-measurement-freshness` を名指しで流す
  - 振る舞いを変えるため、変えた応答の経路（契約書の詳細・更新・ステータスの変更・取り除きの 404、`PROJECT_SCOPE_DENIED` の件数）を e2e/ 全体で grep して既存の E2E を選び、流す（同ファイルの 14.9 の入れ子の経路のテスト、11.9 の開いた後に論理削除された契約書の操作のテストを含む）
  - 挙動の変更であるため RED → GREEN で進め、書き換えたテストが現状で赤になることを先に示す。上流の 66.1 が入る前に着手しない
  - 単体・統合・E2E で、論理削除済みの契約書の ID 指定が範囲外のときだけ記録され、どの場合も存在しない契約書と同じ汎用の 404 でデータが変わらない状態になる
  - _Depends: user-authentication の Task 66.1_
  - _Requirements: 14.9, 14.10_
  - _Boundary: findProjectIdOfContract, requireContractProjectScope の解決関数と、論理削除済みの契約書の記録を主張する本機能のテスト_

- [x] 22.2 変更契約の作成で、範囲外の案件の論理削除済みの基となる契約書を記録する
  - backend/src/services/contract.service.ts の `createWithin` の基となる契約書の照合の順を、行が無い（422、記録しない）→ 経路のプロジェクトに属さない（`noteOutOfScopeReference` で範囲外なら記録のうえ 422）→ 同じプロジェクトで論理削除済み（422、記録しない）へ改める（design.md の同章の「決定」の「基となる契約書の照合の順」）。応答は 3 通りとも 14.6 と同じ 422 と同じ本文のまま、契約書を作成しない。照合の注釈を改める
  - **既存のテストの書き換え**（条文どおりに。主張を消さない）: 単体（`backend/src/__tests__/unit/services/contract.service.test.ts`）の「変更契約の作成の要求が論理削除済みの基となる契約書（%s）を指すと、不在と同じ 422 の本文にし、作成せず、記録しない（14.8）」の 1 本を、同じプロジェクトでは判定も記録もせず、範囲外の案件では判定して記録 1 回（対象は基となる契約書の案件）の主張へ分ける。統合（`backend/src/__tests__/integration/contract-management-project-scope.api.integration.test.ts`）の「変更契約の作成の要求が論理削除済みの基となる契約書を指すと、…記録しない」の 1 本を、同じプロジェクトの論理削除済みの基では記録が増えず、範囲外の案件の論理削除済みの基では 1 件増える主張へ改める。どちらも不在と同じ 422 と本文、契約書の件数が変わらない主張を保つ
  - E2E（`e2e/specs/contracts/contract-management-project-scope.spec.ts`）で、範囲外の案件の論理削除済みの契約書を基に指す変更契約の作成が存在しない基と同じ 422 になり監査ログの `PROJECT_SCOPE_DENIED` が 1 件増え、契約書が作られないことを主張し、`@requirement contract-management/REQ-14.8` の印を置く。被覆の印を足したら `check:design-measurement-freshness` を名指しで流す
  - 挙動の変更であるため RED → GREEN で進め、書き換えたテストが現状で赤になることを先に示す。上流の 66.1 が入る前に着手しない
  - 単体・統合・E2E で、範囲外の案件の論理削除済みの基となる契約書を指す変更契約の作成が不在と同じ 422 で記録され、同じプロジェクトの論理削除済みの基では記録されない状態になる
  - _Depends: user-authentication の Task 66.1_
  - _Requirements: 14.8_
  - _Boundary: ContractService の変更契約の作成の基となる契約書の照合と、その記録を主張する本機能のテスト_
