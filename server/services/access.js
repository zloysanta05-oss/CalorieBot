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

const getUserStmt = db.prepare(`
  SELECT
    u.*,
    COALESCE(usage.analysis_count, 0) AS today_analysis_count
  FROM users u
  LEFT JOIN usage_daily usage
    ON usage.telegram_id = u.telegram_id
   AND usage.date = date('now')
  WHERE u.telegram_id = ?
`);

const updateUserFlagsStmt = db.prepare(`
  UPDATE users
  SET
    is_blocked = ?,
    blocked_at = ?,
    blocked_reason = ?,
    deleted_at = ?,
    admin_note = ?
  WHERE telegram_id = ?
`);

const blockUserStmt = db.prepare(`
  UPDATE users
  SET is_blocked = 1,
      blocked_at = datetime('now'),
      blocked_reason = ?,
      admin_note = COALESCE(?, admin_note)
  WHERE telegram_id = ?
`);

const unblockUserStmt = db.prepare(`
  UPDATE users
  SET is_blocked = 0,
      blocked_at = NULL,
      blocked_reason = NULL
  WHERE telegram_id = ?
`);

const softDeleteUserStmt = db.prepare(`
  UPDATE users
  SET deleted_at = datetime('now')
  WHERE telegram_id = ?
`);

const restoreUserStmt = db.prepare(`
  UPDATE users
  SET deleted_at = NULL
  WHERE telegram_id = ?
`);

const overviewStmt = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS total_users,
    (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND last_seen_at >= datetime('now', '-1 day')) AS active_today,
    (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND last_seen_at >= datetime('now', '-7 day')) AS active_7d,
    (SELECT COALESCE(SUM(analysis_count), 0) FROM usage_daily WHERE date = date('now')) AS analyses_today,
    (SELECT COUNT(*) FROM users WHERE is_blocked = 1) AS blocked_users,
    (SELECT COUNT(*) FROM users WHERE deleted_at IS NOT NULL) AS deleted_users,
    (SELECT COUNT(*) FROM payments WHERE status = 'paid') AS paid_payments,
    (SELECT COALESCE(SUM(amount_stars), 0) FROM payments WHERE status = 'paid') AS revenue_stars,
    (SELECT premium_stars FROM monetization_settings WHERE id = 1) AS premium_stars,
    (SELECT free_daily_limit FROM monetization_settings WHERE id = 1) AS free_daily_limit
`);

const paymentsStmt = db.prepare(`
  SELECT
    p.id,
    p.telegram_id,
    p.plan,
    p.amount_stars,
    p.status,
    p.created_at,
    p.paid_at,
    u.first_name,
    u.last_name,
    u.username
  FROM payments p
  LEFT JOIN users u ON u.telegram_id = p.telegram_id
  ORDER BY p.created_at DESC
  LIMIT 100
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
  const user = getUserStmt.get(telegramId);
  const flags = {
    is_blocked: Boolean(user && user.is_blocked),
    blocked_at: user ? user.blocked_at : null,
    blocked_reason: user ? user.blocked_reason : null,
    deleted_at: user ? user.deleted_at : null,
    admin_note: user ? user.admin_note : null
  };

  if (owner) {
    return {
      telegram_id: telegramId,
      has_premium: true,
      access_type: 'owner',
      expires_at: null,
      is_owner: true,
      is_admin: true,
      ...flags
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
    entitlement: entitlement || null,
    ...flags
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

function normalizeUserRow(user) {
  if (!user) return null;
  // Для списка пользователей дополнительно вычисляем owner/admin/Premium статус.
  const access = getAccessStatus(user.telegram_id);
  return {
    ...user,
    is_blocked: Boolean(user.is_blocked),
    has_premium: access.has_premium,
    access_type: access.access_type,
    is_owner: access.is_owner,
    is_admin: access.is_admin
  };
}

function matchesUserQuery(user, query) {
  if (!query) return true;
  const needle = String(query).trim().toLowerCase();
  if (!needle) return true;

  return [
    user.telegram_id,
    user.first_name,
    user.last_name,
    user.username
  ].some(value => String(value || '').toLowerCase().includes(needle));
}

function matchesUserFilter(user, filter) {
  if (filter === 'all') return true;
  if (filter === 'premium') return user.access_type === 'subscription';
  if (filter === 'gifted') return user.access_type === 'gifted';
  if (filter === 'free') return user.access_type === 'free';
  if (filter === 'blocked') return Boolean(user.is_blocked);
  if (filter === 'deleted') return Boolean(user.deleted_at);
  return !user.deleted_at;
}

function listUsers(options = {}) {
  return listUsersStmt.all()
    .map(normalizeUserRow)
    .filter(user => matchesUserFilter(user, options.filter || 'active'))
    .filter(user => matchesUserQuery(user, options.query));
}

function listUsersPage(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 25, 1), 100);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const rows = listUsers(options);
  const users = rows.slice(offset, offset + limit);

  return {
    users,
    total: rows.length,
    limit,
    offset,
    has_more: offset + users.length < rows.length
  };
}

