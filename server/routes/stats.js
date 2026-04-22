const express = require('express');
const db = require('../db');

const router = express.Router();

// Агрегация статистики за конкретный день.
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

// Агрегация статистики за диапазон дат.
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

function buildDayHint(totals, goal) {
  const calories = totals.calories || 0;
  const protein = totals.protein || 0;
  const fat = totals.fat || 0;
  const remaining = Math.round(goal - calories);

  if (calories > goal) return `Перебор по калориям на ${Math.abs(remaining)} ккал. Дальше лучше выбрать легкую еду.`;
  if (remaining <= 150 && remaining >= 0) return 'Цель по калориям почти закрыта.';
  if (protein < 60 && calories > goal * 0.45) return 'Похоже, сегодня не хватает белка.';
  if (fat > 80) return 'Сегодня заметный перебор по жирам.';
  if (remaining > 250) return `Можно добавить легкий прием пищи до ${remaining} ккал.`;
  return 'День идет ровно, продолжайте в том же темпе.';
}

function buildWeekSummary(days, goal) {
  const total = days.reduce((acc, day) => ({
    calories: acc.calories + (day.calories || 0),
    protein: acc.protein + (day.protein || 0),
    fat: acc.fat + (day.fat || 0),
    carbs: acc.carbs + (day.carbs || 0)
  }), { calories: 0, protein: 0, fat: 0, carbs: 0 });

  const daysWithMeals = days.filter(day => day.meal_count > 0);
  const divisor = daysWithMeals.length || days.length || 1;
  const daysWithinGoal = days.filter(day => day.calories > 0 && day.calories <= goal).length;
  const bestDay = daysWithMeals.slice().sort((a, b) => Math.abs(a.calories - goal) - Math.abs(b.calories - goal))[0] || null;
  const problemDay = daysWithMeals.slice().sort((a, b) => Math.abs(b.calories - goal) - Math.abs(a.calories - goal))[0] || null;
  const avgCalories = Math.round(total.calories / divisor);
  const diff = avgCalories - goal;

  return {
    averages: {
      calories: avgCalories,
      protein: Number((total.protein / divisor).toFixed(1)),
      fat: Number((total.fat / divisor).toFixed(1)),
      carbs: Number((total.carbs / divisor).toFixed(1))
    },
    days_within_goal: daysWithinGoal,
    best_day: bestDay,
    problem_day: problemDay,
    summary_text: diff === 0
      ? 'В среднем неделя точно в цели.'
      : `В среднем ты был ${Math.abs(diff)} ккал ${diff > 0 ? 'выше' : 'ниже'} цели.`
  };
}

// Универсальный endpoint статистики: day по умолчанию или week/from-to.
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

      const weekSummary = buildWeekSummary(days, dailyCalories);

      res.json({
        success: true,
        data: {
          period: 'week',
          goal: dailyCalories,
          days,
          averages: weekSummary.averages,
          days_within_goal: weekSummary.days_within_goal,
          best_day: weekSummary.best_day,
          problem_day: weekSummary.problem_day,
          summary_text: weekSummary.summary_text
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
          remaining: Math.max(0, dailyCalories - totals.calories),
          hint: buildDayHint(totals, dailyCalories)
        }
      });
    }
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

module.exports = router;
