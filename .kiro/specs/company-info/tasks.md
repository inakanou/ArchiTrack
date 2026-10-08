# Implementation Plan

## Task Overview

自社情報登録機能の実装タスク。TradingPartner実装パターンを踏襲し、TDD（テスト駆動開発）手法で実装を進める。

**総タスク数**: 7メジャータスク、22サブタスク
**要件カバレッジ**: 9要件、43受入基準すべてをカバー

---

## Tasks

- [x] 1. データベース層の実装
- [x] 1.1 (P) Prismaスキーマの定義とマイグレーション実行
  - CompanyInfoモデルをschema.prismaに追加（シングルトンパターン）
  - 楽観的排他制御用のversionフィールドを含める
  - マイグレーションを作成・適用してテーブルを生成
  - _Requirements: 2.7, 9.7_

- [x] 1.2 (P) 権限定義のシードデータ追加
  - company_info:read権限とcompany_info:update権限をseed-helpers.tsに追加
  - adminロールとuserロールに権限を割り当て
  - シードデータの実行で権限が正しく登録されることを確認
  - _Requirements: 6.6, 6.7, 6.8_

---

- [x] 2. バックエンドバリデーション層の実装
- [x] 2.1 Zodスキーマのテスト作成
  - 必須フィールド（会社名、住所、代表者）のバリデーションテストを作成
  - 文字数制限バリデーションのテストを作成（会社名200、住所500、代表者100、電話番号20、FAX20、メール254）
  - 電話番号・FAX番号形式のバリデーションテスト（数字、ハイフン、括弧のみ許可）を作成
  - メールアドレス形式のバリデーションテストを作成
  - 適格請求書発行事業者登録番号形式のバリデーションテスト（T+13桁数字）を作成
  - versionフィールドのバリデーションテストを作成
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

- [x] 2.2 Zodスキーマの実装
  - テストが通過するようにcompany-info.schema.tsを実装
  - updateCompanyInfoSchemaをexportしてルート層で使用可能にする
  - バリデーションエラーメッセージを日本語で定義
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

---

- [x] 3. バックエンドサービス層の実装
- [x] 3.1 サービス層のテスト作成
  - getCompanyInfo: 登録済みデータの取得成功テストを作成
  - getCompanyInfo: 未登録時にnullを返却するテストを作成
  - upsertCompanyInfo: 新規作成成功のテストを作成
  - upsertCompanyInfo: 更新成功のテストを作成
  - upsertCompanyInfo: 楽観的排他制御で競合検出時のエラーテストを作成
  - 監査ログ記録のテストを作成（company_info_created、company_info_updated）
  - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.8, 6.10_

- [x] 3.2 サービス層の実装
  - テストが通過するようにcompany-info.service.tsを実装
  - Prismaのupsertを使用してシングルトンパターンを実現
  - versionフィールドによる楽観的排他制御を実装
  - 監査ログサービスと連携して操作を記録
  - ConflictError（409）を適切に送出
  - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.8, 6.10_

---

- [x] 4. バックエンドAPI層の実装
- [x] 4.1 APIルートのテスト作成
  - GET /api/company-info: 認証チェックテストを作成
  - GET /api/company-info: 権限チェックテスト（company_info:read）を作成
  - GET /api/company-info: 登録済みデータ取得成功テストを作成
  - GET /api/company-info: 未登録時に空オブジェクト返却テストを作成
  - PUT /api/company-info: 認証チェックテストを作成
  - PUT /api/company-info: 権限チェックテスト（company_info:update）を作成
  - PUT /api/company-info: バリデーションエラーテスト（400）を作成
  - PUT /api/company-info: 新規作成成功テストを作成
  - PUT /api/company-info: 更新成功テストを作成
  - PUT /api/company-info: 楽観的排他制御競合テスト（409）を作成
  - 未認証アクセス時の401テストを作成
  - 権限不足時の403テストを作成
  - _Requirements: 6.1, 6.2, 6.4, 6.7, 6.8, 6.9, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10_

