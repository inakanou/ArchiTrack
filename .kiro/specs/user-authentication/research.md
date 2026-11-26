# Research & Design Decisions: user-authentication（要件32〜45 セキュリティ是正）

---
**Purpose**: 要件32〜45（IPA注意喚起 2026-10-09 に基づくセキュリティ是正、2026-10-16 追加）の設計に先立つ調査と判断の記録。
**対象**: `design.md` の「## Requirements 32-45: セキュリティ是正（IPA注意喚起 2026-10-09）」の章。
**注記**: 要件1〜31 の設計の調査記録は作成されていない（既存の `design.md` が判断を直接持つ）。本書は要件32〜45 に限る。
---

## Summary
- **Feature**: `user-authentication`
- **Discovery Scope**: Extension（既存の認証基盤への是正。ただしセキュリティに関わるため、軽量の調査を基本としつつ外部の前提（中継装置・Cookie・CSP）は個別に確かめた）
- **Key Findings**:
  1. 欠陥の多くは「状態を持たない検証」に起因する。2FA 検証はパスワード成功の証跡を持たず、アクセストークンは種別・発行者・利用者を持たず、認証ミドルウェアは利用者の状態（無効化・2FA 未登録）を参照しない。是正は「サーバー側で状態を持ち、要求ごとに照合する」形に揃える。
  2. 定期処理の基盤が存在しない（node-cron・Bull の繰り返しジョブ・setInterval のいずれも無い）。アーカイブ・自動無効化・トークンの掃除は同じ実行基盤を要するため、既存の Bull（メールキュー）の繰り返しジョブで一つの実行基盤を設ける。
  3. 画面と API の配信元が別ドメイン（Railway の `*.up.railway.app` は Public Suffix List に載る）である場合、`SameSite=Strict` の Cookie はブラウザから API へ送られず、要件33.8・33.11（HttpOnly Cookie によるリフレッシュと再読み込み時の復元）が成立しない。画面の配信元（nginx）で API を同一オリジンへ中継する構成を採る。

## Research Log

