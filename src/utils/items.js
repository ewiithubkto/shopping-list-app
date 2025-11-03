export function normalizeName(name) {
  return (name ?? "").toString().trim().toLowerCase();
}

export function getItemKey(name, category, fallbackCategory) {
  const normalizedName = normalizeName(name);
  const resolvedCategory = normalizeName(category || fallbackCategory);

  return `${normalizedName}__${resolvedCategory}`;
}
