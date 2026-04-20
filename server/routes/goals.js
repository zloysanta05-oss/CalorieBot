const express = require('express');
const db = require('../db');

const router = express.Router();

const getGoal = db.prepare('SELECT * FROM goals WHERE telegram_id = ?');
const upsertGoal = db.prepare(`
  INSERT INTO goals (telegram_id, daily_calories, updated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(telegram_id) DO UPDATE SET daily_calories = excluded.daily_calories, updated_at = datetime('now')
`);

// Возвращаем индивидуальную цель или дефолт 2000 ккал.
router.get('/goals', (req, res) => {
  try {
    const userId = req.telegramUser.id;
    const goal = getGoal.get(userId);

    res.json({
      success: true,
      data: goal || { telegram_id: userId, daily_calories: 2000 }
    });
  } catch (err) {
    console.error('Get goals error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to get goals' });
  }
});

// Сохраняем дневную цель с базовой валидацией разумного диапазона.
router.put('/goals', (req, res) => {
  try {
    const userId = req.telegramUser.id;
    const { daily_calories } = req.body;

    const cals = Number(daily_calories);
    if (!cals || cals < 500 || cals > 10000) {
      return res.status(400).json({ success: false, error: 'Invalid calorie goal (500-10000)' });
    }

    upsertGoal.run(userId, cals);

    res.json({
      success: true,
      data: { telegram_id: userId, daily_calories: cals }
    });
  } catch (err) {
    console.error('Set goals error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to save goals' });
  }
});

module.exports = router;