function getUserDetails(telegramId) {
  const userId = Number(telegramId);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error('Invalid telegram_id');
  }

  const user = normalizeUserRow(getUserStmt.get(userId));
  if (!user) {
    throw new Error('User not found');
  }

  return {
    user,
    entitlement: getEntitlement.get(userId) || null,
    payments: paymentsStmt.all().filter(payment => Number(payment.telegram_id) === userId).slice(0, 10)
  };
}

function updateUserFlags(telegramId, input = {}) {
  const userId = Number(telegramId);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error('Invalid telegram_id');
  }
  if (isOwner(userId)) {
    throw new Error('Owner flags cannot be changed');
  }

  const current = getUserStmt.get(userId);
  if (!current) {
    throw new Error('User not found');
  }

  const isBlocked = input.is_blocked === undefined ? Boolean(current.is_blocked) : Boolean(input.is_blocked);
  const deletedAt = input.deleted_at === undefined ? current.deleted_at : input.deleted_at;
  const blockedAt = isBlocked ? (current.blocked_at || formatSqliteDate(new Date())) : null;
  const blockedReason = isBlocked ? (input.blocked_reason || current.blocked_reason || null) : null;
  const adminNote = input.admin_note === undefined ? current.admin_note : String(input.admin_note || '').slice(0, 500) || null;

  updateUserFlagsStmt.run(
    isBlocked ? 1 : 0,
    blockedAt,
    blockedReason,
    deletedAt,
    adminNote,
    userId
  );

  return getUserDetails(userId);
}

function blockUser(telegramId, reason, note) {
  const userId = Number(telegramId);
  if (!Number.isFinite(userId) || userId <= 0) throw new Error('Invalid telegram_id');
  if (isOwner(userId)) throw new Error('Owner cannot be blocked');
  blockUserStmt.run(reason ? String(reason).slice(0, 200) : null, note ? String(note).slice(0, 500) : null, userId);
  return getUserDetails(userId);
}

function unblockUser(telegramId) {
  const userId = Number(telegramId);
  if (!Number.isFinite(userId) || userId <= 0) throw new Error('Invalid telegram_id');
  unblockUserStmt.run(userId);
  return getUserDetails(userId);
}

function softDeleteUser(telegramId) {
  const userId = Number(telegramId);
  if (!Number.isFinite(userId) || userId <= 0) throw new Error('Invalid telegram_id');
  if (isOwner(userId)) throw new Error('Owner cannot be deleted');
  softDeleteUserStmt.run(userId);
  return getUserDetails(userId);
}

function restoreUser(telegramId) {
  const userId = Number(telegramId);
  if (!Number.isFinite(userId) || userId <= 0) throw new Error('Invalid telegram_id');
  restoreUserStmt.run(userId);
  return getUserDetails(userId);
}

function getAdminOverview() {
  const metrics = overviewStmt.get();
  const users = listUsers({ filter: 'all' });
  const counts = users.reduce((acc, user) => {
    acc[user.access_type] = (acc[user.access_type] || 0) + 1;
    return acc;
  }, {});

  return {
    ...metrics,
    access_counts: {
      owner: counts.owner || 0,
      subscription: counts.subscription || 0,
      gifted: counts.gifted || 0,
      free: counts.free || 0
    }
  };
}

function listPayments() {
  return paymentsStmt.all();
}

module.exports = {
  getAccessStatus,
  grantGiftAccess,
  revokeAccess,
  listEntitlements,
  listUsers,
  listUsersPage,
  getUserDetails,
  updateUserFlags,
  blockUser,
  unblockUser,
  softDeleteUser,
  restoreUser,
  getAdminOverview,
  listPayments,
  isAdmin,
  isOwner
};
