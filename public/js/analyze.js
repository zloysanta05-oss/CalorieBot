// Analyze tab logic

var analyzeTab = (function() {
  var currentResult = null;
  var currentPhotoBlob = null;
  var selectedMealType = 'lunch';
  var inputSource = null; // 'photo' or 'text'
  var recognition = null;
  var isListening = false;

  function init() {
    var btnPhoto = document.getElementById('btn-photo');
    var btnTextMode = document.getElementById('btn-text-mode');
    var fileInput = document.getElementById('file-input');
    var btnAnalyzeText = document.getElementById('btn-analyze-text');
    var btnAnalyzePhoto = document.getElementById('btn-analyze-photo');
    var btnVoice = document.getElementById('btn-voice-description');
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

    btnVoice.addEventListener('click', function() {
      toggleVoiceInput();
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
    initVoiceInput();
  }

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
      btnVoice.setAttribute('aria-label', 'Остановить голосовой ввод');
      btnVoice.setAttribute('title', 'Остановить голосовой ввод');
      document.getElementById('voice-status').classList.remove('hidden');
      document.getElementById('voice-meter').classList.remove('hidden');
      haptic('light');
    };

    recognition.onend = function() {
      isListening = false;
      btnVoice.classList.remove('listening');
      btnVoice.setAttribute('aria-label', 'Голосовой ввод');
      btnVoice.setAttribute('title', 'Голосовой ввод');
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
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
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
      if (isListening) {
        recognition.stop();
      } else {
        document.getElementById('voice-status').textContent = 'Слушаю...';
        recognition.start();
      }
    } catch (err) {
      showToast('Не удалось включить микрофон', 'error');
    }
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
    if (recognition && isListening) {
      recognition.stop();
    }
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
    document.getElementById('result-dish-name-input').value = data.dish_name || '';
    document.getElementById('result-calories-input').value = data.calories || 0;
    document.getElementById('result-protein-input').value = data.protein || 0;
    document.getElementById('result-fat-input').value = data.fat || 0;
    document.getElementById('result-carbs-input').value = data.carbs || 0;
    document.getElementById('result-portion-input').value = data.portion_grams || '';

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
    var edited = readEditedResult();
    if (!edited) {
      btn.disabled = false;
      return;
    }

    currentResult = Object.assign({}, currentResult, edited);

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

  function readEditedResult() {
    var dishName = document.getElementById('result-dish-name-input').value.trim();
    var calories = parseNumberInput('result-calories-input');
    var protein = parseNumberInput('result-protein-input');
    var fat = parseNumberInput('result-fat-input');
    var carbs = parseNumberInput('result-carbs-input');
    var portion = parseNumberInput('result-portion-input', true);

    if (!dishName) {
      showToast('Укажите название блюда', 'error');
      return null;
    }

    if (calories === null || protein === null || fat === null || carbs === null) {
      showToast('Проверьте калории и БЖУ', 'error');
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

  function parseNumberInput(id, allowEmpty) {
    var raw = document.getElementById(id).value;
    if (allowEmpty && raw.trim() === '') return null;

    var value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return null;
    return value;
  }

  function roundMacro(value) {
    return Math.round(value * 10) / 10;
  }

  function show() {
    // Nothing special on tab show
  }

  return { init: init, show: show };
})();
