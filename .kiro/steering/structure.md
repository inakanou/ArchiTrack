# プロジェクト構造

## ルートディレクトリ構成

```
ArchiTrack/
├── .claude/                 # Claude Codeカスタマイズ
│   ├── commands/           # カスタムスラッシュコマンド
│   │   └── kiro/           # Kiro開発コマンド群
│   └── hooks/              # Claude Code フック
│       └── hook_pre_commands.sh  # コマンド実行前フック
├── .github/                # GitHub設定
│   └── workflows/          # GitHub Actions CI/CD
│       └── ci.yml          # CI/CDパイプライン定義
├── .husky/                 # Git フック管理
│   └── pre-commit          # pre-commitフックスクリプト
├── .kiro/                  # Kiro開発管理
│   ├── steering/           # プロジェクトステアリング
│   │   ├── product.md      # プロダクト概要
│   │   ├── tech.md         # 技術スタック
│   │   └── structure.md    # プロジェクト構造
│   └── specs/              # 機能仕様（動的生成）
├── frontend/               # フロントエンドアプリケーション
│   ├── src/                # ソースコード
│   │   ├── App.jsx         # メインAppコンポーネント
│   │   └── main.jsx        # エントリーポイント
│   ├── public/             # 公開静的ファイル
│   ├── package.json        # 依存関係
│   ├── vite.config.js      # Vite設定
│   ├── nginx.conf          # 本番環境nginx設定
│   ├── Dockerfile          # 本番環境Dockerイメージ
│   ├── Dockerfile.dev      # 開発環境Dockerイメージ
│   ├── railway.toml        # Railway デプロイ設定
│   ├── .eslintrc.json      # ESLint設定
│   └── .env.example        # 環境変数テンプレート
├── backend/                # バックエンドAPI
│   ├── src/                # ソースコード
│   │   ├── index.js        # Expressサーバーエントリーポイント
│   │   ├── db.js           # PostgreSQL接続管理
│   │   └── redis.js        # Redis接続管理
│   ├── package.json        # 依存関係
│   ├── Dockerfile.dev      # 開発環境Dockerイメージ
│   ├── railway.toml        # Railway デプロイ設定
│   ├── .eslintrc.json      # ESLint設定
│   └── .env.example        # 環境変数テンプレート
├── docker-compose.yml      # ローカル開発環境定義
├── .prettierrc             # Prettierコードフォーマット設定
├── .gitignore              # Git除外設定
├── CLAUDE.md               # Claude Code設定・ガイドライン
└── README.md               # プロジェクトREADME
```

## 主要ディレクトリの詳細

### `.claude/commands/kiro/`

Kiro-styleスペック駆動開発のカスタムコマンドを格納します。

**主要コマンド:**

- `steering.md` - ステアリングドキュメント管理
- `steering-custom.md` - カスタムステアリング作成
- `spec-init.md` - 新規仕様初期化
- `spec-requirements.md` - 要件定義生成
- `spec-design.md` - 技術設計作成
- `spec-tasks.md` - 実装タスク生成
- `spec-impl.md` - タスク実装実行
- `spec-status.md` - 仕様進捗確認
- `validate-design.md` - 設計品質レビュー
- `validate-gap.md` - 実装ギャップ分析

### `.claude/hooks/`

Claude Codeのカスタムフックスクリプト。

**構成:**

- `hook_pre_commands.sh` - コマンド実行前に実行されるフック
- `rules/hook_pre_commands_rules.json` - フック実行ルール定義

### `.husky/`

Gitフック管理ディレクトリ（Husky v9使用）。

**主要ファイル:**

- `pre-commit` - コミット前に自動実行されるスクリプト
  - バックエンドの変更: Prettier + ESLintを実行
  - フロントエンドの変更: Prettier + ESLintを実行
  - lint-stagedと連携して、ステージングされたファイルのみ処理

**有効化方法:**

```bash
git config core.hooksPath .husky
```

### `.kiro/steering/`

プロジェクト全体のコンテキストを提供するステアリングドキュメント。

**コアファイル（常時読み込み）:**

- `product.md` - プロダクト概要と価値提案
- `tech.md` - 技術スタック・開発環境
- `structure.md` - プロジェクト構造・コーディング規約

