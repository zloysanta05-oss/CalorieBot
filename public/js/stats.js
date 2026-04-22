// Логика вкладок «Профиль» и «Админ».

var profileTab = (function() {
  var currentGoal = 2000;
  var calculatedGoal = null;
  var calcStorageKey = 'profileCalorieCalculator';

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

  function showCalculatorScreen() {
    document.getElementById('calc-goal-input').value = calculatedGoal || currentGoal;
    document.getElementById('profile-main').classList.add('hidden');
    document.getElementById('profile-calculator-screen').classList.remove('hidden');
  }

  function showProfileMain() {
    document.getElementById('profile-calculator-screen').classList.add('hidden');
    document.getElementById('profile-main').classList.remove('hidden');
  }

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

  function renderUser(user) {
    var name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    if (!name && user.username) name = '@' + user.username;
    if (!name) name = 'Пользователь Telegram';

    var meta = user.username && name.indexOf('@' + user.username) === -1 ? ' @' + user.username : '';
    document.getElementById('profile-user-name').textContent = name + meta;
    document.getElementById('profile-avatar').textContent = name.trim().charAt(0).toLocaleUpperCase('ru-RU');
  }

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
  var currentAccess = null;

  function init() {
    document.getElementById('btn-save-monetization').addEventListener('click', saveMonetization);
    document.getElementById('btn-grant-access').addEventListener('click', grantAccess);

    document.getElementById('admin-entitlements').addEventListener('click', function(e) {
      var btn = e.target.closest('.admin-revoke');
      if (!btn) return;

      api.revokeAccess(btn.dataset.id).then(function() {
        showToast('Доступ отозван');
        haptic('success');
        loadAdminEntitlements();
      }).catch(function() {
        showToast('Не удалось отозвать доступ', 'error');
      });
    });

    document.getElementById('admin-users').addEventListener('click', function(e) {
      var row = e.target.closest('.admin-user-row');
      if (!row) return;

      document.getElementById('admin-telegram-id').value = row.dataset.id;
      showToast('Telegram ID подставлен');
      haptic('light');
    });
  }

  function show() {
    loadAdmin();
  }

  function loadAdmin() {
    api.getMonetization().then(function(res) {
      currentAccess = res.data.access;
      if (!currentAccess || !currentAccess.is_admin) {
        document.getElementById('admin-users').innerHTML = '<div class="admin-empty">Нет прав администратора</div>';
        document.getElementById('admin-entitlements').innerHTML = '';
        return;
      }

      document.getElementById('admin-premium-stars').value = res.data.settings.premium_stars;
      document.getElementById('admin-free-limit').value = res.data.settings.free_daily_limit;
      loadAdminUsers();
      loadAdminEntitlements();
    }).catch(function() {
      showToast('Не удалось загрузить админку', 'error');
    });
  }

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
    }).then(function() {
      showToast('Цены сохранены');
      haptic('success');
      profileTab.refresh();
    }).catch(function(err) {
      showToast(err.message || 'Ошибка сохранения цен', 'error');
    });
  }

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
      loadAdminUsers();
    }).catch(function(err) {
      showToast(err.message || 'Ошибка выдачи доступа', 'error');
    });
  }

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

  function loadAdminUsers() {
    if (!currentAccess || !currentAccess.is_admin) return;

    api.getAdminUsers().then(function(res) {
      var rows = res.data.users || [];
      var container = document.getElementById('admin-users');

      if (rows.length === 0) {
        container.innerHTML = '<div class="admin-empty">Пользователей пока нет</div>';
        return;
      }

      container.innerHTML = rows.map(function(user) {
        return '<button class="admin-user-row" type="button" data-id="' + user.telegram_id + '">' +
          '<div class="admin-row-main">' +
            '<div class="admin-row-id">' + escapeHtml(formatUserName(user)) + '</div>' +
            '<div class="admin-row-meta">' + escapeHtml(formatUserMeta(user)) + '</div>' +
          '</div>' +
          '<span class="access-badge' + (user.has_premium ? ' premium' : '') + '">' + escapeHtml(formatAccessLabel(user)) + '</span>' +
        '</button>';
      }).join('');
    }).catch(function() {
      showToast('Не удалось загрузить пользователей', 'error');
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

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  return { init: init, show: show, refresh: loadAdmin };
})();
