const express = require('express');
const db = require('../db');

const router = express.Router();

// Подготовленные SQLite statements для операций дневника питания.
const insertMeal = db.prepare(`
  INSERT INTO meals (telegram_id, date, meal_type, description, calories, protein, fat, carbs, portion_grams, source, image_data, items_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const getMealsByDate = db.prepare(`
  SELECT * FROM meals WHERE telegram_id = ? AND date = ? ORDER BY created_at ASC
`);

const getMealById = db.prepare(`
  SELECT * FROM meals WHERE id = ? AND telegram_id = ?
`);

const deleteMealById = db.prepare(`
  DELETE FROM meals WHERE id = ? AND telegram_id = ?
`);

const updateMealById = db.prepare(`
  UPDATE meals
  SET meal_type = ?
  WHERE id = ? AND telegram_id = ?
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

// Сохранение приема пищи после анализа или ручной правки результата.
router.post('/meals', (req, res) => {
  try {
    const userId = req.telegramUser.id;
    const { date, meal_type, description, calories, protein, fat, carbs, portion_grams, source, image_data, items } = req.body;

    if (!description || !calories) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const mealDate = date || new Date().toISOString().split('T')[0];
    const type = ['breakfast', 'lunch', 'dinner', 'snack'].includes(meal_type) ? meal_type : 'snack';

    const result = insertMeal.run(
      userId, mealDate, type, description,
      Number(calories) || 0,
      Number(protein) || 0,
      Number(fat) || 0,
      Number(carbs) || 0,
      Number(portion_grams) || null,
      source || 'text',
      image_data || null,
      normalizeItemsJson(items)
    );

    res.json({
      success: true,
      data: {
        id: result.lastInsertRowid,
        telegram_id: userId,
        date: mealDate,
        meal_type: type,
        description,
        calories: Number(calories),
        protein: Number(protein) || 0,
        fat: Number(fat) || 0,
        carbs: Number(carbs) || 0,
        portion_grams: Number(portion_grams) || null,
        source: source || 'text',
        items_json: normalizeItemsJson(items)
      }
    });
  } catch (err) {
    console.error('Save meal error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to save meal' });
  }
});

// Получение записей за день вместе с дневными итогами КБЖУ.
router.get('/meals', (req, res) => {
  try {
    const userId = req.telegramUser.id;
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const meals = getMealsByDate.all(userId, date);

    const totals = meals.reduce((acc, m) => ({
      calories: acc.calories + (m.calories || 0),
      protein: acc.protein + (m.protein || 0),
      fat: acc.fat + (m.fat || 0),
      carbs: acc.carbs + (m.carbs || 0)
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });

    res.json({ success: true, data: { meals, totals } });
  } catch (err) {
    console.error('Get meals error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to get meals' });
  }
});

// Обновление приема пищи. Сейчас используется для переноса блюда между группами дневника.
router.put('/meals/:id', (req, res) => {
  try {
    const userId = req.telegramUser.id;
    const mealId = parseInt(req.params.id, 10);
    const body = req.body || {};
    const meal = getMealById.get(mealId, userId);

    if (!meal) {
      return res.status(404).json({ success: false, error: 'Meal not found' });
    }

    const mealType = ['breakfast', 'lunch', 'dinner', 'snack'].includes(body.meal_type)
      ? body.meal_type
      : meal.meal_type;

    updateMealById.run(mealType, mealId, userId);
    res.json({ success: true, data: getMealById.get(mealId, userId) });
  } catch (err) {
    console.error('Update meal error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update meal' });
  }
});

// Удаление записи разрешено только владельцу этой записи.
router.delete('/meals/:id', (req, res) => {
  try {
    const userId = req.telegramUser.id;
    const mealId = parseInt(req.params.id, 10);

    const meal = getMealById.get(mealId, userId);
    if (!meal) {
      return res.status(404).json({ success: false, error: 'Meal not found' });
    }

    deleteMealById.run(mealId, userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete meal error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to delete meal' });
  }
});

module.exports = router;
