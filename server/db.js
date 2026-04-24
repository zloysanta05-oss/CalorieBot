const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Создаем директорию с SQLite-базой при первом запуске.
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// DB_PATH позволяет переопределить путь в Docker/production окружении.
const dbPath = process.env.DB_PATH || path.join(DATA_DIR, 'app.sqlite');
const db = new Database(dbPath);

// WAL улучшает параллельное чтение/запись, foreign_keys включает ограничения SQLite.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Идемпотентная схема: новые таблицы добавляются при старте без удаления данных.
db.exec(`
  CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    meal_type TEXT NOT NULL DEFAULT 'snack',
    description TEXT NOT NULL,
    calories REAL NOT NULL,
    protein REAL DEFAULT 0,
    fat REAL DEFAULT 0,
    carbs REAL DEFAULT 0,
    portion_grams REAL,
    source TEXT NOT NULL DEFAULT 'photo',
    image_data TEXT,
    items_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meals(telegram_id, date);

  CREATE TABLE IF NOT EXISTS goals (
    telegram_id INTEGER PRIMARY KEY,
    daily_calories REAL NOT NULL DEFAULT 2000,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    language_code TEXT,
    is_premium INTEGER DEFAULT 0,
    is_blocked INTEGER NOT NULL DEFAULT 0,
    blocked_at TEXT,
    blocked_reason TEXT,
    deleted_at TEXT,
    admin_note TEXT,
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS entitlements (
    telegram_id INTEGER PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'gifted',
    granted_by INTEGER,
    expires_at TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS usage_daily (
    telegram_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    analysis_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (telegram_id, date)
  );

  CREATE TABLE IF NOT EXISTS monetization_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    premium_stars INTEGER NOT NULL DEFAULT 100,
    free_daily_limit INTEGER NOT NULL DEFAULT 3,
    updated_by INTEGER,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO monetization_settings (id, premium_stars, free_daily_limit)
  VALUES (1, 100, 3);

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    payload TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'premium_month',
    amount_stars INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    telegram_payment_charge_id TEXT,
    provider_payment_charge_id TEXT,
    raw_payment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at TEXT
  );

  CREATE TABLE IF NOT EXISTS favorite_meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    calories REAL NOT NULL DEFAULT 0,
    protein REAL NOT NULL DEFAULT 0,
    fat REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0,
    portion_grams REAL,
    meal_type TEXT NOT NULL DEFAULT 'snack',
    items_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_favorite_meals_user ON favorite_meals(telegram_id, updated_at);

  CREATE TABLE IF NOT EXISTS pantry_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'photo',
    image_data TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pantry_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    quantity_text TEXT,
    category TEXT,
    confidence TEXT NOT NULL DEFAULT 'medium',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES pantry_sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_pantry_items_session ON pantry_items(session_id);

  CREATE TABLE IF NOT EXISTS inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    quantity_value REAL,
    quantity_unit TEXT NOT NULL DEFAULT 'упак',
    category TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_inventory_items_user ON inventory_items(telegram_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_inventory_items_lookup ON inventory_items(telegram_id, normalized_name, quantity_unit);

  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    pantry_session_id INTEGER,
    title TEXT NOT NULL,
    goal TEXT NOT NULL DEFAULT 'поддержание',
    time_minutes INTEGER,
    difficulty TEXT,
    servings INTEGER NOT NULL DEFAULT 1,
    calories REAL NOT NULL DEFAULT 0,
    protein REAL NOT NULL DEFAULT 0,
    fat REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0,
    steps_json TEXT NOT NULL DEFAULT '[]',
    ingredients_json TEXT NOT NULL DEFAULT '[]',
    missing_items_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (pantry_session_id) REFERENCES pantry_sessions(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_recipes_user_created ON recipes(telegram_id, created_at);

  CREATE TABLE IF NOT EXISTS shopping_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    recipe_id INTEGER,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS shopping_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    quantity_text TEXT,
    category TEXT,
    is_checked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (list_id) REFERENCES shopping_lists(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_shopping_items_list ON shopping_items(list_id);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(row => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('meals', 'items_json', 'TEXT');
ensureColumn('favorite_meals', 'items_json', 'TEXT');
ensureColumn('favorite_meals', 'recipe_steps_json', 'TEXT');
ensureColumn('users', 'is_blocked', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'blocked_at', 'TEXT');
ensureColumn('users', 'blocked_reason', 'TEXT');
ensureColumn('users', 'deleted_at', 'TEXT');
ensureColumn('users', 'admin_note', 'TEXT');

module.exports = db;