- [x] 4.2 APIルートの実装
  - テストが通過するようにcompany-info.routes.tsを実装
  - authenticateミドルウェアで認証を検証
  - requirePermissionミドルウェアで権限を検証
  - validateミドルウェアでリクエストボディを検証
  - GETエンドポイントで自社情報を取得（未登録時は空オブジェクト）
  - PUTエンドポイントで自社情報を作成・更新
  - DELETEエンドポイントは提供しない
  - Express Routerをapp.tsに登録
  - _Requirements: 6.1, 6.2, 6.4, 6.7, 6.8, 6.9, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10_

---

- [x] 5. フロントエンドAPIクライアント・バリデーションの実装
- [x] 5.1 (P) APIクライアントの実装
  - getCompanyInfo関数を実装（GET /api/company-info）
  - updateCompanyInfo関数を実装（PUT /api/company-info）
  - エラーハンドリング（401、403、409、ネットワークエラー）を実装
  - _Requirements: 9.1, 9.4, 7.1, 7.2, 7.3_

- [x] 5.2 (P) フロントエンドバリデーションスキーマの実装
  - バックエンドと同一のZodスキーマをフロントエンド用に作成
  - フォーム入力時のリアルタイムバリデーションで使用
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

---

- [x] 6. フロントエンドUI層の実装
- [x] 6.1 CompanyInfoFormコンポーネントのテスト作成
  - 空のフォーム表示テストを作成
  - プリセットデータ表示テストを作成
  - 必須フィールドのバリデーションエラー表示テストを作成
  - 形式バリデーションエラー表示テストを作成
  - 保存ボタンクリック時の保存処理テストを作成
  - リセットボタンクリック時のリセット処理テストを作成
  - ローディング状態でのボタン無効化テストを作成
  - isDirty状態管理テストを作成
  - _Requirements: 1.2, 1.3, 1.4, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3_

- [x] 6.2 CompanyInfoFormコンポーネントの実装
  - テストが通過するようにCompanyInfoForm.tsxを実装
  - TradingPartnerFormパターンを踏襲したフォームレイアウト
  - 各入力フィールドのバリデーションエラー表示
  - 保存ボタン・リセットボタンの配置と動作
  - ローディング中のインジケーター表示とボタン無効化
  - フォーム変更状態（isDirty）の追跡
  - _Requirements: 1.2, 1.3, 1.4, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3_

- [x] 6.3 CompanyInfoPageコンポーネントのテスト作成
  - 初期データ取得テストを作成
  - ローディング状態表示テストを作成
  - エラー状態表示テストを作成
  - パンくずナビゲーション表示テストを作成
  - 保存成功時のToast表示テストを作成
  - 楽観的排他制御競合時のエラーメッセージ表示テストを作成
  - ネットワークエラー時のエラーメッセージと再試行ボタン表示テストを作成
  - _Requirements: 1.1, 1.5, 2.4, 2.8, 5.5, 5.6, 7.1, 7.2, 7.4_

- [x] 6.4 CompanyInfoPageコンポーネントの実装
  - テストが通過するようにCompanyInfoPage.tsxを実装
  - useEffectで初期データを取得
  - ローディング状態・エラー状態の管理
  - パンくずナビゲーション（ダッシュボード > 自社情報）の表示
  - ToastNotificationによる成功・エラーメッセージ表示
  - 楽観的排他制御競合時の「他のユーザーによって更新されました」メッセージ
  - ネットワークエラー時の再試行ボタン表示
  - _Requirements: 1.1, 1.5, 2.4, 2.8, 5.5, 5.6, 7.1, 7.2, 7.4_

- [x] 6.5 未保存確認ダイアログの実装
  - useBlockerを使用したページ離脱検出テストを作成
  - 確認ダイアログ表示テストを作成
  - テストが通過するように未保存確認ダイアログを実装
  - フォームに未保存の変更がある場合のみダイアログを表示
  - _Requirements: 3.4_

---

