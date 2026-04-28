const express = require('express');
const multer = require('multer');
const db = require('../db');
const { analyzePantryImage } = require('../services/openai');
const { assertCanAnalyze, recordAnalysis } = require('../services/monetization');

const router = express.Router();

// Фото продуктов не пишем на диск: сохраняем base64 только в SQLite-сессии подтверждения.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Pantry-сессия хранит исходное распознавание до переноса в постоянные остатки.
const insertSession = db.prepare(`
  INSERT INTO pantry_sessions (telegram_id, source, image_data)
  VALUES (?, ?, ?)
`);

const getSession = db.prepare('SELECT * FROM pantry_sessions WHERE id = ? AND telegram_id = ?');
const getItem = db.prepare(`
  SELECT i.*
  FROM pantry_items i
  JOIN pantry_sessions s ON s.id = i.session_id
  WHERE i.id = ? AND s.telegram_id = ?
`);

const listItems = db.prepare(`
  SELECT *
  FROM pantry_items
  WHERE session_id = ?
  ORDER BY id ASC
`);

const insertItem = db.prepare(`
  INSERT INTO pantry_items (session_id, name, quantity_text, category, confidence)
  VALUES (?, ?, ?, ?, ?)
`);

const updateItem = db.prepare(`
  UPDATE pantry_items
  SET name = ?, quantity_text = ?, category = ?, confidence = ?
  WHERE id = ?
`);

const deleteItem = db.prepare('DELETE FROM pantry_items WHERE id = ?');

// Пользователь может править распознанные продукты, поэтому валидируем каждую строку отдельно.
function normalizeItem(body) {
  const name = String(body.name || '').trim();
  if (!name) throw new Error('Name is required');

  return {
    name,
    quantity_text: String(body.quantity_text || '').trim(),
    category: String(body.category || 'другое').trim() || 'другое',
    confidence: ['high', 'medium', 'low'].includes(body.confidence) ? body.confidence : 'medium'
  };
}

// Дорогой AI-вызов проверяет freemium/Premium лимит до отправки фото модели.
router.post('/pantry/analyze-photo', upload.single('photo'), async (req, res) => {
  try {
    assertCanAnalyze(req.telegramUser.id);

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }

    const base64Data = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';
    const result = await analyzePantryImage(base64Data, mimeType);

    const sessionResult = insertSession.run(req.telegramUser.id, 'photo', base64Data);
    const sessionId = sessionResult.lastInsertRowid;

    result.items.forEach(item => {
      insertItem.run(sessionId, item.name, item.quantity_text, item.category, item.confidence);
    });

    const usage = recordAnalysis(req.telegramUser.id);
    res.json({
      success: true,
      data: {
        session: getSession.get(sessionId, req.telegramUser.id),
        items: listItems.all(sessionId)
      },
      usage
    });
  } catch (err) {
    if (err.code === 'user_blocked') {
      return res.status(err.statusCode).json({
        success: false,
        error: err.code,
        message: 'Доступ к анализу ограничен администратором.',
        data: err.plan
      });
    }

    if (err.code === 'free_limit_reached') {
      return res.status(err.statusCode).json({
        success: false,
        error: err.code,
        message: 'Бесплатный лимит на сегодня исчерпан. Оформите Premium, чтобы продолжить.',
        data: err.plan
      });
    }

    console.error('Pantry analysis error:', err.message);
    res.status(502).json({ success: false, error: 'ai_error', message: 'Не удалось распознать продукты' });
  }
});

// Возвращаем сессию и ее элементы для повторного открытия списка подтверждения.
router.get('/pantry/sessions/:id', (req, res) => {
  const session = getSession.get(parseInt(req.params.id, 10), req.telegramUser.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  res.json({ success: true, data: { session, items: listItems.all(session.id) } });
});

// Ручное добавление продукта в уже созданную pantry-сессию.
router.post('/pantry/sessions/:id/items', (req, res) => {
  try {
    const session = getSession.get(parseInt(req.params.id, 10), req.telegramUser.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const item = normalizeItem(req.body || {});
    const result = insertItem.run(session.id, item.name, item.quantity_text, item.category, item.confidence);
    res.json({ success: true, data: getItem.get(result.lastInsertRowid, req.telegramUser.id) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Редактирование строки распознавания перед переносом в inventory.
router.put('/pantry/items/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = getItem.get(id, req.telegramUser.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Item not found' });

    const item = normalizeItem(req.body || {});
    updateItem.run(item.name, item.quantity_text, item.category, item.confidence, id);
    res.json({ success: true, data: getItem.get(id, req.telegramUser.id) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Удаление лишнего распознанного продукта.
router.delete('/pantry/items/:id', (req, res) => {
  const item = getItem.get(parseInt(req.params.id, 10), req.telegramUser.id);
  if (!item) return res.status(404).json({ success: false, error: 'Item not found' });

  deleteItem.run(item.id);
  res.json({ success: true });
});

module.exports = router;
