# =============================================================================
# GTM Brain - Production Dockerfile for AWS Fargate
# =============================================================================

FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
# - curl: health checks
# - git: npm dependencies that need git
# - dumb-init: proper signal handling in containers
RUN apk add --no-cache \
    curl \
    git \
    dumb-init

# Copy package files first (for layer caching)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create necessary directories
# /data is where EFS mounts for SQLite persistence
RUN mkdir -p logs /data

# Create non-root user matching EFS access point (uid/gid 1001)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S gtmbrain -u 1001 && \
    chown -R gtmbrain:nodejs /app /data

# Switch to non-root user
USER gtmbrain

# Expose port
EXPOSE 3000

# Health check with longer start period for cold starts
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init for proper signal handling (SIGTERM from ECS)
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "src/app.js"]

