const PANTRY_PROMPT = `Ты — AI-помощник по домашнему питанию для России/СНГ.

ВСЕГДА отвечай ТОЛЬКО валидным JSON-объектом без текста вне JSON.

Задача: по фото холодильника, полки, стола или набора продуктов определить доступные ингредиенты.

Формат:
{
  "items": [
    {
      "name": "куриная грудка",
      "quantity_text": "примерно 500 г",
      "category": "мясо, птица и рыба",
      "confidence": "high" | "medium" | "low"
    }
  ]
}

Категории: овощи и фрукты, молочные продукты, мясо, птица и рыба, крупы, макароны и хлеб, специи и соусы, другое.

Правила:
- Если количество непонятно, quantity_text оставь пустой строкой.
- Если на фото нет продуктов, верни {"items": []}.
- Не выдумывай редкие ингредиенты без уверенности.
- Названия продуктов пиши на русском языке.`;

const RECIPE_PROMPT = `Ты — AI-помощник по домашней готовке и подсчету КБЖУ для России/СНГ.

ВСЕГДА отвечай ТОЛЬКО валидным JSON-объектом без текста вне JSON.

Задача: предложить 3-5 практичных, классических и популярных блюд из подтвержденных продуктов пользователя.

Формат:
{
  "recipes": [
    {
      "title": "курица с гречкой и овощами",
      "time_minutes": 35,
      "difficulty": "легко" | "средне" | "сложно",
      "servings": 2,
      "calories": 520,
      "protein": 38,
      "fat": 14,
      "carbs": 58,
      "ingredients": [
        { "name": "куриная грудка", "quantity_text": "250 г", "calories": 275, "available": true, "category": "мясо, птица и рыба" }
      ],
      "missing_items": [
        { "name": "помидоры", "quantity_text": "2 шт", "calories": 40, "category": "овощи и фрукты" }
      ],
      "steps": ["Нарежьте курицу", "Отварите гречку"]
    }
  ]
}

Правила:
- Предлагай только узнаваемые домашние блюда, популярные в России/СНГ: супы, каши, гарниры с мясом/рыбой/птицей, салаты, омлеты, запеканки, тушеные блюда, простые блюда на сковороде или в духовке.
- Не придумывай авторские, ресторанные, fusion, экзотические или странные сочетания.
- Избегай редких ингредиентов и сложных техник. Не используй киноа, чиа, батат, кокосовое молоко, тофу, авокадо, мисо, тахини и подобные продукты, если пользователь явно не указал их в доступных продуктах.
- В первую очередь используй доступные продукты пользователя. Недостающие продукты добавляй только базовые и привычные: лук, морковь, картофель, крупы, макароны, яйца, молоко, сметана, сыр, зелень, специи, масло.
- Названия рецептов должны звучать как обычные блюда: "куриный суп с картофелем", "гречка с курицей", "омлет с овощами", "салат из огурцов и помидоров".
- Не называй блюда необычно и не добавляй маркетинговые формулировки вроде "боул", "фьюжн", "авторский", "азиатский стиль", если таких продуктов нет у пользователя.
- Если из продуктов можно сделать простое классическое блюдо, выбирай его вместо более креативного варианта.
- КБЖУ указывай на одну порцию.
- Для каждого ингредиента указывай calories: примерные ккал в количестве, указанном в quantity_text.
- Сумма calories по ингредиентам должна примерно соответствовать калорийности всего рецепта с учетом порций.
- Если цель: похудение, уменьши масло и калорийные соусы.
- Если цель: набор массы, добавь калорийный гарнир или большую порцию.
- Если цель: высокий белок, увеличь белковый продукт.
- Не предлагай медицинские рекомендации.`;

function stripJson(rawText) {
  let text = String(rawText || '').trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return text;
}

function safeString(value, fallback) {
  return String(value || fallback || '').trim();
}

function normalizeCategory(value) {
  const allowed = [
    'овощи и фрукты',
    'молочные продукты',
    'мясо, птица и рыба',
    'крупы, макароны и хлеб',
    'специи и соусы',
    'другое'
  ];
  return allowed.includes(value) ? value : 'другое';
}

function normalizeConfidence(value) {
  return ['high', 'medium', 'low'].includes(value) ? value : 'medium';
}

function buildPantryMessages(base64Image, mimeType) {
  return [
    { role: 'system', content: PANTRY_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Распознай продукты на фото. Верни список ингредиентов, которые пользователь сможет подтвердить.' },
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'low' }
        }
      ]
    }
  ];
}

function buildRecipeMessages(items, goal) {
  const confirmedItems = items.map(item => ({
    name: item.name,
    quantity_text: item.quantity_text || '',
    category: item.category || 'другое'
  }));

  return [
    { role: 'system', content: RECIPE_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({
        goal: goal || 'поддержание',
        available_items: confirmedItems
      })
    }
  ];
}

function parsePantryResponse(rawText) {
  try {
    const data = JSON.parse(stripJson(rawText));
    const items = Array.isArray(data.items) ? data.items : [];
    return {
      items: items.map(item => ({
        name: safeString(item.name, 'продукт'),
        quantity_text: safeString(item.quantity_text, ''),
        category: normalizeCategory(item.category),
        confidence: normalizeConfidence(item.confidence)
      })).filter(item => item.name)
    };
  } catch {
    return null;
  }
}

function normalizeRecipe(recipe) {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const missingItems = Array.isArray(recipe.missing_items) ? recipe.missing_items : [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];

  return {
    title: safeString(recipe.title, 'Рецепт'),
    time_minutes: Math.max(0, Math.round(Number(recipe.time_minutes) || 0)),
    difficulty: ['легко', 'средне', 'сложно'].includes(recipe.difficulty) ? recipe.difficulty : 'легко',
    servings: Math.max(1, Math.round(Number(recipe.servings) || 1)),
    calories: Math.max(0, Math.round(Number(recipe.calories) || 0)),
    protein: Math.max(0, Number((Number(recipe.protein) || 0).toFixed(1))),
    fat: Math.max(0, Number((Number(recipe.fat) || 0).toFixed(1))),
    carbs: Math.max(0, Number((Number(recipe.carbs) || 0).toFixed(1))),
    ingredients: ingredients.map(item => ({
      name: safeString(item.name, 'ингредиент'),
      quantity_text: safeString(item.quantity_text, ''),
      calories: Math.max(0, Math.round(Number(item.calories) || 0)),
      available: Boolean(item.available),
      category: normalizeCategory(item.category)
    })),
    missing_items: missingItems.map(item => ({
      name: safeString(item.name, 'продукт'),
      quantity_text: safeString(item.quantity_text, ''),
      calories: Math.max(0, Math.round(Number(item.calories) || 0)),
      category: normalizeCategory(item.category)
    })),
    steps: steps.map(step => safeString(step, '')).filter(Boolean)
  };
}

function parseRecipeResponse(rawText) {
  try {
    const data = JSON.parse(stripJson(rawText));
    const recipes = Array.isArray(data.recipes) ? data.recipes : [];
    return { recipes: recipes.map(normalizeRecipe).filter(recipe => recipe.title).slice(0, 5) };
  } catch {
    return null;
  }
}

module.exports = {
  buildPantryMessages,
  buildRecipeMessages,
  parsePantryResponse,
  parseRecipeResponse
};
