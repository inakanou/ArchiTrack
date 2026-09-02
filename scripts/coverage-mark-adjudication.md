# 被覆印と受入基準の対応の裁定一覧（タスク 115.188）

`e2e/specs` の被覆印が名乗る受入基準の**原文**と、その被覆印が属する区間（テスト・群）が
**実際に述べている内容**との対応を、母集団の全件について裁定した記録である。

## 1. 母集団の確定（走査は再現できる）

走査は `scripts/scan-coverage-mark-correspondence.ts` にある。合否は出さない。

```
npx tsx scripts/scan-coverage-mark-correspondence.ts            # 一致度の昇順で全件
npx tsx scripts/scan-coverage-mark-correspondence.ts --tsv      # 機械可読
npx tsx scripts/scan-coverage-mark-correspondence.ts --by-delta # 「別の条文の方が合う」順
```

区間の割り方は `scripts/check-requirement-coverage.ts` の `splitCoverageBlocks` を**そのまま**
使う（別実装を置かない）。註釈行は一致度の計算から除く。受入基準の原文を写した註釈が
一致度を押し上げ、内容の食い違いを覆い隠すためである。

実測（読み取り規則は本タスクの版で固定し、`e2e/specs` の中身だけを入れ替えて比べた）:

| 指標 | HEAD (95d1839) | 是正後 |
| --- | --- | --- |
| 読み取り規則が読める被覆印の総数（母集団） | **3695** | **3626** |
| 一致度（原文の文字bigramのうち区間に現れる割合）の中央値 | — | 0.3290 |
| 同 5 パーセンタイル / 90 パーセンタイル | — | 0.0781 / 0.5625 |
| 一致度 0.0000 の件数 | — | 9 |

**一致度は順序づけの道具であって判定の道具ではない。** 両方向の限界を実測で示す。

- 低い一致度は誤りを意味しない。E2E の本文はセレクタ・待ち合わせ・データ準備が大半を占める。
- **高い一致度も正しさを意味しない。** レビューが指摘した
  `site-survey-crud.spec.ts:443` が REQ-1.5 を名乗っていた一律ずらしは、HEAD で一致度 0.5397・
  **3695 件中 3277 位**（一致度の昇順）、「別の条文の方が合う」順でも 2213 位だった。
  **下位帯だけを見る裁定は成立しない。**

ゆえに順序づけだけに頼らず、**母集団を 12 に分割して全件を一件ずつ人手で裁定した**。
裁定は区間の表題と本文（assertion が何を主張しているか）を読み、名乗る受入基準の原文
（`.kiro/specs/<feature>/requirements.md`）と突き合わせる形で行った。

裁定の結果、**438 件**を「名乗りと内容が対応していない疑い」として挙げた（母集団の 11.9%）。
レビューが抜き取りで挙げた 6 件は**すべてこの 438 件に含まれている**。

## 2. 裁定の基準（何を本タスクで是正し、何を引き継ぐか）

本タスクの _Boundary_ は「被覆タグが名乗る受入基準と内容の対応」である。線引きは次の一文で
決まる。**区間が扱う主題が原文の主題と同じか否か**であって、分類の見出しではない。

- **A: 指し先そのものが誤っている**＝ **主題が違う・条件が逆・番号がずれている**。
  - 主題が違う: 区間が扱う対象・画面・操作が、原文が述べる対象・画面・操作と別である。
  - 条件が逆: 原文の前件（「権限を持たない」「エラーを表示するとき」など）に一度も入らず、
    その**逆の状態**を確定させている。前件に入らない名乗りは、原文を一度も試していない。
  - 番号がずれている: 群のうち一つ手前・一つ後ろの条文を一律に名乗っている。
  - → **本タスクで是正する。** 内容に対応する受入基準が原文にあればその番号へ付け替え、
    無ければ被覆印を**取り下げる**。**取り下げは同居を作らない。** 付け替え先が
    `e2e/requirement-exclusions.json` で除外済みであることは、取り下げを妨げる理由にならない。
- **B: 主題は同じで、規範の一部が未観測**。区間が扱う主題は原文の主題と一致しており、
  原文が求める規範のうち**一部**を確かめていない。例: PDF のダウンロードは確かめるが中身は
  見ない、更新は確かめるが監査ログは見ない、遷移先の画面は確かめるがクリックの契機を作らない。
  - → **本タスクでは是正しない。** これは「部分被覆をどう数えるか」の問題であり、
    レビュー自身が `project-management/REQ-27.4` の部分被覆について
    「扱いは 115.189 の _Boundary_ に属する」と述べた形と同型である。
    ただし**その差し向け自体は 115.189 の実測で誤りと判った**（当該IDは除外ではなく、
    被覆印の側の部分被覆である。§6 を参照）。同型であるという上の判断は変わらないが、
    「115.189 が引き取る」という部分は成り立たない。
    **当該IDそのものはタスク 115.220 が「観測の追加」で決着させた**（§6）。
    §4 の母集団の扱いは依然として未決である。

**A の三つの形は「カテゴリ見出し」ではなく一件ごとの判定条件である。** §4 に残す各項目には
「なぜ主題が同じと言えるか」を一行で添える。添えられないものは A であり §3 へ移した。

## 3. 本タスクで是正した被覆印

### 3.1 一回目のレビューが名指しした欠陥（指摘2〜7）

| 箇所 | 従前 | 是正後 | 根拠 |
| --- | --- | --- | --- |
| `trading-partners/trading-partner-navigation.spec.ts` 一覧のパンくず表示 | REQ-12.18 | **REQ-12.14** | 12.18 は「クリックしたとき…遷移する」。本検証はクリックせず表示のみ主張 |
| 同ファイル パンくずのクリック遷移 | REQ-12.14→12.18（前任） | REQ-12.18 のまま | 原文どおり。二重の名乗りは上の是正で解消 |
| `projects/project-detail.spec.ts` 「一覧に戻る」リンク | REQ-7.5 | **取り下げ** | 7.5 は営業担当者の表示名。要件7 に「一覧に戻る」を述べる条文は無い |
| 同ファイル 営業担当者フィールドの表示名 | REQ-7.6 | **REQ-7.5** | 7.6 は工事担当者。営業担当者を述べるのは 7.5 |
| `trading-partners/trading-partner-additional.spec.ts` 電話番号形式 | REQ-11.7 | **REQ-11.5** | 群の三件が一律に一つ後ろへずれていた |
| 同 FAX 番号形式 | REQ-11.8 | **REQ-11.6** | 11.8 は住所の最大文字数 |
| 同 メールアドレス形式 | REQ-11.9 | **REQ-11.7** | 11.9 は請求締日。11.9 は未被覆として露出 |
| `projects/project-crud.spec.ts` 編集時のバリデーションエラー | REQ-8.4 | **REQ-8.8** | 8.4 はフリガナ検索 |
| `projects/project-customer-label.spec.ts` 作成画面のラベル | REQ-8.4 | **REQ-1.2** | 作成フォームのフィールド一覧 |
| 同 編集画面のラベル | REQ-8.4 | **REQ-8.2** | 編集フォームのフィールド一覧 |
| `site-surveys/site-survey-crud.spec.ts` 削除のキャンセル | REQ-1.5 | **取り下げ** | 1.5 は「削除する…論理削除する」。本検証は削除しない |
| `projects/project-detail-sections.spec.ts` 各セクションのリンク | REQ-29.6 | **取り下げ** | 29.6 は一括取得APIのレスポンス形式。29.6 は未被覆として露出 |
| `estimate/estimate-e2e.spec.ts` NET金額案分ダイアログ | REQ-5.1/5.2/5.3 | **取り下げ** | ダイアログを開いて閉じるだけ |
| `estimate-requests/received-quotation-status-e2e.spec.ts` 転記後の単価欄 | REQ-15.5 | **取り下げ** | 15.5 は「行数を含む完了メッセージ」。照合は `/項目を転記しました/` で行数を見ない |
| `estimate/estimate-reorder-overhead-e2e.spec.ts` ↑/↓ボタン三件と前書き | REQ-12.2 | **取り下げ** | 12.2 は「ドラッグ&ドロップで」。`e2e/specs/estimate` に D&D 操作は一件も無い |
| `trading-partners/trading-partner-crud.spec.ts` 編集キャンセル | REQ-4.4 | **取り下げ** | 4.4 は支払日のドロップダウン |

**指摘2 の (c) はレビューの前提が実測と食い違った。** describe 註釈の散文箇条書き
（`REQ-12.14: パンくずナビゲーションを提供` など）は**被覆印として読まれていない**。
パターン5 は `Requirements (feature-name):` ヘッダー直下の一覧だけを拾い、機能名を伴わない
箇条書きは拾わないためである。`REQ-12.14` が被覆済みだったのは
`frontend/src/pages/TradingPartnerListPage.tsx` の `Requirements (trading-partner-management):`
ヘッダー配下の一覧が名乗っていたためである（レビューも再確認して同じ結論を出した）。
**「本番コードの註釈だけが被覆の担い手になっている」形は指標の穴の別種であり、
_Boundary_ 外（`frontend/src`）なので §6 へ引き継ぐ。**

