# Build stage
FROM node:20-alpine AS build

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
FROM node:20-alpine

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

# Railway uses PORT env variable
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE $PORT

# Start the application
CMD ["npm", "run", "start"]
