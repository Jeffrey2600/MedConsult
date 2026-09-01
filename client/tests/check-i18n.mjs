/**
 * Confirms every locale file has exactly the same keys as English — no
 * missing translations (which fall back silently and go unnoticed) and no
 * leftover/renamed keys (which are dead weight nobody ever sees).
 *
 *   node tests/check-i18n.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..', 'src', 'locales');
const LANGS = ['en', 'ta', 'hi', 'te', 'ml'];

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

const data = {};
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
  ok ? pass++ : fail++;
};

for (const lang of LANGS) {
  const file = path.join(dir, lang, 'translation.json');
  const raw = fs.readFileSync(file, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    check(`${lang}: valid JSON`, false, err.message);
    continue;
  }
  check(`${lang}: valid JSON`, true);
  data[lang] = flatten(parsed);
}

const enKeys = new Set(Object.keys(data.en));
console.log(`\n[info] English has ${enKeys.size} keys\n`);

for (const lang of LANGS) {
  if (lang === 'en') continue;
  const keys = new Set(Object.keys(data[lang]));

  const missing = [...enKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !enKeys.has(k));

  check(`${lang}: no missing keys`, missing.length === 0,
    missing.length ? `${missing.length} missing: ${missing.slice(0, 5).join(', ')}` : '');
  check(`${lang}: no extra/renamed keys`, extra.length === 0,
    extra.length ? `${extra.length} extra: ${extra.slice(0, 5).join(', ')}` : '');

  // A value identical to English is suspicious (untranslated) UNLESS it's
  // meant to be identical — brand name, placeholders, language names.
  const allowedSame = new Set([
    'app.name', 'auth.emailPlaceholder',
    'language.en', 'language.ta', 'language.hi', 'language.te', 'language.ml',
  ]);
  const untranslated = [...enKeys].filter((k) => {
    if (allowedSame.has(k)) return false;
    const enVal = data.en[k];
    if (typeof enVal !== 'string') return false;
    // Pure interpolation/short technical strings can legitimately match.
    if (/^\{\{.*\}\}$/.test(enVal.trim())) return false;
    return data[lang][k] === enVal;
  });
  check(`${lang}: no suspiciously untranslated strings`, untranslated.length === 0,
    untranslated.length ? `${untranslated.length}: ${untranslated.slice(0, 8).join(', ')}` : '');

  // Every {{placeholder}} in English must appear in the translation too —
  // dropping one silently breaks interpolation at render time.
  let placeholderIssues = 0;
  const placeholderExamples = [];
  for (const k of enKeys) {
    const enVal = data.en[k];
    if (typeof enVal !== 'string') continue;
    const enPlaceholders = [...enVal.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    if (!enPlaceholders.length) continue;
    const otherVal = data[lang][k];
    if (typeof otherVal !== 'string') continue;
    const otherPlaceholders = [...otherVal.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    if (JSON.stringify(enPlaceholders) !== JSON.stringify(otherPlaceholders)) {
      placeholderIssues++;
      if (placeholderExamples.length < 5) {
        placeholderExamples.push(`${k}: en=[${enPlaceholders}] ${lang}=[${otherPlaceholders}]`);
      }
    }
  }
  check(`${lang}: every {{placeholder}} preserved`, placeholderIssues === 0,
    placeholderIssues ? `${placeholderIssues} mismatches: ${placeholderExamples.join(' | ')}` : '');

  // Plural key pairs (_one/_other) must both exist together. Only bases that
  // actually have an _one sibling count in English — records.cat_other is a
  // category named "Other", not a plural, and has no cat_one to pair with.
  const pluralBases = new Set(
    [...enKeys]
      .filter((k) => k.endsWith('_one'))
      .map((k) => k.replace(/_one$/, ''))
      .filter((base) => enKeys.has(`${base}_other`))
  );
  let pluralIssues = 0;
  for (const base of pluralBases) {
    const hasOne = keys.has(`${base}_one`);
    const hasOther = keys.has(`${base}_other`);
    if (!hasOne || !hasOther) pluralIssues++;
  }
  check(`${lang}: plural forms complete`, pluralIssues === 0, `${pluralIssues} incomplete`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