### 3.2 二回目のレビューが名指しした欠陥（指摘8〜11・13）

いずれも §2 の A（主題が違う／条件が逆／番号がずれている）に当たる。
**「候補が競合した」「付け替え先が除外済み」を理由に残したものは無い。**

| 箇所 | 従前 | 是正後 | 根拠 |
| --- | --- | --- | --- |
| `projects/project-navigation.spec.ts:662` 「一覧に戻る」リンクのクリック遷移 | REQ-21.25 | **取り下げ** | 21.25 は「ページ群を保護し認証済みのみ許可」。要件21 に「一覧に戻る」の遷移を述べる条文は無い（21.13 は存在しないIDの場合に限る）。`project-detail.spec.ts` で下したのと同じ裁定 |
| 同 `:698` ProtectedRoute 保護 | REQ-21.26 | **REQ-21.25** | 原文21.25「プロジェクト管理ページ群を保護し、認証済みユーザーのみアクセスを許可する」 |
| 同 `:715` ProtectedLayout 適用 | REQ-21.27 | **REQ-21.26** | 原文21.26「共通レイアウト（ナビゲーションヘッダー付き）を適用する」 |
| 同 `:747` 未認証時のログインリダイレクト | REQ-21.28 | **REQ-21.27** | 原文21.27「未認証ユーザーがアクセスした場合、ログインページにリダイレクトする」 |
| 同 `:768` ログイン後に元のページへ復帰 | REQ-21.28（前任が 21.29 から是正） | REQ-21.28 のまま | 原文21.28 と一致する。**この一件があるため 21.28 は是正後も被覆済みで、名乗りと内容が初めて揃った**（ずれていた間は「元ページへの復帰」を一度も確かめていない区間が 21.28 を名乗っていた） |
| `projects/project-sort-extension.spec.ts:452` `aria-sort` 属性 | REQ-6.3 / REQ-20.6 | **両方とも取り下げ** | 主張は th の `aria-sort`。6.3 は「アイコン（上矢印/下矢印）で表示する」、20.6 は「ヘッダーとデータセルの関連付け」で、いずれも別。要件6・20 に `aria-sort` を述べる条文は無い。6.3 は同ファイル 270/329/390 行のアイコン検証が引き続き名乗る |
| `quantity-tables/import-e2e.spec.ts` 前書きの一覧と `:498` の区間 | qtg/REQ-28.2 | **取り下げ（両方）** | 主張は「.xlsx を選ぶと Excel 処理経路が起動する」で、原文28.2「全シートを解析対象とする」は一度も確かめない。内容に当たる28.1 は除外済みだが**取り下げは同居を作らない**。28.2 は未被覆として露出。表題の `(REQ-28.1)` も外し自己矛盾を解消（指摘11） |
| `site-surveys/site-survey-annotation-tools.spec.ts` 前書きの一覧と `:1144`（群の註釈）と表題 | ss/REQ-8.2 | **取り下げ（三箇所すべて）** | 主張はテキストの文字色・フォントサイズの属性パネル。原文8.2「テキストを入力して確定すると画像上に配置する」は確かめない。内容に当たる8.5 は除外済みだが取り下げは同居を作らない。8.2 は未被覆として露出 |
| `itemized-statements/itemized-statement-create-page.spec.ts:371, 402` 新規作成画面のパンくず表示 | isg/REQ-9.5・9.6 | **REQ-9.2（両方）** | 9.5/9.6 は「クリックしたとき遷移する」。本検証は `toBeVisible()` のみ。表示を述べるのは 9.2。9.5/9.6 は `itemized-statement-crud.spec.ts:504/472` のクリック遷移が引き続き名乗る |
| `admin/audit-log.spec.ts` 前書き | ua/REQ-28.40 | **取り下げ** | 28.40 は「監査ログリンクがクリックされたとき画面へ遷移する」。本ファイルは `request` だけを使う純粋な API テストで `page.` の参照が **0 件**（実測）。28.40 は `auth/navigation.spec.ts:287` と `navigation/app-header.spec.ts:267` が引き続き名乗る |
| `auth/sessions.spec.ts:117` セッション一覧の表示 | ua/REQ-28.31 | **取り下げ** | 28.31 は「**プロフィール画面**が表示されるときセッション管理へのリンクを含める」。本区間は beforeEach で `/sessions` へ直行しプロフィール画面を開かない。28.31 は `auth/navigation.spec.ts:148` が引き続き名乗る |
| `site-surveys/site-survey-image-order.spec.ts:256, 285` 境界でのボタン無効化 | ss/REQ-4.12・4.13 | **取り下げ（両方）** | 4.12/4.13 は「1つ上/下の位置に**移動する**」。本検証は `toBeDisabled()` のみで移動は起きない。要件4 に境界の無効化を述べる条文は無い。4.12/4.13 は同ファイル 168/212 行の移動検証が引き続き名乗る |
| `itemized-statements/itemized-statement-reorder.spec.ts` 前書きの一覧と `:219, 242` | isg/REQ-17.2・17.3 | **取り下げ（前書きと註釈の両方）** | 17.2/17.3 は「1つ上/下の位置に移動する」。本検証は `toBeDisabled()` のみ。無効化を述べるのは 17.4/17.5 で、そちらは名乗ったまま。17.2/17.3 は未被覆として露出 |
| `estimate/estimate-toolbar-e2e.spec.ts:1` 前書きの一覧 | ec/REQ-23.3・23.4・23.5・23.6・23.7・23.9・23.10・12.1・12.3〜12.6・2.5・2.6 | **取り下げ** | 本ファイルの検証は 3 件（ツールバー表示=23.1、未選択時の無効化=23.8、項目追加=23.2）だけで、選択状態での有効化・子項目追加・削除・複製・ハイライト・階層移動・ネスト深さのいずれも操作していない。**対応する検証が一件も存在しない前書きの名乗り**であり §3.1 で取り下げた形と同型 |
| `construction-photos/construction-photo-additional.spec.ts:601` 権限出し分け | cp/REQ-17.1 | **取り下げ** | 17.1 の前件は「**編集権限を持たない**間」。本検証は編集権限を持つ `REGULAR_USER` で入り、編集導線が**見えること**を主張する。前件に入らず結論も逆。17.1 は未被覆として露出（17.2 は削除権限を持たない側なので名乗ったまま） |
| `trading-partners/trading-partner-additional.spec.ts:362` 成功メッセージの Toast | tpm/REQ-8.4 | **REQ-2.8** | 8.4 の前件は「**エラーメッセージ**を表示するとき」。本検証は「取引先を作成しました」という成功メッセージで、述べるのは 2.8 |
| `trading-partners/trading-partner-error-handling.spec.ts:383` バリデーションエラーの項目内表示 | tpm/REQ-8.4 | **REQ-2.9** | 「Toast を**使わない**」ことを確定させており 8.4 の逆。実際に主張する「取引先名は必須です」の項目内表示は 2.9。8.4 は同ファイル 409 行が引き続き名乗る |
| `site-surveys/site-survey-navigation.spec.ts:295` ブレッドクラム群 | ss/REQ-2.12 | **取り下げ** | 2.12 の主題は**画像プレビュー画面**の戻るリンク非表示。本区間は現場調査詳細画面のブレッドクラムだけを扱い、画像プレビュー画面を開かない。2.12 は `site-survey-breadcrumb.spec.ts:462` が引き続き名乗る |
| `site-surveys/site-survey-crud.spec.ts:103, 148, 247` | ss/REQ-1.1（三件） | **取り下げ（三件とも）** | 1.1 は「作成フォームを表示すると調査名欄にデフォルト値『現場調査』を設定する」。三件はそれぞれ一覧への遷移・作成フォームへの遷移・必須バリデーションを主張し、デフォルト値そのものを一度も検査しない（242 行は `clear()` で前提として消しているだけ）。要件1 に遷移・必須バリデーションを述べる条文は無い |
| `projects/project-list-operations.spec.ts:661`（群の註釈） | pm/REQ-3.2 | **取り下げ** | 3.2 の前件は「プロジェクト**総数がページサイズを超える**場合」。配下の検証は 1 件だけを用意して表示を主張しており前件に入らない |
| `project-execution-budget-navigation.spec.ts:1` 前書きの一覧 | pm/REQ-40.3・40.4・40.5・41.2 | **取り下げ** | 40.3〜40.5 の前件は「実行予算が**存在する**場合」だが、本ファイルは実行予算を一件も作らず、detail-summary の検証も `executionBudget` が `null` である側だけを主張する。41.2 が述べる「存在する実行予算データの項目」も同じ理由で一度も前件に入らない。四件とも本ファイルが唯一の被覆源で未被覆として露出 |
| `trading-partners/trading-partner-navigation.spec.ts:974` ログイン後の復帰 | tpm/REQ-12.23・12.26 | **REQ-12.28（12.26 は取り下げ）** | 12.23 は「更新に成功したとき詳細ページへ遷移」で本検証は更新しない。12.26 は ProtectedLayout の適用で本検証は AppHeader を見ない。主題「ログイン後に元のページへ復帰」を述べるのは 12.28。12.26 は他に被覆源が無く未被覆として露出 |

