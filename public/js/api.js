// API-клиент добавляет Telegram initData в каждый запрос Mini App.

var api = (function() {
  var tg = window.Telegram && window.Telegram.WebApp;
  var initData = tg ? tg.initData : '';

  // Общая обертка над fetch: JSON-сериализация и единая обработка ошибок.
  function request(method, url, body, isFormData) {
    var headers = {};
    if (initData) {
      headers['X-Telegram-Init-Data'] = initData;
    }
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    var opts = {
      method: method,
      headers: headers
    };

    if (body) {
      opts.body = isFormData ? body : JSON.stringify(body);
    }

    return fetch(url, opts).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok && !data.success) {
          throw new Error(data.message || data.error || 'Request failed');
        }
        return data;
      });
    });
  }

  return {
    // Анализ фото отправляется multipart/form-data.
    analyzePhoto: function(file, note) {
      var formData = new FormData();
      formData.append('photo', file);
      if (note) formData.append('note', note);
      return request('POST', '/api/analyze-photo', formData, true);
    },

    // Анализ текстового описания блюда.
    analyzeText: function(description) {
      return request('POST', '/api/analyze-text', { description: description });
    },

    // Дневник питания.
    saveMeal: function(data) {
      return request('POST', '/api/meals', data);
    },

    getMeals: function(date) {
      return request('GET', '/api/meals?date=' + encodeURIComponent(date));
    },

    deleteMeal: function(id) {
      return request('DELETE', '/api/meals/' + id);
    },

    updateMeal: function(id, data) {
      return request('PUT', '/api/meals/' + encodeURIComponent(id), data);
    },

    // Цели, статистика и монетизация.
    getGoals: function() {
      return request('GET', '/api/goals');
    },

    setGoal: function(dailyCalories) {
      return request('PUT', '/api/goals', { daily_calories: dailyCalories });
    },

    getStats: function(period, date) {
      var url = '/api/stats?period=' + encodeURIComponent(period || 'day');
      if (date) {
        url += '&date=' + encodeURIComponent(date);
      }
      return request('GET', url);
    },

    getWeekStats: function(from, to) {
      var url = '/api/stats?period=week';
      if (from && to) {
        url += '&from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to);
      }
      return request('GET', url);
    },

    // Админские методы доступа и пользователей.
    getAccess: function() {
      return request('GET', '/api/access');
    },

    getEntitlements: function() {
      return request('GET', '/api/admin/entitlements');
    },

    getAdminOverview: function() {
      return request('GET', '/api/admin/overview');
    },

    getAdminPayments: function() {
      return request('GET', '/api/admin/payments');
    },

    getAdminUsers: function(query, filter, limit, offset) {
      var url = '/api/admin/users';
      var params = [];
      if (query) params.push('query=' + encodeURIComponent(query));
      if (filter) params.push('filter=' + encodeURIComponent(filter));
      if (limit) params.push('limit=' + encodeURIComponent(limit));
      if (offset) params.push('offset=' + encodeURIComponent(offset));
      if (params.length) url += '?' + params.join('&');
      return request('GET', url);
    },

    getAdminUser: function(telegramId) {
      return request('GET', '/api/admin/users/' + encodeURIComponent(telegramId));
    },

    updateAdminUserFlags: function(telegramId, data) {
      return request('PUT', '/api/admin/users/' + encodeURIComponent(telegramId) + '/flags', data);
    },

    blockAdminUser: function(telegramId, data) {
      return request('POST', '/api/admin/users/' + encodeURIComponent(telegramId) + '/block', data || {});
    },

    unblockAdminUser: function(telegramId) {
      return request('POST', '/api/admin/users/' + encodeURIComponent(telegramId) + '/unblock', {});
    },

    softDeleteAdminUser: function(telegramId) {
      return request('POST', '/api/admin/users/' + encodeURIComponent(telegramId) + '/delete', {});
    },

    restoreAdminUser: function(telegramId) {
      return request('POST', '/api/admin/users/' + encodeURIComponent(telegramId) + '/restore', {});
    },

    grantAccess: function(data) {
      return request('POST', '/api/admin/entitlements', data);
    },

    revokeAccess: function(telegramId) {
      return request('DELETE', '/api/admin/entitlements/' + encodeURIComponent(telegramId));
    },

    // Telegram Stars подписка.
    getMonetization: function() {
      return request('GET', '/api/monetization');
    },

    createSubscriptionInvoice: function() {
      return request('POST', '/api/payments/subscription-invoice', {});
    },

    getMonetizationSettings: function() {
      return request('GET', '/api/admin/monetization');
    },

    updateMonetizationSettings: function(data) {
      return request('PUT', '/api/admin/monetization', data);
    },

    getFavorites: function() {
      return request('GET', '/api/favorites');
    },

    addFavorite: function(data) {
      return request('POST', '/api/favorites', data);
    },

    deleteFavorite: function(id) {
      return request('DELETE', '/api/favorites/' + encodeURIComponent(id));
    },

    addFavoriteToDiary: function(id, data) {
      return request('POST', '/api/favorites/' + encodeURIComponent(id) + '/add-to-diary', data || {});
    },

    analyzePantryPhoto: function(file) {
      var formData = new FormData();
      formData.append('photo', file);
      return request('POST', '/api/pantry/analyze-photo', formData, true);
    },

    addPantryItem: function(sessionId, data) {
      return request('POST', '/api/pantry/sessions/' + encodeURIComponent(sessionId) + '/items', data);
    },

    updatePantryItem: function(id, data) {
      return request('PUT', '/api/pantry/items/' + encodeURIComponent(id), data);
    },

    deletePantryItem: function(id) {
      return request('DELETE', '/api/pantry/items/' + encodeURIComponent(id));
    },

    getInventory: function() {
      return request('GET', '/api/inventory');
    },

    addInventoryItem: function(data) {
      return request('POST', '/api/inventory', data);
    },

    updateInventoryItem: function(id, data) {
      return request('PUT', '/api/inventory/' + encodeURIComponent(id), data);
    },

    deleteInventoryItem: function(id) {
      return request('DELETE', '/api/inventory/' + encodeURIComponent(id));
    },

    consumeInventoryItem: function(id, data) {
      return request('POST', '/api/inventory/' + encodeURIComponent(id) + '/consume', data);
    },

    addInventoryFromPantrySession: function(sessionId) {
      return request('POST', '/api/inventory/from-pantry-session/' + encodeURIComponent(sessionId), {});
    },

    addInventoryFromShoppingItem: function(id) {
      return request('POST', '/api/inventory/from-shopping-item/' + encodeURIComponent(id), {});
    },

    generateRecipes: function(data) {
      return request('POST', '/api/recipes/generate', data);
    },

    addRecipeToDiary: function(id, data) {
      return request('POST', '/api/recipes/' + encodeURIComponent(id) + '/add-to-diary', data || {});
    },

    cookRecipe: function(id, data) {
      return request('POST', '/api/recipes/' + encodeURIComponent(id) + '/cook', data || {});
    },

    favoriteRecipe: function(id) {
      return request('POST', '/api/recipes/' + encodeURIComponent(id) + '/favorite', {});
    },

    createShoppingListFromRecipe: function(recipeId, data) {
      return request('POST', '/api/shopping-lists/from-recipe/' + encodeURIComponent(recipeId), data || {});
    },

    getCurrentShoppingList: function() {
      return request('GET', '/api/shopping-lists/current');
    },

    createShoppingList: function(data) {
      return request('POST', '/api/shopping-lists', data || {});
    },

    getShoppingList: function(id) {
      return request('GET', '/api/shopping-lists/' + encodeURIComponent(id));
    },

    addShoppingItem: function(listId, data) {
      return request('POST', '/api/shopping-lists/' + encodeURIComponent(listId) + '/items', data);
    },

    clearCheckedShoppingItems: function(listId) {
      return request('DELETE', '/api/shopping-lists/' + encodeURIComponent(listId) + '/checked-items');
    },

    updateShoppingItem: function(id, data) {
      return request('PUT', '/api/shopping-items/' + encodeURIComponent(id), data);
    },

    deleteShoppingItem: function(id) {
      return request('DELETE', '/api/shopping-items/' + encodeURIComponent(id));
    }
  };
})();
