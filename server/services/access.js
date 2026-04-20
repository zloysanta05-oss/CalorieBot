const db = require('../db');

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

function parseIdList(value) {
  return String(value || '')
    .split(',')
    .map(v => Number(v.trim()))
    .filter(Number.isFinite);
}

function getOwnerId() {
  const ownerId = Number(process.env.OWNER_TELEGRAM_ID);
  if (Number.isFinite(ownerId) && ownerId > 0) return ownerId;

  if (process.env.NODE_ENV === 'development') {
    return 12345;
  }

  return null;
}

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

function formatSqliteDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

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

module.exports = {
  getAccessStatus,
  grantGiftAccess,
  revokeAccess,
  listEntitlements,
  isAdmin,
  isOwner
};
