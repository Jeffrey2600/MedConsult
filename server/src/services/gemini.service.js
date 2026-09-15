import { GoogleGenAI } from '@google/genai';
import { env, features } from '../config/env.js';
import { URGENCY, LANGUAGE_NAMES } from '../utils/constants.js';
import { KNOWN_SPECIALTIES } from './ruleChecker.js';

let client = null;
if (features.gemini) {
  client = new GoogleGenAI({ apiKey: env.gemini.apiKey });
  console.log(`[gemini] Symptom checker using ${env.gemini.model}`);
} else {
  console.log('[gemini] No API key — the symptom checker will use its rule engine');
}

export const geminiAvailable = () => Boolean(client);

/**
 * Forcing a JSON schema is what makes this usable. Asking for prose and
 * parsing it back out is fragile; a declared schema means the model returns
 * fields we can rely on, and the SDK rejects a response that does not match.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    suggestedSpecialty: {
      type: 'string',
      enum: KNOWN_SPECIALTIES,
      description: 'Which kind of doctor should see this person first',
    },
    urgency: {
      type: 'string',
      enum: [URGENCY.SELF_CARE, URGENCY.ROUTINE, URGENCY.URGENT, URGENCY.EMERGENCY],
      description: 'How soon they need to be seen',
    },
    possibleConditions: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Up to three conditions consistent with the description. Each entry must be one '
        + 'sentence in the form "Name — a plain-language explanation of what it is and why '
        + 'it fits what was described", not just a bare name.',
    },
    advice: {
      type: 'string',
      description:
        'A fuller, practical answer of roughly 80-140 words (about 5-7 sentences), addressed '
        + 'directly to the person. Cover, in order: (1) concrete self-care steps they can take '
        + 'right now, (2) specific signs that mean they should seek care sooner than the '
        + 'stated urgency, (3) roughly how soon to see a doctor if nothing changes. Be '
        + 'specific and concrete rather than generic ("rest and drink fluids" alone is not '
        + 'enough) while staying within the rules below.',
    },
    redFlags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Warning signs that should send them to an emergency department immediately',
    },
  },
  required: ['suggestedSpecialty', 'urgency', 'advice'],
};

const SYSTEM_INSTRUCTION = `
You are a triage assistant inside a telemedicine application. You are NOT a doctor
and you never diagnose.

Your only job is to decide which kind of doctor should see this person, how soon,
and to give brief practical guidance while they wait.

Give a genuinely useful, detailed answer — vague reassurance like "rest and
drink fluids" on its own is not acceptable. The person came here instead of a
search engine because they want something concrete: plausible explanations,
practical self-care they can act on immediately, and a clear sense of when to
escalate. More detail is good; more certainty is not.

Rules you must follow, even while being detailed:
- Never name a specific medicine, drug class, or dose — describe the type of
  relief in plain terms instead (e.g. "an antihistamine" is fine, a brand name
  or a dose in mg is not).
- Never tell someone their symptoms are definitely harmless, and never make a
  specific numeric probability or percentage claim about any condition.
- If anything in the description could indicate a life-threatening problem, set
  urgency to "emergency" and say so plainly.
- Prefer caution. Sending someone for an unnecessary check is a far better error
  than reassuring someone who needed help.
- Write directly to the person ("you"), in a calm, plain-spoken register — not
  clinical jargon, and not a bare list of fragments.
- Choose suggestedSpecialty only from the list allowed by the schema.
`.trim();

const buildPrompt = ({ text, ageYears, gender, durationDays, language }) => {
  const details = [
    ageYears ? `Age: ${ageYears}` : null,
    gender ? `Gender: ${gender}` : null,
    durationDays != null ? `Duration: ${durationDays} day(s)` : null,
  ].filter(Boolean);

  const languageName = LANGUAGE_NAMES[language] ?? 'English';

  return [
    'A patient describes their symptoms as follows.',
    '',
    `"""${text}"""`,
    '',
    details.length ? details.join('\n') : 'No additional details were given.',
    '',
    // Answering in the patient's own language is the point of the language
    // selector — a Tamil interface that returns English medical advice helps
    // nobody.
    `Write every piece of free text in your answer in ${languageName}.`,
    'Keep the specialty value exactly as it appears in the allowed list, in English.',
  ].join('\n');
};

/**
 * Asks Gemini to triage the description.
 *
 * Throws on any failure — an absent key, a timeout, a quota rejection, or a
 * malformed reply. The caller catches and falls back to the rule engine, so
 * the checker always answers.
 */
