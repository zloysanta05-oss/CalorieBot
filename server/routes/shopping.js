const express = require('express');
const db = require('../db');
const { upsertInventoryItem } = require('../services/inventory');

const router = express.Router();

const getRecipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND telegram_id = ?');
const getList = db.prepare('SELECT * FROM shopping_lists WHERE id = ? AND telegram_id = ?');
const getCurrentList = db.prepare(`
  SELECT *
  FROM shopping_lists
  WHERE telegram_id = ?
  ORDER BY id DESC
  LIMIT 1
`);
const getItem = db.prepare(`
  SELECT i.*
  FROM shopping_items i
  JOIN shopping_lists l ON l.id = i.list_id
  WHERE i.id = ? AND l.telegram_id = ?
`);

const insertList = db.prepare(`
  INSERT INTO shopping_lists (telegram_id, recipe_id, title)
  VALUES (?, ?, ?)
`);

const insertItem = db.prepare(`
  INSERT INTO shopping_items (list_id, name, quantity_text, category, is_checked)
  VALUES (?, ?, ?, ?, 0)
`);

const listItems = db.prepare('SELECT * FROM shopping_items WHERE list_id = ? ORDER BY category, id');

const updateItem = db.prepare(`
  UPDATE shopping_items
  SET name = ?, quantity_text = ?, category = ?, is_checked = ?
  WHERE id = ?
`);

const deleteItem = db.prepare('DELETE FROM shopping_items WHERE id = ?');
const deleteCheckedItems = db.prepare('DELETE FROM shopping_items WHERE list_id = ? AND is_checked = 1');

const CATEGORIES = new Set([
  'овощи/фрукты',
  'молочные',
  'мясо/рыба/птица',
  'крупы/хлеб/макароны',
  'специи/соусы',
  'другое'
]);

function normalizeCategory(category) {
  const value = String(category || 'другое').trim().toLocaleLowerCase('ru-RU');
  return CATEGORIES.has(value) ? value : 'другое';
}

function normalizeItemPayload(body, fallback) {
  const base = fallback || {};
  const name = String(body.name !== undefined ? body.name : base.name || '').trim();
  if (!name) throw new Error('Name is required');

  return {
    name,
    quantity_text: String(body.quantity_text !== undefined ? body.quantity_text : base.quantity_text || '').trim(),
    category: normalizeCategory(body.category !== undefined ? body.category : base.category),
    is_checked: body.is_checked === undefined ? Number(base.is_checked) === 1 : (body.is_checked ? 1 : 0)
  };
}

function serializeList(list) {
  return { ...list, items: listItems.all(list.id) };
}

function createList(telegramId, title, recipeId) {
  const inserted = insertList.run(telegramId, recipeId || null, title || 'Мой список покупок');
  return getList.get(inserted.lastInsertRowid, telegramId);
}

function getTargetList(telegramId, listId, title, recipeId) {
  const explicitId = parseInt(listId, 10);
  if (explicitId) {
    const explicitList = getList.get(explicitId, telegramId);
    if (explicitList) return explicitList;
  }

  return getCurrentList.get(telegramId) || createList(telegramId, title, recipeId);
}

router.get('/shopping-lists/current', (req, res) => {
  const list = getCurrentList.get(req.telegramUser.id);
  res.json({ success: true, data: list ? serializeList(list) : null });
});

router.post('/shopping-lists', (req, res) => {
  const body = req.body || {};
  const list = createList(req.telegramUser.id, String(body.title || 'Мой список покупок').trim(), null);
  res.json({ success: true, data: serializeList(list) });
});

router.post('/shopping-lists/from-recipe/:recipeId', (req, res) => {
  const body = req.body || {};
  const recipe = getRecipe.get(parseInt(req.params.recipeId, 10), req.telegramUser.id);
  if (!recipe) return res.status(404).json({ success: false, error: 'Recipe not found' });

  const missingItems = JSON.parse(recipe.missing_items_json || '[]');
  const list = getTargetList(
    req.telegramUser.id,
    body.list_id,
    'Покупки: ' + recipe.title,
    recipe.id
  );

  missingItems.forEach(item => {
    insertItem.run(list.id, item.name || 'продукт', item.quantity_text || '', normalizeCategory(item.category));
  });

  res.json({ success: true, data: serializeList(list) });
});

router.get('/shopping-lists/:id', (req, res) => {
  const list = getList.get(parseInt(req.params.id, 10), req.telegramUser.id);
  if (!list) return res.status(404).json({ success: false, error: 'Shopping list not found' });

  res.json({ success: true, data: serializeList(list) });
});

router.post('/shopping-lists/:id/items', (req, res) => {
  try {
    const list = getList.get(parseInt(req.params.id, 10), req.telegramUser.id);
    if (!list) return res.status(404).json({ success: false, error: 'Shopping list not found' });

    const item = normalizeItemPayload(req.body || {});
    const inserted = insertItem.run(list.id, item.name, item.quantity_text, item.category);
    res.json({ success: true, data: getItem.get(inserted.lastInsertRowid, req.telegramUser.id) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/shopping-lists/:id/checked-items', (req, res) => {
  const list = getList.get(parseInt(req.params.id, 10), req.telegramUser.id);
  if (!list) return res.status(404).json({ success: false, error: 'Shopping list not found' });

  deleteCheckedItems.run(list.id);
  res.json({ success: true, data: serializeList(list) });
});

router.put('/shopping-items/:id', (req, res) => {
  try {
    const body = req.body || {};
    const item = getItem.get(parseInt(req.params.id, 10), req.telegramUser.id);
    if (!item) return res.status(404).json({ success: false, error: 'Shopping item not found' });
    const data = normalizeItemPayload(body, item);

    updateItem.run(
      data.name,
      data.quantity_text,
      data.category,
      data.is_checked,
      item.id
    );

    const updated = getItem.get(item.id, req.telegramUser.id);
    let inventoryItem = null;
    if (updated.is_checked && !item.is_checked) {
      inventoryItem = upsertInventoryItem(req.telegramUser.id, {
        name: updated.name,
        quantity_text: updated.quantity_text,
        category: updated.category,
        source: 'shopping'
      });
    }

    res.json({ success: true, data: updated, inventory_item: inventoryItem });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/shopping-items/:id', (req, res) => {
  const item = getItem.get(parseInt(req.params.id, 10), req.telegramUser.id);
  if (!item) return res.status(404).json({ success: false, error: 'Shopping item not found' });

  deleteItem.run(item.id);
  res.json({ success: true });
});

module.exports = router;
