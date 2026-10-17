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

| 区分 | 項目 | 深刻度 | 関係する既存要件 |
|---|---|---|---|
| 認証 | 2FA 検証がメールアドレスだけで通る（`/verify-2fa`・`/verify-2fa/backup`）。パスワード認証成功時にだけ発行する短命・1回限りの「2FA 待ち」トークンに限定する | 高 | 要件4、27A |
| 認証 | アクセストークンとリフレッシュトークンを区別していない（クレーム同一、`verifyToken` が `type` を検証しない）。`typ`・`aud`・`iss` を付けて検証する | 高 | 要件5 |
| 認証 | リフレッシュトークンを localStorage と応答本文で扱っている。HttpOnly cookie のみに限定し、アクセストークンはメモリ保持にする。cookie 化に合わせて CSRF を適用する | 高 | 要件5、26.3、26.5、26.7 |
| 認証 | `trust proxy: true` と X-Forwarded-For 先頭値をキーにしたレート制限で、回数制限と監査ログの IP を偽装できる | 高 | 要件26.4、26.12 |
| 認証 | `/verify-2fa`・`/verify-2fa/backup`・パスワードリセット要求/実行・登録に専用の回数制限を付ける。`DISABLE_RATE_LIMIT` を本番で無効にする | 中 | 要件26.4、26.12 |
| 認証 | 2FA を全ユーザー必須にする（未登録者は登録へ誘導） | 高 | 要件27 系（新規要件） |
| 認証 | TOTP の再利用防止、2FA 無効化に TOTP を要求する | 中 | 要件27B、27C |
| 認証 | リフレッシュトークンの再利用検知（系列ごとの失効） | 中 | 要件5 |
| 認証 | パスワードリセットトークンの有効期限を 24 時間から 1 時間へ（定数の二重定義を解消） | 中 | 要件7 |
| 認証 | login 応答の `userId` と DB エラーの詳細を返さない | 低 | 要件10 |
| トークン保存 | リフレッシュ・パスワードリセット・招待の各トークンをハッシュ化して保存する。使用済み・期限切れを定期削除する | 中 | 要件5、7、1 |
| 公開範囲 | `/admin/log-level` が認証なしで本番公開されている。撤去または認証・権限チェックを付ける | 高 | 要件21.1 |
| 公開範囲 | frontend（nginx）に CSP・HSTS・Referrer-Policy・`server_tokens off` を付け、各 location へ継承させる | 中 | 要件26.10 |
| アカウント | ユーザーの無効化機能（ログイン・リフレッシュ・認証で拒否、全セッション失効、監査記録、管理者への通知） | 高 | 要件9（新規要件） |
| アカウント | `lastLoginAt` の記録、棚卸し画面（最終ログイン・2FA 状態・ロール・招待者）、長期未使用アカウントの自動無効化 | 高 | 要件9（新規要件） |
| アカウント | 招待 API が token を返さない、検証を POST 本文で受ける、管理者なら誰でも招待を取り消せる | 中 | 要件1、2 |
| アカウント | seed の初期管理者パスワードに強度検証と初回変更の強制を適用する | 中 | 要件3 |
| RBAC | 自分より強いロール・`*:*` を付与できないようにする | 中 | 要件17〜20 |
| RBAC | 一般ロールの既定から `user:read` を外す | 中 | 要件9、20 |
| RBAC | 案件単位の閲覧範囲を判定する共通の仕組み（各業務 spec が適用する） | 中〜高 | 要件21.6（所有者フィルタリング） |
| 監査 | ログイン成功・失敗・ロック、2FA 成功・失敗、ログアウト、リフレッシュを記録する | 高 | 要件22（型だけ定義され未記録） |
| 監査 | ユーザー削除で監査ログが連鎖削除される（`AuditLog.actor` の `onDelete: Cascade`）。撤廃し、`USER_DELETED` を削除前に記録する | 高 | 要件22、design「保持期間・ローテーション戦略」の不変性 |
| 監査 | 招待の作成・取消、招待経由の登録を記録する | 中 | 要件22 |
| 監査 | 業務データの出力・一括ダウンロードを記録する API（各業務 spec が呼ぶ） | 中 | 要件22（新規要件） |
| 監査 | アーカイブを定期ジョブとして配線し、暗号鍵を本番必須にする（未設定時のランダム鍵生成を廃止） | 中 | design「保持期間・ローテーション戦略」（月次・13か月・8年） |
| 監査 | 認証失敗・権限拒否・429・5xx の急増アラート | 中 | 要件22.8、22.9 の拡張 |
| ログ | URL クエリのトークン伏せ字、Sentry へ `req.body` を送らない・`beforeSend` での伏せ字 | 中 | 要件26.11 |
| ログ | request-id をサーバーで生成する、アクセスログに userId を付ける | 低〜中 | 要件22.11 |
| メール | Bull に `REDIS_URL` を渡す、`removeOnComplete`・`removeOnFail` を設定する | 中 | 要件24（メール送信の切り離し） |

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
- [ ] **O4 Railway**: `RAILWAY_PRODUCTION_TOKEN`・`RAILWAY_STAGING_TOKEN` をローテーションし、GitHub の `production`・`staging` 環境シークレットへ移して保護ルール（必須レビュアー、デプロイブランチ制限）を設定する。Postgres・Redis の TCP Proxy が無効であることを確認する。user-authentication の配備（API を frontend の nginx 経由に一本化）の後に、backend の公開ドメインを閉じる（送信元 IP の識別の段数を一通りにするため）。user-authentication の統合（develop へのマージ）より前に、Railway の backend（本番・staging）へ信頼する中継の段数 `TRUST_PROXY_HOPS` を設定する（「Railway のエッジ → frontend の nginx → backend」の構成で `2` を想定。未設定では段数 0 として扱い、全利用者の送信元が手前の中継の IP に揃って回数制限を共有する。`true` は起動時の検証で拒否される）。配備後に staging で `req.ip`（監査ログの送信元）が自分の公開 IP と一致することを実測で確かめ、違えば段数を直す
- [ ] **O5 R2・Anthropic**: R2 トークンが対象バケット限定の Object Read & Write か確認する。本番の Anthropic キーに使用量上限を設定する
- [ ] **O6 本番の初期管理者パスワード**: compose に直書きされたテスト用の値と異なることを確認する。seed 後は `INITIAL_ADMIN_PASSWORD` を Railway から削除する

