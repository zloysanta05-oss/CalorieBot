const db = require('../db');

const UNITS = ['г', 'мл', 'шт', 'упак'];

const listInventoryItems = db.prepare(`
  SELECT *
  FROM inventory_items
  WHERE telegram_id = ?
  ORDER BY updated_at DESC, id DESC
`);

const getInventoryItem = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND telegram_id = ?');

const findInventoryItem = db.prepare(`
  SELECT *
  FROM inventory_items
  WHERE telegram_id = ? AND normalized_name = ? AND quantity_unit = ?
  LIMIT 1
`);

const insertInventoryItem = db.prepare(`
  INSERT INTO inventory_items (telegram_id, name, normalized_name, quantity_value, quantity_unit, category, source)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const updateInventoryItem = db.prepare(`
  UPDATE inventory_items
  SET name = ?,
      normalized_name = ?,
      quantity_value = ?,
      quantity_unit = ?,
      category = ?,
      source = ?,
      updated_at = datetime('now')
  WHERE id = ? AND telegram_id = ?
`);

const addInventoryQuantity = db.prepare(`
  UPDATE inventory_items
  SET name = ?,
      quantity_value = ?,
      category = ?,
      source = ?,
      updated_at = datetime('now')
  WHERE id = ? AND telegram_id = ?
`);

const deleteInventoryItem = db.prepare('DELETE FROM inventory_items WHERE id = ? AND telegram_id = ?');

function mergeQuantity(currentValue, addValue) {
  const currentIsEmpty = currentValue === null || currentValue === undefined;
  const addIsEmpty = addValue === null || addValue === undefined;
  if (currentIsEmpty && addIsEmpty) return null;

  const current = currentIsEmpty ? 0 : Number(currentValue) || 0;
  const add = addIsEmpty ? 0 : Number(addValue) || 0;
  return Math.max(0, Math.round((current + add) * 10) / 10);
}

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[.,;:!?()[\]{}"']/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeUnit(unit) {
  const value = String(unit || '').trim().toLocaleLowerCase('ru-RU').replace('.', '');
  if (['г', 'гр', 'грамм', 'грамма', 'граммов'].includes(value)) return 'г';
  if (['кг', 'килограмм', 'килограмма', 'килограммов'].includes(value)) return 'кг';
  if (['мл', 'миллилитр', 'миллилитра', 'миллилитров'].includes(value)) return 'мл';
  if (['л', 'литр', 'литра', 'литров'].includes(value)) return 'л';
  if (['шт', 'штука', 'штуки', 'штук'].includes(value)) return 'шт';
  if (['уп', 'упак', 'упаковка', 'упаковки', 'пачка', 'пачки', 'бут', 'бутылка'].includes(value)) return 'упак';
  return UNITS.includes(value) ? value : 'упак';
}

function normalizeQuantity(value, unit) {
  let quantityValue = value === null || value === undefined || value === '' ? null : Number(value);
  let quantityUnit = normalizeUnit(unit);

  if (!Number.isFinite(quantityValue) || quantityValue < 0) {
    quantityValue = null;
  }

  if (quantityValue !== null && quantityUnit === 'кг') {
    quantityValue *= 1000;
    quantityUnit = 'г';
  }

  if (quantityValue !== null && quantityUnit === 'л') {
    quantityValue *= 1000;
    quantityUnit = 'мл';
  }

  return {
    quantity_value: quantityValue === null ? null : Math.round(quantityValue * 10) / 10,
    quantity_unit: UNITS.includes(quantityUnit) ? quantityUnit : 'упак'
  };
}

function parseQuantityText(text) {
  const raw = String(text || '').trim().replace(',', '.');
  if (!raw) return { quantity_value: null, quantity_unit: 'упак' };

  const match = raw.match(/(\d+(?:\.\d+)?)\s*(кг|килограмм(?:а|ов)?|г|гр|грамм(?:а|ов)?|л|литр(?:а|ов)?|мл|шт|штук(?:а|и)?|упак|упаковк(?:а|и)|пачк(?:а|и)?)/i);
  if (!match) return { quantity_value: null, quantity_unit: 'упак' };

  return normalizeQuantity(Number(match[1]), match[2]);
}

function normalizeInventoryPayload(body, fallbackSource) {
  const name = String(body.name || '').trim();
  if (!name) throw new Error('Name is required');

  const parsed = body.quantity_value === undefined || body.quantity_value === null || body.quantity_value === ''
    ? parseQuantityText(body.quantity_text)
    : normalizeQuantity(body.quantity_value, body.quantity_unit);

  return {
    name,
    normalized_name: normalizeName(name),
    quantity_value: parsed.quantity_value,
    quantity_unit: parsed.quantity_unit,
    category: String(body.category || 'другое').trim() || 'другое',
    source: String(body.source || fallbackSource || 'manual').trim() || 'manual'
  };
}

function upsertInventoryItem(telegramId, data) {
  const item = normalizeInventoryPayload(data, data.source);
  const existing = findInventoryItem.get(telegramId, item.normalized_name, item.quantity_unit);

  if (existing) {
    addInventoryQuantity.run(
      item.name,
      mergeQuantity(existing.quantity_value, item.quantity_value),
      item.category || existing.category || 'другое',
      item.source,
      existing.id,
      telegramId
    );
    return getInventoryItem.get(existing.id, telegramId);
  }

  const result = insertInventoryItem.run(
    telegramId,
    item.name,
    item.normalized_name,
    item.quantity_value,
    item.quantity_unit,
    item.category,
    item.source
  );
  return getInventoryItem.get(result.lastInsertRowid, telegramId);
}

function consolidateInventoryItems(telegramId) {
  const items = listInventoryItems.all(telegramId);
  const groups = new Map();

  items.forEach(item => {
    const key = item.normalized_name + '|' + item.quantity_unit;
    if (!groups.has(key)) {
      groups.set(key, item);
      return;
    }

    const target = groups.get(key);
    addInventoryQuantity.run(
      target.name,
      mergeQuantity(target.quantity_value, item.quantity_value),
      target.category || item.category || 'другое',
      target.source || item.source || 'manual',
      target.id,
      telegramId
    );
    deleteInventoryItem.run(item.id, telegramId);
    groups.set(key, getInventoryItem.get(target.id, telegramId));
  });

  return listInventoryItems.all(telegramId);
}

function findDuplicateInventoryItem(telegramId, id, data) {
  const item = normalizeInventoryPayload(data, data.source);
  return listInventoryItems.all(telegramId).find(row => (
    row.id !== id &&
    row.normalized_name === item.normalized_name &&
    row.quantity_unit === item.quantity_unit
  )) || null;
}

function consumeInventoryItem(telegramId, id, amount, unit) {
  const existing = getInventoryItem.get(id, telegramId);
  if (!existing) return null;

  const parsed = normalizeQuantity(amount, unit || existing.quantity_unit);
  if (parsed.quantity_unit !== existing.quantity_unit || parsed.quantity_value === null) {
    return existing;
  }

  const current = Number(existing.quantity_value) || 0;
  const next = Math.max(0, Math.round((current - parsed.quantity_value) * 10) / 10);
  updateInventoryItem.run(
    existing.name,
    existing.normalized_name,
    next,
    existing.quantity_unit,
    existing.category,
    existing.source,
    existing.id,
    telegramId
  );
  return getInventoryItem.get(id, telegramId);
}

function findBestInventoryMatch(items, ingredient) {
  const normalized = normalizeName(ingredient.name);
  if (!normalized) return null;

  return items.find(item => item.normalized_name === normalized)
    || items.find(item => normalized.includes(item.normalized_name) || item.normalized_name.includes(normalized))
    || null;
}

module.exports = {
  listInventoryItems,
  getInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  normalizeName,
  normalizeInventoryPayload,
  normalizeQuantity,
  parseQuantityText,
  upsertInventoryItem,
  consolidateInventoryItems,
  findDuplicateInventoryItem,
  consumeInventoryItem,
  findBestInventoryMatch
};
