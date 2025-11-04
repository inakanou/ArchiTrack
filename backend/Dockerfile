# Build stage
FROM node:20.11.1-alpine AS build

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
FROM node:20.11.1-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy Prisma schema for runtime
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built files from build stage
COPY --from=build /app/dist ./dist

# Generate Prisma Client for production
RUN npx prisma generate

# Railway uses PORT env variable
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE $PORT

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'echo "Running Prisma migrations..."' >> /app/start.sh && \
    echo 'npx prisma migrate deploy' >> /app/start.sh && \
    echo 'echo "Starting application..."' >> /app/start.sh && \
    echo 'exec node dist/src/index.js' >> /app/start.sh && \
    chmod +x /app/start.sh

# Start the application with migrations
CMD ["/app/start.sh"]
