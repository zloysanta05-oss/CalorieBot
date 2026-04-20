async function callTelegram(method, body) {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    throw new Error('BOT_TOKEN is not configured');
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.description || `Telegram API ${method} failed`);
  }

  return data.result;
}

async function createStarsSubscriptionInvoice(intent) {
  return callTelegram('createInvoiceLink', {
    title: 'CalorieBot Premium',
    description: '30 дней безлимитного анализа еды',
    payload: intent.payload,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: 'Premium на 30 дней', amount: intent.amount_stars }],
    subscription_period: intent.subscription_period
  });
}

async function answerPreCheckoutQuery(id, ok, errorMessage) {
  return callTelegram('answerPreCheckoutQuery', {
    pre_checkout_query_id: id,
    ok,
    error_message: errorMessage
  });
}

module.exports = {
  createStarsSubscriptionInvoice,
  answerPreCheckoutQuery
};