**カスタムファイル（必要に応じて）:**

プロジェクト固有のガイドラインを追加可能。

### `.kiro/specs/[feature-name]/`

個別機能の仕様を管理します（動的生成）。

**標準構成:**

```
.kiro/specs/[feature-name]/
├── requirements.md         # 要件定義
├── design.md              # 技術設計
├── tasks.md               # 実装タスク一覧
└── implementation/        # 実装記録（オプション）
```

### `frontend/`

フロントエンドアプリケーションのソースコードと設定。

**現在の構成:**

```
frontend/
├── src/
│   ├── App.jsx            # メインAppコンポーネント
│   └── main.jsx           # Reactエントリーポイント
├── public/                # 公開静的ファイル
├── dist/                  # ビルド成果物（.gitignore）
├── Dockerfile             # 本番環境用（nginx）
├── Dockerfile.dev         # 開発環境用（Vite dev server）
├── railway.toml           # Railway デプロイ設定
├── nginx.conf             # nginx本番環境設定
├── vite.config.js         # Vite設定
├── package.json           # 依存関係（lint-staged設定を含む）
├── .eslintrc.json         # ESLint設定
└── .env.example           # 環境変数テンプレート
```

**package.json の lint-staged設定:**

```json
"lint-staged": {
  "*.{js,jsx}": [
    "prettier --write",
    "eslint --fix"
  ]
}
```

**想定される拡張:**

```
frontend/src/
├── components/        # UIコンポーネント（今後追加）
├── pages/             # ページコンポーネント（今後追加）
├── utils/             # ユーティリティ関数（今後追加）
├── services/          # APIクライアント（今後追加）
├── stores/            # 状態管理（今後追加）
└── assets/            # 静的アセット（今後追加）
```

### `backend/`

バックエンドAPIのソースコードと設定。

**現在の構成:**

```
backend/
├── src/
│   ├── index.js           # Expressサーバーエントリーポイント
│   ├── db.js              # PostgreSQL接続管理（lazy initialization）
│   └── redis.js           # Redis接続管理（lazy initialization）
├── Dockerfile.dev         # 開発環境用Dockerイメージ
├── railway.toml           # Railway デプロイ設定
├── package.json           # 依存関係（lint-staged設定を含む）
├── .eslintrc.json         # ESLint設定
└── .env.example           # 環境変数テンプレート
```

**package.json の lint-staged設定:**

```json
"lint-staged": {
  "*.js": [
    "prettier --write",
    "eslint --fix"
  ]
}
```

**想定される拡張:**

```
backend/src/
├── controllers/       # APIコントローラー（今後追加）
├── models/            # データモデル（今後追加）
├── services/          # ビジネスロジック（今後追加）
├── routes/            # ルーティング定義（今後追加）
├── middlewares/       # ミドルウェア（今後追加）
└── utils/             # ユーティリティ関数（今後追加）
```

**主要ファイルの説明:**

- `index.js`: Expressサーバーのメインファイル。ヘルスチェック、APIルート、エラーハンドリング、favicon処理を提供
- `db.js`: PostgreSQL接続プールのlazy initialization実装。初回アクセス時に接続確立
- `redis.js`: Redisクライアントのlazy initialization実装。初回アクセス時に接続確立

**実装済みAPI:**

- `GET /health`: ヘルスチェックエンドポイント。サービス状態とDB/Redis接続状態を返却
- `GET /api`: API情報エンドポイント。バージョン情報を返却
- `GET /favicon.ico`: 404エラー防止用faviconハンドラー

## Docker構成

### `docker-compose.yml`

ローカル開発環境全体を定義します。

**サービス構成:**

- `postgres`: PostgreSQL 15データベース（ポート5432）
- `redis`: Redis 7キャッシュ（ポート6379）
- `backend`: Node.js/Expressバックエンド（ポート3000）
- `frontend`: React/Viteフロントエンド（ポート5173）

各サービスはヘルスチェック付きで起動し、依存関係を適切に管理します。

### Dockerfile構成

**Frontend:**
- `Dockerfile`: 本番環境用。マルチステージビルドでViteビルド→nginx配信
- `Dockerfile.dev`: 開発環境用。Vite dev serverでホットリロード対応