**指摘13（古い散文註釈）の是正**（機械には読まれないが原文が述べない内容を主張していた）:

| 箇所 | 従前の記述 | 現況へ改めた内容 |
| --- | --- | --- |
| `projects/project-crud.spec.ts:312` | `// Note: REQ-1.12 は「営業担当者未選択時のバリデーション」` | 営業担当者未選択を述べるのは 1.15。1.12 は「必須項目を入力せずに作成したとき該当フィールドにエラーを表示する」 |
| `admin/audit-log.spec.ts:46` | `REQ-22.1 権限追加・削除時の監査ログ`（22.2 の説明） | `REQ-22.1 ロール作成・更新・削除時の監査ログ` |
| `admin/audit-log.spec.ts:93` | `REQ-22.3 権限追加・削除時の監査ログ`（22.2 の説明） | `REQ-22.3 ユーザーへのロール割り当て・削除時の監査ログ` |
| `admin/audit-log.spec.ts:411` | `要件22.9: センシティブ操作時のアラート通知`（タグは 22.3） | `要件22.3: ユーザーへのロール割り当て・削除時の監査ログ記録` |
| `trading-partners/trading-partner-navigation.spec.ts:930` | `REQ-12.23: 未認証ユーザーが…元ページに復帰` | `REQ-12.27`（リダイレクト）と `REQ-12.28`（復帰）に分けて記す |
| `projects/project-list-operations.spec.ts:709` | `// REQ-3.2 は「プロジェクトが存在する場合」を条件とする` | 3.2 の前件は「総数がページサイズを超える場合」。当該註釈は REQ-3.4 の前提づくりの説明へ改めた |

### 3.3 走査で新たに見つけた「番号の一律ずれ」

| ファイル | 是正 |
| --- | --- |
| `projects/project-crud.spec.ts` | 要件1 の後半が一律にずれていた: 1.7/1.8→1.10/1.11、1.5/1.6→1.8/1.9、1.9→1.12、1.10→1.13、1.11→1.14、1.12→1.15、1.13/1.14→1.16/1.17 |
| `projects/project-name-uniqueness.spec.ts` | 1.15〜1.19→1.18/1.19、1.15→1.19（5件を2件へ集約） |
| `projects/project-navigation.spec.ts` | 21.3 と 21.4 の入れ替え、21.7 と 21.8 の入れ替え、21.29→21.28、および §3.2 の 21.25〜21.28 |
| `projects/project-detail.spec.ts` | 7.7→7.6（要件7 は逆方向に一つずれていた） |
| `projects/project-status-counts-and-defaults.spec.ts` | 5.7/5.8→5.5/5.6 |
| `trading-partners/trading-partner-navigation.spec.ts` | 要件12 の画面間遷移が一律に一つ手前: 12.19→12.20、12.20→12.21、12.21→12.22、12.22→12.23、12.23→12.27（未認証リダイレクト、二件） |
| `estimate-requests/estimate-request-e2e.spec.ts` | 要件4 が一律に手前へずれていた: 4.6→4.10、4.7→4.11、4.8→4.12、4.9→4.13、4.10/4.11/4.12→4.15/4.16/4.17、4.13→4.18（4.6・4.7 は別区間が新たに名乗る）。あわせて pm 要件27 のずれ: 27.2→27.3、27.3→27.4、27.4→27.7、27.5→27.2 |
| `estimate-requests/received-quotation-status-e2e.spec.ts` | 要件11 の受領見積書群が一律にずれていた: 11.11→11.25、11.12→11.26、11.13→11.27、11.15→11.28、11.16→11.29、11.17→11.30（11.14 は取り下げ）。15.6→15.7、15.5 は取り下げ |
| `estimate-requests/estimate-request-layout-net-e2e.spec.ts` | 要件28 の群が一律に一つ手前だった: 28.4→28.6、28.5→28.7、28.6/28.7→28.8/28.9、28.8/28.9→28.10（28.4 は別区間が名乗る。28.12/28.13 は取り下げ） |
| `site-surveys/site-survey-crud.spec.ts` | 要件1 の群が一律に一つ手前だった: 1.2→1.3、1.3→1.4、1.4→1.5、1.5→1.6（1.2 は別区間が名乗る）。1.1 の三件は §3.2 のとおり取り下げ |
| `itemized-statements/itemized-statement-crud.spec.ts` | 7.1→7.2、9.4→9.5、4.4→4.2、8.3→8.2、9.7→9.3、13.6→13.1、14.5→14.1、pm/26.3→26.6、pm/26.3→26.11、pm/26.4→26.5 |

### 3.4 実測した被覆印の増減（全件・機械集計）

**記録の網羅性は散文の数え上げでなく実測で担保する。** 次の表は
`check:req-coverage:json` の `testFiles` を HEAD と是正後で突き合わせた**集合差**であり、
`e2e/specs` 配下で名乗りが変わったファイルを一件残らず含む。

実測: **47 ファイル・新たに名乗る 52 件・取り下げ 91 件**。

| ファイル | 新たに名乗る受入基準 | 取り下げた受入基準 |
| --- | --- | --- |
| `admin/audit-log.spec.ts` | — | 22.2, 28.40 |
| `auth/invitations.spec.ts` | 15.11 | — |
| `auth/login.spec.ts` | — | 11.3 |
| `auth/sessions.spec.ts` | — | 28.31 |
| `auth/token-refresh.spec.ts` | 26.5 | 5.4, 5.5, 5.6 |
| `construction-photos/construction-photo-additional.spec.ts` | — | 17.1, 19.4 |
| `estimate-requests/estimate-request-e2e.spec.ts` | — | 4.8, 4.9, 27.5 |
| `estimate-requests/estimate-request-layout-net-e2e.spec.ts` | — | 28.12, 28.13 |
| `estimate-requests/preview-resize-e2e.spec.ts` | — | 36.8 |
| `estimate-requests/received-quotation-dialog-improvements-e2e.spec.ts` | 37.5 | — |
| `estimate-requests/received-quotation-status-e2e.spec.ts` | 11.25, 11.26, 11.27, 11.28, 11.29, 11.30 | 11.11, 11.12, 11.13, 11.14, 11.15, 11.16, 11.17, 15.5, 15.6 |
| `estimate-requests/structured-data-ocr-e2e.spec.ts` | 11.14, 11.15, 11.16 | — |
| `estimate/estimate-e2e.spec.ts` | 17.5 | — |
| `estimate/estimate-reorder-overhead-e2e.spec.ts` | — | 12.2 |
| `estimate/estimate-toolbar-e2e.spec.ts` | — | 2.5, 12.1, 23.3, 23.4, 23.5, 23.6, 23.7, 23.9, 23.10, 24.1 |
| `itemized-statements/itemized-statement-create-page.spec.ts` | 9.2 | 9.5, 9.6 |
| `itemized-statements/itemized-statement-crud.spec.ts` | 9.5, 9.6, 26.5 | 4.4, 7.1, 8.3, 9.4, 9.7, 26.3, 26.4 |
| `itemized-statements/itemized-statement-reorder.spec.ts` | — | 17.2, 17.3 |
| `project-execution-budget-navigation.spec.ts` | — | 40.3, 40.4, 40.5, 41.2 |
| `projects/project-additional-requirements.spec.ts` | 13.5, 13.7 | 13.4, 13.6 |
| `projects/project-autocomplete.spec.ts` | — | 16.3 |
| `projects/project-crud.spec.ts` | 1.15, 1.16, 1.17, 8.7, 8.8 | 1.5, 1.6, 1.7, 8.3, 8.4 |
| `projects/project-customer-label.spec.ts` | 1.2, 8.2 | 8.4 |
| `projects/project-detail-sections.spec.ts` | — | 25.7, 29.6 |
| `projects/project-detail.spec.ts` | — | 7.7 |
| `projects/project-list-operations.spec.ts` | 5.3 | 3.2, 5.5, 5.6 |
| `projects/project-name-uniqueness.spec.ts` | — | 1.15, 1.16, 1.17 |
| `projects/project-navigation.spec.ts` | — | 21.29 |
| `projects/project-sort-extension.spec.ts` | — | 20.6 |
| `projects/project-status-counts-and-defaults.spec.ts` | 5.5, 5.6 | 5.7, 5.8 |
| `projects/project-trading-partner.spec.ts` | — | 22.3, 22.6 |
| `quantity-tables/group-sort-e2e.spec.ts` | 36.2 | — |
| `quantity-tables/import-e2e.spec.ts` | — | 28.2 |
| `quantity-tables/photo-change-dialog-e2e.spec.ts` | 4.3 | 19.1, 115.19 |
| `quantity-tables/quantity-table-phase10.spec.ts` | 36.2 | 24.3, 24.4 |
| `site-surveys/site-survey-annotation-tools.spec.ts` | 12.1, 12.2, 12.3, 12.4, 12.5 | 8.2 |
| `site-surveys/site-survey-annotations.spec.ts` | 2.4, 11.1, 11.8, 29.1 | 9.1, 10.6 |
| `site-surveys/site-survey-crud.spec.ts` | 1.6 | 1.1 |
| `site-surveys/site-survey-export.spec.ts` | 10.9 | 10.8 |
| `site-surveys/site-survey-images.spec.ts` | 4.5 | — |
| `site-surveys/site-survey-navigation.spec.ts` | — | 2.12 |
| `site-surveys/site-survey-phase18.spec.ts` | 10.4, 24.2 | 10.8 |
| `trading-partners/trading-partner-additional.spec.ts` | 2.8, 11.5, 11.6 | 11.8, 11.9 |
| `trading-partners/trading-partner-composite-unique.spec.ts` | 4.5 | — |
| `trading-partners/trading-partner-crud.spec.ts` | — | 4.4 |
| `trading-partners/trading-partner-error-handling.spec.ts` | 2.9 | — |
| `trading-partners/trading-partner-navigation.spec.ts` | 12.28 | 12.19, 12.26 |

