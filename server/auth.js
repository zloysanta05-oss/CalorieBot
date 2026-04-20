const crypto = require('crypto');
const db = require('./db');

const upsertUser = db.prepare(`
  INSERT INTO users (telegram_id, first_name, last_name, username, language_code, is_premium, first_seen_at, last_seen_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  ON CONFLICT(telegram_id) DO UPDATE SET
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    username = excluded.username,
    language_code = excluded.language_code,
    is_premium = excluded.is_premium,
    last_seen_at = datetime('now')
`);

function rememberUser(user) {
  if (!user || !user.id) return;

  upsertUser.run(
    Number(user.id),
    user.first_name || null,
    user.last_name || null,
    user.username || null,
    user.language_code || null,
    user.is_premium ? 1 : 0
  );
}

function validateInitData(initData, botToken) {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  params.delete('hash');

  const entries = [];
  for (const [key, value] of params.entries()) {
    entries.push(`${key}=${value}`);
  }
  entries.sort();
  const dataCheckString = entries.join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computedHash !== hash) return null;

  const authDate = parseInt(params.get('auth_date'), 10);
  if (!authDate) return null;

  const maxAge = parseInt(process.env.AUTH_EXPIRY_SECONDS, 10) || 86400;
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > maxAge) return null;

  try {
    const userStr = params.get('user');
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  if (process.env.NODE_ENV === 'development') {
    const initData = req.headers['x-telegram-init-data'];
    if (!initData) {
      req.telegramUser = { id: 12345, first_name: 'Dev', username: 'developer' };
      rememberUser(req.telegramUser);
      return next();
    }
  }

  const initData = req.headers['x-telegram-init-data'];
  const botToken = process.env.BOT_TOKEN;

  if (!botToken) {
    return res.status(500).json({ success: false, error: 'Server misconfigured' });
  }

  const user = validateInitData(initData, botToken);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  req.telegramUser = user;
  rememberUser(user);
  next();
}

module.exports = authMiddleware;
