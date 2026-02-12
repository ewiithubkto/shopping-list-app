function toCanonicalScalar(value) {
  const valueType = typeof value;

  if (valueType === "string") return `s:${value}`;
  if (valueType === "number") return `n:${Number.isNaN(value) ? "NaN" : value}`;
  if (valueType === "boolean") return `b:${value ? 1 : 0}`;
  if (value == null) return "null";

  return `${valueType}:${String(value)}`;
}

function buildItemsEntrySignature(item) {
  return [
    toCanonicalScalar(item?.id),
    toCanonicalScalar(item?.name),
    toCanonicalScalar(item?.category),
    toCanonicalScalar(item?.active),
    toCanonicalScalar(item?.bought),
  ].join("|");
}

function buildCatalogEntrySignature(entry) {
  return [
    toCanonicalScalar(entry?.name),
    toCanonicalScalar(entry?.category),
  ].join("|");
}

function compareSignatureLists(first, second, getSignature) {
  if (!Array.isArray(first) || !Array.isArray(second)) return false;
  if (first.length !== second.length) return false;

  const firstSignatures = first.map(getSignature).sort();
  const secondSignatures = second.map(getSignature).sort();

  for (let index = 0; index < firstSignatures.length; index += 1) {
    if (firstSignatures[index] !== secondSignatures[index]) {
      return false;
    }
  }

  return true;
}

export function areItemsCollectionsEqual(first, second) {
  return compareSignatureLists(first, second, buildItemsEntrySignature);
}

export function areCatalogCollectionsEqual(first, second) {
  return compareSignatureLists(first, second, buildCatalogEntrySignature);
}