### 3.5 集合は変わらないが指し先を入れ替えた・重複を取り下げたもの

同じファイル内で別の区間が既に名乗っている番号へ移した、あるいは同じ区間の二重の名乗りを
一つにしたため、上の集合差には現れない。**「重複の取り下げ」を「N→M の付け替え」とは書かない。**

| ファイル | 内容 |
| --- | --- |
| `admin/permission-management.spec.ts` | 18.7→18.3（付け替え） |
| `admin/role-management.spec.ts` | 22.1→17.3、22.1→17.6（付け替え）、17.7 は**同一区間の重複の取り下げ** |
| `admin/role-permission.spec.ts` | 19.7 は**重複の取り下げ** |
| `admin/user-role.spec.ts` | 20.7 は**重複の取り下げ** |
| `auth/password-reset.spec.ts` | 7.2 は**重複の取り下げ**（同区間が 29.10 を名乗る） |
| `auth/login.spec.ts` | 11.3 は**重複の取り下げ**（同区間が 11.11 を名乗る。11.3 は他に被覆源が無く未被覆として露出） |
| `estimate-requests/estimate-request-ocr-vision-e2e.spec.ts` | 21.2→21.1、22.1→22.2、22.2→22.4（付け替え） |
| `execution-budget/amendment-apply-e2e.spec.ts` | 15.2→15.1（付け替え） |
| `execution-budget/cost-input-e2e.spec.ts` | 13.3 は**是正不要**と裁定（区間は月次締めによる累積を主張しており原文13.3 と一致する） |
| `security/security-measures.spec.ts` | 10.7→5.5（付け替え） |
| `site-surveys/site-survey-image-order.spec.ts` | 4.11→4.12、10.9→10.6（付け替え）と §3.2 の 4.12/4.13 の取り下げ |
| `site-surveys/site-survey-outline-toggle.spec.ts` | 註釈の番号を原文へ合わせただけで名乗りは不変 |
| `site-surveys/site-survey-viewer.spec.ts` | 4.5→4.9（付け替え） |

### 3.6 三回目の査読が名指しした欠陥（Suggestion 9）

| 箇所 | 是正 | 根拠 |
| --- | --- | --- |
| `projects/project-name-uniqueness.spec.ts:257` | `pm/REQ-8.7` を取り下げ（`8.8`・`8.11`・`8.12` は残す） | 8.7 の原文は「When プロジェクトが正常に更新される, ... 更新日時を自動的に記録し、成功メッセージを表示する」。当該区間は重複時のエラー表示を主張しており前件に入らない（条件が逆＝A）。8.7 は `projects/project-crud.spec.ts` の更新成功の区間が主張しているため被覆は失われない |

あわせて、是正の過程で `@requirement` 行が同一ブロック内に二重に入った 6 箇所を 1 本へまとめた
（`admin/role-management.spec.ts` 2 件、`estimate-requests/estimate-request-ocr-vision-e2e.spec.ts`、
`estimate-requests/preview-resize-e2e.spec.ts`、`security/security-measures.spec.ts`、
`site-surveys/site-survey-image-order.spec.ts` 各 1 件）。被覆印は集合として読まれるため指標は動かない。

## 4. 115.189 へ引き継ぐ被覆印（B: 主題は同じで規範の一部が未観測）

**§2 の線引きにより本タスクの _Boundary_ 外である。** 見出しは分類の名前であって判定の
根拠ではない。**判定は一件ごとの主題で行い、各項目に「なぜ主題が同じと言えるか」を一行で
添える。** 添えられなかったものは A として §3 へ移した（`cp/17.1`、`ss/1.1`、`ss/2.12`、
`ss/4.12`・`4.13`、`isg/9.5`・`9.6`、`isg/17.2`・`17.3`、`ec/2.5`・`23.3`・`23.4`・`23.7`・`23.9` ほか、
`ua/28.31`、`ua/28.40`、`tpm/8.4` の二件、`pm/3.2`、`pm/21.25`〜`21.28`、`pm/6.3`・`20.6`、
`pm/40.3`・`40.4`・`40.5`・`41.2`、`qtg/28.2`、`ss/8.2`）。

### 4.1 観測手段が画面・API に届かない（監査ログ・サーバログ・暗号アルゴリズム・DB索引）

区間が扱う操作は原文の主題と同じで、**その操作の副作用（ログ・アルゴリズム・索引）だけが
画面と API 応答から見えない**。

- `admin/role-permission.spec.ts:52,169,222` — ua/19.5・22.2・22.7: 権限の付与・剥奪という操作そのものは行っており、同時に記録されるべき監査ログだけを参照していない。
- `admin/user-role.spec.ts:23,53,139` — ua/20.5・22.3・22.7: ユーザーへのロール割り当てを実際に行い、監査ログの記録だけを見ていない。
- `admin/role-management.spec.ts:43,105,213` — ua/17.3・22.1: ロールの作成・更新・削除を行い、監査ログだけを見ていない。
- `admin/audit-log.spec.ts:44,85,127,230,356` — ua/22.6・22.7・22.8・22.12: 監査ログの記録・取得は確かめるが、保存失敗時の中断・変更前後の値・DB索引という内部の性質だけが観測できない。
- `admin/rbac.spec.ts:107,219,246,318` — ua/6.5・6.8・21.6・21.7・21.9・21.10: 権限チェックの結果（許可・拒否）は確かめるが、拒否のログ記録だけが見えない。
- `auth/two-factor.spec.ts:85,173,433,462,975` — ua/27.1〜27.3・27.7・27.8・27A.3・27C.1〜27C.5: 2FA の設定と検証は通しで確かめるが、乱数長・暗号化保存・使用ライブラリ・SHA-1・環境変数という実装の内側だけが見えない。
- `auth/token-refresh.spec.ts:296,341` — ua/5.7〜5.10: トークンの発行と更新は確かめるが、署名アルゴリズムと有効期限の環境変数だけが見えない。
- `auth/login.spec.ts:45` — ua/4.4・4.5・4.7: ログイン成功でトークンが発行されることは確かめるが、トークンを復号して中身を検査していない。
- `auth/register.spec.ts:61` — ua/2.9・2.10・2.12: 登録そのものは成功まで確かめるが、Argon2id のパラメータ・招待トークンの使用済み化・ロール割当だけが見えない。
- `auth/security-accessibility.spec.ts:81,188,257,287` — ua/10.2〜10.5・10.7: 画面の安全側の挙動は確かめるが、送信ヘッダやログの内容だけが見えない。
- `security/security-measures.spec.ts:49,154,208` — ua/26.4・26.9・26.11・26.12: 攻撃入力が拒否されることは確かめるが、拒否の記録と設定値だけが見えない。
- `estimate-requests/estimate-request-ocr-vision-e2e.spec.ts:146,246,297,1` — er/21.4・22.3・22.5・22.6・23.1〜23.7・26.1〜26.4: OCR の起動と失敗表示は確かめるが、API キー未設定で 503 に止まるため送信本体もバックエンドログも観測できない。
- `site-surveys/site-survey-export.spec.ts:476` — ss/11.2〜11.6: PDF 出力の起動とファイル名までは確かめるが、PDF を開いて中身を検査していない。
- `estimate-requests/site-survey-report-e2e.spec.ts:1,319` — er/35.6・35.7: 出力要求の到達までは確かめるが、PDF の受領そのものを確かめていない（区間の註記も「到達確認に留める」と述べる）。
- `project-contract-navigation.spec.ts:377`、`project-schedule-navigation.spec.ts:335` — pm/37.5・39.5: セクションのデータが揃うことは確かめるが、`Promise.allSettled` による**並行**取得かどうかは逐次実装でも同じ主張が通るため観測できない。
- `project-execution-budget-navigation.spec.ts:1` — pm/41.5: 同上（実行予算セクションの並行取得）。

