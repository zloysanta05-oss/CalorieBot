# CalorieBot — Telegram Mini App для подсчёта калорий

Telegram Mini App для анализа калорийности еды по фото или текстовому описанию с помощью AI.

## Возможности

- **📸 Анализ по фото** — сделайте или загрузите фото блюда, AI оценит калорийность и БЖУ
- **✍️ Анализ по описанию** — напишите что вы съели, например «борщ с хлебом»
- **📓 Дневник питания** — записи за каждый день с разбивкой по приёмам пищи
- **📊 Статистика** — дневной прогресс и недельная статистика с графиком
- **🎯 Цель калорий** — дневная норма и калькулятор Миффлина-Сан Жеора в профиле
- **⭐ Freemium + Premium** — бесплатный дневной лимит и подписка через Telegram Stars
- **🔐 Админ-доступ** — отдельная вкладка для владельца/админа: цена Premium, лимиты, пользователи и бесплатный доступ друзьям
- **🧪 Экспериментальные модули** — рецепты, покупки и учёт продуктов есть в коде/API, но скрыты в текущей версии UI
- **💾 Хранение данных** — SQLite база данных на сервере
- **🤖 Telegram WebApp** — нативная интеграция с Telegram (темы, вибрация)

## Технологии

**Backend:**
- Node.js + Express v5
- SQLite (better-sqlite3)
- OpenAI API (gpt-5.4-nano через routerai.ru)
- Multer для загрузки изображений

**Frontend:**
- Vanilla JavaScript (ES5 — без сборки)
- Telegram WebApp SDK
- CSS-переменные для темизации
- Haptic Feedback

## Структура проекта

```
cal/
├── server/
│   ├── index.js          # Express сервер
│   ├── auth.js           # Валидация Telegram initData
│   ├── db.js             # SQLite схема и подключение
│   ├── routes/
│   │   ├── analyze.js    # POST /api/analyze-photo, /api/analyze-text
│   │   ├── access.js     # Статус Premium и админская выдача доступа
│   │   ├── meals.js      # CRUD для записей дневника
│   │   ├── goals.js      # Цель калорий
│   │   ├── payments.js   # Telegram Stars invoice и webhook
│   │   ├── favorites.js  # Избранные блюда
│   │   ├── pantry.js     # Распознавание продуктов по фото (скрыто в UI)
│   │   ├── inventory.js  # Учёт текущих продуктов (скрыто в UI)
│   │   ├── recipes.js    # Генерация рецептов (скрыто в UI)
│   │   ├── shopping.js   # Список покупок (скрыто в UI)
│   │   └── stats.js      # Статистика (день, неделя)
│   └── services/
│       ├── access.js      # Проверка owner/admin/Premium
│       ├── monetization.js # Free-лимиты, настройки и платежи
│       ├── openai.js      # Клиент OpenAI
│       ├── telegram.js    # Вызовы Telegram Bot API
│       ├── culinary.js    # Промпты для продуктов/рецептов
│       ├── inventory.js   # Нормализация и списание продуктов
│       └── nutrition.js   # Промпт и парсер ответа AI
├── public/
│   ├── index.html        # SPA: Сегодня, Дневник, Профиль, Админ для админа
│   ├── css/style.css     # Стили с Telegram theme variables
│   └── js/
│       ├── api.js        # API клиент
│       ├── app.js        # Инициализация, роутинг вкладок
│       ├── analyze.js    # Логика «Сегодня» + скрытые модули рецептов/покупок
│       ├── diary.js      # Логика вкладки «Дневник»
│       ├── stats.js      # Логика вкладок «Профиль» и «Админ»
│       └── utils.js      # Утилиты (форматирование даты, toast, haptic)
├── data/                  # SQLite база при локальном запуске (app.sqlite)
├── Dockerfile             # Образ для деплоя
├── docker-compose.yml     # Контейнер с app + watchtower
├── .env                   # Переменные окружения (секреты)
├── .env.example           # Пример .env
├── .env.production        # Шаблон для продакшена
└── package.json
```

## Быстрый старт

### Локальная разработка

```bash
# 1. Клонируйте проект
git clone https://github.com/zloysanta05-oss/CalorieBot.git

# 2. Установите зависимости
npm install

# 3. Настройте переменные окружения
cp .env.example .env
# Отредактируйте .env:
#   BOT_TOKEN=...        # от @BotFather
#   OPENAI_API_KEY=...   # от routerai.ru

# 4. Запустите сервер
npm run dev   # с авто-перезагрузкой (nodemon)
# или
npm start     # без авто-перезагрузки

# 5. Откройте в браузере
http://localhost:3000
```

