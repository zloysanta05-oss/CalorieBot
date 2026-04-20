// Stats tab logic

var statsTab = (function() {
  var currentGoal = 2000;
  var currentAccess = null;
  var currentMonetization = null;

  function init() {
    document.getElementById('btn-save-goal').addEventListener('click', function() {
      var val = parseInt(document.getElementById('goal-input').value, 10);
      if (!val || val < 500 || val > 10000) {
        showToast('Укажите цель от 500 до 10000 ккал', 'error');
        return;
      }
      api.setGoal(val).then(function() {
        currentGoal = val;
        showToast('Цель сохранена!');
        haptic('success');
        loadStats();
      }).catch(function() {
        showToast('Ошибка сохранения', 'error');
      });
    });

    document.getElementById('btn-buy-premium').addEventListener('click', function() {
      buyPremium();
    });

    document.getElementById('btn-save-monetization').addEventListener('click', function() {
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
        loadStats();
      }).catch(function(err) {
        showToast(err.message || 'Ошибка сохранения цен', 'error');
      });
    });

    document.getElementById('btn-grant-access').addEventListener('click', function() {
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
      }).catch(function(err) {
        showToast(err.message || 'Ошибка выдачи доступа', 'error');
      });
    });

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
  }

  function show() {
    loadStats();
  }

  function loadStats() {
    Promise.all([
      api.getStats('day'),
      api.getWeekStats(),
      api.getGoals(),
      api.getMonetization()
    ]).then(function(results) {
      var dayRes = results[0];
      var weekRes = results[1];
      var goalsRes = results[2];
      var monetizationRes = results[3];

      currentGoal = goalsRes.data.daily_calories || 2000;
      document.getElementById('goal-input').value = currentGoal;
      currentMonetization = monetizationRes.data;
      currentAccess = monetizationRes.data.access;

      if (dayRes.success) renderDayStats(dayRes.data);
      if (weekRes.success) renderWeekChart(weekRes.data);
      if (monetizationRes.success) renderAccess(monetizationRes.data);
    }).catch(function() {
      showToast('Не удалось загрузить статистику', 'error');
    });
  }

  function renderAccess(plan) {
    var data = plan.access;
    var usage = plan.usage;
    var settings = plan.settings;
    var badge = document.getElementById('access-badge');
    var text = document.getElementById('access-status-text');
    var adminSection = document.getElementById('admin-section');
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

    if (data.is_admin) {
      adminSection.classList.remove('hidden');
      document.getElementById('admin-premium-stars').value = settings.premium_stars;
      document.getElementById('admin-free-limit').value = settings.free_daily_limit;
      loadAdminEntitlements();
    } else {
      adminSection.classList.add('hidden');
    }
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
            setTimeout(loadStats, 1200);
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

  function loadAdminEntitlements() {
    if (!currentAccess || !currentAccess.is_admin) return;

    api.getEntitlements().then(function(res) {
      var rows = res.data.entitlements || [];
      var container = document.getElementById('admin-entitlements');

      if (rows.length === 0) {
        container.innerHTML = '<div class="admin-empty">Пока никому не выдан доступ</div>';
        return;
      }

      var html = '';
      rows.forEach(function(row) {
        html += '<div class="admin-row">' +
          '<div class="admin-row-main">' +
            '<div class="admin-row-id">' + row.telegram_id + '</div>' +
            '<div class="admin-row-meta">' + escapeHtml(formatEntitlementMeta(row)) + '</div>' +
          '</div>' +
          '<button class="btn btn-danger btn-small admin-revoke" data-id="' + row.telegram_id + '">Отозвать</button>' +
        '</div>';
      });

      container.innerHTML = html;
    }).catch(function() {
      showToast('Не удалось загрузить доступы', 'error');
    });
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
    div.textContent = text;
    return div.innerHTML;
  }

  function renderDayStats(data) {
    var totals = data.totals || { calories: 0, protein: 0, fat: 0, carbs: 0 };
    var goal = data.goal || currentGoal;
    var cals = Math.round(totals.calories);

    document.getElementById('stats-today-cals').textContent = cals;
    document.getElementById('stats-today-label').textContent = 'из ' + goal + ' ккал';

    var remaining = Math.max(0, goal - cals);
    document.getElementById('stats-remaining-text').textContent =
      cals >= goal ? 'Цель достигнута!' : 'Осталось ' + remaining + ' ккал';

    var pct = Math.min(1, cals / goal);
    var circumference = 2 * Math.PI * 70;
    var offset = circumference * (1 - pct);
    var ring = document.getElementById('ring-progress');
    ring.style.strokeDashoffset = offset;
    ring.style.stroke = cals > goal ? 'var(--danger)' : 'var(--link)';

    document.getElementById('stats-protein').textContent = Math.round(totals.protein || 0) + ' г';
    document.getElementById('stats-fat').textContent = Math.round(totals.fat || 0) + ' г';
    document.getElementById('stats-carbs').textContent = Math.round(totals.carbs || 0) + ' г';
  }

  function renderWeekChart(data) {
    var days = data.days || [];
    var goal = data.goal || currentGoal;
    var container = document.getElementById('week-chart-bars');

    if (days.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Нет данных за неделю</p></div>';
      return;
    }

    var maxVal = Math.max(goal, Math.max.apply(null, days.map(function(d) { return d.calories; })));
    if (maxVal === 0) maxVal = goal;

    var html = '<div class="chart-goal-line" style="bottom:' + Math.round(goal / maxVal * 100) + '%"></div>';

    days.forEach(function(day) {
      var heightPct = maxVal > 0 ? Math.round(day.calories / maxVal * 100) : 0;
      var isOver = day.calories > goal;
      html += '<div class="chart-bar-wrapper">' +
        '<div class="chart-bar' + (isOver ? ' over' : '') + '" style="height:' + Math.max(heightPct, 1) + '%"' +
        ' title="' + Math.round(day.calories) + ' ккал"></div>' +
        '<div class="chart-bar-label">' + formatShortDate(day.date) + '</div>' +
      '</div>';
    });

    container.innerHTML = html;
  }

  return { init: init, show: show };
})();
