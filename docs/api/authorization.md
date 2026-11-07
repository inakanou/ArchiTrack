# 認可API

このドキュメントでは、ArchiTrackのロール・権限管理、ユーザー管理（棚卸し・無効化・2FA の再設定を含む）、招待管理、監査ログ、運用設定関連のAPIと、業務 API に掛かる案件の閲覧範囲を説明します。

詳細なリクエスト・レスポンスの定義は Swagger UI（開発・試験の環境の `/docs`）と `backend/docs/api-spec.json` を参照してください。

---

## 共通事項

### 認証と利用者の状態

全てのエンドポイント（招待トークンの検証を除く）は `Authorization: Bearer <accessToken>` を要求します。認証の後、権限の判定より前に利用者の状態を照合します。

| 状態 | 応答 |
|------|------|
| 無効化された利用者 | 401（`ACCOUNT_DISABLED`） |
| 初回のパスワード変更を要する | 403（`PASSWORD_CHANGE_REQUIRED`） |
| 2FA 未登録 | 403（`TWO_FACTOR_SETUP_REQUIRED`） |
| 必要な権限が無い | 403（監査 `PERMISSION_CHECK_FAILED`） |

### 主な権限

| 権限 | 用途 |
|------|------|
| `role:read` / `role:create` / `role:update` / `role:delete` | ロールの参照・作成・変更（権限の追加・削除を含む）・削除 |
| `permission:read` | 権限一覧の参照 |
| `user:read` | ユーザー一覧・ユーザーのロール・棚卸しの参照 |
| `user:update` | ユーザーへのロールの割り当て・解除 |
| `user:delete` | ユーザーの削除 |
| `user:manage` | 他の利用者の無効化・再有効化・2FA の再設定 |
| `user:invite` | 招待の作成・一覧・取り消し・再送信 |
| `audit:read` | 監査ログの参照・エクスポート・アーカイブの復元 |
| `ops:manage` | 運用設定（ログレベル）の参照・変更 |
| `project:read_all` | 全案件の閲覧（案件の閲覧範囲を超える） |
| `*:*` | 全権限（システム管理者ロール `admin`） |

一般ユーザーのロール `user` には `user:read`・`project:read_all`・`ops:manage` を割り当てません。

### 権限付与の上限

実行者の上限は、保有ロールの優先度（`priority`）の最大値です。上限と同じ優先度は上限を超えません。システム管理者ロールの優先度は 100 で、100 を超える優先度の指定は 400（入力の検証）になります。上限による拒否は 403 で、`code` に次の種別を載せ、監査に `PERMISSION_CHECK_FAILED` として記録します。

| code | 拒否する操作 |
|------|-------------|
| `ROLE_PRIORITY_EXCEEDS_ACTOR` | 上限を超える優先度のロールの割り当て・作成・優先度の変更、上限より上のロールの変更・削除・権限の追加・取り外し、上限を超えるロールの他の利用者からの解除 |
| `SYSTEM_ADMIN_REQUIRED` | システム管理者でない実行者による全権限 `*:*` の追加・`admin` ロールの割り当て |
| `PERMISSION_NOT_HELD_BY_ACTOR` | システム管理者でない実行者による、自分が保有しない権限（ワイルドカードの照合で包含しない権限）のロールへの追加 |
| `SYSTEM_ROLE_RENAME_FORBIDDEN` | システムロールの名前の変更 |
| `SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN` | システムロールの優先度の変更（実行者によらない） |
| `TARGET_USER_EXCEEDS_ACTOR` | 上限を超えるロールを持つ他の利用者の削除・無効化・再有効化・2FA の再設定 |

---

## ロール管理

### ロール一覧取得

```
GET /api/v1/roles
```

権限: `role:read`

**成功（200 OK）:** ロールの配列。各ロールは `id`・`name`・`description`・`priority`・`isSystem`・`createdAt`・`updatedAt` と、統計 `userCount`・`permissionCount` を持ちます。

