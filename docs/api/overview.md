# API概要

このドキュメントでは、ArchiTrack APIの概要を説明します。

---

## ベースURL

### ローカル開発環境

```
http://localhost:3000
```

### 本番環境

```
https://your-backend.railway.app
```

---

## Swagger UI

詳細なAPI仕様は、Swagger UIで確認できます。

**アクセス先:**
- ローカル: http://localhost:3000/docs
- 本番: https://your-backend.railway.app/docs

---

## API バージョン

現在のバージョン: **v1**

すべてのAPIエンドポイントは `/api/v1/` プレフィックスを使用します。

---

## 認証

ArchiTrack APIは、JWT（JSON Web Token）ベースの認証を使用します。

### アクセストークンの取得

```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}
```

**レスポンス:**
```json
{
  "accessToken": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

### アクセストークンの使用

```bash
GET /api/v1/protected-endpoint
Authorization: Bearer <accessToken>
```

詳細は[認証API](authentication.md)を参照してください。

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
| 403 | 認可エラー（権限不足） |
| 404 | リソースが見つからない |
| 429 | レートリミット超過 |
| 500 | サーバー内部エラー |

---

## レートリミット

APIリクエストは、IPアドレスとエンドポイントごとにレートリミットされます。

| エンドポイント | リミット | ウィンドウ |
|--------------|---------|-----------|
| 一般API | 100 req | 15分 |
| ログイン | 5 req | 15分 |
| パスワードリセット | 3 req | 15分 |
| 2FA検証 | 5 req | 15分 |

**レートリミット超過時のレスポンス:**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "retryAfter": 60
  }
}
```

**ヘッダー:**
```
HTTP/1.1 429 Too Many Requests
Retry-After: 60
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
- [認可API](authorization.md): ロール管理、権限管理、ユーザー管理

### ADR（今後実装予定）

- ADR作成・編集・削除
- ADRバージョン管理
- ADR検索・フィルタリング

---

## 次のステップ

- [認証API](authentication.md): ログイン、2FA、パスワードリセット
- [認可API](authorization.md): ロール管理、権限管理
- [エラーハンドリング](error-handling.md): エラーコード一覧
