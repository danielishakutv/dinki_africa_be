/**
 * Nigerian phone number normalization + validation.
 *
 * Single source of truth for what a "valid Nigerian phone" looks like and
 * what its canonical stored form is. Every write path (signup, profile
 * update, customer create/update, admin user update) MUST run input through
 * this util before persisting, so the database only ever sees one shape per
 * person and we don't end up with two accounts for the same human just
 * because one was typed with `+234` and the other with a leading `0`.
 *
 *   Canonical form: +234 followed by exactly 10 digits, mobile prefix only
 *   (the digit after +234 must be 7, 8, or 9 — Nigerian mobile carriers).
 *
 *   Example: 08088256055  →  +2348088256055
 *            +234 808 825 6055  →  +2348088256055
 *            234-9161-844-878   →  +2349161844878
 *
 * Anything else (wrong length, wrong country, non-digit garbage) is rejected
 * with a human-readable error so the API caller knows what to fix.
 */

const { body } = require('express-validator');

const NIGERIAN_E164 = /^\+234[789]\d{9}$/;

const FORMAT_HINT =
  'Enter a Nigerian mobile number — 11 digits starting with 0 (e.g. 08088256055) ' +
  'or the international form with +234 (e.g. +2348088256055).';

/**
 * Normalize a phone string.
 *
 *   normalizeNigerianPhone('  0808 825 6055 ')   → { ok: true,  value: '+2348088256055' }
 *   normalizeNigerianPhone('+234-9161-844-878')  → { ok: true,  value: '+2349161844878' }
 *   normalizeNigerianPhone('')                   → { ok: true,  value: null }
 *   normalizeNigerianPhone(null)                 → { ok: true,  value: null }
 *   normalizeNigerianPhone('1234567')            → { ok: false, error: '<hint>' }
 *
 * Empty/null is treated as "no phone supplied" (ok with null) because every
 * caller currently treats phone as optional. Validators and service guards
 * that need to enforce presence handle that separately.
 */
function normalizeNigerianPhone(input) {
  if (input === undefined || input === null) return { ok: true, value: null };

  let s = String(input).trim();
  if (!s) return { ok: true, value: null };

  // Strip the things that show up when humans copy-paste numbers: spaces,
  // tabs, dashes, dots, parentheses. Keep digits and a leading '+' only.
  s = s.replace(/[\s \-.()]/g, '');

  // Three accepted shapes after cleanup. Convert each to canonical.
  let canonical;
  if (/^\+234\d{10}$/.test(s))     canonical = s;
  else if (/^234\d{10}$/.test(s))  canonical = '+' + s;
  else if (/^0\d{10}$/.test(s))    canonical = '+234' + s.slice(1);
  else return { ok: false, error: FORMAT_HINT };

  // Final structural check — also gates out non-mobile prefixes (anything
  // not 7/8/9 in the carrier slot).
  if (!NIGERIAN_E164.test(canonical)) {
    return { ok: false, error: FORMAT_HINT };
  }

  return { ok: true, value: canonical };
}

/**
 * Express-validator chain factory for a phone body field.
 *
 * Drop-in replacement for `body('phone').optional().trim().isLength(...)` —
 * both validates the input AND rewrites it to canonical form so downstream
 * service code can safely treat req.body.phone as already-normalized.
 *
 *   const { phoneBody } = require('../../utils/phone');
 *   const schema = [
 *     phoneBody('phone'),                    // optional
 *     phoneBody('phone', { required: true }) // mandatory variant
 *   ];
 *
 * The order of `.custom()` then `.customSanitizer()` matters: the validator
 * fires first and rejects bad input with a clear message; the sanitizer
 * then runs on already-valid input and rewrites it to the canonical form.
 */
function phoneBody(field, { required = false } = {}) {
  let chain = body(field);
  if (!required) chain = chain.optional({ checkFalsy: true });

  return chain
    .custom((value) => {
      const result = normalizeNigerianPhone(value);
      if (!result.ok) throw new Error(result.error);
      return true;
    })
    .customSanitizer((value) => {
      const result = normalizeNigerianPhone(value);
      // result.ok is guaranteed here because .custom() above already ran;
      // returning .value collapses '' / null / undefined to a real null so
      // the DB sees a clean NULL instead of '' (different at the row level).
      return result.value;
    });
}

module.exports = {
  normalizeNigerianPhone,
  phoneBody,
  FORMAT_HINT,
};
