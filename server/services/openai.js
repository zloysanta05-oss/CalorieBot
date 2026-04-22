const OpenAI = require('openai');
const { buildPhotoMessages, buildTextMessages, parseNutritionResponse } = require('./nutrition');
const {
  buildPantryMessages,
  buildRecipeMessages,
  parsePantryResponse,
  parseRecipeResponse
} = require('./culinary');

// Клиент OpenAI-совместимого API. По умолчанию используется routerai.ru.
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://routerai.ru/api/v1'
});
const MODEL = process.env.OPENAI_MODEL || 'openai/gpt-5.4-nano';
const DEFAULT_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 120000;
const RECIPE_TIMEOUT_MS = Number(process.env.OPENAI_RECIPE_TIMEOUT_MS) || 240000;

// Анализ изображения: отправляем base64 data URL и ожидаем JSON с КБЖУ.
async function analyzeImage(base64Data, mimeType, note) {
  const messages = buildPhotoMessages(base64Data, mimeType || 'image/jpeg', note);

  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: 1000,
    temperature: 0.3,
    response_format: { type: 'json_object' }
  }, {
    timeout: DEFAULT_TIMEOUT_MS
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  const result = parseNutritionResponse(content);
  if (!result) {
    throw new Error('Failed to parse nutrition response');
  }

  return result;
}

// Анализ текстового описания еды.
async function analyzeText(description) {
  const messages = buildTextMessages(description);

  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: 1000,
    temperature: 0.3,
    response_format: { type: 'json_object' }
  }, {
    timeout: DEFAULT_TIMEOUT_MS
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  const result = parseNutritionResponse(content);
  if (!result) {
    throw new Error('Failed to parse nutrition response');
  }

  return result;
}

// Анализ фото холодильника или набора продуктов.
async function analyzePantryImage(base64Data, mimeType) {
  const messages = buildPantryMessages(base64Data, mimeType || 'image/jpeg');

  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: 1200,
    temperature: 0.2,
    response_format: { type: 'json_object' }
  }, {
    timeout: DEFAULT_TIMEOUT_MS
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  const result = parsePantryResponse(content);
  if (!result) {
    throw new Error('Failed to parse pantry response');
  }

  return result;
}

// Генерация рецептов из подтвержденных пользователем продуктов.
async function generateRecipesFromItems(items, goal) {
  const messages = buildRecipeMessages(items, goal);

  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: 2500,
    temperature: 0.5,
    response_format: { type: 'json_object' }
  }, {
    timeout: RECIPE_TIMEOUT_MS
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  const result = parseRecipeResponse(content);
  if (!result) {
    throw new Error('Failed to parse recipe response');
  }

  return result;
}

module.exports = {
  analyzeImage,
  analyzeText,
  analyzePantryImage,
  generateRecipesFromItems
};