### 4.2 遷移先の画面は確かめるが、クリックの契機を作っていない

原文が述べる**遷移先**は実際に表示まで確かめており、未観測なのは**クリックという契機**だけである。
`page.goto` で直接その画面へ入っている。

- `auth/sessions.spec.ts:118,193` — ua/28.30・28.35・28.42・28.44: セッション管理画面とログアウト後の画面は表示まで確かめている。
- `auth/two-factor.spec.ts:85,297,550` — ua/28.17・28.28・28.29・28.33: 2FA 設定画面とその前後の画面は表示まで確かめている。
- `auth/profile.spec.ts:139,162` — ua/28.21〜28.27・28.37: プロフィール画面の各セクションは表示まで確かめている。
- `admin/rbac.spec.ts:41,60` — ua/28.37・28.45・6.1・6.2・17.4・18.3・21.8: 管理画面の到達と権限による出し分けは確かめている。
- `admin/admin-setup.spec.ts:16,24,42` — ua/3.2・3.3・17.4・18.5・28.37: 初期管理者の設定画面は表示まで確かめている。
- `admin/permission-management.spec.ts:23,239` — ua/18.7・28.39: 権限管理画面は表示まで確かめている。
- `admin/role-management.spec.ts:26` — ua/28.38: ロール管理画面は表示まで確かめている。
- `auth/invitations.spec.ts:210` — ua/28.36: 招待管理画面は表示まで確かめている。
- `auth/navigation.spec.ts:168` — ua/28.34: セッション管理画面の内容は表示まで確かめている。
- `projects/project-breadcrumb.spec.ts:506,646,848,920` — pm/20.1・20.2・21.18・31.1・32.1: パンくずの各階層の表記は確かめている。
- `estimate/estimate-navigation-e2e.spec.ts:504,606,636,1` — ec/15.2・15.4・15.6・15.9・15.12: 見積関連画面の到達は確かめている。
- `itemized-statements/itemized-statement-crud.spec.ts:1,1597` — isg/9.2: 内訳書のパンくず表記は確かめている（新規作成画面の側は §3.2 の是正で `itemized-statement-create-page.spec.ts` が名乗るようになった）。

### 4.3 操作の入口は確かめるが、操作の結果を確かめていない

原文が述べる**操作の手段**は実際に描画まで確かめており、未観測なのは**押した後の結果**だけである。

- `quantity-tables/quantity-table-phase10.spec.ts:201,363` — qtg/23.3・23.4・26.1: 当該のボタン群が描画されることは確かめている。
- `quantity-tables/group-sort-e2e.spec.ts:335` — qtg/23.3・23.4: 同上。
- `quantity-tables/quantity-table-copy.spec.ts:250` — qtg/17.6: 複製の導線は描画まで確かめている（expect が無いのは別種の欠陥で `check:e2e-guards` の所管）。
- `quantity-tables/quantity-table-crud.spec.ts:1618` — qtg/6.2: 移動の導線は描画まで確かめている（移動先選択UIを開く先は 115.190 系の未実装と重なる）。
- `site-surveys/site-survey-annotations.spec.ts:329`、`site-survey-export.spec.ts:401,541` — ss/11.1・11.8・12.1: 出力の導線は描画まで確かめている。
- `site-surveys/site-survey-phase18.spec.ts:626` — ss/9.1: 注釈保存の導線は描画まで確かめている。
- `site-surveys/site-survey-viewer.spec.ts:361` — ss/4.11: ドラッグハンドルが `draggable` 属性と `aria-label` を備えて描画されることまで確かめている（実際の並び替えは `site-survey-image-order.spec.ts:441` が確かめる）。
- `execution-budget/amendment-apply-e2e.spec.ts:148` — ebm/15.1: 変更適用の導線は描画まで確かめている。
- `construction-photos/construction-photo-workflow.spec.ts:196` — cp/5.1・6.1: 当該の操作手段は描画まで確かめている。
- `estimate-requests/received-quotation-status-e2e.spec.ts:1282` — er/11.8: 当該の操作手段は描画まで確かめている。

### 4.4 原文が挙げる前提や規範の一部を用意していない（主題は同じ）

**旧稿の見出し「逆の状態を確定させる」は §2 の A の定義そのものだったため改めた。**
ここに残すのは、区間が扱う主題が原文と同じで、原文が並べる条件・項目の**一部**を用意して
いないものだけである。**前件に一度も入らないもの・逆を確定させるものは §3 へ移した。**

- `auth/auth-initialization.spec.ts:72,146,277` — ua/16A.1・16A.3・16A.5・16A.8・16A.13・28.1・28.3: 主題は起動時のセッション復元と初期表示で、復元後のダッシュボード・未認証時のログイン画面・読み込み表示を実際に確かめている。未観測は待ち時間の閾値と ARIA の細目。
- `auth/token-refresh.spec.ts:49,137,270,341,450` — ua/16.1・16.2・16.4・16.5・16.13・16.15・16.17・16.20・5.3: 主題はアクセストークンの自動リフレッシュと失敗時の扱いで、期限切れ・無効・同時要求の各経路を実際に通している。未観測は有効期限の具体値。
- `auth/register.spec.ts:209,242〜343,444` — ua/2.8・11.11・12.1・12.2・12.5・12.7〜12.10・28.20: 主題は登録フォームとパスワード強度の拒否で、長さ・大文字・小文字・数字・記号・連続同一文字・漏洩の各条件を実際に入力して拒否まで確かめている。未観測は各条件の内部実装。
- `auth/profile.spec.ts:55,248,261,322` — ua/2.6・9.2・14.1・14.3・14.10: 主題はプロフィール画面の表示とパスワード変更の拒否で、画面の項目とフォーカス移動を実際に確かめている。未観測はフォーカス順序の全経路。
- `auth/password-reset.spec.ts:73,203,222,277,814` — ua/7.1・7.2・29.9・29.14・29.17: 主題はリセットの要求・トークン検証・完了後の遷移で、要求から再ログインまでを通しで確かめている。未観測はメールの送信そのもの。
- `auth/invitations.spec.ts:113,231` — ua/1.3・1.6・13.3・13.10: 主題は招待の送信と一覧のステータス表示で、送信と表示を実際に確かめている。未観測は招待メールの内容と有効期限。
- `execution-budget/execution-budget-display-e2e.spec.ts:1,374,499,538` — ebm/1.6・3.8・17.6・18.4: 主題は実行予算画面の表示項目で、画面の各欄を実際に確かめている。未観測は一部の状態（0件・上限など）。
- `estimate-requests/estimate-request-e2e.spec.ts:1537,2965,3598` — er/10.3・10.4・39.12: 主題は見積依頼の作成・編集画面の項目で、当該の欄を実際に確かめている。未観測は原文が並べる項目のうち一部。
- `estimate-requests/net-amount-auto-fill-e2e.spec.ts:210,270,298` — er/34.1・34.2・34.3: 主題は NET 金額の自動設定で、自動設定そのものは確かめている。未観測は原文の条件節が挙げる刺激の経路（別の導線から刺激している）。
- `quantity-tables/import-e2e.spec.ts:743` — qtg/31.3〜31.9: 主題は一括取り込みで、取り込みの起動と結果表示を確かめている。最終主張が「完了**または**失敗」の選言である点は主張の強さの問題で `check:e2e-guards` の所管。
- `quantity-tables/quantity-table-crud.spec.ts:647,2053,2951,3238,2148` — qtg/3.3・3.4・7.1・7.2・9.3・10.3: 主題は数量項目の入力欄と補完で、当該の欄と候補表示を実際に確かめている。未観測は原文が並べる欄のうち一部。
- `site-surveys/site-survey-export.spec.ts:294,359` — ss/10.3・10.5: 主題は注釈付き画像のエクスポートで、出力の起動と結果を確かめている。未観測は解像度と日本語レンダリングの結果そのもの。
- `site-surveys/site-survey-navigation.spec.ts:154`、`site-survey-phase18.spec.ts:155,242` — pm/24.1: 主題はプロジェクト詳細の現場調査セクションで、見出しと導線を実際に確かめている。未観測は一覧の件数・並び。
- `projects/project-crud.spec.ts:81,462,537,752` — pm/1.7・8.5・8.6・9.6: 主題はプロジェクトの作成・編集フォームの挙動で、当該の欄と保存を実際に確かめている。未観測は原文が並べる条件のうち一部。
- `projects/project-name-uniqueness.spec.ts:257` — pm/8.12: 主題は編集時の一意性チェックで、重複時のエラー表示を確かめている。未観測は自分自身を除外する条件。
  （同区間が併せて名乗っていた pm/8.7 は §3.6 で取り下げた。8.7 の原文は更新成功時の成功メッセージであり、主題が違う＝A のためここには残さない。）
