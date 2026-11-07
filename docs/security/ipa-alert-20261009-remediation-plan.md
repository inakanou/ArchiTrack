# IPA 注意喚起（2026-10-09）に基づくセキュリティ是正計画

_作成: 2026-10-15（`/kiro-discovery` の結果。HEAD `02c425e7` 時点の読み取り調査に基づく）_

## 1. 背景

IPA「国内で相次ぐ不正アクセスによる情報漏えいを踏まえた注意喚起」（https://www.ipa.go.jp/security/security-alert/2026/alert20261009.html ）は、特定製品の脆弱性ではなく、次の3観点の点検と対策を求めている。

1. 外部公開アプリケーション: 公開範囲、多要素認証等の認証強化、権限、ログの取得内容と保持期間、異常（エラー急増等）の検知、未適用パッチ
2. 利用中の外部サービス: 洗い出し、不審なアカウント（作成していない／無効化したはずのアカウントの有効化）、認証強化、アカウント付与範囲と棚卸し
3. 保有データ: 最小化、保管場所の再検討、アクセスログ、暗号化

本書は、この観点で本プロジェクトを監査した結果の是正項目と、その進め方を記録する。

## 2. 決定事項（2026-10-15、利用者の判断）

| 論点 | 決定 |
|---|---|
| 進め方 | spec 単位で順に完了させる（要件→設計→タスク→実装→`/kiro-validate-impl` を 1 本ずつ閉じる） |
| 既存機能の改修 | 所管する既存 spec の要件・設計・タスクを更新する形で進める |
| どの既存 spec にも属さない項目 | 新規 spec を起票せず、直接実装・運用作業・文書化として本書で管理する（理由は §6） |
| 担当外の案件の閲覧 | 対応範囲に含める（案件単位の閲覧範囲の制限を導入する） |
| 2FA 必須化 | 全ユーザー必須 |
| spec の構成 | 構成を壊さないことを効率より優先する（§4 の守りに従う） |

## 3. 作業順序

1. **直接実装 D1（xlsx）**: `.security-audit-allowlist.json` の xlsx 許容期限が 2026-10-31 のため最初に行う
2. **運用作業 O1〜O6**: コード変更なしで即時実施できる（§7）
3. **user-authentication**: 外部から直接突ける欠陥を含み、他 spec が使う仕組み（閲覧範囲の判定、出力の記録 API、定期ジョブ）を所有する
4. **site-survey**: 共通画像基盤（`ImageProcessorService`・`StorageProvider`・`SignedUrlService`）を所有する
5. **project-management**: 案件の閲覧範囲（メンバー・担当者）の定義を所有する
6. construction-photo
7. estimate-request
8. quantity-table-generation
9. execution-budget-management
10. estimate-creation
11. itemized-statement-generation
12. construction-schedule
13. contract-management
14. trading-partner-management
15. company-info
16. **残りの直接実装 D2〜D14 と文書化 W1〜W4**

各 spec の手順は `/kiro-spec-requirements <spec>` → `/kiro-spec-design <spec>` → `/kiro-spec-tasks <spec>` → `/kiro-impl <spec>` → `/kiro-validate-impl <spec>`。

## 4. spec の構成を壊さないための守り

調査で確認した、本プロジェクトの慣例と関門に従う。

- **要件番号**: 既存の最終番号の続きに連番で追加する（枝番は使わない。関門の正規表現は `[A-E]` の枝しか読まない）。見出し書式（`### 要件N:` か `### Requirement N:`）と EARS の文体は spec ごとの既存の形式に合わせる
- **既存条文の改訂**: 番号を残し、改訂箇所に「改訂の記録・採らなかった案」を残す。撤廃は取り消し線で潰す
- **tasks.md**: タスク番号は既存の最終番号の続き。挿入位置は行頭の `^## ` 見出しで決め、挿入後に前後の差分を確認する
- **spec.json**: 未完了タスクを起票した時点で phase を `tasks-generated` へ戻す。`/kiro-validate-impl` が GO になったら別コミットで `implementation-complete` に戻す
- **関門**: 受入基準を足すたびに、被覆印（実務上は E2E）または除外登録、design.md の追跡表、鉤括弧の逐語の実在、freshness の件数宣言を同じコミットで整える。関門は名指しで 1 本ずつ回し、`:update` 変種は使わない
- **横断的な仕組み**: 仕組みは所管 spec（主に user-authentication）が持ち、各業務 spec は自分の記録対象・適用箇所を受入基準として持つ（前例: 57a39eec、570460dc、daf8cce0）
- **コミット**: spec の追記は `docs(<spec>)` の単独コミット、実装は 1 タスク 1 コミット

## 5. 既存 spec の改修項目

深刻度: 高＝外部から直接悪用できる、または証跡・個人情報に直結する。中・低はそれ以下。

### 5.1 user-authentication

