# コーディング規約

このドキュメントでは、ArchiTrackプロジェクトで守るべきコーディング規約を説明します。

---

## 基本方針

- **可読性を優先**: 短いコードよりも読みやすいコードを書く
- **一貫性を保つ**: 既存のコードスタイルに合わせる
- **自動ツールに従う**: Prettier、ESLint、Prismaフォーマッターの設定に従う

---

## TypeScript/JavaScript

### フォーマット

Prettierに従う（自動整形）

```bash
# フォーマット実行
npm --prefix backend run format
npm --prefix frontend run format

# フォーマットチェック
npm --prefix backend run format:check
npm --prefix frontend run format:check
```

### Lint

ESLintルールに準拠

```bash
# Lint実行
npm --prefix backend run lint
npm --prefix frontend run lint

# Lint自動修正
npm --prefix backend run lint:fix
npm --prefix frontend run lint:fix
```

### 命名規則

#### 変数・関数: camelCase

```typescript
// ✅ Good
const userId = '123';
function getUserById(id: string) {}

// ❌ Bad
const user_id = '123';
function get_user_by_id(id: string) {}
```

#### クラス・型: PascalCase

```typescript
// ✅ Good
class UserModel {}
interface UserData {}
type UserId = string;

// ❌ Bad
class userModel {}
interface userData {}
type userId = string;
```

#### 定数: UPPER_SNAKE_CASE

```typescript
// ✅ Good
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = 'https://api.example.com';

// ❌ Bad
const maxRetryCount = 3;
const apiBaseUrl = 'https://api.example.com';
```

#### プライベート変数: `_`プレフィックス

```typescript
// ✅ Good
class UserService {
  private _internalState: string;

  constructor() {
    this._internalState = 'initialized';
  }
}

// ❌ Bad
class UserService {
  private internalState: string;
}
```

### 型定義

#### `any`を避ける

```typescript
// ✅ Good
function processUser(user: User): void {
  console.log(user.name);
}

// ❌ Bad
function processUser(user: any): void {
  console.log(user.name);
}
```

#### 明示的な型定義

```typescript
// ✅ Good
const userId: string = '123';
const age: number = 25;

// ❌ Bad（型推論に頼りすぎ）
const userId = '123';  // 単純な場合は許容されるが、複雑な場合は明示する
```

#### unknown を使う

```typescript
// ✅ Good
function handleError(error: unknown) {
  if (error instanceof Error) {
    console.error(error.message);
  }
}

// ❌ Bad
function handleError(error: any) {
  console.error(error.message);
}
```

### エラーハンドリング

#### 適切なエラーハンドリング

```typescript
// ✅ Good
try {
  const result = await fetchData();
  return result;
} catch (error) {
  if (error instanceof ApiError) {
    logger.error('API error:', error);
    throw new CustomError('Failed to fetch data', error);
  }
  throw error;
}

// ❌ Bad
try {
  const result = await fetchData();
  return result;
} catch (error) {
  console.log(error);  // エラーを握りつぶす
}
```

---

## React

### 関数コンポーネント

クラスコンポーネントは使用しない

```tsx
// ✅ Good
function UserProfile({ userId }: { userId: string }) {
  return <div>{userId}</div>;
}

// ❌ Bad
class UserProfile extends React.Component {
  render() {
    return <div>{this.props.userId}</div>;
  }
}
```

### Hooks

React Hooksのルールに従う

```tsx
// ✅ Good
function useUser(userId: string) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, [userId]);

  return user;
}

// ❌ Bad（条件付きでHooksを呼ぶ）
function useUser(userId: string) {
  if (!userId) return null;
  const [user, setUser] = useState<User | null>(null);  // ❌
  return user;
}
```

### Props

型定義を必ず行う

```tsx
// ✅ Good
interface UserProfileProps {
  userId: string;
  onUpdate?: (user: User) => void;
}

function UserProfile({ userId, onUpdate }: UserProfileProps) {
  return <div>{userId}</div>;
}

// ❌ Bad
function UserProfile({ userId, onUpdate }) {  // 型定義なし
  return <div>{userId}</div>;
}
```

### ファイル命名

PascalCase（コンポーネント名と一致）

```
✅ Good:
- UserProfile.tsx
- LoginForm.tsx
- Button.tsx

❌ Bad:
- user-profile.tsx
- loginForm.tsx
- button.tsx
```

---

## データベース（Prisma）

### スキーマ

変更後は必ずマイグレーションを生成

```bash
# スキーマ編集後
npm --prefix backend run prisma:migrate
```

### 命名規則

#### テーブル・カラム名: snake_case

```prisma
// ✅ Good
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  password_hash String
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  @@map("users")
}

// ❌ Bad
model User {
  id           String   @id @default(uuid())
  Email        String   @unique
  passwordHash String
  CreatedAt    DateTime @default(now())
}
```

### インデックス

パフォーマンスを考慮した適切なインデックス設定

```prisma
// ✅ Good
model User {
  id    String @id @default(uuid())
  email String @unique  // よく検索されるフィールドにインデックス

  @@index([email])
  @@map("users")
}
```

---

## API設計

### RESTful

```typescript
// ✅ Good
GET    /api/v1/users           # ユーザー一覧
GET    /api/v1/users/:id       # ユーザー詳細
POST   /api/v1/users           # ユーザー作成
PUT    /api/v1/users/:id       # ユーザー更新
DELETE /api/v1/users/:id       # ユーザー削除

// ❌ Bad
GET    /api/v1/getUsers
POST   /api/v1/createUser
POST   /api/v1/deleteUser/:id
```

### レスポンス形式

