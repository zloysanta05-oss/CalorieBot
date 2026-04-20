const express = require('express');
const {
  getAccessStatus,
  grantGiftAccess,
  revokeAccess,
  listEntitlements,
  listUsers,
  isAdmin,
  isOwner
} = require('../services/access');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!isAdmin(req.telegramUser.id)) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  next();
}

router.get('/access', (req, res) => {
  res.json({
    success: true,
    data: getAccessStatus(req.telegramUser.id)
  });
});

router.get('/admin/entitlements', requireAdmin, (req, res) => {
  res.json({
    success: true,
    data: {
      entitlements: listEntitlements(),
      is_owner: isOwner(req.telegramUser.id)
    }
  });
});

router.get('/admin/users', requireAdmin, (req, res) => {
  res.json({
    success: true,
    data: {
      users: listUsers()
    }
  });
});

router.post('/admin/entitlements', requireAdmin, (req, res) => {
  try {
    const { telegram_id, days, note } = req.body || {};
    const entitlement = grantGiftAccess(telegram_id, req.telegramUser.id, days, note);

    res.json({ success: true, data: entitlement });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/admin/entitlements/:telegramId', requireAdmin, (req, res) => {
  try {
    revokeAccess(req.params.telegramId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