2026-10-26 の時点で、本節の各項目は user-authentication の要件7.3・32〜45 とタスク44〜62 で実装した（各行の「状況」の列。対応する要件と、tasks.md の _Requirements_ にその要件を持つタスクの番号を記す）。RBAC の上限の行の残件 4 件（既存のロールの優先度の引き上げ、高い優先度のロールの作成、保有しない権限の追加、上限を超えるロールの割り当ての解除）は、2026-10-26 の利用者の判断で要件38.6〜38.10 として要件38 へ取り込み、併せて上限より上のロールの変更・消去の拒否（38.11）とシステムロールの優先度の変更の拒否（38.12）を加え、タスク58 で実装した。続く最終検証で見つかった、上限を超えるユーザーの削除・無効化・再有効化・2FA の再設定の拒否（38.13）を同日の利用者の判断で加え、タスク62 で実装した。

2026-10-29 の利用者の判断（「推奨案で進める」「推奨案で直す」）で、経路の案件と対象の実際の案件の食い違いの記録（要件39.8）、出力の記録の要求の再試行の是正（要件40.10 の是正。条文は変えない）、クリップボードへのコピーの出力の記録（要件40.10・40.11 の対象の拡張）を加え、タスク63・64 と各業務 spec のタスクで実装した。併せて各業務 spec が、閲覧範囲外と不在の 404 を受けた画面の日本語の不在の表示を自分の受入基準として起票し実装した。総合検証（タスク65.1）と全 10 spec の `/kiro-validate-impl` が 2026-10-30 に GO を出したため、表の「状況」を「完了」とした（それまでは「実装済み」）。

同日（2026-10-30）に挙がった 8 項目を、利用者の判断（「推奨案で進める」の 2 回目）で次のとおり扱った。(5) 見積書の削除が画面から常に 400 になり消せなかった既存の不具合を直した（estimate-creation の受入基準11.4、`e5fd9877`）。(1) 内訳書の詳細画面の削除と並び順の保存が 409 を判定できていなかった既存の不具合を直した（itemized-statement-generation の受入基準10.4・17.14、`7d6e49ca`）。(8) 出来高記録の取り除きの 404 でプロジェクトが見つからない旨が出ていたのを、出来高記録が見つからない旨に改めた（execution-budget-management の受入基準21.2、`b2415ff2`）。(6) 見積依頼の配下の経路で属さない受領見積書を不在と同じ 404 にし、範囲外なら記録する（estimate-request の受入基準42.12）。(2) 記録しない「論理削除」を案件そのものの論理削除に限り、対象のデータが論理削除済みでも範囲外の案件なら記録するよう要件39.8 を改め、各業務 spec を揃えた。(3) 数量表の保存の本文の属さない既存の ID の実際の案件が範囲外なら記録する（quantity-table-generation の受入基準50.11）。(7) 見積依頼の詳細画面の見積依頼文と選択した項目の一覧のコピー、メールで開く操作を出力の記録の対象に加えた（種別は利用者の判断の案 A で経路ごとに 3 つ）。(4) 404 以外のエラーの画面の表示は現状維持とした。(2)(3)(6)(7) の行は下の表に加えた。総合検証（タスク68.1）と関係する 8 spec の `/kiro-validate-impl` が 2026-10-31 に GO を出したため、その「状況」を「完了」とした（それまでは「実装済み」）。

