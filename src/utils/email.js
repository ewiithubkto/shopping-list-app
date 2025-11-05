export function normalizeEmailValue(value) {
  return (value ?? "").toString().trim().toLowerCase();
}

export function encodeEmailKey(value) {
  return normalizeEmailValue(value).replace(/\./g, ",");
}

export function decodeEmailKey(key) {
  return (key ?? "").toString().trim().replace(/,/g, ".");
}
