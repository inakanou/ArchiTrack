# 認可API

このドキュメントでは、ArchiTrackのロール・権限管理、ユーザー管理、招待管理、監査ログ関連のAPIを説明します。

---

## ロール管理（管理者のみ）

### ロール一覧取得

#### エンドポイント

```
GET /api/v1/roles
```

#### リクエスト

```bash
GET /api/v1/roles
Authorization: Bearer <accessToken>
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "data": [
    {
      "id": "role-id-1",
      "name": "admin",
      "description": "System Administrator",
      "priority": 1000,
      "permissions": [
        {
          "id": "perm-id-1",
          "resource": "*",
          "action": "*"
        }
      ]
    },
    {
      "id": "role-id-2",
      "name": "editor",
      "description": "Content Editor",
      "priority": 100,
      "permissions": [
        {
          "id": "perm-id-2",
          "resource": "adr",
          "action": "create"
        }
      ]
    }
  ]
}
```

### ロール作成

#### エンドポイント

```
POST /api/v1/roles
```

#### リクエスト

```bash
POST /api/v1/roles
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "moderator",
  "description": "Content Moderator",
  "priority": 50
}
```

#### レスポンス

**成功（201 Created）:**
```json
{
  "data": {
    "id": "new-role-id",
    "name": "moderator",
    "description": "Content Moderator",
    "priority": 50
  }
}
```

### ロール詳細取得

#### エンドポイント

```
GET /api/v1/roles/{id}
```

#### リクエスト

```bash
GET /api/v1/roles/role-id-1
Authorization: Bearer <accessToken>
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "data": {
    "id": "role-id-1",
    "name": "admin",
    "description": "System Administrator",
    "priority": 1000,
    "permissions": [...]
  }
}
```

### ロール更新

#### エンドポイント

```
PUT /api/v1/roles/{id}
```

#### リクエスト

```bash
PUT /api/v1/roles/role-id-1
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "description": "Updated description",
  "priority": 900
}
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "data": {
    "id": "role-id-1",
    "name": "admin",
    "description": "Updated description",
    "priority": 900
  }
}
```

### ロール削除

#### エンドポイント

```
DELETE /api/v1/roles/{id}
```

#### リクエスト

```bash
DELETE /api/v1/roles/role-id-1
Authorization: Bearer <accessToken>
```

#### レスポンス

**成功（204 No Content）:**

### ロールに権限を追加

#### エンドポイント

```
POST /api/v1/roles/{id}/permissions/{permissionId}
```

#### リクエスト

```bash
POST /api/v1/roles/role-id-1/permissions/perm-id-2
Authorization: Bearer <accessToken>
```

#### レスポンス

**成功（204 No Content）:**

### ロールから権限を削除

#### エンドポイント

```
DELETE /api/v1/roles/{id}/permissions/{permissionId}
```

#### リクエスト

```bash
DELETE /api/v1/roles/role-id-1/permissions/perm-id-2
Authorization: Bearer <accessToken>
```

#### レスポンス

**成功（204 No Content）:**

---

## 権限管理（管理者のみ）

### 権限一覧取得

#### エンドポイント

```
GET /api/v1/permissions
```

#### リクエスト

```bash
GET /api/v1/permissions
Authorization: Bearer <accessToken>
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "data": [
    {
      "id": "perm-id-1",
      "resource": "*",
      "action": "*",
      "description": "Full access to all resources"
    },
    {
      "id": "perm-id-2",
      "resource": "adr",
      "action": "read",
      "description": "Read ADRs"
    },
    {
      "id": "perm-id-3",
      "resource": "adr",
      "action": "create",
      "description": "Create ADRs"
    }
  ]
}
```

---

## ユーザー管理（管理者のみ）

### ユーザーにロールを追加

#### エンドポイント

```
POST /api/v1/users/{id}/roles/{roleId}
```

#### リクエスト

```bash
POST /api/v1/users/user-id-1/roles/role-id-2
Authorization: Bearer <accessToken>
```

#### レスポンス

**成功（204 No Content）:**

### ユーザーからロールを削除

#### エンドポイント

```
DELETE /api/v1/users/{id}/roles/{roleId}
```

#### リクエスト

```bash
DELETE /api/v1/users/user-id-1/roles/role-id-2
Authorization: Bearer <accessToken>
```

#### レスポンス

**成功（204 No Content）:**

### ユーザーのロール一覧取得

#### エンドポイント

```
GET /api/v1/users/{id}/roles
```

#### リクエスト

```bash
GET /api/v1/users/user-id-1/roles
Authorization: Bearer <accessToken>
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "data": [
    {
      "id": "role-id-1",
      "name": "admin",
      "description": "System Administrator"
    },
    {
      "id": "role-id-2",
      "name": "editor",
      "description": "Content Editor"
    }
  ]
}
```