- [x] 7. ナビゲーション・ルーティング・E2Eテストの実装
- [x] 7.1 AppHeader修正のテスト作成
  - 「自社情報」リンク表示テストを作成
  - リンク位置テスト（取引先の右側）を作成
  - ビルディングアイコン表示テストを作成
  - リンククリック時の遷移テストを作成
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 7.2 AppHeaderの修正実装
  - テストが通過するようにAppHeader.tsxを修正
  - 「自社情報」リンクを「取引先」リンクの右側に追加
  - ビルディングアイコンを付与
  - /company-infoへのNavLinkを設定
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 7.3 ルーティング設定
  - routes.tsxに/company-infoルートを追加
  - ProtectedRouteでルートを保護
  - ProtectedLayout（AppHeader付き）を適用
  - _Requirements: 5.7, 6.2, 6.3, 6.5_

- [x] 7.4 E2Eテストの作成と実行
  - 自社情報ページ表示テスト（未登録時・登録済み）を作成
  - 新規登録フローテスト（入力 → 保存 → 成功Toast）を作成
  - 更新フローテスト（編集 → 保存 → 成功Toast）を作成
  - バリデーションエラー表示テストを作成
  - AppHeaderナビゲーションテストを作成
  - パンくずナビゲーションテストを作成
  - 未保存確認ダイアログテストを作成
  - 未認証アクセス時のリダイレクトテストを作成
  - ログイン後の元ページ遷移テストを作成
  - パフォーマンステスト（初期表示1秒以内、API応答500ms以内）を作成
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.4, 3.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.4, 6.5, 8.1, 8.2_

---

## タスク8: 除外一覧が名乗る検証道具名を実体へ揃える

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

**本スペックの所管は 7 件で、全件を次に挙げる**（2026-09-02 に実測。抜き取りではない）:

| id | 現在の `alternativeVerification.tool` |
|---|---|
| `company-info/REQ-6.9` | `Jest / Supertest` |
| `company-info/REQ-9.5` | `Jest / Supertest` |
| `company-info/REQ-9.6` | `Jest / Supertest` |
| `company-info/REQ-9.7` | `Jest / Supertest` |
| `company-info/REQ-9.8` | `Jest / Supertest` |
| `company-info/REQ-9.9` | `Jest / Supertest` |
| `company-info/REQ-9.10` | `Jest / Supertest` |

- [x] 8.1 除外一覧の道具名を実体へ揃える
  - 上表 7 件の `alternativeVerification.tool` から、実在しない `Jest` を取り除く
  - **先例に揃えること**: site-survey は Task 115.121 で自機能分 32 件を「道具名の先頭 `Jest` を `Vitest` へ置換し、`React Testing Library` / `Supertest` などの併記部分は据え置く」形で是正した。`.kiro/specs/site-survey/design.md` の `**あわせて是正した除外一覧の記述**` に続く項が、その形を逐語で記録している
  - **併記の `Supertest` は実在する**（`backend/package.json` に `supertest@^7.1.4` と `@types/supertest@^6.0.3`。2026-09-02 に実測）ため据え置いてよい。7 件はいずれも同じ `Jest / Supertest` である
  - **道具名だけを機械的に置換して終えないこと。** 除外は受入基準を分母から丸ごと外すため、`description` が約束する代替検証が現に存在するかを一件ずつ確かめること。存在しないなら道具名の是正ではなく除外の取り下げが要る
  - **JSON の整形は `npm run format:check` では見られない。** リポジトリルートの `format:check` は `prettier --check "e2e/**/*.{js,ts}" "playwright.config.{js,ts}" "scripts/**/*.ts"` であって JSON を含まず、`lint-staged` も `*.{js,ts}` だけを対象とする（2026-09-02 に実測）。`npx prettier --check e2e/requirement-exclusions.json` を直接走らせること（現況は整形済みで終了コード 0。同日に実測）
  - **検証**: `npm run check:req-exclusions` が緑であること、および上の `node -e` の出力の第一値が本スペックの件数だけ減っていること
  - **本節が `_Requirements:` を持たないのは意図である。** 本スペックの tasks.md は HEAD（コミット `9e63637`）で `_Requirements:` を 19 件持ち、`_Depends:` と `_Boundary:` はいずれも 0 件である（`git show HEAD:.kiro/specs/company-info/tasks.md | grep -c '_Requirements:'` ほか。2026-09-02 にリポジトリルートで実測）。**本節は受入基準を実装せず、除外一覧の記録の道具名を実体へ揃えるだけである。** 上表の id を `_Requirements:` に挙げると「当該受入基準を本タスクが被覆した」という偽の申告になり、被覆の集計にも入りうるため、依存と境界だけを書く
  - _Depends: site-survey スペックの Task 115.280（`64 0` の宣言の解除と台帳の追随）_
  - _Boundary: 本スペックが所管する除外項目の `alternativeVerification.tool`_