| 区分 | 項目 | 深刻度 | 関係する既存要件 | 状況 |
|---|---|---|---|---|
| 認証 | 2FA 検証がメールアドレスだけで通る（`/verify-2fa`・`/verify-2fa/backup`）。パスワード認証成功時にだけ発行する短命・1回限りの「2FA 待ち」トークンに限定する | 高 | 要件4、27A | 完了（要件32.1〜32.6。タスク46.1・46.3） |
| 認証 | アクセストークンとリフレッシュトークンを区別していない（クレーム同一、`verifyToken` が `type` を検証しない）。`typ`・`aud`・`iss` を付けて検証する | 高 | 要件5 | 完了（要件33.1〜33.3。タスク45.1・45.6） |
| 認証 | リフレッシュトークンを localStorage と応答本文で扱っている。HttpOnly cookie のみに限定し、アクセストークンはメモリ保持にする。cookie 化に合わせて CSRF を適用する | 高 | 要件5、26.3、26.5、26.7 | 完了（要件33.8〜33.12。タスク44.7・44.11・45.3〜45.6） |
| 認証 | `trust proxy: true` と X-Forwarded-For 先頭値をキーにしたレート制限で、回数制限と監査ログの IP を偽装できる | 高 | 要件26.4、26.12 | 完了（要件35.1・35.2。タスク44.5・48.3） |
| 認証 | `/verify-2fa`・`/verify-2fa/backup`・パスワードリセット要求/実行・登録に専用の回数制限を付ける。`DISABLE_RATE_LIMIT` を本番で無効にする | 中 | 要件26.4、26.12 | 完了（要件35.3〜35.7。タスク48.1〜48.3） |
| 認証 | 2FA を全ユーザー必須にする（未登録者は登録へ誘導） | 高 | 要件27 系（新規要件） | 完了（要件34。タスク47.1〜47.6・47.8〜47.11・49.6・49.8） |
| 認証 | TOTP の再利用防止、2FA 無効化に TOTP を要求する | 中 | 要件27B、27C | 完了（再利用の拒否は要件32.7・タスク46.2・46.3。無効化は TOTP の要求に代えて自己の無効化そのものを拒否する形にした〔要件34.6・タスク47.1・47.10〕） |
| 認証 | リフレッシュトークンの再利用検知（系列ごとの失効） | 中 | 要件5 | 完了（要件33.4〜33.6。タスク44.10・45.2・45.5・45.6） |
| 認証 | パスワードリセットトークンの有効期限を 24 時間から 1 時間へ（定数の二重定義を解消） | 中 | 要件7 | 完了（要件7.3。タスク48.2） |
| 認証 | login 応答の `userId` と DB エラーの詳細を返さない | 低 | 要件10 | 完了（要件42.7・42.8。タスク46.1・46.3・55.3） |
| トークン保存 | リフレッシュ・パスワードリセット・招待の各トークンをハッシュ化して保存する。使用済み・期限切れを定期削除する | 中 | 要件5、7、1 | 完了（要件33.7・37.1・37.4・37.8。タスク44.9・45.2・50.1・50.2） |
| 公開範囲 | `/admin/log-level` が認証なしで本番公開されている。撤去または認証・権限チェックを付ける | 高 | 要件21.1 | 完了（要件42.1・42.2。タスク55.1・55.5） |
| 公開範囲 | frontend（nginx）に CSP・HSTS・Referrer-Policy・`server_tokens off` を付け、各 location へ継承させる | 中 | 要件26.10 | 完了（要件44。タスク56.1・56.2） |
| アカウント | ユーザーの無効化機能（ログイン・リフレッシュ・認証で拒否、全セッション失効、監査記録、管理者への通知） | 高 | 要件9（新規要件） | 完了（要件36.1〜36.6。タスク47.6・49.1〜49.3・49.7・49.8） |
| アカウント | `lastLoginAt` の記録、棚卸し画面（最終ログイン・2FA 状態・ロール・招待者）、長期未使用アカウントの自動無効化 | 高 | 要件9（新規要件） | 完了（要件36.7〜36.12。タスク44.1・49.1・49.3〜49.6・49.8） |
| アカウント | 招待 API が token を返さない、検証を POST 本文で受ける、管理者なら誰でも招待を取り消せる | 中 | 要件1、2 | 完了（要件37.2・37.3・37.5。タスク50.1・50.3・50.4。37.3 の記録側はタスク55.2・56.1） |
| アカウント | seed の初期管理者パスワードに強度検証と初回変更の強制を適用する | 中 | 要件3 | 完了（要件37.6・37.7。タスク47.6・47.7・47.10） |
| RBAC | 自分より強いロール・`*:*` を付与できないようにする | 中 | 要件17〜20 | 完了（要件38.1〜38.13。タスク51・58・62） |
| RBAC | 一般ロールの既定から `user:read` を外す | 中 | 要件9、20 | 完了（要件38.4・38.5。タスク44.4・49.7・49.8・51.2） |
| RBAC | 案件単位の閲覧範囲を判定する共通の仕組み（各業務 spec が適用する） | 中〜高 | 要件21.6（所有者フィルタリング） | 完了（要件39。タスク44.4・52.1〜52.4・55.4。各業務 spec への適用はそれぞれの spec で行う） |
| 監査 | ログイン成功・失敗・ロック、2FA 成功・失敗、ログアウト、リフレッシュを記録する | 高 | 要件22（型だけ定義され未記録） | 完了（要件40.1〜40.4。タスク44.3・53.1・53.5） |
| 監査 | ユーザー削除で監査ログが連鎖削除される（`AuditLog.actor` の `onDelete: Cascade`）。撤廃し、`USER_DELETED` を削除前に記録する | 高 | 要件22、design「保持期間・ローテーション戦略」の不変性 | 完了（要件40.6〜40.8。タスク44.2・53.2・53.5） |
| 監査 | 招待の作成・取消、招待経由の登録を記録する | 中 | 要件22 | 完了（要件40.5・40.12。タスク50.1・50.4・59.1・59.2） |
| 監査 | 業務データの出力・一括ダウンロードを記録する API（各業務 spec が呼ぶ） | 中 | 要件22（新規要件） | 完了（要件40.9〜40.11。タスク53.3〜53.5。各業務 spec の呼び出しはそれぞれの spec で行う） |
| 監査 | アーカイブを定期ジョブとして配線し、暗号鍵を本番必須にする（未設定時のランダム鍵生成を廃止） | 中 | design「保持期間・ローテーション戦略」（月次・13か月・8年） | 完了（要件41。タスク44.6・54.1・54.2） |
| 監査 | 認証失敗・権限拒否・429・5xx の急増アラート | 中 | 要件22.8、22.9 の拡張 | 完了（要件43。タスク55.4・60.1） |
| ログ | URL クエリのトークン伏せ字、Sentry へ `req.body` を送らない・`beforeSend` での伏せ字 | 中 | 要件26.11 | 完了（要件42.3・42.4。タスク55.2・55.3） |
| ログ | request-id をサーバーで生成する、アクセスログに userId を付ける | 低〜中 | 要件22.11 | 完了（要件42.5・42.6。タスク55.2） |
| メール | Bull に `REDIS_URL` を渡す、`removeOnComplete`・`removeOnFail` を設定する | 中 | 要件24（メール送信の切り離し） | 完了（要件45。タスク44.8・44.12） |
| RBAC | 入れ子・二重マウントの経路で、経路の案件と対象の実際の案件が食い違う要求を不在として扱い、対象の案件が閲覧範囲外でも記録していなかった | 中 | 要件39.2、39.7 | 完了（要件39.8。タスク63.1・63.2。各業務 spec の適用: contract-management 20.2、estimate-request 104.1・104.2、itemized-statement-generation 28.2、estimate-creation 63.1、construction-schedule 23.1、quantity-table-generation 105.1、execution-budget-management 18.1・18.2。総合検証はタスク65.1） |
| 監査 | 出力の記録の要求と、サーバーで記録してから生成する出力の要求が、API クライアントの自動再試行（最大 3 回）で送り直され、出力 1 回に記録が重なり得た | 中 | 要件40.10 | 完了（要件40.10 の是正。条文は変えない。`03f1e0e7`。design.md の ExportAuditService と ExportAuditClient の節の改訂の記録。総合検証はタスク65.1） |
| 監査 | 内訳書の項目のクリップボードへのコピーが出力の記録の対象に入っていなかった | 中 | 要件40.10、40.11 | 完了（種別 `itemized_statement_clipboard` と記録してから書き込む包み。タスク64.1。画面への適用は itemized-statement-generation 28.1。総合検証はタスク65.1） |
| RBAC | 閲覧範囲外と不在の 404 を受けた画面が、英語の本文や取得の失敗の文言と再試行の釦を出していた（範囲外と不在は同じ表示にする。サーバーの応答は変えない） | 低 | 要件39.2 | 完了（各業務 spec の受入基準とタスク: contract-management 21.1、estimate-request 105.1、itemized-statement-generation 29.1、estimate-creation 64.1、construction-schedule 24.1、quantity-table-generation 106.1、execution-budget-management 19.1、site-survey 120.1、construction-photo 31.1。共通の表示部品 `ResourceNotFound` を使う） |
| RBAC | 対象のデータ（契約書・工程表・数量表・内訳書・見積書・契約など）が論理削除済みのとき、範囲外の案件のものでも食い違いや所属の照合で記録していなかった | 中 | 要件39.7、39.8 | 完了（要件39.8 の改訂〔2026-10-30〕。タスク66.1 `2674fdf0`。各業務 spec の適用: contract-management 22.1 `a1494b1a`・22.2 `f4b466a1`、construction-schedule 25.1 `6f171cb1`・25.2 `774dfbdd`、itemized-statement-generation 30.1 `6de8723a`、estimate-creation 65.1 `8c99952f`、execution-budget-management 20.1 `25dffd0f`。総合検証はタスク68.1） |
| RBAC | 数量表の保存の本文に、保存する数量表に属さない範囲外の案件のグループ・項目の ID を含めても記録していなかった（応答は従来の 400 のまま） | 中 | 要件39.7、39.8 | 完了（quantity-table-generation の受入基準50.11、タスク107.1 `8c924cd8`） |
| RBAC | 見積依頼の配下の経路で、その見積依頼に属さない受領見積書を指す要求を照合していなかった（経路の見積依頼の ID を読めていなかった） | 中 | 要件39.2、39.8 | 完了（estimate-request の受入基準42.12、タスク106.1 `aa2f93bb`） |
| 監査 | 見積依頼の詳細画面の見積依頼文と選択した項目の一覧のコピー、メールクライアント・Gmail で開く操作が出力の記録を経ていなかった | 中 | 要件40.10、40.11 | 完了（種別 `estimate_request_text_clipboard`・`estimate_request_items_clipboard`・`estimate_request_text_mail`。タスク67.1 `4901104f`。画面への適用は estimate-request の受入基準42.13〜42.16、タスク107.1 `3cf87a04`。総合検証はタスク68.1） |