```typescript
// ✅ Good
{
  "data": { ... },
  "meta": {
    "timestamp": "2025-11-13T00:00:00Z"
  }
}

// エラーレスポンス
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [...]
  }
}

// ❌ Bad（統一されていない）
{ "result": { ... } }
{ "success": true, "data": { ... } }
```

---

## コメント

### 必要なコメント

```typescript
// ✅ Good
/**
 * ユーザー認証を実行します
 * @param email - ユーザーのメールアドレス
 * @param password - ユーザーのパスワード
 * @returns JWT トークン
 * @throws AuthenticationError 認証失敗時
 */
async function authenticate(email: string, password: string): Promise<string> {
  // 実装...
}
```

### 不要なコメント

```typescript
// ❌ Bad（コードを見れば分かる）
// ユーザーIDを取得
const userId = user.id;

// ✅ Good（コメント不要）
const userId = user.id;
```

---

## 要件トレーサビリティ（Requirements Traceability）

ArchiTrackでは、要件定義書（`.kiro/specs/`）とコード・テストの紐付けを管理しています。

### 要件参照タグの形式

```
@requirement {feature-name}/REQ-{N}.{M}
```

**形式の説明:**
- `{feature-name}`: `.kiro/specs/`配下のディレクトリ名
- `REQ-{N}`: 要件番号
- `.{M}`: 受入基準番号（任意）

### ファイルヘッダーでの使用

ファイル全体が特定の要件に関連する場合、ファイルヘッダーに記載します：

```typescript
// ✅ Good
/**
 * @fileoverview 認証サービス
 *
 * Requirements (user-authentication):
 * - REQ-4.1: ログイン成功時にアクセストークンとリフレッシュトークンを発行
 * - REQ-4.4: 環境変数ACCESS_TOKEN_EXPIRYで設定された有効期限を持つアクセストークンを発行
 * - REQ-5.7: EdDSA（Ed25519）署名アルゴリズムを使用
 */
```

### 関数・メソッドでの使用

特定の関数が要件を実装している場合：

```typescript
// ✅ Good
/**
 * ログイン認証を実行
 * @requirement user-authentication/REQ-4.1: 有効な認証情報でトークン発行
 */
async function login(email: string, password: string) {
  // 実装...
}
```

### テストでの使用

テストケースと要件の紐付け：

```typescript
// ✅ Good
describe('ログイン機能', () => {
  /**
   * @requirement user-authentication/REQ-4.1
   */
  it('有効な認証情報でトークンを発行する (user-authentication/REQ-4.1)', async () => {
    // テスト実装...
  });
});

// ✅ Good（括弧形式）
it('ログイン成功時にトークンを返す (user-authentication/REQ-4.1)', () => {
  // テスト実装...
});
```

### 複数機能の要件

複数の機能からの要件を参照する場合：

```typescript
// ✅ Good
/**
 * @fileoverview プロジェクト管理と認証の統合
 *
 * Requirements (project-management):
 * - REQ-12.5: プロジェクト権限の定義
 *
 * Requirements (user-authentication):
 * - REQ-6.1: 権限検証
 */
```

### ベストプラクティス

1. **必須**: 要件定義書に記載された機能を実装する場合は必ず要件タグを付ける
2. **ファイルレベル**: ファイル全体が特定機能に関連する場合はヘッダーに記載
3. **関数レベル**: 特定の要件を実装する関数には`@requirement`タグを付ける
4. **テスト**: テスト名または`describe`ブロックに要件IDを含める
5. **機能名**: `.kiro/specs/`配下のディレクトリ名を正確に使用する

詳細は[テスト - 要件カバレッジ](testing.md#要件カバレッジrequirements-traceability)を参照してください。

---

## Git Commit

### コミットメッセージ規約

Conventional Commitsに従います。

詳細は[コミット規約](../contributing/commit-conventions.md)を参照してください。

```bash
# ✅ Good
feat(backend): JWT認証ミドルウェアを追加
fix(frontend): ログインボタンが押せない問題を修正
docs: READMEにセットアップ手順を追加

# ❌ Bad
update code
Fixed bug
Add feature.
```

---

## セキュリティ

### 避けるべきパターン

#### SQLインジェクション

```typescript
// ❌ Bad（SQLインジェクション脆弱性）
const query = `SELECT * FROM users WHERE email = '${email}'`;

// ✅ Good（Prismaを使用）
const user = await prisma.user.findUnique({
  where: { email }
});
```

#### XSS

```tsx
// ❌ Bad（XSS脆弱性）
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// ✅ Good
<div>{userInput}</div>
```

#### パスワードのハッシュ化

```typescript
// ❌ Bad（平文保存）
await prisma.user.create({
  data: { email, password }
});

// ✅ Good（Argon2でハッシュ化）
const passwordHash = await argon2.hash(password);
await prisma.user.create({
  data: { email, passwordHash }
});
```

---

## ファイル構成

### Backend

```
backend/src/
├── routes/          # APIルート
├── middleware/      # ミドルウェア
├── services/        # ビジネスロジック
├── models/          # データモデル（Prisma以外）
├── utils/           # ユーティリティ関数
├── config/          # 設定
├── errors/          # カスタムエラー
└── __tests__/       # テスト
```

### Frontend

```
frontend/src/
├── components/      # Reactコンポーネント
├── pages/           # ページコンポーネント
├── hooks/           # カスタムHooks
├── api/             # APIクライアント
├── utils/           # ユーティリティ関数
├── types/           # 型定義
└── __tests__/       # テスト
```

---

## 次のステップ

- [Git設定](git-configuration.md): Git hooksの設定
- [テスト](testing.md): テストコードの書き方
- [コントリビューションガイド](../contributing/guide.md): PRの作成方法
