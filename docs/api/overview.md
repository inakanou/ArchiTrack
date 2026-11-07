# API概要

このドキュメントでは、ArchiTrack APIの概要を説明します。

---

## ベースURL

### ローカル開発環境

```
http://localhost:3000
```

### テスト・CI環境（nginx 経由）

```
http://localhost:5174
```

### 本番環境

```
https://<frontend のドメイン>
```

本番では画面と API が同一オリジンです。ブラウザは frontend の公開ドメインの `/api/` と `/csrf-token` を呼び、frontend の nginx が Railway のプライベートネットワーク経由で backend へ中継します。backend の公開ドメインは閉じる方針のため、本番の API は frontend のドメインで呼んでください。

---

## Swagger UI

詳細なAPI仕様は、Swagger UIで確認できます。

**アクセス先:**
- ローカル: http://localhost:3000/docs

Swagger UI は開発用の機能で、実行環境が development / test と明示されたときだけ有効です（本番では提供しません）。仕様の JSON は `backend/docs/api-spec.json` にもあります。

---

## API バージョン

現在のバージョン: **v1**

認証・認可・監査のAPIは `/api/v1/` プレフィックスを使用します。業務機能（案件、現場調査、数量表、見積書など）のAPIは `/api/` プレフィックスを使用します。

---

## 認証

ArchiTrack APIは、JWT（JSON Web Token）ベースの認証を使用します。2FA は全利用者で必須です。

### アクセストークンの取得

```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}
```

**レスポンス（2FA 登録済みの場合）:**
```json
{
  "requires2FA": true,
  "challengeToken": "2fa-challenge-from-login",
  "expiresIn": 300
}
```

続けて `POST /api/v1/auth/verify-2fa` に `challengeToken` と TOTP コードを送ると、アクセストークンが返ります。

```json
{
  "accessToken": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
  "user": { "id": "user-id", "email": "user@example.com", "...": "..." }
}
```

- リフレッシュトークンは応答本文に含めず、HttpOnly Cookie `refreshToken`（`SameSite=Strict`、Path `/api/v1/auth`）だけで渡します
- アクセストークン（有効期限 15 分）は画面のメモリだけに保持します
- リフレッシュ（`POST /api/v1/auth/refresh`）とログアウトは Cookie で受け付け、CSRF トークン（`GET /csrf-token` で取得し `X-CSRF-Token` ヘッダーで送る）と `Origin` の照合を要求します

### アクセストークンの使用

```bash
GET /api/v1/protected-endpoint
Authorization: Bearer <accessToken>
```

認証の後、利用者の状態（無効化・初回のパスワード変更・2FA 未登録）を照合し、状態に応じて 401 / 403 を返します。業務 API は案件の閲覧範囲も判定し、範囲外の案件は 404 を返します。

詳細は[認証API](authentication.md)・[認可API](authorization.md)を参照してください。

---

## リクエスト形式

### Content-Type

```
Content-Type: application/json
```

### リクエストボディ

```json
{
  "field1": "value1",
  "field2": "value2"
}
```

---

## レスポンス形式

### 成功レスポンス

```json
{
  "data": {
    "id": "123",
    "name": "Example"
  },
  "meta": {
    "timestamp": "2025-11-13T00:00:00.000Z"
  }
}
```

### エラーレスポンス

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

詳細は[エラーハンドリング](error-handling.md)を参照してください。

---

## ステータスコード

| コード | 説明 |
|-------|------|
| 200 | 成功 |
| 201 | 作成成功 |
| 204 | 成功（レスポンスボディなし） |
| 400 | バリデーションエラー |
| 401 | 認証エラー |
| 403 | 認可エラー（権限不足、権限付与の上限、利用者の状態による制限、CSRF） |
| 404 | リソースが見つからない（案件の閲覧範囲外を含む） |
| 409 | 競合 |
| 422 | 件数等の上限の超過 |
| 429 | レートリミット超過 |
| 500 | サーバー内部エラー |
| 503 | サービス一時停止（2FA 待ちの資格の保存先が使えない等） |

---

## レートリミット

APIリクエストは、送信元 IP（信頼する中継の段数 `TRUST_PROXY_HOPS` で識別）とエンドポイントごとにレートリミットされます。カウンターは Redis に置きます。

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

パスワードリセットの要求がメールアドレスごとの上限を超えたときは、登録の有無を推測させないため、通常と同じ 200 の応答を返します。

**レートリミット超過時のレスポンス:**
```json
{
  "error": "Too many login attempts, please try again later.",
  "retryAfter": "60"
}
```

`error` の文言は制限ごとに異なります。

**ヘッダー:**
```
HTTP/1.1 429 Too Many Requests
Retry-After: 60
RateLimit-Limit: 10
RateLimit-Remaining: 0
RateLimit-Reset: 60
```

---

## ヘルスチェック

### エンドポイント

```bash
GET /health
```

### レスポンス

```json
{
  "status": "ok",
  "timestamp": "2025-11-13T00:00:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

---

## API 情報

### エンドポイント

```bash
GET /api
```

### レスポンス

```json
{
  "message": "ArchiTrack API",
  "version": "1.0.0"
}
```

---

## API カテゴリ

### 認証・認可

- [認証API](authentication.md): ログイン、ログアウト、トークンリフレッシュ、2FA
- [認可API](authorization.md): ロール管理、権限管理、ユーザー管理（棚卸し・無効化・2FA の再設定）、招待、監査ログ、運用設定

### ADR（今後実装予定）

- ADR作成・編集・削除
- ADRバージョン管理
- ADR検索・フィルタリング

---

## 次のステップ

- [認証API](authentication.md): ログイン、2FA、パスワードリセット
- [認可API](authorization.md): ロール管理、権限管理
- [エラーハンドリング](error-handling.md): エラーコード一覧
