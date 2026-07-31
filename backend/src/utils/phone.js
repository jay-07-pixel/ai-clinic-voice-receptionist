/**
 * E.164 phone normalization placeholder.
 *
 * Production should replace this with a library such as libphonenumber-js
 * and clinic-default region (IN). For now we strip non-digits (keeping a
 * leading +) so lookups stay consistent across voice and REST callers.
 *
 * @param {string|null|undefined} phone
 * @param {string} [defaultRegion='IN']
 * @returns {string|null}
 */
function normalizeToE164(phone, defaultRegion = 'IN') {
  if (phone == null || typeof phone !== 'string') {
    return null;
  }

  const trimmed = phone.trim();
  if (!trimmed) {
    return null;
  }

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');

  if (!digits) {
    return null;
  }

  // Placeholder: if already international-looking, keep +digits.
  if (hasPlus) {
    return `+${digits}`;
  }

  // Placeholder IN default: prepend country code 91 when 10-digit local mobile.
  if (defaultRegion === 'IN' && digits.length === 10) {
    return `+91${digits}`;
  }

  // Fallback: treat as already including country code without +.
  return `+${digits}`;
}

module.exports = {
  normalizeToE164,
};
