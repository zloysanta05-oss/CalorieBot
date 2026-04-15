// Stats tab logic

var statsTab = (function() {
  var currentGoal = 2000;

  function init() {
    document.getElementById('btn-save-goal').addEventListener('click', function() {
      var val = parseInt(document.getElementById('goal-input').value, 10);
      if (!val || val < 500 || val > 10000) {
        showToast('Укажите цель от 500 до 10000 ккал', 'error');
        return;
      }
      api.setGoal(val).then(function() {
        currentGoal = val;
        showToast('Цель сохранена!');
        haptic('success');
        loadStats();
      }).catch(function() {
        showToast('Ошибка сохранения', 'error');
      });
    });
  }

  function show() {
    loadStats();
  }

  function loadStats() {
    Promise.all([
      api.getStats('day'),
      api.getWeekStats(),
      api.getGoals()
    ]).then(function(results) {
      var dayRes = results[0];
      var weekRes = results[1];
      var goalsRes = results[2];

      currentGoal = goalsRes.data.daily_calories || 2000;
      document.getElementById('goal-input').value = currentGoal;

      if (dayRes.success) renderDayStats(dayRes.data);
      if (weekRes.success) renderWeekChart(weekRes.data);
    }).catch(function() {
      showToast('Не удалось загрузить статистику', 'error');
    });
  }

  function renderDayStats(data) {
    var totals = data.totals || { calories: 0, protein: 0, fat: 0, carbs: 0 };
    var goal = data.goal || currentGoal;
    var cals = Math.round(totals.calories);

    document.getElementById('stats-today-cals').textContent = cals;
    document.getElementById('stats-today-label').textContent = 'из ' + goal + ' ккал';

    var remaining = Math.max(0, goal - cals);
    document.getElementById('stats-remaining-text').textContent =
      cals >= goal ? 'Цель достигнута!' : 'Осталось ' + remaining + ' ккал';

    // Update ring
    var pct = Math.min(1, cals / goal);
    var circumference = 2 * Math.PI * 70; // r=70
    var offset = circumference * (1 - pct);
    var ring = document.getElementById('ring-progress');
    ring.style.strokeDashoffset = offset;
    ring.style.stroke = pct > 1 ? 'var(--danger)' : 'var(--link)';

    // Macros
    document.getElementById('stats-protein').textContent = Math.round(totals.protein || 0) + ' г';
    document.getElementById('stats-fat').textContent = Math.round(totals.fat || 0) + ' г';
    document.getElementById('stats-carbs').textContent = Math.round(totals.carbs || 0) + ' г';
  }

  function renderWeekChart(data) {
    var days = data.days || [];
    var goal = data.goal || currentGoal;
    var container = document.getElementById('week-chart-bars');

    if (days.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Нет данных за неделю</p></div>';
      return;
    }

    var maxVal = Math.max(goal, Math.max.apply(null, days.map(function(d) { return d.calories; })));
    if (maxVal === 0) maxVal = goal;

    var goalPct = Math.round((1 - goal / maxVal) * 100);

    var html = '<div class="chart-goal-line" style="bottom:' + Math.round(goal / maxVal * 100) + '%"></div>';

    days.forEach(function(day) {
      var heightPct = maxVal > 0 ? Math.round(day.calories / maxVal * 100) : 0;
      var isOver = day.calories > goal;
      html += '<div class="chart-bar-wrapper">' +
        '<div class="chart-bar' + (isOver ? ' over' : '') + '" style="height:' + Math.max(heightPct, 1) + '%"' +
        ' title="' + Math.round(day.calories) + ' ккал"></div>' +
        '<div class="chart-bar-label">' + formatShortDate(day.date) + '</div>' +
      '</div>';
    });

    container.innerHTML = html;
  }

  return { init: init, show: show };
})();
