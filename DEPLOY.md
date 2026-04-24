# Деплой на VPS

Эта инструкция поможет развернуть CalorieBot на VPS через Docker Compose и HTTPS через Caddy.

## Требования

- VPS на Ubuntu/Debian с SSH-доступом
- Домен или поддомен, направленный на IP-адрес VPS
- Токен Telegram-бота от [@BotFather](https://t.me/BotFather)
- API-ключ OpenAI-совместимого сервиса

## 1. Установите Docker

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

После `usermod` выйдите из SSH и зайдите снова.

Проверьте Docker:

```bash
docker --version
docker compose version
```

## 2. Скопируйте проект

```bash
git clone https://github.com/zloysanta05-oss/CalorieBot.git
cd CalorieBot
```

Если вы деплоите из другого репозитория или загружаете файлы вручную, выполняйте следующие команды из корня проекта.

## 3. Настройте переменные окружения

```bash
cp .env.production .env
nano .env
```

Заполните обязательные значения:

```env
BOT_TOKEN=your_bot_token_here
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://routerai.ru/api/v1
OPENAI_MODEL=openai/gpt-5.4-nano
OPENAI_TIMEOUT_MS=120000
OPENAI_RECIPE_TIMEOUT_MS=240000
PORT=3000
NODE_ENV=production
OWNER_TELEGRAM_ID=your_telegram_id
ADMIN_TELEGRAM_IDS=friend_admin_id,another_admin_id
```

`OPENAI_MODEL` в коде необязателен, но в продакшене удобнее держать модель явно в `.env`.
`OPENAI_TIMEOUT_MS` и `OPENAI_RECIPE_TIMEOUT_MS` можно оставить как в примере; второй нужен для более долгих AI-вызовов генерации рецептов, даже если модуль рецептов скрыт в текущем UI.

`OWNER_TELEGRAM_ID` получает бесплатный Premium-доступ навсегда. `ADMIN_TELEGRAM_IDS` могут выдавать и отзывать бесплатный доступ друзьям из админского блока в приложении.

Telegram ID владельца можно узнать через служебных ботов вроде `@userinfobot`. Используйте именно числовой ID, не username.

## 4. Настройте домен

Создайте DNS-запись типа `A`:

```text
cal.example.com -> YOUR_VPS_IP
```

Затем откройте `Caddyfile` и замените `cal.example.com` на ваш реальный домен.

Если домен меняется уже после запуска контейнеров, перезапустите Caddy:

```bash
docker compose restart caddy
```

## 5. Проверьте Caddy

`docker-compose.yml` уже запускает Caddy вместе с приложением. `Caddyfile` рассчитан на запуск Caddy в той же Docker Compose сети и проксирует запросы на `app:3000`.

Если вы хотите запускать Caddy отдельно от Compose, замените в `Caddyfile`:

```caddyfile
reverse_proxy app:3000
```

на:

```caddyfile
reverse_proxy localhost:3000
```

## 6. Запустите проект

```bash
docker compose up -d --build
docker compose logs -f app
```

Проверьте приложение локально на VPS:

```bash
curl http://localhost:3000
```

Проверьте HTTPS:

```bash
curl https://cal.example.com
```

Вместо `cal.example.com` используйте ваш реальный домен.

## 7. Подключите Telegram Mini App

Откройте [@BotFather](https://t.me/BotFather):

```text
/newapp
```

Выберите бота и укажите URL Mini App:

```text
https://cal.example.com
```

Telegram требует HTTPS, поэтому дождитесь, пока Caddy успешно выпустит сертификат.

## 8. Настройте webhook платежей

Чтобы Telegram присылал подтверждения платежей Stars, настройте webhook бота:

```bash
curl "https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=https://cal.example.com/telegram/webhook"
```

Вместо `<ТОКЕН>` и `cal.example.com` используйте свои значения.

Проверьте webhook:

```bash
curl "https://api.telegram.org/bot<ТОКЕН>/getWebhookInfo"
```

В ответе `url` должен быть `https://cal.example.com/telegram/webhook`, а `last_error_message` должен отсутствовать.

Цена Premium и дневной бесплатный лимит задаются владельцем/админом внутри приложения на отдельной вкладке «Админ».

Список пользователей тоже находится в блоке «Админ». Пользователь появится там после первого открытия Mini App или первого API-запроса. В админке есть поиск, фильтры, пагинация, блокировка AI/оплаты, мягкое скрытие пользователей и просмотр последних платежей.

Если webhook не настроить, пользователь сможет открыть окно оплаты, но Premium-доступ не будет выдан после платежа.

## Полезные команды

Посмотреть логи:

```bash
docker compose logs -f app
docker compose logs -f caddy
```

Перезапустить:

```bash
docker compose restart
```

Обновить после `git pull`:

```bash
git pull
docker compose up -d --build
```

Остановить без удаления данных:

```bash
docker compose down
```

Остановить и удалить все Docker volume, включая SQLite-базу:

```bash
docker compose down -v
```

## Данные SQLite

Приложение хранит SQLite-базу в Docker volume `caloriebot-data` по пути:

```text
/app/data/app.sqlite
```

Создать простой бэкап:

```bash
docker run --rm \
  -v caloriebot-data:/data \
  -v "$PWD:/backup" \
  alpine cp /data/app.sqlite /backup/app.sqlite.backup
```

Восстановить бэкап:

```bash
docker compose down
docker run --rm \
  -v caloriebot-data:/data \
  -v "$PWD:/backup" \
  alpine cp /backup/app.sqlite.backup /data/app.sqlite
docker compose up -d
```

## Решение проблем

Если HTTPS не работает:

- Проверьте, что DNS указывает на IP-адрес VPS.
- Проверьте, что порты `80` и `443` открыты в firewall VPS.
- Запустите `docker compose logs -f caddy`.

Если приложение отвечает `Unauthorized`:

- Убедитесь, что установлено `NODE_ENV=production`.
- Открывайте приложение через Telegram Mini App, а не напрямую в браузере.
- Проверьте, что `BOT_TOKEN` относится к тому же боту, который выбран в BotFather.

Если админский блок не появляется:

- Проверьте `OWNER_TELEGRAM_ID` в `.env`.
- Убедитесь, что это числовой Telegram ID, а не username.
- Перезапустите контейнеры после изменения `.env`: `docker compose up -d`.

Если платеж прошел, но Premium не выдался:

- Проверьте webhook: `curl "https://api.telegram.org/bot<ТОКЕН>/getWebhookInfo"`.
- Посмотрите логи приложения: `docker compose logs -f app`.
- Убедитесь, что домен в webhook совпадает с доменом Mini App.

Если не работает AI-анализ:

- Проверьте `OPENAI_API_KEY`.
- Проверьте `OPENAI_BASE_URL`.
- Проверьте, что выбранная `OPENAI_MODEL` поддерживает анализ изображений.