export async function geminiCheck(input) {
  if (!client) throw new Error('Gemini is not configured');

  const request = client.models.generateContent({
    model: env.gemini.model,
    contents: buildPrompt(input),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      // Triage should be reproducible, not creative.
      temperature: 0.2,
      // Raised from 800 now that advice targets ~100 words plus three
      // explained conditions — the old budget was tight enough to risk
      // truncating a genuinely detailed reply mid-sentence.
      maxOutputTokens: 1200,
    },
  });

  // The free tier can be slow under load, and a symptom checker that hangs is
  // worse than one that quietly falls back.
  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`Gemini timed out after ${env.gemini.timeoutMs}ms`)),
      env.gemini.timeoutMs
    )
  );

  const response = await Promise.race([request, timeout]);
  const raw = response?.text;
  if (!raw) throw new Error('Gemini returned an empty response');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Gemini returned text that was not valid JSON');
  }

  return normaliseGeminiResult(parsed);
}

const TRANSLATE_SCHEMA = {
  type: 'object',
  properties: {
    translatedText: {
      type: 'string',
      description:
        'The message translated into the target language, and nothing else — '
        + 'no notes, no quotes, no repeating the original.',
    },
  },
  required: ['translatedText'],
};

const TRANSLATE_SYSTEM_INSTRUCTION = `
You are a translation engine embedded in a doctor-patient chat. Translate the
given message faithfully into the target language.

Rules:
- Preserve the meaning, tone, and any medical terms precisely — this is a
  clinical conversation, not casual chat.
- Translate only. Do not answer, comment on, or add anything to the message.
- If the message is already in the target language, or is not real text to
  translate (an emoji, a number, a name), return it unchanged.
- Keep formatting such as line breaks as close to the original as possible.
`.trim();

/**
 * Translates one chat message for the recipient's benefit. Mirrors
 * geminiCheck's contract: throws on any failure so the caller can fall back
 * to sending the message untranslated rather than blocking or losing it.
 */
export async function geminiTranslate({ text, targetLanguage }) {
  if (!client) throw new Error('Gemini is not configured');

  const languageName = LANGUAGE_NAMES[targetLanguage] ?? 'English';

  const request = client.models.generateContent({
    model: env.gemini.model,
    contents: [`Translate the following message into ${languageName}.`, '', `"""${text}"""`].join(
      '\n'
    ),
    config: {
      systemInstruction: TRANSLATE_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: TRANSLATE_SCHEMA,
      // Translation should be literal, not creative.
      temperature: 0.1,
      maxOutputTokens: 1024,
    },
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`Gemini timed out after ${env.gemini.timeoutMs}ms`)),
      env.gemini.timeoutMs
    )
  );

  const response = await Promise.race([request, timeout]);
  const raw = response?.text;
  if (!raw) throw new Error('Gemini returned an empty response');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Gemini returned text that was not valid JSON');
  }

  const translatedText = typeof parsed.translatedText === 'string' ? parsed.translatedText.trim() : '';
  if (!translatedText) throw new Error('Gemini returned an empty translation');

  return translatedText.slice(0, 4000);
}

/**
 * The schema constrains the shape, not the sense. Anything unexpected is
 * corrected here rather than trusted, so a surprising reply cannot put an
 * invalid urgency or an unknown specialty into the database.
 */
export function normaliseGeminiResult(parsed) {
  const validUrgencies = [URGENCY.SELF_CARE, URGENCY.ROUTINE, URGENCY.URGENT, URGENCY.EMERGENCY];

  const specialty = KNOWN_SPECIALTIES.includes(parsed.suggestedSpecialty)
    ? parsed.suggestedSpecialty
    : 'General Physician';

  const urgency = validUrgencies.includes(parsed.urgency) ? parsed.urgency : URGENCY.ROUTINE;

  const toStringArray = (value, limit, maxLen) =>
    Array.isArray(value)
      ? value
          .filter((v) => typeof v === 'string' && v.trim())
          .slice(0, limit)
          .map((v) => (maxLen ? v.slice(0, maxLen) : v))
      : [];

  return {
    source: 'gemini',
    suggestedSpecialty: specialty,
    urgency,
    // Each entry is now "Name — explanation", so it needs more room than a
    // bare condition name did.
    possibleConditions: toStringArray(parsed.possibleConditions, 3, 300),
    advice: typeof parsed.advice === 'string' ? parsed.advice.slice(0, 2500) : '',
    redFlags: toStringArray(parsed.redFlags, 5, 200),
  };
}
