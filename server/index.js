require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const authMiddleware = require('./auth');
const payments = require('./routes/payments');

const app = express();
const PORT = process.env.PORT || 3000;

// Базовые middleware: CORS, JSON body и отдача статического Mini App.
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Webhook платежей вызывается Telegram Bot API, поэтому он живет вне /api auth.
app.post('/telegram/webhook', payments.telegramWebhook);

// Все API Mini App защищены Telegram initData, кроме development fallback.
app.use('/api', authMiddleware);

// Подключение функциональных API-модулей приложения.
app.use('/api', require('./routes/analyze'));
app.use('/api', require('./routes/meals'));
app.use('/api', require('./routes/goals'));
app.use('/api', require('./routes/stats'));
app.use('/api', require('./routes/access'));
app.use('/api', payments.router);
app.use('/api', require('./routes/favorites'));
app.use('/api', require('./routes/pantry'));
app.use('/api', require('./routes/inventory'));
app.use('/api', require('./routes/recipes'));
app.use('/api', require('./routes/shopping'));

// Резервный ответ для SPA: любые неизвестные пути возвращают основной index.html.
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CalorieBot server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
});