## Requirements Coverage Matrix

| 要件ID | 要件概要 | カバータスク |
|--------|----------|--------------|
| 1.1 | 自社情報フォーム表示 | 6.3, 6.4, 7.4 |
| 1.2 | 入力欄の提供 | 6.1, 6.2, 7.4 |
| 1.3 | 登録済み情報のプリセット | 6.1, 6.2, 7.4 |
| 1.4 | 未登録時の空フォーム | 6.1, 6.2, 7.4 |
| 1.5 | 見出し「自社情報」表示 | 6.3, 6.4, 7.4 |
| 2.1 | 有効データの保存 | 3.1, 3.2, 7.4 |
| 2.2 | 未登録時の新規作成 | 3.1, 3.2 |
| 2.3 | 登録済み時の更新 | 3.1, 3.2 |
| 2.4 | 成功Toast表示 | 6.3, 6.4, 7.4 |
| 2.5 | バリデーションエラー表示 | 6.1, 6.2 |
| 2.6 | ローディング表示とボタン無効化 | 6.1, 6.2 |
| 2.7 | 楽観的排他制御実装 | 1.1, 3.1, 3.2 |
| 2.8 | 競合検出時のエラー表示 | 3.1, 3.2, 6.3, 6.4 |
| 3.1 | リセットボタン表示 | 6.1, 6.2 |
| 3.2 | リセット時の復元 | 6.1, 6.2 |
| 3.3 | 未登録時のリセット | 6.1, 6.2 |
| 3.4 | 未保存確認ダイアログ | 6.5, 7.4 |
| 4.1 | 会社名最大200文字 | 2.1, 2.2, 5.2 |
| 4.2 | 住所最大500文字 | 2.1, 2.2, 5.2 |
| 4.3 | 代表者最大100文字 | 2.1, 2.2, 5.2 |
| 4.4 | 電話番号形式バリデーション | 2.1, 2.2, 5.2 |
| 4.5 | FAX番号形式バリデーション | 2.1, 2.2, 5.2 |
| 4.6 | メールアドレス形式バリデーション | 2.1, 2.2, 5.2 |
| 4.7 | メールアドレス形式エラー表示 | 2.1, 2.2, 5.2 |
| 4.8 | メールアドレス最大254文字 | 2.1, 2.2, 5.2 |
| 4.9 | 適格請求書番号形式バリデーション | 2.1, 2.2, 5.2 |
| 4.10 | 適格請求書番号形式エラー表示 | 2.1, 2.2, 5.2 |
| 5.1 | AppHeader「自社情報」リンク表示 | 7.1, 7.2, 7.4 |
| 5.2 | リンク位置（取引先の右側） | 7.1, 7.2, 7.4 |
| 5.3 | リンククリック時の遷移 | 7.1, 7.2, 7.4 |
| 5.4 | ビルディングアイコン | 7.1, 7.2, 7.4 |
| 5.5 | パンくずナビゲーション表示 | 6.3, 6.4, 7.4 |
| 5.6 | パンくずダッシュボードリンク | 6.3, 6.4, 7.4 |
| 5.7 | /company-info URL提供 | 7.3, 7.4 |
| 6.1 | 認証済みユーザーのみアクセス許可 | 4.1, 4.2 |
| 6.2 | ProtectedRoute保護 | 7.3 |
| 6.3 | ProtectedLayout適用 | 7.3 |
| 6.4 | 未認証時のリダイレクト | 4.1, 4.2, 7.4 |
| 6.5 | ログイン後の元ページ遷移 | 7.4 |
| 6.6 | 権限定義 | 1.2 |
| 6.7 | 閲覧権限要求 | 1.2, 4.1, 4.2 |
| 6.8 | 保存権限要求 | 1.2, 4.1, 4.2 |
| 6.9 | 権限不足時の403エラー | 4.1, 4.2 |
| 6.10 | 監査ログ記録 | 3.1, 3.2 |
| 7.1 | ネットワークエラー表示 | 5.1, 6.3, 6.4 |
| 7.2 | サーバーエラー表示 | 5.1, 6.3, 6.4 |
| 7.3 | セッション期限切れリダイレクト | 5.1 |
| 7.4 | ToastNotification使用 | 6.3, 6.4 |
| 8.1 | 初期表示1秒以内 | 7.4 |
| 8.2 | API応答500ms以内 | 7.4 |
| 9.1 | GET /api/company-info提供 | 4.1, 4.2, 5.1 |
| 9.2 | 登録済みデータ返却 | 4.1, 4.2 |
| 9.3 | 未登録時空オブジェクト返却 | 4.1, 4.2 |
| 9.4 | PUT /api/company-info提供 | 4.1, 4.2, 5.1 |
| 9.5 | 未存在時の新規作成 | 4.1, 4.2 |
| 9.6 | 存在時の更新 | 4.1, 4.2 |
| 9.7 | レスポンスフィールド | 1.1, 4.1, 4.2 |
| 9.8 | versionによる楽観的排他制御 | 4.1, 4.2 |
| 9.9 | version不一致時の409 Conflict | 4.1, 4.2 |
| 9.10 | 削除API非提供 | 4.1, 4.2 |