---

## 招待管理（管理者のみ）

### ユーザー招待

#### エンドポイント

```
POST /api/v1/invitations
```

#### リクエスト

```bash
POST /api/v1/invitations
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "email": "newuser@example.com"
}
```

#### レスポンス

**成功（201 Created）:**
```json
{
  "data": {
    "id": "invitation-id",
    "email": "newuser@example.com",
    "token": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "expiresAt": "2025-11-20T00:00:00.000Z",
    "status": "pending"
  }
}
```

### 招待一覧取得

#### エンドポイント

```
GET /api/v1/invitations
```

#### リクエスト

```bash
GET /api/v1/invitations
Authorization: Bearer <accessToken>
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "data": [
    {
      "id": "invitation-id-1",
      "email": "user1@example.com",
      "status": "pending",
      "expiresAt": "2025-11-20T00:00:00.000Z",
      "createdAt": "2025-11-13T00:00:00.000Z"
    },
    {
      "id": "invitation-id-2",
      "email": "user2@example.com",
      "status": "accepted",
      "acceptedAt": "2025-11-14T00:00:00.000Z"
    }
  ]
}
```

### 招待詳細取得

#### エンドポイント

```
GET /api/v1/invitations/{id}
```

#### リクエスト

```bash
GET /api/v1/invitations/invitation-id-1
Authorization: Bearer <accessToken>
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "data": {
    "id": "invitation-id-1",
    "email": "user1@example.com",
    "status": "pending",
    "expiresAt": "2025-11-20T00:00:00.000Z",
    "createdAt": "2025-11-13T00:00:00.000Z"
  }
}
```

### 招待取り消し

#### エンドポイント

```
DELETE /api/v1/invitations/{id}
```

#### リクエスト

```bash
DELETE /api/v1/invitations/invitation-id-1
Authorization: Bearer <accessToken>
```

#### レスポンス

**成功（204 No Content）:**

### 招待トークン検証（公開エンドポイント）

#### エンドポイント

```
POST /api/v1/invitations/verify
```

#### リクエスト

```bash
POST /api/v1/invitations/verify
Content-Type: application/json

{
  "token": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "data": {
    "valid": true,
    "email": "newuser@example.com"
  }
}
```

---

## 監査ログ（管理者のみ）

### 監査ログ取得

#### エンドポイント

```
GET /api/v1/audit-logs
```

#### クエリパラメータ

| パラメータ | 型 | 説明 | デフォルト |
|-----------|---|------|-----------|
| `page` | number | ページ番号 | 1 |
| `limit` | number | 1ページあたりの件数 | 50 |
| `action` | string | アクションフィルター | - |
| `actorId` | string | 実行者フィルター | - |
| `startDate` | string (ISO 8601) | 開始日時 | - |
| `endDate` | string (ISO 8601) | 終了日時 | - |

#### リクエスト

```bash
GET /api/v1/audit-logs?page=1&limit=50&action=ADR_CREATED
Authorization: Bearer <accessToken>
```

#### レスポンス

**成功（200 OK）:**
```json
{
  "data": [
    {
      "id": "log-id-1",
      "action": "ADR_CREATED",
      "actorId": "user-id-1",
      "actorEmail": "user@example.com",
      "resourceType": "ADR",
      "resourceId": "adr-id-1",
      "metadata": {
        "title": "ADR-001: Use PostgreSQL"
      },
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "createdAt": "2025-11-13T00:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 120,
    "totalPages": 3
  }
}
```

### 監査ログエクスポート（CSV）

#### エンドポイント

```
GET /api/v1/audit-logs/export
```

#### クエリパラメータ

上記と同じ（page、limit以外）

#### リクエスト

```bash
GET /api/v1/audit-logs/export?startDate=2025-11-01&endDate=2025-11-30
Authorization: Bearer <accessToken>
```

#### レスポンス

**成功（200 OK）:**
```csv
id,action,actorId,actorEmail,resourceType,resourceId,metadata,ipAddress,userAgent,createdAt
log-id-1,ADR_CREATED,user-id-1,user@example.com,ADR,adr-id-1,"{""title"":""ADR-001""}",192.168.1.1,Mozilla/5.0...,2025-11-13T00:00:00.000Z
...
```

**ヘッダー:**
```
Content-Type: text/csv
Content-Disposition: attachment; filename="audit-logs-2025-11-13.csv"
```

---

## 次のステップ

- [認証API](authentication.md): ログイン、2FA、パスワードリセット
- [エラーハンドリング](error-handling.md): エラーコード一覧
- [API概要](overview.md): API全体の概要
