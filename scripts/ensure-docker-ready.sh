#!/bin/bash
# scripts/ensure-docker-ready.sh
# E2Eテスト実行前にDockerコンテナの準備を確認・実行するスクリプト

set -e

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 設定
BACKEND_URL="http://localhost:3000/health"
FRONTEND_URL="http://localhost:5173"
MAX_WAIT_SECONDS=120
CHECK_INTERVAL=3

# カラー出力（対応端末のみ）
if [ -t 1 ]; then
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  RED='\033[0;31m'
  BLUE='\033[0;34m'
  NC='\033[0m' # No Color
else
  GREEN=''
  YELLOW=''
  RED=''
  BLUE=''
  NC=''
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🐳 E2Eテスト用Dockerコンテナ準備${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd "$PROJECT_ROOT"

# Docker Composeが利用可能かチェック
if ! command -v docker &> /dev/null; then
  echo -e "${RED}❌ エラー: Dockerがインストールされていません${NC}"
  exit 1
fi

# コンテナの状態を確認する関数
check_container_health() {
  local container_name=$1
  local status=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "not_found")
  echo "$status"
}

# 全コンテナが起動しているか確認
check_all_containers_running() {
  local containers=("architrack-backend" "architrack-frontend" "architrack-postgres" "architrack-redis" "architrack-mailhog")
  for container in "${containers[@]}"; do
    local running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null || echo "false")
    if [ "$running" != "true" ]; then
      return 1
    fi
  done
  return 0
}

# 全コンテナがhealthyか確認
check_all_containers_healthy() {
  local containers=("architrack-backend" "architrack-frontend" "architrack-postgres" "architrack-redis" "architrack-mailhog")
  for container in "${containers[@]}"; do
    local health=$(check_container_health "$container")
    if [ "$health" != "healthy" ]; then
      return 1
    fi
  done
  return 0
}

# エンドポイントへの接続を確認
check_endpoint() {
  local url=$1
  curl -sf "$url" > /dev/null 2>&1
  return $?
}

# Step 1: コンテナの状態確認
echo -e "${YELLOW}📋 コンテナの状態を確認しています...${NC}"

if check_all_containers_running && check_all_containers_healthy; then
  echo -e "${GREEN}✅ すべてのコンテナが起動済みです${NC}"

  # 念のためエンドポイントも確認
  if check_endpoint "$BACKEND_URL" && check_endpoint "$FRONTEND_URL"; then
    echo -e "${GREEN}✅ バックエンドとフロントエンドへの接続を確認しました${NC}"
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}🚀 E2Eテストの準備が完了しました${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
  fi
fi

# Step 2: コンテナを起動
echo -e "${YELLOW}🚀 Dockerコンテナを起動しています...${NC}"
docker compose up -d

# Step 3: ヘルスチェックを待機
echo ""
echo -e "${YELLOW}⏳ コンテナのヘルスチェックを待機しています...${NC}"
echo "   (最大${MAX_WAIT_SECONDS}秒)"
echo ""

elapsed=0
while [ $elapsed -lt $MAX_WAIT_SECONDS ]; do
  # 進捗表示
  backend_health=$(check_container_health "architrack-backend")
  frontend_health=$(check_container_health "architrack-frontend")
  postgres_health=$(check_container_health "architrack-postgres")
  redis_health=$(check_container_health "architrack-redis")
  mailhog_health=$(check_container_health "architrack-mailhog")

  # ステータス表示（同じ行に上書き）
  printf "\r   postgres: %-10s redis: %-10s mailhog: %-10s backend: %-10s frontend: %-10s [%3ds]" \
    "$postgres_health" "$redis_health" "$mailhog_health" "$backend_health" "$frontend_health" "$elapsed"

  # 全てhealthyになったか確認
  if [ "$backend_health" = "healthy" ] && \
     [ "$frontend_health" = "healthy" ] && \
     [ "$postgres_health" = "healthy" ] && \
     [ "$redis_health" = "healthy" ] && \
     [ "$mailhog_health" = "healthy" ]; then
    echo ""
    echo ""

    # 最終確認：エンドポイントへの接続
    if check_endpoint "$BACKEND_URL" && check_endpoint "$FRONTEND_URL"; then
      echo -e "${GREEN}✅ すべてのコンテナがhealthyになりました${NC}"
      echo -e "${GREEN}✅ エンドポイントへの接続を確認しました${NC}"
      echo ""
      echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
      echo -e "${GREEN}🚀 E2Eテストの準備が完了しました${NC}"
      echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
      exit 0
    fi
  fi

  sleep $CHECK_INTERVAL
  elapsed=$((elapsed + CHECK_INTERVAL))
done

# タイムアウト
echo ""
echo ""
echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${RED}❌ タイムアウト: コンテナの準備が完了しませんでした${NC}"
echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "コンテナの状態を確認してください:"
echo "  docker ps -a"
echo "  docker logs architrack-backend"
echo ""
exit 1
