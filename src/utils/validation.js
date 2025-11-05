const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(rawValue) {
  const value = (rawValue ?? "").toString().trim();
  if (!value) return false;
  return EMAIL_REGEX.test(value);
}

export { EMAIL_REGEX };
