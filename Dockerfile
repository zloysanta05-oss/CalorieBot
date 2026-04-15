FROM node:22-alpine

WORKDIR /app

# Install dependencies first (layer cache optimization)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application files
COPY server/ ./server/
COPY public/ ./public/
COPY data/ ./data/
COPY .env.production .env

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

# Run as non-root user
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
USER appuser

CMD ["node", "server/index.js"]
