// Analyze tab logic

var analyzeTab = (function() {
  var currentResult = null;
  var currentPhotoBlob = null;
  var selectedMealType = 'lunch';
  var inputSource = null; // 'photo' or 'text'

  function init() {
    var btnPhoto = document.getElementById('btn-photo');
    var btnTextMode = document.getElementById('btn-text-mode');
    var fileInput = document.getElementById('file-input');
    var btnAnalyzeText = document.getElementById('btn-analyze-text');
    var btnAnalyzePhoto = document.getElementById('btn-analyze-photo');
    var btnRemovePhoto = document.getElementById('btn-remove-photo');
    var btnRetry = document.getElementById('btn-retry');
    var btnSave = document.getElementById('btn-save-meal');

    btnPhoto.addEventListener('click', function() {
      fileInput.click();
    });

    btnTextMode.addEventListener('click', function() {
      document.getElementById('text-input-area').classList.remove('hidden');
      document.getElementById('food-description').focus();
    });

    fileInput.addEventListener('change', function(e) {
      if (e.target.files && e.target.files[0]) {
        handlePhotoSelected(e.target.files[0]);
      }
    });

    btnAnalyzePhoto.addEventListener('click', function() {
      if (currentPhotoBlob) {
        doPhotoAnalysis(currentPhotoBlob);
      }
    });

    btnAnalyzeText.addEventListener('click', function() {
      var desc = document.getElementById('food-description').value.trim();
      if (desc) {
        doTextAnalysis(desc);
      }
    });

    btnRemovePhoto.addEventListener('click', function() {
      resetToInput();
    });

    btnRetry.addEventListener('click', function() {
      resetToInput();
    });

    btnSave.addEventListener('click', function() {
      saveMeal();
    });

    // Meal type selector
    document.getElementById('meal-type-selector').addEventListener('click', function(e) {
      var btn = e.target.closest('.meal-type-btn');
      if (!btn) return;
      document.querySelectorAll('.meal-type-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      selectedMealType = btn.dataset.type;
      haptic('light');
    });

    // Auto-select meal type based on time
    autoSelectMealType();
  }

  function autoSelectMealType() {
    var h = new Date().getHours();
    if (h >= 6 && h < 11) selectedMealType = 'breakfast';
    else if (h >= 11 && h < 15) selectedMealType = 'lunch';
    else if (h >= 15 && h < 20) selectedMealType = 'dinner';
    else selectedMealType = 'snack';

    document.querySelectorAll('.meal-type-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.type === selectedMealType);
    });
  }

  function handlePhotoSelected(file) {
    compressImage(file, 1024, 0.7).then(function(blob) {
      currentPhotoBlob = blob;
      var url = URL.createObjectURL(blob);
      document.getElementById('photo-preview-img').src = url;
      document.getElementById('photo-preview-area').classList.remove('hidden');
      document.getElementById('text-input-area').classList.add('hidden');
    });
  }

  function showLoading() {
    document.getElementById('analyze-input').classList.add('hidden');
    document.getElementById('analyze-loading').classList.remove('hidden');
    document.getElementById('analyze-result').classList.add('hidden');
  }

  function showResult() {
    document.getElementById('analyze-input').classList.add('hidden');
    document.getElementById('analyze-loading').classList.add('hidden');
    document.getElementById('analyze-result').classList.remove('hidden');
  }

  function resetToInput() {
    currentResult = null;
    currentPhotoBlob = null;
    inputSource = null;
    document.getElementById('file-input').value = '';
    document.getElementById('food-description').value = '';
    document.getElementById('photo-preview-area').classList.add('hidden');
    document.getElementById('text-input-area').classList.add('hidden');
    document.getElementById('analyze-input').classList.remove('hidden');
    document.getElementById('analyze-loading').classList.add('hidden');
    document.getElementById('analyze-result').classList.add('hidden');
    autoSelectMealType();
  }

  function doPhotoAnalysis(blob) {
    inputSource = 'photo';
    showLoading();

    api.analyzePhoto(blob).then(function(res) {
      if (res.success) {
        currentResult = res.data;
        displayResult(res.data);
        haptic('success');
      } else {
        showToast(res.message || 'Не удалось распознать еду', 'error');
        haptic('error');
        resetToInput();
      }
    }).catch(function(err) {
      showToast(err.message || 'Ошибка анализа', 'error');
      haptic('error');
      resetToInput();
    });
  }

  function doTextAnalysis(description) {
    inputSource = 'text';
    showLoading();

    api.analyzeText(description).then(function(res) {
      if (res.success) {
        currentResult = res.data;
        displayResult(res.data);
        haptic('success');
      } else {
        showToast(res.message || 'Не удалось проанализировать', 'error');
        haptic('error');
        resetToInput();
      }
    }).catch(function(err) {
      showToast(err.message || 'Ошибка анализа', 'error');
      haptic('error');
      resetToInput();
    });
  }

  function displayResult(data) {
    document.getElementById('result-dish-name').textContent = data.dish_name;
    document.getElementById('result-calories').textContent = data.calories;
    document.getElementById('result-protein').textContent = data.protein + ' г';
    document.getElementById('result-fat').textContent = data.fat + ' г';
    document.getElementById('result-carbs').textContent = data.carbs + ' г';
    document.getElementById('result-portion').textContent =
      data.portion_grams ? 'Порция ~' + data.portion_grams + ' г' : '';

    var conf = document.getElementById('result-confidence');
    conf.textContent = data.confidence === 'high' ? 'Высокая точность' :
                       data.confidence === 'medium' ? 'Средняя точность' : 'Низкая точность';
    conf.className = 'confidence-badge confidence-' + data.confidence;

    // Items breakdown
    var itemsEl = document.getElementById('result-items');
    if (data.items && data.items.length > 1) {
      var html = '<details><summary>Состав блюда (' + data.items.length + ')</summary>';
      data.items.forEach(function(item) {
        html += '<div class="item-row"><span>' + item.name + '</span><span>' + item.calories + ' ккал</span></div>';
      });
      html += '</details>';
      itemsEl.innerHTML = html;
      itemsEl.classList.remove('hidden');
    } else {
      itemsEl.classList.add('hidden');
    }

    showResult();
  }

  function saveMeal() {
    if (!currentResult) return;

    var btn = document.getElementById('btn-save-meal');
    btn.disabled = true;

    var mealData = {
      date: todayStr(),
      meal_type: selectedMealType,
      description: currentResult.dish_name,
      calories: currentResult.calories,
      protein: currentResult.protein,
      fat: currentResult.fat,
      carbs: currentResult.carbs,
      portion_grams: currentResult.portion_grams,
      source: inputSource || 'text'
    };

    api.saveMeal(mealData).then(function() {
      showToast('Сохранено в дневник!');
      haptic('success');
      resetToInput();
    }).catch(function(err) {
      showToast(err.message || 'Ошибка сохранения', 'error');
      haptic('error');
    }).finally(function() {
      btn.disabled = false;
    });
  }

  function show() {
    // Nothing special on tab show
  }

  return { init: init, show: show };
})();
