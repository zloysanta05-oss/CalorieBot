// Логика вкладок «Профиль» и «Админ».

var profileTab = (function() {
  // Профиль хранит текущую цель, результат калькулятора и восстановленное состояние формы.
  var currentGoal = 2000;
  var calculatedGoal = null;
  var calcStorageKey = 'profileCalorieCalculator';

  // Калькулятор скрыт отдельным экраном, а профиль остается чистым для обычного просмотра.
  function init() {
    document.getElementById('btn-save-calculated-goal').addEventListener('click', function() {
      saveGoal(parseInt(document.getElementById('calc-goal-input').value, 10));
    });

    document.getElementById('btn-toggle-calculator').addEventListener('click', function() {
      showCalculatorScreen();
      haptic('light');
    });

    document.getElementById('btn-close-calculator').addEventListener('click', function() {
      showProfileMain();
      haptic('light');
    });

    [
      'calc-sex',
      'calc-age',
      'calc-height',
      'calc-weight',
      'calc-activity',
      'calc-goal'
    ].forEach(function(id) {
      document.getElementById(id).addEventListener('input', updateCalorieCalculation);
      document.getElementById(id).addEventListener('change', updateCalorieCalculation);
    });

    document.getElementById('btn-buy-premium').addEventListener('click', buyPremium);
    restoreCalculatorState();
  }

  function show() {
    showProfileMain();
    loadProfile();
  }

  // Экран пересчета получает последнюю сохраненную или рассчитанную цель.
  function showCalculatorScreen() {
    document.getElementById('calc-goal-input').value = calculatedGoal || currentGoal;
    document.getElementById('profile-main').classList.add('hidden');
    document.getElementById('profile-calculator-screen').classList.remove('hidden');
  }

  function showProfileMain() {
    document.getElementById('profile-calculator-screen').classList.add('hidden');
    document.getElementById('profile-main').classList.remove('hidden');
  }

  // Профиль собирает недельную статистику, цель и freemium/Premium статус одним пакетом.
  function loadProfile() {
    var today = todayStr();
    var weekFrom = addDays(today, -6);

    Promise.all([
      api.getWeekStats(weekFrom, today),
      api.getGoals(),
      api.getMonetization()
    ]).then(function(results) {
      var weekRes = results[0];
      var goalsRes = results[1];
      var monetizationRes = results[2];

      currentGoal = goalsRes.data.daily_calories || 2000;
      document.getElementById('goal-input').textContent = currentGoal;
      document.getElementById('calc-goal-input').value = currentGoal;

      if (weekRes.success) renderWeekChart(weekRes.data);
      if (monetizationRes.success) renderAccess(monetizationRes.data);
      updateCalorieCalculation();
    }).catch(function() {
      showToast('Не удалось загрузить профиль', 'error');
    });
  }

  // Блок доступа показывает статус пользователя и кнопку покупки только для Free.
  function renderAccess(plan) {
    renderUser(plan.user || {});
    var data = plan.access;
    var usage = plan.usage;
    var settings = plan.settings;
    var badge = document.getElementById('access-badge');
    var text = document.getElementById('access-status-text');
    var premiumActions = document.getElementById('premium-actions');
    var buyButton = document.getElementById('btn-buy-premium');

    var label = data.has_premium ? 'Premium' : 'Free';
    if (data.access_type === 'owner') label = 'Owner';
    if (data.access_type === 'gifted') label = 'Gifted';

    badge.textContent = label;
    badge.className = 'access-badge' + (data.has_premium ? ' premium' : '');

    if (data.access_type === 'owner') {
      text.textContent = 'Владелец: бесплатный доступ навсегда';
    } else if (data.has_premium) {
      text.textContent = data.expires_at ? 'Premium до ' + data.expires_at : 'Бессрочный Premium-доступ';
    } else {
      text.textContent = 'Бесплатно: ' + usage.remaining + ' из ' + usage.free_daily_limit + ' анализов осталось сегодня';
    }

    buyButton.textContent = 'Купить Premium за ' + settings.premium_stars + ' Stars / 30 дней';
    premiumActions.classList.toggle('hidden', data.has_premium);
  }

  // Сохранение цели используется и для ручного числа, и для результата Миффлина-Сан Жеора.
  function saveGoal(value) {
    var val = parseInt(value, 10);
    if (!val || val < 500 || val > 10000) {
      showToast('Укажите цель от 500 до 10000 ккал', 'error');
      return;
    }

    api.setGoal(val).then(function() {
      currentGoal = val;
      document.getElementById('goal-input').textContent = val;
      document.getElementById('calc-goal-input').value = val;
      showToast('Цель сохранена');
      haptic('success');
      showProfileMain();
      todayTab.refresh();
      loadProfile();
    }).catch(function() {
      showToast('Ошибка сохранения', 'error');
    });
  }

  // Имя и аватар берутся из Telegram-профиля, который backend сохраняет при API-запросах.
  function renderUser(user) {
    var name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    if (!name && user.username) name = '@' + user.username;
    if (!name) name = 'Пользователь Telegram';

    var meta = user.username && name.indexOf('@' + user.username) === -1 ? ' @' + user.username : '';
    document.getElementById('profile-user-name').textContent = name + meta;
    document.getElementById('profile-avatar').textContent = name.trim().charAt(0).toLocaleUpperCase('ru-RU');
  }

  // Состояние калькулятора живет локально, чтобы пользователь не вводил данные заново.
  function restoreCalculatorState() {
    try {
      var saved = JSON.parse(localStorage.getItem(calcStorageKey) || '{}');
      if (saved.sex) document.getElementById('calc-sex').value = saved.sex;
      if (saved.age) document.getElementById('calc-age').value = saved.age;
      if (saved.height) document.getElementById('calc-height').value = saved.height;
      if (saved.weight) document.getElementById('calc-weight').value = saved.weight;
      if (saved.activity) document.getElementById('calc-activity').value = saved.activity;
      if (saved.goal) document.getElementById('calc-goal').value = saved.goal;
    } catch (err) {}
  }

  function saveCalculatorState(state) {
    localStorage.setItem(calcStorageKey, JSON.stringify(state));
  }

  // Формула Миффлина-Сан Жеора: BMR -> активность -> корректировка под цель.
  function updateCalorieCalculation() {
    var state = {
      sex: document.getElementById('calc-sex').value,
      age: Number(document.getElementById('calc-age').value),
      height: Number(document.getElementById('calc-height').value),
      weight: Number(String(document.getElementById('calc-weight').value).replace(',', '.')),
      activity: Number(document.getElementById('calc-activity').value),
      goal: document.getElementById('calc-goal').value
    };
    saveCalculatorState(state);

    if (!state.age || !state.height || !state.weight) {
      calculatedGoal = null;
      return;
    }

    var bmr = 10 * state.weight + 6.25 * state.height - 5 * state.age + (state.sex === 'male' ? 5 : -161);
    var target = bmr * state.activity;
    if (state.goal === 'lose') target *= 0.85;
    if (state.goal === 'gain') target *= 1.1;

    calculatedGoal = Math.max(500, Math.min(10000, Math.round(target)));
    document.getElementById('calc-goal-input').value = calculatedGoal;
  }

  // Telegram Stars invoice открывается средствами Telegram WebApp.
  function buyPremium() {
    var btn = document.getElementById('btn-buy-premium');
    btn.disabled = true;

    api.createSubscriptionInvoice().then(function(res) {
      var invoiceLink = res.data.invoice_link;
      var tg = window.Telegram && window.Telegram.WebApp;

      if (tg && tg.openInvoice) {
        tg.openInvoice(invoiceLink, function(status) {
          btn.disabled = false;
          if (status === 'paid') {
            showToast('Оплата прошла. Доступ обновится после подтверждения Telegram.');
            haptic('success');
            setTimeout(loadProfile, 1200);
          } else if (status === 'cancelled') {
            showToast('Оплата отменена', 'error');
          }
        });
      } else {
        window.location.href = invoiceLink;
      }
    }).catch(function(err) {
      btn.disabled = false;
      showToast(err.message || 'Не удалось создать счет', 'error');
    });
  }

  // Недельный график строится без AI, только по данным дневника.
  function renderWeekChart(data) {
    var days = data.days || [];
    var goal = data.goal || currentGoal;
    var container = document.getElementById('week-chart-bars');
    var summaryEl = document.getElementById('week-summary');

    if (days.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Нет данных за неделю</p></div>';
      summaryEl.innerHTML = '';
      return;
    }

    var maxVal = Math.max(goal, Math.max.apply(null, days.map(function(d) { return d.calories; })));
    if (maxVal === 0) maxVal = goal;

    var html = '<div class="chart-goal-line" style="bottom:' + Math.round(goal / maxVal * 100) + '%"></div>';
    days.forEach(function(day) {
      var heightPct = maxVal > 0 ? Math.round(day.calories / maxVal * 100) : 0;
      var isOver = day.calories > goal;
      html += '<div class="chart-bar-wrapper">' +
        '<div class="chart-bar' + (isOver ? ' over' : '') + '" style="height:' + Math.max(heightPct, 1) + '%" title="' + Math.round(day.calories) + ' ккал"></div>' +
        '<div class="chart-bar-label">' + formatShortDate(day.date) + '</div>' +
      '</div>';
    });

    container.innerHTML = html;
    renderWeekSummary(data, summaryEl);
  }

  // Текстовая сводка недели разбита на строки, чтобы не плыть на узких экранах.
  function renderWeekSummary(data, summaryEl) {
    var avg = data.averages || {};
    var best = data.best_day;
    var problem = data.problem_day;
    var rows = [];
    if (data.summary_text) rows.push(data.summary_text);
    rows.push('Среднее: ' + Math.round(avg.calories || 0) + ' ккал');
    rows.push('Б: ' + Math.round(avg.protein || 0) + ' г · Ж: ' + Math.round(avg.fat || 0) + ' г · У: ' + Math.round(avg.carbs || 0) + ' г');
    rows.push('Дней в цели: ' + (data.days_within_goal || 0));
    if (best) rows.push('Лучший день: ' + formatShortDate(best.date));
    if (problem) rows.push('Сложный день: ' + formatShortDate(problem.date));

    summaryEl.innerHTML = rows.filter(Boolean).map(function(row) {
      return '<div>' + escapeHtml(row) + '</div>';
    }).join('');
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  return { init: init, show: show, refresh: loadProfile };
})();

var adminTab = (function() {
  // Админка имеет собственную внутреннюю навигацию и состояние пагинации пользователей.
  var currentAccess = null;
  var settings = { premium_stars: 100, free_daily_limit: 3 };
  var activePanel = 'overview';
  var userFilter = 'active';
  var usersLimit = 25;
  var usersOffset = 0;
  var usersHasMore = false;
  var usersTotal = 0;
  var searchTimer = null;

  // Все списки админки динамические, поэтому клики по строкам обрабатываются делегированием.
  function init() {
    document.querySelectorAll('.admin-tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        switchPanel(btn.dataset.adminPanel);
      });
    });

    document.getElementById('btn-save-monetization').addEventListener('click', saveMonetization);
    document.getElementById('btn-save-limits').addEventListener('click', saveMonetization);
    document.getElementById('btn-grant-access').addEventListener('click', grantAccess);

    document.getElementById('admin-user-search').addEventListener('input', function() {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function() {
        resetUserPagination();
        loadAdminUsers();
      }, 250);
    });

    document.getElementById('admin-user-filters').addEventListener('click', function(e) {
      var btn = e.target.closest('.admin-filter');
      if (!btn) return;
      userFilter = btn.dataset.filter || 'active';
      document.querySelectorAll('.admin-filter').forEach(function(item) {
        item.classList.toggle('active', item === btn);
      });
      resetUserPagination();
      loadAdminUsers();
    });

    document.getElementById('admin-users-pagination').addEventListener('click', function(e) {
      var btn = e.target.closest('.admin-load-more');
      if (!btn || !usersHasMore) return;
      usersOffset += usersLimit;
      loadAdminUsers(true);
    });

    document.getElementById('admin-entitlements').addEventListener('click', function(e) {
      var btn = e.target.closest('.admin-revoke');
      if (!btn) return;
      revokeAccess(btn.dataset.id);
    });

    document.getElementById('admin-users').addEventListener('click', function(e) {
      var row = e.target.closest('.admin-user-row');
      if (!row) return;
      openUserCard(row.dataset.id);
    });

    document.getElementById('admin-blocked-users').addEventListener('click', function(e) {
      var row = e.target.closest('.admin-user-row');
      if (!row) return;
      switchPanel('users');
      openUserCard(row.dataset.id);
    });

    document.getElementById('admin-user-card').addEventListener('click', handleUserCardClick);
  }

  function show() {
    loadAdmin();
  }

  // Переключение внутренних разделов не меняет основную вкладку приложения.
  function switchPanel(panel) {
    activePanel = panel || 'overview';
    document.querySelectorAll('.admin-tab-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.adminPanel === activePanel);
    });
    document.querySelectorAll('.admin-panel').forEach(function(panelEl) {
      panelEl.classList.toggle('active', panelEl.id === 'admin-panel-' + activePanel);
    });
    loadPanel(activePanel);
  }

  // Каждый раздел грузит только свои данные, чтобы не делать лишние API-запросы.
  function loadPanel(panel) {
    if (!currentAccess || !currentAccess.is_admin) return;
    if (panel === 'overview') {
      loadOverview();
      loadAdminPayments('admin-overview-payments', 5);
    }
    if (panel === 'users') loadAdminUsers();
    if (panel === 'access') loadAdminEntitlements();
    if (panel === 'money') loadAdminPayments('admin-payments');
    if (panel === 'limits') loadBlockedUsers();
  }

  // Перед загрузкой админских данных проверяем текущий access из общего monetization endpoint.
  function loadAdmin() {
    api.getMonetization().then(function(res) {
      currentAccess = res.data.access;
      if (!currentAccess || !currentAccess.is_admin) {
        document.getElementById('admin-overview').innerHTML = '<div class="admin-empty">Нет прав администратора</div>';
        return;
      }

      settings = res.data.settings || settings;
      document.getElementById('admin-premium-stars').value = settings.premium_stars;
      document.getElementById('admin-free-limit').value = settings.free_daily_limit;
      loadPanel(activePanel);
    }).catch(function() {
      showToast('Не удалось загрузить админку', 'error');
    });
  }

  // Обзор собирает продуктовые и финансовые метрики в компактные карточки.
  function loadOverview() {
    api.getAdminOverview().then(function(res) {
      var data = res.data || {};
      var counts = data.access_counts || {};
      document.getElementById('admin-overview').innerHTML = [
        metricCard('Пользователи', data.total_users || 0, 'активны сегодня: ' + (data.active_today || 0)),
        metricCard('Активность 7 дней', data.active_7d || 0, 'анализов сегодня: ' + (data.analyses_today || 0)),
        metricCard('Premium', counts.subscription || 0, 'Gifted: ' + (counts.gifted || 0) + ' · Owner: ' + (counts.owner || 0)),
        metricCard('Выручка', data.revenue_stars || 0, 'платежей: ' + (data.paid_payments || 0) + ' · Stars'),
        metricCard('Цена Premium', data.premium_stars || 0, 'Stars за 30 дней'),
        metricCard('Free limit', data.free_daily_limit || 0, 'анализов в день')
      ].join('');
    }).catch(function() {
      document.getElementById('admin-overview').innerHTML = '<div class="admin-empty">Не удалось загрузить обзор</div>';
    });
  }

  function metricCard(title, value, note) {
    return '<div class="admin-metric-card">' +
      '<div class="admin-metric-title">' + escapeHtml(title) + '</div>' +
      '<div class="admin-metric-value">' + escapeHtml(value) + '</div>' +
      '<div class="admin-metric-note">' + escapeHtml(note) + '</div>' +
    '</div>';
  }

  // Одна форма сохраняет и цену Premium, и дневной free-лимит.
  function saveMonetization() {
    var premiumStars = parseInt(document.getElementById('admin-premium-stars').value, 10);
    var freeLimit = parseInt(document.getElementById('admin-free-limit').value, 10);

    if (!premiumStars || premiumStars < 1 || premiumStars > 10000) {
      showToast('Укажите цену от 1 до 10000 Stars', 'error');
      return;
    }
    if (isNaN(freeLimit) || freeLimit < 0 || freeLimit > 100) {
      showToast('Укажите бесплатный лимит от 0 до 100', 'error');
      return;
    }

    api.updateMonetizationSettings({
      premium_stars: premiumStars,
      free_daily_limit: freeLimit
    }).then(function(res) {
      settings = res.data || settings;
      showToast('Настройки сохранены');
      haptic('success');
      profileTab.refresh();
      loadOverview();
    }).catch(function(err) {
      showToast(err.message || 'Ошибка сохранения настроек', 'error');
    });
  }

  // Выдача доступа используется как из отдельного раздела, так и из карточки пользователя.
  function grantAccess() {
    var telegramId = parseInt(document.getElementById('admin-telegram-id').value, 10);
    var daysRaw = document.getElementById('admin-days').value;
    var note = document.getElementById('admin-note').value.trim();

    if (!telegramId || telegramId <= 0) {
      showToast('Укажите Telegram ID', 'error');
      return;
    }

    api.grantAccess({
      telegram_id: telegramId,
      days: daysRaw ? parseInt(daysRaw, 10) : null,
      note: note
    }).then(function() {
      showToast('Доступ выдан');
      haptic('success');
      document.getElementById('admin-telegram-id').value = '';
      document.getElementById('admin-days').value = '';
      document.getElementById('admin-note').value = '';
      loadAdminEntitlements();
      resetUserPagination();
      loadAdminUsers();
      loadOverview();
    }).catch(function(err) {
      showToast(err.message || 'Ошибка выдачи доступа', 'error');
    });
  }

  // Отзыв доступа подтверждается, потому что влияет на Premium/Gifted статус пользователя.
  function revokeAccess(telegramId) {
    if (!confirm('Отозвать доступ у пользователя ' + telegramId + '?')) return;
    api.revokeAccess(telegramId).then(function() {
      showToast('Доступ отозван');
      haptic('success');
      loadAdminEntitlements();
      resetUserPagination();
      loadAdminUsers();
      loadOverview();
    }).catch(function() {
      showToast('Не удалось отозвать доступ', 'error');
    });
  }

  // Список выданных доступов живет отдельно от общего списка пользователей.
  function loadAdminEntitlements() {
    if (!currentAccess || !currentAccess.is_admin) return;

    api.getEntitlements().then(function(res) {
      var rows = res.data.entitlements || [];
      var container = document.getElementById('admin-entitlements');

      if (rows.length === 0) {
        container.innerHTML = '<div class="admin-empty">Пока никому не выдан доступ</div>';
        return;
      }

      container.innerHTML = rows.map(function(row) {
        return '<div class="admin-row">' +
          '<div class="admin-row-main">' +
            '<div class="admin-row-id">' + row.telegram_id + '</div>' +
            '<div class="admin-row-meta">' + escapeHtml(formatEntitlementMeta(row)) + '</div>' +
          '</div>' +
          '<button class="btn btn-danger btn-small admin-revoke" data-id="' + row.telegram_id + '">Отозвать</button>' +
        '</div>';
      }).join('');
    }).catch(function() {
      showToast('Не удалось загрузить доступы', 'error');
    });
  }

  // Пользователи грузятся страницами по 25 записей.
  function loadAdminUsers(append) {
    if (!currentAccess || !currentAccess.is_admin) return;

    var query = document.getElementById('admin-user-search').value.trim();
    api.getAdminUsers(query, userFilter, usersLimit, usersOffset).then(function(res) {
      var data = res.data || {};
      usersHasMore = Boolean(data.has_more);
      usersTotal = data.total || 0;
      renderUserList(document.getElementById('admin-users'), data.users || [], '', Boolean(append));
      renderUsersPagination((data.offset || 0) + (data.users || []).length);
    }).catch(function() {
      showToast('Не удалось загрузить пользователей', 'error');
    });
  }

  // Раздел лимитов отдельно показывает всех заблокированных пользователей.
  function loadBlockedUsers() {
    api.getAdminUsers('', 'blocked', 100, 0).then(function(res) {
      renderUserList(document.getElementById('admin-blocked-users'), res.data.users || [], 'Заблокированных пользователей нет');
    }).catch(function() {
      document.getElementById('admin-blocked-users').innerHTML = '<div class="admin-empty">Не удалось загрузить список</div>';
    });
  }

  // Любой новый поиск/фильтр начинает список пользователей с первой страницы.
  function resetUserPagination() {
    usersOffset = 0;
    usersHasMore = false;
    usersTotal = 0;
    document.getElementById('admin-users-pagination').innerHTML = '';
  }

  // При append=true новые пользователи добавляются к уже показанным строкам.
  function renderUserList(container, rows, emptyText, append) {
    if (rows.length === 0) {
      if (!append) {
        container.innerHTML = '<div class="admin-empty">' + escapeHtml(emptyText || 'Пользователей пока нет') + '</div>';
      }
      return;
    }

    var html = rows.map(function(user) {
      var state = [];
      if (user.is_blocked) state.push('заблокирован');
      if (user.deleted_at) state.push('удален');
      return '<button class="admin-user-row" type="button" data-id="' + user.telegram_id + '">' +
        '<div class="admin-row-main">' +
          '<div class="admin-row-id">' + escapeHtml(formatUserName(user)) + '</div>' +
          '<div class="admin-row-meta">' + escapeHtml(formatUserMeta(user)) + '</div>' +
          (state.length ? '<div class="admin-row-warning">' + escapeHtml(state.join(' · ')) + '</div>' : '') +
        '</div>' +
        '<span class="access-badge' + (user.has_premium ? ' premium' : '') + '">' + escapeHtml(formatAccessLabel(user)) + '</span>' +
      '</button>';
    }).join('');

    container.innerHTML = append ? container.innerHTML + html : html;
  }

  // Мини-пагинация сделана кнопкой "Показать еще", удобной для Mini App.
  function renderUsersPagination(shown) {
    var container = document.getElementById('admin-users-pagination');
    if (!usersTotal) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = '<div class="admin-pagination-note">Показано ' + shown + ' из ' + usersTotal + '</div>' +
      (usersHasMore ? '<button class="btn btn-secondary btn-small admin-load-more" type="button">Показать еще</button>' : '');
  }

  // Карточка пользователя открывается из любого списка админки.
  function openUserCard(telegramId) {
    api.getAdminUser(telegramId).then(function(res) {
      renderUserCard(res.data);
      haptic('light');
    }).catch(function(err) {
      showToast(err.message || 'Не удалось открыть пользователя', 'error');
    });
  }

  // Карточка объединяет статус, активность, доступы, платежи и опасные действия.
  function renderUserCard(data) {
    var user = data.user;
    var entitlement = data.entitlement;
    var payments = data.payments || [];
    var card = document.getElementById('admin-user-card');
    var dangerText = user.deleted_at ? 'Восстановить' : 'Удалить';
    var blockText = user.is_blocked ? 'Разблокировать' : 'Заблокировать';

    card.classList.remove('hidden');
    card.innerHTML = '<div class="section-header-row">' +
        '<div><h3>' + escapeHtml(formatUserName(user)) + '</h3><p class="section-note">ID: ' + user.telegram_id + '</p></div>' +
        '<button class="btn btn-secondary btn-small admin-card-close" type="button">Закрыть</button>' +
      '</div>' +
      '<div class="admin-user-facts">' +
        fact('Статус', formatAccessLabel(user)) +
        fact('Сегодня', (user.today_analysis_count || 0) + ' анализов') +
        fact('Первый вход', user.first_seen_at || '-') +
        fact('Последний вход', user.last_seen_at || '-') +
        fact('Доступ', entitlement ? formatEntitlementMeta(entitlement) : 'нет подаренного доступа') +
        fact('Платежи', payments.length ? payments.length + ' последних записей' : 'нет платежей') +
      '</div>' +
      '<label class="field-label" for="admin-user-note">Заметка админа</label>' +
      '<textarea class="textarea" id="admin-user-note" rows="2" placeholder="Внутренняя заметка">' + escapeHtml(user.admin_note || '') + '</textarea>' +
      '<div class="admin-card-actions">' +
        '<button class="btn btn-primary btn-small admin-card-grant" type="button" data-id="' + user.telegram_id + '">Выдать доступ</button>' +
        (entitlement ? '<button class="btn btn-outline btn-small admin-card-revoke" type="button" data-id="' + user.telegram_id + '">Отозвать доступ</button>' : '') +
        '<button class="btn btn-outline btn-small admin-card-note" type="button" data-id="' + user.telegram_id + '">Сохранить заметку</button>' +
        '<button class="btn btn-outline btn-small admin-card-block" type="button" data-id="' + user.telegram_id + '">' + blockText + '</button>' +
        '<button class="btn btn-danger btn-small admin-card-delete" type="button" data-id="' + user.telegram_id + '">' + dangerText + '</button>' +
      '</div>';
  }

  function fact(label, value) {
    return '<div class="admin-user-fact"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
  }

  // Все действия карточки пользователя собраны в одном обработчике.
  function handleUserCardClick(e) {
    var close = e.target.closest('.admin-card-close');
    if (close) {
      document.getElementById('admin-user-card').classList.add('hidden');
      return;
    }

    var grant = e.target.closest('.admin-card-grant');
    if (grant) {
      document.getElementById('admin-telegram-id').value = grant.dataset.id;
      switchPanel('access');
      showToast('ID подставлен в выдачу доступа');
      return;
    }

    var note = e.target.closest('.admin-card-note');
    if (note) {
      api.updateAdminUserFlags(note.dataset.id, {
        admin_note: document.getElementById('admin-user-note').value
      }).then(function(res) {
        renderUserCard(res.data);
        showToast('Заметка сохранена');
      }).catch(function(err) {
        showToast(err.message || 'Не удалось сохранить заметку', 'error');
      });
      return;
    }

    var revoke = e.target.closest('.admin-card-revoke');
    if (revoke) {
      revokeAccess(revoke.dataset.id);
      document.getElementById('admin-user-card').classList.add('hidden');
      return;
    }

    var block = e.target.closest('.admin-card-block');
    if (block) {
      toggleBlock(block.dataset.id);
      return;
    }

    var del = e.target.closest('.admin-card-delete');
    if (del) {
      toggleDelete(del.dataset.id);
    }
  }

  // Блокировка запрещает пользователю AI-анализ и оплату Premium.
  function toggleBlock(telegramId) {
    api.getAdminUser(telegramId).then(function(res) {
      var user = res.data.user;
      if (user.is_blocked) {
        return api.unblockAdminUser(telegramId);
      }

      if (!confirm('Заблокировать AI и оплату для пользователя ' + telegramId + '?')) return null;
      return api.blockAdminUser(telegramId, { reason: 'manual_admin_block' });
    }).then(function(res) {
      if (!res) return;
      renderUserCard(res.data);
      resetUserPagination();
      loadAdminUsers();
      loadBlockedUsers();
      loadOverview();
      showToast('Статус пользователя обновлен');
    }).catch(function(err) {
      showToast(err.message || 'Не удалось обновить блокировку', 'error');
    });
  }

  // Мягкое удаление скрывает пользователя из обычного списка без физического удаления данных.
  function toggleDelete(telegramId) {
    api.getAdminUser(telegramId).then(function(res) {
      var user = res.data.user;
      if (user.deleted_at) {
        return api.restoreAdminUser(telegramId);
      }

      if (!confirm('Скрыть пользователя ' + telegramId + ' из обычных списков?')) return null;
      return api.softDeleteAdminUser(telegramId);
    }).then(function(res) {
      if (!res) return;
      renderUserCard(res.data);
      resetUserPagination();
      loadAdminUsers();
      loadOverview();
      showToast('Статус пользователя обновлен');
    }).catch(function(err) {
      showToast(err.message || 'Не удалось изменить пользователя', 'error');
    });
  }

  // Платежи показываются в обзоре коротко и в монетизации полным списком.
  function loadAdminPayments(containerId, limit) {
    api.getAdminPayments().then(function(res) {
      var rows = res.data.payments || [];
      if (limit) rows = rows.slice(0, limit);
      var container = document.getElementById(containerId);

      if (rows.length === 0) {
        container.innerHTML = '<div class="admin-empty">Платежей пока нет</div>';
        return;
      }

      container.innerHTML = rows.map(function(payment) {
        return '<div class="admin-row">' +
          '<div class="admin-row-main">' +
            '<div class="admin-row-id">' + escapeHtml(formatUserName(payment)) + '</div>' +
            '<div class="admin-row-meta">' + escapeHtml(formatPaymentMeta(payment)) + '</div>' +
          '</div>' +
          '<span class="access-badge' + (payment.status === 'paid' ? ' premium' : '') + '">' + escapeHtml(payment.status) + '</span>' +
        '</div>';
      }).join('');
    }).catch(function() {
      document.getElementById(containerId).innerHTML = '<div class="admin-empty">Не удалось загрузить платежи</div>';
    });
  }

  function formatUserName(user) {
    var name = [user.first_name, user.last_name].filter(Boolean).join(' ');
    if (user.username) name += name ? ' @' + user.username : '@' + user.username;
    return name || 'Пользователь';
  }

  function formatUserMeta(user) {
    var parts = [];
    parts.push('ID: ' + user.telegram_id);
    parts.push('анализов сегодня: ' + (user.today_analysis_count || 0));
    if (user.last_seen_at) parts.push('был: ' + user.last_seen_at);
    return parts.join(' · ');
  }

  function formatAccessLabel(user) {
    if (user.access_type === 'owner') return 'Owner';
    if (user.access_type === 'gifted') return 'Gifted';
    if (user.access_type === 'subscription') return 'Premium';
    return 'Free';
  }

  function formatEntitlementMeta(row) {
    var parts = [];
    parts.push(row.type);
    parts.push(row.expires_at ? 'до ' + row.expires_at : 'бессрочно');
    if (row.note) parts.push(row.note);
    if (row.granted_by) parts.push('выдал: ' + row.granted_by);
    return parts.join(' · ');
  }

  function formatPaymentMeta(payment) {
    var parts = [];
    parts.push('ID: ' + payment.telegram_id);
    parts.push((payment.amount_stars || 0) + ' Stars');
    parts.push(payment.plan || 'premium_month');
    if (payment.paid_at) parts.push('оплачен: ' + payment.paid_at);
    else if (payment.created_at) parts.push('создан: ' + payment.created_at);
    return parts.join(' · ');
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  return { init: init, show: show, refresh: loadAdmin };
})();
