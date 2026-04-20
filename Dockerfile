FROM node:22-alpine

WORKDIR /app

# better-sqlite3 нужны инструменты сборки, а libstdc++ остается для запуска.
RUN apk add --no-cache libstdc++ \
  && apk add --no-cache --virtual .build-deps python3 make g++

# Создаем непривилегированного пользователя для запуска приложения
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup

# Сначала ставим зависимости, чтобы Docker лучше кэшировал слои
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Удаляем инструменты сборки после компиляции native-модулей
RUN apk del .build-deps

# Копируем код приложения
COPY server/ ./server/
COPY public/ ./public/

# Создаем директорию данных с правами appuser
RUN mkdir -p /app/data && chown -R appuser:appgroup /app/data

# Порт Express-сервера
EXPOSE 3000

# Проверка здоровья контейнера
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

# Запускаем приложение не от root
USER appuser

CMD ["node", "server/index.js"]
