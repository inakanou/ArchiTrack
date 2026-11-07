# データフロー

このドキュメントでは、ArchiTrackにおけるデータの流れを説明します。

---

## リクエストフロー

```
1. クライアントリクエスト（frontend の公開ドメイン）
   ↓
2. Railway のエッジ（TLS 終端）
   ↓
3. frontend の Nginx
   - /api/・/csrf-token → backend へ中継（BACKEND_INTERNAL_URL、プライベートネットワーク）
   - それ以外 → SPA の静的ファイルを配信
   - 全応答にセキュリティヘッダー・CSP を付与
   ↓
4. バックエンドAPI (Express)
   ↓
5. ミドルウェアチェーン
   - 送信元 IP の識別（trust proxy = TRUST_PROXY_HOPS）
   - HTTP ログ（要求識別子の生成、クエリの伏せ字）
   - Rate Limiting (Redis。認証系は専用の制限)
   - CSRF・Origin の照合（Cookie を使うリフレッシュ・ログアウト）
   - 認証 (JWT の検証 + 利用者の状態の照合)
   - 認可 (RBAC) → 案件の閲覧範囲（業務 API）
   - リクエスト検証 (Zod)
   ↓
6. ビジネスロジック
   - 監査ログの記録（データ出力は生成の前に記録）
   ↓
7. データアクセス
   - PostgreSQL (永続化、Prisma)
   - Redis (キャッシュ、計数、キュー)
   - R2 (ファイル、監査ログのアーカイブ)
   ↓
8. レスポンス生成
   ↓
9. Nginx 経由でクライアントに返却
```

ローカル開発環境では 2・3 を通らず、Vite の画面から backend へ直接つなぎます（CORS で `FRONTEND_URL` を許可）。

---

## 認証フロー

2FA は全利用者で必須です。リフレッシュトークンは HttpOnly Cookie だけで受け渡し、アクセストークンは画面のメモリだけに保持します。

### ログイン（2FA 登録済み）

```mermaid
sequenceDiagram
    participant Client
    participant Nginx
    participant Backend
    participant Database
    participant Redis

    Client->>Nginx: POST /api/v1/auth/login（email, password）
    Nginx->>Backend: 中継
    Backend->>Database: ユーザー検証（無効化・ロックの確認）
    Database-->>Backend: ユーザー情報
    Backend->>Backend: パスワードハッシュ検証（Argon2id）
    Backend->>Redis: 2FA 待ちの資格を保存（SHA-256 の鍵、5 分）
    Backend-->>Client: { requires2FA: true, challengeToken }

    Client->>Nginx: POST /api/v1/auth/verify-2fa（challengeToken, code）
    Nginx->>Backend: 中継
    Backend->>Redis: 資格の検証と消費（一回限り）
    Backend->>Database: TOTP秘密鍵取得・復号化（AES-256-GCM）
    Backend->>Backend: TOTP Code検証（±1 ステップ）
    Backend->>Database: 使用した時間ステップを記録（再利用を拒否）
    Backend->>Backend: JWT生成（EdDSA、typ at+jwt / iss / aud / token_use / jti / gen）
    Backend->>Database: リフレッシュトークンのハッシュを新しい系列で保存
    Backend->>Database: 最終ログイン日時・監査ログ（LOGIN_SUCCESS 等）
    Backend-->>Client: { accessToken, user } + Set-Cookie: refreshToken（HttpOnly）
```

- パスワード・2FA の失敗はそれぞれ連続 5 回でロックします（監査 `LOGIN_LOCKED`）
- 2FA 未登録の利用者には、パスワードの検証の後にアクセストークンを返し、画面は 2FA の設定画面へ進みます。設定とログアウト以外の API は 403（`TWO_FACTOR_SETUP_REQUIRED`）です

### トークンリフレッシュ

```mermaid
sequenceDiagram
    participant Client
    participant Nginx
    participant Backend
    participant Database

    Client->>Nginx: GET /csrf-token
    Nginx->>Backend: 中継
    Backend-->>Client: Set-Cookie: csrf-token + { csrfToken }

    Client->>Nginx: POST /api/v1/auth/refresh
    Note over Client,Nginx: Cookie: refreshToken, csrf-token<br/>X-CSRF-Token / Origin
    Nginx->>Backend: 中継
    Backend->>Backend: CSRF 二重送信と Origin の照合
    Backend->>Backend: JWT 検証（token_use=refresh, iss, aud）
    Backend->>Database: ハッシュでリフレッシュトークンを検索

    alt 有効なトークン
        Backend->>Database: ローテーション（後継を同じ系列で保存）
        Backend->>Backend: 新しいアクセストークン生成
        Backend-->>Client: { accessToken, user } + Set-Cookie: 後継の refreshToken
    else 置き換え済みのトークンの再提示
        Backend->>Database: 系列を全て失効・監査（REFRESH_TOKEN_REUSE_DETECTED）
        Backend-->>Client: 401 INVALID_REFRESH_TOKEN + Cookie の消去
    end
```

