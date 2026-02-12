export function normalizeCatalogItem(item, defaultCategory) {
  if (!item) return null;

  const name = (item.name ?? "").toString().trim();
  if (!name) return null;

  const categoryValue = (item.category ?? defaultCategory).toString().trim();
  const category = categoryValue || defaultCategory;

  return {
    name,
    category,
  };
}

export function dedupeCatalog(entries, { normalizeName, defaultCategory }) {
  const seen = new Map();
  const result = [];

  entries.forEach((entry) => {
    const normalized = normalizeCatalogItem(entry, defaultCategory);
    if (!normalized) return;

    const key = normalizeName(normalized.name);
    if (seen.has(key)) {
      const existingIndex = seen.get(key);
      const existing = result[existingIndex];
      if (!existing.category && normalized.category) {
        result[existingIndex] = { ...existing, category: normalized.category };
      }
      return;
    }

    seen.set(key, result.length);
    result.push(normalized);
  });

  return result;
}
