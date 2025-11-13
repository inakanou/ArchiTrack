# データフロー

このドキュメントでは、ArchiTrackにおけるデータの流れを説明します。

---

## リクエストフロー

```
1. クライアントリクエスト
   ↓
2. Nginx/Viteでルーティング
   ↓
3. バックエンドAPI (Express)
   ↓
4. ミドルウェアチェーン
   - CORS検証
   - Rate Limiting (Redis)
   - 認証/認可 (JWT)
   - リクエスト検証 (Zod)
   ↓
5. ビジネスロジック
   ↓
6. データベースアクセス (Prisma)
   - PostgreSQL (永続化)
   - Redis (キャッシング)
   ↓
7. レスポンス生成
   ↓
8. クライアントに返却
```

---

## 認証フロー

### ログイン

```mermaid
sequenceDiagram
    participant Client
    participant Backend
    participant Database
    participant Redis

    Client->>Backend: POST /api/v1/auth/login
    Backend->>Database: ユーザー検証（メール・パスワード）
    Database-->>Backend: ユーザー情報
    Backend->>Backend: パスワードハッシュ検証（Argon2）
    Backend->>Backend: JWT生成（EdDSA署名）
    Backend->>Redis: リフレッシュトークン保存
    Backend-->>Client: アクセストークン・リフレッシュトークン
```

### トークンリフレッシュ

```mermaid
sequenceDiagram
    participant Client
    participant Backend
    participant Redis

    Client->>Backend: POST /api/v1/auth/refresh
    Note over Client,Backend: Authorization: Bearer {refreshToken}
    Backend->>Redis: リフレッシュトークン検証
    Redis-->>Backend: トークン情報
    Backend->>Backend: 新しいアクセストークン生成
    Backend-->>Client: 新しいアクセストークン
```

### 2FA認証

```mermaid
sequenceDiagram
    participant Client
    participant Backend
    participant Database

    Client->>Backend: POST /api/v1/auth/login
    Backend->>Database: ユーザー検証
    Database-->>Backend: 2FA有効ユーザー
    Backend-->>Client: 一時トークン（tempToken）

    Client->>Backend: POST /api/v1/auth/verify-2fa
    Note over Client,Backend: tempToken + TOTP Code
    Backend->>Database: TOTP秘密鍵取得・復号化
    Backend->>Backend: TOTP Code検証（時間ウィンドウ）
    Backend->>Backend: JWT生成
    Backend-->>Client: アクセストークン・リフレッシュトークン
```

---

## API リクエストフロー

### 認証が必要なAPIリクエスト

```mermaid
sequenceDiagram
    participant Client
    participant Backend
    participant Redis
    participant Database

    Client->>Backend: GET /api/v1/protected
    Note over Client,Backend: Authorization: Bearer {accessToken}

    Backend->>Backend: JWT検証（EdDSA署名）
    Backend->>Redis: レートリミット確認
    Redis-->>Backend: リクエスト許可

    Backend->>Backend: 認可チェック（RBAC）
    Backend->>Database: データ取得
    Database-->>Backend: データ

    Backend->>Redis: キャッシュ保存（任意）
    Backend-->>Client: レスポンス
```

### キャッシュフロー

```mermaid
sequenceDiagram
    participant Client
    participant Backend
    participant Redis
    participant Database

    Client->>Backend: GET /api/v1/data
    Backend->>Redis: キャッシュ確認

    alt キャッシュヒット
        Redis-->>Backend: キャッシュデータ
        Backend-->>Client: レスポンス（高速）
    else キャッシュミス
        Redis-->>Backend: キャッシュなし
        Backend->>Database: データ取得
        Database-->>Backend: データ
        Backend->>Redis: キャッシュ保存
        Backend-->>Client: レスポンス
    end
```

---

## RBAC（ロールベースアクセス制御）フロー

```mermaid
sequenceDiagram
    participant Client
    participant Backend
    participant Database

    Client->>Backend: POST /api/v1/adr (ADR作成)
    Note over Client,Backend: Authorization: Bearer {accessToken}

    Backend->>Backend: JWT検証
    Backend->>Database: ユーザーのロール取得
    Database-->>Backend: ロール: "editor"

    Backend->>Database: ロールの権限取得
    Database-->>Backend: 権限: ["adr:create", "adr:read", ...]

    Backend->>Backend: 権限チェック（"adr:create"が必要）

    alt 権限あり
        Backend->>Database: ADR作成
        Database-->>Backend: 作成成功
        Backend-->>Client: 201 Created
    else 権限なし
        Backend-->>Client: 403 Forbidden
    end
```

---

## データベーストランザクションフロー

### ADR作成例

```typescript
// トランザクション開始
await prisma.$transaction(async (tx) => {
  // 1. ADR作成
  const adr = await tx.adr.create({
    data: {
      title: 'ADR-001',
      content: 'Content...',
      status: 'proposed',
      authorId: userId,
    },
  });

  // 2. 監査ログ記録
  await tx.auditLog.create({
    data: {
      action: 'ADR_CREATED',
      actorId: userId,
      resourceType: 'ADR',
      resourceId: adr.id,
      metadata: { title: adr.title },
    },
  });

  return adr;
});
// コミット
```

---

## エラーハンドリングフロー

```
1. エラー発生
   ↓
2. エラー分類
   - ValidationError（400）
   - AuthenticationError（401）
   - AuthorizationError（403）
   - NotFoundError（404）
   - InternalServerError（500）
   ↓
3. エラーロギング
   - コンソール（開発環境）
   - Sentry（本番環境）
   ↓
4. 監査ログ記録（重要な操作の場合）
   ↓
5. クライアントにエラーレスポンス
   {
     "error": {
       "code": "ERROR_CODE",
       "message": "User-friendly message",
       "details": [...]
     }
   }
```

---

## レートリミットフロー

```mermaid
sequenceDiagram
    participant Client
    participant Backend
    participant Redis

    Client->>Backend: API リクエスト
    Backend->>Redis: カウンターインクリメント（key: IP + endpoint）
    Redis-->>Backend: 現在のカウント

    alt リミット以内
        Backend->>Backend: リクエスト処理
        Backend-->>Client: レスポンス
    else リミット超過
        Backend-->>Client: 429 Too Many Requests
        Note over Client: Retry-After: 60秒
    end
```

**レートリミット設定:**
- 一般API: 100 req/15min/IP
- ログインAPI: 5 req/15min/IP

---

## 次のステップ

- [システム構成](system-overview.md): システム全体像
- [セキュリティ設計](security-design.md): セキュリティ層
- [開発ワークフロー](../development/workflow.md): 開発の流れ