- 画面はタブ間のリフレッシュを Web Locks で直列化し、結果を BroadcastChannel で他のタブへ配ります
- 無効化された利用者のリフレッシュは 401（`ACCOUNT_DISABLED`）です

---

## API リクエストフロー

### 認証が必要なAPIリクエスト

```mermaid
sequenceDiagram
    participant Client
    participant Backend
    participant Redis
    participant Database

    Client->>Backend: GET /api/projects/{id}（Nginx 経由）
    Note over Client,Backend: Authorization: Bearer {accessToken}

    Backend->>Redis: レートリミット確認（送信元 IP）
    Redis-->>Backend: リクエスト許可

    Backend->>Backend: JWT検証（EdDSA署名、typ / iss / aud / token_use）
    Backend->>Redis: 利用者の状態（キャッシュ。無ければ DB）
    Backend->>Backend: 世代 gen・無効化・初回のパスワード変更・2FA 登録を照合

    Backend->>Redis: 権限の判定（RBAC、キャッシュ）
    Backend->>Database: 案件の閲覧範囲の判定（担当者・作成者・project:read_all）
    Backend->>Database: データ取得
    Database-->>Backend: データ
    Backend-->>Client: レスポンス
```

| 照合の結果 | 応答 |
|-----------|------|
| トークンの不正・2FA の再設定より前の世代 | 401 |
| 無効化された利用者 | 401 `ACCOUNT_DISABLED` |
| 初回のパスワード変更を要する / 2FA 未登録 | 403 `PASSWORD_CHANGE_REQUIRED` / `TWO_FACTOR_SETUP_REQUIRED` |
| 権限なし | 403 |
| 案件の閲覧範囲外・不在・論理削除済み | 404（区別しない） |

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

利用者の状態・権限のキャッシュは、無効化・2FA の再設定・ロールの変更などの際に無効化します。案件の閲覧範囲の判定はキャッシュしません（担当者の変更が次の要求から反映される）。

---

## RBAC（ロールベースアクセス制御）と閲覧範囲のフロー

```mermaid
sequenceDiagram
    participant Client
    participant Backend
    participant Database

    Client->>Backend: PUT /api/projects/{id}（案件の更新）
    Note over Client,Backend: Authorization: Bearer {accessToken}

    Backend->>Backend: JWT検証・利用者の状態の照合
    Backend->>Database: ユーザーの権限取得（ロール経由）
    Database-->>Backend: 権限: ["project:update", "project:read", ...]

    Backend->>Backend: 権限チェック（"project:update"が必要）

    alt 権限なし
        Backend->>Database: 監査（PERMISSION_CHECK_FAILED）
        Backend-->>Client: 403 Forbidden
    else 権限あり
        Backend->>Database: 案件の担当者・作成者を取得
        alt 範囲内（関係者 または project:read_all）
            Backend->>Database: 案件の更新・監査ログ
            Backend-->>Client: 200 OK
        else 範囲外
            Backend->>Database: 監査（PROJECT_SCOPE_DENIED）
            Backend-->>Client: 404 Not Found（不在と同じ本文）
        end
    end
```