### 5.2 site-survey（共通画像基盤を所有）

| 項目 | 深刻度 | 関係する既存要件 |
|---|---|---|
| 300KB 以下の画像・フロントの圧縮スキップ時に EXIF（GPS）が残る。サイズに関係なく `.rotate()` と再エンコードでメタデータを除去する | 高 | 画像アップロード系の要件 |
| 保存済み画像の EXIF を除去する移行処理 | 高 | 同上 |
| 論理削除時に画像の実ファイルを削除する（`deleteBySurveyId` が未配線）。注釈付きサムネイルも削除する | 中 | 削除系の要件 |
| サムネイルの署名 URL 発行時に権限・閲覧範囲を判定する | 中 | 署名 URL 系の要件 |
| 署名 URL の既定期限を 900 秒に統一する | 低 | 同上 |
| 本番で local ストレージと `R2_PUBLIC_URL` を禁止する（起動時に失敗させる） | 中 | Requirement 16.6 |
| 画像の定期バックアップ（検証表で F のまま） | 中 | Requirement 16.7 |
| 案件の閲覧範囲の適用 | 中 | user-authentication 21.6 の適用 |
| 調査報告書 PDF・個別／一括エクスポートの出力記録 | 中 | Requirement 11、12、31 |

### 5.3 project-management

- ~~案件の閲覧範囲の定義（担当者・メンバー）と、一覧・詳細への適用（user-authentication 21.6 の適用）~~ → 判定の規則は user-authentication 要件39 が定め、案件そのもの（`/api/projects` の一覧・件数・詳細・更新・状態変更）への適用も user-authentication の設計（2026-10-16）が持つ。本 spec に残るのは、案件の画面での範囲外の表示（一覧に出ない・詳細が「見つかりません」になる）の確認と、案件の担当者変更の画面の扱い
- 案件の論理削除時の配下ファイルの扱いと、論理削除データの保持期間・完全削除