- `projects/project-autocomplete.spec.ts:75,183` — pm/1.4・16.5・16.6: 主題は顧客名のオートコンプリートで、候補の表示と選択を確かめている。未観測はフリガナの両表記など入力の一部。
- `itemized-statements/itemized-statement-crud.spec.ts:1768,1994,2508,1` — isg/2.3・4.6・4.7・13.6・14.5: 主題は内訳書の一覧・詳細とフィルタで、当該の表示と操作を確かめている。未観測はフィルタ適用時の出力内容。
- `quantity-tables/photo-preview-e2e.spec.ts:251` — qtg/20.3: 主題は写真プレビューの表示で、ダイアログの表示を確かめている。未観測は注釈付き画像の中身。
- `estimate-requests/pdf-text-extraction-e2e.spec.ts:521` — er/17.6: 主題は PDF のテキスト抽出で、抽出の起動と結果表示を確かめている。未観測は抽出結果の内容。
- `estimate-requests/preview-resize-e2e.spec.ts:197` — er/36.7: 主題はプレビューの拡大縮小で、操作と表示の変化を確かめている。未観測は倍率の具体値。
- `trading-partners/trading-partner-navigation.spec.ts:298` — tpm/12.24: 主題は削除成功後の一覧への遷移で、遷移そのものを確かめている。未観測は削除の確認ダイアログ経由という経路。
- `trading-partners/trading-partner-additional.spec.ts:110` — tpm/7.6: 主題は取引先の更新で、更新そのものを確かめている。未観測は同時に記録されるべき監査ログ。
- `trading-partners/trading-partner-data-integrity.spec.ts:578` — tpm/7.5: 主題は取引先の参照整合性で、関連の維持を確かめている。未観測は削除時の扱いの一部。
- `trading-partners/trading-partner-composite-unique.spec.ts:271` — tpm/2.11: 主題は取引先名と部課名の組み合わせの一意性で、重複時のエラー表示を確かめている。未観測は大文字小文字・空白の正規化。
- `company-info/company-info-api.spec.ts:56,81` — company-info/6.7・6.8: 原文は「閲覧/保存に権限を要求する」という無条件の規範であり、主題は同じ。権限を持つ側で 200 と保存成功を確かめており、未観測は権限を欠く側の応答。

**追加登録（タスク 115.250。2026-09-03）。以下の一件は §3（本タスクで是正した被覆印）にも §4 にも
登録されず、§6 の引き継ぎ項目としてのみ扱われていた。** 115.220 が `project-management/REQ-27.4` の
三件のうち二件へ観測を足して条文を決着させたとき、残る一件は「表題と本文が食い違っていない」という
理由で手が入らず、その結果 §4 の母集団にも §6 の未決項目にも属さないままになっていた。
**この「§3 にも §4 にも無く §6 にだけ在った」ことの実測（HEAD 版に当てたコマンドと出力）は
§6 の当該項目の末尾に置いた。**

- `estimate-requests/estimate-request-e2e.spec.ts:386` — pm/27.4: 主題は「見積依頼が存在しない場合の
  セクション右上の表示」で原文（要件27 の 4）と同じであり、区間は右上の「すべて見る」リンクの
  `not.toBeVisible()` を実際に確かめている。未観測は原文が連言で並べるもう一方——右上の
  「新規作成」ボタンの非表示——と、前件（見積依頼が 0 件であること）の確定。
  - **区間は行番号ではなく表題の逐語で指す**:
    `REQ-1.3: 見積依頼がない場合、「すべて見る」リンクが非表示である (project-management/REQ-27.4)`。
    §4 の行番号は 115.188 当時のものであり、その後の編集でずれている。**同じ §4.4 の項目
    `estimate-requests/estimate-request-e2e.spec.ts:1537,2965,3598` が実例で、115.220 が同ファイルへ
    観測を足した分だけ一律に 13 行ずれ、三件はいま `:1550`・`:2978`・`:3611` にある**（2026-09-03 に実測。
    下のコマンドは 4 行を出す。四行目の `:3668` は §4 が挙げていない二つ目の er/39.12 の被覆印であり、
    ずれの実測とは別の事柄である。
    `npx tsx scripts/scan-coverage-mark-correspondence.ts --tsv | awk -F'\t' '$1=="e2e/specs/estimate-requests/estimate-request-e2e.spec.ts" && $3 ~ /REQ-(10[.]3|10[.]4|39[.]12)$/ {print $2, $3}'`）。
    行番号の一律の追随は本項目の _Boundary_ 外であり、直していない。

### 4.5 散文の言及が被覆印として読まれている（読み取り規則の側の穴）

区間の本文にある解説コメントの中の要件ID が、パターン3（機能名つきの単独形式）に一致して
被覆印として拾われている。**名乗る意図が無いのに分子に入る。**

**実測（本タスクで確認）: 四箇所とも単独の被覆源になっておらず、現時点で分子を水増ししていない。**

- `quantity-tables/quantity-table-crud.spec.ts:419` — pm/25.3・25.5（同ファイル内に正規の名乗りが別途ある）
- `trading-partners/trading-partner-error-handling.spec.ts:319` — ua/30.2・30.3（他に被覆源がある）
- `site-surveys/site-survey-images.spec.ts:756` — ss/38.8（他に被覆源がある）
- `quantity-tables/quantity-count-persistence-e2e.spec.ts:34` — er/17.1（他に被覆源がある）

**これは被覆印の「指し先」ではなく「読み取り規則」の欠陥である。** 本タスクの _Boundary_
（被覆タグが名乗る受入基準と内容の対応）とは別の形なので混ぜない。§6 に引き継ぐ。

### 4.6 走査の区間割当の限界（判定しない）

- `site-surveys/site-survey-annotation-mobile.spec.ts:2346` — ss/36.1〜36.7。
  当該タグは後続の「Requirement 36」ブロックの前書きに置かれており、走査が直前のテスト区間へ
  割り当てた疑いがある。区間の割り方（`splitCoverageBlocks`）の側の限界であり、
  **走査の限界として記録する**。判定はしない。

## 5. 実測（是正の前後）

`check:req-coverage:json` の実測値。HEAD の基線は `git worktree add --detach` で取り、
`node_modules` は `ln -s` で共有した。被覆印の総数は読み取り規則を本タスクの版で固定し、
`e2e/specs` の中身だけを入れ替えて比べた。

| 指標 | HEAD (95d1839) | 是正後 |
| --- | --- | --- |
| 受入基準の分母 | 2888 | **2888（不変）** |
| 被覆済み | 2695 | 2655 |
| 未被覆 | 205 | 233 |
| 被覆済み + 未被覆 | 2900（≠2888・前任が是正） | **2888（一致）** |
| 要件の分母 | 360 | 360 |
| 要件 被覆 / 未被覆 | 352 / 9（＝361・前任が是正） | 351 / 9（＝360） |
| 除外 | 213 | 206 |
| 読み取り規則が読める被覆印 | 3695 | 3626（69 件を取り下げ） |
| 分母外の被覆印（撤廃済み / 枝つき番号 / 未知） | （当該の集計は HEAD の版に無い） | 0 / 2 / 3 |

分母外の 5 件のうち 3 件は `e2e/specs` の外にあり、本タスクの _Boundary_ 外である
（枝つき番号: `project-management/REQ-4.1`・`4.4` を名乗る `projects/project-list-operations.spec.ts`
の被覆印は要件4 が枝つき番号（`1a.` 形式）を使うため分母に載らない。
未知: `estimate-creation/REQ-24.1` は `frontend/src/pages/EstimateDetailPage.tsx`、
`trading-partner-management/REQ-11.13`・`11.14` は `backend/src` の註釈が名乗っている）。
**分母外の被覆印は分子に入らないため、指標の穴にはならない。** §6 へ引き継ぐ。

新たに未被覆として露見した受入基準（34件）:
`construction-photo/REQ-17.1`・`19.4`、
`estimate-request/REQ-4.8`・`4.9`・`15.5`・`15.6`・`36.8`、
`itemized-statement-generation/REQ-4.4`・`7.1`・`8.3`・`9.4`・`9.7`・`17.2`・`17.3`、
`project-management/REQ-1.5`・`8.3`・`13.4`・`13.6`・`22.3`・`22.6`・`26.3`・`27.5`・`29.6`・`40.3`・`40.4`・`40.5`・`41.2`、
`quantity-table-generation/REQ-28.2`、`site-survey/REQ-8.2`、
`trading-partner-management/REQ-11.9`・`12.19`・`12.26`、
`user-authentication/REQ-5.6`・`11.3`。

