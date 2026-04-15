// Diary tab logic

var diaryTab = (function() {
  var currentDate = todayStr();
  var currentGoal = 2000;

  function init() {
    document.getElementById('date-prev').addEventListener('click', function() {
      currentDate = addDays(currentDate, -1);
      render();
      haptic('light');
    });

    document.getElementById('date-next').addEventListener('click', function() {
      currentDate = addDays(currentDate, 1);
      render();
      haptic('light');
    });

    document.getElementById('diary-today-link').addEventListener('click', function() {
      currentDate = todayStr();
      render();
    });

    document.getElementById('diary-list').addEventListener('click', function(e) {
      var btn = e.target.closest('.meal-delete');
      if (!btn) return;
      var id = btn.dataset.id;
      if (!id) return;
      deleteMeal(parseInt(id, 10));
    });
  }

  function show() {
    currentDate = todayStr();
    render();
  }

  function render() {
    updateDateDisplay();
    loadMeals();
  }

  function updateDateDisplay() {
    document.getElementById('diary-date-text').textContent = formatDate(currentDate);
    var todayLink = document.getElementById('diary-today-link');
    if (currentDate === todayStr()) {
      todayLink.classList.add('hidden');
    } else {
      todayLink.classList.remove('hidden');
    }
  }

  function loadMeals() {
    Promise.all([
      api.getMeals(currentDate),
      api.getGoals()
    ]).then(function(results) {
      var mealsRes = results[0];
      var goalsRes = results[1];
      currentGoal = goalsRes.data.daily_calories || 2000;

      if (mealsRes.success) {
        renderMeals(mealsRes.data.meals, mealsRes.data.totals);
      }
    }).catch(function() {
      showToast('Не удалось загрузить данные', 'error');
    });
  }

  function renderMeals(meals, totals) {
    var listEl = document.getElementById('diary-list');
    var emptyEl = document.getElementById('diary-empty');
    var totalsEl = document.getElementById('diary-totals');

    if (!meals || meals.length === 0) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      totalsEl.classList.add('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    totalsEl.classList.remove('hidden');

    // Show totals
    document.getElementById('diary-total-cals').textContent = Math.round(totals.calories) + ' ккал';
    document.getElementById('diary-total-goal').textContent = 'из ' + currentGoal + ' ккал';

    var pct = Math.min(100, Math.round(totals.calories / currentGoal * 100));
    var progressEl = document.getElementById('diary-progress');
    progressEl.style.width = pct + '%';
    progressEl.className = 'progress-fill' + (pct > 100 ? ' over' : '');

    // Group by meal type
    var groups = { breakfast: [], lunch: [], dinner: [], snack: [] };
    meals.forEach(function(m) {
      var type = groups[m.meal_type] ? m.meal_type : 'snack';
      groups[type].push(m);
    });

    var html = '';
    var order = ['breakfast', 'lunch', 'dinner', 'snack'];
    order.forEach(function(type) {
      if (groups[type].length === 0) return;
      html += '<div class="meal-group-header">' + MEAL_ICONS[type] + ' ' + MEAL_LABELS[type] + '</div>';
      groups[type].forEach(function(m) {
        html += '<div class="meal-item">' +
          '<div class="meal-info">' +
            '<div class="meal-name">' + escapeHtml(m.description) + '</div>' +
            '<div class="meal-meta">Б: ' + (m.protein || 0) + ' Ж: ' + (m.fat || 0) + ' У: ' + (m.carbs || 0) + '</div>' +
          '</div>' +
          '<div class="meal-cals">' + Math.round(m.calories) + '</div>' +
          '<button class="meal-delete" data-id="' + m.id + '">&times;</button>' +
        '</div>';
      });
    });

    listEl.innerHTML = html;
  }

  function deleteMeal(id) {
    api.deleteMeal(id).then(function() {
      haptic('success');
      loadMeals();
    }).catch(function() {
      showToast('Не удалось удалить', 'error');
    });
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return { init: init, show: show };
})();
