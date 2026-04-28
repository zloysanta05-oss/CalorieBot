const express = require('express');
const db = require('../db');
const {
  listInventoryItems,
  getInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  normalizeInventoryPayload,
  upsertInventoryItem,
  consolidateInventoryItems,
  findDuplicateInventoryItem,
  consumeInventoryItem
} = require('../services/inventory');

const router = express.Router();

// Временная pantry-сессия превращается в постоянные остатки только после подтверждения пользователем.
const getPantrySession = db.prepare('SELECT * FROM pantry_sessions WHERE id = ? AND telegram_id = ?');
const listPantryItems = db.prepare('SELECT * FROM pantry_items WHERE session_id = ? ORDER BY id ASC');

// Купленный товар можно перенести в остатки, но только из списка текущего пользователя.
const getShoppingItem = db.prepare(`
  SELECT i.*
  FROM shopping_items i
  JOIN shopping_lists l ON l.id = i.list_id
  WHERE i.id = ? AND l.telegram_id = ?
`);

// Текущий список продуктов пользователя во вкладке рецептов.
router.get('/inventory', (req, res) => {
  res.json({ success: true, data: { items: listInventoryItems.all(req.telegramUser.id) } });
});

// Ручное добавление делает upsert: одинаковые продукт + единица суммируются.
router.post('/inventory', (req, res) => {
  try {
    const item = upsertInventoryItem(req.telegramUser.id, {
      ...(req.body || {}),
      source: 'manual'
    });
    res.json({ success: true, data: item, items: consolidateInventoryItems(req.telegramUser.id) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// При редактировании запрещаем создать дубль с тем же normalized_name и единицей.
router.put('/inventory/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = getInventoryItem.get(id, req.telegramUser.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Inventory item not found' });

    const item = normalizeInventoryPayload(req.body || {}, existing.source);
    const duplicate = findDuplicateInventoryItem(req.telegramUser.id, id, {
      ...(req.body || {}),
      source: existing.source
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: 'inventory_duplicate',
        message: 'Такой продукт уже есть в остатках'
      });
    }

    updateInventoryItem.run(
      item.name,
      item.normalized_name,
      item.quantity_value,
      item.quantity_unit,
      item.category,
      existing.source,
      id,
      req.telegramUser.id
    );
    res.json({ success: true, data: getInventoryItem.get(id, req.telegramUser.id) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Полное удаление позиции остатков.
router.delete('/inventory/:id', (req, res) => {
  const item = getInventoryItem.get(parseInt(req.params.id, 10), req.telegramUser.id);
  if (!item) return res.status(404).json({ success: false, error: 'Inventory item not found' });

  deleteInventoryItem.run(item.id, req.telegramUser.id);
  res.json({ success: true });
});

// Списание уменьшает количество, но не уходит ниже нуля.
router.post('/inventory/:id/consume', (req, res) => {
  const body = req.body || {};
  const item = consumeInventoryItem(
    req.telegramUser.id,
    parseInt(req.params.id, 10),
    body.quantity_value,
    body.quantity_unit
  );
  if (!item) return res.status(404).json({ success: false, error: 'Inventory item not found' });

  res.json({ success: true, data: item, reason: body.reason || 'использовано' });
});

// Подтвержденный список с фото переносится из временной зоны в постоянные остатки.
router.post('/inventory/from-pantry-session/:sessionId', (req, res) => {
  const session = getPantrySession.get(parseInt(req.params.sessionId, 10), req.telegramUser.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  listPantryItems.all(session.id).forEach(item => upsertInventoryItem(req.telegramUser.id, {
    name: item.name,
    quantity_text: item.quantity_text,
    category: item.category,
    source: 'photo'
  }));

  res.json({ success: true, data: { items: consolidateInventoryItems(req.telegramUser.id) } });
});

// Отмеченный купленным товар пополняет остатки пользователя.
router.post('/inventory/from-shopping-item/:id', (req, res) => {
  const item = getShoppingItem.get(parseInt(req.params.id, 10), req.telegramUser.id);
  if (!item) return res.status(404).json({ success: false, error: 'Shopping item not found' });

  const inventoryItem = upsertInventoryItem(req.telegramUser.id, {
    name: item.name,
    quantity_text: item.quantity_text,
    category: item.category,
    source: 'shopping'
  });

  res.json({
    success: true,
    data: inventoryItem,
    items: consolidateInventoryItems(req.telegramUser.id)
  });
});

module.exports = router;