```json
[
  {
    "id": "role-id-1",
    "name": "admin",
    "description": "System Administrator",
    "priority": 100,
    "isSystem": true,
    "userCount": 1,
    "permissionCount": 1
  }
]
```

### ロール作成

```
POST /api/v1/roles
```

権限: `role:create`

```bash
POST /api/v1/roles
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "Project Manager",
  "description": "Manages projects",
  "priority": 50
}
```

**成功（201 Created）:** 作成したロール

**エラー:** 400（優先度が 100 を超える等）、403（上限を超える優先度。`ROLE_PRIORITY_EXCEEDS_ACTOR`）、409（ロール名の重複）

### ロール更新

```
PATCH /api/v1/roles/{id}
```

権限: `role:update`

```bash
PATCH /api/v1/roles/role-id-2
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "description": "Updated description",
  "priority": 40,
  "expectedUpdatedAt": "2026-11-01T00:00:00.000Z"
}
```

`expectedUpdatedAt`（任意）は楽観的ロックの版です。取得時の `updatedAt` を渡し、古いときは 409（`ROLE_CONFLICT`）になります。

**成功（200 OK）:** 更新後のロール

**エラー:** 403（システムロールの名前・優先度の変更、上限を超える優先度、上限より上のロールの変更）、404、409（`ROLE_NAME_CONFLICT`・`ROLE_CONFLICT`）

### ロール削除

```
DELETE /api/v1/roles/{id}
```

権限: `role:delete`

**成功（204 No Content）**

**エラー:** 400（システムロール・使用中のロール）、403（上限より上のロール。`ROLE_PRIORITY_EXCEEDS_ACTOR`）、404

### ロールの権限一覧取得

```
GET /api/v1/roles/{id}/permissions
```

権限: `role:read`

### ロールに権限を追加

```
POST /api/v1/roles/{id}/permissions
```

権限: `role:update`

```bash
POST /api/v1/roles/role-id-2/permissions
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "permissionIds": ["permission-1", "permission-2"]
}
```

単一の追加は `{ "permissionId": "permission-1" }` でも送れます。

**成功（204 No Content）**

**エラー:** 403（`SYSTEM_ADMIN_REQUIRED`・`PERMISSION_NOT_HELD_BY_ACTOR`・`ROLE_PRIORITY_EXCEEDS_ACTOR`）、404

### ロールから権限を削除

```
DELETE /api/v1/roles/{id}/permissions/{permissionId}
```

権限: `role:update`

**成功（204 No Content）**

**エラー:** 400（システムロールの必須権限）、403（上限より上のロール。`ROLE_PRIORITY_EXCEEDS_ACTOR`）、404

---

## 権限管理

### 権限一覧取得

```
GET /api/v1/permissions
```

権限: `permission:read`

**成功（200 OK）:** 権限の配列（リソース・アクション順）

```json
[
  {
    "id": "perm-id-1",
    "resource": "*",
    "action": "*",
    "description": "Full access to all resources"
  },
  {
    "id": "perm-id-2",
    "resource": "project",
    "action": "read_all",
    "description": "..."
  }
]
```

---

## ユーザー管理

### ユーザー一覧取得

```
GET /api/v1/users
```

権限: `user:read`

**成功（200 OK）:** ユーザーの配列（`id`・`email`・`displayName`・`createdAt`・`roles`）

### ユーザーにロールを追加

```
POST /api/v1/users/{id}/roles
```

権限: `user:update`

```bash
POST /api/v1/users/user-id-1/roles
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "roleIds": ["role-id-2"]
}
```

**成功（204 No Content）**

**エラー:** 403（`ROLE_PRIORITY_EXCEEDS_ACTOR`・`SYSTEM_ADMIN_REQUIRED`）、404

### ユーザーからロールを削除

```
DELETE /api/v1/users/{id}/roles/{roleId}
```

権限: `user:update`

**成功（204 No Content）**

**エラー:** 400（最後の有効な管理者のロール）、403（上限を超えるロールの他の利用者からの解除。`ROLE_PRIORITY_EXCEEDS_ACTOR`）、404

