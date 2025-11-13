# セキュリティ設計

このドキュメントでは、ArchiTrackのセキュリティ設計とセキュリティ対策を説明します。

---

## セキュリティ層

```
┌─────────────────────────────────────────────┐
│ Application Layer                           │
│ - Helmet (セキュリティヘッダー)              │
│ - CORS (オリジン制限)                        │
│ - Rate Limiting (DDoS対策)                  │
│ - Input Validation (Zod)                    │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Transport Layer                             │
│ - HTTPS強制 (本番環境)                      │
│ - HSTS ヘッダー                             │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Infrastructure Layer                        │
│ - Railway (プラットフォームセキュリティ)     │
│ - PostgreSQL (接続暗号化)                   │
│ - Redis (接続暗号化)                        │
└─────────────────────────────────────────────┘
```

---

## 認証（Authentication）

### JWT（JSON Web Token）

**方式:**
- **署名アルゴリズム**: EdDSA (Ed25519)
- **トークン種類**:
  - **アクセストークン**: 有効期限 15分（デフォルト）
  - **リフレッシュトークン**: 有効期限 7日（デフォルト）

**利点:**
- GPU攻撃耐性（EdDSAは非対称鍵暗号）
- ステートレス認証
- トークンリフレッシュによる短命アクセストークン

### パスワード管理

#### ハッシュ化

- **アルゴリズム**: Argon2id
- **OWASP推奨**: メモリハード関数（GPU攻撃耐性）
- **パラメータ**:
  - Memory: 65536 KiB (64 MiB)
  - Iterations: 3
  - Parallelism: 4

#### パスワードポリシー

- **最小長**: 12文字
- **複雑性要件**: 大文字、小文字、数字、特殊文字のうち3種類以上
- **パスワード履歴**: 過去3回の再利用防止
- **漏洩チェック**: HIBP（Have I Been Pwned）Bloom Filter実装

#### パスワードリセット

- **リセットトークン**: UUID v4（ランダム生成）
- **有効期限**: 24時間
- **ワンタイム**: 一度使用したらトークン無効化

### 二段階認証（2FA）

#### TOTP（Time-based One-Time Password）

- **アルゴリズム**: TOTP（RFC 6238）
- **時間ウィンドウ**: ±1ステップ（30秒 × 3 = 90秒）
- **秘密鍵暗号化**: AES-256-GCM

#### バックアップコード

- **生成**: 10個のランダムコード（8桁英数字）
- **使い捨て**: 一度使用したら無効化
- **ハッシュ化**: Argon2idでハッシュ化保存

---

## 認可（Authorization）

### RBAC（ロールベースアクセス制御）

**標準準拠:**
- NIST RBAC標準準拠
- Core RBAC + Hierarchical RBAC

**構成要素:**
- **ロール**: ユーザーの役割（admin、editor、viewer等）
- **権限**: リソースへのアクセス権（adr:read、adr:create等）
- **ユーザー・ロール紐付け**: マルチロール対応

**権限形式:**
```
<resource>:<action>
```

**例:**
- `adr:read`: ADRの読み取り
- `adr:create`: ADRの作成
- `user:delete`: ユーザーの削除
- `*:*`: 全権限（管理者）

### 権限チェックフロー

```typescript
// ミドルウェア
async function requirePermission(permission: string) {
  // 1. JWTからユーザーID取得
  const userId = req.user.id;

  // 2. ユーザーのロール取得
  const roles = await getUserRoles(userId);

  // 3. ロールの権限取得
  const permissions = await getRolePermissions(roles);

  // 4. 権限チェック
  if (!permissions.includes(permission)) {
    throw new AuthorizationError('Insufficient permissions');
  }

  next();
}
```

---

## セッション管理

### セッション保存

- **保存先**: Redis
- **キー形式**: `session:{userId}:{sessionId}`
- **TTL**: リフレッシュトークンの有効期限と同期

### マルチデバイス対応

- 複数デバイスで同時ログイン可能
- 各デバイスごとにセッション管理
- 全デバイスログアウト機能

### ログイン試行制限