未被覆から外れた受入基準（6件）: `estimate-request/REQ-11.25`〜`11.30`
（受領見積書の群が一律にずれており、除外が代替検証として挙げていた E2E 自体が
当該条文を検証していた。番号違いで対応が見えなくなっていた）。

**被覆率が下がったのは未検証条文の露出であり、正しい。** 緑へ戻すための番号の付け直しはしていない。

### 5.1 検査の結果（HEAD との突き合わせ）

| コマンド | HEAD | 是正後 |
| --- | --- | --- |
| `check:req-coverage` | 失敗（3件の FAILED: 適用対象の被覆率／本番未到達26件／本番到達込み99.0%） | 失敗（同じ3種: 適用対象の被覆率／本番未到達23件／本番到達込み97.8%） |
| `check:req-coverage:strict` | 失敗（上記＋除外リストにない未カバー1件／代替検証の不在170件） | 失敗（同じ5種: ＋除外リストにない未カバー35件／代替検証の不在163件） |
| `check:req-coverage:selftest` | 合格 22/22 | 合格 30/30 |
| `check:req-exclusions` | 合格 | 合格（206件） |
| `check:req-exclusions:selftest` | 合格 | 合格 47/47（陽性34 / 陰性5 / 機構8） |
| `type-check` / `lint` / `format:check` | 合格 | 合格 |
| `check:e2e-guards` / `check:e2e-selfjudge` | 合格 | 合格 |
| `check:design-refs` / `check:design-code-refs` / `check:design-path-refs` / `check:steering-refs` | 合格 | 合格 |

**FAILED の種類と文言は HEAD と同じで、件数だけが動いた。** 増えた件数はいずれも
本タスクで露出させた未検証条文であり、新しい種類の失敗は生じていない。

`check:req-exclusions:selftest` の陽性対照が使う `COVERED_PROBE_ID` は、本タスクで
`site-survey/REQ-1.1` の被覆印を取り下げたことで前提（`e2e/specs` が当該番号を名乗る）が
崩れた。**前提が崩れたまま静かに通ることを避けるため**、指し先を `site-survey/REQ-1.3` へ
差し替えたうえで、走査で前提そのものを確かめる `assertCoveredByE2E` を足した。
差し替えを元に戻す変異では
`Error: 前提: site-survey/REQ-1.1 を名乗るラチェットでない被覆印が e2e/specs に無い`
で落ちることを実測で確認している（第3原則: 前提条件で検査を無効化しない）。

## 6. 引き継ぎ

