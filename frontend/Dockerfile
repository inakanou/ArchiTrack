# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (npm ci for reproducible builds)
RUN npm ci --include=optional

# Copy source files
COPY . .

# Build argument for API URL
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

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
