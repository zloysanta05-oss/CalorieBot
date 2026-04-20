const crypto = require('crypto');
const db = require('../db');
const { getAccessStatus } = require('./access');

// Период подписки Telegram Stars: 30 дней в секундах.
const SUBSCRIPTION_SECONDS = 2592000; // Подписка Telegram Stars длится 30 дней.

const getSettingsStmt = db.prepare('SELECT * FROM monetization_settings WHERE id = 1');
const updateSettingsStmt = db.prepare(`
  UPDATE monetization_settings
  SET premium_stars = ?, free_daily_limit = ?, updated_by = ?, updated_at = datetime('now')
  WHERE id = 1
`);

const getUsageStmt = db.prepare('SELECT * FROM usage_daily WHERE telegram_id = ? AND date = ?');
const incrementUsageStmt = db.prepare(`
  INSERT INTO usage_daily (telegram_id, date, analysis_count, updated_at)
  VALUES (?, ?, 1, datetime('now'))
  ON CONFLICT(telegram_id, date) DO UPDATE SET
    analysis_count = analysis_count + 1,
    updated_at = datetime('now')
`);

const createPaymentStmt = db.prepare(`
  INSERT INTO payments (telegram_id, payload, plan, amount_stars, status)
  VALUES (?, ?, ?, ?, 'pending')
`);

const getPaymentByPayloadStmt = db.prepare('SELECT * FROM payments WHERE payload = ?');
const markPaymentPaidStmt = db.prepare(`
  UPDATE payments
  SET status = 'paid',
      telegram_payment_charge_id = ?,
      provider_payment_charge_id = ?,
      raw_payment = ?,
      paid_at = datetime('now')
  WHERE payload = ?
`);

const upsertSubscriptionEntitlementStmt = db.prepare(`
  INSERT INTO entitlements (telegram_id, type, granted_by, expires_at, note, created_at, updated_at)
  VALUES (?, 'subscription', NULL, ?, 'Telegram Stars subscription', datetime('now'), datetime('now'))
  ON CONFLICT(telegram_id) DO UPDATE SET
    type = 'subscription',
    expires_at = excluded.expires_at,
    note = excluded.note,
    updated_at = datetime('now')
`);

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Приводим JS Date к формату SQLite datetime.
function sqliteDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function getSettings() {
  return getSettingsStmt.get() || { premium_stars: 100, free_daily_limit: 3 };
}

// Только админ может менять цену Premium и бесплатный дневной лимит.
function updateSettings(input, adminId) {
  const premiumStars = Number(input.premium_stars);
  const freeDailyLimit = Number(input.free_daily_limit);

  if (!Number.isInteger(premiumStars) || premiumStars < 1 || premiumStars > 10000) {
    throw new Error('Premium price must be 1-10000 Stars');
  }

  if (!Number.isInteger(freeDailyLimit) || freeDailyLimit < 0 || freeDailyLimit > 100) {
    throw new Error('Free daily limit must be 0-100');
  }

  updateSettingsStmt.run(premiumStars, freeDailyLimit, Number(adminId) || null);
  return getSettings();
}

// Возвращает, сколько бесплатных анализов пользователь уже потратил сегодня.
function getUsage(userId, date) {
  const settings = getSettings();
  const row = getUsageStmt.get(Number(userId), date || todayStr());
  const used = row ? row.analysis_count : 0;

  return {
    used,
    free_daily_limit: settings.free_daily_limit,
    remaining: Math.max(0, settings.free_daily_limit - used)
  };
}

// Единая модель доступа для UI: статус Premium, лимит, цена и can_analyze.
function getPlanForUser(userId) {
  const access = getAccessStatus(userId);
  const settings = getSettings();
  const usage = getUsage(userId);

  return {
    access,
    settings,
    usage,
    can_analyze: access.has_premium || usage.remaining > 0
  };
}

// Проверка перед дорогим AI-вызовом: лимит должен отсеиваться до OpenAI.
function assertCanAnalyze(userId) {
  const plan = getPlanForUser(userId);
  if (!plan.can_analyze) {
    const err = new Error('Daily free limit reached');
    err.statusCode = 402;
    err.code = 'free_limit_reached';
    err.plan = plan;
    throw err;
  }

  return plan;
}

// Счетчик увеличивается только для free-пользователей.
function recordAnalysis(userId) {
  const access = getAccessStatus(userId);
  if (access.has_premium) return getUsage(userId);

  incrementUsageStmt.run(Number(userId), todayStr());
  return getUsage(userId);
}

// Создаем локальный pending-платеж перед созданием invoice в Telegram.
function createPaymentIntent(userId, plan) {
  const settings = getSettings();
  const selectedPlan = plan || 'premium_month';
  if (selectedPlan !== 'premium_month') {
    throw new Error('Unknown plan');
  }

  const payload = `sub:${Number(userId)}:${crypto.randomBytes(6).toString('hex')}`;
  createPaymentStmt.run(Number(userId), payload, selectedPlan, settings.premium_stars);

  return {
    payload,
    plan: selectedPlan,
    amount_stars: settings.premium_stars,
    subscription_period: SUBSCRIPTION_SECONDS
  };
}

// Запрос перед оплатой и successful_payment сверяются с локальным ожидающим платежом.
function validatePaymentPayload(payload, currency, totalAmount) {
  const payment = getPaymentByPayloadStmt.get(payload);
  if (!payment || payment.status !== 'pending') {
    return { ok: false, error: 'Order not found or already paid' };
  }

  if (currency !== 'XTR') {
    return { ok: false, error: 'Invalid payment currency' };
  }

  if (Number(totalAmount) !== Number(payment.amount_stars)) {
    return { ok: false, error: 'Invalid payment amount' };
  }

  return { ok: true, payment };
}

// Успешная оплата продлевает/выдает subscription entitlement.
function markSuccessfulPayment(successfulPayment, fallbackUserId) {
  const validation = validatePaymentPayload(
    successfulPayment.invoice_payload,
    successfulPayment.currency,
    successfulPayment.total_amount
  );
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const payload = successfulPayment.invoice_payload;
  const payment = validation.payment;

  markPaymentPaidStmt.run(
    successfulPayment.telegram_payment_charge_id || null,
    successfulPayment.provider_payment_charge_id || null,
    JSON.stringify(successfulPayment),
    payload
  );

  const now = new Date();
  const currentAccess = getAccessStatus(payment.telegram_id || fallbackUserId);
  let base = now;
  if (currentAccess.expires_at) {
    const currentExpiry = new Date(currentAccess.expires_at.replace(' ', 'T') + 'Z');
    if (currentExpiry > now) base = currentExpiry;
  }

  const expires = new Date(base.getTime() + SUBSCRIPTION_SECONDS * 1000);
  upsertSubscriptionEntitlementStmt.run(payment.telegram_id, sqliteDate(expires));

  return {
    telegram_id: payment.telegram_id,
    expires_at: sqliteDate(expires)
  };
}

module.exports = {
  SUBSCRIPTION_SECONDS,
  getSettings,
  updateSettings,
  getUsage,
  getPlanForUser,
  assertCanAnalyze,
  recordAnalysis,
  createPaymentIntent,
  validatePaymentPayload,
  markSuccessfulPayment
};