### 既存の認証・認可の実装（コード調査）
- **Context**: 要件32〜45 の各欠陥の所在と、変更の差し込み点を特定する。
- **Sources Consulted**: `backend/src`（routes・services・middleware・config・utils）、`backend/prisma/schema.prisma`、`frontend/src`（contexts・api・services・pages・components）、`frontend/nginx.conf`、`frontend/Dockerfile`、`playwright.config.ts`、`e2e/helpers`。読み取りのみ。
- **Findings**:
  - ログインは 2FA 有効時に `{ requires2FA: true, userId }` を返し、`/verify-2fa` はメールアドレスと TOTP だけで受理する。`tempToken` 経路も `verifyToken(tempToken, 'access')` が種別を見ないため任意の JWT で通る。
  - `TokenService` の発行物はアクセスとリフレッシュで同一のクレーム（`userId, email, roles, jti`）で、`verifyToken` は第2引数の種別を無視する。`authenticate` は Bearer の JWT だけを見て DB を参照しない。
  - リフレッシュトークンは `refresh_tokens.token` に JWT の原文で保存され、ローテーションに再利用検知も系列も無い。`/refresh`・`/logout` は本文の値を読み、Cookie は実質未使用である。応答本文にもリフレッシュトークンを含む。
  - フロントは `accessToken`・`refreshToken` の両方を localStorage に置く。`ExportDialog`（工程表の出力）と `UserSelect` が localStorage を直接読む。BroadcastChannel でアクセストークンをタブ間に配る。
  - CSRF の二重送信の検査（`csrfProtection`）はどのルートにも適用されておらず、`NODE_ENV=test` で素通りする。CORS の許可ヘッダーに `X-CSRF-Token` が無い。
  - TOTP の再利用防止が無い（otplib の `window: 1`）。`NODE_ENV !== 'production'` のとき `123456`・`ABCD1234` を受理する開発用の抜け道があり、`NODE_ENV` 未設定でも有効になる（スキーマの既定値は `process.env` へ書き戻されない）。
  - `app.set('trust proxy', true)` と、`x-forwarded-for` の先頭値を読む `keyGenerator` により、回数制限の識別と監査ログの IP が偽装できる。Redis の障害時はストアが `totalHits: 1` を返し、制限が無効になる（コメントの「メモリへの退避」は実装されていない）。
  - `DISABLE_RATE_LIMIT==='true'` に本番の歯止めが無い。2FA 検証・リセット要求・リセット実行・登録・招待の検証に専用の制限が無い。
  - 招待・リセットのトークンは原文で保存され、招待一覧の応答が全招待者分のトークンを返す。取り消しは作成者本人に限る。検証は `?token=` のクエリで、pino-http のシリアライザが URL を丸ごと記録する。
  - リセットの有効期限は `password.service.ts` の `RESET_TOKEN_EXPIRY` が 24 時間で、`SESSION_CONFIG.PASSWORD_RESET_TOKEN_EXPIRY_MS`（1 時間）は未使用の二重定義である。
  - 初期管理者の seed は `validatePasswordStrength` を通さず、初回変更を強制する仕組みが無い。
  - `User` に有効・無効、最終ログイン日時の列が無い。ロールは `admin`（priority 100）と `user`（priority 0）。`user` の既定権限に `user:read` があり、`GET /api/v1/users` を一般ユーザーが呼べる。ロール割り当て・権限追加に上限の検査が無い。
  - 案件の関係者を判定する処理は `SignedUrlService.validateProjectAccess` の一箇所だけで、全案件の判定をロール名 `admin` の直書きで行う。その他の業務 API は権限だけを見る。範囲外への応答は一部で 403 になっている。
  - `AuditLog.actor` は `onDelete: Cascade`。ログイン・ログアウト・招待の監査は型だけが定義され、書き込まれていない。`AuditLogArchiveService` はどこからも呼ばれず、鍵が未設定だと毎回乱数の鍵を作り、保存先はローカルのファイルである（Railway のコンテナでは永続しない）。
  - メールキュー（Bull v4）は `REDIS_HOST`/`REDIS_PORT` で接続し、アプリのキャッシュ（`REDIS_URL`）と接続情報が異なる。`removeOnComplete`/`removeOnFail` が無く、トークンを含むジョブが残る。
  - `/admin/log-level` は `/api` の外にあり認証も回数制限も無い。要求識別子は受信した `x-request-id` を採用する。Sentry へ要求本文を送り、`beforeSend` に伏せ字が無い。ログインの DB 障害時に `detail: error.message` を返す。
  - nginx は CSP・HSTS・Referrer-Policy が無く `server_tokens` が既定（版を表示）。静的ファイルの `location` が独自の `add_header` を持つため、サーバー階層のヘッダーが継承されない。
  - E2E は `workers: 1`・`fullyParallel: false` で直列に走る。
- **Implications**: 下記の設計判断に反映した。開放リダイレクト（`/\evil.com` の形を `validateRedirectUrl` が通す）は要件32〜45 の範囲外の発見であり、本設計では扱わず是正計画（`docs/security/ipa-alert-20261009-remediation-plan.md`）への追記で扱う。