**Backend:**
- `Dockerfile.dev`: 開発環境用。Node.js --watchでホットリロード対応

## コード構成パターン

### モジュール分割の原則

1. **単一責任**: 各モジュールは1つの責務を持つ
2. **疎結合**: モジュール間の依存を最小限に
3. **高凝集**: 関連する機能を同じモジュールに配置
4. **階層化**: プレゼンテーション層・ビジネスロジック層・データ層を分離
5. **Lazy Initialization**: データベース・キャッシュ接続は初回アクセス時に確立

### ディレクトリ命名規則

- **複数形を使用**: `components/`, `services/`, `models/`
- **小文字ケバブケース**: `user-profile/`, `api-client/`
- **目的を明確に**: `utils/`（汎用）vs `helpers/`（特定機能補助）

## ファイル命名規則

### 一般規則

- **拡張子**: `.js`, `.ts`, `.jsx`, `.tsx`, `.vue`など適切な拡張子を使用
- **ケース**:
  - コンポーネント: PascalCase (`UserProfile.jsx`)
  - ユーティリティ: camelCase (`formatDate.js`)
  - 定数: UPPER_SNAKE_CASE (`API_ENDPOINTS.js`)
- **意味のある名前**: 機能を明確に表現

### 特殊ファイル

- `index.js` - ディレクトリのエントリーポイント・エクスポート集約
- `*.test.js` - テストファイル
- `*.spec.js` - スペックファイル（BDD）
- `.env.example` - 環境変数テンプレート

## インポート構成

### インポート順序

1. 外部ライブラリ（`react`, `vue`, `express`等）
2. エイリアスパス（`@/components`, `@/utils`）
3. 相対パス（`./`, `../`）
4. スタイルシート・アセット

### 例

```javascript
// 外部ライブラリ
import React from 'react'
import axios from 'axios'

// エイリアスパス
import Button from '@/components/Button'
import { formatDate } from '@/utils/date'

// 相対パス
import UserCard from './UserCard'
import config from '../config'

// スタイル
import './styles.css'
```

## 主要なアーキテクチャ原則

### 1. スペック駆動開発

すべての主要機能は`.kiro/specs/`で仕様管理を行い、要件→設計→タスク→実装の流れを守ります。

### 2. ステアリングドキュメントの活用

プロジェクト全体のコンテキストを`.kiro/steering/`で維持し、AIアシスタントとの一貫した協業を実現します。

### 3. フロントエンド・バックエンド分離

- 各層が独立して開発・デプロイ可能
- API契約に基づく疎結合な連携
- それぞれのスケーラビリティを確保

### 4. 段階的な実装

大きな機能を小さなタスクに分解し、段階的に実装・検証を進めます。

### 5. 人間のレビュー重視

各フェーズ（要件・設計・タスク）で人間のレビューを必須とし、早期の問題発見を促進します。

## コード品質管理ファイル

### `.prettierrc`

プロジェクトルートに配置されたPrettier設定ファイル。フロントエンドとバックエンドで共通のフォーマットルールを定義：

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "arrowParens": "always"
}
```

### lint-staged統合

各 `package.json` に `lint-staged` セクションを定義し、ステージングされたファイルに対してPrettierとESLintを順次実行します。

## バージョン管理規約

### ブランチ戦略

- `main` - 本番環境・安定版
- `feature/*` - 機能開発ブランチ（必要に応じて）
- `fix/*` - バグ修正ブランチ（必要に応じて）

### コミットメッセージ

日本語で明確に記述し、以下の情報を含めます：

- 変更の概要（1行目）
- 詳細な説明（必要に応じて）
- 関連する仕様やイシュー番号

### Pre-commitフック

`.husky/pre-commit` により、コミット前に自動的に以下が実行されます：

1. 変更されたバックエンドファイル（`*.js`）: Prettier + ESLint
2. 変更されたフロントエンドファイル（`*.{js,jsx}`）: Prettier + ESLint

これにより、コード品質が自動的に維持されます。

### .gitignore

以下を除外：

- `node_modules/` - 依存関係
- `.env` - 環境変数（機密情報）
- `dist/`, `build/` - ビルド成果物
- IDE設定ファイル
- ログファイル
