const DEFAULT_CATEGORY = "Другое";

function generateItemId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeName(name) {
  return (name ?? "").toString().trim().toLowerCase();
}

export function getItemKey(name, category, fallbackCategory) {
  const normalizedName = normalizeName(name);
  const resolvedCategory = normalizeName(category || fallbackCategory);

  return `${normalizedName}__${resolvedCategory}`;
}

export function normalizeItem(item, fallbackId = null) {
  if (!item) return null;

  return {
    id: item.id ?? fallbackId ?? generateItemId(),
    name: item.name ?? "",
    bought: Boolean(item.bought),
    category: item.category ?? DEFAULT_CATEGORY,
    active: item.active ?? true,
  };
}

export function itemsArrayToRecord(items) {
  const record = {};

  items.forEach((item) => {
    if (!item) return;
    const normalized = normalizeItem(item);
    if (!normalized) return;
    const key = String(normalized.id);
    record[key] = normalized;
  });

  return record;
}
