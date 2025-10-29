# プロジェクト構造

## ルートディレクトリ構成

```
ArchiTrack/
├── .claude/                 # Claude Codeカスタマイズ
│   └── commands/           # カスタムスラッシュコマンド
│       └── kiro/           # Kiro開発コマンド群
├── .github/                # GitHub設定
│   └── workflows/          # GitHub Actions CI/CD
├── .kiro/                  # Kiro開発管理
│   ├── steering/           # プロジェクトステアリング
│   └── specs/              # 機能仕様（動的生成）
├── frontend/               # フロントエンドアプリケーション
│   ├── src/                # ソースコード
│   ├── package.json        # 依存関係
│   ├── vite.config.js      # Vite設定
│   ├── nginx.conf          # 本番環境nginx設定
│   └── .env.example        # 環境変数テンプレート
├── backend/                # バックエンドAPI
│   ├── src/                # ソースコード
│   ├── package.json        # 依存関係
│   └── .env.example        # 環境変数テンプレート
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

**想定される構成:**

```
frontend/
├── src/
│   ├── components/        # UIコンポーネント
│   ├── pages/             # ページコンポーネント
│   ├── utils/             # ユーティリティ関数
│   ├── services/          # APIクライアント
│   ├── stores/            # 状態管理（Vuex/Redux/Pinia等）
│   ├── assets/            # 静的アセット
│   └── main.js            # エントリーポイント
├── public/                # 公開静的ファイル
├── tests/                 # テストコード
└── dist/                  # ビルド成果物（.gitignore）
```

### `backend/`

バックエンドAPIのソースコードと設定。

**想定される構成:**

```
backend/
├── src/
│   ├── controllers/       # APIコントローラー
│   ├── models/            # データモデル
│   ├── services/          # ビジネスロジック
│   ├── routes/            # ルーティング定義
│   ├── middlewares/       # ミドルウェア
│   ├── utils/             # ユーティリティ関数
│   └── index.js           # エントリーポイント
├── tests/                 # テストコード
└── dist/                  # ビルド成果物（TypeScript使用時）
```

## コード構成パターン

### モジュール分割の原則

1. **単一責任**: 各モジュールは1つの責務を持つ
2. **疎結合**: モジュール間の依存を最小限に
3. **高凝集**: 関連する機能を同じモジュールに配置
4. **階層化**: プレゼンテーション層・ビジネスロジック層・データ層を分離

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

### .gitignore

以下を除外：

- `node_modules/` - 依存関係
- `.env` - 環境変数（機密情報）
- `dist/`, `build/` - ビルド成果物
- IDE設定ファイル
- ログファイル
