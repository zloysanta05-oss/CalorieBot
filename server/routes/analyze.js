const express = require('express');
const multer = require('multer');
const { analyzeImage, analyzeText } = require('../services/openai');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.post('/analyze-photo', upload.single('photo'), async (req, res) => {
  try {
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

    const result = await analyzeImage(base64Data, mimeType);

    if (result.error) {
      return res.json({ success: false, error: result.error, message: result.message });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Photo analysis error:', err.message);
    res.status(502).json({
      success: false,
      error: 'ai_error',
      message: 'Не удалось проанализировать фото. Попробуйте ещё раз.'
    });
  }
});

router.post('/analyze-text', async (req, res) => {
  try {
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

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Text analysis error:', err.message);
    res.status(502).json({
      success: false,
      error: 'ai_error',
      message: 'Не удалось проанализировать описание. Попробуйте ещё раз.'
    });
  }
});

module.exports = router;