### 5.4 construction-photo

- 工事写真の原本取得 API に関係者判定（閲覧範囲）を適用する
- アルバム・案件の論理削除時に実ファイルを削除する
- 台帳 PDF 出力（Requirement 10）、ZIP 一括エクスポート（Requirement 15）の出力記録
- site-survey の EXIF 除去が工事写真の経路（ローカル・カメラ・現場調査からのコピー）でも効くことの検証

### 5.5 estimate-request

- Claude Vision 送信の事前告知、ON/OFF（粒度は要件定義で決める）、送信の記録、利用者ごとの回数制限、専用権限
- 受領見積書の署名 URL を 900 秒にする
- 内訳書 Excel 出力（Requirement 5）、現場調査報告書出力（Requirement 35）の出力記録
- 閲覧範囲の適用

### 5.6 quantity-table-generation

- PDF 取り込みの Claude Vision（Requirement 30）に、estimate-request と同じ告知・ON/OFF・記録・回数制限を適用する
- 数量表画像の署名 URL の期限を明示する
- 数量表 PDF 出力（Requirement 26）の出力記録
- 閲覧範囲の適用

### 5.7 execution-budget-management（phase は既に `tasks-generated`）

- 発注一覧エクスポート（Requirement 10）と月別出来高エクスポートの出力記録
- 閲覧範囲の適用

### 5.8 estimate-creation

- 見積書出力（Requirement 10、32、38）の出力記録
- 閲覧範囲の適用

### 5.9 itemized-statement-generation

- Excel 出力（Requirement 13）の出力記録
- 閲覧範囲の適用

### 5.10 construction-schedule

- Excel・PDF 出力（Requirement 7、8）の出力記録
- 閲覧範囲の適用

### 5.11 contract-management

- 入れ子のルート（`/projects/:projectId/contracts/:id` など）で、リソースが親 ID に属するかを照合する
- 閲覧範囲の適用

### 5.12 trading-partner-management

- 取引先削除時の監査ログ `before` に個人情報（住所・電話・FAX・メール・代表者名・備考）を残さない
- 論理削除した取引先の保持期間・完全削除

### 5.13 company-info

- 一般ロールの既定権限から `company_info:update` を外す（振込先などの改ざん防止）

### 5.14 要求の本文の配列の件数と文字列の長さの上限（横断。OWASP API Security の API4）

2026-10-31 の機能検証で、要求の本文の配列と文字列に上限を持たず、本文の大きさ（`express.json` の 5MB）だけで抑えている経路が見つかった。一つの要求でサーバーの処理時間・メモリ・データベースの負荷を大きく消費させうる（OWASP API Security Top 10 の API4 Unrestricted Resource Consumption）。利用者の判断（2026-10-31）で、見積（estimate-creation）と数量表（quantity-table-generation）だけを起票・実装し、他の経路は次の候補として記録だけする。

| 経路 | 所管 spec | 状況 |
|---|---|---|
| 数量表の保存の本文の配列の件数（グループ 1000・一つのグループの項目 2000・項目の総数 5000） | quantity-table-generation | 完了（受入基準42.11。タスク108.1 `76c2916f`） |
| 数量表の保存の件数の上限を超えたときの画面の表示 | quantity-table-generation | 完了（受入基準42.12。タスク109.1 `f126a974`） |
| 数量表の保存の本文の仮 ID（1〜100 字）・計算用パラメータのキーの数（10）とキーの長さ（50 字）・備考（50 字） | quantity-table-generation | 完了（受入基準42.13。タスク110.1 `b34b3169`） |
| 数量グループ・数量項目の表示順の更新の `orderUpdates`（1000・2000）と一括コピー・一括移動の `itemIds`（500。起票時の 2000 は一括コピーが既定の制限時間 5 秒を超えたため 2026-10-31 に利用者の決定で 1000 へ改訂。さらに 1000 件の一括コピーの最悪 5034 ms が制限時間に近いため 2026-11-01 に利用者の決定で 500 へ改訂） | quantity-table-generation | 完了（受入基準42.14。タスク110.2 `78b84feb`、タスク111.1 `95da1c41`） |
| 見積明細の一括保存の見積項目の総数（2000）を検証の前に数えて打ち切る（深い入れ子のスタックあふれも抑える。着手時の計測を受け、2026-10-31 に利用者の決定で階層の深さにも 100 段の上限を設けた） | estimate-creation | 完了（受入基準42.10・42.12。タスク67.1 `949f57ee`） |
| 見積明細の一括保存の見積項目行の備考（2000 字） | estimate-creation | 完了（受入基準42.11。タスク67.2 `7457a405`） |

**次の候補（未起票）**: 次の経路の本文の配列（と一部の文字列）は件数・長さの上限を持たない（2026-10-31 にスキーマを読んで確かめた）。値の根拠（画面の制限・既存の定数・実データの規模）を集めてから、所管の spec へ起票する。

