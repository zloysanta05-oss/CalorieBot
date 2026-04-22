const express = require('express');
const db = require('../db');

const router = express.Router();

const listFavorites = db.prepare(`
  SELECT *
  FROM favorite_meals
  WHERE telegram_id = ?
  ORDER BY updated_at DESC
`);

const getFavorite = db.prepare('SELECT * FROM favorite_meals WHERE id = ? AND telegram_id = ?');
const listFavoriteNames = db.prepare('SELECT * FROM favorite_meals WHERE telegram_id = ?');

const insertFavorite = db.prepare(`
  INSERT INTO favorite_meals (telegram_id, name, calories, protein, fat, carbs, portion_grams, meal_type, items_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateFavorite = db.prepare(`
  UPDATE favorite_meals
  SET name = ?,
      calories = ?,
      protein = ?,
      fat = ?,
      carbs = ?,
      portion_grams = ?,
      meal_type = ?,
      items_json = ?,
      updated_at = datetime('now')
  WHERE id = ? AND telegram_id = ?
`);

const deleteFavorite = db.prepare('DELETE FROM favorite_meals WHERE id = ? AND telegram_id = ?');

const insertMeal = db.prepare(`
  INSERT INTO meals (telegram_id, date, meal_type, description, calories, protein, fat, carbs, portion_grams, source, items_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'favorite', ?)
`);

function normalizeItemsJson(items) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const normalized = items.map(item => ({
    name: String(item.name || '').trim(),
    calories: Math.max(0, Math.round(Number(item.calories) || 0)),
    protein: Math.max(0, Number((Number(item.protein) || 0).toFixed(1))),
    fat: Math.max(0, Number((Number(item.fat) || 0).toFixed(1))),
    carbs: Math.max(0, Number((Number(item.carbs) || 0).toFixed(1))),
    portion_grams: item.portion_grams === null || item.portion_grams === '' || item.portion_grams === undefined
      ? null
      : Math.max(0, Math.round(Number(item.portion_grams) || 0))
  })).filter(item => item.name);

  return normalized.length ? JSON.stringify(normalized) : null;
}

function normalizeFavoriteName(name) {
  return String(name || '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function findDuplicateFavorite(telegramId, name, exceptId) {
  const key = normalizeFavoriteName(name);
  if (!key) return null;

  return listFavoriteNames.all(telegramId).find(item => {
    if (exceptId && item.id === exceptId) return false;
    return normalizeFavoriteName(item.name) === key;
  }) || null;
}

function normalizeMealPayload(body) {
  const name = String(body.name || body.description || '').trim();
  if (!name) throw new Error('Name is required');

  const mealType = ['breakfast', 'lunch', 'dinner', 'snack'].includes(body.meal_type) ? body.meal_type : 'snack';

  return {
    name,
    calories: Math.max(0, Math.round(Number(body.calories) || 0)),
    protein: Math.max(0, Number((Number(body.protein) || 0).toFixed(1))),
    fat: Math.max(0, Number((Number(body.fat) || 0).toFixed(1))),
    carbs: Math.max(0, Number((Number(body.carbs) || 0).toFixed(1))),
    portion_grams: body.portion_grams === null || body.portion_grams === '' || body.portion_grams === undefined
      ? null
      : Math.max(0, Math.round(Number(body.portion_grams) || 0)),
    meal_type: mealType,
    items_json: normalizeItemsJson(body.items)
  };
}

router.get('/favorites', (req, res) => {
  const favorites = listFavorites.all(req.telegramUser.id);
  res.json({ success: true, data: { favorites } });
});

router.post('/favorites', (req, res) => {
  try {
    const data = normalizeMealPayload(req.body || {});
    const duplicate = findDuplicateFavorite(req.telegramUser.id, data.name);
    if (duplicate) {
      return res.json({ success: true, data: duplicate, already_exists: true });
    }

    const result = insertFavorite.run(
      req.telegramUser.id,
      data.name,
      data.calories,
      data.protein,
      data.fat,
      data.carbs,
      data.portion_grams,
      data.meal_type,
      data.items_json
    );

    res.json({ success: true, data: getFavorite.get(result.lastInsertRowid, req.telegramUser.id) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/favorites/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = getFavorite.get(id, req.telegramUser.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Favorite not found' });

    const data = normalizeMealPayload(req.body || {});
    const duplicate = findDuplicateFavorite(req.telegramUser.id, data.name, id);
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: 'favorite_duplicate',
        message: 'Такое блюдо уже есть в избранном'
      });
    }

    updateFavorite.run(
      data.name,
      data.calories,
      data.protein,
      data.fat,
      data.carbs,
      data.portion_grams,
      data.meal_type,
      data.items_json,
      id,
      req.telegramUser.id
    );

    res.json({ success: true, data: getFavorite.get(id, req.telegramUser.id) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/favorites/:id', (req, res) => {
  deleteFavorite.run(parseInt(req.params.id, 10), req.telegramUser.id);
  res.json({ success: true });
});

router.post('/favorites/:id/add-to-diary', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const body = req.body || {};
  const favorite = getFavorite.get(id, req.telegramUser.id);
  if (!favorite) return res.status(404).json({ success: false, error: 'Favorite not found' });

  const date = body.date || new Date().toISOString().split('T')[0];
  const mealType = ['breakfast', 'lunch', 'dinner', 'snack'].includes(body.meal_type)
    ? body.meal_type
    : favorite.meal_type;

  const result = insertMeal.run(
    req.telegramUser.id,
    date,
    mealType,
    favorite.name,
    favorite.calories,
    favorite.protein,
    favorite.fat,
    favorite.carbs,
    favorite.portion_grams,
    favorite.items_json
  );

  res.json({ success: true, data: { id: result.lastInsertRowid } });
});

module.exports = router;