- **部分被覆（タスク 115.220 で決着済み。以下の三件の記述は 115.188/115.189 時点の実測）**:
  `project-management/REQ-27.4`（原文
  `.kiro/specs/project-management/requirements.md` 要件27 の 4「セクション右上の『新規作成』
  ボタン**と**『すべて見る』リンクを非表示にする」）を名乗る被覆印は**三件**あり、
  **三件とも「すべて見る」リンクの非表示しか主張していなかった**。「新規作成」ボタンが
  非表示であることを確かめる検証は一件も無かった（実測）。
  - `e2e/specs/projects/project-detail-sections.spec.ts:450` — 表題は両方を名乗るが、本文の
    アサーションは `すべて見る` リンクの `not.toBeVisible()` だけ。
  - `e2e/specs/estimate-requests/estimate-request-e2e.spec.ts:379` — 「すべて見る」の非表示のみ。
  - 同 `:436` — 表題は「セクション右上の『新規作成』ボタンが非表示である」だが、本文が
    確かめるのは空状態の「新規作成」リンクが**見えること**と `すべて見る` リンクの非表示。
  **本項の初版は「115.189 の _Boundary_ に属する」と差し向けていたが、誤りだった。**
  115.189（除外の代替検証）の側で測ったところ、当該IDは `e2e/requirement-exclusions.json` に
  **存在しない**（除外ではない）。したがって除外の代替検証の所管ではなく、**被覆印が条文の
  規範の一部しか観測していない**形であり、§4 の約340件と同じ層にある。
  §4 の約340件を 115.189 が引き取らなかった理由（および本件が同じ扱いになる理由）は
  `scripts/exclusion-alternative-verification-adjudication.md` §9 に記録がある。

  **タスク 115.220 で決着した。扱いは「観測の追加」であり、被覆印は取り下げていない。**
  以下は 2026-09-01 の実測である。

  - **二つの選択肢の指標への影響を測ってから決めた。**
    - **取り下げ**（三件の `@requirement project-management/REQ-27.4` と表題の名乗りを消す）:
      被覆済み 2674 → **2673**、未被覆 215 → **216**、適用対象の被覆率 98.73% → **98.70%**。
      新たに未被覆へ落ちるのは `project-management/REQ-27.4` **一件のみ**（差集合を機械で取った）。
    - **観測の追加**（採用）: 被覆済み 2674、未被覆 215、適用対象の被覆率 98.73% で**不変**。
      `check:req-coverage` の全文が HEAD と**バイト一致**する（`diff` で確認）。
    - いずれも `npx tsx scripts/check-requirement-coverage.ts --json` をリポジトリ直下から実行。
  - **§4（約340件）と揃うのはどちらか。** §4 の裁定は未決であり、決着の向きは
    「一律に取り下げる」か「観測を足して名乗りを正直にする」かのいずれかになる。
    本件を**観測の追加**で埋めれば、当該IDは「規範の一部しか観測していない」母集団から
    **抜ける**ため、§4 がどちらへ決着しても矛盾しない（取り下げの対象は部分被覆の被覆印で
    あり、全体を観測する被覆印は取り下げの対象にならない）。**取り下げを先に当てると、
    §4 が「観測を足す」へ決着した場合に本件だけが逆向きになる。** ゆえに観測の追加を採った。
  - **既存の三件が当該の欠陥に対して盲目であったことを変異で実測した。**
    `frontend/src/components/projects/EstimateRequestSectionCard.tsx` のヘッダー部の
    `{!isLoading && totalCount > 0 && (…)}` を `{!isLoading && (…)}` へ緩め、
    「すべて見る」リンク側にだけ `totalCount > 0` を残す（＝右上の「新規作成」ボタンだけが
    0 件のときにも出る欠陥を作る）と、
    `estimate-request-e2e.spec.ts` の「REQ-1.3: 見積依頼がない場合、「すべて見る」リンクが
    非表示である (project-management/REQ-27.4)」は **2 件中 2 件が緑のまま通る**。
    是正で足した観測は同じ変異で赤くなる（下記）。
  - **是正の内容**（`e2e/specs` の二箇所。右上のボタンだけが持つアクセシブル名
    `aria-label="見積依頼を新規作成"` を `exact: true` で指し、表記が同じ空状態の
    「新規作成」リンクと取り違えないようにした）:
    - `e2e/specs/projects/project-detail-sections.spec.ts` — 表題が両方を名乗る区間に、
      右上のボタンの `not.toBeVisible()` と空状態リンクの `toBeVisible()` を足した。
    - `e2e/specs/estimate-requests/estimate-request-e2e.spec.ts` — 表題が
      「セクション右上の『新規作成』ボタンが非表示である」と名乗りながら本文が
      見ていなかった区間に、右上のボタンの `not.toBeVisible()` を足した。
    - 同ファイルの「REQ-1.3」の区間（「すべて見る」のみを主張する）は**手を入れていない**。
      表題と本文が食い違っておらず、条文自体は上の二件が全体を観測するため被覆済みである。

  **タスク 115.250 で残りを決着させた（2026-09-03）。§4.4 へ追加登録した。**

  - **手を入れなかった「REQ-1.3」の区間は、被覆印としては §4（B: 主題は同じで規範の一部が未観測）
    の母集団に属する。** §4 の分類は被覆印**一件ごとの性質**（主題が同じか・原文の規範の一部が
    未観測か）で決まるのであって、名乗る受入基準が他の被覆印によって全体を観測されているか
    どうかでは決まらない（§2）。当該区間は右上の「すべて見る」リンクの非表示しか主張せず、
    原文が連言で並べる「新規作成」ボタンの非表示にも前件（0 件であること）の確定にも触れない。
    ゆえに B であり、**§4.4 へ登録した**。
  - **「§4 の母集団から意図的に除く」とは書かない。** 除くと §4 の母集団が「B の被覆印」ではなく
    「B の被覆印のうち、名乗る条文が他の被覆印で全体観測されていないもの」という、どこにも
    書かれていない規則へ静かに変わる。しかも §4 が将来どちらへ決着しても（一律に取り下げる／
    観測を足す）本件だけが手当ての対象から外れる。**115.220 が「先に取り下げると §4 の決着と
    逆向きになりうる」として観測の追加を採ったのと同じ理由で、母集団から外す道を採らない。**
  - **受入基準 `project-management/REQ-27.4` の被覆の判定は動かない。** 本件は被覆印の帳簿の
    是正であって、`check:req-coverage` の分子にも分母にも触れない。三件はいずれも被覆印のまま
    である（取り下げていない）。
  - **記録を機械へ載せる道は採らなかった（実測つきで開示する）。本記録を読む機械は無い。**
    本記録の名を引くファイルは、**本記録自身（この段落が自分の名を綴るため）を除くと 3 件**で、
    いずれも散文である
    （`grep -rl coverage-mark-adjudication --include=*.ts --include=*.js --include=*.json --include=*.md --include=*.yml . | grep -v node_modules` は
    4 件を出し、その内訳は本記録自身・`.kiro/specs/site-survey/tasks.md`・
    `scripts/scan-coverage-mark-correspondence.ts`（`@fileoverview` の註釈で裁定の所在を述べるだけ）・
    `scripts/exclusion-alternative-verification-adjudication.md` である。2026-09-03 に実測）。
    §4 を丸ごと（本項目の追加登録を含め `## 4.` から `## 5.` の手前まで 140 行。約340件の登録）
    削除する変異を当てても、`check:design-refs` /
    `check:design-code-refs` / `check:design-path-refs` / `check:design-measurement-freshness` /
    `check:steering-refs` / `check:steering-idents` / `check:steering-test-tree` /
    `check:trace-coverage` / `check:req-exclusions` / `check:cf-evidence` / `check:e2e-guards` /
    `check:e2e-selfjudge` / `check:design-component-reqs` / `check:dead-script-env` の 14 本と
    `format:check` は**すべて終了コード 0 のまま**であった（2026-09-03 に実測。変異は事前複製からの
    `cp` で復元し `sha256sum -c` で照合した）。載せる既存の経路は
    `scripts/check-design-measurement-freshness.ts` の `GOVERNED_DOCUMENTS` へ本記録を加え
    `scripts/design-measurements.json` に宣言を置く形**ひとつだけ**である（同自己検査は
    「実マニフェストの全ての宣言が所管の文書を指している」を課すため、文書の追加なしに宣言は
    置けない）。**その面を広げてよいかの判断は未決のタスク 115.273 / 115.276 が所管する。**
    両タスクは「宣言すると他文書を触った押下が本スペックの数値の測り直しで止まる」代償を
    受け入れるかを未決とし、現況（対象文書 1 件・宣言 30 件がすべて `site-survey/design.md` を
    指す）を前提に据えている。先取りは当該二件の前提を崩すため、本タスクでは採らない。
  - **「§3 にも §4 にも無く §6 にだけ在った」ことを HEAD 版で実測した。**
    `git show HEAD:scripts/coverage-mark-adjudication.md | awk '/^## 3\./,/^## 5\./' | grep -c 'estimate-request-e2e.spec.ts:379'`
    → **0**、同じ HEAD 版に
    `awk '/^## 6\./,0' | grep -c 'estimate-request-e2e.spec.ts:379'` を当てると → **1**
    （2026-09-03 に実測。`:379` は 115.220 の是正で行が動く前の位置で、いまは `:386` である）。
  - **同型（どの母集団にも属さない B の被覆印）が他に無いかを走査した。走査範囲をコマンドで宣言する。**
    母集団は **§6 が「決着済み」と述べた項目**に取る。§4 へ登録済みの項目は定義上「どの母集団にも
    属さない」になりえず、§6 の未決項目は引き継ぎ先が明示されている。取りこぼしが起きうるのは
    「決着済み」と述べながら §4 へ登録しなかった項目だけである。
    - `grep -n '^- \*\*.*決着済み' scripts/coverage-mark-adjudication.md` → **1 行**。出力は
      `- **部分被覆（タスク 115.220 で決着済み。以下の三件の記述は 115.188/115.189 時点の実測）**:`
      であり、本記録が「決着済み」と述べた §6 の項目は**本項ただ一つ**である（行番号は自己言及で
      動くため、指し先は見出しの逐語で持つ）。
    - 本項が挙げる被覆印は三件で、現在位置は
      `npx tsx scripts/scan-coverage-mark-correspondence.ts --tsv | awk -F'\t' '$3=="project-management/REQ-27.4"'`
      → `e2e/specs/estimate-requests/estimate-request-e2e.spec.ts` の **386 行**・**452 行**と
      `e2e/specs/projects/project-detail-sections.spec.ts` の **464 行**（2026-09-03 に実測）。
    - 残る二件が §4 に居ないのは正しい。
      `awk '/^## 4\./,/^## 5\./' scripts/coverage-mark-adjudication.md | grep -c 'estimate-request-e2e.spec.ts:452\|project-detail-sections.spec.ts:464'`
      → **0**。両者は 115.220 の是正で連言の両方（「新規作成」ボタンと「すべて見る」リンク）と
      前件を観測するようになったため B ではなく、§4 に属さないのが正しい。
      **§4 にも §6 の未決項目にも属さない B は 386 行の一件のみ**であり、それが上の追加登録である。
    - **この走査は本記録の中で閉じる。** 母集団を「本記録 §6 の『決着済み』項目」に取っているため、
      他スペックの記録（`scripts/exclusion-alternative-verification-adjudication.md` など）へは
      波及しない。他記録に同型が居るかは本項目の _Boundary_ 外であり、走査していない。
  - **§4 が引く指し先の陳腐化を実測で述べる（是正は本項目の _Boundary_ 外。未起票である）。**
    §4 の本文から `<path>.spec.ts:<行>`（カンマ列は展開）を取り出し、走査の正典と突き合わせる:
    `comm -23 <(awk '/^## 4\./,/^## 5\./' scripts/coverage-mark-adjudication.md | grep -oE '[A-Za-z0-9_./-]+[.]spec[.]ts:[0-9]+(,[0-9]+)*' | awk -F: '{n=split($2,a,","); for(i=1;i<=n;i++) print $1":"a[i]}' | sort -u) <(npx tsx scripts/scan-coverage-mark-correspondence.ts --tsv | awk -F'\t' '{sub(/^e2e\/specs\//,"",$1); print $1":"$2}' | sort -u)`
    （bash で実行する）。2026-09-03 の実測で、**§4 が引く指し先は一意 150 件、そのうち 55 件が
    現在の走査の正典に無い**（左辺の件数は同じ `grep -oE … | awk -F: … | sort -u | wc -l`、
    差集合の件数は上のコマンドに `| wc -l` を足して得た）。**55 件は行の移動だけではなく、
    115.188 の是正で取り下げた被覆印や §4.5 が挙げる「散文の言及」も含む**ため、
    「55 件すべてが行番号のずれ」とは主張しない。ずれが実際に起きている例として確認したのは
    上の追加登録が挙げる `:1537,2965,3598` → `:1550`・`:2978`・`:3611` の **13 行ずれ**である。
    **この陳腐化そのものの是正は本項目の _Boundary_ 外であり、タスクとして未起票である。**
  - **変異で赤くなることを実測した**（上と同じ変異を当て、`npm run test:docker:build` 相当の
    `docker compose … up -d --build --force-recreate frontend` でフロントを作り直して実行）:
    `project-detail-sections.spec.ts` は
    `Error: expect(locator).not.toBeVisible() failed / Locator: getByTestId('estimate-request-section').getByRole('link', { name: '見積依頼を新規作成', exact: true }) / Expected: not visible / Received: visible` で落ち、
    `estimate-request-e2e.spec.ts` も同じ locator で落ちた。変異は退避した控えからの
    書き戻しで復元し（`md5sum` 一致）、フロントを作り直して 19/19・5/5 が緑に戻ることを確認した。
- **§4 の各項目**: 主題は同じで規範の一部が未観測。115.189 と同型の判断が要る。
- **§4.5 の散文の言及**: 被覆印の読み取り規則が「名乗る意図の無い番号」を拾っている。
  規則の側の欠陥であり、被覆印の指し先の問題ではない。現時点で分子の水増しにはなっていない。
- **本番コードの註釈だけが被覆の担い手になっている形**: `trading-partner-management/REQ-12.14` は
  `frontend/src/pages/TradingPartnerListPage.tsx` の一覧が名乗っていた。`estimate-creation/REQ-23.3`
  ほかも `frontend/src/components/estimate/EstimateItemToolbar.tsx` の註釈が名乗っている。
  `frontend/src`・`backend/src` は本タスクの _Boundary_ 外である。
- **分母外の被覆印 5 件**（§5）: `frontend/src`・`backend/src` の註釈が、枝つき番号や
  実在しない番号を名乗っている。分子には入らないが、註釈の指し先としては誤りである。
- **`projects/project-detail.spec.ts` の「一覧に戻る」検証**: 要件32.1 は
  「詳細画面から『← 一覧に戻る』リンクを**削除する**」と述べており、当該検証はリンクが見えることを
  主張していて要件と正面から矛盾する。**被覆印は本タスクで取り下げたが、検証そのものの是非**は
  本タスクの _Boundary_ 外である（`projects/project-navigation.spec.ts:662` の同種の検証も同じ）。
