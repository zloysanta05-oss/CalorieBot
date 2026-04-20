const db = require('../db');

// Активный entitlement дает пользователю Premium-доступ или подаренный доступ.
const getEntitlement = db.prepare(`
  SELECT *
  FROM entitlements
  WHERE telegram_id = ?
    AND (expires_at IS NULL OR expires_at > datetime('now'))
`);

const listEntitlementsStmt = db.prepare(`
  SELECT *
  FROM entitlements
  ORDER BY created_at DESC
`);

const listUsersStmt = db.prepare(`
  SELECT
    u.*,
    e.type AS entitlement_type,
    e.expires_at AS entitlement_expires_at,
    e.note AS entitlement_note,
    COALESCE(usage.analysis_count, 0) AS today_analysis_count
  FROM users u
  LEFT JOIN entitlements e
    ON e.telegram_id = u.telegram_id
   AND (e.expires_at IS NULL OR e.expires_at > datetime('now'))
  LEFT JOIN usage_daily usage
    ON usage.telegram_id = u.telegram_id
   AND usage.date = date('now')
  ORDER BY u.last_seen_at DESC
`);

const upsertGiftEntitlement = db.prepare(`
  INSERT INTO entitlements (telegram_id, type, granted_by, expires_at, note, created_at, updated_at)
  VALUES (?, 'gifted', ?, ?, ?, datetime('now'), datetime('now'))
  ON CONFLICT(telegram_id) DO UPDATE SET
    type = 'gifted',
    granted_by = excluded.granted_by,
    expires_at = excluded.expires_at,
    note = excluded.note,
    updated_at = datetime('now')
`);

const deleteEntitlement = db.prepare('DELETE FROM entitlements WHERE telegram_id = ?');

// ENV-переменные с Telegram ID хранятся строкой через запятую.
function parseIdList(value) {
  return String(value || '')
    .split(',')
    .map(v => Number(v.trim()))
    .filter(Number.isFinite);
}

// Владелец всегда имеет Premium и права администратора.
function getOwnerId() {
  const ownerId = Number(process.env.OWNER_TELEGRAM_ID);
  if (Number.isFinite(ownerId) && ownerId > 0) return ownerId;

  if (process.env.NODE_ENV === 'development') {
    return 12345;
  }

  return null;
}

// Админы могут менять цены, лимиты и выдавать/отзывать бесплатный доступ.
function getAdminIds() {
  const ids = new Set(parseIdList(process.env.ADMIN_TELEGRAM_IDS));
  const ownerId = getOwnerId();
  if (ownerId) ids.add(ownerId);

  if (process.env.NODE_ENV === 'development') {
    ids.add(12345);
  }

  return ids;
}

function isOwner(userId) {
  return Boolean(getOwnerId() && Number(userId) === getOwnerId());
}

function isAdmin(userId) {
  return getAdminIds().has(Number(userId));
}

function getAccessStatus(userId) {
  const telegramId = Number(userId);
  const owner = isOwner(telegramId);
  const admin = isAdmin(telegramId);

  if (owner) {
    return {
      telegram_id: telegramId,
      has_premium: true,
      access_type: 'owner',
      expires_at: null,
      is_owner: true,
      is_admin: true
    };
  }

  const entitlement = getEntitlement.get(telegramId);
  return {
    telegram_id: telegramId,
    has_premium: Boolean(entitlement),
    access_type: entitlement ? entitlement.type : 'free',
    expires_at: entitlement ? entitlement.expires_at : null,
    is_owner: false,
    is_admin: admin,
    entitlement: entitlement || null
  };
}

// SQLite хранит даты в формате YYYY-MM-DD HH:mm:ss.
function formatSqliteDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

// Выдача подаренного доступа: на срок или бессрочно.
function grantGiftAccess(telegramId, grantedBy, days, note) {
  const userId = Number(telegramId);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error('Invalid telegram_id');
  }

  let expiresAt = null;
  if (days !== null && days !== undefined && days !== '') {
    const parsedDays = Number(days);
    if (!Number.isFinite(parsedDays) || parsedDays <= 0 || parsedDays > 3650) {
      throw new Error('Invalid days');
    }

    const expires = new Date();
    expires.setUTCDate(expires.getUTCDate() + Math.round(parsedDays));
    expiresAt = formatSqliteDate(expires);
  }

  upsertGiftEntitlement.run(
    userId,
    Number(grantedBy) || null,
    expiresAt,
    note ? String(note).slice(0, 200) : null
  );

  return getEntitlement.get(userId);
}

// Отзыв доступа удаляет entitlement, но не удаляет самого пользователя.
function revokeAccess(telegramId) {
  const userId = Number(telegramId);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error('Invalid telegram_id');
  }

  return deleteEntitlement.run(userId);
}

function listEntitlements() {
  return listEntitlementsStmt.all();
}

function listUsers() {
  // Для списка пользователей дополнительно вычисляем owner/admin/Premium статус.
  return listUsersStmt.all().map(user => {
    const access = getAccessStatus(user.telegram_id);
    return {
      ...user,
      has_premium: access.has_premium,
      access_type: access.access_type,
      is_owner: access.is_owner,
      is_admin: access.is_admin
    };
  });
}

module.exports = {
  getAccessStatus,
  grantGiftAccess,
  revokeAccess,
  listEntitlements,
  listUsers,
  isAdmin,
  isOwner
};