最後の管理者の判定では、無効化された管理者を数えません。

### ユーザーのロール一覧取得

```
GET /api/v1/users/{id}/roles
```

権限: `user:read`

### ユーザー削除

```
DELETE /api/v1/users/{id}
```

権限: `user:delete`

削除の前に監査ログ（`USER_DELETED`）へ記録します。

**成功（204 No Content）**

**エラー:** 400（自分自身・最後の管理者）、403（上限を超えるロールを持つユーザー。`TARGET_USER_EXCEEDS_ACTOR`）、404

### 棚卸しの一覧

```
GET /api/v1/users/inventory
```

権限: `user:read`

| パラメータ | 型 | 説明 | デフォルト |
|-----------|---|------|-----------|
| `status` | `active` / `inactive` | 状態で絞り込む | - |
| `inactiveDaysAtLeast` | number | 最終ログイン（実績が無ければ作成日時）からの経過日数がこの値以上 | - |
| `page` | number | ページ番号 | 1 |
| `limit` | number | 1ページあたりの件数（最大 100） | 20 |

並び順は、ログインの実績が無い利用者が先、続いて最終ログインの古い順です。

**成功（200 OK）:**
```json
{
  "data": [
    {
      "id": "user-id-1",
      "displayName": "John Doe",
      "email": "user@example.com",
      "roles": ["user"],
      "status": "active",
      "twoFactorEnabled": true,
      "lastLoginAt": "2026-11-01T00:00:00.000Z",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "invitedBy": { "id": "admin-id", "displayName": "Admin" }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### 利用者の無効化

```
POST /api/v1/users/{id}/deactivate
```

権限: `user:manage`

```bash
POST /api/v1/users/user-id-1/deactivate
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "reason": "退職のため"
}
```

対象者の全てのリフレッシュトークンを失効させ、以後の対象者の API とリフレッシュは 401（`ACCOUNT_DISABLED`）になります。監査（`USER_DEACTIVATED`）に実行者・対象・理由を記録し、全システム管理者へ通知します。

**成功（204 No Content）**

**エラー:** 400（理由の欠落）、403（`TARGET_USER_EXCEEDS_ACTOR`）、404（`USER_NOT_FOUND`）、409（自分自身 `SELF_DEACTIVATION_FORBIDDEN`、最後の有効なシステム管理者 `LAST_ACTIVE_ADMIN_PROTECTED`、既に無効 `ALREADY_IN_STATE`）

### 利用者の再有効化

```
POST /api/v1/users/{id}/reactivate
```

権限: `user:manage`。本文は無効化と同じく `{ "reason": "..." }` です。監査（`USER_REACTIVATED`）に記録し、全システム管理者へ通知します。

**成功（204 No Content）**

**エラー:** 400、403（`TARGET_USER_EXCEEDS_ACTOR`）、404、409（既に有効 `ALREADY_IN_STATE`）

90 日の自動無効化で全てのシステム管理者が無効になったときは、サーバー上の `npm run user:reactivate -- --email <メールアドレス>`（backend ディレクトリ）で復旧します。

### 管理者による 2FA の再設定

```
POST /api/v1/users/{id}/2fa/reset
```

権限: `user:manage`

対象者の 2FA の秘密鍵とバックアップコードを消して未登録にし、全てのリフレッシュトークンを失効させます。再設定より前に発行された対象者のアクセストークンも拒否されます。対象者は次の要求から 2FA の設定だけを行えます。監査（`TWO_FACTOR_RESET_BY_ADMIN`）に実行者と対象者を記録します。

**成功（204 No Content）**

**エラー:** 403（自分自身 `SELF_RESET_FORBIDDEN`、`TARGET_USER_EXCEEDS_ACTOR`）、404（`USER_NOT_FOUND`）

2FA の暗号化鍵 `TWO_FACTOR_ENCRYPTION_KEY` の入れ替えの後に、復号できない利用者の 2FA をまとめて未登録へ戻すには、サーバー上で `npm run user:reset-undecryptable-2fa`（確認だけ）・`npm run user:reset-undecryptable-2fa -- --apply` を実行します。

---

## 招待管理

招待のトークンは 32 バイトの乱数で、SHA-256 のハッシュだけを保存します。有効期限は 7 日です。招待メールのリンクはトークンを URL のフラグメント（`#token=…`）に置き、画面が要求本文で送ります。

