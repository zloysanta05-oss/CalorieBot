# CalorieBot — Telegram Mini App для подсчёта калорий

Telegram Mini App для анализа калорийности еды по фото или текстовому описанию с помощью AI.

## Возможности

- **📸 Анализ по фото** — сделайте или загрузите фото блюда, AI оценит калорийность и БЖУ
- **✍️ Анализ по описанию** — напишите что вы съели, например «борщ с хлебом»
- **📓 Дневник питания** — записи за каждый день с разбивкой по приёмам пищи
- **📊 Статистика** — дневная и недельная статистика с графиком
- **🎯 Цель калорий** — настраиваемая дневная норма
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
│   │   ├── meals.js      # CRUD для записей дневника
│   │   ├── goals.js      # Цель калорий
│   │   └── stats.js      # Статистика (день, неделя)
│   └── services/
│       ├── openai.js      # Клиент OpenAI
│       └── nutrition.js   # Промпт и парсер ответа AI
├── public/
│   ├── index.html        # SPA с тремя вкладками
│   ├── css/style.css     # Стили с Telegram theme variables
│   └── js/
│       ├── api.js        # API клиент
│       ├── app.js        # Инициализация, роутинг вкладок
│       ├── analyze.js    # Логика вкладки «Анализ»
│       ├── diary.js      # Логика вкладки «Дневник»
│       ├── stats.js      # Логика вкладки «Статистика»
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
# Заполните BOT_TOKEN и OPENAI_API_KEY в .env

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

Все запросы требуют заголовок `X-Telegram-Init-Data` (кроме режима разработки).

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
| `PORT` | Нет | `3000` | Порт сервера |
| `NODE_ENV` | Нет | `development` | `development` или `production` |
| `DB_PATH` | Нет | `data/app.sqlite` | Путь к SQLite файлу |

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
```

## Лицензия

ISC