| 経路の本文 | 所在（ファイルとスキーマ） | 所管 spec | 備考 |
|---|---|---|---|
| 内訳書の項目の並び順の `items` | backend/src/schemas/itemized-statement.schema.ts の `updateItemOrderBodySchema` | itemized-statement-generation | |
| 見積依頼の項目の選択の `items` | backend/src/schemas/estimate-request.schema.ts の `updateItemSelectionSchema` | estimate-request | |
| 発注の項目の `itemIds`、出来高の保存の `items` | backend/src/schemas/execution-budget.schema.ts の `updateOrderItemsSchema`・`saveProgressSchema` | execution-budget-management | |
| 現場調査の写真の並び順の `orders`、メタデータの一括更新の `updates` | backend/src/routes/survey-images.routes.ts の `imageOrderBodySchema`・`batchImageMetadataUpdateBodySchema` | site-survey | |
| 施工写真のメタデータの一括更新の `items`、並び順の `orders` | backend/src/schemas/construction-photo.schema.ts の `updatePhotoMetadataBatchSchema`・`updatePhotoOrderSchema` | construction-photo | 実測が無く値を決めかねている |
| 注釈の `objects`・`viewportTransform` | backend/src/schemas/annotation.schema.ts の `annotationDataSchema` | site-survey | 実測が無く値を決めかねている（一枚の写真の注釈の図形の数の実データが無い） |
| 受領見積書の明細の `lineItems` と各文字列（名称・規格・単位・備考など） | backend/src/schemas/received-quotation.schema.ts の `lineItemsArraySchema`・`lineItemSchema` | estimate-request | 実測が無く値を決めかねている。明細の備考は上限を持たず、見積明細へ転記すると estimate-creation の受入基準42.11（備考 2000 字）を超えて見積書を保存できなくなりうる（estimate-creation の design.md の同章の Out of Boundary） |
| ロールの権限の追加の `permissionIds`、ユーザーのロールの追加の `roleIds` | backend/src/routes/roles.routes.ts の `addPermissionSchema`、backend/src/routes/user-roles.routes.ts の `addRolesSchema` | user-authentication | |
| 数量項目の作成・更新の `calculationParams`・`remarks`（保存の経路の受入基準42.13 と同じ上限を広げるか） | backend/src/routes/quantity-items.routes.ts | quantity-table-generation | 受入基準42.13 は保存の経路だけを変える |
| 数量項目の一括コピー・一括移動の書き込みをまとめて所要を縮める（上限ちょうどの 1000 件の一括コピーが最悪約 5 秒で、既定の制限時間 5 秒に迫る。2026-10-31 の実測。2026-11-01 に上限を 500 へ下げ、500 件は最悪 2801 ms〔平常時〕） | backend/src/services/quantity-item.service.ts の `bulkCopy`・`bulkMove` | quantity-table-generation | 件数の上限ではなく所要の改善。今は 1 件ごとに並び順の問い合わせ・作成・監査記録を行う。画面はこの 2 経路を呼ばない |

## 6. 新規 spec を起票しない理由

どの既存 spec の要件・設計にも記載がない項目は、依存・CI・イメージ・シークレット・運用基盤の設定変更である。次の理由で spec にせず、直接実装（Path B）・運用作業・文書化として扱う。

1. spec は利用者から見える振る舞いを要件→設計→タスクで固める仕組みであり、`/kiro-discovery` も設定変更・単純なリファクタを spec 不要の区分（Path B）としている
2. 要件被覆の関門（`check:req-coverage`）は、受入基準ごとに `backend/src`・`frontend/src`・`e2e` から本番の入口へ辿れる被覆印を求める。変更先の `.github/`・Dockerfile・compose・`.gitignore` には印を付けられず、受入基準のほぼ全件が除外登録となって検証が名目化し、除外台帳と freshness の宣言（新規 spec 1 本で `design-documents-scanned` も動く）を膨らませる
3. 依存・CI の設定は PR 単位で変更して CI で検証し、鍵のローテーションや外部コンソールの点検は運用手順で管理するのが一般的である

当初は新規 spec 4 本（platform-hardening・supply-chain-security・security-monitoring・data-retention）を提案した。既存 spec の要件・設計と突き合わせた結果、大半は既存の所管（user-authentication 要件21.1・22・26.10・26.11、design の保持戦略、site-survey 16.7、各業務 spec の削除仕様）に属していたため撤回した。

## 7. 運用作業（コード外。最初に実施）

