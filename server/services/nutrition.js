const SYSTEM_PROMPT = `Ты — профессиональный диетолог и эксперт по питанию. Твоя задача — анализировать еду (по фото или описанию) и оценивать её питательную ценность.

ВСЕГДА отвечай ТОЛЬКО валидным JSON-объектом. Никакого текста вне JSON.

Формат ответа:
{
  "dish_name": "название блюда на русском",
  "calories": число (ккал),
  "protein": число (граммы белка),
  "fat": число (граммы жиров),
  "carbs": число (граммы углеводов),
  "portion_grams": число (оценка массы порции в граммах),
  "confidence": "high" | "medium" | "low",
  "items": [
    { "name": "компонент", "calories": число }
  ]
}

Правила:
- Оценивай типичную порцию, если на фото не видно явно другого количества
- Если на тарелке несколько блюд, перечисли каждое в массиве items
- Округляй калории до ближайших 5, макронутриенты до 0.5г
- Используй данные USDA/стандартные таблицы калорийности как ориентир
- Если изображение не содержит еды, верни: {"error": "not_food", "message": "На изображении не обнаружена еда"}
- Если не можешь точно определить блюдо, дай лучшую оценку и поставь confidence: "low"
- Все текстовые поля на русском языке`;

function buildPhotoMessages(base64Image, mimeType) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Проанализируй это блюдо и оцени его калорийность и БЖУ.' },
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'low' }
        }
      ]
    }
  ];
}

function buildTextMessages(description) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Оцени калорийность и БЖУ для следующего блюда/продукта: "${description}"`
    }
  ];
}

function parseNutritionResponse(rawText) {
  try {
    let text = rawText.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const data = JSON.parse(text);

    if (data.error) {
      return { error: data.error, message: data.message || 'Не удалось распознать еду' };
    }

    return {
      dish_name: String(data.dish_name || 'Неизвестное блюдо'),
      calories: Math.max(0, Math.round(Number(data.calories) || 0)),
      protein: Math.max(0, Number((Number(data.protein) || 0).toFixed(1))),
      fat: Math.max(0, Number((Number(data.fat) || 0).toFixed(1))),
      carbs: Math.max(0, Number((Number(data.carbs) || 0).toFixed(1))),
      portion_grams: Math.max(0, Math.round(Number(data.portion_grams) || 0)),
      confidence: ['high', 'medium', 'low'].includes(data.confidence) ? data.confidence : 'medium',
      items: Array.isArray(data.items) ? data.items.map(item => ({
        name: String(item.name || ''),
        calories: Math.max(0, Math.round(Number(item.calories) || 0))
      })) : []
    };
  } catch {
    return null;
  }
}

module.exports = { buildPhotoMessages, buildTextMessages, parseNutritionResponse };
