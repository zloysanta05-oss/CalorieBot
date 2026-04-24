const express = require('express');
const {
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
} = require('../services/access');

const router = express.Router();

// Все admin endpoints доступны только владельцу или ID из ADMIN_TELEGRAM_IDS.
function requireAdmin(req, res, next) {
  if (!isAdmin(req.telegramUser.id)) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  next();
}

// Текущий статус доступа пользователя: free, owner, gifted или subscription.
router.get('/access', (req, res) => {
  res.json({
    success: true,
    data: getAccessStatus(req.telegramUser.id)
  });
});

// Список выданных доступов для админки.
router.get('/admin/entitlements', requireAdmin, (req, res) => {
  res.json({
    success: true,
    data: {
      entitlements: listEntitlements(),
      is_owner: isOwner(req.telegramUser.id)
    }
  });
});

// Сводка по пользователям, активности, выручке и текущим лимитам.
router.get('/admin/overview', requireAdmin, (req, res) => {
  res.json({
    success: true,
    data: getAdminOverview()
  });
});

// Последние платежи Telegram Stars для финансового блока админки.
router.get('/admin/payments', requireAdmin, (req, res) => {
  res.json({
    success: true,
    data: {
      payments: listPayments()
    }
  });
});

// Список пользователей, которые уже открывали Mini App или вызывали API.
router.get('/admin/users', requireAdmin, (req, res) => {
  const data = listUsersPage({
    query: req.query.query,
    filter: req.query.filter,
    limit: req.query.limit,
    offset: req.query.offset
  });

  res.json({
    success: true,
    data
  });
});

// Детальная карточка пользователя для админского управления.
router.get('/admin/users/:telegramId', requireAdmin, (req, res) => {
  try {
    res.json({ success: true, data: getUserDetails(req.params.telegramId) });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

router.put('/admin/users/:telegramId/flags', requireAdmin, (req, res) => {
  try {
    res.json({ success: true, data: updateUserFlags(req.params.telegramId, req.body || {}) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/admin/users/:telegramId/block', requireAdmin, (req, res) => {
  try {
    const { reason, note } = req.body || {};
    res.json({ success: true, data: blockUser(req.params.telegramId, reason, note) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/admin/users/:telegramId/unblock', requireAdmin, (req, res) => {
  try {
    res.json({ success: true, data: unblockUser(req.params.telegramId) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/admin/users/:telegramId/delete', requireAdmin, (req, res) => {
  try {
    res.json({ success: true, data: softDeleteUser(req.params.telegramId) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/admin/users/:telegramId/restore', requireAdmin, (req, res) => {
  try {
    res.json({ success: true, data: restoreUser(req.params.telegramId) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Выдача бесплатного доступа другу/тестеру.
router.post('/admin/entitlements', requireAdmin, (req, res) => {
  try {
    const { telegram_id, days, note } = req.body || {};
    const entitlement = grantGiftAccess(telegram_id, req.telegramUser.id, days, note);

    res.json({ success: true, data: entitlement });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Отзыв бесплатного или subscription entitlement.
router.delete('/admin/entitlements/:telegramId', requireAdmin, (req, res) => {
  try {
    revokeAccess(req.params.telegramId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