- **失敗回数**: 5回失敗で15分ロック
- **カウンター**: Redis（key: `login_attempt:{email}`）
- **TTL**: 15分

---

## 入力検証（Input Validation）

### Zodスキーマ検証

```typescript
// 例: ユーザー登録
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  displayName: z.string().min(1).max(100),
  invitationToken: z.string().uuid(),
});
```

### SQLインジェクション対策

- **Prisma ORM**: パラメータ化クエリ
- 生SQLは使用しない

### XSS対策

- **React**: デフォルトでエスケープ
- `dangerouslySetInnerHTML`は使用しない
- Content Security Policy（CSP）ヘッダー

---

## レートリミット

### 実装

- **Redisベース**: カウンター方式
- **キー形式**: `rate_limit:{ip}:{endpoint}`

### 設定

| エンドポイント | リミット | ウィンドウ |
|--------------|---------|-----------|
| 一般API | 100 req | 15分 |
| ログイン | 5 req | 15分 |
| パスワードリセット | 3 req | 15分 |
| 2FA検証 | 5 req | 15分 |

---

## CORS（Cross-Origin Resource Sharing）

### 設定

```typescript
const corsOptions = {
  origin: process.env.FRONTEND_URL,  // 許可するオリジン
  credentials: true,  // Cookieを許可
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
```

---

## セキュリティヘッダー（Helmet）

### 設定済みヘッダー

- **Content-Security-Policy**: XSS対策
- **X-Content-Type-Options**: MIMEタイプスニッフィング防止
- **X-Frame-Options**: クリックジャッキング対策
- **X-XSS-Protection**: XSSフィルター有効化
- **Strict-Transport-Security**: HTTPS強制（本番環境）

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));
```

---

## 監査ログ

### 記録対象

- **認証イベント**: ログイン、ログアウト、2FA有効化/無効化
- **CRUD操作**: ADR作成・更新・削除
- **ロール変更**: ユーザー・ロール紐付けの変更
- **権限変更**: ロール・権限紐付けの変更

### ログ形式

```typescript
interface AuditLog {
  id: string;
  action: string;          // 'ADR_CREATED', 'USER_LOGGED_IN'等
  actorId: string;         // 実行者のユーザーID
  resourceType?: string;   // 'ADR', 'User'等
  resourceId?: string;     // リソースID
  metadata?: object;       // 追加情報（JSONフィールド）
  ipAddress?: string;      // 実行元IPアドレス
  userAgent?: string;      // 実行元ユーザーエージェント
  createdAt: Date;
}
```

---

## データ暗号化

### 転送時の暗号化

- **HTTPS**: TLS 1.2以上（Railway自動設定）
- **データベース接続**: TLS暗号化（Railway自動設定）
- **Redis接続**: TLS暗号化（Railway自動設定）

### 保存時の暗号化

- **パスワード**: Argon2idハッシュ
- **TOTP秘密鍵**: AES-256-GCM暗号化
- **バックアップコード**: Argon2idハッシュ
- **リフレッシュトークン**: ハッシュ化保存（SHA-256）

---

## セキュリティベストプラクティス

### 開発時

- [ ] 環境変数を`.env`ファイルに保存（Gitにコミットしない）
- [ ] シークレット鍵を定期的にローテーション
- [ ] 依存関係の脆弱性スキャン（`npm audit`）
- [ ] OWASP Top 10の対策確認

### デプロイ時

- [ ] Railway環境変数にシークレット設定
- [ ] HTTPS強制（本番環境）
- [ ] Sentryでエラー監視
- [ ] 監査ログの定期的な確認

---

## 脆弱性対応

### 脆弱性スキャン

```bash
# 依存関係の脆弱性スキャン
npm audit

# 自動修正
npm audit fix
```

### セキュリティインシデント対応

1. **検知**: Sentry、監査ログ、ユーザー報告
2. **対応**: 脆弱性の特定と修正
3. **通知**: 影響を受けるユーザーへの通知
4. **再発防止**: セキュリティテストの追加

---

## 次のステップ

- [システム構成](system-overview.md): システム全体像
- [データフロー](data-flow.md): データの流れ
- [シークレット管理](../deployment/secrets-management.md): 鍵管理
