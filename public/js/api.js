// API client with Telegram initData header

var api = (function() {
  var tg = window.Telegram && window.Telegram.WebApp;
  var initData = tg ? tg.initData : '';

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
    analyzePhoto: function(file) {
      var formData = new FormData();
      formData.append('photo', file);
      return request('POST', '/api/analyze-photo', formData, true);
    },

    analyzeText: function(description) {
      return request('POST', '/api/analyze-text', { description: description });
    },

    saveMeal: function(data) {
      return request('POST', '/api/meals', data);
    },

    getMeals: function(date) {
      return request('GET', '/api/meals?date=' + encodeURIComponent(date));
    },

    deleteMeal: function(id) {
      return request('DELETE', '/api/meals/' + id);
    },

    getGoals: function() {
      return request('GET', '/api/goals');
    },

    setGoal: function(dailyCalories) {
      return request('PUT', '/api/goals', { daily_calories: dailyCalories });
    },

    getStats: function(period) {
      return request('GET', '/api/stats?period=' + encodeURIComponent(period || 'day'));
    },

    getWeekStats: function() {
      return request('GET', '/api/stats?period=week');
    }
  };
})();
