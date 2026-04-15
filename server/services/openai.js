const OpenAI = require('openai');
const { buildPhotoMessages, buildTextMessages, parseNutritionResponse } = require('./nutrition');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://routerai.ru/api/v1'
});
const MODEL = process.env.OPENAI_MODEL || 'openai/gpt-5.4-nano';

async function analyzeImage(base64Data, mimeType) {
  const messages = buildPhotoMessages(base64Data, mimeType || 'image/jpeg');

  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: 1000,
    temperature: 0.3,
    response_format: { type: 'json_object' }
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

async function analyzeText(description) {
  const messages = buildTextMessages(description);

  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: 1000,
    temperature: 0.3,
    response_format: { type: 'json_object' }
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

module.exports = { analyzeImage, analyzeText };
