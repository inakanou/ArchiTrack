# セキュリティ設計

このドキュメントでは、ArchiTrackのセキュリティ設計とセキュリティ対策を説明します。

認証・認可・監査の仕組みは、IPA の注意喚起（2026-10-09）を受けた是正（user-authentication 要件32〜64）で大きく改めました。仕様の詳細は `.kiro/specs/user-authentication/requirements.md`・`design.md`、是正の計画と運用作業は [IPA 注意喚起の是正計画](../security/ipa-alert-20261009-remediation-plan.md) を参照してください。

---

## セキュリティ層

```
┌─────────────────────────────────────────────┐
│ Edge / Web Server Layer（frontend の nginx） │
│ - 画面と API を同一オリジンで配信            │
│ - /api/・/csrf-token を backend へ中継       │
│ - セキュリティヘッダー・CSP                  │
│ - アクセスログ（クエリ・Referer を残さない） │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Application Layer（backend）                 │
│ - 送信元 IP の識別（TRUST_PROXY_HOPS）       │
│ - Rate Limiting（Redis。認証系は専用の制限） │
│ - CSRF（二重送信 Cookie）・Origin の照合     │
│ - JWT の検証と利用者の状態の照合             │
│ - RBAC・権限付与の上限・案件の閲覧範囲       │
│ - Input Validation (Zod)                    │
│ - 監査ログ・異常の検知と通知                 │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Transport Layer                             │
│ - HTTPS強制 (本番環境)                      │
│ - HSTS ヘッダー（本番の nginx）             │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Infrastructure Layer                        │
│ - Railway (プラットフォームセキュリティ)     │
│ - プライベートネットワーク（nginx→backend） │
│ - PostgreSQL / Redis（外部非公開）           │
└─────────────────────────────────────────────┘
```

---

## 本番の要求経路と送信元 IP の識別

### 要求経路

```
ブラウザ ─HTTPS→ Railway のエッジ ─→ frontend の nginx ─(プライベートネットワーク)→ backend
                                     │                     BACKEND_INTERNAL_URL
                                     └ 画面（SPA）の配信
```

- 画面と API は同じオリジン（frontend の公開ドメイン）で提供します。nginx は `/api/` と `/csrf-token` を `BACKEND_INTERNAL_URL`（`http://<backend のサービス名>.railway.internal:<PORT>` の形）へ中継し、それ以外は SPA を配信します
- 同一オリジンにすることで、リフレッシュトークンの Cookie を `SameSite=Strict` のまま使えます
- backend は `::`（IPv4・IPv6 のデュアルスタック）で待ち受けます。Railway のプライベートネットワークが IPv6 だけの環境でも中継先へ届きます
- 画面の API の接続先 `VITE_API_URL` は frontend の公開 URL（同一オリジン）にします。配備の切り替えの後に backend の公開ドメインは閉じます（是正計画 O4）
- `BACKEND_INTERNAL_URL` が未設定か形が違うと、frontend のコンテナは起動前の検査（`nginx-require-backend-internal-url.sh`）で止まります

### 送信元 IP の識別

- 送信元は Express の `trust proxy` に信頼する中継の段数 `TRUST_PROXY_HOPS` を数値で与えた `req.ip` だけで決めます（`backend/src/middleware/client-ip.ts`）。`X-Forwarded-For`・`X-Real-IP` を直接読まず、全面的な信頼（`true`）も使いません
- nginx は受け取った `X-Forwarded-For` の末尾に接続元を足して中継します。利用者が先頭に偽の値を書いても送信元は変わりません
- 回数制限・監査ログ・セキュリティログは、この送信元を使います

| 環境 | `TRUST_PROXY_HOPS` | 根拠 |
|------|-------------------|------|
| 本番・staging（Railway） | `3` | Railway のエッジが利用者の IP とエッジ自身の IP の 2 段を足し、frontend の nginx が 1 段を足す（2026-11-07 に staging で実測） |
| テスト・CI（Docker Compose） | `1` | nginx の 1 段だけ |
| 未設定（開発の既定） | `0` | 中継を信頼しない。本番の実行環境では未設定だと起動を止める |

---

## 認証（Authentication）

### JWT（JSON Web Token）

