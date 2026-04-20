FROM node:22-alpine

WORKDIR /app

# better-sqlite3 requires native compilation tools, and libstdc++ is needed at runtime.
RUN apk add --no-cache libstdc++ \
  && apk add --no-cache --virtual .build-deps python3 make g++

# Create non-root user early
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup

# Install dependencies first (layer cache optimization)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Remove build tools after native modules are compiled
RUN apk del .build-deps

# Copy application files
COPY server/ ./server/
COPY public/ ./public/

# Create data directory with correct ownership
RUN mkdir -p /app/data && chown -R appuser:appgroup /app/data

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

# Switch to non-root user
USER appuser

CMD ["node", "server/index.js"]
