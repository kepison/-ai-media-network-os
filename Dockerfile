# Multi-stage build for AI Media Network OS
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package.json and lockfile
COPY package*.json ./
RUN npm ci --only=production

# Copy backend source
COPY backend ./backend
WORKDIR /app/backend

# Install dependencies (including dev deps for tests)
COPY ../frontend/package*.json ./
RUN npm ci --only=production && npm ci --only=development

# Build frontend
WORKDIR /app/frontend
RUN npm install && npm run build

# Final stage
FROM node:20-alpine AS runtime
WORKDIR /app/backend
COPY --from=builder /app/backend ./src
COPY --from=builder /app/frontend/dist ./frontend/dist
ENV NODE_ENV=production
EXPOSE 4130
CMD ["npx", "tsx", "src/index.ts"]
