# Build stage
FROM node:22-alpine AS build

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
FROM nginx:alpine

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config template
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Railway uses PORT env variable
ENV PORT=80

# Expose port
EXPOSE $PORT

# nginx will automatically substitute $PORT in template
CMD ["nginx", "-g", "daemon off;"]
