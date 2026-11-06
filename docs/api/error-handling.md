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

> **注記:** 実際の応答の形はエラーの発生箇所で異なります。共通のエラーハンドラーを通るエラーは RFC 7807 の Problem Details（`type`・`title`・`status`・`detail`・`instance` に、互換のための `code`・`message` を加えた形）で返します。認証・CSRF・回数制限のミドルウェアは `{ "error": "...", "code": "...", "message": "..." }` の平らな形で返します。画面は `code`（無ければ `error`）で分岐してください。正確な形は Swagger（`backend/docs/api-spec.json`）を参照してください。

```json
{
  "type": "https://api.architrack.com/errors/forbidden",
  "title": "TWO_FACTOR_DISABLE_NOT_ALLOWED",
  "status": 403,
  "detail": "Disabling two-factor authentication is not allowed",
  "instance": "/api/v1/auth/2fa/disable",
  "code": "TWO_FACTOR_DISABLE_NOT_ALLOWED",
  "message": "Disabling two-factor authentication is not allowed"
}
```

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
- `POST /api/v1/auth/refresh`（Cookie のリフレッシュトークンと CSRF トークン）で新しいアクセストークンを取得

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

#### 2FA の要求（エラーではない応答）

2FA 登録済みの利用者のログインは、エラーでなく 200 で次の応答を返します。

```json
{
  "requires2FA": true,
  "challengeToken": "2fa-challenge-from-login",
  "expiresIn": 300
}
```

**対処:**
- `challengeToken` と TOTP コード（`code`）を `POST /api/v1/auth/verify-2fa` に送る（バックアップコードは `POST /api/v1/auth/verify-2fa/backup`）

#### INVALID_CHALLENGE（401）

**原因:**
- 2FA 待ちの資格（`challengeToken`）が無い・期限切れ（5 分）・消費済み

**対処:**
- ログインからやり直す

#### SERVICE_UNAVAILABLE（503）

**原因:**
- 2FA 待ちの資格の保存先（Redis）が使えない

#### TWO_FACTOR_SETUP_REQUIRED（403）

**原因:**
- 2FA が未登録の利用者が、2FA の設定とログアウト以外の API を呼んだ（2FA は全利用者で必須）

**対処:**
- 2FA の設定画面で登録する

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
- 案件の閲覧範囲外の案件・その子リソースを ID で指定した（不在と区別せず、同じ 404 を返す）

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

#### レートリミット超過

```json
{
  "error": "Too many login attempts, please try again later.",
  "retryAfter": "60"
}
```

`error` の文言は制限（一般API・ログイン・リフレッシュ・2FA 検証・パスワードリセット・登録・招待）ごとに異なります。

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

### 認証・認可・監査の是正で加わったエラー

IPA の注意喚起（2026-10-09）を受けた是正（user-authentication 要件32〜64）で、次のエラーを加えました。

#### 利用者の状態

| コード | ステータス | 原因 |
|-------|-----------|------|
| `ACCOUNT_DISABLED` | 401 | 無効化された利用者の要求・リフレッシュ |
| `PASSWORD_CHANGE_REQUIRED` | 403 | 初回のパスワード変更を要する利用者が、パスワード変更とログアウト以外を呼んだ |
| `TWO_FACTOR_SETUP_REQUIRED` | 403 | 2FA 未登録の利用者が、2FA の設定とログアウト以外を呼んだ |
| `TWO_FACTOR_DISABLE_NOT_ALLOWED` | 403 | 利用者自身による 2FA の無効化（常に拒否） |

管理者による 2FA の再設定より前に発行されたアクセストークンは、署名の不正なトークンと同じ 401 で拒否します。

#### リフレッシュ・ログアウト（Cookie・CSRF）

| コード | ステータス | 原因 |
|-------|-----------|------|
| `INVALID_REFRESH_TOKEN` | 401 | リフレッシュトークンが無効・失効済み、または置き換え済みのトークンの再提示（系列ごと失効し Cookie を消す） |
| `REFRESH_TOKEN_EXPIRED` | 401 | リフレッシュトークンの有効期限切れ（Cookie を消す） |
| `CSRF_TOKEN_MISSING` | 403 | Cookie `csrf-token` またはヘッダー `X-CSRF-Token` が無い |
| `CSRF_TOKEN_INVALID` | 403 | Cookie とヘッダーの CSRF トークンが一致しない |
| `CSRF_ORIGIN_MISMATCH` | 403 | `Origin`（無ければ `Referer`）が画面のオリジンと一致しない |

#### 権限付与の上限（403）

| コード | 原因 |
|-------|------|
| `ROLE_PRIORITY_EXCEEDS_ACTOR` | 実行者の保有ロールの優先度の最大値を超えるロールの割り当て・作成・変更・削除・解除 |
| `SYSTEM_ADMIN_REQUIRED` | システム管理者でない実行者による全権限 `*:*` の追加・`admin` ロールの割り当て |
| `PERMISSION_NOT_HELD_BY_ACTOR` | システム管理者でない実行者による、自分が保有しない権限の追加 |
| `SYSTEM_ROLE_RENAME_FORBIDDEN` | システムロールの名前の変更 |
| `SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN` | システムロールの優先度の変更 |
| `TARGET_USER_EXCEEDS_ACTOR` | 上限を超えるロールを持つ他の利用者の削除・無効化・再有効化・2FA の再設定 |

#### 他の利用者の管理

| コード | ステータス | 原因 |
|-------|-----------|------|
| `SELF_RESET_FORBIDDEN` | 403 | 自分自身の 2FA の再設定 |
| `SELF_DEACTIVATION_FORBIDDEN` | 409 | 自分自身の無効化 |
| `LAST_ACTIVE_ADMIN_PROTECTED` | 409 | 最後の有効なシステム管理者の無効化 |
| `ALREADY_IN_STATE` | 409 | 既に無効（無効化）・既に有効（再有効化） |
| `USER_NOT_FOUND` | 404 | 対象の利用者が存在しない |

#### 監査・運用設定

| コード | ステータス | 原因 |
|-------|-----------|------|
| `ARCHIVE_INTEGRITY_FAILED` | 500 | 監査ログのアーカイブの復元で、目録との照合に失敗した月がある（`details.month`） |
| `OPERATIONAL_SETTING_RECORD_FAILED` | 500 | 運用設定の変更を監査に記録できなかった（設定は変わらない） |
| `INVALID_LOG_LEVEL` | 400 | 許可されていないログレベル |

データ出力の記録（`POST /api/v1/audit-logs/exports`）が失敗したときは、画面は出力を中止します。サーバーで生成する出力（監査ログ・工程表・発注・出来高のエクスポート）は、記録に失敗すると 500 で出力を返しません。

---

## エラーハンドリングのベストプラクティス

### クライアント側

1. **ステータスコードで分岐:**
   ```typescript
   if (response.status === 401) {
     // トークンリフレッシュ（ACCOUNT_DISABLED ならログアウトへ）
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
   } else if (error.code === 'TWO_FACTOR_SETUP_REQUIRED') {
     // 2FA の設定画面へ遷移
   } else if (error.code === 'PASSWORD_CHANGE_REQUIRED') {
     // パスワード変更画面へ遷移
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
