// Логика вкладки «Дневник».

var diaryTab = (function() {
  var currentDate = todayStr();
  var currentGoal = 2000;
  var mealsById = {};
  var draggedMealId = null;

  function init() {
    // Навигация по датам и удаление записей из дневника.
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

    document.getElementById('btn-diary-favorites').addEventListener('click', function() {
      openFavoritesMode();
      haptic('light');
    });

    document.getElementById('btn-close-diary-favorites').addEventListener('click', function() {
      closeFavoritesMode();
      haptic('light');
    });

    document.getElementById('diary-favorites-list').addEventListener('click', function(e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var id = btn.dataset.id;
      if (!id) return;

      if (btn.classList.contains('favorite-add')) {
        addFavoriteToDiary(id);
      } else if (btn.classList.contains('favorite-delete')) {
        deleteFavorite(id);
      }
    });

    document.getElementById('diary-list').addEventListener('click', function(e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var id = btn.dataset.id;
      if (!id) return;

      if (btn.classList.contains('meal-delete')) {
        deleteMeal(parseInt(id, 10));
      } else if (btn.classList.contains('meal-repeat')) {
        repeatMeal(parseInt(id, 10));
      } else if (btn.classList.contains('meal-favorite')) {
        favoriteMeal(parseInt(id, 10));
      }
    });

    document.getElementById('diary-list').addEventListener('dragstart', function(e) {
      var item = e.target.closest('.meal-item');
      if (!item) return;
      draggedMealId = item.dataset.id;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedMealId);
    });

    document.getElementById('diary-list').addEventListener('dragend', function(e) {
      var item = e.target.closest('.meal-item');
      if (item) item.classList.remove('dragging');
      draggedMealId = null;
      clearDropTargets();
    });

    document.getElementById('diary-list').addEventListener('dragover', function(e) {
      var group = e.target.closest('.meal-drop-zone');
      if (!group) return;
      e.preventDefault();
      group.classList.add('drag-over');
    });

    document.getElementById('diary-list').addEventListener('dragleave', function(e) {
      var group = e.target.closest('.meal-drop-zone');
      if (!group || group.contains(e.relatedTarget)) return;
      group.classList.remove('drag-over');
    });

    document.getElementById('diary-list').addEventListener('drop', function(e) {
      var group = e.target.closest('.meal-drop-zone');
      if (!group) return;
      e.preventDefault();
      var id = e.dataTransfer.getData('text/plain') || draggedMealId;
      moveMealToType(parseInt(id, 10), group.dataset.type);
      clearDropTargets();
    });

    document.getElementById('diary-list').addEventListener('pointerdown', function(e) {
      var item = e.target.closest('.meal-item');
      if (!item || e.target.closest('button') || e.pointerType === 'mouse') return;
      draggedMealId = item.dataset.id;
      item.setPointerCapture && item.setPointerCapture(e.pointerId);
      item.classList.add('dragging');
    });

    document.getElementById('diary-list').addEventListener('pointerup', function(e) {
      if (!draggedMealId || e.pointerType === 'mouse') return;
      var item = e.target.closest('.meal-item');
      if (item) item.classList.remove('dragging');
      var target = document.elementFromPoint(e.clientX, e.clientY);
      var group = target && target.closest ? target.closest('.meal-drop-zone') : null;
      if (group) moveMealToType(parseInt(draggedMealId, 10), group.dataset.type);
      draggedMealId = null;
      clearDropTargets();
    });

  }

  function show() {
    // При открытии вкладки показываем сегодняшний день.
    currentDate = todayStr();
    render();
  }

  function render() {
    closeFavoritesMode();
    updateDateDisplay();
    loadMeals();
  }

  function openFavoritesMode() {
    document.getElementById('tab-diary').classList.add('favorites-mode');
    document.getElementById('diary-favorites-panel').classList.remove('hidden');
    loadFavorites();
  }

  function closeFavoritesMode() {
    document.getElementById('tab-diary').classList.remove('favorites-mode');
    document.getElementById('diary-favorites-panel').classList.add('hidden');
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
    // Данные дневника и цель калорий загружаются параллельно.
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

  function loadFavorites() {
    api.getFavorites().then(function(res) {
      renderFavorites(res.data.favorites || []);
    }).catch(function() {
      showToast('Не удалось загрузить любимые блюда', 'error');
    });
  }

  function renderFavorites(favorites) {
    var listEl = document.getElementById('diary-favorites-list');
    var emptyEl = document.getElementById('diary-favorites-empty');

    if (!favorites.length) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    listEl.innerHTML = favorites.map(function(item) {
      return '<div class="favorite-row">' +
        '<div class="meal-info">' +
          '<div class="meal-name favorite-meal-name">' + escapeHtml(capitalizeFirst(item.name)) + '</div>' +
          '<div class="meal-meta">' + Math.round(item.calories || 0) + ' ккал · Б: ' + (item.protein || 0) + ' Ж: ' + (item.fat || 0) + ' У: ' + (item.carbs || 0) + '</div>' +
          renderItemsDetails(item.items_json) +
          renderRecipeStepsDetails(item.recipe_steps_json) +
        '</div>' +
        '<div class="favorite-actions">' +
          '<button class="btn btn-primary btn-small favorite-add" data-id="' + item.id + '">В дневник</button>' +
          '<button class="btn btn-secondary btn-small favorite-delete" data-id="' + item.id + '">Удалить</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderMeals(meals, totals) {
    // Пустое состояние и дневные итоги.
    var listEl = document.getElementById('diary-list');
    var emptyEl = document.getElementById('diary-empty');
    var totalsEl = document.getElementById('diary-totals');
    var safeTotals = normalizeTotals(totals);

    // Прогресс дня показывается всегда, даже если блюд еще нет.
    totalsEl.classList.remove('hidden');
    renderDiaryTotals(safeTotals);

    if (!meals || meals.length === 0) {
      mealsById = {};
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');

    // Группировка записей по типам приема пищи.
    var groups = { breakfast: [], lunch: [], dinner: [], snack: [] };
    mealsById = {};
    meals.forEach(function(m) {
      mealsById[m.id] = m;
      var type = groups[m.meal_type] ? m.meal_type : 'snack';
      groups[type].push(m);
    });

    var html = '';
    var order = ['breakfast', 'lunch', 'dinner', 'snack'];
    order.forEach(function(type) {
      html += '<div class="meal-drop-zone" data-type="' + type + '">' +
        '<div class="meal-group-header">' + MEAL_ICONS[type] + ' ' + MEAL_LABELS[type] + '</div>';
      if (groups[type].length === 0) {
        html += '<div class="meal-drop-empty">Перетащите блюдо сюда</div>';
      }
      groups[type].forEach(function(m) {
        html += '<div class="meal-item" draggable="true" data-id="' + m.id + '">' +
          '<div class="meal-info">' +
            '<div class="meal-name">' + escapeHtml(m.description) + '</div>' +
            '<div class="meal-meta">Б: ' + (m.protein || 0) + ' Ж: ' + (m.fat || 0) + ' У: ' + (m.carbs || 0) + '</div>' +
            renderItemsDetails(m.items_json) +
          '</div>' +
          '<div class="meal-cals">' + Math.round(m.calories) + '</div>' +
          '<div class="meal-actions">' +
            '<button class="meal-icon-btn meal-repeat" data-id="' + m.id + '" title="Повторить" aria-label="Повторить">↻</button>' +
            '<button class="meal-icon-btn meal-favorite" data-id="' + m.id + '" title="В избранное" aria-label="В избранное">★</button>' +
            '<button class="meal-icon-btn meal-delete" data-id="' + m.id + '" title="Удалить" aria-label="Удалить">&times;</button>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    });

    listEl.innerHTML = html;
  }

  function normalizeTotals(totals) {
    totals = totals || {};
    return {
      calories: Number(totals.calories) || 0,
      protein: Number(totals.protein) || 0,
      fat: Number(totals.fat) || 0,
      carbs: Number(totals.carbs) || 0
    };
  }

  function renderDiaryTotals(totals) {
    // Отображение суммарных калорий и прогресса к цели.
    document.getElementById('diary-total-cals').textContent = Math.round(totals.calories) + ' ккал';
    document.getElementById('diary-total-goal').textContent = 'из ' + currentGoal + ' ккал';

    var rawPct = currentGoal ? Math.round(totals.calories / currentGoal * 100) : 0;
    var pct = Math.min(100, Math.max(0, rawPct));
    var progressEl = document.getElementById('diary-progress');
    progressEl.style.width = pct + '%';
    progressEl.className = 'progress-fill' + (rawPct > 100 ? ' over' : '');
    renderMacroProgress(totals);
  }

  function renderMacroProgress(totals) {
    var macroEl = document.getElementById('diary-macro-progress');
    var goals = getMacroGoals();
    var items = [
      { key: 'protein', label: 'Белки', value: Number(totals.protein) || 0, goal: goals.protein },
      { key: 'fat', label: 'Жиры', value: Number(totals.fat) || 0, goal: goals.fat },
      { key: 'carbs', label: 'Углеводы', value: Number(totals.carbs) || 0, goal: goals.carbs }
    ];

    macroEl.innerHTML = items.map(function(item) {
      var pct = item.goal ? Math.min(100, item.value / item.goal * 100) : 0;
      return '<div class="diary-macro-item diary-macro-' + item.key + '">' +
        '<div class="diary-macro-top">' +
          '<span>' + item.label + '</span>' +
          '<strong>' + Math.round(item.value) + '<small> / ' + item.goal + ' г</small></strong>' +
        '</div>' +
        '<div class="diary-macro-bar"><span style="width:' + pct + '%"></span></div>' +
      '</div>';
    }).join('');
  }

  function getMacroGoals() {
    return {
      protein: Math.max(1, Math.round(currentGoal * 0.3 / 4)),
      fat: Math.max(1, Math.round(currentGoal * 0.3 / 9)),
      carbs: Math.max(1, Math.round(currentGoal * 0.4 / 4))
    };
  }

  function buildMealPayload(meal, date) {
    // Повтор и избранное используют ту же структуру, что и сохранение результата анализа.
    return {
      date: date || currentDate,
      meal_type: meal.meal_type || 'snack',
      description: meal.description || meal.name,
      calories: Number(meal.calories) || 0,
      protein: Number(meal.protein) || 0,
      fat: Number(meal.fat) || 0,
      carbs: Number(meal.carbs) || 0,
      portion_grams: Number(meal.portion_grams) || null,
      items: parseItems(meal.items_json),
      source: 'manual'
    };
  }

  function repeatMeal(id) {
    var meal = mealsById[id];
    if (!meal) return;

    api.saveMeal(buildMealPayload(meal, todayStr())).then(function() {
      showToast('Блюдо повторено на сегодня');
      haptic('success');
      currentDate = todayStr();
      render();
    }).catch(function() {
      showToast('Не удалось повторить блюдо', 'error');
    });
  }

  function favoriteMeal(id) {
    var meal = mealsById[id];
    if (!meal) return;

    api.addFavorite(buildMealPayload(meal, currentDate)).then(function(res) {
      showToast(res.already_exists ? 'Блюдо уже есть в избранном' : 'Добавлено в избранное');
      haptic('success');
      loadMeals();
    }).catch(function(err) {
      showToast(err.message || 'Не удалось добавить в избранное', 'error');
    });
  }

  function deleteMeal(id) {
    api.deleteMeal(id).then(function() {
      haptic('success');
      loadMeals();
    }).catch(function() {
      showToast('Не удалось удалить', 'error');
    });
  }

  function addFavoriteToDiary(id) {
    api.addFavoriteToDiary(id, { date: currentDate }).then(function() {
      showToast('Добавлено в дневник');
      haptic('success');
      closeFavoritesMode();
      loadMeals();
      if (currentDate === todayStr()) todayTab.refresh();
    }).catch(function() {
      showToast('Не удалось добавить блюдо', 'error');
    });
  }

  function deleteFavorite(id) {
    api.deleteFavorite(id).then(function() {
      showToast('Удалено из избранного');
      haptic('success');
      loadFavorites();
    }).catch(function() {
      showToast('Не удалось удалить из избранного', 'error');
    });
  }

  function moveMealToType(id, mealType) {
    var meal = mealsById[id];
    if (!meal || !mealType || meal.meal_type === mealType) return;

    api.updateMeal(id, { meal_type: mealType }).then(function() {
      showToast('Блюдо перенесено в ' + MEAL_LABELS[mealType].toLowerCase());
      haptic('success');
      loadMeals();
    }).catch(function() {
      showToast('Не удалось перенести блюдо', 'error');
    });
  }

  function clearDropTargets() {
    document.querySelectorAll('.meal-drop-zone.drag-over').forEach(function(el) {
      el.classList.remove('drag-over');
    });
  }

  function escapeHtml(text) {
    // Экранируем пользовательские данные перед вставкой через innerHTML.
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function capitalizeFirst(text) {
    var value = String(text || '').trim();
    if (!value) return '';
    return value.charAt(0).toLocaleUpperCase('ru-RU') + value.slice(1);
  }

  function renderItemsDetails(itemsJson) {
    var items = parseItems(itemsJson);
    if (!items.length) return '';

    var html = '<details class="meal-items-details"><summary>Состав (' + items.length + ')</summary>';
    items.forEach(function(item) {
      html += '<div class="item-row">' +
        '<span>' + escapeHtml(item.name) + '</span>' +
        '<span>' + Math.round(item.calories || 0) + ' ккал</span>' +
      '</div>';
    });
    html += '</details>';
    return html;
  }

  function renderRecipeStepsDetails(stepsJson) {
    var steps = parseArrayJson(stepsJson);
    if (!steps.length) return '';

    var html = '<details class="meal-items-details recipe-steps-details"><summary>Шаги рецепта (' + steps.length + ')</summary>';
    steps.forEach(function(step, index) {
      html += '<div class="item-row">' +
        '<span>' + (index + 1) + '. ' + escapeHtml(step) + '</span>' +
      '</div>';
    });
    html += '</details>';
    return html;
  }

  function parseItems(itemsJson) {
    return parseArrayJson(itemsJson);
  }

  function parseArrayJson(itemsJson) {
    if (!itemsJson) return [];
    try {
      var items = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
      return Array.isArray(items) ? items : [];
    } catch (err) {
      return [];
    }
  }

  return { init: init, show: show };
})();