### ユーザー招待

```
POST /api/v1/invitations
```

権限: `user:invite`

```bash
POST /api/v1/invitations
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "email": "newuser@example.com"
}
```

**成功（201 Created）:** 招待の要約（`id`・`email`・`status`・`expiresAt`・`createdAt`・`inviter`）と、サーバーが組み立てた招待 URL `invitationUrl`。招待 URL はこの応答と再送信の応答にだけ現れます。

**エラー:** 400、403、409（メールアドレスが既に登録済み）

### 招待一覧取得

```
GET /api/v1/invitations?status=pending
```

権限: `user:invite`。`status` は `pending`・`used`・`expired`・`revoked` で絞り込めます。

**成功（200 OK）:** 招待の配列。各招待は `id`・`email`・`status`・`expiresAt`・`createdAt`・`inviter`（`id`・`displayName`）だけを持ち、トークンと招待 URL を含みません。

### 招待取り消し

```
DELETE /api/v1/invitations/{id}
```

権限: `user:invite`（招待の作成者でなくても取り消せます）

**成功（204 No Content）**

**エラー:** 400（使用済み）、403、404

### 招待の再送信

```
POST /api/v1/invitations/{id}/resend
```

権限: `user:invite`

新しいトークンを発行して古いトークンを失効させ、有効期限を 7 日に置き換えて招待メールを送り直します。期限切れの招待も再送信できます。

**成功（200 OK）:** 招待の要約と新しい `invitationUrl`

**エラー:** 400（使用済み・取り消し済み）、403、404、409

### 招待トークン検証（公開エンドポイント）

```
POST /api/v1/invitations/verify
```

トークンは URL に載せず本文で送ります（アクセスログに残さない）。回数制限は 15 分で 10 回です。

```bash
POST /api/v1/invitations/verify
Content-Type: application/json

{
  "token": "<招待メールのリンクのフラグメントで受け取ったトークン>"
}
```

**成功（200 OK）:**
```json
{
  "email": "newuser@example.com"
}
```

**エラー:** 400（無効・期限切れ・使用済み・取り消し済み）

---

## 監査ログ

監査ログの行は DB のトリガーで更新を拒否し、削除はアーカイブの処理の中でだけ許します。実行者のメールアドレスと表示名を記録時に写して持ちます。

### 監査ログ取得

```
GET /api/v1/audit-logs
```

権限: `audit:read`

| パラメータ | 型 | 説明 |
|-----------|---|------|
| `actorId` | string | 実行者フィルター |
| `targetId` | string | 対象リソースフィルター |
| `action` | string | アクションフィルター（例: `LOGIN_FAILED`、`PROJECT_SCOPE_DENIED`） |
| `startDate` | string (ISO 8601) | 開始日時 |
| `endDate` | string (ISO 8601) | 終了日時 |
| `skip` | number | スキップ数 |
| `take` | number | 取得件数 |

**成功（200 OK）:** 監査ログの配列（`id`・`action`・`actorId`・`actorEmail`・`actorDisplayName`・`targetType`・`targetId`・`before`・`after`・`metadata`・`createdAt`）

### 監査ログエクスポート

```
GET /api/v1/audit-logs/export
```

権限: `audit:read`。クエリは上記と同じ（`skip`・`take` 以外）。

監査ログを JSON で返します。生成の前に出力の記録（`DATA_EXPORTED`、種別 `audit_log_json`）を行い、記録に失敗したときは 500 で出力を返しません。

### データ出力の記録