- [ ] **O1 ログの調査**（直近 1 か月から範囲を広げる）: Railway のログで `/admin/log-level` へのアクセス、`email` 指定の `/verify-2fa` 呼び出し、401・429・5xx の急増を確認する。異常があればインシデントとして扱い、専門ベンダーへの調査依頼を検討する
- [ ] **O2 アプリ内アカウントの棚卸し**: 見覚えのないユーザー、admin・`*:*` を持つロール、未使用の招待を確認する
- [ ] **O3 外部コンソールの棚卸し**: Railway・Cloudflare（R2）・Anthropic・Sentry・SMTP 事業者・GitHub のメンバーと API トークンを棚卸しし、MFA が有効かを確認する
- [ ] **O4 Railway**: `RAILWAY_PRODUCTION_TOKEN`・`RAILWAY_STAGING_TOKEN` をローテーションし、GitHub の `production`・`staging` 環境シークレットへ移して保護ルール（必須レビュアー、デプロイブランチ制限）を設定する。Postgres・Redis の TCP Proxy が無効であることを確認する。user-authentication の配備（API を frontend の nginx 経由に一本化）の後に、backend の公開ドメインを閉じる（送信元 IP の識別の段数を一通りにするため）。user-authentication の統合（develop へのマージ）より前に、Railway の backend（本番・staging）へ信頼する中継の段数 `TRUST_PROXY_HOPS` を設定する（「Railway のエッジ → frontend の nginx → backend」の構成で `3`。Railway のエッジは X-Forwarded-For に利用者の IP とエッジ自身の IP（`152.233.33.x` など）の 2 段を足し、frontend の nginx が 1 段を足す。2026-11-07 に staging で実測し、`2` では監査ログの送信元がエッジの IP に揃った。未設定では段数 0 として扱い、全利用者の送信元が手前の中継の IP に揃って回数制限を共有する。`true` は起動時の検証で拒否される）。配備後に staging で `req.ip`（監査ログの送信元）が自分の公開 IP と一致することを実測で確かめ、違えば段数を直す。同じく統合より前に、Railway の backend（本番・staging）へ監査ログのアーカイブの暗号鍵 `ARCHIVE_ENCRYPTION_KEY`（64 桁の 16 進。`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` で本番・staging で別々に作り、試験・CI の compose の固定値を使わない）を設定する（本番の実行環境では `ARCHIVE_ENCRYPTION_KEY`・`TRUST_PROXY_HOPS`・`REDIS_URL` のいずれが欠けても backend は起動を止め、新しいデプロイが `SUCCESS` にならずデプロイのジョブが止まる）。D9（2026-11-07）以降、デプロイのジョブの環境変数の検査（ci.yml の `check:env`）はダミーの値で形だけを確かめるため、GitHub secrets の `STAGING_`・`PRODUCTION_` の `ARCHIVE_ENCRYPTION_KEY`・`TRUST_PROXY_HOPS`（と `DATABASE_URL`・`REDIS_URL`・`JWT_PUBLIC_KEY`・`JWT_PRIVATE_KEY`・`TWO_FACTOR_ENCRYPTION_KEY`、`SENTRY_DSN`）は不要になった。登録済みなら削除する。トークンの発行者 `JWT_ISSUER`・想定利用者 `JWT_AUDIENCE` は既定値（`architrack`・`architrack-api`）があり必須ではない。同じく統合より前に、Railway の frontend（本番・staging）へ API の中継先 `BACKEND_INTERNAL_URL`（backend のプライベートネットワークの URL を `http://<backend のサービス名>.railway.internal:<backend の PORT>` の形の scheme://host[:port] で。パスを付けない）を設定し、画面の API の接続先 `VITE_API_URL` を画面と同じオリジンの完全な URL（frontend の公開 URL。例: `https://<frontend のドメイン>`）へ改める（`VITE_API_URL` はビルドのときに画面へ埋め込まれるため、改めた後に frontend をビルドし直して配備する）。`BACKEND_INTERNAL_URL` が未設定か形が違うと、staging・本番の frontend のコンテナは起動前の検査で止まり画面が配信されない。`VITE_API_URL` を改めないと画面は backend の公開ドメインへ直接つなぎ続け、公開ドメインを閉じた時点で API が届かなくなる。backend は `::`（IPv4・IPv6 のデュアルスタック）で待ち受けるため、Railway のプライベートネットワークが IPv6 だけの環境（`*.railway.internal` が AAAA だけを返す）でも中継先へ届く。統合の前に、staging で frontend の公開ドメイン経由の `/csrf-token` が 200（JSON）になることを確かめる（502 なら中継先へ届いていない）。同じく統合より前に、Railway の frontend（本番・staging）へ画面の配信のセキュリティヘッダー（user-authentication 要件44）の環境ごとの値を設定する: CSP の画像の追加の取得先 `CSP_IMG_SRC_EXTRA` に R2 の署名 URL の配信元（画像の URL のオリジン。backend の S3 クライアントは仮想ホストの形で署名するため `https://<バケット名>.<アカウント ID>.r2.cloudflarestorage.com` の形になる。`R2_PUBLIC_URL` を設定している環境はそのオリジンも加える。staging の画面で画像の URL を開いてオリジンを確かめる）を、CSP の接続の追加の取得先 `CSP_CONNECT_SRC_EXTRA` に同じ R2 の配信元と Sentry の取り込み先（`VITE_SENTRY_DSN` のホストのオリジン。例: `https://o<組織 ID>.ingest.sentry.io`）を空白区切りで設定し、本番だけ `NGINX_HSTS_VALUE` に `max-age=31536000; includeSubDomains` を設定する（空の環境では HSTS は付かない）。未設定では CSP が画面と同じオリジンと既定の外部サービス（jsDelivr・tessdata・Google Fonts）以外を拒むため、R2 の画像の表示・取得と Sentry への送信がブラウザで止まり、本番に HSTS が付かない。配備の後に staging の画面で画像の表示・編集を行い、ブラウザのコンソールに CSP の違反が出ないことを確かめる
- [ ] **O5 R2・Anthropic**: R2 トークンが対象バケット限定の Object Read & Write か確認する。本番の Anthropic キーに使用量上限を設定する
- [ ] **O6 本番の初期管理者パスワード**: compose に直書きされたテスト用の値と異なることを確認する。seed 後は `INITIAL_ADMIN_PASSWORD` を Railway から削除する

