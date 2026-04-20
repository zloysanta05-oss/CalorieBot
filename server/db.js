const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(DATA_DIR, 'app.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
`);

module.exports = db;