## タスク9: 部品のインラインの outline の打ち消しを外し、フォーカス表示を steering の方針へ揃える（project-management の Task 75.2 からの申し送り。利用者の判断で起票、2026-10-08）

**経緯**: project-management の Task 73.5 が steering `.kiro/steering/tech.md` に「フォーカス表示方針」を記録した（全画面の既定のフォーカス表示は `frontend/src/index.css` の `@layer base` の `:focus-visible`。部品の側でインラインの `outline: 'none'` を書かない。独自の輪を描く場合は 2px 以上・コントラスト比 3:1 以上。是正は各機能のスペックの責務）。同スペックの Task 75.2（2026-10-08、HEAD `c8036acd`）の実測で、本スペックの部品・ページに、方針から外れたインラインの `outline: 'none'` が 1 か所残っている

- [x] 9.1 本スペックの部品・ページのインラインの `outline: 'none'` を外し、フォーカス表示を 2px 以上・3:1 以上にする
  - 対象（2026-10-08 の実測。着手時に `grep -rnE "outline: ?['\"]none['\"]"` で測り直すこと）:
    - `frontend/src/components/company-info/CompanyInfoForm.tsx`（1 か所）
  - インラインの `outline: 'none'` を外し、共通の輪に一本化する（project-management の Task 73.6、trading-partner-management の Task 33.1 の前例）。自前の影の輪など、代わりの表示が 3:1 に届かないものも同じ変更で外すか強める。対象の画面のフォーカスを受ける要素を、`e2e/specs/trading-partners/trading-partner-focus-visible.spec.ts` と同じ判定（実線または影の輪が 2px 以上・背景とのコントラスト比 3:1 以上・フォーカスが離れたら消える）で網羅して測り、満たさないものをまとめて直す
  - 挙動（表示）の変更であるため RED → GREEN で進め、単体（インラインで outline を打ち消さないこと）と E2E（対象の画面の Tab の一巡）で主張する。要件にフォーカス表示を定める受入基準が無い場合、`@requirement` の印は掲げない
  - _Boundary: 本スペックの部品・ページのフォーカス時の表示_
