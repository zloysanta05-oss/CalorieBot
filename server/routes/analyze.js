const express = require('express');
const multer = require('multer');
const { analyzeImage, analyzeText } = require('../services/openai');
const { assertCanAnalyze, recordAnalysis } = require('../services/monetization');

const router = express.Router();

// Загружаем фото в память: файл сразу передается в AI и не пишется на диск.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Анализ фото блюда. Free-лимит проверяется до вызова AI.
router.post('/analyze-photo', upload.single('photo'), async (req, res) => {
  try {
    assertCanAnalyze(req.telegramUser.id);

    let base64Data, mimeType;

    if (req.file) {
      base64Data = req.file.buffer.toString('base64');
      mimeType = req.file.mimetype || 'image/jpeg';
    } else if (req.body && req.body.image) {
      base64Data = req.body.image;
      mimeType = req.body.mimeType || 'image/jpeg';
    } else {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }

    const note = req.body && typeof req.body.note === 'string'
      ? req.body.note.trim().slice(0, 300)
      : '';

    const result = await analyzeImage(base64Data, mimeType, note);

    if (result.error) {
      return res.json({ success: false, error: result.error, message: result.message });
    }

    const usage = recordAnalysis(req.telegramUser.id);
    res.json({ success: true, data: result, usage });
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

    console.error('Photo analysis error:', err.message);
    res.status(502).json({
      success: false,
      error: 'ai_error',
      message: 'Не удалось проанализировать фото. Попробуйте ещё раз.'
    });
  }
});

// Анализ текстового описания блюда. Используется тот же лимит, что и для фото.
router.post('/analyze-text', async (req, res) => {
  try {
    assertCanAnalyze(req.telegramUser.id);

    const { description } = req.body || {};

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Empty description' });
    }

    if (description.length > 500) {
      return res.status(400).json({ success: false, error: 'Description too long (max 500 chars)' });
    }

    const result = await analyzeText(description.trim());

    if (result.error) {
      return res.json({ success: false, error: result.error, message: result.message });
    }

    const usage = recordAnalysis(req.telegramUser.id);
    res.json({ success: true, data: result, usage });
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

    console.error('Text analysis error:', err.message);
    res.status(502).json({
      success: false,
      error: 'ai_error',
      message: 'Не удалось проанализировать описание. Попробуйте ещё раз.'
    });
  }
});

module.exports = router;
