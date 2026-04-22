// Инициализация Telegram Mini App и переключение вкладок.

(function() {
  var tg = window.Telegram && window.Telegram.WebApp;

  if (tg) {
    tg.ready();
    tg.expand();

    if (tg.headerColor) {
      try { tg.setHeaderColor('secondary_bg_color'); } catch(e) {}
    }
  }

  todayTab.init();
  diaryTab.init();
  recipesTab.init();
  shoppingTab.init();
  profileTab.init();
  adminTab.init();

  var tabModules = {
    'tab-today': todayTab,
    'tab-diary': diaryTab,
    'tab-recipes': recipesTab,
    'tab-shopping': shoppingTab,
    'tab-profile': profileTab,
    'tab-admin': adminTab
  };

  document.querySelectorAll('.tab-bar-item').forEach(function(item) {
    item.addEventListener('click', function() {
      var tabId = item.dataset.tab;
      if (item.classList.contains('hidden')) return;
      switchTab(tabId);
      haptic('light');
    });
  });

  function switchTab(tabId) {
    var target = document.getElementById(tabId);
    if (!target || target.classList.contains('hidden')) return;

    document.querySelectorAll('.tab-bar-item').forEach(function(i) {
      i.classList.toggle('active', i.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-content').forEach(function(c) {
      c.classList.toggle('active', c.id === tabId);
    });

    var mod = tabModules[tabId];
    if (mod && mod.show) mod.show();

    if (tg && tg.BackButton) {
      if (tabId === 'tab-today') tg.BackButton.hide();
      else tg.BackButton.show();
    }
  }

  function configureAdminTab() {
    api.getMonetization().then(function(res) {
      var access = res.data && res.data.access;
      var isAdmin = Boolean(access && access.is_admin);
      document.getElementById('nav-admin').classList.toggle('hidden', !isAdmin);
      document.getElementById('tab-admin').classList.toggle('hidden', !isAdmin);

      if (!isAdmin && document.querySelector('.tab-bar-item.active').dataset.tab === 'tab-admin') {
        switchTab('tab-today');
      }
    }).catch(function() {
      document.getElementById('nav-admin').classList.add('hidden');
      document.getElementById('tab-admin').classList.add('hidden');
    });
  }

  window.switchAppTab = switchTab;
  configureAdminTab();
  switchTab('tab-today');

  if (tg && tg.BackButton) {
    tg.BackButton.onClick(function() {
      switchTab('tab-today');
    });
  }
})();
