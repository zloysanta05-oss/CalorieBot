const express = require('express');
const db = require('../db');
const { generateRecipesFromItems } = require('../services/openai');
const { assertCanAnalyze, recordAnalysis } = require('../services/monetization');
const {
  listInventoryItems,
  consumeInventoryItem,
  findBestInventoryMatch,
  parseQuantityText
} = require('../services/inventory');

const router = express.Router();

const getSession = db.prepare('SELECT * FROM pantry_sessions WHERE id = ? AND telegram_id = ?');
const listPantryItems = db.prepare('SELECT * FROM pantry_items WHERE session_id = ? ORDER BY id ASC');
const getRecipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND telegram_id = ?');
const listFavorites = db.prepare('SELECT * FROM favorite_meals WHERE telegram_id = ?');

const insertRecipe = db.prepare(`
  INSERT INTO recipes (
    telegram_id, pantry_session_id, title, goal, time_minutes, difficulty, servings,
    calories, protein, fat, carbs, steps_json, ingredients_json, missing_items_json
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMeal = db.prepare(`
  INSERT INTO meals (telegram_id, date, meal_type, description, calories, protein, fat, carbs, portion_grams, source, items_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'recipe', ?)
`);

const insertFavorite = db.prepare(`
  INSERT INTO favorite_meals (telegram_id, name, calories, protein, fat, carbs, portion_grams, meal_type, items_json, recipe_steps_json)
  VALUES (?, ?, ?, ?, ?, ?, NULL, 'lunch', ?, ?)
`);

const updateFavoriteRecipe = db.prepare(`
  UPDATE favorite_meals
  SET calories = ?,
      protein = ?,
      fat = ?,
      carbs = ?,
      items_json = ?,
      recipe_steps_json = ?,
      updated_at = datetime('now')
  WHERE id = ? AND telegram_id = ?
`);

function normalizeFavoriteName(name) {
  return String(name || '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function findDuplicateFavorite(telegramId, name) {
  const key = normalizeFavoriteName(name);
  if (!key) return null;

  return listFavorites.all(telegramId).find(item => normalizeFavoriteName(item.name) === key) || null;
}

function serializeRecipe(recipe) {
  return {
    ...recipe,
    steps: JSON.parse(recipe.steps_json || '[]'),
    ingredients: JSON.parse(recipe.ingredients_json || '[]'),
    missing_items: JSON.parse(recipe.missing_items_json || '[]')
  };
}

function normalizeGoal(goal) {
  const allowed = ['похудение', 'поддержание', 'набор массы', 'высокий белок'];
  return allowed.includes(goal) ? goal : 'поддержание';
}

function addRecipeMeal(telegramId, recipe, date, mealType) {
  return insertMeal.run(
    telegramId,
    date,
    mealType,
    recipe.title,
    recipe.calories,
    recipe.protein,
    recipe.fat,
    recipe.carbs,
    null,
    recipe.ingredients_json
  );
}

const cookRecipeTransaction = db.transaction((telegramId, recipe, date, mealType) => {
  const inserted = addRecipeMeal(telegramId, recipe, date, mealType);
  const ingredients = JSON.parse(recipe.ingredients_json || '[]').filter(item => item.available);

  ingredients.forEach(ingredient => {
    const inventory = listInventoryItems.all(telegramId);
    const match = findBestInventoryMatch(inventory, ingredient);
    const parsed = parseQuantityText(ingredient.quantity_text);
    if (match && parsed.quantity_value !== null && parsed.quantity_unit === match.quantity_unit) {
      consumeInventoryItem(telegramId, match.id, parsed.quantity_value, parsed.quantity_unit);
    }
  });

  return inserted.lastInsertRowid;
});

router.post('/recipes/generate', async (req, res) => {
  try {
    assertCanAnalyze(req.telegramUser.id);

    const body = req.body || {};
    const sessionId = parseInt(body.session_id, 10);
    const goal = normalizeGoal(body.goal);
    const useInventory = body.source === 'inventory' || !sessionId;
    const session = useInventory ? null : getSession.get(sessionId, req.telegramUser.id);
    if (!useInventory && !session) return res.status(404).json({ success: false, error: 'Session not found' });

    const items = useInventory
      ? listInventoryItems.all(req.telegramUser.id).map(item => ({
        name: item.name,
        quantity_text: item.quantity_value === null || item.quantity_value === undefined
          ? item.quantity_unit
          : item.quantity_value + ' ' + item.quantity_unit,
        category: item.category
      }))
      : listPantryItems.all(session.id);
    if (items.length === 0) {
      return res.status(400).json({ success: false, error: 'No items' });
    }

    const result = await generateRecipesFromItems(items, goal);
    const recipes = result.recipes.map(recipe => {
      const inserted = insertRecipe.run(
        req.telegramUser.id,
        session ? session.id : null,
        recipe.title,
        goal,
        recipe.time_minutes,
        recipe.difficulty,
        recipe.servings,
        recipe.calories,
        recipe.protein,
        recipe.fat,
        recipe.carbs,
        JSON.stringify(recipe.steps),
        JSON.stringify(recipe.ingredients),
        JSON.stringify(recipe.missing_items)
      );
      return serializeRecipe(getRecipe.get(inserted.lastInsertRowid, req.telegramUser.id));
    });

    const usage = recordAnalysis(req.telegramUser.id);
    res.json({ success: true, data: { recipes }, usage });
  } catch (err) {
    if (err.code === 'user_blocked') {
      return res.status(err.statusCode).json({
        success: false,
        error: err.code,
        message: 'Доступ к подбору рецептов ограничен администратором.',
        data: err.plan
      });
    }

    if (err.code === 'free_limit_reached') {
      return res.status(err.statusCode).json({
        success: false,
        error: err.code,
        message: 'Бесплатный лимит на сегодня исчерпан. Оформите Premium, чтобы продолжить.',
        data: err.plan
      });
    }

    console.error('Recipe generation error:', err.message);
    res.status(502).json({ success: false, error: 'ai_error', message: 'Не удалось подобрать рецепты' });
  }
});

router.get('/recipes/:id', (req, res) => {
  const recipe = getRecipe.get(parseInt(req.params.id, 10), req.telegramUser.id);
  if (!recipe) return res.status(404).json({ success: false, error: 'Recipe not found' });

  res.json({ success: true, data: serializeRecipe(recipe) });
});

router.post('/recipes/:id/add-to-diary', (req, res) => {
  const body = req.body || {};
  const recipe = getRecipe.get(parseInt(req.params.id, 10), req.telegramUser.id);
  if (!recipe) return res.status(404).json({ success: false, error: 'Recipe not found' });

  const date = body.date || new Date().toISOString().split('T')[0];
  const mealType = ['breakfast', 'lunch', 'dinner', 'snack'].includes(body.meal_type)
    ? body.meal_type
    : 'lunch';

  const inserted = addRecipeMeal(req.telegramUser.id, recipe, date, mealType);

  res.json({ success: true, data: { id: inserted.lastInsertRowid } });
});

router.post('/recipes/:id/cook', (req, res) => {
  const body = req.body || {};
  const recipe = getRecipe.get(parseInt(req.params.id, 10), req.telegramUser.id);
  if (!recipe) return res.status(404).json({ success: false, error: 'Recipe not found' });

  const date = body.date || new Date().toISOString().split('T')[0];
  const mealType = ['breakfast', 'lunch', 'dinner', 'snack'].includes(body.meal_type)
    ? body.meal_type
    : 'lunch';

  try {
    const mealId = cookRecipeTransaction(req.telegramUser.id, recipe, date, mealType);
    res.json({ success: true, data: { id: mealId } });
  } catch (err) {
    console.error('Cook recipe error:', err.message);
    res.status(500).json({ success: false, error: 'cook_failed', message: 'Не удалось приготовить рецепт' });
  }
});

router.post('/recipes/:id/favorite', (req, res) => {
  const recipe = getRecipe.get(parseInt(req.params.id, 10), req.telegramUser.id);
  if (!recipe) return res.status(404).json({ success: false, error: 'Recipe not found' });

  const duplicate = findDuplicateFavorite(req.telegramUser.id, recipe.title);
  if (duplicate) {
    updateFavoriteRecipe.run(
      recipe.calories,
      recipe.protein,
      recipe.fat,
      recipe.carbs,
      recipe.ingredients_json,
      recipe.steps_json,
      duplicate.id,
      req.telegramUser.id
    );
    return res.json({
      success: true,
      data: findDuplicateFavorite(req.telegramUser.id, recipe.title),
      already_exists: true,
      updated: true
    });
  }

  const inserted = insertFavorite.run(
    req.telegramUser.id,
    recipe.title,
    recipe.calories,
    recipe.protein,
    recipe.fat,
    recipe.carbs,
    recipe.ingredients_json,
    recipe.steps_json
  );

  res.json({ success: true, data: { id: inserted.lastInsertRowid } });
});

module.exports = router;