**方式:**
- **署名アルゴリズム**: EdDSA (Ed25519)
- **トークン種類**:
  - **アクセストークン**: 有効期限 15分（デフォルト）
  - **リフレッシュトークン**: 有効期限 7日（デフォルト）

**クレームと検証:**
- アクセストークンの JOSE ヘッダーは `typ: at+jwt`（RFC 9068）
- 発行者 `iss`（`JWT_ISSUER`、既定 `architrack`）、想定利用者 `aud`（`JWT_AUDIENCE`、既定 `architrack-api`）、種別 `token_use`（`access` / `refresh`）、一意な `jti` を持たせます
- 検証では署名・有効期限に加えて、`iss`・`aud`・`typ`・`token_use` が期待どおりであることを確かめます。リフレッシュトークンをアクセストークンとして使うことはできません
- アクセストークンは世代 `gen` を持ちます。管理者による 2FA の再設定で利用者の世代が上がり、それより前に発行されたアクセストークンは署名の不正なトークンと同じ 401 で拒否します

**利点:**
- 非対称鍵による署名（公開鍵は JWKS `/.well-known/jwks.json` で配布）
- トークンリフレッシュによる短命アクセストークン

### トークンの保管と受け渡し

| トークン | 保管先 | 受け渡し |
|---------|-------|---------|
| アクセストークン | 画面のメモリだけ（localStorage・sessionStorage・IndexedDB に書かない） | `Authorization: Bearer` |
| リフレッシュトークン | HttpOnly Cookie `refreshToken`（`SameSite=Strict`、Path `/api/v1/auth`、本番は `Secure`） | Cookie だけ（応答本文・要求本文では受け渡さない） |

- 画面の再読み込みでは Cookie によるリフレッシュで認証状態を復元します
- タブ間のリフレッシュは Web Locks で直列化し、結果を BroadcastChannel で配ります（同じ Cookie を二つのタブが同時に使うと、後着が再利用と判定されるため）

### リフレッシュトークンの保存とローテーション

- DB（`refresh_tokens`）には原文でなく SHA-256 のハッシュだけを保存します
- リフレッシュのたびにローテーションし、後継を `Set-Cookie` で渡します。ログインごとに系列（`familyId`）を持ちます
- 置き換え済みのリフレッシュトークンが再び提示されたら、その系列を全て失効させ、監査（`REFRESH_TOKEN_REUSE_DETECTED`）に記録します
- 移行時に保存形式を改めたため、全利用者のセッションが一度切れています

### CSRF と Origin の照合

Cookie で認証情報を受け付ける状態変更の要求（`POST /api/v1/auth/refresh`・`POST /api/v1/auth/logout`）は、次の両方を満たすときだけ受け付けます。

- **二重送信 Cookie**: Cookie `csrf-token` とヘッダー `X-CSRF-Token` の一致（定数時間で比較。値は `GET /csrf-token` で得る）
- **Origin の照合**: `Origin`（無ければ `Referer`）のオリジンが `FRONTEND_URL` と一致

Bearer で認証する API はブラウザが自動でトークンを付けないため、CSRF の検査の対象外です。

### パスワード管理

#### ハッシュ化

- **アルゴリズム**: Argon2id
- **OWASP推奨**: メモリハード関数（GPU攻撃耐性）
- **パラメータ**:
  - Memory: 65536 KiB (64 MiB)
  - Iterations: 3
  - Parallelism: 4

#### パスワードポリシー

- **最小長**: 12文字
- **複雑性要件**: 大文字、小文字、数字、特殊文字のうち3種類以上
- **パスワード履歴**: 過去3回の再利用防止
- **漏洩チェック**: HIBP（Have I Been Pwned）Bloom Filter実装
- **初期管理者**: 初期管理者のパスワードもポリシーで検証し、初回ログインでパスワードの変更を要する状態で作ります

#### パスワードリセット・招待のトークン

| 項目 | パスワードリセット | 招待 |
|------|------------------|------|
| 生成 | 32 バイトの乱数 | 32 バイトの乱数 |
| 保存 | SHA-256 のハッシュだけ | SHA-256 のハッシュだけ |
| 有効期限 | 1 時間 | 7 日（再送信で新しいトークンに置き換え） |
| 受け渡し | メールのリンクの URL フラグメント `#token=…` → 画面が要求本文で送る | 同左 |