## 8. 直接実装（Path B）

- [x] **D1** backend の `xlsx` を CDN 版 0.20.3 へ更新し、許容エントリを削除する（期限 2026-10-31）。使われなくなった react-router の許容エントリも削除する（2026-11-07 に実施。それまでは完了の印だけが付き、backend は 0.18.5 のまま、許容エントリは xlsx が期限を 2027-01-31 へ延ばされ、react-router・react-router-dom が期限切れのまま残っていた）
- [x] **D2** 本番依存の moderate で修正版があるもの（`qs`・`ip-address`・`fflate`・`uuid`）を更新し、moderate の扱い（ブロックまたは期限付き追跡）を `scripts/security-audit.mjs` で決める（2026-11-07。qs・ip-address・fflate は解消済みだった。uuid・glob・minimatch を overrides で上げ、本番依存は moderate 以上でブロック、許容は有効期限付きに限る）
- [x] **D3** `.github/dependabot.yml`: docker の対象に `/backend`・`/frontend` を加え、`cooldown` を設定する（2026-11-07）
- [x] **D4** `dependabot-automerge.yml`: 自動マージを devDependencies と patch に限定し、判定を `github.event.pull_request.user.login` に変える（2026-11-07。開発依存のマイナー・パッチとパッチ更新に限る）
- [x] **D5** Actions をフル SHA で固定し、`ci.yml` のトップレベルに `permissions: contents: read` を宣言する（2026-11-07）
- [x] **D6** ベースイメージ（`node:22-alpine`・`nginx:alpine`・`willfarrell/autoheal`・`axllent/mailpit`）を版と digest で固定し、`@railway/cli` と本番ステージの `tsx` を版固定する（2026-11-07。autoheal は版のタグが更新されていないため latest を digest で固定）
- [x] **D7** 毎日の定期監査ジョブを追加し、gitleaks・CodeQL・trivy を導入する（2026-11-07。`.github/workflows/security-scheduled.yml`・`.gitleaks.toml`。schedule は既定のブランチ main へ入ってから動く）
- [x] **D8** `.gitignore` に `.env.keys`・`*.pem`・`*.key`・`.env.production`（`*.example` を除く）を加える（2026-11-07）
- [x] **D9** `ci.yml`: `check:env` のための本物のシークレット複製を廃止する（ダミー値で形式だけを検証する）。シークレットは `env:` 経由で渡し、echo しない（2026-11-07。使わなくなった GitHub secrets の削除は利用者の作業）
- [x] **D10** 開発・テスト用 compose のポートを `127.0.0.1:` にバインドする（Node デバッガ 9229 を含む）（2026-11-07）
- [x] ~~**D11** `NODE_ENV` の既定値を `production` にする~~ → user-authentication 要件42.9 へ移した（2026-10-16。開発用の機能を実行環境の指定が無いときに無効にする振る舞いとして要件化）
- [x] **D12** 未使用の `@aws-sdk/client-sesv2` を削除する。`backend/scripts/check-env.ts` が秘密値の一部と接続 URL を表示しないようにする。文書の 2FA 鍵の例を検証を通らない表記にし、`.env.example` の説明（Base64）を実装（64 桁 hex）に合わせる（2026-11-07）
- [x] **D13** ログイン後の遷移先の検証（`validateRedirectUrl`）が `/\` で始まる値を通す開放リダイレクトの是正と、`ProtectedRoute` の `state.from` の検証（user-authentication の設計の調査で発見。要件32〜45 の範囲外）（2026-11-07。`frontend/src/utils/safe-redirect.ts`）
- [x] **D14** tesseract.js の worker・言語データを自前で配信し、CSP の `cdn.jsdelivr.net`・`tessdata.projectnaptha.com` の許可を外す（user-authentication 要件44 の設計では許可で対応）（2026-11-07。user-authentication の design.md に改訂の記録）

## 9. 文書化

- [x] **W1** 本番のデプロイ経路と本番変数の所在（`deploy-production` ジョブが参照するシークレットは未登録）（2026-11-07。[データ保護と運用の前提](../deployment/data-protection.md)。利用者が決める項目は同書の各節）
- [x] **W2** DB バックアップの頻度・保持期間・暗号化と、復元訓練の手順（同上）
- [x] **W3** アプリログの転送先と保持期間（Railway のログ保持に依存しない）（同上。現状と判断の材料を記した。セキュリティの記録は Railway に依存しない監査ログを正とする。アプリログの転送の要否は利用者の判断が残る）
- [x] **W4** R2 の保存時暗号化、Railway のプライベートネットワーク経由の DB 接続（または `sslmode=require`）の前提（同上）

## 10. 監査の根拠

- 監査は 2026-10-15 に読み取りのみで実施した（3観点を並行調査し、最重要の欠陥はソースで再確認した）
- `npm audit --omit=dev`（2026-10-15）: backend は high 1・moderate 5・low 1、frontend は low 1
- 行番号は実装の進行で動くため本書には書かない。各項目の所在は、ファイル名とシンボル名で該当 spec の要件定義の際に測り直す
