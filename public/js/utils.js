// Utility functions

function compressImage(file, maxWidth, quality) {
  maxWidth = maxWidth || 1024;
  quality = quality || 0.7;

  return new Promise(function(resolve) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        var w = img.width;
        var h = img.height;

        if (w > maxWidth) {
          h = Math.round(h * maxWidth / w);
          w = maxWidth;
        }

        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(function(blob) {
          resolve(blob);
        }, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function formatDate(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  var months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  var dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  return d.getDate() + ' ' + months[d.getMonth()] + ', ' + dayNames[d.getDay()];
}

function formatShortDate(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  var dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  return dayNames[d.getDay()];
}

function todayStr() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function addDays(dateStr, days) {
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  d.setDate(d.getDate() + days);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function showToast(message, type) {
  type = type || 'success';
  var existing = document.querySelector('.toast');
  if (existing) existing.remove();

  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(function() {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(function() { toast.remove(); }, 300);
  }, 2500);
}

function haptic(type) {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.HapticFeedback) {
    if (type === 'success') {
      tg.HapticFeedback.notificationOccurred('success');
    } else if (type === 'error') {
      tg.HapticFeedback.notificationOccurred('error');
    } else if (type === 'light') {
      tg.HapticFeedback.impactOccurred('light');
    } else {
      tg.HapticFeedback.impactOccurred('medium');
    }
  }
}

var MEAL_ICONS = {
  breakfast: '\uD83C\uDF05',
  lunch: '\u2600\uFE0F',
  dinner: '\uD83C\uDF19',
  snack: '\uD83C\uDF7F'
};

var MEAL_LABELS = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус'
};
