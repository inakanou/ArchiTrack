# 前提条件

ArchiTrackの開発には以下のツールが必要です。

---

## 必須ツール

### Node.js 20以上
フロントエンド・バックエンドの実行環境

**インストール方法:**
```bash
# nvm経由（推奨）
nvm install 20
nvm use 20

# 確認
node --version  # v20.x.x
npm --version   # 10.x.x
```

### Docker & Docker Compose
コンテナ化された開発環境（PostgreSQL、Redis、アプリケーション）

**インストール方法:**
- Docker Desktop: https://www.docker.com/products/docker-desktop
- Linux: https://docs.docker.com/engine/install/

**確認:**
```bash
docker --version
docker-compose --version
```

### Claude Code
AI支援開発環境（推奨）

**インストール方法:**
- https://claude.ai/claude-code

### jq
JSONパーサー（Claude Codeのカスタムフック実行に必要）

**インストール方法:**
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Windows (Chocolatey)
choco install jq

# Windows (Scoop)
scoop install jq
```

### Chromium（システム依存関係）
E2Eテスト（Playwright）の実行に必要

**インストール方法:**
```bash
# プロジェクトルートで依存関係をインストール
npm install
# ↑ postinstallフックでPlaywright Chromiumが自動インストールされます

# システム依存関係をインストール（WSL2/Linux環境、初回のみ）
sudo npx playwright install-deps chromium

# macOS/Windowsの場合
# 通常は不要（Playwrightが自動的に必要な依存関係を管理）
```

**注意事項:**
- システム依存関係のインストールは、環境ごとに初回のみ実行すれば以降は不要です
- E2Eテストを実行しない場合は、このステップをスキップできます

---

## 推奨ツール

### GitHub CLI
PR/Issue管理、CI/CD操作に必要

**インストール方法:**
```bash
# Ubuntu/Debian
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh

# macOS (Homebrew)
brew install gh

# Windows (winget)
winget install --id GitHub.cli
```

**認証設定:**
```bash
# GitHub認証（ブラウザ経由）
gh auth login

# 必要なスコープ:
# - repo (リポジトリへのフルアクセス)
# - read:org (組織情報の読み取り)
# - workflow (GitHub Actionsワークフローの管理)
```

**確認コマンド:**
```bash
gh --version
gh auth status
```

### Railway CLI
本番環境のデプロイ・管理に必要

**インストール方法:**
```bash
# npm経由（推奨）
npm install -g @railway/cli

# またはcurlスクリプト経由（Linux/macOS）
sh -c "$(curl -fsSL https://railway.app/install.sh)"
```

**認証設定:**
```bash
# Railway認証（ブラウザ経由）
railway login

# プロジェクトリンク（プロジェクトルートで実行）
cd ArchiTrack
railway link
```

**確認コマンド:**
```bash
railway --version
railway whoami
```

### cc-sdd (Claude Code Spec Driven Development)

Kiro-style開発ワークフローのスラッシュコマンドが利用可能になります。

**インストール方法:**
```bash
# 最新版のインストール・更新
npx cc-sdd@latest --lang ja
```

---

## 次のステップ

前提条件の準備が完了したら、[インストール手順](installation.md)に進んでください。
