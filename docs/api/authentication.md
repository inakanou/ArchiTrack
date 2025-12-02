# 認証API

このドキュメントでは、ArchiTrackの認証関連APIを説明します。

---

## ユーザー登録

### エンドポイント

```
POST /api/v1/auth/register
```

### 説明

招待トークンを使用してユーザーを登録します。

### リクエスト

```bash
POST /api/v1/auth/register
Content-Type: application/json

{
  "invitationToken": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "password": "YourStrongPassword123!",
  "displayName": "John Doe"
}
```

### レスポンス

**成功（201 Created）:**
```json
{
  "data": {
    "user": {
      "id": "user-id",
      "email": "john.doe@example.com",
      "displayName": "John Doe"
    }
  }
}
```

---

## ログイン

### エンドポイント

```
POST /api/v1/auth/login
```

### 説明

メールアドレスとパスワードでログインします。

### リクエスト

```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}
```

### レスポンス（2FA無効の場合）

**成功（200 OK）:**
```json
{
  "accessToken": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

### レスポンス（2FA有効の場合）

**2FA要求（200 OK）:**
```json
{
  "tempToken": "temporary-token-for-2fa",
  "requires2FA": true
}
```

---

## 2FA検証

### エンドポイント

```
POST /api/v1/auth/verify-2fa
```

### 説明

TOTPコードで2FA検証を実行します。

### リクエスト

```bash
POST /api/v1/auth/verify-2fa
Content-Type: application/json

{
  "tempToken": "temporary-token-from-login",
  "totpCode": "123456"
}
```

### レスポンス

**成功（200 OK）:**
```json
{
  "accessToken": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

---

## トークンリフレッシュ

### エンドポイント

```
POST /api/v1/auth/refresh
```

### 説明

リフレッシュトークンを使用して新しいアクセストークンを取得します。

### リクエスト

```bash
POST /api/v1/auth/refresh
Authorization: Bearer <refreshToken>
```

### レスポンス

**成功（200 OK）:**
```json
{
  "accessToken": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

---

## プロフィール取得

### エンドポイント

```
GET /api/v1/auth/me
```

### 説明

ログイン中のユーザー情報を取得します。

### リクエスト

```bash
GET /api/v1/auth/me
Authorization: Bearer <accessToken>
```

### レスポンス

**成功（200 OK）:**
```json
{
  "data": {
    "id": "user-id",
    "email": "user@example.com",
    "displayName": "John Doe",
    "twoFactorEnabled": true,
    "roles": [
      {
        "id": "role-id",
        "name": "editor",
        "description": "Content editor"
      }
    ]
  }
}
```

---

## ログアウト

### エンドポイント

```
POST /api/v1/auth/logout
```

### 説明

現在のセッションをログアウトします。

### リクエスト

```bash
POST /api/v1/auth/logout
Authorization: Bearer <accessToken>
```

### レスポンス

**成功（204 No Content）:**

---

## 全デバイスログアウト

### エンドポイント

```
POST /api/v1/auth/logout-all
```

### 説明

すべてのデバイスからログアウトします。

### リクエスト

```bash
POST /api/v1/auth/logout-all
Authorization: Bearer <accessToken>
```

### レスポンス

**成功（204 No Content）:**

---

## 二段階認証（2FA）

### 2FAセットアップ

#### エンドポイント

```
POST /api/v1/auth/2fa/setup
```

#### 説明

2FAセットアップ情報（QRコード、バックアップコード）を取得します。

#### リクエスト

```bash
POST /api/v1/auth/2fa/setup
Authorization: Bearer <accessToken>
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "data": {
    "qrCodeUrl": "data:image/png;base64,...",
    "secret": "BASE32_ENCODED_SECRET",
    "backupCodes": [
      "ABCD1234",
      "EFGH5678",
      ...
    ]
  }
}
```

### 2FA有効化

#### エンドポイント

```
POST /api/v1/auth/2fa/enable
```

#### 説明

TOTPコードを検証して2FAを有効化します。

#### リクエスト

```bash
POST /api/v1/auth/2fa/enable
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "totpCode": "123456"
}
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "data": {
    "twoFactorEnabled": true
  }
}
```

### 2FA無効化

#### エンドポイント

```
POST /api/v1/auth/2fa/disable
```

#### 説明

TOTPコードを検証して2FAを無効化します。

#### リクエスト

```bash
POST /api/v1/auth/2fa/disable
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "totpCode": "123456"
}
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "data": {
    "twoFactorEnabled": false
  }
}
```

### バックアップコード再生成

#### エンドポイント

```
POST /api/v1/auth/2fa/backup-codes/regenerate
```

#### 説明

新しいバックアップコードを生成します（古いコードは無効化されます）。

#### リクエスト

```bash
POST /api/v1/auth/2fa/backup-codes/regenerate
Authorization: Bearer <accessToken>
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "data": {
    "backupCodes": [
      "NEW1ABCD",
      "NEW2EFGH",
      ...
    ]
  }
}
```

---

## パスワード管理

### パスワードリセット要求

#### エンドポイント

```
POST /api/v1/auth/password/reset-request
```

#### 説明

パスワードリセット用のトークンをメールで送信します。

#### リクエスト

```bash
POST /api/v1/auth/password/reset-request
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### レスポンス

**成功（204 No Content）:**

（セキュリティのため、メールアドレスの存在有無に関わらず成功を返します）

### リセットトークン検証

#### エンドポイント

```
POST /api/v1/auth/password/verify-reset
```

#### 説明

パスワードリセットトークンの有効性を検証します。

#### リクエスト

```bash
POST /api/v1/auth/password/verify-reset
Content-Type: application/json

{
  "resetToken": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "data": {
    "valid": true
  }
}
```

### パスワードリセット実行

#### エンドポイント

```
POST /api/v1/auth/password/reset
```

#### 説明

新しいパスワードを設定します。

#### リクエスト

```bash
POST /api/v1/auth/password/reset
Content-Type: application/json

{
  "resetToken": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "newPassword": "NewStrongPassword123!"
}
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "data": {
    "success": true
  }
}
```

---

## 次のステップ

- [認可API](authorization.md): ロール管理、権限管理
- [エラーハンドリング](error-handling.md): エラーコード一覧
- [API概要](overview.md): API全体の概要
