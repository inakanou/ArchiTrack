# 技術スタック

このドキュメントでは、ArchiTrackで使用している技術スタックとその選定理由を説明します。

---

## 技術スタック一覧

| 分類 | 技術 | バージョン | 用途 |
|------|------|-----------|------|
| **Frontend** | React | 19.x | UIライブラリ |
| | Vite | 7.x | ビルドツール・開発サーバー |
| | React Router | 7.x | クライアントサイドルーティング |
| | TypeScript | 5.9.x | 型安全性 |
| **Backend** | Node.js | 22 | サーバーランタイム |
| | Express | 5.x | Webフレームワーク |
| | Prisma | 7.x | ORM（Driver Adapter Pattern） |
| | Zod | 4.x | バリデーション |
| **Database** | PostgreSQL | 15 | リレーショナルデータベース |
| | Redis | 7 | キャッシュ・セッション |
| **Storage** | Cloudflare R2 | - | 本番画像ストレージ（S3互換） |
| | Local Filesystem | - | 開発・テスト用ストレージ |
| **Authentication** | JWT | - | トークンベース認証（EdDSA署名） |
| | Argon2 | - | パスワードハッシュ |
| | TOTP | - | 二段階認証 |
| **Testing** | Vitest | 4.x | ユニット・統合テスト |
| | Playwright | 1.40.x | E2Eテスト |
| | Storybook | 10.x | UIコンポーネントテスト |
| **Development** | Docker | - | コンテナ化 |
| | Docker Compose | - | ローカル開発環境 |
| | TypeScript | 5.9.x | 型安全性 |
| | ESLint | 9.x | Linter（Flat Config） |
| | Prettier | 3.x | フォーマッター |
| **Deployment** | Railway | - | ホスティング |
| | GitHub Actions | - | CI/CD |
| **Monitoring** | Sentry | - | エラートラッキング |

---

## Frontend

### React 19

**選定理由:**
- 最新の機能（Concurrent Features、自動バッチング、Server Components対応）
- 豊富なエコシステム
- コミュニティのサポート
- パフォーマンス最適化

**特徴:**
- 関数コンポーネント + Hooks
- 仮想DOM
- 宣言的UI
- React Compiler対応準備

### Vite 7

**選定理由:**
- 高速な開発サーバー（ESビルド）
- HMR（Hot Module Replacement）
- 本番ビルドの最適化（Rollup）
- モダンなビルドツール

**特徴:**
- ネイティブESモジュール
- 高速なコールドスタート
- プラグインエコシステム
- Environment API対応

### React Router 7

**選定理由:**
- React公式推奨ルーター
- ネストルート対応
- データローディング統合
- Remix統合による強化されたAPI

**特徴:**
- 型安全なルーティング
- 宣言的なルート定義
- フレームワークモード対応

---

## Backend

### Node.js 22

**選定理由:**
- LTS（Long Term Support）
- ESモジュール対応
- パフォーマンス向上
- 豊富なパッケージエコシステム
- TypeScript 5.x との互換性

### Express 5

**選定理由:**
- 軽量・柔軟なWebフレームワーク
- ミドルウェアエコシステム
- RESTful API構築に最適
- 広く採用されている
- async/await ネイティブサポート

### Prisma 7（Driver Adapter Pattern）

**選定理由:**
- 型安全なORM（TypeScript統合）
- マイグレーション管理
- 自動スキーマ生成
- パフォーマンス最適化（クエリ最適化）
- Driver Adapter Patternによる柔軟な接続管理

**特徴:**
- Prisma Schema（スキーマ定義）
- Prisma Client（型安全なクライアント、カスタム出力先対応）
- Prisma Migrate（マイグレーション）
- `@prisma/adapter-pg` による PostgreSQL Driver Adapter

**Driver Adapter Pattern:**
```typescript
// db.ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
```

**利点:**
- より細かい接続制御
- コネクションプーリングのカスタマイズ
- 外部のデータベースドライバーとの統合

### Zod

**選定理由:**
- TypeScript統合
- 型推論
- 宣言的なスキーマ定義
- カスタムバリデーション

---

## Database

### PostgreSQL 15

**選定理由:**
- 信頼性・安定性
- ACID準拠
- 豊富な機能（JSON、Full-Text Search）
- 拡張性（Replication、Sharding）

**特徴:**
- リレーショナルデータベース
- トランザクション管理
- インデックス最適化

### Redis 7

