# Build stage
FROM node:22-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy Prisma schema
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source files
COPY . .

# Generate Prisma Client and build TypeScript
RUN npm run build

# Production stage
FROM node:22-alpine

# node:22-alpineには既にnodeユーザー(UID/GID 1000)が存在するため、それを使用

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy Prisma schema and migrations for runtime
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built files from build stage
COPY --from=build /app/dist ./dist

# Copy migration files from build stage
COPY --from=build /app/prisma/migrations ./prisma/migrations

# Generate Prisma Client for production
RUN npx prisma generate

# Install tsx for running seed scripts in production
# Note: Only needed for initial seeding when RUN_SEED=true
RUN npm install tsx

# Copy docker-entrypoint.sh for initialization
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Copy seed helpers and scripts (built files already in dist/)
COPY scripts ./scripts

# /appディレクトリの所有権を変更
RUN chown -R node:node /app

# 非rootユーザーに切り替え
USER node

# Railway uses PORT env variable
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE $PORT

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Use docker-entrypoint.sh for initialization (migrations, seeding, etc.)
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Start the application
CMD ["node", "dist/src/index.js"]