## 8. 直接実装（Path B）

- [x] **D1** backend の `xlsx` を CDN 版 0.20.3 へ更新し、許容エントリを削除する（期限 2026-10-31）。使われなくなった react-router の許容エントリも削除する
- [ ] **D2** 本番依存の moderate で修正版があるもの（`qs`・`ip-address`・`fflate`・`uuid`）を更新し、moderate の扱い（ブロックまたは期限付き追跡）を `scripts/security-audit.mjs` で決める
- [ ] **D3** `.github/dependabot.yml`: docker の対象に `/backend`・`/frontend` を加え、`cooldown` を設定する
- [ ] **D4** `dependabot-automerge.yml`: 自動マージを devDependencies と patch に限定し、判定を `github.event.pull_request.user.login` に変える
- [ ] **D5** Actions をフル SHA で固定し、`ci.yml` のトップレベルに `permissions: contents: read` を宣言する
- [ ] **D6** ベースイメージ（`node:22-alpine`・`nginx:alpine`・`willfarrell/autoheal`・`axllent/mailpit`）を版と digest で固定し、`@railway/cli` と本番ステージの `tsx` を版固定する
- [ ] **D7** 毎日の定期監査ジョブを追加し、gitleaks・CodeQL・trivy を導入する
- [ ] **D8** `.gitignore` に `.env.keys`・`*.pem`・`*.key`・`.env.production`（`*.example` を除く）を加える
- [ ] **D9** `ci.yml`: `check:env` のための本物のシークレット複製を廃止する（ダミー値で形式だけを検証する）。シークレットは `env:` 経由で渡し、echo しない
- [ ] **D10** 開発・テスト用 compose のポートを `127.0.0.1:` にバインドする（Node デバッガ 9229 を含む）
- [x] ~~**D11** `NODE_ENV` の既定値を `production` にする~~ → user-authentication 要件42.9 へ移した（2026-10-16。開発用の機能を実行環境の指定が無いときに無効にする振る舞いとして要件化）
- [ ] **D12** 未使用の `@aws-sdk/client-sesv2` を削除する。`backend/scripts/check-env.ts` が秘密値の一部と接続 URL を表示しないようにする。文書の 2FA 鍵の例を検証を通らない表記にし、`.env.example` の説明（Base64）を実装（64 桁 hex）に合わせる
- [ ] **D13** ログイン後の遷移先の検証（`validateRedirectUrl`）が `/\` で始まる値を通す開放リダイレクトの是正と、`ProtectedRoute` の `state.from` の検証（user-authentication の設計の調査で発見。要件32〜45 の範囲外）
- [ ] **D14** tesseract.js の worker・言語データを自前で配信し、CSP の `cdn.jsdelivr.net`・`tessdata.projectnaptha.com` の許可を外す（user-authentication 要件44 の設計では許可で対応）

## 9. 文書化

- [ ] **W1** 本番のデプロイ経路と本番変数の所在（`deploy-production` ジョブが参照するシークレットは未登録）
- [ ] **W2** DB バックアップの頻度・保持期間・暗号化と、復元訓練の手順
- [ ] **W3** アプリログの転送先と保持期間（Railway のログ保持に依存しない）
- [ ] **W4** R2 の保存時暗号化、Railway のプライベートネットワーク経由の DB 接続（または `sslmode=require`）の前提

## 10. 監査の根拠

- 監査は 2026-10-15 に読み取りのみで実施した（3観点を並行調査し、最重要の欠陥はソースで再確認した）
- `npm audit --omit=dev`（2026-10-15）: backend は high 1・moderate 5・low 1、frontend は low 1
- 行番号は実装の進行で動くため本書には書かない。各項目の所在は、ファイル名とシンボル名で該当 spec の要件定義の際に測り直す
