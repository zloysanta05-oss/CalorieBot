const express = require('express');
const { isAdmin } = require('../services/access');
const {
  getPlanForUser,
  getSettings,
  updateSettings,
  createPaymentIntent,
  validatePaymentPayload,
  markSuccessfulPayment
} = require('../services/monetization');
const {
  createStarsSubscriptionInvoice,
  answerPreCheckoutQuery
} = require('../services/telegram');

const router = express.Router();

// Настройки монетизации может менять только администратор.
function requireAdmin(req, res, next) {
  if (!isAdmin(req.telegramUser.id)) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  next();
}

// Статус freemium/Premium для текущего пользователя и данные для UI.
router.get('/monetization', (req, res) => {
  res.json({
    success: true,
    data: getPlanForUser(req.telegramUser.id)
  });
});

// Создает Telegram Stars invoice для Premium-подписки.
router.post('/payments/subscription-invoice', async (req, res) => {
  try {
    const intent = createPaymentIntent(req.telegramUser.id, 'premium_month');
    const invoiceLink = await createStarsSubscriptionInvoice(intent);

    res.json({
      success: true,
      data: {
        invoice_link: invoiceLink,
        amount_stars: intent.amount_stars,
        subscription_period: intent.subscription_period
      }
    });
  } catch (err) {
    console.error('Create subscription invoice error:', err.message);
    res.status(err.statusCode || 500).json({
      success: false,
      error: err.code || 'invoice_error',
      message: err.code === 'user_blocked'
        ? 'Доступ ограничен администратором'
        : 'Не удалось создать счет на оплату'
    });
  }
});

// Получение текущих цен и лимитов для админки.
router.get('/admin/monetization', requireAdmin, (req, res) => {
  res.json({ success: true, data: getSettings() });
});

// Сохранение цены Premium и дневного free-лимита.
router.put('/admin/monetization', requireAdmin, (req, res) => {
  try {
    const settings = updateSettings(req.body || {}, req.telegramUser.id);
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Webhook Telegram: подтверждает запрос перед оплатой и выдает Premium после successful_payment.
async function telegramWebhook(req, res) {
  const update = req.body || {};

  try {
    if (update.pre_checkout_query) {
      const query = update.pre_checkout_query;
      const validation = validatePaymentPayload(query.invoice_payload, query.currency, query.total_amount);
      if (!validation.ok) {
        await answerPreCheckoutQuery(query.id, false, validation.error);
        return res.json({ ok: true });
      }

      await answerPreCheckoutQuery(query.id, true);
      return res.json({ ok: true });
    }

    const message = update.message || update.edited_message;
    if (message && message.successful_payment) {
      markSuccessfulPayment(message.successful_payment, message.from && message.from.id);
      return res.json({ ok: true });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err.message);

    if (update.pre_checkout_query) {
      try {
        await answerPreCheckoutQuery(update.pre_checkout_query.id, false, 'Не удалось обработать заказ');
      } catch (answerErr) {
        console.error('Pre-checkout reject error:', answerErr.message);
      }
    }

    res.json({ ok: true });
  }
}

module.exports = { router, telegramWebhook };
