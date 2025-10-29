# 技術スタック

## アーキテクチャ

ArchiTrackは、フロントエンドとバックエンドを分離したモノレポ構成を採用しています。Claude Codeのカスタムコマンド機能を活用し、開発ワークフローを自動化しています。

### システム構成

```
ArchiTrack/
├── frontend/     # フロントエンドアプリケーション
├── backend/      # バックエンドAPI
├── .claude/      # Claude Codeカスタムコマンド
└── .kiro/        # ステアリング・スペック管理
```

## フロントエンド

### 技術スタック（予定）

- **ビルドツール**: Vite
- **開発サーバー**: Vite Dev Server
- **Webサーバー（本番）**: nginx
- **パッケージマネージャ**: npm/yarn/pnpm

### 設定ファイル

- `frontend/vite.config.js` - Vite設定
- `frontend/nginx.conf` - nginx設定
- `frontend/package.json` - 依存関係管理
- `frontend/.env.example` - 環境変数テンプレート

## バックエンド

### 技術スタック（予定）

- **パッケージマネージャ**: npm/yarn/pnpm
- **設定管理**: .envファイル

### 設定ファイル

- `backend/package.json` - 依存関係管理
- `backend/.env.example` - 環境変数テンプレート

## 開発環境

### 必須ツール

- **Node.js**: フロントエンド・バックエンドの実行環境
- **Git**: バージョン管理
- **Claude Code**: AI支援開発環境
- **テキストエディタ/IDE**: VS Code推奨

### 推奨ツール

- **GitHub CLI (gh)**: PRやイシュー管理
- **Docker**: コンテナ化（将来的な拡張）

## よく使うコマンド

### プロジェクトセットアップ

```bash
# フロントエンド依存関係のインストール
cd frontend && npm install

# バックエンド依存関係のインストール
cd backend && npm install
```

### 開発サーバー起動

```bash
# フロントエンド開発サーバー
cd frontend && npm run dev

# バックエンド開発サーバー
cd backend && npm run dev
```

### Kiroスラッシュコマンド

```bash
# ステアリングドキュメント作成・更新
/kiro:steering

# 新規仕様の初期化
/kiro:spec-init [詳細な説明]

# 要件定義の生成
/kiro:spec-requirements [feature-name]

# 技術設計の作成
/kiro:spec-design [feature-name]

# 実装タスクの生成
/kiro:spec-tasks [feature-name]

# 仕様の進捗確認
/kiro:spec-status [feature-name]

# 設計品質レビュー
/kiro:validate-design [feature-name]

# 実装ギャップ分析
/kiro:validate-gap [feature-name]
```

### Git操作

```bash
# ステータス確認
git status

# 変更のコミット
git add .
git commit -m "commit message"

# リモートへプッシュ
git push origin main
```

## 環境変数

### フロントエンド環境変数

詳細は `frontend/.env.example` を参照してください。

### バックエンド環境変数

詳細は `backend/.env.example` を参照してください。

## ポート設定

デフォルトのポート設定（予定）:

- **フロントエンド**: 5173 (Vite default)
- **バックエンド**: 3000 (または環境変数で指定)
- **nginx（本番）**: 80/443

## CI/CD

### GitHub Actions

`.github/workflows/ci.yml` でCI/CDパイプラインを定義しています。

- **自動テスト**: プッシュ・PR時に実行
- **ビルド検証**: フロントエンド・バックエンドのビルド確認
- **リンター**: コード品質チェック（設定予定）

## 開発ガイドライン

### コーディング規約

- **言語**: 思考は英語、コメントとドキュメントは日本語
- **コミットメッセージ**: 日本語で明確に記述
- **ブランチ戦略**: mainブランチベースの開発

### ワークフロー

1. `/kiro:steering` でプロジェクトコンテキストを最新化
2. `/kiro:spec-init` で新機能の仕様を初期化
3. 要件 → 設計 → タスク → 実装の順に進める
4. 各フェーズで人間のレビューを実施
5. タスク完了時にステータスを更新