> **Режим разработки:** когда `NODE_ENV=development` и запросы идут не из Telegram, используется dev-пользователь (ID 12345) без валидации initData. Это позволяет тестировать UI без Mini App.

### Docker

```bash
# Настройка
cp .env.production .env
# Заполните BOT_TOKEN, OPENAI_API_KEY и OWNER_TELEGRAM_ID в .env

# Запуск
docker compose up -d --build

# Проверка
curl http://localhost:3000

# Логи
docker compose logs -f app

# Остановка
docker compose down
```

В Docker база SQLite хранится в named volume `caloriebot-data`. Это избавляет от проблем с правами на bind mount при запуске контейнера от non-root пользователя. Чтобы удалить контейнеры вместе с базой, используйте `docker compose down -v`.

### Telegram Mini App

1. Откройте [@BotFather](https://t.me/BotFather)
2. Отправьте `/newapp`
3. Выберите бота
4. Введите HTTPS URL вашего сервера (например, `https://yourdomain.com`)
5. Загрузите иконку 512×512
6. Готово — пользователи откроют Mini App через меню бота

> **Важно:** Telegram требует HTTPS. Для локального тестирования используйте [ngrok](https://ngrok.com):
> ```bash
> ngrok http 3000
> # Скопируйте https URL из вывода и вставьте в BotFather
> ```

## API

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/analyze-photo` | Анализ фото (multipart или base64 в body) |
| POST | `/api/analyze-text` | Анализ текстового описания |
| GET | `/api/meals?date=YYYY-MM-DD` | Список приёмов пищи за дату |
| POST | `/api/meals` | Добавить запись |
| DELETE | `/api/meals/:id` | Удалить запись |
| GET | `/api/goals` | Получить цель калорий |
| PUT | `/api/goals` | Установить цель калорий |
| GET | `/api/stats?period=day` | Статистика за день |
| GET | `/api/stats?period=week` | Статистика за неделю |
| GET | `/api/monetization` | Статус доступа, лимит и цена Premium |
| POST | `/api/payments/subscription-invoice` | Создать invoice-ссылку Telegram Stars |
| GET | `/api/admin/overview` | Сводка админки: пользователи, активность, платежи и лимиты |
| GET | `/api/admin/payments` | Последние платежи Telegram Stars (только админ) |
| GET | `/api/admin/monetization` | Получить настройки монетизации (только админ) |
| PUT | `/api/admin/monetization` | Изменить цену Premium и free-лимит (только админ) |
| GET | `/api/admin/users?limit=25&offset=0` | Список пользователей с поиском, фильтрами и пагинацией (только админ) |
| GET | `/api/admin/users/:telegramId` | Карточка пользователя (только админ) |
| POST | `/api/admin/users/:telegramId/block` | Заблокировать AI-анализ и оплату для пользователя |
| POST | `/api/admin/users/:telegramId/unblock` | Снять блокировку пользователя |
| POST | `/api/admin/users/:telegramId/delete` | Мягко скрыть пользователя из обычного списка |
| POST | `/api/admin/users/:telegramId/restore` | Восстановить мягко скрытого пользователя |
| POST | `/telegram/webhook` | Webhook Telegram для платежей (без `X-Telegram-Init-Data`) |

Все `/api/*` запросы требуют заголовок `X-Telegram-Init-Data` (кроме режима разработки). `/telegram/webhook` вызывается Telegram Bot API и не использует Mini App initData.

## AI-промпт

AI получает фотографию или текстовое описание и возвращает JSON:

```json
{
  "dish_name": "борщ с хлебом",
  "calories": 520,
  "protein": 20.5,
  "fat": 17,
  "carbs": 68.5,
  "portion_grams": 500,
  "confidence": "medium",
  "items": [
    { "name": "борщ (350 мл)", "calories": 330 },
    { "name": "хлеб (70 г)", "calories": 190 }
  ]
}
```

Промпт оптимизирован для русского языка и использует стандартные таблицы калорийности (USDA).

## Конфигурация AI

По умолчанию используется `routerai.ru` с моделью `openai/gpt-5.4-nano`. Можно изменить в `.env`:

```env
OPENAI_API_KEY=ваш_ключ
OPENAI_BASE_URL=https://routerai.ru/api/v1
OPENAI_MODEL=openai/gpt-5.4-nano
```

Или подключить напрямую OpenAI:

```env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o
```

## Автодеплой (watchtower)

Watchtower имеет смысл, если контейнер `app` использует опубликованный Docker-образ из registry. Для локально собранного образа через `build:` он не сможет подтянуть новую версию сам по себе.

```bash
# Запуск с авто-обновлением
docker compose --profile auto-update up -d

# Watchtower проверяет обновления каждый час
# При появлении нового образа — перезапускает контейнер
```

## Переменные окружения

| Переменная | Обязательно | По умолчанию | Описание |
|------------|-------------|--------------|----------|
| `BOT_TOKEN` | Да | — | Токен бота от @BotFather |
| `OPENAI_API_KEY` | Да | — | API-ключ для AI |
| `OPENAI_BASE_URL` | Нет | `https://routerai.ru/api/v1` | Base URL OpenAI-совместимого API |
| `OPENAI_MODEL` | Нет | `openai/gpt-5.4-nano` | Модель для анализа |
| `OPENAI_TIMEOUT_MS` | Нет | `120000` | Timeout обычных AI-запросов в миллисекундах |
| `OPENAI_RECIPE_TIMEOUT_MS` | Нет | `240000` | Timeout генерации рецептов в миллисекундах |
| `PORT` | Нет | `3000` | Порт сервера |
| `NODE_ENV` | Нет | `development` | `development` или `production` |
| `DB_PATH` | Нет | `data/app.sqlite` | Путь к SQLite файлу |
| `OWNER_TELEGRAM_ID` | Нет | `12345` в development | Telegram ID владельца с бессрочным бесплатным доступом |
| `ADMIN_TELEGRAM_IDS` | Нет | — | Telegram ID админов через запятую, которые могут выдавать бесплатный доступ |

## Монетизация

Приложение использует модель freemium + подписка:

- бесплатным пользователям доступно несколько AI-анализов в день;
- владелец и пользователи с выданным доступом обходят free-лимит;
- Premium-подписка создаётся через Telegram Stars (`currency: XTR`) на 30 дней;
- цену Premium и дневной бесплатный лимит может менять только владелец/админ на отдельной вкладке «Админ»;
- список пользователей появляется в админке после их первого открытия приложения или любого API-запроса.

Для приёма платежей на продакшене настройте webhook бота:

```bash
curl "https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=https://yourdomain.com/telegram/webhook"
```

Telegram ID владельца можно узнать через служебных ботов вроде `@userinfobot`, либо временно открыть приложение в development-режиме и посмотреть `/api/access`.

## База данных

При локальном запуске SQLite хранится в `data/app.sqlite`. При Docker-запуске файл лежит внутри named volume `caloriebot-data` по пути `/app/data/app.sqlite`. Схема:

```sql
-- Приёмы пищи
CREATE TABLE meals (
  id INTEGER PRIMARY KEY,
  telegram_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  meal_type TEXT DEFAULT 'snack',     -- breakfast, lunch, dinner, snack
  description TEXT NOT NULL,
  calories REAL NOT NULL,
  protein REAL DEFAULT 0,
  fat REAL DEFAULT 0,
  carbs REAL DEFAULT 0,
  portion_grams REAL,
  source TEXT DEFAULT 'photo',         -- photo или text
  image_data TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Цели пользователей
CREATE TABLE goals (
  telegram_id INTEGER PRIMARY KEY,
  daily_calories REAL DEFAULT 2000,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Пользователи Telegram Mini App
CREATE TABLE users (
  telegram_id INTEGER PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  username TEXT,
  language_code TEXT,
  is_premium INTEGER DEFAULT 0,
  first_seen_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now'))
);

-- Бесплатные доступы / будущие права Premium
CREATE TABLE entitlements (
  telegram_id INTEGER PRIMARY KEY,
  type TEXT DEFAULT 'gifted',
  granted_by INTEGER,
  expires_at TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Дневной лимит бесплатных анализов
CREATE TABLE usage_daily (
  telegram_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  analysis_count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (telegram_id, date)
);

-- Цена Premium и бесплатный лимит
CREATE TABLE monetization_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  premium_stars INTEGER DEFAULT 100,
  free_daily_limit INTEGER DEFAULT 3,
  updated_by INTEGER,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Платежи Telegram Stars
CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  telegram_id INTEGER NOT NULL,
  payload TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'premium_month',
  amount_stars INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  telegram_payment_charge_id TEXT,
  provider_payment_charge_id TEXT,
  raw_payment TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  paid_at TEXT
);
```

## Лицензия

ISC
