# エラーハンドリング

このドキュメントでは、ArchiTrack APIのエラーレスポンス形式とエラーコード一覧を説明します。

---

## エラーレスポンス形式

### 基本形式

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "User-friendly error message",
    "details": []
  }
}
```

### フィールド説明

| フィールド | 型 | 説明 |
|-----------|---|------|
| `code` | string | エラーコード（大文字スネークケース） |
| `message` | string | ユーザー向けのエラーメッセージ |
| `details` | array | 詳細情報（バリデーションエラー等） |

---

## HTTPステータスコード

| コード | 説明 | 用途 |
|-------|------|------|
| 200 | OK | 成功 |
| 201 | Created | リソース作成成功 |
| 204 | No Content | 成功（レスポンスボディなし） |
| 400 | Bad Request | バリデーションエラー |
| 401 | Unauthorized | 認証エラー（トークン不正・期限切れ） |
| 403 | Forbidden | 認可エラー（権限不足） |
| 404 | Not Found | リソースが見つからない |
| 409 | Conflict | リソースの競合（既存データとの衝突） |
| 429 | Too Many Requests | レートリミット超過 |
| 500 | Internal Server Error | サーバー内部エラー |
| 503 | Service Unavailable | サービス一時停止 |

---

## エラーコード一覧

### 認証エラー（401）

#### INVALID_CREDENTIALS

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

**原因:**
- メールアドレスまたはパスワードが間違っている

#### TOKEN_EXPIRED

```json
{
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "Access token has expired"
  }
}
```

**原因:**
- アクセストークンの有効期限が切れている

**対処:**
- リフレッシュトークンを使用して新しいアクセストークンを取得

#### INVALID_TOKEN

```json
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Invalid or malformed token"
  }
}
```

**原因:**
- トークンの署名が不正
- トークンの形式が間違っている

#### ACCOUNT_LOCKED

```json
{
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Account is temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.",
    "retryAfter": 900
  }
}
```

**原因:**
- ログイン失敗回数が5回を超えた

**対処:**
- 15分後に再試行

---

### 認可エラー（403）

#### INSUFFICIENT_PERMISSIONS

```json
{
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "You do not have permission to perform this action",
    "requiredPermission": "adr:delete"
  }
}
```

**原因:**
- 必要な権限を持っていない

---

### バリデーションエラー（400）

#### VALIDATION_ERROR

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      },
      {
        "field": "password",
        "message": "Password must be at least 12 characters long"
      }
    ]
  }
}
```

**原因:**
- リクエストボディのバリデーションエラー

#### WEAK_PASSWORD

```json
{
  "error": {
    "code": "WEAK_PASSWORD",
    "message": "Password does not meet security requirements",
    "details": [
      "Password must be at least 12 characters long",
      "Password must contain at least 3 of: uppercase, lowercase, numbers, special characters"
    ]
  }
}
```

**原因:**
- パスワードが複雑性要件を満たしていない

#### PASSWORD_PREVIOUSLY_USED

```json
{
  "error": {
    "code": "PASSWORD_PREVIOUSLY_USED",
    "message": "This password has been used recently. Please choose a different password."
  }
}
```

**原因:**
- 過去3回に使用されたパスワードを設定しようとしている

#### COMPROMISED_PASSWORD

```json
{
  "error": {
    "code": "COMPROMISED_PASSWORD",
    "message": "This password has been found in a data breach. Please choose a different password."
  }
}
```

**原因:**
- HIBP（Have I Been Pwned）データベースで漏洩が確認されているパスワード

---

### 2FAエラー（400/401）

#### INVALID_TOTP_CODE

```json
{
  "error": {
    "code": "INVALID_TOTP_CODE",
    "message": "Invalid or expired TOTP code"
  }
}
```

**原因:**
- TOTPコードが間違っている
- 時間ウィンドウ外（90秒以上経過）

#### TWO_FACTOR_REQUIRED

```json
{
  "error": {
    "code": "TWO_FACTOR_REQUIRED",
    "message": "Two-factor authentication is required",
    "tempToken": "temporary-token"
  }
}
```

**原因:**
- 2FAが有効なユーザーがログインしようとした

**対処:**
- `tempToken`と`totpCode`を使用して `/api/v1/auth/verify-2fa` を呼び出す

---

### リソースエラー（404/409）

#### NOT_FOUND

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "resourceType": "User",
    "resourceId": "user-id-123"
  }
}
```

**原因:**
- 指定されたリソースが存在しない

#### RESOURCE_ALREADY_EXISTS

```json
{
  "error": {
    "code": "RESOURCE_ALREADY_EXISTS",
    "message": "A resource with this identifier already exists",
    "field": "email",
    "value": "user@example.com"
  }
}
```

**原因:**
- ユニーク制約違反（例: 同じメールアドレスのユーザーが既に存在）

---

### レートリミットエラー（429）

#### RATE_LIMIT_EXCEEDED

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

**原因:**
- レートリミットを超過

**対処:**
- `retryAfter`秒後に再試行

---

### サーバーエラー（500）

#### INTERNAL_SERVER_ERROR

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred. Please try again later.",
    "requestId": "req-12345"
  }
}
```

**原因:**
- サーバー内部エラー

**対処:**
- しばらく時間をおいて再試行
- 問題が続く場合はサポートに連絡（`requestId`を含める）

---

## エラーハンドリングのベストプラクティス

### クライアント側

1. **ステータスコードで分岐:**
   ```typescript
   if (response.status === 401) {
     // トークンリフレッシュ
   } else if (response.status === 403) {
     // 権限エラー表示
   } else if (response.status === 429) {
     // レートリミットエラー表示
   }
   ```

2. **エラーコードで詳細処理:**
   ```typescript
   if (error.code === 'INVALID_CREDENTIALS') {
     // ログインフォームにエラー表示
   } else if (error.code === 'ACCOUNT_LOCKED') {
     // ロック時間を表示
   }
   ```

3. **バリデーションエラーをフィールドにマップ:**
   ```typescript
   error.details.forEach(detail => {
     setFieldError(detail.field, detail.message);
   });
   ```

---

## 次のステップ

- [認証API](authentication.md): ログイン、2FA、パスワードリセット
- [認可API](authorization.md): ロール管理、権限管理
- [API概要](overview.md): API全体の概要