**選定理由:**
- 高速なインメモリストア
- セッション管理に最適
- レートリミットに最適
- TTL（Time To Live）対応

**用途:**
- セッション管理
- レートリミット
- 一時データキャッシュ

---

## Storage

### ストレージ抽象化レイヤー

ArchiTrackは、環境に応じて異なるストレージバックエンドを使用できるよう、ストレージ抽象化レイヤーを採用しています。

**設計パターン:**
- Strategy Pattern + Factory Pattern
- StorageProviderインターフェースによる抽象化
- シングルトンでプロバイダーを管理

### Cloudflare R2（本番環境）

**選定理由:**
- S3互換API
- Egress費用なし（転送料無料）
- グローバルCDN統合
- 署名付きURLによるセキュアなアクセス

**特徴:**
- AWS SDK互換
- 高可用性
- 従量課金
- Workers統合可能

### Local Filesystem（開発・テスト環境）

**選定理由:**
- セットアップ不要
- 外部依存なし
- CI環境でtmpfs利用可能

**用途:**
- ローカル開発
- 自動テスト
- CI/CD

> 詳細は[ストレージ構成](storage-configuration.md)を参照してください。

---

## Authentication

### JWT（EdDSA署名）

**選定理由:**
- ステートレス認証
- EdDSA（Ed25519）でGPU攻撃耐性
- トークンリフレッシュ対応
- 広く採用されている

### Argon2id

**選定理由:**
- OWASP推奨
- メモリハード関数（GPU攻撃耐性）
- パスワードハッシュコンテスト優勝
- bcryptより安全

### TOTP（Time-based One-Time Password）

**選定理由:**
- 標準準拠（RFC 6238）
- Google Authenticator等と互換
- 時間ベース（同期不要）

---

## Testing

### Vitest

**選定理由:**
- Viteと統合
- 高速（Viteのビルドツール使用）
- Jest互換API
- TypeScript対応

**用途:**
- ユニットテスト
- 統合テスト
- カバレッジ測定

### Playwright

**選定理由:**
- モダンなE2Eテストツール
- クロスブラウザ対応
- 自動待機（flaky test削減）
- デバッグツール充実

**用途:**
- E2Eテスト
- UIテスト
- APIテスト

### Storybook 10

**選定理由:**
- UIコンポーネントの独立開発
- ビジュアル回帰テスト
- インタラクションテスト
- アクセシビリティテスト（WCAG 2.1 AA準拠）

**特徴:**
- React-Vite統合
- CSF 3.0（Component Story Format）
- Test Runner統合
- Portable Storiesサポート

---

## Development

### Docker & Docker Compose

**選定理由:**
- 一貫した開発環境
- 環境依存の問題削減
- 本番環境との一致
- マルチサービス管理

### TypeScript

**選定理由:**
- 型安全性
- IDEサポート（補完・リファクタリング）
- 早期エラー検出
- ドキュメント代わり

### ESLint

**選定理由:**
- コード品質チェック
- ベストプラクティス強制
- カスタムルール対応
- 自動修正

### Prettier

**選定理由:**
- コードフォーマット統一
- チーム開発での一貫性
- Git差分の最小化
- 設定不要（opinionated）

---

## Deployment

### Railway

**選定理由:**
- 簡単なデプロイ
- GitHub統合
- 自動スケーリング
- PostgreSQL・Redis統合
- 無料枠あり

**特徴:**
- Nixpacksビルダー
- 環境変数管理
- ログ管理

### GitHub Actions

**選定理由:**
- GitHub統合
- 無料（パブリックリポジトリ）
- YAMLで設定
- 豊富なActions

**用途:**
- CI（テスト・ビルド）
- CD（デプロイ）

---

## Monitoring

### Sentry

**選定理由:**
- リアルタイムエラートラッキング
- スタックトレース
- ユーザーコンテキスト
- GitHub統合（Issueリンク）

---

## 技術選定の基準

### 評価基準

1. **成熟度**: 安定版、LTS対応
2. **コミュニティ**: 活発な開発、豊富なドキュメント
3. **パフォーマンス**: 高速、スケーラブル
4. **開発体験**: TypeScript対応、開発ツール充実
5. **セキュリティ**: ベストプラクティス準拠
6. **コスト**: オープンソース、無料枠

---

## 次のステップ

- [システム構成](system-overview.md): システム全体像
- [データフロー](data-flow.md): データの流れ
- [セキュリティ設計](security-design.md): セキュリティ層