ロール・権限の付与と他のユーザーの管理には、さらに権限付与の上限（実行者の保有ロールの優先度の最大値）を掛けます（[セキュリティ設計](security-design.md#権限付与の上限)）。

---

## データベーストランザクションフロー

### 業務データの更新と監査ログ（例）

```typescript
// トランザクション開始
await prisma.$transaction(async (tx) => {
  // 1. 業務データの更新
  const estimate = await tx.estimate.update({
    where: { id: estimateId },
    data: { name: '見積書' },
  });

  // 2. 監査ログ記録（同じトランザクションの中で書く）
  await tx.auditLog.create({
    data: {
      action: 'ESTIMATE_UPDATED',
      actorId: userId,
      actorEmail,          // 記録時の実行者の写し
      actorDisplayName,
      targetType: 'Estimate',
      targetId: estimate.id,
      metadata: { ipAddress, userAgent, requestId },
    },
  });

  return estimate;
});
// コミット
```

監査ログの行は DB のトリガーで更新を拒否し、削除はアーカイブの処理の中でだけ許します。

---

## データ出力の記録フロー

出力・一括ダウンロード・クリップボードへのコピーは、生成の前に監査（`DATA_EXPORTED`）へ記録し、記録に失敗したら出力しません。

```mermaid
sequenceDiagram
    participant Client
    participant Backend
    participant Database

    Note over Client: ブラウザで生成する出力（PDF・Excel・ZIP・コピー等）
    Client->>Backend: POST /api/v1/audit-logs/exports（kind, projectId, targetIds, itemCount）
    Backend->>Backend: 案件の閲覧範囲の判定
    Backend->>Database: 監査（DATA_EXPORTED）

    alt 記録に成功
        Backend-->>Client: 201
        Client->>Client: 出力を生成
    else 記録に失敗・範囲外
        Backend-->>Client: 500 / 404
        Client->>Client: 出力を中止（自動で再試行しない）
    end
```

サーバーで生成する出力（工程表・発注・出来高・監査ログの JSON）は、backend が生成の前に同じ記録を行い、失敗したら出力を返しません。

---

## エラーハンドリングフロー

```
1. エラー発生
   ↓
2. エラー分類
   - ValidationError（400）
   - AuthenticationError（401）
   - AuthorizationError（403）
   - NotFoundError（404。閲覧範囲外も同じ）
   - InternalServerError（500）
   ↓
3. エラーロギング
   - 構造化ログ（要求識別子付き、機密を伏せる）
   - Sentry（本番環境。要求本文・Cookie・認証ヘッダーを除く）
   ↓
4. 監査ログ記録・異常の検知（権限の拒否、範囲外、429、5xx 等）
   ↓
5. クライアントにエラーレスポンス（Problem Details 形式）
   {
     "type": "https://.../errors/...",
     "title": "...",
     "status": 404,
     "detail": "...",
     "instance": "/api/...",
     "code": "ERROR_CODE"
   }
```

認証の DB 障害などの内部の詳細は応答に含めず、汎用の応答にします。

---

## レートリミットフロー

```mermaid
sequenceDiagram
    participant Client
    participant Backend
    participant Redis

    Client->>Backend: API リクエスト（Nginx 経由）
    Backend->>Backend: 送信元 IP の識別（req.ip、TRUST_PROXY_HOPS）
    Backend->>Redis: カウンターインクリメント（key: rl:<制限>:<送信元>）
    Redis-->>Backend: 現在のカウント

    alt リミット以内
        Backend->>Backend: リクエスト処理
        Backend-->>Client: レスポンス
    else リミット超過
        Backend->>Backend: 異常の検知へ観測を送る
        Backend-->>Client: 429 Too Many Requests
    end
```

**レートリミット設定（主なもの）:**
- 一般API: 100 req/15min/IP
- ログインAPI: 10 req/1min/IP
- トークンリフレッシュ: 20 req/1min/IP
- 2FA検証: 10 req/5min/IP
- パスワードリセットの要求: 5 req/1h（送信元・メールアドレスのそれぞれ）

全体は[セキュリティ設計](security-design.md#レートリミット)を参照してください。

---

## 定期処理とキューのフロー

```mermaid
sequenceDiagram
    participant Runner as ScheduledJobRunner
    participant Redis
    participant Backend as ジョブの処理
    participant Database
    participant R2
    participant Mail as メールキュー

    Runner->>Redis: 繰り返しジョブを登録（scheduled-jobs、cron は Asia/Tokyo）
    Redis-->>Backend: 周期ごとにジョブを実行
    Backend->>Database: 期限切れのトークンの消去 / 90 日の自動無効化
    Backend->>Database: 13 か月より前の監査ログを読む
    Backend->>R2: 暗号化したアーカイブと目録を保存・照合
    Backend->>Database: 照合に成功した月の行を削除
    Backend->>Mail: 全システム管理者への通知（email-queue）
```

ジョブの一覧は[セキュリティ設計](security-design.md#定期処理)を参照してください。

---

## 次のステップ

- [システム構成](system-overview.md): システム全体像
- [セキュリティ設計](security-design.md): セキュリティ層
- [開発ワークフロー](../development/workflow.md): 開発の流れ
