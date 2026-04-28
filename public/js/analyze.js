// Логика экранов «Сегодня», «Рецепты» и «Покупки».

var todayTab = (function() {
  // Состояние текущего сценария "Сегодня": источник ввода, результат AI и выбранный прием пищи.
  var currentResult = null;
  var currentPhotoBlob = null;
  var currentPhotoMode = 'food';
  var selectedMealType = 'lunch';
  var manualMealType = 'lunch';
  var inputSource = null;
  var recognition = null;
  var isListening = false;
  var resultScaleBase = null;
  var isSyncingResultFields = false;

  // Регистрируем все обработчики вкладки один раз при старте приложения.
  function init() {
    document.getElementById('btn-photo').addEventListener('click', function() {
      currentPhotoMode = 'food';
      if (recipesTab.cancelPhotoFlow) recipesTab.cancelPhotoFlow();
      document.getElementById('file-input').click();
    });

    document.getElementById('btn-pantry-photo').addEventListener('click', function() {
      if (window.switchAppTab) window.switchAppTab('tab-recipes');
      recipesTab.startPhotoFlow();
    });

    document.getElementById('btn-text-mode').addEventListener('click', showTextInput);
    document.getElementById('btn-manual-mode').addEventListener('click', showManualInput);
    document.getElementById('btn-cancel-text').addEventListener('click', resetToDashboard);
    document.getElementById('btn-cancel-photo').addEventListener('click', resetToDashboard);
    document.getElementById('btn-cancel-manual').addEventListener('click', resetToDashboard);
    document.getElementById('btn-remove-photo').addEventListener('click', resetToDashboard);
    document.getElementById('btn-retry').addEventListener('click', resetToDashboard);
    document.getElementById('btn-save-meal').addEventListener('click', saveAnalyzedMeal);
    document.getElementById('btn-favorite-result').addEventListener('click', saveCurrentResultAsFavorite);
    document.getElementById('btn-save-manual').addEventListener('click', saveManualMeal);
    document.getElementById('btn-voice-description').addEventListener('click', toggleVoiceInput);
    initResultAutoScale();

    document.getElementById('file-input').addEventListener('change', function(e) {
      if (e.target.files && e.target.files[0]) {
        handlePhotoSelected(e.target.files[0]);
      }
    });

    document.getElementById('btn-analyze-photo').addEventListener('click', function() {
      if (currentPhotoBlob) doPhotoAnalysis(currentPhotoBlob);
    });

    document.getElementById('btn-analyze-text').addEventListener('click', function() {
      var desc = document.getElementById('food-description').value.trim();
      if (desc) doTextAnalysis(desc);
    });

    document.getElementById('meal-type-selector').addEventListener('click', function(e) {
      var btn = e.target.closest('.meal-type-btn');
      if (!btn) return;
      selectedMealType = btn.dataset.type;
      setActiveMealType('meal-type-selector', selectedMealType);
      haptic('light');
    });

    document.getElementById('manual-meal-type-selector').addEventListener('click', function(e) {
      var btn = e.target.closest('.meal-type-btn');
      if (!btn) return;
      manualMealType = btn.dataset.type;
      setActiveMealType('manual-meal-type-selector', manualMealType);
      haptic('light');
    });

    autoSelectMealTypes();
    initVoiceInput();
    loadTodayStats();
  }

  function show() {
    loadTodayStats();
  }

  // Текстовый сценарий скрывает остальные панели и сразу ставит фокус в описание блюда.
  function showTextInput() {
    hideAllTodayPanels();
    document.getElementById('text-input-area').classList.remove('hidden');
    document.getElementById('food-description').focus();
  }

  // Ручное добавление используется без AI и сразу сохраняет введенные КБЖУ.
  function showManualInput() {
    hideAllTodayPanels();
    document.getElementById('manual-meal-area').classList.remove('hidden');
  }

  // Все экраны вкладки взаимоисключающие, поэтому перед показом нужной панели скрываем остальные.
  function hideAllTodayPanels() {
    document.getElementById('today-dashboard').classList.add('hidden');
    document.getElementById('text-input-area').classList.add('hidden');
    document.getElementById('photo-preview-area').classList.add('hidden');
    document.getElementById('manual-meal-area').classList.add('hidden');
    document.getElementById('analyze-loading').classList.add('hidden');
    document.getElementById('analyze-result').classList.add('hidden');
  }

  // Полный сброс нужен после отмены, ошибки анализа или успешного сохранения.
  function resetToDashboard() {
    currentResult = null;
    currentPhotoBlob = null;
    currentPhotoMode = 'food';
    inputSource = null;
    resultScaleBase = null;
    document.getElementById('file-input').value = '';
    document.getElementById('food-description').value = '';
    document.getElementById('photo-note').value = '';
    document.getElementById('photo-note').classList.remove('hidden');
    document.getElementById('photo-preview-img').src = '';
    clearManualForm();
    setFavoriteResultState(false);
    if (recognition && isListening) recognition.stop();
    hideAllTodayPanels();
    document.getElementById('today-dashboard').classList.remove('hidden');
    autoSelectMealTypes();
  }

  // Один file-input используется и для еды, и для фото продуктов; направление определяет recipesTab.
  function handlePhotoSelected(file) {
    compressImage(file, 1024, 0.7).then(function(blob) {
      if (recipesTab.isWaitingForPhoto()) {
        document.getElementById('file-input').value = '';
        recipesTab.analyzePhoto(blob);
        return;
      }

      currentPhotoBlob = blob;
      hideAllTodayPanels();
      document.getElementById('photo-preview-img').src = URL.createObjectURL(blob);
      document.getElementById('photo-note').value = '';
      document.getElementById('photo-preview-area').classList.remove('hidden');
      document.getElementById('btn-analyze-photo').textContent = 'Анализировать';
      document.getElementById('photo-note').classList.remove('hidden');
    });
  }

  // Общий экран ожидания для фото и текста.
  function showLoading(text) {
    hideAllTodayPanels();
    document.getElementById('analyze-loading-text').textContent = text || 'Анализируем...';
    document.getElementById('analyze-loading').classList.remove('hidden');
  }

  // Фото еды отправляется вместе с необязательной заметкой о составе/граммовке.
  function doPhotoAnalysis(blob) {
    inputSource = 'photo';
    showLoading('Анализируем фото еды...');
    var note = document.getElementById('photo-note').value.trim();

    api.analyzePhoto(blob, note).then(function(res) {
      if (res.success) {
        currentResult = res.data;
        displayResult(res.data);
        haptic('success');
      } else {
        showToast(res.message || 'Не удалось распознать еду', 'error');
        resetToDashboard();
      }
    }).catch(function(err) {
      showToast(err.message || 'Ошибка анализа', 'error');
      resetToDashboard();
    });
  }

  // Текстовый анализ использует тот же экран результата, что и фото.
  function doTextAnalysis(description) {
    inputSource = 'text';
    showLoading('Анализируем описание...');

    api.analyzeText(description).then(function(res) {
      if (res.success) {
        currentResult = res.data;
        displayResult(res.data);
        haptic('success');
      } else {
        showToast(res.message || 'Не удалось проанализировать', 'error');
        resetToDashboard();
      }
    }).catch(function(err) {
      showToast(err.message || 'Ошибка анализа', 'error');
      resetToDashboard();
    });
  }

  // Результат AI сразу становится редактируемой формой перед сохранением в дневник.
  function displayResult(data) {
    setFavoriteResultState(false);
    document.getElementById('result-dish-name-input').value = data.dish_name || '';
    document.getElementById('result-calories-input').value = data.calories || 0;
    document.getElementById('result-protein-input').value = data.protein || 0;
    document.getElementById('result-fat-input').value = data.fat || 0;
    document.getElementById('result-carbs-input').value = data.carbs || 0;
    document.getElementById('result-portion-input').value = data.portion_grams || '';
    resultScaleBase = captureResultScaleBase();

    var conf = document.getElementById('result-confidence');
    conf.textContent = data.confidence === 'high' ? 'Высокая точность' :
                       data.confidence === 'medium' ? 'Средняя точность' : 'Нужно уточнить';
    conf.className = 'confidence-badge confidence-' + (data.confidence || 'medium');

    var itemsEl = document.getElementById('result-items');
    if (data.items && data.items.length > 1) {
      var html = '<details><summary>Состав блюда (' + data.items.length + ')</summary>';
      data.items.forEach(function(item) {
        html += '<div class="item-row"><span>' + escapeHtml(item.name) + '</span><span>' + (item.calories || 0) + ' ккал</span></div>';
      });
      html += '</details>';
      itemsEl.innerHTML = html;
      itemsEl.classList.remove('hidden');
    } else {
      itemsEl.classList.add('hidden');
    }

    hideAllTodayPanels();
    document.getElementById('analyze-result').classList.remove('hidden');
  }

  // Сохраняем уже отредактированные пользователем значения, а не исходный ответ AI.
  function saveAnalyzedMeal() {
    if (!currentResult) return;
    var edited = readEditedResult();
    if (!edited) return;

    var btn = document.getElementById('btn-save-meal');
    btn.disabled = true;

    api.saveMeal({
      date: todayStr(),
      meal_type: selectedMealType,
      description: edited.dish_name,
      calories: edited.calories,
      protein: edited.protein,
      fat: edited.fat,
      carbs: edited.carbs,
      portion_grams: edited.portion_grams,
      items: currentResult.items || [],
      source: inputSource || 'text'
    }).then(function() {
      showToast('Сохранено в дневник');
      haptic('success');
      resetToDashboard();
      loadTodayStats();
    }).catch(function(err) {
      showToast(err.message || 'Ошибка сохранения', 'error');
    }).finally(function() {
      btn.disabled = false;
    });
  }

  // Избранное получает текущую ручную правку результата и состав блюда.
  function saveCurrentResultAsFavorite() {
    var btn = document.getElementById('btn-favorite-result');
    if (btn.dataset.added === 'true') {
      showToast('Блюдо уже в избранном');
      return;
    }

    var edited = readEditedResult();
    if (!edited) return;

    btn.disabled = true;
    btn.textContent = 'Добавляем...';

    api.addFavorite({
      name: edited.dish_name,
      calories: edited.calories,
      protein: edited.protein,
      fat: edited.fat,
      carbs: edited.carbs,
      portion_grams: edited.portion_grams,
      items: currentResult && currentResult.items ? currentResult.items : [],
      meal_type: selectedMealType
    }).then(function(res) {
      setFavoriteResultState(true);
      showToast(res.already_exists ? 'Блюдо уже есть в избранном' : 'Добавлено в избранное');
      haptic('success');
    }).catch(function(err) {
      setFavoriteResultState(false);
      showToast(err.message || 'Не удалось добавить в избранное', 'error');
    }).finally(function() {
      btn.disabled = false;
    });
  }

  // Кнопка избранного визуально показывает, добавлено ли текущее блюдо.
  function setFavoriteResultState(isAdded) {
    var btn = document.getElementById('btn-favorite-result');
    if (!btn) return;
    btn.dataset.added = isAdded ? 'true' : 'false';
    btn.classList.toggle('is-added', isAdded);
    btn.textContent = isAdded ? '★ В избранном' : '☆ В избранное';
    btn.setAttribute('aria-pressed', isAdded ? 'true' : 'false');
  }

  // Калории и граммовка могут пропорционально пересчитать БЖУ.
  function initResultAutoScale() {
    document.getElementById('result-calories-input').addEventListener('change', scaleResultByCalories);
    document.getElementById('result-portion-input').addEventListener('change', scaleResultByPortion);

    ['result-protein-input', 'result-fat-input', 'result-carbs-input'].forEach(function(id) {
      document.getElementById(id).addEventListener('change', syncResultScaleBase);
    });
  }

  // Базовые значения нужны, чтобы пересчет шел от исходной точки, а не накапливал ошибки округления.
  function captureResultScaleBase() {
    return {
      calories: parseNumberValue(document.getElementById('result-calories-input').value),
      portion: parseNumberValue(document.getElementById('result-portion-input').value),
      protein: parseNumberValue(document.getElementById('result-protein-input').value) || 0,
      fat: parseNumberValue(document.getElementById('result-fat-input').value) || 0,
      carbs: parseNumberValue(document.getElementById('result-carbs-input').value) || 0
    };
  }

  function scaleResultByCalories() {
    if (isSyncingResultFields) return;
    if (!resultScaleBase) resultScaleBase = captureResultScaleBase();

    var nextCalories = parseNumberValue(document.getElementById('result-calories-input').value);
    if (nextCalories === null || !resultScaleBase.calories) {
      syncResultScaleBase();
      return;
    }

    applyResultScale(nextCalories / resultScaleBase.calories, false);
    resultScaleBase.calories = nextCalories;
  }

  function scaleResultByPortion() {
    if (isSyncingResultFields) return;
    if (!resultScaleBase) resultScaleBase = captureResultScaleBase();

    var nextPortion = parseNumberValue(document.getElementById('result-portion-input').value);
    if (nextPortion === null || !resultScaleBase.portion) {
      syncResultScaleBase();
      return;
    }

    applyResultScale(nextPortion / resultScaleBase.portion, true);
    resultScaleBase.portion = nextPortion;
  }

  // При изменении калорий меняем БЖУ, а при изменении БЖУ не трогаем калории и граммы.
  function applyResultScale(factor, includeCalories) {
    if (!Number.isFinite(factor) || factor < 0) return;

    isSyncingResultFields = true;
    var nextProtein = roundMacro(resultScaleBase.protein * factor);
    var nextFat = roundMacro(resultScaleBase.fat * factor);
    var nextCarbs = roundMacro(resultScaleBase.carbs * factor);

    document.getElementById('result-protein-input').value = nextProtein;
    document.getElementById('result-fat-input').value = nextFat;
    document.getElementById('result-carbs-input').value = nextCarbs;

    resultScaleBase.protein = nextProtein;
    resultScaleBase.fat = nextFat;
    resultScaleBase.carbs = nextCarbs;

    if (includeCalories) {
      var nextCalories = Math.round((resultScaleBase.calories || 0) * factor);
      document.getElementById('result-calories-input').value = nextCalories;
      resultScaleBase.calories = nextCalories;
    }

    isSyncingResultFields = false;
  }

  // Ручная правка БЖУ обновляет базу пересчета.
  function syncResultScaleBase() {
    if (isSyncingResultFields) return;
    resultScaleBase = captureResultScaleBase();
  }

  // Ручное блюдо минует AI, но сохраняется тем же endpoint дневника.
  function saveManualMeal() {
    var name = document.getElementById('manual-name').value.trim();
    var calories = parseNumberValue(document.getElementById('manual-calories').value);
    if (!name || calories === null) {
      showToast('Укажите название и калории', 'error');
      return;
    }

    api.saveMeal({
      date: todayStr(),
      meal_type: manualMealType,
      description: name,
      calories: Math.round(calories),
      protein: parseNumberValue(document.getElementById('manual-protein').value) || 0,
      fat: parseNumberValue(document.getElementById('manual-fat').value) || 0,
      carbs: parseNumberValue(document.getElementById('manual-carbs').value) || 0,
      portion_grams: parseNumberValue(document.getElementById('manual-portion').value),
      source: 'manual'
    }).then(function() {
      showToast('Добавлено в дневник');
      haptic('success');
      resetToDashboard();
      loadTodayStats();
    }).catch(function(err) {
      showToast(err.message || 'Не удалось сохранить', 'error');
    });
  }

  // Главный экран "Сегодня" берет дневной прогресс из общей статистики.
  function loadTodayStats() {
    Promise.all([
      api.getStats('day', todayStr()),
      api.getGoals()
    ]).then(function(results) {
      var data = results[0].data;
      var totals = data.totals || {};
      var goal = data.goal || results[1].data.daily_calories || 2000;
      var calories = Math.round(totals.calories || 0);
      var remaining = Math.max(0, goal - calories);

      document.getElementById('today-cals').textContent = calories;
      document.getElementById('today-label').textContent = 'из ' + goal + ' ккал';
      document.getElementById('today-hint').textContent =
        (calories >= goal ? 'Цель достигнута' : 'Осталось ' + remaining + ' ккал') + ' · ' + (data.hint || '');
      document.getElementById('today-protein').textContent = Math.round(totals.protein || 0) + ' г';
      document.getElementById('today-fat').textContent = Math.round(totals.fat || 0) + ' г';
      document.getElementById('today-carbs').textContent = Math.round(totals.carbs || 0) + ' г';

      var pct = Math.min(1, calories / goal);
      var circumference = 2 * Math.PI * 70;
      var ring = document.getElementById('today-ring-progress');
      ring.style.strokeDashoffset = circumference * (1 - pct);
      ring.style.stroke = calories > goal ? 'var(--danger)' : 'var(--link)';
    }).catch(function() {
      showToast('Не удалось загрузить день', 'error');
    });
  }

  // Собираем редактируемую форму результата и валидируем название блюда.
  function readEditedResult() {
    var dishName = document.getElementById('result-dish-name-input').value.trim();
    var calories = parseNumberValue(document.getElementById('result-calories-input').value);
    var protein = parseNumberValue(document.getElementById('result-protein-input').value);
    var fat = parseNumberValue(document.getElementById('result-fat-input').value);
    var carbs = parseNumberValue(document.getElementById('result-carbs-input').value);
    var portion = parseNumberValue(document.getElementById('result-portion-input').value);

    if (!dishName || calories === null || protein === null || fat === null || carbs === null) {
      showToast('Проверьте название, калории и БЖУ', 'error');
      return null;
    }

    return {
      dish_name: dishName,
      calories: Math.round(calories),
      protein: roundMacro(protein),
      fat: roundMacro(fat),
      carbs: roundMacro(carbs),
      portion_grams: portion === null ? null : Math.round(portion)
    };
  }

  // Голосовой ввод использует Web Speech API, если он доступен в браузере Telegram.
  function initVoiceInput() {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    var btnVoice = document.getElementById('btn-voice-description');
    if (!SpeechRecognition || !btnVoice) return;

    recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = function() {
      isListening = true;
      btnVoice.classList.add('listening');
      document.getElementById('voice-status').classList.remove('hidden');
      document.getElementById('voice-meter').classList.remove('hidden');
      haptic('light');
    };

    recognition.onend = function() {
      isListening = false;
      btnVoice.classList.remove('listening');
      document.getElementById('voice-status').classList.add('hidden');
      document.getElementById('voice-meter').classList.add('hidden');
    };

    recognition.onerror = function() {
      showToast('Не удалось распознать голос', 'error');
    };

    recognition.onresult = function(event) {
      var finalText = '';
      var interimText = '';
      for (var i = event.resultIndex; i < event.results.length; i++) {
        var transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else interimText += transcript;
      }

      var input = document.getElementById('food-description');
      if (finalText) {
        var existing = input.value.trim();
        input.value = (existing ? existing + ' ' : '') + finalText.trim();
      } else if (interimText) {
        document.getElementById('voice-status').textContent = interimText.trim();
      }
    };

    btnVoice.classList.remove('hidden');
  }

  function toggleVoiceInput() {
    if (!recognition) {
      showToast('Голосовой ввод не поддерживается', 'error');
      return;
    }

    try {
      if (isListening) recognition.stop();
      else {
        document.getElementById('voice-status').textContent = 'Слушаю...';
        recognition.start();
      }
    } catch (err) {
      showToast('Не удалось включить микрофон', 'error');
    }
  }

  // При открытии приложения выбираем примерный прием пищи по локальному времени.
  function autoSelectMealTypes() {
    var h = new Date().getHours();
    var type = h >= 6 && h < 11 ? 'breakfast' : h >= 11 && h < 15 ? 'lunch' : h >= 15 && h < 20 ? 'dinner' : 'snack';
    selectedMealType = type;
    manualMealType = type;
    setActiveMealType('meal-type-selector', selectedMealType);
    setActiveMealType('manual-meal-type-selector', manualMealType);
  }

  function setActiveMealType(containerId, type) {
    document.querySelectorAll('#' + containerId + ' .meal-type-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
  }

  function clearManualForm() {
    ['manual-name', 'manual-calories', 'manual-protein', 'manual-fat', 'manual-carbs', 'manual-portion'].forEach(function(id) {
      document.getElementById(id).value = '';
    });
  }

  function parseNumberValue(raw) {
    if (String(raw || '').trim() === '') return null;
    var value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function roundMacro(value) {
    return Math.round(value * 10) / 10;
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  return { init: init, show: show, refresh: loadTodayStats };
})();

var recipesTab = (function() {
  // Скрытая в текущей версии вкладка хранит сценарии продуктов, inventory и рецептов.
  var currentPantrySession = null;
  var currentPantryItems = [];
  var currentInventoryItems = [];
  var currentRecipes = [];
  var waitingForPhoto = false;

  // Подключаем обработчики списков через делегирование, потому что строки рендерятся динамически.
  function init() {
    document.getElementById('btn-open-inventory').addEventListener('click', openInventoryPanel);
    document.getElementById('btn-close-inventory').addEventListener('click', closeInventoryPanel);
    document.getElementById('btn-recipes-photo').addEventListener('click', startPhotoFlow);
    document.getElementById('btn-pantry-retry').addEventListener('click', resetRecipes);
    document.getElementById('btn-confirm-pantry').addEventListener('click', confirmPantryToInventory);
    document.getElementById('btn-add-inventory-item').addEventListener('click', addInventoryItem);
    document.getElementById('btn-add-pantry-item').addEventListener('click', addPantryItem);
    document.getElementById('btn-generate-recipes').addEventListener('click', generateRecipes);

    document.getElementById('inventory-list').addEventListener('change', function(e) {
      var row = e.target.closest('.inventory-row');
      if (row) updateInventoryItem(row);
    });

    document.getElementById('inventory-list').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-inventory-action]');
      if (!btn) return;
      handleInventoryAction(btn.dataset.inventoryAction, parseInt(btn.dataset.id, 10));
    });

    document.getElementById('pantry-items-list').addEventListener('change', function(e) {
      var row = e.target.closest('.pantry-row');
      if (row) updatePantryItem(row);
    });

    document.getElementById('pantry-items-list').addEventListener('click', function(e) {
      var btn = e.target.closest('.pantry-delete');
      if (btn) deletePantryItem(btn.dataset.id);
    });

    document.getElementById('recipes-list').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-recipe-action]');
      if (btn) handleRecipeAction(btn.dataset.recipeAction, parseInt(btn.dataset.id, 10));
    });

  }

  function show() {
    loadInventory();
  }

  // Панель "Мои продукты" открывается поверх основного сценария рецептов.
  function openInventoryPanel() {
    document.getElementById('recipes-start').classList.add('hidden');
    document.getElementById('recipes-area').classList.add('hidden');
    document.getElementById('inventory-panel').classList.remove('hidden');
    loadInventory();
    haptic('light');
  }

  function closeInventoryPanel() {
    document.getElementById('inventory-panel').classList.add('hidden');
    document.getElementById('recipes-start').classList.remove('hidden');
    haptic('light');
  }

  // Следующее выбранное фото будет обработано как фото продуктов, а не фото блюда.
  function startPhotoFlow() {
    waitingForPhoto = true;
    document.getElementById('file-input').click();
  }

  function cancelPhotoFlow() {
    waitingForPhoto = false;
  }

  function isWaitingForPhoto() {
    return waitingForPhoto;
  }

  // Фото продуктов создает временную pantry-сессию для подтверждения списка.
  function analyzePhoto(blob) {
    waitingForPhoto = false;
    document.getElementById('recipes-start').classList.add('hidden');
    document.getElementById('inventory-panel').classList.add('hidden');
    document.getElementById('recipes-loading-text').textContent = 'Распознаем продукты...';
    document.getElementById('recipes-loading').classList.remove('hidden');
    document.getElementById('pantry-result').classList.add('hidden');

    api.analyzePantryPhoto(blob).then(function(res) {
      currentPantrySession = res.data.session;
      currentPantryItems = res.data.items || [];
      renderPantryResult();
      haptic('success');
    }).catch(function(err) {
      showToast(err.message || 'Ошибка анализа продуктов', 'error');
      resetRecipes();
    });
  }

  // После распознавания показываем редактируемый список продуктов и кнопку переноса в остатки.
  function renderPantryResult() {
    document.getElementById('recipes-start').classList.add('hidden');
    document.getElementById('inventory-panel').classList.add('hidden');
    document.getElementById('recipes-loading').classList.add('hidden');
    document.getElementById('pantry-result').classList.remove('hidden');
    document.getElementById('recipes-area').classList.add('hidden');
    renderPantryItems();
  }

  // Inventory загружается отдельно, чтобы рецепты строились из постоянных остатков.
  function loadInventory() {
    api.getInventory().then(function(res) {
      currentInventoryItems = res.data.items || [];
      renderInventory();
    }).catch(function() {
      showToast('Не удалось загрузить продукты', 'error');
    });
  }

  // Список продуктов похож на дневник: строка + компактные действия редактирования/списания.
  function renderInventory() {
    var listEl = document.getElementById('inventory-list');
    var emptyEl = document.getElementById('inventory-empty');

    if (!currentInventoryItems.length) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    listEl.innerHTML = currentInventoryItems.map(function(item) {
      return '<div class="inventory-card" data-id="' + item.id + '">' +
        '<div class="pantry-row inventory-row" data-id="' + item.id + '">' +
          '<div class="pantry-row-icon">&#129367;</div>' +
          '<div class="pantry-row-fields">' +
            '<input class="pantry-name inventory-name" value="' + escapeHtml(item.name) + '" aria-label="Название продукта">' +
            '<div class="inventory-quantity-row">' +
              '<input class="pantry-qty inventory-value" value="' + formatQtyValue(item.quantity_value) + '" placeholder="Кол-во" aria-label="Количество">' +
              '<select class="inventory-unit" aria-label="Единица">' +
                unitOption('г', item.quantity_unit) +
                unitOption('мл', item.quantity_unit) +
                unitOption('шт', item.quantity_unit) +
                unitOption('упак', item.quantity_unit) +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="inventory-actions">' +
            '<button class="meal-icon-btn inventory-consume" data-inventory-action="consume" data-id="' + item.id + '" title="Списать" aria-label="Списать">−</button>' +
            '<button class="meal-icon-btn inventory-delete" data-inventory-action="delete" data-id="' + item.id + '" title="Удалить" aria-label="Удалить">&times;</button>' +
          '</div>' +
        '</div>' +
        '<div class="inventory-consume-panel hidden">' +
          '<label class="inventory-consume-field">' +
            '<span>Количество</span>' +
            '<input class="input inventory-consume-value" placeholder="' + escapeHtml(item.quantity_unit) + '" inputmode="decimal">' +
          '</label>' +
          '<div class="inventory-consume-buttons">' +
            '<button class="btn btn-primary btn-small" data-inventory-action="consume-confirm" data-id="' + item.id + '" type="button">Списать</button>' +
            '<button class="btn btn-secondary btn-small" data-inventory-action="consume-cancel" data-id="' + item.id + '" type="button">Отмена</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function unitOption(unit, selected) {
    return '<option value="' + unit + '"' + (unit === selected ? ' selected' : '') + '>' + unit + '</option>';
  }

  function formatQtyValue(value) {
    if (value === null || value === undefined || value === '') return '';
    return Number(value).toString().replace('.', ',');
  }

  // Pantry-строки редактируются до подтверждения, поэтому рендерятся как форма.
  function renderPantryItems() {
    var container = document.getElementById('pantry-items-list');
    if (!currentPantryItems.length) {
      container.innerHTML = '<div class="empty-inline">Продукты не найдены. Добавьте их вручную.</div>';
      return;
    }

    container.innerHTML = currentPantryItems.map(function(item) {
      var qty = parseClientQuantity(item.quantity_text);
      return '<div class="pantry-row" data-id="' + item.id + '">' +
        '<div class="pantry-row-icon">&#129367;</div>' +
        '<div class="pantry-row-fields">' +
          '<input class="pantry-name" value="' + escapeHtml(item.name) + '" aria-label="Название продукта">' +
          '<div class="pantry-quantity-row">' +
            '<input class="pantry-qty" value="' + escapeHtml(qty.value) + '" placeholder="Количество" aria-label="Количество">' +
            '<select class="pantry-unit" aria-label="Единица измерения">' +
              unitOption('г', qty.unit) +
              unitOption('мл', qty.unit) +
              unitOption('шт', qty.unit) +
              unitOption('упак', qty.unit) +
            '</select>' +
          '</div>' +
        '</div>' +
        '<button class="meal-icon-btn pantry-delete" data-id="' + item.id + '" aria-label="Удалить">&times;</button>' +
      '</div>';
    }).join('');
  }

  // Ручное добавление продукта в pantry помогает исправить пропущенное AI.
  function addPantryItem() {
    if (!currentPantrySession) return;
    var nameInput = document.getElementById('pantry-item-name');
    var qtyInput = document.getElementById('pantry-item-qty');
    var unitInput = document.getElementById('pantry-item-unit');
    var name = nameInput.value.trim();
    if (!name) {
      showToast('Введите продукт', 'error');
      return;
    }

    api.addPantryItem(currentPantrySession.id, {
      name: name,
      quantity_text: buildQuantityText(qtyInput.value.trim(), unitInput.value),
      category: 'другое',
      confidence: 'high'
    }).then(function(res) {
      currentPantryItems.push(res.data);
      nameInput.value = '';
      qtyInput.value = '';
      unitInput.value = 'г';
      renderPantryItems();
    }).catch(function() {
      showToast('Не удалось добавить продукт', 'error');
    });
  }

  // Ручное добавление сразу попадает в постоянные остатки.
  function addInventoryItem() {
    var nameInput = document.getElementById('inventory-item-name');
    var qtyInput = document.getElementById('inventory-item-qty');
    var name = nameInput.value.trim();
    if (!name) {
      showToast('Введите продукт', 'error');
      return;
    }

    api.addInventoryItem({
      name: name,
      quantity_text: qtyInput.value.trim(),
      category: 'другое'
    }).then(function() {
      nameInput.value = '';
      qtyInput.value = '';
      loadInventory();
      haptic('success');
    }).catch(function(err) {
      showToast(err.message || 'Не удалось добавить продукт', 'error');
    });
  }

  // Редактирование остатка сохраняет имя, количество, единицу и категорию.
  function updateInventoryItem(row) {
    var id = parseInt(row.dataset.id, 10);
    var name = row.querySelector('.inventory-name').value.trim();
    var value = row.querySelector('.inventory-value').value.trim().replace(',', '.');
    var unit = row.querySelector('.inventory-unit').value;
    if (!name) return;

    api.updateInventoryItem(id, {
      name: name,
      quantity_value: value,
      quantity_unit: unit,
      category: 'другое'
    }).then(function(res) {
      currentInventoryItems = currentInventoryItems.map(function(item) {
        return item.id === id ? res.data : item;
      });
      renderInventory();
    }).catch(function(err) {
      showToast(err.message || 'Не удалось обновить продукт', 'error');
      loadInventory();
    });
  }

  // Все действия строки inventory сведены в один обработчик: изменить, списать, удалить.
  function handleInventoryAction(action, id) {
    if (action === 'delete') {
      api.deleteInventoryItem(id).then(function() {
        currentInventoryItems = currentInventoryItems.filter(function(item) { return item.id !== id; });
        renderInventory();
      }).catch(function() {
        showToast('Не удалось удалить продукт', 'error');
      });
      return;
    }

    if (action === 'consume') {
      var item = currentInventoryItems.find(function(row) { return row.id === id; });
      if (!item) return;
      var card = document.querySelector('.inventory-card[data-id="' + id + '"]');
      if (!card) return;
      var panel = card.querySelector('.inventory-consume-panel');
      var input = card.querySelector('.inventory-consume-value');
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) {
        input.value = '';
        input.focus();
      }
      return;
    }

    if (action === 'consume-cancel') {
      var cancelCard = document.querySelector('.inventory-card[data-id="' + id + '"]');
      if (cancelCard) cancelCard.querySelector('.inventory-consume-panel').classList.add('hidden');
      return;
    }

    if (action === 'consume-confirm') {
      var consumeItem = currentInventoryItems.find(function(row) { return row.id === id; });
      var consumeCard = document.querySelector('.inventory-card[data-id="' + id + '"]');
      if (!consumeItem || !consumeCard) return;

      var amount = consumeCard.querySelector('.inventory-consume-value').value.trim().replace(',', '.');
      if (!amount) {
        showToast('Укажите количество', 'error');
        return;
      }

      api.consumeInventoryItem(id, {
        quantity_value: amount,
        quantity_unit: consumeItem.quantity_unit
      }).then(function() {
        showToast('Продукт списан');
        haptic('success');
        loadInventory();
      }).catch(function(err) {
        showToast(err.message || 'Не удалось списать продукт', 'error');
      });
    }
  }

  // Подтвержденные продукты из фото добавляются в inventory и объединяются с дублями.
  function confirmPantryToInventory() {
    if (!currentPantrySession) return;

    api.addInventoryFromPantrySession(currentPantrySession.id).then(function() {
      showToast('Продукты добавлены в остатки');
      haptic('success');
      resetRecipes();
      loadInventory();
    }).catch(function(err) {
      showToast(err.message || 'Не удалось добавить продукты', 'error');
    });
  }

  // Изменения pantry-строки сохраняются сразу, чтобы подтверждение брало актуальные значения.
  function updatePantryItem(row) {
    var id = parseInt(row.dataset.id, 10);
    var name = row.querySelector('.pantry-name').value.trim();
    var qty = row.querySelector('.pantry-qty').value.trim();
    var unit = row.querySelector('.pantry-unit').value;
    if (!name) return;

    api.updatePantryItem(id, {
      name: name,
      quantity_text: buildQuantityText(qty, unit),
      category: 'другое',
      confidence: 'high'
    }).then(function(res) {
      currentPantryItems = currentPantryItems.map(function(item) {
        return item.id === id ? res.data : item;
      });
    });
  }

  function deletePantryItem(id) {
    api.deletePantryItem(id).then(function() {
      currentPantryItems = currentPantryItems.filter(function(item) {
        return String(item.id) !== String(id);
      });
      renderPantryItems();
    }).catch(function() {
      showToast('Не удалось удалить продукт', 'error');
    });
  }

  // Клиентский парсер нужен для полей, где количество и единица вводятся раздельно.
  function parseClientQuantity(text) {
    var raw = String(text || '').trim();
    if (!raw) return { value: '', unit: 'г' };

    var match = raw.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(кг|г|гр|мл|л|шт|штук|упак|пачка|пачки)/i);
    if (!match) return { value: raw, unit: 'г' };

    var value = Number(match[1]);
    var unit = match[2].toLowerCase();
    if (unit === 'кг') {
      value *= 1000;
      unit = 'г';
    } else if (unit === 'л') {
      value *= 1000;
      unit = 'мл';
    } else if (unit === 'гр') {
      unit = 'г';
    } else if (unit === 'штук') {
      unit = 'шт';
    } else if (unit === 'пачка' || unit === 'пачки') {
      unit = 'упак';
    }

    return { value: String(value).replace('.', ','), unit: unit };
  }

  function buildQuantityText(value, unit) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    if (/(кг|г|гр|мл|л|шт|штук|упак|пачка|пачки)\b/i.test(raw)) return raw;
    return raw + ' ' + (unit || 'г');
  }

  // Рецепты генерируются из текущих остатков inventory, а не из разового фото.
  function generateRecipes() {
    var btn = document.getElementById('btn-generate-recipes');
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.textContent = 'Подбираем...';
    document.getElementById('recipes-loading-text').textContent = 'Подбираем рецепты из ваших продуктов...';
    document.getElementById('recipes-loading').classList.remove('hidden');
    document.getElementById('recipes-area').classList.add('hidden');

    api.generateRecipes({
      source: 'inventory',
      goal: document.getElementById('recipe-goal').value
    }).then(function(res) {
      currentRecipes = res.data.recipes || [];
      renderRecipes();
      haptic('success');
    }).catch(function(err) {
      showToast(err.message || 'Не удалось подобрать рецепты', 'error');
    }).finally(function() {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || 'Подобрать рецепты';
      document.getElementById('recipes-loading').classList.add('hidden');
    });
  }

  // Карточки рецептов показывают КБЖУ, состав, недостающие продукты и действия.
  function renderRecipes() {
    var area = document.getElementById('recipes-area');
    var container = document.getElementById('recipes-list');
    area.classList.remove('hidden');

    if (!currentRecipes.length) {
      container.innerHTML = '<div class="empty-inline">Рецепты не найдены</div>';
      return;
    }

    container.innerHTML = currentRecipes.map(function(recipe) {
      return '<div class="recipe-card">' +
        '<div class="recipe-title">' + escapeHtml(recipe.title) + '</div>' +
        '<div class="recipe-meta">' + recipe.time_minutes + ' мин · ' + escapeHtml(recipe.difficulty || 'легко') +
          ' · ' + recipe.servings + ' порц. · ' + recipe.calories + ' ккал · Б ' + recipe.protein + ' Ж ' + recipe.fat + ' У ' + recipe.carbs + '</div>' +
        renderRecipeIngredients(recipe) +
        '<div class="recipe-steps">' + escapeHtml((recipe.steps || []).slice(0, 3).join(' · ')) + '</div>' +
        '<div class="recipe-actions">' +
          '<button class="btn btn-secondary btn-small" data-recipe-action="cook" data-id="' + recipe.id + '">Приготовил</button>' +
          '<button class="btn btn-outline btn-small" data-recipe-action="favorite" data-id="' + recipe.id + '">В избранное</button>' +
          '<button class="btn btn-primary btn-small" data-recipe-action="shopping" data-id="' + recipe.id + '">Покупки</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // Ингредиенты разбиты на доступные и недостающие для списка покупок.
  function renderRecipeIngredients(recipe) {
    var ingredients = recipe.ingredients || [];
    var missing = recipe.missing_items || [];
    if (!ingredients.length && !missing.length) return '';

    var html = '<details class="recipe-ingredients"><summary>Состав (' + (ingredients.length + missing.length) + ')</summary>';
    if (ingredients.length) {
      html += '<div class="recipe-ingredient-group">Есть</div>';
      html += ingredients.map(renderRecipeIngredientRow).join('');
    }
    if (missing.length) {
      html += '<div class="recipe-ingredient-group">Нужно докупить</div>';
      html += missing.map(renderRecipeIngredientRow).join('');
    }
    html += '</details>';
    return html;
  }

  function renderRecipeIngredientRow(item) {
    var qty = item.quantity_text ? escapeHtml(item.quantity_text) : '';
    var calories = item.calories ? Math.round(item.calories) + ' ккал' : 'ккал не указаны';
    return '<div class="recipe-ingredient-row">' +
      '<span>' + escapeHtml(item.name) + (qty ? ' · ' + qty : '') + '</span>' +
      '<strong>' + calories + '</strong>' +
    '</div>';
  }

  // Действия рецепта: дневник, приготовил, избранное или список покупок.
  function handleRecipeAction(action, id) {
    if (action === 'cook') {
      api.cookRecipe(id, { date: todayStr(), meal_type: 'lunch' }).then(function() {
        showToast('Рецепт добавлен в дневник, продукты списаны');
        todayTab.refresh();
        loadInventory();
        haptic('success');
      }).catch(function() {
        showToast('Не удалось приготовить рецепт', 'error');
      });
    } else if (action === 'favorite') {
      api.favoriteRecipe(id).then(function(res) {
        showToast(res.already_exists ? 'Рецепт уже есть в избранном' : 'Рецепт сохранен в избранное');
      }).catch(function() {
        showToast('Не удалось сохранить рецепт', 'error');
      });
    } else if (action === 'shopping') {
      api.createShoppingListFromRecipe(id, {
        list_id: shoppingTab.getCurrentListId()
      }).then(function(res) {
        shoppingTab.setList(res.data);
        if (window.switchAppTab) window.switchAppTab('tab-shopping');
      }).catch(function() {
        showToast('Не удалось создать список покупок', 'error');
      });
    }
  }

  // Сброс возвращает вкладку рецептов к начальному состоянию.
  function resetRecipes() {
    waitingForPhoto = false;
    currentPantrySession = null;
    currentPantryItems = [];
    currentRecipes = [];
    document.getElementById('recipes-start').classList.remove('hidden');
    document.getElementById('inventory-panel').classList.add('hidden');
    document.getElementById('recipes-loading').classList.add('hidden');
    document.getElementById('pantry-result').classList.add('hidden');
    document.getElementById('recipes-area').classList.add('hidden');
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  return {
    init: init,
    show: show,
    startPhotoFlow: startPhotoFlow,
    cancelPhotoFlow: cancelPhotoFlow,
    isWaitingForPhoto: isWaitingForPhoto,
    analyzePhoto: analyzePhoto
  };
})();

var shoppingTab = (function() {
  // Скрытый модуль покупок хранит один активный список и синхронизирует его с inventory.
  var currentList = null;
  var editingItemId = null;
  var categories = [
    'овощи/фрукты',
    'молочные',
    'мясо/рыба/птица',
    'крупы/хлеб/макароны',
    'специи/соусы',
    'другое'
  ];

  // Обработчики списка используют делегирование, потому что товары часто перерисовываются.
  function init() {
    document.getElementById('btn-add-shopping-item').addEventListener('click', addShoppingItem);
    document.getElementById('btn-clear-checked').addEventListener('click', clearCheckedItems);

    document.getElementById('shopping-list').addEventListener('change', function(e) {
      var checkbox = e.target.closest('.shopping-check');
      if (checkbox) toggleShoppingItem(checkbox.dataset.id, checkbox.checked);
    });

    document.getElementById('shopping-list').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-shopping-action]');
      if (!btn) return;

      var id = btn.dataset.id;
      var action = btn.dataset.shoppingAction;
      if (action === 'edit') {
        editingItemId = id;
        renderShoppingList();
      } else if (action === 'cancel') {
        editingItemId = null;
        renderShoppingList();
      } else if (action === 'save') {
        saveShoppingItem(id);
      } else if (action === 'delete') {
        deleteShoppingItem(id);
      }
    });

    var lastId = localStorage.getItem('lastShoppingListId');
    if (lastId && api.getShoppingList) {
      api.getShoppingList(lastId).then(function(res) {
        setList(res.data, false);
      }).catch(function() {
        localStorage.removeItem('lastShoppingListId');
        loadCurrentList();
      });
    } else {
      loadCurrentList();
    }
  }

  function show() {
    if (!currentList) loadCurrentList();
  }

  // Список из рецепта или API становится текущим и запоминается в localStorage.
  function setList(list, notify) {
    currentList = list;
    if (list && list.id) localStorage.setItem('lastShoppingListId', list.id);
    editingItemId = null;
    renderShoppingList();
    if (notify !== false) showToast('Список покупок создан');
  }

  // При входе во вкладку восстанавливаем последний активный список.
  function loadCurrentList() {
    api.getCurrentShoppingList().then(function(res) {
      if (res.data) setList(res.data, false);
      else renderShoppingList();
    }).catch(function() {
      renderShoppingList();
    });
  }

  // Ручное добавление товара создает список, если его еще нет.
  function ensureList() {
    if (currentList && currentList.id) return Promise.resolve(currentList);
    return api.createShoppingList({ title: 'Мой список покупок' }).then(function(res) {
      setList(res.data, false);
      return res.data;
    });
  }

  // Товары группируются по категориям для быстрого похода по магазину.
  function renderShoppingList() {
    var note = document.getElementById('shopping-note');
    var container = document.getElementById('shopping-list');
    var clearBtn = document.getElementById('btn-clear-checked');
    if (!currentList) {
      note.textContent = 'Список появится после выбора рецепта или первого товара.';
      clearBtn.classList.add('hidden');
      container.innerHTML = '<div class="empty-inline shopping-empty">Добавьте товар вручную или создайте список из рецепта.</div>';
      return;
    }

    note.textContent = currentList.title || 'Список покупок';
    var items = currentList.items || [];
    clearBtn.classList.toggle('hidden', !items.some(function(item) { return item.is_checked; }));

    if (!items.length) {
      container.innerHTML = '<div class="empty-inline shopping-empty">В списке пока нет товаров</div>';
      return;
    }

    container.innerHTML = categories.map(function(category) {
      var groupItems = items.filter(function(item) {
        return normalizeCategory(item.category) === category;
      });
      if (!groupItems.length) return '';

      return '<div class="shopping-group">' +
        '<div class="shopping-group-title">' + escapeHtml(categoryLabel(category)) + '</div>' +
        groupItems.map(renderShoppingItem).join('') +
      '</div>';
    }).join('');
  }

  // Каждая строка содержит обычный режим и раскрытую форму редактирования.
  function renderShoppingItem(item) {
    var isEditing = String(editingItemId) === String(item.id);
    var parsedQty = parseShoppingQuantity(item.quantity_text);
    var qty = item.quantity_text ? escapeHtml(item.quantity_text) : 'Количество не указано';
    var checked = item.is_checked ? ' checked' : '';
    var html = '<div class="shopping-card" data-id="' + item.id + '">' +
      '<div class="pantry-row shopping-row' + (item.is_checked ? ' checked' : '') + '" data-id="' + item.id + '">' +
        '<label class="pantry-row-icon shopping-check-shell">' +
          '<input type="checkbox" class="shopping-check" data-id="' + item.id + '"' + checked + ' aria-label="Куплено">' +
        '</label>' +
        '<div class="pantry-row-fields shopping-main">' +
          '<div class="pantry-name shopping-name">' + escapeHtml(item.name) + '</div>' +
          '<div class="pantry-qty shopping-meta">' + qty + ' · ' + escapeHtml(categoryLabel(item.category)) + '</div>' +
        '</div>' +
        '<div class="inventory-actions shopping-actions">' +
          '<button class="meal-icon-btn shopping-edit-btn" data-shopping-action="edit" data-id="' + item.id + '" type="button" title="Изменить" aria-label="Изменить">✎</button>' +
          '<button class="meal-icon-btn shopping-delete" data-shopping-action="delete" data-id="' + item.id + '" type="button" title="Удалить" aria-label="Удалить">&times;</button>' +
        '</div>' +
      '</div>';

    if (isEditing) {
      html += '<div class="shopping-edit-panel">' +
        '<input class="input shopping-edit-name" value="' + escapeHtml(item.name) + '" placeholder="Товар" aria-label="Товар">' +
        '<div class="shopping-quantity-row">' +
          '<input class="input shopping-edit-qty" value="' + escapeHtml(parsedQty.value) + '" placeholder="Количество" aria-label="Количество">' +
          '<select class="input shopping-edit-unit" aria-label="Единица измерения">' +
            shoppingUnitOption('г', parsedQty.unit) +
            shoppingUnitOption('мл', parsedQty.unit) +
            shoppingUnitOption('шт', parsedQty.unit) +
            shoppingUnitOption('упак', parsedQty.unit) +
          '</select>' +
        '</div>' +
        '<select class="input shopping-edit-category" aria-label="Категория">' + categoryOptions(item.category) + '</select>' +
        '<div class="shopping-edit-actions">' +
          '<button class="btn btn-primary btn-small" data-shopping-action="save" data-id="' + item.id + '" type="button">Сохранить</button>' +
          '<button class="btn btn-secondary btn-small" data-shopping-action="cancel" data-id="' + item.id + '" type="button">Отмена</button>' +
        '</div>' +
      '</div>';
    }

    html += '</div>';
    return html;
  }

  // Новый товар сохраняет количество вместе с единицей измерения.
  function addShoppingItem() {
    var nameInput = document.getElementById('shopping-item-name');
    var qtyInput = document.getElementById('shopping-item-qty');
    var unitInput = document.getElementById('shopping-item-unit');
    var categoryInput = document.getElementById('shopping-item-category');
    var name = nameInput.value.trim();
    if (!name) {
      showToast('Введите товар', 'error');
      return;
    }

    ensureList().then(function(list) {
      return api.addShoppingItem(list.id, {
        name: name,
        quantity_text: buildShoppingQuantityText(qtyInput.value.trim(), unitInput.value),
        category: categoryInput.value
      });
    }).then(function(res) {
      currentList.items = currentList.items || [];
      currentList.items.push(res.data);
      nameInput.value = '';
      qtyInput.value = '';
      unitInput.value = 'г';
      categoryInput.value = 'другое';
      renderShoppingList();
      haptic('success');
    }).catch(function(err) {
      showToast(err.message || 'Не удалось добавить товар', 'error');
    });
  }

  // При первой отметке "куплено" backend добавляет товар в "Мои продукты".
  function toggleShoppingItem(id, isChecked) {
    var row = document.querySelector('.shopping-card[data-id="' + id + '"]');
    if (!row) return;
    var item = findShoppingItem(id);
    if (!item) return;

    api.updateShoppingItem(id, {
      name: item.name,
      quantity_text: item.quantity_text || '',
      category: item.category || 'другое',
      is_checked: isChecked
    }).then(function(res) {
      if (isChecked && res.inventory_item) {
        showToast('Товар добавлен в продукты');
      }
      replaceShoppingItem(id, res.data);
      renderShoppingList();
    }).catch(function(err) {
      showToast(err.message || 'Не удалось обновить товар', 'error');
      renderShoppingList();
    });
  }

  // Редактирование товара сохраняет название, количество, единицу и категорию.
  function saveShoppingItem(id) {
    var row = document.querySelector('.shopping-card[data-id="' + id + '"]');
    if (!row) return;
    var name = row.querySelector('.shopping-edit-name').value.trim();
    if (!name) {
      showToast('Введите товар', 'error');
      return;
    }
    var item = findShoppingItem(id);

    api.updateShoppingItem(id, {
      name: name,
      quantity_text: buildShoppingQuantityText(
        row.querySelector('.shopping-edit-qty').value.trim(),
        row.querySelector('.shopping-edit-unit').value
      ),
      category: row.querySelector('.shopping-edit-category').value,
      is_checked: item ? Boolean(item.is_checked) : false
    }).then(function(res) {
      replaceShoppingItem(id, res.data);
      editingItemId = null;
      renderShoppingList();
      haptic('success');
    }).catch(function(err) {
      showToast(err.message || 'Не удалось сохранить товар', 'error');
    });
  }

  // Удаление товара не откатывает уже добавленные остатки.
  function deleteShoppingItem(id) {
    api.deleteShoppingItem(id).then(function() {
      if (currentList && currentList.items) {
        currentList.items = currentList.items.filter(function(item) {
          return String(item.id) !== String(id);
        });
      }
      renderShoppingList();
    });
  }

  // Очистка купленного оставляет активный список, но убирает отмеченные строки.
  function clearCheckedItems() {
    if (!currentList || !currentList.id) return;
    api.clearCheckedShoppingItems(currentList.id).then(function(res) {
      currentList = res.data;
      editingItemId = null;
      renderShoppingList();
      haptic('success');
    }).catch(function(err) {
      showToast(err.message || 'Не удалось очистить купленное', 'error');
    });
  }

  function findShoppingItem(id) {
    if (!currentList || !currentList.items) return null;
    return currentList.items.find(function(item) {
      return String(item.id) === String(id);
    }) || null;
  }

  function replaceShoppingItem(id, nextItem) {
    if (!currentList || !currentList.items) return;
    currentList.items = currentList.items.map(function(item) {
      return String(item.id) === String(id) ? nextItem : item;
    });
  }

  // Категории нормализуются на клиенте так же, как на сервере.
  function normalizeCategory(category) {
    var value = String(category || 'другое').trim().toLocaleLowerCase('ru-RU');
    return categories.indexOf(value) === -1 ? 'другое' : value;
  }

  function categoryLabel(category) {
    return normalizeCategory(category);
  }

  function categoryOptions(selected) {
    selected = normalizeCategory(selected);
    return categories.map(function(category) {
      return '<option value="' + escapeHtml(category) + '"' + (category === selected ? ' selected' : '') + '>' + escapeHtml(categoryLabel(category)) + '</option>';
    }).join('');
  }

  // Разделяем количество и единицу, чтобы пользователь мог купить больше, чем требует рецепт.
  function parseShoppingQuantity(text) {
    var raw = String(text || '').trim();
    if (!raw) return { value: '', unit: 'г' };

    var match = raw.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(кг|г|гр|мл|л|шт|штук|упак|пачка|пачки)/i);
    if (!match) return { value: raw, unit: 'г' };

    var value = Number(match[1]);
    var unit = match[2].toLowerCase();
    if (unit === 'кг') {
      value *= 1000;
      unit = 'г';
    } else if (unit === 'л') {
      value *= 1000;
      unit = 'мл';
    } else if (unit === 'гр') {
      unit = 'г';
    } else if (unit === 'штук') {
      unit = 'шт';
    } else if (unit === 'пачка' || unit === 'пачки') {
      unit = 'упак';
    }

    return { value: String(value).replace('.', ','), unit: unit };
  }

  function buildShoppingQuantityText(value, unit) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    if (/(кг|г|гр|мл|л|шт|штук|упак|пачка|пачки)\b/i.test(raw)) return raw;
    return raw + ' ' + (unit || 'г');
  }

  function shoppingUnitOption(unit, selected) {
    return '<option value="' + unit + '"' + (unit === selected ? ' selected' : '') + '>' + unit + '</option>';
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  function getCurrentListId() {
    return currentList && currentList.id ? currentList.id : null;
  }

  return { init: init, show: show, setList: setList, getCurrentListId: getCurrentListId };
})();
