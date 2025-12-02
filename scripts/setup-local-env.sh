#!/bin/bash
# scripts/setup-local-env.sh
# ローカル開発環境の環境変数をセットアップするスクリプト

set -e  # エラーが発生したら即座に終了

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
ENV_FILE="$BACKEND_DIR/.env"
ENV_EXAMPLE="$BACKEND_DIR/.env.example"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 ArchiTrack ローカル開発環境セットアップ"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# .env.exampleの存在チェック
if [ ! -f "$ENV_EXAMPLE" ]; then
  echo "❌ エラー: $ENV_EXAMPLE が見つかりません"
  exit 1
fi

# 既存の.envファイルチェック
if [ -f "$ENV_FILE" ]; then
  echo "⚠️  既に .env ファイルが存在します: $ENV_FILE"
  echo ""
  read -p "上書きしますか？ (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "✋ セットアップをスキップしました"
    echo ""
    echo "既存の .env ファイルをチェックするには:"
    echo "  npm --prefix backend run check:env"
    exit 0
  fi

  # バックアップを作成
  BACKUP_FILE="$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
  cp "$ENV_FILE" "$BACKUP_FILE"
  echo "📦 既存の .env をバックアップしました: $BACKUP_FILE"
  echo ""
fi

# .env.exampleをコピー
echo "📄 .env.example から .env を作成しています..."
cp "$ENV_EXAMPLE" "$ENV_FILE"
echo "✅ .env ファイルを作成しました"
echo ""

# JWT鍵の生成
echo "🔑 JWT認証鍵を生成しています..."
cd "$BACKEND_DIR"

# Node.jsのバージョンチェック
if ! command -v node &> /dev/null; then
  echo "❌ エラー: Node.js がインストールされていません"
  exit 1
fi

# npm installがされているかチェック
if [ ! -d "node_modules" ]; then
  echo "📦 依存関係をインストールしています..."
  npm install
  echo ""
fi

# JWT鍵生成スクリプトを実行
if npm run generate-keys > /dev/null 2>&1; then
  echo "✅ JWT鍵を生成しました"
else
  echo "⚠️  警告: JWT鍵の生成に失敗しました"
  echo "   手動で生成してください: npm run generate-keys"
fi
echo ""

# 2FA暗号化鍵の生成
echo "🔐 2FA暗号化鍵を生成しています..."
TWO_FACTOR_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# .envファイルにTWO_FACTOR_ENCRYPTION_KEYを追記（コメント化されている場合は置換）
if grep -q "^#.*TWO_FACTOR_ENCRYPTION_KEY=" "$ENV_FILE"; then
  # コメント化されている行を置換
  sed -i.tmp "s|^#.*TWO_FACTOR_ENCRYPTION_KEY=.*|TWO_FACTOR_ENCRYPTION_KEY=$TWO_FACTOR_KEY|" "$ENV_FILE"
  rm -f "$ENV_FILE.tmp"
elif grep -q "^TWO_FACTOR_ENCRYPTION_KEY=" "$ENV_FILE"; then
  # 既に設定されている場合は置換
  sed -i.tmp "s|^TWO_FACTOR_ENCRYPTION_KEY=.*|TWO_FACTOR_ENCRYPTION_KEY=$TWO_FACTOR_KEY|" "$ENV_FILE"
  rm -f "$ENV_FILE.tmp"
else
  # 設定がない場合は追記
  echo "" >> "$ENV_FILE"
  echo "TWO_FACTOR_ENCRYPTION_KEY=$TWO_FACTOR_KEY" >> "$ENV_FILE"
fi
echo "✅ 2FA暗号化鍵を生成して .env に追加しました"
echo ""

# 環境変数の検証
echo "🔍 環境変数の設定を検証しています..."
echo ""
if npm run check:env; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ セットアップが完了しました！"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "次のステップ:"
  echo "  1. backend/.env を確認して、必要に応じて値を調整してください"
  echo "  2. データベースとRedisを起動してください:"
  echo "     docker compose up -d postgres redis"
  echo "  3. データベースマイグレーションを実行してください:"
  echo "     npm --prefix backend run prisma:migrate"
  echo "  4. 開発サーバーを起動してください:"
  echo "     npm --prefix backend run dev"
  echo ""
else
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "⚠️  セットアップは完了しましたが、環境変数に問題があります"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "上記のエラーを修正してから、再度確認してください:"
  echo "  npm --prefix backend run check:env"
  echo ""
  exit 1
fi

cd "$PROJECT_ROOT"
