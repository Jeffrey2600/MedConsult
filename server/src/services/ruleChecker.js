import { URGENCY } from '../utils/constants.js';

/**
 * Keyword-based triage, used whenever the language model is unavailable —
 * no API key, an outage, a timeout, or the free-tier quota running out.
 *
 * It exists so the feature always answers. A demonstration that dies because
 * a third-party quota was exhausted five minutes earlier is worse than a
 * simple answer that always works, and this also means the checker degrades
 * safely rather than disappearing.
 */
const SPECIALTY_RULES = [
  {
    specialty: 'Cardiology',
    urgency: URGENCY.URGENT,
    conditions: ['Angina', 'High blood pressure', 'Arrhythmia'],
    keywords: [
      'chest', 'heart', 'palpitation', 'blood pressure', 'bp', 'cholesterol',
      'ecg', 'breathless on exertion', 'swollen ankles', 'irregular heartbeat',
    ],
  },
  {
    specialty: 'Dermatology',
    urgency: URGENCY.ROUTINE,
    conditions: ['Contact dermatitis', 'Eczema', 'Fungal infection', 'Acne'],
    keywords: [
      'rash', 'itch', 'itchy', 'skin', 'acne', 'pimple', 'eczema', 'psoriasis',
      'hair fall', 'hair loss', 'dandruff', 'boil', 'hives', 'pigmentation',
      'mole', 'nail', 'ringworm',
    ],
  },
  {
    specialty: 'Orthopaedics',
    urgency: URGENCY.ROUTINE,
    conditions: ['Muscle strain', 'Osteoarthritis', 'Tendonitis'],
    keywords: [
      'knee', 'back pain', 'joint', 'bone', 'fracture', 'sprain', 'shoulder',
      'ankle', 'hip', 'neck pain', 'spine', 'muscle pain', 'arthritis', 'limp',
    ],
  },
  {
    specialty: 'Psychiatry',
    urgency: URGENCY.ROUTINE,
    conditions: ['Anxiety', 'Depression', 'Insomnia', 'Stress reaction'],
    keywords: [
      'anxious', 'anxiety', 'depress', 'panic', 'stress', 'sleep', 'insomnia',
      'mood', 'sad', 'worried all the time', 'concentrate', 'appetite loss',
      'hopeless', 'overthinking',
    ],
  },
  {
    specialty: 'ENT',
    urgency: URGENCY.ROUTINE,
    conditions: ['Sinusitis', 'Pharyngitis', 'Otitis media'],
    keywords: [
      'ear', 'hearing', 'sore throat', 'throat pain', 'sinus', 'nose', 'nasal',
      'blocked nose', 'runny nose', 'tonsil', 'voice', 'hoarse', 'snoring',
      'vertigo', 'tinnitus',
    ],
  },
  {
    specialty: 'Pediatrics',
    urgency: URGENCY.ROUTINE,
    conditions: ['Viral fever', 'Childhood infection'],
    keywords: [
      'my child', 'my son', 'my daughter', 'baby', 'infant', 'toddler',
      'newborn', 'vaccination', 'year old child', 'kid has',
    ],
  },
  {
    specialty: 'Gynaecology',
    urgency: URGENCY.ROUTINE,
    conditions: ['Menstrual irregularity', 'PCOS'],
    keywords: [
      'period', 'menstrual', 'menstruation', 'pregnan', 'vaginal', 'uterus',
      'ovary', 'pcos', 'menopause', 'contracept', 'breast lump',
    ],
  },
  {
    specialty: 'General Physician',
    urgency: URGENCY.ROUTINE,
    conditions: ['Viral infection', 'Gastritis', 'Dehydration'],
    keywords: [
      'fever', 'cough', 'cold', 'headache', 'tired', 'fatigue', 'vomit',
      'nausea', 'diarrhoea', 'diarrhea', 'stomach', 'abdominal', 'weakness',
      'dizzy', 'body ache', 'sugar', 'diabetes', 'thyroid', 'weight loss',
    ],
  },
];

/** Words that push the urgency up a notch without being red flags. */
const CONCERNING = [
  { pattern: /\b(severe|unbearable|excruciating|worst)\b/i, bump: 1 },
  { pattern: /\b(getting worse|worsening|spreading rapidly)\b/i, bump: 1 },
  { pattern: /\b(\d+)\s*(days|weeks)\b/i, bump: 0 },
  { pattern: /\bhigh fever\b|\b10[3-9]\s*°?f\b|\b4[01]\s*°?c\b/i, bump: 1 },
];

const URGENCY_STEPS = [URGENCY.SELF_CARE, URGENCY.ROUTINE, URGENCY.URGENT, URGENCY.EMERGENCY];

/**
 * Scores the text against each specialty's keyword list and returns the best
 * match. Deliberately simple and completely predictable — its job is to be
 * available, not clever.
 */
export function ruleBasedCheck(text = '') {
  const lower = text.toLowerCase();

  const scored = SPECIALTY_RULES.map((rule) => ({
    ...rule,
    score: rule.keywords.reduce(
      (total, keyword) => (lower.includes(keyword) ? total + 1 : total),
      0
    ),
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];

  // Nothing recognised — send them to a general physician rather than
  // guessing at a specialty from no evidence.
  if (!best || best.score === 0) {
    return {
      source: 'rules',
      suggestedSpecialty: 'General Physician',
      urgency: URGENCY.ROUTINE,
      possibleConditions: [],
      advice:
        'Your description did not match any specific pattern we recognise. '
        + 'A general physician is the right first stop — they can examine you and refer you onward if needed.',
      matchedKeywords: 0,
    };
  }

  let urgencyIndex = URGENCY_STEPS.indexOf(best.urgency);
  for (const { pattern, bump } of CONCERNING) {
    if (bump > 0 && pattern.test(text)) urgencyIndex = Math.min(urgencyIndex + bump, 2);
  }

  return {
    source: 'rules',
    suggestedSpecialty: best.specialty,
    urgency: URGENCY_STEPS[urgencyIndex],
    possibleConditions: best.conditions.slice(0, 3),
    // Phrased around the department rather than the practitioner: "a
    // cardiology deals with" reads as broken English, and pluralising
    // specialty names correctly ("Cardiology" → "cardiologist",
    // "ENT" → "ENT specialist") is not worth the special-casing.
    advice:
      `Your symptoms most closely match the kind of problem seen in ${best.specialty}. `
      + 'This is a keyword-based suggestion, not a diagnosis — book a consultation so a doctor can assess you properly.',
    matchedKeywords: best.score,
  };
}

export const KNOWN_SPECIALTIES = SPECIALTY_RULES.map((r) => r.specialty);