- トークンを URL のパスやクエリに載せないため、アクセスログ・Referer に残りません
- リセットは一回限りです。リセットの要求には、メールアドレスの登録の有無に関わらず同じ応答を返します

### 二段階認証（2FA）

#### 必須化

- 2FA は全利用者で必須です。未登録の利用者は 2FA の設定とログアウト以外の API が 403（`TWO_FACTOR_SETUP_REQUIRED`）になり、画面も 2FA の設定画面へ進みます
- 利用者自身による無効化は拒否します（`POST /api/v1/auth/2fa/disable` は常に 403）
- 第二要素を失った場合は管理者による 2FA の再設定（`POST /api/v1/users/{id}/2fa/reset`）で未登録へ戻し、利用者が登録し直します。再設定は全リフレッシュトークンを失効させ、アクセストークンの世代を上げます。自分自身の再設定は拒否します
- 端末の交換は、現在の TOTP コードによる再登録で行います

#### 2FA 待ちの資格

- ログインのパスワードの検証に成功すると、2FA 待ちの資格 `challengeToken`（不透明な文字列）を返します
- 資格は Redis に SHA-256 の鍵（`2fa:challenge:<ハッシュ>`）で 5 分間置き、2FA の検証の成功で消費します（一回限り）
- 2FA の検証（TOTP・バックアップコード）は資格を必ず要求し、メールアドレスやアクセストークンを資格として受理しません

#### TOTP（Time-based One-Time Password）

- **アルゴリズム**: TOTP（RFC 6238）
- **時間ウィンドウ**: ±1ステップ（30秒 × 3 = 90秒）
- **再利用の拒否**: 一致した時間ステップを `users.two_factor_last_used_step` に記録し、同じか古いステップのコードを拒否します
- **秘密鍵暗号化**: AES-256-GCM（鍵は `TWO_FACTOR_ENCRYPTION_KEY`）

#### 暗号化鍵の入れ替え

`TWO_FACTOR_ENCRYPTION_KEY` を入れ替えると、古い鍵で暗号化された秘密は復号できず、その利用者は 2FA の検証で止まります。鍵を入れ替えて配備した後に、新しい鍵を持つ環境で次のスクリプトを実行し、復号できない利用者の 2FA を未登録へ戻します（利用者は次のログインで登録し直す）。

```bash
# backend ディレクトリで実行
npm run user:reset-undecryptable-2fa                      # 確認だけ（書き込まない）
npm run user:reset-undecryptable-2fa -- --apply [--reason <理由>]
```

#### バックアップコード

- **生成**: 10個のランダムコード（8桁英数字）
- **使い捨て**: 一度使用したら無効化
- **ハッシュ化**: Argon2idでハッシュ化保存

### ログイン試行の制限（アカウントロック）

| 対象 | 失敗回数 | ロック時間 | 記録 |
|------|---------|-----------|------|
| パスワード | 連続 5 回 | 15 分 | 利用者の行（DB）。監査 `LOGIN_LOCKED` |
| 2FA | 連続 5 回 | 5 分 | 同上 |

