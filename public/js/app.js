// Инициализация Telegram Mini App и переключение вкладок.

(function() {
  var tg = window.Telegram && window.Telegram.WebApp;

  // Сообщаем Telegram, что Mini App готов, и разворачиваем его на всю высоту.
  if (tg) {
    tg.ready();
    tg.expand();

    if (tg.headerColor) {
      try { tg.setHeaderColor('secondary_bg_color'); } catch(e) {}
    }
  }

  // Инициализация модулей вкладок.
  analyzeTab.init();
  diaryTab.init();
  statsTab.init();

  // Простая маршрутизация между тремя вкладками SPA.
  var tabItems = document.querySelectorAll('.tab-bar-item');
  var tabContents = document.querySelectorAll('.tab-content');

  var tabModules = {
    'tab-analyze': analyzeTab,
    'tab-diary': diaryTab,
    'tab-stats': statsTab
  };

  tabItems.forEach(function(item) {
    item.addEventListener('click', function() {
      var tabId = item.dataset.tab;
      switchTab(tabId);
      haptic('light');
    });
  });

  function switchTab(tabId) {
    tabItems.forEach(function(i) {
      i.classList.toggle('active', i.dataset.tab === tabId);
    });
    tabContents.forEach(function(c) {
      c.classList.toggle('active', c.id === tabId);
    });

    var mod = tabModules[tabId];
    if (mod && mod.show) {
      mod.show();
    }
  }

  // Кнопка Back в Telegram возвращает пользователя на вкладку анализа.
  if (tg && tg.BackButton) {
    tg.BackButton.onClick(function() {
      switchTab('tab-analyze');
    });
  }
})();
