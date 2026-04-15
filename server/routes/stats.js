const express = require('express');
const db = require('../db');

const router = express.Router();

const getDayTotals = db.prepare(`
  SELECT
    date,
    COUNT(*) as meal_count,
    ROUND(SUM(calories), 0) as calories,
    ROUND(SUM(protein), 1) as protein,
    ROUND(SUM(fat), 1) as fat,
    ROUND(SUM(carbs), 1) as carbs
  FROM meals
  WHERE telegram_id = ? AND date = ?
  GROUP BY date
`);

const getWeekTotals = db.prepare(`
  SELECT
    date,
    COUNT(*) as meal_count,
    ROUND(SUM(calories), 0) as calories,
    ROUND(SUM(protein), 1) as protein,
    ROUND(SUM(fat), 1) as fat,
    ROUND(SUM(carbs), 1) as carbs
  FROM meals
  WHERE telegram_id = ? AND date >= ? AND date <= ?
  GROUP BY date
  ORDER BY date ASC
`);

const getGoal = db.prepare('SELECT daily_calories FROM goals WHERE telegram_id = ?');

router.get('/stats', (req, res) => {
  try {
    const userId = req.telegramUser.id;
    const goal = getGoal.get(userId);
    const dailyCalories = goal ? goal.daily_calories : 2000;

    if (req.query.period === 'week' || (req.query.from && req.query.to)) {
      let from, to;

      if (req.query.from && req.query.to) {
        from = req.query.from;
        to = req.query.to;
      } else {
        const today = new Date();
        to = today.toISOString().split('T')[0];
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 6);
        from = weekAgo.toISOString().split('T')[0];
      }

      const rows = getWeekTotals.all(userId, from, to);

      const days = [];
      const start = new Date(from);
      const end = new Date(to);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const found = rows.find(r => r.date === dateStr);
        days.push(found || { date: dateStr, meal_count: 0, calories: 0, protein: 0, fat: 0, carbs: 0 });
      }

      const totalCals = days.reduce((s, d) => s + d.calories, 0);
      const daysWithMeals = days.filter(d => d.meal_count > 0).length;

      res.json({
        success: true,
        data: {
          period: 'week',
          goal: dailyCalories,
          days,
          averages: {
            calories: daysWithMeals > 0 ? Math.round(totalCals / daysWithMeals) : 0
          }
        }
      });
    } else {
      const date = req.query.date || new Date().toISOString().split('T')[0];
      const day = getDayTotals.get(userId, date);

      const totals = day || { date, meal_count: 0, calories: 0, protein: 0, fat: 0, carbs: 0 };

      res.json({
        success: true,
        data: {
          period: 'day',
          date,
          goal: dailyCalories,
          totals,
          remaining: Math.max(0, dailyCalories - totals.calories)
        }
      });
    }
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

module.exports = router;