送信元ごとの回数制限は別に掛けます（[レートリミット](#レートリミット)）。

---

## 利用者の状態

認証済みの要求ごとに、アクセストークンの検証の後、権限の判定より前に利用者の状態を照合します（`authenticate` ミドルウェア。状態は Redis に 60 秒キャッシュし、変更時に無効化）。画面も同じ状態で遷移を制限します。

| 状態 | API の扱い |
|------|-----------|
| 無効化 | 全ての要求とリフレッシュを 401（`ACCOUNT_DISABLED`） |
| 初回のパスワード変更を要する | パスワード変更とログアウト以外を 403（`PASSWORD_CHANGE_REQUIRED`） |
| 2FA 未登録 | 2FA の設定とログアウト以外を 403（`TWO_FACTOR_SETUP_REQUIRED`） |
| 2FA の再設定より前のアクセストークン | 401（署名の不正なトークンと同じ） |

### 無効化・再有効化・棚卸し

- **管理者による無効化・再有効化**: `POST /api/v1/users/{id}/deactivate`・`/reactivate`（理由が必須）。無効化は全リフレッシュトークンを失効させます。自分自身と最後の有効なシステム管理者は無効化できません。監査に記録し、全システム管理者へ通知します
- **90 日の自動無効化**: 最終ログイン・作成・最後の再有効化のうち最も新しい日時から 90 日を過ぎた有効な利用者を、定期処理で無効化します（監査 `USER_AUTO_DEACTIVATED`）
- **復旧**: 全てのシステム管理者が無効になったときは、サーバー上で `npm run user:reactivate -- --email <メールアドレス>` を実行します
- **棚卸し**: `GET /api/v1/users/inventory` と棚卸し画面で、全利用者の状態・2FA 登録の有無・最終ログイン日時・招待者を確認できます
- ログインで無効化を確かめ、最終ログイン日時を記録します。担当者候補は有効な利用者に限ります

---

## 認可（Authorization）

### RBAC（ロールベースアクセス制御）

**標準準拠:**
- NIST RBAC標準準拠
- Core RBAC + Hierarchical RBAC

**構成要素:**
- **ロール**: ユーザーの役割（システム管理者 `admin`、一般ユーザー `user` 等）と優先度（`priority`。システム管理者は 100、一般ユーザーは 0）
- **権限**: リソースへのアクセス権（`project:read`、`user:manage` 等）
- **ユーザー・ロール紐付け**: マルチロール対応

**権限形式:**
```
<resource>:<action>
```

**例:**
- `user:read`: ユーザー一覧・棚卸しの閲覧
- `user:manage`: 他の利用者の無効化・再有効化・2FA の再設定
- `audit:read`: 監査ログの閲覧・エクスポート・アーカイブの復元
- `project:read_all`: 全案件の閲覧（案件の閲覧範囲を超える）
- `ops:manage`: 運用設定（ログレベル）の管理
- `*:*`: 全権限（システム管理者）

一般ユーザーのロールには `user:read`・`project:read_all`・`ops:manage` を割り当てません。

### 権限チェックフロー

要求は `authenticate`（トークンの検証と利用者の状態の照合）→ `requirePermission`（RBAC）→ `requireProjectScope`（案件の閲覧範囲。業務 API）→ `validate`（Zod）→ ハンドラーの順に検査します。

```typescript
// ミドルウェア（概念図）
async function requirePermission(permission: string) {
  // 1. authenticate が検証したトークンからユーザーID取得
  const userId = req.user.userId;

  // 2. ユーザーの権限を判定（ロールの権限を Redis にキャッシュ。ワイルドカードを照合）
  const allowed = await rbacService.hasPermission(userId, permission);

  // 3. 拒否は 403。監査（PERMISSION_CHECK_FAILED）と異常の検知へ送る
  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions');
  }

  next();
}
```

### 権限付与の上限

権限を管理できる利用者でも、自分を超える権限を作り出したり、自分より上の利用者を操作したりできないようにします（`backend/src/services/privilege-ceiling.ts`）。実行者の上限は保有ロールの優先度の最大値です（同じ優先度は上限を超えない）。

| 拒否する操作 | エラーコード（403） |
|-------------|-------------------|
| 上限を超える優先度のロールの割り当て・作成・優先度の変更、上限より上のロールの変更・削除・権限の取り外し、上限を超えるロールの他の利用者からの解除 | `ROLE_PRIORITY_EXCEEDS_ACTOR` |
| システム管理者でない実行者による全権限 `*:*` の追加・`admin` ロールの割り当て | `SYSTEM_ADMIN_REQUIRED` |
| システム管理者でない実行者による、自分が保有しない権限のロールへの追加 | `PERMISSION_NOT_HELD_BY_ACTOR` |
| システムロールの名前の変更 | `SYSTEM_ROLE_RENAME_FORBIDDEN` |
| システムロールの優先度の変更（実行者によらない） | `SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN` |
| 上限を超えるロールを持つ他の利用者の削除・無効化・再有効化・2FA の再設定 | `TARGET_USER_EXCEEDS_ACTOR` |

拒否は権限チェックの失敗（`PERMISSION_CHECK_FAILED`）として監査に記録します。システム管理者ロールの優先度（100）を超える優先度の指定は、入力の検証で 400 にします。

### 案件の閲覧範囲

利用者は関係する案件のデータだけを閲覧・操作できます（`ProjectScopeService`・`requireProjectScope`）。

- **関係者**: 案件の営業担当者・工事担当者・作成者のいずれか。全案件の閲覧は権限 `project:read_all` で判定します（ロール名を直書きしない）
- **判定**: 要求のたびに案件の行を読み、結果をキャッシュしません（担当者の変更が次の要求から反映される）
- **適用先**: 案件の一覧・件数・詳細・更新・状態変更と、各業務機能（現場調査、工事写真、数量表、内訳書、見積依頼、見積書、契約、工程表、実行予算）の API。子リソースからは各機能の解決関数で案件を引きます
- **応答**: 範囲外・不在・論理削除済みはいずれも、存在しない案件と同じ 404 を返します（存在の有無を推測させない）。画面は 404 を日本語の不在の表示にします
- **記録**: 案件が実在し範囲外のときだけ監査 `PROJECT_SCOPE_DENIED` に記録し、異常の検知へ送ります。経路の案件と対象が実際に属する案件の食い違いも、実際の案件が範囲外なら同じ形で記録します（応答は常に 404）
- ファイルの署名 URL の発行も同じ判定を使います

---

## セッション管理

- **保存先**: PostgreSQL の `refresh_tokens`（ハッシュ・系列・失効の状態）
- **マルチデバイス**: ログインごとに系列を持ち、複数デバイスで同時ログインできます。セッションの一覧と個別の失効は `/api/v1/auth/sessions` で行います
- **ログアウト**: `POST /api/v1/auth/logout` は Cookie の系列を失効させ Cookie を消します。`POST /api/v1/auth/logout-all` は全デバイスの系列を失効させます（監査 `LOGOUT_ALL`）
- **強制的な失効**: 無効化・2FA の再設定・パスワードリセットで、対象者の全リフレッシュトークンを失効させます
- **期限切れの掃除**: 期限切れのトークン（リフレッシュ・招待・リセット）は定期処理で消します

Redis には、2FA 待ちの資格、利用者の状態のキャッシュ、権限のキャッシュ、回数制限と異常検知の計数、メールキューと定期処理のキューを置きます（全て `REDIS_URL` で接続）。

---

## 入力検証（Input Validation）

### Zodスキーマ検証

```typescript
// 例: ユーザー登録
const registerSchema = z.object({
  invitationToken: z.string().min(1),
  password: z.string().min(12),
  displayName: z.string().min(1).max(100),
});
```

一括保存などの配列・文字列には件数と長さの上限を設けます（例: 見積項目の一括保存は、本文の総数と階層の深さを検証の前に数え、上限を超えたら 422 で拒否）。

### SQLインジェクション対策

- **Prisma ORM**: パラメータ化クエリ
- 生SQLは、パラメータを束縛するタグ付きテンプレート（`$queryRaw`）と移行（トリガー）に限る

### XSS対策

- **React**: デフォルトでエスケープ
- `dangerouslySetInnerHTML`は使用しない
- Content Security Policy（CSP）ヘッダー（frontend の nginx。[セキュリティヘッダー](#セキュリティヘッダー)）

---

## レートリミット

### 実装

- **Redisベース**: express-rate-limit と Redis の記録（`RedisRateLimitStore`）
- **識別**: 送信元 IP（`req.ip`）。パスワードリセットの要求はメールアドレスごとにも数える
- **キー形式**: `rl:<制限の名前>:<識別子>`
- 本番の実行環境では、制限を無効化する設定を無視します
- 429 の応答は異常の検知へ送ります

### 設定

| エンドポイント | リミット | ウィンドウ |
|--------------|---------|-----------|
| 一般API（`/api` 配下） | 100 req | 15分 |
| ログイン | 10 req | 1分 |
| トークンリフレッシュ | 20 req | 1分 |
| 2FA検証（TOTP・バックアップコード） | 10 req | 5分 |
| パスワードリセットの要求 | 5 req（送信元・メールアドレスのそれぞれ） | 1時間 |
| パスワードリセットの実行・検証 | 10 req | 15分 |
| 招待経由の登録・招待の検証 | 10 req | 15分 |
| 招待の作成・再送信 | 5 req | 1分 |
| ヘルスチェック | 60 req | 1分 |

パスワードリセットの要求がメールアドレスごとの上限を超えたときは、要求を無視して通常と同じ 200 の応答を返します（登録の有無を推測させない）。

---

## CORS（Cross-Origin Resource Sharing）

本番は画面と API が同一オリジンのため、ブラウザの要求は CORS の対象になりません。ローカル開発（Vite の 5173 から backend の 3000 へ直接つなぐ）では次の設定が働きます。

### 設定

```typescript
const corsOptions = {
  origin: env.FRONTEND_URL,  // 許可するオリジン
  credentials: true,  // Cookieを許可
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
};
```

---

## セキュリティヘッダー

画面・静的ファイル・中継した API の全応答に、frontend の nginx がセキュリティヘッダーを付けます（`frontend/nginx-security-headers.conf`）。backend（Helmet）が付ける同じ名前のヘッダーは中継で外し、nginx の値だけを返します。nginx は `server_tokens off` で版を出しません。

### 設定済みヘッダー

| ヘッダー | 値 |
|---------|----|
| Content-Security-Policy | 下記 |
| Strict-Transport-Security | `NGINX_HSTS_VALUE`（本番だけ `max-age=31536000; includeSubDomains`。空の環境では付かない） |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `no-referrer` |

### CSP

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' data: https://fonts.gstatic.com;
img-src 'self' data: blob: ${CSP_IMG_SRC_EXTRA};
connect-src 'self' blob: data: ${CSP_CONNECT_SRC_EXTRA};
worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

OCR（Tesseract.js）の worker・コア・日本語の言語データは画面と同じオリジンの `/tesseract/` から配信するため（`frontend/vite.config.ts` の `tesseractAssetsPlugin`）、外部の CDN（`cdn.jsdelivr.net`・`tessdata.projectnaptha.com`）を許可しません。

環境ごとの追加の取得先は frontend の環境変数で渡します（空白区切り）。

| 環境変数 | 設定する値 |
|---------|-----------|
| `CSP_IMG_SRC_EXTRA` | R2 の署名 URL の配信元（`https://<バケット名>.<アカウント ID>.r2.cloudflarestorage.com` の形。`R2_PUBLIC_URL` を使う環境はそのオリジンも） |
| `CSP_CONNECT_SRC_EXTRA` | 同じ R2 の配信元と、Sentry の取り込み先（`VITE_SENTRY_DSN` のホストのオリジン） |

R2 の配信元を設定しないと、画像・PDF の表示と取得がブラウザの CSP で止まります。配備の後に画像の表示・編集を行い、ブラウザのコンソールに CSP の違反が出ないことを確かめます。

---

## 監査ログ

### 記録対象

- **認証イベント**: ログイン成功・失敗・ロック、2FA の検証の成否、ログアウト・全デバイスのログアウト、リフレッシュトークンの再利用の検知
- **アカウント操作**: 招待（作成・再送信・受諾・取り消し）、無効化・再有効化・自動無効化、2FA の再設定・再登録、ユーザーの削除（削除の前に記録）
- **ロール・権限の変更**: ロールの作成・更新・削除、権限の追加・削除、ユーザー・ロール紐付けの変更、権限チェックの失敗
- **業務データの操作**: 案件・取引先・現場調査・数量表・内訳書・見積依頼・見積書などの作成・更新・削除
- **閲覧範囲外のアクセス**: `PROJECT_SCOPE_DENIED`
- **データの出力**: `DATA_EXPORTED`（下記）
- **運用設定の変更**: ログレベルの変更 `OPERATIONAL_SETTING_CHANGED`（記録できないときは変更しない）
- **アーカイブ**: `AUDIT_ARCHIVE_CREATED`・`AUDIT_ARCHIVE_FAILED`・`AUDIT_ARCHIVE_RESTORED`

### ログ形式

```typescript
interface AuditLog {
  id: string;
  action: string;            // 'LOGIN_SUCCESS', 'USER_DEACTIVATED'等
  actorId: string | null;    // 実行者のユーザーID（外部キーを持たない）
  actorEmail: string | null; // 記録時の実行者のメールアドレスの写し
  actorDisplayName: string | null; // 記録時の実行者の表示名の写し
  targetType: string;        // 'User', 'Role', 'Project'等
  targetId: string;          // 対象のID
  before?: object;           // 変更前の値
  after?: object;            // 変更後の値
  metadata?: object;         // IPアドレス、ユーザーエージェント、要求識別子等
  createdAt: Date;
}
```

### 保全

- **改変の禁止**: DB のトリガー `audit_logs_immutable` が更新を常に拒否し、削除はアーカイブの許可の設定（`architrack.audit_archive`）の取引の中でだけ許します
- **実行者の写し**: 実行者の削除で監査ログが消えないよう外部キーを外し、メールアドレスと表示名を写して持ちます
- 業務データの操作の監査ログは、操作と同じトランザクションの中で書きます（見積書・見積依頼・受領見積書など）

### データ出力の記録

- 出力・一括ダウンロード・クリップボードへのコピーは、生成を始める前に `DATA_EXPORTED` を記録し、**記録に失敗したら出力を中止**します
- ブラウザで生成する出力（PDF・Excel・ZIP・コピー等）は `POST /api/v1/audit-logs/exports` で記録してから生成します。サーバーで生成する出力（工程表・発注・出来高・監査ログの JSON）はサーバーが生成の前に記録し、失敗したら返しません
- 記録の要求と、記録してから生成する出力は自動で再試行しません（記録の重複を避けるため）
- 案件を指定した記録は閲覧範囲で判定し、範囲外は 404 です

### アーカイブと復元

- 13 か月より前の月の行を、月ごとに JSON Lines → gzip → AES-256-GCM で暗号化し、保存先（本番は R2）の `audit-archives/YYYY/MM.jsonl.gz.enc` に書きます。件数・SHA-256・HMAC を持つ目録を `MM.manifest.json` に書きます
- 読み戻して目録と照合し、一致したときだけ同じ月の行を消します。失敗したときは行を残し、全システム管理者へ通知します
- アーカイブは 8 年保持します
- 暗号化と HMAC の鍵は `ARCHIVE_ENCRYPTION_KEY`（64 桁の 16 進）から HKDF-SHA256 で別々に導出します。本番の実行環境では未設定だと起動を止めます
- 復元は `POST /api/v1/audit-logs/archives/restore`（`audit:read`）で、指定期間の月を復号・照合して JSON Lines で返します。照合に失敗した月があれば行を返しません。復元した行は監査ログへ戻しません

---

## 異常の検知と通知

`SecurityAnomalyMonitor` が次の観測を Redis の分単位の桶で数え、時間窓の合計が閾値を超えたら全システム管理者へメールで通知します。

- ログインの失敗、権限の拒否（403）と閲覧範囲外のアクセス（合算）、回数制限の超過（429）、サーバーエラー（5xx）、データの出力（利用者ごと）
- 通知には検知の種類・期間・件数・上位 5 件の送信元 IP と利用者 ID を含めます
- 同じ種類の通知は抑止の時間の間は重複させません（データの出力は利用者ごとに抑止）。通知の総数には上限を設け、溢れた分は次の通知に添えるか、定期処理が要約を送ります
- 観測は要求の応答を待たせません。Redis が使えないときは計数を捨てて警告ログを残します

---

## ログとエラー監視

- **アクセスログ**: nginx はクエリを含まない `$uri` を記録し、Referer を記録しません。backend の HTTP ログは要求識別子（`X-Request-Id`）を生成し、クエリの機密の値を伏せ、利用者 ID を付けます
- **Sentry（backend）**: 要求本文と Cookie を消し、`Authorization`・`Cookie`・`X-CSRF-Token` ヘッダーと URL のクエリの機密の値を伏せてから送ります
- **Sentry（画面）**: トレースの URL のトークンを伏せます
- **認証の DB 障害**: 内部の詳細を返さず、汎用の応答にします
- **開発用機能**: Swagger UI（`/docs`）は実行環境が development / test と明示されたときだけ有効です
- **管理用エンドポイント**: 運用設定 `/api/v1/admin/log-level` は認証と `ops:manage` を要求します（認証の無い旧経路は設けない）

---

## 定期処理

Bull（v4）の繰り返しジョブとして、キュー `scheduled-jobs`（`REDIS_URL`）に登録します（cron は Asia/Tokyo。失敗は 3 回再試行の後にエラーログと Sentry へ送る）。試験の実行環境（`NODE_ENV=test`）では登録しません。

| ジョブ | 周期 | 内容 |
|-------|------|------|
| `expired-token-cleanup` | 毎時 15 分 | 期限切れのリフレッシュ・招待・リセットのトークンを消す |
| `failed-email-job-cleanup` | 毎時 45 分 | メールキュー（`email-queue`）の失敗のジョブを掃除する |
| `inactive-user-deactivation` | 毎日 3:00 | 90 日の自動無効化 |
| `audit-log-archive` | 毎月 1 日 4:00 | 監査ログのアーカイブ |
| `security-anomaly-overflow-summary` | 10 分ごと | 上限で送れなかった異常の通知の要約を送る |

---

## データ暗号化

### 転送時の暗号化

- **HTTPS**: TLS 1.2以上（Railway自動設定。エッジで終端）
- **サービス間**: Railway のプライベートネットワーク（nginx → backend）
- **データベース・Redis**: 外部に公開しない（TCP Proxy を無効にする）

### 保存時の暗号化・ハッシュ化

| データ | 方式 | 鍵・備考 |
|-------|------|---------|
| パスワード | Argon2id ハッシュ | - |
| TOTP 秘密鍵 | AES-256-GCM 暗号化 | `TWO_FACTOR_ENCRYPTION_KEY` |
| バックアップコード | Argon2id ハッシュ | - |
| リフレッシュトークン | SHA-256 ハッシュ | - |
| 招待・パスワードリセットのトークン | SHA-256 ハッシュ | - |
| 2FA 待ちの資格（Redis の鍵） | SHA-256 ハッシュ | - |
| 監査ログのアーカイブ | AES-256-GCM 暗号化 + HMAC | `ARCHIVE_ENCRYPTION_KEY`（HKDF-SHA256 で導出） |

---

## セキュリティベストプラクティス

### 開発時

- [ ] 環境変数を`.env`ファイルに保存（Gitにコミットしない）
- [ ] シークレット鍵を定期的にローテーション
- [ ] 依存関係の脆弱性スキャン（`npm audit`）
- [ ] OWASP Top 10の対策確認
- [ ] 新しい業務 API には `requireProjectScope` を、新しい出力には出力の記録を適用する

### デプロイ時

- [ ] Railway環境変数にシークレット設定（`TWO_FACTOR_ENCRYPTION_KEY`・`ARCHIVE_ENCRYPTION_KEY` は環境ごとに別の値）
- [ ] backend に `TRUST_PROXY_HOPS`・`REDIS_URL`、frontend に `BACKEND_INTERNAL_URL`・`CSP_IMG_SRC_EXTRA`・`CSP_CONNECT_SRC_EXTRA`・`NGINX_HSTS_VALUE`（本番）を設定
- [ ] 配備後に監査ログの送信元 IP が自分の公開 IP と一致すること、`/csrf-token` が frontend の公開ドメイン経由で 200 になること、CSP の違反が出ないことを確かめる
- [ ] HTTPS強制（本番環境）
- [ ] Sentryでエラー監視
- [ ] 監査ログの定期的な確認と棚卸し

---

## 脆弱性対応

### 脆弱性スキャン

```bash
# 依存関係の脆弱性スキャン
npm audit

# 自動修正
npm audit fix
```

### セキュリティインシデント対応

1. **検知**: 異常の検知の通知、Sentry、監査ログ、ユーザー報告
2. **対応**: 脆弱性の特定と修正。必要に応じて対象者の無効化・2FA の再設定でセッションを失効させる
3. **通知**: 影響を受けるユーザーへの通知
4. **再発防止**: セキュリティテストの追加

---

## 次のステップ

- [システム構成](system-overview.md): システム全体像
- [データフロー](data-flow.md): データの流れ
- [シークレット管理](../deployment/secrets-management.md): 鍵管理
- [IPA 注意喚起の是正計画](../security/ipa-alert-20261009-remediation-plan.md): 是正の経緯と運用作業