### 中継装置の背後での送信元IPの識別
- **Context**: 要件35.1・35.2。`trust proxy: true` の是正方法。
- **Sources Consulted**:
  - [Express behind proxies](https://expressjs.com/en/guide/behind-proxies) — 数値は「アプリから数えた中継の段数」。右から数え、経路の長さが異なる入口があると偽装されうると警告している。
  - [express-rate-limit: Troubleshooting Proxy Issues](https://github.com/express-rate-limit/express-rate-limit/wiki/Troubleshooting-Proxy-Issues) — `true` は `ERR_ERL_PERMISSIVE_TRUST_PROXY` の対象。段数を 1 から増やし、`req.ip` が自分の公開 IP になるまで実測で決める。
  - Railway の公開フォーラム（[client-IP / proxy trust contract](https://station.railway.com/questions/need-authoritative-client-ip-proxy-tru-090eac86)、[Edge Proxy X-Forwarded-For and X-Real-Ip can't be trusted](https://station.railway.com/questions/edge-proxy-x-forwarded-for-and-x-real-ip-c5a50049)）— エッジがヘッダーを上書きするかについて職員の回答が食い違い、公式の文書は無い。
- **Findings**: 段数は配備の構成（エッジ → nginx → backend）で決まり、文書から確定できない。backend が公開ドメインも持つと、経路の長さが二通りになり偽装の余地が残る。
- **Implications**: 段数を設定値（`TRUST_PROXY_HOPS`）とし、本番では必須、`true` を禁止する。配備時に識別の確認手順（`req.ip` の実測）を踏む。API を nginx 経由に一本化し、backend の公開ドメインは閉じる（運用作業として計画書 O4 に追記する）。

### クロスサイトの Cookie と画面・API の配置
- **Context**: 要件33.8・33.11・33.12。
- **Sources Consulted**: [Public Suffix List](https://publicsuffix.org/list/)（`up.railway.app` を含む）、[MDN: SameSite cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#samesitesamesite-value)、各ブラウザのサードパーティ Cookie の制限。
- **Findings**: 画面と API が別サイトのとき、`SameSite=Strict`/`Lax` の Cookie は `fetch` に付かない。`SameSite=None` はサードパーティ Cookie の制限（Safari の ITP 等）で落ちうる。
- **Implications**: nginx が `/api/` と `/csrf-token` を backend へ中継し、ブラウザから見て同一オリジンにする。Cookie は `SameSite=Strict`・`HttpOnly`・`Secure`・`Path=/api/v1/auth` とする。

### リフレッシュトークンの再利用検知とタブ間の競合
- **Context**: 要件33.6。ローテーション済みのトークンの再提示で系列全体を失効させると、複数タブが同時にリフレッシュしたときに正規の利用者が締め出される。
- **Sources Consulted**: [OAuth 2.0 Security Best Current Practice（RFC 9700）§4.14 Refresh Token Protection](https://www.rfc-editor.org/rfc/rfc9700)、[MDN: Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)。
- **Findings**: RFC 9700 は送信者拘束が無い場合のローテーションと再利用検知を推奨する。猶予期間を設ける製品もあるが、要件33.6 は猶予を認めていない。同一ブラウザのタブ間は Web Locks で直列化でき、直列化すれば後続のタブは更新済みの Cookie を送る。
- **Implications**: 猶予期間は設けない。フロントは `navigator.locks.request('architrack-auth-refresh', …)` でリフレッシュを直列化し、BroadcastChannel で結果を配る。
- **Revision (2026-11-14)**: Web Locks はページの内側の直列化であり、ページの移動でブラウザが切ったリフレッシュの応答（サーバーは置き換えを終えている）は取り戻せず、次のページが置き換え前の Cookie を送って系列ごと失効していた。要件33.6 を改め 33.13 を加え、置き換えから 10 秒以内で後継が未使用の再提示に限り猶予を設けた（Okta の grace period、Auth0 の reuse interval、Supabase の `refresh_token_reuse_interval`〔既定 10 秒〕と同じ考え方）。後継が使われた後の再提示は従来どおり失効させる。

### TOTP の再利用防止
- **Context**: 要件32.7。
- **Sources Consulted**: [RFC 6238 §5.2](https://www.rfc-editor.org/rfc/rfc6238#section-5.2)（検証者は一度成功した OTP を二度目以降に受理してはならない）、otplib の `authenticator.checkDelta`。
- **Findings**: 一致した時間ステップ（`floor(now/30) + delta`）を記録し、記録以下のステップを拒否すれば足りる。
- **Implications**: `users.two_factor_last_used_step` を設け、条件付き更新（記録が小さいときだけ書く）で同時要求にも一度だけ成功させる。

### メールキュー（Bull v4）の接続と後始末
- **Context**: 要件45。
- **Sources Consulted**: [Bull Reference（Queue constructor, JobOpts）](https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md)。
- **Findings**: `new Queue(name, redisUrl, opts)` で URL（認証情報を含む）を渡せる。`removeOnComplete: true` で完了時に消える。失敗時は `failed` イベントで最終試行かを判定し `job.remove()` で消せる。
- **Implications**: キャッシュと同じ `REDIS_URL` を使う。繰り返しジョブも同じ接続で動かす。

### 画面配信の CSP
- **Context**: 要件44。
- **Sources Consulted**: [MDN: Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy)、[nginx: add_header](https://nginx.org/en/docs/http/ngx_http_headers_module.html#add_header)（下位の階層が `add_header` を持つと上位の定義を継承しない。値が空のときヘッダーを付けない）、Sentry の CSP の案内、tesseract.js の既定の取得先。
- **Findings**: 実行時の読み込み元は、API（同一オリジン化の後は `'self'`）、Sentry の取り込み先、Google Fonts（`fonts.googleapis.com`・`fonts.gstatic.com`）、R2 の署名 URL、tesseract.js の既定の取得先（`cdn.jsdelivr.net`、`tessdata.projectnaptha.com`）、`blob:`・`data:`（Canvas の書き出し、QR、Sentry Replay のワーカー）である。React の `style` 属性が 139 ファイルにあり、`style-src 'unsafe-inline'` を外せない。
- **Implications**: 環境ごとに異なる取得先は nginx テンプレートの環境変数で渡す。`Referrer-Policy: no-referrer` とし、招待・リセットのリンクのトークンが外部の読み込み元へ漏れないようにする。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 認証ミドルウェアで利用者の状態を毎回照合（採用） | `authenticate` が JWT の検証後に利用者の状態（有効・2FA 登録・初回変更）を Redis のキャッシュ経由で読む | 無効化・2FA 未登録の拒否が即時に効く。RBAC の権限キャッシュと同じ型で実装できる | 要求ごとに Redis 1 回。Redis 障害時は DB へ退避 | 既存の `RBACService` のキャッシュと無効化の作法を流用する |
| アクセストークンに状態を載せる | 2FA 未登録などをクレームで表す | 照合が不要 | 無効化が有効期限まで効かない（要件36.1 を満たさない） | 不採用 |
| 2FA 待ちの資格を JWT で表す | 種別 `2fa_pending` の短命 JWT | 状態を持たない | 一回限り（要件32.4）を満たすにはサーバー側の記録が要る | 不採用。不透明な乱数を Redis に置く |

## Design Decisions

### Decision: 2FA 待ちの資格は不透明な乱数を Redis に一回限りで置く
- **Context**: 要件32.1〜32.6、42.7。
- **Alternatives Considered**:
  1. 短命の JWT（種別 `2fa_pending`）
  2. 不透明な乱数（32 バイト）を Redis に SHA-256 の鍵で置き、成功時に消す
- **Selected Approach**: 2。値は `{ userId, issuedAt }`、TTL は 300 秒。検証の成功時に `DEL` の戻り値が 1 のときだけトークンを発行する。
- **Rationale**: 一回限りと期限をサーバー側で保証でき、アクセス・リフレッシュの JWT と形が異なるため取り違えが起きない（要件32.5）。
- **Trade-offs**: Redis が使えないと 2FA ログインができない（503）。本番の Redis は必須の前提である。
- **Follow-up**: 失敗の試行は既存のアカウント単位のロック（5 回 / 5 分）と、新設の送信元単位の制限の両方で抑える。

### Decision: 定期処理は Bull の繰り返しジョブで一つの実行基盤にする
- **Context**: 要件36.8、37.4、37.8、41.1、41.2。
- **Alternatives Considered**:
  1. node-cron をプロセス内で動かす
  2. Railway の Cron サービスを別に立てる
  3. 既存の Bull（Redis）の繰り返しジョブ
- **Selected Approach**: 3。キュー `scheduled-jobs` に `audit-log-archive`（月次）、`inactive-user-deactivation`（日次）、`expired-token-cleanup`（毎時）を登録する。
- **Rationale**: 依存を増やさない。複数インスタンスでも Redis 上の一つの繰り返し定義から一度だけ実行される。
- **Trade-offs**: Redis 障害中は実行されない。各ジョブは冪等に作り、次回の実行で追いつく。

### Decision: 案件の閲覧範囲は「判定の規則」と「適用」を分ける
- **Context**: 要件39。各業務 spec が適用を受入基準として持つ。
- **Selected Approach**: 本 spec は `ProjectScopeService`（判定と一覧の絞り込み条件）と `requireProjectScope`（ID 指定の要求の判定と 404 化）を持つ。子リソースから案件 ID を引く解決関数は各業務 spec が持つ。参照の適用として、案件そのもの（`/api/projects` の一覧・件数・詳細）にだけ本 spec が適用する。
- **Rationale**: 判定の規則を一箇所に置き、各業務 spec は解決関数と適用箇所だけを持つ。案件そのものへの適用が無いと、本 spec の受入基準を本番の入口で検証できない。
- **Trade-offs**: `projects.routes.ts` は project-management の所管のファイルであり、本 spec は案件の一覧・件数・詳細の判定の呼び出しだけを足す。画面と案件の業務規則は project-management に残す。是正計画 §5.3 の記載を合わせて改める。

### Decision: 監査ログは利用者への外部キーを持たず、実行者の写しを持つ
- **Context**: 要件40.6〜40.8。
- **Alternatives Considered**:
  1. `onDelete: SetNull`
  2. 外部キーを外し、`actorId` を文字列のまま残し、実行者のメールアドレスと表示名の写しを記録時に保存する
- **Selected Approach**: 2。あわせて DB のトリガーで `audit_logs` の UPDATE を常に拒否し、DELETE はアーカイブ処理のトランザクション（`SET LOCAL architrack.audit_archive = 'on'`）に限る。
- **Rationale**: `SetNull` は外部キーの動作として UPDATE を伴い、改変の禁止（トリガー）と両立しない。`targetId` は既に外部キーを持たない文字列であり、形が揃う。
- **Trade-offs**: 一覧での表示名は記録時点の写しになる（改名は反映されない）。監査の性質上、記録時点の値が正しい。

### Decision: 開発用の抜け道は「実行環境の明示」があるときだけ有効にする
- **Context**: 要件42.9、32.7、34。
- **Selected Approach**: `process.env.NODE_ENV` が `development` または `test` と明示されたときだけ開発用の機能を有効にする判定を一箇所（`runtime-mode`）に置く。TOTP の固定値（`123456`・`ABCD1234`）の受理は全環境で取り除き、E2E は既知の秘密鍵から TOTP を計算する。
- **Rationale**: 2FA 必須化と再利用防止の後は、固定値の受理は要件32.7・34 の検証そのものを無意味にする。

### Decision: E2E の認証は「作業者ごとのセッション保持」に移す
- **Context**: 2FA 必須化（要件34）、TOTP の再利用防止（要件32.7）、再利用検知（要件33.6）の下では、テストごとに同じ利用者でログインすると 30 秒以内の二度目の TOTP が拒否され、保存した Cookie を複数のコンテキストで使い回すと再利用として系列ごと失効する。
- **Selected Approach**: 全体の準備（`e2e/global-setup.ts`）で役割ごとに一度ログインし、リフレッシュの Cookie を保持する。各テストのコンテキストへその Cookie を渡し、テストの終了時にローテーション後の Cookie を回収して次のテストへ渡す（E2E は直列実行）。保持したセッションが失われたテスト（ログアウト・全セッション失効を検証するもの）の後は、次の時間ステップを待ってログインし直す。ログイン画面そのものを検証するテストは専用の利用者を使う。
- **Rationale**: 要件の挙動を弱めずに E2E を成立させる。ログインの回数が減り、実行時間も縮む。
- **Trade-offs**: E2E の補助関数の書き換えが広範に及ぶ。localStorage の `accessToken` を観測していたテストは書き換えが要る。

## Synthesis

- **一般化**:
  - 「利用者の状態による拒否」（無効化 36.1、2FA 未登録 34.2、初回のパスワード変更 37.7）は同じ問題の変種であり、`AuthenticatedUserStateService` の一つの照合（状態と許可する経路の表）で扱う。
  - 「管理者への通知」（36.4、36.9、41.6、43.1〜43.5）は既存の `sendAdminRoleChangedAlert` の一般化であり、`AdminNotificationService.notifyAllAdmins` に寄せる。
  - 「保存するトークンを復元不能にする」（33.7、37.1）は SHA-256 の一つの関数で扱う（高エントロピーの乱数であり、遅いハッシュは要らない）。
- **導入か自作か**:
  - 定期処理は既存の Bull を使い、新しい依存を入れない。
  - 異常検知は外部の SIEM を導入せず、Redis の時間窓のカウンタで閾値を見る。小規模な利用者数に見合い、閾値は設定で変えられる（要件43.7）。
  - 秘密の比較・ハッシュは Node の `crypto` を使う。
- **単純化**:
  - DataLoader 等の新しい層は作らない。権限の判定は既存の `RBACService.hasPermission`（Redis キャッシュ）を使う。
  - 2FA の再登録（34.11）は新しい画面を作らず、既存の 2FA 設定画面に手順を足す。
  - 棚卸し画面は新しいページ一枚とし、無効化・再有効化・2FA の再設定の操作をそこへ集める。

## Risks & Mitigations
- 配備の構成（nginx による中継と backend の公開ドメインの扱い）を誤ると、Cookie が送られない、または送信元 IP が偽装できる — 配備の確認手順（`req.ip` の実測、Cookie の送信の確認）を移行手順に含め、staging で先に確かめる。
- リフレッシュトークンの保存形式の変更で既存のセッションが全て切れる — 移行時に全利用者の再ログインが要ることを利用者へ事前に告知する。
- 2FA 必須化の初日に全利用者が登録を求められる — 管理者が先に登録を済ませ、利用者向けの手順を用意する。
- 90 日の自動無効化が唯一の有効なシステム管理者に及ぶと、管理画面から復旧できない — サーバー上で実行する復旧スクリプト（`npm run user:reactivate`）を用意する。要件36.8 の文言どおり自動無効化の対象からは外さない。
- E2E の認証基盤の書き換えが広い — 認証の補助関数を先に置き換え、既存の全 E2E を一度通してから個別の要件の検証へ進む。
- tesseract.js の既定の取得先を CSP で許可する — 外部の CDN への依存が残る。自前の配信への切り替えは要件44.4 の範囲外とし、是正計画へ追記する。

## References
- [RFC 9700: OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700) — リフレッシュトークンのローテーションと再利用検知
- [RFC 6238: TOTP](https://www.rfc-editor.org/rfc/rfc6238) — §5.2 一度使った OTP の拒否
- [RFC 9068: JWT Profile for OAuth 2.0 Access Tokens](https://www.rfc-editor.org/rfc/rfc9068) — アクセストークンの種別・発行者・利用者の検証
- [OWASP Cheat Sheet: JSON Web Token for Java（Token Sidejacking・保存場所）](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [OWASP Cheat Sheet: Cross-Site Request Forgery Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) — 二重送信 Cookie と Origin の照合
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) — 記録してはならない値
- [Express behind proxies](https://expressjs.com/en/guide/behind-proxies)
- [express-rate-limit: Troubleshooting Proxy Issues](https://github.com/express-rate-limit/express-rate-limit/wiki/Troubleshooting-Proxy-Issues)
- [Bull Reference](https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md)
- [nginx ngx_http_headers_module](https://nginx.org/en/docs/http/ngx_http_headers_module.html)

---

# Research & Design Decisions: 要件46〜51 外部アプリの認可（2026-11-22）

## Summary

- Discovery: full（既存の認証の調査と、OAuth・MCP・Claude コネクタの一次情報の調査）
- 確認の限界: ライブラリの挙動は oidc-provider 9.15.1 の文書とコードの読解によるもので、実機では動かしていない

## Research Log

### oidc-provider

- 9.15.1（2026-11-20）、MIT、ESM。保守は活発だが単独保守者である。GitHub Advisory DB と npm の勧告に該当なし（2026-11-22）
- `express.json()` より前に載せる。開発用の画面は既定で有効なので必ず無効にする
- PKCE の必須化、リフレッシュの回転、未使用の期限はいずれも既定では要件に足りず、明示の設定が要る
- 不透明なトークンの値は `jti` で、そのままでは保存される。アダプターで HMAC 化する
- 認可コードとリフレッシュトークンの再利用検知は、期限切れの判定や PKCE の検証より後にある。期限切れ後や検証値の誤りでは Grant が失効しないため、アダプターの `find` で先に検知する
- 出典: https://github.com/panva/node-oidc-provider/blob/v9.15.1/docs/README.md 、https://github.com/panva/node-oidc-provider/blob/v9.15.1/example/my_adapter.js

### MCP Authorization（2026-07-28 版）

- MCP サーバーは RFC 9728 が必須。クライアントは RFC 8707 の `resource` を送り、サーバーは自分宛てのトークンだけを受理する
- 登録方式の優先は事前登録 → CIMD → DCR。DCR は非推奨になった
- 出典: https://modelcontextprotocol.io/specification/2026-07-28/changelog 、https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery

### Claude のカスタムコネクタ

- 登録方式は CIMD、DCR、利用者が入力する client ID と secret。戻り先は `https://claude.ai/api/mcp/auth_callback`
- refresh は 401 時と期限の最大 5 分前に行い、失効時は `invalid_grant` を期待する
- 未確認: 同時 refresh の直列化、応答を失ったときの再試行、secret の送信方式（basic か post か）
- 出典: https://claude.com/docs/connectors/building/authentication 、https://claude.com/docs/connectors/custom/remote-mcp

## Design Decisions

### Decision: クライアントは事前登録の confidential client に限る

- 採用理由: 46.4〜46.6 を最も確実に満たす
- 不採用: CIMD の URL 許可（ライブラリで実験的機能、URL が固定の契約か未確認）、DCR を戻り先で絞る（自己申告で仕様上も非推奨）
- 影響: Claude へ接続を追加するときに client ID と secret の入力が要る

### Decision: アクセストークンは不透明な値とし、接続と保存データを PostgreSQL に置く

- 採用理由: 取り消しが次の要求から効き、既存の操作と同じトランザクションで失効できる
- 不採用: JWT（失効が期限まで効かない）、Redis（既存のトランザクションに入らない）

### Decision: 同意は SPA の画面で行い、応答の URL へ全ページ遷移する

- 採用理由: ログインの Cookie は `/oauth` に届かず、CSP の `form-action` がフォーム送信後の外部への遷移を止めうる

### Decision: 外部アプリには `read write` を要求させる

- 採用理由: 要求されていない範囲は付与できないため、同意画面で書き込みを選ぶには要求に含める必要がある。利用者が外せば `read` だけの接続になる

## Synthesis

- Generalization: 失効の入口を `revokeAllForUser` などに集約し、契機は理由の値の違いだけにした
- Build vs Adopt: 認可サーバーは採用。保存アダプターは公式の実装が無いため作る
- Simplification: 許可するアプリの管理画面は作らず環境変数で持つ。接続の終了後の行は持たず、経緯は監査ログに残す

## Risks & Mitigations

- 毎回の同意の強制が未検証 — 実装の最初のタスクで確かめる
- 猶予なしの回転で接続が切れる — 実機で頻度を確かめ、問題があれば要件の見直しを利用者に諮る
- 単独保守のライブラリ — 版を固定し、再利用の統合テストで更新時に確かめる

### 2026-11-22 の設計の修正（タスク計画の独立点検の RETURN_TO_DESIGN）

- 手続きの Cookie の Path は同意の URL のパスになる（`lib/actions/authorization/interactions.js`）。同意の URL を backend の `/oauth/interaction/:uid` にして SPA へ転送し、API をその下に置く
- 既定の `issueRefreshToken` は `offline_access` を要する（`lib/helpers/defaults.js`）。許可したアプリには常に発行する設定にする
- 再開の経路 `/oauth/authorize/:uid` を担当の経路に加えた（`lib/helpers/initialize_app.js`）
- 保存アダプターは要求の文脈を持たない。送信元は要求の文脈に置き、再利用の処理は組み立て時に注入する
- トークンの失効の窓口は要件に無く、接続との状態の食い違いを生むため無効にした
- いずれもソースの読解であり、実行しての確認は実装の最初のタスクで行う

### 2026-11-22 の Claude 実機の観測（タスク70.2）

- client secret は `client_secret_post`、全要求に `resource` が付き、範囲は `offline_access read write` を要求する
- 更新の応答を 1 回切断すると 12 秒後に同じリフレッシュトークンで再試行した。利用者の判断で要件48.11 の 30 秒の猶予を加えた
- 猶予は oidc-provider 9.15.1 の上でアダプターの `find`・`consume` により実現できた（ローカルの検証 24 項目。猶予を外す対照で失敗）。Grant ごとの直列化が要ることは検証で示せておらず、PostgreSQL の統合テストで確かめる
