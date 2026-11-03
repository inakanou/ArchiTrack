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
  "accessToken": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "displayName": "John Doe",
    "roles": ["user"],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "twoFactorEnabled": true,
    "mustChangePassword": false
  }
}
```

リフレッシュトークンは応答本文に含めず、`Set-Cookie` の HttpOnly Cookie `refreshToken`（`SameSite=Strict`、Path `/api/v1/auth`、本番は `Secure`）だけで渡します。アクセストークンは画面のメモリだけに保持します。

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

### レスポンス（2FA未登録の場合）

**成功（200 OK）:**
```json
{
  "type": "SUCCESS",
  "accessToken": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "displayName": "John Doe",
    "roles": ["user"],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "twoFactorEnabled": false,
    "mustChangePassword": false
  }
}
```

リフレッシュトークンは応答本文に含めず、`Set-Cookie` の HttpOnly Cookie `refreshToken`（`SameSite=Strict`、Path `/api/v1/auth`、本番は `Secure`）だけで渡します。アクセストークンは画面のメモリだけに保持します。2FA は全利用者で必須のため、`twoFactorEnabled` が `false` の利用者は 2FA の設定画面へ進み、設定とログアウト以外の API は 403（`TWO_FACTOR_SETUP_REQUIRED`）になります。

### レスポンス（2FA有効の場合）

**2FA要求（200 OK）:**
```json
{
  "requires2FA": true,
  "challengeToken": "2fa-challenge-from-login",
  "expiresIn": 300
}
```

`challengeToken` はパスワードの検証の成功に結び付いた 2FA 待ちの資格です（不透明な文字列、5 分・一回限り）。応答に利用者 ID は含みません。資格の保存先（Redis）が使えないときは 503（`SERVICE_UNAVAILABLE`）を返します。

---

## 2FA検証

### エンドポイント

```
POST /api/v1/auth/verify-2fa
```

### 説明

TOTPコードで2FA検証を実行します。ログインの応答の `challengeToken` を必ず送ります。メールアドレスやアクセストークン・リフレッシュトークンは資格として受理しません。成功で資格を消費します。バックアップコードの検証（`POST /api/v1/auth/verify-2fa/backup`、本文は `{ "challengeToken", "backupCode" }`）も同じ資格を要求します。

### リクエスト

```bash
POST /api/v1/auth/verify-2fa
Content-Type: application/json

{
  "challengeToken": "2fa-challenge-from-login",
  "code": "123456"
}
```

資格が無い・期限切れ・消費済みのときは 401（`INVALID_CHALLENGE`）、資格の保存先が使えないときは 503（`SERVICE_UNAVAILABLE`）を返します。

### レスポンス

**成功（200 OK）:**
```json
{
  "accessToken": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "displayName": "John Doe",
    "roles": ["user"],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "twoFactorEnabled": true,
    "mustChangePassword": false
  }
}
```

リフレッシュトークンは応答本文に含めず、`Set-Cookie` の HttpOnly Cookie `refreshToken`（`SameSite=Strict`、Path `/api/v1/auth`、本番は `Secure`）だけで渡します。アクセストークンは画面のメモリだけに保持します。

---

## トークンリフレッシュ

### エンドポイント

```
POST /api/v1/auth/refresh
```

### 説明

Cookie のリフレッシュトークンを使用して新しいアクセストークンを取得します。本文は読みません。CSRF の二重送信（Cookie `csrf-token` とヘッダー `X-CSRF-Token` の一致。値は `GET /csrf-token` で得る）と、`Origin`（無ければ `Referer`）が画面のオリジンと一致することを確かめます。成功するとリフレッシュトークンをローテーションし、後継を `Set-Cookie` で渡します。置き換え済みのリフレッシュトークンが再び提示されると、その系列を全て失効させ、401（`INVALID_REFRESH_TOKEN`）と Cookie の消去を返します。

### リクエスト

```bash
POST /api/v1/auth/refresh
Cookie: refreshToken=<リフレッシュトークン>; csrf-token=<CSRF トークン>
X-CSRF-Token: <CSRF トークン>
Origin: <画面のオリジン>
```

### レスポンス

**成功（200 OK）:**
```json
{
  "accessToken": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "displayName": "John Doe",
    "roles": ["user"],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "twoFactorEnabled": true,
    "mustChangePassword": false
  }
}
```

Cookie が無いときは 400、CSRF トークンや Origin が合わないときは 403 を返します。

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

現在のセッションをログアウトします。Cookie のリフレッシュトークンの系列を失効させ、Cookie を消します。リフレッシュと同じく CSRF の二重送信と Origin の照合を通します。

### リクエスト

```bash
POST /api/v1/auth/logout
Authorization: Bearer <accessToken>
Cookie: refreshToken=<リフレッシュトークン>; csrf-token=<CSRF トークン>
X-CSRF-Token: <CSRF トークン>
Origin: <画面のオリジン>
```

### レスポンス

**成功（200 OK）:**
```json
{
  "message": "Logged out successfully"
}
```

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

**成功（200 OK）:**
```json
{
  "message": "Logged out from all devices successfully"
}
```

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

### 2FA無効化（拒否）

#### エンドポイント

```
POST /api/v1/auth/2fa/disable
```

#### 説明

2FA は全ユーザーで必須のため、利用者自身による無効化の要求は常に拒否します（要件34.6）。第二要素を失った場合の復旧は管理者による 2FA の再設定で、端末の交換は現在の TOTP コードによる再登録で行います。

#### リクエスト

```bash
POST /api/v1/auth/2fa/disable
Authorization: Bearer <accessToken>
```

#### レスポンス

**拒否（403 Forbidden）:**
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

**成功（200 OK）:**
```json
{
  "message": "If an account exists, a password reset email has been sent"
}
```

（セキュリティのため、メールアドレスの登録の有無に関わらず同じ応答を返します）

### リセットトークン検証

#### エンドポイント

```
POST /api/v1/auth/password/verify-reset
```

#### 説明

パスワードリセットトークンの有効性を検証します。トークンは URL に載せず、要求本文の `token` で送ります（メールのリンクはトークンを URL のフラグメント `#token=…` に置き、画面がそれを読んで本文で送ります）。

#### リクエスト

```bash
POST /api/v1/auth/password/verify-reset
Content-Type: application/json

{
  "token": "<メールのリンクのフラグメントで受け取ったトークン>"
}
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "valid": true
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
  "token": "<メールのリンクのフラグメントで受け取ったトークン>",
  "newPassword": "NewStrongPassword123!"
}
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "message": "Password reset successfully"
}
```

---

## 次のステップ

- [認可API](authorization.md): ロール管理、権限管理
- [エラーハンドリング](error-handling.md): エラーコード一覧
- [API概要](overview.md): API全体の概要