```
POST /api/v1/audit-logs/exports
```

認証済みの全利用者が呼べます。ブラウザで生成する出力・一括ダウンロード・クリップボードへのコピーは、生成を始める前にこの記録を要求し、失敗したときは出力を中止します（自動で再試行しない）。

```bash
POST /api/v1/audit-logs/exports
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "kind": "estimate_pdf",
  "projectId": "project-uuid",
  "targetIds": ["estimate-id-1"],
  "itemCount": 1
}
```

`kind` は出力の種別（`site_survey_report_pdf`・`quantity_table_pdf`・`itemized_statement_xlsx`・`itemized_statement_clipboard`・`estimate_pdf`・`estimate_xlsx`・`construction_photos_zip` など。一覧は Swagger を参照）です。案件に属する出力は `projectId` が必須で、閲覧範囲で判定します。

**成功（201 Created）:**
```json
{
  "recordId": "audit-log-id"
}
```

**エラー:** 400、401、404（案件が存在しない、または閲覧範囲外）、500（記録の失敗）

### 監査ログのアーカイブの復元

```
POST /api/v1/audit-logs/archives/restore
```

権限: `audit:read`

```bash
POST /api/v1/audit-logs/archives/restore
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "from": "2024-01-01T00:00:00+09:00",
  "to": "2024-03-31T23:59:59+09:00"
}
```

指定期間に重なる月のアーカイブ（AES-256-GCM で暗号化）を復号し、目録（件数・SHA-256・HMAC）と照合した後に、期間の監査ログを JSON Lines（1 行に 1 件）で返します。照合に失敗した月があれば行を返さず 500（`ARCHIVE_INTEGRITY_FAILED`）にします。成否を監査（`AUDIT_ARCHIVE_RESTORED`）に記録し、記録できないときは行を返しません。復元した行はアクティブな監査ログへ戻しません。

**エラー:** 400、401、403、500（照合の失敗・暗号鍵の未設定・記録の失敗）、503（保存先を読み取れない）

---

## 運用設定

### 現在のログレベルの取得

```
GET /api/v1/admin/log-level
```

権限: `ops:manage`（システム管理者が持つ）

### ログレベルの変更

```
POST /api/v1/admin/log-level
```

権限: `ops:manage`

```json
{
  "level": "info"
}
```

`level` は `trace`・`debug`・`info`・`warn`・`error`・`fatal` のいずれかです。変更は監査（`OPERATIONAL_SETTING_CHANGED`、変更前後のログレベル）に記録し、記録できないときは変更しません（500 `OPERATIONAL_SETTING_RECORD_FAILED`）。

**エラー:** 400（`INVALID_LOG_LEVEL`）、401、403、500

---

## 案件の閲覧範囲（業務 API）

案件と各業務機能（現場調査、工事写真、数量表、内訳書、見積依頼、見積書、契約、工程表、実行予算）の API は、権限の判定の後に案件の閲覧範囲を判定します。

- **範囲内**: 案件の営業担当者・工事担当者・作成者、または権限 `project:read_all` を持つ利用者
- **一覧・件数**: 範囲内の案件のデータだけを返します
- **ID 指定の要求**: 範囲外・不在・論理削除済みの案件は、いずれも存在しない案件と同じ 404 を返します
- **記録**: 案件が実在し範囲外のときだけ監査 `PROJECT_SCOPE_DENIED` に記録し、異常の検知へ送ります。経路の案件（例: `/api/projects/{projectId}/estimates`）と対象が実際に属する案件が食い違うときも 404 で、実際の案件が範囲外なら同じ形で記録します
- 判定はキャッシュせず、担当者の変更は次の要求から反映されます

---

## 次のステップ

- [認証API](authentication.md): ログイン、2FA、パスワードリセット
- [エラーハンドリング](error-handling.md): エラーコード一覧
- [API概要](overview.md): API全体の概要
- [セキュリティ設計](../architecture/security-design.md): 権限付与の上限・閲覧範囲・監査の設計
