# Build stage
FROM node:22.23.4-alpine3.24@sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202 AS build

WORKDIR /app

# Pin npm to the version declared in package.json's "packageManager" field via
# corepack. The image bundles npm 10.9.7, but npm's optional-dependency resolution
# for `canvas` differs across npm versions, so a mismatched npm rejects the committed
# package-lock.json as out of sync (EUSAGE). corepack guarantees the same npm that
# generated the lockfile is used here, keeping `npm ci` deterministic.
RUN corepack enable npm

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build argument for API URL
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Build argument for the Sentry destination (frontend error monitoring).
# Vite inlines VITE_* variables at build time, so the value must be present
# HERE, during `npm run build` - a value set only on the running container is
# never read. Declaring the ARG is what lets a deployment platform's service
# variable reach the bundle. When it is left unset (the default, and the case
# for every build in this repository), utils/sentry.ts returns early and
# monitoring emission is a deliberate no-op.
ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN

# Build app
RUN npm run build

# Production stage
FROM nginx:1.31.8-alpine3.24@sha256:713fc2ebfd92e8217db451477182ee91944b123d2b1ee9fd5a8c6e91ca6c3a11

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config template
COPY nginx.conf /etc/nginx/templates/default.conf.template

# セキュリティヘッダーのテンプレート（user-authentication 要件44.1・44.2）。公式イメージの
# entrypoint が /etc/nginx/conf.d/architrack/security-headers.conf を生成し、nginx.conf が取り込む
COPY nginx-security-headers.conf /etc/nginx/templates/architrack/security-headers.conf.template

# API の中継の共通設定（nginx.conf の /api/ と /csrf-token が取り込む。環境変数を含まない）
COPY nginx-proxy-params.conf /etc/nginx/architrack-proxy-params.conf

# API の中継先の起動前の検査（user-authentication design.md「画面配信」）。
# 公式イメージの entrypoint は /docker-entrypoint.d/ の実行可能なスクリプトを名前の順に
# 実行し、非 0 で起動を止める。設定の生成（20-envsubst-on-templates.sh）より前に置く
COPY nginx-require-backend-internal-url.sh /docker-entrypoint.d/05-require-backend-internal-url.sh
RUN chmod 755 /docker-entrypoint.d/05-require-backend-internal-url.sh

# API の中継先: backend の内部 URL（scheme://host[:port]）。既定を持たず、各環境で必ず渡す
# （試験・CI は compose の backend のサービス、本番・staging は Railway の変数）
ENV BACKEND_INTERNAL_URL=

# セキュリティヘッダーの環境ごとの値（nginx-security-headers.conf）。公式イメージの置き換えは
# 定義された環境変数だけを対象にするため、空の既定を定義して ${...} が文字のまま残らないようにする
# - CSP_IMG_SRC_EXTRA・CSP_CONNECT_SRC_EXTRA: CSP の画像・接続の追加の取得先（本番・staging は R2 の
#   配信元と Sentry の取り込み先、試験・CI は compose のローカルのストレージの配信元）
# - NGINX_HSTS_VALUE: 本番だけ設定する（空の環境では HSTS を付けない）
ENV CSP_IMG_SRC_EXTRA= \
    CSP_CONNECT_SRC_EXTRA= \
    NGINX_HSTS_VALUE=

# nginx.conf の resolver に /etc/resolv.conf の名前解決の宛先を渡す
# （公式イメージの 15-local-resolvers.envsh が NGINX_LOCAL_RESOLVERS を設定する）
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

# Railway uses PORT env variable
ENV PORT=80

# Expose port
EXPOSE $PORT

# nginx will automatically substitute $PORT in template
CMD ["nginx", "-g", "daemon off;"]
